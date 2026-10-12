// The asset library's thumbnails, off the window's thread (round 24, assets stream): `new Worker('assets-thumb-worker.js')`
// from assets.js. No sharp, no native code: pictures are decoded with createImageBitmap and drawn on an OffscreenCanvas,
// encoded as small WebP files (assetsmain.js caches them on disk by content hash, so each is made once).
//   image  any picture the browser decodes (PNG, JPEG, WebP, GIF, BMP, AVIF): fitted into 256×256
//   hdr    a Radiance .hdr decoded here (flat and RLE scanlines), exposed by its own brightness, tone-mapped
//   glb    a GLB's own embedded picture (its base color texture), plus its triangle / mesh / clip counts
//   font   the font loaded here (FontFace) and its real family name read from its name table, drawn as "Aa" + a line
//   wav    PCM read here → a waveform; peaks: a waveform from peaks the window decoded (MP3, M4A, OGG…)
//   lut    a .cube LUT shown on a color sweep: the plain sweep on top, graded below
// In: { id, kind, bytes: ArrayBuffer, text, peaks, name } · Out: { id, ok, webp: ArrayBuffer, info } | { id, ok: false, error }
const S = 256;
const BG = '#14161b';

async function encode(cv) { const b = await cv.convertToBlob({ type: 'image/webp', quality: 0.82 }); return b.arrayBuffer(); }
function canvas(w = S, h = S) { const cv = new OffscreenCanvas(w, h); const g = cv.getContext('2d'); return { cv, g }; }
// a picture fitted (cover) into the square
function cover(src, w, h) {
  const { cv, g } = canvas();
  g.fillStyle = BG; g.fillRect(0, 0, S, S);
  const k = Math.max(S / w, S / h); const dw = w * k; const dh = h * k;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, (S - dw) / 2, (S - dh) / 2, dw, dh);
  return cv;
}

async function image(bytes, mime) {
  const bmp = await createImageBitmap(new Blob([bytes], mime ? { type: mime } : {}), { resizeQuality: 'medium' });
  try { return { cv: cover(bmp, bmp.width, bmp.height), info: { w: bmp.width, h: bmp.height } }; } finally { bmp.close?.(); }
}

// ---------- Radiance .hdr ----------
function hdr(buf) {
  const b = new Uint8Array(buf);
  let p = 0; let line = '';
  const readLine = () => { line = ''; while (p < b.length && b[p] !== 10) line += String.fromCharCode(b[p++]); p += 1; return line; };
  if (!/^#\?(RADIANCE|RGBE)/.test(readLine())) throw new Error('not a Radiance file');
  while (p < b.length && readLine() !== '') { /* header lines up to the blank one */ }
  const m = /-Y\s+(\d+)\s+\+X\s+(\d+)/.exec(readLine());
  if (!m) throw new Error('no resolution line');
  const H = Number(m[1]); const W = Number(m[2]);
  const step = Math.max(1, Math.ceil(Math.max(W, H) / S)); // keep every step-th pixel / row
  const ow = Math.ceil(W / step); const oh = Math.ceil(H / step);
  const lum = new Float32Array(ow * oh * 3);
  const row = new Uint8Array(W * 4);
  for (let y = 0; y < H; y += 1) {
    // new-style RLE: 2 2 hi lo, then 4 channel runs
    if (W >= 8 && W < 32768 && b[p] === 2 && b[p + 1] === 2 && ((b[p + 2] << 8) | b[p + 3]) === W) {
      p += 4;
      for (let c = 0; c < 4; c += 1) {
        let x = 0;
        while (x < W && p < b.length) {
          let n = b[p++];
          if (n > 128) { n -= 128; const v = b[p++]; for (let k = 0; k < n && x < W; k += 1) row[(x++) * 4 + c] = v; } else for (let k = 0; k < n && x < W; k += 1) row[(x++) * 4 + c] = b[p++];
        }
      }
    } else { row.set(b.subarray(p, p + W * 4)); p += W * 4; }
    if (y % step) continue;
    const oy = y / step;
    for (let x = 0; x < W; x += step) {
      const e = row[x * 4 + 3]; const f = e ? 2 ** (e - 136) : 0; const o = (oy * ow + x / step) * 3;
      lum[o] = row[x * 4] * f; lum[o + 1] = row[x * 4 + 1] * f; lum[o + 2] = row[x * 4 + 2] * f;
    }
  }
  // exposure from the log-average brightness, then Reinhard and gamma
  let s = 0; const n = ow * oh;
  for (let i = 0; i < n; i += 1) s += Math.log(1e-4 + 0.2126 * lum[i * 3] + 0.7152 * lum[i * 3 + 1] + 0.0722 * lum[i * 3 + 2]);
  const key = 0.22 / Math.exp(s / n);
  const img = new ImageData(ow, oh);
  for (let i = 0; i < n; i += 1) for (let c = 0; c < 3; c += 1) { const v = lum[i * 3 + c] * key; img.data[i * 4 + c] = Math.min(255, Math.round(255 * (v / (1 + v)) ** (1 / 2.2))); }
  for (let i = 0; i < n; i += 1) img.data[i * 4 + 3] = 255;
  const tmp = new OffscreenCanvas(ow, oh); tmp.getContext('2d').putImageData(img, 0, 0);
  return { cv: cover(tmp, ow, oh), info: { w: W, h: H } };
}

// ---------- GLB: its own picture and counts ----------
async function glb(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  let binAt = 20 + jl; let bin = null;
  if (binAt + 8 <= buf.byteLength && dv.getUint32(binAt + 4, true) === 0x004e4942) bin = new Uint8Array(buf, binAt + 8, dv.getUint32(binAt, true));
  let tris = 0;
  for (const m of json.meshes || []) for (const pr of m.primitives || []) { const a = json.accessors?.[pr.indices ?? pr.attributes?.POSITION]; if (a) tris += Math.round(a.count / 3); }
  const info = { meshes: (json.meshes || []).length, tris, clips: (json.animations || []).map((a, i) => a.name || `clip ${i + 1}`).slice(0, 12) };
  // the base color texture of the first material that has one, else the first embedded picture
  const texIdx = (json.materials || []).map((m) => m.pbrMetallicRoughness?.baseColorTexture?.index).find((i) => i != null);
  const imgIdx = texIdx != null ? json.textures?.[texIdx]?.source : 0;
  const im = json.images?.[imgIdx ?? 0] || (json.images || []).find((x) => x.bufferView != null);
  if (!im || im.bufferView == null || !bin) return { cv: null, info };
  const v = json.bufferViews[im.bufferView];
  const bytes = bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const r = await image(bytes, im.mimeType);
  return { cv: r.cv, info };
}

// ---------- fonts ----------
function fontName(buf) {
  try {
    const dv = new DataView(buf);
    const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    if (tag(0) === 'wOFF' || tag(0) === 'wOF2') return null; // compressed tables: the file's name does
    const n = dv.getUint16(4);
    for (let i = 0; i < n; i += 1) {
      const r = 12 + i * 16;
      if (tag(r) !== 'name') continue;
      const off = dv.getUint32(r + 8); const count = dv.getUint16(off + 2); const strs = off + dv.getUint16(off + 4);
      const found = {};
      for (let k = 0; k < count; k += 1) {
        const e = off + 6 + k * 12; const plat = dv.getUint16(e); const id = dv.getUint16(e + 6); const len = dv.getUint16(e + 8); const at = strs + dv.getUint16(e + 10);
        if (![1, 4, 16].includes(id) || found[`${id}`]) continue;
        let s = '';
        if (plat === 3 || plat === 0) for (let j = 0; j < len; j += 2) s += String.fromCharCode(dv.getUint16(at + j));
        else for (let j = 0; j < len; j += 1) s += String.fromCharCode(dv.getUint8(at + j));
        if (s.trim()) found[`${id}`] = s.trim();
      }
      return found['4'] || found['16'] || found['1'] || null;
    }
  } catch { /* not a plain sfnt */ }
  return null;
}
let fontN = 0;
async function font(buf) {
  const family = `hearth-asset-${++fontN}`;
  const face = new FontFace(family, buf);
  await face.load();
  self.fonts.add(face);
  const { cv, g } = canvas();
  g.fillStyle = BG; g.fillRect(0, 0, S, S);
  g.fillStyle = '#f2ece4'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `120px "${family}"`; g.fillText('Aa', S / 2, S * 0.42);
  g.fillStyle = '#b8b1a8'; g.font = `26px "${family}"`; g.fillText('Hearth 0123', S / 2, S * 0.8);
  self.fonts.delete(face);
  return { cv, info: { family: fontName(buf) } };
}

// ---------- sounds ----------
function wavPeaks(buf, n = 200) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'RIFF') throw new Error('not a WAV');
  let p = 12; let fmt = null; let data = null;
  while (p + 8 <= buf.byteLength) {
    const id = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3)); const len = dv.getUint32(p + 4, true);
    if (id === 'fmt ') fmt = { tag: dv.getUint16(p + 8, true), ch: dv.getUint16(p + 10, true), rate: dv.getUint32(p + 12, true), bits: dv.getUint16(p + 22, true) };
    if (id === 'data') { data = { at: p + 8, len: Math.min(len, buf.byteLength - p - 8) }; break; }
    p += 8 + len + (len % 2);
  }
  if (!fmt || !data) throw new Error('no audio in this WAV');
  const bps = fmt.bits / 8; const frame = bps * fmt.ch; const frames = Math.floor(data.len / frame);
  const read = fmt.tag === 3 && fmt.bits === 32 ? (o) => dv.getFloat32(o, true) : fmt.bits === 16 ? (o) => dv.getInt16(o, true) / 32768 : fmt.bits === 24 ? (o) => ((dv.getUint8(o + 2) << 24 | dv.getUint8(o + 1) << 16 | dv.getUint8(o) << 8) >> 8) / 8388608 : fmt.bits === 32 ? (o) => dv.getInt32(o, true) / 2147483648 : (o) => (dv.getUint8(o) - 128) / 128;
  const peaks = new Float32Array(n);
  const per = Math.max(1, Math.floor(frames / n)); const stride = Math.max(1, Math.floor(per / 64)); // ≤ 64 reads per bar
  for (let i = 0; i < n; i += 1) { let m = 0; for (let f = i * per; f < Math.min(frames, (i + 1) * per); f += stride) { const v = Math.abs(read(data.at + f * frame)); if (v > m) m = v; } peaks[i] = m; }
  return { peaks, info: { dur: +(frames / fmt.rate).toFixed(2), rate: fmt.rate, ch: fmt.ch } };
}
function wave(peaks) {
  const { cv, g } = canvas();
  g.fillStyle = BG; g.fillRect(0, 0, S, S);
  let top = 0; for (const v of peaks) if (v > top) top = v;
  const k = top > 0 ? 0.9 / top : 1; const n = peaks.length; const w = S / n;
  const grad = g.createLinearGradient(0, 0, S, 0); grad.addColorStop(0, '#ff8a3d'); grad.addColorStop(1, '#ffd75e');
  g.fillStyle = grad;
  for (let i = 0; i < n; i += 1) { const h = Math.max(1, peaks[i] * k * S * 0.42); g.fillRect(i * w, S / 2 - h, Math.max(1, w - 0.4), h * 2); }
  return cv;
}

// ---------- LUTs ----------
function lut(text) {
  let n = 0; const d = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim(); let m;
    if (!l || l.startsWith('#') || /^(TITLE|DOMAIN_|LUT_1D)/i.test(l)) continue;
    if ((m = /^LUT_3D_SIZE\s+(\d+)/i.exec(l))) n = Number(m[1]);
    else if (/^[-\d.eE+]+\s+[-\d.eE+]+\s+[-\d.eE+]+$/.test(l)) for (const v of l.split(/\s+/)) d.push(Number(v));
  }
  if (!n || d.length < n * n * n * 3) throw new Error('not a 3D .cube LUT');
  const q = (v) => Math.max(0, Math.min(n - 1, Math.round(v * (n - 1))));
  const img = new ImageData(S, S);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      // a hue sweep across, light to dark down; the top third plain, the rest through the LUT
      const hue = x / S * 6; const top = y < S / 3; const val = 1 - (top ? y / (S / 3) : (y - S / 3) / (S * 2 / 3)) * 0.85; const sat = 0.75;
      const c = val * sat; const xx = c * (1 - Math.abs((hue % 2) - 1)); const m0 = val - c;
      let [r, gg, b] = hue < 1 ? [c, xx, 0] : hue < 2 ? [xx, c, 0] : hue < 3 ? [0, c, xx] : hue < 4 ? [0, xx, c] : hue < 5 ? [xx, 0, c] : [c, 0, xx];
      r += m0; gg += m0; b += m0;
      if (!top) { const i = (q(r) + q(gg) * n + q(b) * n * n) * 3; r = d[i]; gg = d[i + 1]; b = d[i + 2]; }
      const o = (y * S + x) * 4;
      img.data[o] = Math.round(Math.max(0, Math.min(1, r)) * 255); img.data[o + 1] = Math.round(Math.max(0, Math.min(1, gg)) * 255); img.data[o + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255); img.data[o + 3] = 255;
    }
  }
  const { cv, g } = canvas(); g.putImageData(img, 0, 0);
  g.fillStyle = '#0008'; g.fillRect(0, S / 3 - 1, S, 2);
  return { cv, info: { size: n } };
}

self.onmessage = async (e) => {
  const { id, kind, bytes, text, peaks, mime } = e.data || {};
  try {
    let r;
    if (kind === 'image') r = await image(bytes, mime);
    else if (kind === 'hdr') r = hdr(bytes);
    else if (kind === 'glb') r = await glb(bytes);
    else if (kind === 'font') r = await font(bytes);
    else if (kind === 'wav') { const w = wavPeaks(bytes); r = { cv: wave(w.peaks), info: w.info }; }
    else if (kind === 'peaks') r = { cv: wave(peaks), info: {} };
    else if (kind === 'lut') r = lut(text);
    else throw new Error(`no thumbnail for ${kind}`);
    const webp = r.cv ? await encode(r.cv) : null;
    self.postMessage({ id, ok: true, webp, info: r.info || {} }, webp ? [webp] : []);
  } catch (err) { self.postMessage({ id, ok: false, error: String(err?.message || err) }); }
};
