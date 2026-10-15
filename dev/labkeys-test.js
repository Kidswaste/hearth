// Node tests for ◆ Keyframes you can see and shape (round 46, labkeys): the 'bezier' ease (two handles, solved like
// CSS cubic-bezier), the preview page's evaluator giving the very same values as the Lab's for every ease (renders
// match the preview), and the multi-keyframe edits (move several in time, Alt copies, copy / paste to another time or
// layer, an ease on several at once) in tools/three-layers.js.
//   node dev/labkeys-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// eslint-disable-next-line no-new-func
const TL = new Function(`${read('tools/three-layers.js')}; return ThreeLayers;`)();
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const near = (a, b, eps = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≠ ${b}`);

// the preview page's evaluator (tools/three-sandbox.html), cut out as it is: mixColor, EASE_FN, bezierAt, evalKeys
const html = read('tools/three-sandbox.html');
const cut = (from, to) => { const a = html.indexOf(from); const b = html.indexOf(to, a); assert.ok(a >= 0 && b > a, `cut ${from}`); return html.slice(a, b); };
// eslint-disable-next-line no-new-func
const SB = new Function(`${cut('const mixColor = ', 'const songTime = ')}; return { evalKeys, bezierAt };`)();

ok('bezier: the handles of linear give a straight line; ends at 0 and 1', () => {
  for (const u of [0, 0.1, 0.37, 0.5, 0.9, 1]) near(TL.bezierAt([0.3, 0.3, 0.7, 0.7], u), u, 1e-6, `u=${u}`);
  near(TL.bezierAt([0.42, 0, 0.58, 1], 0), 0); near(TL.bezierAt([0.42, 0, 0.58, 1], 1), 1, 1e-9);
});
ok('bezier: CSS "ease-in-out" (0.42, 0, 0.58, 1) is symmetric and slow at the ends', () => {
  const b = [0.42, 0, 0.58, 1];
  near(TL.bezierAt(b, 0.5), 0.5, 1e-6);
  for (const u of [0.1, 0.25, 0.4]) near(TL.bezierAt(b, u) + TL.bezierAt(b, 1 - u), 1, 1e-6);
  assert.ok(TL.bezierAt(b, 0.1) < 0.03);
});
ok('bezier: handles above 1 overshoot (a back-out), steep x handles still solve (no NaN)', () => {
  const b = [0.3, 1.6, 0.6, 1];
  assert.ok(Math.max(...[0.5, 0.6, 0.7, 0.8].map((u) => TL.bezierAt(b, u))) > 1.05);
  for (const bb of [[0, 1, 0, 1], [1, 0, 1, 0], [0.999, -0.5, 0.001, 1.5]]) for (let u = 0; u <= 1; u += 0.05) assert.ok(Number.isFinite(TL.bezierAt(bb, u)), `${bb} ${u}`);
});
ok('a key with ease "bezier" moves along its curve (numbers and colors)', () => {
  const keys = [{ t: 2, v: 0, ease: 'bezier', b: [0.42, 0, 0.58, 1] }, { t: 4, v: 10, ease: 'linear' }];
  near(TL.evalKeys(keys, 3, 0), 5, 1e-5);
  near(TL.evalKeys(keys, 2.5, 0), 10 * TL.bezierAt([0.42, 0, 0.58, 1], 0.25), 1e-9);
  const ck = [{ t: 0, v: '#000000', ease: 'bezier', b: [0.42, 0, 0.58, 1] }, { t: 1, v: '#ffffff' }];
  assert.strictEqual(TL.evalKeys(ck, 0.5, '#000000'), '#808080');
});
ok('the preview page evaluates every ease exactly like the Lab (frame for frame: same numbers)', () => {
  const eases = ['linear', 'ease', 'hold', 'in', 'out', 'bounce', 'inOut', 'backOut', 'elastic', 'steps4'];
  const bs = [[0.42, 0, 0.58, 1], [0.1, 0.65, 0.45, 1], [0.3, 1.6, 0.6, 1], [0.9, -0.4, 0.2, 1.3]];
  let checked = 0;
  for (const ease of [...eases, ...bs.map((b) => ({ ease: 'bezier', b })), { ease: 'curve', c: 0.5 }, { ease: 'curve', c: -0.7 }]) {
    const a = typeof ease === 'string' ? { ease } : ease;
    const keys = [{ t: 1, v: -3, ...a }, { t: 3.5, v: 7, ...a }, { t: 5, v: 2, ease: 'linear' }];
    for (let f = 0; f <= 6 * 60; f += 1) { const t = f / 60; assert.strictEqual(SB.evalKeys(keys, t, 0), TL.evalKeys(keys, t, 0), `${JSON.stringify(a)} @ ${t}`); checked += 1; }
  }
  assert.ok(checked > 5000);
  for (let u = 0; u <= 1; u += 0.01) assert.strictEqual(SB.bezierAt([0.2, 1.4, 0.7, -0.2], u), TL.bezierAt([0.2, 1.4, 0.7, -0.2], u));
});
const layer = () => ({
  opacity: [{ t: 1, v: 0, ease: 'ease' }, { t: 2, v: 1, ease: 'ease' }],
  's:glow': [{ t: 1, v: 0.2, ease: 'linear' }, { t: 2, v: 1.5, ease: 'hold' }, { t: 3, v: 0.4, ease: 'ease' }],
});
ok('move several keyframes in time: every setting keyed at those times goes along; the others stay', () => {
  const out = TL.shiftKeysAt(layer(), [1, 2], 0.5);
  assert.deepStrictEqual(out.opacity.map((k) => k.t), [1.5, 2.5]);
  assert.deepStrictEqual(out['s:glow'].map((k) => [k.t, k.v]), [[1.5, 0.2], [2.5, 1.5], [3, 0.4]]);
});
ok('a moved keyframe replaces one it lands on; no key leaves the timeline (clamped as a group)', () => {
  const out = TL.shiftKeysAt(layer(), [2], 1);
  assert.deepStrictEqual(out['s:glow'].map((k) => [k.t, k.v]), [[1, 0.2], [3, 1.5]]);
  const back = TL.shiftKeysAt(layer(), [1, 2], -5);
  assert.deepStrictEqual(back.opacity.map((k) => k.t), [0, 1]);
  const late = TL.shiftKeysAt(layer(), [3], 9, { hi: 4 });
  assert.deepStrictEqual(late['s:glow'].map((k) => k.t), [1, 2, 4]);
});
ok('Alt copies: the originals stay, the copies land later with their eases', () => {
  const out = TL.shiftKeysAt(layer(), [1, 2], 4, { copy: true });
  assert.deepStrictEqual(out.opacity.map((k) => k.t), [1, 2, 5, 6]);
  assert.deepStrictEqual(out['s:glow'].map((k) => `${k.t}:${k.ease}`), ['1:linear', '2:hold', '3:ease', '5:linear', '6:hold']);
});
ok('copy / paste: at another time, and onto another layer (only the settings it has)', () => {
  const clip = TL.copyKeysAt(layer(), [2, 3]);
  assert.strictEqual(clip.span, 1);
  assert.deepStrictEqual(Object.keys(clip.props).sort(), ['opacity', 's:glow']);
  const same = TL.pasteKeys(layer(), clip, 6);
  assert.deepStrictEqual(same['s:glow'].map((k) => k.t), [1, 2, 3, 6, 7]);
  assert.deepStrictEqual(same.opacity.map((k) => [k.t, k.v]), [[1, 0], [2, 1], [6, 1]]);
  const other = TL.pasteKeys({ scale: [{ t: 0, v: 1 }] }, clip, 0.5, (p) => p !== 's:glow');
  assert.deepStrictEqual(Object.keys(other).sort(), ['opacity', 'scale']);
  assert.deepStrictEqual(other.opacity, [{ v: 1, ease: 'ease', t: 0.5 }]);
  const over = TL.pasteKeys(layer(), TL.copyKeysAt(layer(), [1]), 3);
  assert.deepStrictEqual(over['s:glow'].find((k) => k.t === 3), { v: 0.2, ease: 'linear', t: 3 }, 'a pasted key replaces the one at its time');
});
ok('an ease on several keyframes at once; "bezier" keeps its two handles, other eases drop old shapes', () => {
  const base = layer(); base.opacity[0] = { ...base.opacity[0], ease: 'curve', c: 0.4 };
  const out = TL.easeKeysAt(base, [1], 'bezier', [0.1, 0.65, 0.45, 1]);
  assert.deepStrictEqual(out.opacity[0], { t: 1, v: 0, ease: 'bezier', b: [0.1, 0.65, 0.45, 1] });
  assert.strictEqual(out['s:glow'][0].ease, 'bezier');
  assert.strictEqual(out['s:glow'][1].ease, 'hold', 'not at that time: as it was');
  const back = TL.easeKeysAt(out, [1], 'bounce');
  assert.deepStrictEqual(back.opacity[0], { t: 1, v: 0, ease: 'bounce' });
  assert.strictEqual(base.opacity[0].c, 0.4, 'the input is not changed');
});

console.log(`${n}/10 passed`);
