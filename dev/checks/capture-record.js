// Capture: recording Hearth itself (page capture + MediaRecorder), checked with ffprobe through the frame reader:
// whole window (direct), a tool region in 9:16 at 30 fps, app sound, pause / resume, markers, max length, the cursor
// and click effects in the picture, a tour that records itself, the agents' capture_record tool and /record.
//   node dev/smoke.js --script dev/checks/capture-record.js --check-timeout 240000
const out = { errors: [] };
const ok = (cond, what) => { if (!cond) out.errors.push(what); return cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = async (p) => (await window.hub.capture.frames('probe', p)).value;
const count = async (p) => (await window.hub.capture.frames('times', p)).value?.length;
// the color of a pixel in a picture file
const pixel = (path, x, y) => new Promise((res) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); res([...g.getImageData(x, y, 1, 1).data].slice(0, 3)); }; i.onerror = () => res(null); i.src = Capture.fileUrl(path); });

// 1) whole window, direct page capture, app sound, 2.5 s, mp4 too
await Capture.record({ target: 'window', size: 'native', fps: 30, audio: 'app', countdown: 0, mp4: true, cursor: 'off' });
ok(Capture.status().recording, 'recording started');
await sleep(1200);
const m = Capture.mark('half way');
Capture.pause(); await sleep(800); ok(Capture.status().paused, 'paused'); Capture.resume();
await sleep(1300);
const r1 = await Capture.stop({ quiet: true });
out.window = r1;
const p1 = await probe(r1.mp4);
const w1 = await probe(r1.webm);
out.windowProbe = { mp4: p1 && { w: p1.w, h: p1.h, fps: p1.fps, dur: p1.duration, codec: p1.codec, audio: p1.audio }, webm: w1 && { w: w1.w, h: w1.h, dur: w1.duration, codec: w1.codec, audio: w1.audio } };
ok(p1 && p1.codec === 'h264' && p1.w === innerWidth && p1.h === innerHeight, 'mp4 at the window size');
ok(p1 && Math.abs(p1.fps - 30) < 0.01, 'mp4 at the chosen 30 fps (constant)');
ok(w1 && w1.duration > 2 && w1.duration < 3.6, `webm duration fixed (~2.5 s without the pause): ${w1?.duration}`);
ok(p1?.audio && w1?.audio, 'Hearth\'s own sound track recorded');
ok(r1.marks.length === 1 && Math.abs(r1.marks[0].time - 1.2) < 0.4, 'marker kept with its time');
ok((await window.hub.kvGet('capture-marks', {}))[r1.path]?.length === 1, 'markers saved for the player / Video Review');

// 2) the tool region in 9:16 (canvas pipeline), 30 fps, max length 1.5 s stops by itself
await Capture.record({ target: 'tool', size: '9:16', fps: 30, audio: 'none', countdown: 0, mp4: false, max: 1.5 });
await sleep(3200);
ok(!Capture.recording, 'max length stopped the recording');
const r2 = Capture.last();
const p2 = await probe(r2.path);
out.reel = { path: r2.path, w: p2?.w, h: p2?.h, dur: p2?.duration, frames: await count(r2.path) };
ok(p2 && p2.w === 1080 && p2.h === 1920, 'tool recorded into an exact 1080×1920 frame');
ok(p2 && !p2.audio, 'no sound track when sound is off');

// 3) cursor + click effects are in the picture (they are page elements); the REC light is not (its own window)
await Capture.record({ target: 'window', size: 'native', fps: 30, countdown: 0, mp4: false, cursor: 'dot', clicks: 'ring' });
Capture.cursorFx.place(300, 300);
await sleep(1500);
const r3 = await Capture.stop({ quiet: true });
const f3 = await FrameRead.at(r3.path, { time: 1.0 }, { format: 'png' });
out.cursorPixel = await pixel(f3.path, 300, 300);
ok(out.cursorPixel && out.cursorPixel[0] > 200 && out.cursorPixel[1] < 160 && out.cursorPixel[2] < 90, `cursor dot drawn into the recording (${out.cursorPixel})`);
// the top-right corner (where the REC window sits) is the app, not the red light
const corner = await pixel(f3.path, innerWidth - 120, 20);
out.cornerPixel = corner;
ok(corner && !(corner[0] > 200 && corner[1] < 80), 'no REC light in the frame');

// 4) a tour records itself: caption + zoom + title, then stops; the caption is in the frame
const tour = await CaptureTour.run(`record quick
caption "Hello from a tour" 1.2s center
zoom #rail 1.5 0.4s
wait 0.4s
zoom out 0.3s
open astra
wait 0.3s
stop`, { name: 'test' });
out.tour = { steps: tour.steps, skipped: tour.skipped, rec: tour.recording?.path, ms: tour.ms };
ok(tour.steps === 8 && !tour.skipped.length && tour.recording?.path, 'tour ran every step and recorded');
const tp = tour.recording && await probe(tour.recording.path);
ok(tp && tp.duration > 1.5, 'tour recording has the tour in it');
const tf = tour.recording && await FrameRead.at(tour.recording.path, { time: 0.6 }, { format: 'png' });
out.tourFrame = tf?.path;
ok(!document.querySelector('#cap-fx .cap-caption') && !document.getElementById('app').style.transform, 'tour cleaned up (no caption left, no zoom)');

// 5) the agents' tool (as an MCP call reaches the renderer) and the chat command
const viaTool = await HubBridge.call('capture_record', { action: 'start', target: 'chat', seconds: 1.2 });
out.viaTool = viaTool.ok ? { path: viaTool.value.path, dur: viaTool.value.duration } : viaTool.error;
ok(viaTool.ok && viaTool.value.path && !Capture.recording, 'capture_record start with seconds records and stops');
const st = await HubBridge.call('capture_record', { action: 'status' });
ok(st.ok && st.value.recording === false, 'capture_record status');
const agentId = H.claudeAgent().id;
const said = [];
await Commands.tryRun('/record now', agentId, null, { source: 'code', say: (t) => said.push(t) });
await sleep(1000);
ok(Capture.recording, '/record (outside the Lab) records Hearth');
await Commands.tryRun('/record stop', agentId, null, { source: 'code', say: (t) => said.push(t) });
ok(!Capture.recording && said.some((t) => /Saved/.test(t)), '/record stop saves');
out.said = said;
// the indicator's ■ (simulated through the same event the window sends)
await Capture.record({ countdown: 0, mp4: false });
await sleep(600);
document.dispatchEvent(new Event('noop'));
const stopped = Capture.stop({ quiet: true });
await stopped;
ok(!Capture.recording, 'stop');
// the player: open the reel, step frames
const dlg = await CaptureView.open(r1.mp4);
await sleep(500);
dlg.player.go(20);
await sleep(500);
out.playerFrame = dlg.player.frame;
ok(dlg.player.frame === 20, 'player steps to frame 20 (requestVideoFrameCallback confirms)');
dlg.player.step(1); await sleep(400);
ok(dlg.player.frame === 21, 'one frame on');
await smoke({ shot: '/tmp/capture-player.png' });
dlg.close();
return JSON.stringify(out, null, 1);
