// Capture: the frame reader inside the app, on test videos whose frame number is burned in as an 11-bit bar code.
// Make them first:  node dev/capture-test.js --make /tmp/hearth-capture-test
// then:             node dev/smoke.js --script dev/checks/capture-frames.js --check-timeout 300000
// Checks the ffmpeg path and the no-ffmpeg path (<video> + requestVideoFrameCallback) return exactly the asked frame,
// scenes / sheets / motion / pacing / palette / diff, the player, /frames and the agents' capture_frames tool.
const out = { errors: [] };
const ok = (cond, what) => { if (!cond) out.errors.push(what); return cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIR = '/tmp/hearth-capture-test';
const V = { cfr2997: `${DIR}/cfr2997.mp4`, cfr25: `${DIR}/cfr25.mp4`, vfr: `${DIR}/vfr.mp4`, webm: `${DIR}/webm.webm`, cuts: `${DIR}/cuts.mp4`, moving: `${DIR}/moving.mp4` };
// the bar code: bit k = a white square at x = 10 + 26k, y = 200 (in 320×240)
function decode(src) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, 320, 240);
  let n = 0; for (let k = 0; k < 11; k += 1) { const d = g.getImageData(10 + k * 26 + 11, 211, 1, 1).data; if (d[0] > 128) n += 2 ** k; }
  return n;
}
const numberIn = async (path) => decode(await Capture.loadImage(path));

// ffmpeg path
const info = await FrameRead.info(V.cfr2997);
out.info = info;
ok(info.exact && Math.abs(info.fps - 29.97) < 0.01 && info.frames === 240, 'true fps and frame count from ffprobe');
const asks = [0, 1, 74, 75, 150, 239];
const got = [];
for (const n of asks) got.push(await numberIn((await FrameRead.at(V.cfr2997, { frame: n })).path));
out.ffFrames = got;
ok(got.join() === asks.join(), `frames by number (ffmpeg): ${got}`);
const byTc = await FrameRead.at(V.cfr2997, { tc: '00:00:02:15' });
ok(byTc.frame === 75 && await numberIn(byTc.path) === 75, 'timecode 00:00:02:15 = frame 75 at 29.97');
const byTime = await FrameRead.at(V.cfr25, { time: 1.234 });
ok(byTime.frame === 30 && await numberIn(byTime.path) === 30, 'time 1.234 s at 25 fps = frame 30');
const vfrAt = await FrameRead.at(V.vfr, { frame: 10 });
ok(await numberIn(vfrAt.path) === 12, 'VFR: the 10th shown frame is source frame 12 (frames 3 and 8 were dropped)');
// no ffmpeg: the <video> path
FrameRead._setFfmpeg(false);
const fb = [];
for (const n of [0, 5, 47, 120, 239]) { const r = await FrameRead.at(V.cfr2997, { frame: n }); fb.push({ n, got: await numberIn(r.path), exact: r.exact }); }
out.fallback = fb;
ok(fb.every((x) => x.got === x.n && x.exact), `frames by number without ffmpeg (rVFC confirms): ${fb.map((x) => `${x.n}→${x.got}`).join(' ')}`);
const fbInfo = await FrameRead.info(V.cfr25);
ok(fbInfo.fps === 25 && !fbInfo.exact, `fps estimated from playback without ffmpeg: ${fbInfo.fps}`);
const fbScenes = await FrameRead.scenes(V.cuts, { pictures: false });
out.fallbackScenes = fbScenes.cuts.map((c) => c.time);
ok([2, 4, 6].every((t) => fbScenes.cuts.some((c) => Math.abs(c.time - t) < 0.1)), 'scene changes without ffmpeg');
const v1 = await FrameRead.verify(V.webm, 33);
ok(v1.ok, 'verify: the player shows frame 33 of a WebM');
FrameRead._setFfmpeg(true);
// scenes, sheets, motion, pacing, palette, light, diff (ffmpeg)
const sc = await FrameRead.scenes(V.cuts);
out.scenes = sc.cuts.map((c) => `${c.tc} ${c.length}s`);
ok(sc.cuts.length === 4 && sc.cuts.every((c) => c.path), 'scenes: 4 shots with pictures');
const sh = await FrameRead.sheet(V.cfr25, { layout: '4x3' });
out.sheet = sh.path;
ok(sh.frames.length === 12 && sh.w === 2400, 'labelled 4×3 contact sheet');
for (const layout of ['strip', 'story', 'polaroid', 'scenes', 'minimal']) { const s = await FrameRead.sheet(V.cuts, { layout, width: 1200 }); ok(s.path, `sheet layout ${layout}`); if (layout === 'polaroid') out.polaroid = s.path; }
const mo = await FrameRead.read(V.moving, 'motion');
out.motion = mo.text;
ok(mo.images[0]?.path && mo.value.average > 0.01, 'motion curve chart + values');
const pa = await FrameRead.pacing(V.cuts);
ok(pa.shots === 4 && Math.abs(pa.average - 2) < 0.1 && /steady/.test(pa.words), `pacing: ${pa.shots} shots, avg ${pa.average}s, ${pa.words}`);
const pal = await FrameRead.palette(V.cuts, { time: 1 });
out.palette = pal.colors;
ok(pal.colors[0] && /^#[fe]/.test(pal.colors[0].hex), 'palette of the red shot starts with red');
const li = await FrameRead.light(V.cuts);
ok(li.brightness.avg > 0 && li.words, 'brightness / saturation summary');
const df = await FrameRead.diff(V.cuts, 10, 70);
ok(df.score > 0.05, `difference across a cut: ${df.score}`);
const same = await FrameRead.diff(V.cfr25, 10, 10);
ok(same.score === 0, 'no difference with itself');
// the chat command and the agents' tool
const said = [];
await Commands.tryRun(`/frames "${V.cfr25}" at f12 2.0 00:00:01:05`, H.claudeAgent().id, null, { source: 'code', say: (t) => said.push(t) });
out.cmd = said[0];
ok(/f12/.test(said[0] || '') && /f50/.test(said[0] || '') && /f30/.test(said[0] || ''), '/frames at f12 2.0 00:00:01:05 → frames 12, 50, 30');
document.querySelector('dialog.cap-read')?.close();
const tool = await HubBridge.call('capture_frames', { path: V.cfr25, mode: 'at', times: [0.4], frames: [99] });
out.tool = tool.ok ? tool.value.text : tool.error;
ok(tool.ok && tool.images?.length === 2 && tool.images[0].mime === 'image/jpeg', 'capture_frames: text + 2 pictures for the model');
const toolSheet = await HubBridge.call('capture_frames', { path: V.cuts, mode: 'every', every: 5 });
ok(toolSheet.ok && toolSheet.images?.length === 1, 'capture_frames with many frames sends one labelled sheet');
// the player: exact stepping on the 29.97 file, the shown frame read off the <video> itself
const dlg = await CaptureView.open(V.cfr2997);
await sleep(700);
for (const n of [37, 38, 120]) {
  dlg.player.go(n);
  await sleep(450);
  const shown = decode(dlg.player.video);
  ok(dlg.player.frame === n && shown === n, `player at frame ${n}: rVFC says ${dlg.player.frame}, picture says ${shown}`);
}
await smoke({ shot: '/tmp/capture-frames-player.png' });
dlg.close();
// results panel
const res = await FrameRead.read(V.cuts, 'scenes');
const panel = FrameRead.show(res, V.cuts, 'scenes');
await sleep(500);
await smoke({ shot: '/tmp/capture-frames-panel.png' });
ok(panel.querySelectorAll('.cap-read-cell').length === 4, 'results panel shows the shots');
panel.close();
return JSON.stringify(out, null, 1);
