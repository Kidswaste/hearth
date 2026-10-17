// ▶ Play, ready sooner (round 56, readyspeed): from ▶ Play to the first frame of play, cold (a fresh Chromium profile and
// data folder: nothing compiled or remembered yet) and warm (the same game again, twice), for a Lab scene and an HTML build.
//   setup    a throwaway "Clink" Lab scene written straight to the store (a 4096×2048 picture and a 1024² detail map,
//            five kinds of material, four lights, shadows, a pickup 2 s into play; played before the Lab ever opens: no
//            preview compiles it first) and an HTML build (its own three.js, GLTFLoader + meshopt, a picture, a GLB ship)
//   each run the press → the window → the card → each step of getting ready (loading, shaders + textures, warm-up frames,
//            the smooth check (playbudget's A/B), …) → the card goes → the first frame of play (GameReady.state().speed,
//            all on one clock); the first 5 s of play counted (0 compiles / 0 uploads, every run)
//   verdict  warm ≤ 0.85 × cold + 0.3 s for each kind, the smooth check's shadow walk aside (the regression threshold),
//            the warm runs reusing the helpers' cost verdict, the card's "Ready in x s (was y s)"
//            shown once (the first warm run) and not again, /game ready lists the steps, the game's files untouched
// window.RS_REPORT = 1 only reports (no verdict on times).
//   node dev/smoke.js --check-timeout 1500000 --script dev/checks/readyspeed.js   (a fresh profile and scratch folder per run: cold, then warm in the same run)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], runs: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); window.hub?.fs?.write(`${DIR}/progress.json`, JSON.stringify(out, null, 1)).catch(() => {}); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 8 min`)), 480000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const TMP = window.SMOKE_TMP || '/tmp'; // (round 56, fixes56) this run's own scratch folder (dev/smoke.js --tmp)
const DIR = `${TMP}/hearth-readyspeed`;
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

// ---------- fixtures (throwaway files: the "owner's game") ----------
async function picture(file, w, h, type = 'image/jpeg') {
  const c = new OffscreenCanvas(w, h); const g = c.getContext('2d');
  for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) { g.fillStyle = `hsl(${(x * 3 + y) % 360} 55% ${35 + ((x * 7 + y * 13) % 30)}%)`; g.fillRect(x, y, 128, 128); }
  const u8 = new Uint8Array(await (await c.convertToBlob({ type, quality: 0.9 })).arrayBuffer());
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
// the Lab game (dev/checks/gameready.js' "Clink"): a ground with two pictures, five materials, four lights, shadows, a pickup at 2 s
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
const pickup = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1, 96, 12), new THREE.MeshPhysicalMaterial({ color: '#c0f0ff', transmission: 0.6, thickness: 0.5, iridescence: 1, roughness: 0.1 }));
pickup.position.set(0, 1.2, 1); pickup.castShadow = true; pickup.visible = false; scene.add(pickup);
const t0 = performance.now();
renderer.setAnimationLoop((now) => {
  const t = (now - t0) / 1000;
  crates.forEach((b, i) => { b.rotation.y = t * (0.5 + i * 0.2); b.position.y = 0.4 + Math.abs(Math.sin(t * 2 + i)) * 0.3; });
  pickup.visible = t > 2; pickup.rotation.y = t * 2;
  renderer.render(scene, camera);
});`;
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
const H = `${DIR}/html-game`;
const ORIG = [`${DIR}/ground.jpg`, `${DIR}/detail.png`, `${H}/index.html`, `${H}/textures/ground.jpg`, `${H}/models/ship.glb`];
await safe('fixtures', async () => {
  await picture(`${DIR}/ground.jpg`, 4096, 2048);
  await picture(`${DIR}/detail.png`, 1024, 1024, 'image/png');
  await window.hub.fs.write(`${H}/index.html`, HTML);
  await window.hub.fs.copy(`${DIR}/ground.jpg`, `${H}/textures/ground.jpg`);
  await glb(`${H}/models/ship.glb`);
  for (const [a, b] of [['build/three.module.js', 'three.module.js'], ['build/three.core.js', 'three.core.js'], ['examples/jsm/loaders/GLTFLoader.js', 'jsm/loaders/GLTFLoader.js'], ['examples/jsm/utils/BufferGeometryUtils.js', 'jsm/utils/BufferGeometryUtils.js'], ['examples/jsm/utils/SkeletonUtils.js', 'jsm/utils/SkeletonUtils.js'], ['examples/jsm/libs/meshopt_decoder.module.js', 'jsm/libs/meshopt_decoder.module.js']]) await window.hub.fs.copy(`${THREE_DIR}/${a}`, `${H}/${b}`);
  out.hashBefore = await window.hub.gameReady.hash(ORIG);
  step('fixtures: a Lab scene\'s two pictures, an HTML build (three.js, a picture, a GLB ship)', out.hashBefore.every((h) => h.hash));
});

// ---------- one ▶ Play, timed (GameReady.state().speed: the press → the first frame of play) ----------
await Lazy.load('gamemode'); await Lazy.load('gameready');
const GW = () => window.hub.game;
const ev = async (code) => (await GW().eval(code))?.value;
const ID = 'rslab';
async function storeScene() {
  for (let i = 0; i < 5; i++) {
    const sk = (await window.hub.kvGet('three-sketches', [])) || [];
    if (sk.some((x) => x.id === ID)) break;
    sk.push({ id: ID, name: 'Clink', layers: [{ id: 'game', name: 'Game', code: GAME }], createdAt: Date.now(), updatedAt: Date.now() });
    await window.hub.kvSet('three-sketches', sk);
  }
  const refs = (await window.hub.kvGet('three-refs', {})) || {};
  refs[ID] = [{ id: 'g1', key: 'ground', kind: 'image', name: 'ground.jpg', path: `${DIR}/ground.jpg` }, { id: 'g2', key: 'detail', kind: 'image', name: 'detail.png', path: `${DIR}/detail.png` }];
  await window.hub.kvSet('three-refs', refs);
  return { kind: 'lab', id: ID, title: 'Clink' };
}
async function playOnce(label, source) {
  localStorage.removeItem('gameready.test');
  let speedSeen = '';
  const p = GameMode.play(source);
  // the card's last words (the "Ready in x s (was y s)" line shows as the card goes)
  const watch = (async () => { const t = Date.now(); while (Date.now() - t < 180000) { const v = await ev('window.__gameReady ? JSON.stringify({ phase: window.__gameReady.phase, line: window.__gameReady.speedLine || "", first5: Boolean(window.__gameReady.first5) }) : null').catch(() => null); if (v) { const o = JSON.parse(v); if (o.line) speedSeen = o.line; if (o.first5) return; } await wait(150); } })();
  await p; await watch;
  const st = await until(() => GameReady.state()?.first5 && GameReady.state()?.speed && GameReady.state(), 30000);
  const sp = st?.speed;
  const r = out.runs[label] = { total: sp?.total, toWindow: sp?.toWindow, toCard: sp?.toCard, toFirstFrame: sp?.toFirstFrame, toReady: sp?.toReady, steps: Object.fromEntries((sp?.steps || []).map((s) => [s.id, s.ms])), side: Object.fromEntries((sp?.side || []).map((s) => [s.id, s.ms])), first5: st?.first5 && { compiles: st.first5.compiles, links: st.first5.links, uploads: st.first5.uploads, gpuLost: st.first5.gpuLost || 0 }, ab: st?.result?.ab ? { ms: st.result.ab.ms, reused: Boolean(st.result.ab.reused), judge: st.result.ab.judge || null, turnedOff: st.result.ab.turnedOff } : null, warmGl: st?.result?.warm || null, warm: (st?.result?.warm || []).map((g) => (g ? (g.compiles || 0) + (g.links || 0) + (g.uploads || 0) : null)), hints: st?.page?.hints || null, speedLine: speedSeen || st?.page?.speedLine || '', errors: st?.page?.errors };
  r.entry = await until(async () => { const e = await window.hub.gameReady.speed({ op: 'get', source }); return e && e.at > Date.now() - 60000 ? e : null; }, 5000) || null; // (what the next run learns from)
  await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(1000);
  return r;
}
const clean = (f) => f && f.compiles === 0 && f.links === 0 && f.uploads === 0;
const RATIO = 0.85; const SLACK = 300;
for (const [kind, src] of [['lab', null], ['html', { kind: 'html', path: `${H}/index.html`, title: 'Clink' }]]) {
  await safe(kind, async () => {
    const s = src || await storeScene();
    const cold = await playOnce(`${kind}Cold`, s);
    const warm = await playOnce(`${kind}Warm`, s);
    const warm2 = await playOnce(`${kind}Warm2`, s);
    step(`${kind}: every step timed on one clock (window, card, steps, first frame of play)`, cold.total > 0 && warm.total > 0 && Object.keys(cold.steps).length >= 5, { cold: cold.steps, warm: warm.steps });
    step(`${kind}: 0 compiles / 0 uploads in the first 5 s of play, cold and warm`, clean(cold.first5) && clean(warm.first5) && clean(warm2.first5), { cold: cold.first5, warm: warm.first5, warm2: warm2.first5 });
    const best = Math.min(warm.total, warm2.total);
    out.runs[`${kind}Faster`] = `${cold.total} → ${warm.total} / ${warm2.total} ms (${Math.round((1 - best / cold.total) * 100)} % less)`;
    // (after fixes56 / shadowready) the smooth check also chooses the Best look's shadow size, confirmed again from the
    // remembered size every run: on this software GPU nothing fits the refresh, so that walk takes seconds each time.
    // The threshold is on getting ready without that step; the step itself must not measure the helpers' cost again
    const noAb = (r) => r.total - (r.steps.ab || 0);
    const bestNoAb = Math.min(noAb(warm), noAb(warm2));
    const reg = ReadySpeedCore.regression(noAb(cold), bestNoAb, { ratio: RATIO, slack: SLACK });
    step(`${kind}: warm ≤ ${RATIO} × cold + ${SLACK} ms (the smooth check's shadow walk aside)`, window.RS_REPORT || reg.ok, { cold: noAb(cold), warm: noAb(warm), warm2: noAb(warm2), totals: [cold.total, warm.total, warm2.total], ...reg });
    step(`${kind}: the warm runs reuse the helpers' cost verdict (only the shadow size is confirmed)`, warm.ab?.reused && warm2.ab?.reused && !cold.ab?.reused, { cold: cold.ab, warm: warm.ab, warm2: warm2.ab });
    step(`${kind}: "Ready in x s (was y s)" said once (the first faster run), not again`, window.RS_REPORT || (!cold.speedLine && [warm, warm2].filter((r) => r.speedLine).length <= 1 && [warm, warm2].every((r) => !r.speedLine || /^Ready in \d+\.\d s \(was \d+\.\d s\)$/.test(r.speedLine)) && (Boolean(warm.speedLine || warm2.speedLine) || best > cold.total * 0.8)) /* (said only when clearly sooner: ≥ 15 %) */, { cold: cold.speedLine, warm: warm.speedLine, warm2: warm2.speedLine });
  });
}

await safe('/game ready', async () => {
  const said = String(await Commands.get('game').run('ready'));
  out.said = said;
  step('/game ready: from ▶ Play to the first frame of play, each step\'s time', /From ▶ Play to the first frame of play: \d+\.\d s/.test(said) && /shaders|loading|textures/.test(said) && /\d+ ms/.test(said), said.slice(0, 600));
});
await safe('files', async () => {
  const after = await window.hub.gameReady.hash(ORIG);
  step('the game\'s files byte for byte the same', after.every((h, i) => h.hash === out.hashBefore[i].hash), after.map((h, i) => (h.hash === out.hashBefore[i].hash ? 'same' : `CHANGED ${h.path}`)));
});
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), runs: out.runs, steps: out.steps, said: out.said }, null, 1);
