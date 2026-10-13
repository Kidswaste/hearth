// Node tests for ∞ Make it loop (round 31, perfectloop): the loop's timing (tools/three-loop-core.js: N bars from the
// bar the playhead is in, N seconds, the cross-fade, whole frames, a song that ends too soon, the export page's frame
// times), keyframes coming back round, the words, the seamless check on generated frames (publishkit's loop check),
// and the sketch helpers as the preview page runs them (taken out of tools/three-sandbox.html: loopT, loopSin,
// loopCos, loopWave, loopAngle, loopNoise, loop.*, the folded clock a layer sees, 0 while it sets up).
//   node dev/perfectloop-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('../tools/three-loop-core.js');
const PK = require('../publishkit-core.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const near = (a, b, eps = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≠ ${b}`);

// ---------- loop timing ----------
ok('4 bars at 120 bpm: 8 s from the bar the playhead is in, 240 frames, no blend', () => {
  const p = C.plan({ song: { bpm: 120, bpb: 4, anchor: 0.25, duration: 120 }, bars: 4, at: 13.1 });
  assert.strictEqual(p.kind, 'bars'); near(p.len, 8); near(p.a, 12.25); near(p.b, 20.25); assert.strictEqual(p.L, 240); assert.strictEqual(p.X, 0);
});
ok('the blend is one beat (≥ 4 frames, ≤ a third of the loop)', () => {
  near(C.plan({ song: { bpm: 120, bpb: 4 }, bars: 2, fade: true }).X, 15);
  assert.strictEqual(C.plan({ song: { bpm: 240, bpb: 4 }, bars: 1, fade: true }).X, 8); // (a quarter second, a third of 30 frames at most)
  assert.ok(C.plan({ song: { bpm: 30, bpb: 4 }, bars: 1, fade: true, F: 30 }).X <= 80);
});
ok('a playhead before bar 1 / odd tempos: the loop still starts on a bar at or after 0', () => {
  const p = C.plan({ song: { bpm: 123, bpb: 4, anchor: 1.1 }, bars: 4, at: 0.2 });
  assert.ok(p.a >= 0 && p.a < 1.95 + 1.1, p.a); near(p.len, (4 * 4 * 60) / 123, 1e-3);
});
ok('a song that ends before the loop would: the loop moves back to fit', () => {
  const p = C.plan({ song: { bpm: 120, bpb: 4, anchor: 0, duration: 30 }, bars: 4, at: 28 });
  assert.ok(p.b <= 30 + 1e-3 && p.len === 8, JSON.stringify(p));
});
ok('no song: N seconds from 0 in whole frames; the scene\'s own timeline length by default (≤ 20 s), else 8 s', () => {
  const p = C.plan({ secs: 4.01, F: 30 }); assert.strictEqual(p.kind, 'secs'); near(p.a, 0); near(p.len * 30, Math.round(p.len * 30)); assert.strictEqual(p.L, 120);
  near(C.plan({ clock: { len: 10 } }).len, 10); near(C.plan({ clock: { len: 60 } }).len, 8); assert.strictEqual(C.plan({ secs: 12 }).fit, 12);
});
ok('the clock: fold and phase (whole turns), negative times too', () => {
  near(C.fold(13, 2, 4), 5); near(C.fold(1, 2, 4), 5); near(C.phase(5, 2, 4), 0.75); near(C.phase(5, 2, 4, 2), 0.5); near(C.phase(6, 2, 4), 0);
});
ok('the export page\'s frame times: frames past the end come round to the start (a perfect loop), not otherwise', () => {
  near(C.frameTime(240, { T0: 12, F: 30, L: 240, wrap: true }), 12); near(C.frameTime(241, { T0: 12, F: 30, L: 240, wrap: true }), 12 + 1 / 30, 1e-4);
  near(C.frameTime(240, { T0: 12, F: 30, L: 240 }), 20);
});

// ---------- keyframes ----------
ok('keys that end elsewhere get a key at the loop\'s end with the start value; ones that come back are left', () => {
  const keys = [{ t: 0, v: 1, ease: 'ease' }, { t: 4, v: 2, ease: 'linear' }, { t: 9, v: 5, ease: 'ease' }];
  const c = C.close(keys, 0, 8);
  assert.deepStrictEqual(c.map((k) => [k.t, k.v]), [[0, 1], [4, 2], [8, 1]]);
  assert.strictEqual(C.close([{ t: 0, v: 3 }, { t: 2, v: 3 }], 0, 8), null);
  near(C.valueAt(c, 8), C.valueAt(c, 0));
  assert.strictEqual(C.close([{ t: 0, v: 1 }, { t: 4, v: 2 }, { t: 8, v: 1 }], 0, 8), null);
  assert.strictEqual(C.close([{ t: 0, v: 3 }], 0, 8), null);
});
ok('a loop starting mid-key: the value there (eases, colors, hold)', () => {
  near(C.valueAt([{ t: 0, v: 0, ease: 'linear' }, { t: 2, v: 10 }], 1), 5);
  near(C.valueAt([{ t: 0, v: 0, ease: 'ease' }, { t: 2, v: 10 }], 1), 5);
  assert.strictEqual(C.valueAt([{ t: 0, v: '#000000', ease: 'linear' }, { t: 2, v: '#ffffff' }], 1), '#808080');
  assert.strictEqual(C.valueAt([{ t: 0, v: 3, ease: 'hold' }, { t: 2, v: 10 }], 1.9), 3);
  const c = C.close([{ t: 0, v: 0, ease: 'linear' }, { t: 10, v: 10 }], 2, 4);
  near(C.valueAt(c, 6), C.valueAt(c, 2)); assert.ok(c.every((k) => k.t <= 6));
});

// ---------- words ----------
ok('the words: bars, seconds, off, check, render, blend', () => {
  assert.deepStrictEqual(C.parse('make it loop over 4 bars'), { bars: 4 });
  assert.strictEqual(C.parse('8 s').secs, 8); assert.strictEqual(C.parse('8 seconds please').secs, 8); assert.strictEqual(C.parse('6').n, 6);
  assert.ok(C.parse('loop off').off); assert.ok(C.parse('is it seamless?').check); assert.strictEqual(C.parse('render gif').render, 'gif');
  assert.strictEqual(C.parse('blend').fade, true); assert.strictEqual(C.parse('no blend').fade, false);
});

// ---------- the seamless check (publishkit's loop check) ----------
const W = 32; const H = 24;
const frame = (fn) => { const g = new Uint8Array(W * H); for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) g[y * W + x] = Math.max(0, Math.min(255, Math.round(fn(x, y)))); return g; };
const blob = (cx) => frame((x, y) => 20 + 220 * Math.exp(-(((x - cx) ** 2) + ((y - 12) ** 2)) / 18));
const loopFrames = (L, periodic) => Array.from({ length: L + 1 }, (_, k) => blob(periodic ? 16 + 9 * Math.sin((2 * Math.PI * k) / L) : 4 + (24 * k) / L));
ok('a periodic loop: ≈ seamless (the last frame runs into the first like any two frames)', () => {
  const r = C.seam(loopFrames(60, true), PK, 60);
  assert.ok(r.seamless, JSON.stringify(r)); assert.ok(r.again < 0.002, r.again);
  assert.strictEqual(C.verdict(r).text, '≈ seamless');
});
ok('a drift that never comes back: a visible jump; blended, the end runs into what follows it', () => {
  const fr = loopFrames(60, false); fr[60] = blob(4 + 24 * 61 / 60); // a simulation carried on past the end
  const r = C.seam(fr, PK, 60);
  assert.ok(!r.seamless && r.ratio > 3, JSON.stringify(r));
  assert.strictEqual(C.verdict(r).text, 'a visible jump'); assert.strictEqual(C.verdict(r, true).text, '≈ seamless (blended)');
});
ok('the director\'s brief names the helpers and stays short', () => {
  const t = C.brief({ len: 8, kind: 'bars', bars: 4, verdictText: 'a visible jump', words: 'keep the pink' });
  assert.ok(/loopT\(\)/.test(t) && /loopNoise/.test(t) && /4 bars/.test(t) && /keep the pink/.test(t) && C.cost(t) < 160, C.cost(t));
});

// ---------- the sketch helpers, as the preview page runs them ----------
const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'three-sandbox.html'), 'utf8');
const pick = (from, to) => { const a = html.indexOf(from); const b = html.indexOf(to, a); assert.ok(a >= 0 && b > a, `${from} in the sandbox`); return html.slice(a, b); };
const src = [
  pick('globalThis.fract =', '\n'), pick('globalThis.seeded =', '\n'), pick('globalThis.noise = (() => {', '\n})();') + '\n})();',
  pick('// ---------- perfect loop (round 31', 'globalThis.media = media;'),
].join('\n');
function page() {
  const ctx = { Math, Number, Object, Error, Map, globalThis: null, SQ: { on: false, T: 0 }, region: null, ctxLayer: null, layers: new Map(), mediaEl: { currentTime: 0 }, liveKind: null, parked: false,
    realNow: () => 0, keyTime: () => 0, sqLocal: () => 0, layerOfStack: (s) => (/blob:layer/.test(String(s)) ? 'L1' : null), composite: () => ({ style: {}, animate: () => ({}) }), post: () => {}, realSetTimeout: () => 0, document: { body: { appendChild() {} } } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${src}\nglobalThis.__L = { LOOPC, loopClock, loopFold, loopNowMs, loopMessage };`, ctx);
  return ctx;
}
ok('loopT: 0..1 over the loop, whole turns, back to 0 at the end; follows the timeline\'s A–B loop', () => {
  const g = page();
  g.__L.loopMessage({ on: true, a: 2, len: 8 });
  for (const [t, u] of [[2, 0], [4, 0.25], [9.9999, 0.9999875], [10, 0], [14, 0.5]]) { g.mediaEl.currentTime = t; near(g.loopT(), u, 1e-6, `t ${t}`); }
  g.mediaEl.currentTime = 4; near(g.loopT(2), 0.5); near(g.loopT(2.4), 0.5); near(g.loopAngle(1), Math.PI / 2);
  g.region = { a: 1, b: 5 }; g.mediaEl.currentTime = 2; near(g.loopT(), 0.25); near(g.loop.len, 4); near(g.loop.start, 1);
});
ok('loopSin / loopCos / loopWave: the same at the start and the end', () => {
  const g = page(); g.__L.loopMessage({ on: true, a: 0, len: 6 });
  const at = (t, f) => { g.mediaEl.currentTime = t; return f(); };
  for (const f of [() => g.loopSin(3), () => g.loopCos(2, 0.1), () => g.loopWave(1), () => g.loopSin(1, 0.25)]) near(at(0, f), at(6 - 1e-9, f), 1e-6);
  near(at(1.5, () => g.loopSin(1)), 1); near(at(3, () => g.loopWave(1)), 1);
});
ok('loopNoise: smooth noise on a circle, back to itself at the loop\'s end, and it does move', () => {
  const g = page();
  let moved = 0;
  for (const [x, y] of [[0.3, 0.1], [2.7, -1.3], [10.1, 4.4]]) {
    near(g.loopNoise(x, y, 0), g.loopNoise(x, y, 1), 1e-9, 'periodic');
    near(g.loopNoise(x, y, 0.999), g.loopNoise(x, y, 0), 0.05, 'continuous');
    const vals = Array.from({ length: 16 }, (_, k) => g.loopNoise(x, y, k / 16));
    moved = Math.max(moved, Math.max(...vals) - Math.min(...vals));
    assert.ok(vals.every((v) => v > -1.2 && v < 1.2));
  }
  assert.ok(moved > 0.2, moved);
  near(g.loopNoise(1, 2, 0.5, 0), g.noise(1, 2, 7.31), 1e-12, 'r 0: no travel');
});
ok('a layer\'s clock on the loop: the timeline folded in (ms), 0 while it sets up, untouched when off / live / in a sequence', () => {
  const g = page();
  g.mediaEl.currentTime = 11; g.ctxLayer = 'L1';
  assert.strictEqual(g.__L.loopNowMs(), null);
  g.__L.loopMessage({ on: true, a: 2, len: 8 });
  near(g.__L.loopNowMs(), 3000);
  g.ctxLayer = null; g.__L.LOOPC.importing = 1;
  g.Error = function E() { this.stack = 'at blob:layer:1:2'; };
  vm.runInContext('Error = globalThis.Error', g);
  assert.strictEqual(g.__L.loopNowMs(), 0);
  g.ctxLayer = 'L1'; g.liveKind = 'mic'; assert.strictEqual(g.__L.loopNowMs(), null);
  g.liveKind = null; g.SQ.on = true; assert.strictEqual(g.__L.loopNowMs(), null);
});
ok('without "Make it loop": every 4 s, or the timeline\'s A–B loop', () => {
  const g = page(); g.mediaEl.currentTime = 5; near(g.loopT(), 0.25); assert.strictEqual(g.loop.on, false);
  g.region = { a: 4, b: 6 }; near(g.loopT(), 0.5);
});

console.log(`\n${process.exitCode ? 'FAILED' : 'all passed'} (${n} tests)`);
