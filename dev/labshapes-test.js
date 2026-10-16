// Node tests for ◆ Shapes that draw themselves (tools/three-shape-core.js + the code tools/three-shapes.js writes): every
// preset's path, how far a line has drawn at given times (in pixels of a 1080 frame), the Start / End sliders, reverse,
// offset across the end, on each hit (from the time alone), dashes, rounded corners, draw your own (sharp and smooth
// points), the taper, the layer code and its in-place edits, and the source the preview page runs.
//   node dev/labshapes-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../tools/three-shape-core.js');
let n = 0; const TOTAL = 11;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const PX = 540; // (units → pixels of a 1080-pixel shorter side)
const near = (a, b, e, what) => assert.ok(Math.abs(a - b) <= e, `${what}: ${a} vs ${b}`);

ok('every preset makes a path: segments, a length, closed parts end where they start', () => {
  const custom = { points: [[-0.5, 0], [0, 0.5, 1], [0.5, 0]], closed: false };
  for (const p of C.PRESETS) {
    const P = C.build(p.id, p.v, custom);
    assert.ok(P.subs.length >= 1 && P.n >= 2 && P.L > 0.1, `${p.id}: ${P.n} points, ${P.L}`);
    for (let i = 0; i < P.n; i += 1) assert.ok(Number.isFinite(P.x[i]) && Number.isFinite(P.y[i]) && Number.isFinite(P.s[i]), `${p.id} point ${i}`);
    for (const [i0, k, closed] of P.subs) if (closed) { near(P.x[i0], P.x[i0 + k - 1], 1e-6, `${p.id} closes x`); near(P.y[i0], P.y[i0 + k - 1], 1e-6, `${p.id} closes y`); }
    near(P.s[P.n - 1], P.L, 1e-6, `${p.id} arc length`);
  }
  assert.strictEqual(new Set(C.PRESETS.map((p) => p.id)).size, C.PRESETS.length);
  assert.ok(C.PRESETS.length >= 21);
});
ok('a line 1.2 units long drawing on in 1 s (linear): pixels drawn at 0, 0.25, 0.5, 1, 2 s', () => {
  const v = { ...C.preset('line').v, ease: 'linear', dur: 1, delay: 0, w: 0.6 };
  const P = C.build('line', v);
  const at = (t) => C.drawnLength(P, C.trim(v, t, null), null) * PX;
  near(at(0), 0, 1e-6, 't 0'); near(at(0.25), 0.25 * 1.2 * PX, 0.01, 't .25'); near(at(0.5), 324, 0.01, 't .5'); near(at(1), 648, 0.01, 't 1'); near(at(2), 648, 0.01, 't 2');
  const v2 = { ...v, delay: 3 }; near(C.drawnLength(P, C.trim(v2, 3.5, null), null) * PX, 324, 0.01, 'delay 3, t 3.5');
  const v3 = { ...v, ease: 'smooth' }; near(C.drawnLength(P, C.trim(v3, 0.5, null), null) * PX, 324, 0.01, 'smooth halfway'); assert.ok(C.drawnLength(P, C.trim(v3, 0.25, null), null) * PX < 0.25 * 648, 'smooth starts slow');
});
ok('draws off, on then off, loop, reverse, Start / End sliders', () => {
  const v = { ...C.preset('line').v, ease: 'linear', dur: 1, hold: 0.5 };
  const tr = (o, t) => C.trim({ ...v, ...o }, t, null);
  let x = tr({ drawOn: 'out' }, 0.25); near(x.a0, 0.25, 1e-9, 'out a'); near(x.b0, 1, 1e-9, 'out b');
  x = tr({ drawOn: 'inout' }, 1.2); near(x.vis, 1, 1e-9, 'held'); x = tr({ drawOn: 'inout' }, 2); near(x.a0, 0.5, 1e-9, 'erasing from the start'); near(x.b0, 1, 1e-9, 'end stays');
  x = tr({ drawOn: 'loop' }, 3 + 0.25); near(x.b0, 0.25, 1e-9, 'loop again'); // (period 2 × 1 + 2 × 0.5 = 3)
  x = tr({ drawOn: 'in', reverse: true }, 0.25); near(x.a0, 0.75, 1e-9, 'reverse starts at the end'); near(x.b0, 1, 1e-9, 'reverse');
  x = tr({ drawOn: 'off', trimStart: 0.2, trimEnd: 0.7 }, 99); near(x.a0, 0.2, 1e-9, 'start'); near(x.b0, 0.7, 1e-9, 'end'); near(x.vis, 0.5, 1e-9, 'vis');
  x = tr({ drawOn: 'off', trimStart: 0.8, trimEnd: 0.3 }, 0); near(x.a0, 0.3, 1e-9, 'swapped');
  assert.strictEqual(tr({ drawOn: 'in' }, 0.5).fillK, 0); assert.strictEqual(tr({ drawOn: 'in' }, 2).fillK, 1); assert.strictEqual(tr({ drawOn: 'in', fillIn: false }, 0).fillK, 1);
});
ok('offset past the end splits the drawn part in two, the same amount drawn', () => {
  const v = { ...C.preset('circle').v, drawOn: 'off', trimStart: 0, trimEnd: 0.4, offset: 0.8 };
  const x = C.trim(v, 0, null); near(x.a0, 0.8, 1e-9, 'a0'); near(x.b0, 1, 1e-9, 'b0'); near(x.a1, 0, 1e-9, 'a1'); near(x.b1, 0.2, 1e-9, 'b1');
  const P = C.build('circle', v); near(C.drawnLength(P, x, null), 0.4 * P.L, 1e-4, 'drawn');
});
ok('on each hit: nothing before the first, drawn again from each hit, a function of the time alone', () => {
  const hits = [0.4, 1.1, 1.5, 2.6]; const hit = (t) => { let k = -1; for (let i = 0; i < hits.length; i++) if (hits[i] <= t) k = i; return k < 0 ? null : { k, at: hits[k], prev: k ? hits[k - 1] : null, next: hits[k + 1] ?? hits[k] + 0.5 }; };
  const v = { ...C.preset('check').v, drawOn: 'kick', dur: 0.2, ease: 'linear' };
  assert.strictEqual(C.trim(v, 0.3, hit).vis, 0);
  for (const h of hits) { near(C.trim(v, h + 0.1, hit).b0, 0.5, 1e-9, `half drawn 0.1 s after ${h}`); near(C.trim(v, h + 0.005, hit).b0, 0.025, 1e-9, `starts again at ${h}`); }
  const ts = [2.7, 0.45, 1.6, 1.2, 2.7, 0.45]; const a = ts.map((t) => C.trim(v, t, hit).b0); assert.deepStrictEqual(a.slice(0, 2), a.slice(4));
  const beat = C.DEMO_HITS.beat; near(C.trim({ ...v, drawOn: 'beat' }, 10.1, beat).b0, 0.5, 1e-9, 'demo beat');
});
ok('dashes: 20 px on, 20 px off ≈ half the line; marching moves them', () => {
  const v = { ...C.preset('line').v, drawOn: 'off', dash: 20, gap: 20, w: 0.6 };
  const P = C.build('line', v); const tr = C.trim(v, 0, null);
  const d = C.dashOf(v, 0); near(d[0] * PX, 20, 1e-9, 'dash: 20 px of a 1080 frame');
  const half = C.drawnLength(P, tr, d) / P.L; assert.ok(half > 0.45 && half < 0.55, `drawn ${half}`);
  let pieces = 0; C.runs(P, [0, P.L, 1, 0], d, () => { pieces += 1; }); assert.ok(pieces >= 16 && pieces <= 18, `pieces ${pieces}`);
  const m = C.dashOf({ ...v, march: 40 }, 0.5); near(m[2] / C.PX, 20, 1e-6, 'march 40 px/s × 0.5 s');
});
ok('rounded corners: shorter than the box, longer than the ellipse; zero roundness = the sharp box', () => {
  const base = { w: 0.6, h: 0.4 };
  const sharp = C.build('rect', { ...base, round: 0 }).L; const soft = C.build('rect', { ...base, round: 1 }).L; const ell = C.build('circle', base).L;
  near(sharp, 4, 1e-6, 'box perimeter'); assert.ok(soft < sharp - 0.1 && soft > ell, `${soft} between ${ell} and ${sharp}`);
});
ok('draw your own: sharp points are kept, smooth ones are passed through', () => {
  const pts = [[-0.6, 0], [-0.2, 0.4], [0.2, -0.4, 1], [0.6, 0]];
  const P = C.build('custom', { w: 1, h: 1, round: 0 }, { points: pts, closed: false });
  for (const [x, y] of pts) { let best = 9; for (let i = 0; i < P.n; i++) best = Math.min(best, Math.hypot(P.x[i] - x, P.y[i] - y)); assert.ok(best < 1e-6, `through ${x},${y}: ${best}`); }
  assert.ok(P.n > 12, 'smooth parts are curves'); // (straight into / out of the sharp point)
  const i2 = [...Array(P.n).keys()].find((i) => Math.abs(P.x[i] - 0.2) < 1e-6 && Math.abs(P.y[i] + 0.4) < 1e-6);
  near(P.x[i2 + 1], 0.6, 1e-6, 'a straight line out of the sharp point');
  const Q = C.build('custom', { w: 0.5, h: 0.5 }, { points: [[0, 1], [1, -1], [-1, -1]], closed: true });
  assert.ok(Q.subs[0][2] === true && Math.abs(Q.y[0] - 0.5) < 1e-6, 'closed, scaled by Width / Height');
});
ok('thin ends (taper): the swoosh is thin at its ends, full in the middle', () => {
  const P = C.build('swoosh', C.preset('swoosh').v);
  assert.ok(P.rw[0] < 0.2 && P.rw[P.n - 1] < 0.2, 'ends'); assert.ok(Math.max(...P.rw.slice(0, P.n)) > 0.98, 'middle');
  const Q = C.build('line', C.preset('line').v); assert.ok(Q.rw[0] === 1 && Q.rw[1] === 1, 'no taper');
});
ok('the layer code: every preset parses, its sliders and shapeLayer options; edits keep the rest', () => {
  const src = fs.readFileSync(path.join(__dirname, '../tools/three-shapes.js'), 'utf8');
  const S = new Function('ShapeCore', 'window', `${src}; return LabShapes;`)(C, {});
  for (const p of C.PRESETS) {
    const code = S.codeFor(p, { drawOn: 'kick' }, p.id === 'custom' ? { points: [[0, 0], [0.5, 0.5, 1]], closed: false } : null);
    let got = null; new Function('tweak', 'shapeLayer', code)((spec) => spec, (P, o) => { got = { P, o }; });
    assert.ok(got && got.o.preset === p.id && got.P.drawOn.value === 'kick' && got.P.width.value === p.v.width, p.id);
    for (const k of p.keys) assert.ok(got.P[k] && got.P[k].group === 'Shape', `${p.id} ${k}`);
    if (p.id === 'custom') assert.deepStrictEqual(got.o.points, [[0, 0], [0.5, 0.5, 1]]);
  }
  let code = S.codeFor(C.preset('star'));
  code = S.setValue(code, 'reverse', true); code = S.setValue(code, 'width', 22.5); code = S.setValue(code, 'stroke', '#ff3366'); code = S.setValue(code, 'drawOn', 'loop');
  assert.strictEqual(S.getValue(code, 'reverse'), true); assert.strictEqual(S.getValue(code, 'width'), 22.5); assert.strictEqual(S.getValue(code, 'stroke'), '#ff3366'); assert.strictEqual(S.getValue(code, 'drawOn'), 'loop');
  assert.strictEqual(S.getValue(code, 'sides'), 5); assert.strictEqual(S.presetOf(code).id, 'star');
  assert.strictEqual(S.values(C.preset('line'), { filled: true }).fillA, 1);
});
ok('the page\'s copy of the factory gives the same paths and trims; the shaders declare what they use', () => {
  new Function(`(function () { const F = (${C.factory}); globalThis.shapecore = F(); globalThis.shapecore.factory = String(F); })();`)();
  const G = globalThis.shapecore;
  for (const id of ['star', 'spiral', 'swoosh', 'frame']) { const a = C.build(id, C.preset(id).v); const b = G.build(id, C.preset(id).v); assert.strictEqual(a.n, b.n); assert.deepStrictEqual(Array.from(a.x.slice(0, a.n)), Array.from(b.x.slice(0, b.n))); }
  const v = { ...C.preset('ring').v, drawOn: 'inout' }; assert.deepStrictEqual(C.trim(v, 1.7, null), G.trim(v, 1.7, null));
  for (const u of ['uView', 'uHalf', 'uPx', 'uTrim', 'uDash', 'uColor', 'uAlpha', 'uFringe']) if (new RegExp(`\\b${u}\\b`).test(C.FRAG.replace(/uniform[^;]*;/g, ''))) assert.ok(new RegExp(`uniform [^;]*\\b${u}\\b`).test(C.FRAG), `FRAG declares ${u}`);
  for (const a of ['aA', 'aB', 'aS', 'aR', 'aW']) assert.ok(new RegExp(`in [^;]*\\b${a}\\b`).test(C.VERT), `VERT ${a}`);
});
console.log(`${n}/${TOTAL} passed`);
if (n !== TOTAL) process.exitCode = 1;
