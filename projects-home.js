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
  const desks=new Map();let drawn=null;
  function keepDesk() {
    if(!drawn||!S.body?.querySelector('.pj-p-head'))return;
    const state=desks.get(drawn)||{};
    state.open=[...S.body.querySelectorAll('details[open]')].map(e=>e.className);
    state.moduleQuery=S.body.querySelector('.pw-module-search')?.value||'';
    state.fileQuery=S.body.querySelector('.pw-file-search')?.value||'';
    state.fileType=S.body.querySelector('.pw-file-kind')?.value||'';
    state.scroll=S.top??S.root.scrollTop; // (round 86, projopen86) the place kept by its scroll events: reading scrollTop here laid out the whole window (≈ 30–50 ms) as the Desk was left
    const focus=document.activeElement;
    state.focus=focus&&S.body.contains(focus)&&focus.matches('input,textarea,select')?{className:focus.className,start:focus.selectionStart,end:focus.selectionEnd}:null;
    desks.delete(drawn);desks.set(drawn,state);if(desks.size>100)desks.delete(desks.keys().next().value);
  }
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
    S.root.addEventListener('scroll', () => { S.top = S.root.scrollTop; }, { passive: true }); // (round 86, projopen86) see keepDesk
    body.append(S.root);
    S.search = ProjectsSearch.view({ input, list: results, chips, empty: '' });
    // (round 75, projbundle75) a .hearthproject dropped on Projects is imported (the check card comes first)
    const bundleDrag = (e) => [...(e.dataTransfer?.items || [])].some((x) => x.kind === 'file') && e.dataTransfer.types?.includes('Files');
    S.root.addEventListener('dragover', (e) => { if (!bundleDrag(e) && !(S.open && window.ProjAudit?.deskDrag(e))) return; /* (round 91, projaudit91) a chat from the list on a project's Desk */ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; S.root.classList.add('pb-drop'); });
    S.root.addEventListener('dragleave', (e) => { if (!S.root.contains(e.relatedTarget)) S.root.classList.remove('pb-drop'); });
    S.root.addEventListener('drop', (e) => { S.root.classList.remove('pb-drop'); if (S.open && window.ProjAudit?.deskDrop(e, S.open)) return; /* (round 91, projaudit91) files / a chat dropped on a project's Desk join it */ const fs = [...(e.dataTransfer?.files || [])]; if (!fs.length) return; e.preventDefault(); if (!fs.some((f) => /\.hearthproject$/i.test(f.name))) { toast('Drop a .hearthproject file here to import a project', { timeout: 3500 }); return; } P.bundle((B) => B.dropFiles(fs)); });
    input.addEventListener('input', () => { const on = Boolean(input.value.trim()); S.root.querySelector('.pj-home-find').hidden = !on; S.body.hidden = on; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; input.dispatchEvent(new Event('input')); } });
    P.onChange(e => { if(e.why==='notes'&&e.id===drawn&&S.body.querySelector('.pj-notes')?.value===e.project.notes)return;deskSig=null;S.stale = true; if (visible()) paintSoon(); });
    addEventListener('hearth:view', () => { if (visible() && S.stale) paintSoon(); });
    // (round 76, projsync76) something landed from the other computer: an open Desk shows it (what arrived, its sync line)
    addEventListener('hearth:synced', () => { if (!S.open) return; S.stale = true; if (visible()) paintSoon(); else S.body?.querySelectorAll('.pj-sync-line').forEach((n) => n.refresh?.()); });
    // (round 72) coming on screen draws at once (the 80 ms wait is for bursts of changes, not for a click)
    document.addEventListener('hearth:activate', () => { if (!visible()) { keepDesk();ProjectFrontpage.stop(); clearTimeout(paintT); ++paintVersion; S.stale = true; S.io?.disconnect(); } else if (S.stale) { clearTimeout(paintT); paint(); } });
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
    // (round 74, projdesk74) back on the Desk of the same project with nothing it shows changed (deskSigOf): the Desk
    // drawn before is kept as it is. It was rebuilt on every tab switch (≈ 60 ms of script plus a whole new Desk to draw), right where you click next
    const p = S.open && P.get(S.open);
    if (p && drawn === p.id && deskSig && deskSig === deskSigOf(p) && S.body.querySelector('.pj-p-head')) return;
    keepDesk();
    if (p) { paintProject(p); deskSig = deskSigOf(p); } else { S.open = null; deskSig = null; paintHome(); }
  }
  let deskSig = null;
  // what the Desk shows, as text: each item's name, time, picture and presence (a few ms for 771 items), the scene's
  // modules, the current scene, and the minute its times are written in (sources re-read after 15–30 s give new
  // arrays with the same content: compared by what they say, not by identity)
  const deskSigOf = (p) => { const sc = (typeof ThreeLab !== 'undefined' ? ThreeLab : null)?.scenes?.get?.(ProjectWorkspace.currentScene() || p.workspace?.sceneId); return JSON.stringify([p.updated, p.items.map((x) => `${P.nameOf(x)}\u0001${P.timeOf(x) || x.at}\u0001${P.thumbOf(x) || ''}\u0001${P.gone(x) ? 1 : 0}`), sc ? sc.layers?.map((x) => `${x.id}:${x.name}:${x.visible !== false}`) : null, ProjectWorkspace.currentScene(), Math.floor(Date.now() / 60000)]); }; // (round 76, projsync76) ThreeLab is a const, never on window: the scene's modules were left out of the sig (a Desk visit after a layer changed kept the old list)

  // ---------- the cards ----------
  let homeN = 0;
  function paintHome() {
    drawn=null;
    S.root.classList.remove('is-project');
    S.root.closest('.surface')?.classList.remove('pw-desk');
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
    // (round 73, startfast73) in an idle moment: Home is often the first screen, and finding them reads every chat, scene and board name
    new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1500 }) : setTimeout(r, 0))).then(() => (n === homeN ? P.suggestions(3) : null))
      .then((ss) => { if (!ss || n !== homeN) return; sugg.replaceChildren(...ss.map(suggestion)); }).catch(() => {});
  }
  function empty() {
    return el('div', { class: 'pj-empty' },
      el('p', { text: 'No projects yet. A project gathers the chats, Lab scenes, boards, renders and files of one piece of work, so you can pick it up on either computer.' }),
      el('p', { class: 'hint', text: 'Make one with ＋ New project, from a suggestion below the search, or right-click a chat › Project. Makes become projects by themselves.' }));
  }
  function card(p) {
    const cover = P.coverOf(p);
    const pic = el('div', { class: 'pj-cover' }, cover ? el('img', { src: cover, alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { class: 'pj-cover-mark', text: p.ident.glyph }));
    ProjectFrontpage.decorate(pic,p);
    const cont = el('div', { class: 'pj-continue' }, ...continueChips(p));
    const c = el('div', { class: `pj-card pj-st-${p.status}`, tabIndex: 0, title: `${p.name}${p.notes ? `\n${C.cap(p.notes, 200)}` : ''}\nClick: resume this project · right-click: more`, dataset: { project: p.id } },
      pic,
      el('div', { class: 'pj-card-head' }, el('span', { class: 'pj-mark', text: p.ident.glyph }), el('b', { class: 'pj-name', text: p.name }), p.status !== 'active' ? el('span', { class: 'pj-pill', text: C.STATUS[p.status] }) : null, p.revived ? el('span', { class: 'pj-pill pj-pill-revived', text: 'Deleted elsewhere?', title: 'Deleted on your other computer, but it changed after that: open it to keep it or delete it' }) : null), // (round 76, projsync76)
      el('p', { class: 'pj-card-description', text: p.workspace?.description || C.cap(p.notes || 'Open your project workspace', 110) }),
      el('div', { class: 'pj-meta', text: C.countText(p) }), cont);
    const identity=el('button',{type:'button',class:'pj-go pw-banner-edit',text:'✦',title:'Generate a Three.js banner / logo',attrs:{'aria-label':`Design ${p.name} banner`},on:{click:e=>{e.stopPropagation();ProjectFrontpage.edit(p).catch(err=>toast(calmError(err),{type:'error'}));}}});pic.append(identity);
    tint(c, p.ident.color);
    c.addEventListener('click', (e) => { if (e.target.closest('.pj-go')) return; ProjectWorkspace.open(p.id).catch(err=>{if(!err?.shown)toast(calmError(err),{type:'error'});}); });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target===c) ProjectWorkspace.open(p.id).catch(err=>{if(!err?.shown)toast(calmError(err),{type:'error'});}); });
    c.addEventListener('contextmenu', (e) => showMenuAt(e, P.menu(p)));
    // (round 72) the pointer on a card: the workspace's code starts loading (the first open of a session waits less)
    c.addEventListener('pointermove', prefetch); c.addEventListener('focus', prefetch, { once: true }); // (round 94, labload94: a pointer moving on it, not pointerenter: one resting where the cards are drawn at start isn't intent)
    // (round 74, projdesk74) the press is the click's first moment: the preview page starts loading now (let go in 4 s if no open claims it)
    c.addEventListener('pointerdown', (e) => { if (e.button === 0 && !e.target.closest('.pj-go') && Lazy.loaded('lab')) ThreeLab.workspace?.preload?.(); });
    return c;
  }
  const prefetch = (e) => { if (e?.type === 'pointermove' && !e.movementX && !e.movementY) return; e?.currentTarget?.removeEventListener('pointermove', prefetch); for (const g of ['lab', 'board', 'creative']) if (!Lazy.loaded(g)) Lazy.load(g).catch(() => {}); }; // (round 94, labload94: a pointer that moved; Chromium's own moves after a layout or scroll have no movement)
  // "continue where you left off": the last chat, the last scene, the last render or still
  function continueChips(p) {
    const out = [];
    for (const [types, word] of [['chat', 'chat'], [['scene', 'seq'], 'scene'], [['render', 'capture'], 'render']]) {
      const x = P.lastOf(p, types);
      if (!x) continue;
      out.push(el('button', { type: 'button', class: 'pj-go', title: `Continue: ${P.nameOf(x)}`, on: { click: (e) => { e.stopPropagation(); P.touch(p); if(x.type==='chat')ProjectWorkspace.conversation(p,x.ref).catch(err=>toast(calmError(err),{type:'error'}));else if(x.type==='scene')ProjectWorkspace.openScene(x.ref,p).catch(err=>toast(calmError(err),{type:'error'}));else P.openItem(x); } } },
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
      { label: '⇩ Import project…', hint: 'a .hearthproject file', action: () => P.bundle((B) => B.importProject()) }, // (round 75, projbundle75) a new project from one file (or drop the file on Projects)
      { label: '✦ Generate animated Three.js frontpage…', action: () => ProjectWorkspace.frontpage() },
      { label: 'Bring Three.js chats into Projects', action: () => ProjectWorkspace.importScenes() },
      { label: `${store.get('projectFrontpage.enabled',false)?'✓ ':''}Animated frontpage`, action: () => { store.set('projectFrontpage.enabled',!store.get('projectFrontpage.enabled',false));paint(); } },
      { label: 'Customize the left rail…', action: () => WorkspaceNav.editShortcut() },
      { label: 'Shared tools & earlier work', items: () => [{label:'Creative board',action:()=>WorkspaceNav.creative('studio')},{label:'Sound desk',action:()=>WorkspaceNav.creative('vst')},{label:'Moodboards',action:()=>activate('tool:board')}] },
      a ? { label: 'New chat', key: 'Ctrl+N', action: () => { activate(a.id); Native.newChat(a.id); } } : null,
      { label: 'Open the Lab', action: () => activate('tool:three') },
      { label: 'Search everything…', key: 'Ctrl+Shift+K', action: () => ProjectsSearch.open() },
      { label: 'Suggest projects', action: () => suggestNow() },
      { label: `${P.grouping() ? '✓ ' : ''}Group chats by project`, action: () => P.setGrouping(!P.grouping()) },
      // (round 74, projdesk74) opt-in: the preview page stays loaded behind this page, so opening a project is as quick as switching
      { label: `${ProjectWorkspace.keepLab() ? '✓ ' : ''}Keep the Lab ready behind Projects`, hint: 'Opens projects faster · uses more memory', action: () => { const on = ProjectWorkspace.keepLab(!ProjectWorkspace.keepLab()); toast(on ? 'The Lab stays ready behind Projects (uses more memory)' : 'The Lab is let go behind Projects', { timeout: 3000 }); } },
      { label: 'Archived projects', items: () => { const xs = P.all().filter((p) => p.status === 'archived'); return xs.length ? xs.map((p) => ({ label: `${p.ident.glyph} ${p.name}`, action: () => show(p.id) })) : [{ label: 'None', disabled: true }]; } },
      // (round 72, projects72) a deleted project comes back with its notes, look and links (its chats and scenes never left)
      { label: 'Recently deleted projects', items: () => { const xs = P.trashed(); return xs.length ? xs.map((p) => ({ label: `${p.ident.glyph} ${p.name}`, hint: `Restore · deleted ${timeAgo(p.deletedAt)}`, action: () => { if (P.restoreProject(p.id)) toast(`“${p.name}” is back in Projects`, { timeout: 4000 }); } })) : [{ label: 'Nothing deleted', disabled: true }]; } },
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
    drawn=p.id;const state=desks.get(p.id)||{};
    S.root.classList.add('is-project');
    S.root.closest('.surface')?.classList.add('pw-desk');
    S.io?.disconnect(); ProjectFrontpage.stop();
    const cover = P.coverOf(p);
    const name = el('h2', { class: 'pj-p-name', text: p.name, title: 'Click to rename', on: { click: () => P.renamePrompt(p) } });
    const mark = el('button', { type: 'button', class: 'pj-p-mark', text: p.ident.glyph, title: 'Next mark (right-click: next color)', on: { click: () => P.nextMark(p), contextmenu: (e) => { e.preventDefault(); P.nextColor(p); } } });
    const status = el('select', { class: 'pj-p-status', title: 'Status' }, ...Object.entries(C.STATUS).map(([k, l]) => el('option', { value: k, text: l, selected: p.status === k })));
    status.addEventListener('change', () => P.setStatus(p, status.value));
    // (round 72) the notes hold 4,000 characters (ProjectsCore): the box stops there instead of dropping what's typed past it
    const notes = el('textarea', { class: 'pj-notes', rows: 3, maxLength: 4000, placeholder: 'Notes (synced with your other computer)', value: p.notes || '' });
    // The Projects store already debounces disk writes. Keep the model current now,
    // so a repaint or immediate project close cannot replace an unsaved note.
    notes.addEventListener('input',()=>P.setNotes(P.get(p.id)||p,notes.value));
    const head = el('div', { class: 'pj-p-head' },
      el('div', { class: 'pj-p-cover' }, cover ? el('img', { src: cover, alt: '', decoding: 'async' }) : el('span', { class: 'pj-cover-mark', text: p.ident.glyph })),
      el('div', { class: 'pj-p-titles' },
        el('button', { type: 'button', class: 'ghost small pj-back', text: '‹ Projects', on: { click: () => ProjectWorkspace.home() } }),
        el('div', { class: 'pj-p-line' }, mark, name, status),
        el('div', { class: 'pj-meta', text: `${C.countText(p)} · made ${p.from === 'make' ? 'from a make' : p.from === 'suggest' ? 'from a suggestion' : 'by hand'} · ${timeAgo(p.at)}` }),
        syncLine(p), revivedNote(p), // (round 76, projsync76)
        el('div', { class: 'pj-p-actions' },
          el('button', { type: 'button', class: 'primary small', text: '▶ Scene', title: 'Resume the scene', on: { click: () => ProjectWorkspace.go('scene') } }),
          el('button', { type: 'button', class: 'ghost small', text: '＋ Add', title: 'This chat, the scene on screen, a recent chat / scene / board / render / file…', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); P.warm?.(); showMenu(b.left, b.bottom + 4, P.addMenu(p)); } } }),
          el('button', { type: 'button', class: 'ghost small', text: '⋯', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); showMenu(b.left, b.bottom + 4, P.menu(p)); } } })),
        el('div', { class: 'pj-continue' }, ...continueChips(p))));
    tint(head, p.ident.color);
    ProjectFrontpage.decorate(head.querySelector('.pj-p-cover'),p);
    const identity=el('button',{type:'button',class:'pw-banner-edit',text:'✦',title:'Edit the project logo',on:{click:()=>ProjectFrontpage.edit(p)}});
    head.querySelector('.pj-p-cover').append(identity);
    const row=(label,kind,fn,hint)=>el('button',{type:'button',class:'pw-shelf-row',title:hint||label,on:{click:()=>Promise.resolve(fn()).catch(err=>toast(calmError(err),{type:'error'}))}},ProjectWorkspace.svg(kind),el('span',{text:label}),el('span',{class:'pw-shelf-arrow',text:'↗'}));
    const block=(label,...kids)=>el('section',{class:'pw-shelf-section'},el('h3',{text:label}),...kids);
    const source=ThreeLab.scenes?.get(ProjectWorkspace.currentScene()||p.workspace?.sceneId),layers=source?.layers||[];
    const filter=el('input',{type:'search',class:'pw-module-search',placeholder:'Find a module…',attrs:{'aria-label':'Find scene module'}}),moduleList=el('div',{class:'pw-module-list'});
    filter.value=state.moduleQuery||'';
    const paintModules=()=>{const q=filter.value.toLowerCase(),hits=layers.filter(l=>String(l.name||'').toLowerCase().includes(q));moduleList.replaceChildren(...hits.map(l=>row(l.name,'scene',async()=>{await ProjectWorkspace.go('scene');ThreeLab.search.selectLayer(l.id);},`${l.visible===false?'Off':'Active'} · Open this module’s controls`)),...(!hits.length?[el('p',{class:'hint',text:'No matching modules.'})]:[]));};
    const modules=el('details',{class:'pw-modules'},el('summary',{text:`Modules & mods · ${layers.length}`}),filter,moduleList);modules.addEventListener('toggle',()=>{if(modules.open&&!moduleList.children.length)paintModules();});filter.oninput=paintModules;
    const chats=p.items.filter(x=>x.type==='chat'),boards=p.items.filter(x=>x.type==='board');
    const materials=block('On your desk',...boards.map(x=>row(P.nameOf(x),'board',()=>x.ref===p.workspace?.boardId?ProjectWorkspace.go('moodboard'):P.openItem(x))),row('Drawing & storyboard','brushes',()=>ProjectWorkspace.go('board')), ...p.items.filter(x=>['capture','render','file'].includes(x.type)).slice(-4).map(x=>itemRow(p,x)));
    const sound=block('Instruments',...(p.workspace?.plugins||[]).map(name=>row(name,'music',()=>ProjectWorkspace.go('sound'))),row('Choose instruments','plus',()=>ProjectWorkspace.settings(p)));
    const about=el('details',{class:'pw-about'},el('summary',{text:'Project notes & setup'}),notes,p.workspace?.description?el('p',{class:'pw-about-copy',text:p.workspace.description}):null,row('Project setup','spark',()=>ProjectWorkspace.settings(p)),row('Write description with AI','chat',()=>ProjectWorkspace.describe(p)));
    const conversations=chats.length>1?block('Conversations',...chats.map(x=>row(P.nameOf(x),'chat',()=>ProjectWorkspace.conversation(p,x.ref)))):null;
    const files=filesShelf(p,state);
    S.body.replaceChildren(head,...(window.ProjFind?[ProjFind.box(p)]:[]),...(window.QuestGuide?.projectCard?[QuestGuide.projectCard(p)]:[]),materials,modules,sound,...(conversations?[conversations]:[]),about,files); // (round 81, projsearch81) ProjFind.box: Find in this project, one box for everything in it (projfind.js)
    for(const d of S.body.querySelectorAll('details'))d.open=(state.open||[]).includes(d.className);
    if(modules.open)paintModules();
    if(window.DeskPaint)DeskPaint.place(S,state.scroll||0,{now:Boolean(state.focus)});else S.top=S.root.scrollTop=state.scroll||0; // (round 89, desk89) the place set in the coming frame (desk-paint-core.js): the write laid out the whole window inside this task (≈ 15–30 ms of Clink's 50–70) · (round 86: S.top, see keepDesk; a clamped place comes back by its scroll event)
    if(state.focus){const field=[...S.body.querySelectorAll('input,textarea,select')].find(e=>e.className===state.focus.className);field?.focus({preventScroll:true});if(field?.setSelectionRange&&state.focus.start!=null)try{field.setSelectionRange(state.focus.start,state.focus.end);}catch{}}
  }
  // ---------- (round 76, projsync76) the project across your two computers ----------
  // One line under the project's name: "All here · synced 2 min ago" / "3 files still arriving from Mac" (ProjSyncCore,
  // from what sync already reports: no timer, no extra reads). Its words change when sync reports (Sync.listen) or
  // something lands (the Desk is drawn again); a click opens the sync panel. Nothing while sync is off.
  let dataDir = null;
  // what this computer has: the Lab's and the boards' own lists when they're loaded (the Desk's cached look can be up
  // to 20 s behind: a scene made a moment ago here isn't "arriving"), else the look
  function present(x) {
    if (x.type === 'scene' || x.type === 'seq') { const L = Lazy.loaded('lab') && typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null; if (L?.get) return Boolean(L.get(x.ref)); }
    if (x.type === 'board' && Lazy.loaded('board') && typeof Board !== 'undefined' && Board.boards) { try { const list = Board.boards(); if (list?.length) return list.some((b) => b.id === x.ref); } catch { /* not ready */ } }
    return ['chat', 'scene', 'seq', 'board'].includes(x.type) ? !P.gone(x) : null;
  }
  function syncStatus(p) {
    if (typeof Sync === 'undefined' || typeof ProjSyncCore === 'undefined') return null;
    if (dataDir === null) { dataDir = ''; P.Src.workspaceDir().then((d) => { dataDir = String(d || '').replace(/[\\/]workspace$/, ''); S.body?.querySelectorAll('.pj-sync-line').forEach((n) => n.refresh?.()); }).catch(() => {}); }
    return ProjSyncCore.status(P.get(p.id) || p, { sync: Sync.status(), present, dataDir, ci: !/Mac/.test(navigator.platform), names: (x) => (x.type === 'worktable' ? x.name : P.nameOf(x)), ago: (t) => (t ? timeAgo(t) : 'not yet') });
  }
  function syncLine(p) {
    const node = el('button', { type: 'button', class: 'pj-sync-line', on: { click: (e) => { e.stopPropagation(); Sync.panel?.(e); } } });
    node.refresh = () => {
      const r = syncStatus(p);
      node.hidden = !r;
      if (!r) return;
      node.dataset.kind = r.kind; node.title = r.title; node.setAttribute('aria-label', `Sync status: ${r.text}`);
      node.textContent = `${r.kind === 'here' ? '✓' : r.kind === 'arriving' || r.kind === 'going' ? '↻' : r.kind === 'offline' ? '○' : '‖'} ${r.text}`;
    };
    node.refresh();
    if (typeof Sync !== 'undefined' && Sync.listen) { const f = () => node.refresh(); f.gone = () => !node.isConnected; Sync.listen(f); }
    return node;
  }
  // deleted on one computer while it changed on the other: kept, and the choice is here (ProjectsCore.revive)
  function revivedNote(p) {
    if (!p.revived) return null;
    return el('div', { class: 'pj-revived', attrs: { role: 'status' } },
      el('span', { text: `Deleted on your other computer${p.revived.at ? ` (${timeAgo(p.revived.at)})` : ''}, but it changed after that, so it's still here.` }),
      el('button', { type: 'button', class: 'primary small', text: 'Keep it', on: { click: () => P.settleRevived(P.get(p.id), true) } }),
      el('button', { type: 'button', class: 'ghost small', text: 'Delete it', title: 'It waits in Projects › ⋯ › Recently deleted', on: { click: () => { P.settleRevived(P.get(p.id), false); ProjectWorkspace.home().catch(() => {}); } } }));
  }
  function filesShelf(p,state) {
    const query=el('input',{type:'search',class:'pw-file-search',placeholder:'Filter these files…',value:state.fileQuery||'',attrs:{'aria-label':'Find project files'}});
    const kind=el('select',{class:'pw-file-kind',attrs:{'aria-label':'Project file type'}},el('option',{value:'',text:'All types'}),...ORDER.filter(t=>p.items.some(x=>x.type===t)).map(t=>el('option',{value:t,text:C.TYPES[t].label})));kind.value=state.fileType||'';
    const results=el('div',{class:'pw-file-results'}),count=el('span',{class:'hint',attrs:{role:'status'}}),more=el('button',{type:'button',class:'ghost small',text:'Show more'});
    const d=el('details',{class:'pw-project-files'},el('summary',{text:`Project files · ${p.items.length}`}),el('div',{class:'pw-file-filters'},query,kind),results,el('div',{class:'pw-file-footer'},count,more));
    let limit=state.fileLimit||60,painted=false;
    const paint=()=>{
      if(!d.open)return;
      painted=true;
      const long=limit>60;results.classList.toggle('pj-long',long); // (round 74) past the first 60 rows: drawn as they come on screen
      const q=query.value.trim().toLowerCase(),hits=p.items.filter(x=>(!kind.value||x.type===kind.value)&&(!q||P.nameOf(x).toLowerCase().includes(q)||String(x.ref).toLowerCase().includes(q))).sort((a,b)=>(P.timeOf(b)||b.at)-(P.timeOf(a)||a.at)),shown=hits.slice(0,limit);
      results.replaceChildren(...ORDER.flatMap(t=>{const xs=shown.filter(x=>x.type===t);return xs.length?[el('section',{class:'pj-sec'},el('h4',{text:C.TYPES[t].icon+' '+C.TYPES[t].label}),el('div',{class:'pj-items'},...xs.map(x=>itemRow(p,x,{lazy:long}))))]:[];}),...(!hits.length?[el('p',{class:'hint',text:q||kind.value?'No matching files.':'Add a scene, chat, or file to see it here.'})]:[])); // (round 74) lazy: a long shelf's row picture loads once the row is drawn
      count.textContent=`${shown.length} of ${hits.length}`;more.hidden=shown.length>=hits.length;
      const saved=desks.get(p.id)||state;saved.fileLimit=limit;desks.set(p.id,saved);
    };
    query.oninput=kind.onchange=()=>{limit=60;paint();};more.onclick=()=>{limit+=60;paint();};d.addEventListener('toggle',()=>{if(d.open&&!painted)paint();});
    if((state.open||[]).includes('pw-project-files')){d.open=true;paint();}
    return d;
  }
  // (round 74, projdesk74) lazy (a long files shelf, past "Show more"): its rows skip layout and paint while out of sight
  // (content-visibility, project-workspace.css .pj-long); a row's picture (a full-size capture / render file) is asked
  // for only when its row is first drawn, so 400 rows decode the few pictures on screen, not 400
  const CV_EVENT = 'oncontentvisibilityautostatechange' in document.documentElement;
  function itemRow(p, x, { lazy = false } = {}) {
    const pic = ['scene', 'seq', 'render', 'capture', 'board'].includes(x.type) ? P.thumbOf(x) : null;
    const t = P.timeOf(x) || x.at;
    const r = el('button', { type: 'button', class: `pj-item${P.gone(x) ? ' pj-gone' : ''}${p.cover === x.id ? ' pj-is-cover' : ''}`, title: `${P.nameOf(x)}${P.gone(x) ? ' (not here: deleted, or not arrived from your other computer yet)' : ''}\nClick: open · right-click: more` },
      pic ? el('img', { class: 'pj-thumb', ...(lazy && CV_EVENT ? {} : { src: pic }), alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { class: 'pj-thumb pj-thumb-icon', text: C.TYPES[x.type].icon }),
      el('span', { class: 'pj-item-name', text: P.nameOf(x).replace(`${p.name} · `, '') }),
      t ? el('span', { class: 'pj-item-time', text: timeAgo(t) }) : null);
    if (pic && lazy && CV_EVENT) { const show = (e) => { if (e.skipped) return; r.removeEventListener('contentvisibilityautostatechange', show); r.querySelector('img.pj-thumb').src = pic; }; r.addEventListener('contentvisibilityautostatechange', show); } // (round 74)
    r.addEventListener('click', () => { P.touch(p); P.openItem(x); });
    r.addEventListener('contextmenu', (e) => showMenuAt(e, P.itemMenu(p, x)));
    return r;
  }

  // show(id): a project's page (null: the cards)
  function show(id = null) {
    keepDesk();
    if(id && P.get(id) && ProjectWorkspace.current()?.id!==id){ProjectWorkspace.open(id).catch(err=>toast(calmError(err),{type:'error'}));return;}
    if(!id && ProjectWorkspace.current()){ProjectWorkspace.home().catch(err=>toast(calmError(err),{type:'error'}));return;}
    S.open = id && P.get(id) ? id : null;
    if (S.open) P.touch(P.get(S.open));
    if (S.mounted) { if(!S.open){if(window.DeskPaint)DeskPaint.place(S,0);else S.top=S.root.scrollTop=0;}paint(); } // (round 86: S.top) (round 89, desk89) the cards' place too, in the coming frame
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
