// 📷 Camera input (round 25, motion: tools/three-motion-in*.js + the sandbox's "camera input" block): a fake camera
// (getUserMedia stubbed with a canvas stream of a white square moving on a dark picture; enumerateDevices with a
// webcam and a capture card). Checks: off by default; /webcam on → the ● Camera pill, frames reach the preview; the
// light tracker's movement / regions / where-it-moves follow the square (mirrored and not); still = no movement; a
// slider following camMotion moves in the preview; "particles follow my hands" puts the particles where the square
// is; a camera layer draws the picture; MediaPipe's path with a stub bundle (hands / pinch, face / mouth, the mask)
// through the same Worker; the director's pictures pixelated (and not once shared); the camera pauses (tracks
// stopped) while the Lab is off screen and comes back; a video file as the camera; three_do motion ops; /webcam off.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/motion-in.js --shot /tmp/hearth-motion-in.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const r2 = (x) => Math.round(x * 100) / 100;
const M = () => LabMotionIn;

// ---------- the fake camera: a white square on a dark picture, where the check puts it ----------
const cam = document.createElement('canvas'); cam.width = 320; cam.height = 240;
const g = cam.getContext('2d');
const sq = { x: 0.2, y: 0.5, mode: 'still', t0: performance.now() };
const draw = () => {
  const t = (performance.now() - sq.t0) / 1000;
  if (sq.mode === 'bob') sq.y = 0.5 + 0.25 * Math.sin(t * 7);
  if (sq.mode === 'sweep') sq.x = 0.5 + 0.35 * Math.sin(t * 1.6);
  g.fillStyle = '#121218'; g.fillRect(0, 0, 320, 240);
  g.fillStyle = '#f2f2f2'; g.fillRect(sq.x * 320 - 28, sq.y * 240 - 28, 56, 56);
};
const painter = setInterval(draw, 30);
const asked = [];
const streams = [];
navigator.mediaDevices.getUserMedia = async (c) => { asked.push(c); const s = cam.captureStream(30); streams.push(s); return s; };
navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD Camera', groupId: 'a' }, { kind: 'videoinput', deviceId: 'cam-2', label: 'Elgato Cam Link 4K', groupId: 'b' }, { kind: 'audioinput', deviceId: 'mic', label: 'Mic', groupId: 'c' }];

activate('tool:three'); await wait(400);
await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(400); } return r; };
const BASE = `import * as THREE from 'three';
const P = tweak({ size: [1, 0.2, 3], spin: [0, -3, 3], glow: [0.5, 0, 2] });
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#05060a'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffd75e', wireframe: true })); scene.add(mesh);
renderer.setAnimationLoop(() => { globalThis.__sz = P.size; globalThis.__spin = P.spin; globalThis.__glow = P.glow; mesh.scale.setScalar(P.size); mesh.rotation.y += P.spin * 0.01; renderer.render(scene, camera); });`;
await d.newSketch('camera probe', BASE, 3);
await until(async () => typeof (await sbx1('return globalThis.__sz')) === 'number', 15000);

step('loaded with the Lab: LabMotionIn, /webcam, the camera block in the preview', typeof LabMotionIn !== 'undefined' && Commands.get('webcam')?.area === 'Three.js Lab' && (await sbx('return typeof webcam === "object" && typeof webcam.layer === "function"')) === true);
step('no duplicate commands', !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
step('off by default: no camera asked for, no pill', !M().state.on && !asked.length && !document.querySelector('.motion-in-pill'));
const longs = [];
const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { const mine = (e.scripts || []).filter((s) => /three-motion-in/.test(s.sourceURL || '')); if (mine.length) longs.push({ ms: Math.round(e.duration), by: mine.map((s) => `${s.sourceFunctionName || ''} ${Math.round(s.duration)}ms`).slice(0, 2) }); } });
try { po.observe({ type: 'long-animation-frame', buffered: false }); } catch { /* no LoAF */ }

// ---------- on: frames, the pill ----------
await safe('on', async () => {
  const t = await say('/webcam on');
  await until(() => M().state.frames > 10, 8000);
  step('/webcam on: the camera starts, frames reach the preview', M().state.on && M().state.frames > 10 && asked.length === 1, { said: t.slice(0, 120), frames: M().state.frames, asked: asked[0] });
  step('the ● Camera pill on the preview', Boolean(document.querySelector('.three-preview .motion-in-pill')) && /Camera/.test(document.querySelector('.motion-in-pill').textContent));
  step('a webcam is mirrored by default', M().state.mirror === true);
  const dv = await say('/webcam devices');
  step('/webcam devices: the webcam and the capture card (🎛)', /FaceTime/.test(dv) && /🎛 Elgato/.test(dv), dv);
});

// ---------- the light tracker follows the square ----------
const probe = async () => (await M().probe())?.values || {};
const avgOf = async (ms, names) => { const acc = Object.fromEntries(names.map((n) => [n, 0])); let k = 0; const t = Date.now(); while (Date.now() - t < ms) { const v = await probe(); for (const n of names) acc[n] += v[n] || 0; k += 1; await wait(120); } for (const n of names) acc[n] = r2(acc[n] / Math.max(1, k)); return acc; };
await safe('light tracker', async () => {
  await say('/webcam mirror off');
  Object.assign(sq, { x: 0.2, mode: 'bob' }); await wait(900);
  const L = await avgOf(1500, ['camMotion', 'camLeft', 'camRight', 'camX', 'handX']);
  Object.assign(sq, { x: 0.8, mode: 'bob' }); await wait(900);
  const R = await avgOf(1500, ['camMotion', 'camLeft', 'camRight', 'camX', 'handX']);
  step('moving on the left: movement on the left, where it moves < 0.4', L.camMotion > 0.1 && L.camLeft > L.camRight + 0.1 && L.camX < 0.4, L);
  step('moving on the right: movement on the right, where it moves > 0.6', R.camRight > R.camLeft + 0.1 && R.camX > 0.6, R);
  step('light mode: the hand stands in where it moves', L.handX < 0.4 && R.handX > 0.6, { left: L.handX, right: R.handX });
  sq.mode = 'still'; await wait(1200);
  const S0 = await avgOf(800, ['camMotion']);
  step('still: no movement', S0.camMotion < 0.05, S0);
  // sweeping left ↔ right: where it moves follows the square (correlation)
  Object.assign(sq, { mode: 'sweep', t0: performance.now() }); await wait(500);
  const xs = []; const ys = []; const t = Date.now();
  while (Date.now() - t < 4000) { const v = await probe(); xs.push(v.camX); ys.push(sq.x); await wait(100); }
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length; const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  // (the tracker answers a frame or two late on a loaded machine: the best of a few lags)
  let corr = -1;
  for (let lag = 0; lag <= 4; lag++) { let sxy = 0; let sxx = 0; let syy = 0; for (let i = 0; i + lag < xs.length; i++) { const x = xs[i + lag] - mx; const y = ys[i] - my; sxy += x * y; sxx += x * x; syy += y * y; } corr = Math.max(corr, sxy / Math.sqrt(sxx * syy || 1)); }
  step('sweeping: where it moves follows the square (correlation > 0.7)', corr > 0.7, { corr: r2(corr), n: xs.length });
  await say('/webcam mirror on');
  Object.assign(sq, { x: 0.2, mode: 'bob' }); await wait(1000);
  const LM = await avgOf(1200, ['camLeft', 'camRight', 'camX']);
  step('mirrored: the square on the camera\'s left reads on the screen\'s right', LM.camRight > LM.camLeft && LM.camX > 0.6, LM);
  await say('/webcam mirror off');
});

// ---------- a slider follows the movement ----------
await safe('mapping', async () => {
  sq.mode = 'still'; await wait(1200);
  const t = await say('/webcam follow size camMotion 100%');
  await wait(600);
  const still = await sbx('return globalThis.__sz');
  Object.assign(sq, { x: 0.5, mode: 'bob' }); await wait(1200);
  let moving = 0; for (let i = 0; i < 8; i++) { moving = Math.max(moving, await sbx('return globalThis.__sz')); await wait(100); }
  step('/webcam follow size camMotion: the slider grows with movement in the preview', /follows/.test(t) && still < 1.15 && moving > 1.4, { said: t.slice(0, 80), still: r2(still), moving: r2(moving) });
  const row = ThreeAudio.lab.selCtl().controls().find((c) => c.key === 'size');
  step('…through the ♪ react-to mapping (curve editor, meters): bound to camMotion', row?.followsMusic?.band === 'camMotion', row?.followsMusic);
  step('the curve editor\'s picker lists the camera\'s features (📷 groups)', ThreeAudio.GROUPS.some((x) => x[0] === '📷 Hands') && ThreeAudio.label('pinch') === 'Pinch (thumb + index)');
  await say('/react-to size off');
});

// ---------- particles follow the tracked point ----------
await safe('particles', async () => {
  const t = await say('/webcam look hands-particles');
  step('look "Particles follow my hands": a particle layer whose emitter follows the hand', /Hand sparks/.test(t) && d.layers().layers.some((x) => /Hand sparks/.test(x.name)), t.slice(0, 140));
  const id = d.layers().layers.find((x) => /Hand sparks/.test(x.name))?.id;
  const PL = ThreeAudio.lab.layers().find((x) => /Hand sparks/.test(x.name));
  const diag = { layers: d.layers().layers.map((x) => x.name), emit: PL?.ctl?.controls?.().filter((c) => /^emit[XY]$/.test(c.key)).map((c) => [c.key, c.value, c.followsMusic?.band]) };
  const meanX = async () => { const p = await sbx(`return window.__labParticles.probe(${JSON.stringify(id)}, 32)`); const m = p?.mean; return Array.isArray(m) ? m[0] : m?.x ?? null; };
  Object.assign(sq, { x: 0.15, mode: 'bob' }); await until(async () => (await M().probe())?.values.handX < 0.3, 10000); await wait(2500);
  const left = await meanX(); const hl = (await M().probe())?.values.handX;
  Object.assign(sq, { x: 0.85, mode: 'bob' }); await until(async () => (await M().probe())?.values.handX > 0.7, 10000); await wait(2500);
  const right = await meanX(); const hr = (await M().probe())?.values.handX;
  step('particles are born where the square is (left, then right)', left != null && right != null && left < -0.4 && right > 0.4, { left: r2(left), right: r2(right), handX: [hl, hr], diag });
  await HubBridge.call('three_do', { cmd: 'remove_layer', layer: id });
});

// ---------- a camera layer draws the picture; the director's pictures are pixelated ----------
await safe('layer + privacy', async () => {
  const t = await say('/webcam look camera-bg');
  await wait(1500);
  const lit = await sbx('const c = [...document.querySelectorAll("canvas")].find((x) => x.__cam); if (!c) return -1; const s = document.createElement("canvas"); s.width = 64; s.height = 48; const g = s.getContext("2d"); g.drawImage(c, 0, 0, 64, 48); const d = g.getImageData(0, 0, 64, 48).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 180) n++; return n;');
  step('look "Camera as the background": the layer shows the camera\'s picture (the white square)', /Camera/.test(t) && lit > 20, { said: t.slice(0, 80), bright: lit });
  const v1 = await sbx('const c = document.createElement("canvas"); c.width = 64; c.height = 48; return [Boolean(__camVeil(c, "get")), Boolean(__camVeil(c, "thumb")), Boolean(__camVeil(c, null))]');
  step('the director\'s pictures and thumbnails are pixelated while the camera shows; your own screenshots aren\'t', JSON.stringify(v1) === '[true,true,false]', v1);
  await say('/webcam share on'); await wait(300);
  const v2 = await sbx('const c = document.createElement("canvas"); return Boolean(__camVeil(c, "get"))');
  step('/webcam share on: the director sees it', v2 === false);
  await say('/webcam share off');
  const shot = await HubBridge.call('three_screenshot', {});
  step('three_screenshot still works with the camera on', shot?.ok !== false, shot?.error);
});

// ---------- MediaPipe's path with a stub bundle ----------
const STUB = `(function () {
  function scan(b) { const c = new OffscreenCanvas(64, 48); const g = c.getContext('2d'); g.drawImage(b, 0, 0, 64, 48); const d = g.getImageData(0, 0, 64, 48).data; let sx = 0; let sy = 0; let n = 0; for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) if (d[(y * 64 + x) * 4] > 200) { sx += x; sy += y; n++; } return n ? { x: sx / n / 64, y: sy / n / 48 } : null; }
  function hand(p) { const L = []; for (let i = 0; i < 21; i++) L.push({ x: p.x, y: p.y + 0.06 }); [[5, 8], [9, 12], [13, 16], [17, 20]].forEach(([a, b], k) => { for (let j = a; j <= b; j++) L[j] = { x: p.x + (k - 1.5) * 0.02, y: p.y - 0.03 - (j - a) * 0.03 }; }); L[0] = { x: p.x, y: p.y + 0.06 }; for (let j = 1; j <= 4; j++) L[j] = { x: p.x - 0.03 - j * 0.01, y: p.y + 0.02 - j * 0.01 }; L[4] = { ...L[8] }; return L; }
  class T { static async createFromOptions(fs, o) { const t = new this(); t.o = o; self.__stubMade = (self.__stubMade || 0) + 1; return t; } }
  exports.HandLandmarker = class extends T { detectForVideo(b) { const p = scan(b); return { landmarks: p ? [hand(p)] : [] }; } };
  exports.PoseLandmarker = class extends T { detectForVideo(b) { const p = scan(b) || { x: 0.5, y: 0.5 }; const L = []; for (let i = 0; i < 33; i++) L.push({ x: p.x, y: p.y + 0.2, visibility: 1 }); L[0] = { x: p.x, y: p.y, visibility: 1 }; L[11] = { x: p.x + 0.1, y: p.y + 0.15, visibility: 1 }; L[12] = { x: p.x - 0.1, y: p.y + 0.15, visibility: 1 }; L[7] = { x: p.x + 0.04, y: p.y }; L[8] = { x: p.x - 0.04, y: p.y }; return { landmarks: [L] }; } };
  exports.FaceLandmarker = class extends T { detectForVideo(b) { const p = scan(b) || { x: 0.5, y: 0.5 }; const L = []; for (let i = 0; i < 478; i++) L.push({ x: p.x, y: p.y }); return { faceLandmarks: [L], faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: 0.75 }, { categoryName: 'mouthSmileLeft', score: 0.1 }, { categoryName: 'mouthSmileRight', score: 0.1 }] }] }; } };
  exports.ImageSegmenter = class extends T { segmentForVideo(b, ts, cb) { const p = scan(b); const w = 32; const h = 24; const f = new Float32Array(w * h); if (p) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(x / w - p.x) < 0.12 && Math.abs(y / h - p.y) < 0.15) f[y * w + x] = 1; cb({ confidenceMasks: [{ width: w, height: h, getAsFloat32Array: () => f }] }); } };
})();`;
await safe('mediapipe stub', async () => {
  const before = await window.hub.motion.status();
  step('status: the tracking files aren\'t here (nothing downloaded by itself)', before && !before.ready && !before.downloading && before.bytes > 20e6, { missing: before?.missing, mb: Math.round((before?.bytes || 0) / 1e6) });
  // a slider follows the pinch: the scene now wants hands; with no files the hub offers the download once (a toast), never starts it
  await say('/react-to glow pinch 100%');
  await until(() => M().state.offered && M().state.want.includes('hands'), 6000);
  step('wanting hands with no files: a one-time download offer (a toast), never started by itself', M().state.offered && M().state.want.includes('hands') && !(await window.hub.motion.status()).downloading, M().state.want);
  M().stub(STUB);
  Object.assign(sq, { x: 0.3, y: 0.4, mode: 'still' }); await wait(300); sq.mode = 'bob';
  await until(async () => (await M().probe())?.engine === 'mediapipe', 8000);
  const p = await M().probe();
  step('the stub bundle loads in the preview\'s Worker: MediaPipe engine, hands task', p?.engine === 'mediapipe' && p.tasks.includes('hands') && p.values.tracked === 1, { engine: p?.engine, tasks: p?.tasks, mp: p?.mp, error: p?.error });
  step('hands: a pinch, the hand where the square is', p?.values.pinch > 0.8 && p.values.handX < 0.45, { pinch: p?.values.pinch, x: p?.values.handX, y: p?.values.handY, pts: p?.pts });
  let gl = 0; for (let i = 0; i < 6; i++) { gl = Math.max(gl, await sbx('return globalThis.__glow')); await wait(120); }
  step('the glow slider follows the pinch in the preview', gl > 1.8, r2(gl));
  // the face (mouth) and the mask are loaded the first time something reads them
  await say('/react-to spin mouthOpen 100%');
  const cut = await say('/webcam look cutout');
  await until(async () => { const q = await M().probe(); return q?.tasks.includes('face') && q.tasks.includes('mask') && q.mask && !q.mask.motion; }, 8000);
  const q = await M().probe();
  step('face and mask load when read: mouth open, the person\'s mask', q?.values.mouthOpen > 0.8 && q.mask && !q.mask.motion && q.values.maskArea > 0.02, { tasks: q?.tasks, mouth: q?.values.mouthOpen, mask: q?.mask, area: q?.values.maskArea, said: cut.slice(0, 60) });
  const sp = await sbx('return globalThis.__spin');
  step('the spin slider follows the open mouth', sp > 2, r2(sp));
  const pose = await HubBridge.call('three_do', { cmd: 'motion', op: 'track', names: ['headX', 'person'] });
  step('three_do motion track: the values now (for the director)', pose?.ok && pose.value?.values && 'headX' in pose.value.values, pose?.error || pose?.value);
  await say('/react-off everything');
});

// ---------- director ops; the motion kit still answers its own ----------
await safe('director', async () => {
  const st0 = await HubBridge.call('three_do', { cmd: 'motion', op: 'camera' });
  step('three_do motion camera: status (on, source, devices)', st0?.ok && st0.value.camera === 'on' && st0.value.devices.length === 2, st0?.value || st0?.error);
  const lk = await HubBridge.call('three_do', { cmd: 'motion', op: 'looks' });
  step('three_do motion looks', lk?.ok && /hands-particles/.test(lk.value) && /mouth-bloom/.test(lk.value));
  const kit = await HubBridge.call('three_do', { cmd: 'motion', op: 'list', family: 'type' });
  step('three_do motion list: the motion-design kit still answers', kit?.ok && /cascade/i.test(kit.value), kit?.error);
  const fo = await HubBridge.call('three_do', { cmd: 'motion', op: 'follow', slider: 'size', feature: 'handX', amount: 0.3 });
  step('three_do motion follow', fo?.ok && /follows/.test(fo.value), fo?.error || fo?.value);
  await say('/react-to size off');
});

// ---------- the Lab off screen: paused (tracks stopped), back on screen: on again ----------
await safe('pause', async () => {
  const n0 = streams.length;
  activate(H.claudeAgent().id);
  await until(() => M().state.paused, 6000);
  const ended = streams[streams.length - 1]?.getVideoTracks()[0]?.readyState;
  step('Lab off screen: the camera pauses (its track stops: the light goes off)', M().state.paused && ended === 'ended', { paused: M().state.paused, track: ended });
  activate('tool:three');
  await until(() => !M().state.paused && streams.length > n0, 6000);
  const f0 = M().state.frames; await until(() => M().state.frames > f0 + 3, 8000);
  step('back on screen: the camera comes back by itself', !M().state.paused && M().state.frames > f0 + 3, { frames: M().state.frames - f0, state: M().state });
});

// ---------- a video file as the camera ----------
await safe('file', async () => {
  Object.assign(sq, { x: 0.5, mode: 'sweep', t0: performance.now() });
  const rec = new MediaRecorder(cam.captureStream(30), { mimeType: 'video/webm' });
  const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
  rec.start(); await wait(2500); rec.stop(); await new Promise((r) => { rec.onstop = r; });
  const file = '/tmp/hearth-motion-in-check.webm';
  await window.hub.fs.write(file, new Uint8Array(await new Blob(parts).arrayBuffer()));
  const t = await say(`/webcam file ${file}`);
  await until(() => M().state.kind === 'file' && M().state.frames > 10, 8000);
  const v = await avgOf(1500, ['camMotion']);
  step('/webcam file: a video file plays as the camera (tracked)', /plays as the camera/.test(t) && M().state.kind === 'file' && v.camMotion > 0.05, { said: t.slice(0, 80), motion: v.camMotion });
});

// ---------- off ----------
await safe('off', async () => {
  const t = await say('/webcam off');
  await wait(400);
  const p = await M().probe();
  step('/webcam off: the camera stops, the pill goes, the features rest', /off/.test(t) && !M().state.on && !document.querySelector('.motion-in-pill') && p && !p.live && p.values.camMotion === 0, { live: p?.live });
});
po.disconnect();
step('no slow frames from the camera code (none over 50 ms)', longs.every((l) => l.ms < 50), longs.slice(0, 5));
clearInterval(painter);
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ ok: !bad.length, failed: bad.length, steps: out.steps }, null, 1);
