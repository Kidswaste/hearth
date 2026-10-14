// Node tests for 📜 Recipes (tools/three-recipes-core.js): capture (what changed between two snapshots of a scene:
// slider moves, ♪ links, the palette, a new layer; a code change isn't a slider move; layers made by a step are
// referenced by that step), one step per change (compress), plain words, replay mapping (a slider found by key, label
// or role, values kept in their place in the range, choices, links' ranges), the preview of what fits a scene (a
// skipped step with its note), the file check, editing (move / drop / orphans), search, and the .hearthpack round trip
// of a recipe (packs-core + packsmain: kind "recipe", no scene, its steps kept).
//   node dev/labrecipes-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../tools/three-recipes-core.js');
const P = require('../packs-core.js');
let n = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

// two snapshots of one scene: the owner moved "Glow amount", linked "Speed" to the kick, changed the palette, added a layer
const ctl = (v, extra = {}) => ({ v, link: null, label: 'x', group: '', type: typeof v === 'number' ? 'number' : 'color', min: 0, max: 3, ...extra });
const A = {
  scene: 's1', palette: ['#111111'],
  layers: [{ id: 'main', name: 'Orb', sel: true, filter: null, h: 'a' }, { id: 'g', name: 'Glow', sel: false, filter: 'glow', h: 'b' }],
  ctl: { main: { glow: ctl(1.2, { label: 'Glow amount', group: 'Look' }), speed: ctl(1, { label: 'Speed', max: 5 }), tint: ctl('#ff0000', { label: 'Tint', min: undefined, max: undefined }) }, g: { amount: ctl(0.5, { label: 'Amount', max: 1 }) } },
};
const B = JSON.parse(JSON.stringify(A));
B.ctl.main.glow.v = 2.4;
B.ctl.main.speed.link = { band: 'kick', how: 'pulse', lo: 1, hi: 4 };
B.palette = ['#ff00aa', '#00ffaa'];
B.layers.push({ id: 'new1', name: 'Rings', sel: false, filter: null, h: 'c' });
B.ctl.new1 = { count: ctl(12, { label: 'Count', max: 40 }) };
B.layers[1].h = 'b2'; B.ctl.g.amount.v = 0.9; // the Glow layer's code changed: its slider moved with it

ok('capture: a slider move, a ♪ link, the palette and a new layer; a code change is not a slider move', () => {
  const madeBy = new Map();
  const s = C.snapDiff(A, B, { madeBy, codeOf: (id) => (id === 'new1' ? { code: 'rings()', props: { blend: 'add' } } : null) });
  const kinds = s.map((x) => x.k);
  assert.deepStrictEqual(kinds.sort(), ['layer', 'link', 'palette', 'slider'].sort(), JSON.stringify(s));
  const sl = s.find((x) => x.k === 'slider');
  assert.deepStrictEqual([sl.key, sl.label, sl.v, sl.min, sl.max, sl.on.name, sl.on.sel, sl.group], ['glow', 'Glow amount', 2.4, 0, 3, 'Orb', true, 'Look']);
  assert.deepStrictEqual(s.find((x) => x.k === 'link').link, { band: 'kick', how: 'pulse', lo: 1, hi: 4 });
  const ly = s.find((x) => x.k === 'layer');
  assert.deepStrictEqual([ly.name, ly.code, ly.props.blend], ['Rings', 'rings()', 'add']);
  assert.deepStrictEqual(madeBy.get('new1'), { made: ly.sid, n: 0 }, 'a layer it made is known by the step');
  // a later move on that layer points at the step, not at a name
  const B2 = JSON.parse(JSON.stringify(B)); B2.ctl.new1.count.v = 20;
  const s2 = C.snapDiff(B, B2, { madeBy });
  assert.deepStrictEqual(s2[0].on, { made: ly.sid, n: 0 });
  // another scene on screen: nothing
  assert.strictEqual(C.snapDiff(A, { ...B, scene: 's2' }).length, 0);
});

ok('one step per change: a drag session keeps its last value; frame / palette in a row keep the last one', () => {
  const on = { name: 'Orb' };
  const s = [
    { sid: '1', k: 'slider', on, key: 'glow', v: 1 }, { sid: '2', k: 'slider', on, key: 'speed', v: 2 }, { sid: '3', k: 'slider', on, key: 'glow', v: 1.5 },
    { sid: '4', k: 'frame', id: '9:16' }, { sid: '5', k: 'frame', id: '1:1' },
    { sid: '6', k: 'slider', on, key: 'glow', v: 2 }, { sid: '7', k: 'palette', colors: ['#000000'] }, { sid: '8', k: 'palette', colors: ['#ffffff'] },
  ];
  assert.deepStrictEqual(C.compress(s).map((x) => x.sid), ['2', '3', '5', '6', '8']);
});

ok('plain words for every kind of step', () => {
  const d = (s) => C.describe(s);
  assert.strictEqual(d({ k: 'fx', fx: { kind: 'filter', id: 'glow', name: 'Glow' } }), 'Filter: Glow');
  assert.strictEqual(d({ k: 'slider', key: 'glow', label: 'Glow amount', v: 2.4, on: { name: 'Orb' } }), '"Glow amount" → 2.4 (on Orb)');
  assert.strictEqual(d({ k: 'link', key: 'speed', label: 'Speed', link: { band: 'kick', how: 'pulse' }, on: { made: 'x' } }), '♪ "Speed" pulses on the kick (on the layer it made)');
  assert.strictEqual(d({ k: 'frame', id: '9:16' }), 'Frame size 9:16');
  assert.strictEqual(d({ k: 'export', set: { format: 'mp4', size: '4k', fps: 60, ss: 2 } }), '⇪ Export settings: mp4 · 4k · 60 fps · supersample 2×');
  assert.strictEqual(d({ k: 'layer', name: 'Rings', from: 'gallery' }), 'Layer from the gallery: Rings');
  assert.ok(/^5 steps: 3 sliders/.test(C.summary({ steps: [{ k: 'slider' }, { k: 'slider' }, { k: 'slider' }, { k: 'fx' }, { k: 'frame' }] })));
});

// a different scene: a "Bloom" slider (same role as glow), Speed with another range, no tint, a choice
const OTHER = [
  { id: 'L1', name: 'Tunnel', sel: true, filter: null, ctls: [{ key: 'bloom', label: 'Bloom', group: 'Look', value: 0.2, min: 0, max: 1, type: 'number' }, { key: 'speed', label: 'Speed', value: 3, min: 0, max: 10, type: 'number' }, { key: 'mode', label: 'Mode', value: 'a', options: ['a', 'b'], type: 'choice' }] },
  { id: 'L2', name: 'Orb', sel: false, filter: null, ctls: [{ key: 'size', label: 'Size', value: 1, min: 0, max: 2, type: 'number' }] },
];
ok('replay mapping: by key, by label, by role; numbers keep their place in the range; a choice must exist', () => {
  const glow = { k: 'slider', on: { name: 'Orb', sel: true }, key: 'glow', label: 'Glow amount', group: 'Look', type: 'number', v: 1.5, min: 0, max: 3 };
  const m = C.matchSlider(glow, OTHER);
  assert.deepStrictEqual([m.layer.name, m.ctl.key, m.how], ['Tunnel', 'bloom', 'role']);
  assert.strictEqual(C.valueFor(glow, m.ctl), 0.5, 'half of 0–3 is half of 0–1');
  const sp = { k: 'slider', on: { name: 'Orb' }, key: 'speed', label: 'Speed', type: 'number', v: 2, min: 0, max: 5 };
  const m2 = C.matchSlider(sp, OTHER);
  assert.deepStrictEqual([m2.ctl.key, m2.how], ['speed', 'key']);
  assert.strictEqual(C.valueFor(sp, m2.ctl), 4, 'another range: same place');
  assert.strictEqual(C.valueFor({ ...sp, min: 0, max: 10 }, m2.ctl), 2, 'the same range: the value itself');
  const tint = { k: 'slider', on: { name: 'Orb' }, key: 'tint', label: 'Tint', type: 'color', v: '#ff0000' };
  assert.ok(/no slider like "Tint"/.test(C.matchSlider(tint, OTHER).why));
  assert.strictEqual(C.matchSlider({ k: 'slider', on: {}, key: 'mode', label: 'Mode', type: 'choice', v: 'c', options: ['c'] }, OTHER).why, 'no slider like "Mode" here');
  assert.strictEqual(C.matchSlider({ k: 'slider', on: {}, key: 'mode', label: 'Mode', type: 'choice', v: 'b' }, OTHER).ctl.key, 'mode');
  // a layer with the same name wins over the selected one for the same key
  const two = [{ id: 'a', name: 'Back', sel: true, ctls: [{ key: 'size', label: 'Size', value: 1, min: 0, max: 2 }] }, { id: 'b', name: 'Orb', ctls: [{ key: 'size', label: 'Size', value: 1, min: 0, max: 2 }] }];
  assert.strictEqual(C.matchSlider({ k: 'slider', on: { name: 'Orb' }, key: 'size', label: 'Size', type: 'number', v: 1 }, two).layer.id, 'b');
  // a link's range follows the slider found
  const lk = C.linkFor({ k: 'link', min: 0, max: 3, link: { band: 'kick', how: 'pulse', lo: 0, hi: 3 } }, { min: 0, max: 1 });
  assert.deepStrictEqual([lk.lo, lk.hi, lk.band], [0, 1, 'kick']);
  // a step on a layer the recipe made: that layer only
  const made = new Map([['s9', ['L2']]]);
  assert.strictEqual(C.matchSlider({ k: 'slider', on: { made: 's9', n: 0 }, key: 'size', label: 'Size', type: 'number', v: 1 }, OTHER, made).layer.id, 'L2');
  assert.ok(/wasn't made/.test(C.matchSlider({ k: 'slider', on: { made: 'zz' }, key: 'size', label: 'Size', v: 1 }, OTHER, made).why));
});

ok('roles: glow ≈ bloom, speed ≈ tempo, background, unknown words have none', () => {
  assert.strictEqual(C.roleOf('Glow amount'), 'glow');
  assert.strictEqual(C.roleOf('Bloom'), 'glow');
  assert.strictEqual(C.roleOf('Tempo'), 'speed');
  assert.strictEqual(C.roleOf('Background', 'bgColor'), 'bg');
  assert.strictEqual(C.roleOf('Wobble'), '');
});

ok('the preview: what fits this scene, and a skipped step with its note', () => {
  const r = C.make({ name: 'Finish', steps: [
    { k: 'fx', fx: { kind: 'filter', id: 'glow', name: 'Glow' } },
    { k: 'slider', on: { name: 'Orb' }, key: 'glow', label: 'Glow', type: 'number', v: 1, min: 0, max: 3 },
    { k: 'slider', on: { name: 'Orb' }, key: 'tint', label: 'Tint', type: 'color', v: '#ff0000' },
    { k: 'fx', fx: { kind: 'filter', id: 'nope', name: 'Nope' } },
    { k: 'frame', id: '9:16' },
  ] });
  const p = C.plan(r, { layers: OTHER, frame: '9:16' }, { has: (fx) => fx.id !== 'nope' });
  assert.deepStrictEqual(p.map((x) => x.ok), [true, true, false, false, true]);
  assert.ok(/no slider like "Tint" here/.test(p[2].why), p[2].why);
  assert.ok(/isn't in this Hearth/.test(p[3].why));
  assert.strictEqual(p[4].where, 'already this size');
  assert.ok(/Bloom on Tunnel \(same role\)/.test(p[1].where), p[1].where);
  // a step on the layer an earlier step makes fits once that step does
  const r2 = C.make({ name: 'x', steps: [{ sid: 'mk', k: 'layer', name: 'Rings', code: 'x()' }, { k: 'slider', on: { made: 'mk', n: 0 }, key: 'count', label: 'Count', v: 3 }] });
  assert.deepStrictEqual(C.plan(r2, { layers: [] }).map((x) => [x.ok, x.where]), [[true, ''], [true, 'the new layer']]);
});

ok('the file: made, checked, cleaned (unknown kinds dropped, a too-big layer refused, a newer version flagged)', () => {
  const r = C.make({ name: 'a/b:c', steps: [{ k: 'frame', id: '1:1' }, { k: 'what' }, { k: 'palette', colors: ['nope', '#abcdef'] }], from: 'Scene' });
  assert.strictEqual(r.format, 'hearth-recipe');
  assert.strictEqual(r.name, 'a b c');
  assert.deepStrictEqual(r.steps.map((s) => s.k), ['frame', 'palette']);
  assert.deepStrictEqual(r.steps[1].colors, ['#abcdef']);
  assert.ok(r.steps.every((s) => typeof s.sid === 'string'));
  assert.strictEqual(C.check(JSON.parse(JSON.stringify(r))).ok, true);
  assert.strictEqual(C.check({ format: 'x' }).ok, false);
  assert.strictEqual(C.check({ ...r, v: 9 }).ok, false);
  assert.strictEqual(C.check({ ...r, steps: [{ k: 'layer', name: 'Big', code: 'x'.repeat(C.LIMITS.code + 1) }] }).ok, false);
});

ok('editing: move, drop, and a step left before the step that makes its layer is flagged', () => {
  const s = [{ sid: 'a', k: 'layer', code: 'x', name: 'L' }, { sid: 'b', k: 'slider', key: 'k', on: { made: 'a' } }, { sid: 'c', k: 'frame', id: '1:1' }];
  assert.deepStrictEqual(C.move(s, 2, -1).map((x) => x.sid), ['a', 'c', 'b']);
  assert.deepStrictEqual(C.move(s, 0, -1).map((x) => x.sid), ['a', 'b', 'c'], 'nothing moves past the ends');
  assert.deepStrictEqual(C.drop(s, 1).map((x) => x.sid), ['a', 'c']);
  assert.deepStrictEqual(C.orphans(s), []);
  assert.deepStrictEqual(C.orphans(C.move(s, 0, 1)), ['b']);
});

ok('search: names, where it came from and its steps; newest first', () => {
  const list = [C.make({ name: 'Neon finish', steps: [{ k: 'frame', id: '9:16' }] }), { ...C.make({ name: 'Grain', steps: [{ k: 'fx', fx: { kind: 'filter', id: 'film', name: 'Film grain' } }] }), updatedAt: Date.now() + 5 }];
  assert.deepStrictEqual(C.search(list, '').map((r) => r.name), ['Grain', 'Neon finish']);
  assert.deepStrictEqual(C.search(list, 'neon').map((r) => r.name), ['Neon finish']);
  assert.deepStrictEqual(C.search(list, 'film').map((r) => r.name), ['Grain']);
  assert.deepStrictEqual(C.search(list, '9:16').map((r) => r.name), ['Neon finish']);
});

// the .hearthpack round trip (main side, plain Node)
ok('a recipe travels in a .hearthpack: kind "recipe", no scene, its steps (and a layer step\'s code) kept', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-rc-'));
  const data = path.join(tmp, 'data'); fs.mkdirSync(data);
  const r = C.make({ name: 'Packed recipe', steps: [{ k: 'layer', name: 'Rings', code: '// rings\nconst P = tweak({ n: 3 });' }, { k: 'frame', id: '9:16' }, { k: 'slider', on: { name: 'Orb' }, key: 'glow', label: 'Glow', type: 'number', v: 2, min: 0, max: 3 }] });
  const packs = require('../packsmain.js');
  packs._set({ dataDir: data });
  const out = path.join(tmp, 'Packed recipe.hearthpack');
  const w = await packs.write({ body: { scenes: [], sequence: null, luts: [], song: null, recipe: r }, meta: { kind: 'recipe', name: r.name }, inline: [], thumb: null, out });
  assert.ok(w.ok, JSON.stringify(w));
  const pv = await packs.peek(out);
  assert.ok(pv.ok, (pv.problems || []).join(' '));
  assert.strictEqual(pv.manifest.kind, 'recipe');
  assert.ok(/^A recipe of 3 steps/.test(P.describe(pv.manifest)[0]), P.describe(pv.manifest)[0]);
  const u = await packs.unpack(out);
  assert.ok(u.ok, (u.problems || []).join(' '));
  const ck = C.check(u.manifest.recipe);
  assert.ok(ck.ok, ck.problems.join(' '));
  assert.deepStrictEqual(ck.r.steps.map((s) => s.k), ['layer', 'frame', 'slider']);
  assert.strictEqual(ck.r.steps[0].code, r.steps[0].code, 'the layer\'s code is intact');
  // a "recipe" pack without steps is refused; a scene pack still needs a scene
  assert.strictEqual(P.checkManifest({ ...pv.manifest, recipe: { steps: [] } }).ok, false);
  assert.strictEqual(P.checkManifest({ ...pv.manifest, kind: 'scene' }).ok, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; }
  }
  console.log(`${n}/${tests.length} passed`);
})();
