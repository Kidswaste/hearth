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
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
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
function sizes({ paths = [], dirs = [] } = {}) {
  const one = (p, dir) => {
    if (P.secretFile(p)) return { path: p, found: false, secret: true, size: 0 };
    const h = here(p, { dir });
    if (!h) return { path: p, found: false, size: 0 };
    if (h.dir) { const fs2 = walkDir(h.path); return { path: p, found: true, dir: true, files: fs2.length, size: fs2.reduce((n, f) => n + f.size, 0) }; }
    return { path: p, found: true, files: 1, size: h.size };
  };
  return { files: paths.map((p) => one(p, false)), dirs: dirs.map((p) => one(p, true)) };
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
      if (it.data) {
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
async function exportBundle(o = {}, sender = null) {
  const body = P.copy(o.body || {});
  if (!body.project) throw new Error('Nothing to export');
  const chk = P.checkBody(body);
  if (!chk.ok) throw new Error(chk.problems[0]);
  const out = o.out || await pickOut(o.name || body.project.name);
  if (!out) return { ok: false, canceled: true };
  const job = String(o.job || Date.now());
  const ctl = new AbortController(); jobs.set(job, ctl);
  const send = progressTo(sender, job);
  try {
    send({ phase: 'plan', done: 0, total: 0 }, true);
    // the files the JSON points at: assets/<n>/<name>
    const items = []; const skipped = []; const map = new Map();
    let n = 0; let bytes = 0;
    const entryFor = (kind, nm) => `${kind}/${n++}/${safeBase(nm)}`;
    // (the project's file / capture / render / download items are its own files, below: not assets)
    const assetSrc = { ...body, files: undefined, project: { ...body.project, items: body.project.items.filter((x) => !P.KIND_ITEMS.includes(x.type)) } };
    for (const src of P.collectPaths(assetSrc)) {
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
    // the body with tokens: paths → entries, file items → their entries (a file that wasn't found leaves the project)
    let b2 = P.rewrite(body, (s) => (map.has(s) ? map.get(s) : s));
    b2.project.items = b2.project.items.filter((x) => !itemRefs.has(x.id) || itemRefs.get(x.id)).map((x) => (itemRefs.get(x.id) ? { ...x, ref: itemRefs.get(x.id), id: `${x.type}:${itemRefs.get(x.id)}` } : x));
    if (b2.project.cover && !b2.project.items.some((x) => x.id === b2.project.cover)) { const was = body.project.items.find((x) => x.id === b2.project.cover); b2.project.cover = was && itemRefs.get(was.id) ? `${was.type}:${itemRefs.get(was.id)}` : null; }
    b2.files = (b2.files || []).filter((f) => itemRefs.get(f.id)).map((f) => ({ id: `${f.type}:${itemRefs.get(f.id)}`, type: f.type, name: f.name || '', dir: Boolean(f.dir), path: itemRefs.get(f.id) }));
    b2 = JSON.parse(JSON.stringify(b2));
    const manifest = P.makeManifest({ name: body.project.name, version: versionOf(), platform: process.platform, counts: P.summarize(b2), bytes, files: items.length, leftOut: o.leftOut || {}, skipped: [...new Set(skipped)], secrets: o.secrets || 0 });
    const head = [{ name: P.MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 1)) }, { name: P.BODY, data: Buffer.from(JSON.stringify(b2)) }];
    const total = bytes + head.reduce((s, x) => s + x.data.length, 0);
    let done = 0;
    send({ phase: 'write', done, total }, true);
    const size = await writeZip(out, [...head, ...items], { signal: ctl.signal, onBytes: (k, file) => { done += k; send({ phase: 'write', done, total, file: path.basename(file) }); } });
    send({ phase: 'done', done: total, total }, true);
    return { ok: true, path: out, size, files: items.length, bytes, skipped: manifest.skipped, counts: manifest.counts };
  } catch (err) {
    if (err.code === 'ECANCELED') return { ok: false, canceled: true };
    throw err;
  } finally { jobs.delete(job); }
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
async function peek(file, { body: wantBody = false } = {}) {
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
  const pv = await peek(file, { body: true });
  if (!pv.ok) return { ok: false, problems: pv.problems, path: pv.path };
  const job = String(o.job || Date.now());
  const ctl = new AbortController(); jobs.set(job, ctl);
  const send = progressTo(sender, job);
  let dir = null;
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
    // the body with this computer's paths (a damaged file's references are left empty and named)
    const badSet = new Set(bad);
    const local = (entry) => path.join(dir, ...entry.split('/'));
    const body = P.rewrite(pv.body, (s) => { const e = P.entryOfToken(s); if (e == null) return s; if (badSet.has(e)) return ''; return local(e); });
    send({ phase: 'done', done: total, total }, true);
    return { ok: true, dir, body, manifest: pv.manifest, skipped: [...pv.manifest.skipped, ...bad.map((x) => `${x.split('/').pop()} (damaged in the file)`)], path: pv.path };
  } catch (err) {
    if (dir && P.inside(root(), dir, path)) await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
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

function register(ipcMain, o = {}) {
  opts = { ...opts, ...o };
  ipcMain.handle('projbundle:sizes', (_e, a) => sizes(a || {}));
  ipcMain.handle('projbundle:export', (e, a) => exportBundle(a || {}, e.sender));
  ipcMain.handle('projbundle:peek', (_e, file) => peek(String(file || '')));
  ipcMain.handle('projbundle:unpack', (e, a) => unpack(a || {}, e.sender));
  ipcMain.handle('projbundle:discard', (_e, dir) => discard(dir));
  ipcMain.handle('projbundle:cancel', (_e, job) => { const c = jobs.get(String(job)); if (c) c.abort(); return Boolean(c); });
}

module.exports = { register, sizes, exportBundle, peek, unpack, discard, writeZip, walkDir, cancel: (job) => jobs.get(String(job))?.abort(), _set: (o) => { opts = { ...opts, ...o }; } };
