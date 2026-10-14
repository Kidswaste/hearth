// Board eyes (round 14): chats SEE the mood board, not only its vibe text. Pictures go to Claude / Astra as real
// images in MCP tool results (like three_screenshot), clips and gifs as a few well-chosen frames or one contact sheet
// with timestamps, a whole board as one overview picture with item ids on it (close-ups on request).
//   board_look    { item | items | frame | selection | board, size, region }  one item, the selection, a frame, the board
//   board_watch   { item, count, times, mode: even|scenes, as: sheet|frames, from, to, size }  a clip / gif over time
//   board_look { items: [2–4], compare: true }  side by side, with how their vibes differ (board_compare: same)
//   board_do      find {query} · caption {item, text} · pinterest {phrases | aesthetic}  (board-pack.js passes these here)
// Token frugality: small pictures by default (512 px, a board overview 768 px), the model asks for medium / large;
// nothing is attached to messages by itself; every result says what was sent ("1 picture 512×384 ≈ 262 tokens") and
// the chat shows it as a small card (board-eyes-ui.js). The vibe rule stays: references give a vibe, never footage.
// BoardEyes.picture / sheet / overview are also used by the UI ("Show this to a chat", /board look).
const BoardEyes = (() => {
  const B = Board; const V = BoardVibe; const D = BoardData;
  const SIZES = { small: 512, medium: 1024, large: 1568 };
  const WIDE = { small: 768, medium: 1280, large: 1568 }; // overviews and contact sheets (many things in one picture)
  const MAX_ITEMS = 12; // a sheet of the selection / several items
  const RULE = 'Reference only: borrow the vibe; never put this media in the output unless the owner asks for the clip itself.';
  const sizeOf = (s, table = SIZES) => table[String(s || 'small').toLowerCase()] || table.small;
  const tokensOf = (w, h) => { const k = Math.min(1, 1568 / Math.max(w, h)); return Math.round((w * k * h * k) / 750); };
  const r2 = (v) => Math.round(v * 100) / 100;
  const fmtT = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const jpeg = (c, q = 0.8) => c.toDataURL('image/jpeg', q).split(',')[1];
  const isMedia = (it) => ['image', 'gif', 'video', 'web'].includes(it?.type);
  const isClip = (it) => it?.type === 'video' || it?.type === 'gif';
  const label = (it) => `${it.id} ${V.KIND_WORD[it.type] || it.type}${it.title ? ` "${String(it.title).slice(0, 40)}"` : ''}`;
  const CSS = () => getComputedStyle(document.documentElement);
  const ACCENT = () => CSS().getPropertyValue('--fh-gold').trim() || '#ffc233';

  // ---------- which board, which items ----------
  async function boardOf(a = {}, ctx = {}) {
    await B.ready();
    if (a.board) { const e = B.findBoard(a.board); if (!e) throw new Error(`No board "${a.board}" (board_do list lists them).`); return B.load(e.id); }
    return ctx.chatId ? B.boardFor(ctx.chatId) : B.current();
  }
  // an item by id, then by its title / tags / alt words (the model may name it)
  function findItem(b, ref) {
    if (!ref) return null;
    if (typeof ref === 'object') return ref;
    const q = String(ref).trim(); const ql = q.toLowerCase();
    return b.items.find((i) => i.id === q) || b.items.find((i) => (i.title || '').toLowerCase() === ql)
      || b.items.find((i) => i.type !== 'frame' && i.type !== 'link' && (i.title || '').toLowerCase().includes(ql))
      || rank(b, q, 1)[0]?.it || null;
  }
  const frameOfName = (b, ref) => b.items.find((i) => i.type === 'frame' && (i.id === ref || (i.title || '').toLowerCase() === String(ref).toLowerCase()))
    || b.items.find((i) => i.type === 'frame' && (i.title || '').toLowerCase().includes(String(ref).toLowerCase()));
  const inside = (b, fr) => b.items.filter((i) => i !== fr && i.type !== 'frame' && i.type !== 'link' && !i.hidden && i.x + i.w / 2 >= fr.x && i.x + i.w / 2 <= fr.x + fr.w && i.y + i.h / 2 >= fr.y && i.y + i.h / 2 <= fr.y + fr.h);
  const visibleItems = (b) => b.items.filter((i) => i.type !== 'link' && !i.hidden);

  // ---------- pictures of one item ----------
  async function img(path) { return V.loadImage(B.fileUrl(path)); }
  // the smallest stored file that is still sharp enough for `max` px
  function fileFor(it, max) {
    if (it.type === 'video') return it.poster || it.tiny;
    if (it.type === 'gif') return max <= 256 ? it.tiny || it.poster || it.src : it.poster || it.src;
    if (max <= 256 && it.tiny) return it.tiny;
    if (max <= 1024 && it.thumb) return it.thumb;
    return it.src || it.thumb || it.tiny;
  }
  // a still of the item as a canvas, its long side ≤ max (region [x, y, w, h] 0..1 = a close-up of that part)
  async function stillOf(it, max, region) {
    let source = null;
    if (it.type === 'video' && max > 1024 && it.src && typeof FrameRead !== 'undefined') {
      try { const f = await FrameRead.at(it.src, { time: Math.min((it.duration || 0) * 0.1, 2) }, { width: Math.min(1920, max), format: 'jpg' }); source = await img(f.path); } catch { /* the poster */ }
    }
    if (!source && isMedia(it)) { const p = fileFor(it, region ? max * 2 : max); if (p) source = await img(p).catch(() => null); }
    if (!source && isMedia(it) && it.src && it.type !== 'video') source = await img(it.src).catch(() => null);
    if (source) {
      const sw = source.naturalWidth || source.videoWidth; const sh = source.naturalHeight || source.videoHeight;
      let [rx, ry, rw, rh] = Array.isArray(region) && region.length === 4 ? region.map(Number) : [0, 0, 1, 1];
      rx = Math.max(0, Math.min(1, rx)); ry = Math.max(0, Math.min(1, ry)); rw = Math.max(0.02, Math.min(1 - rx, rw)); rh = Math.max(0.02, Math.min(1 - ry, rh));
      const cw = sw * rw; const ch = sh * rh; const k = Math.min(1, max / Math.max(cw, ch));
      const c = canvas(cw * k, ch * k);
      c.getContext('2d').drawImage(source, sx(sw, rx), sx(sh, ry), cw, ch, 0, 0, c.width, c.height);
      return c;
    }
    // notes, text, colors, shapes: a small card (the text is in the result too)
    const w = Math.min(max, 512); const h = Math.round(w * Math.min(1.4, Math.max(0.4, (it.h || 260) / (it.w || 360))));
    const c = canvas(w, h); drawCard(c.getContext('2d'), it, 0, 0, w, h, w / Math.max(1, it.w || 360));
    return c;
  }
  const sx = (n, f) => Math.round(n * f);

  // ---------- drawing an item into a rectangle (overview, sheets) ----------
  function drawCard(g, it, x, y, w, h, z = 1) {
    g.save();
    const font = (px, weight = 500) => { g.font = `${weight} ${Math.max(7, Math.round(px))}px system-ui, -apple-system, "Segoe UI", sans-serif`; };
    if (it.type === 'note') {
      const st = D.NOTE_STYLES.find((s) => s.id === it.style) || D.NOTE_STYLES[0];
      g.fillStyle = st.bg || '#fff3a8'; g.fillRect(x, y, w, h);
      wrap(g, String(it.text || '').replace(/[*_#`>]+/g, ''), x + w * 0.07, y + h * 0.1, w * 0.86, h * 0.84, Math.max(8, 22 * z), st.fg || '#222', font);
    } else if (it.type === 'text') {
      wrap(g, String(it.text || ''), x, y, w, h, Math.max(8, Math.min(h * 0.8, (it.fs || 72) * z)), it.color || '#f3efe6', (px) => font(px, 800));
    } else if (it.type === 'swatch') {
      g.fillStyle = it.color || '#888'; g.fillRect(x, y, w, h * 0.8);
      g.fillStyle = '#eee'; g.fillRect(x, y + h * 0.8, w, h * 0.2);
      g.fillStyle = '#222'; font(h * 0.09); g.textBaseline = 'middle'; g.fillText(String(it.color || ''), x + 6, y + h * 0.9);
    } else if (it.type === 'palette') {
      const cols = it.colors || []; const cw = w / Math.max(1, cols.length);
      cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(x + i * cw, y, cw + 1, h); });
    } else if (it.type === 'shape') {
      g.fillStyle = it.color || '#e6b450';
      if (it.shape === 'circle' || it.shape === 'ellipse') { g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); } else g.fillRect(x, y, w, h);
    } else if (it.type === 'sticker') {
      g.fillStyle = it.color || '#ffc233'; font(Math.min(w, h) * 0.8, 700); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(it.glyph || '★', x + w / 2, y + h / 2);
    } else if (it.type === 'arrow') {
      g.strokeStyle = it.color || '#e6b450'; g.lineWidth = Math.max(1, 4 * z); g.beginPath(); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke();
    } else {
      g.fillStyle = '#2a2a30'; g.fillRect(x, y, w, h);
      g.fillStyle = '#9a968c'; font(Math.min(w, h) * 0.12); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(V.KIND_WORD[it.type] || it.type, x + w / 2, y + h / 2);
    }
    g.restore();
  }
  function wrap(g, text, x, y, w, h, px, color, font) {
    font(px); g.fillStyle = color; g.textBaseline = 'top'; g.textAlign = 'left';
    const words = text.split(/\s+/); let line = ''; let yy = y;
    for (const word of words) {
      const t = line ? `${line} ${word}` : word;
      if (g.measureText(t).width > w && line) { g.fillText(line, x, yy); yy += px * 1.2; line = word; if (yy > y + h - px) return; } else line = t;
    }
    if (line && yy <= y + h - px) g.fillText(line, x, yy);
  }
  // a small id tag in a corner (what the chat names when it points at an item)
  function tag(g, text, x, y, px) {
    g.save();
    g.font = `700 ${px}px ui-monospace, Menlo, Consolas, monospace`;
    const w = g.measureText(text).width + px * 0.7;
    g.fillStyle = 'rgba(10,10,12,.82)'; g.fillRect(x, y, w, px * 1.45);
    g.fillStyle = ACCENT(); g.textBaseline = 'middle'; g.fillText(text, x + px * 0.35, y + px * 0.75);
    g.restore();
  }
  async function drawItem(g, it, x, y, w, h, z) {
    if (isMedia(it)) {
      const p = fileFor(it, Math.max(w, h));
      try { if (p) { g.drawImage(await img(p), x, y, w, h); return; } } catch { /* a grey card */ }
    }
    drawCard(g, it, x, y, w, h, z);
  }

  // ---------- the whole board (or a frame) as one picture, ids on the items ----------
  async function overview(b, { size = 'small', frame = null, items = null } = {}) {
    const list = items || (frame ? [frame, ...inside(b, frame)] : visibleItems(b));
    if (!list.length) throw new Error(`"${b.name}" is empty.`);
    const bb = BoardLayout.bbox(list);
    const max = sizeOf(size, WIDE); const pad = 16;
    const k = Math.min((max - pad * 2) / Math.max(1, bb.w), (max - pad * 2) / Math.max(1, bb.h));
    const c = canvas(bb.w * k + pad * 2, bb.h * k + pad * 2); const g = c.getContext('2d');
    g.fillStyle = '#141417'; g.fillRect(0, 0, c.width, c.height);
    const X = (v) => pad + (v - bb.x) * k; const Y = (v) => pad + (v - bb.y) * k;
    const shown = [];
    // frames first (behind), then the rest in board order
    for (const it of [...list.filter((i) => i.type === 'frame'), ...list.filter((i) => i.type !== 'frame')]) {
      const x = X(it.x); const y = Y(it.y); const w = it.w * k; const h = it.h * k;
      if (it.type === 'frame') {
        g.strokeStyle = it.color || 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; g.setLineDash([6, 4]); g.strokeRect(x, y, w, h); g.setLineDash([]);
        g.fillStyle = '#d8d4ca'; g.font = '600 12px system-ui, sans-serif'; g.textBaseline = 'bottom'; g.fillText(String(it.title || 'Frame').slice(0, 40), x + 2, y - 2);
        continue;
      }
      await drawItem(g, it, x, y, w, h, k);
      shown.push(it);
    }
    // links between items
    for (const l of b.items.filter((i) => i.type === 'link')) {
      const a = list.find((i) => i.id === l.from); const z = list.find((i) => i.id === l.to);
      if (!a || !z) continue;
      g.strokeStyle = l.color || '#e6b450'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(a.x + a.w / 2), Y(a.y + a.h / 2)); g.lineTo(X(z.x + z.w / 2), Y(z.y + z.h / 2)); g.stroke();
    }
    // ids where they fit (at most 40), the rest are listed in the text
    const px = Math.max(9, Math.round(c.width / 70));
    let tagged = 0;
    for (const it of shown) if (it.w * k >= px * 2.2 && tagged < 40) { tag(g, it.id, X(it.x) + 2, Y(it.y) + 2, px); tagged++; }
    return { canvas: c, items: shown };
  }

  // ---------- several items in one grid (the selection, a list) ----------
  async function sheet(list, { size = 'small', labels = (it) => it.id } = {}) {
    const n = list.length; const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4; const rows = Math.ceil(n / cols);
    const W = sizeOf(size, WIDE); const gap = 8; const cell = Math.floor((W - gap * (cols + 1)) / cols);
    const lab = Math.max(14, Math.round(cell / 14));
    const H2 = gap + rows * (cell + lab + gap);
    const c = canvas(W, H2); const g = c.getContext('2d');
    g.fillStyle = '#141417'; g.fillRect(0, 0, W, H2);
    for (const [i, it] of list.entries()) {
      const col = i % cols; const row = Math.floor(i / cols);
      const x = gap + col * (cell + gap); const y = gap + row * (cell + lab + gap);
      const ar = (it.natural ? it.natural[0] / it.natural[1] : (it.w || 1) / (it.h || 1)) || 1;
      const w = ar >= 1 ? cell : cell * ar; const h = ar >= 1 ? cell / ar : cell;
      await drawItem(g, it, x + (cell - w) / 2, y + (cell - h) / 2, w, h, w / Math.max(1, it.w || 360));
      g.fillStyle = '#e9e5db'; g.font = `600 ${Math.round(lab * 0.72)}px system-ui, sans-serif`; g.textBaseline = 'middle';
      g.fillText(String(labels(it)).slice(0, Math.max(6, Math.floor(cell / (lab * 0.45)))), x + 2, y + cell + lab / 2);
    }
    return { canvas: c };
  }

  // ---------- a clip / gif over time ----------
  // frames: [{ t, frame?, canvas | path }] → one contact sheet with timestamps, or separate pictures
  async function framesOf(it, { count = 6, times = null, mode = 'even', from, to, width = 480 } = {}) {
    count = Math.max(1, Math.min(16, Number(count) || 6));
    if (it.type === 'gif') { const g = await gifFrames(it, { count, times, from, to }).catch(() => null); if (g) return g; }
    if (!it.src || typeof FrameRead === 'undefined') throw new Error('This clip can\'t be read here.');
    const info = await FrameRead.info(it.src);
    const dur = info.duration || it.duration || 0;
    let pics;
    if (Array.isArray(times) && times.length) pics = await FrameRead.frames(it.src, { times: times.slice(0, 16).map((t) => Math.max(0, Math.min(dur, Number(t) || 0))) }, { width, format: 'jpg' });
    else if (mode === 'scenes') {
      const s = await FrameRead.scenes(it.src, { pictures: true, max: count });
      pics = s.cuts.slice(0, count).map((x) => ({ ...x, shot: x.length }));
      // the board's own cut finder (its vibe) can see cuts between two flat colors that ffmpeg's scene score misses
      const vc = (it.vibe?.cuts || []).filter((t) => t > 0.05 && t < dur - 0.05);
      if (vc.length + 1 > pics.length) {
        const starts = [0, ...vc].slice(0, count);
        const got = await FrameRead.frames(it.src, { times: starts.map((t) => Math.min(dur, t + 0.04)) }, { width, format: 'jpg' });
        pics = got.map((p, i) => ({ ...p, shot: ((vc[i] ?? dur) - starts[i]) }));
      }
      if (pics.length < 2 && count > 1) pics = await FrameRead.spread(it.src, count, { from, to }, { width, format: 'jpg' }); // one shot: spread instead
    } else pics = await FrameRead.spread(it.src, count, { from, to }, { width, format: 'jpg' });
    return { fps: info.fps, duration: dur, w: info.w, h: info.h, frames: pics.filter((p) => p.path).map((p) => ({ t: p.time, frame: p.frame, path: p.path, shot: p.shot })) };
  }
  // gifs decode in the page (WebCodecs ImageDecoder): every frame's time is known, no ffmpeg needed
  async function gifFrames(it, { count, times, from = 0, to }) {
    if (typeof ImageDecoder === 'undefined') return null;
    const data = await readBytes(it.src);
    const dec = new ImageDecoder({ data, type: 'image/gif' });
    await dec.tracks.ready;
    const total = dec.tracks.selectedTrack.frameCount;
    // frame start times (timestamps are in µs)
    const starts = []; let w = 0; let h = 0;
    for (let i = 0; i < total; i++) { const r = await dec.decode({ frameIndex: i }); starts.push(r.image.timestamp / 1e6); if (!i) { w = r.image.displayWidth; h = r.image.displayHeight; } if (i === total - 1) starts.push(r.image.timestamp / 1e6 + (r.image.duration || 1e5) / 1e6); r.image.close(); }
    const dur = starts[total] || total * 0.1;
    const end = to != null ? Math.min(dur, to) : dur;
    const at = (t) => { let k = 0; while (k + 1 < total && starts[k + 1] <= t + 1e-6) k++; return k; };
    const want = Array.isArray(times) && times.length ? times.slice(0, 16).map((t) => at(Number(t) || 0)) : [...new Set(Array.from({ length: Math.min(count, total) }, (_, i) => at(from + ((end - from) * (count === 1 ? 0.5 : i / Math.max(1, count - 1))) * 0.999)))];
    const frames = [];
    for (const idx of want) {
      const r = await dec.decode({ frameIndex: idx });
      const c = canvas(r.image.displayWidth, r.image.displayHeight); c.getContext('2d').drawImage(r.image, 0, 0); r.image.close();
      frames.push({ t: r2(starts[idx]), frame: idx, canvas: c });
    }
    dec.close();
    return { fps: total && dur ? r2(total / dur) : 10, duration: r2(dur), w, h, frames, gif: true, total };
  }
  function readBytes(path) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open('GET', B.fileUrl(path)); x.responseType = 'arraybuffer';
      x.onload = () => (x.response ? resolve(x.response) : reject(new Error('empty'))); x.onerror = () => reject(new Error('The gif did not load')); x.send();
    });
  }
  async function frameCanvas(f) { if (f.canvas) return f.canvas; const im = await img(f.path); const c = canvas(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0); return c; }
  async function contactSheet(fr, { size = 'small', title = '' } = {}) {
    const n = fr.frames.length; const ar = (fr.w && fr.h ? fr.w / fr.h : 16 / 9);
    const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4; const rows = Math.ceil(n / cols);
    const W = sizeOf(size, WIDE); const gap = 6; const head = title ? 22 : 0;
    const cw = Math.floor((W - gap * (cols + 1)) / cols); const ch = Math.round(cw / ar); const lab = Math.max(13, Math.round(cw / 16));
    const H2 = head + gap + rows * (ch + lab + gap);
    const c = canvas(W, H2); const g = c.getContext('2d');
    g.fillStyle = '#111114'; g.fillRect(0, 0, W, H2);
    if (title) { g.fillStyle = '#e9e5db'; g.font = '600 13px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(title.slice(0, 90), gap, head / 2 + 2); }
    for (const [i, f] of fr.frames.entries()) {
      const x = gap + (i % cols) * (cw + gap); const y = head + gap + Math.floor(i / cols) * (ch + lab + gap);
      try { g.drawImage(await frameCanvas(f), x, y, cw, ch); } catch { g.fillStyle = '#333'; g.fillRect(x, y, cw, ch); }
      g.fillStyle = '#e9e5db'; g.font = `${Math.round(lab * 0.7)}px ui-monospace, Menlo, Consolas, monospace`; g.textBaseline = 'middle';
      g.fillText(`#${i + 1} ${fmtT(f.t || 0)}${f.frame != null ? ` · f${f.frame}` : ''}${f.shot ? ` · ${f.shot.toFixed(1)}s shot` : ''}`, x + 2, y + ch + lab / 2);
    }
    return c;
  }

  // ---------- results (what goes back to the chat, and what it cost) ----------
  function pack(canvases, q = 0.8) {
    const images = canvases.map((c) => ({ data: jpeg(c, q), mime: 'image/jpeg', w: c.width, h: c.height }));
    const tokens = images.reduce((s, x) => s + tokensOf(x.w, x.h), 0);
    const dims = [...new Set(images.map((x) => `${x.w}×${x.h}`))].join(', ');
    return { images, tokens, sent: `${images.length} picture${images.length === 1 ? '' : 's'} ${dims} ≈ ${tokens} tokens` };
  }
  const result = (b, list, value, p, extra = {}) => ({
    ok: true, value: { ...value, sent: p.sent }, images: p.images.map(({ data, mime }) => ({ data, mime })),
    eyes: { board: b.id, boardName: b.name, items: list.slice(0, 16).map((i) => ({ id: i.id, title: i.title || V.KIND_WORD[i.type] || i.type })), pictures: p.images.length, size: p.sent, tokens: p.tokens, ...extra },
  });
  const altNote = (list) => { const missing = list.filter((i) => isMedia(i) && !i.alt).length; return missing ? 'board_do caption {item, text} saves what you saw (one line) so later reads skip the picture.' : undefined; };

  // board_look: one item (region = close-up), several, the selection, a frame, or the whole board
  async function look(a = {}, ctx = {}) {
    if (a.compare) return compare(a, ctx);
    const b = await boardOf(a, ctx);
    const size = a.size || 'small';
    let list = [];
    if (a.items?.length) list = [].concat(a.items).map((r) => findItem(b, r)).filter(Boolean);
    else if (a.item) { const it = findItem(b, a.item); if (!it) return { ok: false, error: `No item "${a.item}" on "${b.name}" (board_look with no item shows the board with its ids).` }; list = [it]; }
    else if (a.selection) { if (b !== B.current()) return { ok: false, error: 'The selection is on the board on screen; name items instead.' }; list = B.selected().filter((i) => i.type !== 'link'); if (!list.length) return { ok: false, error: 'Nothing is selected on the board.' }; }
    if (a.frame) {
      const fr = frameOfName(b, a.frame); if (!fr) return { ok: false, error: `No frame "${a.frame}" (frames: ${b.items.filter((i) => i.type === 'frame').map((i) => i.title).join(', ') || 'none'}).` };
      const o = await overview(b, { size, frame: fr });
      return result(b, o.items, { frame: fr.title, items: o.items.slice(0, 40).map(label), rule: RULE }, pack([o.canvas]));
    }
    if (list.length === 1 && list[0].type !== 'frame') {
      const it = list[0];
      const c = await stillOf(it, sizeOf(size), a.region);
      const v = { item: label(it), vibe: V.text(it), ...(it.alt ? { seen: it.alt } : {}), ...(isClip(it) ? { clip: `${it.type === 'gif' ? 'gif' : 'clip'}${it.duration ? ` ${r2(it.duration)}s` : ''}: board_do watch shows it over time` } : {}), ...(it.text ? { text: String(it.text).slice(0, 600) } : {}), ...(it.source || it.url ? { source: it.source || it.url } : {}), rule: RULE, tip: altNote(list) };
      return result(b, list, v, pack([c]));
    }
    if (list.length > 1) {
      const shown = list.slice(0, MAX_ITEMS);
      const s = await sheet(shown, { size });
      return result(b, shown, { items: shown.map((i) => `${label(i)}${i.alt ? ` · seen: ${i.alt.slice(0, 80)}` : ''}`), more: list.length > MAX_ITEMS ? `${list.length - MAX_ITEMS} more not shown` : undefined, rule: RULE, tip: altNote(shown) }, pack([s.canvas]));
    }
    const o = await overview(b, { size });
    return result(b, o.items, { board: `"${b.name}" (${o.items.length} items; ids on the picture)`, items: o.items.slice(0, 60).map(label), closeup: 'board_look { item: id } for one, size medium / large for detail', rule: RULE }, pack([o.canvas]));
  }

  // board_watch: a clip or gif as frames with timestamps (a contact sheet by default)
  async function watch(a = {}, ctx = {}) {
    const b = await boardOf(a, ctx);
    const it = findItem(b, a.item) || (!a.item && b === B.current() ? B.selected().find(isClip) : null);
    if (!it) return { ok: false, error: a.item ? `No clip "${a.item}" on "${b.name}".` : 'Name a clip (item: id).' };
    if (!isClip(it)) return { ok: false, error: `${it.id} is a ${V.KIND_WORD[it.type] || it.type}, not a clip or gif: board_look shows it.` };
    const asFrames = a.as === 'frames';
    const fr = await framesOf(it, { count: a.count || (asFrames ? 4 : 6), times: a.times, mode: a.mode, from: a.from, to: a.to, width: asFrames ? Math.min(sizeOf(a.size), 1568) : Math.round(sizeOf(a.size, WIDE) / 2) });
    if (!fr.frames.length) return { ok: false, error: 'No frames came out of this clip.' };
    let canvases;
    if (asFrames) {
      canvases = [];
      for (const f of fr.frames.slice(0, 8)) { const c0 = await frameCanvas(f); const k = Math.min(1, sizeOf(a.size) / Math.max(c0.width, c0.height)); const c = canvas(c0.width * k, c0.height * k); c.getContext('2d').drawImage(c0, 0, 0, c.width, c.height); canvases.push(c); }
    } else canvases = [await contactSheet(fr, { size: a.size, title: `${it.title || it.id} · ${r2(fr.duration)}s${fr.fps ? ` · ${fr.fps} fps` : ''}` })];
    const p = pack(canvases);
    const v = {
      item: label(it), length: `${r2(fr.duration)}s${fr.fps ? ` at ${fr.fps} fps` : ''}${fr.gif ? ` · ${fr.total} gif frames` : ''}`,
      frames: fr.frames.slice(0, canvases.length > 1 ? 8 : 16).map((f, i) => `#${i + 1} ${fmtT(f.t || 0)}${f.frame != null ? ` f${f.frame}` : ''}${f.shot ? ` (shot ${f.shot.toFixed(1)}s)` : ''}`).join(' · '),
      ...(it.vibe?.cutCount != null ? { pacing: `${it.vibe.cutCount} cuts${it.vibe.pace ? `, ≈${it.vibe.pace}s per shot` : ''}, motion ${V.words.motionWord(it.vibe.motion || 0)}` } : {}),
      more: 'times: [s…] for exact moments, mode: "scenes" for one frame per shot, as: "frames" for separate pictures', rule: RULE,
    };
    return result(b, [it], v, p, { times: fr.frames.map((f) => r2(f.t || 0)) });
  }

  // board_compare: 2–4 items side by side + how their vibes differ
  async function compare(a = {}, ctx = {}) {
    const b = await boardOf(a, ctx);
    let list = [].concat(a.items || []).map((r) => findItem(b, r)).filter(Boolean);
    if (!list.length && b === B.current()) list = B.selected().filter((i) => i.type !== 'link' && i.type !== 'frame');
    list = [...new Set(list)].slice(0, 4);
    if (list.length < 2) return { ok: false, error: 'Name 2 to 4 items (items: [id, id]).' };
    const H0 = Math.round(sizeOf(a.size, WIDE) / (list.length <= 2 ? 2.2 : 3.2)); const gap = 8; const lab = 18;
    const cells = await Promise.all(list.map((it) => stillOf(it, Math.round(H0 * 1.8))));
    const ws = cells.map((c) => Math.round((c.width / c.height) * H0));
    const W = Math.min(sizeOf(a.size, WIDE), ws.reduce((s, w) => s + w, 0) + gap * (list.length + 1));
    const k = Math.min(1, (W - gap * (list.length + 1)) / ws.reduce((s, w) => s + w, 0));
    const c = canvas(W, H0 * k + lab + gap * 2); const g = c.getContext('2d');
    g.fillStyle = '#141417'; g.fillRect(0, 0, c.width, c.height);
    let x = gap;
    for (const [i, it] of list.entries()) {
      const w = ws[i] * k; g.drawImage(cells[i], x, gap, w, H0 * k);
      g.fillStyle = '#e9e5db'; g.font = '600 12px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(`${it.id} ${String(it.title || '').slice(0, 24)}`, x + 2, gap + H0 * k + lab / 2 + 2);
      x += w + gap;
    }
    const diff = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) diff.push(`${list[i].id}↔${list[j].id} ${differ(list[i], list[j])}`);
    return result(b, list, { items: list.map((it) => `${label(it)}: ${V.text(it, ['palette', 'light', 'color', 'motion', 'mood']).replace(/^[^:]*: /, '')}`), differences: diff, rule: RULE }, pack([c]));
  }
  // "0.42 apart: B darker, B warmer, A more saturated…"
  function differ(a, b) {
    const va = a.vibe || {}; const vb = b.vibe || {};
    if (va.light == null || vb.light == null) return 'no vibe to compare yet';
    const out = [];
    const cmp = (k, more, less, th = 0.08) => { const d = (vb[k] || 0) - (va[k] || 0); if (Math.abs(d) > th) out.push(`${b.id} ${d > 0 ? more : less}`); };
    cmp('light', 'brighter', 'darker'); cmp('contrast', 'more contrast', 'softer'); cmp('sat', 'more saturated', 'more muted'); cmp('warmth', 'warmer', 'cooler', 0.1); cmp('edges', 'busier', 'cleaner'); cmp('grain', 'grainier', 'smoother');
    if (va.motion != null && vb.motion != null) cmp('motion', 'more motion', 'calmer');
    return `${V.distance(va, vb)} apart${out.length ? `: ${out.join(', ')}` : ': very alike'}`;
  }

  // ---------- find on the board by description (no pictures, no tokens beyond the list) ----------
  const LOOKS = [
    [/^(dark|night|nocturnal|low-?key|shadowy|moody)$/, (v) => v.light != null && v.light < 0.36], [/^(bright|light|airy|high-?key|sunny)$/, (v) => v.light > 0.62],
    [/^(warm|golden|sunset|amber)$/, (v) => v.warmth > 0.12], [/^(cold|cool|icy|blue-?ish|clinical)$/, (v) => v.warmth < -0.08],
    [/^(colou?rful|vivid|saturated|loud|neon|electric)$/, (v) => v.sat > 0.5], [/^(muted|desaturated|faded|pastel|washed)$/, (v) => v.sat != null && v.sat < 0.3],
    [/^(bw|b&w|monochrome|grayscale|greyscale)$/, (v) => v.sat != null && v.sat < 0.12], [/^(busy|detailed|gritty|chaotic)$/, (v) => v.edges > 0.4],
    [/^(minimal|clean|simple|empty|calm)$/, (v) => v.edges != null && v.edges < 0.18], [/^(grain|grainy|filmic|film|textured)$/, (v) => v.grain > 0.4],
    [/^(fast|energetic|frantic|dynamic|action)$/, (v) => v.motion > 0.4 || (v.pace != null && v.pace < 1)], [/^(slow|still|meditative|static)$/, (v) => v.motion != null && v.motion < 0.15],
    [/^(contrasty|contrast|graphic|bold|dramatic)$/, (v) => v.contrast > 0.6], [/^(soft|hazy|dreamy|foggy)$/, (v) => v.contrast != null && v.contrast < 0.32],
  ];
  const KINDS = { clip: 'video', clips: 'video', video: 'video', videos: 'video', footage: 'video', picture: 'image', pictures: 'image', photo: 'image', photos: 'image', image: 'image', images: 'image', gif: 'gif', gifs: 'gif', site: 'web', sites: 'web', website: 'web', websites: 'web', page: 'web', note: 'note', notes: 'note', color: 'swatch', colors: 'swatch', palette: 'palette' };
  const STOP = new Set(['the', 'a', 'an', 'with', 'of', 'and', 'in', 'on', 'that', 'one', 'some', 'my', 'is', 'are', 'for', 'to', 'it', 'its', 'like', 'which', 'where', 'there', 'show', 'find', 'me']);
  function hay(it) { return `${B._.haystack ? B._.haystack(it) : JSON.stringify([it.title, it.tags, it.note, it.text]).toLowerCase()} ${String(it.alt || '').toLowerCase()} ${String(it.credit || '').toLowerCase()}`; }
  function rank(b, q, limit = 8) {
    const words = String(q || '').toLowerCase().replace(/[^\p{L}\p{N}#&\s-]+/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
    if (!words.length) return [];
    const out = [];
    for (const it of b.items) {
      if (it.type === 'frame' || it.type === 'link' || it.hidden) continue;
      const h = hay(it); const v = it.vibe || {};
      let score = 0;
      for (const w of words) {
        if (KINDS[w]) { if (it.type === KINDS[w] || (KINDS[w] === 'swatch' && it.type === 'palette')) score += 1.5; continue; }
        if (new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(h)) score += 2;
        else if (w.length > 3 && h.includes(w)) score += 1;
        const look = LOOKS.find(([re]) => re.test(w)); if (look) { try { if (look[1](v)) score += 1.2; } catch { /* no vibe */ } }
      }
      if (score > 0) out.push({ it, score: r2(score / words.length) });
    }
    return out.sort((x, y) => y.score - x.score).slice(0, limit);
  }
  async function find(a = {}, ctx = {}) {
    const b = await boardOf(a, ctx);
    const r = rank(b, a.query || a.text || '', Math.min(20, a.limit || 8));
    if (!r.length) return { ok: true, value: `Nothing on "${b.name}" matches "${a.query}".` };
    const out = { ok: true, value: { matches: r.map((x) => `${label(x.it)} · ${x.score}${x.it.alt ? ` · seen: ${x.it.alt.slice(0, 80)}` : ''}`), look: 'board_look { items: [ids] } to see them' } };
    if (a.show && b === B.current() && B.isMounted()) { B.select(r.map((x) => x.it.id)); B.zoomSel(); }
    if (a.image) { const s = await sheet(r.slice(0, MAX_ITEMS).map((x) => x.it), { size: 'small' }); const p = pack([s.canvas]); return result(b, r.map((x) => x.it), { ...out.value, sent: undefined }, p); }
    return out;
  }
  // captions / alt text: written once (by a chat that looked, or by the owner) and kept; vibe texts carry them after
  async function caption(a = {}, ctx = {}) {
    const b = await boardOf(a, ctx);
    const pairs = Array.isArray(a.captions) ? a.captions : [{ item: a.item, text: a.text }];
    const done = [];
    for (const p of pairs.slice(0, 20)) {
      const it = findItem(b, p.item); const t = String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!it || !t) continue;
      it.alt = t; it.altBy = ctx.chatId ? 'chat' : 'owner';
      done.push(it.id);
    }
    if (!done.length) return { ok: false, error: 'Give item and text (or captions: [{item, text}]).' };
    await B.save(b);
    if (b === B.current()) B._.emit?.('items');
    return { ok: true, value: `saved ${done.length} caption${done.length === 1 ? '' : 's'} (${done.join(', ')}): board_vibe and board_find read them` };
  }

  // the HubBridge entry (bridge.js routes board_look / board_watch / board_compare here; board_do ops via board-pack.js)
  const TOOLS = { board_look: look, board_watch: watch, board_compare: compare };
  const OPS = { find, caption };
  async function handle(tool, a = {}, ctx = {}) {
    try { return await TOOLS[tool](a, ctx); } catch (err) { return { ok: false, error: err.message || String(err) }; }
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['board_look', 'board_watch', 'board_compare'], handle);

  return { look, watch, compare, find, caption, rank, differ, overview, sheet, stillOf, framesOf, gifFrames, contactSheet, pack, tokensOf, findItem, handle, OPS, SIZES, WIDE, RULE, jpeg, label };
})();
