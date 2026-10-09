// Polish 8: smoothness of the round 7 surfaces — a trackpad pan over the mood board (and a menu open over a playing
// clip), the editor playing its program, the capture viewer playing a video — before → after on the same machine.
//   sh dev/board-fixtures.sh && node dev/make-editor-videos.js /tmp/hearth-editor-videos
//   node dev/smoke.js --check-timeout 400000 --lib dev/checks/smooth-lib.js --script dev/checks/polish8-smooth.js
const { wait, until, measure, brief, mouse } = M;
const out = {};
const cdp = (method, params) => smoke({ cdp: method, params });
Look.applyPreset(window.P8_LOOK || 'forgeheart', { quiet: true }); await wait(500);

// ---------- the board: 1.2 s of trackpad pan over 20 references ----------
activate('tool:board');
await until(() => Board.isMounted() && Board.current());
const FIX = '/tmp/hearth-board-fixtures';
const files = ['neon big.png', 'golden-hour.jpg', 'loop.gif', 'cuts.mp4', 'calm.mp4'].map((f) => `${FIX}/${f}`);
for (let i = 0; i < 4; i++) await Board.addFiles(files, { x: i * 1400, y: i * 300 });
await wait(3000); Board.zoomFit(); await wait(1500);
const vp = document.querySelector('.bd-vp').getBoundingClientRect();
const cx = vp.left + vp.width / 2; const cy = vp.top + vp.height / 2;
await mouse('mouseMoved', vp.left + 6, vp.bottom - 6, { button: 'none' });
// two-finger trackpad pan (fractional deltas, like dev/checks/board-perf.js), then a wheel zoom
out.boardPan = brief(await measure(1400, async () => {
  for (let i = 0; i < 60; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: i < 30 ? 14.5 : -14.5, deltaY: i % 20 < 10 ? 9.5 : -9.5 }); await wait(16); }
}));
await wait(800);
out.boardZoom = brief(await measure(1400, async () => {
  for (let i = 0; i < 30; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: i < 15 ? -6 : 6, modifiers: 2 }); await wait(16); }
}));
await wait(800);
// a clip playing under the pointer, then its menu opens over it
const clip = [...document.querySelectorAll('.bd-item.bd-t-video')].find((n) => { const r = n.getBoundingClientRect(); return r.width > 40 && r.left > vp.left && r.right < vp.right && r.top > vp.top && r.bottom < vp.bottom; });
if (clip) {
  const r = clip.getBoundingClientRect();
  await mouse('mouseMoved', r.left + r.width / 2, r.top + r.height / 2, { button: 'none' }); await wait(900);
  out.clipPlaying = Boolean(document.querySelector('.bd-item.bd-t-video video.bd-live'));
  await mouse('mousePressed', r.left + r.width / 2, r.top + r.height / 2, { button: 'right' }); await mouse('mouseReleased', r.left + r.width / 2, r.top + r.height / 2, { button: 'right' });
  await wait(400);
  out.menuBlur = getComputedStyle(document.getElementById('menu')).backdropFilter;
  out.menuOverClip = brief(await measure(1500));
  hideMenu(); await wait(300);
}

// ---------- the editor: 2 s of the program playing ----------
const SRC = '/tmp/hearth-editor-videos';
const VIDS = `${window.SMOKE_SAVES || '/tmp'}/p8s-renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of (await window.hub.fs.list(SRC)).filter((x) => /frames_[ab]_30\.mp4$/.test(x.name))) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
activate('tool:ae'); await Review.ensureMounted();
H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
await Review.load(true); await until(() => Review.videos.length >= 2, 10000);
const A = Review.videos.find((v) => /frames_a/.test(v.path)).path; const B = Review.videos.find((v) => /frames_b/.test(v.path)).path;
await Review.open(A); await Review.waitReady(); await VideoCut.enter(); await VideoCut.addClip(B); await wait(600);
VideoCut.goto(0); await wait(400);
out.editorPlay = brief(await measure(2000, async () => { VideoCut.play(); }));
VideoCut.pause(); await wait(300);

// ---------- the capture viewer: 2 s of a video playing in the dialog ----------
activate(H.claudeAgent().id); await wait(400);
await CaptureView.open(A); await wait(900);
const dlg = document.querySelector('dialog.cap-view[open]');
out.viewerBlur = dlg ? `${getComputedStyle(dlg).backdropFilter} / ${getComputedStyle(dlg, '::backdrop').backdropFilter}` : null;
const v = dlg?.querySelector('video');
if (v) { v.currentTime = 0; out.viewerPlay = brief(await measure(2000, async () => { await v.play().catch(() => {}); })); v.pause(); }
dlg?.close();
return JSON.stringify(out, null, 1);
