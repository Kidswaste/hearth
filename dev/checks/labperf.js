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
  const lp = window.__lp = { draws: 0, gaps: [], last: 0, on: false };
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
window.__lp.gaps = []; window.__lp.last = 0; window.__lp.draws = 0; window.__lp.on = true; return 1`;
const STOP = 'window.__lp.on = false; return { gaps: window.__lp.gaps.map((g) => Math.round(g * 10) / 10), draws: window.__lp.draws, health: window.__labHealth?.() }';
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
  return { fps: Math.round((g.length / el) * 1000), p50: pct(g, 0.5), p95: pct(g, 0.95), worst: Math.round(Math.max(0, ...g)), drawsPerS: Math.round(((r.draws || 0) / el) * 1000), hubMutPerS: Math.round((muts / el) * 1000), hubLagMs: Math.round(busy) };
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
out.switches = { ms: Math.round(performance.now() - t0), before, after: { hubHeapMB: heap(), sandbox: await sbx('return window.__labHealth()') } };
const a = out.switches.after.sandbox; const b = out.switches.before.sandbox;
out.ok = { hiddenDrawsNothing: out.hidden.drawsPerS === 0, noContextLeak: Boolean(a && b && a.contexts <= Math.max(b.contexts, a.layers + 1)) };
return JSON.stringify(out, null, 1);
