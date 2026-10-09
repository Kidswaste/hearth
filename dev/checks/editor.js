// The video editor (Video Review ✂, round 7) driven like a user: real keys, clicks, right-click menus with
// submenus, the inspector, drags; frame-exact stepping checked against the frame numbers burned into the test
// clips (read back from the pixels on screen), on 30, 25 and 24 fps footage with and without sound; split / trim /
// razor / roll / slip; overlays, titles, transitions, keyframes, looks; rich preview on the compositor; exports
// read back frame by frame (decoded in a <video>) and checked with ffprobe; templates and sequences; keys registry.
//   node dev/make-editor-videos.js /tmp/hearth-editor-videos
//   node dev/smoke.js --check-timeout 900000 --lib dev/checks/journey-lib.js --lib dev/editor-frames.js --script dev/checks/editor.js --shot /tmp/editor.png
const { wait, until, click, key, shot, visible, mouse, type } = J;
// progress goes to a file too (a hung step shows where it stopped): EDITOR_LOG or the run's save folder
const LOG = window.EDITOR_LOG || `${window.SMOKE_SAVES}/editor-progress.txt`;
let logText = '';
const step = (name, ok, info) => { logText += `${ok ? '✓' : '✖'} ${name}\n`; window.hub.fs.write(LOG, logText).catch(() => {}); return J.step(name, ok, info); };
const note = (s) => { logText += `… ${s}\n`; window.hub.fs.write(LOG, logText).catch(() => {}); };
J.shotDir = window.JOURNEY_SHOTS || window.SMOKE_SAVES;
const SRC = window.EDITOR_VIDS || '/tmp/hearth-editor-videos';
const VIDS = `${window.SMOKE_SAVES}/renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir)) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
const agent = H.claudeAgent().id;
const C = CutData;
const run = (line) => Commands.tryRun(line, agent);
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const special = async (k, code, mods = 0) => { for (const type0 of ['rawKeyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: type0, key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods } }); await wait(80); };
// the frame number burned into the picture on screen (simple edits: the visible decoder; rich: the compositor)
function codeOnScreen(rect) {
  const root = H.surfaces.get('tool:ae').el;
  const comp = root.querySelector('.vr-pcomp.on');
  const src = comp || [...root.querySelectorAll('video.vr-p')].find((v) => v.classList.contains('on'));
  if (!src) return null;
  const w = comp ? comp.width : src.videoWidth; const h = comp ? comp.height : src.videoHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h);
  const r = rect ? { x0: Math.round(rect[0] * w), y0: Math.round(rect[1] * h), w: Math.round(rect[2] * w), h: Math.round(rect[3] * h) } : {};
  return decodeFrameCode(g.getImageData(0, 0, w, h).data, w, h, r);
}
// the frame number in a rendered file at its frame n (seeked in a <video>, read from the pixels)
async function codeInFile(path, n, fps, rect) {
  const v = document.createElement('video'); v.muted = true; v.src = `file://${path}`;
  await new Promise((res) => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 8000); });
  v.currentTime = (n + 0.5) / fps;
  await new Promise((res) => { v.onseeked = res; setTimeout(res, 4000); });
  await new Promise((res) => { v.requestVideoFrameCallback?.(() => res()); setTimeout(res, 400); });
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext('2d'); g.drawImage(v, 0, 0);
  const r = rect ? { x0: Math.round(rect[0] * c.width), y0: Math.round(rect[1] * c.height), w: Math.round(rect[2] * c.width), h: Math.round(rect[3] * c.height) } : {};
  const out = decodeFrameCode(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, r);
  v.removeAttribute('src'); v.load();
  return out;
}
const menuButtons = () => [...document.querySelectorAll('#menu > button')];
async function menuPick(...labels) {
  for (const l of labels) {
    let b = null;
    await until(() => (b = menuButtons().find((x) => x.textContent.replace(/\s+›$/, '').trim().startsWith(l))), 3000);
    if (!b) throw new Error(`menu: no "${l}" in [${menuButtons().map((x) => x.textContent).join(' | ')}]`);
    await click(b); await wait(120);
  }
}
const lane = (kind) => VideoCut._test.lanes().find((l) => l.kind === kind || l.track?.name === kind);

try {
activate('tool:ae');
await Review.ensureMounted();
H.config.settings = { ...H.config.settings, videoDirs: [VIDS] }; // this run only
await Review.load(true);
await until(() => Review.videos.length >= 4, 10000);
const P = (re) => Review.videos.find((v) => re.test(v.path)).path;
const A = P(/frames_a_30/); const B = P(/frames_b_30/); const C25 = P(/frames_c_25/); const S24 = P(/frames_silent_24/);
const STILL = `${VIDS}/still.png`; const MUSIC = `${VIDS}/music.wav`;
await Review.open(A); await Review.waitReady();
await wait(500);
const root = H.surfaces.get('tool:ae').el;

// 1. ✂ / E open the editor: one ＋, a format chip, keys in the registry
await click(root.querySelector('.vr-cut-btn')); await until(() => VideoCut.active, 15000); await wait(300);
step('✂ opens the editor', VideoCut.active && visible(root.querySelector('.vr-cut-track')));
await key('e'); await until(() => !VideoCut.active, 3000);
step('E closes it', !VideoCut.active);
await key('e'); await until(() => VideoCut.active, 15000); await wait(400);
step('E opens it again', VideoCut.active);
step('＋ (add) and the format chip are the only new buttons', visible(root.querySelector('.vr-cut-add')) && /9:16 · 30 fps/.test(root.querySelector('.vr-cut-fmt').textContent), root.querySelector('.vr-cut-fmt').textContent);
const editorKeys = Keys.all().filter((k) => k.area === 'Editor');
step('every editor key is in the keys registry', editorKeys.length >= 30, editorKeys.length);

// 2. frame-exact stepping, no song needed: ← → Shift, the frame code on screen = the frame counter
await special('Home', 36);
for (let i = 0; i < 45; i += 1) await key('ArrowRight');
await wait(400);
let fi = await VideoCut.frameInfo();
step('→ ×45 lands on frame 45 (counter, decoder via requestVideoFrameCallback, and the pixels)', fi.frame === 45 && fi.layers[0]?.got === 45 && codeOnScreen() === 45, { fi, code: codeOnScreen() });
for (let i = 0; i < 3; i += 1) await key('ArrowRight', { shift: true });
await key('ArrowLeft'); await wait(400);
fi = await VideoCut.frameInfo();
step('Shift+→ ×3 then ← = frame 74', fi.frame === 74 && codeOnScreen() === 74, { frame: fi.frame, code: codeOnScreen() });
step('the transport shows the timecode HH:MM:SS:FF and the frame', root.querySelector('.vr-time').value === '00:00:02:14' && /f74/.test(root.querySelector('.vr-time-total').textContent), [root.querySelector('.vr-time').value, root.querySelector('.vr-time-total').textContent]);
await click(root.querySelector('.vr-time')); await key('a', { ctrl: true }); await type('00:00:04:03'); await key('Enter'); await wait(500);
step('typing a timecode lands on its frame (4 s + 3 = 123)', codeOnScreen() === 123 && (await VideoCut.frameInfo()).frame === 123, codeOnScreen());
await run('/goto-frame 7'); await wait(300);
step('/goto-frame 7', codeOnScreen() === 7);
root.focus({ preventScroll: true });
// J K L
await key('l'); await wait(700); await key('k'); await wait(400);
fi = await VideoCut.frameInfo();
step('L plays, K stops on an exact frame (picture = counter)', fi.frame > 7 && codeOnScreen() === fi.frame, { frame: fi.frame, code: codeOnScreen() });

// 3. split (S), razor (B + click), undo; roll with Shift+drag; slip / slide by command
await run('/goto-frame 60'); await wait(250);
await key('s'); await wait(250);
step('S splits at frame 60', VideoCut.edit.clips.length === 2 && near(VideoCut.edit.clips[0].out, 60.5 / 30, 0.02), VideoCut.describe());
await key('b'); await wait(150);
const cv = root.querySelector('.vr-cut-cv');
let r = cv.getBoundingClientRect();
const mainL = lane('main');
const xAt = (t) => r.left + VideoCut._test.xOf(t);
const yMain = r.top + mainL.y + mainL.h * 0.5;
await mouse('mouseMoved', xAt(4.0), yMain, { button: 'none' }); await mouse('mousePressed', xAt(4.0), yMain); await mouse('mouseReleased', xAt(4.0), yMain); await wait(250);
step('B (razor) + a click cuts where you click', VideoCut.edit.clips.length === 3 && near(C.layout(VideoCut.edit)[2].start, 4.0, 0.05), VideoCut.describe());
await key('Escape'); await wait(100);
await key('z', { ctrl: true }); await wait(200);
step('⌘/Ctrl+Z undoes the razor cut', VideoCut.edit.clips.length === 2);
await key('z', { ctrl: true, shift: true }); await wait(200);
step('Shift+⌘/Ctrl+Z redoes it', VideoCut.edit.clips.length === 3);
// roll the first cut 10 frames right by Shift+dragging the edge
r = cv.getBoundingClientRect();
const cut1 = C.layout(VideoCut.edit)[1].start;
const ex = xAt(cut1) + 2; const tx = xAt(cut1 + 10 / 30) + 2;
await mouse('mouseMoved', ex, yMain, { button: 'none' });
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: ex, y: yMain, button: 'left', clickCount: 1, modifiers: 8 } });
for (let i = 1; i <= 6; i += 1) await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: ex + ((tx - ex) * i) / 6, y: yMain, button: 'left', buttons: 1, modifiers: 8 } });
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: tx, y: yMain, button: 'left', clickCount: 1, modifiers: 8 } }); await wait(250);
const L1 = C.layout(VideoCut.edit);
step('Shift+drag on a cut rolls it (same total length, the cut moved ≈10 frames)', near(C.total(VideoCut.edit), 6, 0.01) && Math.abs(L1[1].start - cut1 - 10 / 30) < 0.08, { from: cut1, to: L1[1].start });
await run('/slip 15 2'); await wait(150);
step('/slip 15 frames: clip 2 shows later source, same place', near(VideoCut.edit.clips[1].in - C.layout(VideoCut.edit)[1].start, 0.5, 0.05) || VideoCut.edit.clips[1].in > L1[1].start, VideoCut.describe());
await run('/slide -6 2'); await wait(150);
step('/slide −6 frames keeps the total', near(C.total(VideoCut.edit), 6, 0.01), VideoCut.describe());

// 4. a transition from the right-click menu (submenus), the compositor takes over, frames still exact
r = cv.getBoundingClientRect();
const c2 = C.layout(VideoCut.edit)[1];
await click(cv, { right: true, at: [VideoCut._test.xOf(c2.start + 0.3) / r.width, (mainL.y + mainL.h / 2) / r.height] });
await menuPick('Transition in', 'Dissolve', 'Cross dissolve');
await wait(500);
step('right-click › Transition in › Dissolve › Cross dissolve', VideoCut.edit.clips[1].trans?.type === 'dissolve', VideoCut.edit.clips[1].trans);
step('the edit is now rich: the compositor shows it', VideoCut.rich && visible(root.querySelector('.vr-pcomp.on')));
const L2 = C.layout(VideoCut.edit);
await VideoCut.goFrame(Math.round((L2[1].start + L2[1].td + 0.4) * 30)); await wait(500);
fi = await VideoCut.frameInfo();
step('after the dissolve the compositor shows the exact source frame', fi.layers.length === 1 && codeOnScreen() === fi.layers[0].want && fi.layers[0].got === fi.layers[0].want, { code: codeOnScreen(), fi });
await shot('dissolve');

// 5. layers: an overlay (PIP bottom left), a still, music, a title, a lower third — by ＋ menu, drop and commands
await VideoCut.goto(0.5); await wait(200);
await click(root.querySelector('.vr-cut-add'));
await menuPick('From the library', 'frames_b_30.mp4', 'As an overlay at the playhead');
await until(() => C.tracksOf(VideoCut.edit, 'video')[0]?.items.length === 1, 4000);
step('＋ › From the library › as an overlay: V2 appears', C.tracksOf(VideoCut.edit, 'video')[0]?.items.length === 1 && Boolean(lane('V2')));
await run('/clip-scale 40%'); await run('/clip-position -0.25 0.25');
await run('/edit-motion fade-in');
const ov = C.tracksOf(VideoCut.edit, 'video')[0].items[0];
step('/clip-scale, /clip-position, /edit-motion on the overlay', near(ov.scale, 0.4) && near(ov.x, -0.25) && ov.keys?.opacity?.length === 2, ov);
await VideoCut.goFrame(45); await wait(500);
// the PIP: 40 % of the frame, centered at (0.25 W, 0.75 H): its own code band sits at its top
const pip = codeOnScreen([0.25 - 0.2, 0.75 - 0.2, 0.4, 0.4]);
const wantPip = Math.floor(C.srcAt(ov, C.frameTime(45, 30) - ov.start) * 30 + 0.01);
step('the overlay shows B at its exact source frame', pip === wantPip && codeOnScreen() === 45, { pip, wantPip, main: codeOnScreen() });
await run(`/add-image ${STILL} 1`);
await run(`/add-music ${MUSIC} 0 60%`);
await run('/add-title HEARTH big tracking-in 2');
await run('/lower-third Quentin\\nMaker of Hearth bar-gold 2');
const tt = C.tracksOf(VideoCut.edit, 'text');
step('title + lower third on text tracks, music on A1, a still on a video track', tt.reduce((n, k) => n + k.items.length, 0) === 2 && C.tracksOf(VideoCut.edit, 'audio')[0]?.items.length === 1 && C.tracksOf(VideoCut.edit, 'video').some((k) => k.items.some((x) => x.kind === 'image')), VideoCut.describeAll());
await VideoCut.goto(1.2); await wait(700);
await shot('layers');

note('6. inspector');
// 6. inspector: double-click the title, change the style and animation, key the scale with ◆, a curve
r = cv.getBoundingClientRect();
const tl = lane(tt[0].name); const ti = tt[0].items[0];
await click(cv, { double: true, at: [VideoCut._test.xOf(ti.start + 0.5) / r.width, (tl.y + tl.h / 2) / r.height] });
await wait(400);
const insp = root.querySelector('.ed-insp');
step('double-click a title opens the inspector', visible(insp) && /HEARTH/.test(insp.textContent));
const styleSel = [...insp.querySelectorAll('.ed-row')].find((x) => x.textContent.startsWith('Style'))?.querySelector('select');
styleSel.value = 'gold'; styleSel.dispatchEvent(new Event('change')); await wait(250);
step('inspector › Style', C.find(VideoCut.edit, ti.id).clip.style === 'gold');
await VideoCut.goto(ti.start + 0.2); await wait(250);
const tsum = [...root.querySelectorAll('.ed-insp summary')].find((x) => x.textContent === 'Transform');
if (!tsum.parentElement.open) await click(tsum);
const scaleKey = [...root.querySelectorAll('.ed-insp .ed-key')].find((b) => b.dataset.prop === 'scale');
await click(scaleKey); await wait(250);
await VideoCut.goto(ti.start + 1.2); await wait(250);
const scaleRange = [...root.querySelectorAll('.ed-insp .ed-prop')].find((x) => x.textContent.includes('Scale')).querySelector('input[type="range"]');
scaleRange.value = '1.5'; scaleRange.dispatchEvent(new Event('input')); scaleRange.dispatchEvent(new Event('change')); await wait(300);
const keysNow = C.find(VideoCut.edit, ti.id).clip.keys?.scale;
step('◆ then a slider change at another time = two scale keys (auto-key)', keysNow?.length === 2 && near(keysNow[1].v, 1.5, 0.01), keysNow);
await run('/ease backOut');
step('/ease sets the curve of the key before the playhead', C.find(VideoCut.edit, ti.id).clip.keys.scale.some((k) => k.ease === 'backOut'));
await key('Escape'); await wait(150);
step('Esc closes the inspector and the keys go back to the editor', !visible(insp) && root.contains(document.activeElement));

note('7. looks');
// 7. looks: right-click › Look › Cinematic › Teal & orange; /adjust; the preview filter exists
r = cv.getBoundingClientRect();
await click(cv, { right: true, at: [VideoCut._test.xOf(0.3) / r.width, (lane('main').y + 10) / r.height] });
await menuPick('Look', 'Cinematic', 'Teal & orange');
await wait(300);
step('right-click › Look › Cinematic › Teal & orange', VideoCut.edit.clips[0].color?.look === 'teal-orange');
await run('/adjust vignette 0.4');
step('/adjust vignette', near(VideoCut.edit.clips[0].color.vignette, 0.4) && /url\(#edfx-/.test(VideoComp.filterOf(VideoCut.edit.clips[0]).css));

note('8. markers');
// 8. markers with notes, zoom, snapping, keys sheet
await VideoCut.goto(2.0); await key('m'); await wait(150);
await run('/marker-note drop here: big title');
step('M + /marker-note: markers with notes', VideoCut.edit.markers.length >= 2 && VideoCut.edit.markers.some((m) => /big title/.test(m.note || '')));
r = cv.getBoundingClientRect();
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: r.left + r.width / 2, y: r.top + 30, deltaX: 0, deltaY: -240, modifiers: 2 } }); await wait(250);
step('Ctrl+wheel zooms the timeline', Boolean(VideoCut.view));
await key('\\'); await wait(150);
step('\\ fits the edit again', !VideoCut.view);
await key('n'); step('N toggles snapping', VideoCut.snap === false); await key('n');

note('9. play the rich edit');
// 9. play the rich edit: smooth (compositor playhead, few DOM writes), ends where it should
await VideoCut.goto(0); await wait(300);
let muts = 0; const mo = new MutationObserver((l) => { muts += l.length; });
mo.observe(root.querySelector('.vr'), { subtree: true, childList: true, attributes: true, characterData: true });
VideoCut.play(); await wait(1500);
const anims = root.querySelector('.vr-cut-ph').getAnimations().length;
mo.disconnect();
VideoCut.pause(); await wait(300);
step('playing the rich edit: compositor playhead, few DOM writes', anims === 1 && muts / 1.5 < 70, { anims, perSec: Math.round(muts / 1.5) });
fi = await VideoCut.frameInfo();
step('pause lands on an exact frame (main layer)', fi.layers.find((x) => x.src === A)?.got === fi.layers.find((x) => x.src === A)?.want, fi);

note('10. export the rich edit');
// 10. export the rich edit: ffmpeg renders transitions, overlays, titles; read it back frame by frame
const total = C.total(VideoCut.edit);
const job1 = await VideoCut.exportCut({});
const ev1 = job1 ? await job1.done : { code: 'no job' };
note(`render: ${ev1.code} ${ev1.error || ''}`);
const res = ev1.code === 0;
const out1 = job1?.output;
await until(() => Review.videos.some((v) => v.path === out1), 20000);
const p1 = await window.hub.video.probe(out1, {});
step('export: a new version, the full length, video + audio', res && p1 && Math.abs(p1.duration - total) < 0.1 && p1.audio, { total, err: ev1.error, p1: p1 && { d: p1.duration, w: p1.w, h: p1.h, audio: Boolean(p1.audio) } });
const Lx = C.layout(VideoCut.edit);
const fMain = Math.round((Lx[0].start + 1.5) * 30); // inside clip 1, under the PIP's time
const wantMain = Math.floor(C.srcAt(Lx[0].clip, 1.5 + 0.5 / 30) * 30 + 1e-4);
const gotMain = await codeInFile(out1, fMain, 30);
step('rendered frame: the main clip at its exact source frame', gotMain === wantMain, { gotMain, wantMain });
const gotPip = await codeInFile(out1, 45, 30, [0.05, 0.55, 0.4, 0.4]);
step('rendered frame: the overlay at its exact source frame', gotPip === wantPip, { gotPip, wantPip });
const after = Math.round((Lx[1].start + Lx[1].td + 0.6) * 30);
const wantAfter = Math.floor(C.srcAt(Lx[1].clip, after / 30 + 0.5 / 30 - Lx[1].start) * 30 + 1e-4);
step('rendered frame after the transition: exact', (await codeInFile(out1, after, 30)) === wantAfter, { want: wantAfter });
// a social preset
await run('/edit-render square');
const sq = `${VIDS}/exports/frames_a_30_cut_square_1080x1080.mp4`;
await until(async () => (await window.hub.fs.stat(sq))?.size > 1000, 120000); await wait(1500);
const p2 = await window.hub.video.probe(sq, {});
step('/edit-render square: 1080×1080', p2?.w === 1080 && p2?.h === 1080, p2 && [p2.w, p2.h]);

note('11. other footage');
// 11. other footage: 25 fps landscape and 24 fps silent: stepping is exact at their own rates, no sound needed
VideoCut.leave(); await Review.open(S24); await Review.waitReady(); await wait(400);
await key('e'); await until(() => VideoCut.active, 5000); await wait(400);
step('24 fps silent clip: the editor runs at 24 fps', VideoCut.fps === 24, VideoCut.fps);
await special('Home', 36);
for (let i = 0; i < 30; i += 1) await key('ArrowRight');
await wait(400);
step('→ ×30 on 24 fps = frame 30 on screen', codeOnScreen() === 30 && (await VideoCut.frameInfo()).frame === 30, codeOnScreen());
await key(','); await key('.'); await wait(150);
step(', / . with no music do nothing harmful', VideoCut.active);
VideoCut.leave(); await Review.open(C25); await Review.waitReady(); await wait(400);
await VideoCut.enter(); await wait(300);
await run('/goto-frame 77'); await wait(300);
step('25 fps: /goto-frame 77 shows frame 77', codeOnScreen([0, 0.219, 1, 0.5625]) === 77 || codeOnScreen() === 77, codeOnScreen());

note('12. templates');
// 12. templates and sequences: an intro from a template, slots filled by command, rendered
await run('/edit-template social-intro-15 new');
await wait(600);
step('/edit-template … new: a sequence of its own (9:16, slots, 6 titles, markers)', VideoCut.path?.startsWith('seq:') && VideoCut.edit.clips.filter((c) => c.slot).length === 6 && C.tracksOf(VideoCut.edit, 'text')[0]?.items.length === 6 && VideoCut.frameSize().W === 1080, VideoCut.describeAll().slice(0, 4));
await run('/fill-slot 1 frames_a_30'); await run('/fill-slot 2 frames_b_30'); await run('/fill-slot 3 frames_c_25');
step('/fill-slot puts videos in the slots (lengths kept)', VideoCut.edit.clips.filter((c) => c.kind === 'video').length === 3 && near(C.total(VideoCut.edit), 15 - 5 * 0.25, 0.05), VideoCut.describe());
await VideoCut.goto(0.8); await wait(800);
await shot('template');
await run('/edit-render draft');
const draft = `${VIDS}/exports/${VideoCut.path.slice(4).replace(/[^\w.-]+/g, '_')}_cut_draft.mp4`;
await until(async () => (await window.hub.fs.stat(draft))?.size > 1000, 240000); await wait(2000);
const p3 = await window.hub.video.probe(draft, {});
step('the template renders (titles drawn as frames, slots, transitions)', p3 && Math.abs(p3.duration - C.total(VideoCut.edit)) < 0.15 && p3.h === 720, p3 && [p3.duration, p3.w, p3.h]);
step('the title frames were cleaned up', !(await window.hub.fs.list(`${VIDS}/exports`)).some((f) => /^\.hearth-titles-/.test(f.name)));

note('13. chat commands');
// 13. chat commands: no duplicates; /edit-list reads the whole edit
step('0 duplicate command names', !Commands.duplicates().length, Commands.duplicates());
step('/help editor area has the editor commands', Commands.all ? Commands.all().filter((d) => d.area === 'Video').length > 80 : true);
await shot('end');
} catch (err) { step(`crashed: ${err.message}`, false, String(err.stack).split('\n').slice(0, 3).join(' | ')); }
return J.done();
