// The editor's preview sound (round 11, pack11): what the compositor (tools/video-comp.js) used to leave silent.
//   · audio-track items (music beds, voice-overs, sound effects files) play in the preview, in step with the clock,
//     with their volume keys, fades, track mute and solo-free mixing (one hidden <audio> per item, like the decoders)
//   · clips with sound effects (EditFX.AUDIO_FX) are heard WITH them: the file's sound is decoded once (Web Audio,
//     from the file's bytes, so file:// origins don't matter) and played through a node chain that mirrors the
//     ffmpeg filters of the render (filters, EQ, compressor, echoes, stereo matrix, LFOs, crushers); the few that have
//     no live twin (pitch keeping the length, gate, denoise) play clean and are named in previewNote()
//   · reversed clips are heard backwards in real time (a reversed copy of the decoded buffer)
// plan(afx) is pure (Node tests): the node specs for a list of effect ids.
const VideoSound = (() => {
  const C = typeof CutData !== 'undefined' ? CutData : null;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const db = (lin) => 20 * Math.log10(Math.max(1e-4, lin));

  // ---------- effect id → node specs (the live twins of cut-presets.js AUDIO_FX) ----------
  const F = (type, f, q = 0.707, gain = 0) => ({ k: 'biquad', type, f, q, gain });
  const COMP = (th, ratio, attack = 0.01, release = 0.2, makeup = 1) => ({ k: 'comp', th: db(th), ratio, attack, release, makeup });
  const GAIN = (g) => ({ k: 'gain', g });
  const TAPS = (inG, outG, delays, decays) => ({ k: 'taps', dry: inG * outG, taps: delays.map((d, i) => [d / 1000, decays[i] * outG * inG]) });
  const MATRIX = (ll, lr, rl, rr) => ({ k: 'matrix', m: [ll, lr, rl, rr] }); // L' = ll·L + lr·R, R' = rl·L + rr·R
  const CRUSH = (bits) => ({ k: 'crush', bits });
  const LFO = (what, hz, depth, extra = {}) => ({ k: 'lfo', what, hz, depth, ...extra });
  const LIVE = {
    voice: [F('highpass', 90), F('peaking', 3000, 1.2, 4), COMP(0.1, 3, 0.005, 0.12)],
    bass: [F('lowshelf', 110, 0.707, 8)],
    treble: [F('highshelf', 6000, 0.707, 6)],
    warm: [F('lowpass', 9000), F('lowshelf', 100, 0.707, 3)],
    lofi: [F('lowpass', 3800), F('highpass', 180), CRUSH(10)],
    radio: [F('highpass', 400), F('lowpass', 3500), COMP(0.08, 6)],
    telephone: [F('highpass', 600), F('lowpass', 2800), GAIN(1.4)],
    underwater: [F('lowpass', 500), GAIN(1.3)],
    echo: [TAPS(0.8, 0.6, [280], [0.4])],
    hall: [TAPS(0.8, 0.7, [40, 70, 110, 170], [0.35, 0.25, 0.18, 0.12])],
    stadium: [TAPS(0.8, 0.85, [120, 240, 400], [0.4, 0.3, 0.2])],
    loud: [COMP(0.063, 4, 0.01, 0.25, 1.6)],
    compress: [COMP(0.125, 4, 0.01, 0.2, 2)],
    level: [COMP(0.03, 3, 0.02, 0.3, 2)],
    limiter: [COMP(0.89, 20, 0.001, 0.05)],
    wide: [MATRIX(1.4, -0.4, -0.4, 1.4)],
    mono: [MATRIX(0.5, 0.5, 0.5, 0.5)],
    'swap-lr': [MATRIX(0, 1, 1, 0)],
    karaoke: [MATRIX(1, -1, -1, 1)],
    'left-only': [MATRIX(1, 0, 1, 0)],
    'right-only': [MATRIX(0, 1, 0, 1)],
    duck: [GAIN(0.25)],
    boost: [GAIN(2)],
    quieter: [GAIN(0.5)],
    'high-cut': [F('lowpass', 4500)],
    'bass-cut': [F('highpass', 120)],
    deess: [F('peaking', 6500, 2, -6)],
    bitcrush: [CRUSH(6)],
    tremolo: [LFO('gain', 6, 0.6)],
    autopan: [LFO('pan', 0.5, 1)],
    flanger: [LFO('delay', 0.4, 0.004, { base: 0.002, mix: 0.7 })],
    chorus: [LFO('delay', 0.25, 0.003, { base: 0.05, mix: 0.4 }), LFO('delay', 0.4, 0.004, { base: 0.06, mix: 0.32 })],
    phaser: [LFO('allpass', 0.6, 1200, { base: 900, stages: 4, mix: 0.5 })],
    'fade-tail': [{ k: 'tail', secs: 1.5 }], // a gain envelope (the clip's last 1.5 s fade out), done in level()
    backwards: [{ k: 'reverse' }], // the buffer plays backwards
  };
  // no live twin: heard in the render, clean in the preview
  const RENDER_ONLY = new Set(['pitch-up', 'pitch-down', 'gate', 'denoise']);
  function plan(afx = []) {
    const specs = []; const skipped = [];
    for (const id of afx || []) {
      if (LIVE[id]) specs.push(...LIVE[id].map((s) => ({ ...s, id })));
      else skipped.push(id);
    }
    return { specs, skipped, reverse: specs.filter((s) => s.k === 'reverse').length % 2 === 1, tail: specs.find((s) => s.k === 'tail')?.secs || 0 };
  }
  const previewNote = (afx = []) => { const s = plan(afx).skipped.filter((id) => RENDER_ONLY.has(id) || !LIVE[id]); return s.length ? `${s.join(', ')}: heard in the render only` : ''; };

  if (typeof window === 'undefined') return { plan, previewNote, LIVE, RENDER_ONLY };

  // ---------- the live engine ----------
  let host = null; // { fileUrl, wrap }
  let ctx = null; let master = null;
  const buffers = new Map(); // src → { p: Promise, buf: AudioBuffer|null, rev: AudioBuffer|null, failed }
  const voices = new Map(); // clip / item id → { src, node, gain, chain, t0 (ctx time), off (buffer offset), rate, rev }
  const els = new Map(); // audio item id → { el, src }
  const MAX_BYTES = 400 * 1048576;
  let enabled = true;
  try { enabled = store.get('video.previewSound', true) !== false; } catch { /* default on */ }

  function audio() {
    if (ctx) return ctx;
    ctx = new AudioContext({ latencyHint: 'playback' });
    master = ctx.createGain(); master.connect(ctx.destination);
    return ctx;
  }
  function attach(h) { host = h; }
  // the decoded sound of a file (once): bytes from disk, decoded by Web Audio
  function bufferOf(src) {
    let b = buffers.get(src);
    if (b) return b;
    b = { buf: null, rev: null, failed: false };
    b.p = (async () => {
      try {
        const st = await window.hub.fs.stat(src).catch(() => null);
        if (st && st.size > MAX_BYTES) throw new Error('too big to decode for the preview');
        const u8 = await window.hub.fs.read(src, { encoding: 'buffer', maxBytes: MAX_BYTES });
        const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        b.buf = await audio().decodeAudioData(ab);
      } catch { b.failed = true; }
      return b;
    })();
    buffers.set(src, b);
    return b;
  }
  function reversedOf(b) {
    if (b.rev || !b.buf) return b.rev;
    const s = b.buf; const r = ctx.createBuffer(s.numberOfChannels, s.length, s.sampleRate);
    for (let ch = 0; ch < s.numberOfChannels; ch += 1) { const a = s.getChannelData(ch); const o = r.getChannelData(ch); for (let i = 0, n = a.length; i < n; i += 1) o[i] = a[n - 1 - i]; }
    b.rev = r;
    return r;
  }
  // Does the live engine (not the decoder's own <video> sound) play this clip? Sound effects or reverse, sound on.
  const wants = (c) => enabled && (c.kind === 'video' || c.kind === 'audio') && Boolean(c.afx?.length || c.reverse);
  const owns = (c) => wants(c) && !buffers.get(c.src)?.failed;

  // one node chain for a plan; returns { input, output, stop() }
  function buildChain(p) {
    const a = audio();
    const input = a.createGain(); let cur = input; const extra = [];
    const pipe = (n) => { cur.connect(n); cur = n; return n; };
    for (const s of p.specs) {
      if (s.k === 'biquad') { const n = a.createBiquadFilter(); n.type = s.type; n.frequency.value = s.f; n.Q.value = s.q; n.gain.value = s.gain; pipe(n); }
      if (s.k === 'gain') { const n = a.createGain(); n.gain.value = s.g; pipe(n); }
      if (s.k === 'comp') {
        const n = a.createDynamicsCompressor(); n.threshold.value = clamp(s.th, -100, 0); n.ratio.value = clamp(s.ratio, 1, 20); n.attack.value = s.attack; n.release.value = s.release; n.knee.value = 6; pipe(n);
        if (s.makeup !== 1) { const m = a.createGain(); m.gain.value = s.makeup; pipe(m); }
      }
      if (s.k === 'taps') {
        const out = a.createGain(); const dry = a.createGain(); dry.gain.value = s.dry; cur.connect(dry); dry.connect(out);
        for (const [d, g] of s.taps) { const dl = a.createDelay(2); dl.delayTime.value = d; const tg = a.createGain(); tg.gain.value = g; cur.connect(dl); dl.connect(tg); tg.connect(out); }
        cur = out;
      }
      if (s.k === 'matrix') {
        const sp = a.createChannelSplitter(2); const mg = a.createChannelMerger(2); const [ll, lr, rl, rr] = s.m;
        const up = a.createGain(); up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers';
        pipe(up); cur.connect(sp);
        for (const [from, to, g] of [[0, 0, ll], [1, 0, lr], [0, 1, rl], [1, 1, rr]]) { if (!g) continue; const x = a.createGain(); x.gain.value = g; sp.connect(x, from); x.connect(mg, 0, to); }
        cur = mg;
      }
      if (s.k === 'crush') {
        const n = a.createWaveShaper(); const steps = 2 ** s.bits; const len = 4096; const curve = new Float32Array(len);
        for (let i = 0; i < len; i += 1) { const x = (i / (len - 1)) * 2 - 1; curve[i] = Math.round(x * steps / 2) / (steps / 2); }
        n.curve = curve; pipe(n);
      }
      if (s.k === 'lfo') {
        const osc = a.createOscillator(); osc.frequency.value = s.hz; const depth = a.createGain(); osc.connect(depth); osc.start(); extra.push(osc);
        if (s.what === 'gain') { const g = a.createGain(); g.gain.value = 1 - s.depth / 2; depth.gain.value = s.depth / 2; depth.connect(g.gain); pipe(g); }
        if (s.what === 'pan') { const pn = a.createStereoPanner(); depth.gain.value = s.depth; depth.connect(pn.pan); pipe(pn); }
        if (s.what === 'delay' || s.what === 'allpass') {
          const out = a.createGain(); const dry = a.createGain(); dry.gain.value = 1 - s.mix * 0.5; cur.connect(dry); dry.connect(out);
          let w = cur;
          if (s.what === 'delay') { const dl = a.createDelay(1); dl.delayTime.value = s.base; depth.gain.value = s.depth; depth.connect(dl.delayTime); w.connect(dl); w = dl; } else {
            depth.gain.value = s.depth;
            for (let i = 0; i < (s.stages || 4); i += 1) { const ap = a.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = s.base; depth.connect(ap.frequency); w.connect(ap); w = ap; }
          }
          const wet = a.createGain(); wet.gain.value = s.mix; w.connect(wet); wet.connect(out);
          cur = out;
        }
      }
    }
    return { input, output: cur, stop: () => { for (const o of extra) { try { o.stop(); } catch { /* stopped */ } } } };
  }

  // the level of a layer at T (volume keys × fades × the program volume), plus the effects' tail fade
  function level(L, T, vol, p) {
    const c = L.clip; const local = clamp(T - L.start, 0, L.end - L.start); const d = L.end - L.start;
    let g = 1;
    if (c.fadeIn > 0 && local < c.fadeIn) g = Math.min(g, local / c.fadeIn);
    if (c.fadeOut > 0 && d - local < c.fadeOut) g = Math.min(g, (d - local) / c.fadeOut);
    if (p?.tail > 0 && d - local < p.tail) g = Math.min(g, (d - local) / p.tail);
    return clamp(vol * (C ? C.propAt(c, 'volume', local) : c.volume ?? 1) * clamp(g, 0, 1), 0, 4);
  }
  const srcAt = (c, local) => (C ? C.srcAt(c, local) : c.in + local);
  // every layer with sound: main-track clips, video-track items, audio-track items
  function soundLayers(e) {
    const out = C.layout(e).map((x) => ({ clip: x.clip, start: x.start, end: x.end, where: 'main', track: null }));
    for (const k of e.tracks || []) {
      if (k.type !== 'video' && k.type !== 'audio') continue;
      for (const it of k.items) out.push({ clip: it, start: it.start, end: C.itemEnd(it), where: 'item', track: k });
    }
    return out;
  }

  const keyOf = (c) => `${c.src}|${c.in}|${c.out}|${c.reverse ? 1 : 0}|${(c.afx || []).join('+')}|${c.speed || 1}`;
  function startVoice(L, T, rate, vol) {
    const c = L.clip; const b = buffers.get(c.src);
    if (!b?.buf) return null;
    const a = audio();
    if (a.state === 'suspended') a.resume().catch(() => {});
    const p = plan(c.afx);
    const back = Boolean(c.reverse) !== p.reverse; // backwards: the clip reversed, or the Backwards effect (both = forward)
    const buf = back ? reversedOf(b) : b.buf;
    const local = clamp(T - L.start, 0, L.end - L.start);
    const s = srcAt(c, local); // the picture's source seconds (reverse clips count down)
    const snd = p.reverse ? c.in + c.out - s : s; // the Backwards effect turns the clip's own part around
    const off = back ? b.buf.duration - snd : snd;
    const node = a.createBufferSource(); node.buffer = buf;
    const r = Math.abs((c.speed || 1) * rate) || 1; node.playbackRate.value = r;
    const chain = buildChain(p); const gain = a.createGain(); gain.gain.value = level(L, T, vol, p);
    node.connect(chain.input); chain.output.connect(gain); gain.connect(master);
    const remain = Math.max(0.05, (L.end - T) * (c.speed || 1));
    try { node.start(0, clamp(off, 0, buf.duration - 0.01), remain); } catch { return null; }
    return { src: c.src, node, gain, chain, t0: a.currentTime, off, rate: r, plan: p, key: keyOf(c) };
  }
  function stopVoice(id) {
    const v = voices.get(id); if (!v) return;
    voices.delete(id);
    try { v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01); v.node.stop(ctx.currentTime + 0.05); } catch { /* stopped */ }
    setTimeout(() => { try { v.node.disconnect(); v.gain.disconnect(); v.chain.stop(); } catch { /* gone */ } }, 120);
  }
  function elOf(it) {
    let d = els.get(it.id);
    if (d && d.src === it.src) return d;
    if (!d) { const a = document.createElement('audio'); a.preload = 'auto'; a.className = 'vr-pdeck'; host?.wrap?.append(a); d = { el: a, src: null }; els.set(it.id, d); }
    d.src = it.src; d.el.src = host.fileUrl(it.src);
    return d;
  }
  // Keep every sound of the program in step with the clock at T (called by the compositor each frame).
  function sync(e, T, { hard = false, rate = 1, vol = 1, playing = true } = {}) {
    if (!e || !C || !host) return;
    const liveV = new Set(); const liveE = new Set();
    for (const L of soundLayers(e)) {
      const c = L.clip;
      if ((c.kind !== 'video' && c.kind !== 'audio') || !c.src) continue;
      const visible = T >= L.start - 1e-6 && T < L.end;
      const soon = L.start > T && L.start - T < 1;
      const muted = c.mute || c.off || L.track?.mute;
      if (wants(c)) {
        const b = bufferOf(c.src);
        if (b.failed || !visible || muted || !playing) continue;
        if (!b.buf) continue; // still decoding: silent for a moment (the decoder stays muted)
        liveV.add(c.id);
        let v = voices.get(c.id);
        if (v && (hard || v.key !== keyOf(c) || Math.abs(v.rate - Math.abs((c.speed || 1) * rate)) > 1e-3)) { stopVoice(c.id); v = null; }
        if (!v) { v = startVoice(L, T, rate, vol); if (v) voices.set(c.id, v); continue; }
        const g = level(L, T, vol, v.plan);
        v.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.015);
        continue;
      }
      // plain audio items: a hidden <audio> each (video clips keep their decoder's own sound)
      if (L.where !== 'item' || c.kind !== 'audio') continue;
      if (!visible && !soon) continue;
      liveE.add(c.id);
      const d = elOf(c);
      if (d.el.readyState < 1) continue;
      const want = srcAt(c, clamp(T - L.start, 0, L.end - L.start));
      if (soon || !playing) { if (!d.el.paused) d.el.pause(); if (Math.abs(d.el.currentTime - want) > 0.05 && !d.el.seeking) d.el.currentTime = soon ? srcAt(c, 0) : want; continue; }
      const v = muted ? 0 : clamp(level(L, T, vol, null), 0, 1);
      if (Math.abs(d.el.volume - v) > 0.01) d.el.volume = v;
      const r = (c.speed || 1) * rate;
      if (d.el.playbackRate !== r) { d.el.playbackRate = r; d.el.preservesPitch = true; }
      const drift = Math.abs(d.el.currentTime - want);
      if (d.el.paused) { if (drift > 0.03) d.el.currentTime = want; d.el.play().catch(() => {}); } else if ((hard || drift > 0.12) && !d.el.seeking) d.el.currentTime = want;
    }
    for (const id of [...voices.keys()]) if (!liveV.has(id)) stopVoice(id);
    for (const [id, d] of els) if (!liveE.has(id) && !d.el.paused) d.el.pause();
  }
  function pause() {
    for (const id of [...voices.keys()]) stopVoice(id);
    for (const d of els.values()) if (!d.el.paused) d.el.pause();
  }
  function forget() { pause(); for (const d of els.values()) { d.el.removeAttribute('src'); d.el.load(); d.el.remove(); } els.clear(); buffers.clear(); }
  // the program's sound for a recording (VideoComp.record): the live engine's mix + the audio items
  function recordTracks() {
    const out = [];
    try {
      const a = audio(); const dest = a.createMediaStreamDestination(); master.connect(dest);
      for (const d of els.values()) { try { const s = d.el.captureStream?.(); if (s?.getAudioTracks().length) a.createMediaStreamSource(s).connect(dest); } catch { /* not capturable */ } }
      out.push(...dest.stream.getAudioTracks());
    } catch { /* video only */ }
    return out;
  }
  function setEnabled(on) { enabled = on ?? !enabled; try { store.set('video.previewSound', enabled); } catch { /* session only */ } if (!enabled) pause(); return enabled; }
  // decode ahead the sounds of an edit (opening it / adding a sound effect), so the first play is heard
  function warm(e) { if (!e || !C) return 0; let n = 0; for (const L of soundLayers(e)) if (wants(L.clip)) { bufferOf(L.clip.src); n += 1; } return n; }
  function status() { return { enabled, state: ctx?.state || "none", gains: [...voices.values()].map((v) => Number(v.gain.gain.value.toFixed(3))), voices: voices.size, items: [...els.values()].filter((d) => !d.el.paused).length, decoded: [...buffers.values()].filter((b) => b.buf).length, failed: [...buffers.entries()].filter(([, b]) => b.failed).map(([s]) => s) }; }

  // the engine's output level right now (0…1 RMS): checks hear that something plays (an analyser made on first ask)
  let meter = null;
  function outputLevel() { if (!ctx) return 0; if (!meter) { meter = ctx.createAnalyser(); meter.fftSize = 2048; master.connect(meter); } const d = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(d); let s0 = 0; for (const v of d) s0 += v * v; return Math.sqrt(s0 / d.length); }
  return { attach, sync, pause, forget, owns, wants, warm, plan, previewNote, recordTracks, setEnabled, status, bufferOf, level: outputLevel, LIVE, RENDER_ONLY, get enabled() { return enabled; } };
})();
if (typeof module !== 'undefined') module.exports = VideoSound;
