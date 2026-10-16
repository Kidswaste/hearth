// ▶ Play, got ready (round 52, gameready): GameReady.prepare on a game-like Lab scene (the main path) and an HTML build.
//   setup    a throwaway "Clink" Lab scene: a ground with a 4096×2048 picture and a 1024² detail picture, a 🧊 ship
//            model (GLB with its own texture), five kinds of material, four lights (two casting shadows), and a pickup
//            that only shows 2 s into play (its shaders never drew before)
//   before   play without getting ready: the scene started again, what the GPU compiles / uploads in the first 5 s
//   after    GameReady.prepare: the card (Getting … ready, textures n/m, %), then 0 compiles and 0 new uploads in the first
//            5 s of play; textures at the best anisotropy; quality held; what it found ("1 texture is 4K — …")
//   optimize Optimize for play without an encoder: the install command shown, nothing run; with gltfpack (a throwaway
//            copy, if run-checks could install one): the model's optimized copy in Hearth's cache, used by the next
//            prepare (the Lab reads the copy), the model still drawn, 0 compiles / uploads in play again
//   html     an HTML build (index.html + three.js + GLTFLoader + meshopt, a picture, the ship): played without and with
//            getting ready in its own window (hearth-game://), its warm run's files kept; optimized → the window serves
//            the copy for ship.glb by URL rewrite
//   files    every original file hashed before and after: unchanged
//   launch   'createAndReadyMs' / 'compileMs' of the first preparation are kept in /tmp/hearth-gameready/launch1.json for
//            dev/checks/gameready-relaunch.js (the same profile: Chromium's GPU shader disk cache from this launch)
//   node dev/smoke.js --check-timeout 1500000 --profile /tmp/hearth-gameready-profile --profile-fresh --script dev/checks/gameready.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const DIR = '/tmp/hearth-gameready';
const TOOL = '/tmp/hearth-gameready-tools/node_modules/.bin/gltfpack';
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
const setTest = (o) => (o ? localStorage.setItem('gameready.test', JSON.stringify(o)) : localStorage.removeItem('gameready.test'));
const GRS = () => (typeof GameReady !== 'undefined' ? GameReady.state() : null);
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

// ---------- fixtures (throwaway files: the "owner's game") ----------
async function picture(file, w, h, type = 'image/jpeg') {
  const c = new OffscreenCanvas(w, h); const g = c.getContext('2d');
  for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) { g.fillStyle = `hsl(${(x * 3 + y) % 360} 55% ${35 + ((x * 7 + y * 13) % 30)}%)`; g.fillRect(x, y, 128, 128); }
  const blob = await c.convertToBlob({ type, quality: 0.9 });
  const u8 = new Uint8Array(await blob.arrayBuffer());
  if (file) await window.hub.fs.write(file, u8);
  return u8;
}
async function glb(file) {
  const img = await picture(null, 512, 512, 'image/png');
  const N = 48; const pos = []; const uv = []; const nor = []; const idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const u = i / N; const v = j / N; pos.push(u - 0.5, Math.sin(u * 9) * Math.cos(v * 7) * 0.12 + 0.2, v - 0.5); uv.push(u, v); nor.push(0, 1, 0); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
  const parts = [new Uint8Array(new Float32Array(pos).buffer), new Uint8Array(new Float32Array(nor).buffer), new Uint8Array(new Float32Array(uv).buffer), new Uint8Array(new Uint16Array(idx).buffer), img];
  const views = []; let off = 0; const chunks = [];
  for (const p of parts) { const pad = (4 - (p.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: p.length }); chunks.push(p, new Uint8Array(pad)); off += p.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
  const nv = (N + 1) * (N + 1);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'ship' }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'hull', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.3, roughnessFactor: 0.5 } }], textures: [{ source: 0 }], images: [{ bufferView: 4, mimeType: 'image/png' }], buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: [-0.5, 0.08, -0.5], max: [0.5, 0.32, 0.5] }, { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: nv, type: 'VEC2' }, { bufferView: 3, componentType: 5123, count: idx.length, type: 'SCALAR' }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  await window.hub.fs.write(file, u);
}
// the game: a ground (two pictures), five kinds of material, four lights, shadows, a pickup that shows after 2 s
const GAME = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1220'); scene.fog = new THREE.Fog('#0d1220', 8, 30);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 3.2, 6); camera.lookAt(0, 0.5, 0);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const ground = refTexture('ground'); ground.wrapS = ground.wrapT = THREE.RepeatWrapping; ground.repeat.set(4, 2);
const detail = refTexture('detail');
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: ground, roughnessMap: detail, roughness: 0.8 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.position.set(4, 8, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
const spot = new THREE.SpotLight('#80c0ff', 30, 20, 0.5, 0.4); spot.position.set(-4, 6, 2); spot.castShadow = true; scene.add(spot);
scene.add(new THREE.PointLight('#ff6040', 15, 12), new THREE.HemisphereLight('#a0c0ff', '#302010', 0.6));
const mats = [new THREE.MeshPhysicalMaterial({ color: '#ff5080', clearcoat: 1, roughness: 0.25 }), new THREE.MeshToonMaterial({ color: '#50ff90' }), new THREE.MeshLambertMaterial({ color: '#5080ff', emissive: '#102040' }), new THREE.MeshPhongMaterial({ color: '#ffd060', shininess: 80 })];
const crates = mats.map((m, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), m); b.position.set((i - 1.5) * 1.6, 0.4, -1); b.castShadow = true; scene.add(b); return b; });
// the pickup: hidden until 2 s into play (a game's spawn), a material nothing else uses
const pickup = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1, 96, 12), new THREE.MeshPhysicalMaterial({ color: '#c0f0ff', transmission: 0.6, thickness: 0.5, iridescence: 1, roughness: 0.1 }));
pickup.position.set(0, 1.2, 1); pickup.castShadow = true; pickup.visible = false; scene.add(pickup);
const t0 = performance.now();
renderer.setAnimationLoop((now) => {
  const t = (now - t0) / 1000;
  crates.forEach((b, i) => { b.rotation.y = t * (0.5 + i * 0.2); b.position.y = 0.4 + Math.abs(Math.sin(t * 2 + i)) * 0.3; });
  pickup.visible = t > 2; pickup.rotation.y = t * 2;
  renderer.render(scene, camera);
});`;
// the HTML build: its own three.js copy, GLTFLoader + meshopt decoder, a picture, the ship; a pickup after 2 s
const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Clink</title>
<script type="importmap">{ "imports": { "three": "./three.module.js", "three/addons/": "./jsm/" } }</script>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style></head><body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101418');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 2.5, 5); camera.lookAt(0, 0.4, 0);
const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(3, 6, 2); sun.castShadow = true; scene.add(sun, new THREE.AmbientLight('#ffffff', 0.3));
const tex = new THREE.TextureLoader().load('textures/ground.jpg'); tex.colorSpace = THREE.SRGBColorSpace;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: tex })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
loader.load('models/ship.glb', (g) => { g.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.scene.scale.setScalar(2); scene.add(g.scene); window.__shipLoaded = true; });
const pickup = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), new THREE.MeshPhysicalMaterial({ color: '#80ffe0', clearcoat: 1, sheen: 1 })); pickup.position.set(0, 1.2, 1); pickup.visible = false; scene.add(pickup);
const t0 = performance.now();
renderer.setAnimationLoop((now) => { const t = (now - t0) / 1000; pickup.visible = t > 2; pickup.rotation.y = t; renderer.render(scene, camera); });
</script></body></html>`;

const ORIG = [`${DIR}/ground.jpg`, `${DIR}/detail.png`, `${DIR}/ship.glb`, `${DIR}/html-game/index.html`, `${DIR}/html-game/textures/ground.jpg`, `${DIR}/html-game/models/ship.glb`];
await safe('fixtures', async () => {
  await picture(`${DIR}/ground.jpg`, 4096, 2048);
  await picture(`${DIR}/detail.png`, 1024, 1024, 'image/png');
  await glb(`${DIR}/ship.glb`);
  const H = `${DIR}/html-game`;
  await window.hub.fs.write(`${H}/index.html`, HTML);
  await window.hub.fs.copy(`${DIR}/ground.jpg`, `${H}/textures/ground.jpg`);
  await window.hub.fs.copy(`${DIR}/ship.glb`, `${H}/models/ship.glb`);
  for (const [a, b] of [['build/three.module.js', 'three.module.js'], ['build/three.core.js', 'three.core.js'], ['examples/jsm/loaders/GLTFLoader.js', 'jsm/loaders/GLTFLoader.js'], ['examples/jsm/utils/BufferGeometryUtils.js', 'jsm/utils/BufferGeometryUtils.js'], ['examples/jsm/libs/meshopt_decoder.module.js', 'jsm/libs/meshopt_decoder.module.js']]) await window.hub.fs.copy(`${THREE_DIR}/${a}`, `${H}/${b}`);
  out.hashBefore = await window.hub.gameReady.hash(ORIG);
  step('fixtures: a 4096×2048 picture, a detail picture, a GLB ship with its texture, an HTML build', out.hashBefore.every((h) => h.hash), out.hashBefore.map((h) => [h.path.split('/').slice(-2).join('/'), h.size]));
});

// ---------- the Lab scene ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 30000);
const D = ThreeLab.director; const c = await ThreeLab.cmd();
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { text = `ERR ${e}`; } }); return text; };
const sbx = async (code) => { for (let i = 0; i < 5; i++) { const r = await D.evalInSketch(code); if (r?.ok) return r.value; await wait(600); } return null; };
if (typeof GameReady === 'undefined' && window.Lazy) await Lazy.load('gameready');
step('the gameready group loads on use', typeof GameReady !== 'undefined' && typeof GameReadyCore !== 'undefined');

// one preparation (or none: noPrep) of the open scene, right after it starts again; then 5 s of play counted
async function playOnce(label, test, { restart = true } = {}) {
  setTest(test);
  if (restart) { ThreeLab.act('restart'); await wait(300); }
  const sc = ThreeLab.game.scene();
  const t0 = performance.now();
  let maxPct = 0; let lines = new Set(); let sawCard = false;
  const prog = (p) => { maxPct = Math.max(maxPct, p.pct || 0); if (lines.size < 40) lines.add(p.text); };
  const poll = setInterval(() => { const b = document.querySelector('.gr-ready'); if (b) sawCard = true; }, 50);
  const res = await GameReady.prepare({ kind: 'lab', id: sc.id, title: 'Clink' }, prog);
  const readyMs = Math.round(performance.now() - t0);
  const st = await until(() => GRS()?.first5 && GRS(), 15000);
  clearInterval(poll);
  out.measure[label] = { readyMs, sawCard, maxPct, lines: [...lines].slice(0, 6).concat([...lines].slice(-2)), first5: st?.first5, ms: res.ms, prep: res.steps?.prep ? { compileMs: res.steps.prep.compileMs, gl: res.steps.prep.gl, textures: res.steps.prep.textures, ms: res.steps.prep.ms } : null, inventory: res.inventory, findings: res.findings?.map((f) => f.text), plan: res.plan, error: res.error };
  return { res, st, sawCard, maxPct, lines };
}

await safe('setup', async () => {
  try { c.customSize(640, 360); c.size('custom'); } catch (err) { out.sizeError = err.message; }
  await wait(800);
  const t0 = performance.now();
  await D.newSketch('Clink fixture', GAME, 1);
  await D.refs.add(`${DIR}/ground.jpg`, 'ground');
  await D.refs.add(`${DIR}/detail.png`, 'detail');
  out.model = await say(`/model add ${DIR}/ship.glb`);
  // the first preparation of this launch, right away (its time is compared with the next launch's: GPU shader disk cache)
  setTest({ hold: 0 });
  const sc = ThreeLab.game.scene();
  const r = await GameReady.prepare({ kind: 'lab', id: sc.id, title: 'Clink' });
  const createAndReadyMs = Math.round(performance.now() - t0);
  out.measure.launch = { createAndReadyMs, compileMs: r.steps?.prep?.compileMs, readyMs: r.readyMs, prepGl: r.steps?.prep?.gl, effectsMs: r.ms?.effects };
  await window.hub.fs.write(`${DIR}/launch1.json`, JSON.stringify(out.measure.launch));
  await window.hub.fs.write(`${DIR}/game-scene.js`, GAME);
  GameReady.stop();
  out.refs = ThreeLab.game.refs().map((x) => `${x.kind}:${x.name}`);
  out.layers = ThreeLab.scenes.get(ThreeLab.scenes.currentId())?.layers?.map((L) => L.name);
  step('a game-like Lab scene: two pictures, a model, five materials, four lights', out.refs.length >= 3 && out.refs.some((x) => /^model:/.test(x)) && out.layers?.length >= 2, { refs: out.refs, layers: out.layers, model: String(out.model).slice(0, 100) });
});

await safe('before', async () => {
  const r = await playOnce('before', { noPrep: true });
  step('before: played without getting ready; the first 5 s counted', Boolean(r.st?.first5), r.st?.first5);
  step('before: the GPU compiled shaders and uploaded textures during play', (r.st?.first5?.compiles || 0) + (r.st?.first5?.uploads || 0) > 0, r.st?.first5);
  GameReady.stop();
  await wait(500);
});

await safe('after', async () => {
  const r = await playOnce('after', { hold: 1200 });
  const f5 = r.st?.first5;
  step('after: the card showed, with progress to 100 %', r.sawCard && r.maxPct === 100, { sawCard: r.sawCard, maxPct: r.maxPct });
  step('after: its words: "Getting Clink ready… textures n/m"', [...r.lines].some((t) => /^Getting Clink ready… /.test(t)) && [...r.lines].some((t) => /textures \d+\/\d+/.test(t)), [...r.lines].slice(0, 8));
  step('after: 0 shaders compiled and 0 textures uploaded in the first 5 s of play (the pickup shows at 2 s)', f5 && f5.compiles === 0 && f5.links === 0 && f5.uploads === 0, f5);
  step('after: quality held (locked, every layer at its own resolution)', f5?.lock === true && f5?.level === 0, f5);
  const inv = r.res.steps?.scan;
  step('after: every texture found, at the best anisotropy', (inv?.textures || 0) >= 3 && (r.res.inventory?.aniso >= 0), { textures: inv?.textures, aniso: r.res.inventory?.aniso });
  const aniso = await sbx(`(() => { let lo = 99, hi = 0, n = 0; for (const r of renderers) { if (r.__stale || r.__gutted) continue; const max = r.capabilities.getMaxAnisotropy(); for (const sc of new Set([...(r.__seen || []), r.__lastScene])) sc?.traverse?.((o) => { const m = o.material; for (const mm of Array.isArray(m) ? m : m ? [m] : []) for (const v of Object.values(mm)) if (v?.isTexture && !v.isVideoTexture && !v.isRenderTargetTexture) { n++; lo = Math.min(lo, v.anisotropy / max); hi = Math.max(hi, v.anisotropy); } }); } return { n, lo, hi }; })()`);
  step('after: textures at the graphics card\'s best anisotropy', aniso && aniso.n >= 3 && aniso.lo === 1, aniso);
  step('after: what it found (the 4K picture and what it costs, the shaders)', r.res.findings?.some((f) => f.kind === 'big-textures' && /1 texture is 4K — it costs \d+ MB of video memory/.test(f.text)) && r.res.findings?.some((f) => f.kind === 'shaders'), r.res.findings?.map((f) => f.text));
  GameReady.stop();
  await wait(500);
});

// ---------- Optimize for play ----------
await safe('optimize: no encoder', async () => {
  setTest({ tool: '/nonexistent/gltfpack', hold: 0 });
  ThreeLab.act('restart'); await wait(300);
  const sc = ThreeLab.game.scene();
  const p = GameReady.prepare({ kind: 'lab', id: sc.id, title: 'Clink' });
  const btn = await until(() => [...document.querySelectorAll('.gr-ready .gr-btn')].find((b) => b.textContent === 'Optimize for play' && !b.hidden), 20000);
  step('optimize: the card offers Optimize for play (a model without a copy)', Boolean(btn));
  btn?.click();
  const cmd = await until(() => { const e = document.querySelector('.gr-ready .gr-cmd'); return e && !e.hidden && e.textContent; }, 8000);
  const main = document.querySelector('.gr-ready .gr-main')?.textContent;
  step('optimize: no encoder → the install command is shown with Install, nothing run yet', /npm install -g gltfpack/.test(cmd || '') && main === 'Install' && !GameReady.lastInstall?.(), { cmd, main });
  [...document.querySelectorAll('.gr-ready .gr-btn')].find((b) => b.textContent === 'Not now')?.click();
  await wait(200);
  GameReady.stop();
  await Promise.race([p, wait(5000)]);
  step('optimize: Esc / leaving takes the card away', !document.querySelector('.gr-ready:not(.out)'));
});

const haveTool = Boolean(await window.hub.fs.stat(TOOL).catch(() => null));
out.haveTool = haveTool;
if (haveTool) await safe('optimize: with gltfpack', async () => {
  setTest({ tool: TOOL, hold: 0 });
  const sc = ThreeLab.game.scene();
  // a preparation knows the scene's models; optimizing is one call (the card's button does the same)
  await GameReady.prepare({ kind: 'lab', id: sc.id, title: 'Clink' }, null, { play: false });
  const res = await GameReady.optimize();
  out.optimize = { ok: res.ok, made: res.made, skipped: res.skipped, failed: res.failed, textures: res.textures, fresh: res.fresh?.length };
  step('optimize: the model\'s optimized copy made in Hearth\'s cache (smaller)', res.ok && res.made?.length === 1 && res.made[0].bytes < res.made[0].srcBytes && /game-cache/.test(res.made[0].out), out.optimize);
  GameReady.stop(); await wait(400);
  const r = await playOnce('optimized', { tool: TOOL, hold: 0 });
  const map = GameReady._map();
  step('optimize: the next preparation uses the copy (the rewrite map)', r.res.plan?.swapped === 1 && Object.values(map)[0]?.includes('game-cache'), { plan: r.res.plan, map });
  const shipRef = ThreeLab.game.refs().find((x) => x.kind === 'model');
  const bytes = await sbx(`fetch(refs.${shipRef.key}).then((r) => r.arrayBuffer()).then((b) => b.byteLength)`);
  step('optimize: the Lab reads the copy (the sketch\'s model reference is the optimized size)', bytes === res.made?.[0]?.bytes, { bytes, made: res.made?.[0]?.bytes });
  const errs = await sbx(`(window.__labErrors || []).length`);
  const drawn = await sbx(`(() => { let n = 0; for (const r of renderers) { if (r.__stale) continue; r.__lastScene?.traverse?.((o) => { if (o.isMesh && o.geometry?.attributes?.position?.count === 2401) n++; }); } return n; })()`);
  step('optimize: the optimized ship is in the scene (meshopt decoded, same vertex count)', drawn >= 1, { drawn, errs });
  step('optimize: 0 compiles / uploads in the first 5 s of play on the optimized copy', r.st?.first5?.compiles === 0 && r.st?.first5?.uploads === 0, r.st?.first5);
  GameReady.stop(); await wait(400);
  step('optimize: leaving the game reads the original again', Object.keys(GameReady._map()).length === 0);
});

// ---------- an HTML build ----------
async function playHtml(label, test) {
  setTest(test);
  const t0 = performance.now(); let maxPct = 0; const lines = new Set();
  const res = await GameReady.prepare({ kind: 'html', path: `${DIR}/html-game/index.html`, title: 'Clink' }, (p) => { maxPct = Math.max(maxPct, p.pct || 0); if (lines.size < 30) lines.add(p.text); });
  const st = await until(() => GRS()?.first5 && GRS(), 20000);
  out.measure[label] = { readyMs: Math.round(performance.now() - t0), maxPct, lines: [...lines].slice(0, 5), first5: st?.first5, steps: res.steps?.page, inventory: res.inventory, findings: res.findings?.map((f) => f.text), plan: res.plan, loaded: res.loaded, error: res.error };
  return { res, st, maxPct };
}
await safe('html', async () => {
  const b = await playHtml('htmlBefore', { noPrep: true });
  step('html: played without getting ready in its own window; the GPU compiled / uploaded during play', ((b.st?.first5?.compiles || 0) + (b.st?.first5?.uploads || 0)) > 0, b.st?.first5);
  GameReady.stop(); await wait(800);
  const a = await playHtml('htmlAfter', {});
  step('html: got ready (progress to 100 %), then 0 compiles and 0 uploads in the first 5 s of play', a.maxPct === 100 && a.st?.first5?.compiles === 0 && a.st?.first5?.uploads === 0, { maxPct: a.maxPct, first5: a.st?.first5, error: a.res.error });
  step('html: the warm run listed what the game loaded (picture, model, decoder)', (a.res.loaded || 0) >= 3 && (a.res.inventory?.decoders || []).includes('meshopt'), { loaded: a.res.loaded, decoders: a.res.inventory?.decoders });
  GameReady.stop(); await wait(800);
  if (haveTool) {
    setTest({ tool: TOOL });
    const p = GameReady.prepare({ kind: 'html', path: `${DIR}/html-game/index.html`, title: 'Clink' });
    await until(() => GameReady.current()?.models >= 1, 20000);
    const o = await GameReady.optimize();
    await p; GameReady.stop(); await wait(800);
    const c3 = await playHtml('htmlOptimized', { tool: TOOL });
    const served = await window.hub.gameReady.served();
    const ship = served.filter((x) => /ship\.glb$/.test(x.rel));
    step('html: optimized → the window serves the copy for models/ship.glb (URL rewrite)', o.ok && o.made?.length === 1 && ship.length && ship.every((x) => x.swapped), { made: o.made?.length, ship, plan: c3.res.plan });
    const loaded = await until(async () => (await window.hub.gameReady.served()).length && c3.st?.first5, 3000);
    step('html: the game still plays on the copy: 0 compiles / uploads in its first 5 s', c3.st?.first5?.compiles === 0 && c3.st?.first5?.uploads === 0 && Boolean(loaded), c3.st?.first5);
    GameReady.stop(); await wait(500);
  }
});

// ---------- the owner's files ----------
await safe('files', async () => {
  const after = await window.hub.gameReady.hash(ORIG);
  const same = after.every((h, i) => h.hash === out.hashBefore[i].hash && h.size === out.hashBefore[i].size);
  step('files: every original byte for byte the same after preparing, optimizing and playing', same, after.map((h, i) => (h.hash === out.hashBefore[i].hash ? 'same' : `CHANGED ${h.path}`)));
});
setTest(null);
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, measure: out.measure, optimize: out.optimize, haveTool }, null, 1);
