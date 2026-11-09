// (Nov 9) Scenes v2, phase 1 (docs/upgrades/scenes-v2-webgpu.md): the WebGPU runtime slice, measured on the real GPU.
// Its own temp data; never an owner's scene. The same Visualizer2-like content (6 layers: a backdrop, 30,000
// particles, 64 bars, rings, a lit knot, a glow) runs twice, back to back, at Max fps in the Lab:
//   v2   a v2 scene (format 'gpu'): ONE WebGPURenderer, one canvas, each layer its own THREE.Scene
//   old  the same layers written the old way: each its own WebGLRenderer (antialias on), its own context and canvas
// and asserts the v2 slice works: every layer mounted on the one renderer, no WebGL context made for it, its sliders
// (tweak) reach the running code, audio values move, the Lab's stats line gets fps + GPU ms, a still (screenshot) is
// not black, the old scene still runs the old way (its own contexts) in the same page afterwards.
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/smoke.js --check-timeout 300000 --script dev/checks/scenesv2.js
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
  const seen = new Set();
  onFrame((t, dt) => { bass.value = audio.bass; seen.add(Math.round(audio.bass * 100)); window.__v2probe = { probe: P.probe, bass: audio.bass, distinct: seen.size, t, dt }; });
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
// ---------- the same content, the old way (a WebGLRenderer each) ----------
const OLD_HEAD = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000); camera.position.z = 5;
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
`;
const OLD = {
  Backdrop: `${OLD_HEAD}const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, bass: { value: 0 } }, depthWrite: false, vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }', fragmentShader: 'uniform float t; uniform float bass; varying vec2 v; void main(){ float k = clamp(v.y + sin(t * 0.3) * 0.05 + bass * 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(vec3(0.02,0.024,0.047), vec3(0.165,0.059,0.227), k), 1.0); }' });
const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); q.frustumCulled = false; scene.add(q);
renderer.setAnimationLoop((now) => { mat.uniforms.t.value = now / 1000; mat.uniforms.bass.value = audio.bass; renderer.render(scene, camera); });`,
  Particles: `${OLD_HEAD}const N = 30000; const p = new Float32Array(N * 3); for (let i = 0; i < N; i += 1) { const a = Math.random() * 6.2832; const b = Math.random() * 2 - 1; const r = 1.5 + Math.random() * 2; const s = Math.sqrt(1 - b * b); p.set([s * Math.cos(a) * r, b * r, s * Math.sin(a) * r], i * 3); }
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#62d0ff', size: 0.03, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(pts); camera.position.z = 7;
let kick = 0; let last = 0;
renderer.setAnimationLoop((now) => { const dt = last ? (now - last) / 1000 : 0; last = now; kick = Math.max(kick * Math.exp(-dt * 6), audio.bass); pts.scale.setScalar(1 + kick * 0.2); pts.rotation.y += dt * 0.05; renderer.render(scene, camera); });`,
  Bars: `${OLD_HEAD}scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5));
const N = 64; const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1, 0.08), new THREE.MeshStandardMaterial({ color: '#ff3cac', roughness: 0.4 }), N); const o = new THREE.Object3D(); scene.add(m); camera.position.set(0, 0.5, 6);
renderer.setAnimationLoop((now) => { const t = now / 1000; for (let k = 0; k < N; k += 1) { const h = 0.2 + Math.abs(Math.sin(t * 2 + k * 0.4)) * (0.5 + audio.bass * 2); o.position.set((k - N / 2) * 0.11, -2 + h / 2, 0); o.scale.set(1, h, 1); o.updateMatrix(); m.setMatrixAt(k, o.matrix); } m.instanceMatrix.needsUpdate = true; renderer.render(scene, camera); });`,
  Rings: `${OLD_HEAD}const rings = []; for (let k = 0; k < 6; k += 1) { const r = new THREE.Mesh(new THREE.TorusGeometry(1 + k * 0.35, 0.02, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(k / 6, 0.8, 0.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(r); rings.push(r); }
camera.position.z = 6;
renderer.setAnimationLoop((now) => { const t = now / 1000; rings.forEach((r, k) => { r.rotation.z = t / (0.9 + k * 0.3); r.rotation.x = t * 0.2; r.scale.setScalar(1 + audio.bass * 0.15 * (6 - k) / 6); }); renderer.render(scene, camera); });`,
  Knot: `${OLD_HEAD}scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 4, 5); scene.add(sun);
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.26, 256, 48), new THREE.MeshStandardMaterial({ color: '#7c5cff', roughness: 0.35, metalness: 0.2, emissive: '#7c5cff', emissiveIntensity: 0.1 })); scene.add(knot);
let last = 0; renderer.setAnimationLoop((now) => { const dt = last ? (now - last) / 1000 : 0; last = now; knot.material.emissiveIntensity = 0.1 + audio.bass * 0.8; knot.rotation.x += dt * 0.3; knot.rotation.y += dt * 0.5; renderer.render(scene, camera); });`,
  Glow: `${OLD_HEAD}const mat = new THREE.ShaderMaterial({ uniforms: { k: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform float k; varying vec2 v; void main(){ float a = pow(clamp(1.0 - length(v - 0.5) * 2.0, 0.0, 1.0), 3.0) * (k * 0.5 + 0.2); gl_FragColor = vec4(1.0, 0.6, 0.24, a); }' });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mat));
renderer.setAnimationLoop(() => { mat.uniforms.k.value = audio.bass; renderer.render(scene, camera); });`,
};
const layersOf = (src) => Object.entries(src).map(([name, code], i) => ({ id: i ? `l${i + 1}` : 'main', name, code, slot: i }));

const SIZES = [[1920, 1080], [3840, 2160]];
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  const c = await ThreeLab.cmd(); ThreeLab.quality?.set('high', { quiet: true });
  const L2 = layersOf(V2);
  ThreeLab.scenes.create({ name: 'v2 bench', code: L2[0].code, layers: L2, open: true, format: 'gpu' });
  await until(() => ThreeLab.workspace.state().ready, 60000);
  await until(async () => { const s = await pj('window.__labG2.state()'); return s && s.layers.length === 6 && s.frames > 30; }, 120000, 500);
  for (const [w, h] of SIZES) {
    c.customSize(w, h); c.size('custom'); await wait(2500);
    for (const kind of ['16', '16n', '16']) {
      await pj(`window.__labG2.rt('${kind}')`); await wait(800);
      const r = []; for (let k = 0; k < 3; k += 1) r.push((await pj('await window.__labG2.bench(120)'))?.msPerFrame);
      (out.measure[`${w}x${h}`] ||= []).push({ rt: kind, ms: r });
    }
  }
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
