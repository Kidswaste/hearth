// Mood board: an infinite canvas of pictures, clips, websites, notes, text, colors and frames (the "Board" rail tool),
// and the owner's always-available reference space the chats borrow a VIBE from (never the footage itself).
//   storage   kv 'boards' (index: list, current, chat links, prefs) + kv 'board-<id>' (one board); media copied into
//             data/board/media by boardmain.js (originals never touched), thumbnails / posters made here
//   canvas    pan / zoom = one CSS transform on one layer (.bd-world), applied once per frame at most; items are
//             culled off screen, pictures load a small / medium / full file by their size on screen, clips show a
//             poster and only play while hovered or selected
//   vibe      board-vibe.js computes each item's vibe in the background; BoardVibe.text / boardText for chats
// Menus, item looks and arrange live in board-menus.js; export / present / compare / minimap / lenses / search in
// board-more.js; the drawer over any chat in board-drawer.js; chat commands + the board_ MCP tools in board-cmds.js.
// They share internals through Board._ (not a public API).
const Board = (() => {
  const D = BoardData; const V = BoardVibe; const LY = BoardLayout;
  const S = {
    index: null, boards: new Map(), cur: null, sel: new Set(), view: { x: 0, y: 0, z: 1 }, ui: {}, nodes: new Map(),
    undo: [], redo: [], listeners: new Set(), mounted: false, moving: false, hidden: new Set(), queue: [], working: false, alt: false, ctrl: false, space: false,
  };
  const ZMIN = 0.02; const ZMAX = 32; // 2 % … 3200 %
  const fileUrl = (p) => (!p ? '' : /^(data|blob|https?|file):/.test(p) ? p : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);
  const uid = (b) => `i${(b.seq = (b.seq || 0) + 1).toString(36)}`;
  const now = () => Date.now();
  const emit = (what) => { for (const fn of S.listeners) { try { fn(what); } catch (err) { console.warn(err); } } };
  const isMedia = (it) => ['image', 'gif', 'video', 'web'].includes(it.type);
  const KEYS = (k, what, keys) => { try { Keys.add({ area: 'Board', keys: k, what, when: keys }); } catch { /* keys.js not loaded */ } };

  // ---------- storage ----------
  let readyP = null;
  function ready() {
    readyP ||= (async () => {
      const idx = await window.hub.kvGet('boards', null);
      S.index = idx && Array.isArray(idx.list) ? idx : { list: [], current: null, links: {}, prefs: {} };
      S.index.links ||= {}; S.index.prefs ||= {};
      if (!S.index.list.length) await create('My board', { quiet: true, open: false });
      S.cur = await load(S.index.current || S.index.list[0].id) || await load(S.index.list[0].id);
      return S.cur;
    })();
    return readyP;
  }
  const prefs = () => S.index?.prefs || {};
  function setPref(k, v) { S.index.prefs[k] = v; saveIndex(); }
  const saveIndex = debounce(() => window.hub.kvSet('boards', S.index), 300);
  const kvName = (id) => `board-${id}`;
  async function load(id) {
    if (!id) return null;
    if (S.boards.has(id)) return S.boards.get(id);
    const b = await window.hub.kvGet(kvName(id), null);
    if (!b) return null;
    b.items ||= []; b.view ||= { x: 0, y: 0, z: 1 };
    S.boards.set(id, b);
    return b;
  }
  const timers = new Map();
  function save(b = S.cur, { now: at = false } = {}) {
    if (!b) return Promise.resolve();
    b.updated = now();
    const entry = S.index.list.find((e) => e.id === b.id);
    if (entry) {
      entry.name = b.name; entry.updated = b.updated; entry.count = b.items.filter((i) => i.type !== 'frame').length;
      entry.cover = b.items.find((i) => i.tiny || (i.type === 'image' && i.src))?.tiny || null;
      entry.chats = b.chats || [];
    }
    saveIndex();
    clearTimeout(timers.get(b.id));
    const write = () => { timers.delete(b.id); return window.hub.kvSet(kvName(b.id), b); };
    if (at) return write();
    timers.set(b.id, setTimeout(write, 400));
    emit('save');
    return Promise.resolve();
  }
  // write every pending board now (closing / reloading the window)
  function flush() {
    for (const [id, t] of [...timers]) { clearTimeout(t); timers.delete(id); const b = S.boards.get(id); if (b) window.hub.kvSet(kvName(id), b); }
    if (S.index) window.hub.kvSet('boards', S.index);
  }
  addEventListener('beforeunload', flush);
  async function create(name, { quiet = false, template = null, open: openIt = true } = {}) {
    // "New board…" from the rail ▦ menu or Ctrl+K before the board was ever opened: load the boards first
    if (!S.index) await ready();
    const id = `b${now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
    const b = { id, name: String(name || 'Board').slice(0, 60), created: now(), updated: now(), seq: 0, items: [], view: { x: 80, y: 80, z: 0.6 }, chats: [] };
    S.boards.set(id, b);
    S.index.list.unshift({ id, name: b.name, updated: b.updated, count: 0, chats: [] });
    if (template) applyTemplate(template, b);
    await save(b, { now: true });
    if (openIt && S.index) { S.index.current = id; saveIndex(); }
    if (openIt && readyP) await open(id);
    if (!quiet) toast(`New board "${b.name}"`);
    emit('boards');
    return b;
  }
  const findBoard = (q) => {
    if (!q) return S.cur;
    const s = String(q).toLowerCase().trim();
    const e = S.index.list.find((x) => x.id === q) || S.index.list.find((x) => x.name.toLowerCase() === s) || S.index.list.find((x) => x.name.toLowerCase().includes(s));
    return e || null;
  };
  async function open(q) {
    await ready();
    const e = typeof q === 'object' && q?.items ? q : findBoard(q);
    if (!e) return null;
    const b = e.items ? e : await load(e.id);
    if (!b) return null;
    if (S.cur && S.cur !== b) { S.cur.view = { ...S.view }; save(S.cur); }
    S.cur = b; S.index.current = b.id; saveIndex();
    S.sel.clear(); S.undo = []; S.redo = [];
    if (S.mounted) { clearNodes(); S.view = { ...b.view }; applyView(true); renderAll(); applyBg(); renderHud(); setLens(b.lens || null, { quiet: true }); for (const it of b.items) if (needsWork(it) && !it.vibe) queueWork(it, b); }
    emit('open');
    return b;
  }
  async function rename(name, b = S.cur) { if (!name?.trim()) return; b.name = name.trim().slice(0, 60); await save(b); renderHud(); emit('boards'); }
  async function remove(id = S.cur?.id) {
    const e = S.index.list.find((x) => x.id === id); if (!e) return;
    const b = await load(id);
    S.index.list = S.index.list.filter((x) => x.id !== id);
    for (const [chat, bid] of Object.entries(S.index.links)) if (bid === id) delete S.index.links[chat];
    // the board's data stays as kv 'board-<id>' (+ .prev) for an undo; media stays in data/board/media
    if (!S.index.list.length) await create('My board', { quiet: true, open: false });
    if (S.cur?.id === id) await open(S.index.list[0].id);
    saveIndex(); emit('boards');
    toast(`Deleted board "${e.name}"`, { action: { label: 'Undo', fn: async () => { S.index.list.unshift(e); S.boards.set(id, b); await save(b, { now: true }); await open(id); emit('boards'); } } });
  }
  async function duplicate(b = S.cur) {
    const copy = JSON.parse(JSON.stringify(b));
    const n = await create(`${b.name} copy`, { quiet: true, open: false });
    Object.assign(n, { items: copy.items, seq: copy.seq, view: copy.view, bg: copy.bg, lens: copy.lens });
    await save(n, { now: true });
    await open(n.id);
    toast(`Duplicated as "${n.name}"`);
    return n;
  }
  // chats ⇄ boards
  function linkChat(chatId, boardId = S.cur?.id) {
    if (!chatId || !boardId) return;
    S.index.links[chatId] = boardId;
    const b = S.boards.get(boardId);
    if (b) { b.chats = [...new Set([...(b.chats || []), chatId])]; save(b); }
    saveIndex(); emit('links');
  }
  function unlinkChat(chatId) {
    const bid = S.index.links[chatId]; delete S.index.links[chatId];
    const b = S.boards.get(bid); if (b) { b.chats = (b.chats || []).filter((c) => c !== chatId); save(b); }
    saveIndex(); emit('links');
  }
  async function boardFor(chatId) { await ready(); const id = chatId && S.index.links[chatId]; return (id && await load(id)) || S.cur; }

  // ---------- history (undo / redo per board, item snapshots) ----------
  function snapshot() { return JSON.stringify(S.cur.items); }
  function pushUndo(label) {
    S.undo.push({ label, items: snapshot() }); if (S.undo.length > 120) S.undo.shift();
    S.redo = [];
  }
  function undo() { if (!S.undo.length) { toast('Nothing to undo'); return; } const st = S.undo.pop(); S.redo.push({ label: st.label, items: snapshot() }); S.cur.items = JSON.parse(st.items); afterEdit(); toast(`Undid ${st.label}`); }
  function redo() { if (!S.redo.length) { toast('Nothing to redo'); return; } const st = S.redo.pop(); S.undo.push({ label: st.label, items: snapshot() }); S.cur.items = JSON.parse(st.items); afterEdit(); toast(`Redid ${st.label}`); }
  // Every change goes through edit(): one undo step, then the page and storage catch up.
  function edit(label, fn, { undoable = true, b = S.cur, force = false } = {}) {
    if (b?.readonly && !force) { toast(`"${b.name}" is locked (Board menu → Unlock to edit)`); return undefined; }
    if (b === S.cur && undoable) pushUndo(label);
    const r = fn(b);
    if (b === S.cur) afterEdit(); else save(b);
    return r;
  }
  function afterEdit() {
    // connectors whose ends are gone go too
    if (S.cur.items.some((i) => i.type === 'link')) { const ids = new Set(S.cur.items.map((i) => i.id)); S.cur.items = S.cur.items.filter((i) => i.type !== 'link' || (ids.has(i.from) && ids.has(i.to))); }
    for (const id of [...S.sel]) if (!item(id)) S.sel.delete(id);
    if (S.mounted) { renderAll(); updateOverlay(); }
    save();
    emit('items');
  }
  const item = (id, b = S.cur) => b?.items.find((i) => i.id === id) || null;
  const selected = () => S.cur.items.filter((i) => S.sel.has(i.id));

  // ---------- adding things ----------
  const MEDIA_EXT = { image: /\.(png|jpe?g|webp|avif|bmp|svg|ico|tiff?)$/i, gif: /\.gif$/i, video: /\.(mp4|m4v|mov|webm|mkv|ogv|avi)$/i };
  const kindOf = (name, type = '') => (MEDIA_EXT.gif.test(name) || /gif/.test(type) ? 'gif' : MEDIA_EXT.video.test(name) || /^video\//.test(type) ? 'video' : MEDIA_EXT.image.test(name) || /^image\//.test(type) ? 'image' : 'file');
  // where new things land: the drop point, else the middle of the view (board coordinates)
  function center() { const r = S.ui.vp?.getBoundingClientRect(); if (!r) return { x: 0, y: 0 }; return toWorld(r.left + r.width / 2, r.top + r.height / 2); }
  function placeAt(at, i, w = 360) { const p = at || center(); return { x: p.x + i * (w + 30) - (at ? 0 : w / 2), y: p.y - (at ? 0 : w * 0.35), ...(at ? {} : { auto: true }) }; }
  // things added "in the middle" step aside from what's already there (right, then the next row)
  function avoidOverlap(it, b) {
    const hit = (x, y) => b.items.some((o) => o !== it && o.type !== 'frame' && x < o.x + o.w + 12 && x + it.w + 12 > o.x && y < o.y + o.h + 12 && y + it.h + 12 > o.y);
    if (!hit(it.x, it.y)) return;
    const step = Math.max(it.w, 120) + 30; const rowH = Math.max(it.h, 120) + 30;
    for (let k = 1; k < 60; k++) {
      const col = k % 6; const row = Math.floor(k / 6);
      const x = it.x + col * step; const y = it.y + row * rowH;
      if (!hit(x, y)) { it.x = x; it.y = y; return; }
    }
  }
  function newItem(type, props, b = S.cur) {
    const it = { id: uid(b), type, x: 0, y: 0, w: 360, h: 260, rot: 0, added: now(), ...props };
    return it;
  }
  // add(kind, props) for scripts / commands / MCP; returns the item
  function add(type, props = {}, { b = S.cur, select = true, label = `add ${type}` } = {}) {
    const it = newItem(type, props, b);
    if (it.auto) { delete it.auto; if (type !== 'frame') avoidOverlap(it, b); }
    edit(label, (bb) => { if (type === 'frame') bb.items.unshift(it); else bb.items.push(it); }, { b });
    if (b === S.cur && select && S.mounted) { S.sel = new Set([it.id]); updateOverlay(); }
    if (needsWork(it)) queueWork(it, b);
    return it;
  }
  const needsWork = (it) => ['image', 'gif', 'video'].includes(it.type) || (it.type === 'web' && !it.snapped);

  // Files from a drop, a paste or the file picker: copied into the board's media folder first.
  async function addFiles(files, at, b = null) {
    await ready(); b ||= S.cur;
    const out = [];
    let i = 0;
    const batch = `f${now().toString(36)}`; // dropped together: they line up again once their real sizes are known
    for (const f of files) {
      try {
        let src; let name; let type = '';
        if (typeof f === 'string') { const r = await window.hub.board.import(f); if (!r.ok) throw new Error(r.error); src = r.path; name = r.name; }
        else {
          name = f.name || `pasted-${now()}.png`; type = f.type || '';
          const p = window.hub.pathForFile?.(f);
          if (p) { const r = await window.hub.board.import(p); if (!r.ok) throw new Error(r.error); src = r.path; }
          else src = await window.hub.board.save(name, await blobB64(f));
        }
        const kind = kindOf(name, type);
        const pos = placeAt(at, i++);
        out.push(add(kind, { src, title: name.replace(/^(?=[0-9a-z]*\d)[0-9a-z]{10}-(?=.)/, '').replace(/\.[^.]+$/, ''), x: pos.x, y: pos.y, auto: pos.auto, w: 360, h: 260, file: name, batch, flow: true }, { b, select: false, label: 'add files' }));
      } catch (err) { toast(`Couldn't add ${f.name || f}: ${err.message}`, { type: 'error' }); }
    }
    if (b === S.cur && S.mounted && out.length) { S.sel = new Set(out.map((x) => x.id)); updateOverlay(); }
    return out;
  }
  async function blobB64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer()); let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  // A web address: pictures / clips are downloaded, pages become a card with a live snapshot.
  async function addUrl(url, at, b = null) {
    await ready(); b ||= S.cur;
    let u; try { u = new URL(String(url).trim()); } catch { toast('That is not a web address', { type: 'error' }); return null; }
    const kind = kindOf(u.pathname);
    if (/^https?:$/.test(u.protocol) && kind !== 'file') {
      const r = await window.hub.board.fetch(u.href);
      if (r.ok) { const pos = placeAt(at, 0); return add(kind, { src: r.path, title: decodeURIComponent(u.pathname.split('/').pop() || u.hostname), url: u.href, x: pos.x, y: pos.y, auto: pos.auto }, { b }); }
    }
    if (u.protocol === 'file:' && kind !== 'file') return (await addFiles([decodeURIComponent(u.pathname.replace(/^\/([A-Za-z]:)/, '$1'))], at, b))[0];
    const pos = placeAt(at, 0, 400);
    return add('web', { url: u.href, title: u.hostname || 'Page', x: pos.x, y: pos.y, auto: pos.auto, w: 400, h: 300 }, { b, label: 'add website' });
  }
  function addNote(text = '', at, props = {}, b = S.cur) { const pos = placeAt(at, 0, 260); return add('note', { text, style: prefs().noteStyle || 'lemon', x: pos.x, y: pos.y, auto: pos.auto, w: 260, h: 220, ...props }, { b, label: 'add note' }); }
  function addText(text = 'Title', at, props = {}, b = S.cur) { const pos = placeAt(at, 0, 520); return add('text', { text, textStyle: 'clean', fs: 72, x: pos.x, y: pos.y, auto: pos.auto, w: 520, h: 110, ...props }, { b, label: 'add text' }); }
  function addSwatch(colors, at, props = {}, b = S.cur) {
    const list = [].concat(colors).filter(Boolean).map((c) => D.rgbToHex(...D.hexToRgb(c)));
    const pos = placeAt(at, 0, 240);
    return list.length > 1 ? add('palette', { colors: list, title: props.title || 'Palette', x: pos.x, y: pos.y, auto: pos.auto, w: Math.max(300, list.length * 90), h: 200, ...props }, { b, label: 'add palette' })
      : add('swatch', { color: list[0] || '#e6b450', title: props.title || D.colorName(list[0] || '#e6b450'), x: pos.x, y: pos.y, auto: pos.auto, w: 200, h: 240, ...props }, { b, label: 'add color' });
  }
  function addShape(shape = 'rect', at, props = {}, b = S.cur) { const pos = placeAt(at, 0, 240); return add('shape', { shape, color: props.color || '#e6b450', title: (D.SHAPES.find(([id]) => id === shape) || [, 'Shape'])[1], x: pos.x, y: pos.y, auto: pos.auto, w: 240, h: shape === 'pill' ? 110 : 240, ...props }, { b, label: 'add shape' }); }
  function addArrow(kind = 'right', at, props = {}, b = S.cur) { const def = D.ARROWS.find(([id]) => id === kind) || D.ARROWS[0]; const pos = placeAt(at, 0, 320); return add('arrow', { title: def[1], x: pos.x, y: pos.y, auto: pos.auto, w: 320, h: def[2].curve ? 120 : 60, ...def[2], ...props }, { b, label: 'add arrow' }); }
  function addSticker(glyph = '★', at, props = {}, b = S.cur) { const pos = placeAt(at, 0, 120); return add('sticker', { glyph, title: `Sticker ${glyph}`, x: pos.x, y: pos.y, auto: pos.auto, w: 120, h: 120, ...props }, { b, label: 'add sticker' }); }
  function addFrame(props = {}, at, b = S.cur) { const pos = at || placeAt(null, 0, props.w || 800); return add('frame', { title: 'Frame', w: 800, h: 600, x: pos.x, y: pos.y, auto: pos.auto, ...props }, { b, label: 'add frame' }); }

  // Pasted / dropped plain text: a link → card, colors → swatches, anything else → a note.
  function addTextSmart(text, at) {
    const t = String(text || '').trim(); if (!t) return null;
    if (/^(https?|file):\/\/\S+$/i.test(t)) return addUrl(t, at);
    // pack11: a bare address ("example.com/page", "www.site.io") is a website card, and a list of links (one per line)
    // becomes one card each, side by side, instead of a note full of links
    // (a file name like "notes.md" or "image.png" stays a note: www., or a usual web ending, is needed)
    if (/^(www\.[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}|[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|dev|app|co|ai|design|studio|art|me|tv|xyz|gg|so|ly|to|info|site|page|fr|uk|de|nl|es|it|ca|us|be|ch|jp|world|club|online|store|shop|blog|tech|cloud|link|live|fm|is|cc))(:\d+)?(\/\S*)?$/i.test(t)) return addUrl(`https://${t}`, at);
    const lines = t.split(/\s*\n\s*/).filter(Boolean);
    if (lines.length > 1 && lines.length <= 24 && lines.every((l) => /^https?:\/\/\S+$/i.test(l))) {
      const p0 = at || center();
      return Promise.all(lines.map((l, i) => addUrl(l, { x: p0.x + (i % 4) * 440, y: p0.y + Math.floor(i / 4) * 340 })));
    }
    const hexes = t.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi);
    if (hexes && t.replace(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b|[\s,;]/gi, '').length === 0) return addSwatch(hexes, at);
    return addNote(t, at);
  }

  function applyTemplate(tplId, b = S.cur, at) {
    const tpl = typeof tplId === 'object' ? tplId : D.find(D.TEMPLATES, tplId);
    if (!tpl) return null;
    // beside what's already on the board, so nothing ends up "inside" a new frame by accident
    const content = b.items.filter((i) => !i.arrangeLabel);
    const bb = content.length ? LY.bbox(content) : null;
    const origin = at || (bb ? { x: bb.x + bb.w + 240, y: bb.y } : b === S.cur && S.mounted ? center() : { x: 0, y: 0 });
    const frames = LY.templateFrames(tpl, origin.x, origin.y + 260); // room for frame titles, which grow when zoomed out
    const made = [];
    const run = (bb) => {
      if (tpl.title) { const t = newItem('text', { text: tpl.title, textStyle: 'wide', fs: 56, x: origin.x, y: origin.y, w: Math.max(700, tpl.title.length * 40), h: 80 }, bb); bb.items.push(t); made.push(t); }
      for (const f of frames) {
        const fr = newItem('frame', { title: f.title, x: f.x, y: f.y, w: f.w, h: f.h, color: f.color || null }, bb); bb.items.unshift(fr); made.push(fr);
        if (f.note) { const n = newItem('note', { text: f.note, style: 'paper', x: f.x + 20, y: f.y + 20, w: 240, h: 150 }, bb); bb.items.push(n); made.push(n); }
      }
    };
    if (b === S.cur && readyP) edit(`template ${tpl.name}`, run); else run(b);
    if (b === S.cur && S.mounted) { zoomToBox(LY.bbox(made)); }
    return made;
  }

  // ---------- background work: thumbnails, posters, snapshots, vibes (one at a time) ----------
  function queueWork(it, b = S.cur) { S.queue.push({ id: it.id, b }); pump(); }
  async function pump() {
    if (S.working) return;
    S.working = true;
    try {
      while (S.queue.length) {
        const { id, b } = S.queue.shift();
        const it = item(id, b);
        if (!it) continue;
        try { await work(it, b); } catch (err) { it.vibeError = err.message; console.warn('board work', err); }
        if (b === S.cur && S.mounted) { syncItem(it, true); }
        save(b); emit('vibe');
      }
    } finally { S.working = false; }
  }
  const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30)));
  async function imgToJpeg(img, max, q = 0.84) {
    const w = img.naturalWidth || img.videoWidth; const h = img.naturalHeight || img.videoHeight;
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q).split(',')[1];
  }
  async function work(it, b) {
    await idle();
    if (it.type === 'image' || it.type === 'gif') {
      const img = await V.loadImage(fileUrl(it.src));
      const nw = img.naturalWidth; const nh = img.naturalHeight;
      fitNatural(it, nw, nh, b);
      // big pictures get a 1024 and a 256 copy for display; gifs a still poster (they animate on hover only)
      if (Math.max(nw, nh) > 1100 || it.type === 'gif') it.thumb = await window.hub.board.save(`thumb-${it.id}.jpg`, await imgToJpeg(img, 1024));
      if (Math.max(nw, nh) > 300) it.tiny = await window.hub.board.save(`tiny-${it.id}.jpg`, await imgToJpeg(img, 256, 0.78));
      if (it.type === 'gif') it.poster = it.thumb;
      it.vibe = await V.image(fileUrl(it.thumb || it.src));
    } else if (it.type === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.src = fileUrl(it.src);
      await new Promise((resolve, reject) => { v.onloadeddata = resolve; v.onerror = () => reject(new Error('This clip can\'t be played here')); setTimeout(() => reject(new Error('The clip took too long to open')), 20000); });
      fitNatural(it, v.videoWidth || 16, v.videoHeight || 9, b);
      it.duration = Number.isFinite(v.duration) ? v.duration : 0;
      await new Promise((r) => { v.onseeked = r; v.currentTime = Math.min(it.duration * 0.1, 2); setTimeout(r, 2500); });
      it.poster = await window.hub.board.save(`poster-${it.id}.jpg`, await imgToJpeg(v, 1024));
      it.tiny = await window.hub.board.save(`tiny-${it.id}.jpg`, await imgToJpeg(v, 256, 0.78));
      v.removeAttribute('src'); v.load();
      if (b === S.cur && S.mounted) syncItem(it, true);
      it.vibe = await V.video(fileUrl(it.src));
    } else if (it.type === 'web') {
      it.snapping = true;
      if (b === S.cur && S.mounted) syncItem(it, true);
      const r = await window.hub.board.snap(it.url, it.snapSize ? { width: it.snapSize[0], height: it.snapSize[1] } : undefined);
      it.snapping = false; it.snapped = true;
      if (r.ok) {
        Object.assign(it, { title: r.title || it.title, favicon: r.favicon, description: r.description, themeColor: r.themeColor, fonts: r.fonts, snapError: null });
        if (r.shot) {
          it.src = r.shot;
          if (it.snapSize) it.h = Math.round(Math.min(it.w * 2, (it.w * it.snapSize[1]) / it.snapSize[0]) + 34); // the card takes the page's shape
          it.tiny = await window.hub.board.save(`tiny-${it.id}.jpg`, await imgToJpeg(await V.loadImage(fileUrl(r.shot)), 256, 0.78));
          it.vibe = await V.image(fileUrl(r.shot));
        }
      } else {
        it.snapError = r.error || 'offline';
        if (!it.vibe) it.vibe = it.themeColor ? { palette: [{ hex: it.themeColor, share: 1 }], moods: [] } : null;
      }
    }
  }
  function fitNatural(it, nw, nh, b = S.cur) {
    it.natural = [nw, nh];
    if (!it.sized) { const k = Math.min(1, 420 / Math.max(nw, nh)); const s = Math.max(nw, nh) * k < 180 ? 180 / Math.max(nw, nh) : k; it.w = Math.round(nw * s); it.h = Math.round(nh * s); it.sized = true; reflow(b, it.batch); }
  }
  // a dropped batch stays a neat row (until you move one of them)
  function reflow(b, batch) {
    if (!batch) return;
    const list = b.items.filter((i) => i.batch === batch && i.flow).sort((a, c) => a.added - c.added || (a.id < c.id ? -1 : 1));
    if (list.length < 2) return;
    let x = list[0].x;
    for (const i of list) { if (i.x !== x) { i.x = x; if (b === S.cur) syncItem(i); } x += i.w + 30; }
  }
  function reanalyze(ids = [...S.sel]) { for (const id of ids) { const it = item(id); if (it && (isMedia(it))) { if (it.type === 'web') it.snapped = false; it.vibe = null; queueWork(it); } } toast(`Reading the vibe of ${ids.length} item${ids.length === 1 ? '' : 's'}…`); }

  // ---------- view ----------
  const toWorld = (cx, cy) => { const r = S.ui.vp.getBoundingClientRect(); return { x: (cx - r.left - S.view.x) / S.view.z, y: (cy - r.top - S.view.y) / S.view.z }; };
  const toScreen = (x, y) => ({ x: x * S.view.z + S.view.x, y: y * S.view.z + S.view.y });
  let rafView = 0; let lastZoomText = ''; let B_cancelAnim = null;
  // One transform on the world layer + the background pattern; nothing else moves while you pan or zoom.
  function applyView(now0 = false) {
    if (now0) { cancelAnimationFrame(rafView); rafView = 0; writeView(); return; }
    if (rafView) return;
    rafView = requestAnimationFrame(() => { rafView = 0; writeView(); });
  }
  B_cancelAnim = () => { anim = null; };
  function writeView() {
    const { x, y, z } = S.view;
    S.ui.world.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
    // the dot / grid pattern repeats every cell: shift it by the remainder and scale it within one power of two
    const lvl = 2 ** Math.floor(Math.log2(z)); const s = z / lvl; const cell = 24 * s;
    const ox = ((x % cell) + cell) % cell - cell; const oy = ((y % cell) + cell) % cell - cell;
    S.ui.bg.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${s})`;
    const zt = `${z < 0.1 ? (z * 100).toFixed(1) : Math.round(z * 100)}%`;
    if (zt !== lastZoomText) { lastZoomText = zt; S.ui.zoomBtn.textContent = zt; }
    moved();
  }
  let settleT = 0; let cullAt = 0;
  function moved() {
    if (!S.moving) { S.moving = true; S.ui.root.classList.add('bd-moving'); emit('moving'); }
    const t = performance.now();
    if (t - cullAt > 250) { cullAt = t; cull(false); }
    clearTimeout(settleT);
    settleT = setTimeout(settle, 140);
  }
  function settle() {
    S.moving = false;
    S.ui.root.classList.remove('bd-moving');
    S.ui.root.style.setProperty('--inv', String(1 / S.view.z));
    cull(true);
    updateOverlay();
    if (S.cur) { S.cur.view = { ...S.view }; saveViewSoon(); }
    emit('settle');
  }
  const saveViewSoon = debounce(() => save(), 1200);
  // Smooth zoom: the view eases toward a target (wheel steps, buttons); pinches and trackpads apply directly.
  let anim = null;
  function zoomAt(cx, cy, factor, smooth = false) {
    const r = S.ui.vp.getBoundingClientRect();
    const px = cx - r.left; const py = cy - r.top;
    const base = anim ? anim.target : S.view;
    const z = Math.max(ZMIN, Math.min(ZMAX, base.z * factor));
    const target = { z, x: px - ((px - base.x) / base.z) * z, y: py - ((py - base.y) / base.z) * z };
    if (!smooth) { anim = null; S.view = target; applyView(); return; }
    animateTo(target, 'ease');
  }
  function animateTo(target, mode = 'ease') {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { anim = null; S.view = target; writeView(); return; }
    const start = { ...S.view };
    anim = { target, start, t0: performance.now(), mode };
    const step = (t) => {
      if (!anim || anim.target !== target) return;
      const k = Math.min(1, (t - anim.t0) / (mode === 'fly' ? 520 : 180));
      const e = 1 - (1 - k) ** 3;
      // zoom in log space so fly-outs feel even
      const z = Math.exp(Math.log(start.z) + (Math.log(target.z) - Math.log(start.z)) * e);
      const f = (z - start.z) / ((target.z - start.z) || 1);
      const ff = Math.abs(target.z - start.z) > 1e-6 ? f : e;
      S.view = { z, x: start.x + (target.x - start.x) * ff, y: start.y + (target.y - start.y) * ff };
      writeView();
      if (k < 1) requestAnimationFrame(step); else anim = null;
    };
    requestAnimationFrame(step);
  }
  function setZoom(z, smooth = true) { const r = S.ui.vp.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, z / S.view.z, smooth); }
  function zoomToBox(box, pad = 70, smooth = true) {
    if (!S.mounted || !box || !(box.w || box.h)) return;
    const r = S.ui.vp.getBoundingClientRect();
    const t = LY.fitView(box, r.width, r.height, pad, ZMIN, ZMAX);
    if (smooth) animateTo(t, 'fly'); else { anim = null; S.view = t; applyView(true); }
  }
  const zoomFit = (smooth = true) => { const list = S.cur.items.filter((i) => !S.hidden.has(i.id)); if (list.length) zoomToBox(LY.bbox(list), 70, smooth); else { S.view = { x: 80, y: 80, z: 1 }; applyView(); } };
  const zoomSel = () => { const s = selected(); if (s.length) zoomToBox(LY.bbox(s), 90); else zoomFit(); };
  const panBy = (dx, dy) => { anim = null; S.view = { ...S.view, x: S.view.x + dx, y: S.view.y + dy }; applyView(); };

  // ---------- culling + picture size on screen ----------
  const lastOff = new Map();
  function cull(lod) {
    if (!S.mounted || !S.cur) return;
    const r = S.ui.vp.getBoundingClientRect();
    const m = lod ? 0.5 : 1; // a screen of margin while moving (fewer reveals, no holes), half a screen at rest
    const x0 = (-S.view.x - r.width * m) / S.view.z; const y0 = (-S.view.y - r.height * m) / S.view.z;
    const x1 = (r.width * (1 + m) - S.view.x) / S.view.z; const y1 = (r.height * (1 + m) - S.view.y) / S.view.z;
    for (const it of S.cur.items) {
      const node = S.nodes.get(it.id); if (!node) continue;
      const pad = it.rot ? Math.max(it.w, it.h) * 0.42 : 0;
      const off = it.x + it.w + pad < x0 || it.x - pad > x1 || it.y + it.h + pad < y0 || it.y - pad > y1;
      // while moving, only reveal what comes into reach (hiding changes the layer's content: that waits for the settle)
      if (lastOff.get(it.id) !== off && (lod || !off)) { lastOff.set(it.id, off); node.classList.toggle('bd-off', off); if (off) stopPreview(it.id); }
      if (lod && !off) pickSource(it, node);
    }
  }
  // tiny (≤256) / thumb (≤1024) / the file itself, by how many pixels the item covers right now
  function pickSource(it, node) {
    const img = node.__img; if (!img) return;
    const px = Math.max(it.w, it.h) * S.view.z * (window.devicePixelRatio || 1);
    let src;
    if (it.type === 'video' || it.type === 'gif') src = px < 220 && it.tiny ? it.tiny : it.poster || it.thumb || it.tiny;
    else if (it.type === 'web') src = px < 220 && it.tiny ? it.tiny : it.src;
    else src = px < 220 && it.tiny ? it.tiny : px < 900 && it.thumb ? it.thumb : it.src;
    const url = src ? fileUrl(src) : '';
    if (img.__src !== url) { img.__src = url; if (url) img.src = url; else img.removeAttribute('src'); }
  }

  // ---------- rendering (each item's node is written only when something about it changed) ----------
  function clearNodes() { for (const n of S.nodes.values()) n.remove(); S.nodes.clear(); lastOff.clear(); }
  let lastOrder = '';
  function renderAll() {
    if (!S.mounted || !S.cur) return;
    const ids = new Set(S.cur.items.map((i) => i.id));
    // try: a note being edited when it was undone has already been taken out by its own blur handler
    for (const [id, n] of S.nodes) if (!ids.has(id)) { stopPreview(id); try { n.remove(); } catch { /* gone already */ } S.nodes.delete(id); lastOff.delete(id); }
    for (const it of S.cur.items) syncItem(it);
    S.hidden = new Set(S.cur.items.filter((i) => i.hidden).map((i) => i.id));
    Board._.afterRender?.();
    const order = S.cur.items.map((i) => i.id).join(',');
    if (order !== lastOrder) { lastOrder = order; S.ui.world.append(...S.cur.items.map((i) => S.nodes.get(i.id))); }
    S.ui.empty.hidden = S.cur.items.length > 0;
    cull(true);
    emit('render');
  }
  const TYPE_BUILD = {};
  function build(it) {
    const n = el('div', { class: `bd-item bd-t-${it.type}`, dataset: { id: it.id } });
    n.__type = it.type;
    (TYPE_BUILD[it.type] || TYPE_BUILD.file)(n, it);
    if (it.type === 'video' || it.type === 'gif') {
      n.addEventListener('pointerenter', () => { if (!S.moving && !drag) startPreview(it.id); });
      n.addEventListener('pointerleave', () => { if (!S.sel.has(it.id) || S.sel.size > 1) stopPreview(it.id, 120); });
    }
    return n;
  }
  const clipBox = (n) => { const clip = el('div', { class: 'bd-clip' }); n.append(clip); return clip; };
  TYPE_BUILD.image = (n) => { const img = el('img', { class: 'bd-media', draggable: false, decoding: 'async', alt: '' }); n.__img = img; clipBox(n).append(img); };
  TYPE_BUILD.gif = (n) => { TYPE_BUILD.image(n); n.append(el('span', { class: 'bd-badge', text: 'GIF' })); };
  TYPE_BUILD.video = (n) => { TYPE_BUILD.image(n); n.append(el('span', { class: 'bd-badge' })); };
  TYPE_BUILD.web = (n) => {
    const img = el('img', { class: 'bd-media', draggable: false, decoding: 'async', alt: '' }); n.__img = img;
    const clip = clipBox(n); clip.append(img, el('div', { class: 'bd-webph' }));
    n.append(el('div', { class: 'bd-webbar' }, el('img', { class: 'bd-fav', alt: '', draggable: false }), el('span', { class: 'bd-webtitle' }), el('button', { class: 'bd-open', text: '↗', title: 'Open in your browser', on: { pointerdown: (e) => e.stopPropagation(), click: (e) => { e.stopPropagation(); const it = item(n.dataset.id); if (it) window.hub.openExternal(it.url); } } })));
  };
  TYPE_BUILD.note = (n) => { n.append(el('div', { class: 'bd-md body' })); };
  TYPE_BUILD.text = (n) => { n.append(el('div', { class: 'bd-txt' })); };
  TYPE_BUILD.swatch = (n) => { n.append(el('div', { class: 'bd-chip' }), el('div', { class: 'bd-hex' })); };
  TYPE_BUILD.palette = (n) => { n.append(el('div', { class: 'bd-stripes' }), el('div', { class: 'bd-hex' })); };
  TYPE_BUILD.frame = (n) => { n.append(el('div', { class: 'bd-ftitle' })); };
  TYPE_BUILD.shape = (n) => { n.append(el('div', { class: 'bd-shape' })); };
  TYPE_BUILD.sticker = (n) => { n.append(el('div', { class: 'bd-sticker' })); };
  TYPE_BUILD.arrow = (n) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'bd-arrow'); n.append(svg); };
  TYPE_BUILD.link = (n) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'bd-arrow'); n.append(svg); };
  TYPE_BUILD.file = (n) => { n.append(el('div', { class: 'bd-filecard' }, el('span', { class: 'bd-fileicon', text: '📄' }), el('span', { class: 'bd-filename' }))); };

  const cropCss = (c) => {
    if (!c) return null;
    const w = 1 - c.l - c.r; const h = 1 - c.t - c.b;
    return { left: `${(-c.l / w) * 100}%`, top: `${(-c.t / h) * 100}%`, width: `${100 / w}%`, height: `${100 / h}%` };
  };
  function syncItem(it, force = false) {
    if (!S.mounted) return;
    let n = S.nodes.get(it.id);
    if (!n) { n = build(it); S.nodes.set(it.id, n); S.ui.world.append(n); lastOrder = ''; force = true; }
    else if (n.__type !== it.type) { stopPreview(it.id); const nn = build(it); n.replaceWith(nn); S.nodes.set(it.id, nn); lastOff.delete(it.id); n = nn; force = true; } // note ⇄ text (and its undo)
    const key = JSON.stringify([it.x, it.y, it.w, it.h, it.rot, it.opacity, it.blend, it.filter, it.flipX, it.flipY, it.crop, it.radius, it.shadow, it.border, it.locked, it.stamp, it.title, it.text, it.style, it.textStyle, it.fs, it.color, it.colors, it.src, it.thumb, it.tiny, it.poster, it.snapError, it.snapping, it.favicon, it.duration, it.vin, it.vout, it.group, it.tags, it.note, it.align, it.shape, it.heads, it.curve, it.dash, it.width, it.glyph, it.fsz, it.hidden, it.from, it.to, it.label]);
    if (!force && n.__key === key) return;
    n.__key = key;
    n.style.transform = `translate(${it.x}px, ${it.y}px)${it.rot ? ` rotate(${it.rot}deg)` : ''}`;
    n.style.width = `${it.w}px`; n.style.height = `${it.h}px`;
    n.style.opacity = it.opacity != null && it.opacity < 1 ? String(it.opacity) : '';
    n.style.mixBlendMode = it.blend && it.blend !== 'normal' ? it.blend : '';
    n.classList.toggle('bd-locked', Boolean(it.locked));
    n.classList.toggle('bd-hidden', Boolean(it.hidden));
    n.dataset.shadow = it.shadow || ''; n.dataset.border = it.border || ''; n.dataset.radius = it.radius || '';
    const clip = n.querySelector('.bd-clip');
    if (clip) {
      const f = D.FILTERS.find((x) => x.id === it.filter)?.filter || '';
      clip.style.filter = f;
      clip.style.transform = it.flipX || it.flipY ? `scale(${it.flipX ? -1 : 1}, ${it.flipY ? -1 : 1})` : '';
      const media = clip.querySelector('.bd-media');
      if (media) Object.assign(media.style, cropCss(it.crop) || { left: '0', top: '0', width: '100%', height: '100%' });
    }
    let stamp = n.querySelector(':scope > .bd-stamp');
    if (it.stamp) { if (!stamp) { stamp = el('span', { class: 'bd-stamp' }); n.append(stamp); } stamp.textContent = it.stamp; } else stamp?.remove();
    n.title = it.title ? `${it.title}${it.note ? ` · ${it.note}` : ''}` : '';
    SYNC[it.type]?.(n, it);
    if (n.__img && !lastOff.get(it.id)) pickSource(it, n);
  }
  const SYNC = {
    video: (n, it) => { n.querySelector('.bd-badge').textContent = it.duration ? `▶ ${fmtTime(it.vin || 0)}–${fmtTime(it.vout || it.duration)}` : '▶'; n.classList.toggle('bd-pending', !it.poster); },
    gif: (n, it) => n.classList.toggle('bd-pending', !it.poster),
    image: (n, it) => n.classList.toggle('bd-pending', !it.src),
    web: (n, it) => {
      let host = ''; try { host = new URL(it.url).hostname.replace(/^www\./, ''); } catch { /* keep blank */ }
      n.querySelector('.bd-webtitle').textContent = it.title && it.title !== host ? `${it.title} · ${host}` : host || it.url;
      const fav = n.querySelector('.bd-fav'); if (it.favicon && /^(https?|data|file):/.test(it.favicon)) { fav.src = it.favicon; fav.hidden = false; fav.onerror = () => { fav.hidden = true; }; } else fav.hidden = true;
      const ph = n.querySelector('.bd-webph');
      ph.hidden = Boolean(it.src);
      ph.textContent = it.snapping ? 'Taking a snapshot…' : it.snapError ? `${(host[0] || '?').toUpperCase()}` : '';
      ph.title = it.snapError ? `No snapshot (${it.snapError}). Right-click → Refresh snapshot.` : '';
      ph.style.background = it.themeColor || '';
      n.classList.toggle('bd-pending', Boolean(it.snapping));
    },
    note: (n, it) => {
      const st = D.NOTE_STYLES.find((s) => s.id === it.style) || D.NOTE_STYLES[0];
      n.style.setProperty('--note-bg', st.bg); n.style.setProperty('--note-fg', st.fg); n.style.setProperty('--note-font', st.font || 'inherit');
      n.classList.toggle('bd-note-border', Boolean(st.border)); n.classList.toggle('bd-note-lines', Boolean(st.lines));
      n.style.fontSize = it.fsz ? `${it.fsz}px` : '';
      const md = n.querySelector('.bd-md');
      if (md.__text !== it.text) { md.__text = it.text; md.innerHTML = window.renderMarkdown ? window.renderMarkdown(it.text || '') : ''; if (!window.renderMarkdown) md.textContent = it.text || ''; }
    },
    text: (n, it) => {
      const st = D.TEXT_STYLES.find((s) => s.id === it.textStyle) || D.TEXT_STYLES[0];
      const t = n.querySelector('.bd-txt');
      t.removeAttribute('style');
      Object.assign(t.style, st.css);
      t.style.fontSize = st.css.fontSize ? `calc(${it.fs || 64}px * ${parseFloat(st.css.fontSize)})` : `${it.fs || 64}px`;
      if (it.color) t.style.color = it.color;
      t.style.textAlign = it.align || 'left';
      if (t.__text !== it.text && !t.isContentEditable) { t.__text = it.text; t.textContent = it.text || ''; }
    },
    swatch: (n, it) => { n.querySelector('.bd-chip').style.background = it.color; n.querySelector('.bd-hex').textContent = `${it.color}  ${it.title || D.colorName(it.color)}`; },
    palette: (n, it) => {
      const s = n.querySelector('.bd-stripes');
      const k = (it.colors || []).join(',');
      if (s.__k !== k) { s.__k = k; s.replaceChildren(...(it.colors || []).map((c) => el('span', { style: { background: c }, title: `${c} · ${D.colorName(c)}`, dataset: { hex: c } }))); }
      n.querySelector('.bd-hex').textContent = it.title || 'Palette';
    },
    frame: (n, it) => { n.querySelector('.bd-ftitle').textContent = it.title || 'Frame'; n.style.setProperty('--frame', it.color || 'var(--bd-frame)'); },
    file: (n, it) => { n.querySelector('.bd-filename').textContent = it.title || it.file || 'File'; },
    shape: (n, it) => {
      const sh = n.querySelector('.bd-shape'); const def = D.SHAPES.find(([id]) => id === it.shape) || D.SHAPES[0];
      sh.dataset.shape = def[0]; sh.style.clipPath = def[2] || ''; sh.style.setProperty('--shape', it.color || '#e6b450');
    },
    sticker: (n, it) => { const t = n.querySelector('.bd-sticker'); t.textContent = it.glyph || '★'; t.style.fontSize = `${Math.min(it.w, it.h) * 0.82}px`; t.style.color = it.color || ''; },
    arrow: (n, it) => {
      const svg = n.querySelector('svg'); const w = Math.max(10, it.w); const h = Math.max(10, it.h); const sw = it.width || 4; const c = it.color || 'currentColor';
      const mid = h / 2; const heads = it.heads ?? 1; const head = Math.max(10, sw * 3.2);
      const x0 = heads === 2 ? head : 2; const x1 = heads ? w - head : w - 2;
      const path = it.curve ? `M${x0} ${h * 0.8} Q${w / 2} ${-h * 0.4} ${x1} ${h * 0.8}` : `M${x0} ${mid} L${x1} ${mid}`;
      const tip = (x, y, dir) => `<path d="M${x} ${y - head * 0.55} L${x + dir * head} ${y} L${x} ${y + head * 0.55} Z" fill="${c}"/>`;
      const endY = it.curve ? h * 0.8 : mid;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.setAttribute('preserveAspectRatio', 'none');
      svg.innerHTML = `<path d="${path}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"${it.dash ? ` stroke-dasharray="${sw * 3} ${sw * 2.4}"` : ''}/>${heads ? tip(x1, endY, 1) : ''}${heads === 2 ? tip(x0, endY, -1) : ''}`;
    },
  };
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---------- clips play only while hovered / selected and on screen ----------
  const playing = new Map(); // id -> { v, stopT }
  function startPreview(id) {
    const it = item(id); const n = S.nodes.get(id);
    if (!it || !n || lastOff.get(id) || S.moving) return;
    const p = playing.get(id);
    if (p) { clearTimeout(p.stopT); return; }
    if (it.type === 'gif') { const img = n.__img; img.__src = fileUrl(it.src); img.src = img.__src; playing.set(id, { gif: true }); return; }
    if (it.type !== 'video' || !it.src) return;
    // two clips at most: the oldest stops
    if (playing.size >= 2) stopPreview(playing.keys().next().value);
    const v = el('video', { class: 'bd-media bd-live', muted: true, loop: false, playsInline: true, preload: 'auto' });
    v.muted = it.muted !== false;
    v.src = fileUrl(it.src);
    v.defaultPlaybackRate = v.playbackRate = it.speed || 1; // after src: loading resets the rate to the default
    Object.assign(v.style, cropCss(it.crop) || {});
    v.currentTime = it.lastT || it.vin || 0;
    v.addEventListener('timeupdate', () => { const out = it.vout || v.duration; if (v.currentTime >= out - 0.03) { if (it.loop === false) v.pause(); else v.currentTime = it.vin || 0; } });
    v.addEventListener('ended', () => { if (it.loop !== false) { v.currentTime = it.vin || 0; v.play().catch(() => {}); } });
    n.querySelector('.bd-clip').append(v);
    n.classList.add('bd-playing');
    v.play().catch(() => {});
    playing.set(id, { v });
  }
  function stopPreview(id, delay = 0) {
    const p = playing.get(id); if (!p) return;
    clearTimeout(p.stopT);
    const stop = () => {
      playing.delete(id);
      const n = S.nodes.get(id); const it = item(id);
      if (p.gif) { if (n && it) { n.__img.__src = ''; pickSource(it, n); } return; }
      if (it) it.lastT = p.v.currentTime;
      p.v.pause(); p.v.removeAttribute('src'); p.v.load(); p.v.remove();
      n?.classList.remove('bd-playing');
    };
    if (delay) p.stopT = setTimeout(stop, delay); else stop();
  }
  const liveVideo = (id) => playing.get(id)?.v || null;
  function stopAllPreviews() { for (const id of [...playing.keys()]) stopPreview(id); }

  // ---------- selection overlay ----------
  function updateOverlay() {
    if (!S.mounted) return;
    const ov = S.ui.selbox;
    const list = selected();
    S.ui.root.classList.toggle('bd-has-sel', list.length > 0);
    if (!list.length || S.moving) { ov.hidden = true; emit('select'); return; }
    ov.hidden = false;
    const single = list.length === 1 ? list[0] : null;
    const box = single ? { x: single.x, y: single.y, w: single.w, h: single.h } : LY.bbox(list);
    const p = toScreen(box.x, box.y);
    ov.style.transform = `translate(${p.x}px, ${p.y}px)${single?.rot ? ` rotate(${single.rot}deg)` : ''}`;
    ov.style.width = `${box.w * S.view.z}px`; ov.style.height = `${box.h * S.view.z}px`;
    ov.classList.toggle('bd-sel-media', Boolean(single && ['image', 'gif', 'video', 'web'].includes(single.type)));
    ov.classList.toggle('bd-sel-locked', list.some((i) => i.locked));
    S.ui.selInfo.textContent = list.length > 1 ? `${list.length} items` : single ? `${single.title || single.type}${single.type === 'video' && single.duration ? ` · ${fmtTime(single.duration)}` : ''}` : '';
    if (single?.type === 'video') startPreview(single.id);
    emit('select');
  }
  function select(ids, { add: plus = false, toggle = false } = {}) {
    const next = plus || toggle ? new Set(S.sel) : new Set();
    for (const id of [].concat(ids)) {
      const it = item(id); if (!it) continue;
      // a group selects together
      const members = it.group ? S.cur.items.filter((x) => x.group === it.group).map((x) => x.id) : [id];
      for (const m of members) { if (toggle && S.sel.has(id)) next.delete(m); else next.add(m); }
    }
    for (const id of S.sel) if (!next.has(id)) { const it = item(id); if (it?.type === 'video') stopPreview(id, 200); }
    S.sel = next;
    updateOverlay();
  }

  // ---------- pointer: pan, marquee, move (with snapping and smart guides), resize, rotate, crop ----------
  let drag = null;
  const pointers = new Map();
  function onPointerDown(e) {
    if (e.target.closest('.bd-hud, .bd-mini, .bd-search, input, textarea, [contenteditable="true"]')) return;
    S.ui.root.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { startPinch(); return; }
    const handle = e.target.closest('[data-h]')?.dataset.h;
    const node = e.target.closest('.bd-item');
    const w = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || (e.button === 0 && S.space) || (e.button === 0 && prefs().hand)) { e.preventDefault(); drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y }; S.ui.root.classList.add('bd-panning'); capture(e); return; }
    if (e.button !== 0) return;
    if (handle && !S.cur.readonly) { startHandle(handle, e, w); capture(e); return; }
    if (node) {
      const it = item(node.dataset.id);
      if (!it) return;
      // frames are picked by their title or an empty spot inside; items in them stay clickable
      if (!S.sel.has(it.id)) select(it.id, { add: e.shiftKey });
      else if (e.shiftKey) { select(it.id, { toggle: true }); return; }
      if (S.cur.readonly) return;
      const list = selected().filter((i) => !i.locked);
      if (!list.length) return;
      let moving = list;
      if (e.altKey) { moving = duplicateItems(list.map((i) => i.id), 0, { label: 'duplicate (Alt+drag)' }); select(moving.map((i) => i.id)); }
      // a frame carries what sits inside it
      const carried = new Set(moving.map((i) => i.id));
      for (const fr of moving.filter((i) => i.type === 'frame')) for (const c of contents(fr)) if (!c.locked) carried.add(c.id);
      const all = S.cur.items.filter((i) => carried.has(i.id));
      drag = { mode: 'move', sx: w.x, sy: w.y, start: new Map(all.map((i) => [i.id, { x: i.x, y: i.y }])), items: all, box: LY.bbox(moving), lines: snapLines(carried), undoDone: e.altKey, moved: false };
      capture(e);
      return;
    }
    // empty canvas: a marquee (Shift adds to the selection)
    drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, base: e.shiftKey ? new Set(S.sel) : new Set() };
    if (!e.shiftKey) select([]);
    capture(e);
  }
  const capture = (e) => { try { S.ui.vp.setPointerCapture(e.pointerId); } catch { /* fine */ } };
  function onPointerMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) { movePinch(); return; }
    if (!drag) return;
    if (drag.mode === 'pan') { anim = null; S.view = { ...S.view, x: drag.vx + e.clientX - drag.sx, y: drag.vy + e.clientY - drag.sy }; applyView(); return; }
    if (drag.mode === 'marquee') {
      const r = S.ui.vp.getBoundingClientRect();
      const x0 = Math.min(drag.sx, e.clientX) - r.left; const y0 = Math.min(drag.sy, e.clientY) - r.top;
      const mw = Math.abs(e.clientX - drag.sx); const mh = Math.abs(e.clientY - drag.sy);
      Object.assign(S.ui.marquee.style, { transform: `translate(${x0}px, ${y0}px)`, width: `${mw}px`, height: `${mh}px` });
      S.ui.marquee.hidden = mw + mh < 4;
      const a = toWorld(Math.min(drag.sx, e.clientX), Math.min(drag.sy, e.clientY)); const b = toWorld(Math.max(drag.sx, e.clientX), Math.max(drag.sy, e.clientY));
      const hit = S.cur.items.filter((i) => !S.hidden.has(i.id) && i.x < b.x && i.x + i.w > a.x && i.y < b.y && i.y + i.h > a.y && (i.type !== 'frame' || (i.x >= a.x && i.y >= a.y && i.x + i.w <= b.x && i.y + i.h <= b.y)));
      const next = new Set([...drag.base, ...hit.map((i) => i.id)]);
      if ([...next].join() !== [...S.sel].join()) { S.sel = next; updateOverlay(); }
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (drag.mode === 'move') {
      let dx = w.x - drag.sx; let dy = w.y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) * S.view.z < 3) return;
      if (!drag.moved) { drag.moved = true; if (!drag.undoDone) pushUndo('move'); stopAllPreviews(); }
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } // one axis
      const snapped = (e.ctrlKey || e.metaKey) ? { dx, dy, gx: null, gy: null } : snapMove(drag, dx, dy);
      for (const it of drag.items) { const s = drag.start.get(it.id); it.x = s.x + snapped.dx; it.y = s.y + snapped.dy; const n = S.nodes.get(it.id); if (n) n.style.transform = `translate(${it.x}px, ${it.y}px)${it.rot ? ` rotate(${it.rot}deg)` : ''}`; }
      showGuides(snapped.gx, snapped.gy);
      Board._.onMoveFrame?.(drag.items);
      updateOverlay();
      return;
    }
    if (drag.mode === 'resize') return moveResize(drag, w, e);
    if (drag.mode === 'rotate') {
      const it = drag.it; let a = (Math.atan2(w.y - drag.cy, w.x - drag.cx) * 180) / Math.PI + 90;
      if (e.shiftKey || !e.altKey) a = Math.round(a / 15) * 15; // 15° steps unless Alt stays held for free rotation
      it.rot = ((Math.round(a * 10) / 10) % 360 + 360) % 360; if (it.rot > 180) it.rot -= 360;
      syncItem(it); updateOverlay(); return;
    }
    if (drag.mode === 'crop') return moveCrop(drag, w);
  }
  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) { pinch = null; return; }
    if (!drag) return;
    const d = drag; drag = null;
    S.ui.root.classList.remove('bd-panning');
    S.ui.marquee.hidden = true; showGuides(null, null);
    if (d.mode === 'move' && d.moved) { for (const it of d.items) { it.x = Math.round(it.x * 10) / 10; it.y = Math.round(it.y * 10) / 10; delete it.flow; } afterEdit(); }
    else if (['resize', 'rotate', 'crop'].includes(d.mode) && d.changed) afterEdit();
    else if (d.mode === 'move' && !d.moved) { const node = e.target.closest?.('.bd-item'); if (node && !e.shiftKey && S.sel.size > 1 && !item(node.dataset.id)?.group) select(node.dataset.id); }
  }
  // two fingers on a touch screen: zoom + pan
  let pinch = null;
  function startPinch() { drag = null; const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: { ...S.view } }; }
  function movePinch() {
    const [a, b] = [...pointers.values()]; if (!a || !b) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y); const cx = (a.x + b.x) / 2; const cy = (a.y + b.y) / 2;
    const r = S.ui.vp.getBoundingClientRect(); const v = pinch.view;
    const z = Math.max(ZMIN, Math.min(ZMAX, v.z * (d / pinch.d)));
    const wx = (pinch.cx - r.left - v.x) / v.z; const wy = (pinch.cy - r.top - v.y) / v.z;
    S.view = { z, x: cx - r.left - wx * z, y: cy - r.top - wy * z }; applyView();
  }
  function onWheel(e) {
    if (e.target.closest('.bd-hud, .bd-search, .bd-md-edit, textarea')) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    // pinch on a trackpad and Ctrl+wheel zoom; a mouse wheel zooms too (Settings: wheel pans), two fingers pan
    const mouseWheel = e.deltaMode === 1 || (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy));
    if (e.ctrlKey || e.metaKey) { zoomAt(e.clientX, e.clientY, Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.012), false); return; }
    if (mouseWheel && prefs().wheel !== 'pan' && !e.shiftKey) { zoomAt(e.clientX, e.clientY, Math.exp(-Math.max(-240, Math.min(240, dy)) * 0.0022), true); return; }
    if (e.shiftKey && !dx) panBy(-dy, 0); else panBy(-dx, -dy);
  }

  // snapping: edges and centers of what's on screen, 6 screen pixels
  function snapLines(skip) {
    const xs = []; const ys = [];
    for (const it of S.cur.items) {
      if (skip.has(it.id) || lastOff.get(it.id) || S.hidden.has(it.id)) continue;
      xs.push(it.x, it.x + it.w / 2, it.x + it.w); ys.push(it.y, it.y + it.h / 2, it.y + it.h);
    }
    return { xs, ys };
  }
  function snapMove(d, dx, dy) {
    const out = { dx, dy, gx: null, gy: null };
    const grid = prefs().grid ? prefs().gridSize || 20 : 0;
    if (prefs().snap === false && !grid) return out;
    const b = d.box; const th = 6 / S.view.z;
    if (prefs().snap !== false) {
      const best = (cands, lines) => { let r = null; for (const c of cands) for (const l of lines) { const dd = l - c; if (Math.abs(dd) < th && (!r || Math.abs(dd) < Math.abs(r.d))) r = { d: dd, at: l }; } return r; };
      const bx = best([b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx], d.lines.xs); const by = best([b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy], d.lines.ys);
      if (bx) { out.dx += bx.d; out.gx = bx.at; } if (by) { out.dy += by.d; out.gy = by.at; }
    }
    if (grid) { if (out.gx == null) out.dx = Math.round((b.x + dx) / grid) * grid - b.x; if (out.gy == null) out.dy = Math.round((b.y + dy) / grid) * grid - b.y; }
    return out;
  }
  function showGuides(gx, gy) {
    const { gv, gh } = S.ui;
    if (gx == null) gv.hidden = true; else { gv.hidden = false; gv.style.transform = `translateX(${toScreen(gx, 0).x}px)`; }
    if (gy == null) gh.hidden = true; else { gh.hidden = false; gh.style.transform = `translateY(${toScreen(0, gy).y}px)`; }
  }
  // what sits inside a frame (by its center)
  function contents(fr) { return S.cur.items.filter((i) => i !== fr && i.type !== 'frame' && i.x + i.w / 2 >= fr.x && i.x + i.w / 2 <= fr.x + fr.w && i.y + i.h / 2 >= fr.y && i.y + i.h / 2 <= fr.y + fr.h); }
  function frameOf(it) { return S.cur.items.find((f) => f.type === 'frame' && f !== it && it.x + it.w / 2 >= f.x && it.x + it.w / 2 <= f.x + f.w && it.y + it.h / 2 >= f.y && it.y + it.h / 2 <= f.y + f.h) || null; }

  function startHandle(h, e, w) {
    const list = selected().filter((i) => !i.locked); if (!list.length) return;
    pushUndo(h === 'rot' ? 'rotate' : h.startsWith('c') ? 'crop' : 'resize');
    if (h === 'rot') { const it = list[0]; drag = { mode: 'rotate', it, cx: it.x + it.w / 2, cy: it.y + it.h / 2, changed: true }; return; }
    if (h.startsWith('c')) { const it = list[0]; drag = { mode: 'crop', edge: h.slice(1), it, start: { ...it, crop: { l: 0, t: 0, r: 0, b: 0, ...(it.crop || {}) } }, sx: w.x, sy: w.y, changed: true }; return; }
    const box = list.length === 1 ? { x: list[0].x, y: list[0].y, w: list[0].w, h: list[0].h } : LY.bbox(list);
    drag = { mode: 'resize', h, box, sx: w.x, sy: w.y, items: list, start: new Map(list.map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h, fs: i.fs }])), changed: true };
  }
  function moveResize(d, w, e) {
    const { box, h } = d;
    let dx = w.x - d.sx; let dy = w.y - d.sy;
    const keep = d.items.length > 1 || (d.items.length === 1 && isMedia(d.items[0]) ? !e.shiftKey : e.shiftKey);
    const left = h.includes('w'); const top = h.includes('n');
    let nw = Math.max(20, box.w + (left ? -dx : dx)); let nh = Math.max(20, box.h + (top ? -dy : dy));
    if (keep) { const k = Math.max(nw / box.w, nh / box.h); nw = box.w * k; nh = box.h * k; }
    const nx = left ? box.x + box.w - nw : box.x; const ny = top ? box.y + box.h - nh : box.y;
    const sx = nw / box.w; const sy = nh / box.h;
    for (const it of d.items) {
      const s = d.start.get(it.id);
      it.x = nx + (s.x - box.x) * sx; it.y = ny + (s.y - box.y) * sy; it.w = s.w * sx; it.h = s.h * sy;
      if (it.type === 'text' && keep) it.fs = Math.max(6, (s.fs || 64) * sx);
      it.sized = true;
      syncItem(it);
    }
    updateOverlay();
  }
  // crop: an edge moves the visible window over the picture; the picture stays where it is on the board
  function moveCrop(d, w) {
    const it = d.it; const s = d.start; const c = { ...s.crop };
    const fullW = s.w / (1 - c.l - c.r); const fullH = s.h / (1 - c.t - c.b);
    const dx = (w.x - d.sx) / fullW; const dy = (w.y - d.sy) / fullH;
    const lim = (v) => Math.max(0, Math.min(0.95, v));
    if (d.edge === 'l') c.l = lim(Math.min(1 - c.r - 0.05, s.crop.l + dx));
    if (d.edge === 'r') c.r = lim(Math.min(1 - c.l - 0.05, s.crop.r - dx));
    if (d.edge === 't') c.t = lim(Math.min(1 - c.b - 0.05, s.crop.t + dy));
    if (d.edge === 'b') c.b = lim(Math.min(1 - c.t - 0.05, s.crop.b - dy));
    it.crop = c;
    it.x = s.x + (c.l - s.crop.l) * fullW; it.y = s.y + (c.t - s.crop.t) * fullH;
    it.w = fullW * (1 - c.l - c.r); it.h = fullH * (1 - c.t - c.b);
    syncItem(it); updateOverlay();
  }

  // ---------- item operations used by menus, keys and commands ----------
  function duplicateItems(ids, offset = 30, { label = 'duplicate' } = {}) {
    const made = [];
    const groupMap = new Map();
    edit(label, (b) => {
      for (const id of ids) {
        const it = item(id, b); if (!it) continue;
        const c = JSON.parse(JSON.stringify(it));
        c.id = uid(b); c.x += offset; c.y += offset; c.added = now();
        if (c.group) { if (!groupMap.has(c.group)) groupMap.set(c.group, `g${now().toString(36)}${groupMap.size}`); c.group = groupMap.get(c.group); }
        b.items.push(c); made.push(c);
      }
    });
    return made;
  }
  function removeItems(ids = [...S.sel], b = S.cur) {
    const set = new Set(ids); if (!set.size) return 0;
    for (const id of set) stopPreview(id);
    edit(`delete ${set.size}`, (bb) => { bb.items = bb.items.filter((i) => !set.has(i.id)); }, { b });
    return set.size;
  }
  // patch selected (or given) items: one undo step
  function patch(ids, fnOrObj, label = 'change') {
    const list = (ids || [...S.sel]).map((id) => item(id)).filter(Boolean);
    if (!list.length) return 0;
    edit(label, () => { for (const it of list) { if (typeof fnOrObj === 'function') fnOrObj(it); else Object.assign(it, fnOrObj); } });
    return list.length;
  }
  function reorder(how, ids = [...S.sel]) {
    const set = new Set(ids); if (!set.size) return;
    edit('reorder', (b) => {
      const moving = b.items.filter((i) => set.has(i.id)); const rest = b.items.filter((i) => !set.has(i.id));
      if (how === 'front') b.items = [...rest, ...moving];
      else if (how === 'back') { const frames = rest.filter((i) => i.type === 'frame'); b.items = moving.some((i) => i.type === 'frame') ? [...moving, ...rest] : [...frames, ...moving, ...rest.filter((i) => i.type !== 'frame')]; }
      else {
        const arr = [...b.items];
        const idxs = arr.map((x, i) => (set.has(x.id) ? i : -1)).filter((i) => i >= 0);
        if (how === 'forward') for (const i of idxs.reverse()) { if (i < arr.length - 1 && !set.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
        else for (const i of idxs) { if (i > 0 && !set.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; }
        b.items = arr;
      }
    });
  }
  function group(ids = [...S.sel]) { if (ids.length < 2) return toast('Select two or more to group'); const g = `g${now().toString(36)}`; patch(ids, { group: g }, 'group'); toast('Grouped (Ctrl+Shift+G ungroups)'); }
  function ungroup(ids = [...S.sel]) { patch(ids, (i) => { delete i.group; }, 'ungroup'); }
  function frameSelection(ids = [...S.sel], title = 'Frame') {
    const list = ids.map((id) => item(id)).filter(Boolean);
    const b = list.length ? LY.bbox(list) : { ...center(), w: 800, h: 600 };
    return addFrame({ title, x: b.x - 40, y: b.y - 40, w: b.w + 80, h: b.h + 80 });
  }
  function arrange(layoutId, ids) {
    const preset = D.find(D.LAYOUTS, layoutId);
    if (!preset) return 0;
    let list = (ids || [...S.sel]).map((id) => item(id)).filter(Boolean);
    // one frame selected: arrange what's inside it
    if (list.length === 1 && list[0].type === 'frame') { const fr = list[0]; list = contents(fr); if (list.length) { const r = LY.arrange(list, preset, { x: fr.x + 40, y: fr.y + 60 }); applyBoxes(r, `arrange: ${preset.name}`); fitFrame(fr); return list.length; } }
    // one item (or nothing) selected: arrange the whole board (what isn't inside a frame)
    if (list.length < 2) list = S.cur.items.filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.locked && !i.arrangeLabel && !frameOf(i));
    list = list.filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.locked);
    if (!list.length) return 0;
    applyBoxes(LY.arrange(list, preset), `arrange: ${preset.name}`);
    return list.length;
  }
  function applyBoxes({ boxes, labels = [] }, label) {
    edit(label, (b) => {
      // the column titles of an earlier "Columns by …" go when the board is arranged again
      const moved = new Set(Object.keys(boxes));
      if (labels.length || moved.size > 1) b.items = b.items.filter((i) => !i.arrangeLabel);
      for (const [id, bx] of Object.entries(boxes)) { const it = item(id, b); if (it) { Object.assign(it, bx); it.sized = true; delete it.flow; } }
      for (const l of labels) b.items.push(newItem('text', { text: l.text, textStyle: 'label', fs: 56, x: l.x, y: l.y, w: 420, h: 60, arrangeLabel: true }, b));
    });
  }
  function fitFrame(fr) { const c = contents(fr); if (!c.length) return; const b = LY.bbox(c); edit('fit frame', () => Object.assign(fr, { x: b.x - 40, y: b.y - 60, w: b.w + 80, h: b.h + 100 }), { undoable: false }); }

  // ---------- keyboard ----------
  function visible() { return S.mounted && S.ui.root.checkVisibility?.({ visibilityProperty: true }) !== false && S.ui.root.isConnected && H.surfaceIdFor?.(H.activeId) === 'tool:board'; }
  const KEYMAP = []; // [{ test(e), run(e), keys, what }]
  function key(keys, what, test, run) { KEYMAP.push({ keys, what, test, run }); KEYS(keys, what); }
  function onKey(e) {
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    for (const k of KEYMAP) if (k.test(e)) { e.preventDefault(); e.stopPropagation(); k.run(e); return; }
  }
  const K = (code, mods = {}) => (e) => (e.code === code || e.key === code) && Boolean(e.ctrlKey || e.metaKey) === Boolean(mods.ctrl) && Boolean(e.shiftKey) === Boolean(mods.shift) && Boolean(e.altKey) === Boolean(mods.alt);
  function nudge(dx, dy) { if (!S.sel.size) { panBy(-dx * 4, -dy * 4); return; } patch(null, (i) => { if (!i.locked) { i.x += dx; i.y += dy; } }, 'nudge'); }
  function bindKeys() {
    key('Delete / Backspace', 'delete the selection', (e) => (e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey, () => removeItems());
    key('Ctrl+Z', 'undo', K('KeyZ', { ctrl: true }), undo);
    key('Ctrl+Shift+Z / Ctrl+Y', 'redo', (e) => K('KeyZ', { ctrl: true, shift: true })(e) || K('KeyY', { ctrl: true })(e), redo);
    key('Ctrl+A', 'select everything', K('KeyA', { ctrl: true }), () => select(S.cur.items.filter((i) => !S.hidden.has(i.id)).map((i) => i.id)));
    key('Ctrl+D', 'duplicate', K('KeyD', { ctrl: true }), () => { const m = duplicateItems([...S.sel]); select(m.map((i) => i.id)); });
    key('Ctrl+G', 'group the selection', K('KeyG', { ctrl: true }), () => group());
    key('Ctrl+Shift+G', 'ungroup', K('KeyG', { ctrl: true, shift: true }), () => ungroup());
    key('Ctrl+C', 'copy items (paste them in any board)', K('KeyC', { ctrl: true }), () => Board._.copy());
    key('Ctrl+X', 'cut items', K('KeyX', { ctrl: true }), () => { Board._.copy(); removeItems(); });
    key('Ctrl+]  /  Ctrl+[', 'bring to front / send to back', (e) => (e.ctrlKey || e.metaKey) && (e.code === 'BracketRight' || e.code === 'BracketLeft') && !e.altKey, (e) => reorder(e.code === 'BracketRight' ? 'front' : 'back'));
    key(']  /  [', 'bring forward / send backward', (e) => !e.ctrlKey && !e.altKey && !e.metaKey && (e.code === 'BracketRight' || e.code === 'BracketLeft'), (e) => reorder(e.code === 'BracketRight' ? 'forward' : 'backward'));
    key('Arrows (Shift = ×10)', 'nudge the selection (or pan)', (e) => /^Arrow/.test(e.key) && !e.ctrlKey && !e.altKey && !S.presenting, (e) => { const s = e.shiftKey ? 10 : 1; nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0); });
    key('Shift+1', 'zoom to fit everything', (e) => e.shiftKey && e.code === 'Digit1' && !e.ctrlKey && !e.altKey, () => zoomFit());
    key('Shift+2', 'zoom to the selection', (e) => e.shiftKey && e.code === 'Digit2' && !e.ctrlKey && !e.altKey, zoomSel);
    key('Shift+0', 'zoom to 100 %', (e) => e.shiftKey && e.code === 'Digit0' && !e.ctrlKey && !e.altKey, () => setZoom(1));
    key('+  /  −', 'zoom in / out', (e) => !e.ctrlKey && !e.altKey && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_'), (e) => setZoom(S.view.z * (e.key === '-' || e.key === '_' ? 1 / 1.5 : 1.5)));
    key('Ctrl+0', 'zoom to fit (like a browser)', K('Digit0', { ctrl: true }), () => zoomFit());
    key('N', 'new note at the middle', K('KeyN'), () => { const n = addNote(''); setTimeout(() => Board._.editText(n.id), 30); });
    key('T', 'new text', K('KeyT'), () => { const t = addText('Title'); setTimeout(() => Board._.editText(t.id), 30); });
    key('F', 'frame the selection (or a new frame)', K('KeyF'), () => frameSelection());
    key('Enter', 'open / edit the selected item', K('Enter'), () => { const s = selected(); if (s.length === 1) Board._.openItem(s[0]); });
    key('Escape', 'clear the selection', K('Escape'), () => { if (S.sel.size) select([]); });
    key(', / .', 'step a selected clip one frame back / forward', (e) => (e.key === ',' || e.key === '.') && !e.ctrlKey, (e) => Board._.stepFrame?.(e.key === '.' ? 1 : -1));
    key('Space (hold) + drag', 'pan', () => false, () => {});
    KEYS('Middle-drag', 'pan the board'); KEYS('Wheel / pinch', 'zoom where the pointer is'); KEYS('Two-finger scroll', 'pan (trackpad)');
    KEYS('Ctrl+wheel', 'zoom (also the trackpad pinch)'); KEYS('Shift+wheel', 'pan sideways'); KEYS('Drag on empty space', 'select with a box (Shift adds)');
    KEYS('Shift+click', 'add / remove from the selection'); KEYS('Alt+drag', 'duplicate while dragging'); KEYS('Shift+drag', 'move along one axis');
    KEYS('Ctrl+drag', 'move without snapping'); KEYS('Shift+resize', 'free proportions (pictures) / keep them (notes)');
    KEYS('Alt (hold)', 'show rotate and crop handles on the selection'); KEYS('Alt+rotate', 'rotate freely (otherwise 15° steps)');
    KEYS('Ctrl (hold)', 'show the quick bar on the selection (→ chat, vibe, open)'); KEYS('Right-click', 'menus for an item or the board');
    KEYS('Double-click', 'open / edit an item, empty space = new note'); KEYS('Drag a file / link / text in', 'add it to the board');
    KEYS('Ctrl+V', 'paste pictures, links, colors or text');
  }

  // ---------- drops and paste ----------
  async function onDrop(e) {
    const dt = e.dataTransfer; if (!dt) return;
    e.preventDefault();
    if (dt.types.includes('application/x-hearth-ref')) { Board._.dropRef?.(dt.getData('application/x-hearth-ref'), toWorld(e.clientX, e.clientY)); return; } // from the drawer
    S.ui.root.classList.remove('bd-dropping');
    const at = toWorld(e.clientX, e.clientY);
    if (dt.files?.length) { await addFiles([...dt.files], at); return; }
    const url = dt.getData('text/uri-list')?.split('\n').find((l) => l && !l.startsWith('#'));
    if (url) { await addUrl(url.trim(), at); return; }
    const text = dt.getData('text/plain'); if (text) addTextSmart(text, at);
  }
  async function onPaste(e) {
    if (!visible() || e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    // a window open over the board (a capture's annotator or player, a dialog, the drawer, the command bar) keeps
    // its paste: it used to land on the board behind it
    if ([...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal')) || e.target.closest?.('dialog, .bdd, .cmdbar, .keys-sheet')) return;
    const cd = e.clipboardData; if (!cd) return;
    e.preventDefault();
    const files = [...cd.files || []];
    if (files.length) { await addFiles(files); return; }
    const text = cd.getData('text/plain');
    if (Board._.pasteItems?.(text)) return;
    const html = cd.getData('text/html');
    const imgSrc = html && /<img[^>]+src="([^"]+)"/i.exec(html)?.[1];
    if (!text && imgSrc) { await addUrl(imgSrc); return; }
    addTextSmart(text);
  }

  // ---------- mount ----------
  function mount(body) {
    body.classList.add('bd-body');
    const ui = S.ui;
    ui.root = el('div', { class: 'bd-root', tabIndex: 0 });
    ui.vp = el('div', { class: 'bd-vp' });
    ui.bg = el('div', { class: 'bd-bg' });
    ui.world = el('div', { class: 'bd-world' });
    ui.overlay = el('div', { class: 'bd-overlay' });
    ui.marquee = el('div', { class: 'bd-marquee', hidden: true });
    ui.gv = el('div', { class: 'bd-guide bd-gv', hidden: true }); ui.gh = el('div', { class: 'bd-guide bd-gh', hidden: true });
    ui.selInfo = el('span', { class: 'bd-selinfo' });
    const hd = (h, cls = '') => el('div', { class: `bd-h bd-h-${h} ${cls}`, dataset: { h } });
    ui.selbox = el('div', { class: 'bd-selbox', hidden: true },
      hd('nw'), hd('ne'), hd('sw'), hd('se'), hd('rot', 'bd-alt-only'),
      hd('cl', 'bd-crop'), hd('cr', 'bd-crop'), hd('ct', 'bd-crop'), hd('cb', 'bd-crop'), ui.selInfo,
      el('div', { class: 'bd-quick' }));
    ui.empty = el('div', { class: 'bd-empty' }, // one line that teaches, under the board's icon
      (typeof Icons !== 'undefined' && Icons.node('board')) || '', el('b', { text: 'Drop pictures, clips or links — or paste, or + Add' }),
      el('span', { text: 'Right-click for everything else' }));
    ui.empty.querySelector('svg')?.classList.add('p8-ico');
    ui.overlay.append(ui.marquee, ui.gv, ui.gh, ui.selbox);
    ui.vp.append(ui.bg, ui.world, ui.overlay, ui.empty);
    // the few things always on screen: which board, + Add, the zoom
    ui.boardBtn = el('button', { class: 'bd-chip bd-boardbtn', title: 'Boards: switch, new, link to a chat, export…', on: { click: (e) => Board._.boardMenu(e) } });
    ui.addBtn = el('button', { class: 'bd-chip bd-add', text: '+ Add', title: 'Add pictures, clips, a website, a note, colors, a frame or a template', on: { click: (e) => Board._.addMenu(e) } });
    ui.zoomBtn = el('button', { class: 'bd-chip bd-zoom', text: '100%', title: 'Zoom: fit, selection, presets, minimap, background…', on: { click: (e) => Board._.viewMenu(e) } });
    ui.hud = el('div', { class: 'bd-hud' }, ui.boardBtn, el('span', { class: 'spacer' }), ui.addBtn, ui.zoomBtn);
    ui.root.append(ui.vp, ui.hud);
    body.append(ui.root);
    S.mounted = true;

    ui.vp.addEventListener('pointerdown', onPointerDown);
    ui.vp.addEventListener('pointermove', onPointerMove);
    ui.vp.addEventListener('pointerup', onPointerUp);
    ui.vp.addEventListener('pointercancel', onPointerUp);
    ui.vp.addEventListener('wheel', onWheel, { passive: false });
    ui.vp.addEventListener('dblclick', (e) => {
      const node = e.target.closest('.bd-item');
      if (node) { const it = item(node.dataset.id); if (it) Board._.openItem(it, e); return; }
      if (e.target.closest('.bd-hud, .bd-selbox')) return;
      const n = addNote('', toWorld(e.clientX - 130, e.clientY - 40)); setTimeout(() => Board._.editText(n.id), 30);
    });
    ui.vp.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const node = e.target.closest('.bd-item');
      if (node) { if (!S.sel.has(node.dataset.id)) select(node.dataset.id); Board._.itemMenu(e); } else Board._.canvasMenu(e, toWorld(e.clientX, e.clientY));
    });
    ui.root.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/plain' || t === 'application/x-hearth-ref')) { e.preventDefault(); ui.root.classList.add('bd-dropping'); } });
    ui.root.addEventListener('dragleave', (e) => { if (!ui.root.contains(e.relatedTarget)) ui.root.classList.remove('bd-dropping'); });
    ui.root.addEventListener('drop', onDrop);
    ui.root.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    // Alt / Ctrl / Space held: reveal handles, the quick bar, the hand
    const mods = (e) => {
      const alt = e.altKey; const ctrl = e.ctrlKey || e.metaKey;
      if (alt !== S.alt) { S.alt = alt; ui.root.classList.toggle('bd-alt', alt); }
      if (ctrl !== S.ctrl) { S.ctrl = ctrl; ui.root.classList.toggle('bd-ctrl', ctrl); }
    };
    addEventListener('keydown', (e) => {
      if (!visible()) return;
      mods(e);
      if (e.code === 'Space' && !e.repeat && !e.target.closest?.('input, textarea, [contenteditable="true"], button, dialog')) { S.space = true; ui.root.classList.add('bd-hand'); e.preventDefault(); }
    }, true);
    addEventListener('keyup', (e) => { mods(e); if (e.code === 'Space') { S.space = false; ui.root.classList.remove('bd-hand'); } }, true);
    addEventListener('blur', () => { S.alt = S.ctrl = S.space = false; ui.root.classList.remove('bd-alt', 'bd-ctrl', 'bd-hand'); });
    new ResizeObserver(() => { if (S.cur) cull(true); }).observe(ui.vp);
    addEventListener('hearth:view', () => { if (!visible()) stopAllPreviews(); });
    ready().then(() => {
      S.view = { ...(S.cur.view || { x: 80, y: 80, z: 1 }) };
      applyView(true); renderAll(); applyBg(); renderHud();
      setLens(S.cur.lens || null, { quiet: true });
      settle();
      // anything still missing its picture or vibe (closed mid-way last time)
      for (const it of S.cur.items) if (needsWork(it) && (!it.vibe || (it.type === 'web' && !it.snapped))) queueWork(it);
      emit('mount');
    });
  }
  function renderHud() {
    if (!S.mounted || !S.cur) return;
    const k = `${S.cur.readonly ? 1 : 0}|${S.cur.name}`; // (only when it changed: the chip sits over the moving board)
    if (S.ui.boardBtn.__k === k) return;
    S.ui.boardBtn.__k = k;
    const icon = typeof Icons !== 'undefined' ? Icons.node(S.cur.readonly ? 'lock' : 'board') : null;
    icon?.classList.add('p8-ico');
    S.ui.boardBtn.replaceChildren(icon || (S.cur.readonly ? '🔒 ' : '▦ '), document.createTextNode(S.cur.name));
    S.ui.vp.dataset.drop = `Drop to add to "${S.cur.name}"`;
  }
  function applyBg() {
    if (!S.mounted) return;
    const bg = D.BACKGROUNDS.find((b) => b.id === (S.cur?.bg || prefs().bg || 'theme')) || D.BACKGROUNDS[0];
    S.ui.root.dataset.bg = bg.id;
    S.ui.vp.style.background = bg.color || '';
    S.ui.bg.style.background = D.patternCss(bg.id === 'theme' ? { pattern: 'dots', ink: 'color-mix(in srgb, var(--text) 13%, transparent)' } : bg, 24);
  }
  // lenses are drawn by board-more.js
  function setLens(id, opts) { return Board._.setLens?.(id, opts); }

  bindKeys(); // listed in the keys button from the start (they act once the board is open)

  Tools.define({
    id: 'board', name: 'Board', icon: '▦', color: '#e6b450',
    description: 'Mood board: references that give your chats a vibe',
    mount,
    onShow() { if (S.mounted) { requestAnimationFrame(() => { cull(true); S.ui.root.focus({ preventScroll: true }); }); } },
    commands: [
      { label: 'Board: zoom to fit', run: () => { activate('tool:board'); setTimeout(() => zoomFit(), 60); } },
      { label: 'Board: new board', run: async () => { const name = await Modal.prompt('New board', { label: 'Name', value: 'New board' }); if (name) { await create(name); activate('tool:board'); } } },
      { label: 'Board: add a website…', run: () => { activate('tool:board'); setTimeout(() => Board._.askUrl(), 60); } },
      { label: 'Board: add files…', run: () => { activate('tool:board'); setTimeout(() => Board._.pickFiles(), 60); } },
      { label: 'Board: present frames', run: () => { activate('tool:board'); setTimeout(() => Board._.present?.(), 120); } },
    ],
  });

  return {
    ready, open, create, rename, remove, duplicate, load, save, findBoard,
    boards: () => S.index?.list.slice() || [], current: () => S.cur, items: () => S.cur?.items || [], item, selected,
    add, addFiles, addUrl, addNote, addText, addSwatch, addFrame, addShape, addArrow, addSticker, addTextSmart, applyTemplate, removeItems, patch, duplicateItems, reorder, group, ungroup, frameSelection, arrange, applyBoxes,
    select, undo, redo, edit, zoomFit, zoomSel, setZoom, zoomToBox, panBy, linkChat, unlinkChat, boardFor, reanalyze, prefs, setPref, applyBg, contents, frameOf,
    onChange: (fn) => { S.listeners.add(fn); return () => S.listeners.delete(fn); },
    vibeOf: (it) => V.text(it), fileUrl, isMounted: () => S.mounted, visible,
    // shared with board-*.js
    _: { cancelAnim: () => B_cancelAnim?.(), TYPE_BUILD, SYNC, S, D, V, LY, flush, avoidOverlap, item, syncItem, renderAll, updateOverlay, toWorld, toScreen, center, emit, pushUndo, afterEdit, queueWork, startPreview, stopPreview, liveVideo, stopAllPreviews, playing, fileUrl, imgToJpeg, blobB64, applyView, writeView, animateTo, settle, renderHud, uid, newItem, key, KEYS, fmtTime, cropCss, lastOff, isMedia, fitFrame, kindOf, saveIndex },
  };
})();
