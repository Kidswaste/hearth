// Stems for the Lab (round 30, stems), as plain math (no DOM, no ML): the loaded song split approximately into the
// drums (kick / snare / hats), the bass, the voice and everything else, as smooth 0..1 envelopes at ~100 frames a
// second, indexed by song time (so a render reads exactly what the preview read). It runs in three places from this
// one file: a Worker in the app (`new Worker('tools/three-stems-core.js')`, the whole song once, then cached), the
// main page as a fallback, and Node for the unit test (dev/stems-test.js).
// How: a short-time Fourier transform at 22.05 kHz (2048-point windows, a frame every 10 ms), then harmonic /
// percussive separation by median filtering (Fitzgerald 2010): for each frequency the median over ~250 ms of time is
// what holds still (harmonic: bass notes, voices, pads), for each frame the median over ~180 Hz of frequency is what
// is broad and short (percussive: kicks, snares, hats); soft masks split each frame's energy between the two. Then:
//   · drums: percussive energy in the kick (35–150 Hz), snare (1.5–5 kHz) and hat (6–9 kHz) bands; a snare / hat must
//     be mostly percussive in its band and flat (noise), and only what rises above the part's running floor counts;
//     each a fast-attack envelope; drums = the strongest of the three
//   · bass: harmonic energy 30–120 Hz (+ 120–220 Hz unless it is voice-like), minus what fades like a kick's tail
//   · voice: harmonic energy 250–4000 Hz times how voice-like it is (its partials move: vibrato, glides, syllables;
//     a held chord or pad doesn't), everything else: the harmonic rest up to 9 kHz
// Each part is levelled against the song's own loudness (a part missing from the song stays near 0, a quiet one is
// not blown up to full) and its own loudest moments, then smoothed (attack / release per part), stored as bytes.
function hearthStemsCore() {
  const NAMES = ['stemDrums', 'stemKick', 'stemSnare', 'stemHats', 'stemBass', 'stemVocals', 'stemOther'];
  const KEYS = ['drums', 'kick', 'snare', 'hats', 'bass', 'vocals', 'other']; // audio.stems.<key>
  const F = NAMES.length;
  const IDX = Object.fromEntries(NAMES.map((n, i) => [n, i]));
  const RATE = 22050; const N = 2048; const HOP = 220; const FPS = RATE / HOP;
  const HK = 25; // harmonic kernel: frames (~250 ms; a kick's tail is shorter, a bass note longer)
  const PK = 17; // percussive kernel: bins (~180 Hz)
  const HZ = RATE / N;
  const KB = Math.floor(9000 / HZ) + 1; // bins analysed (to 9 kHz)
  const bin = (hz) => Math.max(1, Math.min(KB - 1, Math.round(hz / HZ)));
  const R = { kick: [bin(35), bin(150)], noise: [bin(1500), bin(5000)], hats: [bin(6000), bin(9000)], bassLo: [bin(30), bin(120)], bassHi: [bin(120), bin(220)], voice: [bin(250), bin(4000)], rest: [bin(250), bin(9000)] };
  // per part: dB range below its loudest that maps to 0..1, attack / release (ms)
  const SHAPE = { kick: [16, 0, 110], snare: [18, 0, 120], hats: [18, 0, 70], bass: [26, 15, 160], vocals: [26, 40, 260], other: [28, 60, 320] };
  const BASS_FADE = 45; // dB a second: how fast a kick's tail is taken to fade
  const SILENT = -10; // dB (a frame's power, ~64 dB under full scale): nothing
  const LIKE = [0.12, 0.34]; // the voice band's movement: held (pads, chords) … voice-like
  const FLAT = [0.15, 0.4]; // a snare / hat band's flatness: tonal … noise
  // a snare / hat band's percussive share: a voice's or a synth's leak there is mostly harmonic
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const gate = (p, h) => clamp01((p / (p + h + 1e-12) - 0.45) / 0.4);

  // ---------- an in-place radix-2 FFT (one plan, reused) ----------
  function fftPlan(n) {
    const bits = Math.round(Math.log2(n)); const rev = new Uint32Array(n);
    for (let i = 0; i < n; i += 1) { let r = 0; for (let b = 0; b < bits; b += 1) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    const cs = new Float64Array(n / 2); const sn = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k += 1) { cs[k] = Math.cos((2 * Math.PI * k) / n); sn[k] = Math.sin((2 * Math.PI * k) / n); }
    return (re, im) => {
      for (let i = 0; i < n; i += 1) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1; const step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = 0, k = 0; j < half; j += 1, k += step) {
            const a = i + j; const b = a + half;
            const tr = re[b] * cs[k] + im[b] * sn[k]; const ti = im[b] * cs[k] - re[b] * sn[k];
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          }
        }
      }
    };
  }
  // the median of the first k values of a (reordered in place: quickselect)
  function median(a, k) {
    const m = k >> 1; let lo = 0; let hi = k - 1;
    while (lo < hi) {
      const p = a[(lo + hi) >> 1]; let i = lo; let j = hi;
      while (i <= j) { while (a[i] < p) i += 1; while (a[j] > p) j -= 1; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i += 1; j -= 1; } }
      if (m <= j) hi = j; else if (m >= i) lo = i; else break;
    }
    return a[m];
  }
  // mono at any rate → 22.05 kHz (a box filter then linear interpolation: plenty for envelopes)
  function resample(x, rate) {
    if (rate === RATE) return x;
    const r = rate / RATE; const n = Math.floor(x.length / r); const y = new Float32Array(n);
    const w = Math.max(1, Math.round(r));
    for (let i = 0; i < n; i += 1) {
      const p = i * r; const i0 = Math.floor(p); let s = 0; let c = 0;
      for (let k = 0; k < w; k += 1) { const q = i0 + k - (w >> 1); if (q >= 0 && q < x.length) { s += x[q]; c += 1; } }
      y[i] = c ? s / c : 0;
    }
    return y;
  }

  // ---------- the whole song → { fps, n, F, names, data (n × F bytes), meta } ----------
  function separate(mono, rate = RATE, { onProgress, debug } = {}) {
    const x = resample(mono, rate); const len = x.length;
    const n = Math.max(1, Math.ceil(len / HOP));
    const fft = fftPlan(N); const re = new Float64Array(N); const im = new Float64Array(N);
    const win = new Float64Array(N); for (let i = 0; i < N; i += 1) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const ring = new Float32Array(HK * KB); const half = HK >> 1;
    const scratch = new Float32Array(Math.max(HK, PK)); const hx = new Float32Array(KB);
    const prevV = [new Float32Array(KB), new Float32Array(KB), new Float32Array(KB)]; // the voice band's harmonic part, 3 frames back
    // raw energies per frame
    const E = { kick: new Float32Array(n), snare: new Float32Array(n), hats: new Float32Array(n), bassLo: new Float32Array(n), bassHi: new Float32Array(n), voice: new Float32Array(n), rest: new Float32Array(n), tot: new Float32Array(n), kickT: new Float32Array(n), snareT: new Float32Array(n), hatsT: new Float32Array(n), move: new Float32Array(n) };
    const spectrum = (j, slot) => {
      const s0 = j * HOP - N / 2;
      for (let i = 0; i < N; i += 1) { const s = s0 + i; re[i] = s >= 0 && s < len ? x[s] * win[i] : 0; im[i] = 0; }
      fft(re, im);
      const o = slot * KB;
      for (let b = 0; b < KB; b += 1) ring[o + b] = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
    };
    const sum = (arr, [a, b]) => { let s = 0; for (let k = a; k <= b; k += 1) s += arr[k]; return s; };
    // spectral flatness (geometric / arithmetic mean, on 4-bin sums) → 0..1 gate: noise ~0.5+, a few partials ~0
    const flat = (arr, [a, b]) => {
      let lg = 0; let ar = 0; let m = 0;
      for (let k = a; k + 3 <= b; k += 4) { const v = arr[k] + arr[k + 1] + arr[k + 2] + arr[k + 3] + 1e-12; lg += Math.log(v); ar += v; m += 1; }
      return m ? clamp01((Math.exp(lg / m) / (ar / m) - FLAT[0]) / (FLAT[1] - FLAT[0])) : 0;
    };
    const ph = new Float32Array(KB); const pp = new Float32Array(KB); // this frame's harmonic / percussive power
    const process = (c) => {
      const o = (c % HK) * KB; let tot = 0;
      for (let b = 0; b < KB; b += 1) {
        for (let s = 0; s < HK; s += 1) scratch[s] = ring[s * KB + b];
        const H = median(scratch, HK);
        const lo = Math.max(0, b - (PK >> 1)); const hi = Math.min(KB - 1, b + (PK >> 1)); let k = 0;
        for (let q = lo; q <= hi; q += 1) scratch[k++] = ring[o + q];
        const P = median(scratch, k);
        const X = ring[o + b]; const x2 = X * X; const h2 = H * H; const p2 = P * P;
        const mh = h2 / (h2 + p2 + 1e-12);
        ph[b] = x2 * mh; pp[b] = x2 - ph[b]; hx[b] = X * mh; tot += x2;
      }
      E.kick[c] = sum(pp, R.kick);
      // a snare / hat is mostly percussive in its band (gate) and it is noise: flat across the band (a voice's gliding partials, classed percussive, are peaks)
      const sn = sum(pp, R.noise); const snH = sum(ph, R.noise); const ht = sum(pp, R.hats); const htH = sum(ph, R.hats);
      E.snare[c] = sn * gate(sn, snH) * flat(pp, R.noise); E.hats[c] = ht * gate(ht, htH) * flat(pp, R.hats);
      E.kickT[c] = E.kick[c] + sum(ph, R.kick); E.snareT[c] = sn + snH; E.hatsT[c] = ht + htH;
      E.bassLo[c] = sum(ph, R.bassLo); E.bassHi[c] = sum(ph, R.bassHi); E.voice[c] = sum(ph, R.voice); E.rest[c] = sum(ph, R.rest); E.tot[c] = tot;
      // how much the voice band's partials move (30 ms apart), only where they are strong (a tonal peak above the floor)
      const old = prevV[c % 3]; let num = 0; let den = 0;
      for (let b = R.voice[0]; b <= R.voice[1]; b += 1) { const a = hx[b]; const z = old[b]; num += Math.abs(a - z) * (a + z); den += (a + z) * (a + z); old[b] = a; }
      E.move[c] = den > 0 ? num / den : 0;
    };
    let lastP = 0;
    for (let j = 0; j < n + half; j += 1) {
      if (j < n) spectrum(j, j % HK); else ring.fill(0, (j % HK) * KB, (j % HK + 1) * KB);
      const c = j - half;
      if (c >= 0) process(c);
      const p = j / (n + half);
      if (onProgress && p - lastP >= 0.02) { lastP = p; onProgress(Math.min(0.97, p)); }
    }
    // ---------- level each part, then smooth it ----------
    const dB = (e) => 10 * Math.log10(e + 1e-10);
    const pct = (arr, q) => { const s = Float32Array.from(arr, dB).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
    const ref = pct(E.tot, 0.95); // the song's loud parts
    // voice-likeness: the partials' movement averaged over ~300 ms
    const like = new Float32Array(n);
    {
      const w = 15; const cum = new Float64Array(n + 1); for (let i = 0; i < n; i += 1) cum[i + 1] = cum[i] + E.move[i];
      for (let i = 0; i < n; i += 1) { const a = Math.max(0, i - w); const b = Math.min(n, i + w + 1); like[i] = clamp01(((cum[b] - cum[a]) / (b - a) - LIKE[0]) / (LIKE[1] - LIKE[0])); }
    }
    const vocals = new Float32Array(n); const other = new Float32Array(n); const bass = new Float32Array(n);
    // a kick's low tail is a decaying tone (harmonic to the medians): what fades like it after a kick isn't the bass
    const fade = 10 ** (-BASS_FADE / 10 / FPS); let tail = 0;
    for (let i = 0; i < n; i += 1) {
      const v = E.voice[i] * (0.02 + 0.98 * like[i]); vocals[i] = v; other[i] = Math.max(0, E.rest[i] - v);
      tail = Math.max(tail * fade, E.kick[i]);
      const b = E.bassLo[i] + E.bassHi[i] * (1 - like[i]); // (a low voice's fundamental sits up there)
      bass[i] = Math.max(b * 0.05, b - tail);
    }
    // hits: what rises above the part's own running floor (a held sound leaking into the percussive side stays out)
    const hits = (arr) => {
      const w = 20; const out = new Float32Array(n); const buf = new Float32Array(2 * w + 1);
      for (let i = 0; i < n; i += 1) { let k = 0; for (let q = Math.max(0, i - w); q <= Math.min(n - 1, i + w); q += 1) buf[k++] = arr[q]; out[i] = Math.max(0, arr[i] - 1.5 * median(buf, k)); }
      return out;
    };
    // band: the drum's own band (all of it) — a real hit fills its band at the song's loud parts, a leak doesn't
    const level = (arr, [range, att, rel], band) => {
      const top = pct(arr, 0.99); const floorAbs = Math.max(ref - 42, SILENT);
      // a part far under the song (missing, or only bleed) reaches a fraction of 1, a present one its full range
      let hi = Math.max(top, floorAbs + 12, ref - 14 + (top - (ref - 14)) * 0.5);
      if (band) hi = Math.max(hi, pct(band, 0.95) - 3);
      const lo = Math.max(floorAbs, hi - range);
      const out = new Float32Array(n); let y = 0;
      const ka = att > 0 ? 1 - Math.exp(-1000 / FPS / att) : 1; const kr = rel > 0 ? 1 - Math.exp(-1000 / FPS / rel) : 1;
      for (let i = 0; i < n; i += 1) { const v = clamp01((dB(arr[i]) - lo) / (hi - lo)); y += (v - y) * (v > y ? ka : kr); out[i] = y; }
      return out;
    };
    const kick = level(hits(E.kick), SHAPE.kick, E.kickT); const snare = level(hits(E.snare), SHAPE.snare, E.snareT); const hats = level(hits(E.hats), SHAPE.hats, E.hatsT);
    const parts = [null, kick, snare, hats, level(bass, SHAPE.bass), level(vocals, SHAPE.vocals), level(other, SHAPE.other)];
    if (debug) debug.E = E;
    const data = new Uint8Array(n * F);
    for (let i = 0; i < n; i += 1) {
      const o = i * F;
      data[o] = Math.round(Math.max(kick[i], snare[i], hats[i] * 0.85) * 255);
      for (let k = 1; k < F; k += 1) data[o + k] = Math.round(parts[k][i] * 255);
    }
    onProgress?.(1);
    const mean = (k) => { let s = 0; for (let i = 0; i < n; i += 1) s += data[i * F + k]; return Math.round((s / n / 255) * 100) / 100; };
    return { fps: FPS, n, F, names: NAMES, data, meta: { secs: Math.round((len / RATE) * 100) / 100, mean: Object.fromEntries(KEYS.map((key, k) => [key, mean(k)])) } };
  }
  // the value of one part at a song time (s) from a track: 0..1
  function at(track, k, t) {
    if (!track || !track.n) return 0;
    const fr = Math.max(0, Math.min(track.n - 1, Math.floor(t * track.fps)));
    return track.data[fr * track.F + k] / 255;
  }

  return { NAMES, KEYS, F, IDX, RATE, N, HOP, FPS, fftPlan, median, resample, separate, at };
}
const StemsCore = hearthStemsCore();
globalThis.StemsCore = StemsCore;

// ---------- as a Worker: { id, mono: Float32Array, rate } → { id, track } (and { id, progress }) ----------
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => {
    const { id, mono, rate } = e.data || {};
    try {
      const t0 = Date.now();
      const track = StemsCore.separate(mono, rate, { onProgress: (p) => self.postMessage({ id, progress: p }) });
      track.meta.ms = Date.now() - t0;
      self.postMessage({ id, track }, [track.data.buffer]);
    } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
  };
}
if (typeof module !== 'undefined') module.exports = StemsCore;
