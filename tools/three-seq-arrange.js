// ✦ Arrange (seq2): builds a Lab sequence from your scenes on a song with no questions asked. The song's sections
// (intro / build / drop / break / outro from the Lab's analysis) set the pace: long clips in the intro, a cut on
// every bar in the drop; every cut lands on a bar line; the transition at a section change is chosen for it (a
// camera fly-through into the build, a light flash on the beat into the drop, a dip into the break, a morph into
// the outro); a scene that comes back in another section comes back in another look (a saved look, or a seeded
// variation of its sliders). Templates (tools/three-seq-templates.js) give the shape: product intro, teaser, loop,
// lyric video, changelog, music video… Also: the 15 s / 6 s versions of a sequence, "fill this gap", re-timing a
// sequence to another song. Pure: no DOM, loads in Node (module.exports at the bottom); tools/three-seq.js calls it.
const SeqArrange = (() => {
  const D = typeof ThreeSeqData !== 'undefined' ? ThreeSeqData : require('./three-seq-data.js');
  const C = typeof CutData !== 'undefined' ? CutData : require('./cut-data.js');
  const TP = typeof SeqTemplates !== 'undefined' ? SeqTemplates : require('./three-seq-templates.js');
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const LABELS = ['Intro', 'Build', 'Drop', 'Break', 'Outro'];
  // a small seeded random (the same seed: the same arrangement)
  const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const tmpl = (t) => (typeof t === 'object' && t ? t : TP.find(t) || TP.BY[TP.DEFAULT]);

  // ---------- the song: where the sequence sits in it, and its pieces ----------
  // song: { src, dur, grid { bpm, anchor, bpb } | null, sections [{ start, end, label, energy }], drops [t] } in song time
  const barOf = (song) => (song?.grid?.bpm ? D.barLen(song.grid) : 2);
  function snapBar(t, song) { const bar = barOf(song); const a0 = song?.grid?.anchor || 0; return a0 + Math.round((t - a0) / bar) * bar; }
  function windowOf(T, song, secs = T.secs) {
    const bar = barOf(song); const dur = song.dur || 0;
    const a0 = song.grid?.anchor || 0;
    const firstBar = a0 - Math.floor(a0 / bar + 1e-6) * bar; // the first bar line at or after 0
    if (!secs) {
      const len = Math.min(dur, T.max || 600);
      return { a: 0, b: r4(len) };
    }
    const nb = Math.max(1, Math.round(secs / bar));
    const len = nb * bar;
    const secsOf = (lab) => (song.sections || []).find((s) => s.label === lab);
    const loudest = () => [...(song.sections || [])].sort((p, q) => (q.energy === 'loud') - (p.energy === 'loud') || (q.end - q.start) - (p.end - p.start))[0];
    let a = firstBar;
    if (T.window === 'drop') { const d = secsOf('Drop')?.start ?? song.drops?.[0] ?? loudest()?.start; if (d != null) a = d - Math.round(nb * (T.dropAt ?? 0.4)) * bar; }
    else if (T.window === 'loud') { const s = loudest(); if (s) a = s.start; }
    a = snapBar(a, song);
    if (a + len > dur) a -= Math.ceil((a + len - dur) / bar - 1e-6) * bar;
    while (a < -1e-6) a += bar;
    return { a: r4(a), b: r4(Math.min(dur || a + len, a + len)) };
  }
  // the section at song time t
  const sectionAt = (song, t) => (song.sections || []).find((s) => t >= s.start - 1e-3 && t < s.end - 1e-3) || null;
  // cut lines on the bars: a cut at each section change and every `pace` bars inside a section
  function songPieces(T, song, win) {
    const bar = barOf(song);
    const a0 = song.grid?.anchor || 0;
    const lines = [];
    let t = a0 + Math.ceil((win.a - a0) / bar - 1e-6) * bar;
    for (; t < win.b - bar * 0.5; t += bar) lines.push(r4(t));
    if (!lines.length || lines[0] > win.a + 1e-3) lines.unshift(win.a);
    const out = []; let cur = null; let sinceCut = 0; let secIdx = -1; let lastSec = null;
    for (const x of lines) {
      const s = sectionAt(song, x + 1e-3);
      const label = LABELS.includes(s?.label) ? s.label : s?.energy === 'loud' ? 'Drop' : s?.energy === 'quiet' ? 'Break' : 'Build';
      const pace = Math.max(1, T.pace?.[label] || 4);
      const changed = s !== lastSec;
      if (!cur || changed || sinceCut >= pace) {
        if (changed) { secIdx += 1; lastSec = s; }
        cur = { a: x, b: null, label, sec: secIdx, first: changed || !out.length };
        if (out.length) out[out.length - 1].b = x;
        out.push(cur); sinceCut = 0;
      }
      sinceCut += 1;
    }
    out[out.length - 1].b = win.b;
    // a last bit shorter than half a bar goes into the clip before
    if (out.length > 1 && out[out.length - 1].b - out[out.length - 1].a < bar * 0.5) { out[out.length - 2].b = out.pop().b; }
    return out.map((p) => ({ ...p, a: r4(p.a - win.a), b: r4(p.b - win.a) }));
  }
  // no song: a few seconds per clip, an intro, the middle as the "drop", an outro
  function plainPieces(T, n, secs) {
    const each = T.paceSecs || 2.5;
    const total = secs || T.secs || Math.max(8, Math.min(60, n * each * 1.5));
    const k = Math.max(1, Math.round(total / each));
    const len = total / k;
    return Array.from({ length: k }, (_, i) => {
      const label = k >= 3 && i === 0 ? 'Intro' : k >= 3 && i === k - 1 ? 'Outro' : 'Drop';
      return { a: r4(i * len), b: r4((i + 1) * len), label, sec: label === 'Intro' ? 0 : label === 'Drop' ? 1 : 2, first: i === 0 || label !== 'Drop' || i === 1 };
    });
  }

  // ---------- transitions matched to the moment ----------
  function transOf(T, piece, grid) {
    const type = (piece.first ? T.into?.[piece.label] : T.within?.[piece.label]) || 'cut';
    if (type === 'cut') return null;
    const beat = grid?.bpm ? D.beatLen(grid) : 0.5; const bar = grid?.bpm ? D.barLen(grid) : 2;
    let dur;
    if (type === 'lab-flash-beat' || type === 'lab-stutter') dur = clamp(beat * 0.75, 0.2, 0.5);
    else if (/slow|morph|fly|bloom/.test(type)) dur = clamp(bar * 0.5, 0.5, 1.6);
    else dur = clamp(beat, 0.25, 1);
    return { type, dur: r4(dur) };
  }

  // ---------- scenes on the pieces ----------
  // scenes: [{ sketch, name, looks: [names], song, look, vibe, vary }] (a clip of an existing sequence works too)
  function assign(pieces, scenes, T, { seed = 1, keepOrder = false } = {}) {
    const n = scenes.length;
    const rand = rng(seed);
    const off = keepOrder ? 0 : Math.floor(rand() * n);
    const out = [];
    const seen = new Map(); // scene index → the sections it showed in (its first look stays as saved)
    let k = 0;
    pieces.forEach((p, j) => {
      let i;
      if (keepOrder) i = j % n;
      else {
        const hero = (p.sec + off) % n;
        if (p.first) k = 0;
        i = (hero + k) % n; k += 1;
        if (n > 1 && out.length && out[out.length - 1].i === i) { i = (i + 1) % n; k += 1; }
      }
      if (T.bookend && j === pieces.length - 1 && pieces.length > 2 && n > 1 && out[out.length - 1]?.i !== out[0]?.i) i = out[0].i;
      const sc = scenes[i];
      const secs = seen.get(i) || [];
      if (!secs.includes(p.sec)) secs.push(p.sec);
      seen.set(i, secs);
      const nth = secs.indexOf(p.sec); // 0: the scene's first section
      let look = sc.look ?? null; let vary = sc.vary ?? null;
      if (nth > 0 && !keepOrder && !(T.loop && j === pieces.length - 1)) {
        const looks = (sc.looks || []).filter((x) => x !== look);
        if (looks.length) look = looks[(nth - 1) % looks.length];
        else if (T.vary > 0) vary = { seed: ((seed * 7919) + i * 131 + p.sec * 977) % 100000, amount: r4(clamp(T.vary * (p.label === 'Drop' ? 1.3 : p.label === 'Intro' || p.label === 'Outro' ? 0.7 : 1), 0.05, 1)) };
      }
      out.push({ i, look, vary });
    });
    return out;
  }

  // ---------- building the edit ----------
  // e: the sequence to arrange into (its format, fps, song and your other tracks stay; the main track, the
  // arranged titles and markers are replaced). Returns { edit, info }.
  function arrange(e, { scenes, song = null, template = null, secs = null, seed = 1, lines = null, name = null, keepOrder = false } = {}) {
    if (!scenes?.length) throw new Error('No scenes to arrange');
    const T = tmpl(template);
    const grid = song?.grid?.bpm ? song.grid : null;
    const win = song?.dur ? windowOf(T, song, secs || T.secs) : null;
    let pieces = win ? songPieces(T, song, win) : plainPieces(T, scenes.length, secs);
    // a changelog / lyric video needs a clip per item: more items than pieces → shorter pieces
    if (T.lines === 'items' && lines?.length > pieces.length && !win) pieces = plainPieces({ ...T, paceSecs: (secs || T.secs || lines.length * (T.paceSecs || 3)) / lines.length }, lines.length, secs || lines.length * (T.paceSecs || 3));
    const end = pieces[pieces.length - 1].b;
    // transitions (kept under 45 % of the shorter neighbour, so every cut stays on its bar line)
    const tr = pieces.map((p, j) => { if (!j) return null; const t = transOf(T, p, grid); if (!t) return null; const room = Math.min(p.b - p.a, pieces[j - 1].b - pieces[j - 1].a) * 0.45; return room < 0.08 ? null : { ...t, dur: r4(Math.min(t.dur, room)) }; });
    const pick = assign(pieces, scenes, T, { seed, keepOrder });
    let n = C.copy(e);
    n.clips = pieces.map((p, j) => {
      const td = tr[j]?.dur || 0; const tdN = tr[j + 1]?.dur || 0;
      const start = p.a - td / 2;
      const stop = j === pieces.length - 1 ? end : p.b + tdN / 2;
      const sc = scenes[pick[j].i];
      const own = sc.song && song?.src && sc.song === song.src ? win?.a || 0 : 0;
      const base0 = sc.kind === 'scene' ? { ...C.copy(sc), id: C.uid() } : D.sceneClip({ sketch: sc.sketch, name: sc.name, poster: sc.poster || null, vibe: sc.vibe || null });
      const c = { ...base0, dur: r4(stop - start), in: r4(Math.max(0, start + own)), look: pick[j].look, vary: pick[j].vary || undefined, section: p.label };
      if (!c.vary) delete c.vary;
      if (tr[j]) c.trans = tr[j]; else delete c.trans;
      return c;
    });
    // the song: from the window's start, ending with it
    const s = D.songOf(n);
    if (s && win) {
      n = C.patchAny(n, [s.id], (x) => { x.in = r4(win.a); x.start = 0; x.out = r4(Math.min(song.dur, win.b + 0.05)); });
    }
    // titles and markers the arrangement makes (the next arrangement replaces them; yours stay)
    n.tracks = (n.tracks || []).map((k) => (k.type === 'text' ? { ...k, items: k.items.filter((x) => !x.arranged) } : k));
    n.markers = (n.markers || []).filter((m) => !m.arranged);
    const bar = grid ? D.barLen(grid) : 2;
    const fill = (txt) => String(txt || '').replace(/\{name\}/g, name || e.seq?.name || 'Hearth').replace(/\{song\}/g, song?.src ? String(song.src).split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : '');
    const titles = [];
    for (const t of T.titles || []) {
      const len = r4(Math.min(end * 0.5, (t.bars || 2) * bar));
      const drop = pieces.find((p) => p.label === 'Drop' && p.first);
      const at = t.at === 'end' ? end - len : t.at === 'drop' ? (drop ? drop.a + 0.05 : end * 0.4) : 0.15;
      titles.push({ text: fill(t.text), at: r4(Math.max(0, at)), dur: len, style: t.style || 'bold', anim: t.anim || 'fade-up' });
    }
    if (T.lines === 'lyric') {
      const L = lines?.length ? lines : ['First line', 'Second line', 'Third line', 'Fourth line'];
      const each = r4(grid ? 2 * bar : 3.5);
      let t0 = r4(grid ? bar : 1);
      for (const line of L) { if (t0 + 0.5 > end) break; titles.push({ text: line, at: t0, dur: r4(Math.min(each - 0.1, end - t0)), style: 'subtitle', anim: 'words-rise' }); t0 = r4(t0 + each); }
    }
    if (T.lines === 'items') {
      const L = lines?.length ? lines : ['New: the Lab sequence', 'Faster renders', 'Arrange on the song'];
      const slots = pieces.filter((p, j) => j > 0 || !T.titles?.some((t) => t.at === 'start'));
      L.slice(0, slots.length).forEach((line, j) => { const p = slots[j]; titles.push({ text: `• ${line}`, at: r4(p.a + 0.2), dur: r4(Math.max(0.5, p.b - p.a - 0.4)), style: 'caption-box', anim: 'slide-up' }); });
    }
    for (const t of titles) n = D.addTitle(n, t.text, { at: t.at, dur: t.dur, style: t.style, anim: t.anim });
    n.tracks = (n.tracks || []).map((k) => (k.type === 'text' ? { ...k, items: k.items.map((x) => (titles.some((t) => t.text === x.text && Math.abs(t.at - x.start) < 1e-3) ? { ...x, arranged: true } : x)) } : k));
    // a marker at each section (named), where the sequence has one
    if (win) for (const p of pieces) if (p.first) n.markers.push({ t: r4(Math.max(0, p.a)), label: p.label, arranged: true });
    n.seq = { ...n.seq, arranged: { template: T.id, seed, secs: secs || T.secs || null } };
    if (T.loop) n.seq.loop = true; else if (n.seq.loop) delete n.seq.loop;
    const info = { template: T.id, name: T.name, clips: n.clips.length, seconds: r4(end), sections: [...new Set(pieces.map((p) => p.label))], window: win ? { from: win.a, to: win.b } : null, cutsOnBars: Boolean(grid) };
    return { edit: n, info };
  }

  // ---------- the 15 s / 6 s versions ----------
  // The same scenes (their looks, vibes, variations), fitted to a short window of the same song (around the drop).
  function scenesOf(e) {
    const out = []; const keys = new Set();
    for (const c of e.clips.filter((x) => x.kind === 'scene')) { const k = `${c.sketch}|${c.look || ''}|${c.vary?.seed || ''}`; if (keys.has(k)) continue; keys.add(k); out.push(c); }
    return out;
  }
  const templateFor = (secs) => (secs <= 8 ? 'bumper' : secs <= 20 ? 'teaser' : 'reel');
  function cutdown(e, secs, { song = null, seed = 1, name = null } = {}) {
    const scenes = scenesOf(e);
    if (!scenes.length) throw new Error('The sequence has no scenes to cut down');
    const base = { ...C.copy(e), clips: [], markers: (e.markers || []).filter((m) => !m.arranged), seq: { ...e.seq, name: name || `${e.seq?.name || 'Sequence'} ${secs}s` } };
    base.tracks = (base.tracks || []).map((k) => (k.type === 'audio' ? k : { ...k, items: [] }));
    return arrange(base, { scenes, song, template: templateFor(secs), secs, seed, name: e.seq?.name || null });
  }

  // ---------- fill this gap ----------
  // A scene that isn't on either side of the gap (the least used), in a variation of its own, with a dissolve in when
  // a scene comes before; the time after the gap doesn't move.
  function fillGap(e, gapId, scenes, { grid = null, seed = 1 } = {}) {
    const i = e.clips.findIndex((c) => c.id === gapId);
    if (i < 0 || e.clips[i].kind !== 'gap') throw new Error('That is not a gap');
    const near = new Set([e.clips[i - 1]?.sketch, e.clips[i + 1]?.sketch].filter(Boolean));
    const used = new Map();
    for (const c of e.clips) if (c.kind === 'scene') used.set(c.sketch, (used.get(c.sketch) || 0) + 1);
    const pool = [...scenes, ...scenesOf(e)].filter((s, j, a) => a.findIndex((x) => x.sketch === s.sketch) === j);
    if (!pool.length) throw new Error('No scene to fill it with');
    const pickSc = [...pool].sort((a, b) => (near.has(a.sketch) - near.has(b.sketch)) || ((used.get(a.sketch) || 0) - (used.get(b.sketch) || 0)))[0];
    const prev = e.clips[i - 1];
    const td = prev && prev.kind !== 'gap' ? Math.min(D.defaultTransDur(grid), e.clips[i].dur * 0.4) : 0;
    const clip = { ...D.sceneClip({ sketch: pickSc.sketch, name: pickSc.name, poster: pickSc.poster || null, vibe: pickSc.vibe || null }, e.clips[i].dur + td), look: pickSc.look || null };
    if (used.has(pickSc.sketch)) clip.vary = { seed: (seed * 31 + i * 7) % 100000, amount: 0.4 };
    let n = C.fillGap(e, gapId, clip);
    const k = n.clips.findIndex((c) => c.sketch === pickSc.sketch && !e.clips.some((x) => x.id === c.id));
    if (td && k >= 0) { n = C.copy(n); n.clips[k].trans = { type: 'dissolve', dur: r4(td) }; n.clips[k].dur = r4(e.clips[i].dur + td); }
    return { edit: n, id: n.clips[k]?.id || null, scene: pickSc.name };
  }

  // ---------- a variation per section (scenes keep their order; one look per section) ----------
  function varySections(e, { seed = 1, amount = 0.4 } = {}) {
    const n = C.copy(e);
    const firstSec = new Map();
    n.clips.forEach((c, j) => {
      if (c.kind !== 'scene') return;
      const sec = c.section || `s${j}`;
      if (!firstSec.has(c.sketch)) { firstSec.set(c.sketch, sec); return; }
      if (firstSec.get(c.sketch) === sec || c.look) return;
      c.vary = { seed: (seed * 7919 + j * 131) % 100000, amount };
    });
    return n;
  }
  // song summary for a question to Astra (a few words, not the analysis)
  function songWords(song) {
    if (!song?.dur) return 'no song';
    const secs = (song.sections || []).map((s) => `${s.label || s.energy} ${Math.round(s.start)}–${Math.round(s.end)} s`).slice(0, 10).join(', ');
    return `${Math.round(song.dur)} s${song.grid?.bpm ? ` at ${Math.round(song.grid.bpm)} BPM` : ''}${secs ? `; sections: ${secs}` : ''}`;
  }
  return { arrange, cutdown, fillGap, varySections, windowOf, songPieces, plainPieces, transOf, assign, scenesOf, templateFor, songWords, rng, TEMPLATES: TP.TEMPLATES, find: TP.find };
})();
if (typeof module !== 'undefined') module.exports = SeqArrange;
