// Moodboard qualities (round 67, moodqualities67): what a chat gets from a reference by default is its QUALITIES in
// plain words plus numbers (palette hexes with shares, brightness, contrast, warmth, saturation, grain, busy vs clean,
// composition, shape language, motion and cuts for clips), never the picture itself, so the result borrows the feel
// instead of copying the image. On top of that:
//   - "What I like about this" (`it.like`) goes first and is marked as the strongest signal;
//   - a distance 0…100 ("close to it" … "only its spirit"): close sends every number with strict wording, spirit only
//     the mood-level words and says plainly not to reproduce the subject, layout or recognisable elements;
//   - a blend of 2–3 references (palettes merged by share, numbers averaged) as one look;
//   - a reference whose vibe isn't measured yet says so (or why it failed), never an empty block.
// Pure: no DOM, no Hearth globals beyond BoardData / BoardVibe (required in Node). board-drawer.js uses it in the
// window; node dev/moodqualities-test.js tests it.
const BoardQualities = (() => {
  const D = typeof BoardData !== 'undefined' ? BoardData : require('./board-data.js');
  const V = typeof BoardVibe !== 'undefined' ? BoardVibe : require('./board-vibe.js');
  const W = V.words;
  const r2 = (v) => Math.round(v * 100) / 100;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const num = (v) => (v == null || !Number.isFinite(+v) ? null : (+v).toFixed(2));
  const signed = (v) => `${v >= 0 ? '+' : ''}${(+v).toFixed(2)}`;
  const clean = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const MEDIA = ['image', 'gif', 'video', 'web'];
  const DEFAULT_DISTANCE = 50;
  const LIKE_MAX = 240;
  const RULE = 'Vibe only: don\'t put the reference media itself in the result unless I ask for the clip.';
  const SPIRIT_RULE = 'Don\'t reproduce the subject, layout or recognisable elements of these references: take only their spirit.';

  // ---------- distance ----------
  const BANDS = [
    { id: 'close', max: 33, name: 'close to it', lead: 'Treat the numbers as targets: match the palette hexes and their shares, brightness and contrast within about ±0.05, the warmth, saturation, texture and the composition balance. Make a new image though: don\'t copy the reference picture itself.' },
    { id: 'between', max: 66, name: 'in between', lead: 'Use these as a direction, not exact targets: keep the palette, light and texture feel, pick your own subject and layout.' },
    { id: 'spirit', max: 100, name: 'only its spirit', lead: 'Keep only the mood: the feel of the light, colour and energy.' },
  ];
  const distanceOf = (d) => { const n = Number(d); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : DEFAULT_DISTANCE; };
  const band = (d) => { const n = distanceOf(d); return BANDS.find((b) => n <= b.max) || BANDS[2]; };

  // ---------- is it measured? ----------
  // ready: a measured vibe · measuring: not yet (the background reader hasn't reached it) · failed: the reader gave up
  // (that is NOT "no data": the block says so) · none: not a picture / clip (notes, colours: their own words)
  function status(it) {
    if (!it || !MEDIA.includes(it.type)) return { state: 'none' };
    const v = it.vibe;
    if (v && v.light != null) return { state: 'ready' };
    if (it.vibeError) return { state: 'failed', reason: clean(it.vibeError, 120) };
    if (it.type === 'web' && it.snapError) return { state: 'failed', reason: `no snapshot of the page (${clean(it.snapError, 80)})` };
    return { state: 'measuring' };
  }
  const needsMeasuring = (it) => status(it).state === 'measuring';

  // ---------- words ----------
  const lightWords = (l) => (l < 0.3 ? 'mostly dark' : l > 0.62 ? 'mostly bright' : 'mid-tones');
  function shapeWord(v) {
    const s = v && v.shape;
    if (!s) return null;
    if ((v.edges || 0) < 0.04) return 'few hard edges: soft, flat shapes';
    if ((v.grain || 0) > 0.55 && (v.edges || 0) > 0.5 && s.spread > 0.9) return 'scattered fine texture, no clear shapes';
    if (s.straight > 0.55) return 'straight lines and right angles (geometric, architectural)';
    if (s.diagonal > 0.45) return 'strong diagonals (angular, dynamic)';
    if (s.spread > 0.78 && s.straight < 0.4) return 'curves and rounded, organic shapes';
    return 'a mix of straight and curved shapes';
  }
  const paceWord = (pace, cuts) => (cuts === 0 ? 'one continuous shot' : pace == null ? null : pace < 1.5 ? 'rapid cuts' : pace < 4 ? 'quick cuts' : pace < 10 ? 'unhurried cuts' : 'long takes');
  const families = (pal, n = 3) => [...new Set((pal || []).slice(0, n + 2).map((c) => D.colorName(c.hex)))].slice(0, n);
  const palText = (pal) => `${pal.slice(0, 6).map((c) => `${c.hex}${c.share ? ` ${pct(c.share)}` : ''}`).join(', ')} (${families(pal).join(', ')})`;
  function compNumbers(v) {
    if (!v.centroid) return null;
    const [x, y] = v.centroid;
    const parts = [`${V.compWord(v)}`, `centre of interest at ${pct(x)} across, ${pct(y)} down`];
    if (v.centered != null) parts.push(`centred ${num(v.centered)}`);
    if (v.thirds != null) parts.push(`on a third ${num(v.thirds)}`);
    if (v.symmetry != null) parts.push(`symmetry ${num(v.symmetry)}`);
    if (v.space != null) parts.push(`negative space ${pct(v.space)} of the frame`);
    if (v.horizon != null) parts.push(`horizon ${pct(v.horizon)} down`);
    return parts.join(', ');
  }

  // ---------- one measured vibe → lines, by band ----------
  function vibeLines(v, b, { colors = null } = {}) {
    const out = [];
    const pal = colors || v.palette || [];
    if (b.id === 'spirit') {
      const feel = [v.light != null ? `${W.keyWord(v.light)} (${lightWords(v.light)})` : null, v.contrast != null ? `${W.contrastWord(v.contrast)} contrast` : null, v.warmth != null ? W.warmWord(v.warmth) : null, v.sat != null ? W.satWord(v.sat) : null].filter(Boolean);
      if (feel.length) out.push(`feel: ${feel.join(', ')}`);
      if (pal.length) out.push(`colour families: ${families(pal).join(', ')}`);
      const tex = [v.grain != null ? W.grainWord(v.grain) : null, v.edges != null ? W.edgeWord(v.edges) : null].filter(Boolean);
      if (tex.length) out.push(`texture: ${tex.join(', ')}`);
      const sh = shapeWord(v); if (sh) out.push(`shape language: ${sh}`);
      if (v.motion != null) out.push(`energy: ${W.motionWord(v.motion)}${paceWord(v.pace, v.cutCount) ? `, ${paceWord(v.pace, v.cutCount)}` : ''}`);
      return out;
    }
    const close = b.id === 'close';
    if (pal.length) out.push(`palette: ${palText(pal)}`);
    if (v.light != null) {
      out.push(`brightness: ${num(v.light)} of 1 (${W.keyWord(v.light)}, ${lightWords(v.light)})${v.lightArc && v.lightArc !== 'steady' ? `, ${v.lightArc} over the clip` : ''}`);
      out.push(`contrast: ${num(v.contrast)} of 1 (${W.contrastWord(v.contrast)})`);
      out.push(`colour: saturation ${num(v.sat)} of 1 (${W.satWord(v.sat)}), warmth ${signed(v.warmth || 0)} on −1 cool … +1 warm (${W.warmWord(v.warmth || 0)})${v.colorful > 0.6 ? ', colourful' : ''}`);
      out.push(`texture: grain ${num(v.grain)} (${W.grainWord(v.grain)}), detail ${num(v.edges)} of 1 (${v.edges < 0.15 ? 'clean' : v.edges > 0.5 ? 'busy' : 'some detail'})`);
      const comp = close ? compNumbers(v) : V.compWord(v);
      if (comp) out.push(`composition: ${comp}`);
    }
    const sh = shapeWord(v); if (sh) out.push(`shape language: ${sh}`);
    if (v.motion != null) out.push(`motion: ${num(v.motion)} of 1 (${W.motionWord(v.motion)})${v.cutCount != null ? `, ${v.cutCount ? `${v.cutCount} cuts, about ${v.pace} s per shot (${v.cutsPerMin} cuts a minute)` : 'one continuous shot'}` : ''}`);
    if (v.aspect && close) out.push(`frame: ${v.aspect}`);
    return out;
  }

  // ---------- one reference ----------
  const KIND = (it) => V.KIND_WORD[it.type] || it.type;
  function head(it, n, b) {
    const t = b.id !== 'spirit' && it.title ? ` · "${clean(it.title, 48)}"` : '';
    const v = it.vibe || {};
    const dur = v.duration ? ` ${v.duration >= 60 ? `${Math.floor(v.duration / 60)}:${String(Math.round(v.duration % 60)).padStart(2, '0')}` : `${Math.round(v.duration * 10) / 10}s`}` : '';
    return `REFERENCE ${n}${t} (${KIND(it)}${dur})`;
  }
  function ownerLines(it, b) {
    const out = [];
    const note = clean(it.note || (it.type === 'note' || it.type === 'text' ? it.text : ''), 160);
    if (note) out.push(`my note: "${note}"`);
    if (b.id !== 'spirit' && it.tags?.length) out.push(`tags: ${it.tags.map((t) => `#${t}`).join(' ')}`);
    if (b.id === 'close' && it.alt) out.push(`seen: "${clean(it.alt, 160)}"`);
    if (it.footage && it.src) out.push(`FOOTAGE ALLOWED by the owner (you may use this file itself): ${it.src}`);
    return out;
  }
  function itemBlock(it, n, b) {
    const lines = [head(it, n, b)];
    const st = status(it);
    if (it.type === 'swatch' || it.type === 'palette') {
      const cols = (it.colors || [it.color]).filter(Boolean);
      lines.push(b.id === 'spirit' ? `colours I picked: ${families(cols.map((hex) => ({ hex })), 4).join(', ')}` : `colours I picked: ${cols.map((hex) => `${hex} (${D.colorName(hex)})`).join(', ')}`);
    } else if (st.state === 'measuring') lines.push('still being measured: its qualities aren\'t ready yet, so don\'t guess them (I\'ll send them again once they are).');
    else if (st.state === 'failed') lines.push(`couldn't be measured (${st.reason}). Leave it out rather than guess what it looks like.`);
    else if (st.state === 'ready') {
      lines.push(...vibeLines(it.vibe, b));
      if (it.vibe.moods?.length) lines.push(`mood: ${it.vibe.moods.join(', ')}`);
      if (b.id !== 'spirit' && (it.fonts?.heading || it.fonts?.body)) lines.push(`type: ${[it.fonts.heading, it.fonts.body].filter(Boolean).join(' / ')}`);
    }
    lines.push(...ownerLines(it, b));
    return lines.map((l, i) => (i ? `  - ${l}` : l)).join('\n');
  }

  // ---------- a blend of several measured references ----------
  function blend(items) {
    const ready = (items || []).filter((it) => status(it).state === 'ready');
    const vs = ready.map((it) => it.vibe);
    const weight = (it) => (it.stamp === '★' || it.stamp === '♥' || it.like ? 1.4 : 1);
    const ws = ready.map(weight); const wsum = ws.reduce((a, b) => a + b, 0) || 1;
    const mean = (k) => { const pairs = vs.map((v, i) => [v[k], ws[i]]).filter(([x]) => x != null && Number.isFinite(+x)); if (!pairs.length) return null; const t = pairs.reduce((a, [, w]) => a + w, 0); return r2(pairs.reduce((a, [x, w]) => a + x * w, 0) / t); };
    const swatches = (items || []).filter((it) => it.type === 'swatch' || it.type === 'palette').map((it) => (it.colors || [it.color]).filter(Boolean).map((hex, _i, all) => ({ hex, share: 1 / all.length })));
    const out = {
      count: ready.length, palette: V.mergePalettes([...vs.map((v) => v.palette), ...swatches], [...ws, ...swatches.map(() => 1.2)]),
      light: mean('light'), contrast: mean('contrast'), sat: mean('sat'), warmth: mean('warmth'), colorful: mean('colorful'), edges: mean('edges'), grain: mean('grain'),
      space: mean('space'), symmetry: mean('symmetry'), centered: mean('centered'), thirds: mean('thirds'), horizon: null,
    };
    const cs = vs.filter((v) => v.centroid);
    if (cs.length) out.centroid = [r2(cs.reduce((a, v) => a + v.centroid[0], 0) / cs.length), r2(cs.reduce((a, v) => a + v.centroid[1], 0) / cs.length)];
    const sh = vs.filter((v) => v.shape);
    if (sh.length) out.shape = { straight: r2(sh.reduce((a, v) => a + v.shape.straight, 0) / sh.length), diagonal: r2(sh.reduce((a, v) => a + v.shape.diagonal, 0) / sh.length), spread: r2(sh.reduce((a, v) => a + v.shape.spread, 0) / sh.length) };
    const clips = vs.filter((v) => v.motion != null);
    if (clips.length) {
      out.motion = r2(clips.reduce((a, v) => a + v.motion, 0) / clips.length);
      const paces = clips.map((v) => v.pace).filter((x) => x != null);
      if (paces.length) out.pace = r2(paces.reduce((a, b) => a + b, 0) / paces.length);
      out.cutsPerMin = Math.round(clips.reduce((a, v) => a + (v.cutsPerMin || 0), 0) / clips.length);
      out.cutCount = clips.reduce((a, v) => a + (v.cutCount || 0), 0);
    }
    const seen = new Map(); for (const v of vs) for (const m of v.moods || []) seen.set(m, (seen.get(m) || 0) + 1);
    out.moods = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m).slice(0, 5);
    return out;
  }
  function blendLines(items, b) {
    const m = blend(items);
    const lines = [];
    if (m.count) {
      lines.push(...vibeLines(m, b));
      if (m.moods.length) lines.push(`mood: ${m.moods.join(', ')}`);
    }
    return { m, lines };
  }

  // ---------- the block a chat gets ----------
  // items: the references (one, a 2–3 blend, or a whole board); blend: true mixes them into one look (a board with more
  // than 6 references is always blended, so it stays short). Returns the text.
  function block(items, { distance = DEFAULT_DISTANCE, blend: mix = false, board = null, brief = '', avoid = [], rule = true } = {}) {
    const list = (items || []).filter((it) => it && it.type !== 'frame' && it.type !== 'link' && !it.hidden);
    const b = band(distance);
    const n = distanceOf(distance);
    const out = ['MOODBOARD QUALITIES: measured from my references. The pictures themselves were NOT sent; work from these qualities.'];
    if (board) out[0] = `MOODBOARD QUALITIES from my board "${clean(board, 60)}": measured from my references. The pictures themselves were NOT sent; work from these qualities.`;
    const likes = list.filter((it) => clean(it.like, LIKE_MAX));
    if (likes.length) {
      out.push('', 'WHAT I LIKE (the strongest signal: follow this before anything else below):');
      for (const it of likes) out.push(`- ${list.length > 1 ? `reference ${list.indexOf(it) + 1}: ` : ''}"${clean(it.like, LIKE_MAX)}"`);
    }
    if (brief) out.push('', `BRIEF: ${clean(brief, 300)}`);
    out.push('', `DISTANCE: ${b.name} (${n}/100). ${b.lead}${b.id === 'spirit' ? ` ${SPIRIT_RULE}` : ''}`);
    const media = list.filter((it) => MEDIA.includes(it.type) || it.type === 'swatch' || it.type === 'palette');
    const words = list.filter((it) => !media.includes(it));
    const blendIt = mix || media.length > 6;
    if (blendIt && media.length) {
      const { m, lines } = blendLines(media, b);
      const waiting = media.filter((it) => status(it).state === 'measuring');
      const failed = media.filter((it) => status(it).state === 'failed');
      out.push('', `BLEND OF ${media.length} REFERENCES (mix them into one look${m.count < media.length ? `; ${m.count} measured` : ''}):`);
      if (!m.count && !lines.length) out.push('  - none of them is measured yet: their qualities aren\'t ready, so don\'t guess them.');
      for (const l of lines) out.push(`  - ${l}`);
      if (waiting.length) out.push(`  - still being measured, not in the blend yet: ${waiting.map((it) => (b.id !== 'spirit' && it.title ? `"${clean(it.title, 40)}"` : KIND(it))).join(', ')}`);
      if (failed.length) out.push(`  - couldn't be measured, left out: ${failed.map((it) => `${b.id !== 'spirit' && it.title ? `"${clean(it.title, 40)}"` : KIND(it)} (${status(it).reason})`).join(', ')}`);
      const own = media.flatMap((it) => ownerLines(it, b));
      for (const l of own.slice(0, 8)) out.push(`  - ${l}`);
    } else {
      media.forEach((it) => out.push('', itemBlock(it, list.indexOf(it) + 1, b)));
    }
    if (words.length) {
      out.push('', 'MY WORDS ON THE BOARD:');
      for (const it of words.slice(0, 8)) { const t = clean(it.type === 'note' || it.type === 'text' ? it.text : it.note || it.title, 160); if (t) out.push(`- "${t}"`); }
    }
    if (avoid.length) {
      out.push('', 'AVOID looking like:');
      for (const it of avoid.slice(0, 4)) { const v = it.vibe; out.push(`- ${v && v.light != null ? vibeLines(v, BANDS[2]).join('; ') : clean(it.note || it.text || it.title || KIND(it), 120)}`); }
    }
    if (rule) out.push('', b.id === 'spirit' ? `${RULE} ${SPIRIT_RULE}` : RULE);
    return out.join('\n');
  }

  // a short summary for the blend card / tooltips: palette + a few words
  function card(items, distance = DEFAULT_DISTANCE) {
    const m = blend(items);
    const words = m.count ? [m.light != null ? `${W.keyWord(m.light)} ${num(m.light)}` : null, m.contrast != null ? `${W.contrastWord(m.contrast)} contrast` : null, m.warmth != null ? W.warmWord(m.warmth) : null, m.sat != null ? W.satWord(m.sat) : null, m.grain != null ? W.grainWord(m.grain) : null, shapeWord(m), m.motion != null ? `motion ${W.motionWord(m.motion)}` : null].filter(Boolean) : [];
    return { palette: m.palette, words, moods: m.moods, measured: m.count, waiting: items.filter(needsMeasuring).length, failed: items.filter((it) => status(it).state === 'failed').length, band: band(distance) };
  }

  return { block, blend, card, status, needsMeasuring, band, distanceOf, shapeWord, BANDS, DEFAULT_DISTANCE, LIKE_MAX, RULE, SPIRIT_RULE, MEDIA };
})();
if (typeof module !== 'undefined') module.exports = BoardQualities;
