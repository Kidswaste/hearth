// (round 77, storeack77) A store the window (or the main process) holds in memory, when the other computer's version
// of it arrives: the change not written yet goes first (sync's write guard merges it with what arrived), then the store
// is read again and put on screen, then sync is told this side now holds what arrived (ack), so later saves merge against
// it — without the ack a thing taken out right after it arrived came back (round 76, projects bug 7).
// Pure (no DOM, no Electron): sync.js makes the window's one (window.StoreAck), syncmain.js the main process's one, and
// dev/storeack77-test.js runs it against the real sync engine in the two-computer simulator.
//   hold(store, h)    store: a kv name ('notes'), a data-folder path ('tickets/index.json') or a RegExp of paths
//                     h: { name,                  who holds it (the scan and /sync's debug list say it)
//                          saver | pending + flush,  a change not written yet → write it now
//                          read(rel) + apply(value, rel),  read it again (async), then put it in memory and on screen
//                                                  (sync, so nothing typed in between is lost: see run()); apply returns
//                                                  false when it couldn't (then sync keeps merging: nothing is lost)
//                          drop(rel) }             or: forget the copy, the next use reads it again
//                     neither read nor drop: it holds nothing (reads fresh at each change): only its pending change goes
//                     → { off(), fresh(since) }  fresh: "I just read it from disk" (a lazy module's first read: acked
//                     when no other holder of it keeps an older copy)
//   arrived(files)    sync:pulled's list ([{ rel, kind }]) → { acked, kept, unknown }
// A store nobody declared is never acked: someone may hold an older copy, and sync's guard is what keeps the other
// computer's changes from being undone by its next save (a thing taken out may come back: never lost).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) { // the main process's one (syncmain.js hands it arrivals and the ack)
    let ackFn = null; api.main = api.create({ ack: (rels, since) => ackFn?.(rels, since), log: (...a) => { if (process.env.HEARTH_SYNC_LOG) console.log(...a); } });
    api.main.setAck = (fn) => { ackFn = typeof fn === 'function' ? fn : null; };
    module.exports = api;
  }
  else { // the window's one: each arrival sync.js announces (hearth:synced, after the files are written)
    root.StoreAckCore = api;
    root.StoreAck = api.create({ ack: (rels, since) => root.hub?.sync?.ack?.(rels, { since }), log: (...a) => console.warn(...a) });
    // a store read again for an arrival: what's there (or d when it's gone); one that can't be read throws, so nothing
    // in memory is replaced by an empty copy and nothing is acked
    root.StoreAck.kv = async (name, d = null) => {
      const r = await root.hub.kvGet(name, d, { status: true });
      if (r?.state === 'ok') return r.value ?? d;
      if (r?.state === 'missing') return d;
      throw Error(`${name} could not be read (${r?.state || 'no answer'})`);
    };
    // a text field shown again with what arrived (fn redraws it) keeps its caret, selection and scroll: moved by what was
    // added or taken out before them
    root.StoreAck.into = api.into;
    root.StoreAck.keepCaret = (area, fn) => {
      const on = area && root.document?.activeElement === area;
      const was = area ? { v: area.value, a: area.selectionStart, b: area.selectionEnd, top: area.scrollTop } : null;
      fn();
      if (!area || !was || area.value === was.v) return;
      let i = 0; while (i < was.a && i < area.value.length && was.v[i] === area.value[i]) i += 1;
      const d = i >= was.a ? 0 : area.value.length - was.v.length;
      area.scrollTop = was.top;
      if (on) try { area.setSelectionRange(Math.max(0, was.a + d), Math.max(0, was.b + d)); } catch { /* not a text field */ }
    };
    root.addEventListener?.('hearth:synced', (e) => { root.StoreAck.arrived(e.detail?.files || []).catch(() => {}); });
  }
}(typeof self !== 'undefined' ? self : this, () => {
  const relOf = (s) => (s instanceof RegExp ? s : /[/.]/.test(String(s)) ? String(s).replace(/\\/g, '/') : `kv/${s}.json`);
  const JSONISH = /\.json$/i;
  function create({ ack, now = () => Date.now(), log = () => {} } = {}) {
    const holders = new Set(); // { store, h, at }
    const chains = new Map(); // rel → the arrival being handled (one at a time per store)
    const holdersOf = (rel) => [...holders].filter((x) => (x.store instanceof RegExp ? x.store.test(rel) : x.store === rel));
    const pending = (h) => { try { return Boolean(h.saver ? h.saver.pending?.() : h.pending?.()); } catch { return false; } };
    const flush = (h) => (h.saver ? h.saver.flush?.() : h.flush?.());
    const holdsCopy = (h) => Boolean(h.read || h.drop);
    function hold(store, h = {}) {
      const x = { store: relOf(store), h };
      holders.add(x);
      return {
        off: () => holders.delete(x),
        // an arrival this holder put off (an edit was open on it): handled again now
        again: (rel = typeof x.store === 'string' ? x.store : null) => (rel ? arrived([{ rel }]) : Promise.resolve(null)),
        // a first read done after a pull: acked when every other holder of this store holds no copy
        fresh: (since = now(), rel = typeof x.store === 'string' ? x.store : null) => {
          if (!rel || holdersOf(rel).some((y) => y !== x && holdsCopy(y.h) && !y.h.empty?.())) return false;
          Promise.resolve(ack?.([rel], since)).catch(() => {});
          return true;
        },
      };
    }
    // one store: each holder's change written, then read again and applied (tried again when something was typed while
    // it was being read), then whether it can be acked
    async function run(rel, list, files) {
      let ok = true;
      // 1. every holder's change written (each merged with what arrived by sync's guard), before anyone reads
      const failed = new Set();
      for (const x of list) {
        try { if (pending(x.h)) await flush(x.h); } catch (err) { log('storeack: could not write', x.h.name || rel, err?.message || err); failed.add(x); ok = false; } // its change stays in memory: not read over
      }
      // 2. read again and put in place; something typed while it was being read is written and read again (with more
      // than one holder that write could leave another one older than the disk: then no ack, sync keeps merging)
      const since = now(); const late = new Set(); // holders that wrote after the reads began
      for (const x of list) {
        const { h } = x;
        if (failed.has(x)) continue;
        for (let i = 0; ; i++) {
          if (h.drop) {
            if (pending(h)) { try { await flush(h); late.add(x); } catch { ok = false; break; } if (i < 3) continue; ok = false; break; }
            try { h.drop(rel); } catch { ok = false; } break;
          }
          if (!h.read) { if (pending(h)) { try { await flush(h); late.add(x); } catch { ok = false; } } break; }
          let v; try { v = await h.read(rel, files); } catch (err) { log('storeack: could not read', h.name || rel, err?.message || err); ok = false; break; }
          if (pending(h)) { try { await flush(h); late.add(x); } catch { ok = false; break; } if (i < 3) continue; ok = false; break; } // typed meanwhile: written first, read again
          let r; try { r = h.apply?.(v, rel, files); } catch (err) { log('storeack: could not apply', h.name || rel, err?.message || err); r = false; }
          if (r === false) ok = false;
          break;
        }
      }
      if ([...late].some((w) => list.some((y) => y !== w && holdsCopy(y.h)))) ok = false;
      return { rel, ok, since };
    }
    async function arrived(files = []) {
      const list = (Array.isArray(files) ? files : []).filter((f) => f && typeof f.rel === 'string');
      const rels = [...new Set(list.map((f) => f.rel.replace(/\\/g, '/')))].filter((r) => JSONISH.test(r) && !/^chats\//.test(r));
      const unknown = []; const jobs = [];
      for (const rel of rels) {
        const hs = holdersOf(rel);
        if (!hs.length) { unknown.push(rel); continue; }
        const prev = chains.get(rel) || Promise.resolve();
        const job = prev.catch(() => {}).then(() => run(rel, hs, list));
        chains.set(rel, job);
        job.finally(() => { if (chains.get(rel) === job) chains.delete(rel); }).catch(() => {});
        jobs.push(job);
      }
      const done = await Promise.all(jobs);
      const good = done.filter((d) => d.ok);
      if (good.length) {
        const since = Math.min(...good.map((d) => d.since));
        try { await ack?.(good.map((d) => d.rel), Number.isFinite(since) ? since : now()); } catch { /* sync off */ }
      }
      return { acked: good.map((d) => d.rel), kept: done.filter((d) => !d.ok).map((d) => d.rel), unknown };
    }
    const held = () => [...holders].map((x) => ({ store: String(x.store), name: x.h.name || '', copy: holdsCopy(x.h) }));
    return { hold, arrived, held, holdersOf };
  }
  // what arrived put INTO the object in memory (same objects, same arrays): parts of a screen that hold a piece of the
  // store (a station's settings, a list) see the new values instead of an orphan copy. Arrays: element by element.
  const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  function into(target, src) {
    if (Array.isArray(target) && Array.isArray(src)) {
      for (let i = 0; i < src.length; i++) {
        if (i < target.length && ((plain(target[i]) && plain(src[i])) || (Array.isArray(target[i]) && Array.isArray(src[i])))) into(target[i], src[i]);
        else target[i] = src[i];
      }
      target.length = src.length;
      return target;
    }
    if (!plain(target) || !plain(src)) return src;
    for (const k of Object.keys(target)) if (!(k in src)) delete target[k];
    for (const [k, v] of Object.entries(src)) {
      const t = target[k];
      target[k] = (plain(t) && plain(v)) || (Array.isArray(t) && Array.isArray(v)) ? into(t, v) : v;
    }
    return target;
  }
  return { create, relOf, into };
}));
