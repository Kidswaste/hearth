// (round 100, modeltex100) A model's own pictures, in the Lab and beyond. Fixtures (made here, in the check's own temp
// folder): a .gltf with its .bin and a 4096² picture in textures/ (+ a small one a folder up), a .glb with a 4096² picture
// inside, an .obj whose .mtl names a 2048² picture, and a small .gltf "kart" (its .bin, a picture with a space in its name)
// for ▶ Play and a published page. Each model is added with /model add's path (ThreeModels.add → a 🧊 layer).
//   add:<model>  the preview's frames recorded (window.__labHitch) while the model arrives and its big picture goes up:
//                pixel uploads and shader compiles inside frames on screen (0), the biggest single upload (≤ 4.2 MP:
//                in slices), hitches over 2× the frame budget judged on CPU as labcompile90 does (load-aware: a late
//                frame the app's CPU doesn't explain is "can't tell (load)", listed, not failing); then the picture's
//                texel read back from the graphics card at its far corner (only there when the whole 4096² is up)
//   hook         a scene's own GLTFLoader().load(refs.robot) (the import map's hook): the same path, the same numbers
//   live         the car's original picture saved again by "another app" (fw:test, as Photoshop would): the new colour
//                read back at the far corner, the scene not run again, no upload inside a frame on screen
//   play         ▶ Play of a scene with the kart: its page has all the model's files, the model loads, its picture is on
//                the graphics card (texel), no errors
//   publish      the same scene built as a published page (deploy:build): the files under assets/<key>/ in their layout,
//                the page checked in a hidden window (deploy:verify: drawn, no errors)
// window.MT100_REPORT = 1 only reports (for a base without this round).
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/modeltex100.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return false; };
const REPORT = Boolean(window.MT100_REPORT);
const out = { steps: [], stretches: {}, cantTell: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok) || REPORT, ...(REPORT && !ok ? { failedOnBase: true } : {}), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 240000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/mt100c`;
const SRC = `${DIR}/src`;
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
const sum = (a) => (a || []).reduce((x, y) => x + y, 0);
const HITCH = Number(window.MT100_HITCH ?? 1);

// ---------- fixtures ----------
const pngOf = async (rgb, n) => { const c = new OffscreenCanvas(n, n); const g = c.getContext('2d'); g.fillStyle = `rgb(${rgb.join(',')})`; g.fillRect(0, 0, n, n); return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
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
function cubeGltf({ images, emissive = false, bufUri, embedded = null }) {
  const c = cube();
  const parts = [new Uint8Array(c.P.buffer), new Uint8Array(c.U.buffer), new Uint8Array(c.I.buffer)];
  let off = 0; const views = []; const chunks = [];
  const pad = (n) => (n + 3) & ~3;
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
  const total = 12 + 8 + j.length + 8 + bin.length; const o = new Uint8Array(total); const dv = new DataView(o.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length, true); dv.setUint32(16, 0x4e4f534a, true); o.set(j, 20);
  dv.setUint32(20 + j.length, bin.length, true); dv.setUint32(24 + j.length, 0x004e4942, true); o.set(bin, 28 + j.length);
  return o;
}
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const RED = [230, 20, 20]; const YELLOW = [250, 240, 10]; const GREEN = [20, 220, 30]; const BLUE = [20, 40, 230]; const CYAN = [20, 200, 220]; const ORANGE = [250, 140, 20];
const W = (p, data) => window.hub.fs.write(p, data);
await safe('fixtures', async () => {
  const car = cubeGltf({ images: ['textures/paint.png', '../shared/glow.png'], emissive: true, bufUri: 'buffers/car.bin' });
  await W(`${SRC}/car/car.gltf`, JSON.stringify(car.json, null, 2)); await W(`${SRC}/car/buffers/car.bin`, car.bin);
  await W(`${SRC}/car/textures/paint.png`, await pngOf(RED, 4096)); await W(`${SRC}/shared/glow.png`, await pngOf(YELLOW, 8));
  const g = cubeGltf({ images: ['x'], embedded: await pngOf(BLUE, 4096) }); await W(`${SRC}/robot.glb`, glb(g.json, g.bin));
  const c = cube(); const v = []; const vt = []; const f = [];
  for (let i = 0; i < 24; i++) { v.push(`v ${c.P[i * 3]} ${c.P[i * 3 + 1]} ${c.P[i * 3 + 2]}`); vt.push(`vt ${c.U[i * 2]} ${1 - c.U[i * 2 + 1]}`); }
  for (let i = 0; i < 36; i += 3) f.push(`f ${[0, 1, 2].map((k) => `${c.I[i + k] + 1}/${c.I[i + k] + 1}`).join(' ')}`);
  await W(`${SRC}/chair/chair.obj`, `mtllib chair.mtl\n${v.join('\n')}\n${vt.join('\n')}\nusemtl seat\n${f.join('\n')}\n`);
  await W(`${SRC}/chair/chair.mtl`, 'newmtl seat\nKa 1 1 1\nKd 1 1 1\nmap_Kd maps/seat.png\n'); await W(`${SRC}/chair/maps/seat.png`, await pngOf(GREEN, 2048));
  const k = cubeGltf({ images: ['tex/kart%20paint.png'], bufUri: 'kart.bin' }); await W(`${SRC}/kart/kart.gltf`, JSON.stringify(k.json)); await W(`${SRC}/kart/kart.bin`, k.bin); await W(`${SRC}/kart/tex/kart paint.png`, await pngOf(ORANGE, 64));
  step('fixtures: a .gltf (+ .bin, a 4096² picture, one a folder up), a .glb (a 4096² picture inside), an .obj (+ .mtl, a 2048² picture), a small .gltf kart', true);
});

// ---------- the Lab ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director && typeof ThreeModels !== 'undefined', 60000);
const D = ThreeLab.director;
const BG = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer(); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#14161c'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
await D.newSketch('modeltex100', BG, 2);
const cmd = await ThreeLab.cmd();
try { cmd.customSize(480, 270); cmd.size('custom'); } catch { /* the default size */ }
await wait(800);
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(400); } return r; };
const loaded = (name) => until(async () => { const l = await sbx(`return JSON.stringify((globalThis.lab3d?.list() || []).find((x) => x.name === ${JSON.stringify(name)}) || null)`); const v = typeof l === 'string' ? JSON.parse(l) : null; return v && (v.loaded || v.error) ? v : null; }, 60000, 300);
// a layer's model: its colour map's size on the page and texels read back from the graphics card (near and far corner),
// the middle of its frame
const TEX = (layer, at) => `const e = window.__scenes[${JSON.stringify(layer)}]; if (!e) return JSON.stringify({ error: 'no layer ' + Object.keys(window.__scenes).join(',') });
const r = e.renderer; const gl = r.getContext(); let map = null;
e.scene.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.map && !map) map = m.map; });
if (!map) return JSON.stringify({ error: 'no map' });
const p = r.properties.get(map);
const texel = (x, y) => { if (!p?.__webglTexture) return null; const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, p.__webglTexture, 0); const px = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); r.resetState(); return Array.from(px); };
return JSON.stringify({ w: map.image?.width || 0, onGpu: Boolean(p?.__webglTexture), near: texel(1, 1), far: texel(${at}, ${at}), mt: window.__labModelTex?.state?.() || null });`;
const texOf = async (layer, at) => { const s = await sbx(TEX(layer, at)); return typeof s === 'string' ? JSON.parse(s) : { error: s?.error }; };
const near = (px, rgb, tol = 40) => Array.isArray(px) && rgb.every((c, i) => Math.abs(px[i] - c) <= tol);

// ---------- one stretch, recorded (labcompile90's way: judged on CPU, load-aware) ----------
async function record(name, during, { after = 1200 } = {}) {
  await sbx('return window.__labHitch ? 1 : 0').then((v) => { if (v !== 1) throw new Error('no window.__labHitch in the preview'); });
  let traced = false;
  try { await smoke({ trace: 'start', tasks: true }); traced = true; } catch { /* judged on wall time */ }
  await sbx("performance.mark('modeltex100'); return window.__labHitch.start()");
  await wait(300);
  const info = await during();
  await wait(after);
  const raw = await sbx('return window.__labHitch.stop()');
  const f = typeof raw === 'string' ? JSON.parse(raw) : null;
  if (!f) { if (traced) await smoke({ trace: 'stop', tasks: { budget: 1e9 } }).catch(() => {}); throw new Error(`${name}: no frames from the preview`); }
  const inF = f.compilesInFrame || f.compiles;
  const upF = f.upInFrame || (f.upMPframe || []).map((x) => (x > 0 ? 1 : 0)); // (a base without the count: frames that carried pixels)
  const bigIn = f.bigUpInFrame || f.upMPframe;
  const gaps = f.gap.slice(1).filter((g) => g > 0);
  const budget = Math.max(f.cap ? 1000 / f.cap : 1000 / 60, pct(gaps, 0.5) || 0);
  const vis = (i) => f.drew[i] === 1 || f.drew[i] === 3;
  let t = 0; const hitches = [];
  for (let i = 1; i < f.n; i++) { const g = f.gap[i]; if (g > 2 * budget) hitches.push({ i, at: r1(t), ms: g }); t += g; }
  // from the frame the model went into its scene (the page marks it: 'model in'); before it, the 🧊 layer's own start
  // (a new renderer: on a card without background compiling, round 89 compiles its first scene inside its first frame)
  const m = (f.marks || []).find((x) => x[1] === 'model in');
  const from = m ? Math.max(0, m[0] - 1) : 0;
  let visC = 0; let visU = 0; let visUmp = 0; let startC = 0;
  for (let i = 0; i < f.n; i++) if (vis(i)) { if (i < from) { startC += inF[i] || 0; continue; } visC += inF[i] || 0; visU += upF[i] || 0; visUmp += (f.upMPframe || [])[i] || 0; }
  let judged = null;
  if (traced) { try { judged = await smoke({ trace: 'stop', tasks: { budget: 2 * budget, min: 0, mark: 'modeltex100', observed: hitches.map((h) => ({ at: h.at, ms: h.ms })) } }); } catch (err) { judged = { verdict: 'unknown', why: String(err).slice(0, 200) }; } }
  const blamed = new Set();
  const cause = (j, pick) => (j >= 0 && !blamed.has(j) && pick(j) ? j : -1);
  const isC = (j) => vis(j) && inF[j] > 0; const isU = (j) => (upF[j] > 0 && vis(j)) || bigIn[j] >= 1;
  for (const h of hitches) {
    const tk = judged?.tasks?.find((x) => Math.abs(x.at - h.at) < 0.6 && Math.abs(x.ms - r1(h.ms)) < 0.6);
    h.cpuMs = tk?.cpuMs ?? null;
    const i = h.i;
    const jc = cause(i, isC) >= 0 ? i : cause(i - 1, isC);
    const ju = cause(i, isU) >= 0 ? i : cause(i - 1, isU);
    if (!judged || !Array.isArray(judged.tasks)) h.judged = 'wall';
    else if (h.cpuMs != null && h.cpuMs > 2 * budget) { h.judged = 'over'; h.why = `${h.cpuMs} ms of the preview's own CPU`; }
    else if (ju >= 0) { blamed.add(ju); h.judged = 'upload'; h.why = `a picture uploaded inside frame ${ju}`; }
    else if (jc >= 0) { blamed.add(jc); h.judged = 'compile'; h.why = `${inF[jc]} shader compiles / links inside frame ${jc}`; }
    else { h.judged = 'load'; h.why = `${h.cpuMs ?? 0} ms of the preview's CPU; the rest off the CPU`; }
  }
  const load = hitches.filter((h) => h.judged === 'load');
  const s = {
    frames: f.n, budget: r1(budget), p50: pct(gaps, 0.5), p99: pct(gaps, 0.99), max: r1(Math.max(0, ...gaps)),
    uploadsInFrames: visU, uploadMPinFrames: r1(visUmp), inFrameUploads: (f.inFrameUploads || []).slice(0, 12), biggestUploadMP: r1(Math.max(0, ...(f.bigUp || f.upMP))), biggestInFrameMP: r1(Math.max(0, ...bigIn)),
    compilesInFrames: visC, compiles: sum(f.compiles),
    modelInAt: m ? m[0] : null, layerStartCompiles: startC,
    over2x: hitches.length, over2xApp: hitches.filter((h) => h.judged !== 'load' && h.i >= from).length, over2xAppStart: hitches.filter((h) => h.judged !== 'load' && h.i < from).length, over2xLoad: load.length,
    slices: f.slices, khr: f.khr, lcTex: f.lc?.tex ?? null, wg: await sbx('return window.__labWarmGap ? window.__labWarmGap.state().last : null'),
    hitches: hitches.slice().sort((a, b) => b.ms - a.ms).slice(0, 4).map((h) => ({ at: h.at, ms: r1(h.ms), cpuMs: h.cpuMs, judged: h.judged, why: h.why })),
    ...(info && typeof info === 'object' ? { info } : {}),
  };
  for (const h of load) out.cantTell.push(`${name}: a ${r1(h.ms)} ms frame (${h.why || h.judged})`);
  out.stretches[name] = s;
  return s;
}
const judge = (name, s) => {
  step(`${name}: no picture uploaded inside a frame on screen, from the model's arrival on`, s.uploadsInFrames === 0, { uploadsInFrames: s.uploadsInFrames, MP: s.uploadMPinFrames, which: s.inFrameUploads, modelInAt: s.modelInAt });
  step(`${name}: none of the model's shaders compiled inside a frame on screen`, s.compilesInFrames === 0, { compilesInFrames: s.compilesInFrames, compiles: s.compiles, layerStart: s.layerStartCompiles, modelInAt: s.modelInAt });
  // (round 101, modelcompile101) and the new layer's own start (its lights, ground, first scene): made in the gaps after
  // frames while the scene under it kept drawing, not inside its first frame
  step(`${name}: the new layer's first scene compiled nothing inside a frame on screen`, s.layerStartCompiles === 0, { layerStart: s.layerStartCompiles, wg: s.wg });
  step(`${name}: the big picture went up in slices (biggest single upload ≤ 4.2 MP)`, s.biggestUploadMP != null && s.biggestUploadMP <= 4.2, { biggest: s.biggestUploadMP, slices: s.slices });
  step(`${name}: late frames the app's CPU explains ≤ ${HITCH}`, s.over2xApp <= HITCH, { over2x: s.over2x, app: s.over2xApp, load: s.over2xLoad, hitches: s.hitches });
};

// ---------- add each model: recorded ----------
const added = {};
for (const [label, file, color, size] of [['car', `${SRC}/car/car.gltf`, RED, 4096], ['robot', `${SRC}/robot.glb`, BLUE, 4096], ['chair', `${SRC}/chair/chair.obj`, GREEN, 2048]]) {
  await safe(`add ${label}`, async () => {
    const d0 = JSON.parse((await sbx('return JSON.stringify(window.__labDecode ? window.__labDecode() : null)')) || 'null');
    let res = null; let st = null; let tx = null;
    const s = await record(`add:${label}`, async () => {
      await sbx(`window.__mt100in = 0; const f = () => { const S = [...(globalThis.lab3d?.live?.values?.() || [])].find((x) => x.name === ${JSON.stringify(label)}); if (S?.root?.parent) { window.__mt100in = window.__labHitch.mark('model in'); return; } realRAF0(f); }; const realRAF0 = window.__mt100raf ||= requestAnimationFrame.bind(window); realRAF0(f); return 1`);
      res = await ThreeModels.add(file, { name: label });
      added[label] = { layer: res.layer, ref: res.ref };
      st = await loaded(label);
      // the whole picture on the graphics card: its far corner read back
      tx = await until(async () => { const v = await texOf(res.layer, size - 6); return v && near(v.far, color) ? v : null; }, 60000, 400) || await texOf(res.layer, size - 6);
      return { loaded: Boolean(st?.loaded), error: st?.error || null };
    });
    step(`add:${label}: the model loads`, st?.loaded && !st.error, st);
    step(`add:${label}: its ${size}² picture shows: texels read back at both corners`, near(tx?.near, color) && near(tx?.far, color) && tx?.w === size, tx);
    const d1 = JSON.parse((await sbx('return JSON.stringify(window.__labDecode ? window.__labDecode() : null)')) || 'null');
    step(`add:${label}: its picture decoded in the worker (off the page's thread)`, d1?.worker && d1.decoded > (d0?.decoded || 0) && d1.onPage === (d0?.onPage || 0), { before: d0, after: d1, mt: tx?.mt });
    judge(`add:${label}`, s);
  });
}

// ---------- a scene's own GLTFLoader (the import map's hook) ----------
await safe('hook', async () => {
  const key = D.refs.list().find((x) => x.key === added.robot?.ref)?.key; if (!key) throw new Error('no robot reference');
  const code = `import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100); camera.position.set(0.6, 0.6, 2.4); camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight(0xffffff, 3));
window.__mt100 = 'loading';
new GLTFLoader().load(refs.${key}, (g) => { scene.add(g.scene); window.__labHitch.mark('model in'); window.__mt100 = 'ok'; }, undefined, (e) => { window.__mt100 = 'error ' + (e?.message || e); });
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
  let tx = null; let stt = null;
  const s = await record('hook', async () => {
    await D.addLayer({ name: 'Hook glb', code }, 0.5);
    stt = await until(async () => { const v = await sbx('return window.__mt100'); return v && v !== 'loading' ? v : null; }, 30000, 300);
    tx = await until(async () => { const v = await texOf('Hook glb', 4090); return v && near(v.far, BLUE) ? v : null; }, 60000, 400) || await texOf('Hook glb', 4090);
    return { state: stt };
  });
  step('hook: a scene\'s own GLTFLoader().load(refs.robot) loads', stt === 'ok', stt);
  step('hook: …its 4096² picture shows (texels at both corners)', near(tx?.near, BLUE) && near(tx?.far, BLUE), tx);
  judge('hook', s);
  await D.removeLayer('Hook glb').catch(() => {});
});

// ---------- live: the car's original picture saved again by another app ----------
await safe('live', async () => {
  if (!added.car) throw new Error('no car');
  await Lazy.load('filewatch').catch(() => {});
  await until(() => typeof FileWatch !== 'undefined', 20000);
  FileWatch.gatherLab?.();
  const watched = await until(async () => ((await window.hub.fw.state())?.topics?.lab || 0) >= 8, 15000, 300);
  step('live: the model\'s other files are followed (its copy\'s and the originals\')', watched, (await window.hub.fw.state())?.topics);
  await sbx(`window.__scenes[${JSON.stringify(added.car.layer)}].scene.userData.mt100 = 'same scene'; return 1`);
  const live0 = JSON.stringify(ThreeLab.live.counts());
  const u0 = await sbx('return window.__refFileUpdates || 0');
  const pic = await pngOf(CYAN, 4096);
  let tx = null;
  const s = await record('live', async () => {
    await window.hub.fw.test({ outside: [{ op: 'write', path: `${SRC}/car/textures/paint.png`, b64: b64(pic) }] });
    tx = await until(async () => { const v = await texOf(added.car.layer, 4090); return v && near(v.far, CYAN) && near(v.near, CYAN) ? v : null; }, 45000, 400) || await texOf(added.car.layer, 4090);
    return { updates: (await sbx('return window.__refFileUpdates || 0')) - u0 };
  });
  step('live: the new picture shows without reopening (texels at both corners)', near(tx?.near, CYAN) && near(tx?.far, CYAN), tx);
  const same = await sbx(`return window.__scenes[${JSON.stringify(added.car.layer)}]?.scene?.userData?.mt100 || null`);
  step('live: …in place (the scene not run again, the preview not reloaded)', same === 'same scene' && JSON.stringify(ThreeLab.live.counts()) === live0, { same, before: live0, after: ThreeLab.live.counts() });
  const r = D.refs.list().find((x) => x.key === added.car.ref);
  const copy = r ? await window.hub.fs.stat(r.path.replace(/car\.gltf$/, 'textures/paint.png')) : null;
  step('live: Hearth\'s copy of the picture has the new one', copy && Math.abs((copy.size || 0) - pic.length) < 64, { copy: copy?.size, new: pic.length });
  step('live: no picture uploaded inside a frame on screen, in slices', s.uploadsInFrames === 0 && s.biggestUploadMP <= 4.2, { uploadsInFrames: s.uploadsInFrames, which: s.inFrameUploads, biggest: s.biggestUploadMP });
  step(`live: late frames the app's CPU explains ≤ ${HITCH}`, s.over2xApp <= HITCH, { over2x: s.over2x, app: s.over2xApp, hitches: s.hitches });
});

// ---------- the big models out; the kart in (▶ Play and a published page) ----------
for (const x of Object.values(added)) {
  await D.removeLayer(x.layer).catch(() => {});
  const r = D.refs.list().find((y) => y.key === x.ref); if (r) D.refs.remove(r);
}
let kart = null;
await safe('kart', async () => {
  const res = await ThreeModels.add(`${SRC}/kart/kart.gltf`, { name: 'kart' });
  kart = { layer: res.layer, ref: res.ref, r: D.refs.list().find((y) => y.key === res.ref) };
  const st = await loaded('kart');
  step('kart: added and shown in the Lab', st?.loaded && !st.error, st);
  await wait(1500); // (the scene and its references saved)
});
const G = () => window.hub.game;
const ev = async (code) => (await G().eval(code))?.value;
await safe('play', async () => {
  if (!kart) throw new Error('no kart');
  await Lazy.load('gamemode'); await Lazy.load('gameready').catch(() => {});
  const id = ThreeLab.scenes.currentId();
  const p = GameMode.play({ kind: 'lab', id, title: 'modeltex100' });
  const on = await until(async () => (await G().state())?.playing, 90000, 300);
  step('play: ▶ Play opens', on, await G().state().catch(() => null));
  const v = await until(async () => {
    const s = await ev(`(() => { const l = (globalThis.lab3d?.list() || []).find((x) => x.name === 'kart'); return l && (l.loaded || l.error) ? JSON.stringify({ l, files: window.__labRefModel ? (window.__labRefModel(refs.${kart.ref}) || { files: new Map() }).files.size : null, errors: window.__hearthGame?.errors || [] }) : null; })()`);
    return s ? JSON.parse(s) : null;
  }, 120000, 500);
  step('play: the game\'s page has all the model\'s files (its .bin and picture)', v?.files === 2, v);
  step('play: the model loads there, no errors', v?.l?.loaded && !v.l.error && !(v.errors || []).length, v);
  const tex = await until(async () => {
    const s = await ev(`(() => { const sc = window.__scenes || {}; for (const k of Object.keys(sc)) { const e = sc[k]; let map = null; e.scene.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.map && !map) map = m.map; }); if (!map) continue; const r = e.renderer; const gl = r.getContext(); const p = r.properties.get(map); if (!p?.__webglTexture) return null; const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, p.__webglTexture, 0); const px = new Uint8Array(4); gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); r.resetState(); return JSON.stringify(Array.from(px)); } return null; })()`);
    return s ? JSON.parse(s) : null;
  }, 30000, 500);
  step('play: its picture is on the graphics card (a texel read back)', near(tex, ORANGE), tex);
  await G().leave().catch(() => {});
  await until(async () => !(await G().state())?.playing, 30000, 300);
  await p?.catch?.(() => {});
});
await safe('publish', async () => {
  if (!kart) throw new Error('no kart');
  await Lazy.load('deploy');
  const spec = await Deploy.sceneSpec();
  const b = await window.hub.deploy.build(spec, {});
  const files = (await window.hub.fs.list(`${b.dir}/assets`, { recursive: true, depth: 8 })).filter((x) => !x.isDir).map((x) => x.path.slice(b.dir.length + 1).replace(/\\/g, '/')).sort();
  step('publish: the page carries all the model\'s files, in their layout', ['kart.bin', 'kart.gltf', 'tex/kart paint.png'].every((f) => files.some((x) => x.endsWith(`/${f}`))), { files, notes: b.notes });
  const html = await window.hub.fs.read(`${b.dir}/index.html`);
  step('publish: the page tells the player where each one is', /"main":"kart\/kart\.gltf"|"main":"kart\.gltf"/.test(html) && /kart%20paint\.png/.test(html), html.match(/"refs":\[[^\]]*\]/)?.[0]?.slice(0, 400));
  const v = await window.hub.deploy.verify(b.dir, { timeout: 45000 });
  step('publish: the page draws the model, no errors (a hidden window)', v?.ok && v.drawn && !(v.errors || []).length, { ok: v?.ok, drawn: v?.drawn, errors: v?.errors, nonBlank: v?.nonBlank });
  window.hub.fs.trash([b.dir.replace(/[\\/][^\\/]+$/, '')]).catch(() => {});
});
await safe('originals', async () => {
  const g = await window.hub.fs.read(`${SRC}/kart/kart.gltf`);
  step('the original model files are untouched (only the check wrote them)', /tex\/kart%20paint\.png/.test(g), null);
});
if (kart) { await D.removeLayer(kart.layer).catch(() => {}); const r = D.refs.list().find((y) => y.key === kart.ref); if (r) D.refs.remove(r); }
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
if (REPORT) out.failedOnBase = out.steps.filter((s) => s.failedOnBase).map((s) => s.name);
return JSON.stringify(out, null, 1);
