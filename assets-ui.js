// The asset library's browser (round 24, assets stream): one floating panel (Ctrl/⌘+Shift+A, /assets) beside whatever
// is on screen, so cards drag straight onto the Lab preview, the board, a chat or the sequence. Two tabs: Library (your
// assets) and Free (Poly Haven, ambientCG: assets-sources.js). Compact: one search box, kind icons, everything else in
// ＋ / ⋯ / Filters menus and on right-click.
// The grid is virtualized: only the rows on screen exist (a pool of cards reused while scrolling, positions by
// transform), thumbnails are asked for only by those cards and decode off the main thread; nothing is drawn while the
// panel is closed.
//   AssetsUI.open({ q, tab, kind }) · close() · toggle() · reveal(item) · selected() · get el()
const AssetsUI = (() => {
  const C = AssetsCore;
  const A = Assets;
  let panel = null; let gridEl = null; let space = null; let statusEl = null; let infoEl = null; let searchEl = null; let pillsEl = null; let kindsEl = null; let body = null;
  const S = { tab: 'library', q: '', kind: store.get('assets.kind', null), tag: null, project: null, src: null, fav: false, sort: store.get('assets.sort', 'auto'), sel: null, list: [], scanned: false, big: store.get('assets.big', false) };
  const cards = new Map(); // hash → card node (the ones on screen)
  let geo = { cols: 1, cw: 120, rh: 150, w: 0 };
  let raf = 0;

  // ---------- the panel ----------
  function build() {
    searchEl = el('input', { type: 'search', class: 'as-q', placeholder: 'Search assets… (kind:hdri, #wall, fav)', on: { input: debounce(() => { S.q = searchEl.value; if (S.tab === 'free') AssetsFree.view(body, { q: S.q }); else refilter(); }, 120), keydown: onSearchKey } });
    const tab = (id, label) => el('button', { class: 'as-tab', dataset: { tab: id }, text: label, on: { click: () => setTab(id) } });
    const head = el('div', { class: 'as-head' },
      el('b', { class: 'as-title', text: '🗂 Assets' }),
      el('div', { class: 'as-tabs' }, tab('library', 'Library'), tab('free', 'Free')),
      searchEl,
      el('button', { class: 'ghost small', text: '＋', title: 'Add files, watch a folder, rescan', on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, addMenu()); } } }),
      el('button', { class: 'ghost small', text: '⋯', title: 'Sort, card size, duplicates, the thumbnail cache', on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, moreMenu()); } } }),
      el('button', { class: 'ghost small', text: '×', title: 'Close (Esc)', on: { click: close } }));
    kindsEl = el('div', { class: 'as-kinds' });
    pillsEl = el('div', { class: 'as-pills' });
    space = el('div', { class: 'as-space' });
    gridEl = el('div', { class: 'as-grid', tabIndex: 0, on: { scroll: schedule, keydown: onGridKey } }, space);
    body = el('div', { class: 'as-body' }, gridEl);
    infoEl = el('div', { class: 'as-info' });
    statusEl = el('div', { class: 'as-status' });
    panel = el('div', { class: 'as-panel', attrs: { role: 'dialog', 'aria-label': 'Asset library' }, hidden: true }, head, el('div', { class: 'as-filters' }, kindsEl, pillsEl), body, infoEl, statusEl);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); close(); } });
    // files / folders dropped from the computer join the library (folders are watched)
    panel.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); panel.classList.add('drop-on'); } });
    panel.addEventListener('dragleave', (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop-on'); });
    panel.addEventListener('drop', (e) => {
      if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
      e.preventDefault(); e.stopPropagation(); panel.classList.remove('drop-on');
      const ps = [...e.dataTransfer.files].map((f) => window.hub.pathForFile(f)).filter(Boolean);
      A.add(ps, { src: 'file' }).then((items) => toast(items.length ? `🗂 ${items.length} added to your assets` : 'Folders are watched now; nothing else to add', { timeout: 2600 })).catch((err) => toast(err.message, { type: 'error' }));
    });
    new ResizeObserver(() => { if (!panel.hidden) { measure(); schedule(); } }).observe(gridEl);
    document.body.append(panel);
    A.onChange(onChange);
  }
  function setTab(id) {
    S.tab = id;
    for (const b of panel.querySelectorAll('.as-tab')) b.classList.toggle('on', b.dataset.tab === id);
    panel.classList.toggle('free', id === 'free');
    if (id === 'free') { searchEl.placeholder = 'Search free assets… (brick, sunset)'; AssetsFree.view(body, { q: S.q }); infoEl.hidden = true; }
    else { searchEl.placeholder = 'Search assets… (kind:hdri, #wall, fav)'; body.replaceChildren(gridEl); infoEl.hidden = false; refilter(); }
  }
  async function open(o = {}) {
    if (!panel) build();
    await A.ready();
    if (o.q != null) { S.q = o.q; searchEl.value = o.q; }
    if (o.kind !== undefined) S.kind = o.kind;
    panel.hidden = false;
    setTab(o.tab || (S.tab === 'free' && !o.q ? 'free' : o.tab || 'library'));
    setTimeout(() => searchEl.focus(), 0);
    // nothing scanned at startup: the first open scans the watched folders (and picks up app downloads)
    if (!S.scanned) { S.scanned = true; firstLook().catch((err) => console.warn('assets:', err)); }
    window.Usage?.track?.('assets-open');
    return panel;
  }
  function close() { if (panel) { panel.hidden = true; A.unwant(new Set()); } }
  const isOpen = () => Boolean(panel && !panel.hidden);
  function toggle(o) { return isOpen() ? close() : open(o); }
  async function firstLook() {
    setStatus('Looking in your folders…');
    try { await window.AssetsHooks?.catchUp?.(); } catch { /* the app downloads are a bonus */ }
    const r = await A.scan().catch((err) => ({ error: err.message }));
    A.armIdle();
    setStatus(r?.error ? `Scan: ${r.error}` : null);
  }

  // ---------- filtering ----------
  function refilter() {
    if (!panel || panel.hidden || S.tab !== 'library') return;
    const sort = S.sort === 'auto' ? null : S.sort;
    S.list = A.search(S.q, { kind: S.kind, tag: S.tag, src: S.src, project: S.project, fav: S.fav, sort });
    paintKinds(); paintPills();
    space.style.height = `${Math.ceil(S.list.length / geo.cols) * geo.rh}px`;
    for (const n of cards.values()) n.remove();
    cards.clear();
    gridEl.scrollTop = Math.min(gridEl.scrollTop, Math.max(0, space.offsetHeight - gridEl.clientHeight));
    measure(); render();
    setStatus(null);
    if (!S.list.length) space.replaceChildren(el('div', { class: 'as-empty' }, emptyText()));
    else space.querySelector('.as-empty')?.remove();
    paintInfo();
  }
  function emptyText() {
    const n = A.all().length;
    if (!n) return [el('b', { text: 'Your asset library is empty.' }), el('p', { text: 'Drop files or folders here, ＋ › Watch a folder… (your textures, fonts, sounds), or try the Free tab: Poly Haven and ambientCG.' }), el('button', { class: 'primary small', text: 'Browse free assets', on: { click: () => setTab('free') } })];
    return [el('b', { text: 'Nothing matches.' }), el('p', { text: S.q ? `No asset has “${S.q}”. The Free tab may have one.` : 'No asset with these filters.' }), el('button', { class: 'ghost small', text: 'Clear the filters', on: { click: clearFilters } })];
  }
  function clearFilters() { Object.assign(S, { kind: null, tag: null, project: null, src: null, fav: false, q: '' }); searchEl.value = ''; store.set('assets.kind', null); refilter(); }
  function paintKinds() {
    const c = C.counts(A.db);
    const chip = (k, label, tip, on) => el('button', { class: `as-kind${on ? ' on' : ''}`, text: label, title: tip, on: { click: () => { S.kind = S.kind === k ? null : k; store.set('assets.kind', S.kind); refilter(); } } });
    const want = [chip(null, 'All', `Everything (${c.all})`, !S.kind && !S.fav)];
    for (const k of C.ORDER) if (c[k] || S.kind === k) want.push(chip(k, C.KINDS[k].icon, `${C.KINDS[k].label} (${c[k]})`, S.kind === k));
    want.push(el('button', { class: `as-kind${S.fav ? ' on' : ''}`, text: '★', title: `Favorites (${c.fav})`, on: { click: () => { S.fav = !S.fav; refilter(); } } }));
    want.push(el('button', { class: 'as-kind as-more', text: 'Filters ▾', title: 'Tag, project, source, sort', on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, filterMenu()); } } }));
    const sig = want.map((b) => `${b.textContent}${b.className}`).join('|');
    if (kindsEl.dataset.sig !== sig) { kindsEl.dataset.sig = sig; kindsEl.replaceChildren(...want); } // only when it changed
  }
  function paintPills() {
    const pill = (label, fn) => el('button', { class: 'as-pill', text: `${label} ×`, title: 'Remove this filter', on: { click: fn } });
    pillsEl.replaceChildren(...[
      S.tag ? pill(`#${S.tag}`, () => { S.tag = null; refilter(); }) : null,
      S.project ? pill(`❖ ${S.project}`, () => { S.project = null; refilter(); }) : null,
      S.src ? pill(C.SOURCES[S.src] || S.src, () => { S.src = null; refilter(); }) : null,
    ].filter(Boolean));
  }
  function filterMenu() {
    const tags = C.topTags(A.db, 40, S.kind);
    const projects = window.Projects?.live?.() || [];
    const srcs = [...new Set(A.all().map((x) => x.src))];
    return [
      { label: 'Tag', items: () => (tags.length ? tags.map(({ t, c }) => ({ label: `#${t}`, hint: String(c), action: () => { S.tag = t; refilter(); } })) : [{ label: 'No tags yet (right-click a card › Tags…)', disabled: true }]) },
      { label: 'Project', items: () => (projects.length ? projects.map((p) => ({ label: `${p.ident?.glyph || '❖'} ${p.name}`, action: () => { S.project = p.name; refilter(); } })) : [{ label: 'No projects yet (/project new)', disabled: true }]) },
      { label: 'Source', items: () => srcs.map((s) => ({ label: C.SOURCES[s] || s, hint: String(A.all().filter((x) => x.src === s).length), action: () => { S.src = s; refilter(); } })) },
      { label: 'Sort', items: () => [['auto', 'Best match / recent'], ['recent', 'Recently used or added'], ['name', 'Name'], ['size', 'Biggest first']].map(([k, l]) => ({ label: `${S.sort === k ? '✓ ' : ''}${l}`, action: () => { S.sort = k; store.set('assets.sort', k); refilter(); } })) },
      '-',
      { label: 'Clear the filters', action: clearFilters },
    ];
  }

  // ---------- the virtualized grid ----------
  function measure() {
    const w = gridEl.clientWidth - 8;
    if (w <= 0) return;
    const min = S.big ? 168 : 112;
    const cols = Math.max(1, Math.floor(w / min));
    const cw = Math.floor(w / cols);
    const g = { cols, cw, rh: cw + 36, w };
    if (g.cols !== geo.cols || g.cw !== geo.cw) { geo = g; space.style.height = `${Math.ceil(S.list.length / geo.cols) * geo.rh}px`; for (const n of cards.values()) n.dataset.pos = ''; }
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
  function render() {
    if (!panel || panel.hidden || S.tab !== 'library') return;
    const top = gridEl.scrollTop; const h = gridEl.clientHeight || 400;
    const r0 = Math.max(0, Math.floor(top / geo.rh) - 1); const r1 = Math.ceil((top + h) / geo.rh) + 1;
    const from = r0 * geo.cols; const to = Math.min(S.list.length, r1 * geo.cols);
    const keep = new Set();
    for (let i = from; i < to; i += 1) {
      const it = S.list[i];
      keep.add(it.h);
      let n = cards.get(it.h);
      if (!n) { n = card(it); cards.set(it.h, n); space.append(n); }
      const pos = `${(i % geo.cols) * geo.cw},${Math.floor(i / geo.cols) * geo.rh},${geo.cw}`;
      if (n.dataset.pos !== pos) { n.dataset.pos = pos; n.style.transform = `translate(${(i % geo.cols) * geo.cw}px, ${Math.floor(i / geo.cols) * geo.rh}px)`; n.style.width = `${geo.cw - 8}px`; n.style.height = `${geo.rh - 8}px`; }
    }
    for (const [hsh, n] of cards) if (!keep.has(hsh)) { n.remove(); cards.delete(hsh); }
    A.unwant(keep); // a fast scroll doesn't leave a backlog of pictures nobody sees
  }
  function picOf(it) {
    const src = A.thumb(it);
    if (src) return el('img', { src, alt: '', loading: 'lazy', decoding: 'async', draggable: false, on: { error: (e) => { it.t = 0; it.tp = null; e.target.replaceWith(placeholder(it)); } } });
    return placeholder(it);
  }
  function placeholder(it) {
    const extra = it.k === 'shader' || it.k === 'preset' ? it.i?.first || '' : it.k === 'model' && it.i?.tris ? (it.i.tris < 1000 ? `${it.i.tris} triangle${it.i.tris > 1 ? 's' : ''}` : `${Math.round(it.i.tris / 1000)}k triangles`) : it.k === 'hdri' && it.x === 'exr' ? 'EXR' : '';
    return el('div', { class: `as-ph as-ph-${it.k}` }, el('span', { class: 'as-ico', text: C.KINDS[it.k]?.icon || '▫' }), extra ? el('small', { text: extra }) : null);
  }
  function sub(it) {
    const i = it.i || {};
    if (it.k === 'image' && i.w) return `${i.w}×${i.h}${i.maps ? ' · PBR' : ''}`;
    if (it.k === 'hdri') return `${i.res ? i.res.toUpperCase() : it.x.toUpperCase()} · ${C.size(it.s)}`;
    if (it.k === 'sound' && i.dur) return `${Math.floor(i.dur / 60)}:${String(Math.round(i.dur % 60)).padStart(2, '0')}`;
    if (it.k === 'model' && i.clips?.length) return `${i.clips.length} clip${i.clips.length > 1 ? 's' : ''} · ${it.x.toUpperCase()}`;
    if (it.k === 'font' && i.fam && i.fam !== it.n) return i.fam;
    return it.tg?.slice(0, 2).map((t) => `#${t}`).join(' ') || `${it.x.toUpperCase()} · ${C.size(it.s)}`;
  }
  function card(it) {
    const n = el('div', { class: `as-card${it.f ? ' fav' : ''}${it.g ? ' gone' : ''}${S.sel === it.h ? ' sel' : ''}`, draggable: !it.g, tabIndex: -1, dataset: { h: it.h },
      title: `${it.n}\n${C.KINDS[it.k]?.one || it.k} · ${C.size(it.s)} · ${C.SOURCES[it.src] || it.src}${it.o ? ` (${it.o})` : ''}${it.tg?.length ? `\n#${it.tg.join(' #')}` : ''}${it.alt?.length ? `\nAlso at ${it.alt.length} other place${it.alt.length > 1 ? 's' : ''}` : ''}\n${it.p}`,
      on: {
        click: () => select(it.h),
        dblclick: () => useIt(it),
        contextmenu: (e) => { e.preventDefault(); select(it.h); showMenu(e.clientX, e.clientY, cardMenu(it)); },
        dragstart: (e) => dragStart(e, it),
      } },
    el('div', { class: 'as-pic' }, picOf(it)), el('b', { text: it.n }), el('small', { text: sub(it) }), it.f ? el('i', { class: 'as-star', text: '★' }) : null);
    return n;
  }
  function onChange(why, data) {
    if (!isOpen()) return;
    if (why === 'thumb') {
      const it = A.get(data?.h); const n = it && cards.get(it.h);
      if (n) { const pic = n.querySelector('.as-pic'); const src = A.thumb(it, { ask: false }); const img = pic.querySelector('img'); if (src && img?.getAttribute('src') !== src) pic.replaceChildren(picOf(it)); else if (!src && !img) pic.replaceChildren(placeholder(it)); const s = n.querySelector(':scope > small'); const t = sub(it); if (s && s.textContent !== t) s.textContent = t; }
      return;
    }
    if (why === 'use') return;
    clearTimeout(onChange.t); onChange.t = setTimeout(refilter, 150);
  }

  // ---------- selecting, the info line, keys ----------
  function select(h) {
    if (S.sel && cards.get(S.sel)) cards.get(S.sel).classList.remove('sel');
    S.sel = h;
    cards.get(h)?.classList.add('sel');
    paintInfo();
  }
  const selected = () => (S.sel ? A.get(S.sel) : null);
  function paintInfo() {
    const it = selected();
    if (!it) { infoEl.replaceChildren(el('span', { class: 'hint', text: 'Double-click: use in the Lab · drag onto the Lab, the board, a chat or the sequence · right-click: Use in…' })); return; }
    const tag = (t) => el('button', { class: 'as-tagbtn', text: `#${t}`, title: 'Only this tag', on: { click: () => { S.tag = t; refilter(); } } });
    infoEl.replaceChildren(el('b', { text: it.n }), el('span', { text: ` ${C.KINDS[it.k]?.one} · ${C.size(it.s)}${it.i?.lic ? ` · ${it.i.lic}` : ''} · ${C.SOURCES[it.src] || it.src} ` }), ...(it.tg || []).slice(0, 6).map(tag),
      el('button', { class: 'as-tagbtn', text: '＋tag', title: 'Edit the tags (T)', on: { click: () => editTags(it) } }));
  }
  function onSearchKey(e) {
    if (e.key === 'ArrowDown' && S.tab === 'library') { e.preventDefault(); gridEl.focus(); if (!S.sel && S.list[0]) select(S.list[0].h); }
    if (e.key === 'Enter' && S.tab === 'library' && S.list[0]) { e.preventDefault(); const it = selected() || S.list[0]; useIt(it); }
    if (e.key === 'Tab' && !e.shiftKey && S.tab === 'library' && !S.q) { /* the browser's own focus order */ }
  }
  function onGridKey(e) {
    const i = S.list.findIndex((x) => x.h === S.sel);
    const go = (j) => { const it = S.list[Math.max(0, Math.min(S.list.length - 1, j))]; if (!it) return; select(it.h); const row = Math.floor(S.list.indexOf(it) / geo.cols) * geo.rh; if (row < gridEl.scrollTop || row + geo.rh > gridEl.scrollTop + gridEl.clientHeight) gridEl.scrollTop = row - geo.rh; };
    const it = selected();
    if (e.key === 'ArrowRight') go(i + 1); else if (e.key === 'ArrowLeft') go(i - 1); else if (e.key === 'ArrowDown') go(i + geo.cols); else if (e.key === 'ArrowUp') { if (i < geo.cols) searchEl.focus(); else go(i - geo.cols); }
    else if (e.key === 'Enter' && it) useIt(it);
    else if ((e.key === 'f' || e.key === 'F') && it) { C.toggleFav(it); A.changed('edit', { items: [it] }); }
    else if ((e.key === 't' || e.key === 'T') && it) editTags(it);
    else if (e.key === 'Delete' && it) forget(it);
    else if (e.key === '/') searchEl.focus();
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { const n = cards.get(S.sel); if (n && it) { const r = n.getBoundingClientRect(); showMenu(r.left + 10, r.top + 20, cardMenu(it)); } }
    else return;
    e.preventDefault();
  }

  // ---------- actions ----------
  const fail = (err) => toast(err.message || String(err), { type: 'error', timeout: 6000 });
  function useIt(it, target = null, o = {}) { return A.use(it, target, o).then((w) => { if (w) toast(w, { timeout: 2600 }); return w; }).catch(fail); }
  async function editTags(it) {
    const v = await Modal.prompt(`Tags for ${it.n}`, { value: (it.tg || []).join(' '), placeholder: 'brick wall red (spaces or commas)', label: 'Tags' });
    if (v == null) return;
    C.setTags(it, v);
    A.changed('edit', { items: [it] });
  }
  async function rename(it) {
    const v = await Modal.prompt('Rename this asset', { value: it.n });
    if (!v) return;
    it.n = v.trim().slice(0, 80); it.rn = 1;
    A.changed('edit', { items: [it] });
  }
  function forget(it) {
    const was = { ...it };
    C.forget(A.db, it.h);
    A.changed('forget', { items: [it] });
    toast(`${it.n} left the library (the file stays)`, { timeout: 5000, action: { label: 'Undo', fn: () => { A.db.items[was.h] = was; A.changed('add', { items: [was] }); } } });
  }
  function useMenu(it) {
    const tg = A.targets(it);
    return tg.map((t) => ({ label: A.LABEL[t], action: () => (t === 'chat' ? useIt(it, 'chat') : t === 'channel' ? channelMenu(it) : t === 'text' ? textPrompt(it) : useIt(it, t)) }));
  }
  function channelMenu(it) {
    const r = panel.getBoundingClientRect();
    showMenu(r.left + 40, r.top + 80, [0, 1, 2, 3].map((n) => ({ label: `iChannel${n}`, action: () => useIt(it, 'channel', { channel: n }) })));
  }
  async function textPrompt(it) {
    const words = await Modal.prompt(`A text layer in ${it.i?.fam || it.n}`, { value: 'HEARTH', label: 'Words' });
    if (words) useIt(it, 'text', { words });
  }
  function cardMenu(it) {
    const projects = window.Projects?.live?.() || [];
    const agents = H.agents().filter((a) => a.mode === 'native');
    return [
      { label: `▶ ${A.LABEL[A.labDefault(it)]}`, hint: 'double-click', action: () => useIt(it) },
      { label: 'Use in…', items: () => [...useMenu(it).filter((x) => !/This chat/.test(x.label)), '-', { label: '💬 A chat', items: () => agents.map((a) => ({ label: a.name, action: () => useIt(it, 'chat', { agentId: a.id }) })) }] },
      '-',
      { label: it.f ? '☆ Not a favorite' : '★ Favorite', key: 'F', action: () => { C.toggleFav(it); A.changed('edit', { items: [it] }); } },
      { label: 'Tags…', key: 'T', action: () => editTags(it) },
      { label: 'Rename…', action: () => rename(it) },
      { label: 'Project', items: () => (projects.length ? projects.slice(0, 12).map((p) => ({ label: `${p.ident?.glyph || '❖'} ${p.name}`, action: () => A.toProject(it, p.id).then((p2) => toast(`In ${p2.name}`, { timeout: 2000 })).catch(fail) })) : [{ label: 'No projects yet (/project new)', disabled: true }]) },
      '-',
      { label: 'Reveal in Finder / Explorer', action: () => window.hub.fs.reveal(it.p) },
      { label: 'Copy path', action: () => copyText(it.p) },
      it.alt?.length ? { label: `Duplicates (${it.alt.length})`, items: () => it.alt.map((p) => ({ label: C.base(p), hint: p.length > 60 ? `…${p.slice(-56)}` : p, action: () => window.hub.fs.reveal(p) })) } : null,
      it.src !== 'import' ? { label: 'Import a copy into Hearth', hint: 'kept even if the original moves', action: () => A.importCopy(it).then(() => toast(`${it.n} is copied into Hearth's library`, { timeout: 2400 })).catch(fail) } : null,
      it.i?.page ? { label: 'Its page (license, credits)', action: () => window.hub.openExternal(it.i.page) } : null,
      it.k === 'image' && it.i?.maps ? { label: 'Its other maps', items: () => Object.entries(it.i.maps).map(([role, p]) => ({ label: role, action: () => window.hub.fs.reveal(p) })) } : null,
      '-',
      { label: 'Remove from the library', hint: 'the file stays', danger: true, key: 'Delete', action: () => forget(it) },
    ].filter(Boolean);
  }
  function addMenu() {
    return [
      { label: 'Add files…', action: async () => { const r = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'] }); const ps = Array.isArray(r) ? r : r?.filePaths || []; if (ps.length) { const items = await A.add(ps, { src: 'file' }); toast(`🗂 ${items.length} added`, { timeout: 2000 }); } } },
      { label: 'Watch a folder…', hint: 'your textures, fonts, sounds: kept up to date', action: async () => { const p = await window.hub.pickFolder(null, 'A folder of assets to watch'); if (p) watchFolder(p); } },
      { label: 'Watched folders', items: () => (A.folders().length ? A.folders().map((f) => ({ label: C.base(f.p) || f.p, hint: `${f.n} files${f.at ? ` · ${timeAgo(f.at)}` : ''}`, items: [
        { label: 'Show it', action: () => window.hub.fs.reveal(f.p) }, { label: 'Scan it now', action: () => rescan([f.p]) }, { label: 'Stop watching', danger: true, action: () => A.unwatch(f.p, { forgetItems: true }).then(() => toast('Stopped watching (its files left the library)', { timeout: 2400 })) }] })) : [{ label: 'None yet', disabled: true }]) },
      { label: 'Rescan now', action: () => rescan(null) },
      '-',
      { label: '🎚 Save the selected layer\'s sliders as a preset', action: () => A.savePreset().then((it) => toast(`🎚 ${it.n} is a preset in your assets`, { timeout: 2400 })).catch(fail) },
      { label: 'Free assets (Poly Haven, ambientCG)', action: () => setTab('free') },
    ];
  }
  async function watchFolder(p) {
    setStatus(`Scanning ${C.base(p)}…`);
    try { const f = await A.watch(p); toast(`🗂 Watching ${C.base(p)} (${f?.n || 0} files)`, { timeout: 2600 }); } catch (err) { fail(err); }
    setStatus(null);
  }
  async function rescan(only) {
    setStatus('Scanning…');
    try { const r = await A.scan({ only, force: true }); toast(`🗂 ${r.added} new, ${r.removed} gone`, { timeout: 2200 }); } catch (err) { fail(err); }
    setStatus(null);
  }
  function moreMenu() {
    const c = C.counts(A.db);
    return [
      { label: S.big ? 'Smaller cards' : 'Bigger cards', action: () => { S.big = !S.big; store.set('assets.big', S.big); measure(); refilter(); } },
      { label: 'Sort', items: () => filterMenu().find((x) => x.label === 'Sort').items() },
      { label: `Duplicates (${c.dupes})`, hint: 'the same file in two places', action: () => { S.q = ''; searchEl.value = ''; S.list = A.all().filter((x) => x.alt?.length); refilterRaw(); } },
      { label: `Files gone (${c.gone})`, action: () => { S.list = A.all().filter((x) => x.g); refilterRaw(); } },
      '-',
      { label: 'Thumbnail cache…', action: async () => { const i = await window.hub.assets.cacheInfo(); if (await Modal.confirm('Thumbnail cache', `${i.files} pictures, ${C.size(i.bytes)}. They are remade when you scroll past them. Clear it?`, { ok: 'Clear' })) { await window.hub.assets.clearThumbs(); for (const it of A.all()) if (it.t === 1) it.t = 0; A.changed('edit'); } } },
      { label: 'Help', action: () => Commands.exec('/help assets', H.claudeAgent()?.id).catch(() => {}) },
    ];
  }
  function refilterRaw() { space.style.height = `${Math.ceil(S.list.length / geo.cols) * geo.rh}px`; for (const n of cards.values()) n.remove(); cards.clear(); gridEl.scrollTop = 0; render(); paintInfo(); }
  function setStatus(text) {
    if (!statusEl) return;
    const c = C.counts(A.db || C.empty());
    const t = text || `${c.all.toLocaleString()} asset${c.all === 1 ? '' : 's'}${A.folders().length ? ` · ${A.folders().length} watched folder${A.folders().length > 1 ? 's' : ''}` : ''}${S.list.length !== c.all && S.tab === 'library' ? ` · ${S.list.length} shown` : ''}`;
    if (statusEl.textContent !== t) statusEl.textContent = t;
  }

  // ---------- dragging out ----------
  // the asset travels as its hash; media also as a path the sequence and the chats already take (text/x-hearth-video)
  function dragStart(e, it) {
    const dt = e.dataTransfer;
    dt.setData('application/x-hearth-asset', it.h);
    dt.setData('text/plain', it.p);
    if (['image', 'sound', 'video'].includes(it.k)) dt.setData('text/x-hearth-video', it.p);
    dt.effectAllowed = 'copy';
    const img = cards.get(it.h)?.querySelector('img');
    if (img) dt.setDragImage(img, 30, 30);
    window.AssetsHooks?.dragging?.(it);
  }
  function reveal(it) { open({ q: it.n }).then(() => select(it.h)); }

  return { open, close, toggle, isOpen, reveal, selected, setTab, refilter, get el() { return panel; }, get state() { return S; }, cardMenu, useIt, _render: render };
})();
window.AssetsUI = AssetsUI;
