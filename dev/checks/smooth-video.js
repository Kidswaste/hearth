// Smoothness of Video Review: playing (playhead, timeline, loop), scrubbing, compare modes while playing, the
// library's hover-scrub thumbnails. Prints M.brief() lines to compare before / after a change.
//   sh dev/make-test-videos.sh /tmp/hearth-test-videos
//   node dev/smoke.js --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth-video.js
const { wait, until, measure, brief, mouse } = M;
const SRC = window.VIDS || '/tmp/hearth-test-videos';
const VIDS = `${window.SMOKE_SAVES}/renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir)) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
await Commands.tryRun(`/video-folders add ${VIDS}`, claude.id); await wait(1200);
activate('tool:ae'); await Review.ensureMounted(); await Review.waitReady?.().catch(() => null);
await until(() => Review.videos.length >= 6, 10000);
const R = H.surfaces.get('tool:ae').el;
const out = {};
const v = Review.videos.find((x) => /neon_tunnel_v2/.test(x.path)) || Review.videos[0];
await Review.open(v); await Review.waitReady?.(); await wait(1500);
const vid = R.querySelector('video');
vid.muted = true;
// 1. playing with a loop over most of the clip (the playhead, time readout and loop check run every frame)
Review.setLoop(0.2, Math.max(1, vid.duration - 0.2));
Review.play(); await wait(300);
{ const m = await measure(3000); out.play = brief(m); if (window.SMOOTH_DEBUG) out.playDetail = { mut: m.mut.top, paint: m.trace.top, loaf: m.loaf.top }; }
// 2. scrubbing: a real drag along the timeline
const tl = R.querySelector('.vr-timeline'); const r = tl.getBoundingClientRect();
const y = r.top + r.height * 0.7;
out.scrub = brief(await measure(1500, async () => {
  await mouse('mouseMoved', r.left + 10, y, { button: 'none' }); await mouse('mousePressed', r.left + 10, y);
  for (let i = 1; i <= 40; i++) { await mouse('mouseMoved', r.left + 10 + (i / 40) * (r.width - 20), y, { buttons: 1 }); }
  await mouse('mouseReleased', r.right - 10, y);
}));
// 3. dragging the loop on the ruler strip (top of the timeline)
const yr = r.top + 6;
out.loopDrag = brief(await measure(1500, async () => {
  await mouse('mouseMoved', r.left + r.width * 0.2, yr, { button: 'none' }); await mouse('mousePressed', r.left + r.width * 0.2, yr);
  for (let i = 1; i <= 40; i++) { await mouse('mouseMoved', r.left + r.width * (0.2 + (i / 40) * 0.5), yr, { buttons: 1 }); }
  await mouse('mouseReleased', r.left + r.width * 0.7, yr);
}));
// 4. compare modes while playing
const other = Review.videos.find((x) => /neon_tunnel_v1/.test(x.path));
if (other) {
  await Review.compare(other.path, 'wipe'); await wait(500);
  Review.play(); await until(() => !vid.paused, 3000); await wait(300);
  out.wipePlay = brief(await measure(2500));
  out.wipeState = { paused: vid.paused, t: vid.currentTime.toFixed(2), cmp: Review.state.cmp.path?.split('/').pop(), mode: Review.state.cmp.mode, loop: Review.state.loop };
  Review.setCompareMode('onion'); if (vid.paused) Review.play(); await wait(300);
  out.onionPlay = brief(await measure(2500));
  Review.stopCompare(); await wait(300);
}
Review.pause(); await wait(300);
// 5. idle (paused, tool visible)
out.idlePaused = brief(await measure(2000));
// 6. library hover-scrub: open the library, sweep the pointer across a card
if (!R.classList.contains('lib-open') && ![...R.querySelectorAll('.vr-card')].some((n) => n.getBoundingClientRect().width > 0)) { R.querySelector('.vr-libtoggle')?.click(); await wait(500); }
const cardEl = [...R.querySelectorAll('.vr-card')].find((n) => n.getBoundingClientRect().width > 0);
if (cardEl) {
  const cr = cardEl.querySelector('.vr-thumb').getBoundingClientRect();
  await mouse('mouseMoved', cr.left + 2, cr.top + cr.height / 2, { button: 'none' }); await wait(1500); // the strip of frames loads
  out.hoverScrub = brief(await measure(1500, async () => {
    for (let k = 0; k < 2; k++) for (let i = 0; i <= 30; i++) await mouse('mouseMoved', cr.left + 2 + (i / 30) * (cr.width - 4), cr.top + cr.height / 2, { button: 'none' });
  }));
}
return JSON.stringify(out, null, 1);
