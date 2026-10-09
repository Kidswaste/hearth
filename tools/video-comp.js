// The editor's program monitor for full edits (Video Review ✂): a canvas that composites every layer of the edit at
// a program time (main track with its transitions, overlay tracks with position / scale / rotation / opacity
// keyframes, blend modes, looks, titles), fed by a pool of hidden <video> decoders. Plain cut-only edits keep the
// two-decoder player in tools/video-cut.js; anything richer plays here.
//   · paused: renderExact(T) seeks every decoder to the exact source frame (checked with requestVideoFrameCallback)
//     and draws; stepping, the agents' frame images and the fallback export use it.
//   · playing: one clock, decoders play along (re-synced when they drift over 3 frames), the next layers wait
//     preloaded at their first frame; one canvas draw per frame, no DOM writes.
//   · renderTitles: every title as PNG frames for the ffmpeg render (same drawing code as the preview).
//   · record: real-time WebM of the edit with MediaRecorder when ffmpeg isn't installed.
const VideoComp = (() => {
  const C = CutData;
  const FX = EditFX;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  let host = null; // { S, fileUrl, wrap (element to mount in), size () => { W, H, F }, edit () => edit, volume () => 0..1 }
  const refs = {};
  const decks = new Map(); // clip / item id → { el, src, key, frame (last presented source frame), fps }
  const images = new Map(); // path → HTMLImageElement (loaded)
  const st = { on: false, playing: false, T: 0, T0: 0, t0: 0, rate: 1, raf: 0, seq: 0, onEnd: null, end: Infinity, lastDraw: '' };
  const listeners = {};
  const emit = (ev, d) => { for (const fn of listeners[ev] || []) { try { fn(d); } catch (err) { console.error(err); } } };

  // ---------- mount ----------
  function attach(h) {
    host = h;
    refs.canvas = el('canvas', { class: 'vr-pcomp' });
    refs.decks = el('div', { class: 'vr-pdecks', 'aria-hidden': 'true' });
    h.wrap.append(refs.canvas, refs.decks);
    ensureSvg();
  }
  // SVG filters for the looks (canvas filter: url(#id)) and the RGB-split channels
  const filterIds = new Map();
  function ensureSvg() {
    if (refs.svg?.isConnected) return refs.svg;
    const NS = 'http://www.w3.org/2000/svg';
    refs.svg = document.createElementNS(NS, 'svg');
    refs.svg.setAttribute('width', '0'); refs.svg.setAttribute('height', '0');
    refs.svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    const defs = document.createElementNS(NS, 'defs');
    refs.svg.append(defs);
    const chan = { r: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', g: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', b: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0' };
    for (const [k, v] of Object.entries(chan)) defs.append(svgFilter(`edfx-${k}`, v, 1));
    document.body.append(refs.svg);
    return refs.svg;
  }
  function svgFilter(id, matrix, gamma) {
    const NS = 'http://www.w3.org/2000/svg';
    const f = document.createElementNS(NS, 'filter');
    f.id = id; f.setAttribute('color-interpolation-filters', 'sRGB');
    const m = document.createElementNS(NS, 'feColorMatrix'); m.setAttribute('type', 'matrix'); m.setAttribute('values', matrix);
    f.append(m);
    if (Math.abs(gamma - 1) > 1e-3) {
      const ct = document.createElementNS(NS, 'feComponentTransfer');
      for (const ch of ['R', 'G', 'B']) { const fn = document.createElementNS(NS, `feFunc${ch}`); fn.setAttribute('type', 'gamma'); fn.setAttribute('amplitude', '1'); fn.setAttribute('exponent', String(1 / gamma)); fn.setAttribute('offset', '0'); ct.append(fn); }
      f.append(ct);
    }
    return f;
  }
  // The canvas filter string of a clip's look + adjustments ('' when it has none).
  const gradeCache = new Map();
  function filterOf(c) {
    if (!c.color) return null;
    const key = JSON.stringify(c.color);
    if (gradeCache.has(key)) return gradeCache.get(key);
    const cm = FX.colorMath(FX.grade(c.color));
    let out = null;
    if (cm) {
      const mx = FX.svgMatrix(cm);
      const fk = `${mx}|${cm.gamma.toFixed(3)}`;
      let id = filterIds.get(fk);
      if (!id) { id = `edfx-${filterIds.size + 1}`; filterIds.set(fk, id); ensureSvg().firstChild.append(svgFilter(id, mx, cm.gamma)); }
      out = { css: `url(#${id})${cm.blur > 0.005 ? ` blur(${(cm.blur * 6).toFixed(1)}px)` : ''}`, vignette: cm.vignette, grain: cm.grain };
    }
    gradeCache.set(key, out);
    return out;
  }
  let noise = null;
  function noiseCanvas() {
    if (noise) return noise;
    noise = document.createElement('canvas'); noise.width = 256; noise.height = 256;
    const g = noise.getContext('2d'); const d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    return noise;
  }

  // ---------- decoders ----------
  const fpsOf = (src) => host?.fpsOf?.(src) || host?.S.meta[src]?.fps || 30;
  function deck(c) {
    let d = decks.get(c.id);
    if (d && d.src === c.src) return d;
    if (!d) {
      const v = el('video', { class: 'vr-pdeck', playsInline: true, preload: 'auto', muted: false });
      refs.decks.append(v);
      d = { el: v, src: null, frame: null, ready: null, used: 0 };
      decks.set(c.id, d);
    }
    d.src = c.src; d.frame = null;
    d.el.src = host.fileUrl(c.src);
    d.ready = new Promise((res) => {
      const done = (ok) => { d.el.removeEventListener('loadeddata', y); d.el.removeEventListener('error', n); res(ok); };
      const y = () => done(true); const n = () => done(false);
      d.el.addEventListener('loadeddata', y); d.el.addEventListener('error', n);
      setTimeout(() => done(d.el.readyState >= 2), 10000);
    });
    trim();
    return d;
  }
  // keep at most 10 decoders: the least recently used ones let go of their file
  function trim() {
    if (decks.size <= 10) return;
    const list = [...decks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [id, d] of list.slice(0, decks.size - 10)) { d.el.pause(); d.el.removeAttribute('src'); d.el.load(); d.el.remove(); decks.delete(id); }
  }
  // Seek a decoder to show source frame floor(t × fps): seek to the frame's middle, wait for it, and read back the
  // presented frame with requestVideoFrameCallback (resolves { want, got }).
  function seekExact(d, t, fps) {
    const el0 = d.el;
    const want = Math.max(0, Math.floor(t * fps + 1e-4));
    const dur = el0.duration || Infinity;
    const to = Math.min((want + 0.5) / fps, Math.max(0, dur - 0.5 / fps));
    const wantF = Math.floor(to * fps + 1e-4);
    if (d.frame === wantF && Math.abs(el0.currentTime - to) < 1e-4 && !el0.seeking && el0.readyState >= 2) return Promise.resolve({ want: wantF, got: d.frame });
    return new Promise((res) => {
      let finished = false;
      const fin = (got) => { if (finished) return; finished = true; d.frame = got; res({ want: wantF, got }); };
      const onSeeked = () => {
        el0.removeEventListener('seeked', onSeeked);
        if (el0.requestVideoFrameCallback) {
          el0.requestVideoFrameCallback((_n, meta) => fin(Math.floor(meta.mediaTime * fps + 0.5)));
          setTimeout(() => fin(Math.floor(el0.currentTime * fps + 1e-4)), 250);
        } else fin(Math.floor(el0.currentTime * fps + 1e-4));
      };
      el0.addEventListener('seeked', onSeeked);
      el0.currentTime = to;
      setTimeout(() => { el0.removeEventListener('seeked', onSeeked); fin(null); }, 4000);
    });
  }
  function image(src) {
    let im = images.get(src);
    if (!im) { im = new Image(); im.decoding = 'async'; im.src = host.fileUrl(src); im.ready = im.decode().then(() => true, () => false); images.set(src, im); }
    return im;
  }

  // ---------- drawing ----------
  // The source time of a layer at program time T.
  function srcTimeOf(L, T) {
    const c = L.clip;
    const local = clamp(T - L.start, 0, L.end - L.start);
    if (c.kind === 'video' || c.kind === 'audio') return C.srcAt(c, local);
    if (c.kind === 'freeze') return c.at;
    return null;
  }
  const isMedia = (c) => c.kind === 'video' || c.kind === 'freeze';
  // fades (main track: to black; items: transparency) as an opacity multiplier
  function envelope(c, local, d) {
    let g = 1;
    if (c.fadeIn > 0 && local < c.fadeIn) g = Math.min(g, local / c.fadeIn);
    if (c.fadeOut > 0 && d - local < c.fadeOut) g = Math.min(g, (d - local) / c.fadeOut);
    return clamp(g, 0, 1);
  }
  const titleCanvases = new Map();
  function titleCanvas(id, W, H) {
    let c = titleCanvases.get(id);
    if (!c) { c = document.createElement('canvas'); titleCanvases.set(id, c); }
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    return c;
  }
  // Draw one layer (a main-track clip or a track item) at program time T on g (W × H).
  function drawLayer(g, L, T, W, H) {
    const c = L.clip;
    const local = clamp(T - L.start, 0, L.end - L.start);
    const d = L.end - L.start;
    let op = C.propAt(c, 'opacity', local) * envelope(c, local, d);
    if (op <= 0.002) return;
    if (c.kind === 'gap') return;
    if (c.kind === 'title') {
      const tc = titleCanvas(c.id, W, H);
      const tg = tc.getContext('2d');
      tg.clearRect(0, 0, W, H);
      VideoTitles.draw(tg, { ...c, dur: d, where: L.where }, local, W, H);
      g.save(); g.globalAlpha = op;
      if (L.where === 'main' && !c.bg && !c.style && !c.anim && c.img) { const im = image(c.img); if (im.complete) g.drawImage(im, 0, 0, W, H); } else g.drawImage(tc, 0, 0, W, H);
      g.restore();
      return;
    }
    let pic = null; let pw = W; let ph = H;
    if (c.kind === 'color') { g.save(); g.globalAlpha = op; g.fillStyle = c.fill || '#000'; g.fillRect(0, 0, W, H); g.restore(); return; }
    if (c.kind === 'image') { const im = image(c.src); if (!im.complete || !im.naturalWidth) return; pic = im; pw = im.naturalWidth; ph = im.naturalHeight; }
    if (isMedia(c)) { const dk = decks.get(c.id); if (!dk || dk.el.readyState < 2) return; pic = dk.el; pw = dk.el.videoWidth; ph = dk.el.videoHeight; dk.used = performance.now(); }
    if (!pic || !pw || !ph) return;
    const k = Math.min(W / pw, H / ph);
    const fw = pw * k; const fh = ph * k;
    const s = C.propAt(c, 'scale', local); const x = C.propAt(c, 'x', local); const y = C.propAt(c, 'y', local); const r = C.propAt(c, 'rotate', local);
    const look = filterOf(c);
    const blend = FX.BLEND[c.blend]?.canvas || 'source-over';
    g.save();
    g.translate(W / 2 + x * W, H / 2 + y * H);
    if (r) g.rotate((r * Math.PI) / 180);
    g.scale(s, s);
    g.globalAlpha = clamp(op, 0, 1);
    g.globalCompositeOperation = blend;
    if (look?.css) g.filter = look.css;
    g.drawImage(pic, -fw / 2, -fh / 2, fw, fh);
    g.filter = 'none';
    if (look?.vignette > 0.005) {
      const gr = g.createRadialGradient(0, 0, Math.min(fw, fh) * 0.25, 0, 0, Math.hypot(fw, fh) / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${(look.vignette * 0.85).toFixed(3)})`);
      g.globalCompositeOperation = 'source-over'; g.fillStyle = gr; g.fillRect(-fw / 2, -fh / 2, fw, fh);
    }
    if (look?.grain > 0.005) {
      const n = noiseCanvas();
      g.globalCompositeOperation = 'overlay'; g.globalAlpha = clamp(op * look.grain * 0.6, 0, 1);
      const pat = g.createPattern(n, 'repeat');
      const ox = Math.floor(Math.random() * 256); const oy = Math.floor(Math.random() * 256);
      g.translate(-ox, -oy); g.fillStyle = pat; g.fillRect(-fw / 2 + ox, -fh / 2 + oy, fw, fh);
    }
    g.restore();
  }
  const offs = [null, null];
  function off(i, W, H) {
    let c = offs[i];
    if (!c) { c = document.createElement('canvas'); offs[i] = c; }
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    return c;
  }
  // The whole program frame at T on g (W × H): main track (with its transition), then every layer on top.
  function drawFrame(g, e, T, W, H) {
    g.save();
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none';
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const stack = C.stackAt(e, Math.min(T, Math.max(0, C.total(e) - 1e-4)));
    const main = stack.filter((L) => L.where === 'main');
    if (main.length >= 2) {
      // a transition: the outgoing and incoming clips each on their own canvas, mixed by the transition's look
      const [A, B] = main;
      const p = clamp((T - B.start) / Math.max(1e-3, B.td || (A.end - B.start)), 0, 1);
      const ca = off(0, W, H); const cb = off(1, W, H);
      const ga = ca.getContext('2d'); const gb = cb.getContext('2d');
      ga.fillStyle = '#000'; ga.fillRect(0, 0, W, H); drawLayer(ga, A, T, W, H);
      gb.fillStyle = '#000'; gb.fillRect(0, 0, W, H); drawLayer(gb, B, T, W, H);
      const tr = FX.TRANS[B.clip.trans?.type] || FX.TRANS.dissolve;
      (tr.preview || FX.TRANS.dissolve.preview)(g, ca, cb, p, W, H);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    } else if (main.length) drawLayer(g, main[0], T, W, H);
    for (const L of stack) if (L.where === 'item') drawLayer(g, L, T, W, H);
    g.restore();
  }

  // ---------- the preview canvas ----------
  // Preview resolution: the sequence frame, at most 1280 px on the long side (renders use the full size).
  function previewSize() {
    const { W, H } = host.size();
    const k = Math.min(1, 1280 / Math.max(W, H));
    return { W: Math.max(2, Math.round(W * k)), H: Math.max(2, Math.round(H * k)) };
  }
  function paint(T) {
    const e = host.edit();
    if (!e || !refs.canvas) return;
    const { W, H } = previewSize();
    if (refs.canvas.width !== W || refs.canvas.height !== H) { refs.canvas.width = W; refs.canvas.height = H; }
    drawFrame(refs.canvas.getContext('2d'), e, T, W, H);
  }
  function show(on) {
    st.on = on;
    refs.canvas?.classList.toggle('on', on);
    if (!on) { pause(); for (const d of decks.values()) d.el.pause(); }
  }
  // Every decoder the frame at T needs, seeked to the exact frame; then drawn. Newer calls win.
  async function renderExact(T, { g = null, W = 0, H = 0, edit = null } = {}) {
    const e = edit || host.edit();
    if (!e) return null;
    const seq = ++st.seq;
    const Tc = Math.min(T, Math.max(0, C.total(e) - 1e-4));
    const stack = C.stackAt(e, Tc);
    const checks = [];
    await Promise.all(stack.map(async (L) => {
      const c = L.clip;
      if (c.kind === 'image') { await image(c.src).ready; return; }
      if (c.kind === 'title' && c.img && L.where === 'main') { await image(c.img).ready; return; }
      if (!isMedia(c)) return;
      const d = deck(c);
      await d.ready;
      if (!d.el.paused) d.el.pause();
      const fps = fpsOf(c.src);
      const r = await seekExact(d, srcTimeOf(L, Tc), fps);
      checks.push({ id: c.id, src: c.src, fps, ...r });
    }));
    if (seq !== st.seq && !g) return null;
    if (g) drawFrame(g, e, Tc, W, H); else { st.T = T; paint(Tc); }
    return { T, layers: stack.length, checks };
  }

  // ---------- playback ----------
  const now = () => (st.playing ? st.T0 + ((performance.now() - st.t0) / 1000) * st.rate : st.T);
  // play from T; end: where to stop (onEnd is called there)
  function play(T, { rate = 1, end = Infinity, onEnd = null } = {}) {
    const e = host.edit();
    if (!e) return;
    st.playing = true; st.T0 = T; st.T = T; st.t0 = performance.now(); st.rate = rate; st.end = end; st.onEnd = onEnd;
    sync(e, T, true);
    cancelAnimationFrame(st.raf);
    st.raf = requestAnimationFrame(loop);
  }
  function pause() {
    if (!st.playing) return st.T;
    st.T = now(); st.playing = false;
    cancelAnimationFrame(st.raf);
    for (const d of decks.values()) if (!d.el.paused) d.el.pause();
    return st.T;
  }
  function loop() {
    if (!st.playing) return;
    const e = host.edit();
    const T = now();
    if (T >= st.end - 1e-3 || !e) { const fn = st.onEnd; pause(); st.T = Math.min(T, st.end); fn?.(st.T); return; }
    sync(e, T, false);
    paint(T);
    emit('tick', T);
    st.raf = requestAnimationFrame(loop);
  }
  // Keep decoders in step with the clock: visible media layers play at clip speed × rate (reversed ones are stepped
  // by seeks), layers starting within a second wait at their first frame, everything else pauses.
  function sync(e, T, hard) {
    const vol = host.volume?.() ?? 1;
    const live = new Set();
    const tracks = new Map((e.tracks || []).map((k) => [k.id, k]));
    const layers = [...C.layout(e).map((x) => ({ clip: x.clip, start: x.start, end: x.end, where: 'main' })),
      ...(e.tracks || []).filter((k) => k.type === 'video').flatMap((k) => k.items.map((x) => ({ clip: x, start: x.start, end: C.itemEnd(x), where: 'item', track: k })))];
    for (const L of layers) {
      const c = L.clip;
      if (!isMedia(c)) continue;
      const soon = L.start > T && L.start - T < 1.0;
      const visible = T >= L.start - 1e-6 && T < L.end;
      if (!visible && !soon) continue;
      live.add(c.id);
      const d = deck(c);
      if (d.el.readyState < 1) continue;
      const fps = fpsOf(c.src);
      if (soon) { if (!d.el.paused) d.el.pause(); const t0 = c.kind === 'freeze' ? c.at : C.srcAt(c, 0); if (Math.abs(d.el.currentTime - t0) > 0.5 / fps && !d.el.seeking) d.el.currentTime = t0; continue; }
      const want = srcTimeOf(L, T);
      const track = L.track ? tracks.get(L.track.id) : null;
      const local = T - L.start;
      const muted = c.mute || c.kind === 'freeze' || track?.mute;
      const v = muted ? 0 : clamp(vol * C.propAt(c, 'volume', local) * envelope(c, local, L.end - L.start), 0, 1);
      if (Math.abs(d.el.volume - v) > 0.01) d.el.volume = v;
      if (c.kind === 'freeze' || c.reverse) {
        if (!d.el.paused) d.el.pause();
        if (!d.el.seeking && Math.abs(d.el.currentTime - want) > 1 / fps) d.el.currentTime = want;
        continue;
      }
      const rate = (c.speed || 1) * st.rate;
      if (d.el.playbackRate !== rate) { d.el.playbackRate = rate; d.el.preservesPitch = true; }
      const drift = Math.abs(d.el.currentTime - want);
      if (d.el.paused) { if (drift > 1 / fps) d.el.currentTime = want; d.el.play().catch(() => {}); } else if ((hard || drift > 3 / fps) && !d.el.seeking) d.el.currentTime = want;
    }
    for (const [id, d] of decks) if (!live.has(id) && !d.el.paused) d.el.pause();
  }

  // ---------- frame images (agents, checks) ----------
  // The composited program frame n (exact), as a JPEG data URL at most maxW wide, with the decoders' checks.
  async function frameImage(T, { maxW = 960, edit = null, mime = 'image/jpeg', q = 0.86 } = {}) {
    const e = edit || host.edit();
    const { W, H } = host.size(e);
    const k = Math.min(1, maxW / W);
    const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
    const r = await renderExact(T, { g: c.getContext('2d'), W: c.width, H: c.height, edit: e });
    return { url: c.toDataURL(mime, q), w: c.width, h: c.height, checks: r?.checks || [], canvas: c };
  }

  // ---------- titles → PNG frames (for the ffmpeg render) ----------
  // jobs: CutFF.titleJobs(edit). Writes dir/<id>/f_00000.png… and returns { [id]: { pattern, count } }.
  async function renderTitles(jobs, W, H, F, dir, onProgress) {
    const out = {};
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    let done = 0; const all = jobs.reduce((n, j) => n + Math.ceil(j.dur * F) + 1, 0);
    for (const j of jobs) {
      const n = Math.ceil(j.dur * F) + 1;
      const sep = dir.includes('\\') && !dir.startsWith('/') ? '\\' : '/';
      const folder = `${dir}${sep}${j.id}`;
      for (let i = 0; i < n; i += 1) {
        g.clearRect(0, 0, W, H);
        VideoTitles.draw(g, { ...j.clip, dur: j.dur, where: j.where }, Math.min(j.dur, i / F), W, H);
        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        await window.hub.fs.write(`${folder}${sep}f_${String(i).padStart(5, '0')}.png`, new Uint8Array(await blob.arrayBuffer()));
        done += 1;
        if (onProgress && done % 10 === 0) onProgress(done / all);
      }
      out[j.id] = { pattern: `${folder}${sep}f_%05d.png`, count: n };
    }
    return out;
  }

  // ---------- fallback export without ffmpeg: real-time WebM ----------
  // Plays the edit (or a..b) into an offscreen canvas recorded by MediaRecorder; the decoders' sound is mixed in
  // when the browser lets us capture it. Resolves with the WebM bytes.
  async function record({ a = 0, b = null, maxSide = 1080, onProgress } = {}) {
    const e = host.edit();
    const { W: W0, H: H0, F } = host.size(e);
    const k = Math.min(1, maxSide / Math.max(W0, H0));
    const W = Math.round((W0 * k) / 2) * 2; const H = Math.round((H0 * k) / 2) * 2;
    const end = b ?? C.total(e);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const stream = cv.captureStream(F);
    let actx = null;
    try {
      actx = new AudioContext();
      const dest = actx.createMediaStreamDestination();
      for (const d of decks.values()) {
        try { const s = d.el.captureStream?.(); if (s?.getAudioTracks().length) actx.createMediaStreamSource(s).connect(dest); } catch { /* not capturable */ }
      }
      for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    } catch { /* video only */ }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
    const chunks = [];
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    await renderExact(a);
    const stopped = new Promise((res) => { rec.onstop = res; });
    rec.start(250);
    await new Promise((res) => {
      const t0 = performance.now();
      st.T0 = a; st.t0 = t0; st.rate = 1; st.playing = true; st.end = end;
      const step = () => {
        const T = a + (performance.now() - t0) / 1000;
        if (T >= end) { st.playing = false; res(); return; }
        sync(e, T, false);
        drawFrame(g, e, T, W, H);
        onProgress?.((T - a) / (end - a));
        requestAnimationFrame(step);
      };
      step();
    });
    for (const d of decks.values()) d.el.pause();
    rec.stop();
    await stopped;
    try { actx?.close(); } catch { /* closed */ }
    const blob = new Blob(chunks, { type: 'video/webm' });
    return new Uint8Array(await blob.arrayBuffer());
  }

  function forget() { for (const d of decks.values()) { d.el.pause(); d.el.removeAttribute('src'); d.el.load(); d.el.remove(); } decks.clear(); titleCanvases.clear(); }

  return {
    attach, show, paint, renderExact, play, pause, frameImage, renderTitles, record, drawFrame, forget, filterOf,
    on: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    get on_() { return st.on; }, get playing() { return st.playing; }, get time() { return now(); }, get decks() { return decks; },
  };
})();
