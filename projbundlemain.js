// Project bundles, main side (round 75, projbundle75; the window side is projbundle.js, the format projbundle-core.js).
// Loaded on its first IPC call (main.js lazyIpc). Writes and reads .hearthproject files (a plain zip) with Node's own
// zlib, streamed: no file is ever held whole in memory, big and already-compressed files are stored as they are, the
// zip itself is written piece by piece (each entry's header patched once its bytes are through).
//   projbundle:sizes ({ paths, dirs })     what the export card shows: each file the project points at found here (or
//                                          through the sync path mapping: reachmain localize), its size; folders walked
//   projbundle:export ({ body, name, job, leftOut, secrets })   the file, saved where the owner picks (a save dialog;
//                                          HEARTH_TEST_SAVE_DIR in tests), written to <file>.part then renamed;
//                                          progress as projbundle:progress { job, phase, done, total, file }
//   projbundle:peek (file)                 the import card's facts without unpacking anything: every entry checked first
//                                          (no zip-slip, caps), the versions, the body's shape, what it would add
//   projbundle:unpack ({ file, job })      its files into Hearth's own folder only (data/assets/projects/<name>/, each
//                                          target checked to sit inside it, never over a file that's there), CRC-checked,
//                                          inflated with a size cap; a damaged file is skipped and named; a cancel or a
//                                          failure removes what it wrote. → the body with this computer's paths
//   projbundle:cancel (job)                stops an export / unpack between two chunks
// The owner's own files are only ever read (exports) — an import writes nothing outside data/assets/projects/.
// (round 85, projbig85) the heavy parts run on a thread (projbundle-work.js): a GIANT chat (≥ 8 MB) travels by its name,
// read there from its file; the body's JSON, its CRC and its deflate are made there; an import's project.json is parsed
// there and its big chats' messages wait in part files until the window adds each by name (the store thread writes it):
//   projbundle:chats (ids)                 each chat: missing / small / unreadable / big (its own fields, count, size, paths)
//   projbundle:adopt ({ job, part } | { chat }, id, head)   a big chat written as a whole save writes it, by the store
//                                          thread: head (its own fields) + the messages of an import's part or of a
//                                          chat here (Duplicate); never over a chat that's there
//   projbundle:release (job)               an import's part files removed (a temporary folder)
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const { pipeline } = require('stream/promises');
const { Transform, PassThrough, Writable } = require('stream');
const P = require('./projbundle-core');
const zipkit = require('./zipkit');

const inflateRaw = promisify(zlib.inflateRaw);
const deflateRaw = promisify(zlib.deflateRaw);
const crc32 = zipkit.crc32;
const U32 = 0xffffffff;
let opts = { dataDir: path.join(__dirname, 'data'), getWin: () => null };
const jobs = new Map(); // job id → AbortController
const W = require('./projbundle-work'); // (round 85, projbig85) the heavy parts (on a thread: work() below)
const SAFE_ID = /^[\w-]{1,80}$/;
const chatFile = (id) => (SAFE_ID.test(String(id || '')) ? path.join(opts.dataDir, 'chats', `${id}.json`) : null);
// (round 85, projbig85) projbundle-work.js on its own thread, started on first use, let go a minute after its last job;
// inline (this thread) where a thread can't start. → the op's result; a failure there rejects (never "nothing")
let thr = null;
function work(op, args) {
  if (process.env.HEARTH_PROJBUNDLE_INLINE !== '1' && !thr) {
    try {
      const { Worker } = require('worker_threads');
      const w = new Worker(path.join(__dirname, 'projbundle-work.js'), { workerData: { projbundleWork: true } });
      const t = { w, seq: 0, wait: new Map(), timer: null };
      w.on('message', ({ id, res, err, code }) => { const j = t.wait.get(id); if (!j) return; t.wait.delete(id); if (err) j.no(Object.assign(new Error(err), { code })); else j.ok(res); });
      const dead = (why) => { if (thr === t) thr = null; for (const j of t.wait.values()) j.no(new Error(`The project file's helper stopped (${why})`)); t.wait.clear(); };
      w.on('error', (e) => dead(e.message)); w.on('exit', (c) => dead(`exited ${c}`));
      w.unref();
      thr = t;
    } catch { thr = null; }
  }
  if (!thr) return Promise.resolve().then(() => W.OPS[op](args));
  const t = thr; clearTimeout(t.timer);
  const id = ++t.seq;
  return new Promise((ok, no) => { t.wait.set(id, { ok, no }); t.w.ref(); t.w.postMessage({ id, op, args }); })
    .finally(() => { if (!t.wait.size) { t.w.unref(); clearTimeout(t.timer); t.timer = setTimeout(() => { if (thr === t && !t.wait.size) { thr = null; t.w.terminate().catch(() => {}); } }, 60000); t.timer.unref?.(); } });
}
const asBuf = (u) => (u && !Buffer.isBuffer(u) ? Buffer.from(u.buffer, u.byteOffset, u.byteLength) : u);
const statOf = (p) => { try { return fs.statSync(p); } catch { return null; } };
const unFile = (s) => { let p = String(s).replace(/^file:\/\/(localhost)?/i, ''); try { p = decodeURIComponent(p); } catch { /* as is */ } if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1); return p; };
const root = () => path.join(opts.dataDir, 'assets', 'projects');
const cancelErr = () => Object.assign(new Error('Cancelled'), { code: 'ECANCELED' });
const safeBase = (s, n = 120) => String(s || 'file').split(/[\\/]/).filter(Boolean).pop()?.replace(/[<>:"|?*\u0000-\u001f\u007f]+/g, '_').replace(/^[.\s]+/, '').replace(/[ .]+$/, '').replace(/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i, '_$1$2').slice(0, n) || 'file';
const safeName = (s, n = 60) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').replace(/[ .]+$/, '').trim().slice(0, n) || 'Project';
function versionOf() { try { return require('electron').app.getVersion(); } catch { return ''; } }
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'venv', '.venv', '.cache', '.next']);

// ---------- the files a project points at ----------
// a path as the JSON has it → this computer's file (or null): as it is, else the other computer's form mapped here
function here(p, { dir = false } = {}) {
  const raw = unFile(p);
  const ok = (st) => st && (dir ? st.isDirectory() || st.isFile() : st.isFile());
  const st = statOf(raw);
  if (ok(st)) return { path: raw, size: st.isFile() ? st.size : 0, dir: st.isDirectory() };
  try {
    const hit = require('./reachmain').localize(raw);
    const st2 = hit?.path ? statOf(hit.path) : null;
    if (ok(st2)) return { path: hit.path, size: st2.isFile() ? st2.size : 0, dir: st2.isDirectory() };
  } catch { /* no mapping */ }
  return null;
}
// a folder's files (dotfiles, dependency folders and secret-looking files stay out), names relative with '/'
function walkDir(dir, cap = 20000) {
  const out = [];
  const go = (d, rel, depth) => {
    if (out.length >= cap || depth > 12) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of ents) {
      if (out.length >= cap) return;
      if (e.name.startsWith('.') || P.secretFile(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) go(abs, r, depth + 1); continue; }
      if (!e.isFile()) continue; // links and devices stay out
      const st = statOf(abs);
      if (st) out.push({ abs, rel: r, size: st.size });
    }
  };
  go(dir, '', 0);
  return out;
}
// (round 85, projbig85) the export card's sizes with the disk's answers awaited (a project of 740 files held this
// process ≈ 120 ms in stat / readdir calls before its card showed); the same answers as here() / walkDir()
async function walkDirAsync(dir, cap = 20000) {
  const out = [];
  const go = async (d, rel, depth) => {
    if (out.length >= cap || depth > 12) return;
    let ents = [];
    try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of ents) {
      if (out.length >= cap) return;
      if (e.name.startsWith('.') || P.secretFile(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await go(abs, r, depth + 1); continue; }
      if (!e.isFile()) continue; // links and devices stay out
      const st = await fs.promises.stat(abs).catch(() => null);
      if (st) out.push({ abs, rel: r, size: st.size });
    }
  };
  await go(dir, '', 0);
  return out;
}
// (round 86, projopen86) here() for many paths at once: each as it is (asked without blocking), then the ones not found
// mapped from the other computer's form in one call (reachmain localizeMany: the disk awaited, the mapping in slices)
// and those asked again. The same answers as here() for each path
// (it replaces round 85's hereAsync, which mapped each path not found with its own blocking calls).
async function hereMany(list) {
  const okOf = (st, dir) => st && (dir ? st.isDirectory() || st.isFile() : st.isFile());
  const res = new Array(list.length).fill(null);
  const raws = list.map(({ p }) => unFile(p));
  const BATCH = 64;
  const miss = [];
  for (let i = 0; i < list.length; i += BATCH) {
    await Promise.all(list.slice(i, i + BATCH).map(async ({ dir }, k) => {
      const j = i + k; const st = await fs.promises.stat(raws[j]).catch(() => null);
      if (okOf(st, dir)) res[j] = { path: raws[j], size: st.isFile() ? st.size : 0, dir: st.isDirectory() }; else miss.push(j);
    }));
  }
  if (!miss.length) return res;
  miss.sort((a, b) => a - b);
  let hits = [];
  try { hits = await require('./reachmain').localizeMany(miss.map((j) => raws[j])); } catch { hits = []; /* no mapping */ }
  for (let i = 0; i < miss.length; i += BATCH) {
    await Promise.all(miss.slice(i, i + BATCH).map(async (j, k) => {
      const hit = hits[i + k]; if (!hit?.path) return;
      const st = await fs.promises.stat(hit.path).catch(() => null);
      if (okOf(st, list[j].dir)) res[j] = { path: hit.path, size: st.isFile() ? st.size : 0, dir: st.isDirectory() };
    }));
  }
  return res;
}
async function sizes({ paths = [], dirs = [] } = {}) {
  // (round 86, projopen86) every path found in one batch (hereMany), then each answered as before
  const all = [...paths.map((p) => ({ p, dir: false })), ...dirs.map((p) => ({ p, dir: true }))];
  const found = await hereMany(all.map((x) => (P.secretFile(x.p) ? { p: '', dir: x.dir } : x)));
  const at = new Map(); all.forEach((x, i) => at.set(x, found[i]));
  const one = async (x) => {
    const { p, dir } = x;
    if (P.secretFile(p)) return { path: p, found: false, secret: true, size: 0 };
    const h = at.get(x);
    if (!h) return { path: p, found: false, size: 0 };
    if (h.dir) { const fs2 = await walkDirAsync(h.path); return { path: p, found: true, dir: true, files: fs2.length, size: fs2.reduce((n, f) => n + f.size, 0) }; }
    return { path: p, found: true, files: 1, size: h.size };
  };
  return { files: await Promise.all(all.slice(0, paths.length).map(one)), dirs: await Promise.all(all.slice(paths.length).map(one)) };
}

// ---------- writing (streamed) ----------
function dosTime(ms) {
  const d = new Date(ms || Date.now());
  const y = Math.max(1980, d.getFullYear());
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
// items: [{ name, data?: Buffer, path?, size, mtime? }] → the zip at out (via out.part). Each entry: its header first
// (sizes zero), its bytes streamed through a CRC counter (and deflate for small text-like files), then the header's
// CRC and sizes written in place. Files of 4 GB and more get Zip64 records (stored, their size known up front).
async function writeZip(out, items, { signal, onBytes = () => {} } = {}) {
  const tmp = `${out}.part`;
  const fh = await fs.promises.open(tmp, 'w');
  const central = [];
  let pos = 0;
  const put = async (buf) => { let off = 0; while (off < buf.length) { const { bytesWritten } = await fh.write(buf, off, buf.length - off, pos); pos += bytesWritten; off += bytesWritten; } };
  try {
    for (const it of items) {
      if (signal?.aborted) throw cancelErr();
      const name = Buffer.from(it.name.normalize('NFC'), 'utf8');
      const { time, date } = dosTime(it.mtime);
      const offset = pos;
      let crc = 0; let size = 0; let csize = 0; let method;
      let z64 = false;
      if (it.pre) { // (round 85, projbig85) made on the thread (projbundle-work.js exportB): its CRC, sizes and bytes
        ({ crc, size, method } = it.pre); csize = it.pre.bytes.length;
        await put(localHeader({ name, method, time, date, crc, size, csize, z64 }));
        for (let o = 0; o < csize; o += 4 << 20) { if (signal?.aborted) throw cancelErr(); await put(it.pre.bytes.subarray(o, Math.min(csize, o + (4 << 20)))); }
        onBytes(size, it.name);
      } else if (it.data) {
        size = it.data.length; crc = crc32(it.data);
        const comp = await deflateRaw(it.data, { level: 6 });
        method = comp.length < size ? 8 : 0;
        const bytes = method === 8 ? comp : it.data;
        csize = bytes.length;
        const h = localHeader({ name, method, time, date, crc, size, csize, z64 });
        await put(h); await put(bytes);
        onBytes(size, it.name);
      } else {
        const st = await fs.promises.stat(it.path);
        method = P.methodFor(it.name, st.size);
        z64 = st.size >= U32 - 65536;
        if (z64) method = 0;
        const h = localHeader({ name, method, time, date, crc: 0, size: z64 ? st.size : 0, csize: z64 ? st.size : 0, z64 });
        await put(h);
        const count = new Transform({ transform(chunk, _e, cb) { crc = crc32(chunk, crc); size += chunk.length; onBytes(chunk.length, it.name); cb(null, chunk); } });
        const sink = new Writable({ write(chunk, _e, cb) { put(chunk).then(() => { csize += chunk.length; cb(); }, cb); } });
        await pipeline(fs.createReadStream(it.path, { highWaterMark: 1 << 20 }), count, method === 8 ? zlib.createDeflateRaw({ level: 6 }) : new PassThrough(), sink, { signal });
        if (z64 && size !== st.size) throw Object.assign(new Error(`${path.basename(it.path)} changed while it was saved`), { code: 'ECHANGED' });
        // the header's CRC and sizes, in place
        const fix = Buffer.alloc(12);
        fix.writeUInt32LE(crc >>> 0, 0); fix.writeUInt32LE(z64 ? U32 : csize, 4); fix.writeUInt32LE(z64 ? U32 : size, 8);
        await fh.write(fix, 0, 12, offset + 14);
      }
      central.push({ name, method, time, date, crc, size, csize, offset });
    }
    const cdStart = pos;
    for (const c of central) {
      const big = { size: c.size >= U32 - 65536, off: c.offset >= U32 };
      const parts = [];
      if (big.size) parts.push(BigInt(c.size), BigInt(c.csize));
      if (big.off) parts.push(BigInt(c.offset));
      const extra = Buffer.alloc(parts.length ? 4 + 8 * parts.length : 0);
      if (parts.length) { extra.writeUInt16LE(1, 0); extra.writeUInt16LE(8 * parts.length, 2); parts.forEach((v, i) => extra.writeBigUInt64LE(v, 4 + 8 * i)); }
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE((3 << 8) | 45, 4); h.writeUInt16LE(parts.length ? 45 : 20, 6); h.writeUInt16LE(0x0800, 8);
      h.writeUInt16LE(c.method, 10); h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14); h.writeUInt32LE(c.crc >>> 0, 16);
      h.writeUInt32LE(big.size ? U32 : c.csize, 20); h.writeUInt32LE(big.size ? U32 : c.size, 24); h.writeUInt16LE(c.name.length, 28); h.writeUInt16LE(extra.length, 30);
      h.writeUInt32LE(((0o100000 | 0o644) << 16) >>> 0, 38); h.writeUInt32LE(big.off ? U32 : c.offset, 42);
      await put(Buffer.concat([h, c.name, extra]));
    }
    const cdSize = pos - cdStart;
    const z64 = central.length >= 0xffff || cdStart >= U32 || cdSize >= U32;
    if (z64) {
      const r = Buffer.alloc(56);
      r.writeUInt32LE(0x06064b50, 0); r.writeBigUInt64LE(44n, 4); r.writeUInt16LE((3 << 8) | 45, 12); r.writeUInt16LE(45, 14);
      r.writeBigUInt64LE(BigInt(central.length), 24); r.writeBigUInt64LE(BigInt(central.length), 32); r.writeBigUInt64LE(BigInt(cdSize), 40); r.writeBigUInt64LE(BigInt(cdStart), 48);
      const loc = Buffer.alloc(20);
      loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(pos), 8); loc.writeUInt32LE(1, 16);
      await put(Buffer.concat([r, loc]));
    }
    const e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0);
    e.writeUInt16LE(z64 ? 0xffff : central.length, 8); e.writeUInt16LE(z64 ? 0xffff : central.length, 10);
    e.writeUInt32LE(z64 ? U32 : cdSize, 12); e.writeUInt32LE(z64 ? U32 : cdStart, 16);
    await put(e);
  } catch (err) {
    await fh.close().catch(() => {});
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw err.name === 'AbortError' ? cancelErr() : err;
  }
  await fh.close();
  await fs.promises.rename(tmp, out);
  return pos;
}
function localHeader({ name, method, time, date, crc, size, csize, z64 }) {
  const extra = z64 ? Buffer.alloc(20) : Buffer.alloc(0);
  if (z64) { extra.writeUInt16LE(1, 0); extra.writeUInt16LE(16, 2); extra.writeBigUInt64LE(BigInt(size), 4); extra.writeBigUInt64LE(BigInt(csize), 12); }
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(z64 ? 45 : 20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
  h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc >>> 0, 14);
  h.writeUInt32LE(z64 ? U32 : csize, 18); h.writeUInt32LE(z64 ? U32 : size, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(extra.length, 28);
  return Buffer.concat([h, name, extra]);
}

async function pickOut(name) {
  const file = `${safeName(name, 60)}${P.EXT}`;
  if (process.env.HEARTH_TEST_SAVE_DIR) { fs.mkdirSync(process.env.HEARTH_TEST_SAVE_DIR, { recursive: true }); return path.join(process.env.HEARTH_TEST_SAVE_DIR, file); }
  const { dialog, app } = require('electron');
  let dir = os.homedir();
  try { dir = app.getPath('documents'); } catch { /* home */ }
  const r = await dialog.showSaveDialog(opts.getWin() || undefined, { title: 'Export the project', defaultPath: path.join(dir, file), filters: [{ name: 'Hearth project', extensions: ['hearthproject'] }] });
  if (r.canceled || !r.filePath) return null;
  return /\.hearthproject$/i.test(r.filePath) ? r.filePath : `${r.filePath}${P.EXT}`;
}
const progressTo = (sender, job) => {
  let last = 0;
  return (d, force = false) => { const now = Date.now(); if (!force && now - last < 120) return; last = now; try { if (sender && !sender.isDestroyed?.()) sender.send('projbundle:progress', { job, ...d }); } catch { /* window gone */ } };
};

// The body (already prepared in the window: chats / files as chosen, secrets scrubbed) → the file.
// { body, name, job, leftOut, secrets, out? }
// (round 85, projbig85) a big chat comes as { __bigChat: { id } }: read from its file on the thread (projbundle-work.js
// exportA, after this chat's saves on their way); one that can't be read stops the export before anything is written.
// The body's copy, paths, rewrite, JSON, CRC and deflate run there too (this process held ≈ 4.7 s for a 60 MB chat)
async function exportBundle(o = {}, sender = null) {
  if (!o.body?.project) throw new Error('Nothing to export');
  const job = String(o.job || Date.now());
  const big = {};
  for (const c of o.body.chats || []) { const id = c?.chat?.__bigChat?.id; if (id != null) { const f = chatFile(id); if (!f) throw new Error('A chat in it has a name Hearth refuses'); big[id] = f; } }
  if (Object.keys(big).length) await opts.idle?.(); // (what is on its way to those chats lands first)
  const drop = () => { work('forget', { job }).catch(() => {}); };
  let a; let out;
  try {
    a = await work('exportA', { job, body: o.body, chats: big }); // (a body Hearth refuses, a chat that can't be read: thrown here)
    out = o.out || await pickOut(o.name || o.body.project.name);
  } catch (err) { drop(); throw err; }
  if (!out) { drop(); return { ok: false, canceled: true }; }
  const body = o.body;
  const ctl = new AbortController(); jobs.set(job, ctl);
  const send = progressTo(sender, job);
  try {
    send({ phase: 'plan', done: 0, total: 0 }, true);
    // the files the JSON points at: assets/<n>/<name>
    const items = []; const skipped = []; const map = new Map();
    let n = 0; let bytes = 0;
    const entryFor = (kind, nm) => `${kind}/${n++}/${safeBase(nm)}`;
    // (the project's file / capture / render / download items are its own files, below: not assets; found by exportA)
    for (const src of a.paths) {
      const h = here(src);
      if (!h) { skipped.push(safeBase(unFile(src))); map.set(src, ''); continue; }
      const entry = entryFor('assets', h.path);
      items.push({ name: entry, path: h.path, size: h.size, mtime: statOf(h.path)?.mtimeMs });
      map.set(src, P.tokenOf(entry)); bytes += h.size;
    }
    // the project's own files: files/<n>/<name>[/<rel>]
    const itemRefs = new Map(); // project item id → token
    for (const f of body.files || []) {
      const h = !f?.path || P.secretFile(f.path) ? null : here(f.path, { dir: true });
      if (!h) { skipped.push(safeBase(unFile(f?.path || f?.ref || ''))); itemRefs.set(f?.id, null); continue; }
      if (h.dir) {
        const top = entryFor('files', h.path);
        for (const x of walkDir(h.path)) { items.push({ name: `${top}/${x.rel.split('/').map((s) => safeBase(s, 160)).join('/')}`, path: x.abs, size: x.size, mtime: statOf(x.abs)?.mtimeMs }); bytes += x.size; }
        itemRefs.set(f.id, P.tokenOf(top));
      } else {
        const entry = entryFor('files', h.path);
        items.push({ name: entry, path: h.path, size: h.size, mtime: statOf(h.path)?.mtimeMs }); bytes += h.size;
        itemRefs.set(f.id, P.tokenOf(entry));
      }
    }
    const names = new Set();
    for (const it of items) { if (!P.entryOk(it.name) || names.has(it.name.toLowerCase())) throw new Error(`"${it.name}" can't be packed (a name Hearth refuses)`); names.add(it.name.toLowerCase()); }
    if (ctl.signal.aborted) throw cancelErr();
    // the body with tokens: paths → entries, file items → their entries (a file that wasn't found leaves the project);
    // its JSON, CRC and deflate (round 85: on the thread, projbundle-work.js exportB)
    const b = await work('exportB', { job, map: [...map], itemRefs: [...itemRefs] });
    if (ctl.signal.aborted) throw cancelErr();
    const manifest = P.makeManifest({ name: body.project.name, version: versionOf(), platform: process.platform, counts: b.counts, bytes, files: items.length, leftOut: o.leftOut || {}, skipped: [...new Set(skipped)], secrets: (o.secrets || 0) + (a.secrets || 0) });
    const head = [{ name: P.MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 1)) }, { name: P.BODY, pre: { crc: b.crc, size: b.size, method: b.method, bytes: asBuf(b.bytes) } }];
    const total = bytes + head.reduce((s, x) => s + (x.pre ? x.pre.size : x.data.length), 0);
    let done = 0;
    send({ phase: 'write', done, total }, true);
    const size = await writeZip(out, [...head, ...items], { signal: ctl.signal, onBytes: (k, file) => { done += k; send({ phase: 'write', done, total, file: path.basename(file) }); } });
    send({ phase: 'done', done: total, total }, true);
    return { ok: true, path: out, size, files: items.length, bytes, skipped: manifest.skipped, counts: manifest.counts };
  } catch (err) {
    if (err.code === 'ECANCELED') return { ok: false, canceled: true };
    throw err;
  } finally { jobs.delete(job); drop(); }
}

// ---------- reading ----------
async function readAt(fh, pos, len) {
  const b = Buffer.alloc(len);
  let got = 0;
  while (got < len) { const { bytesRead } = await fh.read(b, got, len - got, pos + got); if (!bytesRead) break; got += bytesRead; }
  return got === len ? b : b.subarray(0, got);
}
async function dataStart(fh, e) {
  const lh = await readAt(fh, e.offset, 30);
  if (lh.length < 30 || lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`"${e.name}" is damaged (no header)`);
  return e.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
}
// one small entry's bytes (the manifest, the body), inflated with a cap and CRC-checked
async function readSmall(fh, e, cap) {
  if (e.size > cap) throw new Error(`"${e.name}" is too big`);
  const start = await dataStart(fh, e);
  const raw = await readAt(fh, start, e.csize);
  if (raw.length !== e.csize) throw new Error(`"${e.name}" is cut short`);
  const data = e.method === 8 ? await inflateRaw(raw, { maxOutputLength: Math.max(1, e.size) }) : raw;
  if (data.length !== e.size || crc32(data) !== (e.crc >>> 0)) throw new Error(`"${e.name}" is damaged (its check doesn't match)`);
  return data;
}
async function open(file) {
  const p = unFile(file);
  if (!/\.hearthproject$/i.test(p)) throw new Error('Not a .hearthproject file');
  const st = statOf(p);
  if (!st?.isFile()) throw new Error(`${path.basename(p)} isn't on this computer`);
  if (st.size > P.LIMITS.bundle) throw new Error(`The file is ${P.fmtSize(st.size)}: the most Hearth opens is ${P.fmtSize(P.LIMITS.bundle)}`);
  let entries;
  try { entries = await zipkit.entries(p); } catch (err) { throw new Error(`Not a project file Hearth can read (${err.message})`); }
  return { path: p, size: st.size, entries };
}
// → { ok, problems, manifest, counts, lines, size, path, unpacked }; with body: true the parsed body too (unpack)
// (round 85, projbig85) with job: project.json is read, parsed, checked and counted on the thread (projbundle-work.js
// peekBody: this process held ≈ 1.2 s per look for a 60 MB chat) and kept there for unpack (job) — no body comes here
async function peek(file, { body: wantBody = false, job = null } = {}) {
  if (!wantBody) return peekOff(file, { job });
  return peekHere(file, { body: wantBody });
}
async function peekOff(file, { job = null } = {}) {
  let pk;
  try { pk = await open(file); } catch (err) { return { ok: false, problems: [err.message], path: unFile(file) }; }
  const chk = P.checkEntries(pk.entries, pk.size);
  const base = { path: pk.path, size: pk.size, unpacked: chk.bytes, file: path.basename(pk.path) };
  if (!chk.ok) return { ok: false, problems: chk.problems, ...base };
  let m;
  const fh = await fs.promises.open(pk.path, 'r');
  try { m = JSON.parse((await readSmall(fh, pk.entries.find((e) => e.name === P.MANIFEST), P.LIMITS.manifest)).toString('utf8')); } catch (err) { return { ok: false, problems: [`Its manifest.json can't be read (${err.message})`], ...base }; } finally { await fh.close().catch(() => {}); }
  const mc = P.checkManifest(m);
  if (!mc.ok) return { ok: false, problems: mc.problems, manifest: mc.m, ...base };
  const r = await work('peekBody', { job, file: pk.path, entry: pk.entries.find((e) => e.name === P.BODY), entries: pk.entries.map((e) => ({ name: e.name, dir: Boolean(e.dir) })) })
    .catch((err) => ({ ok: false, problems: [`Its project.json can't be read (${err.message})`] }));
  if (!r.ok) return { ok: false, problems: r.problems, manifest: mc.m, ...base };
  const counts = r.counts;
  const manifest = { ...mc.m, counts };
  if (r.dangling.length) manifest.skipped = [...new Set([...manifest.skipped, ...r.dangling.map((d) => d.split('/').pop())])];
  return { ok: true, problems: [], manifest, counts, lines: P.describe(manifest, counts), from: P.from(manifest), ...base, ...(job != null ? { entries: pk.entries } : {}) };
}
// the way before round 85 (the body parsed here): kept for tools that want the body itself (peek(file, { body: true }))
async function peekHere(file, { body: wantBody = false } = {}) {
  let pk;
  try { pk = await open(file); } catch (err) { return { ok: false, problems: [err.message], path: unFile(file) }; }
  const chk = P.checkEntries(pk.entries, pk.size);
  const base = { path: pk.path, size: pk.size, unpacked: chk.bytes, file: path.basename(pk.path) };
  if (!chk.ok) return { ok: false, problems: chk.problems, ...base };
  const fh = await fs.promises.open(pk.path, 'r');
  try {
    let m; let b;
    try { m = JSON.parse((await readSmall(fh, pk.entries.find((e) => e.name === P.MANIFEST), P.LIMITS.manifest)).toString('utf8')); } catch (err) { return { ok: false, problems: [`Its manifest.json can't be read (${err.message})`], ...base }; }
    const mc = P.checkManifest(m);
    if (!mc.ok) return { ok: false, problems: mc.problems, manifest: mc.m, ...base };
    try { b = JSON.parse((await readSmall(fh, pk.entries.find((e) => e.name === P.BODY), P.LIMITS.body)).toString('utf8')); } catch (err) { return { ok: false, problems: [`Its project.json can't be read (${err.message})`], manifest: mc.m, ...base }; }
    const bc = P.checkBody(b);
    if (!bc.ok) return { ok: false, problems: bc.problems, manifest: mc.m, ...base };
    // what the JSON points at must be in the file (anything else is left out and named)
    const names = new Set(pk.entries.filter((e) => !e.dir).map((e) => e.name));
    const dirs = new Set(); for (const nm of names) { const s = nm.split('/'); for (let i = 3; i < s.length; i += 1) dirs.add(s.slice(0, i).join('/')); }
    const dangling = new Set();
    b = P.rewrite(b, (s) => { const e = P.entryOfToken(s); if (e == null) return s; if (!P.entryOk(e) && !dirs.has(e)) { dangling.add(e); return ''; } if (!names.has(e) && !dirs.has(e)) { dangling.add(e); return ''; } return s; });
    const counts = P.summarize(b);
    const manifest = { ...mc.m, counts };
    if (dangling.size) manifest.skipped = [...new Set([...manifest.skipped, ...[...dangling].map((d) => d.split('/').pop())])];
    return { ok: true, problems: [], manifest, counts, lines: P.describe(manifest, counts), from: P.from(manifest), ...base, ...(wantBody ? { body: b, entries: pk.entries } : {}) };
  } finally { await fh.close().catch(() => {}); }
}
// a fresh folder for this import, inside Hearth's own (data/assets/projects/<name>[ n])
function freshDir(name) {
  const r = root();
  fs.mkdirSync(r, { recursive: true });
  const b = safeName(name, 60);
  let d = path.join(r, b);
  for (let i = 2; fs.existsSync(d); i += 1) d = path.join(r, `${b} ${i}`);
  if (!P.inside(opts.dataDir, d, path)) throw new Error('The project\'s folder would be outside Hearth\'s');
  fs.mkdirSync(d);
  return d;
}
async function freeBytes(dir) {
  try { const s = await fs.promises.statfs(dir); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; }
}
// one entry streamed to its file: inflated, counted (never past its stated size: a zip bomb stops there), CRC-checked
async function extractOne(file, fh, e, target, { signal, onBytes }) {
  const start = await dataStart(fh, e);
  let crc = 0; let n = 0;
  const count = new Transform({ transform(chunk, _e, cb) { n += chunk.length; if (n > e.size) { cb(new Error(`"${e.name}" unpacks to more than it says (a zip bomb?)`)); return; } crc = crc32(chunk, crc); onBytes(chunk.length); cb(null, chunk); } });
  const src = e.csize ? fs.createReadStream(file, { start, end: start + e.csize - 1, highWaterMark: 1 << 20 }) : (() => { const s = new PassThrough(); s.end(); return s; })();
  try {
    await pipeline(src, e.method === 8 ? zlib.createInflateRaw() : new PassThrough(), count, fs.createWriteStream(target, { flags: 'wx' }), { signal });
  } catch (err) { await fs.promises.rm(target, { force: true }).catch(() => {}); throw err.name === 'AbortError' ? cancelErr() : err; }
  if (n !== e.size || (crc >>> 0) !== (e.crc >>> 0)) { await fs.promises.rm(target, { force: true }).catch(() => {}); throw new Error(`"${e.name}" is damaged (its check doesn't match)`); }
}
async function unpack(o = {}, sender = null) {
  const file = String(o.file || '');
  const job = String(o.job || Date.now());
  const pv = await peekOff(file, { job }); // (round 85, projbig85: the body stays on the thread until finishImport)
  if (!pv.ok) return { ok: false, problems: pv.problems, path: pv.path };
  const ctl = new AbortController(); jobs.set(job, ctl);
  const send = progressTo(sender, job);
  let dir = null; let partsDir = null;
  try {
    fs.mkdirSync(root(), { recursive: true });
    const need = pv.unpacked + 256 * 1048576;
    const free = await freeBytes(root());
    if (free < need) return { ok: false, problems: [`Not enough free space: it needs ${P.fmtSize(need)}, ${P.fmtSize(free)} is free.`], path: pv.path };
    dir = freshDir(pv.manifest.name);
    const files = pv.entries.filter((e) => !e.dir && e.name !== P.MANIFEST && e.name !== P.BODY);
    const total = files.reduce((s, e) => s + e.size, 0);
    let done = 0; const bad = [];
    const fh = await fs.promises.open(pv.path, 'r');
    try {
      send({ phase: 'unpack', done, total }, true);
      for (const e of files) {
        if (ctl.signal.aborted) throw cancelErr();
        if (!P.entryOk(e.name)) throw new Error(`"${e.name}" isn't allowed`);
        const target = path.join(dir, ...e.name.split('/'));
        if (!P.inside(dir, target, path)) throw new Error(`"${e.name}" would land outside the project's folder`);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        try { await extractOne(pv.path, fh, e, target, { signal: ctl.signal, onBytes: (k) => { done += k; send({ phase: 'unpack', done, total, file: e.name.split('/').pop() }); } }); } catch (err) { if (err.code === 'ECANCELED') throw err; bad.push(e.name); }
      }
    } finally { await fh.close().catch(() => {}); }
    // the body with this computer's paths (a damaged file's references are left empty and named); (round 85) made on
    // the thread, each big chat's messages left in a part file there (the window adds the chat by name: adopt)
    partsDir = path.join(os.tmpdir(), `hearth-projbundle-${crypto.randomBytes(6).toString('hex')}`);
    const fin = await work('finishImport', { job, dir, bad, partsDir });
    if (fin.parts.length) keepParts(job, partsDir, fin.parts); else fs.promises.rm(partsDir, { recursive: true, force: true }).catch(() => {});
    send({ phase: 'done', done: total, total }, true);
    return { ok: true, dir, body: fin.body, manifest: pv.manifest, skipped: [...pv.manifest.skipped, ...bad.map((x) => `${x.split('/').pop()} (damaged in the file)`)], path: pv.path, ...(fin.parts.length ? { parts: job } : {}) };
  } catch (err) {
    work('forget', { job }).catch(() => {});
    if (dir && P.inside(root(), dir, path)) await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    if (partsDir) { parts.delete(job); await fs.promises.rm(partsDir, { recursive: true, force: true }).catch(() => {}); }
    if (err.code === 'ECANCELED') return { ok: false, canceled: true, path: pv.path };
    return { ok: false, problems: [err.message], path: pv.path };
  } finally { jobs.delete(job); }
}
// an import the window couldn't finish (or took back): its folder goes (only ever inside data/assets/projects)
async function discard(dir) {
  if (!dir || !P.inside(root(), String(dir), path)) return false;
  await fs.promises.rm(String(dir), { recursive: true, force: true });
  return true;
}

// ---------- (round 85, projbig85) big chats added by name ----------
// an import's part files (a temporary folder of its own, removed by release or 30 minutes after)
const parts = new Map(); // job → { dir, keys: Set, t }
function keepParts(job, dir, keys) {
  const t = setTimeout(() => release(job), 30 * 60000); t.unref?.();
  parts.set(job, { dir, keys: new Set(keys), t });
}
async function release(job) {
  const p = parts.get(String(job));
  if (!p) return false;
  parts.delete(String(job)); clearTimeout(p.t);
  await fs.promises.rm(p.dir, { recursive: true, force: true }).catch(() => {});
  return true;
}
// what the window needs to put a project's big chats in a bundle / a copy without holding them: each chat's state
// (read on the thread, after its saves on their way). ids: chat ids → { [id]: { state, size?, n?, head?, paths? } }
async function chatsInfo(ids = []) {
  const files = [...new Set((Array.isArray(ids) ? ids : []).map(String))].map((id) => ({ id, file: chatFile(id) })).filter((x) => x.file);
  if (!files.length) return {};
  await opts.idle?.();
  return work('chatInfo', { files });
}
// a big chat written whole by the store thread (opts.adoptChat → store.js adoptChatBig): its own fields (head: what the
// window made of them: fresh id, its AI, session out) + the messages of an import's part file (job + part) or of a
// chat here (chat: its id, Duplicate). Never over a chat that's there; a source that can't be read writes nothing.
async function adopt({ job, part, chat, id, head } = {}) {
  const file = chatFile(id);
  if (!file || !head || typeof head !== 'object' || Array.isArray(head)) return { ok: false, error: 'Not a chat Hearth can add' };
  let src = null;
  if (part != null) { const p = parts.get(String(job)); if (!p || !p.keys.has(String(part))) return { ok: false, error: 'That part of the project file is gone (import it again)' }; src = { file: path.join(p.dir, String(part)), list: true }; }
  else { const f = chatFile(chat); if (!f) return { ok: false, error: 'Not a chat Hearth can copy' }; src = { file: f, list: false }; }
  if (!opts.adoptChat) return { ok: false, error: 'Hearth can\'t add it just now' };
  const r = await opts.adoptChat({ file, head: { ...head, id: String(id) }, src });
  return r || { ok: false, error: 'Hearth can\'t add it just now' };
}

function register(ipcMain, o = {}) {
  opts = { ...opts, ...o };
  ipcMain.handle('projbundle:sizes', (_e, a) => sizes(a || {}));
  ipcMain.handle('projbundle:export', (e, a) => exportBundle(a || {}, e.sender));
  ipcMain.handle('projbundle:peek', (_e, file) => peek(String(file || '')));
  ipcMain.handle('projbundle:unpack', (e, a) => unpack(a || {}, e.sender));
  ipcMain.handle('projbundle:discard', (_e, dir) => discard(dir));
  ipcMain.handle('projbundle:cancel', (_e, job) => { const c = jobs.get(String(job)); if (c) c.abort(); return Boolean(c); });
  // (round 85, projbig85) big chats by name
  ipcMain.handle('projbundle:chats', (_e, ids) => chatsInfo(ids));
  ipcMain.handle('projbundle:adopt', async (_e, a) => { try { return await adopt(a || {}); } catch (err) { return { ok: false, error: err.message }; } });
  ipcMain.handle('projbundle:release', (_e, job) => release(job));
}

module.exports = { register, sizes, exportBundle, peek, peekHere, unpack, discard, chatsInfo, adopt, release, writeZip, walkDir, cancel: (job) => jobs.get(String(job))?.abort(), _set: (o) => { opts = { ...opts, ...o }; }, _partsDir: (job) => parts.get(String(job))?.dir || null };
