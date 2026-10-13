// Auto-edit (round 27, autoedit): "drop a song, get a whole music video", as plain math (no DOM; loads in Node for
// dev/autoedit-test.js). The Lab's song analysis (sections, drops, the beat grid, the loudness envelope, the key)
// becomes a PLAN of the video, one row per section (intro / build / drop / break / outro):
//   · its span in the song, on bar lines (a section's length moves the cut to the next one, bar by bar)
//   · a scene: the one on screen, a saved one, or a new one the director makes (a crew helper, cost shown first)
//   · the transition into it, on the beat (a flash on the beat into a drop, a fly-through into a build…)
//   · its intensity from the energy (loud sections cut on every bar, quiet ones hold; variations get bolder, the
//     look stronger)
//   · a look (a color look per section, from a family that suits the song's key) and lyrics on / off
// Nothing is made from the plan until "Make it": build() turns it into a Lab sequence edit (tools/three-seq-data.js),
// one clip per cut, every cut on a bar, the song under it, a named marker per section, the lyrics as captions.
// tools/three-autoedit.js shows the plan as an editable strip and runs Make it / Render.
const AutoEditCore = (() => {
  const SA = typeof SeqArrange !== 'undefined' ? SeqArrange : require('./three-seq-arrange.js');
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const r2 = (x) => Math.round(x * 100) / 100;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const LABELS = ['Intro', 'Build', 'Drop', 'Break', 'Outro'];
  const ICON = { Intro: '◔', Build: '↗', Drop: '✸', Break: '◌', Outro: '◕' };
  // the transitions offered on the strip (ids of EditFX.TRANS; beats: its length on the grid)
  const TRANS = [
    { id: 'cut', name: 'Cut', beats: 0 },
    { id: 'lab-flash-beat', name: 'Flash on the beat', beats: 0.75 },
    { id: 'lab-fly', name: 'Fly through', beats: 2 },
    { id: 'lab-morph', name: 'Morph', beats: 2 },
    { id: 'dissolve', name: 'Dissolve', beats: 1 },
    { id: 'dip-black', name: 'Dip to black', beats: 1 },
    { id: 'whip-left', name: 'Whip', beats: 0.75 },
    { id: 'lab-stutter', name: 'Glitch stutter', beats: 0.75 },
    { id: 'lab-bloom', name: 'Bloom through', beats: 1.5 },
  ];
  const TR = Object.fromEntries(TRANS.map((t) => [t.id, t]));
  const INTO = { Intro: 'dissolve', Build: 'lab-fly', Drop: 'lab-flash-beat', Break: 'dip-black', Outro: 'lab-morph' };
  // the color looks offered (ids of EditFX.LOOK) and the families a plan picks from (the song's key decides)
  const LOOKS = [
    { id: 'teal-orange', name: 'Teal & orange' }, { id: 'blockbuster', name: 'Blockbuster' }, { id: 'moody', name: 'Moody' },
    { id: 'golden-hour', name: 'Golden hour' }, { id: 'blue-hour', name: 'Blue hour' }, { id: 'velvia', name: 'Slide film' },
    { id: 'portra', name: 'Portrait film' }, { id: 'super8', name: 'Super 8' }, { id: 'cross-process', name: 'Cross process' },
    { id: 'bw', name: 'Black & white' }, { id: 'bw-high', name: 'B&W high contrast' }, { id: 'matrix', name: 'Code green' },
  ];
  const LOOK = Object.fromEntries(LOOKS.map((l) => [l.id, l]));
  const FAMILIES = {
    dark: [{ Intro: 'moody', Build: 'blue-hour', Drop: 'blockbuster', Break: 'bw', Outro: 'moody' }, { Intro: 'bw', Build: 'matrix', Drop: 'bw-high', Break: 'moody', Outro: 'bw' }],
    warm: [{ Intro: 'golden-hour', Build: 'teal-orange', Drop: 'velvia', Break: 'portra', Outro: 'golden-hour' }, { Intro: 'portra', Build: 'cross-process', Drop: 'teal-orange', Break: 'super8', Outro: 'super8' }],
  };
  // what a new scene for a section is asked to be (the owner's words go first)
  const NEW_BRIEF = {
    Intro: 'a calm, slow opening: the same world, quieter and sparser',
    Build: 'rising tension: more motion, speed building up, the camera pushing in',
    Drop: 'the hardest-hitting take: bold, bright, everything on the kick',
    Break: 'breathing room: minimal, soft light, a slow drift',
    Outro: 'winding down: fading, dissolving into the last image',
  };
  const rng = SA.rng;

  // ---------- the song ----------
  const barOf = (song) => (song?.grid?.bpm ? (60 / song.grid.bpm) * (song.grid.bpb || 4) : 2);
  const beatOf = (song) => (song?.grid?.bpm ? 60 / song.grid.bpm : 0.5);
  function snap(t, song) { const bar = barOf(song); const a0 = song?.grid?.anchor || 0; return r4(a0 + Math.round((t - a0) / bar) * bar); }
  const labelOf = (s) => (LABELS.includes(s?.label) ? s.label : s?.energy === 'loud' ? 'Drop' : s?.energy === 'quiet' ? 'Break' : 'Build');
  // the song's sections on bar lines (a flat or short song gets intro / build / drop / outro on its bars); a section
  // under a bar joins the one before
  function sectionsOf(song) {
    const dur = song?.dur || 0;
    const raw = SA.sectionsOf(song).filter((s) => s.end > s.start);
    const bar = barOf(song);
    const out = [];
    for (const s of raw) {
      const a = out.length ? out[out.length - 1].b : 0;
      let b = s.end >= dur - 1e-3 ? dur : snap(s.end, song);
      if (b > dur) b = dur;
      if (b - a < bar * 0.9) { if (out.length) out[out.length - 1].b = Math.max(out[out.length - 1].b, b); continue; }
      out.push({ a: r4(a), b: r4(b), label: labelOf(s), energy: s.energy || 'medium' });
    }
    if (out.length) out[out.length - 1].b = r4(dur);
    return out;
  }
  // the loudness of [a, b] from the 30 fps envelope (0..1 of the song's loudest section), null without one
  function levelOf(song, a, b) {
    const L = song?.level; const fps = song?.fps || 30;
    if (!L?.length) return null;
    const i0 = Math.max(0, Math.floor(a * fps)); const i1 = Math.min(L.length, Math.ceil(b * fps));
    let s = 0; for (let i = i0; i < i1; i += 1) s += L[i];
    return i1 > i0 ? s / (i1 - i0) : null;
  }
  // intensity 0..1: the section's energy, tempered by how loud it really is next to the others
  const BASE = { quiet: 0.3, medium: 0.6, loud: 0.92 };
  const RANGE = { Intro: [0.1, 0.5], Build: [0.4, 0.8], Drop: [0.75, 1], Break: [0.1, 0.45], Outro: [0.1, 0.45] };
  // bars per cut from the intensity: every bar on a full drop, 8 bars in the quiet
  const cutsFor = (x) => (x >= 0.85 ? 1 : x >= 0.65 ? 2 : x >= 0.45 ? 4 : 8);

  // ---------- the plan ----------
  // song: { src, name, dur, grid { bpm, anchor, bpb } | null, sections, drops, level, fps, key }
  // scenes: [{ sketch, name }] (the one on screen first, then saved ones) · brief: the owner's words for new scenes
  function plan(song, { scenes = [], seed = 1, format = '9:16', brief = '', lyrics = null } = {}) {
    if (!song?.dur) throw new Error('Load a song first');
    const secs = sectionsOf(song);
    if (!secs.length) throw new Error('The song is too short for a video');
    const rand = rng(seed);
    const bar = barOf(song);
    const lv = secs.map((s) => levelOf(song, s.a, s.b));
    const top = Math.max(...lv.filter((x) => x != null), 0);
    const pool = scenes.filter((s, i, a) => s?.sketch && a.findIndex((x) => x.sketch === s.sketch) === i);
    // scenes per kind of section: the drop gets the scene on screen (the hero), the others take the saved ones in turn;
    // with only one scene, the build and the break (or what the song has) get new ones from the director
    const kinds = ['Drop', 'Build', 'Break', 'Intro', 'Outro'].filter((k) => secs.some((s) => s.label === k));
    const byKind = {};
    const off = pool.length > 2 ? Math.floor(rand() * (pool.length - 1)) : 0;
    let k2 = 0;
    for (const k of kinds) {
      if (!pool.length) { byKind[k] = null; continue; }
      if (k === 'Drop' || (k === 'Intro' && !byKind.Intro && pool.length < 3) || k === 'Outro') { byKind[k] = { kind: 'scene', sketch: pool[0].sketch, name: pool[0].name }; continue; }
      const sc = pool.length > 1 ? pool[1 + ((off + k2) % (pool.length - 1))] : null;
      k2 += 1;
      byKind[k] = sc ? { kind: 'scene', sketch: sc.sketch, name: sc.name } : null;
    }
    const wantNew = pool.length <= 1 ? kinds.filter((k) => k !== 'Drop' && !['Intro', 'Outro'].includes(k)).concat(kinds.filter((k) => k === 'Intro')).slice(0, 2) : [];
    if (pool.length <= 1 && wantNew.length === 1 && kinds.includes('Outro')) wantNew.push('Outro');
    for (const k of wantNew) byKind[k] = newScene(k, brief);
    for (const k of kinds) if (!byKind[k]) byKind[k] = pool[0] ? { kind: 'scene', sketch: pool[0].sketch, name: pool[0].name } : newScene(k, brief);
    // the looks: a family that suits the key (minor: darker), one of two by the seed
    const minor = /minor/i.test(song.key || '');
    const fam = (minor ? FAMILIES.dark : song.key ? FAMILIES.warm : [...FAMILIES.dark, ...FAMILIES.warm])[Math.floor(rand() * (minor || song.key ? 2 : 4))];
    const sections = secs.map((s, i) => {
      const rel = lv[i] != null && top > 0 ? lv[i] / top : null;
      const base = BASE[s.energy] ?? 0.6;
      const [lo, hi] = RANGE[s.label];
      const intensity = r2(clamp(rel == null ? base : 0.55 * base + 0.45 * rel, lo, hi));
      const bars = Math.max(1, Math.round((s.b - s.a) / bar));
      const prev = secs[i - 1];
      const trans = i === 0 ? 'cut' : prev.label === s.label ? 'whip-left' : INTO[s.label];
      return {
        id: `s${i + 1}`, label: s.label, a: s.a, b: s.b, bars, energy: s.energy, intensity,
        scene: { ...byKind[s.label] }, trans, look: fam[s.label] || null, cuts: Math.min(bars, cutsFor(intensity)),
        words: s.label !== 'Intro' && s.label !== 'Outro',
      };
    });
    return {
      v: 1, seed, format, brief: String(brief || '').slice(0, 300),
      song: { src: song.src, name: song.name || String(song.src || '').split(/[\\/]/).pop(), dur: r4(song.dur), grid: song.grid || null, key: song.key || null },
      lyrics: { on: Boolean(lyrics?.text), text: lyrics?.text || '' },
      end: r4(secs[secs.length - 1].b), sections,
    };
  }
  function newScene(label, brief = '') {
    return { kind: 'new', name: `New ${label.toLowerCase()} scene`, brief: `${brief ? `${String(brief).trim()}. ` : ''}For the ${label} of a music video: ${NEW_BRIEF[label] || 'a new take on the scene'}.` };
  }

  // ---------- editing the plan (each returns a new plan) ----------
  const copy = (p) => JSON.parse(JSON.stringify(p));
  const at = (p, i) => { const s = p.sections[i]; if (!s) throw new Error(`No section ${i + 1} (1–${p.sections.length})`); return s; };
  function setScene(p, i, scene) {
    const n = copy(p); const s = at(n, i);
    s.scene = scene === 'new' || scene?.kind === 'new' ? { ...newScene(s.label, n.brief), ...(scene?.brief ? { brief: scene.brief } : {}) } : { kind: 'scene', sketch: scene.sketch, name: scene.name };
    return n;
  }
  // a section's length in bars: the cut to the next section moves (the next one gets shorter / longer); the last
  // section's length sets where the video ends (never past the song)
  function setBars(p, i, bars) {
    const n = copy(p); const s = at(n, i);
    const bar = barOf(n.song);
    const want = Math.max(1, Math.round(Number(bars) || 1));
    const nx = n.sections[i + 1];
    let b = r4(s.a + want * bar);
    if (nx) b = Math.min(b, r4(nx.b - bar));
    else b = Math.min(b, n.song.dur);
    if (b <= s.a + bar * 0.5) b = r4(s.a + bar);
    s.b = r4(b); s.bars = Math.max(1, Math.round((s.b - s.a) / bar));
    if (nx) { nx.a = s.b; nx.bars = Math.max(1, Math.round((nx.b - nx.a) / bar)); nx.cuts = Math.min(nx.cuts, nx.bars); }
    else n.end = s.b;
    s.cuts = Math.min(Math.max(1, s.cuts), s.bars);
    return n;
  }
  function setTrans(p, i, type) { if (!TR[type]) throw new Error(`No transition "${type}" (${TRANS.map((t) => t.id).join(', ')})`); const n = copy(p); at(n, i).trans = type; return n; }
  function setLook(p, i, look) { if (look && !LOOK[look]) throw new Error(`No look "${look}" (${LOOKS.map((l) => l.id).join(', ')})`); const n = copy(p); at(n, i).look = look || null; return n; }
  function setCuts(p, i, bars) { const n = copy(p); const s = at(n, i); s.cuts = clamp(Math.round(Number(bars) || s.bars), 1, s.bars); return n; }
  function setWords(p, i, on) { const n = copy(p); at(n, i).words = Boolean(on); return n; }
  function setLyrics(p, text) { const n = copy(p); n.lyrics = { on: Boolean(String(text || '').trim()), text: String(text || '') }; return n; }
  function setFormat(p, format) { const n = copy(p); n.format = format; return n; }
  // a section that the director will make: which ones, and a brief each
  const newOnes = (p) => p.sections.map((s, i) => ({ s, i })).filter((x) => x.s.scene?.kind === 'new');
  // the new scenes made: { sectionIndex: { sketch, name } } (sections that asked for the same thing share one)
  function fillNew(p, made) {
    const n = copy(p);
    n.sections.forEach((s, i) => { if (s.scene?.kind === 'new' && made[i]) s.scene = { kind: 'scene', sketch: made[i].sketch, name: made[i].name, made: true }; });
    return n;
  }

  // ---------- the cuts ----------
  // every clip of the video: [{ a, b, sec, first }] in video time (= song time), every cut on a bar
  function pieces(p) {
    const bar = barOf(p.song);
    const out = [];
    p.sections.forEach((s, k) => {
      if (s.a >= p.end - 1e-3) return;
      const b0 = Math.min(s.b, p.end);
      const step = Math.max(1, s.cuts || s.bars) * bar;
      let t = s.a; let first = true;
      while (t < b0 - 1e-3) {
        let nx = Math.min(b0, t + step);
        if (b0 - nx < bar * 0.5) nx = b0;
        out.push({ a: r4(t), b: r4(nx), sec: k, first });
        t = nx; first = false;
      }
    });
    return out;
  }
  function transDur(type, song) { const t = TR[type]; return t ? r4(clamp(t.beats * beatOf(song), 0, 2)) : 0; }
  // the transition between two cuts inside a section: hard cuts in loud sections, a short dissolve in quiet ones
  const within = (s) => (s.intensity >= 0.45 ? 'cut' : 'dissolve');
  function summary(p) {
    const ps = pieces(p);
    const fresh = newOnes(p);
    return { sections: p.sections.length, clips: ps.length, seconds: r2(p.end), newScenes: fresh.length, scenes: [...new Set(p.sections.map((s) => s.scene?.sketch || s.scene?.name))].length, lyrics: p.lyrics.on };
  }
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  // the plan in a few lines (the director's view, a chat answer)
  function describe(p) {
    const sm = summary(p);
    const head = `🎬 ${p.song.name} · ${fmt(p.end)}${p.song.grid?.bpm ? ` · ${Math.round(p.song.grid.bpm)} BPM` : ''}${p.song.key ? ` · ${p.song.key}` : ''} · ${p.format} · ${sm.clips} clips${sm.newScenes ? ` · ${sm.newScenes} new scene${sm.newScenes > 1 ? 's' : ''} to make` : ''}${p.lyrics.on ? ' · lyrics on' : ''}`;
    const rows = p.sections.map((s, i) => `${i + 1}. ${s.label} ${fmt(s.a)}–${fmt(Math.min(s.b, p.end))} · ${s.bars} bars · ${s.scene.kind === 'new' ? `NEW (${s.scene.brief.replace(/^.*?: /, '')})` : `"${s.scene.name}"`} · in: ${TR[s.trans]?.name || s.trans} · ${Math.round(s.intensity * 100)} % · cut every ${s.cuts} bar${s.cuts > 1 ? 's' : ''}${s.look ? ` · ${LOOK[s.look]?.name || s.look}` : ''}${p.lyrics.on && s.words ? ' · lyrics' : ''}`);
    return [head, ...rows].join('\n');
  }
  // the lyric lines [{ a, b, text }] (aligned to the song) kept where the plan says lyrics, inside the video
  function lyricCues(lines, p) {
    return (lines || []).filter((L) => L.a != null && L.a < p.end).filter((L) => { const s = p.sections.find((x) => L.a >= x.a - 1e-3 && L.a < x.b - 1e-3); return s?.words; })
      .map((L) => ({ a: r4(L.a), b: r4(Math.min(p.end, L.b != null && L.b > L.a ? L.b : L.a + 2.5)), text: L.text }));
  }

  // ---------- building the sequence ----------
  // e: the sequence to fill (its format, fps and other tracks stay; its main track, the song, the markers and captions
  // it made before are replaced). D: ThreeSeqData, C: CutData, captionItem: SeqCut.captionItem; cues: lyricCues().
  function build(e, p, { D, C, captionItem = null, cues = null, captionLook = 'social' } = {}) {
    const left = newOnes(p);
    if (left.length) throw new Error(`${left.length} new scene${left.length > 1 ? 's are' : ' is'} still to make`);
    const ps = pieces(p);
    if (!ps.length) throw new Error('Nothing to make: the plan is empty');
    const end = p.end;
    // the transition at each cut (kept under 45 % of the shorter neighbour, so the cut stays on its bar line)
    const tr = ps.map((x, j) => {
      if (!j) return null;
      const s = p.sections[x.sec];
      const type = x.first ? s.trans : within(s);
      if (!type || type === 'cut') return null;
      const room = Math.min(x.b - x.a, ps[j - 1].b - ps[j - 1].a) * 0.45;
      const dur = Math.min(transDur(type, p.song) || 0.3, room);
      return dur < 0.08 ? null : { type, dur: r4(dur) };
    });
    const seen = new Map(); // scene → the first section it showed in
    let n = C.copy(e);
    n.clips = ps.map((x, j) => {
      const s = p.sections[x.sec];
      const td = tr[j]?.dur || 0; const tdN = tr[j + 1]?.dur || 0;
      const start = x.a - td / 2;
      const stop = j === ps.length - 1 ? end : x.b + tdN / 2;
      const c = { ...D.sceneClip({ sketch: s.scene.sketch, name: s.scene.name }), dur: r4(stop - start), in: r4(Math.max(0, start)), section: s.label, autoedit: true };
      if (!seen.has(s.scene.sketch)) seen.set(s.scene.sketch, x.sec);
      // inside a section each cut is a variation (bolder with the intensity); a scene back in a later section too
      const again = seen.get(s.scene.sketch) !== x.sec;
      if (!x.first || again) c.vary = { seed: ((p.seed * 7919) + j * 131 + x.sec * 977) % 100000 || 1, amount: r2(clamp(0.15 + 0.4 * s.intensity, 0.05, 1)) };
      if (s.look) c.grade = { look: s.look, amt: r2(0.55 + 0.45 * s.intensity) };
      if (tr[j]) c.trans = tr[j];
      return c;
    });
    // the song from 0, cut where the video ends
    if (!D.songOf(n) && p.song.src) n = D.setSong(n, p.song.src, p.song.dur);
    const sg = D.songOf(n);
    if (sg) n = C.patchAny(n, [sg.id], (x) => { x.in = 0; x.start = 0; x.out = r4(Math.min(p.song.dur, end + 0.05)); });
    // a named marker per section (the previous auto-edit's and arrangement's go)
    n.markers = (n.markers || []).filter((m) => !m.autoedit && !m.arranged);
    for (const s of p.sections) if (s.a < end - 1e-3) n.markers.push({ t: r4(s.a), label: s.label, autoedit: true });
    // the lyrics: the Captions track (only where the plan says lyrics)
    n.tracks = (n.tracks || []).map((k) => (k.type === 'text' ? { ...k, items: k.items.filter((x) => !x.autoedit) } : k));
    let words = 0;
    if (p.lyrics.on && cues?.length && captionItem) {
      for (const q of cues) { n = D.addTo(n, 'captions', { ...captionItem(q, captionLook), autoedit: true }); words += 1; }
    }
    n.seq = { ...n.seq, autoedit: { plan: copy(p), at: Date.now() } };
    if (n.seq.arranged) delete n.seq.arranged;
    if (n.seq.loop) delete n.seq.loop;
    return { edit: n, info: { clips: n.clips.length, seconds: r2(end), sections: p.sections.length, captions: words, cutsOnBars: Boolean(p.song.grid?.bpm) } };
  }

  return { LABELS, ICON, TRANS, TR, LOOKS, LOOK, INTO, NEW_BRIEF, sectionsOf, levelOf, cutsFor, plan, newScene, setScene, setBars, setTrans, setLook, setCuts, setWords, setLyrics, setFormat, newOnes, fillNew, pieces, transDur, summary, describe, lyricCues, build, barOf, beatOf, fmt };
})();
if (typeof module !== 'undefined') module.exports = AutoEditCore;
