// "Describe it" (round 29, instantscene): a sentence → 3 scene picks, with no model call. Pure functions (no DOM;
// loads in Node for dev/instantscene-test.js):
//   read(text)                 what the words say: tags, moods, kinds, colors, speed ×, intensity ×, looks, palette
//                              families, a music reaction (or none), quoted text, which words matched
//   catalog(src)               everything Hearth already has as starting points: the gallery's starting points, the
//                              library's layer templates, the particles / physics / type presets
//   plan(text, src, { offset }) → { read, picks: [3 × { base, grade, palette, speed, intensity, react, why, name }] }
//   tune(code, pick)           a layer's code with its sliders set from the words (colors, speed, intensity, music)
//   looksLikeDescription(q)    a gallery search that reads like a description ("Make it from my words")
//   brief(pick, text) / cost(text)  the optional message to the director and its size in tokens
const InstantCore = (() => {
  const D = typeof InstantData !== 'undefined' ? InstantData : (typeof require !== 'undefined' ? require('./three-instant-data.js') : null);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, n = 100) => Math.round(v * n) / n;

  // ---------- reading the words ----------
  function read(text) {
    const raw = String(text || '');
    const quoted = (raw.match(/["“”«»]([^"“”«»]{1,40})["“”«»]/) || [])[1] || null;
    let s = ` ${norm(raw).replace(/["“”«»][^"“”«»]{1,40}["“”«»]/g, ' ').replace(/[^a-z0-9&/'\- ]+/g, ' ')} `;
    for (const [a, b] of D.PHRASES) s = s.split(` ${a} `).join(` ${b} `).split(` ${a} `).join(` ${b} `);
    const toks = s.split(/[\s,.;:!?]+/).filter(Boolean);
    const r = { text: raw.trim(), quoted, tags: new Map(), neg: new Map(), moods: new Map(), kinds: new Map(), grades: new Map(), pals: new Map(), colors: [], colorWords: [], speed: 1, intensity: 1, features: [], verbs: [], still: false, matched: [], unknown: [], words: [] };
    const addTo = (m, k, w) => { if (k) m.set(k, (m.get(k) || 0) + w); };
    let neg = 0; let mult = 1;
    for (const t0 of toks) {
      const t = t0.replace(/^'+|'+$/g, '');
      if (!t) continue;
      if (D.NOT.has(t)) { neg = 2; continue; } // the next word or two (not too fast · no text)
      if (D.BOOST[t]) { mult = D.BOOST[t]; continue; }
      if (D.DAMP[t]) { mult = D.DAMP[t]; continue; }
      const isNeg = neg > 0;
      const e = D.WORDS[t] || D.WORDS[t.replace(/(es|s)$/, '')] || null;
      const color = D.COLORS[t] || null;
      if (!e && !color) {
        if (D.STOP.has(t) || t.length < 3 || /^\d+$/.test(t)) { if (neg) neg -= 1; continue; }
        r.unknown.push(t); r.words.push(t);
        if (isNeg) addTo(r.neg, t, 1); else addTo(r.tags, t, 0.8);
        neg = 0; mult = 1;
        continue;
      }
      r.words.push(t);
      r.matched.push(isNeg ? `no ${t}` : t);
      if (color && !isNeg) { r.colors.push(color); r.colorWords.push(t); addTo(r.tags, t, 0.3); }
      if (e) {
        const k = (f) => (f == null ? 1 : isNeg ? Math.sqrt(1 / f) : 1 + (f - 1) * mult); // "not too fast": a bit slower
        if (e.speed) r.speed *= Math.max(0.15, k(e.speed));
        if (e.intensity) r.intensity *= Math.max(0.3, k(e.intensity));
        if (isNeg) {
          addTo(r.neg, t, 1);
          for (const g of String(e.tags || '').split(/\s+/).filter(Boolean)) addTo(r.neg, g, 0.5);
          if (e.feature || e.verb) r.still = true; // "doesn't react to the kick"
        } else {
          // what the scene is (tunnel, blob, particles…) weighs more than how it feels (dreamy, dark…)
          const style = !e.subj && (e.mood || e.grade || e.pal);
          addTo(r.tags, t, e.subj ? 1.4 : style ? 0.8 : 1);
          String(e.tags || '').split(/\s+/).filter(Boolean).forEach((g, i) => { if (g !== t) addTo(r.tags, g, style ? (i === 0 ? 0.35 : 0.25) : (i === 0 ? 0.7 : 0.5)); });
          addTo(r.moods, e.mood, 1); addTo(r.kinds, e.kind, 1); addTo(r.grades, e.grade, 1); addTo(r.pals, e.pal, 1);
          if (e.feature) r.features.push(e.feature);
          if (e.verb) r.verbs.push(e.verb);
          if (e.still) r.still = true;
        }
      }
      neg = 0; mult = 1;
    }
    r.speed = round(clamp(r.speed, 0.2, 3));
    r.intensity = round(clamp(r.intensity, 0.4, 2));
    if (r.quoted) addTo(r.kinds, 'type', 1.5);
    r.react = r.still ? null : reactOf(r.features, r.verbs);
    return r;
  }
  // the reaction preset a sound + a verb make ("pulses on the kick" → Pump on kick)
  function reactOf(features, verbs) {
    const f = features[0]; const v = verbs[0];
    if (f) return D.REACT[f]?.[v] || D.REACT[f]?._ || null;
    if (v) return D.REACT._[v] || null;
    return null;
  }

  // ---------- what Hearth has ----------
  // src: { starts, moods, templates, particles, physics, type, grades, palettes, reactions } (each optional)
  const SKIP = { particles: /^(modeldust|glowrise|picture)$/, physics: /^(models|sandbox)$/, type: /^(karaoke|oneword|scroll|fades|typed|lyric3d)$/ };
  const LIB = /^(Backgrounds|Visualizers|3D|Shaders|Particles|Physics|Type)$/;
  function catalog(src = {}) {
    const out = [];
    const moodLabel = (id) => (src.moods || []).find((m) => m.id === id)?.label || D.MOODS[id] || '';
    for (const s of src.starts || []) out.push({ key: `b:${s.id}`, kind: 'start', id: s.id, name: s.name, desc: s.desc || '', tags: `${s.tags || ''}`, mood: s.mood, cat: moodLabel(s.mood), family: `start:${s.mood}` });
    for (const t of src.templates || []) if (LIB.test(t.cat || '')) out.push({ key: `l:${t.id}`, kind: 'lib', id: t.id, name: String(t.name || '').replace(/^[^\w(]+\s*/u, ''), desc: t.desc || '', tags: `${t.tags || ''} ${t.cat}`, mood: null, cat: t.cat, family: `lib:${t.cat}` });
    for (const kind of ['particles', 'physics', 'type']) {
      for (const p of src[kind] || []) {
        if (SKIP[kind].test(p.id)) continue;
        out.push({ key: `${kind[0]}${kind[1]}:${p.id}`, kind, id: p.id, name: p.name, desc: p.desc || '', tags: `${kind} ${p.cat || ''}${kind === 'type' ? ' text title words' : ''}`, mood: kind === 'type' ? 'type' : null, cat: p.cat, family: `${kind}:${p.cat}` });
      }
    }
    for (const b of out) {
      b.hay = { name: toks(b.name), tags: toks(b.tags), desc: toks(`${b.desc} ${b.cat}`) };
    }
    return out;
  }
  function toks(s) { return new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1)); }
  // a query word matches a hay word when one starts with the other (tunnel ~ tunnels, burst ~ bursting), 3+ letters
  // (1: the same word · 0.7: one starts with the other · 0)
  function has(set, w) {
    if (set.has(w)) return 1;
    if (w.length < 4) return 0;
    for (const x of set) if (x.length >= 4 && (x.startsWith(w) || w.startsWith(x))) return 0.7;
    return 0;
  }
  function scoreBase(r, b) {
    let score = 0; const hits = [];
    for (const [w, wt] of r.tags) {
      const f = Math.max(3 * has(b.hay.name, w), 2 * has(b.hay.tags, w), has(b.hay.desc, w));
      if (f) { score += wt * f; if (wt >= 0.8) hits.push(w); }
    }
    for (const [w, wt] of r.neg) if (has(b.hay.name, w) || has(b.hay.tags, w)) score -= wt * 3;
    if (b.mood && r.moods.has(b.mood)) score += 1.5 * r.moods.get(b.mood);
    if (r.kinds.has(b.kind)) score += 1.2 * r.kinds.get(b.kind);
    const noText = r.neg.has('text') || r.neg.has('type') || r.neg.has('words') || r.neg.has('title');
    if (r.neg.has(b.kind) || ((b.kind === 'type' || b.mood === 'type') && noText)) score -= 4;
    if (score > 0) score += b.kind === 'start' ? 0.6 : b.kind === 'lib' ? -0.2 : 0; // the gallery's whole scenes first, on a tie
    if (b.kind === 'type' && !r.kinds.has('type')) score -= 1; // text only when asked for
    return { score: round(score), hits: [...new Set(hits)] };
  }

  // ---------- looks, palettes, reactions ----------
  function rankGrades(r, grades = []) {
    const out = [];
    for (const g of grades) {
      if (g.id === 'neutral') continue;
      let s = (r.grades.get(g.id) || 0) * 3;
      const hay = toks(`${g.name} ${g.desc || ''}`);
      for (const w of r.words) if (has(hay, w)) s += 0.5;
      if (s > 0) out.push({ g, s });
    }
    return out.sort((a, b) => b.s - a.s).map((x) => x.g);
  }
  // a mood's own look when the words named none
  const MOOD_GRADE = { neon: 'neon', chrome: 'commercial', dreamy: 'golden', dark: 'night', club: 'neon', type: 'print' };
  const hex2rgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = (c) => `#${c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
  function hsl(h) {
    const [r, g, b] = hex2rgb(h).map((v) => v / 255);
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
    return [hh, s, l];
  }
  const lum = (h) => { const [r, g, b] = hex2rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  // how close two colors are, 0..1: hue for colorful ones, lightness for greys / black / white
  function sim(a, b) {
    const A = hsl(a); const B = hsl(b);
    if (A[1] < 0.15 || A[2] < 0.08 || A[2] > 0.93) return Math.max(0, 1 - Math.abs(A[2] - B[2]) * 2.2) * (B[1] < 0.35 ? 1 : 0.5);
    if (B[1] < 0.2 || B[2] < 0.1 || B[2] > 0.95) return 0;
    const dh = Math.min(Math.abs(A[0] - B[0]), 360 - Math.abs(A[0] - B[0]));
    return Math.max(0, 1 - dh / 40) * (0.6 + 0.4 * Math.min(1, B[1] / Math.max(0.3, A[1])));
  }
  function rankPalettes(r, palettes = []) {
    const out = [];
    for (const p of palettes) {
      let s = 0;
      for (const c of r.colors) s += Math.max(0, ...p.colors.map((x) => sim(c, x))) * 2;
      for (const [fam, w] of r.pals) if (norm(p.cat) === norm(fam) || norm(p.name) === norm(fam)) s += w * (r.colors.length ? 0.6 : 1.2);
      const hay = toks(p.name);
      for (const w of r.words) if (!D.COLORS[w] && has(hay, w)) s += 1.5;
      if (s > 0.6) out.push({ p, s });
    }
    return out.sort((a, b) => b.s - a.s).map((x) => x.p);
  }
  const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));
  // a 5-color palette made from the colors said, dark → light (pastel / dark words move it)
  function customPalette(r) {
    if (!r.colors.length) return null;
    const cs = [...new Set(r.colors)];
    const main = cs[0]; const second = cs[1] || null; const last = cs[cs.length - 1];
    const dark = r.moods.has('dark') || r.grades.has('night');
    const soft = r.moods.has('dreamy') || r.pals.has('Pastel');
    let pal = [mix(main, '#000000', dark ? 0.92 : 0.82), mix(second || main, '#000000', 0.45), main, second || mix(main, '#ffffff', 0.35), mix(last, '#ffffff', 0.75)];
    if (cs.length > 2) pal = [mix(main, '#000000', dark ? 0.92 : 0.82), main, cs[1], cs[2], mix(cs[cs.length - 1], '#ffffff', 0.7)];
    if (soft) pal = pal.map((c, i) => (i ? mix(c, '#ffffff', 0.25) : mix(c, '#20142a', 0.4)));
    return { name: `Your ${r.colorWords.slice(0, 3).join(' & ')}`, cat: 'yours', colors: pal };
  }

  // ---------- 3 different picks ----------
  function plan(text, src = {}, { offset = 0, n = 3, bases = null } = {}) {
    const r = read(text);
    const all = bases || catalog(src);
    const scored = all.map((b) => ({ b, ...scoreBase(r, b) })).sort((x, y) => y.score - x.score || x.b.key.localeCompare(y.b.key));
    // diversified order: each next pick from a family not used yet (a different mood or kind of layer)
    const order = []; const fam = new Set(); const pool = scored.filter((x) => x.score > 0);
    for (let guard = 0; guard < 12 && order.length < Math.min(12, pool.length); guard += 1) {
      const free = (x) => !order.includes(x) && !order.some((o) => o.b.name === x.b.name); // (two library items can share a name)
      const nx = pool.find((x) => free(x) && !fam.has(x.b.family)) || pool.find(free);
      if (!nx) break;
      order.push(nx); fam.add(nx.b.family);
      if (fam.size >= 6) fam.clear();
    }
    // too few matches: the gallery's starting points in the words' mood, then the rest (never fewer than n picks)
    for (const x of scored) { if (order.length >= offset + n) break; if (!order.includes(x) && x.b.kind === 'start' && (!r.moods.size || r.moods.has(x.b.mood))) order.push(x); }
    for (const x of scored) { if (order.length >= offset + n) break; if (!order.includes(x) && x.b.kind === 'start' && x.score >= 0) order.push(x); }
    const grades = rankGrades(r, src.grades || []);
    const named = rankPalettes(r, src.palettes || []);
    const own = customPalette(r);
    const pals = [...(own ? [own] : []), ...named];
    const reaction = r.react ? (src.reactions || []).find((p) => p.id === r.react) || { id: r.react, name: r.react } : null;
    const gradeBy = (id) => (src.grades || []).find((g) => g.id === id) || null;
    const picks = order.slice(offset, offset + n).map((x, i) => {
      const j = offset + i;
      // the words' looks in order; the third pick tries its own mood's look when the words named fewer than 3
      const moodGrade = gradeBy(MOOD_GRADE[x.b.mood || [...r.moods.keys()][0]]);
      const grade = (j % 3 === 2 && grades.length < 3 && moodGrade) || grades[j] || grades[0] || moodGrade || null;
      const palette = pals.length ? pals[j % pals.length] : null;
      return mk(r, x, { grade, palette, reaction });
    });
    return { read: r, picks, more: order.length > offset + n };
  }
  function mk(r, x, { grade, palette, reaction }) {
    const why = [];
    if (x.hits.length) why.push(`${x.hits.slice(0, 4).join(' + ')} → ${x.b.name}`);
    else why.push(`${x.b.name} (closest in the mood)`);
    if (palette) why.push(palette.cat === 'yours' ? 'your colors' : r.colorWords.length ? `${r.colorWords.join(' + ')} → ${palette.name}` : `palette: ${palette.name}`);
    if (grade) why.push(`look: ${grade.name}`);
    if (r.speed !== 1) why.push(`speed ×${r.speed}`);
    if (r.intensity !== 1) why.push(`${r.intensity > 1 ? 'stronger' : 'softer'} ×${r.intensity}`);
    if (reaction) why.push(`♪ ${reaction.name}`);
    else if (r.still) why.push('♪ no music reaction');
    return { base: x.b, score: x.score, hits: x.hits, grade, palette, reaction, speed: r.speed, intensity: r.intensity, still: r.still, features: r.features.slice(), quoted: r.quoted, why, name: nameOf(r, x.b) };
  }
  // the new scene's name: the words that say what it is ("Dreamy pink chrome tunnel"), else the base's
  function nameOf(r, b) {
    const keep = r.words.filter((w) => { const e = D.WORDS[w]; return D.COLORS[w] || (e && (e.tags || e.mood || e.grade) && !e.feature && !e.verb) || (!e && !D.COLORS[w]); }).slice(0, 4);
    if (keep.length < 2) return b.name;
    const s = keep.join(' ').replace(/-/g, ' ');
    return s[0].toUpperCase() + s.slice(1);
  }

  // ---------- sliders from the words ----------
  const LINE = /^(\s*)([A-Za-z_$][\w$]*):\s*\{\s*value:\s*('(?:[^'\\]|\\.)*'|true|false|-?[\d.]+(?:e-?\d+)?)\s*,(.*)\}\s*,?\s*$/;
  const num = (rest, k) => { const m = rest.match(new RegExp(`\\b${k}:\\s*(-?[\\d.]+)`)); return m ? Number(m[1]) : null; };
  const str = (rest, k) => (rest.match(new RegExp(`\\b${k}:\\s*'((?:[^'\\\\]|\\\\.)*)'`)) || [])[1] || '';
  const SPEED = /speed|flow|spin|drift|travel|swirl|orbit|rotat|scroll|rate\b|turn|roll|pace/i;
  const INTENS = /glow|bloom|bright|intens|punch|energy|strength|wobble|chaos|distort|flash|sheen|burst|power|exposure/i;
  const MUSIC = /kick|bass|snare|hats?\b|hi-?hat|drop|build|vocal|music|beat|audio|loud/i;
  const FEAT = { kick: /kick/i, snare: /snare|clap/i, hats: /hats?\b|hi-?hat|cymbal/i, drop: /drop/i, build: /build/i, bass: /bass|sub\b/i, vocals: /vocal|voice/i, beat: /beat|kick/i, loud: /loud|level/i };
  // opts: { palette: [hex], speed, intensity, features: [], still } → { code, changed: [{ key, label, from, to }] }
  function tune(code, opts = {}) {
    const lines = String(code).split('\n');
    const sl = [];
    lines.forEach((ln, i) => {
      const m = ln.match(LINE);
      if (!m) return;
      const rest = m[4];
      const label = str(rest, 'label'); const group = str(rest, 'group');
      if (!label && !/\bmin:/.test(rest)) return; // (a tweak() slider has a label or a range)
      sl.push({ i, pre: m[1], key: m[2], val: m[3], rest, label, group, min: num(rest, 'min'), max: num(rest, 'max'), step: num(rest, 'step'), options: /\boptions:/.test(rest) });
    });
    const changed = [];
    const set = (s, v) => { if (v === s.val) return; changed.push({ key: s.key, label: s.label || s.key, from: s.val, to: v }); lines[s.i] = lines[s.i].replace(LINE, (_a, pre, key, _v, rest) => `${pre}${key}: { value: ${v},${rest}},`); };
    const fmt = (s, v) => { let x = clamp(v, s.min ?? -Infinity, s.max ?? Infinity); if (s.step && s.step >= 1) x = Math.round(x); return String(round(x, 1000)); };
    // colors: the palette's light order follows the sliders' own (dark stays dark, the brightest stays brightest)
    const pal = (opts.palette || []).filter((h) => /^#[0-9a-f]{6}$/i.test(h));
    const cols = sl.filter((s) => /^'#[0-9a-f]{6}'$/i.test(s.val));
    if (pal.length && cols.length) {
      const byLum = [...pal].sort((a, b) => lum(a) - lum(b));
      if (cols.length === 1) {
        const vivid = [...pal].sort((a, b) => hsl(b)[1] * (1 - Math.abs(hsl(b)[2] - 0.55)) - hsl(a)[1] * (1 - Math.abs(hsl(a)[2] - 0.55)))[0];
        set(cols[0], `'${vivid}'`);
      } else {
        const ranked = [...cols].sort((a, b) => lum(a.val.slice(1, -1)) - lum(b.val.slice(1, -1)));
        ranked.forEach((s, k) => set(s, `'${byLum[Math.round((k / (ranked.length - 1)) * (byLum.length - 1))]}'`));
      }
    }
    for (const s of sl) {
      if (s.options || !/^-?[\d.]/.test(s.val)) continue;
      const v = Number(s.val);
      if (!Number.isFinite(v) || !v) continue;
      const words = `${s.key} ${s.label}`;
      const music = s.group === 'Music' || MUSIC.test(words);
      if (music) {
        if (opts.still) { if ((s.min ?? 0) <= 0) set(s, '0'); continue; }
        const f = (opts.features || []).find((k) => FEAT[k]?.test(words));
        let x = v * (f ? 1.5 : 1) * (opts.intensity && opts.intensity !== 1 ? opts.intensity : 1);
        if (x !== v) set(s, fmt(s, x));
        continue;
      }
      if (opts.speed && opts.speed !== 1 && SPEED.test(words) && !/size|scale/i.test(words)) { set(s, fmt(s, v * opts.speed)); continue; }
      if (opts.intensity && opts.intensity !== 1 && INTENS.test(words)) set(s, fmt(s, v * opts.intensity));
    }
    return { code: lines.join('\n'), changed };
  }

  // ---------- the gallery search, the director ----------
  function looksLikeDescription(q) {
    const r = read(q);
    const known = r.matched.length;
    const said = r.words.length;
    return known >= 2 || said >= 3 || (known >= 1 && (r.speed !== 1 || r.react != null || r.colors.length > 0) && said >= 2);
  }
  function brief(p, text) {
    const parts = [`started from ${p.base.name}`];
    if (p.palette) parts.push(`palette ${p.palette.name} (${p.palette.colors.join(' ')})`);
    if (p.grade) parts.push(`look ${p.grade.name} on ◐ Grade`);
    if (p.speed !== 1) parts.push(`speed ×${p.speed}`);
    if (p.intensity !== 1) parts.push(`intensity ×${p.intensity}`);
    if (p.reaction) parts.push(`♪ ${p.reaction.name}`);
    return `✦ Made from my words, no tokens so far: "${String(text).trim()}". It ${parts.join(', ')}. Take it further so it matches my words: keep its layers and sliders, change what's needed.`;
  }
  const cost = (text) => Math.ceil(String(text || '').length / 3.6);
  return { read, reactOf, catalog, scoreBase, rankGrades, rankPalettes, customPalette, plan, tune, nameOf, looksLikeDescription, brief, cost, sim, hsl, lum };
})();
if (typeof module !== 'undefined') module.exports = InstantCore;
