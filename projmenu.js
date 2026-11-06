// (round 128, projmenu128) One project menu, the same wherever a project shows: the chats list's project bar (name ▾),
// a Home card (⋯ and right-click), the Desk's ⋯, Search everything's project rows, the workspace bar's name ▾ (its top
// row), Ctrl/⌘+K ("Project: …" rows and "Project menu") and Ctrl/⌘+Shift+O. Lazy group "projmenu" (after "projects").
//   ProjectMenu.items(p, { where }) → the rows (sections Open · Make · AI · Look · Share & keep · Settings · Close),
//     each with an id (tests, Ctrl/⌘+K), its label, an icon and its action. Every row calls what already does the job
//     (Projects, ProjectWorkspace, ProjChats, ProjBundle, Access, the Lab); a row whose feature isn't there is left out.
//   ProjectMenu.show(p, { x, y, where, kbd }) → the menu with its header: the mark, the name, one status line.
//   ProjectMenu.status(p) → "3 chats · 2 scenes · song 128 BPM · brief ready"
//   ProjectMenu.openHere({ kbd }) → the menu of the project in front of you (Ctrl/⌘+Shift+O, Ctrl/⌘+K › Project menu)
// New, small: Colour and mark… (a picker), Cover picture › a frame of its main scene, Default AI, Aspect & frame rate
// (p.prefs = { agentId, aspect, fps }: an ordinary project field, synced; the Lab reads it when a project scene shows).
const ProjectMenu = (() => {
  const P = Projects;
  const C = ProjectsCore;
  const KEY = 'Ctrl+Shift+O';
  const fail = (err) => { if (err && !err.shown && err.name !== 'AbortError') toast(calmError(err), { type: 'error', raw: err }); };
  // a row's action: errors become a calm toast (a row never throws into the menu)
  const go = (fn) => () => { try { const r = fn(); if (r && typeof r.catch === 'function') r.catch(fail); return r; } catch (err) { fail(err); return null; } };
  const labOn = () => Boolean(window.Lazy?.loaded?.('lab') && typeof ThreeLab !== 'undefined' && ThreeLab.scenes);
  const has = (name) => typeof window[name] !== 'undefined';
  const prefs = (p) => (p?.prefs && typeof p.prefs === 'object' ? p.prefs : {});
  function setPrefs(p, patch) { p.prefs = { ...prefs(p), ...patch }; for (const k of Object.keys(p.prefs)) if (p.prefs[k] == null || p.prefs[k] === '') delete p.prefs[k]; p.updated = Date.now(); P.changed(p, 'prefs'); }
  const ofType = (p, ...types) => (p.items || []).filter((x) => types.includes(x.type));
  const chatsOf = (p) => ofType(p, 'chat').filter((x) => (H.chats || []).some((c) => c.id === x.ref));
  // the main scene: the Desk's own scene, else the latest one put in it
  function mainScene(p) {
    const w = p.workspace?.sceneId;
    if (w) return w;
    try { return P.lastOf(p, ['scene'])?.ref || null; } catch { return ofType(p, 'scene').at(-1)?.ref || null; }
  }
  // the chat the AI rows act on: the Desk's own chat, else the latest one
  function mainChat(p) {
    const w = p.workspace?.chatId;
    if (w && (H.chats || []).some((c) => c.id === w)) return w;
    try { return P.lastOf(p, 'chat')?.ref || chatsOf(p).at(-1)?.ref || null; } catch { return chatsOf(p).at(-1)?.ref || null; }
  }
  const natives = () => H.agents().filter((a) => a.mode === 'native');
  const io = { pick: (o) => window.hub.openDialog(o) }; // (the file picker: a check stands in for it)

  // ---------- the brief (aiprep128's ProjectBrief, lazy group "projectbrief"): its rows only when it exists ----------
  const briefThere = () => has('ProjectBrief') || Boolean(window.Lazy?.groups?.().some((g) => g.name === 'projectbrief'));
  const brief = (fn) => (has('ProjectBrief') ? Promise.resolve() : window.Lazy.load('projectbrief')).then(() => fn(window.ProjectBrief));
  function briefReady(p) {
    if (!has('ProjectBrief')) return Boolean(p.brief?.text || p.brief?.at);
    try { return Boolean(ProjectBrief.get(p.id)); } catch { return false; } // (round 128) ProjectBrief.get → brief | null
  }

  // ---------- the header's one line ----------
  function status(p) {
    const n = (t) => ofType(p, t).length;
    const bits = [C.plural(chatsOf(p).length || n('chat'), 'chat'), C.plural(n('scene'), 'scene')];
    const sc = mainScene(p);
    if (labOn() && sc) {
      let song = null; try { song = ThreeLab.scenes.songOf?.(sc); } catch { /* not read */ }
      if (song) {
        let bpm = 0;
        try { const pl = ThreeLab.stageHooks?.player; if (pl?.loaded && ThreeLab.scenes.currentId?.() === sc && pl.bpm) bpm = Math.round(pl.bpm); } catch { /* not playing */ }
        bits.push(bpm ? `song ${bpm} BPM` : 'song');
      }
    }
    const r = n('render'); if (r) bits.push(C.plural(r, 'render'));
    if (briefThere()) bits.push(briefReady(p) ? 'brief ready' : 'no brief yet');
    if (p.status && p.status !== 'active') bits.push(String(C.STATUS[p.status] || p.status).toLowerCase());
    return bits.join(' · ');
  }

  // ---------- the rows ----------
  const S = (label) => label; // a section's title (a plain string: showMenu draws it as a heading)
  function items(p, { where = 'menu' } = {}) {
    if (!p) return [];
    const sc = mainScene(p);
    const chat = mainChat(p);
    const ws = Boolean(p.workspace);
    const archived = p.status === 'archived';
    const mk = p.make && has('Makes') ? Makes.get(p.make) : null;
    const pr = prefs(p);
    const out = [
      S('Open'),
      { id: 'desk', label: 'Open the Desk', icon: 'home', tip: 'The project’s page: its scene, chats, moodboard and files', action: go(() => ProjectWorkspace.open(p.id, 'overview')) },
      sc ? { id: 'lab', label: 'Open in the Lab', icon: 'three', hint: sceneName(sc), tip: 'Its main scene in the Three.js Lab', action: go(() => openLab(p)) } : null,
      { id: 'chats', label: 'Open its chats', icon: 'panel', hint: C.plural(chatsOf(p).length, 'chat'), tip: 'The chats list on the left shows this project’s chats', action: go(() => openChats(p)) },
      { id: 'continue', label: 'Continue where you left off', icon: 'recent', action: go(() => P.continueIn(p)) },
      mk ? { id: 'make', label: `Its make (${mk.name})`, items: () => Makes.makeMenu(mk) } : null,
      { id: 'switch', label: 'Other projects', items: () => others(p, where) },
      S('Make'),
      { id: 'newchat', label: 'New chat', icon: 'plus', items: () => newChatRows(p) },
      { id: 'newscene', label: 'New scene', icon: 'three', tip: 'Opens its Lab and the templates: the scene you make joins the project', action: go(() => newScene(p)) },
      p.workspace?.boardId ? { id: 'moodboard', label: 'Add to the moodboard…', icon: 'board', tip: 'Pictures or videos from your computer', action: go(() => addToBoard(p)) } : null,
      sc ? { id: 'song', label: 'Add a song or footage…', icon: 'film', tip: 'A song or a video for its main scene', action: go(() => addSong(p)) } : null,
      { id: 'add', label: 'Add something already made', items: () => { P.warm?.(); return P.addMenu(p); } },
      { id: 'notes', label: 'Notes…', icon: 'notes', action: go(() => P.notesPrompt(p)) },
    ];
    // AI: the brief (aiprep128) when it exists, and the Desk's description writer
    const bf = briefThere();
    const ai = [
      bf ? { id: 'brief', label: briefReady(p) ? (window.ProjectBrief?.stale?.(p.id) ? 'Refresh the brief (things changed)' : 'Refresh the brief') : 'Prepare the brief', icon: 'sparkle', tip: 'A short brief of the project the AIs read', action: go(() => brief((B) => B.prepare(p.id, {}).then(() => B.open(p.id)))) } : null,
      bf ? { id: 'next', label: 'Ask the AI what to do next', icon: 'tochat', action: go(() => brief((B) => B.open(p.id))) } : null,
      ws ? { id: 'describe', label: p.workspace.description ? 'Rewrite its description with AI' : 'Write its description with AI', icon: 'pen', action: go(() => ProjectWorkspace.describe(p)) } : null,
    ].filter(Boolean);
    if (ai.length) out.push(S('AI'), ...ai);
    out.push(
      S('Look'),
      { id: 'rename', label: 'Rename…', icon: 'pen', action: go(() => P.renamePrompt(p)) },
      { id: 'look', label: 'Colour and mark…', icon: 'vibe', action: go(() => lookDialog(p)) },
      { id: 'cover', label: 'Cover picture', icon: 'shot', items: () => coverRows(p) },
      has('ProjectFrontpage') ? { id: 'banner', label: '✦ Three.js banner / logo…', action: go(() => ProjectFrontpage.edit(p)) } : null,
      S('Share & keep'),
      { id: 'export', label: '⇪ Export project…', hint: 'one .hearthproject file', action: go(() => P.bundle((B) => B.exportProject(p))) },
      { id: 'duplicate', label: '⧉ Duplicate project', action: go(() => P.bundle((B) => B.duplicateProject(p))) },
      sc ? { id: 'template', label: 'Save as a template…', icon: 'grid', tip: 'Its main scene, palette, size, frame rate and brief, as a start for new projects (＋ New project › Start from › My templates)', action: go(() => window.Lazy.load('projtemplates').then(() => ProjTemplates.saveDialog(p))) } : null, // (round 129, next129)
      folderOf(p) ? { id: 'folder', label: 'Show its folder', icon: 'grid', hint: base(folderOf(p).replace(/[\\/]+$/, '')), action: go(() => showFolder(p)) } : null,
      sc ? { id: 'render', label: 'Render the main scene…', icon: 'export', tip: 'Its main scene in the Lab, then Export (video, stills, GIF…)', action: go(() => renderMain(p)) } : null,
      has('Offline') ? { id: 'offline', label: '⇩ Prepare for offline…', action: go(() => Offline.prepare(p)) } : null,
      { id: 'versions', label: 'Earlier versions…', icon: 'clock', action: go(() => window.Lazy.load('versions').then(() => Versions.open({ kind: 'project', id: p.id, name: p.name }))) },
      S('Settings'),
      { id: 'ai', label: 'Default AI', icon: 'claude', hint: H.agent(pr.agentId)?.name || '', items: () => defaultAiRows(p) },
      ws ? { id: 'personality', label: 'AI personality…', icon: 'setup', action: go(() => ProjectWorkspace.settings(p)) } : null,
      { id: 'frame', label: 'Aspect & frame rate…', icon: 'frames', hint: [pr.aspect, pr.fps ? `${pr.fps} fps` : ''].filter(Boolean).join(' · '), action: go(() => frameDialog(p)) },
      chat && has('Access') ? { id: 'access', label: 'Files the AI may use…', icon: 'lock', tip: 'The folders its chat may read or change', action: go(() => accessMenu(p, chat)) } : null,
      { id: 'status', label: 'Status', items: () => Object.entries(C.STATUS).map(([k, l]) => ({ label: l, checked: p.status === k, action: go(() => P.setStatus(p, k)) })) },
      S('Close'),
      { id: 'archive', label: archived ? 'Unarchive' : 'Archive', icon: 'stop', tip: archived ? 'Back with your projects' : 'Out of the lists, kept as it is (Projects › ⋯ › Archived projects)', action: go(() => setArchived(p, !archived)) },
      ...(p.revived ? [{ id: 'keep', label: 'Keep it (it was deleted on the other computer)', action: go(() => P.settleRevived(p, true)) }] : []),
      { id: 'delete', label: 'Delete the project…', danger: true, action: go(() => askDelete(p)) },
    );
    return out.filter(Boolean);
  }
  const base = (s) => String(s || '').split(/[\\/]/).pop();
  function sceneName(id) { try { return labOn() ? C.cap(ThreeLab.scenes.get(id)?.name || '', 28) : ''; } catch { return ''; } }

  // ---------- Open ----------
  async function openLab(p) {
    const sc = mainScene(p);
    if (!sc) throw Error('This project has no scene yet.');
    if (p.workspace?.sceneId === sc) return ProjectWorkspace.open(p.id, 'scene');
    return P.openScene(sc);
  }
  function openChats(p) {
    window.ProjChats?.setScope(p.id);
    if (!H.panelOpen) { H.panelOpen = true; applyLayout(); }
    return true;
  }
  function others(p, where) {
    const pick = (x) => (where === 'bar' ? window.ProjChats?.setScope(x.id) : ProjectWorkspace.open(x.id).catch(fail));
    return [
      ...P.live().filter((x) => x.id !== p.id).slice(0, 14).map((x) => ({ label: `${x.ident.glyph} ${x.name}`, hint: C.countText(x), action: () => pick(x) })),
      '-',
      { label: '＋ New project…', action: go(() => (has('ProjectsHome') ? ProjectsHome.newProject() : window.ProjChats?.newProject())) },
      { label: 'All projects…', action: go(() => P.openHome()) },
    ];
  }

  // ---------- Make ----------
  function newChatRows(p) {
    const def = prefs(p).agentId;
    const ais = natives().sort((a, b) => (b.id === def) - (a.id === def));
    if (!ais.length) return [{ label: 'Add an AI first (⋯ AI setup)', disabled: true }];
    return ais.map((a) => ({ label: `With ${a.name}`, hint: [a.id === def ? 'default' : '', a.dock ? 'in the Lab' : ''].filter(Boolean).join(' · '), action: go(() => window.ProjChats.newChatIn(p.id, a.id)) }));
  }
  // a new scene: its Lab open, then the templates (a scene made there joins the project: projaudit91 sceneJoins)
  async function newScene(p) {
    await ProjectWorkspace.open(p.id, 'scene');
    await ThreeLab.act('newSketch');
  }
  async function addToBoard(p) {
    const files = await io.pick({ title: `Add to the moodboard of “${p.name}”`, properties: ['openFile', 'multiSelections'], filters: [{ name: 'Pictures and videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov'] }] });
    if (!files?.length) return 0;
    await window.Lazy.load('board');
    await Board.ready?.();
    const b = await Board.load(p.workspace.boardId);
    if (!b) throw Error('The moodboard is not on this computer yet.');
    await Board.addFiles(files, null, b);
    toast(`${C.plural(files.length, 'file')} on the moodboard of “${p.name}”`, { timeout: 3000 });
    return files.length;
  }
  async function addSong(p) {
    const sc = mainScene(p);
    const [file] = (await io.pick({ title: `A song or footage for “${p.name}”`, properties: ['openFile'], filters: [{ name: 'Songs and videos', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aif', 'aiff', 'mp4', 'webm', 'mov', 'm4v'] }] })) || [];
    if (!file) return null;
    await window.Lazy.load('lab');
    await ThreeLab.cmd({ show: false });
    if (!ThreeLab.scenes.setExtras(sc, { media: { path: file } })) throw Error('Its main scene is not on this computer yet.');
    if (ThreeLab.scenes.currentId?.() === sc) ThreeLab.scenes.mediaUp?.(sc);
    P.add(p, 'file', file, base(file), { links: false });
    toast(`“${base(file)}” is on the main scene of “${p.name}”`, { timeout: 3500 });
    return file;
  }

  // ---------- Look ----------
  function lookDialog(p) {
    document.querySelector('dialog.pm-look')?.close();
    const MC = C.MC;
    const mark = el('span', { class: 'pm-look-mark' });
    const colors = MC.PALETTE.map(([hex, name], i) => el('button', { type: 'button', class: 'pm-swatch', title: name, attrs: { 'aria-label': `Colour: ${name}`, style: `--sw:${hex}` }, on: { click: () => { C.setIdent(p, { ci: i }); P.changed(p, 'ident'); paint(); } } }));
    const marks = MC.GLYPHS.map((g, i) => el('button', { type: 'button', class: 'pm-glyph', text: g, attrs: { 'aria-label': `Mark ${g}` }, on: { click: () => { C.setIdent(p, { gi: i }); P.changed(p, 'ident'); paint(); } } }));
    function paint() {
      mark.textContent = p.ident.glyph; mark.style.setProperty('--pj', p.ident.color);
      colors.forEach((b, i) => b.classList.toggle('on', i === p.ident.ci));
      marks.forEach((b, i) => { b.classList.toggle('on', i === p.ident.gi); b.style.setProperty('--pj', p.ident.color); });
    }
    const d = el('dialog', { class: 'ui-modal pm-look', attrs: { 'aria-label': `Colour and mark of ${p.name}` } },
      el('h2', {}, mark, ` ${p.name}`),
      el('p', { class: 'hint', text: 'Its colour and mark show on its card, in the chats list and in its menus, on both computers.' }),
      el('div', { class: 'pm-look-row', attrs: { role: 'group', 'aria-label': 'Colour' } }, ...colors),
      el('div', { class: 'pm-look-row', attrs: { role: 'group', 'aria-label': 'Mark' } }, ...marks),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'primary', text: 'Done', on: { click: () => d.close() } })));
    d.addEventListener('close', () => setTimeout(() => d.remove(), 0));
    paint();
    document.body.append(d);
    d.showModal();
    colors[p.ident.ci]?.focus();
    return d;
  }
  function coverRows(p) {
    const pics = ofType(p, 'render', 'capture').slice(-8).reverse();
    const sc = mainScene(p);
    const here = labOn() && ThreeLab.onScreen?.() && ThreeLab.scenes.currentId?.() && P.ofItem('scene', ThreeLab.scenes.currentId()).includes(p);
    return [
      { label: 'Automatic (its latest picture)', checked: !p.cover, action: go(() => P.setCover(p, null)) },
      ...(sc || here ? [{ label: here ? 'This Lab frame' : 'A frame of its main scene', hint: here ? 'on screen now' : 'opens the Lab', action: go(() => coverFromLab(p)) }] : []),
      ...(pics.length ? ['-', ...pics.map((x) => ({ label: C.cap(P.nameOf(x), 44), hint: x.type === 'render' ? 'render' : 'still', checked: p.cover === x.id, action: go(() => P.setCover(p, x.id)) }))] : []),
    ];
  }
  // the Lab's picture now (the project's scene on screen, else its main scene opened first) as the cover: a still kept
  // with the chats' attachments, added to the project as a capture
  async function coverFromLab(p) {
    const onP = () => labOn() && ThreeLab.onScreen?.() && P.ofItem('scene', ThreeLab.scenes.currentId?.() || '').includes(p);
    if (!onP()) {
      await openLab(p);
      for (let i = 0; i < 40 && !onP(); i += 1) await new Promise((r) => setTimeout(r, 150));
      await new Promise((r) => setTimeout(r, 600)); // (its first frames drawn)
    }
    let url = null;
    for (let i = 0; i < 2 && !url; i += 1) url = await ThreeLab.shot(); // (each waits up to 15 s for a frame: a scene just opened)
    if (!url) throw Error('Nothing is drawing in the Lab yet: try again in a moment.');
    const name = `${String(p.name).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'project'} cover ${Date.now().toString(36)}.png`;
    const path = await window.hub.saveAttachment(name, url.split(',')[1]);
    if (!path) throw Error('The picture couldn’t be saved.');
    P.add(p, 'capture', path, `Cover · ${p.name}`, { links: false });
    P.setCover(p, C.itemId('capture', path));
    toast(`The cover of “${p.name}” is this frame`, { timeout: 3000 });
    return path;
  }

  // ---------- Share & keep ----------
  // its folder: a folder put in it, else the folder of its files (Show reveals it in Explorer / Finder)
  function folderOf(p) {
    const fs = ofType(p, 'file', 'download', 'capture').map((x) => String(x.ref || '')).filter((s) => /[\\/]/.test(s));
    return fs.find((f) => !/\.[a-z0-9]{1,6}$/i.test(f)) || fs[0] || null;
  }
  function showFolder(p) {
    const f = folderOf(p);
    if (!f) throw Error('This project has no files yet.');
    return MediaFile.reveal(f);
  }
  async function renderMain(p) {
    await openLab(p);
    for (let i = 0; i < 40 && typeof LabExport === 'undefined'; i += 1) await new Promise((r) => setTimeout(r, 100));
    return LabExport.panel({ preset: 'last' }); // (round 131, renderpre131) on the project's last-used render preset
  }

  // ---------- Settings ----------
  function defaultAiRows(p) {
    const def = prefs(p).agentId;
    return [
      { label: 'None (the one you pick each time)', checked: !def, action: go(() => setPrefs(p, { agentId: null })) },
      ...natives().map((a) => ({ label: a.name, checked: a.id === def, hint: a.dock ? 'in the Lab' : '', action: go(() => { setPrefs(p, { agentId: a.id }); toast(`New chats in “${p.name}” offer ${a.name} first`, { timeout: 2500 }); }) })),
    ];
  }
  const ASPECTS = [['16:9', '1920×1080 · YouTube'], ['9:16', '1080×1920 · Shorts, Reels'], ['4:5', '1080×1350 · Instagram'], ['1:1', '1080×1080 · square'], ['21:9', '2560×1080 · cinematic'], ['4:3', '1440×1080 · TV'], ['4k', '3840×2160 · 4K']];
  const RATES = [24, 25, 30, 50, 60];
  async function frameDialog(p) {
    const pr = prefs(p);
    const v = await Modal.form(`Aspect & frame rate · ${p.name}`, [
      { name: 'aspect', label: 'Frame', type: 'select', value: pr.aspect || '', options: [{ value: '', label: 'Each scene its own' }, ...ASPECTS.map(([id, t]) => ({ value: id, label: `${id}  (${t})` }))] },
      { name: 'fps', label: 'Frame rate', type: 'select', value: pr.fps ? String(pr.fps) : '', options: [{ value: '', label: 'Each scene its own' }, ...RATES.map((n) => ({ value: String(n), label: `${n} fps` }))] },
    ], { ok: 'Save' });
    if (!v) return null;
    setFrame(p, { aspect: v.aspect || null, fps: Number(v.fps) || null });
    toast(v.aspect || v.fps ? `“${p.name}”: ${[v.aspect, v.fps ? `${v.fps} fps` : ''].filter(Boolean).join(' · ')} (its scenes use it in the Lab)` : `“${p.name}”: each scene keeps its own frame`, { timeout: 3500 });
    return v;
  }
  // saved on the project, and put on its scenes now when the Lab is in (else when each one shows: applyLab)
  function setFrame(p, { aspect, fps }) {
    setPrefs(p, { aspect, fps });
    if (!labOn()) return 0;
    let n = 0;
    for (const x of ofType(p, 'scene')) {
      try {
        if (!ThreeLab.scenes.get(x.ref)) continue;
        if (aspect && ThreeLab.scenes.frameOf(x.ref) !== aspect) { ThreeLab.scenes.setFrame(x.ref, aspect); n += 1; }
        const tl = fps ? ThreeLab.scenes.timelineOf(x.ref) : null;
        if (tl && tl.fps !== fps) { ThreeLab.scenes.setTimeline(x.ref, { ...tl, fps }); n += 1; }
      } catch (err) { console.warn('projmenu frame', err); }
    }
    return n;
  }
  // the Lab reads the project's frame: a project scene that shows with no frame of its own (or the default 30 fps
  // timeline) takes the project's
  function applyLab(id) {
    if (!labOn() || !id) return false;
    const p = P.ofItem('scene', id).find((x) => prefs(x).aspect || prefs(x).fps);
    if (!p) return false;
    const { aspect, fps } = prefs(p);
    let did = false;
    try {
      if (aspect && !ThreeLab.scenes.frameOf(id)) { ThreeLab.scenes.setFrame(id, aspect); did = true; }
      const tl = fps ? ThreeLab.scenes.timelineOf(id) : null;
      if (tl && (tl.fps || 30) === 30 && fps !== 30) { ThreeLab.scenes.setTimeline(id, { ...tl, fps }); did = true; }
    } catch (err) { console.warn('projmenu lab', err); }
    return did;
  }
  addEventListener('hearth:sketch', (e) => applyLab(e.detail?.id));
  // the main chat's access (Access.menuItem: As in AI setup, a level for this chat, its folders) where the menu was
  let at = { x: 200, y: 120 };
  async function accessMenu(p, chatId) {
    const c = await Native.load(chatId);
    if (!c) throw Error('Its chat isn’t on this computer yet.');
    const m = Access.menuItem(c.agentId, c);
    showMenu(at.x, at.y, [`Files ${H.agent(c.agentId)?.name || 'the AI'} may use · ${C.cap(c.title || p.name, 30)}`, ...(typeof m.items === 'function' ? m.items() : m.items || [])]);
    return m;
  }

  // ---------- Close ----------
  function setArchived(p, on) {
    P.setStatus(p, on ? 'archived' : 'active');
    toast(on ? `“${p.name}” is archived (Projects › ⋯ › Archived projects brings it back)` : `“${p.name}” is back with your projects`, { timeout: 4000, action: { label: 'Undo', fn: () => P.setStatus(p, on ? 'active' : 'archived') } });
    return p.status;
  }
  // asks first, naming what's inside; the project waits in Recently deleted; its chats move to Earlier chats; nothing
  // it holds is deleted (chats, scenes and files stay where they are)
  async function askDelete(p) {
    const n = (t) => ofType(p, t).length;
    const parts = [n('chat') && C.plural(n('chat'), 'chat'), n('scene') && C.plural(n('scene'), 'scene'), n('board') && C.plural(n('board'), 'board'), n('render') && C.plural(n('render'), 'render'), (n('file') + n('download') + n('capture')) && C.plural(n('file') + n('download') + n('capture'), 'file')].filter(Boolean);
    const ok = await Modal.confirm(`Delete “${p.name}”?`,
      `${parts.length ? `It holds ${parts.join(', ')}. ` : 'It is empty. '}The project goes to Recently deleted (Projects › ⋯ › Recently deleted brings it back).${n('chat') ? ' Its chats move to “Earlier chats”;' : ''} its scenes, boards and files stay where they are: nothing is erased.`,
      { ok: 'Delete', danger: true });
    if (!ok) return false;
    return P.removeProject(p);
  }

  // ---------- showing it ----------
  function show(p, { x = 200, y = 120, where = 'menu', kbd = false } = {}) {
    if (!p) return pickProject(x, y);
    at = { x, y };
    const head = `${p.ident.glyph} ${p.name}`;
    showMenu(x, y, [head, ...items(p, { where })]);
    const m = document.getElementById('menu');
    const hd = m && [...m.querySelectorAll(':scope > .menu-head')].find((n) => n.textContent === head);
    if (hd) {
      hd.classList.add('pm-head');
      hd.style.setProperty('--pj', p.ident.color);
      hd.replaceChildren(el('span', { class: 'pm-mark', text: p.ident.glyph }), el('span', { class: 'pm-titles' }, el('b', { class: 'pm-name', text: p.name }), el('span', { class: 'pm-status', text: status(p) })));
      m.classList.add('pm-menu');
      const off = new MutationObserver(() => { if (!hd.isConnected) { m.classList.remove('pm-menu'); off.disconnect(); } });
      off.observe(m, { childList: true });
    }
    if (kbd && typeof menuKb === 'function') menuKb(0); // (opened by a key: on its first row, ↑ ↓ Enter)
    return m;
  }
  // no project in front of you: which one? (its menu then opens)
  function pickProject(x, y) {
    const ps = P.live().slice(0, 14);
    showMenu(x, y, ['No project open', ...ps.map((p) => ({ label: `${p.ident.glyph} ${p.name}`, hint: C.countText(p), action: () => setTimeout(() => show(p, { x, y }), 0) })), '-', { label: '＋ New project…', action: go(() => (has('ProjectsHome') ? ProjectsHome.newProject() : window.ProjChats?.newProject())) }, { label: 'All projects…', action: go(() => P.openHome()) }]);
    return document.getElementById('menu');
  }
  // the project in front of you: the open workspace / Desk / chat / scene (Projects.here), else the chats list's
  const current = () => P.here() || window.ProjChats?.current?.() || null;
  function openHere({ kbd = false } = {}) {
    const bar = document.querySelector('#panel .pc-bar .pc-project');
    const r = bar && bar.getClientRects().length ? bar.getBoundingClientRect() : null;
    const x = r ? r.left : Math.round(innerWidth / 2 - 150);
    const y = r ? r.bottom + 4 : 90;
    return show(current(), { x, y, where: 'key', kbd });
  }

  // ---------- Ctrl/⌘+K: "Project: …" rows for the project in front of you ----------
  // (each row finds its row again when it runs: the palette may keep a row made for an earlier opening)
  const bare = (s) => String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  function leaves(p) { return items(p, { where: 'palette' }).filter((it) => it && typeof it === 'object' && it.id && !it.disabled); }
  function runRow(id) {
    const p = current();
    const it = p && leaves(p).find((x) => x.id === id);
    if (!it) { toast(p ? 'That isn’t there for this project' : 'Open a project first', { timeout: 2500 }); return null; }
    if (it.items) { const r = document.querySelector('#panel .pc-bar .pc-project')?.getBoundingClientRect(); showMenu(r ? r.left : innerWidth / 2 - 150, r ? r.bottom + 4 : 90, [`${p.ident.glyph} ${p.name} · ${bare(it.label)}`, ...(typeof it.items === 'function' ? it.items() : it.items)]); return true; }
    return it.action();
  }
  function paletteRows() {
    if (!P.isLoaded()) return [];
    const p = current();
    if (!p) return [];
    return leaves(p).map((it) => ({ kind: 'Project menu', label: `Project: ${bare(it.label)}${it.items ? ' ›' : ''}`, keys: '', run: () => runRow(it.id) }));
  }
  try { AppUI.addSource?.(paletteRows); } catch { /* the palette is optional */ }
  try { AppUI.addAction('Project menu', () => openHere(), KEY); } catch { /* the palette is optional */ }
  Keys.add({ area: 'Everywhere', keys: KEY, what: 'the project menu (the open project: open, make, look, share, settings, archive, delete)', run: () => openHere({ kbd: true }) });
  // Ctrl/⌘+Shift+O (⌘⇧O on a Mac): the menu, on its first row (↑ ↓ Enter)
  document.addEventListener('keydown', (e) => {
    const mac = /Mac/.test(navigator.platform || '');
    if (e.defaultPrevented || e.altKey || !e.shiftKey || !(mac ? e.metaKey : e.ctrlKey || e.metaKey)) return;
    if (!(e.code === 'KeyO' || String(e.key).toLowerCase() === 'o')) return;
    e.preventDefault(); e.stopPropagation();
    openHere({ kbd: true });
  }, true);

  return { items, show, status, openHere, current, paletteRows, runRow, setFrame, applyLab, lookDialog, askDelete, coverFromLab, mainScene, mainChat, prefs, io, KEY };
})();
window.ProjectMenu = ProjectMenu;
