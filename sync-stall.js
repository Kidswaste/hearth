// (round 103, syncstall103) sync's long loops over every file, in slices that give the event loop a turn. Pure Node,
// used by sync-engine.js (the main process: a held loop freezes every window's IPC). At 50,000 files a loop over all
// names in one go held the main process 70–350 ms (Windows' cloud-file check before each pass, the join's comparison,
// a renamed folder's matching). Each helper does the same work in the same order as the loop it replaces, only with
// a breath (breathe(): the engine's own, a turn of the event loop at most every ~12 ms) every `every` items.
// Nothing here decides what is copied, deleted or kept: the engine's rules run unchanged on what these return.
'use strict';

const EVERY = 256;
// one breath if it is time (breathe() → a Promise when the engine wants a turn, else null)
async function pause(breathe) { const b = breathe?.(); if (b) await b; }

// for (const x of it) fn(x), with breaths
async function each(it, fn, breathe, every = EVERY) {
  let i = 0;
  for (const x of it) { fn(x); if ((++i % every) === 0) await pause(breathe); }
}
// it.filter(pred), with breaths (the order kept)
async function filter(it, pred, breathe, every = EVERY) {
  const out = []; let i = 0;
  for (const x of it) { if (pred(x)) out.push(x); if ((++i % every) === 0) await pause(breathe); }
  return out;
}

// Windows (probeWin): the cloud entries to ask the cloud client about: new or changed since the last pass in the cloud
// or here (a file unchanged on both sides keeps its known hash whatever its download state), then the client's copies.
// The same list, in the same order, as
//   [...[...files].filter(([rel, e]) => !cachedThere(rel, e) || !L || L.unavailable || !cachedHere(rel, L)).map(([, e]) => e), ...copies]
// → { entries, files: each entry's absolute path (made by a getter: 5,000 path.join at once held ≈ 30 ms) }
async function winProbeList(files, copies, local, { cachedThere, cachedHere, breathe }) {
  const entries = [];
  await each(files, ([rel, e]) => {
    const L = local?.get(rel);
    if (!cachedThere(rel, e) || !L || L.unavailable || !cachedHere(rel, L)) entries.push(e);
  }, breathe);
  for (const c of copies) entries.push(c);
  const paths = [];
  await each(entries, (e) => paths.push(e.file), breathe);
  return { entries, files: paths };
}

// renames (passOnce): the new files of one side by content hash, for a delete of the same content to become a move.
// The same map, lists in the same order, as
//   for (const p of live) if (p.op === op && !p[noSide] && !base[p.rel]) { if (!m.has(p.h)) m.set(p.h, []); m.get(p.h).push(p); }
// (base: state.base, a watched map: 50,000 reads through its Proxy, twice, held the first pass ≈ 60–80 ms in one go)
async function byHash(live, op, noSide, base, breathe) {
  const m = new Map();
  await each(live, (p) => { if (p.op === op && !p[noSide] && !base[p.rel]) { let l = m.get(p.h); if (!l) m.set(p.h, (l = [])); l.push(p); } }, breathe);
  return m;
}

module.exports = { each, filter, pause, winProbeList, byHash, EVERY };
