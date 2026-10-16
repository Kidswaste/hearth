// Node tests for ▶ game performance (tools/gameperf-core.js): why a frame was late (each cause from its numbers), the
// session report (display rate, stutters vs the game's usual frame, GPU-bound), the source scan (per-frame allocations
// with the function and line, what can be made once), the doctor's findings for each deliberate problem and their order,
// max-fidelity suggestions, the Lab code fixes (each one safe or nothing), the director's few lines, and the probe's
// source (sent to the game page as text: it must stand alone).
//   node dev/gameperf-test.js
const assert = require('assert');
const C = require('../tools/gameperf-core.js');
const P = require('../tools/gameperf-probe.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const B = 1000 / 60;

ok('attribution: each cause from the frame\'s own numbers', () => {
  assert.equal(C.attribute({ dt: 120, work: 110, render: 108, shaderMs: 95 }, B).cause, 'shader');
  assert.equal(C.attribute({ dt: 60, work: 50, render: 48, texMs: 40 }, B).cause, 'texture');
  assert.equal(C.attribute({ dt: 40, work: 14, render: 6, gc: true }, B).cause, 'gc');
  const js = C.attribute({ dt: 70, work: 60, render: 4, fn: 'update' }, B);
  assert.equal(js.cause, 'js'); assert.equal(js.fn, 'update');
  assert.equal(C.attribute({ dt: 70, work: 8, render: 2, longMs: 60, longFn: 'spawnWave' }, B).fn, 'spawnWave');
  assert.equal(C.attribute({ dt: 45, work: 30, render: 28 }, B).cause, 'render');
  assert.equal(C.attribute({ dt: 50, work: 3, render: 2 }, B).cause, 'gpu');
  assert.equal(C.attribute({ dt: 40, work: 8, render: 1, layoutMs: 20 }, B).cause, 'layout');
  // the GPU process compiles / uploads after the call returns: the late frame that linked a program / sent 64 MB
  assert.equal(C.attribute({ dt: 300, work: 5, render: 4, shaderMs: 0.2, links: 1 }, B).cause, 'shader');
  assert.equal(C.attribute({ dt: 300, work: 5, render: 4, texMs: 3, texMB: 64 }, B).cause, 'texture');
  // a big shader compile wins over a GC in the same frame (the compile is measured, the GC only seen)
  assert.equal(C.attribute({ dt: 200, work: 180, render: 179, shaderMs: 170, gc: true }, B).cause, 'shader');
  // attribute is sent to the page as text: it must work rebuilt from its own source
  const f = new Function(`return (${C.attribute.toString()})`)();
  assert.deepEqual(f({ dt: 60, work: 50, render: 48, texMs: 40 }, B), C.attribute({ dt: 60, work: 50, render: 48, texMs: 40 }, B));
});

ok('report: the display rate, stutters against the usual frame, GPU-bound', () => {
  assert.equal(C.guessHz(Array(50).fill(4.17)), 240);
  assert.equal(C.guessHz([...Array(40).fill(6.94), ...Array(10).fill(20)]), 144);
  // a game at a steady 30 ms (60 Hz screen) with one 150 ms shader hitch: one stutter, not 300
  const dts = Array(300).fill(30); dts[100] = 150;
  const R = C.summarize({ hz: 60, dts, works: Array(300).fill(26), frames: 300, slow: [...Array(300).keys()].map((i) => ({ t: i * 30, dt: dts[i], work: i === 100 ? 140 : 26, render: i === 100 ? 135 : 20, shaderMs: i === 100 ? 120 : 0 })) });
  assert.equal(R.stutters.n, 1); assert.equal(R.stutters.list[0].cause, 'shader');
  assert.equal(R.fps, 33); assert.equal(R.hz, 60);
  // slow every frame with an idle main thread: the graphics card
  const G = C.summarize({ hz: 144, dts: Array(200).fill(20), works: Array(200).fill(2), frames: 200, slow: [] });
  assert.ok(G.gpuBound);
  const fine = C.summarize({ hz: 240, dts: Array(500).fill(4.17), works: Array(500).fill(1.2), frames: 500, slow: [] });
  assert.ok(!fine.gpuBound && fine.onTime === 100 && fine.stutters.n === 0);
});

const GAME = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(devicePixelRatio * 2);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
const enemies = [];
function update(dt) {
  for (const e of enemies) {
    const dir = new THREE.Vector3(1, 0, 0);
    e.position.add(dir.multiplyScalar(dt));
    const q = new THREE.Quaternion();
    e.quaternion.slerp(q, 0.1);
  }
  const keep = new THREE.Vector3();
  enemies.push(keep);
}
function spawn() { return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); }
renderer.setAnimationLoop((t) => {
  update(0.016);
  const p = camera.position.clone();
  renderer.render(scene, camera);
});
`;
ok('source scan: per-frame allocations with their function and line; what can be made once', () => {
  const hits = C.scanSource(GAME, { layer: 'Clink' });
  const at = (line) => hits.find((h) => h.line === line);
  assert.equal(at(10)?.fn, 'update'); assert.equal(at(10).what, 'Vector3'); assert.ok(at(10).hoist, 'dir is only used as dir.…');
  assert.ok(at(12)?.hoist, 'q is passed into a method call');
  assert.ok(at(15) && !at(15).hoist, 'keep is pushed: it lives past the frame');
  assert.equal(at(21)?.what, 'clone()'); assert.equal(at(21).fn, 'the frame loop');
  assert.ok(!hits.some((h) => h.line === 18), 'spawn() is not per frame');
  assert.equal(hits[0].layer, 'Clink');
});

ok('Lab fix "reuse them": objects made once above update(), set in place; nothing else changes', () => {
  const out = C.patch(GAME, 'hoist');
  assert.ok(out);
  assert.match(out, /const _gpDir1 = new THREE\.Vector3\(\);\nconst _gpQ2 = new THREE\.Quaternion\(\);\nfunction update/);
  assert.match(out, /const dir = _gpDir1\.set\(1, 0, 0\);/);
  assert.match(out, /const q = _gpQ2\.identity\(\);/);
  assert.match(out, /const keep = new THREE\.Vector3\(\);/, 'the pushed one stays');
  assert.equal(out.split('\n').length, GAME.split('\n').length + 2);
  assert.equal(C.patch(out, 'hoist'), null, 'twice: nothing more to do');
});

ok('Lab fixes: pixel ratio, shadows once, tone, color, antialias, soft shadows (or null when not safe)', () => {
  assert.match(C.patch(GAME, 'pr-cap'), /setPixelRatio\(Math\.min\(devicePixelRatio \* 2, 2\)\)/);
  assert.equal(C.patch(C.patch(GAME, 'pr-cap'), 'pr-cap'), null);
  assert.match(C.patch(GAME, 'pr-display'), /setPixelRatio\(devicePixelRatio\)/);
  const s1 = C.patch(GAME, 'shadow-once');
  assert.match(s1, /new THREE\.WebGLRenderer\(\);\nrenderer\.shadowMap\.autoUpdate = false; renderer\.shadowMap\.needsUpdate = true;/);
  assert.equal(C.patch(s1, 'shadow-once'), null);
  assert.match(C.patch(GAME, 'tone'), /renderer\.toneMapping = THREE\.ACESFilmicToneMapping;/);
  assert.match(C.patch(GAME, 'color'), /renderer\.outputColorSpace = THREE\.SRGBColorSpace;/);
  assert.match(C.patch(GAME, 'aa'), /new THREE\.WebGLRenderer\(\{ antialias: true \}\)/);
  assert.match(C.patch('const r = new THREE.WebGLRenderer({ alpha: true });', 'aa'), /\{ antialias: true, alpha: true \}/);
  assert.equal(C.patch('const r = new THREE.WebGLRenderer(opts);', 'aa'), null, 'options from a variable: not touched');
  assert.equal(C.patch('no renderer here', 'tone'), null);
  assert.match(C.diff(GAME, C.patch(GAME, 'pr-cap')), /^- renderer\.setPixelRatio\(devicePixelRatio \* 2\);\n\+ renderer\.setPixelRatio/m);
});

// the fixture game's session, as the probe reports it (dev/checks/gameperf.js makes the same problems for real)
const scene = { calls: 1460, tris: 17520, pr: 3, prNow: 3, dpr: 1, buffer: [5760, 3240], screen: [1920, 1080], aa: false, toneMapping: 0, colorSpace: 'srgb', programs: 6,
  instancing: [{ n: 1440, name: 'crate', mat: 'MeshStandardMaterial' }], merge: [{ n: 1440, mat: 'MeshStandardMaterial' }], transparent: 900,
  textures: [{ w: 8192, h: 8192, name: 'skybox', aniso: 1 }, { w: 512, h: 512, name: 'map', aniso: 1 }], aniso: { max: 16, low: 2 },
  shadows: { enabled: true, type: 1, everyFrame: true, casters: 1440, lights: [{ type: 'DirectionalLight', size: 4096 }], lightsMove: false, castersMove: false } };
const raw = { hz: 60, frames: 600, dts: Array(600).fill(25), works: Array(600).fill(20), dur: 15000,
  slow: [{ t: 5000, dt: 180, work: 170, render: 168, shaderMs: 160 }, { t: 9000, dt: 90, work: 80, render: 78, texMs: 70, detail: '8192×8192 texture' }, { t: 3000, dt: 60, work: 22, render: 18, gc: true }],
  alloc: { bytes: 45 * 1048576, gcs: 30 }, shaders: { n: 7, ms: 400, late: [{ t: 5000, ms: 160 }] }, textures: { n: 9, ms: 120, mb: 300, late: [{ t: 9000, ms: 70, w: 8192, h: 8192, mb: 256 }] },
  long: [{ t: 7000, ms: 64, fn: 'rebuildNavMesh', url: 'game.js' }], layout: { ms: 80, mutations: 1200 }, scene };
ok('doctor: every deliberate problem found, in plain words, with its fix', () => {
  const R = C.summarize(raw);
  const F = C.doctor(R, C.scanSource(GAME, { layer: 'Clink' }));
  const id = (x) => F.find((f) => f.id === x);
  assert.match(id('drawcalls').title, /1,460 draw calls a frame: 1,440 meshes share one geometry and material \(crate\) — instance them \(≈ −1,439 calls\)/);
  assert.match(id('drawcalls').fix, /InstancedMesh/);
  assert.match(id('garbage').title, /new Vector3 every frame in update\(\) \(line 10\) — ≈ 3 MB\/s of garbage/);
  assert.equal(id('garbage').lab.kind, 'hoist');
  assert.match(id('shader-late').title, /A shader compiled mid-play: a 160 ms freeze at 5\.0 s/);
  assert.match(id('texture-late').title, /8192×8192 texture was uploaded mid-play: a 70 ms freeze at 9\.0 s/);
  assert.match(id('texture-big').title, /8K texture \(≈ 340 MB/);
  assert.match(id('pixel-ratio').title, /Pixel ratio 3 on a 1920×1080 screen/);
  assert.match(id('shadows-static').title, /Shadow map 4096 redrawn every frame although lights and shadow casters don't move/);
  assert.match(id('transparent').title, /Transparent sorting of 900 objects/);
  assert.match(id('long-js').title, /rebuildNavMesh\(\) ran 64 ms in one go/);
  assert.match(id('layout').title, /changes 80 times a second/);
  assert.ok(!id('heavy-alloc'), 'spawn() makes meshes, but not every frame');
  // sorted by impact, biggest first; draw calls lead a game drawing 1,460 meshes one by one
  for (let i = 1; i < F.length; i += 1) assert.ok(F[i - 1].impact >= F[i].impact);
  assert.equal(F[0].id, 'drawcalls');
});

ok('doctor: a smooth game gets nothing; moving lights keep their shadows', () => {
  const R = C.summarize({ hz: 240, dts: Array(900).fill(4.17), works: Array(900).fill(1), frames: 900, slow: [], alloc: { bytes: 1000, gcs: 0 }, scene: { calls: 40, tris: 1e5, pr: 2, dpr: 2, buffer: [2560, 1440], screen: [1280, 720], aa: true, toneMapping: 4, colorSpace: 'srgb', programs: 8, instancing: [], merge: [], transparent: 3, textures: [], aniso: { max: 16, low: 0 }, shadows: { enabled: true, type: 2, everyFrame: true, casters: 4, lights: [{ size: 2048 }], lightsMove: true, castersMove: false } } });
  assert.deepEqual(C.doctor(R, []), []);
  assert.deepEqual(C.fidelity(R), []);
});

ok('max fidelity: what this game is missing, only as suggestions', () => {
  const R = C.summarize({ ...raw, scene: { ...scene, pr: 1, dpr: 2, buffer: [1920, 1080] } });
  const ids = C.fidelity(R).map((f) => f.id);
  for (const x of ['max-pr', 'max-aa', 'max-tone', 'max-shadow', 'max-aniso']) assert.ok(ids.includes(x), x);
  assert.ok(!ids.includes('max-color'), 'already sRGB');
  assert.match(C.fidelity(R)[0].title, /little headroom/, 'a slow game hears the cost');
});

ok('the director\'s view: a few lines, ids to fix by', () => {
  const R = C.summarize(raw);
  const F = C.doctor(R, C.scanSource(GAME, { layer: 'Clink' }));
  const txt = C.compact(R, F, { name: 'Clink' });
  assert.ok(txt.length < 1300, `${txt.length} chars`);
  assert.match(txt, /^Clink: 40 fps on 60 Hz/);
  assert.match(txt, /\[shadows-static, fix\]/);
  assert.match(txt, /17,520 tris/);
  assert.match(C.compact(R, F, { max: 12 }), /\[garbage, fix\].* @ Clink l10/);
  assert.match(txt, /three_do perf \{op: "fix", id\}/);
  assert.equal(C.compact(null, []), 'No play session measured yet.');
});

ok('the probe stands alone (it is sent to the game page as text)', () => {
  const src = P.toString();
  assert.ok(src.length < 40000, `${src.length} chars`);
  // nothing from outside: every identifier it reads is its own, a browser global, or the page's
  const fn = new Function(`return (${src})`)();
  assert.equal(typeof fn, 'function');
  for (const outside of ['GamePerfCore', 'GamePerf.', 'ThreeLab', 'toast(', 'store.']) assert.ok(!src.includes(outside), outside);
});
console.log(`${n} / 10`);
if (n !== 10) process.exitCode = 1;
