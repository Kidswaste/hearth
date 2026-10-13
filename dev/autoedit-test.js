// Node tests for the auto-edit's planning (tools/three-autoedit-core.js): a song's sections on bars, intensity from the
// energy, scenes per section (the hero on the drop, saved ones elsewhere, new ones only when there is just one scene),
// transitions into each section, looks from the key, the plan's edits (scene, length, transition, look, cuts,
// lyrics), and building the Lab sequence (every cut on a bar, the song under it, markers, captions, nothing new left).
//   node dev/autoedit-test.js
const assert = require('assert');
const A = require('../tools/three-autoedit-core.js');
const D = require('../tools/three-seq-data.js');
const C = require('../tools/cut-data.js');
const X = require('../tools/three-seq-cut.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;
// 120 BPM (a bar = 2 s), 64 s: intro 8 s, build 8 s, drop 16 s, break 8 s, drop 16 s, outro 8 s; loudness to match
const grid = { bpm: 120, anchor: 0, bpb: 4 };
const sections = [['Intro', 0, 8.1, 'quiet'], ['Build', 8.1, 16, 'medium'], ['Drop', 16, 32, 'loud'], ['Break', 32, 39.9, 'quiet'], ['Drop', 39.9, 56, 'loud'], ['Outro', 56, 64, 'quiet']].map(([label, start, end, energy]) => ({ label, start, end, energy }));
const level = Array.from({ length: 64 * 30 }, (_, i) => { const t = i / 30; return t < 8 ? 0.2 : t < 16 ? 0.5 : t < 32 ? 0.95 : t < 40 ? 0.25 : t < 56 ? 1 : 0.15; });
const song = { src: '/music/song.wav', dur: 64, grid, sections, drops: [16, 40], level, fps: 30, key: 'A minor' };
const scenes = [{ sketch: 'hero', name: 'Hero' }, { sketch: 'b', name: 'Bee' }, { sketch: 'c', name: 'Sea' }];

const p = A.plan(song, { scenes, seed: 7 });
ok('plan: one row per section, every boundary on a bar line, the whole song', () => {
  assert.deepStrictEqual(p.sections.map((s) => s.label), ['Intro', 'Build', 'Drop', 'Break', 'Drop', 'Outro']);
  for (const s of p.sections) { assert(near((s.a / 2) % 1, 0) || near((s.a / 2) % 1, 1), `${s.label} at ${s.a}`); }
  assert.strictEqual(p.sections[0].a, 0); assert.strictEqual(p.end, 64); assert.deepStrictEqual(p.sections.map((s) => s.bars), [4, 4, 8, 4, 8, 4]);
});
ok('intensity follows the energy: drops loudest, break and outro calm; cuts every bar on the drop, held in the quiet', () => {
  const by = Object.fromEntries(p.sections.map((s) => [s.label, s]));
  assert(by.Drop.intensity >= 0.85 && by.Break.intensity <= 0.45 && by.Build.intensity > by.Intro.intensity);
  assert.strictEqual(by.Drop.cuts, 1); assert.strictEqual(by.Intro.cuts, 4);
});
ok('scenes: the one on screen on the drops, saved ones on the build and the break, nothing new to make', () => {
  assert(p.sections.filter((s) => s.label === 'Drop').every((s) => s.scene.sketch === 'hero'));
  assert(['b', 'c'].includes(p.sections[1].scene.sketch) && ['b', 'c'].includes(p.sections[3].scene.sketch));
  assert.strictEqual(A.newOnes(p).length, 0);
});
ok('transitions on the beat: flash into a drop, fly into the build, dip into the break, morph into the outro', () => {
  assert.deepStrictEqual(p.sections.map((s) => s.trans), ['cut', 'lab-fly', 'lab-flash-beat', 'dip-black', 'lab-flash-beat', 'lab-morph']);
  assert.strictEqual(A.transDur('lab-flash-beat', p.song), 0.375); assert.strictEqual(A.transDur('lab-fly', p.song), 1);
});
ok('looks: a darker family for a minor key, one look per section', () => { assert(p.sections.every((s) => A.LOOK[s.look])); assert(['blockbuster', 'bw-high'].includes(p.sections[2].look)); });
ok('one scene only: the build and the break become new scenes for the director (briefs per section, the owner\'s words first)', () => {
  const q = A.plan(song, { scenes: scenes.slice(0, 1), brief: 'neon rain' });
  const fresh = A.newOnes(q);
  assert.deepStrictEqual(fresh.map((x) => x.s.label), ['Build', 'Break']);
  assert(/^neon rain\. For the Build/.test(fresh[0].s.scene.brief));
  assert(/2 new scenes to make/.test(A.describe(q)));
  assert.throws(() => A.build(D.create(), q, { D, C }), /still to make/);
  const filled = A.fillNew(q, { [fresh[0].i]: { sketch: 'n1', name: 'N1' }, [fresh[1].i]: { sketch: 'n2', name: 'N2' } });
  assert.strictEqual(A.newOnes(filled).length, 0); assert.strictEqual(filled.sections[1].scene.sketch, 'n1');
});
ok('no song, no plan', () => { assert.throws(() => A.plan(null), /Load a song/); });
ok('a flat song (one section) gets intro / build / drop / outro on its bars', () => {
  const q = A.plan({ src: 's', dur: 40, grid, sections: [{ start: 0, end: 40, label: 'Drop', energy: 'loud' }] }, { scenes });
  assert.deepStrictEqual(q.sections.map((s) => s.label), ['Intro', 'Build', 'Drop', 'Outro']);
});
ok('edit: a section\'s length moves the cut to the next one (bar by bar); the last one sets the end', () => {
  const q = A.setBars(p, 0, 6);
  assert.strictEqual(q.sections[0].b, 12); assert.strictEqual(q.sections[1].a, 12); assert.strictEqual(q.sections[1].bars, 2);
  const r = A.setBars(p, 5, 2);
  assert.strictEqual(r.end, 60); assert.strictEqual(A.pieces(r).at(-1).b, 60);
  const s = A.setBars(p, 0, 99); assert.strictEqual(s.sections[1].bars, 1, 'the next section keeps a bar');
  assert.strictEqual(p.sections[0].bars, 4, 'the plan itself is not changed');
});
ok('edit: scene, transition, look, cuts, lyrics, format', () => {
  let q = A.setScene(p, 2, { sketch: 'c', name: 'Sea' }); assert.strictEqual(q.sections[2].scene.sketch, 'c');
  q = A.setScene(q, 3, 'new'); assert.strictEqual(q.sections[3].scene.kind, 'new');
  q = A.setTrans(q, 2, 'lab-stutter'); assert.strictEqual(q.sections[2].trans, 'lab-stutter');
  assert.throws(() => A.setTrans(q, 2, 'nope'), /No transition/);
  q = A.setLook(q, 2, null); assert.strictEqual(q.sections[2].look, null);
  q = A.setCuts(q, 2, 4); assert.strictEqual(q.sections[2].cuts, 4);
  q = A.setLyrics(q, 'one\ntwo'); assert(q.lyrics.on);
  q = A.setFormat(q, '16:9'); assert.strictEqual(q.format, '16:9');
  assert.throws(() => A.setLook(q, 99, 'moody'), /No section 100/);
});
const base = D.setSong(D.create({ format: '9:16' }), song.src, song.dur);
const cues = A.lyricCues([{ a: 2, b: 4, text: 'intro words' }, { a: 18, b: 20, text: 'drop words' }, { a: 70, b: 72, text: 'after the end' }], p);
const r = A.build(base, p, { D, C, captionItem: X.captionItem, cues: A.setLyrics(p, 'x').lyrics.on ? cues : null });
const pl = A.setLyrics(p, 'x');
const r2 = A.build(base, pl, { D, C, captionItem: X.captionItem, cues });
ok('build: one clip per cut, every cut on a bar of the song, the video as long as the plan', () => {
  const T = D.timing(r.edit);
  assert.strictEqual(r.edit.clips.length, A.pieces(p).length);
  assert(T.slice(1).every((x) => near((x.cut / 2) - Math.round(x.cut / 2), 0)), T.map((x) => x.cut).join(','));
  assert(near(C.mainTotal(r.edit), 64, 0.01));
  assert.strictEqual(r.info.clips, A.summary(p).clips);
});
ok('build: the transition into each section, centred on its bar line; cuts within a drop', () => {
  const into = r.edit.clips.filter((c, j) => j && c.trans).map((c) => c.trans.type);
  assert(into.includes('lab-flash-beat') && into.includes('lab-fly') && into.includes('dip-black'));
  const drop = r.edit.clips.filter((c) => c.section === 'Drop');
  assert(drop.length >= 16 && drop.slice(1, 8).every((c) => !c.trans || c.trans.type === 'lab-flash-beat'));
});
ok('build: variations inside a section get bolder with the intensity; a look per section', () => {
  const drop = r.edit.clips.filter((c) => c.section === 'Drop');
  const intro = r.edit.clips.filter((c) => c.section === 'Intro');
  assert(drop[1].vary && intro.length >= 1 && drop[1].vary.amount > (intro[1]?.vary?.amount ?? 0));
  assert(r.edit.clips.every((c) => c.grade?.look));
});
ok('build: the song from 0 cut at the end, a marker per section, saved plan for later', () => {
  const s = D.songOf(r.edit); assert.strictEqual(s.in, 0); assert(near(s.out, 64, 0.06));
  assert.deepStrictEqual(r.edit.markers.map((m) => m.label), ['Intro', 'Build', 'Drop', 'Break', 'Drop', 'Outro']);
  assert.strictEqual(r.edit.seq.autoedit.plan.sections.length, 6);
});
ok('build: lyrics only where the plan says so (not in the intro, not past the end), as captions', () => {
  assert.strictEqual(cues.length, 1); assert.strictEqual(cues[0].text, 'drop words');
  const caps = r2.edit.tracks.filter((k) => /^Captions/.test(k.name)).flatMap((k) => k.items);
  assert.strictEqual(caps.length, 1); assert.strictEqual(r2.info.captions, 1);
  const again = A.build(r2.edit, pl, { D, C, captionItem: X.captionItem, cues });
  assert.strictEqual(again.edit.tracks.filter((k) => /^Captions/.test(k.name)).flatMap((k) => k.items).length, 1, 'making it again replaces them');
});
ok('describe: the plan in a few lines (one per section)', () => { const t = A.describe(p); assert.strictEqual(t.split('\n').length, 7); assert(/1\. Intro 0:00–0:08 · 4 bars/.test(t)); });
console.log(`\n${n} passed${process.exitCode ? ', some failed' : ''}`);
