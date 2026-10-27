// ▮ The frame budget bar's arithmetic (round 64, framebar64): plain functions, no DOM, no page (dev/framebar-test.js).
// The Lab's stats line shows a thin bar: does the scene fit one frame of the target refresh (240 Hz = 4.17 ms) on this
// computer? Hover: each layer's share; "why?": a 3-second look at one layer and plain suggestions (tools/framebar.js
// is the UI; tools/three-sandbox.html "frame budget bar" measures).
//   target(pref, screenHz)            → { hz, ms, auto }   the refresh the bar measures against ('auto' = the screen's)
//   frame(msg, target)                → { ms, cpu, gap, fill, level, gpu, still }  one stats message → the bar
//   rows(fb, nameOf)                  → layers by cost: { id, name, code, draw, total, calls, tris, tex, texMB, progs }
//   blend(prev, next, k)              → rows smoothed between two reads (the card doesn't jitter)
//   top(rows) / sentence(row)         → "The most expensive layer is Game (1.9 ms)."
//   costs(result, ctx)                → the "why?" look's top costs, plain lines
//   suggest(result, ctx)              → [{ id, title, fix, draft }] what would help most first (each can be drafted
//                                        for the Three Director, never sent)
const FrameBarCore = (() => {
  const RATES = [60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 280, 300, 360];
  const PREFS = ['auto', 240, 144, 60];
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const ms1 = (x) => { const v = num(x); return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2); };
  const big = (n) => { n = Math.round(num(n)); return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : String(n); };
  const plural = (n, a, b = `${a}s`) => `${n} ${n === 1 ? a : b}`;
  // the usual screen rate nearest a measured one (a 239.6 Hz estimate is a 240 Hz screen)
  function stdHz(hz) { hz = num(hz); if (hz < 30) return 60; let best = 60; let bd = Infinity; for (const r of RATES) { const d = Math.abs(r - hz); if (d < bd) { bd = d; best = r; } } return best; }
  function target(pref, screenHz) {
    const p = pref === 'auto' || pref == null || pref === '' ? 'auto' : num(pref);
    const hz = p === 'auto' ? stdHz(screenHz || 60) : Math.max(30, Math.min(500, p || 60));
    return { hz, ms: 1000 / hz, auto: p === 'auto' };
  }
  // what one frame costs, from what the stats already carry: the CPU work of the frame's renders (median of the last
  // 60: p50, else the last one), and the gap between shown frames (the pace meter's median) when frames come later than
  // the screen's own frame (that lateness is the GPU or the CPU outside the renders); a still picture (nothing drawn)
  // reads its last work only; a capped preview's gaps are the cap's, not the scene's
  function frame(msg, tgt) {
    const m = msg || {}; const t = tgt || target('auto', m.hz);
    const cpu = num(m.p50) || num(m.ms);
    const screenMs = 1000 / stdHz(m.hz || t.hz);
    const pace = m.pace || {};
    const still = Boolean(pace.still);
    const capMs = num(m.cap) ? 1000 / num(m.cap) : 0;
    const med = num(pace.med);
    const gapOk = !still && med > 0 && pace.fps > 0 && !(capMs && med <= capMs * 1.15);
    const gap = gapOk && med > screenMs * 1.2 ? med : 0;
    const ms = Math.max(cpu, gap);
    const fill = t.ms > 0 ? ms / t.ms : 0;
    const level = fill <= 1 ? 'ok' : fill <= 1.5 ? 'amber' : 'red';
    return { ms: Math.round(ms * 100) / 100, cpu: Math.round(cpu * 100) / 100, gap: Math.round(gap * 100) / 100, fill: Math.round(fill * 1000) / 1000, level, gpu: gap > cpu * 1.2 && gap > 0, still, budget: Math.round(t.ms * 100) / 100, hz: t.hz };
  }
  // the bar's picture: the budget sits at 2/3 of its width, so 1.5× the budget fills it (over-budget shows)
  const barScale = (fill) => Math.max(0, Math.min(1, num(fill) / 1.5));
  // fb (the page's per-layer numbers, per shown frame): rows [id, frame ms, draws inside it ms, draws outside it ms,
  // calls, triangles, textures, texture MB, shader programs]. A layer's own code = its frame callback minus the
  // draws inside it; its total = its frame callback plus draws made outside it (a draw from a timer or another loop)
  function rows(fb, nameOf) {
    const list = (fb?.rows || []).map((r) => {
      const [id, cb, rIn, rOut, calls, tris, tex, texMB, progs] = r;
      const code = Math.max(0, num(cb) - num(rIn));
      const draw = num(rIn) + num(rOut);
      return { id, name: (nameOf && nameOf(id)) || id, code: rd(code), draw: rd(draw), total: rd(code + draw), calls: Math.round(num(calls)), tris: Math.round(num(tris)), tex: num(tex), texMB: num(texMB), progs: num(progs) };
    });
    return list.sort((a, b) => b.total - a.total);
  }
  const rd = (x) => Math.round(num(x) * 1000) / 1000;
  function blend(prev, next, k = 0.5) {
    const was = new Map((prev || []).map((r) => [r.id, r]));
    const out = (next || []).map((r) => { const p = was.get(r.id); if (!p) return r; const m = (a, b) => rd(a * (1 - k) + b * k); return { ...r, code: m(p.code, r.code), draw: m(p.draw, r.draw), total: m(p.total, r.total), calls: Math.round(m(p.calls, r.calls)), tris: Math.round(m(p.tris, r.tris)) }; });
    return out.sort((a, b) => b.total - a.total);
  }
  const top = (list) => (list && list.length && list[0].total > 0 ? list[0] : null);
  const sentence = (row) => (row ? `The most expensive layer is ${row.name} (${ms1(row.total)} ms).` : 'No layer costs anything measurable right now.');
  // ---------- "why?" ----------
  const matLabel = (m) => `${m.name ? `“${m.name}”` : m.type.replace(/^Mesh|Material$/g, '') || m.type}${m.mats > 1 ? ` ×${m.mats} materials` : ''}`;
  function costs(res, ctx = {}) {
    if (!res || !res.ok) return [];
    const s = res.scan || {}; const out = [];
    const b = num(ctx.budgetMs) || 1000 / 240;
    out.push({ id: 'time', text: `Its own code ${ms1(res.ms?.frame - res.ms?.drawIn)} ms · drawing ${ms1(num(res.ms?.drawIn) + num(res.ms?.drawOut))} ms a frame (of ${ms1(b)} ms)` });
    const mats = (s.materials || []).slice(0, 4).map((m) => `${matLabel(m)} ${m.calls}`).join(' · ');
    out.push({ id: 'calls', text: `Draw calls: ${big(res.calls || 0)} a frame${mats ? ` · by material: ${mats}` : ''}` });
    if (s.shadowLights?.length || s.casters) {
      const maps = (s.shadowLights || []).map((l) => `${l.size}²${l.passes > 1 ? ` ×${l.passes}` : ''}`).join(', ');
      out.push({ id: 'shadows', text: `Shadow casters: ${s.casters || 0}${maps ? ` · shadow maps ${maps}` : ''} · ≈ ${big(s.shadowCalls || 0)} extra draw calls a frame for the shadows` });
    }
    if (s.transparent) out.push({ id: 'overdraw', text: `Transparent overdraw: ≈ ${num(s.overdraw).toFixed(1)}× the screen (${plural(s.transparent, 'see-through thing')})` });
    const post = res.post || {}; const f = post.filters || [];
    if (post.offscreen || f.length) out.push({ id: 'post', text: `Post-processing: ${plural(Math.round(num(post.offscreen) * 10) / 10, 'offscreen pass', 'offscreen passes')} a frame${f.length ? ` · filters over it: ${f.map((x) => `${x.type} ${ms1(x.ms)} ms`).join(', ')}` : ''}` });
    if (s.lights) out.push({ id: 'lights', text: `Lights: ${s.lights}${s.ambient ? ` (+ ${s.ambient} ambient)` : ''}` });
    out.push({ id: 'tris', text: `Triangles: ${big(res.tris || s.tris || 0)} a frame · ${plural(s.objs || 0, 'thing')} drawn` });
    if (s.textures?.n) out.push({ id: 'tex', text: `Textures: ${s.textures.n} · ≈ ${num(s.textures.mb).toFixed(0)} MB${s.textures.top?.[0]?.w ? ` (biggest ${s.textures.top[0].w}×${s.textures.top[0].h})` : ''}` });
    return out;
  }
  // what would help most, first (each with the words for the director). Weights are rough ms a frame each saves.
  function suggest(res, ctx = {}) {
    if (!res || !res.ok) return [];
    const s = res.scan || {}; const L = ctx.layer || 'this layer'; const b = num(ctx.budgetMs) || 1000 / 240; const hz = ctx.hz || Math.round(1000 / b);
    const drawMs = num(res.ms?.drawIn) + num(res.ms?.drawOut); const codeMs = Math.max(0, num(res.ms?.frame) - num(res.ms?.drawIn));
    const calls = Math.max(1, num(res.calls)); const perCall = drawMs / calls;
    const out = [];
    const add = (id, weight, title, fix, ask) => out.push({ id, weight, title, fix, draft: `In the Lab layer “${L}” (it takes ${ms1(codeMs + drawMs)} ms of a ${ms1(b)} ms frame at ${hz} Hz): ${ask} Keep how it looks the same.` });
    const rep = (s.repeats || [])[0];
    if (rep && rep.n >= 12) add('instance', rep.n * perCall, `${rep.n} copies of the same thing, one draw call each`, `Draw them as one InstancedMesh: ${rep.n} draw calls become 1.`, `the ${rep.n} meshes sharing the “${rep.mat}” material and the same ${rep.geo} are drawn one by one; draw them as one THREE.InstancedMesh (set each one's matrix) so they take 1 draw call.`);
    // (round 74, labdraw74) a big instanced crowd of detailed copies: the Lab already draws only the copies a view can
    // see; the rest is vertices. A simpler shape for the far copies (a second InstancedMesh, LOD by distance) halves them
    const crowd = (s.materials || []).filter((m) => m.inst >= 1000 && m.tris / m.inst >= 100).sort((a, c) => c.tris - a.tris)[0];
    if (crowd) { const per = Math.round(crowd.tris / crowd.inst); add('crowdlod', drawMs * 0.35 * Math.min(1, crowd.tris / Math.max(1, num(res.tris || s.tris))), `A crowd of ${big(crowd.inst)} copies × ${per} triangles`, `Fewer segments on the copied shape, or a simpler shape for far copies (a second InstancedMesh: level of detail by distance).`, `the instanced crowd drawn with ${matLabel(crowd)} has ${big(crowd.inst)} copies of a ${per}-triangle shape (its vertices run again in every shadow pass); give the shape fewer segments, or split it into two InstancedMeshes — the detailed shape near the camera, a simpler one (about a quarter of the triangles) for far copies — and turn castShadow off on the far ones.`); }
    const kind = (s.kinds || [])[0];
    if (kind && kind.n >= 12) add('share', kind.n * perCall * 0.8, `${kind.n} separate ${kind.type} materials`, 'Share one material instead of a clone() per object: fewer state switches, fewer draw calls once merged.', `${kind.n} separate ${kind.type}${kind.name ? ` “${kind.name}”` : ''} materials are made (often a .clone() per object, maybe every frame); share one material (or a few) and reuse them instead of making new ones.`);
    const mat = (s.materials || []).find((m) => m.objs >= 15 && !m.inst && (!rep || rep.mat !== (m.name || m.type) || rep.n < m.objs * 0.6));
    if (mat) add('merge', mat.objs * perCall * 0.8, `${mat.objs} separate meshes with ${matLabel(mat)}`, 'Merge the ones that don\'t move into one geometry (BufferGeometryUtils.mergeGeometries).', `${mat.objs} separate meshes use ${matLabel(mat)}; merge the ones that never move into one geometry with BufferGeometryUtils.mergeGeometries (one draw call), keep the moving ones apart.`);
    const shBig = (s.shadowLights || []).filter((l) => l.size >= 2048);
    if (shBig.length) add('shadowsize', (s.shadowCalls || 0) * perCall * 0.4 + 0.3, `Shadow map ${shBig[0].size}² (${plural(shBig.length, 'light')})`, 'Lower the shadow size to 1024 (light.shadow.mapSize.set(1024, 1024)) and fit its camera tightly around what\'s on screen.', `the shadow map is ${shBig[0].size}×${shBig[0].size}; set light.shadow.mapSize to 1024×1024 and fit the shadow camera tightly around the play area so it stays sharp.`);
    if ((s.casters || 0) >= 30) add('casters', (s.shadowCalls || 0) * perCall * 0.6, `${s.casters} things cast shadows`, 'Only big things should cast shadows: turn castShadow off on small or fast ones (projectiles, sparks, debris).', `${s.casters} objects cast shadows (≈ ${big(s.shadowCalls)} extra draw calls a frame); turn castShadow off on small or fast-moving things (projectiles, sparks, debris) and keep it on the big ones.`);
    if ((s.shadowLights || []).some((l) => l.passes > 1)) add('pointshadow', (s.shadowCalls || 0) * perCall * 0.5, 'A point light casts shadows (6 passes a frame)', 'Use a spot or directional light for the shadow, or turn the point light\'s shadow off.', 'a point light casts shadows, which draws the shadow casters 6 times a frame; use a spot / directional light for that shadow, or turn the point light\'s castShadow off.');
    if ((s.lights || 0) >= 4 || (s.shadowLights || []).length >= 2) add('lights', drawMs * 0.04 * Math.max(1, (s.lights || 0) - 3), `${plural(s.lights || 0, 'light')}${(s.shadowLights || []).length >= 2 ? `, ${s.shadowLights.length} with shadows` : ''}`, 'Fewer lights: keep one or two that matter (one casting shadows), fake the rest with an environment map or emissive colour.', `the scene has ${plural(s.lights || 0, 'light')} (${(s.shadowLights || []).length} with shadows); keep one or two lights (one casting shadows) and replace the others with an environment map or emissive colour.`);
    if (num(s.overdraw) >= 1.5) add('overdraw', drawMs * Math.min(0.6, num(s.overdraw) / 10), `See-through things cover the screen ≈ ${num(s.overdraw).toFixed(1)}×`, 'Fewer or smaller see-through layers; alphaTest instead of transparency where edges can be hard; additive sprites smaller.', `transparent things cover the screen about ${num(s.overdraw).toFixed(1)} times over; use alphaTest instead of transparent where edges can be hard, make big see-through planes / sprites smaller or fewer.`);
    const post = res.post || {}; const fMs = (post.filters || []).reduce((a, f) => a + num(f.ms), 0);
    if (num(post.offscreen) >= 2 || fMs > b * 0.25) add('post', fMs + num(post.offscreen) * 0.2, `Post-processing: ${Math.round(num(post.offscreen) * 10) / 10} passes a frame${fMs ? ` + filters ${ms1(fMs)} ms` : ''}`, 'Drop or merge passes, or run them at half resolution.', `post-processing draws ${Math.round(num(post.offscreen) * 10) / 10} offscreen passes a frame${fMs ? ` and the filters over it take ${ms1(fMs)} ms` : ''}; merge or drop passes and run the soft ones (bloom, blur) at half resolution.`);
    if (codeMs > b * 0.35) add('code', codeMs, `Its own code takes ${ms1(codeMs)} ms a frame`, 'Move work out of the frame loop: no new objects / materials / geometries per frame, reuse them; heavy maths once, not every frame.', `the layer's own code (outside drawing) takes ${ms1(codeMs)} ms a frame; stop making new objects, materials or geometries every frame (reuse / pool them) and move work that doesn't change out of the frame loop.`);
    if (num(res.tris || s.tris) > 1.5e6) add('tris', drawMs * 0.3, `${big(res.tris || s.tris)} triangles a frame`, 'Lighter models far away (THREE.LOD) or fewer subdivisions.', `it draws ${big(res.tris || s.tris)} triangles a frame; use lighter models in the distance (THREE.LOD) or fewer segments on round shapes.`);
    if (num(s.textures?.mb) > 400) add('textures', 0.2, `≈ ${num(s.textures.mb).toFixed(0)} MB of textures`, 'Smaller textures where they show small, or KTX2 (▶ Play\'s Optimize for play makes them).', `its textures hold about ${num(s.textures.mb).toFixed(0)} MB; use smaller textures where they show small on screen.`);
    return out.sort((a, c) => c.weight - a.weight).slice(0, 5).map((x) => ({ ...x, weight: Math.round(x.weight * 1000) / 1000 }));
  }
  return { RATES, PREFS, stdHz, target, frame, barScale, rows, blend, top, sentence, costs, suggest, ms1, big };
})();
if (typeof module !== 'undefined') module.exports = FrameBarCore;
