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
    return { duration, bpm, beats, drops, sections: sections.map((s) => ({ ...s, start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10 })), fps: FPS, level: down(L), bass: down(B), mid: down(M), treble: down(T), peaks: Array.from(PK, (x) => Math.round(x * 100) / 100), samples: mono }; // samples: kept by the player for sample-level zoom, never sent to the sketch
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
    // silent: set by the Lab when a sketch opens (it runs the sketch itself afterwards).
    function setMode(id, { silent = false } = {}) {
      if (!SIZES.some((s) => s.id === id)) return;
      const wasExact = Boolean(current().w);
      mode = id;
      store.set('three.aspect', id);
      layout();
      if (!silent) onChange?.({ id, reload: wasExact !== Boolean(current().w) }); // device-pixel override needs a reload
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

  // ---------- beat grid + hit markers ----------
  // A manual grid is { bpm, anchor (a downbeat "1", seconds), bpb (beats per bar) }; without one the
  // detected beats are used. Hit markers are the user's own kick / snare / hit times.
  const METERS = [['4', '4/4'], ['3', '3/4'], ['6', '6/8']];
  const SNAPS = [['off', 'Off'], ['bar', 'Bar'], ['1/4', 'Beat'], ['1/8', '1/8'], ['1/16', '1/16'], ['1/32', '1/32']];
  const DIV = { '1/4': 1, '1/8': 2, '1/16': 4, '1/32': 8 };
  const LANES = [{ id: 'kick', name: 'Kick', key: 'k', color: '#ff6a6a' }, { id: 'snare', name: 'Snare', key: 's', color: '#48ddff' }, { id: 'hit', name: 'Hit', key: 'h', color: '#bd8bff' }];
  const r4 = (t) => Math.round(t * 1e4) / 1e4;
  const mod = (a, n) => ((a % n) + n) % n;
  function gridBeats(grid, duration) {
    const p = 60 / grid.bpm;
    const out = [];
    for (let t = grid.anchor - Math.floor(grid.anchor / p) * p; t < duration; t += p) out.push(r4(t));
    return out;
  }
  // Last index with beats[i] <= t (-1 if none).
  function beatIndex(beats, t) {
    let lo = 0; let hi = beats.length - 1; let k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (beats[m] <= t) { k = m; lo = m + 1; } else hi = m - 1; }
    return k;
  }
  // Beat number counted from the downbeat: 0 = the "1" of a bar.
  const beatNo = (beats, i, grid) => (grid ? Math.round((beats[i] - grid.anchor) / (60 / grid.bpm)) : i);
  function snapTime(t, mode, grid, beats) {
    if (mode === 'off' || !beats.length) return t;
    if (grid) {
      const p = 60 / grid.bpm;
      const step = mode === 'bar' ? p * grid.bpb : p / DIV[mode];
      return r4(grid.anchor + Math.round((t - grid.anchor) / step) * step);
    }
    const i = Math.max(0, Math.min(beats.length - 2, beatIndex(beats, t)));
    if (mode === 'bar') {
      const k0 = i - (i % 4); const k1 = Math.min(beats.length - 1, k0 + 4);
      return Math.abs(beats[k0] - t) <= Math.abs(beats[k1] - t) ? beats[k0] : beats[k1];
    }
    const a = beats[i]; const step = (beats[i + 1] - a) / DIV[mode];
    return r4(a + Math.round((t - a) / step) * step);
  }
  const snapStep = (mode, grid, bpm) => { const p = 60 / (grid?.bpm || bpm || 120); return mode === 'bar' ? p * (grid?.bpb || 4) : mode === 'off' ? p : p / DIV[mode]; };
  // "1:23.456" / "83.456" / "83" → seconds
  function parseTime(s) {
    const m = String(s).trim().match(/^(?:(\d+):)?(\d+(?:\.\d*)?)$/);
    return m ? (Number(m[1] || 0) * 60 + Number(m[2])) : NaN;
  }
  const fmtMs = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); const s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`; };
  function addMark(list, t) {
    if (list.some((x) => Math.abs(x - t) < 0.008)) return list;
    return [...list, r4(t)].sort((a, b) => a - b);
  }

  // ---------- player ----------
  // send(msg) → sandbox; sketchName() for recording file names; onLoaded() after a new file is ready.
  // Timeline: zoom (wheel / ＋ −) down to single samples, scroll (bar underneath / Shift+wheel), A–B loop
  // points (top strip, typed times, nudges), a rekordbox-style beat grid (BPM, tap, "1" here, meter),
  // snapping, and Kick / Snare / Hit lanes the user fills by tapping K S H or clicking.
  function player({ send, sketchName, onLoaded, onPick }) {
    const st = { path: null, name: null, bytes: null, mime: null, video: false, analysis: null, samples: null, time: 0, duration: 0, playing: false, loop: store.get('three.mediaLoop', true), volume: store.get('three.mediaVolume', 0.8), stampAt: 0 };
    let region = null; // { a, b } seconds
    let locked = false;
    let snapMode = store.get('three.snapMode', '1/4');
    let view = null; // { start, end } seconds when zoomed in
    let recording = null;
    let analyzing = false;
    let dragging = null;
    let selected = null; // { type: 'edge', edge } | { type: 'mark', lane, t }
    let map = { grid: null, marks: { kick: [], snare: [], hit: [] } };
    let mapUndo = [];
    let allMaps = null;
    let taps = [];
    let beatCache = { key: '', beats: [] };
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    const sep = () => el('span', { class: 'mb-sep' });

    // row 1: file, transport, zoom, loop
    const loadBtn = btn('🎵 Load audio / video…', 'Pick an mp3, wav, mp4… to drive the sketch (or drop one on the preview)', () => pick());
    const nameEl = el('span', { class: 'mb-name' });
    const unloadBtn = btn('×', 'Remove the music (sketches get a demo beat)', () => unload(), 'ghost small mb-x');
    const playBtn = btn('▶', 'Play / pause (Space)', () => toggle(), 'primary small mb-play');
    const timeEl = el('span', { class: 'mb-time', text: '0:00' });
    const zoomOut = btn('－', 'Zoom out (or the mouse wheel on the timeline)', () => zoomBy(1.6));
    const zoomIn = btn('＋', 'Zoom in (or the mouse wheel on the timeline); goes down to single samples', () => zoomBy(1 / 1.6));
    const zoomAll = btn('Whole song', 'Show the whole song', () => setView(null));
    const zoomLoop = btn('Fit loop', 'Zoom to the loop', () => fitLoop());
    const loopBtn = btn('⟲ Loop', 'Loop playback: the loop section if you set one, otherwise the whole song', () => { st.loop = !st.loop; store.set('three.mediaLoop', st.loop); send({ type: 'media', cmd: 'loop', value: st.loop }); paint(); });
    const lockBtn = btn('🔓', 'Lock the loop and the view in place', () => setLocked(!locked));
    const vol = el('input', { type: 'range', class: 'mb-vol', min: 0, max: 1, step: 0.01, value: st.volume, title: 'Volume (the sketch still sees the full signal)' });
    vol.addEventListener('input', () => { st.volume = Number(vol.value); store.set('three.mediaVolume', st.volume); send({ type: 'media', cmd: 'volume', value: st.volume }); });
    const recBtn = btn('⏺ Record', 'Record the preview (with the music) to a video file', (e) => (recording ? stopRecord() : recordMenu(e.currentTarget)), 'ghost small mb-rec');

    // loop points, typed to the millisecond with nudges
    const timeInput = (edge) => {
      const input = el('input', { type: 'text', class: 'mb-tin', spellcheck: false, title: `Loop ${edge === 'a' ? 'start' : 'end'}: type m:ss.mmm or seconds` });
      input.addEventListener('change', () => { const t = parseTime(input.value); if (Number.isFinite(t)) setRegionEdge(edge, t, { exact: true }); else paint(); });
      input.addEventListener('focus', () => { selected = { type: 'edge', edge }; draw(); });
      return input;
    };
    const aIn = timeInput('a'); const bIn = timeInput('b');
    const nudgeBtn = (edge, d) => btn(d < 0 ? '‹' : '›', `Move the loop ${edge === 'a' ? 'start' : 'end'} ${d < 0 ? 'back' : 'forward'} 10 ms (arrow keys: 10 ms, Alt 1 ms, Shift one grid step)`, () => nudgeEdge(edge, d), 'ghost small mb-nudge');
    const setA = btn('[ here', 'Set the loop start at the playhead ([ key)', () => setRegionEdge('a', now()));
    const setB = btn('here ]', 'Set the loop end at the playhead (] key)', () => setRegionEdge('b', now()));
    const clearBtn = btn('✕', 'Remove the loop points', () => setRegion(null));
    const loopBox = el('span', { class: 'mb-loopbox' }, setA, nudgeBtn('a', -0.01), aIn, nudgeBtn('a', 0.01), el('span', { class: 'mb-arrow', text: '→' }), nudgeBtn('b', -0.01), bIn, nudgeBtn('b', 0.01), setB, clearBtn);
    const loopLen = el('span', { class: 'mb-loopinfo' });

    // row 2: grid and hits
    const bpmIn = el('input', { type: 'number', class: 'mb-bpmin', min: 20, max: 400, step: 0.01, title: 'Tempo of the beat grid (type your own)' });
    bpmIn.addEventListener('change', () => { const v = Number(bpmIn.value); if (v >= 20 && v <= 400) editGrid((g) => { g.bpm = Math.round(v * 100) / 100; }); else paint(); });
    const tapBtn = btn('Tap', 'Tap along to the beat (4+ taps) to set the BPM', () => tap());
    const dblBtn = btn('×2', 'Double the BPM', () => editGrid((g) => { g.bpm = Math.round(g.bpm * 200) / 100; }));
    const halfBtn = btn('½', 'Halve the BPM', () => editGrid((g) => { g.bpm = Math.round(g.bpm * 50) / 100; }));
    const oneBtn = btn('Set 1 here', 'Put the downbeat (beat 1 of a bar) at the playhead; the grid lines up from it', () => editGrid((g) => { g.anchor = r4(now()); }), 'ghost small mb-one');
    const gridL = btn('◂', 'Shift the whole grid 5 ms earlier', () => editGrid((g) => { g.anchor = r4(g.anchor - 0.005); }));
    const gridR = btn('▸', 'Shift the whole grid 5 ms later', () => editGrid((g) => { g.anchor = r4(g.anchor + 0.005); }));
    const meterSel = el('select', { class: 'mb-sel', title: 'Beats per bar' }, METERS.map(([v, l]) => el('option', { value: v, text: l })));
    meterSel.addEventListener('change', () => editGrid((g) => { g.bpb = Number(meterSel.value); }));
    const autoBtn = btn('Auto', 'Forget your grid and use the detected beats', () => { if (!map.grid) return; pushUndo(); map.grid = null; mapChanged(); });
    const gridState = el('span', { class: 'mb-gridstate' });
    const snapSel = el('select', { class: 'mb-sel', title: 'What loop points and markers snap to' }, SNAPS.map(([v, l]) => el('option', { value: v, text: `Snap: ${l}`, selected: v === snapMode })));
    snapSel.addEventListener('change', () => { snapMode = snapSel.value; store.set('three.snapMode', snapMode); draw(); });
    const laneBtns = LANES.map((ln) => btn('', `Add a ${ln.name.toLowerCase()} at the playhead (or press ${ln.key.toUpperCase()} while it plays)`, () => addAtPlayhead(ln.id), `ghost small mb-lane mb-lane-${ln.id}`));
    const fillBtn = btn('Fill ▾', 'Stamp kicks / snares / hits on the grid, or clear them', (e) => fillMenu(e.currentTarget));
    const undoBtn = btn('↶', 'Undo the last grid or marker change (Ctrl+Z)', () => undoMap());
    const gridRow = el('div', { class: 'mb-row mb-grid' },
      el('span', { class: 'mb-label', text: 'Grid' }), bpmIn, el('span', { class: 'mb-unit', text: 'BPM' }), tapBtn, dblBtn, halfBtn, sep(), oneBtn, gridL, gridR, meterSel, autoBtn, gridState, sep(), snapSel, sep(),
      el('span', { class: 'mb-label', text: 'Hits' }), ...laneBtns, fillBtn, undoBtn);

    const canvas = el('canvas', { class: 'mb-timeline' });
    // Overview of the whole song (like FL Studio's playlist overview): every layer, the loop, the playhead,
    // and the zoomed window you can drag.
    const minimap = el('canvas', { class: 'mb-minimap', title: 'The whole song: each layer\'s time, the loop and the playhead. Drag the box to move the zoomed view; click to jump.' });
    // Layer tracks under the song (top layer first): { id, name, color, in, out, visible, selected, keys: [{ t, ease }] }.
    // Handlers: onSelect(id), onChange(id, { in, out }, { final }), onKeyMove(id, from, to), onKeyDelete(id, t), onKeyEase(id, t, ease).
    let tracks = [];
    let trackHandlers = {};
    const TRACK_H = 16;
    function setTracks(list, handlers) {
      tracks = list || [];
      if (handlers) trackHandlers = handlers;
      canvas.style.height = `${112 + tracks.length * TRACK_H}px`;
      draw();
    }
    const bar = el('div', { class: 'media-bar' },
      el('div', { class: 'mb-row' }, loadBtn, nameEl, unloadBtn, playBtn, timeEl, sep(), zoomOut, zoomIn, zoomAll, zoomLoop, sep(), loopBtn, loopBox, loopLen, lockBtn, el('span', { class: 'spacer' }), vol, recBtn),
      gridRow, canvas, minimap);

    // ---------- file ----------
    async function pick() {
      const [p] = await window.hub.openDialog({ title: 'Music or video for the sketch', filters: [{ name: 'Audio and video', extensions: [...AUDIO_EXT, ...VIDEO_EXT] }] });
      if (p) { onPick?.(p); load(p); }
    }
    const loopKey = (p) => `three.loop:${p}`;
    let loadSeq = 0; // a newer load / unload (e.g. switching sketches fast) cancels an older one
    async function load(path, { startAt = 0, quiet = false } = {}) {
      if (!isMedia(path)) { toast(`${base(path)} isn't an audio or video file`, { type: 'error' }); return { ok: false, error: 'Not an audio/video file' }; }
      const seq = ++loadSeq;
      let bytes;
      try {
        const u8 = await window.hub.fs.read(path, { encoding: 'buffer', maxBytes: 2 * 1024 ** 3 });
        bytes = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      } catch (err) { if (!quiet) toast(`Couldn't open ${base(path)}: ${err.message}`, { type: 'error' }); return { ok: false, error: err.message }; }
      if (seq !== loadSeq) return { ok: false, error: 'Another file was loaded meanwhile' };
      Object.assign(st, { path, name: base(path), bytes, mime: MIME[extOf(path)], video: VIDEO_EXT.includes(extOf(path)), analysis: null, samples: null, time: startAt, duration: 0, playing: false });
      const saved = store.get(loopKey(path), null);
      region = saved?.a != null ? { a: saved.a, b: saved.b } : null;
      locked = Boolean(saved?.locked && region);
      view = null;
      selected = null;
      // The user's grid and markers for this song.
      allMaps ||= await window.hub.kvGet('three-beatmaps', {});
      if (seq !== loadSeq) return { ok: false, error: 'Another file was loaded meanwhile' };
      const m = allMaps[path];
      map = { grid: m?.grid || null, marks: { kick: m?.marks?.kick || [], snare: m?.marks?.snare || [], hit: m?.marks?.hit || [] } };
      mapUndo = [];
      store.set('three.media', path);
      analyzing = true;
      paint();
      attach({ playing: false });
      try {
        const a = await analyze(bytes);
        st.samples = a.samples;
        delete a.samples;
        st.analysis = a;
      } catch (err) { if (seq === loadSeq) { st.analysis = null; if (!quiet) toast(st.video ? `${st.name} has no audio track to analyze (it still works as a video texture)` : `Couldn't analyze ${st.name}: ${err.message}`, { type: 'error' }); } }
      if (seq !== loadSeq) return { ok: false, error: 'Another file was loaded meanwhile' };
      analyzing = false;
      if (st.analysis) { st.duration = st.analysis.duration; send({ type: 'media-analysis', analysis: st.analysis }); }
      if (locked && region) view = padded(region);
      sendMap();
      paint();
      onLoaded?.();
      return { ok: true };
    }
    // silent: the Lab is switching sketches and runs the new one itself.
    function unload({ silent = false } = {}) {
      loadSeq += 1;
      analyzing = false;
      Object.assign(st, { path: null, name: null, bytes: null, analysis: null, samples: null, time: 0, duration: 0, playing: false });
      region = null; locked = false; view = null; selected = null;
      map = { grid: null, marks: { kick: [], snare: [], hit: [] } };
      store.set('three.media', null);
      paint();
      if (!silent) onLoaded?.({ reload: true, unloaded: true });
    }
    // (Re)sends the file to the sandbox; called after every full reload of the preview.
    function attach({ playing = st.playing } = {}) {
      if (!st.bytes) return;
      send({ type: 'media-load', buffer: st.bytes.slice(0), mime: st.mime, video: st.video, name: st.name, startAt: st.time, playing, loop: st.loop, volume: st.volume, analysis: st.analysis, region });
      sendMap();
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
      // A jump outside the zoomed view brings the view along (unless it's locked).
      if (view && !locked && !dragging && (st.time < view.start || st.time > view.end)) setView({ start: st.time - span() / 2, end: st.time + span() / 2 });
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

    // ---------- grid + markers ----------
    const D = () => st.duration || st.analysis?.duration || 0;
    function beats() {
      if (!map.grid) return st.analysis?.beats || [];
      const key = `${map.grid.bpm}|${map.grid.anchor}|${D()}`;
      if (beatCache.key !== key) beatCache = { key, beats: gridBeats(map.grid, D()) };
      return beatCache.beats;
    }
    const bpmNow = () => map.grid?.bpm || st.analysis?.bpm || 0;
    const bpbNow = () => map.grid?.bpb || 4;
    const snapT = (t) => snapTime(t, snapMode, map.grid, beats());
    function ensureGrid() {
      if (map.grid) return map.grid;
      const bs = st.analysis?.beats || [];
      map.grid = { bpm: Math.round((st.analysis?.bpm || 120) * 100) / 100, anchor: bs[0] ?? 0, bpb: 4 };
      return map.grid;
    }
    function pushUndo() { mapUndo.push(JSON.stringify(map)); if (mapUndo.length > 80) mapUndo.shift(); }
    function editGrid(fn) {
      if (!st.duration) return;
      pushUndo();
      fn(ensureGrid());
      mapChanged();
    }
    function undoMap() {
      const prev = mapUndo.pop();
      if (!prev) return;
      map = JSON.parse(prev);
      selected = null;
      mapChanged({ undoable: false });
    }
    const saveMaps = debounce(() => { if (allMaps) window.hub.kvSet('three-beatmaps', allMaps); }, 400);
    function mapChanged() {
      if (st.path && allMaps) {
        const empty = !map.grid && !LANES.some((ln) => map.marks[ln.id].length);
        if (empty) delete allMaps[st.path]; else allMaps[st.path] = map;
        saveMaps();
      }
      sendMap();
      paint();
    }
    function sendMap() {
      if (!st.bytes) return;
      send({ type: 'media-map', beats: beats(), bpm: bpmNow(), bpb: bpbNow(), anchor: map.grid?.anchor ?? beats()[0] ?? 0, manual: Boolean(map.grid), marks: map.marks });
    }
    function tap() {
      const t = performance.now();
      if (taps.length && t - taps[taps.length - 1] > 2000) taps = [];
      taps.push(t);
      if (taps.length > 9) taps.shift();
      if (taps.length >= 4) {
        const gaps = taps.slice(1).map((x, i) => x - taps[i]);
        const bpm = Math.round((60000 / (gaps.reduce((s, g) => s + g, 0) / gaps.length)) * 100) / 100;
        if (taps.length === 4) pushUndo();
        ensureGrid().bpm = bpm;
        mapChanged();
      }
      tapBtn.textContent = taps.length < 4 ? `Tap ${'•'.repeat(taps.length)}` : 'Tap ✓';
      clearTimeout(tap.reset);
      tap.reset = setTimeout(() => { tapBtn.textContent = 'Tap'; }, 2200);
    }
    function addMarkAt(lane, t, { snapIt = true } = {}) {
      if (!st.duration) return;
      const tt = Math.max(0, Math.min(D(), snapIt ? snapT(t) : t));
      pushUndo();
      map.marks[lane] = addMark(map.marks[lane], tt);
      selected = { type: 'mark', lane, t: r4(tt) };
      mapChanged();
    }
    function addAtPlayhead(lane) {
      addMarkAt(lane, now());
      const b = laneBtns[LANES.findIndex((l) => l.id === lane)];
      b.classList.add('flash');
      setTimeout(() => b.classList.remove('flash'), 120);
    }
    function deleteSelectedMark() {
      if (selected?.type !== 'mark') return false;
      pushUndo();
      map.marks[selected.lane] = map.marks[selected.lane].filter((x) => Math.abs(x - selected.t) > 1e-4);
      selected = null;
      mapChanged();
      return true;
    }
    function moveSelectedMark(to) {
      const { lane, t } = selected;
      const list = map.marks[lane].filter((x) => Math.abs(x - t) > 1e-4);
      const tt = r4(Math.max(0, Math.min(D(), to)));
      map.marks[lane] = addMark(list, tt);
      selected = { type: 'mark', lane, t: tt };
    }
    function fillMenu(anchor) {
      const range = region ? [region.a, region.b] : [0, D()];
      const where = region ? 'in the loop' : 'in the whole song';
      const bs = beats();
      const inRange = (t) => t >= range[0] - 1e-3 && t < range[1] - 1e-3;
      const numbered = bs.map((t, i) => ({ t, n: mod(beatNo(bs, i, map.grid), bpbNow()) })).filter((b) => inRange(b.t));
      const stamp = (lane, list) => { pushUndo(); for (const t of list) map.marks[lane] = addMark(map.marks[lane], t); mapChanged(); toast(`${list.length} ${lane}${list.length === 1 ? '' : 's'} added ${where}`, { timeout: 2000 }); };
      const clear = (lane) => { pushUndo(); const before = map.marks[lane].length; map.marks[lane] = map.marks[lane].filter((t) => !inRange(t)); mapChanged(); toast(`${before - map.marks[lane].length} ${lane}s removed ${where}`, { timeout: 2000 }); };
      menuAt(anchor, [
        ['Kick on every beat', where, () => stamp('kick', numbered.map((b) => b.t))],
        ['Kick on 1 and 3', where, () => stamp('kick', numbered.filter((b) => b.n === 0 || b.n === 2).map((b) => b.t))],
        ['Snare on 2 and 4', where, () => stamp('snare', numbered.filter((b) => b.n === 1 || b.n === 3).map((b) => b.t))],
        ['Hit on every bar’s 1', where, () => stamp('hit', numbered.filter((b) => b.n === 0).map((b) => b.t))],
        null,
        ...LANES.map((ln) => [`Clear ${ln.name.toLowerCase()}s`, where, () => clear(ln.id)]),
      ]);
    }

    // ---------- loop points ----------
    function setRegion(r, { persist = true } = {}) {
      if (locked && persist) { toast('The loop is locked: press 🔒 to unlock it', { timeout: 2000 }); return; }
      region = r && r.b - r.a >= 0.005 ? { a: r4(Math.max(0, r.a)), b: r4(Math.min(D() || r.b, r.b)) } : null;
      send({ type: 'media', cmd: 'region', value: region });
      if (!region && locked) locked = false;
      if (!region && selected?.type === 'edge') selected = null;
      saveLoop();
      paint();
    }
    function setRegionEdge(edge, t, { exact = false } = {}) {
      if (!D()) return;
      const x = exact ? t : snapT(t);
      const r = region ? { ...region } : { a: edge === 'a' ? x : 0, b: edge === 'b' ? x : D() };
      r[edge] = x;
      if (r.b < r.a) [r.a, r.b] = [r.b, r.a];
      selected = { type: 'edge', edge };
      setRegion(r);
    }
    function nudgeEdge(edge, d) {
      if (!region) { setRegionEdge(edge, now() + d, { exact: true }); return; }
      setRegionEdge(edge, region[edge] + d, { exact: true });
    }
    function setLocked(on) {
      if (on && !region) { toast('Set loop points first (drag along the top of the timeline)', { timeout: 2500 }); return; }
      locked = on;
      if (locked) { view = padded(region); if (!st.loop) { st.loop = true; store.set('three.mediaLoop', true); send({ type: 'media', cmd: 'loop', value: true }); } }
      saveLoop();
      paint();
    }
    const saveLoop = () => { if (st.path) store.set(loopKey(st.path), region ? { ...region, locked } : null); };
    const padded = (r) => { const pad = Math.max(0.05, (r.b - r.a) * 0.06); return { start: Math.max(0, r.a - pad), end: Math.min(D() || r.b + pad, r.b + pad) }; };

    // ---------- keys (the Lab forwards them when you're not typing) ----------
    function onKey(e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return false;
      if (e.code === 'Space' && !e.ctrlKey && !e.altKey) { toggle(); return true; }
      if (!st.bytes) return false;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undoMap(); return true; }
      if (e.ctrlKey || e.metaKey) return false;
      const lane = LANES.find((l) => l.key === e.key.toLowerCase());
      if (lane && !e.altKey) { addAtPlayhead(lane.id); return true; }
      if (e.key === '[') { setRegionEdge('a', now()); return true; }
      if (e.key === ']') { setRegionEdge('b', now()); return true; }
      if (e.key === 'Delete' || e.key === 'Backspace') return deleteSelectedMark();
      if (e.key === 'Escape') { selected = null; draw(); return true; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        const d = dir * (e.shiftKey ? snapStep(snapMode, map.grid, bpmNow()) : e.altKey ? 0.001 : 0.01);
        if (selected?.type === 'edge' && region && !locked) setRegionEdge(selected.edge, region[selected.edge] + d, { exact: true });
        else if (selected?.type === 'mark') { if (!e.repeat || !nudgeKey.pushed) { pushUndo(); nudgeKey.pushed = true; } moveSelectedMark(selected.t + d); mapChanged(); }
        else seek(now() + d);
        return true;
      }
      return false;
    }
    const nudgeKey = { pushed: false };
    addEventListener('keyup', () => { nudgeKey.pushed = false; });

    // ---------- zoom ----------
    const span = () => (view ? view.end - view.start : D() || 1);
    const v0 = () => (view ? view.start : 0);
    function setView(v) {
      if (locked) return;
      if (!v || !D() || v.end - v.start >= D() * 0.999) { view = null; paint(); return; }
      const len = Math.max(0.02, Math.min(D(), v.end - v.start));
      const start = Math.max(0, Math.min(D() - len, v.start));
      view = { start, end: start + len };
      paint();
    }
    function zoomBy(f, at) {
      if (!D() || locked) return;
      const c = at ?? (now() >= v0() && now() <= v0() + span() ? now() : v0() + span() / 2);
      const len = span() * f;
      const k = (c - v0()) / span();
      setView({ start: c - len * k, end: c - len * k + len });
    }
    function fitLoop() { if (region && !locked) setView(padded(region)); }

    // ---------- menus + recording ----------
    function menuAt(anchor, items) {
      const menu = el('div', { class: 'mb-menu' }, items.map((it) => (it ? el('button', { class: 'menu-item', on: { click: () => { menu.remove(); it[2](); } } }, el('b', { text: it[0] }), el('span', { class: 'hint', text: it[1] })) : el('div', { class: 'menu-sep' }))));
      const r = anchor.getBoundingClientRect();
      Object.assign(menu.style, { left: `${Math.max(8, Math.min(innerWidth - 270, r.left))}px`, top: `${r.top - 8}px` });
      document.body.append(menu);
      const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); removeEventListener('pointerdown', close, true); } };
      setTimeout(() => addEventListener('pointerdown', close, true));
    }
    function recordMenu(anchor) {
      menuAt(anchor, [
        region && st.bytes ? ['The loop', `${fmtMs(region.a)} → ${fmtMs(region.b)}, once`, () => startRecord('loop')] : null,
        st.bytes ? ['Whole song', 'From the start to the end of the music', () => startRecord('track')] : null,
        ['From here', st.bytes ? 'From the current spot until you press Stop' : 'Until you press Stop', () => startRecord('manual')],
      ].filter(Boolean));
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
    const RULER = 16; const LANE_H = 14;
    const laneTop = (h) => h - LANES.length * LANE_H - tracks.length * TRACK_H;
    let raf = 0;
    function now() { return st.playing ? Math.min(D() || Infinity, st.time + (performance.now() - st.stampAt) / 1000) : st.time; }
    function paint() {
      bar.classList.toggle('mb-empty', !st.bytes);
      bar.classList.toggle('locked', locked);
      nameEl.textContent = st.name ? (analyzing ? `${st.name} · analyzing…` : st.name) : 'No music loaded: sketches get a demo beat';
      nameEl.title = st.path || '';
      unloadBtn.hidden = !st.bytes;
      playBtn.textContent = st.playing ? '⏸' : '▶';
      loopBtn.classList.toggle('on', st.loop);
      zoomOut.disabled = zoomIn.disabled = locked || !D();
      zoomAll.disabled = locked || !view;
      zoomLoop.hidden = !region;
      zoomLoop.disabled = locked;
      for (const x of loopBox.querySelectorAll('button, input')) x.disabled = locked || !D();
      clearBtn.hidden = !region;
      if (document.activeElement !== aIn) aIn.value = region ? fmtMs(region.a) : '';
      if (document.activeElement !== bIn) bIn.value = region ? fmtMs(region.b) : '';
      aIn.placeholder = 'start'; bIn.placeholder = 'end';
      loopLen.textContent = region ? `${(region.b - region.a).toFixed(3)} s${bpmNow() ? ` · ${(((region.b - region.a) * bpmNow()) / 60).toFixed(2).replace(/\.00$/, '')} beats` : ''}` : '';
      lockBtn.textContent = locked ? '🔒 Locked' : '🔓';
      lockBtn.classList.toggle('on', locked);
      lockBtn.disabled = !region && !locked;
      if (document.activeElement !== bpmIn) bpmIn.value = bpmNow() ? bpmNow().toFixed(2) : '';
      meterSel.value = String(bpbNow());
      gridState.textContent = map.grid ? `yours · 1 at ${fmtMs(map.grid.anchor)}` : (st.analysis ? 'detected' : '');
      gridState.classList.toggle('mine', Boolean(map.grid));
      autoBtn.disabled = !map.grid;
      undoBtn.disabled = !mapUndo.length;
      LANES.forEach((ln, i) => { laneBtns[i].textContent = `${ln.key.toUpperCase()} ${ln.name} ${map.marks[ln.id].length || ''}`.trim(); });
      recBtn.textContent = recording ? (recording.stopping ? '… saving' : `⏹ Stop ${fmtTime((performance.now() - recording.startedAt) / 1000)}`) : '⏺ Record';
      recBtn.classList.toggle('on', Boolean(recording));
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
      timeEl.textContent = D() ? `${span() < 20 ? fmtMs(t) : fmtTime(t)} / ${fmtTime(D())}` : fmtTime(t);
      drawMinimap(t);
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!D()) { g.fillStyle = '#ffffff10'; g.fillRect(0, h / 2 - 1, w, 2); return; }
      const s0 = v0(); const sp = span();
      const X = (tt) => ((tt - s0) / sp) * w;
      const a = st.analysis;
      const top = RULER; const LT = laneTop(h); const H = LT - top;
      g.fillStyle = '#ffffff08';
      g.fillRect(0, 0, w, RULER);
      // time ruler
      const steps = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
      const step = steps.find((x) => (x / sp) * w >= 70) || 120;
      g.fillStyle = '#8f877d';
      g.font = '10px Consolas, monospace';
      for (let tt = Math.ceil(s0 / step) * step; tt <= s0 + sp; tt += step) {
        const x = X(tt);
        g.fillRect(x, RULER - 4, 1, 4);
        g.fillText(step < 1 ? fmtMs(tt).replace(/0+$/, '').replace(/\.$/, '') : fmtTime(tt), x + 3, 9);
      }
      if (a) for (const s of a.sections) if (s.energy === 'loud') { g.fillStyle = '#ffd75e10'; g.fillRect(X(s.start), top, X(s.end) - X(s.start), H); }
      // waveform: raw samples when very close, peaks when close, energy curves when far
      const mid = top + H / 2;
      if (sp < 3 && st.samples) {
        const SR = 22050; const smp = st.samples;
        g.fillStyle = '#ffd75ec0';
        for (let x = 0; x < w; x += 1) {
          const i0 = Math.floor((s0 + (x / w) * sp) * SR); const i1 = Math.max(i0 + 1, Math.floor((s0 + ((x + 1) / w) * sp) * SR));
          let lo = 0; let hi = 0;
          for (let i = i0; i < i1 && i < smp.length; i += 1) { if (smp[i] < lo) lo = smp[i]; if (smp[i] > hi) hi = smp[i]; }
          g.fillRect(x, mid - hi * (H / 2 - 2), 1, Math.max(1, (hi - lo) * (H / 2 - 2)));
        }
      } else if (sp < 25 && a?.peaks) {
        g.fillStyle = '#ffd75e90';
        for (let x = 0; x < w; x += 1) {
          const i0 = Math.floor((s0 + (x / w) * sp) * 100); const i1 = Math.max(i0 + 1, Math.floor((s0 + ((x + 1) / w) * sp) * 100));
          let m = 0; for (let i = i0; i < i1 && i < a.peaks.length; i += 1) m = Math.max(m, a.peaks[i]);
          const hh = m * (H / 2 - 2);
          g.fillRect(x, mid - hh, 1, hh * 2 || 1);
        }
      } else if (a) {
        const n = a.bass.length;
        const idx = (x) => Math.min(n - 1, Math.max(0, Math.floor(((s0 + (x / w) * sp) / D()) * n)));
        const line = (arr, color, fill) => {
          g.beginPath();
          for (let x = 0; x <= w; x += 1) { const y = top + H - arr[idx(x)] * (H - 4); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
          if (fill) { g.lineTo(w, top + H); g.lineTo(0, top + H); g.closePath(); g.fillStyle = color; g.fill(); } else { g.strokeStyle = color; g.lineWidth = 1; g.stroke(); }
        };
        line(a.bass, '#ffd75e55', true);
        line(a.mid, '#48ddffaa', false);
        line(a.treble, '#bd8bffaa', false);
      }
      // beat grid: downbeats red with bar numbers (like rekordbox), beats white, subdivisions faint
      const bs = beats(); const bpb = bpbNow(); const bpm = bpmNow() || 120;
      const pxPerBeat = (60 / bpm / sp) * w;
      if (bs.length && pxPerBeat > 4) {
        const div = DIV[snapMode] || 1;
        const i0 = Math.max(0, beatIndex(bs, s0)); const i1 = Math.min(bs.length - 1, beatIndex(bs, s0 + sp) + 1);
        for (let i = i0; i <= i1; i += 1) {
          const n = beatNo(bs, i, map.grid); const down = mod(n, bpb) === 0;
          const x = Math.round(X(bs[i]));
          g.fillStyle = down ? '#ff6a6ad0' : '#ffffff55';
          g.fillRect(x, top, down ? 2 : 1, H);
          if (down && (pxPerBeat * bpb) > 26) { g.fillStyle = '#ff9a8a'; g.fillText(String(Math.floor(n / bpb) + 1), x + 3, top + 10); }
          if (div > 1 && i < bs.length - 1 && (pxPerBeat / div) > 7) {
            g.fillStyle = '#ffffff1c';
            for (let k = 1; k < div; k += 1) g.fillRect(Math.round(X(bs[i] + ((bs[i + 1] - bs[i]) * k) / div)), top, 1, H);
          }
        }
      } else if (bs.length) {
        g.fillStyle = '#eae0d540';
        for (const b of bs) if (b >= s0 && b <= s0 + sp) g.fillRect(X(b), top, 1, 3);
      }
      if (a) { g.fillStyle = '#ff6a6a'; for (const d of a.drops) { const x = X(d); g.beginPath(); g.moveTo(x - 4, top); g.lineTo(x + 4, top); g.lineTo(x, top + 7); g.fill(); } }
      // hit lanes
      LANES.forEach((ln, li) => {
        const y = LT + li * LANE_H;
        g.fillStyle = li % 2 ? '#ffffff06' : '#ffffff0c';
        g.fillRect(0, y, w, LANE_H);
        g.fillStyle = `${ln.color}90`;
        g.fillText(ln.name.toUpperCase(), 4, y + 10);
        for (const m of map.marks[ln.id]) {
          if (m < s0 || m > s0 + sp) continue;
          const x = X(m);
          const sel = selected?.type === 'mark' && selected.lane === ln.id && Math.abs(selected.t - m) < 1e-4;
          g.fillStyle = ln.color;
          g.fillRect(Math.round(x) - 2, y + 2, 4, LANE_H - 4);
          if (sel) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(Math.round(x) - 3.5, y + 1, 7, LANE_H - 2); }
          if (sp < 8) { g.fillStyle = `${ln.color}40`; g.fillRect(Math.round(x), top, 1, H); }
        }
      });
      // layer tracks: a bar for when each layer is on screen
      const TT = h - tracks.length * TRACK_H;
      tracks.forEach((tr, i) => {
        const y = TT + i * TRACK_H;
        g.fillStyle = tr.selected ? '#ffd75e16' : i % 2 ? '#ffffff05' : '#ffffff0a';
        g.fillRect(0, y, w, TRACK_H);
        const a0 = tr.in ?? 0; const b0 = tr.out ?? D();
        const xa = X(a0); const xb = X(b0);
        const col = tr.color || '#7ad0ff';
        g.globalAlpha = tr.visible === false ? 0.3 : 1;
        g.fillStyle = `${col}50`;
        g.fillRect(xa, y + 2, xb - xa, TRACK_H - 4);
        g.fillStyle = col;
        g.fillRect(xa, y + 2, 3, TRACK_H - 4);
        g.fillRect(xb - 3, y + 2, 3, TRACK_H - 4);
        if (tr.fadeIn) { g.fillStyle = `${col}90`; g.beginPath(); g.moveTo(xa, y + TRACK_H - 2); g.lineTo(X(a0 + tr.fadeIn), y + 2); g.lineTo(xa, y + 2); g.fill(); }
        if (tr.fadeOut) { g.fillStyle = `${col}90`; g.beginPath(); g.moveTo(xb, y + TRACK_H - 2); g.lineTo(X(b0 - tr.fadeOut), y + 2); g.lineTo(xb, y + 2); g.fill(); }
        g.globalAlpha = 1;
        g.fillStyle = tr.selected ? '#ffffff' : '#eae0d5b0';
        g.fillText(`${tr.visible === false ? '(hidden) ' : ''}${tr.name}${tr.in == null && tr.out == null ? ' · whole song' : ''}`, Math.max(4, Math.min(xa + 6, xb - 40)), y + 11);
        if (tr.selected) { g.strokeStyle = '#ffd75e'; g.lineWidth = 1; g.strokeRect(Math.max(0, xa) + 0.5, y + 1.5, Math.max(2, Math.min(w, xb) - Math.max(0, xa) - 1), TRACK_H - 3); }
        // keyframes: ◆ (filled = ease, square = hold, outline diamond = linear)
        for (const k of tr.keys || []) {
          const kt = dragging?.kind === 'key' && dragging.id === tr.id && Math.abs(dragging.from - k.t) < 1e-3 ? dragging.now : k.t;
          if (kt < s0 || kt > s0 + sp) continue;
          const kx = Math.round(X(kt)); const ky = y + TRACK_H / 2; const r0 = 4.5;
          g.fillStyle = tr.selected ? '#ffffff' : '#eae0d5';
          g.strokeStyle = '#0b0e10';
          g.lineWidth = 1;
          g.beginPath();
          if (k.ease === 'hold') g.rect(kx - 3.5, ky - 3.5, 7, 7);
          else { g.moveTo(kx, ky - r0); g.lineTo(kx + r0, ky); g.lineTo(kx, ky + r0); g.lineTo(kx - r0, ky); g.closePath(); }
          if (k.ease === 'linear') { g.stroke(); g.strokeStyle = tr.selected ? '#ffffff' : '#eae0d5'; g.stroke(); } else { g.fill(); g.stroke(); }
        }
      });
      // loop region
      if (region) {
        const xa = X(region.a); const xb = X(region.b);
        g.fillStyle = locked ? '#48ddff1a' : '#ffd75e1a';
        g.fillRect(xa, 0, xb - xa, LT);
        g.fillStyle = locked ? '#48ddff0d' : '#ffd75e0d';
        g.fillRect(xa, LT, xb - xa, h - LT);
        g.fillStyle = locked ? '#48ddff' : '#ffd75e';
        g.fillRect(xa, 0, xb - xa, 3);
        for (const [edge, x] of [['a', xa], ['b', xb]]) {
          g.fillRect(Math.round(x) - 1, 0, 2, h);
          if (!locked) g.fillRect(Math.round(x) - 4, 0, 8, RULER - 2);
          if (selected?.type === 'edge' && selected.edge === edge) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(Math.round(x) - 5, 0.5, 10, RULER - 1); }
        }
      }
      if (t >= s0 && t <= s0 + sp) { g.fillStyle = '#ffffff'; g.fillRect(Math.round(X(t)), 0, 2, h); }
    }
    function drawMinimap(t) {
      minimap.hidden = !D();
      const w = minimap.clientWidth; const h = minimap.clientHeight;
      if (!D() || !w || !h) return;
      const dpr = devicePixelRatio || 1;
      if (minimap.width !== Math.round(w * dpr) || minimap.height !== Math.round(h * dpr)) { minimap.width = Math.round(w * dpr); minimap.height = Math.round(h * dpr); }
      const g = minimap.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const X = (tt) => (tt / D()) * w;
      const a = st.analysis;
      if (a) {
        for (const sct of a.sections) if (sct.energy === 'loud') { g.fillStyle = '#ffd75e14'; g.fillRect(X(sct.start), 0, X(sct.end) - X(sct.start), h); }
        const n = a.level.length;
        g.fillStyle = '#ffffff16';
        for (let x = 0; x < w; x += 2) { const v = a.level[Math.min(n - 1, Math.floor((x / w) * n))]; g.fillRect(x, h - v * (h - 2), 2, v * (h - 2)); }
      }
      const rows = Math.max(1, tracks.length);
      const rowH = Math.max(2, Math.min(5, (h - 4) / rows));
      tracks.forEach((tr, i) => {
        const x0 = X(tr.in ?? 0); const x1 = X(tr.out ?? D());
        g.fillStyle = `${tr.color || '#7ad0ff'}${tr.visible === false ? '40' : 'd0'}`;
        g.fillRect(x0, 2 + i * rowH, Math.max(2, x1 - x0), rowH - 1);
      });
      if (region) { g.fillStyle = locked ? '#48ddff40' : '#ffd75e40'; g.fillRect(X(region.a), 0, Math.max(2, X(region.b) - X(region.a)), h); }
      if (a) { g.fillStyle = '#ff6a6a'; for (const d of a.drops) g.fillRect(X(d) - 1, 0, 2, 4); }
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(X(t)), 0, 2, h);
      if (view) {
        const vx = X(view.start); const vw = Math.max(4, X(view.end) - vx);
        g.fillStyle = '#ffffff14';
        g.fillRect(vx, 0, vw, h);
        g.strokeStyle = locked ? '#48ddff' : '#ffffffc0';
        g.lineWidth = 1.5;
        g.strokeRect(vx + 0.75, 0.75, vw - 1.5, h - 1.5);
      }
    }

    // ---------- timeline mouse ----------
    const timeAt = (e) => { const r = canvas.getBoundingClientRect(); return v0() + ((e.clientX - r.left) / r.width) * span(); };
    const pxToT = (px) => (px / canvas.clientWidth) * span();
    const xOf = (tt) => ((tt - v0()) / span()) * canvas.clientWidth;
    function hitTest(e) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left; const y = e.clientY - r.top;
      const LT = laneTop(r.height);
      const TT = r.height - tracks.length * TRACK_H;
      if (tracks.length && y >= TT) {
        const tr = tracks[Math.min(tracks.length - 1, Math.floor((y - TT) / TRACK_H))];
        const key = (tr.keys || []).find((k) => Math.abs(xOf(k.t) - x) <= 5);
        if (key) return { zone: 'track', track: tr, key };
        const a0 = tr.in ?? 0; const b0 = tr.out ?? D();
        const edge = Math.abs(xOf(a0) - x) <= 6 ? 'in' : Math.abs(xOf(b0) - x) <= 6 ? 'out' : null;
        const tt = v0() + (x / r.width) * span();
        return { zone: 'track', track: tr, edge, inside: tt >= a0 && tt <= b0 };
      }
      if (y < RULER) {
        const edge = region && ['a', 'b'].find((k) => Math.abs(xOf(region[k]) - x) <= 6);
        return { zone: 'ruler', edge };
      }
      if (y >= LT) {
        const lane = LANES[Math.min(LANES.length - 1, Math.floor((y - LT) / LANE_H))].id;
        let mark = null; let best = 7;
        for (const m of map.marks[lane]) { const d = Math.abs(xOf(m) - x); if (d < best) { best = d; mark = m; } }
        return { zone: 'lane', lane, mark };
      }
      return { zone: 'wave' };
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (!D() || e.button !== 0) return;
      const hit = hitTest(e);
      const tt = timeAt(e);
      canvas.setPointerCapture(e.pointerId);
      if (hit.zone === 'ruler' && !locked) {
        if (hit.edge) { dragging = { kind: 'edge', edge: hit.edge }; selected = { type: 'edge', edge: hit.edge }; }
        else if (region && tt > region.a && tt < region.b) dragging = { kind: 'move', from: tt, orig: { ...region } };
        else dragging = { kind: 'new', from: snapT(tt) };
      } else if (hit.zone === 'lane') {
        if (hit.mark != null) { selected = { type: 'mark', lane: hit.lane, t: hit.mark }; dragging = { kind: 'mark', from: tt, orig: hit.mark, before: JSON.stringify(map) }; }
        else { addMarkAt(hit.lane, tt); dragging = { kind: 'mark', from: tt, orig: selected.t, added: true }; }
      } else if (hit.zone === 'track') {
        const { id } = hit.track;
        const a0 = hit.track.in ?? 0; const b0 = hit.track.out ?? D();
        trackHandlers.onSelect?.(id);
        if (hit.key) dragging = { kind: 'key', id, from: hit.key.t, now: hit.key.t, grab: tt, moved: false };
        else if (hit.edge) dragging = { kind: 'trim', id, edge: hit.edge, a: a0, b: b0 };
        else if (hit.inside) dragging = { kind: 'clip', id, from: tt, a: a0, b: b0 };
        else dragging = { kind: 'none' };
      } else { dragging = { kind: 'seek' }; selected = null; seek(tt); }
      draw();
      const move = (ev) => {
        const t2 = Math.max(0, Math.min(D(), timeAt(ev)));
        if (dragging.kind === 'seek') seek(t2);
        else if (dragging.kind === 'edge') {
          const r2 = { ...region, [dragging.edge]: snapT(t2) };
          if (r2.b < r2.a) { [r2.a, r2.b] = [r2.b, r2.a]; dragging.edge = dragging.edge === 'a' ? 'b' : 'a'; selected = { type: 'edge', edge: dragging.edge }; }
          setRegion(r2, { persist: false });
        } else if (dragging.kind === 'move') {
          const len = dragging.orig.b - dragging.orig.a;
          let a2 = snapT(dragging.orig.a + (t2 - dragging.from));
          a2 = Math.max(0, Math.min(D() - len, a2));
          setRegion({ a: a2, b: a2 + len }, { persist: false });
        } else if (dragging.kind === 'new') {
          const b2 = snapT(t2);
          if (Math.abs(b2 - dragging.from) > pxToT(3)) setRegion({ a: Math.min(dragging.from, b2), b: Math.max(dragging.from, b2) }, { persist: false });
        } else if (dragging.kind === 'mark') {
          moveSelectedMark(snapT(dragging.orig + (t2 - dragging.from)));
          sendMap();
          draw();
        } else if (dragging.kind === 'key') {
          const to = Math.max(0, Math.min(D(), snapT(dragging.from + (t2 - dragging.grab))));
          if (Math.abs(to - dragging.from) > 1e-4 || dragging.moved) { dragging.moved = true; dragging.now = to; draw(); }
        } else if (dragging.kind === 'trim' || dragging.kind === 'clip') {
          let { a, b } = dragging;
          if (dragging.kind === 'trim') { const v = snapT(t2); if (dragging.edge === 'in') a = Math.max(0, Math.min(v, b - 0.05)); else b = Math.min(D(), Math.max(v, a + 0.05)); }
          else { const len = b - a; a = Math.max(0, Math.min(D() - len, snapT(a + (t2 - dragging.from)))); b = a + len; }
          dragging.now = { in: r4(a), out: r4(b) };
          trackHandlers.onChange?.(dragging.id, dragging.now, { final: false });
        }
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', () => {
        canvas.removeEventListener('pointermove', move);
        if (dragging?.kind === 'edge' || dragging?.kind === 'move' || dragging?.kind === 'new') saveLoop();
        if ((dragging?.kind === 'trim' || dragging?.kind === 'clip') && dragging.now) trackHandlers.onChange?.(dragging.id, dragging.now, { final: true });
        if (dragging?.kind === 'key') { if (dragging.moved && Math.abs(dragging.now - dragging.from) > 1e-4) trackHandlers.onKeyMove?.(dragging.id, dragging.from, dragging.now); else seek(dragging.from); }
        if (dragging?.kind === 'mark') {
          // Only a marker that actually moved becomes an undo step.
          if (dragging.before && dragging.before !== JSON.stringify(map)) { mapUndo.push(dragging.before); if (mapUndo.length > 80) mapUndo.shift(); }
          mapChanged();
        }
        dragging = null;
        paint();
      }, { once: true });
    });
    canvas.addEventListener('dblclick', (e) => {
      const hit = hitTest(e);
      if (hit.zone === 'lane' && hit.mark != null) { selected = { type: 'mark', lane: hit.lane, t: hit.mark }; deleteSelectedMark(); return; }
      if (hit.zone === 'track' && hit.key) { trackHandlers.onKeyDelete?.(hit.track.id, hit.key.t); return; }
      if (hit.zone === 'track') {
        // Fit the layer to the loop; again (or with no loop) → the whole song.
        const tr = hit.track;
        const onLoop = region && Math.abs((tr.in ?? -1) - region.a) < 1e-3 && Math.abs((tr.out ?? -1) - region.b) < 1e-3;
        const next = region && !onLoop ? { in: region.a, out: region.b } : { in: null, out: null };
        trackHandlers.onChange?.(tr.id, next, { final: true });
        toast(next.in == null ? `"${tr.name}" now plays for the whole song` : `"${tr.name}" now plays during the loop`, { timeout: 1800 });
        return;
      }
      if (hit.zone !== 'wave' || locked || !st.analysis) return;
      const tt = timeAt(e);
      const sec = st.analysis.sections.find((s) => tt >= s.start && tt < s.end);
      if (sec) { setRegion({ a: snapT(sec.start), b: snapT(sec.end) }); toast(`Looping the ${sec.energy} part ${fmtTime(sec.start)}–${fmtTime(sec.end)}`, { timeout: 2000 }); }
    });
    canvas.addEventListener('contextmenu', (e) => {
      const hit = hitTest(e);
      if (hit.zone === 'lane' && hit.mark != null) { e.preventDefault(); selected = { type: 'mark', lane: hit.lane, t: hit.mark }; deleteSelectedMark(); }
      if (hit.zone === 'track' && hit.key) {
        e.preventDefault();
        const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
        const set = (ease) => () => trackHandlers.onKeyEase?.(hit.track.id, hit.key.t, ease);
        menuAt(anchor, [
          ['Ease', 'Smooth start and stop (default)', set('ease')],
          ['Linear', 'Constant speed to the next keyframe', set('linear')],
          ['Hold', 'Jump to the next keyframe\'s value when it comes', set('hold')],
          null,
          ['Delete keyframe', `At ${fmtMs(hit.key.t)}`, () => trackHandlers.onKeyDelete?.(hit.track.id, hit.key.t)],
        ]);
      }
    });
    canvas.addEventListener('wheel', (e) => {
      if (!D()) return;
      e.preventDefault();
      if (locked) return;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const d = ((e.shiftKey ? e.deltaY : e.deltaX) || 0) / canvas.clientWidth * span() * 1.5;
        setView({ start: v0() + d, end: v0() + d + span() });
      } else zoomBy(e.deltaY > 0 ? 1.25 : 0.8, timeAt(e));
    }, { passive: false });
    canvas.addEventListener('mousemove', (e) => {
      if (!D()) return;
      const hit = hitTest(e);
      const tt = timeAt(e);
      canvas.style.cursor = hit.zone === 'track' ? (hit.key ? 'move' : hit.edge ? 'ew-resize' : hit.inside ? 'grab' : 'default') : hit.zone === 'lane' ? (hit.mark != null ? 'ew-resize' : 'cell') : locked ? 'pointer' : hit.zone === 'ruler' ? (hit.edge ? 'ew-resize' : 'copy') : 'pointer';
      const tips = {
        ruler: locked ? 'Locked: click to jump' : 'Drag along this strip to draw a loop; drag its edges to adjust',
        wave: 'Click to jump · double-click to loop this part · wheel to zoom · Shift+wheel to scroll',
        lane: 'Click to add a marker here · drag to move · double-click or right-click to delete · or press K / S / H while it plays',
        track: hit.key ? `Keyframe at ${fmtMs(hit.key.t)}: click to jump there · drag to move · double-click to delete · right-click for Ease / Linear / Hold` : `${hit.track?.name || 'Layer'}: drag the bar to move it in time · drag its ends to trim · double-click to fit it to the loop (again: whole song)`,
      };
      canvas.title = `${fmtMs(tt)}\n${tips[hit.zone]}`;
    });
    minimap.addEventListener('pointerdown', (e) => {
      if (!D() || e.button !== 0) return;
      minimap.setPointerCapture(e.pointerId);
      const r = minimap.getBoundingClientRect();
      const tAt = (ev) => Math.max(0, Math.min(D(), ((ev.clientX - r.left) / r.width) * D()));
      let act;
      if (view && !locked) {
        // drag the zoomed window (grab it where you clicked, or centre it on the click)
        const t0 = tAt(e);
        const off = t0 >= view.start && t0 <= view.end ? t0 - view.start : span() / 2;
        act = (ev) => { const st0 = tAt(ev) - off; setView({ start: st0, end: st0 + span() }); };
      } else act = (ev) => seek(tAt(ev));
      act(e);
      minimap.addEventListener('pointermove', act);
      minimap.addEventListener('pointerup', () => minimap.removeEventListener('pointermove', act), { once: true });
    });
    new ResizeObserver(() => draw()).observe(minimap);
    new ResizeObserver(() => draw()).observe(canvas);
    paint();

    return {
      el: bar,
      load, pick, attach, toggle, seek, onMessage, unload, onKey, setTracks,
      get duration() { return D(); },
      get loop() { return region ? { ...region } : null; },
      setLoop(a, b) { if (locked) return false; setRegion(a == null ? null : { a, b }); return true; },
      get recording() { return Boolean(recording); },
      get loaded() { return Boolean(st.bytes); },
      get path() { return st.path; },
      get time() { return now(); },
      // For the Three Director: what's loaded, the user's grid and hit markers, and the song's shape.
      info() {
        if (!st.bytes) return { loaded: false, note: 'No music loaded. Sketches get a demo 120 bpm beat; the user can load a file with "🎵 Load audio / video…" or you can use three_load_media.' };
        const a = st.analysis;
        const hits = Object.fromEntries(LANES.map((ln) => [ln.id, { count: map.marks[ln.id].length, first: map.marks[ln.id].slice(0, 12) }]));
        const out = {
          loaded: true, file: st.path, video: st.video, duration: Math.round(D() * 1000) / 1000, time: Math.round(now() * 1000) / 1000, playing: st.playing,
          loop: region ? { start: region.a, end: region.b, locked, on: st.loop } : (st.loop ? 'whole song' : 'off'),
          grid: map.grid ? { bpm: map.grid.bpm, firstDownbeat: map.grid.anchor, beatsPerBar: map.grid.bpb, setBy: 'the user (trust it)' } : { bpm: a?.bpm, setBy: 'auto-detected' },
          hits: { ...hits, setBy: 'the user, by hand: cut and hit on these, not on guesses' },
        };
        if (!a) return { ...out, analysis: analyzing ? 'still analyzing' : 'none (no audio track)' };
        const per = 5; const n = a.bass.length; const stepN = per * a.fps;
        const avg = (arr, i) => { let s = 0; let c = 0; for (let k = i; k < Math.min(n, i + stepN); k += 1) { s += arr[k]; c += 1; } return Math.round((s / (c || 1)) * 100) / 100; };
        const energy = [];
        for (let i = 0; i < n; i += stepN) energy.push({ at: Math.round(i / a.fps), level: avg(a.level, i), bass: avg(a.bass, i), mid: avg(a.mid, i), highs: avg(a.treble, i) });
        return { ...out, beats: beats().length, sections: a.sections, drops: a.drops, energyEvery5s: energy };
      },
    };
  }

  return { analyze, stage, player, isMedia, SIZES, _test: { gridBeats, snapTime, parseTime, fmtMs, beatIndex, addMark } };
})();
