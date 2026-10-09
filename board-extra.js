// Mood board, second layer of features (all in menus and chat commands, nothing new on screen): shapes, arrows and
// stickers; hide / info / actual size / fill frame / swap; notes ⇄ text; move or copy to another board; board brief,
// lock and stars; presentation order, auto-advance, start from a frame; Tab through items; a random reference;
// import a folder or a board file; a screenshot of Hearth; copy as an image; tags from the vibe; website snapshot
// sizes; clips: Alt-scrub, one still per shot, a contact sheet; a frame's vibe to a chat; the board to the Lab.
(() => {
  const B = Board; const { S, D, V, LY } = B._;
  const sel = () => B.selected();
  const one = () => (sel().length === 1 ? sel()[0] : null);
  const ids = () => [...S.sel];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- items ----------
  function hide(list = ids()) { const n = B.patch(list, { hidden: true }, 'hide'); B.select([]); toast(`${n} hidden (Board menu → Show hidden)`, { action: { label: 'Undo', fn: B.undo } }); return n; }
  function showHidden() { const list = B.items().filter((i) => i.hidden).map((i) => i.id); if (!list.length) { toast('Nothing hidden'); return 0; } B.patch(list, (i) => { delete i.hidden; }, 'show hidden'); B.select(list); return list.length; }
  function info(it = one()) {
    if (!it) return null;
    const v = it.vibe || {};
    const lines = [
      `Kind: ${V.KIND_WORD[it.type] || it.type}`, it.title && `Name: ${it.title}`, it.url && `Address: ${it.url}`, it.src && `File: ${it.src}`,
      it.natural && `Size: ${it.natural[0]} × ${it.natural[1]} px${v.aspect ? ` (${v.aspect})` : ''}`, it.duration && `Length: ${B._.fmtTime(it.duration)}${v.cutCount != null ? ` · ${v.cutCount} cuts` : ''}`,
      `On the board: ${Math.round(it.w)} × ${Math.round(it.h)} at ${Math.round(it.x)}, ${Math.round(it.y)}${it.rot ? ` · ${it.rot}°` : ''}`,
      it.added && `Added: ${new Date(it.added).toLocaleString()}`, it.tags?.length && `Tags: ${it.tags.map((t) => `#${t}`).join(' ')}`, it.note && `Your note: ${it.note}`,
      it.fonts?.heading && `Fonts: ${[it.fonts.heading, it.fonts.body].filter(Boolean).join(' / ')}`, it.snapError && `Snapshot: ${it.snapError}`, `Id: ${it.id}`,
    ].filter(Boolean);
    Modal.alert(it.title || 'Item', lines.join('\n'));
    return lines;
  }
  function actualSize(list = sel()) { B.patch(list.map((i) => i.id), (i) => { if (i.natural) { const c = i.crop || { l: 0, r: 0, t: 0, b: 0 }; i.w = i.natural[0] * (1 - c.l - c.r); i.h = i.natural[1] * (1 - c.t - c.b); } }, 'actual size'); }
  function resetSize(list = sel()) { B.patch(list.map((i) => i.id), (i) => { const a = i.w / i.h; const k = 420 / Math.max(i.w, i.h); if (k < 1 || Math.max(i.w, i.h) < 180) { i.w = a >= 1 ? 420 : 420 * a; i.h = a >= 1 ? 420 / a : 420; } }, 'reset size'); }
  function fillFrame(it = one()) {
    const fr = it && B.frameOf(it); if (!fr) return toast('Put it inside a frame first');
    const s = LY.fit(it, fr.w - 40, fr.h - 60);
    B.patch([it.id], { x: fr.x + (fr.w - s.w) / 2, y: fr.y + 40 + (fr.h - 60 - s.h) / 2, w: s.w, h: s.h }, 'fill frame');
    return true;
  }
  function swap(list = sel()) {
    if (list.length !== 2) return toast('Select exactly two');
    const [a, b] = list; const pa = { x: a.x + a.w / 2, y: a.y + a.h / 2 }; const pb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    B.patch([a.id, b.id], (i) => { const p = i === a ? pb : pa; i.x = p.x - i.w / 2; i.y = p.y - i.h / 2; }, 'swap');
    return true;
  }
  function convertText(list = sel()) {
    B.patch(list.filter((i) => i.type === 'note' || i.type === 'text').map((i) => i.id), (i) => {
      if (i.type === 'note') { i.type = 'text'; i.textStyle = 'clean'; i.fs = 40; delete i.style; } else { i.type = 'note'; i.style = 'paper'; delete i.textStyle; }
    }, 'convert');
  }
  // move / copy to another board (they keep their vibe, files are shared)
  async function toBoard(boardId, { move = false, list = sel() } = {}) {
    if (!list.length) return 0;
    const target = await B.load(boardId); if (!target || target === S.cur) return 0;
    const spot = target.items.length ? LY.bbox(target.items) : { x: 0, y: 0, w: 0 };
    const bb = LY.bbox(list);
    B.edit(move ? 'move to board' : 'copy to board', () => {
      for (const it of list) { const c = JSON.parse(JSON.stringify(it)); c.id = B._.uid(target); c.x = spot.x + spot.w + 120 + (it.x - bb.x); c.y = spot.y + (it.y - bb.y); delete c.group; target.items.push(c); }
    }, { b: target, undoable: false });
    B.save(target);
    if (move) B.removeItems(list.map((i) => i.id));
    toast(`${move ? 'Moved' : 'Copied'} ${list.length} to "${target.name}"`);
    return list.length;
  }

  // ---------- board: brief, lock, star ----------
  async function brief(text) {
    const b = S.cur;
    const v = text ?? await Modal.prompt('The board\'s brief', { value: b.brief || '', multiline: true, label: 'What this board is for, in your words (chats read it first with the vibe)' });
    if (v == null) return null;
    b.brief = v.trim() || undefined; B.save(); toast(b.brief ? 'Brief saved' : 'Brief cleared');
    return b.brief;
  }
  function lock(on = !S.cur.readonly) { S.cur.readonly = on || undefined; B.save(); B._.renderHud(); toast(on ? 'Board locked: you can look, pan and send vibes; nothing moves' : 'Board unlocked'); return on; }
  function star(id = S.cur.id) { const e = B.boards().find((x) => x.id === id); const live = S.index.list.find((x) => x.id === id); if (!live) return false; live.star = !live.star; S.index.list.sort((a, c) => (c.star ? 1 : 0) - (a.star ? 1 : 0)); B._.saveIndex(); B._.emit('boards'); return live.star && Boolean(e); }

  // ---------- presentation extras ----------
  function presentOrder(dir, fr = one()) {
    if (fr?.type !== 'frame') return toast('Select a frame');
    const list = B._.framesInOrder(); list.forEach((f, i) => { f.order = i; });
    const i = list.indexOf(fr); const j = i + dir; if (j < 0 || j >= list.length) return null;
    B.patch([fr.id, list[j].id], (f) => { f.order = f === fr ? j : i; }, 'presentation order');
    toast(`"${fr.title}" is now ${j + 1} of ${list.length} in the presentation`);
    return j;
  }
  function presentFrom(fr = one()) { const list = B._.stops(); const i = Math.max(0, list.findIndex((st) => st.box === fr || st.items.includes(fr))); return B._.present(i); }
  let autoT = null;
  B.onChange((w) => {
    if (w !== 'settle') return;
    clearTimeout(autoT);
    const sec = B.prefs().presentAuto;
    if (S.presenting && sec) autoT = setTimeout(() => { if (S.presenting) dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); }, sec * 1000);
  });

  // ---------- moving around ----------
  function cycle(dir = 1) {
    const list = B.items().filter((i) => !i.hidden).sort((a, c) => Math.round(a.y / 200) - Math.round(c.y / 200) || a.x - c.x);
    if (!list.length) return null;
    const cur = one(); let i = cur ? list.indexOf(cur) + dir : dir > 0 ? 0 : list.length - 1;
    i = (i + list.length) % list.length;
    B.select(list[i].id);
    if (B._.lastOff.get(list[i].id)) B.zoomSel();
    return list[i];
  }
  function random() {
    const list = B.items().filter((i) => i.type !== 'frame' && !i.hidden && !S.sel.has(i.id));
    if (!list.length) return null;
    const it = list[Math.floor(Math.random() * list.length)];
    B.select(it.id); B.zoomToBox({ x: it.x - it.w * 0.6, y: it.y - it.h * 0.6, w: it.w * 2.2, h: it.h * 2.2 });
    return it;
  }
  B._.key('Tab  /  Shift+Tab', 'select the next / previous item (in reading order)', (e) => e.key === 'Tab' && !e.ctrlKey && !e.altKey, (e) => cycle(e.shiftKey ? -1 : 1));
  B._.key('R', 'a random reference (fresh eyes)', (e) => e.code === 'KeyR' && !e.ctrlKey && !e.altKey && !e.shiftKey, random);
  B._.key('H', 'hide the selection (Board menu → Show hidden)', (e) => e.code === 'KeyH' && !e.ctrlKey && !e.altKey && !e.shiftKey && S.sel.size > 0, () => hide());
  B._.key('I', 'information about the selected item', (e) => e.code === 'KeyI' && !e.ctrlKey && !e.altKey && !e.shiftKey && S.sel.size === 1, () => info());
  B._.key('Ctrl+Shift+C', 'copy the selection (or the board) as a picture', (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyC', () => copyImage());

  // ---------- adding from elsewhere ----------
  const MEDIA = /\.(png|jpe?g|webp|gif|avif|bmp|svg|mp4|mov|webm|m4v|mkv)$/i;
  async function importFolder(dir) {
    dir ||= await window.hub.pickFolder(null, 'Add a folder of pictures and clips');
    if (!dir) return [];
    const files = (await window.hub.fs.list(dir, { recursive: false })).filter((f) => !f.isDir && MEDIA.test(f.name || f.path)).slice(0, 200).map((f) => f.path);
    if (!files.length) { toast('No pictures or clips in that folder'); return []; }
    const made = await B.addFiles(files);
    setTimeout(() => B.arrange('masonry', made.map((i) => i.id)), 1500);
    return made;
  }
  async function importBoardFile(path) {
    path ||= (await window.hub.openDialog({ title: 'Open a board file', filters: [{ name: 'Board', extensions: ['json'] }] }))?.[0];
    if (!path) return null;
    let data; try { data = JSON.parse(await window.hub.fs.read(path)); } catch (err) { toast(`Not a board file: ${err.message}`, { type: 'error' }); return null; }
    if (!Array.isArray(data?.items)) { toast('Not a board file', { type: 'error' }); return null; }
    const b = await B.create(data.name ? `${data.name} (imported)` : 'Imported board', { quiet: true, open: false });
    Object.assign(b, { items: data.items, seq: data.seq || data.items.length + 1, bg: data.bg, lens: data.lens, brief: data.brief });
    await B.save(b, { now: true }); await B.open(b.id);
    toast(`Imported "${b.name}" (${b.items.length} items)`);
    return b;
  }
  async function screenshotHearth() {
    const p = await window.hub.captureWindow();
    const [it] = await B.addFiles([p]);
    if (it) B.patch([it.id], { title: `Hearth ${new Date().toLocaleTimeString()}` }, 'name');
    return it;
  }
  async function copyImage(list = sel().length ? sel() : B.items()) {
    if (!list.length) return false;
    const c = await B._.render(list, { maxSide: 2400 });
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Copied as a picture'); return true; } catch (err) { toast(`Couldn't copy: ${err.message}`, { type: 'error' }); return false; }
  }

  // ---------- vibe helpers ----------
  // tags from what Hearth read: #low-key #warm #muted #busy #fast-cuts…
  function vibeTags(it) {
    const v = it.vibe; if (!v || v.light == null) return [];
    const W = V.words; const t = [W.keyWord(v.light), W.warmWord(v.warmth), v.sat < 0.32 ? 'muted' : v.sat > 0.6 ? 'saturated' : null, v.edges > 0.5 ? 'busy' : v.edges < 0.15 ? 'clean' : null, v.grain > 0.5 ? 'grainy' : null];
    if (v.motion != null) t.push(v.motion > 0.6 ? 'frantic' : v.motion < 0.1 ? 'still' : null, v.pace != null && v.cutCount ? (v.pace < 1 ? 'fast-cuts' : v.pace > 4 ? 'long-takes' : null) : null);
    const c = v.palette?.find((p) => !['black', 'gray', 'white'].includes(D.family(p.hex)))?.hex; if (c) t.push(D.family(c));
    return t.filter((x) => x && x !== 'neutral' && x !== 'mid-key');
  }
  function tagByVibe(list = sel().length ? sel() : B.items()) {
    let n = 0;
    B.patch(list.map((i) => i.id), (i) => { const t = vibeTags(i); if (t.length) { i.tags = [...new Set([...(i.tags || []), ...t])]; n++; } }, 'tags from the vibe');
    toast(n ? `Tagged ${n} item${n === 1 ? '' : 's'} from their vibe` : 'No vibes read yet');
    return n;
  }
  // matches: a #hex finds items with a close color
  const baseMatches = B._.matches;
  B._.matches = (q) => {
    const hex = String(q || '').match(/^#?([0-9a-f]{6})$/i);
    if (!hex) return baseMatches(q);
    const [r, g, b] = D.hexToRgb(`#${hex[1]}`);
    return B.items().filter((it) => (it.type === 'swatch' ? [it.color] : it.type === 'palette' ? it.colors : (it.vibe?.palette || []).filter((p) => p.share >= 0.05).map((p) => p.hex)).some((c) => { const [x, y, z] = D.hexToRgb(c); return Math.hypot(x - r, y - g, z - b) < 60; }));
  };

  // ---------- websites ----------
  function snapAs(sizeId, list = sel().filter((i) => i.type === 'web')) {
    const sz = D.SNAPS.find(([id]) => id === sizeId) || D.SNAPS[0];
    for (const it of list) { it.snapSize = [sz[2], sz[3]]; it.snapped = false; it.snapError = null; B._.queueWork(it); }
    toast(`Taking ${list.length} snapshot${list.length === 1 ? '' : 's'} at ${sz[1]}`);
    return list.length;
  }
  const resnapAll = () => B._.refreshSnapshot(B.items().filter((i) => i.type === 'web').map((i) => i.id));

  // ---------- clips ----------
  // Alt + move over a playing clip scrubs it (left edge = in point, right edge = out point)
  addEventListener('pointermove', (e) => {
    if (!e.altKey || !S.mounted) return;
    const node = e.target.closest?.('.bd-t-video'); if (!node) return;
    const it = B.item(node.dataset.id); const v = B._.liveVideo(it?.id); if (!it || !v) return;
    const r = node.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const a = it.vin || 0; const b = it.vout || v.duration || it.duration || 0;
    v.pause(); v.currentTime = a + (b - a) * f; it.lastT = v.currentTime;
  }, true);
  B._.KEYS('Alt+move over a clip', 'scrub through it (in → out)');
  async function grabAt(it, t) {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = B.fileUrl(it.src);
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('The clip did not load')); });
    await new Promise((r) => { v.onseeked = r; v.currentTime = t; setTimeout(r, 2500); });
    const c = document.createElement('canvas'); const k = Math.min(1, 960 / v.videoWidth); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    v.removeAttribute('src'); v.load();
    return c;
  }
  // one still from the middle of every shot, in a row under the clip
  async function shotsToStills(it = sel().find((i) => i.type === 'video')) {
    if (!it?.vibe) return toast('Select a clip whose vibe was read');
    const cuts = [0, ...(it.vibe.cuts || []), it.duration || it.vibe.duration].filter((x, i, a) => i === 0 || x > a[i - 1]);
    const mids = cuts.slice(0, -1).map((t, i) => (t + cuts[i + 1]) / 2).slice(0, 12);
    const made = [];
    for (const [i, t] of mids.entries()) {
      const c = await grabAt(it, t);
      const p = await window.hub.board.save(`shot-${it.id}-${i + 1}.jpg`, c.toDataURL('image/jpeg', 0.86).split(',')[1]);
      const w = it.w * 0.5; const h = w * (c.height / c.width);
      made.push(B.add('image', { src: p, title: `${it.title || 'clip'} · shot ${i + 1} @ ${B._.fmtTime(t)}`, x: it.x + i * (w + 16), y: it.y + it.h + 40, w, h, sized: true, from: it.id }, { select: false, label: 'shots → stills' }));
    }
    toast(`${made.length} shot${made.length === 1 ? '' : 's'} → stills`);
    return made;
  }
  // a 3 × 2 contact sheet of the clip as one picture
  async function clipSheet(it = sel().find((i) => i.type === 'video')) {
    if (!it) return toast('Select a clip');
    const dur = it.duration || it.vibe?.duration || 1;
    const cw = 320; const ch = Math.round(cw * (it.h / it.w)); const out = document.createElement('canvas');
    out.width = cw * 3 + 16; out.height = (ch + 20) * 2 + 12;
    const ctx = out.getContext('2d'); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, out.width, out.height);
    for (let i = 0; i < 6; i++) {
      const t = (dur * (i + 0.5)) / 6; const c = await grabAt(it, t);
      const x = 4 + (i % 3) * (cw + 4); const y = 4 + Math.floor(i / 3) * (ch + 24);
      ctx.drawImage(c, x, y, cw, ch); ctx.fillStyle = '#ddd'; ctx.font = '13px system-ui'; ctx.fillText(B._.fmtTime(t), x + 4, y + ch + 15);
    }
    const p = await window.hub.board.save(`sheet-${it.id}.jpg`, out.toDataURL('image/jpeg', 0.86).split(',')[1]);
    return B.add('image', { src: p, title: `${it.title || 'clip'} · contact sheet`, x: it.x + it.w + 40, y: it.y, w: it.w * 1.4, h: it.w * 1.4 * (out.height / out.width), sized: true, from: it.id, auto: true }, { label: 'clip contact sheet' });
  }
  // the clips inside a frame play together (four at most) while it's selected
  function playFrame(fr = one()) {
    if (fr?.type !== 'frame') return 0;
    const clips = B.contents(fr).filter((i) => i.type === 'video').slice(0, 4);
    for (const c of clips) { B._.playing.size >= 4 || B._.startPreview(c.id); }
    return clips.length;
  }

  // ---------- chats ----------
  function frameVibe(fr, agentId, focus = 'full') { return BoardDrawer.attach(agentId, { itemIds: B.contents(fr).map((i) => i.id), focus }); }
  async function toLab(focus = 'lab') {
    const dir = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
    // no director yet: say how to get one, with the button (it was a dead end: "No Three Director chat")
    if (!dir) { toast('No Three Director yet: set one up, then send the board\'s vibe again', { timeout: 9000, action: { label: 'Set it up', fn: () => Commands.run?.('director-setup', '', H.claudeAgent()?.id) } }); return null; }
    activate('tool:three');
    await wait(400);
    return BoardDrawer.attach(dir.id, { focus });
  }
  function diff(a, c) {
    const sa = V.summary(a.items); const sc = V.summary(c.items);
    const row = (k, label, word) => (sa[k] == null || sc[k] == null ? null : `${label}: ${word(sa[k])} (${sa[k]}) → ${word(sc[k])} (${sc[k]})${Math.abs(sa[k] - sc[k]) > 0.15 ? ' ⚑' : ''}`);
    const W = V.words;
    return [`"${a.name}" vs "${c.name}"`, `palette: ${sa.palette.slice(0, 4).map((p) => p.hex).join(' ')} → ${sc.palette.slice(0, 4).map((p) => p.hex).join(' ')}`,
      row('light', 'light', W.keyWord), row('contrast', 'contrast', W.contrastWord), row('sat', 'saturation', W.satWord), row('warmth', 'warmth', W.warmWord), row('edges', 'texture', W.edgeWord), row('motion', 'motion', W.motionWord),
      `moods: ${sa.moods.slice(0, 4).join(', ') || '—'} → ${sc.moods.slice(0, 4).join(', ') || '—'}`].filter(Boolean).join('\n');
  }
  function stats(b = S.cur) {
    const items = b.items; const by = {}; for (const i of items) by[i.type] = (by[i.type] || 0) + 1;
    const clips = items.filter((i) => i.type === 'video'); const secs = clips.reduce((a, i) => a + (i.duration || 0), 0);
    const pending = items.filter((i) => ['image', 'gif', 'video'].includes(i.type) && !i.vibe).length;
    return `**${b.name}** · ${items.length} items (${Object.entries(by).map(([k, n]) => `${n} ${V.KIND_WORD[k] || k}${n > 1 ? 's' : ''}`).join(', ')})${clips.length ? ` · ${B._.fmtTime(secs)} of clips` : ''}${pending ? ` · ${pending} vibe${pending > 1 ? 's' : ''} still being read` : ''}${b.chats?.length ? ` · linked to ${b.chats.length} chat${b.chats.length > 1 ? 's' : ''}` : ''}${b.readonly ? ' · locked' : ''}`;
  }

  // ---------- commands ----------
  const defs = [
    { name: 'board-shape', desc: 'A shape on the board: rect, round, circle, pill, triangle, diamond, hexagon, star, blob, frame-line', args: '<shape> [#color]', complete: (a) => D.SHAPES.map(([id, n]) => ({ value: id, hint: n })).filter((x) => x.value.startsWith(a.trim())),
      run: async (args) => { await B.ready(); const [sh, c] = args.trim().split(/\s+/); B.addShape(D.SHAPES.find(([id]) => id === sh)?.[0] || 'rect', null, c ? { color: c } : {}); return 'Shape added.'; } },
    { name: 'board-arrow', desc: 'An arrow or line: right, left, up, down, diag, double, curved, dashed, line, thick', args: '<kind>', complete: (a) => D.ARROWS.map(([id, n]) => ({ value: id, hint: n })).filter((x) => x.value.startsWith(a.trim())),
      run: async (args) => { await B.ready(); B.addArrow(args.trim() || 'right'); return 'Arrow added.'; } },
    { name: 'board-sticker', desc: 'A big sticker / emoji (★ ♥ 🔥 ✨ …)', args: '<sticker>', complete: () => D.STICKERS.map((g) => ({ value: g })), run: async (args) => { await B.ready(); B.addSticker(args.trim() || '★'); return 'Sticker added.'; } },
    { name: 'board-hide', desc: 'Hide the selection (it stays out of the vibe); "show" brings everything back', args: '[show]', run: async (args) => { await B.ready(); if (args.trim() === 'show') return `${showHidden()} shown.`; return `${hide()} hidden.`; } },
    { name: 'board-info', desc: 'Everything about the selected item (file, size, length, cuts, tags…)', run: async () => { await B.ready(); const l = info(); return l ? l.join('\n') : 'Select one item.'; } },
    { name: 'board-move-to', desc: 'Move (or copy) the selection to another board', args: '<board> [copy]', complete: () => B.boards().map((b) => ({ value: b.name })),
      run: async (args) => { await B.ready(); const copy = /\scopy$/.test(args); const e = B.findBoard(args.replace(/\scopy$/, '').trim()); if (!e) return 'No such board.'; const n = await toBoard(e.id, { move: !copy }); return n ? `${copy ? 'Copied' : 'Moved'} ${n} to **${e.name}**.` : 'Select something first (on another board than the target).'; } },
    { name: 'board-brief', desc: 'The board\'s brief: what it is for, in your words (chats read it first)', args: '<text>', run: async (args) => { await B.ready(); const r = await brief(args.trim() || null); return r ? `Brief: ${r}` : 'No brief.'; } },
    { name: 'board-lock', desc: 'Lock / unlock the board (look and send vibes, nothing moves)', args: '[on|off]', complete: () => [{ value: 'on' }, { value: 'off' }], run: async (args) => { await B.ready(); return lock(args.trim() ? args.trim() !== 'off' : undefined) ? 'Locked.' : 'Unlocked.'; } },
    { name: 'board-star', desc: 'Star the board (starred boards come first)', run: async () => { await B.ready(); return star() ? 'Starred.' : 'Unstarred.'; } },
    { name: 'board-random', desc: 'Jump to a random reference (R on the board)', keys: 'R', run: async () => { activate('tool:board'); await B.ready(); await wait(200); const it = random(); return it ? `→ ${it.title || it.type}` : 'The board is empty.'; } },
    { name: 'board-import', desc: 'Add a whole folder of pictures and clips, or open a board file (.json)', args: '[folder|board]', complete: () => [{ value: 'folder' }, { value: 'board' }],
      run: async (args) => { activate('tool:board'); await B.ready(); if (args.trim() === 'board') { const b = await importBoardFile(); return b ? `Imported **${b.name}**.` : null; } const m = await importFolder(); return m.length ? `Added ${m.length} from the folder.` : null; } },
    { name: 'board-screenshot', desc: 'Put a screenshot of Hearth (the whole window) on the board', run: async () => { await B.ready(); const it = await screenshotHearth(); return it ? 'Screenshot added.' : null; } },
    { name: 'board-copy-image', desc: 'Copy the selection (or the whole board) to the clipboard as a picture', keys: 'Ctrl+Shift+C', run: async () => { activate('tool:board'); await B.ready(); await wait(200); return await copyImage() ? 'Copied.' : null; } },
    { name: 'board-autotag', desc: 'Tag the selection (or everything) from its vibe: #low-key #warm #muted #busy #fast-cuts #teal…', run: async () => { activate('tool:board'); await B.ready(); return `Tagged ${tagByVibe()}.`; } },
    { name: 'board-snapshot', desc: 'Take the selected website snapshots again at a size: desktop, laptop, mobile, tablet, tall, wide (all = every site)', args: '<size|all>', complete: () => [...D.SNAPS.map(([id, n]) => ({ value: id, hint: n })), { value: 'all' }],
      run: async (args) => { activate('tool:board'); await B.ready(); if (args.trim() === 'all') { resnapAll(); return 'Refreshing every site.'; } const n = snapAs(args.trim() || 'desktop'); return n ? null : 'Select a website card.'; } },
    { name: 'board-shots', desc: 'One still per shot of the selected clip (from its cuts), in a row under it', run: async () => { activate('tool:board'); await B.ready(); const m = await shotsToStills(); return m?.length ? `${m.length} stills.` : null; } },
    { name: 'board-sheet', desc: 'A contact sheet (6 frames) of the selected clip as a picture', run: async () => { activate('tool:board'); await B.ready(); const it = await clipSheet(); return it ? 'Contact sheet added.' : null; } },
    { name: 'board-to-lab', desc: 'Give the Three Director the board\'s vibe (for a scene: colors, light, motion, texture; never the footage)', args: '[focus]', complete: () => D.FOCUS.map((f) => ({ value: f.id, hint: f.name })),
      run: async (args) => { await B.ready(); const t = await toLab(args.trim() || 'lab'); return t ? 'The Three Director has the board\'s vibe in its message box.' : null; } },
    { name: 'board-diff', desc: 'How two boards differ in vibe (palette, light, contrast, saturation, warmth, texture, motion, mood)', args: '<board> | <board>', complete: () => B.boards().map((b) => ({ value: b.name })),
      run: async (args) => { await B.ready(); const [x, y] = args.split('|').map((q) => q.trim()); const a = x ? await B.load(B.findBoard(x)?.id) : S.cur; const c = y ? await B.load(B.findBoard(y)?.id) : null; if (!a || !c) return 'Like /board-diff Night refs | Day refs'; return diff(a, c); } },
    { name: 'board-stats', desc: 'What\'s on the board (kinds, clip time, vibes being read, links)', run: async () => { await B.ready(); return stats(); } },
    { name: 'board-present-auto', desc: 'Presentation advances by itself every N seconds (0 = by hand)', args: '<seconds>', run: async (args) => { await B.ready(); const n = Math.max(0, Math.min(120, Number(args) || 0)); B.setPref('presentAuto', n || undefined); return n ? `Frames advance every ${n} s.` : 'Advance by hand.'; } },
  ];
  function registerAll() { for (const d of defs) if (!Commands.get(d.name)) Commands.register({ area: 'Board', ...d }); }
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();

  Object.assign(B._, { hide, showHidden, info, actualSize, resetSize, fillFrame, swap, convertText, toBoard, brief, lock, star, presentOrder, presentFrom, cycle, random, importFolder, importBoardFile, screenshotHearth, copyImage, vibeTags, tagByVibe, snapAs, resnapAll, shotsToStills, clipSheet, playFrame, frameVibe, toLab, diff, stats, reduced, extraDefs: defs });
})();
