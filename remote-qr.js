// A small QR code maker (round 24, remote): the phone remote's address as a QR code on the computer, no library.
// Byte mode, error correction M (L for long text), versions 1–10 (up to 213 bytes: any LAN address fits in 2–3).
// RemoteQR.matrix(text, { mask }) → rows of booleans (true = dark); RemoteQR.svg(text) → an <svg> string with a quiet zone.
// Follows the standard (ISO 18004); checked module for module against a reference encoder (dev/remote-qr-test.js).
const RemoteQR = (() => {
  // per version 1–10: error correction codewords per block, and blocks [L, M]
  const ECC = { L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18], M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26] };
  const BLOCKS = { L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4], M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5] };
  const FORMAT = { L: 1, M: 0 };
  const rawModules = (v) => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const dataCodewords = (v, ec) => Math.floor(rawModules(v) / 8) - ECC[ec][v] * BLOCKS[ec][v];
  // Reed–Solomon over GF(256), polynomial 0x11D
  function mul(x, y) { let z = 0; for (let i = 7; i >= 0; i -= 1) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
  function divisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i += 1) { for (let j = 0; j < deg; j += 1) { r[j] = mul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = mul(root, 2); }
    return r;
  }
  function remainder(data, div) {
    const r = new Array(div.length).fill(0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); }
    return r;
  }
  const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? [...new TextEncoder().encode(s)] : [...Buffer.from(s, 'utf8')]);

  function matrix(text, { mask = null, ec: ecWant = null } = {}) {
    const bytes = utf8(String(text));
    let ec = ecWant || 'M'; let v = 1;
    const fits = (vv, e) => 4 + (vv < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(vv, e) * 8;
    while (v <= 10 && !fits(v, ec)) v += 1;
    if (v > 10 && !ecWant) { ec = 'L'; v = 1; while (v <= 10 && !fits(v, ec)) v += 1; }
    if (v > 10) throw new Error('Too long for a QR code here');
    // the bits: byte mode, count, data, terminator, pad
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
    const cap = dataCodewords(v, ec) * 8;
    put(0, Math.min(4, cap - bits.length)); put(0, (8 - (bits.length % 8)) % 8);
    for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) put(p, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    // blocks + error correction, interleaved
    const nb = BLOCKS[ec][v]; const el = ECC[ec][v]; const raw = Math.floor(rawModules(v) / 8);
    const nShort = nb - (raw % nb); const shortLen = Math.floor(raw / nb); const div = divisor(el);
    const blocks = []; let k = 0;
    for (let i = 0; i < nb; i += 1) {
      const d = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += d.length;
      const e = remainder(d, div); if (i < nShort) d.push(0); blocks.push(d.concat(e));
    }
    const words = [];
    for (let i = 0; i < blocks[0].length; i += 1) for (let j = 0; j < nb; j += 1) if (i !== shortLen - el || j >= nShort) words.push(blocks[j][i]);
    // the grid
    const size = v * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx; const y = cy + dy; const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
    if (v > 1) {
      const n = Math.floor(v / 7) + 2; const step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
      const pos = [6]; for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
      for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    const drawFormat = (m) => {
      const d = (FORMAT[ec] << 3) | m; let r = d;
      for (let i = 0; i < 10; i += 1) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412; const bit = (i) => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (v >= 7) {
      let r = v; for (let i = 0; i < 12; i += 1) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      const b = (v << 12) | r;
      for (let i = 0; i < 18; i += 1) { const dark = ((b >>> i) & 1) !== 0; const a = size - 11 + (i % 3); const c = Math.floor(i / 3); set(a, c, dark); set(c, a, dark); }
    }
    // the codewords, zig-zag from the bottom right
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert += 1) for (let j = 0; j < 2; j += 1) {
        const x = right - j; const up = ((right + 1) & 2) === 0; const y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < words.length * 8) { mod[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i += 1; }
      }
    }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
    const applyMask = (m) => { for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    // the mask with the lowest penalty (runs, 2×2 blocks, finder-like patterns, balance)
    const penalty = () => {
      let p = 0; let dark = 0;
      for (let pass = 0; pass < 2; pass += 1) {
        for (let a = 0; a < size; a += 1) {
          let run = 1; let line = '';
          for (let b = 0; b < size; b += 1) {
            const c = pass ? mod[b][a] : mod[a][b]; line += c ? '1' : '0';
            if (b > 0 && c === (pass ? mod[b - 1][a] : mod[a][b - 1])) { run += 1; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1;
          }
          p += 40 * ((line.match(/(?=10111010000|00001011101)/g) || []).length);
        }
      }
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        if (mod[y][x]) dark += 1;
        if (x < size - 1 && y < size - 1 && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
      }
      return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    };
    let best = mask;
    if (best == null) {
      let low = Infinity;
      for (let m = 0; m < 8; m += 1) { applyMask(m); drawFormat(m); const s = penalty(); if (s < low) { low = s; best = m; } applyMask(m); }
    }
    applyMask(best); drawFormat(best);
    return Object.assign(mod, { version: v, ec, mask: best });
  }
  // an SVG (one path, crisp edges, 4-module quiet zone), dark on light whatever the theme
  function svg(text, { px = 6 } = {}) {
    const m = matrix(text); const n = m.length + 8;
    let d = '';
    m.forEach((row, y) => { let x = 0; while (x < row.length) { if (!row[x]) { x += 1; continue; } let w = 0; while (row[x + w]) w += 1; d += `M${x + 4} ${y + 4}h${w}v1h-${w}z`; x += w; } });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * px}" height="${n * px}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  return { matrix, svg };
})();
if (typeof module !== 'undefined') module.exports = RemoteQR;
else window.RemoteQR = RemoteQR;
