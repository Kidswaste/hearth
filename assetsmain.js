// The asset library, main side (round 24, assets stream; assets.js is the renderer side). Required from main.js with one
// line. Everything here waits until the library is first used: no scan, no watcher, no worker at startup.
//   scan / hash   watched folders walked and hashed in a worker_thread (assets-work.js), progress as 'assets:event'
//   read          a file's bytes for a thumbnail (made in the window's own worker, assets-thumb-worker.js)
//   thumbnails    cached on disk in data/.cache/asset-thumbs/<hash>.webp (hidden: never synced, rebuilt on demand)
//   free sources  Poly Haven's and ambientCG's public JSON APIs (no key, no scraping): search JSON, preview pictures
//                 (cached), downloads with progress into Downloads/Hearth/<Source>; a Poly Haven glTF with its parts is
//                 packed into one .glb (the Lab reads single files); an ambientCG zip is unpacked
//   import        a copy into data/assets/<kind>/ (only when the owner asks: the library is by reference)
//   watch         fs.watch on the watched folders once they were scanned (changes → a rescan of that folder)
// Tests: HEARTH_POLYHAVEN_BASE / HEARTH_AMBIENTCG_BASE point the sources at dev/fake-assets.js (smoke --fake-assets).
const { app, net } = (() => { try { return require('electron'); } catch { return {}; } })(); // (plain Node in dev/assets-test.js: zip / glb helpers only)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const AssetsCore = require('./assets-core');

const POLY_BASE = process.env.HEARTH_POLYHAVEN_BASE || 'https://api.polyhaven.com';
const ACG_BASE = process.env.HEARTH_AMBIENTCG_BASE || 'https://ambientcg.com';
const UA = 'Hearth asset library (desktop app)';

let dataDir = path.join(__dirname, 'data');
let getWin = () => null;
const toHub = (data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('assets:event', data); };
const thumbDir = () => { const d = path.join(dataDir, '.cache', 'asset-thumbs'); fs.mkdirSync(d, { recursive: true }); return d; };
const previewDir = () => { const d = path.join(dataDir, '.cache', 'asset-previews'); fs.mkdirSync(d, { recursive: true }); return d; };
const libraryDir = (sub = '') => { const d = path.join(dataDir, 'assets', sub); fs.mkdirSync(d, { recursive: true }); return d; };
function downloadsDir(source) {
  const root = process.env.HEARTH_TEST_SAVE_DIR ? path.join(process.env.HEARTH_TEST_SAVE_DIR, 'apps-downloads') : path.join(app.getPath('downloads'), 'Hearth');
  const d = path.join(root, safe(source || 'Assets'));
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const safe = (s, n = 80) => String(s || 'file').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim().slice(0, n) || 'file';
function uniquePath(dir, name) {
  const p = path.parse(safe(name, 120));
  let t = path.join(dir, p.base);
  for (let n = 1; fs.existsSync(t); n += 1) t = path.join(dir, `${p.name} (${n})${p.ext}`);
  return t;
}
const abs = (p) => typeof p === 'string' && path.isAbsolute(p);

// ---------- the worker (walks + hashes) ----------
let worker = null; let seq = 0;
const jobs = new Map(); // id → { resolve, onProgress }
function work(job, onProgress = () => {}) {
  const id = ++seq;
  if (!worker) {
    try {
      const { Worker } = require('worker_threads');
      worker = new Worker(path.join(__dirname, 'assets-work.js'));
      worker.on('message', (m) => { const j = jobs.get(m.id); if (!j) return; if (m.progress) { j.onProgress(m.progress); return; } jobs.delete(m.id); j.resolve(m); });
      worker.on('error', (err) => { for (const j of jobs.values()) j.resolve({ ok: false, error: err.message }); jobs.clear(); worker = null; });
      worker.unref?.();
    } catch { worker = false; }
  }
  if (worker === false) return Promise.resolve(require('./assets-work').run(job, onProgress)); // no worker_threads: in place
  return new Promise((resolve) => { jobs.set(id, { resolve, onProgress }); worker.postMessage({ ...job, id }); });
}

// ---------- fetching (JSON, previews, downloads with progress) ----------
async function fetchJson(url) {
  if (!/^https?:\/\//i.test(String(url))) return { ok: false, error: 'Not a web address' };
  try {
    const res = await net.fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
    if (!res.ok) return { ok: false, error: `the server answered ${res.status}` };
    return { ok: true, value: await res.json() };
  } catch (err) { return { ok: false, error: err.message }; }
}
// a result's preview picture, cached by its address (the page shows file:// pictures; https ones would be blocked
// for http test servers and re-downloaded every time)
async function preview(url) {
  if (!/^https?:\/\//i.test(String(url))) return { ok: false };
  const ext = (/\.(png|jpe?g|webp|gif)(?:$|\?)/i.exec(new URL(url).pathname)?.[1] || 'png').toLowerCase();
  const p = path.join(previewDir(), `${crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)}.${ext}`);
  if (fs.existsSync(p)) return { ok: true, path: p };
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { ok: false, error: `${res.status}` };
    fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
    trimPreviews();
    return { ok: true, path: p };
  } catch (err) { return { ok: false, error: err.message }; }
}
let trimAt = 0;
function trimPreviews() { // keep the newest 600 previews (≈ 30 MB)
  if (Date.now() - trimAt < 60000) return; trimAt = Date.now();
  try {
    const d = previewDir();
    const all = fs.readdirSync(d).map((n) => { const p = path.join(d, n); return { p, t: fs.statSync(p).mtimeMs }; }).sort((a, b) => b.t - a.t);
    for (const x of all.slice(600)) fs.rmSync(x.p, { force: true });
  } catch { /* best effort */ }
}
const live = new Map(); // download id → AbortController
async function fetchFile(url, target, onBytes, signal) {
  const res = await net.fetch(url, { headers: { 'User-Agent': UA }, signal });
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const tmp = `${target}.hearth-part`;
  const out = fs.createWriteStream(tmp);
  let got = 0;
  try {
    if (res.body?.getReader) {
      const rd = res.body.getReader();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        got += value.length;
        if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
        onBytes(got, total);
      }
    } else { const b = Buffer.from(await res.arrayBuffer()); got = b.length; out.write(b); onBytes(got, total); }
    await new Promise((r, j) => out.end((err) => (err ? j(err) : r())));
    fs.renameSync(tmp, target);
  } catch (err) { out.destroy(); fs.rmSync(tmp, { force: true }); throw err; }
  return got;
}
// { id, source, folder, files: [{ url, rel, size, role }], unzip } → { ok, paths, main, dir }
async function download(o = {}) {
  const files = (o.files || []).filter((f) => /^https?:\/\//i.test(String(f.url)));
  if (!files.length) return { ok: false, error: 'Nothing to download' };
  const ctl = new AbortController();
  live.set(o.id, ctl);
  const root = downloadsDir(o.source);
  const dir = files.length > 1 || o.folder ? path.join(root, safe(o.folder || files[0].rel.replace(/\.[^.]+$/, ''))) : root;
  fs.mkdirSync(dir, { recursive: true });
  const totalGuess = files.reduce((a, f) => a + (f.size || 0), 0);
  const done = []; let base = 0; let last = 0;
  const say = (got, total, file, force) => { const now = Date.now(); if (!force && now - last < 150) return; last = now; toHub({ type: 'dl', id: o.id, got: base + got, total: Math.max(totalGuess, base + total), file }); };
  try {
    for (const f of files) {
      const rel = String(f.rel || path.basename(new URL(f.url).pathname)).replace(/\\/g, '/').split('/').filter((x) => x && x !== '..' && x !== '.').map((x) => safe(x)).join(path.sep) || 'file';
      const target = files.length > 1 || o.folder ? path.join(dir, rel) : uniquePath(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const n = await fetchFile(f.url, target, (got, total) => say(got, total || f.size || 0, path.basename(target)), ctl.signal);
      base += n;
      done.push({ ...f, path: target });
    }
    say(0, 0, '', true);
    let main = done.find((f) => f.role === 'main')?.path || done[0].path;
    const paths = done.map((f) => f.path);
    // an ambientCG zip: its maps out next to it (the zip goes)
    if (/\.zip$/i.test(main)) {
      const out = unzip(main, path.join(path.dirname(main), path.basename(main, '.zip')));
      fs.rmSync(main, { force: true });
      paths.splice(0, paths.length, ...out);
      main = out.find((p) => AssetsCore.mapRole(p) === 'main') || out.find((p) => /\.(hdr|exr)$/i.test(p)) || out.find((p) => AssetsCore.kindOf(p)) || out[0];
    }
    // a glTF with parts → one .glb
    if (/\.gltf$/i.test(main) && done.length > 1) { try { const glb = packGlb(main); paths.push(glb); main = glb; } catch (err) { console.warn('assets: glb pack', err.message); } }
    return { ok: true, dir, main, paths, bytes: base };
  } catch (err) {
    return { ok: false, error: ctl.signal.aborted ? 'cancelled' : err.message };
  } finally { live.delete(o.id); }
}

// ---------- zip (stored / deflated entries; flattened, no paths outside the folder) ----------
function unzip(zipPath, dir) {
  const b = fs.readFileSync(zipPath);
  let e = b.length - 22;
  while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e -= 1;
  if (e < 0) throw new Error('not a zip file');
  const count = b.readUInt16LE(e + 10); let p = b.readUInt32LE(e + 16);
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (let i = 0; i < count; i += 1) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const method = b.readUInt16LE(p + 10); const csize = b.readUInt32LE(p + 20); const nlen = b.readUInt16LE(p + 28); const xlen = b.readUInt16LE(p + 30); const clen = b.readUInt16LE(p + 32); const local = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
    const ls = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = b.subarray(ls, ls + csize);
    const body = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
    if (!body) continue;
    const t = path.join(dir, safe(path.basename(name), 120));
    fs.writeFileSync(t, body);
    out.push(t);
  }
  return out;
}

// ---------- a glTF and its parts → one .glb ----------
function packGlb(gltfPath) {
  const dir = path.dirname(gltfPath);
  const g = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
  const chunks = []; let len = 0;
  const push = (buf) => { const at = len; chunks.push(buf); len += buf.length; const pad = (4 - (len % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); len += pad; } return at; };
  const read = (uri) => (uri.startsWith('data:') ? Buffer.from(uri.split(',')[1], 'base64') : fs.readFileSync(path.join(dir, decodeURIComponent(uri))));
  const starts = (g.buffers || []).map((bf) => (bf.uri != null ? push(read(bf.uri)) : 0));
  for (const v of g.bufferViews || []) v.byteOffset = (v.byteOffset || 0) + (starts[v.buffer] || 0), v.buffer = 0;
  for (const im of g.images || []) {
    if (!im.uri) continue;
    const buf = read(im.uri);
    const at = push(buf);
    (g.bufferViews ||= []).push({ buffer: 0, byteOffset: at, byteLength: buf.length });
    im.bufferView = g.bufferViews.length - 1;
    im.mimeType = im.mimeType || (/\.png$/i.test(im.uri) ? 'image/png' : /\.webp$/i.test(im.uri) ? 'image/webp' : 'image/jpeg');
    delete im.uri;
  }
  const bin = Buffer.concat(chunks);
  g.buffers = [{ byteLength: bin.length }];
  const pad = (b, c) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, c)]);
  const j = pad(Buffer.from(JSON.stringify(g)), 0x20); const bb = pad(bin, 0);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + bb.length, 8);
  const ch = (n, t) => { const x = Buffer.alloc(8); x.writeUInt32LE(n, 0); x.writeUInt32LE(t, 4); return x; };
  const out = gltfPath.replace(/\.gltf$/i, '.glb');
  fs.writeFileSync(out, Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(bb.length, 0x004e4942), bb]));
  return out;
}

// ---------- watching folders (after their first scan) ----------
const watchers = new Map(); // root → { w, t }
function watch(roots) {
  const want = new Set((roots || []).filter(abs));
  for (const [r, x] of watchers) if (!want.has(r)) { try { x.w.close(); } catch { /* closed */ } clearTimeout(x.t); watchers.delete(r); }
  for (const r of want) {
    if (watchers.has(r) || !fs.existsSync(r)) continue;
    try {
      const x = { w: null, t: 0 };
      x.w = fs.watch(r, { recursive: true, persistent: false }, (_ev, name) => {
        if (name && !AssetsCore.kindOf(String(name))) return; // a folder event, a .DS_Store, a temp file: not ours
        clearTimeout(x.t);
        x.t = setTimeout(() => toHub({ type: 'changed', root: r }), 2500);
      });
      x.w.on('error', () => { watchers.delete(r); });
      watchers.set(r, x);
    } catch { /* this platform can't watch it recursively: idle rescans cover it */ }
  }
  return [...watchers.keys()];
}

function register(ipcMain, o = {}) {
  if (o.dataDir) dataDir = o.dataDir;
  if (o.getWin) getWin = o.getWin;
  const h = (ch, fn) => ipcMain.handle(ch, (_e, ...a) => fn(...a));
  h('assets:status', () => ({ polyBase: POLY_BASE, acgBase: ACG_BASE, thumbs: thumbDir(), library: libraryDir(), downloads: path.dirname(downloadsDir('Assets')), test: Boolean(process.env.HEARTH_AMBIENTCG_BASE) }));
  h('assets:scan', async (job = {}) => {
    const roots = (job.roots || []).filter(abs);
    const r = await work({ type: 'scan', roots, known: job.known || {}, max: Math.min(Number(job.max) || 20000, 50000) }, (pr) => toHub({ type: 'scan', ...pr }));
    if (r.ok && job.watch !== false) watch([...new Set([...watchers.keys(), ...roots])]);
    return r;
  });
  h('assets:hash', (paths) => work({ type: 'hash', paths: (paths || []).filter(abs) }));
  h('assets:exists', (paths) => (paths || []).map((p) => abs(p) && fs.existsSync(p)));
  h('assets:read', (p, max = 64 * 1048576) => {
    if (!abs(p)) return null;
    try { const st = fs.statSync(p); if (!st.isFile() || st.size > max) return null; return fs.readFileSync(p); } catch { return null; }
  });
  h('assets:readText', (p, max = 2 * 1048576) => { if (!abs(p)) return null; try { const st = fs.statSync(p); if (st.size > max) return null; return fs.readFileSync(p, 'utf8'); } catch { return null; } });
  h('assets:saveThumb', (hash, bytes) => {
    if (!/^[0-9a-f]{6,40}$/.test(String(hash)) || !bytes) return null;
    const p = path.join(thumbDir(), `${hash}.webp`);
    fs.writeFileSync(p, Buffer.from(bytes));
    return p;
  });
  h('assets:cacheInfo', () => {
    let n = 0; let bytes = 0;
    for (const d of [thumbDir(), previewDir()]) for (const f of fs.readdirSync(d)) { try { bytes += fs.statSync(path.join(d, f)).size; n += 1; } catch { /* gone */ } }
    return { files: n, bytes };
  });
  h('assets:clearThumbs', () => { let n = 0; for (const d of [thumbDir(), previewDir()]) for (const f of fs.readdirSync(d)) { fs.rmSync(path.join(d, f), { force: true }); n += 1; } return n; });
  h('assets:fetchJson', (url) => fetchJson(String(url || '')));
  h('assets:preview', (url) => preview(String(url || '')));
  h('assets:download', (o2) => download(o2 || {}));
  h('assets:cancel', (id) => { const c = live.get(id); if (c) c.abort(); return Boolean(c); });
  // a copy into Hearth's own library folder (the owner asked: the library is by reference otherwise)
  h('assets:import', (paths, kind = 'other') => {
    const dir = libraryDir(safe(kind));
    return (paths || []).filter(abs).map((p) => { try { const t = uniquePath(dir, path.basename(p)); fs.copyFileSync(p, t); return t; } catch { return null; } });
  });
  h('assets:writePreset', (name, json) => { const t = uniquePath(libraryDir('presets'), `${safe(name, 60)}.hpreset`); fs.writeFileSync(t, JSON.stringify(json, null, 1)); return t; });
  h('assets:watch', (roots) => watch(roots));
}

module.exports = { register, unzip, packGlb, _download: download };
