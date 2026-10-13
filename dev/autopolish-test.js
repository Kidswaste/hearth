// Node tests for "Make it look finished" (tools/three-autopolish-core.js): the rules on synthetic readings (too dark,
// too bright, clipped whites, crushed blacks, flat contrast, too much / no glow, clashing colors, the 9:16 safe area,
// too static, jittery, the music barely moving anything, frame rate dips), a well-made scene changing nothing, the
// harmony math, the picture / motion / safe-area readers on generated frames, merging ticked fixes, the brief.
//   node dev/autopolish-test.js
const assert = require('assert');
const P = require('../tools/three-autopolish-core.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };

// a reading of a well-made scene: nothing to fix
const GOOD = () => ({
  pic: { p2: 0.02, p5: 0.04, q25: 0.2, q50: 0.4, q75: 0.62, p95: 0.88, p98: 0.94, mean: 0.4, sat: 0.4, glow: 0.04, clip: 0.01, crushed: 0.03, shadows: 0.2, whites: 0.01, palette: [{ hex: '#d04a2a', share: 0.4 }, { hex: '#e07a3a', share: 0.3 }, { hex: '#2a8ad0', share: 0.2 }] },
  motion: { motion: 0.03, spread: 0.1, flicker: 0.01, n: 4 }, under: [], frame: { id: '9:16' }, grade: null, lens: null,
  sliders: [{ layer: 'a', layerName: 'Scene', key: 'speed', label: 'Speed', value: 1, min: 0, max: 4, live: true }, { layer: 'a', layerName: 'Scene', key: 'zoom', label: 'Zoom', value: 1, min: 0.5, max: 2, live: true, followsMusic: { band: 'kickOn', amount: 0.35 } }],
  palette: [], sound: 'song', reactPlan: [], perf: { fps: 60, cap: 60, light: false },
});
const ids = (r) => r.fixes.map((f) => f.id).sort();
const fixOf = (r, id) => r.fixes.find((f) => f.id === id);

ok('a well-made scene: no fixes, nothing left, a high score', () => {
  const r = P.propose(GOOD());
  assert.deepStrictEqual(ids(r), []); assert.strictEqual(r.left.length, 0); assert.ok(r.score >= 95, r.score);
});
ok('too dark → exposure up, by enough to bring the brightest parts near 80 %', () => {
  const M = GOOD(); Object.assign(M.pic, { p95: 0.18, p98: 0.22, mean: 0.06, q50: 0.05 });
  const r = P.propose(M); const f = fixOf(r, 'dark');
  assert.ok(f && f.grade.exposure > 1.5 && f.grade.exposure <= 3, JSON.stringify(f));
  assert.ok(f.expect > 0.5, f.expect);
  assert.ok(!fixOf(r, 'flat'), 'flat contrast is not fixed on top of a dark picture');
  assert.ok(r.score < 90);
});
ok('too dark with an exposure already up: the total stays inside the slider (≤ 3 stops)', () => {
  const M = GOOD(); Object.assign(M.pic, { p95: 0.1, mean: 0.04 }); M.grade = { exposure: 2 };
  const f = fixOf(P.propose(M), 'dark'); assert.ok(f.grade.exposure <= 3 && f.grade.exposure > 2, f.grade.exposure);
});
ok('too bright → exposure down', () => {
  const M = GOOD(); Object.assign(M.pic, { mean: 0.85, whites: 0.3 });
  const r = P.propose(M); assert.ok(fixOf(r, 'bright').grade.exposure < 0); assert.ok(!fixOf(r, 'whites'), 'the exposure fix covers the whites');
});
ok('clipped whites → AgX tone mapping (when off) and the whites pulled down', () => {
  const M = GOOD(); M.pic.whites = 0.14;
  const f = fixOf(P.propose(M), 'whites'); assert.strictEqual(f.grade.tone, 'agx'); assert.ok(f.grade.gainLum < 0);
  M.grade = { tone: 'aces' };
  const g = fixOf(P.propose(M), 'whites'); assert.ok(!('tone' in g.grade), 'a tone mapping already on stays');
});
ok('crushed blacks → a little lift; a black background (most of the picture) is left alone', () => {
  const M = GOOD(); Object.assign(M.pic, { crushed: 0.3, shadows: 0.04 });
  assert.ok(fixOf(P.propose(M), 'blacks').grade.liftLum > 0);
  Object.assign(M.pic, { crushed: 0.75 });
  assert.ok(!fixOf(P.propose(M), 'blacks'));
});
ok('flat contrast → contrast up and an S-curve', () => {
  const M = GOOD(); Object.assign(M.pic, { p5: 0.3, p95: 0.6 });
  const f = fixOf(P.propose(M), 'flat'); assert.ok(f.grade.contrast > 1.1 && f.grade.cL1 < 0.25 && f.grade.cL3 > 0.75, JSON.stringify(f.grade));
});
ok('too much glow → the lens bloom and the scene\'s own glow slider halved', () => {
  const M = GOOD(); M.pic.glow = 0.45; M.lens = { bloom: 1 }; M.sliders.push({ layer: 'a', key: 'glow', label: 'Glow', value: 1.6, min: 0, max: 2 });
  const f = fixOf(P.propose(M), 'glow-much'); assert.strictEqual(f.lens.bloom, 0.5); assert.ok(f.sliders[0].to < 1.6 && f.sliders[0].from === 1.6);
});
ok('bright highlights on a dark scene with no bloom anywhere → a soft bloom', () => {
  const M = GOOD(); Object.assign(M.pic, { p98: 0.9, mean: 0.2, glow: 0.005, p95: 0.7 });
  assert.ok(fixOf(P.propose(M), 'glow-none').lens.bloom > 0);
});
ok('harmony: a same-family palette and a complementary one don\'t clash; three off hues do', () => {
  assert.strictEqual(P.clash(['#d04a2a', '#e07a3a']).score, 0);
  assert.strictEqual(P.clash(['#d02020', '#20c0d0']).score, 0);
  const c = P.clash(['#d02020', P.hslToHex(70, 0.7, 0.45), P.hslToHex(290, 0.7, 0.45)]);
  assert.strictEqual(c.score, 1, JSON.stringify(c));
  assert.strictEqual(P.clash(['#808080', '#101010', '#f8f8f8']).pairs, 0, 'greys never clash');
});
ok('harmonize: every pair of the result sits well, saturation and lightness kept', () => {
  const src = ['#d02020', P.hslToHex(70, 0.7, 0.45), P.hslToHex(290, 0.7, 0.45), P.hslToHex(200, 0.5, 0.3)];
  const h = P.harmonize(src);
  assert.strictEqual(P.clash(h.colors).score, 0, JSON.stringify(h));
  assert.strictEqual(h.colors[0], '#d02020', 'the lead stays');
  for (let i = 1; i < src.length; i += 1) { const a = P.hexToHsl(src[i]); const b = P.hexToHsl(h.colors[i]); assert.ok(Math.abs(a[1] - b[1]) < 0.03 && Math.abs(a[2] - b[2]) < 0.02); }
});
ok('colors clashing → the scene\'s color sliders moved into one harmony (+ the palette)', () => {
  const M = GOOD(); M.palette = ['#ff0000', '#00ff00'];
  M.sliders.push({ layer: 'a', key: 'c1', label: 'Color 1', value: '#d02020' }, { layer: 'a', key: 'c2', label: 'Color 2', value: P.hslToHex(70, 0.7, 0.45) }, { layer: 'a', key: 'c3', label: 'Color 3', value: P.hslToHex(290, 0.7, 0.45) });
  const f = fixOf(P.propose(M), 'clash');
  assert.ok(f && f.sliders.length >= 1 && f.expect === 0, JSON.stringify(f));
  assert.ok(f.palette.length === 2);
  assert.ok(!f.sliders.some((s) => s.key === 'c1'), 'the lead color stays');
});
ok('colors clashing with no color sliders → tamed on the grade, and left for the director too', () => {
  const M = GOOD(); M.pic.palette = [{ hex: '#d02020', share: 0.3 }, { hex: P.hslToHex(70, 0.7, 0.45), share: 0.3 }, { hex: P.hslToHex(290, 0.7, 0.45), share: 0.3 }];
  const r = P.propose(M); assert.ok(fixOf(r, 'clash').grade.vibrance < 0); assert.ok(r.left.some((l) => l.id === 'clash'));
});
ok('the grade\'s own color sliders never count as the scene\'s colors', () => {
  const M = GOOD(); M.sliders.push({ layer: 'g', layerName: '◐ Grade', key: 'splitShadows', value: '#1f6f8b' }, { layer: 'g', layerName: '◐ Grade', key: 'barColor', value: P.hslToHex(70, 0.7, 0.45) });
  assert.ok(!fixOf(P.propose(M), 'clash'));
});
ok('detail under the 9:16 buttons → a zoom slider pulls the picture in; no zoom slider: left for the director', () => {
  const M = GOOD(); M.under = [{ id: 'bottom', label: 'the caption and the sound name', k: 2.1 }];
  const f = fixOf(P.propose(M), 'safe'); assert.ok(f.sliders[0].key === 'zoom' && f.sliders[0].to < 1);
  M.sliders = M.sliders.filter((s) => s.key !== 'zoom');
  const r = P.propose(M); assert.ok(!fixOf(r, 'safe') && /caption/.test(r.left.find((l) => l.id === 'safe').text));
});
ok('a camera distance or a field of view goes up instead', () => {
  const M = GOOD(); M.under = [{ id: 'right', label: 'the buttons', k: 1.8 }]; M.sliders = [{ layer: 'a', key: 'fov', label: 'FOV', value: 50, min: 20, max: 100 }];
  assert.ok(fixOf(P.propose(M), 'safe').sliders[0].to > 50);
});
ok('too static → the speed slider moves (from 0: a quarter of its range); none: a slow wave on two sliders', () => {
  const M = GOOD(); M.motion = { motion: 0.001, spread: 0, flicker: 0, n: 4 }; M.sliders[0].value = 0;
  const f = fixOf(P.propose(M), 'static'); assert.strictEqual(f.sliders[0].to, 1);
  M.sliders = [{ layer: 'a', key: 'twist', label: 'Twist', value: 0.3, min: 0, max: 1, live: true }, { layer: 'a', key: 'count', label: 'Count', value: 12, min: 1, max: 50, step: 1 }];
  const g = fixOf(P.propose(M), 'static'); assert.ok(g.motions.length === 1 && g.motions[0].to.kind === 'lfo' && g.motions[0].from === null);
});
ok('a frozen preview isn\'t called static', () => { const M = GOOD(); M.motion = { motion: 0, spread: 0, flicker: 0, n: 4 }; M.frozen = true; assert.ok(!fixOf(P.propose(M), 'static')); });
ok('jittery (big frame-to-frame change, no travel) → shake / speed sliders calmer; smooth fast travel is fine', () => {
  const M = GOOD(); M.motion = { motion: 0.15, spread: 0.8, flicker: 0.01, n: 4 }; M.sliders.push({ layer: 'a', key: 'shake', label: 'Shake', value: 1, min: 0, max: 1 });
  const f = fixOf(P.propose(M), 'jitter'); assert.ok(f.sliders.some((s) => s.key === 'shake' && s.to < 1));
  M.motion.spread = 0.2; assert.ok(!fixOf(P.propose(M), 'jitter'));
});
ok('the music barely moving it → reactions made stronger; none at all → the "make it react" plan; no sound → no rule', () => {
  const M = GOOD(); M.sliders[1].followsMusic = { band: 'kickOn', amount: 0.05, c: { rel: 180 } };
  const f = fixOf(P.propose(M), 'music'); assert.ok(f.bindings[0].to.amount > 0.05 && f.bindings[0].to.c.rel === 180 && f.bindings[0].from.amount === 0.05);
  delete M.sliders[1].followsMusic; M.reactPlan = [{ layer: 'a', key: 'zoom', label: 'Zoom', band: 'kick', amount: 0.45 }];
  const g = fixOf(P.propose(M), 'music'); assert.ok(g.bindings[0].to.band === 'kick' && g.bindings[0].from === null);
  M.sound = null; assert.ok(!fixOf(P.propose(M), 'music'));
});
ok('frame rate dips → Light mode (not when it is already on)', () => {
  const M = GOOD(); M.perf = { fps: 31, cap: 60, light: false };
  assert.ok(fixOf(P.propose(M), 'fps').light);
  M.perf.light = true; assert.ok(!fixOf(P.propose(M), 'fps'));
});
ok('merge: grade values on top of the scene\'s own, later slider moves win, the "from" of the first kept', () => {
  const M = GOOD(); M.grade = { contrast: 1.1, temp: 0.2 };
  const m = P.merge([{ grade: { exposure: 1 }, sliders: [{ layer: 'a', key: 'speed', from: 0, to: 1 }] }, { grade: { contrast: 1.3 }, sliders: [{ layer: 'a', key: 'speed', from: 1, to: 2 }], light: true }], M);
  assert.strictEqual(m.grade.exposure, 1); assert.strictEqual(m.grade.contrast, 1.3); assert.strictEqual(m.grade.temp, 0.2);
  assert.deepStrictEqual(m.sliders, [{ layer: 'a', key: 'speed', from: 0, to: 2 }]); assert.strictEqual(m.light, true); assert.strictEqual(m.lens, null);
  assert.deepStrictEqual(P.merge([], M), { grade: null, lens: null, sliders: [], bindings: [], motions: [], palette: null, light: null });
});
ok('the deliberately bad scene (dark, clashing, static) gets all three fixes and a low score', () => {
  const M = GOOD(); Object.assign(M.pic, { p95: 0.16, mean: 0.05, q50: 0.04 }); M.motion = { motion: 0.0005, spread: 0, flicker: 0, n: 4 }; M.sliders[0].value = 0;
  M.sliders.push({ layer: 'a', key: 'c1', value: '#d02020' }, { layer: 'a', key: 'c2', value: P.hslToHex(70, 0.7, 0.45) }, { layer: 'a', key: 'c3', value: P.hslToHex(290, 0.7, 0.45) });
  const r = P.propose(M);
  assert.deepStrictEqual(ids(r).filter((x) => ['clash', 'dark', 'static'].includes(x)), ['clash', 'dark', 'static']);
  assert.ok(r.score < 70, r.score);
});

// ---------- the readers, on generated frames ----------
function frame({ w = 90, h = 160, bg = 5, grad = 0.6, dot = [200, 200, 200], at = [0.5, 0.5], r = 0.15, noise = 0, seed = 3, white = 0 } = {}) {
  const d = new Uint8ClampedArray(w * h * 4); let s = seed;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = (y * w + x) * 4; const inDot = Math.hypot(x / w - at[0], (y / h - at[1]) * (h / w)) < r;
    let c = inDot ? dot : [bg + y * grad, bg + y * grad, bg + y * grad];
    if (white && y < h * white) c = [255, 255, 255];
    s = (s * 16807) % 2147483647; const nz = noise ? ((s / 2147483647) - 0.5) * noise : 0;
    d[i] = c[0] + nz; d[i + 1] = c[1] + nz; d[i + 2] = c[2] + nz; d[i + 3] = 255;
  }
  return d;
}
ok('picture(): pure black, shadows and blown whites measured', () => {
  const p = P.picture(frame({ white: 0.3 }), 90, 160);
  assert.ok(p.whites > 0.25 && p.whites < 0.36, p.whites);
  const q = P.picture(frame({ bg: 0 }), 90, 160);
  assert.ok(q.crushed > 0 && q.shadows > 0, JSON.stringify({ c: q.crushed, s: q.shadows }));
});
ok('motion(): still frames → 0; a dot travelling → motion over a part of the picture; noise flicker → all of it', () => {
  const still = [0, 1, 2].map(() => P.gray(frame(), 90, 160));
  assert.strictEqual(P.motion(still).motion, 0);
  const travel = [0, 1, 2, 3].map((k) => P.gray(frame({ at: [0.2 + k * 0.2, 0.5], r: 0.1 }), 90, 160));
  const mt = P.motion(travel); assert.ok(mt.motion > 0.004 && mt.spread < 0.2, JSON.stringify(mt));
  const flick = [0, 1, 2, 3].map((k) => P.gray(frame({ noise: 200, seed: 11 + k * 7919 }), 90, 160));
  const mf = P.motion(flick); assert.ok(mf.motion > 0.08 && mf.spread > 0.45, JSON.stringify(mf));
  const M = GOOD(); M.motion = mt; assert.ok(!P.propose(M).fixes.some((f) => f.id === 'jitter'), 'travel is not jitter');
});
ok('under(): a busy dot in TikTok\'s caption area is found; one in the middle is not', () => {
  const PK = require('../publishkit-core.js'); const zones = PK.zonesFor('tiktok', 9 / 16);
  const low = [0, 1].map((k) => P.gray(frame({ grad: 0, bg: 30, at: [0.4, 0.9], r: 0.12, dot: [255, 255 - 60 * k, 255] }), 90, 160));
  assert.ok(P.under(low, 90, 160, zones).some((z) => z.id === 'bottom'));
  const mid = [0, 1].map(() => P.gray(frame({ grad: 0, bg: 30, at: [0.45, 0.5], r: 0.12 }), 90, 160));
  assert.strictEqual(P.under(mid, 90, 160, zones).length, 0);
});
ok('the score goes up when a reading is fixed; brief and cost stay short', () => {
  const M = GOOD(); Object.assign(M.pic, { p95: 0.16, mean: 0.05 });
  const r = P.propose(M); const after = P.score(GOOD());
  assert.ok(after > r.score);
  const f = r.fixes.map((x) => ({ ...x, afterText: '80 %' }));
  const t = P.brief({ fixes: f, left: [{ text: 'keep the subject clear of the buttons' }], before: r.score, after, note: 'warmer please' });
  assert.ok(/Left for you: keep the subject/.test(t) && /warmer please/.test(t) && /brightest parts 1\d % → 80 %/.test(t));
  assert.ok(P.cost(t) < 200, P.cost(t));
});
console.log(`${n} passed${process.exitCode ? ' (some failed)' : ''}`);
