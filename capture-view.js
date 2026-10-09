// CaptureView: the captures library and a light player for captures and any video (frame stepping with the true
// frame rate, timecodes, markers), plus the one right-click menu every capture shares (itemsFor).
//   CaptureView.library({ kind })    the grid of shots and recordings (newest first)
//   CaptureView.open(path, { frame }) the player (videos) or the viewer (pictures)
//   CaptureView.itemsFor(path)       menu items for a capture (open, copy, → chat, Video Review, editor, Lab, read frames…)
const CaptureView = (() => {
  const api = () => window.hub.capture;
  const D = CaptureData;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const VIDEO = /\.(webm|mp4|mov|m4v|mkv)$/i;
  const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
  const IS_MAC = /Mac/.test(navigator.platform);
  const fail = (e) => toast(e.message || String(e), { type: 'error' });
  const tryRun = (fn) => () => Promise.resolve().then(fn).catch(fail);

  // ---------- one menu for a capture, wherever it shows ----------
  // Beautify: the 15 looks, then your own mix (background, padding, corners, shadow, window bar), remembered
  function beautyItems(p) {
    const apply = (look, over = {}) => tryRun(() => derive(p, (img) => Capture.beautify(img, look, over), look === 'mine' ? 'beautified' : look));
    const mix = (k, v, label) => ({ label, action: tryRun(() => { Capture.setBeautyMix(k, v); return derive(p, (img) => Capture.beautify(img, 'mine'), 'beautified'); }) });
    const m = Capture.beautyMix();
    const cur = (k, v) => (m[k] === v ? '✓ ' : '');
    return [
      ...D.BEAUTIFY.map((b) => ({ label: b.label, action: apply(b.id) })),
      { label: 'Your mix', action: apply('mine') },
      { label: 'Background…', action: () => Capture.picker('Background', D.BACKGROUNDS.map((b) => ({ id: b.id, label: b.label })), (b) => { Capture.setBeautyMix('bg', b.id); derive(p, (img) => Capture.beautify(img, 'mine'), 'beautified').catch(fail); }) },
      { label: 'Padding…', items: () => D.PADS.map((x) => mix('pad', x.pad, `${cur('pad', x.pad)}${x.label}`)) },
      { label: 'Corners…', items: () => D.CORNERS.map((x) => mix('radius', x.radius, `${cur('radius', x.radius)}${x.label}`)) },
      { label: 'Shadow…', items: () => D.SHADOWS.map((x) => mix('shadow', x.shadow, `${cur('shadow', x.shadow)}${x.label}`)) },
      { label: 'Window bar…', items: () => D.CHROME.map((x) => mix('chrome', x.id, `${cur('chrome', x.id)}${x.label}`)) },
    ];
  }
  // Make…: a GIF, a trim, a timelapse, a reframe… of a video (the part between I and O in the player when set)
  function makeItems(p, range = null) {
    return D.EDITS.map((e) => ({ label: `${e.label}${range && !['mute', 'poster'].includes(e.op || e.id) ? '  I–O' : ''}`, action: tryRun(async () => {
      const r = range?.() || {};
      await FrameRead.edit(p, e.op || e.id, { ...(e.args || {}), ...(['mute'].includes(e.op || e.id) ? {} : r), ...((e.op || e.id) === 'poster' && r.from == null && frameTime ? { time: frameTime() } : {}) });
    }) }));
  }
  let frameTime = null; // the player's current time, for "Poster frame"
  function itemsFor(p, { frameOf = null, range = null } = {}) {
    const isVid = VIDEO.test(p);
    const agents = () => H.agents().filter((a) => a.mode === 'native');
    const read = (mode, args = {}) => tryRun(async () => { const busy = toast(`Reading ${base(p)}…`, { timeout: 0 }); try { FrameRead.show(await FrameRead.read(p, mode, args), p); } finally { busy.remove(); } });
    return [
      { label: isVid ? '▶ Play' : '🖼 Open', action: () => open(p) },
      isVid ? null : { label: 'Copy the picture', action: tryRun(async () => { await Capture.copyImage(p); toast('Copied', { timeout: 1200 }); }) },
      isVid && frameOf ? { label: 'Copy this frame', action: tryRun(async () => { const f = await frameOf(); await Capture.copyImage(f.path); toast(`Frame ${f.frame} copied`, { timeout: 1400 }); }) } : null,
      { label: isVid ? '→ Send to this chat (its contact sheet)' : '→ Send to this chat', action: tryRun(() => Capture.attachToChat(p)) },
      { label: '→ Send to a chat', items: () => agents().map((a) => ({ label: a.name, action: tryRun(() => Capture.attachToChat(p, a.id)) })) },
      isVid ? { label: 'Open in Video Review', action: tryRun(() => Capture.openInReview(p)) } : null,
      isVid ? { label: 'Open in the editor timeline', action: tryRun(() => Capture.openInReview(p, { cut: true })) } : null,
      isVid && typeof VideoCut !== 'undefined' && VideoCut.active ? { label: 'Add to the edit', action: tryRun(() => Capture.addToEdit(p)) } : null,
      isVid ? { label: 'Add to the Lab as media', action: tryRun(() => Capture.addToLab(p)) } : null,
      isVid ? { label: 'Read frames…', items: () => [
        { label: 'Contact sheet', action: read('sheet') },
        { label: 'Scene changes', action: read('scenes') },
        { label: 'Motion energy curve', action: read('motion') },
        { label: 'Pacing', action: read('pacing') },
        { label: 'Palette', action: read('palette') },
        { label: 'Every 10 frames', action: read('every', { every: 10 }) },
        { label: 'True fps and frame count', action: read('info') },
        { label: 'More…', action: () => FrameRead.pickAndRead(p) },
      ] } : null,
      !isVid && typeof CaptureAnnotate !== 'undefined' ? { label: '✎ Annotate', action: tryRun(async () => { const out = await CaptureAnnotate.open(p); if (out) open(out); }) } : null,
      !isVid ? { label: '✨ Beautify…', items: () => beautyItems(p) } : null,
      isVid ? { label: '✂ Make…', items: () => makeItems(p, range) } : null,
      !isVid ? { label: '⬚ Social frame…', items: () => [
        ...D.SOCIAL.slice(0, 6).map((f) => ({ label: `${f.id}  ${f.w}×${f.h}`, action: tryRun(() => derive(p, (img) => Capture.socialCrop(img, f), f.id.replace(':', 'x'))) })),
        { label: 'Fit inside (no crop)…', items: () => D.SOCIAL.slice(0, 6).map((f) => ({ label: `${f.id}  ${f.w}×${f.h}`, action: tryRun(() => derive(p, (img) => Capture.socialCrop(img, f, { fit: 'fit' }), `${f.id.replace(':', 'x')} fit`)) })) },
        { label: 'All sizes…', action: () => Capture.pickFrame((f) => derive(p, (img) => Capture.socialCrop(img, f), f.id.replace(':', 'x')).catch(fail)) },
      ] } : null,
      isVid && /\.webm$/i.test(p) ? { label: 'Make an MP4', more: true, action: tryRun(async () => { const busy = toast('Making the MP4…', { timeout: 0 }); try { const r = await api().finish({ path: p, mp4: true }); if (!r.ffmpeg) throw new Error('ffmpeg isn\'t installed'); if (r.mp4Error) throw new Error(r.mp4Error); toast(`MP4: ${base(r.mp4)}`, { action: { label: 'Open', fn: () => open(r.mp4) } }); } finally { busy.remove(); } }) } : null,
      { label: 'Show in folder', more: true, action: () => window.hub.fs.reveal(p) },
      { label: 'Open with the system app', more: true, action: () => window.hub.fs.open(p) },
      { label: 'Copy the path', more: true, action: () => copyText(p, 'Path copied') },
      { label: 'Move to the Trash', more: true, danger: true, action: tryRun(async () => { if (!await Modal.confirm('Move to the Trash?', base(p), { ok: 'Move to Trash', danger: true })) return; await api().trash(p); toast('Moved to the Trash', { timeout: 1500 }); document.dispatchEvent(new CustomEvent('hearth:capture', { detail: { removed: p } })); }) },
    ];
  }
  // a new picture made from a capture (beautified, cropped): saved next to it, opened
  async function derive(p, fn, suffix) {
    const img = await Capture.loadImage(p);
    const c = fn(img);
    const out = await api().save({ name: `${base(p).replace(/\.\w+$/, '')} ${suffix}`, data: Capture.canvasData(c) });
    Capture.remember({ kind: 'shot', path: out, w: c.width, h: c.height });
    toast(`${base(out)} · ${c.width}×${c.height}`, { timeout: 3000, action: { label: 'Open', fn: () => open(out) } });
    return out;
  }

  // ---------- the library ----------
  let libDlg = null;
  async function library({ kind = store.get('capture.libKind', 'all') } = {}) {
    if (libDlg?.open) { libDlg.close(); }
    const grid = el('div', { class: 'cap-lib-grid' });
    const q = el('input', { type: 'search', placeholder: 'Search captures', class: 'cap-lib-q' });
    const kinds = [['all', 'All'], ['shot', 'Pictures'], ['video', 'Videos']];
    const seg = el('div', { class: 'cap-seg' }, kinds.map(([k, label]) => el('button', { type: 'button', text: label, class: k === kind ? 'on' : '', on: { click: () => { kind = k; store.set('capture.libKind', k); for (const b of seg.children) b.classList.toggle('on', b.textContent === label); paint(); } } })));
    const count = el('span', { class: 'hint' });
    let items = [];
    const card = (it) => {
      const isVid = it.kind === 'video';
      const thumb = isVid ? el('video', { muted: true, preload: 'metadata', src: `${Capture.fileUrl(it.path)}#t=0.5`, playsInline: true, loop: true }) : el('img', { src: Capture.fileUrl(it.path), loading: 'lazy', alt: it.name });
      const c = el('figure', { class: `cap-card ${isVid ? 'vid' : 'pic'}`, draggable: true, title: `${it.name}\n${fmtBytes(it.size)} · ${new Date(it.mtime).toLocaleString()}\nDouble-click: open · right-click: more · drag: into a chat, the board, another app` },
        thumb, el('figcaption', {}, el('span', { text: it.name }), el('small', { text: `${isVid ? '🎬' : '📷'} ${timeAgo(it.mtime)}` })));
      // videos play only while hovered (nothing runs in the background)
      if (isVid) { c.addEventListener('mouseenter', () => thumb.play().catch(() => {})); c.addEventListener('mouseleave', () => { thumb.pause(); }); }
      c.addEventListener('dblclick', () => { libDlg?.close(); open(it.path); });
      c.addEventListener('click', (e) => { if (e.altKey) { e.preventDefault(); Capture.attachToChat(it.path).catch(fail); } });
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); Capture.menu(e.clientX, e.clientY, itemsFor(it.path)); });
      c.addEventListener('dragstart', (e) => { e.preventDefault(); api().startDrag(it.path); });
      return c;
    };
    let sort = store.get('capture.libSort', 'new');
    const SORTS = { new: (a, b) => b.mtime - a.mtime, old: (a, b) => a.mtime - b.mtime, big: (a, b) => b.size - a.size, name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) };
    const paint = () => {
      const s = q.value.trim().toLowerCase();
      const list = items.filter((it) => (kind === 'all' || it.kind === kind) && (!s || it.name.toLowerCase().includes(s))).sort(SORTS[sort] || SORTS.new);
      grid.replaceChildren(...list.slice(0, 400).map(card));
      if (!list.length) grid.append(el('p', { class: 'hint cap-empty', text: items.length ? 'Nothing matches.' : `No captures yet: ${IS_MAC ? '⌘' : 'Ctrl'}+Alt+S, or /shot in any chat.` }));
      count.textContent = `${list.length} of ${items.length}`;
    };
    q.addEventListener('input', paint);
    const refresh = async () => { items = await api().list({ kind: 'all', limit: 1000 }); paint(); };
    const onCap = () => refresh();
    document.addEventListener('hearth:capture', onCap);
    libDlg = el('dialog', { class: 'ui-modal cap-lib' },
      el('div', { class: 'cap-lib-head' }, el('h2', { text: 'Captures' }), seg, q, count, el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost', text: '⋯', title: 'More: take a shot, record, folder, settings', on: { click: (e) => Capture.menu(e.clientX, e.clientY, [
          { label: '📷 Screenshot of this tool', action: () => { libDlg.close(); setTimeout(() => Capture.shot({ target: 'tool' }).catch(fail), 250); } },
          { label: '● Record Hearth', action: () => { libDlg.close(); setTimeout(() => Capture.record().catch(fail), 250); } },
          { label: 'Sort…', items: () => [['new', 'Newest first'], ['old', 'Oldest first'], ['big', 'Biggest first'], ['name', 'By name']].map(([k, l]) => ({ label: `${sort === k ? '✓ ' : ''}${l}`, action: () => { sort = k; store.set('capture.libSort', k); paint(); } })) },
          { label: 'Open the folder', action: async () => window.hub.fs.open((await Capture.info()).dir) },
          { label: 'Captures folder…', action: () => Capture.chooseFolder().then(refresh) },
        ]) } })),
      grid,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'hint', text: 'Double-click opens · right-click for more · drag it into a chat' }), el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'primary', text: 'Close', on: { click: () => libDlg.close() } })));
    libDlg.addEventListener('close', () => { document.removeEventListener('hearth:capture', onCap); for (const v of libDlg.querySelectorAll('video')) { v.pause(); v.removeAttribute('src'); v.load(); } setTimeout(() => libDlg?.remove(), 0); });
    document.body.append(libDlg);
    libDlg.showModal();
    await refresh();
    return libDlg;
  }

  // ---------- the player / viewer ----------
  let viewDlg = null;
  async function open(p, { frame = null, time = null } = {}) {
    if (!p) throw new Error('Nothing to open');
    if (viewDlg?.open) viewDlg.close();
    return VIDEO.test(p) ? openVideo(p, { frame, time }) : openImage(p);
  }
  function shell(p, body, foot, onKey) {
    const dlg = el('dialog', { class: 'ui-modal cap-view' },
      el('div', { class: 'cap-view-head' }, el('h2', { text: base(p), title: p }), el('span', { class: 'cap-view-info hint' }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost', text: '⋯', title: 'Everything you can do with it', on: { click: (e) => Capture.menu(e.clientX, e.clientY, itemsFor(p, { frameOf: dlg.frameOf, range: dlg.range })) } }),
        el('button', { type: 'button', class: 'ghost', text: '✕', title: 'Close (Esc)', on: { click: () => dlg.close() } })),
      body, foot);
    dlg.addEventListener('keydown', (e) => { if (onKey && !e.target.closest('input, textarea')) onKey(e); });
    dlg.addEventListener('close', () => { dlg.cleanup?.(); setTimeout(() => dlg.remove(), 0); if (viewDlg === dlg) viewDlg = null; });
    document.body.append(dlg);
    dlg.showModal();
    viewDlg = dlg;
    return dlg;
  }
  function openImage(p) {
    const img = el('img', { src: Capture.fileUrl(p), alt: base(p), draggable: false });
    const stage = el('div', { class: 'cap-view-stage pic' }, img);
    let z = 0; let fit = true; let pan = { x: 0, y: 0 };
    const apply = () => { img.style.transform = fit ? '' : `translate(${pan.x}px, ${pan.y}px) scale(${2 ** z})`; img.classList.toggle('fit', fit); };
    stage.addEventListener('wheel', (e) => { e.preventDefault(); fit = false; z = Math.max(-3, Math.min(4, z + (e.deltaY < 0 ? 0.25 : -0.25))); apply(); }, { passive: false });
    stage.addEventListener('dblclick', () => { fit = !fit; z = 0; pan = { x: 0, y: 0 }; apply(); });
    stage.addEventListener('pointerdown', (e) => {
      if (fit || e.button !== 0) return;
      stage.setPointerCapture(e.pointerId);
      const sx = e.clientX - pan.x; const sy = e.clientY - pan.y;
      const mv = (ev) => { pan = { x: ev.clientX - sx, y: ev.clientY - sy }; apply(); };
      stage.addEventListener('pointermove', mv);
      stage.addEventListener('pointerup', () => stage.removeEventListener('pointermove', mv), { once: true });
    });
    stage.addEventListener('contextmenu', (e) => { e.preventDefault(); Capture.menu(e.clientX, e.clientY, itemsFor(p)); });
    const foot = el('div', { class: 'cap-view-foot' },
      typeof CaptureAnnotate !== 'undefined' ? el('button', { type: 'button', text: '✎ Annotate', title: 'Arrows, boxes, text, blur… (A)', on: { click: tryRun(async () => { const out = await CaptureAnnotate.open(p); if (out) open(out); }) } }) : null,
      el('button', { type: 'button', text: 'Copy', title: 'Copy the picture (C)', on: { click: tryRun(async () => { await Capture.copyImage(p); toast('Copied', { timeout: 1200 }); }) } }),
      el('button', { type: 'button', text: '→ Chat', title: 'Attach it to the chat (Enter)', on: { click: tryRun(async () => { await Capture.attachToChat(p); dlg.close(); }) } }),
      el('span', { class: 'spacer' }), el('span', { class: 'hint', text: 'Wheel zooms · double-click fits · right-click for more' }));
    const dlg = shell(p, stage, foot, (e) => {
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); Capture.copyImage(p).then(() => toast('Copied', { timeout: 1200 })).catch(fail); }
      if ((e.key === 'a' || e.key === 'A') && typeof CaptureAnnotate !== 'undefined') { e.preventDefault(); CaptureAnnotate.open(p).then((out) => out && open(out)).catch(fail); }
      if (e.key === 'Enter') { e.preventDefault(); Capture.attachToChat(p).then(() => dlg.close()).catch(fail); }
      if (e.key === '0') { fit = true; apply(); }
    });
    img.addEventListener('load', () => { dlg.querySelector('.cap-view-info').textContent = `${img.naturalWidth}×${img.naturalHeight}`; }, { once: true });
    apply();
    return dlg;
  }
  async function openVideo(p, { frame = null, time = null } = {}) {
    const v = el('video', { src: Capture.fileUrl(p), preload: 'auto', playsInline: true });
    const stage = el('div', { class: 'cap-view-stage vid' }, v);
    const tcEl = el('span', { class: 'cap-tc', text: '00:00:00:00', title: 'Click: timecode / seconds / frame number' });
    const bar = el('div', { class: 'cap-scrub' }, el('div', { class: 'cap-scrub-fill' }), el('div', { class: 'cap-scrub-marks' }));
    const playBtn = el('button', { type: 'button', class: 'cap-play', text: '▶', title: 'Play / pause (Space)' });
    const back = el('button', { type: 'button', text: '◀|', title: 'One frame back (←, Shift+← = 10)' });
    const fwd = el('button', { type: 'button', text: '|▶', title: 'One frame on (→, Shift+→ = 10)' });
    const speed = el('button', { type: 'button', class: 'ghost', text: '1×', title: 'Speed (click: next · right-click: pick)' });
    const foot = el('div', { class: 'cap-view-foot' }, back, playBtn, fwd, tcEl, el('span', { class: 'spacer' }), speed,
      el('button', { type: 'button', class: 'ghost', text: '🎞 Read', title: 'Read frames: contact sheet, scenes, motion, exact frames… (R)', on: { click: () => FrameRead.pickAndRead(p) } }),
      el('button', { type: 'button', class: 'ghost', text: '✂ Make', title: 'A GIF, a trim, a timelapse, a reframe… (I / O set the part; G makes a GIF)', on: { click: (e) => Capture.menu(e.clientX, e.clientY, makeItems(p, dlg.range)) } }));
    let inf = { fps: 30, frames: 0, duration: 0, exact: false };
    let cur = 0; // the frame on screen
    const fps = () => inf.fps || 30;
    const total = () => Math.max(1, inf.frames || Math.floor((v.duration || 0) * fps()));
    const STYLES = ['smpte', 'ms', 's'];
    let tcStyle = store.get('capture.playerTc', 'smpte');
    tcEl.addEventListener('click', () => { tcStyle = STYLES[(STYLES.indexOf(tcStyle) + 1) % STYLES.length]; store.set('capture.playerTc', tcStyle); paint(); });
    const paint = () => {
      const t = cur / fps();
      const text = `${FrameRead.tc(t, fps(), tcStyle)} · f${cur} / ${total() - 1}`;
      if (tcEl.textContent !== text) tcEl.textContent = text;
      bar.firstChild.style.transform = `scaleX(${Math.min(1, cur / Math.max(1, total() - 1))})`;
    };
    // the frame really presented, from requestVideoFrameCallback (playing and after each seek)
    const onFrame = (_now, meta) => { cur = Math.floor(meta.mediaTime * fps() + 1e-3); paint(); if (dlg.isConnected) v.requestVideoFrameCallback(onFrame); };
    v.requestVideoFrameCallback(onFrame);
    const go = (n) => { v.pause(); const k = Math.max(0, Math.min(total() - 1, n)); v.currentTime = (k + 0.5) / fps(); cur = k; paint(); };
    const step = (d) => go(cur + d);
    const toggle = () => (v.paused ? v.play() : v.pause());
    v.addEventListener('play', () => { playBtn.textContent = '❚❚'; });
    v.addEventListener('pause', () => { playBtn.textContent = '▶'; });
    playBtn.addEventListener('click', toggle);
    back.addEventListener('click', (e) => step(e.shiftKey ? -10 : -1));
    fwd.addEventListener('click', (e) => step(e.shiftKey ? 10 : 1));
    const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2];
    speed.addEventListener('click', () => { const i = SPEEDS.indexOf(v.playbackRate); v.playbackRate = SPEEDS[(i + 1) % SPEEDS.length]; speed.textContent = `${v.playbackRate}×`; });
    speed.addEventListener('contextmenu', (e) => { e.preventDefault(); Capture.menu(e.clientX, e.clientY, SPEEDS.map((s) => ({ label: `${v.playbackRate === s ? '✓ ' : ''}${s}×`, action: () => { v.playbackRate = s; speed.textContent = `${s}×`; } }))); });
    const seekAt = (e) => { const r = bar.getBoundingClientRect(); go(Math.round(((e.clientX - r.left) / r.width) * (total() - 1))); };
    bar.addEventListener('pointerdown', (e) => { bar.setPointerCapture(e.pointerId); seekAt(e); const mv = (ev) => seekAt(ev); bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', () => bar.removeEventListener('pointermove', mv), { once: true }); });
    stage.addEventListener('click', toggle);
    stage.addEventListener('contextmenu', (e) => { e.preventDefault(); Capture.menu(e.clientX, e.clientY, itemsFor(p, { frameOf: dlg.frameOf, range: dlg.range })); });
    const frameOf = async () => FrameRead.at(p, { frame: cur }, { format: 'png' });
    // I / O: a range for Make… (a GIF, a trim, a loop…), shown on the scrub bar
    const io = { a: null, b: null };
    const ioBox = el('div', { class: 'cap-scrub-io', hidden: true });
    bar.append(ioBox);
    const paintIo = () => {
      const T = Math.max(1, total() - 1);
      if (io.a == null && io.b == null) { ioBox.hidden = true; return; }
      const a = (io.a ?? 0) / T; const b = (io.b ?? T) / T;
      Object.assign(ioBox.style, { left: `${Math.min(a, b) * 100}%`, width: `${Math.abs(b - a) * 100}%` });
      ioBox.hidden = false;
    };
    const range = () => (io.a == null && io.b == null ? null : { from: Math.round(((io.a ?? 0) / fps()) * 1000) / 1000, to: io.b == null ? undefined : Math.round(((io.b + 1) / fps()) * 1000) / 1000 });
    const dlg = shell(p, el('div', { class: 'cap-view-body' }, stage, bar), foot, (e) => {
      const k = e.key;
      if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); toggle(); }
      else if (k === 'ArrowRight' || k === '.') { e.preventDefault(); step(e.shiftKey ? 10 : 1); }
      else if (k === 'ArrowLeft' || k === ',') { e.preventDefault(); step(e.shiftKey ? -10 : -1); }
      else if (k === 'Home') { e.preventDefault(); go(0); }
      else if (k === 'End') { e.preventDefault(); go(total() - 1); }
      else if (k === 'l' || k === 'L') { v.playbackRate = Math.min(4, v.paused ? 1 : v.playbackRate * 2); v.play(); speed.textContent = `${v.playbackRate}×`; }
      else if (k === 'j' || k === 'J') { v.pause(); step(-Math.round(fps() / 2)); }
      else if (k === 'r' || k === 'R') { e.preventDefault(); FrameRead.pickAndRead(p); }
      else if (k === 'c' || k === 'C') { e.preventDefault(); frameOf().then((f) => Capture.copyImage(f.path)).then(() => toast(`Frame ${cur} copied`, { timeout: 1200 })).catch(fail); }
      else if (k === 's' || k === 'S') { e.preventDefault(); frameOf().then((f) => toast(`Frame ${f.frame} saved`, { timeout: 2500, action: { label: 'Show', fn: () => window.hub.fs.reveal(f.path) } })).catch(fail); }
      else if (k === 'Enter') { e.preventDefault(); frameOf().then((f) => Capture.attachToChat(f.path)).catch(fail); }
      else if (k === 'i' || k === 'I') { io.a = cur; paintIo(); toast(`In: frame ${cur}`, { timeout: 900 }); }
      else if (k === 'o' || k === 'O') { io.b = cur; paintIo(); toast(`Out: frame ${cur}`, { timeout: 900 }); }
      else if (k === 'x' || k === 'X') { io.a = null; io.b = null; paintIo(); }
      else if (k === 'g' || k === 'G') { e.preventDefault(); FrameRead.edit(p, 'gif', { fps: 15, ...(range() || {}) }).catch(fail); }
      else if (k === 'm' || k === 'M') { const mk = marks.find((x) => Math.floor(x.time * fps()) > cur) || marks[0]; if (mk) go(Math.floor(mk.time * fps())); }
    });
    dlg.frameOf = frameOf;
    dlg.range = range;
    frameTime = () => cur / fps();
    dlg.cleanup = () => { v.pause(); v.removeAttribute('src'); v.load(); };
    dlg.player = { video: v, go, step, io, range, setIn: (n) => { io.a = n; paintIo(); }, setOut: (n) => { io.b = n; paintIo(); }, get frame() { return cur; }, get info() { return inf; } };
    let marks = [];
    await new Promise((r) => { if (v.readyState >= 1) r(); else { v.addEventListener('loadedmetadata', r, { once: true }); v.addEventListener('error', r, { once: true }); setTimeout(r, 6000); } });
    try { inf = await FrameRead.info(p); } catch { /* the estimate below */ }
    marks = (await window.hub.kvGet('capture-marks', {}))[p] || [];
    const markBox = bar.querySelector('.cap-scrub-marks');
    markBox.replaceChildren(...marks.map((m) => el('i', { title: `◆ ${m.label} (${m.time.toFixed(2)}s)`, style: { left: `${(m.time / Math.max(0.01, inf.duration || v.duration || 1)) * 100}%` }, on: { pointerdown: (e) => { e.stopPropagation(); go(Math.floor(m.time * fps())); } } })));
    dlg.querySelector('.cap-view-info').textContent = `${inf.w || v.videoWidth}×${inf.h || v.videoHeight} · ${inf.fps} fps${inf.vfr ? ' (variable)' : ''} · ${total()} frames${inf.exact ? '' : ' (estimated)'}${marks.length ? ` · ${marks.length} markers (M)` : ''}`;
    if (frame != null) go(Number(frame)); else if (time != null) go(Math.floor(Number(time) * fps() + 1e-3)); else paint();
    return dlg;
  }

  return { beautyItems, makeItems, library, open, itemsFor, derive, get viewer() { return viewDlg; } };
})();
