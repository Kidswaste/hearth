// motion.<kind>() (the motion-design kit): part of the Lab preview page (tools/three-sandbox.html), split out in round 25 (diet) so the page
// doesn't parse it before its first frame. The preview is a sandboxed iframe that can't load files, so the hub loads
// this file when a page asks (tools/three.js sandboxFrame: 'lib-need') and sends the function's source; the page runs
// it as a module right after `import * as THREE from 'three'` (THREE is free here on purpose). A deployed page has it
// inlined (deploymain.js labPage). Nothing runs in the hub: it only reads the source.
// ---------- the motion-design kit (round 9: tools/three-motion*.js) ----------
// motion.<kind>(P, opts) inside a layer's code makes it a motion-design layer, like filter(type, P) does for filters:
// kinetic type, Hearth's own UI as 3D cards and devices, a cursor, camera moves, logo reveals, brand backgrounds and
// end cards. P is the layer's tweak() object (or the getters a node graph compiles to): every value is read each
// frame, so sliders, keyframes, looks and Shuffle work. Time first: a layer counts from its own start on the timeline
// or in the sequence (layer.time), never from the music unless asked; with nothing to follow (no song, no in point)
// the animation loops so the preview keeps playing. Camera layers publish a rig the 3D motion layers follow; with no
// 3D layer under them they move the whole picture (a filter). Runs before the main module: it only touches
// `layer`, `audio`, `filter` at call time.
(window.__sbxLibFn ||= {}).motion = function () {
const motion = (() => {
  const C01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const bounceOut = (t) => { const n = 7.5625; const d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; };
  const EASE = {
    linear: (t) => t, smooth: (t) => t * t * (3 - 2 * t), in: (t) => t * t * t, out: (t) => 1 - (1 - t) ** 3,
    inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2), expo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
    expoInOut: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
    back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
    elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    bounce: bounceOut, sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  const ease = (name, t) => (EASE[name] || EASE.out)(C01(t));
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const vnoise = (x) => { const i = Math.floor(x); const f = x - i; const u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };
  const FORGE = { gold: '#ffd75e', ember: '#ff8c42', flame: '#ff5a36', violet: '#bd8bff', blue: '#48ddff', night: '#0b0b12', ink: '#14161d', paper: '#f4efe6' };
  const FONTS = { Oxanium: 'Oxanium, "Arial Black", system-ui, sans-serif', 'System': 'system-ui, -apple-system, "Segoe UI", sans-serif', Impact: 'Impact, "Arial Black", sans-serif', Serif: 'Georgia, "Times New Roman", serif', Mono: 'Consolas, "Courier New", monospace', Rounded: '"Arial Rounded MT Bold", "Nunito", system-ui, sans-serif' };
  const fontOf = (f) => FONTS[f] || f || FONTS.Oxanium;
  // P's value or a default (P can be a tweak() object, a node graph's getters or a plain object)
  const val = (P, k, d) => { const x = P?.[k]; return x === undefined || x === null || (typeof x === 'number' && !Number.isFinite(x)) ? d : x; };
  const num = (P, k, d) => { const x = Number(val(P, k, d)); return Number.isFinite(x) ? x : d; };

  // ---------- time ----------
  // A layer's own time (s) from its start on the timeline / in the sequence; with nothing to follow it loops over
  // `loop` seconds so the preview keeps playing.
  function follows() { const L = globalThis.layer; return Boolean(L && (L.in != null || (audio.loaded && !audio.live))); }
  function clock(loop) {
    const L = globalThis.layer;
    const t = L ? L.time : performance.now() / 1000;
    if (follows()) return Math.max(0, t);
    return loop > 0 ? ((t % loop) + loop) % loop : t;
  }
  // Start times (layer-local s) for n units: on the song's hit markers, else its beats (every `every` beats),
  // else every `secs` seconds. mode: auto | markers | beats | seconds
  function beatTimes(n, { start = 0, every = 1, secs = 0.5, mode = 'auto' } = {}) {
    const L = globalThis.layer;
    const out = [];
    const song = follows() && audio.loaded && !audio.live;
    const lt = L ? L.time : 0;
    let used = 'seconds';
    if (song && (mode === 'auto' || mode === 'markers')) {
      const s0 = audio.time - lt; // the layer's start in song time
      const hits = (audio.hits?.hit || []).filter((x) => x >= s0 + start - 1e-3);
      if (hits.length) { used = 'markers'; for (let i = 0; i < Math.min(n, hits.length); i++) out.push(hits[i] - s0); }
    }
    if (out.length < n && song && (mode === 'auto' || mode === 'beats' || mode === 'markers') && audio.bpm > 0 && audio.bar > 0) {
      const spb = 60 / audio.bpm;
      const bnow = (audio.bar - 1) * audio.beatsPerBar + (audio.beatInBar - 1) + audio.beatPhase;
      const from = out.length ? out[out.length - 1] + spb * every : start;
      const b0 = Math.ceil(bnow - (lt - from) / spb - 1e-3);
      for (let k = 0; out.length < n; k++) out.push((b0 + k * every - bnow) * spb + lt);
      if (used === 'seconds') used = 'beats';
    }
    const base = out.length ? out[out.length - 1] + secs : start;
    for (let k = 0; out.length < n; k++) out.push(base + k * secs);
    out.used = used;
    return out;
  }

  // ---------- frames ----------
  // The safe area of the frame for its shape: 9:16 keeps clear of the app's buttons and captions, 16:9 title-safe.
  function safe(W, H, zone = 'safe') {
    if (zone === 'full') return { x: 0, y: 0, w: W, h: H };
    const a = W / H;
    let m;
    if (a < 0.7) m = { t: 0.13, b: 0.21, l: 0.07, r: 0.13 };
    else if (a < 0.9) m = { t: 0.08, b: 0.12, l: 0.07, r: 0.07 };
    else if (a < 1.2) m = { t: 0.08, b: 0.1, l: 0.08, r: 0.08 };
    else m = { t: 0.1, b: 0.1, l: 0.1, r: 0.1 };
    if (zone === 'title') { m = { t: m.t + 0.03, b: m.b + 0.03, l: m.l + 0.03, r: m.r + 0.03 }; }
    return { x: W * m.l, y: H * m.t, w: W * (1 - m.l - m.r), h: H * (1 - m.t - m.b) };
  }
  function canvas2d() {
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    document.body.append(cv);
    const S = { cv, g: cv.getContext('2d'), W: 1, H: 1 };
    const fit = () => { S.W = cv.width = Math.max(1, Math.round(innerWidth * devicePixelRatio)); S.H = cv.height = Math.max(1, Math.round(innerHeight * devicePixelRatio)); };
    fit();
    addEventListener('resize', fit);
    return S;
  }
  // a loop of frames drawn by fn(t) for this layer (the sandbox owns the frames: hidden / frozen layers wait)
  function every(fn) { const tick = () => { requestAnimationFrame(tick); fn(); }; requestAnimationFrame(tick); }
  function rr(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); } }
  function fillStyleOf(g, kind, color, accent, y0, y1) {
    if (kind === 'gradient') { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, color); gr.addColorStop(1, accent); return gr; }
    if (kind === 'gold') { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.45, '#ffd75e'); gr.addColorStop(0.55, '#c88a1e'); gr.addColorStop(1, '#ffe9a6'); return gr; }
    if (kind === 'chrome') { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.48, '#9aa3b5'); gr.addColorStop(0.52, '#3b4150'); gr.addColorStop(1, '#e6ebf5'); return gr; }
    if (kind === 'molten') { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.5, '#ff8c42'); gr.addColorStop(1, '#ff3b2f'); return gr; }
    return color;
  }

  // ---------- kinetic type ----------
  // Presets: unit (what animates on its own: char, word, line, all), layout (lines, stack = a word per line, solo = one
  // word at a time in the middle), stag (s between units), dur (s each unit takes), fx(p, o, c) sets o from the unit's
  // progress p (0..1, linear) and c = { t, life, gap, i, g (the glyph: relc, side, wi, iw, li) }.
  const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=<>?/';
  const TYPE = {
    'type-on': { name: 'Type on', unit: 'char', stag: 0.055, dur: 0.001, cursor: true, fx: (p, o) => { o.a = p > 0 ? 1 : 0; } },
    cascade: { name: 'Cascade', unit: 'char', stag: 0.04, dur: 0.6, fx: (p, o) => { o.a = C01(p * 3); o.y = (1 - ease('back', p)) * -0.9; } },
    split: { name: 'Split', unit: 'char', stag: 0, dur: 0.9, fx: (p, o, c) => { const e = ease('expo', p); o.x = (1 - e) * c.g.side * (1.5 + Math.abs(c.g.relc) * 0.6); o.a = C01(p * 2); } },
    slam: { name: 'Slam', unit: 'word', stag: 0.4, dur: 0.3, fx: (p, o, c) => { const e = ease('in', p); o.s = lerp(3.4, 1, e); o.a = C01(p * 5); const after = c.life - 0.3; if (after > 0) { const k = Math.exp(-after * 9) * 0.07; o.x += vnoise(c.t * 55 + c.i * 9) * k; o.y += vnoise(c.t * 61 + 3 + c.i) * k; } } },
    wave: { name: 'Wave', unit: 'char', stag: 0.045, dur: 0.6, fx: (p, o, c) => { o.a = C01(p * 2); o.y = (1 - ease('out', p)) * 0.7 + Math.sin(c.t * 4 - c.g.gi * 0.55) * 0.1 * C01(p); } },
    scramble: { name: 'Scramble', unit: 'char', stag: 0.035, dur: 0.55, fx: (p, o, c) => { if (p <= 0) { o.a = 0; return; } if (p < 1) { o.ch = GLYPHS[Math.floor(hash(Math.floor(c.life * 22) + c.g.gi * 13) * GLYPHS.length)]; o.k = 1; o.a = 0.85; } } },
    breathe: { name: 'Kerning breathe', unit: 'all', stag: 0, dur: 1.1, fx: (p, o, c) => { const spread = (1 - ease('expo', p)) * 0.9 + (Math.sin(c.t * 1.7) * 0.5 + 0.5) * 0.12; o.x = c.g.relc * spread; o.a = C01(p * 1.6); } },
    pop: { name: 'Pop', unit: 'char', stag: 0.04, dur: 0.45, fx: (p, o) => { o.s = Math.max(0, ease('back', p)); o.a = C01(p * 3); } },
    'blur-in': { name: 'Blur in', unit: 'char', stag: 0.03, dur: 0.8, fx: (p, o) => { const e = ease('out', p); o.blur = (1 - e) * 0.22; o.a = e; o.s = 1 + (1 - e) * 0.3; } },
    rise: { name: 'Rise (mask)', unit: 'line', stag: 0.14, dur: 0.75, clip: true, fx: (p, o) => { o.y = (1 - ease('expo', p)) * 1.15; } },
    flip: { name: 'Flip', unit: 'char', stag: 0.05, dur: 0.65, fx: (p, o) => { o.sy = ease('back', p); o.a = C01(p * 3); o.y = (1 - ease('out', p)) * -0.2; } },
    'tracking-in': { name: 'Tracking in', unit: 'all', stag: 0, dur: 1.3, fx: (p, o, c) => { const e = ease('expo', p); o.x = c.g.relc * (1 - e) * 1.3; o.a = ease('out', p); o.blur = (1 - e) * 0.08; } },
    glitch: { name: 'Glitch', unit: 'char', stag: 0.025, dur: 0.55, fx: (p, o, c) => { if (p <= 0) { o.a = 0; return; } if (p < 1) { const h = hash(Math.floor(c.life * 30) + c.g.gi * 7); o.x = (h - 0.5) * 0.5; o.a = h > 0.25 ? 1 : 0.2; o.rgb = 0.08; } } },
    'stagger-fade': { name: 'Stagger fade', unit: 'word', stag: 0.22, dur: 0.6, fx: (p, o) => { o.a = ease('smooth', p); o.y = (1 - ease('out', p)) * 0.3; } },
    bounce: { name: 'Bounce', unit: 'char', stag: 0.05, dur: 0.95, fx: (p, o) => { o.y = -(1 - ease('bounce', p)) * 1.6; o.a = C01(p * 4); } },
    elastic: { name: 'Elastic', unit: 'char', stag: 0.04, dur: 1.1, fx: (p, o) => { o.x = (1 - ease('elastic', p)) * -1.4; o.a = C01(p * 3); } },
    'spin-in': { name: 'Spin in', unit: 'char', stag: 0.05, dur: 0.75, fx: (p, o) => { o.r = (1 - ease('back', p)) * -Math.PI; o.s = ease('out', p); o.a = C01(p * 2); } },
    'word-by-word': { name: 'Word by word', unit: 'word', layout: 'solo', stag: 0.45, dur: 0.12, fx: (p, o, c) => { o.a = p > 0 && (c.life < c.gap || c.last) ? 1 : 0; o.s = 1 + 0.2 * Math.exp(-Math.max(0, c.life) * 11); } },
    highlight: { name: 'Highlight', unit: 'word', stag: 0.3, dur: 0.5, fx: (p, o) => { o.a = C01(p * 3); o.hl = ease('expo', p); } },
    stretch: { name: 'Stretch', unit: 'char', stag: 0.04, dur: 0.7, fx: (p, o) => { o.sy = lerp(2.4, 1, ease('elastic', p)); o.sx = lerp(0.35, 1, ease('out', p)); o.a = C01(p * 3); } },
    'outline-fill': { name: 'Outline to fill', unit: 'char', stag: 0.04, dur: 1.0, fx: (p, o) => { o.stroke = C01(p * 2.2); o.fill = C01(p * 2 - 1); o.a = 1; } },
    neon: { name: 'Neon flicker', unit: 'char', stag: 0.06, dur: 0.8, fx: (p, o, c) => { o.a = p <= 0 ? 0 : p >= 1 ? 1 : hash(Math.floor(c.life * 24) + c.g.gi * 5) > 0.45 ? 1 : 0.12; o.glow = 1.8; } },
    'zoom-through': { name: 'Zoom through', unit: 'word', layout: 'solo', stag: 0.6, dur: 0.35, fx: (p, o, c) => { const span = c.last ? Infinity : c.gap; if (p <= 0 || c.life > span) { o.a = 0; return; } o.s = lerp(0.15, 1, ease('expo', p)); o.blur = (1 - ease('out', p)) * 0.1; const out = c.last ? 0 : C01((c.life - span * 0.75) / (span * 0.25)); o.s *= 1 + ease('in', out) * 6; o.a = 1 - out; } },
    stack: { name: 'Stack', unit: 'word', layout: 'stack', stag: 0.18, dur: 0.6, fx: (p, o, c) => { o.x = (1 - ease('expo', p)) * (c.g.wi % 2 ? 2.2 : -2.2); o.a = C01(p * 3); } },
    count: { name: 'Count up', unit: 'all', stag: 0, dur: 1.6, count: true, fx: (p, o) => { o.a = C01(p * 4); o.s = 1 + 0.06 * Math.sin(C01(p) * Math.PI); } },
    marquee: { name: 'Marquee', unit: 'all', stag: 0, dur: 0.4, special: 'marquee', fx: (p, o) => { o.a = C01(p); } },
    circle: { name: 'Circle', unit: 'all', stag: 0, dur: 0.8, special: 'circle', fx: (p, o) => { o.a = C01(p); o.s = ease('back', p); } },
    wipe: { name: 'Wipe reveal', unit: 'line', stag: 0.2, dur: 0.8, clipX: true, fx: (p, o) => { o.wipe = ease('expoInOut', p); } },
    'drop-in': { name: 'Drop in', unit: 'word', stag: 0.2, dur: 0.7, fx: (p, o, c) => { o.y = -(1 - ease('back', p)) * 2.2; o.r = (1 - ease('out', p)) * 0.35 * (c.g.wi % 2 ? 1 : -1); o.a = C01(p * 3); } },
    'slide-up': { name: 'Slide up', unit: 'line', stag: 0.16, dur: 0.7, fx: (p, o) => { o.y = (1 - ease('expo', p)) * 1.2; o.a = ease('out', p); } },
    'scale-down': { name: 'Scale down', unit: 'all', stag: 0, dur: 0.9, fx: (p, o) => { const e = ease('expo', p); o.s = lerp(4, 1, e); o.a = C01(p * 2.5); o.blur = (1 - e) * 0.06; } },
    shimmer: { name: 'Shimmer', unit: 'char', stag: 0.03, dur: 0.5, fx: (p, o, c) => { o.a = ease('out', p); const band = ((c.t * 0.45) % 1.6) - 0.3; o.k = Math.max(0, 1 - Math.abs(c.g.nx - band) * 9) * C01(p); } },
    jitter: { name: 'Jitter (boil)', unit: 'char', stag: 0.03, dur: 0.4, fx: (p, o, c) => { o.a = C01(p * 2); const f = Math.floor(c.t * 8); o.x = (hash(f * 3 + c.g.gi) - 0.5) * 0.05; o.y = (hash(f * 5 + c.g.gi * 2) - 0.5) * 0.05; o.r = (hash(f * 7 + c.g.gi) - 0.5) * 0.08; } },
  };
  const EXITS = ['fade up', 'fade', 'reverse', 'drop', 'blur', 'none'];
  function layoutType(g, text, P, W, H, lay) {
    const zone = safe(W, H, val(P, 'zone', 'safe'));
    const fam = fontOf(val(P, 'font', 'Oxanium'));
    const weight = String(val(P, 'weight', '800'));
    const lineH = num(P, 'leading', 1.12);
    const track = num(P, 'tracking', 0.02);
    const kase = val(P, 'case', 'UPPER');
    let src = String(text ?? '');
    if (kase === 'UPPER') src = src.toUpperCase(); else if (kase === 'lower') src = src.toLowerCase();
    let lines = src.split(/\s*(?:\/|\n|\|)\s*/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) lines = [''];
    const words = [];
    lines.forEach((l, li) => l.split(/\s+/).filter(Boolean).forEach((w) => words.push({ w, li })));
    let rows = lay === 'stack' ? words.map((x) => x.w) : lay === 'solo' ? words.map((x) => x.w) : lines;
    if (!rows.length) rows = [''];
    g.font = `${weight} 100px ${fam}`;
    const widthAt = (s) => g.measureText(s).width + Math.max(0, Array.from(s).length - 1) * track * 100;
    const widest = Math.max(1, ...rows.map(widthAt));
    const nRows = lay === 'solo' ? 1 : rows.length;
    const want = num(P, 'size', 0.14) * Math.min(W, H) * (W < H ? 1.25 : 1);
    const size = Math.max(4, Math.min(want, (zone.w * 0.98 * 100) / widest, (zone.h * 0.92) / (nRows * lineH)));
    const blockH = nRows * size * lineH;
    const top = zone.y + (zone.h - blockH) * C01(num(P, 'y', 0.5));
    const align = val(P, 'align', 'center');
    g.font = `${weight} ${size}px ${fam}`;
    const glyphs = []; const boxes = [];
    let gi = 0;
    rows.forEach((row, ri) => {
      const chars = Array.from(row);
      const rw = g.measureText(row).width + Math.max(0, chars.length - 1) * track * size;
      const x0 = align === 'left' ? zone.x : align === 'right' ? zone.x + zone.w - rw : zone.x + (zone.w - rw) / 2;
      const li = lay === 'solo' ? 0 : ri;
      const cy = top + (li + 0.5) * size * lineH;
      boxes[ri] = { x: x0, y: cy - size * lineH * 0.5, w: rw, h: size * lineH, cx: x0 + rw / 2, cy };
      let wiBase = lay === 'lines' ? words.findIndex((x) => x.li === ri) : ri;
      let wi = wiBase; let iw = 0;
      chars.forEach((ch, k) => {
        if (ch === ' ') { wi += 1; iw = 0; return; }
        const pre = g.measureText(chars.slice(0, k).join('')).width + k * track * size;
        const w = g.measureText(ch).width;
        glyphs.push({ ch, x: x0 + pre + w / 2, y: cy, w, li: ri, wi: Math.max(0, wi), iw, gi, k, n: chars.length, relc: k - (chars.length - 1) / 2, side: k < (chars.length - 1) / 2 ? -1 : k > (chars.length - 1) / 2 ? 1 : 0, nx: W ? (x0 + pre) / W : 0 });
        iw += 1; gi += 1;
      });
    });
    return { glyphs, boxes, size, nWords: Math.max(1, words.length), fam, weight, track, zone, rows };
  }
  function type(P = {}, opts = {}) {
    const S = canvas2d();
    let key = ''; let L = null;
    every(() => {
      const { g, W, H } = S;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      const D = TYPE[val(P, 'preset', opts.preset || 'cascade')] || TYPE.cascade;
      const start = num(P, 'start', 0.2); const stag = num(P, 'stagger', D.stag); const dur = Math.max(0.001, num(P, 'speed', D.dur));
      const hold = num(P, 'hold', 2.5);
      let text = String(val(P, 'text', opts.text || 'HEARTH'));
      // count up: the numbers in the text roll up from 0 (laid out again while they roll)
      const rawT = clock(0);
      if (D.count) { const p = ease('expo', (rawT - start) / dur); text = text.replace(/\d+(?:[.,]\d+)?/g, (m) => { const v = Number(m.replace(',', '.')); const dec = (m.split(/[.,]/)[1] || '').length; return (v * p).toFixed(dec); }); }
      const lay = D.layout || 'lines';
      const k = [text, W, H, lay, val(P, 'font'), val(P, 'weight'), num(P, 'size', 0), num(P, 'tracking', 0), num(P, 'leading', 0), val(P, 'align'), val(P, 'zone'), num(P, 'y', 0), val(P, 'case')].join('|');
      if (k !== key) { L = layoutType(g, text, P, W, H, lay); key = k; }
      const { glyphs, boxes, size: em } = L;
      // unit start times: words on markers / beats when the song has them, else every `stagger` seconds
      const timing = val(P, 'timing', 'auto');
      let ws = null;
      if ((D.unit === 'word' || D.unit === 'char') && timing !== 'seconds' && follows()) { const b = beatTimes(L.nWords, { start, every: num(P, 'every', 1), secs: Math.max(0.1, stag), mode: timing }); if (b.used !== 'seconds') ws = b; }
      const unitOf = (gl) => (D.unit === 'char' ? gl.gi : D.unit === 'word' ? gl.wi : D.unit === 'line' ? gl.li : 0);
      const startOf = (gl) => {
        if (D.unit === 'char') return ws ? ws[gl.wi] + gl.iw * Math.min(stag, 0.06) : start + gl.gi * stag;
        if (D.unit === 'word') return ws ? ws[gl.wi] : start + gl.wi * stag;
        if (D.unit === 'line') return start + gl.li * stag;
        return start;
      };
      let last = start;
      for (const gl of glyphs) last = Math.max(last, startOf(gl));
      const end = last + dur;
      const loop = end + hold + 1.1;
      const t = clock(loop);
      const outAt = num(P, 'out', 0) > 0 ? num(P, 'out', 0) : follows() ? Infinity : end + hold;
      const exitK = val(P, 'exit', 'fade up');
      const ex = exitK === 'none' ? 0 : C01((t - outAt) / 0.55);
      const color = val(P, 'color', '#ffffff'); const accent = val(P, 'accent', FORGE.gold);
      const fillKind = val(P, 'fill', 'solid');
      const glow = num(P, 'glow', 0.4);
      const wordStarts = [];
      for (const gl of glyphs) if (wordStarts[gl.wi] == null) wordStarts[gl.wi] = D.unit === 'word' ? startOf(gl) : null;
      // a plate behind the words (pill / box / underline) for busy pictures
      const plate = val(P, 'plate', 'none');
      if (plate !== 'none' && glyphs.length) {
        const vis = C01((t - start) / 0.35) * (1 - ex);
        const x0 = Math.min(...boxes.map((b) => b.x)); const x1 = Math.max(...boxes.map((b) => b.x + b.w));
        const y0 = Math.min(...boxes.map((b) => b.y)); const y1 = Math.max(...boxes.map((b) => b.y + b.h));
        const pad = em * 0.35;
        g.save();
        g.globalAlpha = vis * num(P, 'plateAlpha', 0.6);
        g.fillStyle = val(P, 'plateColor', '#000000');
        if (plate === 'underline') { g.fillStyle = accent; g.globalAlpha = vis; g.fillRect(x0, y1 - em * 0.05, (x1 - x0) * ease('expo', (t - start) / 0.6), em * 0.08); }
        else { rr(g, x0 - pad, y0 - pad * 0.4, (x1 - x0) + pad * 2, (y1 - y0) + pad * 0.8, plate === 'pill' ? 999 : em * 0.12); g.fill(); }
        g.restore();
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${L.weight} ${em}px ${L.fam}`;
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      if (D.special === 'marquee') { drawMarquee(g, L, P, t, start, W, color, accent, fillKind, glow, em); return; }
      if (D.special === 'circle') { drawCircle(g, L, P, t, start, dur, W, H, color, accent, glow, em); return; }
      const o = {};
      let cursorAt = null;
      for (const gl of glyphs) {
        const s0 = startOf(gl);
        const life = t - s0;
        let p = C01(life / dur);
        if (exitK === 'reverse' && ex > 0) p = Math.min(p, 1 - ex);
        Object.assign(o, { a: 1, x: 0, y: 0, s: 1, sx: 1, sy: 1, r: 0, blur: 0, ch: null, k: 0, hl: 0, stroke: 0, fill: 1, glow: 1, rgb: 0, wipe: 1 });
        const ws1 = wordStarts[gl.wi + 1];
        const isLast = D.unit === 'word' ? gl.wi === L.nWords - 1 : true;
        D.fx(p, o, { t, life, gap: ws1 != null ? ws1 - s0 : hold, i: unitOf(gl), g: gl, last: isLast });
        if (ex > 0 && exitK !== 'reverse') {
          const e = ease('in', ex);
          if (exitK === 'fade up') { o.a *= 1 - e; o.y -= e * 0.5; }
          else if (exitK === 'fade') o.a *= 1 - e;
          else if (exitK === 'drop') { const d = C01(ex * 1.4 - hash(gl.gi) * 0.4); o.y += d * d * 6; o.r += d * (hash(gl.gi + 3) - 0.5) * 2; o.a *= 1 - C01(d * 1.5 - 0.5); }
          else if (exitK === 'blur') { o.blur += e * 0.25; o.a *= 1 - e; }
        }
        if (o.a <= 0.003 || o.s <= 0.001 || o.sy <= 0.001) continue;
        const box = boxes[gl.li];
        const ux = D.unit === 'char' ? gl.x : D.unit === 'line' || D.unit === 'all' ? (D.unit === 'all' ? (L.zone.x + L.zone.w / 2) : box.cx) : wordCenter(L, gl);
        const uy = D.unit === 'all' ? boxes.reduce((s, b) => s + b.cy, 0) / boxes.length : box.cy;
        g.save();
        if (D.clip) { g.beginPath(); g.rect(box.x - em, box.y, box.w + em * 2, box.h); g.clip(); }
        if (D.clipX) { g.beginPath(); g.rect(box.x - em * 0.2, box.y, (box.w + em * 0.4) * o.wipe, box.h); g.clip(); }
        g.translate(ux + o.x * em, uy + o.y * em);
        if (o.r) g.rotate(o.r);
        g.scale(o.s * o.sx, o.s * o.sy);
        g.globalAlpha = C01(o.a);
        if (o.blur > 0.004) g.filter = `blur(${(o.blur * em).toFixed(1)}px)`;
        const dx = gl.x - ux; const dy = gl.y - uy;
        const ch = o.ch || gl.ch;
        if (o.hl > 0 && gl.iw === 0) { const wc = wordBox(L, gl); g.save(); g.globalAlpha = C01(o.a) * 0.9; g.fillStyle = accent; g.fillRect(wc.x - ux - em * 0.1, dy - em * 0.42, (wc.w + em * 0.2) * o.hl, em * 0.84); g.restore(); }
        if (glow > 0) { g.shadowColor = accent; g.shadowBlur = glow * em * 0.45 * o.glow; }
        const fs = fillStyleOf(g, o.k > 0.5 ? 'solid' : fillKind, o.k > 0.5 ? accent : color, accent, dy - em * 0.5, dy + em * 0.5);
        if (o.rgb) { g.globalCompositeOperation = 'lighter'; g.fillStyle = '#ff0040'; g.fillText(ch, dx - o.rgb * em, dy); g.fillStyle = '#00e0ff'; g.fillText(ch, dx + o.rgb * em, dy); g.globalCompositeOperation = 'source-over'; }
        if (fillKind === 'outline' || o.stroke < 1 || o.fill < 1) {
          g.lineWidth = Math.max(1, em * 0.035); g.strokeStyle = o.k > 0.5 ? accent : color;
          if (o.stroke > 0) { g.globalAlpha = C01(o.a) * o.stroke; g.strokeText(ch, dx, dy); }
          if (fillKind !== 'outline' && o.fill > 0) { g.globalAlpha = C01(o.a) * o.fill; g.fillStyle = fs; g.fillText(ch, dx, dy); }
        } else { g.fillStyle = fs; g.fillText(ch, dx, dy); }
        g.restore();
        if (D.cursor && p > 0) cursorAt = gl;
      }
      // the typewriter's caret blinks after the last letter typed
      if (D.cursor && glyphs.length && ex < 1) {
        const gl = cursorAt; const box = boxes[gl ? gl.li : 0];
        const x = gl ? gl.x + gl.w / 2 + em * 0.06 : box.x; const on = Math.floor(t * 2.2) % 2 === 0 || (gl && t - startOf(gl) < 0.4 && cursorAt !== glyphs[glyphs.length - 1]);
        if (on) { g.save(); g.globalAlpha = 1 - ex; g.fillStyle = accent; g.fillRect(x, box.cy - em * 0.42, em * 0.07, em * 0.84); g.restore(); }
      }
    });
    return { canvas: S.cv };
  }
  function wordBox(L, gl) {
    const list = L.glyphs.filter((x) => x.wi === gl.wi && x.li === gl.li);
    const x0 = Math.min(...list.map((x) => x.x - x.w / 2)); const x1 = Math.max(...list.map((x) => x.x + x.w / 2));
    return { x: x0, w: x1 - x0 };
  }
  function wordCenter(L, gl) { const b = wordBox(L, gl); return b.x + b.w / 2; }
  function drawMarquee(g, L, P, t, start, W, color, accent, fillKind, glow, em) {
    const text = L.rows.join('  •  ') + '  •  ';
    const w = g.measureText(text).width;
    const sp = num(P, 'stagger', 0.35) * 600 * devicePixelRatio;
    const y = L.boxes[0]?.cy ?? L.zone.y + L.zone.h / 2;
    g.globalAlpha = C01((t - start) / 0.4);
    g.fillStyle = fillStyleOf(g, fillKind, color, accent, y - em / 2, y + em / 2);
    if (glow > 0) { g.shadowColor = accent; g.shadowBlur = glow * em * 0.4; }
    g.textAlign = 'left';
    let x = -((t * sp) % w);
    while (x < W) { g.fillText(text, x, y); x += w; }
  }
  function drawCircle(g, L, P, t, start, dur, W, H, color, accent, glow, em) {
    const text = `${L.rows.join(' • ')} • `;
    const chars = Array.from(text);
    const R = Math.min(L.zone.w, L.zone.h) * 0.36;
    const cx = L.zone.x + L.zone.w / 2; const cy = L.zone.y + L.zone.h * C01(num(P, 'y', 0.5));
    const p = C01((t - start) / dur);
    const fs = Math.min(em, (Math.PI * 2 * R) / Math.max(8, chars.length) * 1.35);
    g.font = `${L.weight} ${fs}px ${L.fam}`;
    g.globalAlpha = p;
    g.fillStyle = color;
    if (glow > 0) { g.shadowColor = accent; g.shadowBlur = glow * fs * 0.4; }
    const spin = t * num(P, 'stagger', 0.35) * 0.6;
    chars.forEach((ch, i) => {
      const a = (i / chars.length) * Math.PI * 2 + spin;
      g.save(); g.translate(cx + Math.cos(a) * R * ease('back', p), cy + Math.sin(a) * R * ease('back', p)); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    });
  }

  // ---------- Hearth's own UI, drawn (when there's no capture yet, and for exploding a screen into its parts) ----------
  // mock(kind, w, h, part): part = undefined (everything) | 0 background + rail | 1 panels | 2 content | 3 accents
  const MOCKS = ['chat', 'lab', 'board', 'editor', 'nodes', 'jam', 'phone'];
  function bars(g, x, y, w, n, h, gap, col, alpha = 1, seed = 1) {
    g.fillStyle = col; g.globalAlpha = alpha;
    for (let i = 0; i < n; i++) { const ww = w * (0.45 + hash(seed * 31 + i) * 0.55); rr(g, x, y + i * (h + gap), ww, h, h / 2); g.fill(); }
    g.globalAlpha = 1;
  }
  function label(g, text, x, y, size, col, weight = 700) { g.font = `${weight} ${size}px ${FONTS.Oxanium}`; g.fillStyle = col; g.textBaseline = 'middle'; g.fillText(text, x, y); }
  function railAndFrame(g, w, h, part) {
    if (part == null || part === 0) {
      const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#0d0f15'); bg.addColorStop(1, '#151021');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a0b10'; g.fillRect(0, 0, w * 0.06, h);
      const icons = [FORGE.gold, FORGE.ember, FORGE.violet, FORGE.blue, '#7cd992', '#f5a3d0'];
      icons.forEach((c, i) => { const s = w * 0.03; const x = w * 0.015; const y = h * 0.06 + i * s * 1.9; rr(g, x, y, s, s, s * 0.3); g.fillStyle = i === 0 ? c : '#1d2029'; g.fill(); g.strokeStyle = c; g.lineWidth = Math.max(1, s * 0.08); g.stroke(); });
      g.fillStyle = '#12141b'; g.fillRect(w * 0.06, 0, w * 0.94, h * 0.055);
      label(g, 'Hearth', w * 0.075, h * 0.028, h * 0.026, '#e8e2d6');
    }
  }
  function mock(kind, w, h, part) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const P1 = part == null || part === 1; const P2 = part == null || part === 2; const P3 = part == null || part === 3;
    if (kind === 'phone') return phoneMock(c, g, w, h, part);
    railAndFrame(g, w, h, part);
    const X = w * 0.075; const Y = h * 0.085; const CW = w * 0.9; const CH = h * 0.88;
    if (kind === 'chat' || kind === 'jam') {
      if (P1) { g.fillStyle = '#11131a'; rr(g, X, Y, CW * 0.22, CH, 14); g.fill(); g.fillStyle = '#161922'; rr(g, X + CW * 0.24, Y, CW * 0.76, CH, 14); g.fill(); rr(g, X + CW * 0.27, Y + CH * 0.86, CW * 0.7, CH * 0.1, 18); g.fillStyle = '#1e2230'; g.fill(); }
      if (P2) {
        for (let i = 0; i < 7; i++) { const y = Y + 18 + i * CH * 0.12; g.fillStyle = i === 1 ? '#2a2414' : '#161922'; rr(g, X + 10, y, CW * 0.2, CH * 0.09, 10); g.fill(); bars(g, X + 22, y + 12, CW * 0.14, 2, 9, 9, '#8a8fa3', 0.7, i + 3); }
        const bx = X + CW * 0.27; const bw = CW * 0.66;
        const msgs = kind === 'jam' ? [['Claude', FORGE.ember, 0], ['Astra', FORGE.violet, 1], ['Claude', FORGE.ember, 0], ['Astra', FORGE.violet, 1]] : [['You', FORGE.gold, 2], ['Claude', FORGE.ember, 0], ['Astra', FORGE.violet, 1], ['You', FORGE.gold, 2]];
        msgs.forEach(([who, col, side], i) => {
          const y = Y + 30 + i * CH * 0.2; const right = side === 2; const ww = bw * (right ? 0.55 : 0.78); const x = right ? bx + bw - ww + 20 : bx;
          g.fillStyle = right ? '#2b2617' : '#1c2030'; rr(g, x, y, ww, CH * 0.16, 16); g.fill();
          g.strokeStyle = col; g.globalAlpha = 0.6; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
          label(g, who, x + 18, y + 20, CH * 0.03, col);
          bars(g, x + 18, y + 38, ww - 40, 3, 10, 10, '#c9c6bd', 0.75, i * 5 + 1);
        });
      }
      if (P3) { g.fillStyle = FORGE.gold; rr(g, X + CW * 0.88, Y + CH * 0.875, CW * 0.075, CH * 0.075, 14); g.fill(); g.fillStyle = FORGE.violet; g.globalAlpha = 0.8; rr(g, X + CW * 0.28, Y + CH * 0.8, CW * 0.16, CH * 0.045, 20); g.fill(); g.globalAlpha = 1; label(g, '✦ Astra decides', X + CW * 0.29, Y + CH * 0.823, CH * 0.022, '#140f20'); }
    } else if (kind === 'lab') {
      const pw = CW * 0.66; const ph = CH * 0.66;
      if (P1) { g.fillStyle = '#05060a'; rr(g, X, Y, pw, ph, 12); g.fill(); g.fillStyle = '#12141b'; rr(g, X + pw + 14, Y, CW - pw - 14, CH, 12); g.fill(); g.fillStyle = '#0f1117'; rr(g, X, Y + ph + 14, pw, CH - ph - 14, 12); g.fill(); }
      if (P2) {
        const cx = X + pw / 2; const cy = Y + ph / 2;
        for (let i = 8; i > 0; i--) { g.strokeStyle = [FORGE.gold, FORGE.ember, FORGE.violet, FORGE.blue][i % 4]; g.globalAlpha = 0.25 + i * 0.07; g.lineWidth = 6; g.beginPath(); g.ellipse(cx, cy, pw * 0.05 * i, ph * 0.05 * i * 0.9, i * 0.3, 0, Math.PI * 2); g.stroke(); }
        g.globalAlpha = 1;
        const wy = Y + ph + 14 + (CH - ph - 14) / 2;
        for (let i = 0; i < 90; i++) { const a = Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.13)) * (CH - ph) * 0.35 + 3; g.fillStyle = i % 8 === 0 ? FORGE.ember : '#6a7290'; g.fillRect(X + 10 + i * (pw - 20) / 90, wy - a, (pw - 20) / 90 * 0.6, a * 2); }
        for (let i = 0; i < 9; i++) { const y = Y + 30 + i * CH * 0.1; label(g, ['Particles', 'Formation', 'Colors', 'Music', 'Material', 'Speed', 'Glow', 'Size', 'Spin'][i], X + pw + 30, y, CH * 0.026, '#c9c6bd', 600); g.fillStyle = '#262a36'; rr(g, X + pw + 30, y + 16, CW - pw - 60, 8, 4); g.fill(); g.fillStyle = FORGE.gold; rr(g, X + pw + 30, y + 16, (CW - pw - 60) * (0.25 + hash(i) * 0.7), 8, 4); g.fill(); }
      }
      if (P3) { g.fillStyle = '#ff4d4d'; g.fillRect(X + pw * 0.42, Y + ph + 18, 3, CH - ph - 22); g.fillStyle = FORGE.gold; rr(g, X + pw + 30, Y + CH - 70, (CW - pw - 60) * 0.45, 46, 12); g.fill(); label(g, 'Save', X + pw + 50, Y + CH - 47, CH * 0.03, '#1a1408'); }
    } else if (kind === 'board') {
      if (P1) { g.fillStyle = '#0f1016'; rr(g, X, Y, CW, CH, 14); g.fill(); g.fillStyle = '#23263a'; for (let i = 0; i < 40; i++) for (let j = 0; j < 24; j++) g.fillRect(X + 20 + i * CW / 40, Y + 20 + j * CH / 24, 2, 2); }
      if (P2) {
        const tiles = [[0.04, 0.06, 0.26, 0.34], [0.33, 0.1, 0.22, 0.42], [0.58, 0.05, 0.36, 0.28], [0.06, 0.48, 0.3, 0.4], [0.4, 0.58, 0.2, 0.3], [0.63, 0.4, 0.3, 0.5]];
        const cols = [[FORGE.violet, FORGE.blue], [FORGE.ember, FORGE.flame], ['#1b0f3b', FORGE.gold], ['#0b3a4a', '#48ddff'], [FORGE.gold, '#fff3c4'], ['#3a0b2a', '#f5a3d0']];
        tiles.forEach(([x, y, tw, th], i) => { const gr = g.createLinearGradient(X + x * CW, Y + y * CH, X + (x + tw) * CW, Y + (y + th) * CH); gr.addColorStop(0, cols[i][0]); gr.addColorStop(1, cols[i][1]); g.fillStyle = gr; rr(g, X + x * CW, Y + y * CH, tw * CW, th * CH, 10); g.fill(); });
      }
      if (P3) { g.fillStyle = '#ffe98a'; rr(g, X + CW * 0.42, Y + CH * 0.42, CW * 0.14, CH * 0.13, 6); g.fill(); bars(g, X + CW * 0.43, Y + CH * 0.45, CW * 0.1, 3, 7, 8, '#5a4a10', 0.9, 7); g.strokeStyle = FORGE.gold; g.lineWidth = 4; rr(g, X + CW * 0.57, Y + CH * 0.04, CW * 0.38, CH * 0.3, 12); g.stroke(); }
    } else if (kind === 'editor') {
      const mh = CH * 0.55;
      if (P1) { g.fillStyle = '#05060a'; rr(g, X + CW * 0.2, Y, CW * 0.6, mh, 10); g.fill(); g.fillStyle = '#10121a'; rr(g, X, Y + mh + 14, CW, CH - mh - 14, 10); g.fill(); }
      if (P2) {
        const gr = g.createLinearGradient(X + CW * 0.2, Y, X + CW * 0.8, Y + mh); gr.addColorStop(0, '#2a0f45'); gr.addColorStop(1, FORGE.ember); g.fillStyle = gr; rr(g, X + CW * 0.2 + 10, Y + 10, CW * 0.6 - 20, mh - 20, 6); g.fill();
        label(g, 'HEARTH', X + CW * 0.42, Y + mh * 0.5, mh * 0.12, '#fff', 800);
        const ty = Y + mh + 40; const cols = [FORGE.violet, FORGE.blue, FORGE.gold, '#7cd992'];
        for (let r = 0; r < 4; r++) { let x = X + 20; for (let k = 0; k < 6; k++) { const ww = CW * (0.08 + hash(r * 10 + k) * 0.12); g.fillStyle = cols[r]; g.globalAlpha = 0.85; rr(g, x, ty + r * (CH - mh) * 0.2, ww, (CH - mh) * 0.15, 6); g.fill(); x += ww + 6; if (x > X + CW - 40) break; } }
        g.globalAlpha = 1;
      }
      if (P3) { g.fillStyle = '#ff4d4d'; g.fillRect(X + CW * 0.46, Y + mh + 16, 3, CH - mh - 20); g.beginPath(); g.moveTo(X + CW * 0.46 - 8, Y + mh + 16); g.lineTo(X + CW * 0.46 + 11, Y + mh + 16); g.lineTo(X + CW * 0.46 + 1.5, Y + mh + 30); g.fill(); }
    } else if (kind === 'nodes') {
      if (P1) { g.fillStyle = '#0c0d13'; rr(g, X, Y, CW, CH, 12); g.fill(); g.strokeStyle = '#191c27'; g.lineWidth = 1; for (let i = 0; i < 30; i++) { g.beginPath(); g.moveTo(X + i * CW / 30, Y); g.lineTo(X + i * CW / 30, Y + CH); g.stroke(); } }
      const nodes = [[0.06, 0.1, FORGE.blue, 'Time'], [0.06, 0.55, FORGE.violet, 'Palette'], [0.36, 0.25, FORGE.gold, 'Particles'], [0.36, 0.65, '#7cd992', 'Spin'], [0.68, 0.4, FORGE.ember, 'Output']];
      if (P2) {
        g.lineWidth = 4;
        [[0, 2], [1, 2], [2, 4], [3, 4], [1, 3]].forEach(([a, b], i) => { const A = nodes[a]; const B = nodes[b]; const x0 = X + (A[0] + 0.22) * CW; const y0 = Y + (A[1] + 0.12) * CH; const x1 = X + B[0] * CW; const y1 = Y + (B[1] + 0.12) * CH; g.strokeStyle = A[2]; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + 90, y0, x1 - 90, y1, x1, y1); g.stroke(); });
        g.globalAlpha = 1;
        nodes.forEach(([x, y, col, name], i) => { g.fillStyle = '#171a24'; rr(g, X + x * CW, Y + y * CH, CW * 0.22, CH * 0.26, 10); g.fill(); g.fillStyle = col; rr(g, X + x * CW, Y + y * CH, CW * 0.22, CH * 0.06, 10); g.fill(); label(g, name, X + x * CW + 12, Y + y * CH + CH * 0.03, CH * 0.03, '#11131a'); bars(g, X + x * CW + 12, Y + y * CH + CH * 0.09, CW * 0.16, 3, 8, 12, '#8a8fa3', 0.8, i + 11); });
      }
      if (P3) nodes.forEach(([x, y, col]) => { g.fillStyle = col; g.beginPath(); g.arc(X + (x + 0.22) * CW, Y + (y + 0.12) * CH, 7, 0, Math.PI * 2); g.fill(); });
    }
    return c;
  }
  function phoneMock(c, g, w, h, part) {
    const all = part == null;
    if (all || part === 0) { const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#120e1c'); bg.addColorStop(1, '#0b0c12'); g.fillStyle = bg; g.fillRect(0, 0, w, h); label(g, 'Hearth', w * 0.08, h * 0.06, h * 0.025, '#e8e2d6'); }
    if (all || part === 1) { g.fillStyle = '#1e2230'; rr(g, w * 0.05, h * 0.9, w * 0.9, h * 0.06, 30); g.fill(); }
    if (all || part === 2) [['You', FORGE.gold, 1], ['Claude', FORGE.ember, 0], ['Astra', FORGE.violet, 0], ['You', FORGE.gold, 1]].forEach(([who, col, right], i) => {
      const ww = w * (right ? 0.62 : 0.8); const x = right ? w * 0.95 - ww : w * 0.05; const y = h * 0.12 + i * h * 0.19;
      g.fillStyle = right ? '#2b2617' : '#1c2030'; rr(g, x, y, ww, h * 0.15, 22); g.fill(); label(g, who, x + 20, y + 26, h * 0.022, col); bars(g, x + 20, y + 48, ww - 40, 3, 11, 12, '#c9c6bd', 0.75, i * 3 + 2);
    });
    if (all || part === 3) { g.fillStyle = FORGE.gold; g.beginPath(); g.arc(w * 0.87, h * 0.93, h * 0.024, 0, Math.PI * 2); g.fill(); }
    return c;
  }

  // ---------- the 3D stage (UI cards, devices, 3D type and logos share it) ----------
  // A camera layer above publishes a rig (globalThis.__motionRig); stages follow it unless "Follow the camera" is off.
  const DEG = Math.PI / 180;
  const stages = (globalThis.__motionStages ||= new Map());
  function stage3d() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 400);
    scene.add(new THREE.HemisphereLight('#fff4e6', '#1c1428', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.8); sun.position.set(3, 5, 7); scene.add(sun);
    const rim = new THREE.DirectionalLight(FORGE.ember, 1.2); rim.position.set(-6, 2, -4); scene.add(rim);
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    const id = globalThis.layer?.id || 'main';
    stages.set(id, renderer.domElement);
    return { renderer, scene, camera, id, look: new THREE.Vector3(), base: { d: 10, fov: 30 } };
  }
  const shown = (el) => Boolean(el && el.isConnected && el.closest('.lab-layer')?.style.display !== 'none');
  // the camera rig's pose now (null: no camera layer, or it isn't on)
  function rigPose() {
    const r = globalThis.__motionRig;
    if (!r || !shown(r.el)) return null;
    const L = globalThis.layer;
    try { return r.pose(L ? L.clock ?? L.time : performance.now() / 1000); } catch { return null; }
  }
  // place the stage's camera: far enough that a w × h box fits the frame, then the rig's move (or the layout's own)
  function placeCamera(R, w, h, P, own = null, dFix = 0) {
    const cam = R.camera;
    const tan = Math.tan((R.base.fov * DEG) / 2);
    const d = dFix || Math.max(h / 2 / tan, w / 2 / (tan * cam.aspect)) * (1.12 / Math.max(0.2, num(P, 'size', 1)));
    R.base.d = d;
    const follow = val(P, 'follow', true) !== false && val(P, 'follow', true) !== 'off';
    // the layout's own move (world units) and the rig's (x / y in tenths of the camera distance)
    const rig = (follow && rigPose()) || {};
    const pose = { x: 0, y: 0, dolly: 0, orbit: 0, tilt: 0, roll: 0, fov: 1, lx: 0, ly: 0, focus: null, aperture: 0, mblur: 0, ...rig };
    const k = d * 0.1;
    const ox = (own?.x || 0) + (rig.x || 0) * k; const oy = (own?.y || 0) + (rig.y || 0) * k;
    const pos = new THREE.Vector3(0, 0, d);
    pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), -pose.tilt * DEG);
    pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.orbit * DEG);
    pos.multiplyScalar(Math.max(0.05, 1 - pose.dolly));
    const look = R.look.set(ox + pose.lx * k, oy + pose.ly * k, 0);
    cam.position.copy(pos).add(new THREE.Vector3(ox, oy, 0));
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    if (pose.roll) cam.rotateZ(pose.roll * DEG);
    const fov = R.base.fov * pose.fov;
    if (Math.abs(cam.fov - fov) > 1e-4) { cam.fov = fov; cam.updateProjectionMatrix(); }
    return pose;
  }
  // depth of field: how soft something at world depth z is (the layer's own focus + the rig's rack focus)
  function dofBlur(pose, P, z) {
    const ap = num(P, 'dof', 0) + (pose.aperture || 0);
    if (ap <= 0) return pose.mblur || 0;
    const fz = pose.focus != null ? pose.focus : num(P, 'focus', 0);
    return C01(Math.abs(z - fz) * ap * 0.45) + (pose.mblur || 0);
  }
  const CARD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const CARD_FS = 'uniform sampler2D map; uniform sampler2D soft; uniform float blur; uniform float opacity; varying vec2 vUv; void main() { vec4 a = texture2D(map, vUv); vec4 b = texture2D(soft, vUv); vec4 c = mix(a, b, clamp(blur, 0.0, 1.0)); gl_FragColor = vec4(c.rgb, c.a * opacity); gl_FragColor = linearToOutputTexel(gl_FragColor); }';
  function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function roundedShape(w, h, r) {
    const s = new THREE.Shape(); const x = -w / 2; const y = -h / 2; r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // device frames: canvas size, the screen inside it, corner radius (px), world width
  const FRAMES = {
    none: { cw: 1280, ch: 800, sx: 0, sy: 0, sw: 1280, sh: 800, r: 30, w: 4 },
    glass: { cw: 1300, ch: 820, sx: 10, sy: 10, sw: 1280, sh: 800, r: 34, w: 4 },
    browser: { cw: 1280, ch: 864, sx: 0, sy: 64, sw: 1280, sh: 800, r: 26, w: 4 },
    laptop: { cw: 1320, ch: 860, sx: 20, sy: 22, sw: 1280, sh: 800, r: 26, w: 4 },
    tablet: { cw: 1300, ch: 940, sx: 50, sy: 50, sw: 1200, sh: 840, r: 64, w: 3.6 },
    phone: { cw: 780, ch: 1600, sx: 36, sy: 36, sw: 708, sh: 1528, r: 112, w: 1.9 },
  };
  // a picture source: 'mock:<kind>' (Hearth drawn), a reference name (refs: a capture of Hearth), else a drawing
  function source(src, frame) {
    const F = FRAMES[frame] || FRAMES.none;
    const portrait = F.sh > F.sw;
    const s = String(src || 'mock:chat');
    const mk = (kind) => { const k = portrait && kind !== 'phone' ? 'phone' : kind; return { img: mock(k, F.sw, F.sh), ready: true, mock: k }; };
    if (s.startsWith('mock:')) return mk(s.slice(5));
    const url = globalThis.refs?.[s];
    if (!url) return { ...mk('chat'), missing: s };
    const S = { img: null, ready: false, ref: s };
    const im = new Image();
    im.onload = () => { S.img = im; S.ready = true; S.changed = true; };
    im.onerror = () => { const v = document.createElement('video'); Object.assign(v, { src: url, muted: true, loop: true, playsInline: true }); v.oncanplay = () => { S.img = v; S.ready = true; S.video = true; S.changed = true; }; v.play().catch(() => {}); };
    im.src = url;
    return S;
  }
  function drawCover(g, img, x, y, w, h, crop = null) {
    const iw = img.videoWidth || img.naturalWidth || img.width; const ih = img.videoHeight || img.naturalHeight || img.height;
    if (!iw || !ih) return;
    let sx = 0; let sy = 0; let sw = iw; let sh = ih;
    if (crop) { sx = crop[0] * iw; sy = crop[1] * ih; sw = crop[2] * iw; sh = crop[3] * ih; }
    const k = Math.max(w / sw, h / sh);
    const dw = sw * k; const dh = sh * k;
    g.drawImage(img, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  // draws a card's face: the frame (bezel, browser bar, glass edge) and the picture (or one part of it)
  function paintFace(g, F, frame, S, P, part = null) {
    const { cw, ch, sx, sy, sw, sh } = F;
    const r = F.r * num(P, 'radius', 1);
    g.clearRect(0, 0, cw, ch);
    if (part == null || part === 0) {
      if (frame === 'laptop' || frame === 'phone' || frame === 'tablet') { rr(g, 0, 0, cw, ch, r + (frame === 'laptop' ? 10 : 30)); g.fillStyle = '#07080b'; g.fill(); g.strokeStyle = '#2b2f3a'; g.lineWidth = 4; g.stroke(); }
      if (frame === 'browser') { rr(g, 0, 0, cw, ch, r); g.fillStyle = '#17191f'; g.fill(); ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(34 + i * 30, 32, 9, 0, Math.PI * 2); g.fill(); }); g.fillStyle = '#23262f'; rr(g, cw * 0.3, 14, cw * 0.4, 36, 18); g.fill(); label(g, 'hearth', cw * 0.47, 33, 20, '#a9adbb', 600); }
    }
    g.save();
    rr(g, sx, sy, sw, sh, frame === 'browser' ? 0 : r);
    if (frame === 'browser') { g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + sw, sy); g.lineTo(sx + sw, sy + sh - r); g.quadraticCurveTo(sx + sw, sy + sh, sx + sw - r, sy + sh); g.lineTo(sx + r, sy + sh); g.quadraticCurveTo(sx, sy + sh, sx, sy + sh - r); g.closePath(); }
    g.clip();
    if (S.ready && S.img) {
      if (part != null && S.mock) g.drawImage(mock(S.mock, sw, sh, part), sx, sy, sw, sh);
      else if (part != null) {
        // a capture explodes into its likely parts: the whole (dimmed), the side bar, the main panel, the title bar
        const crops = [null, [0, 0, 0.22, 1], [0.24, 0.1, 0.72, 0.84], [0, 0, 1, 0.09]];
        const cr = crops[part] || null;
        if (!cr) { drawCover(g, S.img, sx, sy, sw, sh); if (part === 0) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(sx, sy, sw, sh); } }
        else { const [cx, cy, cwf, chf] = cr; const iw = S.img.naturalWidth || S.img.videoWidth; const ih = S.img.naturalHeight || S.img.videoHeight; const k = Math.max(sw / iw, sh / ih); const ox = sx + (sw - iw * k) / 2; const oy = sy + (sh - ih * k) / 2; g.drawImage(S.img, cx * iw, cy * ih, cwf * iw, chf * ih, ox + cx * iw * k, oy + cy * ih * k, cwf * iw * k, chf * ih * k); g.strokeStyle = 'rgba(255,215,94,0.6)'; g.lineWidth = 3; g.strokeRect(ox + cx * iw * k, oy + cy * ih * k, cwf * iw * k, chf * ih * k); }
      } else drawCover(g, S.img, sx, sy, sw, sh);
    }
    if (frame === 'glass' && (part == null || part === 3)) {
      const gr = g.createLinearGradient(0, 0, cw * 0.6, ch); gr.addColorStop(0, 'rgba(255,255,255,0.20)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(sx, sy, sw, sh);
    }
    g.restore();
    if (frame === 'glass' && (part == null || part === 3)) { rr(g, 4, 4, cw - 8, ch - 8, r + 6); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 5; g.stroke(); rr(g, 10, 10, cw - 20, ch - 20, r); g.strokeStyle = 'rgba(255,215,94,0.35)'; g.lineWidth = 2; g.stroke(); }
    if (frame === 'phone' && (part == null || part === 3)) { g.fillStyle = '#07080b'; rr(g, cw / 2 - 90, sy + 18, 180, 46, 23); g.fill(); }
    if (frame === 'laptop' && (part == null || part === 3)) { g.fillStyle = '#1b1e26'; g.beginPath(); g.arc(cw / 2, 11, 4, 0, Math.PI * 2); g.fill(); }
  }
  // a card: face (sharp + soft for depth of field), an optional slab behind it (depth), a soft shadow
  function makeCard(R, src, frame, P, { part = null, slab = true, shadow = true, F: own = null } = {}) {
    const F = own || FRAMES[frame] || FRAMES.none;
    const S = typeof src === 'object' && src?.img !== undefined ? src : source(src, frame);
    const c = document.createElement('canvas'); c.width = F.cw; c.height = F.ch;
    const s = document.createElement('canvas'); s.width = Math.round(F.cw / 4); s.height = Math.round(F.ch / 4);
    const map = canvasTex(c); const soft = canvasTex(s);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: map }, soft: { value: soft }, blur: { value: 0 }, opacity: { value: 1 } }, vertexShader: CARD_VS, fragmentShader: CARD_FS, transparent: true, depthWrite: part == null });
    const w = F.w; const h = (F.w * F.ch) / F.cw;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const group = new THREE.Group();
    group.add(face);
    let slabMat = null; let shMat = null;
    const thick = num(P, 'thickness', 0.06) * (frame === 'none' ? 0.6 : 1);
    if (slab && part == null && thick > 0.001) {
      slabMat = new THREE.MeshStandardMaterial({ color: frame === 'glass' ? '#2a2d38' : '#16181f', metalness: 0.55, roughness: 0.32, transparent: true });
      const geo = new THREE.ExtrudeGeometry(roundedShape(w * 0.995, h * 0.995, (F.r / F.cw) * w * num(P, 'radius', 1) * 1.1), { depth: thick, bevelEnabled: false, curveSegments: 6 });
      const m = new THREE.Mesh(geo, slabMat); m.position.z = -thick - 0.002; group.add(m);
    }
    if (shadow && part == null) {
      const sc = document.createElement('canvas'); sc.width = 256; sc.height = Math.max(64, Math.round(256 * h / w));
      const sg = sc.getContext('2d'); sg.filter = 'blur(14px)'; sg.fillStyle = 'rgba(0,0,0,0.85)'; rr(sg, 34, 34, sc.width - 68, sc.height - 68, 18); sg.fill();
      shMat = new THREE.MeshBasicMaterial({ map: canvasTex(sc), transparent: true, depthWrite: false, opacity: 0.6 });
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, h * 1.25), shMat); sh.position.set(w * 0.04, -h * 0.08, -0.25 - thick); group.add(sh);
    }
    const ctx = c.getContext('2d'); const sctx = s.getContext('2d');
    let painted = false;
    const card = {
      group, face, w, h, S, F, frame, part,
      paint() {
        paintFace(ctx, F, frame, S, P, part);
        sctx.clearRect(0, 0, s.width, s.height);
        if ('filter' in sctx) sctx.filter = 'blur(5px)';
        sctx.drawImage(c, 0, 0, s.width, s.height);
        sctx.filter = 'none';
        map.needsUpdate = true; soft.needsUpdate = true; painted = true;
      },
      tick() { if (!painted || S.changed || (S.video && S.ready)) { S.changed = false; card.paint(); } },
      set(o, blur) {
        const root = card.root || group;
        root.position.set(o.x, o.y, o.z); root.rotation.set(o.rx, o.ry, o.rz); root.scale.setScalar(Math.max(1e-4, o.s));
        mat.uniforms.opacity.value = C01(o.a); mat.uniforms.blur.value = C01(blur);
        if (slabMat) { slabMat.opacity = C01(o.a); slabMat.visible = o.a > 0.01; }
        if (shMat) shMat.opacity = C01(o.a) * 0.55 * num(P, 'shadow', 1);
        root.visible = o.a > 0.003;
      },
      dispose() { (card.root || group).traverse((x) => { x.geometry?.dispose(); x.material?.map?.dispose?.(); x.material?.dispose?.(); }); map.dispose(); soft.dispose(); },
    };
    return card;
  }
  // the laptop's keyboard half (a deck with keys and a trackpad), hinged at the screen's bottom edge
  function laptopBase(w, h) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 640); gr.addColorStop(0, '#2b2f39'); gr.addColorStop(1, '#1a1c23');
    rr(g, 0, 0, 1024, 640, 40); g.fillStyle = gr; g.fill();
    g.fillStyle = '#0d0e12';
    for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) { rr(g, 70 + k * 63, 40 + r * 62, 54, 52, 8); g.fill(); }
    rr(g, 360, 380, 300, 200, 18); g.fillStyle = '#252831'; g.fill();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.08, h * 0.68), new THREE.MeshStandardMaterial({ map: canvasTex(c), metalness: 0.4, roughness: 0.5, transparent: true }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0, (h * 0.68) / 2);
    return m;
  }

  // ---------- Hearth on screen: UI cards, devices, parallax stacks, exploding screens, UI elements flying in ----------
  const P0 = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, a: 1 };
  const po = (o) => ({ ...P0, ...o });
  const mixPose = (a, b, p) => { const o = {}; for (const k in P0) o[k] = k === 'a' ? lerp(a.a, b.a, C01(p)) : lerp(a[k], b[k], p); return o; };
  const UI_LAYOUTS = {
    single: { name: 'Floating card', count: 1, box: (n, w, h) => [w * 1.2, h * 1.25], place: (i, n, c) => po({ rx: -0.05 * c.tilt, ry: 0.22 * c.tilt }), from: (i, n, c) => po({ y: -c.h * 0.6, z: -2.5, rx: -0.8, a: 0 }) },
    stack: { name: 'Stack', count: 3, box: (n, w, h) => [w * (1.2 + n * 0.17), h * (1.25 + n * 0.16)], place: (i, n, c) => { const k = i - (n - 1) / 2; return po({ x: k * c.w * 0.17 * c.spread, y: k * c.h * 0.16 * c.spread, z: -i * 0.75 * c.depth, ry: 0.32 * c.tilt, rx: -0.1 * c.tilt }); }, from: (i, n, c, pl) => po({ ...pl, y: pl.y - c.h * 0.9, z: pl.z - 1.5, rx: -0.5, a: 0 }) },
    parallax: { name: 'Parallax depth', count: 5, box: (n, w, h) => [w * Math.max(1.6, n * 0.62), h * 1.5], place: (i, n, c) => po({ x: (i - (n - 1) / 2) * c.w * 0.62 * c.spread, y: (((i * 7) % 3) - 1) * c.h * 0.32, z: -((i * 5) % 3) * 1.4 * c.depth + 0.4, ry: -(i - (n - 1) / 2) * 0.08, s: 0.62 }), from: (i, n, c, pl) => po({ ...pl, z: pl.z - 4, s: 0.4, a: 0 }), cam: (t, c) => ({ x: Math.sin(t * 0.35 * c.drift) * c.w * 0.35, y: Math.sin(t * 0.27 * c.drift) * c.h * 0.1 }) },
    explode: { name: 'Explode into layers', count: 1, parts: true, together: true, box: (n, w, h) => [w * 1.5, h * 1.5], place: (i, n, c) => { const E = c.E; return po({ x: i * 0.28 * E, y: i * 0.14 * E, z: i * 1.15 * c.depth * E, ry: (0.22 + 0.45 * E) * c.tilt, rx: -(0.08 + 0.3 * E) * c.tilt }); }, from: (i, n, c) => po({ y: -c.h * 0.4, s: 0.9, a: 0 }) },
    'fly-in': { name: 'Fly in', count: 3, box: (n, w, h) => [w * (1 + n * 0.5), h * 1.35], place: (i, n, c) => { const k = i - (n - 1) / 2; return po({ x: k * c.w * 0.55 * c.spread, y: -Math.abs(k) * c.h * 0.06, z: -Math.abs(k) * 0.5 * c.depth, ry: -k * 0.22 * c.tilt, rz: -k * 0.03 }); }, from: (i, n, c, pl) => po({ ...pl, x: (i % 2 ? 1 : -1) * c.w * 3, y: c.h * 0.5, z: -3, ry: (i % 2 ? -1 : 1) * 1.3, rz: i % 2 ? 0.3 : -0.3 }) },
    carousel: { name: 'Carousel', count: 6, box: (n, w, h) => [w * 2.4, h * 1.35], place: (i, n, c) => { const R = c.w * 0.95 * c.spread * Math.max(1, n / 4); const a = (i / n) * Math.PI * 2 + c.t * 0.35 * c.drift; return po({ x: Math.sin(a) * R, z: (Math.cos(a) - 1) * R, ry: a, s: 0.8 }); }, from: (i, n, c, pl) => po({ ...pl, s: 0.01, a: 0 }) },
    wall: { name: 'Screen wall', count: 9, box: (n, w, h) => [w * 1.7, h * 1.7], place: (i, n, c) => { const cols = Math.ceil(Math.sqrt(n * 1.4)); const rows = Math.ceil(n / cols); const col = i % cols; const row = Math.floor(i / cols); const gx = (col - (cols - 1) / 2) * c.w * 0.47 * c.spread; const gy = ((rows - 1) / 2 - row) * c.h * 0.5 * c.spread; const a = 0.42 * c.tilt; return po({ x: gx * Math.cos(a), z: -gx * Math.sin(a) - 0.4, y: gy + Math.sin(c.t * 0.4 * c.drift + i) * 0.04, ry: a, rx: -0.1 * c.tilt, s: 0.42 }); }, from: (i, n, c, pl) => po({ ...pl, z: pl.z - 5, a: 0 }) },
    hero: { name: 'Hero tilt', count: 1, box: (n, w, h) => [w * 1.15, h * 1.25], place: (i, n, c) => po({ ry: 0.12 * c.tilt * Math.sin(c.t * 0.3), rx: -0.04 }), from: () => po({ rx: -1.1, ry: 0.8, rz: 0.4, y: -1, z: -1, a: 0 }) },
    zoom: { name: 'Zoom into the screen', count: 1, box: (n, w, h) => [w * 1.2, h * 1.25], place: (i, n, c) => { const Z = c.Z; return po({ z: Z * c.d * 0.86, ry: 0.18 * c.tilt * (1 - Z), rx: -0.05 * (1 - Z) }); }, from: () => po({ a: 0, s: 0.8, z: -1 }) },
    fan: { name: 'Fan', count: 5, box: (n, w, h) => [w * 1.9, h * 1.3], place: (i, n, c) => { const k = i - (n - 1) / 2; const ang = -k * 0.15 * c.spread; const R = c.h * 1.7; return po({ x: -Math.sin(ang) * R, y: -R + Math.cos(ang) * R, z: -i * 0.03, rz: ang, s: 0.72 }); }, from: (i, n, c) => po({ y: -c.h * 1.5, s: 0.72, a: 0 }) },
    feed: { name: 'Feed scroll', count: 6, box: (n, w, h) => [w * 1.1, h * 1.2], place: (i, n, c) => { const span = n * c.h * 0.62; let y = (n / 2 - i) * c.h * 0.62 + c.t * 0.35 * c.drift * c.h; y = ((((y + span / 2) % span) + span) % span) - span / 2; return po({ y, ry: 0.28 * c.tilt, rx: -0.1 * c.tilt, s: 0.55 }); }, from: (i, n, c, pl) => po({ ...pl, a: 0, x: c.w * 0.4 }) },
    split: { name: 'Side by side', count: 2, box: (n, w, h) => [w * 2.3, h * 1.2], place: (i, n, c) => { const side = i % 2 ? 1 : -1; const E = c.E; return po({ x: side * c.w * (0.1 + 0.5 * E) * c.spread, ry: -side * 0.3 * c.tilt * E, z: -0.2 * E, s: 0.85 }); }, from: () => po({ a: 0, s: 0.6 }) },
    turntable: { name: 'Turntable', count: 1, box: (n, w, h) => [w * 1.25, h * 1.3], place: (i, n, c) => po({ ry: c.t * 0.6 * c.drift + 0.25, rx: -0.12 * c.tilt }), from: (i, n, c) => po({ a: 0, s: 0.6, y: -c.h * 0.5 }) },
    elements: { name: 'UI elements fly in', count: 10, box: () => [4.6, 3.4], place: (i, n, c) => { const s = ELEMENT_SLOTS[i % ELEMENT_SLOTS.length]; return po({ x: s[0] * c.spread, y: s[1], z: s[2] * c.depth, rz: s[3] || 0, ry: 0.15 * c.tilt }); }, from: (i, n, c, pl) => po({ ...pl, y: pl.y - 3, x: pl.x * 1.4, z: pl.z - 2, rz: (hash(i) - 0.5) * 0.8, a: 0 }) },
  };
  const ELEMENT_SLOTS = [[-1.2, 0.95, 0.2, -0.03], [0.9, 0.55, 0.5, 0.02], [-0.7, -0.05, 0.1, 0], [1.45, -0.45, 0.7, 0.04], [-1.6, -0.8, -0.3, -0.05], [0.45, -1.05, 0.3, 0.03], [1.7, 1.15, -0.4, 0.05], [-0.1, 1.45, -0.6, 0], [0.2, 0.35, 0.9, -0.02], [-1.9, 0.35, -0.5, 0.06]];
  function elementCanvas(kind, a, col, extra) {
    const c = document.createElement('canvas'); const g = c.getContext('2d');
    const W = kind === 'bubble' ? 760 : kind === 'swatches' ? 560 : kind === 'node' ? 420 : kind === 'slider' ? 560 : 420;
    const H = kind === 'bubble' ? 210 : kind === 'node' ? 300 : kind === 'swatches' ? 150 : 130;
    c.width = W; c.height = H;
    const box = (fill, stroke, r = 26) => { rr(g, 6, 6, W - 12, H - 12, r); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 4; g.stroke(); } };
    if (kind === 'bubble') { box(a === 'You' ? '#2b2617' : '#1c2030', col); label(g, a, 36, 52, 34, col); g.font = `600 36px ${FONTS.Oxanium}`; g.fillStyle = '#ece6da'; g.fillText(String(extra || '').slice(0, 34), 36, 128); }
    else if (kind === 'chip') { box(col, null, 60); label(g, a, 40, H / 2, 44, '#16110a', 800); }
    else if (kind === 'pill') { box('#14161d', col, 60); label(g, a, 40, H / 2, 40, col, 700); }
    else if (kind === 'toast') { box('#16181f', col, 24); label(g, a, 40, H / 2, 42, col, 700); }
    else if (kind === 'slider') { box('#14161d', '#2a2e3a', 24); label(g, a, 32, 40, 32, '#d8d3c7', 600); rr(g, 32, 80, W - 64, 16, 8); g.fillStyle = '#2a2e3a'; g.fill(); rr(g, 32, 80, (W - 64) * (extra || 0.6), 16, 8); g.fillStyle = col; g.fill(); g.beginPath(); g.arc(32 + (W - 64) * (extra || 0.6), 88, 18, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); }
    else if (kind === 'node') { box('#171a24', '#2a2e3a', 20); rr(g, 6, 6, W - 12, 70, 20); g.fillStyle = col; g.fill(); label(g, a, 28, 42, 34, '#11131a', 800); bars(g, 28, 110, W - 90, 4, 14, 26, '#8a8fa3', 0.85, 9); for (let i = 0; i < 4; i++) { g.fillStyle = col; g.beginPath(); g.arc(W - 30, 117 + i * 40, 10, 0, Math.PI * 2); g.fill(); } }
    else if (kind === 'swatches') { (extra || []).forEach((cc, i) => { rr(g, 10 + i * 108, 15, 96, H - 30, 18); g.fillStyle = cc; g.fill(); }); }
    return c;
  }
  const ELEMENTS = [['bubble', 'You', FORGE.gold, 'Make me an intro for Hearth'], ['bubble', 'Claude', FORGE.ember, 'On it: building the scene'], ['bubble', 'Astra', FORGE.violet, 'I’ll pick the palette ✦'], ['chip', '▶ Make it', FORGE.gold], ['slider', 'Glow', FORGE.gold, 0.72], ['toast', 'Saved ✓', '#7cd992'], ['node', 'Particles', FORGE.blue], ['swatches', '', '', ['#1b0f3b', '#7c3aed', '#ff8c42', '#ffd75e', '#fff3c4']], ['pill', '12.4k tokens', FORGE.blue], ['chip', '🎲 Shuffle', FORGE.violet]];
  function elementCards(R, P, opts) {
    const words = opts.words || [];
    return ELEMENTS.map((e, i) => {
      const el = e.slice(); if (e[0] === 'bubble' && words[i]) el[3] = words[i];
      const cv = elementCanvas(...el);
      const w = (cv.width / 760) * 1.7;
      const F = { cw: cv.width, ch: cv.height, sx: 0, sy: 0, sw: cv.width, sh: cv.height, r: 0, w };
      return makeCard(R, { img: cv, ready: true }, 'none', P, { slab: false, F });
    });
  }
  function ui(P = {}, opts = {}) {
    const R = stage3d();
    let built = ''; let cards = [];
    const pics = () => { const l = (opts.pics || []).filter(Boolean); return l.length ? l : ['mock:chat', 'mock:lab', 'mock:board', 'mock:editor', 'mock:nodes', 'mock:jam']; };
    function build(layout, frame, n) {
      for (const c of cards) { R.scene.remove(c.root || c.group); c.dispose(); }
      cards = [];
      const list = pics();
      if (UI_LAYOUTS[layout].parts) { const S = source(list[0], frame); for (let j = 0; j < 4; j++) cards.push(makeCard(R, S, frame, P, { part: j, slab: false, shadow: false })); }
      else if (layout === 'elements') cards = elementCards(R, P, opts);
      else for (let i = 0; i < n; i++) cards.push(makeCard(R, list[i % list.length], frame, P));
      for (const c of cards) {
        if (frame === 'laptop' && !UI_LAYOUTS[layout].parts) {
          const holder = new THREE.Group(); const pivot = new THREE.Group();
          pivot.position.y = -c.h / 2; c.group.position.y = c.h / 2; pivot.add(c.group); holder.add(pivot);
          const b = laptopBase(c.w, c.h); b.position.y = -c.h / 2 + 0.001; holder.add(b);
          c.root = holder; c.lid = pivot; c.base = b;
        }
        R.scene.add(c.root || c.group);
      }
    }
    every(() => {
      const layout = UI_LAYOUTS[val(P, 'layout', opts.layout || 'single')] ? val(P, 'layout', opts.layout || 'single') : 'single';
      const Ld = UI_LAYOUTS[layout];
      const frame = FRAMES[val(P, 'frame', 'glass')] ? val(P, 'frame', 'glass') : 'glass';
      // one-screen layouts show one screen whatever the Screens knob says (several in one place would fight for the same depth)
      const n = Ld.parts ? 4 : layout === 'elements' ? ELEMENTS.length : Ld.count === 1 ? 1 : Math.max(1, Math.min(12, Math.round(num(P, 'count', Ld.count))));
      const k = `${layout}|${frame}|${n}|${num(P, 'radius', 1)}|${num(P, 'thickness', 0.06)}|${pics().join(',')}`;
      if (k !== built) { build(layout, frame, n); built = k; }
      const st = num(P, 'start', 0.2); const spd = Math.max(0.05, num(P, 'speed', 1.1)); const stag = Ld.together ? 0 : num(P, 'stagger', 0.18);
      const hold = num(P, 'hold', 3);
      const extra = layout === 'zoom' ? 2 : layout === 'explode' || layout === 'split' ? 1.4 : 0;
      const end = st + (cards.length - 1) * stag + spd + extra;
      const loop = end + hold + 1.2;
      const t = clock(loop);
      const outAt = num(P, 'out', 0) > 0 ? num(P, 'out', 0) : follows() ? Infinity : end + hold;
      const ex = C01((t - outAt) / 0.7);
      const c0 = cards[0];
      const cw = c0 ? c0.w : 4; const chh = c0 ? c0.h : 2.5;
      const [bw, bh] = Ld.box(cards.length, cw, chh);
      const c = { t, w: cw, h: chh, spread: num(P, 'spread', 1), depth: num(P, 'depth', 1), tilt: num(P, 'tilt', 1), drift: num(P, 'drift', 1), d: R.base.d,
        E: ease('inOut', (t - st - spd - 0.2) / 1.2), Z: ease('inOut', (t - st - spd - Math.min(hold * 0.35, 1.2)) / 1.6) };
      const pose = placeCamera(R, bw, bh, P, Ld.cam ? Ld.cam(t, c) : null);
      const easeName = val(P, 'ease', 'back');
      const fl = num(P, 'float', 1);
      cards.forEach((cd, i) => {
        cd.tick();
        const pl = Ld.place(i, cards.length, c);
        const fr = Ld.from(i, cards.length, c, pl);
        const p = ease(easeName, (t - st - i * stag) / spd);
        let o = mixPose(fr, pl, p);
        if (fl) { o.y += Math.sin(t * 0.9 + i * 1.3) * 0.05 * fl; o.rx += Math.sin(t * 0.7 + i) * 0.02 * fl; o.ry += Math.sin(t * 0.55 + i * 2.1) * 0.02 * fl; }
        if (ex > 0) o = mixPose(o, po({ ...o, y: o.y + chh * 1.4, rx: o.rx + 0.5, a: 0 }), ease('in', ex));
        if (cd.lid) { const open = ease('out', (t - st - i * stag - spd * 0.4) / (spd * 1.2)); cd.lid.rotation.x = (1 - open) * (Math.PI / 2) * 0.97 - 0.12 * open; if (cd.base) { cd.base.material.opacity = C01(o.a); cd.base.visible = o.a > 0.01; } }
        cd.set(o, dofBlur(pose, P, o.z));
      });
      R.renderer.render(R.scene, R.camera);
    });
    return { renderer: R.renderer, canvas: R.renderer.domElement };
  }

  // ---------- a cursor that moves along a path and clicks ----------
  // opts.path: [[x, y, click?], …] in 0..1 of the frame (a tour of the safe area when left out)
  const CURSOR_PATH = [[0.72, 0.78, 0], [0.42, 0.52, 1], [0.6, 0.34, 0], [0.3, 0.3, 1], [0.55, 0.62, 1], [0.78, 0.5, 0]];
  function cursor(P = {}, opts = {}) {
    const S = canvas2d();
    every(() => {
      const { g, W, H } = S;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      const path = (opts.path && opts.path.length > 1 ? opts.path : CURSOR_PATH);
      const st = num(P, 'start', 0.3); const seg = Math.max(0.15, num(P, 'speed', 0.9)); const pause = num(P, 'pause', 0.35);
      const per = seg + pause;
      const loop = st + (path.length - 1) * per + 1.5;
      const t = clock(loop);
      const z = safe(W, H, 'safe');
      const at = (k) => [z.x + path[k][0] * z.w, z.y + path[k][1] * z.h];
      const u = (t - st) / per;
      const k = Math.max(0, Math.min(path.length - 2, Math.floor(u)));
      const f = C01((u - k) * per / seg);
      const e = ease('inOut', f);
      const [x0, y0] = at(k); const [x1, y1] = at(k + 1);
      // a gentle arc between points (hands don't move in straight lines)
      const mx = (x0 + x1) / 2 + (y1 - y0) * 0.18 * num(P, 'arc', 1); const my = (y0 + y1) / 2 - (x1 - x0) * 0.18 * num(P, 'arc', 1);
      const q = (a, b, c2, s) => (1 - s) * (1 - s) * a + 2 * (1 - s) * s * b + s * s * c2;
      let x = u < 0 ? x0 : q(x0, mx, x1, e); let y = u < 0 ? y0 : q(y0, my, y1, e);
      if (u >= path.length - 1) [x, y] = at(path.length - 1);
      const m = Math.min(W, H); const size = num(P, 'size', 0.05) * m;
      const vis = C01((t - st + 0.3) / 0.3) * (follows() ? 1 : 1 - C01((t - loop + 0.5) / 0.4));
      const col = val(P, 'color', '#ffffff'); const acc = val(P, 'accent', FORGE.gold);
      // clicks: a ring where a point says click, when the cursor arrives
      let press = 0;
      for (let i = 1; i < path.length; i++) {
        if (!path[i][2]) continue;
        const ta = st + (i - 1) * per + seg; const d = t - ta;
        if (d < 0 || d > 0.9) continue;
        const [cx, cy] = at(i);
        g.save(); g.globalAlpha = (1 - d / 0.9) * vis; g.strokeStyle = acc; g.lineWidth = size * 0.08; g.beginPath(); g.arc(cx, cy, size * (0.3 + d * 1.6), 0, Math.PI * 2); g.stroke();
        g.globalAlpha = (1 - d / 0.9) * 0.25 * vis; g.fillStyle = acc; g.beginPath(); g.arc(cx, cy, size * (0.2 + d * 0.9), 0, Math.PI * 2); g.fill(); g.restore();
        press = Math.max(press, Math.exp(-d * 10) * (d < 0.12 ? 1 : 0.6));
      }
      // a soft trail
      if (num(P, 'trail', 0.5) > 0 && u > 0 && u < path.length - 1) {
        g.save(); g.strokeStyle = acc; g.lineCap = 'round';
        for (let j = 1; j <= 8; j++) { const ee = ease('inOut', C01(f - j * 0.03)); const px = q(x0, mx, x1, ee); const py = q(y0, my, y1, ee); g.globalAlpha = 0.25 * (1 - j / 8) * vis * num(P, 'trail', 0.5); g.lineWidth = size * 0.18 * (1 - j / 9); g.beginPath(); g.moveTo(px, py); g.lineTo(px + 0.1, py); g.stroke(); }
        g.restore();
      }
      g.save(); g.globalAlpha = vis; g.translate(x, y); g.scale(1 - press * 0.15, 1 - press * 0.15);
      g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = size * 0.25; g.shadowOffsetY = size * 0.06;
      const style = val(P, 'style', 'arrow');
      if (style === 'dot') { g.fillStyle = acc; g.beginPath(); g.arc(0, 0, size * 0.32, 0, Math.PI * 2); g.fill(); g.strokeStyle = col; g.lineWidth = size * 0.06; g.stroke(); }
      else if (style === 'hand') { g.fillStyle = col; g.strokeStyle = '#111'; g.lineWidth = size * 0.05; rr(g, -size * 0.12, -size * 0.05, size * 0.24, size * 0.55, size * 0.12); g.fill(); g.stroke(); rr(g, -size * 0.3, size * 0.25, size * 0.62, size * 0.45, size * 0.2); g.fill(); g.stroke(); }
      else { g.fillStyle = col; g.strokeStyle = '#111'; g.lineWidth = size * 0.06; g.lineJoin = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, size); g.lineTo(size * 0.27, size * 0.75); g.lineTo(size * 0.45, size * 1.12); g.lineTo(size * 0.6, size * 1.05); g.lineTo(size * 0.42, size * 0.68); g.lineTo(size * 0.75, size * 0.68); g.closePath(); g.fill(); g.stroke(); }
      g.restore();
    });
    return { canvas: S.cv };
  }

  // ---------- camera moves ----------
  // f(e, p, tl, A): e = eased progress, p = linear progress, tl = seconds since the move started, A = amount.
  // Pose: x / y (tenths of the camera distance), dolly (fraction closer), orbit / tilt / roll (°), fov (×), lx / ly (look
  // offset), focus (depth in focus) + aperture (how soft the rest is), mblur (motion blur).
  const bump = (p, c, w) => Math.exp(-(((p - c) / w) ** 2));
  const shake = (tl, f, a) => ({ x: vnoise(tl * f) * a, y: vnoise(tl * f + 17.3) * a, roll: vnoise(tl * f * 0.8 + 41) * a * 6 });
  const CAMERA = {
    'dolly-in': { name: 'Dolly in', ease: 'inOut', f: (e, p, tl, A) => ({ dolly: e * 0.38 * A }) },
    'dolly-out': { name: 'Dolly out', ease: 'inOut', f: (e, p, tl, A) => ({ dolly: lerp(0.32, -0.25, e) * A }) },
    'push-in': { name: 'Slow push (Ken Burns)', ease: 'linear', f: (e, p, tl, A) => ({ dolly: e * 0.16 * A, x: e * 0.15 * A }) },
    orbit: { name: 'Orbit', ease: 'inOut', f: (e, p, tl, A) => ({ orbit: lerp(-28, 28, e) * A, tilt: 6 * A }) },
    'orbit-360': { name: 'Orbit all the way', ease: 'linear', f: (e, p, tl, A) => ({ orbit: e * 360 * Math.sign(A || 1), tilt: 8 }) },
    arc: { name: 'Arc in', ease: 'out', f: (e, p, tl, A) => ({ orbit: lerp(-42, 0, e) * A, dolly: lerp(-0.12, 0.2, e) * A }) },
    'crane-up': { name: 'Crane up', ease: 'inOut', f: (e, p, tl, A) => ({ tilt: lerp(-14, 22, e) * A, y: lerp(-0.6, 0.4, e) * A }) },
    'crane-down': { name: 'Crane down', ease: 'inOut', f: (e, p, tl, A) => ({ tilt: lerp(24, -6, e) * A, y: lerp(0.5, 0, e) * A }) },
    'truck-left': { name: 'Truck left', ease: 'inOut', f: (e, p, tl, A) => ({ x: lerp(1.6, -1.6, e) * A }) },
    'truck-right': { name: 'Truck right', ease: 'inOut', f: (e, p, tl, A) => ({ x: lerp(-1.6, 1.6, e) * A }) },
    'tilt-up': { name: 'Tilt up', ease: 'inOut', f: (e, p, tl, A) => ({ ly: lerp(-4, 0, e) * A }) },
    'tilt-down': { name: 'Tilt down', ease: 'inOut', f: (e, p, tl, A) => ({ ly: lerp(4, 0, e) * A }) },
    'whip-pan': { name: 'Whip pan', ease: 'expoInOut', f: (e, p, tl, A) => ({ x: lerp(-7, 0, e) * A, orbit: lerp(-30, 0, e) * A, mblur: bump(p, 0.5, 0.16) * Math.min(1, Math.abs(A)) }) },
    'rack-focus': { name: 'Rack focus', ease: 'inOut', f: (e, p, tl, A) => ({ focus: lerp(-2.6, 0.4, e), aperture: 1.3 * A, dolly: e * 0.04 }) },
    handheld: { name: 'Handheld', ease: 'linear', f: (e, p, tl, A) => { const s = shake(tl, 0.9, 0.09 * A); return { ...s, roll: s.roll * 0.5, dolly: vnoise(tl * 0.4 + 7) * 0.015 * A }; } },
    'zoom-punch': { name: 'Zoom punch', ease: 'expo', f: (e, p, tl, A) => { const k = ease('expo', tl / 0.18); const s = shake(tl, 30, 0.05 * A * Math.exp(-tl * 6)); return { fov: lerp(1, 1 - 0.22 * A, k), ...s }; } },
    'snap-zoom': { name: 'Snap zoom', ease: 'linear', f: (e, p, tl, A) => ({ fov: tl >= 0 ? 1 - 0.32 * A * (1 + 0.06 * Math.exp(-tl * 18)) : 1 }) },
    'dutch-push': { name: 'Dutch push', ease: 'inOut', f: (e, p, tl, A) => ({ roll: e * 10 * A, dolly: e * 0.24 * A }) },
    vertigo: { name: 'Vertigo (dolly zoom)', ease: 'inOut', f: (e, p, tl, A) => ({ dolly: -e * 0.5 * A, fov: 1 / (1 + e * 0.5 * A) }) },
    drift: { name: 'Drift', ease: 'linear', f: (e, p, tl, A) => ({ x: Math.sin(tl * 0.3) * 0.35 * A, y: Math.sin(tl * 0.23) * 0.18 * A, orbit: Math.sin(tl * 0.2) * 4 * A }) },
    reveal: { name: 'Pull back reveal', ease: 'out', f: (e, p, tl, A) => ({ dolly: lerp(0.82, 0, e) * Math.min(1, A), tilt: (1 - e) * 10 }) },
    'shake-hit': { name: 'Shake hit', ease: 'linear', f: (e, p, tl, A) => shake(tl, 26, 0.2 * A * Math.exp(-Math.max(0, tl) * 4)) },
    'roll-in': { name: 'Roll in', ease: 'back', f: (e, p, tl, A) => ({ roll: lerp(-35, 0, e) * A, dolly: lerp(-0.3, 0, ease('out', p)) * A }) },
  };
  // the picture-wide version of a camera move (a filter on everything below the camera layer)
  const CAM_FRAG = `
uniform float u_zoom; uniform float u_px; uniform float u_py; uniform float u_rot; uniform float u_blur; uniform float u_dx; uniform float u_dy;
vec2 mirrorUv(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }
void main() {
  float A = aspect();
  vec2 p = vUv - 0.5; p.x *= A;
  float c = cos(u_rot); float s = sin(u_rot);
  p = mat2(c, s, -s, c) * p;
  p = p / max(0.05, u_zoom) - vec2(u_px * A, u_py);
  p.x /= A;
  vec2 uv = p + 0.5;
  if (u_blur < 0.05 && abs(u_dx) + abs(u_dy) < 0.0005) { gl_FragColor = vec4(tex(mirrorUv(uv)), 1.0); return; }
  vec3 col = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float f = float(i) / 15.0 - 0.5;
    float ang = float(i) * 2.39996;
    vec2 disc = vec2(cos(ang), sin(ang)) * sqrt(float(i) / 15.0) * u_blur / uRes;
    col += tex(mirrorUv(uv + vec2(u_dx, u_dy) * f + disc));
  }
  gl_FragColor = vec4(col / 16.0, 1.0);
}`;
  function camPose(P, tl, presetDefault) {
    const id = val(P, 'move', presetDefault || 'dolly-in');
    const M = CAMERA[id] || CAMERA['dolly-in'];
    const len = Math.max(0.05, num(P, 'length', 3));
    const p = C01(tl / len);
    const e = ease(val(P, 'ease', 'auto') === 'auto' ? M.ease : val(P, 'ease', 'auto'), p);
    const A = num(P, 'amount', 1);
    const o = M.f(e, p, tl, A);
    // keyframable extras on top of the preset (the sliders can be keyed like any other)
    o.x = (o.x || 0) + num(P, 'panX', 0); o.y = (o.y || 0) + num(P, 'panY', 0);
    o.roll = (o.roll || 0) + num(P, 'roll', 0);
    o.dolly = (o.dolly || 0) + num(P, 'push', 0);
    o.fov = (o.fov || 1) / Math.max(0.2, num(P, 'zoom', 1));
    const hh = num(P, 'handheld', 0);
    if (hh > 0) { const s = shake(tl, 0.9, 0.08 * hh); o.x += s.x; o.y += s.y; o.roll += s.roll * 0.5; }
    return o;
  }
  function camera(P = {}, opts = {}) {
    const L0 = globalThis.layer;
    let c0 = 0; let fol = false; let loop = 0;
    const start = () => num(P, 'start', 0);
    const local = (clk) => { const tl = clk - c0; return fol ? tl : loop > 0 ? ((tl % loop) + loop) % loop : tl; };
    const stageShown = () => { for (const el of stages.values()) if (shown(el)) return true; return false; };
    let cur = null; let curAt = -1;
    // one pose per frame, from this layer's own time
    const now = () => {
      const L = globalThis.layer;
      const t = L ? L.time : performance.now() / 1000;
      if (t === curAt && cur) return cur;
      loop = start() + num(P, 'length', 3) + num(P, 'hold', 1.5);
      fol = follows();
      c0 = (L ? (L.clock ?? L.time) : t) - t;
      curAt = t;
      cur = camPose(P, clock(loop) - start(), opts.move);
      return cur;
    };
    const mode = () => { const m = val(P, 'mode', 'auto'); return m === 'auto' ? (stageShown() ? 'stage' : 'picture') : m === '3D stage' ? 'stage' : m === 'whole picture' ? 'picture' : 'both'; };
    const pic = () => (mode() === 'stage' ? { x: 0, y: 0, dolly: 0, fov: 1, roll: 0, orbit: 0, tilt: 0, ly: 0, focus: null, aperture: 0, mblur: 0 } : now());
    const F = {
      get zoom() { const o = pic(); return (1 / Math.max(0.05, 1 - (o.dolly || 0))) / (o.fov || 1) * (1 + Math.abs(o.orbit || 0) * 0.002); },
      get px() { const o = pic(); return -(o.x || 0) * 0.07 - (o.orbit || 0) * 0.004; },
      get py() { const o = pic(); return -(o.y || 0) * 0.07 + (o.tilt || 0) * 0.004 + (o.ly || 0) * 0.04; },
      get rot() { return ((pic().roll || 0) * Math.PI) / 180; },
      get blur() { const o = pic(); return (o.aperture ? Math.abs(o.focus ?? 0) * o.aperture * 5 : 0) * devicePixelRatio; },
      get dx() { return (pic().mblur || 0) * 0.08 * num(P, 'blur', 1); },
      get dy() { return 0; },
    };
    if (!filter.types.includes('motion-camera')) filter.define('motion-camera', { frag: CAM_FRAG });
    const f = filter('motion-camera', F);
    const me = { el: f.renderer.domElement, pose: (clk) => { now(); return mode() === 'picture' ? null : camPose(P, local(clk) - start(), opts.move); } };
    globalThis.__motionRig = me;
    return { ...f, layer: L0?.id };
  }

  // ---------- logos (Hearth's flame and the Forgeheart anvil, from icons.js) ----------
  const MARKS = {
    flame: { fill: ['M12 21c-3.9 0-6.5-2.7-6.5-6.1 0-3.4 2.6-5.3 3.6-8.4.6 1.8 1.7 2.7 2.7 3.2-.1-2.6.8-4.7 2.7-6.7.2 3.3 4 5.9 4 10 0 4.6-2.7 8-6.5 8z'], inner: ['M12 21c-1.7 0-2.9-1.2-2.9-2.8 0-1.8 1.6-2.6 2.2-4.3 1.6 1.2 3.6 2.2 3.6 4.4 0 1.5-1.2 2.7-2.9 2.7z'], lines: [] },
    anvil: { fill: ['M4 9h12.5c0 2.4-1.9 3.8-4.5 3.8V15h2.5l1.5 3H6l1.5-3H10v-2.2C7.2 12.8 4 11.7 4 9z'], inner: [], lines: ['M18.5 4.5l1-1M20.5 7.5h1.4M17.2 3V1.8'] },
    claude: { fill: [], inner: [], lines: ['M12 3.2v6.1M12 14.7v6.1M3.2 12h6.1M14.7 12h6.1M5.8 5.8l4.3 4.3M13.9 13.9l4.3 4.3M18.2 5.8l-4.3 4.3M10.1 13.9l-4.3 4.3'] },
    astra: { fill: ['M12 3.5c.7 4.2 1.9 5.4 6.1 6.1-4.2.7-5.4 1.9-6.1 6.1-.7-4.2-1.9-5.4-6.1-6.1 4.2-.7 5.4-1.9 6.1-6.1z'], inner: [], lines: [] },
  };
  // an SVG path (M L H V C S Q T Z, absolute or relative) as segments: [{ m: [x, y] } | { l: [x, y] } | { c: [x1, y1, x2, y2, x, y] } | { q: [...] } | { z }]
  function parsePath(d) {
    const tok = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
    const out = []; let i = 0; let cmd = ''; let x = 0; let y = 0; let sx = 0; let sy = 0; let lc = null; let lq = null;
    const n = () => Number(tok[i++]);
    while (i < tok.length) {
      if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
      const rel = cmd === cmd.toLowerCase(); const C = cmd.toUpperCase();
      const ox = rel ? x : 0; const oy = rel ? y : 0;
      if (C === 'Z') { out.push({ z: true }); x = sx; y = sy; lc = lq = null; continue; }
      if (C === 'M') { x = n() + ox; y = n() + oy; sx = x; sy = y; out.push({ m: [x, y] }); cmd = rel ? 'l' : 'L'; lc = lq = null; continue; }
      if (C === 'L') { x = n() + ox; y = n() + oy; out.push({ l: [x, y] }); lc = lq = null; continue; }
      if (C === 'H') { x = n() + (rel ? x : 0); out.push({ l: [x, y] }); lc = lq = null; continue; }
      if (C === 'V') { y = n() + (rel ? y : 0); out.push({ l: [x, y] }); lc = lq = null; continue; }
      if (C === 'C') { const a = [n() + ox, n() + oy, n() + ox, n() + oy, n() + ox, n() + oy]; out.push({ c: a }); lc = [a[2], a[3]]; x = a[4]; y = a[5]; lq = null; continue; }
      if (C === 'S') { const r1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; const a = [r1[0], r1[1], n() + ox, n() + oy, n() + ox, n() + oy]; out.push({ c: a }); lc = [a[2], a[3]]; x = a[4]; y = a[5]; lq = null; continue; }
      if (C === 'Q') { const a = [n() + ox, n() + oy, n() + ox, n() + oy]; out.push({ q: a }); lq = [a[0], a[1]]; x = a[2]; y = a[3]; lc = null; continue; }
      if (C === 'T') { const r1 = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y]; const a = [r1[0], r1[1], n() + ox, n() + oy]; out.push({ q: a }); lq = r1; x = a[2]; y = a[3]; lc = null; continue; }
      i++; // an unsupported command (arcs): skip its numbers
    }
    return out;
  }
  function path2d(segs) { const p = new Path2D(); for (const s of segs) { if (s.m) p.moveTo(...s.m); else if (s.l) p.lineTo(...s.l); else if (s.c) p.bezierCurveTo(...s.c); else if (s.q) p.quadraticCurveTo(...s.q); else if (s.z) p.closePath(); } return p; }
  function pathLength(segs) {
    let L = 0; let x = 0; let y = 0; let sx = 0; let sy = 0;
    const add = (nx, ny) => { L += Math.hypot(nx - x, ny - y); x = nx; y = ny; };
    for (const s of segs) {
      if (s.m) { x = sx = s.m[0]; y = sy = s.m[1]; } else if (s.l) add(...s.l); else if (s.z) add(sx, sy);
      else { const a = s.c || s.q; const x0 = x; const y0 = y; for (let k = 1; k <= 12; k++) { const u = k / 12; const v = 1 - u; if (s.c) add(v * v * v * x0 + 3 * v * v * u * a[0] + 3 * v * u * u * a[2] + u * u * u * a[4], v * v * v * y0 + 3 * v * v * u * a[1] + 3 * v * u * u * a[3] + u * u * u * a[5]); else add(v * v * x0 + 2 * v * u * a[0] + u * u * a[2], v * v * y0 + 2 * v * u * a[1] + u * u * a[3]); } }
    }
    return L;
  }
  function threeShapes(segs) {
    const shapes = []; let s = null;
    for (const g of segs) {
      if (g.m) { s = new THREE.Shape(); s.moveTo(g.m[0], -g.m[1]); shapes.push(s); } else if (!s) continue;
      else if (g.l) s.lineTo(g.l[0], -g.l[1]); else if (g.c) s.bezierCurveTo(g.c[0], -g.c[1], g.c[2], -g.c[3], g.c[4], -g.c[5]); else if (g.q) s.quadraticCurveTo(g.q[0], -g.q[1], g.q[2], -g.q[3]);
    }
    return shapes;
  }
  const markOf = (P, d) => { const k = String(val(P, 'mark', d || 'flame')); return k === 'both' ? ['flame', 'anvil'] : [MARKS[k] ? k : 'flame']; };
  const LOGO_STYLES = { 'line draw': '2d', burst: '2d', glitch: '2d', particles: '2d', molten: '2d', stamp: '2d', extrude: '3d', slam: '3d' };
  function logo(P = {}, opts = {}) {
    const S = canvas2d();
    let R = null; let built3 = ''; let meshes = []; let parts = null; let dots = null; let dotsKey = '';
    const segsOf = (name) => { const m = MARKS[name]; return { fill: m.fill.map(parsePath), inner: m.inner.map(parsePath), lines: m.lines.map(parsePath) }; };
    function build3d(names) {
      if (!R) { R = stage3d(); R.renderer.domElement.style.position = 'absolute'; S.cv.style.zIndex = '1'; }
      for (const m of meshes) { R.scene.remove(m); m.traverse((x) => { x.geometry?.dispose(); }); }
      meshes = [];
      const cap = new THREE.MeshStandardMaterial({ color: val(P, 'color', FORGE.gold), metalness: 0.75, roughness: 0.28, emissive: new THREE.Color(FORGE.ember), emissiveIntensity: 0.18, transparent: true });
      const side = new THREE.MeshStandardMaterial({ color: val(P, 'accent', FORGE.ember), metalness: 0.5, roughness: 0.4, transparent: true });
      const glow = new THREE.MeshStandardMaterial({ color: '#fff1c2', emissive: new THREE.Color('#ffd75e'), emissiveIntensity: 0.6, transparent: true });
      names.forEach((name, k) => {
        const sg = segsOf(name);
        const grp = new THREE.Group();
        const depth = num(P, 'depth', 0.5) * 3;
        for (const s of sg.fill) { const geo = new THREE.ExtrudeGeometry(threeShapes(s), { depth, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.2, bevelSegments: 3, curveSegments: 18 }); grp.add(new THREE.Mesh(geo, [cap, side])); }
        for (const s of sg.inner) { const geo = new THREE.ExtrudeGeometry(threeShapes(s), { depth: depth + 0.35, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2, curveSegments: 14 }); const m = new THREE.Mesh(geo, glow); grp.add(m); }
        for (const s of sg.lines) { let x = 0; let y = 0; for (const g of s) { if (g.m) { [x, y] = g.m; continue; } if (!g.l) continue; const [x2, y2] = g.l; const len = Math.hypot(x2 - x, y2 - y); const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, 0.55), glow); b.position.set((x + x2) / 2, -(y + y2) / 2, depth / 2); b.rotation.z = -Math.atan2(y2 - y, x2 - x); grp.add(b); x = x2; y = y2; } }
        const box = new THREE.Box3().setFromObject(grp); const c = box.getCenter(new THREE.Vector3());
        grp.children.forEach((ch) => ch.position.sub(c));
        const holder = new THREE.Group(); holder.add(grp); holder.userData.k = k; holder.userData.n = names.length;
        R.scene.add(holder); meshes.push(holder);
      });
      meshes.mats = [cap, side, glow];
    }
    // points inside the mark, for the particle style
    function sample(names, size) {
      const c = document.createElement('canvas'); c.width = c.height = 200; const g = c.getContext('2d');
      g.fillStyle = '#fff';
      names.forEach((name, k) => { g.save(); const n = names.length; g.translate(100 + (k - (n - 1) / 2) * (180 / n), 100); g.scale(7.4 / n, 7.4 / n); g.translate(-12, -12); for (const s of segsOf(name).fill.concat(segsOf(name).inner)) g.fill(path2d(s)); for (const s of segsOf(name).lines) { g.lineWidth = 1.8; g.strokeStyle = '#fff'; g.stroke(path2d(s)); } g.restore(); });
      const px = g.getImageData(0, 0, 200, 200).data; const pts = [];
      for (let y = 0; y < 200; y += 3) for (let x = 0; x < 200; x += 3) if (px[(y * 200 + x) * 4 + 3] > 100) pts.push([(x - 100) / 200, (y - 100) / 200]);
      return pts;
    }
    every(() => {
      const { g, W, H } = S;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      const style = LOGO_STYLES[val(P, 'style', opts.style || 'line draw')] ? val(P, 'style', opts.style || 'line draw') : 'line draw';
      const names = markOf(P, opts.mark);
      const st = num(P, 'start', 0.2); const spd = Math.max(0.1, num(P, 'speed', 1.6)); const hold = num(P, 'hold', 2.5);
      const loop = st + spd + 1.2 + hold + 0.8;
      const t = clock(loop);
      const outAt = num(P, 'out', 0) > 0 ? num(P, 'out', 0) : follows() ? Infinity : st + spd + 1.2 + hold;
      const ex = C01((t - outAt) / 0.6);
      const z = safe(W, H, 'safe');
      const word = String(val(P, 'word', 'HEARTH')); const tag = String(val(P, 'tagline', ''));
      const m = Math.min(z.w, z.h) * num(P, 'size', 0.42);
      const cy = z.y + z.h * num(P, 'y', 0.42); const cx = z.x + z.w / 2;
      const col = val(P, 'color', FORGE.gold); const acc = val(P, 'accent', FORGE.ember);
      const p = C01((t - st) / spd);
      const vis = 1 - ex;
      const is3d = LOGO_STYLES[style] === '3d';
      if (R) R.renderer.domElement.style.display = is3d ? '' : 'none';
      if (is3d) {
        const k3 = `${names.join(',')}|${num(P, 'depth', 0.5)}|${col}|${acc}`;
        if (k3 !== built3) { build3d(names); built3 = k3; }
        for (const mt of meshes.mats) { mt.opacity = vis; }
        meshes.mats[0].color.set(col); meshes.mats[1].color.set(acc);
        let own = null;
        meshes.forEach((h, k) => {
          const n = meshes.length; const ox = (k - (n - 1) / 2) * 30;
          if (style === 'extrude') { const e = ease('back', p); h.rotation.set(0.15 * Math.sin(t * 0.5), lerp(-Math.PI * 1.5, 0, e) + Math.sin(t * 0.6) * 0.25 * C01(p * 2 - 1), 0); h.scale.setScalar(Math.max(0.01, lerp(0.2, 1, ease('out', p)))); h.position.set(ox, 0, 0); }
          else { const e = ease('in', C01(p * 1.6)); h.position.set(ox, lerp(40, 0, e), lerp(-30, 0, e)); h.rotation.set(lerp(-0.6, -0.12, e), lerp(0.5, 0.2, e), 0); h.scale.setScalar(lerp(1.6, 1, e)); }
        });
        if (style === 'slam') { const land = st + spd / 1.6; const d = t - land; if (d > 0) { const s = shake(d, 32, 1.2 * Math.exp(-d * 5)); own = { x: s.x, y: s.y }; } }
        // the camera at the distance where 24 units (the icon's box) are m pixels tall, shifted so the mark sits at cy
        const visK = 2 * Math.tan(15 * DEG);
        let d = 24 / Math.max(0.02, (m / H) * visK);
        d = Math.max(d, (meshes.length * 30) / (visK * R.camera.aspect) * 1.05);
        const oy = ((cy - H / 2) / H) * visK * d;
        placeCamera(R, 0, 0, P, { x: own?.x || 0, y: oy + (own?.y || 0) }, d);
        R.renderer.render(R.scene, R.camera);
        // sparks on the slam's landing
        if (style === 'slam') { const d = t - (st + spd / 1.6); if (d > 0 && d < 1.2) { g.save(); g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 46; i++) { const a = hash(i) * Math.PI * 2; const sp = (0.3 + hash(i + 9) * 0.7) * m * 1.4; const x = cx + Math.cos(a) * sp * d; const y = cy + m * 0.3 + Math.sin(a) * sp * d * 0.5 + d * d * m * 0.8; g.globalAlpha = (1 - d / 1.2) * vis; g.fillStyle = i % 3 ? FORGE.gold : FORGE.ember; g.beginPath(); g.arc(x, y, m * 0.012, 0, Math.PI * 2); g.fill(); } g.restore(); } }
      } else {
        const n = names.length; const sc = m / 24 / (n > 1 ? 1.25 : 1);
        names.forEach((name, k) => {
          const sg = segsOf(name);
          g.save();
          g.translate(cx + (k - (n - 1) / 2) * m * 0.85, cy);
          g.scale(sc, sc); g.translate(-12, -12);
          const lw = 1.1;
          g.lineJoin = 'round'; g.lineCap = 'round';
          const fillGrad = () => { const gr = g.createLinearGradient(0, 3, 0, 21); gr.addColorStop(0, col); gr.addColorStop(1, acc); return gr; };
          g.globalAlpha = vis;
          if (style === 'line draw' || style === 'molten') {
            const all = [...sg.fill, ...sg.inner, ...sg.lines];
            for (const s of all) { const L = pathLength(s); g.setLineDash([L, L + 1]); g.lineDashOffset = L * (1 - ease('inOut', p)); g.strokeStyle = col; g.lineWidth = lw; g.shadowColor = acc; g.shadowBlur = 8 * num(P, 'glow', 1); g.stroke(path2d(s)); }
            g.setLineDash([]);
            const fp = C01((t - st - spd * 0.75) / 0.8);
            if (fp > 0) {
              if (style === 'molten') { g.save(); g.beginPath(); const lvl = lerp(22, 2, ease('inOut', fp)); g.moveTo(-2, 26); for (let x = -2; x <= 26; x += 1) g.lineTo(x, lvl + Math.sin(x * 0.9 + t * 6) * 0.6 * (1 - fp)); g.lineTo(26, 26); g.closePath(); g.clip(); }
              g.globalAlpha = vis * (style === 'molten' ? 1 : ease('out', fp));
              g.fillStyle = style === 'molten' ? fillStyleOf(g, 'molten', col, acc, 3, 21) : fillGrad();
              for (const s of sg.fill) g.fill(path2d(s));
              g.fillStyle = '#fff3c4'; for (const s of sg.inner) g.fill(path2d(s));
              if (style === 'molten') g.restore();
            }
          } else if (style === 'burst' || style === 'stamp') {
            const e = style === 'stamp' ? ease('in', C01(p * 1.8)) : ease('back', p);
            const s = style === 'stamp' ? lerp(2.6, 1, e) : Math.max(0.001, e);
            g.translate(12, 12); g.scale(s, s); g.translate(-12, -12);
            g.globalAlpha = vis * C01(p * 3);
            g.shadowColor = acc; g.shadowBlur = 14 * num(P, 'glow', 1);
            g.fillStyle = fillGrad(); for (const s2 of sg.fill) g.fill(path2d(s2));
            g.fillStyle = '#fff3c4'; for (const s2 of sg.inner) g.fill(path2d(s2));
            g.strokeStyle = col; g.lineWidth = lw; for (const s2 of sg.lines) g.stroke(path2d(s2));
          } else if (style === 'glitch') {
            const live = p < 1 ? 1 : Math.max(0, Math.sin(t * 9) > 0.97 ? 0.6 : 0);
            const off = live ? (hash(Math.floor(t * 24)) - 0.5) * 2.4 * live : 0;
            g.globalAlpha = vis * (p > 0 ? (live && hash(Math.floor(t * 30) + 3) < 0.15 ? 0.3 : 1) : 0);
            if (live) { g.globalCompositeOperation = 'lighter'; g.fillStyle = '#ff0040'; for (const s2 of sg.fill) { g.save(); g.translate(off, 0); g.fill(path2d(s2)); g.restore(); } g.fillStyle = '#00e0ff'; for (const s2 of sg.fill) { g.save(); g.translate(-off, 0); g.fill(path2d(s2)); g.restore(); } g.globalCompositeOperation = 'source-over'; }
            g.fillStyle = fillGrad(); for (const s2 of sg.fill) g.fill(path2d(s2));
            g.fillStyle = '#fff3c4'; for (const s2 of sg.inner) g.fill(path2d(s2));
            g.strokeStyle = col; g.lineWidth = lw; for (const s2 of sg.lines) g.stroke(path2d(s2));
          }
          g.restore();
        });
        if (style === 'burst' && p > 0) {
          g.save(); g.globalCompositeOperation = 'lighter'; g.translate(cx, cy); g.rotate(t * 0.3);
          const fl = Math.exp(-(t - st) * 3.5);
          for (let i = 0; i < 18; i++) { g.rotate((Math.PI * 2) / 18); const gr = g.createLinearGradient(0, 0, m * 1.4, 0); gr.addColorStop(0, `rgba(255,215,94,${0.35 * vis})`); gr.addColorStop(1, 'rgba(255,140,66,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(m * 0.3, -m * 0.03); g.lineTo(m * 1.4 * ease('out', p), -m * 0.1); g.lineTo(m * 1.4 * ease('out', p), m * 0.1); g.lineTo(m * 0.3, m * 0.03); g.fill(); }
          g.globalAlpha = fl * vis; g.fillStyle = '#fff6da'; g.beginPath(); g.arc(0, 0, m * (0.4 + (1 - fl) * 1.6), 0, Math.PI * 2); g.fill();
          g.restore();
        }
        if (style === 'particles') {
          const k = `${names.join(',')}`;
          if (k !== dotsKey) { dots = sample(names); dotsKey = k; }
          g.save(); g.globalCompositeOperation = 'lighter';
          const R2 = m * 1.25;
          dots.forEach(([x, y], i) => {
            const d0 = C01((t - st - hash(i) * spd * 0.4) / (spd * 0.6));
            const e = ease('inOut', d0);
            const a = hash(i + 0.5) * Math.PI * 2; const rr2 = (0.6 + hash(i + 7) * 0.9) * Math.max(W, H) * 0.6;
            const fx = cx + Math.cos(a) * rr2; const fy = cy + Math.sin(a) * rr2;
            const tx = cx + x * R2 + Math.sin(t * 2 + i) * m * 0.004; const ty = cy + y * R2 + Math.cos(t * 2.3 + i) * m * 0.004;
            g.globalAlpha = vis * (0.35 + 0.65 * e);
            g.fillStyle = y < 0 ? col : acc;
            g.beginPath(); g.arc(lerp(fx, tx, e), lerp(fy, ty, e), m * 0.0085 * (1.5 - e * 0.5), 0, Math.PI * 2); g.fill();
          });
          g.restore();
        }
      }
      // the wordmark and the line under it
      if (word || tag) {
        const wp = C01((t - st - spd * 0.7) / 0.7);
        if (wp > 0) {
          const fs = Math.min(m * 0.32, (z.w * 0.9) / Math.max(1, word.length * 0.72));
          g.save(); g.globalAlpha = vis * ease('out', wp); g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = `800 ${fs}px ${FONTS.Oxanium}`; if ('letterSpacing' in g) g.letterSpacing = `${Math.round(fs * lerp(0.6, 0.12, ease('expo', wp)))}px`;
          g.fillStyle = fillStyleOf(g, val(P, 'fill', 'gold'), col, acc, cy + m * 0.62 - fs / 2, cy + m * 0.62 + fs / 2);
          g.shadowColor = acc; g.shadowBlur = fs * 0.3 * num(P, 'glow', 1);
          g.fillText(word, cx, cy + m * 0.66);
          if (tag) { g.font = `600 ${fs * 0.34}px ${FONTS.Oxanium}`; if ('letterSpacing' in g) g.letterSpacing = `${Math.round(fs * 0.04)}px`; g.shadowBlur = 0; g.fillStyle = val(P, 'tagColor', '#e9e2d4'); g.globalAlpha = vis * C01((t - st - spd * 0.7 - 0.35) / 0.6); g.fillText(tag, cx, cy + m * 0.66 + fs * 0.85); }
          g.restore();
        }
      }
    });
    return { canvas: S.cv };
  }

  // ---------- brand looks: Forgeheart backgrounds and overlays ----------
  const BRAND = {
    'forge gradient': { name: 'Forge gradient', backdrop: true }, molten: { name: 'Molten', backdrop: true, gl: 'molten' }, aurora: { name: 'Gold aurora', backdrop: true, gl: 'aurora' },
    embers: { name: 'Embers' }, grain: { name: 'Film grain' }, 'light sweep': { name: 'Light sweep' }, vignette: { name: 'Vignette' }, grid: { name: 'Neon grid floor', backdrop: true },
    bokeh: { name: 'Bokeh glow' }, chrome: { name: 'Chrome bands', backdrop: true }, spotlight: { name: 'Spotlight' }, flare: { name: 'Lens flare' }, 'glow orb': { name: 'Glow orb', backdrop: true },
  };
  const BRAND_GL = {
    molten: 'float n = fbm(uv * 3.0 + vec2(t * 0.08, -t * 0.12)); float m = fbm(uv * 6.0 - n * 2.0 + t * 0.1); float v = smoothstep(0.25, 0.85, n * 0.6 + m * 0.6); vec3 col = mix(u_c1, u_c2, v); col = mix(col, u_c3, smoothstep(0.7, 1.0, v + 0.15 * sin(t + uv.x * 4.0))); col += u_c3 * pow(v, 6.0) * 0.6;',
    aurora: 'float y = uv.y + 0.15 * sin(uv.x * 3.0 + t * 0.4) + 0.1 * fbm(vec2(uv.x * 2.0, t * 0.15)); float band = exp(-pow((y - 0.55) * 4.0, 2.0)); float band2 = exp(-pow((y - 0.38) * 6.0, 2.0)); vec3 col = u_c1 * (1.0 - uv.y * 0.5); col += u_c2 * band * (0.6 + 0.4 * fbm(vec2(uv.x * 6.0 + t * 0.2, uv.y * 2.0))); col += u_c3 * band2 * 0.7;',
  };
  function brandGL(kind) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    document.body.append(renderer.domElement);
    addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
    const u = { t: { value: 0 }, u_c1: { value: new THREE.Color() }, u_c2: { value: new THREE.Color() }, u_c3: { value: new THREE.Color() }, uRes: { value: new THREE.Vector2(1, 1) } };
    const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform float t; uniform vec3 u_c1; uniform vec3 u_c2; uniform vec3 u_c3; uniform vec2 uRes; varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 w = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y); }
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
void main() { vec2 uv = vUv; uv.x *= uRes.x / uRes.y; ${BRAND_GL[kind]} gl_FragColor = vec4(col, 1.0); gl_FragColor = linearToOutputTexel(gl_FragColor); }` });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    const cam = new THREE.Camera();
    return { renderer, draw(t, c1, c2, c3) { u.t.value = t; u.u_c1.value.set(c1); u.u_c2.value.set(c2); u.u_c3.value.set(c3); renderer.getDrawingBufferSize(u.uRes.value); renderer.render(scene, cam); }, el: renderer.domElement };
  }
  function brand(P = {}, opts = {}) {
    const S = canvas2d();
    const gls = {};
    let grainC = null;
    every(() => {
      const { g, W, H } = S;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      const style = BRAND[val(P, 'style', opts.style || 'forge gradient')] ? val(P, 'style', opts.style || 'forge gradient') : 'forge gradient';
      const B = BRAND[style];
      const c1 = val(P, 'c1', '#140a24'); const c2 = val(P, 'c2', FORGE.ember); const c3 = val(P, 'c3', FORGE.gold);
      const amt = num(P, 'amount', 1); const sp = num(P, 'speed', 1);
      const t = clock(0) * sp;
      const fade = C01((clock(0) - num(P, 'start', 0)) / Math.max(0.01, num(P, 'fadeIn', 0.6)));
      for (const [k, x] of Object.entries(gls)) x.el.style.display = B.gl === k ? '' : 'none';
      if (B.gl) { (gls[B.gl] ||= brandGL(B.gl)).draw(t, c1, c2, c3); gls[B.gl].el.style.opacity = String(fade); return; }
      const m = Math.min(W, H);
      g.globalAlpha = fade;
      if (style === 'forge gradient') {
        const a = t * 0.12; const r = Math.hypot(W, H) / 2;
        const gr = g.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
        gr.addColorStop(0, c1); gr.addColorStop(0.55, '#3a1340'); gr.addColorStop(0.85, c2); gr.addColorStop(1, c3);
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        const rg = g.createRadialGradient(W * (0.5 + Math.sin(t * 0.2) * 0.2), H * 0.65, 0, W * 0.5, H * 0.65, m * 0.8);
        rg.addColorStop(0, 'rgba(255,170,80,0.35)'); rg.addColorStop(1, 'rgba(255,140,66,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      } else if (style === 'chrome') {
        const gr = g.createLinearGradient(0, 0, W * 0.3, H);
        const o = (t * 0.05) % 1;
        for (let i = 0; i <= 10; i++) { const s = (i / 10 + o) % 1; gr.addColorStop(i / 10, i % 2 ? '#2a2f3a' : (i % 4 === 0 ? '#f2f5fb' : '#8d96a8')); }
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,190,90,0.12)'; g.fillRect(0, 0, W, H);
      } else if (style === 'glow orb') {
        g.fillStyle = c1; g.fillRect(0, 0, W, H);
        const pulse = 1 + Math.sin(t * 1.2) * 0.04;
        const rg = g.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, m * 0.55 * pulse * amt);
        rg.addColorStop(0, c3); rg.addColorStop(0.35, c2); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      } else if (style === 'grid') {
        g.fillStyle = c1; g.fillRect(0, 0, W, H);
        const hz = H * 0.55;
        const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, c1); sky.addColorStop(1, '#4a1a3a'); g.fillStyle = sky; g.fillRect(0, 0, W, hz);
        const sun = g.createRadialGradient(W / 2, hz, 0, W / 2, hz, m * 0.45); sun.addColorStop(0, c3); sun.addColorStop(0.4, c2); sun.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, hz);
        g.strokeStyle = c2; g.lineWidth = Math.max(1, m * 0.003); g.shadowColor = c2; g.shadowBlur = m * 0.01;
        for (let i = -14; i <= 14; i++) { g.beginPath(); g.moveTo(W / 2 + i * W * 0.02, hz); g.lineTo(W / 2 + i * W * 0.22, H); g.stroke(); }
        const sp2 = (t * 0.35) % 1;
        for (let j = 0; j < 14; j++) { const z = (j + sp2) / 14; const y = hz + (H - hz) * z * z; g.globalAlpha = fade * C01(z * 2); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
        g.globalAlpha = fade; g.shadowBlur = 0;
      } else if (style === 'embers') {
        if (val(P, 'backdrop', B.backdrop || false)) { g.fillStyle = c1; g.fillRect(0, 0, W, H); }
        g.globalCompositeOperation = 'lighter';
        const n = Math.round(90 * amt);
        for (let i = 0; i < n; i++) {
          const life = 6 + hash(i) * 6; const ph = ((t + hash(i + 3) * life) % life) / life;
          const x = W * hash(i + 11) + Math.sin(t * 0.8 + i) * m * 0.03; const y = H * (1.05 - ph * 1.15);
          const r = m * (0.002 + hash(i + 5) * 0.006);
          g.globalAlpha = fade * Math.sin(ph * Math.PI) * (0.5 + 0.5 * Math.sin(t * 6 + i));
          g.fillStyle = hash(i + 2) > 0.5 ? c3 : c2; g.shadowColor = c2; g.shadowBlur = r * 4;
          g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
        g.globalCompositeOperation = 'source-over'; g.shadowBlur = 0;
      } else if (style === 'bokeh') {
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) { const x = W * (hash(i) + Math.sin(t * 0.07 + i) * 0.05); const y = H * (hash(i + 4) + Math.cos(t * 0.05 + i) * 0.05); const r = m * (0.03 + hash(i + 9) * 0.08); const rg = g.createRadialGradient(x, y, 0, x, y, r); const c = [c2, c3, FORGE.violet][i % 3]; rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = fade * 0.35 * amt; g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
        g.globalCompositeOperation = 'source-over';
      } else if (style === 'grain') {
        if (!grainC) { grainC = document.createElement('canvas'); grainC.width = grainC.height = 192; }
        const gg = grainC.getContext('2d'); const im = gg.createImageData(192, 192); const d = im.data;
        const seed = Math.floor(t * 24);
        for (let i = 0; i < d.length; i += 4) { const v = hash(i * 0.37 + seed * 13.1) * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        gg.putImageData(im, 0, 0);
        g.globalAlpha = fade * 0.14 * amt; g.imageSmoothingEnabled = false;
        const s = Math.max(1, Math.round(devicePixelRatio * 1.5));
        for (let y = 0; y < H; y += 192 * s) for (let x = 0; x < W; x += 192 * s) g.drawImage(grainC, x, y, 192 * s, 192 * s);
      } else if (style === 'light sweep') {
        const per = Math.max(0.5, num(P, 'every', 3)); const ph = ((t % per) / per) * 1.8 - 0.4;
        const x = ph * (W + H);
        const gr = g.createLinearGradient(x - m * 0.3, 0, x + m * 0.3, H * 0.3);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,236,190,${0.45 * amt})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
      } else if (style === 'vignette') {
        const rg = g.createRadialGradient(W / 2, H / 2, m * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
        rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, `rgba(0,0,0,${0.75 * amt})`); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      } else if (style === 'spotlight') {
        g.globalCompositeOperation = 'lighter';
        const x = W / 2 + Math.sin(t * 0.4) * W * 0.12;
        const gr = g.createLinearGradient(x, 0, x, H); gr.addColorStop(0, `rgba(255,230,170,${0.4 * amt})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x - m * 0.05, 0); g.lineTo(x + m * 0.05, 0); g.lineTo(x + m * 0.45, H); g.lineTo(x - m * 0.45, H); g.closePath(); g.fill();
        const fl = g.createRadialGradient(x, H * 0.86, 0, x, H * 0.86, m * 0.45); fl.addColorStop(0, `rgba(255,215,94,${0.35 * amt})`); fl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fl; g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
      } else if (style === 'flare') {
        const per = Math.max(1, num(P, 'every', 4)); const ph = (t % per) / per;
        const x = W * lerp(-0.2, 1.2, ph); const y = H * 0.3;
        g.globalCompositeOperation = 'lighter';
        const rg = g.createRadialGradient(x, y, 0, x, y, m * 0.35); rg.addColorStop(0, `rgba(255,240,200,${0.8 * amt})`); rg.addColorStop(0.2, `rgba(255,170,80,${0.35 * amt})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
        for (let i = 1; i <= 4; i++) { const k = i * 0.28; const fx = lerp(x, W - x, k); const fy = lerp(y, H - y, k); g.globalAlpha = 0.18 * amt * fade; g.fillStyle = [c2, c3, FORGE.violet, FORGE.blue][i - 1]; g.beginPath(); g.arc(fx, fy, m * 0.02 * (1 + i * 0.6), 0, Math.PI * 2); g.fill(); }
        g.fillStyle = `rgba(255,220,160,${0.25 * amt})`; g.globalAlpha = fade; g.fillRect(0, y - m * 0.002, W, m * 0.004);
        g.globalCompositeOperation = 'source-over';
      }
    });
    return { canvas: S.cv };
  }

  // ---------- end cards (name, a line, a call to action) ----------
  const CARD_STYLES = ['forge', 'light', 'molten', 'duo', 'minimal'];
  function endcard(P = {}, opts = {}) {
    const S = canvas2d();
    const fl = { fill: MARKS.flame.fill.map((d) => path2d(parsePath(d))), inner: MARKS.flame.inner.map((d) => path2d(parsePath(d))) };
    const duo = { claude: MARKS.claude.lines.map((d) => path2d(parsePath(d))), astra: MARKS.astra.fill.map((d) => path2d(parsePath(d))) };
    every(() => {
      const { g, W, H } = S;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      const style = CARD_STYLES.includes(val(P, 'style', opts.style || 'forge')) ? val(P, 'style', opts.style || 'forge') : 'forge';
      const st = num(P, 'start', 0.2); const hold = num(P, 'hold', 3);
      const loop = st + 2.4 + hold;
      const t = clock(loop);
      const vis = follows() ? 1 : 1 - C01((t - loop + 0.5) / 0.45);
      const z = safe(W, H, 'title');
      const portrait = W / H < 0.9;
      const light = style === 'light';
      const ink = light ? '#17130c' : '#fff6e6'; const acc = val(P, 'accent', light ? '#c8641c' : FORGE.gold);
      if (val(P, 'backdrop', true) !== false && val(P, 'backdrop', true) !== 'off') {
        g.globalAlpha = C01((t - st + 0.2) / 0.4) * vis;
        if (light) { g.fillStyle = FORGE.paper; g.fillRect(0, 0, W, H); }
        else { const gr = g.createLinearGradient(0, 0, W * 0.4, H); gr.addColorStop(0, '#0b0b12'); gr.addColorStop(0.6, '#1c0f26'); gr.addColorStop(1, style === 'molten' ? '#5a1a0a' : '#2a1208'); g.fillStyle = gr; g.fillRect(0, 0, W, H); const rg = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.min(W, H) * 0.7); rg.addColorStop(0, 'rgba(255,160,70,0.22)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
      }
      const name = String(val(P, 'title', 'Hearth')); const line = String(val(P, 'line', 'Claude and Astra, in one app')); const cta = String(val(P, 'cta', 'Try Hearth')); const handle = String(val(P, 'handle', ''));
      const m = Math.min(z.w, z.h);
      const markS = (portrait ? z.w * 0.32 : z.h * 0.34) * num(P, 'size', 1);
      // portrait: a column; landscape: the mark on the left, the words on the right
      const mx = portrait || style === 'minimal' ? z.x + z.w / 2 : z.x + z.w * 0.26; const my = portrait ? z.y + z.h * 0.3 : z.y + z.h * 0.5;
      const tx = portrait || style === 'minimal' ? z.x + z.w / 2 : z.x + z.w * 0.48; const align = portrait || style === 'minimal' ? 'center' : 'left';
      let ty = portrait ? my + markS * 0.75 : z.y + z.h * 0.36;
      if (style === 'minimal') ty = z.y + z.h * 0.42;
      // the mark
      const pm = ease('back', (t - st) / 0.7);
      if (style !== 'minimal' && pm > 0) {
        g.save(); g.globalAlpha = C01((t - st) / 0.3) * vis; g.translate(mx, my); g.scale(pm, pm);
        if (style === 'duo') {
          g.lineCap = 'round'; g.lineJoin = 'round';
          const k = markS / 24 * 0.7;
          g.save(); g.translate(-markS * 0.45, 0); g.scale(k, k); g.translate(-12, -12); g.strokeStyle = FORGE.ember; g.lineWidth = 1.9; g.shadowColor = FORGE.ember; g.shadowBlur = 6; for (const p of duo.claude) g.stroke(p); g.restore();
          g.font = `700 ${markS * 0.3}px ${FONTS.Oxanium}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('×', 0, 0);
          g.save(); g.translate(markS * 0.45, 0); g.scale(k, k); g.translate(-12, -12); g.fillStyle = FORGE.violet; g.shadowColor = FORGE.violet; g.shadowBlur = 6; for (const p of duo.astra) g.fill(p); g.restore();
        } else {
          const k = markS / 24; g.scale(k, k); g.translate(-12, -12);
          const gr = g.createLinearGradient(0, 3, 0, 21); gr.addColorStop(0, style === 'molten' ? '#ffe08a' : acc); gr.addColorStop(1, style === 'molten' ? '#ff3b2f' : FORGE.ember);
          g.shadowColor = FORGE.ember; g.shadowBlur = 10; g.fillStyle = gr; for (const p of fl.fill) g.fill(p);
          g.fillStyle = '#fff3c4'; for (const p of fl.inner) g.fill(p);
        }
        g.restore();
      }
      // the name, the line, the button, the handle
      const fs = Math.min(m * (portrait ? 0.22 : 0.2), (z.w * (portrait || style === 'minimal' ? 0.9 : 0.5)) / Math.max(1, name.length * 0.62)) * num(P, 'size', 1);
      g.textAlign = align; g.textBaseline = 'middle';
      const np = C01((t - st - 0.35) / 0.6);
      if (np > 0) {
        g.save(); g.beginPath(); g.rect(0, ty - fs * 0.62, W, fs * 1.24); g.clip();
        g.globalAlpha = vis; g.font = `800 ${fs}px ${FONTS.Oxanium}`;
        g.fillStyle = style === 'molten' ? fillStyleOf(g, 'molten', ink, acc, ty - fs / 2, ty + fs / 2) : style === 'forge' ? fillStyleOf(g, 'gold', ink, acc, ty - fs / 2, ty + fs / 2) : ink;
        g.fillText(name, tx, ty + (1 - ease('expo', np)) * fs * 1.2);
        g.restore();
      }
      const lp = C01((t - st - 0.7) / 0.6);
      const ly = ty + fs * 0.85;
      if (lp > 0 && line) { g.save(); g.globalAlpha = ease('out', lp) * vis; g.font = `600 ${fs * 0.3}px ${FONTS.Oxanium}`; g.fillStyle = light ? '#4a4032' : '#e6dccb'; g.fillText(line, tx, ly + (1 - ease('out', lp)) * fs * 0.2); g.restore(); }
      const cp = ease('back', (t - st - 1.05) / 0.55);
      if (cp > 0 && cta) {
        g.save(); g.font = `800 ${fs * 0.3}px ${FONTS.Oxanium}`;
        const bw = g.measureText(cta).width + fs * 0.7; const bh = fs * 0.56;
        const bx = align === 'center' ? tx - bw / 2 : tx; const by = ly + fs * 0.42;
        g.translate(bx + bw / 2, by + bh / 2); g.scale(cp, cp); g.translate(-(bx + bw / 2), -(by + bh / 2));
        g.globalAlpha = vis; rr(g, bx, by, bw, bh, bh / 2); g.fillStyle = acc; g.shadowColor = acc; g.shadowBlur = fs * 0.25; g.fill(); g.shadowBlur = 0;
        // a sheen crossing the button every few seconds
        const sh = ((t - st - 1.4) % 2.6) / 0.6;
        if (sh > 0 && sh < 1) { g.save(); rr(g, bx, by, bw, bh, bh / 2); g.clip(); const sx = bx + sh * (bw + bh) - bh; const gr = g.createLinearGradient(sx, 0, sx + bh, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(bx, by, bw, bh); g.restore(); }
        g.fillStyle = light ? '#fff' : '#17110a'; g.textAlign = 'center'; g.fillText(cta, bx + bw / 2, by + bh / 2 + 1);
        g.restore();
      }
      const hp = C01((t - st - 1.4) / 0.5);
      if (hp > 0 && handle) { g.save(); g.globalAlpha = hp * vis * 0.85; g.font = `600 ${fs * 0.22}px ${FONTS.Oxanium}`; g.fillStyle = light ? '#4a4032' : '#cfc6b6'; g.fillText(handle, tx, ly + fs * 1.3); g.restore(); }
    });
    return { canvas: S.cv };
  }

  // ---------- 3D type: letters with depth (a stack of slices), animated one by one on the 3D stage ----------
  const TYPE3D = {
    'spin-in': { name: 'Spin in', f: (e, p, i) => ({ ry: lerp(-Math.PI, 0, e), s: lerp(0.3, 1, ease('out', p)), a: C01(p * 3) }) },
    tumble: { name: 'Tumble', f: (e, p, i) => ({ rx: lerp(-Math.PI * 1.5, 0, e), y: lerp(3, 0, ease('bounce', p)), a: C01(p * 3) }) },
    'fly-through': { name: 'Fly through', f: (e, p, i) => ({ z: lerp(-40, 0, ease('expo', p)), a: C01(p * 2), ry: lerp(0.6, 0, e) }) },
    swing: { name: 'Swing down', f: (e, p, i) => ({ rx: lerp(-Math.PI / 2, 0, ease('elastic', p)), a: C01(p * 4), pivot: 1 }) },
    domino: { name: 'Domino', f: (e, p, i) => ({ rz: lerp(-Math.PI / 2, 0, ease('bounce', p)), x: lerp(-0.6, 0, e), a: C01(p * 3) }) },
    orbit: { name: 'Orbit in', f: (e, p, i, n) => { const a = (1 - e) * Math.PI * 2 + i; return { x: Math.cos(a) * (1 - e) * 6, z: Math.sin(a) * (1 - e) * 6, ry: (1 - e) * 3, a: C01(p * 2) }; } },
  };
  function type3d(P = {}, opts = {}) {
    const R = stage3d();
    let key = ''; let letters = []; let spanW = 1;
    function build(text, font, color, side, depth) {
      for (const l of letters) { R.scene.remove(l.root); l.root.traverse((x) => { x.geometry?.dispose(); x.material?.map?.dispose(); x.material?.dispose(); }); }
      letters = [];
      const chars = Array.from(text);
      const meas = document.createElement('canvas').getContext('2d'); meas.font = `800 200px ${fontOf(font)}`;
      const widths = chars.map((ch) => (ch === ' ' ? 70 : meas.measureText(ch).width + 10));
      const total = widths.reduce((a, b) => a + b, 0); spanW = total / 100;
      let x = -total / 2;
      chars.forEach((ch, i) => {
        const w = widths[i];
        if (ch !== ' ') {
          const c = document.createElement('canvas'); c.width = Math.ceil(w) + 40; c.height = 280; const g = c.getContext('2d');
          g.font = `800 200px ${fontOf(font)}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = fillStyleOf(g, color === 'gold' ? 'gold' : color === 'chrome' ? 'chrome' : color === 'molten' ? 'molten' : 'solid', color.startsWith('#') ? color : '#ffffff', FORGE.ember, 60, 220); g.fillText(ch, c.width / 2, 140);
          const tex = canvasTex(c);
          const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
          const pw = c.width / 100; const ph = c.height / 100;
          const N = Math.max(2, Math.round(depth * 14));
          for (let k = 0; k < N; k++) {
            const front = k === 0;
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: front ? '#ffffff' : new THREE.Color(side).multiplyScalar(lerp(1, 0.35, k / N)) });
            const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat); m.position.z = -k * (depth * 0.6) / N; m.renderOrder = N - k; body.add(m);
          }
          root.position.x = (x + w / 2) / 100;
          root.userData.x0 = root.position.x;
          R.scene.add(root);
          letters.push({ root, body, i: letters.length, mats: body.children.map((m) => m.material), h: ph });
        }
        x += w;
      });
    }
    every(() => {
      let text = String(val(P, 'text', opts.text || 'HEARTH'));
      if (val(P, 'case', 'UPPER') === 'UPPER') text = text.toUpperCase();
      const preset = TYPE3D[val(P, 'preset', opts.preset || 'spin-in')] || TYPE3D['spin-in'];
      const col = String(val(P, 'color', 'gold')); const side = val(P, 'side', FORGE.ember);
      const k = `${text}|${val(P, 'font', 'Oxanium')}|${col}|${side}|${num(P, 'depth', 0.5)}`;
      if (k !== key) { build(text, val(P, 'font', 'Oxanium'), col, side, num(P, 'depth', 0.5)); key = k; }
      const st = num(P, 'start', 0.2); const spd = Math.max(0.05, num(P, 'speed', 0.9)); const stag = num(P, 'stagger', 0.08); const hold = num(P, 'hold', 2.5);
      const n = letters.length;
      const ws = follows() && val(P, 'timing', 'seconds') !== 'seconds' ? beatTimes(n, { start: st, every: num(P, 'every', 1), secs: stag, mode: val(P, 'timing', 'seconds') }) : null;
      const startOf = (i) => (ws && ws.used !== 'seconds' ? ws[i] : st + i * stag);
      const end = startOf(Math.max(0, n - 1)) + spd;
      const loop = end + hold + 1;
      const t = clock(loop);
      const outAt = num(P, 'out', 0) > 0 ? num(P, 'out', 0) : follows() ? Infinity : end + hold;
      const ex = C01((t - outAt) / 0.6);
      const pose = placeCamera(R, spanW * 1.18 / Math.max(0.2, num(P, 'size', 1)) * 1, 2.8, { size: 1, follow: val(P, 'follow', true) }, { y: (num(P, 'y', 0.5) - 0.5) * 2.8 * 1.6 });
      letters.forEach((l) => {
        const p = C01((t - startOf(l.i)) / spd);
        const o = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, a: 1, ...preset.f(ease('back', p), p, l.i, n) };
        if (ex > 0) { o.a *= 1 - ex; o.y += ease('in', ex) * 2; }
        const wob = num(P, 'float', 0.5);
        l.root.position.set(l.root.userData.x0 + o.x, o.y + Math.sin(t * 1.2 + l.i * 0.7) * 0.06 * wob, o.z);
        l.root.rotation.set(o.rx + Math.sin(t * 0.8 + l.i) * 0.05 * wob, o.ry, o.rz);
        l.root.scale.setScalar(Math.max(1e-4, o.s));
        l.body.position.y = o.pivot ? -l.h * 0.2 : 0;
        const bl = dofBlur(pose, P, o.z);
        for (const m of l.mats) m.opacity = C01(o.a) * (1 - bl * 0.5);
        l.root.visible = o.a > 0.003;
      });
      R.renderer.render(R.scene, R.camera);
    });
    return { renderer: R.renderer, canvas: R.renderer.domElement };
  }

  // ---------- the catalog (for the hub: names, presets, what each kind takes) ----------
  const names = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.name || k]));
  return {
    type, type3d, ui, cursor, camera, logo, brand, endcard,
    clock, beatTimes, safe, ease, mock, parsePath,
    presets: { type: names(TYPE), type3d: names(TYPE3D), ui: names(UI_LAYOUTS), camera: names(CAMERA), logo: Object.keys(LOGO_STYLES), brand: names(BRAND), endcard: CARD_STYLES, frames: Object.keys(FRAMES), mocks: MOCKS, exits: EXITS, fonts: Object.keys(FONTS) },
  };
})();
globalThis.motion = motion;
};
