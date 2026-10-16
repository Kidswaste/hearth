// ▶ Play, got ready (round 52, gameready): ▶ Play (GameMode.play: its one game window) on a game-like Lab scene (the
// main path) and an HTML build. GameReady arms the window before it opens; the getting ready runs inside it.
//   setup    a throwaway "Clink" Lab scene: a ground with a 4096×2048 picture and a 1024² detail picture, a 🧊 ship
//            model (GLB with its own texture), five kinds of material, four lights (two casting shadows), and a pickup
//            that only shows 2 s into play (its shaders never drew before)
//   launch   the first ▶ Play of this launch (cold): its page's whole wait on shader work is kept in
//            /tmp/hearth-gameready/launch1.json for dev/checks/gameready-relaunch.js (same profile: the shader disk cache)
//   before   ▶ Play without getting ready: what the GPU compiles / uploads in the first 5 s of play
//   after    ▶ Play: the card in the game window before the scene's first frame ("Getting Clink ready… textures n/m"),
//            then 0 compiles and 0 new uploads in the first 5 s; textures at the best anisotropy; quality held; what it
//            found ("1 texture is 4K — …"); one window (hearth-game:)
//   optimize the card's Optimize for play without an encoder: the install command shown, nothing run; with gltfpack (a
//            throwaway copy, if run-checks could install one): the model's optimized copy in Hearth's cache, used by the
//            next ▶ Play (the window's page has the copy), the model drawn, 0 compiles / uploads in play again
//   html     an HTML build (index.html + three.js + GLTFLoader + meshopt, a picture, the ship): ▶ Play without and with
//            getting ready, its files kept; optimized → the window serves the copy for models/ship.glb by URL rewrite
//   files    every original file hashed before and after: unchanged
//   node dev/smoke.js --check-timeout 1500000 --profile /tmp/hearth-gameready-profile --profile-fresh --script dev/checks/gameready.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); window.hub?.fs?.write('/tmp/hearth-gameready/progress.json', JSON.stringify(out, null, 1)).catch(() => {}); };
// (each part at most 6 minutes: a stuck part is reported and the next one runs)
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 6 min`)), 360000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const DIR = '/tmp/hearth-gameready';
const BASE = "import * as THREE from 'three';\nconst renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);\nconst scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 10);\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));";
const TOOL = '/tmp/hearth-gameready-tools/node_modules/.bin/gltfpack';
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
const setTest = (o) => (o ? localStorage.setItem('gameready.test', JSON.stringify(o)) : localStorage.removeItem('gameready.test'));
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
  for (const [a, b] of [['build/three.module.js', 'three.module.js'], ['build/three.core.js', 'three.core.js'], ['examples/jsm/loaders/GLTFLoader.js', 'jsm/loaders/GLTFLoader.js'], ['examples/jsm/utils/BufferGeometryUtils.js', 'jsm/utils/BufferGeometryUtils.js'], ['examples/jsm/utils/SkeletonUtils.js', 'jsm/utils/SkeletonUtils.js'], ['examples/jsm/libs/meshopt_decoder.module.js', 'jsm/libs/meshopt_decoder.module.js']]) await window.hub.fs.copy(`${THREE_DIR}/${a}`, `${H}/${b}`);
  out.hashBefore = await window.hub.gameReady.hash(ORIG);
  step('fixtures: a 4096×2048 picture, a detail picture, a GLB ship with its texture, an HTML build', out.hashBefore.every((h) => h.hash), out.hashBefore.map((h) => [h.path.split('/').slice(-2).join('/'), h.size]));
});

// ---------- the Lab scene, played with ▶ Play (GameMode: its own window; GameReady prepares inside it) ----------
await Lazy.load('gamemode'); await Lazy.load('gameready');
step('the gamemode and gameready groups load on use', typeof GameMode !== 'undefined' && typeof GameReady !== 'undefined' && typeof GameReadyCore !== 'undefined');
const GW = () => window.hub.game;
const ev = async (code) => (await GW().eval(code))?.value;
const playingNow = async () => (await GW().state())?.playing;
let lab = null;
// one ▶ Play: the window opens, gets ready behind its card (or not: noPrep), plays 5 s counted; then it's left
async function playGame(label, source, test, { during } = {}) {
  setTest(test);
  const t0 = performance.now();
  let sawCard = null; let maxPct = 0; const lines = new Set();
  const p = GameMode.play(source);
  // the card in the window, sampled while it gets ready
  const watch = (async () => { const t = Date.now(); while (Date.now() - t < 150000) { const v = await ev('window.__gameReady ? window.__gameReady.pub() : null').catch(() => null); if (v) { const o = JSON.parse(v); if (o.card) sawCard ??= Math.round(performance.now() - t0); maxPct = Math.max(maxPct, o.pct || 0); if (o.text && lines.size < 200) lines.add(o.text); for (const t of o.shown || []) if (lines.size < 200) lines.add(t); /* (round 54) every line the card showed, even between two polls */ if (o.phase === 'playing') return; } await wait(150); } })();
  if (during) await during();
  await p; await watch;
  const st = await until(() => GameReady.state()?.first5 && GameReady.state(), 30000);
  out.measure[label] = { openToReadyMs: st?.readyMs, sawCardAtMs: sawCard, maxPct, lines: [...lines].slice(0, 5).concat([...lines].slice(-2)), page: st?.page, first5: st?.first5, result: st?.result ? { ms: st.result.ms, steps: st.result.steps, prep: st.result.prep, gl: st.result.gl, total: st.result.total, inventory: st.result.inventory && { ...st.result.inventory, textures: st.result.inventory.textures?.length } } : null, findings: st?.findings?.map((f) => f.text), plan: st?.plan, loaded: st?.loaded, decoders: st?.decoders };
  return { st, sawCard, maxPct, lines };
}
async function leaveGame() { await GameMode.leave(); await until(async () => !(await playingNow()), 10000); await wait(800); }

// the launch measure: a scene written straight to the store and played BEFORE the Lab opens, so no preview of it compiled
// its shaders in this run (the GPU process would keep them in memory): what ▶ Play pays cold vs with the disk cache
const LAUNCH_ID = 'grlaunch';
async function storeScene() {
  const sk = (await window.hub.kvGet('three-sketches', [])) || [];
  if (!sk.some((x) => x.id === LAUNCH_ID)) { sk.push({ id: LAUNCH_ID, name: 'Clink', layers: [{ id: 'game', name: 'Game', code: GAME }], createdAt: Date.now(), updatedAt: Date.now() }); await window.hub.kvSet('three-sketches', sk); }
  const refs = (await window.hub.kvGet('three-refs', {})) || {};
  refs[LAUNCH_ID] = [{ id: 'g1', key: 'ground', kind: 'image', name: 'ground.jpg', path: `${DIR}/ground.jpg` }, { id: 'g2', key: 'detail', kind: 'image', name: 'detail.png', path: `${DIR}/detail.png` }];
  await window.hub.kvSet('three-refs', refs);
  return { kind: 'lab', id: LAUNCH_ID, title: 'Clink' };
}

// the first ▶ Play of this launch, got ready (cold: no compiled shader of it anywhere yet); its page's whole shader wait
// is what the next launch compares with (dev/checks/gameready-relaunch.js)
await window.hub.fs.write(`${DIR}/game-scene.js`, GAME);
await safe('launch', async () => {
  const r = await playGame('launch', await storeScene(), {});
  out.measure.launchCompare = { shaderWaitMs: r.st?.result?.total?.waitMs, firstFrameMs: Math.round(r.st?.page?.firstFrameAt || 0), links: r.st?.result?.total?.links, readyMs: r.st?.result?.ms, effectsMs: r.st?.result?.steps?.effects };
  await window.hub.fs.write(`${DIR}/launch1.json`, JSON.stringify(out.measure.launchCompare));
  step('the first ▶ Play of the launch got ready and played', Boolean(r.st?.first5 && r.st?.result), out.measure.launchCompare);
  await leaveGame();
});

activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 30000);
const D = ThreeLab.director;
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { text = `ERR ${e}`; } }); return text; };

await safe('setup', async () => {
  // (the references first, then the game's layer: a layer run before its references throws "No reference")
  await D.newSketch('Clink', BASE, 1);
  await D.refs.add(`${DIR}/ground.jpg`, 'ground');
  await D.refs.add(`${DIR}/detail.png`, 'detail');
  await D.addLayer({ name: 'Game', code: GAME }, 2);
  out.model = await say(`/model add ${DIR}/ship.glb`);
  await wait(2500); // (the references and layers on disk: ▶ Play reads the saved scene)
  const sk = ThreeLab.scenes.get(ThreeLab.scenes.currentId());
  lab = { kind: 'lab', id: sk.id, title: 'Clink' };
  out.layers = sk?.layers?.map((L) => L.name);
  const refs = ((await window.hub.kvGet('three-refs', {})) || {})[sk.id] || [];
  out.refs = refs.map((x) => `${x.kind}:${x.name}`);
  step('a game-like Lab scene: two pictures, a model, five materials, four lights', refs.length >= 3 && refs.some((x) => x.kind === 'model') && out.layers?.length >= 2, { refs: out.refs, layers: out.layers, model: String(out.model).slice(0, 100) });
});


await safe('before', async () => {
  const r = await playGame('before', lab, { noPrep: true });
  step('before: ▶ Play without getting ready; the first 5 s counted', Boolean(r.st?.first5), r.st?.first5);
  step('before: the GPU compiled shaders or uploaded textures while playing', (r.st?.first5?.compiles || 0) + (r.st?.first5?.uploads || 0) > 0, r.st?.first5);
  await leaveGame();
});

await safe('after', async () => {
  const r = await playGame('after', lab, {});
  const f5 = r.st?.first5; const pg = r.st?.page;
  step('after: the card shows in ▶ Play\'s window before the scene\'s first frame', pg?.cardAt != null && pg?.firstFrameAt != null && pg.cardAt < pg.firstFrameAt, { cardAt: pg?.cardAt, firstFrameAt: pg?.firstFrameAt, sawCardAtMs: r.sawCard });
  step('after: progress to 100 % with its words ("Getting Clink ready… textures n/m")', r.maxPct === 100 && [...r.lines].some((t) => /^Getting Clink ready… /.test(t)) && [...r.lines].some((t) => /textures \d+\/\d+/.test(t)), [...r.lines].slice(0, 8));
  step('after: 0 shaders compiled and 0 textures uploaded in the first 5 s of play (the pickup shows at 2 s)', f5 && f5.compiles === 0 && f5.links === 0 && f5.uploads === 0, f5);
  step('after: quality held (locked, full resolution)', f5?.lock === true && f5?.level === 0, f5);
  step('after: every texture found (ground, detail, the ship\'s own)', (r.st?.result?.inventory?.textures?.length || 0) >= 3, { textures: r.st?.result?.inventory?.textures?.length });
  const aniso = await ev(`(() => { let lo = 99, hi = 0, n = 0; for (const r of __rdyLive()) { const max = r.capabilities.getMaxAnisotropy(); for (const sc of new Set([...(r.__seen || []), r.__lastScene])) sc?.traverse?.((o) => { const m = o.material; for (const mm of Array.isArray(m) ? m : m ? [m] : []) for (const v of Object.values(mm)) if (v?.isTexture && !v.isVideoTexture && !v.isRenderTargetTexture) { n++; lo = Math.min(lo, v.anisotropy / max); hi = Math.max(hi, v.anisotropy); } }); } return { n, lo, hi }; })()`);
  step('after: textures at the graphics card\'s best anisotropy', aniso && aniso.n >= 3 && aniso.lo === 1, aniso);
  step('after: what it found (the 4K picture and what it costs, the shaders)', r.st?.findings?.some((f) => f.kind === 'big-textures' && /1 texture is 4K — it costs \d+ MB of video memory/.test(f.text)) && r.st?.findings?.some((f) => f.kind === 'shaders'), r.st?.findings?.map((f) => f.text));
  const one = JSON.parse((await ev('JSON.stringify({ url: location.href.split("?")[0], card: Boolean(document.querySelector("gameready-card")) })')) || '{}');
  step('one window, the game\'s own (hearth-game:): the card gone while playing', /^hearth-game:\/\/[0-9a-f]+\/play\.html$/.test(one.url || '') && one.card === false, one);
  await leaveGame();
});

// ---------- Optimize for play ----------
await safe('optimize: no encoder', async () => {
  let cmd = null; let main = null; let offered = false;
  await playGame('noEncoder', lab, { tool: '/nonexistent/gltfpack' }, { during: async () => {
    offered = await until(() => ev('(() => { const r = document.querySelector("gameready-card")?.shadowRoot; const o = r?.querySelector(".o"); if (!o || o.hidden) return false; o.click(); return true; })()'), 60000);
    cmd = await until(() => ev('(() => { const r = document.querySelector("gameready-card")?.shadowRoot; const k = r?.querySelector(".k"); return k && !k.hidden ? k.textContent : null; })()'), 20000);
    main = await ev('document.querySelector("gameready-card")?.shadowRoot?.querySelector(".m")?.textContent');
    await ev('document.querySelector("gameready-card")?.shadowRoot?.querySelector(".o")?.click()'); // Not now
  } });
  step('optimize: the card in ▶ Play\'s window offers Optimize for play (a model without a copy)', offered);
  step('optimize: no encoder → the install command shown with Install, nothing run', /npm install -g gltfpack/.test(cmd || '') && main === 'Install' && !GameReady.lastInstall(), { cmd, main });
  await leaveGame();
});

const haveTool = Boolean(await window.hub.fs.stat(TOOL).catch(() => null));
out.haveTool = haveTool;
if (haveTool) await safe('optimize: with gltfpack', async () => {
  setTest({ tool: TOOL });
  const res = await GameReady.optimize(lab);
  out.optimize = { ok: res.ok, made: res.made, skipped: res.skipped, failed: res.failed, textures: res.textures, fresh: res.fresh?.length };
  step('optimize: the model\'s optimized copy made in Hearth\'s cache (smaller)', res.ok && res.made?.length === 1 && res.made[0].bytes < res.made[0].srcBytes && /game-cache/.test(res.made[0].out), out.optimize);
  const r = await playGame('optimized', lab, { tool: TOOL });
  step('optimize: the next ▶ Play uses the copy (the rewrite map)', r.st?.plan?.swapped === 1, r.st?.plan);
  const bytes = await ev('fetch("assets/ship.glb").then((r) => r.arrayBuffer()).then((b) => b.byteLength)');
  step('optimize: the window\'s page has the copy (its ship is the optimized size)', bytes === res.made?.[0]?.bytes, { bytes, made: res.made?.[0]?.bytes });
  const drawn = await ev('(() => { let n = 0; for (const r of __rdyLive()) r.__lastScene?.traverse?.((o) => { if (o.isMesh && o.geometry?.attributes?.position?.count === 2401) n++; }); return n; })()');
  step('optimize: the optimized ship is in the scene (meshopt decoded, same vertex count)', drawn >= 1, { drawn });
  step('optimize: 0 compiles / uploads in the first 5 s of play on the optimized copy', r.st?.first5?.compiles === 0 && r.st?.first5?.uploads === 0, r.st?.first5);
  await leaveGame();
});

// ---------- an HTML build, played with ▶ Play ----------
const html = { kind: 'html', path: `${DIR}/html-game/index.html`, title: 'Clink' };
await safe('html', async () => {
  const b = await playGame('htmlBefore', html, { noPrep: true });
  step('html: ▶ Play without getting ready; the GPU compiled / uploaded during play', ((b.st?.first5?.compiles || 0) + (b.st?.first5?.uploads || 0)) > 0, b.st?.first5);
  await leaveGame();
  const a = await playGame('htmlAfter', html, {});
  const pg = a.st?.page;
  step('html: the card in the window before the game\'s first frame; progress to 100 %; 0 compiles and 0 uploads in its first 5 s', a.maxPct === 100 && pg?.cardAt != null && (pg.firstFrameAt == null || pg.cardAt < pg.firstFrameAt) && a.st?.first5?.compiles === 0 && a.st?.first5?.uploads === 0, { maxPct: a.maxPct, cardAt: pg?.cardAt, firstFrameAt: pg?.firstFrameAt, first5: a.st?.first5, errors: pg?.errors });
  step('html: what the game loaded kept for the next launch (picture, model, decoder)', (a.st?.loaded || 0) >= 3 && (a.st?.decoders || []).includes('meshopt'), { loaded: a.st?.loaded, decoders: a.st?.decoders });
  await leaveGame();
  if (haveTool) {
    setTest({ tool: TOOL });
    const o = await GameReady.optimize(html);
    const c3 = await playGame('htmlOptimized', html, { tool: TOOL });
    const served = await window.hub.gameReady.served();
    const ship = served.filter((x) => /ship\.glb$/.test(x.rel));
    // (the same bytes as the Lab's ship: the copy made for the Lab is found by its hash, nothing made twice)
    step('html: optimized → the window serves the copy for models/ship.glb (URL rewrite; the Lab\'s copy of the same bytes reused)', o.ok && (o.made?.length || 0) + (o.fresh?.length || 0) >= 1 && ship.length && ship.every((x) => x.swapped), { made: o.made?.length, fresh: o.fresh?.length, ship, plan: c3.st?.plan });
    step('html: the game plays on the copy: 0 compiles / uploads in its first 5 s', c3.st?.first5?.compiles === 0 && c3.st?.first5?.uploads === 0, c3.st?.first5);
    await leaveGame();
  }
});

// ---------- the owner's files ----------
await safe('files', async () => {
  const after = await window.hub.gameReady.hash(ORIG);
  const same = after.every((h, i) => h.hash === out.hashBefore[i].hash && h.size === out.hashBefore[i].size);
  step('files: every original byte for byte the same after preparing, optimizing and playing', same, after.map((h, i) => (h.hash === out.hashBefore[i].hash ? 'same' : `CHANGED ${h.path}`)));
});
setTest(null);
// (Chromium writes its shader disk cache a moment after the programs are made; the harness then stops the app
// abruptly, not like a real quit: a few quiet seconds so the next launch finds what this one compiled)
await wait(8000);
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, measure: out.measure, optimize: out.optimize, haveTool }, null, 1);
