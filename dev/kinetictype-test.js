// Node tests for 🅰 Text that moves (tools/three-kinetic-core.js): the step plan (one step on each hit, every N hits,
// all together, build / one at a time, hold, out, again), the order ranks, the easing, the stagger, the hit effects,
// lyric lines on markers, the presets, and the source the preview page runs (the same numbers).
//   node dev/kinetictype-test.js
const assert = require('assert');
const C = require('../tools/three-kinetic-core.js');
let n = 0; const TOTAL = 16;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const near = (a, b, eps = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≠ ${b}`);

// a fixture "song": beats every 0.5 s from 0.25; kicks off the grid (irregular)
const beats = Array.from({ length: 64 }, (_, i) => 0.25 + i * 0.5);
const kicks = [0.5, 1.0, 1.75, 2.0, 3.25, 3.5, 4.75, 5.0, 6.5, 7.0, 7.25, 9.0];
const beat = C.listHits(beats); const kick = C.listHits(kicks);
const plan = (a) => C.plan(C.newPlan(), { start: 0, nR: 4, every: 1, hold: 0, durFrac: 0.6, ...a });

ok('hits: a steady clock and a sorted list give { k, at, prev, next }; nothing before the first', () => {
  const c = C.clockHits(0.5, 0.2);
  assert.deepStrictEqual(c(1.0), { k: 1, at: 0.7, prev: 0.2, next: 1.2 });
  assert.strictEqual(beat(0.1), null);
  const h = kick(1.9); assert.strictEqual(h.k, 2); near(h.at, 1.75); near(h.prev, 1.0); near(h.next, 2.0);
});
ok('one step on each beat: step r comes in on beat r after the start, the rest not yet', () => {
  const P = plan({ hit: beat, t: 1.3 }); // beats 0.25 0.75 1.25 → steps 0, 1, 2 in; 3 not yet
  near(P.starts[0], 0.25); near(P.starts[1], 0.75); near(P.starts[2], 1.25); assert.strictEqual(P.starts[3], Infinity);
  assert.strictEqual(P.k, 2); assert.strictEqual(P.cur, 2); near(P.dur, 0.3); near(P.phase, 0.1);
  for (let r = 0; r < 4; r += 1) assert.strictEqual(P.outs[r], Infinity, 'hold 0: stays');
});
ok('the start: the first hit at or after it is step 0 (before it nothing is in)', () => {
  const P = plan({ hit: beat, t: 1.3, start: 0.8 }); // first beat ≥ 0.8 is 1.25
  near(P.starts[0], 1.25); assert.strictEqual(P.starts[1], Infinity); assert.strictEqual(P.k, 0);
  const Q = plan({ hit: beat, t: 1.0, start: 0.8 });
  assert.strictEqual(Q.k, -1); assert.ok([...Q.starts.slice(0, 4)].every((x) => x === Infinity));
});
ok('every 2 hits; every 0 = all together on the first hit', () => {
  const P = plan({ hit: beat, t: 2.3, every: 2 }); // beats 0.25 .. 2.25: k=4 → steps 0 (0.25), 1 (1.25), 2 (2.25)
  near(P.starts[1], 1.25); near(P.starts[2], 2.25); assert.strictEqual(P.starts[3], Infinity);
  const Q = plan({ hit: beat, t: 2.3, every: 0 });
  assert.ok([0, 1, 2, 3].every((r) => Math.abs(Q.starts[r] - 0.25) < 1e-9), 'all on the first hit, 4 hits back');
  const Q2 = plan({ hit: beat, t: 4.3, every: 0 });
  assert.ok([0, 1, 2, 3].every((r) => Q2.starts[r] === -Infinity), 'long ago (past the few hits looked back): fully in');
  const R = plan({ hit: beat, t: 0.3, every: 0 });
  assert.ok([0, 1, 2, 3].every((r) => Math.abs(R.starts[r] - 0.25) < 1e-9), 'all on the first hit');
});
ok('on the kicks (off the grid): step r on kick r, the time between hits from the kicks', () => {
  const P = plan({ hit: kick, t: 2.03 }); // kicks 0.5 1.0 1.75 2.0
  near(P.starts[0], 0.5); near(P.starts[2], 1.75); near(P.starts[3], 2.0); near(P.gap, 1.25); near(P.dur, 0.75);
  assert.ok(P.pulse > 0.7 && P.pulse < 1, 'just after a kick the pulse is high');
});
ok('build + hold: all out together after the last step and hold hits, then again from step 0', () => {
  // 4 steps on beats 0..3, hold 2 → out on beat 5, round = 3 + 2 + 1 = 6 beats
  const P = plan({ hit: beat, t: 2.8, hold: 2 }); // beat 5 = 2.75
  for (let r = 0; r < 4; r += 1) near(P.outs[r], 2.75);
  const Q = plan({ hit: beat, t: 3.3, hold: 2 }); // beat 6 = 3.25: round 2 starts, step 0 in again
  assert.strictEqual(Q.cycle, 1); near(Q.starts[0], 3.25); assert.strictEqual(Q.starts[1], Infinity); assert.strictEqual(Q.outs[0], Infinity);
});
ok('one at a time: each step goes out as the next comes in; the last after its hold, then again', () => {
  const P = plan({ hit: beat, t: 1.3, swap: true, hold: 1 }); // steps on beats 0,1,2,3; round = 3 + 1 = 4 beats
  near(P.outs[0], 0.75); near(P.outs[1], 1.25); assert.strictEqual(P.outs[2], Infinity);
  const Q = plan({ hit: beat, t: 2.3, swap: true, hold: 1 }); // beat 4 = 2.25: a new round
  assert.strictEqual(Q.cycle, 1); near(Q.starts[0], 2.25);
  const R = plan({ hit: beat, t: 3.8, swap: true, hold: 0 }); // no hold: the last one stays
  assert.strictEqual(R.outs[3], Infinity); assert.strictEqual(R.cycle, 0);
});
ok('the same time gives the same plan whatever was planned before (renders match)', () => {
  const P = C.newPlan(); const seq = [];
  for (let f = 0; f < 120; f += 1) { C.plan(P, { hit: kick, t: f / 30, start: 0, nR: 5, every: 1, hold: 3, durFrac: 0.6 }); seq.push([...P.starts.slice(0, 5), ...P.outs.slice(0, 5), P.pulse, P.k].join(',')); }
  const Q = C.newPlan(); const back = [];
  for (let f = 119; f >= 0; f -= 1) { C.plan(Q, { hit: kick, t: f / 30, start: 0, nR: 5, every: 1, hold: 3, durFrac: 0.6 }); back.unshift([...Q.starts.slice(0, 5), ...Q.outs.slice(0, 5), Q.pulse, Q.k].join(',')); }
  assert.deepStrictEqual(seq, back);
});
ok('order ranks: forward, reverse, from the center (two at once), edges, random (repeatable); step counts', () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((u) => C.rankOf(u, 5, 'reverse')), [4, 3, 2, 1, 0]);
  assert.deepStrictEqual([0, 1, 2, 3].map((u) => C.stepOf(C.rankOf(u, 4, 'center'))), [1, 0, 0, 1]);
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((u) => C.stepOf(C.rankOf(u, 5, 'edges'))), [0, 1, 2, 1, 0]);
  assert.deepStrictEqual([0, 1, 2, 3].map((u) => C.rankOf(u, 4, 'random', 3)), [0, 1, 2, 3].map((u) => C.rankOf(u, 4, 'random', 3)));
  assert.strictEqual(C.nRanks(4, 'center'), 2); assert.strictEqual(C.nRanks(5, 'edges'), 3); assert.strictEqual(C.nRanks(6, 'forward'), 6);
});
ok('easing: every curve starts at 0 and ends at 1; out is ahead of in; back overshoots; clamped', () => {
  for (const k of C.EASE_IDS) { near(C.ease(k, 0), 0, 1e-9, k); near(C.ease(k, 1), 1, 1e-9, k); }
  assert.ok(C.ease('out', 0.3) > C.ease('linear', 0.3) && C.ease('in', 0.3) < C.ease('linear', 0.3));
  assert.ok([0.6, 0.7, 0.8].some((x) => C.ease('back', x) > 1));
  near(C.ease('linear', 2), 1); near(C.ease('linear', -1), 0); near(C.ease('nope', 0.5), C.ease('out', 0.5));
});
ok('stagger: letters of one step come in a stagger apart (the runtime adds inner × stagger to the step\'s start)', () => {
  const P = plan({ hit: beat, t: 0.6 }); const stag = 0.04;
  const prog = (inner) => (0.6 - (P.starts[0] + inner * stag)) / P.dur;
  assert.ok(prog(0) > prog(1) && prog(1) > prog(2)); near(prog(0) - prog(1), stag / P.dur);
});
ok('hit effects: punch scales with the pulse, highlight moves word to word, flicker / shake repeatable, nothing before the first hit', () => {
  const P = plan({ hit: beat, t: 1.26, every: 0 }); // just after beat 2
  const o = () => ({ a: 1, x: 0, y: 0, s: 1, r: 0, glow: 0 });
  const a = o(); C.fx('punch', a, P, 0, 0, 1); assert.ok(a.s > 1.3);
  const b = o(); assert.strictEqual(C.fx('highlight', b, P, 0, P.sweep, 1), 1); assert.strictEqual(C.fx('highlight', o(), P, 0, (P.sweep + 1) % 4, 1), 0);
  const Q = plan({ hit: beat, t: 1.76, every: 0 }); assert.strictEqual((P.sweep + 1) % 4, Q.sweep, 'the next beat, the next word');
  const f1 = o(); const f2 = o(); C.fx('shake', f1, P, 3, 0, 1); C.fx('shake', f2, P, 3, 0, 1); assert.deepStrictEqual(f1, f2);
  const none = o(); C.fx('punch', none, plan({ hit: beat, t: 0.1 }), 0, 0, 1); assert.strictEqual(none.s, 1);
});
ok('lyric lines on markers: line i starts on marker i, ends before the next; lines past the markers follow on', () => {
  const r = C.linesOnMarks(['one', 'two', '', 'three', 'four'], [4, 2, 6], { duration: 30 });
  assert.strictEqual(r.used, 3);
  assert.deepStrictEqual(r.lines.map((x) => [x.a, x.text]), [[2, 'one'], [4, 'two'], [6, 'three'], [8, 'four']]);
  near(r.lines[0].b, 3.95); near(r.lines[3].b, 10);
  assert.deepStrictEqual(C.linesOnMarks([], [1]).lines, []);
});
ok('the presets: about twenty, each with a sync, a step effect that exists, an in animation, plain JSON options', () => {
  assert.ok(C.PRESETS.length >= 20);
  const ids = new Set();
  for (const p of C.PRESETS) {
    assert.ok(!ids.has(p.id), `twice: ${p.id}`); ids.add(p.id);
    assert.ok(C.SYNC_IDS.includes(p.sliders.kSync), `${p.id} sync`);
    assert.ok(!p.sliders.kFx || C.FX_IDS.includes(p.sliders.kFx), `${p.id} fx`);
    assert.ok(p.sliders.inAnim && p.opts.kinetic === p.id && JSON.parse(JSON.stringify(p.opts)).kinetic === p.id);
  }
  for (const w of ['word by word pop', 'letter cascade', 'typewriter', 'glitch in', 'slide & blur', 'scale punch on kick', 'wave', 'split reveal', 'outline draw', 'bounce', 'neon flicker', 'zoom through', 'stagger rise', 'highlight sweep', 'countdown', 'lyric line']) assert.ok(C.PRESETS.some((p) => p.name.toLowerCase() === w), w);
  assert.strictEqual(C.preset('countdown').id, 'countdown'); assert.strictEqual(C.preset('kick').id, 'kick-punch'); assert.strictEqual(C.preset('zzz'), null);
});
ok('a unit of the type layer\'s presets: every in / out animation they use exists in the type layer', () => {
  global.window = global.window || {};
  require('../tools/three-type-data.js');
  const A = new Set(['none', ...global.window.TypeData.ANIM_IDS]);
  for (const p of C.PRESETS) { assert.ok(A.has(p.sliders.inAnim), `${p.id} in ${p.sliders.inAnim}`); assert.ok(A.has(p.sliders.outAnim || 'fade'), `${p.id} out ${p.sliders.outAnim}`); }
  for (const k of ['kSync', 'kEvery', 'kHold', 'kFlow', 'kFx', 'kDur', 'kSecs']) assert.ok(global.window.TypeData.SLIDERS[k], k);
  assert.deepStrictEqual(global.window.TypeData.SLIDERS.kFx.options, C.FX_IDS);
});
ok('the preview page\'s copy: the factory as source runs on its own and gives the same plan', () => {
  // eslint-disable-next-line no-new-func
  new Function(`(function () { globalThis.kinetic = (${C.factory})(); })();`)();
  const K = globalThis.kinetic;
  const a = C.plan(C.newPlan(), { hit: kick, t: 3.3, start: 0.2, nR: 6, every: 1, hold: 2, durFrac: 0.5 });
  const b = K.plan(K.newPlan(), { hit: kick, t: 3.3, start: 0.2, nR: 6, every: 1, hold: 2, durFrac: 0.5 });
  assert.deepStrictEqual([...a.starts.slice(0, 6), ...a.outs.slice(0, 6), a.k, a.pulse], [...b.starts.slice(0, 6), ...b.outs.slice(0, 6), b.k, b.pulse]);
});

console.log(`${n}/${TOTAL} passed`);
if (n !== TOTAL) process.exitCode = 1;
