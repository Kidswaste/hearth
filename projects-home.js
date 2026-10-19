// Home (round 23, projects): one rail entry (⌂, /home) with your projects as cards — a cover (the latest render or
// still, else the latest scene's picture, a board's), the mark and name in the project's color, what it holds, and
// "continue where you left off" (its last chat, last scene, last render, one click each). Above them: one search box
// (the same search as Ctrl/⌘+Shift+K), ＋ New project, and the suggestions ("these 4 chats and 3 scenes are about
// “Stoop Ronin”: make it a project?"). A card opens the project's page: its cover, name, mark, status, notes and
// everything in it by kind, each opening where it lives (right-click: cover, reveal, take out…).
// Light: cards are drawn 24 at a time as you scroll (an observer at the end of the grid), pictures load lazily
// and decode off the main thread; nothing is drawn while Home isn't on screen (a change only marks it stale).
const ProjectsHome = (() => {
  const P = Projects;
  const C = ProjectsCore;
  const CHUNK = 24;
  const S = { mounted: false, root: null, body: null, open: null, stale: true, search: null, io: null };
  // Inactive surfaces use visibility:hidden, so offsetParent still exists. Do not scan
  // project assets or rebuild cards behind Chat/Life (nor force layout to find out).
  const visible = () => S.mounted && S.root?.isConnected && !document.hidden && H.surfaceIdFor(H.activeId) === 'tool:home';
  const tint = (node, color) => { node.style.setProperty('--pj', color); return node; };
  const showMenuAt = (e, items) => { e.preventDefault(); showMenu(e.clientX, e.clientY, items); };

  function mount(body) {
    S.mounted = true;
    const input = el('input', { class: 'pj-home-search', type: 'search', placeholder: 'Search everything… (Ctrl+Shift+K)', spellcheck: false });
    const chips = el('div', { class: 'pj-chips pj-home-chips' });
    const results = el('div', { class: 'palette-list pj-home-results' });
    const quick = el('div', { class: 'pj-quick' },
      el('button', { type: 'button', class: 'primary small', text: '＋ New project', title: 'A dedicated chat, scene, sound desk and moodboard', on: { click: () => newProject() } }),
      el('button', { type: 'button', class: 'ghost small pj-quick-more', text: '⋯', title: 'More: a new chat, the Lab, grouping in the chats list, archived projects', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); showMenu(b.left, b.bottom + 4, moreMenu()); } } }));
    const head = el('div', { class: 'pj-home-head' }, el('h2', { text: 'Projects' }), input, quick);
    S.body = el('div', { class: 'pj-home-body' });
    S.root = el('div', { class: 'pj-home' }, head, el('div', { class: 'pj-home-find', hidden: true }, chips, results), S.body);
    body.append(S.root);
    S.search = ProjectsSearch.view({ input, list: results, chips, empty: '' });
    input.addEventListener('input', () => { const on = Boolean(input.value.trim()); S.root.querySelector('.pj-home-find').hidden = !on; S.body.hidden = on; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; input.dispatchEvent(new Event('input')); } });
    P.onChange(() => { S.stale = true; if (visible()) paintSoon(); });
    addEventListener('hearth:view', () => { if (visible() && S.stale) paintSoon(); });
    document.addEventListener('hearth:activate', () => { if (!visible()) { ProjectFrontpage.stop(); clearTimeout(paintT); ++paintVersion; S.stale = true; S.io?.disconnect(); } else if (S.stale) paintSoon(); });
    document.addEventListener('visibilitychange', () => { if (visible() && S.stale) paintSoon(); });
    paint();
  }
  let paintT = 0, paintVersion = 0;
  function paintSoon() { clearTimeout(paintT); paintT = setTimeout(() => paint(), 80); }
  async function paint() {
    if (!visible()) { S.stale = true; return; }
    const version = ++paintVersion;
    S.stale = false;
    await P.ready();
    await P.lookFor();
    if (version !== paintVersion) return;
    if (!visible()) { S.stale = true; return; }
    if (S.open && P.get(S.open)) paintProject(P.get(S.open)); else { S.open = null; paintHome(); }
  }

  // ---------- the cards ----------
  let homeN = 0;
  function paintHome() {
    S.root.classList.remove('is-project');
    const n = ++homeN;
    S.io?.disconnect();
    const list = P.live();
    const grid = el('div', { class: 'pj-grid' });
    const sugg = el('div', { class: 'pj-suggest' });
    window.ProjectFrontpage?.stop();
    const hero=ProjectFrontpage.hero(list);
    S.body.replaceChildren(hero, list.length ? grid : empty(), sugg);
    let at = 0;
    const more = () => {
      const next = list.slice(at, at + CHUNK);
      at += next.length;
      grid.append(...next.map(card));
      if (at < list.length) { const s = el('div', { class: 'pj-sentinel' }); grid.append(s); S.io.observe(s); }
    };
    S.io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { S.io.unobserve(e.target); e.target.remove(); more(); } }, { root: S.root, rootMargin: '400px' });
    more();
    // suggestions are found when Home shows (names, links, timing: no tokens)
    P.suggestions(3).then((ss) => { if (n !== homeN) return; sugg.replaceChildren(...ss.map(suggestion)); }).catch(() => {});
  }
  function empty() {
    return el('div', { class: 'pj-empty' },
      el('p', { text: 'No projects yet. A project gathers the chats, Lab scenes, boards, renders and files of one piece of work, so you can pick it up on either computer.' }),
      el('p', { class: 'hint', text: 'Make one with ＋ New project, from a suggestion below the search, or right-click a chat › Project. Makes become projects by themselves.' }));
  }
  function card(p) {
    const cover = P.coverOf(p);
    const pic = el('div', { class: 'pj-cover' }, cover ? el('img', { src: cover, alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { class: 'pj-cover-mark', text: p.ident.glyph }));
    const cont = el('div', { class: 'pj-continue' }, ...continueChips(p));
    const c = el('div', { class: `pj-card pj-st-${p.status}`, tabIndex: 0, title: `${p.name}${p.notes ? `\n${C.cap(p.notes, 200)}` : ''}\nClick: its page · right-click: more`, dataset: { project: p.id } },
      pic,
      el('div', { class: 'pj-card-head' }, el('span', { class: 'pj-mark', text: p.ident.glyph }), el('b', { class: 'pj-name', text: p.name }), p.status !== 'active' ? el('span', { class: 'pj-pill', text: C.STATUS[p.status] }) : null),
      el('p', { class: 'pj-card-description', text: p.workspace?.description || C.cap(p.notes || 'Open your project workspace', 110) }),
      el('div', { class: 'pj-meta', text: C.countText(p) }), cont);
    tint(c, p.ident.color);
    c.addEventListener('click', (e) => { if (e.target.closest('.pj-go')) return; ProjectWorkspace.open(p.id).catch(err=>toast(calmError(err),{type:'error'})); });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter') ProjectWorkspace.open(p.id).catch(err=>toast(calmError(err),{type:'error'})); });
    c.addEventListener('contextmenu', (e) => showMenuAt(e, P.menu(p)));
    return c;
  }
  // "continue where you left off": the last chat, the last scene, the last render or still
  function continueChips(p) {
    const out = [];
    for (const [types, word] of [['chat', 'chat'], [['scene', 'seq'], 'scene'], [['render', 'capture'], 'render']]) {
      const x = P.lastOf(p, types);
      if (!x) continue;
      out.push(el('button', { type: 'button', class: 'pj-go', title: `Continue: ${P.nameOf(x)}`, on: { click: (e) => { e.stopPropagation(); P.touch(p); if(x.type==='chat'||x.type==='scene')ProjectWorkspace.open(p.id,x.type==='scene'?'scene':'overview').catch(err=>toast(calmError(err),{type:'error'}));else P.openItem(x); } } },
        el('span', { class: 'pj-go-icon', text: C.TYPES[x.type].icon }), el('span', { class: 'pj-go-name', text: C.cap(P.nameOf(x).replace(`${p.name} · `, ''), 28) }), el('span', { class: 'pj-go-word', text: word })));
    }
    return out;
  }
  function suggestion(s) {
    const types = [...new Set(s.things.map((t) => t.type))];
    const node = el('div', { class: 'pj-sugg', title: s.things.slice(0, 12).map((t) => `${C.TYPES[t.type].icon} ${t.name}`).join('\n') },
      el('span', { class: 'pj-sugg-icon', text: '✦' }),
      el('span', { class: 'pj-sugg-text', text: `${s.why}: make it a project?` }),
      el('span', { class: 'pj-sugg-kinds', text: types.map((t) => C.TYPES[t].icon).join(' ') }),
      el('button', { type: 'button', class: 'primary small', text: 'Make it', on: { click: () => P.acceptSuggestion(s, { open: true }) } }),
      el('button', { type: 'button', class: 'ghost small', text: '×', title: 'Not a project (never suggested again)', on: { click: () => { P.dismissSuggestion(s); node.remove(); } } }));
    return node;
  }
  function moreMenu() {
    const a = H.claudeAgent?.();
    return [
      { label: '✦ Generate animated Three.js frontpage…', action: () => ProjectWorkspace.frontpage() },
      { label: `${store.get('projectFrontpage.enabled',false)?'✓ ':''}Animated frontpage`, action: () => { store.set('projectFrontpage.enabled',!store.get('projectFrontpage.enabled',false));paint(); } },
      { label: 'Customize the left rail…', action: () => WorkspaceNav.editShortcut() },
      { label: 'Shared tools & earlier work', items: () => [{label:'Creative board',action:()=>WorkspaceNav.creative('studio')},{label:'Sound desk',action:()=>WorkspaceNav.creative('vst')},{label:'Moodboards',action:()=>activate('tool:board')}] },
      a ? { label: 'New chat', key: 'Ctrl+N', action: () => { activate(a.id); Native.newChat(a.id); } } : null,
      { label: 'Open the Lab', action: () => activate('tool:three') },
      { label: 'Search everything…', key: 'Ctrl+Shift+K', action: () => ProjectsSearch.open() },
      { label: 'Suggest projects', action: () => suggestNow() },
      { label: `${P.grouping() ? '✓ ' : ''}Group chats by project`, action: () => P.setGrouping(!P.grouping()) },
      { label: 'Archived projects', items: () => { const xs = P.all().filter((p) => p.status === 'archived'); return xs.length ? xs.map((p) => ({ label: `${p.ident.glyph} ${p.name}`, action: () => show(p.id) })) : [{ label: 'None', disabled: true }]; } },
    ].filter(Boolean);
  }
  async function suggestNow() {
    const ss = await P.suggestions(6);
    if (!ss.length) { toast('No suggestions: nothing shares a name with enough other things yet', { timeout: 4000 }); return; }
    if (S.open) { S.open = null; paint(); }
  }
  async function newProject() { return ProjectWorkspace.wizard(); }

  // ---------- a project's page ----------
  const ORDER = ['chat', 'scene', 'seq', 'board', 'render', 'capture', 'file', 'download', 'deploy'];
  function paintProject(p) {
    S.root.classList.add('is-project');
    S.io?.disconnect(); ProjectFrontpage.stop();
    const cover = P.coverOf(p);
    const name = el('h2', { class: 'pj-p-name', text: p.name, title: 'Click to rename', on: { click: () => P.renamePrompt(p) } });
    const mark = el('button', { type: 'button', class: 'pj-p-mark', text: p.ident.glyph, title: 'Next mark (right-click: next color)', on: { click: () => P.nextMark(p), contextmenu: (e) => { e.preventDefault(); P.nextColor(p); } } });
    const status = el('select', { class: 'pj-p-status', title: 'Status' }, ...Object.entries(C.STATUS).map(([k, l]) => el('option', { value: k, text: l, selected: p.status === k })));
    status.addEventListener('change', () => P.setStatus(p, status.value));
    const notes = el('textarea', { class: 'pj-notes', rows: 3, placeholder: 'Notes (synced with your other computer)', value: p.notes || '' });
    const saveNotes = debounce(() => P.setNotes(p, notes.value), 600);
    notes.addEventListener('input', saveNotes);
    const head = el('div', { class: 'pj-p-head' },
      el('div', { class: 'pj-p-cover' }, cover ? el('img', { src: cover, alt: '', decoding: 'async' }) : el('span', { class: 'pj-cover-mark', text: p.ident.glyph })),
      el('div', { class: 'pj-p-titles' },
        el('button', { type: 'button', class: 'ghost small pj-back', text: '‹ Projects', on: { click: () => ProjectWorkspace.home() } }),
        el('div', { class: 'pj-p-line' }, mark, name, status),
        el('div', { class: 'pj-meta', text: `${C.countText(p)} · made ${p.from === 'make' ? 'from a make' : p.from === 'suggest' ? 'from a suggestion' : 'by hand'} · ${timeAgo(p.at)}` }),
        el('div', { class: 'pj-p-actions' },
          el('button', { type: 'button', class: 'primary small', text: '↻ Continue', title: 'Where you left off: its last chat (else scene, else render)', on: { click: () => ProjectWorkspace.go('scene') } }),
          el('button', { type: 'button', class: 'ghost small', text: '＋ Add', title: 'This chat, the scene on screen, a recent chat / scene / board / render / file…', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); P.warm?.(); showMenu(b.left, b.bottom + 4, P.addMenu(p)); } } }),
          el('button', { type: 'button', class: 'ghost small', text: '⋯', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); showMenu(b.left, b.bottom + 4, P.menu(p)); } } })),
        el('div', { class: 'pj-continue' }, ...continueChips(p))));
    tint(head, p.ident.color);
    const sections = [];
    for (const t of ORDER) {
      const xs = p.items.filter((x) => x.type === t).sort((a, b) => (P.timeOf(b) || b.at) - (P.timeOf(a) || a.at));
      if (!xs.length) continue;
      sections.push(el('section', { class: 'pj-sec' }, el('h4', { text: `${C.TYPES[t].icon} ${C.TYPES[t].label}${xs.length > 1 ? `s · ${xs.length}` : ''}` }),
        el('div', { class: `pj-items pj-items-${t}` }, ...xs.map((x) => itemRow(p, x)))));
    }
    if (!sections.length) sections.push(el('p', { class: 'hint pj-none', text: 'Nothing in it yet: ＋ Add puts the chat you were in, the scene on screen or anything recent in it.' }));
    S.body.replaceChildren(head, ProjectWorkspace.toolbar(p), el('details', {class:'pw-project-files'},el('summary',{text:'Project files & notes'}),notes,...sections));
  }
  function itemRow(p, x) {
    const pic = ['scene', 'seq', 'render', 'capture', 'board'].includes(x.type) ? P.thumbOf(x) : null;
    const t = P.timeOf(x) || x.at;
    const r = el('button', { type: 'button', class: `pj-item${P.gone(x) ? ' pj-gone' : ''}${p.cover === x.id ? ' pj-is-cover' : ''}`, title: `${P.nameOf(x)}${P.gone(x) ? ' (not here: deleted, or not arrived from your other computer yet)' : ''}\nClick: open · right-click: more` },
      pic ? el('img', { class: 'pj-thumb', src: pic, alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { class: 'pj-thumb pj-thumb-icon', text: C.TYPES[x.type].icon }),
      el('span', { class: 'pj-item-name', text: P.nameOf(x).replace(`${p.name} · `, '') }),
      t ? el('span', { class: 'pj-item-time', text: timeAgo(t) }) : null);
    r.addEventListener('click', () => { P.touch(p); P.openItem(x); });
    r.addEventListener('contextmenu', (e) => showMenuAt(e, P.itemMenu(p, x)));
    return r;
  }

  // show(id): a project's page (null: the cards)
  function show(id = null) {
    if(id && P.get(id) && ProjectWorkspace.current()?.id!==id){ProjectWorkspace.open(id).catch(err=>toast(calmError(err),{type:'error'}));return;}
    if(!id && ProjectWorkspace.current()){ProjectWorkspace.home().catch(err=>toast(calmError(err),{type:'error'}));return;}
    S.open = id && P.get(id) ? id : null;
    if (S.open) P.touch(P.get(S.open));
    if (S.mounted) { S.root.scrollTop = 0; paint(); }
  }

  Tools.define({
    id: 'home', name: 'Projects', icon: '⌂', color: '#ffc23d',
    description: 'Your projects: covers, continue where you left off, search everything',
    mount: (body) => mount(body),
    onShow() { if (S.mounted) paint(); },
    commands: [
      { label: 'Home: your projects', run: () => P.openHome() },
    ],
  });

  return { show, mounted: () => S.mounted, openProject: () => (visible() ? S.open : null), newProject, paint, isVisible: visible };
})();
window.ProjectsHome = ProjectsHome;
