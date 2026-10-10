// Editor pack (round 11, "pack11"): pro editing tools packed behind the editor's existing menus (⋯ › Pro tools,
// right-click a clip / track, the Export menu) and chat commands (tools/video-pack-cmds.js), and the agents'
// video_edit ops (duck, lut, angle, multicam, adjustment, proxy, queue, vibecuts, chapters).
//   · ducking: the music dips under the voice (speech found in the voice's own sound), as volume keyframes (preview
//     and render agree, you can edit them)
//   · LUTs (.cube, 3D or 1D): exact in the render (ffmpeg lut3d / lut1d), a close live twin in the preview (per
//     channel curves + a fitted color matrix as an SVG filter)
//   · adjustment layers: an item on a video track whose look / effects / LUT apply to everything under it
//   · multicam: several takes of one moment as angles, synced by their sound; Alt+1…9 / /angle cut to an angle at
//     the playhead
//   · proxies: light copies of heavy files for the preview (renders always use the originals), and reversed copies so
//     a reversed clip plays backwards in real time
//   · a render queue (kv video-render-queue): several renders of one or several edits, one after the other
//   · cuts paced like the mood board's clips (their seconds per shot), on the music's beats when there is one
//   · a recording's chapters (capture markers) become editor markers
// Pure helpers (parseCube, fitLut, speechRanges, duckKeys, vibeCuts, angleSwap, offsetByCorrelation) are exported for
// Node tests (dev/editor-test.js).
const VideoPack = (() => {
  const C = typeof CutData !== 'undefined' ? CutData : require('./cut-data.js');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const noExt = (n) => n.replace(/\.[^.]+$/, '');
  const sepOf = (p) => (String(p).includes('\\') && !String(p).startsWith('/') ? '\\' : '/');
  const join = (...parts) => parts.join(sepOf(parts[0]));

  // ================= pure parts =================
  // ---------- .cube LUTs ----------
  function parseCube(text) {
    const lut = { title: '', size: 0, kind: '3d', min: [0, 0, 0], max: [1, 1, 1], data: [] };
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.replace(/#.*/, '').trim();
      if (!line) continue;
      let m;
      if ((m = /^TITLE\s+"?(.*?)"?$/i.exec(line))) { lut.title = m[1]; continue; }
      if ((m = /^LUT_3D_SIZE\s+(\d+)/i.exec(line))) { lut.size = Number(m[1]); lut.kind = '3d'; continue; }
      if ((m = /^LUT_1D_SIZE\s+(\d+)/i.exec(line))) { lut.size = Number(m[1]); lut.kind = '1d'; continue; }
      if ((m = /^DOMAIN_MIN\s+(\S+)\s+(\S+)\s+(\S+)/i.exec(line))) { lut.min = m.slice(1, 4).map(Number); continue; }
      if ((m = /^DOMAIN_MAX\s+(\S+)\s+(\S+)\s+(\S+)/i.exec(line))) { lut.max = m.slice(1, 4).map(Number); continue; }
      if (/^[A-Z_]+\b/i.test(line) && !/^[-+.\d]/.test(line)) continue; // other keywords (LUT_3D_INPUT_RANGE…)
      const v = line.split(/\s+/).map(Number);
      if (v.length >= 3 && v.slice(0, 3).every(Number.isFinite)) lut.data.push(v[0], v[1], v[2]);
    }
    const want = lut.kind === '3d' ? lut.size ** 3 * 3 : lut.size * 3;
    if (!(lut.size >= 2) || lut.data.length < want) throw new Error(`Not a usable .cube LUT (${lut.size ? `${lut.data.length / 3} of ${want / 3} entries` : 'no LUT_3D_SIZE / LUT_1D_SIZE'})`);
    lut.data = Float32Array.from(lut.data.slice(0, want));
    return lut;
  }
  // the LUT's color for an input color (0…1), trilinear (3D) or linear (1D)
  function sample(lut, r, g, b) {
    const n = lut.size; const D = lut.data;
    const norm = (x, i) => clamp((x - lut.min[i]) / ((lut.max[i] - lut.min[i]) || 1), 0, 1) * (n - 1);
    if (lut.kind === '1d') {
      return [r, g, b].map((x, ch) => { const f = norm(x, ch); const i = Math.min(n - 2, Math.floor(f)); const t = f - i; return D[i * 3 + ch] * (1 - t) + D[(i + 1) * 3 + ch] * t; });
    }
    const fr = norm(r, 0); const fg = norm(g, 1); const fb = norm(b, 2);
    const ir = Math.min(n - 2, Math.floor(fr)); const ig = Math.min(n - 2, Math.floor(fg)); const ib = Math.min(n - 2, Math.floor(fb));
    const tr = fr - ir; const tg = fg - ig; const tb = fb - ib;
    const at = (x, y, z, ch) => D[((z * n + y) * n + x) * 3 + ch]; // red changes fastest
    const out = [0, 0, 0];
    for (let ch = 0; ch < 3; ch += 1) {
      const c00 = at(ir, ig, ib, ch) * (1 - tr) + at(ir + 1, ig, ib, ch) * tr;
      const c10 = at(ir, ig + 1, ib, ch) * (1 - tr) + at(ir + 1, ig + 1, ib, ch) * tr;
      const c01 = at(ir, ig, ib + 1, ch) * (1 - tr) + at(ir + 1, ig, ib + 1, ch) * tr;
      const c11 = at(ir, ig + 1, ib + 1, ch) * (1 - tr) + at(ir + 1, ig + 1, ib + 1, ch) * tr;
      out[ch] = (c00 * (1 - tg) + c10 * tg) * (1 - tb) + (c01 * (1 - tg) + c11 * tg) * tb;
    }
    return out;
  }
  // 4×4 linear solve (Gaussian elimination with pivoting)
  function solve(A, y) {
    const n = y.length; const M = A.map((row, i) => [...row, y[i]]);
    for (let c = 0; c < n; c += 1) {
      let p = c; for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c] || 1e-9;
      for (let r = 0; r < n; r += 1) { if (r === c) continue; const f = M[r][c] / d; for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k]; }
    }
    return M.map((row, i) => row[n] / (M[i][i] || 1e-9));
  }
  // The preview's twin of a LUT: per-channel curves (the LUT along the gray axis) then a 3×3 matrix + offset fitted
  // (least squares over a 9³ grid) from the curved color to the LUT's color. err = mean error (0…1) of the twin.
  function fitLut(lut, steps = 17) {
    const curve = [[], [], []];
    for (let i = 0; i < steps; i += 1) { const v = i / (steps - 1); const o = sample(lut, v, v, v); for (let ch = 0; ch < 3; ch += 1) curve[ch].push(clamp(o[ch], 0, 1)); }
    const cv = (x, ch) => { const f = clamp(x, 0, 1) * (steps - 1); const i = Math.min(steps - 2, Math.floor(f)); const t = f - i; return curve[ch][i] * (1 - t) + curve[ch][i + 1] * t; };
    const G = 9; const rows = [];
    for (let a = 0; a < G; a += 1) for (let b = 0; b < G; b += 1) for (let c = 0; c < G; c += 1) {
      const inp = [a / (G - 1), b / (G - 1), c / (G - 1)];
      const x = [cv(inp[0], 0), cv(inp[1], 1), cv(inp[2], 2), 1];
      rows.push({ x, y: sample(lut, ...inp) });
    }
    const AtA = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    for (const { x } of rows) for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) AtA[i][j] += x[i] * x[j];
    const coef = [0, 1, 2].map((ch) => { const Aty = [0, 0, 0, 0]; for (const { x, y } of rows) for (let i = 0; i < 4; i += 1) Aty[i] += x[i] * y[ch]; return solve(AtA, Aty); });
    const m = [coef[0][0], coef[0][1], coef[0][2], coef[1][0], coef[1][1], coef[1][2], coef[2][0], coef[2][1], coef[2][2]];
    const o = [coef[0][3], coef[1][3], coef[2][3]];
    let err = 0;
    for (const { x, y } of rows) for (let ch = 0; ch < 3; ch += 1) err += Math.abs(clamp(coef[ch][0] * x[0] + coef[ch][1] * x[1] + coef[ch][2] * x[2] + coef[ch][3], 0, 1) - clamp(y[ch], 0, 1));
    return { curve, m, o, err: err / (rows.length * 3) };
  }
  // ---------- speech in a sound → program ranges, and ducking keys ----------
  // samples: mono Float32Array at rate; → [[a, b]] seconds where someone talks (energy over the take's own level)
  function speechRanges(samples, rate, { win = 0.05, minOn = 0.15, bridge = 0.4 } = {}) {
    const n = Math.max(1, Math.round(win * rate)); const rms = [];
    for (let i = 0; i + n <= samples.length; i += n) { let s = 0; for (let j = i; j < i + n; j += 1) s += samples[j] * samples[j]; rms.push(Math.sqrt(s / n)); }
    if (!rms.length) return [];
    const sorted = [...rms].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0; const floor = sorted[Math.floor(sorted.length * 0.2)] || 0;
    const th = Math.max(0.008, floor * 2.5, p90 * 0.22);
    const out = [];
    let a = null;
    rms.forEach((v, i) => { if (v >= th && a == null) a = i; if (v < th && a != null) { out.push([a * win, i * win]); a = null; } });
    if (a != null) out.push([a * win, rms.length * win]);
    const merged = [];
    for (const r of out) { const last = merged[merged.length - 1]; if (last && r[0] - last[1] < bridge) last[1] = r[1]; else merged.push([...r]); }
    return merged.filter(([x, y]) => y - x >= minOn).map(([x, y]) => [r4(x), r4(y)]);
  }
  // Volume keys (item-local seconds) that dip a music item to `depth` over the program ranges: attack before, release after.
  function duckKeys(item, ranges, { depth = 0.25, attack = 0.15, release = 0.45, base = null } = {}) {
    const start = item.start; const d = C.itemDur(item); const v0 = base ?? item.volume ?? 1;
    const lo = v0 * depth;
    const pts = [];
    for (const [a0, b0] of ranges) {
      const a = a0 - start; const b = b0 - start;
      if (b < -release || a > d + attack) continue;
      pts.push([a - attack, v0], [a, lo], [b, lo], [b + release, v0]);
    }
    if (!pts.length) return null;
    // overlapping dips merge: keep the lowest value wherever two meet
    pts.sort((p, q) => p[0] - q[0]);
    const keys = [];
    for (const [t, v] of pts) {
      const tt = r4(clamp(t, 0, d));
      const last = keys[keys.length - 1];
      if (last && Math.abs(last.t - tt) < 0.02) { last.v = Math.min(last.v, v); continue; }
      keys.push({ t: tt, v: r4(v), ease: 'linear' });
    }
    // a "back up" key that sits inside a later dip would bounce: drop keys between two low ones
    for (let i = 1; i < keys.length - 1; i += 1) if (keys[i].v > lo + 1e-6 && keys[i - 1].v <= lo + 1e-6 && keys[i + 1].v <= lo + 1e-6) { keys.splice(i, 1); i -= 1; }
    return keys;
  }

  // ---------- cuts paced like the board's clips ----------
  // intervals: shot lengths to follow (repeated); beats: program beat times (snapped to when close); from–to: the range
  function vibeCuts({ from = 0, to, intervals = [2], beats = [], have = [], minGap = 0.3 } = {}) {
    const iv = intervals.filter((x) => x > 0.15).map((x) => clamp(x, 0.3, 12));
    if (!iv.length || !(to > from)) return [];
    const out = []; let t = from; let k = 0;
    for (let guard = 0; guard < 500; guard += 1) {
      let next = t + iv[k % iv.length]; k += 1;
      if (beats.length) { const b = beats.reduce((best, x) => (Math.abs(x - next) < Math.abs(best - next) ? x : best), beats[0]); if (Math.abs(b - next) < iv[(k - 1) % iv.length] * 0.35 && b > t + minGap) next = b; }
      if (next >= to - minGap) break;
      if (have.every((h) => Math.abs(h - next) > 0.05)) out.push(r4(next));
      t = next;
    }
    return out;
  }
  // the shot lengths of the board's clips (their vibe's cut times), else a pace from their motion
  function boardIntervals(items) {
    const clips = (items || []).filter((i) => i.vibe?.kind === 'clip');
    const iv = [];
    for (const it of clips) {
      const cuts = [0, ...(it.vibe.cuts || []), it.vibe.duration || 0].filter((x, i, a) => i === 0 || x > a[i - 1]);
      for (let i = 1; i < cuts.length; i += 1) iv.push(cuts[i] - cuts[i - 1]);
    }
    if (iv.length) return iv.filter((x) => x >= 0.2 && x <= 15).slice(0, 64);
    const motion = (items || []).map((i) => i.vibe?.motion).filter((x) => x != null);
    const m = motion.length ? motion.reduce((a, b) => a + b, 0) / motion.length : 0.3;
    return [m > 0.5 ? 0.8 : m > 0.25 ? 1.6 : 3];
  }

  // ---------- multicam ----------
  // a main-track clip shows angle `to` instead of its own: same moment (multicam time τ = in − offset of its angle)
  function angleSwap(c, angles, to, dur = null) {
    const A = angles[c.cam ?? angles.findIndex((a) => a.src === c.src)]; const B = angles[to];
    if (!A || !B) return null;
    const tau = c.in - A.offset;
    const len = c.out - c.in;
    let inn = tau + B.offset; let out = inn + len;
    if (inn < 0) { out -= inn; inn = 0; }
    if (dur && out > dur) { inn = Math.max(0, inn - (out - dur)); out = Math.min(dur, out); }
    return { ...c, src: B.src, in: r4(inn), out: r4(out), cam: to };
  }
  // the lag (seconds) of b behind a from two energy envelopes at `rate` Hz (normalized cross-correlation, ±maxLag)
  function offsetByCorrelation(ea, eb, rate, maxLag = 20) {
    const L = Math.round(maxLag * rate);
    const mean = (x) => x.reduce((s, v) => s + v, 0) / (x.length || 1);
    const ma = mean(ea); const mb = mean(eb);
    const a = ea.map((v) => v - ma); const b = eb.map((v) => v - mb);
    let best = 0; let bestS = -Infinity;
    for (let lag = -L; lag <= L; lag += 1) {
      let s = 0; let n = 0;
      for (let i = 0; i < a.length; i += 1) { const j = i + lag; if (j < 0 || j >= b.length) continue; s += a[i] * b[j]; n += 1; }
      if (n > rate * 2) { s /= n; if (s > bestS) { bestS = s; best = lag; } }
    }
    return { lag: best / rate, score: bestS };
  }
  const envelope = (samples, rate, hz = 50) => { const n = Math.max(1, Math.round(rate / hz)); const out = []; for (let i = 0; i + n <= samples.length; i += n) { let s = 0; for (let j = i; j < i + n; j += 1) s += Math.abs(samples[j]); out.push(s / n); } return out; };

  const PURE = { parseCube, sample, fitLut, speechRanges, duckKeys, vibeCuts, boardIntervals, angleSwap, offsetByCorrelation, envelope };
  if (typeof window === 'undefined') return PURE;

  // ================= in the app =================
  const cut = () => VideoCut;
  const ffOver = () => ({ ffmpeg: H.settings().ffmpegPath || undefined });
  const say = (msg) => { try { toast(msg, { timeout: 3200 }); } catch { /* headless */ } };
  let ffTools = null;
  async function hasFF() { ffTools ||= await window.hub.video.tools(ffOver()); return Boolean(ffTools.ffmpeg); }
  // quiet ffmpeg jobs of our own (proxies): no toast, resolved on 'done'
  const jobs = new Map();
  window.hub.video?.onJob?.((ev) => { const j = jobs.get(ev.id); if (!j) return; if (ev.type === 'progress') j.pct = ev.pct; if (ev.type === 'done') { jobs.delete(ev.id); j.resolve(ev); } });
  async function ff(args, { input, output, duration = 0 }) {
    const id = `pk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const done = new Promise((resolve) => jobs.set(id, { resolve, pct: 0 }));
    await window.hub.video.transcode({ id, input, output, args, duration }, ffOver());
    return done;
  }
  const kv = { get: async (k, d) => (await window.hub.kvGet(k, d)) ?? d, set: (k, v) => window.hub.kvSet(k, v) };
  async function workDir(sub) { const d = (await window.hub.capture.dir()).dir; return join(d, sub); }
  const refresh = () => { try { if (cut().active && !cut().playing) cut().goto(cut().time); } catch { /* not editing */ } };

  // ---------- proxies ----------
  let PX = { on: true, files: {}, rev: {} };
  const pxReady = (async () => { try { PX = { ...PX, ...(await kv.get('video-proxies', {})) }; PX.files ||= {}; PX.rev ||= {}; } catch { /* first run */ } })();
  const savePX = () => kv.set('video-proxies', PX);
  const making = new Map(); // key → Promise
  function previewSrc(src) { const p = PX.on && PX.files[src]; return p && !p.bad ? p.path : null; }
  async function srcInfo(src) { try { return await window.hub.video.probe(src, ffOver()); } catch { return null; } }
  const heavy = (m) => Boolean(m && ((m.w || 0) * (m.h || 0) > 1920 * 1088 * 1.05 || (m.bitrate || 0) > 40e6 || /hevc|prores|dnxh/i.test(m.codec || '')));
  async function makeProxy(src, { force = false } = {}) {
    await pxReady;
    if (!force && PX.files[src] && await window.hub.fs.stat(PX.files[src].path).catch(() => null)) return PX.files[src].path;
    if (making.has(src)) return making.get(src);
    const p = (async () => {
      if (!await hasFF()) throw new Error(`ffmpeg isn't installed: proxies need it (${ffTools.hint}).`);
      const m = await srcInfo(src);
      const out = join(await workDir('.proxies'), `${noExt(base(src)).replace(/[^\w.-]+/g, '_').slice(0, 60)}_${Date.now().toString(36)}_proxy.mp4`);
      const vf = (m?.h || 0) > 540 ? ['-vf', 'scale=-2:540'] : [];
      // same frames at the same times (no frame dropped or added), light to decode, a keyframe every 12 frames
      const ev = await ff(['-hide_banner', '-y', '-i', 'INPUT', '-map', '0:v:0', '-map', '0:a?', ...vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-g', '12', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'OUTPUT'], { input: src, output: out, duration: m?.duration || 0 });
      if (ev.code !== 0) throw new Error(`The proxy failed: ${ev.error || ev.code}`);
      PX.files[src] = { path: out, made: Date.now(), w: m?.w, h: m?.h };
      savePX(); refresh();
      return out;
    })().finally(() => making.delete(src));
    making.set(src, p);
    return p;
  }
  // a reversed copy of a clip's part (in → out) for real-time reverse playback; null until it exists (it starts making it)
  const revKey = (c) => `${c.src}|${r4(c.in)}|${r4(c.out)}`;
  function reverseProxy(c) {
    if (!PX.on || !c?.reverse || !c.src) return null;
    const k = revKey(c);
    const have = PX.rev[k];
    if (have?.path && !have.bad) return have.path;
    if (have?.bad || making.has(k) || c.out - c.in > 90) return null;
    const p = (async () => {
      if (!await hasFF()) return null;
      const out = join(await workDir('.proxies'), `${noExt(base(c.src)).replace(/[^\w.-]+/g, '_').slice(0, 50)}_rev_${Date.now().toString(36)}.mp4`);
      const ev = await ff(['-hide_banner', '-y', '-ss', String(c.in), '-to', String(c.out), '-i', 'INPUT', '-an', '-vf', 'scale=-2:min(720\\,ih),reverse', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '6', '-pix_fmt', 'yuv420p', 'OUTPUT'], { input: c.src, output: out, duration: c.out - c.in });
      PX.rev[k] = ev.code === 0 ? { path: out, made: Date.now() } : { bad: true };
      savePX();
      return ev.code === 0 ? out : null;
    })().catch(() => { PX.rev[k] = { bad: true }; return null; }).finally(() => making.delete(k));
    making.set(k, p);
    return null;
  }
  async function proxyAll({ all = false } = {}) {
    const e = cut().edit; if (!e) throw new Error('Open the editor first.');
    const srcs = [...new Set([...C.sources(e), ...(e.tracks || []).flatMap((k) => k.items.filter((x) => x.src && x.kind === 'video').map((x) => x.src))])];
    const made = []; const skipped = [];
    for (const s of srcs) { const m = await srcInfo(s); if (all || heavy(m)) { await makeProxy(s); made.push(base(s)); } else skipped.push(base(s)); }
    return { made, skipped };
  }
  async function clearProxies() {
    await pxReady;
    const paths = [...Object.values(PX.files), ...Object.values(PX.rev)].map((x) => x.path).filter(Boolean);
    for (const p of paths) await window.hub.fs.trash(p).catch(() => {});
    PX.files = {}; PX.rev = {}; savePX(); refresh();
    return paths.length;
  }
  function setProxies(on) { PX.on = on ?? !PX.on; savePX(); refresh(); return PX.on; }

  // ---------- LUTs ----------
  const luts = new Map(); // path → { lut, fit } | Promise
  let lutLib = [];
  kv.get('video-luts', []).then((v) => { lutLib = Array.isArray(v) ? v : []; }).catch(() => {});
  async function loadLut(path) {
    if (luts.has(path)) return luts.get(path);
    const p = (async () => { const text = await window.hub.fs.read(path); const lut = parseCube(typeof text === 'string' ? text : new TextDecoder().decode(text)); return { lut, fit: fitLut(lut) }; })();
    luts.set(path, p);
    try { const v = await p; luts.set(path, v); return v; } catch (err) { luts.delete(path); throw err; }
  }
  // the preview's SVG filter for a LUT (curves + matrix), made once
  const lutIds = new Map(); let svgDefs = null;
  function lutCss(c) {
    const path = c?.lut?.path; if (!path) return '';
    const L = luts.get(path);
    if (!L) { loadLut(path).then(refresh, () => {}); return ''; }
    if (L instanceof Promise) return '';
    if (lutIds.has(path)) return lutIds.get(path);
    const NS = 'http://www.w3.org/2000/svg';
    if (!svgDefs?.isConnected) { const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none'; svgDefs = document.createElementNS(NS, 'defs'); svg.append(svgDefs); document.body.append(svg); }
    const f = document.createElementNS(NS, 'filter'); const id = `vpk-lut-${lutIds.size + 1}`; f.id = id; f.setAttribute('color-interpolation-filters', 'sRGB');
    const ct = document.createElementNS(NS, 'feComponentTransfer');
    ['R', 'G', 'B'].forEach((ch, i) => { const fn = document.createElementNS(NS, `feFunc${ch}`); fn.setAttribute('type', 'table'); fn.setAttribute('tableValues', L.fit.curve[i].map((x) => x.toFixed(4)).join(' ')); ct.append(fn); });
    const mx = document.createElementNS(NS, 'feColorMatrix'); mx.setAttribute('type', 'matrix');
    const { m, o } = L.fit; mx.setAttribute('values', [m[0], m[1], m[2], 0, o[0], m[3], m[4], m[5], 0, o[1], m[6], m[7], m[8], 0, o[2], 0, 0, 0, 1, 0].map((x) => Number(x.toFixed(5))).join(' '));
    f.append(ct, mx); svgDefs.append(f);
    const css = `url(#${id})`; lutIds.set(path, css);
    return css;
  }
  async function setLut(path, ids = null) {
    const e = cut().edit; const list = ids || cut().selection.concat([]);
    const tg = list.length ? list : (() => { const x = C.at(e, Math.min(cut().time, Math.max(0, C.mainTotal(e) - 1e-4))); return x ? [x.clip.id] : []; })();
    if (!tg.length) throw new Error('Select a clip first.');
    if (!path || path === 'off') { cut().commit(C.patchAny(e, tg, (c) => { delete c.lut; }), 'LUT removed'); return null; }
    const L = await loadLut(path);
    const entry = { path, name: L.lut.title || noExt(base(path)), kind: L.lut.kind };
    cut().commit(C.patchAny(cut().edit, tg, (c) => { c.lut = { ...entry }; }), `LUT: ${entry.name}`);
    lutLib = [entry, ...lutLib.filter((x) => x.path !== path)].slice(0, 30); kv.set('video-luts', lutLib);
    return { ...entry, previewError: Number(L.fit.err.toFixed(3)) };
  }
  async function pickLut(ids) {
    const [p] = await window.hub.openDialog({ filters: [{ name: 'LUT', extensions: ['cube'] }] }) || [];
    if (p) return setLut(p, ids);
    return null;
  }
  const findLut = (q) => { const s = String(q || '').toLowerCase(); return lutLib.find((x) => x.name.toLowerCase() === s) || lutLib.find((x) => x.name.toLowerCase().includes(s) || base(x.path).toLowerCase().includes(s)); };

  // ---------- adjustment layers ----------
  function addAdjustment({ at = null, dur = null, look = null } = {}) {
    const e = cut().edit; if (!e) throw new Error('Open the editor first.');
    const mk = e.mark;
    const start = at ?? mk?.a ?? cut().time;
    const len = dur ?? (mk ? mk.b - mk.a : Math.max(1, Math.min(5, C.total(e) - start)));
    let n = C.addItem(e, { kind: 'adjust', start, dur: len, name: 'Adjustment' });
    const id = n.lastItem;
    if (look) { const l = EditFX.find(EditFX.LOOKS, look); if (l) n = C.patchAny(n, [id], (c) => { c.color = { look: l.id }; }); }
    cut().commit(n, '◐ Adjustment layer');
    cut().selectIds([id]);
    return id;
  }
  // the preview: what's under it, redrawn through its look / effects / LUT (opacity and fades mix it in)
  let adjCanvas = null;
  function drawAdjust(g, L, T, W, H, comp) {
    const c = L.clip; if (c.off) return;
    const local = clamp(T - L.start, 0, L.end - L.start); const d = L.end - L.start;
    let op = C.propAt(c, 'opacity', local);
    if (c.fadeIn > 0 && local < c.fadeIn) op *= local / c.fadeIn;
    if (c.fadeOut > 0 && d - local < c.fadeOut) op *= (d - local) / c.fadeOut;
    if (op <= 0.002) return;
    const look = comp.filterOf(c);
    const css = [look?.css, lutCss(c), ...(c.fx || []).map((f) => ({ ...EditFX.EFFECT[f.id], amt: f.amt ?? 1 })).filter((f) => f.css).map((f) => f.css(f.amt))].filter(Boolean).join(' ');
    if (!css && !(look?.vignette > 0.005)) return;
    adjCanvas ||= document.createElement('canvas');
    if (adjCanvas.width !== W || adjCanvas.height !== H) { adjCanvas.width = W; adjCanvas.height = H; }
    const a = adjCanvas.getContext('2d'); a.clearRect(0, 0, W, H); a.drawImage(g.canvas, 0, 0, W, H);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = clamp(op, 0, 1); g.globalCompositeOperation = 'source-over';
    if (css) g.filter = css;
    g.drawImage(adjCanvas, 0, 0, W, H);
    g.filter = 'none';
    if (look?.vignette > 0.005) { const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${(look.vignette * 0.85).toFixed(3)})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    g.restore();
  }

  // ---------- ducking ----------
  const isVoiceTrack = (k) => Boolean(k.voice || (k.voice !== false && /voice|vo\b|dialog|speech|narrat/i.test(k.name || '')));
  async function monoOf(src) {
    const b = VideoSound.bufferOf(src); await b.p;
    if (!b.buf) return null;
    const ch = b.buf.numberOfChannels; const n = b.buf.length; const out = new Float32Array(n);
    for (let c = 0; c < ch; c += 1) { const d = b.buf.getChannelData(c); for (let i = 0; i < n; i += 1) out[i] += d[i] / ch; }
    return { samples: out, rate: b.buf.sampleRate, duration: b.buf.duration };
  }
  // program ranges where the voice speaks: voice tracks' items, clips with the Voice effect, else the main track's sound
  async function voiceRanges(e) {
    const sources = [];
    for (const k of e.tracks || []) if (k.type === 'audio' && isVoiceTrack(k) && !k.mute) for (const it of k.items) if (!it.off && !it.mute) sources.push({ c: it, start: it.start, end: C.itemEnd(it) });
    for (const x of C.layout(e)) if (x.clip.kind === 'video' && (x.clip.afx || []).includes('voice') && !x.clip.mute) sources.push({ c: x.clip, start: x.start, end: x.end });
    let from = 'voice';
    if (!sources.length) { from = 'main'; for (const x of C.layout(e)) if (x.clip.kind === 'video' && !x.clip.mute && !x.clip.off) sources.push({ c: x.clip, start: x.start, end: x.end }); }
    const ranges = [];
    for (const s of sources) {
      const m = await monoOf(s.c.src).catch(() => null);
      if (!m) { ranges.push([s.start, s.end]); continue; }
      const a = Math.floor(clamp(Math.min(s.c.in, s.c.out), 0, m.duration) * m.rate); const b = Math.floor(clamp(Math.max(s.c.in, s.c.out), 0, m.duration) * m.rate);
      const part = m.samples.subarray(a, b);
      const sp = s.c.speed || 1;
      for (const [x, y] of speechRanges(part, m.rate)) {
        const p0 = s.c.reverse ? s.start + ((b - a) / m.rate - y) / sp : s.start + x / sp;
        const p1 = s.c.reverse ? s.start + ((b - a) / m.rate - x) / sp : s.start + y / sp;
        ranges.push([clamp(p0, s.start, s.end), clamp(p1, s.start, s.end)]);
      }
    }
    return { ranges: ranges.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]), from };
  }
  async function duck({ db = -12, off = false } = {}) {
    const e = cut().edit; if (!e) throw new Error('Open the editor first.');
    const music = (e.tracks || []).filter((k) => k.type === 'audio' && !isVoiceTrack(k)).flatMap((k) => k.items);
    if (!music.length) throw new Error('No music to duck: put it on an audio track (＋ › Music or sound…).');
    if (off) { cut().commit(C.patchAny(e, music.map((x) => x.id), (c) => { if (c.ducked && c.keys) { delete c.keys.volume; if (!Object.keys(c.keys).length) delete c.keys; delete c.ducked; } }), 'Ducking removed'); return { items: music.length, off: true }; }
    const { ranges, from } = await voiceRanges(e);
    if (!ranges.length) throw new Error('No voice found to duck under (a track named Voice, or the Voice sound effect on a clip).');
    const depth = 10 ** (clamp(Number(db) || -12, -40, -1) / 20);
    let n = 0;
    const next = C.patchAny(cut().edit, music.map((x) => x.id), (c) => {
      const keys = duckKeys(c, ranges, { depth, base: c.volume ?? 1 });
      if (!keys) return;
      c.keys = { ...(c.keys || {}), volume: keys }; c.ducked = { db: Number(db) || -12 }; n += 1;
    });
    cut().commit(next, `Music ducked under the ${from === 'voice' ? 'voice' : 'main track'} (${Math.round(Number(db) || -12)} dB)`);
    return { items: n, ranges: ranges.length, from, db: Number(db) || -12 };
  }
  function setVoiceTrack(trackId, on = null) {
    const e = cut().edit; const k = (e.tracks || []).find((x) => x.id === trackId || x.name === trackId);
    if (!k) throw new Error('No such track.');
    const v = on ?? !isVoiceTrack(k);
    cut().commit(C.patchTrack(e, k.id, { voice: v }), v ? `${k.name} is the voice` : `${k.name} isn't the voice`);
    return v;
  }

  // ---------- cuts paced like the mood board ----------
  async function boardItems(boardRef = null) {
    if (typeof Board === 'undefined') return [];
    await Board.ready?.();
    let b = null;
    if (boardRef) b = (await Board.findBoard?.(boardRef)) || null;
    if (!b) { try { const chat = H.activeChat?.(); b = chat ? await Board.boardFor?.(chat.id) : null; } catch { /* none */ } }
    b ||= Board.current();
    return (b?.items || []).filter((i) => i.type !== 'frame');
  }
  async function cutToVibe({ board = null } = {}) {
    const e = cut().edit; if (!e) throw new Error('Open the editor first.');
    const items = await boardItems(board);
    const intervals = boardIntervals(items);
    let beats = [];
    try { beats = C.programBeats(e, cut().analysisMap()).beats || []; } catch { beats = []; }
    const times = vibeCuts({ from: 0, to: C.mainTotal(e), intervals, beats, have: C.cuts(e) });
    cut().suggest('vibe', times);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return { cuts: times.length, pace: Number(avg.toFixed(2)), clips: items.filter((i) => i.vibe?.kind === 'clip').length, beats: beats.length };
  }

  // ---------- multicam ----------
  async function syncOffset(srcA, srcB) {
    const [a, b] = await Promise.all([monoOf(srcA), monoOf(srcB)]);
    if (!a || !b) return { lag: 0, score: 0, synced: false };
    const ea = envelope(a.samples.subarray(0, Math.min(a.samples.length, a.rate * 120)), a.rate);
    const eb = envelope(b.samples.subarray(0, Math.min(b.samples.length, b.rate * 120)), b.rate);
    const r = offsetByCorrelation(ea, eb, 50, 20);
    return { ...r, synced: r.score > 0 };
  }
  // angles: files (or the selected clips' files). The first one is the reference; the others are synced by sound.
  async function makeMulticam(paths, { sync = true } = {}) {
    const e = cut().edit; if (!e) throw new Error('Open the editor first.');
    let list = (paths || []).filter(Boolean);
    if (!list.length) list = [...new Set(cut().selection.map((id) => C.find(e, id)?.clip).filter((c) => c?.kind === 'video').map((c) => c.src))];
    if (list.length < 2) throw new Error('Multicam needs two or more takes of the same moment (select them, or name the files).');
    const angles = [{ src: list[0], offset: 0, name: noExt(base(list[0])) }];
    for (const s of list.slice(1)) { const r = sync ? await syncOffset(list[0], s).catch(() => ({ lag: 0, synced: false })) : { lag: 0, synced: false }; angles.push({ src: s, offset: r4(r.lag), name: noExt(base(s)), synced: r.synced }); }
    const n = C.copy(e); n.multicam = { angles };
    cut().commit(n, `Multicam: ${angles.length} angles`);
    // no angle on the main track yet: angle 1 goes there (the angles then cut in over it)
    if (!n.clips.some((c) => angles.some((a) => a.src === c.src))) await cut().addClip(angles[0].src);
    return angles;
  }
  async function angleAt(to, { at = null } = {}) {
    const e = cut().edit; const mc = e?.multicam;
    if (!mc?.angles?.length) throw new Error('No multicam here: /multicam with two or more takes first.');
    const i = Number(to) - 1;
    if (!mc.angles[i]) throw new Error(`Angle ${to}? This multicam has ${mc.angles.length}.`);
    const T = at ?? cut().time;
    let n = C.split(e, T);
    const x = C.at(n, Math.min(T + 1e-4, Math.max(0, C.mainTotal(n) - 1e-4)));
    if (!x || x.clip.kind !== 'video') throw new Error('No video clip at the playhead.');
    const dur = (await srcInfo(mc.angles[i].src))?.duration || null;
    const sw = angleSwap(x.clip, mc.angles, i, dur);
    if (!sw) throw new Error('That clip isn\'t one of the angles.');
    n = C.copy(n); n.clips[x.i] = sw;
    cut().commit(n, `Angle ${to}: ${mc.angles[i].name}`);
    return mc.angles[i].name;
  }
  function angleKey(digit) { const mc = cut().edit?.multicam; if (!mc?.angles?.[digit - 1]) return false; angleAt(digit).catch((err) => say(err.message)); return true; }

  // ---------- render queue ----------
  let Q = []; let qRunning = false;
  kv.get('video-render-queue', []).then((v) => { Q = Array.isArray(v) ? v : []; }).catch(() => {});
  const saveQ = () => kv.set('video-render-queue', Q);
  function queueAdd(presets = [null]) {
    const p = cut().path; if (!p) throw new Error('Open the editor first.');
    const name = p.startsWith('seq:') ? p.slice(4) : base(p);
    for (const preset of presets) Q.push({ id: Math.random().toString(36).slice(2, 8), path: p, name, preset: preset || null, added: Date.now(), state: 'waiting' });
    saveQ();
    return Q.filter((x) => x.state === 'waiting').length;
  }
  async function openEdit(path) {
    if (cut().path === path && cut().active) return;
    if (path.startsWith('seq:')) { await cut().enter({ path }); return; }
    if (cut().active) cut().leave();
    await Review.open(path); await Review.waitReady(); await cut().enter();
  }
  async function queueRun() {
    if (qRunning) return { running: true };
    qRunning = true;
    const outs = []; const failed = [];
    try {
      for (const job of Q.filter((x) => x.state === 'waiting')) {
        job.state = 'rendering'; saveQ();
        try {
          await openEdit(job.path);
          const j = await cut().exportCut(job.preset ? { preset: job.preset } : {});
          const ev = j ? await j.done : null;
          if (!ev || ev.code !== 0) throw new Error(ev?.error || 'did not start');
          job.state = 'done'; job.output = ev.output; outs.push(ev.output);
        } catch (err) { job.state = 'failed'; job.error = err.message; failed.push(`${job.name}${job.preset ? ` (${job.preset})` : ''}: ${err.message}`); }
        saveQ();
      }
    } finally { qRunning = false; }
    return { done: outs, failed };
  }
  function queueClear(all = false) { Q = all ? [] : Q.filter((x) => x.state === 'waiting' || x.state === 'rendering'); saveQ(); return Q.length; }
  const queueList = () => Q.map((x) => ({ ...x }));

  // ---------- chapters → markers ----------
  async function chaptersToMarkers(src = null) {
    const e = cut().edit; if (!e) throw new Error('Open the editor first.');
    const all = (await window.hub.kvGet('capture-marks', {})) || {};
    let n = e; let added = 0;
    for (const x of C.layout(e)) {
      if (src && x.clip.src !== src) continue;
      const marks = all[x.clip.src]; if (!marks?.length) continue;
      for (const m of marks) {
        // a chapter at source time m.time is at program time start + (time − in) / speed, if that part is in the edit
        const s = x.clip.speed || 1; const tp = x.clip.reverse ? x.start + (x.clip.out - m.time) / s : x.start + (m.time - x.clip.in) / s;
        if (tp < x.start - 1e-3 || tp > x.end + 1e-3 || n.markers.some((q) => Math.abs(q.t - tp) < 0.05)) continue;
        n = C.addMarker(n, tp, m.label || 'chapter'); added += 1;
      }
    }
    if (added) cut().commit(n, `${added} chapter${added === 1 ? '' : 's'} → markers`);
    return added;
  }
  // a recording opened in the editor brings its chapters once (VideoCut 'enter')
  const seen = new Set();
  function onEnter() {
    const p = cut().path; if (!p || p.startsWith('seq:') || seen.has(p)) return;
    seen.add(p);
    if ((cut().edit?.markers || []).length) return;
    chaptersToMarkers(p).then((n) => { if (n) say(`${n} chapter${n === 1 ? '' : 's'} from the recording are markers (PgUp / PgDn jump)`); }).catch(() => {});
    if (typeof VideoSound !== 'undefined') VideoSound.warm(cut().edit);
  }
  // (VideoPack loads after the editor: its 'mode' event says when it opens)
  if (typeof VideoCut !== 'undefined') VideoCut.on('mode', (d) => { if (d?.on) setTimeout(onEnter, 0); });

  // ---------- menus (hooked into the editor's own) ----------
  function lutMenu(c, ids) {
    return { label: `LUT${c.lut ? `: ${c.lut.name}` : ''}`, items: () => [
      { label: 'Import a .cube LUT…', action: () => pickLut(ids).catch((err) => say(err.message)) },
      ...lutLib.slice(0, 12).map((x) => ({ label: `${c.lut?.path === x.path ? '✓ ' : ''}${x.name}`, action: () => setLut(x.path, ids).catch((err) => say(err.message)) })),
      c.lut ? { label: 'No LUT', action: () => setLut('off', ids) } : null,
    ].filter(Boolean) };
  }
  function clipItems(c, ids, { isItem }) {
    const mc = cut().edit?.multicam;
    return [
      !isItem && c.kind === 'video' && mc?.angles?.length ? { label: 'Angle', items: () => mc.angles.map((a, i) => ({ label: `${(c.cam ?? mc.angles.findIndex((x) => x.src === c.src)) === i ? '✓ ' : ''}${i + 1}. ${a.name} (Alt+${i + 1})`, action: () => angleAt(i + 1).catch((err) => say(err.message)) })) } : null,
      c.kind === 'video' && c.src ? { more: true, label: previewSrc(c.src) ? 'Proxy: in use (a lighter copy plays here)' : 'Make a proxy (lighter preview)', action: () => makeProxy(c.src, { force: Boolean(previewSrc(c.src)) }).then(() => say('Proxy ready: the preview plays the lighter copy, renders use the original'), (err) => say(err.message)) } : null,
    ].filter(Boolean);
  }
  function trackItems(k) {
    if (k.type !== 'audio') return [];
    return [
      { label: `${isVoiceTrack(k) ? '✓ ' : ''}The voice track (the music ducks under it)`, action: () => setVoiceTrack(k.id) },
      !isVoiceTrack(k) && k.items.length ? { label: 'Duck this music under the voice', action: () => duck().then((r) => say(`Ducked ${r.items} item${r.items === 1 ? '' : 's'} under ${r.ranges} spoken part${r.ranges === 1 ? '' : 's'}`), (err) => say(err.message)) } : null,
    ].filter(Boolean);
  }
  const addItems = () => [{ label: 'Adjustment layer (a look over everything under it)', action: () => addAdjustment() }];
  function moreItems() {
    const e = cut().edit;
    return [
      { label: 'Duck the music under the voice', action: () => duck().then((r) => say(`Music ducked (${r.ranges} spoken parts)`), (err) => say(err.message)) },
      (e?.tracks || []).some((k) => k.items.some((x) => x.ducked)) ? { label: 'Remove the ducking', action: () => duck({ off: true }) } : null,
      { label: 'Cut to the board\'s pacing', action: () => cutToVibe().then((r) => say(r.cuts ? `${r.cuts} cuts paced like the board (≈${r.pace} s a shot): Enter applies` : 'No new cuts at that pacing'), (err) => say(err.message)) },
      { label: 'Adjustment layer here', action: () => addAdjustment() },
      { label: 'Multicam', items: () => [
        { label: 'Make one from the selected clips (synced by sound)', action: () => makeMulticam([]).then((a) => say(`${a.length} angles: Alt+1…${a.length} cut to one at the playhead`), (err) => say(err.message)) },
        ...(e?.multicam?.angles || []).map((a, i) => ({ label: `Cut to ${i + 1}. ${a.name} (Alt+${i + 1})`, action: () => angleAt(i + 1).catch((err) => say(err.message)) })),
      ] },
      { label: 'LUT on the selection', items: () => lutMenu({}, null).items() },
      { label: 'Proxies', items: () => [
        { label: 'Make proxies for the heavy files', action: () => proxyAll().then((r) => say(r.made.length ? `Proxies: ${r.made.join(', ')}` : 'No heavy files here (/proxy make all makes them anyway)'), (err) => say(err.message)) },
        { label: `${PX.on ? '✓ ' : ''}Play proxies in the preview`, action: () => say(setProxies() ? 'Proxies on' : 'Proxies off: the originals play') },
        { label: 'Delete every proxy', action: () => clearProxies().then((n) => say(`${n} prox${n === 1 ? 'y' : 'ies'} in the Trash`)) },
      ] },
      { label: `${VideoSound.enabled ? '✓ ' : ''}Hear sound effects and music in the preview`, action: () => say(VideoSound.setEnabled() ? 'Preview sound: effects and audio tracks heard' : 'Preview sound: clean decoder sound only') },
      { label: 'Recording chapters → markers', action: () => chaptersToMarkers().then((n) => say(n ? `${n} markers` : 'No chapters on these clips')) },
    ].filter(Boolean);
  }
  function queueMenu(presets) {
    const waiting = Q.filter((x) => x.state === 'waiting').length;
    return { label: `Render queue${waiting ? ` (${waiting})` : ''}`, items: () => [
      { label: 'Add: this edit as a new version', action: () => say(`${queueAdd([null])} waiting`) },
      { label: 'Add: the 4 socials', action: () => say(`${queueAdd(['reels', 'feed45', 'square', 'yt1080'])} waiting`) },
      { label: 'Add a preset', items: () => presets.map((p) => ({ label: p.name, action: () => say(`${queueAdd([p.id])} waiting`) })) },
      waiting ? { label: `▶ Render the queue (${waiting})`, action: () => queueRun().then((r) => say(`Queue: ${r.done.length} rendered${r.failed.length ? `, ${r.failed.length} failed` : ''}`)) } : null,
      ...Q.slice(-8).map((x) => ({ label: `${{ waiting: '◌', rendering: '◔', done: '✓', failed: '✕' }[x.state] || '·'} ${x.name} · ${x.preset || 'new version'}`, action: () => (x.output ? Review.open(x.output) : null) })),
      Q.length ? { label: 'Clear finished', action: () => queueClear() } : null,
    ].filter(Boolean) };
  }

  // ---------- the agents' ops (video_edit { op }) ----------
  const OPS = ['duck', 'lut', 'adjustment', 'multicam', 'angle', 'proxy', 'queue', 'vibecuts', 'chapters', 'voice', 'preview-sound'];
  async function agentOp(o, a) {
    switch (o) {
      case 'duck': { const r = await duck({ db: a.db ?? a.value ?? -12, off: a.on === false || a.value === 'off' }); return r.off ? 'ducking removed' : `ducked ${r.items} music items under ${r.ranges} spoken parts (${r.from}, ${r.db} dB)`; }
      case 'voice': { const k = (cut().edit.tracks || []).find((x) => x.name === a.track || x.id === a.track); if (!k) throw new Error('track: an audio track name (A1…)'); return `${k.name} voice: ${setVoiceTrack(k.id, a.on ?? null)}`; }
      case 'lut': { if (!a.path || a.path === 'off') { await setLut('off', a.ids); return 'LUT removed'; } const p = /[\\/]/.test(a.path) ? a.path : findLut(a.path)?.path; if (!p) throw new Error('path: a .cube file'); const r = await setLut(p, a.ids); return `LUT ${r.name} (${r.kind}); preview twin error ${r.previewError}`; }
      case 'adjustment': { const id = addAdjustment({ at: a.at ?? null, dur: a.dur ?? null, look: a.look || null }); return `adjustment layer ${id}: give it a look / effect / LUT with clip "${id}"`; }
      case 'multicam': { const angles = await makeMulticam([].concat(a.paths || a.path || []).filter(Boolean)); return angles.map((x, i) => `${i + 1}. ${x.name}${i ? ` offset ${x.offset}s${x.synced ? '' : ' (not synced)'}` : ''}`).join(' · '); }
      case 'angle': return `angle ${a.angle ?? a.value}: ${await angleAt(a.angle ?? a.value, { at: a.at ?? null })}`;
      case 'proxy': { if (a.value === 'off' || a.value === 'on') return `proxies ${setProxies(a.value === 'on') ? 'on' : 'off'}`; if (a.value === 'clear') return `${await clearProxies()} proxies deleted`; const r = await proxyAll({ all: a.value === 'all' }); return `proxies made: ${r.made.join(', ') || 'none (no heavy files)'}`; }
      case 'queue': { const act = a.action || a.value || 'list'; if (act === 'add') return `${queueAdd([].concat(a.preset || null))} waiting`; if (act === 'run') { const r = await queueRun(); return `rendered ${r.done.length}${r.failed.length ? `; failed: ${r.failed.join('; ')}` : ''}`; } if (act === 'clear') return `${queueClear(true)} left`; return Q.map((x) => `${x.state} ${x.name} ${x.preset || 'version'}`).join('\n') || 'empty'; }
      case 'vibecuts': { const r = await cutToVibe({ board: a.board || null }); return `${r.cuts} suggested cuts at ≈${r.pace}s a shot (${r.clips} board clips, ${r.beats} beats); video_edit {op:"command", line:"/cut-auto apply"} or the owner presses Enter`; }
      case 'chapters': return `${await chaptersToMarkers(a.path || null)} markers from recording chapters`;
      case 'preview-sound': return `preview sound ${VideoSound.setEnabled(a.on ?? null) ? 'on' : 'off'}`;
      default: throw new Error(`Unknown op ${o}`);
    }
  }

  return { ...PURE, previewSrc, reverseProxy, makeProxy, proxyAll, clearProxies, setProxies, get proxies() { return { on: PX.on, files: { ...PX.files }, rev: { ...PX.rev } }; },
    loadLut, setLut, pickLut, lutCss, findLut, get lutLibrary() { return lutLib.slice(); }, addAdjustment, drawAdjust, duck, voiceRanges, setVoiceTrack, isVoiceTrack, cutToVibe, boardItems,
    makeMulticam, angleAt, angleKey, syncOffset, queueAdd, queueRun, queueClear, queueList, chaptersToMarkers, lutMenu, clipItems, trackItems, addItems, moreItems, queueMenu, OPS, agentOp };
})();
if (typeof module !== 'undefined') module.exports = VideoPack;
