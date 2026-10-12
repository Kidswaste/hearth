#!/usr/bin/env node
// Unit tests for the Lab's audio features (tools/three-audio-core.js, round 23 "labaudio") on generated songs with
// known answers (dev/make-test-song.js): the live path (samples in blocks of 128, frames every 512 samples, like the
// AudioWorklet) finds the kicks / snares / hats on time, the tempo, the beat and bar phase with how sure it is; the
// song path finds the drops and the builds before them; the key of a chord loop; the LUFS-ish loudness; the mapping
// curve (threshold, curve, invert, attack / release).
//   node dev/audio-test.js [--verbose]
const AF = require('../tools/three-audio-core.js');
const { song } = require('./make-test-song.js');

const verbose = process.argv.includes('--verbose');
let fails = 0; let total = 0;
const check = (name, ok, info) => { total += 1; if (!ok) fails += 1; console.log(`${ok ? '✓' : '✖'} ${name}${info !== undefined ? ` ${JSON.stringify(info)}` : ''}`); };
const r3 = (x) => Math.round(x * 1000) / 1000;
function match(found, truth, tol) {
  const hit = truth.filter((t) => found.some((f) => Math.abs(f - t) <= tol)).length;
  const good = found.filter((f) => truth.some((t) => Math.abs(f - t) <= tol)).length;
  return { recall: truth.length ? r3(hit / truth.length) : 1, precision: found.length ? r3(good / found.length) : 1, found: found.length, truth: truth.length };
}

// ---------- 1. live: a 128 BPM four-on-the-floor song through the worklet's path ----------
{
  const rate = 48000; const hop = 512;
  const s = song({ bpm: 128, secs: 40, sr: rate, lead: 0.3 });
  const T = s.truth;
  const frames = []; let f = 0;
  const t0 = Date.now();
  const st = AF.stream({ rate, hop, bytes: true, track: true, onFrame: (feat, spec, wave) => { frames.push({ t: (1024 + f * hop) / rate, v: Float32Array.from(feat), spec0: spec[3], wave0: wave[0] }); f += 1; } });
  for (let i = 0; i < s.samples.length; i += 128) st.push(s.samples.subarray(i, i + 128)); // render quanta
  const ms = Date.now() - t0;
  const I = AF.IDX;
  const on = (k) => frames.filter((x, j) => x.v[k] === 1 && (j === 0 || frames[j - 1].v[k] !== 1)).map((x) => x.t);
  // the onset is heard when the attack is inside the window (≤ one window late): times are compared ~25 ms earlier
  const shift = (arr) => arr.map((t) => t - 0.025);
  check('live: 40 s analysed faster than real time ×20', ms < 2000, { ms, frames: frames.length });
  const kicks = match(shift(on(I.kickOn)), T.kicks, 0.04);
  check('live: kicks found on time (±40 ms)', kicks.recall > 0.9 && kicks.precision > 0.85, kicks);
  const snares = match(shift(on(I.snareOn)), T.snares, 0.045);
  check('live: snares found', snares.recall > 0.7 && snares.precision > 0.7, snares);
  const hats = match(shift(on(I.hatOn)), T.hats, 0.04);
  check('live: hats found', hats.recall > 0.7 && hats.precision > 0.7, hats);
  const late = frames.filter((x) => x.t > 12);
  const bpm = late[late.length - 1].v[I.bpm];
  check('live: tempo 128 (±2 %) after 12 s', Math.abs(bpm - 128) / 128 < 0.02, { bpm, conf: r3(late[late.length - 1].v[I.beatConf]) });
  check('live: beat confidence high on a steady beat', late[late.length - 1].v[I.beatConf] > 0.5, r3(late[late.length - 1].v[I.beatConf]));
  // the beat phase at each true kick (after 15 s): near 0 (or 1)
  const ph = T.kicks.filter((t) => t > 15 && t < 39).map((t) => { const fr = frames.find((x) => x.t >= t + 0.025); return fr ? fr.v[I.beatPhase] : 0; });
  const dist = ph.map((p) => Math.min(p, 1 - p));
  const avgD = dist.reduce((a, b) => a + b, 0) / dist.length;
  check('live: beat phase lines up with the kicks (mean distance < 0.12 beat)', avgD < 0.12, { mean: r3(avgD), n: ph.length });
  // bar phase steps by ¼ each beat and wraps every 4 beats
  const bp = T.kicks.filter((t) => t > 20 && t < 30).map((t) => { const fr = frames.find((x) => x.t >= t + 0.06); return fr ? Math.round(fr.v[I.barPhase] * 4) % 4 : -1; });
  const steps = bp.slice(1).map((x, i) => (x - bp[i] + 4) % 4);
  check('live: bar phase counts 1-2-3-4 on the beats', steps.filter((x) => x === 1).length >= steps.length - 1, { bp });
  const bands = (a, b, k) => { const xs = frames.filter((x) => x.t >= a && x.t < b); return xs.reduce((s0, x) => s0 + x.v[k], 0) / xs.length; };
  check('live: the 8 bands all move (each band 0..1, some energy)', [0, 1, 2, 3, 4, 5, 6].every((k) => bands(5, 35, k) > 0.05 && bands(5, 35, k) <= 1), Array.from({ length: 8 }, (_, k) => r3(bands(5, 35, k))));
  check('live: analyser-style bytes and waveform come with each frame', frames.some((x) => x.spec0 > 0) && frames.some((x) => x.wave0 !== 128));
  const lu = late.map((x) => x.v[I.lufs]); const luM = lu.reduce((a, b) => a + b, 0) / lu.length;
  check('live: loudness in a sane LUFS range for this mix (−30…−5)', luM > -30 && luM < -5, r3(luM));
  check('live: centroid / flux / flatness in 0..1', late.every((x) => x.v[I.centroid] >= 0 && x.v[I.centroid] <= 1 && x.v[I.flux] >= 0 && x.v[I.flux] <= 1 && x.v[I.flatness] >= 0 && x.v[I.flatness] <= 1));
  if (verbose) console.log({ onsets: { kick: on(I.kickOn).slice(0, 8).map(r3), truth: T.kicks.slice(0, 8).map(r3) } });
}

// ---------- 2. loudness calibration: a 1 kHz sine at full scale ≈ −3 LUFS, −20 dB ≈ −23 ----------
{
  const rate = 48000;
  for (const [amp, want] of [[1, -3], [0.1, -23]]) {
    let last = null;
    const st = AF.stream({ rate, hop: 512, bytes: false, track: false, onFrame: (feat) => { last = feat[AF.IDX.lufs]; } });
    const x = new Float32Array(rate * 2); for (let i = 0; i < x.length; i += 1) x[i] = amp * Math.sin((2 * Math.PI * 1000 * i) / rate);
    st.push(x);
    check(`loudness: 1 kHz sine ×${amp} ≈ ${want} LUFS (±1.5)`, Math.abs(last - want) < 1.5, r3(last));
  }
}

// ---------- 3. the key of a chord loop (A minor: Am – F – C – G) ----------
{
  const rate = 44100; const n = rate * 16; const x = new Float32Array(n);
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // midi notes
  const hzOf = (m) => 440 * 2 ** ((m - 69) / 12);
  for (let i = 0; i < n; i += 1) { const c = chords[Math.floor(i / (rate * 2)) % 4]; let v = 0; for (const m of [...c, c[0] - 12]) v += Math.sin((2 * Math.PI * hzOf(m) * i) / rate) * 0.12; x[i] = v; }
  const st = AF.stream({ rate, hop: 512, bytes: false, track: false, onFrame: () => {} });
  st.push(x);
  check('key: Am–F–C–G is A minor (or its relative C major)', [21, 0].includes(st.ex.key), { key: AF.keyName(st.ex.key), conf: r3(st.ex.keyConf) });
}

// ---------- 4. a whole song: drops and the builds before them ----------
{
  const s = song({ bpm: 126, form: true, sr: 44100, lead: 0.5 });
  const T = s.truth;
  const t0 = Date.now();
  const tr = AF.analyzeTrack(s.samples, s.sr);
  const ms = Date.now() - t0;
  const drops = T.sections.filter((x) => x.name === 'Drop').map((x) => x.start);
  const build = T.sections.find((x) => x.name === 'Build');
  check('song: features for every 10 ms', tr.n === Math.floor(s.samples.length / Math.round(s.sr / 100)) && tr.data.length === tr.n * tr.F, { n: tr.n, secs: r3(s.samples.length / s.sr), ms });
  check('song: both drops found (±1.5 s)', drops.every((d) => tr.meta.drops.some((x) => Math.abs(x - d) < 1.5)), { found: tr.meta.drops, truth: drops.map(r3) });
  check('song: no more than one extra drop', tr.meta.drops.length <= drops.length + 1, tr.meta.drops);
  const b = tr.meta.builds.find((x) => Math.abs(x.end - drops[0]) < 1.5);
  check('song: the build before the first drop (starts within its build section ±4 s)', b && b.start > build.start - 4 && b.start < drops[0] - 3, { builds: tr.meta.builds, truth: { start: r3(build.start), end: r3(drops[0]) } });
  const at = (t, k) => AF.dec(AF.IDX[k], tr.data[Math.floor(t * tr.fps) * tr.F + AF.IDX[k]]);
  check('song: build ramps up through the build', b && at(b.start + 0.3 * (b.end - b.start), 'build') < at(b.start + 0.9 * (b.end - b.start), 'build'), b && [r3(at(b.start + 0.3 * (b.end - b.start), 'build')), r3(at(b.start + 0.9 * (b.end - b.start), 'build'))]);
  check('song: drop pulses at the drop and fades', at(drops[0] + 0.1, 'drop') > 0.85 && at(drops[0] + 5, 'drop') < 0.2, [r3(at(drops[0] + 0.1, 'drop')), r3(at(drops[0] + 5, 'drop'))]);
  const brk = T.sections.find((x) => x.name === 'Break').start;
  check('song: intensity higher in the drop than in the break', at(drops[0] + 8, 'intensity') > at(brk + 6, 'intensity') + 0.2, [r3(at(drops[0] + 8, 'intensity')), r3(at(brk + 6, 'intensity'))]);
  check('song: analysed in < 4 s', ms < 4000, ms);
}

// ---------- 5. the mapping curve ----------
{
  const c = { thr: 0.5, gam: 1, inv: false, att: 0, rel: 0 };
  check('curve: under the threshold → 0', AF.shape(0.4, c) === 0);
  check('curve: threshold rescales the rest to 0..1', Math.abs(AF.shape(0.75, c) - 0.5) < 1e-9);
  check('curve: invert', AF.shape(1, { inv: true }) === 0 && AF.shape(0, { inv: true }) === 1);
  check('curve: punchier above 1', AF.shape(0.5, { gam: 2 }) === 0.25);
  const st = {}; const env = { att: 0, rel: 100 };
  AF.shape(0, env, st, 0); AF.shape(1, env, st, 10); const y = AF.shape(0, env, st, 110);
  check('curve: release 100 ms falls to 1/e after 100 ms, attack 0 jumps', Math.abs(y - Math.exp(-1)) < 1e-6, r3(y));
  const st2 = {}; AF.shape(0, { att: 50 }, st2, 0); const y2 = AF.shape(1, { att: 50 }, st2, 50);
  check('curve: attack 50 ms rises to 1 − 1/e after 50 ms', Math.abs(y2 - (1 - Math.exp(-1))) < 1e-6, r3(y2));
}

console.log(`\n${total - fails}/${total} passed`);
process.exit(fails ? 1 : 0);
