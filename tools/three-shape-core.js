// ◆ Shapes that draw themselves (round 51, labshapes): the math, no DOM. The same file runs in the Lab (the picker's
// live previews), in the preview / export page (sent as source on first use like ♪ Move with the music:
// globalThis.shapecore, see "shape layers" in tools/three-sandbox.html) and in Node (dev/labshapes-test.js).
// - build(id, v, custom, out): a preset's path as polylines in "units" (1 unit = half the frame's shorter side, y up,
//   centred), into reused arrays: each closed part repeats its first point at its end, so every pair of points is a
//   segment; s[] is the arc length from the path's start (all parts one after the other: a trim draws them in order).
// - trim(v, t, hit, out): what is drawn at time t: up to two arc intervals (0..1 of the whole length) from the draw-on
//   mode (off = the Start / End sliders, so keyframes shape it; in, out, in & out, loop; on each beat / bar / kick /
//   snare via ♪'s hit sources), the easing, reverse and offset. A function of the time alone: a render is the preview.
// - runs(path, I, dash, fn): the visible pieces as polylines (the picker's 2D previews, tests: "how many pixels drawn").
// Widths, dashes and gaps are in pixels of a 1080-pixel shorter side, so a 9:16 and a 16:9 render look the same.
function hearthShapeCore() {
  const TAU = Math.PI * 2;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const EASES = ['linear', 'smooth', 'in', 'out', 'expo', 'back'];
  function ease(name, u) {
    u = clamp01(u);
    switch (name) {
      case 'linear': return u;
      case 'in': return u * u * u;
      case 'out': return 1 - (1 - u) ** 3;
      case 'expo': return u >= 1 ? 1 : 1 - 2 ** (-10 * u);
      case 'back': { const c = 1.70158; const x = u - 1; return clamp01(1 + (c + 1) * x * x * x + c * x * x); } // (its overshoot clamped: a line can't draw past its end)
      default: return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; // smooth
    }
  }
  const MODES = ['off', 'in', 'out', 'inout', 'loop', 'beat', 'bar', 'kick', 'snare'];
  const MODE_NAMES = { off: 'Start / End sliders', in: 'Draws on', out: 'Draws off', inout: 'On, then off', loop: 'On and off, again', beat: 'Each beat', bar: 'Each bar', kick: 'Each kick', snare: 'Each snare' };
  const HIT_MODES = { beat: 'beat', bar: 'bar', kick: 'kick', snare: 'snare' };

  // ---------- the presets ----------
  // kind: how the path is made; keys: the shape's own sliders; look / draw: its defaults
  const K = (o) => ({ fill: '#ffd75e', fillA: 0, stroke: '#ffffff', width: 10, dash: 0, gap: 12, march: 0, taper: 0, round: 0, drawOn: 'in', dur: 1.2, delay: 0, hold: 1, ease: 'smooth', reverse: false, offset: 0, fillIn: true, trimStart: 0, trimEnd: 1, ...o });
  const PRESETS = [
    { id: 'rect', name: 'Rectangle', kind: 'rect', keys: ['w', 'h', 'round'], desc: 'A box that draws its outline', tags: 'rectangle box square frame outline', v: K({ w: 0.62, h: 0.36 }) },
    { id: 'rounded', name: 'Rounded rectangle', kind: 'rect', keys: ['w', 'h', 'round'], desc: 'A pill-ish box with soft corners', tags: 'rounded rectangle pill button card soft corners', v: K({ w: 0.62, h: 0.3, round: 0.5, fillA: 0.18 }) },
    { id: 'circle', name: 'Circle', kind: 'ellipse', keys: ['w', 'h'], desc: 'A circle drawn round from the top', tags: 'circle ellipse oval round dot', v: K({ w: 0.42, h: 0.42 }) },
    { id: 'ring', name: 'Ring', kind: 'ellipse', keys: ['w', 'h'], desc: 'A thick ring that sweeps round', tags: 'ring donut loader progress circle thick', v: K({ w: 0.38, h: 0.38, width: 44, stroke: '#ffd75e', ease: 'out', dur: 1.4 }) },
    { id: 'triangle', name: 'Triangle', kind: 'poly', keys: ['w', 'h', 'sides', 'round'], desc: 'Three sides, point up', tags: 'triangle polygon play delta', v: K({ w: 0.46, h: 0.46, sides: 3 }) },
    { id: 'polygon', name: 'Hexagon', kind: 'poly', keys: ['w', 'h', 'sides', 'round'], desc: 'A polygon (sides on a slider)', tags: 'polygon hexagon pentagon octagon sides', v: K({ w: 0.44, h: 0.44, sides: 6 }) },
    { id: 'star', name: 'Star', kind: 'star', keys: ['w', 'h', 'sides', 'inner', 'round'], desc: 'A star (points and depth on sliders)', tags: 'star sparkle points burst', v: K({ w: 0.46, h: 0.46, sides: 5, inner: 0.45, fillA: 1, fill: '#ffd75e', stroke: '#ffffff', width: 6 }) },
    { id: 'line', name: 'Line', kind: 'line', keys: ['w'], desc: 'A straight line that writes itself', tags: 'line stroke rule divider straight', v: K({ w: 0.6, width: 8, ease: 'expo', dur: 0.9 }) },
    { id: 'arrow', name: 'Arrow', kind: 'arrow', keys: ['w', 'inner'], desc: 'A shaft, then its head', tags: 'arrow pointer direction next', v: K({ w: 0.55, inner: 0.28, width: 10 }) },
    { id: 'swoosh', name: 'Underline swoosh', kind: 'swoosh', keys: ['w', 'amp'], desc: 'A brushy underline, thin at its ends', tags: 'underline swoosh brush stroke highlight marker', v: K({ w: 0.6, amp: 0.12, width: 22, taper: 0.85, stroke: '#ffd75e', ease: 'out', dur: 0.8 }) },
    { id: 'frame', name: 'Bracket frame', kind: 'frame', keys: ['w', 'h', 'inner', 'round'], desc: 'Four corner brackets, like a viewfinder', tags: 'frame bracket corners viewfinder focus camera crop', v: K({ w: 0.6, h: 0.38, inner: 0.28, width: 8 }) },
    { id: 'brackets', name: 'Square brackets', kind: 'brackets', keys: ['w', 'h', 'inner'], desc: '[ ] around something', tags: 'brackets square code wrap', v: K({ w: 0.6, h: 0.3, inner: 0.18, width: 9 }) },
    { id: 'cross', name: 'Cross', kind: 'cross', keys: ['w'], desc: 'An X, one stroke then the other', tags: 'cross x close no wrong mark', v: K({ w: 0.3, width: 16, stroke: '#ff4d6d', dur: 0.8 }) },
    { id: 'plus', name: 'Plus', kind: 'plus', keys: ['w'], desc: 'A plus sign', tags: 'plus add cross sign', v: K({ w: 0.3, width: 16, dur: 0.8 }) },
    { id: 'check', name: 'Checkmark', kind: 'check', keys: ['w'], desc: 'A tick that writes itself', tags: 'check checkmark tick yes done ok', v: K({ w: 0.36, width: 18, stroke: '#3dff8b', ease: 'out', dur: 0.7 }) },
    { id: 'wave', name: 'Wave line', kind: 'wave', keys: ['w', 'amp', 'turns'], desc: 'A sine wave across', tags: 'wave sine squiggle wavy line', v: K({ w: 0.62, amp: 0.08, turns: 3, width: 8, ease: 'linear', dur: 1.6 }) },
    { id: 'zigzag', name: 'Zigzag', kind: 'zigzag', keys: ['w', 'amp', 'turns', 'round'], desc: 'Sharp ups and downs', tags: 'zigzag zig zag lightning teeth', v: K({ w: 0.62, amp: 0.08, turns: 6, width: 8, ease: 'linear' }) },
    { id: 'spiral', name: 'Spiral', kind: 'spiral', keys: ['w', 'turns'], desc: 'From the middle out', tags: 'spiral swirl hypnotic coil', v: K({ w: 0.45, turns: 4, width: 6, ease: 'linear', dur: 2 }) },
    { id: 'heart', name: 'Heart', kind: 'heart', keys: ['w', 'h'], desc: 'A heart traced in one line', tags: 'heart love like', v: K({ w: 0.42, h: 0.42, stroke: '#ff4d8d', fill: '#ff4d8d', fillA: 0.85, width: 8 }) },
    { id: 'burst', name: 'Burst', kind: 'burst', keys: ['w', 'sides', 'inner'], desc: 'Rays shooting out from the middle', tags: 'burst rays sun shine explosion lines comic', v: K({ w: 0.48, sides: 12, inner: 0.45, width: 8, stroke: '#ffd75e', ease: 'out', dur: 0.6 }) },
    { id: 'custom', name: 'Draw your own', kind: 'custom', keys: ['w', 'h', 'round'], desc: 'Click points on the preview (Shift: straight lines)', tags: 'draw your own custom path pen points freehand', v: K({ w: 1, h: 1, width: 10 }) },
  ];
  // the shape's own sliders: [min, max, step, label, default]
  const SHAPE_KEYS = {
    w: [0.02, 2, 0.01, 'Width', 0.5], h: [0.02, 2, 0.01, 'Height', 0.5], sides: [3, 24, 1, 'Sides / points', 5], inner: [0.05, 0.95, 0.01, 'Inner size', 0.45],
    round: [0, 1, 0.01, 'Corner roundness', 0], amp: [0, 0.6, 0.005, 'Amount', 0.1], turns: [1, 16, 0.5, 'Turns / waves', 3],
  };
  const preset = (q) => {
    const w = String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!w) return null;
    const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    return PRESETS.find((p) => p.id === w || flat(p.name) === w) || PRESETS.find((p) => p.id.startsWith(w) || flat(p.name).startsWith(w)) || PRESETS.find((p) => ` ${p.tags} `.includes(` ${String(q).toLowerCase().trim()} `)) || null;
  };

  // ---------- paths ----------
  // out: { x: Float32Array, y, s, rw (taper), n (points), subs: [[i0, n, closed]], L, wind: [±1 per sub] }
  function newPath() { return { x: new Float32Array(256), y: new Float32Array(256), s: new Float32Array(256), rw: new Float32Array(256), n: 0, subs: [], L: 0, ver: 0 }; }
  function grow(P, need) {
    if (need <= P.x.length) return;
    let m = P.x.length; while (m < need) m *= 2;
    for (const k of ['x', 'y', 's', 'rw']) { const a = new Float32Array(m); a.set(P[k]); P[k] = a; }
  }
  let cur = null; let subStart = 0;
  const begin = (P) => { cur = P; P.n = 0; P.subs.length = 0; };
  const moveTo = () => { subStart = cur.n; };
  const lineTo = (x, y) => { grow(cur, cur.n + 1); const i = cur.n; if (i > subStart && Math.abs(cur.x[i - 1] - x) < 1e-7 && Math.abs(cur.y[i - 1] - y) < 1e-7) return; cur.x[i] = x; cur.y[i] = y; cur.n += 1; };
  const endSub = (closed) => {
    const n = cur.n - subStart;
    if (n < 2) { cur.n = subStart; return; }
    if (closed) { const x0 = cur.x[subStart]; const y0 = cur.y[subStart]; if (Math.abs(cur.x[cur.n - 1] - x0) > 1e-7 || Math.abs(cur.y[cur.n - 1] - y0) > 1e-7) lineTo(x0, y0); else if (n < 3) { cur.n = subStart; return; } }
    cur.subs.push([subStart, cur.n - subStart, closed]);
  };
  // a polyline with rounded corners (r: 0..1 of the most each corner can take), as one part
  function poly(pts, closed, r = 0, sharp = null) {
    moveTo();
    const n = pts.length;
    if (!r || n < 3) { for (const p of pts) lineTo(p[0], p[1]); endSub(closed); return; }
    const seg = 6;
    for (let i = 0; i < n; i += 1) {
      const p = pts[i];
      const ends = !closed && (i === 0 || i === n - 1);
      if (ends || sharp?.[i] === false) { lineTo(p[0], p[1]); continue; }
      const a = pts[(i - 1 + n) % n]; const b = pts[(i + 1) % n];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]); const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const d = r * Math.min(la, lb) * 0.5;
      if (d < 1e-6 || !la || !lb) { lineTo(p[0], p[1]); continue; }
      const p1 = [p[0] + ((a[0] - p[0]) / la) * d, p[1] + ((a[1] - p[1]) / la) * d];
      const p2 = [p[0] + ((b[0] - p[0]) / lb) * d, p[1] + ((b[1] - p[1]) / lb) * d];
      for (let k = 0; k <= seg; k += 1) { const u = k / seg; const m = 1 - u; lineTo(m * m * p1[0] + 2 * m * u * p[0] + u * u * p2[0], m * m * p1[1] + 2 * m * u * p[1] + u * u * p2[1]); } // (a quadratic curve with the corner as its handle)
    }
    endSub(closed); // (closed: the start sits on the first corner's curve, closing returns to it)
  }
  // a smooth line through points (centripetal Catmull-Rom); points flagged sharp keep their corner (draw your own)
  function smooth(pts, closed, sharp = null, per = 12) {
    const n = pts.length;
    if (n < 3) { poly(pts, closed); return; }
    moveTo();
    const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    const last = closed ? n : n - 1;
    lineTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < last; i += 1) {
      const p1 = P(i); const p2 = P(i + 1);
      if (sharp?.[i % n] || sharp?.[(i + 1) % n]) { lineTo(p2[0], p2[1]); continue; } // (a straight segment into / out of a sharp point)
      const p0 = P(i - 1); const p3 = P(i + 2);
      const d = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
      const t1 = d(p0, p1); const t2 = t1 + d(p1, p2); const t3 = t2 + d(p2, p3);
      for (let k = 1; k <= per; k += 1) {
        const t = t1 + ((t2 - t1) * k) / per;
        const L = (a, b, ta, tb) => [((tb - t) / (tb - ta)) * a[0] + ((t - ta) / (tb - ta)) * b[0], ((tb - t) / (tb - ta)) * a[1] + ((t - ta) / (tb - ta)) * b[1]];
        const A1 = L(p0, p1, 0, t1); const A2 = L(p1, p2, t1, t2); const A3 = L(p2, p3, t2, t3);
        const B1 = L(A1, A2, 0, t2); const B2 = L(A2, A3, t1, t3);
        const C = L(B1, B2, t1, t2);
        lineTo(C[0], C[1]);
      }
    }
    endSub(closed);
  }
  const N = (v, k, d) => { const x = Number(v[k]); return Number.isFinite(x) ? x : d; };
  // the path of a preset with values v (its sliders); custom: { points: [[x, y, sharp]…], closed } (draw your own)
  function build(id, v, custom, P = newPath()) {
    const p = PRESETS.find((q) => q.id === id) || PRESETS[0];
    const w = Math.max(0.005, N(v, 'w', p.v.w ?? 0.5)); const h = Math.max(0.005, N(v, 'h', p.v.h ?? w));
    const r = clamp01(N(v, 'round', p.v.round ?? 0)); const sides = Math.max(3, Math.min(64, Math.round(N(v, 'sides', p.v.sides ?? 5))));
    const inner = Math.max(0.02, Math.min(0.98, N(v, 'inner', p.v.inner ?? 0.45))); const amp = N(v, 'amp', p.v.amp ?? 0.1); const turns = Math.max(0.5, N(v, 'turns', p.v.turns ?? 3));
    begin(P);
    const ring = (rx, ry, k, a0 = Math.PI / 2, dir = -1) => Array.from({ length: k }, (_, i) => [rx * Math.cos(a0 + (dir * i * TAU) / k), ry * Math.sin(a0 + (dir * i * TAU) / k)]);
    switch (p.kind) {
      case 'rect': poly([[-w, h], [w, h], [w, -h], [-w, -h]], true, r); break; // (top-left first, clockwise: it draws like handwriting)
      case 'ellipse': poly(ring(w, h, 160), true); break;
      case 'poly': poly(ring(w, h, sides), true, r); break;
      case 'star': poly(Array.from({ length: sides * 2 }, (_, i) => { const a = Math.PI / 2 - (i * Math.PI) / sides; const k = i % 2 ? inner : 1; return [w * k * Math.cos(a), h * k * Math.sin(a)]; }), true, r); break;
      case 'line': poly([[-w, 0], [w, 0]], false); break;
      case 'arrow': { const hl = w * inner; poly([[-w, 0], [w, 0]], false); poly([[w - hl, hl * 0.8], [w, 0], [w - hl, -hl * 0.8]], false); break; }
      case 'swoosh': smooth([[-w, amp * 0.2], [-w * 0.35, -amp * 0.55], [w * 0.3, -amp * 0.4], [w, amp * 0.6]], false, null, 24); break;
      case 'frame': {
        const lx = w * inner; const ly = Math.min(h, lx);
        for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) poly([[sx * w, sy * (h - ly)], [sx * w, sy * h], [sx * (w - lx), sy * h]], false, r);
        break;
      }
      case 'brackets': { const lx = w * inner; poly([[-w + lx, h], [-w, h], [-w, -h], [-w + lx, -h]], false); poly([[w - lx, h], [w, h], [w, -h], [w - lx, -h]], false); break; }
      case 'cross': poly([[-w, w], [w, -w]], false); poly([[w, w], [-w, -w]], false); break;
      case 'plus': poly([[0, w], [0, -w]], false); poly([[-w, 0], [w, 0]], false); break;
      case 'check': poly([[-w, 0.05 * w], [-w * 0.3, -w * 0.6], [w, w * 0.65]], false); break;
      case 'wave': { moveTo(); const k = Math.max(32, Math.round(turns * 48)); for (let i = 0; i <= k; i += 1) { const u = i / k; lineTo(-w + 2 * w * u, amp * Math.sin(u * turns * TAU)); } endSub(false); break; }
      case 'zigzag': { const k = Math.max(1, Math.round(turns * 2)); poly(Array.from({ length: k + 1 }, (_, i) => [-w + (2 * w * i) / k, i % 2 ? -amp : amp]), false, r); break; }
      case 'spiral': { moveTo(); const k = Math.max(64, Math.round(turns * 96)); for (let i = 0; i <= k; i += 1) { const u = i / k; const a = Math.PI / 2 - u * turns * TAU; lineTo(w * u * Math.cos(a), w * u * Math.sin(a)); } endSub(false); break; }
      case 'heart': { moveTo(); const k = 160; for (let i = 0; i <= k; i += 1) { const a = (i / k) * TAU; const x = 16 * Math.sin(a) ** 3; const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); lineTo((x / 17) * w, ((y + 2.5) / 17) * h); } endSub(true); break; }
      case 'burst': for (let i = 0; i < sides; i += 1) { const a = Math.PI / 2 - (i * TAU) / sides; poly([[w * inner * Math.cos(a), w * inner * Math.sin(a)], [w * Math.cos(a), w * Math.sin(a)]], false); } break;
      case 'custom': {
        const pts = (custom?.points || []).filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).slice(0, 400).map((q) => [+q[0] * w, +q[1] * h]);
        const sharp = (custom?.points || []).map((q) => Boolean(q?.[2]));
        if (pts.length >= 2) { if (r > 0) poly(pts, Boolean(custom?.closed), r); else smooth(pts, Boolean(custom?.closed), sharp); }
        break;
      }
      default: break;
    }
    // arc length along everything (parts one after the other), the taper per point, each closed part's winding
    let s = 0; P.wind = P.wind || []; P.wind.length = 0;
    const taper = clamp01(N(v, 'taper', p.v.taper ?? 0));
    for (const [i0, n, closed] of P.subs) {
      const sa = s;
      P.s[i0] = s;
      for (let i = i0 + 1; i < i0 + n; i += 1) { s += Math.hypot(P.x[i] - P.x[i - 1], P.y[i] - P.y[i - 1]); P.s[i] = s; }
      const len = Math.max(1e-9, s - sa);
      for (let i = i0; i < i0 + n; i += 1) { const u = (P.s[i] - sa) / len; P.rw[i] = closed || !taper ? 1 : Math.max(0.04, 1 - taper * (2 * u - 1) ** 2); }
      let A = 0; for (let i = i0; i < i0 + n - 1; i += 1) A += P.x[i] * P.y[i + 1] - P.x[i + 1] * P.y[i];
      P.wind.push(A >= 0 ? 1 : -1);
    }
    P.L = s; P.ver += 1;
    cur = null;
    return P;
  }

  // ---------- what is drawn at time t ----------
  // hit: (t) → { k, at, prev, next } | null (♪'s hit sources); base: the draw-on's start (the layer's clock)
  // out: { a0, b0, a1, b1 (0..1, second pair empty when b1 < a1), vis (0..1 drawn), fillK (the fill's share) }
  function trim(v, t, hit, out = {}) {
    const mode = MODES.includes(v.drawOn) ? v.drawOn : 'off';
    const dur = Math.max(0.01, N(v, 'dur', 1)); const delay = N(v, 'delay', 0); const hold = Math.max(0, N(v, 'hold', 1));
    const e = (u) => ease(String(v.ease || 'smooth'), u);
    let a = 0; let b = 1;
    if (mode === 'off') { a = clamp01(N(v, 'trimStart', 0)); b = clamp01(N(v, 'trimEnd', 1)); if (b < a) { const x = a; a = b; b = x; } }
    else if (mode === 'in') b = e((t - delay) / dur);
    else if (mode === 'out') a = e((t - delay) / dur);
    else if (mode === 'inout' || mode === 'loop') {
      let x = t - delay;
      if (mode === 'loop' && x > 0) x %= 2 * dur + 2 * hold;
      b = e(x / dur); a = e((x - dur - hold) / dur);
    } else {
      const h = hit ? hit(t) : null;
      if (!h) b = 0; else b = e((t - h.at) / dur);
    }
    if (v.reverse === true || v.reverse === 'true') { const x = a; a = 1 - b; b = 1 - x; }
    const off = ((N(v, 'offset', 0) % 1) + 1) % 1;
    out.vis = Math.max(0, b - a);
    if (off && out.vis > 0 && out.vis < 1) {
      a += off; b += off;
      if (b <= 1) { out.a0 = a; out.b0 = b; out.a1 = 1; out.b1 = 0; }
      else if (a >= 1) { out.a0 = a - 1; out.b0 = b - 1; out.a1 = 1; out.b1 = 0; }
      else { out.a0 = a; out.b0 = 1; out.a1 = 0; out.b1 = b - 1; }
    } else { out.a0 = a; out.b0 = b; out.a1 = 1; out.b1 = 0; }
    out.fillK = v.fillIn === false || v.fillIn === 'false' ? 1 : clamp01((out.vis - 0.6) / 0.4);
    return out;
  }
  // the dash pattern in units (0 = solid): [dash, gap, phase]; march: pixels a second the dashes move
  const PX = 2 / 1080; // (one pixel of a 1080-pixel shorter side, in units)
  function dashOf(v, t, out = [0, 0, 0]) {
    const d = Math.max(0, N(v, 'dash', 0)); const g = Math.max(0, N(v, 'gap', 12));
    if (!d) { out[0] = 0; out[1] = 0; out[2] = 0; return out; }
    out[0] = d * PX; out[1] = Math.max(0.5, g) * PX; out[2] = (N(v, 'march', 0) * t + N(v, 'dashOff', 0)) * PX;
    return out;
  }
  // the visible pieces as polylines: fn(xs, ys) per piece (arc intervals I in units; dash as dashOf)
  function runs(P, I, dash, fn) {
    const pieces = [];
    for (let k = 0; k < I.length; k += 2) {
      const lo = I[k]; const hi = I[k + 1]; if (!(hi > lo)) continue;
      if (dash && dash[0] > 0) {
        const per = dash[0] + dash[1];
        let m = Math.floor((lo - dash[2]) / per);
        for (let st = dash[2] + m * per; st < hi; m += 1, st = dash[2] + m * per) { const x0 = Math.max(lo, st); const x1 = Math.min(hi, st + dash[0]); if (x1 > x0) pieces.push(x0, x1); }
      } else pieces.push(lo, hi);
    }
    for (let k = 0; k < pieces.length; k += 2) {
      const lo = pieces[k]; const hi = pieces[k + 1];
      for (const [i0, n] of P.subs) {
        const s0 = P.s[i0]; const s1 = P.s[i0 + n - 1];
        if (hi <= s0 || lo >= s1) continue;
        const xs = []; const ys = [];
        const at = (s) => { let i = i0; while (i < i0 + n - 2 && P.s[i + 1] < s) i += 1; const L = P.s[i + 1] - P.s[i] || 1; const u = Math.max(0, Math.min(1, (s - P.s[i]) / L)); return [P.x[i] + (P.x[i + 1] - P.x[i]) * u, P.y[i] + (P.y[i + 1] - P.y[i]) * u]; };
        const a = Math.max(lo, s0); const b = Math.min(hi, s1);
        let q = at(a); xs.push(q[0]); ys.push(q[1]);
        for (let i = i0; i < i0 + n; i += 1) if (P.s[i] > a && P.s[i] < b) { xs.push(P.x[i]); ys.push(P.y[i]); }
        q = at(b); xs.push(q[0]); ys.push(q[1]);
        fn(xs, ys, a, b);
      }
    }
  }
  // the drawn length in units (tests: "how far it has drawn")
  function drawnLength(P, tr, dash) { let s = 0; runs(P, [tr.a0 * P.L, tr.b0 * P.L, tr.a1 * P.L, tr.b1 * P.L], dash, (xs, ys, a, b) => { s += b - a; }); return s; }
  const hex3 = (h, out, o = 0) => { const n = parseInt(String(h || '#ffffff').slice(1), 16) || 0; out[o] = ((n >> 16) & 255) / 255; out[o + 1] = ((n >> 8) & 255) / 255; out[o + 2] = (n & 255) / 255; return out; };
  // a steady demo beat (no song: the previews and the page's 120 BPM, like ♪ Move with the music's)
  const clockHits = (period, at0 = 0) => (t) => { if (t < at0) return null; const k = Math.floor((t - at0) / period); const at = at0 + k * period; return { k, at, prev: k ? at - period : null, next: at + period }; };
  const DEMO_HITS = { beat: clockHits(0.5), bar: clockHits(2), kick: clockHits(0.5), snare: clockHits(1, 0.5) };

  // ---------- the shaders (one instanced quad per segment: its own distance, trim, dashes and round ends) ----------
  const VERT = `in vec2 position;
in vec2 aA; in vec2 aB; in vec2 aS; in vec2 aR; in float aW;
uniform vec2 uView; uniform float uHalf; uniform float uPx; uniform float uFringe;
out vec2 vP; flat out vec2 vA; flat out vec2 vB; flat out vec2 vS; flat out vec2 vR; flat out float vW;
void main() {
  vec2 d = aB - aA; float L = length(d); vec2 t = L > 1e-7 ? d / L : vec2(1.0, 0.0); vec2 n = vec2(-t.y, t.x);
  float R = (uFringe > 0.5 ? 0.0 : uHalf * max(aR.x, aR.y)) + 1.5 * uPx;
  vec2 p = mix(aA - t * R, aB + t * R, position.x) + n * R * position.y;
  vP = p; vA = aA; vB = aB; vS = aS; vR = aR; vW = aW;
  gl_Position = vec4(p * uView, 0.0, 1.0);
}`;
  const FRAG = `precision highp float;
in vec2 vP; flat in vec2 vA; flat in vec2 vB; flat in vec2 vS; flat in vec2 vR; flat in float vW;
uniform float uHalf; uniform float uPx; uniform vec4 uTrim; uniform vec3 uDash; uniform vec3 uColor; uniform float uAlpha; uniform float uFringe;
out vec4 fragColor;
float best;
void piece(float lo, float hi, float s) {
  if (hi < lo) return;
  float sc = clamp(s, lo, hi); float u = (sc - vS.x) / max(vS.y - vS.x, 1e-9);
  float r = uFringe > 0.5 ? 0.0 : uHalf * mix(vR.x, vR.y, u);
  best = min(best, length(vP - mix(vA, vB, u)) - r);
}
void main() {
  vec2 d = vB - vA; float L2 = max(dot(d, d), 1e-12);
  if (uFringe > 0.5 && (vW == 0.0 || (d.x * (vP.y - vA.y) - d.y * (vP.x - vA.x)) * vW > 0.0)) discard; // (a fill's edge: closed parts only, only its outer side)
  float s = mix(vS.x, vS.y, dot(vP - vA, d) / L2);
  best = 1e9;
  for (int k = 0; k < 2; k++) {
    vec2 I = k == 0 ? uTrim.xy : uTrim.zw;
    float lo = max(I.x, vS.x); float hi = min(I.y, vS.y);
    if (hi < lo) continue;
    if (uDash.x > 0.0) {
      float per = uDash.x + uDash.y; float m = floor((s - uDash.z) / per);
      for (int j = -1; j <= 1; j++) { float a = uDash.z + (m + float(j)) * per; piece(max(lo, a), min(hi, a + uDash.x), s); }
    } else piece(lo, hi, s);
  }
  float c = clamp(0.5 - best / uPx, 0.0, 1.0) * uAlpha;
  if (c <= 0.0) discard;
  fragColor = vec4(uColor * c, c);
}`;
  // the fill: plain triangles (three.js triangulates each closed part)
  const FILL_VERT = `in vec2 position; uniform vec2 uView; void main() { gl_Position = vec4(position * uView, 0.0, 1.0); }`;
  const FILL_FRAG = `precision highp float; uniform vec3 uColor; uniform float uAlpha; out vec4 fragColor; void main() { fragColor = vec4(uColor * uAlpha, uAlpha); }`;

  return { PRESETS, SHAPE_KEYS, MODES, MODE_NAMES, HIT_MODES, EASES, PX, ease, preset, newPath, build, trim, dashOf, runs, drawnLength, hex3, clockHits, DEMO_HITS, VERT, FRAG, FILL_VERT, FILL_FRAG };
}
const ShapeCore = hearthShapeCore();
// the preview page gets the factory as source (tools/three.js sandboxLib: it runs `(code)()` as a module there)
if (typeof window !== 'undefined') { (window.__sbxLibFn ||= {}).shapecore = { toString: () => `function () { const F = (${hearthShapeCore}); globalThis.shapecore = F(); globalThis.shapecore.factory = String(F); }` }; window.ShapeCore = ShapeCore; }
if (typeof module !== 'undefined') module.exports = { ...ShapeCore, factory: hearthShapeCore };
