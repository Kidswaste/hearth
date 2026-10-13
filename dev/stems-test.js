#!/usr/bin/env node
// Unit test for the Lab's stems (tools/three-stems-core.js, round 30 "stems") on a generated song with known parts:
//   A  0–4 s   bass notes only          B  4–8 s   kicks only (120 BPM)
//   C  8–12 s  a sung-like "voice" only (a gliding tone with vibrato, harmonics and syllables)
//   D 12–16 s  a held pad chord only (not a voice: "everything else")
//   E 16–24 s  everything: kicks, hats, bass notes off the beat, the voice
// Checks: the drums move on the kicks and not on the bass notes; the bass follows the bass and not the kicks; the
// voice follows the voice and not the bass, the kicks or the pad; the pad is "everything else"; in the full mix each
// part still comes through; the same song gives the same bytes; it runs well under real time.
//   node dev/stems-test.js [--verbose]
const SC = require('../tools/three-stems-core.js');

const verbose = process.argv.includes('--verbose');
let fails = 0; let total = 0;
const check = (name, ok, info) => { total += 1; if (!ok) fails += 1; console.log(`${ok ? '✓' : '✖'} ${name}${info !== undefined ? ` ${JSON.stringify(info)}` : ''}`); };
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- the song ----------
function makeSong(sr = 22050) {
  const secs = 24; const n = secs * sr; const x = new Float32Array(n);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i += 1) x[a + i] += f(i / sr); };
  const beat = 0.5; const truth = { kicks: [], bassOn: [], hats: [] };
  const kick = (t) => { let ph = 0; let prev = 0; add(t, 0.25, (s) => { const f = 50 + 110 * Math.exp(-s * 35); ph += (2 * Math.PI * f) * (s - prev); prev = s; return 0.9 * Math.sin(ph) * Math.exp(-s * 14); }); truth.kicks.push(t); };
  const hat = (t) => { let p = 0; add(t, 0.05, (s) => { const v = rnd(); const d = v - p; p = v; return 0.18 * d * Math.exp(-s * 80); }); truth.hats.push(t); };
  const NOTES = [55, 73.42, 65.41, 82.41, 61.74, 49];
  const bassNote = (t, len, k) => { const f = NOTES[k % NOTES.length]; add(t, len, (s) => 0.45 * Math.min(1, s / 0.012) * Math.min(1, (len - s) / 0.03) * (Math.sin(2 * Math.PI * f * s) + 0.25 * Math.sin(4 * Math.PI * f * s)) * Math.exp(-s * 0.6)); truth.bassOn.push(t); };
  // the voice: a melody gliding between notes, 5.5 Hz vibrato, harmonics with a formant-ish tilt, syllables
  const voice = (t0, t1) => {
    const mel = [220, 247, 262, 247, 196, 220, 294, 262]; let ph = 0;
    add(t0, t1 - t0, (s) => {
      const q = s / 0.4; const k = Math.floor(q); const fr = q - k; const a = mel[k % mel.length]; const b = mel[(k + 1) % mel.length];
      const f0 = (a + (b - a) * Math.min(1, Math.max(0, (fr - 0.7) / 0.3))) * (1 + 0.025 * Math.sin(2 * Math.PI * 5.5 * s));
      ph += (2 * Math.PI * f0) / sr;
      const syl = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, ((s % 0.4) / 0.4)));
      let v = 0; for (let h = 1; h <= 8; h += 1) v += Math.sin(ph * h) * [0, 1, 0.7, 0.9, 0.5, 0.35, 0.25, 0.15, 0.1][h];
      return 0.16 * v * syl * Math.min(1, s / 0.05) * Math.min(1, (t1 - t0 - s) / 0.05);
    });
  };
  const pad = (t0, t1) => add(t0, t1 - t0, (s) => { let v = 0; for (const f of [261.6, 329.6, 392]) for (let h = 1; h <= 4; h += 1) v += Math.sin(2 * Math.PI * f * h * s) / (h * h); return 0.12 * v * Math.min(1, s / 0.2) * Math.min(1, (t1 - t0 - s) / 0.2); });
  // A: bass notes on and off the beat
  for (let k = 0; k < 8; k += 1) bassNote(k * 0.5 + 0.1, 0.45, k);
  // B: kicks
  for (let t = 4; t < 8; t += beat) kick(t);
  // C: the voice
  voice(8.2, 11.8);
  // D: a pad
  pad(12.1, 15.9);
  // E: everything (bass notes 3/8 of a beat after the kick, hats on the off-eighths)
  for (let k = 0; k < 16; k += 1) { const t = 16 + k * beat; kick(t); hat(t + beat / 2); bassNote(t + 0.1875, 0.28, k); }
  voice(16.2, 23.8);
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); for (let i = 0; i < n; i += 1) x[i] = (x[i] / peak) * 0.9;
  return { x, sr, truth };
}

const { x, sr, truth } = makeSong();
const t0 = Date.now();
const tr = SC.separate(x, sr);
const ms = Date.now() - t0;
const I = SC.IDX;
const at = (name, t) => SC.at(tr, I[name], t);
const mean = (name, a, b) => { let s = 0; let c = 0; for (let t = a; t < b; t += 0.01) { s += at(name, t); c += 1; } return s / c; };
const max = (name, a, b) => { let m = 0; for (let t = a; t < b; t += 0.01) m = Math.max(m, at(name, t)); return m; };
const peakNear = (name, t, w = 0.05) => max(name, t, t + w);
if (verbose) for (let t = 0; t < 24; t += 0.25) console.log(t.toFixed(2), SC.KEYS.map((k, i) => `${k} ${r2(SC.at(tr, i, t))}`).join('  '));

check('24 s separated well under real time (< 6 s)', ms < 6000, { ms, frames: tr.n, fps: r2(tr.fps) });
check('a frame every ~10 ms, 7 parts per frame, bytes', Math.abs(tr.fps - 100) < 1 && tr.F === 7 && tr.data instanceof Uint8Array && tr.data.length === tr.n * 7);
// drums
const kB = truth.kicks.filter((t) => t >= 4 && t < 8);
check('drums: high on each kick (kicks only)', kB.every((t) => peakNear('stemDrums', t) > 0.6), kB.map((t) => r2(peakNear('stemDrums', t))));
check('drums: low between the kicks', kB.every((t) => at('stemDrums', t + 0.4) < 0.3), kB.map((t) => r2(at('stemDrums', t + 0.4))));
check('drums: still on the bass notes (bass only)', max('stemDrums', 0, 3.9) < 0.3, r2(max('stemDrums', 0, 3.9)));
check('drums: still on the voice and the pad', max('stemDrums', 8.3, 15.8) < 0.3, r2(max('stemDrums', 8.3, 15.8)));
check('kick: the kick part is what moves (kicks only)', kB.every((t) => peakNear('stemKick', t) > 0.6), kB.map((t) => r2(peakNear('stemKick', t))));
// bass
check('bass: follows the bass notes (bass only)', mean('stemBass', 0.15, 3.9) > 0.5, r2(mean('stemBass', 0.15, 3.9)));
check('bass: low on kicks only', mean('stemBass', 4, 8) < 0.25, r2(mean('stemBass', 4, 8)));
check('bass: quiet on the voice', mean('stemBass', 8.3, 11.7) < 0.2, r2(mean('stemBass', 8.3, 11.7)));
// voice
check('voice: follows the voice (voice only)', mean('stemVocals', 8.4, 11.6) > 0.45, r2(mean('stemVocals', 8.4, 11.6)));
check('voice: quiet on the bass notes', mean('stemVocals', 0.2, 3.8) < 0.15, r2(mean('stemVocals', 0.2, 3.8)));
check('voice: quiet on the kicks', mean('stemVocals', 4.2, 7.8) < 0.15, r2(mean('stemVocals', 4.2, 7.8)));
check('voice: a held pad is not a voice (lower than the voice)', mean('stemVocals', 12.5, 15.5) < mean('stemVocals', 8.4, 11.6) * 0.6, { pad: r2(mean('stemVocals', 12.5, 15.5)), voice: r2(mean('stemVocals', 8.4, 11.6)) });
check('everything else: the pad', mean('stemOther', 12.5, 15.5) > 0.45 && mean('stemOther', 12.5, 15.5) > mean('stemOther', 8.4, 11.6), { pad: r2(mean('stemOther', 12.5, 15.5)), voice: r2(mean('stemOther', 8.4, 11.6)) });
// the full mix
const kE = truth.kicks.filter((t) => t >= 16.2 && t < 23.5);
check('mix: drums high on each kick', kE.every((t) => peakNear('stemDrums', t) > 0.6), kE.map((t) => r2(peakNear('stemDrums', t))));
const bE = truth.bassOn.filter((t) => t >= 16.2 && t < 23.5);
const kickAtBass = bE.map((t) => peakNear('stemKick', t + 0.02, 0.05)); const kickAtKick = kE.map((t) => peakNear('stemKick', t));
check('mix: the kick part is higher on kicks than on bass notes', kickAtBass.reduce((a, b) => a + b, 0) / kickAtBass.length < (kickAtKick.reduce((a, b) => a + b, 0) / kickAtKick.length) * 0.6, { atBass: r2(kickAtBass.reduce((a, b) => a + b, 0) / kickAtBass.length), atKick: r2(kickAtKick.reduce((a, b) => a + b, 0) / kickAtKick.length) });
check('mix: hats found on the off-eighths', truth.hats.filter((t) => t > 16.2 && t < 23.5).every((t) => peakNear('stemHats', t) > 0.5));
check('mix: the bass comes through', mean('stemBass', 16.2, 23.7) > 0.35, r2(mean('stemBass', 16.2, 23.7)));
check('mix: the voice comes through', mean('stemVocals', 16.4, 23.6) > 0.3, r2(mean('stemVocals', 16.4, 23.6)));
// deterministic
const again = SC.separate(x, sr);
check('the same song gives the same bytes (renders match the preview)', again.n === tr.n && again.data.every((v, i) => v === tr.data[i]));
// another rate in (44.1 kHz → 22.05 kHz)
{
  const x2 = new Float32Array(x.length * 2); for (let i = 0; i < x2.length; i += 1) x2[i] = x[i >> 1];
  const t2 = SC.separate(x2, 44100);
  check('44.1 kHz in: same length and the kicks still found', Math.abs(t2.n - tr.n) <= 1 && kB.every((t) => SC.at(t2, I.stemDrums, t + 0.02) > 0.5), { n: t2.n });
}
check('silence: every part 0', SC.separate(new Float32Array(22050), 22050).data.every((v) => v === 0));

console.log(`\n${total - fails}/${total} passed${fails ? `, ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
