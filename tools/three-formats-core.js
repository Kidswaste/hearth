// All formats (round 33, multiformat), the model: no DOM (tools/three-formats.js draws it; dev/multiformat-test.js
// checks it in Node). The owner posts the same Lab scene to several apps ("Always give a 9:16 version too"): one
// export makes each picked shape (16:9, 9:16, 1:1, 4:5), each with its own reframe so the subject stays in frame.
//   FORMATS            the four shapes, their full size and what they're for
//   sizeOf(id, long)   the export size (long = a smaller long side, for tests and drafts; always even)
//   OVER               the preview's overscan: each format's preview is drawn zoomed out OVER×, so any nudge (pan /
//                      zoom) is a crop of that one picture, shown at once, without drawing again
//   view(n)            a nudge { z, x, y } → the crop of the overscan picture (fractions) it shows
//   clamp(n)           a nudge kept inside the overscan (z 1 / OVER … 3)
//   safeBox(id, zones) where the subject should sit in that frame: clear of the apps' buttons (publishkit's zones on
//                      9:16 / 1:1 / 16:9 when given) with a small margin
//   subjectBox(px, w, h)  where the subject is in a picture (RGBA): what differs from the background (the border's
//                      median colour), its 4 %–96 % extent, in the picture's fractions; null on an empty picture
//   autoFrame(box, id) the nudge that keeps that subject inside the safe box: nothing moves when it's already in;
//                      zooms out only as much as needed (never past the overscan); a subject filling everything keeps
//                      the scene's own framing
//   toPage(n)          the nudge as the export page's reframe message (y up there)
//   stem / folder      clear names: "<scene> 9x16 1080x1920", "<scene> · all formats 2026-10-13 21h05"
// Units: a nudge's x / y are the view's centre in the format's own frame (-1…1 = its edges, y down), z its zoom
// (1 = the scene's own framing at that shape, 0.5 = twice as much around it).
const FormatsCore = (() => {
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const FORMATS = [
    { id: '16:9', w: 1920, h: 1080, name: '16:9', for: 'YouTube, screens', plat: 'youtube' },
    { id: '9:16', w: 1080, h: 1920, name: '9:16', for: 'Shorts, TikTok, Reels', plat: 'shorts' },
    { id: '1:1', w: 1080, h: 1080, name: '1:1', for: 'Instagram feed', plat: 'square' },
    { id: '4:5', w: 1080, h: 1350, name: '4:5', for: 'Instagram portrait', plat: null },
  ];
  const get = (id) => FORMATS.find((f) => f.id === String(id || '').replace(/x/i, ':')) || null;
  const OVER = 2.5;
  const Z_MIN = 1 / OVER; const Z_MAX = 3;
  // the shape closest to w × h (the Lab's frame → its own format)
  function nearest(w, h) {
    const r = w / h; let best = FORMATS[0]; let bd = Infinity;
    for (const f of FORMATS) { const d = Math.abs(Math.log((f.w / f.h) / r)); if (d < bd) { bd = d; best = f; } }
    return best.id;
  }
  // the size to export; long: the long side wanted (smaller files), kept even for the codecs
  function sizeOf(id, long = 0) {
    const f = get(id); if (!f) return null;
    if (!long) return { w: f.w, h: f.h };
    const k = long / Math.max(f.w, f.h);
    const ev = (v) => Math.max(16, Math.round((v * k) / 2) * 2);
    return { w: ev(f.w), h: ev(f.h) };
  }
  // the picks: the remembered ones, else the Lab's own shape + 9:16 ("Always give a 9:16 version too")
  function defaults(frameId, saved) {
    const ok = (Array.isArray(saved) ? saved : []).filter((id) => get(id));
    if (ok.length) return FORMATS.map((f) => f.id).filter((id) => ok.includes(id));
    const set = new Set([get(frameId)?.id || '16:9', '9:16']);
    return FORMATS.map((f) => f.id).filter((id) => set.has(id));
  }

  // ---------- the nudge ----------
  function clamp(n = {}) {
    const z = clampN(Number(n.z) || 1, Z_MIN, Z_MAX);
    const lim = Math.max(0, OVER - 1 / z); // the view's half-size is 1/z of the frame; the overscan reaches ±OVER
    return { z: r4(z), x: r4(clampN(Number(n.x) || 0, -lim, lim)), y: r4(clampN(Number(n.y) || 0, -lim, lim)) };
  }
  const isPlain = (n) => !n || (Math.abs((n.z ?? 1) - 1) < 1e-3 && Math.abs(n.x || 0) < 1e-3 && Math.abs(n.y || 0) < 1e-3);
  // the crop of the overscan picture a nudge shows: { left, top, width, height } as fractions of it
  function view(n) {
    const v = clamp(n);
    const half = 1 / v.z / OVER / 2; // half the view, as a fraction of the overscan picture
    const cx = 0.5 + v.x / OVER / 2; const cy = 0.5 + v.y / OVER / 2;
    return { left: r4(cx - half), top: r4(cy - half), width: r4(half * 2), height: r4(half * 2) };
  }
  const toPage = (n) => { const v = clamp(n); return { z: v.z, x: v.x, y: -v.y, on: !isPlain(v) }; };

  // ---------- where the subject should sit ----------
  // zones: [{ x, y, w, h }] fractions of the frame (publishkit's platform zones): the box keeps clear of the edge ones
  function safeBox(id, zones = null) {
    const m = 0.04;
    const b = { x0: m, y0: m, x1: 1 - m, y1: 1 - m };
    for (const z of zones || []) {
      if (z.w >= 0.95 && z.y <= 0.01) b.y0 = Math.max(b.y0, z.y + z.h + 0.01); // a bar across the top
      else if (z.w >= 0.8 && z.y + z.h >= 0.99) b.y1 = Math.min(b.y1, z.y - 0.01); // across the bottom
      else if (z.x + z.w >= 0.99 && z.w < 0.3 && z.h >= 0.3) b.x1 = Math.min(b.x1, z.x - 0.01); // a column on the right (a small corner stamp doesn't count)
    }
    if (!zones && id === '9:16') Object.assign(b, { y0: 0.1, y1: 0.78, x1: 0.84 }); // (the vertical apps, about)
    return { x0: r4(b.x0), y0: r4(b.y0), x1: r4(b.x1), y1: r4(b.y1) };
  }

  // ---------- where the subject is ----------
  // px: RGBA bytes of a picture w × h (small: ≤ 160 a side is plenty). Returns { x0, y0, x1, y1, fill, weight } in the
  // picture's fractions (fill: how much of the picture differs from the background), or null when nothing does.
  function subjectBox(px, w, h, { thresh = 28 } = {}) {
    if (!px || !w || !h) return null;
    const border = [];
    const at = (x, y) => (y * w + x) * 4;
    for (let x = 0; x < w; x += 1) { border.push(at(x, 0), at(x, h - 1)); }
    for (let y = 1; y < h - 1; y += 1) { border.push(at(0, y), at(w - 1, y)); }
    const med = [0, 1, 2].map((c) => { const v = border.map((i) => px[i + c]).sort((a, b) => a - b); return v[v.length >> 1]; });
    const cols = new Float64Array(w); const rows = new Float64Array(h);
    let tot = 0; let n = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = at(x, y); const a = px[i + 3] / 255;
        const d = ((Math.abs(px[i] - med[0]) + Math.abs(px[i + 1] - med[1]) + Math.abs(px[i + 2] - med[2])) / 3) * a;
        if (d < thresh) continue;
        cols[x] += d; rows[y] += d; tot += d; n += 1;
      }
    }
    if (!tot || n < Math.max(3, w * h * 0.001)) return null;
    const span = (arr) => {
      let acc = 0; let a = 0; let b = arr.length - 1;
      for (let i = 0; i < arr.length; i += 1) { acc += arr[i]; if (acc >= tot * 0.04) { a = i; break; } }
      acc = 0;
      for (let i = arr.length - 1; i >= 0; i -= 1) { acc += arr[i]; if (acc >= tot * 0.04) { b = i; break; } }
      return [a / arr.length, (b + 1) / arr.length];
    };
    const [x0, x1] = span(cols); const [y0, y1] = span(rows);
    return { x0: r4(x0), y0: r4(y0), x1: r4(x1), y1: r4(y1), fill: r4(n / (w * h)), weight: Math.round(tot) };
  }

  // box: the subject in the overscan picture's fractions (from subjectBox on the preview). The nudge that keeps it in
  // the safe box: none when it already is (or when the subject fills everything: the scene's own framing stays)
  function autoFrame(box, id, { zones = null } = {}) {
    if (!box) return { z: 1, x: 0, y: 0, why: 'nothing to frame' };
    // fractions of the overscan → the format's own units (-1…1 = its edges at z = 1, y down)
    const U = (f) => (f * 2 - 1) * OVER;
    const b = { x0: U(box.x0), x1: U(box.x1), y0: U(box.y0), y1: U(box.y1) };
    if (b.x1 - b.x0 > OVER * 2 * 0.85 && b.y1 - b.y0 > OVER * 2 * 0.85) return { z: 1, x: 0, y: 0, why: 'the scene fills every shape' };
    const s = safeBox(id, zones);
    const S = { x0: s.x0 * 2 - 1, x1: s.x1 * 2 - 1, y0: s.y0 * 2 - 1, y1: s.y1 * 2 - 1 }; // the safe box at z = 1, centred
    const inside = (z, cx, cy) => b.x0 >= cx + S.x0 / z - 1e-6 && b.x1 <= cx + S.x1 / z + 1e-6 && b.y0 >= cy + S.y0 / z - 1e-6 && b.y1 <= cy + S.y1 / z + 1e-6;
    if (inside(1, 0, 0)) return { z: 1, x: 0, y: 0, why: 'already in frame' };
    // zoom out only as much as needed for its size, then centre it in the safe box
    // the smallest change that keeps it in: z = 1 if it fits (only the view moves), else zoomed out just enough. The
    // view can't leave the zoomed-out picture, so near its edge no framing may fit: then the one that leaves the least
    // of the subject outside the safe box wins (a little zooming out costs a little)
    const z0 = clampN(Math.min(1, (S.x1 - S.x0) / Math.max(1e-6, b.x1 - b.x0), (S.y1 - S.y0) / Math.max(1e-6, b.y1 - b.y0)), Z_MIN, 1);
    const fr = (v, c, z) => ((v - c) * z + 1) / 2;
    const s01 = { x0: (S.x0 + 1) / 2, x1: (S.x1 + 1) / 2, y0: (S.y0 + 1) / 2, y1: (S.y1 + 1) / 2 };
    const over = (q) => Math.max(0, s01.x0 - fr(b.x0, q.x, q.z)) + Math.max(0, fr(b.x1, q.x, q.z) - s01.x1) + Math.max(0, s01.y0 - fr(b.y0, q.y, q.z)) + Math.max(0, fr(b.y1, q.y, q.z) - s01.y1);
    let n = null; let best = Infinity;
    for (const z of [z0, ...Array.from({ length: 13 }, (_, k) => 1 - (k / 12) * (1 - Z_MIN))].filter((v) => v <= z0 + 1e-9)) {
      const q = clamp({ z, x: (b.x0 + b.x1) / 2 - ((S.x0 + S.x1) / 2) / z, y: (b.y0 + b.y1) / 2 - ((S.y0 + S.y1) / 2) / z });
      const sc = over(q) * 10 + (1 - q.z) * 0.05;
      if (sc < best - 1e-9) { best = sc; n = q; }
    }
    return { ...n, why: n.z < 0.999 ? 'zoomed out to keep it whole' : 'moved to keep it in' };
  }

  // ---------- names ----------
  const safe = (s) => String(s || 'Lab').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Lab';
  const stem = (name, id, w, h) => `${safe(name)} ${String(id).replace(':', 'x')} ${w}x${h}`;
  function folder(name, d = new Date()) {
    const p = (v) => String(v).padStart(2, '0');
    return `${safe(name)} · all formats ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
  }
  return { FORMATS, OVER, Z_MIN, Z_MAX, get, nearest, sizeOf, defaults, clamp, isPlain, view, toPage, safeBox, subjectBox, autoFrame, stem, folder, safe };
})();
if (typeof module !== 'undefined') module.exports = FormatsCore;
