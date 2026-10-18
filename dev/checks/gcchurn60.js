// Garbage made per frame by Hearth's own code while a game plays (round 60, gcchurn60). At 240 Hz a minor GC of a few
// ms is a visible hitch, and a minor GC comes sooner the more a frame allocates: Hearth's own hooks must allocate
// (next to) nothing per frame. Two windows, a game playing in each:
//   play   ▶ Play with the Best look, loads during play and the sound part on (the playbudget watch, getting ready's
//          leftovers, the chip's preload around them): a light game whose frames are short here too (6 projectiles a
//          frame with cloned materials, a spark group every 3rd, a decal on a fresh geometry every 4th, a data texture
//          rewritten every frame); GC60_HEAVY = 1 also plays dev/fixtures/gamefps54-game.html off / Best (for the report:
//          ≈ 8 frames a second here); GC60_OFF = 1 also plays the light game in round 53's ▶ Play (the game ≈ alone)
//   lab    the Lab preview (tools/three-sandbox.html: pace core, layer batch, glFresh, attribution wrappers, stats)
//          playing labplay55's Clink-like game layer (shadows, a canvas texture rewritten every frame, projectiles added
//          every frame with cloned materials) and a DOM HUD layer that asks for its frames with a new function each time
// Measured with V8's sampling heap profiler over CDP (HeapProfiler.startSampling with the objects later collected by
// minor and major GCs kept: every allocation, not what survives), bytes split by the deepest JS frame with a script:
// Hearth's (its page scripts / preload code in the game window, the preview page's own code in the Lab) vs the game's
// (its page, its layer code, three.js) vs the browser's start of frame (see SINK) vs other; per frame of the game. A
// self-test injects a pretend Hearth hook around render() that allocates ≈ 300 B a frame (the kind of thing this round
// removed) and the same measure must exceed the budget. Fails when Hearth's own bytes a frame are over the budget in
// either window, or the self-test isn't seen.
// window.GC60_ONLY = 'play,lab' · GC60_SEC (s measured, default 8) · GC60_REPORT = 1 (report only) · GC60_BUDGET (bytes
// a frame) · GC60_SAMPLE (sampling interval in bytes, default 64) · GC60_HEAVY · GC60_OFF.
//   node dev/smoke.js --check-timeout 1200000 --screen 960x600 --script dev/checks/gcchurn60.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], play: {}, lab: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 600000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 60000)} min`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const only = String(window.GC60_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const SEC = Number(window.GC60_SEC) || 8;
// bytes a frame of Hearth's own, per window (see the header: what's left is code this machine runs unoptimised)
const BUDGET = { play: Number(window.GC60_BUDGET) || 256, lab: Number(window.GC60_BUDGET) || 1024 };
const SAMPLE = Number(window.GC60_SAMPLE) || 64;
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-gcchurn60`;
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
const r1 = (x) => Math.round(x * 10) / 10;
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

// ---------- whose bytes ----------
// Hearth's scripts in the game window are served on the game's own address (/__playbudget-page.js …) or run as preload
// code put in the game's world (gamelook-preload.js / game-preload.js: executeInMainWorld → a script with no URL; the
// game's own code always has one); in the Lab the preview page itself. The self-test's hook names itself hearth-selftest.
const HEARTH = /\/__(playbudget|gameready|gamestream|gameaudio|gameperf)[\w-]*\.js|gamelook-preload|game-preload|three-sandbox\.html|hearth-selftest|playlatency/;
const GAME = /^blob:|three\.(module|core)(\.min)?\.js|three@|\/lib\/|index\.html|play\.html|addons|GLTFLoader/;
// The browser's own bookkeeping at the start of every frame of a WebGL page (≈ 400 B a frame here) is counted by the
// profiler for whichever JavaScript runs first in the frame: in ▶ Play that's the budget watch's frame callback, in the
// Lab the page's frame wrapper. Found by giving the frame an empty function that runs before every frame callback (a
// CSS animation's animationiteration event: "update animations and send events" comes before the frame callbacks): the
// 400 B moved to it, the watch's callback fell to ≈ 20 B. The check puts that sink in both pages (SINK) and counts what
// lands on it apart ('frameStart'): neither Hearth's nor the game's.
const SINK = `(() => { if (window.__gc60sink != null) return 1; const st = document.createElement('style'); st.textContent = '@keyframes gc60f { from { opacity: 1 } to { opacity: 0.99 } } .gc60f { position: fixed; left: 0; top: 0; width: 1px; height: 1px; pointer-events: none; animation: gc60f 4ms linear infinite; }'; document.documentElement.appendChild(st); const d = document.createElement('div'); d.className = 'gc60f'; document.documentElement.appendChild(d); window.__gc60sink = 0; addEventListener('animationiteration', function browserFrameStart() { window.__gc60sink += 1; }); return 1; })()`;
function digest(profile, frames) {
  const by = { hearth: 0, game: 0, other: 0, frameStart: 0 }; const top = { hearth: {}, game: {}, other: {}, frameStart: {} }; let total = 0; let hook = 0;
  const kind = (cf) => { if (cf.functionName === 'browserFrameStart') return 'frameStart'; if (cf.url) return HEARTH.test(cf.url) ? 'hearth' : GAME.test(cf.url) ? 'game' : 'other'; return cf.scriptId && cf.scriptId !== '0' ? 'hearth' : null; };
  const stack = [];
  const walk = (n) => {
    stack.push(n);
    if (n.selfSize) {
      let k = null; let at = null;
      for (let i = stack.length - 1; i >= 0 && !k; i -= 1) { k = kind(stack[i].callFrame); if (k) at = stack[i].callFrame; }
      k = k || 'other'; by[k] += n.selfSize; total += n.selfSize;
      if (at && /^hearthSelftest/.test(at.functionName)) hook += n.selfSize;
      const key = (at ? `${at.functionName || '(anon)'} ${(at.url || '(injected)').split('/').pop().split('?')[0].slice(0, 40)}:${at.lineNumber + 1}` : n.callFrame.functionName) + (at && at !== n.callFrame ? ` ← ${n.callFrame.functionName || '?'}` : '');
      top[k][key] = (top[k][key] || 0) + n.selfSize;
    }
    for (const c of n.children || []) walk(c);
    stack.pop();
  };
  walk(profile.head);
  const f = Math.max(1, frames);
  const t = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${r1(v / f)} B ${k}`);
  return { frames, perFrame: { hearth: r1(by.hearth / f), game: r1(by.game / f), other: r1(by.other / f), frameStart: r1(by.frameStart / f), total: r1(total / f), ...(hook ? { selftestHook: r1(hook / f) } : {}) }, top: { hearth: t(top.hearth), game: t(top.game).slice(0, 6), other: t(top.other).slice(0, 6) } };
}

// ---------- ▶ Play ----------
const GW = () => window.hub.game;
const ev = async (code) => { const r = await GW().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
const pc = (method, params, ms = 30000) => Promise.race([smoke({ pageCdp: '^hearth-game:', cdp: method, params }), wait(ms).then(() => ({ error: 'timeout' }))]);
// the pretend Hearth hook of the self-test, the kind of thing this round removed: around render(), an object holding a
// copy of the arguments, a closure kept, a scratch list and a label, made every frame (≈ 1 KB)
const HOOK = 'function hearthSelftestHook() { const o = { at: performance.now(), args: Array.prototype.slice.call(arguments), tmp: new Array(200), label: "frame " + (++window.__gc60n) }; window.__gc60keep = () => o; return r0.apply(this, arguments); }';
const INJECT = `(() => { const r = window.game.renderer; const r0 = r.render; window.__gc60n = 0; window.__gc60keep = null; r.render = ${HOOK}; return 1; })()`;
async function sampleGame(label) {
  const f0 = await ev('window.game.frames');
  await pc('HeapProfiler.enable', {}); await pc('HeapProfiler.collectGarbage', {});
  const g0 = await ev('window.game.frames');
  const s = await pc('HeapProfiler.startSampling', { samplingInterval: SAMPLE, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  if (s?.error) throw new Error(`startSampling: ${s.error}`);
  const t0 = performance.now(); await wait(SEC * 1000);
  const p = await pc('HeapProfiler.stopSampling', {}, 60000); const g1 = await ev('window.game.frames'); const sec = (performance.now() - t0) / 1000;
  await pc('HeapProfiler.collectGarbage', {});
  if (!p?.profile) throw new Error(`stopSampling: ${JSON.stringify(p).slice(0, 200)}`);
  const d = digest(p.profile, g1 - g0); d.label = label; d.sec = r1(sec); d.fps = r1((g1 - g0) / sec); d.warm = g0 - f0;
  return d;
}
// A light game whose frames are short here too (a 320 × 200 picture stretched to the window: ≈ the screen's rate, like
// the owner's 240 Hz frames) doing a real game's steady per-frame work: 6 projectiles a frame each with its own cloned
// material, a spark group every 3rd frame, a decal on a fresh geometry every 4th, a data texture rewritten every frame.
// (On this machine dev/fixtures/gamefps54-game.html draws ≈ 8 frames a second: every frame a "long animation frame",
// where the browser's own bookkeeping lands on the first frame callback of the page — the budget watch's — and the
// hooks it measures stay unoptimised for the whole run; it is played for the report with window.GC60_HEAVY = 1.)
const FAST = `<!doctype html><html><head><meta charset="utf-8"><title>GC churn test (Hearth)</title>
<style>html, body { margin: 0; height: 100%; overflow: hidden; background: #000; } canvas { display: block; width: 100%; height: 100%; }</style>
<script type="importmap">{ "imports": { "three": "./lib/three.module.js" } }</script></head><body>
<script type="module">
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(320, 200, false); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1a2030');
const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 100); camera.position.set(0, 6, 12); camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight('#ffffff', 0.5)); const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(5, 10, 4); scene.add(sun);
const mats = Array.from({ length: 4 }, (_, i) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 4, 0.6, 0.5) }));
const box = new THREE.BoxGeometry(0.8, 0.8, 0.8);
for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(box, mats[i % 4]); m.position.set((i % 6) * 2 - 5, 0.4, Math.floor(i / 6) * 2 - 3); scene.add(m); }
const DW = 32; const dd = new Uint8Array(DW * DW * 4); const dataTex = new THREE.DataTexture(dd, DW, DW); dataTex.needsUpdate = true;
const bulletGeo = new THREE.SphereGeometry(0.1, 6, 4); const bulletBase = new THREE.MeshStandardMaterial({ color: '#ffee88', emissive: '#ff8800' });
const sparkGeo = new THREE.TetrahedronGeometry(0.12); const sparkMat = new THREE.MeshBasicMaterial({ color: '#ff6633' });
const live = []; const G = window.game = { THREE, renderer, scene, camera, frames: 0 }; let n = 0;
renderer.setAnimationLoop((t) => {
  n++;
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(bulletGeo, bulletBase.clone()); m.position.set(((i * 7 + n) % 20) - 10, 1, ((i * 3 + n) % 12) - 6); m.userData.t = t; scene.add(m); live.push(m); }
  if (n % 3 === 0) { const g = new THREE.Group(); g.add(new THREE.Mesh(sparkGeo, sparkMat), new THREE.Mesh(sparkGeo, sparkMat)); g.userData.t = t; scene.add(g); live.push(g); }
  if (n % 4 === 0) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: dataTex })); d.rotation.x = -Math.PI / 2; d.position.set((n % 10) - 5, 0.02, 2); d.userData.t = t; scene.add(d); live.push(d); }
  for (let i = live.length - 1; i >= 0; i--) { const o = live[i]; o.position.y += 0.01; if (t - o.userData.t > 800) { scene.remove(o); o.traverse((x) => { if (x.isMesh && x.material !== sparkMat) { x.material.dispose(); if (x.geometry !== bulletGeo && x.geometry !== sparkGeo) x.geometry.dispose(); } }); live.splice(i, 1); } }
  for (let i = 0; i < dd.length; i += 4) { dd[i] = (i + n) & 255; dd[i + 3] = 255; } dataTex.needsUpdate = true;
  renderer.render(scene, camera); G.frames++;
});
</script></body></html>`;
const SET = { off: { look: 'off', stream: false, audio: false }, best: { look: 'best', stream: true, audio: true } };
async function play(game, label, after) {
  const c = SET[label];
  store.set('gamemode.look', c.look); localStorage.setItem('gamestream.test', JSON.stringify({ off: !c.stream })); store.set('gameaudio.off', !c.audio);
  await GameMode.play({ kind: 'html', path: `${DIR}/${game}.html`, title: 'GC churn test' });
  await until(async () => (await GW().state())?.playing, 60000);
  await until(() => ev('Boolean(window.game && window.game.frames > 10 && (!window.__gameReady || JSON.parse(window.__gameReady.pub()).phase === "playing"))'), 120000);
  await wait(3000);
  if (c.look === 'best') await until(() => ev('!["waiting", "measuring", "tight", "trying"].includes(window.__gameLook.report().guard)'), 30000);
  await ev(SINK);
  await wait(6000); // (getting ready's hooks retire 5 s into play: the steady state)
  const r = { [label]: await sampleGame(`${game} ${label}`) };
  r[label].sinkEvents = await ev('window.__gc60sink');
  if (after) Object.assign(r, await after());
  r.budget = await ev('window.__hearthBudget ? JSON.parse(window.__hearthBudget.pub()).helpers : null').catch(() => null);
  await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(800);
  return r;
}
if (want('play')) {
  await safe('play', async () => {
    await window.hub.fs.write(`${DIR}/fast.html`, FAST);
    if (window.GC60_HEAVY) await window.hub.fs.write(`${DIR}/heavy.html`, await window.hub.fs.read(`${window.SMOKE_DEV}/fixtures/gamefps54-game.html`));
    for (const f of ['three.module.js', 'three.core.js']) await window.hub.fs.copy(`${THREE_DIR}/build/${f}`, `${DIR}/lib/${f}`);
    await Lazy.load('gamemode');
    const selftest = async () => { await ev(INJECT); await wait(1500); return { selftest: await sampleGame('best + injected hook') }; };
    if (window.GC60_HEAVY) { out.heavy = {}; Object.assign(out.heavy, await play('heavy', 'off')); Object.assign(out.heavy, await play('heavy', 'best')); }
    if (window.GC60_OFF) Object.assign(out.play, await play('fast', 'off'));
    Object.assign(out.play, await play('fast', 'best', selftest));
    store.set('gamemode.look', 'best'); localStorage.removeItem('gamestream.test'); store.set('gameaudio.off', false);
  }, 1500000);
  const P = out.play;
  if (P.best) {
    step(`play: Hearth's own code allocates ≤ ${BUDGET.play} B a frame with the Best look, loads during play and the sound part on`, P.best.fps >= 15 && P.best.perFrame.hearth <= BUDGET.play, { perFrame: P.best.perFrame, top: P.best.top.hearth, frames: P.best.frames, fps: P.best.fps, off: P.off && P.off.perFrame });
    step(`play self-test: a pretend Hearth hook allocating around render() reads over ${BUDGET.play} B a frame`, P.selftest && P.selftest.perFrame.hearth > BUDGET.play && P.selftest.perFrame.selftestHook > 400, P.selftest && { perFrame: P.selftest.perFrame, top: P.selftest.top.hearth.slice(0, 4) });
  }
}

// ---------- the Lab preview ----------
if (want('lab')) {
  await safe('lab', async () => {
    activate('tool:three');
    await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
    const c = await ThreeLab.cmd(); const D = ThreeLab.director;
    await wait(600);
    const GAMEL = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200); camera.position.set(0, 5, 11); camera.lookAt(0, 0.5, 0);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1320'); scene.fog = new THREE.FogExp2('#0d1320', 0.03);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#3a5a2a', roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const sun = new THREE.DirectionalLight('#fff3e0', 2.4); sun.position.set(6, 10, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun, new THREE.HemisphereLight('#9ec5ff', '#3b2a1a', 0.6));
const crateMat = new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.7 }); const box = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(box, crateMat); const a = i * 2.39996; const r = 3 + (i % 12); m.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64; const sg = sc.getContext('2d');
const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc) })); board.position.set(0, 3.2, -4); scene.add(board);
const shotGeo = new THREE.SphereGeometry(0.12, 8, 6); const shotMat = new THREE.MeshStandardMaterial({ color: '#ffcf6b', emissive: '#ff8a3d', emissiveIntensity: 1.5 });
const shots = []; let score = 0; window.__gc60 = { frames: 0 };
renderer.setAnimationLoop((t) => {
  const s = t / 1000; window.__gc60.frames += 1;
  for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(shotGeo, shotMat.clone()); m.position.set(Math.sin(s * 3 + k) * 2, 0.6, 2); m.userData.v = new THREE.Vector3(Math.sin(k + s) * 2, 1.5, -14); m.userData.born = s; m.castShadow = true; scene.add(m); shots.push(m); }
  for (let i = shots.length - 1; i >= 0; i--) { const m = shots[i]; m.position.addScaledVector(m.userData.v, 1 / 60); if (s - m.userData.born > 0.8) { scene.remove(m); m.material.dispose(); shots.splice(i, 1); score += 1; } }
  sg.fillStyle = '#101820'; sg.fillRect(0, 0, 256, 64); sg.fillStyle = '#ffd75e'; sg.font = '700 40px system-ui'; sg.fillText('SCORE ' + score, 12, 46); board.material.map.needsUpdate = true;
  camera.position.x = Math.sin(s * 0.3) * 6; camera.lookAt(0, 0.5, 0);
  renderer.render(scene, camera);
});`;
    const HUD = `const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:12px;top:8px;font:700 18px system-ui;color:#fff;text-shadow:0 2px 6px #000'; document.body.append(d);
let shown = -1; const f = (t) => { const v = Math.floor(t / 250); if (v !== shown) { shown = v; d.textContent = 'CLINK · ' + v; } requestAnimationFrame((u) => f(u)); }; requestAnimationFrame(f);`;
    await D.newSketch('GC churn fixture (gcchurn60)', GAMEL, 2);
    const fixId = ThreeLab.scenes.currentId();
    try { c.customSize(320, 180); c.size('custom'); } catch { /* the frame size stays */ }
    await D.updateLayer(D.layers().layers[0].name, { name: 'Game', code: GAMEL }, 0.3);
    await D.addLayer({ name: 'HUD', code: HUD }, 1);
    c.code?.(false); c.panel?.(true);
    await wait(4000);
    if (ThreeLab.scenes.currentId() !== fixId) { ThreeLab.scenes.open(fixId); await wait(2500); }
    const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
    const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(800); } return r; };
    await sbx('window.__labAdapt && window.__labAdapt.set({ level: 0, hold: true }); return 1');
    const frames = () => sbx('return window.__labPace.state().frameTick');
    await until(async () => (await frames()) > 60, 60000);
    await sbx(`return ${SINK}`);
    await wait(8000); // (the still check's warm-up, the first loads, the scene doctor's look after the run)
    const pvTarget = () => { const f = [...document.querySelectorAll('iframe')].find((x) => /three-sandbox/.test(x.src) && x.getBoundingClientRect().width > 50); const n = /[?&]n=([\w-]+)/.exec(f?.src || '')?.[1]; return n ? `three-sandbox.*[?&]n=${n}` : 'three-sandbox'; };
    const tc = (method, params, ms = 30000) => Promise.race([smoke({ cdp: method, params, target: pvTarget() }), wait(ms).then(() => ({ error: 'timeout' }))]);
    async function sampleLab(label) {
      await tc('HeapProfiler.enable', {}); await tc('HeapProfiler.collectGarbage', {});
      const g0 = await frames();
      const s = await tc('HeapProfiler.startSampling', { samplingInterval: SAMPLE, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      if (s?.error) throw new Error(`startSampling: ${s.error}`);
      const t0 = performance.now(); await wait(SEC * 1000);
      const p = await tc('HeapProfiler.stopSampling', {}, 60000); const g1 = await frames(); const sec = (performance.now() - t0) / 1000;
      await tc('HeapProfiler.collectGarbage', {});
      if (!p?.profile) throw new Error(`stopSampling: ${JSON.stringify(p).slice(0, 200)}`);
      const d = digest(p.profile, g1 - g0); d.label = label; d.sec = r1(sec); d.fps = r1((g1 - g0) / sec);
      return d;
    }
    out.lab.play = await sampleLab('lab: game playing');
    out.lab.play.sinkEvents = await sbx('return window.__gc60sink');
    // the self-test: the same pretend hook, around the game layer's render (named as Hearth's)
    const inj = await sbx(`const sc = window.__scenes || {}; let n = 0; window.__gc60n = 0; for (const k of Object.keys(sc)) { const r = sc[k] && sc[k].renderer; if (!r || r.__gc60) continue; const r0 = r.render; r.__gc60 = 1; r.render = (0, eval)(${JSON.stringify(`(function (r0) { return ${HOOK}; })`)})(r0); n += 1; } return n`);
    out.lab.injected = inj;
    await wait(1500);
    out.lab.selftest = await sampleLab('lab + injected hook');
    await sbx('window.__labAdapt && window.__labAdapt.set({ level: 0, hold: false }); return 1');
  }, 600000);
  const L = out.lab;
  if (L.play) {
    step(`lab: the preview page's own code allocates ≤ ${BUDGET.lab} B a frame with a game playing`, L.play.fps >= 5 && L.play.perFrame.hearth <= BUDGET.lab, { perFrame: L.play.perFrame, top: L.play.top.hearth, frames: L.play.frames, fps: L.play.fps });
    step(`lab self-test: a pretend hook allocating around the game's render() reads over ${BUDGET.lab} B a frame`, L.selftest && L.selftest.perFrame.hearth > BUDGET.lab && L.selftest.perFrame.selftestHook > 400, L.selftest && { injected: L.injected, perFrame: L.selftest.perFrame, top: L.selftest.top.hearth.slice(0, 4) });
  }
}
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ ...(window.GC60_REPORT ? { report: true, wouldFail: bad.map((s) => s.name) } : { pass: bad.length === 0, failed: bad.map((s) => s.name) }), budgetBytes: BUDGET, steps: out.steps, play: out.play, lab: out.lab, ...(out.heavy ? { heavy: out.heavy } : {}) }, null, 1);
