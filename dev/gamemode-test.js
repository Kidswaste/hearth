// ▶ Play (round 52, gamemode): the pure part (gamemode-core.js) and the page a Lab scene is built into.
//   node dev/gamemode-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../gamemode-core');
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`✓ ${name}`); };
const R = (code) => `import * as THREE from 'three'; const r = new THREE.WebGLRenderer(); ${code}`;

t('source descriptors', () => {
  assert.deepStrictEqual(C.source({ kind: 'lab', id: 's1', title: 'Clink' }), { kind: 'lab', id: 's1', title: 'Clink' });
  assert.strictEqual(C.source('/games/clink/index.html').kind, 'html');
  assert.strictEqual(C.source('/games/clink/index.html').title, 'clink');
  assert.strictEqual(C.source({ path: '/x/Coin Run.html' }).title, 'Coin Run');
  assert.strictEqual(C.source({ kind: 'lab' }), null);
  const r = C.remember(C.remember([], { kind: 'lab', id: 'a', title: 'A' }), { kind: 'html', path: '/b.html' });
  assert.deepStrictEqual(r.map((x) => x.title), ['b', 'A']);
  assert.strictEqual(C.remember(r, { kind: 'lab', id: 'a', title: 'A' }).length, 2);
});
t('one canvas: the plain layers merge, bottom first; the rest say why', () => {
  const p = C.mergePlan([{ id: 'a', code: R('') }, { id: 'b', code: R('') }, { id: 'c', code: R('') }]);
  assert.deepStrictEqual(p.merge, ['a', 'b', 'c']); assert.strictEqual(p.contexts, 1);
  const q = C.mergePlan([{ id: 'a', code: R('') }, { id: 'f', code: 'filter("bloom", P)' }, { id: 'c', code: R('') }, { id: 'h', code: R(''), visible: false }]);
  assert.deepStrictEqual(q.merge, ['a']); assert.match(q.why.f, /filter/); assert.match(q.why.c, /above/); assert.strictEqual(q.why.h, 'hidden'); assert.strictEqual(q.contexts, 3);
  for (const [L, re] of [[{ opacity: 0.5 }, /opacity/], [{ blend: 'add' }, /blend/], [{ x: 0.1 }, /moved/], [{ keys: { opacity: [{ t: 0, v: 1 }] } }, /keyframes/], [{ in: 2 }, /part of the time/], [{ cropT: 0.1 }, /cropped/]]) assert.match(C.whyNot({ id: 'x', code: R(''), ...L }), re);
  assert.match(C.whyNot({ code: R('new EffectComposer(r)') }), /post-processing/);
  assert.match(C.whyNot({ code: 'tweak({}); visualizer(P, {})' }), /helper|renderer/);
});
t('page or live', () => {
  assert.strictEqual(C.route({ layers: [{ code: R('') }] }).route, 'page');
  assert.strictEqual(C.route({ layers: [{ code: R('webcam.feat("hand")') }] }).route, 'live');
  assert.strictEqual(C.route({ layers: [{ precomp: { id: 'x' } }] }).route, 'live');
});
t('screens and fidelity', () => {
  const ds = [{ id: 1, w: 2880, h: 1800, hz: 120, primary: true }, { id: 2, w: 3840, h: 2160, hz: 240 }, { id: 3, w: 3840, h: 2160, hz: 60 }];
  assert.strictEqual(C.pickDisplay(ds).id, 2);
  assert.strictEqual(C.pickDisplay(ds, 1).id, 1);
  assert.strictEqual(C.pickDisplay(ds, 99).id, 2);
  assert.deepStrictEqual(C.fidelity({ scale: 2, hz: 240 }), { level: 'max', pixelRatio: 2, antialias: true, msaa: true, powerPreference: 'high-performance', cap: 0, adapt: false, hz: 240 });
  assert.strictEqual(C.chipLine({ fps: 239.6, ms: 4.17, hz: 240, how: 'one canvas' }), '240 fps · 4.2 ms · 240 Hz · one canvas');
});
t('the protocol never leaves the folder', () => {
  assert.strictEqual(C.safePath('/g', '/a/b.png'), '/g/a/b.png');
  assert.strictEqual(C.safePath('/g', '/a%20b/c.js'), '/g/a b/c.js');
  assert.strictEqual(C.safePath('/g', '/../etc/passwd'), null);
  assert.strictEqual(C.safePath('/g', '/%2e%2e/x'), null);
  assert.strictEqual(C.safePath('/g', '/C:/x'), null);
  assert.strictEqual(C.safePath('/g', '/a%00b'), null);
  assert.strictEqual(C.safePath('/g', '/'), '/g');
  assert.strictEqual(C.mimeOf('x.GLB'), 'model/gltf-binary');
});
t('the Lab scene page: the Lab player, three.js next to it, the host feeding the plan (never the owner\'s files)', () => {
  const THREE = process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package';
  if (!fs.existsSync(path.join(THREE, 'build', 'three.module.js'))) { console.log('  (skipped: no local three.js)'); return; }
  process.env.HEARTH_THREE_DIR = THREE;
  const M = require('../gamemodemain');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-test-'));
  const dep = require('../deploymain'); dep._test.setDataDir(dataDir);
  M._test.setCtx({ dataDir, getWin: () => null });
  const scene = require('./fixtures/game-lab-scene.js');
  const layers = scene.layers.map((L, i) => ({ id: `l${i}`, code: L.code }));
  const spec = { id: 's/1', name: 'X', version: '0.186.1', layers, refs: [], plan: C.mergePlan(layers) };
  return M._test.buildScene(spec).then((b) => {
    assert.ok(!b.cached && fs.existsSync(path.join(b.dir, 'three', 'build', 'three.module.js')));
    const html = fs.readFileSync(path.join(b.dir, 'play.html'), 'utf8');
    assert.ok(html.includes("type: 'game-plan'") && html.includes('"merge":["l0","l1","l2"]') && html.includes('requestPointerLock'));
    assert.ok(b.dir.startsWith(path.join(dataDir, 'game')));
    return M._test.buildScene(spec).then((b2) => { assert.ok(b2.cached); console.log('  (built, then cached)'); });
  });
});
setTimeout(() => console.log(`\n${n} groups passed`), 200);
