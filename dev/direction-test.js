#!/usr/bin/env node
// ✦ Direction (round 67, direction67): the card's math (tools/three-direction-core.js) and the time machine's
// branches (tools/three-history-core.js parentOf / tips / lineOf). No window, no data folder.
//   node dev/direction-test.js
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const C = require(path.join(root, 'tools/three-direction-core.js'));
const TM = require(path.join(root, 'tools/three-history-core.js'));
let n = 0; const ok = (what) => { n += 1; console.log(`✓ ${what}`); };

// Try 4 ways
assert.equal(C.TRY_ANGLES.length, 4);
assert(/neon tunnel\. Rough is fine/.test(C.tryBrief('neon tunnel')));
assert(/It should feel like: lonely and wet\./.test(C.tryBrief('', { feel: 'lonely and wet' })));
assert(/keep #1 .*its light from #3/.test(C.combineText(1, 3, 'light')) && /n: 3/.test(C.combineText(1, 3, 'light')));
ok('Try 4 ways: four angles, a rough brief with the vision sentence, the combine request');

// plain sliders
const P = [
  { id: 'a|speed', key: 'speed', label: 'Speed', kind: 'number', value: 1, min: 0, max: 5, group: 'motion' },
  { id: 'a|count', key: 'count', label: 'Count', kind: 'number', value: 40, min: 1, max: 200, int: true, group: 'look' },
  { id: 'a|bloom', key: 'bloom', label: 'Bloom', kind: 'number', value: 0.5, min: 0, max: 2, group: 'look' },
  { id: 'a|blur', key: 'blur', label: 'Blur', kind: 'number', value: 1, min: 0, max: 4, group: 'look' },
  { id: 'a|size', key: 'size', label: 'Size', kind: 'number', value: 2, min: 0, max: 4, group: 'look' },
  { id: 'a|col', key: 'col', label: 'Colour', kind: 'color', value: '#3366ff', group: 'colors' },
  { id: 'a|grey', key: 'grey', label: 'Grey', kind: 'color', value: '#808080', group: 'colors' },
];
const base = Object.fromEntries(P.map((p) => [p.id, p.value]));
assert.deepStrictEqual(C.plain(P, base, {}), base, 'all dials at 0 give the base back');
const busy = C.plain(P, base, { busy: 1 });
assert(busy['a|speed'] > 2 && busy['a|count'] > 80 && Number.isInteger(busy['a|count']) && busy['a|size'] === 2, 'busier: motion and counts up, size alone');
const calm = C.plain(P, base, { busy: -1 });
assert(calm['a|speed'] < 0.5 && calm['a|count'] < 20);
const harsh = C.plain(P, base, { harsh: 1 });
assert(harsh['a|bloom'] === 1 && harsh['a|blur'] === 0.5, 'harsher: bloom up, blur down');
const warm = C.plain(P, base, { warm: 1 }); const cold = C.plain(P, base, { warm: -1 });
const hue = (h) => C._test.hexToHsl(h)[0];
const gap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }; // around the colour wheel
assert(gap(hue(warm['a|col']), 30) < gap(hue('#3366ff'), 30), 'warmer turns toward orange');
assert(gap(hue(cold['a|col']), 205) < gap(hue('#3366ff'), 205), 'colder turns toward teal-blue');
assert.equal(warm['a|grey'], '#808080', 'greys stay grey');
assert.equal(C.plain([{ ...P[0], value: 0 }], { 'a|speed': 0 }, { busy: 1 })['a|speed'] > 0, true, 'busier lifts a stopped motion into the range');
assert.equal(C.dialWord('busy', -0.4), '40% calmer'); assert.equal(C.dialWord('warm', 0), '');
ok('plain sliders: calmer/busier, colder/warmer, softer/harsher on the right values; 0 = unchanged');

// marks
assert.equal(C.markText([]), '');
const t = C.markText([{ x: 0.1, y: 0.1, r: 0.1, kind: 'more', note: 'this glow' }, { x: 0.5, y: 0.5, r: 0.2, kind: 'wrong' }, { x: 0.9, y: 0.9, r: 0.1 }], 'Orb');
assert(/"Orb"/.test(t) && /1\. MORE OF THIS: this glow · top left/.test(t) && /2\. WRONG · the centre/.test(t) && !/3\./.test(t), t);
assert.equal(C.whereOf(0.9, 0.5), 'the right side'); assert.equal(C.whereOf(0.5, 0.9), 'bottom centre');
ok('Mark it up: the marks in plain words (an unanswered circle is left out)');

// drift
assert.equal(C.driftOf([]), null);
assert.equal(C.driftOf([0.1, 0.6]).level, 'ok');
assert.equal(C.driftOf([0.3]).word, 'drifting a little');
assert.equal(C.driftOf([0.8, 0.7]).level, 'far');
assert(/should feel like: slow/.test(C.anchorText({ feel: 'slow', frames: [{}, {}] }, 'Orb')) && /2 reference frames/.test(C.anchorText({ feel: 'slow', frames: [{}, {}] })));
ok('vision card: drift is the distance to the closest frame; plain words');

// branches in the time machine
const doc = TM.blank();
const st = (code) => ({ layers: [{ id: 'main', name: 'Main', code }], vals: {}, sel: 'main', palette: null });
const a = TM.add(doc, st('a'), { at: 1 });
const b = TM.add(doc, st('b'), { at: 2 });
const c = TM.add(doc, st('c'), { at: 3 });
assert.deepStrictEqual(TM.tips(doc).map((v) => v.id), [c.id], 'linear: one tip');
const r = TM.add(doc, st('a'), { at: 4, kind: 'restore', p: a.id }); // went back to a
const d = TM.add(doc, st('d'), { at: 5, p: r.id });
assert.deepStrictEqual(TM.tips(doc).map((v) => v.id), [d.id, c.id], 'going back and working on: two tips, newest first');
assert.deepStrictEqual(TM.lineOf(doc, d.id).map((v) => v.id), [a.id, r.id, d.id]);
assert.deepStrictEqual(TM.lineOf(doc, c.id).map((v) => v.id), [a.id, b.id, c.id]);
doc.versions = doc.versions.filter((v) => v.id !== r.id); // thinning took the restore away
assert.equal(TM.parentOf(doc, d), c.id, 'a missing parent falls back to the version before');
assert.equal(TM.tips(doc).length, 1);
ok('time machine branches: tips, lines, a thinned parent falls back');

console.log(`\n${n} groups passed.`);
