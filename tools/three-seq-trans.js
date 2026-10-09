// Lab transitions (seq2): moves between scenes that only a live 3D Lab can do well, added to the editor's own
// transitions (EditFX, tools/cut-presets.js) in a "Lab" group, so the Lab sequence, the video editor and its
// ffmpeg render all know them. Each one has three halves:
//   preview(g, A, B, p, W, H)   a 2D canvas version (the editor's preview, and the Lab's when it has nothing better)
//   ff / expr                   the ffmpeg xfade version (the editor's render; scenes are baked first)
//   lab                         what the Lab does on top: 'cam' moves each scene's own 3D camera (fly-through),
//                               'shared' keeps the layers both scenes share on screen (morph), 'only' = the editor
//                               bakes the two scenes and the transition together through the Lab (exact).
// This file is also sent into the Lab preview with the editor's drawing code (tools/three-seq.js libs()).
// No dependencies but EditFX; loads in Node for tests (module.exports at the bottom).
const SeqTrans = (() => {
  const FX = typeof EditFX !== 'undefined' ? EditFX : (typeof require !== 'undefined' ? require('./cut-presets.js') : null);
  const PI = Math.PI;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
  const sstep = (a, b, x) => ease((x - a) / (b - a || 1));
  const hash = (a, b) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
  const full = (g, S, W, H) => g.drawImage(S, 0, 0, W, H);
  // scratch canvases (one per purpose, reused: no garbage per frame)
  const pads = {};
  function pad(name, w, h) {
    if (typeof document === 'undefined') return null;
    let c = pads[name];
    if (!c) { c = document.createElement('canvas'); pads[name] = c; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  // a picture drawn around a point, scaled (k), rotated (r), moved (dx, dy), with alpha
  function drawAt(g, S, W, H, { cx = W / 2, cy = H / 2, k = 1, r = 0, dx = 0, dy = 0, alpha = 1, filter = 'none' } = {}) {
    g.save();
    g.globalAlpha = alpha; g.filter = filter;
    g.translate(cx + dx, cy + dy); g.rotate(r); g.scale(k, k); g.translate(-cx, -cy);
    g.drawImage(S, 0, 0, W, H);
    g.restore();
  }
  // the brightness of a picture, small (≤ 64 px wide): { data (0..1 per pixel), w, h }
  const MASK_W = 64;
  function luma(S, W, H, name = 'luma') {
    const w = MASK_W; const h = Math.max(4, Math.round((H / W) * MASK_W));
    const c = pad(name, w, h); if (!c) return null;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(S, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const data = new Float32Array(w * h);
    for (let i = 0; i < data.length; i += 1) data[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
    return { data, w, h };
  }
  // B shows where its mask says (0..1 per pixel of the small mask), drawn smooth over A
  function maskedOver(g, A, B, W, H, mask, alphaOf) {
    const { w, h, data } = mask;
    const mc = pad('mask', w, h); const mg = mc.getContext('2d');
    const im = mg.createImageData(w, h);
    for (let i = 0; i < data.length; i += 1) { im.data[i * 4 + 3] = Math.round(255 * clamp(alphaOf(data[i], i))); }
    mg.putImageData(im, 0, 0);
    const t = pad('maskB', W, H); const tg = t.getContext('2d');
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, W, H); tg.drawImage(B, 0, 0, W, H);
    tg.globalCompositeOperation = 'destination-in'; tg.imageSmoothingEnabled = true; tg.drawImage(mc, 0, 0, W, H);
    tg.globalCompositeOperation = 'source-over';
    full(g, A, W, H);
    g.drawImage(t, 0, 0, W, H);
  }
  // where a picture's bright shape is: its center and size (0..1 of the frame), from its brightest pixels
  function shapeOf(S, W, H, name) {
    const L = luma(S, W, H, name);
    if (!L) return { x: 0.5, y: 0.5, r: 0.3 };
    const sorted = Float32Array.from(L.data).sort();
    const thr = Math.max(0.15, sorted[Math.floor(sorted.length * 0.85)] || 0.5);
    let sx = 0; let sy = 0; let n = 0;
    for (let y = 0; y < L.h; y += 1) for (let x = 0; x < L.w; x += 1) if (L.data[y * L.w + x] >= thr) { sx += x; sy += y; n += 1; }
    if (!n) return { x: 0.5, y: 0.5, r: 0.3 };
    return { x: (sx / n + 0.5) / L.w, y: (sy / n + 0.5) / L.h, r: clamp(Math.sqrt(n / (L.w * L.h)), 0.05, 1) };
  }

  // ---------- ffmpeg expressions (YUV 4:2:0 planes; P runs 1 → 0, A = outgoing, B = incoming) ----------
  const planeOf = (Y, U, V) => `if(eq(PLANE,0),${Y},if(eq(PLANE,1),${U},${V}))`;
  const pick = (who, x, y) => planeOf(`${who}0(${x},${y})`, `${who}1(${x},${y})`, `${who}2(${x},${y})`);
  const P = '(1-P)'; // 0 → 1
  // A's brightness at this sample (chroma planes are half size: their luma is at 2X, 2Y)
  const lumA = 'if(eq(PLANE,0),a0(X,Y),a0(2*X,2*Y))/255';
  const zoomPick = (who, k) => pick(who, `(X-W/2)/(${k})+W/2`, `(Y-H/2)/(${k})+H/2`);
  const exprs = {
    fly: `if(lt(${P},0.5),${zoomPick('a', `1+${P}*${P}*12`)},${zoomPick('b', `1/(1+(1-${P})*(1-${P})*3)`)})`,
    flyBack: `if(lt(${P},0.5),${zoomPick('a', `1/(1+${P}*${P}*3)`)},${zoomPick('b', `1+(1-${P})*(1-${P})*12`)})`,
    depth: `if(lt(1-${lumA},${P}*1.3-0.15),B,A)`,
    depthFar: `if(lt(${lumA},${P}*1.3-0.15),B,A)`,
    mosh: (() => {
      const h = (a, b) => `mod(abs(sin(${a}*12.9898+${b}*78.233)*43758.5453),1)`;
      const bx = 'floor(X/(W/12))'; const by = 'floor(Y/(H/20))';
      const off = `(${h(bx, by)}-0.5)*W*0.12*(1-${P})`;
      return `if(lt(${h(bx, by)},${P}*1.35-0.2),${pick('b', `X+${off}`, 'Y')},${pick('a', `X-${off}*${P}`, `Y+(${h(by, bx)}-0.5)*H*0.04*${P}`)})`;
    })(),
    flash: `min(255,if(lt(${P},0.5),A,B)+if(eq(PLANE,0),235-if(lt(${P},0.5),A,B),0)*pow(max(0,1-abs(${P}-0.5)*3),1.5))`,
    bloom: `if(lt(${P},0.5),A,B)*(1-0.6*sin(${P}*PI))+if(eq(PLANE,0),235,128)*0.6*sin(${P}*PI)`,
    match: `if(lt(hypot(X-W/2,Y-H/2),hypot(W,H)/2*${P}*1.1),B,A)`,
  };

  // ---------- the transitions ----------
  const T = (id, name, d, preview, extra = {}) => ({ id, name, group: 'Lab', ff: null, preview, d, ...extra });
  // camera fly-through: A rushes past the camera, B arrives from behind it (the Lab moves each scene's own camera)
  const fly = (back) => (g, A, B, p, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const a = ease(p * 1.6); const b = ease((p - 0.4) / 0.6);
    const ka = back ? 1 / (1 + a * 2.5) : 1 + a * a * 6; const kb = back ? 1 + (1 - b) * (1 - b) * 6 : 1 / (1 + (1 - b) * 2.5);
    const blur = (x) => `blur(${(Math.sin(clamp(x) * PI) * W * 0.006).toFixed(1)}px)`;
    if (p < 0.75) drawAt(g, A, W, H, { k: ka, alpha: 1 - sstep(0.45, 0.75, p), filter: blur(p * 1.4) });
    if (p > 0.35) drawAt(g, B, W, H, { k: kb, alpha: sstep(0.35, 0.65, p), filter: blur(1 - (p - 0.35) / 0.65) });
  };
  // the Lab's own mix once each camera has moved: an eased dissolve with a little light at the crossing
  const flyMix = (g, A, B, p, W, H) => {
    full(g, A, W, H); g.globalAlpha = sstep(0.38, 0.62, p); full(g, B, W, H); g.globalAlpha = 1;
    const k = Math.max(0, 1 - Math.abs(p - 0.5) * 5) * 0.35;
    if (k > 0.01) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = k; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  };
  // morph (the 2D stand-in): the two pictures melt through each other, a slight swell
  const morph2d = (g, A, B, p, W, H) => {
    drawAt(g, A, W, H, { k: 1 + 0.04 * ease(p) });
    drawAt(g, B, W, H, { k: 1.04 - 0.04 * ease(p), alpha: ease(p), filter: `blur(${(Math.sin(p * PI) * W * 0.004).toFixed(1)}px)` });
  };
  // depth wipe: the nearest (brightest) parts switch first, the far (dark) ones last; far: the other way round
  const depth = (far) => (g, A, B, p, W, H) => {
    const L = luma(A, W, H);
    if (!L) { full(g, p < 0.5 ? A : B, W, H); return; }
    const s = 0.12; const q = p * (1 + 2 * s) - s;
    maskedOver(g, A, B, W, H, L, (l) => ((far ? l : 1 - l) < q ? clamp((q - (far ? l : 1 - l)) / s) : 0));
  };
  // datamosh: blocks of the new scene smear in with the old one's motion, the old one tears
  const mosh = (g, A, B, p, W, H) => {
    full(g, A, W, H);
    const cols = 12; const rows = Math.max(8, Math.round((H / W) * cols));
    const bw = W / cols; const bh = H / rows;
    const sw = (S) => S.videoWidth || S.naturalWidth || S.width; const sh = (S) => S.videoHeight || S.naturalHeight || S.height;
    for (let i = 0; i < cols; i += 1) for (let j = 0; j < rows; j += 1) {
      const h0 = hash(i, j); const on = h0 < p * 1.35 - 0.2;
      const S = on ? B : A;
      const dx = on ? (h0 - 0.5) * W * 0.12 * (1 - p) : -(hash(j, i) - 0.5) * W * 0.06 * p;
      const dy = on ? 0 : (hash(j + 3, i) - 0.5) * H * 0.04 * p;
      const kx = sw(S) / W; const ky = sh(S) / H;
      const sx = clamp(i * bw - dx, 0, W - bw); const sy = clamp(j * bh - dy, 0, H - bh);
      g.drawImage(S, sx * kx, sy * ky, bw * kx, bh * ky, i * bw, j * bh, bw + 1, bh + 1);
    }
    // a few torn rows repeat (the codec losing its place)
    const tear = Math.sin(p * PI);
    if (tear > 0.3) for (let r = 0; r < 3; r += 1) { const y = Math.floor(hash(r, Math.floor(p * 9)) * rows) * bh; g.drawImage(g.canvas, 0, y, W, bh, (hash(r + 1, 2) - 0.5) * W * 0.1 * tear, y + bh, W, bh * 2); }
  };
  // match cut on the shape: A pushes in on its brightest shape, B's own shape takes its place at the same spot and
  // size, then settles to its own framing
  const match = (g, A, B, p, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const sa = shapeOf(A, W, H, 'lumaA'); const sb = shapeOf(B, W, H, 'lumaB');
    if (p < 0.5) { const e = ease(p * 2); drawAt(g, A, W, H, { cx: sa.x * W, cy: sa.y * H, k: 1 + 0.5 * e }); return; }
    const e = ease((p - 0.5) * 2);
    const k0 = (sa.r * 1.5) / Math.max(0.05, sb.r); const k = k0 + (1 - k0) * e;
    const dx = (sa.x - sb.x) * W * (1 - e); const dy = (sa.y - sb.y) * H * (1 - e);
    drawAt(g, B, W, H, { cx: sb.x * W, cy: sb.y * H, k: clamp(k, 0.3, 4), dx, dy });
    if (p < 0.6) { g.globalAlpha = 1 - (p - 0.5) * 10; g.globalCompositeOperation = 'lighter'; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
  };
  // light flash on the beat: the picture blows out to white right on the cut (the cut sits on a bar line)
  const flash = (g, A, B, p, W, H) => {
    const k = Math.pow(Math.max(0, 1 - Math.abs(p - 0.5) * 3), 1.5);
    full(g, p < 0.5 ? A : B, W, H);
    if (k > 0.01) { g.save(); g.globalCompositeOperation = 'lighter'; g.filter = `blur(${(k * W * 0.01).toFixed(1)}px)`; g.globalAlpha = k; full(g, p < 0.5 ? A : B, W, H); g.filter = 'none'; g.fillStyle = '#fff'; g.globalAlpha = k * 0.9; g.fillRect(0, 0, W, H); g.restore(); }
  };
  // bloom through: everything glows up, swaps inside the glow, comes back down
  const bloom = (g, A, B, p, W, H) => {
    const k = Math.sin(p * PI);
    full(g, p < 0.5 ? A : B, W, H);
    g.save(); g.globalCompositeOperation = 'screen'; g.filter = `blur(${(k * W * 0.02).toFixed(1)}px) brightness(${(1 + k * 1.5).toFixed(2)})`; g.globalAlpha = k; full(g, p < 0.5 ? A : B, W, H); g.restore();
  };
  // glitch cut: a stutter of both sides (frames repeating out of order) before it lands
  const stutter = (g, A, B, p, W, H) => {
    const step = Math.floor(p * 10);
    const S = hash(step, 7) < p ? B : A;
    const shift = (hash(step, 3) - 0.5) * W * 0.06 * Math.sin(p * PI);
    full(g, S, W, H);
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * Math.sin(p * PI); g.filter = 'hue-rotate(180deg)'; g.drawImage(S, shift, 0, W, H); g.restore();
  };
  const LAB = [
    T('lab-fly', 'Camera fly-through', 0.8, fly(false), { expr: exprs.fly, lab: 'cam', cam: 1, labMix: flyMix, desc: 'each scene\'s own 3D camera flies forward: out of one, into the next' }),
    T('lab-fly-back', 'Camera pull-back', 0.8, fly(true), { expr: exprs.flyBack, lab: 'cam', cam: -1, labMix: flyMix, desc: 'the camera pulls back out of one scene and lands in the next' }),
    T('lab-morph', 'Morph (shared layers stay)', 1, morph2d, { ff: 'fade', lab: 'shared', desc: 'the layers both scenes share stay on screen; only what differs changes' }),
    T('lab-depth', 'Depth wipe (near first)', 0.7, depth(false), { expr: exprs.depth, desc: 'the nearest, brightest parts switch first' }),
    T('lab-depth-far', 'Depth wipe (far first)', 0.7, depth(true), { expr: exprs.depthFar, desc: 'the far, dark parts switch first' }),
    T('lab-mosh', 'Datamosh between scenes', 0.6, mosh, { expr: exprs.mosh, desc: 'blocks of the new scene smear in with the old one\'s motion' }),
    T('lab-stutter', 'Glitch stutter', 0.4, stutter, { expr: exprs.mosh, desc: 'frames of both sides stutter before it lands' }),
    T('lab-match', 'Match cut on the shape', 0.6, match, { expr: exprs.match, desc: 'the new scene\'s shape lands where the old one\'s was' }),
    T('lab-flash-beat', 'Light flash on the beat', 0.35, flash, { expr: exprs.flash, beat: true, desc: 'a white flash right on the beat of the cut' }),
    T('lab-bloom', 'Bloom through', 0.6, bloom, { expr: exprs.bloom, desc: 'everything glows up, swaps inside the glow' }),
  ];
  // into the editor's catalog (once): before "Cut", in their own group
  function install(fx = FX) {
    if (!fx?.TRANSITIONS || fx.TRANS['lab-fly']) return fx;
    const cut = fx.TRANSITIONS.findIndex((t) => t.id === 'cut');
    fx.TRANSITIONS.splice(cut < 0 ? fx.TRANSITIONS.length : cut, 0, ...LAB);
    for (const t of LAB) fx.TRANS[t.id] = t;
    return fx;
  }
  install();
  // the ones the editor must bake through the Lab with both scenes (its own render can't do them)
  const bakeTogether = (type) => (FX?.TRANS?.[type] || LAB.find((t) => t.id === type))?.lab === 'shared' || /^lab-fly/.test(type || '');
  return { LAB, install, bakeTogether, exprs, _test: { shapeOf, luma, hash } };
})();
if (typeof module !== 'undefined') module.exports = SeqTrans;
