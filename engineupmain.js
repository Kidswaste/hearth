// (round 177, engine177) The engine update, the main process (rules and words in engineup-core.js, the Settings line in
// engineup.js). Loaded on first use (main.js lazyIpc), and on Windows after the first screen only when a trial mark or an
// old engine is there (two stats otherwise).
//   state     the engine running (process.versions.electron), what engine.json approves for this computer, where a
//             download stands
//   get       on the click only: downloads the approved zip to a temp folder (progress to the window), checks its
//             SHA-256 against engine.json (a mismatch: removed, nothing used), then on Windows unpacks it beside the app as
//             electron-next\ (Agent Hub.cmd swaps it in at the next start, keeping electron-old\ for one start); on a Mac
//             it waits in the temp folder for the restart
//   restart   on the click only: Windows runs Agent Hub.cmd (it waits for Hearth to close, swaps, starts Hearth, rolls
//             back if the new engine's first start never reaches its first screen); the Mac runs mac/install-mac.sh with
//             the checked zip (it waits for Hearth to quit, rebuilds Hearth.app, the old one to the Trash, opens Hearth)
//   afterStart  Windows, after the first screen: a trial start confirmed (its mark removed); a later start removes the
//             engine kept from before (the only thing this ever deletes, and only after a start that worked)
// Never silent, never automatic, nothing downloads without a click. Tests: engineup:test (HEARTH_TEST_SAVE_DIR only).
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const Core = require('./engineup-core');

const TEST = Boolean(process.env.HEARTH_TEST_SAVE_DIR);
const W = Core.W;
let o = { getWin: () => null };
// tests: another app folder (a temp folder, never a real engine), the layout, the running version, the manifest's text,
// file:// stand-ins for the release URLs, and a restart that only says what it would run
let t = {};
const appDir = () => t.appDir || __dirname;
const running = () => t.running || process.versions.electron;
const platform = () => t.platform || process.platform;
const arch = () => t.arch || process.arch;
let job = null; // { phase: 'downloading' | 'checking' | 'unpacking' | 'ready' | 'error', got, total, version, zip, why, abort }
let after = null; // what afterStart did this start

function manifest() {
  try { return { m: Core.parseManifest(t.manifestText ?? fs.readFileSync(path.join(__dirname, 'engine.json'), 'utf8')) }; } catch (err) { return { m: null, err: err.message }; }
}
function layout() {
  if (t.layout) return t.layout;
  return Core.layoutOf({ platform: process.platform, execPath: process.execPath, appDir: __dirname, home: os.homedir(), exists: (p) => fs.existsSync(p), sep: path.sep });
}
function state() {
  const { m, err } = manifest();
  const lay = layout();
  const of = Core.offer({ manifest: m, running: running(), platform: platform(), arch: arch(), layout: lay });
  const win = lay === 'win-folder' ? Core.winState(fs, path, appDir()) : null;
  let phase = job?.phase || null;
  if (!phase && win?.next && of.next) phase = 'ready'; // a checked copy waits beside the app (unpacked only after its check)
  return {
    running: running(), chrome: process.versions.chrome, layout: lay, platform: platform(), next: of.next, why: of.why, newer: of.newer || null,
    manifestError: err || null, phase, got: job?.got || 0, total: job?.total || of.next?.size || 0, error: job?.phase === 'error' ? job.why : null,
    failedBack: Boolean(win?.failed), confirmed: Boolean(after?.confirmed),
  };
}
let sendT = 0;
function emit(now = false) {
  const go = () => { sendT = 0; const w = o.getWin(); if (w && !w.isDestroyed()) w.webContents.send('engineup:progress', state()); };
  if (now) { clearTimeout(sendT); go(); return; }
  if (!sendT) sendT = setTimeout(go, 250);
}
const plain = (why) => Object.assign(new Error(why), { plain: true });

// the zip, streamed to disk (Electron's own network stack: the computer's proxy and certificates)
async function fetchTo(url, file, onGot, signal) {
  const real = t.urls?.[url] || url;
  const out = fs.createWriteStream(file);
  const done = new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); });
  let got = 0;
  const write = async (chunk) => { got += chunk.length; onGot(got); if (!out.write(chunk)) await new Promise((r) => out.once('drain', r)); };
  try {
    if (TEST && real.startsWith('file://')) {
      for await (const chunk of fs.createReadStream(new URL(real))) { if (signal.aborted) throw plain('Stopped.'); await write(chunk); }
    } else {
      const { net } = require('electron');
      const r = await net.fetch(real, { signal });
      if (!r.ok) throw plain(`The download didn't start (the server said ${r.status}).`);
      const reader = r.body.getReader();
      for (;;) { const { done: end, value } = await reader.read(); if (end) break; await write(Buffer.from(value)); }
    }
  } catch (err) { out.destroy(); throw signal.aborted ? plain('Stopped: nothing was changed.') : err.plain ? err : plain(`The download stopped: ${err.message}`); }
  out.end();
  await done;
  return got;
}

async function get() {
  if (job && ['downloading', 'checking', 'unpacking'].includes(job.phase)) return state();
  const s = state();
  if (!s.next) throw plain('No engine update is approved for this computer.');
  const n = s.next;
  const ac = new AbortController();
  job = { phase: 'downloading', got: 0, total: n.size, version: n.version, abort: () => ac.abort() };
  emit(true);
  let tmp = null; const part = path.join(appDir(), W.PART);
  try {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hearth-engine-'));
    const zip = path.join(tmp, path.basename(new URL(n.url).pathname));
    await fetchTo(n.url, zip, (got) => { job.got = got; emit(); }, ac.signal);
    job.phase = 'checking'; emit(true);
    const sha = await Core.sha256File(fs, crypto, zip);
    if (!Core.same(sha, n.sha256)) throw plain('The download doesn\'t match the checksum Electron published, so Hearth didn\'t use it (it was removed). Nothing was changed.');
    if (s.layout === 'win-folder') {
      job.phase = 'unpacking'; emit(true);
      await fsp.rm(part, { recursive: true, force: true }); // (only ever an unfinished unpack of this)
      await require('./zipkit').extract(zip, part);
      if (!fs.existsSync(path.join(part, W.EXE))) throw plain('The download has no electron.exe in it, so Hearth didn\'t use it.');
      await fsp.rm(path.join(appDir(), W.NEXT), { recursive: true, force: true }); // an earlier checked copy of a waiting update
      await fsp.rename(part, path.join(appDir(), W.NEXT));
      await fsp.rm(tmp, { recursive: true, force: true }); tmp = null;
      job = { phase: 'ready', version: n.version };
    } else {
      job = { phase: 'ready', version: n.version, zip, sha: n.sha256, tmp }; tmp = null; // the Mac: install-mac.sh takes it at the restart
    }
  } catch (err) {
    job = { phase: 'error', why: err.plain ? err.message : `The engine update stopped: ${err.message}. Nothing was changed.` };
    await fsp.rm(part, { recursive: true, force: true }).catch(() => {});
  } finally {
    if (tmp) await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
  emit(true);
  return state();
}
function cancel() { if (job?.abort) job.abort(); return true; }

// what the restart runs (tests read it instead of running it)
function restartPlan() {
  const s = state();
  if (s.phase !== 'ready') return null;
  if (s.layout === 'win-folder') {
    const cmd = path.join(appDir(), 'Agent Hub.cmd');
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `""${cmd}""`], opts: { cwd: appDir(), detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true } };
  }
  if (s.layout === 'mac-app' && job?.zip) {
    return { file: '/bin/bash', args: [path.join(appDir(), 'mac', 'install-mac.sh')], opts: { cwd: appDir(), detached: true, stdio: 'ignore', env: { ...process.env, HEARTH_ELECTRON_ZIP: job.zip, HEARTH_ELECTRON_VERSION: job.version, HEARTH_ELECTRON_SHA256: job.sha, HEARTH_WAIT_QUIT: '1' } } };
  }
  return null;
}
function restart() {
  const p = restartPlan();
  if (!p) throw plain('Nothing is waiting to be put in place.');
  if (t.dryRestart) return { dry: true, file: p.file, args: p.args, cwd: p.opts.cwd, env: p.opts.env ? Object.fromEntries(Object.entries(p.opts.env).filter(([k]) => k.startsWith('HEARTH_ELECTRON') || k === 'HEARTH_WAIT_QUIT')) : null };
  const child = spawn(p.file, p.args, p.opts);
  child.unref();
  setTimeout(() => require('electron').app.quit(), 300);
  return { ok: true };
}
async function forgetFailed() {
  if (layout() !== 'win-folder') return false;
  for (const e of await fsp.readdir(appDir())) if (e === W.FAILED || e.startsWith(`${W.FAILED}-`)) await fsp.rm(path.join(appDir(), e), { recursive: true, force: true });
  emit(true);
  return true;
}
function afterStart() {
  if (layout() !== 'win-folder') return null;
  try { after = Core.winAfterStart(fs, path, appDir()); } catch (err) { console.warn('engine update: after the start', err.message); }
  return after;
}

async function testHook(op, arg = {}) {
  if (!TEST) throw new Error('Tests only');
  if (op === 'set') { t = { ...t, ...arg }; return true; }
  if (op === 'reset') { if (job?.tmp) await fsp.rm(job.tmp, { recursive: true, force: true }).catch(() => {}); t = {}; job = null; after = null; return true; }
  if (op === 'cmdText') return fs.readFileSync(path.join(__dirname, 'Agent Hub.cmd'), 'utf8');
  if (op === 'plan') return restartPlan();
  if (op === 'fixture') {
    // a pretend app folder in the temp folder (never a real engine): electron\electron.exe saying "old", Agent Hub.cmd,
    // and a pretend release zip (electron.exe saying "new" + 1.2 MB that doesn't compress) with its SHA-256
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'hearth-engine177-'));
    const dir = path.join(root, 'Hearth'); const src = path.join(root, 'zip-src');
    await fsp.mkdir(path.join(dir, W.CUR), { recursive: true });
    await fsp.writeFile(path.join(dir, W.CUR, W.EXE), 'old');
    await fsp.writeFile(path.join(dir, 'Agent Hub.cmd'), '@echo off\r\n');
    await fsp.mkdir(path.join(src, 'resources'), { recursive: true });
    await fsp.writeFile(path.join(src, W.EXE), arg.noExe ? 'x' : 'new');
    if (arg.noExe) await fsp.rename(path.join(src, W.EXE), path.join(src, 'other.exe'));
    await fsp.writeFile(path.join(src, 'resources', 'blob.bin'), crypto.randomBytes(1200 * 1024));
    const zip = path.join(root, 'electron-v99.0.0-win32-x64.zip');
    await require('./zipkit').writeZip(src, zip);
    const sha = await Core.sha256File(fs, crypto, zip);
    return { root, appDir: dir, zip, url: require('url').pathToFileURL(zip).href, sha, size: (await fsp.stat(zip)).size };
  }
  if (op === 'ls') {
    const out = {};
    for (const e of await fsp.readdir(appDir())) {
      const exe = path.join(appDir(), e, W.EXE);
      out[e] = fs.existsSync(exe) ? fs.readFileSync(exe, 'utf8') : fs.statSync(path.join(appDir(), e)).isDirectory() ? 'dir' : 'file';
      if (fs.existsSync(path.join(appDir(), e, W.TRIAL))) out[e] += ' +trial';
    }
    return out;
  }
  if (op === 'rmFixture') { if (/^hearth-engine177-/.test(path.basename(String(arg.root || ''))) && path.dirname(path.resolve(arg.root)) === path.resolve(os.tmpdir())) await fsp.rm(arg.root, { recursive: true, force: true }); return true; }
  if (op === 'launch') return Core.winLaunch(fs, path, appDir()); // Agent Hub.cmd's steps, on the test folder
  if (op === 'afterStart') { after = null; return afterStart(); }
  throw new Error(`no test op ${op}`);
}

function register(ipcMain, opts = {}) {
  o = { ...o, ...opts };
  ipcMain.handle('engineup:state', () => state());
  // (the download runs on; the window follows engineup:progress)
  // (refusals are answers, not thrown: { refused: why })
  ipcMain.handle('engineup:get', () => { if (!state().next) return { ...state(), refused: 'No engine update is approved for this computer.' }; get().catch(() => {}); return state(); });
  ipcMain.handle('engineup:cancel', () => cancel());
  ipcMain.handle('engineup:restart', () => { try { return restart(); } catch (err) { return { ok: false, refused: err.message }; } });
  ipcMain.handle('engineup:forget-failed', () => forgetFailed());
  ipcMain.handle('engineup:test', (_e, op, arg) => testHook(op, arg));
}

module.exports = { register, state, get, cancel, restart, afterStart };
