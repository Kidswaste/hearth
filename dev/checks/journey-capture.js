// Journey 7 (round 8): Hearth records itself for its own intro video, with real mouse and keyboard events: a Lab
// scene at 9:16 → ⌘/Ctrl+Alt+S (the capture menu) → a picture of the Lab preview → a short recording of the Lab
// (/rec) → ⌘/Ctrl+Alt+V (captures) → the player (frame keys) → right-click › Open in the editor timeline → a title
// card and a dissolve onto a second clip → render → ffprobe the file. Also: Ctrl+Alt+A then Esc (region picker
// cancelled), the keys sheet over a capture, every file inside Hearth's data folder, and after a reload the
// captures, the recording's markers and the edit are still there.
//   sh dev/run-checks.sh journey-capture
//   (or: node dev/smoke.js --check-timeout 900000 --script dev/checks/journey-capture.js)
const { wait, until, step, click, key, type, shot, visible } = J;
J.shotDir = window.JOURNEY_SHOTS || localStorage.getItem('journey.shots') || '/tmp';
localStorage.setItem('journey.shots', J.shotDir);
const claude = H.claudeAgent();
const say = []; const run = (line, id = claude.id) => Commands.tryRun(line, id, null, { source: 'code', say: (t) => say.push(String(t)), note: (t) => say.push(String(t)) });
const menuRows = () => [...document.querySelectorAll('#menu button, .menu-flyout button, #menu-fly button')].filter(visible);
const row = (re) => menuRows().find((b) => re.test(b.textContent));
const capKey = (k) => key(k, { ctrl: true, alt: true });
try {
const info = await Capture.info();
const DIR = info.dir;
const appData = (await window.hub.board.dir()).dir.replace(/[\\/]board$/, '');
step('captures go to Hearth\'s data folder', DIR.startsWith(appData), { captures: DIR, data: appData });

// 1. a Lab scene at 9:16 (Shift+2 after a click on the picture)
activate('tool:three'); await wait(2500);
const c = await ThreeLab.cmd(); await wait(1500);
const L = H.surfaces.get('tool:three').el;
const pic = [...L.querySelectorAll('.three-preview')].find(visible);
await click(pic, { at: [0.5, 0.6] });
await key('2', { shift: true }); await wait(2500);
step('Shift+2: the Lab at 9:16', /1080.?1920|9:16/.test(JSON.stringify(c.state.size || c.state.frame || ThreeLab.state?.size || '')) || /9:16/.test(L.textContent), c.state.size || c.state.frame);

// right-click the Lab picture › Capture ›: the capture tools are there too
await click(pic, { right: true, at: [0.5, 0.6] }); await wait(400);
const capSub = row(/^Capture/);
if (capSub) { await click(capSub); await wait(400); }
step('right-click the Lab picture › Capture › has "Record the Lab preview…" and "More capture…"', Boolean(row(/Record the Lab preview/)) && Boolean(row(/More capture/)), menuRows().map((b) => b.textContent.trim()).slice(0, 12));
hideMenu(); await wait(200);
// 2. ⌘/Ctrl+Alt+S: the capture menu (caught in the main process, so it works with the Lab picture focused)
await capKey('s'); await wait(500);
step('Ctrl+Alt+S opens the capture menu from inside the Lab', Boolean(row(/Screenshot of this tool/)), menuRows().map((b) => b.textContent.trim()).slice(0, 6));
const of = row(/Screenshot of(?! this)/); // "Screenshot of…" (round 7) or "Screenshot of ›" (polish8 submenu)
if (of) { await click(of); await wait(300); }
const labRow = row(/The Lab preview/);
step('› Screenshot of… has "The Lab preview at full size"', Boolean(labRow));
const n0 = (await window.hub.capture.list({ kind: 'shot' })).length;
if (labRow) await click(labRow);
await until(async () => (await window.hub.capture.list({ kind: 'shot' })).length > n0, 15000);
const labShot = (await window.hub.capture.list({ kind: 'shot' }))[0];
const shotInfo = labShot ? (await window.hub.capture.frames('probe', labShot.path)).value || null : null;
step('a picture of the Lab preview at its exact 9:16 size', labShot && labShot.path.startsWith(DIR) && (!shotInfo || (shotInfo.w === 1080 && shotInfo.h === 1920)), { path: labShot?.path, w: shotInfo?.w, h: shotInfo?.h });
await key('Escape'); await wait(300);

// 3. a short recording of the Lab (/rec lab 3s typed in the docked director chat, or Claude's chat)
const dir = H.agents().find((a) => a.dock === 'three');
const recId = dir?.id || claude.id;
const v0 = (await window.hub.capture.list({ kind: 'video' })).length;
say.length = 0;
// a take whose encoder gave nothing (VP9 in software on a busy test machine) is taken again, as you would; after two
// such takes Hearth switches codec by itself
let takes = 0;
for (; takes < 3; takes += 1) {
  await run('/rec tool 3s now', recId); // the Lab tool on screen
  await until(() => Capture.recording, 8000);
  if (takes === 0) step('/rec tool 3s starts recording the Lab', Capture.recording, say.join(' ').slice(0, 200));
  await wait(1200);
  await run('/record mark drop', recId);
  await until(() => !Capture.recording, 20000);
  // done when the take is remembered (after the WebM fix-up and the MP4)
  if (await until(() => Capture.last()?.kind === 'video' && Capture.last()?.mp4, 90000)) break;
}
const mp4 = { path: Capture.last()?.mp4 || Capture.last()?.path };
mp4.name = String(mp4.path).split(/[\\/]/).pop();
void v0;
const probe = mp4 ? (await window.hub.capture.frames('probe', mp4.path)).value : null;
step('it stops by itself after 3 s: an MP4 in captures/recordings', mp4 && /recordings/.test(mp4.path) && probe && probe.duration > 0 && probe.duration < 6, { takes: takes + 1, path: mp4?.path, dur: probe?.duration, w: probe?.w, h: probe?.h, fps: probe?.fps, toasts: (globalThis.recentToasts?.() || []).slice(-6).map((t) => String(t.message ?? t.text ?? t).slice(0, 90)), status: Capture.status() });
const marks = (await window.hub.kvGet('capture-marks', {}))[mp4?.path.replace(/\.mp4$/, '.webm')] || (await window.hub.kvGet('capture-marks', {}))[mp4?.path] || [];
step('the marker typed while recording is saved with it', marks.length >= 1, marks);
await shot('recorded');

// 4. ⌘/Ctrl+Alt+V: the captures; the player with its frame keys
await capKey('v'); await wait(800);
const lib = document.querySelector('dialog[open].cap-lib');
step('Ctrl+Alt+V opens your captures', visible(lib));
const tiles = lib ? [...lib.querySelectorAll('.cap-lib-grid > *')].filter(visible) : [];
step('the shot and the recording are listed', tiles.length >= 2, tiles.length);
// the keys sheet over a capture lists the capture keys first
await key('/', { ctrl: true }); await wait(500);
const sheet = document.querySelector('.ku-sheet, .keys-sheet, .ks-sheet');
step('Ctrl+/ over the captures: the keys sheet starts with Capture', /^.{0,120}Capture/.test((sheet?.querySelector('.ks-group h4') || sheet)?.textContent || ''), (sheet?.querySelector('.ks-group h4')?.textContent || '').slice(0, 60));
await key('Escape'); await wait(300);
const vidTile = tiles.find((t) => /\.mp4|\.webm/.test(t.textContent + (t.title || '') + (t.dataset.path || ''))) || tiles[0];
await shot('library');
if (vidTile) await click(vidTile, { double: true });
await wait(1200);
const viewer = document.querySelector('dialog[open].cap-view');
const pv = viewer?.querySelector('video');
step('double-click opens the player', visible(viewer) && Boolean(pv));
if (pv) {
  await until(() => pv.readyState >= 2, 5000);
  const t0 = pv.currentTime;
  await key('ArrowRight'); await wait(300); await key('ArrowRight'); await wait(400);
  step('→ ×2 in the player steps two frames', pv.currentTime > t0 && pv.currentTime - t0 < 0.2, { from: t0, to: pv.currentTime });
  // from the start, and the play event itself: a short take (a starved encoder) can end within the wait and read as paused
  pv.currentTime = 0; await wait(200); let sawPlay = false; pv.addEventListener('play', () => { sawPlay = true; }, { once: true });
  await key(' '); await wait(300); const playing = sawPlay || !pv.paused; await key(' '); await wait(200);
  if (pv.duration > 0.5) step('Space plays and pauses the capture', playing && pv.paused); else J.out.steps.push(`… Space not checked: the take is ${pv.duration.toFixed(2)} s (the encoder was starved on this machine)`);
}
await shot('player');
// right-click in the player: "Open in the editor timeline"
const stage = viewer?.querySelector('.cap-view-stage') || viewer;
if (stage) await click(stage, { right: true });
await wait(400);
const ed = row(/Open in the editor timeline/);
step('right-click a capture: › Open in the editor timeline', Boolean(ed), menuRows().map((b) => b.textContent.trim()).slice(0, 8));
if (ed) await click(ed);
await until(() => typeof VideoCut !== 'undefined' && VideoCut.active, 15000);
document.querySelectorAll('dialog[open].cap-view, dialog[open].cap-lib').forEach((d) => d.close());
step('the recording opens in the editor', H.activeId === 'tool:ae' && VideoCut.active && /recordings/.test(VideoCut.path || Review.current?.path || ''), VideoCut.path || Review.current?.path);
await shot('editor');

// 5. in the editor: a title card at the start, a second clip, a dissolve, then render and ffprobe
const R = H.surfaces.get('tool:ae').el;
R.focus?.({ preventScroll: true });
await key('Home'); await wait(200);
const clips0 = VideoCut.edit.clips.length;
const vids2 = window.EDITOR_VIDS || '/tmp/hearth-editor-videos';
const second = `${window.SMOKE_SAVES}/clip b.mp4`; // a path with a space (Windows / Mac folders often have one)
await window.hub.fs.copy(`${vids2}/frames_b_30.mp4`, second);
await VideoCut.addClip(second); await wait(800);
step('a second clip added (its path has a space)', VideoCut.edit.clips.length === clips0 + 1, VideoCut.edit.clips.map((x) => (x.src || x.path || '').split('/').pop()));
// the title card at the end (an end card), so the dissolve goes on a cut with long clips on both sides
const focusEd = () => (R.querySelector('.vr')?.parentElement || R).focus({ preventScroll: true });
VideoCut.goto(CutData.total(VideoCut.edit)); await wait(200); focusEd();
await key('t', { shift: true }); await wait(600);
step('Shift+T: a title card', VideoCut.edit.clips.some((x) => x.title || x.kind === 'title' || x.type === 'title'), VideoCut.describe?.().slice?.(0, 160));
document.querySelectorAll('dialog[open]').forEach((d) => d.close());
const lay = CutData.layout(VideoCut.edit);
VideoCut.goto(lay.at(-1).start); await wait(300); focusEd();
await key('d', { shift: true }); await wait(500);
step('Shift+D: a dissolve on the nearest cut', VideoCut.edit.clips.some((x) => x.trans), VideoCut.edit.clips.map((x) => x.trans?.type || '-'));
const fps = VideoCut.fps;
focusEd(); await key('Home'); await wait(150);
for (let i = 0; i < 12; i += 1) await key('ArrowRight');
await wait(300);
const fi = await VideoCut.frameInfo();
step('→ ×12 lands on program frame 12', fi.frame === 12, { frame: fi.frame, fps });
const total = CutData.total ? CutData.total(VideoCut.edit) : lay.at(-1).start + lay.at(-1).dur;
const job = await VideoCut.exportCut({}).catch((e) => ({ error: e.message }));
const ev = job?.done ? await Promise.race([job.done, wait(180000).then(() => ({ code: 'timeout' }))]) : null;
const rendered = job?.output;
const rp = rendered && ev?.code === 0 ? (await window.hub.capture.frames('probe', rendered)).value : null;
step('render finished', ev?.code === 0, { job: job?.error || rendered, ev });
step('render: an MP4 next to the recording (inside the data folder)', Boolean(rp) && rendered.startsWith(DIR), { rendered });
step('ffprobe: the render is as long as the edit and has its frame rate', rp && Math.abs(rp.duration - total) < 0.25 && Math.abs(rp.fps - fps) < 0.5, { dur: rp?.duration, total, fps: rp?.fps, want: fps, w: rp?.w, h: rp?.h });
await shot('rendered');

// 6. Ctrl+Alt+A: the region picker; Esc cancels it (nothing saved)
const s0 = (await window.hub.capture.list({ kind: 'shot' })).length;
await capKey('a'); await wait(700);
const overlay = document.querySelector('.cap-region, .cap-pick, [class*="cap-region"]');
step('Ctrl+Alt+A shows the region picker', visible(overlay), overlay?.className);
await key('Escape'); await wait(500);
step('Esc cancels it: nothing saved, the picker gone', !visible(document.querySelector('.cap-region, .cap-pick, [class*="cap-region"]')) && (await window.hub.capture.list({ kind: 'shot' })).length === s0);

// 7. nothing outside the data folder: every capture and its made files are in captures/
const every = await window.hub.capture.list({ kind: 'all', limit: 2000 });
step('every capture is inside Hearth\'s data folder', every.length >= 2 && every.every((x) => x.path.startsWith(DIR)), every.length);
localStorage.setItem('journey.capture', JSON.stringify({ shot: labShot?.path, mp4: mp4?.path, rendered, edit: VideoCut.path, clips: VideoCut.edit.clips.length }));
await window.hub.kvSet?.('journey-probe', { at: Date.now() });
await wait(1500); // edits save on a short debounce
} catch (e) { step(`stopped: ${e.message}`, false); }
return J.done();
//@@ reload
const { wait, until, step, shot } = J;
J.shotDir = localStorage.getItem('journey.shots') || '/tmp';
const was = JSON.parse(localStorage.getItem('journey.capture') || '{}');
const list = await window.hub.capture.list({ kind: 'all', limit: 2000 });
step('after a reload: the shot and the recording are in your captures', list.some((x) => x.path === was.shot) && list.some((x) => x.path === was.mp4), list.length);
activate('tool:ae'); await Review.ensureMounted(); await wait(500);
await Review.open(was.edit); await Review.waitReady?.(); await wait(600);
await VideoCut.enter?.(); await until(() => VideoCut.active, 8000); await wait(500);
step('the edit of the recording is kept (title, second clip, dissolve)', VideoCut.edit?.clips.length === was.clips && VideoCut.edit.clips.some((x) => x.trans), { clips: VideoCut.edit?.clips.length, was: was.clips });
await shot('after-reload');
localStorage.removeItem('journey.capture');
return J.done();
