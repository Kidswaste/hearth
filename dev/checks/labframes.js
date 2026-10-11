// The Lab with video footage and no song (round 8, labframes): exact frames everywhere, read back three ways — the
// Lab's counter, the frame the sketch's decoder presented (media.frame, requestVideoFrameCallback) and the frame
// number decoded from the picture the sketch drew with media.texture() (the code burned into every test frame).
// Stepping (← → Shift , . Home End), typed timecodes, scrubbing with the mouse, J K L, loops / cues / markers /
// keyframes on frames, the cut list (the sketch never shows a removed frame while playing, steps skip them, undo),
// a Lab sequence round trip, 25 and 29.97 fps footage, the director's tools
// (frame / step / read / footage) and the chat commands, keys registered, no duplicate commands.
//   node dev/make-lab-footage.js /tmp/labframes-media
//   node dev/smoke.js --check-timeout 600000 --lib dev/checks/journey-lib.js --lib dev/checks/labframes-lib.js --script dev/checks/labframes.js --shot /tmp/labframes.png
const { step, shot } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp/labframes-media';
const { wait, until, press, shown, sbx } = LF;
const M = LF.MEDIA;
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const same = (s, n) => s.lab === n && s.sketch === n && s.pixels === n;
const call = (tool, args) => HubBridge.call(tool, args);

// ---------- 1. silent 24 fps footage, no song ----------
const r = await LF.setup(`${M}/frames_silent_24.mp4`);
const st0 = ThreeFrames.status();
step('footage loads with no song: frame mode on, true fps from ffprobe', r.loaded && st0.frameMode && st0.fps === 24 && st0.frames === 96 && /ffprobe/.test(st0.clock), st0);
const bar = document.querySelector('.media-bar');
const vis = (n) => Boolean(n && n.getBoundingClientRect().width);
step('silent footage: the music controls tuck away (Tap, K S H, grid row), the time box is a timecode counter', !vis(bar.querySelector('.mb-tap')) && !vis(bar.querySelector('.mb-grid')) && /^\d\d:\d\d:\d\d:\d\d · f0$/.test(bar.querySelector('.mb-time').textContent), bar.querySelector('.mb-time').textContent);
let s = await shown();
step('frame 0 on screen (counter = media.frame = pixels)', same(s, 0), s);

// ---------- 2. stepping with real keys ----------
await press('ArrowRight', { repeat: 45, gap: 25 });
s = await shown({ settle: 700 });
step('→ ×45 = frame 45 exactly', same(s, 45), s);
await press('ArrowLeft', { shift: true });
s = await shown({ settle: 600 });
step('Shift+← = 10 frames back (35)', same(s, 35), s);
await press(','); s = await shown({ settle: 500 });
step(', = one frame back (34)', same(s, 34), s);
await press('.', { repeat: 2, gap: 120 }); s = await shown({ settle: 600 });
step('. . = two frames forward (36)', same(s, 36), s);
await press('End'); s = await shown({ settle: 600 });
step('End = the last frame (95)', same(s, 95), s);
await press('Home'); s = await shown({ settle: 600 });
step('Home = frame 0', same(s, 0), s);
const tcText = await say('/footage go 00:00:02:12');
s = await shown({ settle: 600 });
step('/footage go 00:00:02:12 = frame 60 at 24 fps', same(s, 60), { tcText, s });
step('the playhead sits on the start of a whole frame', Math.abs(ThreeLab.director.media.time - 60 / 24) < 1e-6, ThreeLab.director.media.time);
const chk = await ThreeFrames.checkFrame();
step('frame check: confirmed on screen', chk.ok && chk.presented === 60, chk);

// ---------- 3. scrubbing with the mouse lands on whole frames ----------
const tl = bar.querySelector('.mb-timeline');
{
  const b = tl.getBoundingClientRect(); const y = b.top + 40; const w = b.width - 122;
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: b.left + w * 0.2, y, button: 'left', clickCount: 1 } });
  for (let i = 1; i <= 12; i++) { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: b.left + w * (0.2 + i * 0.03), y, button: 'left', buttons: 1 } }); await wait(30); }
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: b.left + w * 0.56, y, button: 'left', clickCount: 1 } });
}
s = await shown({ settle: 800 });
const t = ThreeLab.director.media.time;
step('scrubbed: the playhead lands on a frame start, the sketch shows that frame', Math.abs(t * 24 - Math.round(t * 24)) < 1e-4 && same(s, Math.round(t * 24)) && s.lab > 40, { t, s });
await shot('scrubbed');

// ---------- 4. J K L ----------
await say('/footage go 10');
await press('l'); await wait(900);
const playing = ThreeLab.director.media.playing;
await press('k'); s = await shown({ settle: 900 });
step('L plays, K stops on a whole frame (counter = pixels)', playing && !ThreeLab.director.media.playing && same(s, s.lab) && s.lab > 10, s);
await press('l'); await wait(300); await press('l'); await wait(200);
const rate2 = ThreeLab.director.media.rate;
await press('k'); await wait(700);
step('L L = 2× forward', rate2 === 2, rate2);
const before = ThreeFrames.frame;
await press('j'); await wait(700); await press('k');
s = await shown({ settle: 800 });
step('J steps backward, K stops (frame went down, on screen exactly)', s.lab < before && same(s, s.lab), { before, s });

// ---------- 5. loops, cues, markers, keyframes on frames ----------
await say('/footage go f30'); await wait(300);
await press('['); await say('/footage go f54'); await wait(300); await press(']');
const lp = ThreeLab.director.media.loop;
step('[ ] at f30 / f54: the loop is exactly 24 frames', lp && Math.abs(lp.a - 30 / 24) < 2e-4 && Math.abs(lp.b - 54 / 24) < 2e-4, lp);
await say('/footage go f40'); await wait(300); await press('c');
const cue = ThreeLab.director.media.cues.find((x) => Math.abs(x.time - 40 / 24) < 2e-4);
step('C drops a cue on frame 40', Boolean(cue), ThreeLab.director.media.cues);
const tle = await call('three_do', { cmd: 'timeline_edit', markers: { add: { hit: ['f12', 'f18'] }, snap: false } });
const hits = ThreeLab.director.media.timeline().markers.hit;
step('markers by frame from the director ("f12", "f18")', tle.ok !== false && hits.some((x) => Math.abs(x - 0.5) < 2e-4) && hits.some((x) => Math.abs(x - 0.75) < 2e-4), { tle: tle.error, hits });
const kf = await call('three_do', { cmd: 'keyframes', layer: 'selected', property: 'opacity', keys: [{ frame: 48, value: 1 }, { frame: 72, value: 0.2, ease: 'linear' }] });
const kj = JSON.stringify(ThreeLab.director.timeline().layers);
step('keyframes by frame (48, 72) land on 2.000 s and 3.000 s', kf.ok !== false && kj.includes('2s=1') && kj.includes('3s=0.2'), { kf: kf.error, kj: kj.slice(0, 300) });

// ---------- 6. the cut list: the sketch plays the parts ----------
await say('/cut-clear');
await say('/footage go f24'); await press('s');
await say('/footage go f48'); await press('s');
await say('/footage go f36'); await press('Delete');
let parts = ThreeFrames.parts;
step('S at f24 and f48, Delete at f36: two parts play (f0–23, f48–95)', parts?.length === 2 && Math.abs(parts[0].b - 1) < 1e-6 && Math.abs(parts[1].a - 2) < 1e-6, ThreeFrames.describe());
await say('/footage go f22'); await press('ArrowRight', { repeat: 2, gap: 200 });
s = await shown({ settle: 700 });
step('stepping skips the removed frames (f22 → f23 → f48)', same(s, 48), s);
await say('/loop off'); ThreeLab.director.media.setLoop(null);
await say('/footage go f0');
await sbx('__lf.seen = []; return 1');
ThreeLab.director.media.toggle(true);
await until(() => ThreeLab.director.media.playing, 4000);
await until(() => ThreeLab.director.media.time > 2.6 || !ThreeLab.director.media.playing, 12000);
ThreeLab.director.media.toggle(false); await wait(500);
const seen = await sbx('return __lf.seen.slice()');
const bad = (seen || []).filter((n) => n >= 24 && n < 48);
step('playing through the cut: the sketch never sees a removed frame (f24–47), and plays on after it', Array.isArray(seen) && seen.length > 5 && !bad.length && seen.some((n) => n >= 48), { n: seen?.length, bad, last: seen?.slice(-6) });
await shot('cut');
const shared = await CutStore.editFor(ThreeFrames._F.path);
step('the cut is stored (kv video-cuts, one edit)', shared?.clips?.length === 2 && shared.clips[1].in === 2, shared?.clips?.map((c) => [c.in, c.out]));
await press('z', { ctrl: true });
step('Ctrl+Z undoes the cut step (the part is back)', ThreeFrames.parts?.length === 3, ThreeFrames.describe());
await press('z', { ctrl: true }); await press('z', { ctrl: true });
step('… and the cuts before it (whole video again)', !ThreeFrames.parts, ThreeFrames.describe());
await say('/footage cut f24'); await say('/footage go f10'); await say('/cut-delete');
await say('/footage go f30'); await say('/clip-speed 0.5');
step('the frame commands work on the Lab footage (/cut-delete, /clip-speed)', ThreeFrames.parts?.length === 1 && Math.abs(ThreeFrames.parts[0].a - 1) < 1e-6 && ThreeFrames.parts[0].speed === 0.5, ThreeFrames.describe());

// ---------- 7. the cut onto a Lab sequence and back (Video Review's editor until round 17) ----------
const seqKey = await ThreeFrames.toSequence('Lab check seq');
await wait(600);
const seqEdit = seqKey ? await CutStore.editFor(seqKey) : null;
step('the Lab\'s cut as a new Lab sequence', String(seqKey).startsWith('seq:') && seqEdit?.seq?.lab && seqEdit.clips.length === ThreeFrames.parts.length, seqKey);
if (typeof ThreeSeq !== 'undefined' && ThreeSeq.active) await ThreeSeq.leave?.();
activate('tool:three'); await wait(600);
await say('/cut-clear');
const back = await say(`/footage-back ${String(seqKey).slice(4)}`);
step('…and back into the Lab from the sequence', ThreeFrames.parts?.length === seqEdit?.clips.length, back);
await say('/cut-clear');

const names = ['footage', 'shuttle', 'frame-read', 'lab-cuts', 'cut-here', 'cut-restore', 'cut-clear', 'cut-keep', 'cut-range', 'cut-scenes', 'cut-bars', 'footage-scenes', 'footage-sequence', 'footage-back', 'match-pacing', 'ref-frames', 'ref-motion', 'frame-display', 'loop-frames', 'edit-points'];
const missing = names.filter((n) => Commands.get(n)?.area !== 'Three.js Lab');
step('the footage commands are registered (area Three.js Lab)', !missing.length, missing);
step('no duplicate command names', !Commands.duplicates().length, Commands.duplicates());
const keysListed = Keys.groups(true).get('Lab timeline') || [];
step('the footage keys are in the keys button (Lab timeline)', keysListed.length >= 10, keysListed.length);
await shot('final');
return J.done();
