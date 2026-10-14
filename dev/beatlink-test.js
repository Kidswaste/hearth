// Node tests for ♪ Move with the music (tools/three-beatlink-core.js): the shapes (pulse, follow, step, random) on hit
// drivers (the grid, drum hits) and level drivers (envelopes), each a function of the song's time alone (the same
// value whatever was computed before: renders match), bars counted from bar 1, glides, the live follower, a new link's
// range, typed words → driver / how, and the source the preview page runs.
//   node dev/beatlink-test.js
const assert = require('assert');
const C = require('../tools/three-beatlink-core.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const near = (a, b, eps = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≠ ${b}`);

// a fixture "song": 120 BPM, beats every 0.5 s from 0.25, bar 1 on the third beat (downIndex 2), kicks on every beat,
// snares on 2 and 4, a bass envelope (30 fps) that swells on each kick
const beats = Array.from({ length: 40 }, (_, i) => 0.25 + i * 0.5);
const kicks = beats.slice();
const snares = beats.filter((_, i) => (i - 2) % 2 === 1);
const FPS = 30;
const bassEnv = Array.from({ length: 21 * FPS }, (_, f) => { const t = f / FPS; const k = C.lastIdx(kicks, t); return k < 0 ? 0.1 : 0.1 + 0.8 * Math.exp(-(t - kicks[k]) / 0.15); });
const src = (band, extra = {}) => {
  const beat = C.hitsOf(beats, { period: 0.5 });
  const hit = band === 'beat' ? beat : band === 'bar' ? C.hitsOf(beats, { every: 4, from: 2, period: 0.5 }) : band === 'kick' ? C.hitsOf(kicks) : band === 'snare' ? C.hitsOf(snares) : beat;
  return { hit, beat, level: C.envOf(bassEnv.map((x) => x * 2), FPS), hist: true, ...extra };
};
const val = (link, t, extra) => C.value({ lo: 0, hi: 1, ...link }, { ...src(link.band), t, ...extra });

ok('pulse on the kick: 1 on each kick, falling to ≈ 5 % after its fall time, nothing before the first kick', () => {
  const L = { band: 'kick', how: 'pulse', att: 0, dec: 200 };
  near(val(L, kicks[3])[0], 1, 1e-9, 'on the kick');
  near(val(L, kicks[3] + 0.2)[0], Math.exp(-3), 1e-6, 'after 200 ms');
  assert.ok(val(L, kicks[3] + 0.1)[0] > 0.2 && val(L, kicks[3] + 0.1)[0] < 0.25);
  assert.strictEqual(val(L, 0.1)[0], 0, 'before the first kick');
  assert.ok(val(L, kicks[3] - 0.01)[0] < 0.1, 'just before the next kick it has fallen');
});
ok('the range: lo + (hi − lo) × the shape, whole numbers stay whole, an upside-down range works', () => {
  const L = { band: 'kick', how: 'pulse', dec: 200, lo: 2, hi: 6 };
  near(val(L, kicks[1])[0], 6); near(val(L, 0.1)[0], 2);
  assert.strictEqual(C.value({ ...L, lo: 0, hi: 10 }, { ...src('kick'), t: kicks[1] + 0.07 }, true)[0] % 1, 0);
  near(val({ ...L, lo: 5, hi: 1 }, kicks[1])[0], 1);
});
ok('a rise (attack): it climbs to the top over the rise time; the last hit\'s tail shows through', () => {
  const L = { band: 'kick', how: 'pulse', att: 100, dec: 300 };
  near(val(L, kicks[4] + 0.05)[0], Math.max(0.5, Math.exp((-3 * (500 - 100)) / 300)), 1e-6);
  near(val(L, kicks[4] + 0.1)[0], 1, 1e-6);
});
ok('snare hits only on 2 and 4 (its own hits, not the beat)', () => {
  const L = { band: 'snare', how: 'pulse', dec: 150 };
  near(val(L, snares[2])[0], 1);
  assert.ok(val(L, snares[2] + 0.5)[0] < 0.01, 'the beat between two snares is quiet');
});
ok('follow the beat / bar: a sweep 0 → 1 across each beat / bar', () => {
  near(val({ band: 'beat', how: 'follow' }, beats[5] + 0.25)[0], 0.5);
  near(val({ band: 'bar', how: 'follow' }, beats[2] + 0.5)[0], 0.25, 1e-9, 'a beat into bar 1');
  near(val({ band: 'bar', how: 'follow' }, beats[6] + 1.5)[0], 0.75, 1e-9, 'three beats into bar 2');
});
ok('step on each bar: 4 values round and round, counted from bar 1', () => {
  const L = { band: 'bar', how: 'step', steps: 4 };
  const at = (bar) => val(L, beats[2 + bar * 4] + 0.1)[0];
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5].map(at).map((x) => Math.round(x * 3)), [0, 1, 2, 3, 0, 1]);
  near(val(L, beats[2] + 1.9)[0], 0, 1e-9, 'the whole bar holds its value');
  assert.strictEqual(val({ ...L, steps: 2 }, beats[6] + 0.1)[0], 1);
});
ok('step on the beat with 3 steps; a level driver steps on the beat too', () => {
  const vals = [0, 1, 2, 3].map((k) => val({ band: 'beat', how: 'step', steps: 3 }, beats[k] + 0.01)[0]);
  assert.deepStrictEqual(vals.map((x) => x * 2), [0, 1, 2, 0]);
  assert.strictEqual(val({ band: 'bass', how: 'step', steps: 2 }, beats[1] + 0.01)[0], 1);
});
ok('random on each hit: in the range, held until the next hit, the same every time (and per seed)', () => {
  const L = { band: 'kick', how: 'random', seed: 7 };
  const a = kicks.slice(0, 12).map((t) => val(L, t + 0.01)[0]);
  const b = kicks.slice(0, 12).map((t) => val(L, t + 0.4)[0]);
  assert.deepStrictEqual(a, b, 'held');
  assert.ok(a.every((x) => x >= 0 && x < 1) && new Set(a).size >= 10, 'spread');
  assert.deepStrictEqual(kicks.slice(0, 12).map((t) => val(L, t + 0.01)[0]), a, 'repeatable');
  assert.notDeepStrictEqual(kicks.slice(0, 12).map((t) => val({ ...L, seed: 8 }, t + 0.01)[0]), a, 'another seed, other values');
});
ok('glide: a step slides from the last value over its glide time', () => {
  const L = { band: 'beat', how: 'step', steps: 2, glide: 200 };
  near(val(L, beats[1])[0], 0, 1e-9);
  near(val(L, beats[1] + 0.1)[0], 0.5, 1e-9);
  near(val(L, beats[1] + 0.25)[0], 1, 1e-9);
});
ok('follow a level: the envelope, smoothed; the same at a time whatever came before (deterministic)', () => {
  const L = { band: 'bass', how: 'follow', att: 60, dec: 320 };
  const ts = [3.21, 7.5, 1.03, 9.99, 3.21, 5.5];
  const shuffled = ts.map((t) => val(L, t)[0]);
  const fresh = ts.map((t) => C.value({ lo: 0, hi: 1, ...L }, { ...src('bass'), t })[0]);
  assert.deepStrictEqual(shuffled, fresh);
  near(shuffled[0], shuffled[4], 0, 'the same time twice');
  assert.ok(val(L, kicks[6] + 0.08)[0] > val(L, kicks[6] - 0.02)[0], 'it rises after a kick');
  const raw = val(L, kicks[6] + 0.04)[1];
  assert.ok(raw > 0.6 && raw <= 1, 'raw is the envelope (0..1 of its peak)');
});
ok('pulse on a level: a jump where the level rises, quiet where it holds', () => {
  const L = { band: 'bass', how: 'pulse', att: 0, dec: 200 };
  const flatSrc = { ...src('bass'), level: () => 0.7 };
  assert.ok(C.value({ lo: 0, hi: 1, ...L }, { ...flatSrc, t: 5 })[0] < 0.01, 'a held level does not pulse');
  assert.ok(val(L, kicks[8] + 0.03)[0] > 0.5, 'a kick swell pulses');
});
ok('a whole render twice (100 frames at 30 fps, every shape): the same numbers', () => {
  const links = [{ band: 'kick', how: 'pulse' }, { band: 'bar', how: 'step' }, { band: 'bass', how: 'follow' }, { band: 'snare', how: 'random', seed: 3 }, { band: 'beat', how: 'follow' }, { band: 'bass', how: 'pulse' }];
  const render = () => links.map((L) => Array.from({ length: 100 }, (_, f) => C.value({ lo: -2, hi: 3, ...L }, { ...src(L.band), t: 1 + f / 30 })[0]));
  assert.deepStrictEqual(render(), render());
});
ok('live: the follower keeps its state and steps by the clock', () => {
  const st = {};
  const L = { band: 'bass', how: 'follow', att: 50, dec: 300 };
  const at = (now, x) => C.value({ lo: 0, hi: 1, ...L }, { t: now / 1000, hist: false, st, now, level: () => x, hit: () => null, beat: () => null })[0];
  near(at(0, 0), 0); const a = at(50, 1); assert.ok(a > 0.6 && a < 0.7, `rises over the attack (${a})`);
  const b = at(400, 0); assert.ok(b < a && b > 0.2, 'falls slower');
});
ok('a steady clock (no song: 120 BPM; live tempo) and bars from it', () => {
  const h = C.clockHits(0.5)(1.26);
  assert.strictEqual(h.k, 2); near(h.at, 1); near(h.next, 1.5);
  const b = C.clockHits(0.5, 0, 4)(4.1);
  assert.strictEqual(b.k, 2); near(b.at, 4);
});
ok('a new link: the range starts at the slider and goes a third up (down near the top), whole numbers stay whole', () => {
  const a = C.make({ band: 'kick', how: 'pulse', v: 1, min: 0, max: 3 });
  assert.strictEqual(a.lo, 1); near(a.hi, 2.05, 1e-9); assert.strictEqual(a.how, 'pulse');
  const b = C.make({ band: 'bar', how: 'step', v: 3, min: 0, max: 3 });
  assert.ok(b.hi === 3 && b.lo < 3 && b.steps === 4);
  const c = C.make({ band: 'beat', how: 'random', v: 4, min: 1, max: 8, int: true });
  assert.ok(Number.isInteger(c.lo) && Number.isInteger(c.hi) && c.hi > c.lo && c.seed === 1);
  assert.ok(C.isLink(a) && !C.isLink({ band: 'kick', amount: 0.4 }));
});
ok('typed words: the driver and the how ("pulse on kick", "step each bar", "follow the vocals", "random on the hats")', () => {
  assert.deepStrictEqual([C.parseDriver('pulse on kick'), C.parseHow('pulse on kick')], ['kick', 'pulse']);
  assert.deepStrictEqual([C.parseDriver('step each bar'), C.parseHow('step each bar')], ['bar', 'step']);
  assert.deepStrictEqual([C.parseDriver('follow the vocals'), C.parseHow('follow the vocals')], ['vocals', 'follow']);
  assert.deepStrictEqual([C.parseDriver('random on the hi-hats'), C.parseHow('random on the hi-hats')], ['hats', 'random']);
  assert.strictEqual(C.parseDriver('the overall loudness'), 'loudness');
  assert.strictEqual(C.short({ band: 'bar', how: 'step', steps: 4 }), 'Bar · step 4');
});
ok('the preview page\'s copy: the factory as source runs on its own and gives the same values', () => {
  const code = `function () { globalThis.beatlink = (${C.factory})(); }`;
  // eslint-disable-next-line no-new-func
  new Function(`(${code})();`)();
  const B = globalThis.beatlink;
  const L = { band: 'kick', how: 'random', seed: 4, lo: 0, hi: 1 };
  assert.deepStrictEqual(kicks.slice(0, 8).map((t) => B.value(L, { ...src('kick'), t: t + 0.01 })[0]), kicks.slice(0, 8).map((t) => C.value(L, { ...src('kick'), t: t + 0.01 })[0]));
});

console.log(`${n}/17 passed`);
