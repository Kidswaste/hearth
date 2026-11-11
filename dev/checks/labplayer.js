// (Nov 10, labplayer2) The separate Lab player (PLAYER › SEPARATE on the Lab dock: the preview in its own app and
// graphics process, labplayer/ + labplayermain.js), proven on the real GPU with the windows really on screen.
// docs/upgrades/labplayer2.md has the diagnosis this check guards: the player's window was on screen but its page
// never presented to it (black, 1–5 frames a second) because it was shown behind Chromium's back.
//   - the default is IN-APP and nothing starts the player
//   - SEPARATE: an old-format scene and a v2 scene (format 'gpu') draw in the player: its window is visible, where the
//     Lab's frame is, above Hearth's window; Chromium gives its page frames (≥ 20 a second; the bug gave 1–5); what the
//     window shows is not black; the scene's sliders, song and clock arrive; every message the Lab sent arrived
//   - it still draws after: hidden under a menu and shown again, a fresh restart (⟲), an exact frame size (1920×1080:
//     the page sees 1920×1080)
//   - a heavy scene in the player leaves Hearth's own window its frame rate (the same scene in Hearth's frame is
//     measured next to it)
//   - back to IN-APP: the player's app ends, the preview draws in Hearth's frame again
// Two ways to run it (Windows):
//   silent (the default, dev/smoke-silent.js: nothing on the owner's screen, no sound): every step runs, the player's
//     window follows Hearth's off the screen; the desktop's own pixels are not read. It does NOT tell the black-window
//     bug from the fix: off screen the bug does not happen (the unfixed player got 236 frames a second there).
//   --show: the copy's window ON SCREEN without the focus, about 2 minutes: ask the owner first (their rule: test
//     copies stay out of sight). Only this proves the fix: the bug needs a window really on screen. Hearth's window may be behind another app's, so its occlusion check is off for the run (its frame rate
// is measured):
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist --disable-features=CalculateNativeWinOcclusion" ELECTRON="$PWD/electron/electron.exe" node dev/smoke.js [--show] --check-timeout 400000 --script dev/checks/labplayer.js
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const LP = window.hub.labPlayer;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };
// in the player's page, asked through its own app (not through the Lab's messages)
const lpEval = async (code) => { const r = await LP.debug({ kind: 'eval', code: `JSON.stringify(${code})` }); try { return JSON.parse(r.value); } catch { return r; } };
// the frames Chromium really gives the player's page in a second (the page's own requestAnimationFrame is its paced one: a blank frame's is asked)
const NRAF = `new Promise((res) => { let f = document.getElementById('__nraf'); if (!f) { f = document.createElement('iframe'); f.id = '__nraf'; f.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;border:0;pointer-events:none'; document.body.append(f); } const w = f.contentWindow; let n = 0; const t0 = performance.now(); const g = () => { n++; if (performance.now() - t0 < 1000) w.requestAnimationFrame(g); else res(n); }; w.requestAnimationFrame(g); setTimeout(() => res(n), 3000); })`;
const myFps = (ms = 3000) => new Promise((res) => { let n = 0; let worst = 0; let last = performance.now(); const t0 = last; const f = (t) => { n += 1; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: Math.round(n / ((t - t0) / 1000)), worstMs: Math.round(worst) }); }; requestAnimationFrame(f); setTimeout(() => res({ fps: Math.round(n / (ms / 1000)), worstMs: -1, stalled: true }), ms + 3000); });
const brief = (m) => m?.type;
let tap = [];
window.__labTap = (target, m) => { let clone = true; try { structuredClone(m); } catch { clone = false; } tap.push({ target, type: brief(m), clone }); };
const dockBtn = (i) => document.querySelectorAll('[data-feature="Lab player"] .dock-seg-btn')[i];

// ---------- the scenes ----------
const OLD_HEAD = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000); camera.position.z = 5;
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
`;
const OLD = [
  { id: 'main', name: 'Backdrop', slot: 0, code: `${OLD_HEAD}const P = tweak({ probe: { value: 1, min: 0, max: 5, label: 'Probe' } });
scene.background = new THREE.Color('#2a0f8a'); const seen = new Set();
renderer.setAnimationLoop((now) => { seen.add(Math.round(audio.bass * 100)); window.__probe = { probe: P.probe, distinct: seen.size, t: now / 1000, n: (window.__probe?.n || 0) + 1 }; renderer.render(scene, camera); });` },
  { id: 'l2', name: 'Knot', slot: 1, code: `${OLD_HEAD}scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.4, 200, 32), new THREE.MeshStandardMaterial({ color: '#ff7c5c' })); scene.add(knot);
renderer.setAnimationLoop(() => { knot.rotation.y += 0.01; renderer.render(scene, camera); });` }];
const V2 = [
  { id: 'main', name: 'Backdrop', slot: 0, code: `export default ({ THREE, tsl, scene, tweak, audio, onFrame }) => {
  const { mix, screenUV, uniform } = tsl;
  const P = tweak({ probe: { value: 1, min: 0, max: 5, label: 'Probe' } });
  scene.backgroundNode = mix(uniform(new THREE.Color('#05060c')), uniform(new THREE.Color('#2a0f8a')), screenUV.y.oneMinus());
  const seen = new Set();
  onFrame((t, dt) => { seen.add(Math.round(audio.bass * 100)); window.__probe = { probe: P.probe, distinct: seen.size, t, n: (window.__probe?.n || 0) + 1 }; });
};` },
  { id: 'l2', name: 'Knot', slot: 1, code: `export default ({ THREE, scene, camera, onFrame }) => {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.4, 200, 32), new THREE.MeshStandardNodeMaterial({ color: '#ff7c5c' })); scene.add(knot); camera.position.z = 5;
  onFrame((t, dt) => { knot.rotation.y += dt; });
};` }];
// heavy: 5 layers at 3840×2160, each a full-picture shader that loops 320 times a pixel, drawn as fast as the page is allowed (Max fps)
const HEAVY = Array.from({ length: 5 }, (_, i) => ({ id: i ? `l${i + 1}` : 'main', name: `Heavy ${i + 1}`, slot: i, code: `${OLD_HEAD}const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { t: { value: 0 } }, vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }', fragmentShader: 'uniform float t; varying vec2 v; void main(){ float a = 0.0; for (int i = 0; i < 320; i++) { float f = float(i); a += sin(v.x * f * 0.37 + t + ${i}.0) * cos(v.y * f * 0.21 - t * 0.7) / (1.0 + f * 0.05); } gl_FragColor = vec4(0.5 + 0.5 * sin(a + vec3(0.0, 2.0, 4.0) + ${i}.0), 0.35); }' });
const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); q.frustumCulled = false; scene.add(q);
renderer.setAnimationLoop((now) => { mat.uniforms.t.value = now / 1000; renderer.render(scene, camera); });` }));

async function song(file, secs = 30) {
  const sr = 44100; const n = Math.round(secs * sr); const x = new Float32Array(n); const beat = 60 / 124;
  const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i += 1) x[a + i] += f(i / sr); };
  for (let k = 0; 0.2 + k * beat < secs - 0.5; k += 1) add(0.2 + k * beat, 0.25, (u) => 0.9 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-u * 30)) * u) * Math.exp(-u * 14));
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, str) => [...str].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i += 1) data.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i])) * 0.9 * 32767), true);
  await window.hub.fs.write(file, new Uint8Array(data.buffer));
}

// what the player shows right now: its app's own words (window, frames, picture) + Windows' (which window is in front, the screen's pixels)
async function look(label, { minFps = 20 } = {}) {
  const st = await LP.state();
  let fps = 0; for (let i = 0; i < 3 && fps < minFps; i += 1) { const r = await LP.debug({ kind: 'eval', code: NRAF }); fps = Math.max(fps, Number(r?.value) || 0); } // (best of up to 3 s: another app may hold the GPU for a moment)
  const info = await LP.debug({ kind: 'info' });
  const cap = await LP.debug({ kind: 'capture' });
  const r = { why: st.why, visible: info?.visible, bounds: info?.bounds, fps, lit: cap?.lit != null ? Math.round(cap.lit * 1000) / 1000 : null, colours: cap?.colours ?? null };
  // Windows: where its window is among the others, and (when nothing is over it) what the screen itself shows there
  const wl = info?.pid ? await smoke({ windows: [info.pid] }) : null;
  if (wl?.list) {
    const k = devicePixelRatio;
    const pl = wl.list.find((w) => w.pid === info.pid && w.cls === 'Chrome_WidgetWin_1' && /Lab Player/.test(w.title));
    const me = wl.list.find((w) => w.pid === wl.hearth && w.cls === 'Chrome_WidgetWin_1' && w.title && w.w > 300);
    r.above = pl && me ? pl.z < me.z : null;
    const b = info.bounds; const px = { x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k };
    const hit = (w) => !w.cloaked && !w.min && w.w > 4 && w.h > 4 && w.x < px.x + px.width && w.x + w.w > px.x && w.y < px.y + px.height && w.y + w.h > px.y;
    r.covered = pl ? wl.list.filter((w) => w.z < pl.z && w.pid !== info.pid && hit(w)).length : null;
    r.offScreen = b.x < -10000 || b.y < -10000; // (a silent run: dev/smoke-silent.js keeps Hearth's window, and so the player's, far off the screen)
    if (pl && r.covered === 0 && !r.offScreen) { const s = await smoke({ screen: 'none', rect: px }); r.screen = s?.lit != null ? { lit: s.lit, colours: s.colours } : s; }
  }
  out.measure[label] = r;
  return r;
}
const drawn = (r) => r.visible === true && r.fps >= 20 && r.lit > 0.5 && r.colours > 5 && r.above !== false && (!r.screen || r.screen.lit == null || (r.screen.lit > 0.5 && r.screen.colours > 5));

try {
  if (!LP?.debug) throw new Error('window.hub.labPlayer.debug is missing (the copy must run with HEARTH_LP_DEBUG=1: dev/smoke.js sets it)');
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes && ThreeLab.stageHooks, 60000);
  const c = await ThreeLab.cmd();
  const box = ThreeLab.stageHooks.box;
  c.fps('0'); // Max fps
  ThreeLab.quality?.set('high', { quiet: true });
  const SONG = `${window.SMOKE_TMP || '/tmp'}/hearth-labplayer/song124.wav`;
  await song(SONG);
  const playSong = async () => { const sr = await c.loadSong(SONG); await until(() => c.state.bpm > 0, 20000); c.seek(1); await wait(200); c.play(true); return Boolean(sr?.ok); };
  const slider = async () => { ThreeLab.search.selectLayer('main'); await wait(300); try { c.setSlider('Probe', 3.5); } catch (err) { return String(err); } return until(async () => { const p = await lpEval('window.__probe || null'); return p && Math.abs(p.probe - 3.5) < 1e-6 ? p : null; }, 6000, 200); };

  // ---------- the default ----------
  await until(() => dockBtn(1), 10000);
  const st0 = await LP.state();
  step('default: the dock has PLAYER, IN-APP is on, the player is not running', Boolean(dockBtn(0)?.classList.contains('on')) && !dockBtn(1)?.classList.contains('on') && st0.running === false && !box.onPlayer, { running: st0.running });

  // ---------- an old-format scene: in Hearth's frame first (what the Lab sends it), then in the player ----------
  ThreeLab.scenes.create({ name: 'Player check (old)', code: OLD[0].code, layers: OLD, open: true });
  await until(() => box.ready, 60000);
  await playSong(); await wait(3000);
  const inApp = await pj('({ w: innerWidth, h: innerHeight, n: window.__probe ? window.__probe.n : 0 })');
  c.play(false);
  const sentFrame = new Set(tap.filter((x) => x.target === 'frame').map((x) => x.type));
  const idle = await myFps();
  out.measure.hearthIdle = idle;
  step('Hearth\'s own window draws frames (the run can measure it)', idle.fps >= 30, idle);

  tap = []; await LP.debug({ kind: 'seen' });
  dockBtn(1).click();
  const on = await until(async () => box.onPlayer && box.ready && (await LP.state()).running, 30000);
  step('SEPARATE: the player\'s app starts and its page says ready', Boolean(on), await LP.state());
  await playSong();
  const first = await until(async () => { const p = await lpEval('window.__probe || null'); return p && p.n > 5 ? p : null; }, 30000, 300);
  step('old scene: its layers run in the player', Boolean(first), first);
  await wait(1500);
  const a = await look('old');
  step('old scene: the player\'s window is on screen over the frame, above Hearth\'s, drawing (not black)', drawn(a), a);
  const fr = box.frame.getBoundingClientRect(); const ow = (await LP.state()).owner;
  const pg = await lpEval('({ w: innerWidth, h: innerHeight, health: window.__labHealth ? window.__labHealth() : null })');
  step('old scene: the page has the frame\'s size, both layers, their own contexts', Math.abs(pg.w - inApp.w) <= 2 && Math.abs(pg.h - inApp.h) <= 2 && pg.health?.layers === 2 && pg.health?.contexts === 2, { player: [pg.w, pg.h], inApp: [inApp.w, inApp.h], layers: pg.health?.layers, contexts: pg.health?.contexts });
  step('old scene: the window sits where the Lab\'s frame is', a.bounds && ow && Math.abs(a.bounds.width - fr.width) <= 2 && Math.abs(a.bounds.height - fr.height) <= 2, { window: a.bounds, frame: [Math.round(fr.left), Math.round(fr.top), Math.round(fr.width), Math.round(fr.height)] });
  const sl = await slider();
  step('old scene: a slider moved in the Lab reaches the running layer', Boolean(sl?.probe), sl);
  const au = await until(async () => { const p = await lpEval('window.__probe || null'); return p && p.distinct > 3 ? p : null; }, 8000, 300);
  step('old scene: the song\'s audio values move in the player', Boolean(au), au || await lpEval('window.__probe || null'));
  // every message
  const sentPlayer = tap.filter((x) => x.target === 'player');
  const seen = await LP.debug({ kind: 'seen' });
  const missing = [...sentFrame].filter((t) => !sentPlayer.some((x) => x.type === t) && !['screenshot', 'eval', 'park', 'fps-cap', 'ping', 'dpr', 'life'].includes(t));
  step('messages: everything the Lab sent the player arrived in its app, all of it copyable', Array.isArray(seen) && seen.length >= sentPlayer.length && sentPlayer.every((x) => x.clone), { sent: sentPlayer.length, arrived: seen?.length, notCopyable: sentPlayer.filter((x) => !x.clone).map((x) => x.type) });
  step('messages: the kinds the frame got for this scene, the player got too', missing.length === 0, { missing, frame: [...sentFrame].sort().join(' '), player: [...new Set(sentPlayer.map((x) => x.type))].sort().join(' ') });

  // ---------- under a menu and back; a fresh restart ----------
  const r0 = (await LP.state()).rect; const sc0 = (await LP.state()).scale;
  LP.rect({ visible: false }); await wait(1000);
  const hid = await LP.debug({ kind: 'info' });
  LP.rect({ ...r0, scale: sc0, visible: true }); await wait(1500);
  const b = await look('old, shown again');
  step('hidden (a menu over the picture) and shown again: it draws', hid?.visible === false && drawn(b), { hidden: hid?.visible === false, ...b });
  const pid0 = (await LP.state()).pid;
  box.reload(true);
  await until(() => box.ready, 40000, 100); c.run?.();
  await until(async () => { const p = await lpEval('window.__probe || null'); return p && p.n > 5 ? p : null; }, 30000, 300);
  await wait(1500);
  const f = await look('old, fresh restart');
  step('a fresh restart (the app ended and started again): it draws', drawn(f) && (await LP.state()).pid !== pid0, f);

  // ---------- an exact frame size: the page sees it ----------
  // (a silent run: far off the screen Electron counts a frameless window's unseen resize border as page area after a
  // resize, 16 × 8 px: the page reads 1952 × 1095 there, 1919 × 1080 on screen; measured, so the silent run allows 3 %)
  const tol = ((await LP.state()).bounds?.x ?? 0) < -10000 ? 60 : 2;
  c.customSize(1920, 1080); c.size('custom');
  const exact = await until(async () => { const p = await lpEval('({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })'); return p && Math.abs(p.w - 1920) <= tol && Math.abs(p.h - 1080) <= tol ? p : null; }, 20000, 400);
  await wait(1500);
  const e = await look('old, 1920x1080');
  step('an exact frame size (1920×1080 shown smaller): the page sees 1920×1080 and draws', Boolean(exact) && drawn(e), { page: exact || await lpEval('({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })'), ...e });
  c.size('fit'); await wait(1500);
  c.play(false);

  // ---------- a v2 scene (format 'gpu') in the player ----------
  ThreeLab.scenes.create({ name: 'Player check (v2)', code: V2[0].code, layers: V2, open: true, format: 'gpu' });
  await wait(500); await until(() => box.ready, 60000);
  await playSong();
  const g2 = await until(async () => { const s = await lpEval('window.__labG2 ? (({ on, backend, frames, err, layers, contexts }) => ({ on, backend, frames, err, contexts, layers: layers.length }))(window.__labG2.state()) : null'); return s && s.on && s.layers === 2 && s.frames > 30 ? s : null; }, 120000, 500);
  step('v2 scene: both layers on the ONE WebGPU renderer, in the player', Boolean(g2) && g2.backend === 'webgpu' && g2.contexts === 0, g2 || await lpEval('window.__labG2 ? window.__labG2.state() : "no runtime"'));
  await wait(1000);
  const v = await look('v2');
  step('v2 scene: the player\'s window is on screen, above Hearth\'s, drawing (not black)', drawn(v), v);
  const sl2 = await slider();
  step('v2 scene: a slider and the song\'s audio reach onFrame', Boolean(sl2?.probe) && Boolean(await until(async () => { const p = await lpEval('window.__probe || null'); return p && p.distinct > 3 ? p : null; }, 8000, 300)), await lpEval('window.__probe || null'));
  const errs = D().report?.()?.errors || null;
  step('no layer error reported to the Lab', !errs || !errs.length, errs);
  c.play(false);

  // ---------- a heavy scene: Hearth's own frame rate, with the scene in the player, then in Hearth's frame ----------
  c.customSize(3840, 2160); c.size('custom'); await wait(1500);
  ThreeLab.scenes.create({ name: 'Player check (heavy)', code: HEAVY[0].code, layers: HEAVY, open: true });
  await wait(500); await until(() => box.ready, 60000);
  await until(async () => (await lpEval('window.__labHealth ? window.__labHealth().contexts : 0')) >= 5, 30000, 300);
  await wait(4000);
  const hv = await look('heavy', { minFps: 1 });
  const withPlayer = await myFps(4000);
  withPlayer.scene = c.perf()?.fps ?? null;
  out.measure.hearthHeavyInPlayer = withPlayer;
  step('heavy scene in the player: it is drawn there', hv.visible === true && hv.lit > 0.5 && hv.fps >= 5, hv);
  step('heavy scene in the player: Hearth\'s window keeps its frame rate (≥ 70 % of idle)', withPlayer.fps >= idle.fps * 0.7, { idle: idle.fps, withPlayer: withPlayer.fps, worstMs: withPlayer.worstMs });

  // ---------- back to IN-APP ----------
  dockBtn(0).click();
  const off = await until(async () => !box.onPlayer && box.ready && !(await LP.state()).running, 30000);
  step('IN-APP again: the player\'s app ends, the preview is back in Hearth\'s frame', Boolean(off) && dockBtn(0).classList.contains('on'), await LP.state());
  await until(async () => (await pj('window.__labHealth ? window.__labHealth().contexts : 0')) >= 5, 30000, 300);
  await wait(4000);
  const inFrame = await myFps(4000);
  inFrame.scene = c.perf()?.fps ?? null;
  out.measure.hearthHeavyInApp = inFrame;
  c.size('fit');
  out.summary = `Hearth's window: ${idle.fps} fps idle · ${withPlayer.fps} fps with the heavy scene in the player (worst ${withPlayer.worstMs} ms; the scene ${withPlayer.scene} fps) · ${inFrame.fps} fps with it in Hearth's own frame (worst ${inFrame.worstMs} ms; the scene ${inFrame.scene} fps)`;
  step('the same heavy scene in Hearth\'s frame still runs (measured for comparison)', Boolean(await pj('window.__labHealth().layers')) , inFrame);
} catch (err) { out.error = String(err?.stack || err); (out.problems ||= []).push('the check stopped'); }
try { if (ThreeLab.stageHooks.box.onPlayer) dockBtn(0).click(); } catch { /* gone */ }
return JSON.stringify(out, null, 1);
