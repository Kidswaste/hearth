// ✨ "Make it look finished" (round 30, autopolish): the rules. No DOM, no tokens; loads in Node for the tests.
// A reading of the Lab scene (its picture read the way lookmatch reads one, a few frames for the motion, where the
// 9:16 apps put their buttons, its ◐ Grade / ◐ Film & lens values, its sliders and what they follow, the frame rate)
// goes through a short list of rules; each rule measures one thing (a number), says when it's off, and proposes a
// fix made only of slider / grade changes (or leaves it for the director when no slider can fix it).
//   PolishCore.picture(rgba, w, h) · gray(rgba, w, h) · motion(grays) · under(grays, w, h, zones) · clash(colors)
//   harmonize(colors) · propose(M) → { fixes, left, score } · merge(fixes, base) · score(M) · RULES · hsl / hex helpers
// M (the reading): { pic, motion: { motion, spread, flicker, n } | null, under: [{ id, label, k }] | null, frame: { id, ratio },
//   grade: {…} | null, lens: {…} | null, sliders: [{ layer, layerName, key, label, group, value, min, max, step,
//   options, followsMusic, live }], palette: [hex], sound: 'song' | 'live' | null, reactPlan: [{ layer, key, label,
//   band, amount }], perf: { fps, cap, light }, frozen }
const PolishCore = (() => {
  const LC = () => (typeof LookCore !== 'undefined' ? LookCore : require('./three-lookmatch-core.js'));
  const GC = () => (typeof GradeCore !== 'undefined' ? GradeCore : require('./three-grade-core.js'));
  const PC = () => { if (typeof PublishCore !== 'undefined') return PublishCore; try { return require('../publishkit-core.js'); } catch { return null; } };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const lumOf = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const lin = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const srgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055);
  const pct = (v) => `${Math.round(v * 100)} %`;

  // ---------- colors ----------
  function hexToHsl(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const r = ((n >> 16) & 255) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return `#${[r, g, b].map((v) => Math.round(clamp(v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
  }
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  // two hues that sit well together: the same family (≤ 35°), a triad (105–135°), complements (≥ 150°)
  const discordant = (d) => (d > 35 && d < 105) || (d > 135 && d < 150);
  // colors: [hex] or [{ hex, w }] → the vivid ones (grey, near black, near white don't clash)
  function vivid(colors) {
    return (colors || []).map((c) => (typeof c === 'string' ? { hex: c, w: 1 } : c)).filter((c) => /^#[0-9a-f]{6}$/i.test(c?.hex || ''))
      .map((c) => { const [h, s, l] = hexToHsl(c.hex); return { ...c, h, s, l }; }).filter((c) => c.s >= 0.3 && c.l >= 0.08 && c.l <= 0.92);
  }
  // how much the vivid colors clash: the share of hue pairs that sit badly (same-family hues merged first)
  function clash(colors) {
    const v = vivid(colors);
    const fam = [];
    for (const c of v.slice().sort((a, b) => (b.w || 1) - (a.w || 1))) if (!fam.some((f) => hueGap(f.h, c.h) <= 20)) fam.push(c);
    let pairs = 0; let bad = 0;
    for (let i = 0; i < fam.length; i += 1) for (let j = i + 1; j < fam.length; j += 1) { pairs += 1; if (discordant(hueGap(fam[i].h, fam[j].h))) bad += 1; }
    return { score: pairs ? r2(bad / pairs) : 0, pairs, bad, hues: fam.map((f) => Math.round(f.h)) };
  }
  // every vivid color moved to the nearest hue of a scheme built on the lead color (lead, its neighbour 30° to one side,
  // the complement and its neighbour): every pair of those sits well; saturation and lightness stay
  function harmonize(colors, { lead = null } = {}) {
    const list = (colors || []).map((c) => (typeof c === 'string' ? c : c.hex));
    const v = vivid(colors);
    if (!v.length) return { colors: list.slice(), moved: 0, lead: null };
    const L = lead != null ? lead : v.slice().sort((a, b) => (b.w || 1) - (a.w || 1))[0].h;
    let best = null;
    for (const side of [30, -30]) {
      const T = [L, L + side, L + 180, L + 180 + side];
      let cost = 0;
      const out = list.map((hex) => {
        if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return hex;
        const [h, s, l] = hexToHsl(hex);
        if (s < 0.3 || l < 0.08 || l > 0.92) return hex;
        const t = T.reduce((a, x) => (hueGap(h, x) < hueGap(h, a) ? x : a), T[0]);
        const g = hueGap(h, t); cost += g;
        return g < 4 ? hex : hslToHex(t, s, l);
      });
      if (!best || cost < best.cost) best = { colors: out, cost, side };
    }
    return { colors: best.colors, moved: best.colors.filter((c, i) => c !== list[i]).length, lead: Math.round(L), side: best.side };
  }

  // ---------- reading the picture ----------
  // lookmatch's reading (levels, saturation, palette, glow, clip…) + how much is pure black, how much is in the
  // shadows just above it, and how much is blown white
  function picture(data, w, h) {
    const a = LC().analyze(data, w, h);
    let crushed = 0; let shadows = 0; let whites = 0;
    const n = w * h;
    for (let i = 0; i < n; i += 1) {
      const y = lumOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      if (y < 0.02) crushed += 1; else if (y < 0.15) shadows += 1;
      if (y >= 0.96) whites += 1;
    }
    return { ...a, crushed: r3(crushed / n), shadows: r3(shadows / n), whites: r3(whites / n) };
  }
  function gray(data, w, h) { const g = new Uint8Array(w * h); for (let i = 0; i < w * h; i += 1) g[i] = Math.round(lumOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) * 255); return g; }
  const diff = (a, b) => { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i += 1) s += Math.abs(a[i] - b[i]); return n ? s / n / 255 : 0; };
  // a few frames (~0.2 s apart): how much changes from one to the next (motion), how much of the picture changes at
  // all (spread: a subject travelling changes a part, a flickering picture churns all of it) and how much the overall
  // brightness jumps (flicker). Sampled this far apart, travel and flicker look alike frame to frame; spread tells them apart.
  function motion(grays) {
    const g = (grays || []).filter(Boolean);
    if (g.length < 2) return null;
    let d1 = 0; let sp = 0; const means = [];
    for (const f of g) { let s = 0; for (let i = 0; i < f.length; i += 1) s += f[i]; means.push(s / f.length / 255); }
    for (let i = 0; i + 1 < g.length; i += 1) {
      d1 += diff(g[i], g[i + 1]);
      let c = 0; const a = g[i]; const b = g[i + 1];
      for (let k = 0; k < a.length; k += 1) if (Math.abs(a[k] - b[k]) > 20) c += 1;
      sp += c / a.length;
    }
    const n = g.length - 1;
    const mu = means.reduce((a, x) => a + x, 0) / means.length;
    const flicker = Math.sqrt(means.reduce((a, x) => a + (x - mu) ** 2, 0) / means.length);
    return { motion: r3(d1 / n), spread: r2(sp / n), flicker: r3(flicker), n: g.length };
  }
  // where the detail is under the app's own buttons (publishkit's safe areas): [{ id, label, k }]
  function under(grays, w, h, zones) {
    const P = PC();
    if (!P || !zones?.length || !grays?.length) return [];
    let heat = null;
    for (const g of grays) heat = P.heatAdd(heat, g, w, h);
    return P.underUI(heat, zones);
  }

  // ---------- the sliders ----------
  const isNum = (s) => s && s.min != null && s.max != null && !s.options && typeof s.value === 'number';
  const words = (s) => `${s.label || ''} ${s.key || ''} ${s.group || ''}`;
  const find = (M, re, skip = null) => (M.sliders || []).filter((s) => isNum(s) && re.test(words(s)) && !(skip && skip.test(words(s))));
  const SPEED = /\b(speed|rate|spin|rotat\w*|rot|flow|drift|orbit|tempo|time ?scale|velocity|swirl|turb\w*)\b|speed|spin/i;
  const SHAKY = /\b(shake|jitter|glitch|noise|wobble|chaos|flicker|strobe|random\w*)\b/i;
  const ZOOM = /\b(zoom|scale|size|radius|fov|dist|distance|camera ?z|cam ?z)\b/i;
  const BLOOM = /\b(bloom|glow|halo)\b/i;
  const SKIP = /\b(count|number|segments?|seed|resolution|quality|samples|steps|iterations|detail|layers?|octaves|grid|columns|rows|instances|min|max)\b/i;
  const toward = (s, k) => { const v = s.min + (s.value - s.min) * k; return s.step === 1 ? Math.round(v) : r3(v); };
  const move = (s, to) => ({ layer: s.layer, layerName: s.layerName, key: s.key, label: s.label, from: s.value, to: s.step === 1 ? Math.round(clamp(to, s.min, s.max)) : r3(clamp(to, s.min, s.max)) });

  // ---------- the rules ----------
  // read(M) → the number it watches (null: can't tell) · bad(v, M) → 0 (fine) … 1 (badly off) · fix(M, v) → a patch
  // { grade, lens, sliders, bindings, motions, palette, light } or null (then it's left for the director) · weight: how
  // much it counts in the score · what: the number's name · show(v): the number in words
  const gradeOf = (M) => ({ ...GC().defaults('grade'), ...(M.grade || {}) });
  const lensOf = (M) => (M.lens ? { ...GC().defaults('lens'), ...M.lens } : null);
  const dark = (M) => M.pic && M.pic.p95 < 0.45 && M.pic.mean < 0.2;
  const RULES = [
    { id: 'dark', title: 'Too dark', group: 'Exposure', weight: 18, what: 'brightest parts', show: pct,
      read: (M) => (M.pic ? M.pic.p95 : null), bad: (v, M) => (dark(M) ? clamp((0.45 - v) / 0.35) : 0),
      fix(M, v) {
        const g = gradeOf(M);
        const ev = clamp(Math.log2(lin(0.82) / Math.max(1e-4, lin(Math.max(0.02, v)))), 0.25, 3 - Math.max(0, g.exposure));
        if (ev < 0.2) return null;
        const to = Math.round((g.exposure + ev) * 20) / 20;
        return { grade: { exposure: to }, expect: srgb(Math.min(1, lin(v) * 2 ** (to - g.exposure))), why: `exposure +${r2(to - g.exposure)} stops` };
      } },
    { id: 'bright', title: 'Too bright', group: 'Exposure', weight: 12, what: 'average brightness', show: pct,
      read: (M) => (M.pic ? M.pic.mean : null), bad: (v, M) => (v > 0.72 && M.pic.whites > 0.12 ? clamp((v - 0.72) / 0.2) : 0),
      fix(M, v) { const g = gradeOf(M); const ev = clamp(Math.log2(lin(0.55) / lin(v)), -2, -0.2); const to = Math.round((g.exposure + ev) * 20) / 20; return { grade: { exposure: to }, expect: srgb(lin(v) * 2 ** ev), why: `exposure ${r2(ev)} stops` }; } },
    { id: 'whites', title: 'Clipped whites', group: 'Exposure', weight: 12, what: 'blown white', show: pct,
      read: (M) => (M.pic ? M.pic.whites : null), bad: (v, M) => (v > 0.05 && !(M.pic.mean > 0.72) ? clamp(v / 0.2) : 0),
      fix(M) { const g = gradeOf(M); return { grade: { ...(g.tone === 'none' ? { tone: 'agx' } : {}), gainLum: r2(clamp(g.gainLum - 0.12, -1, 1)) }, expect: 0.01, why: `${g.tone === 'none' ? 'tone mapping AgX, ' : ''}whites pulled down` }; } },
    { id: 'blacks', title: 'Crushed blacks', group: 'Exposure', weight: 8, what: 'pure black', show: pct,
      read: (M) => (M.pic ? M.pic.crushed : null),
      // a black background is a choice: only when the shadows fall straight into black over a real part of the picture
      bad: (v, M) => (v > 0.12 && v < 0.6 && M.pic.shadows < v * 0.3 && M.pic.q50 > 0.08 && !dark(M) ? clamp((v - 0.12) / 0.3) : 0),
      fix(M, v) { const g = gradeOf(M); return { grade: { liftLum: r2(clamp(g.liftLum + 0.06, -1, 1)) }, expect: r3(v * 0.4), why: 'a little lift in the blacks' }; } },
    { id: 'flat', title: 'Flat contrast', group: 'Contrast', weight: 10, what: 'tonal range', show: pct,
      read: (M) => (M.pic ? M.pic.p95 - M.pic.p5 : null), bad: (v, M) => (v < 0.42 && !dark(M) ? clamp((0.42 - v) / 0.3) : 0),
      fix(M, v) { const g = gradeOf(M); return { grade: { contrast: r2(clamp(g.contrast * 1.22, 0.5, 2)), cL1: r3(clamp(g.cL1 - 0.035, 0, 1)), cL3: r3(clamp(g.cL3 + 0.035, 0, 1)) }, expect: r3(Math.min(1, v * 1.3)), why: 'more contrast, a gentle S-curve' }; } },
    { id: 'glow-much', title: 'Too much glow', group: 'Bloom', weight: 8, what: 'glowing', show: pct,
      read: (M) => (M.pic ? M.pic.glow : null),
      bad: (v, M) => (v > 0.25 && ((lensOf(M)?.bloom || 0) > 0.25 || find(M, BLOOM).some((s) => s.value > s.min + (s.max - s.min) * 0.3)) ? clamp((v - 0.25) / 0.3) : 0),
      fix(M, v) {
        const l = lensOf(M); const sl = find(M, BLOOM).filter((s) => s.value > s.min + (s.max - s.min) * 0.3).slice(0, 2);
        const out = { expect: r3(v * 0.55), why: 'less bloom' };
        if (l && l.bloom > 0.25) out.lens = { bloom: r2(l.bloom * 0.5) };
        if (sl.length) out.sliders = sl.map((s) => move(s, toward(s, 0.55)));
        return out.lens || out.sliders ? out : null;
      } },
    { id: 'glow-none', title: 'Highlights without glow', group: 'Bloom', weight: 4, what: 'glowing', show: pct,
      read: (M) => (M.pic ? M.pic.glow : null),
      bad: (v, M) => (!(lensOf(M)?.bloom > 0) && !find(M, BLOOM).length && M.pic.p98 > 0.75 && M.pic.mean < 0.3 && v < 0.02 ? 0.6 : 0),
      fix: () => ({ lens: { bloom: 0.35, threshold: 0.7 }, expect: null, why: 'a soft bloom on the highlights' }) },
    { id: 'clash', title: 'Colors clashing', group: 'Color', weight: 12, what: 'color pairs clashing', show: pct,
      read: (M) => clash(colorsOf(M)).score, bad: (v, M) => (clash(colorsOf(M)).pairs >= 2 && v >= 0.34 ? clamp(v) : 0),
      fix(M) {
        const cs = colorSliders(M);
        if (cs.length >= 2) {
          const h = harmonize(cs.map((s) => ({ hex: s.value, w: 1 })), { lead: vivid([cs[0].value])[0]?.h ?? null });
          const sliders = cs.map((s, i) => ({ layer: s.layer, layerName: s.layerName, key: s.key, label: s.label, from: s.value, to: h.colors[i] })).filter((x) => x.to !== x.from);
          if (!sliders.length) return null;
          const pal = M.palette?.length ? harmonize(M.palette, { lead: h.lead }).colors : h.colors;
          return { sliders, palette: pal, expect: clash(h.colors).score, why: `${sliders.length} color${sliders.length === 1 ? '' : 's'} moved into one harmony` };
        }
        // no color sliders: the palette in harmony, and the loudest colors tamed on the grade
        const g = gradeOf(M);
        return { grade: { vibrance: r2(clamp(g.vibrance - 0.25, -1, 1)), saturation: r2(clamp(g.saturation * 0.9, 0, 2)) }, ...(M.palette?.length ? { palette: harmonize(M.palette).colors } : {}), expect: null, why: 'the loudest colors tamed', partly: true };
      },
      left: (M) => `the colors clash (hues ${clash(colorsOf(M)).hues.join('°, ')}°): bring them into one palette` },
    { id: 'safe', title: 'Under the app buttons', group: '9:16', weight: 10, what: 'detail under the buttons', show: (v) => (v ? `${r2(v)}×` : 'clear'),
      read: (M) => (M.under ? M.under.reduce((a, z) => Math.max(a, z.k || 0), 0) : null), bad: (v, M) => (M.under?.length ? clamp((v - 1) / 1.5, 0.3, 1) : 0),
      fix(M) {
        const z = find(M, ZOOM, SKIP)[0];
        if (!z) return null;
        const fov = /fov/i.test(words(z)); const far = /dist|camera ?z|cam ?z/i.test(words(z));
        const to = fov || far ? z.value * 1.15 : z.value * 0.86;
        if (Math.abs(to - z.value) < 1e-6 || to > z.max || to < z.min) return null;
        return { sliders: [move(z, to)], expect: null, why: `${z.label || z.key} ${fov || far ? 'up' : 'down'}: the picture pulls in from the edges` };
      },
      left: (M) => `keep the subject clear of ${M.under.map((z) => z.label).join(', ')} (the 9:16 safe area)` },
    { id: 'static', title: 'Too static', group: 'Motion', weight: 10, what: 'change between frames', show: (v) => `${(v * 100).toFixed(1)} %`,
      read: (M) => (M.motion && !M.frozen ? M.motion.motion : null), bad: (v) => (v < 0.004 ? clamp((0.004 - v) / 0.004, 0.4, 1) : 0),
      fix(M) {
        const sp = find(M, SPEED, SKIP).slice(0, 2);
        if (sp.length) return { sliders: sp.map((s) => move(s, s.value <= s.min + (s.max - s.min) * 0.02 ? s.min + (s.max - s.min) * 0.25 : s.min + (s.value - s.min) * 1.6)), expect: null, why: 'faster' };
        const live = (M.sliders || []).filter((s) => isNum(s) && s.live !== false && s.step !== 1 && !SKIP.test(words(s)) && !s.followsMusic && !s.motion).slice(0, 2);
        if (live.length) return { motions: live.map((s) => ({ layer: s.layer, layerName: s.layerName, key: s.key, label: s.label, from: s.motion || null, to: { kind: 'lfo', rate: 8, depth: 0.2 } })), expect: null, why: 'a slow wave on two sliders' };
        return null;
      },
      left: () => 'it barely moves: give it motion (camera drift, rotation, flow)' },
    { id: 'jitter', title: 'Jittery motion', group: 'Motion', weight: 8, what: 'change between frames', show: (v) => `${(v * 100).toFixed(1)} %`,
      read: (M) => (M.motion && !M.frozen ? M.motion.motion : null), bad: (v, M) => (v > 0.06 && ((M.motion.spread || 0) > 0.45 || (M.motion.flicker || 0) > 0.05) ? clamp((v - 0.06) / 0.12, 0.4, 1) : 0),
      fix(M) {
        const sh = [...find(M, SHAKY, SKIP), ...find(M, SPEED, SKIP)].filter((s, i, a) => a.indexOf(s) === i && s.value > s.min).slice(0, 3);
        return sh.length ? { sliders: sh.map((s) => move(s, toward(s, 0.6))), expect: null, why: 'calmer' } : null;
      },
      left: () => 'the motion flickers frame to frame: smooth it (ease, slower noise)' },
    { id: 'music', title: 'The music barely moves it', group: 'Music', weight: 10, what: 'reaction strength', show: (v) => (v ? pct(v) : 'none'),
      read: (M) => { if (!M.sound) return null; const b = (M.sliders || []).filter((s) => s.followsMusic); return b.length ? r2(b.reduce((a, s) => a + Math.abs(s.followsMusic.amount || 0), 0) / b.length) : 0; },
      bad: (v) => (v < 0.15 ? clamp((0.15 - v) / 0.15, 0.5, 1) : 0),
      fix(M, v) {
        const b = (M.sliders || []).filter((s) => s.followsMusic);
        if (b.length) return { bindings: b.map((s) => ({ layer: s.layer, layerName: s.layerName, key: s.key, label: s.label, from: s.followsMusic, to: { ...s.followsMusic, amount: r2(clamp((s.followsMusic.amount || 0.1) * 2.2, -0.5, 0.5) || 0.3) } })), expect: r2(clamp(v * 2.2, 0, 0.5)), why: 'stronger reactions' };
        const plan = (M.reactPlan || []).slice(0, 4);
        return plan.length ? { bindings: plan.map((p) => ({ layer: p.layer, layerName: p.layerName, key: p.key, label: p.label, from: null, to: { band: p.band, amount: p.amount } })), expect: r2(plan.reduce((a, p) => a + p.amount, 0) / plan.length), why: plan.map((p) => `${p.label} → ${p.band}`).join(', ') } : null;
      },
      left: () => 'make it react to the music (kick, bass, loudness)' },
    { id: 'fps', title: 'Frame rate dips', group: 'Speed', weight: 8, settle: true, what: 'frame rate', show: (v) => `${Math.round(v)} fps`,
      read: (M) => (M.perf?.fps ? M.perf.fps : null), bad: (v, M) => { const want = Number(M.perf.cap) || 60; return v < want * 0.75 && !M.perf.light ? clamp((want * 0.75 - v) / (want * 0.5), 0.3, 1) : 0; },
      fix: () => ({ light: true, expect: null, why: 'Light mode (30 fps, filters at half size; recordings stay full size)' }) },
  ];
  const BY = Object.fromEntries(RULES.map((r) => [r.id, r]));
  const notGrade = (s) => !/^◐/.test(s.layerName || '');
  const colorSliders = (M) => (M.sliders || []).filter((s) => typeof s.value === 'string' && /^#[0-9a-f]{6}$/i.test(s.value) && notGrade(s));
  // the colors that count: the scene's color sliders when it has some (they're its intent), else its picture's palette
  function colorsOf(M) {
    const cs = colorSliders(M);
    if (cs.length >= 2) return cs.map((s) => ({ hex: s.value, w: 1 }));
    return (M.pic?.palette || []).filter((c) => (c.share ?? 1) >= 0.06).map((c) => ({ hex: c.hex, w: c.share ?? 1 }));
  }

  // the score: 100 minus what each rule finds off (by its weight); only rules that could read count
  function score(M) {
    let lost = 0;
    for (const r of RULES) { const v = r.read(M); if (v == null) continue; lost += r.weight * (r.bad(v, M) || 0); }
    return Math.max(0, Math.round(100 - lost));
  }
  // every rule over the reading → the fixes (each with its own number before and the number it aims for) and what's
  // left for the director (a rule that's off but has no slider to fix it)
  function propose(M) {
    const fixes = []; const left = [];
    for (const r of RULES) {
      const v = r.read(M);
      if (v == null) continue;
      const sev = r.bad(v, M) || 0;
      if (sev <= 0) continue;
      if (r.id === 'whites' && fixes.some((f) => f.id === 'bright')) continue; // the exposure fix covers it
      if (r.id === 'glow-none' && fixes.some((f) => f.id === 'glow-much')) continue;
      const p = r.fix(M, v);
      const row = { id: r.id, title: r.title, group: r.group, what: r.what, sev: r2(sev), before: v, beforeText: r.show(v) };
      if (p) fixes.push({ ...row, ...p, expectText: p.expect != null ? r.show(p.expect) : '' });
      else left.push({ ...row, text: r.left ? r.left(M) : r.title.toLowerCase() });
      if (p?.partly && r.left) left.push({ ...row, text: r.left(M) });
    }
    return { fixes, left, score: score(M) };
  }
  // the ticked fixes as one change: the grade and lens values on top of the scene's own, the slider / binding / motion
  // moves (later fixes win on the same slider), the palette, Light mode
  function merge(fixes, M = {}) {
    const out = { grade: null, lens: null, sliders: [], bindings: [], motions: [], palette: null, light: null };
    const put = (list, x) => { const i = list.findIndex((y) => y.layer === x.layer && y.key === x.key); if (i >= 0) list[i] = { ...x, from: list[i].from }; else list.push(x); };
    for (const f of fixes) {
      if (f.grade) out.grade = { ...(out.grade || gradeOf(M)), ...f.grade };
      if (f.lens) out.lens = { ...(out.lens || lensOf(M) || GC().defaults('lens')), ...f.lens };
      for (const s of f.sliders || []) put(out.sliders, s);
      for (const b of f.bindings || []) put(out.bindings, b);
      for (const m of f.motions || []) put(out.motions, m);
      if (f.palette) out.palette = f.palette;
      if (f.light) out.light = true;
    }
    return out;
  }
  // what the director gets for what's left (≈ 60–160 tokens): what the local pass did, with its numbers, and what
  // it couldn't do with sliders
  function brief({ fixes = [], left = [], before = null, after = null, note = '' } = {}) {
    const did = fixes.map((f) => `${f.title.toLowerCase()} (${f.what ? `${f.what} ` : ''}${f.beforeText}${f.afterText ? ` → ${f.afterText}` : ''}: ${f.why})`);
    return [
      '🎨 Mission: polish the look. Keep the motion and the timing.',
      did.length ? `A local pass already did (keep these values, on ◐ Grade / the sliders): ${did.join('; ')}.` : 'A local pass found nothing it could fix with sliders.',
      left.length ? `Left for you: ${left.map((l) => l.text).join('; ')}.` : 'Nothing measurable is left: refine light, palette, glow and texture by eye.',
      before != null ? `Finish score ${before}${after != null ? ` → ${after}` : ''} / 100 (exposure, contrast, color harmony, safe area, motion, music, frame rate).` : '',
      note ? `\n${note}` : '',
    ].filter(Boolean).join('\n');
  }
  const cost = (text) => Math.ceil(String(text || '').length / 3.6);

  return { RULES, BY, picture, gray, motion, under, clash, harmonize, vivid, propose, merge, score, brief, cost, colorsOf, hexToHsl, hslToHex, hueGap, discordant };
})();
if (typeof module !== 'undefined') module.exports = PolishCore;
