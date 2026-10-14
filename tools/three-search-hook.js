// 🔎 Lab search (round 36, labsearch): what loads with the Lab. The search itself (three-search*.js, lazy group
// "labsearch") loads the first time it opens; this small part gives it its ways in:
//   · / in the Lab (tools/three.js: the Lab's keys; in the sliders column / still finds a slider there)
//   · a small 🔎 in the Lab toolbar, next to ⋯ (button(), placed by tools/three.js)
//   · Ctrl/⌘+K "Lab: Search the Lab" and /lab-search [words] (registered by the lazy part, stand-ins until then)
// Ctrl/⌘+F stays "Find in the current view" (app-wide, keys sheet): it wasn't free, so the Lab doesn't take it.
const LabSearchHook = (() => {
  let btnEl = null;
  async function open(opts = {}) {
    try {
      if (typeof LabSearch === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labsearch');
      if (typeof LabSearch === 'undefined') throw new Error('Lab search did not load');
      return LabSearch.open({ from: btnEl, ...opts });
    } catch (err) { toast(err.message, { type: 'error', timeout: 5000 }); return null; }
  }
  function button() {
    btnEl = el('button', { class: 'ghost small ls-btn', text: '🔎', title: 'Search the Lab: actions, effects, layers, sliders, templates, starting points, help ( / )', dataset: { feature: 'Lab search', key: '/' }, on: { click: () => open() } });
    return btnEl;
  }
  const inLab = () => H.surfaceIdFor?.(H.activeId) === 'tool:three';
  if (typeof Keys !== 'undefined') Keys.add({ area: 'Lab', keys: '/', what: 'Search the Lab: actions, effects, layers, sliders, templates…', when: inLab, run: () => open(), sel: '.ls-btn' });
  return { open, button };
})();
