// GPU contexts lost under load (round 58, ctxloss58): ▶ Play's "Getting ready" card (above all playbudget's A/B: synced
// frames back to back, the Best look's shadow-size walk) lost WebGL contexts on a loaded machine, so the scene was built
// again under the card (readywalk's wait, up to 30 s) or in play. This check loads the computer itself (busy Web Workers
// processes dev/smoke.js starts with --burn and ends with the run), plays the readyspeed "Clink" Lab scene (cold: the shadow walk;
// then the remembered size checked) and the HTML build, and counts:
//   - GPU process gone (main side, glrecovermain's `gone`: reason + exit code), the game page's context losses (the Lab
//     player's glrecover state), contexts made and alive there, readywalk's rebuild waits under the card (gpuBack)
//   - the A/B's synced frames: how many, the longest, its time
// and asserts 0 losses / GPU process exits / rebuild waits, and 0 compiles / uploads in the first 5 s of every play.
// window.CTX_PLAYS = Lab plays (default 3) · window.CTX_REPORT = 1: report only.
//   node dev/smoke.js --burn 3 --check-timeout 1500000 --script dev/checks/ctxloss.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], runs: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); window.hub?.fs?.write(`${DIR}/progress.json`, JSON.stringify(out, null, 1)).catch(() => {}); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 12 min`)), 720000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-ctxloss`;
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

// ---------- fixtures (the readyspeed check's throwaway "Clink": a Lab scene and an HTML build) ----------
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


// ---------- the load: --burn N busy processes started by dev/smoke.js for the whole run (inside the run lock) ----------
const BURN = `${window.SMOKE_BURN ?? 0} CPU burners`;

await Lazy.load('gamemode'); await Lazy.load('gameready');
const GW = () => window.hub.game;
const ev = async (code) => (await GW().eval(code))?.value;
const ID = 'cxlab';
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
const glr = async () => { try { return await window.hub.glr.state(); } catch { return null; } };
async function playOnce(label, source) {
  localStorage.removeItem('gameready.test');
  const g0 = await glr();
  let page = null; let peak = 0;
  const t0 = Date.now();
  const p = GameMode.play(source);
  // while it gets ready and plays: the page's contexts (alive, made, lost) every 300 ms
  const watch = (async () => { while (Date.now() - t0 < 300000) { const v = await ev('JSON.stringify({ gr: window.__gameReady ? { first5: Boolean(window.__gameReady.first5) } : null, gl: window.__glRecover ? window.__glRecover.state() : null })').catch(() => null); if (v) { const o = JSON.parse(v); if (o.gl) { page = o.gl; peak = Math.max(peak, o.gl.contexts || 0); } if (o.gr?.first5) return; } await wait(300); } })();
  await p; await watch;
  const st = await until(() => GameReady.state()?.first5 && GameReady.state(), 30000);
  const g1 = await glr();
  const ab = st?.result?.ab;
  const was = Math.max(0, ...((g0?.gone || []).map((y) => y.at)));
  const r = out.runs[label] = {
    ms: Date.now() - t0, total: st?.speed?.total, abStep: (st?.speed?.steps || []).find((s) => s.id === 'ab')?.ms ?? null,
    gpuGone: (g1?.crashes || 0) - (g0?.crashes || 0), gone: (g1?.gone || []).filter((x) => x.at > was).map((x) => ({ reason: x.reason, exitCode: x.exitCode, s: Math.round((x.at - t0) / 100) / 10 })),
    page: page && { losses: page.losses, restores: page.restores, rebuilds: page.rebuilds, none: page.none, made: page.made, alive: page.contexts, peakAlive: peak },
    gpuBack: st?.result?.gpuBack || null,
    first5: st?.first5 && { compiles: st.first5.compiles, links: st.first5.links, uploads: st.first5.uploads, gpuLost: st.first5.gpuLost || 0, ctxMade: st.first5.ctxMade, rebuilds: st.first5.rebuilds },
    ab: ab ? { ms: ab.ms, syncs: ab.syncs, maxFrameMs: ab.maxFrameMs, long: ab.long, drainMs: ab.drainMs, frames: ab.frames, perMs: ab.perMs, reused: Boolean(ab.reused), skipped: ab.skipped, shadow: ab.shadow ? { size: ab.shadow.size, why: ab.shadow.why, walked: ab.shadow.walked, rows: ab.shadow.rows, fallback: ab.shadow.fallback, fallbackReady: ab.shadow.fallbackReady } : null, glErrors: ab.glErrors || null } : null,
    errors: st?.page?.errors,
  };
  await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(1000);
  return r;
}
const clean = (f) => f && f.compiles === 0 && f.links === 0 && f.uploads === 0;
const lost = (r) => (r.gpuGone || 0) + (r.page?.losses || 0) + (r.page?.none || 0) + (r.gpuBack?.length || 0) + (r.first5?.gpuLost || 0);
const PLAYS = Number(window.CTX_PLAYS) || 3;
{
  await safe('lab', async () => {
    const s = await storeScene();
    for (let i = 0; i < PLAYS; i++) await playOnce(`lab${i + 1}`, s);
  });
  if (window.CTX_HTML !== 0) await safe('html', async () => {
    const s = { kind: 'html', path: `${H}/index.html`, title: 'Clink' };
    for (let i = 0; i < 2; i++) await playOnce(`html${i + 1}`, s);
  });
}
const runs = Object.entries(out.runs);
const total = runs.reduce((a, [, r]) => a + lost(r), 0);
out.losses = Object.fromEntries(runs.map(([k, r]) => [k, lost(r)]));
step(`no WebGL context lost on a loaded computer (${BURN}) (GPU process exits, page losses, rebuild waits under the card): ${total}`, window.CTX_REPORT || total === 0, out.losses);
step('0 compiles / 0 links / 0 uploads in the first 5 s of every play', runs.length >= 1 && runs.every(([, r]) => clean(r.first5)), Object.fromEntries(runs.map(([k, r]) => [k, r.first5])));
step('the A/B ran on every Lab play (the shadow size chosen or checked under the card)', runs.some(([k]) => k.startsWith('lab')) && runs.filter(([k]) => k.startsWith('lab')).every(([, r]) => r.ab && !r.ab.skipped && r.ab.shadow?.size), Object.fromEntries(runs.map(([k, r]) => [k, r.ab])));
// (round 59, shadowlab59) the Lab scene's warm plays (the remembered size only checked) never made the fallback maps and
// drew one frame with a missing map: GL_INVALID_OPERATION ("Mismatch between texture format and sampler type")
step('every Lab play: the Best look\'s fallback shadow maps made and sealed under the card (fallbackReady)', runs.filter(([k]) => k.startsWith('lab')).every(([, r]) => r.ab?.shadow && (r.ab.shadow.size <= 512 || r.ab.shadow.fallbackReady === true)), Object.fromEntries(runs.map(([k, r]) => [k, r.ab?.shadow && { size: r.ab.shadow.size, why: r.ab.shadow.why, fallbackReady: r.ab.shadow.fallbackReady }])));
step('no GL error in the A/B\'s frames under the card (WebGL\'s error flags read at its end)', runs.every(([, r]) => !r.ab || r.ab.skipped || (r.ab.glErrors && r.ab.glErrors.during === 0)), Object.fromEntries(runs.map(([k, r]) => [k, r.ab?.glErrors])));
step('contexts alive in the game page stay far from Chromium\'s 16', runs.every(([, r]) => !r.page || r.page.peakAlive < 8), Object.fromEntries(runs.map(([k, r]) => [k, r.page])));
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), burn: BURN, losses: out.losses, runs: out.runs, steps: out.steps.map((s) => ({ name: s.name, ok: s.ok })) }, null, 1);
