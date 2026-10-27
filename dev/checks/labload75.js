// opt-in: LABLOAD75
// (round 75, labload75) A kept preview page across many project switches with heavy scenes: memory stays level, and a
// scene seen before opens faster (its files, pictures, model and sky come from the page's asset cache).
// Projects keep the Lab's preview page when you switch from one project to another (round 72: ThreeLab.workspace
// close({ keep: true }) → prepare(next)): the next project's scene runs in the same page. This check does exactly that,
// 30 times, between three asset-heavy scenes (four 2048² photos, a 14 MB GLB with its own 1024² texture, an HDR sky
// with a PMREM environment, a video, a render target drawn every frame, a 200k-point cloud, an AudioContext with an
// oscillator, a THREE.AudioListener + THREE.Audio), and samples, after a forced GC: the preview's GL objects alive
// (textures, buffers, framebuffers, renderbuffers, programs on every context, pooled ones too), three.js' own counters
// (renderer.info.memory of the live renderers), the GPU process' working set, the preview's JS heap and arrays memory,
// media elements alive / playing, AudioContexts open, ImageBitmaps open, object URLs, the window's heap.
// Each switch is timed: close + prepare (the project's scene ready: assets in, shaders compiled, textures uploaded),
// and the page's own 'ready-prepped' assets ms. First visits (cold) and revisits (warm) are reported apart.
// Fails (the leak check) when something keeps growing from the 6th switch (each scene seen twice) to the 30th beyond
// the budgets below, or a scene never got ready, or THREE's shared AudioContext was left closed for the next scene.
// window.LL75_REPORT = 1 reports without failing; window.LL75_N = switches (default 30).
// Opt-in (≈ 6–9 min on the test machine): LABLOAD75=1 node dev/run-checks.js --exact labload75
//   by hand: node dev/smoke.js --check-timeout 1500000 --script dev/checks/labload75.js
// The video is the check-made clip of labfps72 (hearth-labfps72-clip.webm, made by dev/run-checks.js); without it the
// scenes run without a video.
const out = { switches: [], samples: [], steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(40); } return false; };
const N = Number(window.LL75_N) || 30;
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-labload75`;
const MB = (b) => (b == null ? null : +(b / 1048576).toFixed(1));

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
// ---------- fixtures ----------
const photo = async (n, hue) => {
  const c = new OffscreenCanvas(n, n); const g = c.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = `hsl(${(hue + x * 13 + y * 7) % 360} 60% ${35 + ((x + y) % 3) * 10}%)`; g.fillRect((x * n) / 16, (y * n) / 16, n / 16, n / 16); }
  const id = g.getImageData(0, 0, n, n); for (let i = 0; i < id.data.length; i += 4) { const k = (Math.random() * 36) | 0; id.data[i] += k; id.data[i + 2] += k; } g.putImageData(id, 0, 0); // (noise: a photo's size)
  return new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer());
};
for (let i = 0; i < 6; i++) await window.hub.fs.write(`${DIR}/photo${i}.jpg`, await photo(2048, i * 60));
// a GLB: a 500 × 500 grid (250k vertices: positions, normals, uvs, 500k triangles) with an embedded 1024² PNG texture
{
  const S = 500; const nv = S * S; const pos = new Float32Array(nv * 3); const nor = new Float32Array(nv * 3); const uv = new Float32Array(nv * 2);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const k = j * S + i; const x = i / (S - 1) - 0.5; const z = j / (S - 1) - 0.5; pos.set([x, Math.sin(x * 20) * Math.cos(z * 20) * 0.05, z], k * 3); nor.set([0, 1, 0], k * 3); uv.set([i / (S - 1), j / (S - 1)], k * 2); }
  const idx = new Uint32Array((S - 1) * (S - 1) * 6); let q = 0;
  for (let j = 0; j < S - 1; j++) for (let i = 0; i < S - 1; i++) { const a = j * S + i; idx.set([a, a + S, a + 1, a + 1, a + S, a + S + 1], q); q += 6; }
  const tc = new OffscreenCanvas(1024, 1024); const tg = tc.getContext('2d'); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { tg.fillStyle = (x + y) % 2 ? '#e94' : '#246'; tg.fillRect(x * 128, y * 128, 128, 128); }
  const png = new Uint8Array(await (await tc.convertToBlob({ type: 'image/png' })).arrayBuffer());
  const parts = [pos, nor, uv, idx, png]; const views = []; const chunks = []; let off = 0;
  for (const p of parts) { const b = p instanceof Uint8Array ? p : new Uint8Array(p.buffer); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); chunks.push(b, new Uint8Array(pad)); off += b.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'terrain' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: 0.7 } }], textures: [{ source: 0 }], images: [{ bufferView: 4, mimeType: 'image/png' }],
    buffers: [{ byteLength: off }], bufferViews: views.map((v, i) => (i < 3 ? { ...v, target: 34962 } : i === 3 ? { ...v, target: 34963 } : v)),
    accessors: [{ bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: [-0.5, -0.05, -0.5], max: [0.5, 0.05, 0.5] }, { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: nv, type: 'VEC2' }, { bufferView: 3, componentType: 5125, count: idx.length, type: 'SCALAR' }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  await window.hub.fs.write(`${DIR}/terrain.glb`, u);
}
// an HDR sky: 1024 × 512 Radiance RGBE, flat (not run-length encoded)
{
  const W = 1024; const H = 512; const head = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`);
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4; const sky = 1 - y / H; px[k] = 60 + ((x * 3) & 63); px[k + 1] = 90 + sky * 100; px[k + 2] = 120 + sky * 120; px[k + 3] = 128 + (y < 40 && x > 480 && x < 540 ? 4 : 0); }
  px[0] = 1; // (not 2, 2: not run-length encoded)
  const f = new Uint8Array(head.length + px.length); f.set(head); f.set(px, head.length);
  await window.hub.fs.write(`${DIR}/sky.hdr`, f);
}
const VIDEO = window.LL75_VIDEO || '/tmp/hearth-labfps72-clip.webm';
const hasVideo = await Promise.resolve(window.hub.fs.stat?.(VIDEO)).then((s) => Boolean(s && !s.error && (s.size > 0 || s.isFile)), () => false);
out.fixture = { photos: '6 × 2048² JPEG', model: 'terrain.glb 250k vertices + 1024² PNG', sky: 'sky.hdr 1024×512', video: hasVideo ? VIDEO : 'none' };

// ---------- the Lab and three heavy scenes ----------
await window.Lazy?.load('lab');
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes && ThreeLab.workspace, 60000);
await ThreeLab.cmd();
const D = ThreeLab.director;
const sbx = async (code) => { for (let i = 0; i < 6; i++) { const r = await D.evalInSketch(code); if (r?.ok) return r.value; await wait(400); } return null; };
const SCENES = [{ name: 'labload A', pics: [0, 1, 2, 3], hue: 0.1 }, { name: 'labload B', pics: [2, 3, 4, 5], hue: 0.45 }, { name: 'labload C', pics: [0, 1, 4, 5], hue: 0.75 }];
const code = (s) => `import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 1.2, 7);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1));
const pics = ['photo${s.pics[0]}', 'photo${s.pics[1]}', 'photo${s.pics[2]}', 'photo${s.pics[3]}'].map((k, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshStandardMaterial({ map: refTexture(k) })); m.position.set(-3 + i * 2, 2.1, -2); scene.add(m); return m; });
${hasVideo ? "const vt = refTexture('clip'); const vm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: vt })); vm.position.set(-1.5, -0.1, -1.5); scene.add(vm);" : ''}
new GLTFLoader().load(refs.terrain, (g) => { g.scene.scale.setScalar(6); g.scene.position.y = -1.3; scene.add(g.scene); });
const pm = new THREE.PMREMGenerator(renderer);
new HDRLoader().load(refs.sky, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; scene.background = t; scene.environment = pm.fromEquirectangular(t).texture; });
const rt = new THREE.WebGLRenderTarget(512, 512); const rtScene = new THREE.Scene(); rtScene.background = new THREE.Color().setHSL(${s.hue}, 0.6, 0.4);
const rtKnot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.2, 200, 32), new THREE.MeshNormalMaterial()); rtScene.add(rtKnot);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: rt.texture })); screen.position.set(2.4, 0.2, -1); scene.add(screen);
const cloud = new Float32Array(600000); for (let k = 0; k < cloud.length; k++) cloud[k] = (Math.random() - 0.5) * 12;
const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(cloud, 3));
const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.01, color: 0xffeecc })); pts.position.z = -6; scene.add(pts);
const ac = new AudioContext(); const osc = ac.createOscillator(); const mute = ac.createGain(); mute.gain.value = 0; osc.connect(mute).connect(ac.destination); osc.start();
const listener = new THREE.AudioListener(); camera.add(listener); const snd = new THREE.Audio(listener); snd.setBuffer(listener.context.createBuffer(1, 22050, 22050)); snd.setLoop(true); snd.setVolume(0); snd.play();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop((now) => { rtKnot.rotation.y = now / 900; pts.rotation.y = now / 5000; renderer.setRenderTarget(rt); renderer.render(rtScene, camera); renderer.setRenderTarget(null); renderer.render(scene, camera); });
`;
const ids = [];
for (const s of SCENES) {
  const sk = ThreeLab.scenes.create({ name: s.name, code: code(s), open: true });
  await until(() => ThreeLab.scenes.currentId() === sk.id, 10000); await wait(800);
  for (let i = 0; i < 6; i++) await D.refs.add(`${DIR}/photo${i}.jpg`, `photo${i}`).catch((err) => step(`photo${i}`, false, String(err)));
  await D.refs.add(`${DIR}/terrain.glb`, 'terrain').catch((err) => step('model', false, String(err)));
  await D.refs.add(`${DIR}/sky.hdr`, 'sky').catch((err) => step('sky', false, String(err)));
  if (hasVideo) await D.refs.add(VIDEO, 'clip').catch((err) => step('video', false, String(err)));
  ids.push(sk.id);
}
step('three scenes made with their references', ids.length === 3 && ids.every((id) => ThreeLab.scenes.get(id)), ids);

// ---------- what the page holds (installed once: media that played, kept as WeakRefs) ----------
await sbx(`if (!window.__ll75) { const seen = []; const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function (...a) { if (!this.__ll75) { this.__ll75 = 1; seen.push(new WeakRef(this)); } return play.apply(this, a); }; window.__ll75 = { media: () => { let alive = 0, playing = 0, withSrc = 0; for (const w of seen) { const m = w.deref(); if (!m) continue; alive += 1; if (!m.paused) playing += 1; if (m.getAttribute('src') || m.srcObject) withSrc += 1; } return { alive, playing, withSrc }; } }; } return 1`);
const gc = async () => { for (let i = 0; i < 2; i++) { await smoke({ target: 'three-sandbox', cdp: 'HeapProfiler.collectGarbage', params: {} }); await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }); await wait(200); } };
const gpuKB = async () => { try { const m = (await window.hub.power.test({ metrics: true })).metrics; return m.procs.filter((p) => p.type === 'GPU').reduce((n, p) => n + (p.mem || 0), 0) || null; } catch { return null; } };
async function sample(label) {
  await wait(3300); // (what a gone scene left is emptied 2.5 s after its switch)
  await gc();
  const raw = await sbx(`const m = window.__labMem();
    return JSON.stringify({ m, media: window.__ll75?.media(), cache: window.__labAssets?.info?.() || null, threeCtx: await import('three').then((T) => T.AudioContext?.getContext?.()?.state || null).catch(() => null) });`);
  let p = {}; try { p = JSON.parse(raw); } catch { /* no page */ }
  const m = p.m || {};
  const ph = await smoke({ target: 'three-sandbox', cdp: 'Runtime.getHeapUsage', params: {} });
  const hh = await smoke({ cdp: 'Runtime.getHeapUsage', params: {} });
  const s = { label, pageHeapMB: MB(ph.usedSize), pageArraysMB: MB(ph.backingStorageSize), hubHeapMB: MB(hh.usedSize), gpuProcMB: ((k) => (k == null ? null : +(k / 1024).toFixed(1)))(await gpuKB()),
    gl: m.gl, three: m.three, videos: m.videos, videosPlaying: m.videosPlaying, media: p.media, audioContexts: m.audioContexts, bitmaps: m.bitmaps, objectURLs: m.objectURLs, canvases: m.canvases, layerUrls: m.layerUrls, cache: p.cache, threeAudio: p.threeCtx };
  out.samples.push(s);
  return s;
}

// ---------- 30 project switches in a kept page ----------
let prepped = null;
let drawnAt = 0;
addEventListener('message', (e) => { const t = e.data?.type; if (t === 'ready-prepped') prepped = e.data; if (t === 'stack-drawn' && !drawnAt) drawnAt = performance.now(); }, true); // (capture: the Lab's own listener keeps them)
const W = ThreeLab.workspace;
const FULL = `const s = Object.values(__scenes)[0]?.scene; if (!s || !s.environment) return false; let model = false, pics = 0; s.traverse((o) => { if (o.name === 'terrain') model = true; const im = o.material?.map?.image; if (o.geometry?.type === 'PlaneGeometry' && im && (im.width || im.videoWidth) >= 1024) pics += 1; }); return model && pics >= ${hasVideo ? 5 : 4};`;
// the first: the Lab's own open of scene A, then the same as a project would
await W.close({ keep: true }); await W.prepare(ids[0]).catch((err) => step('first prepare', false, String(err)));
await wait(1500);
const keptAtStart = W.state();
// CPU time per process over the switches (the machine is shared: wall time stretches with others' load, CPU time much less)
const metrics = async () => { try { return (await window.hub.power.test({ metrics: true })).metrics; } catch { return null; } };
const procOf = (m, pid) => { const pg = m.pages.filter((p) => p.pid === pid); if (pg.some((p) => /three-sandbox/.test(p.url))) return 'preview'; if (pg.some((p) => p.type === 'window')) return 'window'; const pr = m.procs.find((x) => x.pid === pid); return pr?.type === 'GPU' ? 'gpu' : pr?.type === 'Browser' ? 'main' : 'other'; };
const m0 = await metrics();
for (let k = 0; k < N; k++) {
  const id = ids[(k + 1) % 3];
  prepped = null; drawnAt = 0;
  const t0 = performance.now();
  let err = null;
  try { await W.close({ keep: true }); const c1 = performance.now(); await W.prepare(id); const p1 = performance.now();
    // complete: the model, the sky and the four photos are in the scene (the scene's own loaders, not only the page's warm-up)
    const full = await until(async () => (await D.evalInSketch(FULL))?.value === true, 60000) ? Math.round(performance.now() - t0) : null;
    out.switches.push({ k: k + 1, readyMs: Math.round(p1 - t0), fullMs: full, scene: SCENES[ids.indexOf(id)].name.slice(-1), ms: Math.round(performance.now() - t0), closeMs: Math.round(c1 - t0), drawnMs: drawnAt ? Math.round(drawnAt - t0) : null, assetsMs: prepped?.assets?.ms ?? null, warmMs: prepped?.ms ?? null, kept: W.state().kept || null }); } catch (e) { err = String(e?.message || e); out.switches.push({ k: k + 1, error: err }); }
  await wait(600); // (a moment on the scene, as a person looks)
  if (k + 1 === 6 || k + 1 === 15 || k + 1 === N) await sample(`after ${k + 1} switches`);
}
const m1 = await metrics();
if (m0 && m1) { const c = {}; for (const p of m1.procs) { const p0 = m0.procs.find((x) => x.pid === p.pid); const k = procOf(m1, p.pid); c[k] = (c[k] || 0) + ((p.cpuS ?? 0) - (p0?.cpuS ?? 0)); } out.cpuPerSwitchMs = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round((v * 1000) / N)])); }
const fails = [];
const bad = out.switches.filter((x) => x.error);
if (bad.length) fails.push(`${bad.length} switch(es) never got ready (${bad[0].error})`);
if (!keptAtStart.released && keptAtStart.kept === false) { /* fine: the page is the Lab's */ }
// ---------- the open times ----------
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const ok = out.switches.filter((x) => !x.error);
out.open = { firstVisits: ok.slice(0, 2).map((x) => `${x.scene} ${x.ms} ms (assets ${x.assetsMs})`).join(' · '), revisitMedianMs: med(ok.slice(3).map((x) => x.ms)), firstFullMedianMs: med(ok.slice(0, 3).map((x) => x.fullMs)), revisitFullMedianMs: med(ok.slice(3).map((x) => x.fullMs)), revisitAssetsMedianMs: med(ok.slice(3).map((x) => x.assetsMs)), firstAssetsMedianMs: med(ok.slice(0, 3).map((x) => x.assetsMs)), revisitDrawnMedianMs: med(ok.slice(3).map((x) => x.drawnMs)), firstDrawnMedianMs: med(ok.slice(0, 3).map((x) => x.drawnMs)), firstMedianMs: med(ok.slice(0, 3).map((x) => x.ms)), allMedianMs: med(ok.map((x) => x.ms)) };
// ---------- the leak check: from the 6th switch to the last ----------
const a = out.samples[0]; const z = out.samples[out.samples.length - 1];
const BUDGET = { glTextures: 6, glBuffers: 12, glFramebuffers: 4, glObjects: 60, threeTextures: 4, threeGeometries: 4, pageHeapMB: 6, pageArraysMB: 24, gpuProcMB: 160, mediaAlive: 2, hubHeapMB: 8 };
const grew = (name, f, max) => { const x = f(a); const y = f(z); if (x == null || y == null) return; const d = y - x; out.growth = { ...(out.growth || {}), [name]: +d.toFixed(1) }; if (d > max) fails.push(`${name} grew ${+d.toFixed(1)} from "${a.label}" to "${z.label}" (> ${max})`); };
grew('glTextures', (s) => s.gl?.textures, BUDGET.glTextures);
grew('glBuffers', (s) => s.gl?.buffers, BUDGET.glBuffers);
grew('glFramebuffers', (s) => s.gl?.framebuffers, BUDGET.glFramebuffers);
grew('glObjects', (s) => s.gl?.objects, BUDGET.glObjects);
grew('threeTextures', (s) => s.three?.textures, BUDGET.threeTextures);
grew('threeGeometries', (s) => s.three?.geometries, BUDGET.threeGeometries);
grew('pageHeapMB', (s) => s.pageHeapMB, BUDGET.pageHeapMB);
grew('pageArraysMB', (s) => s.pageArraysMB, BUDGET.pageArraysMB);
grew('gpuProcMB', (s) => s.gpuProcMB, BUDGET.gpuProcMB);
grew('mediaAlive', (s) => s.media?.alive, BUDGET.mediaAlive);
grew('hubHeapMB', (s) => s.hubHeapMB, BUDGET.hubHeapMB);
if ((z.media?.playing ?? 0) > (hasVideo ? 2 : 1)) fails.push(`${z.media.playing} media elements playing (only the open scene's should)`);
if ((z.audioContexts ?? 0) > 3) fails.push(`${z.audioContexts} AudioContexts open after ${N} switches`);
if (z.threeAudio === 'closed') fails.push("THREE's shared AudioContext is closed: the next scene's THREE.Audio is silent");
for (const st of out.steps) if (!st.ok) fails.push(st.name);
out.table = out.samples.map((s) => `${s.label}: page ${s.pageHeapMB} MB + arrays ${s.pageArraysMB} MB · GPU proc ${s.gpuProcMB} MB · hub ${s.hubHeapMB} MB · gl ${s.gl?.objects} (tex ${s.gl?.textures}, buf ${s.gl?.buffers}, fb ${s.gl?.framebuffers}, prog ${s.gl?.programs}) ctx ${s.gl?.contexts}+${s.gl?.pooled} · three ${s.three?.geometries}g ${s.three?.textures}t ${s.three?.programs}p · media ${s.media?.alive}/${s.media?.playing} playing · ac ${s.audioContexts} (three ${s.threeAudio}) · bmp ${s.bitmaps} · url ${s.objectURLs} · cv ${s.canvases}${s.cache ? ` · cache ${s.cache.entries} / ${s.cache.mb} MB (hits ${s.cache.hits}, misses ${s.cache.misses}, files received ${s.cache.receivedMB} MB)` : ''}`);
out.fails = window.LL75_REPORT ? [] : fails;
if (window.LL75_REPORT) out.wouldFail = fails;
for (const id of ids) { try { ThreeLab.scenes.remove(id); } catch { /* fine */ } }
return JSON.stringify(out, null, 1);
