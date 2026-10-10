// Seqguard (round 13): timeline editing power in the Lab sequence, behind keys, right-click and /sequence: nudge by
// frame / beat (, . < >), key trims ([ ] { }), per-clip speed (a scene's own clock runs at it, footage gets longer /
// shorter), clip colors, markers (add / name / list / go / rename / delete, Shift+↑ ↓), snapping (Shift+S), select all /
// after the playhead / a range (⌘/Ctrl+A, A), zoom to the selection (Z), the undo history list (⋯ → History,
// /sequence history back n), play around the playhead (Shift+Space), ripple delete and go to a clip by command.
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/seqguard-edit.js
const { step } = J;
const { wait, until, sbx } = SQL;
const Q = ThreeSeq;
const D = ThreeSeqData;
const me = H.claudeAgent().id;
const cmd = async (t) => { const r = await Commands.tryRun(t, me); await wait(250); return r; };
const ids = await SQL.scenes();
ThreeLab.scenes.open(ids.red); await wait(1200);
const b = await SQL.build({ name: 'Edit seq', song: true });
await until(() => Q.active, 5000);
const tl = document.querySelector('.sq-tl');
const focus = () => { tl.focus({ preventScroll: true }); };
const T0 = () => D.timing(Q.edit);
const startOf = (id) => { const f = CutData.find(Q.edit, id); return f.where === 'clip' ? T0()[f.i].start : f.clip.start; };
const clipOf = (id) => CutData.find(Q.edit, id)?.clip;
const F = 1 / Q.fps;

// ---------- nudge ----------
Q.select(b.clips.green); focus();
const g0 = startOf(b.clips.green);
await J.key('.'); await wait(150);
const g1 = startOf(b.clips.green);
await J.key(','); await wait(150);
const g2 = startOf(b.clips.green);
step('. / , nudge the selected clip one frame later / earlier (it slides between its neighbours)', Math.abs(g1 - g0 - F) < 1e-3 && Math.abs(g2 - g0) < 1e-3, { g0, g1, g2 });
const beat = Q.status().grid ? 60 / Q.status().grid.bpm : 10 * F;
await J.key('>', { shift: true }); await wait(150);
const g3 = startOf(b.clips.green);
step('Shift+. nudges by one beat', Math.abs(g3 - g0 - beat) < 2e-3, { g0, g3, beat });
await J.key('<', { shift: true }); await wait(150);
Q.select(b.clips.title); focus();
const t0 = clipOf(b.clips.title).start;
await J.key('.'); await J.key('.'); await wait(150);
step('… titles / overlays nudge too (two frames)', Math.abs(clipOf(b.clips.title).start - t0 - 2 * F) < 1e-3, { t0, t1: clipOf(b.clips.title).start });
step('a run of nudges is one undo step', /Nudge/.test(Q.history().back[0]?.label) && Q.history().back.filter((x) => /Nudge/.test(x.label)).length <= 2, Q.history().back.slice(0, 4));

// ---------- key trims ----------
Q.select(b.clips.blue); focus();
const d0 = clipOf(b.clips.blue).dur;
await J.key(']'); await J.key(']'); await wait(150);
const d1 = clipOf(b.clips.blue).dur;
await J.key('['); await wait(150);
const d2 = clipOf(b.clips.blue).dur;
await J.key('}', { shift: true }); await wait(150);
const in1 = clipOf(b.clips.blue).in || 0;
step('] / [ the clip ends a frame later / earlier; Shift+] its start a frame later (content stays in place)', Math.abs(d1 - d0 - 2 * F) < 1e-3 && Math.abs(d2 - d0 - F) < 1e-3 && Math.abs(in1 - F) < 1e-3, { d0, d1, d2, in1 });

// ---------- per-clip speed ----------
await cmd('/sequence speed 1 2');
step('/sequence speed 1 2: the first scene clip plays at 2×', clipOf(b.clips.red).speed === 2 && /2×/.test(D.clipLabel(clipOf(b.clips.red))), D.clipLabel(clipOf(b.clips.red)));
await wait(500);
const p2 = await SQL.at(30);
const want2 = 60; // frame 30 of the sequence = frame 60 of the scene's own clock at 2×
step('…its own clock runs at 2× in the preview (frame 30 shows the scene\'s frame 60)', p2.code != null && Math.abs(p2.code - want2) <= 2, { code: p2.code, want2 });
await cmd('/sequence speed 1 1');
const p1 = await SQL.at(30);
step('…and back at 1× (frame 30 → 30)', p1.code != null && Math.abs(p1.code - 30) <= 2, p1.code);
const fd0 = CutData.durOf(clipOf(b.clips.foot));
await cmd(`/sequence speed ${Q.edit.clips.findIndex((c) => c.id === b.clips.foot) + 1} 0.5`);
step('footage at 0.5× lasts twice as long', Math.abs(CutData.durOf(clipOf(b.clips.foot)) - fd0 * 2) < 0.02, { fd0, fd1: CutData.durOf(clipOf(b.clips.foot)) });
Q.undo(); await wait(200);

// ---------- colors ----------
await cmd('/sequence color 2 red');
step('/sequence color 2 red: a color label on the clip', clipOf(Q.edit.clips[1].id).swatch === 'red');
await J.click(tl, { right: true, at: [Q._xOf((T0()[0].start + T0()[0].end) / 2) / tl.clientWidth, 0.62] }); await wait(400);
const rows = [...document.querySelectorAll('#menu .menu-item, #menu button, #menu [role=menuitem]')].map((n) => n.textContent.trim());
step('right-click a clip: Speed and Color are in its menu', rows.some((r) => /^Speed/.test(r)) && rows.some((r) => /^Color/.test(r)), rows.slice(0, 30));
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await J.key('Escape'); await wait(200);

// ---------- markers ----------
Q.seek(1); focus(); await J.key('m'); await wait(150);
await cmd('/sequence go 3'); await cmd('/sequence marker Drop');
const listed = await cmd('/sequence markers list');
step('M and /sequence marker <name> add markers; /sequence markers list lists them', (Q.edit.markers || []).length === 2 && Q.markerList().some((m) => m.label === 'Drop'), Q.markerList());
Q.seek(0); await cmd('/sequence markers go Drop');
step('/sequence markers go Drop: the playhead jumps there', Math.abs(Q.time - 3) < 0.02, Q.time);
focus(); await J.key('ArrowUp', { shift: true }); await wait(150);
const prevT = Q.time;
await J.key('ArrowDown', { shift: true }); await wait(150);
step('Shift+↑ / Shift+↓: previous / next marker', Math.abs(prevT - 1) < 0.02 && Math.abs(Q.time - 3) < 0.02, { prevT, next: Q.time });
await cmd('/sequence markers rename 1 Intro');
await cmd('/sequence markers delete Drop');
step('rename and delete markers by number or name', Q.markerList().length === 1 && Q.markerList()[0].label === 'Intro', Q.markerList());

// ---------- snapping, selection, zoom ----------
const snap0 = Q._S.snap;
focus(); await J.key('S', { shift: true }); await wait(100);
const snap1 = Q._S.snap;
await cmd('/sequence snap on');
step('Shift+S toggles snapping; /sequence snap on', snap1 === !snap0 && Q._S.snap === true && store.get('three.seq.snap') === true, { snap0, snap1 });
focus(); await J.key('a', { ctrl: true }); await wait(100);
const all = Q.selection.length;
step('⌘/Ctrl+A selects every clip (not the song)', all === Q.edit.clips.filter((c) => c.kind !== 'gap').length + Q.edit.tracks.flatMap((k) => k.items).filter((x) => !x.song).length, all);
Q.seek(3.6); focus(); await J.key('a'); await wait(100);
const after = Q.selection;
step('A selects from the playhead to the end', after.length >= 2 && !after.includes(b.clips.red), after.length);
Q.select(b.clips.green); focus(); await J.key('z'); await wait(150);
const vr = Q._S.vr;
const gx = T0().find((x) => x.clip.id === b.clips.green);
step('Z zooms to the selection', vr && vr.t0 <= gx.start + 1e-3 && vr.t1 >= gx.end - 1e-3 && vr.t1 - vr.t0 < (gx.end - gx.start) * 1.5, { vr, gx: [gx.start, gx.end] });
await cmd('/sequence select from 0 to 2.5');
step('/sequence select from 0 to 2.5: a range', Q.selection.includes(b.clips.red) && Q.selection.includes(b.clips.green) && !Q.selection.includes(b.clips.blue), Q.selection.length);
await cmd('/sequence zoom fit');

// ---------- history ----------
const hist = await cmd('/sequence history');
const n0 = Q.edit.clips.length; const steps0 = Q.history().back.length;
await cmd('/sequence ripple 2');
const n1 = Q.edit.clips.length;
await cmd('/sequence history back 1');
step('/sequence ripple 2 deletes and closes the gap; /sequence history back 1 brings it back', n1 === n0 - 1 && Q.edit.clips.length === n0 && Q.history().back.length === steps0, { n0, n1, after: Q.edit.clips.length });
step('/sequence history lists the steps (latest first)', typeof hist === 'string' ? /\d+\. /.test(hist) : true, String(hist).slice(0, 200));
const more = document.querySelector('.sq-more');
await J.click(more); await wait(400);
const histRow = [...document.querySelectorAll('#menu *')].find((n) => n.children.length < 3 && /^History/.test(n.textContent.trim()));
step('⋯ → History is in the menu', Boolean(histRow), histRow?.textContent);
await J.key('Escape'); await wait(200);

// ---------- go to a clip, play around ----------
await cmd('/sequence clip 3');
const c3 = T0()[2];
step('/sequence clip 3: selected, the playhead at its start', Math.abs(Q.time - c3.start) < 0.04 && Q.selection[0] === c3.clip.id, { T: Q.time, start: c3.start });
Q.seek(4); await Q.settle();
focus(); await J.key(' ', { shift: true });
const went = await until(() => Q.playing, 2000);
const back = await until(() => !Q.playing && Math.abs(Q.time - 4) < 0.05, 6000);
step('Shift+Space plays around the playhead and comes back to it', went && back, Q.time);

// ---------- the In–Out range, close gaps ----------
Q.play(false); Q.seek(1); focus(); await J.key('i'); Q.seek(2); await Q.settle(); focus(); await J.key('I', { shift: true }); await wait(150);
const rg = Q.rangeOf();
step('I / Shift+I set the In–Out range (the editor\'s own range)', rg && Math.abs(rg.a - 1) < 0.02 && Math.abs(rg.b - 2) < 0.02 && Q.edit.mark && !Q.edit.mark.lab, rg);
Q._S.loop = true; Q._S.L.send({ type: 'seq-loop', on: true, range: rg });
Q.seek(1.2); await Q.settle(); Q.play(true);
let maxT = 0; let wrapped = false; const tEnd = Date.now() + 2600;
while (Date.now() < tEnd) { const i = await sbx('return __seqInfo()'); if (i.T > maxT) maxT = i.T; if (maxT > 1.6 && i.T < 1.4) wrapped = true; await wait(60); }
Q.play(false); Q._S.loop = false; Q._S.L.send({ type: 'seq-loop', on: false, range: null });
step('⟲ Loop with a range loops just the range', wrapped && maxT < 2.2, { maxT, wrapped });
const out = await Q.render({ range: Q.rangeOf(), crf: 30 }).catch((err) => ({ error: err.message }));
const pr = out?.path ? await window.hub.video.probe(out.path).catch(() => null) : null;
step('rendering just the range: 1 s, 30 frames', out?.frames === 30 && (!pr || Math.abs((pr.duration || 1) - 1) < 0.15), { out, dur: pr?.duration });
await cmd('/sequence range clear');
step('/sequence range clear', !Q.rangeOf());
await cmd('/sequence delete 2');
const gaps0 = Q.edit.clips.filter((c) => c.kind === 'gap').length; const len0 = Q.status().seconds;
await cmd('/sequence close-gaps');
step('/sequence close-gaps closes the gap a lift left (the rest moves up)', gaps0 >= 1 && !Q.edit.clips.some((c) => c.kind === 'gap') && Q.status().seconds < len0, { gaps0, len0, len1: Q.status().seconds });

// ---------- chat surface ----------
step('no duplicate commands', Commands.duplicates().length === 0, Commands.duplicates());
const keys = Keys.all().filter((k) => k.area === 'Lab sequence').map((k) => k.keys);
step('the new keys are in the keys sheet (area Lab sequence)', ['[ / ]', ', / .', 'Shift+S', 'Z', 'Shift+Space'].every((k) => keys.includes(k)), keys);
const help = await Q.handle('three_sequence', { op: 'help' });
step('directors: the new ops are in three_sequence help', /nudge/.test(help.value) && /marker_go/.test(help.value) && /history/.test(help.value), help.value.length);
return J.done();
