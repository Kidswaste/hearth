// Audio features for the Lab (round 23, labaudio), as plain math (no DOM): the same analysis for a live input and
// for a song. It runs in four places, from this one file:
//   · the live input's AudioWorklet (tools/three-audio-worklet.js loads it first): samples → one compact frame of
//     features + the analyser-style spectrum / waveform the sketches already read, every 512 samples (~10 ms)
//   · a Worker for songs (`new Worker('tools/three-audio-core.js')`): the whole song once, 100 frames a second, cached
//   · the preview page (the hub sends `hearthAudioCore` as text the first time a sketch reads a feature): a fallback
//     on the analyser's spectrum (the Stage window's own live input, a song before its features are ready)
//   · Node, for the unit tests (dev/audio-test.js)
// Features (NAMES below, 0..1 unless said): 8 bands (adaptive: each follows its own loudest / quietest), a hit pulse
// per band, kick / snare / hat / vocal hits, vocal level, level, loudness (LUFS-ish, and the raw LUFS), spectral
// centroid / flux / flatness, beat pulse + beat / bar phase with how sure, the strongest note, the key (+ a hue on the
// circle of fifths) and 12 chroma values, and on songs build (a ramp up to a drop), drop (a pulse fading after it) and
// intensity (the song's own quiet → loud).
function hearthAudioCore() {
  const NAMES = [
    'sub', 'low', 'lowMid', 'mids', 'highMid', 'presence', 'brilliance', 'air',
    'subHit', 'lowHit', 'lowMidHit', 'midsHit', 'highMidHit', 'presenceHit', 'brillianceHit', 'airHit',
    'kickOn', 'snareOn', 'hatOn', 'vocalOn',
    'vocal', 'level', 'loudness', 'lufs', 'centroid', 'flux', 'flatness', 'onset',
    'beat', 'beatPhase', 'barPhase', 'beatInBar', 'bar', 'bpm', 'beatConf', 'barConf',
    'note', 'key', 'keyHue', 'keyConf',
    'build', 'drop', 'intensity',
    'chroma0', 'chroma1', 'chroma2', 'chroma3', 'chroma4', 'chroma5', 'chroma6', 'chroma7', 'chroma8', 'chroma9', 'chroma10', 'chroma11',
  ];
  const F = NAMES.length;
  const IDX = Object.fromEntries(NAMES.map((n, i) => [n, i]));
  // stored as bytes in a song's feature track: the range each one is scaled from (0..1 unless listed)
  const RANGE = { lufs: [-70, 0], beatInBar: [0, 8], bar: [0, 255], bpm: [0, 255], key: [0, 24] };
  const BANDS = [[20, 60], [60, 150], [150, 400], [400, 1000], [1000, 2500], [2500, 5000], [5000, 10000], [10000, 20000]];
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const keyName = (k) => (k < 0 ? '' : `${NOTE_NAMES[k % 12]} ${k < 12 ? 'major' : 'minor'}`);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  // ---------- an FFT and the analyser's spectrum ----------
  function fftPlan(n) {
    const rev = new Uint32Array(n); const bits = Math.log2(n);
    for (let i = 0; i < n; i += 1) { let r = 0; for (let b = 0; b < bits; b += 1) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    const cos = new Float32Array(n / 2); const sin = new Float32Array(n / 2);
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
  // RBJ biquad (one sample at a time), for the K-weighting of the loudness
  function biquad(type, f0, SR, { Q = Math.SQRT1_2, gainDb = 0 } = {}) {
    const w = (2 * Math.PI * Math.min(f0, SR * 0.45)) / SR; const cs = Math.cos(w); const sn = Math.sin(w); const al = sn / (2 * Q);
    let b0; let b1; let b2; let a0; let a1; let a2;
    if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; } else {
      const A = 10 ** (gainDb / 40); const sq = 2 * Math.sqrt(A) * al; // high shelf
      b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq);
      a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq;
    }
    const B0 = b0 / a0; const B1 = b1 / a0; const B2 = b2 / a0; const A1 = a1 / a0; const A2 = a2 / a0;
    let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
    return (x) => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }

  // ---------- samples in, frames out (the worklet and the song Worker) ----------
  // stream({ rate, hop, bytes }) → { push(block: Float32Array), frames }: every `hop` samples it runs a 2048-point FFT
  // over the last 2048 samples (Blackman, like the browser's AnalyserNode) and calls onFrame(feat, spec, wave) with
  // the features; with bytes: true also the analyser-style byte spectrum (−100…−30 dB, smoothing 0.6: what
  // audio.spectrum always gave) and the waveform as bytes (128 = silence).
  function stream({ rate, hop = 512, bytes = true, track = true, onFrame }) {
    const N = 2048; const H = N / 2;
    const ring = new Float32Array(N); let w = 0; let filled = 0; let since = 0;
    const win = new Float32Array(N); for (let i = 0; i < N; i += 1) win[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N);
    const re = new Float32Array(N); const im = new Float32Array(N); const fft = fftPlan(N);
    const db = new Float32Array(H); const smooth = new Float32Array(H);
    const spec = bytes ? new Uint8Array(H) : null; const wave = bytes ? new Uint8Array(N) : null;
    const hp = biquad('highpass', 38, rate, { Q: 0.5 }); const sh = biquad('shelf', 1500, rate, { gainDb: 4 });
    let ms = 0; let kms = 0; let n = 0;
    const ex = extractor({ rate, size: N, track });
    const dt = hop / rate;
    function frame() {
      for (let i = 0; i < N; i += 1) { re[i] = ring[(w + i) % N] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < H; k += 1) {
        const mag = Math.hypot(re[k], im[k]) / N;
        db[k] = mag > 1e-10 ? 20 * Math.log10(mag) : -200;
        if (bytes) { smooth[k] = 0.6 * smooth[k] + 0.4 * mag; const d = smooth[k] > 1e-10 ? 20 * Math.log10(smooth[k]) : -200; spec[k] = d <= -100 ? 0 : d >= -30 ? 255 : Math.round(((d + 100) / 70) * 255); }
      }
      if (bytes) for (let i = 0; i < N; i += 1) { const v = Math.round(128 + ring[(w + i) % N] * 128); wave[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
      const feat = ex.frame(db, dt, n ? ms / n : 0, n ? kms / n : 0);
      ms = 0; kms = 0; n = 0;
      onFrame(feat, spec, wave);
    }
    return {
      ex,
      push(block) {
        for (let i = 0; i < block.length; i += 1) {
          const x = block[i];
          ring[w] = x; w = (w + 1) % N; filled += 1; since += 1;
          const k = sh(hp(x)); ms += x * x; kms += k * k; n += 1;
          if (since >= hop && filled >= N / 2) { since = 0; frame(); }
        }
      },
    };
  }

  // ---------- one frame of features from a dB spectrum ----------
  // extractor({ rate, size }) → { frame(db: Float32Array of size / 2 bins in dB, dt seconds, meanSquare, kWeightedMeanSquare) → Float32Array(F) }
  // (the preview's fallback passes the analyser's getFloatFrequencyData and its level)
  function extractor({ rate = 48000, size = 2048, track = true } = {}) {
    const H = size / 2; const hz = rate / size;
    const out = new Float32Array(F);
    const span = (lo, hi) => { const a = Math.max(1, Math.floor(lo / hz)); const b = Math.min(H - 1, Math.ceil(hi / hz)); return a > b ? null : [a, b]; };
    const u = new Float32Array(H); const prev = new Float32Array(H); const mag = new Float32Array(H);
    // an onset detector on the positive change of a range of bins: an adaptive bar (mean + k × deviation), a gap
    // rel: the range must also be near its own recent loudest (a hat's faint low end isn't a kick)
    const det = (lo, hi, gapMs, k = 2.2, tau = 0.09, rel = 0) => ({ r: span(lo, hi), gap: gapMs / 1000, k, tau, rel, m: 0, d: 0, at: -1e9, p: 0, v: 0, prevF: 0, top: 0 });
    const bandsD = BANDS.map(([lo, hi]) => det(lo, hi, 80, 2.4));
    const kick = det(35, 120, 140, 2.0, 0.12, 0.75); const snBody = det(150, 350, 110, 1.8); const snNoise = det(2000, 6000, 110, 1.8, 0.09, 0.5);
    const hat = det(7000, 15000, 55, 2.0, 0.06); const voc = det(300, 3400, 120, 2.0, 0.12); const all = det(30, 16000, 70, 2.0, 0.1);
    const bandR = BANDS.map(([lo, hi]) => span(lo, hi));
    // each band's own range (slow followers), so a band reads 0..1 whatever the volume
    const lo8 = new Float32Array(8).fill(1); const hi8 = new Float32Array(8);
    let t = 0; let fluxMax = 0.02; let vocLo = 1; let vocHi = 0; let loudM = 0;
    let intLo = 0; let intHi = 0; let started = false;
    // chroma: the spectral peaks 100 Hz–4.2 kHz, by pitch class (power-weighted)
    const pcAt = (f) => ((Math.round(12 * Math.log2(f / 261.6256)) % 12) + 12) % 12;
    const kLo = Math.max(2, Math.floor(100 / hz)); const kHi = Math.min(H - 2, Math.ceil(4200 / hz));
    const chroma = new Float32Array(12); const chromaLong = new Float32Array(12); const cnow = new Float32Array(12);
    // Krumhansl–Kessler key profiles
    const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]; const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    const corr = (prof, root, c) => { let mx = 0; let my = 0; for (let i = 0; i < 12; i += 1) { mx += prof[i]; my += c[i]; } mx /= 12; my /= 12; let sxy = 0; let sx = 0; let sy = 0; for (let i = 0; i < 12; i += 1) { const a = prof[i] - mx; const b = c[(i + root) % 12] - my; sxy += a * b; sx += a * a; sy += b * b; } return sx && sy ? sxy / Math.sqrt(sx * sy) : 0; };
    let key = -1; let keyConf = 0; let keyT = 0;
    const raw = { bass: 0 }; // before the adaptive ranges (the song pass reads it)
    // beat tracking (live): an onset-strength history, its autocorrelation for the tempo and a comb for the phase
    const fpsGuess = 1 / 0.0107; const HL = Math.ceil(fpsGuess * 8);
    const odf = new Float32Array(HL); let oi = 0; let ofill = 0; let trackT = 0;
    let period = 0; let cand = 0; let tempoConf = 0; let beatPos = 0; let counted = 0;
    const acc = new Float32Array(4); let kickRecent = 0; let lateBeat = -1; let dtAvg = 0.0107; let snP = 0;
    // live drops / builds (rough; songs get a better pass in analyzeTrack): a long dip in the bass, then it's back
    let bassSlow = 0; let bassFast = 0; let dipT = 0; let dipBass = 0; let dropAt = -1e9; let fluxSlow = 0; let fluxFast = 0;
    const rangeU = (r, arr) => { if (!r) return 0; let s = 0; for (let k = r[0]; k <= r[1]; k += 1) s += arr[k]; return s / (r[1] - r[0] + 1); };
    const fluxOf = (r) => { if (!r) return 0; let s = 0; for (let k = r[0]; k <= r[1]; k += 1) { const d = u[k] - prev[k]; if (d > 0) s += d; } return s / (r[1] - r[0] + 1); };
    // returns 1 on an onset of this detector this frame (and updates its pulse)
    const fire = (D, f, dt) => {
      D.p *= Math.exp(-dt / D.tau);
      const a = Math.min(1, dt / 0.35);
      const bar = D.m + D.k * D.d + 0.004;
      let loudOk = true;
      if (D.rel) { const lv = rangeU(D.r, u); D.top = Math.max(lv, D.top * Math.exp(-dt / 4)); loudOk = lv >= D.top * D.rel; }
      const on = f > bar && f > D.prevF * 0.9 && t - D.at >= D.gap && loudOk;
      D.m += (f - D.m) * a; D.d += (Math.abs(f - D.m) - D.d) * a; D.prevF = f;
      if (on) { D.at = t; D.p = 1; return 1; }
      return 0;
    };
    function beatTrack(o, dt) {
      odf[oi] = o; oi = (oi + 1) % HL; ofill = Math.min(HL, ofill + 1);
      dtAvg += (dt - dtAvg) * 0.05;
      const fps = 1 / dtAvg;
      if (period) {
        beatPos += dt / period;
        // each beat collects the kick strength around it (just before, or up to ~15 % of a beat late): bar 1 is the beat
        // with the strongest kicks (and bass changes) over the last bars
        while (Math.floor(beatPos) > counted) { counted += 1; const b = counted & 3; acc[b] = acc[b] * 0.85 + kickRecent; kickRecent = 0; lateBeat = counted; }
      }
      trackT += dt;
      if (trackT < 0.25 || ofill < fps * 3) return;
      trackT = 0;
      const n = ofill; const at = (j) => odf[(oi - 1 - j + HL * 2) % HL]; // j frames ago
      let mean = 0; for (let j = 0; j < n; j += 1) mean += at(j); mean /= n;
      const minL = Math.floor((fps * 60) / 190); const maxL = Math.min(n - 2, Math.ceil((fps * 60) / 65));
      let best = 0; let bestS = -1e9; let ac0 = 0; const acs = new Float32Array(maxL + 2);
      for (let j = 0; j < n; j += 1) { const x = at(j) - mean; ac0 += x * x; }
      for (let L = minL; L <= maxL + 1; L += 1) { let s = 0; for (let j = 0; j + L < n; j += 1) s += (at(j) - mean) * (at(j + L) - mean); acs[L] = s / (n - L); }
      for (let L = minL; L <= maxL; L += 1) {
        const bpm = (60 * fps) / L; const lg = Math.log2(bpm / 120);
        const s = (acs[L] + (2 * L <= maxL ? 0.5 * acs[2 * L] : 0)) * Math.exp(-0.5 * (lg / 0.9) ** 2);
        if (s > bestS) { bestS = s; best = L; }
      }
      if (!best || !(ac0 > 0)) return;
      const a0 = acs[best - 1] || 0; const a1 = acs[best]; const a2 = acs[best + 1] || 0;
      const den = a0 - 2 * a1 + a2; const Lf = best + (den < 0 ? (0.5 * (a0 - a2)) / den : 0);
      const conf = clamp01((a1 / (ac0 / n)) * 1.6);
      const p = Lf / fps;
      if (!period || Math.abs(p - period) / period < 0.04) { period = period ? period + (p - period) * 0.25 : p; cand = 0; } else if (cand && Math.abs(p - cand) / cand < 0.04) { period = p; cand = 0; } else cand = p;
      tempoConf += (conf - tempoConf) * 0.3;
      // phase: the offset whose comb (every beat back over the history) collects the most onset strength
      const P = period * fps; let bestO = 0; let bestC = -1;
      for (let off = 0; off < P; off += 1) { let c = 0; for (let k = 0; off + k * P < n - 1; k += 1) { const j = Math.round(off + k * P); c += at(j) * (k < 4 ? 1 : 0.6); } if (c > bestC) { bestC = c; bestO = off; } }
      const fracM = bestO / P; // frames since the last beat, in beats
      const frac = beatPos - Math.floor(beatPos);
      let e = fracM - frac; if (e > 0.5) e -= 1; if (e < -0.5) e += 1;
      beatPos += e * 0.35;
      if (Math.floor(beatPos) < counted) beatPos = Math.max(beatPos, counted); // never count a beat twice
    }
    function frame(db, dt, meanSq, kMeanSq) {
      if (!(dt > 0)) dt = 0.0107;
      t += dt;
      // each bin 0..1 between −75 and −10 dB (a −75 dB floor: quiet bins flickering aren't onsets)
      for (let k = 1; k < H; k += 1) { const d = db[k]; u[k] = d <= -75 ? 0 : d >= -10 ? 1 : (d + 75) / 65; mag[k] = d > -200 ? 10 ** (d / 20) : 0; }
      if (!started) { prev.set(u); started = true; }
      const slow = Math.min(1, dt / 8); const fast = Math.min(1, dt / 0.25);
      for (let j = 0; j < 8; j += 1) {
        const v = rangeU(bandR[j], u);
        if (!bandR[j]) { out[j] = 0; out[8 + j] = 0; continue; }
        hi8[j] = Math.max(v, hi8[j] - (hi8[j] - lo8[j]) * slow * 0.5); lo8[j] = Math.min(v, lo8[j] + (hi8[j] - lo8[j]) * slow * 0.5);
        const r = Math.max(0.08, hi8[j] - lo8[j]);
        out[j] = clamp01((v - (hi8[j] - r)) / r);
        fire(bandsD[j], fluxOf(bandsD[j].r), dt); out[8 + j] = bandsD[j].p;
      }
      // drums and vocals
      const kf = fluxOf(kick.r); kickRecent *= 0.85;
      if (fire(kick, kf, dt)) { if (lateBeat >= 0 && period && beatPos - lateBeat < 0.15) acc[lateBeat & 3] += kf * 10; else kickRecent = Math.max(kickRecent, kf * 10); }
      const nb = fluxOf(snBody.r); const nn = fluxOf(snNoise.r);
      fire(snBody, nb, dt); const noiseOn = fire(snNoise, nn, dt);
      // a snare: a noise burst with some body at the same time (hats alone have no body)
      snP *= Math.exp(-dt / 0.1);
      if (noiseOn && t - snBody.at < 0.035) snP = 1;
      out[IDX.snareOn] = snP;
      out[IDX.kickOn] = kick.p;
      fire(hat, fluxOf(hat.r), dt); out[IDX.hatOn] = hat.r ? hat.p : 0;
      // vocals-ish: tonal energy in 300 Hz – 3.4 kHz (a flat spectrum there is noise / drums)
      let ga = 0; let ar = 0; let cnt = 0;
      for (let k = voc.r[0]; k <= voc.r[1]; k += 1) { const p = mag[k] * mag[k] + 1e-12; ga += Math.log(p); ar += p; cnt += 1; }
      const flatV = cnt ? Math.exp(ga / cnt) / (ar / cnt) : 1;
      const tonal = clamp01(1 - flatV * 3);
      const vv = rangeU(voc.r, u) * tonal;
      vocHi = Math.max(vv, vocHi - (vocHi - vocLo) * slow * 0.5); vocLo = Math.min(vv, vocLo + (vocHi - vocLo) * slow * 0.5);
      const vr = Math.max(0.05, vocHi - vocLo);
      out[IDX.vocal] += (clamp01((vv - (vocHi - vr)) / vr) - out[IDX.vocal]) * fast;
      if (fire(voc, fluxOf(voc.r) * (0.3 + tonal), dt) && tonal < 0.25) voc.p = 0;
      out[IDX.vocalOn] = voc.p;
      // level, loudness (K-weighted, a 400 ms window: LUFS-ish), centroid, flux, flatness
      out[IDX.level] = clamp01(Math.sqrt(Math.max(0, meanSq)) * 3);
      loudM += ((kMeanSq || meanSq) - loudM) * Math.min(1, dt / 0.4);
      const lufs = loudM > 1e-9 ? -0.691 + 10 * Math.log10(loudM) : -70;
      out[IDX.lufs] = Math.max(-70, lufs);
      out[IDX.loudness] = clamp01((lufs + 48) / 42);
      let sw = 0; let s = 0; let fl = 0; let gm = 0; let am = 0; let nf = 0;
      for (let k = 1; k < H; k += 1) {
        const m = mag[k]; s += m; sw += m * k * hz;
        const d = u[k] - prev[k]; if (d > 0) fl += d;
        if (k * hz >= 100 && k * hz <= 8000) { const p = m * m + 1e-12; gm += Math.log(p); am += p; nf += 1; }
      }
      const cen = s > 0 ? sw / s : 0;
      out[IDX.centroid] = cen > 50 ? clamp01(Math.log2(cen / 50) / Math.log2(16000 / 50)) : 0;
      fl /= H; fluxMax = Math.max(fl, fluxMax * Math.exp(-dt / 6), 0.004);
      out[IDX.flux] = clamp01(fl / fluxMax);
      out[IDX.flatness] = nf ? clamp01((Math.exp(gm / nf) / (am / nf)) * 2) : 0;
      fire(all, fl, dt); out[IDX.onset] = all.p;
      // chroma, the strongest note and the key (from a long average: changes slowly, says how sure)
      cnow.fill(0);
      // only the spectrum's peaks, each at its interpolated frequency (the window's leakage would smear a low note
      // over its neighbours)
      for (let k = kLo; k <= kHi; k += 1) {
        const b = db[k]; if (b < -80 || b <= db[k - 1] || b < db[k + 1]) continue;
        const a = db[k - 1]; const c = db[k + 1]; const den = a - 2 * b + c; const p = den < 0 ? (0.5 * (a - c)) / den : 0;
        cnow[pcAt((k + p) * hz)] += mag[k] * mag[k];
      }
      let cm = 0; for (let i = 0; i < 12; i += 1) cm = Math.max(cm, cnow[i]);
      const ca = Math.min(1, dt / 0.15); const cl = Math.min(1, dt / 10);
      let best = 0;
      for (let i = 0; i < 12; i += 1) { const v = cm > 0 ? cnow[i] / cm : 0; chroma[i] += (v - chroma[i]) * ca; chromaLong[i] += (v * (out[IDX.level] > 0.02 ? 1 : 0) - chromaLong[i]) * cl; out[IDX.chroma0 + i] = chroma[i]; if (chroma[i] > chroma[best]) best = i; }
      out[IDX.note] = cm > 0 ? best / 12 : 0;
      keyT += dt;
      if (keyT > 0.5) {
        keyT = 0;
        let b1 = -2; let b2 = -2; let bk = -1;
        for (let r = 0; r < 12; r += 1) for (const [prof, off] of [[MAJ, 0], [MIN, 12]]) { const c = corr(prof, r, chromaLong); if (c > b1) { b2 = b1; b1 = c; bk = r + off; } else if (c > b2) b2 = c; }
        let tot = 0; for (let i = 0; i < 12; i += 1) tot += chromaLong[i];
        if (tot > 0.5) { key = bk; keyConf = clamp01((b1 - b2) * 6) * clamp01(b1 * 1.5); }
      }
      out[IDX.key] = key < 0 ? 0 : key; out[IDX.keyConf] = keyConf;
      // circle of fifths (a minor key sits with its relative major): neighbouring keys get neighbouring hues
      out[IDX.keyHue] = key < 0 ? 0 : ((((key < 12 ? key : (key - 12 + 3) % 12) * 7) % 12) / 12);
      // the beat (live: tracked here; a song's grid overrides it in the preview)
      if (track) {
        beatTrack(kf * 2 + fl, dt);
        const frac = period ? beatPos - Math.floor(beatPos) : 0;
        let d1 = 0; let m1 = -1; let m2 = -1;
        for (let i = 0; i < 4; i += 1) { if (acc[i] > m1) { m2 = m1; m1 = acc[i]; d1 = i; } else if (acc[i] > m2) m2 = acc[i]; }
        const inBar = ((counted - d1) % 4 + 4) % 4;
        out[IDX.beat] = period ? Math.exp(-(frac * period) / 0.12) : 0;
        out[IDX.beatPhase] = frac; out[IDX.beatInBar] = period ? inBar + 1 : 0; out[IDX.barPhase] = period ? (inBar + frac) / 4 : 0;
        out[IDX.bar] = period ? Math.floor((counted - d1) / 4) + 1 : 0;
        out[IDX.bpm] = period ? Math.round(600 / period) / 10 : 0;
        out[IDX.beatConf] = period ? tempoConf : 0; out[IDX.barConf] = m1 > 0 ? clamp01((m1 - Math.max(0, m2)) / m1) * tempoConf : 0;
      }
      // drops / builds while live (rough): a few seconds without bass, then the bass is back
      const bass = (rangeU(bandR[0], u) + rangeU(bandR[1], u)) / 2;
      raw.bass = bass;
      bassSlow += (bass - bassSlow) * Math.min(1, dt / 10); bassFast += (bass - bassFast) * Math.min(1, dt / 0.4);
      fluxSlow += (fl - fluxSlow) * Math.min(1, dt / 8); fluxFast += (fl - fluxFast) * Math.min(1, dt / 1);
      if (bassFast < bassSlow * 0.82) { if (!dipT) dipBass = bassSlow; dipT += dt; } else {
        if (dipT > 3 && bassFast > dipBass * 0.9) dropAt = t;
        if (bassFast > bassSlow * 0.95) dipT = 0;
      }
      out[IDX.drop] = Math.exp(-(t - dropAt) / 2);
      out[IDX.build] = dipT > 2 ? clamp01((dipT - 2) / 14) * clamp01(0.5 + (fluxFast / Math.max(1e-6, fluxSlow) - 1)) : Math.max(0, out[IDX.build] - dt * 2);
      // intensity: the loudness between the quietest and loudest of the last half minute
      const lu = out[IDX.loudness];
      intHi = Math.max(lu, intHi - dt / 60); intLo = Math.min(lu, intLo + dt / 60);
      out[IDX.intensity] = clamp01((lu - intLo) / Math.max(0.1, intHi - intLo));
      prev.set(u);
      return out;
    }
    return { frame, out, raw, get key() { return key; }, get keyConf() { return keyConf; }, get chromaLong() { return chromaLong; } };
  }

  // ---------- a whole song: 100 frames a second, with builds and drops ----------
  // analyzeTrack(mono, rate, { drops (seconds, from the music analysis), onProgress }) →
  //   { fps, F, names, n, data: Uint8Array(n × F) (RANGE-scaled bytes), meta: { key, keyName, keyConf, drops, builds } }
  function analyzeTrack(mono, rate, { drops: given = [], onProgress } = {}) {
    const hop = Math.round(rate / 100); const fps = rate / hop;
    const n = Math.floor(mono.length / hop);
    const data = new Uint8Array(n * F);
    let f = 0;
    const enc = (k, v) => { const r = RANGE[NAMES[k]]; const x = r ? (v - r[0]) / (r[1] - r[0]) : v; return x <= 0 ? 0 : x >= 1 ? 255 : Math.round(x * 255); };
    const rawBass = new Float32Array(n);
    const s = stream({ rate, hop, bytes: false, track: true, onFrame: (feat) => { if (f >= n) return; const o = f * F; for (let k = 0; k < F; k += 1) data[o + k] = enc(k, feat[k]); rawBass[f] = s.ex.raw.bass; f += 1; } });
    const B = 1 << 15;
    for (let i = 0; i < mono.length; i += B) { s.push(mono.subarray(i, Math.min(mono.length, i + B))); onProgress?.(0.9 * (i / mono.length)); }
    // per-second series for the song-level pass
    const secs = Math.floor(n / fps);
    const per = (name, how = 'mean') => { const k = IDX[name]; const o = new Float32Array(secs); for (let sI = 0; sI < secs; sI += 1) { let a = 0; const s0 = Math.floor(sI * fps); const s1 = Math.floor((sI + 1) * fps); for (let j = s0; j < s1; j += 1) { const v = data[j * F + k] / 255; a = how === 'count' ? a + (v > 0.99 ? 1 : 0) : a + v; } o[sI] = how === 'count' ? a : a / Math.max(1, s1 - s0); } return o; };
    const bass = new Float32Array(secs); for (let i = 0; i < secs; i += 1) { let a = 0; const s0 = Math.floor(i * fps); const s1 = Math.floor((i + 1) * fps); for (let j = s0; j < s1; j += 1) a += rawBass[j]; bass[i] = a / Math.max(1, s1 - s0); }
    const loud = per('lufs'); const cen = per('centroid'); const flux = per('flux'); const hats = per('hatOn', 'count');
    const mean = (a, i0, i1) => { let sm = 0; let c = 0; for (let i = Math.max(0, i0); i < Math.min(a.length, i1); i += 1) { sm += a[i]; c += 1; } return c ? sm / c : 0; };
    // drops: the bass comes back much stronger and it gets louder (on top of the music analysis' own drops)
    const found = [];
    for (let i = 6; i < secs - 4; i += 1) {
      const b0 = mean(bass, i - 6, i); const b1 = mean(bass, i, i + 4); const l0 = mean(loud, i - 6, i) * 70; const l1 = mean(loud, i, i + 4) * 70;
      if (b1 > b0 * 1.25 + 0.03 && l1 - l0 > 1.5) found.push({ t: i, s: b1 - b0 + (l1 - l0) / 20 });
    }
    found.sort((a, b) => b.s - a.s);
    const drops = [...given];
    for (const c of found) if (!drops.some((d) => Math.abs(d - c.t) < 15)) drops.push(c.t);
    drops.sort((a, b) => a - b);
    // a found drop moves to where the bass steps up most (±3 s, a second each side), then onto the kick / low hit there
    const meanR = (j0, j1) => { let a = 0; let c = 0; for (let j = Math.max(0, j0); j < Math.min(n, j1); j += 1) { a += rawBass[j]; c += 1; } return c ? a / c : 0; };
    for (let di = 0; di < drops.length; di += 1) {
      if (given.some((g) => Math.abs(g - drops[di]) < 0.01)) continue;
      let bestJ = -1; let bv = -1;
      for (let j = Math.max(0, Math.floor((drops[di] - 2) * fps)); j < Math.min(n, Math.floor((drops[di] + 4) * fps)); j += 2) { const v = meanR(j, j + fps) - meanR(j - fps, j); if (v > bv) { bv = v; bestJ = j; } }
      if (bestJ < 0) continue;
      let hitJ = bestJ; let hv = 0;
      for (let j = Math.max(0, bestJ - Math.round(fps * 0.15)); j < Math.min(n, bestJ + Math.round(fps * 0.15)); j += 1) { const v = data[j * F + IDX.kickOn] + data[j * F + IDX.lowHit]; if (v > hv) { hv = v; hitJ = j; } }
      drops[di] = Math.round(((hv > 400 ? hitJ : bestJ) / fps) * 1000) / 1000;
    }
    drops.sort((a, b) => a - b);
    // builds: before each drop, from where the tension (brighter, busier hats, more change, less bass) starts to rise
    const z = (a) => { const m = mean(a, 0, a.length); let v = 0; for (const x of a) v += (x - m) ** 2; const sd = Math.sqrt(v / Math.max(1, a.length)) || 1; return Array.from(a, (x) => (x - m) / sd); };
    const zc = z(cen); const zh = z(hats); const zf = z(flux); const zb = z(bass);
    const T = zc.map((x, i) => x + zh[i] + 0.5 * zf[i] - zb[i]);
    const Ts = T.map((_, i) => mean(T, i - 1, i + 2));
    const builds = [];
    for (const d of drops) {
      const di = Math.floor(d); if (di < 6) continue;
      const lo = Math.max(0, di - 40); let mi = -1; let mv = Infinity;
      for (let i = lo; i <= di - 4; i += 1) if (Ts[i] < mv) { mv = Ts[i]; mi = i; }
      const end = Ts[Math.max(0, di - 1)];
      const prevDrop = drops.filter((x) => x < d - 1).pop() ?? -1;
      // the build starts where the tension leaves its low (back from the drop to 10 % of the rise)
      let start = -1;
      if (mi >= 0 && end - mv > 0.8) { const thr = mv + 0.1 * (end - mv); start = mi; for (let i = di - 1; i > mi; i -= 1) if (Ts[i] <= thr) { start = i + 1; break; } }
      // no rise in tension: the bass gap before the drop is the build
      if (start < 0 && mean(bass, di - 8, di) < mean(bass, di, di + 8) * 0.6) { start = di - 8; for (let i = di - 1; i > Math.max(lo, di - 32); i -= 1) { if (bass[i] > mean(bass, di, di + 8) * 0.7) { start = i + 1; break; } } }
      if (start >= 0 && start > prevDrop + 2 && d - start >= 3) builds.push({ start, end: d });
    }
    // write build (an eased ramp), drop (a pulse fading over 2 s) and intensity (the song's own quiet → loud)
    const L2 = Array.from(loud, (_, i) => mean(loud, i - 1, i + 2));
    const sorted = [...L2].sort((a, b) => a - b); const p5 = sorted[Math.floor(sorted.length * 0.05)] ?? 0; const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 1;
    for (let j = 0; j < n; j += 1) {
      const tt = j / fps; const o = j * F;
      let b = 0; for (const bl of builds) if (tt >= bl.start && tt < bl.end) { const x = (tt - bl.start) / (bl.end - bl.start); b = x * x * (3 - 2 * x) * 0.4 + x * 0.6; }
      let dp = 0; for (const d of drops) if (tt >= d && tt - d < 10) dp = Math.max(dp, Math.exp(-(tt - d) / 2));
      const si = Math.min(secs - 1, Math.floor(tt)); const sf = tt - si; const lv = si >= 0 ? L2[si] * (1 - sf) + (L2[Math.min(secs - 1, si + 1)] ?? L2[si]) * sf : 0;
      data[o + IDX.build] = Math.round(clamp01(b) * 255); data[o + IDX.drop] = Math.round(clamp01(dp) * 255);
      data[o + IDX.intensity] = Math.round(clamp01((lv - p5) / Math.max(1e-3, p95 - p5)) * 255);
    }
    onProgress?.(1);
    const k = s.ex.key;
    return { fps, F, names: NAMES, n, data, meta: { key: k, keyName: keyName(k), keyConf: Math.round(s.ex.keyConf * 100) / 100, drops: drops.map((x) => Math.round(x * 1000) / 1000), builds: builds.map((b) => ({ start: b.start, end: Math.round(b.end * 1000) / 1000 })) } };
  }
  // a byte from a track back to its value
  const dec = (k, byte) => { const r = RANGE[NAMES[k]]; const x = byte / 255; return r ? r[0] + x * (r[1] - r[0]) : x; };

  // ---------- the mapping curve (a slider following a feature) ----------
  // c = { thr 0..0.95, gam 0.25..4 (above 1: punchier), inv, att ms, rel ms }; state = { y, t } (ms clock)
  function shape(x, c, state, nowMs) {
    if (!c) return x;
    x = clamp01(Number(x) || 0);
    if (c.thr > 0) x = clamp01((x - c.thr) / (1 - c.thr));
    if (c.gam && c.gam !== 1) x = x ** c.gam;
    if (c.inv) x = 1 - x;
    if (!state) return x;
    if (state.t == null) { state.t = nowMs; state.y = x; return x; }
    const dt = nowMs - state.t;
    if (dt > 0) {
      const tau = x > state.y ? c.att || 0 : c.rel || 0;
      state.y += (x - state.y) * (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
      state.t = nowMs;
    }
    return state.y;
  }

  return { NAMES, F, IDX, RANGE, BANDS, NOTE_NAMES, keyName, fftPlan, stream, extractor, analyzeTrack, dec, shape };
}
const AudioFeat = hearthAudioCore();
globalThis.AudioFeat = AudioFeat;

// ---------- as a Worker: { id, mono: Float32Array, rate, drops } → { id, track } (and { id, progress }) ----------
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => {
    const { id, mono, rate, drops } = e.data || {};
    try {
      let lastP = 0;
      const t0 = Date.now();
      const track = AudioFeat.analyzeTrack(mono, rate, { drops, onProgress: (p) => { if (p - lastP >= 0.05 || p === 1) { lastP = p; self.postMessage({ id, progress: p }); } } });
      track.meta.ms = Date.now() - t0;
      self.postMessage({ id, track }, [track.data.buffer]);
    } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
  };
}
if (typeof module !== 'undefined') module.exports = AudioFeat;
