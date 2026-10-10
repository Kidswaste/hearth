// A WebM written live by a browser's MediaRecorder has no Duration in its header (the length isn't known while it
// records), so players show "--:--" and scrub badly. This writes the Duration (pack11): pure JS on the first bytes of
// the file, no ffmpeg needed. Used by the editor's real-time WebM export (tools/video-comp.js → VideoPack) and by
// capture's recordings when ffmpeg isn't installed (capturemain.js). Loads in the page and in Node.
//   WebmDuration.fix(bytes, ms)   → new Uint8Array (or the same bytes when there is nothing to do / not a WebM)
//   WebmDuration.read(bytes)      → the Duration in ms (null when the header has none)
//   WebmDuration.fixFile(path, ms) (Node) → true when it was written (streams the rest of the file)
const WebmDuration = (() => {
  const ID = { EBML: 0x1a45dfa3, Segment: 0x18538067, Info: 0x1549a966, Duration: 0x4489, Scale: 0x2ad7b1, SeekHead: 0x114d9b74, Cluster: 0x1f43b675, Void: 0xec };
  // an element ID (its marker bits kept) at pos
  function readId(b, pos) {
    const first = b[pos]; if (first == null) return null;
    let len = 1; while (len <= 4 && !(first & (0x80 >> (len - 1)))) len += 1;
    if (len > 4 || pos + len > b.length) return null;
    let id = 0; for (let i = 0; i < len; i += 1) id = id * 256 + b[pos + i];
    return { id, len };
  }
  // a size (marker bit removed); unknown = all ones
  function readSize(b, pos) {
    const first = b[pos]; if (first == null) return null;
    let len = 1; while (len <= 8 && !(first & (0x80 >> (len - 1)))) len += 1;
    if (len > 8 || pos + len > b.length) return null;
    let v = first & (0xff >> len); let ones = v === (0xff >> len);
    for (let i = 1; i < len; i += 1) { v = v * 256 + b[pos + i]; if (b[pos + i] !== 0xff) ones = false; }
    return { size: v, len, unknown: ones };
  }
  function sizeBytes(v, len) {
    const out = new Uint8Array(len);
    let x = v;
    for (let i = len - 1; i >= 0; i -= 1) { out[i] = x % 256; x = Math.floor(x / 256); }
    out[0] |= 0x80 >> (len - 1);
    return out;
  }
  const fits = (v, len) => v < 2 ** (7 * len) - 1;
  function float64(v) { const out = new Uint8Array(8); new DataView(out.buffer).setFloat64(0, v); return out; }
  function readNum(b, pos, n) { if (n === 4) return new DataView(b.buffer, b.byteOffset + pos, 4).getFloat32(0); if (n === 8) return new DataView(b.buffer, b.byteOffset + pos, 8).getFloat64(0); return null; }
  function readUint(b, pos, n) { let v = 0; for (let i = 0; i < n; i += 1) v = v * 256 + b[pos + i]; return v; }

  // where the Info element is, and what's in it
  function locate(b) {
    let p = 0;
    const h = readId(b, p); if (!h || h.id !== ID.EBML) return null;
    const hs = readSize(b, p + h.len); if (!hs) return null;
    p += h.len + hs.len + hs.size;
    const s = readId(b, p); if (!s || s.id !== ID.Segment) return null;
    const ss = readSize(b, p + s.len); if (!ss) return null;
    let q = p + s.len + ss.len;
    const segEnd = ss.unknown ? b.length : Math.min(b.length, q + ss.size);
    let seekHead = false;
    while (q < segEnd) {
      const e = readId(b, q); if (!e) return null;
      const es = readSize(b, q + e.len); if (!es) return null;
      if (e.id === ID.SeekHead) seekHead = true;
      if (e.id === ID.Cluster) return null; // no Info before the first cluster
      if (e.id === ID.Info) {
        const body = q + e.len + es.len; const end = body + es.size;
        if (es.unknown || end > b.length) return null;
        let scale = 1000000; let dur = null; let r = body;
        while (r < end) {
          const c = readId(b, r); if (!c) break; const cs = readSize(b, r + c.len); if (!cs) break;
          const v = r + c.len + cs.len;
          if (c.id === ID.Scale) scale = readUint(b, v, cs.size) || scale;
          if (c.id === ID.Duration) dur = { pos: r, at: v, n: cs.size, value: readNum(b, v, cs.size) };
          r = v + cs.size;
        }
        return { segSizeUnknown: ss.unknown, seekHead, info: { pos: q, idLen: e.len, sizeLen: es.len, size: es.size, body, end }, scale, dur };
      }
      q += e.len + es.len + es.size;
    }
    return null;
  }
  function read(b) { const L = locate(b); if (!L?.dur || L.dur.value == null) return null; return (L.dur.value * L.scale) / 1e6; }

  // The header with its Duration set: { head (new bytes for [0, cut)), cut } or null when nothing can / needs to be done.
  function patch(b, ms) {
    if (!(ms > 0)) return null;
    const L = locate(b);
    if (!L) return null;
    const value = (ms * 1e6) / L.scale;
    if (L.dur) {
      if (L.dur.value > 0 && Math.abs(L.dur.value - value) / value < 1e-3) return null; // already right
      if (L.dur.n !== 4 && L.dur.n !== 8) return null;
      const head = b.slice(0, L.dur.at + L.dur.n);
      if (L.dur.n === 8) head.set(float64(value), L.dur.at); else new DataView(head.buffer, L.dur.at, 4).setFloat32(0, value);
      return { head, cut: L.dur.at + L.dur.n };
    }
    // insert one Duration element (11 bytes) at the end of Info: positions after it move, so a file with a seek
    // index (SeekHead) or a known Segment size is left alone (a browser's live WebM has neither)
    if (L.seekHead || !L.segSizeUnknown) return null;
    const el = new Uint8Array([0x44, 0x89, 0x88, ...float64(value)]);
    const newSize = L.info.size + el.length;
    const sizeLen = fits(newSize, L.info.sizeLen) ? L.info.sizeLen : Math.min(8, L.info.sizeLen + 1);
    const pre = b.slice(0, L.info.pos + L.info.idLen);
    const sz = sizeBytes(newSize, sizeLen);
    const body = b.slice(L.info.body, L.info.end);
    const head = new Uint8Array(pre.length + sz.length + body.length + el.length);
    head.set(pre, 0); head.set(sz, pre.length); head.set(body, pre.length + sz.length); head.set(el, pre.length + sz.length + body.length);
    return { head, cut: L.info.end };
  }
  function fix(bytes, ms) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const p = patch(b, ms);
    if (!p) return b;
    const out = new Uint8Array(p.head.length + (b.length - p.cut));
    out.set(p.head, 0); out.set(b.subarray(p.cut), p.head.length);
    return out;
  }
  // Node: patch a file on disk (reads its first 1 MB, then streams the rest into a temp file and renames it)
  async function fixFile(file, ms) {
    const fs = require('fs');
    const fd = fs.openSync(file, 'r');
    let head;
    try { const n = Math.min(fs.fstatSync(fd).size, 1 << 20); head = Buffer.alloc(n); fs.readSync(fd, head, 0, n, 0); } finally { fs.closeSync(fd); }
    const p = patch(new Uint8Array(head.buffer, head.byteOffset, head.length), ms);
    if (!p) return false;
    const tmp = `${file}.dur-tmp`;
    await new Promise((res, rej) => {
      const out = fs.createWriteStream(tmp);
      out.on('error', rej);
      out.write(Buffer.from(p.head));
      const rest = fs.createReadStream(file, { start: p.cut });
      rest.on('error', rej);
      rest.pipe(out);
      out.on('finish', res);
    });
    fs.renameSync(tmp, file);
    return true;
  }
  return { fix, read, patch, fixFile, _: { readId, readSize, sizeBytes, locate } };
})();
if (typeof module !== 'undefined') module.exports = WebmDuration;
