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
  const FX = EditFX;
  const IS_MAC = /Mac/.test(navigator.platform);
  // small preferences in localStorage (this module's own store() saves the edits)
  const pref = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not critical */ } } };
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
  const st = { on: false, path: null, edit: null, sel: new Set(), undo: [], redo: [], suggest: null, drag: null, snapAt: null, view: null, alt: false, razor: false, snap: true, hoverX: null };
  let cuts = null; // kv video-cuts: { [video path]: edit }
  const refs = {};
  const listeners = {};
  const emit = (ev, d) => { for (const fn of listeners[ev] || []) { try { fn(d); } catch (err) { console.error(err); } } };

  // ---------- storage + history ----------
  // an edit made just before a reload / quit (a cut, then ⌘Q) used to be lost with the pending save: written at unload
  let pendingSave = false;
  const writeCuts = debounce(() => { pendingSave = false; window.hub.kvSet('video-cuts', cuts); }, 400);
  const saveCuts = () => { pendingSave = true; writeCuts(); };
  addEventListener('beforeunload', () => { if (pendingSave && cuts) { pendingSave = false; window.hub.kvSet('video-cuts', cuts); } });
  // leaving Video Review (the board, the Lab, a chat) pauses the edit: it played on unseen, sound and compositor included
  addEventListener('hearth:view', () => { try { if (st.on && P.playing && H.surfaceIdFor(H.activeId) !== 'tool:ae') pause(); } catch { /* not mounted yet */ } });
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
    if (!isSeq(path) && !C.isRich(e) && C.isIdentity(e, path, srcDur(path)) && !e.mark) delete cuts[path]; else { const { lastItem: _l, ...keep } = e; cuts[path] = keep; }
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
    for (const id of [...st.sel]) if (!C.find(next, id)) st.sel.delete(id);
    store(st.path, next);
    if (P.T > total()) P.T = total();
    if (st.view && st.view.t1 > total()) st.view = null;
    fitTrackHeight();
    // after a menu pick the focus fell to the page: the editor's keys keep working
    if (st.on && document.activeElement === document.body) host.refs.root.focus({ preventScroll: true });
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
  // The program's frame: the sequence's when set (a format / template), else the video's own.
  const isSeq = (p = st.path) => String(p || '').startsWith('seq:');
  const mainSrc = (e = st.edit) => (isSeq() ? e?.clips.find((c) => c.src)?.src || C.tracksOf(e || C.empty(), 'video').flatMap((k) => k.items).find((x) => x.src)?.src : st.path);
  const progFps = () => st.edit?.seq?.fps || (mainSrc() ? fpsOf(mainSrc()) : 30);
  function frameSize(e = st.edit) {
    if (e?.seq?.w) return { W: e.seq.w, H: e.seq.h, F: e.seq.fps || progFps() };
    const m = host?.S.meta[mainSrc(e)] || {};
    const v = host?.refs.video;
    return { W: m.w || (mainSrc(e) === host?.S.cur?.path && v?.videoWidth) || 1080, H: m.h || (mainSrc(e) === host?.S.cur?.path && v?.videoHeight) || 1920, F: progFps() };
  }
  // Rich edits (layers, transitions, keyframes, looks, a set format…) play through the compositor (video-comp.js).
  const rich = () => Boolean(st.edit && C.isRich(st.edit));
  let richOn = false;
  function syncRich() {
    const on = st.on && rich();
    if (on !== richOn) {
      richOn = on;
      if (on) { for (const e0 of els()) e0.pause(); P.fadeAnim?.cancel(); refs.pfade.style.opacity = ''; show('none'); }
      refs.pwrap?.classList.toggle('rich', on);
      VideoComp.show(on);
    }
    // the frame takes the program's shape
    if (st.on) {
      const { W, H } = frameSize();
      const ar = String(W / H || 9 / 16);
      if (host.refs.stage.style.getPropertyValue('--ar') !== ar) host.refs.stage.style.setProperty('--ar', ar);
    }
    return on;
  }
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
    // the frame actually presented after the seek (frame checks read it: frameInfo)
    el._seekId = (el._seekId || 0) + 1;
    const sid = el._seekId;
    el.currentTime = to;
    return new Promise((res) => {
      const f = () => {
        el.removeEventListener('seeked', f);
        // the next frame presented after 'seeked' is the one the seek landed on
        if (el._seekId === sid) el.requestVideoFrameCallback?.((_n, m) => { if (el._seekId === sid) { el._mt = m.mediaTime; el._mtId = sid; } });
        res();
      };
      el.addEventListener('seeked', f); setTimeout(f, 3000);
    });
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
    if (syncRich()) return seekRich(T, { play });
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
    if (play) startPlay(); else { P.playing = false; placeHead(); paintPlay(); emit('frame', { T: P.T }); }
  }
  function refreshPicture() { if (st.on) seek(P.T, { play: P.playing }); }
  // ----- rich edits: the compositor plays and draws (tools/video-comp.js) -----
  let lastCheck = null; // what the decoders showed at the last exact render (frame checks)
  async function seekRich(T, { play = false } = {}) {
    stopClock();
    VideoComp.pause();
    P.T = clamp(T, 0, total());
    placeHead(); paintTime();
    if (play) { startPlay(); return; }
    P.playing = false; paintPlay();
    const r = await VideoComp.renderExact(P.T);
    if (r) { lastCheck = r; emit('frame', r); }
  }
  function playRich() {
    P.playing = true;
    const end = st.edit.mark && P.T < st.edit.mark.b - 1e-3 ? st.edit.mark.b : total();
    VideoComp.play(P.T, { rate: P.rate, end, onEnd: (T) => { P.T = T; atEnd(); } });
    cancelAnimationFrame(P.raf);
    const tick = () => { if (!P.playing || !richOn) return; P.T = VideoComp.time; if ((loopN += 1) % 20 === 0) placeHead({ drift: true }); paintTime(); P.raf = requestAnimationFrame(tick); };
    P.raf = requestAnimationFrame(tick);
    placeHead(); paintPlay();
  }
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
    if (syncRich()) { playRich(); return; }
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
    if (richOn) { P.T = frameMid(VideoComp.pause()); seekRich(P.T); paintPlay(); return; }
    for (const e of els()) e.pause();
    P.T = nowT();
    // stop on a whole frame: the decoder goes to the middle of the frame the counter shows
    if (P.T < total() - 1e-3) { const T0 = frameMid(P.T); if (Math.abs(T0 - P.T) > 1e-4) { P.T = T0; seek(T0, { play: false }); } }
    const x = C.layout(st.edit)[P.idx];
    if (x) staticFade(x);
    placeHead(); paintTime(); paintPlay();
  }
  function stopClock() { cancelAnimationFrame(P.raf); clearTimeout(P.timer); P.timer = 0; }
  // program time now: from the decoder of a playing video clip, else the clock
  function nowT() {
    if (richOn) return P.playing ? VideoComp.time : P.T;
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

  // ---------- view (zoom) + playhead (compositor) ----------
  // The track shows view.t0 … view.t1 (Ctrl+wheel or + / − zoom, wheel scrolls, \ fits); null = the whole edit.
  const W = () => refs.sizes?.w || 0;
  function span() {
    if (st.view) return st.view;
    const D = st.drag?.preview ? Math.max(total(), C.total(st.drag.preview)) : total();
    return { t0: 0, t1: Math.max(D, 0.1) };
  }
  const xOf = (T) => { const v = span(); return ((T - v.t0) / (v.t1 - v.t0)) * W(); };
  const tOf = (x) => { const v = span(); return W() ? v.t0 + clamp(x / W(), 0, 1) * (v.t1 - v.t0) : 0; };
  function setView(t0, t1) {
    const D = Math.max(total(), 0.1);
    const len = clamp(t1 - t0, Math.min(D, 4 / progFps()), D);
    if (len >= D - 1e-6) st.view = null;
    else { const a = clamp(t0, 0, D - len); st.view = { t0: a, t1: a + len }; }
    draw(); placeHead();
    return st.view;
  }
  // zoom by k around program time T (k > 1 zooms in)
  function zoomBy(k, T = P.T) { const v = span(); const len = (v.t1 - v.t0) / k; const f = (T - v.t0) / (v.t1 - v.t0 || 1); return setView(T - len * f, T - len * f + len); }
  const zoomFit = () => setView(0, total());
  // keep the playhead on screen while zoomed in (pages like an NLE)
  function follow(T) {
    if (!st.view) return;
    const v = st.view; const len = v.t1 - v.t0;
    if (T > v.t1 - len * 0.02 || T < v.t0) setView(T - len * 0.05, T - len * 0.05 + len);
  }
  let headAnim = null; let headX = { x0: 0, x1: 0 };
  // drift: only a check (every 20 frames while playing); the animation restarts when it is off by more than 80 ms
  function placeHead({ drift = false } = {}) {
    if (!refs.head) return;
    const T = P.playing ? nowT() : P.T;
    if (st.view) follow(T);
    const x = xOf(T);
    const v = span();
    if (drift && headAnim && P.playing) {
      const at = headX.x0 + (headX.x1 - headX.x0) * (headAnim.effect.getComputedTiming().progress ?? 0);
      if (Math.abs(at - x) <= Math.max(2, (0.08 * P.rate * W()) / Math.max(0.1, v.t1 - v.t0))) return;
    }
    headAnim?.cancel(); headAnim = null;
    refs.head.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    if (!P.playing || !total()) return;
    const ms = ((v.t1 - T) / P.rate) * 1000;
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

  // ---------- lanes ----------
  // Top to bottom: ruler, text tracks, overlay video tracks (V3 above V2), the main track (V1), audio tracks.
  const RULER = 13;
  const LANE_H = { text: 20, video: 30, main: 46, audio: 24 };
  function lanes(e = st.edit) {
    const out = [{ kind: 'ruler', y: 0, h: RULER }];
    if (!e) return out;
    let y = RULER + 2;
    const push = (kind, track, h) => { const hh = kind === 'main' ? h : Math.round(h * (st.laneK || 1)); out.push({ kind, track, y, h: hh }); y += hh + 2; };
    for (const k of C.tracksOf(e, 'text').slice().reverse()) push('text', k, LANE_H.text);
    for (const k of C.tracksOf(e, 'video').slice().reverse()) push('video', k, LANE_H.video);
    const solo = !(e.tracks || []).length;
    const K = st.laneK || 1;
    push('main', null, solo ? Math.max(LANE_H.main * K, (refs.sizes?.h || 66) - y - 2) : LANE_H.main * K);
    for (const k of C.tracksOf(e, 'audio')) push('audio', k, LANE_H.audio);
    out.height = y;
    return out;
  }
  // the track box grows with its lanes (one style write when the count changes)
  function fitTrackHeight() {
    if (!refs.track || !st.edit) return;
    const n = (st.edit.tracks || []).length;
    const want = n || (st.laneK || 1) !== 1 ? `${Math.min(420, Math.max(66 * (st.laneK || 1), lanes().height + 2))}px` : '';
    if (refs.track.style.height !== want) { refs.track.style.height = want; measure(); }
  }
  const laneOf = (y) => lanes().find((l) => y >= l.y && y < l.y + l.h + 2) || null;
  const itemLaneY = (k) => lanes().find((l) => l.track?.id === k.id);

  // ---------- drawing the clip track (only when something changed) ----------
  const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  function noteMarks() {
    if (!st.edit || !st.path || isSeq()) return [];
    return R().notes(st.path).flatMap((n) => C.programTimes(st.edit, st.path, n.t).map((t) => ({ t, color: V.category(n.cat).color, done: n.done, text: n.text })));
  }
  const imgThumb = new Map();
  function stillOf(src) {
    let im = imgThumb.get(src);
    if (!im) { im = new Image(); im.onload = () => draw(); im.src = host.fileUrl(src); imgThumb.set(src, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  function drawStrip(g, cl, x0, y0, cw, lh, X0, X1, start, end) {
    const th = cl.kind === 'image' ? null : thumbsOf(cl.src);
    const sv = host.S.meta[cl.src];
    const im = cl.kind === 'image' ? stillOf(cl.src) : null;
    const ar = im ? im.naturalWidth / im.naturalHeight : sv?.w ? sv.w / sv.h : 9 / 16;
    const tw = Math.max(8, lh * ar);
    g.globalAlpha = 0.85;
    if (im) { for (let px = x0; px < x0 + cw; px += tw) g.drawImage(im, px, y0, tw, lh); } else if (th?.length) {
      for (let px = x0; px < x0 + cw; px += tw) {
        const T = start + ((px + tw / 2 - X0) / Math.max(1, X1 - X0)) * (end - start);
        const st0 = cl.kind === 'freeze' ? cl.at : C.srcAt(cl, T - start);
        const f = th.reduce((a, b) => (Math.abs(b.t - st0) < Math.abs(a.t - st0) ? b : a));
        g.drawImage(f.img, px, y0, tw, lh);
      }
    }
    g.globalAlpha = 1;
  }
  function drawWave(g, cl, x0, wy, cw, wh, X0, X1, color) {
    const a = analysisOf(cl.src);
    if (!a?.peaks?.length) return;
    g.fillStyle = color;
    const per = a.peaks.length / (a.duration || 1);
    const span0 = X1 - X0;
    for (let px = Math.max(0, -X0 + x0) - (x0 - X0); px < cw; px += 1) {
      const s0 = C.srcAt(cl, ((px + (x0 - X0)) / Math.max(1, span0)) * (C.durOf(cl)));
      const s1 = C.srcAt(cl, ((px + 1 + (x0 - X0)) / Math.max(1, span0)) * (C.durOf(cl)));
      const lo = Math.min(s0, s1); const hi = Math.max(s0, s1);
      let m = 0; for (let k = Math.floor(lo * per); k < Math.max(Math.floor(lo * per) + 1, Math.floor(hi * per)) && k < a.peaks.length; k += 1) m = Math.max(m, a.peaks[k] || 0);
      const hh = m * wh * 0.9; g.fillRect(x0 + px, wy + (wh - hh) / 2, 1, hh || 1);
    }
  }
  const KEY_COLORS = { opacity: '#ffffff', x: '#7fd8ff', y: '#7fd8ff', scale: '#ffd75e', rotate: '#ff8c42', volume: '#4fd18b' };
  function drawKeys(g, cl, start, top, lh) {
    if (!cl.keys) return;
    for (const [prop, list] of Object.entries(cl.keys)) for (const k of list) {
      const x = xOf(start + k.t);
      g.fillStyle = KEY_COLORS[prop] || '#fff';
      g.save(); g.translate(x, top + lh - 5); g.rotate(Math.PI / 4); g.fillRect(-3, -3, 6, 6); g.restore();
    }
  }
  function label(g, text, x, y, maxW) {
    if (maxW < 14) return;
    g.font = '10px system-ui, sans-serif'; g.textBaseline = 'top';
    const w = Math.min(maxW, g.measureText(text).width + 8);
    g.fillStyle = '#000a'; g.fillRect(x, y, w, 13);
    g.save(); g.beginPath(); g.rect(x, y, w, 13); g.clip();
    g.fillStyle = '#fff'; g.fillText(text, x + 4, y + 2);
    g.restore();
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
    const drag = st.drag;
    const edit = drag?.preview || st.edit;
    const L = C.layout(edit);
    const v = span();
    const X = xOf;
    const LN = lanes(edit);
    // ruler (time labels in timecode when zoomed in to frames)
    g.fillStyle = '#111419'; g.fillRect(0, 0, w, RULER);
    const len = v.t1 - v.t0;
    const F = progFps();
    const steps = [1 / F, 2 / F, 5 / F, 10 / F, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const stepS = steps.find((s) => (s / Math.max(len, 1e-3)) * w > 44) || 600;
    g.fillStyle = '#8a8f98'; g.font = '9px ui-monospace, Consolas, monospace'; g.textBaseline = 'top';
    for (let s = Math.ceil(v.t0 / stepS) * stepS; s <= v.t1 + 1e-6; s += stepS) {
      const x = X(s); g.fillRect(x, 0, 1, 4);
      const lab0 = stepS < 1 / F * 11 ? `f${Math.round(s * F)}` : stepS < 1 ? `${s.toFixed(2)}` : `${Math.round(s)}s`;
      g.fillText(lab0, x + 3, 2);
    }
    // in–out range
    const mk = edit.mark;
    if (mk) { g.fillStyle = '#ffd75e22'; g.fillRect(X(mk.a), 0, X(mk.b) - X(mk.a), h); g.fillStyle = '#ffd75e'; g.fillRect(X(mk.a), 0, X(mk.b) - X(mk.a), 2); g.fillRect(X(mk.a), 0, 2, RULER); g.fillRect(X(mk.b) - 2, 0, 2, RULER); }
    const mainLane = LN.find((l) => l.kind === 'main');
    const top = mainLane.y; const lh = mainLane.h;
    // the main track
    for (const x of L) {
      const cl = x.clip;
      const x0 = X(x.start); const x1 = X(x.end); const cw = Math.max(1, x1 - x0 - 1);
      if (x1 < -2 || x0 > w + 2) continue;
      const dragged = drag?.kind === 'move' && drag.id === cl.id;
      g.save();
      g.beginPath(); g.rect(x0, top, cw, lh); g.clip();
      if (cl.kind === 'gap') {
        g.fillStyle = '#0d0f12'; g.fillRect(x0, top, cw, lh);
        g.strokeStyle = '#ffffff12'; for (let k = -lh; k < cw; k += 8) { g.beginPath(); g.moveTo(x0 + k, top + lh); g.lineTo(x0 + k + lh, top); g.stroke(); }
        if (cl.slot) { g.fillStyle = '#ffd75e99'; g.font = '600 10px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(`＋ slot ${cl.slot}`, x0 + 6, top + lh / 2); }
      } else if (cl.kind === 'title') {
        g.fillStyle = cl.bg || '#000'; g.fillRect(x0, top, cw, lh);
        g.fillStyle = cl.fg || '#fff'; g.font = '600 11px system-ui, sans-serif'; g.textBaseline = 'middle';
        g.fillText(`T  ${String(cl.text || '').replace(/\n/g, ' ')}`, x0 + 6, top + lh / 2);
      } else if (cl.kind === 'color') {
        g.fillStyle = cl.fill || '#000'; g.fillRect(x0, top, cw, lh);
        label(g, `■ ${cl.fill || ''}`, x0, top, Math.min(cw, 150));
      } else if (cl.kind === 'scene') {
        // a Lab scene (the Lab's Sequence, tools/three-seq.js): its picture; it renders through the Lab
        g.fillStyle = `hsl(${hue(cl.sketch)} 40% 18%)`; g.fillRect(x0, top, cw, lh);
        const im = typeof ThreeSeq !== 'undefined' ? ThreeSeq.posterImage(cl, () => draw()) : null;
        if (im) { const iw = (im.naturalWidth / im.naturalHeight) * lh; for (let px = x0; px < x1 && px < w; px += iw) if (px + iw > 0) g.drawImage(im, px, top, iw, lh); }
        label(g, `◭ Lab scene${cl.look ? ` · ${cl.look}` : ''}`, x0, top, Math.min(cw, 220));
      } else {
        const hh = hue(cl.src);
        g.fillStyle = `hsl(${hh} 30% 16%)`; g.fillRect(x0, top, cw, lh);
        drawStrip(g, cl, x0, top, cw, lh * 0.62, x0, x1, x.start, x.end);
        if (cl.kind === 'video') drawWave(g, cl, x0, top + lh * 0.62, cw, lh * 0.38, x0, x1, cl.mute ? '#ffffff22' : `hsl(${hh} 80% 70% / .75)`);
        const tag = [cl.kind === 'freeze' ? '❄ freeze' : cl.kind === 'image' ? `▣ ${noExt(base(cl.src))}` : noExt(base(cl.src)), cl.speed && cl.speed !== 1 ? `${cl.speed}×` : '', cl.reverse ? '◀ rev' : '', cl.mute && cl.kind === 'video' ? '🔇' : '', cl.color ? `◐ ${FX.LOOK[cl.color.look]?.name || 'graded'}` : ''].filter(Boolean).join(' · ');
        label(g, tag, x0, top, Math.min(cw, 190));
      }
      if (cl.fadeIn > 0 || cl.fadeOut > 0) {
        g.fillStyle = '#000000a0';
        const fi = X(x.start + (cl.fadeIn || 0)) - x0; const fo = x1 - X(x.end - (cl.fadeOut || 0));
        if (fi > 0) { g.beginPath(); g.moveTo(x0, top); g.lineTo(x0 + fi, top); g.lineTo(x0, top + lh); g.fill(); }
        if (fo > 0) { g.beginPath(); g.moveTo(x1, top); g.lineTo(x1 - fo, top); g.lineTo(x1, top + lh); g.fill(); }
      }
      g.restore();
      if (dragged) { g.fillStyle = '#ffd75e30'; g.fillRect(x0, top, cw, lh); }
      if (st.sel.has(cl.id)) {
        g.strokeStyle = '#ffd75e'; g.lineWidth = 2; g.strokeRect(x0 + 1, top + 1, cw - 2, lh - 2); g.lineWidth = 1;
        g.fillStyle = '#ffd75e';
        for (const fx of [X(x.start + (cl.fadeIn || 0)), X(x.end - (cl.fadeOut || 0))]) g.fillRect(clamp(fx, x0 + 1, x1 - 7), top + 1, 6, 6);
        drawKeys(g, cl, x.start, top, lh);
      }
      if (cl.label) { g.fillStyle = cl.label; g.fillRect(x0, top + lh - 3, cw, 3); }
      if (cl.name) label(g, cl.name, x0, top + 14, Math.min(cw, 150));
      if (cl.off) { g.fillStyle = '#000000b0'; g.fillRect(x0, top, cw, lh); g.fillStyle = '#ffffff80'; g.font = '10px system-ui'; g.fillText('off', x0 + 4, top + lh - 14); }
      if (!x.td) { g.fillStyle = '#000'; g.fillRect(x0 - 1, top, 1, lh); }
    }
    // transitions: a bow-tie over the overlap
    for (const x of L) {
      if (!x.td) continue;
      const a = X(x.start); const b = X(x.start + x.td); const mid = (a + b) / 2;
      g.fillStyle = '#7fd8ff40'; g.strokeStyle = '#7fd8ff';
      g.beginPath(); g.moveTo(a, top + 2); g.lineTo(b, top + lh - 2); g.lineTo(b, top + 2); g.lineTo(a, top + lh - 2); g.closePath(); g.fill(); g.stroke();
      if (b - a > 26) { g.fillStyle = '#bfeaff'; g.font = '9px system-ui, sans-serif'; g.textBaseline = 'bottom'; g.textAlign = 'center'; g.fillText((FX.TRANS[x.clip.trans.type]?.name || x.clip.trans.type).slice(0, 18), mid, top + lh - 2); g.textAlign = 'left'; }
    }
    // other tracks
    for (const lane of LN) {
      if (!lane.track) continue;
      const k = lane.track;
      g.fillStyle = lane.kind === 'text' ? '#0d0b14' : lane.kind === 'audio' ? '#0a120d' : '#0b0d12';
      g.fillRect(0, lane.y, w, lane.h);
      for (const it of k.items) {
        const s0 = it.start; const e0 = C.itemEnd(it);
        const moving = drag?.kind === 'item' && drag.id === it.id;
        const x0 = X(moving ? drag.start : s0); const x1 = X((moving ? drag.start : s0) + (e0 - s0)); const cw = Math.max(2, x1 - x0 - 1);
        if (x1 < -2 || x0 > w + 2) continue;
        const ly = moving && drag.lane ? drag.lane.y : lane.y;
        g.save(); g.beginPath(); g.rect(x0, ly, cw, lane.h); g.clip();
        g.globalAlpha = k.hide || k.mute ? 0.4 : 1;
        if (it.kind === 'title') {
          g.fillStyle = '#3a2a66'; g.fillRect(x0, ly, cw, lane.h);
          g.fillStyle = '#e7dcff'; g.font = '600 10px system-ui, sans-serif'; g.textBaseline = 'middle';
          g.fillText(`${it.shape && !String(it.text || '').trim() ? `◆ ${FX.SHAPE[it.shape]?.name || it.shape}` : `T ${String(it.text || '').replace(/\n/g, ' / ')}`}${it.anim ? `  ↗ ${FX.TANIM[it.anim]?.name || it.anim}` : ''}`, x0 + 5, ly + lane.h / 2);
        } else if (it.kind === 'audio') {
          const hh = hue(it.src);
          g.fillStyle = `hsl(${hh} 35% 14%)`; g.fillRect(x0, ly, cw, lane.h);
          drawWave(g, it, x0, ly, cw, lane.h, x0, x1, `hsl(${hh} 80% 65% / .8)`);
          label(g, `♪ ${noExt(base(it.src))}${it.volume != null && it.volume !== 1 ? ` · ${Math.round(it.volume * 100)}%` : ''}`, x0, ly, Math.min(cw, 170));
        } else if (it.kind === 'color') {
          g.fillStyle = it.fill || '#444'; g.fillRect(x0, ly, cw, lane.h);
        } else if (it.kind === 'layer') {
          g.fillStyle = 'hsl(270 35% 22%)'; g.fillRect(x0, ly, cw, lane.h);
          label(g, `◭ ${it.name || 'Lab layer'} · Lab`, x0, ly, Math.min(cw, 170));
        } else {
          const hh = hue(it.src);
          g.fillStyle = `hsl(${hh} 30% 18%)`; g.fillRect(x0, ly, cw, lane.h);
          drawStrip(g, it, x0, ly, cw, lane.h, x0, x1, s0, e0);
          label(g, `${it.kind === 'image' ? '▣' : '▶'} ${noExt(base(it.src))}${it.blend && it.blend !== 'normal' ? ` · ${it.blend}` : ''}`, x0, ly, Math.min(cw, 170));
        }
        g.globalAlpha = 1;
        if (it.label) { g.fillStyle = it.label; g.fillRect(x0, ly + lane.h - 3, cw, 3); }
        if (it.off) { g.fillStyle = '#000000b0'; g.fillRect(x0, ly, cw, lane.h); }
        g.restore();
        if (st.sel.has(it.id)) { g.strokeStyle = '#ffd75e'; g.lineWidth = 2; g.strokeRect(x0 + 1, ly + 1, cw - 2, lane.h - 2); g.lineWidth = 1; drawKeys(g, it, s0, ly, lane.h); }
      }
    }
    // lane labels (V1, V2, T1, A1…); Alt shows their switches (👁 🔇 🔒)
    for (const lane of LN) {
      if (lane.kind === 'ruler') continue;
      const k = lane.track;
      const name = k ? k.name : 'V1';
      const flags = k ? `${k.hide ? ' ⊘' : ''}${k.mute ? ' 🔇' : ''}${k.lock ? ' 🔒' : ''}` : '';
      g.font = '600 9px ui-monospace, Consolas, monospace'; g.textBaseline = 'top';
      const tw = g.measureText(name + flags).width + 6;
      g.fillStyle = '#000000b0'; g.fillRect(0, lane.y, tw, 11);
      g.fillStyle = lane.kind === 'main' ? '#ffd75e' : lane.kind === 'text' ? '#c9b6ff' : lane.kind === 'audio' ? '#8ff0b0' : '#9fd6ff';
      g.fillText(name + flags, 3, lane.y + 1);
      if (st.alt && k) {
        const ico = [['👁', 'hide'], ['🔇', 'mute'], ['🔒', 'lock']];
        ico.forEach(([s0, f], i) => { const bx = tw + 2 + i * 16; g.fillStyle = k[f] ? '#ffd75e' : '#ffffff30'; g.fillRect(bx, lane.y, 15, 11); g.fillStyle = '#000'; g.font = '9px system-ui'; g.fillText(s0, bx + 2, lane.y + 1); });
      }
    }
    // beats (faint) and bars on the ruler, drops in red
    const pb = C.programBeats(edit, analysisMap());
    g.fillStyle = '#ffd75e55'; for (const b of pb.beats) g.fillRect(X(b), RULER - 4, 1, 4);
    g.fillStyle = '#ffd75ecc'; for (const b of pb.bars) g.fillRect(X(b), RULER - 7, 1, 7);
    g.fillStyle = '#ff4d4d'; for (const d0 of pb.drops) g.fillRect(X(d0) - 1, RULER - 7, 2, 7);
    // markers: yours (flags in their color, a dot when they have a note) and the notes (their category color)
    for (const m of edit.markers) {
      const x = X(m.t); g.fillStyle = m.color || '#ffd75e';
      g.beginPath(); g.moveTo(x, RULER); g.lineTo(x - 4, 3); g.lineTo(x + 4, 3); g.fill(); g.fillRect(x, RULER, 1, h - RULER);
      if (m.note) { g.fillStyle = '#fff'; g.fillRect(x - 1, 0, 3, 3); }
      if (m.label && st.view) { g.font = '9px system-ui, sans-serif'; g.fillStyle = m.color || '#ffd75e'; g.fillText(m.label.slice(0, 16), x + 5, 2); }
    }
    for (const n of noteMarks()) { const x = X(n.t); g.globalAlpha = n.done ? 0.35 : 1; g.fillStyle = n.color; g.save(); g.translate(x, RULER / 2 + 1); g.rotate(Math.PI / 4); g.fillRect(-3, -3, 6, 6); g.restore(); g.globalAlpha = 1; }
    // a pending auto-cut suggestion: dashed lines
    if (st.suggest?.times.length) {
      g.strokeStyle = '#7fd8ff'; g.lineWidth = 2; g.setLineDash([4, 3]); g.shadowColor = '#7fd8ff'; g.shadowBlur = 6;
      for (const t of st.suggest.times) { const x = Math.round(X(t)); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.setLineDash([]); g.lineWidth = 1; g.shadowBlur = 0;
      g.fillStyle = '#7fd8ff'; g.font = '10px system-ui, sans-serif'; g.textBaseline = 'top';
      for (const t of st.suggest.times) g.fillText('✂', Math.round(X(t)) + 3, 1);
    }
    // reorder drop line + snap line + razor
    if (drag?.kind === 'move' && drag.to != null) {
      const Dv = C.mainTotal(edit);
      const at = drag.to >= L.length ? Dv : L[drag.to]?.start ?? Dv;
      g.fillStyle = '#ffd75e'; g.fillRect(X(at) - 1.5, top - 2, 3, lh + 4);
    }
    if (st.snapAt != null) { g.fillStyle = '#7fd8ff'; g.fillRect(X(st.snapAt), 0, 1, h); }
    if (st.razor && st.hoverX != null) { g.fillStyle = '#ff4d4d'; g.fillRect(st.hoverX, RULER, 1, h - RULER); }
    // zoomed: a thin bar shows where the view is in the whole edit
    if (st.view) { const D = total() || 1; g.fillStyle = '#ffffff22'; g.fillRect(0, h - 2, w, 2); g.fillStyle = '#ffd75e'; g.fillRect((v.t0 / D) * w, h - 2, Math.max(4, ((v.t1 - v.t0) / D) * w), 2); }
  }
  let lastSum = '';
  function paintHead() {
    if (!refs.sum || !st.edit) return;
    const n = st.edit.clips.length; const sel = selIds();
    const mk = st.edit.mark;
    const layers = (st.edit.tracks || []).reduce((a, k) => a + k.items.length, 0);
    const F = progFps();
    const text = `${n} clip${n === 1 ? '' : 's'}${layers ? ` + ${layers} on tracks` : ''} · ${fmt(total())}${mk ? ` · in–out ${fmt(mk.a)} → ${fmt(mk.b)}` : ''}${sel.length ? ` · ${sel.length > 1 ? `${sel.length} selected` : selName(sel[0])}` : ''}${st.razor ? ' · ✂ razor' : ''}${st.view ? ` · zoom ${Math.round(total() / (st.view.t1 - st.view.t0))}×` : ''}`;
    if (text !== lastSum) { lastSum = text; refs.sum.textContent = text; }
    const s = st.suggest;
    refs.sug.hidden = !s;
    if (s) refs.sugText.textContent = s.times.length ? `${s.times.length} cut${s.times.length === 1 ? '' : 's'} ${SUGGEST_LABEL[s.mode] || s.mode}` : `No ${SUGGEST_LABEL[s.mode] || s.mode} found (the beats come from the audio)`;
    refs.undoBtn.disabled = !st.undo.length;
    const { W: fw, H: fh } = frameSize();
    const fmtTxt = `${V.aspectOf(fw, fh) !== 'other' ? V.aspectOf(fw, fh) : `${fw}×${fh}`} · ${Number(F.toFixed(3))} fps`;
    if (refs.fmtBtn && refs.fmtBtn.textContent !== fmtTxt) refs.fmtBtn.textContent = fmtTxt;
    emit('select', { ids: sel });
  }
  function selName(id) {
    const f = C.find(st.edit, id);
    if (!f) return '';
    if (f.where === 'clip') return `clip ${f.i + 1}`;
    return `${f.track.name}.${f.track.items.indexOf(f.clip) + 1}`;
  }
  let lastTime = '';
  // the transport shows program timecode HH:MM:SS:FF (or seconds / frames, T or a click on the total switches)
  const fmtProg = (T) => { const F = progFps(); const m = host.S.timeMode; return m === 'sec' ? `${(T || 0).toFixed(3)}s` : m === 'frames' ? `f${C.frameOf(T || 0, F)}` : V.tc(T, F); };
  function paintTime() {
    const r = host?.refs;
    if (!r || !st.on) return;
    const T = P.playing ? nowT() : P.T;
    if (document.activeElement !== r.time) { const v = fmtProg(T); if (v !== lastTime) { lastTime = v; r.time.value = v; } }
    const tot = `/ ${fmtProg(total())}${host.S.timeMode === 'frames' ? '' : ` · f${C.frameOf(T, progFps())}`} · ✂`;
    if (r.timeTotal.textContent !== tot) {
      const chars = tot.length;
      if (r.timeTotal.textContent.length !== chars || !r.timeTotal.style.width) r.timeTotal.style.width = `${chars}ch`;
      r.timeTotal.textContent = tot;
    }
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
    if (y < RULER) {
      const m = st.edit.markers.find((mm) => Math.abs(xOf(mm.t) - x) <= 5);
      return m ? { zone: 'marker', m, T, x, y } : { zone: 'ruler', T, x, y };
    }
    const lane = laneOf(y);
    if (!lane) return { zone: 'empty', T, x, y };
    if (lane.track && x < 24 + (st.alt ? 50 : 0)) {
      if (st.alt) { const tw = 24; const i = Math.floor((x - tw) / 16); const f = ['hide', 'mute', 'lock'][i]; if (x > tw && f) return { zone: 'switch', lane, flag: f, T, x, y }; }
      if (x < 22) return { zone: 'label', lane, T, x, y };
    }
    if (lane.kind === 'main') {
      const L = C.layout(st.edit);
      const top = lane.y;
      // a transition's bow-tie
      for (const it of L) if (it.td && x >= xOf(it.start) - 2 && x <= xOf(it.start + it.td) + 2 && y > top + lane.h * 0.3) return { zone: 'trans', it, T, x, y, lane };
      for (const it of L) {
        const x0 = xOf(it.start); const x1 = xOf(it.end);
        if (x < x0 - 5 || x > x1 + 5) continue;
        if (st.sel.has(it.clip.id) && y < top + 9) {
          const fi = xOf(it.start + (it.clip.fadeIn || 0)); const fo = xOf(it.end - (it.clip.fadeOut || 0));
          if (Math.abs(x - fi - 3) <= 6) return { zone: 'fade', edge: 'in', it, T, x, y, lane };
          if (Math.abs(x - fo + 3) <= 6) return { zone: 'fade', edge: 'out', it, T, x, y, lane };
        }
        if (Math.abs(x - x0) <= 5 && it.i > 0 && x >= x0) return { zone: 'edge', edge: 'in', it, T, x, y, lane };
        if (Math.abs(x - x1) <= 5 && x <= x1) return { zone: 'edge', edge: 'out', it, T, x, y, lane };
        if (Math.abs(x - x0) <= 5 && it.i === 0) return { zone: 'edge', edge: 'in', it, T, x, y, lane };
        if (x >= x0 && x <= x1) return { zone: 'clip', it, T, x, y, lane };
      }
      return { zone: 'empty', T, x, y, lane };
    }
    const k = lane.track;
    for (const itm of k.items) {
      const x0 = xOf(itm.start); const x1 = xOf(C.itemEnd(itm));
      if (x < x0 - 5 || x > x1 + 5) continue;
      if (Math.abs(x - x0) <= 5) return { zone: 'iedge', edge: 'in', item: itm, track: k, T, x, y, lane };
      if (Math.abs(x - x1) <= 5) return { zone: 'iedge', edge: 'out', item: itm, track: k, T, x, y, lane };
      if (x >= x0 && x <= x1) return { zone: 'item', item: itm, track: k, T, x, y, lane };
    }
    return { zone: 'lane', lane, T, x, y };
  }
  function targets(exclude) {
    const out = [{ t: 0 }, { t: total() }, { t: P.T, kind: 'playhead' }];
    for (const x of C.layout(st.edit)) if (x.clip.id !== exclude) out.push({ t: x.start, kind: 'cut' }, { t: x.end, kind: 'cut' });
    for (const k of st.edit.tracks || []) for (const it of k.items) if (it.id !== exclude) out.push({ t: it.start, kind: 'item' }, { t: C.itemEnd(it), kind: 'item' });
    for (const m of st.edit.markers) out.push({ t: m.t, kind: 'marker' });
    for (const n of noteMarks()) out.push({ t: n.t, kind: 'note' });
    if (st.edit.mark) out.push({ t: st.edit.mark.a }, { t: st.edit.mark.b });
    const pb = C.programBeats(st.edit, analysisMap());
    for (const b of pb.beats) out.push({ t: b, kind: 'beat' });
    return out;
  }
  // Snap to edges, markers, beats and the playhead (Alt: free); with snapping off, or nothing near, to the frame.
  const toFrame = (T) => { const F = progFps(); return Math.round(T * F) / F; };
  // the start of the frame a time is in (things added "at the playhead" start on its frame)
  const frameStart = (T) => { const F = progFps(); return Math.floor(T * F + 1e-4) / F; };
  const snapT = (T, e, exclude) => {
    if (e.altKey || !st.snap) { st.snapAt = null; return toFrame(T); }
    const v = span();
    const s = C.snap(T, targets(exclude), (8 / Math.max(1, W())) * (v.t1 - v.t0));
    st.snapAt = s.snapped ? s.t : null;
    return s.snapped ? s.t : toFrame(T);
  };
  // scrubbing lands on frames: the middle of the frame under the pointer
  const scrubT = (T, e) => { const s = snapT(T, e); const F = progFps(); return st.snapAt != null ? s : (Math.floor(T * F + 1e-6) + 0.5) / F; };
  function trackDown(e) {
    if (!st.edit || e.button === 2) return;
    host.refs.root.focus({ preventScroll: true }); // keys (S, Del, Q…) go to Video Review
    const h = hit(e);
    const start = st.edit;
    refs.canvas.setPointerCapture(e.pointerId);
    let moved = false;
    const x0 = e.clientX; const y0 = e.clientY;
    const wasPlaying = P.playing;
    if (h.zone === 'switch') { commit(C.patchTrack(st.edit, h.lane.track.id, { [h.flag]: !h.lane.track[h.flag] }), `${h.lane.track.name}: ${h.flag} ${h.lane.track[h.flag] ? 'off' : 'on'}`); return; }
    if (h.zone === 'label') { trackMenu(h.lane.track, e.clientX, e.clientY); return; }
    if (h.zone === 'marker') { pause(); seek(h.m.t, { play: false }); return; }
    // razor: a click splits whatever is under it
    if (st.razor && (h.zone === 'clip' || h.zone === 'item' || h.zone === 'edge' || h.zone === 'iedge')) {
      const T = snapT(h.T, e);
      if (h.item) commit(C.splitItems(st.edit, T, [h.item.id]), '✂ Razor'); else commit(C.split(st.edit, T), '✂ Razor');
      st.snapAt = null; draw();
      return;
    }
    if (h.zone === 'ruler' || h.zone === 'empty' || h.zone === 'lane') {
      pause(); seek(scrubT(h.T, e), { play: false });
      if (h.zone !== 'ruler') { st.sel.clear(); paintHead(); draw(); }
      const mv = (ev) => seek(scrubT(hit(ev).T, ev), { play: false });
      refs.canvas.addEventListener('pointermove', mv);
      refs.canvas.addEventListener('pointerup', () => { refs.canvas.removeEventListener('pointermove', mv); st.snapAt = null; draw(); }, { once: true });
      return;
    }
    if (h.zone === 'trans') { st.sel = new Set([h.it.clip.id]); paintHead(); draw(); return; }
    // track items: move (also to another track of the same kind), trim an edge
    if (h.zone === 'item' || h.zone === 'iedge') {
      const it0 = h.item; const id = it0.id;
      if (h.track.lock) { host.flash(`${h.track.name} is locked`); return; }
      const grab = h.T - it0.start;
      const mv = (ev) => {
        if (!moved && Math.abs(ev.clientX - x0) < 4 && Math.abs(ev.clientY - y0) < 4) return;
        if (!moved) { moved = true; if (wasPlaying) pause(); }
        const hh = hit(ev);
        if (h.zone === 'iedge') st.drag = { kind: 'itrim', id, preview: C.trimItem(start, id, h.edge, snapT(hh.T, ev, id)) };
        else {
          let s0 = snapT(hh.T - grab, ev, id);
          const endSnap = snapT(hh.T - grab + C.itemDur(it0), ev, id);
          if (st.snapAt != null && Math.abs(endSnap - (hh.T - grab + C.itemDur(it0))) < Math.abs(s0 - (hh.T - grab))) s0 = endSnap - C.itemDur(it0);
          const lane = laneOf(ev.clientY - refs.canvas.getBoundingClientRect().top);
          const to = lane?.track && lane.track.type === h.track.type && !lane.track.lock ? lane : null;
          st.drag = { kind: 'item', id, start: Math.max(0, s0), lane: to, preview: C.moveItem(start, id, Math.max(0, s0), to?.track.id) };
        }
        draw();
      };
      refs.canvas.addEventListener('pointermove', mv);
      refs.canvas.addEventListener('pointerup', () => {
        refs.canvas.removeEventListener('pointermove', mv);
        const d = st.drag; st.drag = null; st.snapAt = null;
        if (!moved) { if (e.shiftKey) { if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id); } else st.sel = new Set([id]); paintHead(); draw(); seek(h.T, { play: false }); return; }
        if (d?.preview) commit(d.preview, d.kind === 'itrim' ? 'Trimmed' : 'Moved'); else draw();
      }, { once: true });
      return;
    }
    if (h.zone === 'edge' || h.zone === 'fade') { st.sel = new Set([h.it.clip.id]); paintHead(); }
    const id = h.it.clip.id;
    const L0 = C.layout(start);
    const mode = h.zone === 'edge' && e.shiftKey ? 'roll' : h.zone === 'clip' && (e.ctrlKey || e.metaKey) ? 'slip' : h.zone === 'clip' && e.shiftKey ? 'slide' : null;
    const mv = (ev) => {
      if (!moved && Math.abs(ev.clientX - x0) < 4) return;
      if (!moved) { moved = true; if (wasPlaying) pause(); }
      const T = hit(ev).T;
      const it = L0[h.it.i];
      if (mode === 'roll') {
        const i = h.edge === 'in' ? h.it.i : h.it.i + 1;
        const cut = h.edge === 'in' ? it.start : it.end;
        st.drag = { kind: 'roll', id, preview: C.roll(start, i, snapT(T, ev, id) - cut) };
      } else if (mode === 'slip') st.drag = { kind: 'slip', id, preview: C.slip(start, id, -(T - h.T)) };
      else if (mode === 'slide') st.drag = { kind: 'slide', id, preview: C.slide(start, id, toFrame(T - h.T)) };
      else if (h.zone === 'edge') {
        const P1 = snapT(T, ev, id);
        const delta = h.edge === 'in' ? P1 - it.start : P1 - it.end;
        st.drag = { kind: 'trim', id, preview: C.trim(start, id, h.edge, delta) };
      } else if (h.zone === 'fade') {
        const len = h.edge === 'in' ? T - it.start : it.end - T;
        st.drag = { kind: 'fade', id, preview: C.setFade(start, id, h.edge, len) };
      } else {
        // reorder: the gap between clips nearest to the pointer
        let to = L0.findIndex((x) => T < (x.start + x.end) / 2);
        if (to < 0) to = L0.length;
        st.drag = { kind: 'move', id, to, preview: null };
      }
      if (st.drag?.preview && (mode === 'slip' || mode === 'roll' || mode === 'slide')) liveFrame(st.drag.preview);
      draw();
    };
    refs.canvas.addEventListener('pointermove', mv);
    refs.canvas.addEventListener('pointerup', () => {
      refs.canvas.removeEventListener('pointermove', mv);
      const d = st.drag; st.drag = null; st.snapAt = null;
      if (!moved) {
        // a click: select (Shift adds) and put the playhead there
        if (e.shiftKey) { if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id); } else st.sel = new Set([id]);
        paintHead(); draw();
        if (h.zone === 'clip') seek(scrubT(h.T, e), { play: false });
        return;
      }
      if (d?.kind === 'move') { const i = L0.findIndex((x) => x.clip.id === id); if (d.to !== i && d.to !== i + 1) commit(C.move(start, id, d.to), 'Clip moved'); else draw(); }
      else if (d?.preview) commit(d.preview, { fade: 'Fade', roll: 'Rolled', slip: 'Slipped', slide: 'Slid' }[d.kind] || 'Trimmed');
      else draw();
    }, { once: true });
  }
  // while slipping / rolling the picture follows (the frame at the playhead of the previewed edit)
  let liveT = 0;
  function liveFrame(preview) {
    if (performance.now() - liveT < 60) return;
    liveT = performance.now();
    if (richOn) VideoComp.renderExact(P.T, { edit: preview, g: refs.pwrap.querySelector('.vr-pcomp').getContext('2d'), W: refs.pwrap.querySelector('.vr-pcomp').width, H: refs.pwrap.querySelector('.vr-pcomp').height });
  }
  function trackHover(e) {
    if (st.drag || e.buttons) return;
    const h = hit(e);
    const cur = st.razor && /clip|item|edge/.test(h.zone) ? 'crosshair' : h.zone === 'edge' || h.zone === 'iedge' ? (e.shiftKey ? 'ew-resize' : 'col-resize') : h.zone === 'fade' ? 'ew-resize' : h.zone === 'clip' || h.zone === 'item' ? 'grab' : h.zone === 'label' || h.zone === 'switch' || h.zone === 'marker' || h.zone === 'trans' ? 'pointer' : 'text';
    if (refs.canvas.style.cursor !== cur) refs.canvas.style.cursor = cur;
    if (st.razor) { st.hoverX = h.x; draw(); }
  }
  function trackMenuAt(e) {
    e.preventDefault();
    const h = hit(e);
    const x = e.clientX; const y = e.clientY;
    if (h.zone === 'marker') { markerMenu(h.m, x, y); return; }
    if (h.zone === 'ruler') { rulerMenu(h.T, x, y); return; }
    if (h.zone === 'label' || h.zone === 'switch' || h.zone === 'lane') { trackMenu(h.lane.track, x, y, h.T); return; }
    if (h.zone === 'trans') { st.sel = new Set([h.it.clip.id]); paintHead(); draw(); transMenu(h.it.clip, x, y); return; }
    if (h.zone === 'item' || h.zone === 'iedge') { if (!st.sel.has(h.item.id)) { st.sel = new Set([h.item.id]); paintHead(); draw(); } clipMenu(h.item, h.T, x, y); return; }
    if (h.zone !== 'clip' && h.zone !== 'edge' && h.zone !== 'fade') { moreMenu({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y }) }); return; }
    const c = h.it.clip;
    if (!st.sel.has(c.id)) { st.sel = new Set([c.id]); paintHead(); draw(); }
    clipMenu(c, h.T, x, y);
  }
  function trackWheel(e) {
    if (!st.edit) return;
    e.preventDefault();
    const r = refs.canvas.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) { zoomBy(e.deltaY < 0 ? 1.25 : 0.8, tOf(e.clientX - r.left)); paintHead(); return; }
    if (!st.view) return;
    const v = st.view; const len = v.t1 - v.t0;
    const d = ((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / Math.max(1, W())) * len;
    setView(v.t0 + d, v.t0 + d + len);
  }

  // ---------- menus on the track (right-click) ----------
  const sel1 = (c) => (st.sel.has(c.id) ? selIds() : [c.id]);
  const groupsOf = (list) => [...new Set(list.map((x) => x.group))];
  // a two-level picker: groups › entries (each entry runs pick(id))
  const grouped = (list, pick, cur) => groupsOf(list).map((gname) => ({ label: gname, items: () => list.filter((x) => x.group === gname).map((x) => ({ label: `${x.id === cur ? '✓ ' : ''}${x.name}`, action: () => pick(x.id) })) }));
  function transMenu(c, x, y) {
    const i = st.edit.clips.findIndex((k) => k.id === c.id);
    if (i <= 0) return;
    const cur = c.trans?.type;
    showMenu(x, y, [
      { label: cur ? `Transition: ${FX.TRANS[cur]?.name || cur}` : 'Add a transition', items: grouped(FX.TRANSITIONS.filter((t) => t.id !== 'cut'), (id) => setTransition(id, null, [c.id]), cur) },
      { label: 'Length', items: [0.2, 0.3, 0.5, 0.75, 1, 1.5, 2].map((s) => ({ label: `${s} s${c.trans?.dur === s ? ' ✓' : ''}`, action: () => setTransition(cur || 'dissolve', s, [c.id]) })) },
      { label: 'Same on every cut', action: () => commit(C.transAll(st.edit, cur || 'dissolve', c.trans?.dur || 0.5), 'Transition on every cut') },
      cur ? { label: 'Remove (straight cut)', action: () => setTransition(null, 0, [c.id]) } : null,
      { more: true, label: 'Inspector…', action: () => inspect(c.id) },
    ].filter(Boolean));
  }
  function clipMenu(c, T, x, y) {
    const ids = sel1(c);
    const f = C.find(st.edit, c.id);
    const isItem = f?.where === 'item';
    const media = c.kind === 'video' || c.kind === 'audio';
    const visual = c.kind !== 'audio' && c.kind !== 'gap';
    const i = isItem ? -1 : f?.i ?? -1;
    showMenu(x, y, [
      { label: 'Split here (S)', action: () => (isItem ? commit(C.splitItems(st.edit, T, ids), '✂ Split') : commit(C.split(st.edit, T), 'Split')) },
      isItem ? { label: 'Delete (Del)', action: () => commit(C.removeItems(st.edit, ids), 'Deleted') } : { label: 'Delete', items: [
        { label: 'Leave a gap (Del)', action: () => del(false) }, { label: 'Ripple delete (Shift+Del)', action: () => del(true) }] },
      { label: 'Edit', items: () => [
        !isItem ? { label: 'Duplicate (D)', action: () => commit(C.duplicate(st.edit, c.id), 'Duplicated') } : { label: 'Duplicate (D)', action: () => commit(C.addItem(st.edit, { ...c, start: C.itemEnd(c) }, { track: f.track.id }), 'Duplicated') },
        { label: 'Trim the start to the playhead (Q)', action: () => trimToHead('in', c.id) },
        { label: 'Trim the end to the playhead (W)', action: () => trimToHead('out', c.id) },
        !isItem && i > 0 ? { label: 'Roll the cut before to the playhead', action: () => commit(C.roll(st.edit, i, P.T - C.layout(st.edit)[i].start), 'Rolled') } : null,
        media ? { label: 'Slip ±10 frames ‹ ›', items: [-10, -1, 1, 10].map((n) => ({ label: `${n > 0 ? '+' : ''}${n} frame${Math.abs(n) > 1 ? 's' : ''}`, action: () => commit(C.slip(st.edit, c.id, n / progFps()), 'Slipped') })) } : null,
        !isItem && i > 0 && i < st.edit.clips.length - 1 ? { label: 'Slide ±10 frames', items: [-10, -1, 1, 10].map((n) => ({ label: `${n > 0 ? '+' : ''}${n} frame${Math.abs(n) > 1 ? 's' : ''}`, action: () => commit(C.slide(st.edit, c.id, n / progFps()), 'Slid') })) } : null,
        c.kind !== 'gap' && c.kind !== 'title' && !isItem ? { label: 'Freeze frame at the playhead (Shift+F)', action: () => freezeHere() } : null,
        !isItem && c.kind === 'video' ? { label: 'Move to a track above (overlay)', action: () => toOverlay(c.id) } : null,
        isItem && c.kind === 'video' ? { label: 'Move to the main track (at the playhead)', action: () => toMain(c.id) } : null,
        !isItem ? { label: 'Nest the selection (compound clip)', action: () => nestSelection() } : null,
        c.nest ? { label: 'Un-nest (back to its clips)', action: () => unnest(c.id) } : null,
      ].filter(Boolean) },
      media ? { label: `Speed: ${c.speed || 1}×${c.reverse ? ' reversed' : ''}`, items: () => [
        ...C.SPEEDS.map((s) => ({ label: `${(c.speed || 1) === s ? '✓ ' : '   '}${s}×${s === 1 ? ' (normal)' : ''}`, action: () => setSpeed(s, ids) })),
        { label: `${c.reverse ? '✓ ' : ''}Reverse`, action: () => commit(C.setReverse(st.edit, ids), c.reverse ? 'Forward' : '◀ Reversed') },
        !isItem ? { label: 'Speed ramp', items: FX.RAMPS.map((r0) => ({ label: r0.name, action: () => rampClip(r0.id, c.id) })) } : null,
      ].filter(Boolean) } : null,
      visual ? { label: `Look${c.color?.look ? `: ${FX.LOOK[c.color.look]?.name}` : ''}`, items: () => [
        ...grouped(FX.LOOKS, (id) => setLook(id, ids), c.color?.look),
        c.color ? { label: 'Strength', items: [0.25, 0.5, 0.75, 1].map((a) => ({ label: `${Math.round(a * 100)}%`, action: () => commit(C.patchAny(st.edit, ids, (k) => { k.color = { ...(k.color || {}), amt: a }; }), `Look ${Math.round(a * 100)}%`) })) } : null,
        { label: 'Match a picture\'s look… (a reference: the vibe, not the footage)', action: async () => { const [p] = await window.hub.openDialog({ filters: [{ name: 'Picture', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }) || []; if (p) matchLook(p, ids); } },
        { label: 'Copy look', action: () => { lookClip = c.color ? C.copy(c.color) : null; host.flash(lookClip ? 'Look copied' : 'No look to copy'); } },
        lookClip ? { label: 'Paste look', action: () => commit(C.patchAny(st.edit, ids, (k) => { k.color = C.copy(lookClip); }), 'Look pasted') } : null,
        c.color ? { label: 'No look', action: () => commit(C.patchAny(st.edit, ids, (k) => { delete k.color; }), 'Look removed') } : null,
      ].filter(Boolean) } : null,
      visual && c.kind !== 'title' ? { label: 'Motion', items: () => grouped(FX.MOTIONS, (id) => applyMotion(id, ids), null) } : null,
      visual && c.kind !== 'title' ? { label: `Effects${c.fx?.length ? ` (${c.fx.length})` : ''}`, items: () => [...grouped(FX.EFFECTS, (id) => setEffect(id, ids, (c.fx || []).some((f) => f.id === id) ? 0 : 1), null).map((gr) => ({ ...gr, items: () => gr.items().map((it) => ({ ...it, label: (c.fx || []).some((f) => FX.EFFECT[f.id]?.name === it.label.replace(/^✓ /, '')) ? `✓ ${it.label}` : it.label })) })), c.fx?.length ? { label: 'Remove every effect', action: () => setEffect('off', ids) } : null].filter(Boolean) } : null,
      { label: 'Keyframe at the playhead', items: () => C.KEY_PROPS.filter((p) => (p === 'volume' ? media : visual)).map((p) => ({ label: `◆ ${p}${c.keys?.[p] ? ` (${c.keys[p].length})` : ''}`, action: () => keyHere(p, null, c.id) })).concat(c.keys ? [{ label: 'Remove every keyframe', action: () => commit(C.patchAny(st.edit, ids, (k) => { delete k.keys; }), 'Keyframes removed') }] : []) },
      { label: 'Fades', items: () => [
        { label: `Fade in: ${c.fadeIn ? `${c.fadeIn.toFixed(2)} s` : 'off'}`, items: [0, 0.25, 0.5, 1, 2].map((s) => ({ label: s ? `${s} s` : 'Off', action: () => commit(C.patchAny(st.edit, ids, (k) => { k.fadeIn = Math.min(s, C.durOf(k) / 2); }), s ? `Fade in ${s} s` : 'No fade in') })) },
        { label: `Fade out: ${c.fadeOut ? `${c.fadeOut.toFixed(2)} s` : 'off'}`, items: [0, 0.25, 0.5, 1, 2].map((s) => ({ label: s ? `${s} s` : 'Off', action: () => commit(C.patchAny(st.edit, ids, (k) => { k.fadeOut = Math.min(s, C.durOf(k) / 2); }), s ? `Fade out ${s} s` : 'No fade out') })) },
      ] },
      media ? { label: `Sound effects${c.afx?.length ? ` (${c.afx.length})` : ''}`, items: () => [...FX.AUDIO_FX.map((a) => ({ label: `${(c.afx || []).includes(a.id) ? '✓ ' : ''}${a.name}`, action: () => setAudioFx(a.id, ids) })), c.afx?.length ? { label: 'None', action: () => setAudioFx('off', ids) } : null].filter(Boolean) } : null,
      media ? { label: `${c.mute ? 'Unmute' : 'Mute'} the sound (A)`, action: () => commit(C.patchAny(st.edit, ids, (k) => { k.mute = !c.mute; }), c.mute ? 'Sound on' : 'Muted') } : null,
      media ? { label: `Volume${c.volume != null && c.volume !== 1 ? `: ${Math.round(c.volume * 100)}%` : ''}`, items: [0, 0.25, 0.5, 0.75, 1, 1.5, 2].map((v) => ({ label: `${Math.round(v * 100)}%`, action: () => commit(C.patchAny(st.edit, ids, (k) => { k.volume = v; }), `Volume ${Math.round(v * 100)}%`) })) } : null,
      isItem && visual ? { label: `Blend: ${FX.BLEND[c.blend || 'normal']?.name}`, items: FX.BLENDS.map((b) => ({ label: `${(c.blend || 'normal') === b.id ? '✓ ' : ''}${b.name}`, action: () => commit(C.patchAny(st.edit, ids, (k) => { k.blend = b.id; }), `Blend ${b.name}`) })) } : null,
      visual ? { label: 'Opacity', items: [1, 0.85, 0.7, 0.5, 0.3, 0.15].map((o) => ({ label: `${Math.round(o * 100)}%`, action: () => commit(C.patchAny(st.edit, ids, (k) => { k.opacity = o; }), `Opacity ${Math.round(o * 100)}%`) })) } : null,
      !isItem && i > 0 ? { label: `Transition in${c.trans ? `: ${FX.TRANS[c.trans.type]?.name}` : ''}`, items: () => grouped(FX.TRANSITIONS.filter((t) => t.id !== 'cut'), (id) => setTransition(id, null, [c.id]), c.trans?.type) } : null,
      c.kind === 'title' ? { label: 'Edit the title…', action: () => (isItem ? inspect(c.id) : editTitle(c)) } : null,
      c.kind === 'title' && c.shape ? { label: 'Shape', items: () => grouped(FX.SHAPES, (id) => commit(C.patchAny(st.edit, ids, (k) => { k.shape = id; }), FX.SHAPE[id].name), c.shape) } : null,
      c.kind === 'title' && c.shape ? { label: 'Shape color', items: [['Preset', null], ['White', '#ffffff'], ['Gold', '#ffc93b'], ['Ember', '#ff5a1f'], ['Violet', '#9a6bff'], ['Cyan', '#22d3ee'], ['Pink', '#ff4fa3'], ['Black', '#000000']].map(([n0, col]) => ({ label: `${(c.color || null) === col ? '✓ ' : ''}${n0}`, action: () => commit(C.patchAny(st.edit, ids, (k) => { if (col) k.color = col; else delete k.color; }), `Shape color: ${n0}`) })) } : null,
      c.kind === 'title' ? { label: 'Title style', items: () => grouped(FX.TITLE_STYLES, (id) => commit(C.patchAny(st.edit, ids, (k) => { k.style = id; }), FX.TSTYLE[id].name), c.style) } : null,
      c.kind === 'title' ? { label: 'Title animation', items: () => [{ label: 'In', items: FX.TITLE_ANIMS.map((a) => ({ label: `${c.anim === a.id ? '✓ ' : ''}${a.name}`, action: () => commit(C.patchAny(st.edit, ids, (k) => { k.anim = a.id; }), `In: ${a.name}`) })) }, { label: 'Out', items: FX.TITLE_ANIMS.map((a) => ({ label: `${c.out === a.id ? '✓ ' : ''}${a.name}`, action: () => commit(C.patchAny(st.edit, ids, (k) => { k.out = a.id; }), `Out: ${a.name}`) })) }] } : null,
      c.kind === 'gap' && c.slot ? { label: 'Fill this slot with a video…', action: () => fillSlot(c.id) } : null,
      { label: 'Clip', items: () => [
        { label: 'Rename…', action: () => renameClip(c.id) },
        { label: 'Label color', items: LABELS.map(([n0, col]) => ({ label: `${(c.label || '') === col ? '✓ ' : ''}${n0}`, action: () => setLabel(n0, ids) })) },
        { label: c.off ? 'Turn it back on' : 'Turn off (hidden and silent)', action: () => toggleOff(ids) },
        visual && c.kind !== 'title' ? { label: 'Fill the frame (crop the edges)', action: () => fillFrame(ids) } : null,
        visual ? { label: 'Reset position, scale, rotation, opacity', action: () => resetTransform(ids) } : null,
        { label: 'Copy keyframes', action: () => copyKeys(c.id) }, keysClip ? { label: 'Paste keyframes', action: () => pasteKeys(ids) } : null,
        !isItem && i >= 0 && i < st.edit.clips.length - 1 ? { label: 'Swap with the next clip', action: () => swapNext(c.id) } : null,
        c.kind === 'gap' && st.edit.clips[i + 1]?.kind === 'video' ? { label: 'Fit to fill (the next clip takes this gap)', action: () => fitToFill(c.id) } : null,
        { label: 'In–out = the selection', action: rangeFromSelection },
        c.src ? { label: 'Match frame (open the source on this frame)', action: matchFrame } : null,
        !isItem && c.kind === 'video' ? { label: 'Hold the first frame (1 s before)', action: () => holdFrame('first', 1, c.id) } : null,
        !isItem && c.kind === 'video' ? { label: 'Hold the last frame (1 s after)', action: () => holdFrame('last', 1, c.id) } : null,
      ].filter(Boolean) },
      { label: 'Inspector', action: () => inspect(c.id) },
      c.src ? { more: true, label: 'Open the source in Review', action: () => { leave(); R().open(c.src); } } : null,
      c.src ? { more: true, label: 'Show the source file', action: () => window.hub.fs.reveal(c.src) } : null,
    ].filter(Boolean));
  }
  let lookClip = null;
  function trackMenu(k, x, y, T = P.T) {
    const add = { label: 'Add a track', items: [['video', 'Video / overlay track'], ['text', 'Text track'], ['audio', 'Audio track']].map(([t, l]) => ({ label: l, action: () => commit(C.addTrack(st.edit, t), `${l} added`) })) };
    if (!k) { showMenu(x, y, [add, { label: 'Add here', items: addItems(T) }]); return; }
    showMenu(x, y, [
      { label: `${k.hide ? 'Show' : 'Hide'} ${k.name}`, action: () => commit(C.patchTrack(st.edit, k.id, { hide: !k.hide }), `${k.name} ${k.hide ? 'shown' : 'hidden'}`) },
      { label: `${k.mute ? 'Unmute' : 'Mute'} ${k.name}`, action: () => commit(C.patchTrack(st.edit, k.id, { mute: !k.mute }), `${k.name} ${k.mute ? 'on' : 'muted'}`) },
      { label: `${k.lock ? 'Unlock' : 'Lock'} ${k.name}`, action: () => commit(C.patchTrack(st.edit, k.id, { lock: !k.lock }), `${k.name} ${k.lock ? 'unlocked' : 'locked'}`) },
      { label: 'Rename…', action: async () => { const v = await Modal.prompt('Track name', { value: k.name }); if (v?.trim()) commit(C.patchTrack(st.edit, k.id, { name: v.trim().slice(0, 24) }), 'Renamed'); } },
      k.type === 'text' && k.items.length ? { label: 'Every title on it: style', items: () => grouped(FX.TITLE_STYLES, (id) => restyleTrack(k.id, { style: id }), null) } : null,
      k.type === 'text' && k.items.length ? { label: 'Every title on it: animation', items: () => FX.TITLE_ANIMS.map((a) => ({ label: a.name, action: () => restyleTrack(k.id, { anim: a.id }) })) } : null,
      k.items.length ? { label: 'Shift it', items: [-10, -1, 1, 10].map((f) => ({ label: `${f > 0 ? '+' : ''}${f} frame${Math.abs(f) > 1 ? 's' : ''}`, action: () => shiftTrack(k.id, f) })) } : null,
      { label: 'Add here', items: addItems(T, k) },
      add,
      { label: `Delete ${k.name}${k.items.length ? ` and its ${k.items.length} item${k.items.length === 1 ? '' : 's'}` : ''}`, danger: true, action: () => commit(C.removeTrack(st.edit, k.id), `${k.name} deleted`) },
    ].filter(Boolean));
  }
  function markerMenu(m, x, y) {
    showMenu(x, y, [
      { label: `Go to ${m.label || 'the marker'} (${fmtProg(m.t)})`, action: () => seek(m.t, { play: false }) },
      { label: 'Rename…', action: async () => { const v = await Modal.prompt('Marker', { value: m.label || '' }); if (v != null) commit(C.patchMarker(st.edit, m.id, { label: v.trim() }), 'Marker renamed'); } },
      { label: m.note ? 'Edit the note…' : 'Add a note…', action: () => markerNote(m) },
      { label: 'Color', items: FX.MARKER_COLORS.map(([n, col]) => ({ label: `${(m.color || '#ffd75e') === col ? '✓ ' : ''}${n}`, action: () => commit(C.patchMarker(st.edit, m.id, { color: col }), `Marker ${n}`) })) },
      { label: 'In point here', action: () => setMark(m.t, st.edit.mark?.b ?? total()) },
      { label: 'Out point here', action: () => setMark(st.edit.mark?.a ?? 0, m.t) },
      { label: 'Split here', action: () => commit(C.split(st.edit, m.t), 'Split at the marker') },
      { label: 'Delete the marker', danger: true, action: () => commit(C.removeMarker(st.edit, m.id), 'Marker deleted') },
    ]);
  }
  async function markerNote(m) {
    const v = await Modal.prompt('Marker note', { value: m.note || '', label: `A note on ${m.label || 'the marker'} at ${fmtProg(m.t)} (the chats see it in the edit)` });
    if (v != null) commit(C.patchMarker(st.edit, m.id, { note: v.trim() }), v.trim() ? 'Note saved' : 'Note removed');
  }
  function rulerMenu(T, x, y) {
    showMenu(x, y, [
      { label: `Marker at ${fmtProg(T)}`, action: () => { seek(T, { play: false }); marker(); } },
      { label: 'In point here (I)', action: () => setMark(T, st.edit.mark?.b ?? total()) },
      { label: 'Out point here (O)', action: () => setMark(st.edit.mark?.a ?? 0, T) },
      st.edit.mark ? { label: 'Clear in–out (X)', action: () => setMark(null) } : null,
      { label: 'Zoom', items: [{ label: 'Zoom in (+)', action: () => zoomBy(2, T) }, { label: 'Zoom out (−)', action: () => zoomBy(0.5, T) }, { label: 'Fit the edit (\\)', action: zoomFit }, { label: 'Frames (zoom to 1 s)', action: () => setView(T - 0.5, T + 0.5) }] },
      { label: `${st.snap ? '✓ ' : ''}Snapping (N)`, action: () => toggleSnap() },
    ].filter(Boolean));
  }

  // ---------- actions ----------
  const selIds = () => [...st.sel].filter((id) => C.find(st.edit, id));
  const selClips = () => selIds().filter((id) => st.edit.clips.some((c) => c.id === id));
  const selItems = () => selIds().filter((id) => C.find(st.edit, id)?.where === 'item');
  const underHead = () => (P.T < C.mainTotal(st.edit) ? C.at(st.edit, Math.min(P.T, Math.max(0, C.mainTotal(st.edit) - 1e-4)))?.clip || null : null);
  const targetIds = () => (selClips().length ? selClips() : underHead() ? [underHead().id] : []);
  // the selection, items included; else the main-track clip under the playhead
  const targetAny = () => (selIds().length ? selIds() : underHead() ? [underHead().id] : []);
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
    const items = selItems();
    const ids = targetIds();
    if (!ids.length && !items.length) return false;
    let n = st.edit;
    if (ids.length) n = C.remove(n, ids, { ripple });
    if (items.length) n = C.removeItems(n, items);
    commit(n, items.length && !ids.length ? 'Deleted' : ripple ? 'Ripple delete' : 'Deleted (gap left)');
    st.sel.clear(); paintHead(); draw();
    return true;
  }
  function setSpeed(s, given) {
    const ids = (given || targetAny()).filter((id) => /video|audio/.test(C.find(st.edit, id)?.clip.kind));
    if (!ids.length) return null;
    const v = clamp(Number(s) || 1, 0.25, 4);
    commit(C.patchAny(st.edit, ids, (c) => { c.speed = v; const d = C.durOf(c); c.fadeIn = Math.min(c.fadeIn || 0, d / 2); c.fadeOut = Math.min(c.fadeOut || 0, d / 2); }), `${v}×`);
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

  // ---------- the editor's actions (menus, inspector, commands and the agents all come here) ----------
  const IMG = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
  const AUD = /\.(wav|mp3|m4a|aac|ogg|flac|opus)$/i;
  const VID = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;
  function setTransition(type, dur = null, ids = null) {
    const list = (ids || targetIds()).filter((id) => st.edit.clips.findIndex((c) => c.id === id) > 0);
    if (!list.length) { host.flash('Select a clip after a cut (the transition goes into it)'); return null; }
    const t = type ? FX.TRANS[type] || FX.find(FX.TRANSITIONS, type) : null;
    if (type && !t) return null;
    const d = dur ?? (st.edit.clips.find((c) => c.id === list[0])?.trans?.dur || t?.d || 0.5);
    commit(C.setTrans(st.edit, list, t?.id || null, t ? d : 0), t ? `${t.name} · ${d} s` : 'Straight cut');
    return t ? { type: t.id, dur: d } : null;
  }
  function setLook(id, ids = null, amt = null) {
    const list = ids || targetAny();
    if (!list.length) return null;
    const l = id ? FX.LOOK[id] || FX.find(FX.LOOKS, id) : null;
    if (id && !l) return null;
    commit(C.patchAny(st.edit, list, (c) => { if (!l) delete c.color; else c.color = { ...(c.color || {}), look: l.id, ...(amt != null ? { amt } : {}) }; }), l ? `Look: ${l.name}` : 'Look removed');
    return l;
  }
  // Effects (EditFX.EFFECTS): add one (or set its amount), remove one with amt 0, 'off' clears them all.
  function setEffect(id, ids = null, amt = 1) {
    const list = ids || targetAny();
    if (!list.length) return null;
    if (id === 'off' || id == null) { commit(C.patchAny(st.edit, list, (c) => { delete c.fx; }), 'Effects removed'); return 'off'; }
    const f = FX.EFFECT[id] || FX.find(FX.EFFECTS, id);
    if (!f) return null;
    commit(C.patchAny(st.edit, list, (c) => {
      const fx = (c.fx || []).filter((x) => x.id !== f.id);
      if (amt > 0) fx.push({ id: f.id, amt: clamp(Number(amt) || 1, 0, 1) });
      if (fx.length) c.fx = fx; else delete c.fx;
    }), amt > 0 ? `Effect: ${f.name}` : `${f.name} removed`);
    return f;
  }
  // Sound effects (EditFX.AUDIO_FX, heard in the render): toggle one, or 'off'
  function setAudioFx(id, ids = null, on = null) {
    const list = (ids || targetAny()).filter((x) => /video|audio/.test(C.find(st.edit, x)?.clip.kind));
    if (!list.length) return null;
    if (id === 'off') { commit(C.patchAny(st.edit, list, (c) => { delete c.afx; }), 'Sound effects removed'); return 'off'; }
    const a = FX.AFX[id] || FX.find(FX.AUDIO_FX, id);
    if (!a) return null;
    const first = C.find(st.edit, list[0]).clip;
    const want = on ?? !(first.afx || []).includes(a.id);
    commit(C.patchAny(st.edit, list, (c) => { const s0 = (c.afx || []).filter((x) => x !== a.id); if (want) s0.push(a.id); if (s0.length) c.afx = s0; else delete c.afx; }), want ? `Sound: ${a.name} (heard in the render)` : `${a.name} off`);
    return a;
  }
  // one adjustment (exposure, contrast… EditFX.ADJ) on the selection
  function adjust(key, value, ids = null) {
    const list = ids || targetAny();
    const a = FX.ADJ.find((x) => x.id === key);
    if (!list.length || !a) return null;
    commit(C.patchAny(st.edit, list, (c) => { c.color = { ...(c.color || {}), [key]: clamp(Number(value) || 0, a.min, a.max) }; }), `${a.name} ${value}`);
    return true;
  }
  function applyMotion(id, ids = null) {
    const m = FX.MOTION[id] || FX.find(FX.MOTIONS, id);
    const list = ids || targetAny();
    if (!m || !list.length) return null;
    let n = st.edit;
    for (const cid of list) {
      const f = C.find(n, cid); if (!f) continue;
      const d = f.where === 'clip' ? C.durOf(f.clip) : C.itemDur(f.clip);
      n = C.patchAny(n, cid, (c) => { if (c.keys) { for (const p of ['x', 'y', 'scale', 'rotate', 'opacity']) delete c.keys[p]; if (!Object.keys(c.keys).length) delete c.keys; } });
      for (const [prop, keys] of Object.entries(m.fn(d))) for (const [t, v, ease] of keys) n = C.setKey(n, cid, prop, t, v, ease || 'ease');
    }
    commit(n, `Motion: ${m.name}`);
    return m;
  }
  // A keyframe at the playhead on a property (value: the current value when null).
  function keyHere(prop, value = null, id = null, ease = 'ease') {
    const cid = id || targetAny()[0];
    const f = cid ? C.find(st.edit, cid) : null;
    if (!f || !C.KEY_PROPS.includes(prop)) return null;
    const start = f.where === 'clip' ? C.layout(st.edit)[f.i].start : f.clip.start;
    const t = clamp(P.T - start, 0, f.where === 'clip' ? C.durOf(f.clip) : C.itemDur(f.clip));
    const v = value ?? C.propAt(f.clip, prop, t);
    commit(C.setKey(st.edit, cid, prop, t, v, ease), `◆ ${prop} ${Number(v).toFixed(2)} at ${fmtProg(P.T)}`);
    return { t, v };
  }
  function trimToHead(edge, id = null) {
    const f = id ? C.find(st.edit, id) : null;
    if (f?.where === 'item') return commit(C.trimItem(st.edit, id, edge, P.T), 'Trimmed');
    return commit(C.trimTo(st.edit, P.T, edge), edge === 'in' ? 'Start trimmed to the playhead' : 'End trimmed to the playhead');
  }
  // a main-track clip goes up to an overlay track at the same time (a gap stays)
  function toOverlay(id) {
    const f = C.find(st.edit, id);
    if (f?.where !== 'clip') return false;
    const start = C.layout(st.edit)[f.i].start;
    let n = C.remove(st.edit, [id], { ripple: false });
    const { id: _o, trans: _t, ...rest } = f.clip;
    n = C.addItem(n, { ...rest, start });
    return commit(n, 'Moved to an overlay track');
  }
  function toMain(id) {
    const f = C.find(st.edit, id);
    if (f?.where !== 'item') return false;
    const { start: _s, id: _i, ...rest } = f.clip;
    return commit(C.insertAt(C.removeItems(st.edit, [id]), P.T, rest), 'Moved to the main track');
  }
  // ---------- more NLE moves ----------
  // Fill the frame (cover, cropping the edges) instead of fitting it: 16:9 footage in a 9:16 edit, say.
  function fillFrame(ids = null) {
    const list = (ids || targetAny()).filter((id) => { const k = C.find(st.edit, id)?.clip.kind; return k === 'video' || k === 'image' || k === 'freeze'; });
    if (!list.length) return null;
    const { W, H } = frameSize();
    commit(C.patchAny(st.edit, list, (c) => {
      const m = host.S.meta[c.src] || {}; const im = c.kind === 'image' ? imgThumb.get(c.src) : null;
      const w0 = m.w || im?.naturalWidth || W; const h0 = m.h || im?.naturalHeight || H;
      const fit = Math.min(W / w0, H / h0); const cover = Math.max(W / w0, H / h0);
      c.scale = Number((cover / fit).toFixed(4)); c.x = 0; c.y = 0;
    }), 'Fills the frame');
    return true;
  }
  function resetTransform(ids = null) { const list = ids || targetAny(); commit(C.patchAny(st.edit, list, (c) => { for (const k of ['opacity', 'scale', 'x', 'y', 'rotate']) delete c[k]; if (c.keys) { for (const k of ['opacity', 'scale', 'x', 'y', 'rotate']) delete c.keys[k]; if (!Object.keys(c.keys).length) delete c.keys; } }), 'Transform reset'); return true; }
  // Speed so the clip lasts exactly `secs` (fit to fill a slot, a beat, a title)
  function clipDuration(secs, id = null) {
    const cid = id || targetIds()[0]; const f = cid && C.find(st.edit, cid);
    if (!f || !/video|audio/.test(f.clip.kind) || !(secs > 0)) { if (f && (f.clip.kind === 'image' || f.clip.kind === 'title' || f.clip.kind === 'color' || f.clip.kind === 'freeze' || f.clip.kind === 'gap')) { commit(C.patchAny(st.edit, cid, (c) => { c.dur = Number(secs); }), `Length ${secs} s`); return 1; } return null; }
    const sp = (f.clip.out - f.clip.in) / secs;
    if (sp < 0.1 || sp > 8) { host.flash('That would need a speed outside 0.1–8×'); return null; }
    commit(C.patchAny(st.edit, cid, (c) => { c.speed = Number(sp.toFixed(4)); }), `Speed ${sp.toFixed(2)}× (lasts ${secs} s)`);
    return sp;
  }
  // Fit to fill: the clip after a gap takes the gap's length by changing its speed (the gap goes)
  function fitToFill(gapId) {
    const i = st.edit.clips.findIndex((c) => c.id === gapId);
    const g = st.edit.clips[i]; const c = st.edit.clips[i + 1];
    if (!g || g.kind !== 'gap' || c?.kind !== 'video') { host.flash('Fit to fill: a gap followed by a video clip'); return false; }
    let n = C.patchAny(st.edit, c.id, (x) => { x.speed = Number(((x.out - x.in) / (g.dur + C.durOf(x))).toFixed(4)); });
    n = C.remove(n, [g.id], { ripple: true });
    return commit(n, 'Fit to fill');
  }
  // Extend edit: the cut nearest the playhead rolls to it (Shift+E)
  function extendEdit() {
    const L = C.layout(st.edit);
    if (L.length < 2) return false;
    const near = L.slice(1).reduce((a, b) => (Math.abs(b.start - P.T) < Math.abs(a.start - P.T) ? b : a));
    return commit(C.roll(st.edit, near.i, frameStart(P.T) - near.start), 'Edit extended to the playhead');
  }
  // Swap a main-track clip with the next one
  function swapNext(id = null) { const cid = id || targetIds()[0]; const i = st.edit.clips.findIndex((c) => c.id === cid); if (i < 0 || i >= st.edit.clips.length - 1) return false; return commit(C.move(st.edit, cid, i + 2), 'Swapped with the next clip'); }
  // Shuffle the main track's clips (a montage idea); undo puts them back
  function shuffleClips() {
    const n = C.copy(st.edit);
    for (let i = n.clips.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [n.clips[i], n.clips[j]] = [n.clips[j], n.clips[i]]; }
    for (const c of n.clips) delete c.trans;
    return commit(n, 'Clips shuffled (⌘/Ctrl+Z undoes)');
  }
  // Match frame: the source of the clip under the playhead opens in Review on the same frame
  async function matchFrame() {
    const x = C.at(st.edit, Math.min(P.T, Math.max(0, C.mainTotal(st.edit) - 1e-4)));
    const top = C.stackAt(st.edit, P.T).filter((L) => L.clip.src && /video/.test(L.clip.kind)).pop();
    const c = top?.clip || x?.clip;
    if (!c?.src) { host.flash('No video under the playhead'); return false; }
    const t = c.kind === 'freeze' ? c.at : C.srcAt(c, P.T - (top ? top.start : x.start));
    leave();
    await R().open(c.src); await R().waitReady();
    R().seek((Math.floor(t * fpsOf(c.src) + 0.01) + 0.5) / fpsOf(c.src));
    return true;
  }
  // Labels, names, on / off
  const LABELS = [['none', ''], ['red', '#ff4d4d'], ['orange', '#ff8c42'], ['gold', '#ffd75e'], ['green', '#4fd18b'], ['blue', '#6bc7ff'], ['violet', '#9b8bff'], ['pink', '#ff6b9a']];
  function setLabel(color, ids = null) { const col = (LABELS.find(([n]) => n === color) || [0, color])[1]; commit(C.patchAny(st.edit, ids || targetAny(), (c) => { if (col) c.label = col; else delete c.label; }), col ? 'Label' : 'Label removed'); return true; }
  async function renameClip(id = null) { const cid = id || targetAny()[0]; const f = cid && C.find(st.edit, cid); if (!f) return false; const v = await Modal.prompt('Clip name', { value: f.clip.name || '' }); if (v == null) return false; return commit(C.patchAny(st.edit, cid, (c) => { if (v.trim()) c.name = v.trim().slice(0, 40); else delete c.name; }), 'Renamed'); }
  function toggleOff(ids = null) { const list = ids || targetAny(); const f = C.find(st.edit, list[0]); return commit(C.patchAny(st.edit, list, (c) => { c.off = !f?.clip.off; if (!c.off) delete c.off; }), f?.clip.off ? 'Clip on' : 'Clip off (hidden and silent)'); }
  // In–out = the selection's span (render or loop just that part)
  function rangeFromSelection() {
    const spans = selIds().map((id) => { const f = C.find(st.edit, id); if (f.where === 'clip') { const x = C.layout(st.edit)[f.i]; return [x.start, x.end]; } return [f.clip.start, C.itemEnd(f.clip)]; });
    if (!spans.length) { host.flash('Select clips first'); return null; }
    return setMark(Math.min(...spans.map((s0) => s0[0])), Math.max(...spans.map((s0) => s0[1])));
  }
  // Markers on the music: every beat / bar (or N bars) of the songs on the audio tracks (and the main track's sound)
  function beatMarkers(every = 4) {
    const out = [];
    const add = (src, a0, b0, start, speed) => { const a = analysisOf(src); if (!a?.beats) return false; a.beats.forEach((b, i) => { if (i % every === 0 && b >= a0 && b <= b0) out.push(start + (b - a0) / (speed || 1)); }); return true; };
    let found = false;
    for (const k of C.tracksOf(st.edit, 'audio')) for (const it of k.items) found = add(it.src, it.in, it.out, it.start, it.speed) || found;
    if (!found) for (const x of C.layout(st.edit)) if (x.clip.kind === 'video') found = add(x.clip.src, x.clip.in, x.clip.out, x.start, x.clip.speed) || found;
    if (!out.length) { host.flash(found ? 'No beats in that range' : 'The beats are still being found (music on an audio track, or a clip with sound)…'); return 0; }
    let n = st.edit;
    const have = new Set(st.edit.markers.map((m) => m.t.toFixed(2)));
    out.sort((a, b) => a - b).forEach((t, i) => { if (!have.has(t.toFixed(2))) n = C.addMarker(n, t, every === 1 ? `beat ${i + 1}` : `bar ${i + 1}`); });
    commit(n, `${out.length} markers on the ${every === 1 ? 'beats' : 'bars'}`);
    return out.length;
  }
  // Keyframes: copy / paste between clips
  let keysClip = null;
  function copyKeys(id = null) { const f = C.find(st.edit, id || targetAny()[0]); keysClip = f?.clip.keys ? C.copy(f.clip.keys) : null; host.flash(keysClip ? 'Keyframes copied' : 'No keyframes here'); return Boolean(keysClip); }
  function pasteKeys(ids = null) { if (!keysClip) return false; return commit(C.patchAny(st.edit, ids || targetAny(), (c) => { c.keys = C.copy(keysClip); }), 'Keyframes pasted'); }
  // Titles against the safe zone of every vertical app: which ones reach into the app buttons / captions
  function safeCheck(zone = 'all') {
    const { W, H } = frameSize();
    const z = V.zoneRects(zone, W, H);
    if (!z) return [];
    const [sx, sy, sw, sh] = z.safe;
    const g = document.createElement('canvas').getContext('2d');
    const out = [];
    for (const k of C.tracksOf(st.edit, 'text')) for (const it of k.items) {
      const s0 = VideoTitles.styleOf(it);
      const Lt = VideoTitles.layoutText(g, s0, it.text, s0.size * H, W, H);
      const box = [Lt.left / W, Lt.top / H, Lt.blockW / W, Lt.blockH / H];
      const inside = box[0] >= sx - 1e-3 && box[1] >= sy - 1e-3 && box[0] + box[2] <= sx + sw + 1e-3 && box[1] + box[3] <= sy + sh + 1e-3;
      out.push({ id: it.id, text: String(it.text).split('\n')[0], track: k.name, at: it.start, inside });
    }
    return out;
  }
  // Captions: an SRT / VTT file becomes title items on a new text track (a caption style); and back to SRT
  async function importCaptions(path, { style = 'caption-tiktok', anim = 'pop', offset = 0 } = {}) {
    const text = await window.hub.fs.read(path);
    const caps = C.parseCaptions(text);
    if (!caps.length) { host.flash('No captions found in that file'); return 0; }
    let n = C.addTrack(st.edit, 'text', 'Captions');
    const tid = n.tracks[n.tracks.length - 1].id;
    for (const c of caps) n = C.addItem(n, { kind: 'title', text: c.text, start: c.start + offset, dur: Math.max(0.2, c.end - c.start), style, anim, out: 'none', animDur: 0.25 }, { track: tid });
    commit(n, `${caps.length} captions`);
    return caps.length;
  }
  async function exportCaptions(out = null) {
    const srt = C.toSrt(st.edit);
    if (!srt.trim()) { host.flash('No titles to export as captions'); return null; }
    const file = out || join(homeDir(), 'exports', `${stemOf()}.srt`);
    await window.hub.fs.write(file, srt);
    toast(`Saved ${base(file)}`, { action: { label: IS_MAC ? 'Show in Finder' : 'Show in folder', fn: () => window.hub.fs.reveal(file) }, timeout: 7000 });
    return file;
  }
  // Match a picture's look (a reference gives the vibe, never the footage): the clip's exposure, contrast,
  // saturation, temperature and tint move toward the picture's, measured on the frame at the playhead.
  async function stats(src) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 96;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0, 96, 96);
    const d = g.getImageData(0, 0, 96, 96).data;
    let r = 0; let gg = 0; let b = 0; let l2 = 0; let ch = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const R0 = d[i] / 255; const G0 = d[i + 1] / 255; const B0 = d[i + 2] / 255; const L0 = 0.2126 * R0 + 0.7152 * G0 + 0.0722 * B0; r += R0; gg += G0; b += B0; l2 += L0 * L0; ch += Math.max(R0, G0, B0) - Math.min(R0, G0, B0); }
    r /= n; gg /= n; b /= n; const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    return { r, g: gg, b, L, sd: Math.sqrt(Math.max(0, l2 / n - L * L)), chroma: ch / n };
  }
  async function matchLook(imagePath, ids = null) {
    const list = (ids || targetAny()).filter((id) => /video|image|freeze/.test(C.find(st.edit, id)?.clip.kind));
    if (!list.length) return null;
    const im = new Image(); im.src = host.fileUrl(imagePath); await im.decode();
    const ref = await stats(im);
    const plain = C.patchAny(st.edit, list, (c) => { delete c.color; });
    const fr = await VideoComp.frameImage(P.T, { maxW: 200, edit: plain });
    const cur = await stats(fr.canvas);
    const cl = (x, a, b) => Math.max(a, Math.min(b, x));
    const color = {
      exposure: Number(cl(Math.log2((ref.L + 0.02) / (cur.L + 0.02)), -1.5, 1.5).toFixed(2)),
      contrast: Number(cl(ref.sd / Math.max(0.02, cur.sd) - 1, -0.6, 0.8).toFixed(2)),
      saturation: Number(cl(ref.chroma / Math.max(0.02, cur.chroma) - 1, -0.9, 0.9).toFixed(2)),
      temp: Number(cl(((ref.r - ref.b) - (cur.r - cur.b)) * 4, -1, 1).toFixed(2)),
      tint: Number(cl(((cur.g - (cur.r + cur.b) / 2) - (ref.g - (ref.r + ref.b) / 2)) * 5, -1, 1).toFixed(2)),
    };
    commit(C.patchAny(st.edit, list, (c) => { c.color = { ...color, matched: base(imagePath) }; }), `Look matched to ${base(imagePath)}`);
    return color;
  }
  // ---------- edit housekeeping ----------
  // Snapshots: named copies of the edit to try another idea and come back (kv video-edit-snapshots)
  async function snapshot(name = '') {
    const all = (await window.hub.kvGet('video-edit-snapshots', {})) || {};
    const list = all[st.path] || [];
    list.unshift({ name: name || `Snapshot ${list.length + 1}`, at: Date.now(), edit: C.copy(st.edit) });
    all[st.path] = list.slice(0, 30);
    await window.hub.kvSet('video-edit-snapshots', all);
    host.flash(`Saved “${list[0].name}”`);
    return list[0].name;
  }
  let snapCache = [];
  async function snapshots() { const all = (await window.hub.kvGet('video-edit-snapshots', {})) || {}; snapCache = all[st.path] || []; return snapCache; }
  async function restoreSnapshot(which) {
    const list = await snapshots();
    const s0 = typeof which === 'number' ? list[which] : list.find((x) => x.name.toLowerCase() === String(which).toLowerCase()) || list.find((x) => x.name.toLowerCase().includes(String(which).toLowerCase()));
    if (!s0) return null;
    commit(C.normalize(s0.edit), `Back to “${s0.name}”`);
    return s0.name;
  }
  // The edit as an EDL (CMX 3600) next to the video, for other editors
  async function exportEdl() {
    const file = join(homeDir(), 'exports', `${stemOf()}.edl`);
    await window.hub.fs.write(file, C.toEdl(st.edit, { fps: progFps(), title: stemOf().toUpperCase() }));
    toast(`Saved ${base(file)}`, { action: { label: IS_MAC ? 'Show in Finder' : 'Show in folder', fn: () => window.hub.fs.reveal(file) }, timeout: 7000 });
    return file;
  }
  // Sequences: duplicate / rename / delete the one you're in
  async function duplicateSequence(name = null) {
    const nm = name || `${isSeq() ? st.path.slice(4) : stemOf()} copy`;
    let key = `seq:${nm}`; for (let i = 2; cuts[key]; i += 1) key = `seq:${nm} ${i}`;
    const { lastItem: _l, ...keep } = C.copy(st.edit);
    if (!keep.seq) { const f = frameSize(); keep.seq = { w: f.W, h: f.H, fps: f.F }; }
    cuts[key] = keep; saveCuts();
    leave(); st.edit = null;
    await enter({ path: key });
    return key;
  }
  function renameSequence(name) {
    if (!isSeq() || !name) return null;
    const key = `seq:${name}`;
    if (cuts[key]) return null;
    cuts[key] = cuts[st.path]; delete cuts[st.path]; saveCuts();
    st.path = key; setTitle(name);
    return key;
  }
  // Lane height: compact / normal / tall (remembered)
  function laneSize(k) { st.laneK = { compact: 0.75, normal: 1, tall: 1.5 }[k] || 1; pref.set('cut.lanes', st.laneK); fitTrackHeight(); draw(); placeHead(); return st.laneK; }
  // the view centers on the playhead (zoomed in)
  function centerView() { if (!st.view) return false; const len = st.view.t1 - st.view.t0; setView(P.T - len / 2, P.T + len / 2); return true; }
  function markersAtCuts() { let n = st.edit; for (const t of C.cuts(st.edit)) n = C.addMarker(n, t, 'cut'); return commit(n, 'A marker on every cut'); }
  function clearMarkers() { const n = C.copy(st.edit); n.markers = []; return commit(n, 'Markers removed'); }
  // Hold the first / last frame of a clip for N seconds (a freeze right before / after it)
  function holdFrame(edge = 'last', dur = 1, id = null) {
    const cid = id || targetIds()[0]; const i = st.edit.clips.findIndex((c) => c.id === cid); const c = st.edit.clips[i];
    if (!c || c.kind !== 'video') return false;
    const L = C.layout(st.edit)[i];
    const fps = fpsOf(c.src);
    const at = edge === 'last' ? (c.reverse ? c.in : c.out - 1 / fps) : (c.reverse ? c.out - 1 / fps : c.in);
    return commit(C.insertAt(st.edit, edge === 'last' ? L.end : L.start, { kind: 'freeze', src: c.src, at: Number(at.toFixed(4)), dur, mute: true }), `Holds the ${edge} frame ${dur} s`);
  }
  // Every title of a text track takes a style / animation (captions restyled in one go)
  function restyleTrack(trackId, { style = null, anim = null } = {}) {
    const k = (st.edit.tracks || []).find((x) => x.id === trackId); if (!k) return false;
    return commit(C.patchAny(st.edit, k.items.map((x) => x.id), (x) => { if (style) { x.style = style; delete x.lower; } if (anim) x.anim = anim; }), style ? `Track restyled: ${FX.TSTYLE[style]?.name}` : `Track animated: ${FX.TANIM[anim]?.name}`);
  }
  // Shift a whole track by N frames (sync music / captions)
  function shiftTrack(trackId, frames) {
    const k = (st.edit.tracks || []).find((x) => x.id === trackId); if (!k) return false;
    const d = frames / progFps();
    return commit(C.patchAny(st.edit, k.items.map((x) => x.id), (x) => { x.start = Number(Math.max(0, x.start + d).toFixed(4)); }), `${k.name} ${frames > 0 ? '+' : ''}${frames} frames`);
  }
  // Every clip with sound gets the social loudness (−14 LUFS)
  function normalizeAll() {
    const ids = [...st.edit.clips.filter((c) => c.kind === 'video').map((c) => c.id), ...(st.edit.tracks || []).flatMap((k) => k.items.filter((x) => /video|audio/.test(x.kind)).map((x) => x.id))];
    return commit(C.patchAny(st.edit, ids, (c) => { const a = (c.afx || []).filter((x) => x !== 'loud'); a.push('loud'); c.afx = a; }), 'Every sound at −14 LUFS (in the render)');
  }
  // Solo: only the selected clips keep their sound (again: everyone back)
  function soloSound(ids = null) {
    const keep = new Set(ids || targetAny());
    const all = [...st.edit.clips, ...(st.edit.tracks || []).flatMap((k) => k.items)].filter((c) => /video|audio/.test(c.kind));
    const soloed = all.some((c) => c.soloMuted);
    return commit(C.patchAny(st.edit, all.map((c) => c.id), (c) => { if (soloed) { if (c.soloMuted) { delete c.soloMuted; c.mute = false; } } else if (!keep.has(c.id) && !c.mute) { c.mute = true; c.soloMuted = true; } }), soloed ? 'Every sound back' : 'Solo: only the selection is heard');
  }
  function rampClip(rampId, id = null) {
    const r = FX.RAMP[rampId] || FX.find(FX.RAMPS, rampId);
    const cid = id || targetIds()[0];
    if (!r || !cid) return null;
    const n = C.ramp(st.edit, cid, r.speeds);
    if (n === st.edit) return null;
    commit(n, `Speed ramp: ${r.name}`);
    return r;
  }
  // Items on tracks: overlay video / still, music, titles, lower thirds, color mattes
  async function addOverlay(path, { at = P.T, a = 0, b = null, track = null, ...props } = {}) {
    if (IMG.test(path)) return addImage(path, { at, track, ...props });
    if (AUD.test(path)) return addAudio(path, { at, a, b, track, ...props });
    const d = await durationOf(path);
    if (!d) { toast(`Can't read ${base(path)} as a video`, { type: 'error' }); return null; }
    const n = C.addItem(st.edit, { kind: 'video', src: path, in: clamp(a, 0, d), out: clamp(b ?? d, 0, d), max: d, start: frameStart(at), ...props }, { track });
    commit(n, `Overlay: ${noExt(base(path))}`);
    st.sel = new Set([n.lastItem]); paintHead(); draw();
    return n.lastItem;
  }
  async function addImage(path, { at = P.T, dur = 3, track = null, main = false, ...props } = {}) {
    if (main) { commit(C.insertAt(st.edit, at, { kind: 'image', src: path, dur, mute: true }), `Still: ${base(path)}`); return true; }
    const n = C.addItem(st.edit, { kind: 'image', src: path, start: frameStart(at), dur, ...props }, { track });
    commit(n, `Still: ${base(path)}`);
    st.sel = new Set([n.lastItem]); paintHead(); draw();
    return n.lastItem;
  }
  async function audioDuration(p) {
    const a = document.createElement('audio'); a.preload = 'metadata'; a.src = host.fileUrl(p);
    const out = await new Promise((res) => { a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(0); setTimeout(() => res(0), 8000); });
    a.removeAttribute('src');
    return out;
  }
  async function addAudio(path, { at = 0, a = 0, b = null, track = null, volume = 1 } = {}) {
    const d = VID.test(path) ? await durationOf(path) : await audioDuration(path);
    if (!d) { toast(`Can't read the sound of ${base(path)}`, { type: 'error' }); return null; }
    const n = C.addItem(st.edit, { kind: 'audio', src: path, in: clamp(a, 0, d), out: clamp(b ?? d, 0, d), max: d, start: frameStart(at), volume }, { track });
    commit(n, `Audio: ${noExt(base(path))}`);
    analysisOf(path);
    return n.lastItem;
  }
  function addTitleItem(text = 'Title', { at = P.T, dur = 3, style = 'bold', anim = 'fade-up', out = 'fade', lower = null, track = null, ...props } = {}) {
    const st0 = FX.TSTYLE[style] ? style : FX.find(FX.TITLE_STYLES, style)?.id || 'bold';
    const an = FX.TANIM[anim] ? anim : FX.find(FX.TITLE_ANIMS, anim)?.id || 'fade-up';
    const lt = lower ? FX.LTHIRD[lower]?.id || FX.find(FX.LOWER_THIRDS, lower)?.id || 'bar-gold' : null;
    const n = C.addItem(st.edit, { kind: 'title', text: String(text), start: frameStart(at), dur, style: lt ? undefined : st0, lower: lt || undefined, anim: lt ? FX.LTHIRD[lt].s.anim || an : an, out, animDur: 0.6, ...props }, { track });
    commit(n, lt ? `Lower third: ${FX.LTHIRD[lt].name}` : `Title: ${FX.TSTYLE[st0].name}`);
    st.sel = new Set([n.lastItem]); paintHead(); draw();
    return n.lastItem;
  }
  // Shapes and graphics (EditFX.SHAPES): a text-track item with no words, animated like a title
  function addShape(id, { at = P.T, dur = 3, anim = 'pop', out = 'fade', color = null, track = null, ...props } = {}) {
    const sh = FX.SHAPE[id] || FX.find(FX.SHAPES, id); if (!sh) return null;
    const an = FX.TANIM[anim] ? anim : FX.find(FX.TITLE_ANIMS, anim)?.id || 'pop';
    const n = C.addItem(st.edit, { kind: 'title', text: '', shape: sh.id, start: frameStart(at), dur, anim: an, out, animDur: 0.5, ...(color ? { color } : {}), ...props }, { track });
    commit(n, `Shape: ${sh.name}`);
    st.sel = new Set([n.lastItem]); paintHead(); draw();
    return n.lastItem;
  }
  function addColor(fill = '#000000', { at = P.T, dur = 2, main = true } = {}) {
    if (main) { commit(C.insertAt(st.edit, at, { kind: 'color', fill, dur, mute: true }), 'Color matte'); return true; }
    const n = C.addItem(st.edit, { kind: 'color', fill, start: at, dur, opacity: 0.5 });
    commit(n, 'Color layer');
    return n.lastItem;
  }
  // the "Add" menu (＋, right-click on a lane or empty track)
  function addItems(T = P.T, track = null) {
    const lab = (R().state.lib?.recordings || []).slice(-12).reverse();
    const lib = R().videos.slice(0, 16);
    const at = T;
    const tid = track?.id || null;
    return [
      { label: 'Video or picture file…', action: async () => { const ps = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video / picture / sound', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'wav', 'mp3', 'm4a'] }] }); let t = at; for (const p of ps || []) { if (track) await addOverlay(p, { at: t, track: tid }); else if (VID.test(p)) await addClip(p, { at: t }); else await addOverlay(p, { at: t }); t += 0; } } },
      lib.length ? { label: 'From the library', items: lib.map((v) => ({ label: base(v.path), items: [{ label: 'At the end of the main track', action: () => addClip(v.path) }, { label: 'Insert at the playhead', action: () => insertClip(v.path) }, { label: 'Overwrite at the playhead', action: () => overwriteClip(v.path) }, { label: 'As an overlay at the playhead', action: () => addOverlay(v.path, { at }) }] })) } : null,
      lab.length ? { label: 'Lab recordings', items: lab.map((p) => ({ label: base(p.path || p), action: () => addOverlay(p.path || p, { at }) })) } : null,
      { label: 'Title', items: () => grouped(FX.TITLE_STYLES, (id) => askTitle({ at, style: id, track: tid }), null) },
      { label: 'Lower third', items: () => FX.LOWER_THIRDS.map((l) => ({ label: l.name, action: () => askTitle({ at, lower: l.id, track: tid, value: 'Name Surname\\nRole' }) })) },
      { label: 'Shape or graphic', items: () => grouped(FX.SHAPES, (id) => addShape(id, { at, track: tid }), null) },
      { label: 'Music or sound…', action: async () => { const [p] = await window.hub.openDialog({ filters: [{ name: 'Sound', extensions: ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'mp4', 'mov'] }] }) || []; if (p) addAudio(p, { at: track ? at : 0, track: tid }); } },
      { label: 'Color matte', items: [['Black', '#000000'], ['White', '#ffffff'], ['Gold', '#ffc93b'], ['Ember', '#ff5a1f'], ['Violet', '#7a4bff'], ['Night blue', '#0b1230']].map(([n0, col]) => ({ label: n0, action: () => addColor(col, { at, main: !track }) })) },
      { label: 'Freeze frame here', action: () => freezeHere() },
      { label: 'Marker here', action: () => marker() },
      { label: 'Empty track', items: [['video', 'Video / overlay'], ['text', 'Text'], ['audio', 'Audio']].map(([t, l]) => ({ label: l, action: () => commit(C.addTrack(st.edit, t), `${l} track added`) })) },
    ].filter(Boolean);
  }
  async function askTitle({ at = P.T, style = 'bold', lower = null, track = null, value = '' } = {}) {
    const v = await Modal.prompt(lower ? 'Lower third' : 'Title', { value, label: 'The words (a new line: \\n). The inspector changes style, animation and place.' });
    if (v?.trim()) return addTitleItem(v.trim().replace(/\\n/g, '\n'), { at, style, lower, track });
    return null;
  }
  // Insert (ripple) / overwrite a library video at the playhead on the main track.
  async function insertClip(path, { a = 0, b = null, at = P.T } = {}) {
    const d = await durationOf(path); if (!d) return false;
    return commit(C.insertAt(st.edit, at, C.videoClip(path, clamp(a, 0, d), clamp(b ?? d, 0, d), d)), `Inserted ${noExt(base(path))}`);
  }
  async function overwriteClip(path, { a = 0, b = null, at = P.T } = {}) {
    const d = await durationOf(path); if (!d) return false;
    return commit(C.overwrite(st.edit, at, C.videoClip(path, clamp(a, 0, d), clamp(b ?? d, 0, d), d)), `Overwrote with ${noExt(base(path))}`);
  }
  // put a video in a template slot (a gap): it fills the slot's length
  async function fillSlot(gapId, path = null) {
    const p = path || (await window.hub.openDialog({ filters: [{ name: 'Video or picture', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'png', 'jpg', 'jpeg', 'webp'] }] }) || [])[0];
    if (!p) return false;
    if (IMG.test(p)) return commit(C.fillGap(st.edit, gapId, { kind: 'image', src: p, mute: true }), `Slot: ${base(p)}`);
    const d = await durationOf(p); if (!d) return false;
    return commit(C.fillGap(st.edit, gapId, C.videoClip(p, 0, d, d)), `Slot: ${base(p)}`);
  }
  const splitAllHere = (T = P.T) => commit(C.splitAll(st.edit, T), '✂ Split every track');
  function liftRange(extract = false) {
    const mk = st.edit.mark;
    if (!mk) { host.flash('Set in and out first (I / O)'); return false; }
    const n = extract ? C.extract(st.edit, mk.a, mk.b) : C.lift(st.edit, mk.a, mk.b);
    n.mark = null;
    return commit(n, extract ? 'Extracted (closed up)' : 'Lifted (gap left)');
  }
  function toggleSnap(on) { st.snap = on ?? !st.snap; pref.set('cut.snap', st.snap); host.flash(st.snap ? 'Snapping on' : 'Snapping off (frames only)'); paintHead(); return st.snap; }
  function toggleRazor(on) { st.razor = on ?? !st.razor; st.hoverX = null; host.flash(st.razor ? '✂ Razor: click a clip to cut it (B or Esc ends)' : 'Razor off'); paintHead(); draw(); return st.razor; }
  // The program's frame: a social format (9:16…), a size, a frame rate; null goes back to the video's own.
  function setFormat(fmt0, fps = null) {
    if (fmt0 === null || fmt0 === 'source' || fmt0 === 'off') { commit(C.setSeq(st.edit, null), 'Format: the video\'s own'); return frameSize(); }
    const f = typeof fmt0 === 'object' ? fmt0 : FX.FORMATS.find((x) => x.id === fmt0) || FX.find(FX.FORMATS, fmt0);
    const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/.exec(String(fmt0 || ''));
    const size = f ? { w: f.w, h: f.h } : m ? { w: Number(m[1]), h: Number(m[2]) } : null;
    const cur = frameSize();
    const seq = { w: size?.w || cur.W, h: size?.h || cur.H, fps: Number(fps) || st.edit.seq?.fps || cur.F };
    commit(C.setSeq(st.edit, seq), `Format ${seq.w}×${seq.h} · ${seq.fps} fps`);
    syncRich();
    return frameSize();
  }
  // A template: a whole starting edit (format, slots, titles, transitions, markers). The open edit is replaced
  // (undoable); with keep, the template's titles and markers are laid over the clips you have.
  function applyTemplate(id, { keep = false } = {}) {
    const t = FX.TEMPLATE[id] || FX.find(FX.TEMPLATES, id);
    if (!t) return null;
    const b = t.build();
    const f = FX.FORMATS.find((x) => x.id === t.fmt);
    let n = keep ? C.copy(st.edit) : { ...C.empty(), mark: null };
    if (!keep) {
      n.clips = b.clips.map((c) => ({ fadeIn: 0, fadeOut: 0, speed: 1, mute: true, ...c, id: C.uid() }));
      // transitions overlap the slots: the slots stretch so the edit lasts the template's length
      const gaps = n.clips.filter((c) => c.kind === 'gap');
      const short = t.secs - C.mainTotal(n);
      if (gaps.length && Math.abs(short) > 1e-3) for (const g of gaps) g.dur = Number((g.dur + short / gaps.length).toFixed(4));
    }
    n = C.setSeq(n, { w: f.w, h: f.h, fps: 30 });
    for (const m of b.markers || []) n = C.addMarker(n, m.t, m.label);
    for (const it of b.text || []) n = C.addItem(n, { ...it });
    if (b.look) n = C.patchAny(n, n.clips.map((c) => c.id), (c) => { c.color = { look: b.look }; });
    if (b.motion) for (const c of n.clips) for (const [prop, keys] of Object.entries(FX.MOTION[b.motion].fn(C.durOf(c)))) for (const [tt, v, e0] of keys) n = C.setKey(n, c.id, prop, tt, v, e0 || 'ease');
    commit(n, `Template: ${t.name}`);
    seek(0, { play: false });
    return t;
  }
  // Compound clip: the selected main-track clips rendered into one file (kept with the clip so it can be un-nested).
  async function nestSelection() {
    const ids = selClips();
    if (ids.length < 2) { host.flash('Select two or more clips (Shift+click) to nest them'); return false; }
    const L = C.layout(st.edit);
    const idx = ids.map((id) => L.findIndex((x) => x.clip.id === id)).sort((a, b) => a - b);
    if (idx.some((v, i) => i && v !== idx[i - 1] + 1)) { host.flash('Nest clips that sit next to each other'); return false; }
    const part = { ...C.empty(), clips: idx.map((i) => C.copy(st.edit.clips[i])), seq: st.edit.seq };
    delete part.clips[0].trans;
    const dir = join(dirOf(mainSrc() || R().state.videos[0]?.path || ''), 'exports');
    const out = join(dir, `${noExt(base(mainSrc() || 'edit'))}_nest_${Date.now().toString(36)}.mp4`);
    const job = await renderEdit(part, { out, label: 'Nesting the clips…', library: false });
    if (!job) return false;
    const ev = await job.done;
    if (ev.code !== 0) { toast(`Couldn't nest: ${ev.error || ev.code}`, { type: 'error' }); return false; }
    const d = C.total(part);
    const n = C.copy(st.edit);
    const nest = { kind: 'video', src: out, in: 0, out: Number(d.toFixed(4)), max: d, speed: 1, mute: false, fadeIn: 0, fadeOut: 0, id: C.uid(), nest: part.clips, trans: st.edit.clips[idx[0]].trans };
    n.clips.splice(idx[0], idx.length, nest);
    commit(n, `Nested ${idx.length} clips`);
    return true;
  }
  function unnest(id) {
    const i = st.edit.clips.findIndex((c) => c.id === id);
    const c = st.edit.clips[i];
    if (!c?.nest) return false;
    const n = C.copy(st.edit);
    n.clips.splice(i, 1, ...c.nest.map((x) => ({ ...x, id: C.uid() })));
    return commit(n, 'Un-nested');
  }
  // Exact frames: where the playhead is, what each decoder shows (requestVideoFrameCallback), the timecode.
  async function frameInfo() {
    const F = progFps();
    const T = P.T;
    const n = C.frameOf(T, F);
    if (richOn) { const r = await VideoComp.renderExact(T); return { frame: n, timecode: V.tc(T, F), fps: F, time: Number(T.toFixed(4)), layers: r?.checks || [] }; }
    const x = C.at(st.edit, Math.min(T, Math.max(0, total() - 1e-4)));
    const el0 = active();
    const out = { frame: n, timecode: V.tc(T, F), fps: F, time: Number(T.toFixed(4)), layers: [] };
    if (x?.clip.kind === 'video' && el0?.dataset.key) {
      const fps = fpsOf(x.clip.src);
      for (let i = 0; i < 30 && el0._seekId && el0._mtId !== el0._seekId; i += 1) await new Promise((r) => setTimeout(r, 20));
      const mt = el0._seekId && el0._mtId === el0._seekId ? el0._mt : null;
      out.layers.push({ id: x.clip.id, src: x.clip.src, fps, want: Math.floor(x.srcTime * fps + 1e-4), got: mt == null ? Math.floor(el0.currentTime * fps + 1e-4) : Math.floor(mt * fps + 0.5), via: mt == null ? 'currentTime' : 'requestVideoFrameCallback' });
    }
    return out;
  }
  // go to program frame n (or a timecode / time text)
  function goFrame(n) { const F = progFps(); return seek(C.frameTime(Number(n) || 0, F), { play: false }); }
  // a typed / asked time lands in the middle of its frame (a decoder at an exact frame boundary may show the one before)
  function frameMid(t) { const F = progFps(); const D = total(); if (!(t > 0)) return 0.5 / F; if (t >= D - 0.5 / F) return D; return Math.min(D, (Math.floor(t * F + 1e-4) + 0.5) / F); }

  // ---------- keys (only while editing) ----------
  const SWALLOW = new Set(['p', 'y', 'c']); // Review keys that act on the source video, not the edit
  let clipboard = null; // copied clips / items (Ctrl+C with a selection)
  // nudge the selection by n frames: items move, a main-track clip slides
  function nudge(n) {
    const F = progFps(); const d = n / F;
    let next = st.edit;
    for (const id of selIds()) {
      const f = C.find(next, id);
      if (f?.where === 'item') next = C.moveItem(next, id, Math.max(0, f.clip.start + d));
      else if (f) next = C.slide(next, id, d);
    }
    if (next !== st.edit) commit(next, `${n > 0 ? '+' : ''}${n} frame${Math.abs(n) > 1 ? 's' : ''}`);
  }
  function slipSel(n) { const ids = targetAny(); if (ids.length) commit(C.slip(st.edit, ids, n / progFps()), `Slip ${n > 0 ? '+' : ''}${n}`); }
  // move a selected item to the next track of its kind above (dir −1) or below (+1)
  function itemTrack(dir) {
    const id = selItems()[0]; const f = id ? C.find(st.edit, id) : null;
    if (!f) return;
    const list = C.tracksOf(st.edit, f.track.type);
    const i = list.findIndex((k) => k.id === f.track.id);
    const to = list[i - dir]; // lanes draw higher tracks first
    if (to) commit(C.moveItem(st.edit, id, f.clip.start, to.id), `To ${to.name}`);
  }
  function jumpKey(dir) {
    const id = targetAny()[0]; const f = id ? C.find(st.edit, id) : null;
    if (!f?.clip.keys) return null;
    const start = f.where === 'clip' ? C.layout(st.edit)[f.i].start : f.clip.start;
    const times = [...new Set(Object.values(f.clip.keys).flat().map((k) => start + k.t))].sort((a, b) => a - b);
    const t = dir > 0 ? times.find((x) => x > P.T + 1e-3) : [...times].reverse().find((x) => x < P.T - 1e-3);
    if (t != null) seek(t, { play: false });
    return t;
  }
  function jumpMarker(dir) { const list = st.edit.markers.map((m) => m.t); const t = dir > 0 ? list.find((x) => x > P.T + 1e-3) : [...list].reverse().find((x) => x < P.T - 1e-3); if (t != null) seek(t, { play: false }); return t; }
  function copySel() {
    const ids = selIds();
    if (!ids.length) return false;
    clipboard = ids.map((id) => { const f = C.find(st.edit, id); return { where: f.where, clip: C.copy(f.clip), track: f.track?.type, start: f.where === 'item' ? f.clip.start : C.layout(st.edit)[f.i].start }; });
    host.flash(`${ids.length} copied`);
    return true;
  }
  function paste() {
    if (!clipboard?.length) return false;
    const t0 = Math.min(...clipboard.map((x) => x.start));
    let n = st.edit;
    for (const x of clipboard.filter((y) => y.where === 'clip').reverse()) { const { id: _i, trans: _t, ...rest } = x.clip; n = C.insertAt(n, P.T, rest); }
    for (const x of clipboard.filter((y) => y.where === 'item')) { const { id: _i, ...rest } = x.clip; n = C.addItem(n, { ...rest, start: P.T + (x.start - t0) }); }
    return commit(n, `${clipboard.length} pasted`);
  }
  function selectAll() { st.sel = new Set([...st.edit.clips.map((c) => c.id), ...(st.edit.tracks || []).flatMap((k) => k.items.map((x) => x.id))]); paintHead(); draw(); }
  function onKey(e) {
    if (!st.on) return false;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { if (e.shiftKey) redo(); else undo(); return true; }
    if (mod && k === 'y') { redo(); return true; }
    if (mod && k === 'd') { const id = targetIds()[0]; if (id) commit(C.duplicate(st.edit, id), 'Duplicated'); return true; }
    if (mod && k === 'c' && selIds().length && !getSelection().toString()) return copySel();
    if (mod && k === 'v' && clipboard) return paste();
    if (mod && k === 'a') { selectAll(); return true; }
    if (mod && (k === '=' || k === '+')) { zoomBy(2); paintHead(); return true; }
    if (mod && k === '-') { zoomBy(0.5); paintHead(); return true; }
    if (mod) return false;
    if (e.altKey) {
      const alt = {
        arrowleft: () => nudge(e.shiftKey ? -10 : -1), arrowright: () => nudge(e.shiftKey ? 10 : 1),
        arrowup: () => itemTrack(-1), arrowdown: () => itemTrack(1),
        ',': () => slipSel(-1), '.': () => slipSel(1), '≤': () => slipSel(-1), '≥': () => slipSel(1),
        k: () => { for (const p of ['opacity', 'x', 'y', 'scale', 'rotate']) keyHere(p); }, '˚': () => { for (const p of ['opacity', 'x', 'y', 'scale', 'rotate']) keyHere(p); },
        t: () => askTitle({ at: P.T }), '†': () => askTitle({ at: P.T }),
      }[k];
      if (alt) { alt(); return true; }
      return false;
    }
    const act = {
      ' ': () => (P.playing ? pause() : startPlay()), k: () => shuttle(0), l: () => shuttle(1), j: () => shuttle(-1),
      arrowleft: () => step(e.shiftKey ? -10 : -1), arrowright: () => step(e.shiftKey ? 10 : 1),
      arrowup: () => (e.shiftKey ? jumpKey(-1) : jumpCut(-1)), arrowdown: () => (e.shiftKey ? jumpKey(1) : jumpCut(1)), home: () => seek(0, { play: false }), end: () => seek(total(), { play: false }),
      pageup: () => jumpMarker(-1), pagedown: () => jumpMarker(1),
      ',': () => jumpBeat(-1), '.': () => jumpBeat(1),
      s: () => (e.shiftKey ? splitAllHere() : split()), delete: () => del(e.shiftKey), backspace: () => del(e.shiftKey),
      q: () => trimToHead('in', selItems()[0]), w: () => trimToHead('out', selItems()[0]),
      d: () => (e.shiftKey ? toggleDissolve() : (() => { const id = targetIds()[0]; if (id) commit(C.duplicate(st.edit, id), 'Duplicated'); })()),
      a: () => { const ids = targetAny(); if (ids.length) commit(C.patchAny(st.edit, ids, (c) => { c.mute = !c.mute; }), 'Sound toggled'); },
      '[': () => nudgeSpeed(-1), ']': () => nudgeSpeed(1), m: () => (e.shiftKey ? markerWithNote() : marker()),
      i: () => setMark(P.T, st.edit.mark?.b ?? total()), o: () => setMark(st.edit.mark?.a ?? 0, P.T), x: () => setMark(null),
      b: () => toggleRazor(), n: () => toggleSnap(), r: () => { const ids = targetAny(); if (ids.length) commit(C.setReverse(st.edit, ids), 'Reverse toggled'); },
      '+': () => { zoomBy(2); paintHead(); }, '=': () => { zoomBy(2); paintHead(); }, '-': () => { zoomBy(0.5); paintHead(); }, '\\': () => { zoomFit(); paintHead(); },
      enter: () => (st.suggest ? acceptSuggestion() : selIds().length ? inspect(selIds()[0]) : null), e: () => leave(),
      escape: () => { if (st.razor) toggleRazor(false); else if (st.suggest) suggest('off'); else if (st.sel.size) { st.sel.clear(); paintHead(); draw(); } else leave(); },
      '?': () => help(),
    };
    if (e.shiftKey && k === 'f') { freezeHere(); return true; }
    if (e.shiftKey && k === 'e') { extendEdit(); return true; }
    if (e.shiftKey && k === 't') { addTitle(); return true; }
    if (e.shiftKey && k === 'l') return false;
    const fn = act[k];
    if (fn) { fn(); return true; }
    if (SWALLOW.has(k)) { host.flash('Picker, scopes and compare work on the source: E leaves the edit'); return true; }
    return false;
  }
  function toggleDissolve() {
    // Shift+D: a cross dissolve on the cut nearest the playhead (again: removes it)
    const L = C.layout(st.edit);
    if (L.length < 2) return null;
    const near = L.slice(1).reduce((a, b) => (Math.abs(b.start + b.td / 2 - P.T) < Math.abs(a.start + a.td / 2 - P.T) ? b : a));
    return setTransition(near.clip.trans ? null : 'dissolve', near.clip.trans ? 0 : 0.5, [near.clip.id]);
  }
  async function markerWithNote() { marker(); const m = st.edit.markers.reduce((a, b) => (Math.abs(b.t - P.T) < Math.abs(a.t - P.T) ? b : a)); await markerNote(m); }
  const MODK = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const KEYS = [
    ['E / Esc', 'Edit on / off'], ['Space · J K L', 'Play the edit · shuttle'], ['← / →', 'One frame (Shift: 10)'], ['↑ / ↓', 'Previous / next cut (Shift: keyframe)'], [', / .', 'Previous / next beat'], ['PgUp / PgDn', 'Previous / next marker'],
    ['S', 'Split at the playhead'], ['Shift+S', 'Split every track at the playhead'], ['B', 'Razor: click clips to cut them'], ['Del', 'Delete (main track: leaves a gap)'], ['Shift+Del', 'Ripple delete (with I/O and nothing selected: the range)'],
    ['Q / W', 'Trim the start / end to the playhead'], ['D', 'Duplicate'], ['Shift+D', 'Cross dissolve on the nearest cut'], ['A', 'Mute the sound'], ['R', 'Reverse the clip'], ['[ / ]', 'Speed slower / faster (pitch kept)'],
    ['I / O · X', 'In / out of the range · clear'], ['M · Shift+M', 'Marker · marker with a note'], ['Shift+F', 'Freeze frame (1 s)'], ['Shift+T · Alt+T', 'Title card · title over the picture'],
    ['N', 'Snapping on / off'], ['Shift+E', 'Extend edit: the nearest cut rolls to the playhead'], ['+ / − · \\', 'Zoom the timeline · fit'], [`${MODK}+wheel`, 'Zoom at the pointer (wheel scrolls when zoomed)'],
    ['Alt+← / →', 'Nudge the selection one frame (Shift: 10)'], ['Alt+, / .', 'Slip the clip one frame'], ['Alt+↑ / ↓', 'Move a layer to the track above / below'], ['Alt+K', 'Keyframe position, scale, rotation, opacity'],
    ['Alt (hold)', 'Track switches: hide · mute · lock'], ['Enter', 'Accept the auto-cut, else open the inspector'], [`${MODK}+C / V`, 'Copy / paste clips and layers'], [`${MODK}+A`, 'Select everything'], [`${MODK}+Z / ${MODK}+Shift+Z`, 'Undo / redo'],
    ['Drag', 'Edge: trim (snaps; Alt: free) · Shift+edge: roll · body: reorder / move · Shift+body: slide · Ctrl+body: slip · gold squares: fades'], ['Drop', 'Videos, pictures, sounds or library cards'], ['Right-click', 'Clips, layers, cuts, markers, lanes and the ruler have menus'],
  ];
  function help() { Modal.alert('Video editor: keys', KEYS.map(([k, d]) => `${k.padEnd(16)} ${d}`).join('\n')); }
  // the keys button (bottom left) lists these while the editor is open
  function registerKeys() {
    if (typeof Keys === 'undefined') return;
    // the registry keeps Ctrl (keys-ui shows ⌘ on a Mac itself and must read the combo to press it for you)
    Keys.add(KEYS.map(([keys, what]) => ({ area: 'Editor', keys: keys.replace(/⌘/g, 'Ctrl'), what, when: () => st.on })));
    Keys.add({ area: 'Video Review', keys: 'E', what: 'Open the video editor (cut, layers, titles, transitions, export)' });
  }

  // ---------- menus ----------
  function moreMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    snapshots().catch(() => {}); // refresh the cache; the submenu reads it when hovered
    showMenu(Math.max(8, r.right - 300), r.bottom + 4, [
      { label: '✂ Auto-cut on the music', items: Object.entries(SUGGEST_LABEL).map(([k, l]) => ({ label: `Cut ${l}`, action: () => suggest(k) })) },
      { label: 'Transitions on every cut', items: () => [...grouped(FX.TRANSITIONS.filter((t) => t.id !== 'cut'), (id) => commit(C.transAll(st.edit, id, FX.TRANS[id].d), `${FX.TRANS[id].name} on every cut`), null), { label: 'Remove them all', action: () => commit(C.transAll(st.edit, null, 0), 'Straight cuts') }] },
      { label: 'Template', items: () => FX.TEMPLATES.map((t) => ({ label: t.name, items: [{ label: 'Start from it (replaces the edit, undoable)', action: () => applyTemplate(t.id) }, { label: 'Lay its titles and markers over my clips', action: () => applyTemplate(t.id, { keep: true }) }] })) },
      { label: 'Range (in–out)', items: () => [
        { label: 'Lift (leave a gap)', action: () => liftRange(false) }, { label: 'Extract (close up)', action: () => liftRange(true) },
        { label: 'Clear (X)', action: () => setMark(null) }] },
      { label: 'Captions', items: [
        { label: 'Import an SRT / VTT file…', action: async () => { const [p] = await window.hub.openDialog({ filters: [{ name: 'Captions', extensions: ['srt', 'vtt'] }] }) || []; if (p) importCaptions(p); } },
        { label: 'Save the titles as SRT', action: () => exportCaptions() }] },
      { label: 'Markers on the music', items: [[1, 'Every beat'], [4, 'Every bar'], [8, 'Every 2 bars'], [16, 'Every 4 bars']].map(([n0, l]) => ({ label: l, action: () => beatMarkers(n0) })) },
      { label: 'Check titles against the safe zone', action: () => { const r0 = safeCheck(); const bad = r0.filter((x) => !x.inside); host.flash(r0.length ? (bad.length ? `${bad.length} title${bad.length === 1 ? '' : 's'} reach into the app buttons: ${bad.map((x) => `“${x.text}”`).join(', ')}` : 'Every title sits in the safe zone ✓') : 'No titles yet'); if (bad[0]) inspect(bad[0].id); } },
      { label: 'Shuffle the clips (montage idea)', action: shuffleClips },
      { label: 'Freeze frame here (Shift+F)', action: () => freezeHere() },
      { label: 'Title card here (Shift+T)…', action: async () => { const v = await Modal.prompt('Title card', { value: '', label: 'The words on the card (a new line: \\n). 2 seconds, inserted at the playhead.' }); if (v?.trim()) addTitle(v.trim()); } },
      { label: 'Marker here (M)', action: () => marker() },
      st.edit.clips.some((c) => c.kind === 'gap') ? { label: 'Close the gaps', action: closeGaps } : null,
      { label: 'Tools', items: () => [
        { label: `${st.razor ? '✓ ' : ''}Razor (B)`, action: () => toggleRazor() }, { label: `${st.snap ? '✓ ' : ''}Snapping (N)`, action: () => toggleSnap() },
        { label: 'Split every track here (Shift+S)', action: () => splitAllHere() }, { label: 'Select everything', action: selectAll },
        { label: 'Zoom to fit (\\)', action: zoomFit }, { label: 'Frame-check the playhead', action: async () => { const r0 = await frameInfo(); host.flash(`${r0.timecode} · f${r0.frame}${r0.layers.map((x) => ` · ${base(x.src)} f${x.got}${x.got === x.want ? ' ✓' : ` (want ${x.want})`}`).join('')}`); } },
        { label: 'Nest the selection (compound clip)', action: () => nestSelection() },
        { label: 'Lane height', items: [['compact', 'Compact'], ['normal', 'Normal'], ['tall', 'Tall']].map(([k0, l]) => ({ label: `${(st.laneK || 1) === { compact: 0.75, normal: 1, tall: 1.5 }[k0] ? '✓ ' : ''}${l}`, action: () => laneSize(k0) })) },
        st.view ? { label: 'Center on the playhead', action: centerView } : null,
        { label: 'A marker on every cut', action: markersAtCuts },
        st.edit.markers.length ? { label: 'Remove every marker', action: clearMarkers } : null,
        { label: 'Every sound at social loudness (−14 LUFS)', action: normalizeAll },
        { label: 'Solo the selection\'s sound (again: all back)', action: () => soloSound() },
      ].filter(Boolean) },
      { label: 'Snapshots', items: () => [{ label: 'Save a snapshot of this edit…', action: async () => { const v = await Modal.prompt('Snapshot name', { value: '' }); if (v != null) snapshot(v.trim()); } }, ...snapCache.map((s0, i) => ({ label: `Back to “${s0.name}” (${new Date(s0.at).toLocaleTimeString()})`, action: () => restoreSnapshot(i) }))] },
      { label: 'Sequence', items: () => [
        { label: 'Duplicate this edit as a new sequence', action: () => duplicateSequence() },
        isSeq() ? { label: 'Rename the sequence…', action: async () => { const v = await Modal.prompt('Sequence name', { value: st.path.slice(4) }); if (v?.trim()) renameSequence(v.trim()); } } : null,
        { label: 'Save as an EDL (for other editors)', action: () => exportEdl() },
      ].filter(Boolean) },
      { label: 'Undo', action: undo }, { label: 'Redo', action: redo },
      { more: true, label: 'Copy the edit list', action: () => copyText(C.describeAll(st.edit, { tc: fmtProg }).join('\n'), 'Edit list copied') },
      { more: true, label: 'Back to the whole video', danger: true, action: reset },
      { more: true, label: 'Keys (?)', action: help },
    ].filter(Boolean));
  }
  // the format chip: the program's shape and frame rate, safe zones
  function formatMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const { W: w0, H: h0, F } = frameSize();
    showMenu(r.left, r.bottom + 4, [
      ...FX.FORMATS.slice(0, 4).map((f) => ({ label: `${w0 === f.w && h0 === f.h ? '✓ ' : ''}${f.name}`, action: () => setFormat(f.id) })),
      { label: 'More sizes', items: FX.FORMATS.slice(4).map((f) => ({ label: `${w0 === f.w && h0 === f.h ? '✓ ' : ''}${f.name} · ${f.w}×${f.h}`, action: () => setFormat(f.id) })) },
      { label: `Frame rate: ${Number(F.toFixed(3))} fps`, items: FX.FPS.map((x) => ({ label: `${Math.abs(x - F) < 0.01 ? '✓ ' : ''}${x} fps`, action: () => setFormat({ w: w0, h: h0 }, x) })) },
      { label: 'Safe zones', items: [['', 'Off'], ['all', 'Every vertical app'], ['tiktok', 'TikTok'], ['reels', 'Reels'], ['shorts', 'Shorts'], ['feed45', 'Feed 4:5'], ['youtube', 'YouTube']].map(([id, l]) => ({ label: `${(host.S.overlay.safe || '') === id ? '✓ ' : ''}${l}`, action: () => R().setSafe(id) })) },
      st.edit.seq ? { label: 'The video\'s own format', action: () => setFormat(null) } : null,
    ].filter(Boolean));
  }
  function exportMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const mk = st.edit?.mark;
    const P0 = (id) => V.EXPORT_PRESETS.find((p) => p.id === id);
    const socials = ['tiktok', 'reels', 'shorts', 'feed45', 'square', 'yt1080'];
    showMenu(Math.max(8, r.right - 320), r.bottom + 4, [
      { label: `⇪ Export the edit${mk ? ' (in–out)' : ''} as a new version`, action: () => exportCut({}) },
      { label: 'Socials', items: [...socials.map((id) => ({ label: `${P0(id).name} · ${P0(id).w}×${P0(id).h}`, action: () => exportCut({ preset: id }) })),
        { label: 'All 4 socials (9:16 · 4:5 · 1:1 · 16:9)', action: () => exportAll() }, { label: 'All 4 socials, blurred fill', action: () => exportAll({ fit: 'blur' }) },
        ...V.EXPORT_PRESETS.filter((p) => !socials.includes(p.id) && !['gif', 'webm', 'master', 'proxy'].includes(p.id)).map((p) => ({ label: `${p.name}${p.w && p.h ? ` · ${p.w}×${p.h}` : ''}`, action: () => exportCut({ preset: p.id }) })),
        ...FX.EXPORTS.filter((p) => p.w && p.h && !p.codec).map((p) => ({ label: `${p.name} · ${p.w}×${p.h}`, action: () => exportCut({ preset: p.id }) }))] },
      { label: 'Small files', items: FX.EXPORTS.filter((p) => p.size || p.fast || p.id === 'whatsapp').map((p) => ({ label: p.name, action: () => exportCut({ preset: p.id }) })) },
      { label: 'Loops and web', items: [{ label: 'GIF loop', action: () => exportCut({ preset: 'gif' }) }, ...FX.EXPORTS.filter((p) => p.codec === 'gif').map((p) => ({ label: p.name, action: () => exportCut({ preset: p.id }) })), { label: 'WebM (VP9)', action: () => exportCut({ preset: 'webm' }) }, { label: FX.EXPORTS.find((p) => p.id === 'webm-alpha').name, action: () => exportCut({ preset: 'webm-alpha' }) }] },
      { label: 'Masters', items: [{ label: 'ProRes 422 HQ master', action: () => exportCut({ preset: 'master' }) }, ...FX.EXPORTS.filter((p) => p.id === 'hq-same' || p.id === 'hevc').map((p) => ({ label: p.name, action: () => exportCut({ preset: p.id }) }))] },
      { label: 'Stills and sound', items: [{ label: 'PNG stills (every frame)', action: () => exportCut({ stills: true }) }, { label: 'JPEG stills (every frame)', action: () => exportCut({ stills: true, stillsExt: 'jpg' }) }, { label: 'Poster frame (the playhead, PNG)', action: () => posterFrame() },
        ...FX.EXPORTS.filter((p) => /^audio-/.test(p.id)).map((p) => ({ label: p.name, action: () => exportCut({ preset: p.id }) }))] },
      { more: true, label: 'Record in real time (WebM, no ffmpeg needed)', action: () => exportCut({ record: true }) },
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
    if (IMG.test(p) && !out.w) { const im = new Image(); im.src = host.fileUrl(p); await im.decode().catch(() => {}); out.w = im.naturalWidth; out.h = im.naturalHeight; out.audio = false; }
    probes.set(p, out);
    // the true frame rate also feeds stepping (ffprobe beats the browser's guess)
    if (pr?.fps && !host.S.meta[p]?.fpsUser) host.S.meta[p] = { ...(host.S.meta[p] || {}), fps: pr.fps, fpsSrc: 'file' };
    return out;
  }
  // every file the edit uses (main track and tracks)
  const allSources = (e) => [...new Set([...C.sources(e), ...(e.tracks || []).flatMap((k) => k.items.filter((x) => x.src).map((x) => x.src))])];
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
  const findPreset = (id) => V.EXPORT_PRESETS.find((x) => x.id === id) || FX.EXPORTS.find((x) => x.id === id) || null;
  // Where an export of this edit goes: next to its video (or, for a sequence, next to its first source / the
  // first watched folder) in exports/.
  function homeDir() {
    if (!isSeq()) return dirOf(st.path);
    const src = mainSrc();
    if (src) return dirOf(src);
    return R().state.videos[0] ? dirOf(R().state.videos[0].path) : '';
  }
  const stemOf = () => (isSeq() ? st.path.slice(4).replace(/[^\w.-]+/g, '_') || 'sequence' : noExt(base(st.path)));
  // Renders an edit with ffmpeg: plain cuts through CutData.ffmpegArgs, anything richer through CutFF (titles are
  // drawn into PNG frames first). Resolves with the job ({ output, done }) or null.
  async function renderEdit(edit, { preset = null, fit = 'crop', stills = false, stillsExt = 'png', out, label, library = true, range = null } = {}) {
    const tools = host.S.tools || (host.S.tools = await window.hub.video.tools({ ffmpeg: H.settings().ffmpegPath || undefined }));
    if (!tools.ffmpeg) return null;
    // Lab scenes / layers (a Lab sequence finished here): the Lab renders each one to a video first (tools/three-seq.js)
    if (typeof ThreeSeq !== 'undefined' && ThreeSeq.needsBake(edit)) {
      const t = toast('The Lab is rendering its scenes…', { timeout: 0 });
      try { await ThreeLab.cmd({ show: true }); edit = await ThreeSeq.bake(edit, { onProgress: (p) => { const sp = t.querySelector('span'); if (sp) sp.textContent = `The Lab is rendering its scenes… ${Math.round(p * 100)}%`; } }); } finally { t.remove(); activate('tool:ae'); }
    }
    const p = preset ? (typeof preset === 'object' ? preset : findPreset(preset)) : null;
    if (preset && !p) throw new Error(`Unknown preset “${preset}”. Try /presets.`);
    const info = {};
    for (const s of allSources(edit)) info[s] = await infoOf(s);
    const output = out;
    let g; let titleDir = null;
    if (C.isRich(edit)) {
      const { W: w0, H: h0, F } = frameSize(edit);
      const jobs = CutFF.titleJobs(edit);
      let titles = {};
      if (jobs.length) {
        titleDir = join(typeof output === 'string' ? dirOf(output.includes('%') ? dirOf(output) : output) : join(homeDir() || dirOf(mainSrc(edit) || ''), 'exports'), `.hearth-titles-${Date.now().toString(36)}`);
        const t = toast('Drawing the titles…', { timeout: 0 });
        try { titles = await VideoComp.renderTitles(jobs, Math.round(w0 / 2) * 2, Math.round(h0 / 2) * 2, F, titleDir, (pct) => { t.querySelector('span').textContent = `Drawing the titles… ${Math.round(pct * 100)}%`; }); } catch (err) { window.hub.video.rmtemp?.(titleDir).catch(() => {}); throw err; } finally { t.remove(); }
      }
      try { g = CutFF.args(edit, info, { w: w0, h: h0, fps: F }, { preset: p, fit, offset: host.S.overlay.cropOffset, range, stills, stillsExt, titles, presetFilters: V.presetFilters, codecArgs: V.codecArgs }); } catch (err) { if (titleDir) window.hub.video.rmtemp?.(titleDir).catch(() => {}); throw err; }
    } else {
      // title cards need their pictures
      for (const c of edit.clips) if (c.kind === 'title' && !c.img) c.img = await titleImage(c.text || 'Title', c);
      const main = info[mainSrc(edit)] || Object.values(info)[0] || { w: 1080, h: 1920, fps: 30 };
      const canvas = { w: main.w || 1080, h: main.h || 1920, fps: main.fps || 30 };
      const sp = p && FX.exportCodec(p, C.total(edit)) ? null : p;
      g = C.ffmpegArgs(edit, info, canvas, { preset: sp, fit, offset: host.S.overlay.cropOffset, range, stills, presetFilters: V.presetFilters, codecArgs: V.codecArgs });
      // presets the plain graph doesn't know (size targets, HEVC, audio only) go through the full one
      if (p && !sp) g = CutFF.args(edit, info, { ...canvas }, { preset: p, fit, offset: host.S.overlay.cropOffset, range, stills, presetFilters: V.presetFilters, codecArgs: V.codecArgs });
    }
    let final = typeof output === 'function' ? output(g) : output;
    // a new version never replaces a file that is already there (another take, an earlier render): it gets " (2)"…
    if (typeof final === 'string' && !/[\\/]exports[\\/]/.test(final) && !final.includes('%')) {
      const stemOfFinal = final.replace(/\.[^./\\]+$/, ''); const ext = final.slice(stemOfFinal.length);
      for (let i = 2; i < 100 && await window.hub.fs.stat(final).catch(() => null); i += 1) final = `${stemOfFinal} (${i})${ext}`;
    }
    // the title frames (a temp folder next to the export) go away however the render ends: done, failed, cancelled,
    // or never started (they used to stay next to your footage when the job failed or didn't start)
    const dropTitles = () => { if (titleDir) window.hub.video.rmtemp?.(titleDir).catch(() => {}); };
    let job;
    try { job = await host.startJob({ label: label || `Edit → ${base(final)}`, input: g.inputs[0] || mainSrc(edit), output: final, args: [...g.args, 'OUTPUT'], duration: g.duration, library }); } catch (err) { dropTitles(); throw err; }
    if (job) Promise.resolve(job.done).then(dropTitles, dropTitles); else dropTitles();
    return job;
  }
  // Renders the edit. preset: a VideoData / EditFX preset id (social sizes, gif, webm, master, small files, audio…)
  // or none (same size, high quality, saved as the next version next to the video); stills: a PNG (or JPEG) per
  // frame; record: real time WebM through the browser (also used when ffmpeg isn't installed).
  async function exportCut({ preset = null, fit = 'crop', stills = false, stillsExt = 'png', out, record = false } = {}) {
    if (!st.edit?.clips.length && !(st.edit?.tracks || []).some((k) => k.items.length)) throw new Error('The edit is empty');
    const tools = host.S.tools || (host.S.tools = await window.hub.video.tools({ ffmpeg: H.settings().ffmpegPath || undefined }));
    if (record || !tools.ffmpeg) return recordEdit({ note: !tools.ffmpeg ? `ffmpeg isn't installed (${tools.hint}), so the edit is recorded in real time as WebM.` : '' });
    const p = preset ? findPreset(preset) : null;
    if (preset && !p) throw new Error(`Unknown preset “${preset}”. Try /presets.`);
    const stem = stemOf();
    const dir = homeDir();
    const output = out || ((g) => (stills ? join(dir, 'exports', `${stem}_cut_stills`, `frame_%05d.${stillsExt}`)
      : p ? join(dir, 'exports', `${stem}_cut_${p.id}${g.w && g.h ? `_${g.w}x${g.h}` : ''}.${g.ext}`) : isSeq() ? join(dir, 'exports', `${stem}.mp4`) : nextVersionPath(st.path)));
    const label = stills ? `Edit → ${stillsExt.toUpperCase()} stills` : `Edit → ${p ? p.name : 'new version'}`;
    const audioOnly = p && FX.exportCodec(p, 1)?.audioOnly;
    const job = await renderEdit(st.edit, { preset: p, fit, stills, stillsExt, out: output, label, library: !stills && !audioOnly, range: st.edit.mark });
    if (job) emit('export', { output: job.output, preset: preset || 'cut' });
    return job;
  }
  async function exportAll({ fit = 'crop' } = {}) {
    const outs = [];
    for (const id of ['reels', 'feed45', 'square', 'yt1080']) { const j = await exportCut({ preset: id, fit }); if (!j) break; outs.push(j.output); await j.done; }
    return outs;
  }
  // No ffmpeg (or asked): the compositor plays the edit into a MediaRecorder; the WebM lands in exports/.
  async function recordEdit({ note = '' } = {}) {
    pause();
    const mk = st.edit.mark;
    const output = join(homeDir(), 'exports', `${stemOf()}_recorded_${Date.now().toString(36)}.webm`);
    const t = toast(`${note ? `${note} ` : ''}Recording the edit…`, { timeout: 0 });
    let bytes;
    try { bytes = await VideoComp.record({ a: mk?.a || 0, b: mk?.b ?? null, onProgress: (pct) => { t.querySelector('span').textContent = `Recording the edit… ${Math.round(pct * 100)}%`; } }); } finally { t.remove(); }
    await window.hub.fs.write(output, bytes);
    R().noteRecording?.(output);
    toast(`Recorded ${base(output)}`, { action: { label: 'Open', fn: () => R().open(output) }, timeout: 9000 });
    const ev = { code: 0, output, seconds: 0 };
    emit('export', { output, preset: 'record' });
    return { output, done: Promise.resolve(ev) };
  }
  // the frame at the playhead as a full-size PNG in exports/
  async function posterFrame() {
    const im = await VideoComp.frameImage(P.T, { maxW: frameSize().W, edit: st.edit, mime: 'image/png' });
    const out = join(homeDir(), 'exports', `${stemOf()}_${V.tc(P.T, progFps()).replace(/:/g, '-')}.png`);
    await window.hub.fs.write(out, Uint8Array.from(atob(im.url.split(',')[1]), (ch) => ch.charCodeAt(0)));
    toast(`Saved ${base(out)}`, { action: { label: IS_MAC ? 'Show in Finder' : 'Show in folder', fn: () => window.hub.fs.reveal(out) }, timeout: 7000 });
    return out;
  }

  // ---------- entering / leaving ----------
  // enter({ path: 'seq:Intro' }) edits a sequence of its own (no video needed); otherwise the open video's edit.
  async function enter({ path = null } = {}) {
    const seqPath = path && isSeq(path) ? path : null;
    if (!host || (!host.S.cur && !seqPath)) { toast('Open a video first (or start from a template: /edit-template)', { type: 'error' }); return false; }
    await loadCuts();
    if (!seqPath && !host.refs.video.duration) await R().waitReady();
    const want = seqPath || host.S.cur.path;
    const fresh = st.path !== want || !st.edit;
    if (fresh) { st.path = want; st.edit = editOf(st.path); st.undo = []; st.redo = []; st.sel.clear(); st.suggest = null; st.view = null; }
    R().pause();
    st.on = true;
    host.refs.main.classList.add('cutting');
    host.refs.stage.classList.add('cutting');
    refs.root.hidden = false;
    refs.btn?.classList.add('on');
    setTitle(isSeq() ? st.path.slice(4) : 'Edit');
    P.rate = 1; P.idx = -1;
    lastTime = '';
    fitTrackHeight();
    requestAnimationFrame(() => { measure(); draw(); placeHead(); });
    paintHead();
    // start where the source playhead is, when that frame is in the edit
    const t0 = fresh ? (isSeq() ? 0 : C.programTimes(st.edit, st.path, host.refs.video.currentTime)[0] ?? 0) : P.T;
    await seek(t0, { play: false });
    emit('mode', { on: true });
    return true;
  }
  function leave() {
    if (!st.on) return false;
    pause();
    st.on = false;
    syncRich();
    host.refs.main.classList.remove('cutting');
    host.refs.stage.classList.remove('cutting');
    refs.root.hidden = true;
    refs.btn?.classList.remove('on');
    for (const e of els()) { e.pause(); }
    // the frame goes back to the video's shape
    const v = host.refs.video;
    if (v.videoWidth) host.refs.stage.style.setProperty('--ar', String(v.videoWidth / v.videoHeight));
    // the source picks up where the edit was
    if (!isSeq()) { const x = C.at(st.edit, Math.min(P.T, Math.max(0, C.mainTotal(st.edit) - 1e-4))); if (x?.clip.src === st.path && x.srcTime != null) R().seek(x.srcTime); }
    host.refs.timeTotal.textContent = '';
    closeInspector();
    emit('mode', { on: false });
    return true;
  }
  const toggle = (on) => ((on ?? !st.on) ? enter() : leave());
  // Review opened another video: the edit follows it (a sequence stays).
  function onOpen({ path }) {
    if (!st.on) { if (!isSeq()) st.edit = null; return; }
    if (path === st.path || isSeq()) return;
    pause();
    st.on = false;
    R().waitReady().then(() => enter());
  }
  // A sequence of its own (not tied to one video): a template, or empty in a format.
  async function newSequence(name = 'Sequence', { template = null, format = '9:16' } = {}) {
    await loadCuts();
    let key = `seq:${String(name).trim() || 'Sequence'}`;
    for (let i = 2; cuts[key]; i += 1) key = `seq:${name} ${i}`;
    const f = FX.FORMATS.find((x) => x.id === format) || FX.FORMATS[0];
    cuts[key] = C.setSeq({ ...C.empty(), clips: [{ id: C.uid(), kind: 'gap', dur: 5, slot: 1 }] }, { w: f.w, h: f.h, fps: 30 });
    saveCuts();
    if (st.on) leave();
    st.edit = null;
    await enter({ path: key });
    if (template) applyTemplate(template);
    return key;
  }
  const sequences = () => Object.keys(cuts || {}).filter((k) => isSeq(k)).map((k) => ({ key: k, name: k.slice(4), seconds: Number(C.total(C.normalize(cuts[k])).toFixed(2)) }));
  function deleteSequence(key) { if (!cuts?.[key]) return false; if (st.path === key && st.on) leave(); delete cuts[key]; saveCuts(); return true; }

  // ---------- mount (called by Review.mount) ----------
  function measure() { if (!refs.track) return; const r = refs.track.getBoundingClientRect(); refs.sizes = { w: r.width, h: r.height }; }
  function mount(h) {
    host = h;
    const r = h.refs;
    st.snap = pref.get('cut.snap', true);
    st.laneK = pref.get('cut.lanes', 1);
    // program monitor: inside the frame, under the overlays
    refs.pa = el('video', { class: 'vr-p', playsInline: true, preload: 'auto' });
    refs.pb = el('video', { class: 'vr-p', playsInline: true, preload: 'auto' });
    refs.pimg = el('img', { class: 'vr-p vr-pimg', alt: '' });
    refs.pfade = el('div', { class: 'vr-pfade' }, refs.pa, refs.pb, refs.pimg);
    refs.pwrap = el('div', { class: 'vr-pwrap' }, refs.pfade);
    r.cmp.after(refs.pwrap);
    VideoComp.attach({ S: h.S, fileUrl: h.fileUrl, wrap: refs.pwrap, size: (e) => frameSize(e || st.edit), edit: () => st.edit, volume: () => (h.refs.video.muted ? 0 : h.refs.video.volume), fpsOf });
    // the clip track (replaces the source timeline while editing)
    refs.canvas = el('canvas', { class: 'vr-cut-cv' });
    refs.head = el('div', { class: 'vr-cut-ph' });
    refs.track = el('div', { class: 'vr-cut-track', title: 'Click: playhead + select · drag an edge: trim · drag a clip: move · right-click: menus · drop videos, pictures or sounds · Ctrl+wheel: zoom' }, refs.canvas, refs.head);
    refs.sum = el('span', { class: 'vr-cut-sum' });
    refs.sugText = el('span');
    refs.sug = el('span', { class: 'vr-cut-sug', hidden: true }, refs.sugText,
      el('button', { class: 'primary small', text: 'Apply ⏎', title: 'Make these cuts (Enter)', on: { click: acceptSuggestion } }),
      el('button', { class: 'ghost small', text: '✕', title: 'Dismiss (Esc)', on: { click: () => suggest('off') } }));
    const ico = (text, title, fn, cls = '') => el('button', { class: `vr-ico ${cls}`, text, title, on: { click: fn } });
    refs.undoBtn = ico('↶', 'Undo (⌘/Ctrl+Z)', undo);
    refs.title = el('b', { class: 'vr-cut-title', text: '✂ Edit' });
    refs.addBtn = ico('＋', 'Add: a video, picture, title, lower third, music, Lab recording, color, track…', (e) => { const rr = e.currentTarget.getBoundingClientRect(); showMenu(rr.left, rr.bottom + 4, addItems(P.T)); }, 'vr-cut-add');
    refs.fmtBtn = el('button', { class: 'vr-ico vr-cut-fmt', text: '', title: 'The program\'s shape and frame rate (9:16, 4:5, 1:1, 16:9…), safe zones', on: { click: (e) => formatMenu(e.currentTarget) } });
    refs.root = el('div', { class: 'vr-cut', hidden: true },
      el('div', { class: 'vr-cut-headrow' },
        refs.title, refs.addBtn, refs.sum, refs.sug, el('span', { class: 'spacer' }), refs.fmtBtn, refs.undoBtn,
        el('button', { class: 'vr-ico vr-cut-export', text: '⇪ Export', title: 'Render the edit with ffmpeg: a new version, socials, small files, GIF, stills, sound', on: { click: (e) => exportMenu(e.currentTarget) } }),
        ico('⋯', 'Auto-cut, transitions on every cut, templates, range, tools, keys…', (e) => moreMenu(e.currentTarget)),
        ico('✕', 'Back to the review (E)', () => leave())),
      refs.track);
    r.tlBox.after(refs.root);
    refs.canvas.addEventListener('pointerdown', trackDown);
    refs.canvas.addEventListener('pointermove', trackHover);
    refs.canvas.addEventListener('pointerleave', () => { if (st.razor) { st.hoverX = null; draw(); } });
    refs.canvas.addEventListener('contextmenu', trackMenuAt);
    refs.canvas.addEventListener('wheel', trackWheel, { passive: false });
    refs.canvas.addEventListener('dblclick', (e) => {
      const h0 = hit(e);
      if (h0.zone === 'ruler') { seek(h0.T, { play: false }); marker(); return; }
      if (h0.zone === 'trans') { inspect(h0.it.clip.id); return; }
      const c = h0.it?.clip || h0.item;
      if (c?.kind === 'title' && h0.it) editTitle(c); else if (c) inspect(c.id);
      if (h0.it?.clip.kind === 'gap' && h0.it.clip.slot) fillSlot(h0.it.clip.id);
    });
    // Alt held: the lanes show their switches (hide · mute · lock)
    const altOn = (on) => { if (st.alt !== on) { st.alt = on; if (st.on) draw(); } };
    addEventListener('keydown', (e) => { if (e.key === 'Alt') altOn(true); });
    addEventListener('keyup', (e) => { if (e.key === 'Alt') altOn(false); });
    addEventListener('blur', () => altOn(false));
    new ResizeObserver(() => { measure(); draw(); placeHead(); }).observe(refs.track);
    // drop videos, pictures, sounds (files or library cards): on the main lane they join the edit, on a track lane
    // they go on that track at the drop point
    refs.root.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/x-hearth-video')) { e.preventDefault(); refs.root.classList.add('drop'); } });
    refs.root.addEventListener('dragleave', () => refs.root.classList.remove('drop'));
    refs.root.addEventListener('drop', async (e) => {
      e.preventDefault(); refs.root.classList.remove('drop');
      const rc = refs.canvas.getBoundingClientRect();
      const at = tOf(e.clientX - rc.left);
      const lane = laneOf(e.clientY - rc.top);
      const paths = [e.dataTransfer.getData('text/x-hearth-video'), ...[...e.dataTransfer.files].map((f) => window.hub.pathForFile?.(f))].filter((p) => p && (VID.test(p) || IMG.test(p) || AUD.test(p)));
      const slot = lane?.kind === 'main' ? C.at(st.edit, at) : null;
      for (const p of paths) {
        if (slot?.clip.kind === 'gap' && slot.clip.slot && !AUD.test(p)) { await fillSlot(slot.clip.id, p); continue; }
        if (lane?.track) await addOverlay(p, { at: toFrame(at), track: lane.track.id });
        else if (VID.test(p)) await addClip(p, { at });
        else if (IMG.test(p)) await addImage(p, { at: toFrame(at), main: lane?.kind === 'main' });
        else await addAudio(p, { at: toFrame(at) });
      }
    });
    // ✂ in the transport
    refs.btn = el('button', { class: 'vr-ico vr-cut-btn', text: '✂', title: 'Edit: cut, layers, titles, transitions, keyframes, looks… then export (E)', on: { click: () => toggle() } });
    r.toolGroup?.prepend(refs.btn);
    R().on('open', onOpen);
    R().on('audio', () => { if (st.on) draw(); });
    R().on('note', () => { if (st.on) draw(); });
    registerKeys();
    loadCuts().then(() => R().refreshCard?.());
  }
  // the editor bar's title: the editor icon (icons.js) and the edit's name
  function setTitle(name) { const i = typeof Icons !== 'undefined' ? Icons.node('editor') : null; if (!i) { refs.title.textContent = `✂ ${name}`; return; } i.classList.add('p8-ico'); refs.title.replaceChildren(i, String(name)); }
  // the inspector (tools/video-inspector.js) opens on the selection
  // (attached on first use: Review builds its notes column after mounting the editor)
  let inspAttached = false;
  function inspect(id) {
    if (!id || typeof VideoInspector === 'undefined') return false;
    if (!inspAttached) { const aside = host.refs.root.querySelector('.vr-notes'); if (!aside) return false; VideoInspector.attach({ aside, api: inspectorApi }); inspAttached = true; }
    st.sel = new Set([id]); paintHead(); draw();
    VideoInspector.open(id);
    return true;
  }
  function closeInspector() { if (inspAttached) VideoInspector.close(); }
  // what the inspector reads and changes; live() previews a drag without an undo step, then commit() keeps it
  let liveBase = null;
  const inspectorApi = {
    get edit() { return st.edit; }, get time() { return P.T; }, fps: () => progFps(), fmt: (t) => fmtProg(t), find: (id) => C.find(st.edit, id),
    startOf: (id) => { const f = C.find(st.edit, id); return f ? (f.where === 'clip' ? C.layout(st.edit)[f.i].start : f.clip.start) : 0; },
    commit: (next, label) => { if (liveBase) { st.edit = liveBase; liveBase = null; } return commit(next, label); },
    live: (next) => { if (!liveBase) liveBase = st.edit; st.edit = next; draw(); if (richOn) VideoComp.renderExact(P.T); },
    cancelLive: () => { if (liveBase) { st.edit = liveBase; liveBase = null; draw(); refreshPicture(); } },
    seek: (t) => seek(t, { play: false }), keyHere, setTransition, setLook, applyMotion, adjust, setEffect, setAudioFx, setSpeed, rampClip, flash: (s) => host.flash(s),
    select: (ids) => { st.sel = new Set(ids); paintHead(); draw(); },
    focus: () => host.refs.root.focus({ preventScroll: true }),
    on: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
  };

  // ---------- for Review (tick, status) and the commands ----------
  function frame() { if (st.on) paintTime(); }
  function statusOf(p) {
    const e = p === st.path && st.edit ? st.edit : cuts?.[p] ? C.normalize(cuts[p]) : null;
    if (!e) return null;
    const layers = (e.tracks || []).reduce((n, k) => n + k.items.length, 0);
    return { clips: e.clips.length, layers: layers || undefined, seconds: Number(C.total(e).toFixed(2)), editing: st.on && p === st.path, list: C.describe(e).slice(0, 12), more: layers ? 'video_edit_read lists the layers, titles and transitions' : undefined };
  }
  // The Lab (or a command) sends a clip: added to the cut of the video open in Video Review, or opens it.
  // as: 'clip' (main track, default), 'overlay' (on a track at the playhead) or 'edit' (open it as its own edit).
  async function receive(path, { a = 0, b = null, as = 'clip' } = {}) {
    await R().ensureMounted();
    activate('tool:ae');
    if (as === 'edit') { await R().open(path); await R().waitReady(); if (st.on && st.path !== path) leave(); await enter(); if (a > 0 || b != null) { const d = await durationOf(path); commit(C.slice(C.fromSource(path, d), a, b ?? d), 'Clip from the Lab'); } return true; }
    if (!host.S.cur && !st.on) { await R().open(path); await R().waitReady(); }
    if (!st.on) await enter();
    if (as === 'overlay') return Boolean(await addOverlay(path, { at: P.T, a, b }));
    if (st.edit.clips.length === 1 && st.edit.clips[0].src === path && C.isIdentity(st.edit, path, srcDur(path)) && (a > 0 || b != null)) {
      const d = await durationOf(path);
      commit(C.slice(C.fromSource(path, d), a, b ?? d), 'Clip from the Lab');
      return true;
    }
    return addClip(path, { a, b });
  }

  registerKeys(); // listed in the keys sheet before Video Review first opens (mount adds nothing new: Keys.add skips repeats)
  // The Lab's footage timeline (tools/three-frames.js, round 8) shares a video's edit with the editor: it reads it and
  // stores its cuts here (one undo step when that edit is open in the editor), and listens to 'change' for edits made here.
  async function editFor(p) { await loadCuts(); return p === st.path && st.edit ? C.copy(st.edit) : cuts[p] ? C.normalize(cuts[p]) : null; }
  async function storeEdit(p, e, label = 'From the Lab') {
    await loadCuts();
    if (st.edit && st.path === p) return commit(e ? C.normalize(e) : C.fromSource(p, srcDur(p)), label);
    const d = e?.clips?.[0]?.max || 0;
    if (!e || (!isSeq(p) && !C.isRich(e) && C.isIdentity(e, p, d) && !e.mark)) delete cuts[p]; else cuts[p] = e;
    saveCuts();
    R()?.refreshCard?.(p);
    emit('change', { path: p, from: 'lab' });
    return true;
  }

  return {
    editFor, storeEdit,
    mount, onKey, frame, enter, leave, toggle, statusOf, hasCut, receive, on: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    get active() { return st.on; }, get edit() { return st.edit; }, get path() { return st.path; }, get time() { return P.playing ? nowT() : P.T; }, get playing() { return P.playing; },
    get selection() { return selIds(); }, get suggestion() { return st.suggest ? { ...st.suggest } : null; }, get canUndo() { return st.undo.length > 0; },
    get rich() { return richOn; }, get view() { return st.view ? { ...st.view } : null; }, get razor() { return st.razor; }, get snap() { return st.snap; }, get fps() { return progFps(); }, get lastCheck() { return lastCheck; },
    play: startPlay, pause, togglePlay: () => (P.playing ? pause() : startPlay()), seek: (t) => seek(t, { play: P.playing }), step, shuttle, goto: (t) => seek(frameMid(t), { play: false }), goFrame, frameInfo, frameSize, fmt: fmtProg,
    split, splitAll: splitAllHere, del, closeGaps, setSpeed, nudgeSpeed, freezeHere, addTitle, marker, setMark, suggest, acceptSuggestion, reset, addClip, undo, redo, help, exportCut, exportAll, jumpCut, jumpBeat, jumpMarker, jumpKey,
    setTransition, setLook, adjust, setEffect, setAudioFx, applyMotion, keyHere, rampClip, addOverlay, addImage, addAudio, addTitleItem, addColor, insertClip, overwriteClip, fillSlot, liftRange, toggleSnap, toggleRazor, setFormat, applyTemplate,
    nestSelection, unnest, toOverlay, toMain, fillFrame, resetTransform, clipDuration, addShape, snapshot, snapshots, restoreSnapshot, exportEdl, duplicateSequence, renameSequence, laneSize, centerView, markersAtCuts, clearMarkers, holdFrame, restyleTrack, shiftTrack, normalizeAll, soloSound, importCaptions, exportCaptions, matchLook, fitToFill, extendEdit, swapNext, shuffleClips, matchFrame, setLabel, renameClip, toggleOff, rangeFromSelection, beatMarkers, copyKeys, pasteKeys, safeCheck, posterFrame, renderEdit, recordEdit, newSequence, sequences, deleteSequence, inspect, closeInspector, zoomBy, zoomFit, setView, nudge, slipSel, copySel, paste, selectAll,
    selectIds: (ids) => { st.sel = new Set(ids.filter((id) => C.find(st.edit, id))); paintHead(); draw(); return selIds(); },
    select(i) { const c = st.edit?.clips[i]; if (!c) return null; st.sel = new Set([c.id]); paintHead(); draw(); const x = C.layout(st.edit)[i]; seek(x.start, { play: false }); return c; },
    commit, mute: (on) => { const ids = targetAny(); if (!ids.length) return null; commit(C.patchAny(st.edit, ids, (c) => { c.mute = on ?? !c.mute; }), 'Sound toggled'); return C.find(st.edit, ids[0])?.clip.mute; },
    fade: (edge, s) => { const ids = targetAny(); if (!ids.length) return null; commit(C.patchAny(st.edit, ids, (c) => { c[edge === 'in' ? 'fadeIn' : 'fadeOut'] = Math.max(0, Math.min(Number(s) || 0, C.durOf(c) / 2)); }), `Fade ${edge}`); return true; },
    trimTo: (edge) => trimToHead(edge, selItems()[0]),
    duplicate: () => { const id = targetIds()[0]; return id ? commit(C.duplicate(st.edit, id), 'Duplicated') : false; },
    move: (from, to) => { const c = st.edit?.clips[from]; return c ? commit(C.move(st.edit, c.id, to), 'Clip moved') : false; },
    describe: () => (st.edit ? C.describe(st.edit) : []), describeAll: () => (st.edit ? C.describeAll(st.edit, { tc: fmtProg }) : []),
    _test: { P, st, draw, nowT, lanes, hit, xOf, tOf },
  };
})();
