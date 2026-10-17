// ▶ Play, loads during play (round 54, gamestream): a throwaway HTML game (its own three.js) that, 5 s into play, loads a
// new "level": a 4096×4096 picture (TextureLoader.loadAsync) on a big panel, a GLB crate with its own 2048² and 1024²
// pictures, and a torus knot with a new physical material whose 2048² picture loads after it's added (TextureLoader.load).
// Every run gets shaders nobody compiled before (a random define), so Chromium's shader disk cache can't help one run.
//   before   ▶ Play with gamestream off (localStorage gamestream.test = { off: true }: the log only): the worst frame from
//            the load to 4 s after, and the doctor (GamePerf.measure) names the load behind the slow frame;
//            the longest main-thread block (long animation frames) and the main thread's time in WebGL upload / shader calls
//   after    ▶ Play as it ships: the pictures decoded off the main thread and used by the upload, the new objects held
//            until their shaders are ready (textures one per frame), the worst frame again; the picture the same as
//            before (64×64 read back, no upside-down / color shift)
//   three times each, alternating (a busy computer: the median of three for each side)
//   files    the game's files byte for byte the same
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/gamestream.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], runs: [] };
const TMP = window.SMOKE_TMP || '/tmp'; // (round 56, fixes56) this run's own scratch folder (dev/smoke.js --tmp): two runs at once never share files
const DIR = `${TMP}/hearth-gamestream`;
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); window.hub?.fs?.write(`${DIR}/progress.json`, JSON.stringify(out, null, 1)).catch(() => {}); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 5 min`)), 300000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

// ---------- fixtures ----------
const rnd = (x, y, s) => { const n = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453; return n - Math.floor(n); };
// top half warm, bottom half cool (upside down shows), grain everywhere (a photo's decode cost)
async function picture(w, h, type = 'image/jpeg', q = 0.88) {
  const c = new OffscreenCanvas(w, h); const g = c.getContext('2d'); const im = g.createImageData(w, h); const d = im.data;
  for (let y = 0; y < h; y++) { const top = y < h / 2; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const n = rnd(x, y, 1) * 70; d[i] = (top ? 200 : 40) + n * 0.7; d[i + 1] = 60 + n + ((x >> 6) & 1) * 30; d[i + 2] = (top ? 40 : 200) + n * 0.7; d[i + 3] = 255; } }
  g.putImageData(im, 0, 0);
  return new Uint8Array(await (await c.convertToBlob({ type, quality: q })).arrayBuffer());
}
async function glb(file) {
  const imgs = [await picture(2048, 2048), await picture(1024, 1024)];
  const N = 32; const pos = []; const uv = []; const nor = []; const idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const u = i / N; const v = j / N; pos.push(u - 0.5, Math.sin(u * 7) * 0.1, v - 0.5); uv.push(u, v); nor.push(0, 1, 0); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
  const parts = [new Uint8Array(new Float32Array(pos).buffer), new Uint8Array(new Float32Array(nor).buffer), new Uint8Array(new Float32Array(uv).buffer), new Uint8Array(new Uint16Array(idx).buffer), ...imgs];
  const views = []; let off = 0; const chunks = [];
  for (const p of parts) { const pad = (4 - (p.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: p.length }); chunks.push(p, new Uint8Array(pad)); off += p.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
  const nv = (N + 1) * (N + 1);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'crate' }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'crate', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.2, roughnessFactor: 0.6 }, emissiveTexture: { index: 1 }, emissiveFactor: [0.4, 0.4, 0.4] }], textures: [{ source: 0 }, { source: 1 }], images: [{ bufferView: 4, mimeType: 'image/jpeg' }, { bufferView: 5, mimeType: 'image/jpeg' }], buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: [-0.5, -0.1, -0.5], max: [0.5, 0.1, 0.5] }, { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: nv, type: 'VEC2' }, { bufferView: 3, componentType: 5123, count: idx.length, type: 'SCALAR' }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  await window.hub.fs.write(file, u);
}
const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Clink</title>
<script type="importmap">{ "imports": { "three": "./three.module.js", "three/addons/": "./jsm/" } }</script>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style></head><body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const RUN = String(Math.floor(Math.random() * 1e9)); // (shaders nobody compiled before: the disk cache can't help a run)
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101418');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6);
scene.add(new THREE.HemisphereLight('#ffffff', '#334455', 1.5)); const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(2, 3, 4); scene.add(sun);
const spin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: '#ff8a3d' })); spin.position.set(-2.6, 1.6, 0); scene.add(spin);
const fx = window.__fx = { start: null, loadAt: null, addedAt: null, wallAt: null, run: RUN };
async function level() {
  fx.loadAt = performance.now();
  const [big, gltf] = await Promise.all([new THREE.TextureLoader().loadAsync('textures/big.jpg'), new GLTFLoader().loadAsync('models/crate.glb')]);
  big.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.MeshBasicMaterial({ map: big }); pm.defines = { RUN };
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), pm); panel.position.set(-1.2, 0, 0); scene.add(panel);
  gltf.scene.traverse((o) => { if (o.isMesh) o.material.defines = { RUN }; });
  gltf.scene.position.set(1.6, -0.8, 0); gltf.scene.rotation.x = 0.9; gltf.scene.scale.setScalar(1.8); scene.add(gltf.scene);
  const wall = new THREE.TextureLoader().load('textures/wall.jpg', () => { fx.wallAt = performance.now(); }); wall.colorSpace = THREE.SRGBColorSpace;
  const km = new THREE.MeshPhysicalMaterial({ map: wall, clearcoat: 1, sheen: 1, iridescence: 1, roughness: 0.3 }); km.defines = { RUN };
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.4, 0.14, 160, 24), km); knot.position.set(1.6, 1.1, 0); scene.add(knot);
  fx.addedAt = performance.now();
}
renderer.setAnimationLoop(() => { const n = performance.now(); if (fx.start == null) fx.start = n; spin.rotation.y = (n - fx.start) / 500; if (fx.loadAt == null && n - fx.start > 5000) level(); renderer.render(scene, camera); });
// the picture, 64×64 read back (the spinning cube hidden: the same in every run)
fx.probe = () => { spin.visible = false; const rt = new THREE.WebGLRenderTarget(64, 64); renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); const px = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 64, 64, px); rt.dispose(); spin.visible = true; return Array.from(px); };
</script></body></html>`;
const H = `${DIR}/game`;
const ORIG = [`${H}/index.html`, `${H}/textures/big.jpg`, `${H}/textures/wall.jpg`, `${H}/models/crate.glb`];
await safe('fixtures', async () => {
  await window.hub.fs.write(`${H}/index.html`, HTML);
  const big = await picture(4096, 4096); await window.hub.fs.write(`${H}/textures/big.jpg`, big);
  const wall = await picture(2048, 2048); await window.hub.fs.write(`${H}/textures/wall.jpg`, wall);
  await glb(`${H}/models/crate.glb`);
  for (const [a, b] of [['build/three.module.js', 'three.module.js'], ['build/three.core.js', 'three.core.js'], ['examples/jsm/loaders/GLTFLoader.js', 'jsm/loaders/GLTFLoader.js'], ['examples/jsm/utils/BufferGeometryUtils.js', 'jsm/utils/BufferGeometryUtils.js'], ['examples/jsm/utils/SkeletonUtils.js', 'jsm/utils/SkeletonUtils.js']]) await window.hub.fs.copy(`${THREE_DIR}/${a}`, `${H}/${b}`);
  out.hashBefore = await window.hub.gameReady.hash(ORIG);
  step('fixtures: an HTML game, a 4096² picture, a 2048² picture, a GLB with 2048² + 1024² pictures', out.hashBefore.every((h) => h.hash), { big: big.length, wall: wall.length });
});

await Lazy.load('gamemode'); await Lazy.load('gameready'); await Lazy.load('gameperf');
const GW = () => window.hub.game;
const ev = async (code) => { const r = await GW().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
const src = { kind: 'html', path: `${H}/index.html`, title: 'Clink' };
// one ▶ Play: getting ready, then frames recorded in the page from the first played frame; the level loads at 5 s
async function run(label, off) {
  localStorage.setItem('gamestream.test', JSON.stringify({ off }));
  await GameMode.play(src);
  await until(async () => JSON.parse((await ev('window.__gameReady ? window.__gameReady.pub() : "{}"')) || '{}').phase === 'playing', 120000);
  await ev(`(() => { if (window.__rec) return 1; const r = window.__rec = []; r.loaf = []; const tick = () => { r.push(performance.now()); if (r.length < 30000) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) r.loaf.push([e.startTime, e.duration, e.blockingDuration || 0]); }).observe({ type: 'long-animation-frame' }); } catch { /* fine */ } return 1; })()`);
  // the doctor's session from here (the getting ready's own compiles / uploads not counted)
  // (round 57, framepace57: ▶ Play hands GamePerf its window dormant; the doctor's probe put in here, before the load)
  await GamePerf.attach({ exec: async (e) => ev(e) }, { label: src.title || 'game', kind: 'html', hz: 60, key: false }).catch(() => {});
  if (await until(() => ev('Boolean(window.__gamePerf)'), 15000)) await ev('window.__gamePerf.start()');
  await until(() => ev('window.__fx && window.__fx.addedAt && window.__fx.wallAt'), 30000);
  await wait(4000);
  const m = JSON.parse(await ev(`JSON.stringify((() => { const f = window.__fx; const r = window.__rec; const dts = []; for (let i = 1; i < r.length; i++) dts.push([r[i], r[i] - r[i - 1]]);
    const pre = dts.filter(([t]) => t < f.loadAt && t > f.loadAt - 3000).map((x) => x[1]).sort((a, b) => a - b);
    const win = dts.filter(([t]) => t >= f.loadAt && t <= f.loadAt + 4000).map((x) => x[1]);
    const med = pre[pre.length >> 1] || 16.7;
    const lo = r.loaf.filter(([t]) => t >= f.loadAt - 50 && t <= f.loadAt + 4000);
    return { med: Math.round(med * 10) / 10, blockMax: Math.round(Math.max(0, ...lo.map((x) => x[2]))), blockSum: Math.round(lo.reduce((a, x) => a + x[2], 0)), worst: Math.round(Math.max(...win) * 10) / 10, over50: win.filter((d) => d > 50).length, lostMs: Math.round(win.reduce((a, d) => a + Math.max(0, d - 2 * med), 0)), frames: win.length,
      loadToShown: Math.round(f.addedAt - f.loadAt), wallMs: Math.round(f.wallAt - f.loadAt), stream: window.__gameStream ? window.__gameStream.report(f.loadAt) : null, px: f.probe() }; })())`));
  const perf = await GamePerf.measure().catch((e) => ({ error: e.message }));
  m.findings = (perf.findings || []).map((f) => f.title);
  // the main thread's own time inside WebGL's upload / shader calls during play (a picture decoded there, a link waited on)
  m.glMain = Math.round((perf.R?.textures?.ms || 0) + (perf.R?.shaders?.ms || 0)); m.texMain = perf.R?.textures?.ms ?? null; m.shMain = perf.R?.shaders?.ms ?? null;
  m.named = (perf.R?.stutters?.list || []).filter((f) => f.load).map((f) => `${f.cause} ${f.ms} ms · ${f.load}`).slice(0, 5);
  m.label = label;
  out.runs.push({ ...m, px: undefined, stream: m.stream && { ...m.stream, loads: m.stream.loads.filter((l) => l.t > -100).slice(0, 12) } });
  await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(800);
  return m;
}
const R = {};
await safe('runs', async () => {
  R.off1 = await run('before (off)', true);
  R.on1 = await run('after (on)', false);
  R.off2 = await run('before (off) 2', true);
  R.on2 = await run('after (on) 2', false);
  R.off3 = await run('before (off) 3', true);
  R.on3 = await run('after (on) 3', false);
});
localStorage.removeItem('gamestream.test');

await safe('judge', async () => {
  const offs = [R.off1, R.off2, R.off3].filter(Boolean); const ons = [R.on1, R.on2, R.on3].filter(Boolean);
  const mid = (list, k) => { const v = list.map((x) => x[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const side = (list) => ({ worst: mid(list, 'worst'), lostMs: mid(list, 'lostMs'), over50: mid(list, 'over50'), blockMax: mid(list, 'blockMax'), blockSum: mid(list, 'blockSum'), glMain: mid(list, 'glMain'), texMain: mid(list, 'texMain'), shMain: mid(list, 'shMain'), all: list.map((x) => x.worst) });
  out.compare = { before: side(offs), after: side(ons), frameMed: offs.concat(ons).map((x) => x.med) };
  step('before: a mid-game load froze a frame, and the doctor names the file behind it', offs.some((x) => x.worst > 2.5 * x.med) && offs.some((x) => x.named.length && x.findings.some((t) => /big\.jpg|crate\.glb|wall\.jpg|“crate”|“/.test(t))), offs.map((x) => ({ worst: x.worst, named: x.named, findings: x.findings.slice(0, 4) })));
  const on = ons[ons.length - 1];
  const s = on?.stream || {};
  step('after: pictures decoded off the main thread and used by the upload; new objects held until their shaders were ready', s.on && s.images.used >= 2 && s.images.fallback === 0 && s.holds.n >= 2, { images: s.images, holds: s.holds, uploads: s.uploads, parallel: s.parallel, loads: s.loads?.map((l) => `${l.kind} ${l.name} ${l.smooth}`) });
  step('after: the longest main-thread block during the load is shorter (long animation frames, median of three each)', out.compare.after.blockMax < out.compare.before.blockMax, { before: out.compare.before.blockMax, after: out.compare.after.blockMax, glMainBefore: out.compare.before.glMain, glMainAfter: out.compare.after.glMain });
  step('after: the worst frame of the load is shorter than before (median of three each)', out.compare.after.worst < out.compare.before.worst, out.compare);
  // the same picture: the panel's halves (warm over cool), the crate, the knot
  const a = R.off1?.px; const b = on?.px; let diff = 0; let n = 0;
  if (a && b) for (let i = 0; i < a.length; i += 4) { diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; }
  const at = (px, x, y) => { const i = (y * 64 + x) * 4; return px ? [px[i], px[i + 1], px[i + 2]] : null; };
  // (render target rows go bottom-up: y 44 is the panel's upper part, y 20 its lower part)
  const up = at(b, 20, 44); const lo = at(b, 20, 20);
  step('after: the same picture as before (64×64 read back), the 4K picture the right way up', a && b && diff / n < 3 && up && lo && up[0] > up[2] && lo[2] > lo[0], { meanDiff: n ? Math.round((diff / n) * 100) / 100 : null, upper: up, lower: lo });
});
await safe('files', async () => {
  const after = await window.hub.gameReady.hash(ORIG);
  step('files: the game\'s files byte for byte the same', after.every((h, i) => h.hash === out.hashBefore[i].hash), after.map((h, i) => (h.hash === out.hashBefore[i].hash ? 'same' : `CHANGED ${h.path}`)));
});
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, compare: out.compare, runs: out.runs }, null, 1);
