// ▮ The frame budget bar's arithmetic (round 64, framebar64: tools/framebar-core.js): the target refresh (Auto = the
// screen's rate, or 240 / 144 / 60), one stats message → the bar (CPU work vs late frames, still pictures, a capped
// preview, levels), each layer's share (code = its frame callback minus the draws inside it; draws made outside it
// added), blending, the most expensive layer's sentence, the "why?" look's top costs and suggestions with their drafts.
//   node dev/framebar-test.js
const assert = require('assert');
const C = require('../tools/framebar-core');
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`✓ ${name}`); };
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) <= e, `${a} ≉ ${b}`);

t('target: Auto follows the screen (a measured 239.6 Hz is 240), or a chosen 240 / 144 / 60', () => {
  near(C.target('auto', 239.6).ms, 1000 / 240); assert.strictEqual(C.target('auto', 239.6).hz, 240); assert(C.target('auto', 240).auto);
  assert.strictEqual(C.target('auto', 143).hz, 144); assert.strictEqual(C.target('auto', 59.7).hz, 60); assert.strictEqual(C.target('auto', 0).hz, 60);
  assert.strictEqual(C.target(144, 240).hz, 144); near(C.target(60, 240).ms, 1000 / 60); assert(!C.target(240, 60).auto);
  near(C.target(240).ms, 4.1666666, 1e-6);
});

t('frame: the CPU work (median) against 4.17 ms; fits / amber / red', () => {
  const T = C.target(240);
  const fit = C.frame({ p50: 3.1, ms: 3.4, hz: 240, pace: { fps: 240, med: 4.17 } }, T);
  near(fit.ms, 3.1); assert.strictEqual(fit.level, 'ok'); near(fit.fill, 0.744, 1e-3); assert.strictEqual(fit.gap, 0); assert(!fit.gpu);
  assert.strictEqual(C.frame({ p50: 5, hz: 240, pace: { fps: 200, med: 4.2 } }, T).level, 'amber');
  assert.strictEqual(C.frame({ p50: 7, hz: 240, pace: { fps: 140, med: 7.1 } }, T).level, 'red');
  near(C.frame({ p50: 0, ms: 2, hz: 240, pace: {} }, T).ms, 2); // (no median yet: the last render)
});

t('frame: late frames (GPU) count when the gaps are longer than the screen\'s frame; never the screen\'s own interval', () => {
  const T = C.target(240);
  const gpu = C.frame({ p50: 1.2, hz: 240, pace: { fps: 120, med: 8.3 } }, T);
  near(gpu.ms, 8.3); assert(gpu.gpu); assert.strictEqual(gpu.level, 'red');
  // a 60 Hz screen measured against 240: its 16.7 ms gaps are the screen's, the CPU work is what's compared
  const slowScreen = C.frame({ p50: 2, hz: 60, pace: { fps: 60, med: 16.7 } }, T);
  near(slowScreen.ms, 2); assert.strictEqual(slowScreen.level, 'ok');
  // a 60 fps cap: its gaps are the cap's
  near(C.frame({ p50: 2, hz: 240, cap: 60, pace: { fps: 60, med: 16.7 } }, T).ms, 2);
  // a still picture (nothing drawing): the last work, no gaps
  const still = C.frame({ p50: 1, hz: 240, pace: { fps: 2, med: 500, still: true } }, T);
  near(still.ms, 1); assert(still.still);
});

t('barScale: the budget at 2/3 of the bar, full at 1.5×', () => {
  near(C.barScale(1), 2 / 3); near(C.barScale(1.5), 1); near(C.barScale(3), 1); near(C.barScale(0), 0); near(C.barScale(-1), 0);
});

t('rows: code = frame callback − draws inside it; total adds draws made outside it; sorted by total', () => {
  const fb = { n: 120, rows: [
    ['game', 1.9, 1.2, 0, 140, 52000, 4, 21.3, 7], // 0.7 code + 1.2 draw
    ['hud', 0.15, 0, 0, 0, 0, 0, 0, 0],
    ['sky', 0.2, 0.1, 0.4, 2, 2, 1, 1, 1], // 0.1 code + 0.5 draw (0.4 drawn outside its frame)
    ['heavy', 3.0, 2.6, 0, 900, 2e5, 2, 4, 30],
  ] };
  const names = { game: 'Game', hud: 'HUD', sky: 'Sky', heavy: 'Heavy' };
  const R = C.rows(fb, (id) => names[id]);
  assert.deepStrictEqual(R.map((r) => r.id), ['heavy', 'game', 'sky', 'hud']);
  const g = R.find((r) => r.id === 'game'); near(g.code, 0.7); near(g.draw, 1.2); near(g.total, 1.9); assert.strictEqual(g.calls, 140); assert.strictEqual(g.texMB, 21.3); assert.strictEqual(g.progs, 7); assert.strictEqual(g.name, 'Game');
  const s = R.find((r) => r.id === 'sky'); near(s.code, 0.1); near(s.draw, 0.5); near(s.total, 0.6);
  // a draw that took longer than the callback it ran in can't make the code negative
  near(C.rows({ rows: [['x', 1, 1.2, 0, 0, 0, 0, 0, 0]] })[0].code, 0);
  assert.strictEqual(C.rows({ rows: [['x', 1, 0, 0, 0, 0, 0, 0, 0]] })[0].name, 'x'); // (no name: its id)
  assert.deepStrictEqual(C.rows(null), []);
  const top = C.top(R); assert.strictEqual(top.id, 'heavy');
  assert.strictEqual(C.sentence(top), 'The most expensive layer is Heavy (3.0 ms).');
  assert.strictEqual(C.sentence(R.find((r) => r.id === 'game')), 'The most expensive layer is Game (1.9 ms).');
  assert(/No layer/.test(C.sentence(C.top([]))));
  assert.strictEqual(C.top([{ id: 'a', total: 0 }]), null);
});

t('blend: halfway between two reads, new layers as they are, gone ones dropped, order by the blend', () => {
  const a = [{ id: 'g', name: 'G', code: 1, draw: 1, total: 2, calls: 100, tris: 10 }, { id: 'h', name: 'H', code: 0, draw: 0.1, total: 0.1, calls: 0, tris: 0 }];
  const b = [{ id: 'g', name: 'G', code: 0, draw: 1, total: 1, calls: 50, tris: 10 }, { id: 'n', name: 'N', code: 3, draw: 0, total: 3, calls: 0, tris: 0 }];
  const m = C.blend(a, b, 0.5);
  assert.deepStrictEqual(m.map((r) => r.id), ['n', 'g']);
  near(m[1].total, 1.5); near(m[1].code, 0.5); assert.strictEqual(m[1].calls, 75);
});

// a "why?" result as the preview page answers it (tools/three-sandbox.html fbWhy): the labplay55 game with a heavy layer
const heavy = { ok: true, layer: 'heavy', frames: 180, sec: 3, fps: 60, ms: { frame: 3.1, drawIn: 2.6, drawOut: 0 }, calls: 905, tris: 210000,
  post: { offscreen: 0, filters: [] },
  scan: { objs: 450, tris: 210000, px: 57600, lights: 6, ambient: 1, casters: 400, shadowLights: [{ name: 'sun', type: 'DirectionalLight', size: 4096, passes: 1 }], shadowCalls: 400,
    materials: [{ name: 'brick', type: 'MeshStandardMaterial', calls: 300, objs: 300, tris: 3600, inst: 0, transparent: false, mats: 1 }, { name: 'glass', type: 'MeshPhysicalMaterial', calls: 150, objs: 150, tris: 1800, inst: 0, transparent: true, mats: 150 }],
    matCount: 151, kinds: [{ type: 'MeshPhysicalMaterial', name: 'glass', n: 150 }], repeats: [{ n: 300, mat: 'brick', geo: 'BoxGeometry' }],
    transparent: 150, overdraw: 2.4, textures: { n: 3, mb: 42.7, top: [{ name: 'ground', w: 2048, h: 2048, mb: 21.3 }] } } };

t('costs: draw calls by material, shadow casters and maps, overdraw, lights, triangles, textures', () => {
  const L = C.costs(heavy, { budgetMs: 1000 / 240 });
  const by = Object.fromEntries(L.map((x) => [x.id, x.text]));
  assert(/Its own code 0\.50 ms · drawing 2\.6 ms a frame \(of 4\.2 ms\)/.test(by.time), by.time);
  assert(/Draw calls: 905 a frame · by material: “brick” 300 · “glass” ×150 materials 150/.test(by.calls), by.calls);
  assert(/Shadow casters: 400 · shadow maps 4096² · ≈ 400 extra draw calls/.test(by.shadows), by.shadows);
  assert(/Transparent overdraw: ≈ 2\.4× the screen \(150 see-through things\)/.test(by.overdraw), by.overdraw);
  assert(/Lights: 6 \(\+ 1 ambient\)/.test(by.lights), by.lights);
  assert(/Triangles: 210k/.test(by.tris)); assert(/Textures: 3 · ≈ 43 MB \(biggest 2048×2048\)/.test(by.tex), by.tex);
  assert(!by.post); // (no passes, no filters)
  const withPost = C.costs({ ...heavy, post: { offscreen: 3, filters: [{ type: 'bloom', ms: 0.8 }] } }, {});
  assert(/Post-processing: 3 offscreen passes a frame · filters over it: bloom 0\.80 ms/.test(withPost.find((x) => x.id === 'post').text));
  assert.deepStrictEqual(C.costs({ ok: false }), []);
});

t('suggest: instancing, shared materials, shadows, casters, lights, overdraw first by weight; drafts name the layer and the budget', () => {
  const S = C.suggest(heavy, { budgetMs: 1000 / 240, hz: 240, layer: 'Heavy' });
  const ids = S.map((s) => s.id);
  assert(S.length <= 5 && S.length >= 4, ids.join());
  assert.strictEqual(ids[0], 'instance', ids.join()); // 300 copies: the most draw calls saved
  for (const k of ['instance', 'share', 'casters']) assert(ids.includes(k), `${k} in ${ids}`);
  assert(S.every((s, i) => i === 0 || S[i - 1].weight >= s.weight));
  const inst = S[0];
  assert(/300 copies/.test(inst.title) && /InstancedMesh: 300 draw calls become 1/.test(inst.fix));
  assert(/^In the Lab layer “Heavy” \(it takes 3\.1 ms of a 4\.2 ms frame at 240 Hz\): .*InstancedMesh.* Keep how it looks the same\.$/.test(inst.draft), inst.draft);
  // what each one says
  const all = C.suggest(heavy, { budgetMs: 1000 / 240, layer: 'Heavy' }).concat(C.suggest({ ...heavy, scan: { ...heavy.scan, repeats: [], kinds: [] } }, { budgetMs: 1000 / 240 }));
  assert(all.some((s) => s.id === 'shadowsize' && /1024/.test(s.fix)) || all.some((s) => s.id === 'casters'));
  // a light layer with nothing standing out: no suggestions
  const calm = { ok: true, ms: { frame: 0.3, drawIn: 0.2, drawOut: 0 }, calls: 4, tris: 900, post: { offscreen: 0, filters: [] }, scan: { objs: 4, lights: 1, casters: 2, shadowLights: [{ size: 1024, passes: 1 }], shadowCalls: 2, materials: [], kinds: [], repeats: [], transparent: 0, overdraw: 0, textures: { n: 1, mb: 1 } } };
  assert.deepStrictEqual(C.suggest(calm, { budgetMs: 1000 / 240 }), []);
  // code-heavy: its own code
  const busy = { ...calm, ms: { frame: 3.2, drawIn: 0.2, drawOut: 0 } };
  const b = C.suggest(busy, { budgetMs: 1000 / 240, layer: 'Busy' });
  assert.strictEqual(b[0].id, 'code'); assert(/3\.0 ms a frame/.test(b[0].title));
  // a point light's shadow, post-processing, many triangles, big textures
  const more = C.suggest({ ...calm, tris: 3e6, post: { offscreen: 4, filters: [{ type: 'bloom', ms: 2 }] }, scan: { ...calm.scan, shadowLights: [{ size: 512, passes: 6 }], shadowCalls: 12, textures: { n: 9, mb: 900 } } }, { budgetMs: 1000 / 240 }).map((s) => s.id);
  for (const k of ['post', 'pointshadow', 'tris', 'textures']) assert(more.includes(k), `${k} in ${more}`);
  assert.deepStrictEqual(C.suggest({ ok: false }), []);
});

t('formatting: ms and big numbers stay short', () => {
  assert.strictEqual(C.ms1(4.1666), '4.2'); assert.strictEqual(C.ms1(0.456), '0.46'); assert.strictEqual(C.ms1(16.7), '17');
  assert.strictEqual(C.big(905), '905'); assert.strictEqual(C.big(52000), '52k'); assert.strictEqual(C.big(2.4e6), '2.4M');
});

console.log(`\n${n} passed`);
