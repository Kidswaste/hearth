// The time machine's strip over the Lab preview (round 23, timemachine; data and actions: tools/three-history.js).
// One row of tiny pictures, oldest → newest, "now" at the end; ⚑ marks where a director turn began. Click or ←/→ shows
// that version on the preview (live, nothing saved); Enter keeps it (undoable), C compares it with now (a split wipe of
// the two pictures + what changed), B branches it into a new scene, ⋯ / right-click: compare with…, pick a layer / the
// colors / the sliders from it, back before the director's last turns, grid view. Esc puts the scene back.
const ThreeHistoryUI = (() => {
  const TH = ThreeHistory;
  const C = TMCore;
  const GLYPH = { you: '●', claude: '✳', codex: 'A', crew: '✦' };
  let root = null; let strip = null; let info = null; let diffBox = null; let cmp = null;
  let sid = null; let list = []; let idx = -1; let tm = {}; let diffOn = false; let grid = false;
  const isOpen = () => Boolean(root?.isConnected);
  const host = () => ThreeLab.scenes?.previewHost?.();
  const err = (e) => toast(e.message || String(e), { type: 'error' });
  const btn = (text, title, fn, cls = '') => el('button', { type: 'button', class: `tm-btn ${cls}`, text, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve(fn(e)).catch(err); } } });

  async function open() {
    await ThreeLab.cmd({ show: true });
    const h = host();
    if (!h) throw new Error('The Lab preview is not up.');
    sid = ThreeLab.scenes.currentId();
    if (!root) build();
    if (!root.isConnected) h.append(root);
    await refresh({ toEnd: true });
    root.focus({ preventScroll: true });
    return true;
  }
  function close() {
    closeCompare();
    if (TH.scrubbing) TH.endScrub(false);
    root?.remove();
    idx = -1;
  }
  const toggle = () => (isOpen() ? (close(), false) : open());
  function build() {
    strip = el('div', { class: 'tm-strip', attrs: { role: 'listbox', 'aria-label': 'Versions' } });
    info = el('div', { class: 'tm-info' });
    diffBox = el('div', { class: 'tm-diff', hidden: true });
    root = el('div', { class: 'tm-panel', attrs: { tabindex: '-1', 'aria-label': 'Time machine' } },
      el('div', { class: 'tm-head' },
        el('span', { class: 'tm-title', text: '⏱' }), info, el('span', { class: 'spacer' }),
        btn('‹', 'Older (←)', () => step(-1)), btn('›', 'Newer (→)', () => step(1)),
        btn('Restore', 'Make this version the scene (Enter) · undoable', () => keep(), 'primary'),
        btn('⋯', 'Compare, branch, pick a layer / colors / sliders, back before the director, grid', (e) => menu(e.currentTarget.getBoundingClientRect())),
        btn('✕', 'Close: back to now (Esc)', () => close())),
      strip, diffBox);
    root.addEventListener('keydown', onKey);
    strip.addEventListener('click', (e) => { const c = e.target.closest('.tm-card'); if (c) select(Number(c.dataset.i)).catch(err); });
    strip.addEventListener('contextmenu', (e) => { const c = e.target.closest('.tm-card'); if (!c) return; e.preventDefault(); select(Number(c.dataset.i)).then(() => menu({ left: e.clientX, bottom: e.clientY })).catch(err); });
    strip.addEventListener('wheel', (e) => { if (!grid && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }
  // the cards: built once per open / new version, pictures set as they arrive (lazy: the browser loads what's on screen)
  async function refresh({ toEnd = false } = {}) {
    if (!isOpen()) return;
    const keepId = list[idx]?.id;
    list = await TH.list(sid);
    tm = await TH.thumbs(sid);
    const nodes = [];
    let day = '';
    list.forEach((v, i) => {
      const d = new Date(v.at).toDateString();
      if (d !== day) { day = d; nodes.push(el('div', { class: 'tm-day', text: d === new Date().toDateString() ? 'Today' : new Date(v.at).toLocaleDateString([], { month: 'short', day: 'numeric' }) })); }
      nodes.push(card(v, i));
    });
    nodes.push(el('button', { type: 'button', class: 'tm-card tm-now', dataset: { i: String(list.length) }, title: 'Now: the scene as it is (Esc)' }, el('div', { class: 'tm-pic' }, el('span', { text: 'NOW' })), el('div', { class: 'tm-cap', text: 'now' })));
    strip.replaceChildren(...nodes);
    strip.classList.toggle('grid', grid);
    root.classList.toggle('grid', grid);
    const at = keepId ? list.findIndex((v) => v.id === keepId) : -1;
    idx = toEnd || at < 0 ? list.length : at;
    paintSel();
  }
  function card(v, i) {
    const pic = el('div', { class: 'tm-pic' }, tm[v.id] ? el('img', { src: tm[v.id], alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { text: '◭' }));
    const who = el('span', { class: `tm-who by-${v.by}`, text: GLYPH[v.by] || '●', title: C.whoName(v.by) });
    return el('button', { type: 'button', class: `tm-card${v.mark ? ' mark' : ''}`, dataset: { i: String(i), id: v.id }, title: `${C.whoName(v.by)} · ${TH.fmtWhen(v.at)}\n${v.label}${v.mark ? `\n⚑ ${C.whoName(v.mark.by)}'s turn began here: “${v.mark.text}”` : ''}` },
      v.mark ? el('span', { class: 'tm-flag', text: '⚑' }) : null, pic, el('div', { class: 'tm-cap' }, who, el('span', { text: TH.fmtWhen(v.at) })));
  }
  function paintSel() {
    for (const c of strip.querySelectorAll('.tm-card')) { const on = Number(c.dataset.i) === idx; if (c.classList.contains('on') !== on) c.classList.toggle('on', on); }
    strip.querySelector('.tm-card.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const v = list[idx];
    const text = v ? `${C.whoName(v.by)} · ${TH.fmtWhen(v.at)} · ${v.label}` : `Now · ${list.length} version${list.length === 1 ? '' : 's'} of ${ThreeLab.scenes.get(sid)?.name || 'this scene'}`;
    if (info.textContent !== text) { info.textContent = text; info.title = text; }
    if (diffOn) paintDiff().catch(() => {});
  }
  async function select(i) {
    if (!list.length && i !== 0) return;
    idx = Math.max(0, Math.min(list.length, i));
    paintSel();
    const v = list[idx];
    await TH.preview(v ? v.id : 'now', sid);
  }
  const step = (d) => select(idx + d);
  async function keep() {
    const v = list[idx];
    if (!v) { close(); return; }
    const r = await TH.endScrub(true);
    if (r?.undo) toast(`Restored “${v.label}”`, { timeout: 6000, action: { label: 'Undo', fn: () => r.undo().catch(err) } });
    await refresh({ toEnd: true });
  }
  async function doBranch() {
    const v = list[idx];
    const copy = await TH.branch(v?.id || null, { id: sid });
    toast(`New scene “${copy.name}”${v ? ` from ${TH.fmtWhen(v.at)}` : ''}`, { timeout: 4000 });
    close();
  }
  async function doPick(what, layer = null) {
    const v = list[idx];
    if (!v) throw new Error('Pick an earlier version first.');
    await TH.endScrub(false);
    const r = await TH.pick(v.id, what, { id: sid, layer });
    toast(r.version?.label || 'Picked', { timeout: 6000, action: r.undo ? { label: 'Undo', fn: () => r.undo().catch(err) } : undefined });
    await refresh({ toEnd: true });
  }
  async function doBack(n, by = null) {
    await TH.endScrub(false);
    const r = await TH.back(n, { id: sid, by });
    toast(`Back before ${C.whoName(r.by)}'s last ${r.turns === 1 ? 'edit' : `${r.turns} edits`}`, { timeout: 6000, action: r.undo ? { label: 'Undo', fn: () => r.undo().catch(err) } : undefined });
    await refresh({ toEnd: true });
  }
  async function menu(r) {
    const v = list[idx];
    const st = v ? await TH.stateOf(v.id, sid) : null;
    const turns = await TH.turns(sid);
    const recent = list.slice(-14).reverse().filter((x) => x !== v);
    ThreeTweaks.menu(r.left, r.bottom + 4, [
      v ? `${TH.fmtWhen(v.at)} · ${C.whoName(v.by)}` : 'Now',
      ['Compare with now', 'A split wipe of the two pictures + what changed (C)', () => compare(v?.id || 'now', 'now').catch(err)],
      ['Compare with…', 'Another version', recent.map((x) => [`${TH.fmtWhen(x.at)} · ${C.whoName(x.by)}`, x.label, () => compare(x.id, v?.id || 'now').catch(err)])],
      [diffOn ? 'Hide what changed' : 'What changed', 'Layers, code lines and slider values vs now (D)', () => { diffOn = !diffOn; diffBox.hidden = !diffOn; paintSel(); }],
      v ? ['Restore this version', 'It becomes the scene; undoable (Enter)', () => keep().catch(err)] : null,
      ['Branch into a new scene', `${v ? 'This version' : 'Now'} as a new scene, with its song, frame and looks (B)`, () => doBranch().catch(err)],
      v && st ? ['Pick from it', 'Only part of it into the scene (undoable)', [
        ['The colors', 'Its color sliders and palette', () => doPick('colors').catch(err)],
        ['The slider values', 'Every slider as it was', () => doPick('sliders').catch(err)],
        'One layer',
        ...st.layers.map((L) => [L.name, 'Replaced, or put back if it was removed', () => doPick('layer', L.id).catch(err)]),
      ]] : null,
      turns.length ? ['Back before the director', `${turns.length} turn${turns.length === 1 ? '' : 's'} with edits`, [1, 2, 3, 5].filter((n) => n <= turns.length || n === 1).map((n) => [`Before the last ${n === 1 ? 'turn' : `${n} turns`}`, turns[Math.min(n, turns.length) - 1] ? `${C.whoName(turns[Math.min(n, turns.length) - 1].by)}: “${turns[Math.min(n, turns.length) - 1].text}”` : '', () => doBack(n).catch(err)])] : null,
      [grid ? 'One row' : 'All as a grid', 'G', () => { grid = !grid; refresh().catch(err); }],
    ]);
  }

  // ---------- what changed (vs now) ----------
  async function paintDiff(a = list[idx]?.id || 'now', b = 'now', box = diffBox) {
    const c = a === b ? null : await TH.changesBetween(a, b, sid);
    box.replaceChildren(...diffNodes(c));
  }
  function diffNodes(c) {
    if (!c) return [el('div', { class: 'tm-dnone', text: 'This is now: pick an earlier version to see what changed since.' })];
    const out = [el('div', { class: 'tm-dsum', text: c.summary })];
    if (c.added.length) out.push(el('div', { class: 'tm-dl add', text: `+ layers: ${c.added.join(', ')}` }));
    if (c.removed.length) out.push(el('div', { class: 'tm-dl del', text: `− layers: ${c.removed.join(', ')}` }));
    for (const p of c.props) out.push(el('div', { class: 'tm-dl', text: `${p.layer}: ${p.keys.join(', ')}` }));
    if (c.vals.length) out.push(el('div', { class: 'tm-dvals' }, ...c.vals.slice(0, 24).map((x) => el('span', { class: 'tm-dv', title: x.layer }, el('b', { text: x.key }), ' ', swatch(x.from), ' → ', swatch(x.to)))));
    for (const x of c.code) {
      out.push(el('div', { class: 'tm-dl code', text: `${x.layer} · +${x.plus} −${x.minus}` }));
      out.push(el('pre', { class: 'tm-code' }, ...x.lines.map((ln) => el('div', { class: `tm-ln ${ln.op === '+' ? 'add' : ln.op === '-' ? 'del' : ln.op === '…' ? 'gap' : ''}`, text: ln.op === '…' ? '…' : `${ln.op === '=' ? ' ' : ln.op} ${ln.line}` }))));
    }
    if (c.order) out.push(el('div', { class: 'tm-dl', text: 'Layer order changed' }));
    if (c.palette) out.push(el('div', { class: 'tm-dl', text: 'Palette changed' }));
    return out;
  }
  const swatch = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? el('i', { class: 'tm-sw', style: { background: v }, title: v }) : el('span', { text: typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v) }));

  // ---------- compare: two pictures from the preview, a split wipe, and what changed ----------
  async function shotOf(vid) {
    await TH.preview(vid, sid);
    if (typeof ThreeDirector !== 'undefined' && ThreeDirector.settle) await ThreeDirector.settle(1500); else await new Promise((r) => setTimeout(r, 900));
    return ThreeLab.director.shotSmall(720);
  }
  async function compare(a, b) {
    if (!isOpen()) await open();
    const back = list[idx]?.id || 'now';
    closeCompare();
    const label = (vid) => { if (vid === 'now') return 'Now'; const v = list.find((x) => x.id === vid); return v ? `${TH.fmtWhen(v.at)} · ${C.whoName(v.by)}` : '?'; };
    cmp = el('div', { class: 'tm-compare', attrs: { tabindex: '-1' } }, el('div', { class: 'tm-cmp-wait', text: 'Rendering both versions…' }));
    host().append(cmp);
    const ua = await shotOf(a); const ub = await shotOf(b);
    await TH.preview(back, sid);
    if (!cmp) return null;
    const imgA = el('img', { class: 'tm-cmp-a', src: ua || '', alt: '' });
    const imgB = el('img', { class: 'tm-cmp-b', src: ub || '', alt: '' });
    const handle = el('div', { class: 'tm-cmp-handle' });
    const side = el('div', { class: 'tm-cmp-side' });
    const stage = el('div', { class: 'tm-cmp-stage' }, imgA, imgB, handle, el('span', { class: 'tm-cmp-la', text: `◀ ${label(a)}` }), el('span', { class: 'tm-cmp-lb', text: `${label(b)} ▶` }));
    const setX = (u) => { stage.style.setProperty('--x', `${Math.round(Math.max(0, Math.min(1, u)) * 1000) / 10}%`); };
    setX(0.5);
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      const r = stage.getBoundingClientRect();
      const mv = (ev) => setX((ev.clientX - r.left) / r.width);
      mv(e);
      stage.addEventListener('pointermove', mv);
      stage.addEventListener('pointerup', () => stage.removeEventListener('pointermove', mv), { once: true });
    });
    cmp.replaceChildren(el('div', { class: 'tm-cmp-head' }, el('b', { text: 'Compare' }), el('span', { class: 'hint', text: 'drag across the picture' }), el('span', { class: 'spacer' }), btn('✕', 'Close (Esc)', () => closeCompare())), el('div', { class: 'tm-cmp-body' }, stage, side));
    cmp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeCompare(); root?.focus(); } });
    await paintDiff(a, b, side);
    cmp.focus({ preventScroll: true });
    return { a: Boolean(ua), b: Boolean(ub) };
  }
  function closeCompare() { cmp?.remove(); cmp = null; }

  function onKey(e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    const k = e.key;
    let done = true;
    if (k === 'ArrowLeft') step(-1).catch(err);
    else if (k === 'ArrowRight') step(1).catch(err);
    else if (k === 'Home') select(0).catch(err);
    else if (k === 'End') select(list.length).catch(err);
    else if (k === 'Enter') keep().catch(err);
    else if (k === 'Escape') close();
    else if (k.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) compare(list[idx]?.id || 'now', 'now').catch(err);
    else if (k.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) doBranch().catch(err);
    else if (k.toLowerCase() === 'd') { diffOn = !diffOn; diffBox.hidden = !diffOn; paintSel(); }
    else if (k.toLowerCase() === 'g') { grid = !grid; refresh().catch(err); }
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); }
  }
  // new versions and pictures while it's open
  let refT = 0;
  addEventListener('hearth:tm', (e) => { if (isOpen() && e.detail?.id === sid && !TH.scrubbing) { clearTimeout(refT); refT = setTimeout(() => refresh({ toEnd: idx >= list.length }).catch(() => {}), 150); } });
  addEventListener('hearth:tm-thumb', (e) => {
    if (!isOpen() || e.detail?.id !== sid) return;
    tm[e.detail.version] = e.detail.url;
    const pic = strip.querySelector(`.tm-card[data-id="${e.detail.version}"] .tm-pic`);
    if (pic) pic.replaceChildren(el('img', { src: e.detail.url, alt: '', decoding: 'async' }));
  });
  addEventListener('hearth:tm-scrub', (e) => { if (isOpen() && !e.detail?.version && e.detail?.kept) refresh({ toEnd: true }).catch(() => {}); });
  addEventListener('hearth:sketch', (e) => { if (isOpen() && e.detail?.id !== sid) close(); });
  // Alt+H in the Lab (⌥H on a Mac: by its key, since ⌥H types a character)
  addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyH') return;
    if (H.surfaceIdFor?.(H.activeId) !== 'tool:three') return;
    e.preventDefault();
    Promise.resolve(toggle()).catch(err);
  });
  if (typeof Keys !== 'undefined') Keys.add([
    { area: 'Lab time machine', keys: 'Alt+H', what: 'Open / close the time machine (every version of the scene)', run: () => toggle() },
    { area: 'Lab time machine', keys: '← / →', what: 'Older / newer version, shown on the preview (Home / End: first / now)' },
    { area: 'Lab time machine', keys: 'Enter', what: 'Restore the version on screen (undoable)' },
    { area: 'Lab time machine', keys: 'C', what: 'Compare it with now: split wipe + what changed' },
    { area: 'Lab time machine', keys: 'B', what: 'Branch it into a new scene' },
    { area: 'Lab time machine', keys: 'D', what: 'What changed since (layers, code, sliders)' },
    { area: 'Lab time machine', keys: 'G', what: 'All versions as a grid / one row' },
    { area: 'Lab time machine', keys: 'Esc', what: 'Close: the scene as it is now' },
  ]);
  if (typeof AppUI !== 'undefined') AppUI.addAction('Lab: Time machine (every version of the scene) · Alt+H', () => open().catch(err));

  return { open, close, toggle, compare, select, step, keep, isOpen, get index() { return idx; }, get versions() { return list; } };
})();
window.ThreeHistoryUI = ThreeHistoryUI; // the Sketch ▾ menu (tools/three.js) opens it as window.ThreeHistoryUI?.open()
