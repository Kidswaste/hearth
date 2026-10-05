// Three.js Lab media: loads an mp3/mp4 for audio-reactive sketches, analyzes it (tempo, beats, drops,
// energy per band), shows a clickable overview with play controls, frames the preview at exact output
// sizes (1080×1920…) and records the canvas with its audio to a video file.
const ThreeMedia = (() => {
  const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'];
  const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v', 'mkv'];
  const MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska' };
  const SIZES = [
    { id: 'fit', label: 'Fit', title: 'Fill the preview at any size' },
    { id: '9:16', w: 1080, h: 1920, label: '9:16', title: '1080×1920: Shorts, Reels, TikTok' },
    { id: '16:9', w: 1920, h: 1080, label: '16:9', title: '1920×1080: YouTube' },
    { id: '1:1', w: 1080, h: 1080, label: '1:1', title: '1080×1080: square' },
    { id: '4:5', w: 1080, h: 1350, label: '4:5', title: '1080×1350: Instagram feed' },
  ];
  const extOf = (p) => (p.split('.').pop() || '').toLowerCase();
  const isMedia = (p) => [...AUDIO_EXT, ...VIDEO_EXT].includes(extOf(p));
  const fmtTime = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  const base = (p) => p.split(/[\\/]/).pop();

  // ---------- analysis ----------
  // Decodes the audio at 22 kHz, splits it into bass (<150 Hz), mids (150–2000 Hz) and highs (>2 kHz),
  // measures loudness 100× a second, then finds onsets, the tempo (autocorrelation), the beats
  // (dynamic-programming beat tracker) and loud/quiet sections and drops.
  async function analyze(bytes) {
    const SR = 22050;
    const decoded = await new OfflineAudioContext(1, 1, SR).decodeAudioData(bytes.slice(0));
    const len = decoded.length;
    const render = async (build) => {
      const ctx = new OfflineAudioContext(1, len, SR);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      build(ctx, src).connect(ctx.destination);
      src.start();
      return (await ctx.startRendering()).getChannelData(0);
    };
    const biquad = (ctx, type, f) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; return b; };
    const chain = (ctx, src, ...nodes) => { let n = src; for (const x of nodes) { n.connect(x); n = x; } return n; };
    const [mono, low, mid, high] = await Promise.all([
      render((c, s) => s),
      render((c, s) => chain(c, s, biquad(c, 'lowpass', 150), biquad(c, 'lowpass', 150))),
      render((c, s) => chain(c, s, biquad(c, 'highpass', 150), biquad(c, 'lowpass', 2000))),
      render((c, s) => chain(c, s, biquad(c, 'highpass', 2000))),
    ]);
    const HOP = Math.round(SR / 100);
    const N = Math.floor(len / HOP);
    const env = (d) => {
      const o = new Float32Array(N);
      for (let f = 0; f < N; f += 1) { let s = 0; const a = f * HOP; for (let k = 0; k < HOP; k += 1) { const x = d[a + k]; s += x * x; } o[f] = Math.sqrt(s / HOP); }
      return o;
    };
    const norm = (a) => {
      const p = Float32Array.from(a).sort()[Math.floor(a.length * 0.98)] || 1;
      for (let i = 0; i < a.length; i += 1) a[i] = Math.min(1, a[i] / p);
      return a;
    };
    const L = norm(env(mono)); const B = norm(env(low)); const M = norm(env(mid)); const T = norm(env(high));
    // Waveform peaks 100× a second, for the zoomed-in timeline.
    const PK = new Float32Array(N);
    for (let f = 0; f < N; f += 1) { let m = 0; const a = f * HOP; for (let k = 0; k < HOP; k += 1) { const x = Math.abs(mono[a + k]); if (x > m) m = x; } PK[f] = m; }
    { let mx = 0; for (let f = 0; f < N; f += 1) mx = Math.max(mx, PK[f]); for (let f = 0; f < N; f += 1) PK[f] /= mx || 1; } // true peaks: scale by the loudest
    const movingAvg = (a, w) => {
      const o = new Float32Array(a.length); let s = 0;
      for (let i = 0; i < a.length; i += 1) { s += a[i]; if (i >= w) s -= a[i - w]; o[i] = s / Math.min(i + 1, w); }
      // centre the window
      const c = new Float32Array(a.length); const h = Math.floor(w / 2);
      for (let i = 0; i < a.length; i += 1) c[i] = o[Math.min(a.length - 1, i + h)];
      return c;
    };
    // Onsets: rises in each band, minus the local average.
    const raw = new Float32Array(N);
    for (let f = 1; f < N; f += 1) raw[f] = Math.max(0, B[f] - B[f - 1]) + 0.5 * Math.max(0, M[f] - M[f - 1]) + 0.25 * Math.max(0, T[f] - T[f - 1]) + 0.5 * Math.max(0, L[f] - L[f - 1]);
    const localMean = movingAvg(raw, 30);
    const on = new Float32Array(N);
    let sd = 0;
    for (let f = 0; f < N; f += 1) { on[f] = Math.max(0, raw[f] - localMean[f]); sd += on[f] * on[f]; }
    sd = Math.sqrt(sd / N) || 1;
    for (let f = 0; f < N; f += 1) on[f] /= sd;
    // Tempo: autocorrelation of the onsets, preferring tempos near 120 bpm.
    const scores = [];
    let bestLag = 50; let best = -1;
    for (let lag = 25; lag <= 120; lag += 1) {
      let s = 0;
      for (let i = 0; i + lag < N; i += 1) s += on[i] * on[i + lag];
      const bpm = 6000 / lag;
      scores[lag] = s * Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
      if (scores[lag] > best) { best = scores[lag]; bestLag = lag; }
    }
    const y0 = scores[bestLag - 1] ?? best; const y2 = scores[bestLag + 1] ?? best;
    const den = y0 - 2 * best + y2;
    const period = bestLag + (den ? Math.max(-0.5, Math.min(0.5, (y0 - y2) / (2 * den))) : 0);
    const bpm = Math.round((6000 / period) * 10) / 10;
    // Beats: the best chain of onsets spaced about one period apart (Ellis 2007).
    const score = new Float32Array(N);
    const back = new Int32Array(N).fill(-1);
    for (let t = 0; t < N; t += 1) {
      let bs = 0; let bp = -1;
      const lo = Math.max(0, Math.round(t - 2 * period)); const hi = Math.round(t - period / 2);
      for (let p = lo; p <= hi; p += 1) { const r = Math.log((t - p) / period); const s = score[p] - 100 * r * r; if (bp < 0 || s > bs) { bs = s; bp = p; } }
      score[t] = on[t] + (bp >= 0 ? bs : 0);
      back[t] = bp;
    }
    let t = N - 1;
    for (let k = Math.max(0, Math.floor(N - period)); k < N; k += 1) if (score[k] > score[t]) t = k;
    const beatFrames = [];
    while (t >= 0) { beatFrames.push(t); t = back[t]; }
    beatFrames.reverse();
    const beats = beatFrames.map((f) => Math.round(f) / 100);
    // Sections: loudness over ~3 s, split into quiet / medium / loud, short pieces merged away.
    const E = movingAvg(L, 300);
    const sorted = Float32Array.from(E).sort();
    const qLo = sorted[Math.floor(N * 0.35)]; const qHi = sorted[Math.floor(N * 0.72)];
    const lvl = (x) => (x >= qHi ? 'loud' : x <= qLo ? 'quiet' : 'medium');
    let sections = [];
    for (let f = 0; f < N; f += 50) {
      const e = lvl(E[f]);
      const last = sections[sections.length - 1];
      if (last && last.energy === e) last.end = (f + 50) / 100; else sections.push({ start: f / 100, end: (f + 50) / 100, energy: e });
    }
    for (let pass = 0; pass < 3; pass += 1) {
      const merged = [];
      for (const s of sections) {
        const last = merged[merged.length - 1];
        if (last && (s.end - s.start < 4 || last.energy === s.energy)) last.end = s.end; else merged.push({ ...s });
      }
      sections = merged;
    }
    const duration = decoded.duration;
    if (sections.length) sections[sections.length - 1].end = Math.round(duration * 10) / 10;
    const drops = sections.filter((s, i) => i > 0 && s.energy === 'loud' && sections[i - 1].energy !== 'loud').map((s) => s.start);
    // 30 fps envelopes for sketches (audio.analysis.bass[Math.floor(t * 30)]) and the overview.
    const FPS = 30;
    const down = (a) => { const n = Math.floor((N * FPS) / 100); const o = new Array(n); for (let i = 0; i < n; i += 1) { const s = Math.floor((i * 100) / FPS); const e = Math.floor(((i + 1) * 100) / FPS); let m = 0; for (let k = s; k < e; k += 1) m = Math.max(m, a[k]); o[i] = Math.round(m * 1000) / 1000; } return o; };
    return { duration, bpm, beats, drops, sections: sections.map((s) => ({ ...s, start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10 })), fps: FPS, level: down(L), bass: down(B), mid: down(M), treble: down(T), peaks: Array.from(PK, (x) => Math.round(x * 100) / 100) };
  }

  // ---------- frame sizes ----------
  // Exact sizes render the sketch at that many pixels (1 device pixel each) and scale it to fit.
  function stage(host, frame, { onChange }) {
    let mode = store.get('three.aspect', 'fit');
    let safe = store.get('three.safeZones', true);
    const buttons = SIZES.map((s) => el('button', { class: 'stage-btn', text: s.label, title: s.title, on: { click: () => setMode(s.id) } }));
    const safeBtn = el('button', { class: 'stage-btn', text: 'Safe zones', title: 'Show where Shorts / Reels / TikTok put the title, captions and buttons', on: { click: () => { safe = !safe; store.set('three.safeZones', safe); layout(); } } });
    const sizeLabel = el('span', { class: 'stage-size' });
    const pill = el('div', { class: 'stage-pill' }, ...buttons, safeBtn, sizeLabel);
    const zones = el('div', { class: 'safe-zones', hidden: true },
      el('div', { class: 'sz top', text: 'Title / status bar' }), el('div', { class: 'sz bottom', text: 'Captions and channel name' }), el('div', { class: 'sz right', text: 'Buttons' }));
    host.append(pill, zones);
    const current = () => SIZES.find((s) => s.id === mode) || SIZES[0];
    function layout() {
      const s = current();
      buttons.forEach((b, i) => b.classList.toggle('on', SIZES[i].id === mode));
      safeBtn.hidden = mode !== '9:16';
      safeBtn.classList.toggle('on', safe);
      host.classList.toggle('exact', Boolean(s.w));
      if (!s.w) {
        frame.style.cssText = '';
        zones.hidden = true;
        sizeLabel.textContent = `${host.clientWidth}×${host.clientHeight}`;
        return;
      }
      const W = host.clientWidth; const H = host.clientHeight;
      const k = Math.min(W / s.w, H / s.h);
      const left = (W - s.w * k) / 2; const top = (H - s.h * k) / 2;
      frame.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${s.w}px;height:${s.h}px;transform:scale(${k});transform-origin:0 0;`;
      Object.assign(zones.style, { left: `${left}px`, top: `${top}px`, width: `${s.w * k}px`, height: `${s.h * k}px` });
      zones.hidden = !(safe && mode === '9:16');
      sizeLabel.textContent = `${s.w}×${s.h} · ${Math.round(k * 100)}%`;
    }
    function setMode(id) {
      const wasExact = Boolean(current().w);
      mode = id;
      store.set('three.aspect', id);
      layout();
      onChange?.({ reload: wasExact !== Boolean(current().w) }); // device-pixel override needs a reload
    }
    new ResizeObserver(layout).observe(host);
    layout();
    return {
      get params() { return current().w ? '&dpr=1' : ''; },
      get size() { const s = current(); return s.w ? { id: s.id, width: s.w, height: s.h } : { id: 'fit', width: host.clientWidth, height: host.clientHeight }; },
      setMode,
      sizes: SIZES.map((s) => s.id),
    };
  }

  // ---------- player ----------
  // send(msg) → sandbox; sketchName() for recording file names; onLoaded() after a new file is ready.
  // The timeline zooms (wheel / ＋ −), scrolls (bar underneath or Shift+wheel), and holds A–B loop
  // points (drag along the top strip, Set start / Set end, double-click a section) that snap to beats
  // and can be locked so neither the loop nor the view moves by accident.
  function player({ send, sketchName, onLoaded }) {
    const st = { path: null, name: null, bytes: null, mime: null, video: false, analysis: null, time: 0, duration: 0, playing: false, loop: store.get('three.mediaLoop', true), volume: store.get('three.mediaVolume', 0.8), stampAt: 0 };
    let region = null; // { a, b } seconds
    let locked = false;
    let snap = store.get('three.loopSnap', true);
    let view = null; // { start, end } seconds when zoomed in, null = whole track
    let recording = null; // { kind, startedAt }
    let analyzing = false;
    let dragging = null; // timeline drag in progress
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    const loadBtn = btn('🎵 Load audio / video…', 'Pick an mp3, wav, mp4… to drive the sketch (or drop one on the preview)', () => pick());
    const nameEl = el('span', { class: 'mb-name' });
    const unloadBtn = btn('×', 'Remove the music (sketches get a demo beat)', () => unload(), 'ghost small mb-x');
    const playBtn = btn('▶', 'Play / pause (Space)', () => toggle(), 'primary small mb-play');
    const timeEl = el('span', { class: 'mb-time', text: '0:00' });
    const zoomOut = btn('－', 'Zoom out (or scroll the mouse wheel on the timeline)', () => zoomBy(1.6));
    const zoomIn = btn('＋', 'Zoom in (or scroll the mouse wheel on the timeline)', () => zoomBy(1 / 1.6));
    const zoomAll = btn('Whole song', 'Show the whole song', () => setView(null));
    const zoomLoop = btn('Fit loop', 'Zoom to the loop', () => fitLoop());
    const loopBtn = btn('⟲ Loop', 'Loop playback: the loop section if you set one, otherwise the whole song', () => { st.loop = !st.loop; store.set('three.mediaLoop', st.loop); send({ type: 'media', cmd: 'loop', value: st.loop }); paint(); });
    const setA = btn('[ Start', 'Set the loop start at the playhead', () => setRegionEdge('a', now()));
    const setB = btn('End ]', 'Set the loop end at the playhead', () => setRegionEdge('b', now()));
    const clearBtn = btn('✕', 'Remove the loop points', () => setRegion(null));
    const snapBox = el('input', { type: 'checkbox', checked: snap });
    snapBox.addEventListener('change', () => { snap = snapBox.checked; store.set('three.loopSnap', snap); });
    const snapLabel = el('label', { class: 'check small', title: 'Loop points land exactly on beats' }, snapBox, 'Snap to beats');
    const lockBtn = btn('🔓', 'Lock the loop and the view in place', () => setLocked(!locked));
    const vol = el('input', { type: 'range', class: 'mb-vol', min: 0, max: 1, step: 0.01, value: st.volume, title: 'Volume (the sketch still sees the full signal)' });
    vol.addEventListener('input', () => { st.volume = Number(vol.value); store.set('three.mediaVolume', st.volume); send({ type: 'media', cmd: 'volume', value: st.volume }); });
    const bpmEl = el('span', { class: 'mb-bpm' });
    const recBtn = btn('⏺ Record', 'Record the preview (with the music) to a video file', (e) => (recording ? stopRecord() : recordMenu(e.currentTarget)), 'ghost small mb-rec');
    const canvas = el('canvas', { class: 'mb-timeline' });
    const scrollThumb = el('div', { class: 'mb-thumb' });
    const scrollbar = el('div', { class: 'mb-scroll', title: 'Drag to move along the song' }, scrollThumb);
    const loopInfo = el('span', { class: 'mb-loopinfo' });
    const sep = () => el('span', { class: 'mb-sep' });
    const bar = el('div', { class: 'media-bar' },
      el('div', { class: 'mb-row' }, loadBtn, nameEl, unloadBtn, playBtn, timeEl, sep(), zoomOut, zoomIn, zoomAll, zoomLoop, sep(), loopBtn, setA, setB, clearBtn, snapLabel, lockBtn, loopInfo, el('span', { class: 'spacer' }), vol, bpmEl, recBtn),
      canvas, scrollbar);

    async function pick() {
      const [p] = await window.hub.openDialog({ title: 'Music or video for the sketch', filters: [{ name: 'Audio and video', extensions: [...AUDIO_EXT, ...VIDEO_EXT] }] });
      if (p) load(p);
    }
    const loopKey = (p) => `three.loop:${p}`;
    async function load(path, { startAt = 0, quiet = false } = {}) {
      if (!isMedia(path)) { toast(`${base(path)} isn't an audio or video file`, { type: 'error' }); return { ok: false, error: 'Not an audio/video file' }; }
      let bytes;
      try {
        const u8 = await window.hub.fs.read(path, { encoding: 'buffer', maxBytes: 2 * 1024 ** 3 });
        bytes = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      } catch (err) { if (!quiet) toast(`Couldn't open ${base(path)}: ${err.message}`, { type: 'error' }); return { ok: false, error: err.message }; }
      Object.assign(st, { path, name: base(path), bytes, mime: MIME[extOf(path)], video: VIDEO_EXT.includes(extOf(path)), analysis: null, time: startAt, duration: 0, playing: false });
      // Loop points and lock are remembered per file.
      const saved = store.get(loopKey(path), null);
      region = saved?.a != null ? { a: saved.a, b: saved.b } : null;
      locked = Boolean(saved?.locked && region);
      view = locked ? padded(region) : null;
      store.set('three.media', path);
      analyzing = true;
      paint();
      attach({ playing: false });
      try { st.analysis = await analyze(bytes); } catch (err) { st.analysis = null; if (!quiet) toast(st.video ? `${st.name} has no audio track to analyze (it still works as a video texture)` : `Couldn't analyze ${st.name}: ${err.message}`, { type: 'error' }); }
      analyzing = false;
      if (st.analysis) { st.duration = st.analysis.duration; send({ type: 'media-analysis', analysis: st.analysis }); }
      paint();
      onLoaded?.();
      return { ok: true };
    }
    function unload() {
      Object.assign(st, { path: null, name: null, bytes: null, analysis: null, time: 0, duration: 0, playing: false });
      region = null; locked = false; view = null;
      store.set('three.media', null);
      paint();
      onLoaded?.({ reload: true });
    }
    // (Re)sends the file to the sandbox; called after every full reload of the preview.
    function attach({ playing = st.playing } = {}) {
      if (!st.bytes) return;
      send({ type: 'media-load', buffer: st.bytes.slice(0), mime: st.mime, video: st.video, name: st.name, startAt: st.time, playing, loop: st.loop, volume: st.volume, analysis: st.analysis, region });
    }
    function toggle(force) {
      if (!st.bytes) { pick(); return; }
      const play = force ?? !st.playing;
      send({ type: 'media', cmd: play ? 'play' : 'pause' });
    }
    function seek(t) {
      st.time = Math.max(0, Math.min(t, st.duration || t));
      st.stampAt = performance.now();
      send({ type: 'media', cmd: 'seek', value: st.time });
      paint();
    }
    function onMessage(msg) {
      if (msg.type === 'media-state') {
        Object.assign(st, { time: msg.time, duration: msg.duration || st.duration, playing: msg.playing, stampAt: performance.now() });
        if (recording && !recording.stopping && msg.ended && recording.kind === 'track') stopRecord();
        if (recording && !recording.stopping && !msg.playing && recording.kind === 'loop') finishRecord(); // the sandbox stopped exactly at the loop end
        paint();
      }
      if (msg.type === 'record-started') { if (recording) { recording.mime = msg.mime; recording.size = `${msg.width}×${msg.height}`; } paint(); }
      if (msg.type === 'record-error') { recording = null; toast(`Can't record: ${msg.message}`, { type: 'error' }); paint(); }
      if (msg.type === 'recording') saveRecording(msg);
    }

    // ---------- loop points ----------
    const beatsList = () => st.analysis?.beats || [];
    function snapT(t) {
      if (!snap || !beatsList().length) return t;
      const bs = beatsList();
      let lo = 0; let hi = bs.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bs[m] < t) lo = m; else hi = m; }
      return Math.abs(bs[lo] - t) <= Math.abs(bs[hi] - t) ? bs[lo] : bs[hi];
    }
    function setRegion(r, { persist = true } = {}) {
      if (locked && persist) { toast('The loop is locked: press 🔒 to unlock it', { timeout: 2000 }); return; }
      region = r && r.b - r.a >= 0.05 ? { a: Math.max(0, r.a), b: Math.min(st.duration || r.b, r.b) } : null;
      send({ type: 'media', cmd: 'region', value: region });
      if (!region && locked) locked = false;
      saveLoop();
      paint();
    }
    function setRegionEdge(edge, t) {
      if (!st.duration) return;
      const x = snapT(t);
      const r = region ? { ...region } : { a: edge === 'a' ? x : 0, b: edge === 'b' ? x : st.duration };
      r[edge] = x;
      if (r.b < r.a) [r.a, r.b] = [r.b, r.a];
      setRegion(r);
    }
    function setLocked(on) {
      if (on && !region) { toast('Set loop points first (drag along the top of the timeline)', { timeout: 2500 }); return; }
      locked = on;
      if (locked) { view = padded(region); if (!st.loop) { st.loop = true; store.set('three.mediaLoop', true); send({ type: 'media', cmd: 'loop', value: true }); } }
      saveLoop();
      paint();
    }
    const saveLoop = () => { if (st.path) store.set(loopKey(st.path), region ? { ...region, locked } : null); };
    const padded = (r) => { const pad = Math.max(0.25, (r.b - r.a) * 0.06); return { start: Math.max(0, r.a - pad), end: Math.min(st.duration || r.b + pad, r.b + pad) }; };

    // ---------- zoom ----------
    const span = () => (view ? view.end - view.start : st.duration || 1);
    const v0 = () => (view ? view.start : 0);
    function setView(v) {
      if (locked) return;
      const D = st.duration;
      if (!v || !D || v.end - v.start >= D * 0.999) { view = null; paint(); return; }
      const len = Math.max(0.5, Math.min(D, v.end - v.start));
      let start = Math.max(0, Math.min(D - len, v.start));
      view = { start, end: start + len };
      paint();
    }
    function zoomBy(f, at) {
      if (!st.duration || locked) return;
      const c = at ?? (now() >= v0() && now() <= v0() + span() ? now() : v0() + span() / 2);
      const len = span() * f;
      const k = (c - v0()) / span();
      setView({ start: c - len * k, end: c - len * k + len });
    }
    function fitLoop() { if (region && !locked) setView(padded(region)); }

    // ---------- recording ----------
    function recordMenu(anchor) {
      const opt = (label, hint, fn) => el('button', { class: 'menu-item', on: { click: () => { menu.remove(); fn(); } } }, el('b', { text: label }), el('span', { class: 'hint', text: hint }));
      const menu = el('div', { class: 'mb-menu' },
        region && st.bytes ? opt('The loop', `${fmtTime(region.a)} → ${fmtTime(region.b)}, once`, () => startRecord('loop')) : null,
        st.bytes ? opt('Whole song', 'From the start to the end of the music', () => startRecord('track')) : null,
        opt('From here', st.bytes ? 'From the current spot until you press Stop' : 'Until you press Stop', () => startRecord('manual')));
      const r = anchor.getBoundingClientRect();
      Object.assign(menu.style, { left: `${Math.max(8, r.right - 260)}px`, top: `${r.top - 8}px` });
      document.body.append(menu);
      const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); removeEventListener('pointerdown', close, true); } };
      setTimeout(() => addEventListener('pointerdown', close, true));
    }
    function startRecord(kind) {
      recording = { kind, startedAt: performance.now() };
      let until = null;
      if (kind === 'track') { send({ type: 'media', cmd: 'loop', value: false }); seek(0); toggle(true); }
      else if (kind === 'loop') { until = region.b; seek(region.a); toggle(true); }
      else if (st.bytes && !st.playing) toggle(true);
      send({ type: 'record', cmd: 'start', fps: 60, until });
      toast('Recording… slider moves are recorded too. Changes that rebuild the scene wait until you stop.', { timeout: 4000 });
      paint();
    }
    function finishRecord() {
      if (!recording) return;
      recording.stopping = true;
      if (recording.kind === 'track') send({ type: 'media', cmd: 'loop', value: st.loop });
      paint();
    }
    function stopRecord() {
      if (!recording) return;
      send({ type: 'record', cmd: 'stop' });
      if (recording.kind !== 'manual') toggle(false);
      finishRecord();
    }
    async function saveRecording(msg) {
      recording = null;
      paint();
      const ext = msg.mime?.includes('mp4') ? 'mp4' : 'webm';
      const name = `${(sketchName?.() || 'sketch').replace(/[\\/:*?"<>|]/g, '_')} ${msg.width}x${msg.height}.${ext}`;
      const p = await window.hub.saveFile({ defaultPath: name, filters: [{ name: 'Video', extensions: [ext] }], content: new Uint8Array(msg.buffer) });
      if (p) toast(`Saved ${base(p)}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
    }

    // ---------- drawing ----------
    const RULER = 16;
    let raf = 0;
    function now() { return st.playing ? Math.min(st.duration || Infinity, st.time + (performance.now() - st.stampAt) / 1000) : st.time; }
    function paint() {
      bar.classList.toggle('empty', !st.bytes);
      bar.classList.toggle('locked', locked);
      nameEl.textContent = st.name ? (analyzing ? `${st.name} · analyzing…` : st.name) : 'No music loaded: sketches get a demo beat';
      nameEl.title = st.path || '';
      unloadBtn.hidden = !st.bytes;
      playBtn.textContent = st.playing ? '⏸' : '▶';
      loopBtn.classList.toggle('on', st.loop);
      for (const b of [zoomOut, zoomIn, zoomAll]) b.disabled = locked || !st.duration;
      zoomAll.disabled = locked || !view;
      zoomLoop.hidden = !region;
      zoomLoop.disabled = locked;
      setA.disabled = setB.disabled = locked || !st.duration;
      clearBtn.hidden = !region;
      clearBtn.disabled = locked;
      lockBtn.textContent = locked ? '🔒 Locked' : '🔓';
      lockBtn.classList.toggle('on', locked);
      lockBtn.disabled = !region && !locked;
      loopInfo.textContent = region ? `${fmtTime(region.a)}.${String(Math.floor((region.a % 1) * 10))} → ${fmtTime(region.b)}.${String(Math.floor((region.b % 1) * 10))} (${(region.b - region.a).toFixed(1)} s${st.analysis?.bpm ? `, ${Math.round(((region.b - region.a) * st.analysis.bpm) / 60)} beats` : ''})` : '';
      bpmEl.textContent = st.analysis?.bpm ? `${Math.round(st.analysis.bpm)} BPM` : '';
      recBtn.textContent = recording ? (recording.stopping ? '… saving' : `⏹ Stop ${fmtTime((performance.now() - recording.startedAt) / 1000)}`) : '⏺ Record';
      recBtn.classList.toggle('on', Boolean(recording));
      // While zoomed and playing, page the view along with the playhead (not when locked).
      if (view && st.playing && !locked && !dragging) {
        const t = now();
        if (t > view.end || t < view.start) setView({ start: t - span() * 0.1, end: t - span() * 0.1 + span() });
      }
      draw();
      cancelAnimationFrame(raf);
      if (st.playing || recording) raf = requestAnimationFrame(paint);
    }
    function draw() {
      const t = now();
      timeEl.textContent = st.duration ? `${fmtTime(t)} / ${fmtTime(st.duration)}` : fmtTime(t);
      const D = st.duration || st.analysis?.duration || 0;
      // scrollbar
      scrollbar.hidden = !view || !D;
      if (view && D) Object.assign(scrollThumb.style, { left: `${(view.start / D) * 100}%`, width: `${Math.max(1.5, ((view.end - view.start) / D) * 100)}%` });
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!D) { g.fillStyle = '#ffffff10'; g.fillRect(0, h / 2 - 1, w, 2); return; }
      const s0 = v0(); const sp = span();
      const X = (tt) => ((tt - s0) / sp) * w;
      const a = st.analysis;
      const top = RULER; const H = h - RULER;
      // ruler lane
      g.fillStyle = '#ffffff08';
      g.fillRect(0, 0, w, RULER);
      const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
      const step = steps.find((x) => (x / sp) * w >= 70) || 120;
      g.fillStyle = '#8f877d';
      g.font = '10px Consolas, monospace';
      for (let tt = Math.ceil(s0 / step) * step; tt <= s0 + sp; tt += step) {
        const x = X(tt);
        g.fillRect(x, RULER - 5, 1, 5);
        g.fillText(step < 1 ? `${fmtTime(tt)}.${Math.round((tt % 1) * 100)}` : fmtTime(tt), x + 3, 10);
      }
      if (a) {
        for (const s of a.sections) if (s.energy === 'loud') { g.fillStyle = '#ffd75e12'; g.fillRect(X(s.start), top, X(s.end) - X(s.start), H); }
        if (sp < 25 && a.peaks) {
          // zoomed in: the real waveform
          const mid = top + H / 2;
          g.fillStyle = '#ffd75e90';
          for (let x = 0; x < w; x += 1) {
            const i0 = Math.floor((s0 + (x / w) * sp) * 100); const i1 = Math.max(i0 + 1, Math.floor((s0 + ((x + 1) / w) * sp) * 100));
            let m = 0; for (let i = i0; i < i1 && i < a.peaks.length; i += 1) m = Math.max(m, a.peaks[i]);
            const hh = m * (H / 2 - 2);
            g.fillRect(x, mid - hh, 1, hh * 2 || 1);
          }
        } else {
          const n = a.bass.length;
          const idx = (x) => Math.min(n - 1, Math.max(0, Math.floor(((s0 + (x / w) * sp) / D) * n)));
          const line = (arr, color, fill) => {
            g.beginPath();
            for (let x = 0; x <= w; x += 1) { const y = top + H - arr[idx(x)] * (H - 4); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
            if (fill) { g.lineTo(w, top + H); g.lineTo(0, top + H); g.closePath(); g.fillStyle = color; g.fill(); } else { g.strokeStyle = color; g.lineWidth = 1; g.stroke(); }
          };
          line(a.bass, '#ffd75e55', true);
          line(a.mid, '#48ddffaa', false);
          line(a.treble, '#bd8bffaa', false);
        }
        // beats (bars every 4) once there is room to see them
        const pxPerBeat = (60 / (a.bpm || 120) / sp) * w;
        if (pxPerBeat > 6) {
          a.beats.forEach((b, i) => {
            if (b < s0 || b > s0 + sp) return;
            g.fillStyle = i % 4 === 0 ? '#ffffffa0' : '#ffffff40';
            g.fillRect(Math.round(X(b)), top, 1, H);
          });
        } else {
          g.fillStyle = '#eae0d540';
          for (const b of a.beats) if (b >= s0 && b <= s0 + sp) g.fillRect(X(b), top, 1, 3);
        }
        g.fillStyle = '#ff6a6a';
        for (const d of a.drops) { const x = X(d); g.beginPath(); g.moveTo(x - 4, top); g.lineTo(x + 4, top); g.lineTo(x, top + 7); g.fill(); }
      }
      // loop region
      if (region) {
        const xa = X(region.a); const xb = X(region.b);
        g.fillStyle = locked ? '#48ddff1c' : '#ffd75e1c';
        g.fillRect(xa, 0, xb - xa, h);
        g.fillStyle = locked ? '#48ddff' : '#ffd75e';
        g.fillRect(xa, 0, xb - xa, 3);
        for (const x of [xa, xb]) { g.fillRect(Math.round(x) - 1, 0, 2, h); if (!locked) g.fillRect(Math.round(x) - 4, 0, 8, RULER - 2); }
      }
      // playhead
      if (t >= s0 && t <= s0 + sp) { g.fillStyle = '#ffffff'; g.fillRect(Math.round(X(t)), 0, 2, h); }
    }

    // ---------- timeline interaction ----------
    const timeAt = (e) => { const r = canvas.getBoundingClientRect(); return v0() + ((e.clientX - r.left) / r.width) * span(); };
    const pxToT = (px) => (px / canvas.clientWidth) * span();
    canvas.addEventListener('pointerdown', (e) => {
      if (!st.duration || e.button !== 0) return;
      const r = canvas.getBoundingClientRect();
      const y = e.clientY - r.top;
      const tt = timeAt(e);
      canvas.setPointerCapture(e.pointerId);
      const near = (edge) => region && Math.abs(((region[edge] - v0()) / span()) * r.width - (e.clientX - r.left)) <= 6;
      if (y < RULER && !locked) {
        // top strip: move a loop edge, drag the loop, or draw a new one
        if (near('a')) dragging = { kind: 'edge', edge: 'a' };
        else if (near('b')) dragging = { kind: 'edge', edge: 'b' };
        else if (region && tt > region.a && tt < region.b) dragging = { kind: 'move', from: tt, orig: { ...region } };
        else dragging = { kind: 'new', from: snapT(tt) };
      } else dragging = { kind: 'seek' };
      if (dragging.kind === 'seek') seek(tt);
      const move = (ev) => {
        const t2 = Math.max(0, Math.min(st.duration, timeAt(ev)));
        if (dragging.kind === 'seek') seek(t2);
        else if (dragging.kind === 'edge') {
          const r2 = { ...region, [dragging.edge]: snapT(t2) };
          if (r2.b < r2.a) { [r2.a, r2.b] = [r2.b, r2.a]; dragging.edge = dragging.edge === 'a' ? 'b' : 'a'; }
          setRegion(r2, { persist: false });
        } else if (dragging.kind === 'move') {
          const len = dragging.orig.b - dragging.orig.a;
          let a2 = snapT(dragging.orig.a + (t2 - dragging.from));
          a2 = Math.max(0, Math.min(st.duration - len, a2));
          setRegion({ a: a2, b: a2 + len }, { persist: false });
        } else if (dragging.kind === 'new') {
          const b2 = snapT(t2);
          if (Math.abs(b2 - dragging.from) > pxToT(3)) setRegion({ a: Math.min(dragging.from, b2), b: Math.max(dragging.from, b2) }, { persist: false });
        }
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', () => {
        canvas.removeEventListener('pointermove', move);
        if (dragging && dragging.kind !== 'seek') saveLoop();
        dragging = null;
        paint();
      }, { once: true });
    });
    // Double-click a part of the song to loop that section.
    canvas.addEventListener('dblclick', (e) => {
      if (locked || !st.analysis) return;
      const tt = timeAt(e);
      const sec = st.analysis.sections.find((s) => tt >= s.start && tt < s.end);
      if (sec) { setRegion({ a: snapT(sec.start), b: snapT(sec.end) }); toast(`Looping the ${sec.energy} part ${fmtTime(sec.start)}–${fmtTime(sec.end)}`, { timeout: 2000 }); }
    });
    canvas.addEventListener('wheel', (e) => {
      if (!st.duration) return;
      e.preventDefault();
      if (locked) return;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const d = (e.shiftKey ? e.deltaY : e.deltaX) || 0;
        setView({ start: v0() + (d / canvas.clientWidth) * span() * 1.5, end: v0() + (d / canvas.clientWidth) * span() * 1.5 + span() });
      } else zoomBy(e.deltaY > 0 ? 1.25 : 0.8, timeAt(e));
    }, { passive: false });
    canvas.addEventListener('mousemove', (e) => {
      if (!st.duration) return;
      const r = canvas.getBoundingClientRect();
      const y = e.clientY - r.top;
      const tt = timeAt(e);
      const sec = st.analysis?.sections.find((s) => tt >= s.start && tt < s.end);
      const onEdge = region && !locked && y < RULER && ['a', 'b'].some((k) => Math.abs(((region[k] - v0()) / span()) * r.width - (e.clientX - r.left)) <= 6);
      canvas.style.cursor = locked ? 'pointer' : y < RULER ? (onEdge ? 'ew-resize' : 'copy') : 'pointer';
      canvas.title = `${fmtTime(tt)}${sec ? ` · ${sec.energy} part` : ''}\n${locked ? 'Locked: click to jump' : 'Click to jump · drag along the top strip to set a loop · double-click to loop this part · wheel to zoom'}`;
    });
    // Scrollbar under the timeline.
    scrollbar.addEventListener('pointerdown', (e) => {
      if (!view || locked) return;
      scrollbar.setPointerCapture(e.pointerId);
      const r = scrollbar.getBoundingClientRect();
      const D = st.duration;
      const jump = (ev) => { const c = ((ev.clientX - r.left) / r.width) * D; setView({ start: c - span() / 2, end: c + span() / 2 }); };
      jump(e);
      scrollbar.addEventListener('pointermove', jump);
      scrollbar.addEventListener('pointerup', () => scrollbar.removeEventListener('pointermove', jump), { once: true });
    });
    new ResizeObserver(() => draw()).observe(canvas);
    paint();

    return {
      el: bar,
      load, pick, attach, toggle, seek, onMessage, unload,
      setLoop(a, b) { if (locked) return false; setRegion(a == null ? null : { a, b }); return true; },
      get recording() { return Boolean(recording); },
      get loaded() { return Boolean(st.bytes); },
      get path() { return st.path; },
      // For the Three Director: what's loaded and what the music does over time.
      info() {
        if (!st.bytes) return { loaded: false, note: 'No music loaded. Sketches get a demo 120 bpm beat; the user can load a file with "🎵 Load audio / video…" or you can use three_load_media.' };
        const a = st.analysis;
        const out = { loaded: true, file: st.path, video: st.video, duration: Math.round((st.duration || a?.duration || 0) * 10) / 10, time: Math.round(now() * 10) / 10, playing: st.playing, loop: region ? { start: region.a, end: region.b, locked, on: st.loop } : (st.loop ? 'whole song' : 'off') };
        if (!a) return { ...out, analysis: analyzing ? 'still analyzing' : 'none (no audio track)' };
        const per = 5; const n = a.bass.length; const step = per * a.fps;
        const avg = (arr, i) => { let s = 0; let c = 0; for (let k = i; k < Math.min(n, i + step); k += 1) { s += arr[k]; c += 1; } return Math.round((s / (c || 1)) * 100) / 100; };
        const energy = [];
        for (let i = 0; i < n; i += step) energy.push({ at: Math.round(i / a.fps), level: avg(a.level, i), bass: avg(a.bass, i), mid: avg(a.mid, i), highs: avg(a.treble, i) });
        return { ...out, bpm: a.bpm, beats: a.beats.length, firstBeats: a.beats.slice(0, 8), sections: a.sections, drops: a.drops, energyEvery5s: energy };
      },
    };
  }

  return { analyze, stage, player, isMedia, SIZES };
})();
