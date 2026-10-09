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
    if (out.tracks) {
      out.tracks = out.tracks.filter((k) => k && TRACK_TYPES.includes(k.type)).map((k) => ({ ...k, id: k.id || uid(), items: (k.items || []).filter((x) => x && Number.isFinite(x.start) && itemDur(x) > 0.001).map((x) => ({ speed: 1, fadeIn: 0, fadeOut: 0, ...x, id: x.id || uid() })) }));
      if (!out.tracks.length) delete out.tracks;
    }
    return out;
  }

  // ---------- time ----------
  // Media clips (video / audio) last (out − in) / speed; stills, titles, gaps, freezes and colors last `dur`.
  const MEDIA = new Set(['video', 'audio']);
  const TRACK_TYPES = ['video', 'audio', 'text'];
  const durOf = (c) => (MEDIA.has(c.kind) ? Math.max(0, (c.out - c.in) / (c.speed || 1)) : Math.max(0, c.dur || 0));
  // A transition into clip i overlaps the end of clip i − 1 (like ffmpeg's xfade): the edit gets shorter by its length.
  // The length is kept under 90 % of both clips.
  function transDur(e, i) {
    const c = e.clips[i]; const p = e.clips[i - 1];
    if (!c?.trans || !p || !(c.trans.dur > 0) || c.trans.type === 'cut') return 0;
    return Math.max(0, Math.min(c.trans.dur, durOf(p) * 0.9, durOf(c) * 0.9));
  }
  // [{ clip, i, start, end, td }] in program time (td: the transition into the clip, overlapping the one before)
  function layout(e) {
    let t = 0;
    return e.clips.map((clip, i) => { const td = i ? transDur(e, i) : 0; const s = t - td; t = s + durOf(clip); return { clip, i, start: s, end: t, td }; });
  }
  const mainTotal = (e) => { const L = layout(e); return L.length ? L[L.length - 1].end : 0; };
  // The whole program: the main track, or a later item on another track.
  const total = (e) => Math.max(mainTotal(e), ...(e.tracks || []).flatMap((k) => k.items.map((x) => x.start + itemDur(x))), 0);
  // The clip under a program time (the last one at the very end) and the source time there.
  function at(e, T) {
    const L = layout(e);
    if (!L.length) return null;
    let k = L.findIndex((x) => T < x.end - 1e-9);
    if (k < 0) k = L.length - 1;
    const x = L[k];
    const local = clamp(T - x.start, 0, x.end - x.start);
    const src = x.clip.kind === 'video' ? srcAt(x.clip, local) : x.clip.kind === 'freeze' ? x.clip.at : null;
    return { ...x, local, srcTime: src };
  }
  // Program times where a source time of `src` shows (one per clip that holds it).
  function programTimes(e, src, t) {
    return layout(e).filter((x) => x.clip.kind === 'video' && x.clip.src === src && t >= x.clip.in - 1e-6 && t <= x.clip.out + 1e-6).map((x) => x.start + (t - x.clip.in) / (x.clip.speed || 1));
  }
  // Source time inside a media clip `local` program seconds after its start (reverse plays out → in).
  const srcAt = (c, local) => (c.reverse ? c.out - local * (c.speed || 1) : c.in + local * (c.speed || 1));
  // Cut points (where one clip ends and the next starts), without 0 and the end. A transition's cut is its middle.
  const cuts = (e) => { const L = layout(e); return L.slice(1).map((x) => x.start + x.td / 2); };
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
    if (c.kind === 'video' && c.reverse) { a.in = r4(x.srcTime); b.out = r4(x.srcTime); } else if (c.kind === 'video') { a.out = r4(x.srcTime); b.in = r4(x.srcTime); } else { a.dur = r4(T - x.start); b.dur = r4(x.end - T); }
    a.fadeOut = 0; b.fadeIn = 0; delete b.trans;
    if (c.keys) { a.keys = splitKeys(c.keys, 0, T - x.start); b.keys = splitKeys(c.keys, T - x.start, x.end - x.start); }
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
  function describe(e, { tc = fmt } = {}) {
    return layout(e).map((x, i) => {
      const c = x.clip;
      const what = c.kind === 'video' ? `${base(c.src)} ${fmt(c.in)}–${fmt(c.out)}` : c.kind === 'freeze' ? `freeze of ${base(c.src)} at ${fmt(c.at)}` : c.kind === 'title' ? `title “${c.text}”` : c.kind === 'image' ? `still ${base(c.src)}` : c.kind === 'color' ? `color ${c.fill || ''}` : `gap (black)${c.slot ? ` · slot ${c.slot}` : ''}`;
      const plain = [c.speed && c.speed !== 1 ? `${c.speed}×` : '', c.mute && c.kind === 'video' ? 'muted' : '', c.fadeIn ? `fade in ${c.fadeIn.toFixed(2)} s` : '', c.fadeOut ? `fade out ${c.fadeOut.toFixed(2)} s` : ''].filter(Boolean).join(', ');
      const rich = [x.td ? `${c.trans.type} ${x.td.toFixed(2)} s in` : '', c.reverse ? 'reversed' : '', c.color ? `look ${c.color.look || 'custom'}` : '', c.keys ? `keys ${Object.entries(c.keys).map(([k, v]) => `${k}×${v.length}`).join(' ')}` : '', c.scale != null && c.scale !== 1 ? `scale ${c.scale}` : '', c.opacity != null && c.opacity !== 1 ? `opacity ${c.opacity}` : ''].filter(Boolean).join(', ');
      const extra = [plain, rich].filter(Boolean).join(', ');
      return `${i + 1}. ${tc(x.start)} → ${tc(x.end)} · ${what}${extra ? ` (${extra})` : ''}`;
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

  // ---------- tracks (overlay video, audio, text) ----------
  // edit.tracks: [{ id, type: 'video' | 'audio' | 'text', name, mute, hide, lock, items: [item] }]. Video tracks
  // stack above the main track in order (V2 first), text tracks above all video, audio tracks mix under everything.
  // An item sits at a program time: { id, kind: 'video' | 'image' | 'audio' | 'title' | 'color', start, src, in, out,
  // max, dur (stills / titles / colors), speed, reverse, mute, volume, fadeIn, fadeOut, opacity, x, y, scale,
  // rotate, blend, keys, color, text, style, anim, out… }.
  const itemDur = (x) => durOf(x);
  const itemEnd = (x) => x.start + itemDur(x);
  const tracksOf = (e, type) => (e.tracks || []).filter((k) => !type || k.type === type);
  function trackName(e, type) {
    const n = tracksOf(e, type).length + (type === 'video' ? 2 : 1);
    return `${type === 'video' ? 'V' : type === 'audio' ? 'A' : 'T'}${n}`;
  }
  function addTrack(e, type = 'video', name) {
    if (!TRACK_TYPES.includes(type)) return e;
    const n = copy(e);
    n.tracks = n.tracks || [];
    n.tracks.push({ id: uid(), type, name: name || trackName(e, type), mute: false, hide: false, lock: false, items: [] });
    return n;
  }
  function removeTrack(e, id) { const n = copy(e); n.tracks = (n.tracks || []).filter((k) => k.id !== id); if (!n.tracks.length) delete n.tracks; return n; }
  function patchTrack(e, id, patch0) { const n = copy(e); const k = (n.tracks || []).find((x) => x.id === id); if (k) Object.assign(k, patch0); return n; }
  // The track to put an item of `kind` on (the first one of the right type with room at start..end, else a new one).
  function trackFor(e, kind, start, end, wanted) {
    const type = kind === 'audio' ? 'audio' : kind === 'title' ? 'text' : 'video';
    const list = tracksOf(e, type).filter((k) => !k.lock);
    const fits = (k) => k.items.every((x) => itemEnd(x) <= start + 1e-4 || x.start >= end - 1e-4);
    if (wanted) { const k = list.find((x) => x.id === wanted || String(x.name).toLowerCase() === String(wanted).toLowerCase()); if (k) return { e, id: k.id }; }
    const k = list.find(fits);
    if (k) return { e, id: k.id };
    const n = addTrack(e, type);
    return { e: n, id: n.tracks[n.tracks.length - 1].id };
  }
  // Put an item on a track (a free one of the right type unless `track` names one); returns the new edit, whose
  // `lastItem` is the new item's id.
  function addItem(e, item, { track } = {}) {
    const it = { speed: 1, fadeIn: 0, fadeOut: 0, ...item, id: uid(), start: r4(Math.max(0, item.start || 0)) };
    const { e: e2, id } = trackFor(e, it.kind, it.start, it.start + itemDur(it), track);
    const n = copy(e2);
    const k = n.tracks.find((x) => x.id === id);
    k.items.push(it); k.items.sort((a, b) => a.start - b.start);
    n.lastItem = it.id;
    return n;
  }
  // Where an id lives: { where: 'clip', clip, i } (main track) or { where: 'item', clip, track }.
  function find(e, id) {
    const i = e.clips.findIndex((c) => c.id === id);
    if (i >= 0) return { where: 'clip', clip: e.clips[i], i };
    for (const k of e.tracks || []) { const x = k.items.find((y) => y.id === id); if (x) return { where: 'item', clip: x, track: k }; }
    return null;
  }
  // Patch clips or items by id (any track).
  function patchAny(e, ids, fn) {
    const set = new Set([].concat(ids));
    const n = copy(e);
    for (const c of n.clips) if (set.has(c.id)) fn(c, null);
    for (const k of n.tracks || []) for (const x of k.items) if (set.has(x.id)) fn(x, k);
    return n;
  }
  function removeItems(e, ids) { const set = new Set([].concat(ids)); const n = copy(e); for (const k of n.tracks || []) k.items = k.items.filter((x) => !set.has(x.id)); return n; }
  // Move an item to a program time (and optionally another track of the same type).
  function moveItem(e, id, start, trackId) {
    const f = find(e, id);
    if (f?.where !== 'item') return e;
    const n = copy(e);
    const from = n.tracks.find((k) => k.id === f.track.id);
    const it = from.items.find((x) => x.id === id);
    it.start = r4(Math.max(0, start));
    if (trackId && trackId !== from.id) {
      const to = n.tracks.find((k) => k.id === trackId);
      if (to && to.type === from.type) { from.items = from.items.filter((x) => x.id !== id); to.items.push(it); to.items.sort((a, b) => a.start - b.start); }
    }
    from.items.sort((a, b) => a.start - b.start);
    return n;
  }
  // Trim an item's edge to program time T (media: the source range follows; stills: the length).
  function trimItem(e, id, edge, T) {
    return patchAny(e, id, (x) => {
      const end = itemEnd(x);
      if (MEDIA.has(x.kind)) {
        const s = x.speed || 1;
        if (edge === 'in') { const d = clamp(T, x.start - x.in / s, end - MIN) - x.start; x.in = r4(x.in + d * s); x.start = r4(x.start + d); } else { const d = clamp(T, x.start + MIN, x.start + ((x.max || Infinity) - x.in) / s) - end; x.out = r4(x.out + d * s); }
      } else if (edge === 'in') { const t = clamp(T, 0, end - MIN); x.dur = r4(end - t); x.start = r4(t); } else x.dur = r4(Math.max(MIN, T - x.start));
    });
  }
  // Split items under T (on every unlocked track, or only `onlyIds`) into two.
  function splitItems(e, T, onlyIds = null) {
    const n = copy(e);
    for (const k of n.tracks || []) {
      if (k.lock) continue;
      const out = [];
      for (const x of k.items) {
        const end = itemEnd(x);
        if ((onlyIds && !onlyIds.includes(x.id)) || T - x.start < MIN || end - T < MIN) { out.push(x); continue; }
        const local = T - x.start;
        const a = { ...x, id: uid(), fadeOut: 0 }; const b = { ...x, id: uid(), fadeIn: 0, start: r4(T) };
        if (MEDIA.has(x.kind)) { const st = srcAt(x, local); if (x.reverse) { a.in = r4(st); b.out = r4(st); } else { a.out = r4(st); b.in = r4(st); } } else { a.dur = r4(local); b.dur = r4(end - T); }
        if (x.keys) { a.keys = splitKeys(x.keys, 0, local); b.keys = splitKeys(x.keys, local, end - x.start); }
        out.push(a, b);
      }
      k.items = out;
    }
    return n;
  }
  // Split everything under T: the main track and every track (Shift+S).
  const splitAll = (e, T) => splitItems(split(e, T), T);

  // ---------- NLE trims ----------
  // Roll: move the cut between clip i − 1 and i by delta seconds (one gets longer, the other shorter, total unchanged).
  function roll(e, i, delta) {
    const a = e.clips[i - 1]; const b = e.clips[i];
    if (!a || !b || !delta) return e;
    const lim = (c, d, edge) => {
      if (c.kind !== 'video') return edge === 'out' ? Math.max(d, -(durOf(c) - MIN)) : Math.min(d, durOf(c) - MIN);
      const s = c.speed || 1;
      if (edge === 'out') return clamp(d, -(c.out - c.in - MIN * s) / s, ((c.max || Infinity) - c.out) / s);
      return clamp(d, -c.in / s, (c.out - c.in - MIN * s) / s);
    };
    const d = lim(b, lim(a, delta, 'out'), 'in');
    if (Math.abs(d) < 1e-6) return e;
    const n = copy(e);
    const A = n.clips[i - 1]; const B = n.clips[i];
    if (A.kind === 'video') A.out = r4(A.out + d * (A.speed || 1)); else A.dur = r4(A.dur + d);
    if (B.kind === 'video') B.in = r4(B.in + d * (B.speed || 1)); else B.dur = r4(B.dur - d);
    return n;
  }
  // Slip: same place and length, a different part of the source (delta seconds of program time).
  function slip(e, id, delta) {
    return patchAny(e, id, (c) => {
      if (!MEDIA.has(c.kind)) return;
      const s = c.speed || 1; const len = c.out - c.in;
      const nin = clamp(c.in + delta * s, 0, Math.max(0, (c.max || Infinity) - len));
      c.in = r4(nin); c.out = r4(nin + len);
    });
  }
  // Slide: the clip keeps its content and moves along the main track; its neighbours trim to make room.
  function slide(e, id, delta) {
    const i = indexOf(e, id);
    if (i <= 0 || i >= e.clips.length - 1 || !delta) return e;
    const a = e.clips[i - 1]; const c = e.clips[i + 1];
    // how far the clip can go: the clip before can't shrink below MIN (or grow past its media), same for the one after
    const room = (x, edge, d) => {
      if (x.kind !== 'video') return edge === 'out' ? Math.max(d, -(durOf(x) - MIN)) : Math.min(d, durOf(x) - MIN);
      const s = x.speed || 1;
      if (edge === 'out') return clamp(d, -(x.out - x.in - MIN * s) / s, ((x.max || Infinity) - x.out) / s);
      return clamp(d, -x.in / s, (x.out - x.in - MIN * s) / s);
    };
    const d = room(c, 'in', room(a, 'out', delta));
    if (Math.abs(d) < 1e-6) return e;
    const n = copy(e);
    const A = n.clips[i - 1]; const Cn = n.clips[i + 1];
    if (A.kind === 'video') A.out = r4(A.out + d * (A.speed || 1)); else A.dur = r4(A.dur + d);
    if (Cn.kind === 'video') Cn.in = r4(Cn.in + d * (Cn.speed || 1)); else Cn.dur = r4(Cn.dur - d);
    return n;
  }
  // Overwrite: the clip replaces whatever is on the main track from T for its length (no ripple).
  function overwrite(e, T, clip) {
    const d = durOf(clip);
    const T0 = mainTotal(e);
    let n = e;
    if (T > T0 + 1e-3) { n = copy(e); n.clips.push({ id: uid(), kind: 'gap', dur: r4(T - T0) }); }
    const end = mainTotal(n);
    if (T < end - 1e-3) n = removeRange(n, T, Math.min(end, T + d), { ripple: true });
    return insertAt(n, T, clip);
  }
  // Lift / extract a range: lift leaves a gap, extract closes it.
  const lift = (e, a, b) => removeRange(e, a, b, { ripple: false });
  const extract = (e, a, b) => removeRange(e, a, b, { ripple: true });
  // Put a clip in a gap (a template slot): it takes the gap's place (a longer clip is trimmed to the slot).
  function fillGap(e, gapId, clip) {
    const i = indexOf(e, gapId);
    if (i < 0 || e.clips[i].kind !== 'gap') return e;
    const n = copy(e); const g = n.clips[i];
    const c = { fadeIn: 0, fadeOut: 0, speed: 1, mute: false, ...clip, id: uid() };
    if (g.trans) c.trans = g.trans;
    if (c.kind === 'video') { const want = g.dur * (c.speed || 1); if (c.out - c.in > want) c.out = r4(c.in + want); } else c.dur = g.dur;
    n.clips.splice(i, 1, c);
    const rest = r4(g.dur - durOf(c));
    if (rest > MIN) n.clips.splice(i + 1, 0, { id: uid(), kind: 'gap', dur: rest });
    return n;
  }

  // ---------- transitions ----------
  // The transition into a clip (from the clip before it): { type, dur }; type 'cut' or dur 0 removes it.
  const setTrans = (e, ids, type, dur = 0.5) => patch(e, ids, (c) => { if (!type || type === 'cut' || !(dur > 0)) delete c.trans; else c.trans = { type, dur: r4(dur) }; });
  // On every cut of the edit.
  const transAll = (e, type, dur) => setTrans(e, e.clips.slice(1).map((c) => c.id), type, dur);

  // ---------- keyframes ----------
  // clip.keys = { prop: [{ t, v, ease }] } with t in seconds from the clip's start (program time).
  const KEY_PROPS = ['opacity', 'x', 'y', 'scale', 'rotate', 'volume'];
  const KEY_DEF = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, volume: 1 };
  function setKey(e, id, prop, t, v, ease = 'ease') {
    return patchAny(e, id, (c) => {
      c.keys = c.keys || {};
      const list = (c.keys[prop] || []).filter((k) => Math.abs(k.t - t) > 1e-3);
      list.push({ t: r4(Math.max(0, t)), v: Number(v), ease });
      list.sort((a, b) => a.t - b.t);
      c.keys[prop] = list;
    });
  }
  // One key (at t) or all keys of a property (t null).
  function removeKey(e, id, prop, t) {
    return patchAny(e, id, (c) => {
      if (!c.keys?.[prop]) return;
      c.keys[prop] = t == null ? [] : c.keys[prop].filter((k) => Math.abs(k.t - t) > 1e-3);
      if (!c.keys[prop].length) delete c.keys[prop];
      if (!Object.keys(c.keys).length) delete c.keys;
    });
  }
  // Keys of one part of a split clip, re-timed to it (a key at each edge keeps the curve where it was).
  function splitKeys(keys, a, b) {
    const out = {};
    for (const [prop, list] of Object.entries(keys || {})) {
      if (!list?.length) continue;
      const inner = list.filter((k) => k.t > a + 1e-4 && k.t < b - 1e-4).map((k) => ({ ...k, t: r4(k.t - a) }));
      const ea = list.filter((k) => k.t <= a).pop()?.ease || list[0].ease || 'ease';
      out[prop] = [{ t: 0, v: r4(keyAt(list, a)), ease: ea }, ...inner, { t: r4(b - a), v: r4(keyAt(list, b)), ease: 'ease' }];
    }
    return out;
  }
  // The value of a key list at t (with the easing curves when EditFX is loaded, else straight lines).
  function keyAt(list, t) {
    if (typeof EditFX !== 'undefined') return EditFX.keyValue(list, t, list[0]?.v);
    if (t <= list[0].t) return list[0].v;
    for (let i = 0; i < list.length - 1; i += 1) if (t <= list[i + 1].t) { const p = (t - list[i].t) / Math.max(1e-9, list[i + 1].t - list[i].t); return list[i].v + (list[i + 1].v - list[i].v) * p; }
    return list[list.length - 1].v;
  }
  // A clip's property at local time t (keys first, then its own value, then the default).
  function propAt(c, prop, t) {
    const list = c.keys?.[prop];
    if (list?.length) return keyAt(list, t);
    return c[prop] ?? KEY_DEF[prop];
  }

  // ---------- speed ramps + reverse ----------
  // A ramp: the clip becomes steps with the preset's speeds (each step covers an equal part of the source).
  function ramp(e, id, speeds) {
    const i = indexOf(e, id);
    if (i < 0 || e.clips[i].kind !== 'video' || !speeds?.length) return e;
    const n = copy(e); const c = n.clips[i];
    const len = c.out - c.in; const k = speeds.length;
    const parts = speeds.map((sp, j) => {
      const a = c.reverse ? c.out - (len * (j + 1)) / k : c.in + (len * j) / k;
      const b = c.reverse ? c.out - (len * j) / k : c.in + (len * (j + 1)) / k;
      const p = { ...c, id: uid(), in: r4(a), out: r4(b), speed: clamp(sp, 0.1, 8), fadeIn: j ? 0 : c.fadeIn, fadeOut: j === k - 1 ? c.fadeOut : 0, ramp: c.ramp || c.id };
      if (j) delete p.trans;
      delete p.keys;
      return p;
    });
    n.clips.splice(i, 1, ...parts);
    return n;
  }
  const setReverse = (e, ids, on) => patchAny(e, ids, (c) => { if (MEDIA.has(c.kind)) c.reverse = on ?? !c.reverse; });

  // ---------- markers ----------
  const patchMarker = (e, id, p) => { const n = copy(e); const m = n.markers.find((x) => x.id === id); if (m) Object.assign(m, p); return n; };

  // ---------- sequence ----------
  // edit.seq = { w, h, fps, name } (the program's frame); without it the edit takes its first video's frame.
  const setSeq = (e, seq) => { const n = copy(e); if (seq) n.seq = { ...(e.seq || {}), ...seq }; else delete n.seq; return n; };
  // Is the edit more than plain cuts on one track (layers, transitions, keyframes, color, a set frame…)? Those play
  // through the compositor (tools/video-comp.js) and render with tools/cut-ffmpeg.js.
  function isRich(e) {
    if (!e) return false;
    if ((e.tracks || []).some((k) => k.items.length)) return true;
    if (e.seq) return true;
    return e.clips.some((c) => c.trans || c.keys || c.color || c.reverse || c.kind === 'image' || c.kind === 'color' || (c.kind === 'title' && (c.style || c.anim)) || (c.opacity != null && c.opacity !== 1) || (c.scale != null && c.scale !== 1) || c.x || c.y || c.rotate || (c.blend && c.blend !== 'normal') || (c.volume != null && c.volume !== 1));
  }
  // Everything visible at program time T, bottom first: [{ clip, where: 'main' | 'item', start, end, track }].
  function stackAt(e, T) {
    const out = [];
    for (const x of layout(e)) if (T >= x.start - 1e-9 && T < x.end - 1e-9) out.push({ clip: x.clip, where: 'main', start: x.start, end: x.end, i: x.i, td: x.td });
    for (const k of tracksOf(e, 'video').concat(tracksOf(e, 'text'))) {
      if (k.hide) continue;
      for (const x of k.items) if (T >= x.start - 1e-9 && T < itemEnd(x) - 1e-9) out.push({ clip: x, where: 'item', track: k, start: x.start, end: itemEnd(x) });
    }
    return out;
  }
  // Frames of the program: frame n covers [n / fps, (n + 1) / fps); stepping seeks to its middle.
  const frameOf = (T, fps) => Math.floor(T * fps + 1e-4);
  const frameTime = (n, fps) => (Math.max(0, n) + 0.5) / fps;

  // ---------- describing (tracks) ----------
  function describeAll(e, { tc = fmt } = {}) {
    const lines = describe(e, { tc });
    for (const k of e.tracks || []) {
      lines.push(`${k.name} (${k.type}${k.mute ? ', muted' : ''}${k.hide ? ', hidden' : ''}${k.lock ? ', locked' : ''}):${k.items.length ? '' : ' empty'}`);
      k.items.forEach((x, j) => {
        const what = x.kind === 'title' ? `title “${String(x.text || '').replace(/\n/g, ' / ')}”${x.style ? ` [${x.style}]` : ''}${x.lower ? ` [lower third ${x.lower}]` : ''}${x.anim ? ` in:${x.anim}` : ''}${x.out ? ` out:${x.out}` : ''}` : x.kind === 'color' ? `color ${x.fill || ''}` : `${x.kind} ${base(x.src)}${MEDIA.has(x.kind) ? ` ${fmt(x.in)}–${fmt(x.out)}` : ''}`;
        lines.push(`  ${k.name}.${j + 1} ${tc(x.start)} → ${tc(itemEnd(x))} · ${what}${extras(x)}`);
      });
    }
    return lines;
  }
  function extras(c) {
    return [c.speed && c.speed !== 1 ? `${c.speed}×` : '', c.reverse ? 'reversed' : '', c.mute && MEDIA.has(c.kind) ? 'muted' : '', c.volume != null && c.volume !== 1 ? `vol ${c.volume}` : '',
      c.opacity != null && c.opacity !== 1 ? `opacity ${c.opacity}` : '', c.scale != null && c.scale !== 1 ? `scale ${c.scale}` : '', c.x || c.y ? `pos ${c.x || 0},${c.y || 0}` : '', c.rotate ? `rot ${c.rotate}°` : '',
      c.blend && c.blend !== 'normal' ? `blend ${c.blend}` : '', c.color ? `look ${c.color.look || 'custom'}` : '', c.keys ? `keys ${Object.entries(c.keys).map(([k, v]) => `${k}×${v.length}`).join(' ')}` : '',
      c.fadeIn ? `fade in ${c.fadeIn.toFixed(2)} s` : '', c.fadeOut ? `fade out ${c.fadeOut.toFixed(2)} s` : ''].filter(Boolean).map((s) => ` (${s})`).join('');
  }

  return {
    SPEEDS, MIN, uid, copy, fromSource, empty, normalize, videoClip, durOf, layout, total, at, programTimes, cuts, programBeats, snap,
    mainTotal, transDur, srcAt, TRACK_TYPES, itemDur, itemEnd, tracksOf, addTrack, removeTrack, patchTrack, trackFor, addItem, find, patchAny, removeItems, moveItem, trimItem, splitItems, splitAll,
    roll, slip, slide, overwrite, lift, extract, fillGap, setTrans, transAll, KEY_PROPS, KEY_DEF, setKey, removeKey, splitKeys, keyAt, propAt, ramp, setReverse, patchMarker, setSeq, isRich, stackAt, frameOf, frameTime, describeAll,
    split, splitMany, remove, removeRange, slice, trim, trimTo, move, duplicate, setSpeed, setMute, setFade, nearestSpeed, insertAt, freeze, title, append,
    addMarker, removeMarker, isIdentity, suggest, describe, sources, atempo, ffmpegArgs, fmt,
  };
})();
if (typeof module !== 'undefined') module.exports = CutData;
