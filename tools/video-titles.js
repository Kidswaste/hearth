// Titles and lower thirds for the video editor: one canvas renderer used by the preview (tools/video-comp.js),
// the exported frames (each title becomes a PNG sequence that ffmpeg lays over the edit, so the render matches
// the preview) and the MediaRecorder fallback. Styles and animations are EditFX.TITLE_STYLES / TITLE_ANIMS /
// LOWER_THIRDS (tools/cut-presets.js). Sizes are fractions of the frame height, so any canvas size works.
//   VideoTitles.draw(g, item, local, W, H)   item = { text, style, lower, anim, out, animDur, dur, x, y, size,
//                                                      color, align, bg (main-track title cards) … }
const VideoTitles = (() => {
  const FX = EditFX;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?';
  // The merged style of an item: style preset ← lower-third preset ← the item's own fields.
  function styleOf(it) {
    const base = FX.TSTYLE[it.style]?.s || (it.lower ? null : FX.TSTYLE.bold.s);
    const lt = it.lower ? FX.LTHIRD[it.lower]?.s : null;
    const s = { ...(base || FX.TSTYLE.bold.s), ...(lt || {}) };
    for (const k of ['font', 'weight', 'color', 'stroke', 'strokeW', 'shadow', 'glow', 'box', 'pad', 'upper', 'tracking', 'line', 'align', 'x', 'y', 'italic', 'bar', 'rotate']) if (it[k] != null) s[k] = it[k];
    s.size = (s.size || 0.07) * (it.size || 1);
    return s;
  }
  const fontOf = (s, px) => `${s.italic ? 'italic ' : ''}${s.weight || 700} ${Math.max(1, px).toFixed(1)}px ${s.font}`;

  // Units the animation moves (chars / words / lines / all) with their boxes, laid out once per call.
  function layoutText(g, s, text, px, W, H) {
    const lines = String(text || '').split(/\n|\\n/).map((l) => (s.upper ? l.toUpperCase() : l));
    const sizes = lines.map((_, i) => (i > 0 && s.sub ? px * s.sub : px));
    const track = (s.tracking || 0);
    const rows = lines.map((line, i) => {
      const lp = sizes[i];
      g.font = fontOf(s, lp);
      const tr = track * lp;
      const chars = [...line];
      const xs = []; let x = 0;
      for (let k = 0; k < chars.length; k += 1) { xs.push(x); x += g.measureText(chars[k]).width + tr; }
      const w = Math.max(0, x - tr);
      return { line, chars, xs, w, px: lp };
    });
    const lh = (i) => rows[i].px * (s.line || 1.15);
    const blockH = rows.reduce((a, _, i) => a + lh(i), 0);
    const blockW = Math.max(1, ...rows.map((r) => r.w));
    // anchor: x, y fractions of the frame; align decides which side of the block sits on x
    const ax = (s.x ?? 0.5) * W; const ay = (s.y ?? 0.5) * H;
    const left = s.align === 'left' ? ax : s.align === 'right' ? ax - blockW : ax - blockW / 2;
    let top = ay - blockH / 2;
    rows.forEach((r, i) => { r.top = top; r.h = lh(i); r.left = s.align === 'left' ? left : s.align === 'right' ? left + blockW - r.w : left + (blockW - r.w) / 2; top += lh(i); });
    return { rows, blockW, blockH, left, top: ay - blockH / 2 };
  }

  // The progress of the in / out animation for unit u of n at local time t.
  function phase(anim, u, n, t, dur, animDur, out) {
    const st = n > 1 ? anim.stagger || 0 : 0;
    const unitDur = Math.max(0.05, animDur * (1 - st * 0.85));
    const delay = n > 1 ? (animDur - unitDur) * (u / (n - 1)) : 0;
    const tt = out ? dur - t - (animDur - unitDur - delay) : t - delay;
    return clamp(tt / unitDur, 0, 1);
  }
  const NONE = { a: 1, x: 0, y: 0, s: 1, r: 0, b: 0, k: 1, sx: 1, sy: 1, track: 0 };
  function stateAt(it, u, n, t, dur, unitKind, kindOut) {
    const animDur = Math.max(0.05, Math.min(it.animDur ?? 0.6, dur / 2));
    const ain = FX.TANIM[it.anim || 'fade'] || FX.TANIM.fade;
    const aout = FX.TANIM[it.out || (it.anim ? 'fade' : 'fade')] || FX.TANIM.fade;
    let st = { ...NONE };
    const merge = (o, p) => {
      if (!o) return;
      if (o.a != null) st.a *= o.a;
      if (o.x) st.x += o.x; if (o.y) st.y += o.y; if (o.s != null) st.s *= o.s; if (o.r) st.r += o.r; if (o.b) st.b += o.b;
      if (o.k != null) st.k = Math.min(st.k, o.k); if (o.sx != null) st.sx *= o.sx; if (o.sy != null) st.sy *= o.sy; if (o.track) st.track += o.track;
      for (const key of ['mask', 'cursor', 'scramble', 'bar', 'under', 'boxWipe', 'count', 'rgb']) if (o[key] != null) st[key] = o[key];
      void p;
    };
    if (ain.unit === unitKind && it.anim !== 'none') { const p = phase(ain, u, n, t, dur, animDur, false); if (p < 1) { merge(ain.fn(FX.ease(ain.ease, p), u), p); st.pin = p; } }
    if (aout.unit === kindOut && (it.out || 'fade') !== 'none' && t > dur - animDur - 1e-6) { const p = phase(aout, u, n, t, dur, animDur, true); if (p < 1) merge(aout.fn(FX.ease(aout.ease, p), u), p); }
    return st;
  }

  // Draws the item at local time t (0 … item.dur) on g (W × H). Main-track title cards paint their bg first.
  function draw(g, it, t, W, H) {
    const s = styleOf(it);
    const dur = it.dur || 2;
    if (it.bg && it.where !== 'item') { g.fillStyle = it.bg; g.fillRect(0, 0, W, H); }
    if (!String(it.text || '').trim()) return;
    let px = s.size * H;
    g.save();
    if (s.rotate) { const cx = (s.x ?? 0.5) * W; const cy = (s.y ?? 0.5) * H; g.translate(cx, cy); g.rotate((s.rotate * Math.PI) / 180); g.translate(-cx, -cy); }
    let text = String(it.text);
    // count-up: numbers in the text tick up from 0
    const all = stateAt(it, 0, 1, t, dur, 'all', 'all');
    if (all.count != null && all.count < 1) text = text.replace(/\d+(\.\d+)?/g, (m) => { const v = Number(m) * all.count; return m.includes('.') ? v.toFixed(m.split('.')[1].length) : String(Math.round(v)); });
    let Lt = layoutText(g, s, text, px, W, H);
    // too wide for the frame: the words shrink to fit (90 % of the width, inside the safe area)
    const room = W * 0.9;
    if (Lt.blockW > room) { px *= room / Lt.blockW; Lt = layoutText(g, s, text, px, W, H); }
    const ainId = it.anim || 'fade'; const aoutId = it.out || 'fade';
    const unitIn = FX.TANIM[ainId]?.unit || 'all'; const unitOut = FX.TANIM[aoutId]?.unit || 'all';
    const pad = (s.pad || 0) * px;
    // block-level extras (lower-third bar, box, highlight bar, underline)
    const bx = Lt.left - pad; const by = Lt.top - pad * 0.6; const bw = Lt.blockW + pad * 2; const bh = Lt.blockH + pad * 1.2;
    g.globalAlpha = clamp(all.a, 0, 1);
    if (s.bar && all.a > 0) { g.fillStyle = s.bar; const k = all.k; const w0 = Math.max(3, px * 0.12); const x0 = s.align === 'right' ? Lt.left + Lt.blockW + px * 0.3 : Lt.left - px * 0.3 - w0; g.fillRect(x0, Lt.top, w0, Lt.blockH * k); }
    if (s.box) {
      const k = all.boxWipe != null ? Math.min(1, all.boxWipe * 2) : 1;
      g.fillStyle = s.box;
      roundRect(g, bx, by, bw * k, bh, Math.min(px * 0.25, bh / 2)); g.fill();
    }
    if (all.bar != null) { g.fillStyle = s.bar || '#ffc93b'; g.globalAlpha *= 0.85; g.fillRect(Lt.left - px * 0.15, Lt.top + Lt.blockH * 0.15, (Lt.blockW + px * 0.3) * all.bar, Lt.blockH * 0.75); g.globalAlpha = clamp(all.a, 0, 1); }
    if (all.under != null) { g.fillStyle = s.bar || s.color || '#fff'; g.fillRect(Lt.left, Lt.top + Lt.blockH + px * 0.08, Lt.blockW * all.under, Math.max(2, px * 0.06)); }
    g.globalAlpha = 1;
    if (all.boxWipe != null && all.boxWipe < 0.5) { g.restore(); return; }
    // units
    const units = [];
    Lt.rows.forEach((r, li) => {
      if (unitIn === 'char' || unitOut === 'char') r.chars.forEach((ch, ci) => units.push({ li, ch, x: r.left + r.xs[ci], w: r.xs[ci + 1] != null ? r.xs[ci + 1] - r.xs[ci] : r.w - r.xs[ci], r }));
      else if (unitIn === 'word' || unitOut === 'word') { let ci = 0; for (const w0 of r.line.split(/(\s+)/)) { if (w0.trim()) units.push({ li, ch: w0, x: r.left + r.xs[ci], w: (r.xs[ci + [...w0].length] ?? r.w) - r.xs[ci], r }); ci += [...w0].length; } } else units.push({ li, ch: r.line, x: r.left, w: r.w, r });
    });
    const countOf = (kind) => (kind === 'line' ? Lt.rows.length : kind === 'all' ? 1 : units.length);
    let shown = 0;
    units.forEach((u, ui) => {
      const idxIn = unitIn === 'line' ? u.li : unitIn === 'all' ? 0 : ui;
      const idxOut = unitOut === 'line' ? u.li : unitOut === 'all' ? 0 : ui;
      const a = stateAt({ ...it, out: unitOut === unitIn ? it.out : 'none' }, idxIn, countOf(unitIn), t, dur, unitIn, unitIn);
      const b = unitOut !== unitIn ? stateAt({ ...it, anim: 'none' }, idxOut, countOf(unitOut), t, dur, unitOut, unitOut) : NONE;
      const st = { ...a, a: a.a * b.a, x: a.x + b.x, y: a.y + b.y, s: a.s * b.s, r: a.r + b.r, b: a.b + b.b, k: Math.min(a.k, b.k), sx: a.sx * b.sx, sy: a.sy * b.sy, track: a.track + b.track };
      if (st.a <= 0.003 || st.k <= 0) return;
      shown += 1;
      const lp = u.r.px;
      g.save();
      g.font = fontOf(s, lp);
      g.textBaseline = 'middle'; g.textAlign = 'left';
      const cy = u.r.top + u.r.h / 2;
      const extra = st.track * lp * (unitIn === 'all' ? 1 : 0);
      const cx = u.x + u.w / 2 + st.x * lp;
      const yy = cy + st.y * lp;
      if (st.mask) { g.beginPath(); g.rect(u.r.left - lp, u.r.top, u.r.w + lp * 2, u.r.h); g.clip(); }
      if (st.k < 1) { g.beginPath(); g.rect(u.x - lp * 0.1, u.r.top - lp, (u.w + lp * 0.2) * st.k, u.r.h + lp * 2); g.clip(); }
      g.translate(cx, yy);
      if (st.r) g.rotate((st.r * Math.PI) / 180);
      g.scale(st.s * st.sx, st.s * st.sy);
      g.globalAlpha = clamp(st.a, 0, 1);
      if (st.b > 0.2) g.filter = `blur(${((st.b * H) / 1080).toFixed(1)}px)`;
      let str = u.ch;
      if (st.scramble && st.pin != null && st.pin < 1) str = [...u.ch].map((c, i) => (c.trim() ? GLYPHS[(Math.floor(t * 30) * 7 + i * 13 + ui * 5) % GLYPHS.length] : c)).join('');
      if (extra && unitIn === 'all') {
        // tracking animation on the whole block: draw the letters spread from the center
        const chars = [...str]; const tw = u.w + extra * (chars.length - 1);
        let x = -tw / 2;
        chars.forEach((c, i) => { paint(g, s, c, x, 0, lp, H); x += (u.r.xs[i + 1] != null ? u.r.xs[i + 1] - u.r.xs[i] : 0) + extra; });
      } else paint(g, s, str, -u.w / 2, 0, lp, H, st.rgb);
      g.restore();
    });
    // a typing cursor after the last letter that is showing
    const typing = FX.TANIM[ainId]?.fn(0.5)?.cursor && t < Math.max(0.05, Math.min(it.animDur ?? 0.6, dur / 2)) + 0.4;
    if (typing && Math.floor(t * 2.5) % 2 === 0 && units.length) {
      const u = units[Math.max(0, Math.min(units.length - 1, shown - 1))];
      g.fillStyle = s.color || '#fff';
      g.fillRect(u.x + (shown ? u.w : 0) + u.r.px * 0.06, u.r.top + u.r.h * 0.18, Math.max(2, u.r.px * 0.08), u.r.h * 0.64);
    }
    g.restore();
  }
  function paint(g, s, str, x, y, px, H, rgb = 0) {
    if (rgb > 0.02) {
      const o = rgb * px * 0.12;
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = '#ff0040'; g.fillText(str, x - o, y); g.fillStyle = '#00e0ff'; g.fillText(str, x + o, y);
      g.restore();
    }
    if (s.glow) { g.save(); g.shadowColor = s.glow; g.shadowBlur = px * 0.6; g.fillStyle = s.glow; g.fillText(str, x, y); g.shadowBlur = px * 0.25; g.fillText(str, x, y); g.restore(); }
    if (s.shadow) { g.shadowColor = s.shadow; g.shadowBlur = px * 0.18; g.shadowOffsetY = px * 0.06; }
    if (s.stroke && s.strokeW) { g.lineJoin = 'round'; g.lineWidth = Math.max(1, s.strokeW * px); g.strokeStyle = s.stroke; g.strokeText(str, x, y); }
    g.fillStyle = s.color || '#fff';
    g.fillText(str, x, y);
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    void H;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) { g.roundRect(x, y, Math.max(0, w), h, r); return; }
    g.rect(x, y, Math.max(0, w), h);
  }
  // A small preview picture of a style / animation (menus, the inspector).
  function thumb(it, { w = 160, h = 90, t = null } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#16181d'; g.fillRect(0, 0, w, h);
    draw(g, { text: 'Title', dur: 2, ...it }, t ?? (it.dur || 2) / 2, w, h);
    return c;
  }
  return { draw, styleOf, thumb, layoutText };
})();
