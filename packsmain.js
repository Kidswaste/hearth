// Packs, main side (round 28, packs; the window side is tools/three-packs.js, the format packs-core.js). Loaded on
// its first IPC call (main.js lazyIpc). Reads and writes .hearthpack files (a plain zip) with Node's own zlib:
//   packs:plan (body)            the files a scene uses (every absolute path in its JSON: textures, HDRIs, models,
//                                fonts, LUTs, footage, the song), found here or through the sync path mapping
//                                (reachmain.js localize: a path from the other computer), with their sizes
//   packs:write ({ body, meta, inline, thumb, name, out })   the pack, saved where the owner picks (a save dialog;
//                                HEARTH_TEST_SAVE_DIR in tests), written to <file>.part then renamed
//   packs:peek (file)            the card's facts without unpacking: the manifest (checked), its picture, the size,
//                                where it is; every entry checked first (packs-core checkEntries: no zip-slip, caps)
//   packs:unpack (file)          its files into Hearth's own folder only: data/assets/packs/<pack name>/ (each
//                                target checked to sit inside it), CRC-checked, inflated with a size cap; a failure
//                                removes what it wrote
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const P = require('./packs-core');

const inflateRaw = promisify(zlib.inflateRaw);
const deflateRaw = promisify(zlib.deflateRaw);
let opts = { dataDir: path.join(__dirname, 'data'), getWin: () => null };
const crcOf = (buf) => (typeof zlib.crc32 === 'function' ? zlib.crc32(buf) >>> 0 : P.crc32(buf));
const statOf = (p) => { try { return fs.statSync(p); } catch { return null; } };
const unFile = (s) => { let p = String(s).replace(/^file:\/\/(localhost)?/i, ''); try { p = decodeURIComponent(p); } catch { /* as is */ } if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1); return p; };
const packsRoot = () => path.join(opts.dataDir, 'assets', 'packs');

// ---------- the files a scene uses ----------
// a path as the JSON has it → this computer's file (or null): as it is, else the other computer's form mapped here
function here(p) {
  const raw = unFile(p);
  const st = statOf(raw);
  if (st?.isFile()) return { path: raw, size: st.size };
  try {
    const hit = require('./reachmain').localize(raw);
    const st2 = hit?.path ? statOf(hit.path) : null;
    if (st2?.isFile()) return { path: hit.path, size: st2.size };
  } catch { /* no mapping */ }
  return null;
}
// → { found: [{ src (as in the JSON), path, size, entry }], missing: [base names], bytes, map (src → entry) }
function plan(body, inline = []) {
  const found = []; const missing = [];
  let bytes = 0;
  for (const src of P.collectPaths(body)) {
    const f = here(src);
    if (!f) { missing.push(P.safeBase(unFile(src))); continue; }
    if (f.size > P.LIMITS.entry) { missing.push(`${P.safeBase(f.path)} (over ${P.fmtSize(P.LIMITS.entry)})`); continue; }
    if (bytes + f.size > P.LIMITS.pack) { missing.push(`${P.safeBase(f.path)} (the pack is full)`); continue; }
    found.push({ src, path: f.path, size: f.size });
    bytes += f.size;
  }
  // inline files (a LUT written out as .cube text) get names among the others
  const names = P.entryNames([...found.map((f) => f.path), ...inline.map((x) => `/inline/${x.name}`)]);
  for (const f of found) f.entry = names.get(f.path);
  const inl = inline.map((x) => ({ ...x, entry: names.get(`/inline/${x.name}`), size: Buffer.byteLength(String(x.text || '')) }));
  for (const x of inl) bytes += x.size;
  return { found, inline: inl, missing: [...new Set(missing)], bytes, map: new Map(found.map((f) => [f.src, f.entry])) };
}

// ---------- writing ----------
async function writeZip(out, items) {
  const tmp = `${out}.part`;
  const fh = await fs.promises.open(tmp, 'w');
  const central = [];
  let off = 0;
  try {
    for (const it of items) {
      const data = it.data ?? await fs.promises.readFile(it.path);
      const method = it.method ?? P.methodFor(it.name);
      let body = data;
      if (method === 8) body = await deflateRaw(data, { level: 6 });
      const e = { name: it.name, method, crc: crcOf(data), csize: body.length, size: data.length, at: new Date(), offset: off };
      const lh = P.localHeader(e);
      await fh.write(lh, 0, lh.length, off); off += lh.length;
      await fh.write(body, 0, body.length, off); off += body.length;
      central.push(e);
      if (off > P.LIMITS.pack) throw new Error(`The pack would be over ${P.fmtSize(P.LIMITS.pack)}`);
    }
    const cd0 = off;
    for (const e of central) { const ch = P.centralHeader(e); await fh.write(ch, 0, ch.length, off); off += ch.length; }
    const end = P.endRecord(central.length, off - cd0, cd0);
    await fh.write(end, 0, end.length, off); off += end.length;
  } catch (err) { await fh.close().catch(() => {}); fs.rmSync(tmp, { force: true }); throw err; }
  await fh.close();
  fs.renameSync(tmp, out);
  return off;
}
async function pickOut(name) {
  const file = `${P.safeName(name, 60)}${P.EXT}`;
  if (process.env.HEARTH_TEST_SAVE_DIR) { fs.mkdirSync(process.env.HEARTH_TEST_SAVE_DIR, { recursive: true }); return path.join(process.env.HEARTH_TEST_SAVE_DIR, file); }
  const { dialog, app } = require('electron');
  let dir = os.homedir();
  try { dir = app.getPath('downloads'); } catch { /* home */ }
  const r = await dialog.showSaveDialog(opts.getWin() || undefined, { title: 'Save as a pack', defaultPath: path.join(dir, file), filters: [{ name: 'Hearth pack', extensions: ['hearthpack'] }] });
  if (r.canceled || !r.filePath) return null;
  return /\.hearthpack$/i.test(r.filePath) ? r.filePath : `${r.filePath}${P.EXT}`;
}
// { body: { scenes, sequence, song, luts }, meta: { kind, name, desc }, inline: [{ name, text }], thumb: dataURL, out }
async function write(o = {}) {
  const body = o.body || {};
  const meta = o.meta || {};
  const pl = plan(body, o.inline || []);
  const tok = (s) => (pl.map.has(s) ? P.tokenOf(pl.map.get(s)) : P.isPathLike(s) ? '' : s); // a path it couldn't pack isn't kept (it's the owner's folder layout)
  const b2 = P.rewrite(body, tok);
  // the inline files' tokens ("inline:<name>" in the body) → their entries
  const inl = new Map(pl.inline.map((x) => [`inline:${x.name}`, x.entry]));
  const b3 = P.rewrite(b2, (s) => (inl.has(s) ? P.tokenOf(inl.get(s)) : s));
  let version = '';
  try { version = require('electron').app.getVersion(); } catch { /* plain Node */ }
  const files = [...pl.found.map((f) => ({ name: f.entry, size: f.size, kind: P.kindOf(f.entry) })), ...pl.inline.map((x) => ({ name: x.entry, size: x.size, kind: P.kindOf(x.entry) }))];
  const manifest = P.makeManifest({ ...meta, ...b3, version, platform: process.platform, files, missing: pl.missing });
  const out = o.out || await pickOut(meta.name || 'Scene');
  if (!out) return { ok: false, canceled: true };
  const items = [{ name: P.MANIFEST, data: Buffer.from(JSON.stringify(manifest)), method: 8 }];
  const th = /^data:image\/(jpeg|png|webp);base64,/.exec(String(o.thumb || ''));
  if (th) { const buf = Buffer.from(String(o.thumb).slice(th[0].length), 'base64'); if (buf.length <= P.LIMITS.thumb) items.push({ name: P.THUMB, data: buf, method: 0 }); }
  for (const f of pl.found) items.push({ name: f.entry, path: f.path });
  for (const x of pl.inline) items.push({ name: x.entry, data: Buffer.from(String(x.text || '')) });
  const size = await writeZip(out, items);
  return { ok: true, path: out, size, files: files.length, missing: pl.missing };
}

// ---------- reading ----------
async function openPack(file) {
  const p = unFile(file);
  if (!/\.hearthpack$/i.test(p)) throw new Error('Not a .hearthpack file');
  const st = statOf(p);
  if (!st?.isFile()) throw new Error(`${path.basename(p)} isn't on this computer`);
  if (st.size > P.LIMITS.pack) throw new Error(`The pack is ${P.fmtSize(st.size)}: the most Hearth opens is ${P.fmtSize(P.LIMITS.pack)}`);
  const fh = await fs.promises.open(p, 'r');
  try {
    const n = Math.min(st.size, 65557);
    const tail = Buffer.alloc(n);
    await fh.read(tail, 0, n, st.size - n);
    const end = P.findEnd(tail, st.size);
    if (!end) throw new Error('Not a pack (no zip directory at its end)');
    if (end.count > P.LIMITS.entries) throw new Error(`It holds ${end.count} files: the most is ${P.LIMITS.entries}`);
    const cd = Buffer.alloc(end.cdSize);
    await fh.read(cd, 0, end.cdSize, end.cdOffset);
    const entries = P.readCentral(cd, end.count);
    return { path: p, size: st.size, entries, fh };
  } catch (err) { await fh.close().catch(() => {}); throw err; }
}
// one entry's bytes, inflated (capped at its stated size) and CRC-checked
async function readEntry(fh, e) {
  const lh = Buffer.alloc(30);
  await fh.read(lh, 0, 30, e.offset);
  const start = P.dataStart(lh, e.offset);
  const raw = Buffer.alloc(e.csize);
  if (e.csize) await fh.read(raw, 0, e.csize, start);
  const data = e.method === 8 ? await inflateRaw(raw, { maxOutputLength: Math.max(1, e.size) }) : raw;
  if (data.length !== e.size || crcOf(data) !== (e.crc >>> 0)) throw new Error(`"${e.name}" is damaged (its check doesn't match)`);
  return data;
}
async function peek(file) {
  let pk;
  try { pk = await openPack(file); } catch (err) { return { ok: false, problems: [err.message], path: unFile(file) }; }
  try {
    const chk = P.checkEntries(pk.entries, pk.size);
    const base = { path: pk.path, size: pk.size, unpacked: chk.bytes, name: path.basename(pk.path) };
    if (!chk.ok) return { ok: false, problems: chk.problems, ...base };
    let m;
    try { m = JSON.parse((await readEntry(pk.fh, pk.entries.find((e) => e.name === P.MANIFEST))).toString('utf8')); } catch (err) { return { ok: false, problems: [`Its hearthpack.json can't be read (${err.message})`], ...base }; }
    const mc = P.checkManifest(m, pk.entries);
    let thumb = null;
    const te = pk.entries.find((e) => e.name === P.THUMB);
    if (te) { try { thumb = `data:image/jpeg;base64,${(await readEntry(pk.fh, te)).toString('base64')}`; } catch { /* no picture */ } }
    return { ok: mc.ok, problems: mc.problems, manifest: mc.m, thumb, ...base };
  } finally { await pk.fh.close().catch(() => {}); }
}
// a fresh folder for this pack's files, inside Hearth's own (data/assets/packs/<name>[ n])
function freshDir(name) {
  const root = packsRoot();
  fs.mkdirSync(root, { recursive: true });
  const b = P.safeName(name, 60);
  let d = path.join(root, b);
  for (let i = 2; fs.existsSync(d); i += 1) d = path.join(root, `${b} ${i}`);
  if (!P.inside(opts.dataDir, d, path)) throw new Error('The pack\'s folder would be outside Hearth\'s');
  fs.mkdirSync(d);
  return d;
}
async function unpack(file) {
  const pv = await peek(file);
  if (!pv.ok) return pv;
  const pk = await openPack(file);
  let dir = null;
  try {
    dir = freshDir(pv.manifest.name);
    const map = {};
    for (const e of pk.entries) {
      if (!e.name.startsWith('files/')) continue;
      if (!P.entryOk(e.name)) throw new Error(`"${e.name}" isn't allowed`);
      const target = path.join(dir, P.safeBase(e.name.slice(6)));
      if (!P.inside(dir, target, path)) throw new Error(`"${e.name}" would land outside the pack's folder`);
      const data = await readEntry(pk.fh, e);
      fs.writeFileSync(target, data, { flag: 'wx' }); // never over a file that's there
      map[e.name] = target;
    }
    return { ok: true, dir, map, manifest: pv.manifest, size: pv.size, path: pv.path };
  } catch (err) {
    if (dir && P.inside(packsRoot(), dir, path)) fs.rmSync(dir, { recursive: true, force: true });
    return { ok: false, problems: [err.message], path: pv.path };
  } finally { await pk.fh.close().catch(() => {}); }
}

function register(ipcMain, o = {}) {
  opts = { ...opts, ...o };
  ipcMain.handle('packs:plan', (_e, body, inline) => { const r = plan(body || {}, inline || []); return { files: [...r.found.map((f) => ({ path: f.path, entry: f.entry, size: f.size, kind: P.kindOf(f.entry) })), ...r.inline.map((x) => ({ entry: x.entry, size: x.size, kind: P.kindOf(x.entry) }))], missing: r.missing, bytes: r.bytes }; });
  ipcMain.handle('packs:write', (_e, a) => write(a || {}));
  ipcMain.handle('packs:peek', (_e, file) => peek(String(file || '')));
  ipcMain.handle('packs:unpack', (_e, file) => unpack(String(file || '')));
}

module.exports = { register, plan, write, peek, unpack, writeZip, _set: (o) => { opts = { ...opts, ...o }; } };
