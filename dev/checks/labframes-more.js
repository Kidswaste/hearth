// Lab footage, part 2 (round 8, labframes): the footage layer templates (each compiles, draws, and "Footage" shows
// the exact frame the timeline is on), the frame clock without ffmpeg (measured from the decoder), the frames menu
// (▦ chip, right-click the time), T, the filmstrip, cues and cuts at shots, the part tools (in / out, roll, repeat,
// order, speed and holds as the sketch plays them), EDL, storyboard, /match-pacing seconds, a reference's motion on a
// slider, board clips as references, the References panel button, frames in screenshots / contact sheets.
//   node dev/make-lab-footage.js /tmp/labframes-media
//   node dev/smoke.js --check-timeout 600000 --lib dev/checks/journey-lib.js --lib dev/checks/labframes-lib.js --script dev/checks/labframes-more.js --shot /tmp/labframes-more.png
const { step, shot } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp/labframes-media';
const { wait, until, press, shown, sbx } = LF;
const M = LF.MEDIA;
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const call = (tool, args) => HubBridge.call(tool, args);
const d = () => ThreeLab.director;

// ---------- 1. the footage templates ----------
await LF.setup(`${M}/frames_silent_24.mp4`);
await say('/footage go f40');
const ids = ThreeLayers.TEMPLATES.filter((t) => t.cat === 'Footage').map((t) => t.id);
step('21 footage layer templates in the Layers picker (category Footage)', ids.length === 21, ids);
const bad = [];
const litOf = (id) => sbx(`const s = __scenes[${JSON.stringify(`T ${id}`)}]; if (!s) return { missing: true }; const cv = s.renderer.domElement; const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 64; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0, 64, 64); const p = g.getImageData(0, 0, 64, 64).data; let n = 0; for (let i = 3; i < p.length; i += 4) if (p[i] > 8) n++; return { lit: n }`);
const retried = [];
async function tryTemplate(id) {
  const r = await call('three_add_layer', { template: id, name: `T ${id}`, wait: 2 });
  let px = null;
  for (let k = 0; k < 10 && !(px?.lit > 50 || (id === 'footage-cut-flash' && k > 1)); k++) { await wait(700); px = await litOf(id); }
  const errs = (d().report().errors || []).filter((e) => String(e.layer || e.text || '').includes(id) || /shader|GLSL|WebGL/i.test(JSON.stringify(e)));
  const ok = r.ok && !px?.missing && !errs.length && (id === 'footage-cut-flash' || (px?.lit || 0) > 50);
  const diag = ok ? null : await sbx(`const s = __scenes[${JSON.stringify(`T ${id}`)}]; const gl = s?.renderer.getContext(); return { lost: gl?.isContextLost(), err: gl?.getError(), frames: s?.renderer.info.render.frame, mem: s?.renderer.info.memory, progs: s?.renderer.info.programs?.length, video: [media.video?.readyState, media.frame, media.texture()?.version], layers: Object.keys(__scenes).length, canvases: document.querySelectorAll('canvas').length }`);
  if (!ok) d().report().console?.slice(-4).forEach((l) => console.log('[diag console]', JSON.stringify(l).slice(0, 300)));
  if (id === 'footage-fill' && ok) step('the Footage template layer is up', true);
  await call('three_do', { cmd: 'remove_layer', layer: `T ${id}` });
  await wait(300);
  return { ok, id, err: r.error, px, errs: errs.slice(0, 2), diag: ok ? undefined : diag };
}
for (const [k, id] of ids.entries()) {
  if (k && k % 4 === 0) await LF.fresh(); // a clean stack every few templates (each layer is its own WebGL context)
  let res = await tryTemplate(id);
  // the software renderer here sometimes stops drawing new contexts late in a long run: once more in a clean stack
  if (!res.ok) { await LF.fresh(); retried.push(id); res = await tryTemplate(id); }
  if (!res.ok) bad.push(res);
}
step('every footage template compiles and draws (no shader / console errors)', !bad.length, { bad, retriedInACleanStack: retried });
// the Footage template set to stretch shows the exact frame: decode its picture at f40, step, decode again
await LF.fresh(); await say('/footage go f40');
const dec = (name) => sbx(`const cv = __scenes[${JSON.stringify(name)}].renderer.domElement; const W = 240; const Hh = Math.max(8, Math.round(cv.height / cv.width * W)); const c2 = document.createElement('canvas'); c2.width = W; c2.height = Hh; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0, W, Hh); const px = g.getImageData(0, 0, W, Hh).data; const y = Math.round(Hh * 0.05); let n = 0; let ok = 0; for (let k = 0; k < 12; k++) { const x = Math.round(W * (k + 0.5) / 12); const i = (y * W + x) * 4; const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; if (l > 150) { n |= 1 << k; ok++; } else if (l < 70) ok++; } return { pixels: ok === 12 ? n : null, frame: media.frame }`);
await call('three_add_layer', { template: 'footage-fill', name: 'Exact', settings: {}, wait: 2 });
await until(async () => (await sbx('return Boolean(__scenes.Exact)')) === true, 8000);
await call('three_sliders', { layer: 'Exact', set: { fit: 'stretch' } });
const goMsg = await say('/footage go f40');
await until(async () => (await dec('Exact'))?.pixels === 40, 8000);
let e1 = await dec('Exact');
await press('ArrowRight', { repeat: 7, gap: 40 }); await wait(800);
let e2 = await dec('Exact');
step('a Footage layer shows the exact frame: f40, then → ×7 = f47 (decoded from its own pixels)', e1.pixels === 40 && e1.frame === 40 && e2.pixels === 47 && e2.frame === 47, { e1, e2, goMsg, st: ThreeFrames.status() });
await call('three_do', { cmd: 'remove_layer', layer: 'Exact' });

// ---------- 2. the frames menu, T, the filmstrip ----------
const bar = document.querySelector('.media-bar');
const chip = bar.querySelector('.mb-framechip');
chip.click(); await wait(400);
const rows = [...document.querySelectorAll('#menu button')].map((b) => b.firstChild?.textContent || b.textContent);
step('▦ opens the frames menu: go to, step, cut here, cues, read, editor, time…', ['Go to a frame…', 'Step', 'Cut here', 'Cues', 'Read the footage', 'Editor', 'Time shows'].every((x) => rows.includes(x)), rows);
document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); hideMenu?.(); await wait(200);
const tEl = bar.querySelector('.mb-time');
tEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 400, clientY: 700 })); await wait(300);
step('right-click the time box: the same menu', [...document.querySelectorAll('#menu button')].some((b) => /Go to a frame/.test(b.textContent)));
hideMenu?.();
await press('t'); await wait(200);
const t1 = tEl.textContent; await press('t'); await wait(200); const t2 = tEl.textContent; await press('t'); await wait(200); const t3 = tEl.textContent;
step('T cycles the time box: frames → seconds → timecode', /^f\d+ \/ \d+$/.test(t1) && /^\d:\d\d\.\d{3} · f\d+$/.test(t2) && /^\d\d:\d\d:\d\d:\d\d · f\d+$/.test(t3), [t1, t2, t3]);
await until(() => ThreeFrames._F.film?.length > 4, 8000);
step('the filmstrip: pictures of the footage under the timeline (in memory)', ThreeFrames._F.film?.length >= 6, ThreeFrames._F.film?.length);
d().media.zoomTo(1, 2); await until(() => ThreeFrames._F.exactFilm.size >= 20, 9000);
step('zoomed in close: every frame gets its own picture', ThreeFrames._F.exactFilm.size >= 20, ThreeFrames._F.exactFilm.size);
await shot('zoomed-frames');
d().media.zoomTo(null);

// ---------- 3. without ffmpeg: the clock measured from the decoder ----------
FrameRead._setFfmpeg(false);
await d().media.load(`${M}/frames_b_30.mp4`);
await until(() => ThreeFrames.clock && ThreeFrames.clock.source !== 'guess', 15000); await wait(1200);
const cl = ThreeFrames.clock;
await say('/footage go f33'); let s = await shown({ settle: 900 });
step('no ffmpeg: fps measured from playback (30), stepping still exact (f33)', cl.fps === 30 && /measured/.test(cl.source) && s.lab === 33 && s.sketch === 33 && s.pixels === 33, { cl: { fps: cl.fps, source: cl.source }, s });
FrameRead._setFfmpeg(true);

// ---------- 4. shots: cues and cuts at scene changes ----------
await d().media.load(`${M}/ref_cuts.mp4`);
await until(() => ThreeFrames.clock?.source === 'ffprobe', 10000); await wait(800);
const cs = await say('/footage-scenes');
const shots = d().media.cues.filter((c) => /^Shot /.test(c.name)).map((c) => Math.round(c.time * 30));
step('/footage-scenes: a cue on the first frame of every shot (0, 30, 45, 90, 105)', JSON.stringify(shots) === JSON.stringify([0, 30, 45, 90, 105]), { cs, shots });
await say('/cut-scenes');
step('/cut-scenes: the footage cut at every shot (5 parts)', ThreeFrames.parts?.length === 5, ThreeFrames.describe());
await say('/cut-clear');

// ---------- 5. part tools: in / out, roll, repeat, order, mute, holds and speed as the sketch plays them ----------
await d().media.load(`${M}/frames_a_30.mp4`);
await until(() => ThreeFrames.clock?.fps === 30, 10000); await wait(800);
await say('/footage go f60'); await say('/footage cut');
await say('/footage go f70'); await say('/footage in');
step('/footage in: the part starts on this frame (f70)', Math.abs((ThreeFrames.parts?.[1]?.a ?? -9) - 70 / 30) < 1e-6, ThreeFrames.describe());
await say('/footage go f50'); await say('/footage out');
step('/footage out: the first part ends on this frame (f50)', Math.abs((ThreeFrames.parts?.[0]?.b ?? -9) - 50 / 30) < 1e-6, ThreeFrames.describe());
await say('/footage go f49'); await press(',', { alt: true }); await wait(200);
step('Alt+, moves the nearest cut one frame earlier', Math.abs((ThreeFrames.parts?.[0]?.b ?? -9) - 49 / 30) < 1e-6, ThreeFrames.describe());
await say('/footage go f10'); await say('/footage repeat');
step('/footage repeat: the part plays twice', ThreeFrames.parts?.length === 3 && ThreeFrames.parts?.[0].a === ThreeFrames.parts?.[1].a, ThreeFrames.describe());
await say('/footage go f100'); await say('/footage first');
step('/footage first: that part plays first', Math.abs((ThreeFrames.parts?.[0]?.a ?? -9) - 69 / 30) < 1e-6, ThreeFrames.describe());
await say('/footage mute off');
step('/footage mute: the part\'s sound off (the sketch hears silence there)', ThreeFrames.parts?.[0].mute === true && /sound off/.test(ThreeFrames.describe()[0]), ThreeFrames.describe());
await say('/cut-clear');
// speed and a hold, read by the sketch while it plays
await say('/footage go f30'); await say('/footage cut'); await say('/footage go f40'); await say('/footage speed 0.5');
await say('/footage go f20'); await say('/footage hold 1');
const sp = await sbx('return media.parts');
step('the sketch gets the parts: a 1 s hold of f20 and a part at 0.5×', Array.isArray(sp) && sp.some((p) => p.hold === 1) && sp.some((p) => p.speed === 0.5), sp);
await say('/footage go f15');
await sbx('__lf.seen = []; __lf.rates = []; media.onFrame(() => __lf.rates.push(media.video.playbackRate)); return 1');
d().media.toggle(true);
await until(() => d().media.playing, 4000);
await wait(3200);
d().media.toggle(false); await wait(400);
const seen = await sbx('return { seen: __lf.seen.slice(), rates: [...new Set(__lf.rates)] }');
const run20 = (seen?.seen || []).filter((n) => n === 20).length;
step('playing: f20 holds (presented once, then still), the slow part plays at 0.5×', (seen?.rates || []).includes(0.5) && run20 >= 1 && (seen?.seen || []).some((n) => n > 31), seen);
await say('/cut-clear');

// ---------- 5b. the mouse on cut lines, double-click a removed part, the waveform's menu, zoom presets ----------
await say('/cut-clear');
await say('/footage go f60'); await say('/footage cut');
d().media.zoomTo(1.5, 2.5); await wait(600);
{
  const tl = bar.querySelector('.mb-timeline'); const b = tl.getBoundingClientRect(); const w = b.width - 122;
  const xOf = (t) => b.left + ((t - 1.5) / 1) * w; const y = b.top + 40;
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: xOf(2), y, button: 'none' } }); await wait(150);
  const cursor = tl.style.cursor;
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: xOf(2), y, button: 'left', clickCount: 1 } });
  for (let i = 1; i <= 6; i++) { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: xOf(2 + i * (5 / 30) / 6), y, button: 'left', buttons: 1 } }); await wait(30); }
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: xOf(2 + 5 / 30), y, button: 'left', clickCount: 1 } }); await wait(400);
  step('drag a cut line: the cut moves 5 frames (both parts follow), col-resize cursor over it', cursor === 'col-resize' && Math.abs((ThreeFrames.parts?.[0]?.b ?? 0) - 65 / 30) < 1e-6 && Math.abs((ThreeFrames.parts?.[1]?.a ?? 0) - 65 / 30) < 1e-6, { cursor, parts: ThreeFrames.describe() });
  await say('/footage go f70'); await press('Delete');
  const n0 = ThreeFrames.parts?.length;
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: xOf(2.4), y, button: 'left', clickCount: 1 } });
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: xOf(2.4), y, button: 'left', clickCount: 1 } });
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: xOf(2.4), y, button: 'left', clickCount: 2 } });
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: xOf(2.4), y, button: 'left', clickCount: 2 } }); await wait(400);
  step('double-click a removed part: it plays again', n0 === 1 && ThreeFrames.parts?.length === 2, { n0, parts: ThreeFrames.describe() });
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: xOf(1.8), y, button: 'right', clickCount: 1 } });
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: xOf(1.8), y, button: 'right', clickCount: 1 } }); await wait(300);
  const mrows = [...document.querySelectorAll('.mb-menu b')].map((x) => x.textContent);
  step('right-click the waveform: the footage moves at that frame come first', /^Cut at f54$/.test(mrows[0] || '') && mrows.includes('Remove this part') && mrows.includes('Cue at f54'), mrows.slice(0, 5));
  document.querySelector('.mb-menu')?.remove();
}
await say('/footage go f30');
await say('/footage zoom second'); const z1 = d().media.view;
await say('/footage zoom part'); const z2 = d().media.view;
await say('/footage zoom all'); const z3 = d().media.view;
step('zoom presets: one second of frames, the part, the whole footage', z1 && Math.abs((z1.end - z1.start) - 1) < 0.01 && z2 && z2.end > 2 && !z3, { z1, z2, z3 });
const palMsg = await say('/footage palette');
step('/footage palette: the sketch palette from this exact frame', /Palette: (#[0-9a-f]{6} ?){2,}/.test(palMsg) && (d().refs.palette() || []).length >= 2, { palMsg, now: d().refs.palette() });
await Board.ready();
const nBoard = Board.items().length;
await say('/footage board');
step('/footage board: this frame pinned to the mood board', Board.items().length === nBoard + 1 && Board.items().at(-1).type === 'image', Board.items().at(-1)?.title);
await say('/cut-clear');

// ---------- 5c. motion design on the cut ----------
await say('/footage go f45'); await say('/footage cut'); await say('/footage go f90'); await say('/footage cut');
const ky = await say('/footage key opacity 1 0.2');
const kj = JSON.stringify(d().timeline().layers);
step('/footage key: keyframes on every part\'s first frame, alternating (0s=1, 1.5s=0.2, 3s=1)', /0s=1 \(hold\)/.test(kj) && /1\.5s=0\.2 \(hold\)/.test(kj) && /3s=1 \(hold\)/.test(kj), { ky, kj: kj.slice(0, 240) });
await say('/footage go f60');
const lp = await say('/footage layer-part');
step('/footage layer-part: the selected layer plays only in this part (1.5 s → 3 s)', /plays only/.test(lp) && /1\.5/.test(JSON.stringify(d().timeline().layers)), { lp, layers: JSON.stringify(d().timeline().layers).slice(0, 200) });
await d().media.editMarkers({ add: { hit: [0.5, 2.5] }, snap: false });
await say('/cut-clear');
const cm = await say('/cut-markers hit');
step('/cut-markers hit: the footage cut at every hit marker', ThreeFrames.parts?.length >= 3, { cm, parts: ThreeFrames.describe() });
const lk = await say('/footage looks');
step('/footage looks: each part its own look (a cue with a look per cut)', d().media.cues.filter((c) => c.looks?.length).length >= 3, { lk, cues: d().media.cues.length });
await say('/cut-clear');

// ---------- 6. EDL, storyboard, timecode copy ----------
await say('/footage go f30'); await say('/footage cut'); await say('/footage go f60'); await say('/footage cut');
const edlMsg = await say('/footage edl');
const edlPath = `${M}/frames_a_30 lab cut.edl`;
const edl = await window.hub.fs.read(edlPath).catch(() => '');
step('/footage edl: a CMX 3600 EDL next to the video', /FCM: NON-DROP FRAME/.test(edl) && (edl.match(/^\d{3} /gm) || []).length === 3, { edlMsg, lines: edl.split('\n').length });
const sb = await call('three_do', { cmd: 'footage', action: 'storyboard' });
step('storyboard: the sketch at every part on one sheet (for the director too)', sb.ok && sb.value?.frames?.length === 3 && sb.images?.length === 1, sb.value || sb.error);
// the cut rendered by the editor's ffmpeg: 3 parts of frames_a_30 with f30–f59 removed → 150 frames, read back
await say('/footage go f40'); await say('/cut-delete'); await wait(300);
const job = await ThreeFrames.renderCut().catch((e) => ({ error: e.message }));
const done = job?.done ? await job.done : null;
const out = job?.output;
const probe = out ? await window.hub.capture.frames('probe', out).catch(() => null) : null;
step('render the cut: the editor renders exactly what the sketch plays (150 frames)', done?.code === 0 && probe?.ok && Math.abs(probe.value.frames - 150) <= 1, { out, frames: probe?.value?.frames, err: job?.error });
activate('tool:three'); await wait(800);
const cp = await say('/footage copy');
step('/footage copy: this frame\'s timecode', /00:00:\d\d:\d\d \(f\d+\) copied/.test(cp), cp);
const mi = await call('three_do', { cmd: 'media_info' });
step('three_do media_info: one footage line (fps, frame, timecode, the cut)', mi.ok && mi.value.footage?.fps === 30 && mi.value.footage.cut?.length === 2, mi.value?.footage);
const cs2 = await call('three_contact_sheet', { frames: [10, 40, 70] });
step('three_contact_sheet with frames [10, 40, 70]', cs2.ok && cs2.value?.frames?.length === 3 && Math.abs(cs2.value.frames[1].time - 1.35) < 0.02, cs2.value || cs2.error);
await say('/cut-clear');

// ---------- 6b. palette actions, the keys sheet, recording the sketch over the cut ----------
const pal = (Tools.get('three').commands || []).filter((c) => /^Lab footage:/.test(c.label));
step('Ctrl+K: 10 footage actions', pal.length === 10, pal.map((c) => c.label));
(await ThreeLab.cmd()).keys(); await wait(300);
const sheetRows = [...document.querySelectorAll('dialog.lab-keys span')].map((x) => x.textContent);
step('the Lab keys sheet (?) lists the footage keys first', /^Footage:/.test(sheetRows[0] || ''), sheetRows.slice(0, 3));
document.querySelector('dialog.lab-keys')?.close();
await say('/cut-keep f0 f24');
const before = ((await window.hub.fs.list(window.SMOKE_SAVES).catch(() => [])) || []).length;
ThreeFrames.go(0); await wait(300);
d().media.record('track');
await until(() => d().media.recording, 4000);
await until(() => !d().media.recording, 20000);
await until(async () => ((await window.hub.fs.list(window.SMOKE_SAVES).catch(() => [])) || []).length > before, 8000);
const saved = ((await window.hub.fs.list(window.SMOKE_SAVES).catch(() => [])) || []).filter((f) => /\.(mp4|webm)$/.test(f.name || f));
step('record the sketch over the cut: it plays the part once and saves a video', saved.length > 0 && !d().media.recording, saved.map((f) => f.name || f));
await say('/cut-clear');

// ---------- 7. references: seconds pacing, motion on a slider, board clips, the References panel ----------
await d().refs.add(`${M}/ref_cuts.mp4`, 'refCuts');
await d().media.load(`${M}/frames_silent_24.mp4`);
await until(() => ThreeFrames.clock?.fps === 24, 10000); await wait(800);
const pc = await say('/pace-check refCuts');
step('/pace-check: the cut against the reference\'s pacing', /a shot/.test(pc) && /refCuts/.test(pc), pc);
const hitsBefore = d().media.timeline().markers.hit.length;
const mph = await say('/match-pacing refCuts hits');
step('/match-pacing … hits: Hit markers at the reference\'s rhythm (the sketch\'s audio.hit fires on them)', d().media.timeline().markers.hit.length === hitsBefore + 4, { mph, hits: d().media.timeline().markers.hit });
const mps = await say('/match-pacing refCuts seconds');
const pace = d().media.cues.filter((c) => /^Pace /.test(c.name)).map((c) => Math.round(c.time * 1000) / 1000);
step('/match-pacing … seconds: the reference\'s own shot lengths (1, 1.5, 3, 3.5 s)', JSON.stringify(pace) === JSON.stringify([1, 1.5, 3, 3.5]), { pace, mps, loop: d().media.loop });
await call('three_add_layer', { template: 'footage-fill', name: 'Paced', wait: 2 });
const rm = await say('/ref-motion refCuts zoom');
step('/ref-motion: the reference\'s motion as keyframes on a slider', /keys from/.test(rm) && /zoom|Zoom/.test(JSON.stringify(d().timeline().layers)), rm);
let boardOk = false;
try {
  await Board.ready();
  Board.add('video', { src: `${M}/frames_b_30.mp4`, name: 'boardClip', w: 320, h: 180 });
  const list = await ThreeFrames.refVideos();
  boardOk = list.some((r) => r.from === 'board' && r.name === 'boardClip');
} catch (err) { boardOk = String(err.message); }
step('board clips are reference clips too (for pacing, sheets)', boardOk === true, boardOk);
activate('tool:three'); await wait(300);
(await ThreeLab.cmd()).refs(); await wait(600);
const readBtn = [...document.querySelectorAll('.refs-card button')].find((b) => /Read/.test(b.textContent));
step('References panel: a video reference has 🎞 Read ▾', Boolean(readBtn));
readBtn?.click(); await wait(400);
step('… which opens the reading / pacing menu', [...document.querySelectorAll('#menu button')].some((b) => /Match this pacing/.test(b.textContent)));
hideMenu?.();
await shot('final-more');
return J.done();
