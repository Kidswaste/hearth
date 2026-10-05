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
    return { duration, bpm, beats, drops, sections: sections.map((s) => ({ ...s, start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10 })), fps: FPS, level: down(L), bass: down(B), mid: down(M), treble: down(T) };
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
  function player({ send, sketchName, onLoaded }) {
    const st = { path: null, name: null, bytes: null, mime: null, video: false, analysis: null, time: 0, duration: 0, playing: false, loop: store.get('three.mediaLoop', true), volume: store.get('three.mediaVolume', 0.8), stampAt: 0 };
    let recording = null; // { kind, startedAt }
    let analyzing = false;
    const loadBtn = el('button', { class: 'ghost small', text: '🎵 Load audio / video…', title: 'Pick an mp3, wav, mp4… to drive the sketch (or drop one on the preview)', on: { click: pick } });
    const nameEl = el('span', { class: 'mb-name' });
    const unloadBtn = el('button', { class: 'ghost small mb-x', text: '×', title: 'Remove the music (sketches get a demo beat)', on: { click: unload } });
    const playBtn = el('button', { class: 'primary small mb-play', text: '▶', title: 'Play / pause (Space)', on: { click: () => toggle() } });
    const timeEl = el('span', { class: 'mb-time', text: '0:00' });
    const canvas = el('canvas', { class: 'mb-overview', title: 'Click or drag to jump' });
    const loopBtn = el('button', { class: 'ghost small', text: '⟲', title: 'Loop the track', on: { click: () => { st.loop = !st.loop; store.set('three.mediaLoop', st.loop); send({ type: 'media', cmd: 'loop', value: st.loop }); paint(); } } });
    const vol = el('input', { type: 'range', class: 'mb-vol', min: 0, max: 1, step: 0.01, value: st.volume, title: 'Volume (the sketch still sees the full signal)' });
    vol.addEventListener('input', () => { st.volume = Number(vol.value); store.set('three.mediaVolume', st.volume); send({ type: 'media', cmd: 'volume', value: st.volume }); });
    const bpmEl = el('span', { class: 'mb-bpm' });
    const recBtn = el('button', { class: 'ghost small mb-rec', text: '⏺ Record', title: 'Record the preview (with the music) to a video file', on: { click: (e) => (recording ? stopRecord() : recordMenu(e.currentTarget)) } });
    const bar = el('div', { class: 'media-bar' }, loadBtn, nameEl, unloadBtn, playBtn, timeEl, canvas, loopBtn, vol, bpmEl, recBtn);

    async function pick() {
      const [p] = await window.hub.openDialog({ title: 'Music or video for the sketch', filters: [{ name: 'Audio and video', extensions: [...AUDIO_EXT, ...VIDEO_EXT] }] });
      if (p) load(p);
    }
    async function load(path, { startAt = 0, quiet = false } = {}) {
      if (!isMedia(path)) { toast(`${base(path)} isn't an audio or video file`, { type: 'error' }); return { ok: false, error: 'Not an audio/video file' }; }
      let bytes;
      try {
        const u8 = await window.hub.fs.read(path, { encoding: 'buffer', maxBytes: 2 * 1024 ** 3 });
        bytes = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      } catch (err) { if (!quiet) toast(`Couldn't open ${base(path)}: ${err.message}`, { type: 'error' }); return { ok: false, error: err.message }; }
      Object.assign(st, { path, name: base(path), bytes, mime: MIME[extOf(path)], video: VIDEO_EXT.includes(extOf(path)), analysis: null, time: startAt, duration: 0, playing: false });
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
      store.set('three.media', null);
      paint();
      onLoaded?.({ reload: true });
    }
    // (Re)sends the file to the sandbox; called after every full reload of the preview.
    function attach({ playing = st.playing } = {}) {
      if (!st.bytes) return;
      send({ type: 'media-load', buffer: st.bytes.slice(0), mime: st.mime, video: st.video, name: st.name, startAt: st.time, playing, loop: st.loop, volume: st.volume, analysis: st.analysis });
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
        if (msg.ended && recording?.kind === 'track') stopRecord();
        paint();
      }
      if (msg.type === 'record-started') { recording.mime = msg.mime; recording.size = `${msg.width}×${msg.height}`; paint(); }
      if (msg.type === 'record-error') { recording = null; toast(`Can't record: ${msg.message}`, { type: 'error' }); paint(); }
      if (msg.type === 'recording') saveRecording(msg);
    }

    // ---------- recording ----------
    function recordMenu(anchor) {
      const opt = (label, hint, fn) => el('button', { class: 'menu-item', on: { click: () => { menu.remove(); fn(); } } }, el('b', { text: label }), el('span', { class: 'hint', text: hint }));
      const menu = el('div', { class: 'mb-menu' },
        st.bytes ? opt('Whole track', 'From the start to the end of the music', () => startRecord('track')) : null,
        opt('From here', st.bytes ? 'From the current spot until you press Stop' : 'Until you press Stop', () => startRecord('manual')));
      const r = anchor.getBoundingClientRect();
      Object.assign(menu.style, { left: `${Math.max(8, r.right - 260)}px`, top: `${r.top - 8}px` });
      document.body.append(menu);
      const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); removeEventListener('pointerdown', close, true); } };
      setTimeout(() => addEventListener('pointerdown', close, true));
    }
    function startRecord(kind) {
      recording = { kind, startedAt: performance.now() };
      if (kind === 'track') { send({ type: 'media', cmd: 'loop', value: false }); seek(0); toggle(true); } else if (st.bytes && !st.playing) toggle(true);
      send({ type: 'record', cmd: 'start', fps: 60 });
      toast('Recording… slider moves are recorded too. Changes that rebuild the scene wait until you stop.', { timeout: 4000 });
      paint();
    }
    function stopRecord() {
      if (!recording) return;
      send({ type: 'record', cmd: 'stop' });
      if (recording.kind === 'track') { send({ type: 'media', cmd: 'loop', value: st.loop }); toggle(false); }
      recording.stopping = true;
      paint();
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
    let raf = 0;
    function now() { return st.playing ? Math.min(st.duration || Infinity, st.time + (performance.now() - st.stampAt) / 1000) : st.time; }
    function paint() {
      bar.classList.toggle('empty', !st.bytes);
      nameEl.textContent = st.name ? (analyzing ? `${st.name} · analyzing…` : st.name) : 'No music loaded: sketches get a demo beat';
      nameEl.title = st.path || '';
      unloadBtn.hidden = !st.bytes;
      playBtn.textContent = st.playing ? '⏸' : '▶';
      loopBtn.classList.toggle('on', st.loop);
      bpmEl.textContent = st.analysis?.bpm ? `${Math.round(st.analysis.bpm)} BPM` : '';
      recBtn.textContent = recording ? (recording.stopping ? '… saving' : `⏹ Stop ${fmtTime((performance.now() - recording.startedAt) / 1000)}`) : '⏺ Record';
      recBtn.classList.toggle('on', Boolean(recording));
      draw();
      cancelAnimationFrame(raf);
      if (st.playing || recording) raf = requestAnimationFrame(paint);
    }
    function draw() {
      const t = now();
      timeEl.textContent = st.duration ? `${fmtTime(t)} / ${fmtTime(st.duration)}` : fmtTime(t);
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const a = st.analysis;
      const D = st.duration || a?.duration || 0;
      if (a && D) {
        for (const s of a.sections) if (s.energy === 'loud') { g.fillStyle = '#ffd75e14'; g.fillRect((s.start / D) * w, 0, ((s.end - s.start) / D) * w, h); }
        const n = a.bass.length;
        const line = (arr, color, fill) => {
          g.beginPath();
          for (let x = 0; x <= w; x += 1) { const i = Math.min(n - 1, Math.floor((x / w) * n)); const y = h - arr[i] * (h - 4); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
          if (fill) { g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fillStyle = color; g.fill(); } else { g.strokeStyle = color; g.lineWidth = 1; g.stroke(); }
        };
        line(a.bass, '#ffd75e55', true);
        line(a.mid, '#48ddffaa', false);
        line(a.treble, '#bd8bffaa', false);
        g.fillStyle = '#eae0d540';
        for (const b of a.beats) g.fillRect((b / D) * w, 0, 1, 4);
        g.fillStyle = '#ff6a6a';
        for (const d of a.drops) { const x = (d / D) * w; g.beginPath(); g.moveTo(x - 4, 0); g.lineTo(x + 4, 0); g.lineTo(x, 7); g.fill(); }
      } else {
        g.fillStyle = '#ffffff10';
        g.fillRect(0, h / 2 - 1, w, 2);
      }
      if (D) { g.fillStyle = '#ffffff'; g.fillRect(Math.round((t / D) * w), 0, 2, h); }
    }
    // Click / drag on the overview to jump; hover shows the time.
    const timeAt = (e) => { const r = canvas.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * (st.duration || 0); };
    canvas.addEventListener('pointerdown', (e) => {
      if (!st.duration) return;
      canvas.setPointerCapture(e.pointerId);
      seek(timeAt(e));
      const move = (ev) => seek(timeAt(ev));
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', () => canvas.removeEventListener('pointermove', move), { once: true });
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!st.duration) return;
      const tt = timeAt(e);
      const sec = st.analysis?.sections.find((s) => tt >= s.start && tt < s.end);
      const drop = st.analysis?.drops.find((d) => Math.abs(d - tt) < 1.5);
      canvas.title = `${fmtTime(tt)}${sec ? ` · ${sec.energy}` : ''}${drop != null ? ' · drop' : ''}. Click to jump`;
    });
    new ResizeObserver(() => draw()).observe(canvas);
    paint();

    return {
      el: bar,
      load, pick, attach, toggle, seek, onMessage, unload,
      get recording() { return Boolean(recording); },
      get loaded() { return Boolean(st.bytes); },
      get path() { return st.path; },
      // For the Three Director: what's loaded and what the music does over time.
      info() {
        if (!st.bytes) return { loaded: false, note: 'No music loaded. Sketches get a demo 120 bpm beat; the user can load a file with "🎵 Load audio / video…" or you can use three_load_media.' };
        const a = st.analysis;
        const out = { loaded: true, file: st.path, video: st.video, duration: Math.round((st.duration || a?.duration || 0) * 10) / 10, time: Math.round(now() * 10) / 10, playing: st.playing };
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
