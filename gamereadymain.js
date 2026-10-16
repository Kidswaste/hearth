// ▶ Play, got ready (round 52, gameready): the main process' part. Loaded on first use (main.js lazyIpc; main.js names
// the hearth-game scheme itself before Electron is ready, so nothing loads at the start).
//   gameready:hash      [path] → [{ path, hash, size }] (SHA-1 of the bytes; remembered per path + size + date)
//   gameready:plan      { files: [{ path, hash }] } → { fresh, stale, missing, map }: what Hearth's cache has for them
//   gameready:tool      { path? } → the encoder found (gltfpack: PATH, npm's global folder) or the install plan
//   gameready:install   runs the shown install command in a visible Terminal / PowerShell window (only after a click)
//   gameready:optimize  { files, kind, ctx } → optimized copies written into Hearth's cache only, stale ones to the Trash,
//                       the cache kept under its cap (4 GB / 200 copies, least recently used first)
//   gameready:arm       { kind, title, map, noPrep, opt } | null → the next ▶ Play window (gamemodemain.js) serves the
//                       optimized copies for their originals' addresses (the rewrite map) and runs tools/gameready-page.js
//                       first in the game's page (it prepares inside that window, behind its card)
//   gameready:served    what that window was served (its files: the next launch's scan)
// The owner's files are only ever read. Everything written goes in <data>/game-cache.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./tools/gameready-core');


let dataDir = null; let getWin = () => null; let appDir = __dirname;
const cacheDir = () => path.join(dataDir, 'game-cache');
const indexFile = () => path.join(cacheDir(), 'index.json');
let index = null; let indexBad = false;
function readIndex() {
  if (index) return index;
  // datasafe's read: missing → a new cache; unreadable → never written over, nothing deleted
  const r = require('./datasafe-core').load(fs, indexFile(), null);
  if (r.state === 'unreadable' || (r.value && !r.value.entries)) indexBad = true;
  index = r.value?.entries ? r.value : { v: 1, entries: {} };
  return index;
}
function saveIndex() {
  if (indexBad) return false;
  fs.mkdirSync(cacheDir(), { recursive: true });
  try { require('./crashsafe-core').writeAtomicSync(fs, indexFile(), JSON.stringify(index)); } catch { fs.writeFileSync(indexFile(), JSON.stringify(index)); }
  return true;
}

// ---------- hashes ----------
const memo = new Map(); // path → { size, mtime, hash }
function hashFile(p) {
  return new Promise((resolve) => {
    let st; try { st = fs.statSync(p); } catch { resolve({ path: p, missing: true }); return; }
    const m = memo.get(p);
    if (m && m.size === st.size && m.mtime === st.mtimeMs) { resolve({ path: p, hash: m.hash, size: st.size }); return; }
    const h = crypto.createHash('sha1');
    fs.createReadStream(p).on('data', (d) => h.update(d)).on('error', () => resolve({ path: p, missing: true })).on('end', () => {
      const hash = h.digest('hex'); memo.set(p, { size: st.size, mtime: st.mtimeMs, hash });
      if (memo.size > 2000) memo.delete(memo.keys().next().value);
      resolve({ path: p, hash, size: st.size });
    });
  });
}

// ---------- the encoder ----------
const IS_WIN = process.platform === 'win32';
function npmBin() {
  const env = process.env;
  if (IS_WIN) return path.join(env.APPDATA || '', 'npm');
  for (const d of [env.npm_config_prefix && path.join(env.npm_config_prefix, 'bin'), '/opt/homebrew/bin', '/usr/local/bin', path.join(require('os').homedir(), '.npm-global', 'bin')]) if (d && fs.existsSync(path.join(d, 'gltfpack'))) return d;
  return null;
}
function findTool(override) {
  const names = IS_WIN ? ['gltfpack.exe', 'gltfpack.cmd'] : ['gltfpack'];
  const dirs = [...(override ? [path.dirname(override)] : []), ...String(process.env.PATH || '').split(path.delimiter), npmBin()].filter(Boolean);
  if (override && fs.existsSync(override)) return override;
  for (const d of dirs) for (const n of names) { const f = path.join(d, n); try { if (fs.statSync(f).isFile()) return f; } catch { /* not here */ } }
  return null;
}
function run(bin, args, ms = 300000) {
  return new Promise((resolve) => {
    let sp; try { sp = (() => { try { return require('./winpolish').spawn; } catch { return require('child_process').spawn; } })(); } catch { sp = require('child_process').spawn; }
    let out = ''; const ch = sp(bin, args, { windowsHide: true });
    const t = setTimeout(() => { try { ch.kill(); } catch { /* gone */ } }, ms);
    ch.stdout?.on('data', (d) => { out += d; if (out.length > 20000) out = out.slice(-20000); });
    ch.stderr?.on('data', (d) => { out += d; if (out.length > 20000) out = out.slice(-20000); });
    ch.on('error', (err) => { clearTimeout(t); resolve({ code: -1, out: err.message }); });
    ch.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}
let toolInfo = null;
async function tool(override) {
  const bin = findTool(override);
  if (!bin) return { found: false, plan: C.installPlan(process.platform) };
  if (toolInfo?.bin === bin) return toolInfo;
  const v = await run(bin, ['-v'], 15000);
  toolInfo = { found: true, bin, version: (String(v.out).match(/gltfpack\s+([\d.]+)/) || [])[1] || '', textures: null };
  return toolInfo;
}

// ---------- the cache ----------
async function trash(file) {
  // (round 53, diskcalm) platform46's no-bin check first: on a network share (a USB stick on Windows) the copy stays
  const binCheck = process.platform === 'win32' ? require('./winpolish').trashCheck(file, { platform: 'win32' }) : process.platform === 'darwin' ? require('./macpolish').trashCheck(file, { platform: 'darwin' }) : { ok: true };
  if (!binCheck.ok) return false;
  try { await require('electron').shell.trashItem(binCheck.path || file); return true; } catch {
    // (no desktop Trash: test machines) a file Hearth made in its own cache folder only
    if (path.resolve(file).startsWith(path.resolve(cacheDir()) + path.sep)) { try { fs.rmSync(file, { force: true }); return true; } catch { /* below */ } }
    return false;
  }
}
async function drop(entries) {
  const I = readIndex(); const gone = [];
  for (const e of entries) { if (e.out && fs.existsSync(e.out) && !(await trash(e.out))) continue; delete I.entries[e.key]; gone.push(e.key); }
  if (gone.length) saveIndex();
  return gone;
}
async function plan(files) {
  const I = readIndex();
  // an entry whose file went missing is not fresh
  for (const [k, e] of Object.entries(I.entries)) if (e.out && !fs.existsSync(e.out)) delete I.entries[k];
  const r = C.check(I, files, {}, process.platform);
  const now = Date.now(); for (const e of r.fresh) if (I.entries[e.key]) I.entries[e.key].used = now;
  if (r.fresh.length) saveIndex();
  return { ...r, map: C.rewriteMap(I, files, {}, process.platform), bad: indexBad, dir: cacheDir() };
}
async function optimize({ files = [], kind = 'lab', ctx = {}, toolPath = null } = {}, progress = () => {}) {
  const T = await tool(toolPath);
  if (!T.found) return { ok: false, needTool: true, plan: T.plan };
  if (indexBad) return { ok: false, error: 'Hearth\'s game cache index couldn\'t be read: nothing was changed' };
  const I = readIndex();
  const p0 = await plan(files);
  const stale = await drop(p0.stale); // made from an older version of the same file: to the Trash
  const made = []; const skipped = []; const failed = [];
  const todo = p0.missing.filter((f) => { const ok = C.canOptimize(f, { kind, ...ctx }); if (!ok.ok) skipped.push({ path: f.path, why: ok.why }); return ok.ok; });
  fs.mkdirSync(path.join(cacheDir(), 'files'), { recursive: true });
  for (const [i, f] of todo.entries()) {
    progress({ done: i, total: todo.length, path: f.path });
    const key = C.entryKey(f);
    const out = path.join(cacheDir(), 'files', `${key}.glb`);
    const tmp = `${out}.part.glb`;
    const can = C.canOptimize(f, { kind, ...ctx });
    let r = { code: 1 }; let textures = false;
    if (can.textures && T.textures !== false) { r = await run(T.bin, C.gltfpackArgs(f.path, tmp, { textures: true })); textures = r.code === 0; if (r.code !== 0 && /BasisU|texture compression/i.test(r.out)) T.textures = false; }
    if (r.code !== 0) r = await run(T.bin, C.gltfpackArgs(f.path, tmp, { textures: false }));
    if (r.code !== 0 || !fs.existsSync(tmp)) { failed.push({ path: f.path, error: String(r.out || '').trim().split('\n').pop().slice(0, 200) }); try { fs.rmSync(tmp, { force: true }); } catch { /* none */ } continue; }
    const bytes = fs.statSync(tmp).size;
    // bigger than the original (already compressed): not kept, the original stays in use
    if (bytes >= (f.size || Infinity)) { fs.rmSync(tmp, { force: true }); skipped.push({ path: f.path, why: 'already as small as it gets' }); continue; }
    fs.renameSync(tmp, out);
    I.entries[key] = { src: f.path, hash: f.hash, out, bytes, srcBytes: f.size || 0, at: Date.now(), used: Date.now(), tool: `gltfpack ${T.version}`, textures };
    made.push({ path: f.path, out, bytes, srcBytes: f.size || 0, textures });
    saveIndex();
  }
  progress({ done: todo.length, total: todo.length });
  const keep = Object.keys(C.rewriteMap(I, files, {}, process.platform)).length ? (await plan(files)).fresh.map((e) => e.key) : [];
  const capped = await drop(C.over(I, { keep }));
  return { ok: true, made, skipped, failed, stale, capped, textures: T.textures !== false, tool: T, ...(await plan(files)) };
}

// ---------- ▶ Play's window (gamemodemain.js serves it; GameReady arms it for one game) ----------
// armed = { kind, title, map, noPrep, opt, served: [] }: gamemodemain's hearth-game: handler asks swapFor(file) (an
// optimized copy is served for the original's address / copied into a Lab scene's page) and pageTag(file) (the
// preparing script, first in every HTML page of the game); what it served is noted for the next launch's scan
let armed = null;
const PAGE = '__gameready-page.js';
function swapFor(file) {
  if (!armed) return null;
  const swap = C.rewrite(armed.map, file, process.platform);
  return swap && fs.existsSync(swap) ? swap : null;
}
function noteServed(rel, swapped) { if (!armed) return; armed.served.push({ rel, swapped: Boolean(swapped) }); if (armed.served.length > 2000) armed.served.shift(); }
function pageTag() {
  if (!armed) return '';
  const q = new URLSearchParams({ t: String(armed.title || '').slice(0, 60), k: armed.kind === 'lab' ? 'lab' : 'html', ...(armed.noPrep ? { np: '1' } : {}), ...(armed.opt ? { opt: String(armed.opt) } : {}) });
  return `<script src="/${PAGE}?${q}"></script>`;
}
// the script itself (asked for by the tag above, on the game's own address: nothing of the game is changed on disk)
const pageFile = () => path.join(appDir, 'tools', 'gameready-page.js');
const isPage = (pathname) => pathname === `/${PAGE}`;
const send = (ch, msg) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, msg); };

function register(ipcMain, o = {}) {
  dataDir = o.dataDir || path.join(__dirname, 'data'); getWin = o.getWin || getWin; appDir = o.appDir || __dirname;
  ipcMain.handle('gameready:hash', async (_e, paths) => Promise.all((paths || []).slice(0, 2000).map((p) => hashFile(String(p)))));
  ipcMain.handle('gameready:plan', async (_e, { files } = {}) => plan(files || []));
  ipcMain.handle('gameready:tool', async (_e, { path: p } = {}) => tool(p || null));
  ipcMain.handle('gameready:install', async () => {
    const P = C.installPlan(process.platform);
    return { ...require('./installs').runInTerminal({ title: 'Installing gltfpack for Hearth', lines: [P.command] }), command: P.command };
  });
  ipcMain.handle('gameready:optimize', async (_e, args) => optimize(args || {}, (p) => send('gameready:progress', p)));
  // what an HTML game loaded last time (its warm run's files and decoders), kept with the cache: the next launch knows
  // its models before the game asks for them
  ipcMain.handle('gameready:scan', async (_e, { root, files, decoders } = {}) => {
    const I = readIndex(); I.scans ||= {}; const k = C.norm(root, process.platform);
    if (files) { I.scans[k] = { files: files.slice(0, 2000), decoders: decoders || [], at: Date.now() }; const ks = Object.keys(I.scans); if (ks.length > 50) delete I.scans[ks[0]]; saveIndex(); }
    return I.scans[k] || null;
  });
  ipcMain.handle('gameready:arm', async (_e, o) => { armed = o ? { kind: o.kind === 'html' ? 'html' : 'lab', title: String(o.title || ''), map: o.map || {}, noPrep: Boolean(o.noPrep), opt: Number(o.opt) || 0, served: [] } : null; return Boolean(armed); });
  ipcMain.handle('gameready:served', async () => armed?.served || []);
}

// (round 53, diskcalm) Free up moved the cache to the Trash: the index is read again (missing → a new cache)
const forget = () => { index = null; indexBad = false; memo.clear(); return true; };
module.exports = { register, swapFor, pageTag, isPage, pageFile, noteServed, forget, armed: () => armed, _test: { plan, optimize, readIndex, hashFile, findTool, setDir: (d) => { dataDir = d; index = null; indexBad = false; } } };
