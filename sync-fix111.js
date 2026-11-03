// (round 111, syncfix111) Three things the sync engine (sync-engine.js) now does itself, kept here so its own edits stay
// a line each:
//   · waits(why, code) / mark(): a file that only WAITS (another program holds it: EBUSY, EPERM on Windows, a store that
//     can't be read just now: EHELD; or a drive that didn't answer) is marked { waits: true } on its blocked entry, so
//     every reader of the status (the chip, the panel, first run, /sync status) agrees without knowing the codes.
//   · inside(old, next): is everything in this computer's version (old) still in the version replacing it (next)?
//     When two Hearths are joined, the first merge of each store (no common base: everything of both is kept) made a
//     copy in data/sync/recovery ("the version before the last change from your other computer") of every store,
//     all listed in Deleted files, each the only copy of nothing: such a copy isn't made any more. A value that is ONLY
//     in the old version (a title changed two ways, a count) keeps the copy, as before. Day to day (a base known) the
//     copy is made as before: it is how the other computer's change is undone. Time stamps (updatedAt…) don't count.
//   · listed(list): Deleted files' recovery copies whose content is all in the current file get inside: true, so the
//     panel folds them into one row (each still restorable). Nothing is removed.
//   · chatTrashAside(): restoring a chat from Deleted files takes its copy out of Recently deleted (data/trash/<id>.json)
//     into Deleted files (data/sync/trash, kept 30 days): it was left there, here and, through sync, on both computers.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const S = require('./sync-merge');

// ---------- files that only wait ----------
const WAIT_WHY = new Set(['locked', 'drive']);
const WAIT_CODE = new Set(['EBUSY', 'ETXTBSY', 'ELOCKED', 'EHELD']);
const waits = (why, code) => WAIT_WHY.has(why) || (why !== 'read-only' && why !== 'denied' && WAIT_CODE.has(code));
const mark = (why, code) => (waits(why, code) ? { waits: true } : {});
// the entries a status says wait (the engine's mark; an older engine's entries: by their why, as sync.js did)
const waitsOf = (b) => (b && typeof b.waits === 'boolean' ? b.waits : WAIT_WHY.has(b?.why));

// ---------- is the old version all inside the new one? ----------
// (sync-merge.js TIME_KEY: a field that says when, not what)
const TIME_KEY = /(^|[a-z])(At|Time|Ts)$|^(updated|modified|lastSeen|last|mtime|seen|since|opened|at)$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const when = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v)); // a time (ms, or an ISO date)
const LIMIT = 200000; // values looked at, at most: past that, "not known" (the copy is made, as before)
function inside(old, next) {
  let n = 0;
  const go = (a, b, k) => {
    if ((n += 1) > LIMIT) throw new Error('too big');
    if (a === b) return true;
    if (k !== undefined && TIME_KEY.test(k) && when(a) && when(b)) return true;
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) return false;
      if (!a.length) return true;
      const byKey = new Map();
      for (const y of b) { const ky = S.keyOf(y); if (ky !== null && !byKey.has(ky)) byKey.set(ky, y); }
      for (const x of a) {
        const kx = S.keyOf(x);
        if (kx !== null && byKey.has(kx)) { if (!go(x, byKey.get(kx))) return false; continue; }
        if (!b.some((y) => S.eq(x, y))) return false;
      }
      return true;
    }
    if (isObj(a)) {
      if (!isObj(b)) return false;
      for (const key of Object.keys(a)) { if (!Object.prototype.hasOwnProperty.call(b, key) || !go(a[key], b[key], key)) return false; }
      return true;
    }
    return S.eq(a, b);
  };
  try { return go(old, next); } catch { return false; }
}
// text (this computer's file) inside next (cloud form)? ctx: the engine's path forms. Unreadable / unparsable → false
function textInside(text, next, ctx) {
  if (next === undefined || next === null) return false;
  try { return inside(S.toCloud(S.parseJson(text), ctx), next); } catch { return false; }
}

// ---------- Deleted files: old recovery copies already inside the current file ----------
const LIST_MAX = 4 * 1024 * 1024; // bigger ones aren't read to list them (not folded)
async function listed(list, o) {
  for (const t of list) {
    if (!t?.recovery) continue;
    try {
      const src = path.join(o.stateDir, 'recovery', ...String(t.rel).split('/'));
      const cur = o.localPathOf(t.rel);
      const [a, b] = await Promise.all([fsp.stat(src), fsp.stat(cur)]);
      if (a.size > LIST_MAX || b.size > LIST_MAX) continue;
      const [ta, tb] = await Promise.all([fsp.readFile(src, 'utf8'), fsp.readFile(cur, 'utf8')]);
      const ctx = o.ctx();
      if (textInside(ta, S.toCloud(S.parseJson(tb), ctx), ctx)) t.inside = true;
    } catch { /* not here / unreadable: listed as it is */ }
  }
  return list;
}

// ---------- a restored chat leaves Recently deleted ----------
// rel: what was restored (chats/<id>.json). The app's trash copy (data/trash/<id>.json), if any, is MOVED to Deleted
// files (data/sync/trash/<day>/trash/<id>.json): never deleted. Sync then takes it out of the cloud copy's trash and the
// other computer's Recently deleted the usual way (its delete goes to Deleted files there too). → the trash rel, or null
async function chatTrashAside(rel, o) {
  const m = /^chats\/([^/]+\.json)$/i.exec(String(rel || ''));
  if (!m) return null;
  const trashRel = `trash/${m[1]}`;
  const src = o.localPathOf(trashRel);
  try { await fsp.stat(src); } catch { return null; }
  const dir = path.join(o.stateDir, 'trash', o.day, 'trash');
  await fsp.mkdir(dir, { recursive: true });
  let dst = path.join(dir, m[1]);
  try { await fsp.stat(dst); dst = path.join(dir, `${o.rand()}-${m[1]}`); } catch { /* free */ }
  if (!(await o.move(src, dst))) return null;
  return trashRel;
}

module.exports = { waits, mark, waitsOf, inside, textInside, listed, chatTrashAside, TIME_KEY };
