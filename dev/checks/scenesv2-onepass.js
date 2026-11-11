// (Nov 10, onepass) Scenes v2: consecutive plain layers drawn in ONE pass on the picture (docs/upgrades/onepass.md).
// Its own temp data. Five still v2 layers with different cameras (two of them unlit: the ones that shared a camera
// buffer in three.js), depth inside each layer, a far wall drawn after a near knot (hidden if the depth weren't put
// back between layers, or if it drew with another layer's camera), additive rings; the picture is drawn both ways
// from the same state (__labG2.ab: one pass a run / a pass per layer, as before) and must be the same pixels:
//   all plain            1 pass on the picture where it was 4
//   one at opacity 0.5   the run stops at it and starts again after it
//   a colour background in the middle (it clears the picture: a pass of its own, the layers over it join that one)
// and the GPU time is read only when asked (__labG2.timing) or while the stats line shows.
// "The same pixels": see `same` below (one level on a handful of pixels in 2 million is let through, and reported).
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/run-checks.js --exact scenesv2-onepass
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };
const props = (id, p) => pv(`postMessage(${JSON.stringify({ target: 'three-sandbox', type: 'layer-props', id, props: p })}, '*'); return 1`);
const RESET = { opacity: 1, blend: 'normal', x: 0, y: 0, scale: 1, rotate: 0, mask: null, visible: true };
const LAYERS = {
  Backdrop: `export default ({ THREE, tsl, scene }) => { const { mix, screenUV, color } = tsl; scene.backgroundNode = mix(color('#05060c'), color('#3a1f5a'), screenUV.y.oneMinus()); };`,
  Knot: `export default ({ THREE, scene, camera }) => {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 4, 5); scene.add(sun);
  const k = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.3, 200, 32), new THREE.MeshStandardNodeMaterial({ color: '#7c5cff', roughness: 0.35 })); k.rotation.set(0.4, 0.7, 0); scene.add(k);
  camera.position.set(0, 0, 4);
};`,
  // far from its own camera (z −20 → 26 away), drawn after the knot (≈ 4 away from its camera): hidden behind the knot if the knot's depth stayed
  Wall: `export default ({ THREE, scene, camera }) => {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicNodeMaterial({ color: '#19c37d' })); w.position.set(1.5, 0, -20); scene.add(w);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicNodeMaterial({ color: '#ff3cac' })); b.position.set(-2, 1, 0); b.rotation.set(0.5, 0.5, 0); scene.add(b);
  camera.position.set(0.5, 0.3, 6); camera.lookAt(0, 0, 0);
};`,
  Cover: `export default ({ THREE, scene, camera }) => { scene.background = new THREE.Color('#203040'); const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16), new THREE.MeshBasicNodeMaterial({ color: '#ffd23c' })); m.position.set(-1.5, -0.8, 0); scene.add(m); };`,
  Rings: `export default ({ THREE, scene, camera }) => {
  for (let k = 0; k < 6; k += 1) { const r = new THREE.Mesh(new THREE.TorusGeometry(1 + k * 0.35, 0.03, 8, 128), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color().setHSL(k / 6, 0.8, 0.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); r.rotation.set(k * 0.3, k * 0.2, 0); scene.add(r); }
  camera.position.z = 7;
};`,
};
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  const c = await ThreeLab.cmd(); ThreeLab.quality?.set('high', { quiet: true });
  const layers = Object.entries(LAYERS).map(([name, code], i) => ({ id: i ? `l${i + 1}` : 'main', name, code, slot: i }));
  ThreeLab.scenes.create({ name: 'v2 one pass', code: layers[0].code, layers, open: true, format: 'gpu' });
  await until(() => ThreeLab.workspace.state().ready, 60000);
  const st = await until(async () => { const s = await pj('window.__labG2 && window.__labG2.state()'); return s && s.layers.length === 5 && s.frames > 20 ? s : null; }, 120000, 500);
  step('five v2 layers on the one renderer, the one-pass hook in place', Boolean(st) && st.onepass === true && st.backend === 'webgpu', st && { layers: st.layers.length, onepass: st.onepass, backend: st.backend });
  c.customSize(1920, 1080); c.size('custom'); await wait(1500);
  // the same pixels: none differs, or as little as two draws done the old way differ here (measured, RTX 4080: where
  // additive rings cross the lit knot, 0 to 4 pixels of 2 million are one level of 255 apart from one draw to the
  // next, either way): at most one level on at most 1 pixel in 100,000. The checks of merged layers allow ± 4 levels
  const few = (r) => r.max <= 1 && r.differing <= Math.max(1, r.of / 100000);
  const same = (r) => r && few(r) && few({ ...r.noise, of: r.of }) && r.lit > r.of * 0.2;

  // the cover (a colour background: it clears the picture) hidden: four plain layers
  await props('l4', { ...RESET, visible: false }); await wait(500);
  const a = await pj('window.__labG2.ab(1920, 1080)'); // (every pixel of the frame)
  step('four plain layers: the same pixels in one pass as in a pass each', same(a), a);
  step('four plain layers: 1 pass on the picture (was 4), then the copy to the screen (2 passes of three.js)', a && a.passes[0] === 3 && a.passes[1] === 6, a?.passes);
  const wall = await pj('window.__labG2.pixel(0.62, 0.5)'); // the far wall, over the knot's edge
  step('each layer its own camera and depth (the far wall shows over the knot drawn before it)', wall && wall[1] > 150 && wall[0] < 120, wall);

  // a layer that isn't plain in the middle: the run stops there, another starts after it
  await props('l3', { ...RESET, opacity: 0.5 }); await wait(500);
  const b = await pj('window.__labG2.ab()');
  step('opacity 0.5 in the middle: the same pixels', same(b), b);
  step('opacity 0.5 in the middle: a run under it, its own picture and merge, a run over it (6 passes, was 7)', b && b.passes[0] === 6 && b.passes[1] === 7, b?.passes);
  await props('l3', RESET); await wait(300);

  // a colour background in the middle: it clears the picture, a pass of its own; the layers over it join that one
  await props('l4', RESET); await wait(500);
  const k = await pj('window.__labG2.ab()');
  step('a colour background in the middle: the same pixels', same(k), k);
  step('a colour background in the middle: 2 passes on the picture (was 5)', k && k.passes[0] === 4 && k.passes[1] === 7, k?.passes);
  const cov = await pj('window.__labG2.pixel(0.02, 0.5)');
  step('the colour background covers what is under it', cov && Math.abs(cov[0] - 0x20) < 12 && Math.abs(cov[1] - 0x30) < 12 && Math.abs(cov[2] - 0x40) < 12, cov);

  // 4K, as rendered
  c.customSize(3840, 2160); c.size('custom'); await wait(2000);
  const u = await pj('window.__labG2.ab(960, 540)');
  step('4K: the same pixels', same(u), u);

  // the GPU time: not read unless asked
  await pj('window.__labG2.timing(false)'); await wait(1500);
  const t0 = await pj('window.__labG2.state()');
  step('the GPU time is not read while no one asks (no timestamp queries)', t0.ts === true && t0.timing === false && t0.gpuMs == null, { ts: t0.ts, timing: t0.timing, gpuMs: t0.gpuMs });
  await pj('window.__labG2.timing(true)');
  const t1 = await until(async () => { const s = await pj('window.__labG2.state()'); return s.timing && s.gpuMs != null ? s : null; }, 8000, 300);
  step('asked (__labG2.timing): the GPU time is read again', Boolean(t1), t1 && { timing: t1.timing, gpuMs: t1.gpuMs });
  await pj('window.__labG2.timing(false)');
  const ge = await pj('await window.__labG2.gpuError()');
  const sg = await pj('window.__labG2.state()');
  step('a frame in one pass: nothing refused by the graphics card, no fall-back', ge === null && sg.onepass === true && !sg.onepassErr, { gpuError: ge, fellBack: sg.onepassErr });
  const errs = D().report?.()?.errors || null; const s9 = await pj('window.__labG2.state()');
  step('no layer error, no frame error', (!errs || !errs.length) && !s9.err, { errs, err: s9.err });
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
