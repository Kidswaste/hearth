// The cinematic grade's data and pure helpers (round 24 "grade"; no DOM, loads in Node for tests): the two filter
// layers' settings (◐ Grade = filter('cgrade', P): tone mapping, exposure, white balance, lift / gamma / gain, curves,
// an HSL qualifier, saturation / vibrance, split toning, a LUT, vignette, grain, letterbox; ◐ Film & lens =
// filter('clens', P): bloom, halation, anamorphic streaks, chromatic aberration, lens distortion; the shaders live in
// tools/three-sandbox.html "cinematic grade"), the starter LUT pack's names (made procedurally in the sandbox), grade
// presets, .cube files in and out, the layer code, and the scopes (waveform, vectorscope, histogram) from a small read.
//   GradeCore.SPEC / LENS / TONES / BARS / PACK / PRESETS · defaults(kind) · code(kind, values, { luts })
//   clipLayers(spec, clipId) (a sequence clip's grade as filter layers) · parseCube(text) · writeCube({ title, N, data })
//   scopes(rgba, w, h) → { hist, wave, vec } · presetValues(id) · describe(values)
const GradeCore = (() => {
  const TONES = ['none', 'aces', 'agx', 'filmic', 'reinhard', 'neutral'];
  const TONE_NAMES = { none: 'None', aces: 'ACES', agx: 'AgX', filmic: 'Filmic', reinhard: 'Reinhard', neutral: 'Neutral' };
  const BARS = ['off', '2.39:1', '2.35:1', '2:1', '1.85:1', '16:9', '4:3', '1:1', '4:5', '9:16'];
  // the starter LUTs (made in the sandbox from recipes: GRADE.PACK, same names)
  const PACK = [
    ['teal-orange', 'Teal & orange', 'Blockbuster: teal shadows, warm skin and highlights'],
    ['bleach-bypass', 'Bleach bypass', 'Silver retained: low saturation, hard contrast'],
    ['kodak-warm', 'Kodak-ish warm', 'Warm, soft contrast, lifted blacks, rich reds (Portra-like)'],
    ['fuji-fresh', 'Fuji-ish fresh', 'Cool shadows, clean greens and cyans'],
    ['noir', 'Noir', 'Black & white with a red filter, deep contrast'],
    ['cross-process', 'Cross-process', 'Slide film in negative chemistry: yellow highs, blue lows'],
    ['day-for-night', 'Day for night', 'Daylight made into moonlight'],
    ['vintage-fade', 'Vintage fade', 'Faded blacks, warm and soft (70s print)'],
    ['cyberpunk', 'Cyberpunk', 'Cyan shadows, magenta highlights, punchy'],
    ['golden-hour', 'Golden hour', 'Warm gold light everywhere'],
    ['arctic-blue', 'Arctic blue', 'Cold, slightly desaturated, clean'],
    ['matrix-green', 'Matrix green', 'Green cast in everything'],
    ['sepia', 'Sepia', 'Old photo brown'],
    ['film-print', 'Film print', 'Print stock contrast with a gentle warm-cool split'],
  ];
  const PACK_IDS = PACK.map((p) => p[0]);
  // spec helpers: number, color, choice (+ group)
  const n = (value, min, max, label, group, step) => ({ value, min, max, label, group, ...(step ? { step } : {}) });
  const c = (value, label, group) => ({ value, label, group });
  const o = (value, options, label, group) => ({ value, options, label, group });
  const SPEC = {
    tone: o('none', TONES, 'Tone mapping', 'Tone'), exposure: n(0, -3, 3, 'Exposure (stops)', 'Tone'), contrast: n(1, 0.5, 2, 'Contrast', 'Tone'),
    temp: n(0, -1, 1, 'Temperature', 'Balance'), tint: n(0, -1, 1, 'Tint', 'Balance'),
    liftHue: n(210, 0, 360, 'Lift hue', 'Wheels', 1), liftAmt: n(0, 0, 1, 'Lift color', 'Wheels'), liftLum: n(0, -1, 1, 'Lift', 'Wheels'),
    gammaHue: n(30, 0, 360, 'Gamma hue', 'Wheels', 1), gammaAmt: n(0, 0, 1, 'Gamma color', 'Wheels'), gammaLum: n(0, -1, 1, 'Gamma', 'Wheels'),
    gainHue: n(40, 0, 360, 'Gain hue', 'Wheels', 1), gainAmt: n(0, 0, 1, 'Gain color', 'Wheels'), gainLum: n(0, -1, 1, 'Gain', 'Wheels'),
    cL1: n(0.25, 0, 1, 'Luma shadows', 'Curves'), cL2: n(0.5, 0, 1, 'Luma mids', 'Curves'), cL3: n(0.75, 0, 1, 'Luma highs', 'Curves'),
    cR1: n(0.25, 0, 1, 'Red shadows', 'Curves'), cR2: n(0.5, 0, 1, 'Red mids', 'Curves'), cR3: n(0.75, 0, 1, 'Red highs', 'Curves'),
    cG1: n(0.25, 0, 1, 'Green shadows', 'Curves'), cG2: n(0.5, 0, 1, 'Green mids', 'Curves'), cG3: n(0.75, 0, 1, 'Green highs', 'Curves'),
    cB1: n(0.25, 0, 1, 'Blue shadows', 'Curves'), cB2: n(0.5, 0, 1, 'Blue mids', 'Curves'), cB3: n(0.75, 0, 1, 'Blue highs', 'Curves'),
    qHue: n(20, 0, 360, 'Hue to change', 'HSL', 1), qRange: n(40, 5, 180, 'Hue range', 'HSL', 1), qSoft: n(0.5, 0, 1, 'Softness', 'HSL'),
    qShift: n(0, -180, 180, 'Shift its hue', 'HSL', 1), qSat: n(0, -1, 1, 'Its saturation', 'HSL'), qLum: n(0, -1, 1, 'Its brightness', 'HSL'),
    saturation: n(1, 0, 2, 'Saturation', 'Color'), vibrance: n(0, -1, 1, 'Vibrance', 'Color'),
    split: n(0, 0, 1, 'Split toning', 'Color'), splitShadows: c('#1f6f8b', 'Shadow tone', 'Color'), splitHighlights: c('#ffb35c', 'Highlight tone', 'Color'), splitBalance: n(0, -1, 1, 'Split balance', 'Color'),
    lut: o('none', ['none', ...PACK_IDS], 'LUT', 'LUT'), lutMix: n(1, 0, 1, 'LUT strength', 'LUT'),
    vignette: n(0, 0, 1, 'Vignette', 'Film'), vigSoft: n(0.5, 0, 1, 'Vignette softness', 'Film'),
    grain: n(0, 0, 1, 'Grain', 'Film'), grainSize: n(1.5, 1, 6, 'Grain size', 'Film'), grainLuma: n(0.6, 0, 1, 'Grain in the mids', 'Film'),
    bars: o('off', BARS, 'Letterbox', 'Film'), barColor: c('#000000', 'Bar color', 'Film'),
    amount: n(1, 0, 1, 'Grade amount', 'Mix'),
  };
  const LENS = {
    bloom: n(0, 0, 2, 'Bloom', 'Light'), threshold: n(0.7, 0, 1, 'Glow above brightness', 'Light'), radius: n(1, 0.2, 3, 'Glow size', 'Light'),
    halation: n(0, 0, 2, 'Halation', 'Light'), halColor: c('#ff4a1c', 'Halation color', 'Light'),
    streak: n(0, 0, 2, 'Anamorphic streaks', 'Lens'), streakLen: n(0.5, 0.05, 1, 'Streak length', 'Lens'), streakColor: c('#6fa8ff', 'Streak color', 'Lens'),
    ca: n(0, 0, 3, 'Chromatic aberration', 'Lens'), distort: n(0, -1, 1, 'Lens distortion', 'Lens'),
    amount: n(1, 0, 1, 'Amount', 'Mix'),
  };
  const specOf = (kind) => (kind === 'lens' ? LENS : SPEC);
  const defaults = (kind = 'grade') => Object.fromEntries(Object.entries(specOf(kind)).map(([k, s]) => [k, s.value]));
  // what a slider is called, for chat (exposure, lift, "lut strength"…) → its key
  const ALIAS = { ev: 'exposure', temperature: 'temp', wb: 'temp', sat: 'saturation', vib: 'vibrance', lift: 'liftLum', gamma: 'gammaLum', gain: 'gainLum', strength: 'lutMix', lutmix: 'lutMix', letterbox: 'bars', format: 'bars', mix: 'amount', grainsize: 'grainSize', bloomthreshold: 'threshold', anamorphic: 'streak', streaks: 'streak', aberration: 'ca', chromatic: 'ca', distortion: 'distort', tonemap: 'tone', tonemapping: 'tone' };
  function keyOf(word) {
    const w = String(word || '').replace(/[\s_-]/g, '').toLowerCase();
    if (!w) return null;
    for (const kind of ['grade', 'lens']) for (const k of Object.keys(specOf(kind))) if (k.toLowerCase() === w) return { kind, key: k };
    if (ALIAS[w]) return { kind: LENS[ALIAS[w]] && !SPEC[ALIAS[w]] ? 'lens' : 'grade', key: ALIAS[w] };
    for (const kind of ['grade', 'lens']) for (const [k, s] of Object.entries(specOf(kind))) if (s.label.replace(/[\s()-]/g, '').toLowerCase() === w) return { kind, key: k };
    return null;
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // a value for a slider, checked: numbers clamped, colors #rrggbb, choices from the list
  function valueFor(kind, key, v, { luts = [] } = {}) {
    const s = specOf(kind)[key];
    if (!s) return undefined;
    if (s.options) {
      const opts = key === 'lut' ? ['none', ...PACK_IDS, ...luts] : s.options; const w = String(v).toLowerCase().trim();
      return opts.find((x) => x.toLowerCase() === w) ?? opts.find((x) => x.toLowerCase().startsWith(`${w}:`)) ?? opts.find((x) => x.toLowerCase().startsWith(w)) ?? undefined;
    }
    if (typeof s.value === 'string') return /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : undefined;
    const x = Number(v);
    return Number.isFinite(x) ? clamp(x, s.min, s.max) : undefined;
  }
  // ---------- presets: a whole grade (+ film & lens) in one click ----------
  const PRESETS = [
    { id: 'neutral', name: 'Neutral', desc: 'Back to no grade (every setting at its start)', grade: {}, lens: null },
    { id: 'blockbuster', name: 'Blockbuster', desc: 'ACES, teal & orange, a little bloom, 2.39 bars', grade: { tone: 'aces', contrast: 1.08, lut: 'teal-orange', lutMix: 0.75, vignette: 0.25, bars: '2.39:1' }, lens: { bloom: 0.35, threshold: 0.75 } },
    { id: 'kodak', name: 'Kodak warm', desc: 'Filmic curve, warm stock, grain and halation', grade: { tone: 'filmic', lut: 'kodak-warm', lutMix: 0.85, grain: 0.25, vignette: 0.2 }, lens: { halation: 0.45, threshold: 0.7 } },
    { id: 'fuji', name: 'Fuji fresh', desc: 'AgX, cool clean greens, fine grain', grade: { tone: 'agx', lut: 'fuji-fresh', lutMix: 0.8, grain: 0.15, vibrance: 0.15 }, lens: null },
    { id: 'noir', name: 'Noir', desc: 'Hard black & white, grain, vignette, wide bars', grade: { lut: 'noir', contrast: 1.15, grain: 0.4, grainSize: 2, vignette: 0.55, bars: '2.39:1' }, lens: { halation: 0.2 } },
    { id: 'bleach', name: 'Bleach bypass', desc: 'Desaturated silver look with bite', grade: { lut: 'bleach-bypass', contrast: 1.05, grain: 0.2 }, lens: null },
    { id: 'crossprocess', name: 'Cross-processed', desc: 'Yellow highs, blue lows, punchy', grade: { lut: 'cross-process', lutMix: 0.9, vignette: 0.3, grain: 0.2 }, lens: null },
    { id: 'night', name: 'Day for night', desc: 'Moonlight from daylight, cold and low', grade: { lut: 'day-for-night', exposure: -0.3, vignette: 0.45 }, lens: { bloom: 0.15 } },
    { id: 'vintage', name: 'Vintage 70s', desc: 'Faded print, heavy grain, halation, soft corners', grade: { lut: 'vintage-fade', grain: 0.5, grainSize: 2.2, vignette: 0.4, vigSoft: 0.8 }, lens: { halation: 0.5, threshold: 0.6 } },
    { id: 'neon', name: 'Music video neon', desc: 'Cyberpunk colors, bloom, streaks and fringes', grade: { tone: 'aces', lut: 'cyberpunk', saturation: 1.15 }, lens: { bloom: 0.7, threshold: 0.6, streak: 0.5, ca: 0.8 } },
    { id: 'scifi', name: 'Anamorphic sci-fi', desc: 'Cold blue, blue streaks, fringes, 2.39 bars', grade: { tone: 'agx', lut: 'arctic-blue', bars: '2.39:1', vignette: 0.2 }, lens: { streak: 0.8, streakLen: 0.7, ca: 0.6, bloom: 0.25, distort: 0.15 } },
    { id: 'golden', name: 'Golden hour', desc: 'Warm gold light and a soft glow', grade: { lut: 'golden-hour', temp: 0.2, vibrance: 0.2 }, lens: { bloom: 0.4, threshold: 0.65, radius: 1.4 } },
    { id: 'commercial', name: 'Clean commercial', desc: 'Neutral curve, lively colors, a hint of glow', grade: { tone: 'neutral', vibrance: 0.25, contrast: 1.05 }, lens: { bloom: 0.15, threshold: 0.8 } },
    { id: 'documentary', name: 'Documentary', desc: 'Reinhard roll-off, muted colors, fine grain', grade: { tone: 'reinhard', saturation: 0.88, grain: 0.15 }, lens: null },
    { id: 'super8', name: 'Super 8 home movie', desc: 'Warm fade, big grain, dark corners, 4:3', grade: { lut: 'vintage-fade', temp: 0.3, grain: 0.6, grainSize: 3, vignette: 0.6, bars: '4:3' }, lens: { halation: 0.35, ca: 0.4 } },
    { id: 'matrix', name: 'Matrix', desc: 'Green-cast digital world', grade: { lut: 'matrix-green', contrast: 1.1 }, lens: { bloom: 0.2 } },
    { id: 'sepia', name: 'Old photo', desc: 'Sepia, grain and vignette', grade: { lut: 'sepia', grain: 0.35, vignette: 0.5 }, lens: null },
    { id: 'print', name: 'Film print', desc: 'Print contrast, warm-cool split, grain', grade: { tone: 'filmic', lut: 'film-print', grain: 0.2 }, lens: { halation: 0.25 } },
    { id: 'teal', name: 'Teal shadows (wheels)', desc: 'Lift toward teal, gain toward warm: no LUT', grade: { liftHue: 195, liftAmt: 0.5, gainHue: 35, gainAmt: 0.35, contrast: 1.05 }, lens: null },
  ];
  const PRESET = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
  const findPreset = (q) => {
    const w = String(q || '').toLowerCase().trim();
    return PRESET[w] || PRESETS.find((p) => p.name.toLowerCase() === w) || PRESETS.find((p) => p.name.toLowerCase().includes(w) || p.id.includes(w.replace(/\s+/g, ''))) || null;
  };
  const presetValues = (id) => { const p = findPreset(id); return p ? { grade: { ...defaults('grade'), ...p.grade }, lens: p.lens ? { ...defaults('lens'), ...p.lens } : null, preset: p } : null; };

  // ---------- layer code ----------
  const q = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(Math.round(v * 10000) / 10000));
  const NAMES = { grade: '◐ Grade', lens: '◐ Film & lens' };
  const TYPE = { grade: 'cgrade', lens: 'clens' };
  // the layer's code: every setting a slider (tweak), grouped like the panel; luts: imported LUT names (the LUT choice)
  function code(kind = 'grade', values = {}, { luts = [] } = {}) {
    const spec = specOf(kind);
    const lines = Object.entries(spec).map(([k, s]) => {
      const v = k in values ? values[k] : s.value;
      const parts = [`value: ${q(v)}`];
      if (s.options) parts.push(`options: [${(k === 'lut' ? [...new Set(['none', ...PACK_IDS, ...luts, ...(v && !PACK_IDS.includes(v) && v !== 'none' ? [v] : [])])] : s.options).map(q).join(', ')}]`);
      if (s.min != null) parts.push(`min: ${s.min}`, `max: ${s.max}`);
      if (s.step != null) parts.push(`step: ${s.step}`);
      parts.push(`label: ${q(s.label)}`, `group: ${q(s.group)}`);
      return `  ${k}: { ${parts.join(', ')} },`;
    });
    return `// ${NAMES[kind]} (round 24): ${kind === 'lens' ? 'bloom, halation, anamorphic streaks, chromatic aberration, lens distortion' : 'tone mapping, exposure, white balance, lift / gamma / gain, curves, HSL, LUT, vignette, grain, letterbox'}.
// It changes everything below it; the ◐ Grade panel (right-click the preview › ◐ Grade, /grade) moves these sliders.
const P = tweak({
${lines.join('\n')}
});
filter('${TYPE[kind]}', P);
`;
  }
  // a sequence clip's grade as filter layers on top of the clip (no sliders: the values are written in); spec =
  // { grade: {…changed values}, lens: {…} | null, name }
  function clipLayers(spec, clipId) {
    if (!spec?.grade && !spec?.lens) return null;
    const out = [];
    const plain = (kind, vals) => `filter('${TYPE[kind]}', ${JSON.stringify({ ...defaults(kind), ...vals })});\n`;
    if (spec.lens) out.push({ id: `${clipId}~cl`, code: plain('lens', spec.lens), props: { name: `${NAMES.lens}`, seqGrade: true } });
    if (spec.grade) out.push({ id: `${clipId}~cg`, code: plain('grade', spec.grade), props: { name: `${NAMES.grade}`, seqGrade: true } });
    return out;
  }
  // only what differs from the start values (a clip keeps that)
  const changed = (kind, values = {}) => Object.fromEntries(Object.entries(values).filter(([k, v]) => specOf(kind)[k] && v !== specOf(kind)[k].value));
  function describe(values = {}, lens = null) {
    const d = changed('grade', values); const parts = [];
    if (d.tone) parts.push(TONE_NAMES[d.tone] || d.tone);
    if (d.exposure) parts.push(`${d.exposure > 0 ? '+' : ''}${Math.round(d.exposure * 10) / 10} EV`);
    if (d.lut && d.lut !== 'none') parts.push(`LUT ${d.lut}${(values.lutMix ?? 1) < 1 ? ` ${Math.round(values.lutMix * 100)}%` : ''}`);
    if (d.temp) parts.push(d.temp > 0 ? 'warmer' : 'cooler');
    if (d.liftAmt || d.gammaAmt || d.gainAmt || d.liftLum || d.gammaLum || d.gainLum) parts.push('wheels');
    if (['cL1', 'cL2', 'cL3', 'cR1', 'cR2', 'cR3', 'cG1', 'cG2', 'cG3', 'cB1', 'cB2', 'cB3'].some((k) => k in d)) parts.push('curves');
    if (d.qShift || d.qSat || d.qLum) parts.push('HSL');
    if (d.saturation != null || d.vibrance) parts.push('saturation');
    if (d.split) parts.push('split tone');
    if (d.vignette) parts.push('vignette');
    if (d.grain) parts.push('grain');
    if (d.bars && d.bars !== 'off') parts.push(`bars ${d.bars}`);
    const l = lens ? changed('lens', lens) : {};
    for (const [k, w] of [['bloom', 'bloom'], ['halation', 'halation'], ['streak', 'streaks'], ['ca', 'fringes'], ['distort', 'distortion']]) if (l[k]) parts.push(w);
    return parts.join(' · ') || 'neutral';
  }

  // ---------- .cube files (Resolve / Premiere / Adobe spec): 3D or 1D, DOMAIN_MIN / MAX ----------
  // → { title, N, data: Float32Array (red fastest, N³·3), was: '3d' | '1d', size } (a 1D LUT becomes a 33³ 3D one)
  function parseCube(text) {
    const lines = String(text || '').split(/\r?\n/);
    let title = ''; let n3 = 0; let n1 = 0; let dmin = [0, 0, 0]; let dmax = [1, 1, 1];
    const nums = [];
    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const m = /^([A-Z_0-9]+)\s+(.*)$/.exec(line);
      if (m && /^[A-Z]/.test(m[1])) {
        const k = m[1]; const v = m[2].trim();
        if (k === 'TITLE') title = v.replace(/^"|"$/g, '');
        else if (k === 'LUT_3D_SIZE') n3 = parseInt(v, 10);
        else if (k === 'LUT_1D_SIZE') n1 = parseInt(v, 10);
        else if (k === 'DOMAIN_MIN') dmin = v.split(/\s+/).map(Number);
        else if (k === 'DOMAIN_MAX') dmax = v.split(/\s+/).map(Number);
        continue;
      }
      const p = line.split(/\s+/).map(Number);
      if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) nums.push(p[0], p[1], p[2]);
    }
    if (n3) {
      if (n3 < 2 || n3 > 129) throw new Error(`LUT_3D_SIZE ${n3} is out of range (2–129)`);
      if (nums.length < n3 ** 3 * 3) throw new Error(`This .cube has ${nums.length / 3} entries, LUT_3D_SIZE ${n3} needs ${n3 ** 3}`);
      let data = Float32Array.from(nums.slice(0, n3 ** 3 * 3));
      // a domain other than 0..1: resampled onto 0..1 (what the picture holds)
      if (dmin.some((x) => x !== 0) || dmax.some((x) => x !== 1)) data = resample3((r, g, b) => sample3({ N: n3, data }, [(r - dmin[0]) / (dmax[0] - dmin[0]), (g - dmin[1]) / (dmax[1] - dmin[1]), (b - dmin[2]) / (dmax[2] - dmin[2])]), n3);
      return { title, N: n3, data, was: '3d', size: n3 };
    }
    if (n1) {
      if (nums.length < n1 * 3) throw new Error(`This .cube has ${nums.length / 3} entries, LUT_1D_SIZE ${n1} needs ${n1}`);
      const curve = (x, ch) => { const t = clamp((x - dmin[ch]) / (dmax[ch] - dmin[ch]), 0, 1) * (n1 - 1); const i = Math.min(n1 - 2, Math.floor(t)); const f = t - i; return nums[i * 3 + ch] * (1 - f) + nums[(i + 1) * 3 + ch] * f; };
      const N = 33;
      return { title, N, data: resample3((r, g, b) => [curve(r, 0), curve(g, 1), curve(b, 2)], N), was: '1d', size: n1 };
    }
    throw new Error('Not a .cube LUT (no LUT_3D_SIZE or LUT_1D_SIZE line)');
  }
  function resample3(fn, N) {
    const out = new Float32Array(N * N * N * 3);
    for (let b = 0; b < N; b += 1) for (let g = 0; g < N; g += 1) for (let r = 0; r < N; r += 1) { const v = fn(r / (N - 1), g / (N - 1), b / (N - 1)); out.set(v, (r + g * N + b * N * N) * 3); }
    return out;
  }
  // a LUT looked up (trilinear), for checks and 1D / domain conversion
  function sample3(lut, [r, g, b]) {
    const { N, data } = lut;
    const at = (x) => { const t = clamp(x, 0, 1) * (N - 1); const i = Math.min(N - 2, Math.floor(t)); return [i, t - i]; };
    const [ri, rf] = at(r); const [gi, gf] = at(g); const [bi, bf] = at(b);
    const out = [0, 0, 0];
    for (let k = 0; k < 8; k += 1) {
      const dr = k & 1; const dg = (k >> 1) & 1; const db = (k >> 2) & 1;
      const w = (dr ? rf : 1 - rf) * (dg ? gf : 1 - gf) * (db ? bf : 1 - bf);
      if (!w) continue;
      const i = ((ri + dr) + (gi + dg) * N + (bi + db) * N * N) * 3;
      out[0] += data[i] * w; out[1] += data[i + 1] * w; out[2] += data[i + 2] * w;
    }
    return out;
  }
  function writeCube({ title = 'Hearth grade', N, data }) {
    const f = (x) => (Math.round(clamp(x, 0, 1) * 1e6) / 1e6).toFixed(6);
    const lines = [`# Made with Hearth (the Lab's ◐ Grade)`, `TITLE "${String(title).replace(/"/g, "'")}"`, `LUT_3D_SIZE ${N}`, 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0'];
    for (let i = 0; i < N * N * N; i += 1) lines.push(`${f(data[i * 3])} ${f(data[i * 3 + 1])} ${f(data[i * 3 + 2])}`);
    return `${lines.join('\n')}\n`;
  }
  const lutName = (fileName) => String(fileName || 'lut').split(/[\\/]/).pop().replace(/\.cube$/i, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'lut';

  // ---------- scopes, from a small RGBA read (Uint8ClampedArray / Uint8Array, w × h) ----------
  // hist: 4 × 64 bins (r, g, b, luma) · wave: w columns × 64 levels of luma (counts) · vec: 64 × 64 chroma (Cb, Cr)
  function scopes(px, w, h) {
    const B = 64;
    const hist = [new Uint32Array(B), new Uint32Array(B), new Uint32Array(B), new Uint32Array(B)];
    const wave = new Uint32Array(w * B); const vec = new Uint32Array(B * B);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4; const r = px[i]; const g = px[i + 1]; const b = px[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      hist[0][r >> 2] += 1; hist[1][g >> 2] += 1; hist[2][b >> 2] += 1; const lb = Math.min(B - 1, Math.round(l) >> 2); hist[3][lb] += 1;
      wave[x * B + lb] += 1;
      const cb = (b - l) / 1.8556; const cr = (r - l) / 1.5748; // −127..127
      const vx = Math.min(B - 1, Math.max(0, Math.round(B / 2 + (cb / 128) * (B / 2)))); const vy = Math.min(B - 1, Math.max(0, Math.round(B / 2 - (cr / 128) * (B / 2))));
      vec[vy * B + vx] += 1;
    }
    return { hist, wave, vec, w, h, B };
  }
  // the 6 vectorscope targets (75 % bars), where they sit on the 64 × 64 scope
  const TARGETS = [['R', [191, 0, 0]], ['Mg', [191, 0, 191]], ['B', [0, 0, 191]], ['Cy', [0, 191, 191]], ['G', [0, 191, 0]], ['Yl', [191, 191, 0]]].map(([name, [r, g, b]]) => {
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return { name, x: 32 + ((b - l) / 1.8556 / 128) * 32, y: 32 - ((r - l) / 1.5748 / 128) * 32 };
  });

  return { TONES, TONE_NAMES, BARS, PACK, PACK_IDS, SPEC, LENS, NAMES, TYPE, PRESETS, PRESET, TARGETS, specOf, defaults, keyOf, valueFor, findPreset, presetValues, code, clipLayers, changed, describe, parseCube, writeCube, sample3, lutName, scopes };
})();
if (typeof module !== 'undefined') module.exports = GradeCore;
