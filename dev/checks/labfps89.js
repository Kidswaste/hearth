// (round 89, labfps89) Hitches in the Lab preview: frame-time spikes, not the average. The owner's PC (RTX 4080, 240 Hz)
// already holds the frame rate; what he sees is a frame that sticks for 50–300 ms when something new happens. Every
// frame of the preview is kept (window.__labHitch in tools/three-sandbox.html: its gap, the layers' render work, shader
// compiles / links in it, the ms the page waited on a program, first texture uploads and their megapixels) over:
//   steady    each bundled demo scene (gallery starting points) running hands-off
//   switch    a switch to each demo scene (the old picture stays until the new stack drew; its first frames)
//   reload    a code edit of the top layer (hot re-run with the cross-fade)
//   firstuse  a scene whose layer shows a hidden object with a new material after a second (shader compile on first use)
//   texture   a 4096² picture reference arriving in a running scene (a big upload)
//   post      a post-processing filter added (bloom), then hidden and shown again
//   audio     a song loaded and played under an audio-reactive scene (the analysis, the features, the song clock start)
// Per stretch: p50 / p95 / p99 frame gap, the frames over 2× the frame budget (the budget is the preview's cap: Auto
// holds 60, so 16.7 ms; 2× = 33.3), and the frames in which a shader was compiled or a big picture uploaded while a
// picture the viewer can see moved ("visible compile frames").
// Load-aware (round 88, checkfix88): every hitch over 2× the budget is judged on CPU, not wall time: a light trace of
// the run (smoke trace `tasks`) gives the preview's own tasks in that gap with their thread CPU time and the preview
// thread's wait for a CPU (Linux schedstat). A hitch is the app's ("over") when its own CPU time is over the hitch
// budget, or it was off the CPU longer than the thread waited for one (a sync wait on the GPU: a shader compile, an
// upload); it is the box's ("load", listed under cantTell) when its CPU time fits and the rest is no more than the wait
// for a CPU. A hitch with no task of the preview in it (the page wasn't running: the GPU process or the compositor
// behind) is judged by the run's dev/loadwait-style wait of the GPU process: can't tell when the box was busy.
// Budgets (counts, steady on a loaded machine): 0 visible compile frames on switch / reload / first use / post; no big
// upload sharing a frame with another; app-judged hitches over 2× budget ≤ LF89_HITCH per stretch; p99 of the steady
// demo scenes ≤ 2× budget unless the over-budget frames are all can't-tell. window.LF89_REPORT = 1 only reports;
// window.LF89_ONLY = 'steady,switch'; window.LF89_SCENES = 'outrun,galaxy'.
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/labfps89.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, every = 120) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return false; };
const out = { stretches: {}, steps: [], cantTell: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok) || Boolean(window.LF89_REPORT), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 240000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };
const only = String(window.LF89_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-labfps89`;
const HITCH = Number(window.LF89_HITCH ?? 1);
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };

activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
const c = await ThreeLab.cmd(); const D = ThreeLab.director;
await wait(600);
const SIZE = String(window.LF89_SIZE || '480x270').split('x').map(Number);
try { c.customSize(SIZE[0], SIZE[1]); c.size('custom'); } catch (err) { step('frame size', false, String(err)); }
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(500); } return r; };
if (typeof LabGallery === 'undefined') await Lazy.load('gallery');
await until(() => typeof LabGallery !== 'undefined' && typeof LabGalleryData !== 'undefined', 20000);
const SCENES = String(window.LF89_SCENES || 'outrun,chrome-blob,galaxy,beat-burst,kinetic-opener,spectrum-crown').split(',');
const itemOf = (id) => LabGallery.items().find((x) => x.key === `b:${id}`) || LabGallery.items().find((x) => x.kind === 'start' && x.id === id);

// ---------- one stretch: the preview's frames, and the trace for judging its hitches ----------
async function record(name, during, { ms = 3000, pre = 300 } = {}) {
  await sbx('return window.__labHitch ? 1 : 0').then((v) => { if (v !== 1) throw new Error('no window.__labHitch in the preview'); });
  let traced = false;
  try { await smoke({ trace: 'start', tasks: true }); traced = true; } catch { /* judged on wall time */ }
  await sbx("performance.mark('labfps89'); return window.__labHitch.start()");
  await wait(pre);
  const t0 = performance.now();
  const info = await during();
  const left = ms - (performance.now() - t0); if (left > 0) await wait(left);
  const raw = await sbx('return window.__labHitch.stop()');
  const f = typeof raw === 'string' ? JSON.parse(raw) : null;
  if (!f) { if (traced) await smoke({ trace: 'stop', tasks: { budget: 1e9 } }).catch(() => {}); throw new Error(`${name}: no frames from the preview (${JSON.stringify(raw)?.slice(0, 200)})`); }
  // the frame budget: the preview's cap (Auto: 60 → 16.7 ms), or this stretch's own median frame where the machine
  // can't hold that (a software GPU: 50–80 ms a frame here). A hitch is a frame over twice that: a spike, not a pace.
  const gaps = f.gap.slice(1).filter((g) => g > 0);
  const budget = Math.max(f.cap ? 1000 / f.cap : 1000 / 60, pct(gaps, 0.5) || 0);
  // frame times from the mark (the recorder started right after it), each hitch's span
  let t = 0; const hitches = [];
  for (let i = 1; i < f.n; i++) { const g = f.gap[i]; if (g > 2 * budget) hitches.push({ i, at: r1(t), ms: g, compiles: f.compiles[i] + (f.compiles[i - 1] || 0), waitMs: r1(f.waitMs[i]), uploads: f.uploads[i], upMP: f.upMP[i], work: f.work[i] }); t += g; }
  // compiles / big uploads in a frame where the page drew something on screen (drew 1: as is, 3: the old scene still
  // drawing over the new one; 2 = under the old scene's still picture, where nothing on screen moves)
  const visibleCompiles = []; const bigUploads = [];
  const vis = (i) => f.drew[i] === 1 || f.drew[i] === 3;
  for (let i = 0; i < f.n; i++) {
    if (f.compiles[i] && vis(i)) visibleCompiles.push({ i, compiles: f.compiles[i], waitMs: f.waitMs[i], gap: f.gap[i] });
    if (f.upMP[i] >= 1) bigUploads.push({ i, n: f.uploads[i], mp: f.upMP[i], inFrame: f.upMPframe[i], gap: f.gap[i] });
  }
  // the longest time nothing on screen moved (a frozen picture: a still cover, or no frame at all)
  let stillMs = 0; let since = 0;
  for (let i = 1; i < f.n; i++) { since += f.gap[i]; if (vis(i)) { stillMs = Math.max(stillMs, since); since = 0; } }
  stillMs = Math.max(stillMs, since);
  let judged = null;
  if (traced) {
    try {
      judged = await smoke({ trace: 'stop', tasks: { budget: 2 * budget, min: 0, mark: 'labfps89', observed: hitches.map((h) => ({ at: h.at, ms: h.ms })) } });
    } catch (err) { judged = { verdict: 'unknown', why: String(err).slice(0, 200) }; }
  }
  // each hitch's verdict, on CPU (round 88's rule, for a page that waits on a GPU process):
  //   over     the preview's own tasks in the gap spent more CPU than the hitch budget (script, layout, GC: the app's)
  //   compile  a shader was compiled, or a big picture uploaded, inside a frame on screen there: what this round
  //            moves off the frame (the app's, wherever its time went)
  //   load     neither: the page's thread was off the CPU, waiting for a CPU or for the GPU process (a software GPU
  //            rasterising on a busy box): can't tell, listed in cantTell (with the thread's own wait for a CPU)
  //   wall     no trace (off Linux, tracing failed): judged on wall time as before
  for (const h of hitches) {
    const tk = judged?.tasks?.find((x) => Math.abs(x.at - h.at) < 0.6 && Math.abs(x.ms - r1(h.ms)) < 0.6);
    h.cpuMs = tk?.cpuMs ?? null;
    const i = h.i; const vc = (vis(i) && f.compiles[i]) || (i > 0 && vis(i - 1) && f.compiles[i - 1]);
    const inUp = f.upMPframe[i] >= 1 || (i > 0 && f.upMPframe[i - 1] >= 1);
    if (!judged || !Array.isArray(judged.tasks)) h.judged = 'wall';
    else if (h.cpuMs != null && h.cpuMs > 2 * budget) { h.judged = 'over'; h.why = `${h.cpuMs} ms of the preview's own CPU`; }
    else if (vc || inUp) { h.judged = 'compile'; h.why = vc ? `${vc} shader compiles / links in a frame on screen` : 'a big picture uploaded inside the frame'; }
    else { h.judged = 'load'; h.why = `${h.cpuMs ?? 0} ms of the preview's CPU; the rest off the CPU (the thread waited ${judged.runDelayMs ?? '?'} ms for a CPU over the run, the rest for the GPU process)`; }
  }
  const app = hitches.filter((h) => h.judged !== 'load');
  const load = hitches.filter((h) => h.judged === 'load');
  const s = { frames: f.n, drawn: f.drew.reduce((a, x) => a + x, 0), budget: r1(budget), p50: pct(gaps, 0.5), p95: pct(gaps, 0.95), p99: pct(gaps, 0.99), max: r1(Math.max(0, ...gaps)),
    over2x: hitches.length, over2xApp: app.length, over2xLoad: load.length, compiles: f.compiles.reduce((a, x) => a + x, 0), visibleCompileFrames: visibleCompiles.length, compileWaitMs: r1(f.waitMs.reduce((a, x) => a + x, 0)),
    uploads: f.uploads.reduce((a, x) => a + x, 0), bigUploadFrames: bigUploads.length, mostBigInFrame: Math.max(0, ...bigUploads.map((b) => b.n)), bigMPinFrames: r1(f.upMPframe.reduce((a, x) => a + x, 0)), stillMs: r1(stillMs), swap: f.swap, up: f.up, khr: f.khr, note: f.note,
    hitches: hitches.slice().sort((a, b) => b.ms - a.ms).slice(0, 5).map((h) => ({ at: h.at, ms: r1(h.ms), cpuMs: h.cpuMs, judged: h.judged, compiles: h.compiles, waitMs: h.waitMs, upMP: h.upMP, work: h.work, why: h.why })),
    runDelayMs: judged?.runDelayMs ?? null, ...(info && typeof info === 'object' ? { info } : {}) };
  for (const h of load) out.cantTell.push(`${name}: a ${r1(h.ms)} ms frame (${h.why || h.judged})`);
  out.stretches[name] = s;
  return s;
}
const layerNames = () => D.layers().layers.map((l) => l.name);
const ready = async (n = 1) => until(async () => { const v = await sbx('return window.__labPace.state().frameTick'); return typeof v === 'number' && v > n; }, 30000);

// ---------- steady + switch: every demo scene ----------
let prev = null;
for (const id of SCENES) {
  const item = itemOf(id);
  if (!item) { step(`demo scene ${id} is in the gallery`, false); continue; }
  if (want('switch') && prev) {
    // the same switch twice: the old scene's still picture (round 88's way, mode off) and double-buffered (mode on:
    // what 'auto' does where shaders compile in the background), back to the previous scene in between
    for (const m of ['off', 'on']) {
      await safe(`switch-${m}:${id}`, async () => {
        await sbx(`return window.__labSwap.mode('${m}')`);
        await record(`switch-${m}:${id}`, async () => { await LabGallery.use(item); return null; }, { ms: 4500 });
      });
      await until(() => D.report().sketch?.startsWith(item.name), 15000); await ready(); await wait(800);
      if (m === 'off') { const back = itemOf(prev); await LabGallery.use(back); await until(() => D.report().sketch?.startsWith(back.name), 15000); await ready(); await wait(1200); }
    }
    await sbx("return window.__labSwap.mode('auto')");
  } else await LabGallery.use(item);
  await until(() => D.report().sketch?.startsWith(item.name), 15000);
  await ready(); await wait(1500);
  if (want('steady')) await safe(`steady:${id}`, () => record(`steady:${id}`, async () => null, { ms: 3500, pre: 0 }));
  prev = id;
}

// ---------- reload: an edit of the top layer's code (hot re-run, cross-fade) ----------
if (want('reload')) await safe('reload', async () => {
  const L = D.layers().layers.filter((l) => !/✦/.test(l.name)).at(-1) || D.layers().layers.at(-1);
  const code0 = D.codeOf(L.name);
  await record('reload', async () => { await D.updateLayer(L.name, { code: `${code0}\n// an edit ${Date.now()}` }, 0); return { layer: L.name }; }, { ms: 4000 });
});

// ---------- first use: a hidden object with a new material shown after a second ----------
const FIRSTUSE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#151820');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 1, 6); camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight('#9cf', '#321', 1.2)); const sun = new THREE.DirectionalLight('#fff', 2); sun.position.set(3, 5, 2); scene.add(sun);
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16), new THREE.MeshStandardMaterial({ color: '#7ad', roughness: 0.4 })); scene.add(knot);
const drop = new THREE.Group(); drop.visible = false; scene.add(drop);
for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 3), new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setHSL(i / 4, 0.7, 0.5), clearcoat: 1, iridescence: 1, sheen: 1, roughness: 0.2 })); m.position.set(-2.4 + i * 1.6, -1.4, 0); drop.add(m); }
const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.03, 8, 96), new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform float t; void main() { gl_FragColor = vec4(0.5 + 0.5 * sin(t * 3.0), 0.6, 1.0, 1.0); }' })); ring.visible = false; scene.add(ring);
window.__lf89drop = () => { drop.visible = true; ring.visible = true; return performance.now(); };
renderer.setAnimationLoop((t) => { knot.rotation.y = t / 1500; ring.material.uniforms.t.value = t / 1000; drop.rotation.y = t / 2000; renderer.render(scene, camera); });`;
if (want('firstuse')) await safe('firstuse', async () => {
  await D.newSketch('labfps89 first use', FIRSTUSE, 1);
  await ready(); await wait(2500);
  await record('firstuse', async () => ({ shownAt: await sbx('return window.__lf89drop()') }), { ms: 2500 });
});

// ---------- texture: a 4096² picture arriving in a running scene ----------
const png = async (n, hue) => { const cv = new OffscreenCanvas(n, n); const g = cv.getContext('2d'); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = `hsl(${(hue + x * 11 + y * 7) % 360} 50% ${(x + y) % 2 ? 30 : 45}%)`; g.fillRect((x * n) / 32, (y * n) / 32, n / 32, n / 32); } return new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
if (want('texture')) await safe('texture', async () => {
  await window.hub.fs.write(`${DIR}/big0.png`, await png(4096, 30));
  await window.hub.fs.write(`${DIR}/big1.png`, await png(4096, 200));
  await D.newSketch('labfps89 texture', FIRSTUSE.replace('window.__lf89drop', 'window.__lf89x'), 1);
  await ready(); await wait(1500);
  for (const k of ['big0', 'big1']) await D.refs.add(`${DIR}/${k}.png`, k);
  await wait(800);
  const TEX = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const a = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: refTexture('big0') })); a.position.x = -1; scene.add(a);
const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: refTexture('big1') })); b.position.x = 1; scene.add(b);
renderer.setAnimationLoop((t) => { a.rotation.z = t / 3000; b.rotation.z = -t / 3000; renderer.render(scene, camera); });`;
  await record('texture', async () => { await D.addLayer({ name: 'Big pictures', code: TEX }, 0); return null; }, { ms: 5000 });
});

// ---------- post: a bloom filter added, hidden, shown ----------
if (want('post')) await safe('post', async () => {
  const item = itemOf('chrome-knot') || itemOf(SCENES[0]);
  await LabGallery.use(item); await until(() => D.report().sketch?.startsWith(item.name), 15000); await ready(); await wait(1500);
  await record('post:add', async () => { await D.addLayer({ name: 'labfps89 bloom', code: ThreeLayers.filterCode('bloom', {}) }, 0); return null; }, { ms: 3500 });
  await wait(500);
  await record('post:toggle', async () => { await D.updateLayer('labfps89 bloom', { visible: false }, 0); await wait(800); await D.updateLayer('labfps89 bloom', { visible: true }, 0); return null; }, { ms: 3000 });
});

// ---------- audio: a song loaded and played under an audio-reactive demo scene ----------
async function songFile(file, bpm, secs) {
  const sr = 44100; const n = Math.round(secs * sr); const x = new Float32Array(n); const beat = 60 / bpm;
  for (let k = 0; k * beat < secs - 0.5; k++) { const a = Math.round(k * beat * sr); for (let i = 0; i < 0.25 * sr && a + i < n; i++) { const u = i / sr; x[a + i] += 0.8 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-u * 30)) * u) * Math.exp(-u * 9); } }
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, str) => [...str].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i])) * 30000), true);
  await window.hub.fs.write(file, new Uint8Array(data.buffer));
}
if (want('audio')) await safe('audio', async () => {
  const item = itemOf('beat-burst') || itemOf(SCENES[0]);
  await LabGallery.use(item); await until(() => D.report().sketch?.startsWith(item.name), 15000); await ready(); await wait(1500);
  const file = `${DIR}/song.wav`; await songFile(file, 124, 30);
  await record('audio:load', async () => { const r = await c.loadSong(file); await until(() => c.state.bpm > 0, 30000); return { ok: r?.ok, bpm: c.state.bpm }; }, { ms: 4000 });
  await wait(800);
  await record('audio:play', async () => { c.play(true); return null; }, { ms: 4000 });
  c.play(false);
});

// ---------- verdicts ----------
const S = out.stretches;
const of = (re) => Object.entries(S).filter(([k]) => re.test(k));
for (const [k, s] of of(/^steady:/)) {
  const allLoad = s.over2xApp === 0;
  step(`${k}: p99 ≤ 2× the frame budget (${s.p99} ms of ${2 * s.budget})${s.p99 > 2 * s.budget && allLoad ? ' (over only by frames the box held up)' : ''}`, s.p99 <= 2 * s.budget || allLoad, { p50: s.p50, p95: s.p95, p99: s.p99, over2x: s.over2x, app: s.over2xApp });
  step(`${k}: no shader compile while it runs`, s.compiles === 0, s.compiles);
}
for (const [k, s] of of(/^switch-on:/)) {
  step(`${k}: the old scene kept drawing until the new one was ready (double-buffered)`, s.swap?.lives > 0 && !s.swap.fellBack, s.swap);
  const off = S[k.replace('switch-on', 'switch-off')];
  if (off) step(`${k}: the picture stands still for less than with the still cover (${s.stillMs} vs ${off.stillMs} ms)`, s.stillMs < off.stillMs, { on: s.stillMs, off: off.stillMs });
}
// where shaders compile in the background (KHR_parallel_shader_compile: the owner's card), none in a frame that showed
// anything; without (a software GPU), a new layer's programs are all made in its one setup frame, never later
for (const [k, s] of of(/^(switch-on|reload|post:add)/)) {
  const most = s.khr ? 0 : 1;
  step(`${k}: shaders compiled ahead (${s.khr ? 'in the background: none in a frame on screen' : 'no background compile here: all in one setup frame'})`, s.visibleCompileFrames <= most, { frames: s.visibleCompileFrames, compiles: s.compiles, waitMs: s.compileWaitMs, khr: s.khr });
}
if (S.firstuse) step('firstuse: a hidden object shown mid-scene costs no shader compile (compiled with the scene, before its first frame)', S.firstuse.compiles === 0, { compiles: S.firstuse.compiles, waitMs: S.firstuse.compileWaitMs, worst: S.firstuse.hitches[0] });
if (S['post:toggle']) step('post: a filter hidden and shown again compiles nothing', S['post:toggle'].compiles === 0, S['post:toggle'].compiles);
for (const [k, s] of Object.entries(S).filter(([n]) => !n.startsWith('switch-off'))) step(`${k}: hitches over 2× budget judged the app's ≤ ${HITCH}`, s.over2xApp <= HITCH, { app: s.over2xApp, load: s.over2xLoad, worst: s.hitches.slice(0, 3) });
if (S.texture) {
  step('texture: big pictures reach the graphics card one a frame', S.texture.mostBigInFrame <= 1 && S.texture.bigUploadFrames >= 1, { frames: S.texture.bigUploadFrames, most: S.texture.mostBigInFrame });
  step('texture: … uploaded right after a frame, not inside one (0 MP of them inside a frame)', S.texture.bigMPinFrames < 1 && S.texture.up?.ahead >= 2, { inFrames: S.texture.bigMPinFrames, up: S.texture.up });
}
const all = Object.values(S);
out.summary = { stretches: all.length, over2x: all.reduce((a, s) => a + s.over2x, 0), over2xApp: all.reduce((a, s) => a + s.over2xApp, 0), visibleCompileFrames: all.reduce((a, s) => a + s.visibleCompileFrames, 0), worstP99: Math.max(0, ...all.map((s) => s.p99 || 0)) };
out.cantTell = out.cantTell.slice(0, 12);
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
