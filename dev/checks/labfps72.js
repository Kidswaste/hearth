// Heavy scenes in the Lab preview and in ▶ Play (round 72, labfps72): the owner's "play does look best but the framerate
// is abysmal", reports with the Lab preview's render p95 at 1.6 s and WebGL context losses. OPT-IN (group labfps72, never
// in the quick groups): it builds a stress scene and measures it as the owner uses it.
// The stress scene (throwaway, this check's own): 9 layers, each its own WebGLRenderer as the Lab makes them:
//   World      a 4K ground picture + three more 4K pictures on boards, a 2048² sun shadow, a point light's 6-face shadow,
//              ~45 torus knots casting and receiving
//   Crowd      an InstancedMesh crowd (1,500 people) moved every frame, its own shadowed sun
//   Particles  45,000 points moved every frame (their buffer sent to the GPU every frame)
//   Bloom      an EffectComposer: render pass + UnrealBloom + output
//   Video      a 1280×720 VP9 video on a plane (VideoTexture)
//   Over 1–3   small overlay layers
//   Vignette   a filter layer over all of them (the Lab merges the picture under it every frame)
// sized down for this machine's software GPU (window.LF72_K, default 0.3 of the owner-sized counts) at a small exact frame
// (320×180), so frames come at all. Stretches (the quality held at full, so runs compare):
//   build     the scene made: the most big pictures (≥ 1 MP) uploaded in one frame, the longest frame's render work
//   steady    hands off: fps, frame gaps p50 / p95 (the page's pace meter), render work p50 / p95 / max (the CPU time inside
//             three's render(): uploads, compiles and GPU back-pressure land there), GPU-process ms a frame (on this machine
//             the software GPU draws there: the GPU's time; EXT_disjoint_timer_query_webgl2 where the GPU has it), draw
//             calls a frame, renders a displayed frame (double drawing), uploads / re-uploads a frame, compiles / links,
//             sync GPU read-backs a frame, GC ms a frame (the preview process' sampling profile)
//   shuffle   🎲 Shuffle clicked 3 times: compiles / links / uploads it causes (a slider tweak must not recompile)
//   hidden    another tool in front: frames drawn (parked: 0)
//   dialog    a modal <dialog> over the Lab: frames a second (round 72: 30 at most)
//   glass     the GPU-process ms a frame with the preview's glass chips (backdrop-filter) as they are vs off
//   contexts  3 layers re-run like director edits: WebGL contexts alive + waiting in the page (≤ 13: Chromium keeps 16
//             per process and takes the OLDEST back past that), losses
//   lost      every context lost and given back (__glRecover.lose): rebuilt in place, how long, nothing lost for good
//   play      ▶ Play of the same scene, Quality full vs auto: the game's fps, the scale auto settled on
// Budgets are counts and ratios (steady on a loaded machine); the times are reported, not budgeted (this machine's load
// moves them; on the owner's RTX 4080 they're another world). window.LF72_REPORT = 1 reports without failing;
// window.LF72_ONLY = 'steady,dialog'; window.LF72_SEC = 6; window.LF72_PLAY = 0 skips ▶ Play.
// opt-in: LABFPS72
//   LABFPS72=1 node dev/run-checks.js --exact labfps72   (≈ 6–10 min here; game checks need HEARTH_THREE_DIR)
//   node dev/smoke.js --check-timeout 1500000 --script dev/checks/labfps72.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { numbers: {}, steps: [], stretches: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const only = String(window.LF72_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const SEC = Number(window.LF72_SEC) || 6;
const K = Number(window.LF72_K) || 0.3;
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-labfps72`;
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const safe = async (name, fn, ms = 300000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };

// ---------- fixtures: four 4K pictures, a video ----------
const png = async (n, hue) => { const c = new OffscreenCanvas(n, n); const g = c.getContext('2d'); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = `hsl(${(hue + x * 11 + y * 7) % 360} 50% ${(x + y) % 2 ? 30 : 45}%)`; g.fillRect((x * n) / 32, (y * n) / 32, n / 32, n / 32); } return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
for (let i = 0; i < 4; i++) await window.hub.fs.write(`${DIR}/big${i}.png`, await png(4096, i * 90));
// the video: a check-made VP9 clip (dev/run-checks.js makes one with ffmpeg into the run's folder) or none
const VIDEO = window.LF72_VIDEO || '/tmp/hearth-labfps72-clip.webm';
const hasVideo = await Promise.resolve(window.hub.fs.stat?.(VIDEO)).then((s) => Boolean(s && !s.error && (s.size > 0 || s.isFile)), () => false);

activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
const c = await ThreeLab.cmd(); const D = ThreeLab.director;
await wait(600);
const HEAD = `import * as THREE from 'three';
const P = tweak({ spin: { value: 1, min: 0, max: 3, step: 0.01, label: 'Spin' }, hue: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'Hue' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300); camera.position.set(0, 6, 14); camera.lookAt(0, 0.5, 0);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const scene = new THREE.Scene();`;
const LAYERS = {
  World: `${HEAD}
scene.background = new THREE.Color('#10141c'); renderer.shadowMap.enabled = true;
const gt = refTexture('big0'); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(4, 4); gt.anisotropy = 8;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.8 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
for (let i = 1; i < 4; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: refTexture('big' + i) })); b.position.set(-6 + i * 3, 3, -8); scene.add(b); }
const sun = new THREE.DirectionalLight('#fff', 2); sun.position.set(6, 12, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
const pl = new THREE.PointLight('#ff9a50', 30, 30); pl.position.set(0, 3, 0); pl.castShadow = true; pl.shadow.mapSize.set(512, 512); scene.add(pl, new THREE.AmbientLight('#456', 0.5));
const mat = new THREE.MeshStandardMaterial({ color: '#c84', metalness: 0.4, roughness: 0.4 });
const ms = []; for (let i = 0; i < ${Math.round(150 * K)}; i++) { const m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.12, 64, 8), mat); const a = i * 2.39996; const r = 2 + (i % 14); m.position.set(Math.cos(a) * r, 0.7, Math.sin(a) * r); m.castShadow = true; m.receiveShadow = true; scene.add(m); ms.push(m); }
renderer.setAnimationLoop((t) => { const s = t / 1000; mat.color.setHSL(P.hue, 0.6, 0.5); for (let i = 0; i < ms.length; i++) ms[i].rotation.y = s * P.spin + i; pl.position.x = Math.sin(s) * 4; camera.position.x = Math.sin(s * 0.2) * 8; camera.lookAt(0, 0.5, 0); renderer.render(scene, camera); });`,
  Crowd: `${HEAD}
renderer.shadowMap.enabled = true; const sun = new THREE.DirectionalLight('#fff', 2); sun.position.set(-6, 12, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun, new THREE.HemisphereLight('#9cf', '#432', 0.6));
const N = ${Math.round(5000 * K)}; const im = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.12, 0.4, 4, 8), new THREE.MeshStandardMaterial({ color: '#ddd' }), N); im.castShadow = true; scene.add(im);
const o = new THREE.Object3D(); const col = new THREE.Color(); for (let i = 0; i < N; i++) im.setColorAt(i, col.setHSL((i * 0.13) % 1, 0.5, 0.5));
renderer.setAnimationLoop((t) => { const s = t / 1000; for (let i = 0; i < N; i++) { const a = i * 0.618 + s * 0.1 * P.spin; const r = 3 + (i % 70) * 0.25; o.position.set(Math.cos(a) * r, 0.35 + Math.abs(Math.sin(s * 4 + i)) * 0.2, Math.sin(a) * r); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } im.instanceMatrix.needsUpdate = true; renderer.render(scene, camera); });`,
  Particles: `${HEAD}
const N = ${Math.round(150000 * K)}; const pos = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) pos[i] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 15; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const pm = new THREE.PointsMaterial({ size: 0.05, color: '#8cf', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }); scene.add(new THREE.Points(g, pm));
renderer.setAnimationLoop((t) => { const s = t / 1000; pm.color.setHSL(P.hue, 0.7, 0.6); for (let i = 1; i < N * 3; i += 3) pos[i] += Math.sin(s + i) * 0.01; g.attributes.position.needsUpdate = true; renderer.render(scene, camera); });`,
  Bloom: `${HEAD}
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'; import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'; import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'; import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
const comp = new EffectComposer(renderer); comp.addPass(new RenderPass(scene, camera)); const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.2, 0.4, 0.1); comp.addPass(bloom); comp.addPass(new OutputPass());
addEventListener('resize', () => comp.setSize(innerWidth, innerHeight));
const ks = []; for (let i = 0; i < 12; i++) { const k = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 16, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 12, 1, 0.6) })); k.position.set((i % 4 - 1.5) * 3, 3 + Math.floor(i / 4) * 1.6, -2); scene.add(k); ks.push(k); }
renderer.setAnimationLoop((t) => { const s = t / 1000; bloom.strength = 0.5 + P.spin; ks.forEach((k, i) => { k.rotation.x = s + i; }); comp.render(); });`,
  Video: `${HEAD}
const vt = ${hasVideo ? "refTexture('clip')" : "new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1)"}; vt.needsUpdate = true; const pl = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), new THREE.MeshBasicMaterial({ map: vt })); pl.position.set(0, 6, -6); scene.add(pl);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`,
};
const over = (i) => `${HEAD}
const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 2), new THREE.MeshNormalMaterial()); m.position.set(-6 + ${i} * 1.6, 9, -3); scene.add(m);
renderer.setAnimationLoop((t) => { m.rotation.y = t / 700 * P.spin + ${i}; renderer.render(scene, camera); });`;
// a filter layer on top (vignette over every layer under it: the page merges the picture under it each frame)
const list = [...Object.entries(LAYERS), ...[0, 1, 2].map((i) => [`Over ${i + 1}`, over(i)]), ['Vignette', "filter('vignette', { amount: 0.5, round: 0, softness: 0.45, color: '#000000', drive: 0, react: 0 });"]];
const SIZE = String(window.LF72_SIZE || '320x180').split('x').map(Number);
try { c.customSize(SIZE[0], SIZE[1]); c.size('custom'); } catch (err) { step('frame size', false, String(err)); }
await D.newSketch('labfps72 stress', `${HEAD}\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));`, 2);
const SCENE = ThreeLab.scenes.currentId();
for (let i = 0; i < 4; i++) await D.refs.add(`${DIR}/big${i}.png`, `big${i}`).catch((err) => step(`picture big${i}`, false, String(err)));
if (hasVideo) await D.refs.add(VIDEO, 'clip').catch((err) => step('video', false, String(err)));
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(800); } return r; };
await until(async () => (await sbx('return 1')) === 1, 20000);

// ---------- this check's own counters in the preview page (never shipped) ----------
// uploads of big pictures (≥ 1 MP) with their times (uploads in one frame land within a few ms; frames here are ≥ 50 ms
// apart), sync GPU read-backs (readPixels without a buffer, finish, clientWaitSync), the timer-query extension
const HOOK = `if (!window.__lf72) { const n = { readPixels: 0, readsAsync: 0, finish: 0, waits: 0, big: [] }; window.__lf72 = n;
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const w = (m, fn) => { const f = P[m]; if (typeof f !== 'function' || f.__lf72) return; const g = function () { fn(arguments); return f.apply(this, arguments); }; g.__lf72 = 1; P[m] = g; };
    w('readPixels', (a) => { if (typeof a[6] === 'number') n.readsAsync += 1; else n.readPixels += 1; });
    w('finish', () => { n.finish += 1; }); w('clientWaitSync', () => { n.waits += 1; });
    const pic = (a) => { const s = a[a.length - 1]; if (a[1] !== 0 || !s || typeof s !== 'object' || ArrayBuffer.isView(s) || s instanceof HTMLVideoElement || (typeof VideoFrame !== 'undefined' && s instanceof VideoFrame)) return; if ((s.width || 0) * (s.height || 0) >= 1e6) n.big.push(performance.now()); };
    w('texImage2D', pic); w('texSubImage2D', pic);
  }
  try { const g = document.createElement('canvas').getContext('webgl2'); n.timer = Boolean(g && g.getExtension('EXT_disjoint_timer_query_webgl2')); g?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { n.timer = false; } }
return 1`;
if ((await sbx(HOOK)) !== 1) step('the check\'s counters in the preview', false);
// the GPU's own time where the graphics card has timer queries (EXT_disjoint_timer_query_webgl2): every layer's render()
// wrapped in a TIME_ELAPSED query while a stretch asks for it (this check's own wrapper, never shipped), results read
// when they're ready (never waited for)
const GPUQ = `if (!window.__lf72gpu) { const G = window.__lf72gpu = { on: false, ns: 0, n: 0, disjoint: 0, pend: [], wrapped: 0 };
  G.wrap = () => { for (const r of (window.__rdyLive ? window.__rdyLive() : [])) { if (r.__lf72q) continue; const gl = r.getContext && r.getContext(); const x = gl && gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!x) continue; r.__lf72q = 1; G.wrapped += 1; const orig = r.render; r.render = function (s, c) { if (!G.on || G.busy) return orig.call(this, s, c); const q = gl.createQuery(); G.busy = true; gl.beginQuery(x.TIME_ELAPSED_EXT, q); try { return orig.call(this, s, c); } finally { gl.endQuery(x.TIME_ELAPSED_EXT); G.busy = false; G.pend.push([gl, q, x]); } }; } return G.wrapped; };
  G.poll = () => { G.pend = G.pend.filter(([gl, q, x]) => { if (gl.isContextLost()) return false; if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return true; if (gl.getParameter(x.GPU_DISJOINT_EXT)) G.disjoint += 1; else { G.ns += gl.getQueryParameter(q, gl.QUERY_RESULT); G.n += 1; } gl.deleteQuery(q); return false; }); };
  setInterval(() => { if (G.pend.length) G.poll(); }, 50); }
return window.__lf72gpu.wrap()`;

// the scene: built in place (the stress layers), the pictures arriving while it runs
const t0 = performance.now();
// (into the same sketch, which holds the pictures: a restore without sketchId makes a new sketch without them)
const rep = await D.restore({ sketch: 'labfps72 stress', sketchId: SCENE, layers: list.map(([name, code], i) => ({ id: `lf-${i}`, name, code, slot: i, visible: true, opacity: 1, blend: 'normal' })) }, { wait: 3 }).catch((err) => { step('the stress scene', false, String(err)); return null; });
const pv = () => sbx(`const s = window.__labPace.state(); const g = window.__glRecover.state(); return { tick: s.frameTick, fps: s.fps, med: s.med, p95: s.p95, drawn: s.drawn, skipped: s.skipped, quality: s.quality, level: s.level, cap: s.cap, gl: window.__rdyGl(), ctx: { alive: g.contexts, made: g.made, losses: g.losses, rebuilds: g.rebuilds, lost: g.lost, none: g.none }, up: window.__labUploads ? window.__labUploads() : null, rb: { readPixels: window.__lf72.readPixels, finish: window.__lf72.finish, waits: window.__lf72.waits, async: window.__lf72.readsAsync }, timer: window.__lf72.timer, canvas: window.__labCanvas.info().replays }`);
await until(async () => { const v = await pv(); return v?.tick > 12 && v.gl; }, 90000);
await wait(4000);
{
  const v = await pv();
  const big = (await sbx('return window.__lf72.big')) || [];
  const ts = big.map(Math.abs).sort((a, b) => a - b); let most = 0;
  for (let i = 0; i < ts.length; i++) { let j = i; while (j + 1 < ts.length && ts[j + 1] - ts[i] < 25) j++; most = Math.max(most, j - i + 1); }
  out.numbers.build = { sec: r1((performance.now() - t0) / 1000), bigUploads: ts.length, mostBigInOneFrame: most, handedOver: v?.up, layers: D.layers().layers.map((x) => x.name + (x.error ? ` ✖ ${x.error}` : '')), contexts: v?.ctx, timerQuery: v?.timer, video: hasVideo };
  const errs = [...(rep?.errors || []), ...(D.report?.().errors || [])];
  step('the stress scene runs (9 layers, no layer error)', ThreeLab.scenes.currentId() === SCENE && D.layers().layers.length === list.length && !errs.length, { layers: out.numbers.build.layers, errors: errs.slice(0, 4) });
  step('big pictures reach the graphics card one a frame (at most 1 of ≥ 1 MP uploaded in one frame)', most <= 1, { most, uploads: ts.length });
}

// ---------- the GPU process' CPU time (the software GPU draws there) ----------
async function cpu() { try { const m = (await window.hub.power.test({ metrics: true }))?.metrics; if (!m) return null; return { gpu: m.procs.filter((p) => p.type === 'GPU').reduce((a, p) => a + (p.cpuS || 0), 0), at: performance.now() }; } catch { return null; } }
// the preview process' GC time, from a sampling profile of its own target
const cdpT = (target, method, params) => Promise.race([smoke({ cdp: method, params, target }), wait(8000)]);
const pvTarget = () => { const f = [...document.querySelectorAll('iframe')].find((x) => /three-sandbox/.test(x.src) && x.getBoundingClientRect().width > 50); const n = /[?&]n=([\w-]+)/.exec(f?.src || '')?.[1]; return n ? `three-sandbox.*[?&]n=${n}` : 'three-sandbox'; };
async function gcMs(fn) {
  const T = pvTarget();
  try { await cdpT(T, 'Profiler.enable', {}); await cdpT(T, 'Profiler.setSamplingInterval', { interval: 500 }); await cdpT(T, 'Profiler.start', {}); } catch { await fn(); return null; }
  await fn();
  const p = (await cdpT(T, 'Profiler.stop', {}))?.profile;
  if (!p) return null;
  const byId = new Map(p.nodes.map((x) => [x.id, x])); let gc = 0; let busy = 0;
  for (let i = 0; i < p.samples.length; i++) { const nm = byId.get(p.samples[i])?.callFrame.functionName; const dt = (p.timeDeltas[i] || 0) / 1000; if (nm === '(garbage collector)') gc += dt; if (!/^\((idle|program|root)\)$/.test(nm || '')) busy += dt; }
  return { gc, busy };
}
const perf = () => { try { return c.perf?.() || {}; } catch { return {}; } };
async function stretch(name, during, ms = SEC * 1000, profile = false) {
  if (!want(name) && !(only.includes('perlayer') && /^(all|without )/.test(name))) return null;
  await wait(400);
  await sbx('window.__labPace.reset(); return 1');
  const a = await pv(); const ca = await cpu();
  const gq = name === 'steady' ? await sbx(`${GPUQ}`) : 0;
  if (gq) await sbx('const G = window.__lf72gpu; G.ns = 0; G.n = 0; G.disjoint = 0; G.on = true; return 1');
  const run = async () => { const stop = { on: true }; const w = during ? during(stop) : null; await wait(ms); stop.on = false; await w; };
  const g = profile ? await gcMs(run) : (await run(), null);
  const gpuQ = gq ? await (async () => { await sbx('window.__lf72gpu.on = false; return 1'); await wait(600); return sbx('const G = window.__lf72gpu; G.poll(); return { ms: G.ns / 1e6, n: G.n, disjoint: G.disjoint, wrapped: G.wrapped }'); })() : null;
  const b = await pv(); const cb = await cpu(); const pf = perf();
  const frames = Math.max(1, (b?.tick || 0) - (a?.tick || 0)); const sec = ms / 1000;
  const d = (k) => (b?.gl?.[k] ?? 0) - (a?.gl?.[k] ?? 0); const dr = (k) => (b?.rb?.[k] ?? 0) - (a?.rb?.[k] ?? 0);
  const S = {
    frames, fps: r1(frames / sec), gapMed: b?.med, gapP95: b?.p95, quality: b?.quality, cap: b?.cap,
    renderP50: pf.frameMsP50 ?? null, renderP95: pf.frameMsP95 ?? null, callsPerFrame: pf.drawCallsAll ?? null,
    rendersPerFrame: r2(((b?.drawn || 0) - 0) / frames), skippedPerFrame: r2((b?.skipped || 0) / frames),
    gpuMsPerFrame: ca && cb ? r1(((cb.gpu - ca.gpu) * 1000) / frames) : null, gpuMsPerSec: ca && cb ? r1(((cb.gpu - ca.gpu) * 1000) / sec) : null,
    uploadsPerFrame: r2(d('uploads') / frames), reuploadsPerFrame: r2(d('reuploads') / frames), compiles: d('compiles'), links: d('links'), shaderWaitMs: r1(d('waitMs')),
    syncReadsPerFrame: r2((dr('readPixels') + dr('finish') + dr('waits')) / frames), asyncReads: dr('async'), redraws: (b?.canvas || 0) - (a?.canvas || 0),
    gpuTimerMsPerFrame: gpuQ && gpuQ.n ? r2(gpuQ.ms / frames) : null, gpuTimer: gpuQ ? { renders: gpuQ.n, disjoint: gpuQ.disjoint, layers: gpuQ.wrapped } : null, // (steady only; null there: no timer queries on this GPU)
    gcMsPerFrame: g ? r2(g.gc / frames) : null, pageBusyMsPerFrame: g ? r1(g.busy / frames) : null,
    contexts: b?.ctx,
  };
  out.stretches[name] = S;
  return S;
}
await sbx('window.__labAdapt.set({ level: 0, hold: true }); return 1'); // (full quality held: the runs compare)

await safe('steady', async () => {
  await sbx('window.__labDraw?.reset?.(); return 1'); // (round 74, labdraw74: what the preview's own savings did over the stretch)
  const S = await stretch('steady', null, SEC * 1000, true);
  if (!S) return;
  out.numbers.labDraw = await sbx('return window.__labDraw?.info?.() || null');
  step('steady: no shader compiled while the scene just plays', S.compiles === 0 && S.links === 0, { compiles: S.compiles, links: S.links });
  step('steady: no GPU read-back that waits, every frame (Hearth\'s own)', S.syncReadsPerFrame < 0.05, { syncReadsPerFrame: S.syncReadsPerFrame });
  step('steady: no picture drawn twice for a read while it plays', S.redraws === 0, { redraws: S.redraws });
});
// (diagnosis, only asked for: LF72_ONLY=perlayer) what each layer costs: the GPU-process ms a frame with it hidden
if (only.includes('perlayer')) await safe('perlayer', async () => {
  const base = await stretch('all', null, 4000);
  out.numbers.perLayer = { all: base?.gpuMsPerFrame, fps: base?.fps };
  for (const [name] of list) {
    await D.updateLayer(name, { visible: false }, 0.3).catch(() => {});
    const S = await stretch(`without ${name}`, null, 4000);
    out.numbers.perLayer[name] = { gpuMsPerFrame: S?.gpuMsPerFrame, fps: S?.fps };
    await D.updateLayer(name, { visible: true }, 0.3).catch(() => {});
  }
});
await safe('shuffle', async () => {
  const S = await stretch('shuffle', async () => { for (let i = 0; i < 3; i++) { document.querySelector('.tw-shuffle')?.click(); await wait(1500); } });
  if (!S) return;
  step('🎲 Shuffle ×3: no shader compiled for slider values', S.compiles === 0 && S.links === 0, { compiles: S.compiles, links: S.links });
});
await safe('hidden', async () => {
  const S = await stretch('hidden', async () => { activate('tool:board'); }, 5000);
  activate('tool:three'); await wait(2500);
  if (!S) return;
  step('another tool in front: the preview draws nothing (parked)', S.frames <= 2, { frames: S.frames });
});
await safe('dialog', async () => {
  const base = out.stretches.steady?.fps;
  // a 60 fps cap at most here (Xvfb's screen), this machine's frames under it: the dialog's cap shows against "Max fps"
  c.fps?.(0); await wait(1500);
  const S0 = await stretch('dialog-before', null, 4000);
  const S = await stretch('dialog', async (stop) => { const d = document.createElement('dialog'); d.textContent = 'labfps72'; document.body.append(d); d.showModal(); while (stop.on) await wait(100); d.close(); d.remove(); }, 5000);
  c.fps?.(-1); await wait(1000);
  if (!S || !S0) return;
  const st = S.cap;
  step('a modal dialog over the Lab: the preview at 30 fps at most', st === 30 && S.fps <= 31, { capUnderDialog: st, fps: S.fps, fpsBefore: S0.fps, steadyFps: base });
});
await safe('glass', async () => {
  if (!want('glass')) return;
  const css = document.createElement('style'); css.textContent = '.three-preview *, .three-preview { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
  const blur = [...document.querySelectorAll('.three-preview *')].filter((x) => { const s = getComputedStyle(x); return s.backdropFilter && s.backdropFilter !== 'none' && x.getBoundingClientRect().width > 0; }).map((x) => x.className.toString().split(' ')[0]);
  const on1 = await stretch('glass-on', null, 5000);
  document.head.append(css); const off = await stretch('glass-off', null, 5000); css.remove();
  out.numbers.glass = { blurredOverPreview: blur, gpuMsPerFrameOn: on1?.gpuMsPerFrame, gpuMsPerFrameOff: off?.gpuMsPerFrame };
  step('nothing over the preview blurs what it draws (backdrop-filter re-blurs every frame)', blur.length === 0, out.numbers.glass);
});
await safe('contexts', async () => {
  if (!want('contexts')) return;
  const a = await pv();
  for (let k = 0; k < 3; k++) await D.updateLayer(`Over ${k + 1}`, { code: `${over(k)}\n// edit ${k}` }, 0.6).catch((err) => step(`edit ${k}`, false, String(err)));
  await wait(3000);
  const b = await pv();
  const pool = await sbx('return window.__labGpu?.state?.().pool ?? null');
  out.numbers.contexts = { before: a?.ctx, after: b?.ctx, pool };
  step('3 layer re-runs: no context lost, contexts alive ≤ the scene\'s layers + 3', (b?.ctx?.losses || 0) === (a?.ctx?.losses || 0) && (b?.ctx?.alive || 0) <= list.length + 3, out.numbers.contexts);
});
await safe('lost', async () => {
  if (!want('lost')) return;
  const a = await pv(); const stuck0 = ThreeLab.gl?.state?.().stuck || 0;
  const msgs = []; const t0 = performance.now();
  const onMsg = (e) => { const d = e.data; if (d?.source === 'three-sandbox' && /^gpu-/.test(d.type || '')) msgs.push([Math.round(performance.now() - t0), d.type, d.first ? 'first' : d.layers?.length ?? d.layers ?? '']); };
  addEventListener('message', onMsg, true);
  const n = await sbx('return window.__glRecover.lose({ restore: 300 })');
  const back = await until(async () => { const v = await pv(); return v?.ctx && !v.ctx.lost && v.ctx.rebuilds > (a?.ctx?.rebuilds || 0) && v.tick > (a?.tick || 0) && v; }, 60000);
  const backMs = Math.round(performance.now() - t0);
  await wait(3000);
  removeEventListener('message', onMsg, true);
  const b = await pv();
  const st = await sbx('return window.__glRecover.state().last');
  const stuck = (ThreeLab.gl?.state?.().stuck || 0) - stuck0;
  out.numbers.lost = { contextsLost: n, drawingAgainMs: back ? backMs : null, rebuilt: st, newPage: stuck, messages: msgs.slice(0, 12), compiles: (b?.gl?.compiles || 0) - (a?.gl?.compiles || 0), uploads: (b?.gl?.uploads || 0) - (a?.gl?.uploads || 0) };
  step('every context lost and back: the layers rebuilt in place (no new page), drawing again', Boolean(back) && !stuck, out.numbers.lost);
});

// ---------- ▶ Play: Quality full vs auto ----------
// Two games: "Fill", one layer whose every pixel is costly (a ray-marched fog: the graphics card's pixels are the limit,
// as a big scene on a 4K / 240 Hz screen), played with Quality full and auto; and the stress scene with auto (its
// limit here is the crowd's vertices on this software GPU: fewer pixels don't help, so auto must give them back).
// The game's frames: the play page's own displayed-frame count (every layer, merged or not).
const FILL = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); u.uRes.value.set(innerWidth, innerHeight); });
const u = { uT: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) } };
const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: u, vertexShader: 'varying vec2 v; void main() { v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform float uT; varying vec2 v; float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); } void main() { vec3 ro = vec3(0.0, 0.0, uT); vec3 rd = normalize(vec3(v * 2.0 - 1.0, 1.0)); float a = 0.0; vec3 p = ro; for (int i = 0; i < 48; i++) { p += rd * 0.08; a += 0.02 * (0.5 + 0.5 * sin(p.x * 3.0 + sin(p.y * 2.0 + uT) + p.z)); } gl_FragColor = vec4(vec3(a * 0.6, a * 0.4, a), 1.0); }' }));
m.frustumCulled = false; const scene = new THREE.Scene(); scene.add(m); const cam = new THREE.Camera();
renderer.setAnimationLoop((t) => { u.uT.value = t / 1000; renderer.render(scene, cam); });`;
if (window.LF72_PLAY !== 0 && want('play')) await safe('play', async () => {
  await Lazy.load('gamemode');
  const GW = () => window.hub.game;
  const ev = async (code) => { const r = await GW().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
  await D.newSketch('labfps72 fill', FILL, 2);
  const FILL_ID = ThreeLab.scenes.currentId();
  localStorage.setItem('gameready.test', JSON.stringify({ noPrep: true }));
  const res = {};
  async function playOne(tag, id, title, q) {
    store.set('gamemode.quality', q);
    await GameMode.play({ kind: 'lab', id, title });
    await until(async () => (await GW().state())?.playing, 60000);
    await until(() => ev('Boolean(window.__labPace && window.__labPace.state().frameTick > 5 && (!window.__gameReady || JSON.parse(window.__gameReady.pub()).phase === "playing"))'), 180000);
    // auto: until it settles (no step for 8 s) or 60 s
    if (q === 'auto') { let last = ''; let same = 0; for (let i = 0; i < 60 && same < 8; i++) { await wait(1000); const s = await ev('window.__gameQuality ? JSON.stringify([window.__gameQuality.state().scale, window.__gameQuality.state().downs, window.__gameQuality.state().ups]) : "none"'); same = s === last ? same + 1 : 0; last = s; } } else await wait(4000);
    const tick = () => ev('window.__labPace.state().frameTick');
    const f0 = await tick(); const tA = performance.now(); const ca = await cpu();
    await wait(SEC * 1000);
    const f1 = await tick(); const tB = performance.now(); const cb = await cpu();
    const st = await ev('window.__gameQuality ? JSON.stringify(window.__gameQuality.state()) : "null"');
    const gi = JSON.parse((await ev('JSON.stringify(window.__gameInfo())')) || '{}');
    const errs = await ev('JSON.stringify((window.__hearthGame && window.__hearthGame.errors) || [])').catch(() => '[]');
    res[tag] = { fps: r1(((f1 - f0) * 1000) / (tB - tA)), gpuMsPerFrame: ca && cb ? r1(((cb.gpu - ca.gpu) * 1000) / Math.max(1, f1 - f0)) : null, quality: JSON.parse(st || 'null'), canvas: gi.canvas, pixelRatio: gi.pixelRatio, merged: gi.merged?.length, own: gi.own, errors: JSON.parse(errs || '[]').slice(0, 3) };
    await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 15000); await wait(1200);
  }
  await playOne('fill-full', FILL_ID, 'labfps72 fill', 'full');
  await playOne('fill-auto', FILL_ID, 'labfps72 fill', 'auto');
  await playOne('stress-full', SCENE, 'labfps72 stress', 'full');
  await playOne('stress-auto', SCENE, 'labfps72 stress', 'auto');
  localStorage.removeItem('gameready.test'); store.set('gamemode.quality', 'auto');
  out.numbers.play = res;
  const F = res['fill-full']; const A = res['fill-auto']; const S = res['stress-auto']; const SF = res['stress-full'];
  step('▶ Play, Quality full: every pixel (scale 1)', F?.quality?.scale === 1 && F.quality.mode === 'full', F?.quality);
  step('▶ Play, Quality auto, a game whose pixels are the cost: fewer pixels and a faster game', A?.quality?.scale < 1 && A.fps > F.fps * 1.15, { full: F?.fps, auto: A?.fps, scale: A?.quality?.scale, log: A?.quality?.log });
  step('▶ Play, Quality auto, the stress scene: fewer pixels kept only where they made it faster', Boolean(S?.quality) && (S.quality.scale === 1 || S.fps > SF.fps * 1.05), { full: SF?.fps, auto: S?.fps, scale: S?.quality?.scale, log: S?.quality?.log });
});

const bad = out.steps.filter((s) => !s.ok);
if (window.LF72_REPORT) out.reportOnly = true;
await smoke({ shot: window.LF72_SHOT || `${TMP}/labfps72.png` });
return JSON.stringify({ pass: window.LF72_REPORT ? true : bad.length === 0, failed: bad.map((s) => s.name), ...out }, null, 1);
