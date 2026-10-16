// ▣ Present, got ready (round 52, presentready): the pure part (UMD: the window loads it with tools/three-ready.js,
// dev/presentready-test.js requires it). No DOM, no I/O.
//   key(parts)                 the bake cache key: a hash of the compiled scene (its layers' code with the slider values,
//                              keyframes, placements, looks…), the song (path, size, date), the size, the frame rate, the kind
//   plan(index, want, limits)  { hit, stale, over }: the bake to reuse, the ones the scene made before (stale: a change
//                              since), the oldest ones past the cache's size (both go to the Trash)
//   add(index, entry) / drop(index, keys) / use(index, key, at)
//   verdict(gaps, hz)          can this computer hold the screen's rate at full quality? (frame gaps measured off screen)
//   hzOf(gaps) / stdHz(hz)     the screen's refresh from idle frame gaps / the nearest usual rate
//   bakeFps(hz, secs)          the baked video's frame rate: the screen's, at most 120, and 60 for anything over 30 s
//   bakeSize(screen, frame)    the presentation's pixels (the scene's own frame shape fitted in the screen), even sides, ≤ 4K
//   points(dur, n)             the timeline moments to warm up · progress(stage, frac) → % · STAGES · fmtLeft(s)
(function (root, factory) { const m = factory(); if (typeof module === 'object' && module.exports) module.exports = m; else root.ReadyCore = m; })(typeof self !== 'undefined' ? self : this, () => {
  // ---------- the cache key ----------
  // canonical JSON: keys sorted, functions / undefined left out, binary data as its length + a sample (never whole)
  function canon(v, depth = 0) {
    if (v == null || typeof v === 'boolean') return v === undefined ? undefined : v;
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : String(v);
    if (typeof v === 'string') return v;
    if (typeof v === 'function' || typeof v === 'symbol') return undefined;
    if (depth > 40) return '…';
    if (typeof ArrayBuffer !== 'undefined' && (v instanceof ArrayBuffer || ArrayBuffer.isView?.(v))) {
      const u8 = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      let h = 2166136261; const step = Math.max(1, Math.floor(u8.length / 4096));
      for (let i = 0; i < u8.length; i += step) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; }
      return `bin:${u8.length}:${h.toString(16)}`;
    }
    if (Array.isArray(v)) return v.map((x) => { const c = canon(x, depth + 1); return c === undefined ? null : c; });
    const out = {};
    for (const k of Object.keys(v).sort()) { const c = canon(v[k], depth + 1); if (c !== undefined) out[k] = c; }
    return out;
  }
  // two FNV-1a passes with different seeds: 64 bits, enough to tell scenes apart (not a security hash)
  function hash(str) {
    let a = 2166136261; let b = 0x811c9dc5 ^ 0x5bd1e995;
    for (let i = 0; i < str.length; i += 1) {
      const c = str.charCodeAt(i);
      a ^= c; a = Math.imul(a, 16777619) >>> 0;
      b ^= c + 0x9e37; b = Math.imul(b, 0x01000193) >>> 0; b ^= b >>> 13;
    }
    return a.toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  const VERSION = 1; // (a change to how bakes are made makes every old bake stale)
  function key({ plan = null, song = null, w = 0, h = 0, fps = 0, kind = 'mp4', three = '' } = {}) {
    const s = song ? { path: String(song.path || ''), size: Number(song.size) || 0, mtime: Math.round(Number(song.mtime) || 0) } : null;
    return `pr${hash(JSON.stringify(canon({ v: VERSION, plan, song: s, w: Math.round(w), h: Math.round(h), fps: Math.round(fps * 1000) / 1000, kind, three })))}`;
  }

  // ---------- the cache ----------
  // index: [{ key, scene, path, bytes, w, h, fps, secs, at, usedAt, loop, sound }]
  const LIMITS = { bytes: 4e9, count: 12 };
  const listOf = (index) => (Array.isArray(index) ? index.filter((e) => e && typeof e.key === 'string') : []);
  function plan(index, { key: k, scene = null } = {}, { bytes = LIMITS.bytes, count = LIMITS.count } = {}) {
    const all = listOf(index);
    const hit = all.find((e) => e.key === k) || null;
    // the scene's earlier bakes: something changed since (a slider, a keyframe, the code, the song, the size)
    const stale = scene ? all.filter((e) => e.key !== k && e.scene === scene) : [];
    // the rest, newest use first: past the count or the size, the oldest go
    const keep = all.filter((e) => e !== hit && !stale.includes(e)).sort((a, b) => (b.usedAt || b.at || 0) - (a.usedAt || a.at || 0));
    const over = []; let n = hit ? 1 : 0; let size = hit ? Number(hit.bytes) || 0 : 0;
    for (const e of keep) {
      n += 1; size += Number(e.bytes) || 0;
      if (n > count || size > bytes) over.push(e);
    }
    return { hit, stale, over };
  }
  function add(index, entry) { return [...listOf(index).filter((e) => e.key !== entry.key), { ...entry, usedAt: entry.usedAt || entry.at || 0 }]; }
  function drop(index, keys) { const s = new Set(keys); return listOf(index).filter((e) => !s.has(e.key)); }
  function use(index, k, at) { return listOf(index).map((e) => (e.key === k ? { ...e, usedAt: at } : e)); }

  // ---------- the measure ----------
  const RATES = [24, 25, 30, 48, 50, 60, 72, 75, 85, 90, 100, 120, 144, 165, 170, 175, 180, 200, 240, 280, 360];
  function stdHz(hz) { hz = Number(hz) || 60; let best = 60; let bd = Infinity; for (const r of RATES) { const d = Math.abs(r - hz); if (d < bd) { bd = d; best = r; } } return best; }
  const sorted = (a) => a.filter((x) => Number.isFinite(x) && x > 0).sort((p, q) => p - q);
  function pct(a, p) { const s = sorted(a); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; }
  // the screen's own frame time: the median of the shortest third of the gaps (idle frames run at the screen's rate)
  function hzOf(gaps) { const s = sorted(gaps).filter((g) => g > 2); if (s.length < 4) return 60; const low = s.slice(0, Math.max(3, Math.floor(s.length / 3))); const hz = stdHz(1000 / low[Math.floor(low.length / 2)]); return hz < 48 ? 60 : hz; } // (under 48: a throttled window, not a screen)
  // holds: 95 % of the frames within 1.25 frame times of the screen and at most 3 % over 1.5 (a stutter you'd see)
  function verdict(gaps, hz = 60) {
    const g = sorted(gaps); hz = stdHz(hz);
    const budget = 1000 / hz;
    if (g.length < 8) return { holds: false, hz, budget: +budget.toFixed(2), frames: g.length, fps: 0, p50: null, p95: null, slow: 1, why: 'too few frames to tell' };
    const p50 = pct(g, 0.5); const p95 = pct(g, 0.95);
    const slow = g.filter((x) => x > budget * 1.5).length / g.length;
    const fps = Math.round(1000 / (g.reduce((a, x) => a + x, 0) / g.length));
    const holds = p95 <= budget * 1.25 && slow <= 0.03;
    return { holds, hz, budget: +budget.toFixed(2), frames: g.length, fps, p50: +p50.toFixed(2), p95: +p95.toFixed(2), slow: +slow.toFixed(3), why: holds ? 'holds' : `about ${fps} fps at its heaviest (the screen wants ${hz})` };
  }
  function bakeFps(hz, secs) {
    hz = stdHz(hz);
    const long = Number(secs) > 30;
    const fps = Math.min(hz, long ? 60 : 120);
    return { fps, capped: fps < hz, why: fps < hz ? (long ? `${fps} fps (pieces over 30 s are baked at 60 at most)` : `${fps} fps (bakes go up to 120)`) : `${fps} fps, the screen's own rate` };
  }
  const even = (x) => Math.max(2, Math.round(x / 2) * 2);
  function bakeSize({ w, h } = {}, frame = null, max = 3840) {
    w = Number(w) || 1920; h = Number(h) || 1080;
    let W = w; let H = h;
    if (frame?.w > 0 && frame?.h > 0) { const k = Math.min(w / frame.w, h / frame.h); W = frame.w * k; H = frame.h * k; }
    const k2 = Math.min(1, max / Math.max(W, H), Math.sqrt(8.3e6 / (W * H)));
    return { w: even(W * k2), h: even(H * k2), capped: k2 < 1 };
  }
  // n moments across [0, dur): the start, then evenly up to just before the end
  function points(dur, n = 8) {
    dur = Number(dur) || 0;
    if (dur <= 0.05) return [0];
    n = Math.max(2, Math.min(24, Math.round(n)));
    return Array.from({ length: n }, (_, i) => Math.round(Math.min(dur - 0.05, (i * dur) / (n - 1)) * 1000) / 1000);
  }
  const STAGES = [['song', 'loading the song', 0.08], ['assets', 'loading pictures, videos and models', 0.22], ['shaders', 'preparing effects', 0.3], ['warm', 'warming up', 0.25], ['measure', 'checking it stays smooth', 0.15]];
  function progress(stage, frac = 0) {
    let at = 0;
    for (const [id, , w] of STAGES) { if (id === stage) return Math.round((at + w * Math.max(0, Math.min(1, frac))) * 100); at += w; }
    return 100;
  }
  const labelOf = (stage) => STAGES.find((x) => x[0] === stage)?.[1] || '';
  function fmtLeft(s) { s = Math.max(0, Math.round(Number(s) || 0)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; }
  return { canon, hash, key, VERSION, LIMITS, plan, add, drop, use, stdHz, pct, hzOf, verdict, bakeFps, bakeSize, points, STAGES, progress, labelOf, fmtLeft };
});
