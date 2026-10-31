// (round 99, labmodels99) A 3D model made of several files, in the Lab itself. Fixtures (made here, in the check's own
// temp folder): a .gltf cube with its .bin in buffers/, its colour picture in textures/ ("paint red.png": a space in its
// URI) and its emissive picture a folder up (../shared/), an .obj cube with its .mtl ("map_Kd -s 1 1 1 maps/seat.png"),
// a .glb cube with its picture inside, a .gltf whose buffer is missing, a Blender-style "glTF Separate" export folder.
//   add       each model through /model add's path (ThreeModels.add → the Lab's "add a reference"): its folder copied whole
//             into data/refs/<time>-<name>/ (a .glb: one file, as before), what it came without named plainly
//   preview   each model layer (lab3d.model) shows its textures: the colour picture's texel read back from the graphics
//             card (and the emissive one's), and the pixel at the middle of the drawn frame has the texture's colour
//   hook      a scene's own GLTFLoader().load(refs.car) / OBJLoader().load(refs.chair) finds the files too (the import
//             map's hook), and the page still decodes refTexture's big pictures in its worker (window.__labDecode)
//   missing   the .gltf without its buffer: "wheels.bin isn't next to broken.gltf" when added, the layer's error names it
//   drop      a .gltf dropped with its .bin and pictures (DragDrop.toLab): one model, its files with it; the export folder
//             dropped: its model added, nothing else
//   remove    each reference removed: its whole folder goes to the Trash (the original files untouched)
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/labmodels99.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return false; };
const out = { steps: [], px: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/lm99`;
const SRC = `${DIR}/src`;

// ---------- fixtures ----------
const png = async (rgb, n = 8) => { const c = new OffscreenCanvas(n, n); const g = c.getContext('2d'); g.fillStyle = `rgb(${rgb.join(',')})`; g.fillRect(0, 0, n, n); return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
// a unit cube: 24 vertices (positions, uvs), 36 indices
function cube() {
  const P = []; const U = []; const I = [];
  const faces = [[[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, -1]], [[0, -1, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]]];
  for (const [n, up] of faces) {
    const r = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
    const b = P.length / 3;
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(...[0, 1, 2].map((k) => 0.5 * (n[k] + s * r[k] + t * up[k]))); U.push((s + 1) / 2, (1 - t) / 2); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { P: new Float32Array(P), U: new Float32Array(U), I: new Uint16Array(I) };
}
function cubeGltf({ images, emissive = false, bufUri = 'buffers/car.bin', embedded = null }) {
  const c = cube();
  const parts = [new Uint8Array(c.P.buffer), new Uint8Array(c.U.buffer), new Uint8Array(c.I.buffer)];
  let off = 0; const views = [];
  const pad = (n) => (n + 3) & ~3;
  const chunks = [];
  for (const p of [...parts, ...(embedded ? [embedded] : [])]) { views.push({ buffer: 0, byteOffset: off, byteLength: p.length }); chunks.push(p, new Uint8Array(pad(p.length) - p.length)); off += pad(p.length); }
  const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 }, ...(emissive ? { emissiveTexture: { index: 1 }, emissiveFactor: [0, 0, 0] } : {}) }],
    textures: images.map((_, i) => ({ source: i })), images: embedded ? [{ bufferView: 3, mimeType: 'image/png' }] : images.map((uri) => ({ uri })),
    accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, { bufferView: 1, componentType: 5126, count: 24, type: 'VEC2' }, { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' }],
    bufferViews: views, buffers: [embedded ? { byteLength: bin.length } : { uri: bufUri, byteLength: bin.length }] };
  return { json, bin };
}
function glb(json, bin) {
  const enc = new TextEncoder(); let j = enc.encode(JSON.stringify(json)); const jl = (j.length + 3) & ~3; const jj = new Uint8Array(jl).fill(0x20); jj.set(j); j = jj;
  const total = 12 + 8 + j.length + 8 + bin.length; const out = new Uint8Array(total); const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(j, 20);
  dv.setUint32(20 + j.length, bin.length, true); dv.setUint32(24 + j.length, 0x004e4942, true); out.set(bin, 28 + j.length);
  return out;
}
const RED = [230, 20, 20]; const YELLOW = [250, 240, 10]; const GREEN = [20, 220, 30]; const BLUE = [20, 40, 230];
const W = (p, data) => window.hub.fs.write(p, typeof data === 'string' ? data : data);
await safe('fixtures', async () => {
  const car = cubeGltf({ images: ['textures/paint%20red.png', '../shared/glow.png'], emissive: true });
  await W(`${SRC}/car/car.gltf`, JSON.stringify(car.json, null, 2)); await W(`${SRC}/car/buffers/car.bin`, car.bin);
  await W(`${SRC}/car/textures/paint red.png`, await png(RED)); await W(`${SRC}/shared/glow.png`, await png(YELLOW));
  const c = cube(); const v = []; const vt = []; const f = [];
  for (let i = 0; i < 24; i++) { v.push(`v ${c.P[i * 3]} ${c.P[i * 3 + 1]} ${c.P[i * 3 + 2]}`); vt.push(`vt ${c.U[i * 2]} ${1 - c.U[i * 2 + 1]}`); }
  for (let i = 0; i < 36; i += 3) f.push(`f ${[0, 1, 2].map((k) => `${c.I[i + k] + 1}/${c.I[i + k] + 1}`).join(' ')}`);
  await W(`${SRC}/chair/chair.obj`, `mtllib chair.mtl\n${v.join('\n')}\n${vt.join('\n')}\nusemtl seat\n${f.join('\n')}\n`);
  await W(`${SRC}/chair/chair.mtl`, 'newmtl seat\nKa 1 1 1\nKd 1 1 1\nmap_Kd -s 1 1 1 maps/seat.png\n'); await W(`${SRC}/chair/maps/seat.png`, await png(GREEN));
  const g = cubeGltf({ images: ['x'], embedded: await png(BLUE) }); await W(`${SRC}/robot.glb`, glb(g.json, g.bin));
  const br = cubeGltf({ images: ['paint.png'], bufUri: 'wheels.bin' }); await W(`${SRC}/broken/broken.gltf`, JSON.stringify(br.json)); await W(`${SRC}/broken/paint.png`, await png(RED));
  const dd = cubeGltf({ images: ['textures/drop.png'], bufUri: 'drop.bin' }); await W(`${SRC}/dropped/drop.gltf`, JSON.stringify(dd.json)); await W(`${SRC}/dropped/drop.bin`, dd.bin); await W(`${SRC}/dropped/textures/drop.png`, await png(RED));
  const ex = cubeGltf({ images: ['textures/Base%20Color.png'], bufUri: 'scene.bin' }); await W(`${SRC}/Blender export/scene.gltf`, JSON.stringify(ex.json)); await W(`${SRC}/Blender export/scene.bin`, ex.bin); await W(`${SRC}/Blender export/textures/Base Color.png`, await png(GREEN));
  step('fixtures: a .gltf (+ .bin, pictures in sub-folders and a folder up), an .obj (+ .mtl, a picture), a .glb, a broken .gltf, a drop, an export folder', true);
});

// ---------- the Lab ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director && typeof ThreeModels !== 'undefined', 60000);
const cmd = await ThreeLab.cmd(); const D = ThreeLab.director;
await wait(800);
try { cmd.customSize(480, 270); cmd.size('custom'); } catch { /* the default size */ }
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(400); } return r; };
const refsDir = (p) => /^(.*[\\/]refs[\\/]\d{10,}-[^\\/]+)[\\/]/.exec(p || '')?.[1] || null;
const list = async (dir) => (await window.hub.fs.list(dir, { recursive: true, depth: 8 })).filter((x) => !x.isDir).map((x) => x.path.slice(dir.length + 1).replace(/\\/g, '/')).sort();
// a layer's model loaded (lab3d.list), then its textures' texels on the graphics card and the middle of its frame
const loaded = (name) => until(async () => { const l = await sbx(`return JSON.stringify((globalThis.lab3d?.list() || []).find((x) => x.name === ${JSON.stringify(name)}) || null)`); const v = typeof l === 'string' ? JSON.parse(l) : null; return v && (v.loaded || v.error) ? v : null; }, 40000, 300);
const PIX = (layer) => `const e = window.__scenes[${JSON.stringify(layer)}]; if (!e) return JSON.stringify({ error: 'no layer ' + Object.keys(window.__scenes).join(',') });
const r = e.renderer; const gl = r.getContext(); const maps = {};
e.scene.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'emissiveMap']) if (m[k] && !maps[k]) maps[k] = m[k]; });
const texel = (tex) => { const p = r.properties.get(tex); if (!p?.__webglTexture) return 'not on the graphics card'; const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, p.__webglTexture, 0); const px = new Uint8Array(4); gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); r.resetState(); return Array.from(px); };
r.render(e.scene, e.camera);
const mid = new Uint8Array(4); gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, mid);
return JSON.stringify({ map: maps.map ? texel(maps.map) : 'no map', emissiveMap: maps.emissiveMap ? texel(maps.emissiveMap) : null, mid: Array.from(mid), maps: Object.keys(maps) });`;
const pixels = async (layer) => { const v = await until(async () => { const s = await sbx(PIX(layer)); const j = typeof s === 'string' ? JSON.parse(s) : null; return j && Array.isArray(j.map) ? j : null; }, 15000, 400); return v || JSON.parse((await sbx(PIX(layer))) || '{}'); };
const near = (px, rgb, tol = 40) => Array.isArray(px) && rgb.every((c, i) => Math.abs(px[i] - c) <= tol);
const hue = (px, k) => Array.isArray(px) && px[3] > 0 && [0, 1, 2].every((i) => i === k || px[k] > px[i] + 25);
const added = {};

// ---------- add + preview ----------
for (const [label, file, color, k, folder] of [['car', `${SRC}/car/car.gltf`, RED, 0, ['car/buffers/car.bin', 'car/car.gltf', 'car/textures/paint red.png', 'shared/glow.png']], ['chair', `${SRC}/chair/chair.obj`, GREEN, 1, ['chair.mtl', 'chair.obj', 'maps/seat.png']], ['robot', `${SRC}/robot.glb`, BLUE, 2, null]]) {
  await safe(`add ${label}`, async () => {
    const res = await ThreeModels.add(file, { name: label });
    const r = D.refs.list().find((x) => x.key === res.ref);
    const info = ThreeLab.refAdded?.();
    added[label] = { r, layer: res.layer };
    const dir = refsDir(r?.path);
    if (folder) step(`add ${label}: copied whole into data/refs/<time>-${label}/, the layout kept`, dir && /[\\/]refs[\\/]\d{10,}-/.test(dir) && JSON.stringify(await list(dir)) === JSON.stringify(folder) && info?.files === folder.length && !info.missing.length, { path: r?.path, files: dir ? await list(dir) : null, info });
    else step(`add ${label}: a .glb is one file in refs/ (as before)`, r && !dir && /[\\/]refs[\\/]\d{10,}-robot\.glb$/.test(r.path) && info?.files === 1, { path: r?.path, info });
    const st = await loaded(label);
    step(`preview ${label}: the model layer loads`, st?.loaded && !st.error, st);
    const p = await pixels(res.layer);
    out.px[label] = p;
    step(`preview ${label}: its colour picture is on the graphics card (a texel read back)`, near(p.map, color), p);
    if (label === 'car') step('preview car: the picture a folder up (../shared/glow.png) too', near(p.emissiveMap, YELLOW), p);
    step(`preview ${label}: the middle of the frame shows the picture's colour`, hue(p.mid, k), p.mid);
  });
}

// ---------- a scene's own loaders (the import map's hook) ----------
const HOOK = (kind, key) => `import * as THREE from 'three';
import { ${kind === 'gltf' ? 'GLTFLoader' : 'OBJLoader'} } from 'three/addons/loaders/${kind === 'gltf' ? 'GLTFLoader' : 'OBJLoader'}.js';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100); camera.position.set(0.6, 0.6, 2.4); camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight(0xffffff, 3));
window.__lm99 = 'loading';
new ${kind === 'gltf' ? 'GLTFLoader' : 'OBJLoader'}().load(refs.${key}, (g) => { scene.add(g.scene || g); window.__lm99 = 'ok'; }, undefined, (e) => { window.__lm99 = 'error ' + (e?.message || e); });
renderer.setAnimationLoop(() => renderer.render(scene, camera));
`;
for (const [kind, label, color] of [['gltf', 'car', RED], ['obj', 'chair', GREEN]]) {
  await safe(`hook ${kind}`, async () => {
    const key = added[label]?.r?.key; if (!key) throw new Error(`no ${label} reference`);
    const name = `Hook ${kind}`;
    await D.addLayer({ name, code: HOOK(kind, key) }, 0);
    const st = await until(async () => { const v = await sbx('return window.__lm99'); return v && v !== 'loading' ? v : null; }, 20000, 300);
    step(`hook ${kind}: a scene's own ${kind === 'gltf' ? 'GLTFLoader' : 'OBJLoader'}().load(refs.${key}) loads`, st === 'ok', st);
    const p = await pixels(name);
    step(`hook ${kind}: …with its picture (a texel read back)`, near(p.map, color), p);
    await D.removeLayer(name).catch(() => {});
  });
}
await safe('decode worker', async () => {
  const d = await sbx('return JSON.stringify(window.__labDecode ? window.__labDecode() : null)');
  const u = await sbx('return JSON.stringify(window.__labUploads ? window.__labUploads() : null)');
  step('round 89–95 paths still there: refTexture\'s decode worker and the uploads\' slice queue', typeof d === 'string' && d !== 'null' && typeof u === 'string' && u !== 'null', { d, u });
});

// ---------- missing ----------
await safe('missing', async () => {
  const res = await ThreeModels.add(`${SRC}/broken/broken.gltf`, { name: 'broken' });
  const info = ThreeLab.refAdded?.();
  step('missing: what it came without, named plainly', JSON.stringify(info?.missing) === JSON.stringify(['wheels.bin isn\'t next to broken.gltf']), info);
  const st = await loaded('broken');
  step('missing: the layer says which file', st?.error && /wheels\.bin isn't next to the model/.test(st.error), st);
  added.broken = { r: D.refs.list().find((x) => x.key === res.ref), layer: res.layer };
});

// ---------- drop ----------
await safe('drop files', async () => {
  await Lazy.load('dragdrop');
  const n0 = D.refs.list().length;
  const r = await DragDrop.toLab([`${SRC}/dropped/drop.gltf`, `${SRC}/dropped/drop.bin`, `${SRC}/dropped/textures/drop.png`]);
  const refs = D.refs.list().slice(n0);
  step('drop: a .gltf dropped with its .bin and picture adds one model, its files with it', refs.length === 1 && JSON.stringify(r.steps) === JSON.stringify(['model']) && r.with?.[0]?.n === 2 && JSON.stringify(await list(refsDir(refs[0].path))) === JSON.stringify(['drop.bin', 'drop.gltf', 'textures/drop.png']), { r, refs: refs.map((x) => x.path) });
  const st = await loaded('drop');
  step('drop: …and it shows', st?.loaded && !st.error, st);
  added.drop = { r: refs[0] };
});
await safe('drop folder', async () => {
  const n0 = D.refs.list().length;
  const r = await DragDrop.toLab([`${SRC}/Blender export`]);
  const refs = D.refs.list().slice(n0);
  step('drop: a "glTF Separate" export folder adds its model, whole', refs.length === 1 && /scene\.gltf$/.test(refs[0].path) && JSON.stringify(await list(refsDir(refs[0].path))) === JSON.stringify(['scene.bin', 'scene.gltf', 'textures/Base Color.png']), { r, refs: refs.map((x) => x.path) });
  const st = await loaded('scene');
  step('drop: …and it shows', st?.loaded && !st.error, st);
  added.scene = { r: refs[0] };
});

// ---------- remove ----------
for (const [label, x] of Object.entries(added)) {
  await safe(`remove ${label}`, async () => {
    const r = D.refs.list().find((y) => y.id === x.r?.id); if (!r) throw new Error('not in the list');
    const dir = refsDir(r.path);
    D.refs.remove(r);
    const gone = await until(async () => !(await window.hub.fs.stat(dir || r.path)), 8000, 200);
    step(`remove ${label}: ${dir ? 'its whole folder' : 'its file'} went to the Trash`, gone && !D.refs.list().some((y) => y.id === r.id), { dir, path: r.path });
  });
}
await safe('originals', async () => {
  const left = await list(SRC);
  step('the original files are untouched', ['car/car.gltf', 'car/buffers/car.bin', 'car/textures/paint red.png', 'shared/glow.png', 'chair/chair.mtl', 'robot.glb', 'dropped/drop.bin', 'Blender export/scene.bin'].every((f) => left.includes(f)), left);
});
for (const L of Object.values(added)) if (L.layer) await D.removeLayer(L.layer).catch(() => {});
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
