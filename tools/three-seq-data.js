// The Lab's Sequence (tools/three-seq.js): a video timeline built right in the Three.js Lab. The sequence IS an
// editor edit (CutData, tools/cut-data.js), stored with the editor's own sequences (kv video-cuts, key "seq:<name>",
// seq.lab = true), so Video Review's editor opens it for finishing and the Lab takes it back: one model, no copy.
//   main track (clips)  scenes { kind: 'scene', sketch, name, dur, in (the scene's own time at the clip's start),
//                       look (a saved slider look), vibe { palette } (a mood-board vibe), poster } · footage (CutData
//                       video clips, the labframes cut model) · title cards · gaps; transitions = clip.trans (the
//                       editor's presets, overlapping the cut like xfade)
//   tracks              "Titles" (text: the editor's title items, styles + animations) · "Overlays" (video: Lab
//                       layers / filters spanning a range { kind: 'layer', code, name }, or the editor's overlays) ·
//                       "Sound" (audio: the song { song: true } and audio clips)
// No DOM here: loads in Node for tests (module.exports at the bottom). Every operation returns a new edit.
const ThreeSeqData = (() => {
  const C = typeof CutData !== 'undefined' ? CutData : require('./cut-data.js');
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const FORMATS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
  const TRACKS = { titles: ['text', 'Titles'], overlays: ['video', 'Overlays'], sound: ['audio', 'Sound'] };
  const DEFAULT_SECS = 4; // a scene's length without a song
  const DEFAULT_BARS = 4; // …and with one
  const DEFAULT_TRANS = 'dissolve'; // the editor's cross dissolve
  const MIN = 0.1;

  // ---------- making one ----------
  const isLab = (e) => Boolean(e?.seq?.lab);
  function create({ format = '9:16', fps = 30, name = 'Sequence' } = {}) {
    const [w, h] = FORMATS[format] || FORMATS['9:16'];
    return { v: 1, clips: [], markers: [], mark: null, seq: { w, h, fps, lab: true, format: FORMATS[format] ? format : '9:16', name } };
  }
  function setFormat(e, format) {
    const wh = FORMATS[format];
    if (!wh) return e;
    return C.setSeq(e, { w: wh[0], h: wh[1], format });
  }
  const formatOf = (e) => e?.seq?.format || Object.keys(FORMATS).find((k) => FORMATS[k][0] === e?.seq?.w && FORMATS[k][1] === e?.seq?.h) || '9:16';

  // ---------- the music grid ----------
  // grid: { bpm, anchor (bar 1, s), bpb } → beats / bars in program time (the song starts at its item's start)
  const beatLen = (g) => 60 / (g?.bpm || 120);
  const barLen = (g) => beatLen(g) * (g?.bpb || 4);
  function gridTimes(g, total, { every = 'beat', offset = 0 } = {}) {
    if (!g?.bpm) return [];
    const step = every === 'bar' ? barLen(g) : beatLen(g);
    const a0 = (g.anchor || 0) + offset;
    const out = [];
    for (let t = a0 - Math.ceil(a0 / step) * step; t <= total + 1e-6 && out.length < 4000; t += step) if (t >= -1e-6) out.push(r4(Math.max(0, t)));
    return out;
  }
  const barAt = (g, n, offset = 0) => r4((g?.anchor || 0) + offset + (Math.max(1, n) - 1) * barLen(g)); // "bar 9" → seconds
  const defaultDur = (g) => (g?.bpm ? r4(DEFAULT_BARS * barLen(g)) : DEFAULT_SECS);
  const defaultTransDur = (g) => (g?.bpm ? r4(clamp(beatLen(g), 0.25, 1)) : 0.5);

  // ---------- tracks ----------
  function ensureTrack(e, role) {
    const [type, name] = TRACKS[role];
    const k = (e.tracks || []).find((x) => x.type === type && x.name === name);
    if (k) return { e, id: k.id };
    const n = C.addTrack(e, type, name);
    return { e: n, id: n.tracks[n.tracks.length - 1].id };
  }
  const trackOf = (e, role) => (e.tracks || []).find((x) => x.type === TRACKS[role][0] && x.name === TRACKS[role][1]) || null;
  function addTo(e, role, item) {
    const { e: e2, id } = ensureTrack(e, role);
    // the role's own track when it has room, else another of the same type (CutData picks)
    const k = e2.tracks.find((x) => x.id === id);
    const fits = k.items.every((x) => C.itemEnd(x) <= item.start + 1e-4 || x.start >= item.start + C.itemDur(item) - 1e-4);
    return C.addItem(e2, item, fits ? { track: id } : {});
  }

  // ---------- clips ----------
  function sceneClip({ sketch, name = 'Scene', look = null, poster = null, vibe = null } = {}, dur = DEFAULT_SECS) {
    return { id: C.uid(), kind: 'scene', sketch, name, dur: r4(Math.max(MIN, dur)), in: 0, look, vibe, poster, speed: 1, mute: true, fadeIn: 0, fadeOut: 0 };
  }
  // Where a clip dropped at program time T goes on the main track: the nearest cut (clips never get split by an add),
  // or past the end (a gap fills the space before it).
  function insertIndex(e, T) {
    const L = C.layout(e);
    if (!L.length || T == null) return L.length;
    const end = L[L.length - 1].end;
    if (T >= end - 1e-3) return L.length;
    const edges = L.map((x, i) => ({ i, t: x.start + x.td / 2 })).concat({ i: L.length, t: end });
    return edges.reduce((a, b) => (Math.abs(b.t - T) < Math.abs(a.t - T) ? b : a)).i;
  }
  // Put a clip on the main track at T (or at the end), with the default cross dissolve from the clip before. Past the
  // end it is appended (gap: true keeps the time asked for, with a gap before it: "at bar 9" from a command).
  function place(e, clip, { at = null, index = null, trans = undefined, grid = null, gap = false } = {}) {
    const n = C.copy(e);
    let i = index != null ? clamp(index, 0, n.clips.length) : insertIndex(n, at);
    const end = C.mainTotal(n);
    if (gap && index == null && at != null && at > end + 0.05 && i === n.clips.length) { n.clips.push({ id: C.uid(), kind: 'gap', dur: r4(at - end), mute: true, fadeIn: 0, fadeOut: 0, speed: 1 }); i = n.clips.length; }
    const c = { ...clip };
    const prev = n.clips[i - 1];
    if (trans === undefined) { if (prev && prev.kind !== 'gap') c.trans = { type: DEFAULT_TRANS, dur: defaultTransDur(grid) }; } else if (trans && trans.type !== 'cut') c.trans = trans; else delete c.trans;
    n.clips.splice(i, 0, c);
    // the clip that now follows keeps a transition from it
    return n;
  }
  function addScene(e, scene, { at = null, index = null, dur = null, grid = null, trans, gap = false } = {}) {
    const clip = sceneClip(scene, dur || defaultDur(grid));
    const n = place(e, clip, { at, index, grid, trans, gap });
    n.lastClip = clip.id;
    return n;
  }
  function addFootage(e, src, { duration, a = 0, b = null, at = null, index = null, mute = true, grid = null, trans, gap = false } = {}) {
    const clip = { ...C.videoClip(src, a, b ?? Math.min(duration || defaultDur(grid), a + defaultDur(grid) * 2), duration), mute };
    const n = place(e, clip, { at, index, grid, trans, gap });
    n.lastClip = clip.id;
    return n;
  }
  function addTitle(e, text = 'Title', { at = 0, dur = 2.5, style = 'bold', anim = 'fade-up', out = 'fade', lower = null } = {}) {
    return addTo(e, 'titles', { kind: 'title', start: r4(Math.max(0, at)), dur: r4(Math.max(MIN, dur)), text, style, anim, out, ...(lower ? { lower } : {}), mute: true });
  }
  // A Lab layer or filter over a range of the program (its code travels with it).
  function addOverlay(e, { name = 'Overlay', code = '', opacity = 1, blend = 'normal', sketch = null, layer = null } = {}, { at = 0, dur = 4 } = {}) {
    return addTo(e, 'overlays', { kind: 'layer', start: r4(Math.max(0, at)), dur: r4(Math.max(MIN, dur)), name, code, opacity, blend, sketch, layer, mute: true });
  }
  // The song: one item on "Sound" from 0 (replaces the previous song)
  function setSong(e, src, duration, { start = 0, a = 0 } = {}) {
    const { e: e2, id } = ensureTrack(e, 'sound');
    const n = C.copy(e2);
    const k = n.tracks.find((x) => x.id === id);
    k.items = k.items.filter((x) => !x.song);
    if (src) { k.items.push({ id: C.uid(), kind: 'audio', src, in: r4(a), out: r4(duration), max: r4(duration), start: r4(start), volume: 1, speed: 1, fadeIn: 0, fadeOut: 0, song: true }); k.items.sort((p, q) => p.start - q.start); }
    return n;
  }
  const songOf = (e) => (e?.tracks || []).filter((k) => k.type === 'audio' && !k.mute).flatMap((k) => k.items).find((x) => x.song) || null;
  function addAudio(e, src, duration, { at = 0, a = 0, b = null, volume = 1 } = {}) {
    return addTo(e, 'sound', { kind: 'audio', src, in: r4(a), out: r4(b ?? duration), max: r4(duration), start: r4(Math.max(0, at)), volume, speed: 1 });
  }

  // ---------- editing (the editor's keys: S, Delete, Shift+Delete, trims, slip, move, duplicate) ----------
  const find = (e, id) => C.find(e, id);
  // S: split the main clip under T (a scene's second half carries on in the scene's own time), or the selected items
  function split(e, T, { items = null } = {}) {
    if (items?.length) return C.splitItems(e, T, items);
    const x = C.at(e, T);
    if (!x) return e;
    const n = C.split(e, T);
    if (n === e) return e;
    if (x.clip.kind === 'scene') { const b = n.clips[x.i + 1]; b.in = r4((x.clip.in || 0) + (T - x.start)); }
    return n;
  }
  // Delete lifts (leaves a gap), Shift+Delete ripples (closes it); items are just removed.
  function remove(e, ids, { ripple = false } = {}) {
    const list = [].concat(ids);
    const main = list.filter((id) => e.clips.some((c) => c.id === id));
    let n = main.length ? C.remove(e, main, { ripple }) : e;
    const items = list.filter((id) => !main.includes(id));
    if (items.length) n = C.removeItems(n, items);
    // a gap left at the very end means nothing: gone
    while (n.clips.length && n.clips[n.clips.length - 1].kind === 'gap') { n = C.copy(n); n.clips.pop(); }
    return n;
  }
  // Trim an edge by delta program seconds (in: + = shorter at the start; out: + = longer). Scenes keep their content
  // in place (the start moves inside the scene's time, like a video's in-point).
  function trim(e, id, edge, delta) {
    const f = find(e, id);
    if (!f) return e;
    if (f.where === 'item') return C.trimItem(e, id, edge, edge === 'in' ? f.clip.start + delta : C.itemEnd(f.clip) + delta);
    const n = f.clip.kind !== 'scene' ? C.trim(e, id, edge, delta) : C.patchAny(e, id, (c) => {
      if (edge === 'in') { const d = clamp(delta, -(c.in || 0), c.dur - MIN); c.in = r4((c.in || 0) + d); c.dur = r4(c.dur - d); } else c.dur = r4(Math.max(MIN, c.dur + delta));
    });
    return gapsHold(e, n, id, edge);
  }
  // A gap next to an edited clip absorbs the change, so what comes after it keeps its time ("at bar 9" stays at bar 9):
  // a clip trimmed before a gap (its end moved), or a clip after a gap whose start moved (an in-trim, a transition).
  function gapsHold(before, after, id, edge) {
    if (after === before) return after;
    const i = after.clips.findIndex((c) => c.id === id);
    const A = C.layout(before);
    if (i < 0 || !A[i]) return after;
    let n = after;
    // a gap before it: the clip's start stays (an in-trim, a new transition)
    const pv = n.clips[i - 1];
    if (edge !== 'out' && pv?.kind === 'gap') {
      const B = C.layout(n);
      const d = edge === 'in' ? (B[i].end - B[i].start) - (A[i].end - A[i].start) : B[i].start - A[i].start;
      if (Math.abs(d) > 1e-6 && pv.dur - d >= MIN) { n = C.copy(n); n.clips[i - 1].dur = r4(pv.dur - d); }
    }
    // a gap after it: what follows keeps its time
    const nb = n.clips[i + 1];
    if (nb?.kind === 'gap') {
      const B = C.layout(n);
      const d = B[i].end - A[i].end;
      if (Math.abs(d) > 1e-6 && nb.dur - d >= MIN) { n = n === after ? C.copy(n) : n; n.clips[i + 1].dur = r4(nb.dur - d); }
    }
    return n;
  }
  // Alt: slip (the same place and length, another part of the scene / footage)
  function slip(e, id, delta) {
    const f = find(e, id);
    if (!f) return e;
    if (f.clip.kind === 'scene') return C.patchAny(e, id, (c) => { c.in = r4(Math.max(0, (c.in || 0) + delta)); });
    return C.slip(e, id, delta);
  }
  function move(e, id, to) {
    const f = find(e, id);
    if (!f) return e;
    if (f.where === 'item') return C.moveItem(e, id, to);
    return C.move(e, id, to);
  }
  function duplicate(e, id) {
    const f = find(e, id);
    if (!f) return e;
    if (f.where === 'clip') return C.duplicate(e, id);
    const n = C.copy(e);
    const k = n.tracks.find((x) => x.id === f.track.id);
    const it = { ...C.copy(f.clip), id: C.uid(), start: r4(C.itemEnd(f.clip)) };
    k.items.push(it); k.items.sort((a, b) => a.start - b.start);
    n.lastItem = it.id;
    return n;
  }
  // Roll (Shift+drag a cut): the cut between clip i − 1 and i moves, one gets longer, the other shorter, the total
  // stays; a scene after the cut keeps its content in place (its in-point moves with the cut, like a video's).
  function roll(e, i, delta) {
    const b0 = e.clips[i];
    const n = C.roll(e, i, delta);
    if (n === e || b0?.kind !== 'scene') return n;
    const d = r4(b0.dur - n.clips[i].dur); // how far the cut really moved
    return C.patchAny(n, [b0.id], (c) => { c.in = r4(Math.max(0, (c.in || 0) + d)); });
  }
  // Slide (Shift+drag a clip): the clip keeps its content and moves; its neighbours trim (a scene after it keeps
  // its content in place too)
  function slide(e, id, delta) {
    const i = e.clips.findIndex((c) => c.id === id);
    const c0 = e.clips[i + 1];
    const n = C.slide(e, id, delta);
    if (n === e || c0?.kind !== 'scene') return n;
    const d = r4(c0.dur - n.clips[i + 1].dur);
    return C.patchAny(n, [c0.id], (c) => { c.in = r4(Math.max(0, (c.in || 0) + d)); });
  }
  const setTrans = (e, id, type, dur = 0.5) => gapsHold(e, C.setTrans(e, [id], type, dur), id, 'trans');
  const setDur = (e, id, secs) => { const f = find(e, id); if (!f) return e; return f.clip.kind === 'video' ? C.trim(e, id, 'out', Math.max(MIN, secs) - C.durOf(f.clip)) : C.patchAny(e, id, (c) => { c.dur = r4(Math.max(MIN, secs)); }); };

  // ---------- fitting to the music ----------
  // Every cut lands on a bar: each clip keeps its length rounded to whole bars (≥ 1), and the cut point (the middle
  // of its transition) sits on the bar line. Without a grid nothing changes.
  function fitBars(e, grid, { songStart = 0 } = {}) {
    if (!grid?.bpm || !e.clips.length) return e;
    const bar = barLen(grid);
    const a0 = ((((grid.anchor || 0) + songStart) % bar) + bar) % bar; // the first bar line at or after 0
    const n = C.copy(e);
    const L = timing(n);
    let target = a0; let start = 0;
    n.clips.forEach((c, i) => {
      const x = L[i];
      const cutOut = L[i + 1] ? L[i + 1].cut : x.end;
      const bars = Math.max(1, Math.round((cutOut - (i ? x.cut : a0)) / bar));
      target += bars * bar;
      const nx = n.clips[i + 1];
      const tdN = nx?.trans && nx.trans.type !== 'cut' ? Math.min(nx.trans.dur || 0, bar * 0.9) : 0;
      const end = target + tdN / 2;
      const d = r4(Math.max(MIN, end - start));
      if (c.kind === 'video') { const s = c.speed || 1; c.out = r4(Math.min(c.max || Infinity, c.in + d * s)); } else c.dur = d;
      start = end - tdN;
    });
    return n;
  }

  // ---------- reading ----------
  // Main clips in program time with both transitions: [{ clip, i, start, end, td (in), tdOut, cut (start + td / 2) }]
  function timing(e) {
    const L = C.layout(e);
    return L.map((x, i) => ({ ...x, tdOut: L[i + 1]?.td || 0, cut: x.start + x.td / 2 }));
  }
  // What shows at T: the main clip(s) (two during a transition: { from, to, p }) and the items.
  function showing(e, T) {
    const L = timing(e);
    const on = L.filter((x) => T >= x.start - 1e-9 && T < x.end - 1e-9);
    const items = (e.tracks || []).filter((k) => !k.hide && k.type !== 'audio').flatMap((k) => k.items.filter((x) => T >= x.start - 1e-9 && T < C.itemEnd(x) - 1e-9));
    let trans = null;
    if (on.length === 2) { const b = on[1]; trans = { type: b.clip.trans?.type, p: clamp((T - b.start) / (b.td || 1), 0, 1), from: on[0].clip.id, to: b.clip.id }; }
    const main = on[on.length - 1] || null;
    return { main: main ? main.clip : null, mainIndex: main ? main.i : -1, local: main ? T - main.start + (main.clip.in || 0) : 0, clips: on.map((x) => x.clip), trans, items };
  }
  // Snapping targets: bars, beats, markers, clip edges and cuts, item edges (kind tells which)
  function snapTargets(e, { grid = null, songStart = 0, beats = true, exclude = null } = {}) {
    const T = C.total(e) + 30;
    const out = [];
    for (const t of gridTimes(grid, T, { every: 'bar', offset: songStart })) out.push({ t, kind: 'bar' });
    if (beats) for (const t of gridTimes(grid, T, { every: 'beat', offset: songStart })) out.push({ t, kind: 'beat' });
    for (const m of e.markers || []) out.push({ t: m.t, kind: 'marker' });
    for (const x of C.layout(e)) { if (x.clip.id === exclude) continue; out.push({ t: x.start, kind: 'edge' }, { t: x.end, kind: 'edge' }); }
    for (const k of e.tracks || []) for (const x of k.items) { if (x.id === exclude) continue; out.push({ t: x.start, kind: 'edge' }, { t: C.itemEnd(x), kind: 'edge' }); }
    out.push({ t: 0, kind: 'edge' });
    return out;
  }
  const RANK = { edge: 0, marker: 1, bar: 2, beat: 3 };
  // the nearest target within tol (edges and markers win a tie with beats)
  function snap(t, targets, tol) {
    let best = null;
    for (const g of targets) { const d = Math.abs(g.t - t); if (d <= tol && (!best || d < best.d - 1e-6 || (Math.abs(d - best.d) < 1e-6 && RANK[g.kind] < RANK[best.g.kind]))) best = { g, d }; }
    return best ? { t: best.g.t, kind: best.g.kind } : { t, kind: null };
  }
  const fmt = (t) => `${Math.floor(Math.max(0, t) / 60)}:${(Math.max(0, t) % 60).toFixed(2).padStart(5, '0')}`;
  function clipLabel(c) {
    if (c.kind === 'scene') return `scene “${c.name}”${c.look ? ` · look ${c.look}` : ''}${c.vary ? ` · variation ${c.vary.seed % 1000}` : ''}${c.vibe ? ' · board vibe' : ''}${c.in ? ` · from ${c.in.toFixed(2)} s` : ''}`;
    if (c.kind === 'seq') return `sequence “${c.name}”${c.in ? ` from ${fmt(c.in)}` : ''}`;
    if (c.kind === 'video') return `footage ${base(c.src)} ${fmt(c.in)}–${fmt(c.out)}${c.speed !== 1 ? ` ${c.speed}×` : ''}${c.mute ? '' : ' (sound)'}`;
    if (c.kind === 'title') return `title card “${c.text}”`;
    if (c.kind === 'gap') return 'gap';
    if (c.kind === 'layer') return `overlay layer “${c.name}”`;
    if (c.kind === 'audio') return `${c.song ? 'song' : 'sound'} ${base(c.src)}`;
    return c.kind;
  }
  // A compact text version for the chats / directors (numbers are what the tools take: clip 2 = the 2nd main clip).
  function describe(e) {
    const lines = timing(e).map((x) => `${x.i + 1}. ${fmt(x.start)}–${fmt(x.end)} ${clipLabel(x.clip)}${x.td ? ` · ${x.clip.trans.type} ${x.td.toFixed(2)} s in` : ''}`);
    for (const k of e.tracks || []) for (const [j, x] of k.items.entries()) lines.push(`${k.name}.${j + 1} ${fmt(x.start)}–${fmt(C.itemEnd(x))} ${x.kind === 'title' ? `title “${x.text}” (${x.style || 'bold'}, ${x.anim || 'fade-up'})` : clipLabel(x)}`);
    return lines;
  }
  // a clip by number (1-based main clip), "Titles.2", an id, or a scene / title name
  function resolve(e, ref) {
    if (ref == null || ref === '') return null;
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) return e.clips[Number(ref) - 1]?.id || null;
    const s = String(ref);
    const m = /^([A-Za-z]\w*)\.(\d+)$/.exec(s);
    if (m) { const k = (e.tracks || []).find((x) => x.name.toLowerCase() === m[1].toLowerCase()); return k?.items[Number(m[2]) - 1]?.id || null; }
    if (find(e, s)) return s;
    const low = s.toLowerCase();
    const c = e.clips.find((x) => (x.name || x.text || '').toLowerCase() === low) || (e.tracks || []).flatMap((k) => k.items).find((x) => (x.name || x.text || '').toLowerCase() === low);
    return c?.id || null;
  }
  const scenes = (e) => e.clips.filter((c) => c.kind === 'scene');
  const total = (e) => C.total(e);

  // ---------- variations (seq2): the same scene, another look, per clip ----------
  // A seeded nudge of a scene's sliders (named numbers within their range, every color's hue), as values by item
  // index; the same seed always gives the same variation, so a clip keeps "its" look.
  const UNIT = /opacity|alpha|amount|mix|strength|intensity|chance|prob|ratio|fade|blend|level|power|glow|bloom|roughness|metal/i;
  function rangeOf(it) {
    if (it.min != null && it.max != null) return [it.min, it.max];
    const v = Number(it.orig) || 0; const name = it.name || it.key || '';
    if (UNIT.test(name) && v >= 0 && v <= 1) return [0, 1];
    if (it.int) return [Math.max(0, Math.min(1, v)), Math.max(Math.abs(v) * 3, 8)];
    if (v === 0) return [-2, 2];
    const a = Math.abs(v); return v < 0 ? [-a * 2.5, 0] : [0, a * 2.5];
  }
  function shiftHue(hex, turn) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return hex;
    const n = parseInt(m[1], 16); const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (((h / 6 + turn) % 1) + 1) % 1;
    const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h * 6) % 2) - 1)); const mm = l - c / 2;
    const [R, G, B] = h < 1 / 6 ? [c, x, 0] : h < 2 / 6 ? [x, c, 0] : h < 3 / 6 ? [0, c, x] : h < 4 / 6 ? [0, x, c] : h < 5 / 6 ? [x, 0, c] : [c, 0, x];
    const to = (v) => Math.round(clamp(v + mm, 0, 1) * 255).toString(16).padStart(2, '0');
    return `#${to(R)}${to(G)}${to(B)}`;
  }
  function varyValues(items, { seed = 1, amount = 0.4 } = {}, current = null) {
    let s = (seed >>> 0) || 1;
    const rand = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const turn = (rand() - 0.5) * Math.min(1, amount * 1.4); // one hue turn for the whole palette (it stays a palette)
    const out = {};
    items.forEach((it, i) => {
      const v = current && i in current ? current[i] : it.orig;
      const r = rand();
      if (it.kind === 'color' && typeof v === 'string') out[i] = shiftHue(v, turn + (r - 0.5) * 0.08 * amount);
      else if (it.kind === 'number' && it.key != null && typeof v === 'number') {
        const [lo, hi] = rangeOf(it); const span = hi - lo;
        let x = clamp(v + (r * 2 - 1) * amount * span, lo, hi);
        if (it.int) x = Math.round(x); else x = Number(x.toPrecision(5));
        out[i] = x;
      }
    });
    return out;
  }

  // ---------- nested sequences (seq2): a sequence as a clip ----------
  // { kind: 'seq', ref: 'seq:<name>', name, dur, in }: plays that sequence's pictures and titles from `in` for `dur`.
  // flatten() swaps each one for what it holds (cut to the window, moved to the clip's place, ids prefixed), so the
  // preview, the render and the editor's bake see ordinary clips. getEdit(ref) → that sequence's edit (or null).
  function flatten(e, getEdit, depth = 0, seen = new Set()) {
    if (!e.clips.some((c) => c.kind === 'seq')) return e;
    const L = C.layout(e);
    const n = C.copy(e);
    n.clips = []; n.tracks = (n.tracks || []).map((k) => ({ ...k, items: [...k.items] }));
    for (const x of L) {
      const c = x.clip;
      if (c.kind !== 'seq') { n.clips.push(C.copy(c)); continue; }
      const sub0 = depth < 3 && !seen.has(c.ref) ? getEdit(c.ref) : null;
      if (!sub0) { n.clips.push({ id: c.id, kind: 'title', text: `Missing sequence “${c.name || String(c.ref).slice(4)}”`, dur: C.durOf(c), trans: c.trans, mute: true, speed: 1, fadeIn: 0, fadeOut: 0, style: 'bold' }); continue; }
      const sub = flatten(sub0, getEdit, depth + 1, new Set([...seen, c.ref]));
      const a = c.in || 0; const b = a + C.durOf(c);
      // the main track: split at the window's edges, keep what's inside
      let s2 = split(sub, b); s2 = split(s2, a);
      const parts = C.layout(s2).filter((y) => y.start >= a - 1e-3 && y.end <= b + 1e-3);
      parts.forEach((y, j) => {
        const cc = { ...C.copy(y.clip), id: `${c.id}/${y.clip.id}` };
        if (j === 0) { if (c.trans) cc.trans = c.trans; else delete cc.trans; }
        n.clips.push(cc);
      });
      if (!parts.length) n.clips.push({ id: c.id, kind: 'gap', dur: C.durOf(c), mute: true, speed: 1, fadeIn: 0, fadeOut: 0 });
      // its pictures and titles over the window (its sound stays its own: the sequence's song leads)
      const shift = x.start - a;
      for (const k of (sub.tracks || []).filter((kk) => kk.type !== 'audio' && !kk.hide)) {
        const items = k.items.filter((it) => it.start < b - 1e-3 && C.itemEnd(it) > a + 1e-3).map((it) => {
          const s = Math.max(a, it.start); const t = Math.min(b, C.itemEnd(it));
          const o = { ...C.copy(it), id: `${c.id}/${it.id}`, start: r4(s + shift) };
          if (it.kind === 'video' || it.kind === 'audio') { o.in = r4(it.in + (s - it.start) * (it.speed || 1)); o.out = r4(o.in + (t - s) * (it.speed || 1)); } else o.dur = r4(t - s);
          return o;
        });
        if (!items.length) continue;
        const same = n.tracks.find((kk) => kk.type === k.type && kk.name === k.name);
        if (same) { same.items.push(...items); same.items.sort((p, q) => p.start - q.start); } else n.tracks.push({ ...k, id: `${c.id}/${k.id}`, items });
      }
    }
    return n;
  }
  const seqClip = (ref, name, dur) => ({ id: C.uid(), kind: 'seq', ref, name: name || String(ref).replace(/^seq:/, ''), dur: r4(Math.max(MIN, dur)), in: 0, mute: true, speed: 1, fadeIn: 0, fadeOut: 0 });

  // ---------- clips between sequences (seq2) ----------
  // copy: the clips (main or items) as data, in program order with their offsets from the first; paste puts them at T
  function copyClips(e, ids) {
    const L = C.layout(e);
    const main = L.filter((x) => ids.includes(x.clip.id)).map((x) => ({ main: true, t: x.start, clip: C.copy(x.clip) }));
    const items = (e.tracks || []).flatMap((k) => k.items.filter((x) => ids.includes(x.id)).map((x) => ({ main: false, t: x.start, type: k.type, name: k.name, clip: C.copy(x) })));
    const all = [...main, ...items].sort((a, b) => a.t - b.t);
    const t0 = all[0]?.t || 0;
    return all.map((x) => ({ ...x, t: r4(x.t - t0) }));
  }
  function pasteClips(e, list, T, { grid = null } = {}) {
    let n = e;
    const ids = [];
    // main clips go in one after another at the nearest cut to T; items keep their offsets
    let idx = null;
    for (const x of list.filter((y) => y.main)) {
      const c = { ...C.copy(x.clip), id: C.uid() };
      if (idx == null) { n = place(n, c, { at: T, trans: c.trans === undefined ? undefined : c.trans || null, grid }); idx = n.clips.findIndex((y) => y.id === c.id); } else { idx += 1; n = place(n, c, { index: idx, trans: c.trans || null, grid }); }
      ids.push(c.id);
    }
    for (const x of list.filter((y) => !y.main)) {
      const { id: _i, ...it } = C.copy(x.clip);
      const role = x.type === 'text' ? 'titles' : x.type === 'audio' ? 'sound' : 'overlays';
      if (it.song) delete it.song;
      n = addTo(n, role, { ...it, start: r4(Math.max(0, T + x.t)) });
      ids.push(n.tracks.flatMap((k) => k.items).find((y) => y.start === r4(Math.max(0, T + x.t)) && (y.text ?? y.src ?? y.name) === (it.text ?? it.src ?? it.name))?.id);
    }
    return { edit: n, ids: ids.filter(Boolean) };
  }

  return {
    FORMATS, TRACKS, DEFAULT_SECS, DEFAULT_BARS, DEFAULT_TRANS, isLab, create, setFormat, formatOf,
    beatLen, barLen, gridTimes, barAt, defaultDur, defaultTransDur,
    ensureTrack, trackOf, sceneClip, insertIndex, place, addScene, addFootage, addTitle, addOverlay, setSong, songOf, addAudio,
    find, split, remove, trim, slip, move, duplicate, setTrans, setDur, fitBars, timing, showing, snapTargets, snap, fmt, clipLabel, describe, resolve, scenes, total,
    roll, slide, varyValues, shiftHue, rangeOf, flatten, seqClip, copyClips, pasteClips,
  };
})();
if (typeof module !== 'undefined') module.exports = ThreeSeqData;
