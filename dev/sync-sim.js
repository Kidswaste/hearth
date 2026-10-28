// (round 72, sync72) A two-computer simulation for the sync engine, closer to real life than one shared folder:
// each computer has its OWN view of the cloud drive (like iCloud Drive / OneDrive / Dropbox on a real Mac and PC), and
// a fake cloud provider copies between the views and a "server" with the troubles real clients have:
//   · delays (a view only changes when its provider ticks; a computer can be offline for days)
//   · uploads that take several ticks, downloads written in place in pieces (a half file for a while)
//   · cloud-only placeholders: iCloud ".name.icloud" stubs (brctl download asks for them), Mac "dataless" files
//     (sparse: size but no blocks, reading downloads them), OneDrive online-only files (attributes say "pending")
//   · the provider's own conflict copies when both computers changed a file ("x 2.json", "x-PC.json",
//     "x (PC's conflicted copy …).json"), case-only renames and Mac file names in NFD
//   · per-computer clocks (skew) carried in the files' modified times
// Mac and Windows disks ignore case (and the Mac ignores Unicode forms): ciVolume(dir) makes a folder behave like that
// on this Linux box, for every fs call of the process (the engine included). Only folders made by the test are used.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
const Hard = require('../sync-hard'); // (round 74, synchard74) Windows names
const fold = (s) => String(s).normalize('NFC').toLowerCase();
// (round 73, syncmedia73) big files (a 2 GB mix of videos and stems) are hashed in steps and kept by the server as a
// hard link to the uploaded file ("blob"), never whole in memory; downloads of them are written sparse (zero runs
// skipped) so a test's disk use stays near the size of what the engines really write
const BLOB_MIN = 16 * 1024 * 1024;
function hashSync(file) {
  const h = crypto.createHash('sha1'); const fd = raw.openSync(file, 'r'); const buf = Buffer.alloc(4 << 20);
  try { for (let pos = 0; ;) { const n = fs.readSync(fd, buf, 0, buf.length, pos); if (!n) break; h.update(buf.subarray(0, n)); pos += n; } } finally { fs.closeSync(fd); }
  return h.digest('hex');
}
function sparseCopy(src, dst) {
  const r = raw.openSync(src, 'r'); const w = raw.openSync(dst, 'w'); const buf = Buffer.alloc(4 << 20); let pos = 0;
  try {
    for (;;) { const n = fs.readSync(r, buf, 0, buf.length, pos); if (!n) break; const b = buf.subarray(0, n); if (b.some((x) => x !== 0)) fs.writeSync(w, b, 0, n, pos); pos += n; }
    fs.ftruncateSync(w, pos);
  } finally { fs.closeSync(r); fs.closeSync(w); }
}
const bytesOf = (s) => s.buf || raw.readFileSync(s.blob); // (only for the half of a download: written in place)
const sizeOf = (s) => (s.buf ? s.buf.length : s.size);

// ---------- the originals (the provider always uses these) ----------
const raw = {};
for (const k of ['statSync', 'existsSync', 'readFileSync', 'writeFileSync', 'openSync', 'renameSync', 'rmSync', 'mkdirSync', 'readdirSync', 'utimesSync', 'unlinkSync', 'truncateSync', 'copyFileSync']) raw[k] = fs[k];
const rawP = {};
for (const k of ['stat', 'lstat', 'readFile', 'writeFile', 'open', 'rename', 'rm', 'unlink', 'mkdir', 'readdir', 'copyFile', 'utimes', 'truncate', 'chmod']) rawP[k] = fsp[k];

// ---------- case / Unicode-insensitive volumes ----------
const ciRoots = new Set();
const ciRootOf = (abs) => { for (const r of ciRoots) if (abs === r || abs.startsWith(r + path.sep)) return r; return null; };
// a path with each existing part spelled as it is on the disk (what APFS / NTFS would open)
function ci(p) {
  if (typeof p !== 'string') return p;
  const abs = path.resolve(p);
  const root = ciRootOf(abs);
  if (!root) return p;
  const parts = path.relative(root, abs).split(path.sep).filter(Boolean);
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    const exact = path.join(cur, parts[i]);
    if (raw.existsSync(exact)) { cur = exact; continue; }
    let ents; try { ents = raw.readdirSync(cur); } catch { return path.join(cur, ...parts.slice(i)); }
    const hit = ents.find((e) => fold(e) === fold(parts[i]));
    if (!hit) return path.join(cur, ...parts.slice(i));
    cur = path.join(cur, hit);
  }
  return cur;
}
const ino = (p) => { try { const st = raw.statSync(p); return `${st.dev}:${st.ino}`; } catch { return null; } };
// rename on a case-insensitive disk: an existing entry of the same name in another spelling is that entry (a rename to
// another case of the same file just changes its spelling; another file there is replaced)
function ciRenameArgs(from, to) {
  const f = ci(from);
  const absTo = path.resolve(to);
  if (!ciRootOf(absTo)) return [f, to];
  const dir = ci(path.dirname(absTo));
  const name = path.basename(absTo);
  let ents = []; try { ents = raw.readdirSync(dir); } catch { /* none yet */ }
  const hit = ents.find((e) => fold(e) === fold(name) && e !== name);
  if (hit) { const hp = path.join(dir, hit); if (ino(hp) !== ino(f)) raw.rmSync(hp, { recursive: true, force: true }); }
  return [f, path.join(dir, name)];
}

// ---------- placeholders that download when read ----------
const dataless = new Map(); // `${dev}:${ino}` → { buf, mtime, onRead }
function hydrate(p) {
  if (typeof p !== 'string' || !dataless.size) return;
  const k = ino(p);
  const d = k && dataless.get(k);
  if (!d) return;
  dataless.delete(k);
  if (d.kept) { d.onRead?.(p); return; } // (round 73) evicted by the owner's click: the bytes never left in the simulation
  if (d.blob) sparseCopy(d.blob, p); else raw.writeFileSync(p, d.buf);
  const t = new Date(d.mtime); raw.utimesSync(p, t, t);
  d.onRead?.(p);
}
const isDataless = (p) => { const k = ino(ci(p)); return Boolean(k && dataless.has(k)); };

// ---------- (round 74, synchard74) real Windows / Mac troubles, for every fs call of the process ----------
//   lock(file, code)   another program holds it (the Sound desk's host on a WAV, an antivirus, OneDrive): opening,
//                      reading, replacing, deleting or moving it fails with EBUSY (or the code given: EPERM, EACCES)
//   winReadOnly        Windows' read-only mark: replacing, deleting or writing a file without its write bit fails (EPERM)
//                      (on this Linux box the tests run as root, where the bit alone stops nothing)
//   quota(dir, bytes)  that many more bytes can be written under dir, then ENOSPC (the write that crosses it is cut)
//   hook(op, p, p2)    a test's own: return an error code (or throw) to fail that call, nothing to let it through
const T = { locks: new Map(), winReadOnly: false, quotas: new Map(), hook: null };
const err = (code, op, p) => Object.assign(new Error(`${code}: simulated, ${op} '${p}'`), { code, syscall: op, path: p });
const keyOf = (p) => (typeof p === 'string' ? path.resolve(ci(p)) : null);
function lockOf(p) { if (!T.locks.size || typeof p !== 'string') return null; return T.locks.get(keyOf(p)) || null; }
function readOnly(p) { if (!T.winReadOnly || typeof p !== 'string') return false; try { return !(raw.statSync(ci(p)).mode & 0o200); } catch { return false; } }
function quotaOf(p) { if (!T.quotas.size || typeof p !== 'string') return null; const a = path.resolve(p); for (const [d, q] of T.quotas) if (a === d || a.startsWith(d + path.sep)) return q; return null; }
// before a call: throws the simulated error, if any
function check(op, p, p2, write) {
  if (T.hook) { const c = T.hook(op, p, p2); if (c) throw err(c, op, p); }
  for (const x of [p, p2]) { const l = lockOf(x); if (l) throw err(l, op, x); }
  if (write) for (const x of write) if (readOnly(x)) throw err('EPERM', op, x);
}
// a write of n bytes under a quota: → how many may be written (the rest: ENOSPC after)
function spend(p, n) { const q = quotaOf(p); if (!q) return n; const ok = Math.max(0, Math.min(n, q.left)); q.left -= ok; return ok; }
const lenOf = (d) => (typeof d === 'string' ? Buffer.byteLength(d) : d?.length ?? 0);
function lock(file, code = 'EBUSY') { T.locks.set(keyOf(file), code); }
function unlock(file) { if (file) T.locks.delete(keyOf(file)); else T.locks.clear(); }
function quota(dir, bytes) { if (bytes === null || bytes === undefined) T.quotas.delete(path.resolve(dir)); else T.quotas.set(path.resolve(dir), { left: bytes }); }
// a FileHandle whose writes count against a quota and whose file may be locked meanwhile
function wrapHandle(h, p) {
  const q = () => quotaOf(p);
  const write = h.write.bind(h);
  h.write = async (buf, off = 0, len, pos) => {
    if (!q()) return write(buf, off, len, pos);
    const n = len ?? (lenOf(buf) - off);
    const ok = spend(p, n);
    if (ok > 0) await write(buf, off, ok, pos);
    if (ok < n) throw err('ENOSPC', 'write', p);
    return { bytesWritten: n, buffer: buf };
  };
  return h;
}

let installed = false;
function install() {
  if (installed) return; installed = true;
  const readish = (fl) => !fl || /^r/.test(String(fl));
  fs.statSync = (p, ...a) => raw.statSync(ci(p), ...a);
  fs.existsSync = (p) => raw.existsSync(ci(p));
  fs.readFileSync = (p, ...a) => { const q = ci(p); hydrate(q); return raw.readFileSync(q, ...a); };
  fs.writeFileSync = (p, d, ...a) => { check('open', p, null, [p]); const n = lenOf(d); if (spend(p, n) < n) throw err('ENOSPC', 'write', p); return raw.writeFileSync(ci(p), d, ...a); }; // (round 74)
  fs.openSync = (p, fl, ...a) => { const q = ci(p); if (readish(fl)) hydrate(q); return raw.openSync(q, fl, ...a); };
  fs.renameSync = (a, b) => { check('rename', a, b, [b]); return raw.renameSync(...ciRenameArgs(a, b)); }; // (round 74)
  fs.rmSync = (p, ...a) => raw.rmSync(ci(p), ...a);
  fs.mkdirSync = (p, ...a) => raw.mkdirSync(ci(p), ...a);
  fs.readdirSync = (p, ...a) => raw.readdirSync(ci(p), ...a);
  fs.utimesSync = (p, ...a) => raw.utimesSync(ci(p), ...a);
  fs.unlinkSync = (p) => raw.unlinkSync(ci(p));
  fs.truncateSync = (p, ...a) => raw.truncateSync(ci(p), ...a);
  fs.copyFileSync = (a, b, ...r) => { const q = ci(a); hydrate(q); return raw.copyFileSync(q, ci(b), ...r); };
  // (round 73, syncmedia73) a placeholder has no blocks on the disk (what the engine looks at on a Mac)
  fsp.stat = async (p, ...a) => { const st = await rawP.stat(ci(p), ...a); if (dataless.size && st && dataless.has(`${st.dev}:${st.ino}`)) st.blocks = 0; return st; };
  fsp.lstat = (p, ...a) => rawP.lstat(ci(p), ...a);
  // (round 74, synchard74) each call checks the simulated locks / read-only marks / quotas first (check, spend)
  fsp.readFile = async (p, ...a) => { check('open', p); const q = ci(p); hydrate(q); return rawP.readFile(q, ...a); };
  fsp.writeFile = async (p, d, ...a) => {
    check('open', p, null, [p]);
    const n = lenOf(d); const ok = spend(p, n);
    if (ok < n) { await rawP.writeFile(ci(p), typeof d === 'string' ? Buffer.from(d).subarray(0, ok) : d.subarray(0, ok)); throw err('ENOSPC', 'write', p); }
    return rawP.writeFile(ci(p), d, ...a);
  };
  fsp.open = async (p, fl, ...a) => { check('open', p, null, readish(fl) ? null : [p]); const q = ci(p); if (readish(fl)) hydrate(q); return wrapHandle(await rawP.open(q, fl, ...a), p); };
  fsp.rename = async (a, b) => { check('rename', a, b, [b]); return rawP.rename(...ciRenameArgs(a, b)); };
  fsp.rm = async (p, ...a) => { check('unlink', p, null, [p]); return rawP.rm(ci(p), ...a); };
  fsp.unlink = async (p) => { check('unlink', p, null, [p]); return rawP.unlink(ci(p)); };
  fsp.mkdir = (p, ...a) => rawP.mkdir(ci(p), ...a);
  fsp.readdir = async (p, ...a) => { check('scandir', p); return rawP.readdir(ci(p), ...a); };
  fsp.chmod = (p, ...a) => rawP.chmod(ci(p), ...a);
  fsp.copyFile = async (a, b, ...r) => { check('copyfile', a, b, [b]); const q = ci(a); hydrate(q); const st = raw.statSync(q); if (spend(b, st.size) < st.size) throw err('ENOSPC', 'copyfile', b); return rawP.copyFile(q, ci(b), ...r); };
  fsp.utimes = (p, ...a) => rawP.utimes(ci(p), ...a);
  fsp.truncate = (p, ...a) => rawP.truncate(ci(p), ...a);
}
function ciVolume(dir) { install(); raw.mkdirSync(dir, { recursive: true }); ciRoots.add(path.resolve(dir)); }

// ---------- a fake clock per computer ----------
// t0 + the shared step time + this computer's skew; jump() moves one computer (days offline)
function clock(t0 = Date.now()) {
  let t = t0;
  return { now: () => t, advance: (ms) => { t += ms; }, at: (skew = 0) => () => t + skew };
}

// (round 77, synclatency77) ms a change of `size` bytes takes with a base delay and a rate (bytes / s)
const wallDelay = (base, size, rate) => (base || 0) + (rate ? (size / rate) * 1000 : 0);
// ---------- the cloud: a server and one view per computer ----------
function cloud(o = {}) {
  const log = o.log || (() => {});
  const server = new Map(); // fold(key) → { key, buf, hash, mtime, ver, by }
  let V = 0;
  const views = [];
  const walkView = (dir, fn, rel = '') => {
    let ents; try { ents = raw.readdirSync(rel ? path.join(dir, ...rel.split('/')) : dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walkView(dir, fn, r); else if (e.isFile()) fn(r, e.name);
    }
  };
  function view(dir, opt = {}) {
    // opt: { name, style: 'icloud'|'onedrive'|'dropbox'|'gdrive', placeholders: null|'stub'|'dataless'|'win',
    //        nfd (Mac names), partialDown (bytes: bigger downloads arrive in pieces, in place), slowUp (bytes: bigger
    //        uploads take upTicks ticks), upTicks, downTicks, now() (this computer's clock), metaPlaceholders,
    //        (round 77, synclatency77) upDelay / downDelay (ms of WALL time a change waits before it goes up / comes
    //        down: the client noticing it, the network) and upRate / downRate (bytes per second on top), for tests that
    //        run the provider in real time (dev/synclatency77.js), keepMtime (the file's own modified time travels with
    //        it, as real clients do; else the upload's time); none set = the tick-based provider as before }
    const v = { dir: path.resolve(dir), online: true, known: new Map(), downloading: new Map(), uploading: new Map(), requested: new Set(), hashes: new Map(), upSeen: new Map(), stats: { up: 0, down: 0, copies: 0, stubs: 0, partial: 0 }, ...opt };
    v.now = opt.now || (() => Date.now());
    raw.mkdirSync(v.dir, { recursive: true });
    if (opt.ci !== false) ciVolume(v.dir);
    v.tick = () => tick(v);
    v.request = (file) => { const real = path.join(path.dirname(file), path.basename(file).replace(/^\.(.+)\.icloud$/, '$1')); v.requested.add(fold(path.relative(v.dir, real).split(path.sep).join('/'))); };
    v.attributes = async (paths) => new Map(paths.map((p) => [p, isDataless(p) ? 0x400000 : 0]));
    // (round 73, syncmedia73) "make online-only" as the provider does it (Windows attrib +U, macOS evict): refused while
    // the file isn't uploaded as it is (still going up, changed since, never seen by the server); the file keeps its
    // modified time; it becomes a placeholder (dataless: no blocks / "pending" attributes; or an iCloud stub)
    v.evict = (file) => {
      if (!v.online) return { ok: false, error: 'offline' };
      const rel = path.relative(v.dir, path.resolve(file)).split(path.sep).join('/');
      const k = fold(rel); const kn = v.known.get(k); const srv = server.get(k);
      const f = look(v, rel);
      if (!f) return { ok: false, error: 'ENOENT' };
      if (f.dataless || f.stub) return { ok: true, already: true };
      if (!kn || !srv || srv.ver !== kn.ver || v.uploading.has(k) || srv.hash !== f.hash) return { ok: false, error: 'not uploaded yet' };
      if (v.placeholders === 'stub') { writeInto(v, srv, 'stub'); v.known.set(k, { ...kn, stub: true }); }
      else dataless.set(ino(f.file), { kept: true, hash: f.hash, mtime: f.st.mtimeMs });
      v.stats.evicted = (v.stats.evicted || 0) + 1;
      return { ok: true };
    };
    v.idle = () => !v.downloading.size && !v.uploading.size && !v.upSeen.size && [...server.values()].every((s) => v.known.get(fold(s.key))?.ver === s.ver);
    views.push(v);
    return v;
  }
  const placeheld = (v, key) => /^Hearth\/(files|trash)\//.test(key) || (v.metaPlaceholders && /^Hearth\//.test(key));
  // a file's state in a view (never downloads anything)
  function look(v, key) {
    const file = path.join(v.dir, ...key.split('/'));
    let st; try { st = raw.statSync(file); } catch { return null; }
    if (/(^|\/)\.([^/]+)\.icloud$/.test(key)) {
      let ref = null; try { ref = JSON.parse(raw.readFileSync(file, 'utf8')).k; } catch { /* a stub of another kind */ }
      return { file, stub: true, ref, st };
    }
    const k = `${st.dev}:${st.ino}`;
    const d = dataless.get(k);
    if (d) return { file, st, hash: d.hash || sha(d.buf), buf: d.buf, blob: d.blob, dataless: true };
    const ck = `${k}:${st.size}:${st.mtimeMs}`;
    let h = v.hashes.get(file);
    if (!h || h.ck !== ck) { h = { ck, hash: st.size > BLOB_MIN ? hashSync(file) : sha(raw.readFileSync(file)) }; v.hashes.set(file, h); }
    return { file, st, hash: h.hash };
  }
  function scan(v) {
    const out = new Map();
    walkView(v.dir, (r, name) => {
      if (/^\.sim-/.test(name)) return; // the provider's own temp files
      const stub = /^\.(.+)\.icloud$/.exec(name);
      const key = stub ? r.replace(/[^/]+$/, stub[1]) : r;
      const f = look(v, r);
      if (f) out.set(fold(key), { key: key.normalize('NFC'), ...f });
    });
    return out;
  }
  function conflictName(v, key) {
    const dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : '';
    const base = key.slice(dir.length); const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base; const ext = dot > 0 ? base.slice(dot) : '';
    for (let i = 2; i < 99; i++) {
      const n = v.style === 'onedrive' ? `${stem}-${v.name}${i > 2 ? `-${i - 1}` : ''}${ext}`
        : v.style === 'dropbox' ? `${stem} (${v.name}'s conflicted copy 2026-10-27${i > 2 ? ` (${i - 1})` : ''})${ext}`
          : v.style === 'gdrive' ? `${stem} (${i - 1})${ext}`
            : `${stem} ${i}${ext}`;
      const k = `${dir}${n}`;
      if (!server.has(fold(k)) && !raw.existsSync(path.join(v.dir, ...k.split('/')))) return k;
    }
    return `${dir}${stem} ${crypto.randomBytes(3).toString('hex')}${ext}`;
  }
  // (round 73) f: what the view has ({ file, st, buf? / blob? }): a big file goes to the server as a hard link (blobDir)
  let blobN = 0;
  const content = (f) => {
    if (f.buf) return { buf: f.buf, size: f.buf.length };
    if (f.blob) return { blob: f.blob, size: f.st.size };
    if (o.blobDir && f.st.size > BLOB_MIN) {
      raw.mkdirSync(o.blobDir, { recursive: true });
      const b = path.join(o.blobDir, `blob-${++blobN}`);
      fs.linkSync(f.file, b);
      return { blob: b, size: f.st.size };
    }
    const buf = raw.readFileSync(f.file); return { buf, size: buf.length };
  };
  const commit = (v, k, key, c, hash) => {
    const s = { key, ...c, hash, mtime: c.mtime ?? v.now(), ver: ++V, by: v.name, at: Date.now() }; // (round 77) at: wall time it reached the server; c.mtime: keepMtime
    server.set(k, s);
    v.known.set(k, { ver: s.ver, hash, key });
    v.stats.up += 1;
    log(v.name, 'up', key);
  };
  function writeInto(v, s, how) {
    const k = fold(s.key);
    const key = v.nfd ? s.key.normalize('NFD') : s.key;
    const target = path.join(v.dir, ...key.split('/'));
    raw.mkdirSync(path.dirname(target), { recursive: true });
    // another spelling of this name (a case-only rename on the other computer): that entry is this file
    for (const e of raw.readdirSync(path.dirname(target))) if (fold(e) === fold(path.basename(target)) && e !== path.basename(target)) raw.rmSync(path.join(path.dirname(target), e), { force: true, recursive: true });
    const stubFile = path.join(path.dirname(target), `.${path.basename(target)}.icloud`);
    const t = new Date(s.mtime);
    if (how === 'stub') {
      raw.rmSync(target, { force: true });
      raw.writeFileSync(stubFile, JSON.stringify({ k }));
      v.stats.stubs += 1;
    } else {
      raw.rmSync(stubFile, { force: true });
      if (how === 'dataless') {
        raw.rmSync(target, { force: true });
        raw.writeFileSync(target, ''); raw.truncateSync(target, sizeOf(s)); raw.utimesSync(target, t, t);
        dataless.set(ino(target), { buf: s.buf, blob: s.blob, hash: s.hash, mtime: s.mtime });
        v.stats.stubs += 1;
      } else if (how === 'half') {
        raw.rmSync(target, { force: true }); // (round 73) a new file: never written into another one's blob
        raw.writeFileSync(target, bytesOf(s).subarray(0, Math.floor(sizeOf(s) / 2))); // written in place, partly; "now" as its time
        const n = new Date(v.now()); raw.utimesSync(target, n, n);
        v.stats.partial += 1;
      } else {
        const tmp = path.join(path.dirname(target), `.sim-${crypto.randomBytes(3).toString('hex')}`);
        if (s.blob) sparseCopy(s.blob, tmp); else raw.writeFileSync(tmp, s.buf);
        raw.utimesSync(tmp, t, t);
        raw.renameSync(tmp, target);
      }
    }
    v.hashes.delete(target);
  }
  function tick(v) {
    if (!v.online) return;
    let view = scan(v);
    // ---- this computer → the server ----
    for (const [k, f] of view) {
      if (v.downloading.has(k)) continue; // the provider is still writing it
      const kn = v.known.get(k);
      if (f.stub) {
        if (kn) continue;
        // a stub moved by Hearth (into its trash / conflicts): the cloud item moves too, nothing downloads
        const src = f.ref && server.get(f.ref);
        if (src) { server.delete(f.ref); v.known.delete(f.ref); const s = { ...src, key: f.key, ver: ++V }; server.set(k, s); v.known.set(k, { ver: s.ver, hash: s.hash, key: f.key, stub: true }); }
        continue;
      }
      if (kn && kn.hash === f.hash) {
        v.upSeen.delete(k); // (round 77) back as it was: nothing to send
        if (kn.key !== f.key && !v.nfd) { const s = server.get(k); if (s && s.ver === kn.ver) { s.key = f.key; s.ver = ++V; v.known.set(k, { ...kn, key: f.key, ver: s.ver }); } } // case-only rename
        continue;
      }
      const srv = server.get(k);
      if (srv && srv.hash === f.hash) { v.known.set(k, { ver: srv.ver, hash: f.hash, key: f.key }); v.upSeen.delete(k); continue; }
      if (srv && (!kn || srv.ver !== kn.ver)) {
        v.upSeen.delete(k); // (round 77)
        // changed here AND on the server since this view last had it: the provider keeps ours as a copy
        const cname = conflictName(v, f.key);
        const dst = path.join(v.dir, ...cname.split('/'));
        raw.renameSync(f.file, dst);
        commit(v, fold(cname), cname, content({ ...f, file: dst, st: raw.statSync(dst) }), f.hash);
        view.set(fold(cname), { key: cname, file: dst, st: raw.statSync(dst), hash: f.hash });
        v.known.delete(k);
        v.stats.copies += 1;
        log(v.name, 'conflict copy', cname);
        continue;
      }
      // (round 77, synclatency77) a real-time delay before the upload lands on the server (noticing + sending)
      if (v.upDelay || v.upRate) {
        const u = v.upSeen.get(k);
        if (!u || u.hash !== f.hash) { v.upSeen.set(k, { hash: f.hash, at: Date.now() }); continue; }
        if (Date.now() - u.at < wallDelay(v.upDelay, f.st.size, v.upRate)) continue;
        v.upSeen.delete(k);
      }
      // an upload: big ones take a few ticks (the server keeps the old version meanwhile)
      if (v.slowUp && f.st.size > v.slowUp) {
        const u = v.uploading.get(k);
        if (!u || u.hash !== f.hash) { v.uploading.set(k, { hash: f.hash, left: v.upTicks || 3 }); continue; }
        if (--u.left > 0) continue;
        v.uploading.delete(k);
      }
      commit(v, k, f.key, v.keepMtime ? { ...content(f), mtime: f.st.mtimeMs } : content(f), f.hash); // (round 77) keepMtime: the file's own time travels with it (iCloud, OneDrive, Dropbox do)
    }
    for (const [k, kn] of [...v.known]) {
      if (view.has(k) || v.downloading.has(k)) continue;
      const srv = server.get(k);
      if (srv && srv.ver === kn.ver) { server.delete(k); log(v.name, 'delete', kn.key); }
      v.known.delete(k); // (changed on the server meanwhile: it comes back below)
      v.uploading.delete(k);
    }
    for (const k of [...v.uploading.keys()]) if (!view.has(k)) v.uploading.delete(k);
    for (const k of [...v.upSeen.keys()]) if (!view.has(k)) v.upSeen.delete(k); // (round 77) gone before it went up
    // ---- the server → this computer ----
    view = scan(v);
    for (const [k, d] of [...v.downloading]) { // the second half of a download in pieces
      if (--d.left > 0) continue;
      v.downloading.delete(k);
      const s = server.get(k);
      if (s && s.ver === d.ver) { writeInto(v, s, 'whole'); log(v.name, 'down', s.key, 'rest'); }
    }
    for (const [k, s] of server) {
      const kn = v.known.get(k);
      if (v.uploading.has(k) || v.downloading.has(k)) continue;
      // (round 74, synchard74) OneDrive / iCloud for Windows never create a file whose name Windows can't hold (":" "?"
      // a trailing dot, CON…): it stays in the cloud, this PC's folder just never has it
      if (v.winNames && Hard.winBad(s.key.replace(/^Hearth\/files\//, ''), { rootLen: 0 }) && Hard.winBad(s.key.replace(/^Hearth\/files\//, ''), { rootLen: 0 }).why !== 'win-long') { v.stats.refused = (v.stats.refused || 0) + 1; continue; }
      const f = view.get(k);
      if (kn && kn.ver === s.ver) {
        if (kn.stub && v.requested.has(k)) { writeInto(v, s, 'whole'); v.known.set(k, { ver: s.ver, hash: s.hash, key: s.key }); v.requested.delete(k); }
        continue;
      }
      if (f && !f.stub && kn && f.hash !== kn.hash) continue; // changed here too: the upload side handles it next tick
      if ((v.downDelay || v.downRate) && Date.now() - (s.at || 0) < wallDelay(v.downDelay, sizeOf(s), v.downRate)) continue; // (round 77) still on its way
      const ph = placeheld(v, s.key) && !v.requested.has(k) ? v.placeholders : null;
      let how = ph === 'stub' ? 'stub' : ph === 'dataless' || ph === 'win' ? 'dataless' : 'whole';
      if (how === 'whole' && v.partialDown && sizeOf(s) > v.partialDown) { how = 'half'; v.downloading.set(k, { ver: s.ver, left: v.downTicks || 2 }); }
      writeInto(v, s, how);
      v.requested.delete(k);
      v.known.set(k, { ver: s.ver, hash: s.hash, key: s.key, stub: how === 'stub' });
      v.stats.down += 1;
      log(v.name, 'down', s.key, how);
    }
    for (const [k, kn] of [...v.known]) {
      if (server.has(k)) continue;
      const f = view.get(k);
      v.known.delete(k);
      if (!f) continue;
      if (f.stub || f.dataless || f.hash === kn.hash) { raw.rmSync(f.file, { force: true }); dataless.delete(ino(f.file)); }
      // else: changed here while deleted on the server: it goes up again next tick (an edit wins over a delete)
    }
  }
  return { server, view, views, tick: () => views.forEach((v) => v.tick()) };
}

// ---------- reading a data folder: the synced part, for comparing two computers ----------
function snapshot(dataDir, S, ctx) {
  const out = {};
  const walk = (dir, rel) => {
    let ents; try { ents = raw.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!S.localOnly(`${r}/x`)) walk(path.join(dir, e.name), r); continue; }
      if (S.ignoredName(e.name) || S.localOnly(r)) continue;
      const buf = raw.readFileSync(path.join(dir, e.name));
      let v;
      if (S.isJsonRel(r)) { try { v = JSON.stringify(S.toCloud(S.parseJson(buf.toString('utf8')), ctx)); } catch { v = `bad:${sha(buf)}`; } } else v = sha(buf);
      out[r.normalize('NFC')] = v;
    }
  };
  walk(dataDir, '');
  return out;
}

module.exports = { raw, rawP, ci, ciVolume, install, hydrate, isDataless, dataless, clock, cloud, snapshot, sha, fold, T, lock, unlock, quota }; // (round 74) T / lock / unlock / quota
