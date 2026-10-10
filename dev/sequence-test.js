// Node tests for the Lab sequence's model (tools/three-seq-data.js on CutData): building, the editor's operations
// on scene clips (split keeps the scene's own time, trims move its in-point, slip), transitions, fitting to bars,
// what shows at a time, snapping, references by number / name, and the directors' map topic and tool entry.
//   node dev/sequence-test.js
const assert = require('assert');
const D = require('../tools/three-seq-data.js');
const C = require('../tools/cut-data.js');
const MAP = require('../mcp/hearth-map.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;
const g = { bpm: 120, anchor: 0, bpb: 4 }; // a bar = 2 s

ok('create: a 9:16 Lab sequence at 30 fps, an editor sequence (seq.lab)', () => { const e = D.create(); assert.deepStrictEqual([e.seq.w, e.seq.h, e.seq.fps, e.seq.lab], [1080, 1920, 30, true]); assert(D.isLab(e)); });
ok('formats: 9:16, 16:9, 1:1, 4:5', () => { for (const f of ['9:16', '16:9', '1:1', '4:5']) assert.strictEqual(D.formatOf(D.setFormat(D.create(), f)), f); });
let e = D.create();
e = D.addScene(e, { sketch: 'a', name: 'A' });
e = D.addScene(e, { sketch: 'b', name: 'B' });
ok('defaults: 4 s scenes, a cross dissolve from the second one on', () => { assert.strictEqual(e.clips[0].dur, 4); assert(!e.clips[0].trans); assert.strictEqual(e.clips[1].trans.type, 'dissolve'); });
ok('with a song\'s grid: 4 bars, a one-beat dissolve', () => { const x = D.addScene(D.addScene(D.create(), { sketch: 'a' }, { grid: g }), { sketch: 'b' }, { grid: g }); assert.strictEqual(x.clips[0].dur, 8); assert.strictEqual(x.clips[1].trans.dur, 0.5); });
ok('CutData keeps scene clips (normalize, durations, layout)', () => { const x = C.normalize(JSON.parse(JSON.stringify(e))); assert.strictEqual(x.clips.length, 2); assert.strictEqual(C.durOf(x.clips[0]), 4); assert.deepStrictEqual(C.layout(x).map((l) => l.start), [0, 3.5]); });
ok('split a scene: the second half carries on in the scene\'s own time', () => { const x = D.split(e, 1.25); assert.strictEqual(x.clips.length, 3); assert.strictEqual(x.clips[1].in, 1.25); assert.strictEqual(x.clips[0].dur + x.clips[1].dur, 4); });
ok('trim a scene\'s start: its in-point moves with it', () => { const x = D.trim(e, e.clips[0].id, 'in', 1); assert.strictEqual(x.clips[0].in, 1); assert.strictEqual(x.clips[0].dur, 3); });
ok('trim a scene\'s end', () => { const x = D.trim(e, e.clips[0].id, 'out', -1.5); assert.strictEqual(x.clips[0].dur, 2.5); });
ok('slip a scene: same place and length, later in its time', () => { const x = D.slip(e, e.clips[1].id, 0.5); assert.strictEqual(x.clips[1].in, 0.5); assert.strictEqual(x.clips[1].dur, 4); });
ok('delete lifts (gap), ripple closes; a trailing gap goes', () => { const lift = D.remove(e, [e.clips[0].id]); assert.strictEqual(lift.clips[0].kind, 'gap'); const rip = D.remove(e, [e.clips[0].id], { ripple: true }); assert.strictEqual(rip.clips.length, 1); const end = D.remove(e, [e.clips[1].id]); assert.strictEqual(end.clips.length, 1); });
ok('move and duplicate', () => { const m = D.move(e, e.clips[1].id, 0); assert.strictEqual(m.clips[0].sketch, 'b'); const d = D.duplicate(e, e.clips[0].id); assert.strictEqual(d.clips.length, 3); assert.strictEqual(d.clips[1].sketch, 'a'); });
ok('transitions: set, cut removes it', () => { const t = D.setTrans(e, e.clips[1].id, 'wipe-left', 0.5); assert.strictEqual(t.clips[1].trans.type, 'wipe-left'); assert(!D.setTrans(t, e.clips[1].id, 'cut').clips[1].trans); });
ok('footage clip: a CutData video clip (muted with a song)', () => { const x = D.addFootage(e, '/v/clip.mp4', { duration: 6, mute: true }); const c = x.clips[2]; assert.strictEqual(c.kind, 'video'); assert.strictEqual(c.out, 6); assert.strictEqual(c.mute, true); });
ok('titles, overlays and the song on their own tracks', () => {
  let x = D.addTitle(e, 'HI', { at: 1 }); x = D.addOverlay(x, { name: 'Glow', code: 'filter("glow", {})' }, { at: 0, dur: 3 }); x = D.setSong(x, '/s/song.wav', 30);
  assert.deepStrictEqual((x.tracks || []).map((k) => `${k.type}:${k.name}`), ['text:Titles', 'video:Overlays', 'audio:Sound']);
  assert.strictEqual(D.songOf(x).src, '/s/song.wav'); assert.strictEqual(D.setSong(x, '/s/other.wav', 10).tracks[2].items.length, 1);
});
ok('fit to bars: every cut lands on a bar line', () => {
  let x = D.create();
  x = D.addScene(x, { sketch: 'a' }, { dur: 3.3 }); x = D.addScene(x, { sketch: 'b' }, { dur: 5.1 }); x = D.addScene(x, { sketch: 'c' }, { dur: 2.2 });
  const f = D.fitBars(x, g);
  for (const t of D.timing(f).slice(1)) assert(near(t.cut / 2, Math.round(t.cut / 2)), `cut ${t.cut}`);
  assert(near(D.timing(f).at(-1).end % 2, 0));
});
ok('fit to bars with bar 1 later in the song (anchor 0.5)', () => { let x = D.addScene(D.create(), { sketch: 'a' }, { dur: 4 }); x = D.addScene(x, { sketch: 'b' }, { dur: 4 }); const f = D.fitBars(x, { ...g, anchor: 0.5 }); assert(near(((D.timing(f)[1].cut - 0.5) / 2) % 1, 0)); });
ok('showing: the clip under T, both sides and p during a transition', () => {
  const s1 = D.showing(e, 1); assert.strictEqual(s1.main.sketch, 'a'); assert(!s1.trans);
  const s2 = D.showing(e, 3.75); assert.strictEqual(s2.trans.type, 'dissolve'); assert(near(s2.trans.p, 0.5)); assert.strictEqual(s2.main.sketch, 'b');
  assert(near(D.showing(e, 5).local, 1.5));
});
ok('snap: edges win a tie with beats; bars and markers are targets', () => {
  const x = C.addMarker(e, 2.9);
  const tg = D.snapTargets(x, { grid: g });
  assert.strictEqual(D.snap(3.48, tg, 0.1).t, 3.5); assert.strictEqual(D.snap(2.93, tg, 0.05).kind, 'marker'); assert.strictEqual(D.snap(6.02, tg, 0.05).t, 6);
});
ok('place: past the end appends (a gap only when asked)', () => { const x = D.addScene(e, { sketch: 'c' }, { at: 20 }); assert.strictEqual(x.clips.length, 3); const y = D.addScene(e, { sketch: 'c' }, { at: 20, gap: true }); assert.strictEqual(y.clips[2].kind, 'gap'); assert(near(D.timing(y)[3].start, 20)); });
ok('place: inside, at the nearest cut (never splits a clip)', () => { const x = D.addScene(e, { sketch: 'c' }, { at: 3.2 }); assert.strictEqual(x.clips[1].sketch, 'c'); });
ok('bars as times: bar 9 = 16 s at 120 BPM', () => assert.strictEqual(D.barAt(g, 9), 16));
ok('resolve: 2 = the second main clip, "Titles.1", a name', () => { const x = D.addTitle(e, 'HELLO', { at: 1 }); assert.strictEqual(D.resolve(x, 2), x.clips[1].id); assert.strictEqual(D.resolve(x, 'Titles.1'), x.tracks[0].items[0].id); assert.strictEqual(D.resolve(x, 'nope'), null); assert.strictEqual(D.resolve(x, 'b'), x.clips[1].id); assert.strictEqual(D.resolve(D.addScene(x, { sketch: 'z', name: 'Rings' }), 'rings') != null, true); });
ok('describe: one line per clip, readable for the chats', () => { const L = D.describe(D.addTitle(e, 'HI', { at: 1 })); assert(/^1\. 0:00\.00–0:04\.00 scene “A”/.test(L[0])); assert(/dissolve 0\.50 s in/.test(L[1])); assert(/^Titles\.1/.test(L[2])); });
ok('the app map has a "sequence" topic (and seq / storyboard aliases)', () => { assert(/THE LAB SEQUENCE/.test(MAP.topic('sequence'))); assert.strictEqual(MAP.topic('seq'), MAP.topic('sequence')); assert(/sequence/.test(MAP.TOPICS.app)); });
ok('the Three Director reaches it through three_do (lean) and three_sequence (full)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'mcp', 'three-mcp.js'), 'utf8');
  assert(/'footage', 'sequence'(, '\w+')*, 'help'\]/.test(src)); // later rounds add ops after it (motion, comp…) assert(/name: 'three_sequence'/.test(src));
});
ok('a gap holds the time: trimming the clip before it, a transition into the clip after it, an in-trim', () => {
  let x = D.addScene(D.create(), { sketch: 'a' }, { dur: 8 });
  x = D.addScene(x, { sketch: 'b' }, { at: 16, gap: true });
  const at = () => D.timing(x).find((t) => t.clip.sketch === 'b').start;
  assert(near(at(), 16));
  x = D.trim(x, x.clips[0].id, 'out', -2); assert(near(at(), 16), `trim: ${at()}`);
  x = D.setTrans(x, x.clips[2].id, 'dip-black', 0.5); assert(near(at(), 16), `transition: ${at()}`);
  const end0 = D.timing(x)[2].end;
  x = D.trim(x, x.clips[2].id, 'in', 1); assert(near(D.timing(x)[2].end, end0) && near(at(), 17), `in-trim: ${at()}`);
});
ok('the Video Director reads scene clips and Lab layers by name in the editor (not as gaps)', () => {
  const x = D.addOverlay(D.addScene(D.create(), { sketch: 'a', name: 'Rings', look: 'Neon' }), { name: 'Glow' }, { at: 0, dur: 2 });
  const L = C.describeAll(x).join('\n');
  assert(/Lab scene “Rings” look Neon/.test(L), L); assert(/Lab layer “Glow”/.test(L), L); assert(!/gap/.test(L));
});

// ---------- seq2: arranging, templates, Lab transitions, variations, nesting, roll / slide, the clipboard ----------
const A = require('../tools/three-seq-arrange.js');
const TP = require('../tools/three-seq-templates.js');
const TR = require('../tools/three-seq-trans.js');
const FX = require('../tools/cut-presets.js');
const song = { src: '/s.wav', dur: 64, grid: g, sections: [{ start: 0, end: 16, label: 'Intro' }, { start: 16, end: 24, label: 'Build' }, { start: 24, end: 48, label: 'Drop' }, { start: 48, end: 64, label: 'Outro' }] };
const three = [{ sketch: 'a', name: 'A', looks: ['L1', 'L2'] }, { sketch: 'b', name: 'B' }, { sketch: 'c', name: 'C' }];
const withSong = D.setSong(D.create(), '/s.wav', 64);
ok('templates: ten, each found by id or words (15 s → teaser, 6 s → bumper)', () => { assert(TP.TEMPLATES.length >= 10); for (const t of TP.TEMPLATES) assert.strictEqual(TP.find(t.id), t); assert.strictEqual(TP.find('15 s').id, 'teaser'); assert.strictEqual(TP.find('6s').id, 'bumper'); assert.strictEqual(TP.find('product intro').id, 'product-intro'); assert.strictEqual(TP.find('lyrics').id, 'lyric'); });
ok('arrange (music video): every cut on a bar, slow intro, a cut every bar in the drop', () => {
  const r = A.arrange(withSong, { scenes: three, song, template: 'music-video', seed: 3 });
  const T = D.timing(r.edit);
  for (const x of T.slice(1)) assert(near(x.cut / 2, Math.round(x.cut / 2)), `cut ${x.cut}`);
  const drop = T.filter((x) => x.clip.section === 'Drop'); const intro = T.filter((x) => x.clip.section === 'Intro');
  assert(drop.length >= 10 && intro.length <= 3, `${intro.length} intro / ${drop.length} drop clips`);
  assert(near(T.at(-1).end, 64));
});
ok('arrange: transitions matched to section changes (fly into the build, flash on the beat into the drop, morph into the outro)', () => {
  const T = D.timing(A.arrange(withSong, { scenes: three, song, template: 'music-video', seed: 3 }).edit);
  const into = (lab) => T.find((x) => x.clip.section === lab)?.clip.trans?.type;
  assert.strictEqual(into('Build'), 'lab-fly'); assert.strictEqual(into('Drop'), 'lab-flash-beat'); assert.strictEqual(into('Outro'), 'lab-morph');
  assert(T.filter((x) => x.clip.section === 'Drop').slice(1).every((x) => !x.clip.trans), 'hard cuts inside the drop');
});
ok('arrange: a scene back in another section comes back in another look (a saved look, else a variation)', () => {
  const e2 = A.arrange(withSong, { scenes: three, song, template: 'music-video', seed: 3 }).edit;
  const bySketch = (k) => e2.clips.filter((c) => c.sketch === k);
  assert(bySketch('a').some((c) => c.look === 'L1' || c.look === 'L2'), 'a saved look on scene A');
  assert(bySketch('b').some((c) => c.vary) && bySketch('b').some((c) => !c.vary), 'B first as saved, then a variation');
  assert(e2.clips.every((c, i) => !i || c.sketch !== e2.clips[i - 1].sketch), 'never the same scene twice in a row');
});
ok('arrange: the same seed gives the same arrangement, another seed another one', () => { const s1 = JSON.stringify(A.arrange(withSong, { scenes: three, song, seed: 5 }).edit.clips.map((c) => c.sketch)); assert.strictEqual(JSON.stringify(A.arrange(withSong, { scenes: three, song, seed: 5 }).edit.clips.map((c) => c.sketch)), s1); assert(new Set([1, 2, 3, 4, 6, 7].map((sd) => JSON.stringify(A.arrange(withSong, { scenes: three, song, seed: sd }).edit.clips.map((c) => c.sketch)))).size > 1); });
ok('teaser: 15 s around the drop, the song from that bar, a title at the end', () => {
  const r = A.arrange(withSong, { scenes: three, song, template: 'teaser', seed: 2, name: 'Hearth' });
  assert(Math.abs(r.info.seconds - 16) < 1e-6, r.info.seconds); assert(r.info.window.from <= 24 && r.info.window.to > 24);
  assert.strictEqual(D.songOf(r.edit).in, r.info.window.from); assert(r.edit.tracks.some((k) => k.items.some((x) => x.text === 'Hearth' && x.arranged)));
});
ok('lyric video and changelog: one title per line given', () => {
  const ly = A.arrange(withSong, { scenes: three, song, template: 'lyric', lines: ['one', 'two', 'three'] }).edit;
  assert.deepStrictEqual(ly.tracks.flatMap((k) => k.items).filter((x) => x.kind === 'title').map((x) => x.text), ['one', 'two', 'three']);
  const cl = A.arrange(D.create(), { scenes: three, template: 'changelog', lines: ['a', 'b', 'c', 'd'] }).edit;
  assert(cl.tracks.flatMap((k) => k.items).filter((x) => /^• /.test(x.text)).length === 4);
});
ok('loop: it ends on the scene it starts with, ⟲ on', () => { const e2 = A.arrange(withSong, { scenes: three, song, template: 'loop' }).edit; assert.strictEqual(e2.clips.at(-1).sketch, e2.clips[0].sketch); assert.strictEqual(e2.seq.loop, true); });
ok('no song: a few seconds per clip, an intro and an outro', () => { const r = A.arrange(D.create(), { scenes: three, template: 'reel' }); assert(r.info.clips >= 3 && !r.info.window); });
ok('re-arranging replaces its own titles and markers, keeps yours', () => { let e2 = D.addTitle(withSong, 'MINE', { at: 1 }); e2 = A.arrange(e2, { scenes: three, song, template: 'product-intro' }).edit; e2 = A.arrange(e2, { scenes: three, song, template: 'product-intro' }).edit; const tt = e2.tracks.flatMap((k) => k.items).filter((x) => x.kind === 'title'); assert.strictEqual(tt.filter((x) => x.text === 'MINE').length, 1); assert.strictEqual(tt.filter((x) => x.arranged).length, 3); });
ok('the 15 s and 6 s versions: the same scenes, short, on the bars', () => {
  const full = A.arrange(withSong, { scenes: three, song, seed: 1 }).edit;
  for (const secs of [15, 6]) { const r = A.cutdown(full, secs, { song }); assert(Math.abs(r.info.seconds - secs) <= 1.01, `${secs}: ${r.info.seconds}`); assert(r.edit.clips.every((c) => ['a', 'b', 'c'].includes(c.sketch))); }
});
ok('fill a gap: a scene that isn\'t next to it, the time after it stays', () => {
  let e2 = D.addScene(D.create(), { sketch: 'a', name: 'A' }, { dur: 4 }); e2 = D.addScene(e2, { sketch: 'b', name: 'B' }, { at: 10, gap: true, trans: null });
  const at0 = D.timing(e2).at(-1).start;
  const r = A.fillGap(e2, e2.clips[1].id, three);
  assert.strictEqual(r.scene, 'C'); assert(near(D.timing(r.edit).at(-1).start, at0), `${D.timing(r.edit).at(-1).start} vs ${at0}`);
});
ok('variations: seeded (the same seed, the same values), colors turn, named numbers stay in range', () => {
  const items = [{ kind: 'color', orig: '#ff0000' }, { kind: 'number', key: 'speed', orig: 1 }, { kind: 'number', orig: 3 }, { kind: 'number', key: 'opacity', orig: 0.5 }];
  const a1 = D.varyValues(items, { seed: 9, amount: 0.5 }); const a2 = D.varyValues(items, { seed: 9, amount: 0.5 }); const b1 = D.varyValues(items, { seed: 10, amount: 0.5 });
  assert.deepStrictEqual(a1, a2); assert.notDeepStrictEqual(a1, b1); assert(a1[0] !== '#ff0000' && /^#[0-9a-f]{6}$/.test(a1[0])); assert(!(2 in a1), 'an unnamed number stays'); assert(a1[3] >= 0 && a1[3] <= 1);
});
ok('roll: the cut moves, the total stays, a scene after it keeps its content in place', () => { const r = D.roll(e, 1, 0.5); assert(near(D.total(r), D.total(e))); assert(near(r.clips[0].dur, 4.5)); assert(near(r.clips[1].in, 0.5)); });
ok('slide: the clip moves, its neighbours trim', () => { let x = D.addScene(e, { sketch: 'c' }, { dur: 4 }); const r = D.slide(x, x.clips[1].id, 0.5); assert(near(D.total(r), D.total(x))); assert(near(r.clips[0].dur, 4.5)); assert(near(r.clips[2].in, 0.5)); });
ok('nested sequence: a sequence as a clip plays its clips (cut to the window, moved to its place)', () => {
  let sub = D.addScene(D.create(), { sketch: 'x', name: 'X' }, { dur: 3 }); sub = D.addScene(sub, { sketch: 'y', name: 'Y' }, { dur: 3, trans: null }); sub = D.addTitle(sub, 'SUB', { at: 0.5, dur: 1 });
  let host = D.addScene(D.create(), { sketch: 'a', name: 'A' }, { dur: 2 });
  host = D.place(host, { ...D.seqClip('seq:Sub', 'Sub', 4), in: 1 }, { trans: null });
  const f = D.flatten(host, (ref) => (ref === 'seq:Sub' ? sub : null));
  assert.deepStrictEqual(f.clips.map((c) => c.sketch), ['a', 'x', 'y']); assert(near(f.clips[1].in, 1)); assert(near(f.clips[1].dur, 2)); assert(near(D.total(f), 6));
  const t = f.tracks.flatMap((k) => k.items).find((x) => x.text === 'SUB'); assert(near(t.start, 2) && near(t.dur, 0.5), JSON.stringify(t));
  assert(/Missing sequence/.test(D.flatten(host, () => null).clips[1].text));
  assert(/Missing/.test(D.flatten(host, () => host, 0, new Set(['seq:Sub'])).clips[1].text), 'never itself');
});
ok('copy and paste clips into another sequence (main clips in order, items keep their offsets)', () => {
  const src = D.addTitle(e, 'T', { at: 4.5, dur: 1 });
  const list = D.copyClips(src, [src.clips[1].id, src.tracks[0].items[0].id]);
  const r = D.pasteClips(D.addScene(D.create(), { sketch: 'z' }, { dur: 2 }), list, 2);
  assert.strictEqual(r.ids.length, 2); assert.strictEqual(r.edit.clips[1].sketch, 'b'); assert(r.edit.tracks.some((k) => k.items.some((x) => x.text === 'T' && near(x.start, 3))));
});
ok('Lab transitions: ten, in the editor\'s catalog (group Lab), each with a canvas preview and an ffmpeg version', () => {
  const lab = FX.TRANSITIONS.filter((t) => t.group === 'Lab');
  assert.strictEqual(lab.length, 10); assert.strictEqual(FX.TRANSITIONS.at(-1).id, 'cut');
  for (const t of lab) { assert.strictEqual(typeof t.preview, 'function'); assert(t.ff || t.expr, t.id); assert(FX.TRANS[t.id] === t); }
  assert(TR.bakeTogether('lab-morph') && TR.bakeTogether('lab-fly') && !TR.bakeTogether('lab-depth') && !TR.bakeTogether('dissolve'));
});
ok('the app map knows the arranger, the Lab transitions and that each scene owns its sequence', () => { const t = MAP.topic('sequence'); assert(/arrange \{ template/.test(t) && /lab-morph/.test(t) && /Each scene owns its sequence/.test(t)); });
console.log(`${n} tests passed`);
