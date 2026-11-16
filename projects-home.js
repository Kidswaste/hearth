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
      el('button', { type: 'button', class: 'primary small', text: '＋ New project', title: 'A dedicated chat, scene and moodboard', on: { click: () => newProject() } }),
      el('button', { type: 'button', class: 'ghost small pj-quick-more', text: '⋯', title: 'More: a new chat, the Lab, archived projects' /* (round 116, projchats116) no grouping: the chats list shows one project */, on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); showMenu(b.left, b.bottom + 4, moreMenu()); } } }));
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
    S.root.addEventListener('keydown', (e) => { if (S.open || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea,select,[contenteditable]')) return; if (e.key === '/') { e.preventDefault(); input.focus(); } else if (e.key.toLowerCase() === 'n' && !e.target.closest('.pj-card')) { e.preventDefault(); newProject(); } }); // (round 182, projclean182)
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
    S.formats = (await P.Src.sceneFormats?.().catch(() => null)) || S.formats || null; // (round 182, projclean182) the scenes' formats: which projects are “Older version”
    if (version !== paintVersion) return;
    if (!visible()) { S.stale = true; return; }
    // (round 74, projdesk74) back on the Desk of the same project with nothing it shows changed (deskSigOf): the Desk
    // drawn before is kept as it is. It was rebuilt on every tab switch (≈ 60 ms of script plus a whole new Desk to draw), right where you click next
    const p = S.open && P.get(S.open);
    if (p && drawn === p.id && deskSig && deskSig === deskSigOf(p) && S.body.querySelector('.pj-p-head')) return;
    if (window.DeskPaint?.held?.(S.root, () => paint())) { S.stale = true; return; } // (round 109, projopen109) a button on it is pressed: drawn after its click (desk-paint.js held)
    keepDesk();
    if (p) { paintProject(p); deskSig = deskSigOf(p); } else { S.open = null; deskSig = null; paintHome(); }
  }
  let deskSig = null;
  // what the Desk shows, as text: each item's name, time, picture and presence (a few ms for 771 items), the scene's
  // modules, the current scene, and the minute its times are written in (sources re-read after 15–30 s give new
  // arrays with the same content: compared by what they say, not by identity)
  const deskSigOf = (p) => { const sc = (typeof ThreeLab !== 'undefined' ? ThreeLab : null)?.scenes?.get?.(ProjectWorkspace.currentScene() || p.workspace?.sceneId); return JSON.stringify([p.updated, p.pitch || '', p.series || '', p.ideas?.at || 0, p.items.map((x) => `${P.nameOf(x)}\u0001${P.timeOf(x) || x.at}\u0001${P.thumbOf(x) || ''}\u0001${P.gone(x) ? 1 : 0}`), sc ? sc.layers?.map((x) => `${x.id}:${x.name}:${x.visible !== false}`) : null, ProjectWorkspace.currentScene(), Math.floor(Date.now() / 60000)]); }; // (round 76, projsync76) ThreeLab is a const, never on window: the scene's modules were left out of the sig (a Desk visit after a layer changed kept the old list)

  // ---------- the cards ----------
  // (round 182, projclean182) The clean Projects screen: a card is a cover, a name and ONE line on what the project is
  // going to be. Above the cards: Games · Music · Videos (ProjKindCore.kindOf) and a sort; the project last worked on
  // is the wide "Continue" card; pinned ones come first. Projects whose scenes were all made for the old player fold
  // under "Older version" (ProjKindCore.shelfOf, from the scenes' formats: S.formats). Under the cards: what could
  // come next (follow-ups of the last project, and something from a different series), one click into the new-project
  // card. What a card used to list (counts, three continue chips, the status) is in its tooltip and its ⋯ menu.
  const K = ProjKindCore;
  const VIEW_KEY = 'projects.view';
  const viewOf = () => { const v = store.get(VIEW_KEY, {}) || {}; return { kind: ['all', 'none', ...K.IDS].includes(v.kind) ? v.kind : 'all', sort: K.SORTS.some(([id]) => id === v.sort) ? v.sort : 'recent', older: Boolean(v.older), series: typeof v.series === 'string' ? v.series : '' }; };
  const setView = (patch) => { store.set(VIEW_KEY, { ...viewOf(), ...patch }); paint(); };
  const openProject = (p) => ProjectWorkspace.open(p.id).catch((err) => { if (!err?.shown) toast(calmError(err), { type: 'error' }); });
  const kindTag = (p) => { const k = K.kind(K.kindOf(p)); return k ? el('span', { class: 'pj-kind', dataset: { kind: k.id }, text: `${k.icon} ${k.label}` }) : null; };
  async function editPitch(p) {
    const text = await Modal.prompt(`What is “${p.name}” going to be?`, { value: p.pitch || K.pitchOf(p), multiline: true, label: 'One or two lines: what it is, and what makes it worth finishing. It shows on the project’s card.' });
    if (text == null) return;
    P.setField(P.get(p.id) || p, 'pitch', text);
  }
  let homeN = 0; let dragged = null;
  function paintHome() {
    drawn=null;
    S.root.classList.remove('is-project');
    S.root.classList.add('pj-clean');
    S.root.closest('.surface')?.classList.remove('pw-desk');
    const n = ++homeN;
    S.io?.disconnect();
    let view = viewOf();
    const live = P.live();
    if (view.series && !K.seriesOf(live).some((x) => x.name === view.series)) { store.set(VIEW_KEY, { ...view, series: '' }); view = viewOf(); } // (its last project left the series: nothing is filtered by it)
    const A = K.arrange(live, { kind: view.kind, sort: view.sort, formats: S.formats, series: view.series });
    const all = [...A.pinned, ...A.current];
    // the project last worked on, wide: only on the unfiltered, recent view (elsewhere the grid is the answer)
    const feature = view.kind === 'all' && view.sort === 'recent' && !view.series && all.filter((p) => !K.holding(p)).length > 1 ? K.sorted(all.filter((p) => !K.holding(p)), 'recent')[0] : null;
    const real = all.filter((p) => !K.holding(p)); // (“Earlier chats” is a holding place: it is not what the screen is about)
    const list = all.filter((p) => p !== feature);
    const grid = el('div', { class: 'pj-grid' });
    const sugg = el('div', { class: 'pj-suggest' });
    window.ProjectFrontpage?.stop();
    const hero = store.get('projectFrontpage.enabled', false) ? ProjectFrontpage.hero(live) : null; // (the animated front page: only when switched on, Projects › ⋯)
    // Games · Music · Videos, and the sort
    // (a card dragged onto Games / Music / Videos becomes that kind; onto “Older version”, it is folded there)
    const dropOn = (node, fn) => { node.addEventListener('dragover', (e) => { if (!dragged) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; node.classList.add('pj-drop'); }); node.addEventListener('dragleave', () => node.classList.remove('pj-drop')); node.addEventListener('drop', (e) => { node.classList.remove('pj-drop'); const p = dragged && P.get(dragged); dragged = null; if (!p) return; e.preventDefault(); e.stopPropagation(); fn(p); }); return node; };
    const tab = (id, label, count) => { const b = el('button', { type: 'button', class: `pj-tab${view.kind === id ? ' on' : ''}`, dataset: { kind: id }, title: K.IDS.includes(id) ? 'Click: only these · drop a project here to make it one' : '', attrs: { 'aria-pressed': view.kind === id ? 'true' : 'false' }, on: { click: () => setView({ kind: id }) } }, el('span', { text: label }), el('i', { text: String(count) })); return K.IDS.includes(id) ? dropOn(b, (p) => { P.setWorkspace(p, { kind: id }, { quiet: true }); toast(`“${p.name}” is ${id === 'music' ? 'music' : `a ${id}`} now`, { timeout: 2600 }); }) : b; };
    const series = K.seriesOf(live);
    const bar = el('div', { class: 'pj-bar', attrs: { role: 'toolbar', 'aria-label': 'Which projects' } },
      tab('all', 'All', A.counts.all), ...K.KINDS.map((k) => tab(k.id, `${k.icon} ${k.plural}`, A.counts[k.id])), A.counts.none ? tab('none', 'Not set', A.counts.none) : null,
      series.length ? el('select', { class: 'pj-series-pick', title: 'Only one series', attrs: { 'aria-label': 'Series' }, on: { change: (e) => setView({ series: e.target.value }) } }, el('option', { value: '', text: 'Every series' }), ...series.map((x) => el('option', { value: x.name, text: `${x.name} · ${x.n}`, selected: x.name === view.series }))) : null,
      el('select', { class: 'pj-sort', title: 'Order', attrs: { 'aria-label': 'Order' }, on: { change: (e) => setView({ sort: e.target.value }) } }, ...K.SORTS.map(([id, label]) => el('option', { value: id, text: label, selected: id === view.sort }))));
    // "Older version": made for the old player; they open, edit and render as before
    let older = null;
    if (A.older.length) {
      const og = el('div', { class: 'pj-grid pj-grid-older' });
      older = el('details', { class: 'pj-older', open: view.older || !real.length /* (nothing current: the fold is the screen, so it is open) */ }, el('summary', {}, el('b', { text: `Older version · ${A.older.length}` }), el('span', { class: 'pj-older-hint', text: 'Made for the old player. They open, edit and render as before.' })), og);
      const fill = () => { if (older.open && !og.children.length) og.append(...A.older.map((p) => card(p))); };
      dropOn(older.querySelector('summary'), (p) => { P.setField(p, 'shelf', 'older'); toast(`“${p.name}” is under “Older version”`, { timeout: 3000, action: { label: 'Undo', fn: () => P.setField(p, 'shelf', 'current') } }); });
      older.addEventListener('toggle', () => { fill(); if (real.length) store.set(VIEW_KEY, { ...viewOf(), older: older.open }); });
      fill();
    }
    const nothing = !real.length ? (live.length ? el('p', { class: 'pj-empty', text: A.older.length ? 'Nothing here on the new player yet. Your earlier projects are under “Older version” below.' : 'No project of this kind yet. ＋ New project makes one.' }) : empty()) : null;
    S.body.replaceChildren(...[hero, live.length ? bar : null, feature ? card(feature, { feature: true }) : null, nothing, list.length ? grid : null, older, nextIdeas(feature || real[0] || null), sugg].filter(Boolean));
    let at = 0;
    const more = () => {
      const next = list.slice(at, at + CHUNK);
      at += next.length;
      grid.append(...next.map((p) => card(p)));
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
      el('p', { text: 'No projects yet. A project is one thing you are making: a game, a visual for a song, or a video. It keeps its chat, its scene and its moodboard together.' }),
      el('p', { class: 'hint', text: 'Make one with ＋ New project, or from a suggestion below. Every chat belongs to one project: right-click a chat › Move to project… Makes become projects by themselves.' })); // (round 116, projchats116)
  }
  // what could come next: a row of ideas, each one click into the new-project card (name, kind and pitch filled in)
  const startIdea = (idea) => ProjectWorkspace.wizard({ name: idea.name || '', kind: idea.kind, intent: idea.pitch || '', series: idea.series || '' }).catch((err) => toast(calmError(err), { type: 'error' }));
  function ideaChip(idea) {
    const k = K.kind(idea.kind);
    return el('button', { type: 'button', class: `pj-idea${idea.ai ? ' pj-idea-ai' : ''}`, title: `${idea.pitch}\nClick: start it as a new project (you can change everything first)`, dataset: { kind: idea.kind }, on: { click: () => startIdea(idea) } },
      el('span', { class: 'pj-idea-kind', text: k ? k.icon : '✦' }), el('span', { class: 'pj-idea-text' }, el('b', { text: idea.name || idea.label }), el('span', { text: idea.name ? idea.label : idea.pitch })));
  }
  function ideaRows(p, { ai = true } = {}) {
    const ideas = p.ideas?.follow?.length || p.ideas?.fresh?.length ? p.ideas : K.followUps(p);
    const rows = [
      ideas.follow?.length ? el('div', { class: 'pj-next-row' }, el('span', { class: 'pj-next-label', text: `After “${K.cap(p.name, 28)}”` }), ...ideas.follow.map(ideaChip)) : null,
      ideas.fresh?.length ? el('div', { class: 'pj-next-row' }, el('span', { class: 'pj-next-label', text: 'A different series' }), ...ideas.fresh.map(ideaChip)) : null];
    if (ai) rows.push(el('div', { class: 'pj-next-row pj-next-more' },
      el('button', { type: 'button', class: 'ghost small', text: p.ideas ? '✦ Other ideas' : '✦ Ideas from the AI', title: 'One small AI call: three follow-ups for this project and three ideas for a different series, from what it is and what else you made', on: { click: (e) => askIdeas(p, e.currentTarget) } }),
      p.ideas ? el('button', { type: 'button', class: 'ghost small', text: 'Back to the plain ones', title: 'Forget the AI’s ideas for this project', on: { click: () => P.setField(P.get(p.id) || p, 'ideas', null) } }) : null));
    return rows.filter(Boolean);
  }
  function nextIdeas(p) {
    if (!p) return null;
    return el('section', { class: 'pj-next', dataset: { project: p.id } }, el('h3', { text: 'What could come next' }), ...ideaRows(p));
  }
  async function askIdeas(p, button) {
    const a = H.claudeAgent?.() || H.agents().find((x) => x.mode === 'native');
    if (!a) { toast('Add a native AI in Settings first.', { type: 'error' }); return; }
    if (button) { button.disabled = true; button.textContent = '✦ Thinking…'; }
    try {
      let mood = '';
      try { if (window.MoodRead && p.workspace?.boardId) { await MoodRead.ready(); mood = MoodRead.get(p.workspace.boardId)?.board?.mood || ''; } } catch { /* no read */ }
      const r = await window.hub.askOnce({ agentId: a.id, text: K.ideasPrompt(p, P.live(), { mood }), options: { lean: true, helper: true } });
      if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'project ideas' } }));
      const ideas = r?.ok ? K.parseIdeas(r.text, p) : null;
      if (!ideas) throw Error(r?.error || 'No ideas came back. Try again.');
      P.setField(P.get(p.id) || p, 'ideas', { ...ideas, at: Date.now() });
    } catch (err) { toast(calmError(err), { type: 'error' }); if (button) { button.disabled = false; button.textContent = '✦ Ideas from the AI'; } }
  }
  // the Continue card says where the project stands: its brief's next step (kv 'project-briefs') and its moodboard's
  // mood (kv 'mood-reads'), read from the stores (no group is loaded for it), kept for half a minute
  let upCache = { at: 0, briefs: null, moods: null };
  async function upNext(p) {
    if (Date.now() - upCache.at > 30000) upCache = { at: Date.now(), briefs: window.hub.kvGet('project-briefs', null).catch(() => null), moods: window.hub.kvGet('mood-reads', null).catch(() => null) };
    const out = [];
    const b = (await upCache.briefs)?.list?.find((e) => e && e.id === p.id);
    const steps = b?.brief?.steps || []; const done = b?.done || [];
    const i = steps.findIndex((_s, k) => !done.includes(k));
    if (i >= 0) out.push(['Next step', K.cap(steps[i], 140), `${done.length} of ${steps.length} steps done`]);
    else if (steps.length) out.push(['Plan', 'Every step of the plan is done.', '']);
    const m = p.workspace?.boardId && (await upCache.moods)?.list?.find((e) => e && e.id === p.workspace.boardId)?.board?.mood;
    if (m) out.push(['Mood', K.cap(m, 140), 'From the moodboard\'s read']);
    return out;
  }
  function upNextBox(p) {
    const box = el('div', { class: 'pj-upnext', hidden: true });
    upNext(p).then((rows) => { if (!rows.length || !box.isConnected) return; box.replaceChildren(...rows.map(([label, text, tip]) => el('p', { title: tip || '' }, el('b', { text: label }), el('span', { text: text })))); box.hidden = false; }).catch(() => {});
    return box;
  }
  function card(p, { feature = false } = {}) {
    const cover = P.coverOf(p);
    const pic = el('div', { class: 'pj-cover' }, cover ? el('img', { src: cover, alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { class: 'pj-cover-mark', text: p.ident.glyph }));
    ProjectFrontpage.decorate(pic,p);
    const pitch = K.pitchOf(p);
    const tag = kindTag(p);
    if (tag) pic.append(tag);
    if (p.pin) pic.append(el('span', { class: 'pj-pin', text: '★', title: 'Pinned to the top (the ⋯ menu unpins it)' }));
    const c = el('div', { class: `pj-card pj-st-${p.status}${feature ? ' pj-feature' : ''}`, tabIndex: 0, title: `${p.name}${pitch ? `\n${pitch}` : ''}\n${C.countText(p)}\nClick: resume this project · right-click: more · F2: rename`, dataset: { project: p.id, kind: K.kindOf(p) || '' } },
      pic,
      el('div', { class: 'pj-card-text' },
        feature ? el('span', { class: 'pj-eyebrow', text: 'Continue' }) : null,
        el('div', { class: 'pj-card-head' }, el('b', { class: 'pj-name', text: p.name }), p.status !== 'active' ? el('span', { class: 'pj-pill', text: C.STATUS[p.status] }) : null, p.revived ? el('span', { class: 'pj-pill pj-pill-revived', text: 'Deleted elsewhere?', title: 'Deleted on your other computer, but it changed after that: open it to keep it or delete it' }) : null, // (round 76, projsync76)
          el('button', { type: 'button', class: 'ghost small pj-go pj-card-more', text: '⋯', title: 'This project’s menu', attrs: { 'aria-label': `${p.name}: menu`, 'aria-haspopup': 'menu' }, on: { click: (e) => { e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); P.openMenu(p, b.left, b.bottom + 4, 'home'); } } })), // (round 128, projmenu128) the one project menu
        pitch ? el('p', { class: 'pj-card-description', text: pitch })
          : el('button', { type: 'button', class: 'pj-go pj-card-description pj-pitch-add', text: 'What is it going to be?', title: 'Write one line on what this project is going to be', on: { click: (e) => { e.stopPropagation(); editPitch(p).catch((err) => toast(calmError(err), { type: 'error' })); } } }),
        p.series ? el('span', { class: 'pj-series', text: p.series, title: `Part of the series “${p.series}”` }) : null,
        feature ? upNextBox(p) : null,
        feature ? el('div', { class: 'pj-continue' }, ...continueChips(p)) : null));
    const identity=el('button',{type:'button',class:'pj-go pw-banner-edit',text:'✦',title:'Generate a Three.js banner / logo',attrs:{'aria-label':`Design ${p.name} banner`},on:{click:e=>{e.stopPropagation();ProjectFrontpage.edit(p).catch(err=>toast(calmError(err),{type:'error'}));}}});pic.append(identity);
    tint(c, p.ident.color);
    c.addEventListener('click', (e) => { if (e.target.closest('.pj-go')) return; openProject(p); });
    c.addEventListener('keydown', (e) => {
      if (e.target !== c) return;
      if (e.key === 'Enter') openProject(p);
      else if (e.key === 'F2') { e.preventDefault(); P.renamePrompt(p); } // (round 182) the card under the keyboard: F2 renames, P pins, the arrows walk the cards
      else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); P.setField(p, 'pin', !p.pin); }
      else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) { const cs = [...S.body.querySelectorAll('.pj-card')].filter((x) => x.offsetParent); const i = cs.indexOf(c); const cols = Math.max(1, Math.round((c.parentElement?.clientWidth || 1) / (c.offsetWidth + 18))); const j = i + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? cols : -cols); if (cs[j]) { e.preventDefault(); cs[j].focus(); } }
    });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); P.openMenu(p, e.clientX, e.clientY, 'home'); }); // (round 128, projmenu128)
    c.draggable = true; // (round 182) onto Games / Music / Videos or “Older version”
    c.addEventListener('dragstart', (e) => { dragged = p.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/x-hearth-project', p.id); } catch { /* the id is kept here */ } });
    c.addEventListener('dragend', () => { setTimeout(() => { dragged = null; }, 0); });
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
      { label: 'Shared tools & earlier work', items: () => [{label:'Creative board',action:()=>WorkspaceNav.creative('studio')},{label:'Moodboards',action:()=>activate('tool:board')}] },
      a ? { label: 'New chat (in a project)…', key: 'Ctrl+N', action: () => { activate(a.id); Native.newChat(a.id, { byOwner: true }); } } : null, // (round 116, projchats116) asks which project when none is open // (round 125, askwhen125)
      { label: 'Open the Lab', action: () => activate('tool:three') },
      { label: 'Search everything…', key: 'Ctrl+Shift+K', action: () => ProjectsSearch.open() },
      { label: 'Suggest projects', action: () => suggestNow() },
      (() => { const n = P.live().filter(K.needs).length; return n ? { label: `✦ Sort my projects (${n} without a kind or a line)`, hint: 'one small AI call', action: () => sortAll().catch((err) => toast(calmError(err), { type: 'error' })) } : null; })(), // (round 182, projclean182)
      // (round 116, projchats116) “Group chats by project” is gone: the chats list shows the open project's chats only
      // (round 74, projdesk74) opt-in: the preview page stays loaded behind this page, so opening a project is as quick as switching
      { label: `${ProjectWorkspace.keepLab() ? '✓ ' : ''}Keep the Lab ready behind Projects`, hint: 'Opens projects faster · uses more memory', action: () => { const on = ProjectWorkspace.keepLab(!ProjectWorkspace.keepLab()); toast(on ? 'The Lab stays ready behind Projects (uses more memory)' : 'The Lab is let go behind Projects', { timeout: 3000 }); } },
      { label: 'Archived projects', items: () => { const xs = P.all().filter((p) => p.status === 'archived'); return xs.length ? xs.map((p) => ({ label: `${p.ident.glyph} ${p.name}`, action: () => show(p.id) })) : [{ label: 'None', disabled: true }]; } },
      // (round 72, projects72) a deleted project comes back with its notes, look and links (its chats and scenes never left)
      { label: 'Recently deleted projects', items: () => { const xs = P.trashed(); return xs.length ? xs.map((p) => ({ label: `${p.ident.glyph} ${p.name}`, hint: `Restore · deleted ${timeAgo(p.deletedAt)}`, action: () => { if (P.restoreProject(p.id)) toast(`“${p.name}” is back in Projects`, { timeout: 4000 }); } })) : [{ label: 'Nothing deleted', disabled: true }]; } },
    ].filter(Boolean);
  }
  // ✦ Sort my projects: one AI call gives the projects without a kind or a line both (never changing one that is there)
  async function sortAll() {
    const list = P.live(); const text = K.sortPrompt(list);
    if (!text) { toast('Every project has its kind and its line.'); return 0; }
    const a = H.claudeAgent?.() || H.agents().find((x) => x.mode === 'native');
    if (!a) throw Error('Add a native AI in Settings first.');
    const note = toast('✦ Sorting your projects…', { timeout: 0 });
    try {
      const r = await window.hub.askOnce({ agentId: a.id, text, options: { lean: true, helper: true } });
      if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'sort projects' } }));
      const rows = r?.ok ? K.parseSort(r.text, list) : null;
      if (!rows) throw Error(r?.error || 'The answer could not be read. Try again.');
      for (const row of rows) { const p = P.get(row.id); if (!p) continue; if (row.kind) P.setWorkspace(p, { kind: row.kind }, { quiet: true }); if (row.pitch) P.setField(p, 'pitch', row.pitch); }
      toast(rows.length ? `✦ ${rows.length} project${rows.length === 1 ? '' : 's'} sorted: check their kinds and lines, and change any from the ⋯ menu` : 'Nothing to change.', { timeout: 6000 });
      return rows.length;
    } finally { note?.remove?.(); }
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
        el('button', { type: 'button', class: `pj-p-pitch${K.pitchOf(p) ? '' : ' pj-pitch-add'}`, text: K.pitchOf(p) || 'What is it going to be?', title: 'What this project is going to be: click to write it', on: { click: () => editPitch(p).catch((err) => toast(calmError(err), { type: 'error' })) } }), // (round 182, projclean182)
        el('div', { class: 'pj-meta', text: `${C.countText(p)} · made ${p.from === 'make' ? 'from a make' : p.from === 'suggest' ? 'from a suggestion' : 'by hand'} · ${timeAgo(p.at)}` }),
        upNextBox(p), // (round 182, projclean182) where it stands: the plan's next step, the moodboard's mood
        syncLine(p), revivedNote(p), // (round 76, projsync76)
        el('div', { class: 'pj-p-actions' },
          el('button', { type: 'button', class: 'primary small', text: '▶ Scene', title: 'Resume the scene', on: { click: () => ProjectWorkspace.go('scene') } }),
          el('button', { type: 'button', class: 'ghost small', text: '＋ Add', title: 'This chat, the scene on screen, a recent chat / scene / board / render / file…', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); P.warm?.(); showMenu(b.left, b.bottom + 4, P.addMenu(p)); } } }),
          el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'This project’s menu', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); P.openMenu(p, b.left, b.bottom + 4, 'desk'); } } })), // (round 128, projmenu128) the one project menu
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
    const about=el('details',{class:'pw-about'},el('summary',{text:'Project notes & setup'}),notes,p.workspace?.description?el('p',{class:'pw-about-copy',text:p.workspace.description}):null,row('Project setup','spark',()=>ProjectWorkspace.settings(p)),row('Write description with AI','chat',()=>ProjectWorkspace.describe(p)));
    const conversations=chats.length>1?block('Conversations',...chats.map(x=>row(P.nameOf(x),'chat',()=>ProjectWorkspace.conversation(p,x.ref)))):null;
    const files=filesShelf(p,state);
    const next=el('details',{class:'pj-next pw-next'},el('summary',{text:'What could come next'}),...ideaRows(p)); // (round 182, projclean182) follow-ups of this project, and a different series
    S.body.replaceChildren(head,...(window.ProjFind?[ProjFind.box(p)]:[]),materials,modules,...(conversations?[conversations]:[]),about,next,files); // (round 116, slim116: no quest card, no Instruments block) (round 81, projsearch81) ProjFind.box: Find in this project, one box for everything in it (projfind.js)
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
      results.replaceChildren(...ORDER.flatMap(t=>{const xs=shown.filter(x=>x.type===t);return xs.length?[el('section',{class:'pj-sec'},el('h4',{text:C.TYPES[t].icon+' '+C.TYPES[t].label}),...sceneRows(p,t,xs,long))]:[];}),...(!hits.length?[el('p',{class:'hint',text:q||kind.value?'No matching files.':'Add a scene, chat, or file to see it here.'})]:[])); // (round 74) lazy: a long shelf's row picture loads once the row is drawn
      count.textContent=`${shown.length} of ${hits.length}`;more.hidden=shown.length>=hits.length;
      const saved=desks.get(p.id)||state;saved.fileLimit=limit;desks.set(p.id,saved);
    };
    query.oninput=kind.onchange=()=>{limit=60;paint();};more.onclick=()=>{limit+=60;paint();};d.addEventListener('toggle',()=>{if(d.open&&!painted)paint();});
    if((state.open||[]).includes('pw-project-files')){d.open=true;paint();}
    return d;
  }
  // (Nov 9, Scenes v2) a project's scenes: v2 (WebGPU) ones first, the old format's folded under "Old version" (they open,
  // edit and render as before); a scene's format is known once the Lab is loaded, else the list stays as it was
  function sceneRows(p,t,xs,long){
    const rows=(list)=>el('div',{class:'pj-items'},...list.map(x=>itemRow(p,x,{lazy:long})));
    const L=t==='scene'&&Lazy.loaded('lab')&&typeof ThreeLab!=='undefined'?ThreeLab.scenes:null;
    if(!L?.get)return [rows(xs)];
    const old=xs.filter(x=>L.get(x.ref)&&L.get(x.ref).format!=='gpu'),fresh=xs.filter(x=>!old.includes(x));
    if(!old.length)return [rows(xs)];
    const fold=el('details',{class:'pj-old-scenes'},el('summary',{text:`Old version · ${old.length}`,title:'Scenes made before v2: open, edit and render them as always'}),rows(old));
    fold.open=!fresh.length;
    return [...(fresh.length?[rows(fresh)]:[]),fold];
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

  return { show, formats: () => S.formats || null, editPitch, sortAll, mounted: () => S.mounted, openProject: () => (visible() ? S.open : null), newProject, paint, isVisible: visible };
})();
window.ProjectsHome = ProjectsHome;
