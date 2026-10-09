// Cut: clip editing in Video Review. E (or ✂ in the transport) turns the timeline into a clip track for the open
// video: S splits at the playhead, Del lifts / Shift+Del ripple-deletes, drag an edge to trim (snaps to beats,
// cuts, markers, the playhead), drag a clip to reorder, Q / W trim to the playhead, D duplicates, A mutes, [ ]
// change the speed (pitch kept), fade handles on the selected clip, I / O in–out, M markers, Shift+F freeze frame,
// Shift+T title card, ⌘/Ctrl+Z undo. Drop more videos (or library cards) on the track to add them. The edit is a
// list stored per video (kv video-cuts); the files are never touched. The stage plays the edit seamlessly (two
// decoders: the next clip waits preloaded at its first frame), and ⇪ renders it with ffmpeg (tools/cut-data.js)
// as a new version next to the video or in any social preset. Chat commands: tools/cut-cmds.js.
const VideoCut = (() => {
  const C = CutData;
  const V = VideoData;
  const R = () => Review;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const noExt = (n) => n.replace(/\.[^.]+$/, '');
  const sep = (p) => (String(p).includes('\\') && !String(p).startsWith('/') ? '\\' : '/');
  const dirOf = (p) => String(p).slice(0, Math.max(String(p).lastIndexOf('\\'), String(p).lastIndexOf('/')));
  const join = (...parts) => parts.join(sep(parts[0]));
  const fmt = (t) => C.fmt(Math.max(0, t || 0));
  const clean = (msg) => String(msg).replace(/^Error invoking remote method[^:]*: (Error: )?/, '');

  let host = null; // what Review hands over at mount: { refs, S, fileUrl, startJob, flash }
  const st = { on: false, path: null, edit: null, sel: new Set(), undo: [], redo: [], suggest: null, drag: null, snapAt: null };
  let cuts = null; // kv video-cuts: { [video path]: edit }
  const refs = {};
  const listeners = {};
  const emit = (ev, d) => { for (const fn of listeners[ev] || []) { try { fn(d); } catch (err) { console.error(err); } } };

  // ---------- storage + history ----------
  const saveCuts = debounce(() => window.hub.kvSet('video-cuts', cuts), 400);
  async function loadCuts() {
    if (cuts) return cuts;
    cuts = (await window.hub.kvGet('video-cuts', {})) || {};
    return cuts;
  }
  const hasCut = (p) => Boolean(cuts?.[p]?.clips?.length);
  const srcDur = (p) => (p === host?.S.cur?.path && host.refs.video.duration) || host?.S.meta[p]?.d || 0;
  // The edit of a video: yours, or the whole video as one clip.
  function editOf(p) {
    if (cuts?.[p]) return C.normalize(cuts[p]);
    const d = srcDur(p);
    return d ? C.fromSource(p, d) : C.empty();
  }
  const total = () => (st.edit ? C.total(st.edit) : 0);
  function store(path, e) {
    if (!cuts) return;
    const had = hasCut(path);
    if (C.isIdentity(e, path, srcDur(path)) && !e.mark) delete cuts[path]; else cuts[path] = e;
    saveCuts();
    if (had !== hasCut(path)) R().refreshCard?.(path); // the ✂ badge on its library card
  }
  // Every change goes through here: one undo step, saved, redrawn, the picture refreshed.
  function commit(next, label) {
    if (!st.edit || next === st.edit) return false;
    st.undo.push(JSON.stringify(st.edit));
    if (st.undo.length > 120) st.undo.shift();
    st.redo = [];
    apply(next);
    if (label) host?.flash(label);
    return true;
  }
  function apply(next) {
    st.edit = next;
    const ids = new Set(next.clips.map((c) => c.id));
    for (const id of [...st.sel]) if (!ids.has(id)) st.sel.delete(id);
    store(st.path, next);
    if (P.T > total()) P.T = total();
    refreshPicture();
    draw(); paintHead(); placeHead();
    emit('change', { path: st.path });
  }
  function undo() { if (!st.undo.length) return false; st.redo.push(JSON.stringify(st.edit)); apply(JSON.parse(st.undo.pop())); host?.flash('Undo'); return true; }
  function redo() { if (!st.redo.length) return false; st.undo.push(JSON.stringify(st.edit)); apply(JSON.parse(st.redo.pop())); host?.flash('Redo'); return true; }

  // ---------- the program monitor: two decoders + a picture for title cards ----------
  // P.T = program time. While a video clip plays, the time comes from its decoder; stills and gaps run on a clock.
  const P = { T: 0, playing: false, rate: 1, idx: -1, act: 0, seq: 0, clockT: 0, clockAt: 0, raf: 0, timer: 0, fadeAnim: null, vol: -1, revAt: 0 };
  const els = () => [refs.pa, refs.pb];
  const active = () => els()[P.act];
  const standby = () => els()[1 - P.act];
  const fpsOf = (src) => host?.S.meta[src]?.fps || (src === host?.S.cur?.path ? host.S.fps : 30) || 30;
  const progFps = () => fpsOf(st.path);
  const keyOf = (c) => (c ? `${c.src}|${c.kind === 'freeze' ? c.at : c.in}` : '');
  function loadEl(el, src) {
    if (el.dataset.src === src && el.readyState >= 1) return Promise.resolve(true);
    el.dataset.src = src; el.dataset.key = '';
    el.src = host.fileUrl(src);
    return new Promise((res) => { const done = (ok) => { el.removeEventListener('loadedmetadata', y); el.removeEventListener('error', n); res(ok); }; const y = () => done(true); const n = () => done(false); el.addEventListener('loadedmetadata', y); el.addEventListener('error', n); setTimeout(() => done(false), 8000); });
  }
  function seekEl(el, t) {
    const to = clamp(t, 0, Math.max(0, (el.duration || t + 1) - 0.001));
    if (Math.abs(el.currentTime - to) < 1e-4 && !el.seeking && el.readyState >= 2) return Promise.resolve();
    el.currentTime = to;
    return new Promise((res) => { const f = () => { el.removeEventListener('seeked', f); res(); }; el.addEventListener('seeked', f); setTimeout(f, 3000); });
  }
  // what the stage shows: 'a' | 'b' (a decoder), 'img' (title card) or 'black' (gap)
  let shown = '';
  function show(which) {
    if (shown === which) return;
    shown = which;
    refs.pa.classList.toggle('on', which === 'a');
    refs.pb.classList.toggle('on', which === 'b');
    refs.pimg.classList.toggle('on', which === 'img');
  }
  const showActive = () => show(P.act ? 'b' : 'a');
  function placeClip(x, T) {
    // static picture for the clip x at program time T (paused / scrubbing)
    const c = x.clip;
    if (c.kind === 'title') { setTitlePicture(c); show('img'); return Promise.resolve(); }
    if (c.kind === 'gap') { show('black'); return Promise.resolve(); }
    const el = active();
    const t = c.kind === 'freeze' ? c.at : c.in + (T - x.start) * (c.speed || 1);
    return loadEl(el, c.src).then(() => seekEl(el, t)).then(() => { el.dataset.key = keyOf(c); });
  }
  function setTitlePicture(c) {
    const url = c.img ? host.fileUrl(c.img) : '';
    if (refs.pimg.dataset.url !== url) { refs.pimg.dataset.url = url; refs.pimg.src = url || 'data:,'; }
    refs.pimg.style.background = c.bg || '#000';
  }
  // Seek the program (paused display, or keeps playing). Newer seeks cancel older ones.
  async function seek(T, { play = P.playing } = {}) {
    if (!st.edit) return;
    const seq = ++P.seq;
    stopClock();
    P.T = clamp(T, 0, total());
    const x = C.at(st.edit, Math.min(P.T, Math.max(0, total() - 1e-4)));
    if (!x) { show('black'); placeHead(); paintTime(); return; }
    P.idx = x.i;
    for (const e of els()) if (!e.paused) e.pause();
    placeHead(); paintTime();
    await placeClip(x, P.T);
    if (seq !== P.seq) return;
    if (x.clip.kind === 'video' || x.clip.kind === 'freeze') showActive();
    prepareNext();
    staticFade(x);
    if (play) startPlay(); else { P.playing = false; placeHead(); paintPlay(); }
  }
  function refreshPicture() { if (st.on) seek(P.T, { play: P.playing }); }
  // The clip after the current one waits in the other decoder at its first frame, so the cut is instant.
  function prepareNext() {
    const L = C.layout(st.edit);
    const cur = L[P.idx]; const nx = L[P.idx + 1];
    if (!nx) return;
    const c = nx.clip;
    if (c.kind === 'title') { setTitlePicture(c); return; }
    if (c.kind !== 'video' && c.kind !== 'freeze') return;
    if (continues(cur?.clip, c)) return;
    const el = standby();
    if (el.dataset.key === keyOf(c)) return;
    loadEl(el, c.src).then(() => seekEl(el, c.kind === 'freeze' ? c.at : c.in)).then(() => { el.dataset.key = keyOf(c); });
  }
  // the next clip simply continues the same file (a plain split): the decoder keeps playing
  const continues = (a, b) => a?.kind === 'video' && b?.kind === 'video' && a.src === b.src && Math.abs(a.out - b.in) < 0.5 / fpsOf(a.src) && (a.speed || 1) === (b.speed || 1);

  function startPlay() {
    if (!st.edit || !total()) return;
    if (P.T >= total() - 1e-3) { seek(st.edit.mark ? st.edit.mark.a : 0, { play: true }); return; }
    P.playing = true;
    const L = C.layout(st.edit); const x = L[P.idx];
    P.clockT = P.T; P.clockAt = performance.now();
    if (x?.clip.kind === 'video') {
      const el = active();
      el.playbackRate = (x.clip.speed || 1) * P.rate;
      el.preservesPitch = true;
      P.vol = -1; setVolume(x, P.T);
      el.play().catch(() => {});
      watchFrames(el);
    }
    scheduleFade(x);
    cancelAnimationFrame(P.raf);
    P.raf = requestAnimationFrame(loop);
    placeHead(); paintPlay();
  }
  function pause() {
    if (!P.playing && !P.rev) { paintPlay(); return; }
    P.playing = false; P.rev = 0;
    stopClock();
    for (const e of els()) e.pause();
    P.T = nowT();
    const x = C.layout(st.edit)[P.idx];
    if (x) staticFade(x);
    placeHead(); paintTime(); paintPlay();
  }
  function stopClock() { cancelAnimationFrame(P.raf); clearTimeout(P.timer); P.timer = 0; }
  // program time now: from the decoder of a playing video clip, else the clock
  function nowT() {
    const x = st.edit ? C.layout(st.edit)[P.idx] : null;
    if (!x) return P.T;
    if (P.playing && x.clip.kind === 'video' && !active().seeking && active().dataset.key) return clamp(x.start + (active().currentTime - x.clip.in) / (x.clip.speed || 1), x.start, x.end);
    return P.playing ? P.clockT + ((performance.now() - P.clockAt) / 1000) * P.rate : P.T;
  }
  let loopN = 0;
  function loop() {
    if (!P.playing) return;
    const L = C.layout(st.edit); const x = L[P.idx];
    if (!x) { pause(); return; }
    const T = nowT();
    P.T = T;
    if (x.clip.kind === 'video') { P.clockT = T; P.clockAt = performance.now(); setVolume(x, T); }
    const end = st.edit.mark && T < st.edit.mark.b + 0.05 ? st.edit.mark.b : total();
    if (T >= end - 1e-3) { atEnd(); return; }
    // a video clip switches from watchFrames (on its last frame); this catches stills, gaps, ended files and stalls
    if (x.clip.kind === 'video' ? active().ended || active().currentTime >= x.clip.out + 0.5 / fpsOf(x.clip.src) : T >= x.end) advance();
    if ((loopN += 1) % 20 === 0) placeHead({ drift: true });
    paintTime();
    P.raf = requestAnimationFrame(loop);
  }
  // Switch exactly when the clip's last frame has been on screen for its frame time.
  function watchFrames(el) {
    if (!el.requestVideoFrameCallback) return;
    const cb = (_n, meta) => {
      if (!P.playing || el !== active()) return;
      const x = C.layout(st.edit)[P.idx];
      if (!x || x.clip.kind !== 'video') return;
      const fd = 1 / fpsOf(x.clip.src);
      if (meta.mediaTime + fd * 1.01 >= x.clip.out && !P.timer) {
        const ms = Math.max(0, ((x.clip.out - meta.mediaTime) / ((x.clip.speed || 1) * P.rate)) * 1000);
        const idx = P.idx;
        P.timer = setTimeout(() => { P.timer = 0; if (P.playing && P.idx === idx) advance(); }, ms);
        return;
      }
      el.requestVideoFrameCallback(cb);
    };
    el.requestVideoFrameCallback(cb);
  }
  function atEnd() {
    if (st.edit.mark) { seek(st.edit.mark.a, { play: true }); return; } // the in–out range loops
    pause(); P.T = total(); placeHead(); paintTime();
  }
  function advance() {
    const L = C.layout(st.edit);
    const cur = L[P.idx]; const nx = L[P.idx + 1];
    clearTimeout(P.timer); P.timer = 0;
    if (!nx) { atEnd(); return; }
    const end = st.edit.mark ? st.edit.mark.b : total();
    if (nx.start >= end - 1e-3) { atEnd(); return; }
    P.idx += 1; P.T = nx.start; P.clockT = nx.start; P.clockAt = performance.now();
    const c = nx.clip;
    const old = active();
    if (c.kind === 'video' && continues(cur.clip, c) && !old.paused) {
      old.playbackRate = (c.speed || 1) * P.rate; old.dataset.key = keyOf(c);
      prepareNext();
    } else if (c.kind === 'video' || c.kind === 'freeze') {
      const sb = standby();
      const go = () => {
        P.act = 1 - P.act;
        showActive();
        old.pause();
        if (c.kind === 'video') { sb.playbackRate = (c.speed || 1) * P.rate; sb.preservesPitch = true; P.vol = -1; setVolume(nx, nx.start); sb.play().catch(() => {}); watchFrames(sb); }
        prepareNext();
      };
      if (sb.dataset.key === keyOf(c) && sb.readyState >= 2) go();
      else { const idx = P.idx; loadEl(sb, c.src).then(() => seekEl(sb, c.kind === 'freeze' ? c.at : c.in)).then(() => { sb.dataset.key = keyOf(c); if (P.playing && P.idx === idx) { P.clockAt = performance.now(); go(); } }); }
    } else {
      old.pause();
      if (c.kind === 'title') { setTitlePicture(c); show('img'); } else show('black');
      prepareNext();
    }
    scheduleFade(nx);
    placeHead({ drift: true });
  }
  // Fades: the picture's opacity runs as one compositor animation per clip (no per-frame writes); the sound fades
  // through the decoder's volume.
  const envelope = (x, T) => {
    const c = x.clip; const local = T - x.start; const d = x.end - x.start;
    let g = 1;
    if (c.fadeIn > 0 && local < c.fadeIn) g = Math.min(g, local / c.fadeIn);
    if (c.fadeOut > 0 && d - local < c.fadeOut) g = Math.min(g, (d - local) / c.fadeOut);
    return clamp(g, 0, 1);
  };
  function staticFade(x) {
    P.fadeAnim?.cancel(); P.fadeAnim = null;
    const o = x && (x.clip.fadeIn || x.clip.fadeOut) ? envelope(x, P.T).toFixed(3) : '';
    if (refs.pfade.style.opacity !== o) refs.pfade.style.opacity = o;
  }
  function scheduleFade(x) {
    P.fadeAnim?.cancel(); P.fadeAnim = null;
    if (!x || (!x.clip.fadeIn && !x.clip.fadeOut)) { if (refs.pfade.style.opacity) refs.pfade.style.opacity = ''; return; }
    const T = P.T; const R0 = x.end - T;
    if (R0 <= 0.01) return;
    const pts = [[0, envelope(x, T)]];
    const fi = x.start + x.clip.fadeIn; const fo = x.end - x.clip.fadeOut;
    if (fi > T && fi < x.end) pts.push([(fi - T) / R0, 1]);
    if (fo > T && fo < x.end) pts.push([(fo - T) / R0, envelope(x, fo)]);
    pts.push([1, envelope(x, x.end - 1e-4)]);
    pts.sort((a, b) => a[0] - b[0]);
    refs.pfade.style.opacity = '';
    P.fadeAnim = refs.pfade.animate(pts.map(([offset, o]) => ({ offset, opacity: o })), { duration: (R0 / P.rate) * 1000, easing: 'linear', fill: 'forwards' });
    P.fadeAnim.startTime = document.timeline.currentTime;
  }
  function setVolume(x, T) {
    const src = host.refs.video;
    const v = x.clip.mute ? 0 : (src.muted ? 0 : src.volume) * envelope(x, T);
    if (Math.abs(v - P.vol) < 0.005) return;
    P.vol = v;
    active().volume = clamp(v, 0, 1);
  }
  // J / K / L in the edit: L 1× → 2× → 4×, J backwards (scrubbed), K stops.
  function shuttle(dir) {
    if (!dir) { pause(); return 0; }
    if (dir > 0) {
      const cur = P.playing && !P.rev ? P.rate : 0;
      P.rate = cur ? Math.min(4, cur * 2) : 1;
      P.rev = 0;
      if (P.playing) { const T = nowT(); seek(T, { play: true }); } else startPlay();
      host.flash(`▶ ${P.rate}×`);
      return P.rate;
    }
    pause();
    P.rev = P.rev ? Math.min(4, P.rev * 2) : 1;
    P.revAt = performance.now();
    host.flash(`◀ ${P.rev}×`);
    const back = () => {
      if (!P.rev) return;
      const now = performance.now();
      const T = P.T - ((now - P.revAt) / 1000) * P.rev;
      P.revAt = now;
      if (T <= 0) { P.rev = 0; seek(0, { play: false }); return; }
      seek(T, { play: false });
      setTimeout(back, 60);
    };
    back();
    return -P.rev;
  }

  // ---------- playhead (compositor) ----------
  const W = () => refs.sizes?.w || 0;
  const xOf = (T) => (total() ? (T / total()) * W() : 0);
  const tOf = (x) => (W() ? clamp(x / W(), 0, 1) * total() : 0);
  let headAnim = null; let headX = { x0: 0, x1: 0 };
  // drift: only a check (every 20 frames while playing); the animation restarts when it is off by more than 80 ms
  function placeHead({ drift = false } = {}) {
    if (!refs.head) return;
    const T = P.playing ? nowT() : P.T;
    const x = xOf(T);
    if (drift && headAnim && P.playing) {
      const at = headX.x0 + (headX.x1 - headX.x0) * (headAnim.effect.getComputedTiming().progress ?? 0);
      if (Math.abs(at - x) <= Math.max(2, (0.08 * P.rate * W()) / Math.max(0.1, total()))) return;
    }
    headAnim?.cancel(); headAnim = null;
    refs.head.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    if (!P.playing || !total()) return;
    const ms = ((total() - T) / P.rate) * 1000;
    if (!(ms > 30)) return;
    headAnim = refs.head.animate([{ transform: `translate3d(${x.toFixed(2)}px, 0, 0)` }, { transform: `translate3d(${W().toFixed(2)}px, 0, 0)` }], { duration: ms, easing: 'linear', fill: 'forwards' });
    headAnim.startTime = document.timeline.currentTime;
    headX = { x0: x, x1: W() };
  }

  // ---------- thumbnails + audio of every source (background, one decoder) ----------
  const thumbs = new Map(); // src -> [{ t, img }]
  const analyses = new Map(); // src -> { beats, drops, sections, peaks, duration } | null
  const queue = [];
  let pumping = false;
  function thumbsOf(src) {
    if (src === host?.S.cur?.path && host.S.strip.length) return host.S.strip;
    if (!thumbs.has(src)) { thumbs.set(src, []); queue.push(src); pump(); }
    return thumbs.get(src);
  }
  async function pump() {
    if (pumping || !queue.length) return;
    pumping = true;
    const src = queue.shift();
    const d = document.createElement('video');
    d.muted = true; d.preload = 'auto'; d.src = host.fileUrl(src);
    try {
      await new Promise((res, rej) => { d.onloadedmetadata = res; d.onerror = rej; setTimeout(rej, 10000); });
      if (!host.S.meta[src]?.d) host.S.meta[src] = { ...(host.S.meta[src] || {}), w: d.videoWidth, h: d.videoHeight, d: d.duration };
      const n = 12; const list = thumbs.get(src);
      for (let i = 0; i < n; i += 1) {
        const t = (d.duration * (i + 0.5)) / n;
        await new Promise((res) => { d.onseeked = res; d.currentTime = t; setTimeout(res, 3000); });
        const c = document.createElement('canvas'); c.width = 96; c.height = Math.round(96 * (d.videoHeight / d.videoWidth || 0.5625));
        c.getContext('2d').drawImage(d, 0, 0, c.width, c.height);
        list.push({ t, img: c });
        if (i % 4 === 3) draw();
      }
    } catch { /* not decodable here */ }
    d.removeAttribute('src'); d.load();
    pumping = false;
    draw();
    pump();
  }
  function analysisOf(src) {
    if (src === host?.S.cur?.path && host.S.audio) return host.S.audio;
    if (analyses.has(src)) return analyses.get(src);
    analyses.set(src, null);
    if (typeof ThreeMedia !== 'undefined' && ThreeMedia.analyze) {
      (async () => {
        try {
          const st0 = await window.hub.fs.stat(src);
          if (!st0 || st0.size > 300 * 1048576) return;
          const u8 = await window.hub.fs.read(src, { encoding: 'buffer', maxBytes: 300 * 1048576 });
          const a = await ThreeMedia.analyze(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
          analyses.set(src, { bpm: a.bpm, beats: a.beats, drops: a.drops, sections: a.sections, peaks: a.peaks, duration: a.duration });
          draw();
        } catch { /* no audio */ }
      })();
    }
    return null;
  }
  const analysisMap = () => Object.fromEntries(C.sources(st.edit || C.empty()).map((s) => [s, analysisOf(s)]).filter(([, a]) => a));

  // ---------- drawing the clip track (only when something changed) ----------
  const RULER = 13;
  const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  function noteMarks() {
    if (!st.edit || !st.path) return [];
    return R().notes(st.path).flatMap((n) => C.programTimes(st.edit, st.path, n.t).map((t) => ({ t, color: V.category(n.cat).color, done: n.done, text: n.text })));
  }
  function draw() {
    const c = refs.canvas;
    if (!c?.isConnected || !st.on || !st.edit) return;
    const dpr = devicePixelRatio || 1;
    const w = W(); const h = refs.sizes?.h || 0;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#07080a'; g.fillRect(0, 0, w, h);
    const D = total();
    const drag = st.drag;
    const edit = drag?.preview || st.edit;
    const L = C.layout(edit);
    const Dv = C.total(edit) || 1;
    const X = (T) => (T / Math.max(D, Dv)) * w;
    // ruler
    g.fillStyle = '#111419'; g.fillRect(0, 0, w, RULER);
    const stepS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => (s / Math.max(D, 0.1)) * w > 44) || 120;
    g.fillStyle = '#8a8f98'; g.font = '9px ui-monospace, Consolas, monospace'; g.textBaseline = 'top';
    for (let s = 0; s <= D + 1e-6; s += stepS) { const x = X(s); g.fillRect(x, 0, 1, 4); g.fillText(stepS < 1 ? `${s.toFixed(2)}` : `${Math.round(s)}s`, x + 3, 2); }
    // in–out range
    const mk = edit.mark;
    if (mk) { g.fillStyle = '#ffd75e22'; g.fillRect(X(mk.a), 0, X(mk.b) - X(mk.a), h); g.fillStyle = '#ffd75e'; g.fillRect(X(mk.a), 0, X(mk.b) - X(mk.a), 2); g.fillRect(X(mk.a), 0, 2, RULER); g.fillRect(X(mk.b) - 2, 0, 2, RULER); }
    // clips
    const top = RULER + 2; const lh = h - top - 2;
    const an = analysisMap();
    for (const x of L) {
      const cl = x.clip;
      const x0 = X(x.start); const x1 = X(x.end); const cw = Math.max(1, x1 - x0 - 1);
      const dragged = drag?.kind === 'move' && drag.id === cl.id;
      g.save();
      g.beginPath(); g.rect(x0, top, cw, lh); g.clip();
      if (cl.kind === 'gap') {
        g.fillStyle = '#0d0f12'; g.fillRect(x0, top, cw, lh);
        g.strokeStyle = '#ffffff12'; for (let k = -lh; k < cw; k += 8) { g.beginPath(); g.moveTo(x0 + k, top + lh); g.lineTo(x0 + k + lh, top); g.stroke(); }
      } else if (cl.kind === 'title') {
        g.fillStyle = cl.bg || '#000'; g.fillRect(x0, top, cw, lh);
        g.fillStyle = cl.fg || '#fff'; g.font = '600 11px system-ui, sans-serif'; g.textBaseline = 'middle';
        g.fillText(`T  ${cl.text || ''}`, x0 + 6, top + lh / 2);
      } else {
        const hh = hue(cl.src);
        g.fillStyle = `hsl(${hh} 30% 16%)`; g.fillRect(x0, top, cw, lh);
        const th = thumbsOf(cl.src);
        const sv = host.S.meta[cl.src];
        const ar = sv?.w ? sv.w / sv.h : 9 / 16;
        const tw = Math.max(8, (lh * 0.62) * ar);
        if (th.length) {
          g.globalAlpha = 0.85;
          for (let px = x0; px < x0 + cw; px += tw) {
            const T = x.start + ((px + tw / 2 - x0) / Math.max(1, x1 - x0)) * (x.end - x.start);
            const st0 = cl.kind === 'freeze' ? cl.at : cl.in + (T - x.start) * (cl.speed || 1);
            const f = th.reduce((a, b) => (Math.abs(b.t - st0) < Math.abs(a.t - st0) ? b : a));
            g.drawImage(f.img, px, top, tw, lh * 0.62);
          }
          g.globalAlpha = 1;
        }
        // waveform of the clip's sound
        const a = an[cl.src];
        if (a?.peaks?.length && cl.kind === 'video') {
          const wy = top + lh * 0.62; const wh = lh * 0.38;
          g.fillStyle = cl.mute ? '#ffffff22' : `hsl(${hh} 80% 70% / .75)`;
          const per = a.peaks.length / (a.duration || 1);
          for (let px = 0; px < cw; px += 1) {
            const s0 = cl.in + (px / Math.max(1, x1 - x0)) * (cl.out - cl.in);
            const s1 = cl.in + ((px + 1) / Math.max(1, x1 - x0)) * (cl.out - cl.in);
            let m = 0; for (let k = Math.floor(s0 * per); k < Math.max(Math.floor(s0 * per) + 1, Math.floor(s1 * per)) && k < a.peaks.length; k += 1) m = Math.max(m, a.peaks[k]);
            const hh2 = m * wh * 0.9; g.fillRect(x0 + px, wy + (wh - hh2) / 2, 1, hh2 || 1);
          }
        }
        // labels: name, speed, mute, freeze
        g.fillStyle = '#000a'; g.fillRect(x0, top, Math.min(cw, 150), 13);
        g.fillStyle = '#fff'; g.font = '10px system-ui, sans-serif'; g.textBaseline = 'top';
        const tag = [cl.kind === 'freeze' ? '❄ freeze' : noExt(base(cl.src)), cl.speed && cl.speed !== 1 ? `${cl.speed}×` : '', cl.mute && cl.kind === 'video' ? '🔇' : ''].filter(Boolean).join(' · ');
        g.fillText(tag, x0 + 4, top + 2);
      }
      // fades: a ramp over the clip
      if (cl.fadeIn > 0 || cl.fadeOut > 0) {
        g.fillStyle = '#000000a0';
        const fi = X(x.start + (cl.fadeIn || 0)) - x0; const fo = x1 - X(x.end - (cl.fadeOut || 0));
        if (fi > 0) { g.beginPath(); g.moveTo(x0, top); g.lineTo(x0 + fi, top); g.lineTo(x0, top + lh); g.fill(); }
        if (fo > 0) { g.beginPath(); g.moveTo(x1, top); g.lineTo(x1 - fo, top); g.lineTo(x1, top + lh); g.fill(); }
      }
      g.restore();
      if (dragged) { g.fillStyle = '#ffd75e30'; g.fillRect(x0, top, cw, lh); }
      // selection + fade handles
      if (st.sel.has(cl.id)) {
        g.strokeStyle = '#ffd75e'; g.lineWidth = 2; g.strokeRect(x0 + 1, top + 1, cw - 2, lh - 2); g.lineWidth = 1;
        g.fillStyle = '#ffd75e';
        for (const fx of [X(x.start + (cl.fadeIn || 0)), X(x.end - (cl.fadeOut || 0))]) g.fillRect(clamp(fx, x0 + 1, x1 - 7) , top + 1, 6, 6);
      }
      // the cut line
      g.fillStyle = '#000'; g.fillRect(x1 - 1, top, 1, lh);
    }
    // beats (faint) and bars on the ruler, drops in red
    const pb = C.programBeats(edit, an);
    g.fillStyle = '#ffd75e55'; for (const b of pb.beats) g.fillRect(X(b), RULER - 4, 1, 4);
    g.fillStyle = '#ffd75ecc'; for (const b of pb.bars) g.fillRect(X(b), RULER - 7, 1, 7);
    g.fillStyle = '#ff4d4d'; for (const d0 of pb.drops) g.fillRect(X(d0) - 1, RULER - 7, 2, 7);
    // markers: yours (gold flags) and the notes (their category color)
    for (const m of edit.markers) { const x = X(m.t); g.fillStyle = '#ffd75e'; g.beginPath(); g.moveTo(x, RULER); g.lineTo(x - 4, 3); g.lineTo(x + 4, 3); g.fill(); g.fillRect(x, RULER, 1, h - RULER); }
    for (const n of noteMarks()) { const x = X(n.t); g.globalAlpha = n.done ? 0.35 : 1; g.fillStyle = n.color; g.save(); g.translate(x, RULER / 2 + 1); g.rotate(Math.PI / 4); g.fillRect(-3, -3, 6, 6); g.restore(); g.globalAlpha = 1; }
    // a pending auto-cut suggestion: dashed lines
    if (st.suggest?.times.length) {
      g.strokeStyle = '#7fd8ff'; g.lineWidth = 2; g.setLineDash([4, 3]); g.shadowColor = '#7fd8ff'; g.shadowBlur = 6;
      for (const t of st.suggest.times) { const x = Math.round(X(t)); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.setLineDash([]); g.lineWidth = 1; g.shadowBlur = 0;
      g.fillStyle = '#7fd8ff'; g.font = '10px system-ui, sans-serif'; g.textBaseline = 'top';
      for (const t of st.suggest.times) g.fillText('✂', Math.round(X(t)) + 3, 1);
    }
    // reorder drop line + snap line
    if (drag?.kind === 'move' && drag.to != null) {
      const at = drag.to >= L.length ? Dv : L[drag.to]?.start ?? Dv;
      g.fillStyle = '#ffd75e'; g.fillRect(X(at) - 1.5, top - 2, 3, lh + 4);
    }
    if (st.snapAt != null) { g.fillStyle = '#7fd8ff'; g.fillRect(X(st.snapAt), 0, 1, h); }
  }
  let lastSum = '';
  function paintHead() {
    if (!refs.sum || !st.edit) return;
    const n = st.edit.clips.length; const i = [...st.sel].map((id) => st.edit.clips.findIndex((c) => c.id === id)).filter((k) => k >= 0).sort((a, b) => a - b);
    const mk = st.edit.mark;
    const text = `${n} clip${n === 1 ? '' : 's'} · ${fmt(total())}${mk ? ` · in–out ${fmt(mk.a)} → ${fmt(mk.b)}` : ''}${i.length ? ` · ${i.length > 1 ? `${i.length} selected` : `clip ${i[0] + 1}`}` : ''}`;
    if (text !== lastSum) { lastSum = text; refs.sum.textContent = text; }
    const s = st.suggest;
    refs.sug.hidden = !s;
    if (s) refs.sugText.textContent = s.times.length ? `${s.times.length} cut${s.times.length === 1 ? '' : 's'} ${SUGGEST_LABEL[s.mode] || s.mode}` : `No ${SUGGEST_LABEL[s.mode] || s.mode} found (the beats come from the audio)`;
    refs.undoBtn.disabled = !st.undo.length;
  }
  let lastTime = '';
  function paintTime() {
    const r = host?.refs;
    if (!r || !st.on) return;
    const T = P.playing ? nowT() : P.T;
    if (document.activeElement !== r.time) { const v = fmt(T); if (v !== lastTime) { lastTime = v; r.time.value = v; } }
    const tot = `/ ${fmt(total())}  · ✂`;
    if (r.timeTotal.textContent !== tot) r.timeTotal.textContent = tot;
  }
  function paintPlay() {
    const r = host?.refs;
    if (!r) return;
    const icon = P.playing ? '❚❚' : '▶';
    if (r.play.textContent !== icon) r.play.textContent = icon;
  }

  // ---------- pointer on the track ----------
  const SUGGEST_LABEL = { bars: 'on every bar', '2bars': 'every 2 bars', '4bars': 'every 4 bars', beats: 'on every beat', drops: 'on the drops', sections: 'at the song\'s sections', markers: 'at the markers and notes' };
  function hit(e) {
    const r = refs.canvas.getBoundingClientRect();
    const x = e.clientX - r.left; const y = e.clientY - r.top;
    const T = tOf(x);
    if (y < RULER) return { zone: 'ruler', T, x };
    const L = C.layout(st.edit);
    const top = RULER + 2;
    for (const it of L) {
      const x0 = xOf(it.start); const x1 = xOf(it.end);
      if (x < x0 - 5 || x > x1 + 5) continue;
      if (st.sel.has(it.clip.id) && y < top + 9) {
        const fi = xOf(it.start + (it.clip.fadeIn || 0)); const fo = xOf(it.end - (it.clip.fadeOut || 0));
        if (Math.abs(x - fi - 3) <= 6) return { zone: 'fade', edge: 'in', it, T, x };
        if (Math.abs(x - fo + 3) <= 6) return { zone: 'fade', edge: 'out', it, T, x };
      }
      if (Math.abs(x - x0) <= 5 && it.i > 0 && x >= x0) return { zone: 'edge', edge: 'in', it, T, x };
      if (Math.abs(x - x1) <= 5 && x <= x1) return { zone: 'edge', edge: 'out', it, T, x };
      if (Math.abs(x - x0) <= 5 && it.i === 0) return { zone: 'edge', edge: 'in', it, T, x };
      if (x >= x0 && x <= x1) return { zone: 'clip', it, T, x };
    }
    return { zone: 'empty', T, x };
  }
  function targets(exclude) {
    const out = [{ t: 0 }, { t: total() }, { t: P.T, kind: 'playhead' }];
    for (const x of C.layout(st.edit)) if (x.clip.id !== exclude) out.push({ t: x.start, kind: 'cut' }, { t: x.end, kind: 'cut' });
    for (const m of st.edit.markers) out.push({ t: m.t, kind: 'marker' });
    for (const n of noteMarks()) out.push({ t: n.t, kind: 'note' });
    if (st.edit.mark) out.push({ t: st.edit.mark.a }, { t: st.edit.mark.b });
    const pb = C.programBeats(st.edit, analysisMap());
    for (const b of pb.beats) out.push({ t: b, kind: 'beat' });
    return out;
  }
  const snapT = (T, e, exclude) => {
    if (e.altKey) { st.snapAt = null; return T; }
    const s = C.snap(T, targets(exclude), (8 / Math.max(1, W())) * total());
    st.snapAt = s.snapped ? s.t : null;
    return s.t;
  };
  function trackDown(e) {
    if (!st.edit || e.button === 2) return;
    host.refs.root.focus({ preventScroll: true }); // keys (S, Del, Q…) go to Video Review
    const h = hit(e);
    const start = st.edit;
    refs.canvas.setPointerCapture(e.pointerId);
    let moved = false;
    const x0 = e.clientX;
    const wasPlaying = P.playing;
    if (h.zone === 'ruler' || h.zone === 'empty') {
      pause(); seek(h.T);
      const mv = (ev) => seek(snapT(hit(ev).T, ev));
      refs.canvas.addEventListener('pointermove', mv);
      refs.canvas.addEventListener('pointerup', () => { refs.canvas.removeEventListener('pointermove', mv); st.snapAt = null; draw(); }, { once: true });
      return;
    }
    if (h.zone === 'edge' || h.zone === 'fade') { st.sel = new Set([h.it.clip.id]); paintHead(); }
    const id = h.it.clip.id;
    const L0 = C.layout(start);
    const mv = (ev) => {
      if (!moved && Math.abs(ev.clientX - x0) < 4) return;
      if (!moved) { moved = true; if (wasPlaying) pause(); }
      const T = hit(ev).T;
      if (h.zone === 'edge') {
        const it = L0[h.it.i];
        const P1 = snapT(T, ev, id);
        const delta = h.edge === 'in' ? P1 - it.start : P1 - it.end;
        st.drag = { kind: 'trim', id, preview: C.trim(start, id, h.edge, delta) };
      } else if (h.zone === 'fade') {
        const it = L0[h.it.i];
        const len = h.edge === 'in' ? T - it.start : it.end - T;
        st.drag = { kind: 'fade', id, preview: C.setFade(start, id, h.edge, len) };
      } else {
        // reorder: the gap between clips nearest to the pointer
        let to = L0.findIndex((x) => T < (x.start + x.end) / 2);
        if (to < 0) to = L0.length;
        st.drag = { kind: 'move', id, to, preview: null };
      }
      draw();
    };
    refs.canvas.addEventListener('pointermove', mv);
    refs.canvas.addEventListener('pointerup', (ev) => {
      refs.canvas.removeEventListener('pointermove', mv);
      const d = st.drag; st.drag = null; st.snapAt = null;
      if (!moved) {
        // a click: select (Shift adds) and put the playhead there
        if (e.shiftKey) { if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id); } else st.sel = new Set([id]);
        paintHead(); draw();
        if (h.zone === 'clip') seek(h.T);
        return;
      }
      if (d?.kind === 'move') { const i = L0.findIndex((x) => x.clip.id === id); if (d.to !== i && d.to !== i + 1) commit(C.move(start, id, d.to), 'Clip moved'); else draw(); }
      else if (d?.preview) commit(d.preview, d.kind === 'fade' ? 'Fade' : 'Trimmed');
      else draw();
      void ev;
    }, { once: true });
  }
  function trackHover(e) {
    if (st.drag || e.buttons) return;
    const h = hit(e);
    const cur = h.zone === 'edge' ? 'col-resize' : h.zone === 'fade' ? 'ew-resize' : h.zone === 'clip' ? 'grab' : 'pointer';
    if (refs.canvas.style.cursor !== cur) refs.canvas.style.cursor = cur;
  }
  function trackMenu(e) {
    e.preventDefault();
    const h = hit(e);
    if (h.zone !== 'clip' && h.zone !== 'edge' && h.zone !== 'fade') { moreMenu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) }); return; }
    const c = h.it.clip;
    if (!st.sel.has(c.id)) { st.sel = new Set([c.id]); paintHead(); draw(); }
    clipMenu(c, h.T, e.clientX, e.clientY);
  }
  function clipMenu(c, T, x, y) {
    const ids = [...st.sel];
    const sub = (items) => () => setTimeout(() => showMenu(x, y, items), 0);
    showMenu(x, y, [
      { label: 'Split here (S)', action: () => commit(C.split(st.edit, T), 'Split') },
      { label: 'Delete, leave a gap (Del)', action: () => del(false) },
      { label: 'Ripple delete (Shift+Del)', action: () => del(true) },
      { label: 'Duplicate (D)', action: () => commit(C.duplicate(st.edit, c.id), 'Duplicated') },
      c.kind === 'video' ? { label: `${c.mute ? 'Unmute' : 'Mute'} the sound (A)`, action: () => commit(C.setMute(st.edit, ids), c.mute ? 'Sound on' : 'Muted') } : null,
      c.kind === 'video' ? { label: `Speed: ${c.speed || 1}× ▸`, action: sub(C.SPEEDS.map((s) => ({ label: `${(c.speed || 1) === s ? '✓ ' : '   '}${s}×${s === 1 ? ' (normal)' : ''}`, action: () => setSpeed(s) }))) } : null,
      { label: `Fade in: ${c.fadeIn ? `${c.fadeIn.toFixed(2)} s` : 'off'} ▸`, action: sub([0, 0.25, 0.5, 1, 2].map((s) => ({ label: s ? `${s} s` : 'Off', action: () => commit(C.setFade(st.edit, ids, 'in', s), s ? `Fade in ${s} s` : 'No fade in') }))) },
      { label: `Fade out: ${c.fadeOut ? `${c.fadeOut.toFixed(2)} s` : 'off'} ▸`, action: sub([0, 0.25, 0.5, 1, 2].map((s) => ({ label: s ? `${s} s` : 'Off', action: () => commit(C.setFade(st.edit, ids, 'out', s), s ? `Fade out ${s} s` : 'No fade out') }))) },
      { label: 'Trim the start to the playhead (Q)', action: () => commit(C.trimTo(st.edit, P.T, 'in'), 'Trimmed') },
      { label: 'Trim the end to the playhead (W)', action: () => commit(C.trimTo(st.edit, P.T, 'out'), 'Trimmed') },
      c.kind !== 'gap' && c.kind !== 'title' ? { label: 'Freeze frame at the playhead (Shift+F)', action: () => freezeHere() } : null,
      c.kind === 'title' ? { label: 'Edit the title…', action: () => editTitle(c) } : null,
      c.src ? { more: true, label: 'Open the source in Review', action: () => { leave(); R().open(c.src); } } : null,
      c.src ? { more: true, label: 'Show the source file', action: () => window.hub.fs.reveal(c.src) } : null,
    ].filter(Boolean));
  }

  // ---------- actions ----------
  const selIds = () => [...st.sel].filter((id) => st.edit.clips.some((c) => c.id === id));
  const underHead = () => C.at(st.edit, Math.min(P.T, Math.max(0, total() - 1e-4)))?.clip || null;
  const targetIds = () => (selIds().length ? selIds() : underHead() ? [underHead().id] : []);
  function split(T = P.T) {
    const next = C.split(st.edit, T);
    if (next === st.edit) { host.flash('Nothing to split here'); return false; }
    commit(next, '✂ Split');
    const after = C.at(st.edit, T + 1e-3);
    if (after) st.sel = new Set([after.clip.id]);
    paintHead(); draw();
    return true;
  }
  function del(ripple) {
    const mk = st.edit.mark;
    if (!selIds().length && mk) { const n = C.removeRange(st.edit, mk.a, mk.b, { ripple }); n.mark = null; commit(n, ripple ? 'In–out removed' : 'In–out lifted'); return true; }
    const ids = targetIds();
    if (!ids.length) return false;
    commit(C.remove(st.edit, ids, { ripple }), ripple ? 'Ripple delete' : 'Deleted (gap left)');
    st.sel.clear(); paintHead(); draw();
    return true;
  }
  function setSpeed(s) {
    const ids = targetIds().filter((id) => st.edit.clips.find((c) => c.id === id)?.kind === 'video');
    if (!ids.length) return null;
    const v = clamp(Number(s) || 1, 0.25, 4);
    commit(C.setSpeed(st.edit, ids, v), `${v}×`);
    return v;
  }
  function nudgeSpeed(dir) {
    const c = st.edit.clips.find((x) => x.id === targetIds()[0]);
    if (!c || c.kind !== 'video') return null;
    const i = C.SPEEDS.indexOf(C.nearestSpeed(c.speed || 1));
    return setSpeed(C.SPEEDS[clamp(i + dir, 0, C.SPEEDS.length - 1)]);
  }
  function freezeHere(dur = 1) { const n = C.freeze(st.edit, P.T, dur); if (n === st.edit) { host.flash('No picture to freeze here'); return false; } commit(n, '❄ Freeze frame'); return true; }
  async function titleImage(text, { bg = '#000000', fg = '#ffffff' } = {}) {
    const m = host.S.meta[st.path] || {};
    const w = m.w || host.refs.video.videoWidth || 1080; const h = m.h || host.refs.video.videoHeight || 1920;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = String(text).split(/\n|\\n/).slice(0, 4);
    let size = Math.round(Math.min(w, h) * 0.11);
    g.font = `700 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
    while (size > 12 && Math.max(...lines.map((l) => g.measureText(l).width)) > w * 0.86) { size -= 2; g.font = `700 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`; }
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.2));
    return window.hub.saveAttachment(`title-${Date.now().toString(36)}.png`, c.toDataURL('image/png').split(',')[1]);
  }
  async function addTitle(text = 'Title', dur = 2, T = P.T) {
    const img = await titleImage(text);
    commit(C.title(st.edit, T, { text, dur, img }), 'Title card');
    return true;
  }
  async function editTitle(c) {
    const v = await Modal.prompt('Title card', { value: c.text || '', label: 'The words on the card (a new line: \\n).' });
    if (v == null || !v.trim()) return;
    const img = await titleImage(v.trim(), { bg: c.bg, fg: c.fg });
    const n = C.copy(st.edit); const x = n.clips.find((y) => y.id === c.id); if (x) { x.text = v.trim(); x.img = img; }
    commit(n, 'Title changed');
  }
  function marker(label = '') { commit(C.addMarker(st.edit, P.T, label), `Marker ${st.edit.markers.length + 1}`); return true; }
  function setMark(a, b) {
    const n = C.copy(st.edit);
    if (a == null) n.mark = null;
    else { const lo = clamp(Math.min(a, b ?? total()), 0, total()); const hi = clamp(Math.max(a, b ?? total()), 0, total()); n.mark = hi - lo > 0.02 ? { a: lo, b: hi } : null; }
    commit(n, n.mark ? `In–out ${fmt(n.mark.a)} → ${fmt(n.mark.b)}` : 'In–out cleared');
    return n.mark;
  }
  const jumpCut = (dir) => { const list = [0, ...C.cuts(st.edit), total()]; const t = dir > 0 ? list.find((x) => x > P.T + 1e-3) : [...list].reverse().find((x) => x < P.T - 1e-3); if (t != null) seek(t, { play: false }); return t; };
  const jumpBeat = (dir) => { const b = C.programBeats(st.edit, analysisMap()).beats; const t = dir > 0 ? b.find((x) => x > P.T + 0.01) : [...b].reverse().find((x) => x < P.T - 0.01); if (t != null) seek(t, { play: false }); return t; };
  function step(n) { pause(); const f = progFps(); seek((V.frameAt(P.T, f) + n + 0.5) / f, { play: false }); }
  // Auto-cut: a suggestion first (dashed lines + Apply), nothing changes until you accept it.
  function suggest(mode = 'bars') {
    if (mode === 'off') { st.suggest = null; draw(); paintHead(); return null; }
    if (mode === 'apply') return acceptSuggestion();
    const have = [0, total(), ...C.cuts(st.edit)];
    const times = mode === 'markers'
      ? [...new Set([...st.edit.markers.map((m) => m.t), ...noteMarks().map((n) => n.t)])].filter((t) => have.every((h) => Math.abs(h - t) > 0.05)).sort((a, b) => a - b)
      : C.suggest(st.edit, analysisMap(), mode);
    st.suggest = { mode, times };
    draw(); paintHead();
    return times;
  }
  function acceptSuggestion() {
    const s = st.suggest;
    if (!s?.times.length) { st.suggest = null; paintHead(); draw(); return 0; }
    commit(C.splitMany(st.edit, s.times), `✂ ${s.times.length} cuts`);
    st.suggest = null; paintHead(); draw();
    return s.times.length;
  }
  function closeGaps() { const ids = st.edit.clips.filter((c) => c.kind === 'gap').map((c) => c.id); if (!ids.length) return 0; commit(C.remove(st.edit, ids, { ripple: true }), 'Gaps closed'); return ids.length; }
  function reset() { const d = srcDur(st.path); if (!d) return false; commit(C.fromSource(st.path, d), 'Back to the whole video'); return true; }
  async function durationOf(p) {
    const m = host.S.meta[p];
    if (m?.d) return m.d;
    const d = document.createElement('video'); d.preload = 'metadata'; d.muted = true; d.src = host.fileUrl(p);
    const out = await new Promise((res) => { d.onloadedmetadata = () => res(d.duration); d.onerror = () => res(0); setTimeout(() => res(0), 8000); });
    if (out) host.S.meta[p] = { ...(m || {}), w: d.videoWidth, h: d.videoHeight, d: out };
    d.removeAttribute('src'); d.load();
    return out;
  }
  // Add a video (or a part of it) to the cut: at the end, or at the cut nearest a program time.
  async function addClip(path, { a = 0, b = null, at = null } = {}) {
    if (!st.edit) return false;
    const d = await durationOf(path);
    if (!d) { toast(`Can't read ${base(path)} as a video`, { type: 'error' }); return false; }
    const clip = C.videoClip(path, clamp(a, 0, d), clamp(b ?? d, 0, d), d);
    if (clip.out - clip.in < 0.02) return false;
    let n;
    if (at == null || at >= total() - 1e-3) n = C.append(st.edit, path, clip.in, clip.out, d);
    else {
      const edges = [0, ...C.cuts(st.edit), total()];
      const T = edges.reduce((p, q) => (Math.abs(q - at) < Math.abs(p - at) ? q : p));
      n = C.insertAt(st.edit, T, clip);
    }
    commit(n, `Added ${noExt(base(path))}`);
    return true;
  }

  // ---------- keys (only while editing) ----------
  const SWALLOW = new Set(['n', 'p', 'y', 'c', '\\']); // Review keys that act on the source video, not the edit
  function onKey(e) {
    if (!st.on) return false;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { if (e.shiftKey) redo(); else undo(); return true; }
    if (mod && k === 'y') { redo(); return true; }
    if (mod && k === 'd') { const id = targetIds()[0]; if (id) commit(C.duplicate(st.edit, id), 'Duplicated'); return true; }
    if (mod || e.altKey) return false;
    const act = {
      ' ': () => (P.playing ? pause() : startPlay()), k: () => shuttle(0), l: () => shuttle(1), j: () => shuttle(-1),
      arrowleft: () => step(e.shiftKey ? -10 : -1), arrowright: () => step(e.shiftKey ? 10 : 1),
      arrowup: () => jumpCut(-1), arrowdown: () => jumpCut(1), home: () => seek(0, { play: false }), end: () => seek(total(), { play: false }),
      ',': () => jumpBeat(-1), '.': () => jumpBeat(1),
      s: () => split(), delete: () => del(e.shiftKey), backspace: () => del(e.shiftKey),
      q: () => commit(C.trimTo(st.edit, P.T, 'in'), 'Start trimmed to the playhead'), w: () => commit(C.trimTo(st.edit, P.T, 'out'), 'End trimmed to the playhead'),
      d: () => { const id = targetIds()[0]; if (id) commit(C.duplicate(st.edit, id), 'Duplicated'); },
      a: () => { const ids = targetIds(); if (ids.length) commit(C.setMute(st.edit, ids), 'Sound toggled'); },
      '[': () => nudgeSpeed(-1), ']': () => nudgeSpeed(1), m: () => marker(),
      i: () => setMark(P.T, st.edit.mark?.b ?? total()), o: () => setMark(st.edit.mark?.a ?? 0, P.T), x: () => setMark(null),
      enter: () => acceptSuggestion(), e: () => leave(),
      escape: () => { if (st.suggest) suggest('off'); else if (st.sel.size) { st.sel.clear(); paintHead(); draw(); } else leave(); },
      '?': () => help(),
    };
    if (e.shiftKey && k === 'f') { freezeHere(); return true; }
    if (e.shiftKey && k === 't') { addTitle(); return true; }
    if (e.shiftKey && k === 'l') return false;
    const fn = act[k];
    if (fn) { fn(); return true; }
    if (SWALLOW.has(k)) { host.flash('Notes, picker and compare work on the source: E leaves the cut'); return true; }
    return false;
  }
  const KEYS = [
    ['E / Esc', 'Edit clips on / off'], ['Space · J K L', 'Play the edit · shuttle'], ['← / →', 'One frame (Shift: 10)'], ['↑ / ↓', 'Previous / next cut'], [', / .', 'Previous / next beat'],
    ['S', 'Split at the playhead'], ['Del', 'Delete the clip (leaves a gap)'], ['Shift+Del', 'Ripple delete (closes the gap; with I/O and nothing selected: the range)'],
    ['Q / W', 'Trim the clip\'s start / end to the playhead'], ['D', 'Duplicate'], ['A', 'Mute the clip\'s sound'], ['[ / ]', 'Clip speed slower / faster (0.25–4×, pitch kept)'],
    ['I / O · X', 'In / out of the range (export, play, remove) · clear'], ['M', 'Marker at the playhead'], ['Shift+F', 'Freeze frame (1 s)'], ['Shift+T', 'Title card (2 s)'],
    ['Enter', 'Accept the auto-cut suggestion'], [`${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'}+Z / Shift+Z`, 'Undo / redo'],
    ['Drag', 'An edge trims (snaps to beats, cuts, markers, playhead; Alt: free) · the body reorders · the gold squares fade'], ['Drop', 'Videos or library cards on the track add clips'],
  ];
  function help() { Modal.alert('Cut: clip editing', KEYS.map(([k, d]) => `${k.padEnd(14)} ${d}`).join('\n')); }

  // ---------- menus ----------
  function moreMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const sub = (items) => () => setTimeout(() => showMenu(r.left, r.bottom + 4, items), 0);
    showMenu(Math.max(8, r.right - 300), r.bottom + 4, [
      { label: '✂ Auto-cut on the music ▸', action: sub(Object.entries(SUGGEST_LABEL).map(([k, l]) => ({ label: `Cut ${l}`, action: () => suggest(k) }))) },
      { label: 'Freeze frame here (Shift+F)', action: () => freezeHere() },
      { label: 'Title card here (Shift+T)…', action: async () => { const v = await Modal.prompt('Title card', { value: '', label: 'The words on the card (a new line: \\n). 2 seconds, inserted at the playhead.' }); if (v?.trim()) addTitle(v.trim()); } },
      { label: 'Marker here (M)', action: () => marker() },
      st.edit.clips.some((c) => c.kind === 'gap') ? { label: 'Close the gaps', action: closeGaps } : null,
      { label: 'Add a video…', action: async () => { const [p] = await window.hub.openDialog({ filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] }] }); if (p) addClip(p); } },
      { label: 'Undo', action: undo }, { label: 'Redo', action: redo },
      { more: true, label: 'Copy the edit list', action: () => copyText(C.describe(st.edit).join('\n'), 'Edit list copied') },
      { more: true, label: 'Back to the whole video', danger: true, action: reset },
      { more: true, label: 'Keys (?)', action: help },
    ].filter(Boolean));
  }
  function exportMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const mk = st.edit?.mark;
    const P0 = (id) => V.EXPORT_PRESETS.find((p) => p.id === id);
    const socials = ['tiktok', 'reels', 'shorts', 'feed45', 'square', 'yt1080'];
    showMenu(Math.max(8, r.right - 320), r.bottom + 4, [
      { label: `⇪ Export the cut${mk ? ' (in–out)' : ''} as a new version`, action: () => exportCut({}) },
      ...socials.map((id) => ({ label: `${P0(id).name} · ${P0(id).w}×${P0(id).h}`, action: () => exportCut({ preset: id }) })),
      { label: 'All 4 socials (9:16 · 4:5 · 1:1 · 16:9)', action: () => exportAll() },
      { more: true, label: 'All 4 socials, blurred fill', action: () => exportAll({ fit: 'blur' }) },
      { more: true, label: 'GIF loop', action: () => exportCut({ preset: 'gif' }) },
      { more: true, label: 'PNG stills (every frame)', action: () => exportCut({ stills: true }) },
      { more: true, label: 'WebM (VP9)', action: () => exportCut({ preset: 'webm' }) },
      { more: true, label: 'ProRes 422 HQ master', action: () => exportCut({ preset: 'master' }) },
    ]);
  }

  // ---------- export ----------
  const probes = new Map();
  async function infoOf(p) {
    if (probes.has(p)) return probes.get(p);
    const m = host.S.meta[p] || {};
    let pr = null;
    try { pr = await window.hub.video.probe(p, { ffmpeg: H.settings().ffmpegPath || undefined }); } catch { /* no ffprobe */ }
    const out = { w: pr?.w || m.w, h: pr?.h || m.h, fps: pr?.fps || m.fps || 30, audio: pr ? Boolean(pr.audio) : true };
    probes.set(p, out);
    return out;
  }
  function nextVersionPath(p) {
    const dir = dirOf(p); const name = noExt(base(p));
    const vi = V.versionInfo(base(p));
    const nums = R().versionsOf({ path: p }).map((x) => V.versionInfo(base(x.path)).ver).filter((n) => n != null);
    const next = Math.max(vi.ver ?? 1, ...nums) + 1;
    const m = name.match(/^(.*?)(\d+)$/);
    const stem = vi.ver != null && m ? m[1] : `${name}_v`;
    const width = vi.ver != null && m ? m[2].length : 1;
    return join(dir, `${stem}${String(next).padStart(width, '0')}.mp4`);
  }
  // Renders the cut with ffmpeg. preset: a VideoData preset id (social sizes, gif, webm, master) or none (same size,
  // high quality, saved as the next version next to the video); stills: a PNG per frame.
  async function exportCut({ preset = null, fit = 'crop', stills = false, out } = {}) {
    if (!st.edit?.clips.length) throw new Error('The cut is empty');
    const tools = host.S.tools || (host.S.tools = await window.hub.video.tools({ ffmpeg: H.settings().ffmpegPath || undefined }));
    if (!tools.ffmpeg) { toast(`ffmpeg isn't installed, so the cut can't be rendered here. ${tools.hint}.`, { type: 'error', timeout: 9000 }); return null; }
    const p = preset ? V.EXPORT_PRESETS.find((x) => x.id === preset) : null;
    if (preset && !p) throw new Error(`Unknown preset “${preset}”. Try /presets.`);
    // title cards need their pictures
    for (const c of st.edit.clips) if (c.kind === 'title' && !c.img) c.img = await titleImage(c.text || 'Title', c);
    const info = {};
    for (const s of C.sources(st.edit)) info[s] = await infoOf(s);
    const main = info[st.path] || Object.values(info)[0] || { w: 1080, h: 1920, fps: 30 };
    const canvas = { w: main.w || 1080, h: main.h || 1920, fps: main.fps || 30 };
    const g = C.ffmpegArgs(st.edit, info, canvas, { preset: p, fit, offset: host.S.overlay.cropOffset, range: st.edit.mark, stills, presetFilters: V.presetFilters, codecArgs: V.codecArgs });
    const stem = noExt(base(st.path));
    const output = out || (stills ? join(dirOf(st.path), 'exports', `${stem}_cut_stills`, 'frame_%05d.png')
      : p ? join(dirOf(st.path), 'exports', `${stem}_cut_${p.id}${g.w && g.h ? `_${g.w}x${g.h}` : ''}.${g.ext}`) : nextVersionPath(st.path));
    const label = stills ? 'Cut → PNG stills' : `Cut → ${p ? p.name : base(output)}`;
    const job = await host.startJob({ label, input: g.inputs[0] || st.path, output, args: [...g.args, 'OUTPUT'], duration: g.duration, library: !stills });
    if (job) emit('export', { output, preset: preset || 'cut' });
    return job;
  }
  async function exportAll({ fit = 'crop' } = {}) {
    const outs = [];
    for (const id of ['reels', 'feed45', 'square', 'yt1080']) { const j = await exportCut({ preset: id, fit }); if (!j) break; outs.push(j.output); await j.done; }
    return outs;
  }

  // ---------- entering / leaving ----------
  async function enter() {
    if (!host || !host.S.cur) { toast('Open a video first', { type: 'error' }); return false; }
    await loadCuts();
    if (!host.refs.video.duration) await R().waitReady();
    const fresh = st.path !== host.S.cur.path || !st.edit;
    if (fresh) { st.path = host.S.cur.path; st.edit = editOf(st.path); st.undo = []; st.redo = []; st.sel.clear(); st.suggest = null; }
    R().pause();
    st.on = true;
    host.refs.main.classList.add('cutting');
    host.refs.stage.classList.add('cutting');
    refs.root.hidden = false;
    refs.btn?.classList.add('on');
    P.rate = 1; P.idx = -1;
    lastTime = '';
    requestAnimationFrame(() => { measure(); draw(); placeHead(); });
    paintHead();
    // start where the source playhead is, when that frame is in the edit
    const t0 = fresh ? (C.programTimes(st.edit, st.path, host.refs.video.currentTime)[0] ?? 0) : P.T;
    await seek(t0, { play: false });
    emit('mode', { on: true });
    return true;
  }
  function leave() {
    if (!st.on) return false;
    pause();
    st.on = false;
    host.refs.main.classList.remove('cutting');
    host.refs.stage.classList.remove('cutting');
    refs.root.hidden = true;
    refs.btn?.classList.remove('on');
    for (const e of els()) { e.pause(); }
    // the source picks up where the edit was
    const x = C.at(st.edit, P.T);
    if (x?.clip.src === st.path && x.srcTime != null) R().seek(x.srcTime);
    host.refs.timeTotal.textContent = '';
    emit('mode', { on: false });
    return true;
  }
  const toggle = (on) => ((on ?? !st.on) ? enter() : leave());
  // Review opened another video: the edit follows it.
  function onOpen({ path }) {
    if (!st.on) { st.edit = null; return; }
    if (path === st.path) return;
    pause();
    st.on = false;
    R().waitReady().then(() => enter());
  }

  // ---------- mount (called by Review.mount) ----------
  function measure() { if (!refs.track) return; const r = refs.track.getBoundingClientRect(); refs.sizes = { w: r.width, h: r.height }; }
  function mount(h) {
    host = h;
    const r = h.refs;
    // program monitor: inside the frame, under the overlays
    refs.pa = el('video', { class: 'vr-p', playsInline: true, preload: 'auto' });
    refs.pb = el('video', { class: 'vr-p', playsInline: true, preload: 'auto' });
    refs.pimg = el('img', { class: 'vr-p vr-pimg', alt: '' });
    refs.pfade = el('div', { class: 'vr-pfade' }, refs.pa, refs.pb, refs.pimg);
    refs.pwrap = el('div', { class: 'vr-pwrap' }, refs.pfade);
    r.cmp.after(refs.pwrap);
    // the clip track (replaces the source timeline while editing)
    refs.canvas = el('canvas', { class: 'vr-cut-cv' });
    refs.head = el('div', { class: 'vr-cut-ph' });
    refs.track = el('div', { class: 'vr-cut-track', title: 'Click: playhead + select · drag an edge: trim · drag a clip: move · right-click: clip menu · drop videos to add' }, refs.canvas, refs.head);
    refs.sum = el('span', { class: 'vr-cut-sum' });
    refs.sugText = el('span');
    refs.sug = el('span', { class: 'vr-cut-sug', hidden: true }, refs.sugText,
      el('button', { class: 'primary small', text: 'Apply ⏎', title: 'Make these cuts (Enter)', on: { click: acceptSuggestion } }),
      el('button', { class: 'ghost small', text: '✕', title: 'Dismiss (Esc)', on: { click: () => suggest('off') } }));
    const ico = (text, title, fn, cls = '') => el('button', { class: `vr-ico ${cls}`, text, title, on: { click: fn } });
    refs.undoBtn = ico('↶', 'Undo (⌘/Ctrl+Z)', undo);
    refs.root = el('div', { class: 'vr-cut', hidden: true },
      el('div', { class: 'vr-cut-headrow' },
        el('b', { class: 'vr-cut-title', text: '✂ Cut' }), refs.sum, refs.sug, el('span', { class: 'spacer' }), refs.undoBtn,
        el('button', { class: 'vr-ico vr-cut-export', text: '⇪ Export', title: 'Render the cut with ffmpeg: a new version, a social format, GIF, stills', on: { click: (e) => exportMenu(e.currentTarget) } }),
        ico('⋯', 'Auto-cut on the music, freeze frame, title card, markers, add a video…', (e) => moreMenu(e.currentTarget)),
        ico('✕', 'Back to the review (E)', () => leave())),
      refs.track);
    r.tlBox.after(refs.root);
    refs.canvas.addEventListener('pointerdown', trackDown);
    refs.canvas.addEventListener('pointermove', trackHover);
    refs.canvas.addEventListener('contextmenu', trackMenu);
    refs.canvas.addEventListener('dblclick', (e) => { const h0 = hit(e); if (h0.it?.clip.kind === 'title') editTitle(h0.it.clip); });
    new ResizeObserver(() => { measure(); draw(); placeHead(); }).observe(refs.track);
    // drop videos (files or library cards) on the track
    refs.root.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/x-hearth-video')) { e.preventDefault(); refs.root.classList.add('drop'); } });
    refs.root.addEventListener('dragleave', () => refs.root.classList.remove('drop'));
    refs.root.addEventListener('drop', async (e) => {
      e.preventDefault(); refs.root.classList.remove('drop');
      const at = tOf(e.clientX - refs.canvas.getBoundingClientRect().left);
      const paths = [e.dataTransfer.getData('text/x-hearth-video'), ...[...e.dataTransfer.files].map((f) => window.hub.pathForFile?.(f))].filter((p) => p && /\.(mp4|m4v|mov|webm|mkv)$/i.test(p));
      for (const p of paths) await addClip(p, { at });
    });
    // ✂ in the transport
    refs.btn = el('button', { class: 'vr-ico vr-cut-btn', text: '✂', title: 'Cut clips: split, trim, reorder, speed, fades… then export (E)', on: { click: () => toggle() } });
    r.toolGroup?.prepend(refs.btn);
    R().on('open', onOpen);
    R().on('audio', () => { if (st.on) draw(); });
    R().on('note', () => { if (st.on) draw(); });
    loadCuts().then(() => R().refreshCard?.());
  }

  // ---------- for Review (tick, status) and the commands ----------
  function frame() { if (st.on) paintTime(); }
  function statusOf(p) {
    const e = p === st.path && st.edit ? st.edit : cuts?.[p] ? C.normalize(cuts[p]) : null;
    if (!e) return null;
    return { clips: e.clips.length, seconds: Number(C.total(e).toFixed(2)), editing: st.on && p === st.path, list: C.describe(e).slice(0, 12) };
  }
  // The Lab (or a command) sends a clip: added to the cut of the video open in Video Review, or opens it.
  async function receive(path, { a = 0, b = null } = {}) {
    await R().ensureMounted();
    activate('tool:ae');
    if (!host.S.cur) { await R().open(path); await R().waitReady(); }
    if (!st.on) await enter();
    if (st.edit.clips.length === 1 && st.edit.clips[0].src === path && C.isIdentity(st.edit, path, srcDur(path)) && (a > 0 || b != null)) {
      const d = await durationOf(path);
      commit(C.slice(C.fromSource(path, d), a, b ?? d), 'Clip from the Lab');
      return true;
    }
    return addClip(path, { a, b });
  }

  return {
    mount, onKey, frame, enter, leave, toggle, statusOf, hasCut, receive, on: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    get active() { return st.on; }, get edit() { return st.edit; }, get path() { return st.path; }, get time() { return P.playing ? nowT() : P.T; }, get playing() { return P.playing; },
    get selection() { return selIds(); }, get suggestion() { return st.suggest ? { ...st.suggest } : null; }, get canUndo() { return st.undo.length > 0; },
    play: startPlay, pause, togglePlay: () => (P.playing ? pause() : startPlay()), seek: (t) => seek(t, { play: P.playing }), step, shuttle, goto: (t) => seek(t, { play: false }),
    split, del, closeGaps, setSpeed, nudgeSpeed, freezeHere, addTitle, marker, setMark, suggest, acceptSuggestion, reset, addClip, undo, redo, help, exportCut, exportAll, jumpCut, jumpBeat,
    select(i) { const c = st.edit?.clips[i]; if (!c) return null; st.sel = new Set([c.id]); paintHead(); draw(); const x = C.layout(st.edit)[i]; seek(x.start, { play: false }); return c; },
    commit, mute: (on) => { const ids = targetIds(); if (!ids.length) return null; commit(C.setMute(st.edit, ids, on), 'Sound toggled'); return st.edit.clips.find((c) => c.id === ids[0])?.mute; },
    fade: (edge, s) => { const ids = targetIds(); if (!ids.length) return null; commit(C.setFade(st.edit, ids, edge, s), `Fade ${edge}`); return true; },
    trimTo: (edge) => commit(C.trimTo(st.edit, P.T, edge), 'Trimmed'),
    duplicate: () => { const id = targetIds()[0]; return id ? commit(C.duplicate(st.edit, id), 'Duplicated') : false; },
    move: (from, to) => { const c = st.edit?.clips[from]; return c ? commit(C.move(st.edit, c.id, to), 'Clip moved') : false; },
    describe: () => (st.edit ? C.describe(st.edit) : []),
    _test: { P, st, draw, nowT },
  };
})();
