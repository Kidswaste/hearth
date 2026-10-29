#!/usr/bin/env node
// (round 81, playchurn81) The Lab preview's per-frame garbage, piece by piece, in Node: gcchurn60 measures the whole
// preview in the app (and swings with the machine's load: fewer frames a second, more of each second's fixed costs per
// frame, more code not optimised yet); this pins the pieces that crept back, so they can't again.
//   1. the scene health's camera check (laberrors80's hlCameras, "<hl-cameras>" in tools/three-sandbox.html): run on
//      the stats tick, it made an iterator per layer and per renderer and a closure per matrix (≈ 55 B a Lab frame at
//      18 fps). It must still find every kind of NaN camera, and allocate (next to) nothing per call.
//   2. the layer frame wrapper (window.requestAnimationFrame in the preview): a game that asks for its next frame with a
//      new function every frame got a new entry, a new frame callback and a WeakMap slot each time (≈ 110 B a frame).
//      Its source must keep the kept-entry path (a pool per owner) for such functions.
//   3. the preview's eval (runEval: every Lab tool call that looks into the scene, every check's read): its 4 s time-out
//      stayed set and fired 4 s later into a race long over, making an Error with its stack for nothing (≈ 190–260 B a
//      frame while a check polled). Once an eval answers (or throws), no timer of its is left.
// Allocation is counted with V8's own sampling heap profiler (the one gcchurn60 uses), objects later collected kept,
// split by the function that allocated; a copy of the old camera check is measured the same way and must read over the
// budget (the measure has teeth).
//   node dev/playchurn81-test.js
const fs = require('fs');
const path = require('path');
const inspector = require('inspector');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'tools', 'three-sandbox.html'), 'utf8');
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };

// ---------- a little world: layers with renderers and cameras, like the preview's ----------
const vec = (x, y, z) => ({ x, y, z });
const mat = () => ({ elements: [0.98, 0.17, -0.05, 0, -0.17, 0.97, 0.12, 0, 0.07, -0.11, 0.99, 0, 0.5, 5.25, 11.75, 1] }); // (fractions: a real camera's numbers, not small integers)
const cam = () => ({ isCamera: true, isPerspectiveCamera: true, aspect: 16 / 9, position: vec(0, 5, 11), matrixWorld: mat(), projectionMatrix: mat() });
function world(nLayers = 3, perLayer = 2) {
  const layers = new Map();
  for (let i = 0; i < nLayers; i += 1) {
    const L = { id: `L${i}`, gen: 1, nanG: 0, renderers: new Set() };
    for (let k = 0; k < perLayer; k += 1) L.renderers.add({ __lastCamera: cam(), __stale: false });
    layers.set(L.id, L);
  }
  return layers;
}
const said = [];
const env = (layers) => ({
  layers,
  pcTop: (id) => id,
  post: (m) => said.push(m),
  window: { __labProblems: { note: () => true, key: (r) => `${r.kind}|${r.layer}`, recs: new Map() } },
});
const NEW = /\/\/ <hl-cameras>[^\n]*\n([\s\S]*?)\/\/ <\/hl-cameras>/.exec(html)?.[1];
check(Boolean(NEW), 'the camera check is in the sandbox (<hl-cameras>)');
if (!NEW) process.exit(1);
const make = (src, E) => new Function('layers', 'pcTop', 'post', 'window', `${src}\nreturn hlCameras;`)(E.layers, E.pcTop, E.post, E.window);

// ---------- 1a. it still finds each kind of broken camera, once per run of the layer ----------
{
  const kinds = [
    ['position', (c) => { c.position.y = NaN; }],
    ['placement', (c) => { c.matrixWorld.elements[5] = NaN; }],
    ['placement', (c) => { c.matrixWorld.elements[12] = -Infinity; }],
    ['aspect', (c) => { c.aspect = 0; c.projectionMatrix.elements[0] = Infinity; }],
    ['lens', (c) => { c.projectionMatrix.elements[10] = NaN; }],
  ];
  for (const [want, breakIt] of kinds) {
    const W = world(); const E = env(W); const f1 = make(NEW, E); const run = () => f1(1); // (every stats tick: the 4-tick gate is tested below)
    said.length = 0; run();
    check(said.length === 0, `${want}: a healthy scene says nothing`);
    const L = W.get('L1'); breakIt([...L.renderers][1].__lastCamera);
    run(); run();
    const msg = said.find((m) => m.type === 'console')?.text || '';
    const words = { position: /position is NaN/, placement: /rotation or parent is NaN/, aspect: /aspect is 0/, lens: /lens numbers are NaN/ }[want];
    check(said.filter((m) => m.type === 'console').length === 1 && words.test(msg) && said.find((m) => m.type === 'console').layer === 'L1' && said.some((m) => m.type === 'health'), `${want}: said once, for its layer`, msg);
    L.gen += 1; said.length = 0; run();
    check(said.filter((m) => m.type === 'console').length === 1, `${want}: said again after the layer runs again`);
  }
  const W = world(); const E = env(W); const f1 = make(NEW, E); const run = () => f1(1); // (every stats tick: the 4-tick gate is tested below)
  const r = [...W.get('L0').renderers][0]; r.__stale = true; r.__lastCamera.position.x = NaN;
  said.length = 0; run();
  check(said.length === 0, 'a stale renderer (a gone run) is not looked at');
}

// ---------- 1b / 2. what it allocates per call ----------
// the round-80 check, as it was (the measure must see what it made)
const OLD = `function hlCameras() {
  for (const L of layers.values()) {
    if (L.nanG === L.gen) continue;
    for (const r of L.renderers) {
      const c = r.__lastCamera; if (!c?.isCamera || r.__stale) continue;
      const bad = !Number.isFinite(c.position.x + c.position.y + c.position.z) ? 'position' : c.matrixWorld.elements.some((v) => !Number.isFinite(v)) ? 'placement' : c.projectionMatrix.elements.some((v) => !Number.isFinite(v)) ? (c.isPerspectiveCamera && !(c.aspect > 0) ? 'aspect' : 'lens') : null;
      if (!bad) continue;
      L.nanG = L.gen;
    }
  }
}`;
const post = (s, m, p = {}) => new Promise((res, rej) => s.post(m, p, (e, r) => (e ? rej(e) : res(r))));
async function bytesPerCall(fn, names, calls, warm = true) {
  if (warm) for (let i = 0; i < calls; i += 1) fn(); // (warm: optimised; cold: how a code run twice a second runs)
  const s = new inspector.Session(); s.connect();
  await post(s, 'HeapProfiler.enable');
  await post(s, 'HeapProfiler.startSampling', { samplingInterval: 32, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  for (let i = 0; i < calls; i += 1) fn();
  const { profile } = await post(s, 'HeapProfiler.stopSampling');
  s.disconnect();
  let bytes = 0;
  const walk = (n, inside) => { const me = inside || names.test(n.callFrame.functionName); if (me) bytes += n.selfSize; for (const c of n.children || []) walk(c, me); };
  walk(profile.head, false);
  return Math.round((bytes / calls) * 10) / 10;
}
(async () => {
  const N = 20000; const COLD = 120; const NAMES = /^(hlCameras|hlCamL|hlCamR|hlFinite7)$/;
  // cold: the first calls of a fresh copy (the preview runs it every few hundred ms: it never gets optimised there)
  const oldCold = await bytesPerCall(make(OLD, env(world())), /^hlCameras$/, COLD, false);
  const newCold = await bytesPerCall((() => { const f = make(NEW, env(world())); return () => f(1); })(), NAMES, COLD, false);
  check(oldCold > 256, 'the measure has teeth: the round-80 camera check, cold, allocates per call (3 layers × 2 cameras)', { bytesPerCall: oldCold });
  // per second in the preview: the old one ran twice a second, the new one every 2 s (its every-4th-tick gate)
  check(newCold * 0.5 <= oldCold * 2 / 6, 'cold, per second in the preview: at most a sixth of the round-80 check', { newBytesPerCall: newCold, newPerSec: newCold * 0.5, oldPerSec: oldCold * 2 });
  const newWarm = await bytesPerCall((() => { const f = make(NEW, env(world())); return () => f(1); })(), NAMES, N);
  check(newWarm <= 8, 'optimised, it allocates (next to) nothing per call', { bytesPerCall: newWarm });
  const gate = make(NEW, env(world())); let looks = 0; const W2 = world(); const E2 = env(W2); const g2 = make(NEW, E2);
  for (const L of W2.values()) for (const r of L.renderers) Object.defineProperty(r, '__lastCamera', { get() { looks += 1; return cam(); } });
  for (let i = 0; i < 8; i += 1) g2();
  check(typeof gate === 'function' && looks === 2 * 6, 'it looks at the cameras on every 4th stats tick (twice in 8 ticks)', { looks });

  // ---------- 2. the frame wrapper keeps its kept-entry path for a new function every frame ----------
  const wrapSrc = /window\.requestAnimationFrame = \(fn\) => \{[\s\S]*?\n {2}\};/.exec(html)?.[0] || '';
  check(/frameOwner\?\.L && ctxLayer === frameOwner\.id && alive\(frameOwner\)/.test(wrapSrc) && /o\.poolN \? o\.pool\[--o\.poolN\] : rafEntry\(o, null, true\)/.test(wrapSrc), 'the layer frame wrapper reuses a kept entry for a function asked from inside its own layer\'s frame');
  check(/if \(e\.pooled\) \{ e\.fn = null; o\.pool\[o\.poolN\+\+\] = e; \}/.test(html), 'an entry goes back to its layer\'s pool right before its function runs (the function asks there)');

  // ---------- 3. an eval leaves no timer behind ----------
  const evalSrc = /async function runEval\(\{ id, code \}\) \{[\s\S]*?\n\}\n/.exec(html)?.[0];
  check(Boolean(evalSrc), 'the preview\'s runEval is in the sandbox');
  if (evalSrc) {
    const timers = new Map(); let seq = 0; const posted = [];
    const runEval = new Function('realSetTimeout', 'realClearTimeout', 'post', 'describe', `${evalSrc}\nreturn runEval;`)(
      (fn, ms) => { seq += 1; timers.set(seq, { fn, ms }); return seq; }, (t) => { timers.delete(t); }, (m) => posted.push(m), (v) => v);
    await runEval({ id: 1, code: 'return 6 * 7' });
    await runEval({ id: 2, code: 'const x = 1; throw new Error("nope" + "")' });
    await runEval({ id: 3, code: 'return new Promise((r) => r("later"))' });
    check(posted.map((m) => `${m.id}:${m.ok}:${m.ok ? m.value : m.error}`).join(' ') === '1:true:42 2:false:Error: nope 3:true:later', 'evals answer as before (a value, a throw, a promise)', posted.map((m) => m.value ?? m.error));
    check(timers.size === 0, 'no time-out left set after they answered (it fired 4 s later, an Error each time)', { left: timers.size });
    const slow = runEval({ id: 4, code: 'return new Promise(() => {})' });
    await new Promise((r) => setImmediate(r));
    const [[, t]] = [...timers]; check(t?.ms === 4000, 'a slow eval still has its 4 s time-out');
    t.fn(); await slow;
    check(posted.at(-1)?.ok === false && /Timed out after 4 s/.test(posted.at(-1)?.error || ''), 'and says it timed out', posted.at(-1)?.error);
  }

  console.log(fails ? `\n${fails} failed` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
