// ▶ Play's input latency (round 56, playlatency): the pure parts (playlatency-core.js, GameCore.fastCanvas) and the
// main side's timing of the window's key handler.
//   node dev/playlatency-test.js
const assert = require('assert');
const C = require('../playlatency-core');
const GC = require('../gamemode-core');
const PL = require('../playlatencymain');
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`✓ ${name}`); };
const R = (code) => `import * as THREE from 'three'; const r = new THREE.WebGLRenderer(); ${code}`;
const rows = (list) => list.map((f) => [0.3, f]);

t('percentiles and the steady frame time (a hitch doesn\'t move it)', () => {
  assert.strictEqual(C.pct([5, 1, 3], 0.5), 3);
  assert.strictEqual(C.pct([], 0.5), null);
  assert.strictEqual(C.frameOf([4.2, 4.1, 4.2, 40, 4.2], 240), 4.2);
  assert.strictEqual(Math.round(C.frameOf([], 240) * 10) / 10, 4.2); // (nothing measured: the screen's refresh)
});
t('240 Hz: inputs read in the next frame → "as short as the browser allows"', () => {
  const s = C.summarize({ page: { k: rows([1.1, 2.4, 3.9, 0.6, 2.2]), m: rows([0.4, 3.1, 1.9, 2.6]), gaps: Array(60).fill(4.17), et: [] }, main: { lag: { p50: 1, p99: 1.2, max: 3 }, handler: [0.004, 0.006] }, hz: 240 });
  assert.strictEqual(s.verdict, 'next-frame'); assert.ok(s.ok);
  assert.strictEqual(s.frameMs, 4.2); assert.strictEqual(s.fps, 238);
  assert.match(s.line, /^Input: 2\.\d ms$/);
  assert.match(s.text, /very next frame/); assert.match(s.text, /< 0\.01 ms a key/); assert.match(s.text, /240 Hz/);
  assert.strictEqual(s.keys.n, 5); assert.strictEqual(s.mouse.n, 4);
});
t('late input says why: Hearth\'s main process busy / frames slower than the screen / the page', () => {
  const late = { k: rows([9, 12, 15, 11]), gaps: Array(30).fill(4.17) };
  assert.match(C.summarize({ page: late, main: { lag: { p99: 22 } }, hz: 240 }).why, /main process was busy/);
  assert.match(C.summarize({ page: { k: rows([30, 40, 45]), gaps: Array(30).fill(16.7) }, main: { lag: { p99: 2 } }, hz: 240 }).why, /slower than the screen/);
  assert.match(C.summarize({ page: late, main: { lag: { p99: 2 } }, hz: 240 }).why, /page was busy/);
  // a slow machine (60 Hz, 16.7 ms frames) whose inputs still land in the next frame is fine
  assert.ok(C.summarize({ page: { k: rows([8, 14, 17, 5]), gaps: Array(30).fill(16.7) }, hz: 60 }).ok);
});
t('no input reached the game: said plainly, no figure', () => {
  const s = C.summarize({ page: {}, hz: 60 });
  assert.strictEqual(s.verdict, 'none'); assert.strictEqual(s.line, ''); assert.match(s.text, /No input measured/);
});
t('the one canvas skips the per-frame copy only when nothing reads its picture', () => {
  const A = { id: 'a', code: R('') }; const B = { id: 'b', code: R('') };
  assert.strictEqual(GC.mergePlan([A, B]).fast, true);
  assert.strictEqual(GC.mergePlan([A, { id: 'f', code: 'filter("bloom", P)' }]).fast, false); // (a filter reads the picture below)
  assert.strictEqual(GC.mergePlan([A, { id: 'h', code: R(''), visible: false }]).fast, false); // (a hidden layer could show later)
  assert.strictEqual(GC.mergePlan([A, { id: 'c', code: R(''), opacity: 0.5 }]).fast, false); // (a layer with its own canvas)
  for (const code of ["const t = tex('layer:sky')", 'r.domElement.toDataURL()', 'r.domElement.toBlob(f)', 'r.domElement.captureStream(30)', 'g.drawImage(r.domElement, 0, 0)']) assert.strictEqual(GC.mergePlan([A, { id: 'x', code: R(code) }]).fast, false, code);
  assert.strictEqual(GC.mergePlan([]).fast, false);
});
t('the window\'s key handler is timed only while measuring (one check otherwise)', () => {
  let calls = 0; const h = PL.timed((e, input) => { calls += 1; return input.k; });
  assert.strictEqual(h({}, { k: 7 }), 7); assert.strictEqual(calls, 1);
  assert.strictEqual(PL.measuring(), false);
  assert.strictEqual(PL.brief(null), null);
  assert.strictEqual(PL.result({ sender: 1 }, '{}'), undefined); // (nothing measuring: ignored)
  assert.deepStrictEqual(Object.keys(PL.brief({ line: 'Input: 2.0 ms', input: {}, frameMs: 4.2, fps: 240, verdict: 'next-frame', at: 1 })), ['line', 'input', 'frameMs', 'fps', 'verdict', 'at']);
});
console.log(`${n} passed`);
