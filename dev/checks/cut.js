// Cut (clip editing in Video Review, tools/video-cut.js) with real keys and mouse: E opens the clip track, S splits,
// edge drags trim (snapping), a body drag reorders, Shift+Del / Del, D, A, ], M, I / O, ⌘Z; auto-cut on bars;
// freeze frame + title card; another source added; seamless playback across cuts (no gaps, the right frame after
// each cut); exports with ffmpeg checked with ffprobe (new version in the library, a social size, GIF, stills);
// the Lab's trim / send-clip / cut-loop; smoothness (compositor playhead, DOM writes while playing).
//   sh dev/make-test-videos.sh /tmp/hearth-test-videos
//   node dev/smoke.js --check-timeout 600000 --lib dev/checks/journey-lib.js --script dev/checks/cut.js --shot /tmp/cut.png
const { wait, until, step, click, key, drag, shot, visible, mouse } = J;
J.shotDir = window.JOURNEY_SHOTS || window.SMOKE_SAVES;
const SRC = window.VIDS || '/tmp/hearth-test-videos';
const VIDS = `${window.SMOKE_SAVES}/renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir)) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
const agent = H.claudeAgent().id;
const C = CutData;
const run = (line) => Commands.tryRun(line, agent);
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const sig = () => VideoCut.describe().join(' | ');
// keys journey-lib doesn't map (Home, Shift+Delete)
const special = async (k, code, mods = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods } }); await wait(80); };

activate('tool:ae');
await Review.ensureMounted();
H.config.settings = { ...H.config.settings, videoDirs: [VIDS] }; // this run only
await Review.load(true);
await until(() => Review.videos.length >= 6, 10000);
const A = Review.videos.find((v) => /neon_tunnel_v2\.mp4$/.test(v.path)).path;
const B = Review.videos.find((v) => /neon_tunnel_v1\.mp4$/.test(v.path)).path;
const Q = Review.videos.find((v) => /square_loop/.test(v.path)).path;
await Review.open(A); await Review.waitReady();
await until(() => Review.state.audio, 15000); // beats for snapping and auto-cut
await wait(600);
const root = H.surfaces.get('tool:ae').el;

// 1. E opens the clip track
const cutBtn = root.querySelector('.vr-cut-btn');
step('✂ button in the transport', visible(cutBtn));
await click(cutBtn); await wait(500);
step('clip track open (✂ button)', VideoCut.active && visible(root.querySelector('.vr-cut-track')) && !visible(root.querySelector('.vr-timeline')));
await key('e'); await wait(300);
step('E leaves', !VideoCut.active);
await key('e'); await wait(600);
step('E opens again', VideoCut.active, sig());
await shot('open');

// 2. S splits at the playhead (keys only: Home, → frames, S)
await special('Home', 36); await wait(200);
for (let i = 0; i < 30; i += 1) await key('ArrowRight', { shift: false });
await wait(300);
step('→ steps the program one frame at a time', near(VideoCut.time, 30.5 / 30, 0.04), VideoCut.time);
await key('s'); await wait(300);
step('S splits', VideoCut.edit.clips.length === 2 && near(VideoCut.edit.clips[0].out, 1.0167, 0.03), sig());
await run('/goto 3'); await wait(300);
await key('s'); await wait(300);
step('second split (typed time, S)', VideoCut.edit.clips.length === 3, sig());

// 3. drag the right edge of clip 1 (trim, snapping)
const cv = root.querySelector('.vr-cut-cv');
const r = cv.getBoundingClientRect();
const T = C.total(VideoCut.edit);
const xAt = (t) => r.left + (t / T) * r.width;
const yLane = r.top + r.height * 0.6;
// drag the edge to 3 px right of the beat at 0.745 s: it should land on the beat
const x0 = xAt(VideoCut.edit.clips[0].out) - 2;
const beatX = xAt(Review.state.audio.beats.find((b) => b > 0.5 && b < 0.9)) + 3;
await mouse('mouseMoved', x0, yLane, { button: 'none' }); await mouse('mousePressed', x0, yLane);
for (let i = 1; i <= 8; i += 1) await mouse('mouseMoved', x0 + ((beatX - x0) * i) / 8, yLane, { buttons: 1 });
await mouse('mouseReleased', beatX, yLane); await wait(300);
const c1 = VideoCut.edit.clips[0];
step('edge drag trims clip 1 (ripple)', c1.out < 0.9 && near(C.total(VideoCut.edit), T - (1.0167 - c1.out), 0.05), { out: c1.out, total: C.total(VideoCut.edit) });
const beats = Review.state.audio?.beats || [];
step('the trim snapped to the beat', beats.some((b) => near(b, c1.out, 0.002)), { out: c1.out, beats: beats.slice(0, 4) });
await key('z', { ctrl: true }); await wait(300);
step('Ctrl+Z undoes the trim', near(VideoCut.edit.clips[0].out, 1.0167, 0.03), sig());
await key('z', { ctrl: true, shift: true }); await wait(300);
step('Ctrl+Shift+Z redoes it', VideoCut.edit.clips[0].out < 0.9);
await key('z', { ctrl: true }); await wait(200);

// 4. reorder: drag clip 3 to the front
const T2 = C.total(VideoCut.edit);
const L2 = C.layout(VideoCut.edit);
const id3 = L2[2].clip.id;
const xa = r.left + ((L2[2].start + L2[2].end) / 2 / T2) * r.width;
await mouse('mouseMoved', xa, yLane, { button: 'none' }); await mouse('mousePressed', xa, yLane);
for (let i = 1; i <= 10; i += 1) await mouse('mouseMoved', xa + ((r.left + 4 - xa) * i) / 10, yLane, { buttons: 1 });
await mouse('mouseReleased', r.left + 4, yLane); await wait(300);
step('drag a clip to reorder', VideoCut.edit.clips[0].id === id3, sig());
await key('z', { ctrl: true }); await wait(200);

// 5. keys on the selected clip: click clip 2, D, A, ], Shift+Del, Del
const L3 = C.layout(VideoCut.edit);
await mouse('mouseMoved', r.left + (((L3[1].start + L3[1].end) / 2) / C.total(VideoCut.edit)) * r.width, yLane, { button: 'none' });
await mouse('mousePressed', r.left + (((L3[1].start + L3[1].end) / 2) / C.total(VideoCut.edit)) * r.width, yLane); await mouse('mouseReleased', r.left + (((L3[1].start + L3[1].end) / 2) / C.total(VideoCut.edit)) * r.width, yLane);
await wait(250);
step('click selects a clip', VideoCut.selection[0] === VideoCut.edit.clips[1].id);
await key('d'); await wait(250);
step('D duplicates', VideoCut.edit.clips.length === 4 && VideoCut.edit.clips[2].in === VideoCut.edit.clips[1].in, sig());
await key('a'); await wait(200);
step('A mutes', VideoCut.edit.clips.some((c) => c.mute), sig());
await key(']'); await wait(200);
step('] speeds the clip up (1.25×)', VideoCut.edit.clips.some((c) => c.speed === 1.25), sig());
await key(']'); await key(']'); await wait(200);
step('] again → 2×', VideoCut.edit.clips.some((c) => c.speed === 2), sig());
const before = C.total(VideoCut.edit);
await key('Delete'); await wait(250);
step('Del lifts (a gap stays)', VideoCut.edit.clips.some((c) => c.kind === 'gap') && near(C.total(VideoCut.edit), before), sig());
await key('z', { ctrl: true }); await wait(250);
await special('Delete', 46, 8);
await wait(250);
step('Shift+Del ripple-deletes (shorter)', C.total(VideoCut.edit) < before - 0.3 && !VideoCut.edit.clips.some((c) => c.kind === 'gap'), { before, after: C.total(VideoCut.edit) });

// 6. marker, in–out, Q / W, fade from chat
await run('/goto 0.5'); await wait(200);
await key('m'); await wait(200);
step('M adds a marker', VideoCut.edit.markers.length === 1);
await key('i'); await run('/goto 1.5'); await wait(150); await key('o'); await wait(200);
step('I / O set the in–out range', VideoCut.edit.mark && near(VideoCut.edit.mark.a, 0.5, 0.05) && near(VideoCut.edit.mark.b, 1.5, 0.05), VideoCut.edit.mark);
await key('x'); await wait(150);
step('X clears it', !VideoCut.edit.mark);
await run('/clip-fade both 0.3 1');
step('/clip-fade', near(VideoCut.edit.clips[0].fadeIn, 0.3) && near(VideoCut.edit.clips[0].fadeOut, 0.3), VideoCut.edit.clips[0]);

// 7. auto-cut on the bars: a suggestion, then Enter
await run('/cut reset'); await wait(300);
step('/cut reset → whole video', VideoCut.edit.clips.length === 1);
await run('/cut-auto bars'); await wait(300);
const sug = VideoCut.suggestion;
step('auto-cut suggests cuts on bars (nothing changed yet)', sug?.times.length >= 2 && VideoCut.edit.clips.length === 1, sug);
await shot('suggestion');
await key('Enter'); await wait(300);
step('Enter makes them', VideoCut.edit.clips.length === (sug?.times.length || 0) + 1, sig());
step('the cuts sit on bars', C.cuts(VideoCut.edit).every((t) => beats.some((b, i) => i % 4 === 0 && near(b, t, 0.002))), C.cuts(VideoCut.edit));

// 8. freeze frame, title card, another source
await run('/goto 1'); await wait(200);
await key('f', { shift: true }); await wait(400);
step('Shift+F inserts a freeze frame', VideoCut.edit.clips.some((c) => c.kind === 'freeze' && near(c.dur, 1)), sig());
await run('/title-card HELLO CUT 1.5');
await until(() => VideoCut.edit.clips.some((c) => c.kind === 'title' && c.img), 4000);
step('/title-card inserts a title clip with its picture', VideoCut.edit.clips.some((c) => c.kind === 'title' && c.img), sig());
await run(`/cut-add neon_tunnel_v1 1 2.5`);
step('/cut-add adds another source (from–to)', VideoCut.edit.clips.at(-1).src === B && near(VideoCut.edit.clips.at(-1).in, 1) && near(VideoCut.edit.clips.at(-1).out, 2.5), sig());
// drop a library card on the track (the drag data the card sets)
const dt = new DataTransfer();
dt.setData('text/x-hearth-video', Q);
const dropAt = cv.getBoundingClientRect();
root.querySelector('.vr-cut').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: dropAt.right - 2, clientY: dropAt.top + 30, bubbles: true }));
await until(() => VideoCut.edit.clips.some((c) => c.src === Q), 5000);
step('a library card dropped on the track is added', VideoCut.edit.clips.at(-1).src === Q, sig());
await wait(1500); // thumbnails of the new sources
await shot('edited');

// 9. playback across every cut: the right frame shows after each cut, never a wrong source or a stall
VideoCut.pause();
await VideoCut.goto(0); await wait(400);
const E = VideoCut.edit;
const L = C.layout(E);
const samples = []; let stop = false; let heads = 0;
const pa = root.querySelectorAll('.vr-p');
const sample = () => {
  if (stop) return;
  const T0 = VideoCut.time;
  const x = C.at(E, T0);
  const vis = [...pa].find((v) => v.classList.contains('on'));
  samples.push({ T: T0, i: x?.i, kind: x?.clip.kind, src: vis?.dataset.src || (vis?.tagName === 'IMG' ? 'img' : ''), ct: vis?.tagName === 'VIDEO' ? vis.currentTime : null, want: x?.srcTime, wantSrc: x?.clip.src });
  requestAnimationFrame(sample);
};
const mo = new MutationObserver((list) => { heads += list.length; });
mo.observe(root.querySelector('.vr'), { subtree: true, childList: true, attributes: true, characterData: true });
VideoCut.play();
requestAnimationFrame(sample);
const total = C.total(E);
await until(() => !VideoCut.playing, (total + 4) * 1000);
stop = true; mo.disconnect();
const bad = samples.filter((s) => (s.kind === 'video' && (s.src !== s.wantSrc || Math.abs(s.ct - s.want) > 0.15)) || (s.kind === 'freeze' && s.src !== s.wantSrc) || (s.kind === 'title' && s.src !== 'img'));
step('played the whole edit to the end', near(VideoCut.time, total, 0.1) && samples.length > total * 8, { t: VideoCut.time, total, frames: samples.length });
step('every frame showed the right clip and source time (seamless cuts)', bad.length <= Math.max(2, samples.length * 0.02), { bad: bad.length, of: samples.length, first: bad.slice(0, 4) });
const perSec = heads / total;
step('DOM writes while playing stay low (compositor playhead)', perSec < 70, { mutationsPerSecond: Math.round(perSec) });
VideoCut.play(); await wait(400);
step('the playhead glides on the compositor', root.querySelector('.vr-cut-ph').getAnimations().length === 1);
VideoCut.pause();

// 10. exports (ffmpeg), checked with ffprobe
const probe = (p) => window.hub.video.probe(p, {});
const r1 = await run('/cut-export');
const ver = VideoCut.edit && Review.versionsOf({ path: A }).map((v) => v.path);
const newVer = `${VIDS}/neon_tunnel_v3.mp4`;
const p1 = await probe(newVer);
step('/cut-export → neon_tunnel_v3.mp4 next to it (a new version)', Boolean(p1), { r1, ver });
step('its length = the edit', p1 && near(p1.duration, total, 0.15), { probe: p1?.duration, total });
await until(() => Review.videos.some((v) => v.path === newVer), 8000);
step('it shows in the library as a version', Review.versionsOf({ path: A }).some((v) => v.path === newVer));
await run('/cut-range 0 2'); await wait(200);
const r2 = await run('/cut-export square blur');
const sq = (await window.hub.fs.list(`${VIDS}/exports`)).find((f) => /_cut_square_1080x1080\.mp4$/.test(f.name));
const p2 = sq && await probe(sq.path);
step('/cut-export square (in–out range) → 1080×1080, 2 s', p2 && p2.w === 1080 && p2.h === 1080 && near(p2.duration, 2, 0.12), { r2, p2 });
const r3 = await run('/cut-export gif');
const gif = (await window.hub.fs.list(`${VIDS}/exports`)).find((f) => /_cut_gif.*\.gif$/.test(f.name));
step('/cut-export gif', Boolean(gif && gif.size > 1000), r3);
const r4 = await run('/cut-export stills');
const stills = await window.hub.fs.list(`${VIDS}/exports/neon_tunnel_v2_cut_stills`).catch(() => []);
step('/cut-export stills → a PNG per frame', stills.length >= 55 && stills.length <= 65, { r4, n: stills.length });
await run('/cut-range off');

// 11. chat: /clips lists, /split, /ripple-delete 2, /clip-speed, status for the director
const listed = await run('/clips');
step('/clips', VideoCut.edit.clips.length > 3, typeof listed === 'string' ? listed.slice(0, 80) : listed);
const n0 = VideoCut.edit.clips.length;
await run('/ripple-delete 2');
step('/ripple-delete 2', VideoCut.edit.clips.length === n0 - 1);
await run('/clip-speed 0.5 1');
step('/clip-speed 0.5 1', VideoCut.edit.clips[0].speed === 0.5);
const stat = await Review.tool('video_status', {});
step('video_status tells the director about the cut', stat.value.cut?.clips === VideoCut.edit.clips.length, stat.value.cut);
step('the cut is saved (kv video-cuts)', Boolean((await window.hub.kvGet('video-cuts', {}))[A]));
await key('e'); await wait(300);
Review.setFilter({ group: false }); await wait(300);
step('leaving keeps the cut; its library card shows ✂', !VideoCut.active && VideoCut.hasCut(A) && Boolean(root.querySelector(`.vr-card[data-path="${CSS.escape(A)}"] .vr-cutb`)));
Review.setFilter({ group: true });
await shot('review-again');

// 12. the Lab: a video loaded there → trim, save a part, send to Video Review
const lab = await ThreeLab.cmd({ show: true });
await lab.loadSong(B);
await until(() => lab.player.loaded && lab.player.duration > 0, 15000);
const tr = await run('/song-trim 1 4');
step('/song-trim 1 4', near(lab.player.trim?.a, 1) && near(lab.player.trim?.b, 4, 0.05), { tr, trim: lab.player.trim });
await wait(400);
await smoke({ shot: `${J.shotDir}/lab-trim.png` });
const saved = await run('/cut-loop');
const part = (await window.hub.fs.list(VIDS)).find((f) => /neon_tunnel_v1_cut /.test(f.name));
const pp = part && await probe(part.path);
step('/cut-loop saves the trimmed part (ffmpeg)', pp && near(pp.duration, 3, 0.12), { saved, part: part?.name, d: pp?.duration });
await Review.open(A); await Review.waitReady();
const before2 = (await window.hub.kvGet('video-cuts', {}))[A]?.clips?.length || 0;
await run('/send-clip');
await until(() => VideoCut.active && VideoCut.edit.clips.at(-1).src === B, 8000);
const last = VideoCut.edit.clips.at(-1);
step('/send-clip → a clip on the Video Review cut', last.src === B && near(last.in, 1) && near(last.out, 4, 0.05) && VideoCut.edit.clips.length === before2 + 1, sig());
await run('/song-trim off');
step('/song-trim off', !lab.player.trim);
activate('tool:ae'); await wait(800);
await shot('final');
return J.done();
