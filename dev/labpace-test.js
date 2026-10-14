#!/usr/bin/env node
// Lab frame pacing (round 33 "labpace"): the pure parts of "<pace-core>" in tools/three-sandbox.html, run in Node on
// fake frame clocks and fake three.js scenes: f60 (per-frame motion at the same speed on 60 / 120 / 144 / 240 Hz and
// under a 30 fps cap), the templates written with it (no per-frame decay or spin left without it), the still-picture
// signature (what changes it, what makes a scene "live", its cost), the gate (draws, then stops, a refresh a second,
// a poke or a change draws at once, an animating scene looked at every 8th frame), the steadiness meter, and the
// adaptive ladder's battery floor.
//   node dev/labpace-test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'tools', 'three-sandbox.html'), 'utf8');
const src = /\/\/ <pace-core>[^\n]*\n([\s\S]*?)\/\/ <\/pace-core>/.exec(html)?.[1];
const asrc = /\/\/ <adapt-core>[^\n]*\n([\s\S]*?)\/\/ <\/adapt-core>/.exec(html)?.[1];
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };
check(Boolean(src) && Boolean(asrc), 'the pace core and the adapt core are in the sandbox');
if (!src || !asrc) process.exit(1);
const paceCore = new Function(`${src}\nreturn paceCore;`)();
const adaptCore = new Function(`${asrc}\nreturn adaptCore;`)();
const P = paceCore();

// ---------- 1. f60 ----------
const near = (x, y, e = 1e-9) => Math.abs(x - y) <= e;
check(near(P.f60(1000 / 60), 1) && near(P.f60(1000 / 120), 0.5) && near(P.f60(1000 / 240), 0.25) && near(P.f60(1000 / 30), 2), 'f60: 1 at 60 Hz, 0.5 at 120, 0.25 at 240, 2 under a 30 fps cap');
check(P.f60(-1) === 1 && P.f60(0) === 0 && P.f60(5000) === 15 && near(P.f60(125), 7.5) && P.f60(NaN) === 1, 'f60: a first frame / a clock that went back = 1, the same moment again = 0, a slow 8 fps preview 7.5, a long pause at most 15 (¼ s)');

// a sketch's frame loop on a fake display: hz frames a second for `secs` (optionally a cap: every n-th frame runs)
function play(hz, secs, frame, { cap = 0, jitter = 0 } = {}) {
  let lt = -1; let t = 0; let capT = -1; const step = 1000 / hz; let n = 0; let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  while (t < secs * 1000) {
    t += step * (1 + (jitter ? (rnd() - 0.5) * 2 * jitter : 0));
    if (cap && capT >= 0 && t - capT < 1000 / cap - 2) continue; // (the sandbox's capOk)
    capT = t;
    const f60 = P.f60(lt < 0 ? -1 : t - lt); lt = t; n += 1;
    frame(f60, t);
  }
  return n;
}
// what the templates do every frame: a kick envelope (peak hold, decaying), a spin, a damped velocity
function sim(hz, opts, useF60 = true) {
  const st = { kick: 0, rot: 0, vx: 1, x: 0, kickAt: [] };
  const kicks = [300, 800, 1300, 1800]; let ki = 0;
  play(hz, 2, (f, t) => {
    const k = useF60 ? f : 1;
    let hit = 0; if (ki < kicks.length && t >= kicks[ki]) { hit = 1; ki += 1; }
    st.kick = Math.max(st.kick * 0.9 ** k, hit);
    st.rot += 0.01 * k;
    st.vx *= 0.99 ** k; st.x += st.vx * k * 0.01;
    if (t >= 1000 && !st.mid) st.mid = { kick: st.kick, rot: st.rot };
  }, opts);
  return st;
}
const rates = [60, 120, 144, 240];
const runs = rates.map((hz) => sim(hz));
const runs30 = sim(60, { cap: 30 });
const ref = runs[0];
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-9, Math.abs(b));
const worst = (key) => Math.max(...[...runs, runs30].map((r) => rel(r[key], ref[key])));
check(worst('rot') < 0.02, 'a spin (rotation += 0.01 * f60) turns the same in 2 s at 60 / 120 / 144 / 240 Hz and capped at 30', runs.map((r) => +r.rot.toFixed(3)).concat(+runs30.rot.toFixed(3)));
check(worst('x') < 0.03, 'a damped drift (v *= 0.99 ** f60) travels the same distance', runs.map((r) => +r.x.toFixed(3)));
// the kick envelope: how far it has faded a given time after the hit, whatever the rate (0.9 per 60 fps frame)
const env = (hz, f60 = true) => {
  let kk = 0; let lt = -1; let t = 0; let hitAt = -1; let err = 0;
  while (t < 600) {
    t += 1000 / hz; const f = f60 ? P.f60(lt < 0 ? -1 : t - lt) : 1; lt = t;
    const hit = hitAt < 0 && t >= 100 ? 1 : 0; if (hit) hitAt = t;
    kk = Math.max(kk * 0.9 ** f, hit);
    if (hitAt >= 0) err = Math.max(err, Math.abs(kk - 0.9 ** ((t - hitAt) / (1000 / 60))));
  }
  return err;
};
check(Math.max(...rates.map((hz) => env(hz))) < 1e-9, 'a kick fades by elapsed time (0.9 per 1/60 s) at 60 / 120 / 144 / 240 Hz', rates.map((hz) => env(hz)));
check(env(240, false) > 0.3, 'before: at 240 Hz it faded 4× too fast', +env(240, false).toFixed(2));
const old = rates.map((hz) => sim(hz, {}, false));
check(rel(old[3].rot, old[0].rot) > 2.5, 'before (per-frame, no f60) a 240 Hz screen spun ≈ 4× faster', { at60: +old[0].rot.toFixed(2), at240: +old[3].rot.toFixed(2) });
const jit = sim(120, { jitter: 0.3 });
check(rel(jit.rot, ref.rot) < 0.02, 'uneven frames (±30 % jitter at 120 Hz) still turn the same', +jit.rot.toFixed(3));

// ---------- 2. the templates use it ----------
for (const f of ['tools/three-fx-templates.js', 'tools/three-gallery-data.js', 'tools/three-data.js']) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const decay = [...s.matchAll(/([\w[\].]+) = Math\.max\(([\w[\].]+) \* (0\.\d+)(?! \*\* f60)[,)]/g)].filter((m) => m[1] === m[2]).map((m) => m[0]);
  const spins = [...s.matchAll(/\.rotation\.[xyz] \+= ([^;`\n]+);/g)].filter((m) => !/f60|\bdt\b|delta/.test(m[1])).map((m) => m[0]);
  const damp = [...s.matchAll(/[\w[\].]+ \*= 0\.9\d*;/g)].map((m) => m[0]);
  check(!decay.length && !spins.length && !damp.length, `${f}: per-frame decays / spins / damping all go through f60`, [...decay, ...spins, ...damp].slice(0, 4));
}
check(/f60/.test(fs.readFileSync(path.join(ROOT, 'mcp', 'three-guide.js'), 'utf8')), 'the director\'s help (audio helpers) explains f60');

// ---------- 3. the signature ----------
const V3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const obj = (extra = {}) => ({ visible: true, position: V3(), quaternion: { x: 0, y: 0, z: 0, w: 1 }, scale: V3(1, 1, 1), matrixAutoUpdate: true, matrix: { elements: new Array(16).fill(0) }, layers: { mask: 1 }, renderOrder: 0, frustumCulled: true, children: [], ...extra });
let ids = 10;
const mesh = () => obj({ isMesh: true, material: { id: ids++, version: 0, opacity: 1, roughness: 0.5, color: { isColor: true, r: 1, g: 0.5, b: 0 }, uniforms: { uTime: { value: 0 }, uTint: { value: V3(1, 1, 1) } } }, geometry: { id: ids++, attributes: { position: { version: 0 }, normal: { version: 0 } }, index: { version: 0 }, drawRange: { start: 0, count: Infinity } } });
function makeScene(n) {
  const scene = obj({ isScene: true, background: { isColor: true, r: 0, g: 0, b: 0 }, fog: null });
  for (let i = 0; i < n; i += 1) { const m = mesh(); m.position.x = i; scene.children.push(m); }
  const light = obj({ isLight: true, intensity: 2, color: { isColor: true, r: 1, g: 1, b: 1 } });
  scene.children.push(light);
  const camera = obj({ isCamera: true, fov: 50, zoom: 1, near: 0.1, far: 100, aspect: 1.5, projectionMatrix: { elements: new Array(16).fill(1) } });
  camera.position.z = 8;
  const r = { toneMapping: 0, toneMappingExposure: 1, autoClear: true, shadowMap: { enabled: false }, domElement: { width: 640, height: 360 } };
  return { scene, camera, r, light };
}
const S = makeScene(200);
const sig = () => { const x = P.signature(S.scene, S.camera, S.r, [1, 1, 1, 0]); return { a: x.a, b: x.b, live: x.live, nodes: x.nodes }; };
const s0 = sig();
check(s0.a === sig().a && s0.b === sig().b && !s0.live, 'the same scene gives the same signature (and isn\'t "live")', s0);
const changes = {
  'an object moved a hair (1e-6)': () => { S.scene.children[5].position.x += 1e-6; },
  'an object rotated': () => { S.scene.children[7].quaternion.y = 0.1; },
  'a far object moved (with drawRange count = Infinity everywhere)': () => { S.scene.children[199].position.y = 3; },
  'a material color': () => { S.scene.children[3].material.color.g = 0.6; },
  'a material roughness (a slider)': () => { S.scene.children[3].material.roughness = 0.51; },
  'a uniform number (uTime)': () => { S.scene.children[2].material.uniforms.uTime.value = 0.016; },
  'a uniform vector': () => { S.scene.children[2].material.uniforms.uTint.value.y = 0.9; },
  'a geometry attribute updated (version)': () => { S.scene.children[1].geometry.attributes.position.version += 1; },
  'an object hidden': () => { S.scene.children[4].visible = false; },
  'a light\'s intensity': () => { S.light.intensity = 2.5; },
  'the camera moved': () => { S.camera.position.z = 7.9; },
  'the camera zoomed (projection)': () => { S.camera.projectionMatrix.elements[0] = 1.1; },
  'the canvas resized': () => { S.r.domElement.width = 641; },
  'the exposure': () => { S.r.toneMappingExposure = 1.1; },
  'the background color': () => { S.scene.background.r = 0.1; },
  'an object added': () => { S.scene.children.push(mesh()); },
  'a new geometry on a mesh': () => { S.scene.children[6].geometry = { ...S.scene.children[6].geometry, id: ids++ }; },
};
for (const [name, fn] of Object.entries(changes)) { const b = sig(); fn(); const a = sig(); check(a.a !== b.a || a.b !== b.b, `the signature sees: ${name}`); }
{
  const b = sig(); const x = P.signature(S.scene, S.camera, S.r, [0.85, 1, 1, 0]);
  check(x.a !== b.a, 'the signature sees the page\'s own numbers (the preview\'s pixel ratio / quality)');
}
const liveCases = {
  'a video texture': () => { S.scene.children[8].material.map = { isTexture: true, isVideoTexture: true, version: 1 }; },
  'an onBeforeRender hook': () => { S.scene.children[9].onBeforeRender = () => {}; },
  'onBeforeCompile with uniforms it can\'t reach': () => { S.scene.children[10].material.onBeforeCompile = () => {}; },
};
for (const [name, fn] of Object.entries(liveCases)) {
  const T = makeScene(20); const keep = S.scene; S.scene = T.scene; fn(); const x = sig(); S.scene = keep;
  check(x.live, `a scene with ${name} always draws ("live")`);
}
{
  const big = makeScene(4100); const x = P.signature(big.scene, big.camera, big.r);
  check(x.live, 'a scene over 4,000 objects always draws (no signature cost)', x.nodes);
}
{
  const T = makeScene(20); const m = T.scene.children[0].material; m.onBeforeCompile = () => {}; m.userData = { shader: { uniforms: { uTime: { value: 0 } } } };
  const a = P.signature(T.scene, T.camera, T.r); m.userData.shader.uniforms.uTime.value = 1; const b = P.signature(T.scene, T.camera, T.r);
  check(!a.live && a.a !== b.a, 'onBeforeCompile that keeps its shader (userData.shader): its uniforms are read, not "live"');
}
// cost
for (const n of [100, 500, 2000]) {
  const T = makeScene(n); const N = n > 1000 ? 40 : 200;
  // (round 35, bugbash2) the best of 6 rounds after a warm-up: one mean over the whole run failed now and then when the
  // machine was busy (88 µs for 100 objects on one run, 40 on the next); the cost itself is what's asserted
  for (let i = 0; i < N; i += 1) P.signature(T.scene, T.camera, T.r, [1, 1, 1, 0]);
  let us = Infinity;
  // (round 37) best of 20 short rounds: same limits, but one GC pause or busy moment can no longer fail it
  for (let k = 0; k < 20; k += 1) {
    const t0 = process.hrtime.bigint(); for (let i = 0; i < N; i += 1) P.signature(T.scene, T.camera, T.r, [1, 1, 1, 0]);
    us = Math.min(us, Number(process.hrtime.bigint() - t0) / 1000 / N);
  }
  check(us < n * 0.6 + 20, `the signature of a ${n}-object scene costs ${us.toFixed(1)} µs (Node)`);
}

// ---------- 4. the gate ----------
{
  const st = {}; const frames = []; let t = 0;
  let cur = { a: 1, b: 2, live: false }; const sigOf = () => cur;
  const draw = (poke = 0) => !P.still(st, t, poke, sigOf);
  for (let i = 0; i < 120; i += 1) { t += 1000 / 120; frames.push(draw()); }
  const drawn = frames.filter(Boolean).length;
  check(frames[0] && frames[1] && frames[2] && !frames[3] && drawn === 1 + P.AFTER, 'a still picture: drawn, twice more, then not at all (1 s at 120 Hz)', { drawn });
  let refresh = 0; for (let i = 0; i < 240; i += 1) { t += 1000 / 120; if (draw()) refresh += 1; }
  check(refresh === 2, 'still for 2 more seconds: one refresh a second', refresh);
  t += 8; check(draw(1), 'a poke (a slider, a message, a pointer) draws at once');
  for (let i = 0; i < 5; i += 1) { t += 8; draw(1); }
  cur = { a: 9, b: 2, live: false };
  let lag = -1; for (let i = 0; i < 10 && lag < 0; i += 1) { t += 1000 / 240; if (draw(1)) lag = i; }
  check(lag >= 0 && lag * (1000 / 240) <= P.LOOK, `its own change (no poke) draws within ${P.LOOK} ms even at 240 Hz`, { frames: lag });
  let more = 0; for (let i = 0; i < 20; i += 1) { t += 1000 / 240; if (draw(1)) more += 1; }
  check(more === P.AFTER, '… and it stops again two identical frames later', more);
  cur = { a: 1, b: 1, live: true };
  let all = 0; let first = -1; for (let i = 0; i < 100; i += 1) { t += 4; if (draw(1)) { all += 1; if (first < 0) first = i; } }
  check(first * 4 <= P.LOOK && all === 100 - first, 'a scene turning live (a video) draws within 15 ms and then on every frame', { first, all });
}
{
  // an animating scene: the signature on every frame for 30 frames, then every 8th; a pause is caught within a few
  const st = {}; let looks = 0; let t = 0; let k = 0;
  for (let i = 0; i < 240; i += 1) { t += 1000 / 240; P.still(st, t, 0, () => { looks += 1; return { a: (k += 1), b: 0 }; }); }
  check(looks < 70, 'an animating scene: the signature runs on ≈ 1 frame in 8 once it has moved for 30 frames', `${looks} of 240`);
  let caught = -1; for (let i = 0; i < 40; i += 1) { t += 1000 / 240; if (P.still(st, t, 0, () => ({ a: k, b: 0 }))) { caught = i; break; } }
  check(caught >= 0 && caught < 8 + P.AFTER + 3, 'it stops moving: the picture stops drawing within a few frames', caught);
}

// ---------- 5. a still scene on fake displays: the GPU work and the signature's own work ----------
for (const hz of [60, 240]) {
  const T = makeScene(50); const st = {}; let drawn = 0; let t = 0; let firstAfter = -1; let sigs = 0;
  for (let i = 0; i < hz * 3; i += 1) {
    t += 1000 / hz;
    if (i === hz * 2) T.scene.children[3].position.x = 5; // (something moves after 2 s)
    if (!P.still(st, t, 0, () => { sigs += 1; return P.signature(T.scene, T.camera, T.r); })) { drawn += 1; if (i >= hz * 2 && firstAfter < 0) firstAfter = i - hz * 2; }
  }
  check(drawn <= 9 && firstAfter >= 0 && firstAfter * (1000 / hz) <= P.LOOK, `a still scene at ${hz} Hz for 3 s: ${drawn} frames drawn instead of ${hz * 3}; a change shows ${firstAfter} frame(s) later; signatures ${sigs}`, { drawn, firstAfter, sigs });
}

// ---------- 6. the meter ----------
{
  const m = P.meter(); for (let i = 0; i < 240; i += 1) m.feed(1000 / 120 + (i % 2 ? 0.2 : -0.2));
  const r = m.read();
  check(r.fps === 120 && r.label === 'steady', 'meter: even 120 Hz frames read "120 fps · steady"', r);
  const m2 = P.meter(); for (let i = 0; i < 240; i += 1) m2.feed(i % 10 === 0 ? 33.3 : 16.7);
  check(m2.read().label === 'uneven', 'meter: a dropped frame in every ten reads "uneven"', m2.read());
  const m3 = P.meter(); for (let i = 0; i < 240; i += 1) m3.feed(i % 25 === 0 ? 14 : 4.17);
  check(m3.read().fps === 240 && m3.read().label === 'a few drops', 'meter: 240 Hz with a drop now and then reads "240 fps · a few drops"', m3.read());
  check(P.meter().read().label === 'measuring', 'meter: not enough frames yet → "measuring"');
}

// ---------- 7. the battery floor in the adaptive ladder ----------
{
  const A = adaptCore();
  check(A.floor(1) === 1 && A.step.scale === 0.85, 'on battery: the ladder starts one step lighter (85 % resolution)', A.state());
  let t = 0; for (let i = 0; i < 60 * 30; i += 1) { t += 1000 / 60; A.feed(1000 / 60, 1000 / 60, t); }
  check(A.level === 1, 'smooth frames for 30 s on battery: it never climbs above the floor', A.level);
  for (let i = 0; i < 60 * 6; i += 1) { t += 40; A.feed(40, 1000 / 60, t); }
  check(A.level > 1, 'slow frames on battery: it still steps down past the floor', A.level);
  const B = adaptCore(); B.floor(1); B.floor(0);
  check(B.level === 0, 'plugged back in: a step only the battery held goes back to full at once', B.level);
  const C = adaptCore(); for (let i = 0; i < 60 * 6; i += 1) { t += 40; C.feed(40, 1000 / 60, t); } const lv = C.level; C.floor(1); C.floor(0);
  check(C.level === lv && lv > 1, 'plugged in while frames were dropping: the ladder keeps what it chose', { lv, now: C.level });
}

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
