#!/usr/bin/env node
// Unit tests for the Lab's music analysis (tools/three-music-core.js) on synthetic songs with known answers
// (dev/make-test-song.js): tempo, bar 1, kick / snare / hat onsets, sections and drops, the style pick.
//   node dev/music-test.js            # every case, ✓ / ✖ per check, exit 1 on a failure
//   node dev/music-test.js --verbose  # also print what was found
// The same checks run inside the app (Worker, decoding, the timeline) with dev/checks/music.js.
const MusicCore = require('../tools/three-music-core.js');
const { song } = require('./make-test-song.js');

const verbose = process.argv.includes('--verbose');
let fails = 0; let total = 0;
const check = (name, ok, info) => { total += 1; if (!ok) fails += 1; console.log(`${ok ? '✓' : '✖'} ${name}${info !== undefined ? ` ${JSON.stringify(info)}` : ''}`); };
// share of `truth` times with a found time within tol (recall) and of found times near a true one (precision)
function match(found, truth, tol = 0.03) {
  const hit = truth.filter((t) => found.some((f) => Math.abs(f - t) <= tol)).length;
  const good = found.filter((f) => truth.some((t) => Math.abs(f - t) <= tol)).length;
  return { recall: truth.length ? hit / truth.length : 1, precision: found.length ? good / found.length : 1, found: found.length, truth: truth.length };
}
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));

function run(label, opts, expect) {
  const s = song({ sr: 22050, ...opts });
  const t0 = Date.now();
  const a = MusicCore.analyzeSignal(s.samples, s.sr);
  const ms = Date.now() - t0;
  const T = s.truth;
  console.log(`\n== ${label}: ${(s.samples.length / s.sr).toFixed(1)} s in ${ms} ms`);
  if (verbose) console.log(round({ bpm: a.bpm, grid: a.grid, downIndex: a.downIndex, sections: a.sections, drops: a.drops, style: a.style, onsets: Object.fromEntries(Object.entries(a.onsets).map(([k, v]) => [k, v.length])) }));
  check(`${label}: tempo ${T.bpm}`, Math.abs(a.bpm - T.bpm) < 0.15, { found: a.bpm, conf: a.grid.tempoConf });
  check(`${label}: straight grid`, a.grid.straight, a.grid.straightness);
  // bar 1: the grid anchor must be a true downbeat (any bar)
  const bar = (60 / T.bpm) * 4;
  const off = ((a.grid.anchor - T.firstDownbeat) % bar + bar) % bar;
  const err = Math.min(off, bar - off);
  check(`${label}: bar 1 on a true downbeat`, err < 0.025, { anchor: a.grid.anchor, truth: Math.round(T.firstDownbeat * 1000) / 1000, errMs: Math.round(err * 1000), conf: a.grid.downbeatConf });
  // beats on true beats
  const bm = match(a.beats, T.beats, 0.03);
  check(`${label}: beats on the beat`, bm.recall > 0.9 && bm.precision > 0.9, bm);
  const km = match(a.onsets.kick.map((o) => o.t), T.kicks, 0.02);
  check(`${label}: kicks (±20 ms)`, km.recall > 0.85 && km.precision > 0.85, km);
  const sm = match(a.onsets.snare.map((o) => o.t), T.snares, 0.025);
  check(`${label}: snares (±25 ms)`, sm.recall > (expect?.snareRecall ?? 0.8) && sm.precision > 0.8, sm);
  if (expect?.hats !== false) { const hm = match(a.onsets.hats.map((o) => o.t), T.hats.filter((h) => !T.snares.some((x) => Math.abs(x - h) < 0.035)), 0.02); check(`${label}: hats (±20 ms)`, hm.recall > 0.75 && hm.precision > 0.75, hm); }
  if (T.sections.length) {
    // every true section start has a found one within a bar, and the drops are called drops
    const starts = a.sections.map((x) => x.start);
    const near = T.sections.slice(1).map((x) => ({ name: x.name, ok: starts.some((st) => Math.abs(st - x.start) <= bar * 0.55) }));
    check(`${label}: section starts within a bar`, near.every((x) => x.ok), near.filter((x) => !x.ok).map((x) => x.name));
    const dropTrue = T.sections.filter((x) => x.name === 'Drop').map((x) => x.start);
    const dropsOk = dropTrue.every((d) => a.drops.some((x) => Math.abs(x - d) <= bar * 0.55));
    check(`${label}: drops found`, dropsOk && a.drops.length === dropTrue.length, { found: a.drops, truth: dropTrue.map((x) => Math.round(x * 100) / 100) });
    const labels = a.sections.map((x) => x.label).join(' ');
    check(`${label}: labels`, expect?.labels ? expect.labels.test(labels) : true, labels);
  }
  if (expect?.style) check(`${label}: style → ${expect.style}`, expect.style.test(a.style.preset), a.style);
  return a;
}

run('short 120 (the journey song)', { bpm: 120, secs: 16 }, { hats: false });
run('full form 128, pickup 2, lead 0.137 s', { bpm: 128, form: true, pickup: 2, lead: 0.137 }, { labels: /^Intro Build Drop Break (Build )?Drop Outro$/, style: /Techno/ });
run('full form 174 breaks', { bpm: 174, form: true, pickup: 1, lead: 0.05, style: 'breaks' }, { style: /Drum|DnB/, snareRecall: 0.7 });
run('full form 140 half-time', { bpm: 140, form: true, pickup: 3, lead: 0.3, style: 'half' }, { style: /Trap|Hip-hop|Dubstep/ });
run('full form 95 four', { bpm: 95, form: true, lead: 0.42 }, {});
// played: the tempo drifts 3 % and hits wander ±12 ms (a band, not a grid): beats must follow, the grid isn't straight
{
  const s = song({ sr: 22050, bpm: 100, form: true, pickup: 0, lead: 0.2, drift: 0.03, jitter: 12 });
  const a = MusicCore.analyzeSignal(s.samples, s.sr);
  console.log('\n== played 100 → 103 BPM, ±12 ms');
  check('played: beats follow the drift', match(a.beats, s.truth.beats, 0.05).recall > 0.85, match(a.beats, s.truth.beats, 0.05));
  check('played: not a straight grid', !a.grid.straight || a.grid.straightness < 0.9, a.grid.straightness);
  check('played: kicks (±25 ms)', match(a.onsets.kick.map((o) => o.t), s.truth.kicks, 0.025).recall > 0.8, match(a.onsets.kick.map((o) => o.t), s.truth.kicks, 0.025));
}
// no beat at all (a pad): nothing breaks, nothing much is found
{
  const sr = 22050; const n = sr * 12; const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / sr) * Math.min(1, i / sr) * Math.min(1, (n - i) / sr);
  const a = MusicCore.analyzeSignal(x, sr);
  console.log('\n== a pad, no beat');
  check('pad: analyses without errors', Number.isFinite(a.bpm) && Array.isArray(a.sections), { bpm: a.bpm, sections: a.sections.length });
  check('pad: (almost) no kicks or snares', a.onsets.kick.length + a.onsets.snare.length < 4, { kick: a.onsets.kick.length, snare: a.onsets.snare.length });
  check('pad: style is soft', /Ambient/.test(a.style.preset), a.style.preset);
}
// silence and a very short clip
{
  const a = MusicCore.analyzeSignal(new Float32Array(22050 * 3), 22050);
  check('silence: analyses without errors', Number.isFinite(a.bpm) && a.onsets.kick.length === 0, { bpm: a.bpm });
  const b = MusicCore.analyzeSignal(new Float32Array(500).map(() => Math.random() - 0.5), 22050);
  check('a 20 ms clip: analyses without errors', Number.isFinite(b.duration), { duration: b.duration });
}

// pure helpers
{
  const P = MusicCore._parts;
  const ma = P.movingMax(Float32Array.from([1, 3, 2, 5, 1, 0, 0]), 1);
  check('movingMax', Array.from(ma).join(',') === '3,3,5,5,5,1,0', Array.from(ma));
  const re = new Float64Array(8); const im = new Float64Array(8); re[1] = 1; P.fftPlan(8)(re, im);
  check('fft of a unit impulse at 1 has |X| = 1', Array.from(re).every((x, i) => Math.abs(Math.hypot(x, im[i]) - 1) < 1e-9));
}
console.log(`\n${total - fails}/${total} passed`);
process.exit(fails ? 1 : 0);
