/* (round 68, refab68) 🎧 Reference A/B for the Sound desk: the measuring, with no DOM and no runtime (Node tests require
   it: dev/refab68-test.js; tools/refab.js runs it in a Worker: `new Worker('tools/refab-core.js')`).
   - Loudness: ITU-R BS.1770 integrated loudness, as LUFS. K-weighting (the high shelf + the low cut, coefficients made
     for any sample rate the way libebur128 does), 400 ms blocks every 100 ms, the −70 LUFS absolute gate and the −10 LU
     relative gate. A mono file counts as both speakers (dual mono: it plays on two). It is called an approximation in
     the window because the file is first decoded (and resampled to 48 kHz) by the browser's decoder.
   - The 100 ms steps are kept, so a loop region's loudness, the loudest part of a track and the tone balance of any
     region come from the same one pass (no second pass when a handle moves).
   - Tone balance: low (< 250 Hz) / mid / high (> 4 kHz) energy of the mono sum, each as a share of the whole, so the
     comparison is about the balance, not about which one is louder. Words: "your low end is 4 dB lighter".
   - Level matching: the louder one is turned down to the quieter one's loudness (never a boost, so nothing clips).
   - The desk's output device among the window's audio outputs (pickSink), for playing on the same interface. */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.RefabCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const RATE = 48000, STEP_S = 0.1, BLOCK_STEPS = 4, ABS_GATE = -70, REL_GATE = -10, OFFSET = -0.691;
  const LOW_HZ = 250, HIGH_HZ = 4000, SAME_DB = 1.5, LOUDEST_S = 15, MIN_REGION_S = 1;
  const BANDS = [{ id: 'low', label: 'Low', range: 'below 250 Hz' }, { id: 'mid', label: 'Mid', range: '250 Hz – 4 kHz' }, { id: 'high', label: 'High', range: 'above 4 kHz' }];
  const log10 = Math.log10, MINUS = '−';

  // ---------- filters ----------
  /** K-weighting for a sample rate: [high shelf, low cut] as { b0, b1, b2, a1, a2 } (libebur128's formulas; at 48 kHz
   *  they are the BS.1770 table's numbers). */
  function kWeights(rate) {
    let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    let K = Math.tan(Math.PI * f0 / rate);
    const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416, a0 = 1 + K / Q + K * K;
    const shelf = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
    f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / rate);
    const d = 1 + K / Q + K * K;
    const cut = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / d, a2: (1 - K / Q + K * K) / d };
    return [shelf, cut];
  }
  /** A 2nd-order Butterworth low / high pass (RBJ cookbook, Q = 1/√2). */
  function butter(type, hz, rate) {
    const w = 2 * Math.PI * Math.min(hz, rate * 0.45) / rate, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
    const b = type === 'low' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    return { b0: b[0] / a0, b1: b[1] / a0, b2: b[2] / a0, a1: -2 * c / a0, a2: (1 - al) / a0 };
  }
  /** The gain of a biquad at a frequency (tests: the K curve's shape). */
  function response(f, hz, rate) {
    const w = 2 * Math.PI * hz / rate, re = (x0, x1, x2) => x0 + x1 * Math.cos(w) + x2 * Math.cos(2 * w), im = (x1, x2) => -(x1 * Math.sin(w) + x2 * Math.sin(2 * w));
    const nr = re(f.b0, f.b1, f.b2), ni = im(f.b1, f.b2), dr = re(1, f.a1, f.a2), di = im(f.a1, f.a2);
    return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }

  // ---------- the one pass ----------
  /** channels: Float32Array[] (1 or 2 used; mono = both speakers), rate. Returns the 100 ms steps: ms (the K-weighted
   *  mean square summed over the two speakers), low / mid / high (mean square of the mono sum in each band), the peak,
   *  the length, and peaks for a waveform `width` columns wide. */
  function analyze(channels, rate, { width = 0 } = {}) {
    const L = channels[0] || new Float32Array(0), R = channels[1] || L, mono = channels.length < 2, n = L.length;
    const step = Math.max(1, Math.round(STEP_S * rate)), steps = Math.floor(n / step);
    const ms = new Float64Array(steps), lo = new Float64Array(steps), mi = new Float64Array(steps), hi = new Float64Array(steps);
    const [s, c] = kWeights(rate), fl = butter('low', LOW_HZ, rate), fh1 = butter('high', LOW_HZ, rate), fl2 = butter('low', HIGH_HZ, rate), fh = butter('high', HIGH_HZ, rate);
    // transposed direct form II states, one pair per biquad
    let a1 = 0, a2 = 0, b1 = 0, b2 = 0, c1 = 0, c2 = 0, d1 = 0, d2 = 0, e1 = 0, e2 = 0, g1 = 0, g2 = 0, p1 = 0, p2 = 0, q1 = 0, q2 = 0;
    let peak = 0, sumK = 0, sumL = 0, sumM = 0, sumH = 0, k = 0, j = 0;
    for (let i = 0; i < n; i++) {
      const l = L[i], r = mono ? l : R[i];
      const al = l < 0 ? -l : l, ar = r < 0 ? -r : r; if (al > peak) peak = al; if (ar > peak) peak = ar;
      // K-weighting, left: shelf then low cut
      let y = s.b0 * l + a1; a1 = s.b1 * l - s.a1 * y + a2; a2 = s.b2 * l - s.a2 * y;
      let z = c.b0 * y + b1; b1 = c.b1 * y - c.a1 * z + b2; b2 = c.b2 * y - c.a2 * z;
      let kk = z * z;
      if (mono) kk *= 2; else {
        y = s.b0 * r + c1; c1 = s.b1 * r - s.a1 * y + c2; c2 = s.b2 * r - s.a2 * y;
        z = c.b0 * y + d1; d1 = c.b1 * y - c.a1 * z + d2; d2 = c.b2 * y - c.a2 * z;
        kk += z * z;
      }
      sumK += kk;
      // the bands, on the mono sum
      const m = mono ? l : (l + r) * 0.5;
      const vl = fl.b0 * m + e1; e1 = fl.b1 * m - fl.a1 * vl + e2; e2 = fl.b2 * m - fl.a2 * vl;
      const vh1 = fh1.b0 * m + g1; g1 = fh1.b1 * m - fh1.a1 * vh1 + g2; g2 = fh1.b2 * m - fh1.a2 * vh1;
      const vm = fl2.b0 * vh1 + p1; p1 = fl2.b1 * vh1 - fl2.a1 * vm + p2; p2 = fl2.b2 * vh1 - fl2.a2 * vm;
      const vh = fh.b0 * m + q1; q1 = fh.b1 * m - fh.a1 * vh + q2; q2 = fh.b2 * m - fh.a2 * vh;
      sumL += vl * vl; sumM += vm * vm; sumH += vh * vh;
      if (++k === step) { if (j < steps) { ms[j] = sumK / step; lo[j] = sumL / step; mi[j] = sumM / step; hi[j] = sumH / step; } j++; k = 0; sumK = sumL = sumM = sumH = 0; }
    }
    return { rate, seconds: n / rate, step: STEP_S, ms, low: lo, mid: mi, high: hi, peak, peaks: width ? peaks(channels, width) : null };
  }
  /** Max |sample| per column, for drawing the waveform once. */
  function peaks(channels, width) {
    const n = channels[0]?.length || 0, out = new Float32Array(width), per = n / width;
    for (let x = 0; x < width; x++) {
      let m = 0; const a = Math.floor(x * per), b = Math.min(n, Math.floor((x + 1) * per)), hop = Math.max(1, Math.floor((b - a) / 400));
      for (const ch of channels.slice(0, 2)) for (let i = a; i < b; i += hop) { const v = ch[i] < 0 ? -ch[i] : ch[i]; if (v > m) m = v; }
      out[x] = m;
    }
    return out;
  }

  // ---------- loudness from the steps ----------
  const toSteps = (res, from, to) => { const a = Math.max(0, Math.floor((from ?? 0) / res.step + 1e-9)), b = Math.min(res.ms.length, Math.ceil((to ?? res.seconds) / res.step - 1e-9)); return [a, b]; };
  /** Integrated loudness (LUFS) of [from, to) seconds (the whole by default), gated as BS.1770 says; null when nothing
   *  is above the gates (silence) or it is shorter than one 400 ms block. */
  function integrated(res, from, to) {
    const [a, b] = toSteps(res, from, to), S = res.ms, z = [];
    for (let i = a; i + BLOCK_STEPS <= b; i++) { let v = 0; for (let k = 0; k < BLOCK_STEPS; k++) v += S[i + k]; z.push(v / BLOCK_STEPS); }
    const lufs = v => OFFSET + 10 * log10(v);
    const g1 = z.filter(v => v > 0 && lufs(v) > ABS_GATE); if (!g1.length) return null;
    const rel = lufs(g1.reduce((x, y) => x + y, 0) / g1.length) + REL_GATE;
    const g2 = g1.filter(v => lufs(v) > rel); if (!g2.length) return null;
    return lufs(g2.reduce((x, y) => x + y, 0) / g2.length);
  }
  /** The loudest `seconds` of a track (usually its chorus / drop), on whole steps: { start, end } in seconds. A track
   *  not much longer than that gives the whole of it. */
  function loudest(res, seconds = LOUDEST_S) {
    const S = res.ms, w = Math.round(seconds / res.step);
    if (S.length <= w + BLOCK_STEPS) return { start: 0, end: res.seconds };
    let sum = 0; for (let i = 0; i < w; i++) sum += S[i];
    let best = sum, at = 0;
    for (let i = w; i < S.length; i++) { sum += S[i] - S[i - w]; if (sum > best + 1e-15) { best = sum; at = i - w + 1; } }
    return { start: at * res.step, end: (at + w) * res.step };
  }
  /** A loop region from two handles: inside the track, at least 1 s, start before end. */
  function region(start, end, seconds) {
    let a = Math.max(0, Math.min(seconds, Number(start) || 0)), b = Math.max(0, Math.min(seconds, Number(end) || 0)); if (b < a) [a, b] = [b, a];
    if (b - a < MIN_REGION_S) { b = Math.min(seconds, a + MIN_REGION_S); a = Math.max(0, b - MIN_REGION_S); }
    return { start: a, end: b };
  }

  // ---------- level matching ----------
  const dbToGain = db => 10 ** (db / 20);
  /** Both play at the quieter one's loudness: the louder one is turned down by the difference. { yoursDb, refDb, level,
   *  diff (ref − yours) } or null when one of them can't be measured. */
  function match(yours, ref) {
    if (!Number.isFinite(yours) || !Number.isFinite(ref)) return null;
    const diff = ref - yours;
    return { yoursDb: diff < 0 ? diff : 0, refDb: diff > 0 ? -diff : 0, level: Math.min(yours, ref), diff };
  }
  const num = (v, d = 1) => { const t = Math.abs(v).toFixed(d); return (v < 0 && Number(t) !== 0 ? MINUS : '') + t; };
  const lufsText = v => (Number.isFinite(v) ? `≈ ${num(v)} LUFS` : 'too quiet to measure');
  function matchText(m) {
    if (!m) return 'Not level-matched: one of the two is too quiet or too short to measure.';
    if (Math.abs(m.diff) < 0.05) return `Level-matched: both already sit at ${lufsText(m.level)}.`;
    return m.diff > 0 ? `Level-matched: the reference plays ${num(m.diff)} dB quieter, so both sit at ${lufsText(m.level)}.`
      : `Level-matched: yours plays ${num(-m.diff)} dB quieter, so both sit at ${lufsText(m.level)}. (Yours is the louder one.)`;
  }

  // ---------- tone balance ----------
  /** Each band's share of the band energy in [from, to), in dB (0 dB = all of it). null when silent. */
  function tone(res, from, to) {
    const [a, b] = toSteps(res, from, to); let L = 0, M = 0, H = 0;
    for (let i = a; i < b; i++) { L += res.low[i]; M += res.mid[i]; H += res.high[i]; }
    const all = L + M + H; if (!(all > 1e-12)) return null;
    const share = v => 10 * log10(Math.max(v, all * 1e-6) / all);
    return { low: share(L), mid: share(M), high: share(H) };
  }
  const WORDS = { low: ['Your low end', 'lighter', 'heavier'], mid: ['Your mids', 'quieter', 'louder'], high: ['Your top end', 'duller', 'brighter'] };
  /** Yours vs the reference, per band: { id, label, diff (dB, yours − ref), words }, plus the one to look at first. */
  function compare(yours, ref) {
    if (!yours || !ref) return null;
    const rows = BANDS.map(b => {
      const d = yours[b.id] - ref[b.id], [who, less, more] = WORDS[b.id], n = Math.max(1, Math.round(Math.abs(d)));
      const words = Math.abs(d) < SAME_DB ? `${who} ${b.id === 'mid' ? 'are' : 'is'} about the same as the reference.` : `${who} ${b.id === 'mid' ? 'are' : 'is'} ${n} dB ${d < 0 ? less : more} than the reference.`;
      return { id: b.id, label: b.label, range: b.range, diff: d, words };
    });
    const big = rows.reduce((x, y) => (Math.abs(y.diff) > Math.abs(x.diff) ? y : x));
    return { rows, first: Math.abs(big.diff) < SAME_DB ? 'Your tone balance is close to the reference.' : big.words };
  }

  // ---------- small things ----------
  /** The desk's output device among the window's outputs ([{ deviceId, label }]): the label sharing the most
   *  distinctive words with the desk's device name ("Speakers (UA Volt 2)" ↔ "UA Volt 2 (ASIO)"). '' when none fits. */
  const GENERIC = new Set(['speakers', 'speaker', 'output', 'outputs', 'line', 'asio', 'wasapi', 'mme', 'directsound', 'windows', 'core', 'coreaudio', 'audio', 'default', 'communications', 'device', 'digital', 'analog', 'stereo', 'headphones', 'the', 'and', 'usb', 'driver', 'high', 'definition', 'exclusive', 'shared', 'main', 'mix', 'out', 'monitor']);
  const words = s => new Set(String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 2 && !GENERIC.has(w)));
  function pickSink(name, devices) {
    const want = words(name); if (!want.size) return '';
    let best = '', score = 0;
    for (const d of devices || []) {
      if (!d || d.deviceId === 'default' || d.deviceId === 'communications') continue;
      let n = 0; for (const w of words(d.label)) if (want.has(w)) n++;
      if (n > score) { score = n; best = d.deviceId; }
    }
    return best;
  }
  const clock = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
  const AUDIO = /\.(wav|wave|mp3|flac|m4a|aac|aif|aiff|ogg|opus)$/i;
  const isAudioName = n => AUDIO.test(String(n || ''));

  const api = { RATE, STEP_S, BANDS, LOUDEST_S, MIN_REGION_S, SAME_DB, kWeights, butter, response, analyze, peaks, integrated, loudest, region, dbToGain, match, matchText, lufsText, tone, compare, pickSink, clock, isAudioName };

  // In a Worker (tools/refab.js): { id, channels, rate, width } → { id, res } (the step arrays transferred back)
  if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = (e) => {
      const { id, channels, rate, width } = e.data || {};
      try { const res = analyze(channels, rate, { width }); self.postMessage({ id, res }, [res.ms.buffer, res.low.buffer, res.mid.buffer, res.high.buffer, ...(res.peaks ? [res.peaks.buffer] : [])]); } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
    };
  }
  return api;
});
