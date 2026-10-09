// Mood board menus: right-click an item or the board, the "+ Add", board and zoom chips. Short top levels, details in
// submenus (showMenu items: [...]); rare things behind More…. Also the item actions those menus run: open / edit,
// looks (filters, opacity, blend, corners, shadow, border, flip, rotate, crop), video in / out / loop / frame grab,
// tags, stamps, notes, copy / paste between boards, the vibe card. Everything here is also a chat command (board-cmds.js).
(() => {
  const B = Board; const { S, D, V, LY } = B._;
  const ck = (on, label) => `${on ? '✓ ' : '   '}${label}`;
  const at = (e) => [e?.clientX ?? innerWidth / 2, e?.clientY ?? innerHeight / 3];
  const menu = (e, items) => showMenu(...at(e), items);
  const sel = () => B.selected();
  const one = () => (sel().length === 1 ? sel()[0] : null);
  const ids = () => [...S.sel];
  const nativeAgents = () => H.agents().filter((a) => a.mode === 'native');

  // ---------- open / edit ----------
  function openItem(it, e) {
    if (!it) return;
    if (it.type === 'note' || it.type === 'text') return editText(it.id);
    if (it.type === 'frame') { if (e?.target?.closest?.('.bd-ftitle')) return renameFrame(it); return B.zoomToBox(it); }
    if (it.type === 'web') return livePreview(it);
    if (it.type === 'swatch' || it.type === 'palette') return vibeCard(it);
    if (it.type === 'file') return window.hub.fs.open(it.src);
    return viewLarge(it);
  }
  // a note edits in place (Markdown), a text item in place (plain)
  function editText(id) {
    const it = B.item(id); const n = S.nodes.get(id); if (!it || !n) return;
    B.select(id);
    if (it.type === 'note') {
      const ta = el('textarea', { class: 'bd-md-edit', value: it.text || '', placeholder: 'Write… (Markdown: **bold**, - lists, # titles)' });
      n.append(ta); ta.focus();
      ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      ta.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) ta.blur(); });
      ta.addEventListener('blur', () => { const v = ta.value; ta.remove(); if (v !== (it.text || '')) B.patch([id], { text: v }, 'edit note'); else if (!v) B.removeItems([id]); });
      return;
    }
    if (it.type === 'text') {
      const t = n.querySelector('.bd-txt');
      t.contentEditable = 'true'; t.focus();
      const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r);
      const stop = (ev) => ev.stopPropagation();
      t.addEventListener('pointerdown', stop);
      t.addEventListener('keydown', function k(ev) { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey)) { ev.preventDefault(); t.blur(); } });
      t.addEventListener('blur', () => {
        t.contentEditable = 'false'; t.removeEventListener('pointerdown', stop);
        const v = t.innerText.replace(/\n$/, '');
        const h = Math.max(it.h, t.scrollHeight + 8);
        if (v !== it.text || h !== it.h) B.patch([id], { text: v, h }, 'edit text'); t.__text = v;
      }, { once: true });
    }
  }
  async function renameFrame(fr) { const v = await Modal.prompt('Frame title', { value: fr.title || '' }); if (v != null) B.patch([fr.id], { title: v }, 'rename frame'); }
  // a big look at one picture / clip (Esc closes); clips play with sound controls
  function viewLarge(it) {
    const src = B.fileUrl(it.src || it.thumb);
    const media = it.type === 'video' ? el('video', { src, controls: true, autoplay: true, loop: true }) : el('img', { src, alt: '' });
    if (it.type === 'video') { media.currentTime = it.vin || 0; }
    const wrap = el('div', { class: 'bd-compare' }, el('div', { class: 'bd-cmp-head' }, el('b', { text: it.title || '' }), el('span', { class: 'spacer' }),
      el('button', { text: 'Vibe', on: { click: () => vibeCard(it) } }), el('button', { text: '→ Chat', on: { click: () => sendMenuAt(null, [it.id]) } }), el('button', { text: 'Close (Esc)', on: { click: () => close() } })),
    el('div', { class: 'bd-cmp-stage' }, media));
    const close = () => { media.pause?.(); wrap.remove(); removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    addEventListener('keydown', key, true);
    document.body.append(wrap);
  }
  // a site, live, inside Hearth (its own session; links open in the browser)
  function livePreview(it) {
    const wv = el('webview', { src: it.url, partition: 'board-snap', allowpopups: false, style: { flex: '1', margin: '0 16px 16px', borderRadius: '10px', overflow: 'hidden', background: '#fff' } });
    const wrap = el('div', { class: 'bd-compare' }, el('div', { class: 'bd-cmp-head' }, el('b', { text: it.title || it.url }), el('span', { class: 'spacer' }),
      el('button', { text: '↻ Snapshot again', on: { click: () => { close(); refreshSnapshot([it.id]); } } }), el('button', { text: 'Open in browser', on: { click: () => window.hub.openExternal(it.url) } }), el('button', { text: 'Close (Esc)', on: { click: () => close() } })), wv);
    const close = () => { wrap.remove(); removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    addEventListener('keydown', key, true);
    document.body.append(wrap);
  }
  function refreshSnapshot(list = ids()) { for (const id of list) { const it = B.item(id); if (it?.type === 'web') { it.snapped = false; it.snapError = null; B._.queueWork(it); } } }

  // ---------- the vibe card ----------
  function vibeCard(it) {
    const v = it.vibe || {};
    const pal = it.type === 'swatch' ? [{ hex: it.color, share: 1 }] : it.type === 'palette' ? it.colors.map((hex) => ({ hex, share: 1 / it.colors.length })) : v.palette || [];
    const meter = (label, val, word) => (val == null ? [] : [el('span', { text: label }), el('div', { class: 'bd-meter' }, el('i', { style: { width: `${Math.round(Math.abs(val) * 100)}%` } })), el('span', { text: word || String(val) })]);
    const W = V.words;
    const body = el('div', { class: 'bd-vibe-card' },
      el('div', { class: 'bd-pal' }, pal.map((c) => el('span', { style: { background: c.hex, flex: String(c.share || 1) }, title: `${c.hex} · ${D.colorName(c.hex)}` }))),
      el('div', { class: 'bd-meters' },
        meter('Light', v.light, v.light != null ? W.keyWord(v.light) : ''), meter('Contrast', v.contrast, v.contrast != null ? W.contrastWord(v.contrast) : ''),
        meter('Saturation', v.sat, v.sat != null ? W.satWord(v.sat) : ''), meter('Warmth', v.warmth, v.warmth != null ? W.warmWord(v.warmth) : ''),
        meter('Texture', v.edges, v.edges != null ? W.edgeWord(v.edges) : ''), meter('Grain', v.grain), meter('Negative space', v.space), meter('Symmetry', v.symmetry),
        meter('Motion', v.motion, v.motion != null ? W.motionWord(v.motion) : ''), v.pace != null ? [el('span', { text: 'Pacing' }), el('span', { text: `${v.cutCount} cuts · ≈${v.pace}s per shot` }), el('span')] : []),
      el('pre', { text: V.text(it) }));
    const dlg = el('dialog', { class: 'ui-modal' }, el('form', { method: 'dialog' }, el('h2', { text: `Vibe · ${it.title || it.type}` }), body,
      el('div', { class: 'dialog-actions' }, el('button', { type: 'button', text: 'Copy text', on: { click: () => { copyText(V.text(it)); toast('Vibe copied'); } } }),
        el('button', { type: 'button', text: '→ Chat…', on: { click: (e) => sendMenuAt(e, [it.id]) } }), el('span', { class: 'spacer' }), el('button', { type: 'submit', class: 'primary', text: 'Close' }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
    return body;
  }

  // ---------- send a vibe to a chat ----------
  function sendItems(list) {
    return [
      ...nativeAgents().map((a) => ({ label: a.name, items: D.FOCUS.map((f) => ({ label: f.name, action: () => BoardDrawer.attach(a.id, { itemIds: list, focus: f.id }) })) })),
      { label: 'Copy the vibe text', action: () => { copyText(list.length ? list.map((id) => V.text(B.item(id))).join('\n') : boardText()); toast('Vibe copied'); } },
    ];
  }
  const boardText = (focus = 'full') => BoardDrawer.vibeText({ focus });
  function sendMenuAt(e, list = ids()) { menu(e, sendItems(list)); }

  // ---------- looks ----------
  const LOOK = {
    filter: () => D.FILTERS.map((f) => ({ label: ck((one()?.filter || 'none') === f.id, f.name), action: () => B.patch(null, { filter: f.id === 'none' ? undefined : f.id }, `look: ${f.name}`) })),
    opacity: () => [1, 0.85, 0.7, 0.5, 0.3, 0.15].map((o) => ({ label: ck((one()?.opacity ?? 1) === o, `${Math.round(o * 100)} %`), action: () => B.patch(null, { opacity: o === 1 ? undefined : o }, 'opacity') })),
    blend: () => D.BLENDS.map((m) => ({ label: ck((one()?.blend || 'normal') === m, m), action: () => B.patch(null, { blend: m === 'normal' ? undefined : m }, `blend ${m}`) })),
    corners: () => [['square', 'Square'], ['', 'Slight (default)'], ['soft', 'Soft'], ['round', 'Round'], ['circle', 'Circle / oval']].map(([v, l]) => ({ label: ck((one()?.radius || '') === v, l), action: () => B.patch(null, { radius: v || undefined }, 'corners') })),
    shadow: () => [['', 'None'], ['soft', 'Soft'], ['hard', 'Hard offset'], ['glow', 'Gold glow'], ['float', 'Floating']].map(([v, l]) => ({ label: ck((one()?.shadow || '') === v, l), action: () => B.patch(null, { shadow: v || undefined }, 'shadow') })),
    border: () => [['', 'None'], ['thin', 'Thin line'], ['thick', 'Thick white'], ['polaroid', 'Polaroid'], ['gold', 'Gold']].map(([v, l]) => ({ label: ck((one()?.border || '') === v, l), action: () => B.patch(null, { border: v || undefined }, 'border') })),
    rotate: () => [[90, 'Rotate 90° right'], [-90, 'Rotate 90° left'], [180, 'Rotate 180°'], [15, 'Tilt +15°'], [-15, 'Tilt −15°'], [0, 'Straighten']].map(([d, l]) => ({ label: l, action: () => B.patch(null, (i) => { i.rot = d === 0 ? 0 : (((i.rot || 0) + d + 540) % 360) - 180; }, 'rotate') })),
    crop: () => D.CROPS.map(([l, r]) => ({ label: l, action: () => cropTo(r) })),
  };
  // crop to an aspect ratio, centered (null = back to the whole picture)
  function cropTo(ratio) {
    B.patch(null, (it) => {
      if (!B._.isMedia(it)) return;
      const c0 = it.crop || { l: 0, t: 0, r: 0, b: 0 };
      const fullW = it.w / (1 - c0.l - c0.r); const fullH = it.h / (1 - c0.t - c0.b);
      const fx = it.x - c0.l * fullW; const fy = it.y - c0.t * fullH;
      if (!ratio) { Object.assign(it, { crop: undefined, x: fx, y: fy, w: fullW, h: fullH }); return; }
      const r0 = fullW / fullH; let c;
      if (ratio > r0) { const h = fullW / ratio; const m = (fullH - h) / 2 / fullH; c = { l: 0, r: 0, t: m, b: m }; } else { const w = fullH * ratio; const m = (fullW - w) / 2 / fullW; c = { l: m, r: m, t: 0, b: 0 }; }
      Object.assign(it, { crop: c, x: fx + c.l * fullW, y: fy + c.t * fullH, w: fullW * (1 - c.l - c.r), h: fullH * (1 - c.t - c.b) });
    }, ratio ? 'crop' : 'reset crop');
  }
  const resetLook = () => B.patch(null, (i) => { for (const k of ['filter', 'opacity', 'blend', 'radius', 'shadow', 'border', 'flipX', 'flipY']) delete i[k]; i.rot = 0; }, 'reset look');
  function lookItems() {
    return [
      { label: 'Filter', items: LOOK.filter }, { label: 'Opacity', items: LOOK.opacity }, { label: 'Blend', items: LOOK.blend },
      { label: 'Corners', items: LOOK.corners }, { label: 'Shadow', items: LOOK.shadow }, { label: 'Border', items: LOOK.border },
      { label: 'Rotate', items: LOOK.rotate }, { label: 'Crop', items: LOOK.crop },
      { label: 'Flip horizontally', action: () => B.patch(null, (i) => { i.flipX = !i.flipX; }, 'flip') },
      { label: 'Flip vertically', action: () => B.patch(null, (i) => { i.flipY = !i.flipY; }, 'flip') },
      { label: 'Reset the look', action: resetLook },
    ];
  }

  // ---------- video on the board ----------
  const vidNow = (it) => B._.liveVideo(it.id)?.currentTime ?? it.lastT ?? 0;
  function videoItems(it) {
    const live = B._.liveVideo(it.id);
    return [
      { label: live && !live.paused ? 'Pause' : 'Play', action: () => { B._.startPreview(it.id); const v = B._.liveVideo(it.id); if (v) { if (v.paused) v.play().catch(() => {}); else v.pause(); } } },
      { label: `Set in point here (${B._.fmtTime(vidNow(it))})`, action: () => B.patch([it.id], { vin: Math.max(0, vidNow(it)) }, 'clip in point') },
      { label: `Set out point here (${B._.fmtTime(vidNow(it))})`, action: () => B.patch([it.id], { vout: vidNow(it) > (it.vin || 0) ? vidNow(it) : undefined }, 'clip out point') },
      { label: 'Clear in / out', action: () => B.patch([it.id], { vin: undefined, vout: undefined }, 'clear in / out') },
      { label: ck(it.loop !== false, 'Loop'), action: () => B.patch([it.id], { loop: it.loop === false ? undefined : false }, 'loop') },
      { label: ck(it.muted === false, 'Sound'), action: () => { B.patch([it.id], { muted: it.muted === false ? undefined : false }, 'sound'); const v = B._.liveVideo(it.id); if (v) v.muted = it.muted !== false; } },
      { label: 'Speed', items: () => [0.25, 0.5, 0.75, 1, 1.5, 2, 4].map((s) => ({ label: ck((it.speed || 1) === s, `${s}×`), action: () => { B.patch([it.id], { speed: s === 1 ? undefined : s }, 'speed'); const v = B._.liveVideo(it.id); if (v) v.playbackRate = s; } })) },
      { label: 'Frame grab → a still on the board', action: () => frameGrab(it) },
      { label: 'Use this frame as the poster', action: () => posterHere(it) },
      { label: 'Step one frame forward  .', action: () => stepFrame(1, it) },
      { label: 'Step one frame back  ,', action: () => stepFrame(-1, it) },
      { label: 'One still per shot', action: () => B._.shotsToStills(it) },
      { label: 'Contact sheet (6 frames)', action: () => B._.clipSheet(it) },
      { label: 'Open in Video Review', action: async () => { activate('tool:ae'); await Review.ensureMounted?.(); Review.open(it.src); } },
    ];
  }
  // a frame of a clip as a picture (the clip's current time, or its in point)
  async function grabCanvas(it, t) {
    let v = B._.liveVideo(it.id); let temp = false;
    if (!v || t != null) {
      v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = B.fileUrl(it.src); temp = true;
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('The clip did not load')); });
      await new Promise((r) => { v.onseeked = r; v.currentTime = t ?? it.lastT ?? it.vin ?? 0; setTimeout(r, 2500); });
    }
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const time = v.currentTime;
    if (temp) { v.removeAttribute('src'); v.load(); }
    return { c, time };
  }
  async function frameGrab(it, t) {
    const { c, time } = await grabCanvas(it, t);
    const path = await window.hub.board.save(`grab-${it.id}-${time.toFixed(2)}s.png`, c.toDataURL('image/png').split(',')[1]);
    const still = B.add('image', { src: path, title: `${it.title || 'clip'} @ ${B._.fmtTime(time)}`, x: it.x + it.w + 30, y: it.y, w: it.w, h: it.h, sized: true, from: it.id, auto: true }, { label: 'frame grab' });
    toast('Frame grabbed as a still');
    return still;
  }
  async function posterHere(it) {
    const { c } = await grabCanvas(it);
    const p = await window.hub.board.save(`poster-${it.id}.jpg`, c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    B.patch([it.id], { poster: p }, 'poster');
  }
  function stepFrame(dir, it = B.selected().find((i) => i.type === 'video')) {
    if (!it) return;
    B._.startPreview(it.id);
    const v = B._.liveVideo(it.id); if (!v) return;
    v.pause();
    const fps = it.fps || 30;
    v.currentTime = Math.max(0, v.currentTime + dir / fps);
    it.lastT = v.currentTime;
  }

  // ---------- notes / text ----------
  function textItems(it) {
    if (it.type === 'note') return [{ label: 'Edit  Enter', action: () => editText(it.id) }, { label: 'Note color', items: () => D.NOTE_STYLES.map((s) => ({ label: ck(it.style === s.id, s.name), action: () => B.patch(null, { style: s.id }, 'note color') })) }, { label: 'Text size', items: () => D.NOTE_SIZES.map(([, n, px]) => ({ label: ck((it.fsz || 17) === px, n), action: () => B.patch(null, { fsz: px === 17 ? undefined : px }, 'note text size') })) }];
    return [
      { label: 'Edit  Enter', action: () => editText(it.id) },
      { label: 'Text style', items: () => D.TEXT_STYLES.map((s) => ({ label: ck(it.textStyle === s.id, s.name), action: () => B.patch(null, { textStyle: s.id }, 'text style') })) },
      { label: 'Size', items: () => [24, 36, 48, 64, 96, 128, 180, 240].map((s) => ({ label: ck(Math.round(it.fs || 64) === s, `${s}`), action: () => B.patch(null, (i) => { const k = s / (i.fs || 64); i.fs = s; i.h = Math.max(40, i.h * k); i.w = Math.max(80, i.w * k); }, 'text size') })) },
      { label: 'Align', items: () => ['left', 'center', 'right'].map((a) => ({ label: ck((it.align || 'left') === a, a), action: () => B.patch(null, { align: a }, 'align text') })) },
      { label: 'Color', items: () => colorChoices((c) => B.patch(null, { color: c || undefined }, 'text color')) },
    ];
  }
  // the board's own colors first, then a few basics
  function colorChoices(fn) {
    const pal = V.summary(B.items()).palette.map((c) => c.hex);
    return [{ label: 'Default', action: () => fn(null) }, ...[...new Set([...pal, '#ffffff', '#000000', '#e6b450', '#ff4fd8', '#36d6e7'])].slice(0, 12).map((c) => ({ label: `● ${c}  ${D.colorName(c)}`, action: () => fn(c) })), { label: 'Pick…', action: async () => { const v = await pickColor(); if (v) fn(v); } }];
  }
  function pickColor(value = '#e6b450') {
    return new Promise((resolve) => {
      const inp = el('input', { type: 'color', value, style: { position: 'fixed', left: '-100px', top: '0' } });
      document.body.append(inp);
      inp.addEventListener('change', () => { resolve(inp.value); inp.remove(); });
      inp.addEventListener('blur', () => setTimeout(() => { if (inp.isConnected) { inp.remove(); resolve(null); } }, 300));
      inp.click();
    });
  }

  // ---------- tags, stamps, notes on items ----------
  const allTags = () => [...new Set(B.items().flatMap((i) => i.tags || []))].sort();
  function tagItems() {
    const list = sel();
    return [
      ...allTags().map((t) => { const on = list.every((i) => i.tags?.includes(t)); return { label: ck(on, `#${t}`), action: () => B.patch(null, (i) => { const s = new Set(i.tags || []); if (on) s.delete(t); else s.add(t); i.tags = [...s]; }, `tag #${t}`) }; }),
      { label: 'New tag…', action: async () => { const t = await Modal.prompt('Tag', { placeholder: 'e.g. night, hero, type' }); if (t) addTag(t); } },
      { label: 'Clear tags', action: () => B.patch(null, (i) => { delete i.tags; }, 'clear tags') },
    ];
  }
  const cleanTag = (t) => String(t).trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase().slice(0, 30);
  function addTag(t, list) { const tag = cleanTag(t); if (!tag) return 0; return B.patch(list, (i) => { i.tags = [...new Set([...(i.tags || []), tag])]; }, `tag #${tag}`); }
  const stampItems = () => [...D.STAMPS.map(([s, name]) => ({ label: ck(one()?.stamp === s, `${s}  ${name}`), action: () => B.patch(null, { stamp: s }, `stamp ${name}`) })), { label: 'No stamp', action: () => B.patch(null, { stamp: undefined }, 'remove stamp') }];
  async function editNote(list = ids()) {
    const it = B.item(list[0]);
    const v = await Modal.prompt('Your note on it', { value: it?.note || '', multiline: true, label: 'What you like about it (chats read this with the vibe)' });
    if (v != null) B.patch(list, { note: v.trim() || undefined }, 'note');
  }
  async function renameItems(list = ids()) { const it = B.item(list[0]); const v = await Modal.prompt('Name', { value: it?.title || '' }); if (v != null) B.patch(list, { title: v.trim() || undefined }, 'rename'); }

  // ---------- copy / paste between boards ----------
  const CLIP_MARK = 'hearth-board-items:';
  let clip = null;
  function copy() {
    const list = sel(); if (!list.length) return;
    clip = JSON.parse(JSON.stringify(list));
    copyText(`${CLIP_MARK}${list.length}\n${list.map((i) => V.text(i)).join('\n')}`);
    toast(`Copied ${list.length} item${list.length === 1 ? '' : 's'} (paste on any board; in a chat it pastes their vibe)`);
  }
  function pasteItems(text, atPt) {
    if (!clip || !String(text || '').startsWith(CLIP_MARK)) return false;
    const b = LY.bbox(clip); const p = atPt || B._.center();
    const made = [];
    B.edit('paste', (bb) => { for (const it of clip) { const c = JSON.parse(JSON.stringify(it)); c.id = B._.uid(bb); c.x = p.x + (it.x - b.x) - b.w / 2; c.y = p.y + (it.y - b.y) - b.h / 2; bb.items.push(c); made.push(c); } });
    B.select(made.map((i) => i.id));
    return true;
  }

  // ---------- similar / palette card ----------
  function findSimilar(it = one()) {
    if (!it?.vibe) return toast('No vibe on this one yet', { type: 'error' });
    const hits = B.items().filter((x) => x !== it && x.vibe && V.distance(it.vibe, x.vibe) < 0.3);
    B.select([it.id, ...hits.map((h) => h.id)]);
    toast(hits.length ? `${hits.length} similar item${hits.length === 1 ? '' : 's'} selected` : 'Nothing close enough');
    return hits;
  }
  function paletteCard(list = sel()) {
    const pal = list.length === 1 && list[0].vibe?.palette ? list[0].vibe.palette : V.mergePalettes(list.map((i) => i.vibe?.palette || []));
    if (!pal.length) return toast('No colors read yet', { type: 'error' });
    const src = list.length ? LY.bbox(list) : B._.center();
    return B.addSwatch(pal.map((c) => c.hex), { x: (src.x || 0) + (src.w || 0) + 40, y: src.y || 0 }, { title: list.length === 1 ? `${list[0].title || 'Item'} palette` : 'Palette', auto: true });
  }

  // ---------- the item menu ----------
  function itemMenu(e) {
    const list = sel(); const it = list.length === 1 ? list[0] : null;
    if (!list.length) return;
    const primary = [];
    if (it) {
      if (it.type === 'video') primary.push({ label: 'Watch large', action: () => viewLarge(it) }, { label: 'Clip', items: () => videoItems(it) });
      else if (it.type === 'image' || it.type === 'gif') primary.push({ label: 'View large', action: () => viewLarge(it) });
      else if (it.type === 'web') primary.push({ label: 'Open in browser', action: () => window.hub.openExternal(it.url) }, { label: 'Live preview', action: () => livePreview(it) }, { label: 'Refresh snapshot', action: () => refreshSnapshot([it.id]) }, { label: 'Snapshot at', items: () => D.SNAPS.map(([id, n]) => ({ label: n, action: () => B._.snapAs(id, [it]) })) }, { label: 'Copy the address', action: () => { copyText(it.url); toast('Copied'); } });
      else if (it.type === 'note' || it.type === 'text') primary.push(...textItems(it), { label: it.type === 'note' ? 'Turn into big text' : 'Turn into a note', action: () => B._.convertText([it]) });
      else if (it.type === 'shape') primary.push({ label: 'Shape', items: () => D.SHAPES.map(([id, n]) => ({ label: ck(it.shape === id, n), action: () => B.patch(null, { shape: id }, 'shape') })) }, { label: 'Color', items: () => colorChoices((c) => B.patch(null, { color: c || undefined }, 'shape color')) });
      else if (it.type === 'arrow') primary.push({ label: 'Arrow', items: () => D.ARROWS.map(([, n, props]) => ({ label: n, action: () => B.patch(null, (a) => { for (const k of ['heads', 'curve', 'dash', 'width']) delete a[k]; Object.assign(a, props); }, 'arrow') })) }, { label: 'Color', items: () => colorChoices((c) => B.patch(null, { color: c || undefined }, 'arrow color')) });
      else if (it.type === 'sticker') primary.push({ label: 'Sticker', items: () => D.STICKERS.map((g) => ({ label: ck(it.glyph === g, g), action: () => B.patch(null, { glyph: g, title: `Sticker ${g}` }, 'sticker') })) }, { label: 'Color', items: () => colorChoices((c) => B.patch(null, { color: c || undefined }, 'sticker color')) });
      else if (it.type === 'frame') primary.push({ label: 'Zoom to frame', action: () => B.zoomToBox(it) }, { label: 'Rename…', action: () => renameFrame(it) }, { label: 'Frame color', items: () => D.FRAME_COLORS.map(([n, c]) => ({ label: ck((it.color || null) === c, n), action: () => B.patch([it.id], { color: c || undefined }, 'frame color') })) }, { label: 'Arrange inside', items: () => layoutItems([it.id]) }, { label: 'Fit to its contents', action: () => B._.fitFrame(it) },
        { label: 'Send this frame\'s vibe', items: () => nativeAgents().map((a) => ({ label: a.name, items: D.FOCUS.map((f) => ({ label: f.name, action: () => B._.frameVibe(it, a.id, f.id) })) })) },
        { label: 'Presentation', items: () => [{ label: 'Present from here', action: () => B._.presentFrom(it) }, { label: 'Earlier', action: () => B._.presentOrder(-1, it) }, { label: 'Later', action: () => B._.presentOrder(1, it) }, { label: 'Play its clips', action: () => B._.playFrame(it) }] });
      else if (it.type === 'swatch' || it.type === 'palette') primary.push({ label: 'Copy hex', action: () => { copyText((it.colors || [it.color]).join(' ')); toast('Copied'); } }, { label: 'Harmonies', items: () => D.HARMONIES.map((h) => ({ label: h.name, action: () => B.addSwatch(D.harmony(h.id, it.color || it.colors[0]), { x: it.x, y: it.y + it.h + 40 }, { title: h.name }) })) }, { label: 'Change color…', action: async () => { const c = await pickColor(it.color || it.colors[0]); if (c) B.patch([it.id], it.type === 'swatch' ? { color: c, title: D.colorName(c) } : { colors: [c, ...it.colors.slice(1)] }, 'color'); } });
    }
    if (list.length === 2) primary.push({ label: 'Compare the two', action: () => Board._.compare?.(list[0], list[1]) });
    menu(e, [
      ...primary,
      { label: 'Send vibe to a chat', items: () => sendItems(list.map((i) => i.id)) },
      { label: 'Vibe', items: () => [
        ...(it ? [{ label: 'Show the vibe…', action: () => vibeCard(it) }] : []),
        { label: 'Copy the vibe text', action: () => { copyText(list.map((i) => V.text(i)).join('\n')); toast('Vibe copied'); } },
        { label: 'Palette card from it', action: () => paletteCard(list) },
        ...(it ? [{ label: 'Find similar', action: () => findSimilar(it) }] : []),
        { label: 'Tags from its vibe', action: () => B._.tagByVibe(list) },
        { label: 'Read the vibe again', action: () => B.reanalyze(list.map((i) => i.id)) },
      ] },
      { label: 'Your note on it…', action: () => editNote() },
      { label: 'Tags', items: tagItems },
      { label: 'Stamp', items: stampItems },
      ...(list.some((i) => B._.isMedia(i) || ['swatch', 'palette', 'shape', 'sticker', 'arrow'].includes(i.type)) ? [{ label: 'Look', items: lookItems }] : []),
      { label: 'Arrange', items: () => arrangeItems() },
      { label: 'Duplicate  Ctrl+D', action: () => { const m = B.duplicateItems(ids()); B.select(m.map((i) => i.id)); } },
      { label: 'Copy  Ctrl+C', action: copy, more: true },
      { label: list.length > 1 && !list.every((i) => i.group && i.group === list[0].group) ? 'Group  Ctrl+G' : 'Ungroup  Ctrl+Shift+G', action: () => (list.length > 1 && !list.every((i) => i.group && i.group === list[0].group) ? B.group() : B.ungroup()), more: true },
      { label: 'Frame them  F', action: () => B.frameSelection(), more: true },
      { label: list.some((i) => i.locked) ? 'Unlock' : 'Lock in place', action: () => B.patch(null, { locked: !list.some((i) => i.locked) || undefined }, 'lock'), more: true },
      { label: 'Rename…', action: () => renameItems(), more: true },
      { label: 'Info…  I', action: () => B._.info(), more: true },
      { label: 'Hide  H', action: () => B._.hide(), more: true },
      { label: 'Move to board', items: () => B.boards().filter((b) => b.id !== S.cur.id).map((b) => ({ label: b.name, action: () => B._.toBoard(b.id, { move: true }) })), more: true },
      { label: 'Copy to board', items: () => B.boards().filter((b) => b.id !== S.cur.id).map((b) => ({ label: b.name, action: () => B._.toBoard(b.id) })), more: true },
      { label: 'Copy as a picture  Ctrl+Shift+C', action: () => B._.copyImage(), more: true },
      ...(it?.src ? [{ label: 'Show the file', action: () => window.hub.fs.reveal(it.src), more: true }, { label: 'Open with the system', action: () => window.hub.fs.open(it.src), more: true }, { label: 'Copy the file path', action: () => { copyText(it.src); toast('Path copied'); }, more: true }] : []),
      ...(it?.from ? [{ label: 'Go to the clip it came from', action: () => { B.select(it.from); B.zoomSel(); }, more: true }] : []),
      { label: `Delete${list.length > 1 ? ` ${list.length}` : ''}  Del`, danger: true, action: () => B.removeItems() },
    ]);
  }
  function arrangeItems() {
    return [
      { label: 'Bring to front  Ctrl+]', action: () => B.reorder('front') }, { label: 'Bring forward  ]', action: () => B.reorder('forward') },
      { label: 'Send backward  [', action: () => B.reorder('backward') }, { label: 'Send to back  Ctrl+[', action: () => B.reorder('back') },
      { label: 'Align', items: () => [['left', 'Left edges'], ['hcenter', 'Centers (vertical line)'], ['right', 'Right edges'], ['top', 'Tops'], ['vcenter', 'Middles (horizontal line)'], ['bottom', 'Bottoms']].map(([k, l]) => ({ label: l, action: () => alignSel(k) })) },
      { label: 'Distribute', items: () => [['h', 'Horizontally (equal gaps)'], ['v', 'Vertically (equal gaps)']].map(([k, l]) => ({ label: l, action: () => distributeSel(k) })) },
      { label: 'Stack', items: () => [['h', 'In a row'], ['v', 'In a column']].map(([k, l]) => ({ label: l, action: () => stackSel(k) })) },
      { label: 'Match size', items: () => [['w', 'Same width'], ['h', 'Same height'], ['both', 'Same size']].map(([k, l]) => ({ label: l, action: () => matchSel(k) })) },
      { label: 'Auto-arrange', items: () => layoutItems() },
      { label: 'Size', items: () => [{ label: 'Actual size (100 %)', action: () => B._.actualSize() }, { label: 'Reset size', action: () => B._.resetSize() }, { label: 'Fill its frame', action: () => B._.fillFrame() }] },
      ...(sel().length === 2 ? [{ label: 'Swap the two', action: () => B._.swap() }] : []),
    ];
  }
  const layoutItems = (list) => D.LAYOUTS.map((l) => ({ label: l.name, action: () => { const n = B.arrange(l.id, list); if (!n) toast('Nothing to arrange'); } }));
  const pos = (fnName, arg, label) => { const list = sel().filter((i) => !i.locked); if (list.length < 2) return toast('Select two or more'); const out = LY[fnName](list, arg); B.patch(list.map((i) => i.id), (i) => Object.assign(i, out[i.id] || {}), label); };
  const alignSel = (k) => pos('align', k, `align ${k}`);
  const distributeSel = (k) => { if (sel().length < 3) return toast('Select three or more'); pos('distribute', k, 'distribute'); };
  const stackSel = (k) => pos('stack', k, 'stack');
  const matchSel = (k) => pos('matchSize', k, 'match size');

  // ---------- the board (right-click on empty space) ----------
  function canvasMenu(e, p) {
    menu(e, [
      ...(clip ? [{ label: `Paste ${clip.length} here`, action: () => pasteItems(`${CLIP_MARK}`, p) }] : []),
      { label: 'Add', items: () => Board._.addItems(p) },
      { label: 'Arrange everything', items: () => layoutItems([]) },
      { label: 'Lens', items: lensItems },
      { label: 'Select', items: selectItems },
      { label: 'View', items: viewItems },
      { label: 'Board', items: () => Board._.boardItems() },
      { label: 'Present', items: presentItems },
      { label: 'Search and filter…  /', action: () => Board._.search?.() },
      { label: 'Send the board\'s vibe to a chat', items: () => sendItems([]) },
      { label: 'Undo  Ctrl+Z', action: B.undo, more: true }, { label: 'Redo  Ctrl+Shift+Z', action: B.redo, more: true },
      { label: 'Keys on the board…', action: keysHelp, more: true },
    ]);
  }
  B._.addItemsBase = null;
  function addItems(p) {
    return [
      { label: 'Pictures or clips…', action: () => pickFiles(p) },
      { label: 'Website…', action: () => askUrl(p) },
      { label: 'Note  N', action: () => { const n = B.addNote('', p); setTimeout(() => editText(n.id), 30); } },
      { label: 'Text  T', action: () => { const t = B.addText('Title', p); setTimeout(() => editText(t.id), 30); } },
      { label: 'Color', items: () => [
        { label: 'Pick a color…', action: async () => { const c = await pickColor(); if (c) B.addSwatch([c], p); } },
        { label: 'Palette library', items: paletteGroups(p) },
        { label: 'The board\'s palette', action: () => { const pal = V.summary(B.items()).palette; if (pal.length) B.addSwatch(pal.map((c) => c.hex), p, { title: 'Board palette' }); else toast('No colors read yet'); } },
        { label: 'Harmony from a color…', action: async () => { const c = await pickColor(); if (c) showMenu(...at(e0()), D.HARMONIES.map((h) => ({ label: h.name, action: () => B.addSwatch(D.harmony(h.id, c), p, { title: h.name }) }))); } },
      ] },
      { label: 'Frame', items: () => [{ label: 'Around the selection  F', action: () => B.frameSelection() }, ...D.FRAME_SIZES.map((f) => ({ label: `${f.name}`, action: () => B.addFrame({ title: f.name, w: f.w, h: f.h }, p) }))] },
      { label: 'Shape', items: () => D.SHAPES.map(([id, n]) => ({ label: n, action: () => B.addShape(id, p) })) },
      { label: 'Arrow or line', items: () => D.ARROWS.map(([id, n]) => ({ label: n, action: () => B.addArrow(id, p) })) },
      { label: 'Sticker', items: () => D.STICKERS.map((g) => ({ label: g, action: () => B.addSticker(g, p) })) },
      { label: 'Template', items: templateItems },
      { label: 'From the clipboard', action: () => pasteClipboard(p) },
      { label: 'A folder of pictures…', action: () => B._.importFolder(), more: true },
      { label: 'A board file (.json)…', action: () => B._.importBoardFile(), more: true },
      { label: 'A screenshot of Hearth', action: () => B._.screenshotHearth(), more: true },
    ];
  }
  const e0 = () => ({ clientX: innerWidth / 2, clientY: innerHeight / 3 });
  function paletteGroups(p) {
    const groups = new Map();
    for (const pal of D.PALETTES) { const g = (pal.tags.split(' ')[0] || 'more'); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(pal); }
    return () => [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([g, list]) => ({ label: `${g[0].toUpperCase()}${g.slice(1)} (${list.length})`, items: () => list.map((pal) => ({ label: pal.name, action: () => B.addSwatch(pal.colors, p, { title: pal.name }) })) }));
  }
  const templateItems = () => [...new Set(D.TEMPLATES.map((t) => t.cat))].map((cat) => ({ label: cat, items: () => D.TEMPLATES.filter((t) => t.cat === cat).map((t) => ({ label: t.name, action: () => B.applyTemplate(t.id) })) }));
  async function pickFiles(p) {
    const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], title: 'Add to the board', filters: [{ name: 'Pictures and clips', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg', 'mp4', 'mov', 'webm', 'm4v', 'mkv'] }, { name: 'Anything', extensions: ['*'] }] });
    if (paths?.length) return B.addFiles(paths, p);
    return [];
  }
  async function askUrl(p) { const u = await Modal.prompt('Add a website or a link to a picture / clip', { placeholder: 'https://…' }); if (u) return B.addUrl(/^\w+:/.test(u) ? u : `https://${u}`, p); return null; }
  async function pasteClipboard(p) {
    try {
      const items = await navigator.clipboard.read();
      for (const ci of items) {
        const t = ci.types.find((x) => x.startsWith('image/'));
        if (t) { const blob = await ci.getType(t); await B.addFiles([new File([blob], `pasted-${Date.now()}.png`, { type: t })], p); return; }
      }
    } catch { /* fall back to text */ }
    const text = await navigator.clipboard.readText().catch(() => '');
    if (!pasteItems(text, p) && text) B.addTextSmart(text, p);
  }
  const lensItems = () => [{ label: ck(!S.cur.lens, 'No lens'), action: () => Board._.setLens(null) }, ...D.LENSES.map((l) => ({ label: ck(S.cur.lens === l.id, l.name), action: () => Board._.setLens(l.id) }))];
  function selectItems() {
    const by = (fn, label) => ({ label, action: () => B.select(B.items().filter(fn).map((i) => i.id)) });
    return [
      by(() => true, 'Everything  Ctrl+A'), { label: 'Nothing  Esc', action: () => B.select([]) }, { label: 'Invert', action: () => B.select(B.items().filter((i) => !S.sel.has(i.id)).map((i) => i.id)) },
      by((i) => i.type === 'image' || i.type === 'gif', 'Pictures'), by((i) => i.type === 'video', 'Clips'), by((i) => i.type === 'web', 'Sites'), by((i) => i.type === 'note' || i.type === 'text', 'Notes and text'),
      by((i) => i.type === 'swatch' || i.type === 'palette', 'Colors'), by((i) => i.type === 'frame', 'Frames'), by((i) => i.stamp, 'Stamped'), by((i) => !i.tags?.length && i.type !== 'frame', 'Untagged'),
      { label: 'With tag', items: () => allTags().map((t) => by((i) => i.tags?.includes(t), `#${t}`)) },
      { label: 'Same kind as selected', action: () => { const k = new Set(sel().map((i) => i.type)); B.select(B.items().filter((i) => k.has(i.type)).map((i) => i.id)); } },
      by((i) => Date.now() - (i.added || 0) < 3600e3, 'Added in the last hour'), by((i) => new Date(i.added || 0).toDateString() === new Date().toDateString(), 'Added today'),
      { label: 'Like the selected (vibe)', action: () => findSimilar() },
    ];
  }
  function viewItems() {
    const p = B.prefs();
    return [
      { label: 'Zoom to fit  Shift+1', action: () => B.zoomFit() }, { label: 'Zoom to selection  Shift+2', action: () => B.zoomSel() }, { label: '100 %  Shift+0', action: () => B.setZoom(1) },
      { label: 'Zoom', items: () => [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32].map((z) => ({ label: `${Math.round(z * 100)} %`, action: () => B.setZoom(z) })) },
      { label: 'Lens', items: lensItems },
      { label: 'Background', items: () => D.BACKGROUNDS.map((b) => ({ label: ck((S.cur.bg || p.bg || 'theme') === b.id, b.name), action: () => { S.cur.bg = b.id; B.save(); B.applyBg(); } })) },
      { label: 'Minimap', items: () => [['auto', 'While moving'], ['on', 'Always'], ['off', 'Never']].map(([v, l]) => ({ label: ck((p.minimap || 'auto') === v, l), action: () => { B.setPref('minimap', v); Board._.minimap?.(); } })) },
      { label: ck(p.snap !== false, 'Snap to other items'), action: () => B.setPref('snap', p.snap === false) },
      { label: ck(Boolean(p.grid), 'Snap to a grid'), action: () => B.setPref('grid', !p.grid) },
      { label: 'Grid size', items: () => D.GRID_SIZES.map((g) => ({ label: ck((p.gridSize || 20) === g, `${g}`), action: () => { B.setPref('gridSize', g); B.setPref('grid', true); } })) },
      { label: ck(p.wheel === 'pan', 'Mouse wheel pans (Ctrl+wheel zooms)'), action: () => B.setPref('wheel', p.wheel === 'pan' ? 'zoom' : 'pan') },
      { label: ck(Boolean(p.hand), 'Hand tool (drag pans)'), action: () => B.setPref('hand', !p.hand) },
    ];
  }
  function boardItems() {
    const cur = S.cur;
    return [
      ...B.boards().map((b) => ({ label: ck(b.id === cur.id, `${b.name}  ${b.count || 0}`), action: () => B.open(b.id) })),
      { label: 'New board…', action: async () => { const n = await Modal.prompt('New board', { value: 'New board' }); if (n) B.create(n); } },
      { label: 'New from a template', items: () => [...new Set(D.TEMPLATES.map((t) => t.cat))].map((cat) => ({ label: cat, items: () => D.TEMPLATES.filter((t) => t.cat === cat).map((t) => ({ label: t.name, action: () => B.create(t.name, { template: t.id }) })) })) },
      { label: 'Rename…', action: async () => { const n = await Modal.prompt('Rename board', { value: cur.name }); if (n) B.rename(n); } },
      { label: 'Link to a chat', items: () => recentChats().map((c) => ({ label: ck((cur.chats || []).includes(c.id), c.title || c.id), action: () => ((cur.chats || []).includes(c.id) ? B.unlinkChat(c.id) : B.linkChat(c.id, cur.id)) })) },
      { label: 'Export', items: () => D.EXPORTS.map(([id, l]) => ({ label: l, action: () => Board._.exportAs?.(id) })) },
      { label: 'Brief…', action: () => B._.brief() },
      { label: cur.readonly ? 'Unlock the board' : 'Lock the board', action: () => B._.lock() },
      { label: 'Give the vibe to the Three Director', action: () => B._.toLab() },
      { label: 'Duplicate the board', action: () => B.duplicate(), more: true },
      { label: ck(Boolean(S.index.list.find((x) => x.id === cur.id)?.star), 'Starred'), action: () => B._.star(), more: true },
      { label: `Show hidden (${cur.items.filter((i) => i.hidden).length})`, action: () => B._.showHidden(), more: true },
      { label: 'Statistics', action: () => Modal.alert('Board', B._.stats().replace(/\*\*/g, '')), more: true },
      { label: 'Compare with another board', items: () => B.boards().filter((b) => b.id !== cur.id).map((b) => ({ label: b.name, action: async () => Modal.alert('Vibe differences', B._.diff(cur, await B.load(b.id))) })), more: true },
      { label: 'Copy the board as a picture', action: () => B._.copyImage(B.items()), more: true },
      { label: 'Tidy media folder (unused files)', action: () => Board._.cleanMedia?.(), more: true },
      { label: `Delete "${cur.name}"`, danger: true, action: async () => { if (await Modal.confirm('Delete this board?', `"${cur.name}" and its ${cur.items.length} items (Undo in the notification).`, { ok: 'Delete', danger: true })) B.remove(cur.id); } },
    ];
  }
  const recentChats = () => (H.chats || []).filter((c) => H.agent(c.agentId)?.mode === 'native').slice(0, 14);
  const presentItems = () => [
    { label: 'Start  P', action: () => Board._.present?.() },
    ...(one()?.type === 'frame' ? [{ label: 'Start from the selected frame', action: () => B._.presentFrom(one()) }] : []),
    { label: 'Transition', items: () => D.TRANSITIONS.map((t) => ({ label: ck((B.prefs().transition || 'fly') === t.id, t.name), action: () => B.setPref('transition', t.id) })) },
    { label: 'Advance', items: () => [0, 3, 5, 8, 12, 20].map((n) => ({ label: ck((B.prefs().presentAuto || 0) === n, n ? `Every ${n} s` : 'By hand'), action: () => B.setPref('presentAuto', n || undefined) })) },
  ];
  function keysHelp() {
    const g = Keys.groups(true).get('Board') || [];
    Modal.alert('Keys on the board', g.map((k) => `${k.keys}  —  ${k.what}`).join('\n'));
  }

  // chips on the board
  // the chips and right-click menus go through Board._ so later layers (board-plus.js) can add entries
  function addMenu(e) { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, Board._.addItems(null)); }
  function viewMenu(e) { if (e.altKey) { B.zoomFit(); return; } const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 220, r.bottom + 4, viewItems()); }
  function boardMenu(e) { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, Board._.boardItems()); }

  Object.assign(Board._, {
    openItem, editText, itemMenu, canvasMenu, addMenu, viewMenu, boardMenu, copy, pasteItems, askUrl, pickFiles, vibeCard, frameGrab, posterHere, stepFrame, cropTo, resetLook,
    LOOK, addTag, cleanTag, editNote, renameItems, findSimilar, paletteCard, refreshSnapshot, livePreview, viewLarge, sendMenuAt, alignSel, distributeSel, stackSel, matchSel, pickColor, keysHelp, allTags, lensItems, viewItems, boardItems, addItems,
  });
})();
