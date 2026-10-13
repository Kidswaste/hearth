// 🎲 Variations (round 32, labvariations): the math. No DOM, no tokens; loads in Node for the tests.
// The scene's own values (every layer's sliders, the ◐ Grade / ◐ Film & lens sliders included) sorted into four groups
// the owner can lock: colors · motion · camera · look (lighting, post effects, materials, shapes, seeds: the rest).
// make() nudges them around a base into n variations that each lean on one group ("New colors", "Livelier",
// "Another angle", "New look", "A bit of everything"), so the set reads as clearly different takes; "More like this"
// is the same around a picked one, closer. Seeded: the same seed gives the same set again.
//   VarCore.groupOf(param) · params(list) · make(params, { n, seed, locks, base, closer, steer }) → [variation]
//   steer(words) · diff(params, a, b) · hueShift(hex, deg, ds, dl) · shiftPalette(colors, deg) · GROUPS · rng(seed)
// param: { id: 'layer|key', layer, layerName, key, label, kind: 'number'|'color'|'bool'|'choice', value, min, max,
//   int, options, group }   variation: { n, seed, lean, label, values: { id: value }, changed: [id], hue }
const VarCore = (() => {
  const GROUPS = [
    { id: 'colors', icon: '🎨', label: 'Colors', hint: 'color sliders and the palette' },
    { id: 'motion', icon: '〰', label: 'Motion', hint: 'speed, spin, flow, wobble' },
    { id: 'camera', icon: '🎥', label: 'Camera', hint: 'angle, distance, zoom, field of view' },
    { id: 'look', icon: '✨', label: 'Look', hint: 'light, glow, grade, materials, shapes, seeds' },
  ];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const HEX = /^#[0-9a-f]{6}$/i;
  // mulberry32: small, fast, seeded
  function rng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

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
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return `#${[r, g, b].map((v) => Math.round(clamp(v + m, 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`;
  }
  // a color turned around the wheel (greys stay grey), its saturation / lightness nudged
  function hueShift(hex, deg, ds = 0, dl = 0) {
    if (!HEX.test(String(hex))) return hex;
    const [h, s, l] = hexToHsl(hex);
    if (s < 0.06) return hslToHex(h, s, l + dl * 0.5);
    return hslToHex(h + deg, s + ds, l + dl);
  }
  const shiftPalette = (colors, deg) => (colors || []).map((c) => hueShift(c, deg));

  // ---------- which group a value belongs to ----------
  // by its name (key + label + the layer's name), the first match wins: motion before camera ("orbit speed" moves)
  const RX = {
    colors: /\b(colou?rs?|hue|tint|palette|sat(uration)?|tone|shade|bg|background|fg|accent)\b|colou?r|hue|tint/,
    motion: /speed|spin|rotat|flow|drift|wobble|wave|sway|bounce|pulse|tempo|rate|turbul|swirl|jitter|shake|freq|velocity|orbit.?speed|time.?scale|anim|motion|wander|twist/,
    camera: /cam(era)?|fov|zoom|dist(ance)?|dolly|orbit|angle|tilt|pan\b|yaw|pitch|elevation|height|eye|look.?at|focal|lens.?len|perspective|view/,
  };
  const words = (p) => `${p.key || ''} ${p.label || ''}`.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.·-]+/g, ' ').toLowerCase();
  function groupOf(p) {
    if (/^◐/.test(p.layerName || '')) return p.kind === 'color' ? 'colors' : 'look'; // the grade's own sliders: post effects
    if (p.kind === 'color') return 'colors';
    const w = words(p);
    if (RX.motion.test(w)) return 'motion';
    if (RX.camera.test(w)) return 'camera';
    if (p.kind === 'number' && RX.colors.test(w)) return 'colors';
    return 'look';
  }
  // the director's slider list ({ key, label, value, min, max, step, options, live, layer, layerName }) → params;
  // values only read at setup (live: false) and keyframed ones are left out: they wouldn't show in a quick picture
  function params(list) {
    const out = [];
    for (const s of list || []) {
      if (s.key == null || s.live === false || s.keyed) continue;
      const v = s.value;
      const kind = typeof v === 'boolean' ? 'bool' : Array.isArray(s.options) && s.options.length ? 'choice' : typeof v === 'string' && HEX.test(v) ? 'color' : typeof v === 'number' && Number.isFinite(v) ? 'number' : null;
      if (!kind) continue;
      if (kind === 'number' && !(Number(s.max) > Number(s.min))) continue;
      const p = { id: `${s.layer}|${s.key}`, layer: s.layer, layerName: s.layerName || '', key: s.key, label: s.label || s.key, kind, value: v,
        ...(kind === 'number' ? { min: Number(s.min), max: Number(s.max), int: s.step === 1 } : {}), ...(kind === 'choice' ? { options: s.options.slice() } : {}) };
      p.group = groupOf(p);
      out.push(p);
    }
    return out;
  }

  // ---------- a few words steer the set ("warmer", "calmer", "another angle", "more glow") ----------
  function steer(text) {
    const t = String(text || '').toLowerCase();
    if (!t.trim()) return null;
    const lean = [];
    if (/colou?r|palette|hue|warm|cool|tint|vivid|pastel|neon|mono/.test(t)) lean.push('colors');
    if (/fast|faster|energ|livel|wild|calm|slow|chill|motion|speed|move|moving|still/.test(t)) lean.push('motion');
    if (/camera|angle|view|zoom|closer|further|wide|framing|perspective/.test(t)) lean.push('camera');
    if (/look|light|glow|bloom|grade|material|dark|bright|contrast|grain|shape|detail|texture|metal|rough/.test(t)) lean.push('look');
    const dir = /calm|slow|chill|still|gentle|soft|quiet/.test(t) ? -1 : /fast|faster|energ|livel|wild|punch|hard|more/.test(t) ? 1 : 0;
    const warm = /warm|orange|red|gold|sunset/.test(t) ? 1 : /cool|cold|blue|teal|ice/.test(t) ? -1 : 0;
    return lean.length || dir || warm ? { lean, dir, warm } : null;
  }

  // ---------- making the set ----------
  const LEANS = {
    colors: { label: 'New colors', amt: { colors: 1, motion: 0.12, camera: 0.12, look: 0.15 } },
    motion: { label: 'Livelier', down: 'Calmer', amt: { colors: 0.1, motion: 1, camera: 0.12, look: 0.15 } },
    camera: { label: 'Another angle', amt: { colors: 0.1, motion: 0.12, camera: 1, look: 0.15 } },
    look: { label: 'New look', amt: { colors: 0.15, motion: 0.12, camera: 0.12, look: 1 } },
    mix: { label: 'A bit of everything', amt: { colors: 0.55, motion: 0.55, camera: 0.55, look: 0.55 } },
  };
  const roundNum = (p, x) => {
    x = clamp(x, p.min, p.max);
    if (p.int) return Math.round(x);
    const span = p.max - p.min; const q = span >= 100 ? 0.1 : span >= 10 ? 0.01 : span >= 1 ? 0.001 : 0.0001;
    return Number((Math.round(x / q) * q).toFixed(4));
  };
  // one value nudged; k = how far (1 = the group this variation leans on); dir: motion up (1) / down (-1)
  function nudge(p, v, k, rand, ctx) {
    const R = (a, b) => a + rand() * (b - a);
    if (p.kind === 'color') {
      let deg = ctx.hue * Math.min(1, k) + R(-12, 12) * k;
      if (ctx.warm && HEX.test(String(v))) {
        // warmer / cooler: each color turns toward orange (30°) / teal-blue (205°) by up to 55°
        const h = hexToHsl(v)[0]; const gap = ((((ctx.warm > 0 ? 30 : 205) - h) % 360) + 540) % 360 - 180;
        deg = Math.sign(gap) * Math.min(Math.abs(gap), R(25, 55)) * Math.min(1, k + 0.3);
      }
      return hueShift(v, deg, R(-0.12, 0.12) * k, R(-0.08, 0.08) * k);
    }
    if (p.kind === 'bool') return p.group === 'look' && rand() < 0.22 * k ? !v : v;
    if (p.kind === 'choice') return rand() < 0.4 * k ? p.options[Math.floor(rand() * p.options.length)] : v;
    const span = p.max - p.min;
    if (p.group === 'motion' && ctx.dir && (k >= 0.9 || ctx.forced)) {
      // livelier / calmer: a factor on the value (from 0: a quarter of the range); asked for in words, every take follows
      const up = ctx.dir > 0; const f = Math.max(0.4, Math.min(1, k));
      if (up && Math.abs(v) < span * 0.02) return roundNum(p, p.min + span * R(0.2, 0.35) * f);
      return roundNum(p, v * (up ? 1 + R(0.35, 0.9) * f : 1 - R(0.3, 0.6) * f));
    }
    if (p.group === 'colors' && p.kind === 'number' && /hue/.test(words(p))) return roundNum(p, p.min + ((((v - p.min) / span + ctx.hue / 360 * Math.min(1, k)) % 1) + 1) % 1 * span);
    return roundNum(p, v + R(-1, 1) * span * 0.32 * k * ctx.reach);
  }
  // n variations around base ({ id: value }, default each param's value); locks: Set / array of group ids kept as they are
  function make(list, { n = 6, seed = 1, locks = [], base = null, closer = false, steer: st = null } = {}) {
    const locked = new Set(locks);
    const free = list.filter((p) => !locked.has(p.group));
    if (!free.length) return [];
    const at = (p) => (base && p.id in base ? base[p.id] : p.value);
    const groupsHere = GROUPS.map((g) => g.id).filter((g) => free.some((p) => p.group === g));
    let leans = st?.lean?.length ? st.lean.filter((g) => groupsHere.includes(g)) : [];
    if (!leans.length) leans = [...groupsHere, ...(groupsHere.length > 1 ? ['mix'] : [])];
    const reach = closer ? 0.45 : 1;
    const out = []; const seen = new Set([JSON.stringify(list.map((p) => at(p)))]);
    let tries = 0; let s = Number(seed) >>> 0;
    while (out.length < n && tries < n * 6) {
      tries += 1; s = (s * 1664525 + 1013904223) >>> 0;
      const rand = rng(s);
      const lean = leans[out.length % leans.length];
      const L = LEANS[lean];
      // motion alternates livelier / calmer (or follows the words); colors turn by a clear step around the wheel
      const dir = st?.dir || ((out.length / leans.length) % 2 < 1 ? 1 : -1);
      const hue = (rand() < 0.5 ? -1 : 1) * (lean === 'colors' ? 40 + rand() * 140 : 20 + rand() * 50) * reach;
      const ctx = { hue, dir: lean === 'motion' || st?.dir ? dir : 0, reach, warm: st?.warm || 0, forced: Boolean(st?.dir) };
      const values = {}; const changed = [];
      for (const p of list) {
        const v0 = at(p);
        if (locked.has(p.group)) { values[p.id] = v0; continue; }
        const k = (L.amt[p.group] ?? 0.2) * (closer ? 0.6 : 1);
        const v = nudge(p, v0, k, rand, { ...ctx, dir: p.group === 'motion' ? ctx.dir : 0 });
        values[p.id] = v;
        if (v !== v0) changed.push(p.id);
      }
      if (!changed.length) continue;
      const sig = JSON.stringify(list.map((p) => values[p.id]));
      if (seen.has(sig)) continue;
      seen.add(sig);
      const label = closer ? (lean === 'mix' ? 'Close to it' : `${lean === 'motion' && dir < 0 ? L.down : L.label}, a little`) : lean === 'motion' && dir < 0 ? L.down : L.label;
      out.push({ n: out.length + 1, seed: s, lean, label, values, changed, hue: free.some((p) => p.group === 'colors') && !ctx.warm ? Math.round(ctx.hue * Math.min(1, (L.amt.colors ?? 0.2) * (closer ? 0.6 : 1))) : 0 });
    }
    return out;
  }
  // what differs between two value sets ({ id: value }), per group
  function diff(list, a, b) {
    const out = {};
    for (const p of list) if (a[p.id] !== b[p.id]) (out[p.group] ||= []).push(p.id);
    return out;
  }
  // values by layer: { layer: { key: value } } (only those that differ from `from` when given)
  function byLayer(list, values, from = null) {
    const out = {};
    for (const p of list) {
      if (!(p.id in values)) continue;
      if (from && from[p.id] === values[p.id]) continue;
      (out[p.layer] ||= {})[p.key] = values[p.id];
    }
    return out;
  }

  return { GROUPS, LEANS, rng, groupOf, params, steer, make, diff, byLayer, hueShift, shiftPalette, hexToHsl, hslToHex };
})();
if (typeof module !== 'undefined') module.exports = VarCore;
