// Lab performance, before → after (round 16 "labperf"): the preview's frame time with a song playing on a scene with
// filter layers (rAF gaps inside the sandbox: p50 / p95, fps, WebGL draws per second), the Lab idle (paused), the Lab
// hidden behind a chat (the preview should draw nothing), the window unfocused, 20 scene switches (GL contexts,
// renderers, JS heap of the hub and of the preview: nothing should grow), and the hub's DOM writes while it plays.
//   node dev/make-test-song.js /tmp/hearth-test-song.wav
//   node dev/smoke.js --check-timeout 400000 --script dev/checks/labperf.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(50); } return false; };
const out = {};
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(800); } return r; };
// a probe inside the preview: WebGL draws, and the gaps between frames that drew anything (frames told apart by
// document.timeline.currentTime, the same for every callback of one frame); installed again after a page reload
const PROBE = `if (!window.__lp) {
  const lp = window.__lp = { draws: 0, gaps: [], last: 0, on: false, links: 0, linkMs: 0, ctx: 0, ctxMs: 0, tex: 0, texMs: 0 };
  // (round 21 "labgpu") shader programs linked (and the time waiting for them), WebGL contexts made, texture uploads
  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!P) continue;
    const link = P.linkProgram; P.linkProgram = function (p) { const t = performance.now(); lp.links += 1; const r = link.call(this, p); lp.linkMs += performance.now() - t; return r; };
    const gpp = P.getProgramParameter; P.getProgramParameter = function (p, n) { const t = performance.now(); const r = gpp.call(this, p, n); lp.linkMs += performance.now() - t; return r; };
    for (const m of ['texImage2D', 'texSubImage2D']) { const ti = P[m]; P[m] = function (...a) { const t = performance.now(); if (lp.on) lp.tex += 1; const r = ti.apply(this, a); if (lp.on) lp.texMs += performance.now() - t; return r; }; }
  }
  const gc0 = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, o) { const fresh = /webgl/.test(type) && !this.__lpHas; const t = performance.now(); const r = gc0.call(this, type, o); if (fresh && r) { this.__lpHas = true; lp.ctx += 1; lp.ctxMs += performance.now() - t; } return r; };
  const now = () => document.timeline.currentTime; // the frame's time: the same for every draw in one frame
  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!P) continue;
    for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const f = P[m]; if (typeof f !== 'function') continue;
      P[m] = function (...a) {
        if (lp.on) { lp.draws += 1; const t = now(); if (t !== lp.last) { if (lp.last) lp.gaps.push(t - lp.last); lp.last = t; } }
        return f.apply(this, a);
      };
    }
  }
}
window.__lp.gaps = []; window.__lp.last = 0; window.__lp.draws = 0; window.__lp.tex = 0; window.__lp.texMs = 0; window.__lp.on = true; return 1`;
const STOP = 'window.__lp.on = false; return { gaps: window.__lp.gaps.map((g) => Math.round(g * 10) / 10), draws: window.__lp.draws, tex: window.__lp.tex, texMs: window.__lp.texMs, health: window.__labHealth?.() }';
const pct = (g, p) => { const s = g.slice().sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : null; };
async function window_(ms) {
  await sbx(PROBE);
  let muts = 0; const mo = new MutationObserver((r) => { muts += r.length; }); mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  let busy = 0; let hb = performance.now(); const t = setInterval(() => { const n = performance.now(); busy += Math.max(0, n - hb - 20); hb = n; }, 20);
  const t0 = performance.now();
  await wait(ms);
  const el = performance.now() - t0;
  mo.disconnect(); clearInterval(t);
  const r = await sbx(STOP);
  const g = r.gaps || [];
  return { fps: Math.round((g.length / el) * 1000), p50: pct(g, 0.5), p95: pct(g, 0.95), worst: Math.round(Math.max(0, ...g)), drawsPerS: Math.round(((r.draws || 0) / el) * 1000), drawsPerFrame: g.length ? Math.round(((r.draws || 0) / (g.length + 1)) * 10) / 10 : 0, uploadsPerFrame: g.length ? Math.round(((r.tex || 0) / (g.length + 1)) * 10) / 10 : 0, uploadMsPerFrame: g.length ? Math.round(((r.texMs || 0) / (g.length + 1)) * 100) / 100 : 0, hubMutPerS: Math.round((muts / el) * 1000), hubLagMs: Math.round(busy) };
}
// 1. a scene with filters, song playing
const base = ThreeLayers.TEMPLATES.find((t) => t.id === 'rings') || ThreeLayers.TEMPLATES[0];
await d.newSketch('labperf probe', base.code, 3);
const fx = ['bloom', 'grain', 'vignette'].map((id) => ThreeLayers.FILTERS.find((f) => f.id === id) || ThreeLayers.FILTERS.find((f) => f.id.includes(id))).filter(Boolean);
for (const f of fx) await d.addLayer({ name: f.name, code: f.code }, 1.5);
await wait(1500);
const songOk = await c.loadSong('/tmp/hearth-test-song.wav').then(() => true, () => false);
await wait(1000);
if (songOk) { c.play(true); await until(() => c.state.playing, 3000); }
await wait(800);
out.playing = await window_(4000);
// (round 21) JS allocated by the preview per drawn frame while it plays (V8 sampling heap profiler, objects the GC
// already collected included), split into the sandbox runtime, three.js and the layers' own code
async function allocs(ms) {
  try {
    await sbx(PROBE);
    await smoke({ cdp: 'HeapProfiler.enable', params: {}, target: 'three-sandbox' });
    await smoke({ target: 'three-sandbox', cdp: 'HeapProfiler.startSampling', params: { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } });
    await wait(ms);
    const prof = await smoke({ cdp: 'HeapProfiler.stopSampling', params: {}, target: 'three-sandbox' });
    const r = await sbx(STOP);
    const frames = (r.gaps || []).length + 1;
    const by = { sandbox: 0, three: 0, layers: 0 };
    const walk = (n) => { const u = n.callFrame?.url || ''; const k = /three-sandbox/.test(u) ? 'sandbox' : /build\/three\./.test(u) ? 'three' : /^blob:/.test(u) ? 'layers' : null; if (k) by[k] += n.selfSize || 0; for (const ch of n.children || []) walk(ch); };
    const urls = {}; const all = (n) => { const u = (n.callFrame?.url || '?').slice(0, 60); urls[u] = (urls[u] || 0) + (n.selfSize || 0); for (const ch of n.children || []) all(ch); };
    walk(prof?.profile?.head || {}); all(prof?.profile?.head || {});
    by.top = Object.entries(urls).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([u, v]) => `${u} ${Math.round(v / 1024)}k`).join(' | ') || JSON.stringify(prof).slice(0, 200);
    const top = by.top; delete by.top;
    return { frames, kbPerFrame: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round((v / frames / 1024) * 10) / 10])), top };
  } catch (err) { return { error: String(err?.message || err) }; }
}
out.allocPlaying = await allocs(4000);
out.health0 = await sbx('return window.__labHealth()');
// 2. paused, the Lab on screen (the scene still animates on its own clock)
if (songOk) { c.play(false); await wait(500); }
out.paused = await window_(3000);
// 3. the Lab behind a chat
const claude = H.claudeAgent();
activate(claude.id); await wait(800);
out.hidden = await window_(3000);
activate('tool:three'); await wait(1200);
// 4. the window loses focus (another app in front): emulated
const hasFocus = document.hasFocus;
out.focusedAtStart = document.hasFocus();
document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); await wait(700);
out.unfocused = await window_(3000);
document.hasFocus = hasFocus; window.dispatchEvent(new Event('focus')); await wait(700);
// 5. Light mode (after: 30 fps, 1× pixels, filters at half size)
if (c.light) { c.light(true); await wait(1500); out.light = await window_(3000); c.light(false); await wait(800); }
out.perf = c.perf ? c.perf() : null;
// 6. 20 scene switches between four templates
const names = ['Basic scene', 'Instancing', 'Particles', 'Custom ShaderMaterial'];
for (const n of names) { c.newSketch(n); await wait(1800); }
const heap = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
const gc = async () => { try { await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }); } catch { /* none */ } await wait(400); };
await gc();
const before = { hubHeapMB: heap(), sandbox: await sbx('return window.__labHealth()') };
const t0 = performance.now();
for (let i = 0; i < 20; i++) { c.openSketch(names[i % names.length]); await wait(1100); }
await wait(2500);
// (a loaded machine: the last scene may still be building; wait until it has drawn and its cross-fade is gone)
await until(async () => { const h = await sbx1('return window.__labHealth()'); return h && !h.error && h.overlays === 0 && h.contexts >= 1; }, 15000);
await gc();
// (round 21) 12 more switches, each timed from the open to the new scene's first drawn frame and to the whole stack
// drawn (the cover gone), with the shader programs linked and WebGL contexts made on the way
const sw = []; let mark = null;
const onMsg = (e) => { const m = e.data; if (!mark || m?.source !== 'three-sandbox') return; if (m.type === 'drawn' && mark.first == null) mark.first = performance.now() - mark.t; if (m.type === 'stack-drawn' && mark.stack == null) mark.stack = performance.now() - mark.t; };
addEventListener('message', onMsg);
await sbx(PROBE);
const cnt = () => sbx('return { links: window.__lp.links, linkMs: window.__lp.linkMs, ctx: window.__lp.ctx, ctxMs: window.__lp.ctxMs }');
for (let i = 0; i < 12; i++) {
  const c0 = await cnt();
  mark = { t: performance.now(), first: null, stack: null };
  c.openSketch(names[(i + 1) % names.length]);
  await until(() => mark.stack != null, 6000);
  await wait(500);
  const c1 = await cnt();
  sw.push({ first: Math.round(mark.first ?? -1), stack: Math.round(mark.stack ?? -1), links: c1.links - c0.links, linkMs: Math.round(c1.linkMs - c0.linkMs), ctx: c1.ctx - c0.ctx, ctxMs: Math.round(c1.ctxMs - c0.ctxMs) });
}
removeEventListener('message', onMsg);
const med = (k) => pct(sw.slice(2).map((x) => x[k]), 0.5);
out.switchTiming = { firstFrameMsP50: med('first'), firstFrameMsP95: pct(sw.slice(2).map((x) => x.first), 0.95), stackDrawnMsP50: med('stack'), linksP50: med('links'), linkMsP50: med('linkMs'), contextsP50: med('ctx'), ctxMsP50: med('ctxMs'), each: sw };
// (round 21) a layer re-run (the code edited, a slider that rebuilds): to its first frame, programs linked
const hot = [];
const hotCode = (ThreeData.TEMPLATES.find((t) => t.name === names[0]) || ThreeData.TEMPLATES[0]).code;
for (let i = 0; i < 6; i++) {
  const c0 = await cnt();
  mark = { t: performance.now(), first: null, stack: null };
  addEventListener('message', onMsg);
  d.setCode(`${hotCode}\n// edit ${i}`);
  await until(() => mark.first != null, 5000);
  removeEventListener('message', onMsg);
  await wait(400);
  const c1 = await cnt();
  hot.push({ first: Math.round(mark.first ?? -1), links: c1.links - c0.links, linkMs: Math.round(c1.linkMs - c0.linkMs), ctx: c1.ctx - c0.ctx });
}
out.rerun = { firstFrameMsP50: pct(hot.slice(1).map((x) => x.first), 0.5), linksP50: pct(hot.slice(1).map((x) => x.links), 0.5), contextsP50: pct(hot.slice(1).map((x) => x.ctx), 0.5), each: hot };
await gc();
out.switches = { ms: Math.round(performance.now() - t0), before, after: { hubHeapMB: heap(), sandbox: await sbx('return window.__labHealth()') } };
const a = out.switches.after.sandbox; const b = out.switches.before.sandbox;
out.ok = { hiddenDrawsNothing: out.hidden.drawsPerS === 0, noContextLeak: Boolean(a && b && a.contexts <= Math.max(b.contexts, a.layers + 1)) };
return JSON.stringify(out, null, 1);
