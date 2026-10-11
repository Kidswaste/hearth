// Video performance (round 16, videoperf): numbers to compare before → after on the same machine, plus the checks that
// the new paths work. Opening videos (filmstrip + waveform ready, main-thread blocking while they're made), scrubbing
// (seeks issued vs. decoded, blocking), a 10-clip edit (heap, drawing a zoomed-in track), playback dropped frames,
// the app while an ffmpeg render runs (its priority, frames), letting go of decoders while hidden, recording (frame
// pump). Runs on older builds too (the new parts report "n/a").
//   sh dev/make-test-videos.sh /tmp/hearth-test-videos
//   node dev/smoke.js --check-timeout 400000 --lib dev/checks/smooth-lib.js --script dev/checks/videoperf.js
const { wait, until, measure, brief, mouse } = M;
const SRC = window.VIDS || '/tmp/hearth-test-videos';
const VIDS = `${window.SMOKE_SAVES}/renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir)) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
const out = { problems: [] };
const fail = (what) => out.problems.push(what);
const metrics = async () => { await smoke({ cdp: 'Performance.enable' }); const r = await smoke({ cdp: 'Performance.getMetrics' }); return Object.fromEntries((r?.metrics || r?.result?.metrics || []).map((m) => [m.name, m.value])); };
// main-thread blocking (Long Animation Frames) while fn runs
async function blocking(fn) {
  const loafs = []; let po = null;
  try { po = new PerformanceObserver((l) => loafs.push(...l.getEntries())); po.observe({ type: 'long-animation-frame', buffered: false }); } catch { /* none */ }
  const t0 = performance.now(); const v = await fn(); const ms = Math.round(performance.now() - t0);
  await wait(50); po?.disconnect();
  return { ms, v, loaf: loafs.length, blockingMs: Math.round(loafs.reduce((a, f) => a + (f.blockingDuration || 0), 0)), longest: Math.round(Math.max(0, ...loafs.map((f) => f.duration))) };
}

activate('tool:ae');
await Review.ensureMounted();
H.config.settings = { ...H.config.settings, videoDirs: [VIDS] }; // this run only
await Review.load(true);
await until(() => Review.videos.length >= 6, 10000);
const R = H.surfaces.get('tool:ae').el;
const S = Review.state;
const names = ['neon_tunnel_v2', 'drop_visual_16x9', 'square_loop'];
const vids = names.map((n) => Review.videos.find((v) => new RegExp(`${n}\\.mp4$`).test(v.path))).filter(Boolean);

// 1. open three videos cold: filmstrip (24 frames) and the waveform / beats ready
out.open = [];
for (const v of vids) {
  const r = await blocking(async () => { await Review.open(v); await Review.waitReady(); await until(() => S.strip.length >= 24 && S.audio, 20000); });
  out.open.push(`${v.path.split('/').pop()}: ${r.ms} ms · LoAF ${r.loaf} blocking ${r.blockingMs} ms (longest ${r.longest} ms) · strip ${S.strip.length} · beats ${S.audio?.beats?.length ?? 'none'}`);
}
// and the first again (this session's memory / the disk cache)
{ const r = await blocking(async () => { await Review.open(vids[0]); await Review.waitReady(); await until(() => S.strip.length >= 24 && S.audio, 20000); }); out.reopen = `${r.ms} ms · blocking ${r.blockingMs} ms`; }
out.cacheStats = Review.media ? await Review.media.stats() : 'n/a';
if (Review.media && !(out.cacheStats.sprites >= 1)) fail('no picture strip came from the ffmpeg cache');
if (S.strip[0]?.sx == null && Review.media) fail('the filmstrip is not the cached sprite');

// 2. scrubbing: a fast drag along the timeline, seeks asked vs. seeks the decoder finished
const vid = R.querySelector('video.vr-a') || R.querySelector('video');
vid.muted = true;
const tl = R.querySelector('.vr-timeline'); const r0 = tl.getBoundingClientRect(); const y = r0.top + r0.height * 0.7;
let seeks = 0; let seeked = 0;
const onSeeking = () => { seeks += 1; }; const onSeeked = () => { seeked += 1; };
vid.addEventListener('seeking', onSeeking); vid.addEventListener('seeked', onSeeked);
const scrub = await measure(1500, async () => {
  await mouse('mouseMoved', r0.left + 10, y, { button: 'none' }); await mouse('mousePressed', r0.left + 10, y);
  for (let i = 1; i <= 60; i++) await mouse('mouseMoved', r0.left + 10 + (i / 60) * (r0.width - 20), y, { buttons: 1 });
  await mouse('mouseReleased', r0.right - 10, y);
});
await wait(400);
vid.removeEventListener('seeking', onSeeking); vid.removeEventListener('seeked', onSeeked);
out.scrub = `${brief(scrub).line || brief(scrub)} · seeks ${seeks} → decoded ${seeked} · landed at ${(vid.currentTime / vid.duration * 100).toFixed(0)} %`;
if (vid.currentTime / vid.duration < 0.9) fail(`the scrub didn't land at the end (${vid.currentTime})`);

// 3. playback dropped frames (the player, 3 s)
{
  const q0 = vid.getVideoPlaybackQuality(); Review.setLoop(null); Review.seek(0); Review.play(); await wait(3000); Review.pause();
  const q1 = vid.getVideoPlaybackQuality();
  out.playback = `${q1.totalVideoFrames - q0.totalVideoFrames} frames shown · ${q1.droppedVideoFrames - q0.droppedVideoFrames} dropped`;
}

// 4. a 10-clip edit: thumbnails of every source, heap, drawing the track zoomed in
await VideoCut.enter(); await wait(500);
const srcs = Review.videos.filter((v) => /\.mp4$/.test(v.path)).map((v) => v.path);
for (let i = 0; VideoCut.edit.clips.length < 10 && i < 20; i++) await VideoCut.addClip(srcs[i % srcs.length]);
const heap0 = await metrics();
const build = await blocking(async () => { await until(() => false, 4000); });
const heap1 = await metrics();
out.edit10 = `${VideoCut.edit.clips.length} clips · ${new Set(VideoCut.edit.clips.map((c) => c.src)).size} sources · while their pictures / sound are made: blocking ${build.blockingMs} ms · JS heap ${(heap1.JSHeapUsedSize / 1048576).toFixed(1)} MB (${((heap1.JSHeapUsedSize - heap0.JSHeapUsedSize) / 1048576).toFixed(1)} MB more) · DOM nodes ${heap1.Nodes} · videos with a file ${[...document.querySelectorAll('video')].filter((v) => v.getAttribute('src')).length}`;
if (VideoCut.edit.clips.length < 10) fail('the 10-clip edit has fewer clips');
{
  const draw = VideoCut._test.draw;
  const t = (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) draw(); return (performance.now() - t0) / n; };
  VideoCut.zoomFit?.(); const fit = t(30);
  VideoCut.zoomBy(40, 1); const zoomed = t(30);
  out.trackDraw = `fit ${fit.toFixed(2)} ms · zoomed ×40 ${zoomed.toFixed(2)} ms a draw`;
  VideoCut.zoomFit?.();
}
// the editor's scrub on its track
{
  const cv = R.querySelector('canvas.vr-cut-cv');
  if (cv) {
    const rr = cv.getBoundingClientRect(); const yy = rr.top + 5;
    const m2 = await measure(1500, async () => {
      await mouse('mouseMoved', rr.left + 10, yy, { button: 'none' }); await mouse('mousePressed', rr.left + 10, yy);
      for (let i = 1; i <= 60; i++) await mouse('mouseMoved', rr.left + 10 + (i / 60) * (rr.width - 20), yy, { buttons: 1 });
      await mouse('mouseReleased', rr.right - 10, yy);
    });
    await wait(500);
    out.editScrub = `${brief(m2).line || brief(m2)} · at ${(VideoCut.time / (VideoCut.edit.clips.reduce((a, c) => a + (c.out - c.in) / (c.speed || 1), 0) || 1) * 100).toFixed(0)} %`;
  } else out.editScrub = 'track canvas not found';
}
VideoCut.leave?.(); await wait(300);

// 5. the app while an ffmpeg render runs (a heavy 1080p encode): its priority and the UI's frames meanwhile
{
  const id = `vp${Date.now().toString(36)}`;
  const output = `${VIDS}/exports/render-load.mp4`;
  let done = null; const off = window.hub.video.onJob((ev) => { if (ev.id === id && ev.type === 'done') done = ev; });
  await window.hub.video.transcode({ id, output, duration: 30, args: ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-t', '30', '-c:v', 'libx264', '-preset', 'medium', 'OUTPUT'] }, { ffmpeg: H.settings().ffmpegPath || undefined });
  await wait(800);
  // its niceness, read from /proc (Linux)
  let nice = 'n/a';
  try {
    for (const p of (await window.hub.fs.list('/proc')).filter((x) => /^\d+$/.test(x.name))) {
      const cmd = await window.hub.fs.read(`/proc/${p.name}/cmdline`).catch(() => '');
      if (/testsrc2/.test(String(cmd)) && /ffmpeg/.test(String(cmd))) { const stat = String(await window.hub.fs.read(`/proc/${p.name}/stat`)); nice = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[16]); break; }
    }
  } catch (err) { nice = `n/a (${err.message})`; }
  Review.open(vids[0]); await Review.waitReady(); Review.play();
  const m = await measure(3000);
  Review.pause();
  out.whileRendering = `ffmpeg nice ${nice} · ${brief(m).line || brief(m)}`;
  await window.hub.video.cancel(id); if (typeof off === "function") off();
  if (Review.media && nice !== 'n/a' && !(nice > 0)) fail(`the render ran at normal priority (nice ${nice})`);
}

// 6. hidden: the decoders let go, and come back at the same frame
if (Review.sleepMedia) {
  Review.seek(1.5); await Review.waitSeek(); const t0 = vid.currentTime;
  activate(H.claudeAgent().id); await wait(300);
  const slept = Review.sleepMedia();
  const withSrc = [...document.querySelectorAll('video')].filter((v) => v.getAttribute('src')).length;
  activate('tool:ae'); await wait(300); await Review.waitReady(); await until(() => Math.abs(vid.currentTime - t0) < 0.01, 3000);
  out.hidden = `let go: ${slept} · videos with a file while hidden ${withSrc} · back at ${vid.currentTime.toFixed(3)} s (was ${t0.toFixed(3)})`;
  if (!slept || Math.abs(vid.currentTime - t0) > 0.01) fail('the hidden player did not come back at the same frame');
} else out.hidden = 'n/a';

// 7. recording a tool region: the frame pump, and the UI's frames while filming
if (typeof Capture !== 'undefined') {
  try {
    await Capture.record({ target: 'window', size: 'native', fps: 30, audio: 'none', countdown: 0, mp4: false, cursor: 'off' });
    await wait(500);
    const m = await measure(2500, async () => { for (let i = 0; i < 20; i++) { Review.seek(i / 10); await wait(100); } });
    const st = Capture.status();
    out.recording = `pump ${st.pump || 'window'} · frames in ${st.framesIn} out ${st.framesOut} · UI ${brief(m).line || brief(m)}`;
    const r = await Capture.stop({ quiet: true }).catch((e) => ({ error: e.message }));
    out.recordingFile = r?.error ? `error: ${r.error}` : `${r?.duration?.toFixed?.(1)} s ${r?.size}`;
  } catch (err) { out.recording = `error: ${err.message}`; }
}

// 8. commands
out.commands = ['video-cache', 'renders', 'edit-proxy'].filter((n) => Commands.get(n)).join(', ');
if (Review.media) {
  let said = ''; const grab = (t) => { said += `${String(t ?? '')}\n`; };
  await Commands.tryRun('/video-cache', H.claudeAgent().id, null, { say: grab, note: grab, error: grab }).catch((e) => grab(e.message));
  out.videoCacheSays = said.trim().slice(0, 400);
  if (!/Cache/.test(said)) fail('/video-cache said nothing');
}
out.ok = out.problems.length === 0;
return JSON.stringify(out, null, 1);
