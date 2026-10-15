// (round 46, platform46) Zips in plain Node (zlib), the same on the Mac, Windows and Linux. Backups (backupautomain) and
// the app's other zips (fsapi: packs, board exports, restores) used Linux's zip / unzip and the system tar elsewhere,
// which broke in quiet ways on the owner's two computers:
//   · Windows' tar.exe writes names in the PC's old code page: an accent or emoji in a file name came back as "?"
//     (or stopped the zip), and it fails on paths over 260 characters
//   · the Mac's tar adds "._name" AppleDouble files for files with extended attributes (most files an app writes on a
//     recent macOS): the backup's check read data/kv/._notes.json as a damaged store and called the backup bad
//   · a missing / blocked tool (old Windows, a locked-down PC) meant no backups at all
// Here: names always UTF-8 (flag 11, NFC), deflate (or stored when that's smaller), a CRC check of every file read back,
// Zip64 for very big zips; nothing outside the destination is ever written (no "..", no absolute names). Any standard
// tool reads these zips (Explorer, Finder's Archive Utility, unzip, tar, 7-Zip).
//   writeZip(srcDir, target, { level, skip(rel, isDir), big }) → { files, bytes }   (every file under srcDir, names relative)
//   entries(zip)                    → [{ name, size, csize, method, crc, offset, dir }]  (the central directory)
//   names(zip)                      → [name] (files only, '/' separated)
//   extract(zip, dest, { members, skipBad }) → { files, bad } — members: exact names, or folder prefixes ending in '/'; a damaged
//                                     file throws { code: 'EZIPCRC', entry } ("data/kv/notes.json doesn't read back"),
//                                     or with skipBad is left out and named in bad (Recover takes what reads)
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const deflateRaw = promisify(zlib.deflateRaw);
const inflateRaw = promisify(zlib.inflateRaw);
const BIG = 64 * 1024 * 1024; // files at least this big are streamed (stored, not deflated: media rarely shrinks)
const U32 = 0xffffffff;

// ---------- CRC-32 (zlib's own when this Node has it) ----------
let TABLE = null;
function crcSlow(buf, prev = 0) {
  if (!TABLE) { TABLE = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c; } }
  let c = (prev ^ U32) >>> 0;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ U32) >>> 0;
}
const crc32 = typeof zlib.crc32 === 'function' ? (buf, prev = 0) => zlib.crc32(buf, prev) >>> 0 : crcSlow;

// ---------- small helpers ----------
function dosTime(ms) {
  const d = new Date(ms || Date.now());
  const y = Math.max(1980, d.getFullYear());
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
const err = (message, code, extra = {}) => Object.assign(new Error(message), { code, ...extra });
// a name inside the zip that can't land outside the destination
function safeName(name) {
  const n = String(name || '').replace(/\\/g, '/');
  if (!n || n.startsWith('/') || /^[A-Za-z]:/.test(n) || n.split('/').some((s) => s === '..')) return null;
  return n.replace(/^(\.\/)+/, '');
}
async function readAt(fh, pos, len) {
  const b = Buffer.alloc(len);
  let got = 0;
  while (got < len) { const { bytesRead } = await fh.read(b, got, len - got, pos + got); if (!bytesRead) break; got += bytesRead; }
  return got === len ? b : b.subarray(0, got);
}

// ---------- writing ----------
async function listFiles(root, skip) {
  const out = [];
  async function walk(dir, rel) {
    const ents = await fsp.readdir(dir, { withFileTypes: true });
    ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (skip?.(r, e.isDirectory())) continue;
      if (e.isDirectory()) await walk(path.join(dir, e.name), r);
      else if (e.isFile()) out.push({ abs: path.join(dir, e.name), rel: r });
    }
  }
  await walk(root, '');
  return out;
}
async function writeZip(srcDir, target, { level = 6, skip = null, big = BIG } = {}) {
  const files = await listFiles(srcDir, skip);
  const fh = await fsp.open(target, 'w');
  const central = [];
  let pos = 0; let bytes = 0;
  const put = async (buf) => { await fh.write(buf, 0, buf.length, pos); pos += buf.length; };
  try {
    for (const f of files) {
      const st = await fsp.stat(f.abs);
      const name = Buffer.from(f.rel.normalize('NFC'), 'utf8');
      const { time, date } = dosTime(st.mtimeMs);
      const offset = pos;
      let method = 8; let crc = 0; let size = st.size; let csize = 0; let data = null;
      if (st.size < big) {
        const raw = await fsp.readFile(f.abs);
        size = raw.length; crc = crc32(raw);
        const comp = await deflateRaw(raw, { level });
        if (comp.length < raw.length) { data = comp; } else { data = raw; method = 0; }
        csize = data.length;
      } else {
        method = 0; // big: two passes (the CRC, then the bytes), never the whole file in memory
        for await (const chunk of fs.createReadStream(f.abs)) crc = crc32(chunk, crc);
        csize = size;
      }
      const z64 = size >= U32;
      const extra = z64 ? Buffer.alloc(20) : Buffer.alloc(0);
      if (z64) { extra.writeUInt16LE(1, 0); extra.writeUInt16LE(16, 2); extra.writeBigUInt64LE(BigInt(size), 4); extra.writeBigUInt64LE(BigInt(csize), 12); }
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(z64 ? 45 : 20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
      h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14);
      h.writeUInt32LE(z64 ? U32 : csize, 18); h.writeUInt32LE(z64 ? U32 : size, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(extra.length, 28);
      await put(Buffer.concat([h, name, extra]));
      if (data) await put(data);
      else {
        let copied = 0;
        for await (const chunk of fs.createReadStream(f.abs)) { await put(chunk); copied += chunk.length; }
        if (copied !== size) throw err(`${f.rel} changed while it was zipped`, 'EZIPCHANGED', { entry: f.rel });
      }
      bytes += size;
      central.push({ name, method, time, date, crc, size, csize, offset, mode: (st.mode & 0o777) || 0o644 }); // (a script keeps its "run me" bit on the Mac)
    }
    // the central directory (+ Zip64 records when the zip is that big or holds that many files)
    const cdStart = pos;
    for (const c of central) {
      const big = { size: c.size >= U32, off: c.offset >= U32 };
      const parts = [];
      if (big.size) parts.push(BigInt(c.size), BigInt(c.csize));
      if (big.off) parts.push(BigInt(c.offset));
      const extra = parts.length ? Buffer.alloc(4 + 8 * parts.length) : Buffer.alloc(0);
      if (parts.length) { extra.writeUInt16LE(1, 0); extra.writeUInt16LE(8 * parts.length, 2); parts.forEach((v, i) => extra.writeBigUInt64LE(v, 4 + 8 * i)); }
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE((3 << 8) | 45, 4); h.writeUInt16LE(parts.length ? 45 : 20, 6); h.writeUInt16LE(0x0800, 8);
      h.writeUInt16LE(c.method, 10); h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14); h.writeUInt32LE(c.crc, 16);
      h.writeUInt32LE(big.size ? U32 : c.csize, 20); h.writeUInt32LE(big.size ? U32 : c.size, 24); h.writeUInt16LE(c.name.length, 28); h.writeUInt16LE(extra.length, 30);
      h.writeUInt32LE(((0o100000 | c.mode) << 16) >>> 0, 38); h.writeUInt32LE(big.off ? U32 : c.offset, 42);
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
  } finally { await fh.close(); }
  return { files: central.length, bytes };
}

// ---------- reading ----------
function decodeName(buf, utf8) {
  if (!utf8) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return buf.toString('latin1'); } }
  return buf.toString('utf8');
}
async function entriesOf(fh) {
  const { size } = await fh.stat();
  if (size < 22) throw err('not a zip (too short)', 'EZIPFORMAT');
  const tailLen = Math.min(size, 22 + 0xffff + 20);
  const tail = await readAt(fh, size - tailLen, tailLen);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { at = i; break; }
  if (at < 0) throw err('not a zip (no end record: cut short or damaged)', 'EZIPFORMAT');
  let count = tail.readUInt16LE(at + 10); let cdSize = tail.readUInt32LE(at + 12); let cdStart = tail.readUInt32LE(at + 16);
  if ((count === 0xffff || cdSize === U32 || cdStart === U32) && at >= 20 && tail.readUInt32LE(at - 20) === 0x07064b50) {
    const recAt = Number(tail.readBigUInt64LE(at - 20 + 8));
    const rec = await readAt(fh, recAt, 56);
    if (rec.length === 56 && rec.readUInt32LE(0) === 0x06064b50) { count = Number(rec.readBigUInt64LE(32)); cdSize = Number(rec.readBigUInt64LE(40)); cdStart = Number(rec.readBigUInt64LE(48)); }
  }
  if (cdStart + cdSize > size) throw err('not a zip (its list of files is cut short)', 'EZIPFORMAT');
  const cd = await readAt(fh, cdStart, cdSize);
  const out = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw err('the zip\'s list of files is damaged', 'EZIPFORMAT');
    const flags = cd.readUInt16LE(p + 8); const method = cd.readUInt16LE(p + 10); const crc = cd.readUInt32LE(p + 16);
    let csize = cd.readUInt32LE(p + 20); let usize = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28); const xl = cd.readUInt16LE(p + 30); const cl = cd.readUInt16LE(p + 32);
    let offset = cd.readUInt32LE(p + 42);
    const name = decodeName(cd.subarray(p + 46, p + 46 + nl), flags & 0x0800).replace(/\\/g, '/');
    // Zip64 sizes / offset
    let x = p + 46 + nl; const xEnd = x + xl;
    while (x + 4 <= xEnd) {
      const id = cd.readUInt16LE(x); const len = cd.readUInt16LE(x + 2); let q = x + 4;
      if (id === 1) {
        if (usize === U32 && q + 8 <= x + 4 + len) { usize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (csize === U32 && q + 8 <= x + 4 + len) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (offset === U32 && q + 8 <= x + 4 + len) { offset = Number(cd.readBigUInt64LE(q)); q += 8; }
      }
      x += 4 + len;
    }
    out.push({ name, size: usize, csize, method, crc, offset, flags, dir: name.endsWith('/') });
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function entries(zip) { const fh = await fsp.open(zip, 'r'); try { return await entriesOf(fh); } finally { await fh.close(); } }
async function names(zip) { return (await entries(zip)).filter((e) => !e.dir).map((e) => e.name.replace(/^(\.\/)+/, '')); }

const wanted = (members) => {
  if (!members) return () => true;
  const list = [].concat(members).map((m) => String(m).replace(/\\/g, '/'));
  return (n) => list.some((m) => (m.endsWith('/') ? n.startsWith(m) : n === m));
};
async function extract(zip, dest, { members = null, big = BIG, skipBad = false } = {}) {
  const fh = await fsp.open(zip, 'r');
  const want = wanted(members);
  let files = 0; const badList = [];
  async function one(e, name) {
    if (e.flags & 1) throw err(`${name} is password-protected`, 'EZIPMETHOD', { entry: name });
    if (e.method !== 0 && e.method !== 8) throw err(`${name} uses a kind of zip compression Hearth can't read (${e.method})`, 'EZIPMETHOD', { entry: name });
    const bad = (why) => err(`${name} doesn't read back the same${why ? ` (${why})` : ''}`, 'EZIPCRC', { entry: name });
    const lh = await readAt(fh, e.offset, 30);
    if (lh.length < 30 || lh.readUInt32LE(0) !== 0x04034b50) throw bad();
    const start = e.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const to = path.join(dest, ...name.split('/'));
    await fsp.mkdir(path.dirname(to), { recursive: true });
    if (e.size < big && e.csize < big) {
      const raw = await readAt(fh, start, e.csize);
      if (raw.length !== e.csize) throw bad('cut short');
      let data;
      try { data = e.method === 8 ? await inflateRaw(raw) : raw; } catch (x) { throw bad(x.message); }
      if (data.length !== e.size || crc32(data) !== e.crc) throw bad();
      await fsp.writeFile(to, data);
      return;
    }
    // big: streamed through, the CRC counted on the way (a damaged one doesn't stay behind)
    let crc = 0; let n = 0;
    const src = fs.createReadStream(null, { fd: fh.fd, start, end: start + e.csize - 1, autoClose: false });
    const mid = e.method === 8 ? src.pipe(zlib.createInflateRaw()) : src;
    const out = fs.createWriteStream(to);
    try {
      for await (const chunk of mid) { crc = crc32(chunk, crc); n += chunk.length; if (!out.write(chunk)) await new Promise((r) => out.once('drain', r)); }
    } catch (x) { out.destroy(); await fsp.rm(to, { force: true }).catch(() => {}); throw bad(x.message); }
    await new Promise((res, rej) => out.end((x) => (x ? rej(x) : res())));
    if (n !== e.size || crc !== e.crc) { await fsp.rm(to, { force: true }).catch(() => {}); throw bad(); }
  }
  try {
    for (const e of await entriesOf(fh)) {
      const name = safeName(e.name);
      if (!name || e.dir || !want(name)) continue;
      try { await one(e, name); files += 1; } catch (x) { if (!skipBad || x.code !== 'EZIPCRC') throw x; badList.push(name); }
    }
  } finally { await fh.close(); }
  return { files, bad: badList };
}

module.exports = { writeZip, entries, names, extract, crc32, _test: { crcSlow, safeName, dosTime, BIG } };
