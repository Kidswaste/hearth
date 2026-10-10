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
    // in the "More…" list
    { id: '21:9', w: 2560, h: 1080, label: '21:9', title: '2560×1080: cinematic widescreen', extra: true },
    { id: '4:3', w: 1440, h: 1080, label: '4:3', title: '1440×1080: classic TV / VHS look', extra: true },
    { id: '2:3', w: 1080, h: 1620, label: '2:3', title: '1080×1620: Pinterest, posters', extra: true },
    { id: '4k', w: 3840, h: 2160, label: '4K', title: '3840×2160: 4K video', extra: true },
    { id: '4k-v', w: 2160, h: 3840, label: '4K 9:16', title: '2160×3840: vertical 4K', extra: true },
  ];
  const BASE_SIZES = SIZES.filter((s) => !s.extra);
  const EXTRA_SIZES = SIZES.filter((s) => s.extra);
  const extOf = (p) => (p.split('.').pop() || '').toLowerCase();
  const isMedia = (p) => [...AUDIO_EXT, ...VIDEO_EXT].includes(extOf(p));
  const fmtTime = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  const base = (p) => p.split(/[\\/]/).pop();

  // ---------- analysis ----------
  // Decodes the audio at 22 kHz (the browser does that off the main thread), then hands the samples to the analysis
  // Worker (tools/three-music-core.js: the same file the page loads as MusicCore): band envelopes, spectral-flux
  // onsets, the tempo and a straight grid through the beats, where bar 1 is, kick / snare / hat hits, sections
  // (intro / build / drop / break / outro) and a style guess. If a Worker can't start, it runs here instead.
  // onProgress(0..1) while it works. The result keeps `samples` (mono, for sample-level zoom) and `wave` (3-band
  // peaks for the timeline); the player keeps both and never sends them to the sketch.
  async function analyze(bytes, { onProgress } = {}) {
    const SR = 22050;
    const decoded = await new OfflineAudioContext(1, 1, SR).decodeAudioData(bytes.slice(0));
    const channels = () => Array.from({ length: decoded.numberOfChannels }, (_, c) => { const a = new Float32Array(decoded.length); decoded.copyFromChannel(a, c); return a; });
    const inline = () => {
      const ch = channels(); const mono = ch[0];
      for (let c = 1; c < ch.length; c += 1) for (let i = 0; i < mono.length; i += 1) mono[i] += ch[c][i];
      if (ch.length > 1) for (let i = 0; i < mono.length; i += 1) mono[i] /= ch.length;
      return { result: MusicCore.analyzeSignal(mono, SR, { onProgress }), mono };
    };
    const viaWorker = () => new Promise((resolve, reject) => {
      let w;
      try { w = new Worker('tools/three-music-core.js'); } catch { resolve(null); return; }
      let started = false;
      w.onmessage = (e) => {
        const d = e.data || {};
        started = true;
        if (d.progress != null) { onProgress?.(d.progress); return; }
        w.terminate();
        if (d.error) reject(new Error(d.error)); else resolve({ result: d.result, mono: d.mono });
      };
      w.onerror = (e) => { e.preventDefault?.(); w.terminate(); if (started) reject(new Error(e.message || 'The analysis stopped')); else resolve(null); };
      const ch = channels();
      w.postMessage({ id: 1, channels: ch, sampleRate: SR }, ch.map((c) => c.buffer));
    });
    const fromWorker = await viaWorker();
    const out = fromWorker || inline();
    analyze.lastWorker = Boolean(fromWorker); // for the tests: did it run off the main thread
    return { ...out.result, samples: out.mono };
  }

  // ---------- frame sizes ----------
  // Exact sizes render the sketch at that many pixels (1 device pixel each) and scale it to fit.
  // The four social sizes you switch between most sit in one segmented control (in the order you use them);
  // the rest are in "More…". Safe zones show where each platform puts its buttons, captions and crops.
  const PILL_ORDER = ['fit', '9:16', '16:9', '4:5', '1:1'];
  const SAFE = {
    // fractions of the frame covered by the platform's UI: top, bottom, right (9:16) and labels
    tiktok: { name: 'TikTok', top: 0.085, bottom: 0.2, right: 0.13, left: 0.05 },
    reels: { name: 'Reels', top: 0.14, bottom: 0.22, right: 0.12, left: 0.05 },
    shorts: { name: 'Shorts', top: 0.1, bottom: 0.21, right: 0.15, left: 0.05 },
  };
  function stage(host, frame, { onChange }) {
    let mode = store.get('three.aspect', 'fit');
    let safe = store.get('three.safeZones', true);
    let platform = store.get('three.safePlatform', 'tiktok');
    const pillSizes = PILL_ORDER.map((id) => SIZES.find((s) => s.id === id));
    const buttons = pillSizes.map((s) => {
      const b = el('button', { class: 'stage-btn stage-size-btn', text: s.label, title: `${s.title}${s.w ? ` · Shift+${PILL_ORDER.indexOf(s.id) + 1}` : ' · Shift+1'}`, on: { click: () => setMode(s.id) } });
      b.dataset.feature = s.w ? `${s.w}×${s.h}` : 'Fit';
      b.dataset.key = `Shift+${PILL_ORDER.indexOf(s.id) + 1}`;
      return b;
    });
    const seg = el('span', { class: 'stage-seg' }, ...buttons);
    // Your own size (e.g. 1440×2560 or a banner), remembered; it shows in "More…" next to the others.
    function setCustom(w, h) {
      w = Math.round(Math.max(64, Math.min(7680, w))); h = Math.round(Math.max(64, Math.min(7680, h)));
      let c = SIZES.find((x) => x.id === 'custom');
      if (!c) { c = { id: 'custom', extra: true }; SIZES.push(c); }
      Object.assign(c, { w, h, label: `${w}×${h}`, title: `${w}×${h}: your own size` });
      store.set('three.customSize', { w, h });
      return c;
    }
    { const c0 = store.get('three.customSize', null); if (c0?.w) setCustom(c0.w, c0.h); }
    const moreSel = el('select', { class: 'stage-more', title: 'More frame sizes: 21:9, 4:3, 2:3, 4K, your own' });
    const fillMore = () => moreSel.replaceChildren(el('option', { value: '', text: 'More…' }), ...SIZES.filter((x) => x.extra).map((x) => el('option', { value: x.id, text: x.id === 'custom' ? `Yours · ${x.w}×${x.h}` : `${x.label} · ${x.w}×${x.h}` })), el('option', { value: '+custom', text: 'Your own size…' }));
    fillMore();
    moreSel.addEventListener('change', async () => {
      if (moreSel.value === '+custom') {
        const c = SIZES.find((x) => x.id === 'custom');
        const v = await Modal.prompt('Your own frame size', { value: c ? `${c.w}x${c.h}` : '1440x2560', placeholder: 'width x height, e.g. 1440x2560' });
        const m = String(v || '').match(/(\d+)\s*[x×*, ]\s*(\d+)/i);
        if (m) { setCustom(Number(m[1]), Number(m[2])); fillMore(); setMode('custom'); } else layout();
        return;
      }
      if (moreSel.value) setMode(moreSel.value);
    });
    const safeBtn = el('button', { class: 'stage-btn', text: 'Safe', title: 'Safe zones: where TikTok / Reels / Shorts put their buttons and captions, Instagram\'s grid crop, title-safe areas · right-click: which platform', on: { click: () => { safe = !safe; store.set('three.safeZones', safe); layout(); } } });
    safeBtn.dataset.feature = 'Safe zones';
    safeBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ThreeTweaks.menu(e.clientX, e.clientY, ['Safe zones for 9:16', ...Object.entries(SAFE).map(([k, v]) => [v.name, k === 'tiktok' ? 'Caption + buttons on the right' : k === 'reels' ? 'Instagram Reels' : 'YouTube Shorts', () => { platform = k; safe = true; store.set('three.safePlatform', k); store.set('three.safeZones', true); layout(); }, platform === k])]);
    });
    const sizeLabel = el('span', { class: 'stage-size' });
    const pill = el('div', { class: 'stage-pill' }, seg, moreSel, safeBtn, sizeLabel);
    const zones = el('div', { class: 'safe-zones', hidden: true });
    host.append(pill, zones);
    const current = () => SIZES.find((s) => s.id === mode) || SIZES[0];
    // The overlay for the current size: platform UI boxes (9:16), Instagram's 3:4 grid crop (4:5),
    // title-safe / action-safe frames (16:9, 1:1 and the rest).
    function paintZones(s) {
      const box = (cls, st, text) => { const d = el('div', { class: `sz ${cls}`, text: text || '' }); Object.assign(d.style, st); return d; };
      const pct = (x) => `${(x * 100).toFixed(2)}%`;
      if (s.id === '9:16' || s.id === '4k-v') {
        const P = SAFE[platform] || SAFE.tiktok;
        zones.replaceChildren(box('top', { height: pct(P.top) }, `${P.name}: status / tabs`), box('bottom', { height: pct(P.bottom), right: pct(P.right) }, 'Caption and name'), box('right', { width: pct(P.right), top: pct(P.top), bottom: pct(P.bottom * 0.55) }, 'Buttons'),
          box('frame', { left: pct(P.left), right: pct(P.right), top: pct(P.top), bottom: pct(P.bottom) }, ''));
      } else if (s.id === '4:5') {
        const side = (1 - (1350 * 3 / 4) / 1080) / 2;
        zones.replaceChildren(box('crop left', { width: pct(side) }), box('crop right', { width: pct(side) }), box('frame dashed', { left: pct(side), right: pct(side), top: '0', bottom: '0' }, 'Profile grid shows 3:4'),
          box('frame', { left: '0', right: '0', top: pct((1350 - 1080) / 2 / 1350), bottom: pct((1350 - 1080) / 2 / 1350) }, '1:1 center'));
      } else zones.replaceChildren(box('frame', { left: '5%', right: '5%', top: '5%', bottom: '5%' }, 'Title safe'), box('frame dashed', { left: '3.5%', right: '3.5%', top: '3.5%', bottom: '3.5%' }, ''));
    }
    function layout() {
      const s = current();
      buttons.forEach((b, i) => b.classList.toggle('on', pillSizes[i].id === mode));
      moreSel.value = s.extra ? s.id : ''; moreSel.classList.toggle('on', Boolean(s.extra));
      safeBtn.hidden = !s.w;
      safeBtn.classList.toggle('on', safe);
      safeBtn.textContent = safe && (s.id === '9:16' || s.id === '4k-v') ? `Safe · ${(SAFE[platform] || SAFE.tiktok).name}` : 'Safe';
      host.classList.toggle('exact', Boolean(s.w));
      host.dataset.frame = s.id;
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
      zones.hidden = !safe;
      if (safe && zones.dataset.for !== `${s.id}|${platform}`) { zones.dataset.for = `${s.id}|${platform}`; paintZones(s); }
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
      // where the picture sits inside the preview (for overlays such as the onion skin): { left, top, width, height } in px
      get rect() { const s = current(); if (!s.w) return { left: 0, top: 0, width: host.clientWidth, height: host.clientHeight }; const W = host.clientWidth; const H = host.clientHeight; const k = Math.min(W / s.w, H / s.h); return { left: (W - s.w * k) / 2, top: (H - s.h * k) / 2, width: s.w * k, height: s.h * k }; },
      setMode, pill,
      setCustom(w, h) { setCustom(w, h); fillMore(); setMode('custom'); return this.size; },
      setSafe(on, plat) { if (plat && SAFE[plat]) { platform = plat; store.set('three.safePlatform', plat); } safe = on ?? !safe; store.set('three.safeZones', safe); zones.dataset.for = ''; layout(); return safe; },
      get safe() { return safe; },
      sizes: SIZES.map((s) => s.id),
      pillOrder: PILL_ORDER,
    };
  }

  // ---------- beat grid + hit markers ----------
  // A manual grid is { bpm, anchor (a downbeat "1", seconds), bpb (beats per bar) }; without one the
  // detected beats are used. Hit markers are the user's own kick / snare / hit times.
  const METERS = [['4', '4/4'], ['3', '3/4'], ['6', '6/8']];
  const SNAPS = [['off', 'Off'], ['bar', 'Bar'], ['1/4', 'Beat'], ['1/8', '1/8'], ['1/16', '1/16'], ['1/32', '1/32'], ['hits', 'Hits']];
  const DIV = { '1/4': 1, '1/8': 2, '1/16': 4, '1/32': 8 };
  const LANES = [{ id: 'kick', name: 'Kick', key: 'k', color: '#ff6a6a' }, { id: 'snare', name: 'Snare', key: 's', color: '#48ddff' }, { id: 'hit', name: 'Hit', key: 'h', color: '#bd8bff' },
    // extra rows: only shown once they have markers (⚡ Triggers → Timeline writes them), no tap key
    { id: 'bass', name: 'Bass', key: null, color: '#ff9f43', extra: true }, { id: 'hats', name: 'Hats', key: null, color: '#c4ff4d', extra: true }];
  const CORE_LANES = LANES.filter((l) => !l.extra);
  const emptyMarks = (m) => Object.fromEntries(LANES.map((l) => [l.id, m?.[l.id] || []]));
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
  // off: which detected beat is a bar's 1 (when there's no straight grid)
  function snapTime(t, mode, grid, beats, off = 0) {
    if (mode === 'off' || !beats.length) return t;
    if (grid) {
      const p = 60 / grid.bpm;
      const step = mode === 'bar' ? p * grid.bpb : p / DIV[mode];
      return r4(grid.anchor + Math.round((t - grid.anchor) / step) * step);
    }
    const i = Math.max(0, Math.min(beats.length - 2, beatIndex(beats, t)));
    if (mode === 'bar') {
      const k0 = Math.max(0, i - mod(i - off, 4)); const k1 = Math.min(beats.length - 1, k0 + 4);
      return Math.abs(beats[k0] - t) <= Math.abs(beats[k1] - t) ? beats[k0] : beats[k1];
    }
    const a = beats[i]; const step = (beats[i + 1] - a) / DIV[mode];
    return r4(a + Math.round((t - a) / step) * step);
  }
  const snapStep = (mode, grid, bpm) => { const p = 60 / (grid?.bpm || bpm || 120); return mode === 'bar' ? p * (grid?.bpb || 4) : mode === 'off' ? p : p / (DIV[mode] || 4); };
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
  // onCue({ index, cues, playing }) when playback enters another cue's section; lookChoices() → [{ layer, layerName, names }].
  // frame: { get() → { id, width, height }, set(id) } so the record menu can switch between the social sizes.
  // onCueLookHere(cue) → { layer, name } saves the selected layer's current sliders as a look for that cue.
  function player({ send, sketchName, onLoaded, onPick, onCue, lookChoices, frame: frameHook, onCueLookHere }) {
    const st = { path: null, name: null, bytes: null, mime: null, video: false, clock: null, analysis: null, samples: null, time: 0, duration: 0, playing: false, loop: store.get('three.mediaLoop', true), volume: store.get('three.mediaVolume', 0.8), stampAt: 0, rate: 1 };
    let region = null; // { a, b } seconds
    let locked = false;
    let snapMode = store.get('three.snapMode', '1/4');
    let view = null; // { start, end } seconds when zoomed in
    let recording = null;
    let analyzing = false;
    let dragging = null;
    let selected = null; // { type: 'edge', edge } | { type: 'mark', lane, t }
    let map = { grid: null, marks: emptyMarks(), cues: [] };
    const shownLanes = () => LANES.filter((l) => !l.extra || map.marks[l.id]?.length);
    let mapUndo = [];
    let allMaps = null;
    let taps = [];
    let beatCache = { key: '', beats: [] };
    // listeners (tools/three-music.js): 'analysis' (a song was analysed), 'tap' (tap tempo learned something)
    const listeners = {};
    // Synchronous hooks for the footage side (tools/three-frames.js, round 8): seek / snap / keys / drawing / time text
    // on exact frames when a video is loaded. Unset, the player behaves as before.
    const hooks = {};
    const emit = (ev, data) => { for (const fn of listeners[ev] || []) { try { fn(data); } catch (err) { console.error(err); } } };
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    const sep = () => el('span', { class: 'mb-sep' });
    const group = (cat, ...nodes) => el('span', { class: 'tb-group', dataset: { cat } }, ...nodes.filter(Boolean));

    // row 1: file, transport, zoom, loop
    const loadBtn = btn('🎵 Load audio / video…', 'Pick an mp3, wav, mp4… to drive the sketch (or drop one on the preview)', () => pick());
    loadBtn.dataset.feature = 'Load audio video…';
    const nameEl = el('span', { class: 'mb-name' });
    // the scene's own timeline: a click on its name sets its length (the keyframes stay where they are)
    nameEl.addEventListener('click', (e) => {
      if (!st.clock) return;
      const cur = Math.round(D());
      menuAt(nameEl, [...[5, 10, 15, 20, 30, 60].map((n) => [`${n === cur ? '● ' : ''}${n} s`, n === 10 ? 'the default' : '', () => { if (setClockLength(n)) emit('clock-length', n); }]),
        ['Load a song on it…', 'Its keyframes and cues keep their seconds', () => pick()]]);
      e.stopPropagation();
    });
    const unloadBtn = btn('×', 'Remove the music (sketches get a demo beat)', () => unload(), 'ghost small mb-x');
    const playBtn = btn('▶', 'Play / pause (Space)', () => toggle(), 'primary small mb-play');
    playBtn.dataset.feature = 'Play / pause';
    playBtn.dataset.key = 'Space';
    playBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); menuAt(playBtn, [['Play from the start', 'Home, then Space', () => { seek(0); toggle(true); }], region ? ['Play the loop', '', () => { seek(region.a); toggle(true); }] : false, ...RATES.map((r) => [`${st.rate === r ? '● ' : ''}${r === 1 ? 'Normal speed' : `${r}× speed`}`, '', () => setRate(r)])].filter((x) => x !== false)); });
    const timeEl = el('span', { class: 'mb-time', text: '0:00', title: 'Click to jump to a time (m:ss.mmm or seconds)' });
    timeEl.addEventListener('click', async () => { if (!D()) return; const v = await Modal.prompt('Jump to', { value: fmtMs(now()), placeholder: 'm:ss.mmm or seconds' }); const t = parseTime(v ?? ''); if (Number.isFinite(t)) seek(t); });
    // Slow motion for precise edits (the sketch sees the slowed music too). Recording always runs at 1×.
    const RATES = [1, 0.75, 0.5, 0.25];
    const rateSel = el('select', { class: 'mb-sel mb-rate', title: 'Playback speed: slow it down to place points and markers precisely' }, RATES.map((r) => el('option', { value: r, text: r === 1 ? '1×' : `${r}×` })));
    rateSel.addEventListener('change', () => setRate(Number(rateSel.value)));
    function setRate(r) {
      const t = now();
      st.rate = RATES.includes(r) ? r : 1;
      st.time = t; st.stampAt = performance.now();
      rateSel.value = String(st.rate);
      rateSel.classList.toggle('on', st.rate !== 1);
      send({ type: 'media', cmd: 'rate', value: st.rate });
    }
    const zoomOut = btn('－', 'Zoom out (or the mouse wheel on the timeline)', () => zoomBy(1.6));
    const zoomIn = btn('＋', 'Zoom in (or the mouse wheel on the timeline); goes down to single samples', () => zoomBy(1 / 1.6));
    const zoomAll = btn('Whole song', 'Show the whole song', () => setView(null));
    const zoomLoop = btn('Fit loop', 'Zoom to the loop', () => fitLoop());
    // Waveform colors: rekordbox-style RGB (red lows, green mids, blue highs) or the three band lines.
    let waveRGB = store.get('three.waveRGB', true);
    const waveBtn = btn('RGB', 'Waveform colors: RGB like rekordbox (red = bass, green = mids, blue = highs) or band lines', () => { waveRGB = !waveRGB; store.set('three.waveRGB', waveRGB); waveBtn.classList.toggle('on', waveRGB); draw(); }, 'ghost small mb-wave');
    waveBtn.classList.toggle('on', waveRGB);
    const loopBtn = btn('⟲ Loop', 'Loop playback: the loop section if you set one, otherwise the whole song', () => { st.loop = !st.loop; store.set('three.mediaLoop', st.loop); send({ type: 'media', cmd: 'loop', value: st.loop }); paint(); });
    const lockBtn = btn('🔓', 'Lock the loop and the view in place', () => setLocked(!locked));
    const vol = el('input', { type: 'range', class: 'mb-vol', min: 0, max: 1, step: 0.01, value: st.volume, title: 'Volume (the sketch still sees the full signal)' });
    // M: mute the music you hear (the sketch still gets the full signal), M again: back to your volume
    let mutedFrom = null;
    function toggleMute() {
      if (mutedFrom == null) { mutedFrom = st.volume || 0.8; vol.value = 0; } else { vol.value = mutedFrom; mutedFrom = null; }
      vol.dispatchEvent(new Event('input'));
      vol.classList.toggle('muted', mutedFrom != null);
      toast(mutedFrom != null ? 'Music muted (M to hear it again) · the sketch still reacts' : 'Music back on', { timeout: 1400 });
    }
    vol.addEventListener('wheel', (e) => { e.preventDefault(); vol.value = Math.max(0, Math.min(1, Number(vol.value) + (e.deltaY < 0 ? 0.05 : -0.05))); vol.dispatchEvent(new Event('input')); }, { passive: false });
    vol.addEventListener('dblclick', () => toggleMute());
    vol.title = 'Volume (the sketch still sees the full signal) · wheel to step · double-click or M to mute';
    vol.addEventListener('input', () => { st.volume = Number(vol.value); store.set('three.mediaVolume', st.volume); send({ type: 'media', cmd: 'volume', value: st.volume }); });
    const recBtn = btn('⏺ Record', 'Record the preview (with the music) to a video file', (e) => (recording ? stopRecord() : recordMenu(e.currentTarget)), 'ghost small mb-rec imp-live');
    recBtn.dataset.feature = 'Record';

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
    const tapBtn = btn('Tap', 'Tap along to the beat (T), 4+ taps set the BPM; while it plays the grid also lines up with your taps · Shift+T: this tap is the 1 · right-click: options', () => tap(), 'ghost small mb-tap');
    tapBtn.dataset.feature = 'Tap tempo';
    tapBtn.dataset.key = 'T';
    tapBtn.addEventListener('pointerdown', (e) => { if (e.shiftKey && e.button === 0) { e.preventDefault(); tapOne(); } });
    tapBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); tapMenu(e); });
    // the live BPM readout next to Tap: tempo, how sure (how even your taps are) and where the 1 is
    const bpmRead = el('span', { class: 'mb-bpmread', title: 'The tempo of the grid · click to type it' });
    bpmRead.addEventListener('click', () => { setAll(true); requestAnimationFrame(() => { bpmIn.focus(); bpmIn.select(); }); });
    // the song's own tempo guesses, one click each
    const bpmCands = el('span', { class: 'mb-cands' });
    let candsKey = '';
    function paintCands() {
      const c = st.analysis?.bpmCandidates || [];
      const k = `${c.join()}|${bpmNow()}`;
      if (k === candsKey) return; // rebuilt only when the guesses or the tempo change (paint() runs on every seek)
      candsKey = k;
      bpmCands.replaceChildren(...c.map((b) => btn(String(b), `Use ${b} BPM`, () => editGrid((g) => { g.bpm = b; }), `ghost small mb-cand${Math.abs(b - bpmNow()) < 0.05 ? ' on' : ''}`)));
    }
    const snapTapsBox = el('input', { type: 'checkbox', checked: store.get('three.snapTaps', true) });
    snapTapsBox.addEventListener('change', () => store.set('three.snapTaps', snapTapsBox.checked));
    const dblBtn = btn('×2', 'Double the BPM', () => editGrid((g) => { g.bpm = Math.round(g.bpm * 200) / 100; }));
    const halfBtn = btn('½', 'Halve the BPM', () => editGrid((g) => { g.bpm = Math.round(g.bpm * 50) / 100; }));
    const oneBtn = btn('Set 1 here', 'Put the downbeat (beat 1 of a bar) at the playhead; the grid lines up from it', () => editGrid((g) => { g.anchor = r4(now()); }), 'ghost small mb-one');
    const gridStep = (e) => (e.shiftKey ? 0.001 : e.altKey ? 0.02 : 0.005);
    const gridL = btn('◂', 'Shift the whole grid 5 ms earlier (Shift: 1 ms, Alt: 20 ms)', (e) => editGrid((g) => { g.anchor = r4(g.anchor - gridStep(e)); }));
    const gridR = btn('▸', 'Shift the whole grid 5 ms later (Shift: 1 ms, Alt: 20 ms)', (e) => editGrid((g) => { g.anchor = r4(g.anchor + gridStep(e)); }));
    oneBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
      const nextKick = map.marks.kick.find((t) => t >= now() - 0.02);
      menuAt(anchor, [
        ['The 1 on the hit', 'Moved onto the real attack near the playhead', () => editGrid((g) => { g.anchor = r4(snapToHit(now() + 0.05, 'kick')); })],
        nextKick != null ? ['The 1 on the next kick marker', fmtMs(nextKick), () => editGrid((g) => { g.anchor = r4(nextKick); })] : false,
        map.cues.length ? ['The 1 on the first cue', fmtMs(map.cues[0].t), () => editGrid((g) => { g.anchor = r4(map.cues[0].t); })] : false,
        ['Auto: the detected grid', '', () => { if (map.grid) { pushUndo(); map.grid = null; mapChanged(); } }],
      ].filter((x) => x !== false));
    });
    const meterSel = el('select', { class: 'mb-sel', title: 'Beats per bar' }, METERS.map(([v, l]) => el('option', { value: v, text: l })));
    meterSel.addEventListener('change', () => editGrid((g) => { g.bpb = Number(meterSel.value); }));
    const autoBtn = btn('Auto', 'Forget your grid and use the detected beats', () => { if (!map.grid) return; pushUndo(); map.grid = null; mapChanged(); });
    const gridState = el('span', { class: 'mb-gridstate' });
    const snapSel = el('select', { class: 'mb-sel', title: 'What loop points, markers and curve points snap to (Hits: your kick / snare / hit markers and cues)' }, SNAPS.map(([v, l]) => el('option', { value: v, text: `Snap: ${l}`, selected: v === snapMode })));
    snapSel.addEventListener('change', () => { snapMode = snapSel.value; store.set('three.snapMode', snapMode); draw(); });
    const laneBtns = CORE_LANES.map((ln) => {
      const b = btn('', `Add a ${ln.name.toLowerCase()} at the playhead (or press ${ln.key.toUpperCase()} while it plays) · right-click: fill, clear, copy`, () => addAtPlayhead(ln.id), `ghost small mb-lane mb-lane-${ln.id}`);
      b.dataset.feature = `${ln.key.toUpperCase()} ${ln.name}`; b.dataset.key = ln.key.toUpperCase();
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const anchor = b;
        const range = region ? [region.a, region.b] : [0, D()]; const where = region ? 'in the loop' : 'in the whole song';
        const plan = { kick: [['Every beat', 'kicks'], ['On 1 and 3', 'kicks13']], snare: [['On 2 and 4', 'snares']], hit: [['Every bar\'s 1', 'hits']] }[ln.id] || [];
        const fh = found(ln.id === 'hit' ? '' : ln.id);
        menuAt(anchor, [
          fh.length ? [`✦ Mark ${ln.name.toLowerCase()}s for me`, `${fh.filter((o) => o.t >= range[0] && o.t < range[1]).length} found in the audio ${where} · editable after, ↶ undoes`, () => { const n = markFound(ln.id)?.[ln.id] || 0; toast(`${n} ${ln.name.toLowerCase()}s marked from the song`, { timeout: 1800 }); }] : false,
          ...plan.map(([label, kind]) => [`Fill: ${label}`, where, () => fillKind(kind)]),
          ['Copy the times', `${map.marks[ln.id].filter((t) => t >= range[0] && t < range[1]).length} ${ln.name.toLowerCase()}s, in seconds`, () => { navigator.clipboard.writeText(map.marks[ln.id].filter((t) => t >= range[0] && t < range[1]).map((t) => t.toFixed(3)).join('\n')); toast('Copied', { timeout: 1000 }); }],
          [`Clear the ${ln.name.toLowerCase()}s`, where, () => { pushUndo(); map.marks[ln.id] = map.marks[ln.id].filter((t) => t < range[0] || t >= range[1]); mapChanged(); }],
        ].filter((x) => x !== false));
      });
      return b;
    });
    function fillKind(kind) {
      if (!D()) return 0;
      const range = region ? [region.a, region.b] : [0, D()];
      const bs = beats(); const inR = (t) => t >= range[0] - 1e-3 && t < range[1] - 1e-3;
      const nb = bs.map((t, i) => ({ t, n: mod(bno(bs, i), bpbNow()) })).filter((b) => inR(b.t));
      const plan = { kicks: ['kick', nb], kicks13: ['kick', nb.filter((b) => b.n === 0 || b.n === 2)], snares: ['snare', nb.filter((b) => b.n === 1 || b.n === 3)], hits: ['hit', nb.filter((b) => b.n === 0)] }[kind];
      if (!plan) return 0;
      pushUndo(); for (const b of plan[1]) map.marks[plan[0]] = addMark(map.marks[plan[0]], b.t); mapChanged();
      return plan[1].length;
    }
    const fillBtn = btn('Fill ▾', 'Stamp kicks / snares / hits on the grid, or clear them', (e) => fillMenu(e.currentTarget));
    const undoBtn = btn('↶', 'Undo the last grid, marker or curve change (Ctrl+Z)', () => undoMap());
    // Q: K / S / H taps land exactly on the grid (the snap setting) instead of on the sound
    let quantTaps = store.get('three.quantizeTaps', false);
    const quantBtn = btn('Q', 'Quantize taps: K / S / H markers land on the grid (the Snap setting) · Q key', () => setQuantize(!quantTaps), 'ghost small mb-quant');
    quantBtn.dataset.feature = 'Quantize taps';
    quantBtn.dataset.key = 'Q';
    quantBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); menuAt(quantBtn, SNAPS.filter(([v]) => v !== 'off' && v !== 'hits').map(([v, l]) => [`${snapMode === v ? '● ' : ''}Quantize to ${l}`, 'Also the snap for loops and points', () => { snapSel.value = v; snapSel.dispatchEvent(new Event('change')); setQuantize(true); }])); });
    function setQuantize(on) { quantTaps = Boolean(on); store.set('three.quantizeTaps', quantTaps); quantBtn.classList.toggle('on', quantTaps); return quantTaps; }
    setQuantize(quantTaps);
    // How the beat grid and the waveform are drawn
    let gridView = { lines: true, numbers: true, subs: true, sections: true, drops: true, dim: false, follow: true, tall: false, markLines: false, click: false, light: true, ...store.get('three.gridView', {}) };
    const viewBtn = btn('View ▾', 'How the timeline looks: beat lines, bar numbers, subdivisions, loud parts, drops, RGB or band waveform', (e) => viewMenu(e.currentTarget));
    viewBtn.dataset.feature = 'Timeline view';
    // Sections (Intro, Build, Drop…): named cues that slider looks and motions can follow
    const sectionsBtn = btn('Sections ▾', 'Mark the song\'s parts (Intro, Build, Drop, Break, Outro) as cues: from the song\'s loud / quiet parts or at the playhead. Looks can follow them (right-click a cue).', (e) => sectionsMenu(e.currentTarget));
    sectionsBtn.dataset.feature = 'Sections';
    const gridRow = el('div', { class: 'mb-row mb-grid' },
      el('span', { class: 'mb-label', text: 'Grid' }), bpmIn, el('span', { class: 'mb-unit', text: 'BPM' }), dblBtn, halfBtn, bpmCands, sep(), oneBtn, gridL, gridR, meterSel, autoBtn, gridState, sep(), snapSel, quantBtn, sep(),
      viewBtn, sectionsBtn, sep(), el('label', { class: 'check small', title: 'K / S / H taps land on the real attack in the audio (fixes the delay of tapping)' }, snapTapsBox, 'on the hit'), fillBtn, undoBtn);

    const canvas = el('canvas', { class: 'mb-timeline' });
    // While playing, only these two lines move every frame; the canvases redraw about 10 times a second.
    const playheadEl = el('div', { class: 'mb-playhead' });
    // the scrolling strip (see scroll): three views of the timeline drawn once, slid under a fixed playhead
    const strip = el('canvas', { class: 'mb-strip' });
    const stripClip = el('div', { class: 'mb-strip-clip', hidden: true }, strip);
    const ANCHOR = 0.3; // where the playhead stays while the timeline scrolls
    const scroll = { on: false, S: 0, sp: 0, w: 0, anim: null, x0: 0, x1: 0 };
    const miniHeadEl = el('div', { class: 'mb-playhead mini' });
    // Overview of the whole song (like FL Studio's playlist overview): every layer, the loop, the playhead,
    // and the zoomed window you can drag.
    const minimap = el('canvas', { class: 'mb-minimap', title: 'The whole song: each layer\'s time, the loop and the playhead. Drag the box to move the zoomed view; click to jump.' });
    // Layer tracks under the song (top layer first): { id, name, color, in, out, visible, selected, keys: [{ t, ease }] }.
    // Handlers: onSelect(id), onChange(id, { in, out }, { final }), onKeyMove(id, from, to), onKeyDelete(id, t), onKeyEase(id, t, ease).
    // A track can show several automation lanes under it (Ableton-style), picked with the ▾ in the header column
    // at the right (outside the timeline, so it never covers it):
    // lanes = [{ prop, label, min, max, step, base, keys, tall }], animated = how many settings have points.
    // Handlers onLanePick(id, x, y, { prop }), onLaneEdit(id, prop, keys, { final }), onLaneHide(id, prop), onLaneTall(id, prop).
    let tracks = [];
    let trackHandlers = {};
    const TRACK_H = 16; const AUTO_H = 48; const AUTO_TALL = 112; const GUT = 122;
    const laneH = (ln) => (ln.tall ? AUTO_TALL : AUTO_H);
    const lanesOf = (tr) => tr.lanes || [];
    const rowH = (tr) => TRACK_H + lanesOf(tr).reduce((s, ln) => s + laneH(ln), 0);
    const tracksH = () => tracks.reduce((sum, tr) => sum + rowH(tr), 0);
    function trackRows(h) {
      let y = h - tracksH();
      return tracks.map((tr) => {
        const row = { tr, y, end: y + rowH(tr), lanes: [] };
        let ly = y + TRACK_H;
        for (const ln of lanesOf(tr)) { row.lanes.push({ ln, top: ly, h: laneH(ln) }); ly += laneH(ln); }
        y = row.end;
        return row;
      });
    }
    // Selected curve points (one lane at a time), the lane you last touched (for paste), and the clipboard.
    let autoSel = null; // { id, prop, idx: Set }
    let activeLane = null; // { id, prop }
    let autoClip = null; // { prop, min, max, keys: [{ t (from 0), v, ease, c }] }
    function setTracks(list, handlers) {
      tracks = list || [];
      if (handlers) trackHandlers = handlers;
      sizeCanvas();
      draw();
    }
    // Notes on moments (pins on the ruler): [{ id, t, text, done }], handlers onOpen(id, x, y).
    let notes = [];
    let noteHandlers = {};
    function setNotes(list, handlers) { notes = list || []; if (handlers) noteHandlers = handlers; draw(); }
    // Timeline size: full, compact (no grid / hits row) or strip (just the overview, like FL Studio's).
    let size = store.get('three.timelineSize', 'full');
    let sizeBeforeTemp = null;
    const miniPlay = btn('▶', 'Play / pause (Space)', () => toggle(), 'ghost small mb-miniplay');
    const miniTime = el('span', { class: 'mb-minitime' });
    const SIZE_ORDER = ['full', 'compact', 'strip'];
    const sizeBtns = [['full', '▤', 'Full timeline'], ['compact', '▭', 'Compact: hide the grid and hits row'], ['strip', '▁', 'Just the overview strip']]
      .map(([id, text, title]) => btn(text, title, () => setSize(id), `ghost small mb-size mb-size-${id}`));
    const grip = el('div', { class: 'mb-grip', title: 'Drag up or down to resize the timeline · double-click to cycle sizes' });
    const handle = el('div', { class: 'mb-handle' }, miniPlay, miniTime, grip, ...sizeBtns);
    function setSize(m, { temporary = false } = {}) {
      if (!SIZE_ORDER.includes(m)) return;
      if (temporary) { if (sizeBeforeTemp == null) sizeBeforeTemp = size; } else { sizeBeforeTemp = null; store.set('three.timelineSize', m); }
      size = m;
      bar.dataset.size = m;
      sizeBtns.forEach((b, i) => b.classList.toggle('on', SIZE_ORDER[i] === m));
      requestAnimationFrame(() => draw());
    }
    function restoreSize() { if (sizeBeforeTemp != null) { const m = sizeBeforeTemp; sizeBeforeTemp = null; setSize(m); } }
    grip.addEventListener('pointerdown', (e) => {
      grip.setPointerCapture(e.pointerId);
      let y0 = e.clientY;
      const move = (ev) => {
        const i = SIZE_ORDER.indexOf(size);
        if (ev.clientY - y0 > 28 && i < 2) { setSize(SIZE_ORDER[i + 1]); y0 = ev.clientY; }
        if (ev.clientY - y0 < -28 && i > 0) { setSize(SIZE_ORDER[i - 1]); y0 = ev.clientY; }
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', () => grip.removeEventListener('pointermove', move), { once: true });
    });
    grip.addEventListener('dblclick', () => setSize(SIZE_ORDER[(SIZE_ORDER.indexOf(size) + 1) % 3]));
    // the loop as one small chip (looping is a drag now: Shift+drag the waveform or drag the top strip)
    const loopChip = el('span', { class: 'mb-loopchip', hidden: true },
      el('button', { class: 'mb-loopchip-t', title: 'Loop on / off (the section stays)', on: { click: () => loopBtn.click() } }, loopLen),
      el('button', { class: 'mb-loopchip-x', text: '×', title: 'Remove the loop', on: { click: () => setRegion(null) } }));
    const hoverEl = el('div', { class: 'mb-hover', hidden: true });
    const bar = el('div', { class: 'media-bar' },
      handle,
      el('div', { class: 'mb-row mb-main' },
        group('Play', playBtn, timeEl, rateSel, vol),
        group('Song', loadBtn, nameEl, unloadBtn),
        group('Beat', tapBtn, bpmRead, ...laneBtns),
        group('Zoom', zoomOut, zoomIn, zoomAll, zoomLoop),
        group('Loop', loopChip, loopBtn, loopBox, lockBtn),
        el('span', { class: 'tb-group mb-g-capture', dataset: { cat: 'Capture' } }),
        el('span', { class: 'tb-group mb-g-live', dataset: { cat: 'Live' } }, recBtn),
        el('span', { class: 'spacer' })),
      gridRow, el('div', { class: 'mb-tl-wrap' }, canvas, stripClip, playheadEl, hoverEl), el('div', { class: 'mb-mm-wrap' }, minimap, miniHeadEl));
    gridRow.insertBefore(waveBtn, viewBtn);
    setSize(size);
    // Fewer controls by default; ⋯ shows every one (zoom buttons, loop points, grid tools…). Rarely used ones get .mb-adv.
    for (const n of [rateSel, loopBtn, loopBox, lockBtn, dblBtn, halfBtn, bpmCands, meterSel, autoBtn, gridState, snapSel, fillBtn, undoBtn, snapTapsBox.parentElement, zoomOut.parentElement]) n?.classList.add('mb-adv');
    gridRow.querySelectorAll('.mb-sep').forEach((s) => s.classList.add('mb-adv'));
    let allCtl = store.get('three.mbAll', false);
    const moreBtn = btn('⋯', '', () => setAll(!allCtl), 'ghost small mb-more');
    moreBtn.dataset.feature = 'More timeline controls';
    function setAll(on) {
      allCtl = on; store.set('three.mbAll', on);
      bar.classList.toggle('mb-all', on);
      moreBtn.classList.toggle('on', on);
      moreBtn.title = on ? 'Fewer controls' : 'Every timeline control: zoom buttons, loop points and lock, grid tools (×2 ½, meter, snap, fill, undo), speed, record';
      requestAnimationFrame(() => draw());
    }
    bar.querySelector('.mb-main').append(moreBtn);
    setAll(allCtl);

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
      Object.assign(st, { path, name: base(path), bytes, mime: MIME[extOf(path)], video: VIDEO_EXT.includes(extOf(path)), clock: null, analysis: null, samples: null, wave: null, time: startAt, duration: 0, playing: false });
      emit('load', { path, video: st.video });
      const saved = store.get(loopKey(path), null);
      region = saved?.a != null ? { a: saved.a, b: saved.b } : null;
      locked = Boolean(saved?.locked && region);
      view = null;
      selected = null;
      // The user's grid and markers for this song.
      allMaps ||= await window.hub.kvGet('three-beatmaps', {});
      if (seq !== loadSeq) return { ok: false, error: 'Another file was loaded meanwhile' };
      const m = allMaps[path];
      map = { grid: m?.grid || null, marks: emptyMarks(m?.marks), cues: m?.cues || [], trim: m?.trim || null };
      mapUndo = [];
      sizeCanvas();
      store.set('three.media', path);
      analyzing = true;
      paint();
      attach({ playing: false });
      try {
        const a = await analyze(bytes, { onProgress: (p) => { if (seq === loadSeq) setText(nameEl, `${st.name} · analyzing ${Math.round(p * 100)}%`); } });
        st.samples = a.samples; st.wave = a.wave;
        delete a.samples; delete a.wave;
        st.analysis = a; anaVer += 1;
      } catch (err) { if (seq === loadSeq) { st.analysis = null; if (!quiet && !(st.video && hooks.silentVideo?.(st))) toast(st.video ? `${st.name} has no audio track to analyze (it still works as a video texture)` : `Couldn't analyze ${st.name}: ${err.message}`, { type: 'error' }); } }
      if (seq !== loadSeq) return { ok: false, error: 'Another file was loaded meanwhile' };
      analyzing = false;
      if (st.analysis) { st.duration = st.analysis.duration; send({ type: 'media-analysis', analysis: st.analysis }); }
      if (locked && region) view = padded(region);
      sendMap();
      paint();
      onLoaded?.();
      if (st.analysis) emit('analysis', st.analysis);
      return { ok: true };
    }
    // silent: the Lab is switching sketches and runs the new one itself.
    function unload({ silent = false } = {}) {
      loadSeq += 1;
      analyzing = false;
      const from = st.path; const wasClock = Boolean(st.clock);
      Object.assign(st, { path: null, name: null, bytes: null, clock: null, analysis: null, samples: null, wave: null, time: 0, duration: 0, playing: false });
      region = null; locked = false; view = null; selected = null;
      emit('unload', {});
      map = { grid: null, marks: emptyMarks(), cues: [] };
      store.set('three.media', null);
      paint();
      if (!silent) onLoaded?.({ reload: true, unloaded: true, from, clock: wasClock });
    }
    // ---------- the scene's own timeline (round 10, orb) ----------
    // A scene with no song still has a timeline: a silent clip of its length (made here in memory, never written to
    // disk) plays as its "song", so the timeline, layer and slider keyframes, cues, markers, the loop and Space all
    // work on it, frame by frame at its frame rate. Its path is "scene:<sketch id>": its markers and cues are kept
    // under that name (kv three-beatmaps) and move onto a song you load on the scene (carry()).
    const CLOCK_RATE = 8000;
    function silentWav(seconds) {
      const n = Math.max(1, Math.round(seconds * CLOCK_RATE));
      const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
      const w = (o, text) => { for (let i = 0; i < text.length; i += 1) v.setUint8(o + i, text.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, CLOCK_RATE, true); v.setUint32(28, CLOCK_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      return buf;
    }
    const fmtLen = (s) => (s < 60 ? `${Math.round(s * 10) / 10} s` : fmtTime(s));
    const clockFps = () => st.clock?.fps || 30;
    // the clock's frames: every seek, snap and step lands on a frame start
    const clockSnap = (t) => (st.clock ? Math.max(0, Math.round(t * clockFps() + 1e-6) / clockFps()) : t);
    const clockFrame = (t) => Math.floor(t * clockFps() + 1e-3);
    function clockText(t) {
      if (!st.clock) return undefined;
      const n = clockFrame(t); const nom = Math.round(clockFps()); const s = Math.floor(n / nom); const p2 = (x) => String(Math.floor(x)).padStart(2, '0');
      return `${p2(s / 60)}:${p2(s % 60)}:${p2(n % nom)} · f${n}`;
    }
    function loadClock({ key, seconds = 10, fps = 30, startAt = 0, playing = true } = {}) {
      if (!key) return { ok: false, error: 'No scene' };
      const path = `scene:${key}`;
      const seq = ++loadSeq;
      const len = Math.max(1, Math.min(600, Number(seconds) || 10));
      analyzing = false;
      Object.assign(st, { path, name: `⏱ Scene timeline · ${fmtLen(len)}`, bytes: silentWav(len), mime: 'audio/wav', video: false, clock: { fps: fps > 0 ? fps : 30, len }, analysis: null, samples: null, wave: null, time: Math.min(Math.max(0, startAt), len), duration: len, playing: false });
      emit('load', { path, video: false, clock: true });
      const saved = store.get(loopKey(path), null);
      region = saved?.a != null ? { a: saved.a, b: saved.b } : null;
      locked = Boolean(saved?.locked && region);
      view = null; selected = null; mapUndo = [];
      const useMap = () => { const m = allMaps?.[path]; map = { grid: m?.grid || null, marks: emptyMarks(m?.marks), cues: m?.cues || [], trim: null }; };
      useMap();
      sizeCanvas();
      paint();
      attach({ playing });
      if (!allMaps) window.hub.kvGet('three-beatmaps', {}).then((all) => { allMaps ||= all || {}; if (seq !== loadSeq) return; useMap(); sizeCanvas(); sendMap(); paint(); });
      else sendMap();
      onLoaded?.({ clock: true });
      return { ok: true };
    }
    // the clock's length changed (/timeline length, its menu, keyframes past its end): the same place, a longer clip
    function setClockLength(seconds) {
      if (!st.clock) return false;
      const key = st.path.slice(6);
      return loadClock({ key, seconds, fps: st.clock.fps, startAt: now(), playing: st.playing }).ok;
    }
    // A song loaded on a scene that had only its own timeline: its cues and markers come along, at the same seconds
    // (and back to the scene's timeline when the song is taken out). Keyframes live on the layers in seconds already.
    async function carry(from, to) {
      if (!from || !to || from === to) return 0;
      allMaps ||= (await window.hub.kvGet('three-beatmaps', {})) || {};
      const a = allMaps[from];
      if (!a) return 0;
      const b = allMaps[to] || { grid: null, marks: emptyMarks(), cues: [] };
      let n = 0;
      b.cues = [...(b.cues || [])];
      for (const c of a.cues || []) if (!b.cues.some((x) => Math.abs(x.t - c.t) < 0.02)) { b.cues.push({ ...c }); n += 1; }
      b.cues.sort((x, y) => x.t - y.t);
      b.marks = emptyMarks(b.marks);
      for (const ln of LANES) for (const t of a.marks?.[ln.id] || []) { const before = b.marks[ln.id].length; b.marks[ln.id] = addMark(b.marks[ln.id], t); n += b.marks[ln.id].length - before; }
      allMaps[to] = b;
      if (st.path === to) { map = { ...map, cues: b.cues, marks: b.marks }; mapChanged(); } else saveMaps();
      return n;
    }
    // a scene copied (Duplicate, a chat's copy, a jam): its own timeline's cues and markers come along
    async function copyMap(from, to) {
      allMaps ||= (await window.hub.kvGet('three-beatmaps', {})) || {};
      if (!allMaps[from] || allMaps[to]) return false;
      allMaps[to] = JSON.parse(JSON.stringify(allMaps[from]));
      saveMaps();
      return true;
    }
    // (Re)sends the file to the sandbox; called after every full reload of the preview.
    // play / pause you asked for that the sandbox hasn't confirmed yet: a preview that reloads meanwhile (just after
    // loading a song) gets it with the file, instead of dropping it
    let wish = null;
    function attach({ playing = wish && performance.now() - wish.at < 10000 ? wish.play : st.playing } = {}) {
      if (!st.bytes) return;
      send({ type: 'media-load', buffer: st.bytes.slice(0), mime: st.mime, video: st.video, name: st.name, startAt: hooks.startAt?.(st.time) ?? st.time, playing, loop: st.loop, volume: st.volume, analysis: st.analysis, region, rate: st.rate, trim: map.trim });
      sendMap();
      emit('attach', { path: st.path });
    }
    function toggle(force) {
      if (!st.bytes) { pick(); return; }
      const play = force ?? !st.playing;
      wish = { play, at: performance.now() };
      send({ type: 'media', cmd: play ? 'play' : 'pause', ...(play ? {} : hooks.pauseMsg?.() || {}) });
    }
    function seek(t) {
      const was = st.time;
      st.time = Math.max(0, Math.min(t, st.duration || t));
      st.stampAt = performance.now();
      // footage: the playhead lands on the start of a whole frame, the decoder is sent to that frame's middle
      const fx = hooks.seek?.(st.time);
      if (fx) {
        st.time = fx.time;
        if (fx.target == null && st.time === was && !st.playing) return; // the same frame (a scrub inside one frame): nothing to send or redraw
        if (fx.target != null) send({ type: 'media', cmd: 'seek', value: fx.target, ...(fx.msg || {}) });
      } else {
        if (st.clock) st.time = Math.min(clockSnap(st.time), D()); // the scene's own timeline: on a frame start
        send({ type: 'media', cmd: 'seek', value: st.time });
      }
      // A jump outside the zoomed view brings the view along (unless it's locked).
      if (view && !locked && !dragging && (st.time < view.start || st.time > view.end)) setView({ start: st.time - span() / 2, end: st.time + span() / 2 });
      paint();
    }
    function onMessage(msg) {
      if (hooks.message?.(msg)) return;
      if (msg.type === 'media-state') {
        // the sandbox sends this a few times a second while it plays: only a real change (play / pause / end / a new
        // song length) repaints the control row; plain time updates just re-sync the clock
        const same = st.playing === msg.playing && (msg.duration || st.duration) === st.duration && !msg.ended && !recording;
        // While it plays, the playhead runs on its own smooth clock and is steered toward the reported time: snapping
        // to every report (late by however long the message took) made it jump back and forth. A real jump (seek,
        // loop, a stall over 0.3 s) still snaps.
        if (same && st.playing && msg.playing) {
          const predicted = now(); const err = msg.time - predicted;
          if (Math.abs(err) < 0.3) { st.time = predicted + err * 0.15; st.stampAt = performance.now(); if (!wish) return; }
        }
        Object.assign(st, { time: hooks.stateTime ? hooks.stateTime(msg.time, msg.playing) : msg.time, duration: msg.duration || st.duration, playing: msg.playing, stampAt: performance.now() });
        if (same && !wish) { if (!st.playing) livePaint(); return; }
        if (wish && wish.play === msg.playing) wish = null;
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
    // The grid in use: yours (map.grid) or, until you set one, the detected straight grid with its bar 1. A played
    // song (the tempo drifts) has no straight grid: its tracked beats are used, counted from the detected bar 1.
    const autoGrid = () => { const g = st.analysis?.grid; return g?.straight ? g : null; };
    const G = () => map.grid || autoGrid();
    const dIdx = () => (G() ? 0 : st.analysis?.downIndex || 0);
    const bno = (bs, i) => (G() ? beatNo(bs, i, G()) : i - dIdx());
    function beats() {
      const g = G();
      if (!g) return st.analysis?.beats || [];
      const key = `${g.bpm}|${g.anchor}|${D()}`;
      if (beatCache.key !== key) beatCache = { key, beats: gridBeats(g, D()) };
      return beatCache.beats;
    }
    const bpmNow = () => G()?.bpm || st.analysis?.bpm || 0;
    const bpbNow = () => G()?.bpb || 4;
    // "Hits": the nearest kick / snare / hit marker or cue within a beat, else the 1/16 grid.
    const snapT = (t) => (hooks.snap ? hooks.snap(snapT0(t), t) : clockSnap(snapT0(t)));
    const snapT0 = (t) => {
      if (snapMode !== 'hits') return snapTime(t, snapMode, G(), beats(), dIdx());
      const range = 60 / (bpmNow() || 120);
      let best = null; let bd = range;
      for (const list of [map.marks.kick, map.marks.snare, map.marks.hit, map.cues.map((c) => c.t)]) for (const m of list) { const d = Math.abs(m - t); if (d < bd) { bd = d; best = m; } }
      return best ?? snapTime(t, '1/16', G(), beats(), dIdx());
    };
    function ensureGrid() {
      if (map.grid) return map.grid;
      const ag = autoGrid(); const bs = st.analysis?.beats || [];
      map.grid = ag ? { bpm: ag.bpm, anchor: ag.anchor, bpb: ag.bpb || 4 } : { bpm: Math.round((st.analysis?.bpm || 120) * 100) / 100, anchor: bs[dIdx()] ?? bs[0] ?? 0, bpb: 4 };
      return map.grid;
    }
    function pushUndo() { mapUndo.push(JSON.stringify(map)); if (mapUndo.length > 80) mapUndo.shift(); }
    function editGrid(fn) {
      if (!st.duration) return;
      pushUndo();
      fn(ensureGrid());
      mapChanged();
    }
    // The undo stack holds grid / marker states (strings) and curve edits ({ lane: { id, prop, keys } }).
    function undoMap() {
      const prev = mapUndo.pop();
      if (!prev) return;
      if (prev.hook) { hooks.undo?.(prev.hook); paint(); return; }
      if (typeof prev === 'object') {
        const { id, prop, keys } = prev.lane;
        autoSel = null;
        setLaneKeys(id, prop, keys);
        trackHandlers.onLaneEdit?.(id, prop, keys.map((k) => ({ ...k })), { final: true });
        paint();
        return;
      }
      map = JSON.parse(prev);
      selected = null;
      mapChanged({ undoable: false });
    }
    const saveMaps = debounce(() => { if (allMaps) window.hub.kvSet('three-beatmaps', allMaps); }, 400);
    function sizeCanvas() { canvas.style.height = `${(gridView?.tall ? 170 : 112) + tracksH() + (shownLanes().length - CORE_LANES.length) * 14}px`; }
    function mapChanged() {
      sizeCanvas();
      cueIdx = -2;
      if (st.path && allMaps) {
        const empty = !map.grid && !LANES.some((ln) => map.marks[ln.id].length) && !map.cues?.length && !map.trim;
        if (empty) delete allMaps[st.path]; else allMaps[st.path] = map;
        saveMaps();
      }
      sendMap();
      paint();
    }
    function sendMap() {
      if (!st.bytes) return;
      send({ type: 'media', cmd: 'trim', value: map.trim || null });
      send({ type: 'media-map', beats: beats(), bpm: bpmNow(), bpb: bpbNow(), anchor: G()?.anchor ?? beats()[dIdx()] ?? 0, manual: Boolean(G()), downIndex: dIdx(), marks: map.marks, cues: map.cues.map((c) => ({ t: c.t, name: c.name })) });
    }
    // Tap tempo that learns (button or T): the median gap of the last 16 taps (stray taps ignored), shown live.
    // Close to the song's detected tempo (or half / double of it, the classic mistake either way) the grid locks to
    // the detected one: its exact BPM and bar 1, instead of a rough tapped value. Taps far from it set the tempo as
    // before (within 0.3 of a whole number rounds to it). While the song plays, taps that disagree with the beat
    // phase move the grid onto them, and taps on a trusted grid teach the app how late you tap (used to put K / S / H
    // and "this tap is the 1" on the real hit).
    let tapSong = [];
    let tapRaw = [];
    let tapInfo = null; // { bpm, tapped, conf (0..1), n, spread (± BPM), lock: 'same' | 'half' | 'double' | null }
    let tapLat = store.get('three.tapLatency', null); // { ms, n }: how late you tap, learned (not a setting)
    const tapNow = () => Math.max(0, now() - ((tapLat?.ms || 0) / 1000) * (st.rate || 1));
    // where taps sit against a grid (period p, anchor a): the circular mean offset (s) and how tightly they agree
    function tapPhase(times, p, a) {
      let cx = 0; let cy = 0;
      for (const x of times) { const ang = (((x - a) % p) / p) * 2 * Math.PI; cx += Math.cos(ang); cy += Math.sin(ang); }
      const n = times.length || 1;
      return { off: (Math.atan2(cy, cx) / (2 * Math.PI)) * p, agree: Math.hypot(cx, cy) / n };
    }
    let tapToastShown = false;
    function tap() {
      const t = performance.now();
      if (taps.length && t - taps[taps.length - 1] > 2000) { taps = []; tapSong = []; tapRaw = []; tapInfo = null; tapToastShown = false; }
      taps.push(t);
      if (st.playing) { tapRaw.push(now()); tapSong.push(snapToHit(tapNow(), 'any')); }
      if (taps.length > 16) { taps.shift(); if (tapSong.length > 16) { tapSong.shift(); tapRaw.shift(); } }
      let bpm = null;
      if (taps.length >= 4) {
        const gaps = taps.slice(1).map((x, i) => x - taps[i]).sort((a, b) => a - b);
        const med = gaps[gaps.length >> 1];
        const kept = gaps.filter((g) => Math.abs(g - med) < med * 0.2);
        const mean = kept.reduce((s0, g) => s0 + g, 0) / kept.length;
        const tapped = 60000 / (mean * (st.playing ? st.rate || 1 : 1));
        const sd = Math.sqrt(kept.reduce((s0, g) => s0 + (g - mean) ** 2, 0) / kept.length);
        // how sure: even taps (small spread) and enough of them
        const conf = Math.max(0, Math.min(1, (1 - (sd / mean) * 6) * Math.min(1, kept.length / 8) * (kept.length / gaps.length)));
        const spread = Math.abs(60000 / (mean - sd / Math.sqrt(kept.length)) - 60000 / mean);
        // the song's own tempo, if the taps agree with it (or with half / double of it)
        const det = autoGrid()?.bpm || st.analysis?.bpm || 0;
        let lock = null;
        if (det) for (const [k, kind] of [[1, 'same'], [0.5, 'half'], [2, 'double']]) if (Math.abs(tapped / (det * k) - 1) < 0.03) { lock = kind; break; }
        if (lock) bpm = det;
        else if (store.get('three.tapRound', true) !== false && Math.abs(tapped - Math.round(tapped)) < 0.3) bpm = Math.round(tapped); else bpm = Math.round(tapped * 100) / 100;
        tapInfo = { bpm, tapped: Math.round(tapped * 10) / 10, conf, n: taps.length, spread: Math.round(spread * 10) / 10, lock };
        if (taps.length === 4) pushUndo();
        const align = tapSong.length >= 4 && store.get('three.tapAlign', true) !== false;
        if (lock) {
          // locked: the detected grid stays (or comes back); only taps that clearly put the beat elsewhere move it
          const g0 = G(); const p = 60 / bpm;
          const ph = align && g0 ? tapPhase(tapSong, p, g0.anchor) : null;
          const moved = Boolean(ph && ph.agree > 0.75 && Math.abs(ph.off) > 0.045);
          if (map.grid && Math.abs(map.grid.bpm - bpm) > 0.005) map.grid.bpm = bpm;
          if (moved) { const g = ensureGrid(); g.bpm = bpm; g.anchor = r4(g.anchor + ph.off); }
          // how late you tap, against a grid you agree with (not one your taps just moved)
          if (!moved && tapRaw.length >= 6 && G()) {
            const pr = tapPhase(tapRaw, 60 / G().bpm, G().anchor);
            if (pr.agree > 0.8 && Math.abs(pr.off) < 0.15 && (taps.length === 8 || taps.length === 16)) {
              const n = Math.min(20, (tapLat?.n || 0) + 1);
              tapLat = { ms: Math.round(((tapLat?.ms || 0) * (n - 1) + (pr.off / (st.rate || 1)) * 1000) / n), n };
              store.set('three.tapLatency', tapLat);
            }
          }
          if (lock !== 'same' && !tapToastShown && taps.length >= 6) {
            tapToastShown = true;
            const k = lock === 'half' ? 0.5 : 2; const alt = Math.round(det * k * 100) / 100;
            toast(`You tapped ${lock} time (${Math.round(alt)}): the grid stays at the song's ${det} BPM`, { timeout: 4000, action: { label: `Use ${alt}`, fn: () => editGrid((g) => { g.bpm = alt; }) } });
          }
        } else {
          const g = ensureGrid();
          g.bpm = bpm;
          if (align) {
            // circular mean of the taps' phase within a beat, then keep the bar where it was
            const p = 60 / bpm; const phase = (tapPhase(tapSong, p, 0).off + p) % p;
            g.anchor = r4(phase + Math.round((g.anchor - phase) / p) * p);
          }
        }
        mapChanged();
        emit('tap', tapInfo);
      }
      paintTap(bpm);
      clearTimeout(tap.reset);
      tap.reset = setTimeout(() => { tapBtn.classList.remove('on'); tapBtn.textContent = 'Tap'; tapBtn.style.removeProperty('--conf'); }, 2500);
      return tapInfo;
    }
    function paintTap(bpm) {
      tapBtn.textContent = bpm ? `Tap · ${bpm}${tapInfo?.lock ? ' ✓' : ''}` : `Tap ${'•'.repeat(taps.length)}`;
      tapBtn.classList.toggle('locked', Boolean(tapInfo?.lock));
      tapBtn.classList.add('on');
      tapBtn.classList.remove('flash'); void tapBtn.offsetWidth; tapBtn.classList.add('flash');
      if (tapInfo) tapBtn.style.setProperty('--conf', String(tapInfo.conf));
      paintBpmRead();
    }
    function paintBpmRead() {
      const b = bpmNow();
      const sure = tapInfo && taps.length ? ` · ${Math.round(tapInfo.conf * 100)}%` : '';
      setText(bpmRead, b ? `${Math.round(b * 100) / 100} BPM${sure}` : '');
      bpmRead.classList.toggle('mine', Boolean(map.grid));
      bpmRead.classList.toggle('sure', Boolean(tapInfo && tapInfo.conf >= 0.75));
      const ag = !map.grid && st.analysis?.grid;
      setProp(bpmRead, 'title', `${map.grid ? 'Your grid' : 'Detected tempo'}${ag ? ` (${Math.round((ag.tempoConf ?? 0) * 100)}% sure${ag.straight ? `, bar 1 at ${fmtMs(ag.anchor)}, ${Math.round((ag.downbeatConf ?? 0) * 100)}% sure` : ', played: the beats follow the band'})` : ''}${tapInfo ? ` · last taps: ${tapInfo.n} at ${tapInfo.tapped}, ±${tapInfo.spread} BPM, ${Math.round(tapInfo.conf * 100)}% even${tapInfo.lock ? ', locked to the song\'s grid' : ''}` : ''}${map.grid ? ` · the 1 at ${fmtMs(map.grid.anchor)}` : ''}${tapLat?.n ? ` · you tap about ${Math.abs(tapLat.ms)} ms ${tapLat.ms >= 0 ? 'late' : 'early'} (learned)` : ''} · click to type it`);
    }
    // Shift+T: this tap is the 1 (the downbeat). With a grid, the beat line nearest your tap becomes the 1 (the tempo
    // and phase stay exactly as they were: only which beat counts as "1" changes); without one, the real hit near it.
    function tapOne() {
      if (!D()) return false;
      const raw = tapNow(); const g = G();
      let t = null;
      if (g) { const p = 60 / g.bpm; const onGrid = g.anchor + Math.round((raw - g.anchor) / p) * p; if (Math.abs(onGrid - raw) < Math.min(0.15, p * 0.45)) t = onGrid; }
      if (t == null) t = snapToHit(raw, 'kick');
      editGrid((gg) => { gg.anchor = r4(t); });
      toast(`The 1 is at ${fmtMs(t)} (Shift+T again to move it)`, { timeout: 1500 });
      return t;
    }
    // , and . (while it plays): shift the grid 5 ms earlier / later by ear (Shift 1 ms, Alt 20 ms); one undo step for
    // a run of nudges, and one note that keeps the total
    let nudgeRun = null;
    function nudgeByEar(dir, e = {}) {
      if (!D()) return false;
      const ms = dir * (e.shiftKey ? 1 : e.altKey ? 20 : 5);
      if (!nudgeRun || performance.now() - nudgeRun.at > 1500) { pushUndo(); nudgeRun = { total: 0, note: null }; }
      const g = ensureGrid(); g.anchor = r4(g.anchor + ms / 1000);
      nudgeRun.total += ms; nudgeRun.at = performance.now();
      mapChanged();
      const text = `Grid ${nudgeRun.total > 0 ? '+' : ''}${nudgeRun.total} ms · , . nudge by ear (Shift 1 ms, Alt 20 ms)${gridView.click ? '' : ' · /click-track to hear it'}`;
      if (nudgeRun.note?.isConnected) nudgeRun.note.querySelector('span').textContent = text; else nudgeRun.note = toast(text, { timeout: 2200 });
      return nudgeRun.total;
    }
    // The hits the analysis found in the audio, written as markers you can edit (undoable); in the loop if there is
    // one, else the whole song. Hits next to one you placed by hand are skipped. kind: kick | snare | hats | all
    const found = (k) => st.analysis?.onsets?.[k] || [];
    function markFound(kind = 'kick') {
      if (!D() || !st.analysis?.onsets) return null;
      const range = region ? [region.a, region.b] : [0, D()];
      const kinds = kind === 'all' ? ['kick', 'snare', 'hats'] : [kind];
      pushUndo();
      const counts = {};
      for (const k of kinds) {
        let n = 0;
        for (const o of found(k)) {
          if (o.t < range[0] || o.t >= range[1] || map.marks[k].some((x) => Math.abs(x - o.t) < 0.04)) continue;
          map.marks[k] = addMark(map.marks[k], o.t); n += 1;
        }
        counts[k] = n;
      }
      mapChanged();
      return counts;
    }
    function tapMenu(e) {
      const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
      const align = store.get('three.tapAlign', true) !== false; const round = store.get('three.tapRound', true) !== false;
      menuAt(anchor, [
        ['This tap is the 1', 'Shift+T or Shift+click: the beat line nearest your tap becomes the 1', () => tapOne()],
        st.analysis?.grid ? ['Back to the song\'s grid', `${autoGrid()?.bpm || st.analysis.bpm} BPM, bar 1 as detected`, () => { if (map.grid) { pushUndo(); map.grid = null; mapChanged(); } }] : false,
        ['×2', 'Double the BPM', () => editGrid((g) => { g.bpm = Math.round(g.bpm * 200) / 100; })],
        ['½', 'Halve the BPM', () => editGrid((g) => { g.bpm = Math.round(g.bpm * 50) / 100; })],
        ['Auto: the detected tempo', 'Forget your grid', () => { if (map.grid) { pushUndo(); map.grid = null; mapChanged(); } }],
        null,
        [`${align ? '✓ ' : ''}Taps line up the grid`, 'While it plays, the beats move onto your taps', () => store.set('three.tapAlign', !align)],
        [`${round ? '✓ ' : ''}Round to whole BPM`, 'Within 0.3 of a whole number', () => store.set('three.tapRound', !round)],
        ['Forget the taps', 'Esc', () => { taps = []; tapSong = []; tapRaw = []; tapInfo = null; tapBtn.textContent = 'Tap'; tapBtn.classList.remove('on'); paintBpmRead(); }],
        tapLat?.n ? ['Forget how late I tap', `Learned: ${tapLat.ms} ms`, () => { tapLat = null; store.set('three.tapLatency', null); paintBpmRead(); }] : false,
      ].filter((x) => x !== false));
    }
    // The strongest attack in the audio near t: from 150 ms before (you tap late) to 60 ms after.
    // lane 'kick' listens to the lows, 'snare' / 'hit' to the highs, 'any' to everything.
    function snapToHit(t, lane) {
      const smp = st.samples;
      if (!smp || store.get('three.snapTaps', true) === false) return t;
      const SR = 22050; const hop = 110; // 5 ms
      const a = Math.max(0, Math.floor((t - 0.15) * SR)); const b = Math.min(smp.length, Math.floor((t + 0.06) * SR));
      if (b - a < hop * 4) return t;
      let lp = 0; const env = [];
      for (let i = Math.max(0, a - 2048); i < b; i += 1) {
        const x = smp[i];
        lp += 0.03 * (x - lp); // ~100 Hz low-pass
        const y = lane === 'kick' ? lp : lane === 'any' ? x : x - lp;
        if (i < a) continue;
        const k = Math.floor((i - a) / hop);
        env[k] = (env[k] || 0) + y * y;
      }
      let best = -1; let bi = -1;
      for (let k = 2; k < env.length; k += 1) { const rise = env[k] - Math.max(env[k - 1], env[k - 2]); if (rise > best) { best = rise; bi = k; } }
      const sorted = [...env].sort((x, y) => x - y); const median = sorted[sorted.length >> 1] || 0;
      if (bi < 0 || best < median * 1.5) return t;
      return r4((a + bi * hop) / SR);
    }
    function addMarkAt(lane, t, { snapIt = true } = {}) {
      if (!st.duration) return;
      const tt = Math.max(0, Math.min(D(), snapIt ? snapT(t) : t));
      pushUndo();
      map.marks[lane] = addMark(map.marks[lane], tt);
      selected = { type: 'mark', lane, t: r4(tt) };
      mapChanged();
    }
    // Hot cues: named spots in the song (Drop, Verse…), kept in time order; 1–9 jump to the first nine.
    const CUE_COLORS = ['#ff9f43', '#ff6a9a', '#48ddff', '#7cd992', '#bd8bff', '#ffd75e', '#ff6a6a', '#5ee0c0', '#f2a6ff'];
    // sections get their own colors (drops red, builds orange, intros / outros blue…), other cues cycle
    const SECTION_COLORS = { intro: '#48ddff', verse: '#7cd992', build: '#ff9f43', drop: '#ff6a6a', break: '#bd8bff', chorus: '#ffd75e', bridge: '#5ee0c0', outro: '#48ddff' };
    const cueColor = (c, i) => SECTION_COLORS[String(c.name).toLowerCase().replace(/\s*\d+$/, '')] || CUE_COLORS[i % CUE_COLORS.length];
    function addCue(t, name) {
      if (!D()) return null;
      const tt = r4(Math.max(0, Math.min(D(), snapT(t))));
      if (map.cues.some((c) => Math.abs(c.t - tt) < 0.02)) { toast('There is already a cue here', { timeout: 1500 }); return null; }
      pushUndo();
      const cue = { t: tt, name: name || `Cue ${map.cues.length + 1}` };
      map.cues = [...map.cues, cue].sort((a, b) => a.t - b.t);
      mapChanged();
      const n = map.cues.indexOf(cue) + 1;
      if (!name) toast(`${cue.name} at ${fmtMs(tt)}${n <= 9 ? ` · press ${n} to jump here` : ''} · right-click it to rename`, { timeout: 2400 });
      return cue;
    }
    function editCue(cue, patch) {
      pushUndo();
      map.cues = map.cues.flatMap((c) => (c === cue ? (patch ? [{ ...c, ...patch }] : []) : [c])).sort((a, b) => a.t - b.t);
      mapChanged();
    }
    function cueMenu(e, cue) {
      const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
      menuAt(anchor, [
        ['Rename', cue.name, async () => { const v = await Modal.prompt('Cue name', { value: cue.name }); if (v && v.trim()) editCue(cue, { name: v.trim().slice(0, 40) }); }],
        ['Move here', `To the playhead (${fmtMs(now())})`, () => editCue(cue, { t: r4(snapT(now())) })],
        region ? false : ['Loop to the next cue', 'Sets the loop from this cue to the next one', () => { const nx = map.cues.find((c) => c.t > cue.t + 1e-3); setRegion({ a: cue.t, b: nx ? nx.t : D() }); }],
        lookChoices ? ['✦ Look at this cue…', cue.looks?.length ? cue.looks.map((l) => l.name).join(', ') : 'Slider looks that morph in when the song reaches it', () => cueLookMenu(e, cue)] : false,
        onCueLookHere ? ['✦ The current sliders, here', 'Saves them as a look and plays it from this cue', () => { const l = onCueLookHere(cue); if (l) editCue(cue, { looks: [...(cue.looks || []).filter((x) => x.layer !== l.layer), l] }); }] : false,
        null,
        ['Delete cue', fmtMs(cue.t), () => editCue(cue, null)],
      ].filter((x) => x !== false));
    }
    function cueLookMenu(e, cue) {
      const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
      const groups = lookChoices().filter((g) => g.names.length);
      if (!groups.length) { toast('Save a look first: Sliders → + Save look (a set of slider values)', { timeout: 3500 }); return; }
      const has = (layer, name) => cue.looks?.some((l) => l.layer === layer && l.name === name);
      const toggle = (layer, name) => {
        const rest = (cue.looks || []).filter((l) => l.layer !== layer); // one look per layer at a cue
        editCue(cue, { looks: has(layer, name) ? rest : [...rest, { layer, name }] });
        cueIdx = -2;
      };
      menuAt(anchor, groups.flatMap((g) => g.names.map((n) => [`${has(g.layer, n) ? '✓ ' : ''}${n}`, `${g.layerName}${groups.length > 1 ? '' : ''} · morphs in at "${cue.name}" and stays until another cue changes it`, () => toggle(g.layer, n)])));
    }
    // which cue's section the playhead is in (looks follow it while playing)
    let cueIdx = -2;
    function watchCues() {
      if (!onCue) return;
      const t = now();
      let i = -1;
      for (let k = 0; k < map.cues.length; k += 1) if (map.cues[k].t <= t + 1e-3) i = k;
      const key = st.playing ? i : -3;
      if (key === cueIdx) return;
      cueIdx = key;
      onCue({ index: i, cues: map.cues, playing: st.playing });
    }
    // the next / previous cue from the playhead (PgDn / PgUp)
    function jumpCue(d) {
      const t = now();
      const c = d > 0 ? map.cues.find((x) => x.t > t + 0.05) : [...map.cues].reverse().find((x) => x.t < t - 0.25);
      if (!c) { if (d < 0) seek(0); return Boolean(map.cues.length) || d < 0; }
      seek(c.t);
      return true;
    }
    function addAtPlayhead(lane) {
      // a live tap: the real attack nearby (fixes the tap's delay); the grid only if a line is that close
      const hit = snapToHit(tapNow(), lane);
      const grid = snapT(hit);
      addMarkAt(lane, quantTaps || Math.abs(grid - hit) < 0.03 ? grid : hit, { snapIt: false });
      const b = laneBtns[CORE_LANES.findIndex((l) => l.id === lane)];
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
    // quantize / dedupe the markers (all rows) in a range
    const qMode = () => (['off', 'hits'].includes(snapMode) ? '1/16' : snapMode);
    const qLabel = () => (qMode() === '1/4' ? 'beat' : qMode());
    function quantize([a, b]) {
      pushUndo(); let n = 0;
      for (const ln of LANES) {
        const keep = map.marks[ln.id].filter((t) => t < a || t >= b);
        let moved = map.marks[ln.id].filter((t) => t >= a && t < b).map((t) => { const q = snapTime(t, qMode(), G(), beats(), dIdx()); if (q !== t) n += 1; return q; });
        moved = [...new Set(moved.map((t) => r4(t)))];
        map.marks[ln.id] = [...keep, ...moved].sort((x, y) => x - y);
      }
      mapChanged(); toast(`${n} marker${n === 1 ? '' : 's'} moved onto the ${qLabel()} grid (↶ to undo)`, { timeout: 2200 });
    }
    function dedupe([a, b]) {
      pushUndo(); let n = 0;
      for (const ln of LANES) {
        const out = []; for (const t of map.marks[ln.id]) { if (t >= a && t < b && out.length && t - out[out.length - 1] < 0.08) { n += 1; continue; } out.push(t); }
        map.marks[ln.id] = out;
      }
      mapChanged(); toast(`${n} double${n === 1 ? '' : 's'} removed (↶ to undo)`, { timeout: 2000 });
    }
    // L: loop the bar under the playhead (again: no loop)
    function loopBar() {
      if (!D()) return;
      const t = now(); const len = snapStep('bar', G(), bpmNow());
      let a = snapTime(t, 'bar', G(), beats(), dIdx()); if (a > t + 1e-3) a -= len; if (a < -1e-3) a += len;
      if (region && Math.abs(region.a - a) < 1e-3 && Math.abs(region.b - (a + len)) < 1e-3) { setRegion(null); toast('Loop off', { timeout: 1000 }); return; }
      setRegion({ a: Math.max(0, a), b: Math.min(D(), a + len) });
      if (!st.loop) loopBtn.click();
      toast('Looping this bar · L again to stop', { timeout: 1500 });
    }
    // G: the next snap setting
    function cycleSnap() {
      const i = SNAPS.findIndex(([v]) => v === snapMode);
      snapSel.value = SNAPS[(i + 1) % SNAPS.length][0];
      snapSel.dispatchEvent(new Event('change'));
      toast(`Snap: ${SNAPS.find(([v]) => v === snapSel.value)[1]}`, { timeout: 900 });
    }
    function fillMenu(anchor) {
      const range = region ? [region.a, region.b] : [0, D()];
      const where = region ? 'in the loop' : 'in the whole song';
      const bs = beats();
      const inRange = (t) => t >= range[0] - 1e-3 && t < range[1] - 1e-3;
      const numbered = bs.map((t, i) => ({ t, n: mod(bno(bs, i), bpbNow()) })).filter((b) => inRange(b.t));
      const stamp = (lane, list) => { pushUndo(); for (const t of list) map.marks[lane] = addMark(map.marks[lane], t); mapChanged(); toast(`${list.length} ${lane}${list.length === 1 ? '' : 's'} added ${where}`, { timeout: 2000 }); };
      const clear = (lane) => { pushUndo(); const before = map.marks[lane].length; map.marks[lane] = map.marks[lane].filter((t) => !inRange(t)); mapChanged(); toast(`${before - map.marks[lane].length} ${lane}s removed ${where}`, { timeout: 2000 }); };
      const fAll = ['kick', 'snare', 'hats'].map((k) => found(k).filter((o) => inRange(o.t)).length);
      menuAt(anchor, [
        fAll.some(Boolean) ? ['✦ Mark the hits from the song', `${fAll[0]} kicks, ${fAll[1]} snares, ${fAll[2]} hats found ${where}`, () => { const c = markFound('all'); toast(`Marked ${c.kick} kicks, ${c.snare} snares, ${c.hats} hats (↶ undoes)`, { timeout: 2200 }); }] : false,
        ['Kick on every beat', where, () => stamp('kick', numbered.map((b) => b.t))],
        ['Kick on 1 and 3', where, () => stamp('kick', numbered.filter((b) => b.n === 0 || b.n === 2).map((b) => b.t))],
        ['Snare on 2 and 4', where, () => stamp('snare', numbered.filter((b) => b.n === 1 || b.n === 3).map((b) => b.t))],
        ['Hit on every bar’s 1', where, () => stamp('hit', numbered.filter((b) => b.n === 0).map((b) => b.t))],
        null,
        [`Quantize the markers to ${qLabel()}`, `${where}: every marker moves to the nearest ${qLabel()} (the snap setting)`, () => quantize(range)],
        ['Remove doubles', `${where}: markers closer than 80 ms to the one before go`, () => dedupe(range)],
        null,
        ...shownLanes().map((ln) => [`Clear ${ln.name.toLowerCase()}${ln.id === 'bass' || ln.id === 'hats' ? '' : 's'}`, where, () => clear(ln.id)]),
      ].filter((x) => x !== false));
    }

    // ---------- timeline view ----------
    function setGridView(patch) { gridView = { ...gridView, ...patch }; store.set('three.gridView', gridView); waveCache.key = ''; gridCache.key = ''; sizeCanvas(); draw(); return gridView; }
    // Beat light + click track: follow the grid while it plays (checked every frame in tick)
    let lastBeat = -1; let clickCtx = null;
    function beatTick() {
      if (!st.playing || !D()) { lastBeat = -1; return; }
      const bs = beats(); const i = beatIndex(bs, now());
      if (i === lastBeat || i < 0) return;
      lastBeat = i;
      const down = mod(bno(bs, i), bpbNow()) === 0;
      // restart the beat light's flash without forcing a layout of the whole page (a reflow per beat, before)
      if (gridView.light !== false) { bpmRead.classList.toggle('down', down); for (const a of bpmRead.getAnimations()) a.cancel(); bpmRead.classList.remove('beat'); requestAnimationFrame(() => bpmRead.classList.add('beat')); }
      if (gridView.click) {
        try {
          clickCtx ||= new AudioContext();
          const o = clickCtx.createOscillator(); const g = clickCtx.createGain();
          o.frequency.value = down ? 1760 : 1180; g.gain.setValueAtTime(0.18, clickCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, clickCtx.currentTime + 0.05);
          o.connect(g).connect(clickCtx.destination); o.start(); o.stop(clickCtx.currentTime + 0.06);
        } catch { /* no audio */ }
      }
    }
    function viewMenu(anchor) {
      const v = gridView;
      const tog = (k, label, hint) => [`${v[k] ? '✓ ' : ''}${label}`, hint, () => setGridView({ [k]: !v[k] })];
      menuAt(anchor, [
        tog('lines', 'Beat lines', 'Downbeats red, beats white'),
        tog('numbers', 'Bar numbers', 'On each downbeat'),
        tog('subs', 'Subdivisions', 'Faint lines at the snap setting (1/8, 1/16…)'),
        tog('dim', 'Dim the grid', 'Fainter lines, the waveform stands out'),
        tog('sections', 'Loud parts', 'Yellow shading where the song is loud'),
        tog('drops', 'Drops', 'Red ▼ where a loud part starts'),
        tog('markLines', 'Marker lines', 'Kick / snare / hit markers as lines over the waveform, at any zoom'),
        tog('tall', 'Taller timeline', 'More room for the waveform'),
        tog('follow', 'Follow the playhead', 'Zoomed in, the view moves along while it plays'),
        null,
        tog('light', 'Beat light', 'The BPM readout blinks on every beat (red on the 1)'),
        tog('click', 'Click track', 'A soft click on every beat while it plays, to check the grid by ear'),
        null,
        [`${waveRGB ? '✓ ' : ''}RGB waveform`, 'Red = bass, green = mids, blue = highs (else band lines)', () => waveBtn.click()],
        ['Whole song', '0 · double-click the overview', () => setView(null)],
        region ? ['Zoom to the loop', '', () => fitLoop()] : false,
      ].filter((x) => x !== false));
    }
    // Sections: cues named after the song's parts, so looks (right-click a cue) and slider motions follow them.
    const SECTION_NAMES = ['Intro', 'Verse', 'Build', 'Drop', 'Break', 'Chorus', 'Bridge', 'Outro'];
    function autoSections() {
      const a = st.analysis;
      if (!a?.sections?.length) { toast('The song is still being analyzed (or has no audio)', { type: 'error' }); return 0; }
      // the analysis names them (intro / build / drop / break / outro, from bars of loudness, bass, highs and kicks);
      // older analyses only know loud / quiet, named here the same way
      const count = {};
      const names = a.sections.map((sec, i) => {
        let n = sec.label;
        if (!n) {
          if (i === 0) n = sec.energy === 'loud' ? 'Drop' : 'Intro';
          else if (i === a.sections.length - 1 && sec.energy !== 'loud') n = 'Outro';
          else if (sec.energy === 'loud') n = 'Drop';
          else n = a.sections[i + 1]?.energy === 'loud' ? 'Build' : 'Break';
        }
        count[n] = (count[n] || 0) + 1;
        return count[n] > 1 ? `${n} ${count[n]}` : n;
      });
      editCues({ add: a.sections.map((sec, i) => ({ time: i === 0 ? 0 : snapT(sec.start), name: names[i] })) });
      const unsure = a.sections.filter((x) => x.conf != null && x.conf < 0.45).length;
      toast(`${a.sections.length} sections marked as cues${unsure ? ` (${unsure} unsure: rename or move them)` : ''} · 1–9 jump to them; right-click one to give it a look`, { timeout: 3200 });
      return a.sections.length;
    }
    function sectionsMenu(anchor) {
      menuAt(anchor, [
        ['Mark sections from the song', st.analysis?.sections?.[0]?.label ? `${st.analysis.sections.map((x) => x.label).join(' · ')}` : 'Intro / Build / Drop / Break / Outro from its loud and quiet parts', () => autoSections()],
        null,
        ...SECTION_NAMES.map((n) => [`${n} here`, `A "${n}" cue at the playhead (${fmtMs(now())})`, () => addCue(now(), n)]),
        null,
        map.cues.length ? ['Remove every cue', `${map.cues.length} cue${map.cues.length === 1 ? '' : 's'} (↶ undoes)`, () => editCues({ clear: true })] : false,
      ].filter((x) => x !== false));
    }
    // What part of the song a time is in: the loudness of the analysed section and the cue you're past
    function sectionAt(t = now()) {
      const sec = st.analysis?.sections?.find((x) => t >= x.start && t < x.end);
      let cue = null; for (const c of map.cues) if (c.t <= t + 1e-3) cue = c;
      return { energy: sec?.energy || null, cue: cue?.name || null };
    }
    function editCues({ add = [], remove = [], clear = false } = {}) {
      if (!D()) return false;
      pushUndo();
      if (clear) map.cues = [];
      map.cues = map.cues.filter((c) => !remove.some((r) => (typeof r === 'number' ? Math.abs(r - c.t) < 0.02 : String(r).toLowerCase() === c.name.toLowerCase())));
      for (const a of add) {
        const same = map.cues.find((c) => Math.abs(c.t - a.time) < 0.02);
        const looks = Array.isArray(a.looks) ? a.looks.filter((l) => l?.layer && l?.name).map((l) => ({ layer: String(l.layer), name: String(l.name) })) : null;
        if (same) { if (looks) same.looks = looks; if (a.name) same.name = String(a.name).slice(0, 40); continue; }
        map.cues.push({ t: r4(Math.max(0, Math.min(D(), a.time))), name: String(a.name || `Cue ${map.cues.length + 1}`).slice(0, 40), ...(looks ? { looks } : {}) });
      }
      map.cues.sort((a, b) => a.t - b.t);
      mapChanged();
      return true;
    }
    // A marker's own menu (right-click it): delete, nudge, quantize, another row, to the playhead
    function markMenu(e, lane, t) {
      const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
      selected = { type: 'mark', lane, t }; draw();
      const move = (to) => { pushUndo(); moveSelectedMark(to); mapChanged(); };
      menuAt(anchor, [
        ['Delete', 'Or double-click it · Delete key', () => deleteSelectedMark()],
        ['Nudge 10 ms earlier', '← (Alt: 1 ms, Shift: a grid step)', () => move(t - 0.01)],
        ['Nudge 10 ms later', '→', () => move(t + 0.01)],
        [`Onto the grid (${qLabel()})`, 'Quantize just this one', () => move(snapTime(t, qMode(), G(), beats(), dIdx()))],
        ['Onto the hit', 'The real attack in the audio nearby', () => { const h = snapToHit(t + 0.05, lane === 'kick' || lane === 'bass' ? 'kick' : lane); move(h); }],
        ['To the playhead', fmtMs(now()), () => move(now())],
        null,
        ...shownLanes().filter((l) => l.id !== lane).map((l) => [`Make it a ${l.name.toLowerCase()}`, '', () => { pushUndo(); map.marks[lane] = map.marks[lane].filter((x) => Math.abs(x - t) > 1e-4); map.marks[l.id] = addMark(map.marks[l.id], t); selected = { type: 'mark', lane: l.id, t }; mapChanged(); }]),
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

    // ---------- trim + cut (round 6): the song starts at trim.a and stops at trim.b; the loop or trim can be saved as
    // a file (ffmpeg) or sent to Video Review as a clip of its cut (tools/video-cut.js) ----------
    function setTrim(r) {
      if (!D()) return null;
      pushUndo();
      map.trim = r && r.b - r.a >= 0.05 ? { a: r4(clamp01(r.a, D())), b: r4(clamp01(r.b, D())) } : null;
      if (map.trim && map.trim.a >= map.trim.b) map.trim = null;
      mapChanged();
      if (map.trim && (now() < map.trim.a || now() > map.trim.b)) seek(map.trim.a);
      return map.trim ? { ...map.trim } : null;
    }
    const clamp01 = (t, d) => Math.max(0, Math.min(d, t));
    function setTrimEdge(edge, t) {
      const cur = map.trim || { a: 0, b: D() };
      const r = { ...cur, [edge]: snapT(t) };
      if (r.b < r.a) [r.a, r.b] = [r.b, r.a];
      const out = setTrim(r);
      if (out) toast(`Song ${edge === 'a' ? 'starts' : 'ends'} at ${fmtMs(out[edge])} · /song-trim off undoes it`, { timeout: 1800 });
      return out;
    }
    const cutRange = () => (region ? { ...region, what: 'the loop' } : map.trim ? { ...map.trim, what: 'the trimmed song' } : { a: 0, b: D(), what: 'the whole file' });
    async function cutLoop() {
      if (!st.path || !D()) return null;
      const tools = await window.hub.video.tools({ ffmpeg: H.settings().ffmpegPath || undefined });
      if (!tools.ffmpeg) { toast(`Saving a part needs ffmpeg: ${tools.hint}`, { type: 'error', timeout: 8000 }); return null; }
      const r = cutRange();
      const ext = st.video ? 'mp4' : extOf(st.path) === 'wav' ? 'wav' : 'm4a';
      const stamp = (t) => fmtMs(t).replace(/[:.]/g, '-');
      const output = st.path.replace(/\.[^.\\/]+$/, '') + `_cut ${stamp(r.a)}_${stamp(r.b)}.${ext}`;
      const codec = st.video ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart'] : ext === 'wav' ? ['-vn', '-c:a', 'pcm_s16le'] : ['-vn', '-c:a', 'aac', '-b:a', '256k'];
      const args = ['-hide_banner', '-y', '-ss', String(r.a), '-i', 'INPUT', '-t', String(Math.max(0.05, r.b - r.a)), ...codec, 'OUTPUT'];
      const job = await Review.startJob({ label: `Save ${r.what}`, input: st.path, output, args, duration: r.b - r.a, library: st.video });
      if (!job) return null;
      const ev = await job.done;
      return ev.code === 0 ? output : null;
    }
    // as: 'clip' (the open edit's main track), 'edit' (opens it in the video editor as its own edit), 'overlay'
    // (a layer above the open edit at its playhead) or 'music' (the song on the edit's audio track)
    async function sendClip(as = 'clip') {
      if (!st.path || !D()) return false;
      if (typeof VideoCut === 'undefined') return false;
      const r = cutRange();
      if (st.playing) toggle(false);
      if (as === 'music') {
        await Review.ensureMounted(); activate('tool:ae');
        if (!VideoCut.active && !(await VideoCut.enter())) return false;
        return Boolean(await VideoCut.addAudio(st.path, { at: 0, a: r.a, b: r.b }));
      }
      if (!st.video) { toast('The video editor takes videos here: "Use as the edit\'s music" puts a song under it, /cut-loop saves this part as a file', { timeout: 4000 }); return false; }
      return VideoCut.receive(st.path, { a: r.a, b: r.b, as });
    }

    // ---------- keys (the Lab forwards them when you're not typing) ----------
    function onKey(e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return false;
      if (e.code === 'Space' && !e.ctrlKey && !e.altKey) { toggle(); return true; }
      if (!st.bytes) return false;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') { undoMap(); return true; }
      const hk = hooks.key?.(e, { selected, points: Boolean(autoSel?.idx.size) });
      if (hk != null) return hk;
      // curve points: copy / paste at the playhead / duplicate after themselves / select all in the lane
      if (ctrl && e.key.toLowerCase() === 'c' && autoSel?.idx.size) { copyPoints(); return true; }
      if (ctrl && e.key.toLowerCase() === 'v' && autoClip && activeLane) { pastePoints(); return true; }
      if (ctrl && e.key.toLowerCase() === 'd' && autoSel?.idx.size) { duplicatePoints(); return true; }
      if (ctrl && e.key.toLowerCase() === 'a' && activeLane) { selectAllPoints(); return true; }
      if (ctrl) return false;
      if (e.key.toLowerCase() === 'a' && !e.altKey && !e.shiftKey) { trackHandlers.onLanesAll?.(); return true; }
      if (e.key.toLowerCase() === 't' && !e.altKey && !e.repeat) { if (e.shiftKey) tapOne(); else tap(); return true; }
      if ((e.code === 'Comma' || e.code === 'Period') && st.clock && !G()) { seek(now() + (e.code === 'Comma' ? -1 : 1) * (e.shiftKey ? 10 : 1) / clockFps()); return true; }
      if (e.code === 'Comma' || e.code === 'Period') { nudgeByEar(e.code === 'Comma' ? -1 : 1, e); return true; }
      if (e.key.toLowerCase() === 'q' && !e.altKey && !e.shiftKey) { toast(setQuantize(!quantTaps) ? 'Quantize taps on: K / S / H land on the grid' : 'Quantize taps off: K / S / H land on the sound', { timeout: 1400 }); return true; }
      if ((e.key === '=' || e.key === '+') && !e.altKey) { zoomBy(1 / 1.6); return true; }
      if (e.key === '-' && !e.altKey) { zoomBy(1.6); return true; }
      if (e.key === '0' && !e.altKey) { setView(null); return true; }
      if (e.key === 'Home') { seek(region && now() > region.a + 0.01 ? region.a : 0); return true; }
      if (e.key === 'End') { seek(region ? region.b - 0.01 : Math.max(0, D() - 0.05)); return true; }
      if (e.key.toLowerCase() === 'm' && !ctrl && !e.altKey) { toggleMute(); return true; }
      if (e.key.toLowerCase() === 'l' && !ctrl && !e.altKey) { loopBar(); return true; }
      if (e.key.toLowerCase() === 'g' && !ctrl && !e.altKey) { cycleSnap(); return true; }
      // hot cues (like rekordbox): C drops one at the playhead, 1–9 jump to them
      if (e.key.toLowerCase() === 'c' && !e.altKey) { addCue(now()); return true; }
      if (/^[1-9]$/.test(e.key) && !e.altKey) { const c = map.cues[Number(e.key) - 1]; if (c) { seek(c.t); return true; } return false; }
      if (e.key === 'PageDown' || e.key === 'PageUp') return jumpCue(e.key === 'PageDown' ? 1 : -1);
      const lane = CORE_LANES.find((l) => l.key === e.key.toLowerCase());
      if (lane && !e.altKey) { addAtPlayhead(lane.id); return true; }
      if (e.key === '{') { setTrimEdge('a', now()); return true; }
      if (e.key === '}') { setTrimEdge('b', now()); return true; }
      if (e.key === '[') { setRegionEdge('a', now()); return true; }
      if (e.key === ']') { setRegionEdge('b', now()); return true; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && autoSel?.idx.size) { deletePoints(); return true; }
      if (e.key === 'Delete' || e.key === 'Backspace') return deleteSelectedMark();
      if (e.key === 'Escape') { if (taps.length) { taps = []; tapSong = []; tapRaw = []; tapBtn.textContent = 'Tap'; tapBtn.classList.remove('on'); } if (autoSel) { autoSel = null; draw(); return true; } selected = null; draw(); return true; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        const d = hooks.arrowStep?.(dir, e) ?? (st.clock && !e.altKey ? dir * (e.shiftKey ? 10 : 1) / clockFps() : dir * (e.shiftKey ? snapStep(snapMode, G(), bpmNow()) : e.altKey ? 0.001 : 0.01));
        if (autoSel?.idx.size) nudgePoints(d, 0, e.repeat);
        else if (selected?.type === 'edge' && region && !locked) setRegionEdge(selected.edge, region[selected.edge] + d, { exact: true });
        else if (selected?.type === 'mark') { if (!e.repeat || !nudgeKey.pushed) { pushUndo(); nudgeKey.pushed = true; } moveSelectedMark(selected.t + d); mapChanged(); }
        else seek(now() + d);
        return true;
      }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && autoSel?.idx.size) {
        const ln = laneOf(autoSel.id, autoSel.prop);
        const unit = (ln.max - ln.min) / (e.shiftKey ? 10 : e.altKey ? 1000 : 100);
        nudgePoints(0, (e.key === 'ArrowUp' ? 1 : -1) * Math.max(unit, e.altKey ? 0 : ln.step || 0), e.repeat);
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
      const menu = el('div', { class: 'mb-menu lab-compact' }, items.map((it) => (it ? el('button', { class: 'menu-item', on: { click: () => { menu.remove(); it[2](); } } }, el('b', { text: it[0] }), el('span', { class: 'hint', text: it[1] })) : el('div', { class: 'menu-sep' }))));
      const r = anchor.getBoundingClientRect();
      Object.assign(menu.style, { left: `${Math.max(8, Math.min(innerWidth - 300, r.left))}px`, top: `${r.top - 8}px`, maxHeight: `${Math.round(innerHeight * 0.8)}px`, overflowY: 'auto' });
      document.body.append(menu);
      // never off-screen: a menu that doesn't fit above the button opens from the top of the window instead
      const mr = menu.getBoundingClientRect();
      if (mr.top < 8) Object.assign(menu.style, { transform: 'none', top: `${Math.max(8, Math.min(r.bottom + 4, innerHeight - 8 - mr.height))}px` });
      const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); removeEventListener('pointerdown', close, true); } };
      setTimeout(() => addEventListener('pointerdown', close, true));
    }
    // Recording: what to record, in which of your four sizes, at which frame rate and quality, with a countdown.
    const recOpts = () => ({ fps: 60, mbps: 16, countdown: 0, ...store.get('three.recOpts', {}) });
    const setRecOpt = (patch) => store.set('three.recOpts', { ...recOpts(), ...patch });
    function recordMenu(anchor) {
      const o = recOpts();
      const fr = frameHook?.get?.();
      const fmt = fr && fr.id !== 'fit' ? `${fr.width}×${fr.height}` : 'the preview size (pick a size for an exact one)';
      menuAt(anchor, [
        region && st.bytes ? ['The loop', `${fmtMs(region.a)} → ${fmtMs(region.b)}, once · ${fmt}`, () => startRecord('loop')] : false,
        st.bytes ? ['Whole song', `From the start to the end · ${fmt}`, () => startRecord('track')] : false,
        ['From here', `${st.bytes ? 'From the current spot' : 'Now'} until you press Stop · ${fmt}`, () => startRecord('manual')],
        st.bytes ? ['8 bars from here', 'Sets the loop to 8 bars from this bar and records it', () => recordSpan({ bars: 8 })] : false,
        st.bytes ? ['15 s · 30 s · 60 s from here…', 'Social lengths', () => menuAt(anchor, [15, 30, 60, 90].map((sec) => [`${sec} s from here`, `${fmtMs(now())} → ${fmtMs(Math.min(D(), now() + sec))}`, () => recordSpan({ seconds: sec })]))] : false,
        null,
        ...(frameHook ? [['9:16', '1080×1920'], ['16:9', '1920×1080'], ['4:5', '1080×1350'], ['1:1', '1080×1080']].map(([id, px]) => [`${fr?.id === id ? '● ' : ''}Size ${id}`, px, () => { frameHook.set(id); setTimeout(() => recordMenu(anchor), 400); }]) : []),
        null,
        [`${o.fps === 60 ? '● ' : ''}60 fps`, 'Smooth', () => { setRecOpt({ fps: 60 }); recordMenu(anchor); }],
        [`${o.fps === 30 ? '● ' : ''}30 fps`, 'Lighter, smaller files', () => { setRecOpt({ fps: 30 }); recordMenu(anchor); }],
        [`${o.mbps >= 32 ? '● ' : ''}High quality`, '32 Mbps (big files)', () => { setRecOpt({ mbps: 32 }); recordMenu(anchor); }],
        [`${o.mbps < 32 ? '● ' : ''}Normal quality`, '16 Mbps', () => { setRecOpt({ mbps: 16 }); recordMenu(anchor); }],
        [`${o.countdown ? '● ' : ''}3-second countdown`, 'Time to get ready', () => { setRecOpt({ countdown: o.countdown ? 0 : 3 }); recordMenu(anchor); }],
      ].filter((x) => x !== false).filter((x, i, arr) => x !== null || (i > 0 && arr[i - 1] !== null && i < arr.length - 1)));
    }
    // a length from the playhead (N bars from this bar, or N seconds) becomes the loop, then it's recorded once
    function recordSpan({ bars = null, seconds = null } = {}) {
      if (!D()) return false;
      if (locked) { toast('The loop is locked: unlock it first', { type: 'error' }); return false; }
      const t = now();
      if (bars) { const bar = snapStep('bar', G(), bpmNow()); let a = snapTime(t, 'bar', G(), beats(), dIdx()); if (a > t + 1e-3) a -= bar; if (a < -1e-3) a += bar; setRegion({ a: Math.max(0, a), b: Math.min(D(), a + bar * bars) }); } else setRegion({ a: t, b: Math.min(D(), t + seconds) });
      if (!region) return false;
      startRecord('loop');
      return { ...region };
    }
    function startRecord(kind) {
      const o = recOpts();
      if (o.countdown && !startRecord.counting) {
        startRecord.counting = true;
        let n = o.countdown;
        const t = toast(`Recording in ${n}…`, { timeout: 5000 });
        const iv = setInterval(() => { n -= 1; if (n > 0) t.querySelector('span').textContent = `Recording in ${n}…`; else { clearInterval(iv); t.remove(); startRecord(kind); startRecord.counting = false; } }, 1000);
        return;
      }
      if (st.rate !== 1) { setRate(1); toast('Back to 1× speed for the recording', { timeout: 1800 }); }
      recording = { kind, startedAt: performance.now() };
      let until = null;
      if (kind === 'track') { send({ type: 'media', cmd: 'loop', value: false }); seek(0); toggle(true); }
      else if (kind === 'loop') { until = region.b; seek(region.a); toggle(true); }
      else if (st.bytes && !st.playing) toggle(true);
      send({ type: 'record', cmd: 'start', fps: o.fps, bitrate: o.mbps * 1e6, until });
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
      if (p && typeof Review !== 'undefined') Review.noteRecording(p); // recordings show up in Video Review wherever they're saved
    }

    // ---------- drawing ----------
    const RULER = 16; const LANE_H = 14;
    const sizes = { cw: 0, ch: 0, mw: 0, mh: 0, cOk: false, mOk: false };
    const cW = () => (sizes.cOk ? sizes.cw : canvas.clientWidth); const cH = () => (sizes.cOk ? sizes.ch : canvas.clientHeight);
    const mW = () => (sizes.mOk ? sizes.mw : minimap.clientWidth); const mH = () => (sizes.mOk ? sizes.mh : minimap.clientHeight);
    const shown = () => (sizes.cOk ? sizes.cw > 0 && sizes.ch > 0 : Boolean(canvas.offsetParent)); // the timeline is on screen (display: none → 0 × 0)
    const ghostHint = {}; // lane → right edge (px) of its "✦ N found · keep them" note, for clicks
    const laneTop = (h) => h - shownLanes().length * LANE_H - tracksH();
    let raf = 0;
    const waveCache = { key: '', canvas: document.createElement('canvas') };
    const gridCache = { key: '', canvas: document.createElement('canvas') };
    // what the main canvas shows, as one string: draw() skips the canvas when it's unchanged
    let lastFrameKey = ''; let anaVer = 0;
    const sumOf = (list) => { let x = 0; for (const t of list) x += t; return `${list.length}:${x.toFixed(4)}`; };
    function frameKey(W, h) {
      const lanesMoving = tracks.some((tr) => lanesOf(tr).length); // the header column shows lane values at the playhead
      // (while the strip scrolls this canvas only shows the header column: the view moving changes nothing on it)
      return [W, h, devicePixelRatio, scroll.on ? 'strip' : `${v0()}|${span()}`, D(), anaVer, st.path, waveRGB, scroll.on, JSON.stringify(gridView), snapMode, bpmNow(), G()?.anchor, bpbNow(), dIdx(),
        LANES.map((l) => sumOf(map.marks[l.id])).join(), map.cues.map((c) => `${c.t}${c.name}${c.looks?.length || 0}`).join(), region ? `${region.a}|${region.b}|${locked}|${st.loop}` : '', map.trim ? `${map.trim.a}|${map.trim.b}` : '',
        selected ? JSON.stringify(selected) : '', notes.map((n) => `${n.t}${n.done}`).join(), JSON.stringify(tracks), autoSel ? `${autoSel.id}|${autoSel.prop}|${[...autoSel.idx].join(',')}` : '',
        activeLane ? `${activeLane.id}|${activeLane.prop}` : '', lanesMoving ? Math.round(now() * 20) : '', hooks.frameKey?.() || ''].join('~');
    }
    let lastMiniKey = '';
    let lastFull = 0;
    function tick() {
      beatTick();
      if (dragging) { paint(); return; }
      // While it plays only the picture, the time and the playhead move: the control row is repainted by paint()
      // when something actually changes (play / pause / loop / markers…), not ten times a second.
      if (performance.now() - lastFull > 100) livePaint();
      placePlayheads();
      raf = requestAnimationFrame(tick);
    }
    function livePaint() {
      lastFull = performance.now();
      if (recording) setText(recBtn, recording.stopping ? '… saving' : `⏹ Stop ${fmtTime((performance.now() - recording.startedAt) / 1000)}`);
      if (view && st.playing && !locked && gridView.follow !== false && !scroll.on) {
        const t = now();
        if (t > view.end || t < view.start) setView({ start: t - span() * 0.1, end: t - span() * 0.1 + span() });
      }
      draw();
    }
    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    const setProp = (node, k, v) => { if (node[k] !== v) node[k] = v; };
    const setDisplay = (node, on) => { const v = on ? '' : 'none'; if (node.style.display !== v) node.style.display = v; }; // per frame: only real changes
    // The playheads glide on the compositor: while a song plays each one gets a linear animation to where it will be
    // at the end of the view (the end of the song for the minimap), so it moves at the screen's refresh rate even when
    // the main thread is busy (the preview rendering, a reply streaming). JS only restarts it when the view, the rate
    // or the play state changes, or when it has drifted more than 2 px from the audio clock.
    const heads = new Map(); // element -> { anim, key, x0, x1 }
    function glide(elm, x, xEnd, ms, key, moving) {
      let h = heads.get(elm);
      if (!moving || !(ms > 30)) {
        if (h?.anim) { h.anim.cancel(); h.anim = null; }
        elm.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
        return;
      }
      const at = h?.anim ? h.x0 + (h.x1 - h.x0) * (h.anim.effect.getComputedTiming().progress ?? 0) : NaN;
      if (h?.anim && h.key === key && Math.abs(at - x) <= 2) return;
      h?.anim?.cancel();
      elm.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      const anim = elm.animate([{ transform: `translate3d(${x.toFixed(2)}px, 0, 0)` }, { transform: `translate3d(${xEnd.toFixed(2)}px, 0, 0)` }], { duration: ms, easing: 'linear', fill: 'forwards' });
      anim.startTime = document.timeline.currentTime; // start at x now, not when it's first drawn (a few frames later)
      heads.set(elm, { anim, key, x0: x, x1: xEnd });
    }
    // ---------- smooth scrolling while it plays (zoomed in, following) ----------
    // Like a DAW: once the playhead reaches ANCHOR of the view it stays there and the timeline slides under it. A strip
    // three views wide is drawn once and moved by a compositor animation (smooth even when the main thread is busy);
    // it's redrawn about every two views, or after a seek / zoom / resize. Near the end of the song the last view stays
    // and the playhead runs to the end.
    const scrollWanted = () => Boolean(view) && st.playing && !locked && !dragging && gridView.follow !== false && D() > 0 && shown();
    function scrollStop(nextView) {
      if (!scroll.on) return;
      scroll.on = false;
      scroll.anim?.cancel(); scroll.anim = null;
      stripClip.hidden = true;
      if (nextView) view = nextView;
      paint();
    }
    function scrollAnimate(t) {
      const { S, sp, w } = scroll;
      const rate = st.rate || 1;
      const x = -(((t - ANCHOR * sp) - S) / sp) * w;
      const x1 = -2 * w;
      const ms = ((S + 2 * sp + ANCHOR * sp - t) / rate) * 1000;
      scroll.anim?.cancel();
      strip.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      if (!(ms > 30)) { scroll.anim = null; return; }
      scroll.anim = strip.animate([{ transform: `translate3d(${x.toFixed(2)}px, 0, 0)` }, { transform: `translate3d(${x1.toFixed(2)}px, 0, 0)` }], { duration: ms, easing: 'linear', fill: 'forwards' });
      scroll.anim.startTime = document.timeline.currentTime;
      scroll.x0 = x; scroll.x1 = x1;
    }
    function scrollStart(L, sp, w, t) {
      Object.assign(scroll, { on: true, S: L, sp, w });
      view = { start: L, end: L + sp };
      stripClip.style.width = `${w}px`;
      strip.style.width = `${3 * w}px`; strip.style.height = `${cH()}px`;
      draw({ canvas: strip, w: 3 * w, s0: L, sp: 3 * sp });
      stripClip.hidden = false;
      draw(); // the main canvas keeps only its header column now
      scrollAnimate(t);
    }
    function scrollUpdate(t) {
      if (!scrollWanted()) { if (scroll.on) scrollStop(); return; }
      const sp = span(); const w = tw();
      const L = t - ANCHOR * sp; // the view's start with the playhead at the anchor
      if (L + sp >= D()) { if (scroll.on) scrollStop({ start: Math.max(0, D() - sp), end: D() }); return; }
      if (!scroll.on) { if (L >= v0() - 1e-3) scrollStart(L, sp, w, t); return; }
      if (Math.abs(scroll.sp - sp) > 1e-6 || scroll.w !== w || L < scroll.S - 1e-3 || L > scroll.S + 1.8 * sp) { scrollStart(L, sp, w, t); return; }
      view.start = L; view.end = L + sp; // clicks, hover and the minimap box follow (no repaint)
      const want = -((L - scroll.S) / sp) * w;
      const at = scroll.anim ? scroll.x0 + (scroll.x1 - scroll.x0) * (scroll.anim.effect.getComputedTiming().progress ?? 0) : NaN;
      if (!(Math.abs(at - want) <= 2)) scrollAnimate(t);
    }
    function placePlayheads() {
      watchCues();
      const rate = st.rate || 1;
      // positions on the frame's clock (what the animations run on), not "now": in a slow frame the two differ
      const t = st.playing ? Math.max(0, now() - ((performance.now() - (document.timeline.currentTime ?? performance.now())) / 1000) * rate) : now();
      const w = tw();
      scrollUpdate(t);
      const x = scroll.on ? ANCHOR * w : D() ? ((t - v0()) / span()) * w : -10;
      const moving = st.playing && Boolean(D()) && !dragging && !scroll.on;
      setDisplay(playheadEl, x >= -1 && x <= w + 1 && shown());
      const vEnd = Math.min(v0() + span(), D() || 0);
      glide(playheadEl, x, ((vEnd - v0()) / span()) * w, ((vEnd - t) / rate) * 1000, `${v0()}|${span()}|${w}|${rate}`, moving);
      const mw = mW();
      setDisplay(miniHeadEl, Boolean(D() && mw && !minimap.hidden));
      glide(miniHeadEl, D() ? (t / D()) * mw : 0, mw, ((D() - t) / rate) * 1000, `${D()}|${mw}|${rate}`, moving && mw > 0);
    }
    function now() { return st.playing ? Math.min(D() || Infinity, st.time + ((performance.now() - st.stampAt) / 1000) * st.rate) : st.time; }
    // paint() runs on every seek, step and state change: each control is only written when its value changes (a
    // same-value write still counts as a DOM change and restyles the row)
    function paint() {
      bar.classList.toggle('mb-empty', !st.bytes);
      bar.classList.toggle('mb-clock', Boolean(st.clock));
      bar.classList.toggle('locked', locked);
      setText(nameEl, st.name ? (analyzing ? `${st.name} · analyzing…` : st.name) : 'No music loaded: sketches get a demo beat');
      setText(loadBtn, st.bytes ? '🎵' : '🎵 Load audio / video…');
      setProp(loadBtn, 'title', st.clock ? 'Load a song or a video onto this scene\'s timeline (its keyframes and cues keep their seconds)' : 'Pick an mp3, wav, mp4… to drive the sketch (or drop one on the preview)');
      setProp(nameEl, 'title', st.clock ? `This scene's own timeline: ${fmtLen(D())} at ${clockFps()} fps, no song (keyframes, cues and the loop work on it, frame by frame) · click: its length` : st.path || '');
      setProp(unloadBtn, 'hidden', !st.bytes || Boolean(st.clock));
      setText(playBtn, st.playing ? '⏸' : '▶');
      loopBtn.classList.toggle('on', st.loop);
      setProp(zoomOut, 'disabled', locked || !D()); setProp(zoomIn, 'disabled', locked || !D());
      setProp(zoomAll, 'disabled', locked || !view);
      setProp(zoomLoop, 'hidden', !region);
      setProp(zoomLoop, 'disabled', locked);
      for (const x of loopBox.querySelectorAll('button, input')) setProp(x, 'disabled', locked || !D());
      setProp(clearBtn, 'hidden', !region);
      if (document.activeElement !== aIn) setProp(aIn, 'value', region ? fmtMs(region.a) : '');
      if (document.activeElement !== bIn) setProp(bIn, 'value', region ? fmtMs(region.b) : '');
      setProp(aIn, 'placeholder', 'start'); setProp(bIn, 'placeholder', 'end');
      setText(loopLen, region ? `⟲ ${bpmNow() ? `${(((region.b - region.a) * bpmNow()) / 60).toFixed(2).replace(/\.00$/, '')} beats · ` : ''}${(region.b - region.a).toFixed(2)} s` : '');
      setProp(loopChip, 'hidden', !region);
      loopChip.classList.toggle('off', !st.loop);
      setProp(loopChip, 'title', region ? `Loop ${fmtMs(region.a)} → ${fmtMs(region.b)}${locked ? ' (locked)' : ''} · Shift+drag the waveform for a new one` : '');
      paintBpmRead();
      setText(lockBtn, locked ? '🔒 Locked' : '🔓');
      lockBtn.classList.toggle('on', locked);
      setProp(lockBtn, 'disabled', !region && !locked);
      if (document.activeElement !== bpmIn) setProp(bpmIn, 'value', bpmNow() ? bpmNow().toFixed(2) : '');
      setProp(meterSel, 'value', String(bpbNow()));
      paintCands();
      setText(gridState, map.grid ? `yours · 1 at ${fmtMs(map.grid.anchor)}` : (st.analysis ? 'detected' : ''));
      gridState.classList.toggle('mine', Boolean(map.grid));
      setProp(autoBtn, 'disabled', !map.grid);
      setProp(undoBtn, 'disabled', !mapUndo.length);
      CORE_LANES.forEach((ln, i) => { setText(laneBtns[i], `${ln.key.toUpperCase()} ${ln.name} ${map.marks[ln.id].length || ''}`.trim()); });
      setText(recBtn, recording ? (recording.stopping ? '… saving' : `⏹ Stop ${fmtTime((performance.now() - recording.startedAt) / 1000)}`) : '⏺ Record');
      recBtn.classList.toggle('on', Boolean(recording));
      hooks.paint?.();
      if (view && st.playing && !locked && !dragging && gridView.follow !== false && !scroll.on) {
        const t = now();
        if (t > view.end || t < view.start) setView({ start: t - span() * 0.1, end: t - span() * 0.1 + span() });
      }
      draw();
      // something changed while the strip scrolls (a tap, a marker, the grid): redraw it in place
      if (scroll.on) draw({ canvas: strip, w: 3 * scroll.w, s0: scroll.S, sp: 3 * scroll.sp });
      cancelAnimationFrame(raf);
      lastFull = performance.now();
      placePlayheads();
      if (st.playing || recording) raf = requestAnimationFrame(tick);
    }
    // ov: draw the time area into another canvas with its own view (the scrolling strip, see scroll below)
    function draw(ov = null) {
      const t = now();
      if (!ov) {
        setText(timeEl, hooks.timeText?.(t) ?? clockText(t) ?? (D() ? `${span() < 20 ? fmtMs(t) : fmtTime(t)} / ${fmtTime(D())}` : fmtTime(t)));
        setText(miniTime, D() ? `${fmtTime(t)} / ${fmtTime(D())}` : '');
        setText(miniPlay, st.playing ? '⏸' : '▶');
        drawMinimap(t);
      }
      const cv = ov ? ov.canvas : canvas;
      const W = ov ? ov.w : cW(); const h = cH();
      if (!W || !h) return;
      // Nothing on the canvas changed since the last draw (a song playing in a still view: only the playhead, an
      // element of its own, moves): keep the pixels, no repaint. Dragging always draws.
      if (!ov) { const fk = dragging ? '' : frameKey(W, h); if (fk && fk === lastFrameKey) return; lastFrameKey = fk; }
      // the time area; the header column (GUT px) on the right holds the ▾ choosers and lane names
      const w = ov ? ov.w : tw();
      const dpr = devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, h);
      // while the strip scrolls, the main canvas only keeps the header column
      if (!ov && scroll.on) { drawGutter(g, w, W, h, t); return; }
      if (!D()) { g.fillStyle = '#ffffff10'; g.fillRect(0, h / 2 - 1, w, 2); drawGutter(g, w, W, h, 0); return; }
      g.save();
      g.beginPath(); g.rect(0, 0, w, h); g.clip();
      const s0 = ov ? ov.s0 : v0(); const sp = ov ? ov.sp : span();
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
      // The waveform is the heavy part (a color per pixel column): drawn once into an offscreen canvas and
      // reused until the view, size or song changes, so playback only repaints the light overlays.
      const wkey = `${s0}|${sp}|${w}|${h}|${top}|${H}|${waveRGB}|${dpr}|${st.path}|${Boolean(a)}|${Boolean(st.samples)}|${Boolean(st.wave)}|${gridView.sections}`;
      if (waveCache.key !== wkey) {
        waveCache.key = wkey;
        const wc = waveCache.canvas;
        wc.width = Math.round(w * dpr); wc.height = Math.round(h * dpr);
        const wg = wc.getContext('2d');
        wg.setTransform(dpr, 0, 0, dpr, 0, 0);
        wg.clearRect(0, 0, w, h);
        // the detected sections as soft bands in their colors (Drop red, Build orange, Intro / Outro blue, Break violet),
        // named at the bottom (a "?" when the analysis isn't sure); older analyses only shade the loud parts
        if (a && gridView.sections) {
          wg.font = '10px Consolas, monospace';
          for (const sc of a.sections) {
            const xa = X(sc.start); const xb = X(sc.end);
            if (xb < 0 || xa > w) continue;
            if (!sc.label) { if (sc.energy === 'loud') { wg.fillStyle = '#ffd75e10'; wg.fillRect(xa, top, xb - xa, H); } continue; }
            const col = SECTION_COLORS[sc.label.toLowerCase()] || '#ffd75e';
            wg.fillStyle = `${col}10`; wg.fillRect(xa, top, xb - xa, H);
          }
        }
        // waveform: raw samples when very close, peaks when close, energy curves when far
        const mid = top + H / 2;
        if (sp < 3 && st.samples) {
          const SR = 22050; const smp = st.samples;
          wg.fillStyle = '#ffd75ec0';
          for (let x = 0; x < w; x += 1) {
            const i0 = Math.floor((s0 + (x / w) * sp) * SR); const i1 = Math.max(i0 + 1, Math.floor((s0 + ((x + 1) / w) * sp) * SR));
            let lo = 0; let hi = 0;
            for (let i = i0; i < i1 && i < smp.length; i += 1) { if (smp[i] < lo) lo = smp[i]; if (smp[i] > hi) hi = smp[i]; }
            wg.fillRect(x, mid - hi * (H / 2 - 2), 1, Math.max(1, (hi - lo) * (H / 2 - 2)));
          }
        } else if (waveRGB && st.wave) {
          // 3-band waveform (like rekordbox's): bass outermost, then mids, highs innermost, each as tall as its own
          // loudness, so kicks, bass lines, vocals and hats read apart at a glance
          const wv = st.wave; const fr = wv.fps; const n = wv.low.length; const half = H / 2 - 2;
          const band = (arr, color, k) => {
            wg.fillStyle = color; wg.beginPath();
            for (let x = 0; x < w; x += 1) {
              const i0 = Math.max(0, Math.floor((s0 + (x / w) * sp) * fr)); const i1 = Math.min(n, Math.max(i0 + 1, Math.floor((s0 + ((x + 1) / w) * sp) * fr)));
              let m = 0; for (let i = i0; i < i1; i += 1) if (arr[i] > m) m = arr[i];
              const hh = (m / 255) * half * k;
              if (hh > 0.4) wg.rect(x, mid - hh, 1, hh * 2);
            }
            wg.fill();
          };
          band(wv.low, '#ff6a4dd0', 1); band(wv.mid, '#ffd75ed0', 0.82); band(wv.high, '#8fe6ffe0', 0.62);
        } else if (sp < 25 && a?.peaks) {
          wg.fillStyle = '#ffd75e90';
          for (let x = 0; x < w; x += 1) {
            const tx = s0 + (x / w) * sp;
            const i0 = Math.floor(tx * 100); const i1 = Math.max(i0 + 1, Math.floor((s0 + ((x + 1) / w) * sp) * 100));
            let m = 0; for (let i = i0; i < i1 && i < a.peaks.length; i += 1) m = Math.max(m, a.peaks[i]);
            const hh = m * (H / 2 - 2);
            if (waveRGB) wg.fillStyle = rgbAt(a, tx);
            wg.fillRect(x, mid - hh, 1, hh * 2 || 1);
          }
        } else if (a && waveRGB) {
          // rekordbox-style: height = loudness, color = which band carries it
          const n = a.level.length;
          for (let x = 0; x < w; x += 1) {
            const tx = s0 + (x / w) * sp;
            const i = Math.min(n - 1, Math.max(0, Math.floor((tx / D()) * n)));
            const hh = Math.max(1, a.level[i] * (H / 2 - 2));
            wg.fillStyle = rgbAt(a, tx);
            wg.fillRect(x, mid - hh, 1, hh * 2);
          }
        } else if (a) {
          const n = a.bass.length;
          const idx = (x) => Math.min(n - 1, Math.max(0, Math.floor(((s0 + (x / w) * sp) / D()) * n)));
          const line = (arr, color, fill) => {
            wg.beginPath();
            for (let x = 0; x <= w; x += 1) { const y = top + H - arr[idx(x)] * (H - 4); if (x) wg.lineTo(x, y); else wg.moveTo(x, y); }
            if (fill) { wg.lineTo(w, top + H); wg.lineTo(0, top + H); wg.closePath(); wg.fillStyle = color; wg.fill(); } else { wg.strokeStyle = color; wg.lineWidth = 1; wg.stroke(); }
          };
          line(a.bass, '#ffd75e55', true);
          line(a.mid, '#48ddffaa', false);
          line(a.treble, '#bd8bffaa', false);
        }
        // section names last, over the waveform: a colored strip along the bottom and the name on a dark tab
        if (a && gridView.sections) {
          for (const sc of a.sections) {
            if (!sc.label) continue;
            const xa = X(sc.start); const xb = X(sc.end);
            if (xb < 0 || xa > w) continue;
            const col = SECTION_COLORS[sc.label.toLowerCase()] || '#ffd75e';
            wg.fillStyle = `${col}a0`; wg.fillRect(xa, top + H - 2, xb - xa, 2);
            const name = `${sc.label}${sc.conf < 0.45 ? ' ?' : ''}`; const nw = wg.measureText(name).width;
            if (xb - xa > nw + 12) { const nx = Math.max(2, xa + 2); wg.fillStyle = '#0d1013c0'; wg.fillRect(nx, top + H - 14, nw + 6, 12); wg.fillStyle = col; wg.fillText(name, nx + 3, top + H - 5); }
          }
        }
      }
      hooks.drawUnder?.(g, { X, s0, sp, w, h, top, H, LT });
      g.drawImage(waveCache.canvas, 0, 0, w, h);
      // beat grid (drawn into its own cached canvas, redrawn only when the view or the grid changes): downbeats red
      // with bar numbers like rekordbox, beats white, subdivisions faint; zoomed out, every 2nd / 4th / 8th… bar so
      // the lines never melt into a smear, numbered every few bars
      const bs = beats(); const bpb = bpbNow(); const bpm = bpmNow() || 120; const gr = G();
      const gkey = `${s0}|${sp}|${w}|${h}|${top}|${H}|${dpr}|${bs.length}|${bs[0]}|${bpm}|${gr?.anchor}|${bpb}|${dIdx()}|${gridView.lines}|${gridView.numbers}|${gridView.subs}|${gridView.dim}|${snapMode}`;
      if (gridCache.key !== gkey) {
        gridCache.key = gkey;
        const gc = gridCache.canvas;
        gc.width = Math.round(w * dpr); gc.height = Math.round(h * dpr);
        const gg = gc.getContext('2d');
        gg.setTransform(dpr, 0, 0, dpr, 0, 0);
        gg.clearRect(0, 0, w, h);
        gg.font = '10px Consolas, monospace';
        const pxPerBeat = (60 / bpm / sp) * w; const pxBar = pxPerBeat * bpb;
        const steps = [1, 2, 4, 8, 16, 32, 64, 128];
        const numStep = steps.find((k) => pxBar * k >= 34) || 256;
        const i0 = Math.max(0, beatIndex(bs, s0)); const i1 = Math.min(bs.length - 1, beatIndex(bs, s0 + sp) + 1);
        if (bs.length && gridView.lines) {
          gg.globalAlpha = gridView.dim ? 0.45 : 1;
          if (pxPerBeat > 4) {
            const div = gridView.subs ? DIV[snapMode] || 1 : 1;
            for (let i = i0; i <= i1; i += 1) {
              const n = bno(bs, i); const down = mod(n, bpb) === 0;
              const x = Math.round(X(bs[i]));
              gg.fillStyle = down ? '#ff6a6ad0' : '#ffffff55';
              gg.fillRect(x, top, down ? 2 : 1, H);
              if (down && gridView.numbers && mod(Math.floor(n / bpb), numStep) === 0) { gg.fillStyle = '#ff9a8a'; gg.fillText(String(Math.floor(n / bpb) + 1), x + 3, top + 10); }
              if (div > 1 && i < bs.length - 1 && (pxPerBeat / div) > 7) {
                gg.fillStyle = '#ffffff1c';
                for (let k = 1; k < div; k += 1) gg.fillRect(Math.round(X(bs[i] + ((bs[i + 1] - bs[i]) * k) / div)), top, 1, H);
              }
            }
          } else {
            // too dense for every beat: bars (or every 2nd, 4th… bar), phrases of 4 bars a little stronger
            const barStep = steps.find((k) => pxBar * k >= 6) || 256;
            for (let i = i0; i <= i1; i += 1) {
              const n = bno(bs, i); if (mod(n, bpb) !== 0) continue;
              const bar = Math.floor(n / bpb); if (mod(bar, barStep) !== 0) continue;
              const x = Math.round(X(bs[i])); const phrase = mod(bar, barStep * 4) === 0;
              gg.fillStyle = phrase ? '#ff6a6ab0' : '#ff6a6a55';
              gg.fillRect(x, top, 1, phrase ? H : H * 0.35);
              if (gridView.numbers && mod(bar, numStep) === 0) { gg.fillStyle = '#ff9a8ac0'; gg.fillText(String(bar + 1), x + 3, top + 10); }
            }
          }
          gg.globalAlpha = 1;
        }
      }
      g.drawImage(gridCache.canvas, 0, 0, w, h);
      if (a && gridView.drops) { g.fillStyle = '#ff6a6a'; for (const d of a.drops) { const x = X(d); g.beginPath(); g.moveTo(x - 4, top); g.lineTo(x + 4, top); g.lineTo(x, top + 7); g.fill(); } }
      // hit lanes
      shownLanes().forEach((ln, li) => {
        const y = LT + li * LANE_H;
        g.fillStyle = li % 2 ? '#ffffff06' : '#ffffff0c';
        g.fillRect(0, y, w, LANE_H);
        ghostHint[ln.id] = 0;
        const ghosts = !map.marks[ln.id].length ? found(ln.id) : [];
        if (ghosts.length) {
          // the hits the analysis found, as faint outlines (thin ticks when dense) until you keep them: click the
          // note at the left, ✦ Mark … in the K / S right-click menu, or /mark-kicks
          const dense = (ghosts.length / Math.max(1, D())) * (sp / w) > 0.2; // more than one per 5 px
          g.strokeStyle = `${ln.color}${dense ? '50' : '70'}`; g.lineWidth = 1; g.beginPath();
          let lastX = -9;
          for (const o of ghosts) {
            if (o.t < s0 || o.t > s0 + sp) continue;
            const x = Math.round(X(o.t)); if (x - lastX < 2) continue; lastX = x;
            if (dense) { g.moveTo(x + 0.5, y + 4); g.lineTo(x + 0.5, y + LANE_H - 4); } else g.rect(x - 1.5, y + 3.5, 3, LANE_H - 7);
          }
          g.stroke();
          const label = `${ln.name.toUpperCase()}  ✦ ${ghosts.length} found · keep them`;
          const nw = g.measureText(label).width + 10;
          g.fillStyle = '#0d1013e0'; g.fillRect(1, y + 1, nw, LANE_H - 2);
          g.fillStyle = ln.color; g.fillText(label, 4, y + 10);
          ghostHint[ln.id] = nw + 1;
        } else {
          g.fillStyle = `${ln.color}90`;
          g.fillText(ln.name.toUpperCase(), 4, y + 10);
        }
        for (const m of map.marks[ln.id]) {
          if (m < s0 || m > s0 + sp) continue;
          const x = X(m);
          const sel = selected?.type === 'mark' && selected.lane === ln.id && Math.abs(selected.t - m) < 1e-4;
          g.fillStyle = ln.color;
          g.fillRect(Math.round(x) - 2, y + 2, 4, LANE_H - 4);
          if (sel) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(Math.round(x) - 3.5, y + 1, 7, LANE_H - 2); }
          if (sp < 8 || gridView.markLines) { g.fillStyle = `${ln.color}${sp < 8 ? '40' : '30'}`; g.fillRect(Math.round(x), top, 1, H); }
        }
      });
      // layer tracks: a bar for when each layer is on screen
      trackRows(h).forEach(({ tr, y }, i) => {
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
      for (const row of trackRows(h)) for (const lr of row.lanes) drawLane(g, row.tr, lr, X, s0, sp, w);
      if (dragging?.kind === 'autoBox' && dragging.box) {
        const b = dragging.box;
        g.fillStyle = '#ffffff12'; g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        g.strokeStyle = '#ffffffa0'; g.lineWidth = 1; g.setLineDash([3, 3]); g.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0, b.y1 - b.y0); g.setLineDash([]);
      }
      // loop region
      if (region) {
        const xa = X(region.a); const xb = X(region.b);
        if (st.loop) { g.fillStyle = '#05070966'; if (xa > 0) g.fillRect(0, RULER, xa, LT - RULER); if (xb < w) g.fillRect(xb, RULER, w - xb, LT - RULER); }
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
      // the song's trim: outside it is dimmed, cyan brackets at in / out
      if (map.trim) {
        const xa = X(map.trim.a); const xb = X(map.trim.b);
        g.fillStyle = '#000000a8';
        if (xa > 0) g.fillRect(0, 0, Math.min(w, xa), h);
        if (xb < w) g.fillRect(Math.max(0, xb), 0, w - Math.max(0, xb), h);
        g.fillStyle = '#48ddff';
        for (const [x, d] of [[xa, 1], [xb, -1]]) if (x >= -2 && x <= w + 2) { g.fillRect(Math.round(x) - (d < 0 ? 2 : 0), 0, 2, h); g.fillRect(Math.round(x) - (d < 0 ? 8 : 0), 0, 8, 2); g.fillRect(Math.round(x) - (d < 0 ? 8 : 0), h - 2, 8, 2); }
      }
      hooks.drawOver?.(g, { X, s0, sp, w, h, top, H, LT, ruler: RULER });
      // notes on moments: green pins on the ruler (grey once done)
      for (const n of notes) {
        if (n.t < s0 || n.t > s0 + sp) continue;
        const x = Math.round(X(n.t));
        g.fillStyle = n.done ? '#8f877d' : '#7cd992';
        g.fillRect(x, 0, 2, RULER);
        g.beginPath(); g.moveTo(x + 2, 1); g.lineTo(x + 10, 4.5); g.lineTo(x + 2, 8); g.fill();
        g.fillStyle = n.done ? '#8f877d30' : '#7cd99240';
        g.fillRect(x, RULER, 1, LT - RULER);
      }
      // hot cues: a numbered flag on the ruler and a faint line down the song
      map.cues.forEach((c, i) => {
        if (c.t < s0 - sp * 0.2 || c.t > s0 + sp) return;
        const x = Math.round(X(c.t)); const col = cueColor(c, i);
        const label = `${i < 9 ? `${i + 1} ` : ''}${c.name}${c.looks?.length ? ' ✦' : ''}`;
        const lw = g.measureText(label).width + 8;
        g.fillStyle = `${col}30`; g.fillRect(x, RULER, 1, LT - RULER);
        g.fillStyle = col; g.fillRect(x, 0, 2, RULER);
        g.fillRect(x + 2, 1, lw, RULER - 3);
        g.fillStyle = '#0b0e10'; g.fillText(label, x + 6, 11);
      });
      if (ov) { g.restore(); return; }
      placePlayheads();
      g.restore();
      drawGutter(g, w, W, h, t);
    }
    // The header column right of the timeline: Ableton's track headers. Each layer gets its ▾ chooser,
    // each lane its name, the value at the playhead, its range and a ✕.
    function drawGutter(g, w, W, h, t) {
      g.fillStyle = '#0d1013';
      g.fillRect(w, 0, W - w, h);
      g.fillStyle = '#ffffff1c';
      g.fillRect(w, 0, 1, h);
      g.font = '10px Consolas, monospace';
      const LT = laneTop(h);
      g.fillStyle = '#8f877d';
      if (D()) g.fillText(tracks.length ? 'A: all curves' : '', w + 8, LT - 6);
      const fmtV = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
      for (const row of trackRows(h)) {
        const { tr, y } = row;
        const shown = row.lanes.length;
        g.fillStyle = shown ? '#ffd75e26' : tr.selected ? '#ffffff14' : '#ffffff0a';
        g.fillRect(w + 3, y + 1, W - w - 6, TRACK_H - 2);
        g.fillStyle = tr.color || '#7ad0ff';
        g.fillRect(w + 3, y + 1, 3, TRACK_H - 2);
        g.fillStyle = shown ? '#ffd75e' : '#cfc6bb';
        const label = `▾ ${shown ? `${shown} curve${shown === 1 ? '' : 's'}` : 'Automation'}${tr.animated ? ` · ${tr.animated}●` : ''}`;
        g.fillText(label.length > 13 ? `${label.slice(0, 12)}…` : label, w + 10, y + 11);
        // M (mute = hide the layer) and S (solo: only this layer, until you click again)
        for (const [i, txt, on, col] of [[0, 'M', tr.visible === false, '#ff8a6a'], [1, 'S', tr.solo, '#ffd75e']]) {
          const bx = W - 38 + i * 17;
          g.fillStyle = on ? col : '#ffffff14';
          g.fillRect(bx, y + 2, 15, TRACK_H - 4);
          g.fillStyle = on ? '#0b0e10' : '#cfc6bb';
          g.fillText(txt, bx + 4, y + 11);
        }
        for (const { ln, top, h: lh } of row.lanes) {
          const col = tr.color || '#ffd75e';
          const isActive = activeLane && activeLane.id === tr.id && activeLane.prop === ln.prop;
          g.fillStyle = isActive ? '#ffffff0e' : '#ffffff05';
          g.fillRect(w + 1, top, W - w - 1, lh);
          g.fillStyle = '#ffffff12';
          g.fillRect(w + 1, top + lh - 1, W - w - 1, 1);
          g.fillStyle = col;
          g.fillRect(w + 3, top + 3, 2, lh - 6);
          g.fillStyle = isActive ? '#ffffff' : '#eae0d5';
          const name = ln.label.length > 13 ? `${ln.label.slice(0, 12)}…` : ln.label;
          g.fillText(`${name} ▾`, w + 9, top + 12);
          g.fillStyle = '#cfc6bb';
          g.fillText('✕', W - 14, top + 12);
          // value at the playhead
          const v = ThreeLayers.evalKeys(ln.keys || [], t, ln.base);
          if (typeof v === 'number') { g.fillStyle = col; g.font = '12px Consolas, monospace'; g.fillText(String(fmtV(v)), w + 9, top + 27); g.font = '10px Consolas, monospace'; }
          g.fillStyle = '#8f877d';
          g.textAlign = 'right';
          if (lh >= AUTO_H) { g.fillText(`${fmtV(ln.max)} ↑`, W - 5, top + 27); g.fillText(`${fmtV(ln.min)} ↓`, W - 5, top + lh - 5); }
          g.textAlign = 'left';
          if (lh > AUTO_H) { g.fillStyle = '#8f877d'; g.fillText(`${(ln.keys || []).length} points`, w + 9, top + lh - 5); }
        }
      }
    }
    // Waveform color at a time from the band envelopes (bass → red, mids → green, highs → blue).
    function rgbAt(a, t) {
      const n = a.bass.length; const i = Math.min(n - 1, Math.max(0, Math.floor((t / D()) * n)));
      const b = a.bass[i]; const m = a.mid[i]; const h = a.treble[i]; const sum = b + m + h || 1;
      const k = 0.55 + 0.45 * Math.min(1, a.level[i] * 1.6);
      return `rgb(${Math.round((70 + 185 * (b / sum) * 1.4) * k)},${Math.round((60 + 195 * (m / sum) * 1.3) * k)},${Math.round((90 + 165 * (h / sum) * 1.6) * k)})`;
    }
    // FL Studio-style automation: the curve, its points, and a tension handle in the middle of each segment.
    const roundV = (L, v) => { const c = Math.max(L.min, Math.min(L.max, v)); return L.step ? Math.round(Math.round(c / L.step) * L.step * 1e6) / 1e6 : Math.round(c * 1000) / 1000; };
    const laneV = (L, top, lh, y) => roundV(L, L.min + (1 - (y - top - 5) / (lh - 10)) * (L.max - L.min));
    const laneY = (L, top, lh, v) => top + 5 + (1 - (v - L.min) / ((L.max - L.min) || 1)) * (lh - 10);
    const isSel = (tr, ln, i) => autoSel && autoSel.id === tr.id && autoSel.prop === ln.prop && autoSel.idx.has(i);
    function drawLane(g, tr, { ln: L, top, h: lh }, X, s0, sp, w) {
      const keys = L.keys || [];
      const col = tr.color || '#ffd75e';
      const Y = (v) => laneY(L, top, lh, v);
      g.fillStyle = '#05070dcc';
      g.fillRect(0, top, w, lh);
      g.fillStyle = '#ffffff0d';
      g.fillRect(0, Y((L.min + L.max) / 2), w, 1);
      g.fillStyle = '#ffffff16';
      g.fillRect(0, top + lh - 1, w, 1);
      // the curve (and a soft fill under it)
      const ev = (t) => ThreeLayers.evalKeys(keys, t, L.base);
      g.beginPath();
      for (let x = 0; x <= w; x += 2) { const yy = Y(ev(s0 + (x / w) * sp)); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
      g.strokeStyle = keys.length ? col : `${col}60`;
      g.lineWidth = 1.6;
      g.stroke();
      g.lineTo(w, top + lh); g.lineTo(0, top + lh); g.closePath();
      g.fillStyle = `${col}18`;
      g.fill();
      keys.forEach((k, i) => {
        const nx = keys[i + 1];
        if (nx && k.ease !== 'hold' && X(nx.t) - X(k.t) > 18) {
          const tm = (k.t + nx.t) / 2;
          const hx = X(tm);
          if (hx > 0 && hx < w) { g.strokeStyle = '#ffffffb0'; g.lineWidth = 1; g.beginPath(); g.arc(hx, Y(ev(tm)), 3, 0, Math.PI * 2); g.stroke(); }
        }
        const kx = X(k.t);
        if (kx < -6 || kx > w + 6) return;
        const on = isSel(tr, L, i);
        g.fillStyle = on ? '#ffffff' : '#0b0e10';
        g.beginPath(); g.arc(kx, Y(k.v), on ? 4.8 : 4.2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = on ? col : k.ease === 'hold' ? '#ffffff' : col; g.lineWidth = 2; g.stroke();
      });
      // the value next to the point being dragged
      const d = dragging;
      if (d && (d.kind === 'autoPoint' || d.kind === 'autoGroup') && d.id === tr.id && d.L.prop === L.prop && d.moved) {
        const k = d.keys[d.kind === 'autoPoint' ? d.i : d.lead];
        if (k) {
          const txt = `${fmtMs(k.t)} · ${Math.abs(k.v) >= 10 ? Math.round(k.v * 10) / 10 : Math.round(k.v * 1000) / 1000}`;
          const tx = Math.min(w - g.measureText(txt).width - 6, X(k.t) + 8); const ty = Math.max(top + 11, Math.min(top + lh - 4, Y(k.v) - 6));
          g.fillStyle = '#000000b0'; g.fillRect(tx - 3, ty - 10, g.measureText(txt).width + 6, 13);
          g.fillStyle = '#ffffff'; g.fillText(txt, tx, ty);
        }
      }
      if (!keys.length) { g.fillStyle = '#eae0d570'; g.fillText(`${L.label}: click to add a point · Ctrl+drag to draw`, 6, top + 12); }
    }
    // The overview: its picture (sections, loudness, layers, loop, drops, notes, cues) is drawn once into a cache and
    // only redrawn when one of those changes; each draw just copies it and adds the zoomed view's box, and nothing
    // is drawn at all while the box hasn't moved by a pixel (a song playing doesn't change the overview).
    const miniCache = { key: '', canvas: document.createElement('canvas') };
    function drawMinimap(t) {
      minimap.hidden = !D();
      const w = mW(); const h = mH();
      if (!D() || !w || !h) return;
      const dpr = devicePixelRatio || 1;
      const X = (tt) => (tt / D()) * w;
      const sk = [w, h, dpr, D(), anaVer, st.path, region ? `${region.a}|${region.b}|${locked}` : '', map.trim ? `${map.trim.a}|${map.trim.b}` : '', tracks.map((tr) => `${tr.in}|${tr.out}|${tr.visible}|${tr.color}`).join(),
        map.cues.map((c) => `${c.t}${c.name}`).join(), notes.map((n) => `${n.t}${n.done}`).join(), hooks.miniKey?.() || ''].join('~');
      const box = view ? `${Math.round(X(view.start) * 2)}|${Math.round(X(view.end) * 2)}|${locked}` : '';
      if (`${sk}#${box}` === lastMiniKey) return;
      lastMiniKey = `${sk}#${box}`;
      if (miniCache.key !== sk) {
        miniCache.key = sk;
        const mc = miniCache.canvas; mc.width = Math.round(w * dpr); mc.height = Math.round(h * dpr);
        const g = mc.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        const a = st.analysis;
        if (a) {
          for (const sct of a.sections) {
            if (sct.label) { g.fillStyle = `${SECTION_COLORS[sct.label.toLowerCase()] || '#ffd75e'}20`; g.fillRect(X(sct.start), 0, X(sct.end) - X(sct.start), h); }
            else if (sct.energy === 'loud') { g.fillStyle = '#ffd75e14'; g.fillRect(X(sct.start), 0, X(sct.end) - X(sct.start), h); }
          }
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
        if (map.trim) { g.fillStyle = '#000000a0'; g.fillRect(0, 0, X(map.trim.a), h); g.fillRect(X(map.trim.b), 0, w - X(map.trim.b), h); }
        if (a) { g.fillStyle = '#ff6a6a'; for (const d of a.drops) g.fillRect(X(d) - 1, 0, 2, 4); }
        for (const n of notes) { g.fillStyle = n.done ? '#8f877d' : '#7cd992'; g.fillRect(X(n.t) - 1, h - 5, 3, 5); }
        map.cues.forEach((c, i) => { g.fillStyle = cueColor(c, i); g.fillRect(X(c.t) - 1, 0, 3, 6); });
        hooks.drawMini?.(g, { X, w, h });
      }
      if (minimap.width !== Math.round(w * dpr) || minimap.height !== Math.round(h * dpr)) { minimap.width = Math.round(w * dpr); minimap.height = Math.round(h * dpr); }
      const g = minimap.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, minimap.width, minimap.height);
      g.drawImage(miniCache.canvas, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    function tw() { return Math.max(40, cW() - GUT); }
    const timeAt = (e) => { const r = canvas.getBoundingClientRect(); return v0() + ((e.clientX - r.left) / tw()) * span(); };
    const pxToT = (px) => (px / tw()) * span();
    const xOf = (tt) => ((tt - v0()) / span()) * tw();
    function hitTest(e) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left; const y = e.clientY - r.top;
      const w = tw();
      const LT = laneTop(r.height);
      const row = trackRows(r.height).find((rw) => y >= rw.y && y < rw.end);
      const lr = row?.lanes.find((l) => y >= l.top && y < l.top + l.h);
      if (x >= w) {
        // the header column
        if (lr) return { zone: x >= r.width - 20 && y < lr.top + 16 ? 'laneClose' : 'laneHead', track: row.tr, lane: lr.ln, lr };
        if (row && x >= r.width - 38) return { zone: x >= r.width - 21 ? 'solo' : 'mute', track: row.tr };
        if (row) return { zone: 'chip', track: row.tr };
        return { zone: 'gutter' };
      }
      if (lr) {
        // automation lane: a point, a curve handle, or empty space
        const L = lr.ln; const keys = L.keys || [];
        const Y = (v) => laneY(L, lr.top, lr.h, v);
        const tt = v0() + (x / w) * span();
        const point = keys.findIndex((k) => Math.hypot(xOf(k.t) - x, Y(k.v) - y) <= 7);
        let handle = -1;
        if (point < 0) handle = keys.findIndex((k, i) => { const nx = keys[i + 1]; if (!nx || k.ease === 'hold') return false; const tm = (k.t + nx.t) / 2; return Math.hypot(xOf(tm) - x, Y(ThreeLayers.evalKeys(keys, tm, L.base)) - y) <= 6; });
        return { zone: 'auto', track: row.tr, lane: L, lr, point, handle, t: tt, value: laneV(L, lr.top, lr.h, y) };
      }
      if (row) {
        const tr = row.tr;
        const key = (tr.keys || []).find((k) => Math.abs(xOf(k.t) - x) <= 5);
        if (key) return { zone: 'track', track: tr, key };
        const a0 = tr.in ?? 0; const b0 = tr.out ?? D();
        const edge = Math.abs(xOf(a0) - x) <= 6 ? 'in' : Math.abs(xOf(b0) - x) <= 6 ? 'out' : null;
        const tt = v0() + (x / w) * span();
        return { zone: 'track', track: tr, edge, inside: tt >= a0 && tt <= b0 };
      }
      if (y < RULER) {
        const g0 = canvas.getContext('2d'); g0.font = '10px Consolas, monospace';
        const cue = [...map.cues].reverse().find((c, ri) => { const i = map.cues.length - 1 - ri; const lw = g0.measureText(`${i < 9 ? `${i + 1} ` : ''}${c.name}${c.looks?.length ? ' ✦' : ''}`).width + 10; return x - xOf(c.t) >= -2 && x - xOf(c.t) <= lw; });
        if (cue) return { zone: 'cue', cue };
        const note = notes.find((n) => x - xOf(n.t) >= -3 && x - xOf(n.t) <= 10);
        if (note) return { zone: 'note', note };
        const edge = region && ['a', 'b'].find((k) => Math.abs(xOf(region[k]) - x) <= 6);
        return { zone: 'ruler', edge };
      }
      if (y >= LT) {
        const vis = shownLanes();
        const lane = vis[Math.min(vis.length - 1, Math.floor((y - LT) / LANE_H))].id;
        if (ghostHint[lane] && x < ghostHint[lane] && !map.marks[lane].length) return { zone: 'ghost', lane };
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
      if (typeof Usage !== 'undefined') Usage.track(`Timeline › canvas: ${hit.zone}${e.ctrlKey ? ' (draw)' : e.shiftKey ? ' (select)' : ''}`, { area: 'Timeline' });
      canvas.setPointerCapture(e.pointerId);
      // footage: a cut line under the pointer drags (tools/three-frames.js decides; it commits once on release)
      const hd = (hit.zone === 'wave' || hit.zone === 'ruler') && !e.shiftKey && !e.altKey && !e.ctrlKey && !locked ? hooks.pointerDown?.(e, tt, { xOf }) : null;
      if (hd) {
        dragging = { kind: 'hook' };
        const mv = (ev) => { hd.move(Math.max(0, Math.min(D(), timeAt(ev)))); draw(); };
        canvas.addEventListener('pointermove', mv);
        canvas.addEventListener('pointerup', () => { canvas.removeEventListener('pointermove', mv); dragging = null; hd.up(); paint(); }, { once: true });
        return;
      }
      if (hit.zone === 'ruler' && !locked) {
        if (hit.edge) { dragging = { kind: 'edge', edge: hit.edge }; selected = { type: 'edge', edge: hit.edge }; }
        else if (region && tt > region.a && tt < region.b) dragging = { kind: 'move', from: tt, orig: { ...region } };
        else dragging = { kind: 'new', from: snapT(tt) };
      } else if (hit.zone === 'ghost') {
        const n = markFound(hit.lane)?.[hit.lane] || 0;
        toast(`${n} ${hit.lane}${n === 1 ? '' : 's'} marked from the song (↶ undoes · drag, nudge or delete any of them)`, { timeout: 2600 });
        dragging = { kind: 'none' };
      } else if (hit.zone === 'lane') {
        if (hit.mark != null) { selected = { type: 'mark', lane: hit.lane, t: hit.mark }; dragging = { kind: 'mark', from: tt, orig: hit.mark, before: JSON.stringify(map) }; }
        else { addMarkAt(hit.lane, tt); dragging = { kind: 'mark', from: tt, orig: selected.t, added: true }; }
      } else if (hit.zone === 'chip') {
        trackHandlers.onSelect?.(hit.track.id);
        trackHandlers.onLanePick?.(hit.track.id, e.clientX, e.clientY);
        dragging = { kind: 'none' };
      } else if (hit.zone === 'laneHead' || hit.zone === 'laneClose') {
        activeLane = { id: hit.track.id, prop: hit.lane.prop };
        if (hit.zone === 'laneClose') trackHandlers.onLaneHide?.(hit.track.id, hit.lane.prop);
        else if (e.clientY - canvas.getBoundingClientRect().top < hit.lr.top + 16) trackHandlers.onLanePick?.(hit.track.id, e.clientX, e.clientY, { prop: hit.lane.prop });
        dragging = { kind: 'none' };
      } else if (hit.zone === 'gutter') {
        dragging = { kind: 'none' };
      } else if (hit.zone === 'mute' || hit.zone === 'solo') {
        (hit.zone === 'mute' ? trackHandlers.onMute : trackHandlers.onSolo)?.(hit.track.id);
        dragging = { kind: 'none' };
      } else if (hit.zone === 'cue') {
        // click: jump · drag: move it
        seek(hit.cue.t);
        dragging = { kind: 'cue', cue: hit.cue, from: tt, orig: hit.cue.t, before: JSON.stringify(map), moved: false };
      } else if (hit.zone === 'note') {
        seek(hit.note.t);
        noteHandlers.onOpen?.(hit.note.id, e.clientX, e.clientY);
        dragging = { kind: 'none' };
      } else if (hit.zone === 'auto') {
        const tr = hit.track; const L = hit.lane; const { lr } = hit;
        trackHandlers.onSelect?.(tr.id);
        activeLane = { id: tr.id, prop: L.prop };
        const keys = (L.keys || []).map((k) => ({ ...k }));
        const before = keys.map((k) => ({ ...k }));
        const base = { id: tr.id, L, top: lr.top, lh: lr.h, keys, before, moved: false };
        const sameLane = autoSel && autoSel.id === tr.id && autoSel.prop === L.prop;
        const rr = canvas.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) {
          // pencil: draw points along the grid as you drag
          dragging = { ...base, kind: 'autoDraw', drawn: new Map() };
          autoSel = null;
          drawAt(dragging, e);
        } else if (e.shiftKey && hit.point >= 0) {
          // Shift+click a point: add it to / remove it from the selection
          const idx = sameLane ? new Set(autoSel.idx) : new Set();
          if (idx.has(hit.point)) idx.delete(hit.point); else idx.add(hit.point);
          autoSel = { id: tr.id, prop: L.prop, idx };
          dragging = { kind: 'none' };
        } else if (e.shiftKey) {
          dragging = { ...base, kind: 'autoBox', x0: e.clientX - rr.left, y0: e.clientY - rr.top, box: null, add: sameLane ? new Set(autoSel.idx) : new Set() };
        } else if (hit.point >= 0 && sameLane && autoSel.idx.has(hit.point) && (autoSel.idx.size > 1 || e.altKey)) {
          // drag the whole selection (Alt: stretch its values apart / together)
          dragging = { ...base, kind: 'autoGroup', idx0: new Set(autoSel.idx), lead0: hit.point, lead: hit.point, t0: tt, y0: e.clientY, alt: e.altKey };
        } else if (hit.point >= 0) {
          autoSel = { id: tr.id, prop: L.prop, idx: new Set([hit.point]) };
          dragging = { ...base, kind: 'autoPoint', i: hit.point };
        } else if (hit.handle >= 0) dragging = { ...base, kind: 'autoCurve', i: hit.handle, y0: e.clientY, c0: keys[hit.handle].ease === 'curve' ? keys[hit.handle].c || 0 : 0 };
        else {
          const k = { t: r4(Math.max(0, Math.min(D(), snapT(tt)))), v: hit.value, ease: 'ease' };
          const clash = keys.findIndex((x) => Math.abs(x.t - k.t) < 1e-3);
          if (clash >= 0) keys.splice(clash, 1);
          keys.push(k);
          keys.sort((p, q) => p.t - q.t);
          dragging = { ...base, kind: 'autoPoint', keys, i: keys.indexOf(k), moved: true };
          autoSel = { id: tr.id, prop: L.prop, idx: new Set([dragging.i]) };
          lastLaneAdd = performance.now();
          laneEmit(dragging, false);
        }
      } else if (hit.zone === 'track') {
        const { id } = hit.track;
        const a0 = hit.track.in ?? 0; const b0 = hit.track.out ?? D();
        trackHandlers.onSelect?.(id);
        if (hit.key) dragging = { kind: 'key', id, from: hit.key.t, now: hit.key.t, grab: tt, moved: false };
        else if (hit.edge) dragging = { kind: 'trim', id, edge: hit.edge, a: a0, b: b0 };
        else if (hit.inside) dragging = { kind: 'clip', id, from: tt, a: a0, b: b0 };
        else dragging = { kind: 'none' };
      } else if ((e.shiftKey || e.altKey) && !locked) {
        // Shift+drag (or Alt+drag) the waveform: draw a loop over that part
        dragging = { kind: 'new', from: snapT(tt) }; selected = null; autoSel = null;
      } else { dragging = { kind: 'seek' }; selected = null; autoSel = null; seek(tt); }
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
        } else if (dragging.kind === 'autoPoint') {
          const rr = canvas.getBoundingClientRect();
          const d = dragging; const k = d.keys[d.i];
          const lo = d.i > 0 ? d.keys[d.i - 1].t + 0.001 : 0; const hi = d.i < d.keys.length - 1 ? d.keys[d.i + 1].t - 0.001 : D();
          d.keys[d.i] = { ...k, t: r4(Math.max(lo, Math.min(hi, snapT(t2)))), v: laneV(d.L, d.top, d.lh, ev.clientY - rr.top) };
          d.moved = true;
          laneEmit(d, false);
        } else if (dragging.kind === 'autoGroup') {
          const d = dragging;
          const lead = d.before[d.lead0];
          const dt = d.alt ? 0 : snapT(lead.t + (t2 - d.t0)) - lead.t;
          const dv = d.alt ? 0 : ((d.y0 - ev.clientY) / (d.lh - 10)) * (d.L.max - d.L.min);
          const amp = d.alt ? Math.max(0, 1 + (d.y0 - ev.clientY) / 40) : 1;
          const r = moveGroup(d.L, d.before, d.idx0, d.lead0, dt, dv, amp);
          d.keys = r.keys; d.lead = r.lead; d.moved = true;
          autoSel = { id: d.id, prop: d.L.prop, idx: r.idx };
          laneEmit(d, false);
        } else if (dragging.kind === 'autoBox') {
          const rr = canvas.getBoundingClientRect();
          const d = dragging;
          const x1 = Math.max(0, Math.min(tw(), ev.clientX - rr.left)); const y1 = Math.max(d.top, Math.min(d.top + d.lh, ev.clientY - rr.top));
          d.box = { x0: Math.min(d.x0, x1), x1: Math.max(d.x0, x1), y0: Math.min(d.y0, y1), y1: Math.max(d.y0, y1) };
          const idx = new Set(d.add);
          d.keys.forEach((k, i) => { const kx = xOf(k.t); const ky = laneY(d.L, d.top, d.lh, k.v); if (kx >= d.box.x0 && kx <= d.box.x1 && ky >= d.box.y0 - 4 && ky <= d.box.y1 + 4) idx.add(i); });
          autoSel = { id: d.id, prop: d.L.prop, idx };
          draw();
        } else if (dragging.kind === 'cue') {
          const d = dragging; const to = r4(Math.max(0, Math.min(D(), snapT(d.orig + (t2 - d.from)))));
          if (Math.abs(to - d.cue.t) > 1e-4) { d.cue.t = to; d.moved = true; map.cues.sort((a, b) => a.t - b.t); draw(); }
        } else if (dragging.kind === 'autoDraw') {
          drawAt(dragging, ev);
        } else if (dragging.kind === 'autoCurve') {
          const d = dragging; const a = d.keys[d.i]; const b = d.keys[d.i + 1];
          const dy = (d.y0 - ev.clientY) / (d.lh / 2);
          const c = Math.max(-1, Math.min(1, d.c0 + (b.v >= a.v ? -dy : dy)));
          d.keys[d.i] = { ...a, ease: 'curve', c: Math.round(c * 100) / 100 };
          d.moved = true;
          laneEmit(d, false);
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
        if (['autoPoint', 'autoCurve', 'autoGroup', 'autoDraw'].includes(dragging?.kind)) { if (dragging.moved) laneEmit(dragging, true); else if (dragging.kind === 'autoPoint') seek(dragging.keys[dragging.i].t); }
        if (dragging?.kind === 'autoBox' && !dragging.box) autoSel = null;
        if (dragging?.kind === 'cue' && dragging.moved) { mapUndo.push(dragging.before); if (mapUndo.length > 80) mapUndo.shift(); mapChanged(); }
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
    // ---------- curve editing helpers ----------
    function laneOf(id, prop) { return lanesOf(tracks.find((x) => x.id === id) || {}).find((l) => l.prop === prop) || null; }
    function setLaneKeys(id, prop, keys) { const ln = laneOf(id, prop); if (ln) ln.keys = keys; }
    // Sends a lane's edited points to the Lab (live while dragging, final on release). A final edit with
    // `before` becomes one undo step (Ctrl+Z) when something changed.
    function laneEmit(d, final) {
      setLaneKeys(d.id, d.L.prop, d.keys);
      if (final && d.before && JSON.stringify(d.before) !== JSON.stringify(d.keys)) { mapUndo.push({ lane: { id: d.id, prop: d.L.prop, keys: d.before } }); if (mapUndo.length > 80) mapUndo.shift(); undoBtn.disabled = false; }
      trackHandlers.onLaneEdit?.(d.id, d.L.prop, d.keys.map((k) => ({ ...k })), { final });
      draw();
    }
    const copyKeys = (keys) => (keys || []).map((k) => ({ ...k }));
    function laneCommit(id, L, keys) { laneEmit({ id, L, keys, before: copyKeys(laneOf(id, L.prop)?.keys || L.keys) }, true); }
    // Moves the points in idx by dt / dv (or stretches their values around their middle by amp); moved points
    // replace the ones they land on. Returns the new keys, the new selection and where the grabbed point went.
    function moveGroup(L, base, idx, leadIdx, dt, dv, amp = 1) {
      const sel = base.filter((_, i) => idx.has(i));
      const lo = Math.min(...sel.map((k) => k.t)); const hi = Math.max(...sel.map((k) => k.t));
      const d = Math.max(-lo, Math.min(D() - hi, dt));
      const vs = sel.map((k) => k.v); const mid = (Math.min(...vs) + Math.max(...vs)) / 2;
      const tagged = base.map((k, i) => (idx.has(i) ? { k: { ...k, t: r4(k.t + d), v: roundV(L, mid + (k.v - mid) * amp + dv) }, s: true, l: i === leadIdx } : { k, s: false, l: false }));
      const out = tagged.filter((x) => x.s || !tagged.some((y) => y.s && Math.abs(y.k.t - x.k.t) < 1e-3));
      out.sort((a, b) => a.k.t - b.k.t);
      return { keys: out.map((x) => x.k), idx: new Set(out.flatMap((x, i) => (x.s ? [i] : []))), lead: out.findIndex((x) => x.l) };
    }
    // Ctrl+drag: a point on every grid step you pass (every few pixels with snapping off), replacing what was there.
    function drawAt(d, ev) {
      const rr = canvas.getBoundingClientRect();
      const t = Math.max(0, Math.min(D(), timeAt(ev)));
      const fine = pxToT(6);
      const tt = r4(snapMode === 'off' ? Math.round(t / fine) * fine : snapT(t));
      d.drawn.set(tt, laneV(d.L, d.top, d.lh, ev.clientY - rr.top));
      const ts = [...d.drawn.keys()]; const lo = Math.min(...ts) - 1e-4; const hi = Math.max(...ts) + 1e-4;
      d.keys = [...d.before.filter((k) => k.t < lo || k.t > hi), ...[...d.drawn].map(([t1, v]) => ({ t: t1, v, ease: 'linear' }))].sort((a, b) => a.t - b.t);
      d.moved = true;
      laneEmit(d, false);
    }
    const selPicked = () => {
      const ln = autoSel && laneOf(autoSel.id, autoSel.prop);
      return ln ? { ln, keys: ln.keys || [], picked: (ln.keys || []).filter((_, i) => autoSel.idx.has(i)) } : null;
    };
    // Puts points (absolute times) into a lane, replacing the lane's points inside their time span, and selects them.
    function insertPoints(id, prop, pts) {
      const ln = laneOf(id, prop);
      if (!ln || !pts.length) return;
      const clean = pts.filter((k) => k.t >= 0 && k.t <= D() + 1e-4).sort((a, b) => a.t - b.t).filter((k, i, arr) => i === 0 || Math.abs(k.t - arr[i - 1].t) >= 1e-3);
      if (!clean.length) return;
      const before = copyKeys(ln.keys);
      const lo = clean[0].t - 1e-4; const hi = clean[clean.length - 1].t + 1e-4;
      const tagged = [...before.filter((k) => k.t < lo || k.t > hi).map((k) => ({ k, s: false })), ...clean.map((k) => ({ k, s: true }))].sort((a, b) => a.k.t - b.k.t);
      autoSel = { id, prop, idx: new Set(tagged.flatMap((x, i) => (x.s ? [i] : []))) };
      activeLane = { id, prop };
      laneEmit({ id, L: ln, keys: tagged.map((x) => x.k), before }, true);
    }
    function copyPoints() {
      const s = selPicked();
      if (!s?.picked.length) return;
      const t0 = s.picked[0].t;
      autoClip = { prop: s.ln.prop, min: s.ln.min, max: s.ln.max, keys: s.picked.map((k) => ({ ...k, t: k.t - t0 })) };
      toast(`Copied ${s.picked.length} point${s.picked.length === 1 ? '' : 's'} · Ctrl+V pastes them at the playhead in the lane you last clicked`, { timeout: 2200 });
    }
    function pastePoints() {
      const ln = laneOf(activeLane.id, activeLane.prop);
      if (!ln || !autoClip) return;
      const at = snapT(now());
      // into another setting: keep the shape, rescaled to that setting's range
      const fit = (v) => (autoClip.prop === ln.prop ? v : ln.min + ((v - autoClip.min) / ((autoClip.max - autoClip.min) || 1)) * (ln.max - ln.min));
      insertPoints(activeLane.id, activeLane.prop, autoClip.keys.map((k) => ({ ...k, t: r4(at + k.t), v: roundV(ln, fit(k.v)) })));
    }
    // Ctrl+D: repeats the selected points right after themselves, rounded to beats / bars so patterns line up.
    function duplicatePoints() {
      const s = selPicked();
      if (!s?.picked.length) return;
      const len = s.picked[s.picked.length - 1].t - s.picked[0].t;
      const beat = 60 / (bpmNow() || 120); const bar = beat * bpbNow();
      const units = [beat / 4, beat / 2, beat, bar, bar * 2, bar * 4, bar * 8, bar * 16, bar * 32];
      const off = units.find((u) => u >= len - 1e-3 && u > 1e-3) || len + beat;
      insertPoints(autoSel.id, autoSel.prop, s.picked.map((k) => ({ ...k, t: r4(k.t + off) })));
    }
    function selectAllPoints() {
      const ln = laneOf(activeLane.id, activeLane.prop);
      if (!ln) return;
      autoSel = { id: activeLane.id, prop: activeLane.prop, idx: new Set((ln.keys || []).map((_, i) => i)) };
      draw();
    }
    function deletePoints() {
      const s = selPicked();
      if (!s) return;
      const { id } = autoSel; const keep = s.keys.filter((_, i) => !autoSel.idx.has(i));
      autoSel = null;
      laneCommit(id, s.ln, keep);
    }
    function nudgePoints(dt, dv, repeat) {
      const s = selPicked();
      if (!s) return;
      const before = copyKeys(s.keys);
      const r = moveGroup(s.ln, before, autoSel.idx, -1, dt, dv);
      autoSel = { ...autoSel, idx: r.idx };
      const first = !(repeat && nudgeKey.pushed);
      nudgeKey.pushed = true;
      laneEmit({ id: autoSel.id, L: s.ln, keys: r.keys, before: first ? before : null }, true);
    }
    // Shapes for a range (the loop, else the zoomed view, else the layer's time), between a rest and a peak value:
    // the levels of the points already there, or a swing up from the current value.
    const SHAPES = [
      ['beats', 'Pulse on every beat', 'Jumps up on each beat and falls back'],
      ['kicks', 'Pulse on kicks', 'On your kick markers'],
      ['snares', 'Pulse on snares', 'On your snare markers'],
      ['hits', 'Pulse on hits', 'On your hit markers'],
      ['rampUp', 'Ramp up', 'Rest → peak across the range'],
      ['rampDown', 'Ramp down', 'Peak → rest across the range'],
      ['sine', 'Wave, one per bar', 'Smooth up and down'],
      ['square', 'Square, half a bar each', 'Peak / rest, switching on the half bar'],
      ['random', 'Random steps on beats', 'A new level every beat'],
      ['followLevel', 'Follow the loudness', 'The curve rides the song\'s overall level'],
      ['followBass', 'Follow the bass', 'Rides the low end (kicks, bass)'],
      ['followMid', 'Follow the mids', 'Rides vocals, synths, snares'],
      ['followHigh', 'Follow the highs', 'Rides hats and cymbals'],
    ];
    // Automation from the music: the band's envelope over the range (peaks per step), scaled to rest…peak,
    // then thinned out where a straight line already fits.
    function followPoints(arr, a, b, rest, peak) {
      const an = st.analysis; if (!an || !arr?.length) return [];
      const n = arr.length; const fps = n / D();
      const beat = 60 / (bpmNow() || 120);
      let step = beat / 4;
      if ((b - a) / step > 1500) step = (b - a) / 1500;
      const raw = [];
      for (let t = a; t <= b + 1e-6; t += step) {
        const i0 = Math.floor(t * fps); const i1 = Math.max(i0 + 1, Math.floor((t + step) * fps));
        let m = 0; for (let i = i0; i < i1 && i < n; i += 1) m = Math.max(m, arr[i]);
        raw.push({ t, e: m });
      }
      const hi = Math.max(...raw.map((x) => x.e)) || 1; const lo = Math.min(...raw.map((x) => x.e));
      const pts = raw.map((x) => ({ t: r4(x.t), v: rest + ((x.e - lo) / ((hi - lo) || 1)) * (peak - rest), ease: 'linear' }));
      const tol = Math.abs(peak - rest) * 0.04;
      const out = [pts[0]];
      for (let i = 1; i < pts.length - 1; i += 1) {
        const p0 = out[out.length - 1]; const p2 = pts[i + 1]; const u = (pts[i].t - p0.t) / ((p2.t - p0.t) || 1);
        if (Math.abs(p0.v + (p2.v - p0.v) * u - pts[i].v) > tol) out.push(pts[i]);
      }
      if (pts.length > 1) out.push(pts[pts.length - 1]);
      return out;
    }
    function shapeRange(tr) {
      if (region) return { a: region.a, b: region.b, where: 'in the loop' };
      if (view) return { a: view.start, b: view.end, where: 'in the visible part' };
      return { a: tr.in ?? 0, b: tr.out ?? D(), where: tr.in == null && tr.out == null ? 'over the whole song' : 'over the layer\'s time' };
    }
    function applyShape(tr, ln, kind) {
      const { a, b, where } = shapeRange(tr);
      const inside = (ln.keys || []).filter((k) => k.t >= a - 1e-4 && k.t <= b + 1e-4).map((k) => k.v);
      let rest; let peak;
      if (inside.length && Math.max(...inside) - Math.min(...inside) > 1e-6) { rest = Math.min(...inside); peak = Math.max(...inside); } else {
        const cur = ThreeLayers.evalKeys(ln.keys || [], a, ln.base); const amp = (kind.startsWith('follow') ? 0.5 : 0.35) * (ln.max - ln.min);
        if (ln.max - cur >= amp) { rest = cur; peak = cur + amp; } else { peak = ln.max; rest = ln.max - amp; }
      }
      rest = roundV(ln, rest); peak = roundV(ln, peak);
      const beat = 60 / (bpmNow() || 120); const bar = beat * bpbNow();
      const bs = beats().filter((t) => t >= a - 1e-4 && t < b - 1e-4);
      const pulse = (ts) => ts.flatMap((t, i) => { const nx = ts[i + 1] ?? b; return [{ t, v: peak, ease: 'curve', c: -0.6 }, { t: Math.min(t + beat * 0.6, nx - 0.002), v: rest, ease: 'hold' }]; });
      const steps = (len, fn, ease) => { const out = []; for (let i = 0, t = a; t <= b + 1e-4; i += 1, t = a + i * len) out.push({ t, v: fn(i), ease }); return out; };
      let pts;
      if (kind === 'beats') pts = pulse(bs);
      else if (kind === 'kicks' || kind === 'snares' || kind === 'hits') {
        const marks = map.marks[kind.slice(0, -1)].filter((t) => t >= a - 1e-4 && t < b - 1e-4);
        if (!marks.length) { toast(`No ${kind.slice(0, -1)} markers ${where}: add some with ${kind[0].toUpperCase()} while it plays`, { type: 'error' }); return; }
        pts = pulse(marks);
      } else if (kind === 'rampUp') pts = [{ t: a, v: rest, ease: 'linear' }, { t: b, v: peak, ease: 'linear' }];
      else if (kind === 'rampDown') pts = [{ t: a, v: peak, ease: 'linear' }, { t: b, v: rest, ease: 'linear' }];
      else if (kind === 'sine') pts = steps(bar / 2, (i) => (i % 2 ? peak : rest), 'ease');
      else if (kind === 'square') pts = steps(bar / 2, (i) => (i % 2 ? rest : peak), 'hold');
      else if (kind === 'random') pts = bs.map((t) => ({ t, v: roundV(ln, rest + Math.random() * (peak - rest)), ease: 'hold' }));
      else if (kind.startsWith('follow')) {
        const an = st.analysis;
        if (!an) { toast('The song is still being analyzed', { type: 'error' }); return; }
        pts = followPoints({ followLevel: an.level, followBass: an.bass, followMid: an.mid, followHigh: an.treble }[kind], a, b, rest, peak).map((k) => ({ ...k, v: roundV(ln, k.v) }));
      }
      if (!pts?.length) return;
      insertPoints(tr.id, ln.prop, pts.map((k) => ({ ...k, t: r4(k.t) })));
      toast(`${SHAPES.find((x) => x[0] === kind)[1]} ${where} on ${ln.label}. The new points are selected: drag one to move them all, Alt+drag to make the swing bigger or smaller.`, { timeout: 4500 });
    }
    function laneMenu(e, tr, ln) {
      const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
      const { where } = shapeRange(tr);
      const sameSel = autoSel && autoSel.id === tr.id && autoSel.prop === ln.prop && autoSel.idx.size;
      activeLane = { id: tr.id, prop: ln.prop };
      menuAt(anchor, [
        ...SHAPES.filter(([id]) => !id.startsWith('follow')).map(([id, name, hint]) => [name, `${hint}, ${where}`, () => applyShape(tr, ln, id)]),
        null,
        ...SHAPES.filter(([id]) => id.startsWith('follow')).map(([id, name, hint]) => [name, `${hint}, ${where}`, () => applyShape(tr, ln, id)]),
        null,
        ['Select all points', 'Ctrl+A', () => selectAllPoints()],
        sameSel ? ['Copy the selected points', 'Ctrl+C', () => copyPoints()] : false,
        sameSel ? ['Duplicate them after themselves', 'Ctrl+D', () => duplicatePoints()] : false,
        autoClip ? ['Paste at the playhead', `Ctrl+V · ${autoClip.keys.length} points`, () => pastePoints()] : false,
        ['Clear this lane', `Remove every ${ln.label} point`, () => { autoSel = null; laneCommit(tr.id, ln, []); }],
        null,
        [ln.tall ? 'Make the lane shorter' : 'Make the lane taller', 'Or double-click its header', () => trackHandlers.onLaneTall?.(tr.id, ln.prop)],
        ['Hide the lane', 'The animation stays; show it again with ▾', () => trackHandlers.onLaneHide?.(tr.id, ln.prop)],
      ].filter((x) => x !== undefined && x !== false).filter((x, i, arr) => x !== null || (i > 0 && arr[i - 1] !== null)));
    }
    let lastLaneAdd = 0;
    canvas.addEventListener('dblclick', (e) => {
      const hit = hitTest(e);
      if (hooks.dblclick?.(hit, timeAt(e))) return;
      if (hit.zone === 'laneHead') { if (e.clientY - canvas.getBoundingClientRect().top >= hit.lr.top + 16) trackHandlers.onLaneTall?.(hit.track.id, hit.lane.prop); return; }
      if (hit.zone === 'auto') {
        // double-click a point to delete it (not the one this double-click just created)
        if (hit.point >= 0 && performance.now() - lastLaneAdd > 450) {
          autoSel = null;
          laneCommit(hit.track.id, hit.lane, (hit.lane.keys || []).filter((_, i) => i !== hit.point));
        }
        return;
      }
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
      if (hit.zone === 'ruler' && !hit.edge) { if (view) setView(null); else if (region) fitLoop(); return; } // double-click the ruler: whole song / the loop
      if (hit.zone !== 'wave' || locked || !st.analysis) return;
      const tt = timeAt(e);
      const sec = st.analysis.sections.find((s) => tt >= s.start && tt < s.end);
      if (sec) { setRegion({ a: snapT(sec.start), b: snapT(sec.end) }); toast(`Looping the ${sec.energy} part ${fmtTime(sec.start)}–${fmtTime(sec.end)}`, { timeout: 2000 }); }
    });
    canvas.addEventListener('contextmenu', (e) => {
      const hit = hitTest(e);
      if (hit.zone === 'laneHead' || hit.zone === 'laneClose') { e.preventDefault(); laneMenu(e, hit.track, hit.lane); return; }
      if (hit.zone === 'cue') { e.preventDefault(); cueMenu(e, hit.cue); return; }
      if (hit.zone === 'auto') {
        e.preventDefault();
        const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
        const L = hit.lane; const tr = hit.track;
        const keys = copyKeys(L.keys);
        if (hit.point >= 0) {
          // on a selected point: the change applies to the whole selection
          const inSel = autoSel && autoSel.id === tr.id && autoSel.prop === L.prop && autoSel.idx.has(hit.point);
          const targets = inSel ? autoSel.idx : new Set([hit.point]);
          const n = targets.size;
          const setEase = (ease) => () => laneCommit(tr.id, L, keys.map((k, i) => (targets.has(i) ? { ...k, ease, c: undefined } : k)));
          menuAt(anchor, [
            ['Smooth', `Eases in and out to the next point${n > 1 ? ` (${n} points)` : ''}`, setEase('ease')],
            ['Linear', 'Straight line to the next point', setEase('linear')],
            ['Hold', 'Stays, then jumps at the next point', setEase('hold')],
            null,
            n > 1 ? ['Copy', 'Ctrl+C', () => copyPoints()] : false,
            n > 1 ? ['Duplicate after themselves', 'Ctrl+D', () => duplicatePoints()] : false,
            [n > 1 ? `Delete ${n} points` : 'Delete point', n > 1 ? 'Delete key' : `At ${fmtMs(keys[hit.point].t)}`, () => { autoSel = null; laneCommit(tr.id, L, keys.filter((_, i) => !targets.has(i))); }],
          ].filter((x) => x !== false));
        } else laneMenu(e, tr, L);
        return;
      }
      if (hit.zone === 'lane' && hit.mark != null) { e.preventDefault(); markMenu(e, hit.lane, hit.mark); }
      if (hit.zone === 'ruler' || hit.zone === 'wave') { e.preventDefault(); waveMenu(e, timeAt(e)); }
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
      const px = e.deltaMode === 1 ? 16 : 1; // lines → pixels
      if (e.shiftKey || e.altKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const d = ((e.shiftKey || e.altKey ? e.deltaY : e.deltaX) || 0) * px / tw() * span() * 1.5;
        setView({ start: v0() + d, end: v0() + d + span() });
      } else {
        // smooth: a mouse notch ≈ 1.25×, a trackpad pinch (ctrl + wheel) or two-finger scroll zooms gradually
        const f = Math.max(0.5, Math.min(2, Math.exp(e.deltaY * px * (e.ctrlKey ? 0.012 : 0.0022))));
        zoomBy(f, timeAt(e));
      }
    }, { passive: false });
    canvas.addEventListener('mousemove', (e) => {
      if (!D()) return;
      // while a drag scrubs or moves something the playhead shows where it is: no hairline, no tooltip churn
      if (dragging) { if (!hoverEl.hidden) hoverEl.hidden = true; return; }
      const hit = hitTest(e);
      const tt = timeAt(e);
      canvas.style.cursor = hit.zone === 'mute' || hit.zone === 'solo' ? 'pointer' : hit.zone === 'cue' ? 'grab' : hit.zone === 'auto' ? (e.ctrlKey ? 'crosshair' : hit.point >= 0 ? 'move' : hit.handle >= 0 ? 'ns-resize' : 'crosshair') : hit.zone === 'gutter' ? 'default' : hit.zone === 'chip' || hit.zone === 'note' || hit.zone === 'ghost' || hit.zone === 'laneHead' || hit.zone === 'laneClose' ? 'pointer' : hit.zone === 'track' ? (hit.key ? 'move' : hit.edge ? 'ew-resize' : hit.inside ? 'grab' : 'default') : hit.zone === 'lane' ? (hit.mark != null ? 'ew-resize' : 'cell') : locked ? 'pointer' : hit.zone === 'ruler' ? (hit.edge ? 'ew-resize' : 'copy') : 'pointer';
      const tips = {
        ruler: locked ? 'Locked: click to jump' : 'Drag along this strip to draw a loop; drag its edges to adjust · C drops a cue at the playhead',
        wave: 'Click to jump · double-click to loop this part · wheel to zoom · Shift+wheel to scroll',
        lane: 'Click to add a marker here · drag to move · double-click or right-click to delete · or press K / S / H while it plays',
        auto: hit.point >= 0 ? 'Drag the point · Shift+click to add it to the selection · double-click to delete · right-click for Smooth / Linear / Hold' : hit.handle >= 0 ? 'Drag up or down to bend the curve' : `Click to add a ${hit.lane?.label} point (snaps to the grid) · Ctrl+drag to draw · Shift+drag to select points · right-click for shapes (pulse on kicks, ramps, waves…)`,
        chip: 'Choose which settings of this layer show as curves below it (several at once) · A shows every animated one',
        laneHead: `${hit.lane?.label}: click the name to switch it to another setting · double-click to make the lane taller / shorter · right-click for more`,
        laneClose: 'Hide this lane (the animation stays)',
        mute: 'Mute: hide this layer (click again to show it)',
        solo: 'Solo: show only this layer while you work on it (click again to show all; not saved)',
        cue: hit.cue ? `${hit.cue.name} at ${fmtMs(hit.cue.t)}: click to jump · drag to move · right-click to rename, loop or delete` : '',
        gutter: 'A shows / hides every animated setting of every layer',
        note: hit.note ? `Note at ${fmtMs(hit.note.t)}: ${hit.note.text}` : '',
        track: hit.key ? `Keyframe at ${fmtMs(hit.key.t)}: click to jump there · drag to move · double-click to delete · right-click for Ease / Linear / Hold` : `${hit.track?.name || 'Layer'}: drag the bar to move it in time · drag its ends to trim · double-click to fit it to the loop (again: whole song)`,
      };
      setProp(canvas, 'title', `${hooks.hoverText?.(tt) ?? fmtMs(tt)}\n${tips[hit.zone]}`);
      const cur = hooks.cursorAt?.(tt, hit, xOf) || '';
      if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
      // a hairline with the time under the mouse (and the bar · beat when there's a grid)
      const x = xOf(tt);
      const bs = beats(); const bi = beatIndex(bs, tt);
      const bb = bi >= 0 ? bno(bs, bi) : null;
      setProp(hoverEl, 'hidden', !(hit.zone === 'wave' || hit.zone === 'ruler' || hit.zone === 'lane'));
      hoverEl.style.transform = `translateX(${Math.round(hooks.hoverX?.(tt, xOf) ?? x)}px)`;
      const secName = sectionAt(tt).cue;
      const label = `${hooks.hoverText?.(tt) ?? (span() < 20 ? fmtMs(tt) : fmtTime(tt))}${bb != null ? ` · ${Math.floor(bb / bpbNow()) + 1}.${mod(bb, bpbNow()) + 1}` : ''}${secName ? ` · ${secName}` : ''}`;
      if (hoverEl.dataset.t !== label) hoverEl.dataset.t = label;
    });
    canvas.addEventListener('mouseleave', () => { hoverEl.hidden = true; });
    // right-click the waveform / ruler: loop, cue, section and zoom actions at that spot
    function waveMenu(e, t) {
      const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
      const bar = snapStep('bar', G(), bpmNow()); let a = snapTime(t, 'bar', G(), beats(), dIdx()); if (a > t + 1e-3) a -= bar; if (a < -1e-3) a += bar;
      const sec = st.analysis?.sections.find((x) => t >= x.start && t < x.end);
      const extra = hooks.waveItems?.(t) || [];
      menuAt(anchor, [
        ...extra, ...(extra.length ? [null] : []),
        ['Play from here', fmtMs(t), () => { seek(t); toggle(true); }],
        ['Loop this bar', 'L at the playhead', () => setRegion({ a, b: a + bar })],
        ['Loop 4 bars from here', '', () => setRegion({ a, b: Math.min(D(), a + bar * 4) })],
        sec ? [`Loop this ${sec.energy} part`, `${fmtTime(sec.start)}–${fmtTime(sec.end)} · or double-click`, () => setRegion({ a: snapT(sec.start), b: snapT(sec.end) })] : false,
        region ? ['Remove the loop', '', () => setRegion(null)] : false,
        null,
        ['Song starts here', '{ · trims the song (the sketch hears only the trimmed part)', () => setTrimEdge('a', t)],
        ['Song ends here', '}', () => setTrimEdge('b', t)],
        map.trim ? ['Untrim the song', `${fmtMs(map.trim.a)} → ${fmtMs(map.trim.b)}`, () => setTrim(null)] : false,
        [`Save ${cutRange().what} as a file`, '/cut-loop · ffmpeg, next to the original', () => cutLoop()],
        st.video ? [`Send ${cutRange().what} to Video Review`, '/send-clip · a clip on its ✂ track', () => sendClip()] : false,
        st.video ? ['Edit it in the video editor', '/lab-to-editor · its own edit, frame by frame', () => sendClip('edit')] : false,
        st.video ? [`Overlay ${cutRange().what} on the open edit`, '/lab-overlay · a layer at the edit\'s playhead', () => sendClip('overlay')] : false,
        ['Use as the edit\'s music', '/lab-music · on the editor\'s audio track', () => sendClip('music')],
        null,
        ['Cue here', 'C at the playhead', () => addCue(t)],
        ['Section here…', 'Intro, Build, Drop…', () => menuAt(anchor, SECTION_NAMES.map((n) => [n, '', () => addCue(t, n)]))],
        ['The 1 is here', 'The grid\'s downbeat', () => editGrid((g) => { g.anchor = r4(snapToHit(t + 0.05, 'kick')); })],
        null,
        ['Whole song', '0', () => setView(null)],
      ].filter((x) => x !== false));
    }
    minimap.addEventListener('dblclick', () => setView(null)); // double-click the overview: the whole song
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
    // sizes as the ResizeObservers last saw them: reading clientWidth right after the time text changed forced a
    // layout of the page ten times a second while a song played
    new ResizeObserver(() => { sizes.mw = minimap.clientWidth; sizes.mh = minimap.clientHeight; sizes.mOk = true; draw(); }).observe(minimap);
    new ResizeObserver(() => { sizes.cw = canvas.clientWidth; sizes.ch = canvas.clientHeight; sizes.cOk = true; draw(); }).observe(canvas);
    paint();

    return {
      el: bar,
      load, pick, attach, toggle, seek, onMessage, unload, onKey, setTracks, setNotes, setSize, restoreSize,
      // ---------- for the footage side (tools/three-frames.js) ----------
      hooks,
      redraw: () => draw(), paintAll: () => paint(),
      pushUndo(entry) { mapUndo.push({ hook: entry }); if (mapUndo.length > 80) mapUndo.shift(); paint(); },
      // J / L shuttle speeds (2×, 4×, 8×) outside the speed menu; 1 goes back to normal
      shuttleRate(r) { const t = now(); st.rate = r > 0 ? r : 1; st.time = t; st.stampAt = performance.now(); send({ type: 'media', cmd: 'rate', value: st.rate }); rateSel.classList.toggle('on', st.rate !== 1); paint(); },
      get view() { return view ? { ...view } : null; },
      get selection() { return selected ? { ...selected } : autoSel ? { points: autoSel.idx.size } : null; },
      tapHit: (lane) => addAtPlayhead(lane),
      toggleAllControls: () => setAll(!allCtl), toggleMute, loopBar, cycleSnap,
      quantize: () => quantize(region ? [region.a, region.b] : [0, D()]), dedupe: () => dedupe(region ? [region.a, region.b] : [0, D()]),
      get playing() { return st.playing; },
      get size() { return size; },
      // ---------- for the Three Director: the timeline ----------
      setGrid({ bpm, downbeat, beatsPerBar } = {}) {
        if (!D()) return false;
        pushUndo();
        const gr = ensureGrid();
        if (bpm) gr.bpm = Math.round(Math.max(20, Math.min(400, bpm)) * 100) / 100;
        if (downbeat != null) gr.anchor = r4(downbeat);
        if (beatsPerBar) gr.bpb = Number(beatsPerBar);
        mapChanged();
        return true;
      },
      clearGrid() { if (map.grid) { pushUndo(); map.grid = null; mapChanged(); } },
      // Run the ⚡ Triggers over the song (or the loop) offline, with the same analyser as the sketch, and write
      // what kick / snare / hit find as markers (snapped to the real attack). Returns the counts. Undoable.
      async writeTriggers(cfg, { onProgress } = {}) {
        if (!st.bytes || !D()) throw new Error('Load a song first');
        const lanes = LANES.map((l) => l.id).filter((id) => cfg[id]?.on);
        if (!lanes.length) throw new Error('Kick, snare and hit are all off');
        const SR = 48000;
        const decoded = await new OfflineAudioContext(1, 1, SR).decodeAudioData(st.bytes.slice(0));
        const range = region ? [region.a, region.b] : [0, decoded.duration];
        const ctx = new OfflineAudioContext(1, decoded.length, SR);
        const src = ctx.createBufferSource(); src.buffer = decoded;
        const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.6;
        src.connect(an); an.connect(ctx.destination);
        const fr = new Uint8Array(1024); const hz = SR / 2048;
        const state = Object.fromEntries(lanes.map((id) => [id, { armed: true, at: -1e9 }]));
        const found = Object.fromEntries(lanes.map((id) => [id, []]));
        const band = (lo, hi) => { let s = 0; let n = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(1023, Math.ceil(hi / hz)); i += 1) { s += fr[i]; n += 1; } return n ? s / n / 255 : 0; };
        const step = 1 / 60; const total = Math.ceil(decoded.duration / step);
        let k = 0;
        for (let t = step; t < decoded.duration - step; t += step) {
          ctx.suspend(t).then(() => {
            an.getByteFrequencyData(fr);
            const ms = t * 1000;
            for (const id of lanes) {
              const c = cfg[id]; const s = state[id]; const e = band(c.lo, c.hi);
              if (e < c.thr * 0.93) s.armed = true;
              else if (s.armed && e >= c.thr && ms - s.at >= c.gap) { s.at = ms; s.armed = false; if (t >= range[0] && t < range[1]) found[id].push(t); }
            }
            k += 1;
            if (k % 600 === 0) onProgress?.(k / total);
            ctx.resume();
          });
        }
        src.start();
        await ctx.startRendering();
        pushUndo();
        const counts = {};
        for (const id of lanes) {
          map.marks[id] = map.marks[id].filter((t) => t < range[0] || t >= range[1]);
          for (const t of found[id]) map.marks[id] = addMark(map.marks[id], r4(Math.max(0, Math.min(D(), snapToHit(Math.min(D(), t + 0.03), id === 'bass' ? 'kick' : id)))));
          counts[id] = found[id].length;
        }
        mapChanged();
        return { counts, range: region ? 'loop' : 'song' };
      },
      // add / remove: { kick: [seconds], snare: [...], hit: [...] }; clear: ['kick', …] (within range if given)
      editMarkers({ add = {}, remove = {}, clear = [], range = null, snap = true } = {}) {
        if (!D()) return false;
        pushUndo();
        const inRange = (t) => !range || (t >= range[0] && t < range[1]);
        for (const lane of clear) if (map.marks[lane]) map.marks[lane] = map.marks[lane].filter((t) => !inRange(t));
        for (const [lane, list] of Object.entries(remove)) if (map.marks[lane]) map.marks[lane] = map.marks[lane].filter((t) => !list.some((x) => Math.abs(x - t) < 0.02));
        for (const [lane, list] of Object.entries(add)) if (map.marks[lane]) for (const t of list) map.marks[lane] = addMark(map.marks[lane], Math.max(0, Math.min(D(), snap ? snapT(t) : t)));
        mapChanged();
        return true;
      },
      zoomTo(a, b) { if (a == null) setView(null); else setView({ start: a, end: b }); },
      // cues: { add: [{ time, name, looks? }], remove: [name or time], clear: true }
      editCues: (o) => editCues(o || {}),
      get cues() { return map.cues.map((c) => ({ time: c.t, name: c.name, ...(c.looks?.length ? { looks: c.looks } : {}) })); },
      // ---------- for chat commands (tools/three-cmds.js) ----------
      tap: () => tap(), tapOne: () => tapOne(), get tapInfo() { return tapInfo; }, jumpCue: (d) => jumpCue(d),
      setBpm(b) { if (!D() || !(b >= 20 && b <= 400)) return false; editGrid((g) => { g.bpm = Math.round(b * 100) / 100; }); return true; },
      scaleBpm(k) { if (!D()) return false; editGrid((g) => { g.bpm = Math.round(g.bpm * k * 100) / 100; }); return bpmNow(); },
      oneHere: () => { if (!D()) return false; editGrid((g) => { g.anchor = r4(now()); }); return true; },
      nudgeGrid(ms) { if (!D()) return false; editGrid((g) => { g.anchor = r4(g.anchor + ms / 1000); }); return true; },
      setQuantize, get quantize() { return quantTaps; },
      setSnap(m) { if (!SNAPS.some(([v]) => v === m)) return false; snapSel.value = m; snapSel.dispatchEvent(new Event('change')); return true; },
      get snap() { return snapMode; }, snaps: SNAPS.map(([v]) => v),
      setGridView, get gridView() { return { ...gridView }; },
      autoSections, sectionAt, sectionNames: SECTION_NAMES,
      undo: () => undoMap(),
      setView: (a, b) => (a == null ? setView(null) : setView({ start: a, end: b })),
      zoom: (f) => zoomBy(f), fitLoop: () => fitLoop(),
      recordSpan: (o) => recordSpan(o || {}),
      record(kind = 'manual', o = {}) { if (o.fps || o.mbps || o.countdown != null) setRecOpt(o); if (kind === 'stop') { stopRecord(); return true; } if (recording) return false; if (kind === 'loop' && !region) kind = 'manual'; if (kind === 'track' && !st.bytes) kind = 'manual'; startRecord(kind); return kind; },
      recordMenu: (anchor) => recordMenu(anchor || recBtn),
      get recordOptions() { return recOpts(); },
      // N bars from the bar the playhead is in, looping on
      loopBars(n = 1) {
        if (!D()) return null;
        const bar = snapStep('bar', G(), bpmNow()); const t = now();
        let a = snapTime(t, 'bar', G(), beats(), dIdx()); if (a > t + 1e-3) a -= bar; if (a < -1e-3) a += bar;
        setRegion({ a: Math.max(0, a), b: Math.min(D(), a + bar * Math.max(1, n)) });
        if (!st.loop) loopBtn.click();
        return region ? { ...region } : null;
      },
      setLoopOn(on) { if (Boolean(on) !== st.loop) loopBtn.click(); return st.loop; },
      lock: (on) => { setLocked(on ?? !locked); return locked; },
      tapLane: (lane) => addAtPlayhead(lane),
      // ---------- round 5: the music side figures things out (tools/three-music.js) ----------
      on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((x) => x !== fn); }; },
      get analysis() { return st.analysis; },
      get wave() { return st.wave; },
      markFound: (kind) => markFound(kind),
      found: (kind) => found(kind),
      nudgeByEar: (dir, e) => nudgeByEar(dir, e),
      get tapLatency() { return tapLat ? { ...tapLat } : null; },
      forgetTapLatency() { tapLat = null; store.set('three.tapLatency', null); paintBpmRead(); },
      // bar 1 and the tempo as detected (forget your grid)
      useDetectedGrid() { if (!st.analysis) return false; if (map.grid) { pushUndo(); map.grid = null; mapChanged(); } return { bpm: bpmNow(), anchor: G()?.anchor ?? beats()[dIdx()] ?? 0 }; },
      get gridSource() { return map.grid ? 'yours' : autoGrid() ? 'detected' : st.analysis ? 'tracked beats' : 'none'; },
      get downbeat() { return G()?.anchor ?? beats()[dIdx()] ?? null; },
      // re-run the analysis of the loaded song (keeps your grid, markers and cues)
      async reanalyze() {
        if (!st.bytes) return null;
        const seq = loadSeq; analyzing = true; paint();
        try {
          const a = await analyze(st.bytes, { onProgress: (p) => { if (seq === loadSeq) setText(nameEl, `${st.name} · analyzing ${Math.round(p * 100)}%`); } });
          if (seq !== loadSeq) return null;
          st.samples = a.samples; st.wave = a.wave; delete a.samples; delete a.wave; st.analysis = a; anaVer += 1;
          waveCache.key = ''; gridCache.key = '';
          send({ type: 'media-analysis', analysis: st.analysis });
          sendMap();
          emit('analysis', st.analysis);
          return st.analysis;
        } finally { analyzing = false; paint(); }
      },
      fill: (kind) => fillKind(kind),
      // seconds until the next beat / bar (for "freeze on the beat")
      untilNext(unit = 'beat') { if (!D()) return null; const t = now(); if (unit === 'kick' || unit === 'snare' || unit === 'hit') { const m = map.marks[unit].find((x) => x > t + 0.01); return m == null ? null : (m - t) / (st.rate || 1); } const bs = beats(); const i = beatIndex(bs, t); for (let k = Math.max(0, i + 1); k < bs.length; k += 1) { if (unit === 'beat' || mod(bno(bs, k), bpbNow()) === 0) return (bs[k] - t) / (st.rate || 1); } return null; },
      clearMarks(lane) { if (!D() || !map.marks[lane]) return 0; const range = region ? [region.a, region.b] : [0, D()]; pushUndo(); const n0 = map.marks[lane].length; map.marks[lane] = map.marks[lane].filter((t) => t < range[0] || t >= range[1]); mapChanged(); return n0 - map.marks[lane].length; },
      get markers() { return Object.fromEntries(LANES.map((l) => [l.id, map.marks[l.id].length])); },
      addCue, setRate,
      get rate() { return st.rate; },
      beatsIn(a, b) { return beats().filter((t) => t >= a - 1e-4 && t <= b + 1e-4); },
      markersIn(lane, a, b) { return (map.marks[lane] || []).filter((t) => t >= a - 1e-4 && t <= b + 1e-4); },
      get bpm() { return bpmNow() || 120; },
      get beatsPerBar() { return bpbNow(); },
      timeline({ from = 0, to = Infinity } = {}) {
        const pick = (arr) => arr.filter((t) => t >= from && t <= to).slice(0, 400);
        return {
          ...(st.clock ? { sceneTimeline: `no song: the scene's own timeline (${fmtLen(D())} at ${clockFps()} fps); times in seconds, frame-exact` } : {}),
          duration: Math.round(D() * 1000) / 1000, playhead: Math.round(now() * 1000) / 1000,
          grid: map.grid ? { bpm: map.grid.bpm, downbeat: map.grid.anchor, beatsPerBar: map.grid.bpb, setBy: 'user' } : { bpm: bpmNow(), ...(autoGrid() ? { downbeat: autoGrid().anchor, beatsPerBar: 4 } : {}), setBy: 'auto-detected' },
          markers: Object.fromEntries(LANES.map((ln) => [ln.id, pick(map.marks[ln.id])])),
          cues: map.cues.map((c) => ({ time: c.t, name: c.name, ...(c.looks?.length ? { looks: c.looks } : {}) })),
          loop: region ? { start: region.a, end: region.b, locked } : null,
          view: view ? { start: Math.round(view.start * 1000) / 1000, end: Math.round(view.end * 1000) / 1000 } : 'whole song',
          snap: snapMode,
        };
      },
      get duration() { return D(); },
      get trim() { return map.trim ? { ...map.trim } : null; },
      setTrim: (r) => setTrim(r), setTrimEdge: (edge, t) => setTrimEdge(edge, t ?? now()), cutLoop: () => cutLoop(), sendClip: (as) => sendClip(as),
      get isVideo() { return st.video; },
      // the scene's own timeline (round 10): a scene with no song still has one (see loadClock)
      loadClock: (o) => loadClock(o), setClockLength: (s) => setClockLength(s), carry: (from, to) => carry(from, to), copyMap: (from, to) => copyMap(from, to),
      get clock() { return st.clock ? { seconds: D(), fps: clockFps(), frame: clockFrame(now()), frames: Math.round(D() * clockFps()) } : null; },
      get isClock() { return Boolean(st.clock); },
      get loop() { return region ? { ...region } : null; },
      setLoop(a, b) { if (locked) return false; setRegion(a == null ? null : { a, b }); return true; },
      get recording() { return Boolean(recording); },
      get loaded() { return Boolean(st.bytes); },
      get path() { return st.path; },
      get time() { return now(); },
      // For the Three Director: what's loaded, the user's grid and hit markers, and the song's shape.
      info() {
        if (!st.bytes) return { loaded: false, note: 'No music loaded. Sketches get a demo 120 bpm beat; the user can load a file with "🎵 Load audio / video…" or you can use three_load_media.' };
        if (st.clock) return { loaded: false, file: null, sceneTimeline: { seconds: D(), fps: clockFps(), time: Math.round(now() * 1000) / 1000, frame: clockFrame(now()), playing: st.playing, cues: map.cues.length }, note: 'No song: the scene has its own timeline (keyframes, cues and the loop work on it, frame-exact; nothing reacts to music). The user can load a song with 🎵 (or three_load_media): the keyframes and cues keep their seconds.' };
        const a = st.analysis;
        const hits = Object.fromEntries(LANES.map((ln) => [ln.id, { count: map.marks[ln.id].length, first: map.marks[ln.id].slice(0, 12) }]));
        const out = {
          loaded: true, file: st.path, video: st.video, duration: Math.round(D() * 1000) / 1000, time: Math.round(now() * 1000) / 1000, playing: st.playing,
          loop: region ? { start: region.a, end: region.b, locked, on: st.loop } : (st.loop ? 'whole song' : 'off'),
          ...(map.trim ? { trim: { start: map.trim.a, end: map.trim.b, note: 'the song plays only between these' } } : {}),
          grid: map.grid ? { bpm: map.grid.bpm, firstDownbeat: map.grid.anchor, beatsPerBar: map.grid.bpb, setBy: 'the user (trust it)' } : { bpm: a?.bpm, ...(a?.grid ? { firstDownbeat: autoGrid()?.anchor ?? beats()[dIdx()] ?? null, tempoSure: a.grid.tempoConf, barOneSure: a.grid.downbeatConf, straight: a.grid.straight } : {}), setBy: 'auto-detected' },
          hits: { ...hits, setBy: 'the user, by hand: cut and hit on these, not on guesses' },
        };
        if (!a) return { ...out, analysis: analyzing ? 'still analyzing' : 'none (no audio track)' };
        const per = 5; const n = a.bass.length; const stepN = per * a.fps;
        const avg = (arr, i) => { let s = 0; let c = 0; for (let k = i; k < Math.min(n, i + stepN); k += 1) { s += arr[k]; c += 1; } return Math.round((s / (c || 1)) * 100) / 100; };
        const energy = [];
        for (let i = 0; i < n; i += stepN) energy.push({ at: Math.round(i / a.fps), level: avg(a.level, i), bass: avg(a.bass, i), mid: avg(a.mid, i), highs: avg(a.treble, i) });
        const found = a.onsets ? Object.fromEntries(Object.entries(a.onsets).map(([k, v]) => [k, v.length])) : null;
        return { ...out, beats: beats().length, sections: a.sections, drops: a.drops, ...(found ? { detectedHits: { ...found, note: 'found in the audio; /mark-kicks writes them as markers' } } : {}), ...(a.style ? { style: { preset: a.style.preset, why: a.style.why } } : {}), energyEvery5s: energy };
      },
    };
  }

  // _test.core: the analysis math (tools/three-music-core.js) for unit tests on synthetic signals
  return { analyze, stage, player, isMedia, SIZES, _test: { gridBeats, snapTime, parseTime, fmtMs, beatIndex, addMark, get core() { return typeof MusicCore === 'undefined' ? null : MusicCore; } } };
})();
