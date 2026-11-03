// (round 90, labcompile90) What still made a frame stick in the Lab preview after round 89: shader programs first made
// WHILE a scene runs, and big pictures sent to the graphics card in one piece. Every frame of the preview is kept
// (window.__labHitch in tools/three-sandbox.html), now with the compiles / links made INSIDE a frame callback, the ms
// waited on a program there, and the biggest single upload of pixels (in a frame or not). Stretches:
//   runtime:mats    new meshes with new materials added to a running scene (scene.add)
//   runtime:swap    a running mesh given a new material (made then, never drawn)
//   runtime:light   a point light added (every lit material needs a new program)
//   runtime:glass   a glass sphere added (transmission: three draws the scene once more into a buffer, with other
//                   shader variants of every opaque material)
//   glass:shown     a scene whose glass is hidden at the start and shown after a second (the precompile at the start
//                   now covers the glass variants)
//   texture         two 4096² pictures arriving in a running scene (in slices: the biggest single upload)
// Per stretch: compiles / links inside frames that drew on screen (the number this round moves to 0), all compiles,
// the frames the new thing waited (held / hidden, window.__labCompile), the biggest upload, and the hitches over 2× the
// frame budget, each judged on CPU as in labfps89 (round 88's rule: smoke trace `tasks`): the app's when the preview's
// own CPU is over the hitch budget, or a compile / big upload landed inside a frame on screen; else can't tell (load),
// listed in cantTell and not failing the check. No wall-time budget.
// Budgets: 0 compiles inside frames on screen in every runtime stretch and glass:shown; each new thing shown within
// LC90_HOLD (12) frames; a 4K picture never uploaded in one piece (biggest single upload ≤ 4.2 MP, ≥ 4 slices each,
// none inside a frame); app-judged hitches ≤ LC90_HITCH (1) a stretch.
// (round 91, labshadow91) more stretches, same rules: light:off / light:on / light:remove / light:readd, shadow:light /
// shadow:caster (a scene with shadow maps), scene2 (a second scene for the same renderer), inrender (materials made
// in three's render), reload (a 4K picture changed on disk while shown: in slices, the new picture read back).
// (round 101, modelcompile101) layer:plain / layer:model / layer:heavy: a new layer added to a scene on screen (a small
// lit scene, a 🧊 model layer, a shader-heavy layer): 0 compiles inside frames on screen, its programs made in the gaps
// after frames (window.__labWarmGap); LC90_WG = 'off' runs them with round 89's rule (the "before").
// (round 109, labchecks109) layer:real: a new layer started in realscene-lib's real scene (several layers and frame
// loops, a model, ⚡ triggers, ✦ Bloom, its song playing) on a faked 240 Hz screen: the layer rules, and no runaway.
// window.LC90_REPORT = 1 only reports (for a base without this round); LC90_ONLY = 'runtime,glass,texture,light,
// inrender,scene2,shadow,reload,layer' (reload needs texture).
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/labcompile90.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, every = 120) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return false; };
const out = { stretches: {}, steps: [], cantTell: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok) || Boolean(window.LC90_REPORT), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 180000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };
const only = String(window.LC90_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-labcompile90`;
const HITCH = Number(window.LC90_HITCH ?? 1);
const HOLD = Number(window.LC90_HOLD ?? 12);
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
const sum = (a) => (a || []).reduce((x, y) => x + y, 0);

await RS.install(); // (round 109) the switchable fake screen in the preview's page: the real screen's frames until layer:real
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
const c = await ThreeLab.cmd(); const D = ThreeLab.director;
await wait(600);
try { c.customSize(480, 270); c.size('custom'); } catch (err) { step('frame size', false, String(err)); }
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(500); } return r; };
const ready = async (n = 1) => until(async () => { const v = await sbx('return window.__labPace.state().frameTick'); return typeof v === 'number' && v > n; }, 30000);

// ---------- one stretch (as labfps89's, judged on CPU; compiles counted inside the frames) ----------
async function record(name, during, { ms = 3000, pre = 300 } = {}) {
  await sbx('return window.__labHitch ? 1 : 0').then((v) => { if (v !== 1) throw new Error('no window.__labHitch in the preview'); });
  let traced = false;
  try { await smoke({ trace: 'start', tasks: true }); traced = true; } catch { /* judged on wall time */ }
  await sbx("performance.mark('labcompile90'); return window.__labHitch.start()");
  await wait(pre);
  const t0 = performance.now();
  const info = await during();
  const left = ms - (performance.now() - t0); if (left > 0) await wait(left);
  const raw = await sbx('return window.__labHitch.stop()');
  const f = typeof raw === 'string' ? JSON.parse(raw) : null;
  if (!f) { if (traced) await smoke({ trace: 'stop', tasks: { budget: 1e9 } }).catch(() => {}); throw new Error(`${name}: no frames from the preview (${JSON.stringify(raw)?.slice(0, 200)})`); }
  // (a base without this round's recorder: every compile of a frame's span counts as inside it, as labfps89 counted)
  const inF = f.compilesInFrame || f.compiles;
  const gaps = f.gap.slice(1).filter((g) => g > 0);
  const budget = Math.max(f.cap ? 1000 / f.cap : 1000 / 60, pct(gaps, 0.5) || 0);
  const vis = (i) => f.drew[i] === 1 || f.drew[i] === 3;
  let t = 0; const hitches = [];
  for (let i = 1; i < f.n; i++) { const g = f.gap[i]; if (g > 2 * budget) hitches.push({ i, at: r1(t), ms: g }); t += g; }
  let visIn = 0; let visFrames = 0; let waitIn = 0;
  for (let i = 0; i < f.n; i++) if (vis(i) && inF[i]) { visIn += inF[i]; visFrames += 1; waitIn += (f.waitInFrame || f.waitMs)[i] || 0; }
  let judged = null;
  if (traced) {
    try { judged = await smoke({ trace: 'stop', tasks: { budget: 2 * budget, min: 0, mark: 'labcompile90', observed: hitches.map((h) => ({ at: h.at, ms: h.ms })) } }); } catch (err) { judged = { verdict: 'unknown', why: String(err).slice(0, 200) }; }
  }
  const bigIn = f.bigUpInFrame || f.upMPframe;
  // (round 96, checkfix96: labflake95's rule from labfps89) one compile frame / in-frame upload explains ONE late frame:
  // the frame it fell in or, when that one wasn't late, the next. A setup frame's compiles were counted for two
  // neighbouring late frames (the frame itself, then the next while the software GPU caught up): one setup, "2 hitches
  // judged the app's". The second late frame is judged on its own (CPU, else load). An upload inside a frame is a
  // verdict of its own (upload) and always counts (it shared 'compile', so the texture stretch's setup allowance hid it).
  const blamed = new Set();
  const cause = (j, pick) => (j >= 0 && !blamed.has(j) && pick(j) ? j : -1);
  const isC = (j) => vis(j) && inF[j] > 0; const isU = (j) => bigIn[j] >= 1;
  for (const h of hitches) {
    const tk = judged?.tasks?.find((x) => Math.abs(x.at - h.at) < 0.6 && Math.abs(x.ms - r1(h.ms)) < 0.6);
    h.cpuMs = tk?.cpuMs ?? null;
    const i = h.i;
    const jc = cause(i, isC) >= 0 ? i : cause(i - 1, isC);
    const ju = cause(i, isU) >= 0 ? i : cause(i - 1, isU);
    if (!judged || !Array.isArray(judged.tasks)) h.judged = 'wall';
    else if (h.cpuMs != null && h.cpuMs > 2 * budget) { h.judged = 'over'; h.why = `${h.cpuMs} ms of the preview's own CPU`; }
    else if (ju >= 0) { blamed.add(ju); h.judged = 'upload'; h.why = `a big picture (${r1(bigIn[ju])} MP) uploaded inside frame ${ju}`; }
    else if (jc >= 0) { blamed.add(jc); h.judged = 'compile'; h.why = `${inF[jc]} shader compiles / links inside frame ${jc}, on screen`; }
    else { h.judged = 'load'; h.why = `${h.cpuMs ?? 0} ms of the preview's CPU; the rest off the CPU (the thread waited ${judged.runDelayMs ?? '?'} ms for a CPU over the run, the rest for the GPU process)`; }
  }
  const load = hitches.filter((h) => h.judged === 'load');
  const s = {
    frames: f.n, budget: r1(budget), p50: pct(gaps, 0.5), p99: pct(gaps, 0.99), max: r1(Math.max(0, ...gaps)),
    compiles: sum(f.compiles), compilesInFrames: sum(inF), visibleInFrameCompiles: visIn, visibleCompileFrames: visFrames, waitInFramesMs: r1(waitIn), compileWaitMs: r1(sum(f.waitMs)),
    biggestUploadMP: r1(Math.max(0, ...(f.bigUp || f.upMP))), biggestInFrameMP: r1(Math.max(0, ...bigIn)), bigMPinFrames: r1(sum(f.upMPframe)),
    over2x: hitches.length, over2xApp: hitches.length - load.length, over2xCpu: hitches.filter((h) => h.judged === 'over' || h.judged === 'wall').length, over2xCompile: hitches.filter((h) => h.judged === 'compile').length, over2xUpload: hitches.filter((h) => h.judged === 'upload').length /* (round 96) */, over2xLoad: load.length,
    lc: f.lc, slices: f.slices, up: f.up, khr: f.khr, runDelayMs: judged?.runDelayMs ?? null,
    hitches: hitches.slice().sort((a, b) => b.ms - a.ms).slice(0, 4).map((h) => ({ at: h.at, ms: r1(h.ms), cpuMs: h.cpuMs, judged: h.judged, why: h.why })),
    ...(info && typeof info === 'object' ? { info } : {}),
  };
  for (const h of load) out.cantTell.push(`${name}: a ${r1(h.ms)} ms frame (${h.why || h.judged})`);
  out.stretches[name] = s;
  return s;
}
const lcState = () => sbx('return window.__labCompile ? window.__labCompile.state() : null');

// ---------- a running scene, then new things in it ----------
const SCENE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#151820');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 1, 6); camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight('#9cf', '#321', 1.2)); const sun = new THREE.DirectionalLight('#fff', 2); sun.position.set(3, 5, 2); scene.add(sun);
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16), new THREE.MeshStandardMaterial({ color: '#7ad', roughness: 0.4 })); scene.add(knot);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: '#334', roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; scene.add(floor);
const glass = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 24), new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.05, thickness: 0.6, ior: 1.5 })); glass.position.set(1.8, 0.4, 1); glass.visible = __GLASS__; scene.add(glass);
const group = new THREE.Group(); scene.add(group);
window.__lc90 = {
  mats() {
    const mk = [() => new THREE.MeshPhysicalMaterial({ color: '#e5a', clearcoat: 1, sheen: 1, roughness: 0.3 }), () => new THREE.MeshToonMaterial({ color: '#5e8' }), () => new THREE.MeshLambertMaterial({ color: '#fd4', emissive: '#210' }),
      () => new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform float t; void main() { gl_FragColor = vec4(0.4, 0.8, 1.0, 1.0); }' })];
    mk.forEach((f, i) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 3), f()); m.position.set(-2.4 + i * 1.6, -1.1, 0.5); group.add(m); });
    return performance.now();
  },
  swap() { knot.material = new THREE.MeshPhongMaterial({ color: '#fa4', shininess: 80, specular: '#fff' }); return performance.now(); },
  light() { const p = new THREE.PointLight('#f80', 6, 20); p.position.set(-2, 2, 2); scene.add(p); return performance.now(); },
  glass() { const g = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 24), new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.1, thickness: 0.5, ior: 1.4, color: '#cef' })); g.position.set(-1.8, 0.5, 1); scene.add(g); return performance.now(); },
  show() { glass.visible = true; return performance.now(); },
};
renderer.setAnimationLoop((t) => { knot.rotation.y = t / 1500; group.rotation.y = t / 3000; renderer.render(scene, camera); });`;

if (want('runtime')) await safe('runtime', async () => {
  await D.newSketch('labcompile90 runtime', SCENE.replace('__GLASS__', 'false').replace('glass.visible = false; scene.add(glass);', ''), 1); // (no glass at the start: the first glass comes mid-scene)
  await ready(); await wait(2500);
  for (const k of ['mats', 'swap', 'light', 'glass']) {
    const s0 = await lcState();
    await record(`runtime:${k}`, async () => ({ at: await sbx(`return window.__lc90.${k}()`) }), { ms: 2600 });
    const s1 = await lcState();
    if (s1) out.stretches[`runtime:${k}`].lcDelta = Object.fromEntries(Object.keys(s1).filter((x) => typeof s1[x] === 'number').map((x) => [x, r1(s1[x] - (s0?.[x] || 0))]));
    await wait(600);
  }
});

if (want('glass')) await safe('glass', async () => {
  await D.newSketch('labcompile90 glass', SCENE.replace('__GLASS__', 'false'), 1);
  await ready(); await wait(2500);
  await record('glass:shown', async () => ({ at: await sbx('return window.__lc90.show()') }), { ms: 2500 });
});

// ---------- (round 101, modelcompile101) a new layer's first frame, added to a scene on screen ----------
// layer:plain   a small lit scene added as a layer on top of the running one
// layer:model   a 🧊 model layer (ThreeModels.add of a small .gltf: its lights, shadow ground, then the model)
// layer:heavy   a shader-heavy layer: 12 kinds of material, glass, shadow maps (more programs than one gap holds)
// Without background compiling, round 89 compiled each one's first scene inside its first frame, while the scene under
// it was moving. Now the layer is held and its programs are made in the gaps after frames (window.__labWarmGap).
// Per stretch: compiles inside frames on screen (0), the frames / ms the layer waited, the gaps it took, and that it
// drew. window.LC90_WG = 'off' runs them with the old rule (the "before").
const LAYER_PLAIN = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6);
scene.add(new THREE.HemisphereLight('#fff', '#334', 1.5)); const d = new THREE.DirectionalLight('#fff', 2); d.position.set(2, 3, 4); scene.add(d);
const a = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: '#f84', roughness: 0.5 })); a.position.set(-1.5, 1, 0); scene.add(a);
const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshPhongMaterial({ color: '#4cf' })); b.position.set(1.5, 1, 0); scene.add(b);
renderer.setAnimationLoop((t) => { a.rotation.y = t / 900; renderer.render(scene, camera); });`;
const LAYER_HEAVY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 1.5, 7); camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight('#cdf', '#321', 1)); const sp = new THREE.SpotLight('#fff', 40, 30, 0.7, 0.3); sp.position.set(2, 6, 4); sp.castShadow = true; sp.shadow.mapSize.set(512, 512); scene.add(sp);
const pl = new THREE.PointLight('#f80', 5, 20); pl.position.set(-3, 2, 2); scene.add(pl);
const frag = (c) => 'uniform float t; varying vec2 vUv; void main() { gl_FragColor = vec4(' + c + ', 1.0); }';
const vert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const mats = [new THREE.MeshStandardMaterial({ color: '#7ad', roughness: 0.4 }), new THREE.MeshPhysicalMaterial({ color: '#e5a', clearcoat: 1, sheen: 1 }), new THREE.MeshPhysicalMaterial({ color: '#8cf', iridescence: 1, metalness: 0.6 }),
  new THREE.MeshToonMaterial({ color: '#5e8' }), new THREE.MeshLambertMaterial({ color: '#fd4', emissive: '#210' }), new THREE.MeshPhongMaterial({ color: '#ad6', flatShading: true }), new THREE.MeshMatcapMaterial({ color: '#fc8' }), new THREE.MeshNormalMaterial(),
  new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: vert, fragmentShader: frag('vUv, 0.5') }), new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: vert, fragmentShader: frag('0.5 + 0.5 * sin(vUv.x * 40.0 + t), vUv.y, 0.3') }),
  new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: vert, fragmentShader: frag('fract(vUv * 8.0), 0.8') }), new THREE.MeshStandardMaterial({ color: '#c96', metalness: 0.8, roughness: 0.2, wireframe: true })];
const g = new THREE.Group(); scene.add(g);
mats.forEach((m, i) => { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 2), m); o.position.set(-2.75 + (i % 6) * 1.1, i < 6 ? 0.6 : -0.5, 0); o.castShadow = true; g.add(o); });
const glass = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.05, thickness: 0.5 })); glass.position.set(0, 1.6, 1); scene.add(glass);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: '#334', roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; floor.receiveShadow = true; scene.add(floor);
renderer.setAnimationLoop((t) => { g.rotation.y = t / 4000; for (const m of mats) if (m.uniforms) m.uniforms.t.value = t / 1000; renderer.render(scene, camera); });`;
// a small .gltf (a cube, its buffer inside as a data: URI, no pictures)
const gltfCube = () => {
  const P = []; const N = []; const I = [];
  for (const [ax, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const b = P.length / 3; const u = (ax + 1) % 3; const v = (ax + 2) % 3;
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [0, 0, 0]; p[ax] = 0.5 * s; p[u] = 0.5 * a * s; p[v] = 0.5 * c; P.push(...p); const n = [0, 0, 0]; n[ax] = s; N.push(...n); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const p = new Float32Array(P); const n = new Float32Array(N); const i = new Uint16Array(I);
  const bin = new Uint8Array(p.byteLength + n.byteLength + i.byteLength); bin.set(new Uint8Array(p.buffer), 0); bin.set(new Uint8Array(n.buffer), p.byteLength); bin.set(new Uint8Array(i.buffer), p.byteLength + n.byteLength);
  let s = ''; for (const x of bin) s += String.fromCharCode(x);
  return JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.5, 0.2, 1], metallicFactor: 0.2, roughnessFactor: 0.5 } }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' }, { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: p.byteLength }, { buffer: 0, byteOffset: p.byteLength, byteLength: n.byteLength }, { buffer: 0, byteOffset: p.byteLength + n.byteLength, byteLength: i.byteLength }],
    buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${btoa(s)}` }] });
};
const wgState = () => sbx('return window.__labWarmGap ? window.__labWarmGap.state() : null');
// the layer drew (its renderer's frame count) and its renderer no longer held
const drewOf = (name) => `const e = window.__scenes[${JSON.stringify(name)}]; const r = e && e.renderer; return r ? JSON.stringify({ frames: r.info.render.frame, warm: r.__warm === true, programs: r.info.programs.length }) : null;`;
if (want('layer')) await safe('layer', async () => {
  const wgMode = await sbx(`return window.__labWarmGap ? window.__labWarmGap.mode(${JSON.stringify(String(window.LC90_WG || 'auto'))}) : 'none'`);
  await D.newSketch('modelcompile101 layers', SCENE.replace('__GLASS__', 'false').replace('glass.visible = false; scene.add(glass);', ''), 1);
  await ready(); await wait(2500);
  await sbx(`return window.__labWarmGap ? window.__labWarmGap.mode(${JSON.stringify(String(window.LC90_WG || 'auto'))}) : 'none'`);
  const one = async (key, add, nameOf, ms) => {
    const w0 = await wgState(); let name = null; let drew = null;
    await record(key, async () => {
      name = await add();
      drew = await until(async () => { const v = await sbx(drewOf(name)); const j = typeof v === 'string' ? JSON.parse(v) : null; return j && j.frames > 0 && j.warm ? j : null; }, 20000, 100);
      return { layer: name };
    }, { ms });
    const w1 = await wgState();
    out.stretches[key].wg = w1 && { mode: wgMode, held: w1.held - (w0?.held || 0), oldRule: w1.oldRule - (w0?.oldRule || 0), gaps: w1.gaps - (w0?.gaps || 0), programs: w1.programs - (w0?.programs || 0), again: w1.again - (w0?.again || 0), late: w1.late - (w0?.late || 0), hold: w1.last, glass: w1.glass - (w0?.glass || 0), shadows: w1.shadows - (w0?.shadows || 0) };
    out.stretches[key].drew = drew || null;
    await wait(500);
    await D.removeLayer(nameOf(name)).catch(() => {});
    await wait(800);
  };
  await one('layer:plain', async () => { await D.addLayer({ name: 'Plain layer', code: LAYER_PLAIN }, 0); return 'Plain layer'; }, (n) => n, 3000);
  await one('layer:heavy', async () => { await D.addLayer({ name: 'Heavy layer', code: LAYER_HEAVY }, 0); return 'Heavy layer'; }, (n) => n, 6000);
  if (typeof ThreeModels !== 'undefined' || await until(() => typeof ThreeModels !== 'undefined', 20000)) {
    await window.hub.fs.write(`${DIR}/cube101/cube.gltf`, gltfCube());
    let layerId = null;
    await one('layer:model', async () => {
      const res = await ThreeModels.add(`${DIR}/cube101/cube.gltf`, { name: 'cube101' });
      layerId = res.layer;
      await until(async () => { const l = await sbx('return JSON.stringify((globalThis.lab3d?.list() || []).find((x) => x.name === \'cube101\') || null)'); const v = typeof l === 'string' ? JSON.parse(l) : null; return v && (v.loaded || v.error); }, 30000, 200);
      return res.layer;
    }, (n) => n, 4000);
    const r = D.refs.list().find((y) => y.key === 'cube101' || /cube101/.test(y.path || '')); if (r) D.refs.remove(r);
    void layerId;
  } else step('layer:model', false, 'no ThreeModels');
});

// ---------- (round 109, labchecks109) layer:real: a new layer started in realscene-lib's real scene, 240 Hz ----------
// The owner's kind of scene (several layers and frame loops, a 🧊 model with its picture, ✦ Bloom, a song with ⚡
// triggers playing) on a faked 240 Hz screen (the frame gate on), and a new layer started in it: the same rules as the
// other layer:* stretches (0 compiles inside frames on screen, programs made in the gaps after frames), and no runaway
// while it starts (RS.problems: frame callbacks per page frame and a second, the guard never tripped, no graphics
// context lost)
if (want('layer') || want('real')) await safe('layer:real', async () => {
  const info = await RS.open();
  step('layer:real: the scene is up (5 layers, the model loaded, the song analysed)', info.layers.length >= 5 && info.model?.loaded && info.song, info);
  step('layer:real: the fake screen is in the page (switchable)', info.probe?.switchable === true, info.probe);
  await sbx(`return window.__labWarmGap ? window.__labWarmGap.mode(${JSON.stringify(String(window.LC90_WG || 'auto'))}) : 'none'`);
  await RS.hz(240); await wait(3000);
  const w0 = await wgState(); let drew = null; let w = null;
  await record('layer:real', async () => {
    const watching = RS.watch(6000);
    await D.addLayer({ name: 'Plain layer', code: LAYER_PLAIN }, 0);
    drew = await until(async () => { const v = await sbx(drewOf('Plain layer')); const j = typeof v === 'string' ? JSON.parse(v) : null; return j && j.frames > 0 && j.warm ? j : null; }, 20000, 100);
    w = await watching;
    return { layer: 'Plain layer' };
  }, { ms: 6000 });
  const w1 = await wgState();
  out.stretches['layer:real'].wg = w1 && { mode: String(window.LC90_WG || 'auto'), held: w1.held - (w0?.held || 0), oldRule: w1.oldRule - (w0?.oldRule || 0), gaps: w1.gaps - (w0?.gaps || 0), programs: w1.programs - (w0?.programs || 0), again: w1.again - (w0?.again || 0), late: w1.late - (w0?.late || 0), hold: w1.last };
  out.stretches['layer:real'].drew = drew || null;
  out.real = w;
  const p = RS.problems(w, 'layer:real');
  step('layer:real: no runaway while the layer starts, the guard never tripped, no graphics context lost', !p.length, { problems: p, perFrame: w?.perFrame, page: w?.page, guard: w?.guard, loops: w?.loops });
  await D.removeLayer('Plain layer').catch(() => {});
  await RS.hz(0); await RS.close();
  await wait(800);
}, 300000);

// ---------- two 4096² pictures arriving in a running scene ----------
const png = async (n, hue) => { const cv = new OffscreenCanvas(n, n); const g = cv.getContext('2d'); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = `hsl(${(hue + x * 11 + y * 7) % 360} 50% ${(x + y) % 2 ? 30 : 45}%)`; g.fillRect((x * n) / 32, (y * n) / 32, n / 32, n / 32); } return new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
if (want('texture')) await safe('texture', async () => {
  await window.hub.fs.write(`${DIR}/big0.png`, await png(4096, 40));
  await window.hub.fs.write(`${DIR}/big1.png`, await png(4096, 220));
  await D.newSketch('labcompile90 texture', SCENE.replace('__GLASS__', 'false'), 1);
  await ready(); await wait(1500);
  for (const k of ['big0', 'big1']) await D.refs.add(`${DIR}/${k}.png`, k);
  await wait(800);
  const TEX = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const a = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: refTexture('big0') })); a.position.x = -1; scene.add(a);
const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: refTexture('big1') })); b.position.x = 1; scene.add(b);
renderer.setAnimationLoop((t) => { a.rotation.z = t / 3000; b.rotation.z = -t / 3000; renderer.render(scene, camera); });`;
  await record('texture', async () => { await D.addLayer({ name: 'Big pictures', code: TEX }, 0); return null; }, { ms: 6000 });
  // the picture is really there once its slices are in: the left picture's own texture on the graphics card, one texel
  // read back (not the empty texture's black), and three's record of it up to date (nothing left to upload)
  await until(async () => { const u = await sbx('return window.__labUploads()'); return u && !u.waiting && !(u.slices?.active); }, 30000);
  out.stretches.texture.pixel = await sbx(`const e = window.__scenes['Big pictures']; if (!e) return 'no layer';
const r = e.renderer; let tex = null; e.scene.traverse((o) => { if (!tex && o.material?.map) tex = o.material.map; });
const p = tex && r.properties.get(tex); if (!p?.__webglTexture) return 'not on the graphics card';
if (p.__version !== tex.version) return 'still to upload';
const gl = r.getContext(); const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, p.__webglTexture, 0);
const px = new Uint8Array(4); gl.readPixels(100, 3000, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); r.resetState(); return Array.from(px);`);
});

// ---------- (round 91, labshadow91) what round 90 still compiled in the frame that needed it ----------
// light:first               a light hidden from the start shown (its programs never made)
// light:off / light:on      the sun hidden, then shown again (every lit material's program changes with the count)
// light:remove / light:readd a point light taken out of the scene, then put back
// shadow:light              a scene with shadow maps on gets its first shadow-casting light (three's own depth materials)
// shadow:caster             a new kind of caster (instanced, new material) added to a scene with a shadow light
// scene2                    the same renderer starts drawing a second scene (a menu → level switch)
// inrender                  materials made inside three's render (a mesh's onBeforeRender swaps its material)
// reload                    a 4K picture changed on disk while it's shown (round 42's reload): in slices too
const LIGHTS = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
__SHADOWS__
const scene = new THREE.Scene(); scene.background = new THREE.Color('#151820');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 1, 6); camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight('#9cf', '#321', 1.2)); const sun = new THREE.DirectionalLight('#fff', 2); sun.position.set(3, 5, 2); scene.add(sun);
const pl = new THREE.PointLight('#f80', 6, 20); pl.position.set(-2, 2, 2); scene.add(pl);
const rim = new THREE.SpotLight('#9cf', 20, 20, 0.6); rim.position.set(2, 3, -2); rim.visible = false; scene.add(rim); // (hidden from the start: its programs never made)
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16), new THREE.MeshStandardMaterial({ color: '#7ad', roughness: 0.4 })); knot.castShadow = true; scene.add(knot);
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshPhongMaterial({ color: '#e5a' })); ball.position.set(-2, -0.5, 0.5); ball.castShadow = true; scene.add(ball);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshLambertMaterial({ color: '#334' })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; floor.receiveShadow = true; scene.add(floor);
let want = 0;
knot.onBeforeRender = () => { if (want) { want = 0; knot.material = new THREE.MeshToonMaterial({ color: '#5e8' }); ball.material = new THREE.MeshPhysicalMaterial({ color: '#fd4', clearcoat: 1 }); } };
// a second scene for the same renderer (its own materials: none of them drawn yet)
const scene2 = new THREE.Scene(); scene2.background = new THREE.Color('#201518');
scene2.add(new THREE.AmbientLight('#fff', 0.4)); const s2 = new THREE.SpotLight('#fff', 30, 20, 0.6); s2.position.set(0, 4, 3); scene2.add(s2);
for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 2), [new THREE.MeshPhysicalMaterial({ color: '#8cf', sheen: 1 }), new THREE.MeshMatcapMaterial({ color: '#fc8' }), new THREE.MeshNormalMaterial(), new THREE.MeshPhongMaterial({ color: '#ad6', flatShading: true })][i]); m.position.x = -1.8 + i * 1.2; scene2.add(m); }
let cur = scene;
window.__lc91 = {
  first() { rim.visible = true; return performance.now(); },
  off() { sun.visible = false; return performance.now(); },
  on() { sun.visible = true; return performance.now(); },
  remove() { scene.remove(pl); return performance.now(); },
  readd() { scene.add(pl); return performance.now(); },
  spot() { const s = new THREE.SpotLight('#fff', 40, 20, 0.5, 0.3); s.position.set(1, 5, 3); s.castShadow = true; s.shadow.mapSize.set(512, 512); scene.add(s); return performance.now(); },
  caster() { const g = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: '#c96', metalness: 0.3 }), 12); const m = new THREE.Matrix4(); for (let i = 0; i < 12; i++) g.setMatrixAt(i, m.makeTranslation(-2.5 + i * 0.45, -1.2, -0.5)); g.castShadow = true; scene.add(g); return performance.now(); },
  inrender() { want = 1; return performance.now(); },
  scene2() { cur = scene2; return performance.now(); },
};
renderer.setAnimationLoop((t) => { knot.rotation.y = t / 1500; scene2.rotation.y = t / 3000; renderer.render(cur, camera); });`;
const SHADOWS_ON = 'renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;';
const lc91 = async (name, k, ms = 2600) => {
  const s0 = await lcState();
  await record(name, async () => ({ at: await sbx(`return window.__lc91.${k}()`) }), { ms });
  const s1 = await lcState();
  if (s1) out.stretches[name].lcDelta = Object.fromEntries(Object.keys(s1).filter((x) => typeof s1[x] === 'number').map((x) => [x, r1(s1[x] - (s0?.[x] || 0))]));
  await wait(600);
};
if (want('light')) await safe('light', async () => {
  await D.newSketch('labshadow91 lights', LIGHTS.replace('__SHADOWS__', ''), 1);
  await ready(); await wait(2500);
  for (const [n, k] of [['light:first', 'first'], ['light:off', 'off'], ['light:on', 'on'], ['light:remove', 'remove'], ['light:readd', 'readd']]) await lc91(n, k);
});
if (want('inrender')) await safe('inrender', async () => {
  await D.newSketch('labshadow91 inrender', LIGHTS.replace('__SHADOWS__', ''), 1);
  await ready(); await wait(2500);
  await lc91('inrender', 'inrender');
});
if (want('scene2')) await safe('scene2', async () => {
  await D.newSketch('labshadow91 scene2', LIGHTS.replace('__SHADOWS__', ''), 1);
  await ready(); await wait(2500);
  await lc91('scene2', 'scene2');
});
if (want('shadow')) await safe('shadow', async () => {
  await D.newSketch('labshadow91 shadows', LIGHTS.replace('__SHADOWS__', SHADOWS_ON), 1);
  await ready(); await wait(2500);
  await lc91('shadow:light', 'spot', 3000);
  await lc91('shadow:caster', 'caster', 3000);
});
// a 4K picture shown, then changed on disk (the texture stretch's layer: its left picture reloaded)
if (want('reload') && want('texture') && out.stretches.texture) await safe('reload', async () => {
  await window.hub.fs.write(`${DIR}/big2.png`, await png(4096, 130));
  const texel = `const e = window.__scenes['Big pictures']; if (!e) return 'no layer';
const r = e.renderer; let tex = null; e.scene.traverse((o) => { if (!tex && o.material?.map) tex = o.material.map; });
const p = tex && r.properties.get(tex); if (!p?.__webglTexture) return 'not on the graphics card';
if (p.__version !== tex.version) return 'still to upload';
const gl = r.getContext(); const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, p.__webglTexture, 0);
const px = new Uint8Array(4); gl.readPixels(100, 3000, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); r.resetState(); return Array.from(px);`;
  // (in a long run the Lab can be on another scene by now: the texture stretch's scene opened again, its pictures in)
  if (!((await D.refs.list()) || []).some((x) => x.key === 'big0')) {
    try { c.openSketch('labcompile90 texture'); } catch { /* the lookup below says */ }
    await wait(1500); await ready();
    await until(async () => Array.isArray(await sbx(texel)), 30000);
    await until(async () => { const u = await sbx('return window.__labUploads()'); return u && !u.waiting && !(u.slices?.active); }, 30000);
    await wait(800);
  }
  const before = await sbx(texel);
  const mine = await D.refs.list(); const every = Object.values((await D.refs.all()) || {}).flat();
  const ref = (mine || []).find((x) => x.key === 'big0') || every.filter((x) => x.key === 'big0').at(-1);
  if (!ref) throw new Error(`no big0 reference (${JSON.stringify((mine || []).map((x) => x.key))}, ${every.length} in all)`);
  const u0 = await sbx('return window.__refUpdates || 0');
  await record('reload', async () => { const r = await D.refs.reload(ref.id, { from: `${DIR}/big2.png` }); return { reload: r }; }, { ms: 6000 });
  if (!out.stretches.reload.info?.reload?.inPlace) throw new Error(`the reference wasn't reloaded in place: ${JSON.stringify(out.stretches.reload.info)} (this scene's: ${JSON.stringify((mine || []).map((x) => [x.key, x.id]))}; big0 in all: ${JSON.stringify(Object.entries((await D.refs.all()) || {}).map(([s, l]) => [s, l.map((x) => x.key)]))}; the scene: ${D.sketchId?.() ?? '?'}; picked ${ref.id})`);
  await until(async () => { const u = await sbx('return [window.__refUpdates || 0, window.__labUploads()]'); return u[0] > u0 && !u[1].waiting && !(u[1].slices?.active); }, 30000);
  await wait(400);
  const after = await sbx(texel);
  out.stretches.reload.pixel = { before, after };
});

// ---------- verdicts ----------
const S = out.stretches;
for (const [k, s] of Object.entries(S).filter(([n]) => /^(runtime|glass|light|shadow|layer):|^(scene2|inrender)$/.test(n))) {
  step(`${k}: no shader compile inside a frame on screen (made in the gap after a frame${s.khr ? ', compiled in the background' : ''})`, s.visibleInFrameCompiles === 0, { inFrames: s.visibleInFrameCompiles, frames: s.visibleCompileFrames, all: s.compiles, waitInFramesMs: s.waitInFramesMs, lc: s.lcDelta });
  if (s.lcDelta && /^(runtime|light|shadow):|^(scene2|inrender)$/.test(k)) step(`${k}: the new thing waited ≤ ${HOLD} frames before it showed`, (s.lc?.maxWait ?? 0) <= HOLD && (s.lcDelta.pending ?? 0) >= 0, { maxWait: s.lc?.maxWait, lc: s.lcDelta });
}
// (round 101) a new layer: drawn, from its programs made in gaps (not its first frame), within the stretch
for (const [k, s] of Object.entries(S).filter(([n]) => /^layer:/.test(n))) {
  // (round 102, labchat102) a hold that reached the 6 s cap while its gaps' own work was under half of it: the gaps were
  // late (frames slow on a loaded box), not the layer's programs: "can't tell (load)", listed, not failing
  const h = s.wg?.hold; const loadCap = s.wg?.late === 1 && h?.capped && h.workMs != null && h.workMs < 0.5 * h.ms;
  if (loadCap) out.cantTell.push(`${k}: held to the ${h.ms} ms cap, its gaps' own work ${h.workMs} ms (load)`);
  step(`${k}: the new layer drew (its programs made before, in the gaps after frames)`, s.drew?.frames > 0 && (s.wg?.mode === 'off' || (s.wg?.held >= 1 && (s.wg.late === 0 || loadCap))), { drew: s.drew, wg: s.wg });
}
if (S.texture) {
  const sl = S.texture.slices;
  step('texture: a 4K picture never goes to the graphics card in one piece (biggest single upload ≤ 4.2 MP)', S.texture.biggestUploadMP <= 4.2, { biggest: S.texture.biggestUploadMP, slices: sl });
  step('texture: … in slices (≥ 4 a picture), none inside a frame', sl?.pictures >= 2 && sl.slices >= 8 && S.texture.biggestInFrameMP < 1, { slices: sl, inFrame: S.texture.biggestInFrameMP });
  step('texture: the picture shows once its slices are in', Array.isArray(S.texture.pixel) && S.texture.pixel[0] + S.texture.pixel[1] + S.texture.pixel[2] > 30, S.texture.pixel);
}
if (S.reload) {
  const sl = S.reload.slices; const p = S.reload.pixel || {};
  step('reload: a 4K picture changed on disk never goes up in one piece (biggest single upload ≤ 4.2 MP, none inside a frame)', S.reload.biggestUploadMP <= 4.2 && S.reload.biggestInFrameMP < 1, { biggest: S.reload.biggestUploadMP, inFrame: S.reload.biggestInFrameMP, slices: sl });
  const diff = Array.isArray(p.before) && Array.isArray(p.after) ? Math.abs(p.before[0] - p.after[0]) + Math.abs(p.before[1] - p.after[1]) + Math.abs(p.before[2] - p.after[2]) : -1;
  step('reload: the new picture shows once its slices are in', diff > 30 && p.after[0] + p.after[1] + p.after[2] > 30, p);
}
// (texture adds a layer: without background compiles its programs are made in its one setup frame, as labfps89 allows)
// (round 96: a big picture uploaded inside a frame is never part of that allowance)
for (const [k, s] of Object.entries(S)) {
  const n = s.over2xCpu + (s.over2xUpload || 0) + (s.khr || k !== 'texture' ? s.over2xCompile : 0); // (round 96) an upload inside a frame always counts
  step(`${k}: hitches over 2× budget judged the app's ≤ ${HITCH}`, n <= HITCH, { app: n, cpu: s.over2xCpu, upload: s.over2xUpload, compile: s.over2xCompile, load: s.over2xLoad, worst: s.hitches.slice(0, 3) });
}
const all = Object.values(S);
out.summary = { stretches: all.length, visibleInFrameCompiles: all.reduce((a, s) => a + s.visibleInFrameCompiles, 0), over2xApp: all.reduce((a, s) => a + s.over2xApp, 0), biggestUploadMP: Math.max(0, ...all.map((s) => s.biggestUploadMP || 0)) };
out.cantTell = out.cantTell.slice(0, 12);
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
