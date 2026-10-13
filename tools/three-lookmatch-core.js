// "Make it look like this" (round 28, lookmatch): the numbers. No DOM, no tokens; loads in Node for the tests.
// A reference (a picture, a few frames of a video, a board item, a frame of a render) is read with the board's own vibe
// reader (board-vibe.js: palette + weights, light, contrast, saturation, warmth, grain, composition, motion for clips),
// plus what a grade needs that a vibe doesn't: the tone levels (black point, quartiles, white point), the tint of the
// shadows and of the highlights, the overall green / magenta lean, a color temperature in kelvin, the vignette, the
// glow, letterbox bars. match() turns the gap between the reference and the Lab's own picture into ◐ Grade values
// (tools/three-grade-core.js: curves, lift / gain, wheels, saturation, white balance, grain, vignette, bars) and
// ◐ Film & lens values (bloom, halation); refine() closes the rest from a read of the graded picture.
//   LookCore.analyze(rgba, w, h) · merge(frames) · match(ref, cur?) · refine(values, ref, got) · gap(a, b)
//   words(ref) · brief(ref, { title, kind, note }) · cost({ w, h }, text) · NEUTRAL
const LookCore = (() => {
  const BV = () => (typeof BoardVibe !== 'undefined' ? BoardVibe : require('../board-vibe.js'));
  const BD = () => (typeof BoardData !== 'undefined' ? BoardData : require('../board-data.js'));
  const GC = () => (typeof GradeCore !== 'undefined' ? GradeCore : require('./three-grade-core.js'));
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const lumOf = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };

  // ---------- letterbox bars: dark, flat rows (columns) at both ends ----------
  function barsOf(data, w, h) {
    const rowFlat = (y) => { let s = 0; let mx = 0; for (let x = 0; x < w; x += 1) { const i = (y * w + x) * 4; const v = lumOf(data[i], data[i + 1], data[i + 2]); s += v; if (v > mx) mx = v; } return s / w < 0.035 && mx < 0.09; };
    const colFlat = (x) => { let s = 0; let mx = 0; for (let y = 0; y < h; y += 1) { const i = (y * w + x) * 4; const v = lumOf(data[i], data[i + 1], data[i + 2]); s += v; if (v > mx) mx = v; } return s / h < 0.035 && mx < 0.09; };
    let top = 0; while (top < h * 0.3 && rowFlat(top)) top += 1;
    let bot = 0; while (bot < h * 0.3 && rowFlat(h - 1 - bot)) bot += 1;
    let left = 0; while (left < w * 0.3 && colFlat(left)) left += 1;
    let right = 0; while (right < w * 0.3 && colFlat(w - 1 - right)) right += 1;
    // both ends, a few % each, roughly even: bars (a dark sky alone isn't one)
    const tb = top > h * 0.04 && bot > h * 0.04 && Math.abs(top - bot) < h * 0.05;
    const lr = !tb && left > w * 0.04 && right > w * 0.04 && Math.abs(left - right) < w * 0.05;
    const box = { x: lr ? left : 0, y: tb ? top : 0, w: w - (lr ? left + right : 0), h: h - (tb ? top + bot : 0) };
    let name = 'off';
    if (tb || lr) {
      const ratio = box.w / Math.max(1, box.h);
      const named = GC().BARS.filter((b) => b !== 'off').map((b) => { const [a, c] = b.split(':').map(Number); return [b, a / (c || 1)]; });
      name = named.reduce((best, x) => (Math.abs(Math.log(x[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? x : best))[0];
    }
    return { name, box };
  }
  function crop(data, w, h, box) {
    if (box.x === 0 && box.y === 0 && box.w === w && box.h === h) return data;
    const out = new Uint8ClampedArray(box.w * box.h * 4);
    for (let y = 0; y < box.h; y += 1) out.set(data.subarray(((box.y + y) * w + box.x) * 4, ((box.y + y) * w + box.x + box.w) * 4), y * box.w * 4);
    return out;
  }

  // ---------- what a grade needs: levels, tints, temperature, vignette, glow ----------
  function tones(data, w, h) {
    const n = w * h;
    const Y = new Float32Array(n);
    for (let i = 0; i < n; i += 1) Y[i] = lumOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    const s = Float32Array.from(Y).sort();
    const q = (f) => s[Math.min(n - 1, Math.max(0, Math.floor(f * (n - 1))))];
    const lv = { p2: q(0.02), p5: q(0.05), q25: q(0.25), q50: q(0.5), q75: q(0.75), p95: q(0.95), p98: q(0.98) };
    // tints: each part's mean color minus its own grey (0..1 units), shadows = the darkest quarter, highlights = the top
    const acc = () => ({ r: 0, g: 0, b: 0, y: 0, n: 0 });
    const all = acc(); const lo = acc(); const hi = acc(); const mid = acc();
    let gm = 0; let glow = 0; let clip = 0;
    for (let i = 0; i < n; i += 1) {
      const r = data[i * 4]; const g = data[i * 4 + 1]; const b = data[i * 4 + 2]; const y = Y[i];
      const add = (a) => { a.r += r; a.g += g; a.b += b; a.y += y; a.n += 1; };
      add(all);
      if (y <= lv.q25) add(lo);
      if (y >= lv.q75) add(hi);
      if (y > lv.q25 && y < lv.q75) add(mid);
      gm += (g - (r + b) / 2) / 255;
      if (y > 0.9) glow += 1;
      if (y >= 0.99) clip += 1;
    }
    const tint = (a) => (a.n ? [r3(a.r / a.n / 255 - a.y / a.n), r3(a.g / a.n / 255 - a.y / a.n), r3(a.b / a.n / 255 - a.y / a.n)] : [0, 0, 0]);
    // color temperature (McCamy) of the mid-tones' mean, in linear light
    const src = mid.n ? mid : all;
    const R = lin(src.r / src.n); const G = lin(src.g / src.n); const B = lin(src.b / src.n);
    const X = 0.4124 * R + 0.3576 * G + 0.1805 * B; const Yy = 0.2126 * R + 0.7152 * G + 0.0722 * B; const Z = 0.0193 * R + 0.1192 * G + 0.9505 * B;
    const sum = X + Yy + Z || 1; const cx = X / sum; const cy = Yy / sum;
    const nn = (cx - 0.332) / (0.1858 - cy);
    const kelvin = Math.round(clamp(449 * nn ** 3 + 3525 * nn ** 2 + 6823.3 * nn + 5520.33, 1500, 15000) / 50) * 50;
    // vignette: the corners against the middle (0 = even, 0.5 = corners at half the light)
    let cS = 0; let cN = 0; let eS = 0; let eN = 0;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const dx = (x / (w - 1 || 1) - 0.5) * 2; const dy = (y / (h - 1 || 1) - 0.5) * 2; const d = Math.hypot(dx, dy) / Math.SQRT2;
      if (d < 0.35) { cS += Y[y * w + x]; cN += 1; } else if (d > 0.85) { eS += Y[y * w + x]; eN += 1; }
    }
    const center = cN ? cS / cN : 0; const edge = eN ? eS / eN : 0;
    const vignette = center > 0.06 ? r2(clamp(1 - edge / center, 0, 1)) : 0;
    return { ...Object.fromEntries(Object.entries(lv).map(([k, v]) => [k, r3(v)])), mean: r3(all.y / n), tint: tint(all), shadowTint: tint(lo), highTint: tint(hi), gm: r3(gm / n), kelvin, vignette, glow: r3(glow / n), clip: r3(clip / n) };
  }

  // One still (RGBA, w × h, ~200 px a side): the board's vibe of the picture inside the bars + the grade numbers.
  function analyze(data, w, h) {
    const bars = barsOf(data, w, h);
    const px = crop(data, w, h, bars.box);
    const v = BV().fromPixels(px, bars.box.w, bars.box.h);
    return { ...v, ...tones(px, bars.box.w, bars.box.h), bars: bars.name };
  }
  const NUM = ['light', 'contrast', 'sat', 'colorful', 'warmth', 'edges', 'grain', 'thirds', 'centered', 'symmetry', 'space', 'p2', 'p5', 'q25', 'q50', 'q75', 'p95', 'p98', 'mean', 'gm', 'kelvin', 'vignette', 'glow', 'clip'];
  // Several frames of a clip → one look (numbers averaged, palettes merged by weight, bars by majority).
  function merge(frames) {
    const list = frames.filter(Boolean);
    if (!list.length) return null;
    if (list.length === 1) return { ...list[0] };
    const avg = (k) => list.reduce((a, f) => a + (f[k] || 0), 0) / list.length;
    const vec = (k) => [0, 1, 2].map((i) => r3(list.reduce((a, f) => a + (f[k]?.[i] || 0), 0) / list.length));
    const out = { ...list[Math.floor(list.length / 2)] };
    for (const k of NUM) out[k] = k === 'kelvin' ? Math.round(avg(k) / 50) * 50 : r3(avg(k));
    for (const k of ['tint', 'shadowTint', 'highTint']) out[k] = vec(k);
    out.palette = BV().mergePalettes(list.map((f) => f.palette));
    const bars = list.map((f) => f.bars || 'off');
    out.bars = bars.filter((b) => b === bars[0]).length > list.length / 2 ? bars[0] : 'off';
    out.frames = list.length;
    return out;
  }

  // A typical Lab scene when its own picture can't be read (a dark-ish, colorful CG frame).
  const NEUTRAL = { p2: 0.01, p5: 0.03, q25: 0.18, q50: 0.38, q75: 0.6, p95: 0.88, p98: 0.95, mean: 0.4, sat: 0.45, warmth: 0, gm: 0, tint: [0, 0, 0], shadowTint: [0, 0, 0], highTint: [0, 0, 0], grain: 0.05, vignette: 0.05, glow: 0.02, bars: 'off', kelvin: 6500 };
  // piecewise-linear map through matching levels (the scene's → the reference's)
  function levelMap(cur, ref) {
    const xs = [cur.p5, cur.q25, cur.q50, cur.q75, cur.p95].map((x) => clamp(x ?? 0, 0, 1));
    const ys = [ref.p5, ref.q25, ref.q50, ref.q75, ref.p95].map((x) => clamp(x ?? 0, 0, 1));
    for (let i = 1; i < xs.length; i += 1) { xs[i] = Math.max(xs[i], xs[i - 1] + 0.03); ys[i] = Math.max(ys[i], ys[i - 1] + 0.005); }
    const X = [0, ...xs, 1]; const Yv = [clamp((ref.p5 ?? 0) - (cur.p5 ?? 0), 0, 0.45), ...ys, clamp(1 + (ref.p95 ?? 1) - (cur.p95 ?? 1), 0.4, 1)];
    for (let i = 1; i < Yv.length; i += 1) Yv[i] = Math.max(Yv[i], Yv[i - 1]);
    return (x) => {
      if (x <= X[0]) return Yv[0];
      for (let i = 1; i < X.length; i += 1) if (x <= X[i]) { const t = (x - X[i - 1]) / Math.max(1e-6, X[i] - X[i - 1]); return Yv[i - 1] + (Yv[i] - Yv[i - 1]) * t; }
      return Yv.at(-1);
    };
  }
  const sub = (a, b) => [0, 1, 2].map((i) => (a?.[i] || 0) - (b?.[i] || 0));
  // a tint vector (r, g, b around grey) → a wheel's hue and amount
  function wheelOf(v, gain = 4.5) {
    const mag = Math.hypot(...v);
    if (mag < 0.008) return { hue: null, amt: 0 };
    const k = 0.18 / mag;
    const [hue] = BD().rgbToHsl(...v.map((x) => clamp(0.5 + x * k, 0, 1) * 255));
    return { hue: Math.round(hue), amt: r2(clamp(mag * gain, 0, 0.6)) };
  }

  // The reference's look as ◐ Grade + ◐ Film & lens values, measured against the Lab's own picture (cur).
  function match(ref, cur = NEUTRAL, { strength = 1 } = {}) {
    cur = { ...NEUTRAL, ...(cur || {}) };
    const G = GC();
    const g = {}; const why = [];
    // 1. tone: a curve through the levels, the ends with lift (faded blacks) and gain (crushed whites)
    const M = levelMap(cur, ref);
    const pts = [0.25, 0.5, 0.75].map((x) => clamp(M(x), x - 0.24, x + 0.24));
    pts[1] = Math.max(pts[1], pts[0] + 0.04); pts[2] = Math.max(pts[2], pts[1] + 0.04);
    [g.cL1, g.cL2, g.cL3] = pts.map(r3);
    const mids = pts[1] - 0.5;
    if (Math.abs(mids) > 0.03) why.push(mids > 0 ? 'brighter mids' : 'darker mids');
    if ((pts[2] - pts[0]) - 0.5 > 0.06) why.push('more contrast'); else if (0.5 - (pts[2] - pts[0]) > 0.06) why.push('softer contrast');
    // (the ends move by how far the black and white points are apart, not where they sit)
    const black = (ref.p2 ?? ref.p5 ?? 0) - (cur.p2 ?? cur.p5 ?? 0); const white = (ref.p98 ?? ref.p95 ?? 1) - (cur.p98 ?? cur.p95 ?? 1);
    if (black > 0.025) { g.liftLum = r2(clamp(black * 6, 0, 0.7)); why.push('lifted, faded blacks'); }
    if (white < -0.03) { g.gainLum = r2(clamp(white * 2.5, -0.6, 0)); why.push('dimmer whites'); }
    // 2. color: saturation, white balance, the split between shadows and highlights
    if (ref.sat < 0.05) { g.saturation = 0; why.push('black & white'); } else {
      const s = clamp(ref.sat / Math.max(0.05, cur.sat), 0.15, 1.8);
      if (Math.abs(s - 1) > 0.05) { g.saturation = r2(s); why.push(s > 1 ? 'richer colors' : 'muted colors'); }
    }
    const dw = (ref.warmth || 0) - (cur.warmth || 0);
    if (Math.abs(dw) > 0.04) { g.temp = r2(clamp(dw * 0.9, -0.8, 0.8)); why.push(`${dw > 0 ? 'warmer' : 'cooler'}${ref.kelvin ? ` (≈${ref.kelvin.toLocaleString('en-US')} K)` : ''}`); }
    const dgm = (ref.gm || 0) - (cur.gm || 0);
    if (Math.abs(dgm) > 0.012) { g.tint = r2(clamp(-dgm * 7, -0.6, 0.6)); why.push(dgm > 0 ? 'a green lean' : 'a magenta lean'); }
    if (ref.sat >= 0.05) {
      const lo = wheelOf(sub(sub(ref.shadowTint, ref.tint), sub(cur.shadowTint, cur.tint)));
      const hi = wheelOf(sub(sub(ref.highTint, ref.tint), sub(cur.highTint, cur.tint)));
      if (lo.amt >= 0.06) { g.liftHue = lo.hue; g.liftAmt = lo.amt; }
      if (hi.amt >= 0.06) { g.gainHue = hi.hue; g.gainAmt = hi.amt; }
      if (g.liftAmt || g.gainAmt) why.push(`${[g.liftAmt ? `${BD().colorName?.(BD().hslHex(g.liftHue, 0.6, 0.4)) || 'tinted'} shadows` : '', g.gainAmt ? `${BD().colorName?.(BD().hslHex(g.gainHue, 0.6, 0.6)) || 'tinted'} highlights` : ''].filter(Boolean).join(', ')}`);
    }
    // 3. film: grain, vignette, letterbox
    const dg = (ref.grain || 0) - (cur.grain || 0);
    if (dg > 0.06) { g.grain = r2(clamp(dg * 0.85, 0.05, 0.7)); if (ref.grain > 0.5) g.grainSize = 2.2; why.push(ref.grain > 0.5 ? 'heavy grain' : 'fine grain'); }
    const dv = (ref.vignette || 0) - (cur.vignette || 0);
    if (dv > 0.08) { g.vignette = r2(clamp(dv * 1.6, 0.1, 0.8)); why.push('a vignette'); }
    if (ref.bars && ref.bars !== 'off' && (!cur.bars || cur.bars === 'off')) { g.bars = ref.bars; why.push(`${ref.bars} bars`); }
    g.amount = r2(clamp(strength, 0, 1));
    // 4. lens: a glow when the reference has more blown highlights; halation on warm, grainy film looks
    const l = {};
    const dglow = (ref.glow || 0) - (cur.glow || 0);
    if (dglow > 0.03) { l.bloom = r2(clamp(dglow * 5, 0.15, 0.8)); l.threshold = 0.75; why.push('a soft glow'); }
    if (ref.grain > 0.3 && ref.warmth > 0.15 && ref.glow > 0.015) { l.halation = 0.3; why.push('halation'); }
    const lens = Object.keys(l).length ? { ...G.defaults('lens'), ...l, amount: g.amount } : null;
    const grade = { ...G.defaults('grade'), ...g };
    for (const [k, v] of Object.entries(grade)) { const x = G.valueFor('grade', k, v); if (x !== undefined) grade[k] = x; }
    return { grade, lens, palette: (ref.palette || []).map((c) => c.hex).slice(0, 6), why, gap: gap(ref, cur) };
  }

  // One more step from a read of the graded picture (got): the tone points, saturation, warmth and grain move by what's
  // still off. Returns new grade values.
  function refine(values, ref, got) {
    const G = GC();
    const v = { ...values };
    const keys = [['cL1', 'q25', 0.25], ['cL2', 'q50', 0.5], ['cL3', 'q75', 0.75]];
    for (const [k, lvl, x] of keys) v[k] = clamp((v[k] ?? x) + ((ref[lvl] ?? 0) - (got[lvl] ?? 0)) * 0.8, x - 0.3, x + 0.3);
    v.cL2 = Math.max(v.cL2, v.cL1 + 0.04); v.cL3 = Math.max(v.cL3, v.cL2 + 0.04);
    if (ref.sat >= 0.05 && got.sat > 0.02) v.saturation = clamp((v.saturation ?? 1) * clamp(ref.sat / got.sat, 0.7, 1.4), 0.1, 2);
    v.temp = clamp((v.temp ?? 0) + ((ref.warmth || 0) - (got.warmth || 0)) * 0.6, -1, 1);
    if (ref.grain > 0.15) v.grain = clamp((v.grain ?? 0) + (ref.grain - (got.grain || 0)) * 0.5, 0, 0.8);
    for (const [k, x] of Object.entries(v)) { const c = G.valueFor('grade', k, typeof x === 'number' ? r3(x) : x); if (c !== undefined) v[k] = c; }
    return v;
  }

  // How far two looks are apart (0 = the same … 1 = opposite): levels, saturation, warmth, grain, palette's lead color.
  function gap(a, b) {
    if (!a || !b) return 1;
    const lv = ['p5', 'q25', 'q50', 'q75', 'p95'].reduce((s, k) => s + Math.abs((a[k] || 0) - (b[k] || 0)), 0) / 5;
    let d = lv * 0.45 + Math.abs((a.sat || 0) - (b.sat || 0)) * 0.25 + Math.abs((a.warmth || 0) - (b.warmth || 0)) * 0.15 + Math.abs((a.grain || 0) - (b.grain || 0)) * 0.15;
    const pa = a.palette?.[0]; const pb = b.palette?.[0];
    if (pa && pb) { const x = BD().hexToRgb(pa.hex); const y = BD().hexToRgb(pb.hex); d = d * 0.85 + (Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / 441) * 0.15; }
    return r3(clamp(d * 2.2));
  }
  const closeness = (a, b) => Math.round((1 - gap(a, b)) * 100);

  // ---------- words ----------
  function words(ref) {
    const w = BV().words;
    const out = [`${w.keyWord(ref.light)} (${r2(ref.light)})`, `${w.contrastWord(ref.contrast)} contrast`, w.satWord(ref.sat), `${w.warmWord(ref.warmth)} ≈${(ref.kelvin || 6500).toLocaleString('en-US')} K`, w.grainWord(ref.grain)];
    if (ref.motion != null) out.push(`${w.motionWord(ref.motion)} motion (${r2(ref.motion)})`);
    if (ref.bars && ref.bars !== 'off') out.push(`${ref.bars} bars`);
    return out;
  }
  // What the director gets with the small picture (≈ 90–150 tokens): the board's vibe line + the grade numbers, and
  // what's left for it to do (the colors are matched locally already).
  function brief(ref, { title = 'the reference', kind = 'image', note = '', graded = true } = {}) {
    const line = BV().text({ type: kind === 'clip' || kind === 'video' ? 'video' : 'image', title, vibe: ref }, ['palette', 'light', 'color', 'texture', 'motion', 'compose', 'mood']);
    const nums = `levels black ${r2(ref.p5)} · mids ${r2(ref.q50)} · white ${r2(ref.p95)}, ≈${(ref.kelvin || 6500).toLocaleString('en-US')} K, grain ${r2(ref.grain)}, vignette ${r2(ref.vignette || 0)}${ref.bars && ref.bars !== 'off' ? `, ${ref.bars} bars` : ''}`;
    return [
      '🎨 Mission: make it look like this (the reference is the attached picture; borrow its feel, don\'t copy or import it).',
      graded ? 'Its colors, light and grain are already matched on the scene\'s ◐ Grade layer: keep that layer; adapt shapes, materials, light, composition and motion to the reference.' : 'Match its colors, light, shapes and motion.',
      `Reference ${line}`,
      `Numbers: ${nums}.`,
      note ? `\n${note}` : '',
    ].filter(Boolean).join('\n');
  }
  // the cost of asking: the picture (≈ w·h / 750 image tokens) + the words (≈ 3.6 characters a token)
  function cost(pic, text) {
    const image = pic ? Math.ceil((pic.w * pic.h) / 750) : 0;
    const words = Math.ceil(String(text || '').length / 3.6);
    return { image, text: words, total: image + words };
  }

  return { analyze, merge, match, refine, gap, closeness, words, brief, cost, barsOf, tones, levelMap, wheelOf, NEUTRAL };
})();
if (typeof module !== 'undefined') module.exports = LookCore;
