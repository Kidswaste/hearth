// FrameRead: the renderer half of the frame reader (framereader.js is the main half). Exact frames of ANY video
// (Hearth's recordings and the owner's reference footage) for the owner and for the chats.
// With ffmpeg: everything goes through framereader.js (true fps from ffprobe, frame-exact seeks). Without it: a hidden
// <video> seeks to the middle of the wanted frame and requestVideoFrameCallback confirms which frame was presented.
//
// API (other streams can use it; all async):
//   FrameRead.info(file)                              → { fps, frames, duration, w, h, codec, vfr, exact: bool }
//   FrameRead.at(file, { frame | time | tc }, o)      → { path, frame, time, tc, url }      o: { width, format }
//   FrameRead.frames(file, { frames | times }, o)     → [ …at results ]
//   FrameRead.every(file, N, { from, to, max }, o) / FrameRead.spread(file, count, { from, to }, o)
//   FrameRead.scenes(file, { sensitivity | threshold, pictures }) → { cuts: [{ frame, time, tc, score, length, path }] }
//   FrameRead.motion(file, { buckets })               → { curve, peaks, average, calm, busy }
//   FrameRead.pacing(file, { sensitivity })           → { shots, average, median, shortest, longest, perMinute, words }
//   FrameRead.palette(file, { time, count })          → { colors: ['#…'], time }
//   FrameRead.light(file)                             → { brightness: { avg, min, max }, saturation: {…}, curve }
//   FrameRead.sheet(file, { layout, count, cols, rows, from, to, theme, labels, width, title }) → { path, frames }
//   FrameRead.verify(file, frame)                     → { ok, asked, presented, mediaTime } (the player shows that frame)
//   FrameRead.diff(file, a, b)                        → { path, score } (a picture of what changed)
//   FrameRead.read(file, mode, args)                  → { text, images: [{ path, label }], value } (commands and agents)
//   FrameRead.show(result, file)                      → the results panel
//   FrameRead.pickAndRead(file?)                      → choose a video, then a reading
const FrameRead = (() => {
  const D = CaptureData;
  const api = () => window.hub.capture;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const fileUrl = (p) => Capture.fileUrl(p);
  const VIDEO = /\.(webm|mp4|mov|m4v|mkv|avi|gif)$/i;

  // ---------- timecodes (same rules as framereader.js) ----------
  const pad = (n, w = 2) => String(Math.max(0, Math.floor(n))).padStart(w, '0');
  function tc(seconds, fps = 30, style = Capture.prefs.tc) {
    const s = Math.max(0, Number(seconds) || 0); const f = fps > 0 ? fps : 30;
    const frame = Math.floor(s * f + 1e-3);
    if (style === 's') return `${s.toFixed(3)}s`;
    if (style === 'frames') return `f${frame}`;
    if (style === 'ms') return `${Math.floor(s / 60)}:${pad(s % 60)}.${pad(Math.round((s % 1) * 1000) % 1000, 3)}`;
    const nominal = Math.round(f); const ff = frame % nominal; const t = Math.floor(frame / nominal);
    const smpte = `${pad(t / 3600)}:${pad((t / 60) % 60)}:${pad(t % 60)}:${pad(ff)}`;
    return style === 'both' ? `${smpte} · f${frame}` : smpte;
  }
  function parseTime(text, fps = 30) {
    const t = String(text ?? '').trim();
    let m = t.match(/^(?:f|#|frame\s*)(\d+)$/i);
    if (m) return { frame: Number(m[1]) };
    m = t.match(/^(\d+):(\d{1,2}):(\d{1,2})[:;](\d{1,3})$/);
    if (m) return { frame: (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * Math.round(fps) + Number(m[4]) };
    m = t.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
    if (m) return { time: Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) };
    m = t.match(/^(-?\d+(?:\.\d+)?)\s*(ms|s)?$/i);
    if (m) return { time: m[2]?.toLowerCase() === 'ms' ? Number(m[1]) / 1000 : Number(m[1]) };
    return null;
  }

  // ---------- ffmpeg path (main) ----------
  let hasFf = null;
  async function ff() { if (hasFf === null) { try { hasFf = Boolean((await Capture.info()).ffmpeg); } catch { hasFf = false; } } return hasFf; }
  async function main(op, file, args = {}, opts = {}) {
    const r = await api().frames(op, file, args, opts);
    if (!r.ok) { const e = new Error(r.error); e.code = r.code; throw e; }
    return r.value;
  }
  const withUrl = (x) => (x && x.path ? { ...x, url: fileUrl(x.path) } : x);

  // ---------- the <video> path (no ffmpeg): seek to the middle of a frame, confirm with requestVideoFrameCallback ----------
  const vids = new Map(); // file → { v, fps, duration, w, h }
  const RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
  async function videoOf(file) {
    if (vids.has(file)) return vids.get(file);
    const v = el('video', { muted: true, preload: 'auto', playsInline: true, crossOrigin: 'anonymous' });
    v.src = fileUrl(file);
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error(`Can't play ${base(file)} here`)); setTimeout(() => rej(new Error('The video didn\'t load')), 15000); });
    // MediaRecorder WebM reports Infinity until the end is reached once
    if (!Number.isFinite(v.duration)) { v.currentTime = 1e9; await new Promise((r) => { v.onseeked = r; setTimeout(r, 4000); }); v.currentTime = 0; await new Promise((r) => { v.onseeked = r; setTimeout(r, 2000); }); }
    // the frame rate from the frames the decoder presents (median spacing of mediaTime), snapped to a common rate
    const times = [];
    await new Promise((res) => {
      const cb = (_now, meta) => { times.push(meta.mediaTime); if (times.length < 14) v.requestVideoFrameCallback(cb); else res(); };
      v.requestVideoFrameCallback(cb);
      v.play().catch(res);
      setTimeout(res, 2500);
    });
    v.pause();
    const deltas = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0.002).sort((a, b) => a - b);
    let fps = deltas.length ? 1 / deltas[Math.floor(deltas.length / 2)] : 30;
    fps = RATES.reduce((best, r) => (Math.abs(r - fps) < Math.abs(best - fps) ? r : best), RATES[0]);
    const rec = { v, fps, duration: v.duration, w: v.videoWidth, h: v.videoHeight };
    vids.set(file, rec);
    if (vids.size > 4) { const [k, old] = vids.entries().next().value; old.v.removeAttribute('src'); old.v.load(); vids.delete(k); }
    return rec;
  }
  // seek to frame n and return what was presented (mediaTime of the shown frame)
  async function seekFrame(r, n) {
    const { v, fps } = r;
    let presented = null; let mediaTime = null;
    for (let tries = 0; tries < 3; tries += 1) {
      const target = (n + 0.5 + (presented == null ? 0 : (n - presented) * 0.5)) / fps;
      const shown = new Promise((res) => { v.requestVideoFrameCallback((_now, meta) => res(meta)); setTimeout(() => res(null), 3000); });
      v.currentTime = Math.min(Math.max(0, target), Math.max(0, (r.duration || target) - 0.001));
      const meta = await shown;
      mediaTime = meta ? meta.mediaTime : v.currentTime;
      presented = Math.floor(mediaTime * fps + 1e-3);
      if (presented === n) break;
    }
    return { presented, mediaTime };
  }
  async function videoFrame(file, want, o = {}) {
    const r = await videoOf(file);
    const total = Math.max(1, Math.floor((r.duration || 0) * r.fps + 1e-3));
    let n = want.frame != null ? Number(want.frame) : Math.floor(Number(want.time || 0) * r.fps + 1e-3);
    if (want.tc) { const p = parseTime(want.tc, r.fps); n = p?.frame ?? Math.floor((p?.time || 0) * r.fps + 1e-3); }
    if (n < 0) n += total;
    n = Math.max(0, Math.min(total - 1, n));
    const { presented, mediaTime } = await seekFrame(r, n);
    const w = o.width ? Math.round(o.width) : r.w; const h = Math.round((r.h * w) / r.w);
    const c = el('canvas', { width: w, height: h });
    c.getContext('2d').drawImage(r.v, 0, 0, w, h);
    const fmt = o.format === 'jpg' ? 'jpg' : 'png';
    const path = await api().save({ name: `${base(file).replace(/\.\w+$/, '')} f${String(n).padStart(6, '0')}`, data: Capture.canvasData(c, fmt, 0.88), ext: fmt, sub: 'frames' });
    return { path, url: fileUrl(path), frame: n, time: n / r.fps, tc: tc(n / r.fps, r.fps), presented, mediaTime, exact: presented === n, w, h };
  }

  // ---------- the API ----------
  async function info(file) {
    if (await ff()) { try { const p = await main('probe', file); const times = await main('times', file).catch(() => null); return { ...p, frames: times ? times.length : p.frames, exact: true }; } catch (err) { if (err.code !== 'NO_FFMPEG') throw err; } }
    const r = await videoOf(file);
    return { fps: r.fps, frames: Math.floor(r.duration * r.fps + 1e-3), duration: r.duration, w: r.w, h: r.h, codec: null, vfr: null, exact: false, note: 'no ffmpeg: frame rate estimated from playback' };
  }
  async function at(file, want = {}, o = {}) {
    if (typeof want !== 'object') want = parseTime(want) || { time: Number(want) || 0 };
    if (await ff()) return withUrl(await main('at', file, want, o));
    return videoFrame(file, want, o);
  }
  async function frames(file, { frames: f = [], times = [] } = {}, o = {}) {
    if (await ff()) return (await main('frames', file, { frames: f, times }, o)).map(withUrl);
    const out = [];
    for (const n of f) out.push(await videoFrame(file, { frame: n }, o));
    for (const t of times) out.push(await videoFrame(file, { time: t }, o));
    return out;
  }
  async function every(file, n = 10, { from, to, max = 60 } = {}, o = {}) {
    if (await ff()) return (await main('every', file, { every: n, from, to, max }, o)).map(withUrl);
    const i = await info(file);
    const a = Math.floor((from || 0) * i.fps); const b = to != null ? Math.floor(to * i.fps) : i.frames - 1;
    const list = []; for (let k = a; k <= b && list.length < max; k += Math.max(1, n)) list.push(k);
    return frames(file, { frames: list }, o);
  }
  async function spread(file, count = 12, { from, to } = {}, o = {}) {
    if (await ff()) return (await main('spread', file, { count, from, to }, o)).map(withUrl);
    const i = await info(file);
    const a = Math.floor((from || 0) * i.fps); const b = to != null ? Math.floor(to * i.fps) : i.frames - 1;
    const list = []; for (let k = 0; k < count; k += 1) list.push(Math.round(a + ((b - a) * (count === 1 ? 0.5 : k / (count - 1)))));
    return frames(file, { frames: [...new Set(list)] }, o);
  }
  const thresholdOf = (s) => (typeof s === 'number' ? s : D.SENSITIVITY.find((x) => x.id === s)?.threshold ?? 0.3);
  // curves without ffmpeg: sample ≤ 240 frames at 64 px, mean difference (motion), histogram change (scene), luma, saturation
  async function videoCurves(file) {
    const r = await videoOf(file);
    const total = Math.floor(r.duration * r.fps + 1e-3);
    const step = Math.max(1, Math.ceil(total / 240));
    const W = 64; const Hh = Math.max(2, Math.round((r.h * W) / r.w));
    const c = el('canvas', { width: W, height: Hh }); const g = c.getContext('2d', { willReadFrequently: true });
    let prev = null; let prevHist = null; const points = [];
    for (let n = 0; n < total; n += step) {
      await seekFrame(r, n);
      g.drawImage(r.v, 0, 0, W, Hh);
      const d = g.getImageData(0, 0, W, Hh).data;
      const gray = new Float32Array(W * Hh); const hist = new Float32Array(48);
      let luma = 0; let sat = 0;
      for (let i = 0, j = 0; i < d.length; i += 4, j += 1) {
        const R = d[i]; const G = d[i + 1]; const B = d[i + 2];
        const y = 0.299 * R + 0.587 * G + 0.114 * B; gray[j] = y; luma += y;
        const mx = Math.max(R, G, B); const mn = Math.min(R, G, B); sat += mx ? (mx - mn) / mx : 0;
        hist[Math.min(15, R >> 4)] += 1; hist[16 + Math.min(15, G >> 4)] += 1; hist[32 + Math.min(15, B >> 4)] += 1;
      }
      let motion = 0; let scene = 0;
      if (prev) { for (let j = 0; j < gray.length; j += 1) motion += Math.abs(gray[j] - prev[j]); motion /= gray.length * 255; }
      if (prevHist) { for (let k = 0; k < 48; k += 1) scene += Math.abs(hist[k] - prevHist[k]); scene /= gray.length * 6; }
      points.push({ frame: n, time: n / r.fps, motion: Math.round(motion * 1e4) / 1e4, scene: Math.round(scene * 1e4) / 1e4, luma: Math.round((luma / gray.length / 255) * 1e3) / 1e3, sat: Math.round((sat / gray.length) * 1e3) / 1e3 });
      prev = gray; prevHist = hist;
    }
    return { fps: r.fps, duration: r.duration, frames: total, points, sampled: step };
  }
  async function curves(file) {
    if (await ff()) return main('analyze', file, {});
    return videoCurves(file);
  }
  async function scenes(file, { sensitivity = 'normal', threshold = null, pictures = true, max = 60 } = {}) {
    const th = threshold ?? thresholdOf(sensitivity);
    if (await ff()) { const s = await main('scenes', file, { threshold: th, pictures, max }, { width: 640, format: 'jpg' }); s.cuts = s.cuts.map(withUrl); return s; }
    const c = await videoCurves(file);
    const cuts = [{ frame: 0, time: 0, score: 1 }];
    for (const p of c.points.slice(1)) if (p.scene >= th && p.time - cuts[cuts.length - 1].time >= 0.4) cuts.push({ frame: p.frame, time: p.time, score: p.scene });
    cuts.forEach((x, i) => { x.tc = tc(x.time, c.fps); x.length = Math.round(((cuts[i + 1]?.time ?? c.duration) - x.time) * 1000) / 1000; });
    if (pictures) { const pics = await frames(file, { frames: cuts.map((x) => x.frame) }, { width: 640, format: 'jpg' }); cuts.forEach((x, i) => { x.path = pics[i]?.path; x.url = pics[i]?.url; }); }
    return { fps: c.fps, duration: c.duration, threshold: th, cuts, estimated: true };
  }
  async function motion(file, { buckets = 48 } = {}) {
    if (await ff()) return main('motion', file, { buckets });
    const c = await videoCurves(file);
    const n = Math.max(4, Math.min(200, buckets)); const pts = c.points; const t1 = pts[pts.length - 1]?.time || 1;
    const curve = Array.from({ length: n }, (_, i) => ({ time: Math.round(((t1 * (i + 0.5)) / n) * 1000) / 1000, motion: 0, luma: 0, scene: 0, k: 0 }));
    for (const p of pts) { const b = curve[Math.min(n - 1, Math.floor((p.time / Math.max(1e-6, t1)) * n))]; b.motion += p.motion; b.luma += p.luma; b.scene = Math.max(b.scene, p.scene); b.k += 1; }
    for (const b of curve) { if (b.k) { b.motion /= b.k; b.luma /= b.k; } delete b.k; }
    const avg = pts.reduce((a, p) => a + p.motion, 0) / Math.max(1, pts.length);
    const peaks = [...pts].sort((a, b) => b.motion - a.motion).filter((p, i, all) => all.slice(0, i).every((q) => Math.abs(q.time - p.time) > 0.5)).slice(0, 5).map((p) => ({ time: p.time, frame: p.frame, tc: tc(p.time, c.fps), motion: p.motion }));
    return { fps: c.fps, duration: c.duration, average: Math.round(avg * 1e4) / 1e4, calm: Math.round((curve.filter((b) => b.motion < avg * 0.5).length / n) * 100) / 100, busy: Math.round((curve.filter((b) => b.motion > avg * 1.5).length / n) * 100) / 100, curve, peaks, estimated: true };
  }
  // pacing: how a reference is cut (for "bring the vibe", not the footage)
  async function pacing(file, { sensitivity = 'normal' } = {}) {
    const s = await scenes(file, { sensitivity, pictures: false, max: 500 });
    const lens = s.cuts.map((x) => x.length).filter((x) => x > 0).sort((a, b) => a - b);
    const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
    const perMinute = s.duration ? Math.round(((s.cuts.length - 1) / s.duration) * 60 * 10) / 10 : 0;
    const words = avg < 0.8 ? 'frantic, rapid-fire cuts' : avg < 1.6 ? 'fast, punchy cutting' : avg < 3.5 ? 'steady, rhythmic cutting' : avg < 7 ? 'calm, lingering shots' : 'long takes, very slow';
    const m = await motion(file, { buckets: 24 }).catch(() => null);
    const energy = !m ? '' : m.average > 0.06 ? 'high motion' : m.average > 0.025 ? 'medium motion' : 'low motion';
    return { shots: s.cuts.length, duration: Math.round(s.duration * 100) / 100, average: Math.round(avg * 100) / 100, median: lens.length ? Math.round(lens[Math.floor(lens.length / 2)] * 100) / 100 : 0, shortest: lens[0] || 0, longest: lens[lens.length - 1] || 0, perMinute, words: [words, energy].filter(Boolean).join(', '), cuts: s.cuts.map((x) => ({ time: x.time, tc: x.tc, length: x.length })) };
  }
  // the main colors of a frame (k-means on a small copy), most common first
  function paletteOf(img, count = 6) {
    const W = 96; const Hh = Math.max(1, Math.round(((img.naturalHeight || img.height) * W) / (img.naturalWidth || img.width)));
    const c = el('canvas', { width: W, height: Hh }); const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, Hh);
    const d = g.getImageData(0, 0, W, Hh).data; const px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    let cents = Array.from({ length: count }, (_, k) => px[Math.floor(((k + 0.5) / count) * px.length)].slice());
    let groups = [];
    for (let it = 0; it < 10; it += 1) {
      groups = cents.map(() => []);
      for (const p of px) { let bi = 0; let bd = Infinity; cents.forEach((cc, i) => { const dd = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2; if (dd < bd) { bd = dd; bi = i; } }); groups[bi].push(p); }
      cents = groups.map((gp, i) => (gp.length ? [0, 1, 2].map((k) => gp.reduce((a, p) => a + p[k], 0) / gp.length) : cents[i]));
    }
    const hex = (cc) => `#${cc.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    return cents.map((cc, i) => ({ hex: hex(cc), share: groups[i].length / px.length })).filter((x) => x.share > 0.01).sort((a, b) => b.share - a.share).map((x) => ({ hex: x.hex, share: Math.round(x.share * 100) }));
  }
  async function palette(file, { time = null, count = 6 } = {}) {
    if (time == null) {
      // across the video: 5 frames, one palette
      const pics = await spread(file, 5, {}, { width: 320, format: 'jpg' });
      const sheet = el('canvas', { width: 320 * 5, height: 180 }); const g = sheet.getContext('2d');
      for (const [i, p] of pics.entries()) { const im = await Capture.loadImage(p.path); g.drawImage(im, i * 320, 0, 320, 180); }
      return { colors: paletteOf(sheet, count), time: null };
    }
    const f = await at(file, typeof time === 'object' ? time : { time }, { width: 480, format: 'jpg' });
    return { colors: paletteOf(await Capture.loadImage(f.path), count), time: f.time, tc: f.tc, path: f.path };
  }
  async function light(file) {
    const c = await curves(file);
    const st = (k) => { const v = c.points.map((p) => p[k] || 0); return { avg: Math.round((v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)) * 1000) / 1000, min: Math.min(...v), max: Math.max(...v) }; };
    const b = st('luma');
    return { brightness: b, saturation: st('sat'), words: `${b.avg < 0.25 ? 'dark, low-key' : b.avg > 0.6 ? 'bright, high-key' : 'mid-tones'}${b.max - b.min > 0.4 ? ', strong light changes' : ''}`, curve: c.points.filter((_, i) => i % Math.max(1, Math.round(c.points.length / 48)) === 0).map((p) => ({ time: p.time, luma: p.luma, sat: p.sat })) };
  }
  async function verify(file, frame) {
    const r = await videoOf(file);
    const n = Number(frame) || 0;
    const { presented, mediaTime } = await seekFrame(r, n);
    return { ok: presented === n, asked: n, presented, mediaTime: Math.round(mediaTime * 1e6) / 1e6, fps: r.fps };
  }
  async function diff(file, a, b) {
    const [fa, fb] = await frames(file, { frames: [Number(a) || 0, Number(b) || 0] }, { width: 640, format: 'png' });
    const [ia, ib] = await Promise.all([Capture.loadImage(fa.path), Capture.loadImage(fb.path)]);
    const W = ia.naturalWidth; const Hh = ia.naturalHeight;
    const c = el('canvas', { width: W, height: Hh }); const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const A = g.getImageData(0, 0, W, Hh);
    g.drawImage(ib, 0, 0, W, Hh); const B = g.getImageData(0, 0, W, Hh);
    let sum = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      const d = (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])) / 3;
      sum += d; const v = Math.min(255, d * 3);
      B.data[i] = v; B.data[i + 1] = v * 0.55; B.data[i + 2] = v * 0.15; B.data[i + 3] = 255;
    }
    g.putImageData(B, 0, 0);
    const path = await api().save({ name: `${base(file).replace(/\.\w+$/, '')} diff f${a}-f${b}`, data: Capture.canvasData(c), sub: 'frames' });
    return { path, url: fileUrl(path), score: Math.round((sum / (W * Hh) / 255) * 1e4) / 1e4, a: fa, b: fb };
  }

  // ---------- contact sheets with timecodes (drawn here, so labels look the same everywhere) ----------
  async function sheet(file, o = {}) {
    const L = { ...(D.SHEETS.find((s) => s.id === (o.layout || '4x3')) || D.SHEETS[1]) };
    if (o.cols) L.cols = Number(o.cols);
    if (o.rows) L.rows = Number(o.rows);
    const theme = D.SHEET_THEMES.find((t) => t.id === (o.theme || (L.polaroid ? 'light' : L.film ? 'film' : 'dark'))) || D.SHEET_THEMES[0];
    const i = await info(file);
    let pics;
    if (L.scenes) { const s = await scenes(file, { sensitivity: o.sensitivity || 'normal' }); pics = s.cuts.map((x) => ({ ...x })); L.rows = Math.ceil(pics.length / L.cols); }
    else pics = await spread(file, o.count || L.cols * L.rows, { from: o.from, to: o.to }, { width: Math.round((o.width || 2400) / L.cols), format: 'jpg' });
    if (!L.rows) L.rows = Math.ceil(pics.length / L.cols);
    const label = o.labels || L.label || 'tc';
    const W = Math.round(o.width || (L.cols === 1 ? 900 : 2400));
    const gap = L.gap ?? Math.round(W / 160);
    const head = o.title === false ? 0 : Math.round(W / 26);
    const cellW = Math.floor((W - gap * (L.cols + 1)) / L.cols);
    const cellH = Math.round((cellW * (i.h || 9)) / (i.w || 16));
    const lab = label === 'none' ? 0 : Math.round(Math.max(16, cellW / 11));
    const notes = L.notes ? Math.round(cellH * 0.45) : 0;
    const frameP = L.polaroid ? Math.round(cellW * 0.05) : 0;
    const rowH = cellH + lab + notes + frameP * 2;
    const Hh = head + gap + L.rows * (rowH + gap);
    const c = el('canvas', { width: W, height: Hh }); const g = c.getContext('2d');
    g.fillStyle = theme.bg; g.fillRect(0, 0, W, Hh);
    if (head) {
      g.fillStyle = theme.fg; g.font = `600 ${Math.round(head * 0.5)}px system-ui, -apple-system, "Segoe UI", sans-serif`; g.textBaseline = 'middle';
      g.fillText(o.titleText || base(file), gap, head / 2 + gap / 2);
      g.fillStyle = theme.sub; g.font = `${Math.round(head * 0.34)}px system-ui, sans-serif`; g.textAlign = 'right';
      g.fillText(`${i.w}×${i.h} · ${i.fps} fps · ${i.frames} frames · ${tc(i.duration, i.fps, 'ms')}${i.exact ? '' : ' (estimated)'}`, W - gap, head / 2 + gap / 2);
      g.textAlign = 'left';
    }
    for (const [k, p] of pics.entries()) {
      const col = k % L.cols; const row = Math.floor(k / L.cols);
      if (row >= L.rows) break;
      const x = gap + col * (cellW + gap); const y = head + gap + row * (rowH + gap);
      if (L.polaroid) {
        g.save(); g.translate(x + cellW / 2, y + rowH / 2); g.rotate((((k * 37) % 7) - 3) * 0.006); g.translate(-(x + cellW / 2), -(y + rowH / 2));
        g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 8; g.fillStyle = '#fff'; g.fillRect(x, y, cellW, rowH); g.shadowBlur = 0;
      }
      try { const im = await Capture.loadImage(p.path); g.drawImage(im, x + frameP, y + frameP, cellW - frameP * 2, cellH - frameP * 2 + (L.polaroid ? frameP * 2 - frameP * 2 : 0)); } catch { g.fillStyle = '#333'; g.fillRect(x, y, cellW, cellH); }
      if (L.film) { g.fillStyle = '#000'; for (let s = 0; s < 8; s += 1) { g.fillRect(x + (s + 0.3) * (cellW / 8), y + 2, cellW / 16, cellH * 0.04); g.fillRect(x + (s + 0.3) * (cellW / 8), y + cellH - 2 - cellH * 0.04, cellW / 16, cellH * 0.04); } }
      if (lab) {
        const text = label === 'frame' ? `f${p.frame}` : label === 'both' ? `${tc(p.time, i.fps, 'smpte')}  ·  f${p.frame}` : label === 'time' ? tc(p.time, i.fps, 'ms') : tc(p.time, i.fps, Capture.prefs.tc === 'both' ? 'both' : Capture.prefs.tc);
        g.fillStyle = L.polaroid ? '#333' : theme.fg; g.font = `${L.polaroid ? 'italic ' : ''}${Math.round(lab * 0.62)}px ui-monospace, Menlo, Consolas, monospace`; g.textBaseline = 'middle';
        g.fillText(`${L.scenes ? `#${k + 1} ` : ''}${text}${L.scenes && p.length ? `  (${p.length.toFixed(1)}s)` : ''}`, x + frameP + 2, y + cellH + lab / 2 + frameP);
      }
      if (notes) { g.strokeStyle = theme.sub; g.globalAlpha = 0.4; for (let l = 1; l <= 3; l += 1) { g.beginPath(); g.moveTo(x, y + cellH + lab + (notes * l) / 4); g.lineTo(x + cellW, y + cellH + lab + (notes * l) / 4); g.stroke(); } g.globalAlpha = 1; }
      if (L.polaroid) g.restore();
    }
    const path = await api().save({ name: `${base(file).replace(/\.\w+$/, '')} sheet ${L.id}`, data: Capture.canvasData(c, 'jpg', 0.9), ext: 'jpg', sub: 'sheets' });
    return { path, url: fileUrl(path), w: W, h: Hh, layout: L.id, frames: pics.slice(0, L.cols * L.rows).map((p) => ({ frame: p.frame, time: Math.round(p.time * 1000) / 1000, tc: tc(p.time, i.fps, 'smpte') })) };
  }

  // ---------- a chart of the motion / light curves ----------
  function chart(m, { W = 960, Hh = 220, cuts = [] } = {}) {
    const c = el('canvas', { width: W, height: Hh }); const g = c.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const col = (v, d) => (css.getPropertyValue(v).trim() || d);
    g.fillStyle = '#0e0f12'; g.fillRect(0, 0, W, Hh);
    const pts = m.curve || []; const dur = m.duration || pts[pts.length - 1]?.time || 1;
    const max = Math.max(1e-4, ...pts.map((p) => p.motion));
    const X = (t) => 30 + (t / dur) * (W - 40); const Y = (v) => Hh - 24 - v * (Hh - 44);
    g.strokeStyle = 'rgba(255,255,255,.08)'; for (let s = 0; s <= dur; s += Math.max(1, Math.round(dur / 10))) { g.beginPath(); g.moveTo(X(s), 10); g.lineTo(X(s), Hh - 24); g.stroke(); g.fillStyle = '#8a8780'; g.font = '11px system-ui, sans-serif'; g.fillText(`${s}s`, X(s) - 6, Hh - 8); }
    for (const t of cuts) { g.strokeStyle = 'rgba(155,107,255,.6)'; g.beginPath(); g.moveTo(X(t), 10); g.lineTo(X(t), Hh - 24); g.stroke(); }
    const area = g.createLinearGradient(0, 10, 0, Hh - 24); area.addColorStop(0, col('--fh-gold', '#ffc233')); area.addColorStop(1, 'rgba(255,106,26,.15)');
    g.beginPath(); g.moveTo(X(pts[0]?.time || 0), Y(0)); for (const p of pts) g.lineTo(X(p.time), Y(p.motion / max)); g.lineTo(X(pts[pts.length - 1]?.time || dur), Y(0)); g.closePath(); g.fillStyle = area; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
    g.strokeStyle = '#cfe8ff'; g.lineWidth = 1.5; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.time), Y(p.luma ?? 0)) : g.moveTo(X(p.time), Y(p.luma ?? 0)))); g.stroke();
    for (const p of m.peaks || []) { g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(X(p.time), Y(p.motion / max), 4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f3efe6'; g.font = '600 12px system-ui, sans-serif'; g.fillText('motion', 34, 22); g.fillStyle = '#cfe8ff'; g.fillText('brightness', 90, 22); if (cuts.length) { g.fillStyle = '#b89bff'; g.fillText('cuts', 170, 22); }
    return c;
  }

  // ---------- one entry point for commands and agents ----------
  const MODE_ALIAS = { blacks: 'black', fades: 'black', still: 'freeze', holds: 'freeze', frozen: 'freeze', quiet: 'silence', silent: 'silence', lufs: 'loudness', loud: 'loudness', volume: 'loudness', iframes: 'keyframes', bars: 'letterbox', crop: 'letterbox', colorbar: 'barcode', story: 'barcode', wave: 'waveform', sound: 'waveform', loops: 'loop', seamless: 'loop', frame: 'at', time: 'at', exact: 'at', n: 'every', step: 'every', even: 'spread', evenly: 'spread', cuts: 'scenes', shots: 'scenes', scene: 'scenes', contact: 'sheet', grid: 'sheet', energy: 'motion', rhythm: 'pacing', pace: 'pacing', colors: 'palette', colours: 'palette', brightness: 'light', luma: 'light', probe: 'info', fps: 'info', check: 'verify', compare: 'diff' };
  const modeOf = (m) => { const k = String(m || '').toLowerCase(); return D.READ_MODES.some((x) => x.id === k) ? k : MODE_ALIAS[k] || null; };
  async function read(file, mode = 'sheet', a = {}) {
    if (!file) throw new Error('Which video? (a path, "last" for the newest recording, or open one in Video Review)');
    const m = modeOf(mode);
    if (!m) throw new Error(`Modes: ${D.READ_MODES.map((x) => x.id).join(', ')}`);
    const fps0 = async () => (await info(file)).fps;
    if (m === 'info') { const v = await info(file); return { value: v, text: `${base(file)}: ${v.w}×${v.h}, ${v.fps} fps${v.vfr ? ' (variable)' : ''}, ${v.frames} frames, ${tc(v.duration, v.fps, 'ms')}${v.codec ? `, ${v.codec}` : ''}${v.exact ? '' : ' (estimated without ffmpeg)'}`, images: [] }; }
    if (m === 'at') {
      const fps = await fps0();
      // timecodes and "f12" are read with the video's own rate (00:00:01:05 is frame 30 at 25 fps, 35 at 30)
      const asTime = (t) => (typeof t === 'number' ? { time: t } : parseTime(t, fps) || { time: 0 });
      const wants = [].concat(a.frames ?? []).map((frame) => ({ frame: Number(frame) })).concat([].concat(a.times ?? a.time ?? (a.frames ? [] : [0])).map(asTime));
      const out = [];
      for (const w of wants.slice(0, 24)) out.push(await at(file, w, { width: a.width, format: a.format || 'png' }));
      return { value: out.map(({ frame, time, tc: t, path, exact }) => ({ frame, time, tc: t, path, ...(exact === false ? { exact } : {}) })), text: out.map((f) => `${tc(f.time, fps, 'both')} → ${f.path}`).join('\n'), images: out.map((f) => ({ path: f.path, label: tc(f.time, fps, 'both') })) };
    }
    if (m === 'every' || m === 'spread') {
      const list = m === 'every' ? await every(file, Number(a.every || a.n || 10), { from: a.from, to: a.to, max: a.max || 48 }, { width: a.width || 640, format: 'jpg' }) : await spread(file, Number(a.count || 12), { from: a.from, to: a.to }, { width: a.width || 640, format: 'jpg' });
      const fps = await fps0();
      return { value: list.map(({ frame, time, path }) => ({ frame, time, tc: tc(time, fps, 'smpte'), path })), text: list.map((f) => `${tc(f.time, fps, 'both')} → ${f.path}`).join('\n'), images: list.map((f) => ({ path: f.path, label: tc(f.time, fps, 'both') })) };
    }
    if (m === 'scenes') {
      const s = await scenes(file, { sensitivity: a.sensitivity || 'normal', threshold: a.threshold ?? null });
      return { value: s, text: `${s.cuts.length} shots${s.estimated ? ' (estimated without ffmpeg)' : ''}:\n${s.cuts.map((x, i) => `#${i + 1} ${x.tc} (${x.length.toFixed(2)}s) → ${x.path}`).join('\n')}`, images: s.cuts.map((x, i) => ({ path: x.path, label: `#${i + 1} ${x.tc}` })) };
    }
    if (m === 'sheet') { const s = await sheet(file, a); return { value: s, text: `Contact sheet ${s.layout}: ${s.path}\n${s.frames.map((f) => `f${f.frame} ${f.tc}`).join(' · ')}`, images: [{ path: s.path, label: 'contact sheet' }] }; }
    if (m === 'motion') {
      const mo = await motion(file, { buckets: a.buckets || 48 });
      const s = await scenes(file, { pictures: false }).catch(() => null);
      const c = chart(mo, { cuts: s ? s.cuts.slice(1).map((x) => x.time) : [] });
      const path = await api().save({ name: `${base(file).replace(/\.\w+$/, '')} motion`, data: Capture.canvasData(c), sub: 'sheets' });
      return { value: { average: mo.average, calm: mo.calm, busy: mo.busy, peaks: mo.peaks, curve: mo.curve.map((p) => Math.round(p.motion * 1000) / 1000) }, text: `Motion: average ${mo.average}, calm ${Math.round(mo.calm * 100)} %, busy ${Math.round(mo.busy * 100)} % of the time. Busiest: ${mo.peaks.map((p) => p.tc).join(', ')}.\nChart: ${path}`, images: [{ path, label: 'motion curve' }] };
    }
    if (m === 'pacing') { const p = await pacing(file, a); return { value: p, text: `${p.shots} shots in ${p.duration}s: average ${p.average}s (median ${p.median}s, ${p.shortest.toFixed?.(2) ?? p.shortest}–${p.longest.toFixed?.(2) ?? p.longest}s), ${p.perMinute} cuts a minute: ${p.words}.`, images: [] }; }
    if (m === 'palette') { const p = await palette(file, { time: a.time ?? null, count: a.count || 6 }); return { value: p, text: `Palette${p.tc ? ` at ${p.tc}` : ' across the video'}: ${p.colors.map((x) => `${x.hex} ${x.share}%`).join(', ')}`, images: p.path ? [{ path: p.path, label: p.tc }] : [] }; }
    if (m === 'light') { const l = await light(file); return { value: l, text: `Brightness ${l.brightness.avg} (${l.brightness.min}–${l.brightness.max}), saturation ${l.saturation.avg}: ${l.words}.`, images: [] }; }
    if (m === 'verify') { const v = await verify(file, a.frame ?? a.n ?? 0); return { value: v, text: v.ok ? `✓ The player shows frame ${v.presented} (media time ${v.mediaTime}s at ${v.fps} fps).` : `✖ Asked for frame ${v.asked}, the player showed ${v.presented} (media time ${v.mediaTime}s).`, images: [] }; }
    if (m === 'diff') { const d = await diff(file, a.a ?? a.frames?.[0] ?? 0, a.b ?? a.frames?.[1] ?? 1); return { value: { score: d.score, path: d.path }, text: `Difference f${d.a.frame} → f${d.b.frame}: ${Math.round(d.score * 1000) / 10} % (${d.path})`, images: [{ path: d.path, label: 'difference' }] }; }
    // ffmpeg's own detectors (they need ffmpeg: the player can't hear silence or measure loudness)
    const needFf = async () => { if (!await ff()) throw new Error('This reading needs ffmpeg (Video Review → ⋯ → ffmpeg, or brew / winget install ffmpeg)'); };
    const stretches = (list, what) => (list.length ? list.map((x) => `${tc(x.start, 30, 'ms')} → ${tc(x.end, 30, 'ms')} (${x.length.toFixed(2)}s)`).join('\n') : `No ${what}.`);
    if (m === 'black' || m === 'freeze' || m === 'silence') {
      await needFf();
      const list = await main(m, file, { min: a.min, from: a.from, to: a.to });
      const what = { black: 'black stretches', freeze: 'frozen stretches (holds)', silence: 'quiet stretches' }[m];
      return { value: list, text: `${list.length} ${what}:\n${stretches(list, what)}`, images: [] };
    }
    if (m === 'loudness') {
      await needFf();
      const l = await main('loudness', file);
      if (!l) return { value: null, text: 'No sound in this video.', images: [] };
      const advice = l.integrated == null ? '' : l.integrated < -18 ? ' Quiet for socials (they aim near -14 LUFS).' : l.integrated > -10 ? ' Loud: platforms will turn it down.' : ' Right for socials.';
      return { value: l, text: `Loudness ${l.integrated} LUFS, range ${l.range} LU, true peak ${l.truePeak} dBFS.${advice}`, images: [] };
    }
    if (m === 'keyframes') { await needFf(); const k = await main('keyframes', file); return { value: k, text: `${k.length} keyframes (clean cut points): ${k.slice(0, 40).map((t) => t.toFixed(2)).join(', ')}${k.length > 40 ? '…' : ''}`, images: [] }; }
    if (m === 'letterbox') { await needFf(); const c = await main('crop', file); const v = await info(file); return { value: c, text: c.bars ? `Bars: the picture is ${c.w}×${c.h} (ratio ${c.ratio}) inside ${v.w}×${v.h}, at ${c.x}, ${c.y}.` : `No black bars: the picture fills ${v.w}×${v.h}.`, images: [] }; }
    if (m === 'barcode') { await needFf(); const b = await main('barcode', file, { width: a.width || 1200, height: a.height || 240 }); return { value: b, text: `Color over time (each column is a moment): ${b.path}`, images: [{ path: b.path, label: 'color barcode' }] }; }
    if (m === 'waveform') { await needFf(); const w = await main('waveform', file, { width: a.width || 1600, height: a.height || 240 }); return { value: w, text: `Sound waveform: ${w.path}`, images: [{ path: w.path, label: 'waveform' }] }; }
    if (m === 'loop') {
      await needFf();
      const l = await main('loop', file, { from: Number(a.from) || 0, min: a.min || 0.8, max: a.max || 8 });
      return { value: l, text: `Best loop: ${tc(l.from, 30, 'ms')} → ${l.tc} (${l.length}s, ${Math.round(l.match * 100)} % alike). /make loop cuts it.`, images: [] };
    }
    throw new Error(`Unknown mode ${mode}`);
  }

  // ---------- things made from a video (ffmpeg): a GIF, a trim, a timelapse, a boomerang, stills for After Effects… ----
  const EDIT_LABEL = { gif: 'GIF', trim: 'trim', speed: 'timelapse', boomerang: 'boomerang', sequence: 'PNG frames', reframe: 'reframed copy', mute: 'silent copy', audio: 'sound', poster: 'poster frame' };
  async function edit(file, op, a = {}, { quiet = false } = {}) {
    if (!await ff()) throw new Error('Making a GIF / trim / timelapse needs ffmpeg (brew install ffmpeg · winget install Gyan.FFmpeg)');
    const busy = quiet ? null : toast(`Making the ${EDIT_LABEL[op] || op}…`, { timeout: 0 });
    let r;
    try { r = await api().edit(op, file, a); } finally { busy?.remove(); }
    if (!r.ok) throw new Error(r.error);
    const out = r.value.path;
    if (/\.(mp4|webm|gif)$/i.test(out) && typeof Review !== 'undefined') { try { Review.noteRecording(out); } catch { /* the library is a bonus */ } }
    Capture.remember({ kind: /\.(mp4|webm|mov)$/i.test(out) ? 'video' : 'shot', path: out });
    if (!quiet) toast(`${EDIT_LABEL[op] || op}: ${base(out)}${r.value.files ? ` (${r.value.files} files)` : ''}`, { timeout: 6000, action: op === 'sequence' ? { label: 'Show', fn: () => window.hub.fs.open(out) } : { label: 'Open', fn: () => CaptureView.open(out) } });
    return r.value;
  }

  // ---------- the results panel ----------
  function show(result, file, title = '') {
    const imgs = result.images || [];
    const grid = el('div', { class: `cap-read-grid${imgs.length === 1 ? ' one' : ''}` }, imgs.map((im) => el('figure', { class: 'cap-read-cell', draggable: true, title: `${im.label}\n${im.path}\nClick: open · right-click: more`,
      on: {
        click: () => (VIDEO.test(im.path) ? CaptureView.open(im.path) : CaptureView.open(im.path)),
        contextmenu: (e) => { e.preventDefault(); Capture.menu(e.clientX, e.clientY, CaptureView.itemsFor(im.path)); },
        dragstart: (e) => { e.preventDefault(); window.hub.capture.startDrag?.(im.path); },
      } }, el('img', { src: fileUrl(im.path), loading: 'lazy', alt: im.label }), el('figcaption', { text: im.label }))));
    const text = el('pre', { class: 'cap-read-text', text: result.text || '' });
    const toChat = el('button', { type: 'button', text: '→ Chat', title: 'Attach these pictures to the chat (a contact sheet when there are many)', on: { click: async () => { dlg.close(); await toChatImages(imgs, file); } } });
    const copy = el('button', { type: 'button', text: 'Copy text', on: { click: () => copyText(result.text || '') } });
    const folder = imgs[0] ? el('button', { type: 'button', text: 'Folder', on: { click: () => window.hub.fs.reveal(imgs[0].path) } }) : null;
    const dlg = el('dialog', { class: 'ui-modal cap-read' }, el('h2', { text: title || `${base(file)}` }), imgs.length ? grid : null, text,
      el('div', { class: 'dialog-actions' }, imgs.length ? toChat : null, copy, folder, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'primary', text: 'Close', on: { click: () => dlg.close() } })));
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 0));
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  }
  async function toChatImages(imgs, file, agentId = null) {
    if (!imgs.length) return null;
    if (imgs.length > 4 && file) { const s = await sheet(file, { layout: '4x3' }); return Capture.attachToChat(s.path, agentId); }
    let id = null;
    for (const im of imgs) id = await Capture.attachToChat(im.path, agentId);
    return id;
  }
  // which video: the argument, "last" (the newest recording), what Video Review shows, or a file dialog
  async function resolveFile(arg) {
    const a = String(arg || '').trim().replace(/^["']|["']$/g, '');
    if (a && !/^(last|latest|recording|open|review|current)$/i.test(a)) return a;
    if (/^(open|review|current)$/i.test(a) && typeof Review !== 'undefined' && Review.current?.path) return Review.current.path;
    const lastVid = Capture.recent().find((x) => x.kind === 'video');
    if (lastVid) return lastVid.path;
    if (!a && typeof Review !== 'undefined' && Review.current?.path) return Review.current.path;
    const list = await api().list({ kind: 'video', limit: 1 });
    if (list[0]) return list[0].path;
    return null;
  }
  async function pickAndRead(file = null) {
    let f = file || await resolveFile('');
    if (!f) {
      const picked = await window.hub.openDialog?.({ title: 'A video to read', filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv'] }] });
      f = Array.isArray(picked) ? picked[0] : picked?.filePaths?.[0] || picked;
      if (!f) return null;
    }
    const run = (mode, args = {}) => async () => {
      const busy = toast(`Reading ${base(f)}…`, { timeout: 0 });
      try { show(await read(f, mode, args), f, `${base(f)} · ${D.READ_MODES.find((x) => x.id === mode)?.label || mode}`); } catch (err) { toast(err.message, { type: 'error' }); } finally { busy.remove(); }
    };
    const x = innerWidth / 2 - 140; const y = 90;
    Capture.menu(x, y, [
      { label: `🎞 ${base(f)}`, action: () => CaptureView.open(f) },
      { label: 'Contact sheet', action: run('sheet') },
      { label: 'Contact sheet…', items: () => D.SHEETS.map((s) => ({ label: s.label, action: run('sheet', { layout: s.id }) })) },
      { label: 'Scene changes', action: run('scenes') },
      { label: 'Scene changes…', items: () => D.SENSITIVITY.map((s) => ({ label: s.label, action: run('scenes', { sensitivity: s.id }) })) },
      { label: 'Motion energy curve', action: run('motion') },
      { label: 'Exact frame at…', action: async () => { const v = await Modal.prompt('Frame at', { placeholder: '1.5 · 0:02.250 · 00:00:01:12 · f36', label: 'A time, a timecode or a frame number (f36)' }); if (v) await run('at', { times: [v] })(); } },
      { label: 'Every N frames…', action: async () => { const v = await Modal.prompt('Every how many frames?', { value: '12' }); if (v) await run('every', { every: Number(v) || 12 })(); } },
      { label: 'More readings…', items: () => [
        { label: '12 frames spread evenly', action: run('spread', { count: 12 }) },
        { label: 'Pacing (shots, cuts per minute)', action: run('pacing') },
        { label: 'Palette across the video', action: run('palette') },
        { label: 'Brightness and saturation', action: run('light') },
        { label: 'True fps, frames, size', action: run('info') },
        { label: 'Check the player shows exact frames', action: run('verify', { frame: 12 }) },
      ] },
      { label: 'Another video…', action: async () => { const picked = await window.hub.openDialog?.({ title: 'A video to read', filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv'] }] }); const p = Array.isArray(picked) ? picked[0] : picked?.filePaths?.[0] || picked; if (p) pickAndRead(p); } },
    ]);
    return f;
  }

  return { edit, EDIT_LABEL, info, at, frames, every, spread, scenes, motion, pacing, palette, paletteOf, light, verify, diff, sheet, chart, read, show, toChatImages, resolveFile, pickAndRead, tc, parseTime, modeOf, curves, _videoOf: videoOf, _videoFrame: videoFrame, _setFfmpeg: (on) => { hasFf = on; } };
})();
