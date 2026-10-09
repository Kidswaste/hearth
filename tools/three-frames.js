// Three.js Lab footage (round 8, labframes): the Lab timeline works frame by frame on video footage, with or without
// a song. A loaded video gets its true frame rate (ffprobe through framereader.js, or measured from the decoder's
// presented frames), a frame counter with timecode, exact stepping (← → , . J K L), scrubbing that lands on whole
// frames, loops / cues / markers / keyframes on frames, and a cut list that the sketch's footage plays (the parts
// that stay, their speed, held frames). The cut list IS the video's edit in Video Review's editor (kv video-cuts,
// tools/cut-data.js), so the Lab and the editor change the same thing. Reference footage (the Lab's references, board
// clips) reads exactly too: contact sheets, scene lists, motion and pacing, and "match this pacing" (the vibe, never
// the footage). Chats drive all of it (/footage …) and the directors through three_media_control / three_do footage.
// Pure frame math at the top (module.exports for node tests); the Lab side attaches to the player's hooks
// (tools/three-media.js) and the sandbox's media plumbing (tools/three-sandbox.html: media.frame, media.onFrame…).
const ThreeFrames = (() => {
  // ---------- frame math (no DOM) ----------
  const RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
  const EPS = 1e-3; // a thousandth of a frame: timestamps like 0.0333 still count as frame 1 at 30 fps
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const lastIdx = (arr, t) => { let lo = 0; let hi = arr.length - 1; let k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k; };
  // A clock: { fps, frames, times (every frame's start for VFR footage, else null), exact (from ffprobe), source }
  function makeClock({ fps = 30, frames = 0, times = null, duration = 0, exact = false, source = 'guess' } = {}) {
    const f = fps > 0 ? fps : 30;
    const t = times?.length ? times.map((x) => x - times[0]) : null; // the browser's clock starts at the first frame
    return { fps: f, times: t, frames: t ? t.length : frames || Math.max(1, Math.round((duration || 0) * f)), exact, source, duration };
  }
  const frameAt = (c, t) => {
    if (!c) return 0;
    const n = c.times ? lastIdx(c.times, t + 2e-4) : Math.floor(t * c.fps + EPS);
    return Math.max(0, Math.min(Math.max(0, (c.frames || Infinity) - 1), n));
  };
  // the nearest frame start (for snapping things onto frames)
  const nearest = (c, t) => {
    if (!c) return 0;
    if (!c.times) return Math.max(0, Math.min(Math.max(0, (c.frames || Infinity) - 1), Math.round(t * c.fps)));
    const k = Math.max(0, lastIdx(c.times, t));
    return k + 1 < c.times.length && c.times[k + 1] - t < t - c.times[k] ? k + 1 : k;
  };
  const timeOf = (c, n) => (!c ? 0 : c.times ? c.times[Math.max(0, Math.min(c.times.length - 1, n))] ?? 0 : r6(n / c.fps));
  const durOf = (c, n) => (c?.times ? (c.times[n + 1] ?? c.times[n] + 1 / c.fps) - c.times[n] : 1 / (c?.fps || 30));
  const midOf = (c, n) => r6(timeOf(c, n) + durOf(c, n) / 2);
  const snapT = (c, t) => timeOf(c, nearest(c, t));
  const pad = (n, w = 2) => String(Math.max(0, Math.floor(n))).padStart(w, '0');
  // HH:MM:SS:FF counted at the nominal rate (29.97 counts 30 a second, like the editor and the frame reader)
  function tc(c, n) {
    const nom = Math.round(c?.fps || 30); const s = Math.floor(n / nom);
    return `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}:${pad(n % nom)}`;
  }
  const fmtS = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
  // "f120" / "#120" / "120f" (a frame), "+10f" / "-3" (frames from here), "00:00:04:12" (timecode), "1:02.5" /
  // "4.5s" / "250ms" (a time). Returns { frame } | { rel } | { time } | null.
  function parse(c, text) {
    const s = String(text ?? '').trim().toLowerCase();
    let m = s.match(/^(?:f|#|frame\s*)(\d+)$/) || s.match(/^(\d+)\s*f$/);
    if (m) return { frame: Number(m[1]) };
    m = s.match(/^([+-])\s*(\d+)\s*f?$/);
    if (m) return { rel: (m[1] === '-' ? -1 : 1) * Number(m[2]) };
    m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})[:;](\d{1,3})$/);
    if (m) return { frame: (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * Math.round(c?.fps || 30) + Number(m[4]) };
    m = s.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
    if (m) return { time: Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) };
    m = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/);
    if (m) return { time: m[2] === 'ms' ? Number(m[1]) / 1000 : Number(m[1]) };
    return null;
  }
  // a parsed position → frame number (from frame `here` for relative moves)
  function resolve(c, p, here = 0) {
    if (!p) return null;
    if (p.frame != null) return Math.max(0, Math.min((c?.frames || Infinity) - 1, p.frame));
    if (p.rel != null) return Math.max(0, Math.min((c?.frames || Infinity) - 1, here + p.rel));
    return frameAt(c, p.time);
  }
  const snapRate = (fps) => RATES.reduce((b, r) => (Math.abs(r - fps) < Math.abs(b - fps) ? r : b), RATES[0]);

  // ---------- the cut list: a video's edit (tools/cut-data.js) seen from the footage's own time ----------
  // parts(edit, src, clock) → the parts of `src` that play, in edit order: { a, b (source seconds, on frame starts),
  // speed, hold (seconds a held frame shows), id, i (clip index) }. Clips of other files, titles and gaps aren't part
  // of the footage the sketch reads (they stay in the editor). null = the whole file plays.
  function parts(edit, src, c) {
    if (!edit?.clips?.length) return null;
    const out = [];
    edit.clips.forEach((cl, i) => {
      if (cl.kind === 'video' && cl.src === src && !cl.off) out.push({ a: snapT(c, cl.in), b: snapT(c, cl.out), speed: cl.speed || 1, id: cl.id, i, ...(cl.reverse ? { reverse: true } : {}), ...(cl.mute ? { mute: true } : {}) });
      else if (cl.kind === 'freeze' && cl.src === src) { const n = frameAt(c, cl.at); out.push({ a: timeOf(c, n), b: timeOf(c, n + 1), hold: cl.dur, speed: 1, id: cl.id, i }); }
    });
    return out.filter((p) => p.b - p.a > 1e-6 || p.hold);
  }
  // Is the whole file playing straight through (no cut)?
  function identity(edit, src, duration) {
    if (!edit?.clips?.length) return true;
    if (edit.clips.length !== 1) return false;
    const cl = edit.clips[0];
    return cl.kind === 'video' && cl.src === src && cl.in < 0.01 && Math.abs(cl.out - duration) < 0.02 && (cl.speed || 1) === 1 && !cl.reverse;
  }
  // source ranges that never play (for drawing and stepping): sorted, merged
  function removed(ps, duration) {
    if (!ps) return [];
    const kept = ps.filter((p) => !p.hold).map((p) => [p.a, p.b]).sort((x, y) => x[0] - y[0]);
    const out = []; let t = 0;
    for (const [a, b] of kept) { if (a > t + 1e-6) out.push([t, a]); t = Math.max(t, b); }
    if (duration > t + 1e-6) out.push([t, duration]);
    return out;
  }
  const inPart = (ps, t) => (ps ? ps.findIndex((p) => !p.hold && t >= p.a - 1e-6 && t < p.b - 1e-6) : -1);
  // the program time (the edit as it plays) of source time t in edit e, or null when t doesn't play
  const programAt = (C, e, src, t) => C.programTimes(e, src, t)[0] ?? null;

  // ---------- pacing math (for "match this pacing": the reference's rhythm, not its footage) ----------
  // cuts: reference cut times (s, the first at 0), length: the reference's length. Returns cue times over [a, b].
  //   fit: the whole rhythm stretched over a..b · seconds: the reference's own shot lengths, repeated
  function pacingTimes(cuts, length, a, b, mode = 'fit') {
    const rel = cuts.filter((t) => t > 0.05 && t < length - 0.05).map((t) => t / length);
    const L = b - a;
    if (!(L > 0) || !rel.length) return [];
    if (mode === 'seconds') {
      const lens = []; let prev = 0; for (const t of [...cuts.filter((x) => x > 0.05 && x < length - 0.05), length]) { lens.push(t - prev); prev = t; }
      const out = []; let t = a; let i = 0;
      while (lens.length && t + lens[i % lens.length] < b - 0.05 && out.length < 400) { t += lens[i % lens.length]; out.push(t); i += 1; }
      return out;
    }
    return rel.map((x) => a + x * L);
  }

  const pure = { RATES, makeClock, frameAt, nearest, timeOf, durOf, midOf, snapT, tc, parse, resolve, snapRate, parts, identity, removed, inPart, pacingTimes, fmtS };
  if (typeof window === 'undefined') return pure;

  // ======================================================================================================
  // The Lab side
  // ======================================================================================================
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const fileUrl = (p) => `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '')}`.replace(/#/g, '%23').replace(/\?/g, '%3F');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const C = () => (typeof CutData !== 'undefined' ? CutData : null);
  const F = {
    player: null, send: null, ctx: null,
    path: null, clock: null, edit: null, ps: null, // the footage, its clock, its edit and parts
    req: 0, sent: -1, pres: null, // the last frame sent to the decoder, the last presented frame it reported ({ req, frame })
    shuttle: { dir: 0, speed: 1, timer: 0 }, kDown: false,
    film: null, filmKey: '', exactFilm: new Map(), sampler: null,
    display: null, refRead: new Map(),
  };
  const P = () => F.player;
  const store_ = (k, d) => store.get(k, d);
  const modeOf = () => store_('three.frameModes', {});
  // Frame mode: on for a loaded video unless you turned it off for that file (/footage off)
  const on = () => Boolean(F.player?.loaded && F.player.isVideo && F.clock && modeOf()[F.path] !== false);
  const clockNow = () => F.clock;
  const D = () => F.player?.duration || 0;
  // the footage's real end: the end of its last frame (a browser can report the last frame's start as the duration)
  const srcEnd = () => { const c = F.clock; const d = D(); if (!c || c.source === 'guess' || !c.frames) return d; const n = c.frames - 1; return Math.max(d, r6(timeOf(c, n) + durOf(c, n))); };
  const display = () => F.display || store_('three.frameDisplay', 'tc');

  // ---------- loading a video: its clock and its edit ----------
  async function onLoad({ path, video }) {
    F.path = path; F.clock = null; F.edit = null; F.ps = null; F.pres = null; F.sent = -1; F.film = null; F.filmKey = ''; F.exactFilm.clear();
    stopShuttle();
    if (!video) { paintChrome(); return; }
    // a guess right away (30 fps), the real clock a moment later
    F.clock = makeClock({ fps: 30, duration: 0, source: 'guess' });
    paintChrome();
    const seq = ++onLoad.seq;
    const c = await clockFor(path).catch(() => null);
    if (seq !== onLoad.seq) return;
    if (c) F.clock = c;
    sendClock();
    await loadEdit();
    if (seq !== onLoad.seq) return;
    paintChrome();
    P()?.redraw?.();
    loadFilm();
  }
  onLoad.seq = 0;
  function onUnload() { onLoad.seq += 1; F.path = null; F.clock = null; F.edit = null; F.ps = null; F.film = null; stopShuttle(); paintChrome(); }
  // The true frame rate: ffprobe (exact, every frame's time for VFR footage), else measured from the decoder
  async function clockFor(path) {
    if (typeof FrameRead === 'undefined') { const m = await measureFps(path).catch(() => null); return m ? makeClock({ fps: m.fps, duration: m.duration, source: 'measured from playback' }) : null; }
    const info = await FrameRead.info(path);
    let fps = info.fps;
    // without ffprobe: our own measurement (the smallest spacing between presented frames: a dropped frame only
    // makes a gap longer, so a busy machine can't fool it the way a median can)
    if (!info.exact) { const m = await measureFps(path).catch(() => null); if (m) fps = m.fps; }
    if (info.rate && /^\d+\/\d+$/.test(info.rate)) { const [a, b] = info.rate.split('/').map(Number); if (a && b) fps = a / b; }
    let times = null;
    if (info.exact && info.vfr) { try { const r = await window.hub.capture.frames('times', path); if (r.ok && Array.isArray(r.value) && r.value.length > 1) times = r.value; } catch { /* the rate is enough */ } }
    return makeClock({ fps, frames: info.frames, times, duration: info.duration, exact: Boolean(info.exact), source: info.exact ? (times ? 'ffprobe (every frame\'s time)' : 'ffprobe') : 'measured from playback' });
  }
  function sendClock() {
    const c = F.clock;
    F.send?.({ type: 'media-clock', clock: c ? { fps: c.fps, frames: c.frames, times: c.times, exact: c.exact } : null });
  }
  async function measureFps(path) {
    const s = await sampler(path);
    const { v } = s;
    const times = [];
    const job = () => new Promise((res) => {
      if (!v.requestVideoFrameCallback) { res(); return; }
      const t0 = performance.now();
      const cb = (_n, meta) => { times.push(meta.mediaTime); if (times.length < 24 && performance.now() - t0 < 2500) v.requestVideoFrameCallback(cb); else res(); };
      v.requestVideoFrameCallback(cb);
      v.currentTime = 0; v.play().catch(res);
      setTimeout(res, 3000);
    }).finally(() => v.pause());
    await (s.busy = s.busy.then(job, job));
    const deltas = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0.002);
    if (deltas.length < 2) return null;
    return { fps: snapRate(1 / Math.min(...deltas)), duration: v.duration, samples: deltas.length };
  }
  // the duration once the player knows it (a silent video: from the decoder)
  function fixFrames() { const c = F.clock; if (c && !c.times && D() && (!c.frames || c.frames <= 1 || c.source !== 'ffprobe')) c.frames = Math.max(1, Math.round(D() * c.fps)); }

  // ---------- the cut list (shared with the editor) ----------
  async function editOf(path) {
    if (typeof VideoCut !== 'undefined' && VideoCut.editFor) return VideoCut.editFor(path);
    const all = (await window.hub.kvGet('video-cuts', {})) || {};
    return all[path] ? C()?.normalize(all[path]) || all[path] : null;
  }
  async function storeEdit(path, e, label) {
    if (typeof VideoCut !== 'undefined' && VideoCut.storeEdit) return VideoCut.storeEdit(path, e, label);
    const all = (await window.hub.kvGet('video-cuts', {})) || {};
    if (e) all[path] = e; else delete all[path];
    await window.hub.kvSet('video-cuts', all);
    return true;
  }
  async function loadEdit() {
    if (!F.path) return;
    const e = await editOf(F.path).catch(() => null);
    setEdit(e, { store: false });
  }
  // the edit changed (here, in the editor, or by undo): parts → the sandbox, the timeline redraws
  function setEdit(e, { store: save = true, label = '' } = {}) {
    fixFrames();
    F.edit = e && !identity(e, F.path, srcEnd()) ? e : null;
    F.ps = F.edit ? parts(F.edit, F.path, F.clock) : null;
    if (F.ps && !F.ps.length) F.ps = []; // everything removed: nothing plays (the editor still has it)
    sendCuts();
    if (save && F.path) storeEdit(F.path, F.edit || C()?.fromSource(F.path, srcEnd()), label).catch((err) => toast(err.message, { type: 'error' }));
    paintChrome();
    P()?.redraw?.();
  }
  // every cut change: one undo step on the Lab's Ctrl+Z (with the grid / marker steps)
  function changeEdit(fn, label) {
    const Cd = C();
    if (!Cd || !F.path || !D()) { toast('Load a video first', { type: 'error' }); return null; }
    fixFrames();
    const before = F.edit ? JSON.parse(JSON.stringify(F.edit)) : null;
    const cur = F.edit || Cd.fromSource(F.path, srcEnd());
    const next = fn(cur, Cd);
    if (!next || next === cur) return null;
    P().pushUndo?.({ cut: before });
    setEdit(next, { label });
    if (label) toast(label, { timeout: 1200 });
    return F.ps;
  }
  function sendCuts() { F.send?.({ type: 'media-cuts', parts: F.ps?.map(({ a, b, speed, hold, mute }) => ({ a, b, speed, ...(hold ? { hold } : {}), ...(mute ? { mute } : {}) })) || null }); }
  function undoCut(entry) { setEdit(entry.cut ? entry.cut : null, { label: 'Undo' }); }
  const here = () => (on() ? timeOf(F.clock, frameAt(F.clock, P().time)) : P().time);
  const clipAtSource = (e, t) => e.clips.find((cl) => cl.kind === 'video' && cl.src === F.path && t >= cl.in - 1e-6 && t < cl.out - 1e-6) || null;
  // the cut's operations, all at a source time (the playhead by default) and frame-exact
  const ops = {
    split(t = here()) { return changeEdit((e, Cd) => { const T = programAt(Cd, e, F.path, snapT(F.clock, t)); return T == null ? null : Cd.split(e, T); }, `Cut at ${label(t)}`); },
    del(t = here()) { return changeEdit((e, Cd) => { const cl = clipAtSource(e, t); return cl ? Cd.remove(e, [cl.id], { ripple: true }) : null; }, 'Part removed: the sketch skips it'); },
    restore(t = here()) {
      return changeEdit((e, Cd) => {
        if (clipAtSource(e, t)) return null;
        const gap = removed(parts(e, F.path, F.clock), srcEnd()).find(([a, b]) => t >= a - 1e-6 && t < b);
        if (!gap) return null;
        const n = JSON.parse(JSON.stringify(e));
        let k = n.clips.findIndex((cl) => cl.kind === 'video' && cl.src === F.path && cl.in >= gap[1] - 1e-6);
        if (k < 0) k = n.clips.length;
        const clip = { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: 'video', src: F.path, in: gap[0], out: gap[1], max: srcEnd(), speed: 1, mute: false, fadeIn: 0, fadeOut: 0 };
        n.clips.splice(k, 0, clip);
        return n;
      }, 'Part back in');
    },
    speed(s, t = here()) { return changeEdit((e, Cd) => { const cl = clipAtSource(e, t); return cl ? Cd.setSpeed(e, [cl.id], s) : null; }, `Part at ${Number(s)}×`); },
    hold(dur = 1, t = here()) { return changeEdit((e, Cd) => { const T = programAt(Cd, e, F.path, snapT(F.clock, t)); return T == null ? null : Cd.freeze(e, T, dur); }, `Frame ${frameAt(F.clock, t)} held ${dur} s`); },
    clear() {
      if (!F.edit) return null;
      P().pushUndo?.({ cut: JSON.parse(JSON.stringify(F.edit)) });
      setEdit(null, { label: 'Cut cleared' });
      toast('The whole video plays again', { timeout: 1400 });
      return [];
    },
    keepOnly(a, b) { return changeEdit((e, Cd) => Cd.slice(Cd.fromSource(F.path, srcEnd()), snapT(F.clock, a), snapT(F.clock, b)), `Only ${label(a)} → ${label(b)} plays`); },
    cutRange(a, b) {
      return changeEdit((e, Cd) => {
        let n = e;
        for (const t of [a, b]) { const T = programAt(Cd, n, F.path, snapT(F.clock, t)); if (T != null) n = Cd.split(n, T); }
        const ids = n.clips.filter((cl) => cl.kind === 'video' && cl.src === F.path && cl.in >= snapT(F.clock, a) - 1e-6 && cl.out <= snapT(F.clock, b) + 1e-6).map((cl) => cl.id);
        return ids.length ? Cd.remove(n, ids, { ripple: true }) : null;
      }, `${label(a)} → ${label(b)} removed`);
    },
    splitMany(times, what) {
      return changeEdit((e, Cd) => {
        let n = e; let k = 0;
        for (const t of [...new Set(times.map((x) => snapT(F.clock, x)))].sort((x, y) => y - x)) { const T = programAt(Cd, n, F.path, t); if (T != null) { const m = Cd.split(n, T); if (m !== n) k += 1; n = m; } }
        return k ? n : null;
      }, what);
    },
    // the part under the playhead starts (in) or ends (out) on this frame: its source range is trimmed there
    edge(which, t = here()) {
      return changeEdit((e) => {
        const n = JSON.parse(JSON.stringify(e)); const s = snapT(F.clock, t);
        const cl = n.clips.find((x) => x.kind === 'video' && x.src === F.path && s > x.in + 1e-6 && s < x.out - 1e-6);
        if (!cl) return null;
        if (which === 'in') cl.in = s; else cl.out = s;
        return n;
      }, `The part ${which === 'in' ? 'starts' : 'ends'} at ${label(t)}`);
    },
    // move the cut nearest the playhead by k frames (an NLE roll: one part gets longer, the next shorter)
    roll(k, t = here()) {
      return changeEdit((e, Cd) => {
        let best = -1; let bd = Infinity;
        e.clips.forEach((cl, i) => { if (!i) return; const p = e.clips[i - 1]; if (p.src !== F.path || cl.src !== F.path) return; const d = Math.min(Math.abs(p.out - t), Math.abs(cl.in - t)); if (d < bd) { bd = d; best = i; } });
        if (best < 0) return null;
        const n = Cd.roll(e, best, k * durOf(F.clock, frameNow()));
        if (n === e) return null;
        // keep both sides of the cut on frame starts
        for (const cl of [n.clips[best - 1], n.clips[best]]) if (cl.kind === 'video') { cl.in = snapT(F.clock, cl.in); cl.out = snapT(F.clock, cl.out); }
        return n;
      }, `Cut moved ${k > 0 ? '+' : ''}${k} frame${Math.abs(k) === 1 ? '' : 's'}`);
    },
    // the part under the playhead plays again right after itself
    repeat(t = here()) { return changeEdit((e, Cd) => { const cl = clipAtSource(e, t); return cl ? Cd.duplicate(e, cl.id) : null; }, 'Part repeated'); },
    // the part under the playhead plays first / last
    order(where, t = here()) { return changeEdit((e, Cd) => { const cl = clipAtSource(e, t); return cl ? Cd.move(e, cl.id, where === 'first' ? 0 : e.clips.length) : null; }, `Part plays ${where}`); },
    // the part's sound off (the sketch hears silence there too) or on
    mute(on, t = here()) { return changeEdit((e, Cd) => { const cl = clipAtSource(e, t); return cl ? Cd.setMute(e, [cl.id], on) : null; }, 'Part sound toggled'); },
    // hold the last frame of the part under the playhead for s seconds
    holdEnd(s = 1, t = here()) {
      return changeEdit((e, Cd) => {
        const cl = clipAtSource(e, t); if (!cl) return null;
        const last = timeOf(F.clock, Math.max(0, frameAt(F.clock, cl.out) - 1));
        const T = programAt(Cd, e, F.path, last); if (T == null) return null;
        const at = Cd.layout(e).find((x) => x.clip.id === cl.id);
        return Cd.insertAt(e, at ? at.end : T, { kind: 'freeze', src: F.path, at: last, dur: s, mute: true });
      }, `The part's last frame held ${s} s`);
    },
  };
  const label = (t) => (F.clock ? `f${frameAt(F.clock, t)}` : fmtS(t));
  // the cut's length as it plays (its program time) and as a share of the footage
  function cutLength() {
    if (!F.ps) return null;
    const secs = F.ps.reduce((a, p) => a + (p.hold ? p.hold : (p.b - p.a) / (p.speed || 1)), 0);
    return { seconds: Math.round(secs * 1000) / 1000, of: Math.round(srcEnd() * 1000) / 1000 };
  }
  // the cut as an EDL (CMX 3600) next to the footage, for other editors
  async function saveEdl() {
    if (!F.path) throw new Error('Load a video first');
    const e = F.edit || CutData.fromSource(F.path, srcEnd());
    const text = CutData.toEdl(e, { fps: F.clock.fps, title: base(F.path).replace(/\.\w+$/, '').toUpperCase() });
    const out = F.path.replace(/\.[^.\\/]+$/, '') + ' lab cut.edl';
    await window.hub.fs.write(out, text);
    toast(`Saved ${base(out)}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(out) }, timeout: 5000 });
    return out;
  }
  // the timeline's zoom on footage: one second of frames around the playhead, the part, the whole footage
  function zoom(what = 'second') {
    const pl = P(); const t = here(); const c = F.clock;
    if (what === 'all') { pl.zoomTo(null); return 'whole'; }
    if (what === 'part') { const i = inPart(F.ps, t); const p = i >= 0 ? F.ps[i] : null; if (!p) return zoom('second'); pl.zoomTo(Math.max(0, p.a - 0.1), Math.min(srcEnd(), p.b + 0.1)); return 'part'; }
    const n = Number(String(what).replace(/f$/, '')); const frames = /f$/.test(String(what)) && n > 1 ? n : Math.round(c.fps);
    const half = (frames / c.fps) / 2;
    pl.zoomTo(Math.max(0, t - half), Math.min(srcEnd(), t + half));
    return `${frames} frames`;
  }
  // the colors of this exact frame become the sketch palette (palette-aware layers recolor)
  async function paletteHere(count = 5) {
    if (!F.path || typeof FrameRead === 'undefined') throw new Error('Load a video first');
    const n = frameNow();
    const r = await FrameRead.palette(F.path, { time: midOf(F.clock, n), count });
    const cols = (r.colors || []).map((x) => x.hex || x).filter(Boolean);
    if (cols.length < 2) throw new Error('Not enough colors in this frame');
    ThreeLab.director?.refs?.setPalette?.(cols);
    toast(`Palette from f${n}: ${cols.join(' ')}`, { timeout: 2400 });
    return cols;
  }
  // this exact frame on the mood board (as a reference picture: its vibe for the chats)
  async function frameToBoard() {
    if (typeof Board === 'undefined') throw new Error('The board isn\'t loaded');
    const r = await readFrame({ width: 960 });
    if (!r.path) throw new Error('Couldn\'t read the frame');
    const [it] = await Board.addFiles([r.path]);
    toast(`f${r.frame} pinned to the board`, { timeout: 1800 });
    return it || null;
  }
  // the cut rendered as a new video by the editor (ffmpeg, frame-exact), next to the footage
  async function renderCut() {
    if (!F.path || typeof VideoCut === 'undefined') throw new Error('Load a video first');
    await toEditor();
    for (let i = 0; i < 60 && !(VideoCut.active && VideoCut.path === F.path); i += 1) await wait(100);
    return VideoCut.exportCut({});
  }
  function copyText(text, what) { navigator.clipboard?.writeText(text).catch(() => {}); toast(`Copied ${what}`, { timeout: 1200 }); return text; }

  // ---------- moving the playhead: exact frames ----------
  // The frame the playhead is on (whole frames when paused, the decoder's last report while playing)
  function frameNow() { return F.clock ? frameAt(F.clock, P().time) : 0; }
  function go(n, { quiet = false } = {}) {
    if (!F.clock) return null;
    const c = F.clock; const N = Math.max(0, Math.min((c.frames || 1) - 1, n));
    if (P().playing) P().toggle(false);
    P().seek(timeOf(c, N));
    if (!quiet) P().redraw?.();
    return N;
  }
  // k frames from here; with a cut, steps skip the removed parts (Alt: every frame of the source)
  function step(k, { raw = false } = {}) {
    if (!F.clock) return null;
    let n = frameNow() + k;
    if (!raw && F.ps?.length) {
      const dir = Math.sign(k) || 1; const total = F.clock.frames || 1;
      for (let guard = 0; guard < total && inPart(F.ps, timeOf(F.clock, n)) < 0 && !F.ps.some((p) => p.hold && frameAt(F.clock, p.a) === n); guard += 1) {
        n += dir;
        if (n < 0 || n >= total) { n = Math.max(0, Math.min(total - 1, n)); break; }
      }
    }
    return go(n);
  }
  // edit points: cuts, cues, markers, loop / trim edges (↑ ↓)
  function points() {
    const pts = new Set([0]);
    for (const p of F.ps || []) { if (!p.hold) { pts.add(p.a); pts.add(p.b); } }
    for (const c of P().cues || []) pts.add(c.time);
    const lp = P().loop; if (lp) { pts.add(lp.a); pts.add(lp.b); }
    return [...pts].map((t) => snapT(F.clock, t)).sort((a, b) => a - b);
  }
  function jumpPoint(dir) {
    const t = here(); const pts = points();
    const to = dir > 0 ? pts.find((x) => x > t + 1e-6) : [...pts].reverse().find((x) => x < t - 1e-6);
    if (to == null) return false;
    go(frameAt(F.clock, to));
    return true;
  }
  // J / K / L: L plays forward (again: 2×, 4×), J backward (stepping, 1× 2× 4×), K stops on a whole frame
  function stopShuttle() { clearInterval(F.shuttle.timer); F.shuttle = { dir: 0, speed: 1, timer: 0 }; }
  function shuttle(dir) {
    const S = F.shuttle; const pl = P();
    if (dir === 0) { const was = S.dir; stopShuttle(); pl.shuttleRate?.(1); if (pl.playing) pl.toggle(false); else if (was < 0) pl.redraw?.(); return 0; }
    const speed = S.dir === dir ? Math.min(8, S.speed * 2) : 1;
    clearInterval(S.timer);
    F.shuttle = { dir, speed, timer: 0 };
    if (dir > 0) { pl.shuttleRate?.(speed); if (!pl.playing) pl.toggle(true); return speed; }
    // backward: there's no reverse playback in a browser decoder, so it steps (at most 30 steps a second)
    if (pl.playing) pl.toggle(false);
    pl.shuttleRate?.(1);
    const fps = F.clock?.fps || 30; const perSec = Math.min(30, fps * speed); const each = Math.max(1, Math.round((fps * speed) / perSec));
    F.shuttle.timer = setInterval(() => { if (frameNow() <= 0) { stopShuttle(); return; } step(-each); }, 1000 / perSec);
    return -speed;
  }

  // the part edge (a cut line) within 5 px of x: { t, i (part), side: 'a' | 'b', roll: the part that touches it }
  function edgeNear(x, xOf) {
    let best = null; let bd = 6;
    (F.ps || []).forEach((p, i) => {
      if (p.hold) return;
      for (const side of ['a', 'b']) { const d = Math.abs(xOf(p[side]) - x); if (d < bd) { bd = d; best = { t: p[side], i, side, id: p.id }; } }
    });
    if (!best) return null;
    const other = F.ps.findIndex((q, j) => j !== best.i && !q.hold && Math.abs(q[best.side === 'a' ? 'b' : 'a'] - best.t) < 1e-6);
    return { ...best, roll: other >= 0 ? F.ps[other].id : null };
  }
  // a dragged cut line, committed once: both parts move together when they touch, else one part's edge
  function moveEdge(d, to) {
    return changeEdit((e) => {
      const n = JSON.parse(JSON.stringify(e));
      const me = n.clips.find((cl) => cl.id === d.id); if (!me) return null;
      const field = d.side === 'a' ? 'in' : 'out';
      me[field] = Math.max(0, Math.min(srcEnd(), to));
      if (d.roll) { const o = n.clips.find((cl) => cl.id === d.roll); if (o) o[field === 'in' ? 'out' : 'in'] = to; }
      if (me.out - me.in < durOf(F.clock, 0) - 1e-6) return null;
      return n;
    }, `${d.roll ? 'Cut' : 'Part edge'} moved to ${label(to)}`);
  }

  // ---------- the player hooks ----------
  function hookPlayer(pl) {
    const h = pl.hooks;
    h.silentVideo = () => true; // a video with no sound is footage, not an error
    h.seek = (t) => {
      if (!on()) return null;
      const c = F.clock; const n = frameAt(c, t);
      const same = n === F.sent && !pl.playing && F.sentAt && performance.now() - F.sentAt < 4000;
      F.sent = n; F.sentAt = performance.now();
      return { time: timeOf(c, n), target: same ? null : midOf(c, n), msg: { req: ++F.req } };
    };
    h.startAt = (t) => (on() ? midOf(F.clock, frameAt(F.clock, t)) : t);
    h.stateTime = (t, playing) => (on() && !playing ? timeOf(F.clock, frameAt(F.clock, t)) : t);
    h.pauseMsg = () => (on() ? { frameStop: true, req: ++F.req } : null);
    h.snap = (snapped, raw) => (on() ? snapT(F.clock, snapped ?? raw) : snapped);
    h.arrowStep = (dir, e) => (on() ? dir * (e.shiftKey ? 10 : 1) * durOf(F.clock, frameNow()) : null);
    h.undo = (entry) => { if (entry.cut !== undefined) undoCut(entry); };
    h.message = (msg) => {
      if (msg.type === 'media-frame') { F.pres = { frame: msg.frame, req: msg.req, at: performance.now() }; paintCounter(); return true; }
      if (msg.type === 'media-state' && msg.frame != null) { F.pres = { frame: msg.frame, req: -1, at: performance.now(), playing: msg.playing }; if (!msg.playing && msg.frame !== F.sent) F.sent = -1; }
      return false;
    };
    h.key = (e, sel) => keys(e, sel);
    h.timeText = (t) => (on() ? timeText(t) : undefined);
    // the hairline under the mouse names the frame there (and sits on its start)
    h.hoverText = (t) => (on() ? `f${frameAt(F.clock, t)} · ${tc(F.clock, frameAt(F.clock, t))}${F.ps && inPart(F.ps, t) < 0 ? ' · removed' : ''}` : undefined);
    h.hoverX = (t, xOf) => (on() ? xOf(timeOf(F.clock, frameAt(F.clock, t))) : undefined);
    h.frameKey = () => (on() ? `${F.clock.fps}|${F.clock.frames}|${F.ps ? F.ps.map((p) => `${p.a}-${p.b}-${p.speed}-${p.hold || ''}`).join() : ''}|${F.film ? F.film.length : 0}|${F.exactFilm.size}|${F.boxOn && !pl.playing ? frameNow() : ''}|${F.drag ? F.drag.to : ''}` : '');
    h.miniKey = () => (on() ? `${F.ps ? F.ps.map((p) => `${p.a}-${p.b}`).join() : ''}|${F.film?.length || 0}` : '');
    h.drawUnder = (g, o) => { if (on()) drawFilm(g, o); };
    h.drawOver = (g, o) => { if (on()) drawCuts(g, o); };
    h.drawMini = (g, o) => { if (on() && F.film?.length && store_('three.filmstrip', true)) { g.save(); g.globalAlpha = 0.35; for (let i = 0; i < F.film.length; i += 1) { const it = F.film[i]; const x0 = o.X(it.t); const x1 = o.X(F.film[i + 1]?.t ?? D()); g.drawImage(it.img, x0, 0, Math.max(1, x1 - x0), o.h); } g.restore(); } if (on() && F.ps) { g.fillStyle = '#000000b0'; for (const [a, b] of removed(F.ps, srcEnd())) g.fillRect(o.X(a), 0, Math.max(1, o.X(b) - o.X(a)), o.h); g.fillStyle = '#ff9f43'; for (const p of F.ps) if (!p.hold) g.fillRect(o.X(p.a) - 0.5, 0, 1, o.h); } };
    h.paint = () => paintChrome();
    // cut lines are handles: drag one to move it (two parts that touch: a roll; a part next to a removed gap: a trim)
    h.cursorAt = (t, hit, xOf) => (on() && F.ps && (hit.zone === 'wave' || hit.zone === 'ruler') && edgeNear(xOf(t), xOf) ? 'col-resize' : '');
    h.pointerDown = (e, t, { xOf }) => {
      if (!on() || !F.ps) return null;
      const ed = edgeNear(xOf(t), xOf);
      if (!ed) return null;
      F.drag = { ...ed, to: ed.t };
      return {
        move: (t2) => { const s2 = snapT(F.clock, t2); if (s2 !== F.drag.to) { F.drag.to = s2; } },
        up: () => { const d = F.drag; F.drag = null; if (d && Math.abs(d.to - d.t) > 1e-6) moveEdge(d, d.to); else P().redraw?.(); },
      };
    };
    // double-click a removed part: it plays again
    h.dblclick = (hit, t) => { if (!on() || !F.ps || (hit.zone !== 'wave' && hit.zone !== 'ruler') || inPart(F.ps, t) >= 0) return false; ops.restore(snapT(F.clock, t)); return true; };
    // right-click the waveform: the footage's moves at that frame first
    h.waveItems = (t) => {
      if (!on()) return [];
      const s0 = snapT(F.clock, t); const n = frameAt(F.clock, s0); const inside = !F.ps || inPart(F.ps, s0) >= 0;
      return [
        [`Cut at f${n}`, `S · ${tc(F.clock, n)}`, () => ops.split(s0)],
        inside ? ['Remove this part', 'Delete · the sketch skips it', () => ops.del(s0)] : ['Put this part back', 'Shift+Delete · or double-click it', () => ops.restore(s0)],
        [`Cue at f${n}`, 'C', () => P().addCue(s0)],
        [`Hold f${n} for 1 s`, 'a held frame', () => ops.hold(1, s0)],
      ];
    };
    pl.on('load', (x) => { onLoad(x); });
    pl.on('unload', () => onUnload());
    pl.on('attach', () => { F.sent = -1; if (F.clock) sendClock(); if (F.path) sendCuts(); }); // a fresh page: forget where we sent it
  }

  // ---------- the counter: timecode + frame (the time box in frame mode) ----------
  function timeText(t) {
    const c = F.clock; const n = frameAt(c, t);
    const total = c.frames || 0;
    const d = display();
    if (d === 'frames') return `f${n} / ${Math.max(0, total - 1)}`;
    if (d === 'seconds') return `${fmtS(timeOf(c, n))} · f${n}`;
    return `${tc(c, n)} · f${n}`;
  }
  function paintCounter() {
    const el_ = P()?.el?.querySelector('.mb-time');
    if (!el_) return;
    const c = F.clock;
    const off = on() && F.pres && !P().playing && F.pres.req === F.req && F.pres.frame !== frameNow() && F.pres.frame >= 0;
    el_.classList.toggle('mb-frame-off', Boolean(off));
    el_.classList.toggle('mb-frame-ok', Boolean(on() && F.pres && !P().playing && F.pres.req === F.req && F.pres.frame === frameNow()));
    const tip = on() ? `Frame ${frameNow()} of ${c.frames} · ${c.fps.toFixed(3).replace(/\.?0+$/, '')} fps (${c.source})${off ? ` · the decoder shows f${F.pres.frame}` : F.pres?.frame === frameNow() ? ' · confirmed on screen' : ''} · click: go to a frame or timecode · right-click: frames menu · T: timecode / frames / seconds` : 'Click to jump to a time (m:ss.mmm or seconds)';
    if (el_.title !== tip) el_.title = tip;
    P().redraw?.();
  }
  // footage mode on the bar: music-only controls tuck away (⋯ shows everything), the frames chip shows
  let chip = null;
  function paintChrome() {
    const bar = P()?.el; if (!bar) return;
    const f = on();
    bar.classList.toggle('mb-footage', f);
    bar.classList.toggle('mb-footage-silent', f && !P().analysis);
    if (!chip) {
      chip = el('button', { class: 'ghost small mb-framechip', text: '▦', title: '', dataset: { feature: 'Footage frames' } });
      chip.addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.top - 8, menuItems()); });
      chip.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, menuItems()); });
      bar.querySelector('.mb-time')?.after(chip);
      const tEl = bar.querySelector('.mb-time');
      tEl?.addEventListener('contextmenu', (e) => { if (!on()) return; e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, menuItems()); });
      tEl?.addEventListener('click', (e) => { if (!on()) return; e.stopImmediatePropagation(); askGoto(); }, true);
    }
    const show = Boolean(P().loaded && P().isVideo);
    if (chip.hidden !== !show) chip.hidden = !show;
    const n = F.ps ? F.ps.filter((p) => !p.hold).length : 0;
    const text = !f ? '▦' : F.ps ? `▦ ✂${n}` : '▦';
    if (chip.textContent !== text) chip.textContent = text;
    chip.classList.toggle('on', f);
    const len = cutLength();
    const tip = !show ? '' : f ? `Footage frames: ${F.clock.fps.toFixed(3).replace(/\.?0+$/, '')} fps · ${F.clock.frames} frames${F.ps ? ` · cut into ${n} part${n === 1 ? '' : 's'}: ${len.seconds} s of ${len.of} s (the sketch plays only those)` : ''} · click: frames, cuts, reading` : 'Frame mode is off for this video: click to step frame by frame again';
    if (chip.title !== tip) chip.title = tip;
  }
  async function askGoto() {
    const v = await Modal.prompt('Go to a frame', { value: `f${frameNow()}`, placeholder: 'f120 · 00:00:04:12 · +10f · 4.5s' });
    if (v == null) return;
    const n = resolve(F.clock, parse(F.clock, v), frameNow());
    if (n == null) { toast('A frame (f120), a timecode (00:00:04:12), frames from here (+10f) or a time (4.5)', { type: 'error' }); return; }
    go(n);
  }

  // ---------- keys (the Lab forwards the timeline's keys here first, in frame mode) ----------
  addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'k') F.kDown = false; }, true);
  function keys(e, sel) {
    if (!on() || e.ctrlKey || e.metaKey) return null;
    const k = e.key; const lower = k.length === 1 ? k.toLowerCase() : k;
    // a marker or curve points selected: the arrows move those (a loop edge you just set with [ ] doesn't count: on
    // footage the arrows step frames; drag an edge, or Alt+drag, to move it)
    const busy = sel.points || sel.selected?.type === 'mark';
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && !busy) { stopShuttle(); step((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1), { raw: e.altKey }); return true; }
    if ((e.code === 'Comma' || e.code === 'Period') && !e.altKey) { stopShuttle(); step((e.code === 'Comma' ? -1 : 1) * (e.shiftKey ? 10 : 1)); return true; }
    if ((e.code === 'Comma' || e.code === 'Period') && e.altKey && F.ps) { if (!ops.roll(e.code === 'Comma' ? -1 : 1)) toast('No cut to move here', { timeout: 1000 }); return true; }
    if ((k === 'ArrowUp' || k === 'ArrowDown') && !sel.points && !e.altKey && !e.shiftKey) { jumpPoint(k === 'ArrowUp' ? -1 : 1); return true; }
    if (e.altKey) return null;
    if (lower === 'k' && !e.shiftKey) { F.kDown = true; shuttle(0); return true; }
    if ((lower === 'j' || lower === 'l') && !e.shiftKey) { if (F.kDown) { step(lower === 'j' ? -1 : 1); return true; } shuttle(lower === 'j' ? -1 : 1); return true; }
    if (k === 'Home' && !e.shiftKey) { go(F.ps?.length ? frameAt(F.clock, F.ps[0].a) : 0); return true; }
    if (k === 'End' && !e.shiftKey) { const last = F.ps?.filter((p) => !p.hold).at(-1); go(last ? frameAt(F.clock, last.b) - 1 : (F.clock.frames || 1) - 1); return true; }
    if (lower === 's' && !e.shiftKey && !e.repeat) { if (!ops.split()) toast('Nothing to cut here (too close to a cut, or a removed part)', { timeout: 1400 }); return true; }
    if ((k === 'Delete' || k === 'Backspace') && !busy) { if (e.shiftKey) { if (!ops.restore()) toast('This part already plays', { timeout: 1200 }); } else if (!ops.del()) toast('Nothing plays here to remove', { timeout: 1200 }); return true; }
    if (lower === 't' && !e.shiftKey && !e.repeat) { const order = ['tc', 'frames', 'seconds']; F.display = order[(order.indexOf(display()) + 1) % 3]; store.set('three.frameDisplay', F.display); P().redraw?.(); toast(`Time as ${F.display === 'tc' ? 'timecode · frame' : F.display}`, { timeout: 900 }); return true; }
    return null;
  }
  const KEY_LIST = [
    ['← / →', 'One frame back / forward on video footage (Shift: 10 frames, Alt: through removed parts too)'],
    [', / .', 'One frame back / forward (footage)'],
    ['J / K / L', 'Shuttle: back · stop on a whole frame · forward (press again: 2×, 4×, 8×)'],
    ['K+J / K+L', 'Hold K and tap J or L: one frame'],
    ['↑ / ↓', 'Previous / next edit point: cuts, cues, loop edges (footage)'],
    ['Home / End', 'First / last frame that plays'],
    ['S', 'Cut the footage at this frame (the sketch plays the parts)'],
    ['Delete', 'Remove the part under the playhead (the sketch skips it)'],
    ['Shift+Delete', 'Put the removed part back'],
    ['T', 'Footage: timecode · frames · seconds in the time box'],
    ['Alt+, / Alt+.', 'Move the nearest cut one frame earlier / later (footage)'],
    ['[ / ]', 'Loop start / end on this frame'],
    ['Space', 'Play / pause (pauses on a whole frame)'],
    ['Ctrl+Z', 'Undo a cut too (with the grid and marker changes)'],
    ['Right-click the time', 'The frames menu: go to, step, cuts, reading, editor'],
  ];

  // ---------- drawing on the timeline ----------
  function drawCuts(g, o) {
    const { X, s0, sp, w, h, top, LT, ruler } = o;
    const c = F.clock;
    const pxF = w / (sp * c.fps); // px per frame
    F.boxOn = pxF >= 6; // the frame box follows the playhead (the canvas redraws per step only then)
    // frame ticks on the ruler (and numbers on the waveform's top edge) once frames are wide enough to see
    if (pxF >= 3) {
      const n0 = Math.max(0, frameAt(c, s0)); const n1 = Math.min((c.frames || 1) - 1, frameAt(c, s0 + sp) + 1);
      g.fillStyle = '#ffffff40';
      for (let n = n0; n <= n1; n += 1) g.fillRect(Math.round(X(timeOf(c, n))), ruler - (n % Math.round(c.fps) === 0 ? 7 : 3), 1, n % Math.round(c.fps) === 0 ? 7 : 3);
      const every = [1, 2, 5, 10, 15, 30, 60].find((k) => k * pxF >= 34) || 120;
      g.font = '9px Consolas, monospace';
      for (let n = Math.ceil(n0 / every) * every; n <= n1; n += every) { const x = X(timeOf(c, n)); g.fillStyle = '#0d1013b0'; g.fillRect(x + 1, top + 1, g.measureText(`f${n}`).width + 4, 10); g.fillStyle = '#8fe6ff'; g.fillText(`f${n}`, x + 3, top + 9); }
      // the frame under the playhead, as a box one frame wide
      if (pxF >= 6 && !P().playing) { const n = frameNow(); const x0 = X(timeOf(c, n)); const x1 = X(timeOf(c, n) + durOf(c, n)); g.strokeStyle = '#8fe6ffa0'; g.lineWidth = 1; g.strokeRect(Math.round(x0) + 0.5, top + 0.5, Math.max(2, Math.round(x1 - x0) - 1), LT - top - 1); }
    }
    if (!F.ps) return;
    if (F.drag) { const x = X(F.drag.to); g.fillStyle = '#ffffff'; g.fillRect(Math.round(x) - 1, 0, 3, h); g.font = '10px Consolas, monospace'; g.fillText(`f${frameAt(c, F.drag.to)}`, x + 4, ruler + 10); }
    // removed parts: dark, hatched (the sketch never sees them)
    for (const [a, b] of removed(F.ps, srcEnd())) {
      const xa = Math.max(0, X(a)); const xb = Math.min(w, X(b));
      if (xb <= xa) continue;
      g.fillStyle = '#05070acc'; g.fillRect(xa, 0, xb - xa, h);
      g.save(); g.beginPath(); g.rect(xa, 0, xb - xa, h); g.clip();
      g.strokeStyle = '#ff9f4330'; g.lineWidth = 1; g.beginPath();
      for (let x = xa - h; x < xb; x += 9) { g.moveTo(x, h); g.lineTo(x + h, 0); }
      g.stroke(); g.restore();
    }
    // the parts: numbered, with their speed; a cut line at each start / end; held frames as ❚❚
    g.font = '10px Consolas, monospace';
    F.ps.forEach((p, i) => {
      const xa = X(p.a); const xb = X(p.b);
      if (xb < -2 || xa > w + 2) return;
      if (p.hold) { g.fillStyle = '#bd8bff'; g.fillRect(Math.round(xa) - 1, top, 3, LT - top); g.fillText(`❚❚ ${p.hold}s`, xa + 4, LT - 4); return; }
      g.fillStyle = '#ff9f43';
      g.fillRect(Math.round(xa) - 1, 0, 2, h); g.fillRect(Math.round(xb) - 1, 0, 2, h);
      g.beginPath(); g.moveTo(xa - 4, 0); g.lineTo(xa + 4, 0); g.lineTo(xa, 6); g.fill();
      const lab = `${i + 1}${p.speed !== 1 ? ` · ${p.speed}×` : ''}${p.reverse ? ' ◀' : ''}`;
      if (xb - xa > g.measureText(lab).width + 10) { g.fillStyle = '#0d1013c0'; g.fillRect(xa + 3, LT - 15, g.measureText(lab).width + 6, 12); g.fillStyle = '#ffb672'; g.fillText(lab, xa + 6, LT - 6); }
    });
  }
  // the filmstrip: pictures of the footage under the waveform (exact frames when zoomed in close)
  function drawFilm(g, o) {
    const { X, s0, sp, w, top, H } = o;
    if (!store_('three.filmstrip', true)) return;
    const pxF = w / Math.max(1e-6, sp * F.clock.fps); // px per frame: every frame gets its own picture once they're this wide
    if (pxF >= 20) queueExact(s0, sp);
    if (!F.film?.length && !F.exactFilm.size) return;
    const alpha = P().analysis ? 0.28 : 0.62;
    g.save(); g.globalAlpha = alpha;
    g.beginPath(); g.rect(0, top, w, H); g.clip();
    const c = F.clock;
    const exactOn = pxF >= 20 && F.exactFilm.size;
    const list = exactOn ? [...F.exactFilm.entries()].map(([n, img]) => ({ t: timeOf(c, n), img })).sort((a, b) => a.t - b.t) : F.film || [];
    for (let i = 0; i < list.length; i += 1) {
      const it = list[i]; const t1 = list[i + 1]?.t ?? D();
      const xa = X(it.t); const xb = X(t1);
      if (xb < 0 || xa > w || !it.img) continue;
      const ih = H; const iw = (it.img.width / it.img.height) * ih;
      // whole pictures side by side; a part narrower than one shows its middle
      for (let x = xa; x < xb; x += iw) { const sw = Math.min(it.img.width, ((xb - x) / iw) * it.img.width); g.drawImage(it.img, (it.img.width - sw) / 2, 0, sw, it.img.height, x, top, Math.min(iw, xb - x), ih); }
    }
    g.restore();
  }
  // A hidden video in this window draws the pictures (in memory: nothing is written to disk)
  async function sampler(path) {
    if (F.sampler?.path === path) return F.sampler;
    F.sampler?.v.removeAttribute('src');
    const v = el('video', { muted: true, preload: 'auto', playsInline: true });
    v.src = fileUrl(path);
    const s = { path, v, busy: null };
    // every grab waits for the metadata (a second caller used to get the video before it knew its size)
    s.busy = new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('no video')); setTimeout(res, 8000); });
    F.sampler = s;
    await s.busy;
    return s;
  }
  async function grab(s, n, width = 120) {
    const c = F.clock;
    const run = async () => {
      const { v } = s;
      const shown = new Promise((res) => { if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => res()); else v.addEventListener('seeked', () => res(), { once: true }); setTimeout(res, 1500); });
      v.currentTime = Math.min(midOf(c, n), Math.max(0, (v.duration || 1) - 0.001));
      await shown;
      if (!v.videoWidth) throw new Error('not ready');
      const hh = Math.max(8, Math.round((v.videoHeight / v.videoWidth) * width));
      const cv = el('canvas', { width, height: hh });
      cv.getContext('2d').drawImage(v, 0, 0, width, hh);
      return cv;
    };
    s.busy = s.busy.then(run, run);
    return s.busy;
  }
  async function loadFilm() {
    const path = F.path; if (!path || !F.clock || !store_('three.filmstrip', true)) return;
    try {
      const s = await sampler(path);
      const dur = D() || s.v.duration || 0; if (!dur) return;
      const count = Math.max(6, Math.min(36, Math.round(dur / 0.4)));
      const out = [];
      for (let i = 0; i < count; i += 1) {
        if (F.path !== path) return;
        const n = frameAt(F.clock, (dur * i) / count);
        const img = await grab(s, n).catch(() => null);
        if (img) out.push({ t: timeOf(F.clock, n), n, img });
      }
      if (F.path === path) { F.film = out; P()?.redraw?.(); }
    } catch { /* no filmstrip: the timeline still works */ }
  }
  let exactTimer = 0;
  function queueExact(s0, sp) {
    if (!F.clock || (sp * F.clock.fps) > 200) return;
    clearTimeout(exactTimer);
    exactTimer = setTimeout(async () => {
      const path = F.path; const c = F.clock;
      const n0 = frameAt(c, s0); const n1 = Math.min((c.frames || 1) - 1, frameAt(c, s0 + sp) + 1);
      const want = []; for (let n = n0; n <= n1; n += 1) if (!F.exactFilm.has(n)) want.push(n);
      if (!want.length || queueExact.busy) return;
      queueExact.busy = true;
      try {
        const s = await sampler(path);
        for (const n of want.slice(0, 48)) { if (F.path !== path) return; const img = await grab(s, n, 96).catch(() => null); if (img) F.exactFilm.set(n, img); }
        if (F.exactFilm.size > 600) for (const k of [...F.exactFilm.keys()].slice(0, 200)) F.exactFilm.delete(k);
        P()?.redraw?.();
      } catch { /* fine */ } finally { queueExact.busy = false; }
    }, 350);
  }

  // ---------- the frames menu (the ▦ chip, a right-click on the time) ----------
  function menuItems() {
    const pl = P();
    if (!pl?.loaded || !pl.isVideo) return [{ label: 'Load a video…', action: () => pl?.pick() }];
    if (!on()) return [{ label: 'Step this video frame by frame', hint: '/footage on', action: () => setMode(true) }];
    const c = F.clock; const n = frameNow();
    const sp = (s) => ({ label: `${s}×`, checked: F.ps?.[inPart(F.ps, here())]?.speed === s, action: () => ops.speed(s) });
    return [
      `f${n} · ${tc(c, n)} · ${c.fps.toFixed(3).replace(/\.?0+$/, '')} fps`,
      { label: 'Go to a frame…', key: 'click the time', action: () => askGoto() },
      { label: 'Step', items: [
        { label: 'One frame back', key: '← ,', action: () => step(-1) }, { label: 'One frame forward', key: '→ .', action: () => step(1) },
        { label: '10 frames back', key: 'Shift+←', action: () => step(-10) }, { label: '10 frames forward', key: 'Shift+→', action: () => step(10) },
        { label: 'One second back', action: () => step(-Math.round(c.fps)) }, { label: 'One second forward', action: () => step(Math.round(c.fps)) },
        { label: 'Previous edit point', key: '↑', action: () => jumpPoint(-1) }, { label: 'Next edit point', key: '↓', action: () => jumpPoint(1) },
        { label: 'First frame', key: 'Home', action: () => go(0) }, { label: 'Last frame', key: 'End', action: () => go((c.frames || 1) - 1) },
        { label: 'Play backward', key: 'J', action: () => shuttle(-1) }, { label: 'Play forward', key: 'L', action: () => shuttle(1) }, { label: 'Stop on a whole frame', key: 'K', action: () => shuttle(0) },
      ] },
      '-',
      { label: 'Cut here', key: 'S', action: () => ops.split() },
      inPart(F.ps, here()) >= 0 || !F.ps ? { label: 'Remove this part', key: 'Delete', action: () => ops.del() } : { label: 'Put this part back', key: 'Shift+Delete', action: () => ops.restore() },
      { label: 'This part', items: [
        { label: 'Starts here', hint: 'trims its start to this frame', action: () => ops.edge('in') },
        { label: 'Ends here', hint: 'trims its end to this frame', action: () => ops.edge('out') },
        { label: 'Speed', items: CutData.SPEEDS.map(sp) },
        { label: 'Play it again right after', action: () => ops.repeat() },
        { label: 'Play it first', action: () => ops.order('first') },
        { label: 'Play it last', action: () => ops.order('last') },
        { label: 'Its sound off / on', action: () => ops.mute() },
        { label: 'Hold its last frame', items: [0.5, 1, 2].map((x) => ({ label: `${x} s`, action: () => ops.holdEnd(x) })) },
        { label: 'Loop it', action: () => loopPart() },
      ] },
      { label: 'Hold this frame', items: [0.5, 1, 2, 3].map((x) => ({ label: `${x} s`, action: () => ops.hold(x) })) },
      F.ps ? { label: 'Move the nearest cut', items: [{ label: 'One frame earlier', key: 'Alt+,', action: () => ops.roll(-1) }, { label: 'One frame later', key: 'Alt+.', action: () => ops.roll(1) }, { label: '5 frames earlier', action: () => ops.roll(-5) }, { label: '5 frames later', action: () => ops.roll(5) }] } : null,
      pl.loop ? { label: 'Keep only the loop', hint: `${label(pl.loop.a)} → ${label(pl.loop.b)}`, action: () => ops.keepOnly(pl.loop.a, pl.loop.b) } : null,
      pl.loop ? { label: 'Remove the loop part', action: () => ops.cutRange(pl.loop.a, pl.loop.b) } : null,
      { label: 'Cut at every shot', items: [['gentle', 'Hard cuts only'], ['normal', 'Normal'], ['sensitive', 'Soft cuts and flashes too']].map(([id, hint]) => ({ label: id[0].toUpperCase() + id.slice(1), hint, action: () => cutAtScenes(id) })) },
      pl.cues.length ? { label: 'Cut at every cue', hint: `${pl.cues.length}`, action: () => ops.splitMany(pl.cues.map((x) => x.time), 'Cut at every cue') } : null,
      pl.analysis ? { label: 'Cut on every bar', action: () => cutOnBeats('bar'), more: true } : null,
      F.ps ? { label: 'The whole video again', hint: 'clears the cut', action: () => ops.clear(), more: true } : null,
      F.ps ? { label: 'List the parts', action: () => toast(describe().join('\n'), { timeout: 8000 }), more: true } : null,
      F.ps ? { label: 'Copy the parts as text', action: () => copyText(describe().join('\n'), 'the parts'), more: true } : null,
      { label: 'Save the cut as an EDL', hint: 'next to the video, for other editors', action: () => saveEdl().catch((e) => toast(e.message, { type: 'error' })), more: true },
      '-',
      { label: 'Cues', items: [
        { label: 'Cue at this frame', key: 'C', action: () => pl.addCue(here()) },
        { label: 'A cue at every cut', action: () => cuesAtCuts() },
        { label: 'A cue at every shot', items: ['gentle', 'normal', 'sensitive', 'every'].map((s) => ({ label: s, action: () => cuesAtScenes(s) })) },
        { label: 'Loop this part', action: () => loopPart() },
        { label: 'Loop one second from here', action: () => loopFrames(Math.round(c.fps)) },
        { label: 'Loop 12 frames from here', action: () => loopFrames(12) },
        { label: 'Loop 24 frames from here', action: () => loopFrames(24) },
      ] },
      { label: 'Copy this timecode', hint: tc(c, n), action: () => copyText(`${tc(c, n)} (f${n})`, tc(c, n)) },
      { label: 'Zoom', items: [
        { label: 'One second of frames', action: () => zoom('second') }, { label: '12 frames', action: () => zoom('12f') },
        { label: 'This part', action: () => zoom('part') }, { label: 'The whole footage', key: '0', action: () => zoom('all') },
      ] },
      { label: 'Palette from this frame', hint: 'the sketch palette', action: () => paletteHere().catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'Pin this frame to the board', hint: 'a reference for the chats', action: () => frameToBoard().catch((e) => toast(e.message, { type: 'error' })), more: true },
      { label: 'Read the footage', items: [
        { label: 'This frame exactly (picture)', action: () => readFrame({ show: true }) },
        { label: 'A still of the sketch at this frame', action: () => stillHere() },
        { label: 'Storyboard: the sketch at every part', action: () => storyboard().catch((e) => toast(e.message, { type: 'error' })) },
        { label: 'Contact sheet (exact frames)', action: () => readFootage('sheet') },
        { label: 'Contact sheet as…', items: [['3x3', '3 × 3'], ['4x4', '4 × 4'], ['6x5', '6 × 5 (dense)'], ['strip', 'Film strip'], ['story', 'Storyboard'], ['portrait', 'Portrait (9:16)']].map(([id, l]) => ({ label: l, action: () => FrameRead.read(F.path, 'sheet', { layout: id }).then((r) => FrameRead.show(r, F.path, `${base(F.path)} · sheet`)).catch((e) => toast(e.message, { type: 'error' })) })) },
        { label: 'Scene list', action: () => readFootage('scenes') },
        { label: 'Motion curve', action: () => readFootage('motion') },
        { label: 'Pacing', action: () => readFootage('pacing') },
        { label: 'Check the frame on screen', hint: 'requestVideoFrameCallback', action: () => checkFrame().then((r) => toast(r.text, { timeout: 4000 })) },
      ] },
      { label: 'Record the sketch over the cut', hint: 'plays every part once, from the top', action: () => { go(0); P().record('track'); } },
      F.ps ? { label: 'Render the cut as a video', hint: 'the editor\'s ffmpeg render, next to the footage', action: () => renderCut().catch((e) => toast(e.message, { type: 'error' })), more: true } : null,
      { label: 'Editor', items: [
        { label: 'Edit it in the video editor', hint: 'the same cut, frame by frame', action: () => toEditor() },
        { label: 'As a new sequence…', action: () => toSequence() },
        { label: 'Take a sequence\'s cut back…', action: () => fromSequencePick() },
      ] },
      { label: 'Time shows', items: [['tc', 'Timecode · frame'], ['frames', 'Frames'], ['seconds', 'Seconds · frame']].map(([id, l]) => ({ label: l, checked: display() === id, action: () => { F.display = id; store.set('three.frameDisplay', id); P().redraw?.(); } })) },
      { label: 'Filmstrip', checked: store_('three.filmstrip', true), action: () => { store.set('three.filmstrip', !store_('three.filmstrip', true)); if (!store_('three.filmstrip', true)) { F.film = null; F.exactFilm.clear(); } else loadFilm(); P().redraw?.(); }, more: true },
      { label: 'Keys…', action: () => toast(KEY_LIST.map(([k, w]) => `${k}: ${w}`).join('\n'), { timeout: 9000 }), more: true },
      { label: 'Frame mode off for this video', hint: 'music keys again', action: () => setMode(false), more: true },
    ].filter(Boolean);
  }
  function setMode(v) {
    const m = modeOf(); if (v) delete m[F.path]; else m[F.path] = false;
    store.set('three.frameModes', m);
    if (v && F.clock) { sendClock(); P().seek(P().time); }
    paintChrome(); P()?.paintAll?.();
    return on();
  }
  function loopFrames(k) { const n = frameNow(); return P().setLoop(timeOf(F.clock, n), timeOf(F.clock, Math.min(F.clock.frames || n + k, n + k))) && P().setLoopOn(true); }
  function loopPart() { const i = inPart(F.ps, here()); const p = i >= 0 ? F.ps[i] : { a: 0, b: D() }; P().setLoop(p.a, p.b); P().setLoopOn(true); return p; }
  function cuesAtCuts() { if (!F.ps?.length) return 0; const add = F.ps.filter((p) => !p.hold).map((p, i) => ({ time: p.a, name: `Part ${i + 1}` })); P().editCues({ add }); return add.length; }
  async function cutAtScenes(sens = 'normal') {
    if (typeof FrameRead === 'undefined') return 0;
    toast('Finding the shots…', { timeout: 1500 });
    const s = await FrameRead.scenes(F.path, { sensitivity: sens, pictures: false, max: 300 });
    const times = s.cuts.map((x) => timeOf(F.clock, x.frame)).filter((t) => t > 0);
    const r = ops.splitMany(times, `Cut at ${times.length} shot change${times.length === 1 ? '' : 's'}`);
    return r ? times.length : 0;
  }
  async function cuesAtScenes(sens = 'normal') {
    if (typeof FrameRead === 'undefined') return 0;
    const s = await FrameRead.scenes(F.path, { sensitivity: sens, pictures: false, max: 300 });
    P().editCues({ add: s.cuts.map((x, i) => ({ time: timeOf(F.clock, x.frame), name: `Shot ${i + 1}` })) });
    toast(`${s.cuts.length} shot${s.cuts.length === 1 ? '' : 's'} as cues`, { timeout: 1600 });
    return s.cuts.length;
  }
  function cutOnBeats(unit = 'bar') {
    const pl = P(); const bs = pl.beatsIn(0, D()); if (!bs.length) return 0;
    const every = unit === 'bar' ? pl.beatsPerBar : unit === '2bars' ? pl.beatsPerBar * 2 : 1;
    const times = bs.filter((_, i) => i % every === 0 && i > 0);
    return ops.splitMany(times, `Cut on every ${unit}`) ? times.length : 0;
  }
  function describe() {
    if (!F.ps) return ['The whole video plays (no cut).'];
    const c = F.clock;
    return F.ps.map((p, i) => (p.hold ? `${i + 1}. hold f${frameAt(c, p.a)} for ${p.hold} s` : `${i + 1}. f${frameAt(c, p.a)}–f${frameAt(c, p.b) - 1} (${tc(c, frameAt(c, p.a))} → ${tc(c, frameAt(c, p.b))})${p.speed !== 1 ? ` at ${p.speed}×` : ''}${p.mute ? ' · sound off' : ''}`));
  }

  // ---------- reading the exact frame ----------
  // What's on screen now: the frame asked for, the one the sketch's decoder presented, and (show) its picture from
  // the file (ffmpeg's exact frame, or the player's confirmed one)
  async function checkFrame() {
    const n = frameNow();
    if (!F.player.playing && F.pres?.req !== F.req) await wait(250);
    const sb = await ThreeLab.director?.evalInSketch?.('return { frame: media.frame, time: media.frameTime, fps: media.fps, part: media.part }').catch(() => null);
    const shown = sb?.ok ? sb.value : null;
    const ok = shown ? shown.frame === n : F.pres?.frame === n;
    return { ok, frame: n, timecode: tc(F.clock, n), time: timeOf(F.clock, n), presented: shown?.frame ?? F.pres?.frame ?? null, sketchSees: shown, text: `${ok ? '✓' : '✖'} f${n} (${tc(F.clock, n)}): the sketch's video shows f${shown?.frame ?? F.pres?.frame ?? '?'}` };
  }
  async function readFrame({ show = false, chat = false, width = 640 } = {}) {
    if (!F.path) throw new Error('Load a video first');
    const n = frameNow();
    const r = typeof FrameRead !== 'undefined' ? await FrameRead.at(F.path, { frame: n }, { width, format: 'jpg' }) : null;
    if (show && r && typeof FrameRead !== 'undefined') FrameRead.show({ text: `f${n} · ${tc(F.clock, n)}`, images: [{ path: r.path, label: `f${n}` }] }, F.path, 'Frame');
    return { frame: n, timecode: tc(F.clock, n), time: timeOf(F.clock, n), path: r?.path, chat };
  }
  async function readFootage(mode, file = F.path, { quiet = false } = {}) {
    if (!file) throw new Error('Load a video first');
    if (typeof FrameRead === 'undefined') throw new Error('The frame reader isn\'t loaded');
    const r = await FrameRead.read(file, mode, {});
    if (!quiet) FrameRead.show(r, file, `${base(file)} · ${mode}`);
    return r;
  }

  // a still of the sketch (all layers) at this exact frame, once the frame is confirmed on screen
  async function stillHere() {
    if (!on()) return null;
    await settle();
    const c = await ThreeLab.cmd();
    return c.still?.({});
  }
  // the sketch at the first frame of every part (or every cue without a cut): one numbered sheet
  async function storyboard() {
    if (!on()) throw new Error('Load a video first');
    const times = F.ps ? F.ps.filter((p) => !p.hold).map((p) => midOf(F.clock, frameAt(F.clock, p.a))) : (P().cues || []).map((x) => x.time);
    if (!times.length) throw new Error('Cut the footage (S) or drop cues (C) first');
    const sheet = await ThreeLab.director.contactSheet({ times: times.slice(0, 16), count: Math.min(16, times.length) });
    if (sheet?.dataUrl && typeof Capture !== 'undefined' && window.hub.capture?.save) {
      const path = await window.hub.capture.save({ name: `${base(F.path).replace(/\.\w+$/, '')} storyboard`, data: sheet.dataUrl, ext: 'jpg', sub: 'sheets' }).catch(() => null);
      if (path && typeof FrameRead !== 'undefined') FrameRead.show({ text: sheet.frames.map((f) => `${f.n}. ${f.time} s`).join(' · '), images: [{ path, label: 'storyboard' }] }, F.path, 'Storyboard');
      return { path, frames: sheet.frames };
    }
    return sheet;
  }

  // ---------- the editor: the same cut, open there; sequences in and out ----------
  async function toEditor() {
    if (!F.path || typeof VideoCut === 'undefined') return false;
    if (P().playing) P().toggle(false);
    return VideoCut.receive(F.path, { as: 'edit' });
  }
  async function toSequence(name) {
    if (!F.path || typeof VideoCut === 'undefined') return null;
    name ||= await Modal.prompt('Sequence name', { value: `Lab · ${base(F.path).replace(/\.\w+$/, '')}` });
    if (!name) return null;
    const e = JSON.parse(JSON.stringify(F.edit || CutData.fromSource(F.path, srcEnd())));
    await Review.ensureMounted?.(); activate('tool:ae');
    const key = await VideoCut.newSequence(name);
    const v = F.sampler?.v;
    const seq = CutData.setSeq ? CutData.setSeq({ ...e, markers: (P().cues || []).map((c) => ({ id: `m${Math.random().toString(36).slice(2, 8)}`, t: CutData.programTimes(e, F.path, c.time)[0] ?? c.time, label: c.name })).filter((m) => Number.isFinite(m.t)) }, { w: v?.videoWidth || 1080, h: v?.videoHeight || 1920, fps: Math.round(F.clock.fps * 1000) / 1000 }) : e;
    VideoCut.commit(seq, 'From the Lab');
    return key;
  }
  async function sequenceNames() { return typeof VideoCut !== 'undefined' && VideoCut.sequences ? VideoCut.sequences().map((s) => s.name) : []; }
  async function fromSequencePick() {
    const names = await sequenceNames();
    if (!names.length) { toast('No sequences yet (⋯ › Editor › As a new sequence)', { timeout: 2200 }); return; }
    const r = el('div');
    showMenu(innerWidth / 2 - 120, innerHeight / 3, ['Take the cut back from', ...names.map((n) => ({ label: n, action: () => fromSequence(n) }))]);
    return r;
  }
  // A sequence's clips of this footage become the Lab's cut (other clips stay in the sequence)
  async function fromSequence(name) {
    if (typeof VideoCut === 'undefined') throw new Error('The editor isn\'t loaded');
    const key = String(name).startsWith('seq:') ? name : `seq:${name}`;
    const e = await editOf(key);
    if (!e) throw new Error(`No sequence "${name}"`);
    const srcs = [...new Set(e.clips.filter((cl) => cl.kind === 'video' && cl.src).map((cl) => cl.src))];
    if (!srcs.length) throw new Error('That sequence has no video clips');
    if (!F.path || !srcs.includes(F.path)) { const r = await P().load(srcs[0]); if (!r.ok) throw new Error(r.error); await waitClock(); }
    const mine = { v: 1, clips: e.clips.filter((cl) => (cl.kind === 'video' || cl.kind === 'freeze') && cl.src === F.path).map((cl) => ({ ...cl })), markers: [], mark: null };
    changeEdit(() => mine, `The cut of "${key.slice(4)}" (${mine.clips.length} part${mine.clips.length === 1 ? '' : 's'})`);
    return { parts: F.ps?.length || 0, from: key.slice(4), file: base(F.path), other: srcs.filter((s) => s !== F.path).map(base) };
  }
  async function waitClock(ms = 8000) { const t = performance.now(); while (performance.now() - t < ms && (!F.clock || F.clock.source === 'guess')) await wait(80); return F.clock; }

  // ---------- reference footage: exact readings and "match this pacing" (the vibe, not the footage) ----------
  // A reference's pacing profile, compact for chats: shots, average shot length, cuts a minute, words, the cut
  // rhythm (relative times) and a 24-step motion curve (0..1)
  async function pacingOf(file, name = null) {
    if (F.refRead.has(file)) return { ...F.refRead.get(file), ...(name ? { file: name } : {}) };
    if (typeof FrameRead === 'undefined') throw new Error('The frame reader isn\'t loaded');
    const p = await FrameRead.pacing(file);
    const m = await FrameRead.motion(file, { buckets: 24 }).catch(() => null);
    const top = m ? Math.max(1e-6, ...m.curve.map((x) => x.motion)) : 1;
    const prof = { file: name || base(file).replace(/^\d{10,}-/, ''), shots: p.shots, seconds: p.duration, averageShot: p.average, cutsPerMinute: p.perMinute, words: p.words, cuts: p.cuts.map((x) => Math.round(x.time * 1000) / 1000), motion: m ? m.curve.map((x) => Math.round((x.motion / top) * 100) / 100) : null };
    F.refRead.set(file, prof);
    return prof;
  }
  // Cues on the Lab timeline at the reference's rhythm: fit (stretched over the loop / footage / song), seconds
  // (its own shot lengths, repeated) or beats (fitted, then each on the nearest beat); on frames with footage
  async function matchPacing(file, mode = 'fit', { cut = false, name = null, hits = false } = {}) {
    const pl = P();
    if (!pl.loaded) throw new Error('Load the song or footage to pace first');
    const prof = await pacingOf(file, name);
    const lp = pl.loop; const a = lp ? lp.a : 0; const b = lp ? lp.b : (on() ? srcEnd() : D());
    let times = pacingTimes(prof.cuts, prof.seconds, a, b, mode === 'seconds' ? 'seconds' : 'fit');
    if (mode === 'beats' && pl.analysis) { const bs = pl.beatsIn(a, b); if (bs.length) times = times.map((t) => bs.reduce((x, y) => (Math.abs(y - t) < Math.abs(x - t) ? y : x), bs[0])); }
    if (on()) times = times.map((t) => snapT(F.clock, t));
    times = [...new Set(times.map((t) => Math.round(t * 1e4) / 1e4))].filter((t) => t > a + 0.01 && t < b - 0.01);
    // as cues (sections looks can follow), or as Hit markers: the sketch's audio.hit fires on the reference's rhythm
    if (hits) pl.editMarkers({ add: { hit: times }, snap: false });
    else pl.editCues({ remove: (pl.cues || []).filter((c) => /^Pace \d+$/.test(c.name)).map((c) => c.time), add: times.map((t, i) => ({ time: t, name: `Pace ${i + 1}` })) });
    if (cut && on()) ops.splitMany(times, `Cut to the pacing of ${prof.file}`);
    const save = (await window.hub.kvGet('three-footage', {})) || {};
    const sid = F.ctx?.sketchId?.();
    if (sid) { (save.pacing ||= {})[sid] = { ...prof, mode, applied: times.length, at: Date.now() }; window.hub.kvSet('three-footage', save); }
    toast(`${times.length} pace ${hits ? 'hit' : 'cue'}${times.length === 1 ? '' : 's'} from ${prof.file} (${prof.words}): its rhythm, not its footage`, { timeout: 3200 });
    return { cues: times.length, mode, as: hits ? 'hits' : 'cues', ...prof, cuts: undefined, motion: undefined };
  }
  // The reference's motion energy as keyframes on a slider (layer: the selected one): calm parts low, busy parts high
  async function motionToSlider(file, slider, { min = null, max = null } = {}) {
    const prof = await pacingOf(file);
    if (!prof.motion) throw new Error('No motion curve (the frame reader couldn\'t read it)');
    const d = ThreeLab.director; if (!d) throw new Error('The Lab isn\'t ready');
    const pl = P(); const lp = pl.loop; const a = lp ? lp.a : 0; const b = lp ? lp.b : (D() || 10);
    const sl = d.sliders(null, null)?.sliders?.find?.((s) => s.key === slider || String(s.label).toLowerCase() === String(slider).toLowerCase());
    const lo = min ?? sl?.min ?? 0; const hi = max ?? sl?.max ?? 1;
    const keys = prof.motion.map((v, i) => ({ time: a + ((b - a) * i) / Math.max(1, prof.motion.length - 1), value: Math.round((lo + (hi - lo) * v) * 1000) / 1000, ease: 'ease' }));
    return d.setKeyframes('selected', slider, keys.map((k) => ({ ...k, time: on() ? snapT(F.clock, k.time) : k.time })), false);
  }
  // reference videos the chats can mean: the Lab's references of this sketch, then the board's clips
  async function refVideos() {
    const out = [];
    for (const r of ThreeLab.director?.refs?.list?.() || []) if (r.kind === 'video') out.push({ name: r.key, path: r.path, from: 'references' });
    try { if (typeof Board !== 'undefined') { await Board.ready?.(); for (const it of Board.items() || []) if (it.type === 'video' && it.src) out.push({ name: it.title || it.name || base(it.src).replace(/\.\w+$/, ''), path: it.src, from: 'board' }); } } catch { /* no board */ }
    return out;
  }
  async function findRef(q) {
    const list = await refVideos();
    if (!q) return list[0] || null;
    const s = String(q).toLowerCase();
    return list.find((r) => r.name.toLowerCase() === s) || list.find((r) => r.name.toLowerCase().includes(s) || base(r.path).toLowerCase().includes(s)) || (/[\\/]/.test(q) ? { name: base(q), path: q, from: 'file' } : null);
  }
  // the menu on a reference clip (References panel, /ref-frames)
  function refMenu(x, y, path, name = base(path)) {
    showMenu(x, y, [
      `${name}: read it exactly`,
      { label: 'Contact sheet', hint: 'timecodes under each frame', action: () => readFootage('sheet', path) },
      { label: 'Scene list', action: () => readFootage('scenes', path) },
      { label: 'Motion curve', action: () => readFootage('motion', path) },
      { label: 'Pacing', action: () => readFootage('pacing', path) },
      { label: 'Vibe card', action: () => readFootage('vibe', path) },
      '-',
      { label: 'Match this pacing', items: [
        { label: 'Fit to the loop / the footage / the song', action: () => matchPacing(path, 'fit', { name }).catch((e) => toast(e.message, { type: 'error' })) },
        { label: 'Its own shot lengths', action: () => matchPacing(path, 'seconds', { name }).catch((e) => toast(e.message, { type: 'error' })) },
        { label: 'On the beat', action: () => matchPacing(path, 'beats', { name }).catch((e) => toast(e.message, { type: 'error' })) },
        on() ? { label: 'Cut the footage to it', action: () => matchPacing(path, 'fit', { cut: true, name }).catch((e) => toast(e.message, { type: 'error' })) } : null,
        { label: 'As hits the sketch reacts to', hint: 'audio.hit fires on its rhythm', action: () => matchPacing(path, 'fit', { hits: true, name }).catch((e) => toast(e.message, { type: 'error' })) },
      ].filter(Boolean) },
      { label: 'Its motion on a slider…', action: async () => { const s = await Modal.prompt('Which slider follows its motion?', { placeholder: 'speed, glow…' }); if (s) motionToSlider(path, s).then(() => toast('Keyframed from the reference\'s motion', { timeout: 1600 })).catch((e) => toast(e.message, { type: 'error' })); } },
      '-',
      { label: 'Load it as the Lab\'s footage', hint: 'only if you want the clip itself', action: () => P().load(path), more: true },
    ]);
  }

  // ---------- status (chats, tests) ----------
  function status() {
    const pl = P();
    if (!pl?.loaded) return { footage: null };
    if (!pl.isVideo) return { footage: null, song: base(pl.path) };
    const c = F.clock; const n = frameNow();
    return {
      footage: base(F.path), frameMode: on(), fps: c ? Math.round(c.fps * 1000) / 1000 : null, frames: c?.frames || null, clock: c?.source || null,
      frame: n, timecode: c ? tc(c, n) : null, time: c ? timeOf(c, n) : null, playing: pl.playing,
      presented: F.pres ? F.pres.frame : null,
      parts: F.ps ? F.ps.length : 0, cut: F.ps ? describe() : null, ...(F.ps ? { cutSeconds: cutLength().seconds } : {}),
      sound: Boolean(pl.analysis),
    };
  }

  // ---------- the director (three_media_control / three_do footage), lean ----------
  // a frame given as a number, "f120", "+5f" or a timecode → its start time
  const frameTime = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? Math.round(v) : resolve(F.clock, parse(F.clock, /^\d+$/.test(String(v).trim()) ? `f${String(v).trim()}` : v), frameNow()); return n == null ? null : timeOf(F.clock, Math.max(0, n)); };
  const toTime = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') return v; const p = parse(F.clock, v); const n = resolve(F.clock, p, frameNow()); return n == null ? null : timeOf(F.clock, n); };
  // frames written as "f120" (or { frame }) in other three tools become times on this footage's clock
  function framesToTimes(args) {
    if (!F.clock) return;
    const fix = (v) => (typeof v === 'string' && /^(f|#)\d+$|^\d+:\d{1,2}:\d{1,2}[:;]\d+$/i.test(v.trim()) ? toTime(v) : v);
    if (Array.isArray(args.keys)) args.keys = args.keys.map((k) => (k && k.frame != null && k.time == null ? { ...k, time: timeOf(F.clock, Number(k.frame)) } : k && typeof k.time === 'string' ? { ...k, time: fix(k.time) } : k));
    if (args.markers?.add) for (const lane of Object.keys(args.markers.add)) args.markers.add[lane] = args.markers.add[lane].map(fix);
    if (args.cues?.add) args.cues.add = args.cues.add.map((c) => (c && typeof c.time === 'string' ? { ...c, time: fix(c.time) } : c));
    if (args.loop && typeof args.loop === 'object') { args.loop.start = fix(args.loop.start); args.loop.end = fix(args.loop.end); }
  }
  async function handle(tool, args = {}) {
    if (tool === 'three_keyframes' || tool === 'three_timeline_edit') { framesToTimes(args); return null; }
    // frames in a screenshot / contact sheet: "f48" or { frames: [12, 24] } become this footage's times
    if ((tool === 'three_screenshot' || tool === 'three_contact_sheet') && on()) {
      if (typeof args.at === 'string' && /^(f|#)?\d+f?$|^\d+:\d{1,2}:\d{1,2}[:;]\d+$/i.test(args.at.trim()) && !/^\d+$/.test(args.at.trim())) args.at = midOf(F.clock, frameAt(F.clock, toTime(args.at)));
      if (Array.isArray(args.frames)) { args.times = args.frames.map((n) => midOf(F.clock, Math.round(Number(n) || 0))); delete args.frames; }
      if (Array.isArray(args.times)) args.times = args.times.map((x) => (typeof x === 'string' ? midOf(F.clock, frameAt(F.clock, toTime(x))) : x));
      return null;
    }
    if (tool === 'three_media_info' && on()) {
      const live = ThreeLab.director?.live?.() || {};
      const info = P().info();
      return { ok: true, value: { ...info, ...(live.input || live.nowPlaying ? { live } : {}), footage: { fps: Math.round(F.clock.fps * 1000) / 1000, frames: F.clock.frames, frame: frameNow(), timecode: tc(F.clock, frameNow()), ...(F.ps ? { cut: describe(), cutSeconds: cutLength().seconds } : {}), note: 'frames: three_media_control frame / step / read; three_do footage' } } };
    }
    if (tool === 'three_media_control') {
      const act = args.action;
      if (!['step', 'frame', 'read'].includes(act) && args.frame == null) return null;
      if (!P()?.loaded) return { ok: false, error: 'No music or footage loaded.' };
      if (!on()) return { ok: false, error: P().isVideo ? 'Frame mode is off for this video (/footage on).' : 'Frames work on video footage: the loaded file is a song (seek with time).' };
      await ensureSandbox();
      if (act === 'step') step(Math.round(Number(args.n ?? args.frames ?? 1)) || 1);
      else if (act === 'frame' || args.frame != null) { const n = resolve(F.clock, typeof args.frame === 'number' ? { frame: args.frame } : parse(F.clock, args.frame ?? args.time), frameNow()); if (n == null) return { ok: false, error: 'frame: a number, "f120", "+10f" or a timecode' }; go(n); }
      await settle();
      const s = await checkFrame();
      const out = { frame: s.frame, timecode: s.timecode, time: s.time, sketchSees: s.presented, exact: s.ok, fps: F.clock.fps, frames: F.clock.frames, ...(F.ps ? { part: inPart(F.ps, here()) + 1 || 'removed (the sketch skips it)' } : {}) };
      if (act === 'read' && args.see) { const r = await readFrame({ width: 512 }); try { return { ok: true, value: out, images: [{ data: await window.hub.fs.read(r.path, { encoding: 'base64' }), mime: 'image/jpeg' }] }; } catch { /* no picture */ } }
      return { ok: true, value: out };
    }
    if (tool === 'three_footage') return footageTool(args);
    return null;
  }
  // the preview page lost the footage (a page that came back without a run): send it again, with its clock and cut
  async function ensureSandbox() {
    const has = async () => { const r = await ThreeLab.director?.evalInSketch?.('return media.fps').catch(() => null); return r?.ok && r.value > 0; };
    if (await has()) return true;
    P().attach({ playing: false });
    for (let i = 0; i < 40; i += 1) { await wait(100); if (await has()) { await wait(150); return true; } }
    return false;
  }
  async function settle() { const t = performance.now(); while (performance.now() - t < 1500 && F.pres?.req !== F.req && !P().playing) await wait(40); }
  async function footageTool(a) {
    const act = a.action || 'info';
    const need = () => { if (!on()) throw new Error(P()?.loaded && P().isVideo ? 'Frame mode is off for this video (/footage on).' : 'Load video footage first (three_do load_media).'); };
    try {
      if (act === 'info') return { ok: true, value: status() };
      if (act === 'pacing' || act === 'match') {
        const r = await findRef(a.ref);
        if (!r) return { ok: false, error: `No reference clip${a.ref ? ` "${a.ref}"` : ''}: ${(await refVideos()).map((x) => x.name).join(', ') || 'none in the Lab references or on the board'}` };
        if (act === 'pacing') { const p = await pacingOf(r.path, r.name); return { ok: true, value: { ...p, cuts: p.cuts.slice(0, 40), note: 'A reference: use its rhythm and energy, never its footage.' } }; }
        return { ok: true, value: await matchPacing(r.path, a.mode || 'fit', { cut: Boolean(a.cut), hits: Boolean(a.hits), name: r.name }) };
      }
      if (act === 'sheet' || act === 'scenes' || act === 'motion') {
        const r = a.ref ? await findRef(a.ref) : { path: F.path, name: base(F.path) };
        if (!r?.path) return { ok: false, error: 'No footage or reference clip' };
        const res = await readFootage(act, r.path, { quiet: true });
        const imgs = [];
        if (a.see !== false && res.images?.length) for (const im of res.images.slice(0, act === 'sheet' ? 1 : 0)) { try { imgs.push({ data: await window.hub.fs.read(im.path, { encoding: 'base64' }), mime: /\.png$/i.test(im.path) ? 'image/png' : 'image/jpeg' }); } catch { /* gone */ } }
        return { ok: true, value: { file: r.name, text: String(res.text || '').slice(0, 1500) }, ...(imgs.length ? { images: imgs } : {}) };
      }
      need();
      const t = a.frame != null ? frameTime(a.frame) : a.time != null ? toTime(a.time) : here();
      if (t == null) return { ok: false, error: 'frame: a number, "f120" or a timecode' };
      if (act === 'cuts') return { ok: true, value: { parts: describe(), fps: F.clock.fps } };
      if (act === 'split') ops.split(t);
      else if (act === 'delete') ops.del(t);
      else if (act === 'restore') ops.restore(t);
      else if (act === 'speed') ops.speed(Number(a.value) || 1, t);
      else if (act === 'hold') ops.hold(Number(a.value) || 1, t);
      else if (act === 'clear') ops.clear();
      else if (act === 'keep') ops.keepOnly(frameTime(a.from ?? a.frame), frameTime(a.to));
      else if (act === 'cut_scenes') await cutAtScenes(a.value || 'normal');
      else if (act === 'cue') P().editCues({ add: [{ time: t, name: a.value || undefined }] });
      else if (act === 'editor') { await toEditor(); return { ok: true, value: { opened: 'Video Review editor, the same cut' } }; }
      else if (act === 'in' || act === 'out') ops.edge(act, t);
      else if (act === 'roll') ops.roll(Math.round(Number(a.value) || 1), t);
      else if (act === 'repeat') ops.repeat(t);
      else if (act === 'first' || act === 'last') ops.order(act, t);
      else if (act === 'mute') ops.mute(a.value == null ? undefined : Boolean(a.value), t);
      else if (act === 'palette') { if (a.frame != null || a.time != null) go(frameAt(F.clock, t)); await settle(); return { ok: true, value: { palette: await paletteHere(), frame: frameNow() } }; }
      else if (act === 'zoom') return { ok: true, value: { zoom: zoom(a.value || 'second') } };
      else if (act === 'storyboard') { const r = await storyboard(); return { ok: true, value: { frames: r.frames }, ...(r.path ? { images: [{ data: await window.hub.fs.read(r.path, { encoding: 'base64' }), mime: 'image/jpeg' }] } : {}) }; }
      else return { ok: false, error: 'action: info, cuts, split, delete, restore, speed, hold, keep, clear, in, out, roll, repeat, first, last, mute, cut_scenes, cue, palette, zoom, sheet, scenes, motion, pacing, match, storyboard, editor' };
      return { ok: true, value: { frame: frameAt(F.clock, t), parts: describe() } };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  // ---------- attach (tools/three.js calls this once the Lab's preview exists) ----------
  function attach({ player, send, sketchId }) {
    F.player = player; F.send = send; F.ctx = { sketchId };
    hookPlayer(player);
    if (typeof VideoCut !== 'undefined') VideoCut.on?.('change', ({ path, from } = {}) => { if (from !== 'lab' && path === F.path) loadEdit(); });
    if (typeof Keys !== 'undefined') Keys.add(KEY_LIST.map(([k, what]) => ({ area: 'Lab timeline', keys: k, what, when: () => on() })));
    if (player.loaded && player.isVideo) onLoad({ path: player.path, video: true });
    return api;
  }
  const api = {
    attach, handle, status, refMenu, refVideos, findRef, pacingOf, matchPacing, motionToSlider, readFootage, readFrame, checkFrame, fromSequence, toSequence, toEditor, sequenceNames,
    step, go, shuttle, jumpPoint, ops, describe, setMode, cutLength, saveEdl, stillHere, storyboard, copyText, zoom, paletteHere, frameToBoard, renderCut, moveEdge, cuesAtCuts, cuesAtScenes, cutAtScenes, cutOnBeats, loopFrames, loopPart, menuItems, askGoto,
    get on() { return on(); }, get clock() { return F.clock; }, get parts() { return F.ps ? F.ps.map((p) => ({ ...p })) : null; }, get frame() { return frameNow(); }, get presented() { return F.pres; },
    get display() { return display(); }, setDisplay: (d) => { if (!['tc', 'frames', 'seconds'].includes(d)) return null; F.display = d; store.set('three.frameDisplay', d); P()?.redraw?.(); return d; },
    KEYS: KEY_LIST, _pure: pure, _F: F,
  };
  return api;
})();
if (typeof module !== 'undefined') module.exports = ThreeFrames;
