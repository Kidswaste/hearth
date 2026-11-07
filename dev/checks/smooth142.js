// (round 142, smooth142) Smooth-first playback with a "Force high quality" switch (docs/upgrades/smooth142.md), ONE check
// on a deliberately heavy fixture scene (the check's own temp data, smoke.js; never an owner's scene):
//   Backdrop   a full-frame shader at 2× pixels (pixel-bound)
//   Particles  the heavy layer: an InstancedMesh (a Count slider), 2× pixels, antialias, 3 spot lights casting shadows
//   Edge       a white wedge on a black square in the top-left corner, antialiased (the still's antialias probe)
// Steps:
//   measure   the scene plays on its own timeline, Force high quality and Smooth interleaved (high, smooth, high,
//             smooth), each measured for 8 s inside the preview (the hitch map's frame gaps: p50 / p95 / p99, frames
//             dropped against the preview's 60 fps budget): Smooth lowers the quality and its frames are steadier
//             (p95 and dropped frames), judged relatively and load-aware (dev/loadwait.js: a miss while the box waited
//             for a CPU is "can't tell", not a failure)
//   high      Force high quality keeps the full pixel ratio (the scene's 2×), antialias and the shadow maps' own size
//   render    with Smooth at its lightest, a rendered still is full size (480×270) with antialiased edges
//   recover   the load goes (a long budget: __labAdapt's target) → Smooth climbs back one step at a time to full quality
//   ui        while it plays: the playheads placed every other frame, the timeline drawn ≤ 5× a second, the stats line
//             ≤ 1× a second (and the page sends it ≤ 1× a second), the Layers panel never rebuilt; shaders pre-compiled
//             at play start (the page's warm count)
//   remember  the choice is kept per scene (sketch.speed.q) and as the default (three.quality) for scenes without one;
//             the chip and its menu say Smooth (auto) · Balanced · Force high quality
// In the baseline app (no ThreeLab.quality: the code before this round) only "measure" runs, with Quality: full
// against Quality: auto, for the before / after table.
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/checks/smooth142.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { steps: [], measure: {}, cantTell: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 400000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };

const BACKDROP = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: 'varying vec2 v; void main() { v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform float t; varying vec2 v; void main() { vec3 c = vec3(0.0); vec2 p = v * 6.0; for (int i = 0; i < 4; i++) { p = vec2(sin(p.y + t), cos(p.x - t)) * 1.3 + p * 0.2; c += 0.03 * vec3(0.4 + 0.4 * sin(p.x), 0.3, 0.6 + 0.3 * cos(p.y)); } gl_FragColor = vec4(c * 0.6, 1.0); }' });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
renderer.setAnimationLoop((now) => { mat.uniforms.t.value = now / 1000; renderer.render(scene, camera); });`;
const PARTICLES = `import * as THREE from 'three';
const P = tweak({ count: { value: 120000, min: 1000, max: 600000, step: 1000, label: 'Count' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 7;
scene.add(new THREE.HemisphereLight('#ffffff', '#223344', 2.2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.8), new THREE.MeshLambertMaterial({ color: '#333' })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2; floor.receiveShadow = true; scene.add(floor);
const cubes = []; for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: '#f6a' })); c.position.set(i * 0.8 - 0.8, -1.9, 0); c.castShadow = true; scene.add(c); cubes.push(c); }
for (let i = 0; i < 3; i++) { const l = new THREE.SpotLight('#ffffff', 30, 20, 0.6); l.position.set(i * 2 - 2, 3, 2); l.target.position.set(0, -2, 0); l.castShadow = true; l.shadow.mapSize.set(512, 512); scene.add(l, l.target); }
const geo = new THREE.IcosahedronGeometry(0.035, 0); const mat = new THREE.MeshStandardMaterial({ color: '#7ab8ff', roughness: 0.4, name: 'spark' });
let mesh = null; let made = -1;
function build(n) {
  if (mesh) { scene.remove(mesh); mesh.dispose(); }
  const copies = Math.max(1, Math.round(n / 20)); mesh = new THREE.InstancedMesh(geo, mat, copies);
  const m = new THREE.Matrix4(); let s = 7;
  for (let i = 0; i < copies; i++) { s = (s * 16807) % 2147483647; const a = s / 2147483647; s = (s * 16807) % 2147483647; const b = s / 2147483647; s = (s * 16807) % 2147483647; const c = s / 2147483647; m.setPosition((a - 0.5) * 9, (b - 0.5) * 5, (c - 0.5) * 3); mesh.setMatrixAt(i, m); }
  scene.add(mesh); made = n;
}
renderer.setAnimationLoop((now) => { if (made !== P.count) build(P.count); for (const c of cubes) c.rotation.y = now / 900; mesh.rotation.y = Math.sin(now / 2000) * 0.2; renderer.render(scene, camera); });`;
const EDGE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
const sq = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: '#000000' })); sq.position.set(-0.7, 0.7, 0); scene.add(sq);
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.95, 0.45, 0.1, -0.45, 0.62, 0.1, -0.9, 0.95, 0.1], 3));
scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff' })));
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;

let c = null; let D = null; let Q = null;
const ev = async (code, tries = 6) => { for (let i = 0; i < tries; i++) { const r = await D.evalInSketch(code); if (r?.ok) return r.value; await wait(500); } return null; };
const evj = async (code) => { const v = await ev(`return JSON.stringify(${code})`); try { return v ? JSON.parse(v) : null; } catch { return null; } };
const smoothState = () => evj('window.__labSmooth ? window.__labSmooth.state() : null');
const BUDGET = 1000 / 60; // the preview's frame budget here (Auto fps: 60 at most)
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10; };
function frameStats(gaps) {
  const g = gaps.filter((x) => x > 0 && x < 3000);
  let dropped = 0; for (const x of g) dropped += Math.max(0, Math.round(x / BUDGET) - 1);
  const mean = g.reduce((a, x) => a + x, 0) / Math.max(1, g.length);
  return { frames: g.length, fps: Math.round((1000 / Math.max(1, mean)) * 10) / 10, p50: pct(g, 0.5), p95: pct(g, 0.95), p99: pct(g, 0.99), worst: g.length ? Math.round(Math.max(...g)) : null, dropped, droppedPerSec: Math.round((dropped / Math.max(0.001, g.reduce((a, x) => a + x, 0) / 1000)) * 10) / 10 };
}
// the Lab window's own work while it plays: DOM mutations, long tasks, its frames
function windowWatch() {
  const W = { muts: 0, long: 0, longMs: 0, raf: 0, statsMsgs: 0, on: true };
  const mo = new MutationObserver((l) => { W.muts += l.length; }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  let po = null; try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { W.long += 1; W.longMs += e.duration; } }); po.observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
  const onMsg = (e) => { if (e.data?.type === 'stats' && e.data?.source === 'three-sandbox') W.statsMsgs += 1; };
  addEventListener('message', onMsg);
  const tick = () => { if (!W.on) return; W.raf += 1; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  return () => { W.on = false; mo.disconnect(); po?.disconnect(); removeEventListener('message', onMsg); return { muts: W.muts, long: W.long, longMs: Math.round(W.longMs), raf: W.raf, statsMsgs: W.statsMsgs }; };
}
const NEW = () => Boolean(ThreeLab.quality);
const setMode = async (m) => { if (NEW()) Q.set(m, { quiet: true }); else c.adapt(m !== 'high'); await wait(400); };
async function measureOnce(mode, settle, ms) {
  await setMode(mode);
  c.seek(1); await wait(150); c.play(true);
  await wait(settle);
  const snap = await smoke({ loadwait: 'snap' });
  window.LabPlay?.reset?.();
  const stop = windowWatch();
  const t0 = await ev('return window.__labHitch.start(20000)');
  await wait(ms);
  const raw = await ev('return window.__labHitch.stop()');
  const win = stop();
  const lw = await smoke({ loadwait: 1, since: snap.snap });
  const counts = window.LabPlay?.counts?.() || null;
  const st = await smoothState();
  c.play(false); await wait(300);
  let hx = null; try { hx = JSON.parse(raw); } catch { /* none */ }
  const gaps = hx?.gap || [];
  const compilesInPlay = (hx?.compiles || []).reduce((a, x) => a + x, 0);
  const uploadsInPlay = (hx?.uploads || []).reduce((a, x) => a + x, 0);
  return { mode, t0: t0 != null, ...frameStats(gaps), work50: pct((hx?.work || []).filter((x) => x > 0), 0.5), compilesInPlay, uploadsInPlay, window: win, counts, level: st?.level ?? null, quality: st?.quality ?? null, tier: st?.tier ?? null, half: st?.half ?? null, why: st?.why ?? null, load: lw };
}
const busyOf = (w) => w?.judge === 'load' || ((w?.loadavg?.[0] || 0) / Math.max(1, w?.cpus || 1)) >= 0.75 || ((w?.waited?.cpuWait || 0) > (w?.waited?.wallMs || 1) * 0.15);

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director && ThreeLab.speed, 60000);
  c = await ThreeLab.cmd(); D = ThreeLab.director; Q = ThreeLab.quality;
  out.baseline = !NEW();
  await wait(600);
  await D.newSketch('Smooth fixture (smooth142)', BACKDROP, 2);
  const fixId = ThreeLab.scenes.currentId();
  try { c.customSize(480, 270); c.size('custom'); } catch { /* fit */ }
  try { await D.updateLayer(D.layers().layers[0].name, { name: 'Backdrop', code: BACKDROP }, 0.3); } catch (err) { step('fixture: backdrop', false, err.message); }
  for (const [name, code] of [['Particles', PARTICLES], ['Edge', EDGE]]) { try { await D.addLayer({ name, code }, 1); } catch (err) { step(`fixture: ${name}`, false, err.message); } }
  c.code?.(false);
  await wait(3000);
  if (ThreeLab.scenes.currentId() !== fixId) { ThreeLab.scenes.open(fixId); await wait(2500); }
  try { c.customSize(480, 270); c.size('custom'); } catch { /* fit */ }
  await wait(2500);
  // the Particles layer selected (the Layers panel's own row), so the stats line and the panels are as when you work
  out.measure.layers = D.layers().layers.map((x) => x.name);

  // ---------- measure ----------
  const runs = [];
  await safe('measure', async () => {
    const lo = NEW() ? 'smooth' : 'auto';
    for (const m of ['high', lo, 'high', lo]) runs.push(await measureOnce(m === 'auto' ? 'smooth' : m, m === 'high' ? 2500 : 12000, 8000));
    const H = runs.filter((r) => r.mode === 'high'); const S = runs.filter((r) => r.mode !== 'high');
    const med = (a, k) => { const v = a.map((r) => r[k]).filter((x) => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
    const sum = (a) => ({ fps: med(a, 'fps'), p50: med(a, 'p50'), p95: med(a, 'p95'), p99: med(a, 'p99'), droppedPerSec: med(a, 'droppedPerSec'), level: med(a, 'level'), quality: med(a, 'quality') });
    out.measure.runs = runs.map((r) => ({ ...r, load: r.load && { judge: r.load.judge, loadavg: r.load.loadavg?.map((x) => Math.round(x * 100) / 100), waited: r.load.waited } }));
    out.measure.high = sum(H); out.measure.smooth = sum(S);
    if (!NEW()) { step('baseline measured (Quality: full against Quality: auto)', runs.every((r) => r.frames > 0), { high: out.measure.high, auto: out.measure.smooth }); return; }
    const lowered = S.every((r) => (r.level || 0) > 0 && r.quality < 1);
    step('measure: Smooth lowers the preview\'s quality on the heavy scene (level > 0, resolution under 100 %)', lowered, S.map((r) => ({ level: r.level, quality: r.quality, why: r.why })));
    const hs = out.measure.high; const ss = out.measure.smooth;
    const better = ss.p95 != null && hs.p95 != null && ss.p95 <= hs.p95 * 0.9 && ss.droppedPerSec <= hs.droppedPerSec * 0.9;
    const busy = runs.some((r) => busyOf(r.load));
    out.measure.ratio = { p95: hs.p95 ? Math.round((ss.p95 / hs.p95) * 100) / 100 : null, p99: hs.p99 ? Math.round((ss.p99 / hs.p99) * 100) / 100 : null, dropped: hs.droppedPerSec ? Math.round((ss.droppedPerSec / hs.droppedPerSec) * 100) / 100 : null, busy };
    if (better) step('measure: Smooth\'s frames are steadier than Force high\'s (p95 and dropped frames, relative)', true, out.measure.ratio);
    else if (busy) { out.cantTell.push({ measure: out.measure.ratio }); step('measure: Smooth\'s frames steadier (or can\'t tell on a busy box)', ss.frames !== 0, out.measure.ratio); } else step('measure: Smooth\'s frames are steadier than Force high\'s (p95 and dropped frames, relative)', false, { ratio: out.measure.ratio, high: hs, smooth: ss });
    // ---------- ui (from the Smooth runs' counts) ----------
    const r = S[S.length - 1]; const k = r.counts || {}; const secs = 8;
    out.measure.ui = { counts: k, window: r.window, high: H[H.length - 1].counts };
    step('ui: while it plays the playheads are placed every other frame, the timeline drawn ≤ 5×/s, the stats line ≤ 1×/s, the Layers panel not rebuilt', (k.tick || 0) > 4 && (k.playhead || 0) <= (k.tick || 0) * 0.6 + 2 && (k.timeline || 0) <= secs * 5 + 3 && (k.stats || 0) <= secs + 2 && !(k.layers > 0), k);
    step('ui: the preview sends its stats once a second while it plays (was twice)', r.window.statsMsgs <= secs + 2 && r.window.statsMsgs >= 2, r.window);
  }, 900000);
  if (!NEW()) throw new Error('baseline: measure only');

  // ---------- warm (pre-compile at play start) ----------
  await safe('warm', async () => {
    const a = await smoothState();
    c.seek(0); await wait(100); c.play(true); await wait(1500); c.play(false);
    const b = await smoothState();
    step('warm: play start pre-compiles the scenes\' shaders and uploads their textures (the page\'s warm pass ran)', b?.warm?.n > (a?.warm?.n || 0) && b.warm.scenes > (a?.warm?.scenes || 0), { before: a?.warm, after: b?.warm, inPlay: runs.map((x) => x.compilesInPlay) });
  });

  // ---------- render (Smooth at its lightest) ----------
  await safe('render', async () => {
    await setMode('smooth');
    await ev('window.__labAdapt.set({ level: 9, hold: true }); return 1');
    await wait(800);
    const st = await smoothState();
    const r = await LabExport.render({ format: 'still', size: '480x270', at: 0.5, quiet: true });
    const u8 = await window.hub.fs.read(r.path, { encoding: 'buffer' });
    const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
    const x0 = Math.round(bmp.width * 0.06); const y0 = Math.round(bmp.height * 0.06); const w = Math.round(bmp.width * 0.18); const h = Math.round(bmp.height * 0.18);
    const d = g.getImageData(x0, y0, w, h).data;
    let mid = 0; let white = 0; const levels = new Set();
    for (let i = 0; i < d.length; i += 4) { const l = Math.round((d[i] + d[i + 1] + d[i + 2]) / 3); levels.add(l >> 3); if (l > 235) white += 1; else if (l > 25) mid += 1; }
    out.measure.render = { w: bmp.width, h: bmp.height, mid, white, levels: levels.size, previewLevel: st?.level, previewQuality: st?.quality };
    step('render: with Smooth at its lightest, a rendered still is full size (480×270) with antialiased edges', st?.level >= 5 && st.quality < 1 && bmp.width === 480 && bmp.height === 270 && white > 30 && mid >= 8 && levels.size >= 4, out.measure.render);
  });

  // ---------- recover ----------
  await safe('recover', async () => {
    await ev('window.__labAdapt.set({ level: 5, hold: false, target: 5000 }); return 1'); // (the load goes: frames far inside a 5 s budget)
    c.play(true);
    const seen = [];
    const t0 = Date.now();
    await until(async () => { const s = await smoothState(); if (s) seen.push(s.level); return s && s.level === 0 && s.quality === 1; }, 150000, 700);
    c.play(false);
    const end = await smoothState();
    const ups = (end?.log || []).filter((x) => x.what === 'up');
    const mono = seen.every((v, i) => !i || v <= seen[i - 1]);
    out.measure.recover = { seconds: Math.round((Date.now() - t0) / 1000), levels: [...new Set(seen)], ups: ups.map((x) => x.level) };
    step('recover: the load gone, Smooth climbs back to full quality one step at a time (never down again)', end?.level === 0 && end.quality === 1 && mono && ups.length >= 2, out.measure.recover);
    await ev('window.__labAdapt.set({ level: 0, hold: false, target: 0 }); return 1');
  }, 240000);

  // ---------- high ----------
  await safe('high', async () => {
    Q.set('high', { quiet: true });
    await wait(1200);
    c.play(true);
    const st = await until(async () => { const s = await smoothState(); return s && s.mode === 'high' && s.renderers?.length >= 3 && s.renderers.every((x) => x.q === 1) ? s : null; }, 60000, 600);
    await wait(2500);
    const s2 = await smoothState();
    c.play(false);
    const R = (s2?.renderers || []).find((x) => x.shadows?.length) || null;
    out.measure.forced = { level: s2?.level, quality: s2?.quality, on: s2?.on, renderers: s2?.renderers };
    step('high: Force high quality keeps the full pixel ratio (the scene\'s 2×), antialias and the shadow maps\' own size, while it plays', st && s2 && s2.on === false && s2.level === 0 && s2.quality === 1 && s2.renderers.every((x) => x.q === 1 && (x.base == null || Math.abs(x.pr - x.base) < 1e-3)) && R && R.aa === true && R.pr >= 2 && R.shadows.length === 3 && R.shadows.every((x) => x === 512), out.measure.forced);
    const chip = Q.chip();
    step('high: the chip says "Quality: high"', chip?.textContent === 'Quality: high', chip?.textContent);
  });

  // ---------- remember ----------
  await safe('remember', async () => {
    Q.menu(200, 200); await wait(300);
    const labels = [...document.querySelectorAll('#menu button')].map((b) => b.textContent);
    if (typeof hideMenu === 'function') hideMenu(); await wait(200);
    step('remember: the chip\'s menu offers Smooth (auto) · Balanced · Force high quality', ['Smooth (auto)', 'Balanced', 'Force high quality'].every((t) => labels.some((x) => x.includes(t))), labels);
    const sk1 = ThreeLab.scenes.get(fixId);
    const kept1 = sk1?.speed?.q === 'high' && store.get('three.quality') === 'high' && Q.get() === 'high';
    await D.newSketch('Second scene (smooth142)', BACKDROP, 1);
    const id2 = ThreeLab.scenes.currentId();
    await wait(1500);
    const def = Q.get();
    Q.set('balanced', { quiet: true });
    const kept2 = ThreeLab.scenes.get(id2)?.speed?.q === 'balanced' && store.get('three.quality') === 'balanced';
    ThreeLab.scenes.open(fixId); await wait(2500);
    const back = Q.get();
    const pg = await smoothState();
    step('remember: kept per scene (sketch.speed.q) and as the default: a new scene starts with the last pick, each scene keeps its own', kept1 && def === 'high' && kept2 && back === 'high' && pg?.mode === 'high', { kept1, def, kept2, back, page: pg?.mode });
    Q.set('smooth', { quiet: true });
    const sp = ThreeLab.speed.get();
    step('remember: the quality choice is not a ⚡ speed fix (the speed settings read as before)', JSON.stringify(sp) === JSON.stringify({ px1: false, noAA: false, sh: null, fxHalf: false }) && ThreeLab.scenes.get(fixId)?.speed?.q === 'smooth', { speed: sp, own: ThreeLab.scenes.get(fixId)?.speed });
  });
} catch (err) { if (!/baseline: measure only/.test(String(err?.message))) step('ran', false, { error: String(err?.stack || err).slice(0, 800) }); }
try { c?.play(false); } catch { /* fine */ }
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.ok = out.failed.length === 0;
return JSON.stringify(out, null, 1);
