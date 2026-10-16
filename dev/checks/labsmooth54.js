// The Lab at 240 Hz while the owner works on a game scene with the Three Director (round 54, labsmooth54). A
// throwaway game-like fixture (Clink-like: a textured world, a 🧊 model, instanced props with a 2K texture,
// particles, a sky, a HUD layer, a song) with the director docked, in the owner's look, real input (CDP), one
// timeline trace (dev/trace-stats.js) cut into stretches:
//   stream   a director reply streaming in the docked chat, the Lab on screen (its song playing)
//   edits    director edits landing (three_edit_code's path: updateLayer → the layer hot-swapped in the preview)
//   both     edits landing while a reply streams (what a director turn really is)
//   switch   switching layers (clicks on the Layers list rows)
//   panel    closing / opening the layers & sliders panel
//   code     scrolling the selected layer's code (wheel notches and trackpad deltas)
//   scrub    dragging the playhead across the song and back
// Per stretch: drawn frames whose main-thread work went over 4.2 ms (one 240 Hz frame) / 8.3 ms, the worst frame,
// tasks over 4.2 ms and the longest, style / layout / forced passes, the top scripts, the three longest animation
// frames (LoAF). The preview's picture is held (❚❚ Freeze) except while scrubbing: it runs in this window's process
// with a software GPU here, and its frames would bury the Lab's own work (window.L54_PLAY = 1 keeps it drawing).
// Fails (counts, steady under load) when: a scene still is encoded with toDataURL (it waits for the GPU), the Lab
// makes interval timers per preview message while scrubbing (> 3), the timeline draws inside a layer click, the folded
// code editor is drawn (a forced layout) by an edit, freshen.js touches the Lab before its lazy group is in; and on a
// loose wall-ms budget for a director edit's longest task. window.L54_REPORT = 1 reports without failing,
// window.L54_BUDGET overrides, window.L54_ONLY = 'stream,code' runs some stretches, window.L54_PROFILE = 'edits' adds
// a JS profile of a stretch (self time, and the browser's own calls by caller).
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/labsmooth54.js
const { wait, until } = M;
const out = { numbers: {}, problems: [] };
const fail = (m) => out.problems.push(m);
const only = String(window.L54_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const DIR = '/tmp/hearth-labsmooth54';
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const click = async (x, y) => { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
let inflight = [];
const wheel = (x, y, dy) => { inflight.push(cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: 0, deltaY: dy })); };
const drain = async () => { const all = inflight; inflight = []; await Promise.race([Promise.all(all), wait(30000)]); };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const mid = (n) => { const r = n.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 120), r.top + r.height / 2]; };

// ---------- the lazy manifest's early touch (before anything opens the Lab) ----------
out.numbers.earlyLabTouches = (window.Lazy?.misses?.() || []).filter((m) => m.group === 'lab' && /freshen/.test(m.where || '')).length;
if (out.numbers.earlyLabTouches) fail(`freshen.js touched the Lab's globals before the lab group loaded (${out.numbers.earlyLabTouches}×)`);

H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);

// ---------- fixtures: a 2K ground texture, a 2K crate texture, a model, a song ----------
const png2k = async (paint) => { const c = new OffscreenCanvas(2048, 2048); const g = c.getContext('2d'); paint(g); return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
await window.hub.fs.write(`${DIR}/ground.png`, await png2k((g) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = `hsl(${(x * 7 + y * 3) % 60 + 90} 35% ${(x + y) % 2 ? 22 : 30}%)`; g.fillRect(x * 64, y * 64, 64, 64); } }));
await window.hub.fs.write(`${DIR}/crate.png`, await png2k((g) => { g.fillStyle = '#8a5a2b'; g.fillRect(0, 0, 2048, 2048); g.strokeStyle = '#3b2412'; g.lineWidth = 60; g.strokeRect(30, 30, 1988, 1988); g.beginPath(); g.moveTo(0, 0); g.lineTo(2048, 2048); g.moveTo(2048, 0); g.lineTo(0, 2048); g.stroke(); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${(i % 7) / 40})`; g.fillRect((i * 97) % 2048, (i * 53) % 2048, 120, 6); } }));
// a GLB: a UV sphere-ish "player" (≈ 2k vertices) with a bounce clip
function glb() {
  const W = 48; const Hh = 32; const pos = []; const idx = [];
  for (let j = 0; j <= Hh; j++) for (let i = 0; i <= W; i++) { const u = (i / W) * Math.PI * 2; const v = (j / Hh) * Math.PI; pos.push(Math.cos(u) * Math.sin(v) * 0.5, Math.cos(v) * 0.7 + 0.7, Math.sin(u) * Math.sin(v) * 0.5); }
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const a = j * (W + 1) + i; const b = a + W + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const P = new Float32Array(pos); const I = new Uint16Array(idx); const T = new Float32Array([0, 0.5, 1]); const TR = new Float32Array([0, 0, 0, 0, 0.4, 0, 0, 0, 0]);
  const parts = [P, I, T, TR]; const views = []; let off = 0; const chunks = [];
  for (const p of parts) { const b = new Uint8Array(p.buffer); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); chunks.push(b, new Uint8Array(pad)); off += b.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.length; }
  const json = { asset: { version: '2.0', generator: 'hearth labsmooth54 check' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'hero' }],
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
// a 90 s song at 128 BPM (kicks on the beat), 22.05 kHz mono
{
  const sr = 22050; const secs = 90; const n = secs * sr; const x = new Int16Array(n); const beat = 60 / 128;
  for (let b = 0; b * beat < secs; b++) { const a = Math.round(b * beat * sr); let ph = 0; for (let i = 0; i < 0.18 * sr && a + i < n; i++) { const s = i / sr; ph += (2 * Math.PI * (50 + 110 * Math.exp(-s * 35))) / sr; x[a + i] += Math.round(24000 * Math.sin(ph) * Math.exp(-s * 14)); } }
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  new Int16Array(data.buffer, 44).set(x);
  await window.hub.fs.write(`${DIR}/song.wav`, new Uint8Array(data.buffer));
}

// ---------- the Lab with a docked director and the game scene ----------
if (!H.agents().some((a) => a.dock === 'three' && a.mode === 'native')) {
  H.config.agents.push({ id: 'l54director', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', enabled: true });
  await saveConfig(); await wait(1500);
}
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
const c = await ThreeLab.cmd();
const D = ThreeLab.director;
await wait(600);
// the director chat first (its first turn gives it a scene of its own; the fixture is then linked to it)
const dir = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
Tools.syncDocks?.();
if (dir) {
  Native.newChat(dir.id); await wait(400);
  Native.sendText(dir.id, 'hello');
  await until(() => Native.isAgentBusy(dir.id), 5000);
  await until(() => !Native.isAgentBusy(dir.id), 20000);
  await wait(1500);
}
const GL = `const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200); camera.position.set(0, 4, 9); camera.lookAt(0, 0.5, 0);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });`;
const WORLD = `import * as THREE from 'three';
const P = tweak({ fog: { value: 0.035, min: 0, max: 0.1, step: 0.001, label: 'Fog' }, sun: { value: 2.2, min: 0, max: 5, step: 0.01, label: 'Sun' }, tile: { value: 8, min: 1, max: 32, step: 1, label: 'Tiling' } });
${GL}
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1320'); scene.fog = new THREE.FogExp2('#0d1320', P.fog);
const tex = refTexture('ground'); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(P.tile, P.tile); tex.anisotropy = 8;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const sun = new THREE.DirectionalLight('#fff3e0', P.sun); sun.position.set(6, 10, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun, new THREE.HemisphereLight('#9ec5ff', '#3b2a1a', 0.6));
const walls = new THREE.Group(); for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1 + (i % 4), 1), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.08 + i / 80, 0.5, 0.45) })); m.position.set(Math.cos(i / 24 * Math.PI * 2) * 14, 0.5 + (i % 4) / 2, Math.sin(i / 24 * Math.PI * 2) * 14); m.castShadow = true; walls.add(m); } scene.add(walls);
renderer.setAnimationLoop(() => { scene.fog.density = P.fog; sun.intensity = P.sun; camera.position.x = Math.sin(audio.time * 0.2) * 9; camera.lookAt(0, 0.5, 0); renderer.render(scene, camera); });`;
const PROPS = (v) => `import * as THREE from 'three';
const P = tweak({ count: { value: 160, min: 10, max: 400, step: 1, label: 'Crates' }, spin: { value: ${v}, min: 0, max: 3, step: 0.01, label: 'Spin' }, bounce: { value: 0.6, min: 0, max: 2, step: 0.01, label: 'Bounce' } });
${GL}
const scene = new THREE.Scene(); scene.add(new THREE.AmbientLight('#ffffff', 0.5)); const key = new THREE.DirectionalLight('#ffe2b8', 2); key.position.set(3, 8, 5); scene.add(key);
const tex = refTexture('crate'); tex.anisotropy = 8;
const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), 400); scene.add(crates);
const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const p = new THREE.Vector3(); const s = new THREE.Vector3(1, 1, 1);
renderer.setAnimationLoop(() => { const t = audio.time; crates.count = P.count;
  for (let i = 0; i < P.count; i++) { const a = i * 2.39996; const r = 2 + (i % 20) * 0.5; e.set(t * P.spin + i, t * P.spin * 0.7, 0); q.setFromEuler(e); p.set(Math.cos(a) * r, 0.3 + Math.abs(Math.sin(t * 2 + i)) * P.bounce * audio.bass, Math.sin(a) * r); m.compose(p, q, s); crates.setMatrixAt(i, m); }
  crates.instanceMatrix.needsUpdate = true; renderer.render(scene, camera); });`;
const FX = `import * as THREE from 'three';
const P = tweak({ size: { value: 0.06, min: 0.01, max: 0.3, step: 0.001, label: 'Size' }, color: { value: '#ffb36b', label: 'Sparks' } });
${GL}
const scene = new THREE.Scene(); const N = 6000; const g = new THREE.BufferGeometry(); const a = new Float32Array(N * 3);
for (let i = 0; i < N; i++) { a[i * 3] = (Math.random() - 0.5) * 30; a[i * 3 + 1] = Math.random() * 8; a[i * 3 + 2] = (Math.random() - 0.5) * 30; }
g.setAttribute('position', new THREE.BufferAttribute(a, 3));
const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: P.size, color: P.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(pts);
renderer.setAnimationLoop(() => { pts.rotation.y = audio.time * 0.05; pts.material.size = P.size * (1 + audio.level); pts.material.color.set(P.color); renderer.render(scene, camera); });`;
const SKY = `import * as THREE from 'three';
const P = tweak({ top: { value: '#1b2a4a', label: 'Top' }, bottom: { value: '#ff8a3d', label: 'Horizon' } });
${GL}
const scene = new THREE.Scene();
const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { top: { value: new THREE.Color(P.top) }, bottom: { value: new THREE.Color(P.bottom) } }, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.35, 0.8, h)), 1.0); }' });
scene.add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), mat));
renderer.setAnimationLoop(() => { mat.uniforms.top.value.set(P.top); mat.uniforms.bottom.value.set(P.bottom); renderer.render(scene, camera); });`;
const HUD = `const P = tweak({ score: { value: 0, min: 0, max: 9999, step: 1, label: 'Score' } });
const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:16px;top:12px;font:700 22px system-ui;color:#fff;text-shadow:0 2px 6px #000'; document.body.append(d);
let shown = -1; requestAnimationFrame(function f() { const v = Math.round(P.score + audio.time * 10); if (v !== shown) { shown = v; d.textContent = 'CLINK · ' + v; } requestAnimationFrame(f); });`;

await D.newSketch('Clink fixture (labsmooth54)', SKY, 2);
const fixId = ThreeLab.scenes.currentId();
try { c.customSize(480, 270); c.size('custom'); } catch { /* the frame size stays */ }
await D.refs.add(`${DIR}/ground.png`, 'ground').catch((err) => fail(`ground texture: ${err.message}`));
await D.refs.add(`${DIR}/crate.png`, 'crate').catch((err) => fail(`crate texture: ${err.message}`));
try { await D.updateLayer(D.layers().layers[0].name, { name: 'Sky' }, 0.3); } catch { /* keeps its name */ }
for (const [name, code] of [['World', WORLD], ['Props', PROPS(0.8)], ['FX', FX], ['HUD', HUD]]) { try { await D.addLayer({ name, code }, 1); } catch (err) { fail(`layer ${name}: ${err.message}`); } }
try { await Commands.tryRun(`/model add ${DIR}/hero.glb`, H.claudeAgent().id); } catch (err) { fail(`model: ${err.message}`); }
const r0 = await c.loadSong(`${DIR}/song.wav`);
if (!r0?.ok) fail(`the song didn't load: ${JSON.stringify(r0)}`);
await until(() => c.player.loaded && c.player.duration > 60, 30000);
await until(() => c.player.analysis, 60000);
await wait(2500);
const names = D.layers().layers.map((x) => x.name);
out.numbers.layers = names.join(', ');
c.code?.(false); c.panel?.(true);
await wait(1500);
// the docked director chat owns the fixture (each director chat has its own scene: chat-scenes.js)
if (dir && H.activeChat[dir.id]) { ChatScenes.link(H.activeChat[dir.id], fixId, { rename: false }); await wait(300); }
if (ThreeLab.scenes.currentId() !== fixId) { ThreeLab.scenes.open(fixId); await wait(2500); }
out.numbers.sceneOnScreen = ThreeLab.scenes.currentId() === fixId;
if (!out.numbers.sceneOnScreen) fail('the fixture scene is not the one on screen');
try { c.player.play?.(); } catch { /* paused */ }
// The preview runs in this window's process (its page is a sandboxed frame), and here it draws with a software GPU:
// playing, its own frames (several hundred ms each here) bury what the Lab's window does around them. The picture
// is held (❚❚ Freeze: the song, the timeline and the edits go on) so the stretches count the Lab's own work, as on a
// Mac / PC whose GPU draws the scene (the preview's GPU side has its own check: lab240gpu). window.L54_PLAY = 1 keeps
// it drawing.
if (!window.L54_PLAY) { try { c.freeze(true); } catch { /* an older Lab */ } }
out.numbers.previewHeld = !window.L54_PLAY;
await wait(2500);

// ---------- the stretches ----------
const segs = [];
// the three longest animation frames of each stretch, with what ran in them (Long Animation Frames API: names the
// script, its forced style / layout, and the frame's own style / layout after it)
const loafs = []; let loafPo = null;
try { loafPo = new PerformanceObserver((l) => loafs.push(...l.getEntries())); loafPo.observe({ type: 'long-animation-frame', buffered: false }); } catch { /* no LoAF */ }
const r1 = (x) => Math.round(x * 10) / 10;
const loafTop = (from, to) => loafs.filter((f) => f.startTime >= from && f.startTime < to).sort((a, b) => b.duration - a.duration).slice(0, 3).map((f) => ({
  ms: r1(f.duration), block: r1(f.blockingDuration), styleLayout: r1(f.styleAndLayoutStart ? f.startTime + f.duration - f.styleAndLayoutStart : 0),
  scripts: (f.scripts || []).sort((a, b) => b.duration - a.duration).slice(0, 3).map((x) => `${r1(x.duration)}ms${x.forcedStyleAndLayoutDuration ? ` (forced ${r1(x.forcedStyleAndLayoutDuration)})` : ''} ${(x.invoker || '').slice(0, 50)} @${(x.sourceURL || '').split('/').pop()}:${x.sourceCharPosition}${x.sourceFunctionName ? ` ${x.sourceFunctionName}` : ''}`),
}));
out.loaf = {};
// window.L54_PROFILE = 'scrub': a JS sampling profile of that stretch (self time per function)
const profIn = String(window.L54_PROFILE || '').split(',').filter(Boolean);
const profStart = async (name) => { if (!profIn.includes(name)) return; await cdp('Profiler.enable', {}); await cdp('Profiler.setSamplingInterval', { interval: 200 }); await cdp('Profiler.start', {}); };
const profStop = async (name) => {
  if (!profIn.includes(name)) return;
  const p = (await cdp('Profiler.stop', {}))?.profile; if (!p) return;
  const self = {}; const dt = {}; const byId = new Map(p.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < p.samples.length; i++) dt[p.samples[i]] = (dt[p.samples[i]] || 0) + (p.timeDeltas[i] || 0);
  for (const [id, us] of Object.entries(dt)) { const n = byId.get(Number(id)); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; self[k] = (self[k] || 0) + us / 1000; }
  // the browser's own functions (timers, canvas, layout reads) by who called them
  const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n);
  const by = {};
  for (const [id, us] of Object.entries(dt)) { const n = byId.get(Number(id)); if (n.callFrame.url) continue; const pa = parent.get(n.id); if (!pa?.callFrame.url) continue; const k = `${n.callFrame.functionName} ← ${pa.callFrame.functionName || '(anon)'} ${pa.callFrame.url.split('/').pop()}:${pa.callFrame.lineNumber + 1}`; by[k] = (by[k] || 0) + us / 1000; }
  (out.profileNative ||= {})[name] = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${Math.round(v * 10) / 10}ms ${k}`);
  (out.profile ||= {})[name] = Object.entries(self).filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${Math.round(v * 10) / 10}ms ${k}`);
};
const seg = async (name, fn) => { if (!want(name)) return; await settle(); await profStart(name); performance.mark(`hz240:${name}`); segs.push(name); segNow = name; const t0 = performance.now(); try { await fn(); } catch (err) { fail(`${name}: ${String(err.message || err).slice(0, 200)}`); } await profStop(name); out.numbers[`${name}Sec`] = Math.round((performance.now() - t0) / 100) / 10; await settle(); out.loaf[name] = loafTop(t0, performance.now()); segNow = ''; performance.mark('hz240:between'); await wait(300); };
const streamTurn = async (text, ms = 14000) => {
  if (!dir) { fail('no docked director'); return; }
  Native.sendText(dir.id, text);
  await until(() => Native.isAgentBusy(dir.id), 5000);
  await until(() => !Native.isAgentBusy(dir.id), ms);
};
const edits = async (n, gap = 700) => { for (let i = 0; i < n; i++) { await D.updateLayer('Props', { code: PROPS(0.8 + (i + 1) / 10) }, 0); await wait(gap); } };

// probes (counts, steady on a loaded machine): who encodes a canvas synchronously (toDataURL waits for the GPU) and who
// starts interval timers, per stretch
const calls = { toDataURL: {}, setInterval: {} };
let segNow = '';
const callerOf = () => { const st = String(new Error().stack || '').split('\n').slice(2); const f = st.find((l) => !/labsmooth54|<anonymous>|smooth-lib/.test(l)) || ''; const m = /([\w.-]+\.(?:js|html)):\d+/.exec(f); return m ? m[1] : '?'; };
const note = (kind) => { if (!segNow) return; const k = `${segNow} ${callerOf()}`; calls[kind][k] = (calls[kind][k] || 0) + 1; };
const toDataURL0 = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function (...a) { note('toDataURL'); return toDataURL0.apply(this, a); };
const setInterval0 = window.setInterval;
window.setInterval = function (...a) { note('setInterval'); return setInterval0.apply(this, a); };
await smoke({ trace: 'start', detail: true });
await seg('stream', () => streamTurn('long please'));
await seg('edits', () => edits(6));
await seg('both', () => Promise.all([streamTurn('long please'), wait(500).then(() => edits(5, 900))]));
await seg('switch', async () => {
  for (let i = 0; i < 12; i++) {
    const rows = [...document.querySelectorAll('.ly-row[data-id]')].filter((r) => r.getBoundingClientRect().height > 0);
    const row = rows[i % rows.length]; if (!row) break;
    const nm = row.querySelector('.ly-name') || row; const [x, y] = mid(nm);
    await click(x, y); await wait(260);
  }
});
await seg('panel', async () => {
  for (let i = 0; i < 4; i++) {
    const b = [...document.querySelectorAll('button')].find((x) => x.dataset.feature === 'Layers & sliders' && x.getBoundingClientRect().width);
    if (b) { await click(...mid(b)); } else c.panel();
    await wait(700);
  }
});
await seg('code', async () => {
  const props = [...document.querySelectorAll('.ly-row[data-id]')].find((r) => /Props/.test(r.textContent));
  if (props) { await click(...mid(props.querySelector('.ly-name') || props)); await wait(300); }
  c.code(true); await wait(900);
  const sc = [...document.querySelectorAll('.three-split .code-editor, .three-split .ce-scroll, .three-split textarea, .three-split .cm-scroller')].find((n) => n.getBoundingClientRect().height > 40 && n.scrollHeight > n.clientHeight);
  const host = sc || document.querySelector('.three-split');
  out.numbers.codeScroller = sc ? `${sc.className || sc.tagName} ${sc.scrollHeight}/${sc.clientHeight}` : 'none';
  const [x, y] = mid(host);
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 20; i++) { wheel(x, y, 100); await wait(8); } await drain();
    for (let i = 0; i < 60; i++) { wheel(x, y, -10 * (0.6 + 0.4 * Math.sin(i / 6))); await wait(4); } await drain();
  }
  c.code(false);
});
await seg('scrub', async () => {
  try { c.player.pause?.(); } catch { /* playing */ }
  if (!window.L54_PLAY) { try { c.freeze(false); } catch { /* an older Lab */ } await wait(300); } // (a scrub shows each spot: the picture follows the playhead again)
  const L = H.surfaces.get('tool:three')?.el;
  const canvas = [...(L?.querySelectorAll('canvas.mb-timeline') || [])].find((x) => x.getBoundingClientRect().width > 40);
  if (!canvas) { fail('scrub: no timeline canvas'); return; }
  const r = canvas.getBoundingClientRect(); const y = r.top + 30;
  await mouse('mousePressed', r.left + 4, y);
  for (let i = 0; i <= 100; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(r.left + 4 + (r.width - 8) * (i <= 50 ? i / 50 : (100 - i) / 50)), y: Math.round(y), button: 'left', buttons: 1 }); await wait(4); }
  await mouse('mouseReleased', r.left + 4, y);
});
performance.mark('hz240:end');
await settle();
const tr = await smoke({ trace: 'stop', detail: true });
const d = tr.detail || {};
const S = {};
for (const name of segs) {
  const s = d.segments?.[name]; if (!s) continue;
  S[name] = {
    frames: s.frames.n, over4: s.frames.over4, over8: s.frames.over8, worstFrame: s.frames.worst,
    tasksOver4: s.longTasks.over4, longest: s.longTasks.max, cpuMs: s.cpuMs,
    style: `${s.style.n}×${s.style.elements}el ${s.style.ms}ms`, layout: `${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms`, forced: `${s.forced.n}/${s.forced.ms}ms`,
    scripts: s.scripts, forcedTop: s.forced.top, files: s.filesCpu,
  };
}
out.stretches = S;
out.whole = { frames: d.frames, tasks: d.tasks };
try { out.numbers.edited = /spin: \{ value: 1\.[0-9]/.test(D.codeOf('Props').code || ''); } catch (err) { fail(`after: ${err.message}`); }

HTMLCanvasElement.prototype.toDataURL = toDataURL0; window.setInterval = setInterval0;
out.calls = calls;
// ---------- what was fixed stays fixed (counts) ----------
const n = (kind, re) => Object.entries(calls[kind]).filter(([k]) => re.test(k)).reduce((a, [, v]) => a + v, 0);
// a scene still for the chats list / the sketches: encoded off the main thread, never toDataURL (≈ 200 ms waits for the GPU)
const syncShots = n('toDataURL', /(chat-scenes|three)\.js$/);
if (syncShots) fail(`scene stills encoded with toDataURL during director edits / layer work: ${syncShots}`);
// the key-follow timer isn't made again for every preview message while scrubbing a layer with no keyframes
const keyTimers = n('setInterval', /^scrub three\.js$/);
out.numbers.keyTimersWhileScrubbing = keyTimers;
if (keyTimers > 3) fail(`scrub: the Lab made ${keyTimers} interval timers (budget 3)`);
// a layer switch doesn't draw the timeline inside the click (its canvas font asked for the whole Lab's layout there)
const clickDraw = (S.switch?.forcedTop || []).filter((x) => /in (click|pointerup|pointerdown) .*drawTime/.test(x));
if (clickDraw.length) fail(`switch: the timeline drew inside the click: ${clickDraw.join(' | ')}`);
// a director edit with the code folded away doesn't lay the Lab out for the hidden editor
for (const k of ['edits', 'both']) { const ed = (S[k]?.forcedTop || []).filter((x) => /three\.js:\d+:\d+ draw$/.test(x)); if (ed.length) fail(`${k}: the folded code editor was drawn (forced layout): ${ed.join(' | ')}`); }
// ---------- budgets: drawn frames over 4.2 ms per stretch (counts) and the longest task ----------
// (wall ms: loose, this machine's load moves them; a director edit's longest task was 360–690 ms before this round
// (a scene still encoded on the GPU's time), 56–62 ms after)
const BUDGET = window.L54_BUDGET || { edits: { longest: 200 } };
out.budgets = BUDGET;
if (BUDGET) for (const [name, s] of Object.entries(S)) {
  const b = BUDGET[name]; if (!b) continue;
  if (b.over4 != null && s.over4 > b.over4) fail(`${name}: ${s.over4} frames over 4.2 ms (budget ${b.over4})`);
  if (b.longest != null && s.longest > b.longest) fail(`${name}: longest task ${s.longest} ms (budget ${b.longest})`);
}
if (window.L54_REPORT) { out.reportOnly = out.problems; out.problems = []; }
await smoke({ shot: window.L54_SHOT || '/tmp/labsmooth54.png' });
return JSON.stringify(out, null, 1);
