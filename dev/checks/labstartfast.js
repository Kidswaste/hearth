// (round 48, labstartfast) The Lab opens and switches scenes fast, measured in CPU time as well as wall time (the
// machine is shared: wall time stretches with the load, CPU time much less).
//   setup     a throwaway store the size of a real one (40 scenes, their pictures, 20 versions each), two simple scenes
//             and two heavy ones (a shader, a 2048² picture reference, a 🧊 model, 🅰 text that moves, a 📁 group), a
//             scene with a song
//   cold      a start without the warm page: a press on the Lab → its first frame; switches simple ⇄ simple and heavy
//             ⇄ heavy (first visit and again) → the first correct frame; back to a chat and to the Lab again
//   song      a start with the song scene last open (warm page, the default): press → first frame, → the song in
//   warm      a start with a simple scene (warm page): press → first frame
// Each stretch: wall ms, the window's main-thread CPU ms (trace: dev/trace-stats.js), CPU ms per process (window, Lab
// preview, GPU, main: app.getAppMetrics, hub.power.test), runs of the scene, and for the heavy ones when the model
// and the text are in. "Correct" = the first frame after the scene's last run, with its model loaded.
// (round 95, labflake95) Between stretches it waits for a steady GPU (a quiet one never came: 3 min of the run), the
// window's CPU budgets are judged on how fast the box ran right then (speedNow / slowBy: "can't tell" within that),
// and the Lab's first reads are checked by name (no versions or pictures before its scenes are up).
// Budgets (the verdict, `done` in the measuring part): loose on time (a software GPU on a shared machine), strict on
// what round 48 fixed: a scene with references runs once, the preview keeps its size while a song comes in, the window's
// own work until the scenes are read. window.LSF_BUDGET overrides them, window.LSF_REPORT = 1 only reports.
// Dev switches (localStorage, set with --eval): lsf.log = '1' adds each stretch's message log and the preview's size
// changes; lsf.dump = a folder: each stretch's trace as JSON (dev/trace-stats.js reads the window's part; the preview's
// and the GPU's threads are in it too); lsf.only = 'warm' | 'song' skips the cold part.
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/labstartfast.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(25); } return false; };
const DIR = '/tmp/hearth-labstartfast';
const shaderScene = (i, hue) => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color().setHSL(${hue}, 0.6, 0.55);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const P = tweak({ speed: [1, 0, 3], glow: [0.5, 0, 1], color: '#88ccff' });
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5));
const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: \`uniform float t; varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898 + ${i}.0, 78.233))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  void main() { float v = 0.0; float a = 0.5; vec2 p = vUv * ${3 + i}.0;
    for (int k = 0; k < ${12 + i * 2}; k++) { v += a * n(p + t * 0.1 + float(k) * ${0.37 + i * 0.01}); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.93; }
    gl_FragColor = vec4(vec3(0.4 + 0.5 * v, 0.5 + 0.3 * v, 0.7), 1.0); }\` });
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.28, 120, 16), mat); scene.add(knot);
renderer.setAnimationLoop((now) => { mat.uniforms.t.value = now / 1000 * P.speed; knot.rotation.y = now / 2000; renderer.render(scene, camera); });
`;
const PIC = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
const P = tweak({ size: [0.8, 0.1, 2] });
const tex = refTexture('pic');
const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); scene.add(m);
renderer.setAnimationLoop(() => { m.scale.setScalar(P.size); renderer.render(scene, camera); });
`;
const M = async () => (await window.hub.power.test({ metrics: true })).metrics;
const labelOf = (m, pid) => {
  const pages = m.pages.filter((p) => p.pid === pid);
  if (pages.some((p) => p.type === 'window' && /index\.html/.test(p.url))) return 'window';
  if (pages.some((p) => /three-sandbox/.test(p.url))) return 'preview';
  if (pages.length) return 'page';
  const pr = m.procs.find((x) => x.pid === pid);
  return pr.type === 'Browser' ? 'main' : pr.type === 'GPU' ? 'gpu' : 'other';
};
const cpuOf = (m0, m1) => { const o = {}; for (const p1 of m1.procs) { const p0 = m0.procs.find((x) => x.pid === p1.pid); const k = labelOf(m1, p1.pid); o[k] = (o[k] || 0) + Math.round(((p1.cpuS ?? 0) - (p0?.cpuS ?? 0)) * 1000); } o.all = Object.values(o).reduce((a, b) => a + b, 0); return o; };
const step = localStorage.getItem('lsf.step') || '1';
if (window.LSF_BUDGET) localStorage.setItem('lsf.budget', JSON.stringify(window.LSF_BUDGET)); else localStorage.removeItem('lsf.budget'); // (round 95: kept across the reloads; done() runs in the last page)

if (step === '1') {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
  // ---------- fixtures: a 2048² picture, a little GLB, a song ----------
  {
    const c = new OffscreenCanvas(2048, 2048); const g = c.getContext('2d');
    for (let y = 0; y < 2048; y += 64) for (let x = 0; x < 2048; x += 64) { g.fillStyle = `hsl(${(x + y) % 360} 70% ${40 + ((x * 7 + y * 13) % 30)}%)`; g.fillRect(x, y, 64, 64); }
    g.fillStyle = '#fff'; g.font = 'bold 300px sans-serif'; g.fillText('LAB', 500, 1100);
    // a photo-like file (noise defeats compression, as a real photo's size)
    const id = g.getImageData(0, 0, 2048, 2048); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() * 40) | 0; id.data[i] += n; id.data[i + 1] += n; } g.putImageData(id, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    await window.hub.fs.write(`${DIR}/pic.jpg`, new Uint8Array(await blob.arrayBuffer()));
    const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, -0.5]); const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 3, 2, 0, 3, 1]);
    const parts = [pos, idx]; const views = []; let off = 0; const chunks = [];
    for (const p of parts) { const b = new Uint8Array(p.buffer); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); chunks.push(b, new Uint8Array(pad)); off += b.length + pad; }
    const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
    const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'bot' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.5, 0.2, 1] } }], buffers: [{ byteLength: off }], bufferViews: views,
      accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }] };
    let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
    const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
    dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
    await window.hub.fs.write(`${DIR}/bot.glb`, u);
    const sr = 22050; const secs = 20; const n = secs * sr; const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (q, s) => [...s].forEach((chr, i) => data.setUint8(q + i, chr.charCodeAt(0)));
    w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const t = i / sr; const b = t % 0.5; data.setInt16(44 + i * 2, Math.round(20000 * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-b * 30)) * b) * Math.exp(-b * 9)), true); }
    await window.hub.fs.write(`${DIR}/song.wav`, new Uint8Array(data.buffer));
  }
  // ---------- a store the size of a real one: 40 more scenes, their pictures, versions ----------
  const thumb = await (async () => { const c = new OffscreenCanvas(360, 203); const g = c.getContext('2d'); const id = g.createImageData(360, 203); for (let i = 0; i < id.data.length; i++) id.data[i] = (Math.random() * 255) | 0; g.putImageData(id, 0, 0); const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.75 }); return `data:image/jpeg;base64,${btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer())))}`; })();
  const others = Array.from({ length: 40 }, (_, i) => ({ id: `lsfX${i}`, name: `Older scene ${i + 1}`, code: shaderScene(i % 5, (i * 0.07) % 1), updatedAt: Date.now() - 86400000 * (i + 2), layers: [{ id: 'main', name: 'Layer 1', code: shaderScene(i % 5, (i * 0.07) % 1) }, { id: 'l2', name: 'Layer 2', code: shaderScene((i + 1) % 5, 0.3) }] }));
  const thumbs = {}; for (const s of others) thumbs[s.id] = { url: thumb, at: Date.now() - 86400000 };
  const versions = {}; for (const s of others) versions[s.id] = Array.from({ length: 20 }, (_, k) => ({ at: Date.now() - k * 60000, code: `${s.code}\n// v${k}` }));
  const simple = [{ id: 'lsfA', name: 'lsf simple A', code: shaderScene(0, 0.1), updatedAt: Date.now() }, { id: 'lsfB', name: 'lsf simple B', code: shaderScene(1, 0.45), updatedAt: Date.now() - 1000 }];
  await window.hub.kvSet('three-sketches', [...simple, ...others]);
  await window.hub.kvSet('three-thumbs', thumbs);
  await window.hub.kvSet('three-history', { versions, trash: [] });
  store.set('three.current', 'lsfA');
  // ---------- the Lab: the heavy scenes and the song scene, built the way the owner would ----------
  await window.Lazy?.load('lab');
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 30000);
  const D = ThreeLab.director; const c = await ThreeLab.cmd();
  const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { text = `ERR ${e}`; } }); return text; };
  await window.Lazy?.load('kinetictype');
  const made = {};
  for (const [k, hue] of [['lsfH1', 0.8], ['lsfH2', 0.6]]) {
    const s = ThreeLab.scenes.create({ name: `lsf heavy ${k.slice(-1)}`, code: shaderScene(k === 'lsfH1' ? 3 : 4, hue), open: true });
    await until(() => ThreeLab.scenes.currentId() === s.id, 8000); await wait(1500);
    await D.refs.add(`${DIR}/pic.jpg`, 'pic');
    await D.addLayer({ name: 'Picture', code: PIC }, 1.5);
    made[`${k} model`] = await say(`/model add ${DIR}/bot.glb`);
    await wait(1500);
    try { await LabKinetic.apply('pop-words', { text: 'START FAST' }); } catch (err) { made[`${k} type`] = String(err.message); }
    await wait(1500);
    // a 📁 group of the two bottom layers
    const sk = ThreeLab.scenes.get(s.id);
    for (const L of sk.layers.slice(0, 2)) L.group = { id: `g${k}`, name: 'Back' };
    await D.updateLayer(sk.layers[0].id, { opacity: 1 }, 0.5);
    made[k] = { id: s.id, layers: ThreeLab.scenes.get(s.id).layers.map((L) => L.name) };
  }
  // the song scene
  const ms = ThreeLab.scenes.create({ name: 'lsf song', code: shaderScene(2, 0.25), open: true });
  await until(() => ThreeLab.scenes.currentId() === ms.id, 8000); await wait(1200);
  made.song = await c.loadSong(`${DIR}/song.wav`);
  await until(() => c.player.analysis, 20000);
  c.player.toggle?.(false);
  await wait(800);
  ThreeLab.scenes.open('lsfA');
  await wait(3500); // saved, its size noted (1.5 s after the last resize)
  localStorage.setItem('lsf.ids', JSON.stringify({ H1: made.lsfH1?.id, H2: made.lsfH2?.id, M: ms.id }));
  activate(H.agents()[0].id);
  await wait(1500);
  localStorage.setItem('lsf.step', '2');
  localStorage.setItem('labboot.warm', '0'); // the next start is a cold one
  if (localStorage.getItem('lsf.only') === 'warm') { localStorage.setItem('lsf.step', '4'); localStorage.removeItem('labboot.warm'); } // (dev: only the warm open)
  if (localStorage.getItem('lsf.only') === 'song') { localStorage.setItem('lsf.step', '3'); localStorage.removeItem('labboot.warm'); store.set('three.current', localStorage.getItem('lsf.ids') && JSON.parse(localStorage.getItem('lsf.ids')).M); } // (dev: from the song open on)
  return `[LSF] setup ${JSON.stringify(made).slice(0, 600)}`;
}
//@@ reload
// sections 2–4 run the same measuring code (kept in localStorage by section 2), each start one part
async function part() {
// ---------- shared measuring (each part below) ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(25); } return false; };
const M = async () => (await window.hub.power.test({ metrics: true })).metrics;
const labelOf = (m, pid) => {
  const pages = m.pages.filter((p) => p.pid === pid);
  if (pages.some((p) => p.type === 'window' && /index\.html/.test(p.url))) return 'window';
  if (pages.some((p) => /three-sandbox/.test(p.url))) return 'preview';
  if (pages.length) return 'page';
  const pr = m.procs.find((x) => x.pid === pid);
  return pr.type === 'Browser' ? 'main' : pr.type === 'GPU' ? 'gpu' : 'other';
};
const cpuOf = (m0, m1) => { const o = {}; for (const p1 of m1.procs) { const p0 = m0.procs.find((x) => x.pid === p1.pid); const k = labelOf(m1, p1.pid); o[k] = (o[k] || 0) + Math.round(((p1.cpuS ?? 0) - (p0?.cpuS ?? 0)) * 1000); } o.all = Object.values(o).reduce((a, b) => a + b, 0); return o; };
const IDS = JSON.parse(localStorage.getItem('lsf.ids') || '{}');
const step = localStorage.getItem('lsf.step');
const res = JSON.parse(localStorage.getItem('lsf.res') || '{}');
await until(() => performance.getEntriesByName('hearth:ready').length);
await window.Lazy?.load('lab');
await until(() => !window.Lazy || Lazy.state().every((g) => g.tier === 'use' || (g.state !== 'stub' && g.state !== 'loading')), 15000);
if (step !== '2') await until(() => window.LabBoot?.state().drawn || /off|not used|no /.test(window.LabBoot?.state().skipped || ''), 25000);
await wait(1500);
// the preview's messages and the Lab's runs, with times
const ev = []; let T0 = 0;
addEventListener('message', (e) => { const d = e.data; if (d?.source !== 'three-sandbox') return; ev.push({ t: performance.now(), type: d.type }); if (d.type === 'stack-drawn' && T0) performance.mark(`at:drawn${ev.filter((x) => x.type === 'stack-drawn' && x.t >= T0).length}`); });
addEventListener('hearth:lab-ran', (e) => { ev.push({ t: performance.now(), type: 'labran', partial: e.detail?.partial }); });
addEventListener('hearth:lab-ready', () => { ev.push({ t: performance.now(), type: 'labready' }); if (T0) performance.mark('at:labready'); });
// (round 95, labflake95) the stores the Lab reads, in order: round 48's fix (the versions and the scenes' pictures, the
// two biggest, read after the first frame is on its way) checked as such, not only through the window's CPU
if (window.LabSceneSafe?.read && !window.LabSceneSafe.__lsf) { const rd = window.LabSceneSafe.read; window.LabSceneSafe.read = function (k, ...a) { ev.push({ t: performance.now(), type: `kv ${k}` }); return rd.call(this, k, ...a); }; window.LabSceneSafe.__lsf = 1; }
const sbx = async (code) => { const d = ThreeLab.director; if (!d) return null; const r = await d.evalInSketch(code); return r?.ok ? r.value : null; };
// one stretch: go() → the first frame drawn; → the first frame after the scene's last run (and its model / song in);
// CPU per process until then; the window's main-thread CPU (trace)
// (the preview idle first: a heavy scene's late GPU work, a model's environment, can hold the page for seconds after
// its first frame on a software GPU; that belongs to the stretch before)
// (and the GPU process quiet: under a quarter of a CPU for half a second; a software GPU finishes a heavy scene's shaders
// there long after the page answers)
const settle = async () => {
  const t = performance.now();
  if (typeof ThreeLab !== 'undefined' && ThreeLab.director && document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame')?.checkVisibility?.()) {
    let ok = 0; while (ok < 2 && performance.now() - t < 25000) { const a = performance.now(); await sbx('return 1'); ok = performance.now() - a < 150 ? ok + 1 : 0; await wait(100); }
  }
  // (round 95, labflake95) …or steady: three half-seconds in a row within 12 % of each other. A software GPU draws an
  // animated scene on screen with about 3 of this box's 4 CPUs (1,350–1,660 ms of GPU CPU every half second, measured
  // after every switch): it never went under a quarter of a CPU, so each of the six switches waited the whole 30 s
  // (3 of the check's 6–7 minutes) and still started on a busy GPU. Steady is the most quiet it gets; a heavy scene's
  // leftover work (shaders finishing after its first frame) shows as half-seconds that are still changing.
  const seen = []; const g = [];
  while (performance.now() - t < 30000) {
    const m0 = await M(); await wait(500); const m1 = await M(); const c = cpuOf(m0, m1);
    seen.push(`${c.gpu || 0}/${c.preview || 0}`); g.push(c.gpu || 0);
    if ((c.gpu || 0) < 125) break;
    if (g.length >= 3) { const l = g.slice(-3); const m = (l[0] + l[1] + l[2]) / 3; if (l.every((x) => Math.abs(x - m) <= 0.12 * m)) break; }
  }
  return seen;
};
// (round 95, labflake95) how fast the window's thread gets through a fixed piece of work right now: dev/perfguard-
// calib.js's benchmark (integer mixing, short-lived objects for the GC, layout of an off-screen box of wrapped words),
// a smaller dose, plus reads all over 16 MB (memory-bound, as layout is), three times, each run's own thread CPU time
// from a light trace (smoke tasks: tdur). The window's CPU budgets are judged against it (see slowBy). Taken right
// after an open, the scene drawing as it was during the open (taken before the press it read 13–15 ms against 10–13
// after: the page still busy from its reload). The median of the three, ms; null without a trace.
const probeBox = (() => { let box = null; return () => { if (!box?.isConnected) { box = document.createElement('div'); box.style.cssText = 'position:absolute;left:-5000px;top:0;width:400px;font:14px sans-serif;contain:layout'; box.textContent = 'lorem ipsum dolor sit amet '.repeat(150); box.append(document.createElement('span')); document.body.append(box); } return box; }; })();
const probeRun = () => {
  let h = 0x811c9dc5 | 0; for (let i = 0; i < 3000000; i++) { h ^= i & 0xff; h = Math.imul(h, 16777619); h ^= h >>> 15; }
  const keep = []; let s = 0; for (let i = 0; i < 80000; i++) { const o = { i, a: [i, i * 2], t: `k${i & 4095}` }; s += o.a.length; if ((i & 255) === 0) keep.push(o); }
  const box = probeBox(); for (let k = 0; k < 8; k++) { box.style.width = `${400 + (k % 4) * 60}px`; s += box.lastChild.offsetTop; }
  const mem = (window.__lsfMem ||= new Int32Array(1 << 22)); let j = 7; for (let i = 0; i < 120000; i++) { j = (j * 1103515245 + 12345) & 0x3fffff; s += mem[j]; } // (16 MB read at random: memory, as layout is)
  window.__lsfH = h ^ s ^ keep.length;
};
const speedNow = async () => {
  try {
    probeRun(); // (a run first, not counted: its code compiled, its 16 MB and its box made)
    await smoke({ trace: 'start', tasks: true });
    for (let k = 0; k < 3; k++) { await wait(30); performance.mark('lsfspeed'); probeRun(); }
    const r = await smoke({ trace: 'stop', tasks: { min: 1e9, mark: 'lsfspeed', marked: 'lsfspeed' } });
    const c = (r?.marked || []).map((x) => x?.cpuMs).filter(Number.isFinite).sort((a, b) => a - b);
    return c.length === 3 ? c[1] : null;
  } catch { return null; }
};
async function stretch(name, go, { ready = null, quiet = 1500, trace = true, speed = false } = {}) {
  const s0 = performance.now();
  const seen = await settle();
  const settled = performance.now() - s0;
  await wait(300);
  if (trace) await smoke({ trace: 'start', detail: true });
  const m0 = await M();
  T0 = performance.now(); performance.mark(`hz240:${name}`);
  const i0 = ev.length;
  await go();
  let m1 = null; let correct = null; let readyAt = null; let lastRan = -1;
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) {
    const mine = ev.slice(i0);
    const rans = mine.filter((x) => x.type === 'labran');
    const lr = rans.length ? rans.at(-1).t : T0;
    if (lr !== lastRan) { lastRan = lr; correct = null; m1 = null; }
    const dr = mine.find((x) => x.type === 'stack-drawn' && x.t >= lr);
    if (ready && readyAt == null && await ready()) readyAt = performance.now();
    if (dr && (!ready || readyAt != null) && correct == null) { correct = Math.max(dr.t, readyAt ?? 0); m1 = await M(); performance.mark('at:correct'); }
    if (correct != null && performance.now() - Math.max(correct, lr) > quiet) break;
    await wait(ready ? 60 : 20);
  }
  const mine = ev.slice(i0);
  const first = mine.find((x) => x.type === 'stack-drawn');
  let win = null;
  if (trace) { const tr = await smoke({ trace: 'stop', detail: true, ...(localStorage.getItem('lsf.dump') ? { dump: `${localStorage.getItem('lsf.dump')}/${name}.json` } : {}) }); const s = tr.detail?.segments?.[name]; win = s ? { cpuAtReady: s.at?.labready?.cpuMs ?? null, fgAtReady: s.at?.labready?.fgMs ?? null, msAtReady: s.at?.labready?.ms ?? null, cpuAtCorrect: s.at?.correct?.cpuMs ?? null, cpuAtFirst: s.at?.drawn1?.cpuMs ?? null, longestCpu: s.longestCpu, files: Object.entries(s.filesCpu || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`) } : null; }
  const r = { first: first ? Math.round(first.t - T0) : null, correct: correct != null ? Math.round(correct - T0) : null, runs: mine.filter((x) => x.type === 'labran').length, resizes: lateResizes(mine), layerRuns: mine.filter((x) => x.type === 'ran').length, errors: mine.filter((x) => x.type === 'error').length, drawn: mine.filter((x) => x.type === 'stack-drawn').length, cpu: m1 ? cpuOf(m0, m1) : null, win, ...(localStorage.getItem('lsf.log') === '1' ? { log: mine.filter((x) => !/^(stats|tweak-reads|console|fps)$/.test(x.type)).slice(0, 40).map((x) => `${Math.round(x.t - T0)} ${x.type}`).join(', ') } : {}) };
  { const lr = mine.find((x) => x.type === 'labready'); if (lr) r.firstReads = mine.filter((x) => /^kv /.test(x.type) && x.t <= lr.t).map((x) => x.type.slice(3)); }
  T0 = 0;
  if (speed) r.speedMs = await speedNow();
  r.settleMs = Math.round(settled); r.settleGpu = seen.slice(0, 64).join(' '); r.ms = Math.round(performance.now() - s0); // (round 95: where the check's own time goes)
  return r;
}
// (round 88, checkfix88) the preview's size changes that cost something: after the scene's first layer run (its canvases
// exist from then on; each change resizes every one of them). Since round 86 (projopen86) the Lab's first start paints
// a frame before it opens the scene, so the observer sees the frame from that empty frame on: the media bar taking its
// height for the song came in as 1–2 "resizes" 150–250 ms before the scene had run at all (nothing to resize). Counted
// from the first size seen, as before, when no layer run came (the stretch then fails on that anyway).
const lateResizes = (mine) => {
  const sizes = mine.filter((x) => /^size /.test(x.type));
  const ran = mine.find((x) => x.type === 'ran');
  if (!ran) return Math.max(0, sizes.length - 1);
  return sizes.slice(1).filter((x) => x.t > ran.t).length; // (the first one is the observer's own first look)
};
const pressLab = async () => {
  const btn = RAIL.button('tool:three'); await wait(50); // (round 74) the rail's way to the Lab today (dev/checks/rail-lib.js)
  const r = btn.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } });
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } });
  // (the preview frame's size changes while the Lab opens: each one resizes every canvas of the scene)
  until(() => { const f = document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame'); if (!f || f.__lsfRo) return Boolean(f); f.__lsfRo = new ResizeObserver(() => ev.push({ t: performance.now(), type: `size ${f.clientWidth}x${f.clientHeight}${localStorage.getItem('lsf.log') === '1' ? ` [${[...document.querySelectorAll('.surface[data-id="tool:three"] .tabpane > *, .surface[data-id="tool:three"] .three-right > *')].filter((x) => x.offsetHeight).map((x) => `${String(x.className).split(' ')[0]}:${x.offsetHeight}`).join(' ')}] [${[...document.querySelectorAll('.surface[data-id="tool:three"] .media-bar > *, .surface[data-id="tool:three"] .media-bar > * > *')].filter((x) => x.offsetHeight).map((x) => `${String(x.className).split(' ').slice(0, 2).join('.')}:${x.offsetHeight}`).join(' ')}]` : ''}` })); f.__lsfRo.observe(f); return true; }, 10000);
};
const heavyReady = async () => { const v = await sbx('return JSON.stringify({ m: (globalThis.lab3d?.list?.() || []).map((x) => x.loaded), t: Boolean(window.__labType?.info?.()?.length) })'); if (!v) return false; const o = JSON.parse(v); return o.m.length > 0 && o.m.every(Boolean) && o.t; };
const save = () => localStorage.setItem('lsf.res', JSON.stringify(res));
const pool = async () => { const v = await sbx('return JSON.stringify({ ...window.__labHealth?.(), early: window.__labGpu?.info?.().note?.early })'); try { const h = JSON.parse(v); return { hit: h.poolHit, pooled: h.pooled, contexts: h.contexts, early: h.early }; } catch { return null; } };

if (step === '2') {
  // ---------- cold start: no warm page ----------
  res.boot2 = window.LabBoot?.state().skipped || null;
  res.coldOpen = await stretch('coldOpen', pressLab, { speed: true });
  res.coldOpen.pool = await pool();
  await wait(1500);
  const open = (id) => () => { ThreeLab.scenes.open(id); };
  res.switchSimple = await stretch('switchSimple', open('lsfB'));
  res.switchSimpleAgain = await stretch('switchSimpleAgain', open('lsfA'));
  res.switchHeavy = await stretch('switchHeavy', open(IDS.H1), { ready: heavyReady });
  res.switchHeavy2 = await stretch('switchHeavy2', open(IDS.H2), { ready: heavyReady });
  res.switchHeavyAgain = await stretch('switchHeavyAgain', open(IDS.H1), { ready: heavyReady });
  res.switchHeavyToSimple = await stretch('switchHeavyToSimple', open('lsfA'));
  // back to a chat and to the Lab again: the preview frame on screen, drawing (it parks while hidden)
  activate(H.agents()[0].id);
  await wait(2500);
  {
    await smoke({ trace: 'start', detail: true });
    const m0 = await M(); const t0 = performance.now(); T0 = t0; performance.mark('hz240:returnLab');
    const n0 = (await sbx('return window.__labPace?.state()?.drawn'));
    await pressLab();
    let shown = null; let drew = null;
    await until(() => { const f = document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame'); if (shown == null && f?.checkVisibility?.({ visibilityProperty: true })) { shown = performance.now() - t0; performance.mark('at:shown'); } return shown != null; }, 10000);
    await until(async () => { const n = await sbx('return window.__labPace?.state()?.drawn'); if (n != null && n0 != null && n > n0) { drew = performance.now() - t0; return true; } return false; }, 10000);
    const m1 = await M();
    const tr = await smoke({ trace: 'stop', detail: true }); const s = tr.detail?.segments?.returnLab;
    res.returnLab = { shown: Math.round(shown), drawn: drew != null ? Math.round(drew) : null, cpu: cpuOf(m0, m1), win: s ? { cpuAtShown: s.at?.shown?.cpuMs, longestCpu: s.longestCpu, files: Object.entries(s.filesCpu || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`) } : null };
    T0 = 0;
  }
  activate(H.agents()[0].id);
  store.set('three.current', IDS.M);
  localStorage.removeItem('labboot.warm');
  localStorage.setItem('lsf.step', '3');
  save();
  return `[LSF] cold part ${JSON.stringify(res)}`;
}
// (the parts after another reload: the song scene, then a plain warm one)
// the verdict (budgets on this software GPU under load: loose on time, strict on what was fixed)
// (round 95, labflake95) the window's CPU, judged on how fast the box ran right then. The same work cost up to twice the
// CPU from one run to the next: the Lab's first layout on a song open, the same 46 of 214 objects, took 6.6 ms in one
// run and 13.4 ms in another, and the whole click 35 vs 51 ms (other programs on the same 4 CPUs: the GPU process
// drawing with ~3 of them, other checks). Round 94's one failure was songOpen at 152 ms of 150. slowBy(k): the probe
// (speedNow, right after stretch k, the scene still drawing as during it) against the fastest of this run's three,
// 1–2. Over budget but within budget × slowBy is "can't tell" (listed, not failed); over that, it fails. A run that is
// slow throughout gets no allowance at all.
const cantTell = [];
const probes = () => ['coldOpen', 'songOpen', 'warmOpen'].map((k) => res[k]?.speedMs).filter(Number.isFinite);
const slowBy = (k) => {
  const v = res[k]?.speedMs; const all = probes();
  if (!Number.isFinite(v) || all.length < 2) return 1;
  return Math.min(2, Math.max(1, Math.round((v / Math.min(...all)) * 100) / 100));
};
const cpuOver = (fails, k, v, budget, what) => {
  if (!(v > budget)) return;
  const f = slowBy(k);
  if (v <= budget * f) cantTell.push(`${k}: ${what} ${v} ms (budget ${budget}), with the box ${f}× slower than at its fastest in this run (probe ${res[k]?.speedMs} ms, fastest ${Math.min(...probes())})`);
  else fails.push(`${k}: ${what} ${v} ms (budget ${budget}${f > 1 ? `; ${Math.round(budget * f)} with the box ${f}× slower` : ''})`);
};
const done = () => {
  const B = window.LSF_BUDGET || JSON.parse(localStorage.getItem('lsf.budget') || 'null') || { coldOpenCpu: 6000, coldWindowCpu: 900, warmShown: 1500, warmFirst: 5000, songFirst: 6000, readyCpu: 150, heavyRuns: 1, lateResizes: 0, returnShown: 600, switchSimpleCpu: 2500 };
  const fails = [];
  const c = (k) => res[k]?.cpu?.all;
  if (res.coldOpen?.first == null) fails.push('the cold open never drew');
  if (res.warmOpen?.first == null) fails.push('the warm open never drew');
  if (c('coldOpen') > B.coldOpenCpu) fails.push(`cold open used ${c('coldOpen')} ms CPU (budget ${B.coldOpenCpu})`);
  cpuOver(fails, 'coldOpen', res.coldOpen?.cpu?.window, B.coldWindowCpu, 'the window used');
  if (res.warmOpen?.shown > B.warmShown) fails.push(`warm open took ${res.warmOpen.shown} ms to show the scene (budget ${B.warmShown})`);
  if (res.warmOpen?.first > B.warmFirst) fails.push(`warm open: the Lab's own run drew after ${res.warmOpen.first} ms (budget ${B.warmFirst})`);
  if (res.songOpen?.first > B.songFirst) fails.push(`open with a song: first frame after ${res.songOpen.first} ms (budget ${B.songFirst})`);
  for (const k of ['coldOpen', 'warmOpen', 'songOpen']) { const early = (res[k]?.firstReads || []).filter((x) => x === 'three-history' || x === 'three-thumbs'); if (early.length) fails.push(`${k}: the Lab read ${early.join(' and ')} before its scenes were up (round 48: after the first frame)`); }
  for (const k of ['coldOpen', 'warmOpen', 'songOpen']) cpuOver(fails, k, res[k]?.win?.cpuAtReady, B.readyCpu, "the window's CPU until the Lab's scenes were read:");
  for (const k of ['switchHeavy', 'switchHeavy2', 'switchHeavyAgain']) if (res[k] && res[k].runs > B.heavyRuns) fails.push(`${k} ran the scene ${res[k].runs}× (budget ${B.heavyRuns}: its references come first)`);
  for (const k of ['songOpen', 'warmOpen']) if (res[k] && res[k].resizes > B.lateResizes) fails.push(`${k}: the preview changed size ${res[k].resizes}× after it was laid out (each resizes every canvas)`);
  for (const k of ['switchSimple', 'switchSimpleAgain', 'switchHeavy', 'switchHeavy2', 'switchHeavyAgain', 'switchHeavyToSimple', 'songOpen']) if (res[k] && res[k].correct == null) fails.push(`${k} never reached its correct frame`);
  if (c('switchSimple') > B.switchSimpleCpu) fails.push(`a simple switch used ${c('switchSimple')} ms CPU (budget ${B.switchSimpleCpu})`);
  if (res.songOpen && res.songOpen.song == null) fails.push('the song never came in');
  if (res.returnLab?.shown > B.returnShown) fails.push(`back to the Lab took ${res.returnLab.shown} ms to show`);
  if (res.returnLab && res.returnLab.drawn == null) fails.push('back to the Lab: the preview never drew');
  return fails;
};
if (step === '3') {
  // ---------- a start with the song scene open (the warm page, as every day) ----------
  res.boot3 = window.LabBoot?.state ? (({ warmed, skipped, drawn }) => ({ warmed, skipped, drawn }))(window.LabBoot.state()) : null;
  let songAt = null;
  const t0 = performance.now();
  res.songOpen = await stretch('songOpen', async () => { await pressLab(); (async () => { await until(() => ThreeLab.director && ThreeLab.cmd, 10000); const c = await ThreeLab.cmd(); await until(() => c.player.loaded, 15000); songAt = performance.now() - t0; })(); }, { speed: true });
  await until(() => songAt != null, 15000);
  res.songOpen.song = songAt != null ? Math.round(songAt) : null;
  activate(H.agents()[0].id);
  store.set('three.current', 'lsfA');
  localStorage.setItem('lsf.step', '4');
  save();
  return `[LSF] song part done ${JSON.stringify(res.songOpen)}`;
}
  // ---------- a plain warm start ----------
  if (step === '4') {
    res.boot4 = window.LabBoot?.state ? (({ warmed, skipped, drawn }) => ({ warmed, skipped, drawn }))(window.LabBoot.state()) : null;
    let shownAt = null; let tw = 0;
  res.warmOpen = await stretch('warmOpen', async () => { tw = performance.now(); await pressLab(); until(() => { const f = document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame'); if (f?.checkVisibility?.({ visibilityProperty: true })) { shownAt = performance.now() - tw; return true; } return false; }, 10000); }, { speed: true });
  res.warmOpen.pool = await pool();
  res.warmOpen.shown = window.LabBoot?.state().taken && shownAt != null ? Math.round(shownAt) : res.warmOpen.first;
    localStorage.removeItem('lsf.step'); localStorage.removeItem('lsf.res');
    await window.hub.kvSet('three-sketches', []);
    const fails = window.LSF_REPORT ? [] : done();
    window.__lsfMem = null;
    return `[LSF]${JSON.stringify(res)}${cantTell.length ? `\nCAN'T TELL ${cantTell.join('; ')}` : ''}${fails.length ? `\nFAIL: ${fails.join('; ')}` : '\nPASS'}`;
  }
  return '[LSF] no step';
}
localStorage.setItem('lsf.code', part.toString());
return await part();
//@@ reload
return await (0, eval)(`(${localStorage.getItem('lsf.code')})`)();
//@@ reload
return await (0, eval)(`(${localStorage.getItem('lsf.code')})`)();
