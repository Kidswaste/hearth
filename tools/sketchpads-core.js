/* (round 67, sketchpads67) Sketches → playable material: the thinking, with no DOM and no runtime (Node tests require
   it: dev/sketchpads67-test.js). The bar grid a trimmed loop snaps to (the session's tempo, or one found in the audio),
   the loop a pair of handles makes (start on a beat, a whole number of bars, never past the sketch's end), the tempo
   finder (an onset envelope + autocorrelation, then the beat's phase and the bar's first beat), the waveform's peaks,
   the cut itself (exact frames at 48 kHz, 3 ms edges so it loops without a click) and the loop's file name.
   tools/sketchpads.js is the view (Sessions › ✂ Trim loop / 🎛 Put on a pad); sketchpadsmain.js writes the files. */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.SketchPadsCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const RATE = 48000, MIN_BPM = 40, MAX_BPM = 240, FIND = [70, 180], BAR_CHOICES = [1, 2, 4, 8, 16];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const EPS = 1e-6;

  // ---------- tempo and the grid ----------
  const beatSec = bpm => 60 / bpm;
  const barSec = (bpm, beats = 4) => beats * 60 / bpm;
  /** A BPM typed in the field: a number from 40 to 240 (one decimal), else null. */
  function parseBpm(v) { const n = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(n) && n >= MIN_BPM && n <= MAX_BPM ? Math.round(n * 10) / 10 : null; }
  /** t (seconds) to the nearest grid line: unit 'beat' or 'bar', the grid starting at origin (the first beat heard). */
  function snap(t, { bpm, beats = 4, origin = 0, unit = 'beat' }) {
    const step = unit === 'bar' ? barSec(bpm, beats) : beatSec(bpm);
    return origin + Math.round((t - origin) / step) * step;
  }
  /** The grid lines inside [0, dur]: [{ t, bar }] (bar = true on a bar's first beat), for drawing. */
  function grid({ bpm, beats = 4, origin = 0, dur }) {
    const step = beatSec(bpm), out = []; if (!(bpm > 0) || !(dur > 0)) return out;
    let k = Math.ceil((0 - origin) / step - EPS);
    for (let t = origin + k * step; t <= dur + EPS && out.length < 2000; k++, t = origin + k * step) out.push({ t: Math.max(0, t), bar: ((k % beats) + beats) % beats === 0 });
    return out;
  }
  /** The loop two handles make: start on the nearest beat (≥ 0), then a whole number of bars (≥ 1) as close as the end
   *  handle asks, never past the sketch's end. → { start, end, bars, seconds } or null when not even one bar fits. */
  function plan({ start, end, bpm, beats = 4, origin = 0, dur }) {
    const bar = barSec(bpm, beats), beat = beatSec(bpm); if (!(bpm > 0) || !(dur > 0) || bar > dur + EPS) return null;
    let s = snap(clamp(start, 0, dur), { bpm, beats, origin, unit: 'beat' });
    while (s < -EPS) s += beat;
    while (s + bar > dur + EPS && s - beat > -EPS) s -= beat; // no room for a bar after it: move back a beat at a time
    if (s + bar > dur + EPS) return null;
    s = Math.max(0, s);
    const room = Math.floor((dur - s) / bar + EPS), bars = clamp(Math.round((Math.max(end, s) - s) / bar), 1, room);
    return { start: s, end: s + bars * bar, bars, seconds: bars * bar };
  }
  /** Where the handles start: `bars` bars (4 by default, fewer when the sketch is short) from the first bar line heard. */
  function initial({ bpm, beats = 4, origin = 0, dur, bars = 4 }) {
    const bar = barSec(bpm, beats); let s = origin; while (s - bar >= -EPS) s -= bar; // the first bar line in the sketch
    return plan({ start: s, end: s + bars * bar, bpm, beats, origin, dur });
  }
  /** Exact frames for a loop at `rate`: what the file holds (a bar at 120 BPM in 4/4 = 2 s = 96,000 frames). */
  const frames = (p, rate = RATE) => ({ from: Math.round(p.start * rate), length: Math.round(p.seconds * rate) });
  /** The length of a whole sketch in bars at a tempo (a one-shot pad's "bars"), at least 1. */
  const barsOf = (seconds, bpm, beats = 4) => Math.max(1, Math.round(seconds / barSec(bpm, beats)));

  // ---------- finding the tempo in the audio ----------
  const HOP = 512;
  /** Onset strength every HOP samples: how much louder each slice got than the one before (half-wave, log energy). */
  function envelope(channels, rate, hop = HOP) {
    const n = channels[0]?.length || 0, m = Math.floor(n / hop), out = new Float32Array(m); let prev = 0;
    for (let i = 0; i < m; i++) {
      let e = 0; for (const ch of channels) for (let j = i * hop, z = j + hop; j < z; j++) e += ch[j] * ch[j];
      const l = Math.log1p(1000 * e / (hop * channels.length)); out[i] = Math.max(0, l - prev); prev = l;
    }
    return { env: out, rate: rate / hop };
  }
  const at = (a, x) => { const i = Math.floor(x), t = x - i; return i + 1 < a.length ? a[i] * (1 - t) + a[i + 1] * t : (a[i] || 0); };
  /** The tempo of a sketch (70–180 BPM): → { bpm, confidence 0–1, origin (s: the first beat heard), downbeat (s: the first
   *  bar line heard) } or null for silence / no beat. Autocorrelation of the onset envelope, with the double period
   *  reinforcing (so a half or double tempo loses), refined between lags. */
  function detect(pcm, { min = FIND[0], max = FIND[1], beats = 4 } = {}) {
    const { env, rate } = envelope(pcm.channels, pcm.rate), n = env.length; if (n < rate * 2) return null;
    let mean = 0; for (const v of env) mean += v; mean /= n; if (!(mean > 1e-6)) return null;
    // smoothed a little, so a beat that falls between two envelope frames still lines up with itself
    const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.25 * (env[i - 1] ?? env[i]) + 0.5 * env[i] + 0.25 * (env[i + 1] ?? env[i]) - mean;
    const lo = Math.floor(60 * rate / max), hi = Math.ceil(60 * rate / min), ac = new Float32Array(2 * hi + 2);
    for (let L = 0; L < ac.length && L < n; L++) { let s = 0; for (let i = L; i < n; i++) s += x[i] * x[i - L]; ac[L] = s / (n - L); }
    if (!(ac[0] > 0)) return null;
    // a gentle prior around 120 BPM (an octave either side still counts) settles half / double tempo ties
    const prior = L => Math.exp(-0.5 * (Math.log2(60 * rate / L / 120) / 0.9) ** 2);
    const score = L => (at(ac, L) + 0.5 * at(ac, 2 * L) - 0.25 * Math.max(0, at(ac, 1.5 * L))) * prior(L);
    let best = -Infinity, bl = lo; for (let L = lo; L <= hi; L++) { const s = score(L); if (s > best) { best = s; bl = L; } }
    // refine between lags (a parabola through the three around the best)
    const a = score(bl - 1), b = score(bl), c = score(bl + 1), d = a - 2 * b + c, off = d < 0 ? clamp(0.5 * (a - c) / d, -0.5, 0.5) : 0;
    let lag = bl + off; // the beat period in envelope frames; a long-window pass for a finer value
    let fine = lag, fineScore = -Infinity;
    for (let q = -0.5; q <= 0.5 + EPS; q += 0.05) { const L = lag + q; let sum = 0, cnt = 0; for (let k = 1; k * L < n / 2 && k <= 32; k++, cnt++) sum += corrAt(x, k * L); if (cnt && sum / cnt > fineScore) { fineScore = sum / cnt; fine = L; } }
    lag = fine;
    // most music sits on a whole BPM: within 0.15 of one, that's the tempo (and the grid uses exactly it)
    let bpm = Math.round(600 * rate / lag) / 10; if (Math.abs(bpm - Math.round(bpm)) <= 0.15) { bpm = Math.round(bpm); lag = 60 * rate / bpm; }
    const confidence = clamp(at(ac, lag) / ac[0], 0, 1);
    return { bpm, confidence: Math.round(confidence * 100) / 100, ...phaseOf(env, rate, lag, beats) };
  }
  function phaseOf(env, rate, lag, beats) {
    const n = env.length;
    // the beat's phase: the offset whose beat positions hold the most onset strength
    let po = 0, pb = -Infinity; for (let o = 0; o < lag; o += 0.25) { let s = 0; for (let t = o; t < n; t += lag) s += at(env, t); if (s > pb + 1e-9) { pb = s; po = o; } }
    // the bar's first beat: of the `beats` beats, the one whose bar positions are loudest
    let db = 0, dbs = -Infinity; for (let k = 0; k < beats; k++) { let s = 0; for (let t = po + k * lag; t < n; t += lag * beats) s += at(env, t); if (s > dbs + 1e-9) { dbs = s; db = k; } }
    return { origin: po / rate, downbeat: (po + db * lag) / rate };
  }
  /** Where the beats and bar lines fall at a tempo already known (the session's, or typed): { origin, downbeat } (s). */
  function phase(pcm, bpm, beats = 4) {
    const { env, rate } = envelope(pcm.channels, pcm.rate); if (!(bpm > 0) || env.length < 4) return { origin: 0, downbeat: 0 };
    return phaseOf(env, rate, 60 * rate / bpm, beats);
  }
  function corrAt(x, L) { const n = x.length, i0 = Math.floor(L), t = L - i0; let s = 0; for (let i = i0 + 1; i < n; i++) s += x[i] * (x[i - i0] * (1 - t) + x[i - i0 - 1] * t); return s / (n - i0); }

  // ---------- the waveform and the cut ----------
  /** n peaks (0–1) for the little waveform: the loudest sample of each slice, over every channel. */
  function peaks(channels, n) {
    const len = channels[0]?.length || 0, out = new Float32Array(n); if (!len) return out;
    for (let i = 0; i < n; i++) { const a = Math.floor(i * len / n), b = Math.max(a + 1, Math.floor((i + 1) * len / n)); let m = 0; for (const ch of channels) for (let j = a; j < b && j < len; j++) { const v = Math.abs(ch[j]); if (v > m) m = v; } out[i] = Math.min(1, m); }
    return out;
  }
  /** The loop's audio: exactly `length` frames from `from` (zeros past the end, never), with 3 ms edges. */
  function cut(pcm, { from, length }, { fadeMs = 3 } = {}) {
    const f = Math.min(Math.floor(length / 4), Math.round(pcm.rate * fadeMs / 1000));
    return { rate: pcm.rate, channels: pcm.channels.map(ch => { const o = new Float32Array(length); o.set(ch.subarray(from, from + length)); for (let i = 0; i < f; i++) { const g = i / f; o[i] *= g; o[length - 1 - i] *= g; } return o; }) };
  }
  /** The loop's file name, beside its sketch: "Sketch 2026-10-26 14.05.33 loop 4 bars 120 BPM.wav" (main adds " 2" when taken). */
  function loopName(sketchFile, bars, bpm) {
    const base = String(sketchFile).split(/[\\/]/).pop().replace(/\.wav$/i, '').replace(/[^\w .·-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Sketch';
    return `${base} loop ${bars} bar${bars === 1 ? '' : 's'} ${Math.round(bpm * 10) / 10} BPM.wav`;
  }
  const clock = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  const label = p => `${p.bars} bar${p.bars === 1 ? '' : 's'} · ${clock(p.start)} – ${clock(p.end)}`;
  return { RATE, MIN_BPM, MAX_BPM, FIND, BAR_CHOICES, beatSec, barSec, parseBpm, snap, grid, plan, initial, frames, barsOf, envelope, detect, phase, peaks, cut, loopName, clock, label };
});
