// ▶ Play's frame rate with round 54's page scripts (round 54 fix, gamefps54): the owner's "play does look best but the
// framerate is abysmal". A throwaway HTML game that works like a real one: 160 boxes, a sun, a spot and a point light
// casting shadows (left at three's 512²), 6 projectiles a frame (each with its own cloned material, gone after 0.8 s),
// a spark group every 3rd frame, a decal showing a live data texture every 4th, a DataTexture and a CanvasTexture
// rewritten every frame, 2000 particles moved every frame, one file fetched once playing. Played through GameMode.play:
//   off      round 53's ▶ Play: no look, Loads during play off, no sound part (the baseline)
//   best     as it ships (Best look + Loads during play + the sound part), twice, alternating with off
//   look / stream / audio   each alone once (what each costs, for the report)
// Per frame inside the page: the main thread's frame (the game's callback), the time spent AROUND three's own render
// (what wraps renderer.render: the call minus scene.onBeforeRender → onAfterRender), the gaps between frames.
// Fails on the regression: Best's own work per frame over 2 % of the frame (0.1 ms floor: the page's clock is coarse),
// the steady per-frame objects held / hidden / compiled by Loads during play, a whole-scene look during
// play, shadow maps over 2048² (a point light over 1024²), frames slower than off.
//   node dev/smoke.js --check-timeout 900000 --screen 960x600 --script dev/checks/gamefps54.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], runs: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 6 min`)), 360000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const DIR = '/tmp/hearth-gamefps54';
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
const GW = () => window.hub.game;
const ev = async (code) => { const r = await GW().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

const GAME = `<!doctype html><html><head><meta charset="utf-8"><title>Frame rate test (Hearth)</title>
<style>html, body { margin: 0; height: 100%; overflow: hidden; background: #000; } canvas { display: block; }</style>
<script type="importmap">{ "imports": { "three": "./lib/three.module.js" } }</script></head><body>
<script type="module">
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1a2030'); scene.matrixWorldAutoUpdate = false; // (updated by the loop itself: three's work outside onBefore → onAfterRender stays tiny)
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200); camera.position.set(0, 9, 18); camera.lookAt(0, 0, 0);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
// a level: ground with a picture, 160 boxes on 8 materials, a sun, a spot and a point light casting shadows
const cv = document.createElement('canvas'); cv.width = cv.height = 256; const cg = cv.getContext('2d');
for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { cg.fillStyle = (i + j) % 2 ? '#c0b090' : '#504030'; cg.fillRect(i * 32, j * 32, 32, 32); }
const gt = new THREE.CanvasTexture(cv); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(8, 8);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const mats = Array.from({ length: 8 }, (_, i) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 8, 0.6, 0.5), roughness: 0.5 }));
const boxGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(boxGeo, mats[i % 8]); m.position.set((i % 20) * 2 - 19, 0.4 + (i % 3) * 0.3, Math.floor(i / 20) * 2 - 19); m.castShadow = m.receiveShadow = true; scene.add(m); }
scene.add(new THREE.AmbientLight('#ffffff', 0.3));
const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(10, 20, 8); sun.castShadow = true; Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 }); scene.add(sun);
const spot = new THREE.SpotLight('#ffd0a0', 30, 40, 0.6, 0.3); spot.position.set(-8, 12, 6); spot.castShadow = true; scene.add(spot);
const point = new THREE.PointLight('#80c0ff', 40, 30); point.position.set(4, 4, 2); point.castShadow = true; scene.add(point);
// a data texture rewritten every frame (a minimap / heat map), a canvas texture redrawn every frame (a HUD label)
const DW = 128; const dd = new Uint8Array(DW * DW * 4); const dataTex = new THREE.DataTexture(dd, DW, DW); dataTex.needsUpdate = true;
const dataPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: dataTex })); dataPlane.position.set(-8, 4, 0); scene.add(dataPlane);
const hc = document.createElement('canvas'); hc.width = 256; hc.height = 64; const hg = hc.getContext('2d'); const hud = new THREE.CanvasTexture(hc);
const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: hud })); label.scale.set(4, 1, 1); label.position.set(0, 6, 0); scene.add(label);
// particles: positions rewritten every frame
const PN = 2000; const pp = new Float32Array(PN * 3); const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
const parts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.08, color: '#ffcc66' })); scene.add(parts);
// projectiles: 6 a frame, each its own material (a fading colour), gone after 0.8 s; a spark group (a parent + 2 meshes)
// every 3rd frame; a decal showing the live data texture every 4th frame
const bulletGeo = new THREE.SphereGeometry(0.12, 8, 6); const bulletBase = new THREE.MeshStandardMaterial({ color: '#ffee88', emissive: '#ff8800', transparent: true });
const sparkGeo = new THREE.TetrahedronGeometry(0.15); const sparkMat = new THREE.MeshBasicMaterial({ color: '#ff6633' });
const live = [];
setTimeout(() => fetch('./lib/three.core.js').catch(() => {}), 2500); // (a sound / data file loaded once playing)
const G = window.game = { THREE, renderer, scene, camera, sun, spot, point, cpu: [], gaps: [], over: [], calls: [], frames: 0, spawned: 0, live };
// (the cost around three's own render: what wraps renderer.render, measured as the call minus scene.onBefore→onAfterRender)
let in0 = 0; let inMs = 0; scene.onBeforeRender = () => { in0 = performance.now(); }; scene.onAfterRender = () => { inMs = performance.now() - in0; };
let n = 0; let lastT = 0;
renderer.setAnimationLoop((t) => {
  const a = performance.now();
  if (lastT) G.gaps.push(t - lastT); lastT = t; if (G.gaps.length > 4000) G.gaps.splice(0, 2000);
  n++;
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(bulletGeo, bulletBase.clone()); m.material.color.setHSL(Math.random(), 0.8, 0.6); m.position.set((Math.random() - 0.5) * 30, 1 + Math.random() * 3, (Math.random() - 0.5) * 30); m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4); m.userData.t = t; m.castShadow = true; scene.add(m); live.push(m); G.spawned++; }
  if (n % 3 === 0) { const g = new THREE.Group(); g.add(new THREE.Mesh(sparkGeo, sparkMat), new THREE.Mesh(sparkGeo, sparkMat)); g.children[1].position.x = 0.3; g.position.set((Math.random() - 0.5) * 20, 2, (Math.random() - 0.5) * 20); g.userData.t = t; g.userData.v = new THREE.Vector3(0, 0.05, 0); scene.add(g); live.push(g); }
  if (n % 4 === 0) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: dataTex })); d.position.set((Math.random() - 0.5) * 20, 0.05, (Math.random() - 0.5) * 20); d.rotation.x = -Math.PI / 2; d.userData.t = t; d.userData.v = new THREE.Vector3(); scene.add(d); live.push(d); }
  for (let i = live.length - 1; i >= 0; i--) { const o = live[i]; o.position.add(o.userData.v); if (t - o.userData.t > 800) { scene.remove(o); o.traverse((x) => { if (x.isMesh && x.material !== sparkMat) { x.material.dispose(); if (x.geometry !== bulletGeo && x.geometry !== sparkGeo) x.geometry.dispose(); } }); live.splice(i, 1); } }
  for (let i = 0; i < dd.length; i += 4) { dd[i] = (i + n * 7) & 255; dd[i + 1] = (i >> 7) & 255; dd[i + 2] = n & 255; dd[i + 3] = 255; } dataTex.needsUpdate = true;
  hg.fillStyle = '#000a'; hg.fillRect(0, 0, 256, 64); hg.fillStyle = '#fff'; hg.font = '28px sans-serif'; hg.fillText('score ' + n, 12, 42); hud.needsUpdate = true;
  for (let i = 0; i < PN; i++) { pp[i * 3] = Math.sin(i + t / 900) * 15; pp[i * 3 + 1] = 1 + ((i * 13 + t / 20) % 60) / 10; pp[i * 3 + 2] = Math.cos(i * 1.3 + t / 1100) * 15; } pg.attributes.position.needsUpdate = true;
  point.position.x = Math.sin(t / 700) * 6;
  scene.updateMatrixWorld(); const r0 = performance.now(); inMs = 0; renderer.render(scene, camera); G.over.push(performance.now() - r0 - inMs); if (G.over.length > 4000) G.over.splice(0, 2000);
  G.calls.push(renderer.info.render.calls); if (G.calls.length > 4000) G.calls.splice(0, 2000);
  G.cpu.push(performance.now() - a); if (G.cpu.length > 4000) G.cpu.splice(0, 2000);
  G.frames++;
});
</script></body></html>`;

// a steady window of play: 2.5 s in (Loads during play is on, the look's guard has decided), then 6 s measured
const MEASURE = `(async () => {
  const G = window.game;
  const L0 = window.__gameLook ? await window.__gameLook.settle() : null;
  const S0 = window.__gameStream ? window.__gameStream.report(0) : null;
  G.cpu.length = 0; G.over.length = 0; G.gaps.length = 0; G.calls.length = 0; const f0 = G.frames; const s0 = G.spawned;
  await new Promise((r) => setTimeout(r, 6000));
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(3) : null; };
  const mean = (a) => { const s = a.slice().sort((x, y) => x - y).slice(0, Math.max(1, Math.ceil(a.length * 0.95))); return +(s.reduce((x, y) => x + y, 0) / Math.max(1, s.length)).toFixed(4); }; // (the slowest 5 % left out: a garbage collection lands in any variant)
  const L = window.__gameLook ? window.__gameLook.report() : null; const S = window.__gameStream ? window.__gameStream.report(0) : null;
  return JSON.stringify({ frames: G.frames - f0, spawned: G.spawned - s0, cpu50: q(G.cpu, 0.5), cpu95: q(G.cpu, 0.95), overMean: mean(G.over), over50: q(G.over, 0.5), over95: q(G.over, 0.95), gap50: q(G.gaps, 0.5), gap95: q(G.gaps, 0.95), calls: mean(G.calls), live: G.live.length,
    shadows: { sun: G.sun.shadow.mapSize.x, spot: G.spot.shadow.mapSize.x, point: G.point.shadow.mapSize.x },
    look: L && { guard: L.guard, steps: L.guardMs && L.guardMs.steps, shadows: L.shadows, cost: L.cost, sweepsInWindow: L.cost.sweeps - (L0 ? L0.cost.sweeps : 0), wholesInWindow: L.cost.wholes == null ? null : L.cost.wholes - (L0 ? L0.cost.wholes : 0), screen: L.screen },
    stream: S && { on: S.on, active: S.activeAt != null, holdsInWindow: S.holds.n - (S0 ? S0.holds.n : 0), holds: S.holds, uploads: S.uploads, slices: S.slices, objects: S.loads.filter((l) => l.kind === 'object').length },
    audio: Boolean(window.__gameAudio) });
})()`;

await Lazy.load('gamemode');
const FILE = `${DIR}/index.html`;
const src = { kind: 'html', path: FILE, title: 'Frame rate test' };
const SET = { off: { look: 'off', stream: false, audio: false }, best: { look: 'best', stream: true, audio: true }, look: { look: 'best', stream: false, audio: false }, stream: { look: 'off', stream: true, audio: false }, audio: { look: 'off', stream: false, audio: true } };
async function play(label) {
  const c = SET[label.replace(/\d$/, '')];
  store.set('gamemode.look', c.look); localStorage.setItem('gamestream.test', JSON.stringify({ off: !c.stream })); store.set('gameaudio.off', !c.audio);
  await GameMode.play(src);
  await until(async () => (await GW().state())?.playing, 60000);
  await until(() => ev('Boolean(window.game && window.game.frames > 10 && (!window.__gameReady || JSON.parse(window.__gameReady.pub()).phase === "playing"))'), 120000);
  await wait(2500);
  const m = JSON.parse(await ev(MEASURE)); m.label = label;
  out.runs.push(m);
  await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(800);
  return m;
}
await safe('fixture', async () => {
  await window.hub.fs.write(FILE, GAME);
  for (const f of ['three.module.js', 'three.core.js']) await window.hub.fs.copy(`${THREE_DIR}/build/${f}`, `${DIR}/lib/${f}`);
  out.hashBefore = await window.hub.gameReady.hash([FILE]);
  step('fixture: a throwaway three.js game with steady per-frame work (projectiles, sparks, decals, live textures, particles) and three shadow lights', out.hashBefore?.[0]?.hash);
});
const R = {};
await safe('runs', async () => {
  for (const k of ['off1', 'best1', 'off2', 'best2', 'look', 'stream', 'audio']) R[k] = await play(k);
});
store.set('gamemode.look', 'best'); localStorage.removeItem('gamestream.test'); store.set('gameaudio.off', false);

await safe('judge', async () => {
  const offs = [R.off1, R.off2].filter(Boolean); const bests = [R.best1, R.best2].filter(Boolean);
  const avg = (list, k) => list.reduce((s, x) => s + x[k], 0) / Math.max(1, list.length);
  const off = { cpu50: avg(offs, 'cpu50'), over: avg(offs, 'overMean'), gap50: avg(offs, 'gap50'), calls: avg(offs, 'calls') };
  const allow = Math.max(0.02 * off.cpu50, 0.1); // 2 % of the main thread's frame; the page's clock (100 µs steps) sets the floor
  const cost = (x) => x && +(x.overMean - off.over).toFixed(3);
  out.compare = { off, allowMs: +allow.toFixed(3), best: bests.map(cost), look: cost(R.look), stream: cost(R.stream), audio: cost(R.audio), pct: { best: bests.map((x) => +(100 * cost(x) / off.cpu50).toFixed(2)), look: R.look && +(100 * cost(R.look) / off.cpu50).toFixed(2), stream: R.stream && +(100 * cost(R.stream) / off.cpu50).toFixed(2), audio: R.audio && +(100 * cost(R.audio) / off.cpu50).toFixed(2) } };
  step('off: round 53\'s ▶ Play measured (no look, no Loads during play, no sound part)', offs.length === 2 && offs.every((x) => !x.look && x.frames > 20 && !x.audio), offs.map((x) => ({ frames: x.frames, cpu50: x.cpu50, overMean: x.overMean, gap50: x.gap50 })));
  step(`best: what wraps the game's render costs ≤ 2 % of its frame (≤ ${allow.toFixed(2)} ms; the two runs' mean)`, bests.length === 2 && (cost(bests[0]) + cost(bests[1])) / 2 <= allow, out.compare);
  for (const k of ['look', 'stream', 'audio']) step(`${k} alone: ≤ 2 % of the frame too`, R[k] && cost(R[k]) <= allow, { cost: cost(R[k]), allow: +allow.toFixed(3), cpu50: R[k]?.cpu50, overMean: R[k]?.overMean });
  const st = [...bests, R.stream].filter(Boolean).map((x) => x.stream);
  step('Loads during play never touches steady per-frame work: active, no projectile / spark / decal held (drawn hidden), compiled again or re-sent in strips', st.length === 3 && st.every((s) => s.on && s.active && s.holdsInWindow === 0 && s.slices.strips === 0), { stream: st, calls: { off: off.calls, best: bests.map((x) => x.calls) } });
  const lk = [...bests, R.look].filter(Boolean).map((x) => x.look);
  step('the look\'s own work in a frame of play is small: no whole-scene look in one frame while playing (what the game added that frame + a slice of the slow walk), the most a frame spent there under 2 ms', lk.length === 3 && lk.every((l) => l && l.wholesInWindow === 0 && l.cost.playMax < 2), lk.map((l) => l && { playMax: l.cost.playMax, max: l.cost.max, sweeps: l.cost.sweeps, inWindow: l.sweepsInWindow, wholes: l.wholesInWindow }));
  const sh = [...bests, R.look].filter(Boolean).map((x) => x.shadows);
  step('shadow maps at most 2048² (a point light at most 1024²: six faces), the guard\'s decision reported', sh.every((s) => s.sun <= 2048 && s.spot <= 2048 && s.point <= 1024), { shadows: sh, guard: lk.map((l) => l && { guard: l.guard, steps: l.steps, to: l.shadows?.to, screen: l.screen }) });
  const gb = avg(bests, 'gap50');
  step('best: frames as fast as off (the median gap within 20 % or one 60 Hz refresh: a shared software GPU here, gaps come in whole refreshes)', gb - off.gap50 <= Math.max(17, off.gap50 * 0.2), { off: off.gap50, best: bests.map((x) => x.gap50), p95: [...offs, ...bests].map((x) => `${x.label} ${x.gap95}`) });
});
await safe('files', async () => {
  const after = await window.hub.gameReady.hash([FILE]);
  step('files: the game\'s file byte for byte the same after seven plays', out.hashBefore && after?.[0]?.hash === out.hashBefore[0].hash, after);
});
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, compare: out.compare, runs: out.runs }, null, 1);
