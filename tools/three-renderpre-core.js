// One-click render presets (round 131, renderpre131), the pure part: no DOM, loads in Node (dev/checks/renderpre131.js
// reads it in the app; docs/upgrades/renderpre131.md). tools/three-renderpre.js puts the chips at the top of the Lab's
// Render card (tools/three-export.js panel()) and runs the ticked ones; this file decides what each preset means.
//   PRESETS                    the five built-in presets (Vertical reel, Seamless loop, Full song, 4K master, Square post)
//   reelWindow(analysis, o)    the song's best 15–30 s: its (first) drop with the build-up before it, on whole bars
//   loopWindow(ctx)            the scene's loop: a ∞ Make it loop loop, else the A–B loop, else 2 bars at the playhead
//   fill(id, ctx)              → { id, name, fields (the card's format / size / custom / fps / quality), length, extra
//                                (more files the preset makes: the loop's small webm), note (what the length is) }
//   jobs(filled, fields, o)    → LabExport.render options, one per file (the main one with the card's fields)
//   tiny(jobs, t)              the same jobs, small and short (the check renders 1 s at 160 px, never a full song)
//   stem(project, preset, d)   "<project> – <preset> – 2026-11-06" (the file's name without its extension)
//   saved(list) / makeSaved()  a project's own presets (p.prefs.renderPresets): kept tidy, at most 12
// (round 142, renderrange142) "What to render" (the chips at the top of the card: docs/upgrades/renderrange142.md)
//   RANGES                     Full song · Loop · Sequence · Custom
//   loopOf(ctx)                the timeline's loop { a, b, perfect, on } (its A–B loop, else ∞ Make it loop's), or null
//   offered(ctx)               the chips this scene offers (Loop: a loop is set; Sequence: the scene is in one)
//   lengthFor(kind, ctx, cus)  a range → a length (the presets' shape: { range } / { whole } / { at, secs }), or null
//   kindOf(len, ctx)           which chip a length is (a preset's own pick shows on the chips)
//   firstKind(ctx, saved)      the chip the card opens on: a loop that is on (unless he picked another for that very
//                              loop), else the project's remembered one, else the sequence when it is open, else Full song
//   rangeLine(kind, len, ctx)  "Your loop: 0:32 – 0:48 (16 s, 8 bars)"
//   lengthOpts(len, format)    → LabExport.render's range / at+secs (a perfect loop or GIF: a start and a length)
const RenderPreCore = (() => {
  const r3 = (x) => Math.round(Number(x) * 1000) / 1000;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (t) => { const s = Math.max(0, Number(t) || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
  const PRESETS = [
    { id: 'reel', name: 'Vertical reel', icon: '▯', tip: '9:16 · 1080×1920 · 30 fps · MP4 · the song\'s best 15–30 s: the drop with its build-up' },
    { id: 'loop', name: 'Seamless loop', icon: '∞', tip: 'The scene\'s loop (∞ Make it loop, or the A–B loop) · a perfect-loop MP4 + a small GIF-sized WebM' },
    { id: 'full', name: 'Full song', icon: '♫', tip: 'The project\'s size and frame rate · the whole song · high quality' },
    { id: 'master', name: '4K master', icon: '◆', tip: '3840×2160 · the project\'s frame rate · ProRes 4444 (or a high-bitrate MP4 when this ffmpeg has no ProRes) · the whole song' },
    { id: 'square', name: 'Square post', icon: '◻', tip: '1:1 · 1080×1080 · 15 s from the drop' },
  ];
  const get = (id) => PRESETS.find((p) => p.id === id) || null;

  // ---------- the song ----------
  function gridOf(an) {
    const g = an?.grid || {};
    const bpm = Number(g.bpm || an?.bpm) || 0;
    const bpb = Number(g.bpb || g.beatsPerBar || an?.beatsPerBar) || 4;
    return { bpm, bpb, anchor: Number(g.anchor ?? g.downbeat ?? an?.downbeatT ?? 0) || 0, bar: bpm ? (bpb * 60) / bpm : 2 };
  }
  // the drop: the analysis's first drop, else the first loud section after the start, else the loudest stretch
  function dropOf(an) {
    const secs = Array.isArray(an?.sections) ? an.sections : [];
    if (Array.isArray(an?.drops) && an.drops.length) return Number(an.drops[0]);
    const s = secs.find((x, i) => i > 0 && (x.label === 'Drop' || x.energy === 'loud'));
    if (s) return Number(s.start);
    const L = an?.level; const fps = an?.fps || 30;
    if (L?.length > fps * 4) { let best = 0; let bi = 0; const w = Math.round(fps * 4); let sum = 0; for (let i = 0; i < L.length; i += 1) { sum += L[i]; if (i >= w) sum -= L[i - w]; if (i >= w - 1 && sum > best) { best = sum; bi = i - w + 1; } } return bi / fps; }
    return null;
  }
  // the song's best 15–30 s for a reel: the drop with its build-up, on whole bars. A third of it (≤ the build's own
  // length, at least a bar) leads into the drop; the rest is the drop. A song shorter than min: the whole song.
  function reelWindow(an, { min = 15, max = 30, target = 22 } = {}) {
    const dur = Number(an?.duration) || 0;
    if (!dur) return null;
    if (dur <= min) return { a: 0, b: r3(dur), drop: null, lead: 0, why: 'the whole song (it is short)' };
    const g = gridOf(an);
    const snap = (t) => r3(g.anchor + Math.round((t - g.anchor) / g.bar) * g.bar);
    const d0 = dropOf(an);
    if (d0 == null) { const a = r3(Math.max(0, Math.min(dur - target, dur * 0.3))); return { a, b: r3(Math.min(dur, a + target)), drop: null, lead: 0, why: 'no drop found: 22 s from a third in' }; }
    const d = clamp(snap(d0), 0, dur);
    const secs = Array.isArray(an?.sections) ? an.sections : [];
    const before = secs.filter((s) => Number(s.start) < d - 0.05).pop();
    const build = before ? d - Number(before.start) : d;
    let bars = Math.round(target / g.bar);
    while (bars * g.bar < min - 1e-6) bars += 1;
    while (bars > 1 && bars * g.bar > max + 1e-6) bars -= 1;
    const leadBars = Math.max(1, Math.min(Math.floor(build / g.bar + 1e-6) || 1, Math.round((bars * g.bar * 0.35) / g.bar)));
    let a = d - leadBars * g.bar; let b = a + bars * g.bar;
    if (a < 0) { b -= a; a = 0; }
    if (b > dur) { a = Math.max(0, a - (b - dur)); b = dur; }
    return { a: r3(a), b: r3(b), drop: r3(d), lead: r3(d - a), why: `the drop at ${fmt(d)} with ${r3(d - a)} s of build-up` };
  }
  // the scene's loop: ∞ Make it loop's (on), the A–B loop, else 2 bars from the bar the playhead is in (4 s without a song)
  function loopWindow({ perfect = null, ab = null, grid = null, playhead = 0 } = {}) {
    if (perfect?.on && perfect.len > 0) return { at: r3(perfect.a || 0), secs: r3(perfect.len), perfect: true, why: `the ∞ loop (${r3(perfect.len)} s)` };
    if (ab && ab.b > ab.a) return { at: r3(ab.a), secs: r3(ab.b - ab.a), why: `the A–B loop (${r3(ab.b - ab.a)} s)` };
    if (grid?.bpm) { const g = gridOf({ grid }); const at = Math.max(0, g.anchor + Math.floor((playhead - g.anchor) / g.bar + 1e-6) * g.bar); return { at: r3(at), secs: r3(2 * g.bar), why: `2 bars at ${g.bpm} BPM` }; }
    return { at: r3(playhead), secs: 4, why: '4 s (no song, no loop)' };
  }

  // ---------- a preset → the card's fields ----------
  // ctx: { frame { w, h } (the Lab's / the project's frame), fps (the project's, or null), analysis (the song's), duration
  //        (the song's or the scene's length), playhead, perfect, ab, grid, prores (this ffmpeg has a ProRes encoder),
  //        source ('scene' | 'seq'), seqDur }
  function fill(id, ctx = {}) {
    const p = get(id);
    if (!p) return null;
    const fps = Number(ctx.fps) || 30;
    const dur = Number(ctx.duration) || Number(ctx.analysis?.duration) || 0;
    const seq = ctx.source === 'seq';
    const whole = () => (seq ? { whole: true, why: 'the whole sequence' } : dur ? { range: { a: 0, b: r3(dur) }, why: `the whole song (${fmt(dur)})` } : { at: 0, secs: 30, why: '30 s (no song)' });
    const fromDrop = (secs) => { const w = reelWindow(ctx.analysis); if (!w) return { at: r3(ctx.playhead || 0), secs, why: `${secs} s from the playhead (no song)` }; const a = w.drop != null ? w.drop : w.a; const b = Math.min(dur || a + secs, a + secs); return { range: { a: r3(Math.max(0, b - secs)), b: r3(b) }, why: `${secs} s from the drop at ${fmt(a)}` }; };
    const o = { id, name: p.name, fields: null, length: null, extra: [], note: '' };
    if (id === 'reel') {
      o.fields = { format: 'mp4', size: 'custom', custom: '1080x1920', fps: 30, quality: 'high' };
      const w = reelWindow(ctx.analysis);
      o.length = w ? { range: { a: w.a, b: w.b }, why: w.why } : { at: r3(ctx.playhead || 0), secs: 20, why: '20 s from the playhead (no song)' };
    } else if (id === 'loop') {
      o.fields = { format: 'loop', size: 'frame', custom: '', fps, quality: 'high' };
      o.length = loopWindow(ctx);
      const f = ctx.frame || { w: 1920, h: 1080 };
      const k = 480 / Math.max(f.w, f.h);
      o.extra = [{ format: 'webm', size: { w: Math.max(16, Math.round((f.w * k) / 2) * 2), h: Math.max(16, Math.round((f.h * k) / 2) * 2) }, quality: 'draft', alpha: false, label: 'small WebM' }];
    } else if (id === 'full') {
      o.fields = { format: 'mp4', size: 'frame', custom: '', fps, quality: 'high' };
      o.length = whole();
    } else if (id === 'master') {
      const f = ctx.frame || { w: 1920, h: 1080 };
      o.fields = { format: ctx.prores ? 'prores' : 'mp4', size: 'custom', custom: f.h > f.w ? '2160x3840' : '3840x2160', fps, quality: ctx.prores ? 'high' : 'best' };
      o.length = whole();
    } else if (id === 'square') {
      o.fields = { format: 'mp4', size: 'custom', custom: '1080x1080', fps: Number(ctx.fps) || 30, quality: 'high' };
      o.length = seq ? { at: 0, secs: 15, why: 'the first 15 s' } : fromDrop(15);
    }
    o.note = o.length?.why || '';
    return o;
  }
  // a project's own preset: the built-in one it started from (its length is worked out again from the song), with
  // the card's fields as they were saved
  function fillSaved(sp, ctx = {}) {
    const base = fill(sp.base || 'full', ctx) || fill('full', ctx);
    return { ...base, id: sp.id, name: sp.name, saved: true, fields: { ...base.fields, ...(sp.fields || {}) } };
  }
  // the length as a short line under the chips
  function lengthText(len) {
    if (!len) return '';
    if (len.whole) return len.why;
    if (len.range) return `${fmt(len.range.a)}–${fmt(len.range.b)} · ${r3(len.range.b - len.range.a)} s · ${len.why}`;
    return `${fmt(len.at)} + ${r3(len.secs)} s · ${len.why}`;
  }

  // ---------- the renders ----------
  const two = (v) => String(v).padStart(2, '0');
  const dateOf = (d = new Date()) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  function stem(project, preset, d = new Date()) { return safe(`${safe(project).slice(0, 60) || 'Lab'} – ${safe(preset).slice(0, 40) || 'Render'} – ${dateOf(d)}`); }
  const EXT = { mp4: 'mp4', loop: 'mp4', hevc: 'mp4', prores: 'mov', webm: 'webm', gif: 'gif', png: '', still: 'png', still16: 'png' };
  // fields: the card's (format, size ({ w, h }), fps, quality, ss, blur); o: { name (project or scene), source, date }
  function jobs(filled, fields, { name = 'Lab', source = 'scene', date = new Date(), perfect = false } = {}) {
    const len = filled.length || {};
    // (a perfect loop / GIF takes a start and a length: its cross-fade frames come after the end)
    const lengthOf = (format) => (len.whole ? {} : len.range && /^(loop|gif)$/.test(format) ? { at: len.range.a, secs: r3(len.range.b - len.range.a) } : len.range ? { range: { ...len.range } } : { at: len.at, secs: len.secs });
    const lengthOpts = lengthOf(fields.format);
    const s = stem(name, filled.name, date);
    const main = { format: fields.format, size: fields.size, fps: fields.fps, quality: fields.quality, ss: fields.ss || 1, blur: fields.blur || 1, source, ...lengthOpts, stem: s, ext: EXT[fields.format] ?? 'mp4', preset: filled.id, label: filled.name };
    if (perfect && len.perfect && fields.format === 'loop') main.perfect = true;
    const out = [main];
    for (const x of filled.extra || []) out.push({ format: x.format, size: { ...x.size }, fps: fields.fps, quality: x.quality || fields.quality, alpha: x.alpha, source, ...lengthOf(x.format), stem: s, ext: EXT[x.format] ?? x.format, preset: filled.id, label: `${filled.name} · ${x.label || x.format}` });
    return out;
  }
  // small and short (the check): every size scaled to a long side of t.long (even), every length t.secs
  function tiny(list, { long = 160, secs = 1 } = {}) {
    return list.map((j) => {
      const k = long / Math.max(j.size.w, j.size.h);
      const n = { ...j, size: { w: Math.max(16, Math.round((j.size.w * k) / 2) * 2), h: Math.max(16, Math.round((j.size.h * k) / 2) * 2) }, ss: 1, blur: 1, quality: 'draft' };
      if (n.range) n.range = { a: n.range.a, b: r3(n.range.a + secs) }; else { n.at = n.at ?? 0; n.secs = secs; delete n.range; }
      return n;
    });
  }

  // ---------- a project's own presets (p.prefs.renderPresets) ----------
  const FIELDS = ['format', 'size', 'custom', 'fps', 'quality', 'ss', 'blur'];
  function saved(list) {
    return (Array.isArray(list) ? list : []).filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string').slice(-12)
      .map((x) => ({ id: x.id, name: x.name.slice(0, 40), base: get(x.base) ? x.base : 'full', fields: Object.fromEntries(FIELDS.filter((k) => x.fields?.[k] != null).map((k) => [k, x.fields[k]])), at: Number(x.at) || 0 }));
  }
  function makeSaved(name, base, fields, now = Date.now()) {
    return { id: `my-${now.toString(36)}`, name: String(name || 'My preset').trim().slice(0, 40) || 'My preset', base: get(base) ? base : 'full', fields: Object.fromEntries(FIELDS.filter((k) => fields?.[k] != null).map((k) => [k, fields[k]])), at: now };
  }
  // ---------- what to render (round 142, renderrange142) ----------
  // ctx (the card's, see fill): ab (the timeline's A–B loop), loopOn (looping is on), perfect (∞ Make it loop's state),
  // grid, duration (the song's, else the scene's own timeline), song (a song is loaded), seq ({ key, name, secs } the
  // scene's Lab sequence, or null)
  const RANGES = [
    { id: 'full', label: '♫ Full song', tip: 'The whole song, start to end (a scene with no song: its whole timeline)' },
    { id: 'loop', label: '⟲ Loop', tip: 'Exactly your loop on the timeline, frame for frame, with its sound' },
    { id: 'seq', label: '▤ Sequence', tip: 'The Lab sequence this scene is in, whole' },
    { id: 'custom', label: '✎ Custom', tip: 'From – to, in seconds' },
  ];
  // 0:32, 0:03.75 (hundredths only when it isn't on a whole second)
  const clock = (t) => { const s = Math.max(0, Math.round((Number(t) || 0) * 100) / 100); const m = Math.floor(s / 60); const r = Math.round((s - m * 60) * 100) / 100; const frac = Math.round((r % 1) * 100); return `${m}:${String(Math.floor(r)).padStart(2, '0')}${frac ? `.${String(frac).padStart(2, '0').replace(/0$/, '')}` : ''}`; };
  const secsText = (x) => { const v = r3(x); return v >= 90 ? clock(v) : `${Math.round(v * 100) / 100} s`; };
  function loopOf(ctx = {}) {
    const ab = ctx.ab; const pf = ctx.perfect;
    if (ab && ab.b > ab.a) return { a: r3(ab.a), b: r3(ab.b), on: ctx.loopOn !== false || Boolean(pf?.on), perfect: Boolean(pf?.on && Math.abs((pf.a || 0) - ab.a) < 1e-3), fade: pf?.fade ? pf.beat || 0.5 : 0 };
    if (pf?.on && pf.len > 0) return { a: r3(pf.a || 0), b: r3((pf.a || 0) + pf.len), on: true, perfect: true, fade: pf.fade ? pf.beat || 0.5 : 0 };
    return null;
  }
  const loopKey = (L) => (L ? `${L.a}-${L.b}` : null);
  function offered(ctx = {}) { return ['full', ...(loopOf(ctx) ? ['loop'] : []), ...(ctx.seq ? ['seq'] : []), 'custom']; }
  function lengthFor(kind, ctx = {}, custom = null) {
    const dur = Number(ctx.duration) || 0;
    if (kind === 'full') return dur ? { range: { a: 0, b: r3(dur) }, full: true, why: ctx.song === false ? 'the scene\'s whole timeline' : 'the whole song' } : { at: 0, secs: 10, why: '10 s (no song, no timeline)' };
    if (kind === 'loop') { const L = loopOf(ctx); return L ? { range: { a: L.a, b: L.b }, loop: true, perfect: L.perfect, fade: L.fade, why: L.perfect ? 'your ∞ loop' : 'your loop' } : null; }
    if (kind === 'seq') return ctx.seq ? { whole: true, seq: true, why: `the whole sequence “${ctx.seq.name || 'Sequence'}”` } : null;
    if (kind === 'custom') { const c = custom && Number(custom.b) > Number(custom.a) ? custom : null; return c ? { range: { a: r3(c.a), b: r3(c.b) }, why: 'set by hand' } : null; }
    return null;
  }
  const near = (x, y) => Math.abs(x - y) < 0.02;
  function kindOf(len, ctx = {}) {
    if (!len) return 'full';
    if (len.seq || (len.whole && ctx.source === 'seq')) return 'seq';
    if (len.whole) return 'full';
    const a = len.range ? len.range.a : Number(len.at) || 0; const b = len.range ? len.range.b : a + (Number(len.secs) || 0);
    const L = loopOf(ctx);
    if (L && near(a, L.a) && near(b, L.b)) return 'loop';
    const dur = Number(ctx.duration) || 0;
    if (dur && near(a, 0) && near(b, dur)) return 'full';
    return 'custom';
  }
  // saved: the project's p.prefs.renderRange { kind, loop (the loop it was picked with), custom }
  function firstKind(ctx = {}, saved = null) {
    const can = offered(ctx); const L = loopOf(ctx);
    const kept = saved && can.includes(saved.kind) && (saved.kind !== 'custom' || saved.custom) ? saved.kind : null;
    if (L?.on && !(kept && saved.loop === loopKey(L))) return 'loop';
    if (kept) return kept;
    if (ctx.source === 'seq' && can.includes('seq')) return 'seq';
    return 'full';
  }
  function rangeLine(kind, len, ctx = {}) {
    if (!len) return '';
    if (kind === 'seq' || len.whole) return `The sequence “${ctx.seq?.name || 'Sequence'}”${ctx.seq?.secs ? `: ${secsText(ctx.seq.secs)}` : ''}`;
    const a = len.range ? len.range.a : Number(len.at) || 0; const b = len.range ? len.range.b : a + (Number(len.secs) || 0);
    const g = ctx.grid?.bpm ? gridOf({ grid: ctx.grid }) : null;
    const bars = g ? (b - a) / g.bar : 0;
    const barsText = bars > 0.99 && Math.abs(bars - Math.round(bars)) < 0.02 ? `, ${Math.round(bars)} bar${Math.round(bars) === 1 ? '' : 's'}` : '';
    const what = kind === 'loop' ? (len.perfect || loopOf(ctx)?.perfect ? 'Your ∞ loop' : 'Your loop') : kind === 'full' ? (ctx.song === false ? 'The whole timeline' : 'The whole song') : len.why === 'set by hand' ? 'From – to' : '';
    const why = kind === 'custom' && len.why && len.why !== 'set by hand' ? ` · ${len.why}` : '';
    return `${what ? `${what}: ` : ''}${clock(a)} – ${clock(b)} (${secsText(b - a)}${barsText})${why}`;
  }
  // a length → LabExport.render's options for this format (a still: none; a perfect loop / GIF: a start and a length,
  // its cross-fade frames come after the end; a range: frame-exact, T0 = a, b − a seconds of frames, the sound from a)
  function lengthOpts(len, format) {
    if (!len || len.whole) return {};
    if (/^(still|still16|glb|html|preset)$/.test(format)) return {};
    const loopFmt = /^(loop|gif)$/.test(format);
    const o = len.range && !loopFmt ? { range: { ...len.range } } : len.range ? { at: len.range.a, secs: r3(len.range.b - len.range.a) } : { at: len.at, secs: len.secs };
    if (loopFmt && len.perfect) { o.perfect = true; o.fade = len.fade || 0; }
    return o;
  }

  return { RANGES, loopOf, loopKey, offered, lengthFor, kindOf, firstKind, rangeLine, lengthOpts, clock, PRESETS, get, gridOf, dropOf, reelWindow, loopWindow, fill, fillSaved, lengthText, stem, dateOf, jobs, tiny, saved, makeSaved, EXT, fmt };
})();
if (typeof module !== 'undefined') module.exports = RenderPreCore;
