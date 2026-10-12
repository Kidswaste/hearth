// Lab preview GPU work (round 21 "labgpu"): the context pool, merged filter passes and the direct filter source keep
// the picture exactly what it was. A still scene with a pixelate filter and three per-pixel filters over it (duotone,
// vignette draw inside pixelate's pass; thermal, above them, takes that pass's canvas as it is), compared pixel by pixel with the round-21 shortcuts on and
// off; then layer re-runs (their contexts come from the pool, their shader programs from the context's cache: the
// picture is the same, nothing grows) and scene switches.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/labgpu.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const probe = async () => String(await sbx('return window.__labGpu.probe(32)')).split(',').map(Number);
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(800); } return r; };
// a still scene: a lit sphere and a box on a gradient backdrop, drawn every frame, nothing moves
const SCENE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#203050');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6);
scene.add(new THREE.AmbientLight('#ffffff', 0.4)); const l = new THREE.DirectionalLight('#ffeedd', 2.5); l.position.set(3, 4, 5); scene.add(l);
const s = new THREE.Mesh(new THREE.SphereGeometry(1.4, 48, 32), new THREE.MeshStandardMaterial({ color: '#e05030', roughness: 0.4 })); s.position.x = -1.2; scene.add(s);
const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: '#40c0a0' })); b.position.x = 1.6; b.rotation.set(0.5, 0.7, 0); scene.add(b);
function frame() { requestAnimationFrame(frame); renderer.render(scene, camera); }
frame();`;
const FX = [
  ['Pixelate', `filter('pixelate', { size: 6, levels: 0, punch: 0 });`],
  ['Duotone', `filter('duotone', { shadows: '#102040', highlights: '#ffd080', contrast: 1.2, mix: 0.7 });`],
  ['Vignette', `filter('vignette', { amount: 0.8, softness: 0.4, round: 0, color: '#000000', drive: 'off', react: 0 });`],
  ['Thermal', `filter('thermal', { mix: 0.3, contrast: 1.1 });`],
];
await d.newSketch('labgpu probe', SCENE, 3);
for (const [name, code] of FX) await d.addLayer({ name, code }, 2);
await until(async () => { const i = await sbx1('return window.__labGpu.info()'); return i?.fused?.length === 2; }, 20000);
await wait(800);
// mean channel difference (0..255): the preview's adaptive resolution moves edges by a pixel between two looks
const diff = (a, b) => { if (!a?.length || a.length !== b?.length) return 999; let m = 0; for (let i = 0; i < a.length; i++) m += Math.abs(a[i] - b[i]); return Math.round((m / a.length) * 100) / 100; };
const mean = (a) => (a?.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const info0 = await sbx('return window.__labGpu.info()');
out.fusedInfo = info0;
step('duotone and vignette draw inside the pixelate pass (thermal, with a helper function, draws on its own)', info0.fused?.length === 2, info0.fused);
const pOn = await probe();
await wait(1000);
const pOn2 = await probe();
out.noise = diff(pOn, pOn2);
out.quality = await sbx('return window.__labHealth().hz');
await sbx('window.__labGpu.set({ fuse: false }); return 1'); await wait(1500);
const pOff = await probe();
const infoOff = await sbx('return window.__labGpu.info()');
out.gpuMB = { fused: info0.gpuMB, unfused: infoOff.gpuMB };
step('merged passes: the same picture (mean channel difference ≤ 2 of 255)', diff(pOn, pOff) <= 2 && mean(pOn) > 5, { meanDiff: diff(pOn, pOff), mean: Math.round(mean(pOn)), meanOff: Math.round(mean(pOff)) });
await sbx('window.__labGpu.set({ fuse: true, direct: false }); return 1'); await wait(1500);
const pNoDirect = await probe();
step('direct filter source: the same picture as the 2D merge (≤ 2)', diff(pOn, pNoDirect) <= 2, { meanDiff: diff(pOn, pNoDirect) });
await sbx('window.__labGpu.set({ fuse: true, direct: true }); return 1'); await wait(1000);
// re-runs: the scene layer and a filter, 4 times each; their contexts come back from the pool
const h0 = await sbx('return window.__labHealth()');
const n0 = (await sbx('return window.__labGpu.info()')).note;
for (let i = 0; i < 4; i++) {
  await d.updateLayer('Thermal', { code: `${FX[3][1]}\n// run ${i}` }, 1.5);
  await d.updateLayer('bottom', { code: `${SCENE}\n// run ${i}` }, 1.5);
}
await until(async () => { const h = await sbx1('return window.__labHealth()'); return h?.overlays === 0; }, 8000);
await wait(1200);
const h1 = await sbx('return window.__labHealth()');
const n1 = (await sbx('return window.__labGpu.info()')).note;
out.programs = { linked: n1.links - n0.links, reused: n1.progHit - n0.progHit };
step('re-runs reuse their compiled shader programs (nothing new linked)', n1.progHit - n0.progHit >= 8 && n1.links - n0.links <= 1, out.programs);
const pAfter = await probe();
out.health = { before: h0, after: h1 };
step('re-runs take their contexts from the pool', h1.poolHit - h0.poolHit >= 6, { hits: h1.poolHit - h0.poolHit });
step('re-runs: GL contexts, renderers, listeners do not grow', h1.contexts <= h0.contexts && h1.renderers <= h0.renderers && h1.listeners <= h0.listeners, { h0, h1 });
step('re-runs on pooled contexts: the same picture (≤ 2)', diff(pOn, pAfter) <= 2, { meanDiff: diff(pOn, pAfter) });
// scene switches: two templates and back to this one
const names = ['Basic scene', 'Particles'];
for (const n of names) { c.newSketch(n); await wait(2500); }
c.openSketch('labgpu probe');
await until(async () => { const i = await sbx1('return window.__labGpu.info()'); return i?.fused?.length === 2; }, 20000);
await wait(1500);
const pBack = await probe();
const h2 = await sbx('return window.__labHealth()');
out.health.back = h2;
step('back from other scenes: the same picture (≤ 2)', diff(pOn, pBack) <= 2, { meanDiff: diff(pOn, pBack) });
step('contexts after the switches: one per layer at most', h2.contexts <= h2.layers, { contexts: h2.contexts, layers: h2.layers, pooled: h2.pooled });
out.ok = out.steps.every((s) => s.ok);
return JSON.stringify(out, null, 1);
