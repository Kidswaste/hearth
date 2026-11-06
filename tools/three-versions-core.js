// Scene versions, as data (round 132, versions132): no DOM, no Lab, so it loads in Node too. tools/three-versions.js
// shows them; the versions themselves are the time machine's (tools/three-history-core.js, kv three-tm-<scene>):
//   · named: a version with v.name (🕘 Scene versions › Save a version…), never thinned
//   · automatic: v.auto = { why: 'draft' | 'take', label, by } (before a first draft, a take kept), thinned like a
//     director bookmark (kept a week, then the last of each day)
//   · before an AI reply that changed things: the time machine's director-turn bookmark (v.mark) when edits by that AI
//     followed it (the same rule as ThreeHistory.turns)
// The Trash (kv three-versions-trash): a deleted version's full state, kept 30 days (at most 40), and put back from there.
const SceneVersCore = (() => {
  const WHO = { you: 'you', claude: 'Claude', codex: 'Astra', crew: 'a crew helper' };
  const whoName = (by) => WHO[by] || String(by || 'you');
  const cap = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

  // the versions worth listing, newest first: [{ id, name, at, by, kind: 'named' | 'auto' | 'ai', why? }]
  // list: the time machine's versions, oldest first (TMCore.byTime)
  function entries(list) {
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const v = list[i];
      if (v.name) { out.push({ id: v.id, name: v.name, at: v.at, by: 'you', kind: 'named' }); continue; }
      if (v.auto) { out.push({ id: v.id, name: v.auto.label || 'Saved', at: v.at, by: v.auto.by || v.by || 'you', kind: 'auto', why: v.auto.why || 'auto' }); continue; }
      if (v.mark) {
        let edits = 0;
        for (let j = i + 1; j < list.length; j += 1) { if (list[j].by === v.mark.by) edits += 1; if (list[j].mark) break; }
        if (edits) out.push({ id: v.id, name: `Before ${whoName(v.mark.by)}'s reply${v.mark.text ? `: “${cap(v.mark.text, 48)}”` : ''}`, at: v.mark.at || v.at, by: v.mark.by, kind: 'ai', why: 'ai' });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }

  // ---------- one line of what differs: "3 sliders changed, 1 layer added (Glow ring), keyframes on Drop" ----------
  // a, b: time machine states ({ layers, vals, palette }); tools: { scan, applyValues } (ThreeTweaks) for the sliders
  const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  function sliderVals(L, vals, scan) {
    const out = {};
    let sc = null; try { sc = scan ? scan(String(L?.code || '')) : null; } catch { sc = null; }
    for (const it of sc?.items || []) if (it.key != null) out[it.key] = it.orig;
    return Object.assign(out, vals || {});
  }
  // the code differs beyond its tweak() values
  function codeEdited(a, b, { scan, applyValues } = {}) {
    if ((a ?? '') === (b ?? '')) return false;
    try { const A = scan(a).items; const B = scan(b).items; if (A.length === B.length && applyValues(a, A, B.map((it) => it.orig)) === b) return false; } catch { /* no sliders to tell */ }
    return true;
  }
  const PROPS = ['visible', 'opacity', 'blend', 'in', 'out', 'fadeIn', 'fadeOut', 'x', 'y', 'scale', 'rotate', 'mask', 'overrides', 'camMoves'];
  function diff(a, b, tools = {}) {
    const d = { sliders: 0, added: [], removed: [], code: [], keys: [], props: [], palette: false, order: false };
    if (!a || !b) return d;
    const A = new Map(a.layers.map((L) => [L.id, L]));
    const B = new Map(b.layers.map((L) => [L.id, L]));
    for (const L of b.layers) if (!A.has(L.id)) d.added.push(L.name || 'a layer');
    for (const L of a.layers) if (!B.has(L.id)) d.removed.push(L.name || 'a layer');
    for (const L of b.layers) {
      const P = A.get(L.id);
      if (!P) continue;
      const va = sliderVals(P, a.vals?.[L.id], tools.scan); const vb = sliderVals(L, b.vals?.[L.id], tools.scan);
      for (const k of new Set([...Object.keys(va), ...Object.keys(vb)])) if (k in va && k in vb && !same(va[k], vb[k])) d.sliders += 1;
      if (tools.scan && tools.applyValues ? codeEdited(P.code, L.code, tools) : (P.code ?? '') !== (L.code ?? '')) d.code.push(L.name);
      if (!same(P.keys || null, L.keys || null)) d.keys.push(L.name);
      if (PROPS.some((k) => !same(P[k], L[k])) || (P.name !== L.name)) d.props.push(L.name);
    }
    const common = (x, y) => x.layers.map((L) => L.id).filter((id) => y.layers.some((M) => M.id === id)).join();
    d.order = common(a, b) !== common(b, a);
    d.palette = !same(a.palette || null, b.palette || null);
    return d;
  }
  const names = (l, n = 2) => (l.length > n ? `${l.slice(0, n).join(', ')} +${l.length - n}` : l.join(', '));
  function line(d, { max = 4 } = {}) {
    const parts = [];
    if (d.sliders) parts.push(`${d.sliders} slider${d.sliders === 1 ? '' : 's'} changed`);
    if (d.added.length) parts.push(`${d.added.length} layer${d.added.length === 1 ? '' : 's'} added (${names(d.added)})`);
    if (d.removed.length) parts.push(`${d.removed.length} layer${d.removed.length === 1 ? '' : 's'} removed (${names(d.removed)})`);
    if (d.keys.length) parts.push(`keyframes on ${names(d.keys)}`);
    if (d.code.length) parts.push(`code edited on ${names(d.code)}`);
    if (d.props.length) parts.push(`layer settings on ${names(d.props)}`);
    if (d.palette) parts.push('new palette');
    if (d.order) parts.push('layer order');
    if (!parts.length) return 'the same scene';
    return parts.length > max ? `${parts.slice(0, max).join(', ')}, +${parts.length - max} more` : parts.join(', ');
  }
  const summary = (a, b, tools) => line(diff(a, b, tools));

  // ---------- the Trash ----------
  const KEEP_MS = 30 * 864e5; const KEEP_N = 40;
  function trashAdd(trash, item, now = Date.now()) {
    const list = (Array.isArray(trash?.items) ? trash.items : []).filter((x) => x && x.deletedAt >= now - KEEP_MS && x.id !== item.id);
    list.unshift({ ...item, deletedAt: now });
    return { v: 1, items: list.slice(0, KEEP_N) };
  }
  function trashTake(trash, id) {
    const items = Array.isArray(trash?.items) ? trash.items : [];
    const it = items.find((x) => x.id === id) || null;
    return { item: it, trash: { v: 1, items: items.filter((x) => x !== it) } };
  }
  const trashOf = (trash, sceneId, now = Date.now()) => (Array.isArray(trash?.items) ? trash.items : []).filter((x) => x.sceneId === sceneId && x.deletedAt >= now - KEEP_MS);

  return { entries, diff, line, summary, whoName, cap, trashAdd, trashTake, trashOf, KEEP_MS, KEEP_N, MAX_COMPARE: 4 };
})();
if (typeof module !== 'undefined') module.exports = SceneVersCore;
