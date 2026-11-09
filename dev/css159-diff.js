#!/usr/bin/env node
// Before / after screenshots of the key views (round 159, css159: CSS removed must change no pixel).
//   node dev/css159-diff.js shoot <dir> [--app <checkout>] [--coverage <file>]   # dev/css159-tour.js through smoke.js, pictures in <dir>
//   node dev/css159-diff.js compare <dirA> <dirB> [--out <dir>] # per picture: pixels that differ (any channel > 8 / 255)
// Run `shoot` twice on the same build first to see the noise floor (a WebGL preview or a clock can differ by itself);
// --out writes a picture per view that differs, the differing pixels in red over a faded copy. Exit 1 when any view differs
// by more than --max pixels (default 0).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

function decode(file) { // 8-bit RGB / RGBA PNG, not interlaced (what CDP's Page.captureScreenshot writes) → { w, h, px: RGBA }
  const b = fs.readFileSync(file); let o = 8; let w = 0; let h = 0; let ct = 0; const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o); const type = b.toString('ascii', o + 4, o + 8); const data = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12]) throw new Error(`${file}: only 8-bit, non-interlaced PNGs`); }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error(`${file}: colour type ${ct}`); })();
  const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = w * bpp; const cur = Buffer.alloc(stride); const prev = Buffer.alloc(stride);
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0; const up = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = up; else if (f === 3) p = (a + up) >> 1;
      else if (f === 4) { const q = a + up - c; const pa = Math.abs(q - a); const pb = Math.abs(q - up); const pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = (line[i] + p) & 255;
    }
    for (let x = 0; x < w; x++) { px[(y * w + x) * 4] = cur[x * bpp]; px[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; px[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; px[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    cur.copy(prev);
  }
  return { w, h, px };
}
function encode(file, w, h, px) {
  const crcT = Array.from({ length: 256 }, (_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (x) => { let c = 0xffffffff; for (const v of x) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const rows = []; for (let y = 0; y < h; y++) rows.push(Buffer.from([0]), px.subarray(y * w * 4, (y + 1) * w * 4));
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]));
}

if (args[0] === 'shoot') {
  const dir = path.resolve(args[1]); fs.mkdirSync(dir, { recursive: true });
  const extra = [...(opt('--app') ? ['--app', opt('--app')] : []), ...(opt('--coverage') ? ['--coverage', opt('--coverage')] : [])]; // --coverage <file>: the tour's CSS rule usage too
  const r = spawnSync(process.execPath, [path.join(__dirname, 'smoke.js'), '--fake-engines', '--check-timeout', '1800000', ...extra, '--eval', `window.CSS159_SHOTS = ${JSON.stringify(dir)}`, '--script', path.join(__dirname, 'css159-tour.js'), '--shot', path.join(dir, '99-final.png')], { encoding: 'utf8', maxBuffer: 1 << 30 });
  const log = `${r.stdout || ''}${r.stderr || ''}`;
  fs.writeFileSync(path.join(dir, 'tour.log'), log);
  const res = log.split('\n').find((l) => l.startsWith('{"shots"'));
  if (res) { fs.writeFileSync(path.join(dir, 'styles.json'), res); const o = JSON.parse(res); console.log(`tour: ${o.shots.length} views, errors: ${o.errors.join(' · ') || 'none'}`); } else console.log(log.slice(-3000));
  console.log(`${fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length} pictures in ${dir}`);
  process.exit(r.status || 0);
} else if (args[0] === 'compare') {
  const [a, b] = [args[1], args[2]]; const outDir = opt('--out'); const max = Number(opt('--max', 0));
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  let bad = 0;
  const names = [...new Set([...fs.readdirSync(a), ...fs.readdirSync(b)])].filter((f) => f.endsWith('.png')).sort();
  for (const n of names) {
    if (!fs.existsSync(path.join(a, n)) || !fs.existsSync(path.join(b, n))) { console.log(`  missing in one run   ${n}`); bad++; continue; }
    const A = decode(path.join(a, n)); const B = decode(path.join(b, n));
    if (A.w !== B.w || A.h !== B.h) { console.log(`  size ${A.w}×${A.h} ≠ ${B.w}×${B.h}   ${n}`); bad++; continue; }
    let diff = 0; let box = null; const vis = outDir ? Buffer.alloc(A.px.length) : null;
    for (let i = 0; i < A.px.length; i += 4) {
      const d = Math.max(Math.abs(A.px[i] - B.px[i]), Math.abs(A.px[i + 1] - B.px[i + 1]), Math.abs(A.px[i + 2] - B.px[i + 2]));
      if (vis) { if (d > 8) { vis[i] = 255; vis[i + 1] = 0; vis[i + 2] = 0; } else { vis[i] = vis[i + 1] = vis[i + 2] = 128 + (A.px[i + 1] >> 2); } vis[i + 3] = 255; }
      if (d > 8) { diff++; const p = i / 4; const x = p % A.w; const y = (p - x) / A.w; box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y]; }
    }
    if (diff > max) bad++;
    if (diff && vis) encode(path.join(outDir, n), A.w, A.h, vis);
    console.log(`  ${String(diff).padStart(8)} px${box ? ` in ${box[0]},${box[1]}–${box[2]},${box[3]}` : ''}   ${n}`);
  }
  console.log(bad ? `${bad} of ${names.length} views differ` : `all ${names.length} views identical`);
  // computed styles (every element, its ::before / ::after) per view
  const rd = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'styles.json'), 'utf8')).styles || {}; } catch { return null; } };
  const SA = rd(a); const SB = rd(b);
  if (SA && SB) {
    let sbad = 0;
    for (const n of [...new Set([...Object.keys(SA), ...Object.keys(SB)])].sort()) {
      const x = SA[n]; const y = SB[n];
      if (!x || !y) { console.log(`  styles: missing in one run   ${n}`); sbad++; continue; }
      if (x.tags.join('|') !== y.tags.join('|')) { console.log(`  styles: the page differs (${x.tags.length} / ${y.tags.length} elements)   ${n}`); sbad++; continue; }
      const off = x.hs.map((h, i) => (h !== y.hs[i] ? x.tags[i] : null)).filter(Boolean);
      if (off.length) sbad++;
      console.log(`  styles: ${String(off.length).padStart(5)} of ${x.hs.length} elements differ   ${n}${off.length ? `  (${[...new Set(off)].slice(0, 6).join(', ')})` : ''}`);
    }
    console.log(sbad ? `styles: ${sbad} views differ` : 'styles: every element identical in every view');
    if (sbad) bad += sbad;
  }
  process.exit(bad ? 1 : 0);
} else {
  console.log('usage: node dev/css159-diff.js shoot <dir> [--app <checkout>] | compare <dirA> <dirB> [--out <dir>] [--max <px>]');
}
