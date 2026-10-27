// Search everything (round 23, projects): one search across your projects, chats (titles at once, then the messages
// through the store thread's index from round 20), Lab scenes (names, layer names, code, named sliders), boards (names,
// and every item's title / caption / text / link), renders and captures, the chats' workspace files, downloads,
// deploys and commands. Ctrl/⌘+Shift+K (or /everything <words>, or Home's search box); type filters as chips (Tab and
// Shift+Tab move between them, or start with "scene:", "chat:"…), ↑ ↓ Enter, right-click for a result's menu (its
// project…); a result opens where it lives (the chat, the scene in the Lab, the board zoomed on the item, the file).
// Nothing runs while you don't search: the sources are read on the first keystroke, cached ~20 s.
const ProjectsSearch = (() => {
  const P = Projects;
  const C = ProjectsCore;
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const FILTERS = [
    { id: '', label: 'All' },
    { id: 'project', label: 'Projects', types: ['project'] },
    { id: 'chat', label: 'Chats', types: ['chat'] },
    { id: 'scene', label: 'Scenes', types: ['scene'] },
    { id: 'board', label: 'Boards', types: ['board'] },
    { id: 'render', label: 'Renders', types: ['render', 'capture'] },
    { id: 'file', label: 'Files', types: ['file', 'download', 'deploy'] },
    { id: 'command', label: 'Commands', types: ['command'] },
  ];
  const PREFIX = { project: 'project', projects: 'project', chat: 'chat', chats: 'chat', scene: 'scene', scenes: 'scene', sketch: 'scene', lab: 'scene', board: 'board', boards: 'board', render: 'render', renders: 'render', capture: 'render', file: 'file', files: 'file', cmd: 'command', command: 'command', commands: 'command' };
  const ICON = { ...Object.fromEntries(Object.entries(C.TYPES).map(([k, v]) => [k, v.icon])), project: '▣', command: '/' };
  const KIND = { project: 'Project', command: 'Command', ...Object.fromEntries(Object.entries(C.TYPES).map(([k, v]) => [k, v.label])) };

  // ---------- the documents (built once per ~20 s, when a search starts) ----------
  let docsAt = 0;
  let docsP = null;
  const STR_KEYS = ['title', 'caption', 'text', 'name', 'url', 'note', 'label', 'alt', 'prompt'];
  async function build() {
    const out = [];
    const L = await P.lookFor();
    for (const p of P.live()) out.push({ type: 'project', ref: p.id, title: p.name, sub: C.countText(p), body: (p.notes || '').toLowerCase(), at: Math.max(p.updated || 0, p.opened || 0), mark: p.ident.glyph, color: p.ident.color });
    for (const c of H.chats || []) out.push({ type: 'chat', ref: c.id, title: c.title || 'Chat', sub: H.agent(c.agentId)?.name || '', at: c.updatedAt || 0 });
    for (const s of (await P.Src.sketches()) || []) { // (round 73) the scenes whole here (their code is searched): lookFor() has their names only
      const layers = s.layers?.length ? s.layers : [{ name: 'main', code: s.code }];
      const sliders = [...new Set(layers.flatMap((l) => C.sliderNames(l.code)))];
      out.push({ type: 'scene', ref: s.id, title: s.name || 'Scene', sub: `${layers.length} layer${layers.length === 1 ? '' : 's'}${sliders.length ? ` · sliders: ${sliders.slice(0, 6).join(', ')}` : ''}`,
        body: `${layers.map((l) => `${l.name || ''} ${String(l.code || '').slice(0, 40000)}`).join('\n')} ${sliders.join(' ')}`.toLowerCase(), code: true, at: s.updatedAt || 0 });
    }
    for (const b of L.boards.values()) {
      out.push({ type: 'board', ref: b.id, title: b.name || 'Board', sub: `${b.count || 0} item${b.count === 1 ? '' : 's'}`, at: b.updated || 0 });
      const full = await P.Src.board(b.id, b.updated);
      for (const it of full?.items || []) {
        const words = STR_KEYS.map((k) => (typeof it[k] === 'string' ? it[k] : '')).filter(Boolean);
        if (!words.length) continue;
        const title = C.cap(it.title || it.caption || it.name || it.text || it.label || base(it.src || it.url || '') || it.type, 80);
        out.push({ type: 'board', ref: b.id, item: it.id, title, sub: `${b.name} · ${it.type}`, body: words.join(' ').toLowerCase(), at: it.added || b.updated || 0 });
      }
    }
    for (const r of L.renders.values()) if (r.output && !r.trashed) out.push({ type: 'render', ref: r.id, title: r.title || base(r.output), sub: base(r.output), at: r.ended || 0 });
    for (const c of L.captures.values()) out.push({ type: 'capture', ref: c.path, title: c.name, sub: c.kind === 'video' ? 'recording' : 'screenshot', at: c.mtime || 0 });
    try {
      const ws = await P.Src.workspace();
      const rel = (p) => p.slice(ws.dir.length + 1);
      for (const f of ws.folders) out.push({ type: 'file', ref: f.path, title: f.name, sub: 'workspace folder', at: 0 });
      for (const f of ws.files) out.push({ type: 'file', ref: f.path, title: f.name, sub: rel(f.path).replace(/[\\/][^\\/]*$/, '') || 'workspace', at: f.mtime || 0 });
    } catch { /* no workspace */ }
    for (const d of (await P.Src.downloads()) || []) if (d.path) out.push({ type: 'download', ref: d.path, title: d.name || base(d.path), sub: 'download', at: d.at || 0 });
    for (const d of (await P.Src.deploys()) || []) if (d.url) out.push({ type: 'deploy', ref: d.id || d.url, title: d.name || d.slug || d.url, sub: d.url, at: d.at || 0 });
    for (const d of Commands.list()) if (!d.hidden) out.push({ type: 'command', ref: d.name, title: `/${d.name}`, sub: d.desc || '', body: `${d.keywords || ''} ${(d.aliases || []).join(' ')} ${d.area || ''}`.toLowerCase(), at: 0 });
    return out;
  }
  function docs() {
    if (!docsP || Date.now() - docsAt > 20000) { docsAt = Date.now(); docsP = build().catch((err) => { console.warn('search', err); docsP = null; return []; }); }
    return docsP;
  }
  const fresh = () => { docsP = null; };
  P.onChange(fresh);

  // what a query finds (also /everything from chat): { hits, messages } where messages come from the chats' index
  async function find(q, filter = '') {
    let words = String(q || '').trim();
    const m = /^(\w+):\s*(.*)$/.exec(words);
    if (m && PREFIX[m[1].toLowerCase()]) { filter = PREFIX[m[1].toLowerCase()]; words = m[2]; }
    const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
    const all = await docs();
    const pool = f.types ? all.filter((d) => f.types.includes(d.type)) : all;
    let hits = C.search(words, pool, { limit: f.types ? 80 : 200 });
    // All: no more than 8 of a kind, so every kind gets a line
    if (!f.types) { const per = {}; hits = hits.filter((h) => (per[h.type] = (per[h.type] || 0) + 1) <= 8).slice(0, 60); }
    return { hits, words, filter: f.id };
  }
  async function messages(words) {
    if (String(words).trim().length < 2) return [];
    try { return ((await window.hub.searchChatText(words)) || []).slice(0, 20).map((h) => ({ type: 'chat', ref: h.id, title: h.title || 'Chat', sub: `${h.count} message${h.count === 1 ? '' : 's'} · ${h.snippet || ''}`, at: h.updatedAt || 0, msg: true })); } catch { return []; }
  }

  // ---------- opening a result ----------
  async function open(d) {
    if (d.type === 'project') { const p = P.get(d.ref); if (p) P.openHome(p.id); return; }
    // a command goes in the chat box of the chat in front of you (nothing runs until you press Enter)
    if (d.type === 'command') { const a = H.agent(H.activeId); const id = a?.mode === 'native' ? a.id : H.claudeAgent()?.id; if (!id) return; if (H.activeId !== id) activate(id); Native.setDraft(id, `/${d.ref} `); Native.focus?.(id); return; }
    if (d.type === 'board' && d.item) { if (await P.openBoard(d.ref)) { try { Board.select([d.item]); Board.zoomSel?.(); } catch { /* the item is gone */ } } return; }
    await P.openItem(d);
  }
  function menuOf(d) {
    if (d.type === 'project') { const p = P.get(d.ref); return p ? P.menu(p) : []; }
    if (d.type === 'command') return [{ label: 'Open', action: () => open(d) }];
    const owner = P.ofItem(d.type, d.ref)[0] || null;
    return [{ label: 'Open', action: () => open(d) }, ...P.itemMenu(owner, { ...d, name: d.title }).slice(1)];
  }

  // ---------- the list (the Ctrl/⌘+Shift+K overlay and Home's search box share it) ----------
  // view({ input, list, chips, onDone }) wires a search box to a result list; returns { run(), set(q, filter) }
  function view({ input, list, chips, onDone = () => {}, empty = 'Type to search your projects, chats, scenes, boards, renders, files and commands' }) {
    let filter = '';
    let sel = 0;
    let shown = [];
    let n = 0;
    let msgT = 0;
    const paintChips = () => { if (!chips) return; for (const b of chips.children) b.classList.toggle('on', b.dataset.f === filter); };
    if (chips) for (const f of FILTERS) chips.append(el('button', { type: 'button', class: 'pj-chip', text: f.label, dataset: { f: f.id }, on: { click: () => { filter = f.id; paintChips(); run(); input.focus(); } } }));
    paintChips();
    const kindOf = (d) => `${KIND[d.type] || d.type}${d.msg ? ' · messages' : ''}${d.at ? ` · ${timeAgo(d.at)}` : ''}`;
    function rowOf(d, i) {
      const proj = d.type !== 'project' && d.type !== 'command' ? P.ofItem(d.type, d.ref)[0] : null;
      const label = el('div', { class: 'p-label' }, el('span', { class: 'pj-ricon', text: d.mark || ICON[d.type] || '•', style: d.color ? { color: d.color } : null }), ` ${d.title}`);
      const r = el('div', { class: `palette-item pj-result${i === sel ? ' sel' : ''}`, dataset: { i: String(i) } }, label,
        el('div', { class: 'p-kind' }, proj ? el('span', { class: 'pj-rproj', text: `${proj.ident.glyph} ${proj.name} · `, style: { color: proj.ident.color } }) : null, kindOf(d)),
        d.sub || d.code ? el('div', { class: 'p-detail', text: d.code && input.value.trim() && !d.title.toLowerCase().includes(input.value.trim().toLowerCase().split(/\s+/)[0]) ? C.snippet(d.body, input.value) : d.sub }) : null);
      return r;
    }
    function paint() {
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      if (!shown.length) { list.replaceChildren(el('div', { class: 'palette-empty', text: input.value.trim() ? 'Nothing matches' : empty })); return; }
      list.replaceChildren(...shown.map(rowOf));
    }
    const mark = () => { for (const r of list.querySelectorAll('.pj-result')) r.classList.toggle('sel', Number(r.dataset.i) === sel); list.querySelector('.pj-result.sel')?.scrollIntoView({ block: 'nearest' }); };
    async function run() {
      const k = ++n;
      const q = input.value;
      if (!q.trim()) { shown = []; paint(); return; }
      const r = await find(q, filter);
      if (k !== n) return;
      if (r.filter !== filter) { filter = r.filter; paintChips(); }
      shown = r.hits;
      sel = 0;
      paint();
      // the messages of every chat, from the store thread's index (a moment later, after typing stops)
      clearTimeout(msgT);
      if (!['', 'chat'].includes(filter)) return;
      msgT = setTimeout(async () => {
        const ms = await messages(r.words);
        if (k !== n || !ms.length) return;
        const have = new Set(shown.filter((d) => d.type === 'chat').map((d) => d.ref));
        shown = [...shown, ...ms.filter((m) => !have.has(m.ref))];
        paint();
      }, 180);
    }
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); } else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); } else if (e.key === 'Enter') { e.preventDefault(); const d = shown[sel]; if (d) { onDone(); open(d); } } else if (e.key === 'Tab' && chips) {
        e.preventDefault();
        const i = FILTERS.findIndex((f) => f.id === filter);
        filter = FILTERS[(i + (e.shiftKey ? FILTERS.length - 1 : 1)) % FILTERS.length].id;
        paintChips(); run();
      } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = list.querySelector('.pj-result.sel')?.getBoundingClientRect(); if (r && shown[sel]) showMenu(r.left + 30, r.bottom, menuOf(shown[sel])); }
    });
    list.addEventListener('click', (e) => { const r = e.target.closest('.pj-result'); if (!r) return; const d = shown[Number(r.dataset.i)]; if (d) { onDone(); open(d); } });
    list.addEventListener('contextmenu', (e) => { const r = e.target.closest('.pj-result'); if (!r) return; e.preventDefault(); sel = Number(r.dataset.i); mark(); const d = shown[sel]; if (d) showMenu(e.clientX, e.clientY, menuOf(d)); });
    list.addEventListener('mousemove', (e) => { const r = e.target.closest('.pj-result'); if (r && Number(r.dataset.i) !== sel) { sel = Number(r.dataset.i); mark(); } });
    paint();
    return { run, set(q = '', f = '') { input.value = q; filter = f; paintChips(); return run(); }, shown: () => shown.slice(), filter: () => filter };
  }

  // ---------- the overlay ----------
  let box = null;
  let ui = null;
  function close() { box?.remove(); }
  function openSearch(q = '', filter = '') {
    if (!box) {
      const input = el('input', { class: 'palette-input pj-search-input', placeholder: 'Search everything: projects, chats, scenes, boards, renders, files, commands…', spellcheck: false });
      const chips = el('div', { class: 'pj-chips' });
      const list = el('div', { class: 'palette-list pj-search-list' });
      box = el('div', { class: 'palette pj-search', on: { pointerdown: (e) => { if (e.target === box) close(); } } },
        el('div', { class: 'palette-card' }, input, chips, list, el('div', { class: 'pj-search-foot', text: '↑ ↓ Enter open · Tab: kind · right-click: more · Esc' })));
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
      ui = view({ input, list, chips, onDone: close });
      P.warm?.();
    }
    if (!box.isConnected) document.body.append(box);
    const input = box.querySelector('input');
    input.focus();
    if (q || filter || !input.value) ui.set(q || input.value, filter || ui.filter());
    else input.select();
    return ui;
  }
  const isOpen = () => Boolean(box?.isConnected);

  return { open: openSearch, close, isOpen, view, find, messages, docs, fresh, openResult: open, FILTERS };
})();
window.ProjectsSearch = ProjectsSearch;
