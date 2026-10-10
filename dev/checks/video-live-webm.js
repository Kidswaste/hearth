// A WebM straight from a recorder (no length in the file: the browser says Infinity) opened in Video Review, played,
// stepped and edited: it used to freeze the whole app (the ruler walked 0 → Infinity). The take is recorded here, in
// the page, with MediaRecorder, and saved raw (no ffmpeg remux), like a recording on a computer without ffmpeg.
//   node dev/smoke.js --check-timeout 200000 --script dev/checks/video-live-webm.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d');
let f = 0; const anim = setInterval(() => { g.fillStyle = `hsl(${(f * 9) % 360},70%,45%)`; g.fillRect(0, 0, 640, 360); g.fillStyle = '#fff'; g.font = '80px sans-serif'; g.fillText(String(f++), 40, 200); }, 33);
const mime = ['video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime });
const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
rec.start(500); await wait(3500); await new Promise((r) => { rec.onstop = r; rec.stop(); }); clearInterval(anim);
const file = await window.hub.capture.recOpen({ name: 'live-webm-check' });
await window.hub.capture.recWrite(file.id, new Uint8Array(await new Blob(parts).arrayBuffer()));
const path = await window.hub.capture.recClose(file.id);
// the page must keep breathing: the longest gap between 50 ms ticks
let last = performance.now(); let worst = 0;
const iv = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; }, 50);
const within = (p, ms, what) => Promise.race([p, wait(ms).then(() => { problems.push(`${what}: still waiting after ${ms} ms`); })]);
activate('tool:ae'); await Review.ensureMounted(); await wait(800);
await within(Review.open(path), 8000, 'open');
await within(Review.waitReady?.() || wait(500), 8000, 'ready');
const v = () => document.querySelector('.vr-p video') || document.querySelector('video');
const dur = v()?.duration;
if (!(Number.isFinite(dur) && dur > 2.5 && dur < 5)) problems.push(`the real length wasn't measured (${dur})`);
await Review.play(); await wait(1500); await Review.pause();
if (!(v()?.currentTime > 0.3)) problems.push(`didn't play (${v()?.currentTime})`);
await Review.seek(2); await Review.step?.(1); await wait(400);
await within(VideoCut.enter(), 10000, 'editor');
await Review.play(); await wait(1200); await Review.pause();
clearInterval(iv);
if (worst > 2000) problems.push(`the page stalled for ${Math.round(worst)} ms`);
return JSON.stringify({ problems, duration: dur, worstGapMs: Math.round(worst) }, null, 1);
