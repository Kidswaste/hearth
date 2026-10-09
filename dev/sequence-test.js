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
  assert(/'footage', 'sequence', 'help'\]/.test(src)); assert(/name: 'three_sequence'/.test(src));
});
ok('the Video Director reads scene clips and Lab layers by name in the editor (not as gaps)', () => {
  const x = D.addOverlay(D.addScene(D.create(), { sketch: 'a', name: 'Rings', look: 'Neon' }), { name: 'Glow' }, { at: 0, dur: 2 });
  const L = C.describeAll(x).join('\n');
  assert(/Lab scene “Rings” look Neon/.test(L), L); assert(/Lab layer “Glow”/.test(L), L); assert(!/gap/.test(L));
});
console.log(`${n} tests passed`);
