// 🎵 Music visualizers (round 50, labvisualizers): the math and the shaders, no DOM. The same file runs in the Lab (the
// picker's live previews), in the preview / export page (sent as source on first use like ♪ Move with the music:
// globalThis.viscore, see "music visualizers" in tools/three-sandbox.html) and in Node (dev/labvisualizers-test.js).
// - analyzer(mono, rate): a song → its visualizer track, once per song (stepped, so a page can do it a few ms at a time
//   or all at once in a Worker): 64 log bands (40 Hz–10 kHz) 60 times a second, levelled per band against the song's
//   own loud moments, a loudness per frame, how far "travel" has gone (the loudness summed: starfield / tunnel speed)
//   and the waveform at 11 kHz. Pure numbers in, the same numbers out: a render reads exactly what the preview read.
// - frame(S, track, t, hit, level, o): one frame's data (bars, peaks, the waveform, the spectrogram's history) and
//   uniforms from the song's time alone (smoothing = the highest of the last frames, each a little lower the older it
//   is: no state carried from frame to frame), into reused arrays; nothing new per frame.
// - The 17 presets: a fragment shader each (GLSL 3, one full-screen pass) on a shared header.
function hearthVisCore() {
  const FPS = 60; const NB = 64; const LO = 40; const HI = 10000; const WR = 11025; const N = 1024;
  const TW = 512; const HROWS = 96; // the data texture: 512 wide; rows: bars, peaks, waveform (+ 96 rows of history)
  const EDGES = Array.from({ length: NB + 1 }, (_, i) => LO * (HI / LO) ** (i / NB));
  const bandAt = (hz) => Math.max(0, Math.min(NB, Math.round((Math.log(hz / LO) / Math.log(HI / LO)) * NB)));
  // what a layer listens to: its part of the spectrum (bands), the hits it moves on and where its level comes from
  const LISTEN = {
    whole: { name: 'Whole song', b: [0, NB], hit: 'beat' },
    bass: { name: 'Bass', b: [0, bandAt(250)], hit: 'kick' },
    mids: { name: 'Mids', b: [bandAt(250), bandAt(4000)], hit: 'snare' },
    highs: { name: 'Highs', b: [bandAt(4000), NB], hit: 'hats' },
    kick: { name: 'Kick', b: [0, NB], hit: 'kick', pulse: true },
    snare: { name: 'Snare', b: [0, NB], hit: 'snare', pulse: true },
    beat: { name: 'Beat', b: [0, NB], hit: 'beat', pulse: true },
    vocals: { name: 'Vocals (part)', b: [bandAt(250), bandAt(4000)], hit: 'beat', stem: true },
    drums: { name: 'Drums (part)', b: [0, NB], hit: 'kick', stem: true },
  };
  const LISTEN_IDS = Object.keys(LISTEN);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  // ---------- an FFT (radix 2, tables made once) ----------
  const fft = (() => {
    const rev = new Uint16Array(N); for (let i = 0; i < N; i += 1) { let r = 0; for (let b = 1, j = i; b < N; b <<= 1, j >>= 1) r = (r << 1) | (j & 1); rev[i] = r; }
    const cs = new Float32Array(N / 2); const sn = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i += 1) { cs[i] = Math.cos((2 * Math.PI * i) / N); sn[i] = -Math.sin((2 * Math.PI * i) / N); }
    const win = new Float32Array(N); for (let i = 0; i < N; i += 1) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const re = new Float32Array(N); const im = new Float32Array(N); const mag = new Float32Array(N / 2);
    return (x, c) => { // the magnitudes of the window centred on sample c
      for (let i = 0; i < N; i += 1) { const j = c - N / 2 + i; re[rev[i]] = (j >= 0 && j < x.length ? x[j] : 0) * win[i]; im[rev[i]] = 0; }
      for (let len = 2; len <= N; len <<= 1) {
        const h = len >> 1; const st = N / len;
        for (let i = 0; i < N; i += len) for (let k = 0; k < h; k += 1) {
          const a = i + k; const b = a + h; const wr = cs[k * st]; const wi = sn[k * st];
          const xr = re[b] * wr - im[b] * wi; const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
      for (let k = 0; k < N / 2; k += 1) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * (2 / N);
      return mag;
    };
  })();

  // ---------- a song → its track (step(ms) works for about that long; true when done) ----------
  function analyzer(mono, rate, { loop = 0 } = {}) {
    const n = Math.max(1, Math.ceil((mono.length / rate) * FPS));
    const db = new Float32Array(n * NB); const lv = new Float32Array(n);
    const bin = (hz) => (hz * N) / rate;
    let f = 0;
    const out = { done: false, track: null, progress: 0 };
    function finish() {
      // each band levelled against its own loud moments (its 98th percentile) but never lifted more than 18 dB over the
      // song's loudest band (a near-silent band stays dark): 44 dB of range below that
      const top = new Float32Array(NB); let glob = -200;
      const col = new Float32Array(n);
      for (let b = 0; b < NB; b += 1) { for (let i = 0; i < n; i += 1) col[i] = db[i * NB + b]; col.sort(); top[b] = col[Math.min(n - 1, Math.floor(n * 0.98))]; if (top[b] > glob) glob = top[b]; }
      const spec = new Uint8Array(n * NB);
      for (let b = 0; b < NB; b += 1) { const ref = Math.max(top[b], glob - 18); for (let i = 0; i < n; i += 1) spec[i * NB + b] = Math.round(clamp01((db[i * NB + b] - (ref - 44)) / 44) * 255); }
      const ls = Float32Array.from(lv).sort(); const lref = ls[Math.min(n - 1, Math.floor(n * 0.99))];
      const lev = new Uint8Array(n); const cum = new Float32Array(n + 1);
      for (let i = 0; i < n; i += 1) { lev[i] = Math.round(clamp01((lv[i] - (lref - 40)) / 40) * 255); cum[i + 1] = cum[i] + (0.15 + lev[i] / 255) / FPS; }
      // the waveform at 11 kHz (a box filter), scaled by the song's peak
      const k = Math.max(1, Math.round(rate / WR)); const nw = Math.floor(mono.length / k);
      let peak = 1e-6; for (let i = 0; i < mono.length; i += 1) { const a = Math.abs(mono[i]); if (a > peak) peak = a; }
      const wave = new Int8Array(nw);
      for (let i = 0; i < nw; i += 1) { let s = 0; for (let j = 0; j < k; j += 1) s += mono[i * k + j]; wave[i] = Math.max(-127, Math.min(127, Math.round((s / k / peak) * 127))); }
      out.track = { v: 1, fps: FPS, nb: NB, n, spec, lev, cum, wr: rate / k, wave, dur: mono.length / rate, loop };
      out.done = true; out.progress = 1;
    }
    out.step = (ms = 1e9) => {
      if (out.done) return true;
      const t0 = Date.now();
      while (f < n) {
        const c = Math.round((f * rate) / FPS);
        const m = fft(mono, c);
        for (let b = 0; b < NB; b += 1) {
          const a = bin(EDGES[b]); const z = bin(EDGES[b + 1]);
          let v = 0;
          if (Math.floor(z) <= Math.ceil(a)) { const x = (a + z) / 2; const i = Math.floor(x); const u = x - i; v = m[i] * (1 - u) + (m[i + 1] || 0) * u; } // narrower than a bin: read between bins
          else for (let i = Math.ceil(a); i <= Math.floor(z) && i < N / 2; i += 1) if (m[i] > v) v = m[i];
          db[f * NB + b] = 20 * Math.log10(v + 1e-7);
        }
        let s = 0; const a0 = Math.max(0, c - N / 2); const a1 = Math.min(mono.length, c + N / 2);
        for (let i = a0; i < a1; i += 1) s += mono[i] * mono[i];
        lv[f] = 10 * Math.log10(s / Math.max(1, a1 - a0) + 1e-10);
        f += 1;
        if ((f & 31) === 0 && Date.now() - t0 >= ms) { out.progress = f / n; return false; }
      }
      finish();
      return true;
    };
    return out;
  }
  const analyze = (mono, rate, o) => { const a = analyzer(mono, rate, o); a.step(); return a.track; };

  // ---------- the demo song (no song loaded, the picker's previews): 4 s at 120 BPM, drawn straight as a track ----------
  // (kick / snare / hats / a bass line / a pad as band levels and a waveform, a few ms; no audio to analyse)
  let demo = null;
  function demoTrack() {
    if (demo) return demo;
    const secs = 4; const n = secs * FPS; const wr = 11000; // (a beat is 5 500 samples: the envelopes are tables)
    const spec = new Uint8Array(n * NB); const lev = new Uint8Array(n); const cum = new Float32Array(n + 1);
    const fc = EDGES.slice(0, NB).map((e, i) => Math.sqrt(e * EDGES[i + 1]));
    const BASS = [55, 55, 65.4, 49]; const PAD = [[220, 277.2, 329.6], [261.6, 329.6, 392]];
    const near = (f, g) => Math.max(0, 1 - Math.abs(Math.log2(f / g)) / 0.09);
    const hh = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
    // each band's share of each sound, worked out once
    const KS = fc.map((c) => Math.max(0, 1 - Math.abs(Math.log2(c / 70)) / 1.4));
    const SS = fc.map((c) => (c > 900 && c < 9000 ? 0.75 - (0.35 * Math.abs(Math.log2(c / 2800))) / 1.7 : 0));
    const HS = fc.map((c) => (c > 5000 ? 0.62 : 0));
    const NS = BASS.map((g) => fc.map((c) => Math.max(near(c, g), near(c, g * 2) / 2, near(c, g * 3) / 3) * 0.75));
    const PS = PAD.map((ch) => fc.map((c) => Math.max(...ch.map((g) => Math.max(near(c, g), 0.4 * near(c, g * 2))))));
    for (let f = 0; f < n; f += 1) {
      const t = f / FPS; const tb = t % 0.5; const k = Math.exp(-tb * 13); const sn = Math.floor(t / 0.5) % 2 ? Math.exp(-tb * 16) : 0;
      const h = Math.exp(-(t % 0.25) * 38); const tl = (t + 0.25) % 0.5; const l = Math.exp(-tl * 5) * (tl < 0.25 ? 1 : 0.4);
      const ns = NS[Math.floor(t) % 4]; const ps = PS[Math.floor(t / 2) % 2]; const pa = 0.42 + 0.08 * Math.sin(t * 3);
      for (let b = 0; b < NB; b += 1) {
        const r = hh(f * NB + b);
        const v = Math.max(0.06 + 0.05 * r, k * KS[b], l * ns[b], pa * ps[b], sn * SS[b] * (0.85 + 0.15 * r), h * HS[b] * (0.8 + 0.2 * r));
        spec[f * NB + b] = Math.round(clamp01(v) * 255);
      }
      lev[f] = Math.round(clamp01(0.35 + 0.5 * k + 0.2 * sn) * 255); cum[f + 1] = cum[f] + (0.15 + lev[f] / 255) / FPS;
    }
    const wave = new Int8Array(secs * wr); const w = new Float32Array(wave.length);
    const B = wr / 2; const SIN = new Float32Array(4096); for (let i = 0; i < 4096; i += 1) SIN[i] = Math.sin((2 * Math.PI * i) / 4096);
    const KE = new Float32Array(B); const SE = new Float32Array(B); const LE = new Float32Array(B); const FR = new Float32Array(B);
    for (let j = 0; j < B; j += 1) { const tb = j / wr; KE[j] = Math.exp(-tb * 13); SE[j] = Math.exp(-tb * 16); const tl = (tb + 0.25) % 0.5; LE[j] = Math.exp(-tl * 5) * (tl < 0.25 ? 1 : 0.4); FR[j] = ((48 + 110 * Math.exp(-tb * 30)) * 4096) / wr; }
    const pw = PAD[0].map((g) => (g * 4096) / wr); const pp = [0, 0, 0]; let pk = 1e-6; let ph = 0;
    for (let i = 0; i < w.length; i += 1) {
      const j = i % B; const beat = (i - j) / B; const sn = beat % 2 ? SE[j] : 0;
      ph = (ph + FR[j]) % 4096; pp[0] = (pp[0] + pw[0]) % 4096; pp[1] = (pp[1] + pw[1]) % 4096; pp[2] = (pp[2] + pw[2]) % 4096;
      const bf = BASS[Math.floor(beat / 2) % 4]; const tt = i / wr;
      const x = 0.8 * SIN[ph | 0] * KE[j] + 0.3 * (((tt * bf) % 1) * 2 - 1) * LE[j] + (hh(i) - 0.5) * 0.6 * sn + 0.08 * (SIN[pp[0] | 0] + SIN[pp[1] | 0] + SIN[pp[2] | 0]);
      w[i] = x; if (x > pk) pk = x; else if (-x > pk) pk = -x;
    }
    for (let i = 0; i < w.length; i += 1) wave[i] = Math.round((w[i] / pk) * 127);
    demo = { v: 1, fps: FPS, nb: NB, n, spec, lev, cum, wr, wave, dur: secs, loop: secs };
    return demo;
  }
  // demo hits on the 120 BPM demo beat (the page's no-song beat, the previews): { k, at, prev }
  function clockHits(period, origin = 0) { const o = { k: 0, at: 0, prev: 0, next: 0 }; return (t) => { const k = Math.floor((t - origin) / period + 1e-9); o.k = k; o.at = origin + k * period; o.prev = o.at - period; o.next = o.at + period; return o; }; }
  const DEMO_HITS = { beat: clockHits(0.5), kick: clockHits(0.5), snare: clockHits(1, 0.5), hats: clockHits(0.25) };

  // ---------- one frame ----------
  // S: a layer's state (state(preset)): data (the texture's bytes), u (the uniforms as numbers), reused arrays
  function state(id) {
    const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
    const rows = p.hist ? 3 + HROWS : 3;
    return { p, rows, data: new Uint8Array(TW * rows), band: new Float32Array(NB), tmp: new Float32Array(NB), sig: NaN, u: { drive: 0, pulse: 0, travel: 0, hitK: 0, nb: 32, amt: 1, ages: new Float32Array(8).fill(99) } };
  }
  // a band's value at frame position x (between frames), from the track (looping for the demo)
  function rd(tr, b, x) {
    const n = tr.n; let i = Math.floor(x); const u = x - i;
    if (tr.loop) { i = ((i % n) + n) % n; const j = (i + 1) % n; return (tr.spec[i * NB + b] * (1 - u) + tr.spec[j * NB + b] * u) / 255; }
    if (i < 0) return 0; if (i >= n - 1) return i >= n ? 0 : tr.spec[i * NB + b] / 255;
    return (tr.spec[i * NB + b] * (1 - u) + tr.spec[(i + 1) * NB + b] * u) / 255;
  }
  // every band smoothed: the highest of the last frames, each older one lowered by `dec` a frame (attack: instant)
  function bands(tr, x, smooth, out, b0 = 0, b1 = NB) {
    const tau = 0.025 + smooth * smooth * 0.6; const dec = Math.exp(-1 / (FPS * tau)); const K = Math.min(40, Math.ceil(tau * FPS * 3));
    for (let b = b0; b < b1; b += 1) { let m = rd(tr, b, x); let w = 1; for (let j = 1; j <= K; j += 1) { w *= dec; const v = rd(tr, b, x - j) * w; if (v > m) m = v; } out[b] = m; }
  }
  // the bars: NB bands squeezed into n bars over the part listened to
  function group(src, b0, b1, n, sens, out) {
    const span = Math.max(1, b1 - b0);
    for (let i = 0; i < n; i += 1) {
      const a = b0 + (i * span) / n; const z = b0 + ((i + 1) * span) / n;
      let m = 0;
      if (z - a < 1) { const c = Math.min(NB - 1, Math.floor((a + z) / 2)); m = src[c]; } else for (let b = Math.floor(a); b < Math.ceil(z) && b < NB; b += 1) if (src[b] > m) m = src[b];
      out[i] = clamp01(m * sens);
    }
  }
  function waveRow(tr, t, o, dst, sens) {
    const W = tr.wave; const n = W.length; const wr = tr.wr;
    const span = o.trigger ? 0.03 : 0.06; let s0 = Math.floor((t - span) * wr);
    if (o.trigger) { // the oscilloscope: start on a rising zero crossing, so the trace stands still on a steady note
      const lim = Math.round(0.02 * wr);
      for (let j = 0; j < lim; j += 1) { const i = s0 - j; const a = tr.loop ? W[((i - 1) % n + n) % n] : W[i - 1]; const b = tr.loop ? W[((i % n) + n) % n] : W[i]; if (a < 0 && b >= 0) { s0 = i; break; } }
    }
    const len = span * wr;
    for (let i = 0; i < TW; i += 1) {
      const x = s0 + (i * len) / (TW - 1); let k = Math.floor(x); const u = x - k;
      let a; let b;
      if (tr.loop) { k = ((k % n) + n) % n; a = W[k]; b = W[(k + 1) % n]; } else { a = k >= 0 && k < n ? W[k] : 0; b = k + 1 >= 0 && k + 1 < n ? W[k + 1] : 0; }
      dst[i] = Math.max(0, Math.min(255, Math.round(128 + (a + (b - a) * u) * sens)));
    }
  }
  // t: the song's time (the demo loops); hit(t) → { k, at, prev } | null; level(t) → 0..1 | null (a part of the song)
  // o: { listen, sens, smooth, bars }. Returns true when the picture's data changed (a still song: nothing to upload).
  function frame(S, tr, t, hit, level, o) {
    const L = LISTEN[o.listen] || LISTEN.whole;
    const sens = Math.max(0, Number(o.sens) || 0); const smooth = clamp01(Number(o.smooth) || 0);
    const nb = Math.max(2, Math.min(NB, Math.round(Number(o.bars) || S.p.bars || 32)));
    const lev = level ? level(t) : null;
    const sig = t * 7.13 + sens * 101.7 + smooth * 13.1 + nb * 0.37 + LISTEN_IDS.indexOf(o.listen) * 3.3 + (hit ? 0.51 : 0) + (lev ?? -1) * 0.071;
    if (sig === S.sig && S.tr === tr) return false;
    S.sig = sig; S.tr = tr;
    const d = S.data; const u = S.u; const x = t * FPS;
    u.nb = nb; u.amt = sens;
    if (tr) {
      bands(tr, x, smooth, S.band, L.b[0], L.b[1]);
      group(S.band, L.b[0], L.b[1], nb, sens, S.tmp);
      for (let i = 0; i < nb; i += 1) d[i] = Math.round(S.tmp[i] * 255);
      // the level: the listened part's mean (smoothed like the bars)
      let lv = 0; for (let b = L.b[0]; b < L.b[1]; b += 1) lv += S.band[b]; lv /= Math.max(1, L.b[1] - L.b[0]);
      u.drive = clamp01(lv * 1.4 * sens);
      if (S.p.peaks) { bands(tr, x, Math.max(0.6, smooth), S.band, L.b[0], L.b[1]); group(S.band, L.b[0], L.b[1], nb, sens, S.tmp); for (let i = 0; i < nb; i += 1) d[TW + i] = Math.round(S.tmp[i] * 255); }
      if (S.p.wave) waveRow(tr, t, S.p, d.subarray(2 * TW, 3 * TW), sens);
      if (S.p.hist) { // the last seconds, a row every 2 frames (whole frames: the strip steps, it doesn't smear)
        const n = tr.n; const f0 = Math.floor(x);
        for (let r = 0; r < HROWS; r += 1) {
          let f = f0 - r * 2; if (tr.loop) f = ((f % n) + n) % n;
          const o = (3 + r) * TW;
          if (f < 0 || f >= n) { d.fill(0, o, o + nb); continue; }
          for (let b = 0; b < nb; b += 1) { const v = tr.spec[f * NB + Math.min(NB - 1, Math.floor(L.b[0] + ((b + 0.5) * (L.b[1] - L.b[0])) / nb))] * sens; d[o + b] = v > 255 ? 255 : v; }
        }
      }
      const c = tr.cum; const n = tr.n;
      if (tr.loop) { const tot = c[n]; const q = ((x % n) + n) % n; const i = Math.floor(q); u.travel = Math.floor(x / n) * tot + c[i] + (c[i + 1] - c[i]) * (q - i); } else { const q = Math.max(0, Math.min(n, x)); const i = Math.min(n - 1, Math.floor(q)); u.travel = c[i] + (c[i + 1] - c[i]) * (q - i); }
    } else { u.drive = 0; u.travel = t * 0.4; }
    // the hits: how long ago the last 8 were (walking back from the playhead: 8 lookups), a pulse on the last one
    const ages = u.ages; ages.fill(99); u.pulse = 0;
    let h = hit ? hit(t) : null; let at = h ? h.at : null; u.hitK = h ? h.k : 0;
    for (let i = 0; i < 8 && h && at != null && t - at < 99; i += 1) { ages[i] = t - at; const pv = h.prev; if (pv == null || pv >= at) break; h = hit(pv); at = h ? h.at : null; }
    if (ages[0] < 99) u.pulse = Math.exp(-ages[0] / (0.07 + smooth * 0.3)) * Math.min(1.5, sens);
    if (L.pulse) u.drive = clamp01(u.pulse);
    else if (lev != null) u.drive = clamp01(lev * sens); // a part of the song (stems): its own envelope
    return true;
  }
  // live sound (no track: the analyser's spectrum and waveform as they come)
  function frameLive(S, spec, wave, hz, o) {
    const L = LISTEN[o.listen] || LISTEN.whole; const sens = Math.max(0, Number(o.sens) || 0); const nb = Math.max(2, Math.min(NB, Math.round(Number(o.bars) || 32)));
    for (let b = 0; b < NB; b += 1) { const i0 = Math.max(1, Math.floor(EDGES[b] / hz)); const i1 = Math.max(i0, Math.floor(EDGES[b + 1] / hz)); let m = 0; for (let i = i0; i <= i1 && i < spec.length; i += 1) if (spec[i] > m) m = spec[i]; const v = m / 255; S.band[b] = Math.max(v, S.band[b] * 0.86); }
    group(S.band, L.b[0], L.b[1], nb, sens, S.tmp);
    const d = S.data; S.u.nb = nb; S.u.amt = sens;
    for (let i = 0; i < nb; i += 1) { d[i] = Math.round(S.tmp[i] * 255); d[TW + i] = Math.max(d[i], d[TW + i] - 2); }
    if (wave) for (let i = 0; i < TW; i += 1) d[2 * TW + i] = Math.max(0, Math.min(255, Math.round(128 + (wave[Math.floor((i * wave.length) / TW)] || 0) * 127 * sens)));
    if (S.p.hist) { d.copyWithin(4 * TW, 3 * TW, (S.rows - 1) * TW); for (let b = 0; b < nb; b += 1) d[3 * TW + b] = d[b]; }
    let lv = 0; for (let b = L.b[0]; b < L.b[1]; b += 1) lv += S.band[b]; S.u.drive = clamp01((lv / Math.max(1, L.b[1] - L.b[0])) * 1.4 * sens);
    S.u.travel += 0.004 + S.u.drive * 0.02; S.sig = NaN;
    return true;
  }

  // ---------- the shaders ----------
  const VERT = 'in vec3 position;\nvoid main() { gl_Position = vec4(position.xy, 0.0, 1.0); }\n';
  const HEAD = `precision highp float;
uniform vec2 uRes; uniform float uT, uDrive, uPulse, uTravel, uGlow, uSize, uHitK, uNB, uRows, uAmt, uImgOn, uImgAsp;
uniform float uAges[8]; uniform vec3 uC1, uC2, uC3; uniform sampler2D uData; uniform sampler2D uImg;
out vec4 fragColor;
#define PI 3.14159265
float AR() { return uRes.x / uRes.y; }
float rowY(float r) { return (r + 0.5) / uRows; }
float barAt(float i) { return texture(uData, vec2((clamp(i, 0.0, uNB - 1.0) + 0.5) / ${TW}.0, rowY(0.0))).r; }
float barS(float x) { return texture(uData, vec2((clamp(x, 0.0, 1.0) * (uNB - 1.0) + 0.5) / ${TW}.0, rowY(0.0))).r; }
float peakAt(float i) { return texture(uData, vec2((clamp(i, 0.0, uNB - 1.0) + 0.5) / ${TW}.0, rowY(1.0))).r; }
float waveAt(float x) { return texture(uData, vec2((clamp(x, 0.0, 1.0) * ${TW - 1}.0 + 0.5) / ${TW}.0, rowY(2.0))).r * 2.0 - 1.0; }
float histAt(float x, float y) { return texture(uData, vec2((clamp(x, 0.0, 1.0) * (uNB - 1.0) + 0.5) / ${TW}.0, (3.0 + clamp(y, 0.0, 1.0) * (uRows - 4.0) + 0.5) / uRows)).r; }
vec3 pal(float x) { x = clamp(x, 0.0, 1.0); return x < 0.5 ? mix(uC1, uC2, x * 2.0) : mix(uC2, uC3, x * 2.0 - 1.0); }
float hash1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float px() { return 1.5 / uRes.y / uSize; }
float ink(float d, float w) { return 1.0 - smoothstep(w, w + px(), d); }
float glowF(float d) { return uGlow * 0.55 / (1.0 + (d * d) / 0.0006); }
vec4 lit(vec3 c) { c = clamp(c, 0.0, 1.0); return vec4(c, max(c.r, max(c.g, c.b))); }
`;
  const MAIN = `
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  fragColor = vis(p / max(uSize, 0.05));
}
`;
  // the presets: id, name, what it is, what it listens to first, its colors, its own defaults; the shader's vis(q)
  // (q: the middle of the frame is 0, the frame's height is 1, y up; uSize scales it)
  const P0 = { listen: 'whole', sens: 1, smooth: 0.35, glow: 0.6, size: 1 };
  const PRESETS = [
    { id: 'bars', name: 'Spectrum bars', desc: 'Classic equalizer bars along the bottom, bass on the left, with falling peak caps', tags: 'equalizer eq linear', bars: 48, peaks: true, colors: ['#25d0ff', '#8a5bff', '#ff4fa3'],
      glsl: `vec4 vis(vec2 q) {
  float w = 0.9 * AR(); float x = (q.x + w * 0.5) / w; if (x < 0.0 || x > 1.0) return vec4(0.0);
  float i = floor(x * uNB); float f = fract(x * uNB); float v = barAt(i); float pk = peakAt(i);
  float y = q.y + 0.42; float H = 0.75; float h = v * H;
  float dx = max(abs(f - 0.5) - 0.38, 0.0) * w / uNB; float dy = max(max(-y, y - h), 0.0); float d = length(vec2(dx, dy));
  vec3 c = pal(i / max(uNB - 1.0, 1.0));
  float body = ink(d, 0.0) * (0.55 + 0.45 * clamp(y / max(h, 1e-3), 0.0, 1.0));
  float cap = ink(length(vec2(dx, abs(y - pk * H - 0.012))), 0.004) * step(0.01, pk);
  return lit(c * (body + cap * 0.9) + c * glowF(d) * (0.4 + v));
}` },
    { id: 'circle', name: 'Circular spectrum', desc: 'Spectrum bars around a ring that swells on the beat (a cover or logo fits in the middle)', tags: 'radial round ring halo', bars: 64, colors: ['#ffd75e', '#ff6a3d', '#ff2d7a'],
      glsl: `vec4 vis(vec2 q) {
  float r = length(q); float x = abs(atan(q.x, q.y)) / PI; float i = floor(x * uNB); float f = fract(x * uNB); float v = barAt(i);
  float r0 = 0.17 + 0.02 * uPulse; float h = 0.24 * v;
  float ang = max(abs(f - 0.5) - 0.32, 0.0) / uNB * PI * r; float dr = max(max(r0 - r, r - r0 - h), 0.0); float d = length(vec2(ang, dr));
  vec3 c = pal(x); float ring = ink(abs(r - r0 + 0.012), 0.003 + 0.004 * uDrive);
  return lit(c * ink(d, 0.0) + pal(0.0) * ring + c * glowF(d) * (0.3 + v) + pal(0.0) * glowF(abs(r - r0)) * 0.5 * uPulse);
}` },
    { id: 'mirror', name: 'Mirrored bars', desc: 'Bars mirrored up and down from a center line, bass in the middle, wide and symmetric', tags: 'symmetric center middle', bars: 40, colors: ['#ffffff', '#5ce1ff', '#2b6bff'],
      glsl: `vec4 vis(vec2 q) {
  float w = 0.9 * AR(); float x = abs(q.x) / (w * 0.5); if (x > 1.0) return vec4(0.0);
  float i = floor(x * uNB); float f = fract(x * uNB); float v = barAt(i); float h = 0.03 + 0.38 * v;
  float dx = max(abs(f - 0.5) - 0.36, 0.0) * w * 0.5 / uNB; float dy = max(abs(q.y) - h, 0.0); float d = length(vec2(dx, dy));
  vec3 c = pal(abs(q.y) / max(h, 1e-3) * 0.5 + x * 0.5);
  return lit(c * ink(d, 0.0) * (1.0 - 0.4 * abs(q.y) / max(h, 1e-3)) + c * glowF(d) * (0.3 + v));
}` },
    { id: 'wave', name: 'Waveform line', desc: 'The sound wave itself as a glowing line across the frame', tags: 'waveform line oscillo', wave: true, bars: 32, colors: ['#7cf7ff', '#ffffff', '#ff7ce6'],
      glsl: `vec4 vis(vec2 q) {
  float w = 0.92 * AR(); float x = (q.x + w * 0.5) / w; if (x < 0.0 || x > 1.0) return vec4(0.0);
  float e = 1.0 / ${TW}.0; float A = 0.28; float y = waveAt(x) * A; float s = (waveAt(x + e) - waveAt(x - e)) * A / (2.0 * e * w);
  float d = abs(q.y - y) / sqrt(1.0 + s * s); float fade = smoothstep(0.0, 0.06, x) * smoothstep(1.0, 0.94, x);
  vec3 c = pal(x);
  return lit((c * ink(d, 0.0025 + 0.004 * uDrive) + c * glowF(d) * (0.5 + uDrive)) * fade);
}` },
    { id: 'wavering', name: 'Waveform ring', desc: 'A circle drawn by the waveform, breathing with the loudness', tags: 'waveform circle round', wave: true, bars: 32, colors: ['#b6ff5c', '#2bffc6', '#3b8bff'],
      glsl: `vec4 vis(vec2 q) {
  float r = length(q); float x = abs(atan(q.x, q.y)) / PI; float r0 = 0.2 + 0.04 * uDrive + 0.02 * uPulse;
  float rr = r0 + waveAt(x) * 0.09; float d = abs(r - rr); vec3 c = pal(x);
  return lit(c * ink(d, 0.003 + 0.003 * uDrive) + c * glowF(d) * (0.6 + uDrive) + pal(1.0) * ink(abs(r - r0 * 0.6), 0.0015) * 0.35);
}` },
    { id: 'scope', name: 'Oscilloscope', desc: 'A steady oscilloscope trace on a faint grid, phosphor glow', tags: 'oscilloscope scope retro crt trace', wave: true, trigger: true, bars: 32, colors: ['#7dff8a', '#c8ffcc', '#1d6b2a'],
      glsl: `vec4 vis(vec2 q) {
  float w = 0.8 * AR(); float hh = 0.32; vec2 b = vec2(w * 0.5, hh); if (abs(q.x) > b.x || abs(q.y) > b.y) return vec4(0.0);
  float x = (q.x + w * 0.5) / w; float e = 1.0 / ${TW}.0; float A = 0.28; float y = waveAt(x) * A; float s = (waveAt(x + e) - waveAt(x - e)) * A / (2.0 * e * w);
  float d = abs(q.y - y) / sqrt(1.0 + s * s);
  vec2 g = abs(fract(vec2(q.x / (w / 10.0), q.y / (hh / 4.0))) - 0.5); float grid = max(ink(0.5 - g.x, 0.02), ink(0.5 - g.y, 0.02)) * 0.12;
  float frame = ink(abs(max(abs(q.x) - b.x, abs(q.y) - b.y)), 0.002) * 0.4;
  return lit(uC3 * (grid + frame) + uC1 * ink(d, 0.002) + uC2 * ink(d, 0.0008) + uC1 * glowF(d) * 0.9);
}` },
    { id: 'burst', name: 'Radial burst on kick', desc: 'Rays shoot out of the middle on every kick and fade', tags: 'rays explosion kick hit radial', listen: 'kick', bars: 32, colors: ['#ffffff', '#ffd75e', '#ff3d6a'],
      glsl: `vec4 vis(vec2 q) {
  float r = length(q); float a = atan(q.y, q.x) / (2.0 * PI) + 0.5; float N = 56.0; float cell = floor(a * N); float f = fract(a * N);
  vec3 col = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float age = uAges[k]; if (age > 1.2) continue;
    float h = hash1(cell + (uHitK - float(k)) * 17.0); if (h < 0.25) continue;
    float len = 0.08 + 0.32 * h; float r1 = 0.04 + age * (0.9 + h); float r0 = max(0.03, r1 - len);
    float wid = (0.12 + 0.3 * (1.0 - age)) * (1.0 - smoothstep(r0, r1, r) * 0.6);
    float on = step(r0, r) * step(r, r1) * (1.0 - smoothstep(wid * 0.5, wid * 0.5 + 0.08, abs(f - 0.5)));
    col += pal(h) * on * exp(-age * 2.8) * (1.0 - (r - r0) / max(len, 1e-3) * 0.5);
  }
  float core = 0.03 + 0.06 * uPulse;
  return lit(col + pal(0.0) * (ink(r, core) * (0.4 + 0.6 * uPulse) + glowF(max(r - core, 0.0)) * uPulse));
}` },
    { id: 'rings', name: 'Pulsing rings', desc: 'A ring leaves the middle on every hit and grows out', tags: 'circles ripple kick hit', listen: 'kick', bars: 32, colors: ['#5ce1ff', '#b36bff', '#ff5ca8'],
      glsl: `vec4 vis(vec2 q) {
  float r = length(q); vec3 col = vec3(0.0);
  for (int k = 0; k < 8; k++) {
    float age = uAges[k]; if (age > 2.4) continue;
    float rad = 0.04 + age * 0.32; float d = abs(r - rad); float a = exp(-age * 1.5);
    vec3 c = pal(fract((uHitK - float(k)) * 0.381966));
    col += c * a * (ink(d, 0.004 + 0.006 * a) + glowF(d) * 0.8);
  }
  float core = 0.035 + 0.025 * uDrive;
  return lit(col + pal(0.0) * (ink(r, core) * 0.8 + glowF(max(r - core, 0.0)) * (0.3 + uPulse)));
}` },
    { id: 'fountain', name: 'Particle fountain on bass', desc: 'A burst of sparks jumps up from the bottom on every bass hit and falls back', tags: 'particles sparks fountain bass kick', listen: 'bass', bars: 32, colors: ['#ffd75e', '#ff7a2f', '#ff2d55'],
      glsl: `vec4 vis(vec2 q) {
  vec2 o = vec2(0.0, -0.42); vec3 col = vec3(0.0);
  for (int k = 0; k < 5; k++) {
    float age = uAges[k]; if (age > 1.5) continue;
    float s = uHitK - float(k);
    for (int j = 0; j < 16; j++) {
      float fj = float(j); float h1 = hash1(s * 31.7 + fj * 1.37); float h2 = hash1(s * 13.1 + fj * 7.91);
      vec2 v = vec2((h1 - 0.5) * 0.75, 0.75 + 0.55 * h2);
      vec2 pos = o + v * age + vec2(0.0, -0.85) * age * age;
      float d = length(q - pos); float life = 1.0 - age / 1.5; float sz = 0.002 + 0.006 * life;
      col += pal(h1) * life * (ink(d, sz) + glowF(d) * 0.25);
    }
  }
  return lit(col + pal(0.0) * glowF(length(q - o)) * uDrive * 0.6);
}` },
    { id: 'stars', name: 'Starfield', desc: 'Flying through stars; faster when the music is louder', tags: 'stars space warp speed flight', bars: 32, colors: ['#ffffff', '#a8c8ff', '#ffb36b'],
      glsl: `vec4 vis(vec2 q) {
  vec3 col = vec3(0.0);
  for (int l = 0; l < 4; l++) {
    float fl = float(l); float z = fract(uTravel * 0.35 + fl * 0.25); float sc = mix(18.0, 0.8, z);
    vec2 uv = q * sc + vec2(fl * 7.3, fl * 3.1); vec2 id = floor(uv); vec2 f = fract(uv) - 0.5;
    vec2 off = vec2(hash2(id + fl), hash2(id + fl + 9.1)) - 0.5; float d = length(f - off * 0.7) / sc;
    float b = z * smoothstep(1.0, 0.85, z) * step(0.35, hash2(id * 1.7 + fl));
    col += pal(hash2(id + 3.3)) * b * (ink(d, 0.0012 + 0.003 * z) + glowF(d) * 0.4 * (0.5 + uDrive));
  }
  return lit(col);
}` },
    { id: 'tunnel', name: 'Tunnel', desc: 'Rushing down a tunnel lit by the spectrum; speed follows the music', tags: 'tunnel warp hyper depth', bars: 48, colors: ['#ff2d7a', '#8a5bff', '#25d0ff'],
      glsl: `vec4 vis(vec2 q) {
  float r = length(q); float a = atan(q.y, q.x) / (2.0 * PI) + 0.5;
  float z = 0.12 / max(r, 1e-3) + uTravel * 1.2;
  float rings = smoothstep(0.8, 1.0, fract(z * 1.5)) + smoothstep(0.2, 0.0, fract(z * 1.5));
  float seg = abs(fract(a * 16.0) - 0.5); float spec = barS(abs(fract(a) - 0.5) * 2.0);
  float lines = ink(seg, 0.03) * (0.3 + spec * 1.5);
  float fade = smoothstep(0.02, 0.3, r);
  return lit(pal(fract(z * 0.15)) * (rings * (0.5 + uDrive) + lines) * fade * (0.6 + 0.4 * spec));
}` },
    { id: 'terrain', name: 'Audio terrain', desc: 'A retro grid floor scrolling toward you, with spectrum mountains on the horizon', tags: 'grid synthwave outrun landscape terrain floor', bars: 48, colors: ['#ff2d7a', '#ff9d3d', '#25d0ff'],
      glsl: `vec4 vis(vec2 q) {
  float hz = 0.04; vec3 col = vec3(0.0); float W = 0.5 * AR();
  if (q.y < hz) {
    float z = 0.09 / max(hz - q.y, 1e-3); float X = q.x * z; float Z = z + uTravel * 1.6;
    float bump = barS(clamp(abs(X) * 0.12, 0.0, 1.0));
    float gx = abs(fract(X * 2.0) - 0.5); float gz = abs(fract(Z * 1.5) - 0.5);
    float wl = 0.03 * z; float line = max(ink(gx, wl), ink(gz, wl * 0.8));
    float fade = smoothstep(14.0, 2.0, z);
    col += pal(0.0) * line * fade * (0.5 + bump * 1.5) + pal(0.0) * glowF((hz - q.y) * 3.0) * 0.3;
  } else {
    float m = barS(abs(q.x) / W) * 0.22 * (0.6 + 0.4 * uDrive); float d = q.y - hz - m;
    col += pal(0.5) * (d < 0.0 ? 0.18 : 0.0) + pal(1.0) * (ink(abs(d), 0.002) + glowF(abs(d)) * 0.6);
    float sun = length(q - vec2(0.0, hz + 0.17)); float bandsS = step(0.35, fract((q.y - hz) * 24.0)) + step(0.3, q.y - hz);
    col += pal(0.5) * ink(sun, 0.09 + 0.012 * uPulse) * step(0.0, d) * min(bandsS, 1.0) * 0.8;
  }
  return lit(col);
}` },
    { id: 'blob', name: 'Breathing blob', desc: 'A soft round shape that breathes with the music; its outline follows the spectrum', tags: 'blob metaball organic shape breathe', listen: 'bass', bars: 32, smooth: 0.55, colors: ['#ff6ad5', '#8f5bff', '#3df0ff'],
      glsl: `vec4 vis(vec2 q) {
  float r = length(q); float a = atan(q.x, q.y); float x = abs(a) / PI;
  float rr = 0.2 * (1.0 + 0.3 * uDrive + 0.12 * uPulse) + 0.07 * barS(x) + 0.008 * sin(a * 5.0 + uT * 1.7);
  float d = r - rr; float fill = 1.0 - smoothstep(-px(), px(), d);
  vec3 c = mix(pal(1.0), pal(0.0), clamp(r / rr, 0.0, 1.0));
  return lit(c * fill * (0.55 + 0.45 * (1.0 - r / rr)) + pal(0.5) * (ink(abs(d), 0.003) + glowF(abs(d)) * (0.5 + uDrive)));
}` },
    { id: 'vu', name: 'VU meters', desc: 'LED meters with peak hold, one per band', tags: 'vu meter led level db', bars: 8, peaks: true, smooth: 0.2, colors: ['#3dff7a', '#ffd75e', '#ff3d3d'],
      glsl: `vec4 vis(vec2 q) {
  float w = min(0.9 * AR(), uNB * 0.09); float x = (q.x + w * 0.5) / w; float y = (q.y + 0.38) / 0.76;
  if (x < 0.0 || x > 1.0 || y < 0.0 || y > 1.0) return vec4(0.0);
  float i = floor(x * uNB); float f = fract(x * uNB); float v = barAt(i); float pk = peakAt(i);
  float S = 20.0; float s = floor(y * S); float fs = fract(y * S);
  float led = step(0.18, f) * step(f, 0.82) * step(0.15, fs) * step(fs, 0.85);
  float on = step(s + 0.5, v * S); float pon = step(abs(s - floor(pk * S - 0.001)), 0.5) * step(0.03, pk);
  vec3 c = pal(s / (S - 1.0));
  return lit(c * led * (0.07 + 0.93 * max(on, pon)) + c * glowF(0.0) * led * on * 0.15);
}` },
    { id: 'spectrogram', name: 'Spectrogram strip', desc: 'A frequency heatmap scrolling past: the last seconds of the song, bass at the bottom', tags: 'spectrogram heatmap waterfall frequency history', hist: true, bars: 64, colors: ['#1a0b3d', '#ff3d6a', '#ffe45e'],
      glsl: `vec4 vis(vec2 q) {
  float w = 0.9 * AR(); float hh = 0.16; float x = (q.x + w * 0.5) / w; float y = (q.y + hh) / (2.0 * hh);
  if (x < 0.0 || x > 1.0 || y < 0.0 || y > 1.0) return vec4(0.0);
  float v = histAt(y, 1.0 - x); vec3 c = pal(v) * smoothstep(0.02, 0.35, v);
  return lit(c * (0.25 + v));
}` },
    { id: 'flash', name: 'Beat flash', desc: 'The whole frame flashes on each hit, the color moving through the palette', tags: 'flash strobe beat hit light', listen: 'beat', bars: 32, glow: 0.2, colors: ['#ffffff', '#ffd75e', '#5ce1ff'],
      glsl: `vec4 vis(vec2 q) {
  float k = fract(uHitK * 0.25) * 3.0; vec3 c = k < 1.0 ? uC1 : k < 2.0 ? uC2 : uC3;
  float v = 1.0 - 0.5 * length(q / vec2(AR(), 1.0)) * uGlow;
  float a = clamp(uPulse * uPulse * 0.85 * v, 0.0, 1.0);
  return vec4(c * a, a);
}` },
    { id: 'logo', name: 'Logo bounce', desc: 'Your picture (a logo, a cover) bouncing on the kick, with a glow ring', tags: 'logo picture image cover bounce kick', listen: 'kick', bars: 32, image: true, colors: ['#ffffff', '#ffd75e', '#ff3d6a'],
      glsl: `vec4 vis(vec2 q) {
  float s = 0.32 * (1.0 + 0.16 * uPulse); vec2 c = q - vec2(0.0, 0.025 * uPulse);
  vec2 uv = c / s; uv.x /= max(uImgAsp, 0.01) > 1.0 ? 1.0 : uImgAsp; uv.y *= max(uImgAsp, 0.01) > 1.0 ? uImgAsp : 1.0; uv = uv * 0.5 + 0.5;
  vec4 im = vec4(0.0);
  if (uImgOn > 0.5) { if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) { im = texture(uImg, uv); im.rgb *= im.a; } }
  else { float r = length(c); im = vec4(pal(0.0) * ink(r, s * 0.5) * (0.6 + 0.4 * uPulse), ink(r, s * 0.5)); }
  float rr = length(c) - s * 0.62; vec3 ring = pal(0.5) * (ink(abs(rr), 0.003) * (0.3 + uDrive) + glowF(abs(rr)) * uPulse);
  return vec4(im.rgb + ring * (1.0 - im.a), max(im.a, max(ring.r, max(ring.g, ring.b))));
}` },
  ];
  for (const p of PRESETS) p.defaults = { ...P0, ...(p.listen ? { listen: p.listen } : {}), ...(p.smooth != null ? { smooth: p.smooth } : {}), ...(p.glow != null ? { glow: p.glow } : {}), bars: p.bars };
  const frag = (id) => { const p = PRESETS.find((x) => x.id === id) || PRESETS[0]; return `${HEAD}${p.glsl}\n${MAIN}`; };
  const preset = (q) => { const w = String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); if (!w) return null; return PRESETS.find((p) => p.id === w || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === w) || PRESETS.find((p) => p.id.startsWith(w) || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '').startsWith(w)) || PRESETS.find((p) => `${p.name} ${p.desc} ${p.tags}`.toLowerCase().includes(String(q).toLowerCase().trim())) || null; };
  const hitBand = (listen) => (LISTEN[listen] || LISTEN.whole).hit;
  const hex3 = (h, out, o = 0) => { const n = parseInt(String(h || '#ffffff').slice(1), 16) || 0; out[o] = ((n >> 16) & 255) / 255; out[o + 1] = ((n >> 8) & 255) / 255; out[o + 2] = (n & 255) / 255; return out; };

  return { FPS, NB, TW, HROWS, EDGES, LISTEN, LISTEN_IDS, PRESETS, VERT, HEAD, frag, preset, hitBand, analyzer, analyze, demoTrack, DEMO_HITS, clockHits, state, frame, frameLive, bands, hex3 };
}
const VisCore = hearthVisCore();
// the preview page gets the factory as source (tools/three.js sandboxLib: it runs `(code)()` as a module there)
if (typeof window !== 'undefined') { (window.__sbxLibFn ||= {}).viscore = { toString: () => `function () { const F = (${hearthVisCore}); globalThis.viscore = F(); globalThis.viscore.factory = String(F); }` }; window.VisCore = VisCore; }
if (typeof module !== 'undefined') module.exports = { ...VisCore, factory: hearthVisCore };
