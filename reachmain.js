// Reach (round 19), main side: paths a chat says or stores that belong to the other computer resolve to this one's,
// and what chats make opens for the owner (their browser / app, Finder / Explorer, or an in-app preview).
//   · localize(p): "/Users/x/Library/Application Support/Hearth/data/workspace/a/index.html" on Windows (or
//     "C:\Users\x\…\Hearth\data\…" on the Mac) → this computer's data folder. Sync's own path forms first (the other
//     computer's folders from its machine record, sync-merge.js), then any ".../Hearth/data/..." or ".../<data
//     folder's own top folders>/...", then the home folder.
//   · whether a file that isn't here yet is on its way (sync: the cloud copy or the other computer's journal).
//   · open: default app, the default browser (a page), reveal in the folder, or Preview: a sandboxed window (no Node,
//     no preload, its own session, local files only; links to the web open in the browser).
//   IPC: reach:resolve (items, { roots }) · reach:open ({ path | url, how }) · reach:info
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const S = require('./sync-merge');

let opts = { dataDir: path.join(__dirname, 'data'), syncmain: null };
const isWin = process.platform === 'win32';
const statOf = (p) => { try { return fs.statSync(p); } catch { return null; } };
const fwd = (s) => String(s).replace(/\\/g, '/');
const absLike = (s) => /^[A-Za-z]:[\\/]/.test(s) || /^\\\\[^\\]/.test(s) || s.startsWith('/');

// "file:///C:/x%20y/a.html" → "C:/x y/a.html", "file:///Users/x/a.html" → "/Users/x/a.html"
function unFile(s) {
  if (!/^file:/i.test(s)) return s;
  let p = s.replace(/^file:\/\/(localhost)?/i, '');
  try { p = decodeURIComponent(p); } catch { /* as it is */ }
  if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1);
  return p;
}
let topsAt = 0; let tops = new Set();
function dataTops() { // the data folder's own top folders (workspace, projects, chats…): a path through ".../data/<one>/" is ours
  if (Date.now() - topsAt < 60000) return tops;
  topsAt = Date.now();
  try { tops = new Set(fs.readdirSync(opts.dataDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase())); } catch { tops = new Set(); }
  for (const t of ['workspace', 'projects', 'attachments', 'captures', 'renders', 'chats', 'kv', 'refs', 'boards']) tops.add(t);
  return tops;
}
const join = (dir, rel) => path.join(dir, ...rel.split('/').filter(Boolean));

// (round 28, firstrun) folders the owner matched by hand in "Check this computer" (settings.reachFolders, kept on each
// computer): { "<the other computer's folder>": "<the same folder here>" }; the longest match wins, a path inside
// it follows ("/Users/x/Projects/a/b.js" → "D:\Work\a\b.js"); Windows-looking paths compare without case
function mapFolder(p, map) {
  if (!map || typeof map !== 'object') return null;
  const f = fwd(p).replace(/\/+$/, '');
  const winish = (s) => /^[A-Za-z]:\//.test(s) || s.startsWith('//');
  for (const from of Object.keys(map).sort((a, b) => b.length - a.length)) {
    const to = map[from];
    if (typeof to !== 'string' || !absLike(from) || !absLike(to)) continue;
    const k = fwd(from).replace(/\/+$/, '');
    const same = (a, b) => (winish(k) ? a.toLowerCase() === b.toLowerCase() : a === b);
    if (!k || f.length < k.length || !same(f.slice(0, k.length), k) || (f.length > k.length && f[k.length] !== '/')) continue;
    const rest = f.slice(k.length).replace(/^\//, '');
    return rest ? join(to, rest) : to;
  }
  return null;
}

// → { path, foreign, rel } (path: this computer's form; rel: inside the data folder, "/" separated) or null
function localize(input, o = {}) {
  let p = unFile(String(input || '').trim().replace(/^["'`<(]+|["'`>),.;:]+$/g, ''));
  if (!p || !absLike(p)) return null;
  const dataDir = o.dataDir || opts.dataDir;
  const relOf = (q) => { const r = path.relative(dataDir, q); return r && !r.startsWith('..') && !path.isAbsolute(r) ? fwd(r) : null; };
  if (statOf(p)) return { path: p, foreign: false, rel: relOf(p) };
  const mapped = mapFolder(p, o.map !== undefined ? o.map : opts.folderMap?.());
  if (mapped) return { path: mapped, foreign: true, rel: relOf(mapped) };
  // this computer's own path written with the other slashes ("C:/Users/…" is fine; "/C:/…" was handled above)
  const sctx = o.ctx !== undefined ? o.ctx : opts.syncmain?.pathCtx?.();
  if (sctx) {
    const c = S.strToCloud(p, sctx);
    if (c !== p && /^hearth-(data|home|cloud):\//.test(c)) {
      const back = S.strFromCloud(c, sctx);
      if (back && back !== p) return { path: back, foreign: true, rel: c.startsWith('hearth-data:/') ? c.slice('hearth-data:/'.length) : null };
    }
  }
  const f = fwd(p);
  // any Hearth data folder: ".../Hearth/data/<rel>" (also the name this one lives under, e.g. ".../Agent Hub/data/")
  const own = fwd(path.basename(path.dirname(dataDir))).toLowerCase();
  const low = f.toLowerCase();
  for (const key of [...new Set(['/hearth/data/', `/${own}/data/`])]) {
    const i = low.lastIndexOf(key);
    if (i >= 0) { const rel = f.slice(i + key.length); return { path: join(dataDir, rel), foreign: true, rel }; }
  }
  // ".../data/workspace/..." (a data folder somewhere else)
  const m = /\/data\/([^/]+)(\/.*)?$/i.exec(f);
  if (m && dataTops().has(m[1].toLowerCase())) { const rel = `${m[1]}${m[2] || ''}`; return { path: join(dataDir, rel), foreign: true, rel }; }
  // the other computer's home folder → this one's (Desktop, Documents, Downloads… usually exist on both)
  const h = /^(?:\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\/Users\/[^/]+)(\/.*)?$/i.exec(f);
  if (h) { const home = o.home || os.homedir(); const q = h[1] ? join(home, h[1]) : home; if (path.resolve(q) !== path.resolve(p)) return { path: q, foreign: true, rel: relOf(q) }; }
  return null;
}

// what the renderer gets for each item: where it is here, whether it exists, and if not, whether it is coming
function resolveOne(item, roots = []) {
  const raw = String(item || '').trim();
  if (!raw) return { input: raw, path: null, exists: false };
  if (/^https?:\/\//i.test(raw)) return { input: raw, url: raw, exists: true };
  let hit = null;
  const p = unFile(raw.replace(/^sandbox:/i, ''));
  if (absLike(p)) hit = localize(p);
  else {
    const rel = p.replace(/^\.?[\\/]/, '');
    for (const r of [...roots, path.join(opts.dataDir, 'workspace')]) {
      if (!r || !path.isAbsolute(r)) continue;
      const q = path.join(r, rel);
      if (statOf(q)) { hit = { path: q, foreign: false, rel: fwd(path.relative(opts.dataDir, q)) }; break; }
    }
  }
  if (!hit) return { input: raw, path: absLike(p) ? p : null, exists: false };
  const st = statOf(hit.path);
  const out = { input: raw, path: hit.path, foreign: hit.foreign, rel: hit.rel && !hit.rel.startsWith('..') ? hit.rel : null, exists: Boolean(st), isDir: Boolean(st?.isDirectory()), size: st?.size ?? null, mtime: st?.mtimeMs ?? null };
  if (!st && out.rel) {
    const sync = opts.syncmain?.status?.() || {};
    const inc = opts.syncmain?.incoming?.(out.rel);
    if (inc) out.waiting = { from: inc.from || 'your other computer' };
    else if (!sync.on) out.syncOff = true;
  }
  return out;
}

// ---------- the in-app preview: sandboxed, local files only ----------
const previews = new Map(); // file → window
function preview(file) {
  const { BrowserWindow, shell } = require('electron');
  const had = previews.get(file);
  if (had && !had.isDestroyed()) { had.webContents.reloadIgnoringCache(); had.show(); had.focus(); return true; }
  const w = new BrowserWindow({
    width: 1100, height: 760, title: `${path.basename(file)} · Preview`, autoHideMenuBar: true, backgroundColor: '#14121a', show: false,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, webviewTag: false, partition: 'reach-preview', spellcheck: false },
  });
  previews.set(file, w);
  w.on('closed', () => previews.delete(file));
  w.once('ready-to-show', () => w.show());
  setTimeout(() => { if (!w.isDestroyed() && !w.isVisible()) w.show(); }, 1500);
  const outward = (url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); };
  w.webContents.setWindowOpenHandler(({ url }) => { outward(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!/^file:/i.test(url)) { e.preventDefault(); outward(url); } });
  w.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  w.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    if (input.key === 'F5' || (mod && input.key.toLowerCase() === 'r')) { e.preventDefault(); w.webContents.reloadIgnoringCache(); }
    if (mod && input.key.toLowerCase() === 'w') { e.preventDefault(); w.close(); }
  });
  w.loadFile(file).catch(() => {});
  return true;
}

async function open({ path: p, url, how = 'default' } = {}) {
  const { shell } = require('electron');
  if (url && !p) {
    if (/^file:/i.test(url)) p = unFile(url);
    else if (/^https?:\/\//i.test(url)) { await shell.openExternal(url); return { ok: true, how: 'browser', url }; }
    else return { ok: false, error: 'Only web pages (http / https) and files on this computer can be opened.' };
  }
  const r = resolveOne(p);
  if (!r.exists) return { ok: false, ...r, error: r.waiting ? `${path.basename(r.path || p)} is still on its way from ${r.waiting.from} (sync).` : `${r.path || p} isn't on this computer.` };
  const file = r.path;
  if (how === 'reveal') { shell.showItemInFolder(file); return { ok: true, how, path: file }; }
  if (how === 'preview' && !r.isDir) { preview(file); return { ok: true, how, path: file }; }
  if (how === 'browser' && !r.isDir) { await shell.openExternal(pathToFileURL(file).href); return { ok: true, how, path: file }; }
  const err = await shell.openPath(file);
  return err ? { ok: false, error: err, path: file } : { ok: true, how: 'default', path: file };
}

function info() {
  const sync = opts.syncmain?.status?.() || {};
  const ctx = opts.syncmain?.pathCtx?.() || null;
  return { dataDir: opts.dataDir, workspace: path.join(opts.dataDir, 'workspace'), home: os.homedir(), win: isWin, sync: Boolean(sync.on), peers: (sync.peers || []).map((x) => ({ name: x.name, platform: x.platform })), otherData: ctx?.aliases?.data || [] };
}

function register(ipcMain, o = {}) {
  opts = { ...opts, ...o };
  ipcMain.handle('reach:resolve', (_e, items, ro = {}) => (Array.isArray(items) ? items : [items]).slice(0, 40).map((x) => resolveOne(x, (ro.roots || []).filter((r) => typeof r === 'string'))));
  ipcMain.handle('reach:open', (_e, a) => open(a || {}));
  ipcMain.handle('reach:info', () => info());
}

module.exports = { register, localize, resolveOne, unFile, mapFolder, _set: (o) => { opts = { ...opts, ...o }; topsAt = 0; } };
