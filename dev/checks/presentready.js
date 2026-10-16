// ▣ Present, got ready (round 52, presentready): Present (P) as a "compile" button.
//   setup    a heavy scene: a shader layer with a slider, a 2048² picture, a 🧊 model, bloom, and a layer that only shows
//            from 3.5 s on the song's timeline (its shaders never drew before); an 8 s song, a 640×360 frame
//   before   the old Present (no getting ready): the scene run again, P, the song from the top → what the GPU compiles /
//            uploads in the first 5 s of the show (counted in the preview: RDY.gl)
//   after    the same with getting ready: the card reaches 100 %, then 0 compiles and 0 new uploads in the first 5 s;
//            quality locked (no adaptive step, the scene's own resolution, no fps cap, no doze); background work quiet
//            (Power.quietNow, Hints.busy, the updater's timer waits); frame pacing in the show
//   esc      Esc leaves: the doze, labadapt and the background work come back
//   bake     a forced "can't hold": the show is baked (a video at the presentation's size), played full screen; its
//            frames match the export's still of the same moment; Space / → work on the video; the mouse hides
//   cache    Present again: the same bake, at once; a slider moved: a new key, a new bake, the old one in the Trash
//   node dev/smoke.js --check-timeout 1200000 --script dev/checks/presentready.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 400) }); } };
const DIR = '/tmp/hearth-presentready';
const key = async (k, code, vk, text) => {
  const p = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: 0 };
  await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: text ? 'keyDown' : 'rawKeyDown', ...p, text, unmodifiedText: text } });
  await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', ...p } });
};
const pressP = () => key('p', 'KeyP', 80, 'p');
const pressEsc = () => key('Escape', 'Escape', 27);
const pressSpace = () => key(' ', 'Space', 32, ' ');
const pressRight = () => key('ArrowRight', 'ArrowRight', 39);
const setTest = (o) => (o ? localStorage.setItem('presentready.test', JSON.stringify(o)) : localStorage.removeItem('presentready.test'));

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
// ---------- fixtures: a 2048² picture, a little GLB, an 8 s song ----------
{
  const c = new OffscreenCanvas(2048, 2048); const g = c.getContext('2d');
  for (let y = 0; y < 2048; y += 64) for (let x = 0; x < 2048; x += 64) { g.fillStyle = `hsl(${(x + y) % 360} 70% ${40 + ((x * 7 + y * 13) % 30)}%)`; g.fillRect(x, y, 64, 64); }
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  await window.hub.fs.write(`${DIR}/pic.jpg`, new Uint8Array(await blob.arrayBuffer()));
  const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, -0.5]); const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 3, 2, 0, 3, 1]);
  const views = []; let off = 0; const chunks = [];
  for (const p of [pos, idx]) { const b = new Uint8Array(p.buffer); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); chunks.push(b, new Uint8Array(pad)); off += b.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'bot' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.5, 0.2, 1] } }], buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  await window.hub.fs.write(`${DIR}/bot.glb`, u);
  const sr = 22050; const secs = 8; const n = secs * sr; const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (q, s) => [...s].forEach((chr, i) => data.setUint8(q + i, chr.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const t = i / sr; const b = t % 0.5; data.setInt16(44 + i * 2, Math.round(20000 * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-b * 30)) * b) * Math.exp(-b * 9)), true); }
  await window.hub.fs.write(`${DIR}/song.wav`, new Uint8Array(data.buffer));
}
const HEAVY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#141a2a');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 4);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const P = tweak({ speed: [1, 0, 3], hue: [0.6, 0, 1] });
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5));
const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, hue: { value: 0.6 } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform float t; uniform float hue; varying vec2 vUv; void main() { float v = 0.5 + 0.5 * sin(vUv.x * 20.0 + t * 3.0) * cos(vUv.y * 14.0 - t * 2.0); gl_FragColor = vec4(v * hue, 0.4 + 0.4 * v, 1.0 - v * 0.5, 1.0); }' });
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.28, 120, 16), mat); scene.add(knot);
renderer.setAnimationLoop((now) => { mat.uniforms.t.value = now / 1000 * P.speed; mat.uniforms.hue.value = P.hue; knot.rotation.y = now / 2000; renderer.render(scene, camera); });`;
const PIC = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
const tex = refTexture('pic');
const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); m.position.set(-0.6, 0.5, 0); scene.add(m);
renderer.setAnimationLoop(() => { m.rotation.z += 0.01; renderer.render(scene, camera); });`;
// shows only from 3.5 s on (opacity keyframes): its own shaders never drew before the show reaches it
const LATE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
scene.add(new THREE.DirectionalLight('#ffffff', 2), new THREE.AmbientLight('#ffffff', 0.4));
const g = new THREE.Group(); scene.add(g);
const mats = [new THREE.MeshPhysicalMaterial({ color: '#ff5080', clearcoat: 1, roughness: 0.2, iridescence: 1 }), new THREE.MeshToonMaterial({ color: '#50ff90' }), new THREE.MeshLambertMaterial({ color: '#5080ff', emissive: '#102040' })];
mats.forEach((mt, i) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 3), mt); s.position.x = (i - 1) * 1.2; g.add(s); });
renderer.setAnimationLoop((now) => { g.rotation.y = now / 1500; renderer.render(scene, camera); });`;

activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 30000);
const D = ThreeLab.director; const c = await ThreeLab.cmd();
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { text = `ERR ${e}`; } }); return text; };
const sbx = async (code) => { for (let i = 0; i < 5; i++) { const r = await D.evalInSketch(code); if (r?.ok) return r.value; await wait(600); } return null; };
const pane = () => ThreeLab.search?.pane;
const presenting = () => Boolean(document.fullscreenElement?.classList.contains('presenting'));
const PR = () => window.PresentReady?.state?.() || null;

await safe('setup', async () => {
  try { c.customSize(640, 360); c.size('custom'); } catch (err) { out.sizeError = err.message; }
  await wait(1000);
  await D.newSketch('presentready heavy', HEAVY, 3);
  await D.refs.add(`${DIR}/pic.jpg`, 'pic');
  await D.addLayer({ name: 'Picture', code: PIC }, 2);
  out.model = await say(`/model add ${DIR}/bot.glb`);
  await wait(2500);
  const bloom = ThreeLayers.FILTERS.find((f) => f.id === 'bloom') || ThreeLayers.FILTERS.find((f) => /bloom/.test(f.id));
  if (bloom) await D.addLayer({ name: bloom.name, code: bloom.code }, 1.5);
  await D.addLayer({ name: 'Late', code: LATE }, 2);
  D.setKeyframes('Late', 'opacity', [{ time: 0, value: 0, ease: 'hold' }, { time: 3.5, value: 1, ease: 'hold' }]);
  out.song = (await c.loadSong(`${DIR}/song.wav`))?.ok;
  await until(() => c.player.analysis, 20000);
  c.player.toggle?.(false); c.player.seek(0);
  await wait(2500);
  const sk = ThreeLab.scenes.get(ThreeLab.scenes.currentId());
  out.layers = sk?.layers?.map((L) => L.name);
  step('a heavy scene: a model, a picture, bloom, a late layer, a song', out.layers?.length >= 4 && out.song && /model|bot/i.test(out.model || '') && Boolean(bloom), { layers: out.layers, model: String(out.model).slice(0, 120) });
});

// one show: the scene run again (as if just opened), the song from the top playing, P, 5 s of show, Esc
async function show(label, test) {
  setTest(test);
  ThreeLab.act('restart');
  await wait(2500);
  c.player.seek(0); c.player.toggle(true);
  pane()?.focus();
  const t0 = performance.now();
  await pressP();
  const on = await until(() => presenting(), 5000);
  // the card's progress while it gets ready
  let maxPct = 0; let sawCard = false;
  const live = await until(() => { const b = document.querySelector('.pr-ready .pr-bar'); if (b) { sawCard = true; maxPct = Math.max(maxPct, Number(b.getAttribute('aria-valuenow')) || 0); } const s = PR(); return s && ["live", "baked"].includes(s.phase) ? s : null; }, 400000);
  const readyMs = Math.round(performance.now() - t0);
  const done = live?.phase === 'baked' ? true : await until(() => PR()?.first5, 15000);
  const KEEP = ['routines', 'hooks', 'lab-media', 'lab-stall']; const ts = (window.Power?.timers?.() || []).filter((x) => !KEEP.includes(x.id) && !/^chromeview/.test(x.id));
  const quietWhile = { power: Boolean(window.Power?.quietNow?.()), hints: window.Hints?.busy?.() || '', waiting: ts.filter((x) => x.next === null).map((x) => x.id), running: ts.filter((x) => x.next !== null).map((x) => x.id) };
  const st = PR();
  out.measure[label] = { readyMs, on, sawCard, maxPct, phase: live?.phase, first5: st?.first5, pace: st?.pace ? { fps: st.pace.fps, p50: st.pace.p50, p95: st.pace.p95, frames: st.pace.frames, hz: st.pace.hz } : null, verdict: st?.verdict ? { holds: st.verdict.holds, fps: st.verdict.fps, p95: st.verdict.p95, hz: st.verdict.hz } : null, prep: st?.prep, warm: st?.warm };
  return { st, done, quietWhile, sawCard, maxPct };
}
async function leave() {
  await pressEsc();
  let left = await until(() => !document.fullscreenElement, 4000);
  if (!left) { out.escFallback = (out.escFallback || 0) + 1; await document.exitFullscreen().catch(() => {}); left = await until(() => !document.fullscreenElement, 3000); }
  await wait(600);
  return left;
}

await safe('before', async () => {
  const r = await show('before', { noPrep: true });
  step('the old Present (nothing got ready): the show starts', r.st?.phase === 'live', r.st?.phase);
  step('before: the first 5 s were counted', Boolean(r.done), out.measure.before?.first5);
  await leave();
});

await safe('after', async () => {
  const r = await show('after', { mode: 'live' });
  step('the getting-ready card showed and reached 100 %', r.sawCard && r.maxPct === 100, { maxPct: r.maxPct });
  const f = r.st?.first5;
  step('no shader compile in the first 5 s of the show', f && f.compiles === 0 && f.links === 0, f);
  step('no texture upload in the first 5 s of the show (a video\'s next frames aside)', f && f.uploads === 0, f);
  const b = out.measure.before?.first5;
  step('before → after: getting ready moved the compiles / uploads out of the show', b && f && (b.compiles + b.links + b.uploads) > (f.compiles + f.links + f.uploads), { before: b && { compiles: b.compiles, links: b.links, uploads: b.uploads }, after: f && { compiles: f.compiles, links: f.links, uploads: f.uploads } });
  step('quality locked: no adaptive step, the scene\'s own resolution, no fps cap, no doze', f && f.lock && f.level === 0 && f.shares?.every((q) => q === 1) && f.cap === 0 && !f.doze && f.dozeWhy === 'presenting', f);
  step('background work waits while presenting (Power quiet, tips, every background timer but Keep going / hooks / the Lab\'s own)', r.quietWhile.power && r.quietWhile.hints === 'presenting' && r.quietWhile.waiting.length > 0 && !r.quietWhile.running.length, r.quietWhile);
  const p = r.st?.pace;
  step('frame pacing in the show measured', p && p.frames >= 10, out.measure.after?.pace);
  out.measure.after.warmCompiles = (r.st?.warm || []).reduce((a, w) => a + w.compiles, 0);
  step('the warm-up across the timeline compiled what shows later (the late layer)', (r.st?.warm || []).some((w) => w.t >= 3.5 && w.compiles > 0) || (r.st?.prep?.gl?.links || 0) > 0, r.st?.warm);
  const left = await leave();
  const back = await until(async () => { const s = await sbx('return window.__labPace.state()'); return s && s.doze.why !== 'presenting' ? s : null; }, 8000);
  const ad = await sbx('return window.__labAdapt.state()');
  step('Esc leaves', left);
  step('Esc: the doze is allowed again', Boolean(back), back?.doze);
  step('Esc: labadapt steps again (not held)', ad && !ad.hold, ad);
  const back2 = (window.Power?.timers?.() || []).filter((x) => x.next === null && x.every != null).map((x) => x.id);
  step('Esc: background work back (Power quiet off, tips, the timers armed again)', !window.Power?.quietNow?.() && window.Hints?.busy?.() !== 'presenting' && !back2.length, { quiet: window.Power?.quietNow?.(), hints: window.Hints?.busy?.(), stillWaiting: back2 });
  const cnt = await sbx('return 1');
  step('the preview is fine after the show', cnt === 1);
});

// ---------- the bake ----------
let firstBake = null;
await safe('bake', async () => {
  c.player.toggle(false); c.player.seek(0);
  const r = await show('bake', { force: 'cant', fps: 10, scale: 0.5, measureMs: 500, points: 4 });
  const st = r.st;
  step('a forced "can\'t hold" bakes the show', st?.phase === 'baked' && st?.cache === 'miss' && st?.entry?.path, { phase: st?.phase, cache: st?.cache, error: st?.bakeError, prepError: st?.prepError, verdict: st?.verdict, bakeMs: st?.bakeMs, entry: st?.entry });
  firstBake = st?.entry || null;
  out.measure.bake = { bakeMs: st?.bakeMs, entry: st?.entry, readyMs: out.measure.bake?.readyMs };
  const v = document.querySelector('.pr-show video');
  if (v) await until(() => v.readyState >= 1, 8000);
  step('the baked video plays full screen', v && presenting() && v.readyState >= 1 && document.fullscreenElement.contains(v), { readyState: v?.readyState });
  if (v) {
    await until(() => v.readyState >= 2, 5000);
    const p0 = v.paused; await pressSpace(); await wait(300);
    step('Space plays / pauses the baked video', v.paused !== p0, { before: p0, after: v.paused });
    if (!v.paused) v.pause();
    const t0 = v.currentTime; await pressRight(); await wait(300);
    step('→ seeks the baked video', v.currentTime > t0 + 1, { from: t0, to: v.currentTime });
    v.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await wait(2300);
    step('the mouse hides after 2 s', document.querySelector('.pr-show')?.style.cursor === 'none');
  }
  step('the live preview rests behind the baked show (parked)', document.querySelector('.three-preview')?.classList.contains('pr-baked'));
  await leave();
  step('Esc: the baked show goes, the preview comes back', !document.querySelector('.pr-show') && !document.querySelector('.three-preview.pr-baked') && !window.Power?.quietNow?.());
});

// the bake's frames = the export's own frames of the same moments (a still of the scene at that time, same size)
await safe('frames', async () => {
  if (!firstBake) { step('bake frames compared', false, 'no bake'); return; }
  const E = firstBake;
  const grab = (src, t) => new Promise((res, rej) => {
    const v = document.createElement('video'); v.muted = true; v.src = src; v.preload = 'auto';
    v.onerror = () => rej(new Error('video')); v.onloadeddata = () => { v.currentTime = t; };
    v.onseeked = () => { const cv = new OffscreenCanvas(E.w, E.h); const g = cv.getContext('2d'); g.drawImage(v, 0, 0, E.w, E.h); res(g.getImageData(0, 0, E.w, E.h).data); v.removeAttribute('src'); v.load(); };
  });
  const still = async (t) => {
    const r = await LabExport.render({ source: 'scene', format: 'still', at: t, size: { w: E.w, h: E.h }, dir: `${DIR}/stills`, stem: `still-${t}`, quiet: true, track: false });
    const img = new Image(); img.src = `${WinMac.fileUrl(r.path)}?v=${Date.now()}`; await img.decode();
    const cv = new OffscreenCanvas(E.w, E.h); const g = cv.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, E.w, E.h).data;
  };
  const diff = (a, b) => { let s = 0; let n = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; } return Math.round((s / n) * 100) / 100; };
  const src = `${WinMac.fileUrl(E.path)}?v=${E.at}`;
  const F = E.fps;
  const res = {};
  for (const t of [1, 2.5]) {
    const frame = await grab(src, t + 0.5 / F);
    res[t] = { same: diff(frame, await still(t)), other: null };
    if (t === 1) res[t].other = diff(frame, await still(3));
  }
  out.measure.frames = res;
  step('the bake\'s frames match the export of the same moment (mean difference ≤ 6 / 255)', res[1].same <= 6 && res[2.5].same <= 6, res);
  step('…and differ from another moment (the comparison sees a difference)', res[1].other > res[1].same, res);
});

// ---------- the cache ----------
await safe('cache', async () => {
  if (!firstBake) { step('the cache', false, 'no bake'); return; }
  c.player.seek(0);
  const r = await show('cacheHit', { force: 'cant', fps: 10, scale: 0.5, measureMs: 500, points: 4 });
  step('Present again, nothing changed: the same bake (a cache hit)', r.st?.cache === 'hit' && r.st?.entry?.path === firstBake.path, { cache: r.st?.cache, path: r.st?.entry?.path });
  step('…and it starts at once (no getting ready, no bake)', out.measure.cacheHit?.readyMs < 6000 && !r.st?.warm?.length, { readyMs: out.measure.cacheHit?.readyMs });
  await leave();
  // a slider moved: the key changes; the next bake replaces the old one, which goes to the Trash
  const L1 = ThreeLab.search.layers().find((x) => x.name === 'Layer 1'); if (L1) ThreeLab.search.selectLayer(L1.id); await wait(800);
  try { c.setSlider('speed', 1.7); } catch (err) { out.sliderError = err.message; }
  await wait(1200);
  const r2 = await show('changed', { force: 'cant', fps: 10, scale: 0.5, measureMs: 500, points: 4 });
  step('a slider moved: a new bake (not the old one)', r2.st?.cache === 'miss' && r2.st?.key && r2.st.key !== firstBake.key, { cache: r2.st?.cache, key: r2.st?.key, old: firstBake.key });
  const gone = await until(async () => !(await window.hub.fs.stat(firstBake.path).catch(() => null)), 8000);
  step('the stale bake went to the Trash', gone && (r2.st?.trashed || []).includes(firstBake.path), { trashed: r2.st?.trashed });
  const idx = await PresentReady._index();
  step('the cache index keeps one bake for this scene', Array.isArray(idx) && idx.filter((e) => e.scene === r2.st?.entry?.scene).length === 1, idx?.map((e) => e.key));
  await leave();
});
setTest(null);
out.pass = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out);
