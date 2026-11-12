// (Nov 9) Scenes v2 (docs/upgrades/scenes-v2-webgpu.md): the one renderer's ceiling, measured on the real GPU. Its own
// temp data; never an owner's scene. __labG2.bench: frames of the scene as it is, back to back, until the graphics
// card has finished them → ms a frame (CPU submit + GPU work, nothing else of the page in it).
// (Nov 10, onepass: docs/upgrades/onepass.md) two scenes, 1080p and 4K, each measured four ways in turn (10 rounds, so
// another app on the same GPU weighs on all of them alike; the best round, the least disturbed one, and the median):
//   6 layers    the Visualizer2-like content (a backdrop, 30,000 particles, 64 bars, rings, a lit knot, a glow)
//   20 layers   20 lit rings, a layer each
//   before      as before Nov 10: a pass per plain layer on the picture (__labG2.onepass(false)), each with a GPU
//               timestamp query (__labG2.timing(true))
//   each        a pass per layer, no timestamp queries
//   one         a run of plain layers in one pass, no timestamp queries (the default now)
//   no AA       one pass, no MSAA on the picture (__labG2.rt('16n')): what the antialias itself costs
// On a page without __labG2.onepass (before Nov 10) every way measures the old drawing: the "before" of the round.
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/run-checks.js --exact scenesv2-bench
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };

// ---------- the content: v2 layers ----------
const V2 = {
  Backdrop: `export default ({ THREE, tsl, scene, tweak, audio, onFrame }) => {
  const { mix, screenUV, sin, time, uniform } = tsl;
  const P = tweak({ probe: { value: 1, min: 0, max: 5, label: 'Probe' }, top: '#2a0f3a', bottom: '#05060c' });
  const top = uniform(new THREE.Color(P.top)); const bottom = uniform(new THREE.Color(P.bottom)); const bass = uniform(0);
  scene.backgroundNode = mix(bottom, top, screenUV.y.oneMinus().add(sin(time.mul(0.3)).mul(0.05)).add(bass.mul(0.25)).clamp(0, 1));
  onFrame(() => { bass.value = audio.bass; });
};`,
  Particles: `export default ({ THREE, tsl, scene, camera, audio, onFrame }) => {
  const { uniform, instanceIndex, hash, vec3, sin, cos, time, float, mix, color, uv } = tsl;
  const kick = uniform(0); const i = float(instanceIndex);
  const a = hash(i).mul(6.2832); const b = hash(i.add(7.1)).mul(2).sub(1); const r = hash(i.add(3.3)).mul(2).add(1.5);
  const s = b.mul(b).oneMinus().sqrt();
  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.positionNode = vec3(s.mul(cos(a.add(time.mul(0.05)))), b, s.mul(sin(a.add(time.mul(0.05))))).mul(r.add(kick.mul(0.6)));
  mat.colorNode = mix(color('#62d0ff'), color('#ffffff'), kick.mul(0.5));
  mat.opacityNode = uv().sub(0.5).length().mul(2).oneMinus().clamp(0, 1).pow(2);
  mat.scaleNode = float(0.03);
  const pts = new THREE.Sprite(mat); pts.count = 30000; pts.frustumCulled = false; scene.add(pts);
  camera.position.set(0, 0, 7);
  onFrame((t, dt) => { kick.value = Math.max(kick.value * Math.exp(-dt * 6), audio.bass); pts.rotation.y += dt * 0.05; });
};`,
  Bars: `export default ({ THREE, scene, camera, audio, onFrame }) => {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5));
  const N = 64; const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1, 0.08), new THREE.MeshStandardNodeMaterial({ color: '#ff3cac', roughness: 0.4 }), N);
  const o = new THREE.Object3D(); scene.add(m); camera.position.set(0, 0.5, 6);
  onFrame((t) => { for (let k = 0; k < N; k += 1) { const h = 0.2 + Math.abs(Math.sin(t * 2 + k * 0.4)) * (0.5 + audio.bass * 2); o.position.set((k - N / 2) * 0.11, -2 + h / 2, 0); o.scale.set(1, h, 1); o.updateMatrix(); m.setMatrixAt(k, o.matrix); } m.instanceMatrix.needsUpdate = true; });
};`,
  Rings: `export default ({ THREE, scene, camera, audio, onFrame }) => {
  const rings = []; for (let k = 0; k < 6; k += 1) { const r = new THREE.Mesh(new THREE.TorusGeometry(1 + k * 0.35, 0.02, 8, 128), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color().setHSL(k / 6, 0.8, 0.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(r); rings.push(r); }
  camera.position.z = 6;
  onFrame((t) => { rings.forEach((r, k) => { r.rotation.z = t / (0.9 + k * 0.3); r.rotation.x = t * 0.2; r.scale.setScalar(1 + audio.bass * 0.15 * (6 - k) / 6); }); });
};`,
  Knot: `export default ({ THREE, tsl, scene, camera, audio, onFrame }) => {
  const { uniform, sin, time, positionLocal, normalLocal, color } = tsl;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 4, 5); scene.add(sun);
  const bass = uniform(0); const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.2 });
  mat.colorNode = color('#7c5cff'); mat.emissiveNode = color('#7c5cff').mul(bass.mul(0.8).add(0.1));
  mat.positionNode = positionLocal.add(normalLocal.mul(bass.mul(0.08).mul(sin(positionLocal.x.mul(10).add(time.mul(6))))));
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.26, 256, 48), mat); scene.add(knot); camera.position.z = 5;
  onFrame((t, dt) => { bass.value = audio.bass; knot.rotation.x += dt * 0.3; knot.rotation.y += dt * 0.5; });
};`,
  Glow: `export default ({ THREE, tsl, scene, camera, audio, onFrame }) => {
  const { uv, uniform, color } = tsl;
  const k = uniform(0); const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.colorNode = color('#ff9a3c'); mat.opacityNode = uv().sub(0.5).length().mul(2).oneMinus().clamp(0, 1).pow(3).mul(k.mul(0.5).add(0.2));
  const q = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mat); scene.add(q); camera.position.z = 5;
  onFrame(() => { k.value = audio.bass; });
};`,
};
const N20 = 20;
const ring = (i) => `export default ({ THREE, scene, camera, audio, onFrame }) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 16, 64), new THREE.MeshStandardNodeMaterial({ color: new THREE.Color().setHSL(${i} / ${N20}, 0.8, 0.55) }));
  m.position.set(((${i} % 5) - 2) * 0.9, (Math.floor(${i} / 5) - 1.5) * 0.9, 0); scene.add(m, new THREE.HemisphereLight(0xffffff, 0x223344, 2));
  onFrame((t, dt) => { m.rotation.x += dt; m.rotation.y += dt * 0.7; m.scale.setScalar(1 + audio.bass * 0.3); });
};`;
const named = (list) => list.map(([name, code], i) => ({ id: i ? `l${i + 1}` : 'main', name, code, slot: i }));
const SCENES = [['6 layers', named(Object.entries(V2))], ['20 layers', named(Array.from({ length: N20 }, (_, i) => [`Ring ${i + 1}`, ring(i)]))]];
const SIZES = [[1920, 1080], [3840, 2160]];
const WAYS = [['before', false, '16', true], ['one', true, '16', false], ['each', false, '16', false], ['no AA', true, '16n', false]];
const ROUNDS = 10;
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  const c = await ThreeLab.cmd(); ThreeLab.quality?.set('high', { quiet: true });
  for (const [label, layers] of SCENES) {
    ThreeLab.scenes.create({ name: `v2 bench ${label}`, code: layers[0].code, layers, open: true, format: 'gpu' });
    await until(() => ThreeLab.workspace.state().ready, 60000);
    const st = await until(async () => { const s = await pj('window.__labG2.state()'); return s && s.layers.length === layers.length && s.frames > 30 ? s : null; }, 180000, 500);
    step(`${label}: every layer on the one renderer`, Boolean(st), st ? { layers: st.layers.length, onepass: st.onepass ?? 'not in this page' } : await pj('window.__labG2.state()'));
    for (const [w, h] of SIZES) {
      c.customSize(w, h); c.size('custom'); await wait(2500);
      const rows = WAYS.map(([way]) => ({ way, ms: [], cpu: [], passes: null }));
      let kindNow = null;
      for (let r = 0; r < ROUNDS; r += 1) {
        for (let j = 0; j < WAYS.length; j += 1) {
          const k = (j + r) % WAYS.length; // (each round starts with another way: none is always the one measured after a change of targets)
          const [, one, kind, ts] = WAYS[k];
          await pj(`(window.__labG2.onepass ? window.__labG2.onepass(${one}) : null, window.__labG2.timing(${ts}))`);
          if (kind !== kindNow) { kindNow = kind; await pj(`window.__labG2.rt('${kind}')`); await wait(600); await pj('await window.__labG2.bench(20)'); } // (the picture's targets made again only when their kind changes, and warmed)
          await wait(200);
          const b = await pj('await window.__labG2.bench(60)');
          rows[k].ms.push(b?.msPerFrame); if (b?.cpuMs != null) rows[k].cpu.push(b.cpuMs); rows[k].passes = b?.passes ?? null; rows[k].px = b?.px;
        }
      }
      for (const x of rows) { x.median = med(x.ms); x.best = Math.min(...x.ms.filter((v) => Number.isFinite(v))); x.cpuMedian = med(x.cpu); }
      out.measure[`${label} ${w}x${h}`] = rows;
      step(`${label} ${w}x${h}: measured`, rows.every((x) => x.median > 0), rows.map((x) => `${x.way} ${x.best} ms (median ${x.median}${x.cpuMedian == null ? '' : `, of it the page ${x.cpuMedian}`})${x.passes == null ? '' : ` · ${x.passes} passes`}`).join(' · '));
    }
    await pj(`(window.__labG2.onepass ? window.__labG2.onepass(true) : null, window.__labG2.timing(false), window.__labG2.rt('16'))`);
  }
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
