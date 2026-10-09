// The video editor's other moves, by chat command and menu: effects and sound effects (rendered), captions in and
// out (SRT), matching a reference picture's look, labels / clip off / fill / fit to fill / extend edit / swap,
// beat markers from a music track, the safe-zone check, nesting (a compound clip rendered by ffmpeg), the
// real-time fallback recorder (WebM, no ffmpeg needed), poster frames, the Lab handing its video to the editor.
//   node dev/make-editor-videos.js /tmp/hearth-editor-videos
//   node dev/smoke.js --check-timeout 900000 --lib dev/checks/journey-lib.js --lib dev/editor-frames.js --script dev/checks/editor-more.js --shot /tmp/editor-more.png
const { wait, until, shot } = J;
J.shotDir = window.JOURNEY_SHOTS || window.SMOKE_SAVES;
const LOG = window.EDITOR_LOG || `${window.SMOKE_SAVES}/editor-more-progress.txt`;
let logText = '';
const step = (name, ok, info) => { logText += `${ok ? '✓' : '✖'} ${name}\n`; window.hub.fs.write(LOG, logText).catch(() => {}); return J.step(name, ok, info); };
const SRC = window.EDITOR_VIDS || '/tmp/hearth-editor-videos';
const VIDS = `${window.SMOKE_SAVES}/renders`;
const C = CutData;
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const agent = H.claudeAgent().id;
let said = '';
const run = (line) => { said = ''; return Commands.tryRun(line, agent, null, { say: (t) => { said += `${t}\n`; }, note: (t) => { said += `${t}\n`; }, error: (m) => { said += `ERROR ${m}\n`; } }); };
try {
  await window.hub.fs.write(`${VIDS}/.keep`, '');
  for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir)) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
  await window.hub.fs.write(`${VIDS}/subs.srt`, '1\n00:00:00,500 --> 00:00:01,800\nFirst caption\n\n2\n00:00:02,000 --> 00:00:03,500\nSecond <i>caption</i>\n');
  activate('tool:ae');
  await Review.ensureMounted();
  H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
  await Review.load(true);
  await until(() => Review.videos.length >= 4, 10000);
  const P = (re) => Review.videos.find((v) => re.test(v.path)).path;
  const A = P(/frames_a_30/); const B = P(/frames_b_30/); const C25 = P(/frames_c_25/);
  await Review.open(A); await Review.waitReady(); await wait(300);
  await VideoCut.enter(); await wait(300);

  // effects + sound effects
  await run('/effect soft-glow 60%'); await run('/effect vhs'); await run('/sound-effect loud');
  const c1 = VideoCut.edit.clips[0];
  step('/effect and /sound-effect stack on the clip', c1.fx?.length === 2 && near(c1.fx[0].amt, 0.6) && c1.afx?.[0] === 'loud', { fx: c1.fx, afx: c1.afx });
  await VideoCut.goFrame(20); await wait(500);
  await shot('effects');
  await run('/effect remove vhs');
  step('/effect remove', VideoCut.edit.clips[0].fx.length === 1);
  // captions
  await run(`/captions-import ${VIDS}/subs.srt`);
  const capT = (VideoCut.edit.tracks || []).find((k) => k.name === 'Captions');
  step('/captions-import: an SRT becomes captions on their own track', capT?.items.length === 2 && capT.items[1].text === 'Second caption' && near(capT.items[0].start, 0.5), capT?.items.map((x) => [x.start, x.text]));
  await run('/captions-export');
  const srt = await window.hub.fs.read(`${VIDS}/exports/frames_a_30.srt`).catch(() => '');
  step('/captions-export writes the titles as SRT', /00:00:00,500 --> 00:00:01,800\nFirst caption/.test(srt), srt.slice(0, 80));
  await run('/safe-check');
  step('/safe-check lists the titles against the app zones', /First caption/.test(said), said.slice(0, 120));
  // match a reference picture's look
  await VideoCut.goto(1); await wait(300);
  VideoCut.selectIds([VideoCut.edit.clips[0].id]);
  await run(`/match-look ${VIDS}/still.png`);
  const mc = VideoCut.edit.clips[0].color;
  step('/match-look grades toward a reference picture (vibe only, nothing added to the edit)', mc && ['exposure', 'contrast', 'saturation', 'temp', 'tint'].every((k) => Number.isFinite(mc[k])) && !VideoCut.edit.tracks.some((k) => k.items.some((x) => /still\.png$/.test(x.src || ''))), mc);
  // NLE moves
  VideoCut.split(2); VideoCut.split(4);
  await run('/clip-label gold 1'); await run('/clip-off 3');
  step('/clip-label and /clip-off', VideoCut.edit.clips[0].label === '#ffd75e' && VideoCut.edit.clips[2].off === true);
  await run('/clip-off 3');
  await run('/swap-next 1');
  step('/swap-next', near(VideoCut.edit.clips[1].in, 0) && near(VideoCut.edit.clips[0].in, 2), VideoCut.describe());
  await run('/cut undo');
  await VideoCut.goto(2.5); await wait(150);
  await run('/extend-edit');
  step('/extend-edit rolls the nearest cut to the playhead', VideoCut.describe().length === 3 && C.layout(VideoCut.edit).some((x) => near(x.start, 2.5, 0.04)), VideoCut.describe());
  await run('/clip-duration 1 2');
  step('/clip-duration: clip 2 lasts 1 s (speed changed)', near(C.durOf(VideoCut.edit.clips[1]), 1, 0.01), VideoCut.describe());
  // fit to fill: a gap then a video
  VideoCut.selectIds([VideoCut.edit.clips[1].id]); VideoCut.del(false);
  const gi = VideoCut.edit.clips.findIndex((c) => c.kind === 'gap');
  const tot0 = C.mainTotal(VideoCut.edit);
  await run(`/fit-to-fill ${gi + 1}`);
  step('/fit-to-fill: the next clip slows to cover the gap (same length)', !VideoCut.edit.clips.some((c) => c.kind === 'gap') && near(C.mainTotal(VideoCut.edit), tot0, 0.02), VideoCut.describe());
  // fill the frame with 16:9 footage
  await run(`/overlay ${C25.split('/').pop()} 0.5`);
  await run('/clip-fill');
  const ov = C.tracksOf(VideoCut.edit, 'video')[0].items[0];
  step('/clip-fill: 16:9 footage covers the 9:16 frame', near(ov.scale, (960 / 540) / (540 / 960), 0.05), ov.scale);
  // beat markers from a music track
  await run(`/add-music ${VIDS}/music.wav`);
  await run('/beat-markers bar');
  step('/beat-markers: markers on the music\'s bars', VideoCut.edit.markers.filter((m) => /^bar /.test(m.label)).length >= 3, VideoCut.edit.markers.length);
  // nest: two clips → one compound clip (rendered), then back
  VideoCut.selectIds(VideoCut.edit.clips.slice(0, 2).map((c) => c.id));
  const nClips = VideoCut.edit.clips.length;
  await run('/nest');
  await until(() => VideoCut.edit.clips.some((c) => c.nest), 120000);
  const nest = VideoCut.edit.clips.find((c) => c.nest);
  step('/nest: a compound clip rendered by ffmpeg', nest && VideoCut.edit.clips.length === nClips - 1 && (await window.hub.fs.stat(nest.src))?.size > 1000, nest && nest.src);
  await run('/unnest 1');
  step('/unnest brings the clips back', VideoCut.edit.clips.length === nClips && !VideoCut.edit.clips.some((c) => c.nest));
  // poster frame + real-time fallback recording (no ffmpeg needed)
  await VideoCut.goFrame(30); await wait(300);
  await run('/poster-frame');
  const poster = (await window.hub.fs.list(`${VIDS}/exports`)).find((f) => /\.png$/.test(f.name));
  step('/poster-frame saves a full-size PNG', Boolean(poster), poster?.name);
  VideoCut.setMark(0, 1.5);
  const rec = await VideoCut.exportCut({ record: true });
  const ev = await rec.done;
  const st0 = await window.hub.fs.stat(ev.output);
  step('real-time recording (MediaRecorder, the no-ffmpeg path) writes a WebM of the range', /\.webm$/.test(ev.output) && st0?.size > 2000, { out: ev.output.split('/').pop(), size: st0?.size });
  VideoCut.setMark(null);
  // housekeeping: snapshots, EDL, markers, hold frame, lanes, track shift, solo
  const n0 = VideoCut.edit.clips.length;
  await run('/edit-snapshot save before-hold');
  await run('/hold-frame last 0.5 1');
  step('/hold-frame adds a freeze after the clip', VideoCut.edit.clips.length === n0 + 1 && VideoCut.edit.clips[1].kind === 'freeze' && VideoCut.edit.clips[1].dur === 0.5, VideoCut.edit.clips.map((c) => c.kind).join(','));
  await run('/edit-snapshot back before-hold');
  step('/edit-snapshot back restores the saved edit', VideoCut.edit.clips.length === n0, VideoCut.edit.clips.length);
  const snapList = await run('/edit-snapshot list');
  step('/edit-snapshot list names it', /before-hold/.test(said), said);
  await run('/markers-clear');
  await run('/markers-at-cuts');
  step('/markers-at-cuts: one per cut', VideoCut.edit.markers.length === Math.max(0, VideoCut.edit.clips.length - 1), VideoCut.edit.markers.length);
  await run('/edit-edl');
  const edl = (await window.hub.fs.list(`${VIDS}/exports`)).find((f) => /\.edl$/.test(f.name));
  const edlText = edl ? await window.hub.fs.read(`${VIDS}/exports/${edl.name}`) : '';
  step('/edit-edl writes a CMX 3600 EDL', /^TITLE:/m.test(String(edlText)) && /\b001\b/.test(String(edlText)), edl?.name);
  const style0 = document.querySelector('.vr-cut-track')?.style.height; const h0 = Math.round(document.querySelector('.vr-cut-track').getBoundingClientRect().height);
  await run('/lane-height tall'); await wait(300); const saidLane = said; const styleLane = document.querySelector('.vr-cut-track')?.style.height;
  const h1 = Math.round(document.querySelector('.vr-cut-track').getBoundingClientRect().height); // the box's height animates (CSS transition), which a background test window may not advance
  await run('/lane-height normal');
  step('/lane-height tall makes the lanes taller', parseInt(styleLane, 10) > (parseInt(style0, 10) || h0), { style0, h0, h1, saidLane, styleLane, tracks: (VideoCut.edit.tracks || []).map((k) => k.name).join(',') });
  await run('/solo-sound 1');
  const muted = VideoCut.edit.clips.filter((c, i) => i > 0 && c.kind === 'video').every((c) => c.mute);
  await run('/solo-sound');
  step('/solo-sound mutes the others, again brings them back', muted && !VideoCut.edit.clips.some((c) => c.soloMuted), muted);
  // shapes and graphics: drawn by the title renderer in the preview and in the export
  await VideoCut.goFrame(15); await wait(200);
  await run('/add-shape box 2 #ff00ff');
  const shapeItem = (VideoCut.edit.tracks || []).flatMap((k) => k.items).find((x) => x.shape === 'box');
  step('/add-shape lays a shape on a text track', Boolean(shapeItem) && shapeItem.color === '#ff00ff' && near(shapeItem.dur, 2), said);
  await VideoCut.goFrame(45); await wait(300);
  const fim = await VideoComp.frameImage(VideoCut.time, { maxW: 320, mime: 'image/png' });
  const px = fim.canvas.getContext('2d').getImageData(Math.round(fim.canvas.width / 2), Math.round(fim.canvas.height / 2), 1, 1).data;
  step('the shape shows in the preview (magenta box at the center)', px[0] > 200 && px[1] < 60 && px[2] > 200, [...px]);
  const read = await VideoEditTools.handle('video_edit_read', { what: 'tracks' }).catch((e0) => String(e0));
  step('video_edit_read describes the shape', /shape box/.test(JSON.stringify(read)), String(JSON.stringify(read)).slice(0, 200));
  VideoCut.setMark(0, 2);
  const jsh = await VideoCut.exportCut({});
  const evs = jsh ? await jsh.done : { code: 'no job' };
  const psh = evs.code === 0 ? await window.hub.video.probe(jsh.output, {}) : null;
  step('a render with a shape (title frames) succeeds', evs.code === 0 && psh && near(psh.duration, 2, 0.1), { code: evs.code, err: evs.error, d: psh?.duration });
  VideoCut.setMark(null);
  // the Lab hands its video to the editor
  const lab = await ThreeLab.cmd({ show: true });
  await lab.loadSong(B);
  await until(() => lab.player.loaded && lab.player.duration > 0, 15000);
  await run('/lab-to-editor');
  await until(() => VideoCut.active && VideoCut.path === B, 10000);
  step('/lab-to-editor opens the Lab\'s video as its own edit', VideoCut.active && VideoCut.path === B, VideoCut.path);
  await Review.open(A); await Review.waitReady(); await until(() => VideoCut.path === A, 8000);
  const layers0 = (VideoCut.edit.tracks || []).reduce((n, k) => n + k.items.length, 0);
  await run('/lab-overlay');
  await until(() => (VideoCut.edit.tracks || []).reduce((n, k) => n + k.items.length, 0) > layers0, 8000);
  step('/lab-overlay lays it over the open edit', (VideoCut.edit.tracks || []).some((k) => k.items.some((x) => x.src === B)));
  await run('/lab-music');
  step('/lab-music puts the Lab\'s sound on an audio track', C.tracksOf(VideoCut.edit, 'audio').some((k) => k.items.some((x) => x.src === B)));
  activate('tool:ae'); await wait(500);
  await shot('more-end');
  step('0 duplicate command names', !Commands.duplicates().length, Commands.duplicates());
} catch (err) { step(`crashed: ${err.message}`, false, String(err.stack).split('\n').slice(0, 3).join(' | ')); }
return J.done();
