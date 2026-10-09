// The shortcut registry behind the keys button (bottom left): every feature that hides a control behind Alt / Ctrl,
// a key or a right-click registers a line here, so the owner can look them up instead of memorising them.
//   Keys.add({ area: 'Board', keys: 'Alt+drag', what: 'duplicate an item' })   (area groups the list; `when` is an
//   optional () => bool that keeps a line to the tool where it applies; `run` an optional () => void the keys sheet
//   calls when the line is clicked; `sel` an optional CSS selector of the control it acts on, which the sheet
//   points at when there's nothing to run)
const Keys = (() => {
  const list = [];
  const seen = new Set();
  function add(...entries) {
    for (const e of entries.flat()) {
      const id = `${e.area}|${e.keys}`;
      if (!e.keys || !e.what || seen.has(id)) continue;
      seen.add(id);
      list.push({ area: e.area || 'General', keys: e.keys, what: e.what, when: e.when || null, run: e.run || null, sel: e.sel || null });
    }
  }
  // The lines that apply now (all when `all`), grouped by area in the order areas were first added.
  function groups(all = false) {
    const out = new Map();
    for (const e of list) {
      if (!all && e.when) { try { if (!e.when()) continue; } catch { continue; } }
      if (!out.has(e.area)) out.set(e.area, []);
      out.get(e.area).push(e);
    }
    return out;
  }
  return { add, groups, all: () => list.slice() };
})();
