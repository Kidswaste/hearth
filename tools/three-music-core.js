// Music analysis for the Three.js Lab, as plain math (no DOM): tempo, beats, the downbeat (bar 1), kick / snare /
// hat onsets from band-split spectral flux, sections (intro / build / drop / break / outro, with confidence) and a
// style guess that picks the trigger preset. This same file runs as the analysis Worker
// (`new Worker('tools/three-music-core.js')`, see ThreeMedia.analyze) so a song is analysed without stalling the UI;
// the Lab falls back to running it inline. ThreeMedia._test.core exposes it for unit tests (dev/checks/music.js,
// dev/music-test.js).
//   MusicCore.analyzeSignal(mono: Float32Array, sampleRate, { onProgress }) → analysis (see the end of analyzeSignal)
const MusicCore = (() => {
  const FPS = 100; // analysis frames per second (10 ms)
  const NFFT = 1024;
  const r4 = (t) => Math.round(t * 1e4) / 1e4;
  const r2 = (t) => Math.round(t * 100) / 100;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- signal helpers ----------
  // A streaming RBJ biquad (Q = 0.707: Butterworth), one sample at a time.
  function biquad(type, f0, SR, Q = Math.SQRT1_2) {
    const w = (2 * Math.PI * f0) / SR; const cs = Math.cos(w); const al = Math.sin(w) / (2 * Q);
    const lp = type === 'lowpass';
    const b0 = lp ? (1 - cs) / 2 : (1 + cs) / 2; const b1 = lp ? 1 - cs : -(1 + cs);
    const a0 = 1 + al;
    const B0 = b0 / a0; const B1 = b1 / a0; const B2 = b0 / a0; const A1 = (-2 * cs) / a0; const A2 = (1 - al) / a0;
    let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
    return (x) => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  // In-place radix-2 FFT (re / im of length n, a power of two).
  function fftPlan(n) {
    const rev = new Uint32Array(n); const bits = Math.log2(n);
    for (let i = 0; i < n; i += 1) { let r = 0; for (let b = 0; b < bits; b += 1) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    const cos = new Float64Array(n / 2); const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i += 1) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
    return (re, im) => {
      for (let i = 0; i < n; i += 1) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size *= 2) {
        const half = size / 2; const step = n / size;
        for (let j = 0; j < half; j += 1) {
          const wr = cos[j * step]; const wi = sin[j * step];
          for (let a = j; a < n; a += size) {
            const b = a + half;
            const tr = re[b] * wr - im[b] * wi; const ti = re[b] * wi + im[b] * wr;
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          }
        }
      }
    };
  }
  // centred moving average over ±h
  function movingAvg(a, h) {
    const n = a.length; const o = new Float32Array(n); const c = new Float64Array(n + 1);
    for (let i = 0; i < n; i += 1) c[i + 1] = c[i] + a[i];
    for (let i = 0; i < n; i += 1) { const lo = Math.max(0, i - h); const hi = Math.min(n, i + h + 1); o[i] = (c[hi] - c[lo]) / (hi - lo); }
    return o;
  }
  // centred moving maximum over ±h (monotonic deque)
  function movingMax(a, h) {
    const n = a.length; const o = new Float32Array(n); const q = new Int32Array(n); let qh = 0; let qt = 0; let next = 0;
    for (let i = 0; i < n; i += 1) {
      const hi = Math.min(n - 1, i + h);
      while (next <= hi) { while (qt > qh && a[q[qt - 1]] <= a[next]) qt -= 1; q[qt++] = next; next += 1; }
      while (q[qh] < i - h) qh += 1;
      o[i] = a[q[qh]];
    }
    return o;
  }
  const quantile = (a, p) => { if (!a.length) return 0; const s = Float32Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))]; };
  const interp = (a, x) => { const i = Math.floor(x); if (i < 0 || i >= a.length - 1) return i === a.length - 1 ? a[i] : 0; const f = x - i; return a[i] * (1 - f) + a[i + 1] * f; };
  function normStd(a) {
    let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i] * a[i];
    const sd = Math.sqrt(s / (a.length || 1)) || 1;
    for (let i = 0; i < a.length; i += 1) a[i] /= sd;
    return a;
  }

  // ---------- 1. one pass over the samples: band envelopes, waveform peaks, fine (1 ms) attack envelopes ----------
  function bandPass(mono, SR) {
    const len = mono.length; const hop = SR / FPS; const N = Math.floor(len / hop);
    const lp1 = biquad('lowpass', 150, SR); const lp2 = biquad('lowpass', 150, SR);
    const mhp = biquad('highpass', 150, SR); const mlp = biquad('lowpass', 2000, SR);
    const hhp = biquad('highpass', 2000, SR);
    const shp = biquad('highpass', 1000, SR); const slp = biquad('lowpass', 5000, SR);
    const thp = biquad('highpass', 6000, SR);
    const L = new Float32Array(N); const B = new Float32Array(N); const M = new Float32Array(N); const T = new Float32Array(N);
    const PK = new Float32Array(N); const WL = new Float32Array(N); const WM = new Float32Array(N); const WH = new Float32Array(N);
    const fineHop = SR / 1000; const NF = Math.floor(len / fineHop);
    const FK = new Float32Array(NF); const FS = new Float32Array(NF); const FH = new Float32Array(NF);
    let f = 0; let end = Math.round(hop); let cnt = 0; let sl = 0; let sb = 0; let sm = 0; let st = 0; let pk = 0; let pl = 0; let pm = 0; let ph = 0;
    let ff = 0; let fend = Math.round(fineHop);
    for (let i = 0; i < len; i += 1) {
      const x = mono[i];
      const lo = lp2(lp1(x)); const mi = mlp(mhp(x)); const hi = hhp(x);
      const sn = slp(shp(x)); const ht = thp(x);
      sl += x * x; sb += lo * lo; sm += mi * mi; st += hi * hi; cnt += 1;
      const ax = x < 0 ? -x : x; if (ax > pk) pk = ax;
      const al = lo < 0 ? -lo : lo; if (al > pl) pl = al;
      const am = mi < 0 ? -mi : mi; if (am > pm) pm = am;
      const ah = hi < 0 ? -hi : hi; if (ah > ph) ph = ah;
      if (ff < NF) { FK[ff] += lo * lo; FS[ff] += sn * sn; FH[ff] += ht * ht; }
      if (i + 1 >= fend) { ff += 1; fend = Math.round((ff + 1) * fineHop); }
      if (i + 1 >= end) {
        if (f < N) { L[f] = Math.sqrt(sl / cnt); B[f] = Math.sqrt(sb / cnt); M[f] = Math.sqrt(sm / cnt); T[f] = Math.sqrt(st / cnt); PK[f] = pk; WL[f] = pl; WM[f] = pm; WH[f] = ph; }
        f += 1; end = Math.round((f + 1) * hop); cnt = 0; sl = 0; sb = 0; sm = 0; st = 0; pk = 0; pl = 0; pm = 0; ph = 0;
      }
    }
    return { N, L, B, M, T, PK, WL, WM, WH, FK, FS, FH };
  }

  // ---------- 2. spectral flux (all bands for the tempo, kick / snare / hats bands for the onsets) ----------
  const LOWB = [2, 48]; // bins kept for the bass / harmony change at downbeats (43 Hz – 1 kHz)
  function flux(mono, SR, N, onProgress) {
    const fft = fftPlan(NFFT); const re = new Float64Array(NFFT); const im = new Float64Array(NFFT);
    const win = new Float64Array(NFFT); for (let i = 0; i < NFFT; i += 1) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NFFT);
    const binHz = SR / NFFT; const bin = (hz) => Math.max(1, Math.min(NFFT / 2 - 1, Math.round(hz / binHz)));
    const all = [1, bin(8000)]; const kick = [bin(40), bin(130)]; const snare = [bin(1000), bin(5000)]; const hats = [bin(6000), Math.min(NFFT / 2 - 1, bin(10500))];
    const NB = NFFT / 2;
    const hop = SR / FPS;
    const SF = new Float32Array(N); const SK = new Float32Array(N); const SS = new Float32Array(N); const SH = new Float32Array(N);
    const PKb = new Float32Array(N); const PSb = new Float32Array(N); const PHb = new Float32Array(N); const PT = new Float32Array(N); // band / total power, per frame
    const nLow = LOWB[1] - LOWB[0];
    const LS = new Float32Array(N * nLow); // log spectrum of the low bins, per frame
    // previous two frames (log magnitude for the tempo flux, power for the band onsets): lag-2 differences are steadier
    let yA = new Float32Array(NB); let yB = new Float32Array(NB); let pA = new Float32Array(NB); let pB = new Float32Array(NB);
    let y = new Float32Array(NB); let p = new Float32Array(NB);
    const logTop = Math.max(all[1], LOWB[1]);
    const P2 = new Float32Array(NB); // the second frame of a pair
    // one frame's spectrum is in p (power, every bin) → its log magnitude, flux and band sums
    const frame = (f, pw) => {
      for (let k = 1; k <= logTop; k += 1) y[k] = Math.log1p(10 * Math.sqrt(pw[k]));
      if (f >= 2) {
        let s = 0; for (let k = all[0]; k <= all[1]; k += 1) { const d = y[k] - yA[k]; if (d > 0) s += d; }
        const band = (r) => { let v = 0; for (let k = r[0]; k <= r[1]; k += 1) { const d = pw[k] - pA[k]; if (d > 0) v += d; } return v; };
        SF[f] = s; SK[f] = band(kick); SS[f] = band(snare); SH[f] = band(hats);
      }
      let tot = 0; for (let k = 1; k < NB; k += 1) tot += pw[k];
      const pow = (r) => { let v = 0; for (let k = r[0]; k <= r[1]; k += 1) v += pw[k]; return v; };
      PKb[f] = pow(kick); PSb[f] = pow(snare); PHb[f] = pow(hats); PT[f] = tot;
      for (let k = 0; k < nLow; k += 1) LS[f * nLow + k] = y[LOWB[0] + k];
      // rotate: A (two frames back) ← B ← now
      const ty = yA; yA = yB; yB = y; y = ty;
      const tp = pA; pA = pB; pB = p; p = tp;
    };
    // two real frames per complex FFT (one in re, the next in im), split apart by symmetry
    for (let f = 0; f < N; f += 2) {
      const c0 = Math.round(f * hop) - NFFT / 2; const c1 = Math.round((f + 1) * hop) - NFFT / 2; const two = f + 1 < N;
      for (let i = 0; i < NFFT; i += 1) {
        const k0 = c0 + i; const k1 = c1 + i;
        re[i] = k0 >= 0 && k0 < mono.length ? mono[k0] * win[i] : 0;
        im[i] = two && k1 >= 0 && k1 < mono.length ? mono[k1] * win[i] : 0;
      }
      fft(re, im);
      for (let k = 1; k < NB; k += 1) {
        const ar = re[k]; const ai = im[k]; const br = re[NFFT - k]; const bi = im[NFFT - k];
        const xr = (ar + br) / 2; const xi = (ai - bi) / 2; // first frame
        const zr = (ai + bi) / 2; const zi = (br - ar) / 2; // second frame
        p[k] = xr * xr + xi * xi; P2[k] = zr * zr + zi * zi;
      }
      frame(f, p);
      if (two) { p.set(P2); frame(f + 1, p); }
      if (onProgress && f % 3000 === 0) onProgress(0.15 + 0.5 * (f / N));
    }
    return { SF, SK, SS, SH, LS, nLow, PKb, PSb, PHb, loud: quantile(PT, 0.99) };
  }

  // onset strength: the flux minus its local mean, half-wave rectified, in units of its spread
  function odfOf(sf) {
    const m = movingAvg(sf, 15); const o = new Float32Array(sf.length);
    for (let i = 0; i < sf.length; i += 1) o[i] = Math.max(0, sf[i] - m[i]);
    return normStd(o);
  }

  // ---------- 3. tempo: autocorrelation of the onsets, a comb over its multiples, a soft preference for ~120 ---------
  function tempo(odf) {
    const N = odf.length; const MAXL = 410;
    const ac = new Float32Array(MAXL + 1);
    let mean = 0; for (let i = 0; i < N; i += 1) mean += odf[i]; mean /= N || 1;
    for (let l = 10; l <= MAXL; l += 1) { let s = 0; for (let i = 0; i + l < N; i += 1) s += (odf[i] - mean) * (odf[i + l] - mean); ac[l] = s / (N - l || 1); }
    const score = (bpm) => {
      const tau = 6000 / bpm; let s = 0;
      for (let k = 1; k <= 4 && k * tau <= MAXL; k += 1) s += interp(ac, k * tau) / k;
      return s * Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    };
    const list = [];
    for (let b = 60; b <= 200.001; b += 0.1) list.push({ bpm: Math.round(b * 10) / 10, s: score(b) });
    let best = list[0]; for (const x of list) if (x.s > best.s) best = x;
    const peaks = list.filter((x, i) => i > 0 && i < list.length - 1 && x.s >= list[i - 1].s && x.s >= list[i + 1].s && x.s > 0).sort((a, b) => b.s - a.s);
    const second = peaks.find((x) => Math.abs(x.bpm - best.bpm) / best.bpm > 0.04);
    const conf = best.s > 0 ? clamp(1 - (second ? Math.max(0, second.s) / best.s : 0), 0, 1) : 0;
    return { bpm: best.bpm, conf, peaks: peaks.slice(0, 8).map((x) => x.bpm), score };
  }

  // ---------- 4. beats: the best chain of onsets about one period apart (Ellis 2007) ----------
  function trackBeats(odf, period) {
    const N = odf.length; const score = new Float32Array(N); const back = new Int32Array(N).fill(-1);
    for (let t = 0; t < N; t += 1) {
      let bs = 0; let bp = -1;
      const lo = Math.max(0, Math.round(t - 2 * period)); const hi = Math.round(t - period / 2);
      for (let p = lo; p <= hi; p += 1) { const r = Math.log((t - p) / period); const s = score[p] - 100 * r * r; if (bp < 0 || s > bs) { bs = s; bp = p; } }
      score[t] = odf[t] + (bp >= 0 ? bs : 0);
      back[t] = bp;
    }
    let t = N - 1;
    for (let k = Math.max(0, Math.floor(N - period)); k < N; k += 1) if (score[k] > score[t]) t = k;
    const out = [];
    while (t >= 0) { out.push(t); t = back[t]; }
    return out.reverse();
  }
  // How well a straight grid (period P frames, phase ph) lines up with the onsets: the onset strength summed at each
  // grid line (best of ±1 frame, since the hits land between frames).
  function combSum(odf, P, ph) {
    let s = 0; let n = 0;
    for (let x = ph; x < odf.length - 1; x += P) { const i = Math.round(x); s += Math.max(odf[i], i > 0 ? odf[i - 1] * 0.7 : 0, odf[i + 1] * 0.7); n += 1; }
    return n ? s / n : 0;
  }
  function fitGrid(odf, P0) {
    let best = { s: -1, P: P0, ph: 0 };
    for (let k = -12; k <= 12; k += 1) {
      const P = P0 * (1 + k * 0.0005);
      for (let ph = 0; ph < P; ph += 0.25) { const s = combSum(odf, P, ph); if (s > best.s) best = { s, P, ph }; }
    }
    return best;
  }

  // ---------- 5. onsets per band: peaks over a local, adaptive bar, refined on the 1 ms attack envelope ----------
  // exclude: times (s) of louder hits in a neighbouring band (snares, for the hats) that shouldn't set the bar
  // power: the band's power per frame; a hit must raise it by a good part (a steady tone never does)
  function pickOnsets(sf, { gap, rel, fine, minFrac, win = 3, exclude = null, power = null, loud = 0 }) {
    const N = sf.length;
    let ref = sf;
    if (exclude?.length) { ref = Float32Array.from(sf); for (const t of exclude) { const f = Math.round(t * FPS); for (let d = -4; d <= 4; d += 1) if (f + d >= 0 && f + d < N) ref[f + d] = 0; } }
    const mx = movingMax(ref, 150); const mean = movingAvg(ref, 50);
    const floor = quantile(sf, 0.995) * (minFrac ?? 0.04);
    const out = [];
    let last = -1e9;
    for (let f = 3; f < N - 3; f += 1) {
      const v = sf[f];
      if (v <= floor || v < rel * mx[f] || v < mean[f] * 2) continue;
      if (power && (v < 0.3 * Math.max(power[f], power[f + 1] || 0) || Math.max(power[f], power[f + 1] || 0) < loud * 3e-5)) continue;
      let peak = true; for (let d = -3; d <= 3; d += 1) if (d && sf[f + d] > v) { peak = false; break; }
      if (!peak) continue;
      const t = refine(fine, f / FPS, win);
      if ((t - last) * 1000 < gap) { if (out.length && v > out[out.length - 1].s) { out[out.length - 1] = { t, s: v }; last = t; } continue; }
      out.push({ t, s: v }); last = t;
    }
    const top = quantile(out.map((o) => o.s), 0.95) || 1;
    return out.map((o) => ({ t: r4(o.t), s: Math.round(Math.min(1, o.s / top) * 100) / 100 }));
  }
  // The attack nearest a frame time: the steepest rise of the 1 ms band energy from 50 ms before to 30 ms after,
  // then back to where that rise began.
  // win: the energy is summed over that many ms (longer for low sounds, whose energy ripples at twice their pitch)
  function refine(fine, t, win = 3) {
    const a = Math.max(2 * win, Math.floor((t - 0.05) * 1000)); const b = Math.min(fine.length - 1, Math.ceil((t + 0.03) * 1000));
    if (b - a < 6) return t;
    const e = (i) => { let s = 0; for (let k = 0; k < win; k += 1) s += fine[i - k]; return s; };
    let best = -1; let bi = -1;
    for (let i = a; i <= b; i += 1) { const r = e(i) - e(i - win); if (r > best) { best = r; bi = i; } }
    if (bi < 0 || best <= 0) return t;
    let i = bi; while (i > a && e(i) - e(i - win) > best * 0.3) i -= 1;
    return Math.max(0, (i - win + (win > 5 ? 2 : 4)) / 1000);
  }

  // ---------- 6. the downbeat: which of the four beats is "1" ----------
  // Bass / harmony changes, new energy and kicks land on the 1; snares and claps on 2 and 4.
  function downbeat(beatT, { SK, SS, LS, nLow, L }) {
    const n = beatT.length;
    if (n < 8) return { phase: 0, conf: 0 };
    const F = (t) => Math.round(t * FPS);
    const near = (a, t) => { const f = F(t); let m = 0; for (let d = -3; d <= 3; d += 1) m = Math.max(m, a[f + d] || 0); return m; };
    const kk = beatT.map((t) => near(SK, t)); const ss = beatT.map((t) => near(SS, t));
    const meanSpec = (a, b) => { const v = new Float32Array(nLow); const f0 = F(a); const f1 = Math.max(f0 + 1, F(b)); for (let f = f0; f < f1; f += 1) for (let k = 0; k < nLow; k += 1) v[k] += LS[f * nLow + k] || 0; return v; };
    const specs = beatT.map((t, i) => meanSpec(t, beatT[i + 1] ?? t + (t - (beatT[i - 1] ?? t - 0.5))));
    const cosd = (x, y) => { let d = 0; let a = 0; let b = 0; for (let k = 0; k < x.length; k += 1) { d += x[k] * y[k]; a += x[k] * x[k]; b += y[k] * y[k]; } return 1 - d / (Math.sqrt(a * b) || 1); };
    const hc = beatT.map((t, i) => (i ? cosd(specs[i], specs[i - 1]) : 0));
    const lv = (a, b) => { let s = 0; let c = 0; for (let f = F(a); f < F(b); f += 1) { s += L[f] || 0; c += 1; } return c ? s / c : 0; };
    const ej = beatT.map((t, i) => (i ? Math.max(0, lv(t, beatT[i + 1] ?? t + 0.5) - lv(beatT[i - 1], t)) : 0));
    const nz = (a) => { const m = a.reduce((s, x) => s + x, 0) / (a.length || 1) || 1; return a.map((x) => x / m); };
    const K = nz(kk); const S = nz(ss); const HC = nz(hc); const EJ = nz(ej);
    const scores = [0, 1, 2, 3].map((p) => {
      let on = 0; let cOn = 0; let sOn = 0; let sOff = 0; let cOff = 0;
      for (let i = 1; i < n; i += 1) {
        const m = (((i - p) % 4) + 4) % 4;
        if (m === 0) { on += HC[i] + 0.4 * K[i] + 0.6 * EJ[i]; cOn += 1; }
        if (m === 0 || m === 2) sOn += S[i]; else { sOff += S[i]; cOff += 1; }
      }
      return (cOn ? on / cOn : 0) + 0.5 * (cOff ? (sOff - sOn) / cOff : 0);
    });
    const order = [0, 1, 2, 3].sort((a, b) => scores[b] - scores[a]);
    const top = scores[order[0]]; const next = scores[order[1]];
    return { phase: order[0], conf: Math.round(clamp((top - next) / (Math.abs(top) + 0.25), 0, 1) * 100) / 100, scores: scores.map(r2) };
  }

  // ---------- 7. sections from bar-level features (loudness, bass, highs, kicks) and where they change ----------
  const LABELS = ['Intro', 'Build', 'Drop', 'Break', 'Outro'];
  function sections(barT, duration, { L, B, T, kicks }) {
    const nb = barT.length;
    const F = (t) => Math.round(t * FPS);
    const mean = (a, s, e) => { let x = 0; let c = 0; for (let f = F(s); f < F(e) && f < a.length; f += 1) { x += a[f]; c += 1; } return c ? x / c : 0; };
    const ends = barT.map((t, j) => barT[j + 1] ?? Math.min(duration, t + (t - (barT[j - 1] ?? t - 2))));
    const feats = barT.map((t, j) => {
      const e = ends[j]; let k = 0; for (const x of kicks) if (x.t >= t - 0.02 && x.t < e - 0.02) k += 1;
      return [mean(L, t, e), mean(B, t, e), mean(T, t, e), Math.min(1, k / 4)];
    });
    const D = 4; const scale = [0, 1, 2, 3].map((d) => quantile(feats.map((v) => v[d]), 0.95) || 1);
    const V = feats.map((v) => v.map((x, d) => x / scale[d]));
    const W = nb >= 48 ? 4 : nb >= 16 ? 2 : 1;
    const avg = (a, b) => { const o = [0, 0, 0, 0]; let c = 0; for (let j = Math.max(0, a); j < Math.min(nb, b); j += 1) { for (let d = 0; d < D; d += 1) o[d] += V[j][d]; c += 1; } return o.map((x) => x / (c || 1)); };
    const nov = new Float32Array(nb);
    for (let j = 1; j < nb; j += 1) {
      const a = avg(j - W, j); const b = avg(j, j + W);
      let d = 0; for (let k = 0; k < D; k += 1) d += Math.abs(b[k] - a[k]) * (k === 3 ? 0.8 : 1);
      nov[j] = d * (j % 8 === 0 ? 1.4 : j % 4 === 0 ? 1.2 : 1);
    }
    const top = Math.max(...nov, 1e-6);
    const minLen = nb >= 48 ? 8 : nb >= 16 ? 4 : 2;
    const cands = [];
    for (let j = 1; j < nb; j += 1) if (nov[j] >= (nov[j - 1] || 0) && nov[j] >= (nov[j + 1] || 0) && nov[j] > top * 0.3) cands.push(j);
    cands.sort((a, b) => nov[b] - nov[a]);
    const cuts = [];
    for (const j of cands) if (j >= minLen && nb - j >= Math.min(minLen, 2) && cuts.every((c) => Math.abs(c - j) >= minLen)) cuts.push(j);
    cuts.sort((a, b) => a - b);
    const bounds = [0, ...cuts, nb];
    const segs = [];
    for (let i = 0; i + 1 < bounds.length; i += 1) {
      const a = bounds[i]; const b = bounds[i + 1]; const v = avg(a, b);
      const half = Math.max(1, Math.floor((b - a) / 2));
      const rise = avg(a + half, b)[0] - avg(a, a + half)[0];
      segs.push({ a, b, e: 0.4 * v[0] + 0.25 * v[1] + 0.15 * v[2] + 0.2 * v[3], kick: v[3], rise, bconf: i ? nov[a] / top : 1 });
    }
    const es = segs.map((s) => s.e); const lo = Math.min(...es); const hi = Math.max(...es); const spread = hi - lo;
    for (const s of segs) s.rel = spread > 0.12 ? (s.e - lo) / spread : 0.5;
    segs.forEach((s, i) => {
      const last = i === segs.length - 1; const next = segs[i + 1];
      if (s.rel >= 0.66) s.label = 'Drop';
      else if (i === 0) s.label = next && next.rel >= 0.66 && s.rise > 0.04 && s.b - s.a <= 16 ? 'Build' : 'Intro';
      else if (last) s.label = 'Outro';
      else if (next && next.rel >= 0.66) s.label = s.rise > 0.03 || s.rel > 0.33 ? 'Build' : 'Break';
      else s.label = 'Break';
      const margin = s.label === 'Drop' ? (s.rel - 0.66) / 0.34 : s.label === 'Build' ? clamp(s.rise * 8, 0, 1) : (0.66 - s.rel) / 0.66;
      s.conf = Math.round(clamp(0.5 * s.bconf + 0.5 * clamp(margin, 0, 1) + (spread > 0.12 ? 0 : -0.3), 0.05, 1) * 100) / 100;
    });
    // two neighbours with the same name are one section (a long drop)
    for (let i = segs.length - 1; i > 0; i -= 1) if (segs[i].label === segs[i - 1].label) { const p = segs[i - 1]; const q = segs[i]; p.conf = Math.max(p.conf, q.conf); p.b = q.b; p.rel = Math.max(p.rel, q.rel); segs.splice(i, 1); }
    return segs.map((s, i) => ({
      start: i === 0 ? 0 : r2(barT[s.a]), end: s.b >= nb ? r2(duration) : r2(barT[s.b]), bar: s.a + 1, bars: s.b - s.a,
      label: s.label, energy: s.rel >= 0.66 ? 'loud' : s.rel <= 0.33 ? 'quiet' : 'medium', conf: s.conf,
    }));
  }
  // Fallback for songs with too few beats: loudness over ~3 s, split into quiet / medium / loud.
  function loudSections(L, duration) {
    const N = L.length; const E = movingAvg(L, 150);
    const qLo = quantile(E, 0.35); const qHi = quantile(E, 0.72);
    const lvl = (x) => (x >= qHi ? 'loud' : x <= qLo ? 'quiet' : 'medium');
    let out = [];
    for (let f = 0; f < N; f += 50) { const e = lvl(E[f]); const last = out[out.length - 1]; if (last && last.energy === e) last.end = (f + 50) / 100; else out.push({ start: f / 100, end: (f + 50) / 100, energy: e }); }
    for (let pass = 0; pass < 3; pass += 1) {
      const merged = [];
      for (const s of out) { const last = merged[merged.length - 1]; if (last && (s.end - s.start < 4 || last.energy === s.energy)) last.end = s.end; else merged.push({ ...s }); }
      out = merged;
    }
    if (out.length) out[out.length - 1].end = duration;
    return out.map((s, i) => ({ start: r2(s.start), end: r2(s.end), energy: s.energy, label: s.energy === 'loud' ? 'Drop' : i === 0 ? 'Intro' : i === out.length - 1 ? 'Outro' : 'Break', conf: 0.3 }));
  }

  // ---------- 8. a style guess → one of the ⚡ trigger presets ----------
  function guessStyle({ bpm, straight, kicks, snares, hats, beats, L, B, T, duration }) {
    const perBeat = (list) => (beats.length ? list.length / beats.length : 0);
    // share of beats with a kick, in the bars that have kicks at all: four-on-the-floor ≈ 1, half-time ≈ 0.25–0.5
    let onBeat = 0; let counted = 0; let j = 0;
    const hasKick = (a, b) => kicks.some((k) => k.t >= a - 0.05 && k.t < b - 0.05);
    for (let i = 0; i < beats.length; i += 4) {
      const a = beats[i]; const b = beats[i + 4] ?? beats[beats.length - 1] + 0.5;
      if (!hasKick(a, b)) continue;
      for (let k = i; k < Math.min(beats.length, i + 4); k += 1) { const t = beats[k]; counted += 1; while (j < kicks.length && kicks[j].t < t - 0.05) j += 1; if (j < kicks.length && Math.abs(kicks[j].t - t) <= 0.05) onBeat += 1; }
    }
    const four = counted ? onBeat / counted : 0;
    const hatsPB = perBeat(hats); const kicksPB = perBeat(kicks);
    const avg = (a) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i]; return s / (a.length || 1); };
    const lv = avg(L); const bassy = avg(B) / (lv || 1); const bright = avg(T) / (lv || 1);
    const busy = (kicks.length + snares.length + hats.length) / Math.max(1, duration);
    const f = { bpm, four: r2(four), hatsPerBeat: r2(hatsPB), kicksPerBeat: r2(kicksPB), bassy: r2(bassy), bright: r2(bright), busy: r2(busy), straight };
    let preset = 'Techno / house'; let why; let double = false;
    const b = bpm;
    if (busy < 1 || (kicksPB < 0.12 && snares.length < beats.length * 0.1)) { preset = 'Ambient / soft'; why = 'few hits: soft and slow-moving'; }
    else if (!straight && four < 0.6) { preset = 'Rock / live drums'; why = 'played tempo (it drifts)'; }
    else if (b >= 160 && b <= 185) { preset = bassy > 0.9 && bright < 0.5 ? 'Liquid DnB' : 'Drum & bass'; why = `${Math.round(b)} BPM breaks`; }
    else if (b >= 80 && b <= 92 && hatsPB >= 3) { preset = bassy > 0.9 && bright < 0.5 ? 'Liquid DnB' : 'Drum & bass'; why = `${Math.round(b * 2)} BPM breaks (heard at half: doubled)`; double = true; }
    else if (four >= 0.7) {
      if (b >= 150) { preset = 'Hardstyle'; why = `${Math.round(b)} BPM, kick on every beat`; }
      else if (b >= 140) { preset = 'Hard techno'; why = `${Math.round(b)} BPM, kick on every beat`; }
      else if (b >= 134) { preset = 'Trance'; why = `${Math.round(b)} BPM, kick on every beat`; }
      else if (b >= 124) { preset = 'Techno / house'; why = `${Math.round(b)} BPM, kick on every beat`; }
      else if (b >= 115) { preset = 'Deep house'; why = `${Math.round(b)} BPM, kick on every beat`; }
      else { preset = 'Disco / nu-disco'; why = `${Math.round(b)} BPM, four on the floor`; }
    } else if ((b >= 130 && b <= 152) || (b >= 65 && b <= 76)) {
      if (hatsPB >= 1.8) { preset = 'Trap'; why = `${Math.round(b)} BPM, half-time kicks, fast hats`; }
      else if (bassy > 1) { preset = 'Dubstep'; why = `${Math.round(b)} BPM, half-time, heavy bass`; }
      else { preset = 'Hip-hop / trap'; why = `${Math.round(b)} BPM, half-time`; }
    } else if (b < 105) {
      if (bright < 0.25) { preset = 'Lo-fi hip-hop'; why = `${Math.round(b)} BPM, soft and dull highs`; }
      else if (hatsPB >= 1.8) { preset = 'Hip-hop / trap'; why = `${Math.round(b)} BPM, busy hats`; }
      else { preset = 'Boom bap'; why = `${Math.round(b)} BPM, kick and snare`; }
    } else { preset = 'Pop'; why = `${Math.round(b)} BPM, not four-on-the-floor`; }
    const conf = Math.round(clamp(straight ? 0.6 : 0.4, 0, 1) * 100) / 100 + (four >= 0.85 || four <= 0.3 ? 0.2 : 0);
    return { preset, why, conf: Math.min(1, conf), features: f, ...(double ? { double } : {}) };
  }

  // ---------- everything ----------
  function analyzeSignal(mono, SR, { onProgress } = {}) {
    const duration = mono.length / SR;
    onProgress?.(0.02);
    const bp = bandPass(mono, SR);
    const { N } = bp;
    onProgress?.(0.15);
    const fl = flux(mono, SR, N, onProgress);
    onProgress?.(0.66);
    const norm = (a) => { const p = quantile(a, 0.98) || 1; for (let i = 0; i < a.length; i += 1) a[i] = Math.min(1, a[i] / p); return a; };
    const L = norm(bp.L); const B = norm(bp.B); const M = norm(bp.M); const T = norm(bp.T);
    const odf = odfOf(fl.SF);
    const kOdf = odfOf(fl.SK);
    // the tempo listens to everything plus the kicks (most dance music is carried by them)
    const tOdf = new Float32Array(N); for (let i = 0; i < N; i += 1) tOdf[i] = odf[i] + 0.5 * kOdf[i];
    const tp = tempo(tOdf);
    onProgress?.(0.72);
    const beatF = trackBeats(tOdf, 6000 / tp.bpm);
    // the beat chain's own tempo (the autocorrelation works in 0.1 BPM steps) and a straight grid through it
    let P = 6000 / tp.bpm;
    if (beatF.length > 16) {
      const n = beatF.length; let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
      beatF.forEach((t, i) => { sx += i; sy += t; sxx += i * i; sxy += i * t; });
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      if (slope > P * 0.96 && slope < P * 1.04) P = slope;
    }
    const fit = fitGrid(tOdf, P);
    let gridP = fit.P; let gridPh = fit.ph;
    // most tracks are made at a whole (or half) BPM: take it when it lines up about as well
    const exact = 6000 / gridP;
    for (const cand of [Math.round(exact), Math.round(exact * 2) / 2]) {
      if (Math.abs(cand - exact) > 0.3) continue;
      const Pc = 6000 / cand; let bestPh = 0; let bs = -1;
      for (let ph = 0; ph < Pc; ph += 0.25) { const s = combSum(tOdf, Pc, ph); if (s > bs) { bs = s; bestPh = ph; } }
      if (bs >= fit.s * 0.97) { gridP = Pc; gridPh = bestPh; break; }
    }
    // onsets per band
    const kicks = pickOnsets(fl.SK, { gap: 110, rel: 0.3, fine: bp.FK, win: 10, power: fl.PKb, loud: fl.loud });
    const snares = pickOnsets(fl.SS, { gap: 100, rel: 0.35, fine: bp.FS, power: fl.PSb, loud: fl.loud });
    const hats0 = pickOnsets(fl.SH, { gap: 55, rel: 0.25, fine: bp.FH, minFrac: 0.03, exclude: snares.map((x) => x.t), power: fl.PHb, loud: fl.loud });
    const hats = hats0.filter((h) => !snares.some((s) => Math.abs(s.t - h.t) < 0.035));
    onProgress?.(0.8);
    // everything that follows from a grid (period and phase in frames): beats, bar 1, sections, the style
    const layout = (gridP, gridPh, dpF) => {
      const bpm = Math.round((6000 / gridP) * 100) / 100;
      // straight (a produced track) or played (the tempo drifts): how many tracked beats sit on the straight grid
      const inner = dpF.filter((f) => f > N * 0.08 && f < N * 0.92);
      const onGrid = inner.filter((f) => { const k = (f - gridPh) / gridP; return Math.abs(k - Math.round(k)) * gridP <= 4; }).length;
      const straightness = inner.length ? onGrid / inner.length : 0;
      const straight = straightness >= 0.7;
      // grid lines onto the attacks: the kicks near grid lines say how far the flux frames sit from the real hits
      let shift = 0;
      {
        const P = gridP / FPS; const ph = gridPh / FPS; const d = [];
        for (const k of kicks) { const x = (k.t - ph) / P; const e = (x - Math.round(x)) * P; if (Math.abs(e) < 0.06) d.push(e); }
        if (d.length >= 8) shift = quantile(d, 0.5);
      }
      const period = gridP / FPS; let anchor0 = gridPh / FPS + shift;
      anchor0 -= Math.floor(anchor0 / period) * period;
      const gridBeats = []; for (let t = anchor0; t < duration; t += period) gridBeats.push(r4(t));
      const beats = straight ? gridBeats : dpF.map((f) => r4(f / FPS));
      const db = downbeat(beats, { SK: fl.SK, SS: fl.SS, LS: fl.LS, nLow: fl.nLow, L });
      const downIndex = beats.length ? db.phase % Math.max(1, Math.min(4, beats.length)) : 0;
      const downbeatT = beats[downIndex] ?? 0;
      // sections over bars counted from the downbeat (a pickup before it belongs to the first section)
      const barT = []; for (let i = downIndex; i < beats.length; i += 4) barT.push(beats[i]);
      const secs = barT.length >= 6 ? sections(barT, duration, { L, B, T, kicks }) : loudSections(L, duration);
      const drops = secs.filter((x, i) => x.label === 'Drop' && i > 0 && secs[i - 1].label !== 'Drop').map((x) => x.start);
      const style = guessStyle({ bpm, straight, kicks, snares, hats, beats, L, B, T, duration });
      return { bpm, straight, straightness, period, beats, db, downIndex, downbeatT, secs, drops, style };
    };
    let lay = layout(gridP, gridPh, beatF);
    // half-time read of a double-time style (drum & bass heard at 87): the grid doubles
    if (lay.style.double) {
      const dp = []; beatF.forEach((f, i) => { dp.push(f); if (beatF[i + 1] != null) dp.push((f + beatF[i + 1]) / 2); });
      lay = layout(gridP / 2, gridPh % (gridP / 2), dp);
    }
    onProgress?.(0.9);
    const { bpm, straight, straightness, period, beats, db, downIndex, downbeatT, secs, drops, style } = lay;
    // suggestions beside the pick: other strong tempos, and the half / double of it
    const bpmCandidates = [bpm, ...tp.peaks, bpm * 2, bpm / 2].filter((b) => b >= 60 && b <= 200)
      .filter((b, i, arr) => arr.findIndex((x) => Math.abs(x - b) / b < 0.03) === i).slice(0, 4).map((b) => Math.round(b * 100) / 100);
    // 30 fps envelopes for sketches (audio.analysis.bass[Math.floor(t * 30)]) and the overview
    const SFPS = 30;
    const down = (a) => { const n = Math.floor((N * SFPS) / FPS); const o = new Array(n); for (let i = 0; i < n; i += 1) { const s = Math.floor((i * FPS) / SFPS); const e = Math.floor(((i + 1) * FPS) / SFPS); let m = 0; for (let k = s; k < e; k += 1) m = Math.max(m, a[k]); o[i] = Math.round(m * 1000) / 1000; } return o; };
    const peakNorm = (a) => { let mx = 0; for (let i = 0; i < a.length; i += 1) mx = Math.max(mx, a[i]); const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i += 1) o[i] = Math.round((a[i] / (mx || 1)) * 255); return o; };
    let pmx = 0; for (let i = 0; i < N; i += 1) pmx = Math.max(pmx, bp.PK[i]);
    onProgress?.(1);
    return {
      duration, bpm, bpmCandidates, beats, drops,
      sections: secs, fps: SFPS, level: down(L), bass: down(B), mid: down(M), treble: down(T),
      peaks: Array.from(bp.PK, (x) => Math.round((x / (pmx || 1)) * 100) / 100),
      // new in round 5: where bar 1 is, how sure the tempo / bar 1 are, the hits found in each band, the style pick
      grid: { bpm, anchor: r4(downbeatT - Math.floor(downbeatT / (period * 4)) * period * 4), bpb: 4, straight, straightness: r2(straightness), tempoConf: r2(tp.conf), downbeatConf: db.conf },
      downIndex, onsets: { kick: kicks, snare: snares, hats }, style,
      // 100 fps peaks per band for the timeline's 3-band waveform (0..255; kept by the player, not sent to the sketch)
      wave: { fps: FPS, low: peakNorm(bp.WL), mid: peakNorm(bp.WM), high: peakNorm(bp.WH) },
    };
  }

  // ---------- as a Worker: { id, channels: [Float32Array…], sampleRate } → { id, result, mono } ----------
  if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = (e) => {
      const { id, channels, sampleRate } = e.data || {};
      try {
        const n = channels[0].length; const mono = new Float32Array(n);
        for (const ch of channels) for (let i = 0; i < n; i += 1) mono[i] += ch[i] / channels.length;
        let lastP = 0;
        const result = analyzeSignal(mono, sampleRate, { onProgress: (p) => { if (p - lastP >= 0.05 || p === 1) { lastP = p; self.postMessage({ id, progress: p }); } } });
        const { wave } = result;
        self.postMessage({ id, result, mono }, [mono.buffer, wave.low.buffer, wave.mid.buffer, wave.high.buffer]);
      } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
    };
  }
  return { analyzeSignal, FPS, LABELS, _parts: { biquad, fftPlan, movingAvg, movingMax, tempo, trackBeats, fitGrid, combSum, pickOnsets, refine, downbeat, sections, guessStyle, odfOf } };
})();
if (typeof module !== 'undefined') module.exports = MusicCore;
