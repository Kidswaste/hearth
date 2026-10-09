// The editor's preset families (Video Review ✂ editor): easing curves, transitions, looks (color grades), title
// styles and animations, lower thirds, clip motion presets, speed ramps, blend modes, sequence formats, export
// presets and sequence templates. Each family is plain data plus the small functions that make it work in both
// places a preset runs: the canvas preview (tools/video-comp.js) and the ffmpeg render (tools/cut-ffmpeg.js), so
// what you see is what renders. No DOM here: loads in Node for tests (module.exports at the bottom).
const EditFX = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const PI = Math.PI;

  // ---------- easing curves ----------
  // fn(p) maps 0..1 → 0..1 (back / elastic overshoot). Keyframes name the curve of the segment that starts at them.
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
    const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t; const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (p) => {
      if (p <= 0) return 0; if (p >= 1) return 1;
      let t = p;
      for (let i = 0; i < 8; i += 1) { const e = sx(t) - p; const d = dx(t); if (Math.abs(e) < 1e-6 || !d) break; t -= e / d; }
      t = clamp(t, 0, 1);
      return sy(t);
    };
  }
  const outOf = (f) => (p) => 1 - f(1 - p);
  const inOutOf = (f) => (p) => (p < 0.5 ? f(2 * p) / 2 : 1 - f(2 - 2 * p) / 2);
  const bounceOut = (p) => { const n = 7.5625; const d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) { p -= 1.5 / d; return n * p * p + 0.75; } if (p < 2.5 / d) { p -= 2.25 / d; return n * p * p + 0.9375; } p -= 2.625 / d; return n * p * p + 0.984375; };
  const BASE = {
    quad: (p) => p * p, cubic: (p) => p ** 3, quart: (p) => p ** 4, quint: (p) => p ** 5,
    sine: (p) => 1 - Math.cos((p * PI) / 2), expo: (p) => (p <= 0 ? 0 : 2 ** (10 * p - 10)), circ: (p) => 1 - Math.sqrt(1 - p * p),
    back: (p) => 2.70158 * p ** 3 - 1.70158 * p * p, elastic: (p) => (p <= 0 ? 0 : p >= 1 ? 1 : -(2 ** (10 * p - 10)) * Math.sin((p * 10 - 10.75) * ((2 * PI) / 3))),
    bounce: (p) => 1 - bounceOut(1 - p),
  };
  const NAMES = { quad: 'Quad', cubic: 'Cubic', quart: 'Quart', quint: 'Quint', sine: 'Sine', expo: 'Expo', circ: 'Circ', back: 'Back (overshoot)', elastic: 'Elastic', bounce: 'Bounce' };
  const EASES = [
    { id: 'linear', name: 'Linear', fn: (p) => p },
    { id: 'hold', name: 'Hold (jump at the next key)', fn: (p) => (p >= 1 ? 1 : 0) },
    { id: 'ease', name: 'Ease (smooth both ends)', fn: bezier(0.25, 0.1, 0.25, 1) },
    { id: 'easeIn', name: 'Ease in', fn: bezier(0.42, 0, 1, 1) },
    { id: 'easeOut', name: 'Ease out', fn: bezier(0, 0, 0.58, 1) },
    { id: 'easeInOut', name: 'Ease in-out', fn: bezier(0.42, 0, 0.58, 1) },
    { id: 'smooth', name: 'Smoothstep', fn: (p) => p * p * (3 - 2 * p) },
    { id: 'smoother', name: 'Smootherstep', fn: (p) => p * p * p * (p * (p * 6 - 15) + 10) },
    { id: 'snappy', name: 'Snappy (fast start, soft land)', fn: bezier(0.2, 0.8, 0.2, 1) },
    { id: 'motion', name: 'Motion design (AE-style 33/100)', fn: bezier(0.33, 0, 0, 1) },
    { id: 'anticipate', name: 'Anticipate (pulls back first)', fn: bezier(0.36, -0.4, 0.6, 1) },
    { id: 'overshoot', name: 'Overshoot', fn: bezier(0.34, 1.56, 0.64, 1) },
    { id: 'spring', name: 'Spring', fn: (p) => 1 - Math.exp(-6 * p) * Math.cos(12 * p) * (1 - p) },
    { id: 'whip', name: 'Whip (very fast middle)', fn: bezier(0.85, 0, 0.15, 1) },
    { id: 'steps4', name: 'Steps ×4', fn: (p) => (p >= 1 ? 1 : Math.floor(p * 4) / 4) },
    { id: 'steps8', name: 'Steps ×8 (stop motion)', fn: (p) => (p >= 1 ? 1 : Math.floor(p * 8) / 8) },
    { id: 'wiggle', name: 'Wiggle (settles)', fn: (p) => p + Math.sin(p * PI * 6) * 0.08 * (1 - p) },
    ...Object.keys(BASE).flatMap((k) => [
      { id: `${k}In`, name: `${NAMES[k]} in`, fn: BASE[k] },
      { id: `${k}Out`, name: `${NAMES[k]} out`, fn: outOf(BASE[k]) },
      { id: `${k}InOut`, name: `${NAMES[k]} in-out`, fn: inOutOf(BASE[k]) },
    ]),
  ];
  const EASE = Object.fromEntries(EASES.map((e) => [e.id, e]));
  const ease = (id, p) => (EASE[id] || EASE.ease).fn(clamp(p, 0, 1));

  // ---------- keyframes ----------
  // keys: [{ t (seconds from the clip's start), v, ease }] sorted by t. Value at local time t (hold before / after).
  function keyValue(keys, t, def) {
    if (!keys?.length) return def;
    if (t <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.v;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t) i += 1;
    const a = keys[i]; const b = keys[i + 1];
    const p = (t - a.t) / Math.max(1e-9, b.t - a.t);
    return lerp(a.v, b.v, ease(a.ease || 'ease', p));
  }
  // The same curve as an ffmpeg expression of `tv` (a time variable, local to the clip after `shift`), sampled
  // `per` times a second into straight pieces (no nesting, so long curves stay parseable).
  // Commas are escaped for a -filter_complex argument when esc.
  function keyExpr(keys, tv = 't', { shift = 0, per = 30, esc = false, dur = null } = {}) {
    const f = (x) => String(Number(Number(x).toFixed(5)));
    if (!keys?.length) return null;
    const pts = [];
    const first = keys[0]; const last = keys[keys.length - 1];
    pts.push([first.t, first.v]);
    for (let i = 0; i < keys.length - 1; i += 1) {
      const a = keys[i]; const b = keys[i + 1];
      const lin = (a.ease || 'ease') === 'linear';
      const hold = a.ease === 'hold';
      const n = lin ? 1 : Math.max(2, Math.ceil((b.t - a.t) * per));
      for (let k = 1; k <= n; k += 1) {
        const p = k / n;
        const t = a.t + (b.t - a.t) * p;
        if (hold) { pts.push([b.t - 1e-4, a.v]); pts.push([b.t, b.v]); break; }
        pts.push([t, lerp(a.v, b.v, ease(a.ease || 'ease', p))]);
      }
    }
    const T = `(${tv}-${f(shift)})`;
    const terms = [];
    // before the first key and after the last: hold
    terms.push(`lt(${T},${f(first.t)})*${f(first.v)}`);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [t0, v0] = pts[i]; const [t1, v1] = pts[i + 1];
      if (t1 - t0 < 1e-6) continue;
      const slope = (v1 - v0) / (t1 - t0);
      terms.push(`gte(${T},${f(t0)})*lt(${T},${f(t1)})*(${f(v0)}+${f(slope)}*(${T}-${f(t0)}))`);
    }
    terms.push(`gte(${T},${f(last.t)})*${f(last.v)}`);
    void dur;
    const s = terms.join('+');
    return esc ? s.replace(/,/g, ',') : s;
  }

  // ---------- color: looks + adjustments ----------
  // One color recipe for preview and render: an affine RGB transform (3×3 matrix + offset, values 0..1) and a
  // gamma, plus vignette / grain / blur / sharpen. The preview uses an SVG feColorMatrix (sRGB) and canvas passes;
  // the render uses colorchannelmixer + lutrgb + vignette / noise / gblur / unsharp with the same numbers.
  // Adjustment params (all optional, 0 = neutral): exposure (-2..2 stops), contrast (-1..1), saturation (-1..1),
  // temp (-1..1 cool→warm), tint (-1..1 green→magenta), hue (degrees), fade (0..1 lifted blacks), mono (0..1),
  // sepia (0..1), tintColor ('#rrggbb') + tintAmt (0..1), gamma (-1..1), vignette (0..1), grain (0..1), blur (0..1),
  // sharpen (0..1), highlights (-1..1), shadows (-1..1).
  const ADJ = [
    { id: 'exposure', name: 'Exposure', min: -2, max: 2, step: 0.05 },
    { id: 'contrast', name: 'Contrast', min: -1, max: 1, step: 0.02 },
    { id: 'saturation', name: 'Saturation', min: -1, max: 1, step: 0.02 },
    { id: 'temp', name: 'Temperature', min: -1, max: 1, step: 0.02 },
    { id: 'tint', name: 'Tint', min: -1, max: 1, step: 0.02 },
    { id: 'hue', name: 'Hue', min: -180, max: 180, step: 1 },
    { id: 'gamma', name: 'Gamma (midtones)', min: -1, max: 1, step: 0.02 },
    { id: 'highlights', name: 'Highlights', min: -1, max: 1, step: 0.02 },
    { id: 'shadows', name: 'Shadows', min: -1, max: 1, step: 0.02 },
    { id: 'fade', name: 'Fade (lifted blacks)', min: 0, max: 1, step: 0.02 },
    { id: 'mono', name: 'Black & white', min: 0, max: 1, step: 0.05 },
    { id: 'sepia', name: 'Sepia', min: 0, max: 1, step: 0.05 },
    { id: 'tintAmt', name: 'Color wash', min: 0, max: 1, step: 0.02 },
    { id: 'vignette', name: 'Vignette', min: 0, max: 1, step: 0.02 },
    { id: 'grain', name: 'Grain', min: 0, max: 1, step: 0.02 },
    { id: 'blur', name: 'Blur', min: 0, max: 1, step: 0.02 },
    { id: 'sharpen', name: 'Sharpen', min: 0, max: 1, step: 0.02 },
  ];
  const hex3 = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [1, 1, 1]; const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  // affine: { m: [9], o: [3] }; compose(b, a) = b ∘ a (apply a first)
  const ident = () => ({ m: [1, 0, 0, 0, 1, 0, 0, 0, 1], o: [0, 0, 0] });
  function compose(b, a) {
    const m = new Array(9).fill(0); const o = [0, 0, 0];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) m[r * 3 + c] += b.m[r * 3 + k] * a.m[k * 3 + c];
      o[r] = b.o[r] + b.m[r * 3] * a.o[0] + b.m[r * 3 + 1] * a.o[1] + b.m[r * 3 + 2] * a.o[2];
    }
    return { m, o };
  }
  const LW = [0.2126, 0.7152, 0.0722];
  const satM = (s) => ({ m: [LW[0] * (1 - s) + s, LW[1] * (1 - s), LW[2] * (1 - s), LW[0] * (1 - s), LW[1] * (1 - s) + s, LW[2] * (1 - s), LW[0] * (1 - s), LW[1] * (1 - s), LW[2] * (1 - s) + s], o: [0, 0, 0] });
  function hueM(deg) {
    const a = (deg * PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
    return { m: [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
    ], o: [0, 0, 0] };
  }
  const SEPIA = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
  const mixM = (a, b, p) => ({ m: a.m.map((x, i) => lerp(x, b.m[i], p)), o: a.o.map((x, i) => lerp(x, b.o[i], p)) });
  // Look params merged with the clip's own adjustments (look scaled by amt 0..1, adjustments added on top).
  function grade(color) {
    if (!color) return null;
    const look = LOOK[color.look];
    const amt = color.amt ?? 1;
    const out = {};
    for (const a of ADJ) {
      const lv = look?.p[a.id] || 0; const cv = color[a.id] || 0;
      const v = lv * amt + cv;
      if (v) out[a.id] = v;
    }
    out.tintColor = color.tintColor || look?.p.tintColor || null;
    return Object.keys(out).some((k) => k !== 'tintColor' && out[k]) ? out : null;
  }
  // The affine transform + gamma of a graded params object (from grade()).
  function colorMath(g) {
    if (!g) return null;
    let A = ident();
    const add = (B) => { A = compose(B, A); };
    if (g.exposure) { const k = 2 ** g.exposure; add({ m: [k, 0, 0, 0, k, 0, 0, 0, k], o: [0, 0, 0] }); }
    if (g.temp || g.tint) {
      const t = g.temp || 0; const n = g.tint || 0;
      add({ m: [1 + 0.12 * t + 0.04 * n, 0, 0, 0, 1 - 0.1 * n, 0, 0, 0, 1 - 0.14 * t + 0.04 * n], o: [0, 0, 0] });
    }
    if (g.hue) add(hueM(g.hue));
    if (g.saturation) add(satM(clamp(1 + g.saturation, 0, 3)));
    if (g.contrast) { const c = clamp(1 + g.contrast, 0.05, 3); const off = 0.5 * (1 - c); add({ m: [c, 0, 0, 0, c, 0, 0, 0, c], o: [off, off, off] }); }
    if (g.highlights || g.shadows) {
      // a gentle linear stand-in: highlights scale the top, shadows lift / crush the bottom
      const h = 1 + 0.25 * (g.highlights || 0); const s = 0.08 * (g.shadows || 0);
      add({ m: [h - s, 0, 0, 0, h - s, 0, 0, 0, h - s], o: [s, s, s] });
    }
    if (g.mono) add(mixM(ident(), satM(0), clamp(g.mono, 0, 1)));
    if (g.sepia) add(mixM(ident(), { m: SEPIA, o: [0, 0, 0] }, clamp(g.sepia, 0, 1)));
    if (g.tintAmt && g.tintColor) {
      const [r, gg, b] = hex3(g.tintColor); const a = clamp(g.tintAmt, 0, 1);
      // a luminance-keeping wash toward the color (duotone-ish at 1)
      const wash = { m: [r * LW[0] * 1.6, r * LW[1] * 1.6, r * LW[2] * 1.6, gg * LW[0] * 1.6, gg * LW[1] * 1.6, gg * LW[2] * 1.6, b * LW[0] * 1.6, b * LW[1] * 1.6, b * LW[2] * 1.6], o: [0, 0, 0] };
      add(mixM(ident(), wash, a));
    }
    if (g.fade) { const f = clamp(g.fade, 0, 1); const k = 1 - 0.32 * f; const o = 0.16 * f; add({ m: [k, 0, 0, 0, k, 0, 0, 0, k], o: [o, o, o] }); }
    const gamma = g.gamma ? clamp(1 + g.gamma * 0.6, 0.3, 2.5) : 1; // > 1 brightens the midtones
    return { ...A, gamma, vignette: clamp(g.vignette || 0, 0, 1), grain: clamp(g.grain || 0, 0, 1), blur: clamp(g.blur || 0, 0, 1), sharpen: clamp(g.sharpen || 0, 0, 1) };
  }
  // SVG feColorMatrix values (4×5) for the preview.
  const svgMatrix = (cm) => [cm.m[0], cm.m[1], cm.m[2], 0, cm.o[0], cm.m[3], cm.m[4], cm.m[5], 0, cm.o[1], cm.m[6], cm.m[7], cm.m[8], 0, cm.o[2], 0, 0, 0, 1, 0].map((x) => Number(x.toFixed(5))).join(' ');
  // ffmpeg filters for the render (W, H: the frame, for the vignette / grain sizes).
  function colorFilters(cm) {
    if (!cm) return [];
    const f = (x) => Number(x.toFixed(5));
    const out = [];
    const isId = cm.m.every((x, i) => Math.abs(x - [1, 0, 0, 0, 1, 0, 0, 0, 1][i]) < 1e-4);
    if (!isId) {
      // colorchannelmixer takes −2…2: a stronger matrix runs at half strength, then doubles (as often as needed)
      let m = cm.m; let k = 0;
      while (Math.max(...m.map(Math.abs)) > 2 && k < 4) { m = m.map((x) => x / 2); k += 1; }
      out.push(`colorchannelmixer=rr=${f(m[0])}:rg=${f(m[1])}:rb=${f(m[2])}:gr=${f(m[3])}:gg=${f(m[4])}:gb=${f(m[5])}:br=${f(m[6])}:bg=${f(m[7])}:bb=${f(m[8])}`);
      for (let i = 0; i < k; i += 1) out.push('colorchannelmixer=rr=2:gg=2:bb=2');
    }
    const off = cm.o.some((x) => Math.abs(x) > 1e-4);
    if (off || Math.abs(cm.gamma - 1) > 1e-3) {
      const ch = (o) => `255*pow(clip(val/255+${f(o)},0,1),${f(1 / cm.gamma)})`;
      out.push(`lutrgb=r='${ch(cm.o[0])}':g='${ch(cm.o[1])}':b='${ch(cm.o[2])}'`);
    }
    if (cm.blur > 0.005) out.push(`gblur=sigma=${f(cm.blur * 12)}`);
    if (cm.sharpen > 0.005) out.push(`unsharp=5:5:${f(cm.sharpen * 1.5)}:5:5:0`);
    if (cm.vignette > 0.005) out.push(`vignette=angle=${f(0.25 + cm.vignette * 0.75)}`);
    if (cm.grain > 0.005) out.push(`noise=alls=${Math.round(cm.grain * 28)}:allf=t+u`);
    return out;
  }
  // CSS-ish preview of the same grade without SVG (thumbnails, menus): brightness / contrast / saturate / hue / sepia.
  function cssFilter(g) {
    if (!g) return '';
    const parts = [];
    if (g.exposure) parts.push(`brightness(${(2 ** g.exposure).toFixed(3)})`);
    if (g.contrast) parts.push(`contrast(${(1 + g.contrast).toFixed(3)})`);
    if (g.saturation || g.mono) parts.push(`saturate(${Math.max(0, (1 + (g.saturation || 0)) * (1 - (g.mono || 0))).toFixed(3)})`);
    if (g.hue) parts.push(`hue-rotate(${g.hue}deg)`);
    if (g.sepia) parts.push(`sepia(${g.sepia})`);
    if (g.blur) parts.push(`blur(${(g.blur * 6).toFixed(1)}px)`);
    return parts.join(' ');
  }
  // Looks: named parameter sets (Inspector › Color › Look, right-click › Look ›, /look-clip <name>).
  const L = (id, name, group, p) => ({ id, name, group, p });
  const LOOKS = [
    // cinematic
    L('teal-orange', 'Teal & orange', 'Cinematic', { contrast: 0.18, saturation: 0.15, temp: 0.25, tintColor: '#1f8a99', tintAmt: 0.12, highlights: 0.05 }),
    L('blockbuster', 'Blockbuster', 'Cinematic', { contrast: 0.3, saturation: 0.2, temp: 0.2, tintColor: '#0f6f80', tintAmt: 0.15, vignette: 0.35 }),
    L('bleach', 'Bleach bypass', 'Cinematic', { contrast: 0.45, saturation: -0.55, exposure: 0.05, sharpen: 0.3 }),
    L('moody', 'Moody', 'Cinematic', { exposure: -0.3, contrast: 0.2, saturation: -0.25, temp: -0.15, vignette: 0.5, fade: 0.1 }),
    L('noir-cine', 'Cinematic noir', 'Cinematic', { mono: 1, contrast: 0.5, exposure: -0.1, vignette: 0.6, grain: 0.25 }),
    L('matrix', 'Code green', 'Cinematic', { tintColor: '#3cff7a', tintAmt: 0.35, contrast: 0.25, saturation: -0.3, exposure: -0.1 }),
    L('desert', 'Desert heat', 'Cinematic', { temp: 0.6, saturation: 0.1, contrast: 0.15, tintColor: '#ffb347', tintAmt: 0.15, fade: 0.08 }),
    L('arctic', 'Arctic', 'Cinematic', { temp: -0.55, saturation: -0.2, exposure: 0.15, contrast: 0.1 }),
    L('day-for-night', 'Day for night', 'Cinematic', { exposure: -1.1, temp: -0.7, saturation: -0.45, contrast: 0.2, tintColor: '#2a4cff', tintAmt: 0.25 }),
    L('golden-hour', 'Golden hour', 'Cinematic', { temp: 0.45, exposure: 0.1, saturation: 0.15, tintColor: '#ffbe5c', tintAmt: 0.12, highlights: 0.1 }),
    L('blue-hour', 'Blue hour', 'Cinematic', { temp: -0.4, exposure: -0.15, saturation: 0.1, tintColor: '#3a5bff', tintAmt: 0.15 }),
    L('anamorphic', 'Anamorphic', 'Cinematic', { contrast: 0.2, temp: -0.1, tintColor: '#1e6cff', tintAmt: 0.08, vignette: 0.4, sharpen: 0.15 }),
    L('thriller', 'Thriller', 'Cinematic', { temp: -0.2, tint: -0.3, saturation: -0.35, contrast: 0.3, exposure: -0.15 }),
    L('romance', 'Romance', 'Cinematic', { temp: 0.25, tint: 0.2, fade: 0.15, exposure: 0.15, saturation: -0.05, blur: 0.03 }),
    L('epic', 'Epic', 'Cinematic', { contrast: 0.4, saturation: -0.1, highlights: 0.15, shadows: -0.3, vignette: 0.45 }),
    // film stocks (inspired, not exact)
    L('portra', 'Portrait film', 'Film', { temp: 0.15, saturation: -0.1, fade: 0.12, contrast: -0.05, tint: 0.05, grain: 0.15 }),
    L('ektar', 'Vivid film', 'Film', { saturation: 0.35, contrast: 0.15, temp: 0.1, grain: 0.12 }),
    L('velvia', 'Slide film', 'Film', { saturation: 0.55, contrast: 0.3, exposure: -0.05, grain: 0.1 }),
    L('fuji-green', 'Green-shadow film', 'Film', { tint: -0.25, saturation: 0.05, fade: 0.1, temp: -0.05, grain: 0.15 }),
    L('tri-x', 'Grainy B&W film', 'Film', { mono: 1, contrast: 0.35, grain: 0.45, fade: 0.05 }),
    L('cine-800', 'Tungsten night film', 'Film', { temp: -0.3, saturation: 0.15, contrast: 0.15, grain: 0.3, highlights: 0.1 }),
    L('expired', 'Expired film', 'Film', { fade: 0.3, temp: 0.2, tint: 0.25, saturation: -0.2, grain: 0.35, vignette: 0.3 }),
    L('polaroid', 'Instant photo', 'Film', { fade: 0.25, temp: 0.15, contrast: -0.1, saturation: -0.15, tintColor: '#ffe7b0', tintAmt: 0.1 }),
    L('super8', 'Super 8', 'Film', { temp: 0.35, fade: 0.2, grain: 0.55, vignette: 0.55, saturation: -0.1, blur: 0.08 }),
    L('16mm', '16 mm', 'Film', { grain: 0.4, contrast: 0.15, fade: 0.1, vignette: 0.3, temp: 0.08 }),
    L('cross-process', 'Cross process', 'Film', { tint: -0.2, temp: -0.15, contrast: 0.35, saturation: 0.3, tintColor: '#d4ff4f', tintAmt: 0.12 }),
    L('lomo', 'Lomo', 'Film', { saturation: 0.45, contrast: 0.35, vignette: 0.8, temp: 0.1 }),
    L('kodachrome', 'Warm slide', 'Film', { temp: 0.2, saturation: 0.3, contrast: 0.2, tint: 0.05 }),
    // black & white
    L('bw', 'Black & white', 'Black & white', { mono: 1 }),
    L('bw-high', 'B&W high contrast', 'Black & white', { mono: 1, contrast: 0.55 }),
    L('bw-soft', 'B&W soft', 'Black & white', { mono: 1, contrast: -0.2, fade: 0.15 }),
    L('bw-ink', 'Ink (crushed)', 'Black & white', { mono: 1, contrast: 0.9, exposure: -0.2 }),
    L('bw-silver', 'Silver', 'Black & white', { mono: 1, exposure: 0.2, contrast: 0.15, tintColor: '#d8e4ff', tintAmt: 0.15 }),
    L('sepia', 'Sepia', 'Black & white', { sepia: 1, contrast: 0.1 }),
    L('selenium', 'Selenium tone', 'Black & white', { mono: 1, tintColor: '#c49aa8', tintAmt: 0.3, contrast: 0.15 }),
    L('cyanotype', 'Cyanotype', 'Black & white', { mono: 1, tintColor: '#3b7bd8', tintAmt: 0.6 }),
    L('newsprint', 'Newsprint', 'Black & white', { mono: 1, contrast: 0.6, grain: 0.6, fade: 0.1 }),
    // vintage
    L('vintage', 'Vintage', 'Vintage', { sepia: 0.35, fade: 0.2, vignette: 0.45, saturation: -0.15, grain: 0.2 }),
    L('70s', '70s', 'Vintage', { temp: 0.35, tint: 0.1, fade: 0.2, saturation: 0.1, tintColor: '#ffb04f', tintAmt: 0.12, grain: 0.2 }),
    L('80s', '80s VHS', 'Vintage', { saturation: 0.3, contrast: -0.1, tint: 0.2, blur: 0.08, grain: 0.3, fade: 0.1 }),
    L('90s', '90s camcorder', 'Vintage', { saturation: -0.1, sharpen: 0.4, temp: 0.1, grain: 0.25, contrast: 0.1 }),
    L('faded', 'Faded', 'Vintage', { fade: 0.4, saturation: -0.25, contrast: -0.15 }),
    L('matte', 'Matte', 'Vintage', { fade: 0.25, contrast: -0.05 }),
    L('old-photo', 'Old photo', 'Vintage', { sepia: 0.7, fade: 0.25, vignette: 0.7, grain: 0.4, blur: 0.05 }),
    L('western', 'Western', 'Vintage', { temp: 0.5, saturation: -0.25, contrast: 0.25, sepia: 0.25, grain: 0.2 }),
    // neon / club / motion design
    L('cyberpunk', 'Cyberpunk', 'Neon', { tint: 0.45, temp: -0.3, saturation: 0.45, contrast: 0.25, tintColor: '#ff2bd6', tintAmt: 0.12 }),
    L('synthwave', 'Synthwave', 'Neon', { tintColor: '#ff3cac', tintAmt: 0.25, temp: -0.2, saturation: 0.4, contrast: 0.2, vignette: 0.3 }),
    L('neon-noir', 'Neon noir', 'Neon', { exposure: -0.3, saturation: 0.5, contrast: 0.4, tint: 0.3, vignette: 0.45 }),
    L('acid', 'Acid', 'Neon', { hue: 60, saturation: 0.7, contrast: 0.3 }),
    L('vaporwave', 'Vaporwave', 'Neon', { tintColor: '#7cf6ff', tintAmt: 0.2, tint: 0.35, saturation: 0.3, fade: 0.12 }),
    L('club', 'Club lights', 'Neon', { saturation: 0.6, contrast: 0.45, exposure: -0.2, vignette: 0.5 }),
    L('hologram', 'Hologram', 'Neon', { tintColor: '#46f0ff', tintAmt: 0.45, contrast: 0.2, exposure: 0.1, blur: 0.04 }),
    L('ultraviolet', 'Ultraviolet', 'Neon', { tintColor: '#8a3bff', tintAmt: 0.4, contrast: 0.3, saturation: 0.3 }),
    L('infrared', 'Infrared', 'Neon', { hue: 180, saturation: 0.3, contrast: 0.2, tintColor: '#ff4d6d', tintAmt: 0.2 }),
    L('forgeheart', 'Forgeheart (gold & ember)', 'Neon', { temp: 0.35, contrast: 0.3, saturation: 0.25, tintColor: '#ffb020', tintAmt: 0.15, vignette: 0.4 }),
    L('molten', 'Molten', 'Neon', { temp: 0.7, tint: 0.15, saturation: 0.4, contrast: 0.35, tintColor: '#ff4b1f', tintAmt: 0.2 }),
    L('ice-neon', 'Ice neon', 'Neon', { temp: -0.6, saturation: 0.4, contrast: 0.25, tintColor: '#00e5ff', tintAmt: 0.18 }),
    // clean / social
    L('clean', 'Clean bright', 'Clean', { exposure: 0.2, contrast: 0.08, saturation: 0.08 }),
    L('punchy', 'Punchy', 'Clean', { contrast: 0.3, saturation: 0.3, sharpen: 0.2 }),
    L('vivid', 'Vivid', 'Clean', { saturation: 0.5, contrast: 0.12 }),
    L('soft', 'Soft', 'Clean', { contrast: -0.15, fade: 0.08, exposure: 0.1, blur: 0.02 }),
    L('airy', 'Airy', 'Clean', { exposure: 0.35, contrast: -0.15, saturation: -0.1, temp: -0.05 }),
    L('pastel', 'Pastel', 'Clean', { saturation: -0.3, exposure: 0.25, fade: 0.2, contrast: -0.15 }),
    L('crisp', 'Crisp', 'Clean', { sharpen: 0.5, contrast: 0.15 }),
    L('natural-warm', 'Natural warm', 'Clean', { temp: 0.15, saturation: 0.05 }),
    L('natural-cool', 'Natural cool', 'Clean', { temp: -0.15, saturation: 0.05 }),
    L('food', 'Food', 'Clean', { temp: 0.2, saturation: 0.3, exposure: 0.1, contrast: 0.1 }),
    L('product', 'Product', 'Clean', { exposure: 0.15, contrast: 0.2, saturation: -0.05, sharpen: 0.3 }),
    L('skin', 'Skin friendly', 'Clean', { temp: 0.1, tint: 0.05, saturation: -0.08, contrast: -0.05 }),
    L('hdr', 'HDR-ish', 'Clean', { contrast: 0.25, shadows: 0.6, highlights: -0.4, saturation: 0.25, sharpen: 0.35 }),
    L('high-key', 'High key', 'Clean', { exposure: 0.6, contrast: -0.2, saturation: -0.1 }),
    L('low-key', 'Low key', 'Clean', { exposure: -0.6, contrast: 0.35, vignette: 0.4 }),
    // nature / seasons
    L('summer', 'Summer', 'Seasons', { temp: 0.25, saturation: 0.25, exposure: 0.1 }),
    L('autumn', 'Autumn', 'Seasons', { temp: 0.35, tint: 0.08, saturation: 0.15, hue: -8 }),
    L('winter', 'Winter', 'Seasons', { temp: -0.4, saturation: -0.3, exposure: 0.1 }),
    L('spring', 'Spring', 'Seasons', { tint: -0.1, saturation: 0.2, exposure: 0.15, fade: 0.05 }),
    L('forest', 'Forest', 'Seasons', { tint: -0.3, saturation: 0.15, contrast: 0.12, exposure: -0.1 }),
    L('ocean', 'Ocean', 'Seasons', { temp: -0.3, saturation: 0.2, tintColor: '#0aa3c2', tintAmt: 0.15 }),
    L('sunset', 'Sunset', 'Seasons', { temp: 0.5, tint: 0.2, saturation: 0.3, tintColor: '#ff6a3d', tintAmt: 0.15 }),
    L('fog', 'Fog', 'Seasons', { fade: 0.35, contrast: -0.3, saturation: -0.3, exposure: 0.15, blur: 0.05 }),
    L('storm', 'Storm', 'Seasons', { exposure: -0.35, saturation: -0.4, temp: -0.2, contrast: 0.3 }),
    // stylised
    L('negative', 'Negative', 'Stylised', { exposure: 0, contrast: -2, saturation: 0 }),
    L('thermal', 'Thermal-ish', 'Stylised', { hue: 200, saturation: 0.9, contrast: 0.4 }),
    L('dream', 'Dream', 'Stylised', { blur: 0.08, exposure: 0.25, fade: 0.2, saturation: 0.1, tint: 0.15 }),
    L('nightmare', 'Nightmare', 'Stylised', { tint: -0.4, saturation: -0.5, contrast: 0.5, vignette: 0.8, grain: 0.3 }),
    L('comic', 'Comic', 'Stylised', { saturation: 0.7, contrast: 0.5, sharpen: 0.8 }),
    L('pop-art', 'Pop art', 'Stylised', { saturation: 0.9, contrast: 0.6, hue: 15 }),
    L('posterized', 'Poster', 'Stylised', { contrast: 0.8, saturation: 0.4 }),
    L('glow', 'Glow', 'Stylised', { exposure: 0.25, blur: 0.06, contrast: 0.1, saturation: 0.15 }),
    L('dim', 'Dim', 'Stylised', { exposure: -0.7 }),
    L('bright', 'Bright', 'Stylised', { exposure: 0.6 }),
    L('ghost', 'Ghost', 'Stylised', { mono: 0.8, exposure: 0.4, fade: 0.3, blur: 0.05, tintColor: '#bfe8ff', tintAmt: 0.15 }),
    L('sin-city', 'Red pop B&W', 'Stylised', { mono: 0.85, contrast: 0.6, tintColor: '#ff2020', tintAmt: 0.08 }),
  ];
  // Color washes: one look per color (Tint: Gold, Tint: Violet…)
  const WASHES = [['red', '#ff3b3b'], ['orange', '#ff8a2b'], ['gold', '#ffc93b'], ['lime', '#b8ff3b'], ['green', '#3bff6a'], ['teal', '#2bd6c4'], ['cyan', '#3bdcff'], ['blue', '#3b6bff'], ['indigo', '#5b3bff'], ['violet', '#a33bff'], ['magenta', '#ff3bd8'], ['pink', '#ff7ab8'], ['ember', '#ff5a1f'], ['ai-violet', '#9a6bff']];
  for (const [n, c] of WASHES) LOOKS.push(L(`wash-${n}`, `Color wash: ${n}`, 'Color washes', { tintColor: c, tintAmt: 0.35, contrast: 0.08 }));
  // Duotones: two-color looks (shadows tinted by the wash, mono base)
  const DUOS = [['gold-black', '#ffc93b'], ['violet-night', '#7a4bff'], ['cyan-ink', '#2bd6ff'], ['rose', '#ff6b9a'], ['mint', '#6bffc8'], ['blood', '#c2142b'], ['ocean-duo', '#1f6bff'], ['amber', '#ffa31a']];
  for (const [n, c] of DUOS) LOOKS.push(L(`duo-${n}`, `Duotone: ${n.replace(/-/g, ' ')}`, 'Duotones', { mono: 1, tintColor: c, tintAmt: 0.75, contrast: 0.2 }));
  const LOOK = Object.fromEntries(LOOKS.map((l) => [l.id, l]));

  // ---------- transitions ----------
  // ff: the ffmpeg xfade transition, or expr (a custom xfade expression; P runs 1 → 0 there, A = outgoing,
  // B = incoming). preview(g, A, B, p, W, H) draws the mix on a canvas (p runs 0 → 1). Default length `d` s.
  // The canvas previews follow ffmpeg's look closely; the export is the reference.
  const sub = (g, fn) => { g.save(); fn(); g.restore(); };
  const full = (g, S, W, H) => g.drawImage(S, 0, 0, W, H);
  const clipRect = (g, x, y, w, h) => { g.beginPath(); g.rect(x, y, w, h); g.clip(); };
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  function wipe(dir, soft = 0) {
    // the boundary moves toward `dir`: B shows behind it
    return (g, A, B, p, W, H) => {
      full(g, A, W, H);
      sub(g, () => {
        const [dx, dy] = DIRS[dir];
        if (soft) {
          const len = dx ? W : H; const s = soft * len;
          const pos = lerp(-s, len, p);
          const x0 = dx > 0 ? pos : dx < 0 ? len - pos : 0; const y0 = dy > 0 ? pos : dy < 0 ? len - pos : 0;
          const gr = dx ? g.createLinearGradient(x0, 0, x0 + (dx > 0 ? s : -s), 0) : g.createLinearGradient(0, y0, 0, y0 + (dy > 0 ? s : -s));
          // draw B through a mask made of the gradient
          const m = maskCanvas(W, H); const mg = m.getContext('2d');
          mg.clearRect(0, 0, W, H); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          mg.fillStyle = '#fff';
          if (dx > 0) mg.fillRect(0, 0, Math.max(0, x0), H); else if (dx < 0) mg.fillRect(Math.min(W, x0), 0, W, H); else if (dy > 0) mg.fillRect(0, 0, W, Math.max(0, y0)); else mg.fillRect(0, Math.min(H, y0), W, H);
          mg.fillStyle = gr; mg.fillRect(0, 0, W, H);
          mg.globalCompositeOperation = 'source-in'; mg.drawImage(B, 0, 0, W, H); mg.globalCompositeOperation = 'source-over';
          g.drawImage(m, 0, 0);
          return;
        }
        if (dx > 0) clipRect(g, 0, 0, W * p, H); else if (dx < 0) clipRect(g, W * (1 - p), 0, W * p, H); else if (dy > 0) clipRect(g, 0, 0, W, H * p); else clipRect(g, 0, H * (1 - p), W, H * p);
        full(g, B, W, H);
      });
    };
  }
  let mask = null;
  const maskCanvas = (W, H) => { if (typeof document === 'undefined') return null; if (!mask) mask = document.createElement('canvas'); if (mask.width !== W || mask.height !== H) { mask.width = W; mask.height = H; } return mask; };
  const corner = (cx, cy) => (g, A, B, p, W, H) => { full(g, A, W, H); sub(g, () => { clipRect(g, cx ? W * (1 - p) : 0, cy ? H * (1 - p) : 0, W * p, H * p); full(g, B, W, H); }); };
  const slide = (dir, mode) => (g, A, B, p, W, H) => {
    const [dx, dy] = DIRS[dir];
    const ox = dx * W * p; const oy = dy * H * p;
    if (mode === 'cover') { full(g, A, W, H); g.drawImage(B, ox - dx * W, oy - dy * H, W, H); return; }
    if (mode === 'reveal') { full(g, B, W, H); g.drawImage(A, ox, oy, W, H); return; }
    g.drawImage(A, ox, oy, W, H); g.drawImage(B, ox - dx * W, oy - dy * H, W, H);
  };
  const dissolve = (g, A, B, p, W, H) => { full(g, A, W, H); g.globalAlpha = p; full(g, B, W, H); g.globalAlpha = 1; };
  const dip = (color) => (g, A, B, p, W, H) => { full(g, p < 0.5 ? A : B, W, H); g.globalAlpha = 1 - Math.abs(1 - 2 * p); g.fillStyle = color; g.fillRect(0, 0, W, H); g.globalAlpha = 1; };
  const iris = (open) => (g, A, B, p, W, H) => {
    const R = Math.hypot(W, H) / 2;
    if (open) { full(g, A, W, H); sub(g, () => { g.beginPath(); g.arc(W / 2, H / 2, R * p, 0, PI * 2); g.clip(); full(g, B, W, H); }); } else { full(g, B, W, H); sub(g, () => { g.beginPath(); g.arc(W / 2, H / 2, R * (1 - p), 0, PI * 2); g.clip(); full(g, A, W, H); }); }
  };
  const doors = (axis, open) => (g, A, B, p, W, H) => {
    full(g, open ? A : B, W, H);
    sub(g, () => { const q = open ? p : 1 - p; if (axis === 'v') clipRect(g, (W * (1 - q)) / 2, 0, W * q, H); else clipRect(g, 0, (H * (1 - q)) / 2, W, H * q); full(g, open ? B : A, W, H); });
  };
  const slices = (axis, dirn) => (g, A, B, p, W, H) => {
    full(g, A, W, H);
    const n = 10;
    sub(g, () => {
      g.beginPath();
      for (let i = 0; i < n; i += 1) {
        const q = clamp(p * 1.6 - (i / n) * 0.6, 0, 1);
        if (axis === 'h') { const h = H / n; g.rect(dirn > 0 ? 0 : W * (1 - q), i * h, W * q, h + 1); } else { const w = W / n; g.rect(i * w, dirn > 0 ? 0 : H * (1 - q), w + 1, H * q); }
      }
      g.clip(); full(g, B, W, H);
    });
  };
  const radial = (g, A, B, p, W, H) => { full(g, A, W, H); sub(g, () => { g.beginPath(); g.moveTo(W / 2, H / 2); g.arc(W / 2, H / 2, Math.hypot(W, H), -PI / 2, -PI / 2 + PI * 2 * p); g.closePath(); g.clip(); full(g, B, W, H); }); };
  const zoom = (into) => (g, A, B, p, W, H) => {
    if (into) { const s = 1 + p * 1.2; g.drawImage(A, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s); g.globalAlpha = p; full(g, B, W, H); g.globalAlpha = 1; return; }
    full(g, A, W, H); const s = 2.2 - 1.2 * p; g.globalAlpha = p; g.drawImage(B, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s); g.globalAlpha = 1;
  };
  const blurMix = (g, A, B, p, W, H) => { const b = Math.sin(p * PI) * 14; g.filter = `blur(${b.toFixed(1)}px)`; full(g, A, W, H); g.globalAlpha = p; full(g, B, W, H); g.globalAlpha = 1; g.filter = 'none'; };
  const grays = (g, A, B, p, W, H) => { const k = Math.sin(p * PI); g.filter = `grayscale(${k.toFixed(2)})`; full(g, A, W, H); g.globalAlpha = p; full(g, B, W, H); g.globalAlpha = 1; g.filter = 'none'; };
  const pixelize = (g, A, B, p, W, H) => {
    const k = Math.max(1, Math.round(Math.sin(p * PI) * 48));
    const m = maskCanvas(Math.max(1, Math.round(W / k)), Math.max(1, Math.round(H / k)));
    if (!m) { dissolve(g, A, B, p, W, H); return; }
    const mg = m.getContext('2d'); mg.imageSmoothingEnabled = false;
    mg.drawImage(p < 0.5 ? A : B, 0, 0, m.width, m.height);
    g.imageSmoothingEnabled = false; g.drawImage(m, 0, 0, W, H); g.imageSmoothingEnabled = true;
  };
  const squeeze = (axis) => (g, A, B, p, W, H) => {
    full(g, B, W, H);
    const q = 1 - p;
    if (axis === 'h') g.drawImage(A, (W - W * q) / 2, 0, W * q, H); else g.drawImage(A, 0, (H - H * q) / 2, W, H * q);
  };
  const flash = (color) => (g, A, B, p, W, H) => { full(g, p < 0.5 ? A : B, W, H); g.globalAlpha = Math.max(0, 1 - Math.abs(p - 0.5) * 4); g.fillStyle = color; g.fillRect(0, 0, W, H); g.globalAlpha = 1; };
  const whip = (dir) => (g, A, B, p, W, H) => {
    const sgn = dir === 'left' ? -1 : 1;
    const S0 = p < 0.5 ? A : B;
    const off = p < 0.5 ? sgn * W * ease('expoIn', p * 2) : -sgn * W * (1 - ease('expoOut', p * 2 - 1));
    g.filter = `blur(${(Math.sin(p * PI) * 22).toFixed(1)}px)`;
    g.drawImage(S0, off, 0, W, H); g.drawImage(S0, off - sgn * W, 0, W, H); g.drawImage(S0, off + sgn * W, 0, W, H);
    g.filter = 'none';
  };
  const glitch = (g, A, B, p, W, H) => {
    const S0 = p < 0.5 ? A : B;
    full(g, S0, W, H);
    const bands = 14; const amt = Math.sin(p * PI);
    for (let i = 0; i < bands; i += 1) {
      const r = Math.abs(Math.sin(i * 12.9898 + Math.floor(p * 12) * 78.233) * 43758.5453) % 1;
      if (r > 0.55 * amt + 0.3) continue;
      const y = (i / bands) * H; const h = H / bands; const dx = (r - 0.5) * W * 0.3 * amt;
      g.drawImage(r > 0.4 ? B : A, 0, y, W, h, dx, y, W, h);
    }
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.25 * amt; g.drawImage(S0, 6 * amt, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  };
  const spin = (g, A, B, p, W, H) => {
    const S0 = p < 0.5 ? A : B; const q = p < 0.5 ? p * 2 : 2 - p * 2;
    sub(g, () => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.translate(W / 2, H / 2); g.rotate((p < 0.5 ? 1 : -1) * q * PI); const s = 1 - 0.7 * q; g.scale(s, s); g.drawImage(S0, -W / 2, -H / 2, W, H); });
  };
  const rgbSplit = (g, A, B, p, W, H) => {
    const S0 = p < 0.5 ? A : B; const o = Math.sin(p * PI) * W * 0.03;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (const [dx, f] of [[-o, 'url(#edfx-r)'], [0, 'url(#edfx-g)'], [o, 'url(#edfx-b)']]) { g.filter = f; g.drawImage(S0, dx, 0, W, H); }
    g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  };
  // custom xfade expressions (YUV planes; P: 1 → 0)
  const planeOf = (A0, A1, A2) => `if(eq(PLANE,0),${A0},if(eq(PLANE,1),${A1},${A2}))`;
  const pick = (who, x, y) => planeOf(`${who}0(${x},${y})`, `${who}1(${x},${y})`, `${who}2(${x},${y})`);
  function yuv(hex) { const [r, g, b] = hex3(hex).map((v) => v * 255); return [0.257 * r + 0.504 * g + 0.098 * b + 16, -0.148 * r - 0.291 * g + 0.439 * b + 128, 0.439 * r - 0.368 * g - 0.071 * b + 128].map((v) => Math.round(v)); }
  const dipExpr = (hex) => { const [Y, U, V] = yuv(hex); const C = planeOf(Y, U, V); return `if(gt(P,0.5),A*(2*P-1)+${C}*(2-2*P),B*(1-2*P)+${C}*(2*P))`; };
  const flashExpr = (hex) => { const [Y, U, V] = yuv(hex); const C = planeOf(Y, U, V); return `(if(gt(P,0.5),A,B))*(1-max(0,1-abs(P-0.5)*4))+${C}*max(0,1-abs(P-0.5)*4)`; };
  const zoomExpr = (into) => (into
    ? `${pick('a', '(X-W/2)/(1+(1-P)*1.2)+W/2', '(Y-H/2)/(1+(1-P)*1.2)+H/2')}*P+B*(1-P)`
    : `A*P+${pick('b', '(X-W/2)/(2.2-1.2*(1-P))+W/2', '(Y-H/2)/(2.2-1.2*(1-P))+H/2')}*(1-P)`);
  const whipExpr = (dir) => {
    const s = dir === 'left' ? 1 : -1; const q = '(1-P)';
    // first half: A slides out with a 3-tap smear; second half: B slides in
    const xa = (k) => `mod(X+${s}*W*pow(2*${q},3)+${k}*W*0.02*sin(${q}*PI)+W*4,W)`;
    const xb = (k) => `mod(X-${s}*W*pow(2-2*${q},3)+${k}*W*0.02*sin(${q}*PI)+W*4,W)`;
    const smear = (who, xf) => `(${pick(who, xf(-1), 'Y')}+${pick(who, xf(0), 'Y')}+${pick(who, xf(1), 'Y')})/3`;
    return `if(lt(${q},0.5),${smear('a', xa)},${smear('b', xb)})`;
  };
  const glitchExpr = () => {
    const r = 'mod(abs(sin(floor(Y/(H/14))*12.9898+floor((1-P)*12)*78.233)*43758.5453),1)';
    const amt = 'sin((1-P)*PI)';
    const x = `X+(${r}-0.5)*W*0.3*${amt}*lt(${r},0.55*${amt}+0.3)`;
    return `if(gt(${r},0.4)*lt(${r},0.55*${amt}+0.3),${pick('b', x, 'Y')},if(gt(P,0.5),${pick('a', x, 'Y')},${pick('b', x, 'Y')}))`;
  };
  const spinExpr = () => {
    const q = 'if(gt(P,0.5),2-2*P,2*P)'; const ang = `(if(gt(P,0.5),-1,1)*${q}*PI)`; const sc = `(1-0.7*${q})`;
    const u = `((X-W/2)*cos(${ang})-(Y-H/2)*sin(${ang}))/${sc}+W/2`; const v = `((X-W/2)*sin(${ang})+(Y-H/2)*cos(${ang}))/${sc}+H/2`;
    const inside = `between(${u},0,W-1)*between(${v},0,H-1)`;
    const black = planeOf(16, 128, 128);
    return `if(${inside},if(gt(P,0.5),${pick('a', u, v)},${pick('b', u, v)}),${black})`;
  };
  const rgbExpr = () => {
    const o = 'sin((1-P)*PI)*W*0.03';
    const src = (who) => planeOf(`${who}0(X,Y)`, `${who}1(X+${o},Y)`, `${who}2(X-${o},Y)`);
    return `if(gt(P,0.5),${src('a')},${src('b')})`;
  };
  const T = (id, name, group, ff, preview, d = 0.5, extra = {}) => ({ id, name, group, ff, preview, d, ...extra });
  const TRANSITIONS = [
    T('dissolve', 'Cross dissolve', 'Dissolve', 'fade', dissolve, 0.5),
    T('dither', 'Dither dissolve', 'Dissolve', 'dissolve', dissolve, 0.5),
    T('fast-dissolve', 'Fast dissolve', 'Dissolve', 'fadefast', dissolve, 0.3),
    T('slow-dissolve', 'Slow dissolve', 'Dissolve', 'fadeslow', dissolve, 1),
    T('gray-dissolve', 'Dissolve through gray', 'Dissolve', 'fadegrays', grays, 0.6),
    T('distance', 'Distance dissolve', 'Dissolve', 'distance', dissolve, 0.6),
    T('blur-dissolve', 'Blur dissolve', 'Dissolve', 'hblur', blurMix, 0.5),
    T('dip-black', 'Dip to black', 'Dip', 'fadeblack', dip('#000'), 0.6),
    T('dip-white', 'Dip to white', 'Dip', 'fadewhite', dip('#fff'), 0.6),
    ...[['gold', '#ffc93b'], ['ember', '#ff5a1f'], ['red', '#e0202a'], ['violet', '#7a4bff'], ['blue', '#2457ff'], ['cyan', '#22d3ee'], ['pink', '#ff4fa3'], ['green', '#22c55e']].map(([n, c]) => T(`dip-${n}`, `Dip to ${n}`, 'Dip', null, dip(c), 0.6, { expr: dipExpr(c), color: c })),
    T('flash-white', 'Flash', 'Dip', null, flash('#fff'), 0.3, { expr: flashExpr('#ffffff') }),
    T('flash-gold', 'Gold flash', 'Dip', null, flash('#ffc93b'), 0.3, { expr: flashExpr('#ffc93b') }),
    ...Object.keys(DIRS).map((d) => T(`wipe-${d}`, `Wipe ${d}`, 'Wipe', `wipe${d}`, wipe(d), 0.5)),
    ...Object.keys(DIRS).map((d) => T(`soft-wipe-${d}`, `Soft wipe ${d}`, 'Wipe', `smooth${d}`, wipe(d, 0.25), 0.6)),
    T('wipe-tl', 'Wipe from top left', 'Wipe', 'wipetl', corner(0, 0), 0.5), T('wipe-tr', 'Wipe from top right', 'Wipe', 'wipetr', corner(1, 0), 0.5),
    T('wipe-bl', 'Wipe from bottom left', 'Wipe', 'wipebl', corner(0, 1), 0.5), T('wipe-br', 'Wipe from bottom right', 'Wipe', 'wipebr', corner(1, 1), 0.5),
    T('diag-tl', 'Diagonal from top left', 'Wipe', 'diagtl', corner(0, 0), 0.5), T('diag-tr', 'Diagonal from top right', 'Wipe', 'diagtr', corner(1, 0), 0.5),
    T('diag-bl', 'Diagonal from bottom left', 'Wipe', 'diagbl', corner(0, 1), 0.5), T('diag-br', 'Diagonal from bottom right', 'Wipe', 'diagbr', corner(1, 1), 0.5),
    T('clock', 'Clock wipe', 'Wipe', 'radial', radial, 0.6),
    T('iris-open', 'Iris open', 'Shape', 'circleopen', iris(true), 0.6), T('iris-close', 'Iris close', 'Shape', 'circleclose', iris(false), 0.6),
    T('circle-crop', 'Circle crop', 'Shape', 'circlecrop', iris(true), 0.6), T('rect-crop', 'Box crop', 'Shape', 'rectcrop', doors('v', true), 0.6),
    T('doors-open-v', 'Barn doors open (vertical)', 'Shape', 'vertopen', doors('v', true), 0.5), T('doors-close-v', 'Barn doors close (vertical)', 'Shape', 'vertclose', doors('v', false), 0.5),
    T('doors-open-h', 'Barn doors open (horizontal)', 'Shape', 'horzopen', doors('h', true), 0.5), T('doors-close-h', 'Barn doors close (horizontal)', 'Shape', 'horzclose', doors('h', false), 0.5),
    T('slices-left', 'Slices left', 'Shape', 'hlslice', slices('h', -1), 0.6), T('slices-right', 'Slices right', 'Shape', 'hrslice', slices('h', 1), 0.6),
    T('slices-up', 'Slices up', 'Shape', 'vuslice', slices('v', -1), 0.6), T('slices-down', 'Slices down', 'Shape', 'vdslice', slices('v', 1), 0.6),
    T('wind-left', 'Wind left', 'Shape', 'hlwind', slices('h', -1), 0.6), T('wind-right', 'Wind right', 'Shape', 'hrwind', slices('h', 1), 0.6),
    T('wind-up', 'Wind up', 'Shape', 'vuwind', slices('v', -1), 0.6), T('wind-down', 'Wind down', 'Shape', 'vdwind', slices('v', 1), 0.6),
    ...Object.keys(DIRS).map((d) => T(`push-${d}`, `Push ${d}`, 'Push', `slide${d}`, slide(d, 'push'), 0.5)),
    ...Object.keys(DIRS).map((d) => T(`cover-${d}`, `Cover ${d}`, 'Push', `cover${d}`, slide(d, 'cover'), 0.5)),
    ...Object.keys(DIRS).map((d) => T(`reveal-${d}`, `Reveal ${d}`, 'Push', `reveal${d}`, slide(d, 'reveal'), 0.5)),
    T('zoom-in', 'Zoom in', 'Motion', null, zoom(true), 0.5, { expr: zoomExpr(true) }),
    T('zoom-out', 'Zoom out', 'Motion', null, zoom(false), 0.5, { expr: zoomExpr(false) }),
    T('zoom-cross', 'Zoom cross (ffmpeg)', 'Motion', 'zoomin', zoom(true), 0.5),
    T('whip-left', 'Whip pan left', 'Motion', null, whip('left'), 0.35, { expr: whipExpr('left') }),
    T('whip-right', 'Whip pan right', 'Motion', null, whip('right'), 0.35, { expr: whipExpr('right') }),
    T('spin', 'Spin', 'Motion', null, spin, 0.5, { expr: spinExpr() }),
    T('squeeze-h', 'Squeeze horizontal', 'Motion', 'squeezeh', squeeze('h'), 0.5), T('squeeze-v', 'Squeeze vertical', 'Motion', 'squeezev', squeeze('v'), 0.5),
    T('glitch', 'Glitch', 'Digital', null, glitch, 0.4, { expr: glitchExpr() }),
    T('rgb-split', 'RGB split', 'Digital', null, rgbSplit, 0.35, { expr: rgbExpr() }),
    T('pixelate', 'Pixelate', 'Digital', 'pixelize', pixelize, 0.6),
    T('cut', 'Cut (no transition)', 'Basic', null, null, 0),
  ];
  const TRANS = Object.fromEntries(TRANSITIONS.map((t) => [t.id, t]));
  // xfade names only some ffmpeg builds have (cover / reveal came in 6.1): older builds fall back to a dissolve.
  const NEW_XFADE = /^(cover|reveal)/;

  // ---------- blend modes ----------
  // canvas: globalCompositeOperation; ff: the ffmpeg blend mode (null = plain overlay); neutral: the padding color
  // that leaves the picture under it unchanged in that mode.
  const BLENDS = [
    { id: 'normal', name: 'Normal', canvas: 'source-over', ff: null },
    { id: 'screen', name: 'Screen', canvas: 'screen', ff: 'screen', neutral: 'black' },
    { id: 'add', name: 'Add (lighter)', canvas: 'lighter', ff: 'addition', neutral: 'black' },
    { id: 'lighten', name: 'Lighten', canvas: 'lighten', ff: 'lighten', neutral: 'black' },
    { id: 'multiply', name: 'Multiply', canvas: 'multiply', ff: 'multiply', neutral: 'white' },
    { id: 'darken', name: 'Darken', canvas: 'darken', ff: 'darken', neutral: 'white' },
    { id: 'overlay', name: 'Overlay', canvas: 'overlay', ff: 'overlay', neutral: 'gray' },
    { id: 'soft-light', name: 'Soft light', canvas: 'soft-light', ff: 'softlight', neutral: 'gray' },
    { id: 'hard-light', name: 'Hard light', canvas: 'hard-light', ff: 'hardlight', neutral: 'gray' },
    { id: 'difference', name: 'Difference', canvas: 'difference', ff: 'difference', neutral: 'black' },
    { id: 'exclusion', name: 'Exclusion', canvas: 'exclusion', ff: 'exclusion', neutral: 'black' },
    { id: 'color-dodge', name: 'Color dodge', canvas: 'color-dodge', ff: 'dodge', neutral: 'black' },
    { id: 'color-burn', name: 'Color burn', canvas: 'color-burn', ff: 'burn', neutral: 'white' },
  ];
  const BLEND = Object.fromEntries(BLENDS.map((b) => [b.id, b]));

  // ---------- titles: styles ----------
  // A title item: { text, style, anim, out, animDur, x, y (anchor 0..1), size (× the style's), color, align… }.
  // Style fields: font, weight, size (fraction of the frame height), color, stroke, strokeW, shadow, glow, box
  // (background color), pad, upper, tracking (em), line (line height), align, x, y, italic, bar (accent bar color).
  const FONT_SANS = 'Inter, "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif';
  const FONT_DISPLAY = '"Oxanium", "Inter Display", Inter, "Segoe UI", system-ui, sans-serif';
  const FONT_SERIF = 'Georgia, "DejaVu Serif", "Times New Roman", serif';
  const FONT_MONO = 'ui-monospace, "DejaVu Sans Mono", Consolas, Menlo, monospace';
  const S = (id, name, group, s) => ({ id, name, group, s: { font: FONT_SANS, weight: 700, size: 0.07, color: '#ffffff', align: 'center', x: 0.5, y: 0.5, line: 1.15, tracking: 0, ...s } });
  const TITLE_STYLES = [
    S('bold', 'Bold center', 'Titles', {}),
    S('big', 'Huge headline', 'Titles', { size: 0.13, weight: 800, upper: true, tracking: -0.02 }),
    S('display', 'Display (Oxanium)', 'Titles', { font: FONT_DISPLAY, size: 0.09, upper: true, tracking: 0.04 }),
    S('thin', 'Thin elegant', 'Titles', { weight: 300, size: 0.075, tracking: 0.12, upper: true }),
    S('serif', 'Serif classic', 'Titles', { font: FONT_SERIF, weight: 400, size: 0.08, italic: true }),
    S('mono', 'Mono / code', 'Titles', { font: FONT_MONO, weight: 600, size: 0.055, color: '#9dffb0' }),
    S('outline', 'Outline', 'Titles', { color: 'rgba(0,0,0,0)', stroke: '#ffffff', strokeW: 0.04, size: 0.11, weight: 900, upper: true }),
    S('outline-gold', 'Gold outline', 'Titles', { color: 'rgba(0,0,0,0)', stroke: '#ffc93b', strokeW: 0.045, size: 0.11, weight: 900, upper: true }),
    S('neon', 'Neon glow', 'Titles', { color: '#ffffff', glow: '#ff3bd8', size: 0.09, weight: 700 }),
    S('neon-cyan', 'Cyan neon', 'Titles', { color: '#e9fdff', glow: '#22d3ee', size: 0.09, weight: 700 }),
    S('gold', 'Forgeheart gold', 'Titles', { font: FONT_DISPLAY, color: '#ffd75e', glow: '#ff8a2b', size: 0.09, upper: true, tracking: 0.06 }),
    S('ember', 'Ember', 'Titles', { color: '#ffe2c4', glow: '#ff5a1f', size: 0.09, weight: 800 }),
    S('shadow', 'Drop shadow', 'Titles', { shadow: 'rgba(0,0,0,0.7)', size: 0.08 }),
    S('boxed', 'Boxed', 'Titles', { box: '#000000cc', pad: 0.35, size: 0.06 }),
    S('boxed-gold', 'Gold box', 'Titles', { box: '#ffc93b', color: '#0a0a0a', pad: 0.35, size: 0.06, weight: 800, upper: true }),
    S('boxed-white', 'White box', 'Titles', { box: '#ffffff', color: '#0a0a0a', pad: 0.35, size: 0.06, weight: 800 }),
    S('sticker', 'Sticker', 'Titles', { box: '#ff3b6b', color: '#ffffff', pad: 0.3, size: 0.06, weight: 900, upper: true, rotate: -4 }),
    S('handwritten', 'Casual italic', 'Titles', { font: FONT_SERIF, italic: true, weight: 600, size: 0.08, color: '#fff7e0' }),
    S('caption', 'Caption (bottom)', 'Captions', { size: 0.042, weight: 700, y: 0.8, shadow: 'rgba(0,0,0,0.8)' }),
    S('caption-box', 'Caption on a box', 'Captions', { size: 0.04, weight: 700, y: 0.8, box: '#000000b0', pad: 0.3 }),
    S('caption-yellow', 'Yellow caption', 'Captions', { size: 0.045, weight: 800, y: 0.78, color: '#ffe14d', stroke: '#000', strokeW: 0.08 }),
    S('caption-tiktok', 'Social caption (big, stroked)', 'Captions', { size: 0.055, weight: 900, y: 0.62, color: '#ffffff', stroke: '#000000', strokeW: 0.1, upper: true }),
    S('subtitle', 'Subtitle', 'Captions', { size: 0.036, weight: 500, y: 0.88, shadow: 'rgba(0,0,0,0.9)' }),
    S('top', 'Top line', 'Placement', { size: 0.05, y: 0.12 }),
    S('bottom', 'Bottom line', 'Placement', { size: 0.05, y: 0.88 }),
    S('left', 'Left aligned', 'Placement', { size: 0.06, align: 'left', x: 0.08 }),
    S('right', 'Right aligned', 'Placement', { size: 0.06, align: 'right', x: 0.92 }),
    S('corner-tl', 'Corner tag (top left)', 'Placement', { size: 0.032, align: 'left', x: 0.06, y: 0.06, box: '#000000a0', pad: 0.4, upper: true, tracking: 0.08 }),
    S('corner-br', 'Corner tag (bottom right)', 'Placement', { size: 0.032, align: 'right', x: 0.94, y: 0.94, box: '#000000a0', pad: 0.4, upper: true, tracking: 0.08 }),
    S('quote', 'Quote', 'Titles', { font: FONT_SERIF, italic: true, weight: 400, size: 0.06, line: 1.3 }),
    S('stat', 'Big number', 'Titles', { size: 0.2, weight: 900, tracking: -0.04, color: '#ffd75e' }),
    S('kinetic', 'Kinetic stack', 'Titles', { size: 0.11, weight: 900, upper: true, line: 0.95, tracking: -0.03 }),
    S('glass', 'Glass card', 'Titles', { box: 'rgba(255,255,255,0.16)', pad: 0.45, size: 0.06, weight: 700, stroke: 'rgba(255,255,255,0.0)' }),
    S('chrome', 'Chrome', 'Titles', { color: '#e8edf5', shadow: 'rgba(0,0,0,0.6)', stroke: '#7d8796', strokeW: 0.02, size: 0.1, weight: 900, upper: true }),
    S('app-ui', 'App UI label', 'Titles', { font: FONT_SANS, size: 0.045, weight: 600, box: '#14161bdd', pad: 0.5, color: '#ffd75e' }),
    S('countdown', 'Countdown digit', 'Titles', { size: 0.3, weight: 900, color: '#ffffff', glow: '#ffc93b' }),
  ];
  const TSTYLE = Object.fromEntries(TITLE_STYLES.map((s) => [s.id, s]));
  // ---------- titles: animations ----------
  // unit: what moves on its own (all, line, word, char); stagger: how much of the animation time the units are
  // spread over; fn(p) (0 = hidden, 1 = settled) → { a (alpha), x, y (em), s (scale), r (deg), b (blur px@1080),
  // k (reveal 0..1, left to right), sx (horizontal scale), track (extra tracking em) }.
  const A = (id, name, unit, stagger, ease0, fn) => ({ id, name, unit, stagger, ease: ease0, fn });
  const TITLE_ANIMS = [
    A('none', 'None (cut in)', 'all', 0, 'linear', () => ({})),
    A('fade', 'Fade', 'all', 0, 'ease', (p) => ({ a: p })),
    A('fade-up', 'Fade up', 'all', 0, 'snappy', (p) => ({ a: p, y: (1 - p) * 0.6 })),
    A('fade-down', 'Fade down', 'all', 0, 'snappy', (p) => ({ a: p, y: -(1 - p) * 0.6 })),
    A('slide-left', 'Slide in from the right', 'all', 0, 'expoOut', (p) => ({ a: Math.min(1, p * 3), x: (1 - p) * 4 })),
    A('slide-right', 'Slide in from the left', 'all', 0, 'expoOut', (p) => ({ a: Math.min(1, p * 3), x: -(1 - p) * 4 })),
    A('rise', 'Rise (lines)', 'line', 0.4, 'expoOut', (p) => ({ a: p, y: (1 - p) * 1.2 })),
    A('drop', 'Drop in (lines)', 'line', 0.4, 'bounceOut', (p) => ({ a: Math.min(1, p * 2), y: -(1 - p) * 1.5 })),
    A('pop', 'Pop', 'all', 0, 'backOut', (p) => ({ a: Math.min(1, p * 2), s: p })),
    A('pop-words', 'Pop (word by word)', 'word', 0.6, 'backOut', (p) => ({ a: Math.min(1, p * 2), s: p })),
    A('pop-chars', 'Pop (letter by letter)', 'char', 0.7, 'backOut', (p) => ({ a: Math.min(1, p * 2), s: p })),
    A('zoom-out', 'Zoom out (from big)', 'all', 0, 'expoOut', (p) => ({ a: p, s: 1 + (1 - p) * 1.5 })),
    A('zoom-in', 'Zoom in (from small)', 'all', 0, 'expoOut', (p) => ({ a: p, s: 0.3 + 0.7 * p })),
    A('blur-in', 'Blur in', 'all', 0, 'easeOut', (p) => ({ a: p, b: (1 - p) * 30 })),
    A('blur-words', 'Blur in (words)', 'word', 0.6, 'easeOut', (p) => ({ a: p, b: (1 - p) * 24 })),
    A('focus', 'Focus pull', 'all', 0, 'easeInOut', (p) => ({ a: Math.min(1, p * 1.5), b: (1 - p) * 40, s: 1.08 - 0.08 * p })),
    A('typewriter', 'Typewriter', 'char', 1, 'steps8', (p) => ({ a: p >= 0.5 ? 1 : 0 })),
    A('type-cursor', 'Type with cursor', 'char', 1, 'linear', (p) => ({ a: p >= 0.5 ? 1 : 0, cursor: true })),
    A('letters-fade', 'Letters fade in', 'char', 0.8, 'ease', (p) => ({ a: p })),
    A('letters-rise', 'Letters rise', 'char', 0.7, 'expoOut', (p) => ({ a: p, y: (1 - p) * 0.8 })),
    A('letters-drop', 'Letters drop', 'char', 0.7, 'bounceOut', (p) => ({ a: Math.min(1, p * 2), y: -(1 - p) * 1.2 })),
    A('letters-spin', 'Letters spin', 'char', 0.7, 'backOut', (p) => ({ a: p, r: (1 - p) * 180, s: p })),
    A('letters-scatter', 'Letters gather', 'char', 0.5, 'expoOut', (p, i) => ({ a: p, x: (1 - p) * (Math.sin(i * 7.1) * 3), y: (1 - p) * (Math.cos(i * 3.7) * 3), r: (1 - p) * Math.sin(i) * 90 })),
    A('words-rise', 'Words rise', 'word', 0.6, 'expoOut', (p) => ({ a: p, y: (1 - p) * 0.9 })),
    A('words-slide', 'Words slide in', 'word', 0.6, 'expoOut', (p) => ({ a: p, x: (1 - p) * 1.5 })),
    A('words-flip', 'Words flip', 'word', 0.6, 'backOut', (p) => ({ a: Math.min(1, p * 2), sy: p, y: (1 - p) * 0.3 })),
    A('tracking-in', 'Tracking in (letters close up)', 'all', 0, 'expoOut', (p) => ({ a: p, track: (1 - p) * 0.6 })),
    A('tracking-out', 'Tracking out (letters spread)', 'all', 0, 'expoOut', (p) => ({ a: p, track: -(1 - p) * 0.15 })),
    A('wipe', 'Wipe reveal', 'all', 0, 'expoInOut', (p) => ({ k: p })),
    A('wipe-lines', 'Wipe reveal (lines)', 'line', 0.4, 'expoInOut', (p) => ({ k: p })),
    A('mask-up', 'Mask up (lines)', 'line', 0.35, 'expoOut', (p) => ({ y: (1 - p) * 1.1, mask: true })),
    A('mask-down', 'Mask down (lines)', 'line', 0.35, 'expoOut', (p) => ({ y: -(1 - p) * 1.1, mask: true })),
    A('stretch', 'Stretch in', 'all', 0, 'expoOut', (p) => ({ a: p, sx: 0.2 + 0.8 * p })),
    A('squash', 'Squash', 'all', 0, 'elasticOut', (p) => ({ a: Math.min(1, p * 3), sy: p, sx: 2 - p })),
    A('bounce', 'Bounce in', 'all', 0, 'bounceOut', (p) => ({ a: Math.min(1, p * 3), y: -(1 - p) * 3 })),
    A('elastic', 'Elastic', 'all', 0, 'elasticOut', (p) => ({ a: Math.min(1, p * 3), s: p })),
    A('spin-in', 'Spin in', 'all', 0, 'expoOut', (p) => ({ a: p, r: (1 - p) * -360, s: p })),
    A('swing', 'Swing', 'all', 0, 'backOut', (p) => ({ a: p, r: (1 - p) * 25, y: (1 - p) * 0.5 })),
    A('flicker', 'Flicker on', 'all', 0, 'linear', (p) => ({ a: p >= 1 ? 1 : Math.abs(Math.sin(p * 47)) > 0.5 - p * 0.5 ? 1 : 0.1 })),
    A('neon-flicker', 'Neon flicker (letters)', 'char', 0.8, 'linear', (p, i) => ({ a: p >= 1 ? 1 : Math.abs(Math.sin(p * 31 + i * 5)) > 0.6 - p * 0.6 ? 1 : 0.05 })),
    A('glitch', 'Glitch in', 'all', 0, 'linear', (p) => ({ a: p > 0.15 ? 1 : 0, x: p < 1 ? Math.sin(p * 90) * (1 - p) * 0.8 : 0, rgb: (1 - p) })),
    A('scramble', 'Scramble (decode)', 'char', 0.9, 'linear', (p) => ({ a: 1, scramble: p < 1 })),
    A('highlight', 'Highlight bar', 'all', 0, 'expoOut', (p) => ({ a: Math.min(1, p * 1.5), bar: p })),
    A('underline', 'Underline grows', 'all', 0, 'expoOut', (p) => ({ a: Math.min(1, p * 2), under: p })),
    A('box-reveal', 'Box reveal', 'all', 0, 'expoInOut', (p) => ({ a: p > 0.5 ? 1 : 0, boxWipe: p })),
    A('split', 'Split (top / bottom)', 'line', 0, 'expoOut', (p, i) => ({ a: p, x: (1 - p) * (i % 2 ? 3 : -3) })),
    A('kinetic', 'Kinetic punch (words)', 'word', 0.75, 'expoOut', (p) => ({ a: p > 0.02 ? 1 : 0, s: 1 + (1 - p) * 0.8 })),
    A('ticker', 'Count up (numbers)', 'all', 0, 'expoOut', (p) => ({ a: 1, count: p })),
  ];
  const TANIM = Object.fromEntries(TITLE_ANIMS.map((a) => [a.id, a]));
  // Lower thirds: two lines (name · role) with an accent; each a style + animation + bar.
  const LT = (id, name, s) => ({ id, name, s: { font: FONT_SANS, weight: 800, size: 0.045, color: '#ffffff', align: 'left', x: 0.07, y: 0.8, line: 1.25, sub: 0.6, ...s } });
  const LOWER_THIRDS = [
    LT('bar-gold', 'Gold bar', { bar: '#ffc93b', anim: 'wipe' }),
    LT('bar-ember', 'Ember bar', { bar: '#ff5a1f', anim: 'wipe' }),
    LT('bar-violet', 'Violet bar', { bar: '#9a6bff', anim: 'wipe' }),
    LT('box-dark', 'Dark box', { box: '#0c0d10e0', pad: 0.5, anim: 'box-reveal' }),
    LT('box-white', 'White box', { box: '#ffffff', color: '#111111', pad: 0.5, anim: 'box-reveal' }),
    LT('glass', 'Glass card', { box: 'rgba(255,255,255,0.14)', pad: 0.55, anim: 'fade-up' }),
    LT('minimal', 'Minimal', { weight: 600, anim: 'fade-up' }),
    LT('minimal-right', 'Minimal (right)', { weight: 600, align: 'right', x: 0.93, anim: 'fade-up' }),
    LT('neon', 'Neon', { glow: '#22d3ee', anim: 'neon-flicker' }),
    LT('news', 'News strap', { box: '#c2142b', pad: 0.45, upper: true, anim: 'slide-right' }),
    LT('tech', 'Tech (mono)', { font: FONT_MONO, weight: 600, color: '#9dffb0', bar: '#9dffb0', anim: 'type-cursor' }),
    LT('underline', 'Underlined', { anim: 'underline' }),
    LT('stack', 'Stacked bold', { size: 0.06, weight: 900, upper: true, line: 1.05, anim: 'mask-up' }),
    LT('center', 'Centered', { align: 'center', x: 0.5, anim: 'fade-up' }),
    LT('top-left', 'Top left tag', { y: 0.1, size: 0.035, upper: true, box: '#000000a0', pad: 0.45, anim: 'slide-right' }),
    LT('forge', 'Forgeheart', { font: FONT_DISPLAY, color: '#ffd75e', bar: '#ff8a2b', upper: true, anim: 'wipe' }),
  ];
  const LTHIRD = Object.fromEntries(LOWER_THIRDS.map((l) => [l.id, l]));

  // ---------- clip motion presets (keyframes on position / scale / rotation / opacity) ----------
  // fn(d) → { prop: [[t, v, ease]] } for a clip d seconds long (t from the clip's start).
  const M = (id, name, group, fn) => ({ id, name, group, fn });
  const MOTIONS = [
    M('ken-burns-in', 'Ken Burns in', 'Slow', (d) => ({ scale: [[0, 1, 'linear'], [d, 1.15]] })),
    M('ken-burns-out', 'Ken Burns out', 'Slow', (d) => ({ scale: [[0, 1.15, 'linear'], [d, 1]] })),
    M('push-in', 'Slow push in', 'Slow', (d) => ({ scale: [[0, 1, 'easeInOut'], [d, 1.08]] })),
    M('pull-out', 'Slow pull out', 'Slow', (d) => ({ scale: [[0, 1.08, 'easeInOut'], [d, 1]] })),
    M('pan-left', 'Pan left', 'Slow', (d) => ({ scale: [[0, 1.2]], x: [[0, 0.08, 'linear'], [d, -0.08]] })),
    M('pan-right', 'Pan right', 'Slow', (d) => ({ scale: [[0, 1.2]], x: [[0, -0.08, 'linear'], [d, 0.08]] })),
    M('pan-up', 'Pan up', 'Slow', (d) => ({ scale: [[0, 1.2]], y: [[0, 0.08, 'linear'], [d, -0.08]] })),
    M('pan-down', 'Pan down', 'Slow', (d) => ({ scale: [[0, 1.2]], y: [[0, -0.08, 'linear'], [d, 0.08]] })),
    M('drift', 'Drift', 'Slow', (d) => ({ scale: [[0, 1.1]], x: [[0, -0.03, 'easeInOut'], [d, 0.03]], rotate: [[0, -1, 'easeInOut'], [d, 1]] })),
    M('punch-in', 'Punch in', 'Hits', (d) => ({ scale: [[0, 1, 'expoOut'], [Math.min(0.25, d / 2), 1.25]] })),
    M('punch-out', 'Punch out', 'Hits', (d) => ({ scale: [[0, 1.25, 'expoOut'], [Math.min(0.25, d / 2), 1]] })),
    M('beat-bump', 'Bump', 'Hits', (d) => ({ scale: [[0, 1.12, 'expoOut'], [Math.min(0.3, d), 1]] })),
    M('shake', 'Camera shake', 'Hits', (d) => { const k = []; const n = Math.max(4, Math.round(d * 12)); for (let i = 0; i <= n; i += 1) k.push([(d * i) / n, i === n ? 0 : (Math.sin(i * 12.9) * 0.02), 'linear']); return { scale: [[0, 1.06]], x: k, y: k.map(([t, v]) => [t, v * 0.8, 'linear']) }; }),
    M('shake-hard', 'Hard shake', 'Hits', (d) => { const k = []; const n = Math.max(4, Math.round(Math.min(d, 0.6) * 24)); const L0 = Math.min(d, 0.6); for (let i = 0; i <= n; i += 1) k.push([(L0 * i) / n, i === n ? 0 : (Math.sin(i * 7.7) * 0.05 * (1 - i / n)), 'linear']); return { scale: [[0, 1.12]], x: k, rotate: k.map(([t, v]) => [t, v * 40, 'linear']) }; }),
    M('flash-in', 'Flash in', 'Hits', (d) => ({ opacity: [[0, 0, 'expoOut'], [Math.min(0.15, d / 2), 1]], scale: [[0, 1.1, 'expoOut'], [Math.min(0.4, d), 1]] })),
    M('pop-in', 'Pop in', 'Enter', (d) => ({ scale: [[0, 0.2, 'backOut'], [Math.min(0.45, d / 2), 1]], opacity: [[0, 0, 'linear'], [Math.min(0.12, d / 4), 1]] })),
    M('fade-in', 'Fade in', 'Enter', (d) => ({ opacity: [[0, 0, 'ease'], [Math.min(0.5, d / 2), 1]] })),
    M('fade-out', 'Fade out', 'Exit', (d) => ({ opacity: [[Math.max(0, d - 0.5), 1, 'ease'], [d, 0]] })),
    M('slide-in-left', 'Slide in from the left', 'Enter', (d) => ({ x: [[0, -1, 'expoOut'], [Math.min(0.6, d / 2), 0]] })),
    M('slide-in-right', 'Slide in from the right', 'Enter', (d) => ({ x: [[0, 1, 'expoOut'], [Math.min(0.6, d / 2), 0]] })),
    M('slide-in-top', 'Slide in from the top', 'Enter', (d) => ({ y: [[0, -1, 'expoOut'], [Math.min(0.6, d / 2), 0]] })),
    M('slide-in-bottom', 'Slide in from the bottom', 'Enter', (d) => ({ y: [[0, 1, 'expoOut'], [Math.min(0.6, d / 2), 0]] })),
    M('slide-out-left', 'Slide out to the left', 'Exit', (d) => ({ x: [[Math.max(0, d - 0.6), 0, 'expoIn'], [d, -1]] })),
    M('slide-out-right', 'Slide out to the right', 'Exit', (d) => ({ x: [[Math.max(0, d - 0.6), 0, 'expoIn'], [d, 1]] })),
    M('spin-in', 'Spin in', 'Enter', (d) => ({ rotate: [[0, -180, 'expoOut'], [Math.min(0.7, d / 2), 0]], scale: [[0, 0.2, 'expoOut'], [Math.min(0.7, d / 2), 1]] })),
    M('zoom-out-exit', 'Zoom away', 'Exit', (d) => ({ scale: [[Math.max(0, d - 0.5), 1, 'expoIn'], [d, 0.1]], opacity: [[Math.max(0, d - 0.3), 1, 'linear'], [d, 0]] })),
    M('tilt', 'Tilt', 'Slow', (d) => ({ rotate: [[0, -4, 'easeInOut'], [d, 4]], scale: [[0, 1.12]] })),
    M('float', 'Float', 'Slow', (d) => { const k = []; const n = Math.max(2, Math.round(d)); for (let i = 0; i <= n; i += 1) k.push([(d * i) / n, i % 2 ? 0.02 : -0.02, 'easeInOut']); return { y: k, scale: [[0, 1.05]] }; }),
    M('pip-tr', 'Picture in picture (top right)', 'Layout', () => ({ scale: [[0, 0.35]], x: [[0, 0.3]], y: [[0, -0.3]] })),
    M('pip-bl', 'Picture in picture (bottom left)', 'Layout', () => ({ scale: [[0, 0.35]], x: [[0, -0.3]], y: [[0, 0.3]] })),
    M('split-left', 'Split screen: left half', 'Layout', () => ({ scale: [[0, 0.5]], x: [[0, -0.25]] })),
    M('split-right', 'Split screen: right half', 'Layout', () => ({ scale: [[0, 0.5]], x: [[0, 0.25]] })),
    M('split-top', 'Split screen: top half', 'Layout', () => ({ scale: [[0, 0.5]], y: [[0, -0.25]] })),
    M('split-bottom', 'Split screen: bottom half', 'Layout', () => ({ scale: [[0, 0.5]], y: [[0, 0.25]] })),
    M('reset', 'No motion (reset)', 'Layout', () => ({})),
  ];
  const MOTION = Object.fromEntries(MOTIONS.map((m) => [m.id, m]));

  // ---------- speed ramps ----------
  // A ramp splits a clip into steps with these speeds (the curve over the clip, sampled); the sound keeps its pitch.
  const R = (id, name, speeds) => ({ id, name, speeds });
  const RAMPS = [
    R('slow-mid', 'Hero slow-mo (1 → 0.3 → 1)', [1, 0.7, 0.4, 0.3, 0.3, 0.4, 0.7, 1]),
    R('slow-in', 'Ease into slow-mo', [1, 0.8, 0.6, 0.45, 0.35, 0.3]),
    R('slow-out', 'Slow-mo back to speed', [0.3, 0.35, 0.45, 0.6, 0.8, 1]),
    R('burst', 'Speed burst (1 → 3 → 1)', [1, 1.5, 2.5, 3, 2.5, 1.5, 1]),
    R('ramp-up', 'Ramp up (to 3×)', [1, 1.3, 1.7, 2.2, 2.7, 3]),
    R('ramp-down', 'Ramp down (from 3×)', [3, 2.7, 2.2, 1.7, 1.3, 1]),
    R('flash-forward', 'Flash forward (4× then normal)', [4, 4, 3, 2, 1, 1]),
    R('bullet', 'Bullet time (0.25× center)', [1, 0.6, 0.25, 0.25, 0.25, 0.6, 1]),
    R('montage', 'Montage (2×)', [2]),
    R('half', 'Half speed', [0.5]),
    R('double', 'Double speed', [2]),
    R('pulse', 'Pulse (fast · slow · fast)', [2, 0.5, 2, 0.5, 2]),
    R('stutter', 'Stutter', [1, 0.25, 1, 0.25, 1, 0.25]),
    R('drop-hit', 'Drop hit (fast, freeze-ish, fast)', [2.5, 2, 0.3, 0.25, 1.5, 2.5]),
  ];
  const RAMP = Object.fromEntries(RAMPS.map((r) => [r.id, r]));

  // ---------- sequence formats ----------
  const F = (id, name, w, h, hint) => ({ id, name, w, h, hint });
  const FORMATS = [
    F('9:16', 'Vertical 9:16 (Reels · TikTok · Shorts)', 1080, 1920, 'Full-screen phones'),
    F('4:5', 'Portrait 4:5 (feeds)', 1080, 1350, 'Instagram / Facebook feed'),
    F('1:1', 'Square 1:1', 1080, 1080, 'Carousels, LinkedIn'),
    F('16:9', 'Landscape 16:9 (YouTube)', 1920, 1080, 'YouTube, X, websites'),
    F('16:9-4k', '16:9 4K', 3840, 2160, 'Big masters'),
    F('16:9-720', '16:9 720p (light)', 1280, 720, 'Drafts'),
    F('9:16-720', '9:16 720p (light)', 720, 1280, 'Drafts'),
    F('2:3', 'Pin 2:3', 1000, 1500, 'Pinterest'),
    F('3:4', 'Portrait 3:4', 1080, 1440, 'Profile grids'),
    F('4:3', 'Classic 4:3', 1440, 1080, 'Retro TV'),
    F('21:9', 'Cinema 21:9', 2560, 1080, 'Ultra-wide'),
    F('2.39', 'Scope 2.39:1', 1920, 804, 'Movie letterbox'),
    F('1.85', 'Flat 1.85:1', 1998, 1080, 'Cinema flat'),
    F('story', 'Story 9:16 with safe margins', 1080, 1920, 'Stories'),
  ];
  const FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];

  // ---------- more export presets (on top of VideoData.EXPORT_PRESETS) ----------
  // Same fields as VideoData's presets (w, h, fps, mbps, codec, audio…); the cut's export passes them through
  // VideoData.presetFilters / codecArgs. `size` = a target size in MB (the bitrate is computed from the length).
  const EP = (id, name, p) => ({ id, name, fps: 30, mbps: 10, audio: 'AAC 256k 48 kHz', max: '—', tip: '', ...p });
  const EXPORTS = [
    EP('story', 'Instagram Story', { w: 1080, h: 1920, tip: 'Keep text out of the top and bottom 14%.' }),
    EP('fb-feed', 'Facebook feed 4:5', { w: 1080, h: 1350 }),
    EP('fb-square', 'Facebook square', { w: 1080, h: 1080 }),
    EP('linkedin-169', 'LinkedIn 16:9', { w: 1920, h: 1080, mbps: 8 }),
    EP('linkedin-45', 'LinkedIn 4:5', { w: 1080, h: 1350, mbps: 8 }),
    EP('x-square', 'X / Twitter square', { w: 1080, h: 1080, mbps: 8, audio: 'AAC 128k 44.1 kHz' }),
    EP('threads', 'Threads 4:5', { w: 1080, h: 1350 }),
    EP('whatsapp', 'WhatsApp status (small)', { w: 720, h: 1280, mbps: 3, max: '16 MB', tip: 'Small enough to send.' }),
    EP('discord', 'Discord (under 10 MB)', { w: 0, h: 720, size: 9.5, tip: 'Bitrate picked from the length so the file stays under 10 MB.' }),
    EP('under25', 'Email / chat (under 25 MB)', { w: 0, h: 1080, size: 24 }),
    EP('under8', 'Tiny (under 8 MB)', { w: 0, h: 720, size: 7.5 }),
    EP('reels60', 'Reels 60 fps', { w: 1080, h: 1920, fps: 60, mbps: 14 }),
    EP('tiktok60', 'TikTok 60 fps', { w: 1080, h: 1920, fps: 60, mbps: 14 }),
    EP('yt1080-60', 'YouTube 1080p 60 fps', { w: 1920, h: 1080, fps: 60, mbps: 16 }),
    EP('draft', 'Draft (fast 720p)', { w: 0, h: 720, mbps: 3, fast: true, tip: 'Quick check render.' }),
    EP('hq-same', 'High quality, same size', { w: 0, h: 0, fps: 0, mbps: 30 }),
    EP('hevc', 'H.265 / HEVC (smaller files)', { w: 0, h: 0, fps: 0, mbps: 8, codec: 'hevc' }),
    EP('gif-small', 'GIF small (480 wide, 12 fps)', { w: 480, h: 0, fps: 12, codec: 'gif', audio: 'none' }),
    EP('gif-hq', 'GIF high (960 wide, 20 fps)', { w: 960, h: 0, fps: 20, codec: 'gif', audio: 'none' }),
    EP('webm-alpha', 'WebM VP9 (website loop, no sound)', { w: 0, h: 0, fps: 0, mbps: 5, codec: 'vp9', audio: 'none' }),
    EP('audio-wav', 'Audio only (WAV)', { w: 0, h: 0, codec: 'wav', audio: 'PCM 16-bit' }),
    EP('audio-mp3', 'Audio only (MP3)', { w: 0, h: 0, codec: 'mp3', audio: 'MP3 320k' }),
    EP('audio-aac', 'Audio only (AAC .m4a)', { w: 0, h: 0, codec: 'aac', audio: 'AAC 256k' }),
    EP('jpg-stills', 'JPEG stills (every frame)', { w: 0, h: 0, codec: 'jpg' }),
    EP('poster', 'Poster frame (PNG of the playhead)', { w: 0, h: 0, codec: 'poster' }),
  ];
  // Encoder args for the presets above that VideoData doesn't know (hevc, audio, size targets).
  function exportCodec(p, seconds = 10) {
    if (p.codec === 'hevc') return { args: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '24', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k'], ext: 'mp4' };
    if (p.codec === 'wav') return { args: ['-vn', '-c:a', 'pcm_s16le'], ext: 'wav', audioOnly: true };
    if (p.codec === 'mp3') return { args: ['-vn', '-c:a', 'libmp3lame', '-b:a', '320k'], ext: 'mp3', audioOnly: true };
    if (p.codec === 'aac') return { args: ['-vn', '-c:a', 'aac', '-b:a', '256k'], ext: 'm4a', audioOnly: true };
    if (p.codec === 'vp9' && p.audio === 'none') return { args: ['-c:v', 'libvpx-vp9', '-b:v', `${p.mbps}M`, '-row-mt', '1', '-an'], ext: 'webm' };
    if (p.size) {
      const kbps = Math.max(300, Math.floor(((p.size * 8 * 1024) / Math.max(1, seconds)) - 140));
      return { args: ['-c:v', 'libx264', '-preset', 'medium', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.2)}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k'], ext: 'mp4' };
    }
    if (p.fast) return { args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k'], ext: 'mp4' };
    return null;
  }

  // ---------- sequence templates ----------
  // A template is a whole starting edit: format, length, markers on the beats of a tempo, title items with their
  // animations, empty slots (gaps) to drop footage on, transitions between slots. build(opts) → partial edit.
  // Slots are gaps on the main track: drop a clip on one (or /cut-add) and it takes the slot's place.
  const TP = (id, name, fmt, secs, build, hint = '') => ({ id, name, fmt, secs, build, hint });
  const titleItem = (text, start, dur, style, anim, extra = {}) => ({ kind: 'title', text, start, dur, style, anim, out: extra.out || 'fade', animDur: extra.animDur || 0.5, ...extra });
  const slots = (n, len, trans = null, td = 0.3) => Array.from({ length: n }, (_, i) => ({ kind: 'gap', dur: len, slot: i + 1, trans: i && trans ? { type: trans, dur: td } : undefined }));
  const beatMarkers = (bpm, secs, every = 4) => { const out = []; const b = 60 / bpm; for (let t = 0, i = 0; t < secs - 1e-3; t += b * every, i += 1) out.push({ t: Number(t.toFixed(4)), label: `bar ${i + 1}` }); return out; };
  const TEMPLATES = [
    TP('social-intro-15', 'Social intro 15 s (9:16)', '9:16', 15, () => ({
      clips: slots(6, 2.5, 'dissolve', 0.25),
      text: [titleItem('YOUR APP', 0.3, 2.2, 'big', 'tracking-in'), titleItem('one window · all your AI', 3, 2.2, 'bold', 'words-rise'), titleItem('Feature one', 5.5, 2, 'caption-tiktok', 'pop'), titleItem('Feature two', 8, 2, 'caption-tiktok', 'pop'), titleItem('Feature three', 10.5, 2, 'caption-tiktok', 'pop'), titleItem('Try it today', 12.6, 2.2, 'gold', 'zoom-out')],
      markers: beatMarkers(120, 15) }), 'Six slots, hook title, three feature captions, end card'),
    TP('app-teaser-15', 'App teaser 15 s (motion design)', '9:16', 15, () => ({
      clips: slots(8, 1.875, 'whip-left', 0.25),
      text: [titleItem('Meet', 0.2, 1.6, 'thin', 'letters-fade'), titleItem('HEARTH', 1.9, 1.7, 'display', 'glitch'), titleItem('Chat', 3.8, 1.6, 'kinetic', 'kinetic'), titleItem('Build', 5.6, 1.6, 'kinetic', 'kinetic'), titleItem('Edit', 7.5, 1.6, 'kinetic', 'kinetic'), titleItem('Ship', 9.4, 1.6, 'kinetic', 'kinetic'), titleItem('All in one place', 11.3, 1.8, 'bold', 'words-rise'), titleItem('HEARTH', 13.2, 1.8, 'gold', 'zoom-out')],
      markers: beatMarkers(128, 15, 2) }), 'Eight quick slots on 128 bpm half bars, one word each'),
    TP('reel-30', 'Reel 30 s (9:16)', '9:16', 30, () => ({ clips: slots(10, 3, 'dissolve', 0.3), text: [titleItem('Title', 0.3, 2.5, 'big', 'fade-up'), titleItem('Follow for more', 27.5, 2.5, 'boxed-gold', 'pop')], markers: beatMarkers(120, 30) })),
    TP('tiktok-hook-7', 'TikTok hook 7 s', '9:16', 7, () => ({ clips: slots(4, 1.75, null), text: [titleItem('WAIT FOR IT', 0.1, 1.6, 'caption-tiktok', 'pop'), titleItem('😮', 5.3, 1.6, 'stat', 'elastic')] })),
    TP('shorts-20', 'Shorts 20 s', '9:16', 20, () => ({ clips: slots(5, 4, 'push-up', 0.3), text: [titleItem('Title', 0.3, 3, 'big', 'mask-up')] })),
    TP('yt-intro-5', 'YouTube intro 5 s (16:9)', '16:9', 5, () => ({ clips: slots(2, 2.5, 'zoom-in', 0.4), text: [titleItem('Channel name', 0.5, 4, 'display', 'tracking-in')] })),
    TP('promo-30-169', 'App promo 30 s (16:9)', '16:9', 30, () => ({ clips: slots(8, 3.75, 'dissolve', 0.4), text: [titleItem('Product', 0.3, 3, 'big', 'blur-in'), titleItem('Feature one', 4.2, 3, 'left', 'words-slide'), titleItem('Feature two', 8, 3, 'left', 'words-slide'), titleItem('Feature three', 11.7, 3, 'left', 'words-slide'), titleItem('Get it now', 26, 3.5, 'boxed-gold', 'pop')], markers: beatMarkers(120, 30) })),
    TP('square-loop-6', 'Square loop 6 s', '1:1', 6, () => ({ clips: slots(3, 2, 'dissolve', 0.3) })),
    TP('feed-15-45', 'Feed post 15 s (4:5)', '4:5', 15, () => ({ clips: slots(5, 3, 'dissolve', 0.3), text: [titleItem('Title', 0.3, 2.5, 'bold', 'fade-up')] })),
    TP('story-3x5', 'Story 3 × 5 s', '9:16', 15, () => ({ clips: slots(3, 5, 'push-left', 0.3), text: [titleItem('1/3', 0.2, 1.5, 'corner-tl', 'fade'), titleItem('2/3', 5.2, 1.5, 'corner-tl', 'fade'), titleItem('3/3', 10.2, 1.5, 'corner-tl', 'fade')] })),
    TP('logo-sting-3', 'Logo sting 3 s', '16:9', 3, () => ({ clips: slots(1, 3), text: [titleItem('LOGO', 0.3, 2.5, 'display', 'focus', { out: 'zoom-in' })] })),
    TP('countdown', 'Countdown 3-2-1', '9:16', 4, () => ({ clips: slots(4, 1, 'flash-white', 0.15), text: [titleItem('3', 0, 1, 'countdown', 'pop', { out: 'none' }), titleItem('2', 1, 1, 'countdown', 'pop', { out: 'none' }), titleItem('1', 2, 1, 'countdown', 'pop', { out: 'none' }), titleItem('GO', 3, 1, 'gold', 'zoom-out')] })),
    TP('before-after', 'Before / after split', '9:16', 8, () => ({ clips: slots(2, 4, 'wipe-right', 0.8), text: [titleItem('BEFORE', 0.2, 3.5, 'corner-tl', 'slide-right'), titleItem('AFTER', 4.2, 3.5, 'corner-br', 'slide-left')] })),
    TP('features-4', 'Feature list (4 beats)', '9:16', 12, () => ({ clips: slots(4, 3, 'push-up', 0.3), text: ['Feature one', 'Feature two', 'Feature three', 'Feature four'].map((t, i) => titleItem(t, i * 3 + 0.2, 2.6, 'caption-box', 'words-rise')) })),
    TP('beat-montage', 'Beat montage (16 cuts at 120 bpm)', '9:16', 8, () => ({ clips: slots(16, 0.5), markers: beatMarkers(120, 8, 1) })),
    TP('quote-card', 'Quote card 6 s', '1:1', 6, () => ({ clips: [{ kind: 'title', dur: 6, text: '', bg: '#0c0d10' }], text: [titleItem('“A quote that matters.”', 0.4, 5.2, 'quote', 'words-rise'), titleItem('— Name', 2.2, 3.4, 'thin', 'fade', { y: 0.68 })] })),
    TP('lower-third-demo', 'Interview with lower third', '16:9', 10, () => ({ clips: slots(1, 10), text: [{ kind: 'title', lower: 'bar-gold', text: 'Name Surname\nRole · Company', start: 1, dur: 5, anim: 'wipe', out: 'fade', animDur: 0.6 }] })),
    TP('trailer-30', 'Trailer 30 s (dark, dips)', '16:9', 30, () => ({ clips: slots(9, 3.6, 'dip-black', 0.6), text: [titleItem('THIS FALL', 3.5, 2.5, 'thin', 'tracking-in'), titleItem('ONE APP', 11, 2.5, 'thin', 'tracking-in'), titleItem('CHANGES', 18, 2.5, 'thin', 'tracking-in'), titleItem('EVERYTHING', 24, 3, 'big', 'glitch')], look: 'blockbuster' })),
    TP('product-reveal', 'Product reveal 10 s', '9:16', 10, () => ({ clips: slots(3, 3.6, 'iris-open', 0.5), text: [titleItem('Introducing', 0.3, 2.5, 'thin', 'letters-fade'), titleItem('PRODUCT', 3.5, 3, 'display', 'zoom-out'), titleItem('Available now', 7.2, 2.6, 'boxed-gold', 'pop')] })),
    TP('slideshow', 'Photo slideshow (8 × 2 s, Ken Burns)', '16:9', 16, () => ({ clips: slots(8, 2.25, 'dissolve', 0.3), motion: 'ken-burns-in' })),
    TP('tutorial', 'Tutorial steps (16:9)', '16:9', 24, () => ({ clips: slots(4, 6, 'push-left', 0.4), text: ['Step 1', 'Step 2', 'Step 3', 'Step 4'].map((t, i) => titleItem(t, i * 5.6 + 0.3, 2.4, 'corner-tl', 'slide-right')) })),
    TP('meme', 'Meme (top / bottom text)', '1:1', 6, () => ({ clips: slots(1, 6), text: [titleItem('TOP TEXT', 0, 6, 'caption-tiktok', 'none', { y: 0.1, out: 'none' }), titleItem('BOTTOM TEXT', 0, 6, 'caption-tiktok', 'none', { y: 0.9, out: 'none' })] })),
    TP('music-visual-30', 'Music visual 30 s (Lab recording)', '9:16', 30, () => ({ clips: slots(1, 30), text: [titleItem('Artist — Track', 0.5, 4, 'thin', 'tracking-in')] })),
    TP('event', 'Event promo 15 s', '4:5', 15, () => ({ clips: slots(5, 3, 'cover-left', 0.3), text: [titleItem('EVENT NAME', 0.3, 3, 'big', 'mask-up'), titleItem('DATE · PLACE', 3.5, 3, 'boxed-gold', 'box-reveal'), titleItem('Tickets →', 12, 2.8, 'bold', 'pop')] })),
    TP('blank-916', 'Blank 9:16 (10 s)', '9:16', 10, () => ({ clips: slots(1, 10) })),
    TP('blank-169', 'Blank 16:9 (10 s)', '16:9', 10, () => ({ clips: slots(1, 10) })),
    TP('blank-11', 'Blank 1:1 (10 s)', '1:1', 10, () => ({ clips: slots(1, 10) })),
    TP('blank-45', 'Blank 4:5 (10 s)', '4:5', 10, () => ({ clips: slots(1, 10) })),
  ];
  const TEMPLATE = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

  // ---------- markers ----------
  const MARKER_COLORS = [['gold', '#ffd75e'], ['red', '#ff4d4d'], ['orange', '#ff8c42'], ['green', '#4fd18b'], ['blue', '#6bc7ff'], ['violet', '#9b8bff'], ['pink', '#ff6b9a'], ['white', '#ffffff']];

  // find by id or by loose name ("teal orange", "Cross dissolve")
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  function find(list, q) {
    if (!q) return null;
    const n = norm(q);
    return list.find((x) => x.id === q) || list.find((x) => norm(x.id) === n) || list.find((x) => norm(x.name) === n)
      || list.find((x) => norm(x.name).startsWith(n) || norm(x.id).startsWith(n)) || list.find((x) => norm(x.name).includes(n)) || null;
  }

  return {
    EASES, EASE, ease, bezier, keyValue, keyExpr,
    ADJ, LOOKS, LOOK, grade, colorMath, svgMatrix, colorFilters, cssFilter, hex3,
    TRANSITIONS, TRANS, NEW_XFADE, BLENDS, BLEND,
    TITLE_STYLES, TSTYLE, TITLE_ANIMS, TANIM, LOWER_THIRDS, LTHIRD, FONT_SANS,
    MOTIONS, MOTION, RAMPS, RAMP, FORMATS, FPS, EXPORTS, exportCodec, TEMPLATES, TEMPLATE, MARKER_COLORS, find,
  };
})();
if (typeof module !== 'undefined') module.exports = EditFX;
