// ◎ How close am I? (round 141, matchscore141): the numbers. No DOM, no tokens; loads in Node for the tests.
// docs/upgrades/matchscore141.md. A running match score between the Lab's picture and a chosen reference (a picture or
// a clip), cheap enough to run twice a second on small frames (≈ 64 px a side: well under 1 ms a frame):
//   sig(rgba, w, h)   one frame's signature: a soft hue histogram (12 hues + grey), the mean colour of the shadows,
//                     mids and highlights, a 16-bin brightness histogram, its spread (contrast), the edge amount, and a
//                     16 × 9 brightness grid (for motion: the change between two frames half a second apart)
//   merge(sigs)       several frames (a clip) → one signature
//   motionOf(a, b)    the change between two signatures' grids (0 = still … ~0.3 = a cut)
//   parts(ref, cur, { refMotion, curMotion }) → { colours, light, energy, motion (null for a still), overall } in 0–100
//   hints(ref, cur, p) → a few plain words per part ("bluer than the picture", "darker", "busier", "moves less")
//   offParts(p, h)    the parts still off (< 80 %), for "✦ Ask the AI for the rest"; askText(...) the message
//   mixHex(a, b, t) · shiftHex(hex, dl) · hexRgb · rgbHex: the optimiser's colour moves
// Not the same as LookCore.closeness (lookmatch, round 28): that one is a single "≈ N % close" after a match, read on
// 200 px frames with the board's k-means palette and levels (heavier, once); this one is the live, cheap, per-part score.
const MatchCore = (() => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const HUES = 12; const LB = 16; const GW = 16; const GH = 9;
  const W = { colours: 0.4, light: 0.35, energy: 0.25 };
  const WM = { colours: 0.35, light: 0.3, energy: 0.15, motion: 0.2 };

  function sig(data, w, h) {
    const n = w * h;
    const hue = new Float32Array(HUES + 1); // the last bin: grey (unsaturated) weight
    const lum = new Float32Array(LB);
    const tone = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; // r, g, b, count for shadows / mids / highlights
    const Y = new Float32Array(n);
    const grid = new Float32Array(GW * GH); const gridN = new Float32Array(GW * GH);
    let sum = 0; let sum2 = 0; let satSum = 0; let warm = 0;
    for (let y = 0, i = 0; y < h; y += 1) {
      const gy = Math.min(GH - 1, Math.floor((y * GH) / h)) * GW;
      for (let x = 0; x < w; x += 1, i += 1) {
        const r = data[i * 4] / 255; const g = data[i * 4 + 1] / 255; const b = data[i * 4 + 2] / 255;
        const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        Y[i] = v; sum += v; sum2 += v * v;
        const gi = gy + Math.min(GW - 1, Math.floor((x * GW) / w)); grid[gi] += v; gridN[gi] += 1;
        const lp = v * (LB - 1); const l0 = Math.floor(lp); const lf = lp - l0; lum[l0] += 1 - lf; if (lf > 0) lum[l0 + 1] += lf;
        const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const c = mx - mn;
        const s = mx > 0 ? c / mx : 0;
        // a saturated pixel goes to its hue (split between the two nearest bins), a grey one to the grey bin
        const wt = s * Math.min(1, mx * 2.5);
        if (c > 1e-4 && wt > 0) {
          let hh = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
          if (hh < 0) hh += 6;
          const hp = (hh / 6) * HUES; const h0 = Math.floor(hp) % HUES; const hf = hp - Math.floor(hp);
          hue[h0] += wt * (1 - hf); hue[(h0 + 1) % HUES] += wt * hf;
        }
        hue[HUES] += 1 - wt;
        satSum += s; warm += r - b;
        const t = v < 0.33 ? 0 : v < 0.66 ? 1 : 2; const T = tone[t]; T[0] += r; T[1] += g; T[2] += b; T[3] += 1;
      }
    }
    let hs = 0; for (let k = 0; k <= HUES; k += 1) hs += hue[k];
    for (let k = 0; k <= HUES; k += 1) hue[k] /= hs || 1;
    for (let k = 0; k < LB; k += 1) lum[k] /= n || 1;
    for (let k = 0; k < GW * GH; k += 1) grid[k] /= gridN[k] || 1;
    // edges: the mean brightness step to the right and down neighbours, and the share of strong ones (detail)
    let e = 0; let strong = 0; let en = 0;
    for (let y = 0; y < h - 1; y += 1) for (let x = 0; x < w - 1; x += 1) {
      const i = y * w + x; const d = Math.abs(Y[i + 1] - Y[i]) + Math.abs(Y[i + w] - Y[i]);
      e += d; if (d > 0.12) strong += 1; en += 1;
    }
    const mean = sum / (n || 1);
    const toneMeans = tone.map((T) => (T[3] ? [T[0] / T[3], T[1] / T[3], T[2] / T[3]] : null));
    const all = [0, 1, 2].map((c) => tone.reduce((a, T) => a + T[c], 0) / (n || 1));
    return { hue, lum, tone: toneMeans, toneShare: tone.map((T) => T[3] / (n || 1)), all, mean, std: Math.sqrt(Math.max(0, sum2 / (n || 1) - mean * mean)), sat: satSum / (n || 1), warm: warm / (n || 1), edges: en ? e / en : 0, detail: en ? strong / en : 0, grid, n };
  }

  function merge(list) {
    const L = (list || []).filter(Boolean);
    if (!L.length) return null;
    if (L.length === 1) return L[0];
    const avgArr = (k) => { const out = new Float32Array(L[0][k].length); for (const s of L) for (let i = 0; i < out.length; i += 1) out[i] += s[k][i] / L.length; return out; };
    const avg = (k) => L.reduce((a, s) => a + s[k], 0) / L.length;
    const tone = [0, 1, 2].map((t) => { const have = L.filter((s) => s.tone[t]); return have.length ? [0, 1, 2].map((c) => have.reduce((a, s) => a + s.tone[t][c], 0) / have.length) : null; });
    return { hue: avgArr('hue'), lum: avgArr('lum'), tone, toneShare: [0, 1, 2].map((t) => L.reduce((a, s) => a + s.toneShare[t], 0) / L.length), all: [0, 1, 2].map((c) => L.reduce((a, s) => a + s.all[c], 0) / L.length), mean: avg('mean'), std: avg('std'), sat: avg('sat'), warm: avg('warm'), edges: avg('edges'), detail: avg('detail'), grid: L.at(-1).grid, n: L[0].n, frames: L.length };
  }

  function motionOf(a, b) {
    if (!a?.grid || !b?.grid || a.grid.length !== b.grid.length) return null;
    let d = 0; for (let i = 0; i < a.grid.length; i += 1) d += Math.abs(a.grid[i] - b.grid[i]);
    return d / a.grid.length;
  }

  // ---------- the four parts ----------
  // colours: the hue mix (blurred around the wheel, so near hues count as near) and the mean colour per tone band
  function colourSim(a, b) {
    const blur = (H) => { const o = new Float32Array(HUES + 1); for (let k = 0; k < HUES; k += 1) o[k] = 0.5 * H[k] + 0.25 * H[(k + 1) % HUES] + 0.25 * H[(k + HUES - 1) % HUES]; o[HUES] = H[HUES]; return o; };
    const A = blur(a.hue); const B = blur(b.hue);
    let inter = 0; for (let k = 0; k <= HUES; k += 1) inter += Math.min(A[k], B[k]);
    let dist = 0; let wsum = 0;
    for (let t = 0; t < 3; t += 1) {
      const ca = a.tone[t] || a.all; const cb = b.tone[t] || b.all;
      const wt = 0.2 + (a.toneShare[t] || 0) + (b.toneShare[t] || 0);
      // the colour's lean (each channel minus its grey), so brightness is left to Light
      const ga = (ca[0] + ca[1] + ca[2]) / 3; const gb = (cb[0] + cb[1] + cb[2]) / 3;
      dist += wt * Math.hypot(ca[0] - ga - (cb[0] - gb), ca[1] - ga - (cb[1] - gb), ca[2] - ga - (cb[2] - gb)); wsum += wt;
    }
    const lean = 1 - clamp((dist / (wsum || 1)) / 0.35);
    const satS = 1 - clamp(Math.abs(a.sat - b.sat) / 0.6);
    return clamp(0.45 * inter + 0.4 * lean + 0.15 * satS);
  }
  function lightSim(a, b) {
    let ca = 0; let cb = 0; let emd = 0;
    for (let k = 0; k < LB; k += 1) { ca += a.lum[k]; cb += b.lum[k]; emd += Math.abs(ca - cb); }
    emd /= LB;
    return clamp(1 - emd * 2.6 - Math.abs(a.std - b.std) * 1.6);
  }
  const ratioSim = (x, y, eps, span) => clamp(1 - Math.abs(Math.log((x + eps) / (y + eps))) / span);
  const energySim = (a, b) => 0.6 * ratioSim(a.edges, b.edges, 0.01, 2.2) + 0.4 * ratioSim(a.detail, b.detail, 0.01, 2.6);
  function parts(ref, cur, { refMotion = null, curMotion = null } = {}) {
    if (!ref || !cur) return null;
    const p = { colours: colourSim(ref, cur), light: lightSim(ref, cur), energy: energySim(ref, cur), motion: refMotion == null ? null : curMotion == null ? null : ratioSim(refMotion, curMotion, 0.004, 2.4) };
    const ws = p.motion == null ? W : WM;
    let o = 0; let wt = 0; for (const [k, x] of Object.entries(ws)) if (p[k] != null) { o += x * p[k]; wt += x; }
    const pct = (v) => (v == null ? null : Math.round(v * 1000) / 10);
    return { colours: pct(p.colours), light: pct(p.light), energy: pct(p.energy), motion: pct(p.motion), overall: pct(o / (wt || 1)), still: pct((W.colours * p.colours + W.light * p.light + W.energy * p.energy) / (W.colours + W.light + W.energy)) };
  }

  // ---------- plain words ----------
  const HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'azure', 'blue', 'violet', 'magenta', 'pink'];
  const topHue = (s) => { let k = 0; for (let i = 1; i < HUES; i += 1) if (s.hue[i] > s.hue[k]) k = i; return s.hue[k] > 0.08 ? HUE_NAMES[k] : null; };
  function hints(ref, cur, p) {
    if (!ref || !cur || !p) return {};
    const out = { colours: [], light: [], energy: [], motion: [] };
    if (p.colours < 92) {
      const hr = topHue(ref); const hc = topHue(cur);
      if (hr && hr !== hc) out.colours.push(`the picture leans ${hr}${hc ? `, yours ${hc}` : ''}`);
      const dw = ref.warm - cur.warm; if (Math.abs(dw) > 0.05) out.colours.push(dw > 0 ? 'the picture is warmer' : 'the picture is cooler');
      const ds = ref.sat - cur.sat; if (Math.abs(ds) > 0.08) out.colours.push(ds > 0 ? 'the picture is more colourful' : 'the picture is more muted');
    }
    if (p.light < 92) {
      const dm = ref.mean - cur.mean; if (Math.abs(dm) > 0.04) out.light.push(dm > 0 ? 'yours is darker' : 'yours is brighter');
      const dc = ref.std - cur.std; if (Math.abs(dc) > 0.03) out.light.push(dc > 0 ? 'it has more contrast' : 'it is softer, flatter');
    }
    if (p.energy < 92) { const de = ref.edges - cur.edges; if (Math.abs(de) > 0.005) out.energy.push(de > 0 ? 'it is busier, more detail' : 'it is calmer, less detail'); }
    if (p.motion != null && p.motion < 92) out.motion.push('the clip moves differently');
    return out;
  }
  const word = (v) => (v == null ? '' : v >= 85 ? 'very close' : v >= 70 ? 'close' : v >= 50 ? 'getting there' : 'far off');
  const LABELS = { colours: 'Colours', light: 'Light', energy: 'Energy', motion: 'Motion' };
  function offParts(p, h = {}, below = 80) {
    if (!p) return [];
    return Object.keys(LABELS).filter((k) => p[k] != null && p[k] < below).map((k) => ({ key: k, label: LABELS[k], value: Math.round(p[k]), why: (h[k] || []).join(', ') }));
  }
  function askText({ title = 'the reference', p, h = {}, palette = [], kind = 'image', motionWords = '', nudged = false } = {}) {
    const off = offParts(p, h);
    const lines = [
      `◎ Match: my scene is ${Math.round(p?.overall ?? 0)} % like "${title}" (${kind === 'clip' ? 'a clip' : 'a picture'}; read on this computer, the picture isn't attached).`,
      `${nudged ? 'Its colours and light were already nudged here with my sliders. ' : ''}Please close what is still off, with the Lab\'s tools, keeping my layers (one change I can undo):`,
      ...(off.length ? off.map((o) => `- ${o.label} ${o.value} %${o.why ? `: ${o.why}` : ''}`) : ['- (every part is above 80 %: small touches only)']),
      palette.length ? `Its palette: ${palette.join(' ')}` : '',
      motionWords ? `Its motion: ${motionWords}` : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  // ---------- colour moves (the optimiser) ----------
  const hexRgb = (h) => { const s = String(h || '').replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) || 0); };
  const rgbHex = (c) => `#${c.map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
  const mixHex = (a, b, t) => { const x = hexRgb(a); const y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const shiftHex = (hex, dl) => rgbHex(hexRgb(hex).map((v) => (dl > 0 ? v + (255 - v) * dl : v * (1 + dl))));
  const HEX = /^#[0-9a-f]{6}$/i;
  // the sliders the optimiser may move: colour sliders, and number sliders that read as light or colour
  const LIGHTY = /bright|expos|intens|light|glow|bloom|contrast|satur|gamma|vibran|temp|tint|hue|fog|dark|lum|gain|lift|level/i;
  const GRADE_KEYS = new Set(['exposure', 'contrast', 'temp', 'tint', 'saturation', 'vibrance', 'liftLum', 'gainLum', 'cL2']);
  function tunable(controls, { grade = false } = {}) {
    return (controls || []).filter((c) => (HEX.test(String(c.value)) && !grade) || (typeof c.value === 'number' && c.min != null && c.max != null && c.max > c.min && (grade ? GRADE_KEYS.has(c.key) : LIGHTY.test(`${c.key} ${c.label || ''}`))));
  }
  const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  return { sig, merge, motionOf, parts, hints, word, offParts, askText, LABELS, hexRgb, rgbHex, mixHex, shiftHex, tunable, median, HEX, GW, GH };
})();
if (typeof module !== 'undefined') module.exports = MatchCore;
