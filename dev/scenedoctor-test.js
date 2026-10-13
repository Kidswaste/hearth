// 🩺 Fix my scene (round 34, scenedoctor): the detectors in Node (tools/three-doctor-core.js), on synthetic readings.
//   node dev/scenedoctor-test.js
const assert = require('assert');
const path = require('path');
const D = require(path.join(__dirname, '..', 'tools', 'three-doctor-core.js'));
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`✓ ${name}`); };

// RGBA pictures
const fill = (w, h, f) => { const px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const [r, g, b] = f(x, y); const i = (y * w + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; } return px; };
const W = 64; const H = 36;
const black = D.picture(fill(W, H, () => [0, 0, 0]), W, H);
const scene = D.picture(fill(W, H, (x, y) => ((x - 32) ** 2 + (y - 18) ** 2 < 120 ? [220, 120, 60] : [20, 22, 30])), W, H);
const dim = D.picture(fill(W, H, (x, y) => ((x - 32) ** 2 + (y - 18) ** 2 < 120 ? [40, 30, 25] : [4, 4, 6])), W, H);
const blown = D.picture(fill(W, H, (x) => (x < 40 ? [255, 255, 255] : [200, 190, 180])), W, H);
const layer = (o = {}) => ({ id: 'L1', name: 'Orb', visible: true, opacity: 1, code: 'scene.add(mesh)', sliders: [], ...o });
const probe = (o = {}) => ({ objects: 5, meshes: 2, points: 0, instances: 0, lights: 2, lit: 2, env: false, pr: 1, nan: [], missing: [], ortho: false, rig: false, inside: null, subject: { share: 0.2, offscreen: false, behind: false }, frame: { p: [0, 0, 6], q: [0, 0, 0, 1], fov: 50 }, ...o });
const ids = (R) => D.diagnose(R).map((f) => f.id);
const healthy = { pic: scene, layers: [layer()], probe: { Orb: probe() }, errors: [], console: [], perf: { fps: 60, parked: false, light: false, adapt: true }, sound: false };

t('the picture: black, a scene, dim, blown out', () => {
  assert.ok(black.std < 0.012 && black.mean === 0 && black.black === 1);
  assert.ok(scene.std > 0.05 && scene.p95 > 0.4);
  assert.ok(dim.p95 < 0.3 && dim.mean < 0.12 && dim.std >= 0.012);
  assert.ok(blown.white > 0.35);
  assert.ok(D.isBlank(fill(8, 8, () => [10, 10, 10]), 8, 8) && !D.isBlank(fill(8, 8, (x) => [x * 30, 0, 0]), 8, 8));
});
t('a healthy scene: nothing found', () => {
  assert.deepStrictEqual(ids(healthy), []);
});
t('a layer that throws: one finding per layer, Hide when other layers show, the error in the ask', () => {
  const R = { ...healthy, layers: [layer(), layer({ id: 'L2', name: 'Sparks' })], probe: { Orb: probe(), Sparks: probe() }, errors: [{ layer: 'Sparks', message: 'TypeError: Cannot read properties of undefined (reading \'x\')', line: 12 }, { layer: 'Sparks', message: 'again', line: 13 }] };
  const f = D.diagnose(R).filter((x) => x.kind === 'error');
  assert.strictEqual(f.length, 1);
  assert.deepStrictEqual(f[0].fix, { kind: 'hide', layer: 'L2', label: 'Hide this layer' });
  assert.ok(/Sparks/.test(f[0].text) && /line 12/.test(f[0].text) && /line 12/.test(f[0].ask) && /undefined/.test(f[0].ask));
  // the only layer throws: no Hide (it would leave nothing), the director instead
  const one = D.diagnose({ ...healthy, errors: [{ layer: 'Orb', message: 'boom' }] }).find((x) => x.kind === 'error');
  assert.strictEqual(one.fix, null);
  assert.ok(/The sketch stopped/.test(one.text));
  // a hidden layer's old error isn't reported
  assert.ok(!ids({ ...R, layers: [layer(), layer({ id: 'L2', name: 'Sparks', visible: false })] }).some((x) => x.startsWith('error')));
});
t('a black frame: why, and the fix that matches', () => {
  // every layer hidden → show them
  let f = D.diagnose({ ...healthy, pic: black, layers: [layer({ visible: false })] }).find((x) => x.kind === 'blank');
  assert.deepStrictEqual(f.fix, { kind: 'show', layers: ['L1'], label: 'Show the layer' });
  assert.ok(/all black because its only layer is hidden/.test(f.text));
  // the subject off-screen → the camera turns to it (one finding, not two)
  const off = D.diagnose({ ...healthy, pic: black, probe: { Orb: probe({ subject: { share: 0, offscreen: true, behind: true } }) } });
  f = off.find((x) => x.kind === 'blank');
  assert.strictEqual(f.fix.kind, 'frame'); assert.strictEqual(f.fix.layer, 'L1'); assert.deepStrictEqual(f.fix.frame.p, [0, 0, 6]);
  assert.ok(!off.some((x) => x.kind === 'offscreen'));
  // lit materials, no lights → the director (no local fix)
  f = D.diagnose({ ...healthy, pic: black, probe: { Orb: probe({ lights: 0 }) } }).find((x) => x.kind === 'blank');
  assert.strictEqual(f.fix, null); assert.ok(/no lights/.test(f.text) && /Add lights/.test(f.ask));
  // a layer error → the blank says so
  f = D.diagnose({ ...healthy, pic: black, errors: [{ layer: 'Orb', message: 'ReferenceError: foo is not defined' }] }).find((x) => x.kind === 'blank');
  assert.ok(/error/.test(f.text) && /foo is not defined/.test(f.ask));
});
t('the subject off-screen, tiny, the camera inside it (frame fixes; none for an ortho camera or a rig)', () => {
  let f = D.diagnose({ ...healthy, probe: { Orb: probe({ subject: { share: 0, offscreen: true, behind: false } }) } });
  assert.deepStrictEqual(f.map((x) => x.id), ['offscreen:L1']); assert.strictEqual(f[0].fix.kind, 'frame'); assert.ok(/outside the frame/.test(f[0].text));
  f = D.diagnose({ ...healthy, probe: { Orb: probe({ subject: { share: 0.0004, offscreen: false, behind: false } }) } });
  assert.deepStrictEqual(f.map((x) => x.id), ['tiny:L1']); assert.strictEqual(f[0].fix.label, 'Frame it');
  f = D.diagnose({ ...healthy, probe: { Orb: probe({ inside: 'Box' }) } });
  assert.deepStrictEqual(f.map((x) => x.id), ['inside:L1']); assert.ok(/inside "Box"/.test(f[0].text)); assert.strictEqual(f[0].fix.label, 'Step the camera out');
  f = D.diagnose({ ...healthy, probe: { Orb: probe({ ortho: true, subject: { share: 0, offscreen: true } }) } });
  assert.strictEqual(f[0].fix, null); assert.ok(/Point the camera/.test(f[0].ask));
  f = D.diagnose({ ...healthy, probe: { Orb: probe({ rig: true, subject: { share: 0, offscreen: true } }) } });
  assert.strictEqual(f[0].fix, null);
  // a 2D sketch (no three.js scene): the picture's subject box says tiny
  f = D.diagnose({ ...healthy, probe: {}, subject: { x0: 0.5, y0: 0.5, x1: 0.53, y1: 0.53, fill: 0.0008 } });
  assert.deepStrictEqual(f.map((x) => x.id), ['tiny:picture']);
});
t('too dark / blown out → autopolish\'s exposure fixes only', () => {
  let f = D.diagnose({ ...healthy, pic: dim });
  assert.deepStrictEqual(f.map((x) => x.id), ['dark']); assert.deepStrictEqual(f[0].fix.only, ['dark', 'blacks']);
  f = D.diagnose({ ...healthy, pic: blown });
  assert.deepStrictEqual(f.map((x) => x.id), ['bright']); assert.strictEqual(f[0].fix.kind, 'light');
});
t('NaN / undefined values: a NaN slider gets reset, a NaN object goes to the director, the console too', () => {
  let f = D.diagnose({ ...healthy, layers: [layer({ sliders: [{ key: 'speed', label: 'Speed', value: NaN, min: 0, max: 4 }] })] });
  assert.deepStrictEqual(f.map((x) => x.id), ['nan:L1']); assert.deepStrictEqual(f[0].fix.set, { speed: 2 }); assert.ok(/"Speed" has no number/.test(f[0].text));
  f = D.diagnose({ ...healthy, probe: { Orb: probe({ nan: ['Ring'] }) } });
  assert.strictEqual(f[0].fix, null); assert.ok(/"Ring" got a NaN/.test(f[0].text));
  f = D.diagnose({ ...healthy, console: ['THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN.'] });
  assert.deepStrictEqual(f.map((x) => x.id), ['nan:console']);
});
t('very slow frames: the cause in plain words, then the lightest local fix', () => {
  const slow = { ...healthy, perf: { fps: 9, parked: false, light: false, adapt: true } };
  let f = D.diagnose({ ...slow, probe: { Orb: probe({ meshes: 6000 }) } }).find((x) => x.kind === 'slow');
  assert.ok(/9 frames a second, with 6,000 separate objects/.test(f.text)); assert.strictEqual(f.fix.kind, 'lightmode'); assert.ok(/InstancedMesh/.test(f.ask));
  // a count slider: halved (it's the scene's own knob)
  f = D.diagnose({ ...slow, layers: [layer({ sliders: [{ key: 'count', label: 'Count', value: 40000, min: 100, max: 100000 }] })], probe: { Orb: probe({ points: 900000 }) } }).find((x) => x.kind === 'slow');
  assert.deepStrictEqual(f.fix, { kind: 'slider', layer: 'L1', set: { count: 20000 }, label: 'Halve "Count"' });
  // the preview's own ladder switched off → back on first
  f = D.diagnose({ ...slow, perf: { ...slow.perf, adapt: false } }).find((x) => x.kind === 'slow');
  assert.strictEqual(f.fix.kind, 'adapt');
  // already in Light mode with nothing to halve: the director
  f = D.diagnose({ ...slow, perf: { ...slow.perf, light: true }, probe: { Orb: probe({ pr: 3 }) } }).find((x) => x.kind === 'slow');
  assert.strictEqual(f.fix, null); assert.ok(/pixel ratio of 3/.test(f.text) && /Math.min\(devicePixelRatio/.test(f.ask));
  // a parked / fast preview isn't judged
  assert.ok(!ids({ ...slow, perf: { ...slow.perf, parked: true } }).includes('slow'));
});
t('reacting to music with nothing playing → listen to the computer\'s sound', () => {
  let f = D.diagnose({ ...healthy, layers: [layer({ code: 'mesh.scale.setScalar(1 + audio.bass * 2)' })] });
  assert.deepStrictEqual(f.map((x) => x.id), ['noaudio']); assert.strictEqual(f[0].fix.kind, 'live');
  f = D.diagnose({ ...healthy, layers: [layer({ sliders: [{ key: 'size', value: 1, followsMusic: { band: 'kick', amount: 0.4 } }] })] });
  assert.deepStrictEqual(f.map((x) => x.id), ['noaudio']);
  assert.deepStrictEqual(ids({ ...healthy, sound: true, layers: [layer({ code: 'audio.kick' })] }), []);
  assert.deepStrictEqual(ids({ ...healthy, layers: [layer({ code: '// no audio here: audioContext' })] }), []);
});
t('a missing texture / file (the scene\'s textures and the console)', () => {
  let f = D.diagnose({ ...healthy, probe: { Orb: probe({ missing: ['wood.jpg'] }) } });
  assert.deepStrictEqual(f.map((x) => x.id), ['missing']); assert.ok(/"wood.jpg"/.test(f[0].text) && f[0].fix === null && /wood.jpg/.test(f[0].ask));
  f = D.diagnose({ ...healthy, console: ['GET file:///x/textures/sky%20blue.png net::ERR_FILE_NOT_FOUND'] });
  assert.ok(/sky%20blue.png/.test(f[0].text));
});
t('the director\'s request stays short (it is the whole message)', () => {
  const all = [
    ...D.diagnose({ ...healthy, pic: black, errors: [{ layer: 'Orb', message: 'x'.repeat(400), line: 3 }] }),
    ...D.diagnose({ ...healthy, perf: { fps: 5, parked: false, light: true, adapt: true }, probe: { Orb: probe({ meshes: 9000, missing: ['a.png'] }) } }),
  ];
  for (const f of all) { const a = D.askText(f, 'My long scene name '.repeat(5)); assert.ok(D.tokens(a) <= 70, `${D.tokens(a)}: ${a}`); }
});
t('the probe\'s source is self-contained (sent through the sandbox eval)', () => {
  const src = D.probeSource();
  assert.ok(/^return JSON\.stringify\(\(function probe\(S\)/.test(src) && /globalThis\.__scenes/.test(src));
  // eslint-disable-next-line no-new-func
  assert.strictEqual(new Function('globalThis', src.replace('globalThis.__scenes', 'undefined'))({}), '{}');
});
console.log(`\n${n} tests passed`);
