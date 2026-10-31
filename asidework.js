// (round 95, aside95) The heavy part of sync's choices on two versions, off the main process. When the owner picks a
// version sync kept (a version kept aside: Use the one kept aside / Keep both; a conflict: Keep the other / Merge /
// Keep both; Restore from Deleted files), the engine (sync-engine.js asideDo / resolve / restore) read both versions
// whole, parsed them, merged and wrote the result on the main process: for a 60 MB chat that held the whole app for
// seconds. Here that JSON work runs on the store's files thread (storework.js asideTake / asideForm → work() below);
// the engine keeps its own bookkeeping (Deleted files, the write guard's base, the notes, the conflict record) and
// only renames the finished file into place, after checking the file wasn't changed meanwhile.
// Also (round 95): the version a "Keep the other" replaced is put in the synced Deleted files too (share), so the
// other computer lists it and can bring it back (before, it was only in this computer's own Deleted files; the
// conflict's copy went to the trash's hidden conflicts/ folder, which Deleted files doesn't list).
// Nothing here deletes a version: a file that can't be read is said so (never taken as "empty"), a version is only
// replaced by a rename of a finished, flushed file, and what is replaced was kept in Deleted files by the engine first.
// Copies go only into this computer's data folder and the sync folder's own trash (synced by the owner's cloud drive).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SS = require('./scenesafe-core'); // readRetry: a file held for a moment (Windows) is read again, never "missing"

const fsp = fs.promises;
const MIN = Number(process.env.HEARTH_ASIDEWORK_MIN) || 1024 * 1024; // smaller stores: the engine's own way (a few ms)
const SHARE_MAX = 200 * 1024 * 1024; // a bigger file replaced stays in this computer's Deleted files only (not uploaded again)
const rand = () => crypto.randomBytes(4).toString('hex');
const PREFIX = /^([0-9a-f]{8})-(.+)$/;

// ---------- on the store thread ----------
// a JSON file → { v, text } · { none: true } (not there) · { error } (there but can't be read or parsed: never "none")
function readJson(S, file) {
  let text;
  try { text = SS.readRetry(fs, file); } catch (err) { return err.code === 'ENOENT' ? { none: true } : { error: err.code || 'read' }; }
  try { return { v: S.parseJson(text), text }; } catch { return { error: 'damaged' }; }
}
const sigOf = (st) => (st ? [st.size, st.mtimeMs] : null);
const statOf = (f) => { try { return fs.statSync(f); } catch (err) { if (err.code === 'ENOENT') return null; throw err; } };
function writeFlushed(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.hearth-tmp-${rand()}-${path.basename(file)}`); // (the engine sweeps leftovers)
  let fd = null;
  try { fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, text); try { fs.fsyncSync(fd); } catch { /* a disk that can't */ } fs.closeSync(fd); fd = null; } catch (err) { if (fd !== null) try { fs.closeSync(fd); } catch { /* closed */ } fs.rmSync(tmp, { force: true }); throw err; }
  return tmp;
}
function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; } catch (err) {
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60 * (i + 1)); // (Windows: a cloud client holding it)
    }
  }
}
const ownBytes = (s) => { const b = Buffer.from(s, 'utf8'); const u = new Uint8Array(new ArrayBuffer(b.length)); u.set(b); return u; };

// take: the version to put in place, written next to it (not renamed: the engine does that, see create().take)
//   a: { how: 'theirs' | 'both' | 'merge', rel, file (this computer's, local form), src (the other version), cloud (src
//        is in cloud form: a conflict's copy; else it may be either: a Deleted-files copy), from (for Keep both's
//        names), theirsNewer (Merge: which side wins a field changed two ways), ctx (the engine's path forms) }
//   → { ok: true, tmp, sig (this computer's file as read: [size, mtime] or null), ours (it had one), prev (its cloud
//       form as bytes: the write guard's base), conflicts (Merge: fields changed two ways) } · { ok: false, error, side }
function take(a, S) {
  const st0 = statOf(a.file);
  const O = readJson(S, a.file);
  // Keep the other: this computer's version is only replaced (the engine keeps its bytes in Deleted files first), so a
  // damaged one doesn't stop it; Keep both and Merge need it: not read → nothing changes
  if (O.error && a.how !== 'theirs') return { ok: false, side: 'here', error: `This computer's version can't be read right now (${O.error}), so nothing was changed` };
  const T = readJson(S, a.src);
  if (T.v === undefined) return { ok: false, side: 'there', error: T.none ? 'That version is no longer in Deleted files' : `The other version can't be read right now (${T.error}), so nothing was changed` };
  if (sigOf(statOf(a.file))?.join() !== sigOf(st0)?.join()) return { ok: false, side: 'here', error: 'It changed while this was being prepared. Try again.' };
  const ctx = a.ctx;
  const ours = O.text !== undefined ? S.toCloud(O.v, ctx) : null;
  const theirs = a.cloud ? T.v : S.toCloud(S.fromCloud(T.v, ctx), ctx);
  let v = theirs; let conflicts = 0;
  if (a.how === 'both' && ours) v = S.keepBoth(ours, theirs, a.from || 'the other computer', undefined, { inPlace: S.inPlaceOf(a.rel) });
  if (a.how === 'merge' && ours) {
    const mr = S.merge3(null, a.theirsNewer ? theirs : ours, a.theirsNewer ? ours : theirs, { counters: S.isCounterRel(a.rel) });
    v = mr.value; conflicts = mr.conflicts.length;
  }
  // as this computer stores it (pretty unless its file was compact: sync-engine.js localJsonText)
  const pretty = O.text === undefined || O.text.length < 2 || /^[[{]\s/.test(O.text.slice(0, 2));
  const local = S.fromCloud(v, ctx);
  const tmp = writeFlushed(a.file, pretty ? JSON.stringify(local, null, 2) : JSON.stringify(local));
  const prev = ours ? ownBytes(JSON.stringify(ours)) : null;
  return { ok: true, tmp, sig: sigOf(st0), ours: Boolean(ours), conflicts, prev, ...(prev ? { __transfer: [prev.buffer] } : {}) };
}
// form: a JSON file written whole somewhere else in another form (renamed into place here)
//   a: { src, out, ctx, to: 'local' (this computer's form, pretty: a restore / a chat Keep both made) | 'cloud' (the
//        synced Deleted files), copyOf: { id, from } (a chat Keep both made: its new id, "… (from Mac)") }
function form(a, S) {
  const T = readJson(S, a.src);
  if (T.v === undefined) return { ok: false, error: T.none ? 'That version is no longer there' : `It can't be read right now (${T.error})` };
  let v = a.to === 'cloud' ? S.toCloud(T.v, a.ctx) : S.fromCloud(T.v, a.ctx);
  if (a.copyOf) v = { ...v, ...(v && 'id' in v ? { id: a.copyOf.id } : {}), title: `${v?.title || 'Chat'} (from ${a.copyOf.from})` }; // (as sync-engine.js resolve 'both')
  const tmp = writeFlushed(a.out, a.to === 'cloud' ? JSON.stringify(v) : JSON.stringify(v, null, 2));
  try { renameRetry(tmp, a.out); } catch (err) { fs.rmSync(tmp, { force: true }); throw err; }
  return { ok: true };
}
// the store thread's entry (storework.js OPS.asideTake / OPS.asideForm)
function work(op, a) {
  const S = require('./sync-merge');
  return op === 'take' ? take(a, S) : form(a, S);
}

// ---------- on the main process: what the engine calls (sync-engine.js o.asideBig) ----------
// runOff(op, args): the store's files thread (store.js runOff); min: from what size a store goes there
function create({ runOff, min = MIN, log = () => {} } = {}) {
  const sizeOf = async (f) => { if (!f) return 0; try { return (await fsp.stat(f)).size; } catch (err) { if (err.code === 'ENOENT') return 0; throw err; } };
  const big = async (rel, files) => rel !== 'app/config.json' && /\.json$/i.test(String(rel || '')) && Math.max(...(await Promise.all(files.map(sizeOf)))) >= min;
  // the guard's base for the window's next save (sync-engine.js pulledPrev: { lazy: text }), its text made only if a
  // save does need it (rare: the window reads again first) — the bytes stay as they came from the thread meanwhile
  const lazyOf = (bytes) => { let t = null; return { get lazy() { if (t === null) t = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8'); return t; } }; };
  async function renameRetryP(from, to) {
    for (let i = 0; ; i++) {
      try { await fsp.rename(from, to); return; } catch (err) { if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err; await new Promise((r) => setTimeout(r, 60 * (i + 1))); }
    }
  }
  // → null (a small store, or not JSON: the engine's own way), or { ok: false, error } (nothing changed), or
  // { ok: true, ours, prev (for remember), conflicts, put() → { ok } (into place, only if the file is as it was read;
  // else nothing changes and it says to try again), drop() (the prepared file let go) }
  async function take(a) {
    if (!(await big(a.rel, [a.file, a.src]))) return null;
    let r;
    try { r = await runOff('asideTake', a); } catch (err) { return { ok: false, error: `It couldn't be prepared (${err.message}), so nothing was changed` }; }
    if (!r?.ok) return { ok: false, error: r?.error || 'It couldn\'t be prepared, so nothing was changed' };
    const drop = () => fsp.rm(r.tmp, { force: true }).catch(() => {});
    return { ok: true, ours: r.ours, conflicts: r.conflicts || 0, prev: r.prev ? lazyOf(r.prev) : null, drop,
      async put() {
        let st = null; try { st = await fsp.stat(a.file); } catch (err) { if (err.code !== 'ENOENT') { await drop(); return { ok: false, error: `It can't be read right now (${err.code})` }; } }
        if ((st ? [st.size, st.mtimeMs].join() : '') !== (r.sig ? r.sig.join() : '')) { await drop(); return { ok: false, error: 'It changed while this was being prepared. Try again.' }; }
        try { await renameRetryP(r.tmp, a.file); } catch (err) { await drop(); return { ok: false, error: err.message }; }
        return { ok: true };
      } };
  }
  // a big JSON file written whole elsewhere in this computer's (or the cloud's) form on the thread → true; false: small
  // (the engine's own way). Throws when it can't (nothing is written then)
  async function formOff(src, out, ctx, o = {}) {
    if (!(await big(o.rel || src, [src]))) return false;
    const r = await runOff('asideForm', { src, out, ctx, to: o.to || 'local', copyOf: o.copyOf || null });
    if (!r?.ok) throw Error(r?.error || 'It couldn\'t be written');
    return true;
  }
  // Keep the other: this computer's version, kept in its Deleted files (data/sync/trash/<day>/<rel>, "kept"), goes to the
  // synced Deleted files too (<sync folder>/Hearth/trash/<day>/<rel>, in the cloud's form), so the other computer lists
  // it. Both copies get the same short prefix ("1a2b3c4d-notes.json"): the Deleted files list shows them as one on this
  // computer (sync-conflicts.js), and Restore takes the prefix off. → where this computer's copy is now. Best effort:
  // if it can't be copied, this computer's copy stays as it was (logged).
  async function share({ rel, kept, trash, day, ctx }) {
    if (!kept || !rel || !trash) return kept;
    try {
      const st = await fsp.stat(kept);
      if (st.size > SHARE_MAX) return kept;
      const parts = rel.split('/'); const base = parts[parts.length - 1];
      const keptName = path.basename(kept);
      const own = keptName !== base && PREFIX.exec(keptName)?.[2] === base ? PREFIX.exec(keptName)[1] : null; // (kept twice the same day: it has one)
      const h = own || rand();
      const dst = path.join(trash, day, ...parts.slice(0, -1), `${h}-${base}`);
      if (await fsp.stat(dst).then(() => true, () => false)) return kept;
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      if (/\.json$/i.test(base) && rel !== 'app/config.json') {
        const r = await runOff('asideForm', { src: kept, out: dst, ctx, to: 'cloud' });
        if (!r?.ok) throw Error(r?.error || 'not written');
      } else {
        const tmp = path.join(path.dirname(dst), `.hearth-tmp-${rand()}-${base}`);
        try { await fsp.copyFile(kept, tmp); await renameRetryP(tmp, dst); } catch (err) { await fsp.rm(tmp, { force: true }).catch(() => {}); throw err; }
      }
      if (own) return kept;
      const twin = path.join(path.dirname(kept), `${h}-${base}`);
      await renameRetryP(kept, twin);
      return twin;
    } catch (err) { log('share', rel, err.message); return kept; }
  }
  return { take, form: formOff, share, min };
}

module.exports = { create, work, MIN };
