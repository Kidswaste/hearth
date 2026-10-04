// Shared creative utilities used by Three.js Lab and the After Effects kit:
// a color converter and a cubic-bezier easing editor.
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
  };

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
    return [
      ['CSS', `cubic-bezier(${p.join(', ')})`],
      ['GSAP CustomEase', `CustomEase.create("custom", "M0,0 C${p[0]},${p[1]} ${p[2]},${p[3]} 1,1")`],
      ['JavaScript / three.js', solver],
      ['After Effects expression', ae],
      ['AE keyframe influence', `Outgoing influence ${Math.round(p[0] * 100)}%, incoming influence ${Math.round((1 - p[2]) * 100)}%${p[1] === 0 && p[3] === 1 ? ', speed 0 on both' : ' (speed depends on the value change; the expression above is exact)'}`],
    ];
  }

  function easingTool(container) {
    let pts = store.get('kit.ease', EASE_PRESETS['AE Easy Ease']);
    const W = 280; const PAD = 40;
    const canvas = el('canvas', { width: W + PAD * 2, height: W + PAD * 2, class: 'kit-ease-canvas' });
    const ctx = canvas.getContext('2d');
    const presets = el('select', {}, el('option', { text: 'Presets…', value: '' }), Object.keys(EASE_PRESETS).map((k) => el('option', { value: k, text: k })));
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
    presets.addEventListener('change', () => { if (presets.value) { pts = [...EASE_PRESETS[presets.value]]; update(); presets.value = ''; } });
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

  return { parseColor, formats, colorTool, easingTool, bezier, hexOf, toHsl, EASE_PRESETS };
})();
