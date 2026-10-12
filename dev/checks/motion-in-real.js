// 📷 Camera input with the REAL MediaPipe files (round 25, motion), when they're on this machine: the pinned files
// (vision_bundle.cjs, vision_wasm_internal.js / .wasm, hand / pose / face landmarkers, the selfie segmenter) put in
// /tmp/hearth-mediapipe by hand (curl from the npm tarball and storage.googleapis.com/mediapipe-models), copied into
// the throwaway data folder as if downloaded. Checks the real library loads in the preview's Worker (the CommonJS
// bundle through importScripts, the wasm from a blob URL, the sandbox's CSP), every task is made and runs on frames of
// a fake camera, without errors. (A drawn square has no hand or face: this checks the path, not the detection.)
// Without the files it says so and passes.
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/motion-in-real.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(200); } return false; };
const steps = [];
const T0 = Date.now(); let last = ''; const log = (m) => { if (m === last) return; last = m; steps.push({ name: `@${Math.round((Date.now() - T0) / 1000)}s ${m}`, ok: true }); };
const race = (pr, ms, what) => { let done = false; return Promise.race([pr.then((v) => { done = true; return v; }), wait(ms).then(() => { if (!done) log(`timeout: ${what}`); return null; })]); };
const step = (name, ok, info) => steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) });
const SRC = '/tmp/hearth-mediapipe';
const NAMES = ['vision_bundle.cjs', 'vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'hand_landmarker.task', 'pose_landmarker_lite.task', 'face_landmarker.task', 'selfie_segmenter.tflite'];
const here = await Promise.all(NAMES.map((n) => window.hub.fs.stat(`${SRC}/${n}`)));
if (here.some((s) => !s)) return JSON.stringify({ ok: true, skipped: `the real MediaPipe files aren't in ${SRC}` });
const cam = document.createElement('canvas'); cam.width = 320; cam.height = 240; const g = cam.getContext('2d');
const painter = setInterval(() => { const t = performance.now() / 1000; g.fillStyle = '#202024'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#e8c8a8'; g.beginPath(); g.arc(160 + 60 * Math.sin(t * 2), 110, 46, 0, Math.PI * 2); g.fill(); }, 30);
navigator.mediaDevices.getUserMedia = async () => cam.captureStream(30);
activate('tool:three'); await wait(400);
await ThreeLab.cmd();
const d = ThreeLab.director;
log('lab'); await race(d.newSketch('camera real', `const P = tweak({ glow: [0.5, 0, 2], spin: [0, -3, 3], size: [1, 0.2, 3], zoom: [1, 0.5, 2] });\nrequestAnimationFrame(function f() { globalThis.__v = [P.glow, P.spin, P.size, P.zoom]; requestAnimationFrame(f); });`, 3), 20000, 'newSketch');
await wait(1500);
const s0 = await window.hub.motion.status();
for (const n of NAMES) await window.hub.fs.copy(`${SRC}/${n}`, `${s0.dir}/${n}`);
const s1 = await window.hub.motion.status();
step('the files count as downloaded (status ready, nothing missing)', s1.ready && !s1.missing.length, s1.missing);
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
log('copied'); log(await race(say('/webcam on'), 15000, 'on'));
// read hands, face and the mask: each task loads the first time something reads it
await say('/react-to glow pinch 100%'); await say('/react-to spin mouthOpen 100%'); await say('/react-to size maskArea 50%'); await say('/react-to zoom headX 20%');
const t0 = Date.now();
log('mapped'); const ok = await until(async () => { const p = await LabMotionIn.probe(); if (p) log(`probe ${p.mp} ${p.tasks.join('+')} ${p.error || ''} `); else log('probe: no answer'); return p && p.tasks.length >= 4; }, 100000);
const p = await LabMotionIn.probe();
step('the real library loads in the preview\'s Worker and makes all four tasks', ok && p.mp === 'ready' && !p.error, { tasks: p?.tasks, mp: p?.mp, error: p?.error, secs: Math.round((Date.now() - t0) / 1000) });
const f0 = p?.frames || 0; await wait(3000);
const p2 = await LabMotionIn.probe();
step('the trackers run on the frames (engine mediapipe, frames tracked, no error)', p2?.engine === 'mediapipe' && p2.frames > f0 && p2.values.tracked === 1 && !p2.error, { engine: p2?.engine, frames: (p2?.frames || 0) - f0, ms: p2?.ms, fps: p2?.fps, error: p2?.error, mask: p2?.mask, hands: p2?.values.hands, person: p2?.values.person });
await say('/react-off everything'); await say('/webcam off');
clearInterval(painter);
return JSON.stringify({ ok: steps.every((s) => s.ok), steps }, null, 1);
