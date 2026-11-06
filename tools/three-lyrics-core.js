// 🎤 Lyrics synced to the song (round 133, lyrics133): the pure part (no window, loads in Node too).
// docs/upgrades/lyrics133.md. tools/three-lyrics.js is the panel, the lane under the song, tap to time and the layer;
// the parsing, word times and the old onset alignment stay in tools/three-type-lyrics.js (TypeLyrics, round 25).
//   read(text, name)            → { kind, timed, lines }  (TypeLyrics.parse: plain text, .lrc, .srt / .vtt)
//   grid(music)                 → { bpm, bar, beat, bpb, a, beats, snapBeat(t), snapBar(t) } from the Lab's beat grid
//   autoTime(lines, music)      → { lines, how }: ✦ Auto-time, locally (no AI): the sung sections share the lines by their
//                                 length in bars, a section's bars go to its lines by syllable count, each line on a bar
//                                 (on a beat when a section has more lines than bars); words spread inside the line
//   tapAt(lines, i, t, music, tapped) → the line i starts on the beat nearest t (the lines after it follow)
//   move(lines, i, a, music, { snap }) → line i dragged to start at a (kept between its neighbours, on a beat)
//   lineAt(lines, t)            → the index of the line sung at t (-1: none yet)
//   STYLES / styleValues(id, palette) / pick(section) / sectionPlan(sections, picks) → keyframes per slider
//   askText({ layer, sections, lines, picks }) / estimate(chars): ✦ Style the lyrics (the director, cost first)
const LyricsCore = (() => {
  const LY = () => (typeof TypeLyrics !== 'undefined' ? TypeLyrics : typeof require === 'function' ? require('./three-type-lyrics.js') : null);
  const r3 = (x) => Math.round(Number(x) * 1000) / 1000;
  const clone = (lines) => (lines || []).map((L) => ({ a: L.a ?? null, b: L.b ?? null, text: String(L.text || ''), w: Array.isArray(L.w) ? L.w.slice() : null }));
  const fmt = (t) => { const s = Math.max(0, Number(t) || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

  // ---------- lyrics in ----------
  function read(text, name = '') {
    const p = LY().parse(String(text || ''), name);
    return { kind: p.kind, timed: p.timed, lines: clone(p.lines) };
  }

  // ---------- the beat grid ----------
  // music: { duration, bpm, bpb, downbeat, beats, sections: [{ start, end, label, energy }] } (LabType.music())
  function grid(music) {
    const bpm = Number(music?.bpm) || 120; const bpb = Number(music?.bpb) || 4;
    const beat = 60 / bpm; const bar = beat * bpb; const a = Number(music?.downbeat) || 0;
    const beats = Array.isArray(music?.beats) && music.beats.length ? music.beats.slice().sort((x, y) => x - y) : null;
    const snapBeat = (t) => {
      if (beats) { let lo = 0; let hi = beats.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (beats[m] < t) lo = m + 1; else hi = m; } const c = [beats[lo], beats[lo - 1]].filter((x) => x != null); return r3(c.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), c[0])); }
      let x = a + Math.round((t - a) / beat) * beat; if (x < 0) x += beat; return r3(x);
    };
    const snapBar = (t) => { let x = a + Math.round((t - a) / bar) * bar; if (x < -0.001) x += bar; return r3(Math.max(0, x)); };
    return { bpm, bpb, beat, bar, a, beats, snapBeat, snapBar };
  }

  // ---------- ✦ Auto-time: bars and sections, by syllables ----------
  const NAMES = (secs) => { const n = {}; return secs.map((s) => { const l = s.label || (s.energy === 'loud' ? 'Drop' : 'Break'); n[l] = (n[l] || 0) + 1; return n[l] > 1 ? `${l} ${n[l]}` : l; }); };
  function sectionsOf(music) {
    const d = Number(music?.duration) || 0;
    const raw = (music?.sections || []).filter((s) => Number.isFinite(s.start)).slice().sort((x, y) => x.start - y.start);
    const names = NAMES(raw);
    return raw.map((s, i) => ({ i, label: s.label || '', name: names[i], start: r3(s.start), end: r3(Number.isFinite(s.end) ? s.end : (raw[i + 1]?.start ?? d)), energy: s.energy || null }));
  }
  // largest remainder: n units shared by weights (each ≥ min when there's room), in order
  function share(n, weights, min = 0) {
    const k = weights.length; if (!k) return [];
    const out = new Array(k).fill(0);
    let left = n;
    if (min && n >= min * k) { out.fill(min); left -= min * k; }
    const tot = weights.reduce((s, w) => s + Math.max(0, w), 0) || 1;
    const raw = weights.map((w) => (left * Math.max(0, w)) / tot);
    raw.forEach((x, i) => { out[i] += Math.floor(x); });
    let rest = n - out.reduce((s, x) => s + x, 0);
    const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((p, q) => q[0] - p[0]);
    for (let j = 0; rest > 0 && order.length; j = (j + 1) % order.length, rest -= 1) out[order[j][1]] += 1;
    return out;
  }
  function autoTime(lines0, music) {
    const lines = clone(lines0).map((L) => ({ ...L, a: null, b: null, w: null }));
    if (!lines.length) return { lines, how: 'no lines' };
    const G = grid(music); const d = Number(music?.duration) || Math.max(20, lines.length * G.bar);
    let secs = sectionsOf(music);
    const sung = secs.filter((s) => !/intro|outro/i.test(s.label) && s.end - s.start >= G.bar * 0.9);
    if (sung.length) secs = sung;
    if (!secs.length) { const sp = LY().span(music || { duration: d, bpm: G.bpm }, lines); secs = [{ i: 0, name: 'Song', label: '', start: G.snapBar(sp.a), end: sp.b }]; }
    // each section on its bars
    const S = secs.map((s) => { const a = G.snapBar(s.start); const bars = Math.max(1, Math.round((Math.min(d, s.end) - a) / G.bar)); return { ...s, a, bars }; });
    const counts = share(lines.length, S.map((s) => s.bars));
    const syl = lines.map((L) => Math.max(1, LY().lineSyl(L.text)));
    let k = 0;
    S.forEach((s, si) => {
      const n = counts[si]; if (!n) return;
      const perBeat = n > s.bars; // more lines than bars: lines start on beats
      const unit = perBeat ? G.beat : G.bar; const units = perBeat ? s.bars * G.bpb : s.bars;
      const got = n > units ? new Array(n).fill(1) : share(units, syl.slice(k, k + n), 1);
      let u = 0;
      for (let j = 0; j < n; j += 1, k += 1) {
        const L = lines[k];
        L.a = r3(s.a + u * unit); u += got[j];
        // shown until its slot ends, or about as long as it takes to sing (a bar more), whichever comes first
        L.b = r3(Math.min(s.a + u * unit, s.a + s.bars * G.bar, d, L.a + Math.max(unit, syl[k] * 0.5 + G.bar)) - 0.05);
        if (L.b <= L.a) L.b = r3(L.a + Math.max(0.2, unit * 0.9));
      }
    });
    // a section's lines never run past the next one's
    for (let i = 0; i < lines.length - 1; i += 1) if (lines[i].b > lines[i + 1].a - 0.02) lines[i].b = r3(Math.max(lines[i].a + 0.1, lines[i + 1].a - 0.05));
    const bp = G.beat;
    for (const L of lines) L.w = LY().wordTimes(L, [], G.beats || [], bp);
    return { lines, how: `${lines.length} lines on the bars of ${S.filter((_, i) => counts[i]).length} section${S.filter((_, i) => counts[i]).length === 1 ? '' : 's'} (by syllables)` };
  }

  // ---------- tap to time: snapped to the beat grid ----------
  function tapAt(lines0, i, t, music, tapped = null) {
    const lines = clone(lines0);
    if (!lines[i]) return { lines, at: null };
    const s = grid(music).snapBeat(Number(t));
    LY().tap(lines, i, s, null, { tapped });
    if (lines[i].b == null || lines[i].b <= lines[i].a) lines[i].b = r3(lines[i].a + 2);
    return { lines, at: lines[i].a };
  }

  // ---------- a dragged line ----------
  function move(lines0, i, a, music, { snap = true } = {}) {
    const lines = clone(lines0);
    const L = lines[i]; if (!L || L.a == null) return lines;
    let t = snap ? grid(music).snapBeat(Number(a)) : r3(Number(a));
    const prev = lines[i - 1]; const next = lines[i + 1];
    const len = Math.max(0.2, (L.b ?? L.a + 2) - L.a);
    const lo = prev?.a != null ? prev.a + 0.1 : 0;
    const hi = next?.a != null ? next.a - 0.1 : Infinity;
    t = r3(Math.max(lo, Math.min(hi, t)));
    const dt = t - L.a;
    L.a = t; L.b = r3(next?.a != null ? Math.min(t + len, next.a - 0.02) : t + len);
    if (L.w) L.w = L.w.map((x) => r3(x + dt));
    if (prev && prev.b != null && prev.b > t - 0.02) prev.b = r3(Math.max(prev.a + 0.1, t - 0.02));
    return lines;
  }
  function lineAt(lines, t) { let cur = -1; for (let i = 0; i < (lines || []).length; i += 1) { if (lines[i].a != null && lines[i].a <= t) cur = i; else if (lines[i].a != null) break; } return cur; }

  // ---------- styles: the 🅰 type layer's own sliders (tools/three-type-data.js) ----------
  // every style sets the same keys, so a switch never leaves another style's kick or size behind
  const BASEV = { look: 'fades', inAnim: 'fade', unit: 'word', stagger: 0.06, dur: 0.5, size: 0.075, glow: 0, kickScale: 0, kickGlow: 0, kSync: 'off', kFx: 'none' };
  const STYLES = [
    { id: 'karaoke', name: 'Karaoke', desc: 'the line fills with color as it is sung', v: { look: 'karaoke', size: 0.07, kickScale: 0.08, kickGlow: 0.3 } },
    { id: 'wordbeat', name: 'Word on the beat', desc: 'each word pops in on the beat', v: { look: 'lines', inAnim: 'rise', stagger: 0.08, dur: 0.4, size: 0.08, kSync: 'beat', kFx: 'punch', kickScale: 0.15 } },
    { id: 'fade', name: 'Soft fade', desc: 'lines fade in word by word', v: { look: 'fades', inAnim: 'blur-in', stagger: 0.08, dur: 0.6 } },
    { id: 'calm', name: 'Calm', desc: 'slow fades, no kick', v: { look: 'fades', inAnim: 'fade', stagger: 0.12, dur: 1.1, size: 0.065 } },
    { id: 'punchy', name: 'Punchy', desc: 'one big word at a time, hits on the kick', v: { look: 'oneword', inAnim: 'scale-pop', dur: 0.18, size: 0.2, glow: 0.3, kickScale: 0.5, kickGlow: 1 } },
    { id: 'typed', name: 'Typed', desc: 'each line types on', v: { look: 'type', inAnim: 'typewriter', size: 0.065 } },
    { id: 'scroll', name: 'Scroll', desc: 'every line, the sung one lit', v: { look: 'scroll', size: 0.06 } },
  ];
  const STYLE_KEYS = Object.keys(BASEV);
  const SECTION_KEYS = ['look', 'size', 'glow', 'kickScale', 'kickGlow', 'kSync', 'kFx']; // what changes per section (keyframes, hold)
  const styleOf = (id) => STYLES.find((s) => s.id === id) || null;
  function styleValues(id, palette = null) {
    const s = styleOf(id); if (!s) return null;
    const out = { ...BASEV, ...s.v };
    const pal = (Array.isArray(palette) ? palette : []).filter((c) => /^#[0-9a-f]{6}$/i.test(String(c)));
    if (pal.length) { out.color2 = pal[0]; out.glowColor = pal[1] || pal[0]; }
    return out;
  }
  // calm where it's quiet, punchy on the drop (the free, local pick; the director's is its own)
  function pick(sec) {
    const l = String(sec?.label || sec?.name || '');
    if (/drop/i.test(l) || sec?.energy === 'loud') return 'punchy';
    if (/build/i.test(l)) return 'wordbeat';
    if (/intro|break|outro/i.test(l) || sec?.energy === 'quiet') return 'calm';
    return 'karaoke';
  }
  // picks: { [section name]: style id } → { key: [{ t, v, ease: 'hold' }] } (a key at each section's start)
  function sectionPlan(sections, picks = {}) {
    const keys = {};
    const secs = sections.filter((s) => styleOf(picks[s.name] || pick(s)));
    secs.forEach((s, j) => {
      const v = styleValues(picks[s.name] || pick(s));
      for (const k of SECTION_KEYS) (keys[k] ||= []).push({ t: j === 0 ? 0 : r3(s.start), v: v[k], ease: 'hold' });
    });
    return keys;
  }

  // ---------- ✦ Style the lyrics: what the director gets (sent only on the owner's click, after the cost) ----------
  function askText({ layer, sections = [], lines = [], picks = {} } = {}) {
    const st = STYLES.map((s) => { const v = styleValues(s.id); return `${s.id}: ${SECTION_KEYS.map((k) => `${k}=${v[k]}`).join(' ')} (${s.desc})`; });
    const secs = sections.map((s) => `${s.name} @${r3(s.start)} (${s.energy || s.label || 'part'}, ${fmt(s.start)}–${fmt(s.end)}${lines.length ? `, ${lines.filter((L) => L.a != null && L.a >= s.start && L.a < s.end).length} lines` : ''})`);
    const sug = sections.map((s) => `${s.name} ${picks[s.name] || pick(s)}`).join(' · ');
    return [`✦ Style the lyrics · layer "${layer}"`,
      'Pick a lyric style for each section of the song (calm where it is quiet, punchy on the drops, your call), from the styles below. Apply it as keyframes on that layer: one three_keyframes call (three_do keyframes) per slider below, ease "hold", one key at each section\'s start (time 0 for the first). Change nothing else. Then one short line on what you picked where.',
      'Styles (slider=value):', ...st,
      'Sections (name @start seconds):', ...secs,
      `Lyrics: ${lines.length} lines${lines[0] ? `, first "${String(lines[0].text).slice(0, 60)}"` : ''}`,
      `Suggested: ${sug}`].join('\n');
  }
  const estimate = (chars) => Math.round(1800 + Number(chars || 0) / 3.6);

  return { read, grid, sectionsOf, share, autoTime, tapAt, move, lineAt, STYLES, STYLE_KEYS, SECTION_KEYS, BASEV, styleOf, styleValues, pick, sectionPlan, askText, estimate, fmt, clone };
})();
if (typeof module !== 'undefined') module.exports = LyricsCore;
else if (typeof window !== 'undefined') window.LyricsCore = LyricsCore;
