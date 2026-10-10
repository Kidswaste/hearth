// Round 11 (pack11) in the video editor, driven by chat commands, keys, menus and the agents' video_edit ops: music
// and voice heard in the preview, sound effects heard live, reversed clips played backwards in real time (a reversed
// proxy), a .cube LUT (preview twin + render), an adjustment layer, ducking under the voice, multicam angles (Alt+2),
// proxies, the render queue, cuts paced like the board, recording chapters → markers, a real-time WebM with its length.
//   node dev/make-editor-videos.js /tmp/hearth-editor-videos
//   node dev/smoke.js --check-timeout 900000 --lib dev/checks/journey-lib.js --script dev/checks/editor-pack.js --shot /tmp/editor-pack.png
const { wait, until, shot } = J;
J.shotDir = window.JOURNEY_SHOTS || window.SMOKE_SAVES;
const step = (name, ok, info) => J.step(name, ok, info);
const SRC = window.EDITOR_VIDS || '/tmp/hearth-editor-videos';
const VIDS = `${window.SMOKE_SAVES}/pack-renders`;
const C = CutData;
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const agent = H.claudeAgent().id;
let said = '';
const run = async (line) => { said = ''; await Commands.tryRun(line, agent, null, { say: (t) => { said += `${t}\n`; }, note: (t) => { said += `${t}\n`; }, error: (m) => { said += `ERROR ${m}\n`; } }); return said; };
const op = (a) => VideoEditTools.handle('video_edit', a);
// the composited program frame at T (preview path: the compositor + its SVG filters) as RGB pixels
async function pixAt(T, edit = VideoCut.edit) {
  const im = await VideoComp.frameImage(T, { maxW: 120, edit });
  return im.canvas.getContext('2d').getImageData(0, 0, im.canvas.width, im.canvas.height).data;
}
// how far b is from a's negative (0 = exactly inverted) and from a itself
function invDist(a, b) { let inv = 0; let same = 0; let n = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c += 1) { inv += Math.abs(b[i + c] - (255 - a[i + c])); same += Math.abs(b[i + c] - a[i + c]); n += 1; } return { inv: inv / n, same: same / n }; }
const cube = (n, f) => { const L = ['TITLE "Invert"', `LUT_3D_SIZE ${n}`]; for (let b = 0; b < n; b += 1) for (let g = 0; g < n; g += 1) for (let r = 0; r < n; r += 1) L.push(f(r / (n - 1), g / (n - 1), b / (n - 1)).map((v) => v.toFixed(5)).join(' ')); return L.join('\n'); };
try {
  await window.hub.fs.write(`${VIDS}/.keep`, '');
  for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir)) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
  const LUT = `${VIDS}/invert.cube`;
  await window.hub.fs.write(LUT, cube(9, (r, g, b) => [1 - r, 1 - g, 1 - b]));
  activate('tool:ae');
  await Review.ensureMounted();
  H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
  await Review.load(true);
  await until(() => Review.videos.length >= 4, 10000);
  const P = (re) => Review.videos.find((v) => re.test(v.path)).path;
  const A = P(/frames_a_30/); const B = P(/frames_b_30/);
  const MUSIC = `${VIDS}/music.wav`;
  await Review.open(A); await Review.waitReady(); await wait(300);
  await VideoCut.enter(); await wait(300);
  // the program's volume is Review's own (a test profile may start it muted): sound on for these checks
  const mainVid = document.querySelector('video.vr-video.vr-a');
  step('Review\'s volume (the program volume) for the sound checks', Boolean(mainVid), mainVid && { muted: mainVid.muted, volume: mainVid.volume });
  if (mainVid) { mainVid.muted = false; mainVid.volume = 1; }
  step('the pack commands are registered', ['duck', 'voice-track', 'lut', 'adjustment-layer', 'multicam', 'angle', 'edit-proxy', 'render-queue', 'cut-to-vibe', 'chapters-to-markers', 'preview-sound'].every((n) => Commands.get(n)), ['duck', 'lut', 'multicam'].map((n) => Boolean(Commands.get(n))));

  // 1. a music bed on an audio track is heard in the preview
  await VideoCut.addAudio(MUSIC, { at: 0 });
  step('music on an audio track (the edit plays through the compositor)', C.tracksOf(VideoCut.edit, 'audio').some((k) => k.items.length) && VideoCut.rich);
  await VideoCut.goto(0.2); await wait(200);
  VideoCut.play();
  await until(() => VideoSound.status().items >= 1, 4000);
  await wait(900);
  const aEl = [...document.querySelectorAll('audio.vr-pdeck')].find((x) => /music\.wav/.test(decodeURIComponent(x.src)));
  step('the audio item plays in step with the clock', aEl && !aEl.paused && aEl.currentTime > 0.4 && Math.abs(aEl.currentTime - VideoCut.time) < 0.25, aEl && { t: aEl.currentTime, T: VideoCut.time, paused: aEl.paused, vol: aEl.volume });
  VideoCut.pause(); await wait(200);
  step('pausing pauses it', aEl?.paused);

  // 2. a sound effect is heard live (the decoded sound through its node chain), the decoder stays quiet
  await run('/sound-effect echo 1');
  const c1 = VideoCut.edit.clips[0];
  step('/sound-effect echo on the clip', c1.afx?.includes('echo'), c1.afx);
  await until(() => VideoSound.bufferOf(A).buf, 15000);
  await VideoCut.goto(0.5); await wait(200);
  VideoCut.play();
  await until(() => VideoSound.status().voices >= 1, 4000);
  let peak = 0; for (let i = 0; i < 12; i += 1) { await wait(80); peak = Math.max(peak, VideoSound.level()); }
  const deckA = [...VideoComp.decks.values()].find((d) => d.src === A);
  // (a machine without a sound device runs no audio graph: then a started voice is what can be checked)
  step('the clip is heard through its sound effect (a live voice, sound coming out)', VideoSound.status().voices >= 1 && (peak > 0.005 || VideoSound.status().state !== 'running'), { status: VideoSound.status(), peak });
  step('its decoder is silent meanwhile (no double sound)', deckA && deckA.el.volume === 0, deckA?.el.volume);
  VideoCut.pause(); await wait(200);
  step('pause stops the voices', VideoSound.status().voices === 0);
  await run('/sound-effect off 1');

  // 3. reverse: heard backwards, and played forward from a reversed proxy in real time
  VideoCut.selectIds([VideoCut.edit.clips[0].id]);
  VideoCut.split(2); VideoCut.split(4);
  VideoCut.commit(C.setReverse(VideoCut.edit, [VideoCut.edit.clips[1].id], true), 'Reverse');
  const rc = VideoCut.edit.clips[1];
  await VideoCut.goto(2.2); await wait(200);
  VideoCut.play(); await wait(300); VideoCut.pause();
  await until(() => Object.values(VideoPack.proxies.rev).some((x) => x.path), 30000);
  step('a reversed proxy of the clip\'s part is made (ffmpeg, once)', Object.values(VideoPack.proxies.rev).some((x) => x.path), VideoPack.proxies.rev);
  await VideoCut.goto(2.2); await wait(300);
  VideoCut.play();
  await until(() => [...VideoComp.decks.entries()].some(([id, d]) => id === `${rc.id}~r` && !d.el.paused), 5000);
  const t0 = VideoComp.decks.get(`${rc.id}~r`)?.el.currentTime; await wait(600);
  const rd = VideoComp.decks.get(`${rc.id}~r`);
  step('the reversed clip plays forward through its reversed copy (real time)', rd && !rd.el.paused && rd.el.currentTime > t0 + 0.3, rd && { t0, t1: rd.el.currentTime });
  step('and is heard backwards (a voice on the reversed buffer)', VideoSound.status().voices >= 1, VideoSound.status());
  VideoCut.pause(); await wait(200);
  // a paused frame is still exact (the original decoder, stepped)
  const fr = await VideoCut.frameInfo();
  step('paused on the reversed clip: frames stay exact', fr && fr.layers.every((x) => x.got === x.want), fr?.layers);
  VideoCut.commit(C.setReverse(VideoCut.edit, [rc.id], false), 'Forward');

  // 4. a LUT on a clip: the preview inverts (SVG twin), the edit says so
  const p0 = await pixAt(3);
  VideoCut.selectIds([VideoCut.edit.clips[1].id]);
  await run(`/lut ${LUT}`);
  step('/lut puts the LUT on the clip', VideoCut.edit.clips[1].lut?.name === 'Invert', said);
  await until(async () => invDist(p0, await pixAt(3)).inv < 30, 5000);
  const d1 = invDist(p0, await pixAt(3));
  step('the preview shows the LUT (every pixel inverted)', d1.inv < 30 && d1.same > 60, d1);
  await run('/lut off');
  step('/lut off', !VideoCut.edit.clips[1].lut);

  // 5. an adjustment layer 0.5–1.5 s with the LUT: everything under it, only there
  await VideoCut.goto(0.5); await wait(100);
  await run('/adjustment-layer for 1');
  const adj = (VideoCut.edit.tracks || []).flatMap((k) => k.items).find((x) => x.kind === 'adjust');
  step('/adjustment-layer adds one over a range', adj && near(adj.start, 0.5, 0.05) && near(adj.dur, 1), adj);
  VideoCut.selectIds([adj.id]);
  await run(`/lut ${LUT}`);
  const noAdj = C.copy(VideoCut.edit); noAdj.tracks = noAdj.tracks.map((k) => ({ ...k, items: k.items.filter((x) => x.kind !== 'adjust') }));
  const dIn = invDist(await pixAt(1.0, noAdj), await pixAt(1.0));
  const dOut = invDist(await pixAt(1.8, noAdj), await pixAt(1.8));
  step('the adjustment layer inverts what is under it, inside its range only', dIn.inv < 30 && dOut.same < 6, { dIn, dOut });
  await shot('pack-adjust');

  // 6. ducking: the music dips under the voice (a track named Voice)
  await VideoCut.addAudio(B, { at: 0, b: 3 });
  const vTrack = C.tracksOf(VideoCut.edit, 'audio').find((k) => k.items.some((x) => x.src === B));
  VideoCut.commit(C.patchTrack(VideoCut.edit, vTrack.id, { name: 'Voice' }), 'name');
  await run('/duck -18');
  const mus = C.tracksOf(VideoCut.edit, 'audio').flatMap((k) => k.items).find((x) => x.src === MUSIC);
  step('/duck writes volume keys on the music only', mus?.keys?.volume?.length >= 2 && mus.ducked && !C.tracksOf(VideoCut.edit, 'audio').flatMap((k) => k.items).find((x) => x.src === B).keys, { said, keys: mus?.keys?.volume?.slice(0, 6) });
  step('the music is lower under the voice', mus && Math.min(...mus.keys.volume.map((k) => k.v)) < 0.2, mus?.keys?.volume?.map((k) => k.v));
  await run('/duck off');
  step('/duck off removes them', !C.tracksOf(VideoCut.edit, 'audio').flatMap((k) => k.items).find((x) => x.src === MUSIC)?.keys?.volume);

  // 7. multicam: two takes as angles, Alt+2 cuts to the second at the playhead
  await run(`/multicam ${A} ${B}`);
  step('/multicam makes two angles (synced by their sound)', VideoCut.edit.multicam?.angles?.length === 2, said);
  await VideoCut.goto(1.0); await wait(150);
  const handled = VideoCut.onKey(new KeyboardEvent('keydown', { key: '¡', code: 'Digit2', altKey: true }));
  await until(() => VideoCut.edit.clips.some((c) => c.src === B && c.cam === 1), 4000);
  const after = C.at(VideoCut.edit, 1.05)?.clip;
  step('Alt+2 cuts to angle 2 at the playhead, at the same moment', handled && after?.src === B && after.cam === 1, after && { src: after.src.split('/').pop(), in: after.in });
  await run('/angle 1 at 1.5');
  step('/angle 1 at 1.5 cuts back', C.at(VideoCut.edit, 1.55)?.clip.src === A, said);

  // 8. proxies: a lighter copy plays, renders keep the originals
  await run('/edit-proxy all');
  await until(() => Object.keys(VideoPack.proxies.files).length >= 1, 60000);
  step('/edit-proxy all makes proxies', Object.keys(VideoPack.proxies.files).length >= 1, said);
  await VideoCut.goto(0.3); await wait(800);
  step('the preview plays the proxy', [...VideoComp.decks.values()].some((d) => /_proxy\.mp4/.test(decodeURIComponent(d.url || ''))));
  const fr2 = await VideoCut.frameInfo();
  step('frames stay exact on a proxy', fr2 && fr2.layers.every((x) => x.got === x.want), fr2?.layers);
  await run('/edit-proxy off');

  // 9. render queue: two renders one after the other
  await run('/render-queue add draft whatsapp');
  step('/render-queue add', VideoPack.queueList().filter((x) => x.state === 'waiting').length === 2, said);
  await run('/render-queue run');
  const q = VideoPack.queueList();
  const outs = q.filter((x) => x.state === 'done').map((x) => x.output);
  const probes = await Promise.all(outs.map((o) => window.hub.video.probe(o, {})));
  step('the queue renders both (files ffprobe reads)', outs.length === 2 && probes.every((p) => p?.duration > 1), { said, q: q.map((x) => [x.state, x.error]) });

  // 10. cuts paced like the board, chapters → markers
  await run('/cut-to-vibe');
  step('/cut-to-vibe suggests cuts (Enter applies)', VideoCut.suggestion?.mode === 'vibe' && VideoCut.suggestion.times.length > 0, said);
  VideoCut.suggest('off');
  const all = (await window.hub.kvGet('capture-marks', {})) || {};
  all[A] = [{ time: 0.25, label: 'Opening chapter' }];
  await window.hub.kvSet('capture-marks', all);
  await run('/chapters-to-markers');
  step('/chapters-to-markers: a recording\'s chapter becomes a marker', VideoCut.edit.markers.some((m) => m.label === 'Opening chapter'), said);

  // 11. the agents' ops, the real-time WebM's length, the menus
  const r1 = await op({ op: 'preview-sound', on: true });
  const r2 = await op({ op: 'queue', action: 'list' });
  const r3 = await op({ op: 'adjustment', at: 0, dur: 0.5 });
  step('video_edit ops of the pack answer', r1.ok && r2.ok && r3.ok && /adjustment layer/.test(r3.value), [r1, r2, r3].map((r) => r.value || r.error));
  const bytes = await VideoComp.record({ a: 0, b: 1.2, maxSide: 320 });
  const ms = WebmDuration.read(bytes);
  step('the real-time WebM says how long it is', ms > 1000 && ms < 1500, ms);
  await window.hub.fs.write(`${VIDS}/live.webm`, bytes);
  const pw = await window.hub.video.probe(`${VIDS}/live.webm`, {});
  step('ffprobe reads its length', pw?.duration > 1 && pw.duration < 1.6, pw?.duration);
  const more = VideoPack.moreItems().map((x) => x.label);
  step('⋯ › Pro tools lists the pack', ['Duck the music under the voice', 'Cut to the board\'s pacing', 'Multicam', 'Proxies'].every((l) => more.some((m) => m.startsWith(l))), more);
  step('0 duplicate command names', !Commands.duplicates().length, Commands.duplicates());
  await shot('pack-end');
} catch (err) { step(`crashed: ${err.message}`, false, String(err.stack).split('\n').slice(0, 3).join(' | ')); }
return J.done();
