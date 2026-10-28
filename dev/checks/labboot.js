// (round 37, labboot) The Lab opening and switching scenes: fast and without a hitch.
//   open      a real press on the Lab's rail button → the last scene on screen ('shown': the preview shows the
//             scene's picture: at once with a warmed page) and → the Lab's own run drawn ('drawn': stack-drawn)
//   switches  the recent-scenes path (openSketch), each scene first visited then visited again, and a new scene from a
//             template: call → stack-drawn; the preview's longest task meanwhile (Long Tasks API inside the page); the
//             darkest frame seen while it swaps (every scene here has a bright background: a frame darker than
//             DARK is a black flash)
//   hub       the window's long tasks while the Lab opens and while it switches
// Before / after: localStorage 'labboot.warm' = '0' (an --eval) turns the warm page off (the rest of this stream's
// changes can't be turned off: compare with the starting commit for those).
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/labboot.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(25); } return false; };
// four scenes, each with its own heavy shader (a different program per scene) on a bright background
const scene = (i, hue) => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color().setHSL(${hue}, 0.6, 0.55);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 4, 2); scene.add(sun);
const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: \`uniform float t; varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898 + ${i}.0, 78.233))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  void main() { float v = 0.0; float a = 0.5; vec2 p = vUv * ${3 + i}.0;
    for (int k = 0; k < ${24 + i * 4}; k++) { v += a * n(p + t * 0.1 + float(k) * ${0.37 + i * 0.01}); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.93; }
    gl_FragColor = vec4(vec3(0.4 + 0.5 * v, 0.5 + 0.3 * v, 0.7), 1.0); }\` });
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.28, 160, 24), mat); scene.add(knot);
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1, sheen: ${0.2 + i * 0.1} }));
ball.position.set(1.6, 0.6, 0); scene.add(ball);
renderer.setAnimationLoop((now) => { mat.uniforms.t.value = now / 1000; knot.rotation.y = now / 2000; renderer.render(scene, camera); });
`;
const IDS = ['lbA', 'lbB', 'lbC', 'lbD'];
if (localStorage.getItem('labboot.step') !== '2') {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
  await window.hub.kvSet('three-sketches', IDS.map((id, i) => ({ id, name: `labboot ${i + 1}`, code: scene(i, 0.08 + i * 0.22), updatedAt: Date.now() - i * 1000 })));
  store.set('three.current', 'lbA');
  // the Lab used once on this start (as the owner does every day): the next start knows its size and warms its page
  await window.Lazy?.load('lab');
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 20000);
  let drew = false; const on = (e) => { if (e.data?.source === 'three-sandbox' && e.data.type === 'stack-drawn') drew = true; };
  addEventListener('message', on);
  await until(() => drew, 30000);
  await wait(2500); // its size noted (1.5 s after the last resize)
  activate(H.agents()[0].id);
  localStorage.setItem('labboot.step', '2');
  return `[LABBOOT] scenes written, the Lab used once (${drew ? 'drawn' : 'not drawn'})`;
}
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(25); } return false; };
localStorage.removeItem('labboot.step');
const out = { warm: localStorage.getItem('labboot.warm') !== '0' };
await until(() => performance.getEntriesByName('hearth:ready').length);
await window.Lazy?.load('lab');
await until(() => !window.Lazy || Lazy.state().every((g) => g.tier === 'use' || (g.state !== 'stub' && g.state !== 'loading')), 15000);
// the warm page (if any) gets its idle moment and draws once
if (out.warm) await until(() => window.LabBoot?.state().drawn || /off|not used|no /.test(window.LabBoot?.state().skipped || ''), 25000);
await wait(800);
out.boot = window.LabBoot?.state ? (({ warmed, skipped, times, drawn }) => ({ warmed, skipped, drawn, times }))(window.LabBoot.state()) : null;
// ---------- the open ----------
const t = {}; let t0 = 0;
const at = (k) => { if (t[k] == null) t[k] = Math.round(performance.now() - t0); };
const log = [];
addEventListener('message', (e) => {
  const d = e.data; if (d?.source !== 'three-sandbox' || !t0) return;
  if (d.type === 'ready') at('ready');
  if (d.type === 'stack-drawn') at('drawn');
  if (log.length < 30) log.push(`${Math.round(performance.now() - t0)} ${d.type}`);
});
const longs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (t0 && e.startTime >= t0) longs.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch { /* no API */ }
// 'shown': the preview frame on screen with a page that has drawn this scene (warm: at once; else its first frame)
let warmShown = false;
const btn = RAIL.button('tool:three'); await wait(50); // (round 74) the rail's way to the Lab today (dev/checks/rail-lib.js)
const r = btn.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);
t0 = performance.now();
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } });
await wait(Math.max(0, 100 - (performance.now() - t0)));
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } });
await until(() => { const f = document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame'); if (f && f.checkVisibility?.({ visibilityProperty: true })) { if (window.LabBoot?.state().taken && out.boot?.drawn) warmShown = true; at('frameShown'); return true; } return false; }, 20000);
await until(() => t.drawn != null, 30000);
t.shown = warmShown ? t.frameShown : t.drawn; // a cold page shows the scene with its first frame
out.open = { ...t, hubLongTasks: longs.length, hubLongMs: longs.reduce((a, b) => a + b, 0), hubLongest: Math.max(0, ...longs), taken: window.LabBoot?.state().taken || 0 };
if (localStorage.getItem('labboot.log') === '1') out.log = log;
await wait(1500);
const d = ThreeLab.director;
const sbx = async (code) => { for (let i = 0; i < 5; i++) { const res = await d.evalInSketch(code); if (res?.ok) return res.value; await wait(500); } return null; };
// inside the preview: long tasks, and the darkest frame of the picture on screen (the swap cover over the layers'
// canvases, read 8 × 8 each frame) while a switch runs
const PROBE = `if (!window.__lb) {
  const lb = window.__lb = { on: false, longs: [], min: 1, frames: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (lb.on) lb.longs.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch {}
  const c = document.createElement('canvas'); c.width = 8; c.height = 8; const g = c.getContext('2d', { willReadFrequently: true });
  // the page wraps requestAnimationFrame and timers for its layers (park, pace, silenced on a swap): this samples from
  // scheduler.postTask every 6 ms, once per new frame (document.timeline's time moves once a frame)
  let lastT = -1;
  const raf = (fn) => scheduler.postTask(fn, { delay: 6 });
  const tick = () => {
    const ft = document.timeline.currentTime;
    if (lb.on && ft !== lastT) {
      lastT = ft;
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, 8, 8);
      const cover = [...document.querySelectorAll('.lab-swap')].find((x) => x.isConnected);
      for (const cv of document.querySelectorAll('canvas')) {
        if (cv === c || cv === cover || !cv.width || !cv.isConnected) continue;
        const cs = getComputedStyle(cv); const box = cv.closest('.lab-layer') || cv;
        if (cs.display === 'none' || cs.visibility === 'hidden' || getComputedStyle(box).display === 'none') continue;
        // (round 57, sweep57) since labcanvas56 a layer canvas keeps no frame: read it as it shows (glFresh), like the page's readers
        g.globalAlpha = Math.min(1, Number(getComputedStyle(box).opacity)); try { g.drawImage(window.__labCanvas?.fresh ? window.__labCanvas.fresh(cv) : cv, 0, 0, 8, 8); } catch {}
      }
      if (cover) { g.globalAlpha = Math.min(1, Number(getComputedStyle(cover).opacity)); try { g.drawImage(cover, 0, 0, 8, 8); } catch {} }
      const px = g.getImageData(0, 0, 8, 8).data; let s = 0; for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      const lum = s / 64 / 255; lb.frames += 1; if (lum < lb.min) lb.min = lum;
    }
    raf(tick);
  };
  raf(tick);
}
window.__lb.on = true; window.__lb.longs = []; window.__lb.min = 1; window.__lb.frames = 0; return 1`;
const STOP = 'window.__lb.on = false; return { longs: window.__lb.longs, min: Math.round(window.__lb.min * 1000) / 1000, frames: window.__lb.frames }';
const DARK = 0.12;
async function measure(kind, go) {
  await sbx(PROBE);
  let drawn = null; const s0 = performance.now();
  const on = (e) => { if (e.data?.source === 'three-sandbox' && e.data.type === 'stack-drawn' && drawn == null) drawn = Math.round(performance.now() - s0); };
  const hl = []; let ob = null;
  try { ob = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.startTime >= s0) hl.push(Math.round(e.duration)); }); ob.observe({ type: 'longtask' }); } catch { /* no API */ }
  addEventListener('message', on);
  await go();
  await until(() => drawn != null, 20000);
  await wait(700); // the cross-fade
  removeEventListener('message', on); ob?.disconnect();
  const p = (await sbx(STOP)) || {};
  return { kind, ms: drawn, pageLongest: Math.max(0, ...(p.longs || [])), pageLongMs: (p.longs || []).reduce((a, b) => a + b, 0), darkest: p.min, frames: p.frames, black: p.min != null && p.min < DARK, hubLongest: Math.max(0, ...hl) };
}
const open = (id) => () => ThreeLab.scenes.open(id);
// the last scene has its own frame size (9:16, 1 pixel per pixel: another page before round 37): switching to it and
// back changes the preview's pixel ratio
ThreeLab.scenes.setFrame?.('lbD', '9:16');
const reloads0 = ThreeLab.live?.counts().reloads.preview || 0;
const sw = [];
for (const id of ['lbB', 'lbC', 'lbD']) sw.push(await measure(`first ${id}`, open(id))); // new programs on each
for (const id of ['lbA', 'lbB', 'lbC', 'lbD']) sw.push(await measure(`again ${id}`, open(id))); // programs seen before
out.reloadsInSwitches = (ThreeLab.live?.counts().reloads.preview || 0) - reloads0; // whole new pages (fit ⇄ 9:16 twice)
const tpl = ThreeData.TEMPLATES.find((x) => /PBR/.test(x.name)) || ThreeData.TEMPLATES[1];
sw.push(await measure('template', () => d.newSketch('labboot template', tpl.code, 0.1)));
const med = (a) => { const s = a.filter((v) => v != null).sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
out.switches = sw;
out.summary = {
  open: out.open.shown, openDrawn: out.open.drawn, firstSwitchMed: med(sw.filter((s) => /^first/.test(s.kind)).map((s) => s.ms)), againSwitchMed: med(sw.filter((s) => /^again/.test(s.kind)).map((s) => s.ms)),
  templateMs: sw.at(-1).ms, frameSwitchMed: med(sw.filter((s) => /lbD|lbA/.test(s.kind) && !/first lbB|first lbC/.test(s.kind)).map((s) => s.ms)), reloads: out.reloadsInSwitches, pageLongest: Math.max(...sw.map((s) => s.pageLongest)), hubLongest: Math.max(out.open.hubLongest, ...sw.map((s) => s.hubLongest)), blackFrames: sw.filter((s) => s.black).length, darkest: Math.min(...sw.map((s) => s.darkest ?? 1)),
};
// the verdict: the scene showed, every switch drew, none went black; with the warm page: it was taken and showed at once
const fails = [];
if (out.open.drawn == null) fails.push('the Lab never drew its scene');
if (sw.some((s) => s.ms == null)) fails.push('a switch never drew');
if (out.summary.blackFrames) fails.push(`${out.summary.blackFrames} switch(es) went black (darkest ${out.summary.darkest})`);
if (sw.some((s) => !s.frames)) fails.push('the frame probe saw no frames');
if (out.warm && window.LabBoot && out.reloadsInSwitches > 0) fails.push(`${out.reloadsInSwitches} whole page reload(s) switching fit ⇄ 9:16`);
if (out.warm && out.boot?.warmed && !out.open.taken) fails.push('the warm page was not taken');
if (out.warm && out.boot?.drawn && out.open.taken && out.open.shown > 1500) fails.push(`warm open took ${out.open.shown} ms`);
out.fails = fails;
// let the next start warm from a clean slate
await window.hub.kvSet('three-sketches', []);
return `[LABBOOT]${JSON.stringify(out)}${fails.length ? `\nFAIL: ${fails.join('; ')}` : '\nPASS'}`;
