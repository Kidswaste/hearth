// Mood board geometry (pure: no DOM, dev tests load it in Node): auto-arrange presets (BoardData.LAYOUTS kinds),
// align / distribute / match size / stack, template frames, bounding boxes. Every function takes plain item objects
// { id, type, x, y, w, h, rot, vibe, tags, stamp, added } and returns new boxes; board.js applies them with undo.
const BoardLayout = (() => {
  const D = typeof BoardData !== 'undefined' ? BoardData : require('./board-data.js');
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const rnd = (i, salt = 1) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); }; // deterministic jitter
  const aspect = (it) => (it.w && it.h ? it.w / it.h : 1);

  function bbox(items) {
    if (!items.length) return { x: 0, y: 0, w: 0, h: 0 };
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const it of items) {
      // a rotated item's box grows; good enough for fitting and snapping
      const r = ((it.rot || 0) * Math.PI) / 180;
      const c = Math.abs(Math.cos(r)); const s = Math.abs(Math.sin(r));
      const w = it.w * c + it.h * s; const h = it.w * s + it.h * c;
      const cx = it.x + it.w / 2; const cy = it.y + it.h / 2;
      x0 = Math.min(x0, cx - w / 2); y0 = Math.min(y0, cy - h / 2); x1 = Math.max(x1, cx + w / 2); y1 = Math.max(y1, cy + h / 2);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // sizes keep each item's shape
  const toWidth = (it, w) => ({ w, h: w / aspect(it) });
  const toHeight = (it, h) => ({ w: h * aspect(it), h });
  const fit = (it, W, H) => { const a = aspect(it); return a > W / H ? { w: W, h: W / a } : { w: H * a, h: H }; };

  function hueKey(it) {
    const c = it.type === 'swatch' ? it.color : it.type === 'palette' ? it.colors?.[0] : it.vibe?.palette?.[0]?.hex;
    if (!c) return 999;
    const [h, s, l] = D.hexHsl(c);
    return s < 0.15 ? 400 + l * 100 : h;
  }
  const SORT = {
    hue: hueKey,
    light: (it) => it.vibe?.light ?? (it.color ? D.hexHsl(it.color)[2] : 0.5),
    sat: (it) => it.vibe?.sat ?? (it.color ? D.hexHsl(it.color)[1] : 0),
    warmth: (it) => it.vibe?.warmth ?? 0,
    contrast: (it) => it.vibe?.contrast ?? 0,
    motion: (it) => it.vibe?.motion ?? -1,
    edges: (it) => it.vibe?.edges ?? 0,
    added: (it) => it.added || 0,
    duration: (it) => it.vibe?.duration ?? 0,
    pacing: (it) => -(it.vibe?.pace ?? 99),
  };
  const GROUP = {
    type: (it) => ({ image: 'Pictures', gif: 'Gifs', video: 'Clips', web: 'Sites', note: 'Notes', text: 'Text', swatch: 'Colors', palette: 'Colors', file: 'Files' }[it.type] || 'Other'),
    tag: (it) => (it.tags?.[0] ? `#${it.tags[0]}` : 'No tag'),
    stamp: (it) => it.stamp || 'No stamp',
    mood: (it) => it.vibe?.moods?.[0] || 'No mood yet',
    temp: (it) => { const w = it.vibe?.warmth ?? (it.color ? (D.hexToRgb(it.color)[0] - D.hexToRgb(it.color)[2]) / 255 : 0); return w > 0.15 ? 'Warm' : w < -0.12 ? 'Cool' : 'Neutral'; },
    family: (it) => { const c = it.color || it.colors?.[0] || it.vibe?.palette?.find((p) => D.family(p.hex) !== 'black' && D.family(p.hex) !== 'gray')?.hex || it.vibe?.palette?.[0]?.hex; return c ? D.family(c) : 'Unknown'; },
    key: (it) => { const l = it.vibe?.light; return l == null ? 'Unknown' : l < 0.3 ? 'Low-key' : l > 0.62 ? 'High-key' : 'Mid-key'; },
    aspect: (it) => { const a = aspect(it); return a < 0.9 ? 'Portrait' : a > 1.1 ? 'Landscape' : 'Square'; },
  };

  // The arrangement for a preset: { boxes: { id: { x, y, w, h, rot } }, labels: [{ text, x, y }] }, laid out from the
  // items' current top-left corner.
  function arrange(items, preset, origin) {
    const L = typeof preset === 'string' ? D.find(D.LAYOUTS, preset) : preset;
    if (!L || !items.length) return { boxes: {}, labels: [] };
    const o = L.opts || {};
    const b = origin || bbox(items);
    const boxes = {};
    const labels = [];
    const set = (it, x, y, size = {}, rot = 0) => { boxes[it.id] = { x: b.x + x, y: b.y + y, w: size.w ?? it.w, h: size.h ?? it.h, rot }; };
    const n = items.length;
    const mw = median(items.map((i) => i.w)) || 300; const mh = median(items.map((i) => i.h)) || 300;
    const gap = o.gap ?? 24;
    const gridOf = (list, cols, W, square, offX = 0, offY = 0) => {
      let y = 0;
      for (let r = 0; r * cols < list.length; r++) {
        const row = list.slice(r * cols, r * cols + cols);
        const sizes = row.map((it) => (square ? fit(it, W, W) : toWidth(it, W)));
        const rowH = square ? W : Math.max(...sizes.map((s) => s.h));
        row.forEach((it, c) => { const s = sizes[c]; set(it, offX + c * (W + gap) + (W - s.w) / 2, offY + y + (rowH - s.h) / 2, s); });
        y += rowH + gap;
      }
      return y;
    };
    const rowOf = (list, H, g = gap, offX = 0, offY = 0) => { let x = 0; for (const it of list) { const s = toHeight(it, H); set(it, offX + x, offY, s); x += s.w + g; } return x; };
    switch (L.kind) {
      case 'grid': { const cols = o.cols || Math.max(1, Math.ceil(Math.sqrt(n))); gridOf(items, cols, o.size || mw, o.square); break; }
      case 'masonry': {
        const cols = o.cols || Math.max(1, Math.round(Math.sqrt(n * 1.1))); const W = o.width || mw; const hs = new Array(cols).fill(0);
        for (const it of items) { const c = hs.indexOf(Math.min(...hs)); const s = toWidth(it, W); set(it, c * (W + gap), hs[c], s); hs[c] += s.h + gap; }
        break;
      }
      case 'row': rowOf(items, o.height || mh, gap); break;
      case 'column': { let y = 0; for (const it of items) { const s = toWidth(it, o.width || mw); set(it, 0, y, s); y += s.h + gap; } break; }
      case 'strip': {
        const key = SORT[o.by] || SORT.added;
        const list = [...items].sort((a, c) => key(a) - key(c));
        if (o.by === 'duration') {
          const md = median(list.map((i) => i.vibe?.duration || 0).filter(Boolean)) || 5;
          let x = 0; for (const it of list) { const k = it.vibe?.duration ? Math.max(0.5, Math.min(3, it.vibe.duration / md)) : 0.5; const s = toHeight(it, mh * Math.sqrt(k)); set(it, x, (mh - s.h) / 2, s); x += s.w + gap; }
        } else rowOf(list, o.height || mh, gap);
        break;
      }
      case 'collage': {
        // justified rows: each row scaled to the same width
        const area = items.reduce((a, i) => a + i.w * i.h, 0);
        const W = Math.max(mw * 2, Math.sqrt(area) * 1.4); const H = mh * 0.9;
        let row = []; let y = 0;
        const flush = (last) => {
          if (!row.length) return;
          const sum = row.reduce((a, it) => a + aspect(it) * H, 0) + gap * (row.length - 1);
          const k = last && sum < W * 0.7 ? 1 : (W - gap * (row.length - 1)) / (sum - gap * (row.length - 1));
          let x = 0; const rh = H * k;
          row.forEach((it, i) => { const w = aspect(it) * rh; set(it, x, y, { w, h: rh }, o.rotate ? (rnd(i + y, 3) - 0.5) * 2 * o.rotate : 0); x += w + gap; });
          y += rh + gap; row = [];
        };
        for (const it of items) { row.push(it); if (row.reduce((a, r) => a + aspect(r) * H, 0) >= W) flush(false); }
        flush(true);
        break;
      }
      case 'scatter': {
        const cols = Math.max(1, Math.ceil(Math.sqrt(n))); const cell = Math.max(mw, mh) * (o.spread || 1.3);
        items.forEach((it, i) => { const c = i % cols; const r = Math.floor(i / cols); set(it, c * cell + (rnd(i, 1) - 0.5) * cell * 0.35, r * cell * 0.85 + (rnd(i, 2) - 0.5) * cell * 0.35, {}, o.rotate ? (rnd(i, 4) - 0.5) * 2 * o.rotate : 0); });
        break;
      }
      case 'stack': items.forEach((it, i) => set(it, i * (o.offset || 20), i * (o.rotate ? o.offset * 0.6 : 0), fit(it, mw, mh), o.rotate ? (i % 2 ? 1 : -1) * rnd(i, 5) * o.rotate : 0)); break;
      case 'circle': {
        const R = Math.max(mw, (n * Math.max(mw, mh) * 1.15) / (2 * Math.PI));
        items.forEach((it, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; set(it, R + Math.cos(a) * R - it.w / 2, R + Math.sin(a) * R - it.h / 2); });
        break;
      }
      case 'spiral': {
        const c = Math.max(mw, mh) * 0.62;
        items.forEach((it, i) => { const a = i * 2.39996; const r = c * Math.sqrt(i); set(it, r * Math.cos(a) - it.w / 2, r * Math.sin(a) - it.h / 2); });
        break;
      }
      case 'diagonal': { let x = 0; let y = 0; for (const it of items) { set(it, x, y); x += it.w * 0.6 + gap; y += it.h * 0.45 + gap; } break; }
      case 'zigzag': { let x = 0; items.forEach((it, i) => { const s = toHeight(it, mh); set(it, x, i % 2 ? mh * 0.5 : 0, s); x += s.w * 0.85 + gap; }); break; }
      case 'honeycomb': {
        const cols = Math.max(1, Math.ceil(Math.sqrt(n))); const W = Math.max(mw, mh) * 0.9;
        items.forEach((it, i) => { const c = i % cols; const r = Math.floor(i / cols); const s = fit(it, W, W); set(it, c * (W + gap) + (r % 2 ? (W + gap) / 2 : 0) + (W - s.w) / 2, r * (W * 0.87 + gap) + (W - s.h) / 2, s); });
        break;
      }
      case 'bento': {
        const C = 4; const W = Math.max(mw, mh) * 0.8; const used = new Set(); const take = (c, r) => used.add(`${c},${r}`);
        const [hero, ...rest] = items;
        const hs = fit(hero, W * 2 + gap, W * 2 + gap); set(hero, (W * 2 + gap - hs.w) / 2, (W * 2 + gap - hs.h) / 2, hs); take(0, 0); take(1, 0); take(0, 1); take(1, 1);
        let i = 0;
        for (const it of rest) { while (used.has(`${i % C},${Math.floor(i / C)}`)) i++; const c = i % C; const r = Math.floor(i / C); take(c, r); const s = fit(it, W, W); set(it, c * (W + gap) + (W - s.w) / 2, r * (W + gap) + (W - s.h) / 2, s); }
        break;
      }
      case 'hero': {
        const [hero, ...rest] = items;
        const rowH = mh * 0.7; const total = rest.reduce((a, it) => a + aspect(it) * rowH + gap, 0) - gap;
        const hw = Math.max(mw * 2, total || mw * 2); const hs = toWidth(hero, hw);
        set(hero, 0, 0, hs);
        const k = rest.length && total > 0 ? hw / total : 1;
        let x = 0; for (const it of rest) { const s = toHeight(it, rowH * k); set(it, x, hs.h + gap, s); x += s.w + gap * k; }
        break;
      }
      case 'pack': {
        const list = [...items].sort((a, c) => c.h - a.h);
        const W = Math.sqrt(items.reduce((a, i) => a + (i.w + gap) * (i.h + gap), 0)) * 1.2;
        let x = 0; let y = 0; let shelf = 0;
        for (const it of list) { if (x > 0 && x + it.w > W) { x = 0; y += shelf + gap; shelf = 0; } set(it, x, y); x += it.w + gap; shelf = Math.max(shelf, it.h); }
        break;
      }
      case 'tidy': {
        const cell = o.cell || 40; const taken = [];
        const hit = (r) => taken.some((t) => r.x < t.x + t.w && r.x + r.w > t.x && r.y < t.y + t.h && r.y + r.h > t.y);
        for (const it of [...items].sort((a, c) => a.y - c.y || a.x - c.x)) {
          const r = { x: Math.round((it.x - b.x) / cell) * cell, y: Math.round((it.y - b.y) / cell) * cell, w: Math.ceil(it.w / cell) * cell, h: Math.ceil(it.h / cell) * cell };
          let guard = 0; while (hit(r) && guard++ < 200) r.x += cell;
          taken.push(r); set(it, r.x, r.y, { w: it.w, h: it.h });
        }
        break;
      }
      case 'sort': {
        const key = SORT[o.by] || SORT.hue;
        const list = [...items].sort((a, c) => key(a) - key(c));
        if (o.then === 'row') rowOf(list, mh * 0.8, gap); else gridOf(list, Math.max(1, Math.ceil(Math.sqrt(n))), mw, false);
        break;
      }
      case 'wheel': {
        const R = Math.max(mw, mh) * Math.max(2, Math.sqrt(n) * 0.9);
        items.forEach((it, i) => {
          const h = hueKey(it); const l = SORT.light(it);
          if (h >= 400 || h === 999) { set(it, R - it.w / 2 + (rnd(i, 7) - 0.5) * mw, R - it.h / 2 + (rnd(i, 8) - 0.5) * mh); return; }
          const a = (h / 360) * Math.PI * 2 - Math.PI / 2; const r = R * (0.35 + (1 - l) * 0.65);
          set(it, R + Math.cos(a) * r - it.w / 2, R + Math.sin(a) * r - it.h / 2);
        });
        break;
      }
      case 'groupBy': {
        const fn = GROUP[o.by] || GROUP.type;
        const groups = new Map();
        for (const it of items) { const k = fn(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
        let x = 0; const W = mw;
        for (const [name, list] of [...groups.entries()].sort((a, c) => c[1].length - a[1].length)) {
          labels.push({ text: name, x: b.x + x, y: b.y - 70 });
          let y = 0; for (const it of list) { const s = toWidth(it, W); set(it, x, y, s); y += s.h + gap; }
          x += W + gap * 3;
        }
        break;
      }
      default: return { boxes: {}, labels: [] };
    }
    return { boxes, labels };
  }

  // ---------- align / distribute ----------
  function align(items, how) {
    const b = bbox(items); const out = {};
    for (const it of items) {
      const p = { x: it.x, y: it.y };
      if (how === 'left') p.x = b.x; else if (how === 'right') p.x = b.x + b.w - it.w; else if (how === 'hcenter') p.x = b.x + (b.w - it.w) / 2;
      else if (how === 'top') p.y = b.y; else if (how === 'bottom') p.y = b.y + b.h - it.h; else if (how === 'vcenter') p.y = b.y + (b.h - it.h) / 2;
      out[it.id] = p;
    }
    return out;
  }
  function distribute(items, axis) {
    const out = {};
    if (items.length < 3) return out;
    const X = axis === 'h' ? 'x' : 'y'; const W = axis === 'h' ? 'w' : 'h';
    const list = [...items].sort((a, c) => a[X] - c[X]);
    const span = list.at(-1)[X] + list.at(-1)[W] - list[0][X];
    const sizes = list.reduce((a, it) => a + it[W], 0);
    const g = (span - sizes) / (list.length - 1);
    let pos = list[0][X];
    for (const it of list) { out[it.id] = { [X]: pos }; pos += it[W] + g; }
    return out;
  }
  function stack(items, axis, gap = 20) {
    const out = {}; const X = axis === 'h' ? 'x' : 'y'; const W = axis === 'h' ? 'w' : 'h';
    const list = [...items].sort((a, c) => a[X] - c[X]);
    let pos = list[0]?.[X] || 0;
    for (const it of list) { out[it.id] = { [X]: pos }; pos += it[W] + gap; }
    return out;
  }
  function matchSize(items, what, ref) {
    const r = ref || items[0]; const out = {};
    for (const it of items) {
      if (what === 'w') out[it.id] = { w: r.w, h: it.h * (r.w / it.w) }; else if (what === 'h') out[it.id] = { h: r.h, w: it.w * (r.h / it.h) }; else out[it.id] = { w: r.w, h: r.h };
    }
    return out;
  }

  // ---------- templates ----------
  // frames for a template, laid out in rows from (x, y): [{ title, w, h, color, x, y, note }]
  function templateFrames(tpl, x0 = 0, y0 = 0, gap = 60) {
    const out = []; let x = 0; let y = 0; let rowH = 0;
    tpl.frames.forEach(([title, w = tpl.size[0], h = tpl.size[1], color = tpl.color], i) => {
      if (i && i % tpl.cols === 0) { x = 0; y += rowH + gap; rowH = 0; }
      out.push({ title, w, h, color, x: x0 + x, y: y0 + y, note: tpl.notes?.[title] || null });
      x += w + gap; rowH = Math.max(rowH, h);
    });
    return out;
  }

  // The view {x, y, z} that shows a box with some margin inside a viewport of vw × vh (screen = world × z + x).
  function fitView(box, vw, vh, pad = 60, zMin = 0.02, zMax = 32) {
    if (!box.w || !box.h) return { x: vw / 2 - box.x, y: vh / 2 - box.y, z: 1 };
    const z = Math.max(zMin, Math.min(zMax, Math.min((vw - pad * 2) / box.w, (vh - pad * 2) / box.h)));
    return { x: vw / 2 - (box.x + box.w / 2) * z, y: vh / 2 - (box.y + box.h / 2) * z, z };
  }

  return { bbox, arrange, align, distribute, stack, matchSize, templateFrames, fitView, SORT, GROUP, fit, toWidth, toHeight };
})();
if (typeof module !== 'undefined') module.exports = BoardLayout;
