// The Lab preview's layer canvases without a kept last frame (round 56, labcanvas56). Each layer's WebGL canvas used to
// keep its last frame (preserveDrawingBuffer: the browser copies every shown canvas every frame); now only a canvas the
// page can't draw again keeps it, and whatever reads a layer's pixels gets its current picture (drawn this frame, or
// drawn again right before the read). This check proves both halves:
//   pictures  a fixed fixture (a shadowed world with a game loop drawing the same frame, a moved / blended / faded
//             overlay, a layer that draws ONCE and never again, a filter over them, a DOM layer whose timers chain) is
//             built twice in the same page: A with every canvas keeping its frame (window.__labCanvas.set({ keep:
//             true }): the old way), B the new way. Each pass collects: the director's full picture (three_screenshot's
//             PNG), the small picture (thumbnails / director thumbs), the reload cover, the merge (peek / probe), the
//             layer picking on a 6 × 4 grid, every layer's "picture" (re-run cross-fades), the picture while frozen, a
//             second of recording (a frame decoded), an export still (PNG, the hidden export page), and the preview as
//             the screen shows it (a CDP screenshot of its box). A and B must be byte-identical (the recording's frame:
//             pixel-identical within the video codec's noise); window.LC56_HASHES prints hashes to compare two builds.
//   costs     B: no fixture canvas keeps its frame; the layers' frames run in one batch per frame; timers asked from a
//             layer's timer read no stack (the DOM layer's chain); a light game (two layers, plain colors: what the
//             browser does per canvas shows) playing at a 1920×1080 frame for 5 s, A / B / A / B: frames, the GPU
//             process's CPU per preview frame (from /proc: the software GPU does the per-frame copies there), frames
//             drawn again (none while the game plays).
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/labcanvas56.js
// window.LC56_REPORT = 1 reports without failing; window.LC56_SKIP = 'record,export,perf'; window.LC56_DUMP = a folder for the pictures.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { numbers: {}, problems: [], same: {}, hashes: {} };
const fail = (m) => out.problems.push(m);
const skip = new Set(String(window.LC56_SKIP || '').split(',').filter(Boolean));
const r2 = (x) => Math.round(x * 100) / 100;
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(10000)]);
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= typeof s === 'string' ? s.charCodeAt(i) : s[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
const c = await ThreeLab.cmd();
const D = ThreeLab.director;
await wait(600);
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(800); } return r; };
const frame = () => [...document.querySelectorAll('iframe')].find((x) => /three-sandbox/.test(x.src) && x.getBoundingClientRect().width > 50);
const toPage = (msg) => frame()?.contentWindow?.postMessage({ target: 'three-sandbox', ...msg }, '*');
const fromPage = (pred, ms = 8000) => new Promise((resolve) => { const t = setTimeout(() => { removeEventListener('message', on); resolve(null); }, ms); function on(e) { const m = e.data; if (m?.source !== 'three-sandbox' || !pred(m)) return; clearTimeout(t); removeEventListener('message', on); resolve(m); } addEventListener('message', on); });

// ---------- the fixture (no clock anywhere: every frame is the same picture) ----------
const HEAD = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 3, 8); camera.lookAt(0, 0.6, 0);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const scene = new THREE.Scene();`;
const WORLD = `${HEAD}
renderer.shadowMap.enabled = true; scene.background = new THREE.Color('#1b2433');
const sun = new THREE.DirectionalLight('#fff1dc', 2.2); sun.position.set(4, 8, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun, new THREE.HemisphereLight('#9ec5ff', '#3b2a1a', 0.7));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#5d6b4a', roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8 + (i % 3) * 0.5, 0.8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 12, 0.6, 0.55) })); const a = i * 0.52; m.position.set(Math.cos(a) * 3, 0.4 + (i % 3) * 0.25, Math.sin(a) * 3 - 0.5); m.rotation.y = a; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
renderer.setAnimationLoop(() => renderer.render(scene, camera)); // (a game loop: the same frame every time)`;
const OVERLAY = `${HEAD}
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 120, 16), new THREE.MeshNormalMaterial()); knot.position.set(-1.6, 1.4, 0); knot.rotation.set(0.4, 0.7, 0); scene.add(knot);
const f = () => { renderer.render(scene, camera); requestAnimationFrame(() => f()); }; requestAnimationFrame(f); // (a new function each frame)`;
const ONCE = `${HEAD}
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffd75e' })); cube.position.set(2.6, 2.4, 0); cube.rotation.set(0.5, 0.6, 0); scene.add(cube);
requestAnimationFrame(() => renderer.render(scene, camera)); // (drawn once, never again)`;
const HUD = `const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:8px;top:6px;font:700 14px system-ui;color:#fff'; d.textContent = 'LC56'; document.body.append(d);
let n = 0; const tick = () => { n += 1; setTimeout(tick, 16); }; setTimeout(tick, 16); // (a timer chain: each timer asked from the layer's own timer)`;
const FX = `filter('vignette', { amount: 0.7, softness: 0.45, round: 0, color: '#000000', drive: 0, react: 0 });`;
const layersFor = (tag) => [
  { id: `lc-world-${tag}`, name: 'World', code: WORLD, slot: 0, visible: true, opacity: 1, blend: 'normal' },
  { id: `lc-overlay-${tag}`, name: 'Overlay', code: OVERLAY, slot: 1, visible: true, opacity: 0.85, blend: 'screen', x: 5, y: -5 }, // (whole pixels: a 2D merge that resamples can round differently from one canvas to the next)
  { id: `lc-once-${tag}`, name: 'Once', code: ONCE, slot: 2, visible: true, opacity: 1, blend: 'normal' },
  { id: `lc-hud-${tag}`, name: 'HUD', code: HUD, slot: 3, visible: true, opacity: 1, blend: 'normal' },
  { id: `lc-fx-${tag}`, name: 'Vignette', code: FX, slot: 4, visible: true, opacity: 1, blend: 'normal' },
];
const SIZE = [320, 180];
try { c.customSize(SIZE[0], SIZE[1]); c.size('custom'); } catch { /* the frame size stays */ }
await D.newSketch('labcanvas56 start', 'import * as THREE from "three";', 2);
await sbx('window.__labAdapt.set({ level: 0, hold: true }); return 1');
const hasApi = (await sbx('return Boolean(window.__labCanvas)')) === true;
out.numbers.api = hasApi;

// ---------- one pass: build the fixture, collect every picture ----------
async function decodeFrame(buf, mime) {
  const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([buf], { type: mime }));
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('decode')); setTimeout(() => rej(new Error('decode timeout')), 8000); });
    const cv = new OffscreenCanvas(v.videoWidth, v.videoHeight); const g = cv.getContext('2d');
    const at = (t) => new Promise((res) => { v.onseeked = res; v.currentTime = t; setTimeout(res, 3000); }).then(() => { g.drawImage(v, 0, 0); return g.getImageData(0, 0, v.videoWidth, v.videoHeight).data; });
    const early = await at(0.15); const d = await at(0.6);
    return { w: v.videoWidth, h: v.videoHeight, d, litEarly: lit(early), dur: v.duration };
  } finally { URL.revokeObjectURL(v.src); }
}
const pngPixels = async (u8) => { const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, bmp.width, bmp.height).data; };
const urlPixels = async (url) => { if (!url) return null; const bmp = new Image(); bmp.src = url; await bmp.decode(); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, bmp.width, bmp.height).data; d.w = bmp.width; d.h = bmp.height; return d; };
const lit = (d) => { if (!d) return 0; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n += 1; return n / (d.length / 4); };
// a thumbnail's way (the page's small merged JPEG): the one at this size (the Lab asks for its own now and then)
async function smallShot(max) {
  const got = [];
  const on = (e) => { const m = e.data; if (m?.source === 'three-sandbox' && m.type === 'shot' && m.tag === 'thumb' && m.dataUrl) got.push(m.dataUrl); };
  addEventListener('message', on);
  toPage({ type: 'screenshot', tag: 'thumb', max });
  await wait(2500); removeEventListener('message', on);
  for (const u of got) { const im = new Image(); im.src = u; try { await im.decode(); } catch { continue; } if (Math.max(im.width, im.height) === max) return u; }
  return null;
}
async function pass(tag, keep) {
  const P = {};
  if (hasApi) await sbx(`window.__labCanvas.set({ keep: ${keep} }); return 1`);
  await D.restore({ sketch: `labcanvas56 ${tag}`, layers: layersFor(tag) }, { asNew: `labcanvas56 ${tag}`, wait: 3 });
  await until(async () => (await sbx('return window.__labPace.state().frameTick')) > 0, 20000);
  await wait(2500);
  // (filters merge what's under them again only when it changes: once more now that everything drew)
  await sbx('window.__labGpu.set({}); return 1'); await wait(1500);
  P.info = hasApi ? await sbx('return window.__labCanvas.info()') : null;
  P.merges = await sbx(`const h = (s) => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16); }; return ['world', 'overlay', 'once', 'fx'].map((k) => k + ':' + h(window.__labCanvas.merge(['lc-' + k + '-${tag}']))).join(' ')`);
  P.mix = await sbx(`return window.__seqLayers().filter((x) => /^lc-/.test(x.id)).map((x) => x.id.replace(/-${tag}$/, '') + ':' + Math.round(x.mix * 1000) / 1000 + ':' + x.blend).join(' ')`);
  P.shot = await D.shot();
  P.small = await smallShot(160);
  toPage({ type: 'screenshot', tag: 'cover' }); P.cover = (await fromPage((m) => m.type === 'shot' && m.tag === 'cover'))?.dataUrl || null;
  P.peek = await sbx('return window.__labAdapt.peek()');
  P.probe = await sbx('return window.__labGpu.probe(24)');
  P.pick = await sbx(`const o = []; for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) { const id = window.__labDirect.pick((i + 0.5) * innerWidth / 8, (j + 0.5) * innerHeight / 6); o.push(id ? id.replace(/-${tag}$/, '') : '-'); } return o.join(' ')`);
  P.pictures = await sbx(`return window.__labCanvas?.pictures ? window.__labCanvas.pictures().map((p) => p.replace(/-${tag}/g, '')) : null`);
  const box = frame().getBoundingClientRect();
  P.screen = (await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(box.left), y: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height), scale: 1 } }))?.data || null;
  // frozen: the picture holds and is read as it shows (nothing draws while frozen)
  c.freeze(true); await wait(900);
  P.frozen = await D.shot();
  P.frozenPick = await sbx(`const o = []; for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) { const id = window.__labDirect.pick((i + 0.5) * innerWidth / 8, (j + 0.5) * innerHeight / 6); o.push(id ? id.replace(/-${tag}$/, '') : '-'); } return o.join(' ')`);
  c.freeze(false); await wait(600);
  if (!skip.has('record')) {
    const got = fromPage((m) => m.type === 'recording', 15000);
    toPage({ type: 'record', cmd: 'start', fps: 30 });
    await wait(1500); toPage({ type: 'record', cmd: 'stop' });
    const m = await got;
    P.record = m?.buffer ? await decodeFrame(m.buffer, m.mime).catch((err) => ({ error: err.message })) : { error: 'no recording' };
  }
  if (!skip.has('export') && typeof LabExport !== 'undefined') {
    try { const r = await LabExport.render({ format: 'still', size: '320x180', at: 0.4 }); P.export = await pngPixels(await window.hub.fs.read(r.path, { encoding: 'buffer' })); } catch (err) { P.export = { error: String(err?.message || err).slice(0, 200) }; }
  }
  if (hasApi) P.after = await sbx('return window.__labCanvas.info()');
  return P;
}
// (window.LC56_ORDER = 'ba': the new way first)
let A; let B;
// (a first pass to warm up: the first fixture built after the Lab opens merges a blended layer a shade differently
// from every later one on this machine's software 2D canvas, whichever way its canvases go)
await pass('w', true);
if (window.LC56_ORDER === 'ba') { B = await pass('b', false); A = await pass('a', true); } else { A = await pass('a', true); B = await pass('b', false); }

// ---------- pictures: A (every canvas keeps its frame, as before) and B (the new way) must match ----------
const strKeys = ['shot', 'small', 'cover', 'peek', 'probe', 'pick', 'frozen', 'frozenPick'];
for (const k of strKeys) {
  const a = A[k]; const b = B[k];
  const ok = Boolean(a) && a === b;
  out.same[k] = ok;
  out.hashes[k] = [a ? hash(String(a)) : null, b ? hash(String(b)) : null];
  if (!ok) fail(`${k}: B differs from A (${a ? String(a).length : 'none'} / ${b ? String(b).length : 'none'} chars)`);
}
out.numbers.mix = { a: A.mix, b: B.mix, mergeA: A.merges, mergeB: B.merges, atA: (A.info?.canvases || []).map((x) => x.layer + '@' + x.at + ' ' + x.w + 'x' + x.h).join(' '), atB: (B.info?.canvases || []).map((x) => x.layer + '@' + x.at + ' ' + x.w + 'x' + x.h).join(' ') };
// the screen: the browser scales the preview's canvases to its box; at the box's very edge (its last row / column) the
// scaling reads past the picture's border, where a canvas that keeps its frame (a copy of exactly its size) and one that
// doesn't (its own buffer) may differ by a level. Everything inside the edge must be the same.
if (A.screen && B.screen) {
  const pa = await urlPixels(`data:image/png;base64,${A.screen}`); const pb = await urlPixels(`data:image/png;base64,${B.screen}`);
  const W = pa.w; const Hh = pa.h;
  if (pb.w !== W || pb.h !== Hh) fail('the two screen pictures have different sizes');
  let inner = 0; let edge = 0; let edgeMax = 0;
  for (let y = 0; y < Hh; y += 1) for (let x = 0; x < W; x += 1) { const i = (y * W + x) * 4; const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])); if (!d) continue; if (x === 0 || y === 0 || x === W - 1 || y === Hh - 1) { edge += 1; edgeMax = Math.max(edgeMax, d); } else inner += 1; }
  out.numbers.screen = { inner, edge, edgeMax };
  out.same.screen = !inner && edgeMax <= 2;
  if (!out.same.screen) fail(`the preview on screen differs (${inner} pixels inside, ${edge} on the edge, up to ${edgeMax})`);
} else fail('no screen picture');
if (A.pictures || B.pictures) {
  const ok = JSON.stringify(A.pictures) === JSON.stringify(B.pictures);
  out.same.pictures = ok; out.hashes.pictures = [hash(JSON.stringify(A.pictures)), hash(JSON.stringify(B.pictures))];
  if (!ok) fail(`layer pictures (re-run cross-fades) differ: ${(A.pictures || []).map((x, i) => (x === B.pictures?.[i] ? null : x.split(':')[0])).filter(Boolean).join(', ')}`);
}
// not blank: the merge shows the world, the "once" layer, the overlay
const peekPx = await urlPixels(B.peek);
out.numbers.peekLit = r2(lit(peekPx));
if (!(out.numbers.peekLit > 0.3)) fail(`the merged picture looks blank (${out.numbers.peekLit} lit)`);
out.numbers.pickB = B.pick;
if (!/world/.test(B.pick) || !/overlay/.test(B.pick) || !/once/.test(B.pick)) fail(`picking misses a layer: ${B.pick}`);
if (A.record && B.record) {
  if (A.record.error || B.record.error) fail(`recording: ${A.record.error || B.record.error}`);
  else {
    let s = 0; for (let i = 0; i < A.record.d.length; i += 1) s += Math.abs(A.record.d[i] - B.record.d[i]);
    const mad = s / A.record.d.length;
    out.numbers.record = { w: B.record.w, h: B.record.h, madAB: r2(mad), litB: r2(lit(B.record.d)), litEarly: [r2(A.record.litEarly), r2(B.record.litEarly)], sec: [r2(A.record.dur), r2(B.record.dur)] };
    out.same.record = mad < 2;
    if (!(mad < 2)) fail(`the recording's frame differs (mean abs diff ${r2(mad)})`);
    if (!(lit(B.record.d) > 0.3) || !(B.record.litEarly > 0.3)) fail('the recording looks blank');
  }
}
if (A.export && B.export) {
  if (A.export.error || B.export.error) fail(`export: ${A.export.error || B.export.error}`);
  else { const ok = A.export.length === B.export.length && A.export.every((v, i) => v === B.export[i]); out.same.export = ok; out.hashes.export = [hash(A.export), hash(B.export)]; if (!ok) fail('the export still differs'); out.numbers.exportLit = r2(lit(B.export)); }
}

// ---------- costs ----------
if (hasApi) {
  const fx = (i) => (i?.canvases || []).filter((x) => /^lc-/.test(x.layer));
  out.numbers.canvasesA = fx(A.info).map((x) => `${x.layer.replace(/^lc-|-a$/g, '')}:${x.keeps ? 'keeps' : 'fresh'}`).join(' ');
  out.numbers.canvasesB = fx(B.info).map((x) => `${x.layer.replace(/^lc-|-b$/g, '')}:${x.keeps ? 'keeps' : 'fresh'}`).join(' ');
  if (!fx(A.info).length || fx(A.info).some((x) => !x.keeps)) fail(`A: every canvas should keep its frame (${out.numbers.canvasesA})`);
  if (!fx(B.info).length || fx(B.info).some((x) => x.keeps)) fail(`B: a fixture canvas still keeps its frame (${out.numbers.canvasesB})`);
  out.numbers.readsB = B.after ? { reads: B.after.reads, asIs: B.after.readAsIs, drawnAgain: B.after.replays } : null;
  // timers asked from inside the layer's own timer: no stack read each (the HUD's chain runs ≈ 60 a second)
  const s0 = await sbx('return window.__labCanvas.info().stacks'); await wait(3000); const s1 = await sbx('return window.__labCanvas.info().stacks');
  out.numbers.timerStacksPerSec = r2((s1 - s0) / 3);
  if (out.numbers.timerStacksPerSec > 2) fail(`timers still read a stack trace each (${out.numbers.timerStacksPerSec} a second)`);
}
// a light game playing at 1920×1080, with every canvas keeping its frame (A) and not (B): the GPU process's CPU per frame
if (!skip.has('perf')) {
  const GAME = `${HEAD}
scene.background = new THREE.Color('#0d1320');
const boxes = []; for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 40, 0.6, 0.5) })); scene.add(m); boxes.push(m); }
renderer.setAnimationLoop((t) => { const s = t / 1000; boxes.forEach((m, i) => { const a = i * 0.157 + s; m.position.set(Math.cos(a) * (2 + (i % 5)), 0.3 + Math.abs(Math.sin(s * 2 + i)), Math.sin(a) * (2 + (i % 5))); }); renderer.render(scene, camera); });`;
  const HUD2 = `${HEAD}
const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 48), new THREE.MeshBasicMaterial({ color: '#ffd75e' })); ring.position.set(0, 1, 2); scene.add(ring);
renderer.setAnimationLoop((t) => { ring.rotation.z = t / 900; renderer.render(scene, camera); });`;
  try { c.customSize(1920, 1080); c.size('custom'); } catch { /* stays */ }
  // the GPU process's CPU time (ms): this app's main process (the hub's file reads run there) → its GPU process, /proc
  const stat = async (pid) => String(await window.hub.fs.read(`/proc/${pid}/stat`)).replace(/^.*\) /, '').split(' ');
  let gpuPid = null;
  try {
    const main = String(await window.hub.fs.read('/proc/self/stat')).split(' ')[0];
    for (const e of await window.hub.fs.list('/proc')) {
      if (!/^\d+$/.test(e.name)) continue;
      let cl; try { cl = String(await window.hub.fs.read(`/proc/${e.name}/cmdline`)); } catch { continue; }
      if (!/gpu-process/.test(cl)) continue;
      const pp = (await stat(e.name))[1]; // (its parent is this app, or a helper of this app's: the zygote)
      if (pp === main || (await stat(pp).catch(() => []))[1] === main) { gpuPid = e.name; break; }
    }
  } catch { /* not Linux: no number */ }
  const gpuMs = async () => { if (!gpuPid) return null; try { const f = await stat(gpuPid); return (Number(f[11]) + Number(f[12])) * 10; } catch { return null; } };
  out.numbers.perf = {};
  for (const [tag, keep] of [['keep', true], ['fresh', false], ['keep2', true], ['fresh2', false]]) {
    if (hasApi) await sbx(`window.__labCanvas.set({ keep: ${keep} }); return 1`);
    await D.restore({ sketch: `labcanvas56 game ${tag}`, layers: [{ id: `g-${tag}`, name: 'Game', code: GAME, slot: 0, visible: true, opacity: 1, blend: 'normal' }, { id: `h-${tag}`, name: 'Reticle', code: HUD2, slot: 1, visible: true, opacity: 1, blend: 'normal' }] }, { asNew: `labcanvas56 game ${tag}`, wait: 3 });
    await wait(3000);
    if (hasApi) await sbx('window.__labCanvas.reset(); return 1');
    const i0 = hasApi ? await sbx('return window.__labCanvas.info()') : null;
    const a = await sbx('return window.__labPace.state().frameTick'); const g0 = await gpuMs(); const t0 = performance.now();
    await wait(5000);
    const b = await sbx('return window.__labPace.state().frameTick'); const g1 = await gpuMs(); const sec = (performance.now() - t0) / 1000;
    const info = hasApi ? await sbx('return window.__labCanvas.info()') : null;
    const frames = Math.max(1, b - a);
    // (a canvas that keeps its frame is copied whole by the browser each frame it shows a new one: megapixels a frame)
    const copied = info ? info.canvases.filter((x) => x.keeps).reduce((n, x) => n + (x.w * x.h) / 1e6, 0) : null;
    out.numbers.perf[tag] = { fps: r2(frames / sec), copiedMPPerFrame: copied == null ? null : r2(copied), gpuMsPerFrame: g0 != null && g1 != null ? r2((g1 - g0) / frames) : null, kept: info ? info.kept : null, drawnAgain: info ? info.replays : null, batches: info && i0 ? r2((info.flushes - i0.flushes) / Math.max(1, info.frame - i0.frame)) : null, screenFrames: info && i0 ? info.frame - i0.frame : null };
  }
  const P = out.numbers.perf;
  if (hasApi && (P.fresh.kept || P.fresh2.kept)) fail(`the game's canvases keep their frame (${P.fresh.kept})`);
  if (hasApi && (P.fresh.drawnAgain || P.fresh2.drawnAgain)) fail(`frames drawn again while the game plays (${P.fresh.drawnAgain}, ${P.fresh2.drawnAgain}): nothing reads them`);
}
if (window.LC56_REPORT) { out.reportOnly = out.problems; out.problems = []; }
// the pictures, to look at (window.LC56_DUMP = a folder)
if (window.LC56_DUMP) {
  const bytes = (u) => Uint8Array.from(atob(String(u).replace(/^data:[^,]*,/, '')), (ch) => ch.charCodeAt(0));
  for (const [tag, P] of [['a', A], ['b', B]]) for (const k of ['shot', 'small', 'cover', 'frozen', 'screen']) if (P[k]) await window.hub.fs.write(`${window.LC56_DUMP}/${tag}-${k}.${k === 'small' || k === 'cover' ? 'jpg' : 'png'}`, bytes(P[k]));
}
for (const k of ['shot', 'small', 'cover', 'peek', 'frozen']) { delete A[k]; delete B[k]; }
await smoke({ shot: window.LC56_SHOT || `${window.SMOKE_TMP || '/tmp'}/labcanvas56.png` });
return JSON.stringify(out, null, 1);
