// (round 88, bigsave88) A giant chat kept as a PACK: sealed segment files that never change, a small live tail, and a
// manifest that names them. Pure (fs is handed in), Node only (the store / files thread, sync, Node tests); nothing here
// is wired into the app yet: docs/upgrades/bigsave88.md has the plan, dev/bigsave88-test.js checks every promise below.
//
// Why: a giant chat (≥ 8 MB; bigchat84's fixture is 6,000 messages, 63 MB) is rewritten whole on every save (round 82's
// save by change copies the unchanged bytes, but still writes 63 MB), twice per exchange, and the sync folder then
// moves the whole 63 MB again. In a pack only the tail (≈ 0.1–1 MB) and the manifest (a few KB) change per save.
//
// The logical chat is ALWAYS the exact bytes the whole-file way writes: pre + messages list + post, where the list is
// "[\n    m0,\n    m1\n  ]" (pretty: JSON.stringify(chat, null, 2), this computer's file) or "[m0,m1]" (compact: the
// cloud form). A pack stores:
//   <dir>/<sha1>.seg          the bytes of messages [a, b) joined by the layout's separator; named by their own sha1
//                             (content-addressed: a piece's name says what it holds, it is never written over, and two
//                             computers that make the same piece make the same file)
//   <dir>/m-<by>.json         the manifest of writer <by> (each computer its own: two computers never write one file):
//                             { hearthChatPack: 1, id, by, seq, at, layout, pre, post, n, sealed, segs: [{ h, n, b }],
//                             wh?, took?, sum } — segs in order; the first `sealed` are sealed, the last (if any) is the tail;
//                             sum = sha1 of the manifest's own text without sum (a cut or garbled manifest is refused)
// Where the segments end is decided by the messages alone (content-defined): a segment closes after a message once it
// holds ≥ min bytes and that message's hash says so (1 in `every`), or at max bytes. Messages that are the same give
// the same segments on every computer and at every save; a change to an old message changes its segment (and rarely
// the next one) and nothing else; a new message only ever changes the tail.
//
// Promises (dev/bigsave88-test.js):
//   · read(): the exact whole bytes, or a PackError: a manifest that is missing / cut / garbled, a segment that is
//     missing, short, damaged or still arriving, or a message count that doesn't match. Never a shorter chat, never
//     "empty".
//   · write(): new pieces first (temp file, flushed, renamed: a piece under its name is always whole), the manifest
//     last (the same way). A crash at any point leaves the old manifest with all its pieces, or the new one with all
//     of its pieces. Nothing a manifest names is ever moved or removed by write().
//   · tidy(): only pieces no manifest in the folder names, older than a grace time, are MOVED into the pack trash
//     (<trash>/<day>/<id>/…), never deleted; the trash keeps 30 days.
'use strict';
const crypto = require('crypto');
const path = require('path');
const { Buffer } = require('buffer');

const V = 1;
const LAYOUT = {
  pretty: { open: '[\n    ', sep: ',\n    ', close: '\n  ]' },
  compact: { open: '[', sep: ',', close: ']' },
};
const DEF = { min: 512 * 1024, max: 4 * 1024 * 1024, every: 32 };
const TRASH_DAYS = 30;
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const day = (t) => new Date(t).toISOString().slice(0, 10);

class PackError extends Error {
  constructor(code, detail = {}) { super(`chat pack: ${code}${detail.h ? ` ${detail.h}` : ''}`); this.code = code; Object.assign(this, detail); }
}

// ---------- the cut into segments ----------
// one message's place in the cut: its length (bytes) and whether a segment may close after it (from its hash)
function infoOf(b, o = DEF) {
  const h = crypto.createHash('sha1').update(b).digest();
  return { len: b.length, cut: h.readUInt32BE(0) % (o.every || DEF.every) === 0 };
}
// the segments for messages with these infos: [[a, b, sealed], …]; the last one may be open (the tail)
function ranges(info, o = DEF) {
  const min = o.min || DEF.min; const max = o.max || DEF.max;
  const out = []; let a = 0; let acc = 0;
  for (let k = 0; k < info.length; k++) {
    acc += info[k].len + (k > a ? 1 : 0);
    if (acc >= max || (acc >= min && info[k].cut)) { out.push([a, k + 1, true]); a = k + 1; acc = 0; }
  }
  if (a < info.length) out.push([a, info.length, false]);
  return out;
}

// ---------- the manifest ----------
const safeBy = (by) => String(by || 'here').replace(/[^\w.-]+/g, '_').slice(0, 64) || 'here';
const manifestName = (by) => `m-${safeBy(by)}.json`;
function manifestText(m) {
  const body = { ...m }; delete body.sum;
  const t = JSON.stringify(body);
  return JSON.stringify({ ...body, sum: sha1(t) });
}
// a manifest's text checked: → the manifest, or a PackError (never a half-read one taken as fewer messages)
function parseManifest(text) {
  let m;
  try { m = JSON.parse(String(text).replace(/^﻿/, '')); } catch { throw new PackError('manifest-bad'); }
  if (!m || typeof m !== 'object' || m.hearthChatPack !== V) throw new PackError(m?.hearthChatPack > V ? 'manifest-newer' : 'manifest-bad');
  const body = { ...m }; delete body.sum;
  if (m.sum !== sha1(JSON.stringify(body))) throw new PackError('manifest-bad');
  if (!LAYOUT[m.layout] || typeof m.pre !== 'string' || typeof m.post !== 'string' || !Array.isArray(m.segs) || !(m.n >= 0)) throw new PackError('manifest-bad');
  let n = 0;
  for (const s of m.segs) { if (!s || !/^[0-9a-f]{40}$/.test(s.h) || !(s.n > 0) || !(s.b >= 0)) throw new PackError('manifest-bad'); n += s.n; }
  if (m.took !== undefined && (!m.took || typeof m.took !== 'object' || Array.isArray(m.took) || Object.values(m.took).some((x) => !(x >= 0)))) throw new PackError('manifest-bad');
  if (n !== m.n || !(m.sealed >= 0) || m.sealed > m.segs.length || m.segs.length - m.sealed > 1) throw new PackError('manifest-bad');
  return m;
}
function readManifest(fs, file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (err) { throw new PackError(err.code === 'ENOENT' ? 'manifest-missing' : 'manifest-unreadable', { cause: err.code }); }
  return parseManifest(text);
}
// every manifest in a pack folder: [{ by, file, m } | { by, file, error }] (one that can't be read says so)
function manifests(fs, dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch (err) { if (err.code === 'ENOENT') return []; throw new PackError('folder-unreadable', { cause: err.code }); }
  const out = [];
  for (const f of names) {
    const x = /^m-(.+)\.json$/.exec(f);
    if (!x) continue;
    const file = path.join(dir, f);
    try { out.push({ by: x[1], file, m: readManifest(fs, file) }); } catch (err) { out.push({ by: x[1], file, error: err.code || 'manifest-bad' }); }
  }
  return out;
}

// ---------- reading ----------
function readSeg(fs, dir, s, verify) {
  let b;
  try { b = fs.readFileSync(path.join(dir, `${s.h}.seg`)); } catch (err) { throw new PackError(err.code === 'ENOENT' ? 'segment-missing' : 'segment-unreadable', { h: s.h, cause: err.code }); }
  if (b.length !== s.b) throw new PackError('segment-bad', { h: s.h, why: 'size' }); // (a download still writing it, a cut copy)
  if (verify !== false && sha1(b) !== s.h) throw new PackError('segment-bad', { h: s.h, why: 'hash' }); // (a placeholder of zeros, a damaged copy)
  return b;
}
// the whole bytes a manifest stands for: → { buf, m }. Throws PackError (see the header): never a shorter chat
function read(fs, dir, m, o = {}) {
  if (typeof m === 'string') m = readManifest(fs, path.join(dir, manifestName(m)));
  const L = LAYOUT[m.layout];
  const parts = [Buffer.from(m.pre, 'utf8')];
  if (!m.n) parts.push(Buffer.from('[]'));
  else {
    parts.push(Buffer.from(L.open));
    m.segs.forEach((s, i) => { if (i) parts.push(Buffer.from(L.sep)); parts.push(readSeg(fs, dir, s, o.verify)); });
    parts.push(Buffer.from(L.close));
  }
  parts.push(Buffer.from(m.post, 'utf8'));
  const buf = Buffer.concat(parts);
  // the count, from the bytes (no parse): the messages the manifest says, exactly
  const st = require('./bigchat-core').scanBuf(buf);
  if (st.bad || st.arrS < 0 || st.els.length / 2 !== m.n) throw new PackError('count', { want: m.n, got: st.bad ? -1 : st.els.length / 2 });
  if (m.wh && o.verify !== false && sha1(buf) !== m.wh) throw new PackError('whole-hash');
  return { buf, m, els: st.els };
}

// ---------- writing ----------
const exists = (fs, f) => { try { fs.statSync(f); return true; } catch { return false; } };
const rnd = () => crypto.randomBytes(4).toString('hex');
// bytes written next to their place, flushed, renamed (a crash leaves no half file under the name)
function atomic(fs, file, bytes, o = {}) {
  const tmp = `${file}.${rnd()}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    let off = 0; const b = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
    while (off < b.length) off += fs.writeSync(fd, b, off, b.length - off);
    if (o.fsync !== false) { try { fs.fsyncSync(fd); } catch { /* a disk that can't */ } }
  } catch (err) { fs.closeSync(fd); try { fs.renameSync(tmp, `${tmp}.bad`); } catch { /* left as a .tmp: tidy() moves it to the trash */ } throw err; }
  fs.closeSync(fd);
  fs.renameSync(tmp, file);
}
// a piece already there under its name is used when it holds what its name says (else written again over it: a piece
// named by its hash that doesn't hold those bytes is damaged, and no manifest can be reading it as it is)
function putSeg(fs, dir, h, bytes, o) {
  const f = path.join(dir, `${h}.seg`);
  if (exists(fs, f)) { try { const b = fs.readFileSync(f); if (b.length === bytes.length && sha1(b) === h) return 0; } catch { /* written again */ } }
  atomic(fs, f, bytes, o);
  return bytes.length;
}
// write a new version of the pack.
//   o: { id, by, seq?, at?, layout, pre, post, n, bytesOf(k) → Buffer (message k's bytes in this layout), info? (each
//        message's infoOf: kept by the caller between saves; made here when missing), prev? (the manifest this one
//        follows, its segments reused for messages that didn't change), changed? (Set of indexes changed since prev;
//        with prev: messages ≥ prev.n are new), cut? ({ min, max, every }), fsync?, wh? (the whole bytes' sha1, when
//        the caller has it), took? ({ by: seq }: which of the other computers' versions this one took in: sync's
//        lane finds the base of its three-way merge with it) }
//   → { m, wrote (bytes of new pieces), pieces (new pieces written), reused, info }
function write(fs, dir, o) {
  const L = LAYOUT[o.layout];
  if (!L) throw new PackError('layout');
  if (!(o.n >= 0) || typeof o.bytesOf !== 'function') throw new PackError('args');
  const cut = { ...DEF, ...(o.cut || {}) };
  const info = o.info || [];
  info.length = o.n;
  const changed = o.changed || new Set();
  for (let k = 0; k < o.n; k++) if (!info[k] || changed.has(k) || (o.prev && k >= o.prev.n)) info[k] = infoOf(o.bytesOf(k), cut);
  // the segments prev had, by where they sit: reused when none of their messages changed
  const had = new Map();
  if (o.prev) { let a = 0; for (const s of o.prev.segs) { had.set(`${a}:${a + s.n}`, s); a += s.n; } }
  const clean = (a, b) => { if (!o.prev || b > o.prev.n) return false; for (const k of changed) if (k >= a && k < b) return false; return true; };
  fs.mkdirSync(dir, { recursive: true });
  const segs = []; let sealed = 0; let wrote = 0; let pieces = 0; let reused = 0;
  for (const [a, b, isSealed] of ranges(info, cut)) {
    const old = had.get(`${a}:${b}`);
    if (old && clean(a, b)) { segs.push({ h: old.h, n: old.n, b: old.b }); reused += 1; } else {
      const parts = [];
      for (let k = a; k < b; k++) { if (k > a) parts.push(Buffer.from(L.sep)); parts.push(o.bytesOf(k)); }
      const bytes = Buffer.concat(parts); const h = sha1(bytes);
      const w = putSeg(fs, dir, h, bytes, o);
      if (w) { wrote += w; pieces += 1; }
      segs.push({ h, n: b - a, b: bytes.length });
    }
    if (isSealed) sealed += 1;
  }
  const m = { hearthChatPack: V, id: String(o.id || ''), by: safeBy(o.by), seq: o.seq ?? ((o.prev?.seq || 0) + 1), at: o.at ?? Date.now(), layout: o.layout, pre: o.pre, post: o.post, n: o.n, sealed, segs, ...(o.wh ? { wh: o.wh } : {}), ...(o.took ? { took: o.took } : {}) };
  const text = manifestText(m);
  atomic(fs, path.join(dir, manifestName(o.by)), text, o);
  m.sum = JSON.parse(text).sum;
  return { m, wrote, pieces, reused, manifestBytes: Buffer.byteLength(text), info };
}

// ---------- from / to the whole bytes ----------
// a whole chat file's bytes → what write() takes: { pre, post, n, bytesOf, layout } (null: not laid out as the app writes)
function split(buf) {
  const BC = require('./bigchat-core');
  const st = BC.scanBuf(buf);
  if (st.bad || st.arrS < 0) return null;
  const n = st.els.length / 2;
  // (no messages: "[]" either way; the chat's own fields say which: pretty starts "{\n")
  const pretty = n ? BC.prettyLayout(buf, st) : buf.toString('latin1', st.arrS, st.arrE) === '[]' && /^﻿?\{\n/.test(buf.toString('utf8', 0, Math.min(8, buf.length)));
  let layout = pretty ? 'pretty' : null;
  if (!layout) { // compact: "[a,b]" exactly
    const ok = n ? buf.toString('latin1', st.arrS, st.els[0]) === '[' && buf.toString('latin1', st.els[n * 2 - 1], st.arrE) === ']' && Array.from({ length: n - 1 }, (_, i) => buf.toString('latin1', st.els[i * 2 + 1], st.els[i * 2 + 2]) === ',').every(Boolean) : buf.toString('latin1', st.arrS, st.arrE) === '[]';
    if (ok) layout = 'compact';
  }
  if (!layout) return null;
  return { layout, pre: buf.toString('utf8', 0, st.arrS), post: buf.toString('utf8', st.arrE, buf.length), n, els: st.els, bytesOf: (k) => buf.subarray(st.els[k * 2], st.els[k * 2 + 1]) };
}

// ---------- tidying ----------
// pieces no manifest in the folder names (and temp files left by a crash), older than `grace` ms, MOVED to
// <trash>/<day>/<id>/ (never deleted here); trash days older than 30 days are let go (purge)
function tidy(fs, dir, o = {}) {
  const now = o.now ?? Date.now(); const grace = o.grace ?? 24 * 3600e3;
  const ms = manifests(fs, dir);
  if (ms.some((x) => x.error)) return { moved: 0, held: 'manifest' }; // (one that can't be read may name anything: nothing moved)
  const keep = new Set(); for (const { m } of ms) for (const s of m.segs) keep.add(`${s.h}.seg`);
  for (const h of o.keep || []) keep.add(`${h}.seg`);
  let moved = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.seg$|\.tmp$|\.tmp\.bad$/.test(f) || keep.has(f)) continue;
    const file = path.join(dir, f);
    let st; try { st = fs.statSync(file); } catch { continue; }
    if (now - st.mtimeMs < grace) continue;
    const to = path.join(o.trash || path.join(path.dirname(dir), '.trash'), day(now), path.basename(dir));
    fs.mkdirSync(to, { recursive: true });
    fs.renameSync(file, path.join(to, f));
    moved += 1;
  }
  return { moved };
}
function purge(fs, trash, now = Date.now()) {
  let n = 0;
  let days; try { days = fs.readdirSync(trash); } catch { return 0; }
  for (const d of days) if (/^\d{4}-\d\d-\d\d$/.test(d) && now - Date.parse(`${d}T00:00:00Z`) > TRASH_DAYS * 864e5) { fs.rmSync(path.join(trash, d), { recursive: true, force: true }); n += 1; }
  return n;
}

// ---------- sync (the plan's lane: docs/upgrades/bigsave88.md) ----------
// which peers' manifests bring something new: seen = { by: seq } (what this computer took last); → [{ by, m }] newer,
// and [{ by, why }] waiting (a manifest that can't be read yet, or one whose pieces haven't all arrived: never taken
// as a shorter chat)
function news(fs, dir, me, seen = {}) {
  const fresh = []; const waiting = [];
  for (const x of manifests(fs, dir)) {
    if (x.by === safeBy(me)) continue;
    if (x.error) { waiting.push({ by: x.by, why: x.error }); continue; }
    if ((seen[x.by] || 0) >= x.m.seq) continue;
    const miss = x.m.segs.find((s) => { try { return fs.statSync(path.join(dir, `${s.h}.seg`)).size !== s.b; } catch { return true; } });
    if (miss) { waiting.push({ by: x.by, why: 'arriving', h: miss.h }); continue; }
    fresh.push({ by: x.by, m: x.m });
  }
  return { fresh, waiting };
}
// may this computer publish its giant chats as packs to the cloud? Only when EVERY other computer that ever synced
// says it reads them (its machine record: packs ≥ 1, format ≥ 88); a record without it (an older Hearth, one that
// can't be read) keeps the whole file. → { ok, why }
function packsAllowed(peers, me = { packs: 1 }) {
  if (!me?.packs) return { ok: false, why: 'off' };
  for (const p of peers || []) {
    if (!p || typeof p !== 'object') return { ok: false, why: 'unreadable' };
    if (!(p.packs >= 1) || !(p.format >= 88)) return { ok: false, why: 'older', who: p.name || p.id };
  }
  return { ok: true };
}

module.exports = { V, LAYOUT, DEF, PackError, infoOf, ranges, manifestName, manifestText, parseManifest, readManifest, manifests, read, write, split, tidy, purge, news, packsAllowed, sha1, safeBy };
