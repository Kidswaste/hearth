// The Lab preview running a game scene at the screen's rate while the owner edits (round 55, labplay55). A throwaway
// Clink-like fixture (a shadowed world with 2K ground / crate textures, 60 shadowed crates, a CanvasTexture rewritten
// every frame, 6 projectiles added every frame each with its own cloned material and gone 0.8 s later, a 🧊 GLB model
// layer, a DOM HUD layer that asks for its frames with a new function each time, no song) plays in the Lab preview
// (not frozen, not ▶ Play) at a small exact frame size (320×180) so the software GPU here keeps up, at full quality
// (held). Stretches:
//   still    the preview playing, hands off
//   hover    the mouse moving over the preview (60 moves a second), as while looking at / aiming at something
//   panel    the mouse moving over the Lab's panel (sliders), the preview playing beside it
//   fits     the adaptive quality free again, its target frame time twice the frames' own median (frames that fit):
//            the pointer over the game; the quality must stay full
// Per stretch: main-thread JS (CDP sampling profiles of the window and of the preview's own process) per preview
// frame, split into the game (its layer code + three.js, and the WebGL calls it makes through the page's thin
// counting hooks), the preview page's own Lab work (three-sandbox.html) and the Lab window (its scripts); the preview's
// frames and gaps (its pace meter); messages the preview sends the Lab per frame (by type); frames / timers the Lab
// window asks for per second (by file); scene signatures the still check worked out per frame and pokes; GPU
// read-backs. Fails (counts: steady on a loaded machine) when the Lab adds steady per-frame work a playing game
// doesn't need: the still check walking a moving scene on more than 0.3 frames in 1 (pointer over it or not),
// messages to the Lab every frame, a Lab-window frame loop beside the game, GPU read-backs that wait, or the quality
// going lighter where frames fit. Timings (ms / frame) are reported, not budgeted (this machine's load moves them).
// window.LP55_REPORT = 1 reports without failing; window.LP55_ONLY = 'still,hover'; window.LP55_SEC = 6;
// window.LP55_SIZE = '640x360'; window.LP55_BUDGET = { sigsPerFrame: … }.
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/labplay55.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { numbers: {}, problems: [], stretches: {} };
const fail = (m) => out.problems.push(m);
const only = String(window.LP55_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const SEC = Number(window.LP55_SEC) || 6;
const TMP = window.SMOKE_TMP || '/tmp'; // (round 56, fixes56) this run's own scratch folder (dev/smoke.js --tmp): two runs at once never share files
const DIR = `${TMP}/hearth-labplay55`;
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- fixtures: 2K textures and a model ----------
const png2k = async (paint) => { const c = new OffscreenCanvas(2048, 2048); const g = c.getContext('2d'); paint(g); return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
await window.hub.fs.write(`${DIR}/ground.png`, await png2k((g) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = `hsl(${(x * 7 + y * 3) % 60 + 90} 35% ${(x + y) % 2 ? 22 : 30}%)`; g.fillRect(x * 64, y * 64, 64, 64); } }));
await window.hub.fs.write(`${DIR}/crate.png`, await png2k((g) => { g.fillStyle = '#8a5a2b'; g.fillRect(0, 0, 2048, 2048); g.strokeStyle = '#3b2412'; g.lineWidth = 60; g.strokeRect(30, 30, 1988, 1988); g.beginPath(); g.moveTo(0, 0); g.lineTo(2048, 2048); g.moveTo(2048, 0); g.lineTo(0, 2048); g.stroke(); }));
function glb() {
  const W = 48; const Hh = 32; const pos = []; const idx = [];
  for (let j = 0; j <= Hh; j++) for (let i = 0; i <= W; i++) { const u = (i / W) * Math.PI * 2; const v = (j / Hh) * Math.PI; pos.push(Math.cos(u) * Math.sin(v) * 0.5, Math.cos(v) * 0.7 + 0.7, Math.sin(u) * Math.sin(v) * 0.5); }
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const a = j * (W + 1) + i; const b = a + W + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const P = new Float32Array(pos); const I = new Uint16Array(idx); const T = new Float32Array([0, 0.5, 1]); const TR = new Float32Array([0, 0, 0, 0, 0.4, 0, 0, 0, 0]);
  const parts = [P, I, T, TR]; const views = []; let off = 0; const chunks = [];
  for (const p of parts) { const b = new Uint8Array(p.buffer); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); chunks.push(b, new Uint8Array(pad)); off += b.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.length; }
  const json = { asset: { version: '2.0', generator: 'hearth labplay55 check' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'hero' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.95, 0.55, 0.2, 1], metallicFactor: 0.2, roughnessFactor: 0.5 } }],
    buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: P.length / 3, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1.4, 0.5] }, { bufferView: 1, componentType: 5123, count: I.length, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [1] }, { bufferView: 3, componentType: 5126, count: 3, type: 'VEC3' }],
    animations: [{ name: 'Bounce', samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  return u;
}
await window.hub.fs.write(`${DIR}/hero.glb`, glb());

// ---------- the game scene ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
const c = await ThreeLab.cmd();
const D = ThreeLab.director;
await wait(600);
const GAME = `import * as THREE from 'three';
const P = tweak({ fog: { value: 0.03, min: 0, max: 0.1, step: 0.001, label: 'Fog' }, rate: { value: 6, min: 0, max: 12, step: 1, label: 'Shots a frame' } });
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200); camera.position.set(0, 5, 11); camera.lookAt(0, 0.5, 0);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1320'); scene.fog = new THREE.FogExp2('#0d1320', P.fog);
const gt = refTexture('ground'); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(8, 8); gt.anisotropy = 8;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const sun = new THREE.DirectionalLight('#fff3e0', 2.4); sun.position.set(6, 10, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun, new THREE.HemisphereLight('#9ec5ff', '#3b2a1a', 0.6));
const ct = refTexture('crate'); ct.anisotropy = 8; const crateMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7 }); const box = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(box, crateMat); const a = i * 2.39996; const r = 3 + (i % 12); m.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
// a scoreboard drawn into a canvas every frame
const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64; const sg = sc.getContext('2d');
const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc) })); board.position.set(0, 3.2, -4); scene.add(board);
// projectiles: added every frame, each with its own material (a cloned one), gone after 0.8 s
const shotGeo = new THREE.SphereGeometry(0.12, 8, 6); const shotMat = new THREE.MeshStandardMaterial({ color: '#ffcf6b', emissive: '#ff8a3d', emissiveIntensity: 1.5 });
const shots = []; let score = 0;
renderer.setAnimationLoop((t) => {
  const s = t / 1000; scene.fog.density = P.fog;
  for (let k = 0; k < P.rate; k++) { const m = new THREE.Mesh(shotGeo, shotMat.clone()); m.position.set(Math.sin(s * 3 + k) * 2, 0.6, 2); m.userData.v = new THREE.Vector3(Math.sin(k + s) * 2, 1.5, -14); m.userData.born = s; m.castShadow = true; scene.add(m); shots.push(m); }
  for (let i = shots.length - 1; i >= 0; i--) { const m = shots[i]; m.position.addScaledVector(m.userData.v, 1 / 60); if (s - m.userData.born > 0.8) { scene.remove(m); m.material.dispose(); shots.splice(i, 1); score += 1; } }
  sg.fillStyle = '#101820'; sg.fillRect(0, 0, 256, 64); sg.fillStyle = '#ffd75e'; sg.font = '700 40px system-ui'; sg.fillText('SCORE ' + score, 12, 46); board.material.map.needsUpdate = true;
  camera.position.x = Math.sin(s * 0.3) * 6; camera.lookAt(0, 0.5, 0);
  renderer.render(scene, camera);
});`;
const HUD = `const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:12px;top:8px;font:700 18px system-ui;color:#fff;text-shadow:0 2px 6px #000'; document.body.append(d);
let shown = -1; const f = (t) => { const v = Math.floor(t / 250); if (v !== shown) { shown = v; d.textContent = 'CLINK · ' + v; } requestAnimationFrame((u) => f(u)); }; requestAnimationFrame(f);`; // (a new function every frame, as many games ask)
await D.newSketch('Clink play fixture (labplay55)', GAME, 2);
const fixId = ThreeLab.scenes.currentId();
const SIZE = String(window.LP55_SIZE || '320x180').split('x').map(Number);
try { c.customSize(SIZE[0], SIZE[1]); c.size('custom'); } catch { /* the frame size stays */ }
await D.refs.add(`${DIR}/ground.png`, 'ground').catch((err) => fail(`ground texture: ${err.message}`));
await D.refs.add(`${DIR}/crate.png`, 'crate').catch((err) => fail(`crate texture: ${err.message}`));
try { await D.updateLayer(D.layers().layers[0].name, { name: 'Game', code: GAME }, 0.3); } catch (err) { fail(`game layer: ${err.message}`); }
try { await D.addLayer({ name: 'HUD', code: HUD }, 1); } catch (err) { fail(`layer HUD: ${err.message}`); }
try { await Commands.tryRun(`/model add ${DIR}/hero.glb`, H.claudeAgent().id); } catch (err) { fail(`model: ${err.message}`); }
c.code?.(false); c.panel?.(true);
await wait(4000);
if (ThreeLab.scenes.currentId() !== fixId) { ThreeLab.scenes.open(fixId); await wait(2500); }
out.numbers.layers = D.layers().layers.map((x) => x.name).join(', ');
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(800); } return r; };
// the preview's own numbers: frames drawn, its pace meter (gaps), the still check's signatures, the adaptive quality
const pv = () => sbx('const s = window.__labPace.state(); return { tick: s.frameTick, fps: s.fps, med: s.med, p95: s.p95, drops: s.drops, label: s.label, quality: s.quality, level: s.level, cap: s.cap, doze: s.doze.why, drawn: s.drawn, skipped: s.skipped, sigs: s.sigs, poke: s.poke, gates: window.__labPace.gates?.() || null, gl: window.__lp55gl?.() || null }');
await until(async () => (await pv())?.tick > 30, 30000);
out.numbers.previewStart = await pv();

// ---------- probes (hub side, this check only) ----------
const P = { msgs: {}, raf: {}, timers: {}, on: false };
const fileOf = () => { const st = String(new Error().stack || '').split('\n').slice(2); const f = st.find((l) => !/labplay55|<anonymous>/.test(l)) || ''; const m = /([\w.-]+\.(?:js|html)):\d+/.exec(f); return m ? m[1] : '?'; };
addEventListener('message', (e) => { if (!P.on || e.data?.source !== 'three-sandbox') return; const k = e.data.type; P.msgs[k] = (P.msgs[k] || 0) + 1; }, true);
const raf0 = window.requestAnimationFrame; const st0 = window.setTimeout; const si0 = window.setInterval;
window.requestAnimationFrame = function (fn) { if (P.on) { const k = fileOf(); P.raf[k] = (P.raf[k] || 0) + 1; } return raf0.call(this, fn); };
window.setTimeout = function (...a) { if (P.on) { const k = `timeout ${fileOf()}`; P.timers[k] = (P.timers[k] || 0) + 1; } return st0.apply(this, a); };
window.setInterval = function (...a) { if (P.on) { const k = `interval ${fileOf()}`; P.timers[k] = (P.timers[k] || 0) + 1; } return si0.apply(this, a); };

// the window's JS by part, from a sampling profile
const BUCKETS = [['game', /^blob:|three\.(module|core)(\.min)?\.js|three@|GLTFLoader|addons/], ['labPage', /three-sandbox\.html/], ['hub', /./]];
const pvTarget = () => { const f = [...document.querySelectorAll('iframe')].find((x) => /three-sandbox/.test(x.src) && x.getBoundingClientRect().width > 50); const n = /[?&]n=([\w-]+)/.exec(f?.src || '')?.[1]; return n ? `three-sandbox.*[?&]n=${n}` : 'three-sandbox'; };
const tcdp = (target, method, params) => Promise.race([smoke({ cdp: method, params, target }), wait(8000)]);
async function profile(fn) {
  const T = pvTarget();
  for (const call of [(m, x) => cdp(m, x), (m, x) => tcdp(T, m, x)]) { await call('Profiler.enable', {}); await call('Profiler.setSamplingInterval', { interval: 250 }); await call('Profiler.start', {}); }
  await fn();
  const pm = (await cdp('Profiler.stop', {}))?.profile; const pp = (await tcdp(T, 'Profiler.stop', {}))?.profile;
  if (!pm || !pp) return null;
  const a = digest(pm); const b = digest(pp);
  return { hub: a, page: b };
}
function digest(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n])); const parent = new Map(); for (const n of p.nodes) for (const ch of n.children || []) parent.set(ch, n);
  const dt = {}; for (let i = 0; i < p.samples.length; i++) dt[p.samples[i]] = (dt[p.samples[i]] || 0) + (p.timeDeltas[i] || 0);
  const ms = { game: 0, labPage: 0, hub: 0, gc: 0, other: 0 }; const top = { labPage: {}, hub: {}, game: {} };
  // a native function (no url) counts for the nearest caller with a url; a native the game calls through one of the
  // page's thin hooks (a WebGL call the page counts: texImage2D, bindTexture, useProgram…) is the game's work: the
  // hook's own JS stays the page's
  const owner = (n) => { let x = n; while (x && !x.callFrame.url) x = parent.get(x.id); return x; };
  const bucket = (url) => BUCKETS.find(([, re]) => re.test(url))[0];
  for (const [id, us] of Object.entries(dt)) {
    const n = byId.get(Number(id)); const fnName = n.callFrame.functionName;
    if (/^\((idle|program|root)\)$/.test(fnName)) continue;
    if (fnName === '(garbage collector)') { ms.gc += us / 1000; continue; }
    let o = owner(n); if (!o) { ms.other += us / 1000; continue; }
    if (!n.callFrame.url && bucket(o.callFrame.url) === 'labPage') { let x = parent.get(o.id); for (let k = 0; x && k < 3; k++, x = parent.get(x.id)) { if (!x.callFrame.url) continue; if (bucket(x.callFrame.url) === 'game') { o = x; break; } if (bucket(x.callFrame.url) !== 'labPage') break; } }
    const url = o.callFrame.url; const b = bucket(url);
    ms[b] += us / 1000;
    const k = `${o.callFrame.functionName || '(anon)'} ${url.split('/').pop().split('?')[0].slice(0, 40)}:${o.callFrame.lineNumber + 1}`;
    top[b][k] = (top[b][k] || 0) + us / 1000;
  }
  const t = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${r1(v)}ms ${k}`);
  return { ms, top: { labPage: t(top.labPage), hub: t(top.hub), game: t(top.game).slice(0, 8) } };
}

// GPU read-backs and waits the page asks for (this check's own counter in the preview page, never shipped)
await sbx(`if (!window.__lp55gl) { const n = { readPixels: 0, readsAsync: 0, getError: 0, finish: 0, waits: 0 }; for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) { const w = (m, k) => { const f = P[m]; if (typeof f !== 'function' || f.__lp55) return; const g = function (...a) { n[k(a)] += 1; return f.apply(this, a); }; g.__lp55 = 1; P[m] = g; }; w('readPixels', (a) => (typeof a[6] === 'number' ? 'readsAsync' : 'readPixels')); w('getError', () => 'getError'); w('finish', () => 'finish'); w('clientWaitSync', () => 'waits'); } window.__lp55gl = () => ({ ...n }); } return 1`);
async function stretch(name, during) {
  if (!want(name)) return;
  await wait(500);
  P.msgs = {}; P.raf = {}; P.timers = {};
  await sbx('window.__labPace.reset(); return 1');
  const a = await pv(); const t0 = performance.now();
  P.on = true;
  const prof = await profile(async () => { const stop = { on: true }; const w = during ? during(stop) : null; await wait(SEC * 1000); stop.on = false; await w; });
  P.on = false;
  const sec = (performance.now() - t0) / 1000; const b = await pv();
  const frames = Math.max(1, b.tick - a.tick);
  const per = (x) => r2(x / frames);
  const S = {
    sec: r1(sec), frames, fps: r1(frames / sec), meter: { fps: b.fps, med: b.med, p95: b.p95, drops: b.drops, label: b.label }, quality: b.quality, level: b.level, cap: b.cap,
    msPerFrame: prof ? { game: per(prof.page.ms.game), labPage: per(prof.page.ms.labPage), pageGc: per(prof.page.ms.gc), pageOther: per(prof.page.ms.other + prof.page.ms.hub), hub: per(prof.hub.ms.hub + prof.hub.ms.game + prof.hub.ms.labPage), hubGc: per(prof.hub.ms.gc), hubOther: per(prof.hub.ms.other) } : null,
    msgsPerFrame: Object.fromEntries(Object.entries(P.msgs).map(([k, v]) => [k, per(v)])),
    hubRafPerSec: Object.fromEntries(Object.entries(P.raf).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => [k, r1(v / sec)])),
    hubTimersPerSec: Object.fromEntries(Object.entries(P.timers).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => [k, r1(v / sec)])),
    gates: b.gates, drawn: b.drawn, skipped: b.skipped, sigsPerFrame: r2((b.sigs || 0) / frames), pokesPerFrame: r2((b.poke - a.poke) / frames),
    glPerFrame: b.gl && a.gl ? Object.fromEntries(Object.keys(b.gl).map((k) => [k, r2((b.gl[k] - (a.gl[k] || 0)) / frames)])) : null,
    top: prof ? { labPage: prof.page.top.labPage, game: prof.page.top.game, hub: prof.hub.top.hub } : null,
  };
  out.stretches[name] = S;
}
// a preview spot for the pointer
const pvBox = () => { const f = [...document.querySelectorAll('iframe')].find((x) => /three-sandbox/.test(x.src) && x.getBoundingClientRect().width > 50); return f?.getBoundingClientRect(); };
const panelBox = () => { const p = [...document.querySelectorAll('.tw-panel, .three-tweaks, .tweaks')].find((x) => x.getBoundingClientRect().width > 50); return p?.getBoundingClientRect() || null; };
const moveOver = (box) => async (stop) => { let i = 0; while (stop.on && box) { const x = box.left + box.width * (0.3 + 0.4 * ((i % 40) / 40)); const y = box.top + box.height * (0.4 + 0.2 * Math.sin(i / 7)); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) }); i += 1; await wait(16); } };
// the stretches at full quality, held (the software GPU here can't keep up, so the adaptive steps would move the
// game's own cost between runs); the adaptive quality itself is looked at after them
await sbx('window.__labAdapt.set({ level: 0, hold: true }); return 1');
// (the still check has seen the game move for a while: a few seconds at this machine's frame rate, ≈ 1 s at 240 Hz)
// (each renderer's gate past its first looks: a renderer that drew twice a frame while loading starts its looks later;
// on this machine's 5–10 fps that warm-up takes seconds, ≈ 1 s at 240 Hz): until 2.5 s with under 0.15 walks a frame
{
  const t0 = Date.now(); let warm = null;
  while (Date.now() - t0 < 40000) { const a = await pv(); await wait(2500); const b = await pv(); if (a && b && b.tick > a.tick) { warm = r2((b.sigs - a.sigs) / (b.tick - a.tick)); if (warm < 0.15 && b.sigs >= a.sigs && (b.gates || []).every((g) => g.moving >= 30 && !g.multi)) break; } }
  out.numbers.warm = { walksPerFrame: warm, sec: Math.round((Date.now() - t0) / 1000) };
}
await stretch('still', null);
await stretch('hover', moveOver(pvBox()));
await stretch('panel', moveOver(panelBox()));
window.requestAnimationFrame = raf0; window.setTimeout = st0; window.setInterval = si0;
// "lighter to stay smooth" where the frame already fits: the target frame time set to twice the frames' own median
// (as on a fast screen whose frames fit), the pointer over the playing game: the quality must stay full
if (want('fits')) {
  const med = out.stretches.still?.meter?.med || out.stretches.hover?.meter?.med || 100;
  await sbx(`window.__labAdapt.set({ level: 0, hold: false, target: ${Math.round(med * 2)} }); return 1`);
  const stop = { on: true }; const w = moveOver(pvBox())(stop); await wait(SEC * 1500); stop.on = false; await w;
  const st = await sbx('return window.__labAdapt.state()');
  out.numbers.fits = { target: Math.round(med * 2), level: st.level, scale: st.scale };
  if (st.level !== 0) fail(`the preview went lighter (level ${st.level}, ${Math.round(st.scale * 100)} %) while its frames fit (target ${Math.round(med * 2)} ms)`);
  await sbx('window.__labAdapt.set({ level: 0, hold: false, target: 0 }); return 1');
}
out.numbers.previewEnd = await pv();

// ---------- steady per-frame work the Lab adds to a playing game (counts: steady under load) ----------
const BUDGET = { sigsPerFrame: 0.3, msgsPerFrame: 0.5, hubRafPerSec: 20, ...(window.LP55_BUDGET || {}) };
out.budgets = BUDGET;
for (const [name, S] of Object.entries(out.stretches)) {
  // the still check's scene walk: a game moving on every frame is looked at now and then, not on most frames
  if (S.sigsPerFrame > BUDGET.sigsPerFrame) fail(`${name}: ${S.sigsPerFrame} scene signatures a frame for a game that keeps moving (budget ${BUDGET.sigsPerFrame})`);
  // the preview's messages to the Lab: none every frame
  const msgs = Object.entries(S.msgsPerFrame).filter(([k]) => k !== 'eval-result').reduce((a, [, v]) => a + v, 0);
  if (msgs > BUDGET.msgsPerFrame) fail(`${name}: the preview sent the Lab ${r2(msgs)} messages a frame (${JSON.stringify(S.msgsPerFrame)})`);
  // the Lab window: no frame loop of its own running every frame beside the game
  for (const [k, v] of Object.entries(S.hubRafPerSec)) if (v > BUDGET.hubRafPerSec) fail(`${name}: the Lab window asked for ${v} frames a second from ${k} (budget ${BUDGET.hubRafPerSec})`);
  // GPU read-backs that wait for the GPU
  if (S.glPerFrame && (S.glPerFrame.readPixels || S.glPerFrame.finish || S.glPerFrame.waits)) fail(`${name}: GPU read-backs that wait (${JSON.stringify(S.glPerFrame)})`);
}
if (window.LP55_REPORT) { out.reportOnly = out.problems; out.problems = []; }
await smoke({ shot: window.LP55_SHOT || '/tmp/labplay55.png' });
return JSON.stringify(out, null, 1);
