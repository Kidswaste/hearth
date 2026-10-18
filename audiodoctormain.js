// (round 64, audiodoctor64) /audio doctor, the main-process side (docs/upgrades/audiodoctor64.md).
// Checks the owner's music setup on their own PC, only when asked (lazyIpc: nothing loads or runs at startup):
//   probe  the Sound desk's private runtime (python + Pedalboard / numpy / sounddevice), which PortAudio DLL loaded
//          (ASIO or plain), every device, MIDI inputs — creative-vst-doctor.py in a disposable process with the same
//          SD_ENABLE_ASIO switch as the live host; if an ASIO driver takes that process down, it runs again without ASIO
//          and says so. Serum 2 / Vital found by the desk's own scan (creative-vstmain create().scan: file names only,
//          no plugin runs for it), then each loaded in ITS OWN process (a crashing plugin can't take the others down).
//          The Sound bank's preset folders (soundbankmain.defaultFolders + the folders added in it), ffmpeg.
//   live   the 2-second test on one output (Vital or a quiet sine), timing every callback; loopback: a click heard back.
//   open   opens a plugin / preset folder the last probe listed (nothing else) in Explorer / Finder.
// It writes nothing outside a temporary folder of its own, which it removes.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn, execFile } = require('child_process');
const HELPER = path.join(__dirname, 'creative-vst-doctor.py');
const PINNED = { pedalboard: '0.9.26', numpy: '2.5.4', sounddevice: '0.5.6' }; // what Set up live audio installs (creative-vstmain setup)

// The runtime the Sound desk uses: HEARTH_VST_PYTHON, else <data>/creative-vst/runtime (creative-vstmain.create's rule)
function runtimeOf({ dataDir, python, env = process.env, platform = process.platform }) {
  const bin = python || env.HEARTH_VST_PYTHON || path.join(dataDir, 'creative-vst', 'runtime', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return { bin, exists: fs.existsSync(bin), override: !!(python || env.HEARTH_VST_PYTHON) };
}

// One helper run: the request travels as an argument, the answer in a file of a fresh temp folder (removed after).
// A process that dies (an ASIO driver, a plugin) answers { ok: false, crashed: true, … } instead of throwing.
function runHelper({ bin, job, asio, timeout = 30000, env = process.env, helper = HELPER }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-audiodoctor-')), answer = path.join(dir, 'answer.json');
  const childEnv = { ...env, PYTHONDONTWRITEBYTECODE: '1' }; if (asio) childEnv.SD_ENABLE_ASIO = '1'; else delete childEnv.SD_ENABLE_ASIO;
  return new Promise(resolve => {
    let stderr = '', done = false;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a file still held a moment on Windows */ } resolve(r); };
    let child;
    try { child = spawn(bin, [helper, JSON.stringify(job), answer], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: childEnv }); } catch (e) { finish({ ok: false, error: e.message, crashed: true }); return; }
    const timer = setTimeout(() => { child.kill(); finish({ ok: false, error: `No answer within ${Math.round(timeout / 1000)} s.`, timedOut: true }); }, timeout);
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-1500); });
    child.once('error', e => finish({ ok: false, error: e.message, crashed: true }));
    child.once('close', code => {
      let text = null; try { text = fs.readFileSync(answer, 'utf8'); } catch { /* it died before answering */ }
      const parsed = text ? parseAnswer(text) : null;
      finish(parsed || { ok: false, crashed: true, code, error: `The check process stopped (exit ${code}).${stderr.trim() ? ' ' + stderr.trim().split('\n').slice(-2).join(' ').slice(0, 400) : ''}` });
    });
  });
}
const parseAnswer = text => { try { return JSON.parse(text); } catch { return null; } };

// Python on the computer itself (what "Set up live audio" builds the runtime from): py -3 on Windows, python3 elsewhere
function systemPython(platform = process.platform) {
  const [cmd, args] = platform === 'win32' ? ['py', ['-3', '-c', 'import sys,struct;print(sys.version.split()[0], struct.calcsize("P")*8)']] : ['python3', ['-c', 'import sys,struct;print(sys.version.split()[0], struct.calcsize("P")*8)']];
  return new Promise(resolve => execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, out) => {
    if (err) { resolve({ found: false, command: cmd }); return; }
    const [version, bits] = String(out).trim().split(/\s+/); resolve({ found: true, command: cmd, version, bits: Number(bits) });
  }));
}
const supported = v => { const [a, b] = String(v || '').split('.').map(Number); return a === 3 && b >= 10 && b <= 14; };

// The Sound bank's folders: the plugins' default user preset folders + the ones added in the bank (read, never written)
function presetFolders(dataDir, { defaults } = {}) {
  let list = []; try { list = (defaults || require('./soundbankmain.js').defaultFolders)(); } catch { /* no bank here */ }
  let added = []; try { added = parseAnswer(fs.readFileSync(path.join(dataDir, 'creative-vst', 'soundbank', 'index.json'), 'utf8'))?.settings?.folders || []; } catch { /* no bank index yet */ }
  const all = [...list, ...added.filter(p => typeof p === 'string' && path.isAbsolute(p)).map(p => ({ path: p, instrument: null, mine: true }))];
  return all.map(f => ({ ...f, exists: isDir(f.path), presets: isDir(f.path) ? countPresets(f.path) : 0 }));
}
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
function countPresets(dir, depth = 0, seen = { n: 0 }) {
  if (depth > 6 || seen.n >= 2000) return seen.n;
  let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return seen.n; }
  for (const e of entries) { if (seen.n >= 2000) break; if (e.isDirectory() && !e.isSymbolicLink()) countPresets(path.join(dir, e.name), depth + 1, seen); else if (/\.(vital|serumpreset)$/i.test(e.name)) seen.n++; }
  return seen.n;
}

// Everything but the live test. o: { dataDir, python, roots (the desk's extra folders), asio, platform, ffmpeg() }
async function probe(o = {}) {
  const platform = o.platform || process.platform, runtime = runtimeOf(o);
  const vst = require('./creative-vstmain.js');
  const scan = vst.create({ dataDir: o.dataDir, python: runtime.bin, roots: o.pluginRoots }).scan(Array.isArray(o.roots) ? o.roots.filter(r => typeof r === 'string' && path.isAbsolute(r)).slice(0, 12) : []);
  const report = { at: Date.now(), platform, asioSwitch: o.asio !== false, runtime: { bin: runtime.bin, exists: runtime.exists, override: runtime.override }, pinned: PINNED,
    pluginRoots: scan.ok ? scan.roots.map(p => ({ path: p, exists: isDir(p) })) : [], plugins: [], presetFolders: presetFolders(o.dataDir, o), ffmpeg: null };
  try { report.ffmpeg = (o.ffmpeg ? o.ffmpeg() : null) || null; } catch { report.ffmpeg = null; }
  if (!runtime.exists) { report.system = await systemPython(platform); report.system.supported = report.system.found && supported(report.system.version) && report.system.bits === 64; }
  else {
    let p = await runHelper({ bin: runtime.bin, job: { action: 'probe' }, asio: report.asioSwitch, env: o.env, timeout: 40000 });
    if (!p.ok && report.asioSwitch && (p.crashed || p.timedOut)) { // an ASIO driver took the process down while listing: once more without ASIO
      const again = await runHelper({ bin: runtime.bin, job: { action: 'probe' }, asio: false, env: o.env, timeout: 40000 });
      if (again.ok) { p = again; report.asioCrash = true; }
    }
    report.probe = p;
    try { report.picked = pick(p); } catch { report.picked = null; }
  }
  const allowed = new Map((scan.ok ? scan.plugins : []).map(x => [x.name, x])); // the first Serum 2 / Vital the desk lists
  for (const name of ['Serum 2', 'Vital']) {
    const found = allowed.get(name), row = { name, found: !!found, path: found?.path || null };
    if (found && report.probe?.ok && o.loadPlugins !== false) row.load = await runHelper({ bin: runtime.bin, job: { action: 'plugin', plugin: found.path, name }, asio: false, env: o.env, timeout: 90000 });
    report.plugins.push(row);
  }
  return report;
}

// The output the live test uses: the Sound desk's remembered device (by name, ids change), else its own preselection
// (tools/workbench-vst-live.js options(): the UA on ASIO › the UA on WASAPI exclusive › the Windows default).
function pick(p, saved) {
  if (!p?.ok) return null;
  const L = require('./tools/workbench-vst-live.js'), list = { devices: (p.devices || []).filter(d => d.outputs >= 2), asio: (p.hostApis || []).includes('ASIO') };
  const def = list.devices.find(d => d.api === 'Windows WASAPI' && p.defaultOutput && d.name.startsWith(String(p.defaultOutput).trim()));
  list.preferred = def ? def.id : null;
  const opts = L.options(list), fromDesk = L.resolve(saved, list), value = fromDesk ?? opts.preferred;
  const label = (opts.options.find(([v]) => v === value) || [, 'System output (default)'])[1];
  return { value, label, fromDesk: fromDesk != null, ...L.parse(value), hasUA: opts.hasUA, asioDevices: opts.asioDevices, uaValue: opts.preferred };
}

async function live(o = {}) {
  const runtime = runtimeOf(o);
  if (!runtime.exists) return { ok: false, error: 'Set up live audio first (the private runtime isn\'t installed).' };
  const job = { action: 'live', device: Number.isInteger(o.device) ? o.device : null, exclusive: o.exclusive === true, buffer: [64, 128, 256, 512, 1024].includes(o.buffer) ? o.buffer : 256, seconds: 2, loopback: o.loopback === true };
  if (o.plugin && !o.loopback) {
    const vst = require('./creative-vstmain.js');
    const scan = vst.create({ dataDir: o.dataDir, python: runtime.bin, roots: o.pluginRoots }).scan(Array.isArray(o.roots) ? o.roots.filter(r => typeof r === 'string' && path.isAbsolute(r)).slice(0, 12) : []);
    const found = scan.ok && scan.plugins.find(p => p.name === o.plugin); // only a Serum 2 / Vital the desk's scan found
    if (found) Object.assign(job, { plugin: found.path, name: found.name });
  }
  return runHelper({ bin: runtime.bin, job, asio: o.asio !== false, env: o.env, timeout: 40000 });
}

function register(ipcMain, { dataDir, getWin, settings }) {
  let last = null; // the folders the last probe listed: the only ones "open" opens
  const own = (e, fn) => { if (e.sender !== getWin()?.webContents || e.senderFrame !== e.sender.mainFrame) return { ok: false, error: 'Only the Hearth workspace can run the audio doctor.' }; return Promise.resolve().then(fn).catch(err => ({ ok: false, error: err.message })); };
  const asio = () => process.env.HEARTH_VST_ASIO !== '0' && settings?.().vstAsio !== false;
  const ffmpeg = () => require('./aemain').ffStatus({ ffmpeg: settings?.().ffmpegPath || undefined }).ffmpeg;
  ipcMain.handle('audiodoctor:probe', (e, o) => own(e, async () => { const r = await probe({ dataDir, roots: o?.roots, asio: asio(), ffmpeg, loadPlugins: o?.loadPlugins !== false });
    if (r.probe?.ok && o?.saved) r.picked = pick(r.probe, o.saved) || r.picked; last = r; return { ok: true, ...r }; }));
  ipcMain.handle('audiodoctor:live', (e, o) => own(e, () => live({ dataDir, roots: o?.roots, asio: asio(), device: o?.device, exclusive: o?.exclusive, buffer: o?.buffer, plugin: o?.plugin, loopback: o?.loopback })));
  ipcMain.handle('audiodoctor:open', (e, p) => own(e, async () => {
    const ok = last && [...last.pluginRoots, ...last.presetFolders].some(f => f.path === p) && isDir(p);
    if (!ok) return { ok: false, error: 'That folder isn\'t one the audio doctor listed (or it doesn\'t exist).' };
    const err = await require('electron').shell.openPath(p); return err ? { ok: false, error: err } : { ok: true };
  }));
}
module.exports = { register, probe, live, pick, runtimeOf, runHelper, presetFolders, systemPython, supported, PINNED };
