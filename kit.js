// Shared creative utilities used by Three.js Lab and the After Effects kit: a color converter and a cubic-bezier
// easing editor, plus the Kit window (Kit.open / /kit): palettes from pictures, harmonies, contrast, gradients,
// BPM ↔ ms, social frame sizes with safe zones and a timecode calculator.
const Kit = (() => {
  // ---------- color ----------
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toSRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  const hex2 = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  const f4 = (v) => Number(v.toFixed(4));

  // Accepts #rgb, #rrggbb(aa), 0xRRGGBB, rgb()/rgba(), hsl(), [r,g,b(,a)] 0–1 or 0–255. Returns sRGB 0–1.
  function parseColor(input) {
    const s = String(input).trim();
    let m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i) || s.match(/^0x([0-9a-f]{6})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
    if (m) return { r: m[1] / 255, g: m[2] / 255, b: m[3] / 255, a: m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4])) : 1 };
    m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i);
    if (m) {
      const h = (Number(m[1]) % 360) / 360; const sat = m[2] / 100; const l = m[3] / 100;
      const f = (n) => { const k = (n + h * 12) % 12; return l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
      return { r: f(0), g: f(8), b: f(4), a: 1 };
    }
    m = s.replace(/^new THREE\.Color\(|\)$/g, '').match(/^\[?\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\]?$/);
    if (m) {
      const nums = [m[1], m[2], m[3]].map(Number);
      const scale = nums.some((n) => n > 1) ? 255 : 1;
      return { r: nums[0] / scale, g: nums[1] / scale, b: nums[2] / scale, a: m[4] != null ? Number(m[4]) : 1 };
    }
    return null;
  }
  function toHsl({ r, g, b }) {
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, Math.round(l * 100)];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }
  const luminance = (c) => 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
  const contrast = (a, b) => { const x = luminance(a) + 0.05; const y = luminance(b) + 0.05; return x > y ? x / y : y / x; };
  const hexOf = (c) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

  function formats(c) {
    const lin = [toLinear(c.r), toLinear(c.g), toLinear(c.b)].map(f4);
    const [h, s, l] = toHsl(c);
    const hex = hexOf(c);
    return [
      ['HEX', hex],
      ['three.js hex', `0x${hex.slice(1)}`],
      ['THREE.Color', `new THREE.Color('${hex}')`],
      ['THREE linear RGB', `new THREE.Color().setRGB(${lin.join(', ')}) // already linear`],
      ['CSS rgb', `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)}${c.a < 1 ? ` / ${f4(c.a)}` : ''})`],
      ['CSS hsl', `hsl(${h} ${s}% ${l}%)`],
      ['After Effects', `[${f4(c.r)}, ${f4(c.g)}, ${f4(c.b)}, ${f4(c.a)}]`],
      ['GLSL (sRGB)', `vec3(${f4(c.r)}, ${f4(c.g)}, ${f4(c.b)})`],
      ['GLSL (linear)', `vec3(${lin.join(', ')})`],
      ['0–255', `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`],
    ];
  }

  function colorTool(container, { onPick } = {}) {
    const recent = store.get('kit.colors', ['#7c5cff', '#e07a2f', '#10a37f']);
    const picker = el('input', { type: 'color', class: 'kit-picker' });
    const text = el('input', { class: 'kit-color-text', placeholder: '#ff8800, rgb(…), hsl(…), 0xff8800, [1, 0.5, 0, 1]…' });
    const swatch = el('div', { class: 'kit-swatch' });
    const out = el('div', { class: 'kit-formats' });
    const ramp = el('div', { class: 'kit-ramp' });
    const recentRow = el('div', { class: 'kit-recent' });
    const contrastInfo = el('div', { class: 'hint' });
    let current = parseColor(recent[0]);
    const show = (c, { remember = false } = {}) => {
      current = c;
      const hex = hexOf(c);
      picker.value = hex;
      swatch.style.background = hex;
      out.replaceChildren(...formats(c).map(([label, value]) => el('div', { class: 'kit-format', on: { click: () => copyText(value, `${label} copied`) }, title: 'Click to copy' },
        el('span', { class: 'kit-format-label', text: label }), el('code', { text: value }))));
      // Tints and shades in perceptual-ish steps via HSL lightness.
      const [h, s] = toHsl(c);
      ramp.replaceChildren(...[10, 20, 30, 40, 50, 60, 70, 80, 90].map((L) => {
        const col = parseColor(`hsl(${h}, ${s}%, ${L}%)`);
        return el('button', { class: 'kit-chip', style: { background: hexOf(col) }, title: `${hexOf(col)} (L ${L}%)`, on: { click: () => show(col, { remember: true }) } });
      }));
      contrastInfo.textContent = `Contrast on white ${contrast(c, { r: 1, g: 1, b: 1 }).toFixed(2)}:1 · on black ${contrast(c, { r: 0, g: 0, b: 0 }).toFixed(2)}:1 (4.5:1 is readable text)`;
      if (remember) {
        const list = [hex, ...store.get('kit.colors', []).filter((x) => x !== hex)].slice(0, 16);
        store.set('kit.colors', list);
        renderRecent(list);
      }
      onPick?.(c);
    };
    const renderRecent = (list) => recentRow.replaceChildren(el('span', { class: 'hint', text: 'Recent' }), ...list.map((hx) => el('button', {
      class: 'kit-chip', style: { background: hx }, title: hx, on: { click: () => show(parseColor(hx)) },
    })));
    picker.addEventListener('input', () => show(parseColor(picker.value)));
    picker.addEventListener('change', () => show(parseColor(picker.value), { remember: true }));
    text.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const c = parseColor(text.value);
      if (c) show(c, { remember: true }); else toast("That doesn't look like a color", { type: 'error' });
    });
    container.append(el('div', { class: 'kit-color' },
      el('div', { class: 'kit-color-top' }, swatch, el('div', { class: 'kit-color-inputs' }, el('div', { class: 'row' }, picker, text), el('span', { class: 'hint', text: 'Paste any format and press Enter. Click a value below to copy it.' }))),
      out, el('div', { class: 'kit-sub', text: 'Tints & shades' }), ramp, contrastInfo, recentRow));
    renderRecent(recent);
    show(current);
    return { show: (c) => show(parseColor(c) || current, { remember: true }), get: () => current };
  }

  // ---------- easing ----------
  // Solves a CSS-style cubic-bezier for y at progress x.
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
    const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i += 1) {
        const err = sx(t) - x;
        if (Math.abs(err) < 1e-6) return sy(t);
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= err / d;
      }
      let lo = 0; let hi = 1; t = x;
      for (let i = 0; i < 30; i += 1) { const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return sy(t);
    };
  }
  const EASE_PRESETS = {
    'Linear': [0, 0, 1, 1], 'Ease (CSS)': [0.25, 0.1, 0.25, 1], 'Ease in': [0.42, 0, 1, 1], 'Ease out': [0, 0, 0.58, 1], 'Ease in-out': [0.42, 0, 0.58, 1],
    'AE Easy Ease': [0.333, 0, 0.667, 1], 'In-out cubic': [0.65, 0, 0.35, 1], 'In-out quint': [0.83, 0, 0.17, 1], 'Out expo': [0.16, 1, 0.3, 1],
    'Out back (overshoot)': [0.34, 1.56, 0.64, 1], 'In back (anticipate)': [0.36, 0, 0.66, -0.56], 'Snappy UI': [0.2, 0.9, 0.1, 1],
    // the classic Penner set (easings.net), as cubic-bezier approximations
    'In sine': [0.12, 0, 0.39, 0], 'Out sine': [0.61, 1, 0.88, 1], 'In-out sine': [0.37, 0, 0.63, 1],
    'In quad': [0.11, 0, 0.5, 0], 'Out quad': [0.5, 1, 0.89, 1], 'In-out quad': [0.45, 0, 0.55, 1],
    'In cubic': [0.32, 0, 0.67, 0], 'Out cubic': [0.33, 1, 0.68, 1],
    'In quart': [0.5, 0, 0.75, 0], 'Out quart': [0.25, 1, 0.5, 1], 'In-out quart': [0.76, 0, 0.24, 1],
    'In quint': [0.64, 0, 0.78, 0], 'Out quint': [0.22, 1, 0.36, 1],
    'In expo': [0.7, 0, 0.84, 0], 'In-out expo': [0.87, 0, 0.13, 1],
    'In circ': [0.55, 0, 1, 0.45], 'Out circ': [0, 0.55, 0.45, 1], 'In-out circ': [0.85, 0, 0.15, 1],
    'In-out back': [0.68, -0.6, 0.32, 1.6],
    // UI and motion-design favorites
    'Material standard': [0.2, 0, 0, 1], 'Material decelerate': [0, 0, 0, 1], 'Material accelerate': [0.3, 0, 1, 1], 'Material emphasized': [0.05, 0.7, 0.1, 1],
    'Whip (fast middle)': [0.9, 0, 0.1, 1], 'Beat hit (instant attack)': [0, 0.9, 0.3, 1], 'Lazy drift': [0.45, 0.05, 0.55, 0.95], 'Slam in (drop)': [0.7, 0, 0.9, 0.4],
  };

  const glf = (v) => (Number.isInteger(v) ? `${v}.0` : String(v));
  // GSAP's own eases, to name the closest built-in to a curve.
  const C1 = 1.70158; const C3 = C1 + 1;
  const powIn = (k) => (t) => t ** k;
  const GSAP = {};
  const addFamily = (name, fin) => {
    GSAP[`${name}.in`] = fin;
    GSAP[`${name}.out`] = (t) => 1 - fin(1 - t);
    GSAP[`${name}.inOut`] = (t) => (t < 0.5 ? fin(2 * t) / 2 : 1 - fin(2 - 2 * t) / 2);
  };
  [1, 2, 3, 4].forEach((k) => addFamily(`power${k}`, powIn(k + 1)));
  addFamily('sine', (t) => 1 - Math.cos((t * Math.PI) / 2));
  addFamily('expo', (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)));
  addFamily('circ', (t) => 1 - Math.sqrt(1 - t * t));
  addFamily('back', (t) => C3 * t ** 3 - C1 * t * t);
  GSAP.none = (t) => t;
  function gsapNearest(p) {
    const f = bezier(...p);
    let best = { name: 'none', err: Infinity };
    for (const [name, g] of Object.entries(GSAP)) {
      let err = 0;
      for (let i = 1; i < 40; i += 1) err += Math.abs(f(i / 40) - g(i / 40));
      err /= 39;
      if (err < best.err) best = { name, err };
    }
    return best;
  }

  function easingOutputs([x1, y1, x2, y2]) {
    const p = [x1, y1, x2, y2].map((v) => Number(v.toFixed(3)));
    const solver = `function ease(x) { // cubic-bezier(${p.join(', ')})
  const [x1, y1, x2, y2] = [${p.join(', ')}];
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 8; i++) { const e = ((ax * t + bx) * t + cx) * t - x; const d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(e) < 1e-6 || !d) break; t -= e / d; }
  return ((ay * t + by) * t + cy) * t;
}`;
    const ae = `// Applies this curve between every pair of keyframes on the property.
var x1 = ${p[0]}, y1 = ${p[1]}, x2 = ${p[2]}, y2 = ${p[3]};
function ease(x) {
  var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  var t = x;
  for (var i = 0; i < 8; i++) { var e = ((ax * t + bx) * t + cx) * t - x; var d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(e) < 1e-6 || d == 0) break; t -= e / d; }
  return ((ay * t + by) * t + cy) * t;
}
if (numKeys > 1 && time > key(1).time && time < key(numKeys).time) {
  var n = nearestKey(time).index;
  if (key(n).time > time) n--;
  var k1 = key(n), k2 = key(n + 1);
  var e = ease((time - k1.time) / (k2.time - k1.time));
  add(k1.value, mul(sub(k2.value, k1.value), e));
} else value;`;
    const near = gsapNearest(p);
    return [
      ['CSS', `cubic-bezier(${p.join(', ')})`],
      ['GSAP built-in (closest)', `ease: "${near.name}" // ${near.err < 0.01 ? 'near-exact match' : `about ${Math.round(near.err * 100)}% off; CustomEase below is exact`}`],
      ['GSAP CustomEase', `CustomEase.create("custom", "M0,0 C${p[0]},${p[1]} ${p[2]},${p[3]} 1,1")`],
      ['GLSL', `// cubic-bezier(${p.join(', ')}), x in 0..1
float ease(float x) {
  vec2 p1 = vec2(${p.slice(0, 2).map(glf).join(', ')}), p2 = vec2(${p.slice(2).map(glf).join(', ')});
  float t = x;
  for (int i = 0; i < 6; i++) {
    float cx = 3.0 * p1.x, bx = 3.0 * (p2.x - p1.x) - cx, ax = 1.0 - cx - bx;
    float e = ((ax * t + bx) * t + cx) * t - x;
    float d = (3.0 * ax * t + 2.0 * bx) * t + cx;
    if (abs(d) < 1e-5) break;
    t -= e / d;
  }
  float cy = 3.0 * p1.y, by = 3.0 * (p2.y - p1.y) - cy, ay = 1.0 - cy - by;
  return ((ay * t + by) * t + cy) * t;
}`],
      ['three.js keyframe track', `// sample the curve into a NumberKeyframeTrack (opacity 0 → 1 over 1 s)
const ease = (x) => { /* paste the JavaScript ease above */ };
const times = [], values = [];
for (let i = 0; i <= 30; i++) { const x = i / 30; times.push(x); values.push(ease(x)); }
const track = new THREE.NumberKeyframeTrack('.material.opacity', times, values);`],
      ['JavaScript / three.js', solver],
      ['After Effects expression', ae],
      ['AE keyframe influence', `Outgoing influence ${Math.round(p[0] * 100)}%, incoming influence ${Math.round((1 - p[2]) * 100)}%${p[1] === 0 && p[3] === 1 ? ', speed 0 on both' : ' (speed depends on the value change; the expression above is exact)'}`],
    ];
  }

  function easingTool(container, { pts: initial } = {}) {
    let pts = initial ? [...initial] : store.get('kit.ease', EASE_PRESETS['AE Easy Ease']);
    const W = 280; const PAD = 40;
    const canvas = el('canvas', { width: W + PAD * 2, height: W + PAD * 2, class: 'kit-ease-canvas' });
    const ctx = canvas.getContext('2d');
    const presets = el('select', {});
    const fillPresets = () => {
      const saved = store.get('kit.easeSaved', {});
      presets.replaceChildren(el('option', { text: 'Presets…', value: '' }),
        Object.keys(saved).length ? el('optgroup', { label: 'Yours' }, Object.keys(saved).map((k) => el('option', { value: `saved:${k}`, text: `★ ${k}` }))) : null,
        el('optgroup', { label: 'Built in' }, Object.keys(EASE_PRESETS).map((k) => el('option', { value: k, text: k }))),
        el('option', { value: '__save', text: '＋ Save this curve…' }));
    };
    fillPresets();
    const nums = pts.map((v, i) => el('input', { type: 'number', step: 0.01, value: v, class: 'kit-num', title: ['x1', 'y1', 'x2', 'y2'][i] }));
    const duration = el('input', { type: 'range', min: 200, max: 3000, value: 1000 });
    const dot = el('div', { class: 'kit-ease-dot' });
    const track = el('div', { class: 'kit-ease-track' }, dot);
    const out = el('div', { class: 'kit-formats' });
    const toPx = (x, y) => [PAD + x * W, PAD + (1 - y) * W];
    const draw = () => {
      const css = getComputedStyle(document.documentElement);
      const fg = css.getPropertyValue('--text').trim() || '#ddd';
      const accent = css.getPropertyValue('--accent').trim() || '#7c5cff';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = `${fg}22`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const g = PAD + (W / 4) * i;
        ctx.beginPath(); ctx.moveTo(PAD, g); ctx.lineTo(PAD + W, g); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(g, PAD); ctx.lineTo(g, PAD + W); ctx.stroke();
      }
      const [x1, y1, x2, y2] = pts;
      const [ax, ay] = toPx(0, 0); const [bx, by] = toPx(1, 1);
      const [p1x, p1y] = toPx(x1, y1); const [p2x, p2y] = toPx(x2, y2);
      ctx.strokeStyle = `${fg}66`;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(p1x, p1y); ctx.moveTo(bx, by); ctx.lineTo(p2x, p2y); ctx.stroke();
      ctx.strokeStyle = accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.bezierCurveTo(p1x, p1y, p2x, p2y, bx, by); ctx.stroke();
      for (const [x, y] of [[p1x, p1y], [p2x, p2y]]) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); }
    };
    const update = (from) => {
      pts = pts.map((v) => Number(v.toFixed(3)));
      if (from !== 'nums') nums.forEach((n, i) => { n.value = pts[i]; });
      store.set('kit.ease', pts);
      draw();
      out.replaceChildren(...easingOutputs(pts).map(([label, value]) => el('div', { class: 'kit-format block', title: 'Click to copy', on: { click: () => copyText(value, `${label} copied`) } },
        el('span', { class: 'kit-format-label', text: label }), el('pre', { text: value }))));
    };
    let dragging = null;
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) * (canvas.width / r.width); const y = (e.clientY - r.top) * (canvas.height / r.height);
      const d1 = Math.hypot(x - toPx(pts[0], pts[1])[0], y - toPx(pts[0], pts[1])[1]);
      const d2 = Math.hypot(x - toPx(pts[2], pts[3])[0], y - toPx(pts[2], pts[3])[1]);
      dragging = d1 < d2 ? 0 : 2;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (dragging == null) return;
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) * (canvas.width / r.width) - PAD) / W;
      const y = 1 - ((e.clientY - r.top) * (canvas.height / r.height) - PAD) / W;
      pts[dragging] = clamp01(x);
      pts[dragging + 1] = Math.min(2, Math.max(-1, y));
      update();
    });
    canvas.addEventListener('pointerup', () => { dragging = null; });
    nums.forEach((n, i) => n.addEventListener('input', () => { pts[i] = i % 2 === 0 ? clamp01(Number(n.value)) : Number(n.value); update('nums'); }));
    presets.addEventListener('change', async () => {
      const v = presets.value;
      presets.value = '';
      if (!v) return;
      if (v === '__save') {
        const name = await Modal.prompt('Save this curve', { value: 'My curve', label: 'Name (shows under "Yours" in the presets)' });
        if (name?.trim()) { store.set('kit.easeSaved', { ...store.get('kit.easeSaved', {}), [name.trim()]: [...pts] }); fillPresets(); toast('Curve saved', { timeout: 1200 }); }
        return;
      }
      pts = [...(v.startsWith('saved:') ? store.get('kit.easeSaved', {})[v.slice(6)] : EASE_PRESETS[v])];
      update();
    });
    // Preview: a dot travels the track using the curve, then pauses and repeats.
    let start = performance.now();
    const loop = (now) => {
      if (!canvas.isConnected) return;
      const dur = Number(duration.value);
      const t = ((now - start) % (dur + 500)) / dur;
      const e = bezier(...pts)(Math.min(1, t));
      dot.style.left = `calc(${e * 100}% - ${e * 16}px)`;
      requestAnimationFrame(loop);
    };
    container.append(el('div', { class: 'kit-ease' },
      el('div', { class: 'kit-ease-left' }, canvas,
        el('div', { class: 'row' }, presets, ...nums),
        el('label', { class: 'hint' }, 'Preview duration', duration), track),
      el('div', { class: 'kit-ease-right' }, out)));
    update();
    start = performance.now();
    requestAnimationFrame(loop);
    duration.addEventListener('input', () => { start = performance.now(); });
  }

  // ---------- palettes, harmonies, contrast, gradients ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hslHex = (h, s, l) => hexOf(parseColor(`hsl(${((Math.round(h) % 360) + 360) % 360}, ${clamp(Math.round(s), 0, 100)}%, ${clamp(Math.round(l), 0, 100)}%)`));
  const HARMONIES = [
    ['complementary', 'Complementary', [0, 180]], ['analogous', 'Analogous', [-30, 0, 30]], ['triadic', 'Triadic', [0, 120, 240]],
    ['split', 'Split complementary', [0, 150, 210]], ['tetradic', 'Tetradic (square)', [0, 90, 180, 270]], ['rectangle', 'Rectangle', [0, 60, 180, 240]],
  ];
  // Color schemes around a base color (hue rotations keep its saturation and lightness), plus monochrome and shades.
  function harmonies(input) {
    const c = typeof input === 'string' ? parseColor(input) : input;
    if (!c) return [];
    const [h, s, l] = toHsl(c);
    return [
      ...HARMONIES.map(([id, label, rot]) => ({ id, label, colors: rot.map((r) => hslHex(h + r, s, l)) })),
      { id: 'mono', label: 'Monochrome', colors: [-30, -15, 0, 15, 30].map((d) => hslHex(h, s, l + d)) },
      { id: 'muted', label: 'Muted (same hue)', colors: [0.25, 0.45, 0.65, 0.85].map((k) => hslHex(h, s * k, l)).concat(hexOf(c)) },
      { id: 'neon', label: 'Neon pop (dark bg)', colors: ['#0b0b12', hslHex(h, 95, 55), hslHex(h + 150, 95, 60), hslHex(h + 210, 90, 65), '#f5f5ff'] },
    ];
  }
  // WCAG contrast of text color fg on background bg, with the nearest readable version of fg.
  function contrastReport(fg, bg) {
    const a = typeof fg === 'string' ? parseColor(fg) : fg;
    const b = typeof bg === 'string' ? parseColor(bg) : bg;
    if (!a || !b) return null;
    const ratio = contrast(a, b);
    let fix = null;
    if (ratio < 4.5) {
      const [h, s, l] = toHsl(a);
      for (let d = 1; d <= 100 && !fix; d += 1) {
        for (const L of [l - d, l + d]) {
          if (L < 0 || L > 100) continue;
          const c = parseColor(hslHex(h, s, L));
          if (contrast(c, b) >= 4.5) { fix = hexOf(c); break; }
        }
      }
    }
    return { ratio, text: `${ratio.toFixed(2)}:1`, aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, aaaLarge: ratio >= 4.5, fix };
  }
  // OKLab (perceptual) mixing: gradients without the muddy middle of plain RGB mixing.
  function toOklab({ r, g, b }) {
    const R = toLinear(r); const G = toLinear(g); const B = toLinear(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromOklab([L, A, B]) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return { r: clamp01(toSRGB(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)), g: clamp01(toSRGB(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)), b: clamp01(toSRGB(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)), a: 1 };
  }
  const mixOk = (c1, c2, t) => { const a = toOklab(c1); const b = toOklab(c2); return fromOklab(a.map((v, i) => v + (b[i] - v) * t)); };
  // Evenly sampled colors along stops (hex list), mixed in OKLab.
  function ramp(stops, n = 7) {
    const cs = stops.map((x) => parseColor(x)).filter(Boolean);
    if (cs.length < 2) return cs.map(hexOf);
    return Array.from({ length: n }, (_, i) => {
      const t = (i / (n - 1)) * (cs.length - 1);
      const k = Math.min(cs.length - 2, Math.floor(t));
      return hexOf(mixOk(cs[k], cs[k + 1], t - k));
    });
  }
  function gradientCode(stops, { type = 'linear', angle = 90, smooth = true } = {}) {
    const cs = stops.map((x) => parseColor(x)).filter(Boolean).map(hexOf);
    if (!cs.length) return [];
    const list = cs.join(', ');
    const css = type === 'radial' ? `radial-gradient(${smooth ? 'in oklab ' : ''}circle, ${list})` : type === 'conic' ? `conic-gradient(${smooth ? 'in oklab ' : ''}from ${angle}deg, ${list}, ${cs[0]})` : `linear-gradient(${smooth ? 'in oklab ' : ''}${angle}deg, ${list})`;
    const vec = (h) => { const c = parseColor(h); return `vec3(${glf(f4(c.r))}, ${glf(f4(c.g))}, ${glf(f4(c.b))})`; };
    const glsl = `// ${cs.length} stops, t in 0..1
vec3 gradient(float t) {
  t = clamp(t, 0.0, 1.0) * ${glf(cs.length - 1)};
${cs.slice(0, -1).map((c, i) => `  if (t < ${glf(i + 1)}) return mix(${vec(c)}, ${vec(cs[i + 1])}, t - ${glf(i)});`).join('\n')}
  return ${vec(cs[cs.length - 1])};
}`;
    const three = `// a ${cs.length}-stop gradient texture for three.js (map, background or gradientMap)
const c = document.createElement('canvas'); c.width = 256; c.height = 1;
const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 256, 0);
${cs.map((col, i) => `grad.addColorStop(${f4(i / Math.max(1, cs.length - 1))}, '${col}');`).join('\n')}
g.fillStyle = grad; g.fillRect(0, 0, 256, 1);
const gradientTex = new THREE.CanvasTexture(c);
gradientTex.colorSpace = THREE.SRGBColorSpace;`;
    return [
      ['CSS', css], ['GLSL function', glsl], ['three.js texture', three],
      ['Smooth ramp (OKLab, 7 colors)', ramp(cs, 7).join(' ')],
      ['JS array', `[${cs.map((c) => `'${c}'`).join(', ')}]`],
    ];
  }

  // Dominant colors of a picture (data URL, file path or <img>/<canvas>), by k-means on a small copy.
  async function paletteFromImage(src, n = 6) {
    let url = src;
    if (typeof src === 'string' && !/^(data|blob|https?):/.test(src)) {
      const ext = (src.split('.').pop() || 'png').toLowerCase();
      url = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${await window.hub.fs.read(src, { encoding: 'base64' })}`;
    }
    const img = typeof url === 'string' ? await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that picture')); i.src = url; }) : url;
    const S = 72;
    const c = document.createElement('canvas');
    const k = Math.min(1, S / Math.max(img.width || img.naturalWidth || S, img.height || img.naturalHeight || S));
    c.width = Math.max(1, Math.round((img.width || img.naturalWidth) * k)); c.height = Math.max(1, Math.round((img.height || img.naturalHeight) * k));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) px.push([d[i], d[i + 1], d[i + 2]]);
    if (!px.length) return [];
    // k-means++ seeding, then 12 rounds
    const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const cents = [px[Math.floor(px.length / 2)]];
    while (cents.length < Math.min(n, px.length)) {
      let far = px[0]; let best = -1;
      for (let i = 0; i < px.length; i += 3) { const m = Math.min(...cents.map((ct) => dist(px[i], ct))); if (m > best) { best = m; far = px[i]; } }
      cents.push(far);
    }
    let counts = [];
    for (let round = 0; round < 12; round += 1) {
      const sums = cents.map(() => [0, 0, 0]); counts = cents.map(() => 0);
      for (const p of px) {
        let bi = 0; let bd = Infinity;
        for (let j = 0; j < cents.length; j += 1) { const dd = dist(p, cents[j]); if (dd < bd) { bd = dd; bi = j; } }
        sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi] += 1;
      }
      for (let j = 0; j < cents.length; j += 1) if (counts[j]) cents[j] = sums[j].map((v) => v / counts[j]);
    }
    return cents.map((ct, j) => ({ hex: hexOf({ r: ct[0] / 255, g: ct[1] / 255, b: ct[2] / 255 }), n: counts[j] }))
      .filter((x) => x.n).sort((a, b) => b.n - a.n).map((x) => x.hex);
  }
  // Saves a palette where the Three.js Lab's 🎨 menu finds it ("Saved palettes").
  function savePaletteToLab(name, colors) {
    const list = store.get('three.palettes', []).filter((p) => p.name !== name);
    store.set('three.palettes', [{ name, colors }, ...list].slice(0, 60));
    return list.length + 1;
  }
  const hexList = (text) => [...String(text || '').matchAll(/#?\b([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((m) => hexOf(parseColor(m[1])));

  // ---------- tempo, frames, timecode ----------
  const NOTE_VALUES = [['1 bar (4/4)', 4], ['1/2', 2], ['1/4 (beat)', 1], ['1/8', 0.5], ['1/16', 0.25], ['1/32', 0.125]];
  // Note lengths at a tempo: straight, dotted and triplet, in ms, frames and Hz.
  function bpmTable(bpm, fps = [30, 60]) {
    const beat = 60000 / bpm;
    return NOTE_VALUES.map(([label, beats]) => {
      const ms = beat * beats;
      return { label, ms, dotted: ms * 1.5, triplet: (ms * 2) / 3, hz: 1000 / ms, frames: fps.map((f) => (ms / 1000) * f) };
    });
  }
  const bpmFromMs = (ms, beats = 1) => (60000 * beats) / ms;
  function bpmText(bpm) {
    const r = (v) => (v >= 100 ? Math.round(v) : Number(v.toFixed(1)));
    return `**${bpm} BPM** · beat ${r(60000 / bpm)} ms · bar ${(240 / bpm).toFixed(3)} s\n\n| Note | ms | dotted | triplet | frames @30 | @60 | Hz |\n|---|---|---|---|---|---|---|\n${
      bpmTable(bpm).map((x) => `| ${x.label} | ${r(x.ms)} | ${r(x.dotted)} | ${r(x.triplet)} | ${x.frames[0].toFixed(1)} | ${x.frames[1].toFixed(1)} | ${x.hz.toFixed(2)} |`).join('\n')}`;
  }

  // Social and video frame formats, with UI-free safe zones (px at that size; approximate, the apps' overlays vary).
  const FORMATS = [
    { id: 'shorts', label: 'YouTube Shorts', w: 1080, h: 1920, safe: { top: 240, bottom: 480, left: 60, right: 190 } },
    { id: 'tiktok', label: 'TikTok', w: 1080, h: 1920, safe: { top: 160, bottom: 480, left: 60, right: 160 } },
    { id: 'reels', label: 'Instagram Reels', w: 1080, h: 1920, safe: { top: 220, bottom: 420, left: 60, right: 120 } },
    { id: 'story', label: 'Instagram / FB Story', w: 1080, h: 1920, safe: { top: 250, bottom: 340, left: 60, right: 60 } },
    { id: 'feed45', label: 'Instagram feed 4:5', w: 1080, h: 1350, safe: { top: 0, bottom: 0, left: 34, right: 34 }, note: 'The profile grid crops 4:5 posts to 3:4 (the side bands).' },
    { id: 'square', label: 'Square 1:1', w: 1080, h: 1080, safe: { top: 54, bottom: 54, left: 54, right: 54 } },
    { id: 'youtube', label: 'YouTube 1080p', w: 1920, h: 1080, safe: { top: 54, bottom: 54, left: 96, right: 96 }, note: 'Title-safe 90% shown; keep logos out of the bottom-right (end screen / controls).' },
    { id: 'uhd', label: 'YouTube 4K', w: 3840, h: 2160, safe: { top: 108, bottom: 108, left: 192, right: 192 } },
    { id: 'x', label: 'X / Bluesky 16:9', w: 1600, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
    { id: 'thumb', label: 'YouTube thumbnail', w: 1280, h: 720, safe: { top: 0, bottom: 110, left: 0, right: 230 }, note: 'The duration badge covers the bottom-right corner.' },
    { id: 'cinema', label: 'Cinemascope 2.39:1', w: 1920, h: 804, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
    { id: 'itch', label: 'itch.io cover', w: 630, h: 500, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  ];
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function frameInfo(w, h) {
    const g = gcd(Math.round(w), Math.round(h)) || 1;
    const named = FORMATS.filter((f) => f.w * h === f.h * w).map((f) => f.label);
    return { w, h, ratio: `${w / g}:${h / g}`, decimal: Number((w / h).toFixed(4)), mp: Number(((w * h) / 1e6).toFixed(2)), even: w % 2 === 0 && h % 2 === 0, same: named };
  }
  // "1080x1920", "16:9 1280" (width), "9:16 h1920", "4:5" → { w, h }
  function parseFrame(text) {
    const s = String(text || '').trim().toLowerCase();
    let m = s.match(/^(\d+)\s*[x×*]\s*(\d+)$/);
    if (m) return { w: Number(m[1]), h: Number(m[2]) };
    m = s.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)(?:\s+(h)?(\d+))?$/);
    if (m) {
      const rw = Number(m[1]); const rh = Number(m[2]);
      if (m[3]) { const h = Number(m[4]); return { w: Math.round((h * rw) / rh / 2) * 2, h }; }
      const w = Number(m[4] || (rw >= rh ? 1920 : 1080));
      return { w, h: Math.round((w * rh) / rw / 2) * 2 };
    }
    const f = FORMATS.find((x) => x.id === s || x.label.toLowerCase().includes(s));
    return f ? { w: f.w, h: f.h, format: f } : null;
  }
  function frameText(w, h) {
    const i = frameInfo(w, h);
    const fmts = FORMATS.filter((f) => f.w === w && f.h === h);
    return `**${w}×${h}** · ${i.ratio} (${i.decimal}) · ${i.mp} MP${i.even ? '' : ' · ⚠ odd size: most video encoders want even numbers'}${i.same.length ? `\nSame shape as: ${i.same.join(', ')}` : ''}${
      fmts.map((f) => `\n${f.label} safe area: ${w - f.safe.left - f.safe.right}×${h - f.safe.top - f.safe.bottom} (top ${f.safe.top}, bottom ${f.safe.bottom}, left ${f.safe.left}, right ${f.safe.right})${f.note ? ` · ${f.note}` : ''}`).join('')}\n\`renderer.setSize(${w}, ${h}); camera.aspect = ${w} / ${h}; camera.updateProjectionMatrix();\``;
  }

  const FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
  const nominal = (fps) => Math.round(fps);
  const isDrop = (fps, drop) => drop && (Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01);
  // Seconds → "hh:mm:ss:ff" (";ff" for drop-frame 29.97 / 59.94).
  function toTimecode(seconds, fps = 30, { drop = false } = {}) {
    const neg = seconds < 0;
    let frames = Math.round(Math.abs(seconds) * fps);
    const n = nominal(fps);
    if (isDrop(fps, drop)) {
      const d = n === 60 ? 4 : 2; // frames dropped per minute
      const per10 = Math.round(fps * 600);
      const perMin = n * 60 - d;
      const tens = Math.floor(frames / per10); const rem = frames % per10;
      frames += 9 * d * tens + (rem > d ? d * Math.floor((rem - d) / perMin) : 0);
    }
    const ff = frames % n; const s = Math.floor(frames / n);
    const p = (v) => String(v).padStart(2, '0');
    return `${neg ? '-' : ''}${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}${isDrop(fps, drop) ? ';' : ':'}${p(ff)}`;
  }
  // One time value → seconds: "01:02:03:04" (timecode), "1:02.5" (m:s), "90s", "1500ms", "48f" (frames), "8 bars" / "8b"
  // (needs bpm), "3 beats", or a plain number of seconds.
  function parseTime(text, { fps = 30, bpm = 120, beatsPerBar = 4 } = {}) {
    const s = String(text).trim().toLowerCase();
    let m = s.match(/^(-)?(\d+):(\d{1,2}):(\d{1,2})[:;](\d{1,3})$/);
    if (m) return (m[1] ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]) + Number(m[5]) / nominal(fps));
    m = s.match(/^(-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
    if (m) return (m[1] ? -1 : 1) * (Number(m[2] || 0) * 3600 + Number(m[3]) * 60 + Number(m[4]));
    m = s.match(/^(-?\d+(?:\.\d+)?)\s*(ms|s|sec|f|fr|frames?|bars?|b|beats?|min|m|h)?$/);
    if (!m) return null;
    const v = Number(m[1]);
    const unit = m[2] || 's';
    if (unit === 'ms') return v / 1000;
    if (/^(f|fr|frames?)$/.test(unit)) return v / fps;
    if (/^(bars?|b)$/.test(unit)) return (v * beatsPerBar * 60) / bpm;
    if (/^beats?$/.test(unit)) return (v * 60) / bpm;
    if (unit === 'min' || unit === 'm') return v * 60;
    if (unit === 'h') return v * 3600;
    return v;
  }
  // "00:01:00:00 + 12f - 2s" → seconds (left to right).
  function calcTime(expr, opts = {}) {
    const parts = String(expr).replace(/\s+([+-])\s+/g, ' $1 ').split(/ (?=[+-] )/);
    let total = 0;
    for (const part of parts) {
      const m = part.trim().match(/^([+-])\s+(.+)$/);
      const sign = m ? (m[1] === '-' ? -1 : 1) : 1;
      const v = parseTime(m ? m[2] : part, opts);
      if (v == null) return null;
      total += sign * v;
    }
    return total;
  }
  function timeText(expr, { fps = 30, bpm, drop = false } = {}) {
    const t = calcTime(expr, { fps, bpm: bpm || 120 });
    if (t == null) return null;
    return `**${toTimecode(t, fps, { drop })}** @ ${fps} fps · ${Number(t.toFixed(3))} s · ${Math.round(t * fps)} frames${bpm ? ` · ${Number(((t * bpm) / 60).toFixed(2))} beats (${Number(((t * bpm) / 240).toFixed(2))} bars @ ${bpm} BPM)` : ''}`;
  }

  // ---------- the Kit window: every tool in one tabbed dialog (palette, /kit, /color, /ease…) ----------
  const shared = { palette: store.get('kit.palette', []) };
  const setShared = (cols) => { shared.palette = cols; store.set('kit.palette', cols); };
  const copyRow = (label, value, block = false) => el('div', { class: `kit-format${block ? ' block' : ''}`, title: 'Click to copy', on: { click: () => copyText(value, `${label} copied`) } },
    el('span', { class: 'kit-format-label', text: label }), block ? el('pre', { text: value }) : el('code', { text: value }));
  const chips = (cols, onClick) => el('div', { class: 'kit-ramp' }, cols.map((c) => el('button', { type: 'button', class: 'kit-chip big', style: { background: c }, title: `${c}: click to copy`, on: { click: () => (onClick ? onClick(c) : copyText(c, c)) } })));

  function paletteTool(pane) {
    const out = el('div', { class: 'kit-col' });
    const count = el('select', {}, [4, 5, 6, 7, 8].map((n) => el('option', { value: n, text: `${n} colors`, selected: n === 6 })));
    const paste = el('input', { placeholder: 'Or paste hex codes / a Coolors link, then Enter' });
    const show = (cols, from = '') => {
      if (!cols.length) { out.replaceChildren(el('p', { class: 'hint', text: 'No colors found.' })); return; }
      setShared(cols);
      out.replaceChildren(el('p', { class: 'hint', text: `${from ? `${from} · ` : ''}click a color to copy it` }), chips(cols),
        el('div', { class: 'kit-formats' }, copyRow('Hex list', cols.join(' ')), copyRow('JS array', `[${cols.map((c) => `'${c}'`).join(', ')}]`), copyRow('CSS variables', cols.map((c, i) => `--c${i + 1}: ${c};`).join(' '))),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'primary small', text: '🎨 Save to Lab palettes…', on: { click: async () => { const n = await Modal.prompt('Palette name', { value: from || 'Kit palette' }); if (n?.trim()) { savePaletteToLab(n.trim(), cols); toast(`Saved "${n.trim()}": find it in the Lab's 🎨 menu`, { timeout: 2500 }); } } } }),
          el('button', { type: 'button', class: 'ghost small', text: 'Sorted light → dark', on: { click: () => show([...cols].sort((a, b) => luminance(parseColor(b)) - luminance(parseColor(a))), from) } }),
          el('button', { type: 'button', class: 'ghost small', text: 'Smooth ramp', on: { click: () => show(ramp(cols, Number(count.value)), 'OKLab ramp') } })));
    };
    const run = async (label, get) => { try { out.replaceChildren(el('p', { class: 'hint', text: 'Reading colors…' })); show(await get(), label); } catch (err) { out.replaceChildren(el('p', { class: 'hint', text: err.message })); } };
    paste.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); show(hexList(paste.value), 'Pasted'); } });
    pane.append(el('div', { class: 'kit-col' },
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'ghost small', text: '🖼 From a picture…', on: { click: async () => { const [p] = await window.hub.openDialog({ filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] }); if (p) run(p.split(/[\\/]/).pop(), () => paletteFromImage(p, Number(count.value))); } } }),
        el('button', { type: 'button', class: 'ghost small', text: '📋 From the clipboard', on: { click: () => run('Clipboard', async () => {
          const items = await navigator.clipboard.read();
          for (const it of items) { const type = it.types.find((t) => t.startsWith('image/')); if (type) return paletteFromImage(URL.createObjectURL(await it.getType(type)), Number(count.value)); }
          const t = hexList(await navigator.clipboard.readText()); if (t.length) return t;
          throw new Error('No picture or hex codes on the clipboard.');
        }) } }),
        typeof ThreeLab !== 'undefined' ? el('button', { type: 'button', class: 'ghost small', text: '🎛 From the Lab frame', on: { click: () => run('Lab frame', async () => { const shot = await ThreeLab.shot(); if (!shot) throw new Error('Open a sketch in the Three.js Lab first.'); return paletteFromImage(shot, Number(count.value)); }) } }) : null,
        count),
      paste, out));
    if (shared.palette.length) show(shared.palette, 'Last palette');
  }

  function harmonyTool(pane, start) {
    const picker = el('input', { type: 'color', class: 'kit-picker' });
    const text = el('input', { placeholder: 'Base color (any format), Enter' });
    const out = el('div', { class: 'kit-col' });
    const show = (c) => {
      if (!c) { toast("That doesn't look like a color", { type: 'error' }); return; }
      picker.value = hexOf(c); text.value = hexOf(c);
      out.replaceChildren(...harmonies(c).map((h) => el('div', { class: 'kit-harmony' },
        el('span', { class: 'kit-format-label', text: h.label }), chips(h.colors),
        el('button', { type: 'button', class: 'ghost small', text: 'Copy', on: { click: () => copyText(h.colors.join(' '), `${h.label} copied`) } }),
        el('button', { type: 'button', class: 'ghost small', text: '🎨 To Lab', title: 'Save as a Lab palette', on: { click: () => { savePaletteToLab(`${h.label} ${hexOf(c)}`, h.colors); setShared(h.colors); toast('Saved to the Lab palettes', { timeout: 1500 }); } } }))));
    };
    picker.addEventListener('input', () => show(parseColor(picker.value)));
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); show(parseColor(text.value)); } });
    pane.append(el('div', { class: 'kit-col' }, el('div', { class: 'row' }, picker, text), out));
    show(parseColor(start || shared.palette[0] || store.get('kit.colors', ['#7c5cff'])[0]));
  }

  function contrastTool(pane, [fg0, bg0] = []) {
    const fg = el('input', { value: fg0 || '#ffffff' }); const bg = el('input', { value: bg0 || shared.palette[0] || '#7c5cff' });
    const fgP = el('input', { type: 'color', class: 'kit-picker' }); const bgP = el('input', { type: 'color', class: 'kit-picker' });
    const sample = el('div', { class: 'kit-contrast-sample' }, el('b', { text: 'Big title text' }), el('span', { text: 'Body text: the quick brown fox jumps over the lazy dog.' }));
    const out = el('div', { class: 'kit-col' });
    const badge = (ok, label) => el('span', { class: `kit-badge ${ok ? 'ok' : 'bad'}`, text: `${ok ? '✓' : '✕'} ${label}` });
    const show = () => {
      const r = contrastReport(fg.value, bg.value);
      if (!r) { out.replaceChildren(el('p', { class: 'hint', text: 'Enter two colors.' })); return; }
      const a = hexOf(parseColor(fg.value)); const b = hexOf(parseColor(bg.value));
      fgP.value = a; bgP.value = b;
      Object.assign(sample.style, { color: a, background: b });
      out.replaceChildren(el('div', { class: 'kit-ratio', text: r.text }),
        el('div', { class: 'row' }, badge(r.aa, 'AA text (4.5)'), badge(r.aaLarge, 'AA large (3)'), badge(r.aaa, 'AAA text (7)'), badge(r.aaaLarge, 'AAA large (4.5)')),
        r.fix ? el('div', { class: 'row' }, el('span', { class: 'hint', text: `Nearest readable text color: ${r.fix}` }), chips([r.fix]), el('button', { type: 'button', class: 'ghost small', text: 'Use it', on: { click: () => { fg.value = r.fix; show(); } } })) : null);
    };
    for (const i of [fg, bg]) i.addEventListener('input', show);
    fgP.addEventListener('input', () => { fg.value = fgP.value; show(); });
    bgP.addEventListener('input', () => { bg.value = bgP.value; show(); });
    pane.append(el('div', { class: 'kit-col' },
      el('div', { class: 'row' }, el('span', { class: 'hint', text: 'Text' }), fgP, fg, el('span', { class: 'hint', text: 'on' }), bgP, bg,
        el('button', { type: 'button', class: 'ghost small', text: '⇄', title: 'Swap', on: { click: () => { [fg.value, bg.value] = [bg.value, fg.value]; show(); } } })),
      sample, out));
    show();
  }

  function gradientTool(pane, start) {
    const stops = el('input', { value: (start || (shared.palette.length ? shared.palette.slice(0, 4) : ['#120c2c', '#7c5cff', '#ff6a3d'])).join(' '), placeholder: 'Colors, e.g. #120c2c #7c5cff #ff6a3d' });
    const type = el('select', {}, ['linear', 'radial', 'conic'].map((t) => el('option', { value: t, text: t })));
    const angle = el('input', { type: 'range', min: 0, max: 360, value: 90 });
    const smooth = el('input', { type: 'checkbox', checked: true });
    const preview = el('div', { class: 'kit-gradient' });
    const out = el('div', { class: 'kit-formats kit-formats-1' });
    const show = () => {
      const cols = hexList(stops.value);
      const code = gradientCode(cols, { type: type.value, angle: Number(angle.value), smooth: smooth.checked });
      preview.style.background = code[0]?.[1] || 'none';
      out.replaceChildren(...code.map(([l, v]) => copyRow(l, v, /\n/.test(v))));
    };
    for (const c of [stops, type, angle, smooth]) c.addEventListener('input', show);
    pane.append(el('div', { class: 'kit-col' }, stops,
      el('div', { class: 'row' }, type, el('label', { class: 'hint' }, 'Angle ', angle), el('label', { class: 'check small' }, smooth, 'Smooth (OKLab)'),
        el('button', { type: 'button', class: 'ghost small', text: 'Use last palette', on: { click: () => { stops.value = shared.palette.join(' '); show(); } } })),
      preview, out));
    show();
  }

  function bpmTool(pane, start) {
    const bpm = el('input', { type: 'number', min: 20, max: 400, step: 0.1, value: start || store.get('kit.bpm', 120), class: 'kit-num' });
    const tapBtn = el('button', { type: 'button', class: 'primary small', text: 'Tap' });
    const table = el('div', { class: 'kit-table' });
    const ms = el('input', { type: 'number', placeholder: 'ms', class: 'kit-num' });
    const msBeats = el('select', {}, NOTE_VALUES.map(([l, b]) => el('option', { value: b, text: `is a ${l}`, selected: b === 1 })));
    const msOut = el('span', { class: 'hint' });
    const show = () => {
      const b = Number(bpm.value);
      if (!(b > 0)) return;
      store.set('kit.bpm', b);
      table.innerHTML = renderMarkdown(bpmText(b));
    };
    let taps = [];
    tapBtn.addEventListener('click', () => {
      const now = performance.now();
      taps = [...taps.filter((t) => now - t < 3000), now].slice(-12);
      if (taps.length > 1) { bpm.value = (60000 / ((taps.at(-1) - taps[0]) / (taps.length - 1))).toFixed(1); show(); }
      tapBtn.textContent = `Tap (${taps.length})`;
    });
    const msShow = () => { const v = Number(ms.value); msOut.textContent = v > 0 ? `= ${bpmFromMs(v, Number(msBeats.value)).toFixed(2)} BPM` : ''; };
    bpm.addEventListener('input', show);
    ms.addEventListener('input', msShow); msBeats.addEventListener('input', msShow);
    pane.append(el('div', { class: 'kit-col' },
      el('div', { class: 'row' }, el('b', { text: 'BPM' }), bpm, tapBtn, el('span', { class: 'hint', text: 'Tap along with the beat (or press T while this tab is open)' })),
      table, el('div', { class: 'row' }, el('span', { class: 'hint', text: 'ms → BPM:' }), ms, msBeats, msOut)));
    pane.tabIndex = -1;
    pane.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 't' && e.target.tagName !== 'INPUT') tapBtn.click(); });
    show();
  }

  function frameTool(pane, start) {
    const sel = el('select', {}, FORMATS.map((f) => el('option', { value: f.id, text: `${f.label} · ${f.w}×${f.h}` })), el('option', { value: '', text: 'Custom…' }));
    const w = el('input', { type: 'number', class: 'kit-num', value: 1080 }); const h = el('input', { type: 'number', class: 'kit-num', value: 1920 });
    const ratio = el('input', { placeholder: 'Ratio + size: 16:9 1280, 9:16 h1920, 2.39:1', class: 'kit-ratio-in' });
    const canvas = el('canvas', { class: 'kit-frame-canvas', width: 260, height: 260 });
    const info = el('div', { class: 'body kit-frame-info' });
    const draw = () => {
      const W = Number(w.value); const Hh = Number(h.value);
      if (!(W > 0 && Hh > 0)) return;
      const f = FORMATS.find((x) => x.id === sel.value && x.w === W && x.h === Hh);
      const k = Math.min(240 / W, 240 / Hh);
      const cw = W * k; const ch = Hh * k;
      const g = canvas.getContext('2d');
      const css = getComputedStyle(document.documentElement);
      g.clearRect(0, 0, 260, 260);
      const x0 = (260 - cw) / 2; const y0 = (260 - ch) / 2;
      g.fillStyle = css.getPropertyValue('--hover').trim() || '#333'; g.fillRect(x0, y0, cw, ch);
      if (f) {
        g.fillStyle = 'rgba(255,80,80,.28)';
        const s = f.safe;
        g.fillRect(x0, y0, cw, s.top * k); g.fillRect(x0, y0 + ch - s.bottom * k, cw, s.bottom * k);
        g.fillRect(x0, y0, s.left * k, ch); g.fillRect(x0 + cw - s.right * k, y0, s.right * k, ch);
        g.strokeStyle = css.getPropertyValue('--accent').trim() || '#7c5cff'; g.setLineDash([4, 3]);
        g.strokeRect(x0 + s.left * k, y0 + s.top * k, cw - (s.left + s.right) * k, ch - (s.top + s.bottom) * k);
        g.setLineDash([]);
      }
      // thirds
      g.strokeStyle = 'rgba(255,255,255,.18)';
      for (const t of [1 / 3, 2 / 3]) { g.beginPath(); g.moveTo(x0 + cw * t, y0); g.lineTo(x0 + cw * t, y0 + ch); g.moveTo(x0, y0 + ch * t); g.lineTo(x0 + cw, y0 + ch * t); g.stroke(); }
      info.innerHTML = renderMarkdown(frameText(W, Hh));
    };
    sel.addEventListener('change', () => { const f = FORMATS.find((x) => x.id === sel.value); if (f) { w.value = f.w; h.value = f.h; } draw(); });
    for (const i of [w, h]) i.addEventListener('input', () => { sel.value = FORMATS.find((x) => x.w === Number(w.value) && x.h === Number(h.value) && x.id === sel.value) ? sel.value : ''; draw(); });
    ratio.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const r = parseFrame(ratio.value); if (!r) { toast('Try 16:9 1280 or 1080x1920', { type: 'error' }); return; } w.value = r.w; h.value = r.h; sel.value = r.format?.id || ''; draw(); });
    pane.append(el('div', { class: 'kit-frame' }, el('div', { class: 'kit-col' }, sel, el('div', { class: 'row' }, w, el('span', { text: '×' }), h,
      el('button', { type: 'button', class: 'ghost small', text: '⤾', title: 'Swap width and height', on: { click: () => { [w.value, h.value] = [h.value, w.value]; sel.value = ''; draw(); } } })), ratio, canvas,
    el('span', { class: 'hint', text: 'Red bands: where the app\'s buttons and captions sit (approximate). Lines: rule of thirds.' })), info));
    const r = start && parseFrame(start);
    if (r) { w.value = r.w; h.value = r.h; sel.value = r.format?.id || ''; }
    draw();
  }

  function timecodeTool(pane, start) {
    const fps = el('select', {}, FPS.map((f) => el('option', { value: f, text: `${f} fps`, selected: f === store.get('kit.fps', 30) })));
    const drop = el('input', { type: 'checkbox' });
    const bpm = el('input', { type: 'number', class: 'kit-num', value: store.get('kit.bpm', 120), title: 'BPM for bars / beats' });
    const expr = el('input', { value: start || '00:00:10:00 + 8 bars - 12f', placeholder: 'e.g. 00:01:00:00 + 12f - 2s, 8 bars, 1:30.5, 900f' });
    const out = el('div', { class: 'body kit-tc-out' });
    const show = () => {
      store.set('kit.fps', Number(fps.value));
      const t = timeText(expr.value, { fps: Number(fps.value), bpm: Number(bpm.value), drop: drop.checked });
      out.innerHTML = t ? renderMarkdown(t) : '<p class="hint">Use timecodes (hh:mm:ss:ff), m:ss, 90s, 1500ms, 48f, 8 bars, 3 beats, joined with + and −.</p>';
    };
    for (const c of [fps, drop, bpm, expr]) c.addEventListener('input', show);
    pane.append(el('div', { class: 'kit-col' }, el('div', { class: 'row' }, fps, el('label', { class: 'check small' }, drop, 'Drop-frame (29.97 / 59.94)'), el('span', { class: 'hint', text: 'BPM' }), bpm), expr, out));
    show();
  }

  const TABS = [
    { id: 'color', label: 'Color', render: (p, a) => { const t = colorTool(p); if (a) t.show(a); } },
    { id: 'palette', label: 'Palette', render: (p) => paletteTool(p) },
    { id: 'harmony', label: 'Harmony', render: (p, a) => harmonyTool(p, a) },
    { id: 'contrast', label: 'Contrast', render: (p, a) => contrastTool(p, a ? String(a).split(/\s+(?:on\s+)?/) : []) },
    { id: 'gradient', label: 'Gradient', render: (p, a) => gradientTool(p, a ? hexList(a) : null) },
    { id: 'easing', label: 'Easing', render: (p, a) => easingTool(p, { pts: a }) },
    { id: 'bpm', label: 'BPM ↔ ms', render: (p, a) => bpmTool(p, a) },
    { id: 'frame', label: 'Frames', render: (p, a) => frameTool(p, a) },
    { id: 'timecode', label: 'Timecode', render: (p, a) => timecodeTool(p, a) },
  ];
  // Opens the Kit window on a tab; `arg` pre-fills it (a color, a frame size, a timecode…).
  function open(tab = store.get('kit.tab', 'color'), arg) {
    document.querySelector('dialog.kit-dialog')?.close();
    const dlg = el('dialog', { class: 'ui-modal kit-dialog' });
    const body = el('div', { class: 'kit-body' });
    // the tools' plain buttons (tabs, swatches) would submit the form and close the window: never submit it
    dlg.append(el('form', { class: 'kit-shell', noValidate: true, on: { submit: (e) => e.preventDefault() } }, el('h2', { text: 'Kit' }), body,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'hint', text: 'Also in chat: /color /palette /harmony /contrast /gradient /ease /bpm /frame /tc' }), el('span', { class: 'spacer' }), el('button', { type: 'button', text: 'Close', on: { click: () => dlg.close() } }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    const want = TABS.find((t) => t.id === tab) ? tab : 'color';
    store.set('kit.tab', want);
    // the requested tab gets the argument; the others open plain
    Tabs(body, TABS.map((t) => ({ id: t.id, label: t.label, render: (p) => t.render(p, t.id === want ? arg : undefined) })), { storeKey: 'kit.tab' });
    dlg.showModal();
    return dlg;
  }

  return {
    parseColor, formats, colorTool, easingTool, bezier, hexOf, toHsl, EASE_PRESETS, easingOutputs, gsapNearest,
    harmonies, contrastReport, gradientCode, ramp, mixOk, paletteFromImage, savePaletteToLab, hexList,
    bpmTable, bpmText, bpmFromMs, FORMATS, frameInfo, parseFrame, frameText, FPS, toTimecode, parseTime, calcTime, timeText, open, TABS,
    lastPalette: () => shared.palette.slice(),
  };
})();
