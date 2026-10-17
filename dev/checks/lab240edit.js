// The Lab at 240 Hz while the owner EDITS a game scene that keeps playing in the preview (round 57, lab240edit).
// labplay55 / labcanvas56 measured the preview playing a game hands-off; this one drives the owner's real editing
// habits over the same kind of Clink-like fixture (a shadowed world with 2K textures, props with sliders, a sky shader,
// a DOM HUD, a 🧊 model; the director docked; the preview PLAYING at a small exact frame so the software GPU here keeps
// up), with real input (CDP), in one timeline trace (dev/trace-stats.js) cut into stretches:
//   slider   dragging a slider (an <input type=range>) back and forth
//   knob     turning a knob (drag up / down)
//   scrub    dragging a number's name sideways (number scrub)
//   layers   dragging layers in the Layers list (dragstart → dragover on each row → drop), twice
//   timeline dragging the playhead across the timeline and back
//   orbit    right-drag (turn) and middle-drag (pan) over the playing preview, then wheel zoom
//   typing   typing into the code editor (the selected layer's code shown)
//   chat     a director reply streaming in the docked chat while the preview plays
//   split    dragging the dock's splitter (the chat's width) back and forth
// Per stretch: drawn frames whose main-thread work went over 4.2 ms / 8.3 ms, the worst frame, tasks over 4.2 ms and
// the longest, forced style / layout (count, ms, the line that asked), style / layout passes, DOM mutations, and this
// check's own probes: localStorage writes, hub.kvSet calls, JSON.stringify calls, ResizeObserver callbacks, frames
// asked (rAF), and the messages the preview received (by type) — counted from the window (by file) and from the page.
// Fails (counts, steady on a loaded machine) on: a forced layout loop (forced layouts per input event over a loose
// budget in any stretch), synchronous storage writes per input (localStorage / kvSet more than a few per stretch),
// the preview getting more slider messages than frames drawn, and a loose longest-task budget per stretch.
// window.L240E_REPORT = 1 reports without failing; window.L240E_ONLY = 'slider,split'; window.L240E_WHO = 1 adds the
// callers of the probed calls (slower); window.L240E_PROFILE = 'slider' adds a JS profile of a stretch;
// window.L240E_BUDGET overrides.
//   node dev/smoke.js --fake-engines --screen 1920x1080 --check-timeout 900000 --script dev/checks/lab240edit.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { numbers: {}, problems: [], stretches: {} };
const fail = (m) => out.problems.push(m);
const only = String(window.L240E_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const WHO = Boolean(window.L240E_WHO);
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-lab240edit`;
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const box = (n) => n?.getBoundingClientRect();
// brings a control to the middle of its scrolling box (scrollIntoView doesn't reach the Lab's own scroller here)
const reveal = async (n) => {
  for (let p = n?.parentElement; p; p = p.parentElement) {
    if (p.scrollHeight <= p.clientHeight + 2 || !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) continue;
    const pr = p.getBoundingClientRect(); const nr = n.getBoundingClientRect();
    p.scrollTop += (nr.top + nr.height / 2) - (pr.top + Math.min(pr.height, innerHeight - pr.top) / 2);
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};
const shown = (n) => { const r = box(n); return r && r.width > 2 && r.height > 2; };
const r1 = (x) => Math.round(x * 10) / 10;

// ---------- probes (installed before the Lab loads: its ResizeObservers are counted too) ----------
const P = { on: false, seg: '', n: {}, who: {} };
const fileOf = () => { const st = String(new Error().stack || '').split('\n').slice(3); const f = st.find((l) => !/lab240edit|<anonymous>/.test(l)) || ''; const m = /([\w.-]+\.(?:js|html)):(\d+)/.exec(f); return m ? `${m[1]}:${m[2]}` : '?'; };
const count = (kind) => { if (!P.on) return; P.n[kind] = (P.n[kind] || 0) + 1; if (WHO) { const k = `${kind} ${fileOf()}`; P.who[k] = (P.who[k] || 0) + 1; } };
{
  const setItem0 = Storage.prototype.setItem;
  Storage.prototype.setItem = function (...a) { count('localStorage'); return setItem0.apply(this, a); };
  const kv0 = window.hub.kvSet;
  window.hub.kvSet = function (...a) { count(`kvSet ${a[0]}`); return kv0.apply(this, a); };
  const js0 = JSON.stringify;
  JSON.stringify = function (...a) { count('JSON.stringify'); return js0.apply(this, a); };
  const raf0 = window.requestAnimationFrame;
  window.requestAnimationFrame = function (fn) { count('rAF'); return raf0.call(this, fn); };
  const RO = window.ResizeObserver;
  window.ResizeObserver = class extends RO { constructor(cb) { const where = fileOf(); super((...a) => { if (P.on) { P.n.resizeObs = (P.n.resizeObs || 0) + 1; const k = `resizeObs ${where}`; P.who[k] = (P.who[k] || 0) + 1; } return cb(...a); }); } };
}

// ---------- fixtures: 2K textures, a model ----------
const png2k = async (paint) => { const c = new OffscreenCanvas(2048, 2048); const g = c.getContext('2d'); paint(g); return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
await window.hub.fs.write(`${DIR}/ground.png`, await png2k((g) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = `hsl(${(x * 7 + y * 3) % 60 + 90} 35% ${(x + y) % 2 ? 22 : 30}%)`; g.fillRect(x * 64, y * 64, 64, 64); } }));
await window.hub.fs.write(`${DIR}/crate.png`, await png2k((g) => { g.fillStyle = '#8a5a2b'; g.fillRect(0, 0, 2048, 2048); g.strokeStyle = '#3b2412'; g.lineWidth = 60; g.strokeRect(30, 30, 1988, 1988); }));
function glb() {
  const W = 32; const Hh = 20; const pos = []; const idx = [];
  for (let j = 0; j <= Hh; j++) for (let i = 0; i <= W; i++) { const u = (i / W) * Math.PI * 2; const v = (j / Hh) * Math.PI; pos.push(Math.cos(u) * Math.sin(v) * 0.5, Math.cos(v) * 0.7 + 0.7, Math.sin(u) * Math.sin(v) * 0.5); }
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const a = j * (W + 1) + i; const b = a + W + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const Pp = new Float32Array(pos); const I = new Uint16Array(idx);
  const parts = [Pp, I]; const views = []; let off = 0; const chunks = [];
  for (const p of parts) { const b = new Uint8Array(p.buffer); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); chunks.push(b, new Uint8Array(pad)); off += b.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
  const json = { asset: { version: '2.0', generator: 'hearth lab240edit check' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'hero' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.95, 0.55, 0.2, 1], metallicFactor: 0.2, roughnessFactor: 0.5 } }],
    buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: Pp.length / 3, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1.4, 0.5] }, { bufferView: 1, componentType: 5123, count: I.length, type: 'SCALAR' }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  return u;
}
await window.hub.fs.write(`${DIR}/hero.glb`, glb());
// a 60 s song at 128 BPM (kicks on the beat), 22.05 kHz mono: the timeline to scrub
{
  const sr = 22050; const secs = 60; const n = secs * sr; const x = new Int16Array(n); const beat = 60 / 128;
  for (let b = 0; b * beat < secs; b++) { const a = Math.round(b * beat * sr); let ph = 0; for (let i = 0; i < 0.18 * sr && a + i < n; i++) { const s = i / sr; ph += (2 * Math.PI * (50 + 110 * Math.exp(-s * 35))) / sr; x[a + i] += Math.round(24000 * Math.sin(ph) * Math.exp(-s * 14)); } }
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, str) => [...str].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  new Int16Array(data.buffer, 44).set(x);
  await window.hub.fs.write(`${DIR}/song.wav`, new Uint8Array(data.buffer));
}

// ---------- the Lab with a docked director and the game scene, playing ----------
if (!H.agents().some((a) => a.dock === 'three' && a.mode === 'native')) {
  H.config.agents.push({ id: 'l240director', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', enabled: true });
  await saveConfig(); await wait(1500);
}
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
const c = await ThreeLab.cmd();
const D = ThreeLab.director;
await wait(600);
const dir = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
Tools.syncDocks?.();
if (dir) {
  Native.newChat(dir.id); await wait(400);
  Native.sendText(dir.id, 'hello');
  await until(() => Native.isAgentBusy(dir.id), 5000);
  await until(() => !Native.isAgentBusy(dir.id), 20000);
  await wait(1200);
}
const GL = `const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200); camera.position.set(0, 5, 11); camera.lookAt(0, 0.5, 0);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });`;
const GAME = `import * as THREE from 'three';
const P = tweak({ fog: { value: 0.03, min: 0, max: 0.1, step: 0.001, label: 'Fog', group: 'World' }, sun: { value: 2.4, min: 0, max: 5, step: 0.01, label: 'Sun', group: 'World' }, crates: { value: 60, min: 10, max: 200, step: 1, label: 'Crates', group: 'World' }, speed: { value: 0.3, min: 0, max: 2, step: 0.01, label: 'Camera speed', group: 'Camera' } });
${GL}
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1320'); scene.fog = new THREE.FogExp2('#0d1320', P.fog);
const gt = refTexture('ground'); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(8, 8); gt.anisotropy = 8;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const sun = new THREE.DirectionalLight('#fff3e0', P.sun); sun.position.set(6, 10, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun, new THREE.HemisphereLight('#9ec5ff', '#3b2a1a', 0.6));
const ct = refTexture('crate'); const crateMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7 }); const boxG = new THREE.BoxGeometry(1, 1, 1);
const crates = new THREE.InstancedMesh(boxG, crateMat, 200); crates.castShadow = true; scene.add(crates);
const m4 = new THREE.Matrix4();
renderer.setAnimationLoop((t) => {
  const s = t / 1000; scene.fog.density = P.fog; sun.intensity = P.sun; crates.count = P.crates;
  for (let i = 0; i < P.crates; i++) { const a = i * 2.39996; const r = 3 + (i % 12); m4.makeTranslation(Math.cos(a) * r, 0.5 + Math.abs(Math.sin(s * 2 + i)) * 0.3, Math.sin(a) * r); crates.setMatrixAt(i, m4); }
  crates.instanceMatrix.needsUpdate = true;
  camera.position.x = Math.sin(s * P.speed) * 6; camera.lookAt(0, 0.5, 0);
  renderer.render(scene, camera);
});`;
const SKY = `import * as THREE from 'three';
const P = tweak({ top: { value: '#1b2a4a', label: 'Top' }, bottom: { value: '#ff8a3d', label: 'Horizon' }, soft: { value: 0.4, min: 0, max: 1, step: 0.01, label: 'Softness' } });
${GL}
const scene = new THREE.Scene();
const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { top: { value: new THREE.Color(P.top) }, bottom: { value: new THREE.Color(P.bottom) }, soft: { value: P.soft } }, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform float soft; varying vec3 vP; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.5 - soft * 0.5, 0.5 + soft * 0.5, h)), 1.0); }' });
scene.add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), mat));
renderer.setAnimationLoop(() => { mat.uniforms.top.value.set(P.top); mat.uniforms.bottom.value.set(P.bottom); mat.uniforms.soft.value = P.soft; renderer.render(scene, camera); });`;
const HUD = `const P = tweak({ size: { value: 18, min: 10, max: 40, step: 1, label: 'Text size' } });
const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:12px;top:8px;font:700 18px system-ui;color:#fff;text-shadow:0 2px 6px #000'; document.body.append(d);
let shown = -1; const f = (t) => { const v = Math.floor(t / 250); if (v !== shown) { shown = v; d.textContent = 'CLINK · ' + v; d.style.fontSize = P.size + 'px'; } requestAnimationFrame(f); }; requestAnimationFrame(f);`;
await D.newSketch('Clink edit fixture (lab240edit)', SKY, 2);
const fixId = ThreeLab.scenes.currentId();
const SIZE = String(window.L240E_SIZE || '320x180').split('x').map(Number);
try { c.customSize(SIZE[0], SIZE[1]); c.size('custom'); } catch { /* the frame size stays */ }
await D.refs.add(`${DIR}/ground.png`, 'ground').catch((err) => fail(`ground texture: ${err.message}`));
await D.refs.add(`${DIR}/crate.png`, 'crate').catch((err) => fail(`crate texture: ${err.message}`));
try { await D.updateLayer(D.layers().layers[0].name, { name: 'Sky' }, 0.3); } catch { /* keeps its name */ }
for (const [name, code] of [['Game', GAME], ['HUD', HUD]]) { try { await D.addLayer({ name, code }, 1); } catch (err) { fail(`layer ${name}: ${err.message}`); } }
try { await Commands.tryRun(`/model add ${DIR}/hero.glb`, H.claudeAgent().id); } catch (err) { fail(`model: ${err.message}`); }
const song = await c.loadSong(`${DIR}/song.wav`);
if (!song?.ok) fail(`the song didn't load: ${JSON.stringify(song)}`);
await until(() => c.player.loaded && c.player.duration > 30, 30000);
await until(() => c.player.analysis, 60000);
if (dir && H.activeChat[dir.id] && typeof ChatScenes !== 'undefined') { ChatScenes.link(H.activeChat[dir.id], fixId, { rename: false }); await wait(300); }
if (ThreeLab.scenes.currentId() !== fixId) { ThreeLab.scenes.open(fixId); await wait(2500); }
c.code?.(false); c.panel?.(true);
try { c.player.play?.(); } catch { /* paused */ }
await wait(3000);
out.numbers.layers = D.layers().layers.map((x) => x.name).join(', ');
try { out.numbers.console = (c.console?.('hide') || []).slice(-6).map((l) => `${l.layer ? `[${l.layer}] ` : ''}${String(l.text).slice(0, 160)}`); } catch { /* no console */ }
// the Game layer selected (its sliders in the panel)
const panelEl = () => [...document.querySelectorAll('.tweaks')].find(shown);
const rowOf = (name) => [...document.querySelectorAll('.ly-row[data-id]')].find((r) => shown(r) && (r.querySelector('.ly-name')?.textContent || '') === name);
const selectRow = async (name) => { const r = rowOf(name); const n = r?.querySelector('.ly-name') || r; if (!n) return false; const b = box(n); await mouse('mousePressed', b.left + 10, b.top + b.height / 2); await mouse('mouseReleased', b.left + 10, b.top + b.height / 2); await wait(600); return true; };
if (!(await selectRow('Game'))) fail('no Game layer row');
try { D.selectLayer?.('Game'); } catch { /* the row click did it */ }
await until(() => panelEl()?.querySelector('.tw-range input[type=range]'), 8000);
out.numbers.panel = { ranges: panelEl()?.querySelectorAll('.tw-range input[type=range]').length || 0, knobs: panelEl()?.querySelectorAll('.tw-knob').length || 0 };

const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(800); } return r; };
// the page side: messages it received by type, frames it drew
const PROBE = `if (!window.__l240e) { const n = {}; addEventListener('message', (e) => { const t = e.data && e.data.type; if (t) n[t] = (n[t] || 0) + 1; }, true); window.__l240e = { n, reset() { for (const k in n) delete n[k]; } }; }`;
const pv = () => sbx(`${PROBE} const s = window.__labPace.state(); return { tick: s.frameTick, fps: s.fps, med: s.med, msgs: { ...window.__l240e.n } }`);
await until(async () => (await pv())?.tick > 20, 30000);
out.numbers.previewStart = await pv();
// the picture plays at full quality during the stretches (the adaptive steps would move the game's own cost between runs)
await sbx('window.__labAdapt?.set?.({ level: 0, hold: true }); return 1');

// ---------- stretches ----------
const segs = [];
let mo = null; let muts = 0; const mutBy = {};
const lbl = (n) => { const e = n?.nodeType === 1 ? n : n?.parentElement; if (!e) return '?'; const cl = typeof e.className === 'string' ? e.className : e.className?.baseVal || ''; return `${e.tagName.toLowerCase()}${cl ? `.${cl.trim().split(/\s+/)[0]}` : ''}`; };
const profIn = String(window.L240E_PROFILE || '').split(',').filter(Boolean);
async function profStart(name) { if (!profIn.includes(name)) return; await cdp('Profiler.enable', {}); await cdp('Profiler.setSamplingInterval', { interval: 200 }); await cdp('Profiler.start', {}); }
async function profStop(name) {
  if (!profIn.includes(name)) return;
  const p = (await cdp('Profiler.stop', {}))?.profile; if (!p) return;
  const byId = new Map(p.nodes.map((n) => [n.id, n])); const parent = new Map(); for (const n of p.nodes) for (const ch of n.children || []) parent.set(ch, n);
  const dt = {}; for (let i = 0; i < p.samples.length; i++) dt[p.samples[i]] = (dt[p.samples[i]] || 0) + (p.timeDeltas[i] || 0);
  const self = {}; const total = {};
  for (const [id, us] of Object.entries(dt)) {
    let n = byId.get(Number(id)); if (/^\((idle|program|root)\)$/.test(n.callFrame.functionName)) continue;
    const k = (x) => `${x.callFrame.functionName || '(anon)'} ${x.callFrame.url.split('/').pop().split('?')[0]}:${x.callFrame.lineNumber + 1}`;
    self[k(n)] = (self[k(n)] || 0) + us / 1000;
    const seen = new Set(); while (n) { if (n.callFrame.url) { const kk = k(n); if (!seen.has(kk)) { seen.add(kk); total[kk] = (total[kk] || 0) + us / 1000; } } n = parent.get(n.id); }
  }
  const t = (o, m) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, m).map(([k, v]) => `${r1(v)}ms ${k}`);
  (out.profile ||= {})[name] = { self: t(self, 20), total: t(total, 25) };
}
// prep: finds / scrolls to what the stretch drives, before it starts (its own layout reads aren't counted)
async function seg(name, fn, prep = null) {
  if (!want(name)) return;
  let ctx = null;
  try { ctx = prep ? await prep() : null; } catch (err) { fail(`${name}: ${String(err.message || err).slice(0, 200)}`); }
  await settle(); await wait(300);
  P.n = {}; P.who = {}; muts = 0; for (const k of Object.keys(mutBy)) delete mutBy[k];
  mo = new MutationObserver((recs) => { muts += recs.length; for (const r of recs) { const k = `${r.type}:${lbl(r.target)}`; mutBy[k] = (mutBy[k] || 0) + 1; } });
  mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  await sbx(`${PROBE} window.__l240e.reset(); return 1`);
  const a = await pv();
  await profStart(name);
  performance.mark(`hz240:${name}`); segs.push(name);
  P.on = true; P.seg = name;
  const t0 = performance.now(); let inputs = 0;
  try { inputs = (await fn(ctx)) || 0; } catch (err) { fail(`${name}: ${String(err.message || err).slice(0, 200)}`); }
  const sec = (performance.now() - t0) / 1000;
  await settle();
  P.on = false; P.seg = '';
  performance.mark('hz240:between');
  await profStop(name);
  mo.disconnect();
  const b = await pv();
  out.stretches[name] = {
    sec: r1(sec), inputs, previewFrames: b && a ? b.tick - a.tick : null, previewMsgs: b?.msgs,
    probes: { ...P.n, mutations: muts }, topMutations: Object.entries(mutBy).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${v} ${k}`),
    ...(WHO ? { who: Object.entries(P.who).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => `${v} ${k}`) } : {}),
  };
  await wait(400);
}
const drag = async (x0, y0, x1, y1, n, opts = {}) => {
  const btn = opts.button || 'left'; const buttons = btn === 'left' ? 1 : btn === 'right' ? 2 : 4;
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x0), y: Math.round(y0), button: btn, buttons, clickCount: 1, modifiers: opts.modifiers || 0 });
  for (let i = 1; i <= n; i++) {
    const k = i / n; const tri = opts.back ? (k <= 0.5 ? k * 2 : (1 - k) * 2) : k;
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x0 + (x1 - x0) * tri), y: Math.round(y0 + (y1 - y0) * tri), button: btn, buttons, modifiers: opts.modifiers || 0 });
    await wait(opts.gap ?? 4);
  }
  const k = opts.back ? 0 : 1;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x0 + (x1 - x0) * k), y: Math.round(y0 + (y1 - y0) * k), button: btn, buttons: 0, clickCount: 1, modifiers: opts.modifiers || 0 });
  return n + 2;
};
await smoke({ trace: 'start', detail: true });

await seg('slider', async (s) => {
  if (!s) { fail(`slider: no slider on screen`); return 0; }
  const b = box(s); let n = 0; const v0 = s.value;
  out.numbers.slider = { label: s.getAttribute('aria-label'), min: s.min, max: s.max, v0 };
  let nIn = 0; const onIn = () => { nIn += 1; }; s.addEventListener('input', onIn);
  for (let k = 0; k < 2; k++) n += await drag(b.left + 6, b.top + b.height / 2, b.right - 6, b.top + b.height / 2, 80, { back: true });
  out.numbers.slider.inputEvents = nIn; s.removeEventListener('input', onIn);
  return n;
}, async () => {
  const ranges = () => [...(panelEl()?.querySelectorAll('.tw-range input[type=range]') || [])];
  const inView = (x) => { const r = box(x); return r.width > 40 && r.top > 0 && r.bottom < innerHeight - 4 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === x; };
  let s = ranges().find(inView);
  if (!s) { for (const x of ranges().slice(0, 3)) { for (let d = x.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true; await reveal(x); if (inView(x)) { s = x; break; } } }
  return s || ranges().find(inView) || null;
});
const inViewN = (x) => { const r = box(x); if (!(r.width > 4 && r.top > 130 && r.bottom < innerHeight - 4)) return false; const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(h) && (h === x || x.contains(h)); };
const findIn = async (sel) => { const all = () => [...(panelEl()?.querySelectorAll(sel) || [])]; let n = all().find(inViewN); if (!n && all()[0]) { await reveal(all()[0]); n = all().find(inViewN); } return n || null; };
await seg('knob', async (kn) => {
  if (!kn) { fail('knob: no knob on screen'); return 0; }
  const b = box(kn); let n = 0;
  for (let k = 0; k < 2; k++) n += await drag(b.left + b.width / 2, b.top + b.height / 2, b.left + b.width / 2, b.top + b.height / 2 - 120, 80, { back: true });
  return n;
}, () => findIn('.tw-knob'));
await seg('scrub', async (nm) => {
  if (!nm) { fail('scrub: no number name on screen'); return 0; }
  const b = box(nm); let n = 0;
  for (let k = 0; k < 2; k++) n += await drag(b.left + 8, b.top + b.height / 2, b.left + 8 + 160, b.top + b.height / 2, 80, { back: true });
  return n;
}, () => findIn('.tw-scrub'));
await seg('layers', async () => {
  // HTML drag and drop, as the browser fires it: dragstart, dragover on what's under the pointer (every move), drop
  let n = 0;
  for (const [from, to] of [['Sky', 'HUD'], ['Sky', 'Game']]) {
    const rows = () => [...document.querySelectorAll('.ly-row[data-id]')].filter(shown);
    const src = rowOf(from); if (!src) { fail(`layers: no ${from} row`); return n; }
    const dt = new DataTransfer();
    const at = (r) => { const b = box(r); return { clientX: b.left + 30, clientY: b.top + b.height / 2 }; };
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt, ...at(src) })); n += 1;
    for (let i = 0; i < 60; i++) {
      const list = rows(); const r = list[Math.min(list.length - 1, Math.floor((i / 60) * list.length))];
      r.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ...at(r) })); n += 1;
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 2)));
    }
    const dst = rowOf(to);
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ...at(dst) }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt, ...at(dst) })); n += 2;
    await wait(500);
  }
  return n;
});
await seg('timeline', async () => {
  const L = H.surfaces.get('tool:three')?.el;
  const cv = [...(L?.querySelectorAll('canvas.mb-timeline') || [])].find((x) => box(x).width > 40);
  if (!cv) { fail('timeline: no timeline canvas'); return 0; }
  const b = box(cv);
  return drag(b.left + 4, b.top + 30, b.right - 4, b.top + 30, 100, { back: true });
});
const pvFrame = () => [...document.querySelectorAll('iframe')].find((x) => /three-sandbox/.test(x.src) && box(x).width > 50);
await seg('orbit', async () => {
  const f = pvFrame(); if (!f) { fail('orbit: no preview'); return 0; }
  const b = box(f); const cx = b.left + b.width / 2; const cy = b.top + b.height / 2;
  let n = await drag(cx - 60, cy, cx + 60, cy + 20, 80, { button: 'right', back: true });
  n += await drag(cx, cy - 20, cx + 40, cy + 20, 60, { button: 'middle', back: true });
  for (let i = 0; i < 30; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(cx), y: Math.round(cy), deltaX: 0, deltaY: i < 15 ? -40 : 40 }); await wait(8); n += 1; }
  await sbx('return 1');
  return n;
});
await seg('typing', async () => {
  c.code(true); await wait(900);
  const ta = [...document.querySelectorAll('.three-split textarea')].find(shown);
  if (!ta) { fail('typing: no code editor'); c.code(false); return 0; }
  ta.focus(); const end = ta.value.length; ta.setSelectionRange(end, end);
  const text = '\n// tuning the crates by hand, a few words at a time\n';
  for (const ch of text) { await cdp('Input.insertText', { text: ch }); await wait(30); }
  for (let i = 0; i < text.length; i++) { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await wait(20); }
  ta.blur();
  const n = text.length * 2;
  await wait(800);
  c.code(false);
  return n;
});
await seg('chat', async () => {
  if (!dir) { fail('chat: no docked director'); return 0; }
  Native.sendText(dir.id, 'long please');
  await until(() => Native.isAgentBusy(dir.id), 5000);
  await until(() => !Native.isAgentBusy(dir.id), 20000);
  return 0;
});
await seg('split', async () => {
  const dv = [...document.querySelectorAll('.tool-dock-divider')].find(shown);
  if (!dv) { fail('split: no dock divider'); return 0; }
  const b = box(dv); let n = 0;
  for (let k = 0; k < 2; k++) n += await drag(b.left + 2, b.top + b.height / 2, b.left - 200, b.top + b.height / 2, 80, { back: true });
  return n;
});
performance.mark('hz240:end');
await settle();
const tr = await smoke({ trace: 'stop', detail: true });
const d = tr.detail || {};
for (const name of segs) {
  const s = d.segments?.[name]; const S = out.stretches[name]; if (!s || !S) continue;
  Object.assign(S, {
    frames: s.frames.n, over4: s.frames.over4, over8: s.frames.over8, worstFrame: s.frames.worst,
    tasksOver4: s.longTasks.over4, longest: s.longTasks.max, cpuMs: s.cpuMs,
    style: `${s.style.n}×${s.style.elements}el ${s.style.ms}ms`, layout: `${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms`,
    forcedN: s.forced.n, forcedOut: s.forced.outsideFrame ?? s.forced.n, forcedInInput: s.forced.inInputJs ?? null, forcedMs: s.forced.ms, forcedTop: s.forced.top, files: s.filesCpu, render: s.render, fired: s.fired,
  });
}
await sbx('window.__labAdapt?.set?.({ level: 0, hold: false }); return 1');
out.numbers.previewEnd = await pv();

// ---------- budgets (counts: steady on a loaded machine; ms loose) ----------
const BUDGET = { forcedPerInput: 0.25, storageWrites: 6, longest: 250, ...(window.L240E_BUDGET || {}) };
out.budgets = BUDGET;
for (const [name, S] of Object.entries(out.stretches)) {
  const inputs = Math.max(1, S.inputs || 0);
  // a forced layout loop: style / layout forced inside script on (most) every input event
  // a forced layout loop: the app's own handlers (pointer / key / drag / input events) asking for style or layout
  // right after a write, on (most) every input. (The browser's own text editing laying out the textarea in a key,
  // a frame's animation-frame step and ResizeObserver steps are the frame's own layout, done once: reported, not counted.)
  if (S.forcedInInput != null && S.forcedInInput / inputs > BUDGET.forcedPerInput) fail(`${name}: ${S.forcedInInput} forced style / layout passes in input handlers for ${inputs} inputs (budget ${BUDGET.forcedPerInput} per input): ${(S.forcedTop || []).slice(0, 2).join(' | ')}`);
  // synchronous storage writes per input: a few per gesture at most (debounced saves)
  const writes = Object.entries(S.probes || {}).filter(([k]) => k === 'localStorage' || k.startsWith('kvSet')).reduce((a, [, v]) => a + v, 0);
  if (name !== 'chat' && writes > BUDGET.storageWrites) fail(`${name}: ${writes} storage writes during the gesture (budget ${BUDGET.storageWrites}): ${JSON.stringify(S.probes)}`);
  if (S.longest != null && S.longest > BUDGET.longest) fail(`${name}: longest task ${S.longest} ms (budget ${BUDGET.longest})`);
}
// typing: the code's highlight is drawn in the frame, never inside a key (where it laid the Lab out again)
{ const t = (out.stretches.typing?.forcedTop || []).filter((x) => / in (keydown|keypress|textInput|input|beforeinput) .*three\.js:\d+:\d+ draw$/.test(x)); if (t.length) fail(`typing: the code editor drew inside a key: ${t.join(' | ')}`); }
// slider moves reach the preview at most once a frame (coalesced), never one message per pointer event
for (const name of ['slider', 'knob', 'scrub']) {
  const S = out.stretches[name]; if (!S?.previewMsgs) continue;
  const tw = S.previewMsgs.tweak || 0;
  if (S.frames && tw > S.frames * 1.2 + 4) fail(`${name}: the preview got ${tw} slider messages over ${S.frames} window frames`);
}
if (window.L240E_REPORT) { out.reportOnly = out.problems; out.problems = []; }
await smoke({ shot: window.L240E_SHOT || `${TMP}/lab240edit.png` });
return JSON.stringify(out, null, 1);
