// ⚡ "Why is this slow?" (round 133, speed133): the plain arithmetic of the Lab's speed check, no DOM, no page (loads in
// Node). The page measures (tools/three-sandbox.html "speed check"); the card is tools/three-speed.js.
// (the slow chip's own rule lives in tools/three-speed-hook.js, which loads with the Lab: this file loads on first use)
//   analyse(res, { nameOf, sliders, set }) → { fps, frameMs, layers (heaviest first), causes (top 3 first) }
//       each cause: { id, kind, title, why, fix: { kind, label, … }, gain (fps), gainLine, preview (renders unaffected) }
//   SAFE                              the safe mode's settings (1× pixels, no antialias, no shadows)
//   ask(layer, a) / estimate(base, chars) / costLine(est, who)   the optional AI help's words and its cost
const SpeedCore = (() => {
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const big = (n) => { n = Math.round(num(n)); return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n); };
  const ms1 = (x) => { const v = num(x); return v >= 10 ? v.toFixed(0) : v.toFixed(1); };
  const plural = (n, a, b = `${a}s`) => `${n} ${n === 1 ? a : b}`;
  const SAFE = { px1: true, noAA: true, sh: 0 };
  const COUNT_RE = /count|particles?|amount|number|num\b|density|instances|stars|points|boids|agents|detail|segments/i;

  // ---------- the card ----------
  // a slider's new value on its step, else on two significant digits (99,964 → 100,000)
  const snap = (v, step) => { const st = num(step); if (st > 1) return Math.round(v / st) * st; if (v < 100) return Math.round(v); const m = 10 ** (Math.floor(Math.log10(v)) - 1); return Math.round(v / m) * m; };
  const countSlider = (list) => (list || []).filter((s) => typeof s.value === 'number' && s.value > 1 && COUNT_RE.test(`${s.key} ${s.label || ''}`)).sort((a, b) => b.value - a.value)[0] || null;
  function analyse(res, { nameOf = (id) => id, sliders = () => [], set = {} } = {}) {
    if (!res?.ok) return { ok: false, error: res?.error || 'The measure did not finish.' };
    const fps = Math.max(0.1, num(res.fps)); const T = 1000 / fps;
    const toFps = (ms) => 1000 / Math.max(0.05, ms);
    const gainOf = (newT) => Math.max(0, Math.round(toFps(Math.max(T * 0.25, Math.min(T, newT))) - fps)); // (at most 4× faster: an estimate)
    const layers = (res.layers || []).filter((L) => L.shown !== false).map((L) => {
      const rs = L.gl?.renderers || [];
      const draw = num(L.ms?.drawIn) + num(L.ms?.drawOut);
      return {
        id: L.id, name: nameOf(L.id) || L.id, fx: L.fx || null,
        gpuMs: L.gpuMs != null ? Math.min(T, num(L.gpuMs)) : null, // (a layer can't cost more than the whole frame: a noisy read) drawMs: draw, codeMs: Math.max(0, num(L.ms?.frame) - num(L.ms?.drawIn)),
        cost: L.gpuMs != null ? Math.max(Math.min(T, num(L.gpuMs)), draw) : draw,
        calls: num(L.calls), tris: Math.max(num(L.tris), num(L.scan?.tris)), rt: num(L.rt), progs: num(L.gl?.progs), frag: num(L.gl?.frag),
        texMB: num(L.scan?.textures?.mb), tex: L.scan?.textures?.top?.[0] || null,
        aa: rs.some((r) => r.aa && r.samples > 0), pr: rs.reduce((m, r) => Math.max(m, num(r.pr)), 0), base: rs.reduce((m, r) => Math.max(m, num(r.base)), 0),
        size: rs.reduce((m, r) => (r.w * r.h > m.w * m.h ? r : m), { w: 0, h: 0 }),
        shadowLights: (L.scan?.shadowLights || []).length, shadowCalls: num(L.scan?.shadowCalls),
      };
    }).sort((a, b) => b.cost - a.cost);
    const causes = [];
    // pixels: a renderer drawing more than 1 device pixel per CSS pixel
    const pr = layers.reduce((m, L) => Math.max(m, L.pr), 0);
    if (!set.px1 && pr > 1.05) {
      const f = 0.6; const k = pr * pr;
      const L = layers.find((x) => x.pr === pr);
      causes.push({ id: 'px', kind: 'px', preview: true, title: `Preview at ${+pr.toFixed(2)}× pixels`, why: `The preview draws ${+pr.toFixed(2)}× pixels${L?.size?.w ? ` (${L.size.w}×${L.size.h})` : ''}: ${+k.toFixed(1)}× the work of 1×.`, fix: { kind: 'set', set: { px1: true }, label: 'Preview at 1× pixels' }, gain: gainOf(T * (1 - f + f / k)) });
    }
    // antialias
    const aaN = layers.filter((L) => L.aa).length;
    if (!set.noAA && aaN) causes.push({ id: 'aa', kind: 'aa', preview: true, title: 'Antialias in the preview', why: `${plural(aaN, 'layer')} draw${aaN === 1 ? 's' : ''} with antialias (several samples a pixel).`, fix: { kind: 'set', set: { noAA: true }, label: 'Turn off antialias for the preview only' }, gain: gainOf(T * (1 - 0.22 * Math.min(1, aaN / Math.max(1, layers.length) + 0.3))) });
    // the heaviest layer: its triangles, else its time
    const top = layers.find((L) => !L.fx);
    if (top && (top.cost >= T * 0.25 || top.tris >= 150000)) {
      const sl = countSlider(sliders(top.id));
      const target = 100000;
      const factor = top.tris > target ? Math.max(0.1, Math.min(0.5, target / top.tris)) : 0.5;
      const save = (top.gpuMs ?? top.drawMs) * (1 - factor);
      const title = top.tris >= 150000 ? `'${top.name}' draws ${big(top.tris)} triangles` : `'${top.name}' takes ${ms1(top.cost)} ms of each ${ms1(T)} ms frame`;
      const why = `${top.gpuMs != null ? `Left out for a moment, the frame was ${ms1(top.gpuMs)} ms shorter. ` : ''}${big(top.calls)} draw calls, ${big(top.tris)} triangles, ${plural(top.progs, 'shader')}${top.rt ? `, ${top.rt} offscreen passes a frame` : ''}.`;
      const fix = sl ? { kind: 'slider', layer: top.id, key: sl.key, from: sl.value, to: Math.max(num(sl.min) > 0 ? num(sl.min) : 1, snap(sl.value * factor, sl.step)), label: top.tris > target ? `Cut to ${big(Math.round(top.tris * factor))}` : `Halve “${sl.label || sl.key}”` } : { kind: 'ai', layer: top.id, label: `✦ Ask the AI to optimise '${top.name}'` };
      causes.push({ id: `layer:${top.id}`, kind: 'layer', layer: top.id, preview: false, title: sl && top.tris >= 150000 ? `${title}: cut to ${big(Math.round(top.tris * factor))}` : title, why, fix, gain: gainOf(T - save) });
    }
    // filters (adjustment layers) at full size
    for (const L of layers.filter((x) => x.fx && !x.fx.half)) {
      if (set.fxHalf || L.cost < T * 0.12) continue;
      causes.push({ id: `fx:${L.id}`, kind: 'fx', layer: L.id, preview: true, title: `'${L.name}' at full size`, why: `The ${L.fx.type || 'filter'} takes ${ms1(L.cost)} ms a frame at full size.`, fix: { kind: 'set', set: { fxHalf: true }, label: 'Half size in the preview' }, gain: gainOf(T - L.cost * 0.6) });
      break;
    }
    // shadows on several lights
    const shN = layers.reduce((a, L) => a + L.shadowLights, 0);
    if (set.sh == null && shN >= 2) {
      const sh = layers.filter((L) => L.shadowLights);
      const save = sh.reduce((a, L) => a + (L.gpuMs ?? L.drawMs) * Math.min(0.7, L.shadowCalls / Math.max(1, L.calls + L.shadowCalls)) * ((L.shadowLights - 1) / Math.max(1, L.shadowLights)), 0);
      causes.push({ id: 'shadows', kind: 'shadows', preview: true, title: `Shadows on ${shN} lights`, why: `Each shadow light draws the scene once more into its map, every frame.`, fix: { kind: 'set', set: { sh: 1 }, label: 'Keep 1 (preview)' }, gain: gainOf(T - Math.max(save, T * 0.04 * (shN - 1))) });
    }
    // post-processing inside a layer (render targets a frame): the AI can make those passes lighter
    const post = layers.find((L) => !L.fx && L.rt >= 3 && !causes.some((c) => c.layer === L.id));
    if (post) causes.push({ id: `post:${post.id}`, kind: 'post', layer: post.id, preview: false, title: `'${post.name}' draws ${post.rt} offscreen passes a frame`, why: 'Post-processing passes (bloom, blur…) each draw the whole frame again.', fix: { kind: 'ai', layer: post.id, label: `✦ Ask the AI to optimise '${post.name}'` }, gain: gainOf(T - (post.gpuMs ?? post.drawMs) * 0.4) });
    for (const c of causes) c.gainLine = `${c.gain > 0 ? `+${c.gain} fps` : 'a little'}${c.preview ? ', renders unaffected' : ', changes the scene'}`;
    causes.sort((a, b) => b.gain - a.gain);
    return { ok: true, fps: Math.round(fps * 10) / 10, frameMs: Math.round(T * 10) / 10, hz: num(res.hz), layers, causes: causes.slice(0, 3), all: causes };
  }

  // ---------- (round 146, layercost146) one layer's lighten actions, heaviest layers first ----------
  // lighten(L, { sliders, lay }) → [{ id, kind: 'lighten', layer, preview, title, fix: { kind, label, … } }]
  //   fewer   its count slider halved (a scene change, renders too)        → fix.kind 'slider'
  //   half    this layer at ½ resolution in the preview                     → fix.kind 'lay' { half: true }
  //   sh      no shadows on this layer in the preview (it has shadow lights) → fix.kind 'lay' { sh0: true }
  //   hide    hide the layer (its eye: a scene change)                      → fix.kind 'hide'
  function lighten(L, { sliders = () => [], lay = {} } = {}) {
    if (!L) return [];
    const own = lay?.[L.id] || {};
    const out = [];
    const mk = (k, fix, title, preview) => out.push({ id: `lt:${L.id}:${k}`, kind: 'lighten', act: k, layer: L.id, preview, title, fix: { ...fix, layer: L.id } });
    const sl = L.fx ? null : countSlider(sliders(L.id));
    if (sl) mk('fewer', { kind: 'slider', key: sl.key, from: sl.value, to: Math.max(num(sl.min) > 0 ? num(sl.min) : 1, snap(sl.value * 0.5, sl.step)), label: 'Fewer' }, `Halve “${sl.label || sl.key}” on '${L.name}' (${big(sl.value)} → ${big(snap(sl.value * 0.5, sl.step))})`, false);
    if (!L.fx && !own.half) mk('half', { kind: 'lay', set: { half: true }, label: '½ res' }, `'${L.name}' at half resolution in the preview (renders unaffected)`, true);
    if (L.shadowLights && !own.sh0) mk('sh', { kind: 'lay', set: { sh0: true }, label: 'No shadows' }, `No shadows on '${L.name}' in the preview (renders unaffected)`, true);
    mk('hide', { kind: 'hide', label: 'Hide' }, `Hide '${L.name}' (its eye in Layers)`, false);
    return out;
  }

  // ---------- the optional AI help (only on a click, the cost shown first) ----------
  function ask(L, a) {
    if (!L) return '';
    const bits = [`${big(L.tris)} triangles`, `${big(L.calls)} draw calls`, `${plural(L.progs, 'shader')}${L.frag ? ` (longest ${L.frag} lines)` : ''}`];
    if (L.rt) bits.push(`${L.rt} offscreen passes a frame`);
    if (L.texMB) bits.push(`textures ≈ ${Math.round(L.texMB)} MB${L.tex?.w ? ` (biggest ${L.tex.w}×${L.tex.h})` : ''}`);
    if (L.pr > 1.05) bits.push(`pixel ratio ${+L.pr.toFixed(2)}`);
    return `⚡ Optimise the Lab layer “${L.name}”: measured on this computer the preview runs at ${Math.round(a.fps)} fps (${ms1(a.frameMs)} ms a frame); this layer is ≈ ${ms1(L.cost)} ms of it: ${bits.join(', ')}. Make it lighter on the GPU (fewer triangles or instancing, cheaper shaders, smaller or half-size passes) and keep how it looks the same; give the amount a slider if it has none.`;
  }
  function estimate(base = 9000, chars = 600) {
    const trips = 3; const per = Math.max(0, num(base)) + Math.ceil(num(chars) / 3.6);
    return { trips, input: Math.round(trips * per + 450 * 3), output: 1800 };
  }
  const kfmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  const costLine = (e, who = 'Claude') => `About ${kfmt(e.input)} tokens in (most re-read from the cache) and ${kfmt(e.output)} out · ${who}`;

  const api = { SAFE, COUNT_RE, countSlider, analyse, lighten, ask, estimate, costLine, big, ms1 };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
