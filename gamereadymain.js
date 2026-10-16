// ▶ Play, got ready (round 52, gameready): the main process' part. Loaded on first use (main.js lazyIpc; main.js names
// the hearth-game scheme itself before Electron is ready, so nothing loads at the start).
//   gameready:hash      [path] → [{ path, hash, size }] (SHA-1 of the bytes; remembered per path + size + date)
//   gameready:plan      { files: [{ path, hash }] } → { fresh, stale, missing, map }: what Hearth's cache has for them
//   gameready:tool      { path? } → the encoder found (gltfpack: PATH, npm's global folder) or the install plan
//   gameready:install   runs the shown install command in a visible Terminal / PowerShell window (only after a click)
//   gameready:optimize  { files, kind, ctx } → optimized copies written into Hearth's cache only, stale ones to the Trash,
//                       the cache kept under its cap (4 GB / 200 copies, least recently used first)
//   gameready:open-html { path, title, map } → a game window for an HTML build (when ▶ Play's own window isn't there):
//                       hearth-game://game/<file> serves the build's folder read-only, with the optimized copies swapped
//                       in by URL (the rewrite map) and gameready-page.js put in front of the game's own scripts
//   gameready:to / gameready:from   messages between the hub and that page (tools/gameready-page.js)
// The owner's files are only ever read. Everything written goes in <data>/game-cache.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./tools/gameready-core');

const SCHEME = 'hearth-game';
const PARTITION = 'persist:hearth-game'; // persistent: Chromium keeps this window's compiled shaders on disk between launches

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
  try { await require('electron').shell.trashItem(file); return true; } catch {
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

// ---------- the HTML game window ----------
const games = new Map(); // webContents id → { root, map }
let gameWin = null;
function contentType(p) {
  const e = C.extOf(p);
  return ({ html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', ktx2: 'image/ktx2', glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', wasm: 'application/wasm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', hdr: 'application/octet-stream', exr: 'application/octet-stream' })[e] || 'application/octet-stream';
}
const PAGE = '__gameready-page.js';
let served = false;
function serve(ses) {
  if (served) return; served = true;
  ses.protocol.handle(SCHEME, async (req) => {
    const u = new URL(req.url);
    const g = [...games.values()].find((x) => x.host === u.host);
    if (u.pathname === `/${PAGE}`) return new Response(fs.readFileSync(path.join(appDir, 'tools', 'gameready-page.js')), { headers: { 'content-type': 'text/javascript' } });
    if (!g) return new Response('no game', { status: 404 });
    let rel; try { rel = decodeURIComponent(u.pathname).replace(/^\/+/, ''); } catch { return new Response('bad path', { status: 400 }); }
    const file = path.resolve(g.root, rel || 'index.html');
    if (!file.startsWith(path.resolve(g.root) + path.sep) && file !== path.resolve(g.root)) return new Response('outside the game', { status: 403 });
    const swap = C.rewrite(g.map, file, process.platform);
    const real = swap && fs.existsSync(swap) ? swap : file;
    g.served.push({ rel, swapped: Boolean(swap && real === swap) });
    if (g.served.length > 2000) g.served.shift();
    let buf; try { buf = fs.readFileSync(real); } catch { return new Response('not found', { status: 404 }); }
    if (/\.html?$/i.test(file)) {
      // the preparing page goes first, before the game's own scripts (a classic script: it runs before any module)
      let s = buf.toString('utf8'); const tag = `<script src="/${PAGE}"></script>`;
      s = /<head[^>]*>/i.test(s) ? s.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${s}`;
      return new Response(s, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return new Response(buf, { headers: { 'content-type': contentType(real) } });
  });
}
function openHtml({ path: file, title = 'Game', map = {}, width = 1280, height = 720, show = true } = {}) {
  const { BrowserWindow, session } = require('electron');
  const root = fs.statSync(file).isDirectory() ? file : path.dirname(file);
  const entry = fs.statSync(file).isDirectory() ? 'index.html' : path.basename(file);
  const ses = session.fromPartition(PARTITION);
  serve(ses);
  if (gameWin && !gameWin.isDestroyed()) gameWin.destroy();
  const w = gameWin = new BrowserWindow({ width, height, useContentSize: true, title, backgroundColor: '#000000', autoHideMenuBar: true, show,
    webPreferences: { partition: PARTITION, preload: path.join(appDir, 'gameready-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const host = `g${w.webContents.id}`;
  games.set(w.webContents.id, { host, root, map: map || {}, served: [] });
  w.on('closed', () => { games.delete(w.webContents.id); if (gameWin === w) gameWin = null; send('gameready:from', { type: 'game-closed' }); });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.loadURL(`${SCHEME}://${host}/${entry.split('/').map(encodeURIComponent).join('/')}`);
  return { ok: true, id: w.webContents.id, url: `${SCHEME}://${host}/${entry}`, root, host };
}
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
  ipcMain.handle('gameready:open-html', async (_e, args) => openHtml(args || {}));
  ipcMain.handle('gameready:close-html', async () => { if (gameWin && !gameWin.isDestroyed()) gameWin.close(); return true; });
  ipcMain.handle('gameready:served', async () => (gameWin && !gameWin.isDestroyed() ? games.get(gameWin.webContents.id)?.served || [] : []));
  ipcMain.on('gameready:to', (_e, msg) => { if (gameWin && !gameWin.isDestroyed()) gameWin.webContents.send('gameready:to', msg); });
  ipcMain.on('gameready:from', (_e, msg) => send('gameready:from', msg));
}

module.exports = { register, SCHEME, PARTITION, _test: { plan, optimize, readIndex, hashFile, findTool, setDir: (d) => { dataDir = d; index = null; indexBad = false; } } };
