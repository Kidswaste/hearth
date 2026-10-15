// Two computers, main side (round 35, twocomputers): which computer this is (a stable id, its name, Mac / Windows PC),
// this computer's places (home, data folder, the cloud drives found here), and finding a media file again after a
// switch of computers (relink: its portable place, this computer's own links, then by name + size + quick hash in the
// usual media folders). Loaded on first use (main.js lazyIpc). Pure parts in twocomputers-core.js.
//   IPC: two:info · two:hash (path) · two:relink (ref) · two:link (ref, path) · two:exists (paths) · two:pickFile (o)
// The id is sync's own (data/sync/machine.json, never synced): made here in the same form when sync never ran, so
// sync adopts it later (and still gives a copied data folder its own id).
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const T = require('./twocomputers-core');

let o = { dataDir: path.join(__dirname, 'data'), syncmain: null, getWin: () => null, platform: process.platform, home: os.homedir() };
// (round 43, datasafe) read again when held; a file that still can't be read is never written over (its links stay)
const unread = new Set();
const readJson = (f, d) => { const r = require('./datasafe-core').load(fs, f, d); if (r.canSave && !r.doubt) unread.delete(f); else unread.add(f); return r.value; };
function writeJson(f, v) { if (unread.has(f)) throw new Error(`${path.basename(f)} can't be read just now: not saved over`); fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); }

// ---------- this computer ----------
let niceName = null;
function friendlyName() {
  if (niceName) return niceName;
  niceName = o.platform === 'win32' ? (process.env.COMPUTERNAME || os.hostname()) : os.hostname().replace(/\.local$/i, '');
  if (o.platform === 'darwin') { // "Quentin's MacBook Pro" (System Settings → General → About), once, in the background
    try { execFile('scutil', ['--get', 'ComputerName'], { timeout: 1500 }, (err, out) => { const n = String(out || '').trim(); if (!err && n) niceName = n; }); } catch { /* the host name then */ }
  }
  return niceName;
}
function machine() {
  const file = path.join(o.dataDir, 'sync', 'machine.json');
  // (round 43, datasafe) a held machine file isn't "none": no new id is written over it (an id for this run only)
  const r = require('./datasafe-core').load(fs, file, null, { prev: false });
  let m = r.value;
  if (r.state === 'unreadable') return { id: `held-${process.pid}`, name: friendlyName(), platform: o.platform, os: T.osOf(o.platform), held: true };
  if (!m?.id) {
    m = { id: `${os.hostname().replace(/[^\w-]+/g, '').slice(0, 20) || 'pc'}-${crypto.randomBytes(4).toString('hex')}`, created: Date.now() };
    try { writeJson(file, m); } catch { /* read-only: an id for this run */ }
  }
  return { id: m.id, name: friendlyName(), platform: o.platform, os: T.osOf(o.platform) };
}
function drives() {
  try {
    const S = require('./sync-merge');
    return S.detectClouds({ platform: o.platform, home: o.home, env: process.env, exists: (p) => fs.existsSync(p), readdir: (p) => fs.readdirSync(p), readJson: (p) => JSON.parse(fs.readFileSync(p, 'utf8')) })
      .map((d) => ({ id: d.id, label: d.label, root: d.root }));
  } catch { return []; }
}
let drivesAt = 0; let drivesList = [];
function roots() {
  if (Date.now() - drivesAt > 5 * 60000) { drivesList = drives(); drivesAt = Date.now(); }
  const st = o.syncmain?.status?.() || {};
  return { platform: o.platform, home: o.home, data: o.dataDir, cloud: st.on && st.root ? st.root : null, drives: drivesList };
}
async function info() {
  const me = machine();
  let peers = [];
  try { peers = (await o.syncmain?.peers?.()) || []; } catch { peers = []; }
  const st = o.syncmain?.status?.() || {};
  return { ...me, label: T.computerLabel(me), roots: roots(), sync: { on: Boolean(st.on), lastOk: st.lastOk || 0, label: st.label || '' },
    peers: peers.filter((p) => p && p.id && p.id !== me.id).map((p) => ({ id: p.id, name: p.name, platform: p.platform, os: T.osOf(p.platform), label: T.computerLabel(p), lastSeen: p.lastSeen || 0 })) };
}

// ---------- media found again ----------
// quick hash: sha1 of the size, the first MiB and the last MiB (the whole file when it is smaller than 2 MiB): the
// same on both computers, a few milliseconds for a 4 GB video
async function quickHash(file) {
  const st = await fsp.stat(file);
  if (!st.isFile()) throw new Error('Not a file');
  const h = crypto.createHash('sha1').update(`${st.size}:`);
  const fh = await fsp.open(file, 'r');
  try {
    const part = T.QH_PART;
    if (st.size <= part * 2) h.update(await fh.readFile());
    else {
      const buf = Buffer.alloc(part);
      await fh.read(buf, 0, part, 0); h.update(buf);
      await fh.read(buf, 0, part, st.size - part); h.update(buf);
    }
  } finally { await fh.close(); }
  return { hash: h.digest('hex'), size: st.size };
}
const SKIP_DIR = /^(\.|node_modules$|__pycache__$|Library$|AppData$|\$Recycle\.Bin$|System Volume Information$)/i;
// files under a folder, a few levels down, capped (a big Downloads folder can't stall a relink)
async function listFiles(dir, depth = 4, cap = 6000) {
  const out = [];
  async function walk(d, left) {
    if (out.length >= cap) return;
    let ents = [];
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= cap) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (left > 0 && !SKIP_DIR.test(e.name)) await walk(p, left - 1); } else if (e.isFile() && !/^\./.test(e.name)) out.push(p);
    }
  }
  await walk(dir, depth);
  return out;
}
const linksFile = () => path.join(o.dataDir, 'kv', 'media-here.json'); // this computer's own (sync-merge.js LOCAL_FILES)
const sizeOf = (p) => { try { return fs.statSync(p).size; } catch { return -1; } };
async function relink(ref) {
  const r = await T.relink(ref, {
    roots: roots(), platform: o.platform, exists: (p) => fs.existsSync(p), statSize: sizeOf,
    hashOf: async (p) => (await quickHash(p)).hash, links: readJson(linksFile(), {}), list: (d, depth) => listFiles(d, depth),
  });
  if (r && r.how !== 'here' && r.how !== 'link') { try { writeJson(linksFile(), T.linkHere(readJson(linksFile(), {}), ref, r.path)); } catch { /* found anyway */ } }
  return r;
}
// "Find this file": the file the owner picked here stands for the one asked for, on this computer only. same: false
// when its content differs from the one the scene used (the renderer says so; the owner's pick still counts)
async function link(ref, file) {
  if (!file || !fs.existsSync(file)) return { ok: false, error: 'That file isn\'t there.' };
  let q = null; try { q = await quickHash(file); } catch { q = null; }
  const same = ref?.hash ? q?.hash === ref.hash : null;
  try { writeJson(linksFile(), T.linkHere(readJson(linksFile(), {}), { ...ref, hash: same === false ? null : ref?.hash }, file)); } catch (err) { return { ok: false, error: err.message }; }
  return { ok: true, path: file, same, hash: q?.hash || null, size: q?.size ?? null };
}
async function pickFile(a = {}) {
  const { dialog } = require('electron');
  const win = o.getWin?.();
  const opts = { title: a.title || 'Find this file', buttonLabel: 'Use this file', properties: ['openFile'], defaultPath: a.defaultPath && fs.existsSync(a.defaultPath) ? a.defaultPath : (a.name ? path.join(o.home, a.name) : undefined) };
  if (a.ext) opts.filters = [{ name: a.ext.toUpperCase(), extensions: [a.ext] }, { name: 'All files', extensions: ['*'] }];
  const pick = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return pick.canceled ? null : pick.filePaths[0] || null;
}

function register(ipcMain, opts = {}) {
  o = { ...o, ...opts };
  ipcMain.handle('two:info', () => info());
  ipcMain.handle('two:hash', (_e, p) => quickHash(String(p)).catch(() => null));
  ipcMain.handle('two:relink', (_e, ref) => relink(ref || {}).catch(() => null));
  ipcMain.handle('two:link', (_e, ref, file) => link(ref || {}, file));
  ipcMain.handle('two:exists', (_e, list) => (Array.isArray(list) ? list.slice(0, 200).map((p) => { try { return typeof p === 'string' && !T.foreign(p, o.platform) && fs.statSync(p).isDirectory(); } catch { return false; } }) : []));
  ipcMain.handle('two:pickFile', (_e, a) => pickFile(a || {}));
}
module.exports = { register, machine, info, roots, quickHash, relink, link, listFiles, _set: (x) => { o = { ...o, ...x }; } };
