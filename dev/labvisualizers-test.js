// Node tests for 🎵 Music visualizers (tools/three-vis-core.js + the code tools/three-vis.js writes): the song track
// (bass bands up on the kicks, down between them; levelled; the waveform), a frame is a function of the time alone
// (any order, the same bytes), a paused song uploads nothing, the hits walked back from the playhead, what it listens to,
// the demo song, the 17 presets' shaders, the layer code and its edits, and the source the preview page runs.
//   node dev/labvisualizers-test.js
const assert = require('assert');
const C = require('../tools/three-vis-core.js');
let n = 0; const TOTAL = 11;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };

// a fixture song: kicks (a falling sine, 50–160 Hz) at irregular times, a soft hat every 0.25 s
const sr = 22050; const secs = 6; const x = new Float32Array(sr * secs);
const KICKS = [0.5, 1.3, 1.8, 2.9, 3.4, 4.6, 5.1];
for (const t of KICKS) { let ph = 0; const a = Math.round(t * sr); for (let i = 0; i < 0.25 * sr && a + i < x.length; i++) { const s = i / sr; ph += (2 * Math.PI * (50 + 110 * Math.exp(-s * 35))) / sr; x[a + i] += 0.9 * Math.sin(ph) * Math.exp(-s * 14); } }
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
for (let t = 0.125; t < secs; t += 0.25) { const a = Math.round(t * sr); for (let i = 0; i < 0.03 * sr; i++) x[a + i] += 0.08 * rnd() * Math.exp(-i / sr * 80); }
const tr = C.analyze(x, sr);
const listHits = (arr) => (t) => { let k = -1; for (let i = 0; i < arr.length; i++) if (arr[i] <= t) k = i; return k < 0 ? null : { k, at: arr[k], prev: k ? arr[k - 1] : null, next: arr[k + 1] ?? arr[k] + 0.5 }; };
const kick = listHits(KICKS);
const O = { listen: 'whole', sens: 1, smooth: 0.35, bars: 32 };
const bass = (t) => { let s = 0; const f = Math.round(t * C.FPS); for (let b = 0; b < 12; b++) s += tr.spec[f * C.NB + b]; return s / 12 / 255; };

ok('the track: 60 frames a second × 64 bands, loudness, travel, an 11 kHz waveform', () => {
  assert.strictEqual(tr.n, secs * 60); assert.strictEqual(tr.spec.length, tr.n * 64); assert.strictEqual(tr.lev.length, tr.n);
  assert.ok(Math.abs(tr.wr - 11025) < 1 && tr.wave.length === Math.floor(x.length / 2));
  for (let i = 1; i <= tr.n; i++) assert.ok(tr.cum[i] > tr.cum[i - 1], 'travel always goes on');
});
ok('the bass bands are up on each kick and down just before it', () => {
  for (const k of KICKS) { const on = bass(k + 0.03); const before = bass(k - 0.06); assert.ok(on > 0.6 && on > before + 0.3, `kick ${k}: ${on.toFixed(2)} vs ${before.toFixed(2)}`); }
});
ok('a frame is a function of the time alone: any order, the same bytes (what makes renders exact)', () => {
  const T = [0.51, 2.95, 1.31, 4.0, 0.51, 5.12];
  const run = (order) => { const S = C.state('bars'); const out = {}; for (const t of order) { C.frame(S, tr, t, kick, null, O); out[t] = Buffer.from(S.data).toString('base64') + JSON.stringify({ ...S.u, ages: [...S.u.ages] }); } return out; };
  const a = run(T); const b = run([...T].reverse()); const c = run([4.0, 0.51, 5.12, 1.31, 2.95]);
  for (const t of T) { assert.strictEqual(a[t], b[t], `t=${t}`); assert.strictEqual(a[t], c[t], `t=${t}`); }
});
ok('a paused song uploads nothing (the same time twice: no change), a new time does', () => {
  const S = C.state('rings');
  assert.strictEqual(C.frame(S, tr, 1.0, kick, null, O), true);
  assert.strictEqual(C.frame(S, tr, 1.0, kick, null, O), false);
  assert.strictEqual(C.frame(S, tr, 1.0, kick, null, { ...O, sens: 1.5 }), true, 'a slider moved');
  assert.strictEqual(C.frame(S, tr, 1.0 + 1 / 240, kick, null, { ...O, sens: 1.5 }), true);
});
ok('the hits: the last 8 walked back from the playhead, a pulse on the last one, nothing before the first', () => {
  const S = C.state('rings');
  C.frame(S, tr, 3.0, kick, null, O);
  const ages = [...S.u.ages].map((v) => Math.round(v * 1000) / 1000);
  assert.deepStrictEqual(ages.slice(0, 5), [0.1, 1.2, 1.7, 2.5, 99]);
  assert.strictEqual(S.u.hitK, 3); assert.ok(S.u.pulse > 0.3 && S.u.pulse < 1, `pulse ${S.u.pulse}`);
  C.frame(S, tr, 0.2, kick, null, O); assert.strictEqual(S.u.pulse, 0); assert.strictEqual(S.u.ages[0], 99);
  C.frame(S, tr, 0.5, kick, null, O); assert.ok(Math.abs(S.u.pulse - 1) < 1e-9, 'on the kick: full');
});
ok('what it listens to: bass bars show only the low end; "kick" drives on the hits', () => {
  const S = C.state('bars');
  C.frame(S, tr, 1.32, kick, null, { ...O, listen: 'bass', bars: 8 }); const low = [...S.data.slice(0, 8)];
  C.frame(S, tr, 1.32, kick, null, { ...O, listen: 'highs', bars: 8 }); const high = [...S.data.slice(0, 8)];
  assert.ok(Math.max(...low) > 150 && Math.max(...low) > Math.max(...high), `${low} vs ${high}`);
  C.frame(S, tr, 1.3, kick, null, { ...O, listen: 'kick' }); assert.ok(S.u.drive > 0.95);
  C.frame(S, tr, 1.29, kick, null, { ...O, listen: 'kick' }); assert.ok(S.u.drive < 0.1);
  C.frame(S, tr, 1.3, kick, () => 0.5, { ...O, listen: 'vocals' }); assert.ok(Math.abs(S.u.drive - 0.5) < 1e-9, 'a part of the song: its own level');
});
ok('the oscilloscope row starts on a rising zero crossing; the waveform row is centred on 128', () => {
  const S = C.state('scope'); C.frame(S, tr, 1.4, kick, null, O);
  const w = S.data.subarray(2 * C.TW, 3 * C.TW);
  assert.ok(w[0] >= 124 && w[0] <= 140 && w[3] >= w[0], `${w[0]} ${w[3]}`);
  let lo = 255; let hi = 0; for (const v of w) { lo = Math.min(lo, v); hi = Math.max(hi, v); } assert.ok(lo < 100 && hi > 156);
});
ok('the demo song: drawn in a few ms, loops (t and t + 4 s give the same frame), kicks every 0.5 s', () => {
  const t0 = Date.now(); const d = C.demoTrack(); assert.ok(Date.now() - t0 < 200 && d.loop === 4);
  const S = C.state('bars'); const a = (t) => { C.frame(S, d, t, C.DEMO_HITS.kick, null, O); return [...S.data.slice(0, 32)].join(); };
  assert.strictEqual(a(1.03), a(5.03)); assert.notStrictEqual(a(1.03), a(1.3));
  assert.deepStrictEqual([C.DEMO_HITS.kick(1.2).at, C.DEMO_HITS.snare(1.2).at, C.DEMO_HITS.hats(1.2).at], [1, 0.5, 1]);
});
ok('17 presets: unique ids, a shader each on the shared header (no extra uniforms), defaults, names found', () => {
  assert.strictEqual(C.PRESETS.length, 17); assert.strictEqual(new Set(C.PRESETS.map((p) => p.id)).size, 17);
  for (const p of C.PRESETS) {
    const f = C.frag(p.id);
    assert.ok(/vec4 vis\(vec2 q\)/.test(f) && /void main\(\)/.test(f), p.id);
    assert.ok(!/\buniform\b/.test(p.glsl), `${p.id} declares its own uniform`);
    assert.ok(p.colors.length === 3 && C.LISTEN[p.defaults.listen] && p.defaults.bars > 1, p.id);
    let opens = 0; for (const ch of f) { if (ch === '{') opens++; if (ch === '}') opens--; assert.ok(opens >= 0); } assert.strictEqual(opens, 0, `${p.id} braces`);
  }
  assert.strictEqual(C.preset('vu meters').id, 'vu'); assert.strictEqual(C.preset('logo').id, 'logo'); assert.strictEqual(C.preset('oscilloscope').id, 'scope'); assert.strictEqual(C.preset('nothing at all'), null);
});
ok('the layer code: a tweak() block + visualizer(P, { preset }); its values and the picture change in place', () => {
  global.window = {}; global.VisCore = C; global.LabVisHook = { isVis: (c) => /\bvisualizer\s*\(\s*P\s*,/.test(c) };
  require('../tools/three-vis.js'); const V = global.window.LabVis;
  const code = V.codeFor(C.preset('logo'), { listen: 'bass', colors: ['#112233'], image: 'my cover' });
  assert.ok(/listen: \{ value: 'bass'/.test(code) && /c3: \{ value: '#112233'/.test(code) && /visualizer\(P, \{ preset: 'logo', image: 'my cover' \}\);/.test(code));
  assert.strictEqual(V.presetOf(code).id, 'logo');
  let c2 = V.setValue(code, 'sens', 2.25); c2 = V.setValue(c2, 'listen', 'kick'); c2 = V.setValue(c2, 'image', 'logo2');
  assert.ok(/sens: \{ value: 2\.25,/.test(c2) && /listen: \{ value: 'kick'/.test(c2) && /image: 'logo2' \}\);/.test(c2));
  assert.ok(/preset: 'logo' \}\);/.test(V.setValue(c2, 'image', '')));
  assert.throws(() => V.setValue(code, 'nope', 1));
});
ok('the preview page\'s copy: the factory as source runs on its own and gives the same frame', () => {
  // eslint-disable-next-line no-new-func
  new Function(`(function () { const F = (${C.factory}); globalThis.viscore = F(); globalThis.viscore.factory = String(F); })();`)();
  const P = globalThis.viscore; const a = C.state('spectrogram'); const b = P.state('spectrogram');
  C.frame(a, tr, 2.0, kick, null, O); P.frame(b, P.analyze(x, sr), 2.0, kick, null, O);
  assert.strictEqual(Buffer.from(a.data).toString('base64'), Buffer.from(b.data).toString('base64'));
  assert.ok(/function hearthVisCore/.test(P.factory));
});

console.log(`${n}/${TOTAL} passed`);
if (n !== TOTAL) process.exitCode = 1;
