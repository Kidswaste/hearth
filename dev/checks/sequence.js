// The Lab sequence, driven like a person: the "▤ Sequence" tab on the Lab timeline, scenes added from the ＋ picker,
// a drop and a command, footage (/tmp/labframes-media/frames_a_30.mp4: every frame carries its number), a title,
// transitions; then the preview checked at exact frames (the scene's color and its own clock decoded from the
// picture: each scene counts from its clip's start, the footage shows its exact source frame), the editor's keys
// (S, Delete, Shift+Delete, Alt+→ slip, ⌘/Ctrl+Z), playback switching scenes in the same page (no reload, the
// playhead on the compositor), the song (/tmp/hearth-test-song.wav) fitting new scenes to its bars, the editor round
// trip (the same CutData edit opens in Video Review's editor, a change there comes back), commands, keys, menus.
//   node dev/make-lab-footage.js /tmp/labframes-media
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/sequence.js --shot /tmp/sequence.png
const { step } = J;
const { wait, until, colorOf } = SQL;
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const ids = await SQL.scenes();
const S = ThreeLab.scenes;
S.open(ids.red); await wait(1500);
const reloadsStart = ThreeLab.live.counts().reloads.preview || 0;

// ---------- 1. one open entry on the timeline ----------
const bar = document.querySelector('.media-bar');
const tab = bar.querySelector('.sq-tab');
step('"▤ Sequence" sits in the timeline strip (one entry)', J.visible(tab) && tab.textContent.includes('Sequence'));
await J.click(tab);
await until(() => ThreeSeq.active && ThreeSeq.edit, 8000); await wait(800);
const first = ThreeSeq.edit;
step('clicking it opens a sequence that starts with the scene on screen (no questions)', ThreeSeq.active && first.clips.length === 1 && first.clips[0].kind === 'scene' && first.clips[0].sketch === ids.red && first.seq.lab === true, ThreeSeq.status().clips);
const row = bar.querySelector('.sq-row');
const ctl = [...row.querySelectorAll('button, .sq-time')].filter((n) => J.visible(n));
step('the sequence row stays calm: ≤ 7 controls on screen', ctl.length <= 7, ctl.map((n) => n.textContent.trim().slice(0, 14)));
step('the music timeline is tucked away while the sequence shows', !J.visible(bar.querySelector('.mb-main')) && !J.visible(bar.querySelector('.mb-tl-wrap')) && J.visible(bar.querySelector('.sq-tl')));
const reloads0 = ThreeLab.live.counts().reloads.preview || 0;
step('the preview takes the sequence\'s shape (9:16): at most one pretty reload', Math.abs((await SQL.sbx('return innerWidth / innerHeight')) - 9 / 16) < 0.01 && reloads0 - reloadsStart <= 1, { reloads: reloads0 - reloadsStart });
step('stored as an editor sequence (one model: kv video-cuts, seq:<name>)', ThreeSeq.key.startsWith('seq:') && Boolean((await VideoCut.editFor(ThreeSeq.key))?.seq?.lab));

// ---------- 2. building it ----------
await say('/sequence length 1 2 s');
// the ＋ picker: a tile click adds at the end
await J.click(row.querySelector('.sq-add'));
await until(() => document.querySelector('.sq-pick'), 3000);
const tile = [...document.querySelectorAll('.sq-pick .sq-tile')].find((t) => /^Seq Green$/.test(t.querySelector('b')?.textContent || ''));
step('＋ lists your sketches (and chat scenes, looks) as draggable tiles', Boolean(tile) && tile.draggable, [...document.querySelectorAll('.sq-pick .sq-tile b')].slice(0, 6).map((b) => b.textContent));
await J.click(tile);
await until(() => ThreeSeq.edit.clips.length === 2, 4000);
let e = ThreeSeq.edit;
step('a tile click adds the scene with the default cross dissolve', e.clips[1]?.sketch === ids.green && e.clips[1].trans?.type === 'dissolve', ThreeSeq.status().clips);
await say('/sequence length 2 2 s');
// footage through a command
const ft = await say(`/sequence footage ${SQL.FOOTAGE} for 2 s`);
await until(() => ThreeSeq.edit.clips.length === 3, 8000);
await say('/sequence transition cut 3');
// a drop (what dragging a tile does) of the blue scene at the end of the track
{
  const tl = bar.querySelector('.sq-tl'); const r = tl.getBoundingClientRect();
  const dt = new DataTransfer(); dt.setData('application/x-hearth-scene', JSON.stringify({ what: { sketch: ids.blue } }));
  const x = r.left + ThreeSeq._xOf(ThreeSeq.edit ? 6.2 : 0); const y = r.top + 74;
  tl.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  tl.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
}
await until(() => ThreeSeq.edit.clips.length === 4, 4000);
await say('/sequence length 4 2 s');
await say('/sequence transition wipe-left 4');
await say('/sequence title HELLO at 0.5 for 1 s');
await wait(600);
e = ThreeSeq.edit;
const tm = ThreeSeqData.timing(e);
step('built: red · dissolve · green · cut · footage · wipe · blue, and a title', e.clips.map((c) => c.kind).join() === 'scene,scene,video,scene' && e.clips[3].sketch === ids.blue && e.clips[3].trans?.type === 'wipe-left' && !e.clips[2].trans && (e.tracks || []).some((k) => k.type === 'text' && k.items[0]?.text === 'HELLO'), { clips: ThreeSeq.status().clips, ft });
step('timing: 0–2 · 1.5–3.5 · 3.5–5.5 · 5–7 (7 s, 210 frames)', JSON.stringify(tm.map((x) => [x.start, x.end].map((v) => Math.round(v * 100) / 100))) === '[[0,2],[1.5,3.5],[3.5,5.5],[5,7]]' && ThreeSeq.status().frames === 210, tm.map((x) => [x.start, x.end]));
await J.shot('sequence-built');

// ---------- 3. exact frames in the preview ----------
const checks = [
  [15, 'red', 15], [40, 'red', 40], [75, 'green', 30], [110, null, 5], [168, 'blue', 18], [200, 'blue', 50],
];
const got = [];
for (const [n, color, code] of checks) {
  const p = await SQL.at(n);
  got.push({ n, color: colorOf(p.center), code: p.code });
  step(`frame ${n}: ${color || 'footage'} showing its own frame ${code}`, (color ? colorOf(p.center) === color : true) && p.code === code, p);
}
const mid = await SQL.at(52);
step('frame 52 (in the dissolve): red and green mixed', colorOf(mid.center) === 'mix' && mid.center[0] > 60 && mid.center[1] > 60, mid);
const wipe = await SQL.at(158);
step('frame 158 (in the wipe from footage to blue): the editor\'s wipe draws', Boolean(wipe.center), wipe);
const info = await SQL.sbx('return __seqInfo()');
step('only the clips around the playhead run in the page', info.mounted.length <= 3 && info.libs, info);

// ---------- 4. the editor's keys ----------
const tl = bar.querySelector('.sq-tl');
tl.focus();
await SQL.at(75);
ThreeSeq.select(null);
await J.key('s');
await wait(300);
e = ThreeSeq.edit;
step('S splits the scene under the playhead', e.clips.length === 5 && e.clips[1].sketch === ids.green && e.clips[2].sketch === ids.green, ThreeSeq.status().clips);
const after = await SQL.at(80);
step('the second half carries on in the scene\'s own time (frame 80 still shows its frame 35)', colorOf(after.center) === 'green' && after.code === 35, after);
ThreeSeq.select(e.clips[2].id);
await J.key('Delete');
await wait(250);
step('Delete lifts it (a gap keeps the timing)', ThreeSeq.edit.clips[2].kind === 'gap' && ThreeSeq.status().frames === 210, ThreeSeq.status().clips);
await J.key('z', { ctrl: true }); await wait(200);
ThreeSeq.select(ThreeSeq.edit.clips[2].id);
await J.key('Delete', { shift: true }); await wait(250);
step('Shift+Delete ripples (the rest moves up)', ThreeSeq.edit.clips.length === 4 && ThreeSeq.status().frames < 210, ThreeSeq.status().frames);
await J.key('z', { ctrl: true }); await wait(200);
await J.key('z', { ctrl: true }); await wait(300);
step('⌘/Ctrl+Z undoes them (back to 4 clips, 210 frames)', ThreeSeq.edit.clips.length === 4 && ThreeSeq.status().frames === 210, ThreeSeq.status().clips);
ThreeSeq.select(ThreeSeq.edit.clips[3].id);
await J.key('ArrowRight', { alt: true }); await J.key('ArrowRight', { alt: true }); await J.key('ArrowRight', { alt: true });
const slipped = await SQL.at(200);
step('Alt+→ ×3 slips blue by 3 frames (frame 200 shows its frame 53)', slipped.code === 53, slipped);
await J.key('z', { ctrl: true }); await J.key('z', { ctrl: true }); await J.key('z', { ctrl: true });
await SQL.at(30);
await J.key('ArrowRight'); await J.key('ArrowRight', { shift: true });
await wait(200);
step('→ one frame, Shift+→ ten (frame 41)', Math.round(ThreeSeq.time * 30) === 41, ThreeSeq.time);
await J.key('ArrowDown'); await wait(150);
step('↓ jumps to the next edit point (1.5 s, where green comes in)', Math.abs(ThreeSeq.time - 1.5) < 1e-3, ThreeSeq.time);

// ---------- 5. playing: scenes switch in the same page ----------
const mo = { n: 0 }; const obs = new MutationObserver((l) => { mo.n += l.length; }); obs.observe(bar.querySelector('.sq-view'), { subtree: true, childList: true, attributes: true, characterData: true });
ThreeSeq.seek(0);
await ThreeSeq.settle();
await J.key(' ');
await wait(300);
const anims = bar.querySelector('.sq-playhead').getAnimations().length;
const seen = [];
for (let i = 0; i < 30; i++) { await wait(150); const p = await SQL.probe(); seen.push(colorOf(p.center)); }
await J.key(' ');
obs.disconnect();
const order = seen.filter((c, i) => c !== seen[i - 1] && c !== 'mix');
step('Space plays: red, then green, then the footage (in order, no blank)', order.slice(0, 3).join() === 'red,green,black' || order.slice(0, 2).join() === 'red,green', order);
step('the playhead moves on the compositor (one animation, no per-frame writes)', anims === 1, anims);
step('DOM changes while playing ~4.5 s stay few (time label only)', mo.n < 80, mo.n);
const reloads1 = ThreeLab.live.counts().reloads.preview || 0;
step('no page reload for any of it (scenes switch in place)', reloads0 === reloads1, { reloads0, reloads1 });

// ---------- 6. J K L ----------
ThreeSeq.seek(1); await ThreeSeq.settle();
await J.key('l'); await wait(400);
const playingL = ThreeSeq.playing;
await J.key('k'); await wait(300);
const tK = ThreeSeq.time;
step('L plays, K stops on a whole frame', playingL && !ThreeSeq.playing && Math.abs(tK * 30 - Math.round(tK * 30)) < 1e-3, { playingL, tK });
await J.key('j'); await wait(500); await J.key('k'); await wait(200);
step('J steps backward', ThreeSeq.time < tK, { before: tK, after: ThreeSeq.time });

// ---------- 7. menus: right-click a clip ----------
{
  const r = tl.getBoundingClientRect(); const x = r.left + ThreeSeq._xOf(2.5); const y = r.top + 74;
  tl.querySelector('canvas').dispatchEvent(new MouseEvent('contextmenu', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
  await wait(300);
  const labels = [...document.querySelectorAll('#menu .menu-item, #menu button, #menu [role=menuitem]')].map((n) => n.textContent.trim()).filter(Boolean);
  step('right-click a scene: edit, look, replace, transition, length, split, delete…', labels.some((l) => /Edit “Seq Green”/.test(l)) && labels.some((l) => /^Transition/.test(l)) && labels.some((l) => /^Length/.test(l)) && labels.some((l) => /Ripple delete/.test(l)), labels.slice(0, 14));
  await J.key('Escape');
}

// ---------- 8. the song: new scenes fit its bars ----------
await say(`/sequence song ${SQL.SONG}`);
await until(() => ThreeLab.director.media?.loaded || ThreeSeq.status().song, 15000);
await until(() => ThreeSeq.status().grid, 20000);
const g = ThreeSeq.status().grid;
await say('/add-scene Seq Red');
await wait(500);
const t2 = ThreeSeqData.timing(ThreeSeq.edit);
const lastC = t2.at(-1);
const barLen = g?.bar || 2;
const onBars = t2.slice(1).every((x) => { const k = (x.cut - (ThreeSeq._S.L.player.timeline().grid.downbeat || 0)) / barLen; return Math.abs(k - Math.round(k)) < 0.02; });
step('with a song: a new scene lasts 4 bars and every cut lands on a bar', Boolean(g) && Math.abs((lastC.end - lastC.cut) - 4 * barLen) < 0.05 + barLen && onBars, { grid: g, cuts: t2.map((x) => Math.round(x.cut * 1000) / 1000) });
const bar9 = await say('/sequence add Seq Blue at bar 3');
step('/sequence add … at bar 3 puts it on that bar\'s cut', ThreeSeq.edit.clips.some((c) => c.sketch === ids.blue), bar9.slice(0, 160));
await say('/sequence undo'); await say('/sequence undo');

// ---------- 9. the editor round trip (one model) ----------
const key = ThreeSeq.key;
const ed = await say('/sequence editor');
await until(() => VideoCut.active && VideoCut.path === key, 15000);
const inEditor = VideoCut.edit;
step('/sequence editor opens the same sequence in Video Review\'s editor (scene clips, footage, title)', VideoCut.path === key && inEditor.clips.filter((c) => c.kind === 'scene').length >= 3 && inEditor.clips.some((c) => c.kind === 'video') && (inEditor.tracks || []).some((k) => k.items.some((x) => x.text === 'HELLO')), ed.slice(0, 120));
await J.shot('sequence-in-editor');
VideoCut.addTitleItem('FROM THE EDITOR', { at: 3, dur: 1 });
const blueId = VideoCut.edit.clips.find((c) => c.sketch === ids.blue)?.id;
VideoCut.setTransition('dip-black', 0.4, [blueId]);
await wait(700);
const back = await say('/sequence back');
await until(() => ThreeSeq.active, 10000); await wait(600);
e = ThreeSeq.edit;
step('/sequence back: the editor\'s changes are the Lab sequence now', (e.tracks || []).some((k) => k.items.some((x) => x.text === 'FROM THE EDITOR')) && e.clips.find((c) => c.sketch === ids.blue)?.trans?.type === 'dip-black', back.slice(0, 160));
const t3 = await SQL.at(95);
step('the title added in the editor shows in the Lab preview (frame 95)', Boolean(t3.center), t3);

// ---------- 10. commands, keys, palette, map ----------
step('/sequence, /seq, /add-scene, /sequence-render are registered; no duplicate names', ['sequence', 'seq', 'add-scene', 'sequence-render'].every((n) => Commands.get(n)) && !Commands.duplicates().length, Commands.duplicates());
const st = await say('/sequence status');
step('/sequence status lists the clips', /Check|seq|scene “Seq Red”/.test(st), st.slice(0, 200));
step('the sequence keys are in the keys sheet (area "Lab sequence")', Keys.all().filter((k) => k.area === 'Lab sequence').length >= 10, Keys.all().filter((k) => k.area === 'Lab sequence').length);
step('the preview\'s right-click offers the sequence', JSON.stringify(ThreeSeq.previewItem()).includes('Sequence'));

// ---------- 11. back to the scene ----------
await until(() => !document.querySelector('.toast'), 12000);
await J.click(tab);
await until(() => !ThreeSeq.active, 5000); await wait(1500);
const after2 = await SQL.sbx('return [__seqInfo().on, document.querySelectorAll(".lab-layer").length]');
step('the tab again: back to the scene, the sequence leaves the page', !ThreeSeq.active && after2[0] === false && J.visible(bar.querySelector('.mb-main')), { after2, active: ThreeSeq.active, misses: J.out.misses });
return J.done();
