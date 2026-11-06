// What an AI reply changed in a Lab scene, as data (round 137, replydiff137): no DOM, no Lab, so it loads in Node too.
// tools/three-replydiff.js shows it under the reply ("Changed 3 layers · Review"). The states are LabTxn's snapshots
// (tools/three-txn.js snap: { layers, vals, links, refs, timeline, palette, map, selId }) from before and after the reply.
//   rows(before, after, tools)        → one row per changed layer in plain words, plus the scene-wide part (palette, cues…)
//   revertLayer(cur, before, after, id) → the scene as it is now with just that layer's change taken back
//   revertSliders(cur, before, after, picks, tools) → with just those sliders back (Keep some)
//   revertAll(cur, before, after, tools) → every change of the reply taken back, later changes elsewhere kept
//   lineDiff(a, b)                    → the code change, line by line
// tools: { scan, applyValues, labelOf } (ThreeTweaks) to tell slider values from code edits and name the sliders.
const ReplyDiffCore = (() => {
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  const clip = (t, n) => { const s = String(t ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const fmt = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v == null ? 'none' : typeof v === 'boolean' ? (v ? 'on' : 'off') : clip(typeof v === 'string' ? v : JSON.stringify(v), 24));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---------- the code change, line by line ----------
  // [{ t: '=' | '-' | '+', s }] with the common start / end trimmed to 3 lines of context; big changes: all out, all in
  function lineDiff(a, b, { context = 3, max = 4e6 } = {}) {
    const A = String(a ?? '').split('\n'); const B = String(b ?? '').split('\n');
    let p = 0; while (p < A.length && p < B.length && A[p] === B[p]) p += 1;
    let q = 0; while (q < A.length - p && q < B.length - p && A[A.length - 1 - q] === B[B.length - 1 - q]) q += 1;
    const a2 = A.slice(p, A.length - q); const b2 = B.slice(p, B.length - q);
    const mid = [];
    if (a2.length * b2.length <= max) {
      const n = a2.length; const m = b2.length;
      const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      let i = 0; let j = 0;
      while (i < n && j < m) {
        if (a2[i] === b2[j]) { mid.push({ t: '=', s: a2[i] }); i += 1; j += 1; } else if (L[i + 1][j] >= L[i][j + 1]) { mid.push({ t: '-', s: a2[i] }); i += 1; } else { mid.push({ t: '+', s: b2[j] }); j += 1; }
      }
      while (i < n) { mid.push({ t: '-', s: a2[i] }); i += 1; }
      while (j < m) { mid.push({ t: '+', s: b2[j] }); j += 1; }
    } else { for (const s of a2) mid.push({ t: '-', s }); for (const s of b2) mid.push({ t: '+', s }); }
    const head = A.slice(Math.max(0, p - context), p).map((s) => ({ t: '=', s }));
    const tail = A.slice(A.length - q, Math.min(A.length, A.length - q + context)).map((s) => ({ t: '=', s }));
    const lines = [...(p > context ? [{ t: '…', s: `${p - context} lines the same` }] : []), ...head, ...mid, ...tail, ...(q > context ? [{ t: '…', s: `${q - context} lines the same` }] : [])];
    return { lines, added: mid.filter((x) => x.t === '+').length, removed: mid.filter((x) => x.t === '-').length };
  }

  // ---------- one row per changed layer ----------
  function onlySliders(a, b, tools) {
    if ((a ?? '') === (b ?? '')) return true;
    try { const A = tools.scan(a).items; const B = tools.scan(b).items; return A.length === B.length && tools.applyValues(a, A, B.map((it) => it.orig)) === b; } catch { return false; }
  }
  function labels(code, tools) {
    const out = {};
    try { for (const it of tools.scan(String(code ?? '')).items) if (it.key != null) out[it.key] = tools.labelOf ? tools.labelOf(it) : it.label || it.key; } catch { /* no names */ }
    return out;
  }
  const PROPS = ['visible', 'opacity', 'blend', 'in', 'out', 'fadeIn', 'fadeOut', 'x', 'y', 'scale', 'rotate'];
  const KNOWN = new Set(['id', 'name', 'code', 'keys', 'overrides', 'camMoves', 'lanes', 'lane', ...PROPS]);
  // a cue the new keyframes sit on ("on Drop")
  function cueAt(keys, map) {
    const cues = map?.cues || [];
    for (const k of keys || []) { const c = cues.find((x) => Math.abs(x.t - (k.t ?? -99)) < 0.06); if (c) return c.name; }
    return null;
  }
  function layerRow(B, A, before, after, tools) {
    const id = (A || B).id; const name = (A || B).name || 'a layer';
    if (!B) return { id, name, kind: 'added', words: `New layer: ${name}`, sliders: [], code: null, other: true };
    if (!A) return { id, name, kind: 'removed', words: `Removed layer: ${name}`, sliders: [], code: null, other: true };
    const bits = []; let other = false;
    if (B.name !== A.name) { bits.push(`renamed from “${B.name}”`); other = true; }
    // sliders: the values as the scene had them (live or written into the code)
    const bv = before.vals?.[id] || {}; const av = after.vals?.[id] || {};
    const names = labels(A.code, tools);
    const sliders = Object.keys(av).filter((k) => k in bv && !same(bv[k], av[k])).map((k) => ({ key: k, label: names[k] || k, from: bv[k], to: av[k] }));
    for (const s of sliders.slice(0, 6)) bits.push(`${String(s.label).toLowerCase()} ${fmt(s.from)} → ${fmt(s.to)}`);
    if (sliders.length > 6) bits.push(`${plural(sliders.length - 6, 'more slider')}`);
    let code = null;
    if (!onlySliders(B.code, A.code, tools)) { code = lineDiff(B.code, A.code); other = true; bits.push(`code: ${plural(code.added + code.removed, 'line')} changed`); }
    for (const k of PROPS) if (!same(B[k], A[k])) { bits.push(`${k} ${fmt(B[k])} → ${fmt(A[k])}`); other = true; }
    for (const p of new Set([...Object.keys(B.keys || {}), ...Object.keys(A.keys || {})])) {
      const x = B.keys?.[p] || []; const y = A.keys?.[p] || [];
      if (same(x, y)) continue;
      other = true;
      const nm = p.replace(/^s:/, '');
      if (!x.length) { const cue = cueAt(y, after.map); bits.push(cue ? `new keyframes on ${cue} (${nm})` : `new keyframes on ${nm}`); } else bits.push(y.length ? `keyframes on ${nm} changed` : `keyframes on ${nm} removed`);
    }
    if (!same(B.overrides, A.overrides)) { bits.push('material / look changed'); other = true; }
    if (!same(B.camMoves || [], A.camMoves || [])) { bits.push(`camera moves (${(A.camMoves || []).length})`); other = true; }
    if (!same(B.lanes || B.lane || null, A.lanes || A.lane || null)) { bits.push('timeline lanes'); other = true; }
    if (Object.keys({ ...B, ...A }).some((k) => !KNOWN.has(k) && !same(B[k], A[k]))) { bits.push('layer settings'); other = true; }
    if (!same(before.links?.[id] || null, after.links?.[id] || null)) { bits.push('follows the music differently'); other = true; }
    if (!bits.length) return null;
    return { id, name, kind: 'changed', words: `${name}: ${bits.join(', ')}`, sliders, code, other };
  }
  // the reply's changes: { rows, scene: { words } | null, slidersOnly, layers }
  function rows(before, after, tools = {}) {
    if (!before || !after) return { rows: [], scene: null, slidersOnly: false, layers: 0 };
    const bl = new Map(before.layers.map((L) => [L.id, L]));
    const al = new Map(after.layers.map((L) => [L.id, L]));
    const out = [];
    for (const L of after.layers) { const r = layerRow(bl.get(L.id) || null, L, before, after, tools); if (r) out.push(r); }
    for (const L of before.layers) if (!al.has(L.id)) out.push(layerRow(L, null, before, after, tools));
    const sw = [];
    if (!same(before.palette, after.palette)) sw.push(`palette ${(after.palette || []).join(' ') || 'cleared'}`);
    if ((before.timeline?.len ?? null) !== (after.timeline?.len ?? null)) sw.push(after.timeline ? `scene timeline ${after.timeline.len} s` : 'scene timeline removed');
    if (before.map && after.map && !same(before.map, after.map)) {
      const key = (c) => `${c.t}|${c.name}`;
      const cb = new Set(before.map.cues.map(key)); const ca = new Set(after.map.cues.map(key));
      const add = after.map.cues.filter((c) => !cb.has(key(c))); const gone = before.map.cues.filter((c) => !ca.has(key(c)));
      if (add.length) sw.push(`${plural(add.length, 'new cue')} (${add.slice(0, 3).map((c) => c.name).join(', ')})`);
      if (gone.length) sw.push(`${plural(gone.length, 'cue')} removed`);
      if (!add.length && !gone.length) sw.push('timeline markers');
    }
    const refs = (after.refs || []).filter((r) => !(before.refs || []).some((x) => x.id === r.id));
    if (refs.length) sw.push(`${plural(refs.length, 'reference')} added`);
    const order = (s, o) => s.layers.map((L) => L.id).filter((id) => o.layers.some((M) => M.id === id)).join();
    if (order(before, after) !== order(after, before)) sw.push('layer order');
    const scene = sw.length ? { words: `Scene: ${sw.join(', ')}`, undoable: sw.length > (refs.length ? 1 : 0) } : null;
    const slidersOnly = out.length > 0 && !scene && out.every((r) => r.kind === 'changed' && r.sliders.length && !r.other);
    return { rows: out, scene, slidersOnly, layers: out.length };
  }
  const title = (d) => (d.layers ? `Changed ${plural(d.layers, 'layer')}` : 'Changed the scene');

  // ---------- taking changes back ----------
  function revertLayer(cur, before, after, id) {
    const out = clone(cur);
    out.vals ||= {};
    const B = before.layers.find((L) => L.id === id);
    const i = out.layers.findIndex((L) => L.id === id);
    if (!B) { // new in the reply: it goes
      if (i >= 0) out.layers.splice(i, 1);
      delete out.vals[id]; if (out.links) delete out.links[id];
    } else {
      const L = clone(B);
      if (i >= 0) out.layers[i] = L;
      else { // removed by the reply: back after the layer it followed
        const bi = before.layers.findIndex((x) => x.id === id);
        let at = 0;
        for (let j = bi - 1; j >= 0; j -= 1) { const k = out.layers.findIndex((x) => x.id === before.layers[j].id); if (k >= 0) { at = k + 1; break; } }
        out.layers.splice(at, 0, L);
      }
      out.vals[id] = clone(before.vals?.[id] || {});
      if (out.links) { if (before.links?.[id]) out.links[id] = clone(before.links[id]); else delete out.links[id]; }
    }
    if (out.selId && !out.layers.some((L) => L.id === out.selId)) out.selId = out.layers[0]?.id || null;
    return out;
  }
  function revertScene(cur, before) {
    const out = clone(cur);
    out.palette = clone(before.palette ?? null);
    out.timeline = clone(before.timeline ?? null);
    if (before.map && out.map) out.map = clone(before.map);
    // the order of the layers both have, as it was
    const was = before.layers.map((L) => L.id).filter((id) => out.layers.some((L) => L.id === id));
    const slots = out.layers.map((L, i) => (was.includes(L.id) ? i : -1)).filter((i) => i >= 0);
    const moved = was.map((id) => out.layers.find((L) => L.id === id));
    slots.forEach((s, k) => { out.layers[s] = moved[k]; });
    return out;
  }
  // picks: [{ id, key }] the sliders to put back (the rest of the reply stays)
  function revertSliders(cur, before, after, picks, tools = {}) {
    const out = clone(cur);
    out.vals ||= {};
    for (const { id, key } of picks) {
      const L = out.layers.find((x) => x.id === id); const B = before.layers.find((x) => x.id === id);
      if (!L || !B || !(key in (before.vals?.[id] || {}))) continue;
      const was = before.vals[id][key];
      (out.vals[id] ||= {})[key] = clone(was);
      // a value the reply wrote into the code goes back there too
      try {
        const items = tools.scan(L.code).items; const bi = tools.scan(B.code).items.find((it) => it.key === key);
        const it = items.find((x) => x.key === key);
        if (it && bi && JSON.stringify(it.orig) !== JSON.stringify(bi.orig)) L.code = tools.applyValues(L.code, items, items.map((x) => (x.key === key ? bi.orig : x.orig)));
      } catch { /* the live value is enough */ }
    }
    return out;
  }
  function revertAll(cur, before, after, tools = {}) {
    const d = rows(before, after, tools);
    let out = cur;
    for (const r of d.rows) out = revertLayer(out, before, after, r.id);
    if (d.scene) out = revertScene(out, before);
    return out;
  }

  return { rows, title, lineDiff, revertLayer, revertScene, revertSliders, revertAll, fmt };
})();
if (typeof module !== 'undefined') module.exports = ReplyDiffCore;
