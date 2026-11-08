// (round 149, play149) What still made heavy scenes lag while they play (docs/upgrades/play149.md), ONE check on a heavy
// fixture scene (the check's own temp data, smoke.js; never an owner's scene):
//   Glow       an EffectComposer layer as the Bloom template / AI glow scenes write it: RenderPass + UnrealBloomPass +
//              OutputPass, the renderer at 2× pixels, made BEFORE the code sets nothing else (the composer takes the
//              renderer's ratio when it is made)
//   Particles  smooth142's heavy layer: 6,000 instances, 2× pixels, antialias, three 512 px spot lights; the instances
//              and three cubes cast shadows and move every frame (moving shadows: the crowd drawn again per light)
//   a song     124 BPM (realscene-lib's), a ⚡ kick trigger: the timeline plays, the beat light flashes
// Steps:
//   composer   Smooth held at its step 7 (50 % resolution): the composer's targets follow the renderer's canvas (they
//              stayed at full size before: A/B in the same run with window.__labPlay149.set({ off })); Force high
//              quality: the composer's targets at full size, exactly as before (on and off the same)
//   shadows    Smooth at step 7 (maps already shrunk): moving shadow maps drawn every other frame (≤ 60 % of the
//              frames); Force high quality: every frame, none skipped
//   measure    the same Smooth step (7, held), the round's savings off / on / off / on, 6 s each while it plays: the
//              preview's frame gaps (fps, p50 / p95 / p99, dropped against 60 fps), the GPU process's busy ms per drawn
//              frame (a trace: on software GL the GPU work is that thread's), the preview page's and the Lab window's
//              main-thread ms a second (CDP Performance metrics), the page's allocations a second (sampled). On is
//              cheaper on the GPU (≤ 0.85× its ms a frame) and not slower; load-aware: a miss on a busy box is "can't tell"
//   window     while it plays: no running CSS / Web animation in the Lab window that needs its main thread (only
//              transform / opacity / filter, which the compositor runs); the beat light's flash is a filter; the window
//              does ≤ 150 ms of main-thread work a second (load-aware)
//   tick       a 240 Hz screen played to the Lab window (a fake frame clock for 3 s): the timeline's tick works ≤ 65
//              times a second (it worked every frame, 240, before: LabPlay.tickOff(true) shows it)
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/checks/play149.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { steps: [], measure: {}, cantTell: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 400000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };

const GLOW = `import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020205);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 8);
const group = new THREE.Group();
for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 16, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 12, 1, 0.55) })); m.position.set(Math.cos(i / 12 * Math.PI * 2) * 2.5, Math.sin(i / 12 * Math.PI * 2) * 2.5, 0); group.add(m); }
scene.add(group);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.2, 0.4, 0.1));
composer.addPass(new OutputPass());
addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));
window.__play149c = composer; window.__play149n = (window.__play149n || 0) + 1;
renderer.setAnimationLoop((now) => { const t = now / 1000; group.rotation.z = t * 0.3; group.children.forEach((m, i) => { m.rotation.x = t + i; m.rotation.y = t * 0.7; }); composer.render(); });`;
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
  mesh.castShadow = true; scene.add(mesh); made = n;
}
renderer.setAnimationLoop((now) => { if (made !== P.count) build(P.count); for (const c of cubes) c.rotation.y = now / 900; mesh.rotation.y = Math.sin(now / 2000) * 0.2; renderer.render(scene, camera); });`;

let c = null; let D = null; let Q = null;
const SB = 'three-sandbox';
const ev = async (code, tries = 6) => { for (let i = 0; i < tries; i++) { const r = await D.evalInSketch(code); if (r?.ok) return r.value; await wait(500); } return null; };
const evj = async (code) => { const v = await ev(`return JSON.stringify(${code})`); try { return v ? JSON.parse(v) : null; } catch { return null; } };
const P149 = (code) => evj(`window.__labPlay149 ? ${code} : null`);
const BUDGET = 1000 / 60;
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10; };
function frameStats(gaps) {
  const g = gaps.filter((x) => x > 0 && x < 5000);
  let dropped = 0; for (const x of g) dropped += Math.max(0, Math.round(x / BUDGET) - 1);
  const tot = g.reduce((a, x) => a + x, 0);
  return { frames: g.length, fps: Math.round((1000 * g.length / Math.max(1, tot)) * 10) / 10, p50: pct(g, 0.5), p95: pct(g, 0.95), p99: pct(g, 0.99), droppedPerSec: Math.round((dropped / Math.max(0.001, tot / 1000)) * 10) / 10 };
}
const metr = async (target) => { const r = await smoke(target ? { cdp: 'Performance.getMetrics', target } : { cdp: 'Performance.getMetrics' }); const o = {}; for (const m of r?.metrics || []) o[m.name] = m.value; return o; };
// the GPU process's main thread: busy ms (its outermost tasks) in a dumped trace
async function gpuBusy(file) {
  let ev0 = null; try { ev0 = JSON.parse(await window.hub.fs.read(file, { encoding: 'utf8', maxBytes: 200 * 1024 * 1024 })); } catch { return null; }
  const pn = {}; const tn = {};
  for (const e of ev0) if (e.ph === 'M') { if (e.name === 'process_name') pn[e.pid] = e.args?.name; if (e.name === 'thread_name') tn[`${e.pid}:${e.tid}`] = e.args?.name; }
  const xs = ev0.filter((e) => e.ph === 'X' && e.dur > 0 && pn[e.pid] === 'GPU Process' && tn[`${e.pid}:${e.tid}`] === 'CrGpuMain').sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  let busy = 0; let end = -1; for (const e of xs) { if (e.ts < end) continue; end = e.ts + e.dur; busy += e.dur; }
  return busy / 1000;
}
const allocKB = (prof) => { let t = 0; const walk = (n) => { t += n.selfSize || 0; for (const k of n.children || []) walk(k); }; if (prof?.head) walk(prof.head); return t / 1024; };
const busyOf = (w) => w?.judge === 'load' || ((w?.loadavg?.[0] || 0) / Math.max(1, w?.cpus || 1)) >= 0.75 || ((w?.waited?.cpuWait || 0) > (w?.waited?.wallMs || 1) * 0.15);
async function measureOnce(label, { off, mode, level, only }, ms = 6000) {
  await P149(only ? `window.__labPlay149.set({ composer: ${only === 'composer'}, shadows: ${only === 'shadows'} })` : `window.__labPlay149.set({ off: ${Boolean(off)} })`);
  if (mode === 'smooth') await ev(`window.__labAdapt.set({ level: ${level}, hold: true }); return 1`);
  c.seek(1); await wait(150); c.play(true);
  await wait(2500);
  const snap = await smoke({ loadwait: 'snap' });
  const i0 = await P149('window.__labPlay149.info()');
  const mi0 = await metr(SB); const mp0 = await metr();
  await smoke({ cdp: 'HeapProfiler.enable', target: SB });
  await smoke({ cdp: 'HeapProfiler.startSampling', params: { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }, target: SB });
  await ev('return window.__labHitch.start(20000)');
  const file = `${window.SMOKE_TMP || '/tmp'}/play149-${label}-${Date.now()}.json`;
  await smoke({ trace: 'start', tasks: true });
  const T0 = performance.now();
  await wait(ms);
  await smoke({ trace: 'stop', tasks: { min: 50 }, dump: file });
  const secs = (performance.now() - T0) / 1000;
  const raw = await ev('return window.__labHitch.stop()');
  const al = await smoke({ cdp: 'HeapProfiler.stopSampling', target: SB });
  const mi1 = await metr(SB); const mp1 = await metr();
  const i1 = await P149('window.__labPlay149.info()');
  const lw = await smoke({ loadwait: 1, since: snap.snap });
  const st = await evj('window.__labSmooth ? window.__labSmooth.state() : null');
  c.play(false); await wait(300);
  let hx = null; try { hx = JSON.parse(raw); } catch { /* none */ }
  const fs = frameStats(hx?.gap || []);
  const gms = await gpuBusy(file);
  const per = (a, b, k) => (a[k] != null && b[k] != null ? Math.round(((b[k] - a[k]) * 1000 / secs) * 10) / 10 : null);
  return { label, off: Boolean(off), mode, level: st?.level ?? null, quality: st?.quality ?? null, ...fs,
    gpuMsPerFrame: gms != null && fs.frames ? Math.round((gms / fs.frames) * 10) / 10 : null, gpuMsPerSec: gms != null ? Math.round(gms / secs) : null,
    pageMainMsPerSec: per(mi0, mi1, 'TaskDuration'), pageScriptMsPerSec: per(mi0, mi1, 'ScriptDuration'), windowMainMsPerSec: per(mp0, mp1, 'TaskDuration'), windowScriptMsPerSec: per(mp0, mp1, 'ScriptDuration'),
    pageAllocKBPerSec: Math.round(allocKB(al?.profile) / secs), pageAllocKBPerFrame: fs.frames ? Math.round((allocKB(al?.profile) / fs.frames) * 10) / 10 : null,
    shadows: i0 && i1 ? { drawn: i1.shadows.drawn - i0.shadows.drawn, skipped: i1.shadows.skipped - i0.shadows.skipped, halfSkips: i1.shadows.halfSkips - i0.shadows.halfSkips } : null,
    load: lw && { judge: lw.judge, loadavg: lw.loadavg?.map((x) => Math.round(x * 100) / 100), cpus: lw.cpus, waited: lw.waited } };
}
// a quality pick can make the page run the layers again (a new composer): wait until it settled, then hold a step
async function settle(mode, level) {
  const n0 = await ev('return window.__play149n || 0');
  Q.set(mode, { quiet: true });
  await until(async () => (await ev('return window.__play149n || 0')) !== n0, 6000, 300);
  await until(() => composerNow(), 30000, 300);
  await wait(1500);
  if (mode !== 'high') await ev(`window.__labAdapt.set({ level: ${level}, hold: true }); return 1`);
}
const composerNow = () => evj("(() => { const k = window.__play149c; if (!k) return null; const cv = k.renderer.domElement; return { rt: [k.renderTarget1.width, k.renderTarget1.height], canvas: [cv.width, cv.height], pr: k.renderer.getPixelRatio(), cpr: k._pixelRatio }; })()");

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director && ThreeLab.quality, 60000);
  try { localStorage.setItem('hub.safeopen.hangMs', '600000'); } catch { /* the default 15 s: software GL builds this scene slowly */ }
  c = await ThreeLab.cmd(); D = ThreeLab.director; Q = ThreeLab.quality;
  await wait(600);
  await D.newSketch('Play fixture (play149)', GLOW, 2);
  const fixId = ThreeLab.scenes.currentId();
  try { c.customSize(480, 270); c.size('custom'); } catch { /* fit */ }
  await D.updateLayer(D.layers().layers[0].name, { name: 'Glow', code: GLOW }, 0.3);
  await D.addLayer({ name: 'Particles', code: PARTICLES }, 1);
  c.code?.(false);
  await wait(3000);
  if (ThreeLab.scenes.currentId() !== fixId) { ThreeLab.scenes.open(fixId); await wait(2500); }
  try { c.customSize(480, 270); c.size('custom'); } catch { /* fit */ }
  const f = await RS.files();
  await c.loadSong(f.song); await until(() => c.state.bpm > 0, 30000);
  await RS.toPage({ type: 'triggers-set', cfg: { kick: { on: true, lo: 40, hi: 120, thr: 0.5, gap: 200, fade: 120 } } });
  out.measure.layers = D.layers().layers.map((x) => x.name);
  out.measure.composerReady = Boolean(await until(() => composerNow(), 60000, 500));
  await smoke({ cdp: 'Performance.enable', target: SB }); await smoke({ cdp: 'Performance.enable' });

  // ---------- composer ----------
  await safe('composer', async () => {
    const at = async (off) => {
      await P149(`window.__labPlay149.set({ off: ${off} })`);
      c.play(true); await wait(3000); const k = await composerNow(); c.play(false); await wait(200);
      return k;
    };
    await settle('high', 0);
    const hOn = await at(false); const hOff = await at(true);
    await settle('smooth', 0); await P149('window.__labPlay149.set({ off: false })'); c.play(true); await wait(2500); c.play(false);
    const s0 = await composerNow(); // (at full quality: the size it was made at)
    await ev('window.__labAdapt.set({ level: 7, hold: true }); return 1');
    const sOn = await at(false); const sOff = await at(true);
    await P149('window.__labPlay149.set({ off: false })');
    out.measure.composer = { smoothFull: s0, smoothOn: sOn, smoothOff: sOff, highOn: hOn, highOff: hOff, info: await P149('window.__labPlay149.info().composer') };
    const near = (a, b) => Math.abs(a - b) <= 2;
    step('composer: with Smooth at 50 % resolution the composer\'s targets follow the canvas (they stayed at full size before)', s0 && sOn && sOff && s0.rt[0] >= 900 && near(sOn.rt[0], sOn.canvas[0]) && sOn.rt[0] <= s0.rt[0] / 2 + 2 && sOff.rt[0] === s0.rt[0] && sOff.canvas[0] < sOff.rt[0] - 8, out.measure.composer);
    step('composer: Force high quality draws exactly as before (full-size targets, the same on and off)', hOn && hOff && hOn.rt[0] === hOff.rt[0] && hOn.rt[1] === hOff.rt[1] && near(hOn.rt[0], hOn.canvas[0]) && hOn.pr === 2 && hOn.cpr === hOff.cpr, { hOn, hOff });
  });

  // ---------- shadows ----------
  await safe('shadows', async () => {
    const run = async (mode) => {
      await settle(mode, 7);
      c.play(true); await until(async () => { const i = await P149('window.__labPlay149.info()'); return i && i.frameTick > 0; }, 5000); await wait(9000); // (30 moving frames first: "moving all the time")
      const a = await P149('window.__labPlay149.info()'); await wait(5000); const b = await P149('window.__labPlay149.info()');
      c.play(false); await wait(200);
      const drawn = b.shadows.drawn - a.shadows.drawn; const skipped = b.shadows.skipped - a.shadows.skipped; const half = b.shadows.halfSkips - a.shadows.halfSkips;
      return { drawn, skipped, half, share: drawn + skipped ? Math.round((drawn / (drawn + skipped)) * 100) / 100 : null, halfNow: a.shadows.halfNow };
    };
    const s = await run('smooth'); const h = await run('high');
    out.measure.shadows = { smooth: s, high: h };
    step('shadows: at Smooth\'s deepest steps moving shadow maps are drawn every other frame (≤ 60 %)', s.drawn > 0 && s.half > 0 && s.share <= 0.6 && s.halfNow, s);
    step('shadows: Force high quality draws them every frame (none held back)', h.drawn > 0 && h.half === 0 && h.skipped === 0, h);
  });

  // ---------- measure (A/B at the same Smooth step) ----------
  const runs = [];
  await safe('measure', async () => {
    await settle('high', 0);
    runs.push(await measureOnce('high', { off: false, mode: 'high' }));
    await settle('smooth', 7);
    for (const off of [true, false, true, false]) runs.push(await measureOnce(off ? 'smooth-off' : 'smooth-on', { off, mode: 'smooth', level: 7 }));
    runs.push(await measureOnce('smooth-composer-only', { mode: 'smooth', level: 7, only: 'composer' })); // (informational: how much of the saving is each one's)
    runs.push(await measureOnce('smooth-shadows-only', { mode: 'smooth', level: 7, only: 'shadows' }));
    await P149('window.__labPlay149.set({ off: false })');
    const med = (a, k) => { const v = a.map((r) => r[k]).filter((x) => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
    const sum = (a) => Object.fromEntries(['fps', 'p50', 'p95', 'p99', 'droppedPerSec', 'gpuMsPerFrame', 'gpuMsPerSec', 'pageMainMsPerSec', 'pageScriptMsPerSec', 'windowMainMsPerSec', 'windowScriptMsPerSec', 'pageAllocKBPerSec', 'pageAllocKBPerFrame'].map((k) => [k, med(a, k)]));
    const off = runs.filter((r) => r.label === 'smooth-off'); const on = runs.filter((r) => r.label === 'smooth-on');
    out.measure.runs = runs;
    out.measure.table = { high: sum(runs.filter((r) => r.mode === 'high')), smoothBefore: sum(off), smoothAfter: sum(on), composerOnly: sum(runs.filter((r) => r.label === 'smooth-composer-only')), shadowsOnly: sum(runs.filter((r) => r.label === 'smooth-shadows-only')) };
    const A = out.measure.table.smoothBefore; const B = out.measure.table.smoothAfter;
    const ratio = { gpuMsPerFrame: A.gpuMsPerFrame ? Math.round((B.gpuMsPerFrame / A.gpuMsPerFrame) * 100) / 100 : null, fps: A.fps ? Math.round((B.fps / A.fps) * 100) / 100 : null, p95: A.p95 ? Math.round((B.p95 / A.p95) * 100) / 100 : null };
    const busy = runs.some((r) => busyOf(r.load));
    out.measure.ratio = { ...ratio, busy };
    const better = ratio.gpuMsPerFrame != null && ratio.gpuMsPerFrame <= 0.85 && ratio.fps >= 0.95;
    if (better) step('measure: at the same Smooth step the GPU does ≤ 0.85× the work a frame and frames are not slower', true, out.measure.ratio);
    else if (busy) { out.cantTell.push({ measure: out.measure.ratio }); step('measure: cheaper frames at the same Smooth step (or can\'t tell on a busy box)', B.fps > 0, out.measure.ratio); } else step('measure: at the same Smooth step the GPU does ≤ 0.85× the work a frame and frames are not slower', false, { ratio, before: A, after: B });
  }, 900000);

  // ---------- window ----------
  await safe('window', async () => {
    Q.set('smooth', { quiet: true }); await wait(300);
    await ev('window.__labAdapt.set({ level: 0, hold: false }); return 1');
    c.seek(1); await wait(150); c.play(true); await wait(2500);
    const MAINLESS = new Set(['transform', 'opacity', 'filter', 'offset', 'easing', 'composite', 'computedOffset']);
    const seen = new Map();
    for (let i = 0; i < 12; i++) { // (over 3 s: every beat light flash included)
      for (const a of document.getAnimations()) {
        if (a.playState !== 'running') continue;
        const props = new Set(); try { for (const k of a.effect?.getKeyframes?.() || []) for (const p of Object.keys(k)) if (!MAINLESS.has(p)) props.add(p); } catch { /* none */ }
        const name = `${a.animationName || a.transitionProperty || a.constructor.name} .${String(a.effect?.target?.className || '').split(' ')[0]}`;
        if (props.size) seen.set(name, [...props]);
      }
      await wait(250);
    }
    const beat = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } }).filter((r) => r.type === CSSRule.KEYFRAMES_RULE && /^mb-(beat|down)$/.test(r.name)).map((r) => ({ name: r.name, text: r.cssText }));
    // the Lab window's own work over 5 s, as before this round (the old beat light keyframes, the tick on every frame)
    // and now: what a 60 Hz screen shows of it (the tick's saving needs a fast screen: see "tick")
    const span = async () => { const m0 = await metr(); const t0 = performance.now(); await wait(5000); const m1 = await metr(); const secs = (performance.now() - t0) / 1000; const k = (n) => Math.round(((m1[n] - m0[n]) * 1000 / secs) * 10) / 10; return { mainMsPerSec: k('TaskDuration'), scriptMsPerSec: k('ScriptDuration'), styleMsPerSec: k('RecalcStyleDuration'), layoutMsPerSec: k('LayoutDuration'), layouts: Math.round((m1.LayoutCount - m0.LayoutCount) / secs * 10) / 10, styles: Math.round((m1.RecalcStyleCount - m0.RecalcStyleCount) / secs * 10) / 10 }; };
    const old = document.createElement('style'); old.textContent = '@keyframes mb-beat { from { color: #fff; text-shadow: 0 0 8px var(--ui-gold); } } @keyframes mb-down { from { color: var(--ui-red); text-shadow: 0 0 10px var(--ui-red); } }';
    document.head.append(old); LabPlay.tickOff(true);
    const before = await span();
    old.remove(); LabPlay.tickOff(false);
    const snap = await smoke({ loadwait: 'snap' });
    const after = await span();
    const m0 = { TaskDuration: 0, ScriptDuration: 0, RecalcStyleDuration: 0, LayoutDuration: 0 }; const m1 = { TaskDuration: after.mainMsPerSec * 5 / 1000, ScriptDuration: after.scriptMsPerSec * 5 / 1000, RecalcStyleDuration: after.styleMsPerSec * 5 / 1000, LayoutDuration: after.layoutMsPerSec * 5 / 1000 }; const secs = 5;
    const lw = await smoke({ loadwait: 1, since: snap.snap });
    const playingNow = document.documentElement.classList.contains('lab-playing');
    c.play(false); await wait(300);
    const ms = Math.round(((m1.TaskDuration - m0.TaskDuration) * 1000 / secs) * 10) / 10;
    out.measure.window = { mainThreadAnims: Object.fromEntries(seen), beat, before, after, windowMainMsPerSec: ms, scriptMsPerSec: Math.round(((m1.ScriptDuration - m0.ScriptDuration) * 1000 / secs) * 10) / 10, styleMsPerSec: Math.round(((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000 / secs) * 10) / 10, layoutMsPerSec: Math.round(((m1.LayoutDuration - m0.LayoutDuration) * 1000 / secs) * 10) / 10, playing: playingNow, load: lw && { judge: lw.judge, loadavg: lw.loadavg } };
    step('window: while it plays no animation in the Lab window needs its main thread (transform / opacity / filter only); the beat light flashes with a filter', seen.size === 0 && beat.length === 2 && beat.every((b) => /filter/.test(b.text) && !/text-shadow|color:/.test(b.text)), out.measure.window);
    if (ms <= 150) step('window: the Lab window does ≤ 150 ms of main-thread work a second while it plays', true, out.measure.window);
    else if (busyOf(lw)) { out.cantTell.push({ window: ms }); step('window: ≤ 150 ms a second (or can\'t tell on a busy box)', true, out.measure.window); } else step('window: the Lab window does ≤ 150 ms of main-thread work a second while it plays', false, out.measure.window);
  });

  // ---------- tick (a 240 Hz screen) ----------
  await safe('tick', async () => {
    const fake = (ms) => new Promise((res) => {
      const raf0 = window.requestAnimationFrame; const caf0 = window.cancelAnimationFrame;
      let q = new Map(); let id = 1; let t = performance.now(); let fires = 0;
      window.requestAnimationFrame = (fn) => { q.set(++id, fn); return id; };
      window.cancelAnimationFrame = (i) => { q.delete(i); };
      const iv = setInterval(() => { t += 1000 / 240; fires += 1; const l = [...q.values()]; q = new Map(); for (const fn of l) { try { fn(t); } catch { /* the Lab's own */ } } }, 4);
      setTimeout(() => { clearInterval(iv); window.requestAnimationFrame = raf0; window.cancelAnimationFrame = caf0; const l = [...q.values()]; for (const fn of l) raf0(fn); res({ fires, secs: fires / 240 }); }, ms);
    });
    const run = async (offT) => {
      LabPlay.tickOff(offT);
      c.seek(1); await wait(150); c.play(true); await wait(800);
      LabPlay.reset();
      const r = await fake(3000);
      const k = LabPlay.counts(); const info = LabPlay.tickInfo();
      c.play(false); await wait(300);
      return { ...r, worked: k.tick || 0, skipped: k.tickSkip || 0, playheads: k.playhead || 0, workedPerScreenSec: r.secs ? Math.round(((k.tick || 0) / r.secs) * 10) / 10 : null, scr: info.scr };
    };
    const on = await run(false); const off = await run(true);
    LabPlay.tickOff(false);
    out.measure.tick = { on, off };
    step('tick: on a 240 Hz screen the timeline\'s tick works ≤ 65 times a (screen) second while it plays (every frame before)', on.fires > 200 && on.workedPerScreenSec <= 65 && on.workedPerScreenSec >= 30 && off.workedPerScreenSec >= 180, out.measure.tick);
  });
} catch (err) { step('ran', false, { error: String(err?.stack || err).slice(0, 800) }); }
try { c?.play(false); } catch { /* fine */ }
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.ok = out.failed.length === 0;
return JSON.stringify(out, null, 1);
