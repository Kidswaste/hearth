// 🅰 type layers drawn tight + 🧊 model bloom at the screen's pixels (round 51, labtype240). The GPU here is software
// (SwiftShader): work is COUNTED per drawn frame with lab240gpu's dev-only WebGL wrapper (copied below): canvases the
// browser blends and their pixels, pixels cleared, canvases presented and their pixels, draws, uploads. Scenes: three
// type layers over a 3D scene (lab240gpu's), a kinetic line (steps on a 0.4 s clock, a punch on each, outline drawn
// on, glow), 3D letters (chrome, turning), a held title over nothing (still: it should stop drawing). Each at the exact
// frame 1280×720 and "fit" at pixel ratio 2 (others: window.LT_SIZES = ['2560x1440', '3840x2160'], --dpr 1 / 1.5), measured with
// the saving off ("before": window.__labType.tight(false), the whole-frame canvas and an upload every frame, exactly
// the old path) and on. Pictures: the merged still (what stills / recordings / renders merge) and the window's own
// screenshot, frozen, on vs off. Then a 🧊 model with bloom: its composer's pictures are the canvas's own pixels from
// the first frame (at --dpr 2 they were the window's CSS size).
//   node dev/smoke.js --check-timeout 900000 --dpr 2 --script dev/checks/labtype240.js
// window.LT_REPORT = 1 reports without failing; window.LT_SIZES / LT_SCENES narrow it; LT_NOMODEL skips the model.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
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
    const w = (name, fn, always = false) => { const real = P[name]; if (typeof real !== 'function' || real.__glc) return; const f = function (...a) { if (S.on || always) { try { fn.call(this, a); } catch { /* counting only */ } } return real.apply(this, a); }; f.__glc = true; P[name] = f; };
    w('viewport', function (a) { const s = g(this); s.w = a[2]; s.h = a[3]; }, true); // (followed all the time: three.js sets it only when it changes)
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

// ---------- the scenes ----------
const BASE3D = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#141824');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6);
scene.add(new THREE.AmbientLight('#ffffff', 0.4)); const l = new THREE.DirectionalLight('#ffeedd', 2.5); l.position.set(3, 4, 5); scene.add(l);
const s = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 32), new THREE.MeshStandardMaterial({ color: '#ff7040', emissive: '#ff5020', emissiveIntensity: 0.6, roughness: 0.4 })); s.position.x = -1.3; scene.add(s);
const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: '#40c0a0' })); b.position.x = 1.5; scene.add(b);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => { const t = performance.now() / 1000; b.rotation.set(t * 0.7, t, 0); s.position.y = Math.sin(t * 2) * 0.3; renderer.render(scene, camera); });`;
const TYPE = (text, y, extra = '') => `textLayer({ size: 0.1, y: ${y}, wobble: 0.4, inAnim: 'wave', hold: 99, glow: 0.4${extra} }, { text: ${JSON.stringify(text)} });`;
const SCENES = {
  type: [['Scene', BASE3D], ['Title', TYPE('BIG SCREEN', 0.25)], ['Sub', TYPE('two hundred forty', -0.05, ", size: 0.06")], ['Kick', TYPE('KICK', -0.3, ", kickScale: 0.4")]],
  kinetic: [['Scene', BASE3D], ['Moves', `textLayer({ size: 0.11, y: -0.2, inAnim: 'outline-draw', outAnim: 'fade', unit: 'word', kSync: 'seconds', kSecs: 0.4, kEvery: 1, kHold: 2, kFx: 'punch', kDur: 0.35, glow: 0.8, outline: 0.02, softness: 0.1 }, { text: 'ON EVERY STEP NOW' });`]],
  type3d: [['Scene', BASE3D], ['Letters', `textLayer({ size: 0.13, material: 'chrome', spin: 0.25, tilt: 0.2, wobble: 0.3, inAnim: 'wave', hold: 99 }, { text: 'CHROME', mode: '3d' });`]],
  still: [['Held', `textLayer({ size: 0.1, inAnim: 'fade', dur: 0.2, stagger: 0, hold: 0, glow: 0.3 }, { text: 'HELD STILL' });`]],
};
const SIZES = window.LT_SIZES || ['1280x720', 'fit']; // (2560×1440 / 4K on request: the numbers are in docs/upgrades/labtype240.md)
const WANT = window.LT_SCENES || Object.keys(SCENES);
const tight = (on) => sbx(`return window.__labType.tight(${on})`);
const measure0 = async () => { await sbx(PROBE); await sbx('return window.__glc.start()'); await until(async () => (await sbx1('return window.__glc.frames()')) >= 4, 20000); await sbx('return window.__glc.start()'); const t0 = Date.now(); await wait(3000); while (Date.now() - t0 < 20000 && (await sbx('return window.__glc.frames()')) < 4) await wait(500); return sbx('return window.__glc.stop()'); };
const measure = async () => { const m = await measure0(); if (!m?.error) return m; await wait(4000); return measure0(); };
const setSize = async (sz) => { if (sz === 'fit') c.size('fit'); else { const [w, h] = sz.split('x').map(Number); c.customSize(w, h); } await wait(2500); };
const steady = async () => { await sbx('window.__labAdapt?.set({ level: 0, hold: true }); return 1'); };
const settle = async (name) => { await until(async () => { const h = await sbx1('return window.__labHealth()'); return h && h.overlays === 0 && h.layers === SCENES[name].length; }, 20000); await wait(2500); };
const decode = async (url) => { const im = new Image(); im.src = url; await im.decode(); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, cv.width, cv.height).data; };
const screen = async () => {
  const f = document.querySelector('iframe[src*="three-sandbox"]'); const r = f.getBoundingClientRect();
  const img = await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png', clip: { x: r.left, y: r.top, width: Math.min(r.width, 640), height: Math.min(r.height, 360), scale: 1 } } });
  return decode(`data:image/png;base64,${img.data}`);
};
const still = async () => decode(await sbx('return window.__labAdapt.peek()'));
const diff = (a, b) => { if (!a || !b || a.length !== b.length) return { mean: 999, max: 999, n: 0 }; let m = 0; let mx = 0; let n = 0; let px = 0; for (let i = 0; i < a.length; i += 4) { let any = false; for (let j = 0; j < 3; j++) { const v = Math.abs(a[i + j] - b[i + j]); m += v; if (v > mx) mx = v; if (v) any = true; n++; } if (any) px += 1; } let av = 0; for (let i = 0; i < a.length; i += 4) av += a[i] + a[i + 1] + a[i + 2]; return { mean: Math.round((m / n) * 1000) / 1000, max: mx, px, n, avg: Math.round(av / n) }; };
const M = (v) => Math.round((v || 0) / 10000) / 100; // (millions of pixels)
const row = (m) => (m?.error ? { error: m.error } : { layers: m.layers, layerMpx: M(m.layerPx), presented: m.per.presented || 0, presentMpx: M(m.per.presentPx), clearMpx: M(m.per.clearPx), draws: m.per.draws || 0, uploads: m.per.uploads || 0, frames: m.frames, fps: Math.round((m.frames / Math.max(1, m.ms)) * 10000) / 10, vpMpx: M(m.vp) });
for (const name of WANT) {
  const layers = SCENES[name];
  await d.newSketch(`labtype240 ${name}`, layers[0][1], 3);
  for (const [n, code] of layers.slice(1)) await d.addLayer({ name: n, code }, 2);
  await wait(2500);
  // ---- pictures: the merged still and the screen, frozen, drawn tight vs the whole frame ----
  if (!window.LT_NOPIC) {
    await setSize('1280x720'); await steady(); await settle(name);
    let a; let b; let a2; let sa; let sb;
    for (let k = 0; k < 3; k++) {
      c.freeze(true); await wait(1500);
      a = await still(); sa = await screen();
      await tight(false); await wait(1500);
      b = await still(); sb = await screen();
      await tight(true); await wait(1500);
      a2 = await still(); const sa2 = await screen();
      c.freeze(false); await wait(500);
      if (diff(a, a2).mean <= 0.2 && diff(sa, sa2).mean <= 0.2) break;
      (out.pictureRetries ||= {})[name] = k + 1; await wait(2000);
    }
    const ds = diff(a, b); const dw = diff(sa, sb);
    (out.pictures ||= {})[name] = { still: ds, screen: dw, again: diff(a, a2).mean };
    step(`${name}: the merged still is the same drawn tight and whole-frame (mean ≤ 0.05, max ≤ 2 of 255)`, ds.mean <= 0.05 && ds.max <= 2 && ds.avg > 2, ds);
    step(`${name}: the screen shows the same picture (mean ≤ 0.5)`, dw.mean <= 0.5 && dw.avg > 2, dw);
  }
  out.table[name] = {};
  for (const sz of SIZES) {
    await setSize(sz); await steady(); await settle(name);
    const r = {};
    for (const on of [false, true]) { await tight(on); await wait(1500); const m = await measure(); r[on ? 'after' : 'before'] = row(m); }
    const info = await sbx('return window.__labType.info().map((x) => ({ tight: x.tight, leases: x.leases, glyphs: x.glyphs }))');
    r.type = info;
    out.table[name][sz] = r;
  }
  await tight(true);
}
try { c.size('fit'); } catch { /* fit */ }
// ---------- budgets (after, per drawn frame, as shares of the frame's pixels) ----------
// clear / layer: pixels cleared / blended as frames' worth (the 3D scene under them is 1 frame) · presented: canvases presented
const BUDGET = {
  type: { layerF: 1.9, clearF: 1.9 }, // (before: 4 frames blended, 4 cleared)
  kinetic: { layerF: 1.8, clearF: 1.8 }, // (before: 2 and 2; a line as wide as the frame, words punching: its lease is taller at times)
  type3d: { layerF: 1.8, clearF: 1.8 },
  still: { fps: 2.5 }, // (a held title: frames drawn a second, the once-a-second refresh; before: every frame)
};
if (!window.LT_REPORT) {
  for (const [name, bud] of Object.entries(BUDGET)) {
    for (const [sz, r] of Object.entries(out.table[name] || {})) {
      const m = r.after; if (!m || m.error) { step(`${name} ${sz}: measured`, false, m?.error); continue; }
      const got = { layerF: m.layerMpx / Math.max(0.01, m.vpMpx), clearF: m.clearMpx / Math.max(0.01, m.vpMpx), fps: m.fps };
      const over = []; for (const [k, v] of Object.entries(bud)) if (got[k] > v) over.push(`${k} ${Math.round(got[k] * 100) / 100} > ${v}`);
      const ls = (r.type || []).reduce((s, x) => s + (x.leases || 0), 0); // (leases since the layer began: a handful, not one a frame)
      if (ls > 40 * Math.max(1, (r.type || []).length)) over.push(`leases ${ls}`); // (a new size, a toggle, a word in: a new lease, not one a frame)
      step(`${name} ${sz}: within its budget`, !over.length, over.length ? over : undefined);
    }
  }
}
// ---------- 🧊 a model with bloom: its composer at the canvas's own pixels from its first frame ----------
if (!window.LT_NOMODEL) {
  const DIR = '/tmp/hearth-labtype240';
  // (a GLB: one triangle pair, made here)
  const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, -0.5]); const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 3, 2, 0, 3, 1]);
  const bin = new Uint8Array(48 + 24); bin.set(new Uint8Array(pos.buffer), 0); bin.set(new Uint8Array(idx.buffer), 48);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'glow' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.5, 0.2, 1] }, emissiveFactor: [1, 0.6, 0.2] }], buffers: [{ byteLength: 72 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 24 }], accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); js = new Uint8Array([...js, ...new Array((4 - (js.length % 4)) % 4).fill(0x20)]);
  const total = 28 + js.length + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  await hub.fs.write(`${DIR}/glow.glb`, u);
  await d.newSketch('labtype240 model', BASE3D, 3);
  const C = H.claudeAgent();
  const say = async (line) => { let text = ''; await Commands.tryRun(line, C.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { text = String(e); } }); return text; };
  await say(`/model add ${DIR}/glow.glb`);
  await setSize('fit'); await steady();
  const lst = async () => sbx('return globalThis.lab3d ? lab3d.list() : null');
  await until(async () => (await lst())?.find((m) => m.name === 'glow')?.loaded, 25000);
  await say('/model look hologram'); // (bloom on: a composer)
  // (its first frames: the composer exists, then its first frame draws; at most 2 s after it exists)
  await until(async () => (await lst())?.find((x) => x.name === 'glow')?.fxPx, 15000); await wait(2000);
  const got = (await lst())?.find((x) => x.name === 'glow');
  const cv = await sbx('const r = [...lab3d.live.values()].find((S) => S.name === "glow"); return r ? [innerWidth, innerHeight, devicePixelRatio, ...(r.composer ? [r.composer.renderTarget1.width, r.composer.renderTarget1.height, r.composer.renderTarget2.width] : [])] : null');
  const canv = await sbx('const cs = [...document.querySelectorAll(".lab-layer canvas")].filter((x) => x.width > 2).map((x) => [x.width, x.height]); return cs');
  out.model = { fxPx: got?.fxPx, page: cv, canvases: canv };
  // the composer's first picture = the model canvas's pixels (± 1 for rounding): the biggest canvas is the model's or the scene's, same size
  const big = (canv || []).reduce((m, x) => (x[0] > m[0] ? x : m), [0, 0]);
  step(`🧊 bloom: the composer draws at the canvas's own pixels (${got?.fxPx?.join('×')} for a ${big.join('×')} canvas at pixel ratio ${cv?.[2]})`, got?.fxPx && Math.abs(got.fxPx[0] - big[0]) <= 1 && Math.abs(got.fxPx[1] - big[1]) <= 1 && cv?.[5] === got.fxPx[0]);
}
out.ok = window.LT_REPORT ? true : out.steps.every((s) => s.ok);
out.pass = out.ok;
return JSON.stringify(out, null, 1);
