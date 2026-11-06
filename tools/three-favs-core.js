// ★ Favourite controls, as data (round 138, favs138): no DOM, so it loads in Node too (dev/checks/favs138.js uses
// the browser copy). tools/three-favs.js is the panel. docs/upgrades/favs138.md.
//   A scene's pins (sketch.favs): { v: 1, list: [{ t: 's', layer, key } | { t: 'd', dial }] }, in the owner's order.
//   ✦ Suggest favourites (local, no AI): the sliders the time machine saw change most often (its versions, yours and
//   the directors'), and the dials over them.
const FavsCore = (() => {
  const MAX = 24;
  const idOf = (x) => (x?.t === 'd' ? `d:${x.dial}` : `s:${x?.layer}|${x?.key}`);
  const ok = (x) => x && ((x.t === 'd' && typeof x.dial === 'string' && x.dial) || (x.t === 's' && typeof x.layer === 'string' && x.layer && typeof x.key === 'string' && x.key));
  const pick = (x) => (x.t === 'd' ? { t: 'd', dial: x.dial } : { t: 's', layer: x.layer, key: x.key });
  function norm(d) {
    const seen = new Set(); const list = [];
    for (const x of Array.isArray(d?.list) ? d.list : []) {
      if (!ok(x)) continue;
      const id = idOf(x); if (seen.has(id)) continue;
      seen.add(id); list.push(pick(x));
      if (list.length >= MAX) break;
    }
    return { v: 1, list };
  }
  const clone = (d) => norm(JSON.parse(JSON.stringify(d || {})));
  const has = (d, x) => norm(d).list.some((y) => idOf(y) === idOf(x));
  function add(d, x) { const n = norm(d); if (!ok(x) || has(n, x) || n.list.length >= MAX) return n; n.list.push(pick(x)); return n; }
  function remove(d, id) { const n = norm(d); n.list = n.list.filter((y) => idOf(y) !== id); return n; }
  // move the pin at `from` to the place `to` (indices in the list as it is)
  function move(d, from, to) {
    const n = norm(d); const L = n.list;
    if (from < 0 || from >= L.length) return n;
    const [x] = L.splice(from, 1);
    L.splice(Math.max(0, Math.min(L.length, to)), 0, x);
    return n;
  }

  // ---------- ✦ Suggest favourites ----------
  // steps: [[{ layer, key }…] per version step] (what changed between one version and the next) → { 'layer|key': n }
  function counts(steps) {
    const out = {};
    for (const st of Array.isArray(steps) ? steps : []) {
      const once = new Set();
      for (const c of Array.isArray(st) ? st : []) { const k = `${c.layer}|${c.key}`; if (c.layer && c.key && !once.has(k)) { once.add(k); out[k] = (out[k] || 0) + 1; } }
    }
    return out;
  }
  // controls: [{ layer, layerName, key, label }] that exist now · dials: [{ id, name, maps: [{ layer, key }], keys }] ·
  // pinned: the scene's pins · → [{ t, layer?, key?, dial?, label, n, why }] best first (max sliders + ≤ 2 dials)
  function suggest({ counts: cn = {}, controls = [], dials = [], pinned = null, max = 5 } = {}) {
    const have = new Set(norm(pinned).list.map(idOf));
    const sl = controls.filter((c) => (cn[`${c.layer}|${c.key}`] || 0) > 0 && !have.has(idOf({ t: 's', layer: c.layer, key: c.key })))
      .map((c) => ({ t: 's', layer: c.layer, key: c.key, label: c.label || c.key, layerName: c.layerName || '', n: cn[`${c.layer}|${c.key}`] }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    const dl = dials.filter((dd) => !have.has(idOf({ t: 'd', dial: dd.id })))
      .map((dd) => ({ t: 'd', dial: dd.id, label: dd.name, layerName: '🎛 Dial', n: (dd.maps || []).reduce((s, m) => s + (cn[`${m.layer}|${m.key}`] || 0), 0) + ((dd.keys || []).length ? 1 : 0) }))
      .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
    const out = [...sl.slice(0, Math.max(1, max - dl.length)), ...dl].sort((a, b) => b.n - a.n).slice(0, max);
    for (const x of out) x.why = x.t === 'd' ? `its sliders changed ${x.n} time${x.n === 1 ? '' : 's'}` : `changed in ${x.n} version${x.n === 1 ? '' : 's'}`;
    return out;
  }

  return { MAX, idOf, norm, clone, has, add, remove, move, counts, suggest };
})();
if (typeof module !== 'undefined') module.exports = FavsCore;
