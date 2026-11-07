// ⌁ Say it in the Lab (round 141, cmdbar141): the plain words typed in the command bar (Ctrl/⌘+;) over the Lab, read
// on this computer: a small grammar and fuzzy names (sliders, layers, cues, dials, blocks, render presets), no AI.
// The pure part: no DOM, loads in Node. tools/three-say.js gathers the Lab's names and applies a plan (one undo step).
//   parse(text, ctx) → a plan: { kind: set | block | vis | dial | follow | jump | render | none | need, …, words }
//   ctx = { layers: [{ id, name, visible, solo }], selLayer, sliders: [{ layer, layerName, key, label, value, min,
//           max }], lastSlider: { layer, key }, cues: [{ t, name }], drops: [t], sections: [{ start, label }], dials:
//           [{ name, value }], blocks: [{ id, name }], presets: [{ id, name, icon }], duration, parseBand(word) }
//   EXAMPLES · HELP the words it understands (the bar's ghost text and its ? card)
const SayCore = (() => {
  const fold = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[“”"'’]/g, '').replace(/\s+/g, ' ').trim();
  const toks = (s) => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  const STOP = new Set(['the', 'a', 'an', 'my', 'this', 'that', 'layer', 'slider', 'please', 'of', 'value']);
  const r3 = (x) => Math.round(Number(x) * 1000) / 1000;
  const fmt = (v) => String(r3(v));
  const pct = (u) => `${Math.round(u * 100)} %`;
  const mmss = (t) => { const s = Math.max(0, Number(t) || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- fuzzy names ----------
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const cur = [i];
      for (let j = 1; j <= b.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function tok(a, b) {
    if (a === b) return 1;
    if (a.length >= 2 && b.startsWith(a)) return 0.85; // "brigh" → brightness
    if (b.length >= 3 && a.startsWith(b)) return 0.75; // "sparks" → spark
    const n = Math.min(a.length, b.length);
    const d = n >= 4 ? lev(a, b) : 9;
    if (d <= 1) return 0.75; if (d <= 2 && n >= 6) return 0.6;
    return 0;
  }
  // how well typed words name something: every typed word should match one of its words; covering more of the
  // name scores higher (0…1)
  function score(q, names) {
    const qs = (Array.isArray(q) ? q : toks(q)).filter((w) => !STOP.has(w));
    if (!qs.length) return 0;
    let best = 0;
    for (const name of [].concat(names).filter(Boolean)) {
      const ns = toks(name);
      if (!ns.length) continue;
      const per = qs.map((w) => Math.max(0, ...ns.map((n) => tok(w, n))));
      if (per.some((x) => x === 0)) continue;
      const avg = per.reduce((s, x) => s + x, 0) / per.length;
      const cover = ns.filter((n) => qs.some((w) => tok(w, n) > 0)).length / ns.length;
      best = Math.max(best, 0.75 * avg + 0.25 * cover);
    }
    return best;
  }
  const bestOf = (q, list, namesOf, min = 0.55) => {
    let hit = null; let s = 0;
    for (const x of list || []) { const v = score(q, namesOf(x)); if (v > s) { s = v; hit = x; } }
    return s >= min ? { hit, s } : null;
  };
  const layerHit = (q, ctx) => bestOf(q, ctx.layers, (L) => [L.name])?.hit || null;
  // a slider: its label or key, alone or with its layer's name ("ring glow", "glow on ring"); the selected layer's first
  function sliderHit(q, ctx) {
    const ws = toks(q).filter((w) => !STOP.has(w) && w !== 'on' && w !== 'in');
    if (!ws.length) return null;
    let hit = null; let s = 0;
    for (const x of (ctx.sliders || []).filter((y) => y.min != null)) {
      const L = (ctx.layers || []).find((l) => l.id === x.layer);
      let v = score(ws, [x.label, x.key]);
      const both = score(ws, [`${x.label} ${L?.name || ''}`, `${x.key} ${L?.name || ''}`]);
      const own = toks(`${x.label} ${x.key}`);
      if (both > 0 && ws.some((w) => own.some((n) => tok(w, n) > 0))) v = Math.max(v, both * 0.98); // (a word must name the slider itself)
      if (v > 0 && x.layer === ctx.selLayer) v += 0.04;
      if (v > s) { s = v; hit = x; }
    }
    return s >= 0.55 ? hit : null;
  }

  // ---------- values, times, cues ----------
  // "0.8", ".8", "80%", "max", "half" → { v } (a number) or { u } (a share of the range)
  function valueOf(w) {
    const t = fold(w).replace(/^(to|=|at)\s+/, '');
    const m = /^(-?\d*\.?\d+)\s*(%|percent)?$/.exec(t);
    if (m) return m[2] ? { u: Number(m[1]) / 100 } : { v: Number(m[1]) };
    const named = { max: 1, maximum: 1, full: 1, all: 1, min: 0, minimum: 0, zero: 0, none: 0, off: 0, half: 0.5, middle: 0.5 }[t];
    return named == null ? null : { u: named };
  }
  const timeOf = (w) => {
    const t = fold(w);
    let m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(t); if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?)$/.exec(t); if (m) return Number(m[1]);
    m = /^(\d+)\s*m(?:in)?\s*(\d+)\s*s?$/.exec(t); if (m) return Number(m[1]) * 60 + Number(m[2]);
    return null;
  };
  const ORD = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, last: -1, final: -1, next: 'next' };
  // the scene's cues, with their shown names: "Drop 1", "Drop 2" when a name is used more than once; none named
  // like that: the song's own drops and sections (the analysis) stand in
  function cueList(ctx) {
    const raw = (ctx.cues || []).filter((c) => Number.isFinite(c.t)).slice().sort((a, b) => a.t - b.t);
    const base = (n) => String(n || 'Cue').replace(/\s*\d+$/, '').trim() || 'Cue';
    const count = {}; raw.forEach((c) => { const b = base(c.name).toLowerCase(); count[b] = (count[b] || 0) + 1; });
    const seen = {};
    const list = raw.map((c) => { const b = base(c.name); const k = b.toLowerCase(); seen[k] = (seen[k] || 0) + 1; return { t: c.t, base: b, name: count[k] > 1 && !/\d$/.test(String(c.name)) ? `${b} ${seen[k]}` : String(c.name || b), n: seen[k] }; });
    return list;
  }
  function songCues(ctx) {
    const out = (ctx.drops || []).map((t, i) => ({ t, base: 'Drop', name: `Drop ${i + 1}`, n: i + 1, song: true }));
    const seen = {};
    for (const s of ctx.sections || []) {
      const b = String(s.label || '').replace(/^\w/, (c) => c.toUpperCase()); if (!b || b === 'Drop') continue;
      seen[b] = (seen[b] || 0) + 1; out.push({ t: s.start, base: b, name: `${b} ${seen[b]}`, n: seen[b], song: true });
    }
    return out.sort((a, b) => a.t - b.t);
  }
  // "drop", "the drop", "drop 2", "second drop", "last chorus", "1:20", "45s", "start", "end" → { t, name } or null
  function cueOf(phrase, ctx) {
    let ws = toks(phrase).filter((w) => w !== 'the');
    if (!ws.length) return null;
    const t = timeOf(ws.join(' ')) ?? timeOf(fold(phrase));
    if (t != null) return { t, name: mmss(t), time: true };
    if (ws.length === 1 && /^(start|beginning|top|zero)$/.test(ws[0])) return { t: 0, name: 'the start', time: true };
    if (ws.length === 1 && /^(end|ending)$/.test(ws[0]) && ctx.duration) return { t: Math.max(0, ctx.duration - 0.05), name: 'the end', time: true };
    let n = 1;
    const o = ws.find((w) => ORD[w] != null); if (o) { n = ORD[o]; ws = ws.filter((w) => w !== o); }
    const num = ws.find((w) => /^\d+$/.test(w)); if (num) { n = Number(num); ws = ws.filter((w) => w !== num); }
    if (!ws.length) return null;
    for (const list of [cueList(ctx), songCues(ctx)]) {
      const names = [...new Set(list.map((c) => c.base))];
      const b = bestOf(ws, names, (x) => [x], 0.7)?.hit;
      if (!b) continue;
      const same = list.filter((c) => c.base === b);
      const c = n === -1 ? same.at(-1) : n === 'next' ? same.find((x) => x.t > (ctx.time || 0) + 0.05) || same[0] : same[n - 1];
      if (c) return { t: c.t, name: c.name };
    }
    return null;
  }

  // ---------- blocks, presets, bands ----------
  const BLOCK_WORDS = { particles: 'particles sparks embers dust', bloom: 'bloom glow', grain: 'grain film', chromatic: 'chromatic rgb aberration split', kaleido: 'kaleido kaleidoscope', trails: 'trails trail feedback echo', ramp: 'ramp gradient colour color', strobe: 'strobe flash flashes', displace: 'displace displacement warp', noise: 'noise field ink', pixelate: 'pixelate pixels pixel', mirror: 'mirror reflect' };
  const PRESETS = [{ id: 'reel', name: 'Vertical reel', icon: '▯', words: 'reel vertical shorts short tiktok story stories 9:16 916' }, { id: 'loop', name: 'Seamless loop', icon: '∞', words: 'loop seamless gif' },
    { id: 'full', name: 'Full song', icon: '♫', words: 'full whole song everything video' }, { id: 'master', name: '4K master', icon: '◆', words: '4k master prores uhd' }, { id: 'square', name: 'Square post', icon: '◻', words: 'square post instagram 1:1 11' }];
  const BANDS = { bass: 'bass low lows sub', kick: 'kick kicks', snare: 'snare clap', hats: 'hats hat hihat hihats', beat: 'beat beats', bar: 'bar bars', mids: 'mids mid', highs: 'highs high treble', vocals: 'vocals vocal voice', drums: 'drums drum', loudness: 'loudness volume level loud music sound song' };
  const bandOf = (w, ctx) => { const x = ctx.parseBand?.(w); if (x) return x; const ws = toks(w); for (const [id, words] of Object.entries(BANDS)) if (ws.some((y) => words.split(' ').includes(y))) return id; return null; };
  const LEVEL = new Set(['bass', 'lowmids', 'mids', 'highs', 'vocals', 'drums', 'loudness', 'custom']);
  const BAND_NAME = { bass: 'the bass', kick: 'the kick', snare: 'the snare', hats: 'the hi-hats', beat: 'the beat', bar: 'each bar', mids: 'the mids', highs: 'the highs', vocals: 'the vocals', drums: 'the drums', loudness: 'the loudness', lowmids: 'the low-mids' };

  // ---------- the grammar ----------
  const NUDGE = 0.15; // "more glow", "energy up": 15 % of the slider's range / of the dial
  function parse(text, ctx = {}) {
    const raw = String(text || '').trim();
    let s = fold(raw).replace(/[.!]+$/, '').replace(/^(please|can you|could you)\s+/, '').trim();
    if (!s) return { kind: 'none', text: raw, words: '' };
    const done = (p) => ({ text: raw, ...p, words: words(p, ctx) });
    const need = (say) => ({ kind: 'need', text: raw, words: say });
    let m;
    // jump to the drop / go to 1:20 / play from the chorus
    if ((m = /^(?:jump|go|skip|seek|move(?: the playhead)?|playhead)\s+(?:back\s+)?to\s+(.+)$|^(?:play\s+)?from\s+(.+)$/.exec(s))) {
      const c = cueOf(m[1] || m[2], ctx);
      return c ? done({ kind: 'jump', t: c.t, name: c.name }) : need(`No cue or time “${m[1] || m[2]}” in this song (Sections ▾ marks them; or "jump to 1:20")`);
    }
    // render a reel / export the square post / render
    if ((m = /^(?:render|export|make)(?:\s+(?:a|an|the|as|it as))?(?:\s+(.+?))?(?:\s+render)?$/.exec(s)) && (/^(render|export)/.test(s) || PRESETS.some((p) => score(m[1] || '', [p.words]) > 0))) {
      const q = m[1] || '';
      const p = q ? (bestOf(q, PRESETS.map((x) => ({ ...x, ...(ctx.presets || []).find((y) => y.id === x.id) })), (x) => [x.words, x.name], 0.6)?.hit || null) : null;
      if (q && !p) return need(`No render preset “${q}” (reel, loop, full song, 4K master, square)`);
      return done({ kind: 'render', preset: p ? { id: p.id, name: p.name, icon: p.icon } : null });
    }
    // add bloom / add some particles / insert a kaleidoscope block
    if ((m = /^(?:add|insert|put in|throw in|new)\s+(?:a |an |some |the |more )?(.+?)(?:\s+(?:block|layer|effect|filter))?$/.exec(s))) {
      const list = (ctx.blocks || []).map((b) => ({ ...b, words: BLOCK_WORDS[b.id] || '' }));
      const b = bestOf(m[1], list, (x) => [x.id, x.name, x.words], 0.6)?.hit;
      return b ? done({ kind: 'block', block: { id: b.id, name: b.name } }) : need(`No block “${m[1]}” (🧩 noise, bloom, trails, kaleido, particles, displace, chromatic, grain, pixelate, mirror, ramp, strobe)`);
    }
    // solo / unsolo / hide / show
    if (/^(unsolo|no solo|solo off|stop solo(ing)?|show (all|every ?thing|every layer|all layers))$/.test(s)) return done({ kind: 'vis', op: 'unsolo' });
    if ((m = /^(hide|mute|show|unhide|unmute|solo)\s+(.+)$/.exec(s))) {
      const L = layerHit(m[2], ctx);
      if (!L) return need(`No layer “${m[2]}” (${(ctx.layers || []).map((x) => x.name).slice(0, 6).join(', ')})`);
      const op = m[1] === 'solo' ? 'solo' : /^(hide|mute)$/.test(m[1]) ? 'hide' : 'show';
      return done({ kind: 'vis', op, layer: L.id, layerName: L.name });
    }
    // follow the bass / glow follows the kick / make speed move with the music
    if ((m = /^(?:make\s+)?(?:(.+?)\s+)?(?:follows?|reacts? to|moves? with|tracks?|pulses? (?:on|with|to))\s+(?:the\s+)?(.+)$/.exec(s))) {
      const band = bandOf(m[2], ctx);
      if (band) {
        const x = m[1] ? sliderHit(m[1], ctx) : (ctx.sliders || []).find((y) => ctx.lastSlider && y.layer === ctx.lastSlider.layer && y.key === ctx.lastSlider.key && y.min != null);
        if (!x) return need(m[1] ? `No slider “${m[1]}”` : 'Which slider? Touch one first, or say "glow follows the bass"');
        return done({ kind: 'follow', layer: x.layer, layerName: x.layerName, key: x.key, label: x.label, band, how: LEVEL.has(band) ? 'follow' : null });
      }
    }
    // the cue at the end ("… on the drop", "… at 1:20")
    let at = null;
    if ((m = /^(.+?)\s+(?:on|at|in|for|by|from)\s+(?:the\s+)?(.+)$/.exec(s))) {
      const c = cueOf(m[2], ctx);
      if (c) { at = c; s = m[1]; }
    }
    // more glow / less energy / glow up / energy down / glow max
    let nudge = 0; let q = null; let val = null;
    if ((m = /^(more|less|lower|higher|raise|lower|increase|decrease|boost|reduce|bump up|turn up|turn down)\s+(?:the\s+)?(.+)$/.exec(s))) { nudge = /^(more|higher|raise|increase|boost|bump up|turn up)$/.test(m[1]) ? 1 : -1; q = m[2]; }
    else if ((m = /^(.+?)\s+(up|down|higher|lower|more|less|\+\+|--)$/.exec(s))) { nudge = /^(up|higher|more|\+\+)$/.test(m[2]) ? 1 : -1; q = m[1]; }
    else if ((m = /^(?:set|make|put|turn|change)?\s*(?:the\s+)?(.+?)\s*(?:\s(?:to|=|at)\s+|=|\s)\s*(-?\d*\.?\d+\s*(?:%|percent)?|max|maximum|min|minimum|full|half|zero|off)$/.exec(s))) { q = m[1].replace(/\s+(to|=)$/, ''); val = valueOf(m[2]); }
    if (!q) return { kind: 'none', text: raw, words: '' };
    // a dial named like that turns first ("energy up"), else a slider
    const dial = bestOf(q, ctx.dials, (d) => [d.name], 0.85)?.hit;
    if (dial && !at) {
      const from = clamp(Number(dial.value) || 0, 0, 1);
      const to = r3(clamp(nudge ? from + nudge * NUDGE : val.u != null ? val.u : val.v > 1 ? val.v / 100 : val.v, 0, 1));
      return done({ kind: 'dial', name: dial.name, from, to });
    }
    const x = sliderHit(q, ctx);
    if (!x) return { kind: 'none', text: raw, words: '' };
    const span = (x.max - x.min) || 1;
    const from = Number(x.value);
    let to;
    if (nudge) to = from + nudge * NUDGE * span;
    else if (val.u != null) to = x.min + val.u * span;
    else to = val.v > x.max && x.max <= 1 && val.v <= 100 ? x.min + (val.v / 100) * span : val.v; // "glow 80" on a 0–1 slider: 80 %
    to = r3(clamp(to, x.min, x.max));
    return done({ kind: 'set', layer: x.layer, layerName: x.layerName, key: x.key, label: x.label, from, to, ...(at ? { at: { t: at.t, name: at.name } } : {}) });
  }

  // the preview line: what Enter will do
  function words(p, ctx = {}) {
    const sel = (ctx.layers || []).find((L) => L.id === ctx.selLayer);
    switch (p.kind) {
      case 'set': return `${p.layerName} · ${p.label} ${p.at ? '' : `${fmt(p.from)} `}→ ${fmt(p.to)}${p.at ? ` at ${p.at.name}${/^\d/.test(p.at.name) ? '' : ` (${mmss(p.at.t)})`} · a key` : ''}`;
      case 'block': return `Add 🧩 ${p.block.name}${sel ? ` above “${sel.name}”` : ''}`;
      case 'vis': return p.op === 'unsolo' ? 'Show every layer again (solo off)' : p.op === 'solo' ? `Solo “${p.layerName}” (only it shows)` : `${p.op === 'hide' ? 'Hide' : 'Show'} “${p.layerName}”`;
      case 'dial': return `🎛 ${p.name} ${pct(p.from)} → ${pct(p.to)}`;
      case 'follow': return `${p.layerName} · ${p.label} follows ${BAND_NAME[p.band] || p.band} ♪`;
      case 'jump': return `Playhead → ${p.name}${/^\d/.test(p.name) ? '' : ` (${mmss(p.t)})`}`;
      case 'render': return `Open ⇪ Render${p.preset ? ` on ${p.preset.icon || ''} ${p.preset.name}` : ''} (nothing renders until ⇪ Export)`;
      default: return '';
    }
  }
  // plans that change the scene (one undo step); a jump or a render card doesn't
  const changes = (p) => ['set', 'block', 'vis', 'dial', 'follow'].includes(p?.kind);

  const EXAMPLES = ['glow 0.8', 'set glow to 80%', 'more glow', 'glow 0.8 on the drop', 'add bloom', 'add particles', 'hide sparks', 'solo ring', 'energy up', 'follow bass', 'jump to drop', 'render reel'];
  const HELP = [
    ['A slider', '“glow 0.8” · “set glow to 80%” · “more glow” · “speed down” · “ring glow max”', 'the selected layer\'s first, else the best match in the scene'],
    ['A key at a cue', '“glow 0.8 on the drop” · “speed 2 at 1:20” · “glow 0 on the second break”', 'a keyframe at that cue or time'],
    ['A block', '“add bloom” · “add particles” · “add kaleidoscope”', '🧩 above the selected layer'],
    ['Layers', '“hide sparks” · “show sparks” · “solo ring” · “solo off”', ''],
    ['A dial', '“energy up” · “darkness down” · “energy 80%”', '🎛 the scene\'s mood dials'],
    ['The music', '“follow bass” · “glow follows the kick”', 'the slider you touched last, or the one named'],
    ['The playhead', '“jump to drop” · “go to the chorus” · “jump to 1:20”', ''],
    ['A render', '“render reel” · “render square” · “render 4k”', 'opens ⇪ Render on that preset'],
  ];
  return { parse, words, changes, cueOf, cueList, score, valueOf, timeOf, fmt, mmss, EXAMPLES, HELP, PRESETS, NUDGE };
})();
if (typeof module !== 'undefined') module.exports = SayCore;
