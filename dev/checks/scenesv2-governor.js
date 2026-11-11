// (Nov 11, round 178 part B) Scenes v2 and the frame-time governor (docs/upgrades/governor178.md). Its own temp data.
// The Lab already has one: QUALITY › Smooth (rounds 31 and 142: adaptCore / adaptQuality in tools/three-sandbox.html)
// watches the frame gaps and lowers the preview's resolution in steps, raises it back when there is room, and never
// touches stills, recordings, renders. A v2 scene's one renderer takes its pixel ratio from it (g2Size → prQ). This
// check proves it governs a v2 scene, on the real GPU:
//   light    a light v2 scene in Smooth stays at full resolution
//   heavy    the same scene made heavy (a slider's worth of full-frame additive planes, found by stepping the load up
//            under Force high until the frame rate falls well under the light one): in Smooth the resolution drops
//            and the frame rate recovers; the stats say so (quality, for the owner's chip and the AIs' read-back)
//   back     the load gone: the resolution climbs back to full (a step at a time; up to a few minutes)
//   high     Force high quality: nothing is lowered, however slow
//   exact    while it is lowered, a still is taken at the scene's full resolution, and an exported still has its size
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/run-checks.js --exact scenesv2-governor
const out = { steps: [], log: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };
const st = () => pj('window.__labG2.state()');
const LAYERS = {
  Backdrop: `export default ({ THREE, tsl, scene }) => { const { mix, screenUV, color, time, sin } = tsl; scene.backgroundNode = mix(color('#05060c'), color('#3a1f5a'), screenUV.y.oneMinus().add(sin(time).mul(0.05))); };`,
  // its Load slider's worth of full-frame additive planes (a slider: it survives a restart of the preview), each pixel a dozen sines: the frame's cost follows the pixels drawn
  Load: `export default ({ THREE, tsl, scene, camera, tweak, onFrame }) => {
  const { uv, sin, time, vec3 } = tsl;
  const P = tweak({ load: { value: 0, min: 0, max: 4000, step: 1, label: 'Load' } });
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  let v = uv().x.mul(40).add(time); for (let i = 0; i < 12; i += 1) v = sin(v.mul(1.7).add(uv().y.mul(9 + i)));
  mat.colorNode = vec3(0.0006, 0.0012, 0.002).mul(v.add(1.2));
  const N = 4000; const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(40, 40), mat, N); const o = new THREE.Object3D(); o.updateMatrix();
  for (let i = 0; i < N; i += 1) m.setMatrixAt(i, o.matrix); m.count = 0; m.frustumCulled = false; scene.add(m); camera.position.z = 5;
  const k = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 24), new THREE.MeshBasicNodeMaterial({ color: '#7c5cff' })); scene.add(k);
  onFrame((t, dt) => { m.count = Math.max(0, Math.min(N, Math.round(P.load))); window.__loadNow = m.count; k.rotation.y += dt; });
};`,
};
// the frame rate over ms (the page's own count of frames drawn)
const rate = async (ms = 2500) => { const a = await st(); const t0 = performance.now(); await wait(ms); const b = await st(); return Math.round(((b.frames - a.frames) / (performance.now() - t0)) * 10000) / 10; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  const c = await ThreeLab.cmd();
  const layers = Object.entries(LAYERS).map(([name, code], i) => ({ id: i ? `l${i + 1}` : 'main', name, code, slot: i }));
  ThreeLab.scenes.create({ name: 'v2 governor', code: layers[0].code, layers, open: true, format: 'gpu' });
  await until(() => ThreeLab.workspace.state().ready, 60000);
  const s0 = await until(async () => { const s = await st(); return s && s.layers.length === 2 && s.frames > 30 ? s : null; }, 120000, 500);
  step('a v2 scene on the one renderer', Boolean(s0), s0 && { layers: s0.layers.length });
  c.customSize(3840, 2160); c.size('custom'); c.play(true);
  ThreeLab.search.selectLayer('l2'); await wait(300);

  // ---- light, Smooth: left at full resolution ----
  ThreeLab.quality.set('smooth', { quiet: true }); await wait(6000);
  const base = (await st()).pr; const fLight = await rate(3000); const l1 = await st(); const pLight = c.perf();
  step('light scene in Smooth: full resolution kept', Math.abs(l1.pr - base) < 1e-3 && (pLight.quality ?? 1) === 1, { pr: l1.pr, quality: pLight.quality, fps: fLight });

  // ---- how heavy is heavy here: under Force high, the load stepped up until the frame rate falls well under ----
  ThreeLab.quality.set('high', { quiet: true }); await wait(800);
  const prHigh = (await st()).pr;
  let load = 25; let fHeavy = fLight;
  for (let k = 0; k < 9; k += 1) {
    c.setSlider('Load', load); await wait(700); fHeavy = await rate(1800);
    out.log.push({ load, fps: fHeavy });
    if (fHeavy < fLight * 0.45) break;
    load = Math.round(load * 2);
  }
  // (not heavier than that: under ≈ 6 frames a second the Lab takes the preview for stuck and restarts it)
  const s2 = await st();
  step('Force high quality: a heavy scene is slow and nothing is lowered', fHeavy < fLight * 0.6 && Math.abs(s2.pr - prHigh) < 1e-3, { load, fpsLight: fLight, fpsHeavy: fHeavy, pr: s2.pr });

  // ---- heavy, Smooth: the resolution drops, the frame rate recovers ----
  ThreeLab.quality.set('smooth', { quiet: true });
  const dropped = await until(async () => { const s = await st(); return s.pr > 0 && s.pr < base * 0.9 ? s : null; }, 25000, 250);
  // (read while it is lowered) a still taken now is at the scene's full resolution; the stats say the quality
  const full = await pj('window.__labG2.stillPr()');
  const pGov = await until(() => { const p = c.perf(); return p.quality < 1 ? p : null; }, 4000, 200) || c.perf();
  await wait(5000);
  const fGov = await rate(3000); const s3 = await st(); out.heavyInSmooth = { planes: await pj('window.__loadNow'), frames: s3.frames, framesWhenLowered: dropped?.frames, adapt: await pj('window.__labAdapt ? window.__labAdapt.state?.() ?? null : null') };
  step('heavy scene in Smooth: the resolution is lowered', Boolean(dropped) && s3.pr < base * 0.9, { prFull: base, prWhenLowered: dropped?.pr, prNow: s3.pr, canvas: [s3.w, s3.h] });
  step('…and the frame rate recovers', fGov > fHeavy * 1.3, { fpsForcedHigh: fHeavy, fpsSmooth: fGov, fpsLight: fLight });
  step('the stats say it (the quality chip, the AIs\' read-back)', pGov.quality < 1, { quality: pGov.quality, fps: pGov.fps });

  // ---- exact where it must be: a still is at the scene's full resolution; an exported still has its size ----
  step('while lowered, a still / recording draws at the scene\'s full resolution', full && full.now < base * 0.9 && Math.abs(full.still - base) < 1e-3, full);
  await until(() => typeof LabExport !== 'undefined', 30000);
  const still = await LabExport.render({ format: 'still', size: '640x360', at: 0.5 });
  const dim = still?.path ? await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res(null); im.src = `file:///${String(still.path).replace(/\\/g, '/')}`; }) : null;
  step('an exported still has its exact size (the export page never adapts)', dim && dim[0] === 640 && dim[1] === 360, { dim, path: still?.path ? 'written' : still });

  // ---- the load gone: back to full ----
  c.setSlider('Load', 0);
  const back = await until(async () => { const s = await st(); return Math.abs(s.pr - base) < 1e-3 ? s : null; }, 200000, 1000); // (a step at a time, each after a calm while: minutes, not seconds, on purpose)
  const pBack = c.perf();
  step('the load gone: the resolution climbs back to full', Boolean(back), { pr: (await st()).pr, quality: pBack.quality });
  const errs = D().report?.()?.errors || null; const s9 = await st();
  step('no layer error, no frame error', (!errs || !errs.length) && !s9.err && !s9.onepassErr, { errs, err: s9.err });
  ThreeLab.quality.set('high', { quiet: true });
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
