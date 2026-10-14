// Node tests for ◧ Before / after (tools/three-abcompare-core.js): one change from several notes (the most telling
// kind names it, a director's who), live vs picture (values / palette vs code / layers; a rename isn't a look change),
// the values to swap to and back, the chip's words, tap vs hold, the split line's clip.
//   node dev/abcompare-test.js
const assert = require('assert');
const C = require('../tools/three-abcompare-core.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };

const L = (id, code, extra = {}) => ({ id, name: `Layer ${id}`, code, color: '#f00', slot: 0, visible: true, opacity: 1, ...extra });
const snap = (layers, full, palette = null, sketch = 's1') => ({ sketch, st: { layers, vals: {}, sel: layers[0]?.id, palette }, full, at: 0 });
const A = snap([L('a', 'tweak({ k: 1 })')], { a: { k: 1, c: '#ff0000' } });

ok('notes make one change: the most telling kind names it, an explicit label beats a generic one', () => {
  let p = C.merge(null, 'sliders');
  p = C.merge(p, 'run');
  assert.strictEqual(p.kind, 'sliders');
  p = C.merge(p, 'variations', { label: '🎲 New colors' });
  p = C.merge(p, 'sliders');
  assert.strictEqual(C.labelOf(p), '🎲 New colors');
  assert.strictEqual(p.n, 4);
  assert.strictEqual(C.labelOf(C.merge(null, 'shuffle')), 'Shuffle');
});
ok('a director edit says who made it (Claude / Astra), the turn\'s chat is kept', () => {
  const p = C.merge(C.merge(null, 'run'), 'director', { by: 'claude', chat: 'c1' });
  assert.strictEqual(C.labelOf(p), "Claude's edit"); assert.strictEqual(p.chat, 'c1');
  assert.strictEqual(C.labelOf(C.merge(null, 'director', { by: 'codex' })), "Astra's edit");
  assert.strictEqual(C.labelOf(C.merge(null, 'director')), 'Director edit');
});
ok('a slider drag session waits longer than a code run before it counts as one change', () => {
  assert.ok(C.delayOf('sliders') > C.delayOf('run'));
  assert.ok(C.delayOf('unknown') > 0);
});
ok('only slider values changed: live (the preview shows before itself), with the values to swap', () => {
  const B = snap([L('a', 'tweak({ k: 1 })')], { a: { k: 3, c: '#ff0000' } });
  const c = C.compare(A, B);
  assert.strictEqual(c.same, false); assert.strictEqual(c.mode, 'live'); assert.strictEqual(c.vals, 1);
  const sw = C.swapValues(B, A); // now = B, show A
  assert.deepStrictEqual(sw.go, { a: { k: 1 } });
  assert.deepStrictEqual(sw.back, { a: { k: 3 } });
});
ok('the palette alone is live too', () => {
  const c = C.compare(A, snap(A.st.layers, A.full, ['#123456']));
  assert.strictEqual(c.mode, 'live'); assert.ok(c.palette);
});
ok('code, a layer added / removed or its props changed: a picture (still)', () => {
  assert.strictEqual(C.compare(A, snap([L('a', 'tweak({ k: 2 })')], A.full)).mode, 'still');
  assert.strictEqual(C.compare(A, snap([L('a', 'tweak({ k: 1 })'), L('b', '')], { ...A.full, b: {} })).mode, 'still');
  assert.strictEqual(C.compare(A, snap([L('a', 'tweak({ k: 1 })', { opacity: 0.5 })], A.full)).mode, 'still');
});
ok('nothing that shows changed: no pair (a rename, the label color, the selection, another scene)', () => {
  assert.ok(C.compare(A, snap([L('a', 'tweak({ k: 1 })', { name: 'Renamed', color: '#0f0' })], A.full)).same);
  assert.ok(C.compare(A, { ...A, st: { ...A.st, sel: 'zzz' } }).same);
  assert.ok(C.compare(A, snap(A.st.layers, { a: { k: 5 } }, null, 's2')).same);
  assert.ok(C.compare(null, A).same);
});
ok('a slider only one side has (code changed its sliders) is not a value to swap', () => {
  const B = snap([L('a', 'x')], { a: { k: 1, extra: 4 } });
  assert.deepStrictEqual(C.valueDiff(A, B), {});
  assert.deepStrictEqual(C.valueDiff(B, A), {});
});
ok('the chip\'s words: "Before: Director edit · 2 min ago"', () => {
  assert.strictEqual(C.ago(3000), 'just now');
  assert.strictEqual(C.ago(42000), '42 s ago');
  assert.strictEqual(C.ago(125000), '2 min ago');
  assert.strictEqual(C.ago(2 * 3600e3), '2 h ago');
  assert.strictEqual(C.chipText({ label: 'Director edit', at: 1000 }, 1000 + 120000), 'Before: Director edit · 2 min ago');
  assert.strictEqual(C.chipText(null), '');
});
ok('B: a quick press is a tap (split view), a longer one a hold (before while held)', () => {
  assert.ok(C.isTap(0, 120)); assert.ok(!C.isTap(0, C.TAP_MS + 1));
});
ok('the split line: clamped, the before side clipped left of it (right of it when swapped)', () => {
  assert.strictEqual(C.clampSplit(-1), 0.02); assert.strictEqual(C.clampSplit(2), 0.98); assert.strictEqual(C.clampSplit(NaN), 0.5);
  assert.strictEqual(C.clipFor(0.25, false), 'inset(0 75% 0 0)');
  assert.strictEqual(C.clipFor(0.25, true), 'inset(0 0 0 25%)');
});
ok('the picture size follows the frame\'s pixels, 160–1280 px', () => {
  assert.strictEqual(C.shotSize(640, 360, 2), 1280);
  assert.strictEqual(C.shotSize(400, 300, 1), 400);
  assert.strictEqual(C.shotSize(0, 0, 1), 160);
});
console.log(`${n} tests${process.exitCode ? ' (some failed)' : ', all pass'}`);
