// Node tests for 🎥 Camera moves (tools/three-camera-core.js): every preset's curve as a function of the time alone
// (the same offset whatever was computed before, at any frame rate: renders match), the easing presets, moves in
// sequence adding up, a punch-in on the kick / bar from hit times, the handheld shake (subtle, repeatable, no jolt at
// its ends), a whip there and back, views from / to, dragging an end, the range a new move gets, a sequence clip's
// shift, typed words, cleaning a saved move, and the source the preview page runs.
//   node dev/labcamera-test.js
const assert = require('assert');
const C = require('../tools/three-camera-core.js');
let n = 0; const TOTAL = 16;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const near = (a, b, eps = 1e-9, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≠ ${b}`);
const at = (moves, t, o) => C.at(moves, t, o) || C.zero();

ok('easing presets: 0 → 0, 1 → 1, monotonic (snap overshoots a little), smooth / cine symmetric', () => {
  for (const e of C.EASES) {
    near(C.ease(e.id, 0), 0, 1e-12, e.id); near(C.ease(e.id, 1), 1, 1e-12, e.id);
    if (e.id !== 'snap') for (let i = 1; i <= 100; i += 1) assert.ok(C.ease(e.id, i / 100) >= C.ease(e.id, (i - 1) / 100) - 1e-12, `${e.id} not monotonic`);
  }
  assert.ok(Math.max(...Array.from({ length: 101 }, (_, i) => C.ease('snap', i / 100))) > 1, 'snap overshoots');
  near(C.ease('smooth', 0.5), 0.5, 1e-12); near(C.ease('cine', 0.5), 0.5, 1e-12);
  near(C.ease('smooth', 0.3) + C.ease('smooth', 0.7), 1, 1e-12);
  assert.ok(C.ease('in', 0.3) < 0.3 && C.ease('out', 0.3) > 0.3);
});

ok('push in / pull out: closer / further, eased, held after the range, nothing before', () => {
  const p = C.make('push', { t0: 2, t1: 6 });
  assert.strictEqual(C.at([p], 1.9), null, 'before: the scene’s camera');
  near(at([p], 2).s, 1);
  near(at([p], 4).s, Math.exp(-0.55 * 0.5), 1e-12, 'middle (smooth = 0.5)');
  near(at([p], 6).s, Math.exp(-0.55), 1e-12); near(at([p], 60).s, Math.exp(-0.55), 1e-12, 'held');
  const q = C.make('pull', { t0: 2, t1: 6, amt: 2 });
  near(at([q], 6).s, Math.exp(1.1), 1e-12, 'intensity 200 %');
  assert.ok(at([q], 3).s > 1 && at([q], 3).s < at([q], 5).s);
});

ok('several moves in sequence add up: push in 0–4 then pull out 4–8 comes back; orbit + push compose', () => {
  const a = C.make('push', { t0: 0, t1: 4 }); const b = C.make('pull', { t0: 4, t1: 8 });
  near(at([a, b], 4).s, Math.exp(-0.55), 1e-12);
  assert.strictEqual(C.at([a, b], 8), null, 'back to the scene’s camera');
  const o = C.make('orbit', { t0: 0, t1: 8, dir: -1, turns: 0.5, ease: 'linear' });
  const O = at([a, o], 2);
  near(O.yaw, -0.5 * 2 * Math.PI * 0.25, 1e-12, 'orbit left ½ at a quarter (linear)');
  near(O.s, Math.exp(-0.55 * 0.5), 1e-12);
});

ok('orbit ¼ / ½ / full, left and right, intensity scales the angle', () => {
  for (const [turns, dir] of [[0.25, 1], [0.5, -1], [1, 1]]) near(at([C.make('orbit', { t0: 0, t1: 1, turns, dir })], 1).yaw, dir * turns * 2 * Math.PI, 1e-12);
  near(at([C.make('orbit', { t0: 0, t1: 1, turns: 0.25, amt: 0.5 })], 1).yaw, 0.25 * Math.PI, 1e-12);
});

ok('dolly zoom: the distance and the lens move together (s × tan factor = 1: the subject keeps its size)', () => {
  for (const dir of [1, -1]) {
    const m = C.make('dolly', { t0: 0, t1: 3, dir });
    for (const t of [0.5, 1.5, 3, 9]) { const O = at([m], t); near(O.s * O.tk, 1, 1e-12, `t ${t}`); }
    assert.ok(dir > 0 ? at([m], 3).s > 1 : at([m], 3).s < 1);
  }
});

ok('crane up rises (the turn is up over the subject), crane down the other way; drift is slow and small', () => {
  assert.ok(at([C.make('crane', { t0: 0, t1: 1, dir: 1 })], 1).pitch < 0);
  assert.ok(at([C.make('crane', { t0: 0, t1: 1, dir: -1 })], 1).pitch > 0);
  const d = at([C.make('drift', { t0: 0, t1: 10 })], 10);
  assert.ok(Math.abs(d.yaw) < 0.2 && Math.abs(d.pitch) < 0.1 && d.s > 0.9);
});

ok('handheld shake: subtle (< 1.5° at 100 %), repeatable, starts and ends at rest, none outside its range', () => {
  const m = C.make('shake', { t0: 1, t1: 5, seed: 3 });
  let mx = 0;
  for (let i = 0; i <= 960; i += 1) { const t = 1 + i / 240; const O = at([m], t); mx = Math.max(mx, Math.abs(O.lyaw), Math.abs(O.lpitch), Math.abs(O.roll)); }
  assert.ok(mx > 0.002 && mx < (1.5 * Math.PI) / 180, `max ${mx}`);
  assert.deepStrictEqual(at([m], 2.37), at([m], 2.37));
  assert.strictEqual(C.at([m], 1), null); assert.strictEqual(C.at([m], 5), null); assert.strictEqual(C.at([m], 7), null);
  const other = C.make('shake', { t0: 1, t1: 5, seed: 4 });
  assert.notStrictEqual(at([m], 2.37).lyaw, at([other], 2.37).lyaw, 'another seed, another wobble');
});

ok('whip pan: swings out to ~63° and back, fast in the middle of each half', () => {
  const m = C.make('whip', { t0: 0, t1: 1, dir: 1 });
  near(at([m], 0.5).lyaw, -1.1, 1e-9, 'out at the middle (right: a negative turn)');
  assert.strictEqual(C.at([m], 1), null); assert.strictEqual(C.at([m], 1.2), null);
  assert.ok(Math.abs(at([m], 0.25).lyaw - (-0.55)) < 1e-6, 'halfway out at a quarter');
  assert.ok(Math.abs(at([m], 0.05).lyaw) < 0.01, 'slow start');
});

ok('punch-in on the kick: a quick push on each hit (up in 30 ms, back over ~0.2 s), only inside its range', () => {
  const kicks = [0.5, 1, 1.5, 2, 2.5, 3, 3.5];
  const since = C.sinceOf(kicks);
  const m = C.make('punch', { t0: 1, t1: 3, band: 'kick' });
  const S = (t) => at([m], t, { since: () => since(t) }).s;
  near(S(1.03), Math.exp(-0.14), 1e-12, 'peak 30 ms after the kick');
  assert.ok(S(1.01) < 1 && S(1.01) > S(1.03), 'rising');
  assert.ok(S(1.4) > 0.98, 'nearly back before the next kick');
  near(S(0.53), 1, 1e-12, 'before its range: nothing');
  near(S(3.53), 1, 1e-12, 'after its range: nothing');
  // the same time → the same value, whatever order it is asked in (renders match)
  const ts = Array.from({ length: 200 }, (_, i) => 1 + i * 0.01);
  const fwd = ts.map(S); const back = ts.slice().reverse().map(S).reverse();
  assert.deepStrictEqual(fwd, back);
  // on each bar (every 4th beat): only the bars punch
  const bars = C.sinceOf([0.5, 2.5]);
  const mb = C.make('punch', { t0: 0, t1: 4, band: 'bar' });
  assert.ok(at([mb], 2.53, { since: () => bars(2.53) }).s < 0.9 && at([mb], 1.53, { since: () => bars(1.53) }).s > 0.999);
  assert.strictEqual(C.make('punch', { band: 'nope' }).band, 'kick');
});

ok('frame-rate independent and smooth: the same offset at 60 / 240 Hz sample times; no jump between 240 Hz frames', () => {
  const moves = [C.make('push', { t0: 0, t1: 4, ease: 'cine' }), C.make('orbit', { t0: 1, t1: 5, turns: 0.5 }), C.make('drift', { t0: 0, t1: 8 }), C.make('shake', { t0: 2, t1: 6 })];
  for (let f = 0; f <= 60 * 8; f += 1) { const t = f / 60; assert.deepStrictEqual(at(moves, t), at(moves, (f * 4) / 240)); }
  let maxStep = 0;
  for (let f = 1; f <= 240 * 8; f += 1) { const a = at(moves, (f - 1) / 240); const b = at(moves, f / 240); maxStep = Math.max(maxStep, Math.abs(b.yaw - a.yaw), Math.abs(Math.log(b.s / a.s)), Math.abs(b.lyaw - a.lyaw)); }
  assert.ok(maxStep < 0.01, `largest step between frames ${maxStep}`);
});

ok('from this view to that view: starts on the start view, lands on the end view (distance eased in log space)', () => {
  const m = C.make('views', { t0: 1, t1: 3, from: { yaw: 0.2, s: 2 }, to: { yaw: -0.4, pitch: -0.1, s: 0.5, px: 1 } });
  assert.strictEqual(m.ease, 'cine');
  near(at([m], 0).yaw, 0.2, 1e-12, 'held on the start before'); near(at([m], 0).s, 2, 1e-12);
  near(at([m], 3).yaw, -0.4, 1e-12); near(at([m], 3).pitch, -0.1, 1e-12); near(at([m], 3).s, 0.5, 1e-12); near(at([m], 3).px, 1, 1e-12);
  near(at([m], 2).s, 1, 1e-12, 'halfway between 2 and 0.5 in log space');
  assert.strictEqual(C.at([C.make('views', { t0: 0, t1: 1 })], 0.5), null, 'no views: nothing moves');
});

ok('dragging an end: kept inside the scene and at least 0.1 s long; the whole bar keeps its length', () => {
  const m = C.make('push', { t0: 2, t1: 6 });
  assert.deepStrictEqual([C.moveEdge(m, 'a', 3).t0, C.moveEdge(m, 'a', 3).t1], [3, 6]);
  assert.strictEqual(C.moveEdge(m, 'a', 9).t0, 5.9);
  assert.strictEqual(C.moveEdge(m, 'b', 20, { len: 10 }).t1, 10);
  assert.strictEqual(C.moveEdge(m, 'b', 1).t1, 2.1);
  const w = C.moveEdge(m, 'both', 5, { len: 10, from: 2 }); assert.deepStrictEqual([w.t0, w.t1], [6, 10]);
  const w2 = C.moveEdge(m, 'both', -9, { len: 10, from: 2 }); assert.deepStrictEqual([w2.t0, w2.t1], [0, 4]);
});

ok('where a new move goes: the whole scene, the loop, 4 bars from the playhead, right after the last one', () => {
  assert.deepStrictEqual(C.rangeFor('whole', { len: 30 }), [0, 30]);
  assert.deepStrictEqual(C.rangeFor('loop', { len: 30, loop: { a: 4, b: 12 } }), [4, 12]);
  assert.deepStrictEqual(C.rangeFor('here', { len: 30, now: 5, bar: 2 }), [5, 13]);
  assert.deepStrictEqual(C.rangeFor('after', { len: 30, bar: 2, moves: [{ t0: 0, t1: 10 }] }), [10, 18]);
  assert.deepStrictEqual(C.rangeFor('after', { len: 10, bar: 2, moves: [{ t0: 0, t1: 10 }] }), [0, 10], 'no room after: the whole scene');
});

ok('a sequence clip: times shifted with the clip and its speed; saved moves cleaned (junk dropped)', () => {
  const ms = C.shift([C.make('push', { t0: 2, t1: 6 })], 10, 2);
  assert.deepStrictEqual([ms[0].t0, ms[0].t1], [11, 13]);
  const cl = C.cleanAll([{ kind: 'push', t0: 1, t1: 3, amt: 9 }, { kind: 'nope' }, null, { kind: 'orbit', turns: 7 }]);
  assert.strictEqual(cl.length, 2); assert.strictEqual(cl[0].amt, 2); assert.strictEqual(cl[1].turns, 0.25);
});

ok('typed words → a move', () => {
  const p = (s) => C.parse(s);
  assert.strictEqual(p('push in').kind, 'push');
  assert.strictEqual(p('pull out slowly').kind, 'pull');
  assert.deepStrictEqual([p('orbit left half').kind, p('orbit left half').dir, p('orbit left half').turns], ['orbit', -1, 0.5]);
  assert.strictEqual(p('orbit full turn').turns, 1);
  assert.deepStrictEqual([p('dolly zoom').kind, p('vertigo in').dir], ['dolly', -1]);
  assert.deepStrictEqual([p('crane down').kind, p('crane down').dir], ['crane', -1]);
  assert.strictEqual(p('handheld shake').kind, 'shake');
  assert.strictEqual(p('whip pan right').kind, 'whip');
  assert.strictEqual(p('slow drift').kind, 'drift');
  assert.deepStrictEqual([p('punch in on each bar').kind, p('punch in on each bar').band], ['punch', 'bar']);
  assert.strictEqual(p('punch-in on the kick').band, 'kick');
  assert.strictEqual(p('from this view to that view').kind, 'views');
  const q = p('push in cine 60% here'); assert.deepStrictEqual([q.ease, q.amt, q.when], ['cine', 0.6, 'here']);
  const r = p('orbit right 2s to 8s'); assert.deepStrictEqual([r.t0, r.t1], [2, 8]);
  assert.strictEqual(p('banana').kind, null);
});

ok('the preview page’s copy (the factory as source) gives the same offsets; names read plainly', () => {
  const code = String(globalThis.__sbxLibFn?.camcore || `function () { globalThis.camcore = (${C.factory})(); }`);
  // eslint-disable-next-line no-new-func
  new Function(`(${code})();`)();
  const K = globalThis.camcore;
  const moves = [C.make('push', { t0: 0, t1: 4 }), C.make('orbit', { t0: 1, t1: 5, dir: -1, turns: 1 }), C.make('shake', { t0: 0, t1: 6 })];
  for (const t of [0.3, 1.7, 2.9, 4.4]) assert.deepStrictEqual(K.at(moves, t), C.at(moves, t));
  assert.strictEqual(C.name(C.make('orbit', { dir: -1, turns: 0.5 })), 'Orbit left ½');
  assert.strictEqual(C.name(C.make('punch', { band: 'bar' })), 'Punch-in on each bar');
  assert.ok(/Push in · 0:02\.0–0:06\.0 · Smooth/.test(C.describe(C.make('push', { t0: 2, t1: 6 }))));
});

console.log(`${n}/${TOTAL} passed`);
if (n !== TOTAL) process.exitCode = 1;
