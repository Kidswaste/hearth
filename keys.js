// The shortcut registry behind the keys button (bottom left): every feature that hides a control behind Alt / Ctrl,
// a key or a right-click registers a line here, so the owner can look them up instead of memorising them.
//   Keys.add({ area: 'Board', keys: 'Alt+drag', what: 'duplicate an item' })   (area groups the list; `when` is an
//   optional () => bool that keeps a line to the tool where it applies; `run` an optional () => void the keys sheet
//   calls when the line is clicked; `sel` an optional CSS selector of the control it acts on, which the sheet
//   points at when there's nothing to run)
// (round 160, boot160) slot() / fill(slot, fn): a quiet place in the list where a lazy group's stand-in lines used to be
// added (lazy.js reads them right after the first frame); the lines fn adds go there, as if added then. A line added
// later with the same keys only got in because the slot's line wasn't there yet: it gives way (the first of two stays).
const Keys = (() => {
  const list = [];
  const seen = new Map(); // id → its line
  let into = null; // the slot being filled
  function add(...entries) {
    let last = null;
    for (const e of entries.flat()) {
      const id = `${e.area}|${e.keys}`;
      if (!e.keys || !e.what) continue;
      const at = into ? list.indexOf(into) : -1;
      const had = seen.get(id);
      if (had) { const i = list.indexOf(had); if (at < 0 || i < at) continue; list.splice(i, 1); }
      last = { area: e.area || 'General', keys: e.keys, what: e.what, when: e.when || null, run: e.run || null, sel: e.sel || null };
      seen.set(id, last);
      if (at < 0) list.push(last); else list.splice(list.indexOf(into), 0, last);
    }
    return last;
  }
  function slot() { const s = { slot: true }; list.push(s); return s; }
  function fill(s, fn) {
    const was = into;
    into = s;
    try { fn(); } finally { into = was; const i = list.indexOf(s); if (i >= 0) list.splice(i, 1); }
  }
  // the lines added before a slot (lazy.js: which keys a stand-in finds taken there)
  const before = (s) => { const i = list.indexOf(s); return (i < 0 ? list : list.slice(0, i)).filter((e) => !e.slot); };
  // The lines that apply now (all when `all`), grouped by area in the order areas were first added.
  function groups(all = false) {
    const out = new Map();
    for (const e of list) {
      if (e.slot) continue;
      if (!all && e.when) { try { if (!e.when()) continue; } catch { continue; } }
      if (!out.has(e.area)) out.set(e.area, []);
      out.get(e.area).push(e);
    }
    return out;
  }
  return { add, groups, all: () => list.filter((e) => !e.slot), slot, fill, before };
})();
