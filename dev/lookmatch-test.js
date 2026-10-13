// Node tests for "Make it look like this" (tools/three-lookmatch-core.js), on generated pictures: the reading (bars,
// levels, tints, kelvin, vignette, glow, grain — on top of the board's vibe), clips merged from frames, and the
// match: each kind of reference moves the right ◐ Grade / Film & lens values the right way (warm / cool, faded,
// black & white, contrast, grain, vignette, bars, split toning, glow), a reference equal to the scene changes nothing,
// refine() closes what's left, the brief and the cost.
//   node dev/lookmatch-test.js
const assert = require('assert');
const L = require('../tools/three-lookmatch-core.js');
const G = require('../tools/three-grade-core.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };

// a test picture, 200 × 112: a diagonal gradient with three color blobs, then the look on top
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function pic({ w = 200, h = 112, gain = 1, black = 0, white = 1, warm = 0, sat = 1, grain = 0, vig = 0, bars = 0, shadow = null, high = null, glow = 0, gamma = 1 } = {}) {
  seed = 7;
  const d = new Uint8ClampedArray(w * h * 4);
  const bh = Math.round(h * bars);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = (y * w + x) * 4;
    if (y < bh || y >= h - bh) { d[i] = d[i + 1] = d[i + 2] = 2; d[i + 3] = 255; continue; }
    const t = (x / w) * 0.7 + (y / h) * 0.3;
    let c = [t, t, t];
    const blob = (cx, cy, r, col) => { const k = Math.max(0, 1 - Math.hypot(x / w - cx, y / h - cy) / r); for (let j = 0; j < 3; j += 1) c[j] = c[j] * (1 - k) + col[j] * k; };
    blob(0.25, 0.4, 0.25, [0.85, 0.25, 0.2]); blob(0.6, 0.6, 0.22, [0.2, 0.6, 0.35]); blob(0.8, 0.3, 0.2, [0.2, 0.35, 0.85]);
    if (glow && Math.hypot(x / w - 0.5, y / h - 0.5) < glow) c = [1, 1, 1];
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    c = c.map((v) => lum + (v - lum) * sat);
    c = c.map((v) => Math.max(0, v) ** gamma);
    c = c.map((v) => black + (white - black) * Math.min(1, v * gain));
    c[0] += warm * 0.12; c[2] -= warm * 0.12;
    if (shadow && lum < 0.35) for (let j = 0; j < 3; j += 1) c[j] += shadow[j] * (0.35 - lum) * 2;
    if (high && lum > 0.6) for (let j = 0; j < 3; j += 1) c[j] += high[j] * (lum - 0.6) * 2;
    if (vig) { const dd = Math.hypot(x / w - 0.5, y / h - 0.5) / 0.7071; c = c.map((v) => v * (1 - vig * dd * dd)); }
    if (grain) { const nz = (rnd() - 0.5) * grain; c = c.map((v) => v + nz); }
    d[i] = Math.round(Math.max(0, Math.min(1, c[0])) * 255); d[i + 1] = Math.round(Math.max(0, Math.min(1, c[1])) * 255); d[i + 2] = Math.round(Math.max(0, Math.min(1, c[2])) * 255); d[i + 3] = 255;
  }
  return L.analyze(d, w, h);
}
const base = pic();

ok('analyze: the board vibe + levels, tints, kelvin, vignette, glow, bars', () => {
  for (const k of ['palette', 'light', 'contrast', 'sat', 'warmth', 'grain', 'p5', 'q25', 'q50', 'q75', 'p95', 'shadowTint', 'highTint', 'gm', 'kelvin', 'vignette', 'glow', 'bars']) assert(k in base, `missing ${k}`);
  assert(base.palette.length >= 3 && base.palette.every((c) => /^#[0-9a-f]{6}$/.test(c.hex) && c.share > 0));
  assert(base.p5 < base.q25 && base.q25 < base.q50 && base.q50 < base.q75 && base.q75 < base.p95);
  assert.strictEqual(base.bars, 'off');
});
ok('kelvin: warm pictures read lower, cool ones higher (neutral ≈ daylight)', () => {
  const warm = pic({ warm: 1 }); const cool = pic({ warm: -1 });
  assert(warm.kelvin < base.kelvin && base.kelvin < cool.kelvin, `${warm.kelvin} ${base.kelvin} ${cool.kelvin}`);
  assert(base.kelvin > 4500 && base.kelvin < 9000, String(base.kelvin));
});
ok('letterbox bars are found and named; the look is read inside them', () => {
  const b = pic({ bars: 0.12 });
  assert(['2.39:1', '2.35:1', '2:1'].includes(b.bars), b.bars);
  assert(Math.abs(b.q50 - base.q50) < 0.06, `${b.q50} vs ${base.q50}`);
});
ok('vignette, glow and grain read', () => {
  assert(pic({ vig: 0.8 }).vignette > base.vignette + 0.2);
  assert(pic({ glow: 0.2 }).glow > base.glow + 0.05);
  assert(pic({ grain: 0.35 }).grain > base.grain + 0.15);
});
ok('the same picture as the scene: (almost) nothing changes', () => {
  const m = L.match(base, base);
  const ch = G.changed('grade', m.grade);
  delete ch.cL1; delete ch.cL2; delete ch.cL3;
  assert.deepStrictEqual(Object.keys(ch), [], JSON.stringify(ch));
  for (const [k, x] of [['cL1', 0.25], ['cL2', 0.5], ['cL3', 0.75]]) assert(Math.abs(m.grade[k] - x) < 0.03, `${k} ${m.grade[k]}`);
  assert.strictEqual(m.lens, null);
  assert(m.gap < 0.02, String(m.gap));
});
ok('warmer reference → temperature up (cooler → down)', () => {
  assert(L.match(pic({ warm: 1 }), base).grade.temp > 0.1);
  assert(L.match(pic({ warm: -1 }), base).grade.temp < -0.1);
});
ok('faded reference (lifted blacks, dim whites) → lift up, gain down, softer curve', () => {
  const m = L.match(pic({ black: 0.18, white: 0.82 }), base);
  assert(m.grade.liftLum > 0.2, `lift ${m.grade.liftLum}`); assert(m.grade.gainLum < 0, `gain ${m.grade.gainLum}`);
  assert(m.grade.cL3 - m.grade.cL1 < 0.5, `${m.grade.cL1}..${m.grade.cL3}`);
  assert(m.why.some((w) => /faded/.test(w)));
});
ok('punchier reference → steeper curve; a darker one → lower mids', () => {
  const hard = L.match(pic({ gamma: 1, gain: 1.6, black: -0.25 }), base);
  assert(hard.grade.cL3 - hard.grade.cL1 > 0.55, `${hard.grade.cL1}..${hard.grade.cL3}`);
  assert(L.match(pic({ gamma: 2.2 }), base).grade.cL2 < 0.42);
});
ok('black & white reference → saturation 0; muted → below 1; vivid → above 1', () => {
  assert.strictEqual(L.match(pic({ sat: 0 }), base).grade.saturation, 0);
  assert(L.match(pic({ sat: 0.4 }), base).grade.saturation < 0.9);
  assert(L.match(pic({ sat: 1.6 }), pic({ sat: 0.7 })).grade.saturation > 1.1);
});
ok('grain, vignette and bars carry over; glow becomes bloom (Film & lens)', () => {
  const m = L.match(pic({ grain: 0.4, vig: 0.8, bars: 0.12, glow: 0.22 }), base);
  assert(m.grade.grain > 0.1, `grain ${m.grade.grain}`); assert(m.grade.vignette > 0.1, `vig ${m.grade.vignette}`); assert(m.grade.bars !== 'off');
  assert(m.lens && m.lens.bloom > 0.1, JSON.stringify(m.lens));
});
ok('split toning: teal shadows / orange highlights land on the lift and gain wheels with the right hues', () => {
  const m = L.match(pic({ shadow: [-0.15, 0.05, 0.12], high: [0.15, 0.04, -0.12] }), base);
  assert(m.grade.liftAmt > 0.05 && m.grade.liftHue > 150 && m.grade.liftHue < 230, `lift ${m.grade.liftHue} ${m.grade.liftAmt}`);
  assert(m.grade.gainAmt > 0.05 && (m.grade.gainHue < 60 || m.grade.gainHue > 340), `gain ${m.grade.gainHue} ${m.grade.gainAmt}`);
});
ok('every value is inside its slider\'s range; the code builds', () => {
  const m = L.match(pic({ black: 0.3, warm: 1, sat: 0, grain: 0.8, vig: 1, bars: 0.15, glow: 0.3 }), pic({ gamma: 3 }));
  for (const [k, v] of Object.entries(m.grade)) { const s = G.SPEC[k]; if (typeof v === 'number') assert(v >= s.min && v <= s.max, `${k}=${v}`); }
  assert(/filter\('cgrade'/.test(G.code('grade', m.grade)));
});
ok('palette: the reference\'s colors, strongest first', () => {
  const m = L.match(base, base);
  assert.deepStrictEqual(m.palette, base.palette.map((c) => c.hex));
});
ok('refine: what\'s still off moves the tone points and saturation toward the reference', () => {
  const ref = pic({ gamma: 0.6, sat: 0.5 });
  const v = L.match(ref, base).grade;
  const got = { ...ref, q25: ref.q25 - 0.1, q50: ref.q50 - 0.1, q75: ref.q75 - 0.1, sat: ref.sat * 1.3 };
  const r = L.refine(v, ref, got);
  assert(r.cL2 > v.cL2 + 0.05, `${v.cL2} → ${r.cL2}`); assert(r.saturation < v.saturation, `${v.saturation} → ${r.saturation}`);
});
ok('gap / closeness: the same look is 100 %, very different ones are far', () => {
  assert.strictEqual(L.closeness(base, base), 100);
  assert(L.gap(pic({ sat: 0, black: 0.3 }), pic({ warm: 1, gamma: 2 })) > 0.15);
});
ok('merge: frames of a clip become one look (numbers averaged, palette merged, bars by majority)', () => {
  const a = pic({ warm: 1 }); const b = pic({ warm: -1 }); const c = pic({ warm: 0, bars: 0.12 });
  const m = L.merge([a, b, c]);
  assert(Math.abs(m.warmth - (a.warmth + b.warmth + c.warmth) / 3) < 0.01);
  assert(m.palette.length >= 3); assert.strictEqual(m.bars, 'off'); assert.strictEqual(m.frames, 3);
  assert.strictEqual(L.merge([]), null);
});
ok('words and the director\'s brief: plain, short (≈ ≤ 200 tokens), motion included for clips', () => {
  const ref = { ...pic({ warm: 1, grain: 0.3 }), motion: 0.45, cutCount: 3, pace: 2.1, cutsPerMin: 20, duration: 8 };
  const w = L.words(ref);
  assert(w.some((x) => /K$/.test(x)) && w.some((x) => /motion/.test(x)));
  const t = L.brief(ref, { title: 'beach.mp4', kind: 'clip', note: 'more chrome please' });
  assert(/look like this/.test(t) && /palette #/.test(t) && /motion lively/.test(t) && /more chrome please/.test(t) && /◐ Grade/.test(t), t);
  assert(t.length / 3.6 < 200, `${Math.round(t.length / 3.6)} tokens`);
});
ok('cost: picture tokens from its size + words', () => {
  const c = L.cost({ w: 384, h: 216 }, 'x'.repeat(360));
  assert.strictEqual(c.image, Math.ceil((384 * 216) / 750)); assert.strictEqual(c.text, 100); assert.strictEqual(c.total, c.image + 100);
});
console.log(`${n} passed${process.exitCode ? ' (some failed)' : ''}`);
