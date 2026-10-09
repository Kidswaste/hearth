// Journey 8 (round 8): the intro video finished in the editor, frame by frame, with real mouse and keyboard events:
// Video Review from the rail → a clip → E (the editor) → 9:16 through the command bar (Ctrl+;) → exact frames
// (→, Shift+→, a typed timecode, J K L) read back from the pixels → S split, a title, a dissolve onto a second clip →
// Alt (lane switches), right-click a clip (submenus), ? and Ctrl+/ (keys) → switch to the board mid-playback and
// back, undo on the board vs undo in the editor (keys and /undo) → small windows → render → ffprobe + frames read
// back from the file → reload: the edit is kept.
//   sh dev/run-checks.sh journey-editor
//   (or: node dev/make-editor-videos.js /tmp/hearth-editor-videos; node dev/smoke.js --check-timeout 900000 --script dev/checks/journey-editor.js)
const { wait, until, step, click, key, type, shot, visible, hitOk, mouse } = J;
J.shotDir = window.JOURNEY_SHOTS || localStorage.getItem('journey.shots') || '/tmp';
localStorage.setItem('journey.shots', J.shotDir);
const SRC = window.EDITOR_VIDS || '/tmp/hearth-editor-videos';
const VIDS = `${window.SMOKE_SAVES}/intro renders`; // a folder with a space
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of ['frames_a_30.mp4', 'frames_b_30.mp4', 'music.wav']) await window.hub.fs.copy(`${SRC}/${f}`, `${VIDS}/${f}`);
const claude = H.claudeAgent();
const R = () => H.surfaces.get('tool:ae')?.el;
const focusEd = () => (R().querySelector('.vr')?.parentElement || R()).focus({ preventScroll: true }); // Video Review listens on its mount
const menuRows = () => [...document.querySelectorAll('#menu button, #menu-fly button, .menu-flyout button')].filter(visible);
const row = (re) => menuRows().find((b) => re.test(b.textContent));
// the frame number burned into the picture on screen (the compositor when the edit is rich, else the decoder)
function codeOnScreen() {
  const root = R(); const comp = root.querySelector('.vr-pcomp.on');
  const src = comp || [...root.querySelectorAll('video.vr-p')].find((v) => v.classList.contains('on')) || root.querySelector('video');
  if (!src) return null;
  const w = comp ? comp.width : src.videoWidth; const h = comp ? comp.height : src.videoHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h);
  return decodeFrameCode(g.getImageData(0, 0, w, h).data, w, h);
}
async function bar(line) { // the command bar over the tool (Ctrl+;), the way the owner drives a tool by words
  const inp = () => document.querySelector('.cmdbar-input');
  if (!visible(inp())) { await key(';', { ctrl: true }); await until(() => visible(inp()), 3000); }
  inp().focus(); inp().select?.(); await type(line); await key('Enter'); await wait(800);
  const text = document.querySelector('.cmdbar-out')?.textContent || '';
  for (let i = 0; i < 2 && visible(inp()); i += 1) { await key('Escape'); await wait(150); } // clear, then close (the keys go back to the editor)
  return text;
}
try {
// 1. Video Review from the rail, the folder by command, a click on the clip
activate(claude.id); await wait(300);
await J.command(claude.id, `/video-folders add ${VIDS}`, 1500);
const rail = document.querySelector('#rail .agent-btn[data-id="tool:ae"]');
if (rail) await click(rail); else activate('tool:ae');
await Review.ensureMounted(); await Review.load?.(true);
await until(() => Review.videos.some((v) => /frames_a_30/.test(v.path)), 15000);
step('Video Review lists the clips (folder with a space)', Review.videos.some((v) => /frames_a_30/.test(v.path)), Review.videos.map((v) => v.path.split('/').pop()));
if (![...R().querySelectorAll('.vr-card')].some(visible)) { const lib = [...R().querySelectorAll('button')].find((b) => b.textContent.trim() === '☰' && visible(b)); if (lib) await click(lib); await wait(300); }
const card = [...R().querySelectorAll('.vr-card')].find((n) => visible(n) && /frames_a_30/.test(n.textContent));
if (card) await click(card); else await Review.open(`${VIDS}/frames_a_30.mp4`);
await until(() => /frames_a_30/.test(Review.current?.path || ''), 8000); await Review.waitReady?.(); await wait(500);
step('the clip opens', /frames_a_30/.test(Review.current?.path || ''));

// 2. E: the editor; 9:16 through the command bar
focusEd();
await key('e'); await until(() => VideoCut.active, 15000); await wait(400);
step('E opens the editor', VideoCut.active);
const fmtOut = await bar('/edit-format 9:16 30');
step('Ctrl+; /edit-format 9:16 30 (the command bar over the editor)', /9:16/.test(R().querySelector('.vr-cut-fmt')?.textContent || '') && VideoCut.fps === 30, { chip: R().querySelector('.vr-cut-fmt')?.textContent, out: fmtOut.slice(0, 80) });


// 3. exact frames: → ×30, Shift+→ ×2, a typed timecode, J K L
focusEd();
await key('Home'); await wait(200);
for (let i = 0; i < 30; i += 1) await key('ArrowRight');
await wait(500);
let fi = await VideoCut.frameInfo();
step('→ ×30 = frame 30 (counter and the pixels on screen)', fi.frame === 30 && codeOnScreen() === 30, { frame: fi.frame, code: codeOnScreen() });
await key('ArrowRight', { shift: true }); await key('ArrowRight', { shift: true }); await wait(500);
fi = await VideoCut.frameInfo();
step('Shift+→ ×2 = frame 50', fi.frame === 50 && codeOnScreen() === 50, { frame: fi.frame, code: codeOnScreen() });
const tbox = R().querySelector('.vr-time');
await click(tbox); await key('a', { ctrl: true }); await type('00:00:02:15'); await key('Enter'); await wait(600);
step('typed timecode 00:00:02:15 = frame 75', (await VideoCut.frameInfo()).frame === 75 && codeOnScreen() === 75, codeOnScreen());
await key('l'); await wait(800); await key('k'); await wait(500);
fi = await VideoCut.frameInfo();
step('L plays, K stops on a whole frame (picture = counter)', fi.frame > 75 && codeOnScreen() === fi.frame, { frame: fi.frame, code: codeOnScreen() });

// 4. cut, title, a second clip with a dissolve
VideoCut.goto(1.5); await wait(300); focusEd();
await key('s'); await wait(300);
step('S splits at the playhead', VideoCut.edit.clips.length === 2, VideoCut.edit.clips.length);
await VideoCut.addClip(`${VIDS}/frames_b_30.mp4`); await wait(600);
const tOut = await bar('/add-title Hearth | your agents, one window');

step('/add-title: a title over the picture', (VideoCut.edit.tracks || []).some((t) => t.items.some((i) => /Hearth/.test(i.text || i.words || ''))), tOut.slice(0, 100));
const trOut = await bar('/transition dissolve 0.5 all');

step('/transition dissolve 0.5 all', VideoCut.edit.clips.slice(1).every((c) => c.trans?.type === 'dissolve'), { clips: VideoCut.edit.clips.map((c) => c.trans?.type || '-'), out: trOut.slice(0, 80) });
await shot('edit');

// 5. Alt: lane switches; right-click a clip: its menu with submenus; ? and Ctrl+/
focusEd();
await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 } });
await wait(300);
const altShown = R().querySelector('.vr-cut')?.classList.contains('alt') || R().querySelector('.vr-cut-wrap, .vr-cut-track')?.classList.contains('alt') || VideoCut._test?.alt?.() || document.documentElement.classList.contains('reveal-alt') || /alt/.test(R().querySelector('.vr-cut-track')?.className || '');
await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 0 } });
step('hold Alt: the lanes show their switches', Boolean(altShown));
const cv = R().querySelector('.vr-cut-cv');
const lanes = VideoCut._test?.lanes?.() || [];
const main = lanes.find((l) => l.kind === 'main');
if (cv && main) {
  const r = cv.getBoundingClientRect(); const x = r.left + VideoCut._test.xOf(0.5); const y = r.top + main.y + main.h / 2;
  await mouse('mouseMoved', x, y, { button: 'none' }); await mouse('mousePressed', x, y, { button: 'right' }); await mouse('mouseReleased', x, y, { button: 'right' }); await wait(400);
}
step('right-click a clip: its menu with › submenus', menuRows().length >= 5 && menuRows().some((b) => /›/.test(b.textContent)), menuRows().map((b) => b.textContent.trim()).slice(0, 8));
hideMenu(); await wait(150);

focusEd();
await key('?', { shift: true }); await wait(500);
step('? lists the editor keys', /Split at the playhead|Razor/.test(document.querySelector('dialog[open]')?.textContent || ''));
document.querySelectorAll('dialog[open]').forEach((d) => d.close()); await wait(200);
focusEd();
await key('/', { ctrl: true }); await wait(500);
step('Ctrl+/ in the editor: the keys sheet starts with Editor', /^Editor/.test(document.querySelector('.keys-sheet .ks-group h4')?.textContent || ''), document.querySelector('.keys-sheet .ks-group h4')?.textContent);
KeysUI.close(); await wait(200);

// 6. switch to the board mid-playback; undo on the board doesn't touch the edit (and back)
focusEd();
await key(' '); await wait(500);
const wasPlaying = VideoCut.playing;
const editBefore = JSON.stringify(VideoCut.edit);
activate('tool:board'); await until(() => Board.isMounted?.() && Board.visible?.(), 6000); await wait(500);
step('switching to the board stops the edit playing', wasPlaying && !VideoCut.playing, { wasPlaying, playing: VideoCut.playing });
Board.addNote('edit idea: hold on the logo'); await wait(300);
const n1 = Board.items().length;
Board._.S.ui.root.focus(); await key('z', { ctrl: true }); await wait(300);
step('Ctrl+Z on the board undoes the board, not the edit', Board.items().length === n1 - 1 && JSON.stringify(VideoCut.edit) === editBefore, { board: Board.items().length, editSame: JSON.stringify(VideoCut.edit) === editBefore });
activate('tool:ae'); await wait(800);
step('back in Video Review: still editing, same edit', VideoCut.active && JSON.stringify(VideoCut.edit) === editBefore);
const before3 = VideoCut.edit.clips.length;
focusEd(); VideoCut.goto(0.5); await wait(200); await key('s'); await wait(300);
const split3 = VideoCut.edit.clips.length === before3 + 1;
const undoOut = await bar('/undo');

step('/undo over the editor undoes the edit (not the last chat action)', split3 && VideoCut.edit.clips.length === before3, { split3, now: VideoCut.edit.clips.length, out: undoOut.slice(0, 60) });
const redoOut = await bar('/redo');

step('/redo redoes it', VideoCut.edit.clips.length === before3 + 1, redoOut.slice(0, 60));
focusEd(); await key('z', { ctrl: true }); await wait(300);
step('Ctrl+Z in the editor undoes it again', VideoCut.edit.clips.length === before3);

// 7. small windows: the transport, ＋ and the format chip stay on screen
const sizes = [];
for (const [w, h] of [[1024, 640], [800, 560]]) {
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: w, height: h, deviceScaleFactor: 1, mobile: false } });
  await wait(800);
  const add = R().querySelector('.vr-cut-add'); const chip = R().querySelector('.vr-cut-fmt'); const time = R().querySelector('.vr-time');
  const inside = (n) => { const r = n?.getBoundingClientRect(); return Boolean(r && r.width && r.right <= w + 1 && r.bottom <= h + 1 && r.left >= 0); };
  sizes.push({ w, h, add: inside(add) && hitOk(add), chip: inside(chip), time: inside(time), scrollX: document.scrollingElement.scrollWidth <= w + 1 });
}
await shot('editor-small');
await smoke({ cdp: 'Emulation.clearDeviceMetricsOverride', params: {} }); await wait(600);
step('small windows: ＋, the format chip and the time box stay on screen', sizes.every((s) => s.add && s.chip && s.time && s.scrollX), sizes);

// 8. render, ffprobe, frames read back from the file
const total = CutData.total(VideoCut.edit);
const job = await VideoCut.exportCut({}).catch((e) => ({ error: e.message }));
const ev = job?.done ? await Promise.race([job.done, wait(240000).then(() => ({ code: 'timeout' }))]) : null;
step('render finished (ffmpeg)', ev?.code === 0, { out: job?.output || job?.error, ev });
const pr = ev?.code === 0 ? await window.hub.video.probe(job.output, {}) : null;
const p2 = ev?.code === 0 ? (await window.hub.capture.frames('probe', job.output)).value : null;
step('ffprobe: 1080×1920, 30 fps, as long as the edit', p2 && p2.w === 1080 && p2.h === 1920 && Math.abs(p2.fps - 30) < 0.01 && Math.abs(p2.duration - total) < 0.2, { w: p2?.w, h: p2?.h, fps: p2?.fps, dur: p2?.duration, total, probe: pr && Object.keys(pr).slice(0, 6) });
step('the render lands next to its footage (exports/), named after the edit', job?.output?.startsWith(VIDS), job?.output);
await shot('rendered');
localStorage.setItem('journey.editor', JSON.stringify({ path: VideoCut.path, clips: VideoCut.edit.clips.length, tracks: (VideoCut.edit.tracks || []).length, fmt: R().querySelector('.vr-cut-fmt')?.textContent }));
// a last cut right before the reload (saved on unload, not lost with the pending save)
focusEd(); VideoCut.goto(0.3); await wait(150); await key('s'); await wait(50);
localStorage.setItem('journey.editor.last', String(VideoCut.edit.clips.length));
} catch (e) { step(`stopped: ${e.message}`, false); }
return J.done();
//@@ reload
const { wait, until, step, shot } = J;
J.shotDir = localStorage.getItem('journey.shots') || '/tmp';
const was = JSON.parse(localStorage.getItem('journey.editor') || '{}');
const last = Number(localStorage.getItem('journey.editor.last'));
activate('tool:ae'); await Review.ensureMounted(); await wait(600);
await Review.open(was.path); await Review.waitReady?.(); await wait(500);
await VideoCut.enter(); await until(() => VideoCut.active, 8000); await wait(500);
step('after a reload: the edit is kept, with the cut made just before', VideoCut.edit?.clips.length === last && (VideoCut.edit.tracks || []).length === was.tracks, { clips: VideoCut.edit?.clips.length, last, tracks: (VideoCut.edit?.tracks || []).length });
step('its 9:16 format too', /9:16/.test(H.surfaces.get('tool:ae').el.querySelector('.vr-cut-fmt')?.textContent || ''));
await shot('after-reload');
localStorage.removeItem('journey.editor'); localStorage.removeItem('journey.editor.last');
return J.done();
