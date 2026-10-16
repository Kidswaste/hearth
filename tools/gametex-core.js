// ▶ Play, lighter textures (round 53, gametex): the pure part (UMD: the hub loads it with the gameready group, the main
// process' gametexmain.js, its worker tools/gametex-worker.js and dev/gametex-test.js require it). No DOM, no I/O.
// "Optimize for play" also compresses a game's textures into KTX2 (Basis Universal): the pictures a Lab scene uses
// (refTexture) and the pictures inside its GLB models. The GPU keeps them compressed: a 4096×2048 picture takes 43 MB of
// video memory as RGBA and 11 MB as UASTC (ASTC / BC7), 5.5 MB as ETC1S (ETC1) where it looks the same.
//   texKey(pic)                 a compressed copy's key: the picture's content hash, its role and orientation, the flags' version
//   roleOf(name) / rolesFromCode(codes, keys)   'color' | 'normal' | 'data': how a picture is used (normal maps never ETC1S)
//   modes(role)                 the encodings tried in order: color → ETC1S then UASTC; normal / data → UASTC
//   verdict(mode, q)            the quality guard: a copy is kept only when it looks the same (PSNR over a floor)
//   compare(orig, got, w, h, o) PSNR / mean / max difference of the copy decoded back against the original's pixels
//   caps(exts, ua)              which compressed formats the graphics card takes (KTX2Loader's own reading) · any: false →
//                               the originals are used (nothing to gain: KTX2 would only be unpacked to RGBA)
//   bpp(mode, alpha, caps)      bytes per pixel on the graphics card for that copy (the format KTX2Loader picks)
//   vramOf(w, h, bpp) / report(items)   "Textures: 640 MB → 160 MB of video memory"
//   checkTex(index, pics) / texMap(index, pics, caps)   fresh / stale / missing / kept per picture; { path → copy } for ▶ Play
//   parseGlb / writeGlb / glbImages / replaceGlbImages   a GLB's pictures swapped for KTX2 ones (KHR_texture_basisu)
(function (root, factory) { const m = factory(typeof module === 'object' && module.exports ? require('./gameready-core') : root.GameReadyCore); if (typeof module === 'object' && module.exports) module.exports = m; else root.GameTexCore = m; })(typeof self !== 'undefined' ? self : this, (GR) => {
  const TEX_V = 1; // bump when the encoder's settings below change: every older copy is made again
  const { hash, norm, extOf, fmtBytes, over } = GR;

  // ---------- what a picture is ----------
  const PICTURES = ['png', 'jpg', 'jpeg'];
  const canEncode = (p) => PICTURES.includes(extOf(p));
  // by its name, when nothing better says it (a Lab reference's key or file name, a GLB image's name)
  function roleOf(name) {
    const s = String(name || '').toLowerCase();
    if (/(^|[^a-z])(normal|nrm|nor|norm)([^a-z]|$)|normalmap|_n\.(png|jpe?g)$/i.test(s)) return 'normal';
    if (/(rough|metal|orm|arm|occlusion|(^|[^a-z])ao([^a-z]|$)|spec|gloss|height|disp|bump|mask|opacity|alpha)/.test(s)) return 'data';
    return 'color';
  }
  const STRICT = { color: 0, data: 1, normal: 2 };
  const stricter = (a, b) => (STRICT[b] > STRICT[a] ? b : a);
  // which material slot a three.js property is: normalMap → normal; map / emissiveMap / … → color; the rest → data
  function roleOfProp(p) {
    const s = String(p || '');
    if (/normalmap$/i.test(s)) return 'normal';
    if (/^(map|emissiveMap|sheenColorMap|specularColorMap|background|envMap|lightMap|matcap|gradientMap)$/.test(s)) return 'color';
    return /Map$/.test(s) ? 'data' : null;
  }
  // a Lab scene's layers: refTexture('key') (or refs.key) put in a material slot, directly or through a variable
  function rolesFromCode(codes, keys) {
    const out = {};
    const src = (codes || []).join('\n');
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const k of keys || []) {
      const ref = `(?:refTexture\\(\\s*['"\`]${esc(k)}['"\`][^)]*\\)|refs\\.${esc(k)}\\b|refs\\[['"]${esc(k)}['"]\\])`;
      let role = null;
      const take = (prop) => { const r = roleOfProp(prop); if (r) role = role ? stricter(role, r) : r; };
      for (const m of src.matchAll(new RegExp(`(\\w+)\\s*[:=]\\s*${ref}`, 'g'))) {
        take(m[1]);
        // const ground = refTexture('ground') … { map: ground } / mat.normalMap = ground
        if (!roleOfProp(m[1])) for (const u of src.matchAll(new RegExp(`(\\w+)\\s*[:=]\\s*${esc(m[1])}\\b(?!\\s*\\()`, 'g'))) if (u[1] !== m[1]) take(u[1]);
      }
      out[k] = role || roleOf(k);
    }
    return out;
  }

  // ---------- the encodings and the quality guard ----------
  // ETC1S: small and half the video memory on ETC GPUs, a bit softer: only where it looks the same; UASTC: near the
  // original (≈ 50 dB on photos), 1 byte a pixel on the GPU; normal maps and data maps always UASTC (ETC1S bends normals)
  const modes = (role) => (role === 'color' ? ['etc1s', 'uastc'] : ['uastc']);
  const FLOOR = { etc1s: 40, uastc: 42 }; // PSNR (dB) of mip 0 decoded back, vs the original's pixels
  function verdict(mode, q) {
    const floor = FLOOR[mode] || 42;
    if (!q || !Number.isFinite(q.psnr)) return { ok: false, why: 'it couldn\'t be checked' };
    if (q.psnr >= floor) return { ok: true };
    return { ok: false, why: `compressed it looked different (${q.psnr.toFixed(1)} dB, needs ${floor})` };
  }
  // orig: RGBA, premultiplied when o.premul (what the system's decoder gives); got: RGBA decoded from the copy (straight
  // alpha); o.flip: the copy is stored bottom row first (a Lab picture: three.js flips pictures, KTX2 can't be flipped)
  function compare(orig, got, w, h, { flip = false, premul = false, alpha = false } = {}) {
    let se = 0; let sum = 0; let max = 0; let n = 0;
    const ch = alpha ? 4 : 3;
    for (let y = 0; y < h; y += 1) {
      const gy = flip ? h - 1 - y : y;
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4; const j = (gy * w + x) * 4;
        const a = got[j + 3] / 255;
        for (let c = 0; c < ch; c += 1) {
          const g = premul && c < 3 ? Math.round(got[j + c] * a) : got[j + c];
          const d = Math.abs(orig[i + c] - g);
          se += d * d; sum += d; if (d > max) max = d; n += 1;
        }
      }
    }
    const mse = n ? se / n : 0;
    return { psnr: mse ? 10 * Math.log10((255 * 255) / mse) : 99, mean: n ? sum / n : 0, max };
  }
  const hasAlpha = (rgba) => { for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true; return false; };

  // ---------- the graphics card ----------
  // exts: the WebGL extension names; KTX2Loader's own reading (three r186), with its Linux note: Mesa drivers expose
  // ETC / ASTC they only emulate, so KTX2Loader leaves them out there
  function caps(exts = [], ua = {}) {
    const has = (n) => exts.includes(n);
    const c = { astc: has('WEBGL_compressed_texture_astc'), etc1: has('WEBGL_compressed_texture_etc1'), etc2: has('WEBGL_compressed_texture_etc'), dxt: has('WEBGL_compressed_texture_s3tc'), bptc: has('EXT_texture_compression_bptc'), pvrtc: has('WEBGL_compressed_texture_pvrtc') || has('WEBKIT_WEBGL_compressed_texture_pvrtc') };
    if (/Linux/.test(ua.platform || '') && !/Android/.test(ua.userAgent || '') && c.astc && c.etc2 && c.bptc && c.dxt) { c.astc = false; c.etc1 = false; c.etc2 = false; }
    c.any = Boolean(c.astc || c.etc1 || c.etc2 || c.dxt || c.bptc);
    return c;
  }
  // KTX2Loader's FORMAT_OPTIONS in its order of priority: the bytes a pixel the GPU keeps
  const OPTIONS = [
    { if: 'astc', modes: ['uastc'], bpp: [1, 1], e: Infinity, u: 1 },
    { if: 'bptc', modes: ['etc1s', 'uastc'], bpp: [1, 1], e: 3, u: 2 },
    { if: 'dxt', modes: ['etc1s', 'uastc'], bpp: [0.5, 1], e: 4, u: 5 },
    { if: 'etc2', modes: ['etc1s', 'uastc'], bpp: [0.5, 1], e: 1, u: 3 },
    { if: 'etc1', modes: ['etc1s', 'uastc'], bpp: [0.5], e: 2, u: 4 },
  ];
  function bpp(mode, alpha, c = {}) {
    const list = OPTIONS.filter((o) => c[o.if] && o.modes.includes(mode) && (!alpha || o.bpp.length > 1)).sort((a, b) => (mode === 'etc1s' ? a.e - b.e : a.u - b.u));
    return list.length ? list[0].bpp[alpha ? 1 : 0] : 4; // nothing fits: unpacked to RGBA (4 bytes)
  }
  const vramOf = (w, h, b = 4, mips = true) => Math.round(w * h * b * (mips ? 4 / 3 : 1));
  // items: [{ w, h, before, after, kept }] → "Textures: 640 MB → 160 MB of video memory"
  function report(items = []) {
    const list = items.filter((x) => x && x.before > 0);
    if (!list.length) return null;
    const before = list.reduce((s, x) => s + x.before, 0);
    const after = list.reduce((s, x) => s + (x.kept ? x.before : x.after || x.before), 0);
    const kept = list.filter((x) => x.kept).length;
    return { n: list.length, kept, before, after, text: `Textures: ${fmtBytes(before)} → ${fmtBytes(after)} of video memory` };
  }

  // ---------- the cache (entries in Hearth's game-cache index, under "tex") ----------
  // pic: { path, hash, role, flip }; entry: { src, hash, role, flip, out, w, h, mode, alpha, psnr, … } or, when the
  // original stays (looked different, too big, unreadable), { src, hash, keep: why } so it isn't tried again
  function texKey(p) { return hash(JSON.stringify({ v: TEX_V, h: String(p?.hash || ''), r: p?.role || 'color', f: p?.flip ? 1 : 0 })); }
  function checkTex(index, pics, platform = '') {
    const E = index?.tex || {};
    const fresh = []; const missing = []; const stale = []; const kept = [];
    for (const p of pics || []) {
      const k = texKey(p); const e = E[k];
      if (e?.out) fresh.push({ key: k, ...e, path: p.path }); else if (e?.keep) kept.push({ key: k, ...e, path: p.path }); else missing.push(p);
      for (const [k2, e2] of Object.entries(E)) if (k2 !== k && norm(e2.src, platform) === norm(p.path, platform) && !(pics || []).some((q) => texKey(q) === k2) && !stale.some((s) => s.key === k2)) stale.push({ key: k2, ...e2 });
    }
    return { fresh, stale, missing, kept };
  }
  // { original path → { out, mode, flip, w, h } } for ▶ Play, only when the graphics card takes a compressed format
  function texMap(index, pics, c = {}, platform = '') {
    const map = {};
    if (!c.any) return map;
    for (const e of checkTex(index, pics, platform).fresh) map[norm(e.path, platform)] = { out: e.out, mode: e.mode, flip: Boolean(e.flip), w: e.w, h: e.h };
    return map;
  }
  // what the copies save on this graphics card (fresh and kept ones)
  function texReport(index, pics, c = {}, platform = '') {
    const r = checkTex(index, pics, platform);
    return report([...r.fresh.map((e) => ({ before: vramOf(e.w, e.h, 4), after: vramOf(e.w, e.h, bpp(e.mode, e.alpha, c)) })), ...r.kept.filter((e) => e.w).map((e) => ({ before: vramOf(e.w, e.h, 4), kept: true }))]);
  }
  const overTex = (index, limits = {}) => over({ entries: Object.fromEntries(Object.entries(index?.tex || {}).filter(([, e]) => e.out)) }, { maxBytes: 2 * 2 ** 30, maxEntries: 600, ...limits });

  // ---------- GLB (binary glTF) ----------
  const MAGIC = 0x46546c67; const JSON_T = 0x4e4f534a; const BIN_T = 0x004e4942;
  function parseGlb(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.byteLength < 20 || dv.getUint32(0, true) !== MAGIC) throw new Error('not a GLB');
    let off = 12; let json = null; let bin = new Uint8Array(0);
    while (off + 8 <= u8.byteLength) {
      const len = dv.getUint32(off, true); const type = dv.getUint32(off + 4, true);
      const data = u8.subarray(off + 8, off + 8 + len);
      if (type === JSON_T) json = JSON.parse(new TextDecoder().decode(data)); else if (type === BIN_T) bin = data;
      off += 8 + len;
    }
    if (!json) throw new Error('a GLB without its JSON');
    return { json, bin };
  }
  function writeGlb(json, bin) {
    let js = new TextEncoder().encode(JSON.stringify(json));
    const jp = (4 - (js.length % 4)) % 4; if (jp) { const t = new Uint8Array(js.length + jp).fill(0x20); t.set(js); js = t; }
    const bp = (4 - (bin.length % 4)) % 4;
    const total = 12 + 8 + js.length + (bin.length ? 8 + bin.length + bp : 0);
    const u = new Uint8Array(total); const dv = new DataView(u.buffer);
    dv.setUint32(0, MAGIC, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, js.length, true); dv.setUint32(16, JSON_T, true); u.set(js, 20);
    if (bin.length) { const o = 20 + js.length; dv.setUint32(o, bin.length + bp, true); dv.setUint32(o + 4, BIN_T, true); u.set(bin, o + 8); }
    return u;
  }
  // the pictures a GLB holds that can be compressed: [{ index, role, mime, bufferView, name }] (PNG / JPEG in the GLB's
  // own buffer, each used only through a texture's plain source)
  function glbImages(json) {
    const imgs = json.images || []; const texs = json.textures || [];
    const role = new Map();
    const walk = (o, key) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { for (const x of o) walk(x, key); return; }
      if (/Texture$/.test(key || '') && Number.isInteger(o.index)) {
        const t = texs[o.index]; const src = t?.source;
        const r = /normalTexture$/i.test(key) ? 'normal' : /^(baseColorTexture|emissiveTexture|diffuseTexture|sheenColorTexture|specularColorTexture)$/.test(key) ? 'color' : 'data';
        if (Number.isInteger(src)) role.set(src, role.has(src) ? stricter(role.get(src), r) : r);
      }
      for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') walk(v, k);
    };
    for (const m of json.materials || []) walk(m, '');
    const viewUse = new Map(); for (const im of imgs) if (Number.isInteger(im.bufferView)) viewUse.set(im.bufferView, (viewUse.get(im.bufferView) || 0) + 1);
    const out = [];
    imgs.forEach((im, i) => {
      if (!Number.isInteger(im.bufferView) || viewUse.get(im.bufferView) > 1 || !/^image\/(png|jpeg)$/.test(im.mimeType || '')) return;
      if ((json.bufferViews?.[im.bufferView]?.buffer ?? 0) !== 0) return;
      const users = texs.filter((t) => t.source === i);
      if (!users.length || texs.some((t) => t.extensions && Object.values(t.extensions).some((x) => x?.source === i))) return;
      out.push({ index: i, role: role.get(i) || roleOf(im.name || ''), mime: im.mimeType, bufferView: im.bufferView, name: im.name || `image ${i}` });
    });
    return out;
  }
  const viewBytes = (json, bin, v) => { const bv = json.bufferViews[v]; const o = bv.byteOffset || 0; return bin.subarray(o, o + bv.byteLength); };
  // repl: Map(image index → KTX2 bytes) → a new { json, bin }: the buffer rebuilt in order (meshopt ranges kept), the
  // images as image/ktx2, their textures through KHR_texture_basisu (required: the copy needs a KTX2 loader)
  function replaceGlbImages(json0, bin, repl) {
    const json = JSON.parse(JSON.stringify(json0));
    const byView = new Map(); for (const [i, data] of repl) byView.set(json.images[i].bufferView, data);
    const parts = []; let off = 0;
    const place = (u8) => { const o = off; parts.push(u8); const pad = (4 - (u8.length % 4)) % 4; if (pad) parts.push(new Uint8Array(pad)); off += u8.length + pad; return o; };
    for (const [i, bv] of (json.bufferViews || []).entries()) {
      const mo = bv.extensions?.EXT_meshopt_compression || bv.extensions?.KHR_meshopt_compression;
      if ((bv.buffer ?? 0) === 0) { const d = byView.get(i) || bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); bv.byteOffset = place(d); bv.byteLength = d.length; }
      if (mo && (mo.buffer ?? 0) === 0) { const d = bin.subarray(mo.byteOffset || 0, (mo.byteOffset || 0) + mo.byteLength); mo.byteOffset = place(d); }
    }
    const out = new Uint8Array(off); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    if (json.buffers?.[0]) json.buffers[0].byteLength = off;
    for (const i of repl.keys()) json.images[i].mimeType = 'image/ktx2';
    for (const t of json.textures || []) if (repl.has(t.source)) { t.extensions = { ...(t.extensions || {}), KHR_texture_basisu: { source: t.source } }; delete t.source; }
    for (const k of ['extensionsUsed', 'extensionsRequired']) { json[k] = [...new Set([...(json[k] || []), 'KHR_texture_basisu'])]; }
    return { json, bin: out };
  }

  return { TEX_V, canEncode, roleOf, roleOfProp, rolesFromCode, modes, FLOOR, verdict, compare, hasAlpha, caps, bpp, vramOf, report, texKey, checkTex, texMap, texReport, overTex, parseGlb, writeGlb, glbImages, viewBytes, replaceGlbImages };
});
