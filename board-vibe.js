// Vibe descriptors for mood board items, computed locally (no model, no tokens): what a reference FEELS like, so a
// chat can borrow its vibe instead of its footage.
//   still:  palette (k-means, share), light (key, contrast), color (saturation, colorfulness, warmth), texture (edge
//           density, grain), composition (weight centroid, thirds, symmetry, negative space, horizon), aspect
//   video:  the above from a few frames + motion energy, cuts (scene changes), seconds per shot, light arc, strobe
//   site:   the snapshot's vibe + fonts, theme color, words
// BoardVibe.text(item, keys) is the compact line chats get; BoardVibe.summary(items) the board-level vibe.
// fromPixels / summary / text are pure (dev tests run them in Node); load* use the page's canvas and media.
const BoardVibe = (() => {
  const D = typeof BoardData !== 'undefined' ? BoardData : require('./board-data.js');
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // ---------- palette: k-means in RGB, deterministic seeds (luminance quantiles) ----------
  function palette(data, step = 2, k = 6) {
    const px = [];
    for (let i = 0; i < data.length; i += 4 * step) if (data[i + 3] > 127) px.push([data[i], data[i + 1], data[i + 2]]);
    if (!px.length) return [];
    const lum = (p) => p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722;
    const sorted = [...px].sort((a, b) => lum(a) - lum(b));
    // seeds: luminance quantiles plus the most saturated pixel (so a small accent color isn't swallowed)
    let centers = Array.from({ length: k - 1 }, (_, i) => [...sorted[Math.floor(((i + 0.5) / (k - 1)) * (sorted.length - 1))]]);
    let best = px[0]; let bestS = -1;
    for (const p of px) { const mx = Math.max(...p); const s = mx ? (mx - Math.min(...p)) / mx * (mx / 255) : 0; if (s > bestS) { bestS = s; best = p; } }
    centers.push([...best]);
    const assign = new Int32Array(px.length);
    for (let it = 0; it < 9; it++) {
      const sum = centers.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < px.length; i++) {
        const p = px[i]; let bi = 0; let bd = Infinity;
        for (let c = 0; c < centers.length; c++) { const q = centers[c]; const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bd) { bd = d; bi = c; } }
        assign[i] = bi; const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
      }
      centers = centers.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3], sum[i][3]] : [...c.slice(0, 3), 0]));
    }
    // merge near-duplicates, drop empties
    const out = [];
    for (const c of centers.filter((x) => x[3] > 0).sort((a, b) => b[3] - a[3])) {
      const near = out.find((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 22);
      if (near) { const n = near[3] + c[3]; for (let j = 0; j < 3; j++) near[j] = (near[j] * near[3] + c[j] * c[3]) / n; near[3] = n; } else out.push([...c]);
    }
    return out.map((c) => ({ hex: D.rgbToHex(c[0], c[1], c[2]), share: r2(c[3] / px.length) })).filter((c) => c.share >= 0.01).slice(0, 6);
  }

  // ---------- one still (RGBA pixels, w × h, at most ~200 px a side) ----------
  function fromPixels(data, w, h) {
    const n = w * h;
    const Y = new Float32Array(n);
    let sumY = 0; let sumS = 0; let nS = 0; let warm = 0; let warmW = 0;
    let rgS = 0; let ybS = 0; let rgQ = 0; let ybQ = 0;
    const hues = new Array(12).fill(0);
    for (let i = 0; i < n; i++) {
      const r = data[i * 4]; const g = data[i * 4 + 1]; const b = data[i * 4 + 2];
      const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      Y[i] = y; sumY += y;
      const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
      if (mx > 10) {
        const s = (mx - mn) / mx; sumS += s; nS++;
        warm += ((r - b) / 255) * s; warmW += s;
        if (s > 0.2 && mx > 40) { const [hh] = D.rgbToHsl(r, g, b); hues[Math.floor(hh / 30) % 12] += s; }
      }
      const rg = r - g; const yb = 0.5 * (r + g) - b;
      rgS += rg; ybS += yb; rgQ += rg * rg; ybQ += yb * yb;
    }
    const light = sumY / n;
    const ys = Array.from(Y).sort((a, b) => a - b);
    const p5 = ys[Math.floor(n * 0.05)]; const p95 = ys[Math.floor(n * 0.95)];
    const contrast = clamp((p95 - p5) / 0.9);
    const sat = nS ? sumS / nS : 0;
    const muRg = rgS / n; const muYb = ybS / n;
    const colorful = clamp((Math.sqrt(Math.max(0, rgQ / n - muRg * muRg) + Math.max(0, ybQ / n - muYb * muYb)) + 0.3 * Math.sqrt(muRg * muRg + muYb * muYb)) / 110);
    const warmth = clamp(warmW ? (warm / warmW) * 2.2 : 0, -1, 1);
    // texture: Sobel edges and fine grain (difference from a 3×3 blur)
    let edgeN = 0; let grad = 0; let grain = 0;
    const G = new Float32Array(n);
    let cx = 0; let cy = 0; let cw = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = -Y[i - w - 1] - 2 * Y[i - 1] - Y[i + w - 1] + Y[i - w + 1] + 2 * Y[i + 1] + Y[i + w + 1];
        const gy = -Y[i - w - 1] - 2 * Y[i - w] - Y[i - w + 1] + Y[i + w - 1] + 2 * Y[i + w] + Y[i + w + 1];
        const m = Math.hypot(gx, gy) / 4; G[i] = m; grad += m; if (m > 0.09) edgeN++;
        const blur = (Y[i - w - 1] + Y[i - w] + Y[i - w + 1] + Y[i - 1] + Y[i] + Y[i + 1] + Y[i + w - 1] + Y[i + w] + Y[i + w + 1]) / 9;
        grain += Math.abs(Y[i] - blur);
        const wgt = Math.abs(Y[i] - light) + m * 2;
        cx += x * wgt; cy += y * wgt; cw += wgt;
      }
    }
    const inner = Math.max(1, (w - 2) * (h - 2));
    const edges = clamp((edgeN / inner) * 2.2);
    const grainV = clamp((grain / inner) * 14);
    const centroid = cw ? [r2(cx / cw / (w - 1)), r2(cy / cw / (h - 1))] : [0.5, 0.5];
    const thirdsDist = Math.min(...[[1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]].map(([a, b]) => Math.hypot(centroid[0] - a, centroid[1] - b)));
    const centerDist = Math.hypot(centroid[0] - 0.5, centroid[1] - 0.5);
    let symD = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w >> 1; x++) symD += Math.abs(Y[y * w + x] - Y[y * w + (w - 1 - x)]);
    const symmetry = clamp(1 - (symD / (h * (w >> 1))) * 3.2);
    // negative space: share of 8×8 blocks that are flat (little variance, few edges)
    const B = 8; let flat = 0; let blocks = 0;
    for (let by = 0; by < B; by++) {
      for (let bx = 0; bx < B; bx++) {
        let s = 0; let q = 0; let e = 0; let c = 0;
        for (let y = Math.floor((by * h) / B); y < Math.floor(((by + 1) * h) / B); y++) for (let x = Math.floor((bx * w) / B); x < Math.floor(((bx + 1) * w) / B); x++) { const v = Y[y * w + x]; s += v; q += v * v; e += G[y * w + x]; c++; }
        if (!c) continue; blocks++;
        const varr = q / c - (s / c) ** 2;
        if (varr < 0.0025 && e / c < 0.035) flat++;
      }
    }
    const space = blocks ? r2(flat / blocks) : 0;
    // horizon: the row with the strongest horizontal edge, if it stands out
    let bestRow = -1; let bestV = 0; let rowMean = 0;
    for (let y = 2; y < h - 2; y++) { let v = 0; for (let x = 0; x < w; x++) v += Math.abs(Y[(y + 1) * w + x] - Y[(y - 1) * w + x]); v /= w; rowMean += v; if (v > bestV) { bestV = v; bestRow = y; } }
    rowMean /= Math.max(1, h - 4);
    const horizon = bestRow > 0 && bestV > rowMean * 3 && bestV > 0.08 ? r2(bestRow / (h - 1)) : null;
    const hueTotal = hues.reduce((a, b) => a + b, 0);
    const hueFamilies = hueTotal ? hues.map((v, i) => [i * 30, v / hueTotal]).filter(([, v]) => v > 0.12).sort((a, b) => b[1] - a[1]).map(([deg]) => deg) : [];
    return {
      palette: palette(data, n > 20000 ? 3 : 2), light: r2(light), contrast: r2(contrast), sat: r2(sat), colorful: r2(colorful), warmth: r2(warmth),
      edges: r2(edges), grain: r2(grainV), centroid, thirds: r2(clamp(1 - thirdsDist / 0.24)), centered: r2(clamp(1 - centerDist / 0.3)), symmetry: r2(symmetry), space, horizon, hueFamilies,
    };
  }

  // ---------- words for numbers ----------
  const keyWord = (l) => (l < 0.3 ? 'low-key' : l > 0.62 ? 'high-key' : 'mid-key');
  const contrastWord = (c) => (c < 0.4 ? 'soft' : c > 0.72 ? 'hard' : 'medium');
  const satWord = (s) => (s < 0.15 ? 'near monochrome' : s < 0.32 ? 'muted' : s < 0.6 ? 'natural' : s < 0.8 ? 'saturated' : 'neon-saturated');
  const warmWord = (w) => (w > 0.18 ? 'warm' : w < -0.15 ? 'cool' : 'neutral');
  const edgeWord = (e) => (e < 0.15 ? 'clean' : e > 0.5 ? 'busy' : 'some detail');
  const grainWord = (g) => (g < 0.2 ? 'smooth' : g > 0.5 ? 'heavy grain' : 'fine grain');
  const motionWord = (m) => (m == null ? null : m < 0.1 ? 'still' : m < 0.3 ? 'calm' : m < 0.6 ? 'lively' : 'frantic');
  function aspectWord(w, h) {
    if (!w || !h) return null;
    const r = w / h;
    const named = [[9 / 16, '9:16'], [4 / 5, '4:5'], [2 / 3, '2:3'], [3 / 4, '3:4'], [1, '1:1'], [4 / 3, '4:3'], [3 / 2, '3:2'], [16 / 9, '16:9'], [1.85, '1.85:1'], [2.39, '2.39:1']];
    const [, name] = named.reduce((b, x) => (Math.abs(Math.log(x[0] / r)) < Math.abs(Math.log(b[0] / r)) ? x : b));
    return name;
  }
  function compWord(v) {
    if (!v.centroid) return null;
    const [x, y] = v.centroid;
    const parts = [];
    if (v.centered > 0.7) parts.push('centered subject'); else if (v.thirds > 0.55) parts.push(`weight on the ${x < 0.5 ? 'left' : 'right'} third`);
    else parts.push(`weight ${y < 0.4 ? 'high' : y > 0.6 ? 'low' : 'mid'} ${x < 0.4 ? 'left' : x > 0.6 ? 'right' : 'center'}`);
    if (v.symmetry > 0.82) parts.push('symmetric');
    if (v.space > 0.45) parts.push('lots of negative space'); else if (v.space < 0.08) parts.push('dense frame');
    if (v.horizon != null) parts.push(`horizon at ${Math.round(v.horizon * 100)}%`);
    return parts.join(', ');
  }
  function moods(v) {
    const out = [];
    for (const [test, words] of D.MOODS) { try { if (test(v)) out.push(...words); } catch { /* missing field */ } }
    return [...new Set(out)].slice(0, 4);
  }

  // ---------- loaders (page only) ----------
  const canvas = () => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'));
  function pixelsOf(source, sw, sh, max = 160) {
    const k = Math.min(1, max / Math.max(sw, sh));
    const w = Math.max(8, Math.round(sw * k)); const h = Math.max(8, Math.round(sh * k));
    const c = canvas(); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('The picture did not load'));
      img.src = url;
    });
  }
  async function image(url) {
    const img = await loadImage(url);
    const { data, w, h } = pixelsOf(img, img.naturalWidth, img.naturalHeight);
    const v = fromPixels(data, w, h);
    v.size = [img.naturalWidth, img.naturalHeight];
    v.aspect = aspectWord(img.naturalWidth, img.naturalHeight);
    v.moods = moods(v);
    v.kind = 'still';
    return v;
  }

  // Seeks through a clip: ~4 samples a second (up to 200) at 48×27 for motion and cuts, 6 bigger frames for the look.
  async function video(url, { maxSamples = 200, onProgress, debug = false } = {}) {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous';
    v.src = url;
    await new Promise((resolve, reject) => { v.onloadeddata = resolve; v.onerror = () => reject(new Error('The clip did not load')); setTimeout(() => reject(new Error('The clip took too long to open')), 20000); });
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    const vw = v.videoWidth || 16; const vh = v.videoHeight || 9;
    // resolves true when the frame at t is really there (a busy machine can be slow to seek: such samples are skipped)
    const seek = (t) => new Promise((resolve) => { let fin = false; const done = (ok) => { if (fin) return; fin = true; v.removeEventListener('seeked', onSeek); resolve(ok); }; const onSeek = () => done(true); v.addEventListener('seeked', onSeek); v.currentTime = t; setTimeout(() => done(!v.seeking), 6000); });
    const N = Math.max(6, Math.min(maxSamples, Math.round(dur / 0.25)));
    const step = dur / N || 0.25;
    const small = canvas(); small.width = 48; small.height = 27;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    const lumas = []; const hists = []; const looks = [];
    const lookAt = new Set([0.08, 0.25, 0.42, 0.58, 0.75, 0.92].map((f) => Math.min(N - 1, Math.floor(f * N))));
    const lightCurve = [];
    const valid = [];
    for (let i = 0; i < N; i++) {
      valid.push(await seek(Math.min(dur - 0.001, i * step + step / 2)));
      sctx.drawImage(v, 0, 0, 48, 27);
      const d = sctx.getImageData(0, 0, 48, 27).data;
      const L = new Float32Array(48 * 27); const hist = new Float32Array(24);
      let sum = 0;
      for (let p = 0; p < L.length; p++) {
        const r = d[p * 4]; const g = d[p * 4 + 1]; const b = d[p * 4 + 2];
        L[p] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; sum += L[p];
        hist[Math.min(7, r >> 5)]++; hist[8 + Math.min(7, g >> 5)]++; hist[16 + Math.min(7, b >> 5)]++;
      }
      lumas.push(L); hists.push(hist.map((x) => x / L.length)); lightCurve.push(sum / L.length);
      if (lookAt.has(i)) looks.push(fromPixels(...Object.values(pixelsOf(v, vw, vh, 128))));
      if (onProgress && i % 10 === 0) onProgress(i / N);
    }
    // frame differences: pixels + color histogram; a cut is a jump far above the clip's usual change
    const diffs = [];
    for (let i = 1; i < N; i++) {
      if (!valid[i] || !valid[i - 1]) continue;
      let dp = 0; for (let p = 0; p < lumas[i].length; p++) dp += Math.abs(lumas[i][p] - lumas[i - 1][p]);
      let dh = 0; for (let j = 0; j < 24; j++) dh += Math.abs(hists[i][j] - hists[i - 1][j]);
      diffs.push({ t: i * step, px: dp / lumas[i].length, hist: dh / 6 });
    }
    const med = median(diffs.map((x) => x.px)); const medH = median(diffs.map((x) => x.hist));
    // a jump in brightness, or a jump in color alone (red → blue can keep the same brightness)
    const cuts = diffs.filter((x) => (x.px > Math.max(0.12, med * 3.2) && x.hist > 0.08) || x.hist > Math.max(0.3, medH * 4)).map((x) => r2(x.t));
    const calm = diffs.filter((x) => !cuts.includes(r2(x.t))).map((x) => x.px);
    const motion = r2(clamp((calm.length ? calm.reduce((a, b) => a + b, 0) / calm.length : 0) * (0.25 / step) / 0.07));
    const shots = cuts.length + 1;
    const pace = r2(dur / shots);
    // light over time: rising / falling / pulsing / steady; strobe = fast big swings
    const third = Math.max(1, Math.floor(N / 3));
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const a0 = avg(lightCurve.slice(0, third)); const a2 = avg(lightCurve.slice(-third));
    let swings = 0; for (let i = 2; i < lightCurve.length; i++) { const d1 = lightCurve[i - 1] - lightCurve[i - 2]; const d2 = lightCurve[i] - lightCurve[i - 1]; if (Math.sign(d1) !== Math.sign(d2) && Math.abs(d2) > 0.08) swings++; }
    const sd = Math.sqrt(avg(lightCurve.map((x) => (x - avg(lightCurve)) ** 2)));
    const lightArc = swings / Math.max(1, dur) > 1.5 ? 'strobing' : a2 - a0 > 0.12 ? 'brightening' : a0 - a2 > 0.12 ? 'darkening' : sd > 0.08 ? 'pulsing' : 'steady';
    // the look: average of the 6 frames, palette from all of them
    const keys = ['light', 'contrast', 'sat', 'colorful', 'warmth', 'edges', 'grain', 'thirds', 'centered', 'symmetry', 'space'];
    const look = Object.fromEntries(keys.map((k) => [k, r2(avg(looks.map((x) => x[k] || 0)))]));
    const pal = mergePalettes(looks.map((x) => x.palette));
    const out = { ...look, palette: pal, centroid: looks[Math.floor(looks.length / 2)]?.centroid || [0.5, 0.5], horizon: null, hueFamilies: looks[0]?.hueFamilies || [],
      kind: 'clip', duration: r2(dur), size: [vw, vh], aspect: aspectWord(vw, vh), motion, cuts: cuts.slice(0, 40), cutCount: cuts.length, pace, cutsPerMin: dur ? Math.round((cuts.length / dur) * 60) : 0, lightArc,
      colorDrift: looks.length > 2 ? r2(Math.abs(looks[0].warmth - looks.at(-1).warmth)) : 0 };
    out.moods = moods({ ...out });
    if (debug) out.diffs = diffs.map((x) => [r2(x.t), Math.round(x.px * 1000) / 1000, Math.round(x.hist * 1000) / 1000]);
    v.removeAttribute('src'); v.load();
    return out;
  }

  // Palettes from several sources merged by weight (board summary, clips).
  function mergePalettes(list, weights) {
    const acc = [];
    list.forEach((pal, i) => {
      const w = weights ? weights[i] : 1;
      for (const c of pal || []) {
        const rgb = D.hexToRgb(c.hex);
        const near = acc.find((a) => Math.hypot(a.rgb[0] - rgb[0], a.rgb[1] - rgb[1], a.rgb[2] - rgb[2]) < 30);
        const s = (c.share || 0.1) * w;
        if (near) { const n = near.s + s; near.rgb = near.rgb.map((v, j) => (v * near.s + rgb[j] * s) / n); near.s = n; } else acc.push({ rgb, s });
      }
    });
    const total = acc.reduce((a, b) => a + b.s, 0) || 1;
    return acc.sort((a, b) => b.s - a.s).slice(0, 6).map((a) => ({ hex: D.rgbToHex(...a.rgb), share: r2(a.s / total) }));
  }

  // ---------- text for chats ----------
  const KIND_WORD = { image: 'picture', gif: 'gif', video: 'clip', web: 'site', note: 'note', text: 'text', swatch: 'color', palette: 'palette', frame: 'frame', file: 'file' };
  const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s * 10) / 10}s`);
  const ALL_KEYS = ['palette', 'light', 'color', 'texture', 'motion', 'compose', 'type', 'mood', 'notes'];
  // One compact line per item: what a chat needs to borrow the feel (≈ 40–90 tokens).
  function text(item, keys = ALL_KEYS) {
    const v = item.vibe || {};
    const k = new Set(keys);
    const head = `${item.title ? `"${String(item.title).slice(0, 48)}" ` : ''}(${KIND_WORD[item.type] || item.type}${v.duration ? ` ${fmtDur(v.duration)}` : ''}${v.aspect ? `, ${v.aspect}` : ''})`;
    const bits = [];
    const pal = item.type === 'swatch' || item.type === 'palette' ? (item.colors || [item.color]).filter(Boolean).map((hex) => ({ hex, share: 0 })) : v.palette || [];
    if (k.has('palette') && pal.length) bits.push(`palette ${pal.slice(0, 5).map((c) => `${c.hex}${c.share ? ` ${Math.round(c.share * 100)}%` : ''}`).join(' ')} (${[...new Set(pal.slice(0, 3).map((c) => D.colorName(c.hex)))].join(', ')})`);
    if (v.light != null) {
      if (k.has('light')) bits.push(`light ${keyWord(v.light)}, ${contrastWord(v.contrast)} contrast${v.lightArc && v.lightArc !== 'steady' ? `, ${v.lightArc}` : ''}`);
      if (k.has('color')) bits.push(`color ${satWord(v.sat)}, ${warmWord(v.warmth)}${v.colorful > 0.6 ? ', colorful' : ''}`);
      if (k.has('texture')) bits.push(`texture ${edgeWord(v.edges)}, ${grainWord(v.grain)}`);
      if (k.has('compose')) { const c = compWord(v); if (c) bits.push(`composition ${c}`); }
    }
    if (k.has('motion') && v.motion != null) bits.push(`motion ${motionWord(v.motion)} (${v.motion})${v.cutCount != null ? `, ${v.cutCount ? `≈${v.pace}s per shot, ${v.cutsPerMin} cuts/min` : 'one continuous shot'}` : ''}`);
    if (k.has('type') && (item.fonts?.heading || item.fonts?.body || item.type === 'text')) bits.push(`type ${[item.fonts?.heading, item.fonts?.body].filter(Boolean).join(' / ') || item.textStyle || 'headline'}`);
    if (k.has('mood') && v.moods?.length) bits.push(`mood ${v.moods.join(', ')}`);
    if (k.has('notes')) {
      const note = String(item.note || (item.type === 'note' || item.type === 'text' ? item.text : '') || '').replace(/\s+/g, ' ').trim();
      if (note) bits.push(`note "${note.slice(0, 140)}${note.length > 140 ? '…' : ''}"`);
      if (item.tags?.length) bits.push(item.tags.map((t) => `#${t}`).join(' '));
      if (item.stamp) bits.push(`stamp ${item.stamp}`);
    }
    if (item.type === 'web' && item.url && k.has('type')) bits.push(`site ${(() => { try { return new URL(item.url).hostname; } catch { return item.url; } })()}`);
    return `${head}: ${bits.join(' · ') || 'no vibe yet'}`;
  }

  // ---------- the whole board ----------
  function summary(items) {
    const media = items.filter((i) => i.vibe && i.vibe.light != null);
    const weight = (i) => (i.stamp === '★' || i.stamp === '♥' ? 1.6 : 1);
    const wsum = media.reduce((a, i) => a + weight(i), 0) || 1;
    const mean = (k) => (media.length ? r2(media.reduce((a, i) => a + (i.vibe[k] || 0) * weight(i), 0) / wsum) : null);
    const clips = items.filter((i) => i.vibe?.motion != null);
    const swatches = items.filter((i) => i.type === 'swatch' || i.type === 'palette').map((i) => (i.colors || [i.color]).filter(Boolean).map((hex) => ({ hex, share: 1 / Math.max(1, (i.colors || [1]).length) })));
    const pal = mergePalettes([...media.map((i) => i.vibe.palette), ...swatches], [...media.map(weight), ...swatches.map(() => 1.4)]);
    const count = (arr) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([x]) => x); };
    const kinds = count(items.filter((i) => i.type !== 'frame').map((i) => KIND_WORD[i.type] || i.type));
    const byKind = Object.fromEntries(kinds.map((k) => [k, items.filter((i) => (KIND_WORD[i.type] || i.type) === k).length]));
    return {
      items: items.filter((i) => i.type !== 'frame').length, byKind, palette: pal,
      light: mean('light'), contrast: mean('contrast'), sat: mean('sat'), warmth: mean('warmth'), edges: mean('edges'), grain: mean('grain'), space: mean('space'), symmetry: mean('symmetry'),
      motion: clips.length ? r2(median(clips.map((i) => i.vibe.motion))) : null, pace: clips.length ? r2(median(clips.map((i) => i.vibe.pace).filter((x) => x != null))) : null,
      moods: count(media.flatMap((i) => i.vibe.moods || [])).slice(0, 6), tags: count(items.flatMap((i) => i.tags || [])).slice(0, 8),
      fonts: [...new Set(items.flatMap((i) => [i.fonts?.heading, i.fonts?.body]).filter(Boolean))].slice(0, 4),
      notes: items.filter((i) => i.type === 'note' || i.note).map((i) => String(i.note || i.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4),
    };
  }
  // The board's vibe as a few lines (≈ 80–160 tokens), optionally narrowed to some keys (BoardData.FOCUS).
  function boardText(name, items, keys = ALL_KEYS, { avoid = [] } = {}) {
    const s = summary(items);
    const k = new Set(keys);
    const lines = [`Board "${name}" (${Object.entries(s.byKind).map(([kind, n]) => `${n} ${kind}${n > 1 ? 's' : ''}`).join(', ') || 'empty'})`];
    if (k.has('palette') && s.palette.length) lines.push(`palette: ${s.palette.map((c) => `${c.hex} ${Math.round(c.share * 100)}%`).join(' ')} (${[...new Set(s.palette.slice(0, 4).map((c) => D.colorName(c.hex)))].join(', ')})`);
    if (k.has('light') && s.light != null) lines.push(`light: ${keyWord(s.light)} (${s.light}), ${contrastWord(s.contrast)} contrast (${s.contrast})`);
    if (k.has('color') && s.sat != null) lines.push(`color: ${satWord(s.sat)} (${s.sat}), ${warmWord(s.warmth)} (${s.warmth})`);
    if (k.has('texture') && s.edges != null) lines.push(`texture: ${edgeWord(s.edges)}, ${grainWord(s.grain)}${s.space > 0.4 ? ', airy negative space' : ''}`);
    if (k.has('motion') && s.motion != null) lines.push(`motion: ${motionWord(s.motion)} (${s.motion})${s.pace ? `, ≈${s.pace}s per shot` : ''}`);
    if (k.has('type') && s.fonts.length) lines.push(`type: ${s.fonts.join(', ')}`);
    if (k.has('mood') && (s.moods.length || s.tags.length)) lines.push(`mood: ${[...s.moods, ...s.tags.map((t) => `#${t}`)].join(', ')}`);
    if (k.has('notes') && s.notes.length) lines.push(`owner's notes: ${s.notes.map((n) => `"${n.slice(0, 100)}"`).join('; ')}`);
    if (avoid.length) lines.push(`avoid: ${avoid.map((i) => text(i, ['palette', 'light', 'mood', 'notes']).replace(/^[^:]*: /, '')).join(' | ').slice(0, 400)}`);
    return lines.join('\n');
  }

  // Distance between two vibes (0 same … 1 opposite), for "find similar" and the compare view.
  function distance(a, b) {
    if (!a || !b) return 1;
    const keys = ['light', 'contrast', 'sat', 'warmth', 'edges', 'grain', 'space'];
    let d = keys.reduce((s, k) => s + Math.abs((a[k] || 0) - (b[k] || 0)) * (k === 'warmth' ? 0.5 : 1), 0) / keys.length;
    const pa = a.palette?.[0]; const pb = b.palette?.[0];
    if (pa && pb) { const x = D.hexToRgb(pa.hex); const y = D.hexToRgb(pb.hex); d = d * 0.7 + (Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / 441) * 0.3; }
    if (a.motion != null && b.motion != null) d = d * 0.8 + Math.abs(a.motion - b.motion) * 0.2;
    return r2(clamp(d * 2));
  }

  return { fromPixels, palette, image, video, mergePalettes, summary, text, boardText, distance, moods, aspectWord, compWord, words: { keyWord, contrastWord, satWord, warmWord, edgeWord, grainWord, motionWord }, ALL_KEYS, KIND_WORD, loadImage, pixelsOf };
})();
if (typeof module !== 'undefined') module.exports = BoardVibe;
