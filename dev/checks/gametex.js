// ▶ Play, lighter textures (round 53, gametex): Optimize for play compresses a Lab scene's textures to KTX2 and ▶ Play
// loads the compressed copies. A throwaway "Clink" scene, played through GameMode.play (its own window, GameReady's card):
//   setup     a 4096×2048 photo-like ground picture, a 1024² normal map, a 512² noise picture (it can't compress well),
//             and a 🧊 ship (a GLB with its own 512² picture), written to /tmp/hearth-gametex; the scene stored directly
//   before    ▶ Play on the originals: the picture of the scene, the textures' video memory (the page's own count)
//   optimize  the card's Optimize for play (no gltfpack here): the pictures and the ship's picture compressed in Hearth's
//             cache, the noise picture kept as it is (and why), "Textures: … → … of video memory" on the card, the
//             gltfpack install command shown for lighter meshes, nothing run
//   after     ▶ Play again: the copies in use (compressed textures on the GPU, the ship's too), the card says what they
//             save, the video memory lower, the picture within tolerance of the originals', 0 compiles / uploads in play
//   fallback  a graphics card without compressed formats (gameready.test.caps = 'none'): the originals load
//   files     the owner's files byte for byte the same
//   node dev/smoke.js --check-timeout 1500000 --script dev/checks/gametex.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], measure: {} };
const TMP = window.SMOKE_TMP || '/tmp'; // (round 56, fixes56) this run's own scratch folder (dev/smoke.js --tmp): two runs at once never share files
const DIR = `${TMP}/hearth-gametex`;
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); window.hub?.fs?.write(`${DIR}/progress.json`, JSON.stringify(out, null, 1)).catch(() => {}); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 7 min`)), 420000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const setTest = (o) => (o ? localStorage.setItem('gameready.test', JSON.stringify(o)) : localStorage.removeItem('gameready.test'));
const NO_TOOL = { tool: '/nonexistent/gltfpack' };
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

// ---------- fixtures (throwaway: the "owner's game") ----------
const rnd = (x, y, s) => { const n = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453; return n - Math.floor(n); };
const vn = (x, y, sc, s) => { const gx = x / sc; const gy = y / sc; const x0 = Math.floor(gx); const y0 = Math.floor(gy); const fx = gx - x0; const fy = gy - y0; const a = rnd(x0, y0, s); const b = rnd(x0 + 1, y0, s); const c = rnd(x0, y0 + 1, s); const d = rnd(x0 + 1, y0 + 1, s); const u = fx * fx * (3 - 2 * fx); const v = fy * fy * (3 - 2 * fy); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
async function picture(file, w, h, fn, type = 'image/png', quality = 0.92) {
  const c = new OffscreenCanvas(w, h); const g = c.getContext('2d'); const im = g.createImageData(w, h); const d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const p = fn(x, y); d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  const u8 = new Uint8Array(await (await c.convertToBlob({ type, quality })).arrayBuffer());
  if (file) await window.hub.fs.write(file, u8);
  return u8;
}
// a photo-like ground (soft shapes at a few scales, a fine grain, a top-to-bottom sky-to-earth tint: upside down shows)
const photo = (x, y, w, h) => { const n = vn(x, y, 220, 1) * 0.5 + vn(x, y, 55, 2) * 0.3 + vn(x, y, 12, 3) * 0.14 + rnd(x, y, 9) * 0.06; const t = y / h; return [255 * Math.min(1, n * 1.05 * (0.6 + 0.4 * t)), 255 * Math.min(1, n * 0.8 + 0.12 * vn(x, y, 80, 5)), 255 * Math.min(1, (0.35 * n + 0.35 * vn(x, y, 120, 7)) * (1.4 - t))]; };
const normalPx = (x, y) => { const nx = Math.sin(x / 23) * 0.35 + (vn(x, y, 40, 4) - 0.5) * 0.3; const ny = Math.cos(y / 19) * 0.35 + (vn(x, y, 40, 6) - 0.5) * 0.3; const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255]; };
const noisePx = (x, y) => [255 * rnd(x, y, 1), 255 * rnd(x, y, 2), 255 * rnd(x, y, 3)];
async function glb(file) {
  const img = await picture(null, 512, 512, (x, y) => photo(x * 3, y * 3, 1536, 1536));
  const N = 32; const pos = []; const uv = []; const nor = []; const idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const u = i / N; const v = j / N; pos.push(u - 0.5, Math.sin(u * 7) * Math.cos(v * 5) * 0.1 + 0.2, v - 0.5); uv.push(u, v); nor.push(0, 1, 0); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
  const parts = [new Uint8Array(new Float32Array(pos).buffer), new Uint8Array(new Float32Array(nor).buffer), new Uint8Array(new Float32Array(uv).buffer), new Uint8Array(new Uint16Array(idx).buffer), img];
  const views = []; let off = 0; const chunks = [];
  for (const p of parts) { const pad = (4 - (p.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: p.length }); chunks.push(p, new Uint8Array(pad)); off += p.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
  const nv = (N + 1) * (N + 1);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'ship' }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'hull', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.2, roughnessFactor: 0.6 } }], textures: [{ source: 0 }], images: [{ name: 'hull', bufferView: 4, mimeType: 'image/png' }], buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: [-0.5, 0.1, -0.5], max: [0.5, 0.3, 0.5] }, { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: nv, type: 'VEC2' }, { bufferView: 3, componentType: 5123, count: idx.length, type: 'SCALAR' }] };
  await window.hub.fs.write(file, GameTexCore.writeGlb(json, bin));
}
// the game: everything still (the picture compares frame to frame); the ground drawn as it is (no light on it)
const GAME = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1220');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 3.5, 6.5); camera.lookAt(0, 0, 0);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: refTexture('ground') }));
floor.name = 'gtground'; floor.rotation.x = -Math.PI / 2.4; scene.add(floor);
const rock = refTexture('rock_normal'); rock.colorSpace = THREE.NoColorSpace;
const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: '#c8b8a8', normalMap: rock, roughness: 0.55 }));
box.position.set(-2.2, 1, 1); box.rotation.set(0.4, 0.6, 0); scene.add(box);
const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: refTexture('grain') }));
panel.position.set(2.2, 1.1, 1); scene.add(panel);
const sun = new THREE.DirectionalLight('#ffffff', 2.4); sun.position.set(3, 5, 4); scene.add(sun, new THREE.AmbientLight('#ffffff', 0.4));
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
const SHIP = "const P = tweak({});\nlab3d.model(refs.ship, P, { name: 'Ship' });";
const ORIG = [`${DIR}/ground.jpg`, `${DIR}/rock_normal.png`, `${DIR}/grain.png`, `${DIR}/ship.glb`];
const SCENE = 'gametex1';
await Lazy.load('gamemode'); await Lazy.load('gameready');
step('the groups load on use (GameTexCore with gameready)', typeof GameMode !== 'undefined' && typeof GameReady !== 'undefined' && typeof GameTexCore !== 'undefined');
await safe('fixtures', async () => {
  await picture(`${DIR}/ground.jpg`, 4096, 2048, (x, y) => photo(x, y, 4096, 2048), 'image/jpeg', 0.92);
  await picture(`${DIR}/rock_normal.png`, 1024, 1024, normalPx);
  await picture(`${DIR}/grain.png`, 512, 512, noisePx);
  await glb(`${DIR}/ship.glb`);
  out.hashBefore = await window.hub.gameReady.hash(ORIG);
  const sk = ((await window.hub.kvGet('three-sketches', [])) || []).filter((x) => x.id !== SCENE);
  sk.push({ id: SCENE, name: 'Clink', layers: [{ id: 'game', name: 'Game', code: GAME }, { id: 'ship', name: 'Ship', code: SHIP }], createdAt: Date.now(), updatedAt: Date.now() });
  await window.hub.kvSet('three-sketches', sk);
  const refs = (await window.hub.kvGet('three-refs', {})) || {};
  refs[SCENE] = [['ground', 'image', 'ground.jpg'], ['rock_normal', 'image', 'rock_normal.png'], ['grain', 'image', 'grain.png'], ['ship', 'model', 'ship.glb']].map(([key, kind, name], i) => ({ id: `t${i}`, key, kind, name, path: `${DIR}/${name}` }));
  await window.hub.kvSet('three-refs', refs);
  step('fixtures: a 4096×2048 picture, a normal map, a noise picture, a GLB with its own picture', out.hashBefore.every((h) => h.hash), out.hashBefore.map((h) => [h.path.split('/').pop(), h.size]));
});
const lab = { kind: 'lab', id: SCENE, title: 'Clink' };

// ---------- playing ----------
const GW = () => window.hub.game;
const ev = async (code) => (await GW().eval(code))?.value;
const card = (q) => ev(`(() => { const r = document.querySelector("gameready-card")?.shadowRoot; const e = r?.querySelector(${JSON.stringify(q)}); return e && !e.hidden ? e.textContent : null; })()`);
async function playGame(label, test, { during } = {}) {
  setTest(test);
  let tx = null;
  const p = GameMode.play(lab);
  const watch = (async () => { const t = Date.now(); while (Date.now() - t < 240000) { const v = await ev('window.__gameReady ? window.__gameReady.pub() : null').catch(() => null); if (v) { const o = JSON.parse(v); if (o.card && tx == null) tx = (await card('.n').catch(() => null)) || ''; if (o.phase === 'playing') return; } await wait(150); } })();
  if (during) await during();
  await p; await watch;
  const st = await until(() => GameReady.state()?.first5 && GameReady.state(), 40000);
  out.measure[label] = { readyMs: st?.readyMs, cardNote: tx, tex: st?.tex, first5: st?.first5, findings: st?.findings?.map((f) => f.text), errors: st?.page?.errors };
  return { st, tx };
}
async function leaveGame() { await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(800); }
// the textures the scene draws with, in the window: compressed or not, KTX2 copies, the ship's own
const texState = () => ev(`(() => { const o = { ground: null, rock: null, grain: null, ship: null }; for (const r of __rdyLive()) for (const sc of new Set([...(r.__seen || []), r.__lastScene])) sc?.traverse?.((m) => { if (!m.isMesh) return; const t = m.material?.map || m.material?.normalMap; if (!t) return; const d = { compressed: Boolean(t.isCompressedTexture), ktx2: Boolean(t.userData?.ktx2), w: t.image?.width || t.mipmaps?.[0]?.width || 0, mips: t.mipmaps?.length || 0, format: t.format, aniso: t.anisotropy }; if (m.name === 'gtground') o.ground = d; else if (m.material.normalMap) o.rock = d; else if (m.geometry?.parameters?.width === 1.4) o.grain = d; else if (m.geometry?.attributes?.position?.count === 1089) o.ship = d; }); return o; })()`);
// the game layer drawn now, 320×180 (the layer at the bottom of the one canvas: drawn alone, read in the same task)
const snap = async () => { const v = await ev(`(() => { const r = __rdyLive().find((x) => x.__lastScene?.getObjectByName?.('gtground')); if (!r) return null; r.render(r.__lastScene, r.__lastCamera); const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); g.drawImage(r.domElement, 0, 0, 320, 180); return JSON.stringify(Array.from(g.getImageData(0, 0, 320, 180).data)); })()`); return v ? new Uint8Array(JSON.parse(v)) : null; };
// video memory the page's textures take (gameready's own estimate: RGBA 4 bytes a pixel, compressed 1)
const vramOf = (st) => GameReadyCore.findings(st?.result?.inventory || {}).find((f) => f.kind === 'texture-memory')?.bytes || 0;

let before = null; let beforeSnap = null;
await safe('before', async () => {
  const r = await playGame('before', NO_TOOL);
  before = r.st; beforeSnap = await snap();
  const ts = await texState();
  out.measure.before.textures = ts; out.measure.before.vram = vramOf(r.st);
  step('before: ▶ Play on the originals (nothing compressed yet), the scene drawn', r.st?.first5 && ts?.ground && !ts.ground.compressed && beforeSnap, ts);
  step('before: the card offers Optimize for play (pictures and a model without copies)', (r.st?.plan?.missing || 0) + (r.st?.tex?.missing || 0) >= 4, { plan: r.st?.plan, tex: r.st?.tex });
  await leaveGame();
});

await safe('optimize', async () => {
  let note = null; let cmd = null; let main = null; let offered = false;
  const t0 = performance.now();
  await playGame('optimize', NO_TOOL, { during: async () => {
    offered = await until(() => ev('(() => { const r = document.querySelector("gameready-card")?.shadowRoot; const o = r?.querySelector(".o"); if (!o || o.hidden) return false; o.click(); return true; })()'), 90000);
    cmd = await until(() => card('.k'), 300000);
    note = await card('.n'); main = await card('.m');
    out.measure.optimizeMs = Math.round(performance.now() - t0);
    await ev('document.querySelector("gameready-card")?.shadowRoot?.querySelector(".o")?.click()'); // Not now
  } });
  const lo = GameReady.lastOptimize();
  out.optimize = lo;
  const made = Object.fromEntries((lo?.pictures?.made || []).map((m) => [m.path.split('/').pop(), m]));
  const kept = Object.fromEntries((lo?.pictures?.kept || []).map((m) => [m.path.split('/').pop(), m]));
  step('optimize: the card\'s Optimize for play compressed the pictures (no gltfpack needed)', offered && lo?.ok && made['ground.jpg'] && made['rock_normal.png'], { offered, made: Object.keys(made) });
  step('optimize: the normal map as UASTC; the ground as the encoding that looks the same', made['rock_normal.png']?.mode === 'uastc' && ['etc1s', 'uastc'].includes(made['ground.jpg']?.mode), { ground: made['ground.jpg'], rock: made['rock_normal.png'] });
  step('quality guard: each copy within tolerance of its original (PSNR over the floor)', Object.values(made).every((m) => m.psnr >= GameTexCore.FLOOR[m.mode]), Object.values(made).map((m) => [m.path.split('/').pop(), m.mode, m.psnr]));
  step('quality guard: the noise picture looked different compressed → kept as it is, and the card says so', kept['grain.png'] && /looked different/.test(kept['grain.png'].why) && /kept as it is/.test(note || ''), { kept: kept['grain.png'], note });
  const ship = lo?.made?.find((m) => /ship\.glb$/.test(m.path));
  step('optimize: the ship\'s copy with its picture as KTX2 (pictures only: no gltfpack)', ship && ship.textures && ship.mesh === false && /game-cache/.test(ship.out) && ship.tex?.after < ship.tex?.before, ship);
  step('optimize: the card says what the copies save ("Textures: … → … of video memory")', /Textures: [\d.]+ [MG]B → [\d.]+ [MG]B of video memory/.test(note || '') && lo?.tex?.after < lo?.tex?.before, { note, tex: lo?.tex });
  step('install: gltfpack for lighter meshes shown with Install, nothing run', /npm install -g gltfpack/.test(cmd || '') && main === 'Install' && !GameReady.lastInstall(), { cmd, main });
  out.measure.vramReport = lo?.tex;
  await leaveGame();
});

await safe('after', async () => {
  const r = await playGame('after', NO_TOOL);
  const ts = await texState();
  const shot = await snap();
  out.measure.after.textures = ts; out.measure.after.vram = vramOf(r.st);
  step('after: ▶ Play uses the compressed copies (the ground and the normal map on the GPU as KTX2)', ts?.ground?.compressed && ts.ground.ktx2 && ts.ground.mips > 1 && ts?.rock?.compressed && ts.rock.ktx2, ts);
  step('after: the ship loads its KTX2 picture (three\'s KTX2Loader + Basis transcoder in the page)', ts?.ship?.compressed === true, ts?.ship);
  step('after: the noise picture stays the original', ts?.grain && !ts.grain.compressed, ts?.grain);
  step('after: the card says what the copies save', /^Textures: .+ of video memory \(compressed copies\)$/.test(r.tx || ''), { note: r.tx, tex: r.st?.tex });
  step('after: the video memory the page counts is lower', out.measure.after.vram > 0 && out.measure.after.vram < out.measure.before.vram, { before: out.measure.before.vram, after: out.measure.after.vram });
  // the picture: the same scene, drawn with the copies vs the originals
  let q = null; if (shot && beforeSnap) { q = GameTexCore.compare(beforeSnap, shot, 320, 180); q = { psnr: +q.psnr.toFixed(2), mean: +q.mean.toFixed(3), max: q.max }; }
  out.measure.picture = q;
  step('after: the picture within tolerance of the originals\' (mean difference under 2 levels, PSNR over 32 dB)', q && q.mean < 2 && q.psnr > 32, q);
  step('after: still 0 shaders compiled and 0 textures uploaded in the first 5 s of play', r.st?.first5?.compiles === 0 && r.st?.first5?.uploads === 0, r.st?.first5);
  await leaveGame();
});

await safe('fallback', async () => {
  const r = await playGame('fallback', { ...NO_TOOL, caps: 'none' });
  const ts = await texState();
  const shot = await snap();
  let q = null; if (shot && beforeSnap) { q = GameTexCore.compare(beforeSnap, shot, 320, 180); q = { psnr: +q.psnr.toFixed(2), mean: +q.mean.toFixed(3) }; }
  step('fallback: a graphics card without compressed formats → the originals load (no copies, nothing compressed)', (r.st?.tex?.swapped || 0) === 0 && ts?.ground && !ts.ground.compressed && !ts.rock?.compressed && !ts.ship?.compressed && !r.tx, { tex: r.st?.tex, ts, note: r.tx });
  step('fallback: the same picture as before', q && q.mean < 0.5, q);
  await leaveGame();
});

await safe('files', async () => {
  const after = await window.hub.gameReady.hash(ORIG);
  step('files: every original byte for byte the same', after.every((h, i) => h.hash === out.hashBefore[i].hash && h.size === out.hashBefore[i].size), after.map((h, i) => (h.hash === out.hashBefore[i].hash ? 'same' : `CHANGED ${h.path}`)));
});
setTest(null);
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, measure: out.measure, optimize: out.optimize && { ...out.optimize, made: out.optimize.made?.map((m) => ({ path: m.path, bytes: m.bytes, srcBytes: m.srcBytes, textures: m.textures, mesh: m.mesh, tex: m.tex && { before: m.tex.before, after: m.tex.after, items: m.tex.items } })) } }, null, 1);
