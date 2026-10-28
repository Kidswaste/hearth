// (round 76, gpuplay76) 📈 Test play performance: unit tests for gpuplay-core.js — percentiles, ANGLE strings → card +
// path, each verdict (smooth on a 4080 at 240 Hz, GPU-bound at 4K, CPU-bound, paced at 60 on a 240 Hz screen that isn't
// the main display, SwiftShader / software, no GPU timer), the one-click fixes offered (D3D11 when another path is in
// use, Quality auto when Full and GPU-bound, the fast card when the small one draws, Restart in software with a real
// card), Hearth's own costs in the words, and the report for Claude.
//   node dev/gpuplay-test.js
'use strict';
const assert = require('node:assert/strict');
const C = require('../gpuplay-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };

const R4080 = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 (0x00002704) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const R4080_12 = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 (0x00002704) Direct3D11 vs_5_0 ps_5_0, D3D11on12)';
const RINTEL = 'ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004680) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const RSWIFT = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const RMAC = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)';
const fill = (n, f) => Array.from({ length: n }, (_, i) => f(i));
// n frames at `gap` ms (+ a little jitter), the main thread's frame `cpu` ms, the card's work `gpu` ms
const frames = (n, gap, cpu, gpu, o = {}) => ({ frames: n, gaps: fill(n, (i) => gap + (((i * 7) % 5) - 2) * 0.02), cpu: fill(n, () => cpu), gpu: gpu == null ? [] : fill(n - 4, () => gpu), gpuWhy: gpu == null ? 'no-timer' : '', contexts: 1, draws: 420,
  main: { w: 3840, h: 2160, cssW: 2560, cssH: 1440, dpr: 1.5, attrs: { antialias: true, powerPreference: 'high-performance' }, renderer: o.renderer || R4080 }, laf: { n: 0, worst: [] }, hearth: { budget: { ms: 0.04, helpers: { look: { name: 'the look', avg: 0.02, on: true }, stream: { name: 'loads during play', avg: 0.015, on: true } } }, quality: 'Quality auto · 100 %', look: '', hitch: '', probe: false }, ...o.page });
const win = (o = {}) => ({ platform: 'win32', display: { hz: 240, w: 3840, h: 2160, scale: 1.5, primary: true, label: 'LG 27GR95QE' }, displays: [], gpus: [{ vendor: 'NVIDIA', name: 'NVIDIA GeForce RTX 4080', active: true, virtual: false }], procs: { game: 38, hub: 0.6, gpu: 22, browser: 1.2 }, hags: true, pref: 'High performance', windowed: true, versions: { electron: '44.5.1', chrome: '144' }, ...o });
const gpu52 = (o = {}) => ({ line: 'Graphics: NVIDIA GeForce RTX 4080 (D3D11) · 240 Hz · hardware video ✓', name: 'NVIDIA GeForce RTX 4080', backend: 'D3D11', kind: 'gpu', dual: false, decision: { backend: 'd3d11', auto: true, power: 'auto', canvas: 'auto', platform: 'win32', switches: [['force_high_performance_gpu']] }, flags: { force_high_performance_gpu: true }, status: { gpu_compositing: 'enabled', webgl2: 'enabled' }, ...o });
const sample = (page, o = {}) => ({ secs: 20, title: 'Clink', kind: 'lab', how: 'one canvas (3 of 3 layers) · page', page, gpu: gpu52(o.gpu), facts: win(o.facts), prefs: { quality: 'auto', look: 'best', lowLatency: false, ...o.prefs } });
const ids = (s) => s.actions.map((a) => a.id);

test('stats: p50 / p95 / p99 / mean / max, ignoring junk', () => {
  const s = C.stats([...fill(98, () => 4), 20, 50, NaN, -1, null]);
  assert.equal(s.n, 100); assert.equal(s.p50, 4); assert.equal(s.p95, 4); assert.equal(s.p99, 20); assert.equal(s.max, 50);
  assert.equal(C.stats([]).p50, null);
});

test('ANGLE strings → card, path, maker; SwiftShader is software', () => {
  assert.deepEqual(C.renderer(R4080), { name: 'NVIDIA GeForce RTX 4080', backend: 'D3D11', vendor: 'NVIDIA' });
  assert.equal(C.renderer(R4080_12).backend, 'D3D11on12');
  assert.equal(C.renderer(RMAC).name, 'Apple M2 Max'); assert.equal(C.renderer(RMAC).backend, 'Metal');
  assert.equal(C.renderer(RSWIFT).backend, 'software'); assert.equal(C.renderer(RSWIFT).name, 'SwiftShader');
  assert.equal(C.renderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)').name, 'NVIDIA GeForce RTX 4080');
  assert.equal(C.integrated(C.renderer(RINTEL)), true); assert.equal(C.integrated(C.renderer(R4080)), false);
});

test('a 4080 keeping up at 240 Hz: smooth, nothing to fix, the numbers in plain words', () => {
  const s = C.summarise(sample(frames(4800, 4.167, 1.6, 2.1)));
  assert.equal(s.bound, 'smooth');
  assert.match(s.headline, /^Clink keeps up with your 240 Hz screen: 240 fps\.$/);
  assert.match(s.lines[0], /^Frames: 240 fps \(screen 240 Hz\) · frame time p50 4\.1\d ms · p95 4\.2\d ms · p99 4\.2\d ms$/);
  assert.match(s.lines[1], /NVIDIA GeForce RTX 4080 via D3D11 \(ANGLE\) — the only card, so the fast one ✓/);
  assert.match(s.lines[2], /GPU work a frame: 2\.1 ms .* processor \(the game's frame\): 1\.6 ms/);
  assert.match(s.lines[3], /Drawing 3840×2160 \(8\.3 MP, pixel ratio 1\.5, antialias on\) · 420 draw calls a frame/);
  assert.match(s.lines.join('\n'), /Hearth's own work in the game: 0\.04 ms a frame \(the look 0\.02 ms, loads during play 0\.02 ms\) · Quality auto · 100 %/);
  assert.match(s.lines.join('\n'), /Processor use \(of one core\): the game 38 % · graphics process 22 % · Hearth's window 0\.6 %/);
  assert.match(s.lines.join('\n'), /Windows: hardware-accelerated GPU scheduling on · Windows graphics preference for Hearth: High performance/);
  assert.deepEqual(ids(s), []);
});

test('hitches are counted and named even when the rate keeps up', () => {
  const p = frames(4800, 4.167, 1.6, 2.1); p.gaps[100] = 80; p.gaps[2000] = 120;
  const s = C.summarise(sample(p));
  assert.equal(s.bound, 'smooth'); assert.match(s.headline, /with 2 hitches over 50 ms/); assert.equal(s.numbers.hitches, 2);
});

test('GPU-bound at 4K with Quality full: graphics card is the limit → Turn Quality: auto on, Try Graphics: Balanced', () => {
  const s = C.summarise(sample(frames(2400, 8.33, 2.2, 7.6), { prefs: { quality: 'full' } }));
  assert.equal(s.bound, 'gpu');
  assert.match(s.headline, /Clink runs at 120 fps on a 240 Hz screen: the graphics card is the limit \(7\.6 ms of GPU work a frame; 4\.17 ms fits 240 Hz\)\./);
  assert.deepEqual(ids(s), ['quality-auto', 'look-balanced']);
});

test('GPU-bound with Quality auto already on: no Quality button, the tip about the scene\'s own work', () => {
  const s = C.summarise(sample(frames(2400, 8.33, 2.2, 7.6)));
  assert.equal(s.bound, 'gpu'); assert.ok(!ids(s).includes('quality-auto')); assert.ok(ids(s).includes('look-balanced'));
  assert.match(s.tips.join(' '), /Quality auto already lowers the pixels/);
});

test('CPU-bound: the game\'s own frame → the performance doctor, no graphics fixes', () => {
  const s = C.summarise(sample(frames(1600, 12.5, 11.8, 1.9)));
  assert.equal(s.bound, 'cpu');
  assert.match(s.headline, /the game's own frame on the processor is the limit \(11\.8 ms a frame; 4\.17 ms fits 240 Hz\)/);
  assert.deepEqual(ids(s), ['doctor']);
});

test('D3D11on12 in use on Windows → Switch graphics path to D3D11 (and a picked Vulkan too)', () => {
  const s = C.summarise(sample(frames(2400, 8.33, 2.2, 7.6, { renderer: R4080_12 }), { gpu: { backend: 'D3D11on12', decision: { backend: 'd3d11on12', auto: false, power: 'auto', canvas: 'auto', platform: 'win32' } } }));
  assert.ok(ids(s).includes('backend-d3d11')); assert.match(s.lines[1], /via D3D11on12/);
  const v = C.summarise(sample(frames(4800, 4.167, 1.6, 2.1, { renderer: 'ANGLE (NVIDIA, Vulkan 1.3.277 (NVIDIA GeForce RTX 4080 (0x00002704)), NVIDIA)' }), { gpu: { decision: { backend: 'vulkan', auto: false, power: 'auto', platform: 'win32' } } }));
  assert.ok(ids(v).includes('backend-d3d11'), 'a picked path offered back even when smooth');
  const mac = C.summarise(sample(frames(4800, 4.167, 1.6, 2.1, { renderer: RMAC }), { facts: { platform: 'darwin', hags: undefined, pref: undefined }, gpu: { decision: { backend: 'metal', auto: true, platform: 'darwin' } } }));
  assert.ok(!ids(mac).includes('backend-d3d11'), 'never on a Mac');
});

test('drawn on the small built-in card while a fast one exists → Use the fast graphics card', () => {
  const s = C.summarise(sample(frames(1200, 16.7, 3, 15, { renderer: RINTEL }), { gpu: { dual: true }, facts: { gpus: [{ vendor: 'Intel', name: 'Intel(R) UHD Graphics 770', active: true }, { vendor: 'NVIDIA', name: 'NVIDIA GeForce RTX 4080', active: false }] } }));
  assert.match(s.lines[1], /the small built-in card, not your fast one ✗/);
  assert.equal(ids(s)[0], 'power-high');
});

test('paced at 60 on a 240 Hz screen that isn\'t the main display, nothing busy → capped, the main-display tip + display settings', () => {
  const s = C.summarise(sample(frames(1200, 16.67, 2.0, 2.4), { facts: { display: { hz: 240, w: 2560, h: 1440, scale: 1, primary: false, label: 'Side screen' } } }));
  assert.equal(s.bound, 'capped');
  assert.match(s.headline, /a steady 60 fps on a 240 Hz screen .* paces the window at 60 Hz/);
  assert.match(s.tips[0], /make the 240 Hz screen the main display/);
  assert.ok(ids(s).includes('display'));
  assert.match(s.lines.join('\n'), /which isn't your main display/);
});

test('Windows running the screen at 60 Hz: the refresh-rate tip even when it keeps up', () => {
  const s = C.summarise(sample(frames(1200, 16.67, 2.0, 2.4), { facts: { display: { hz: 60, primary: true } } }));
  assert.equal(s.bound, 'smooth');
  assert.match(s.tips.join(' '), /Windows runs this screen at 60 Hz/); assert.ok(ids(s).includes('display'));
});

test('SwiftShader (this test machine): says software, never "keeps up", no D3D11 / Quality buttons; a VM gets no Restart', () => {
  const p = frames(300, 66, 9, 40, { renderer: RSWIFT });
  const s = C.summarise(sample(p, { facts: { platform: 'linux', display: { hz: 60, primary: true }, gpus: [{ vendor: '0x1af4', virtual: true }] }, gpu: { kind: 'gpu', backend: '', dual: false, flags: { 'use-angle': 'swiftshader' }, decision: { backend: 'gl', auto: true, power: 'auto', platform: 'linux' } }, prefs: { quality: 'full' } }));
  assert.equal(s.bound, 'software');
  assert.match(s.headline, /^Clink is drawn without the graphics card \(software drawing: SwiftShader\) — 15 fps on a 60 Hz screen\.$/);
  assert.match(s.lines[1], /^Graphics card: none in use — software drawing \(SwiftShader\) · started with --use-angle=swiftshader$/);
  assert.deepEqual(ids(s), []);
  assert.match(s.tips.join(' '), /no graphics card Hearth can use/);
});

test('software on a computer with a real card → Restart Hearth', () => {
  const s = C.summarise(sample(frames(300, 66, 9, null, { renderer: RSWIFT }), { gpu: { kind: 'software' }, facts: { gpus: [{ vendor: 'NVIDIA', name: 'RTX 4080', virtual: false }] } }));
  assert.equal(s.bound, 'software'); assert.deepEqual(ids(s), ['restart']);
  assert.match(s.tips.join(' '), /turned the graphics card off/);
});

test('no GPU timer: "not measurable", GPU-bound only from the GPU process keeping a core busy; otherwise unclear with a tip', () => {
  const p = frames(2400, 8.33, 2.0, null);
  const busy = C.summarise(sample(p, { facts: { procs: { game: 20, gpu: 96, hub: 0.2, browser: 1 } } }));
  assert.equal(busy.bound, 'gpu'); assert.match(busy.lines[2], /not measurable here/);
  const idle = C.summarise(sample({ ...p, gaps: p.gaps.map((g, i) => (i % 3 ? 6 : 14)) }, { facts: { procs: { game: 20, gpu: 30 } } }));
  assert.equal(idle.bound, 'unclear'); assert.match(idle.tips.join(' '), /couldn't be measured/);
});

test('Hearth\'s own costs: the hitch map recording → Stop recording; over the 2 % budget → Hearth\'s helpers line', () => {
  const p = frames(4800, 4.167, 1.6, 2.1); p.hearth.hitch = '● Hitch map 0:42'; p.hearth.budget = { ms: 0.3, helpers: { look: { name: 'the look', avg: 0.25, on: true } } };
  const s = C.summarise(sample(p));
  assert.ok(ids(s).includes('hitch-off')); assert.ok(ids(s).includes('helpers'));
  assert.match(s.lines.join('\n'), /Hearth's own work in the game: 0\.3 ms a frame \(the look 0\.25 ms\)/);
  assert.ok(s.costs.some((c) => /hitch map/.test(c.what)));
});

test('Graphite canvas and the low-latency canvas are offered back when frames drop', () => {
  const s = C.summarise(sample(frames(2400, 8.33, 2.2, 7.6), { prefs: { lowLatency: true }, gpu: { decision: { backend: 'd3d11', auto: true, power: 'auto', canvas: 'graphite', platform: 'win32' } } }));
  assert.ok(ids(s).includes('canvas-auto')); assert.ok(ids(s).includes('lowlat-off'));
});

test('a screen that doesn\'t say its refresh: the pace measured, never "NaN"', () => {
  const s = C.summarise(sample(frames(1200, 16.67, 2, 2), { facts: { platform: 'linux', display: { hz: 0 } } }));
  assert.equal(s.numbers.hz, null); assert.doesNotMatch(s.headline + s.lines.join(' '), /NaN|undefined/);
  assert.match(s.headline, /your screen/);
});

test('the report for Claude: every number, the switches, the facts, the code to look at; one per line', () => {
  const smp = sample(frames(2400, 8.33, 2.2, 7.6, { renderer: R4080_12 }), { prefs: { quality: 'full' } });
  const t = C.report(smp);
  assert.match(t, /^Hearth "📈 Test play performance" report \(20 s of ▶ Play/);
  assert.match(t, /Verdict: gpu — /);
  assert.match(t, /Frames: 120 fps vs 240 Hz \(budget 4\.17 ms\) · gaps p50 8\.3\d · p95 8\.3\d · p99 8\.3\d · mean 8\.3\d · max 8\.3\d ms \(n 2400\)/);
  assert.match(t, /GPU \(EXT_disjoint_timer_query_webgl2, summed over 1 context\(s\)\): p50 7\.6/);
  assert.match(t, /GPU in use: ANGLE \(NVIDIA.*D3D11on12\) → NVIDIA GeForce RTX 4080 \/ D3D11on12/);
  assert.match(t, /Switches in effect: \{"force_high_performance_gpu":true\}/);
  assert.match(t, /Canvas: 3840×2160 drawing buffer, 2560×1440 CSS, dpr 1\.5/);
  assert.match(t, /HAGS true · GpuPreference High performance/);
  assert.match(t, /Offered: Switch graphics path to D3D11 \| Turn Quality: auto on \| Try Graphics: Balanced/);
  assert.match(t, /gpuplay-core\.js/);
  assert.doesNotMatch(t, /undefined|NaN/);
});

test('nothing measured (the game closed at once): calm words, no crash', () => {
  const s = C.summarise({ title: 'X', page: {}, gpu: {}, facts: {} });
  assert.ok(typeof s.headline === 'string' && s.headline.length > 0);
  assert.doesNotMatch(s.headline, /NaN|undefined/);
  assert.ok(typeof C.report({}) === 'string');
});

console.log(`\n${checks} checks passed`);
