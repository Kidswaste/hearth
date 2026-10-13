// Node tests for 🎲 Variations (tools/three-variations-core.js): sorting values into colors / motion / camera / look,
// what's left out (setup-only, keyframed), a set of clearly different takes, seeds, locks, "More like this" staying
// closer, words steering it, the palette turning with the colors.
//   node dev/labvariations-test.js
const assert = require('assert');
const V = require('../tools/three-variations-core.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };

const SL = [
  { layer: 'a', layerName: 'Orb', key: 'c1', label: 'Color 1', value: '#d04a2a', live: true },
  { layer: 'a', layerName: 'Orb', key: 'c2', label: 'Glow color', value: '#2a8ad0', live: true },
  { layer: 'a', layerName: 'Orb', key: 'speed', label: 'Speed', value: 1, min: 0, max: 4, live: true },
  { layer: 'a', layerName: 'Orb', key: 'spin', label: 'Spin', value: 0.5, min: -2, max: 2, live: true },
  { layer: 'a', layerName: 'Orb', key: 'camDist', label: 'Camera distance', value: 6, min: 2, max: 20, live: true },
  { layer: 'a', layerName: 'Orb', key: 'fov', label: 'FOV', value: 50, min: 20, max: 100, step: 1, live: true },
  { layer: 'a', layerName: 'Orb', key: 'bloom', label: 'Bloom', value: 0.6, min: 0, max: 2, live: true },
  { layer: 'a', layerName: 'Orb', key: 'rough', label: 'Roughness', value: 0.4, min: 0, max: 1, live: true },
  { layer: 'a', layerName: 'Orb', key: 'count', label: 'Count', value: 200, min: 10, max: 1000, step: 1, live: false },
  { layer: 'a', layerName: 'Orb', key: 'size', label: 'Size', value: 1, min: 0.5, max: 2, live: true, keyed: true },
  { layer: 'g', layerName: '◐ Grade', key: 'exposure', label: 'Exposure', value: 0, min: -3, max: 3, live: true },
];
const P = V.params(SL);
const by = (id) => P.find((p) => p.id === id);

ok('sorted into colors / motion / camera / look (the grade is look)', () => {
  assert.strictEqual(by('a|c1').group, 'colors'); assert.strictEqual(by('a|c2').group, 'colors');
  assert.strictEqual(by('a|speed').group, 'motion'); assert.strictEqual(by('a|spin').group, 'motion');
  assert.strictEqual(by('a|camDist').group, 'camera'); assert.strictEqual(by('a|fov').group, 'camera');
  assert.strictEqual(by('a|bloom').group, 'look'); assert.strictEqual(by('a|rough').group, 'look'); assert.strictEqual(by('g|exposure').group, 'look');
  assert.strictEqual(V.groupOf({ key: 'orbitSpeed', label: 'Orbit speed', kind: 'number' }), 'motion');
});
ok('setup-only and keyframed values are left out', () => { assert.ok(!by('a|count') && !by('a|size')); assert.strictEqual(P.length, 9); });
const set = V.make(P, { n: 6, seed: 7 });
ok('6 takes, each different from the scene and from each other, each leaning on a group', () => {
  assert.strictEqual(set.length, 6);
  const sigs = new Set(set.map((v) => JSON.stringify(v.values)));
  assert.strictEqual(sigs.size, 6);
  for (const v of set) assert.ok(v.changed.length > 0);
  assert.deepStrictEqual(set.slice(0, 5).map((v) => v.lean), ['colors', 'motion', 'camera', 'look', 'mix']);
});
ok('values stay in range, whole numbers stay whole, colors stay hex', () => {
  for (const v of set) for (const p of P) {
    const x = v.values[p.id];
    if (p.kind === 'number') { assert.ok(x >= p.min && x <= p.max, `${p.id} ${x}`); if (p.int) assert.ok(Number.isInteger(x)); }
    if (p.kind === 'color') assert.ok(/^#[0-9a-f]{6}$/.test(x));
  }
});
ok('the colors take turns clearly; the motion take changes speed by a factor', () => {
  const c = set.find((v) => v.lean === 'colors');
  const h0 = V.hexToHsl('#d04a2a')[0]; const h1 = V.hexToHsl(c.values['a|c1'])[0];
  const gap = Math.min(Math.abs(h0 - h1), 360 - Math.abs(h0 - h1));
  assert.ok(gap > 25, gap); assert.ok(Math.abs(c.hue) >= 30, c.hue);
  const m = set.find((v) => v.lean === 'motion');
  const k = m.values['a|speed'] / 1;
  assert.ok(k > 1.3 || k < 0.75, k);
});
ok('the same seed gives the same set', () => { assert.deepStrictEqual(V.make(P, { n: 6, seed: 7 }), set); });
ok('a lock keeps its group as it is', () => {
  const s = V.make(P, { n: 6, seed: 3, locks: ['colors', 'camera'] });
  assert.ok(s.length >= 4);
  for (const v of s) { assert.strictEqual(v.values['a|c1'], '#d04a2a'); assert.strictEqual(v.values['a|fov'], 50); assert.strictEqual(v.hue, 0); }
  assert.ok(!s.some((v) => v.lean === 'colors' || v.lean === 'camera'));
});
ok('everything locked: no variations', () => { assert.deepStrictEqual(V.make(P, { locks: ['colors', 'motion', 'camera', 'look'] }), []); });
ok('"More like this" stays closer to the picked one than a fresh set', () => {
  const pick = set[4].values;
  const dist = (a, b) => P.filter((p) => p.kind === 'number').reduce((s, p) => s + Math.abs(a[p.id] - b[p.id]) / (p.max - p.min), 0);
  const fresh = V.make(P, { n: 6, seed: 11, base: pick });
  const close = V.make(P, { n: 6, seed: 11, base: pick, closer: true });
  const avg = (s) => s.reduce((t, v) => t + dist(v.values, pick), 0) / s.length;
  assert.ok(avg(close) < avg(fresh) * 0.75, `${avg(close)} vs ${avg(fresh)}`);
  assert.ok(close.every((v) => /a little|Close to it/.test(v.label)));
});
ok('words steer it: "calmer colors" leans on colors and motion, motion goes down', () => {
  const st = V.steer('calmer colors');
  assert.deepStrictEqual(st.lean, ['colors', 'motion']); assert.strictEqual(st.dir, -1);
  const s = V.make(P, { n: 4, seed: 5, steer: st });
  assert.ok(s.every((v) => ['colors', 'motion'].includes(v.lean)));
  assert.ok(s.every((v) => v.values['a|speed'] <= 1), s.map((v) => v.values['a|speed']));
  assert.strictEqual(V.steer(''), null);
});
ok('"warmer" turns colors toward orange', () => {
  const s = V.make(P, { n: 3, seed: 9, steer: V.steer('warmer') });
  const h = V.hexToHsl(s[0].values['a|c2'])[0];
  const h0 = V.hexToHsl('#2a8ad0')[0];
  const toOrange = (x) => Math.min(Math.abs(x - 30), 360 - Math.abs(x - 30));
  assert.ok(toOrange(h) < toOrange(h0), `${h0} → ${h}`);
});
ok('the palette turns with the colors; greys stay grey; byLayer / diff', () => {
  const pal = V.shiftPalette(['#ff0000', '#808080'], 120);
  assert.strictEqual(pal[0], '#00ff00'); assert.strictEqual(pal[1], '#808080');
  const b = V.byLayer(P, set[0].values, Object.fromEntries(P.map((p) => [p.id, p.value])));
  assert.ok(b.a && Object.keys(b.a).every((k) => set[0].values[`a|${k}`] !== by(`a|${k}`).value));
  assert.ok(Object.keys(V.diff(P, set[0].values, Object.fromEntries(P.map((p) => [p.id, p.value])))).includes('colors'));
});
console.log(`${n} tests${process.exitCode ? ' (some failed)' : ', all pass'}`);
