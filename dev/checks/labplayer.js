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
  const byDefault = Boolean(LP.byDefault); // (HEARTH_LP_DEFAULT=1: as in the owner's app on Windows)
  out.byDefault = byDefault;
  if (byDefault) {
    ThreeLab.scenes.create({ name: 'Player check (default)', code: OLD[0].code, layers: OLD, open: true });
    const up = await until(async () => box.onPlayer && box.ready && (await LP.state()).running, 40000);
    const drew = await until(async () => { const p = await lpEval('window.__probe || null'); return p && p.n > 5 ? p : null; }, 30000, 300);
    step('default: SEPARATE is on without a click, a new scene runs in the player', Boolean(up) && Boolean(drew) && dockBtn(1).classList.contains('on') && window.LabBoot?.state?.().skipped === 'the scene runs in the player', { state: await LP.state(), warm: window.LabBoot?.state?.().skipped });
    dockBtn(0).click(); // (in Hearth's frame first: what the Lab sends a frame is recorded below)
    await until(async () => !box.onPlayer && !(await LP.state()).running, 20000);
  } else {
    const st0 = await LP.state();
    step('a test copy without HEARTH_LP_DEFAULT=1: IN-APP is on, the player is not running', Boolean(dockBtn(0)?.classList.contains('on')) && !dockBtn(1)?.classList.contains('on') && st0.running === false && !box.onPlayer, { running: st0.running });
  }

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

  // ---------- working on the live scene, through the player ----------
  const health = () => lpEval('window.__labHealth ? window.__labHealth() : null');
  await D().updateLayer('l2', { code: `${OLD[1].code}\nwindow.__edited = (window.__edited || 0) + 1;` }, 1.5);
  step('a live code edit of a layer runs in the player', Boolean(await until(async () => (await lpEval('window.__edited || 0')) >= 1, 8000, 200)), await lpEval('window.__edited || 0'));
  const added = await D().addLayer({ name: 'Extra', code: `${OLD_HEAD}window.__extra = 1;\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));` }, 1.5);
  const h3 = await until(async () => { const h = await health(); return h?.layers === 3 ? h : null; }, 8000, 200);
  step('a layer added in the Lab runs in the player', Boolean(h3) && (await lpEval('window.__extra || 0')) === 1, { added: added && (added.id || added.layer || Object.keys(added)), layers: (await health())?.layers });
  let rmErr = null; try { await D().removeLayer(added?.id || added?.layer?.id || 'Extra'); } catch (err) { rmErr = String(err.message || err); }
  const h2 = await until(async () => { const h = await health(); return h?.layers === 2 ? h : null; }, 8000, 200);
  step('a layer removed in the Lab is gone from the player', Boolean(h2), { layers: (await health())?.layers, rmErr });
  const shot = await D().shot().catch((err) => ({ error: String(err.message || err) }));
  const shotLen = typeof shot === 'string' ? shot.length : String(shot?.dataUrl || shot?.url || shot?.image || '').length;
  step('the AI\'s picture of the scene (three_shot) comes from the player', shotLen > 2000, { type: typeof shot, keys: shot && typeof shot === 'object' ? Object.keys(shot) : null, length: shotLen, error: shot?.error });
  await D().updateLayer('l2', { code: `${OLD_HEAD}renderer.setAnimationLoop(() => { throw new Error('labplayer check: thrown on purpose'); });` }, 1.5);
  const errSeen = await until(() => { const e = D().report?.()?.errors || []; return e.length && /thrown on purpose/.test(JSON.stringify(e)) ? e : null; }, 8000, 200);
  step('a layer\'s error in the player reaches the Lab\'s report (what the AIs read)', Boolean(errSeen), (errSeen || D().report?.()?.errors || []).slice(0, 2));
  await D().updateLayer('l2', { code: OLD[1].code }, 1.5);
  const pf = c.perf();
  step('the Lab\'s stats line gets the player\'s frame rate', pf?.fps > 0, { fps: pf?.fps, frameMsP50: pf?.frameMsP50, quality: pf?.quality });
  // Hearth's 🔊 playback volume
  const vol0 = await window.hub.volume.get();
  const i0 = await LP.debug({ kind: 'info' });
  await window.hub.volume.set(0.3); await wait(400);
  const i1 = await LP.debug({ kind: 'info' });
  const pageVol = await lpEval('window.__hearthVolume ? true : false');
  await window.hub.volume.set(vol0);
  step('sound: the player follows Hearth\'s volume (at start and when it changes)', Math.abs(i0.volume - vol0) < 1e-6 && Math.abs(i1.volume - 0.3) < 1e-6 && pageVol === true, { atStart: i0.volume, hearth: vol0, afterSet: i1.volume, pageScript: pageVol, mutedForTheTest: i1.muted });
  // a menu over the picture: the player steps aside, a still of the scene stays in the frame
  const fr0 = box.frame.getBoundingClientRect();
  popMenu(fr0.left + 40, fr0.top + 40, ['Player check', ['Nothing', 'A menu over the picture', () => {}]]);
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  const aside = await until(async () => (await LP.state()).why === 'the Lab says hidden', 5000, 100);
  const still = await until(() => { const cv = box.frame.parentNode.querySelector('.scene-cover'); return cv && !cv.classList.contains('out') && /url\(/.test(cv.style.backgroundImage) ? true : null; }, 4000, 100);
  document.querySelectorAll('.mb-menu.lab-pop').forEach((n) => n.remove());
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const backUp = await until(async () => (await LP.state()).why === '' && (await LP.debug({ kind: 'info' })).visible, 5000, 100);
  step('a menu over the picture: the player steps aside, a still of the scene stays in the frame, then it is back', Boolean(aside) && Boolean(still) && Boolean(backUp), { aside: Boolean(aside), still: Boolean(still), back: Boolean(backUp) });
  // a menu that is NOT over the picture leaves the player where it is
  popMenu(4, innerHeight - 60, ['Player check', ['Nothing', 'A menu beside the picture', () => {}]]);
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await wait(500);
  const beside = (await LP.state()).why;
  const menuBox = document.querySelector('.mb-menu.lab-pop')?.getBoundingClientRect();
  document.querySelectorAll('.mb-menu.lab-pop').forEach((n) => n.remove()); document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const fr1 = box.frame.getBoundingClientRect();
  const overlaps = menuBox && menuBox.left < fr1.right && menuBox.right > fr1.left && menuBox.top < fr1.bottom && menuBox.bottom > fr1.top;
  step('a menu beside the picture leaves the player on screen', overlaps ? true : beside === '', { why: beside, overlaps: Boolean(overlaps) });
  // 📷 Camera in: a made-up camera (a white square sweeping on a dark picture), its frames reach the player as JPEGs
  try {
    const camC = document.createElement('canvas'); camC.width = 320; camC.height = 240; const cg = camC.getContext('2d'); const t0 = performance.now();
    const camT = setInterval(() => { const t = (performance.now() - t0) / 1000; cg.fillStyle = '#121218'; cg.fillRect(0, 0, 320, 240); cg.fillStyle = '#f2f2f2'; cg.fillRect((0.5 + 0.35 * Math.sin(t * 1.6)) * 320 - 28, 92, 56, 56); }, 30);
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); const enu = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async () => camC.captureStream(30);
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'cam-1', label: 'Test Camera', groupId: 'a' }];
    await LabMotionIn.start();
    const got = await until(() => LabMotionIn.state.frames > 10, 10000, 200);
    let moved = null;
    for (let i = 0; i < 25 && !moved; i += 1) { const v = (await LabMotionIn.probe())?.values || {}; const top = Object.entries(v).filter(([, x]) => typeof x === 'number' && x > 0.02); if (top.length) moved = Object.fromEntries(top.slice(0, 4)); else await wait(200); }
    step('📷 Camera in: frames reach the player and its tracker sees the movement', Boolean(got) && Boolean(moved), { sent: LabMotionIn.state.frames, values: moved, error: LabMotionIn.state.error });
    await LabMotionIn.stop(); clearInterval(camT); navigator.mediaDevices.getUserMedia = gum; navigator.mediaDevices.enumerateDevices = enu;
  } catch (err) { step('📷 Camera in: frames reach the player and its tracker sees the movement', false, String(err?.message || err)); }
  // a recorded clip of the scene
  try {
    const take = await Promise.race([c.recordClip({ seconds: 1.5 }), wait(30000).then(() => ({ timeout: true }))]);
    const size = take?.size ?? take?.bytes?.length ?? take?.blob?.size ?? take?.buffer?.byteLength ?? 0;
    step('⏺ a recorded clip of the scene comes back from the player', Boolean(take) && !take.timeout && !take.error && (size > 2000 || Boolean(take.path || take.file || take.url)), take && typeof take === 'object' ? { keys: Object.keys(take).slice(0, 12), size, path: take.path || take.file || null, error: take.error, timeout: take.timeout } : take);
  } catch (err) { step('⏺ a recorded clip of the scene comes back from the player', false, String(err?.message || err)); }
  // the Stage window takes the scene, and gives it back to the player
  ThreeLab.stageHooks.setStage(true);
  const onStage = await until(async () => box.onStage && box.ready && !(await LP.state()).running, 30000);
  ThreeLab.stageHooks.setStage(false);
  const offStage = await until(async () => box.onPlayer && box.ready && (await LP.state()).running, 30000);
  await until(async () => { const p = await lpEval('window.__probe || null'); return p && p.n > 5 ? p : null; }, 30000, 300);
  step('🖥 the Stage window takes the scene (the player ends) and gives it back', Boolean(onStage) && Boolean(offStage), { onStage: Boolean(onStage), back: Boolean(offStage) });
  // the player's page dies: the scene is back in Hearth's frame, and the owner is told
  await LP.debug({ kind: 'crash' });
  const fell = await until(() => !box.onPlayer && box.ready, 30000);
  const told = await until(() => (/separate player (stopped unexpectedly|didn)/.test(document.body.innerText) ? document.body.innerText.match(/The scene's separate player[^\n]{0,260}/)?.[0] : null), 5000, 200);
  const inFrameAgain = await until(async () => { const p = await pj('window.__probe || null'); return p && p.n > 5 ? p : null; }, 30000, 300);
  step('the player\'s page crashes: the scene runs in Hearth\'s frame again and the owner is told in words', Boolean(fell) && Boolean(told) && Boolean(inFrameAgain) && dockBtn(0).classList.contains('on'), { told, inFrame: Boolean(inFrameAgain) });
  [...document.querySelectorAll('button')].find((b2) => /Try the player again/.test(b2.textContent))?.click();
  const again = await until(async () => box.onPlayer && box.ready && (await LP.state()).running, 30000);
  await until(async () => { const p = await lpEval('window.__probe || null'); return p && p.n > 5 ? p : null; }, 30000, 300);
  step('"Try the player again" puts the scene back in the player', Boolean(again) && dockBtn(1).classList.contains('on'), await LP.state());
  await playSong(); await wait(1000);

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
