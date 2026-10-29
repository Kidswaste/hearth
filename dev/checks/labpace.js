// Lab frame pacing (round 33 "labpace"), in the real preview (SwiftShader under Xvfb, a 60 Hz display): the same
// animation progress at different frame rates (a 30 fps cap against the screen's 60: f60 against the old per-frame
// step), a still scene stops drawing (WebGL draw calls per second with pacing on vs off) and draws again on its own
// change, a slider or a poke; a parked Lab does no work at all (no draws, no page frames); the Frame pace readout in
// ⋯; battery: Auto at 60 fps and the first adaptive step; dragging on a slow preview draws at 70 % until let go; an
// animated scene's frame gaps with pacing on vs off (no regression), and the signature's cost per frame.
//   node dev/smoke.js --fake-engines --check-timeout 200000 --script dev/checks/labpace.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], perf: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(600); } return r; };
const frameEl = () => [...document.querySelectorAll('.three-preview iframe')].find((f) => f.getBoundingClientRect().width > 0) || document.querySelector('.three-preview iframe');
const send = (msg) => frameEl()?.contentWindow?.postMessage({ target: 'three-sandbox', ...msg }, '*');
const PS = (code = 'state()') => sbx(`return window.__labPace.${code}`);
// WebGL draw calls inside the preview: count, and the frames they fell in (document.timeline.currentTime)
const PROBE = `if (!window.__dp) {
  const dp = window.__dp = { calls: 0, frames: [], last: -1, on: false };
  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!P) continue;
    for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const f = P[m]; if (typeof f !== 'function') continue;
      P[m] = function (...a) { if (dp.on) { dp.calls += 1; const t = document.timeline.currentTime; if (t !== dp.last) { dp.frames.push(t); dp.last = t; } } return f.apply(this, a); };
    }
  }
}
window.__dp.calls = 0; window.__dp.frames = []; window.__dp.last = -1; window.__dp.on = true; return 1`;
const pct = (g, p) => { const s = g.slice().sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : null; };
async function draws(ms) {
  await sbx(PROBE);
  const t0 = performance.now(); await wait(ms); const el = performance.now() - t0;
  const r = await sbx('window.__dp.on = false; return { calls: window.__dp.calls, frames: window.__dp.frames }');
  const f = Array.isArray(r?.frames) ? r.frames : [];
  const gaps = f.slice(1).map((t, i) => t - f[i]);
  const mean = gaps.reduce((a, x) => a + x, 0) / (gaps.length || 1);
  const sd = Math.sqrt(gaps.reduce((a, x) => a + (x - mean) ** 2, 0) / (gaps.length || 1));
  return { drawnPerSec: Math.round((f.length / el) * 10000) / 10, callsPerSec: Math.round(((r?.calls || 0) / el) * 10000) / 10, p50: pct(gaps, 0.5), p95: pct(gaps, 0.95), sd: Math.round(sd * 10) / 10, frames: f.length, first: f[0] ?? null, list: f };
}
try { c.customSize(640, 360); c.size('custom'); } catch (err) { out.sizeError = err.message; }
await wait(1200);

// a still scene drawn every frame by its loop (the most common sketch shape: a model, lights, render() each frame)
const STILL = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#141a2a');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 1.5, 6); camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight('#ffffff', 0.5)); const l = new THREE.DirectionalLight('#ffffff', 2); l.position.set(3, 4, 5); scene.add(l);
const P = tweak({ hue: [0.6, 0, 1] });
const mat = new THREE.MeshStandardMaterial({ color: '#80c0ff', roughness: 0.4 });
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 160, 24), mat); scene.add(knot);
for (let i = 0; i < 40; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat); s.position.set(Math.cos(i) * 2.6, Math.sin(i * 0.7), Math.sin(i) * 2.6); scene.add(s); }
window.__moveLater = (ms) => setTimeout(() => { knot.rotation.y += 0.4; window.__movedAt = document.timeline.currentTime; }, ms);
addEventListener('pointermove', () => { if (window.__hover) knot.rotation.x += 0.05; }); // (a hover effect, switched on by the pointer step)
function frame() { requestAnimationFrame(frame); mat.color.setHSL(P.hue, 0.6, 0.6); renderer.render(scene, camera); }
requestAnimationFrame(frame);`;
// an animation written per frame, the old way and with f60, side by side (one accumulator each)
const SPIN = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101418');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshNormalMaterial()); scene.add(box);
window.__spin = { f60: 0, old: 0, kick: 0, n: 0 };
renderer.setAnimationLoop(() => {
  __spin.f60 += 0.01 * f60; __spin.old += 0.01; __spin.n += 1;
  __spin.kick = Math.max(__spin.kick * 0.9 ** f60, 0);
  box.rotation.y = __spin.f60;
  renderer.render(scene, camera);
});`;

await d.newSketch('labpace still', STILL, 3);
await wait(2000);
step('the pace runtime is in the preview', Boolean((await PS())?.on != null), await PS());

// 1) a still scene: draws per second with pacing on vs off (interleaved, twice)
await safe('still', async () => {
  const acc = { off: [], on: [] };
  for (let round = 0; round < 2; round += 1) {
    for (const k of ['off', 'on']) {
      await PS(`on(${k === 'on'})`); await wait(1500);
      const w0 = (await PS()).why;
      acc[k].push(await draws(3000));
      const w1 = (await PS()).why; // (round 74: why it drew in the window: refresh / poke / change / settle / live / early)
      if (k === 'on' && w0 && w1) (out.perf.stillWhy ||= []).push(Object.fromEntries(Object.keys(w1).map((n) => [n, w1[n] - (w0[n] || 0)])));
    }
  }
  const avg = (a, key) => Math.round((a.reduce((s, x) => s + x[key], 0) / a.length) * 10) / 10;
  out.perf.still = { off: { drawnPerSec: avg(acc.off, 'drawnPerSec'), callsPerSec: avg(acc.off, 'callsPerSec') }, on: { drawnPerSec: avg(acc.on, 'drawnPerSec'), callsPerSec: avg(acc.on, 'callsPerSec') } };
  step('a still scene with pacing off draws every frame it can (the "before")', out.perf.still.off.drawnPerSec >= 4 * Math.max(1, out.perf.still.on.drawnPerSec), out.perf.still);
  // (round 74, labdraw74) ≤ 1 a second: the safety refresh only (a second apart while it settles, then 4 s); the
  // check's own messages (evals) and the Lab's clock no longer draw a frame each (they used to: 3 frames per message)
  step('a still scene with pacing on draws at most once a second (a refresh), not every frame', out.perf.still.on.drawnPerSec <= 1, out.perf.still);
  const st = await PS();
  out.stillState = { still: st.still, skipped: st.skipped, sigUs: st.sigUs, refreshes: st.refreshes };
  step('it knows it is still (the readout says so)', st.still === true, out.stillState);
});
// 2) resumes on change: its own change (a timer in the sketch, no message), a slider, a pointer
await safe('resume', async () => {
  await PS('on(true)'); await wait(1200);
  await sbx(PROBE);
  await sbx('window.__movedAt = null; window.__moveLater(400); return 1');
  await wait(900);
  const r = await sbx('window.__dp.on = false; return { frames: window.__dp.frames, moved: window.__movedAt }');
  const after = (r.frames || []).filter((t) => t >= r.moved);
  const lag = after.length ? Math.round(after[0] - r.moved) : null;
  out.perf.resumeLagMs = lag;
  step('the sketch changes itself (a timer, no message): it draws again within a frame or two', lag != null && lag <= 40, { lag, framesAfter: after.length });
  step('… and goes still again right after (a few frames, not every frame)', after.length > 0 && after.length <= 5, after.length);
  await wait(800);
  await sbx(PROBE);
  let how = 'slider';
  try { c.setSlider('hue', 0.1); } catch (err) { how = err.message; }
  await wait(500);
  const r2 = await sbx('window.__dp.on = false; return { frames: window.__dp.frames.length }');
  step('a slider moved: it draws at once', r2.frames >= 1, { frames: r2.frames, how });
  await wait(800);
  await sbx(PROBE);
  await sbx('window.__hover = true; for (let i = 0; i < 5; i++) dispatchEvent(new PointerEvent("pointermove", { clientX: 100 + i, clientY: 100 })); return 1');
  await wait(300);
  const r3 = await sbx('window.__dp.on = false; window.__hover = false; return { frames: window.__dp.frames.length }');
  step('a pointer over the preview that moves something (a hover effect, orbit controls): it draws', r3.frames >= 1, r3);
  // (round 74, labdraw74) a pointer that changes nothing: looked at, not drawn (a refresh may land in the window)
  await wait(1500);
  await sbx(PROBE);
  await sbx('for (let i = 0; i < 5; i++) dispatchEvent(new PointerEvent("pointermove", { clientX: 120 + i, clientY: 100 })); return 1');
  await wait(300);
  const r4 = await sbx('window.__dp.on = false; return { frames: window.__dp.frames.length, why: window.__labPace.state().why }');
  step('a pointer over the preview that changes nothing: no frame drawn for it (a refresh at most)', r4.frames <= 1, r4);
});
// 3) parked: no draws and the page asks for no frames at all; back on screen: it draws at once
await safe('parked', async () => {
  await PS('on(false)'); await wait(600); // (pacing off: the scene would draw every frame if it could)
  const a0 = await PS();
  send({ type: 'park', on: true });
  await wait(300);
  await sbx(PROBE);
  const f0 = (await PS()).frameTick;
  await wait(2000);
  const f1 = (await PS()).frameTick;
  const r = await sbx('window.__dp.on = false; return { calls: window.__dp.calls }');
  const st = await PS();
  out.perf.parked = { drawCalls: r.calls, pageFramesIn2s: f1 - f0, sleeps: st.sleeps, wakes: st.wakes }; // (each eval here is a message: it wakes the loops once, they go back to sleep)
  step('parked: no draw calls', r.calls === 0, out.perf.parked);
  step('parked: the page asks for no frames (frame counter, compositor, song and sequence loops asleep)', f1 - f0 <= 2, out.perf.parked);
  await sbx(PROBE);
  const t0 = performance.now();
  send({ type: 'park', on: false });
  // (the hub's own syncPark would park it again if the preview weren't on screen: it is, so this holds)
  await until(async () => (await sbx('return window.__dp.frames.length')) > 0, 3000);
  out.perf.unparkMs = Math.round(performance.now() - t0);
  step('back on screen: it draws again at once', out.perf.unparkMs < 1500, { ms: out.perf.unparkMs, before: a0.frameTick });
  await sbx('window.__dp.on = false; return 1');
  await PS('on(true)');
});
// 4) the same animation progress at different frame rates: a 30 fps cap vs the screen's 60
await safe('rates', async () => {
  await d.newSketch('labpace spin', SPIN, 3);
  await wait(1500);
  const rate = async (cap) => {
    send({ type: 'fps-cap', value: cap, auto: false, focused: true });
    await wait(800);
    const a = await sbx('return { ...window.__spin, t: performance.now() }');
    await wait(3000);
    const b = await sbx('return { ...window.__spin, t: performance.now() }');
    const dt = (b.t - a.t) / 1000;
    return { fps: Math.round((b.n - a.n) / dt), f60PerSec: +((b.f60 - a.f60) / dt).toFixed(3), oldPerSec: +((b.old - a.old) / dt).toFixed(3) };
  };
  const r60 = await rate(0); const r30 = await rate(5); const r60b = await rate(0); // (5 fps: SwiftShader on a busy machine draws 10–20 at most)
  out.perf.rates = { screen: r60, cap5: r30, screenAgain: r60b };
  const ref = (r60.f60PerSec + r60b.f60PerSec) / 2;
  step('the frame rates really differ (a 5 fps cap vs as fast as it goes)', r30.fps < Math.min(r60.fps, r60b.fps) * 0.75, out.perf.rates);
  step('with f60: the same turn per second at both rates (±10 %)', Math.abs(r30.f60PerSec - ref) / ref < 0.1, out.perf.rates);
  step('before (per frame, no f60): the slower rate turned slower (the bug on 120 / 240 Hz screens, the other way)', r30.oldPerSec < ((r60.oldPerSec + r60b.oldPerSec) / 2) * 0.75, out.perf.rates);
  // the same scene keeps drawing (it moves): pacing never stops an animation; frame gaps on vs off
  const acc = { off: [], on: [] };
  for (let round = 0; round < 2; round += 1) for (const k of ['off', 'on']) { await PS(`on(${k === 'on'})`); await wait(800); acc[k].push(await draws(2500)); }
  const sum = (a) => { const g = []; for (const x of a) { const f = x.list; for (let i = 1; i < f.length; i += 1) g.push(f[i] - f[i - 1]); } const m = g.reduce((s, x) => s + x, 0) / (g.length || 1); return { drawnPerSec: Math.round((a.reduce((s, x) => s + x.drawnPerSec, 0) / a.length) * 10) / 10, p50: pct(g, 0.5), p95: pct(g, 0.95), sd: Math.round(Math.sqrt(g.reduce((s, x) => s + (x - m) ** 2, 0) / (g.length || 1)) * 10) / 10 }; };
  out.perf.animated = { off: sum(acc.off), on: sum(acc.on) };
  step('an animated scene keeps drawing every frame with pacing on (within the machine\'s noise, 20 %)', out.perf.animated.on.drawnPerSec >= out.perf.animated.off.drawnPerSec * 0.8, out.perf.animated);
  const st = await PS();
  out.perf.animatedSigUs = st.sigUs;
  step('the signature costs little per looked-at frame (< 300 µs here)', st.sigUs < 300, { sigUs: st.sigUs });
});
// 5) the Frame pace readout: ⋯ › Frame pace (off by default), the corner chip when ticked
await safe('readout', async () => {
  step('Frame pace readout is off by default', c.pace() === false && document.querySelector('.three-preview .lab-pace-note')?.hidden !== false);
  const more = [...document.querySelectorAll('button')].find((b) => b.dataset.feature === 'Lab more' && b.getBoundingClientRect().width > 0);
  more?.click(); await wait(400);
  // (round 43, menucalm) Frame pace sits under ⋯ › View & help: point at that row to open its flyout
  const vh = [...document.querySelectorAll('.mb-menu .menu-item, #menu button, #menu .menu-item')].find((x) => /View & help/.test(x.textContent || ''));
  if (vh) { // a real pointer move, like menucalm's check (the flyout opens on hover)
    const r = vh.getBoundingClientRect(); const mv = (x) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x, y: r.top + r.height / 2, button: 'none' } });
    await mv(r.left + 20); await mv(r.left + 40); await wait(500);
    if (![...document.querySelectorAll('*')].some((x) => x.children.length < 4 && /Frame pace/.test(x.textContent || '') && x.getBoundingClientRect().width > 0)) { vh.click(); await wait(500); }
  }
  const rows = [...document.querySelectorAll('.menu, .ctx-menu, [role=menu], .tw-menu, .hub-menu, .mb-menu, #menu, #menu-fly, #menu-fly2')].flatMap((m) => [...m.querySelectorAll('*')]).filter((x) => /Frame pace/.test(x.textContent || '') && x.children.length < 4);
  const rowText = rows[0]?.closest('[role=menuitem], .menu-item, button, li, div')?.textContent || '';
  step('⋯ › View & help in the Lab toolbar has a "Frame pace" row that shows the readout', rows.length > 0 && /fps|still|measuring|parked/.test(rowText), rowText.slice(0, 80));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
  c.pace(true); await wait(1500);
  const note = document.querySelector('.three-preview .lab-pace-note');
  await until(() => note && !note.hidden && /fps|still/.test(note.textContent), 4000);
  out.readout = note?.textContent;
  step('ticked: a tiny readout in the preview\'s corner ("NN fps · steady")', Boolean(note && !note.hidden && /\d+ fps · (steady|a few drops|uneven)|still · not drawing/.test(note.textContent)), note?.textContent);
  await smoke({ shot: '/tmp/labpace-readout.png' }).catch(() => null);
  c.pace(false); await wait(200);
  step('… and off again', note.hidden === true);
});
// 6) battery: Auto holds 60 at most, the first adaptive step (85 %), the note says why; plugged in: back
await safe('battery', async () => {
  send({ type: 'fps-cap', value: 0, auto: true, focused: true }); await wait(300);
  await sbx('window.__labAdapt.set({ level: 0, hold: false, target: 1000 }); return 1'); // (a fast machine: never slow here)
  await wait(600);
  send({ type: 'power', battery: true }); await wait(1200);
  const st = await PS();
  const note = document.querySelector('.three-preview .lab-adapt-note');
  await until(() => note && !note.hidden, 3000);
  out.battery = { cap: st.cap, level: st.level, quality: st.quality, note: note?.textContent };
  step('on battery: Auto fps holds 60 at most and the preview starts one step lighter (85 %)', st.cap === 60 && st.level >= 1 && st.quality <= 0.85, out.battery);
  step('… the corner note says it is the battery', /battery/.test(note?.textContent || ''), note?.textContent);
  send({ type: 'power', battery: false }); await wait(1200);
  const st2 = await PS();
  // (Oct 29) Auto holds 60 at most on any screen now (a 240 Hz preview made Windows' audio crackle in every app)
  step('plugged in: Auto\'s 60 and full resolution', st2.cap === 60 && st2.level === 0 && st2.quality === 1, { cap: st2.cap, level: st2.level, quality: st2.quality });
  await sbx('window.__labAdapt.set({ level: 0, hold: false, target: 0 }); return 1');
});
// 7) dragging on a slow preview: 70 % while the pointer is down, full on release
await safe('drag', async () => {
  await sbx('window.__labAdapt.set({ level: 0, hold: true, target: 1 }); return 1'); // (a target of 1 ms: every frame is "slow")
  await sbx('dispatchEvent(new PointerEvent("pointerdown", { button: 0, clientX: 200, clientY: 150 })); return 1');
  await wait(600);
  const a = await PS();
  await sbx('dispatchEvent(new PointerEvent("pointerup", { button: 0, clientX: 220, clientY: 150 })); return 1');
  await wait(400);
  const b = await PS();
  out.drag = { during: a.dragLow, after: b.dragLow };
  step('dragging while frames are slow: the preview draws at 70 % until let go, then full again', a.dragLow === true && b.dragLow === false, out.drag);
  await sbx('window.__labAdapt.set({ level: 0, hold: false, target: 0 }); return 1');
});
// 8) recording / stills are never skipped: a still while the scene is still is the picture
await safe('shot', async () => {
  await d.newSketch('labpace still 2', STILL, 3); await wait(2500);
  const st = await PS();
  const shot = await d.shot();
  step('a screenshot of a still (not drawing) scene comes back with the picture', st.still === true && typeof shot === 'string' && shot.length > 2000, { still: st.still, shotLen: shot?.length || 0 });
});

out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
