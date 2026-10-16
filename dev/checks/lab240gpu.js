// Lab preview GPU work per frame (round 50, lab240gpu): 240 Hz on a big screen is 4.2 ms a frame for everything the
// GPU does. On this machine the GPU is software (SwiftShader), so the work is COUNTED, not timed: a dev-only wrapper
// on the preview page's WebGL calls counts, per drawn frame, the draw calls, triangles, full-screen passes, pixels
// those passes and clears shade, render-target binds, shader program switches, texture uploads (and their pixels),
// readPixels / sync points, blits, and how many canvases drew (each one is presented: a copy of its whole drawing
// buffer while preserveDrawingBuffer is on). Four scenes (an FX stack: bloom + grade + lens + grain + vignette over a
// 3D scene; a heavy lit model with an environment and shadows; kinetic type layers over a scene; a visualizer-like
// many-objects scene), each at exact frame sizes 1280×720, 2560×1440, 3840×2160 (1 pixel per pixel) and "fit" (the
// window's own devicePixelRatio: run with --dpr 1.5 / 2 for those). The adaptive quality is held at full so the
// sizes are what they say. Then budgets (BUDGET below) per scene, per frame, scaled by the frame's pixels, and a still
// picture of each scene compared with the round-50 savings on and off (window.__lab240.set({ off: true })).
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/lab240gpu.js
// window.L240_REPORT = 1 reports without failing; window.L240_SIZES = ['1280x720'] / L240_SCENES = ['fx'] narrow it.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], table: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(800); } return r; };

// ---------- the counting wrapper (dev-only: installed by this check in the preview page, never shipped) ----------
const PROBE = `if (!window.__glc) {
  const S = { on: false, fr: new Set(), n: {}, cv: new Set(), cvPx: 0 };
  const add = (k, v = 1) => { S.n[k] = (S.n[k] || 0) + v; };
  const st = new WeakMap(); let ids = 0;
  const g = (gl) => { let s = st.get(gl); if (!s) { s = { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight, prog: null, fb: null, id: ids += 1 }; st.set(gl, s); } return s; };
  // a canvas the browser shows (and so presents and blends): connected, laid out, not hidden, no ancestor at opacity 0
  const shown = (cv) => { if (!cv?.isConnected || !cv.offsetWidth) return false; const cs = getComputedStyle(cv); if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; for (let e = cv.parentElement; e && e !== document.body; e = e.parentElement) if (Number(getComputedStyle(e).opacity) === 0) return false; return true; };
  const frame = (gl, s) => { const t = document.timeline.currentTime; S.fr.add(t); if (!s.fb) { const k = t + '|' + s.id; if (!S.cv.has(k)) { S.cv.add(k); add('canvasesDrawn'); if (shown(gl.canvas)) { add('presented'); add('presentPx', gl.drawingBufferWidth * gl.drawingBufferHeight); } } } };
  const tri = (mode, n, inst) => (mode === 4 ? Math.floor(n / 3) : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0) * inst;
  const area = (gl, s) => (s.fb ? s.w * s.h : Math.min(s.w, gl.drawingBufferWidth) * Math.min(s.h, gl.drawingBufferHeight));
  const srcPx = (a) => { for (const x of a) if (x && typeof x === 'object' && !ArrayBuffer.isView(x) && (x.width || x.videoWidth)) return [(x.videoWidth || x.width) * (x.videoHeight || x.height), x]; return [0, null]; };
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const w = (name, fn) => { const real = P[name]; if (typeof real !== 'function' || real.__glc) return; const f = function (...a) { if (S.on) { try { fn.call(this, a); } catch { /* counting only */ } } return real.apply(this, a); }; f.__glc = true; P[name] = f; };
    w('viewport', function (a) { const s = g(this); s.w = a[2]; s.h = a[3]; });
    w('bindFramebuffer', function (a) { const s = g(this); if (a[0] === this.READ_FRAMEBUFFER) return; s.fb = a[1] || null; if (a[1]) add('rtBinds'); });
    w('useProgram', function (a) { const s = g(this); if (s.prog !== a[0]) { s.prog = a[0]; add('programSwitches'); } });
    const draw = (count, inst) => function (a) { const s = g(this); const n = count(a); const k = inst(a); frame(this, s); add('draws'); add('triangles', tri(a[0], n, k)); if (n <= 6 && k <= 1) { add('fullPasses'); add('passPx', area(this, s)); if (s.fb) add('offscreenPasses'); } };
    w('drawArrays', draw((a) => a[2], () => 1));
    w('drawElements', draw((a) => a[1], () => 1));
    w('drawArraysInstanced', draw((a) => a[2], (a) => a[3]));
    w('drawElementsInstanced', draw((a) => a[1], (a) => a[4]));
    w('drawRangeElements', draw((a) => a[3], () => 1));
    w('clear', function (a) { const s = g(this); if (a[0] & this.COLOR_BUFFER_BIT) { frame(this, s); add('clears'); add('clearPx', area(this, s)); } });
    for (const m of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D']) {
      w(m, function (a) { const [px, el] = srcPx(a); add('uploads'); add('up:' + m + ':' + (el ? el.constructor.name + ':' + (el.width || el.videoWidth) : a.filter((x) => typeof x === 'number').join('x'))); if (el) { add('uploadPx', px); add(el instanceof HTMLCanvasElement ? 'canvasUploads' : el instanceof HTMLVideoElement ? 'videoUploads' : 'imageUploads'); } else if (/2D/.test(m)) { const nums = a.filter((x) => typeof x === 'number'); add('uploadPx', (nums[3] || 0) * (nums[4] || 0)); } });
    }
    // (a read into a pixel buffer doesn't wait for the GPU; one into an array does: a sync point)
    w('readPixels', function (a) { add(typeof a[6] === 'number' ? 'readsAsync' : 'readPixels'); });
    w('clientWaitSync', function (a) { if (a[2] > 0) add('syncs'); });
    w('finish', function () { add('syncs'); });
    w('blitFramebuffer', function (a) { add('blits'); add('blitPx', Math.abs((a[6] - a[4]) * (a[7] - a[5]))); });
    for (const m of ['copyTexImage2D', 'copyTexSubImage2D']) w(m, function () { add('copies'); });
    w('generateMipmap', function () { add('mipmaps'); });
  }
  window.__glc = {
    start() { S.n = {}; S.fr.clear(); S.cv.clear(); S.on = true; S.t0 = performance.now(); return true; },
    frames: () => S.fr.size,
    stop() {
      S.on = false; const frames = S.fr.size || 1; const per = {};
      for (const [k, v] of Object.entries(S.n)) per[k] = Math.round((v / frames) * 100) / 100;
      // what the browser composites: every visible canvas of the preview (each a full layer it blends)
      let layers = 0; let layerPx = 0;
      for (const cv of document.querySelectorAll('canvas')) { if (cv.width < 2 || !shown(cv)) continue; layers += 1; layerPx += cv.width * cv.height; }
      const vp = Math.round(innerWidth * devicePixelRatio) * Math.round(innerHeight * devicePixelRatio);
      const ms = performance.now() - S.t0; const perSec = {};
      for (const k of ['readPixels', 'readsAsync', 'syncs']) if (S.n[k]) perSec[k] = Math.round((S.n[k] / ms) * 10000) / 10;
      return { frames, ms: Math.round(ms), per, perSec, layers, layerPx, vp, dpr: devicePixelRatio, w: innerWidth, h: innerHeight };
    },
  };
}
return Boolean(window.__glc);`;
await sbx(PROBE);
if (window.L240_OFF) await sbx('return window.__lab240?.set({ off: true })'); // (the "before" of the round-50 savings)

// ---------- the scenes ----------
const BASE3D = (extra = '') => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#141824');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6);
scene.add(new THREE.AmbientLight('#ffffff', 0.4)); const l = new THREE.DirectionalLight('#ffeedd', 2.5); l.position.set(3, 4, 5); scene.add(l);
const s = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 32), new THREE.MeshStandardMaterial({ color: '#ff7040', emissive: '#ff5020', emissiveIntensity: 0.6, roughness: 0.4 })); s.position.x = -1.3; scene.add(s);
const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: '#40c0a0' })); b.position.x = 1.5; scene.add(b);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
${extra}
renderer.setAnimationLoop(() => { const t = globalThis.__l240t ?? performance.now() / 1000; b.rotation.set(t * 0.7, t, 0); s.position.y = Math.sin(t * 2) * 0.3; renderer.render(scene, camera); });`;
const MODEL = `import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#202028');
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 1.6, 6);
const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 600, 96), new THREE.MeshPhysicalMaterial({ color: '#c0a070', metalness: 0.9, roughness: 0.25, clearcoat: 1 })); knot.position.y = 1.4; knot.castShadow = true; scene.add(knot);
const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.MeshStandardMaterial({ color: '#303038', roughness: 0.8 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => { const t = globalThis.__l240t ?? performance.now() / 1000; camera.position.x = Math.sin(t * 0.2) * 6; camera.position.z = Math.cos(t * 0.2) * 6; camera.lookAt(0, 1.2, 0); renderer.render(scene, camera); });`;
const TYPE = (text, y, extra = '') => `textLayer({ size: 0.1, y: ${y}, wobble: 0.4, inAnim: 'wave', hold: 99, glow: 0.4${extra} }, { text: ${JSON.stringify(text)} });`;
const VIZ = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#05060a');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200); camera.position.set(0, 6, 22);
const bars = []; const geo = new THREE.BoxGeometry(0.3, 1, 0.3);
for (let i = 0; i < 256; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 256, 0.8, 0.55) })); const a = (i / 256) * Math.PI * 2; m.position.set(Math.cos(a) * 8, 0, Math.sin(a) * 8); scene.add(m); bars.push(m); }
const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 1), new THREE.MeshBasicMaterial({ color: '#80c0ff' }), 4000); const o = new THREE.Object3D();
scene.add(inst);
const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 30000 }, () => (Math.random() - 0.5) * 60), 3)), new THREE.PointsMaterial({ size: 0.08, color: '#ffffff' })); scene.add(pts);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => { const t = globalThis.__l240t ?? performance.now() / 1000; const sp = audio.spectrum;
  for (let i = 0; i < bars.length; i++) { const v = (sp?.[i % (sp?.length || 1)] || 0) / 255; bars[i].scale.y = 0.2 + v * 6 + Math.sin(t * 3 + i * 0.2) * 0.5; }
  for (let i = 0; i < 4000; i++) { const a = i * 0.0157 + t * 0.2; o.position.set(Math.cos(a) * (3 + (i % 50) * 0.1), Math.sin(i * 0.37 + t) * 2, Math.sin(a) * (3 + (i % 50) * 0.1)); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); }
  inst.instanceMatrix.needsUpdate = true; pts.rotation.y = t * 0.05; renderer.render(scene, camera); });`;
const fcode = (type, vals) => ThreeLayers.filterCode(type, vals);
const SCENES = {
  fx: [['Scene', BASE3D()], ['Bloom', fcode('bloom', { intensity: 1.2 })], ['Grade', GradeCore.code('grade', { exposure: 0.2 })], ['Lens', GradeCore.code('lens', {})], ['Grain', fcode('grain', {})], ['Vignette', fcode('vignette', {})]],
  model: [['Model', MODEL]],
  type: [['Scene', BASE3D()], ['Title', `${TYPE('BIG SCREEN', 0.25)}`], ['Sub', `${TYPE('two hundred forty', -0.05, ", size: 0.06")}`], ['Kick', `${TYPE('KICK', -0.3, ", kickScale: 0.4")}`]],
  viz: [['Visualizer', VIZ]],
  // two opaque scenes: the bottom one is covered (labadapt doesn't draw it), the top one's pixels are checked twice a second
  stack: [['Under', BASE3D()], ['Over', BASE3D().replace("'#141824'", "'#241418'")]],
};
// (4K: L240_SIZES = ['3840x2160'], one scene per run: SwiftShader on a busy machine can take the GPU process down at 4K)
const SIZES = window.L240_SIZES || ['1280x720', '2560x1440', 'fit'];
const WANT = window.L240_SCENES || Object.keys(SCENES);
// (at least 3 s and 4 drawn frames, at most 20 s: SwiftShader draws a 4K frame in seconds)
const measure = async () => { await sbx(PROBE); if (window.L240_OFF) await sbx('return window.__lab240?.set({ off: true })'); await sbx('return window.__glc.start()'); const t0 = Date.now(); await wait(3000); while (Date.now() - t0 < 20000 && (await sbx('return window.__glc.frames()')) < 4) await wait(500); return sbx('return window.__glc.stop()'); };
// the preview as the screen shows it (a screenshot of the window, the preview's rectangle), as RGBA
const screen = async () => {
  const f = document.querySelector('iframe[src*="three-sandbox"]'); const r = f.getBoundingClientRect(); const k = devicePixelRatio;
  const img = await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png', clip: { x: r.left, y: r.top, width: Math.min(r.width, 640), height: Math.min(r.height, 360), scale: 1 } } });
  const im = new Image(); im.src = `data:image/png;base64,${img.data}`; await im.decode();
  const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
  return g.getImageData(0, 0, cv.width, cv.height).data;
};
const diff = (a, b) => { if (!a || !b || a.length !== b.length) return { mean: 999, n: 0 }; let m = 0; let mx = 0; let n = 0; for (let i = 0; i < a.length; i += 4) for (let j = 0; j < 3; j++) { const d = Math.abs(a[i + j] - b[i + j]); m += d; if (d > mx) mx = d; n++; } let av = 0; for (let i = 0; i < a.length; i += 4) av += a[i] + a[i + 1] + a[i + 2]; return { mean: Math.round((m / n) * 1000) / 1000, max: mx, n, avg: Math.round(av / n) }; };
const setSize = async (sz) => { if (sz === 'fit') c.size('fit'); else { const [w, h] = sz.split('x').map(Number); c.customSize(w, h); } await wait(2500); };
const steady = async () => { await sbx('window.__labAdapt?.set({ level: 0, hold: true }); return 1'); };
for (const name of WANT) {
  const layers = SCENES[name];
  await d.newSketch(`lab240 ${name}`, layers[0][1], 3);
  for (const [n, code] of layers.slice(1)) await d.addLayer({ name: n, code }, 2);
  await wait(2500);
  // the picture on screen (what the compositor shows), frozen, with the round-50 savings on and off
  if (!window.L240_OFF && !window.L240_NOPIC) {
    await setSize('1280x720'); await steady();
    // (every layer drawn and settled: the page runs the scene again when the frame size changes its pixel ratio)
    await until(async () => { const h = await sbx1('return window.__labHealth()'); return h && h.overlays === 0 && h.layers === SCENES[name].length; }, 20000); await wait(2500);
    c.freeze(true); await wait(1500);
    const a = await screen();
    await sbx('return window.__lab240.set({ off: true })'); await wait(500);
    const b = await screen();
    await sbx('return window.__lab240.set({ off: false })'); await wait(500);
    const a2 = await screen(); // (the same frozen frame again: the two "on" looks must match too)
    c.freeze(false); await wait(500);
    const dm = diff(a, b);
    out.pictures = out.pictures || {}; out.pictures[name] = dm;
    step(`${name}: the picture on screen is the same with the savings on and off (mean channel difference ≤ 0.5 of 255)`, dm.mean <= 0.5 && dm.n > 1000 && dm.avg > 3 && diff(a, a2).mean <= 0.5, { ...dm, again: diff(a, a2).mean });
    // shadows kept between frames: the camera goes round and comes back to the same place, drawn with the saving on
    // and off (the model stands still: its shadow map is the one drawn long before)
    if (name === 'model') {
      const pic = async (off) => {
        await sbx(`window.__lab240.set({ off: ${off} }); globalThis.__l240t = 3.6; return 1`); await wait(900);
        await sbx('globalThis.__l240t = 3; return 1'); await wait(1500);
        c.freeze(true); await wait(1200); const p = await screen(); c.freeze(false); await wait(300); return p;
      };
      const sh0 = (await sbx('return window.__lab240.info()')).shadows;
      const on = await pic(false); const sh1 = (await sbx('return window.__lab240.info()')).shadows;
      const off = await pic(true);
      await sbx('window.__lab240.set({ off: false }); delete globalThis.__l240t; return 1');
      const ds = diff(on, off);
      out.pictures.modelShadows = ds;
      step('model: shadow maps kept while only the camera moves, the same picture as drawing them every frame (≤ 0.5)', ds.mean <= 0.5 && ds.avg > 3 && sh1.skipped > sh0.skipped, { ...ds, skipped: sh1.skipped - sh0.skipped, drawn: sh1.drawn - sh0.drawn });
    }
  }
  out.table[name] = {};
  for (const sz of SIZES) {
    await setSize(sz); await steady(); await wait(1200);
    const m = await measure();
    m.hidden = (await sbx('return window.__lab240?.info()'))?.hidden?.length ?? null;
    out.table[name][sz] = m;
  }
}
try { c.size('fit'); } catch { /* fit */ }
// ---------- budgets (per drawn frame, at every size measured; the "before" numbers are in docs/upgrades/lab240gpu.md) ----------
// layers: canvases the browser blends · presented: canvases drawn and shown · passes: full-screen passes · uploads:
// canvases copied into another layer's texture · rt: render-target binds (a shadow map is one) · draws: draw calls
const BUDGET = {
  fx: { layers: 1, presented: 1.05, fullPasses: 2.05, canvasUploads: 2.05 }, // (bloom + grade + lens + grain + vignette: two passes, one picture blended)
  model: { layers: 1, rtBinds: 0.5 }, // (the camera goes round a still model: its shadow map is kept)
  type: { layers: 4, presented: 4.05 }, // (three transparent type layers over a scene: each is blended; nothing grows)
  viz: { layers: 1, draws: 270 },
  stack: { layers: 1 }, // (the covered scene is neither drawn nor blended)
};
if (!window.L240_OFF) {
  for (const [name, b] of Object.entries(BUDGET)) {
    for (const [sz, m] of Object.entries(out.table[name] || {})) {
      if (m.error) { step(`${name} ${sz}: measured`, false, m.error); continue; }
      const got = { layers: m.layers, ...m.per }; const over = [];
      for (const [k, v] of Object.entries(b)) if ((got[k] || 0) > v) over.push(`${k} ${got[k]} > ${v}`);
      if (m.perSec?.readPixels || m.per?.syncs) over.push(`GPU syncs: ${m.perSec?.readPixels || 0} reads/s, ${m.per?.syncs || 0} waits/frame`);
      step(`${name} ${sz}: within its budget per frame`, !over.length, over.length ? over : undefined);
    }
  }
}
out.ok = window.L240_REPORT ? true : out.steps.every((s) => s.ok);
return JSON.stringify(out, null, 1);
