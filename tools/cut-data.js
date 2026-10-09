// Clip editing for Video Review (the "cut"): the edit list and its pure operations, the mapping between program
// time (the edit as it plays) and source time, snapping, beat-cut suggestions and the ffmpeg filter graph that
// renders an edit (trim · speed with pitch kept · fades · freeze frames · title cards · gaps → concat → preset).
// No DOM here, so it loads in Node for tests (module.exports at the bottom); the UI is tools/video-cut.js.
//
// An edit: { v: 1, clips: [clip], markers: [{ id, t, label }], mark: { a, b } | null }
// clip:   { id, kind: 'video' | 'freeze' | 'title' | 'gap', src, in, out, max, speed, mute, fadeIn, fadeOut,
//           at (freeze: the source time held), dur (freeze / title / gap seconds), text, img (title picture) }
// Every operation returns a new edit (the old one stays as the undo step). Times are seconds; program time = the
// output timeline, source time = inside a clip's file.
const CutData = (() => {
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  const MIN = 0.05; // shortest clip (s)
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  let seq = 0;
  const uid = () => `c${Date.now().toString(36)}${(seq += 1).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const copy = (e) => JSON.parse(JSON.stringify(e));
  const base = (p) => String(p || '').split(/[\\/]/).pop();

  // ---------- building ----------
  function videoClip(src, a, b, max) {
    const hi = max || b;
    return { id: uid(), kind: 'video', src, in: r4(clamp(a, 0, hi)), out: r4(clamp(b, 0, hi)), max: hi ? r4(hi) : undefined, speed: 1, mute: false, fadeIn: 0, fadeOut: 0 };
  }
  const fromSource = (src, duration) => ({ v: 1, clips: [videoClip(src, 0, duration, duration)], markers: [], mark: null });
  const empty = () => ({ v: 1, clips: [], markers: [], mark: null });
  // An edit read back from storage: defaults filled, broken clips dropped.
  function normalize(e) {
    const out = { v: 1, clips: [], markers: [], mark: null, ...(e || {}) };
    out.clips = (out.clips || []).filter((c) => c && (c.kind === 'video' ? c.src && c.out - c.in >= 0.01 : c.dur > 0)).map((c) => ({ speed: 1, mute: false, fadeIn: 0, fadeOut: 0, ...c, id: c.id || uid() }));
    out.markers = (out.markers || []).filter((m) => Number.isFinite(m?.t));
    return out;
  }

  // ---------- time ----------
  const durOf = (c) => (c.kind === 'video' ? Math.max(0, (c.out - c.in) / (c.speed || 1)) : Math.max(0, c.dur || 0));
  // [{ clip, i, start, end }] in program time
  function layout(e) {
    let t = 0;
    return e.clips.map((clip, i) => { const s = t; t += durOf(clip); return { clip, i, start: s, end: t }; });
  }
  const total = (e) => e.clips.reduce((s, c) => s + durOf(c), 0);
  // The clip under a program time (the last one at the very end) and the source time there.
  function at(e, T) {
    const L = layout(e);
    if (!L.length) return null;
    let k = L.findIndex((x) => T < x.end - 1e-9);
    if (k < 0) k = L.length - 1;
    const x = L[k];
    const local = clamp(T - x.start, 0, x.end - x.start);
    const src = x.clip.kind === 'video' ? x.clip.in + local * (x.clip.speed || 1) : x.clip.kind === 'freeze' ? x.clip.at : null;
    return { ...x, local, srcTime: src };
  }
  // Program times where a source time of `src` shows (one per clip that holds it).
  function programTimes(e, src, t) {
    return layout(e).filter((x) => x.clip.kind === 'video' && x.clip.src === src && t >= x.clip.in - 1e-6 && t <= x.clip.out + 1e-6).map((x) => x.start + (t - x.clip.in) / (x.clip.speed || 1));
  }
  // Cut points (where one clip ends and the next starts), without 0 and the end.
  const cuts = (e) => layout(e).slice(0, -1).map((x) => x.end);
  // Program-time beats from per-source beat lists: { [src]: { beats: [s], drops?: [s], sections? } }.
  function programBeats(e, analyses = {}) {
    const beats = []; const bars = []; const drops = [];
    for (const x of layout(e)) {
      const c = x.clip;
      const a = c.kind === 'video' ? analyses[c.src] : null;
      if (!a?.beats) continue;
      a.beats.forEach((b, i) => {
        if (b < c.in - 1e-6 || b > c.out + 1e-6) return;
        const T = r4(x.start + (b - c.in) / (c.speed || 1));
        beats.push(T);
        if (i % 4 === 0) bars.push(T);
      });
      for (const d of a.drops || []) if (d >= c.in && d <= c.out) drops.push(r4(x.start + (d - c.in) / (c.speed || 1)));
    }
    return { beats, bars, drops };
  }

  // ---------- snapping ----------
  // targets: [{ t, kind }]; returns { t, snapped: { t, kind } | null } within tol seconds.
  function snap(t, targets, tol) {
    let best = null;
    for (const g of targets) { const d = Math.abs(g.t - t); if (d <= tol && (!best || d < Math.abs(best.t - t))) best = g; }
    return best ? { t: best.t, snapped: best } : { t, snapped: null };
  }

  // ---------- edits ----------
  const indexOf = (e, id) => e.clips.findIndex((c) => c.id === id);
  // Split the clip under T into two (nothing when T sits on a cut already or too close to an edge).
  function split(e, T) {
    const x = at(e, T);
    if (!x || T - x.start < MIN || x.end - T < MIN) return e;
    const n = copy(e);
    const c = n.clips[x.i];
    const a = { ...c, id: uid() }; const b = { ...c, id: uid() };
    if (c.kind === 'video') { a.out = r4(x.srcTime); b.in = r4(x.srcTime); } else { a.dur = r4(T - x.start); b.dur = r4(x.end - T); }
    a.fadeOut = 0; b.fadeIn = 0;
    n.clips.splice(x.i, 1, a, b);
    return n;
  }
  const splitMany = (e, times) => [...times].sort((p, q) => q - p).reduce((acc, T) => split(acc, T), e);
  // Delete clips: ripple closes the hole, otherwise (lift) a gap of the same length stays.
  function remove(e, ids, { ripple = true } = {}) {
    const set = new Set([].concat(ids));
    const n = copy(e);
    n.clips = n.clips.flatMap((c) => (!set.has(c.id) ? [c] : ripple || c.kind === 'gap' ? [] : [{ id: uid(), kind: 'gap', dur: r4(durOf(c)) }]));
    if (!ripple) n.clips = mergeGaps(n.clips);
    return n;
  }
  function mergeGaps(list) {
    const out = [];
    for (const c of list) { const p = out[out.length - 1]; if (c.kind === 'gap' && p?.kind === 'gap') p.dur = r4(p.dur + c.dur); else out.push(c); }
    return out;
  }
  // Everything between program times a and b removed (ripple) or replaced by a gap (lift).
  function removeRange(e, a, b, { ripple = true } = {}) {
    if (b - a < 0.01) return e;
    const n = splitMany(e, [a, b]);
    const ids = layout(n).filter((x) => x.start >= a - 1e-3 && x.end <= b + 1e-3).map((x) => x.clip.id);
    return remove(n, ids, { ripple });
  }
  // Only a..b stays (an export of the in–out range).
  function slice(e, a, b) {
    const T = total(e);
    let n = e;
    if (b < T - 1e-3) n = removeRange(n, b, T);
    if (a > 1e-3) n = removeRange(n, 0, a);
    return n;
  }
  // Ripple trim one edge of a clip: edge 'in' moves the start of its source range, 'out' the end. `delta` in
  // program seconds (positive = the clip gets shorter at the start / longer at the end).
  function trim(e, id, edge, delta) {
    const i = indexOf(e, id);
    if (i < 0 || !delta) return e;
    const n = copy(e);
    const c = n.clips[i];
    if (c.kind === 'video') {
      const s = c.speed || 1;
      if (edge === 'in') c.in = r4(clamp(c.in + delta * s, 0, c.out - MIN * s));
      else c.out = r4(clamp(c.out + delta * s, c.in + MIN * s, c.max || Infinity));
    } else c.dur = r4(Math.max(MIN, c.dur + (edge === 'in' ? -delta : delta)));
    const d = durOf(c);
    c.fadeIn = Math.min(c.fadeIn || 0, d / 2); c.fadeOut = Math.min(c.fadeOut || 0, d / 2);
    return n;
  }
  // Trim the clip under T so it starts (edge 'in') or ends ('out') at T: Q / W in an NLE.
  function trimTo(e, T, edge) {
    const x = at(e, T);
    if (!x) return e;
    return edge === 'in' ? trim(e, x.clip.id, 'in', T - x.start) : trim(e, x.clip.id, 'out', T - x.end);
  }
  function move(e, id, to) {
    const i = indexOf(e, id);
    if (i < 0) return e;
    const n = copy(e);
    const [c] = n.clips.splice(i, 1);
    n.clips.splice(clamp(to > i ? to - 1 : to, 0, n.clips.length), 0, c);
    return n;
  }
  function duplicate(e, id) {
    const i = indexOf(e, id);
    if (i < 0) return e;
    const n = copy(e);
    n.clips.splice(i + 1, 0, { ...copy(n.clips[i]), id: uid() });
    return n;
  }
  function patch(e, ids, fn) {
    const set = new Set([].concat(ids));
    const n = copy(e);
    for (const c of n.clips) if (set.has(c.id)) fn(c);
    return n;
  }
  const nearestSpeed = (x) => SPEEDS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  const setSpeed = (e, ids, s) => patch(e, ids, (c) => { if (c.kind === 'video') { c.speed = clamp(Number(s) || 1, 0.25, 4); const d = durOf(c); c.fadeIn = Math.min(c.fadeIn, d / 2); c.fadeOut = Math.min(c.fadeOut, d / 2); } });
  const setMute = (e, ids, on) => patch(e, ids, (c) => { c.mute = on ?? !c.mute; });
  const setFade = (e, ids, edge, s) => patch(e, ids, (c) => { c[edge === 'in' ? 'fadeIn' : 'fadeOut'] = r4(clamp(Number(s) || 0, 0, durOf(c) / 2)); });
  // Insert a clip at program time T (splitting the clip there).
  function insertAt(e, T, clip) {
    const n = split(e, T);
    const L = layout(n);
    let i = L.findIndex((x) => x.start >= T - 1e-3);
    if (i < 0) i = n.clips.length;
    const m = copy(n);
    m.clips.splice(i, 0, { fadeIn: 0, fadeOut: 0, speed: 1, mute: false, ...clip, id: uid() });
    return m;
  }
  // A held frame of the picture under T, `dur` long, inserted at T.
  function freeze(e, T, dur = 1) {
    const x = at(e, T);
    if (!x || x.clip.kind === 'gap' || x.clip.kind === 'title') return e;
    const src = x.clip.src; const held = x.clip.kind === 'freeze' ? x.clip.at : x.srcTime;
    return insertAt(e, T, { kind: 'freeze', src, at: r4(held), dur: r4(dur), mute: true });
  }
  const title = (e, T, { text = 'Title', dur = 2, img = null, bg = '#000000', fg = '#ffffff' } = {}) => insertAt(e, T, { kind: 'title', text, dur: r4(dur), img, bg, fg, mute: true });
  function append(e, src, a, b, max) { const n = copy(e); n.clips.push(videoClip(src, a, b, max)); return n; }
  // Markers in program time (M at the playhead).
  function addMarker(e, t, label = '') { const n = copy(e); n.markers.push({ id: uid(), t: r4(t), label }); n.markers.sort((p, q) => p.t - q.t); return n; }
  function removeMarker(e, id) { const n = copy(e); n.markers = n.markers.filter((m) => m.id !== id); return n; }
  // Is this edit just the whole video, untouched?
  function isIdentity(e, src, duration) {
    if (e.clips.length !== 1 || e.markers.length) return e.clips.length === 0;
    const c = e.clips[0];
    return c.kind === 'video' && c.src === src && c.in < 0.01 && Math.abs(c.out - duration) < 0.02 && c.speed === 1 && !c.mute && !c.fadeIn && !c.fadeOut;
  }

  // ---------- beat-cut suggestions ----------
  // Where an auto-cut would split, in program time: every bar (every N bars), every beat, on the drops or at the
  // song's sections. Cuts closer than 0.25 s to an existing cut or the ends are skipped.
  function suggest(e, analyses, mode = 'bars') {
    const { beats, bars, drops } = programBeats(e, analyses);
    const T = total(e);
    let list;
    const m = /^(\d+)bars?$/.exec(mode);
    if (mode === 'beats') list = beats;
    else if (mode === 'drops') list = drops;
    else if (mode === 'sections') list = sectionStarts(e, analyses);
    else list = bars.filter((_, i) => i % (m ? Number(m[1]) : 1) === 0);
    const have = [0, T, ...cuts(e)];
    return [...new Set(list)].filter((t) => t > 0.25 && t < T - 0.25 && have.every((h) => Math.abs(h - t) > 0.25)).sort((a, b) => a - b);
  }
  function sectionStarts(e, analyses) {
    const out = [];
    for (const x of layout(e)) {
      const c = x.clip; const a = c.kind === 'video' ? analyses[c.src] : null;
      for (const s of a?.sections || []) if (s.start > c.in && s.start < c.out) out.push(r4(x.start + (s.start - c.in) / (c.speed || 1)));
    }
    return out;
  }

  // ---------- describing ----------
  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  function describe(e) {
    return layout(e).map((x, i) => {
      const c = x.clip;
      const what = c.kind === 'video' ? `${base(c.src)} ${fmt(c.in)}–${fmt(c.out)}` : c.kind === 'freeze' ? `freeze of ${base(c.src)} at ${fmt(c.at)}` : c.kind === 'title' ? `title “${c.text}”` : 'gap (black)';
      const extra = [c.speed && c.speed !== 1 ? `${c.speed}×` : '', c.mute && c.kind === 'video' ? 'muted' : '', c.fadeIn ? `fade in ${c.fadeIn.toFixed(2)} s` : '', c.fadeOut ? `fade out ${c.fadeOut.toFixed(2)} s` : ''].filter(Boolean).join(', ');
      return `${i + 1}. ${fmt(x.start)} → ${fmt(x.end)} · ${what}${extra ? ` (${extra})` : ''}`;
    });
  }
  const sources = (e) => [...new Set(e.clips.filter((c) => c.src).map((c) => c.src))];

  // ---------- ffmpeg ----------
  // atempo keeps the pitch; one stage takes 0.5–2, so 0.25× is two stages.
  function atempo(s) {
    const out = [];
    let x = s;
    while (x < 0.5 - 1e-9) { out.push(0.5); x /= 0.5; }
    while (x > 2 + 1e-9) { out.push(2); x /= 2; }
    if (Math.abs(x - 1) > 1e-6) out.push(Number(x.toFixed(6)));
    return out.map((v) => `atempo=${v}`);
  }
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const num = (x) => String(Number(Number(x).toFixed(4)));
  // The full ffmpeg argument list that renders an edit.
  //   info: { [src]: { w, h, fps, audio: bool } }   canvas: { w, h, fps } (the program's frame: the first source's)
  //   opts: { preset (VideoData preset object or null = same size, high quality), fit, offset, range: { a, b },
  //           stills (PNG sequence), out, presetFilters (VideoData.presetFilters), codecArgs (VideoData.codecArgs) }
  // Returns { args, duration, ext, w, h }. No INPUT / OUTPUT placeholders: the paths are in the list.
  function ffmpegArgs(edit, info, canvas, opts = {}) {
    let e = normalize(edit);
    if (opts.range && opts.range.b > opts.range.a) e = slice(e, opts.range.a, opts.range.b);
    if (!e.clips.length) throw new Error('The cut is empty');
    const W = even(canvas.w); const H = even(canvas.h); const F = canvas.fps || 30;
    const args = ['-hide_banner', '-y'];
    const inputs = []; // one per source file, one per title picture
    const inputOf = (p, extra = []) => { let k = inputs.findIndex((x) => x.p === p && !x.extra.length && !extra.length); if (k < 0) { inputs.push({ p, extra }); k = inputs.length - 1; } return k; };
    const parts = [];
    const fitTo = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    const AF = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
    const pad = (d) => `tpad=stop_mode=clone:stop_duration=${num(2 / F)},trim=duration=${num(d)},setpts=PTS-STARTPTS`;
    const silence = (d) => `anullsrc=r=48000:cl=stereo,atrim=duration=${num(d)},asetpts=PTS-STARTPTS`;
    e.clips.forEach((c, i) => {
      const d = durOf(c);
      const fades = [c.fadeIn > 0 ? `fade=t=in:st=0:d=${num(c.fadeIn)}` : '', c.fadeOut > 0 ? `fade=t=out:st=${num(Math.max(0, d - c.fadeOut))}:d=${num(c.fadeOut)}` : ''].filter(Boolean);
      const afades = [c.fadeIn > 0 ? `afade=t=in:st=0:d=${num(c.fadeIn)}` : '', c.fadeOut > 0 ? `afade=t=out:st=${num(Math.max(0, d - c.fadeOut))}:d=${num(c.fadeOut)}` : ''].filter(Boolean);
      let v; let a;
      if (c.kind === 'video') {
        const k = inputOf(c.src);
        const s = c.speed || 1;
        v = `[${k}:v]trim=start=${num(c.in)}:end=${num(c.out)},setpts=(PTS-STARTPTS)/${num(s)},fps=${num(F)},${fitTo},format=yuv420p,${pad(d)}${fades.length ? `,${fades.join(',')}` : ''}[v${i}]`;
        a = !c.mute && info[c.src]?.audio
          ? `[${k}:a]atrim=start=${num(c.in)}:end=${num(c.out)},asetpts=PTS-STARTPTS${atempo(s).map((x) => `,${x}`).join('')},${AF},apad,atrim=duration=${num(d)}${afades.length ? `,${afades.join(',')}` : ''}[a${i}]`
          : `${silence(d)},${AF}[a${i}]`;
      } else if (c.kind === 'freeze') {
        const k = inputOf(c.src);
        v = `[${k}:v]trim=start=${num(c.at)},setpts=PTS-STARTPTS,trim=end_frame=1,fps=${num(F)},${fitTo},format=yuv420p,tpad=stop_mode=clone:stop_duration=${num(d + 1)},trim=duration=${num(d)},setpts=PTS-STARTPTS${fades.length ? `,${fades.join(',')}` : ''}[v${i}]`;
        a = `${silence(d)},${AF}[a${i}]`;
      } else if (c.kind === 'title' && c.img) {
        const k = inputOf(c.img, ['-loop', '1', '-framerate', num(F), '-t', num(d + 0.5)]);
        v = `[${k}:v]fps=${num(F)},${fitTo},format=yuv420p,trim=duration=${num(d)},setpts=PTS-STARTPTS${fades.length ? `,${fades.join(',')}` : ''}[v${i}]`;
        a = `${silence(d)},${AF}[a${i}]`;
      } else {
        const col = c.kind === 'title' && /^#[0-9a-f]{6}$/i.test(c.bg || '') ? `0x${c.bg.slice(1)}` : 'black';
        v = `color=c=${col}:s=${W}x${H}:r=${num(F)}:d=${num(d)},format=yuv420p,setsar=1${fades.length ? `,${fades.join(',')}` : ''}[v${i}]`;
        a = `${silence(d)},${AF}[a${i}]`;
      }
      parts.push(v, a);
    });
    for (const x of inputs) args.push(...x.extra, '-i', x.p);
    const n = e.clips.length;
    parts.push(`${e.clips.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${n}:v=1:a=1[cv][ca]`);
    const duration = total(e);
    const p = opts.preset || null;
    let w = W; let h = H; let ext = 'mp4';
    if (opts.stills) {
      // a PNG for every frame (or `opts.stills` frames per second)
      const rate = typeof opts.stills === 'number' ? opts.stills : 0;
      parts.push(`[cv]${rate ? `fps=${num(rate)}` : 'null'}[outv]`, '[ca]anullsink');
      args.push('-filter_complex', parts.join(';'), '-map', '[outv]', '-start_number', '1');
      ext = 'png';
    } else if (p && p.codec === 'gif') {
      const pf = opts.presetFilters ? opts.presetFilters(p, { w: W, h: H, fps: F }, { fit: opts.fit, offset: opts.offset }) : { vf: [], w: W, h: H };
      w = pf.w; h = pf.h;
      const chain = [...pf.vf.filter((f) => !f.startsWith('fps')), `fps=${p.fps || 15}`];
      parts.push(`[cv]${chain.join(',')},split[gx][gy];[gx]palettegen=stats_mode=diff[gpal];[gy][gpal]paletteuse=dither=sierra2_4a[outv]`, '[ca]anullsink');
      args.push('-filter_complex', parts.join(';'), '-map', '[outv]', '-loop', '0');
      ext = 'gif';
    } else {
      let vf = [];
      if (p && opts.presetFilters) { const pf = opts.presetFilters(p, { w: W, h: H, fps: F }, { fit: opts.fit, offset: opts.offset }); vf = pf.vf; w = pf.w; h = pf.h; }
      parts.push(`[cv]${vf.length ? vf.join(',') : 'null'}[outv]`);
      args.push('-filter_complex', parts.join(';'), '-map', '[outv]', '-map', '[ca]');
      if (p && opts.codecArgs) { const ca = opts.codecArgs(p); args.push(...ca.args); ext = ca.ext; } else args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '256k');
    }
    if (opts.out) args.push(opts.out);
    return { args, duration, ext, w, h, inputs: inputs.map((x) => x.p) };
  }

  return {
    SPEEDS, MIN, uid, copy, fromSource, empty, normalize, videoClip, durOf, layout, total, at, programTimes, cuts, programBeats, snap,
    split, splitMany, remove, removeRange, slice, trim, trimTo, move, duplicate, setSpeed, setMute, setFade, nearestSpeed, insertAt, freeze, title, append,
    addMarker, removeMarker, isIdentity, suggest, describe, sources, atempo, ffmpegArgs, fmt,
  };
})();
if (typeof module !== 'undefined') module.exports = CutData;
