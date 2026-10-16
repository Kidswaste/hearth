// ▶ Play, got ready (round 52, gameready): the pure part (UMD: the window loads it with tools/gameready.js, the main
// process' gamereadymain.js and dev/gameready-test.js require it). No DOM, no I/O.
//   entryKey(file)              the optimized copy's key: the file's content hash, its kind and the flags' version
//   check(index, files)         { fresh, stale, missing }: per file (path → content hash now), the cached copy to use, the
//                               ones made from an older version of the file (they go to the Trash), the ones not made yet
//   over(index, limits)         the least recently used entries past the cache's size / count cap (to the Trash)
//   rewriteMap(index, files)    { original path → optimized path } for the fresh entries only · rewrite(map, url)
//   findings(inv)               plain lines about what the game costs ("3 textures are 8K — they cost 1.1 GB of video memory")
//   vram(w, h, o)               bytes a texture takes on the graphics card (mipmaps add a third; compressed: 1 byte/px)
//   progress(stage, f) / label(stage, counts) / line(title, stage, counts, f)   the card's words and %
//   canOptimize(file, ctx)      may this file be swapped for an optimized copy without the game breaking?
//   gltfpackArgs(i, o, o2) / installPlan(platform)   the encoder's flags, the install command shown before it runs
(function (root, factory) { const m = factory(); if (typeof module === 'object' && module.exports) module.exports = m; else root.GameReadyCore = m; })(typeof self !== 'undefined' ? self : this, () => {
  // ---------- keys ----------
  function canon(v) {
    if (v == null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(canon);
    const o = {}; for (const k of Object.keys(v).sort()) if (v[k] !== undefined && typeof v[k] !== 'function') o[k] = canon(v[k]);
    return o;
  }
  // two FNV-1a passes with different seeds (64 bits): a name for a cache entry, not a security hash
  function hash(str) {
    let a = 2166136261; let b = 0x811c9dc5 ^ 0x5bd1e995;
    for (let i = 0; i < str.length; i += 1) { const c = str.charCodeAt(i); a ^= c; a = Math.imul(a, 16777619) >>> 0; b ^= c + 0x9e37; b = Math.imul(b, 0x01000193) >>> 0; b ^= b >>> 13; }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  const TOOL_V = 1; // bump when the flags below change: every older copy is stale
  // (the encoder's flags are fixed per TOOL_V: a copy is found again whichever gltfpack made it)
  // (round 53, gametex) variant 'ktx2': a copy whose pictures are KTX2 too (only for a game that loads KTX2: a Lab
  // scene on a graphics card with compressed formats, an HTML build whose loader showed a KTX2 decoder)
  function entryKey(file) {
    return hash(JSON.stringify(canon({ v: TOOL_V, h: String(file?.hash || ''), ext: extOf(file?.path || ''), ...(file?.variant ? { k: String(file.variant) } : {}) })));
  }
  const extOf = (p) => (String(p).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  // the same file whatever the slashes, file:// prefix or (Windows / Mac) letter case
  function norm(p, platform = '') {
    let s = String(p || '');
    if (/^file:\/\//i.test(s)) { s = s.replace(/^file:\/\/(localhost)?/i, ''); try { s = decodeURIComponent(s); } catch { /* as is */ } if (/^\/[a-z]:\//i.test(s)) s = s.slice(1); }
    s = s.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    return platform === 'win32' || platform === 'darwin' ? s.toLowerCase() : s;
  }

  // ---------- the cache: what's fresh, stale, missing, over the cap ----------
  // index: { v: 1, entries: { key: { src, hash, out, bytes, srcBytes, at, used, tool } } }; files: [{ path, hash }]
  function check(index, files, opts = {}, platform = '') {
    const E = index?.entries || {};
    const fresh = []; const missing = []; const stale = [];
    for (const f of files || []) {
      const k = entryKey(f);
      if (E[k]?.out) fresh.push({ key: k, ...E[k], path: f.path }); else missing.push(f);
      for (const [k2, e] of Object.entries(E)) if (k2 !== k && norm(e.src, platform) === norm(f.path, platform) && !stale.some((s) => s.key === k2)) stale.push({ key: k2, ...e });
    }
    return { fresh, stale, missing };
  }
  // least recently used first, until the cache fits its size and count (an entry in use now is never dropped)
  function over(index, { maxBytes = 4 * 2 ** 30, maxEntries = 200, keep = [] } = {}) {
    const list = Object.entries(index?.entries || {}).map(([key, e]) => ({ key, ...e })).sort((a, b) => (a.used || a.at || 0) - (b.used || b.at || 0));
    let bytes = list.reduce((s, e) => s + (e.bytes || 0), 0); let n = list.length;
    const out = [];
    for (const e of list) {
      if (bytes <= maxBytes && n <= maxEntries) break;
      if (keep.includes(e.key)) continue;
      out.push(e); bytes -= e.bytes || 0; n -= 1;
    }
    return out;
  }
  function rewriteMap(index, files, opts = {}, platform = '') {
    const map = {};
    for (const e of check(index, files, opts, platform).fresh) map[norm(e.path, platform)] = e.out;
    return map;
  }
  // a path or file:// URL the game asks for → the optimized copy's path (or null: load the original)
  function rewrite(map, url, platform = '') {
    if (!map || !url) return null;
    return map[norm(url, platform)] || null;
  }

  // ---------- what it found ----------
  const MB = 1048576;
  function vram(w, h, { mips = true, compressed = false, cube = false } = {}) {
    const b = w * h * (compressed ? 1 : 4) * (cube ? 6 : 1);
    return Math.round(mips ? b * 4 / 3 : b);
  }
  const fmtBytes = (n) => (n >= 1024 * MB ? `${(n / (1024 * MB)).toFixed(1)} GB` : `${Math.max(1, Math.round(n / MB))} MB`);
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const sizeName = (s) => (s >= 8192 ? '8K' : s >= 4096 ? '4K' : s >= 2048 ? '2K' : `${s}px`);
  // inv: { textures: [{ w, h, mips, compressed, cube, video }], calls, triangles, programs, lights, shadows, models, videos, audios }
  function findings(inv = {}) {
    const out = [];
    const tex = (inv.textures || []).filter((t) => t && t.w > 0 && t.h > 0);
    for (const big of [8192, 4096]) {
      const set = tex.filter((t) => Math.max(t.w, t.h) >= big && (big === 8192 || Math.max(t.w, t.h) < 8192));
      if (!set.length) continue;
      const b = set.reduce((s, t) => s + vram(t.w, t.h, t), 0);
      out.push({ kind: 'big-textures', size: sizeName(big), n: set.length, bytes: b, text: `${plural(set.length, 'texture')} ${set.length === 1 ? 'is' : 'are'} ${sizeName(big)} — ${set.length === 1 ? 'it costs' : 'they cost'} ${fmtBytes(b)} of video memory` });
    }
    const total = tex.reduce((s, t) => s + vram(t.w, t.h, t), 0);
    if (tex.length) out.push({ kind: 'texture-memory', n: tex.length, bytes: total, text: `${plural(tex.length, 'texture')} in all: ${fmtBytes(total)} of video memory` });
    const raw = tex.filter((t) => !t.compressed && !t.video && Math.max(t.w, t.h) >= 2048).length;
    if (raw >= 2) out.push({ kind: 'uncompressed', n: raw, text: `${plural(raw, 'big texture')} aren't compressed: Optimize for play could make ${raw === 1 ? 'it' : 'them'} lighter on the graphics card` });
    if (inv.calls > 400) out.push({ kind: 'draw-calls', n: inv.calls, text: `${inv.calls.toLocaleString('en-US')} draw calls a frame: merging objects that share a material would help` });
    if (inv.triangles > 5e6) out.push({ kind: 'triangles', n: inv.triangles, text: `${(inv.triangles / 1e6).toFixed(1)} million triangles a frame` });
    if (inv.shadows > 4) out.push({ kind: 'shadows', n: inv.shadows, text: `${inv.shadows} lights cast shadows: each one draws the scene again every frame` });
    if (inv.programs) out.push({ kind: 'shaders', n: inv.programs, text: `${plural(inv.programs, 'shader')} compiled ahead` });
    return out;
  }

  // ---------- the card ----------
  const STAGES = [['scan', 0, 10], ['assets', 10, 45], ['textures', 45, 60], ['effects', 60, 90], ['warm', 90, 100]];
  function progress(stage, f = 0) {
    const s = STAGES.find(([n]) => n === stage); if (!s) return stage === 'done' ? 100 : 0;
    return Math.round(s[1] + (s[2] - s[1]) * Math.max(0, Math.min(1, f)));
  }
  const WORDS = { scan: 'looking at its files', assets: 'loading', textures: 'textures', effects: 'effects', warm: 'warming up', optimize: 'optimizing', done: 'ready' };
  function label(stage, c = {}) {
    const w = WORDS[stage] || stage;
    if (stage === 'assets' && c.total) return `${w} ${c.done || 0}/${c.total}`;
    if (stage === 'textures' && c.total) return `textures ${c.done || 0}/${c.total}`;
    if (stage === 'effects' && c.total) return `effects ${c.done || 0}/${c.total}`;
    return w;
  }
  const line = (stage, c, f) => `${label(stage, c)} · ${progress(stage, f)} %`;
  const title = (name) => `Getting ${String(name || 'the game').slice(0, 40)} ready…`;

  // ---------- optimizing (writes only to Hearth's cache) ----------
  // GLB / glTF: meshopt-compressed (no quantization: the exact same vertices) and, when asked, textures in KTX2 (UASTC:
  // the high-quality mode). Named nodes, materials and extras are kept, so code that finds things by name still does.
  // A Lab scene reads every one (its model loader brings the meshopt / KTX2 decoders a file needs); an HTML game only
  // when its own loader showed it has those decoders (seen in the warm run).
  function canOptimize(file, ctx = {}) {
    const ext = extOf(file?.path || file || '');
    if (!['glb', 'gltf'].includes(ext)) return { ok: false, why: 'only 3D models are optimized (pictures stay as they are: full quality)' };
    if (ctx.kind === 'lab') return { ok: true, textures: true };
    if (ctx.meshopt) return { ok: true, textures: Boolean(ctx.ktx2) };
    return { ok: false, why: 'the game\'s model loader has no meshopt decoder: an optimized copy might not load' };
  }
  function gltfpackArgs(input, output, { textures = false } = {}) {
    return ['-i', input, '-o', output, '-cc', '-ce', 'ext', '-noq', '-kn', '-km', '-ke', ...(textures ? ['-tc', '-tu'] : [])];
  }
  function installPlan(platform = '') {
    return { tool: 'gltfpack', command: 'npm install -g gltfpack', why: 'gltfpack (meshoptimizer) compresses 3D models and their textures for the graphics card', note: platform === 'win32' ? 'Runs in a PowerShell window' : 'Runs in a Terminal window' };
  }

  return { canon, hash, entryKey, norm, extOf, check, over, rewriteMap, rewrite, vram, fmtBytes, findings, STAGES, progress, label, line, title, canOptimize, gltfpackArgs, installPlan, TOOL_V };
});
