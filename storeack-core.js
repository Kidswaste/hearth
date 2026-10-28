// (round 77, storeack77) A store the window (or the main process) holds in memory, when the other computer's version
// of it arrives: the change not written yet goes first (sync's write guard merges it with what arrived), then the store
// is read again and put on screen, then sync is told this side now holds what arrived (ack), so later saves merge against
// it — without the ack a thing taken out right after it arrived came back (round 76, projects bug 7).
// Pure (no Electron): the window's one (window.StoreAck, hears every hearth:synced), the main process's one
// (require('./storeack-core').main, syncmain.js hands it arrivals), and dev/storeack77-test.js runs it against the real
// sync engine in the two-computer simulator; dev/storeack-scan.js flags stores read again on arrival without it.
//   hold(store, h)    store: a kv name ('notes'), a data-folder path ('tickets/index.json') or a RegExp of paths
//                     h: { name,                  who holds it
//                          saver | pending + flush,  a change not written yet → write it now
//                          read(rel) + apply(value, rel),  read it again (async), then put it in memory and on screen
//                                                  (sync, so nothing typed in between is lost: see run()); apply returns
//                                                  false when it couldn't (then sync keeps merging: nothing is lost)
//                          drop(rel) }             or: forget the copy, the next use reads it again
//                     neither read nor drop: it holds nothing (reads fresh at each change): only its pending change goes
//                     → { off(), again(rel) }  again: an arrival put off (an edit was open on it) handled now
//   arrived(files)    sync:pulled's list ([{ rel, kind }]) → { acked, kept, unknown }
//   into(target, src) what arrived put into the objects a screen holds (same objects, new values)
// A store nobody declared is never acked: someone may hold an older copy, and sync's guard is what keeps the other
// computer's changes from being undone by its next save (a thing taken out may come back: never lost).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    // the main process's one (syncmain.js hands it arrivals and the ack)
    let f = null;
    api.main = api.create({ ack: (r, t) => f?.(r, t) });
    api.main.setAck = (fn) => { f = fn; };
    module.exports = api;
    return;
  }
  // the window's one: every arrival sync.js announces (hearth:synced, after the files are written)
  const SA = root.StoreAck = api.create({ ack: (r, since) => root.hub.sync?.ack(r, { since }), log: console.warn });
  SA.into = api.into;
  // a store read again for an arrival: what's there (or d when it's gone); one that can't be read throws, so nothing
  // in memory is replaced by an empty copy and nothing is acked
  SA.kv = async (name, d = null) => {
    const r = await root.hub.kvGet(name, d, { status: true });
    if (r?.state === 'ok') return r.value ?? d;
    if (r?.state === 'missing') return d;
    throw Error(`${name}: ${r?.state}`);
  };
  // a text field shown again with what arrived (fn redraws it) keeps its caret, selection and scroll: moved by what was
  // added or taken out before them
  SA.keepCaret = (area, fn) => {
    const v = area?.value; const a = area?.selectionStart; const b = area?.selectionEnd; const top = area?.scrollTop;
    const on = area && root.document.activeElement === area;
    fn();
    if (!area || area.value === v) return;
    let i = 0; while (i < a && v[i] === area.value[i]) i += 1;
    const d = i >= a ? 0 : area.value.length - v.length;
    area.scrollTop = top;
    if (on) area.setSelectionRange(Math.max(0, a + d), Math.max(0, b + d));
  };
  root.addEventListener('hearth:synced', (e) => { SA.arrived(e.detail?.files || []).catch(() => {}); });
}(typeof self !== 'undefined' ? self : this, () => {
  const relOf = (s) => (s instanceof RegExp || /[/.]/.test(s) ? s : `kv/${s}.json`);
  function create({ ack, now = () => Date.now(), log = () => {} } = {}) {
    // { store, h } · rel → the arrival being handled (one at a time per store)
    const holders = new Set(); const chains = new Map();
    const holdersOf = (rel) => [...holders].filter((x) => (x.store instanceof RegExp ? x.store.test(rel) : x.store === rel));
    const pending = (h) => (h.saver ? h.saver.pending() : h.pending?.());
    const flush = (h) => (h.saver ? h.saver.flush() : h.flush?.());
    const copy = (h) => Boolean(h.read || h.drop);
    function hold(store, h = {}) {
      const x = { store: relOf(store), h };
      holders.add(x);
      return { off: () => holders.delete(x), again: (rel = x.store) => arrived([{ rel }]) };
    }
    // one store: 1. every holder's change written (each merged with what arrived by sync's guard) before anyone reads;
    // 2. read again and put in place (apply is sync: nothing typed in between is lost); something typed while it was
    // read is written and read again — with another holder holding a copy that write leaves it older than the disk:
    // then no ack (sync keeps merging). A change that couldn't be written is never read over.
    async function run(rel, list, files) {
      let ok = true; const failed = new Set(); const late = new Set();
      const write = async (x, isLate) => {
        try { await flush(x.h); if (isLate) late.add(x); return true; } catch (err) { log('storeack', rel, err); ok = false; return false; }
      };
      for (const x of list) if (pending(x.h) && !(await write(x))) failed.add(x);
      const since = now();
      for (const x of list) {
        const { h } = x;
        if (failed.has(x)) continue;
        for (let i = 0; ; i++) {
          if (!copy(h)) { if (pending(h)) await write(x, true); break; }
          let v;
          if (h.read) { try { v = await h.read(rel, files); } catch (err) { log('storeack', rel, err); ok = false; break; } }
          if (pending(h)) { if (!(await write(x, true))) break; if (i < 3) continue; ok = false; break; }
          try { if ((h.read ? h.apply?.(v, rel, files) : h.drop(rel)) === false) ok = false; } catch (err) { log('storeack', rel, err); ok = false; }
          break;
        }
      }
      if ([...late].some((w) => list.some((y) => y !== w && copy(y.h)))) ok = false;
      return { rel, ok, since };
    }
    async function arrived(files = []) {
      const rels = [...new Set((files || []).map((f) => String(f?.rel)))].filter((r) => /\.json$/i.test(r) && !r.startsWith('chats/'));
      const unknown = []; const jobs = [];
      for (const rel of rels) {
        const hs = holdersOf(rel);
        if (!hs.length) { unknown.push(rel); continue; }
        const job = (chains.get(rel) || Promise.resolve()).catch(() => {}).then(() => run(rel, hs, files));
        chains.set(rel, job);
        job.finally(() => { if (chains.get(rel) === job) chains.delete(rel); }).catch(() => {});
        jobs.push(job);
      }
      const done = await Promise.all(jobs); const good = done.filter((d) => d.ok);
      if (good.length) { try { await ack?.(good.map((d) => d.rel), Math.min(...good.map((d) => d.since))); } catch { /* sync off */ } }
      return { acked: good.map((d) => d.rel), kept: done.filter((d) => !d.ok).map((d) => d.rel), unknown };
    }
    return { hold, arrived };
  }
  // what arrived put INTO the object in memory (same objects, same arrays): parts of a screen that hold a piece of the
  // store (a station's settings, a list) see the new values instead of an orphan copy. Arrays: element by element.
  const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const both = (a, b) => (plain(a) && plain(b)) || (Array.isArray(a) && Array.isArray(b));
  function into(target, src) {
    if (!both(target, src)) return src;
    if (Array.isArray(src)) {
      src.forEach((v, i) => { target[i] = both(target[i], v) ? into(target[i], v) : v; });
      target.length = src.length;
      return target;
    }
    for (const k of Object.keys(target)) if (!(k in src)) delete target[k];
    for (const [k, v] of Object.entries(src)) target[k] = both(target[k], v) ? into(target[k], v) : v;
    return target;
  }
  return { create, relOf, into };
}));
