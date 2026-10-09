// Mood board, fourth layer: connectors that follow the items they join, your own templates and palettes, a picture as
// the board's background, capture straight into the drawer (drop or paste anything on it), references dragged from the
// drawer onto the board, Alt+wheel opacity / Shift+Alt+wheel rotation over the selection, clips play / pause / mute
// together, fit text to its box, Alt+click a palette stripe to copy its hex.
(() => {
  const B = Board; const { S, D, V, LY } = B._;
  const sel = () => B.selected();
  const one = () => (sel().length === 1 ? sel()[0] : null);

  // ---------- connectors ----------
  // a link item: { type: 'link', from, to, heads, dash, curve, color, label }; its box follows its two ends
  function edgePoint(b, tx, ty) {
    const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const dx = tx - cx; const dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const k = Math.min(Math.abs((b.w / 2 + 8) / (dx || 1e-9)), Math.abs((b.h / 2 + 8) / (dy || 1e-9)));
    return { x: cx + dx * Math.min(1, k), y: cy + dy * Math.min(1, k) };
  }
  function ends(l) {
    const a = B.item(l.from); const b = B.item(l.to); if (!a || !b) return null;
    const p = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2); const q = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2);
    return { p, q };
  }
  B._.SYNC.link = (n, l) => {
    const e = ends(l); if (!e) return;
    const pad = 30; const x0 = Math.min(e.p.x, e.q.x) - pad; const y0 = Math.min(e.p.y, e.q.y) - pad;
    const w = Math.abs(e.p.x - e.q.x) + pad * 2; const h = Math.abs(e.p.y - e.q.y) + pad * 2;
    Object.assign(l, { x: x0, y: y0, w, h, rot: 0 });
    n.style.transform = `translate(${x0}px, ${y0}px)`; n.style.width = `${w}px`; n.style.height = `${h}px`;
    const P = { x: e.p.x - x0, y: e.p.y - y0 }; const Q = { x: e.q.x - x0, y: e.q.y - y0 };
    const c = l.color || 'currentColor'; const sw = l.width || 3; const head = Math.max(12, sw * 4);
    const ang = Math.atan2(Q.y - P.y, Q.x - P.x);
    const mx = (P.x + Q.x) / 2 - Math.sin(ang) * (l.curve ? Math.hypot(Q.x - P.x, Q.y - P.y) * 0.2 : 0); const my = (P.y + Q.y) / 2 + Math.cos(ang) * (l.curve ? Math.hypot(Q.x - P.x, Q.y - P.y) * 0.2 : 0);
    const tip = (X, Y, a) => `<path d="M${X} ${Y} L${X - head * Math.cos(a - 0.45)} ${Y - head * Math.sin(a - 0.45)} L${X - head * Math.cos(a + 0.45)} ${Y - head * Math.sin(a + 0.45)} Z" fill="${c}"/>`;
    const endAng = l.curve ? Math.atan2(Q.y - my, Q.x - mx) : ang; const startAng = l.curve ? Math.atan2(P.y - my, P.x - mx) : ang + Math.PI;
    const svg = n.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.innerHTML = `<path d="M${P.x} ${P.y} ${l.curve ? `Q${mx} ${my}` : 'L'} ${Q.x} ${Q.y}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"${l.dash ? ` stroke-dasharray="${sw * 3} ${sw * 2.5}"` : ''}/>${(l.heads ?? 1) ? tip(Q.x, Q.y, endAng) : ''}${l.heads === 2 ? tip(P.x, P.y, startAng) : ''}${l.label ? `<text x="${mx}" y="${my - 8}" text-anchor="middle" fill="${c}" font-size="18" font-family="system-ui">${String(l.label).replace(/[<&>]/g, '')}</text>` : ''}`;
  };
  const links = () => B.items().filter((i) => i.type === 'link');
  B._.afterRender = () => { for (const l of links()) { const n = S.nodes.get(l.id); if (n) B._.SYNC.link(n, l); } };
  B._.onMoveFrame = (moved) => { const ids = new Set(moved.map((i) => i.id)); for (const l of links()) if (ids.has(l.from) || ids.has(l.to)) { const n = S.nodes.get(l.id); if (n) B._.SYNC.link(n, l); } };
  function connect(list = sel().filter((i) => i.type !== 'link'), props = {}) {
    if (list.length < 2) { toast('Select two (or more, in order) to connect'); return []; }
    const made = [];
    B.edit('connect', (b) => {
      for (let i = 0; i < list.length - 1; i++) { const l = B._.newItem('link', { from: list[i].id, to: list[i + 1].id, title: 'Link', ...props }, b); b.items.push(l); made.push(l); }
    });
    return made;
  }
  const LINK_STYLES = [['arrow', 'Arrow', {}], ['both', 'Both ways', { heads: 2 }], ['line', 'Plain line', { heads: 0 }], ['dashed', 'Dashed', { dash: true }], ['curved', 'Curved', { curve: true }], ['bold', 'Bold', { width: 7 }]];

  // ---------- your own templates and palettes ----------
  async function saveTemplate(name) {
    const frames = B.items().filter((i) => i.type === 'frame');
    if (!frames.length) { toast('Add frames first: a template keeps the board\'s frames (and their notes)'); return null; }
    name ||= await Modal.prompt('Save as a template', { value: `${S.cur.name} layout` }); if (!name) return null;
    const bb = LY.bbox(frames);
    const tpl = { id: `mine-${Date.now().toString(36)}`, name, cat: 'Yours', frames: frames.map((f) => [f.title || 'Frame', Math.round(f.w), Math.round(f.h), f.color || undefined]), cols: Math.max(1, Math.round(bb.w / (frames[0].w + 60))), size: [520, 400], notes: {}, title: name, pos: frames.map((f) => [f.x - bb.x, f.y - bb.y]) };
    const mine = await window.hub.kvGet('board-templates', []); mine.unshift(tpl); await window.hub.kvSet('board-templates', mine.slice(0, 60));
    await loadMine(); toast(`Template "${name}" saved (Template › Yours)`);
    return tpl;
  }
  async function savePalette(colors, name) {
    if (!colors?.length) return null;
    name ||= await Modal.prompt('Name this palette', { value: 'My palette' }); if (!name) return null;
    const mine = await window.hub.kvGet('board-palettes', []); mine.unshift({ name, colors, tags: 'yours' }); await window.hub.kvSet('board-palettes', mine.slice(0, 200));
    await loadMine(); toast(`Palette "${name}" saved (Palette library › Yours)`);
    return name;
  }
  async function loadMine() {
    const [tpls, pals] = await Promise.all([window.hub.kvGet('board-templates', []), window.hub.kvGet('board-palettes', [])]);
    D.TEMPLATES.splice(0, D.TEMPLATES.length, ...D.TEMPLATES.filter((t) => t.cat !== 'Yours'), ...tpls);
    D.PALETTES.splice(0, D.PALETTES.length, ...D.PALETTES.filter((p) => p.tags !== 'yours'), ...pals);
  }
  setTimeout(loadMine, 0);
  // a saved template keeps where its frames were
  const baseTemplate = B.applyTemplate;
  B.applyTemplate = (id, b, at) => {
    const t = D.find(D.TEMPLATES, id);
    if (!t?.pos) return baseTemplate(id, b, at);
    const made = baseTemplate(id, b, at);
    const frames = made.filter((m) => m.type === 'frame'); // made in the template's order, like pos
    const o = frames.length ? LY.bbox(frames) : { x: 0, y: 0 };
    B.patch(frames.map((f) => f.id), (f) => { const i = frames.indexOf(f); if (t.pos[i]) { f.x = o.x + t.pos[i][0]; f.y = o.y + t.pos[i][1]; } }, 'template layout');
    return made;
  };

  // ---------- a picture behind the board ----------
  function setBackdrop(it = one()) {
    if (!it || !['image', 'gif', 'web', 'video'].includes(it.type)) { S.cur.backdrop = undefined; B.save(); paintBackdrop(); return null; }
    S.cur.backdrop = it.thumb || it.poster || it.src; B.save(); paintBackdrop();
    toast('Board background set (Board menu → No background picture)');
    return S.cur.backdrop;
  }
  function paintBackdrop() {
    if (!S.mounted) return;
    const p = S.cur?.backdrop;
    S.ui.vp.style.backgroundImage = p ? `linear-gradient(#000a, #000a), url("${B.fileUrl(p)}")` : '';
    S.ui.vp.style.backgroundSize = p ? 'cover' : ''; S.ui.vp.style.backgroundPosition = p ? 'center' : '';
  }
  B.onChange((w) => { if (w === 'open' || w === 'mount') paintBackdrop(); });

  // ---------- clips together ----------
  function clipsInView() { return B.items().filter((i) => i.type === 'video' && !B._.lastOff.get(i.id)); }
  function playAll() { const list = clipsInView().slice(0, 4); for (const c of list) { if (B._.playing.size < 4) B._.startPreview(c.id); } return list.length; }
  function pauseAll() { const n = B._.playing.size; B._.stopAllPreviews(); return n; }
  function muteAll(m = true) { B.patch(B.items().filter((i) => i.type === 'video').map((i) => i.id), { muted: m ? undefined : false }, m ? 'mute clips' : 'clips with sound'); for (const p of B._.playing.values()) if (p.v) p.v.muted = m; }

  // ---------- text fits its box ----------
  function fitText(list = sel().filter((i) => i.type === 'text')) {
    for (const it of list) {
      const t = S.nodes.get(it.id)?.querySelector('.bd-txt'); if (!t) continue;
      let lo = 6; let hi = 600;
      for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; t.style.fontSize = `${mid}px`; if (t.scrollWidth <= it.w + 1 && t.scrollHeight <= it.h + 1) lo = mid; else hi = mid; }
      it.fs = Math.floor(lo);
    }
    B.patch(list.map((i) => i.id), () => {}, 'fit text');
  }

  // ---------- Alt+wheel over the selection: opacity (Shift+Alt: rotate) ----------
  addEventListener('wheel', (e) => {
    if (!e.altKey || !S.mounted || !S.sel.size) return;
    const node = e.target.closest?.('.bd-item'); if (!node || !S.sel.has(node.dataset.id)) return;
    e.preventDefault(); e.stopPropagation();
    const d = Math.sign(e.deltaY);
    if (e.shiftKey) { for (const it of sel()) { it.rot = Math.round(((it.rot || 0) - d * 3) * 10) / 10; B._.syncItem(it); } }
    else for (const it of sel()) { it.opacity = Math.max(0.05, Math.min(1, Math.round(((it.opacity ?? 1) - d * 0.05) * 100) / 100)); if (it.opacity === 1) delete it.opacity; B._.syncItem(it); }
    B._.updateOverlay(); saveSoon();
  }, { passive: false, capture: true });
  const saveSoon = debounce(() => B.save(), 500);
  B._.KEYS('Alt+wheel on the selection', 'opacity up / down'); B._.KEYS('Shift+Alt+wheel on the selection', 'rotate');
  B._.KEYS('Alt+click a palette stripe', 'copy that color');
  addEventListener('click', (e) => {
    if (!e.altKey) return;
    const sp = e.target.closest?.('.bd-stripes span'); if (!sp?.dataset.hex) return;
    e.stopPropagation(); copyText(sp.dataset.hex); toast(`Copied ${sp.dataset.hex}`);
  }, true);
  B._.key('C', 'connect the selected items with arrows (in the order you picked them)', (e) => e.code === 'KeyC' && !e.ctrlKey && !e.altKey && !e.shiftKey && S.sel.size >= 2, () => connect());

  // ---------- references from the drawer onto the board, capture into the drawer ----------
  B._.dropRef = async (data, at) => {
    let ref; try { ref = JSON.parse(data); } catch { return; }
    if (!ref.itemIds?.length) return;
    if (ref.boardId === S.cur.id) { B.select(ref.itemIds); return; }
    const from = await B.load(ref.boardId); if (!from) return;
    const list = ref.itemIds.map((id) => B.item(id, from)).filter(Boolean);
    const bb = LY.bbox(list); const made = [];
    B.edit('copy from another board', (b) => { for (const it of list) { const c = JSON.parse(JSON.stringify(it)); c.id = B._.uid(b); c.x = at.x + (it.x - bb.x); c.y = at.y + (it.y - bb.y); delete c.group; b.items.push(c); made.push(c); } });
    B.select(made.map((i) => i.id));
  };
  const drawerBoard = async () => { const v = document.querySelector('.bdd-head select')?.value; return (v && await B.load(v)) || B.current(); };
  async function captureInto(dt) {
    const b = await drawerBoard();
    const files = [...(dt.files || [])];
    const spot = b.items.length ? (() => { const bb = LY.bbox(b.items); return { x: bb.x + bb.w + 80, y: bb.y }; })() : { x: 0, y: 0 };
    if (b !== B.current()) await B.open(b.id);
    if (files.length) return B.addFiles(files, spot, b);
    const url = dt.getData?.('text/uri-list')?.split('\n').find((l) => l && !l.startsWith('#'));
    if (url) return [await B.addUrl(url.trim(), spot, b)];
    const text = dt.getData?.('text/plain'); if (text) return [B.addTextSmart(text, spot)];
    return [];
  }
  addEventListener('dragover', (e) => { const d = e.target.closest?.('.bdd'); if (d && !e.dataTransfer.types.includes(BoardDrawer.REF_TYPE)) { e.preventDefault(); d.classList.add('bdd-drop-hint'); } });
  addEventListener('dragleave', (e) => { const d = e.target.closest?.('.bdd'); if (d && !d.contains(e.relatedTarget)) d.classList.remove('bdd-drop-hint'); });
  addEventListener('drop', async (e) => {
    const d = e.target.closest?.('.bdd'); if (!d || e.dataTransfer.types.includes(BoardDrawer.REF_TYPE)) return;
    e.preventDefault(); d.classList.remove('bdd-drop-hint');
    const made = await captureInto(e.dataTransfer);
    toast(`Added ${made.filter(Boolean).length} to the board`);
  });
  addEventListener('paste', async (e) => {
    if (!e.target.closest?.('.bdd') || e.target.closest('input')) return;
    e.preventDefault();
    const made = await captureInto(e.clipboardData);
    toast(`Pasted ${made.filter(Boolean).length} into the board`);
  });
  try { Keys.add({ area: 'Board', keys: 'Drop / paste on the drawer', what: 'add it to that board from any chat or tool' }); Keys.add({ area: 'Board', keys: 'Drag a drawer tile onto the board', what: 'copy that reference here' }); } catch { /* no keys.js */ }

  // ---------- menus ----------
  const baseItemMenu = B._.itemMenu;
  B._.itemMenu = (e) => {
    const list = sel();
    if (list.length === 1 && list[0].type === 'link') {
      const l = list[0];
      showMenu(e.clientX, e.clientY, [
        { label: 'Style', items: () => LINK_STYLES.map(([, n, props]) => ({ label: n, action: () => B.patch([l.id], (x) => { for (const k of ['heads', 'dash', 'curve', 'width']) delete x[k]; Object.assign(x, props); }, 'link style') })) },
        { label: 'Label…', action: async () => { const v = await Modal.prompt('Label on the link', { value: l.label || '' }); if (v != null) B.patch([l.id], { label: v || undefined }, 'link label'); } },
        { label: 'Reverse', action: () => B.patch([l.id], (x) => { [x.from, x.to] = [x.to, x.from]; }, 'reverse link') },
        { label: 'Color', items: () => ['#e6b450', '#ff4fd8', '#36d6e7', '#3bd16f', '#ff5a5a', '#ffffff', '#000000'].map((c) => ({ label: `● ${c}`, action: () => B.patch([l.id], { color: c }, 'link color') })) },
        { label: 'Delete  Del', danger: true, action: () => B.removeItems([l.id]) },
      ]);
      return;
    }
    baseItemMenu(e);
  };
  const baseArrange = B._.addItems;
  B._.addItems = (p) => [...baseArrange(p), { label: 'Connect the selected  C', action: () => connect(), more: true }];
  const baseBoard = B._.boardItems;
  B._.boardItems = () => [...baseBoard(),
    { label: 'Save as a template…', action: () => saveTemplate(), more: true },
    { label: S.cur.backdrop ? 'No background picture' : 'Selected picture as the background', action: () => setBackdrop(S.cur.backdrop ? null : one()), more: true }];

  // ---------- commands ----------
  const defs = [
    { name: 'board-connect', desc: 'Connect the selected items with arrows, in the order you picked them (C): arrow, both, line, dashed, curved, bold', args: '[style]', complete: () => LINK_STYLES.map(([id, n]) => ({ value: id, hint: n })),
      run: async (args) => { await B.ready(); const st = LINK_STYLES.find(([id]) => id === args.trim()); const m = connect(undefined, st?.[2] || {}); return m.length ? `${m.length} link${m.length > 1 ? 's' : ''}.` : null; } },
    { name: 'board-save-template', desc: 'Save this board\'s frames as a template of your own', args: '[name]', run: async (args) => { await B.ready(); const t = await saveTemplate(args.trim() || null); return t ? `Template **${t.name}** saved.` : null; } },
    { name: 'board-save-palette', desc: 'Save the selected palette (or the board\'s colors) to your palette library', args: '[name]', run: async (args) => { await B.ready(); const it = one(); const cols = it?.type === 'palette' ? it.colors : it?.type === 'swatch' ? [it.color] : V.summary(B.items()).palette.map((c) => c.hex); const n = await savePalette(cols, args.trim() || null); return n ? `Saved **${n}**.` : null; } },
    { name: 'board-backdrop', desc: 'Use the selected picture as the board\'s background (off removes it)', args: '[off]', run: async (args) => { await B.ready(); const r = setBackdrop(args.trim() === 'off' ? null : one()); return r ? 'Background set.' : 'No background picture.'; } },
    { name: 'board-play', desc: 'Clips in view: play (four at most), pause, mute, sound', args: '[play|pause|mute|sound]', complete: () => ['play', 'pause', 'mute', 'sound'].map((v) => ({ value: v })),
      run: async (args) => { activate('tool:board'); await B.ready(); const w = args.trim() || 'play'; if (w === 'pause') return `Paused ${pauseAll()}.`; if (w === 'mute' || w === 'sound') { muteAll(w === 'mute'); return w === 'mute' ? 'Muted.' : 'Sound on.'; } return `Playing ${playAll()}.`; } },
    { name: 'board-fit-text', desc: 'Make the selected text fill its box', run: async () => { await B.ready(); fitText(); return 'Fitted.'; } },
  ];
  function registerAll() { for (const d of defs) if (!Commands.get(d.name)) Commands.register({ area: 'Board', ...d }); }
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();

  Object.assign(B._, { connect, ends, LINK_STYLES, saveTemplate, savePalette, loadMine, setBackdrop, paintBackdrop, playAll, pauseAll, muteAll, fitText, captureInto, linkDefs: defs });
})();
