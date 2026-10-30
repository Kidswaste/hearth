// (round 89, packs89) Phase 1 of docs/upgrades/bigsave88.md: a giant chat's changes travel through the cloud folder as
// PIECES (chatpack-core.js: sealed sha1-named segments, a tail, one manifest per computer) in <cloud>/Hearth/packs/,
// a folder older Hearths never look in. This computer's data folder keeps the whole file, exactly as before.
// Pure (fs and sync-merge handed in): runs on the store's files thread (storework.js op syncPack) and in Node tests.
// The main side (syncpack.js) decides when; this file does the byte work and the decisions that can be tested alone.
//
//   gate(records, on)       may this computer use packs? Only when the setting is on here AND every other computer's
//                           machine record says it reads them (packs ≥ 1). A record that can't be read, an older Hearth
//                           (no "packs"), or no other computer at all: no (the whole file, as today).
//   decide(x)               what the sync engine does with a giant chat's WHOLE cloud file this pass (the plan hook):
//                           null (as today), { hold } (not now: the pieces carry the change; the whole file is written
//                           once the chat is quiet), { adopt } (the cloud's whole file is a version this computer already
//                           took in: it becomes the base, so the next whole write is a plain push, never a stale merge)
//   publish(fs, o)          this computer's chat → its manifest + new pieces (only the tail and changed segments)
//   take(fs, o)             another computer's manifest → this computer's chat, merged three-way (or "wait")
//   text(fs, o)             a version's whole cloud-form bytes (the engine's base when it adopts one)
//
// Promises (dev/packs89-test.js): a piece or manifest that is missing / short / damaged / still arriving is "wait",
// never a shorter chat and never "empty"; the local file is written only through the caller's compare-and-swap; a field
// changed two ways is settled the same on both computers (the newer chat wins: updatedAt, then the computer's name)
// and the losing side's whole version is kept in Deleted files (sync-aside); nothing here deletes anything.
'use strict';
const path = require('path');
const crypto = require('crypto');
const P = require('./chatpack-core');

const PACKS_V = 1; // the pack protocol this Hearth reads and writes (the machine record's "packs")
const MIN = 16e6; // a chat this big (the engine's own giant-chat line, round 82) travels in pieces
const QUIET_MS = 3 * 60 * 1000; // the whole cloud file is written once the chat has been quiet this long
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const isHash = (h) => typeof h === 'string' && /^[0-9a-f]{40}$/.test(h);
const day = (t) => new Date(t).toISOString().slice(0, 10);

// ---------- the gate ----------
// records: the other computers' machine records ({ error } for one that can't be read)
function gate(records, on) {
  if (!on) return { ok: false, why: 'off' };
  if (!records || !records.length) return { ok: false, why: 'alone' };
  for (const r of records) {
    if (!r || r.error) return { ok: false, why: 'unreadable', who: r?.file || '' };
    if (!(Number(r.packs) >= PACKS_V)) return { ok: false, why: 'older', who: r.name || r.id || '' };
  }
  return { ok: true };
}
// the other computers' records in <cloud>/Hearth/.sync/machines (a cloud client's conflict copy is not a computer)
function readRecords(fs, dir, myId) {
  let names;
  try { names = fs.readdirSync(dir); } catch (err) { if (err.code === 'ENOENT') return []; return [{ error: err.code || 'unreadable', file: dir }]; }
  const out = [];
  for (const f of names) {
    if (!f.endsWith('.json') || f.startsWith('.')) continue;
    let j;
    try { j = JSON.parse(String(fs.readFileSync(path.join(dir, f), 'utf8')).replace(/^﻿/, '')); } catch (err) {
      // a record being written / a placeholder: unknown → the gate stays shut (never "no such computer")
      if (f === `${myId}.json`) continue;
      out.push({ error: err.code || 'bad', file: f }); continue;
    }
    if (!j || typeof j !== 'object' || f !== `${j.id}.json`) continue;
    if (j.id === myId) continue;
    out.push(j);
  }
  return out;
}

// ---------- the plan hook's decision (pure) ----------
// x: { lh, ch, bh (the engine's hashes: here, the cloud's whole file, the base), hasL, hasC, size (here), min, quiet
//      (the chat unchanged here this long), quietMs, author (this computer's chat is what it published itself),
//      known (Set: versions this computer took in or published), arriving (Set: versions other computers published,
//      their pieces still on the way or not taken yet) }
function decide(x) {
  if (!x.hasL || !(x.size >= (x.min ?? MIN))) return null; // (not a giant chat here: as today)
  if (!isHash(x.lh) || (x.hasC && !isHash(x.ch))) return null; // (still arriving / unknown: the engine's own waits)
  const qm = x.quietMs ?? QUIET_MS;
  // the whole file is written by the computer whose chat it is (it published it), once quiet; by either one after 4×
  const writeNow = x.quiet >= qm && (x.author || (x.quiet >= qm * 4 && x.known?.has(x.lh)));
  if (!x.hasC) return x.bh ? null : (writeNow ? null : { hold: 'later' }); // new here (a delete there: the engine's rules)
  if (x.lh === x.ch) return null; // the same: the engine takes it as the base
  if (x.lh === x.bh) return null; // only the cloud's whole file changed: the engine brings it (as today)
  if (x.ch === x.bh) return writeNow ? null : { hold: 'later' }; // only here: the pieces carry it; the whole file when quiet
  // both changed
  if (x.known?.has(x.ch)) return { adopt: x.ch, hold: 'later' }; // a version this computer already took in
  if (x.arriving?.has(x.ch)) return { hold: 'pieces' }; // its pieces are on the way: the pack lane takes it first
  return null; // a whole file nobody published as a pack (an older Hearth, the gate shut there): the engine merges
}

// ---------- reading helpers ----------
function stillRead(fs, file) {
  let s0; try { s0 = fs.statSync(file); } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
  const buf = fs.readFileSync(file);
  const s1 = fs.statSync(file);
  if (s0.size !== s1.size || s0.mtimeMs !== s1.mtimeMs || buf.length !== s1.size) return { stale: true };
  return { buf, size: s1.size, mtime: s1.mtimeMs };
}
// a manifest by computer, read and checked (→ { m } or { wait: code })
function manifestOf(fs, dir, by) {
  try { return { m: P.readManifest(fs, path.join(dir, P.manifestName(by))) }; } catch (err) { return { wait: err.code || 'manifest-bad' }; }
}
function readBytes(fs, dir, m) {
  try { return { buf: P.read(fs, dir, m).buf }; } catch (err) { return { wait: err.code || 'pack' }; }
}
const prettyOf = (buf) => !buf || buf.length < 2 || /^[[{]\s/.test(buf.toString('latin1', 0, 2));
function atomic(fs, file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { let off = 0; while (off < bytes.length) off += fs.writeSync(fd, bytes, off, bytes.length - off); try { fs.fsyncSync(fd); } catch { /* a disk that can't */ } } catch (err) { fs.closeSync(fd); try { fs.rmSync(tmp, { force: true }); } catch { /* left */ } throw err; }
  fs.closeSync(fd);
  fs.renameSync(tmp, file);
}

// ---------- publish ----------
// what a publish keeps per chat between publishes (the last cloud form's bytes, its messages' cut info): on the files
// thread, two chats at most (≈ 2 × the chat's size)
const keeps = new Map();
function keepOf(dir) {
  let k = keeps.get(dir);
  if (!k) { k = {}; keeps.set(dir, k); while (keeps.size > 2) keeps.delete(keeps.keys().next().value); } else { keeps.delete(dir); keeps.set(dir, k); }
  return k;
}
// o: { file (this computer's chat), ctx, S, dir (the cloud pack folder), by, took ({ by: seq }), prev (this computer's
//      last manifest, or null), keep (an object the caller keeps per chat between publishes: the last cloud form's
//      message bytes, so a publish hashes only what changed), skip (a hash: nothing to do when the chat is that one),
//      baseDir? (also kept here, for this computer's own later merges), cut?, fsync? }
// → { same, h } | { stale } | { m, h, wrote, pieces, manifestBytes, n } | { bad }
function publish(fs, o) {
  const BC = require('./bigchat-core');
  const got = stillRead(fs, o.file);
  if (!got) return { gone: true };
  if (got.stale) return { stale: true };
  const cf = BC.cloudForm(got.buf, o.ctx, o.S);
  if (!cf) return { bad: true };
  const sig = { size: got.size, mtime: got.mtime };
  if ((o.skips || []).includes(cf.h) && !o.force) return { same: true, h: cf.h, sig };
  const sp = P.split(cf.text);
  if (!sp || sp.layout !== 'compact') return { bad: true };
  const keep = o.keep || keepOf(o.dir);
  // a piece the last manifest names that isn't in the folder any more (lost by the cloud, tidied away): its messages
  // count as changed, so it is written again (the same messages make the same piece, under the same name)
  const lost = new Set();
  if (o.prev) { let a = 0; for (const s of o.prev.segs) { let okSize = false; try { okSize = fs.statSync(path.join(o.dir, `${s.h}.seg`)).size === s.b; } catch { /* lost */ } if (!okSize) for (let k = a; k < a + s.n; k++) lost.add(k); a += s.n; } }
  // which messages changed since the last publish (by bytes; none known: every one is hashed once)
  let changed = null; let info = null;
  if (o.prev && keep.h === o.prev.wh && Array.isArray(keep.info) && keep.text && keep.offs && keep.n === o.prev.n) {
    changed = new Set(); info = keep.info;
    for (let k = 0; k < Math.min(sp.n, keep.n); k++) {
      const a = sp.bytesOf(k); const s = keep.offs[k * 2]; const e = keep.offs[k * 2 + 1];
      if (lost.has(k) || a.length !== e - s || !a.equals(keep.text.subarray(s, e))) changed.add(k);
    }
  }
  const w = P.write(fs, o.dir, { id: o.id, by: o.by, layout: 'compact', pre: sp.pre, post: sp.post, n: sp.n, bytesOf: sp.bytesOf, info: info || undefined, prev: changed ? o.prev : null, fsync: o.fsync, changed: changed || undefined, cut: o.cut, wh: cf.h, took: o.took && Object.keys(o.took).length ? o.took : undefined, seq: o.seq });
  if (o.baseDir) { // (the same pieces, kept here too: segments already here are reused by name, not read again)
    const selfPrev = changed && keep.self && keep.self.wh === o.prev.wh && keep.self.n === o.prev.n ? keep.self : null;
    try { keep.self = P.write(fs, o.baseDir, { id: o.id, by: `self-${w.m.seq}`, layout: 'compact', pre: sp.pre, post: sp.post, n: sp.n, bytesOf: sp.bytesOf, info: w.info.slice(), prev: selfPrev, changed: selfPrev ? changed : undefined, cut: o.cut, fsync: o.fsync, wh: cf.h, seq: w.m.seq }).m; } catch { keep.self = null; /* only a better base later: never stops the publish */ }
  }
  keep.h = cf.h; keep.text = cf.text; keep.offs = sp.els; keep.n = sp.n; keep.info = w.info;
  return { m: w.m, h: cf.h, sig, wrote: w.wrote, pieces: w.pieces, reused: w.reused, manifestBytes: w.manifestBytes, n: sp.n };
}

// ---------- take ----------
// o: { file (this computer's chat), ctx, S, dir (the cloud pack folder), man (the other computer's manifest), by (its
//      name), me, base ({ dir, by } | null: the newest version both are known to have had), keepAll, recovery (where
//      this computer's version is kept before it is replaced), trash (data/sync/trash: a conflict's losing side), now }
// → { wait } | { stale } | { same, hm } | { out (this computer's form), hm (the cloud form's hash), lh (as the engine
//   hashes the written file), sig (the local file as read: for the caller's compare-and-swap), conflicts, lost }
function take(fs, o) {
  const BC = require('./bigchat-core'); const S = o.S;
  const t = readBytes(fs, o.dir, o.man);
  if (t.wait) return { wait: t.wait };
  const T = BC.cloudForm(t.buf, null, S);
  if (!T) return { wait: 'bad' };
  if (o.man.wh && T.h !== o.man.wh) return { wait: 'whole-hash' };
  let got;
  try { got = stillRead(fs, o.file); } catch (err) { return { wait: `local-${err.code || 'unreadable'}` }; } // (a held file: next pass, never "none")
  if (got?.stale) return { stale: true };
  if (!got) { // new here: the other computer's chat as it is (only when the caller says this computer never had it)
    if (!o.allowNew) return { gone: true };
    const r = BC.localFromCloud(T, o.ctx, S, true);
    if (o.keepAs) { try { keepBase(fs, o.dir, o.keepAs.dir, o.man, o.keepAs.by); } catch { /* only a better base later */ } }
    return { out: r.out, lh: r.lh, hm: T.h, sig: null, conflicts: [], fresh: true };
  }
  const O = BC.cloudForm(got.buf, o.ctx, S);
  if (!O) return { wait: 'local-bad' }; // this computer's file can't be read as a chat: never replaced
  const sig = { size: got.size, mtime: got.mtime };
  const based = () => { if (o.keepAs) { try { keepBase(fs, o.dir, o.keepAs.dir, o.man, o.keepAs.by); } catch { /* only a better base later */ } } };
  if (O.h === T.h) { based(); return { same: true, hm: O.h, sig }; }
  let B = null; let bbuf = null;
  if (o.base) { const bm = manifestOf(fs, o.base.dir, o.base.by); if (bm.m) { const b = readBytes(fs, o.base.dir, bm.m); if (b.buf) { bbuf = b.buf; B = BC.cloudForm(bbuf, null, S); } } }
  const pretty = prettyOf(got.buf);
  if (B && B.h === T.h) { based(); return { same: true, hm: O.h, sig }; } // nothing new there
  const keep = (text) => { if (o.recovery) atomic(fs, o.recovery, got.buf); return text; };
  if (B && B.h === O.h) { // nothing new here: theirs, exactly as they wrote it
    const r = BC.localFromCloud(T, o.ctx, S, pretty);
    keep(); based();
    return { out: r.out, lh: r.lh, hm: T.h, sig, conflicts: [] };
  }
  const keepAll = Boolean(o.keepAll || !B);
  let r = B ? BC.mergeChat({ baseBuf: bbuf, localBuf: got.buf, cloudBuf: t.buf, ctx: o.ctx, S, lh: O.h, ch: T.h, counters: false, keepAll, forms: { O, T, B } }) : null;
  if (r?.stale) return { stale: true };
  let value = null; // (the whole-value way: no base, or theirs won a field)
  const parsed = () => ({ base: B ? JSON.parse(B.text.toString('utf8')) : null, ours: JSON.parse(O.text.toString('utf8')), theirs: S.toCloud(JSON.parse(t.buf.toString('utf8')), o.ctx) });
  if (!r) { const v = parsed(); const m = S.merge3(v.base, v.ours, v.theirs, { keepAll }); value = m.value; r = { conflicts: m.conflicts }; }
  let lost = null; let confl = null;
  if (r.conflicts.length && o.confl) { // (the owner settles conflicts: ours stays, theirs is kept whole for the choice)
    const copy = `${o.confl.cid}.copy.json`;
    try { atomic(fs, path.join(o.confl.dir, copy), Buffer.from(t.buf)); confl = { cid: o.confl.cid, copy }; } catch (err) { return { wait: `conflict-${err.code || 'failed'}` }; }
  } else if (r.conflicts.length) {
    // a field changed two ways: the newer chat wins (updatedAt, then the computer's name: the same answer on both)
    const tu = Number(T.head?.updatedAt) || 0; const ou = Number(O.head?.updatedAt) || 0;
    const theirsWin = tu > ou || (tu === ou && P.safeBy(o.by) > P.safeBy(o.me));
    if (theirsWin) { const v = parsed(); const m = S.merge3(v.base, v.theirs, v.ours, { keepAll }); value = m.value; }
    lost = { side: theirsWin ? 'ours' : 'theirs', text: theirsWin ? O.text : t.buf, fields: r.conflicts.slice(0, 5) };
  }
  let text; let out;
  if (value) { text = Buffer.from(JSON.stringify(value), 'utf8'); out = Buffer.from(pretty ? JSON.stringify(S.fromCloud(value, o.ctx), null, 2) : JSON.stringify(S.fromCloud(value, o.ctx)), 'utf8'); } else { text = r.text; out = r.localOut; }
  const hm = sha1(text);
  if (hm === O.h && !lost && !confl) return { same: true, hm, sig };
  if (hm === T.h) { const lr = BC.localFromCloud(T, o.ctx, S, pretty); out = lr.out; } // (the same chat as theirs: taken as they wrote it, so both settle on one text)
  if (lost && o.trash) { // the losing side's whole version, in this computer's Deleted files (sync-aside notes it)
    const d = day(o.now || Date.now()); const name = `${crypto.randomBytes(3).toString('hex')}-${path.basename(o.file)}`;
    const rel = `${d}/chats/${name}`;
    try { atomic(fs, path.join(o.trash, d, 'chats', name), Buffer.from(lost.text)); lost.trash = `here:${rel}`; } catch (err) { return { wait: `aside-${err.code || 'failed'}` }; } // (kept first, or nothing changes)
  }
  if (lost) delete lost.text;
  based();
  if (!out || hm === O.h) return { same: true, hm, sig, conflicts: r.conflicts, lost, confl };
  keep();
  return { out, lh: hm, hm, sig, conflicts: r.conflicts, lost, confl };
}

// another computer's version kept here as the base of later merges: its manifest (as it was written) and its pieces,
// copied from the cloud folder (a piece already here under its name and size is the same piece: named by its hash)
function keepBase(fs, from, to, man, name) {
  fs.mkdirSync(to, { recursive: true });
  for (const s of man.segs) {
    const dst = path.join(to, `${s.h}.seg`);
    let have = false; try { have = fs.statSync(dst).size === s.b; } catch { /* not here */ }
    if (have) continue;
    const b = fs.readFileSync(path.join(from, `${s.h}.seg`));
    if (b.length !== s.b || sha1(b) !== s.h) throw Object.assign(new Error('piece changed'), { code: 'segment-bad' });
    atomic(fs, dst, b);
  }
  atomic(fs, path.join(to, P.manifestName(name)), Buffer.from(P.manifestText(man), 'utf8'));
}

// a version's whole cloud-form bytes (→ { buf, h } | { wait })
function text(fs, o) {
  const mm = o.man ? { m: o.man } : manifestOf(fs, o.dir, o.by);
  if (mm.wait) return mm;
  const b = readBytes(fs, o.dir, mm.m);
  if (b.wait) return b;
  return { buf: b.buf, h: sha1(b.buf) };
}

// ---------- tidying ----------
// a rename that crosses disks (the cloud folder → this computer's pack trash) is a copy, then the original removed
function crossFs(fs) {
  return new Proxy(fs, { get(t, k) {
    if (k !== 'renameSync') return t[k];
    return (a, b) => { try { return t.renameSync(a, b); } catch (err) { if (err.code !== 'EXDEV') throw err; t.copyFileSync(a, b); return t.rmSync(a, { force: true }); } };
  } });
}
// pieces no manifest names, older than grace → the pack trash (30 days); this computer's old own versions there too
function tidy(fs, o) {
  const out = { moved: 0, held: '' };
  const f = crossFs(fs);
  for (const dir of o.dirs || []) {
    try { const r = P.tidy(f, dir, { grace: o.grace, now: o.now, trash: o.trash, keep: o.keep }); out.moved += r.moved || 0; if (r.held) out.held = r.held; } catch (err) { out.held = err.code || 'error'; }
  }
  if (o.trash) { try { out.purged = P.purge(fs, o.trash, o.now); } catch { /* next time */ } }
  return out;
}
// this computer's own versions kept for merges: the newest `keep` stay, older manifests go to the pack trash
function trimSelf(fs, dir, keepN, trash, now) {
  let names = []; try { names = fs.readdirSync(dir); } catch { return 0; }
  const own = names.map((f) => /^m-self-(\d+)\.json$/.exec(f)).filter(Boolean).map((x) => ({ f: x[0], seq: Number(x[1]) })).sort((a, b) => b.seq - a.seq);
  let n = 0;
  for (const x of own.slice(keepN)) {
    const to = path.join(trash, day(now || Date.now()), path.basename(dir));
    try { fs.mkdirSync(to, { recursive: true }); crossFs(fs).renameSync(path.join(dir, x.f), path.join(to, x.f)); n += 1; } catch { /* next time */ }
  }
  return n;
}

// the files thread's entry (storework.js syncPack): one of the operations above, by name
function op(kind, fs, a) {
  if (kind === 'publish') return publish(fs, a);
  if (kind === 'take') return take(fs, a);
  if (kind === 'text') return text(fs, a);
  if (kind === 'tidy') return tidy(fs, a);
  throw new Error(`syncPack: ${kind}?`);
}

module.exports = { op, keepBase, PACKS_V, MIN, QUIET_MS, gate, readRecords, decide, publish, take, text, tidy, trimSelf, stillRead, manifestOf, isHash, sha1 };
