// Projects (round 23): a home for everything. The owner has many chats, Lab scenes, boards, renders, makes and files on
// two computers; a project groups them (projects-core.js holds the data model, the suggestions and the search ranking):
//   - made three ways: by hand (/project new, Home's ＋, right-click a chat › Project), from a make automatically (a make
//     with rooms becomes a project with its name, mark and color: makes.js), or suggested without tokens ("these 4
//     chats and 3 scenes are about “Stoop Ronin”: make it a project?") from names, links and timing;
//   - things join by themselves once there's a project: a scene linked to a project's chat (chat-scenes.js event), a
//     screenshot or render made while a project's chat / scene is in front of you, a make's new rooms and outputs;
//   - the chats list groups a project's chats (collapsible, above the agents; ⏷ filters to one project; Group by project
//     on / off), and the Lab's sketch picker groups scenes the same way (small hooks in panel.js, makes.js, three.js);
//   - Home (projects-home.js: one rail entry, /home) and Search everything (projects-search.js: Ctrl/⌘+Shift+K) read
//     the sources below, cached (thumbnails are the ones the Lab and chat-scenes already keep: nothing new is stored).
// Data: data/kv/projects.json { v, list: [project], dismissed: [suggestion keys] } (small: names, refs and times; no
// pictures), synced by cloud sync like any kv store: projects and their items are lists with ids, so two computers'
// changes merge item by item. Paths are absolute (sync rewrites the ones inside the data folder for the other computer).
const Projects = (() => {
  const C = ProjectsCore;
  const KEY = 'projects';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const tint = (node, color) => { node.style.setProperty('--pj', color); node.style.setProperty('--mk', color); return node; };
  const loadedLazy = (g) => !window.Lazy || window.Lazy.loaded(g); // (touching a lazy global before its group is in loads it)
  let data = { v: 1, list: [], dismissed: [] };
  let loaded = false;
  const ready = (async () => {
    try { data = C.normalize(await window.hub.kvGet(KEY, null)); } catch { /* first run */ }
    loaded = true;
  })();
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => window.hub.kvSet(KEY, data).catch(() => {}), 300); }
  const listeners = new Set();
  let paintT = 0;
  function changed(p = null, why = 'change') {
    idx = null;
    save();
    const detail = { project: p, id: p?.id || null, why };
    for (const fn of listeners) { try { fn(detail); } catch (err) { console.warn(err); } }
    dispatchEvent(new CustomEvent('hearth:projects', { detail }));
    clearTimeout(paintT); paintT = setTimeout(() => Panel.soon?.() ?? Panel.render(), 50);
  }
  const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // ---------- finding ----------
  const all = () => data.list.slice();
  const get = (id) => data.list.find((p) => p.id === id) || null;
  const live = () => C.recent(C.live(data.list));
  function find(q) {
    const s = String(q || '').trim().toLowerCase().replace(/^["“]|["”]$/g, '');
    if (!s) return null;
    if (/^\d+$/.test(s)) return live()[Number(s) - 1] || null;
    return get(q) || live().find((p) => p.name.toLowerCase() === s) || live().find((p) => p.name.toLowerCase().startsWith(s)) || live().find((p) => p.name.toLowerCase().includes(s)) || data.list.find((p) => p.name.toLowerCase().includes(s)) || null;
  }
  // item id → [projects]: made again after any change (the chats list asks for every row)
  let idx = null;
  function ofItem(type, ref) {
    if (!idx) { idx = new Map(); for (const p of C.live(data.list)) for (const x of p.items) { if (!idx.has(x.id)) idx.set(x.id, []); idx.get(x.id).push(p); } }
    return idx.get(C.itemId(type, ref)) || [];
  }
  const projectOfChat = (chatId) => (chatId ? ofItem('chat', chatId)[0] || null : null);
  const summary = (chatId) => (H.chats || []).find((c) => c.id === chatId) || null;
  const avoid = () => live().slice(0, 7).map((p) => [p.ident.ci, p.ident.gi]);

  // ---------- what's in front of you ----------
  function hereChat() {
    let sid = '';
    try { sid = H.surfaceIdFor?.(H.activeId) || ''; } catch { /* early */ }
    let agentId = H.activeId;
    if (String(sid).startsWith('tool:')) agentId = (typeof Tools !== 'undefined' && Tools.dockedAgent?.(sid.slice(5)))?.id || null;
    return agentId ? H.activeChat?.[agentId] || null : null;
  }
  const labScenes = () => (loadedLazy('lab') && typeof ThreeLab !== 'undefined' ? ThreeLab.scenes || null : null);
  const currentScene = () => { try { return labScenes()?.currentId() || null; } catch { return null; } };
  const currentBoard = () => { try { return loadedLazy('board') && typeof Board !== 'undefined' ? Board.current()?.id || null : null; } catch { return null; } };
  // the project in front of you: Home's open project, the open chat's, the scene on screen's (in the Lab)
  function here() {
    const h = window.ProjectsHome?.openProject?.();
    if (h && get(h)) return get(h);
    let sid = '';
    try { sid = H.surfaceIdFor?.(H.activeId) || ''; } catch { /* early */ }
    if (sid === 'tool:three') { const s = currentScene(); const p = s && ofItem('scene', s)[0]; if (p) return p; }
    if (sid === 'tool:board') { const b = currentBoard(); const p = b && ofItem('board', b)[0]; if (p) return p; }
    return projectOfChat(hereChat());
  }

  // ---------- sources (read when asked, cached briefly; nothing is copied into the projects store) ----------
  const cache = new Map(); // name → { at, value }
  async function cached(name, ms, fn) {
    const c = cache.get(name);
    if (c && Date.now() - c.at < ms) return c.value;
    let value;
    try { value = await fn(); } catch { value = c?.value ?? null; }
    cache.set(name, { at: Date.now(), value });
    return value;
  }
  const forget = (...names) => { for (const n of names) cache.delete(n); };
  const liveBoard = () => (loadedLazy('board') && typeof Board !== 'undefined' && Board.boards?.().length ? Board : null);
  const Src = {
    sketches: () => cached('sketches', 20000, async () => labScenes()?.all?.() || (await window.hub.kvGet('three-sketches', [])) || []),
    // the Lab's own small stills (kv 'three-thumbs', taken a few seconds after a scene runs)
    sceneThumbs: () => cached('sceneThumbs', 120000, async () => (await window.hub.kvGet('three-thumbs', {})) || {}),
    // (the board's own index and the board on screen when the board is loaded: they're ahead of their saves)
    boards: () => cached('boards', 20000, async () => (liveBoard() ? Board.boards() : null) || ((await window.hub.kvGet('boards', null))?.list || [])),
    board: (id, stamp) => (liveBoard()?.current()?.id === id ? Promise.resolve(Board.current()) : cached(`board:${id}:${stamp || 0}`, 600000, async () => (await window.hub.kvGet(`board-${id}`, null)))),
    renders: () => cached('renders', 15000, async () => (loadedLazy('renders') && typeof Renders !== 'undefined' ? Renders.history() : ((await window.hub.kvGet('renders', null))?.history || []))),
    captures: () => cached('captures', 30000, async () => (await window.hub.capture?.list?.({ limit: 400 })) || []),
    downloads: () => cached('downloads', 30000, async () => (await window.hub.kvGet('downloads-log', [])) || []),
    deploys: () => cached('deploys', 30000, async () => (await window.hub.kvGet('deploy-history', [])) || []),
    workspaceDir: () => cached('wsdir', 3600000, async () => { const a = await window.hub.attachmentsDir(); const d = a.replace(/[\\/]attachments[\\/]?$/, ''); return `${d}${d.includes('\\') && !d.includes('/') ? '\\' : '/'}workspace`; }),
    // the chats' workspace: its project folders, and their files two levels down (no dependency folders)
    workspace: () => cached('workspace', 60000, async () => {
      const dir = await Src.workspaceDir();
      const top = (await window.hub.fs.list(dir).catch(() => [])) || [];
      const files = (await window.hub.fs.list(dir, { recursive: true, depth: 2, skipDirs: ['node_modules', '.git', '__pycache__', 'venv', '.venv', '.cache', '.next', 'dist', 'build'] }).catch(() => [])) || [];
      return { dir, folders: top.filter((e) => e.isDir && !e.name.startsWith('.')), files: files.filter((e) => !e.isDir && !/(^|[\\/])\./.test(e.name)).slice(0, 3000) };
    }),
  };
  addEventListener('hearth:synced', (e) => {
    const rels = (e.detail?.files || []).map((f) => f.rel);
    if (rels.includes('kv/projects.json')) reloadFromDisk();
    if (rels.some((r) => /^kv\/(three-sketches|three-thumbs)\.json$/.test(r))) forget('sketches', 'sceneThumbs');
    if (rels.some((r) => /^kv\/boards?/.test(r))) forget('boards');
    if (rels.some((r) => /^workspace\//.test(r))) forget('workspace');
  });
  addEventListener('hearth:sketch', () => forget('sketches'));
  async function reloadFromDisk() {
    try { const d = C.normalize(await window.hub.kvGet(KEY, null)); clearTimeout(saveT); data = d; idx = null; changed(null, 'sync'); } catch (err) { console.warn('projects from sync', err); }
  }

  // names, times and pictures of items (Home's cards, continue, covers)
  const fileUrl = (p) => `file://${String(p).startsWith('/') ? '' : '/'}${String(p).replace(/\\/g, '/').split('/').map((s) => encodeURIComponent(s).replace(/%3A/g, ':')).join('/')}`;
  const IMG = /\.(png|jpe?g|webp|gif)$/i;
  let look = null; // { sketches: Map, thumbs, boards: Map, renders: Map, captures: Map } read by lookFor()
  async function lookFor() {
    const [sk, th, bd, rn, cp] = await Promise.all([Src.sketches(), Src.sceneThumbs(), Src.boards(), Src.renders(), Src.captures()]);
    look = { sketches: new Map((sk || []).map((s) => [s.id, s])), thumbs: th || {}, boards: new Map((bd || []).map((b) => [b.id, b])), renders: new Map((rn || []).map((r) => [r.id, r])), captures: new Map((cp || []).map((c) => [c.path, c])) };
    return look;
  }
  // a scene's picture: the Lab's still of it, else the still of the chat that owns it (chat-scenes.js)
  function sceneThumb(id) {
    if (!id) return null;
    if (look?.thumbs?.[id]?.url) return look.thumbs[id].url;
    try { const o = ChatScenes.ownerOf(id); return (o && ChatScenes.thumbOf(o)) || null; } catch { return null; }
  }
  function timeOf(x) {
    const L = look;
    if (x.type === 'chat') return summary(x.ref)?.updatedAt || 0;
    if (x.type === 'scene' || x.type === 'seq') return L?.sketches.get(x.ref)?.updatedAt || 0;
    if (x.type === 'board') return L?.boards.get(x.ref)?.updated || 0;
    if (x.type === 'render') { const r = L?.renders.get(x.ref); return r?.ended || 0; }
    if (x.type === 'capture') return L?.captures.get(x.ref)?.mtime || 0;
    return 0;
  }
  function thumbOf(x) {
    if (x.type === 'scene' || x.type === 'seq') return sceneThumb(x.ref);
    if (x.type === 'chat') { try { const s = ChatScenes.linkOf?.(x.ref); return ChatScenes.thumbOf(x.ref) || (s && look?.thumbs?.[s]?.url) || null; } catch { return null; } }
    if (x.type === 'board') return look?.boards.get(x.ref)?.cover || null;
    if (x.type === 'render') { const r = look?.renders.get(x.ref); const out = r?.output || (String(x.ref).match(/[\\/]/) ? x.ref : ''); return IMG.test(out) ? fileUrl(out) : null; }
    if (x.type === 'capture' || x.type === 'download' || x.type === 'file') return IMG.test(x.ref) ? fileUrl(x.ref) : null;
    return null;
  }
  const coverOf = (p) => C.cover(p, { thumb: thumbOf, time: timeOf });
  const lastOf = (p, types) => C.latest(p, types, timeOf);
  function nameOf(x) {
    if (x.type === 'chat') return summary(x.ref)?.title || x.name || 'Chat';
    if (x.type === 'scene' || x.type === 'seq') return look?.sketches.get(x.ref)?.name || x.name || 'Scene';
    if (x.type === 'board') return look?.boards.get(x.ref)?.name || x.name || 'Board';
    return x.name || base(x.ref) || x.ref;
  }
  // is the thing still here? (a chat in the trash, a scene deleted, a file not arrived yet: the item stays, faded)
  function gone(x) {
    if (x.type === 'chat') return !summary(x.ref);
    if ((x.type === 'scene' || x.type === 'seq') && look) return !look.sketches.has(x.ref);
    if (x.type === 'board' && look) return !look.boards.has(x.ref);
    return false;
  }

  // ---------- making and changing projects ----------
  function create(o = {}) {
    const p = C.create({ ...o, avoid: o.ident ? undefined : avoid() });
    data.list.unshift(p);
    changed(p, 'create');
    return p;
  }
  // the things that come with a chat: its scene (chat-scenes.js) and the board linked to it
  function withLinks(type, ref, name) {
    const out = [{ type, ref, name }];
    if (type === 'chat') {
      try { const s = ChatScenes.linkOf?.(ref); if (s) out.push({ type: 'scene', ref: s, name: look?.sketches.get(s)?.name || '' }); } catch { /* none */ }
    }
    return out;
  }
  function add(p, type, ref, name = '', { links = true } = {}) {
    if (!p) return 0;
    let n = 0;
    for (const it of links ? withLinks(type, ref, name) : [{ type, ref, name }]) if (C.addItem(p, it)) n += 1;
    if (n) changed(p, 'add');
    return n;
  }
  function remove(p, type, ref) { if (p && C.removeItem(p, type, ref)) { changed(p, 'remove'); return true; } return false; }
  function rename(p, name) { if (!C.rename(p, name)) return false; changed(p, 'rename'); return true; }
  function setStatus(p, st) { if (!C.setStatus(p, st)) return false; changed(p, 'status'); return true; }
  function setNotes(p, text) { if (!C.setNotes(p, text)) return false; changed(p, 'notes'); return true; }
  function setCover(p, id) { if (!C.setCover(p, id)) return false; changed(p, 'cover'); return true; }
  function nextColor(p) { C.setIdent(p, { ci: p.ident.ci + 1 }); changed(p, 'ident'); }
  function nextMark(p) { C.setIdent(p, { gi: p.ident.gi + 1 }); changed(p, 'ident'); }
  function touch(p) { if (!p) return; p.opened = Date.now(); save(); }
  // deleting a project forgets the grouping only: chats, scenes and files stay where they are (Undo in the toast)
  function removeProject(p, { quiet = false } = {}) {
    const i = data.list.indexOf(p);
    if (i < 0) return false;
    data.list.splice(i, 1);
    if (p.make && !data.dismissed.includes(`make:${p.make}`)) data.dismissed.push(`make:${p.make}`); // not made again from its make
    changed(null, 'delete');
    if (!quiet) toast(`Project “${p.name}” deleted (its chats, scenes and files stay)`, { timeout: 8000, action: { label: 'Undo', fn: () => { data.list.splice(Math.min(i, data.list.length), 0, p); data.dismissed = data.dismissed.filter((k) => k !== `make:${p.make}`); changed(p, 'restore'); } } });
    return true;
  }

  // ---------- from makes (automatically) ----------
  // a make with rooms is a project: the same name, mark and color, its rooms, their scenes, its board and its outputs
  function fromMake(m) {
    if (!m || m.dismissed || typeof Makes === 'undefined') return null;
    const rooms = (m.parts || []).filter((x) => x.own && (x.chatId || x.boardId));
    if (!rooms.length) return null;
    let p = data.list.find((x) => x.make === m.id);
    if (!p) {
      if (data.dismissed.includes(`make:${m.id}`)) return null;
      p = C.create({ id: `pj-${m.id}`, name: m.name, ident: m.ident, from: 'make', make: m.id, notes: m.idea || '', at: m.at || Date.now() });
      p.mkName = m.name;
      data.list.unshift(p);
    }
    let n = 0;
    // its name follows the make's while the owner hasn't renamed the project
    if (p.mkName !== m.name) { if (p.name === p.mkName) p.name = C.cap(m.name, 48); p.mkName = m.name; n += 1; }
    for (const part of rooms) {
      if (part.chatId && summary(part.chatId)) for (const it of withLinks('chat', part.chatId, summary(part.chatId).title)) if (C.addItem(p, it)) n += 1;
      if (part.boardId && C.addItem(p, { type: 'board', ref: part.boardId, name: '' })) n += 1;
    }
    for (const o of m.outputs || []) if (C.addItem(p, { type: o.kind === 'still' ? 'capture' : 'render', ref: o.path, name: base(o.path), at: o.at })) n += 1;
    return n || p.items.length ? p : null;
  }
  function syncMakes(list) {
    if (typeof Makes === 'undefined') return;
    let any = false;
    for (const m of list) { const before = JSON.stringify(data.list.find((x) => x.make === m.id) || null); const p = fromMake(m); if (p && JSON.stringify(p) !== before) any = true; }
    if (any) changed(null, 'make');
  }
  // a project made from a make shows the make's rooms in its own group (makes.js leaves its group out)
  const hidesMake = (makeId) => Boolean(grouping() && data.list.some((p) => p.make === makeId && p.status !== 'archived'));

  // ---------- joining by themselves ----------
  // a scene linked to a project's chat (a director chat's scene) joins the project
  function sceneLinked(chatId, sketchId) {
    if (!loaded || !chatId || !sketchId) return;
    let n = 0;
    for (const p of ofItem('chat', chatId)) if (C.addItem(p, { type: 'scene', ref: sketchId, name: '' })) n += 1;
    if (n) changed(null, 'scene');
  }
  // a screenshot / recording / render made while a project is in front of you joins it
  function madeHere(type, path, p = here()) {
    if (!loaded || !path || !p) return;
    if (C.addItem(p, { type, ref: path, name: base(path) })) { changed(p, 'output'); forget('captures', 'renders'); }
  }
  const renderHere = new Map(); // render job id → the project in front of you when it started
  function onRenderJob(j) {
    if (!j?.id) return;
    if (!renderHere.has(j.id)) renderHere.set(j.id, here()?.id || null);
    if (!['done', 'finished', 'ok'].includes(j.status) || !j.output) return;
    const p = get(renderHere.get(j.id));
    renderHere.delete(j.id);
    if (p && C.addItem(p, { type: 'render', ref: j.id, name: j.title || base(j.output) })) { forget('renders'); changed(p, 'render'); }
  }

  // ---------- suggestions ----------
  async function things() {
    const L = await lookFor();
    const out = [];
    const links = new Map(); // item id → [linked item ids]
    const link = (a, b) => { if (!links.has(a)) links.set(a, []); links.get(a).push(b); if (!links.has(b)) links.set(b, []); links.get(b).push(a); };
    for (const c of H.chats || []) out.push({ type: 'chat', ref: c.id, name: c.title || '', at: c.updatedAt || 0 });
    for (const s of L.sketches.values()) out.push({ type: 'scene', ref: s.id, name: s.name || '', at: s.updatedAt || 0 });
    for (const b of L.boards.values()) { out.push({ type: 'board', ref: b.id, name: b.name || '', at: b.updated || 0 }); for (const c of b.chats || []) link(C.itemId('board', b.id), C.itemId('chat', c)); }
    for (const r of L.renders.values()) if (r.output && r.status !== 'failed' && !r.trashed) out.push({ type: 'render', ref: r.id, name: r.title || base(r.output), at: r.ended || 0 });
    for (const c of [...L.captures.values()].slice(0, 200)) out.push({ type: 'capture', ref: c.path, name: c.name, at: c.mtime || 0 });
    try { const ws = await Src.workspace(); for (const f of ws.folders) out.push({ type: 'file', ref: f.path, name: f.name, at: Math.max(0, ...ws.files.filter((x) => x.path.startsWith(f.path)).map((x) => x.mtime || 0)) }); } catch { /* no workspace */ }
    try { for (const [chatId, l] of Object.entries(ChatScenes.data?.().links || {})) if (l?.sketch) link(C.itemId('chat', chatId), C.itemId('scene', l.sketch)); } catch { /* no scenes */ }
    for (const t of out) t.links = links.get(C.itemId(t.type, t.ref)) || [];
    return out;
  }
  async function suggestions(max = 4) {
    await ready;
    const taken = new Set(data.list.flatMap((p) => p.items.map((x) => x.id)));
    return C.suggest(await things(), { taken, dismissed: new Set(data.dismissed), max });
  }
  function acceptSuggestion(s, { open = false } = {}) {
    const p = create({ name: s.name, from: 'suggest', items: s.things.map((t) => ({ type: t.type, ref: t.ref, name: t.name, at: t.at })) });
    toast(`Project “${p.name}”: ${C.countText(p)}`, { timeout: 5000, action: { label: 'Open', fn: () => openHome(p.id) } });
    if (open) openHome(p.id);
    return p;
  }
  function dismissSuggestion(s) { if (!data.dismissed.includes(s.key)) { data.dismissed.push(s.key); data.dismissed = data.dismissed.slice(-200); changed(null, 'dismiss'); } }

  // ---------- opening things ----------
  async function openChat(chatId) {
    const c = summary(chatId);
    if (!c) { toast('That chat is gone (Ctrl+K → Recently deleted chats)', { type: 'error' }); return false; }
    Native.open(c.agentId, c.id);
    const a = H.agent(c.agentId);
    if (a?.dock) Tools.openDock?.(a.dock);
    else activate(c.agentId);
    return true;
  }
  async function openScene(id, { seq = false } = {}) {
    const owner = (() => { try { return ChatScenes.ownerOf(id); } catch { return null; } })();
    if (owner && summary(owner) && !seq) return openChat(owner);
    if (window.Lazy) await window.Lazy.load('lab');
    await ThreeLab.cmd({ show: true });
    if (!ThreeLab.scenes?.open(id)) { toast('That scene is gone (or hasn\'t arrived from your other computer yet)', { type: 'error' }); return false; }
    if (seq && typeof ThreeSeq !== 'undefined') setTimeout(() => ThreeSeq.enter().catch((err) => toast(err.message, { type: 'error' })), 300);
    return true;
  }
  async function openBoard(id) {
    activate('tool:board');
    if (window.Lazy) await window.Lazy.load('board');
    for (let i = 0; i < 40 && !Board.isMounted?.(); i += 1) await sleep(100);
    return Boolean(await Board.open(id));
  }
  async function openPath(p) {
    let path = p;
    try { const r = await window.hub.reach?.resolve?.(p); if (r?.path) path = r.path; } catch { /* as is */ }
    return MediaFile.open(path);
  }
  async function pathOf(x) {
    if (x.type === 'render') { const r = (await Src.renders())?.find((j) => j.id === x.ref); return r?.output || (/[\\/]/.test(x.ref) ? x.ref : null); }
    return ['capture', 'file', 'download'].includes(x.type) ? x.ref : null;
  }
  async function openItem(x) {
    try {
      if (x.type === 'chat') return await openChat(x.ref);
      if (x.type === 'scene' || x.type === 'seq') return await openScene(x.ref, { seq: x.type === 'seq' });
      if (x.type === 'board') return await openBoard(x.ref);
      if (x.type === 'deploy') { const d = (await Src.deploys())?.find((e) => e.id === x.ref || e.url === x.ref); const u = d?.url || (/^https?:/.test(x.ref) ? x.ref : null); if (u) window.hub.openExternal(u); return Boolean(u); }
      const p = await pathOf(x);
      if (!p) { toast('Nothing to open (the file is gone)', { type: 'error' }); return false; }
      return await openPath(p);
    } catch (err) { toast(String(err.message || err), { type: 'error' }); return false; }
  }
  // the right-click menu of an item (Home, Search)
  function itemMenu(p, x) {
    return [
      { label: 'Open', action: () => openItem(x) },
      ...(['render', 'capture', 'file', 'download'].includes(x.type) ? [{ label: MediaFile.revealLabel, action: async () => MediaFile.reveal(await pathOf(x)) }, { label: MediaFile.copyLabel, action: async () => copyText(await pathOf(x), 'Path copied') }] : []),
      p ? { label: p.cover === x.id ? '✓ The cover' : 'Use as the cover', action: () => setCover(p, p.cover === x.id ? null : x.id) } : null,
      projectMenu(x.type, x.ref, x.name),
      // (round 52, gamemode) a Lab scene or an HTML game build: ▶ Play it full screen in its own window
      x.type === 'scene' || (['file', 'download'].includes(x.type) && /\.html?$/i.test(String(x.ref))) ? { label: '▶ Play', hint: 'as a game, full screen', action: () => (window.Lazy ? window.Lazy.load('gamemode') : Promise.resolve()).then(() => GameMode.play(x.type === 'scene' ? { kind: 'lab', id: x.ref, title: x.name } : { kind: 'html', path: x.ref })).catch((err) => toast(calmError(err), { type: 'error', raw: err })) } : null,
      p ? '-' : null,
      p ? { label: `Take out of “${p.name}”`, danger: true, action: () => remove(p, x.type, x.ref) } : null,
    ].filter(Boolean);
  }
  // "Project ›": add this thing to a project (or a new one), take it out
  function projectMenu(type, ref, name = '') {
    return { label: 'Project', items: () => {
      const inP = ofItem(type, ref);
      return [
        ...live().slice(0, 12).map((p) => ({ label: `${p.ident.glyph} ${p.name}`, checked: inP.includes(p), action: () => (inP.includes(p) ? remove(p, type, ref) : add(p, type, ref, name)) })),
        { label: '＋ New project…', action: async () => { const nm = await Modal.prompt('New project', { placeholder: 'Stoop Ronin', label: `With ${C.TYPES[type]?.label.toLowerCase() || 'this'} “${C.cap(name || base(ref), 40)}” in it` }); if (nm == null) return; const p = create({ name: nm.trim() }); add(p, type, ref, name); toast(`Project “${p.name}”`, { timeout: 4000, action: { label: 'Open', fn: () => openHome(p.id) } }); } },
      ];
    } };
  }
  async function openHome(id = null) {
    if (window.Lazy && !window.Lazy.loaded('projects')) await window.Lazy.load('projects');
    activate('tool:home');
    for (let i = 0; i < 40 && !window.ProjectsHome?.mounted?.(); i += 1) await sleep(50);
    window.ProjectsHome?.show?.(id);
  }
  // continue where you left off: the latest chat, else the latest scene, else the latest render / still
  async function continueIn(p) {
    await lookFor();
    touch(p);
    const x = lastOf(p, 'chat') || lastOf(p, ['scene', 'seq']) || lastOf(p, ['render', 'capture']) || lastOf(p, ['board', 'file', 'download', 'deploy']);
    if (!x) { openHome(p.id); return null; }
    await openItem(x);
    return x;
  }

  // ---------- the chats list: a project's chats in its own group ----------
  const grouping = () => store.get('projects.group', true) !== false;
  function setGrouping(on) { store.set('projects.group', Boolean(on)); Panel.render(); }
  const MAX_GROUPS = 8;
  const PER_GROUP = 12;
  // a make's room shows under its make, unless the make's project shows it
  function roomElsewhere(chatId) {
    try { const r = typeof Makes !== 'undefined' && Makes.roomOf(chatId); return Boolean(r && r.part.own && !r.make.dismissed && !hidesMake(r.make.id)); } catch { return false; }
  }
  const chatsOf = (p) => p.items.filter((x) => x.type === 'chat').map((x) => summary(x.ref)).filter((c) => c && !roomElsewhere(c.id) && !(typeof ChatUX !== 'undefined' && ChatUX.metaOf(c.id).archived));
  const panelSkip = (c) => Boolean(loaded && projectOfChat(c.id) && grouping() && !roomElsewhere(c.id) && chatsOf(projectOfChat(c.id)).length); // (round 42) the index first: grouping() reads localStorage, once per chat of a big list
  function panelTop(root, { row, itemOf, q, collapsed, toggleGroup }) {
    if (!loaded || !grouping()) return;
    const list = live().filter((p) => p.status !== 'archived' && chatsOf(p).length);
    let shown = 0;
    for (const p of list) {
      if (shown >= MAX_GROUPS && !q) break;
      let chats = chatsOf(p).filter((c) => projectOfChat(c.id) === p).sort((a, b) => (b.pinned - a.pinned) || b.updatedAt - a.updatedAt);
      if (q && !p.name.toLowerCase().includes(q)) chats = chats.filter((c) => c.title.toLowerCase().includes(q));
      if (!chats.length) continue;
      shown += 1;
      const key = `proj:${p.id}`;
      const closed = collapsed.has(key) && !q;
      const mk = p.make && typeof Makes !== 'undefined' ? Makes.get(p.make) : null;
      const st = mk ? Makes.core.statusOf(mk) : null;
      const pct = mk ? Makes.core.pctOf(mk) : 0;
      const kind = mk ? (st === 'planned' ? 'planned' : st === 'done' ? '✓' : st === 'stuck' ? 'stuck' : pct ? `${pct} %` : Makes.core.STATUS_LABEL[st]) : p.status === 'active' ? String(chats.length) : C.STATUS[p.status].toLowerCase();
      const group = el('div', { class: `group pj-group${mk ? ` mk-group mk-${st}` : ''}`, dataset: { id: key, project: p.id, ...(mk ? { make: mk.id } : {}) } });
      tint(group, p.ident.color); group.style.setProperty('--agent', p.ident.color);
      const toggle = el('button', { class: 'group-toggle', type: 'button', title: `${p.name} · project · ${C.countText(p)}${p.notes ? `\n${C.cap(p.notes, 160)}` : ''}\nRight-click: open its Home page, continue, filter, rename…`, on: { click: () => toggleGroup(key) } },
        el('span', { class: 'caret', text: closed ? '▸' : '▾' }), el('span', { class: 'mk-mark pj-mark', text: p.ident.glyph }), el('span', { class: 'group-name', text: p.name }),
        el('span', { class: `group-kind pj-st${mk ? ' mk-st' : ''}`, text: kind }));
      const more = el('button', { class: 'group-add pj-more', type: 'button', text: '⋯', title: 'This project: its page, continue, show only its chats, rename…', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); showMenu(b.left, b.bottom + 2, menu(p)); } } });
      const head = el('div', { class: 'group-head' }, toggle, more);
      head.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, menu(p)); });
      group.append(head);
      if (!closed) {
        for (const c of chats.slice(0, PER_GROUP)) {
          const agent = H.agent(c.agentId);
          if (!agent) continue;
          const r = row(agent, itemOf(c));
          r.dataset.agent = agent.id;
          r.classList.add('pj-row');
          // under its project's name the row says the rest of its title ("Lab", "Neon test")
          const t = r.querySelector('.item-title');
          if (t && t.textContent.startsWith(`${p.name} · `)) t.textContent = t.textContent.slice(p.name.length + 3);
          if (!r.querySelector('.chat-ident')) r.prepend(el('span', { class: 'chat-ident pj-ident', text: agent.dock ? '◭' : agent.engine === 'codex' ? 'A' : '✳', title: agent.name }));
          if (mk) { const part = mk.parts.find((x) => x.chatId === c.id); if (part) { r.classList.add('mk-room'); r.dataset.makePart = part.id; } }
          group.append(r);
        }
        if (chats.length > PER_GROUP) group.append(el('button', { class: 'show-more pj-all', type: 'button', text: `${chats.length - PER_GROUP} more in ${p.name} ›`, on: { click: () => Panel.setView(`project:${p.id}`) } }));
      }
      root.append(group);
    }
    if (!q && list.length > shown) root.append(el('button', { class: 'show-more pj-more-projects', type: 'button', text: `${list.length - shown} more projects ›`, on: { click: () => openHome() } }));
  }
  // ⏷ → "▣ <project>": only its chats (under their agents)
  function panelView(c, v) {
    if (!v.startsWith('project:')) return undefined;
    const p = get(v.slice(8));
    return Boolean(p && C.has(p, 'chat', c.id));
  }
  panelView.label = (v) => (v.startsWith('project:') ? `${get(v.slice(8))?.ident.glyph || '▣'} ${get(v.slice(8))?.name || 'a project'}` : null);
  function panelMenu(view, setView) {
    const ps = live().filter((p) => p.items.some((x) => x.type === 'chat')).slice(0, 10);
    return [
      '-',
      { label: `${grouping() ? '✓ ' : ''}Group by project`, action: () => setGrouping(!grouping()) },
      ...(ps.length ? [{ label: 'Only one project', items: () => ps.map((p) => ({ label: `${view === `project:${p.id}` ? '✓ ' : ''}${p.ident.glyph} ${p.name}`, action: () => setView(`project:${p.id}`) })) }] : []),
    ];
  }

  // ---------- the Lab's sketch picker (tools/three.js asks; small hooks) ----------
  // [{ label, ids }]: each project's scenes under its name, the others after; null while no project holds a scene
  function sketchGroups(ids) {
    if (!loaded) return null;
    const rest = new Set(ids);
    const out = [];
    for (const p of live()) {
      const mine = ids.filter((id) => rest.has(id) && C.has(p, 'scene', id));
      if (!mine.length) continue;
      for (const id of mine) rest.delete(id);
      out.push({ label: `${p.ident.glyph} ${p.name}`, ids: mine });
    }
    if (!out.length) return null;
    if (rest.size) out.push({ label: 'Other sketches', ids: ids.filter((id) => rest.has(id)) });
    return out;
  }
  // Your sketches (▦): a project filter beside the sort, a small mark on cards, "Project ›" on a card's menu
  function sketchBrowse({ after, refill }) {
    const ps = live().filter((p) => p.items.some((x) => x.type === 'scene'));
    let pick = store.get('projects.sketchFilter', '');
    if (pick && !get(pick)) pick = '';
    if (ps.length && after) {
      const sel = el('select', { class: 'sb-sort pj-sb-filter', title: 'Show one project\'s scenes' }, el('option', { value: '', text: 'All projects' }), ...ps.map((p) => el('option', { value: p.id, text: `${p.ident.glyph} ${p.name}`, selected: p.id === pick })));
      sel.addEventListener('change', () => { pick = sel.value; store.set('projects.sketchFilter', pick); refill(); });
      after.after(sel);
    }
    return {
      keep: (id) => !pick || C.has(get(pick), 'scene', id),
      tag: (id) => { const p = ofItem('scene', id)[0]; return p ? tint(el('span', { class: 'pj-sb-tag', text: p.ident.glyph, title: `In the project “${p.name}”` }), p.ident.color) : null; },
    };
  }
  const sketchMenu = (id, name) => [projectMenu('scene', id, name)];

  // ---------- a project's menu (chats list, Home, Search) ----------
  // the sources the Add › submenus list, fetched when a menu opens (they're drawn at once)
  function warm() { for (const k of ['sketches', 'boards', 'renders', 'captures', 'workspace', 'downloads', 'deploys']) Src[k]().catch?.(() => {}); }
  function menu(p) {
    warm();
    const mk = p.make && typeof Makes !== 'undefined' ? Makes.get(p.make) : null;
    return [
      { label: '⌂ Open its page', action: () => openHome(p.id) },
      { label: '↻ Continue where you left off', action: () => continueIn(p) },
      { label: 'Show only its chats', action: () => Panel.setView(`project:${p.id}`) },
      { label: 'Add', items: () => addMenu(p) },
      mk ? { label: `Its make (${mk.name})`, items: () => Makes.makeMenu(mk) } : null,
      { label: 'Rename…', action: () => renamePrompt(p) },
      { label: 'Status', items: () => Object.entries(C.STATUS).map(([k, l]) => ({ label: l, checked: p.status === k, action: () => setStatus(p, k) })) },
      { label: 'Look', items: () => [{ label: 'Next color', action: () => nextColor(p) }, { label: 'Next mark', action: () => nextMark(p) }] },
      { label: 'Notes…', action: () => notesPrompt(p) },
      '-',
      { label: 'Delete the project…', danger: true, action: () => removeProject(p) },
    ].filter(Boolean);
  }
  // Add ›: what's in front of you, recent things of each kind
  function addMenu(p) {
    const chatId = hereChat();
    const sc = currentScene();
    const bd = currentBoard();
    const out = [];
    if (chatId && summary(chatId) && !C.has(p, 'chat', chatId)) out.push({ label: `This chat: ${C.cap(summary(chatId).title, 40)}`, action: () => add(p, 'chat', chatId, summary(chatId).title) });
    if (sc && !C.has(p, 'scene', sc)) out.push({ label: 'The scene on screen', action: () => add(p, 'scene', sc, labScenes()?.get(sc)?.name || '') });
    if (bd && !C.has(p, 'board', bd)) out.push({ label: 'The board on screen', action: () => add(p, 'board', bd, '') });
    // (submenus are drawn at once: they read what warm() fetched when the menu opened)
    const recentOf = (label, fn) => ({ label, items: () => { let xs = []; try { xs = fn().filter((x) => !C.has(p, x.type, x.ref)).slice(0, 12); } catch { /* not read yet */ } return xs.length ? xs.map((x) => ({ label: C.cap(x.name || base(x.ref), 48), hint: x.at ? timeAgo(x.at) : '', action: () => add(p, x.type, x.ref, x.name) })) : [{ label: 'Nothing new', disabled: true }]; } });
    const now = (name) => cache.get(name)?.value || [];
    out.push(
      recentOf('A chat', () => (H.chats || []).slice(0, 30).map((c) => ({ type: 'chat', ref: c.id, name: c.title, at: c.updatedAt }))),
      recentOf('A scene', () => now('sketches').slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30).map((s) => ({ type: 'scene', ref: s.id, name: s.name, at: s.updatedAt }))),
      recentOf('A board', () => now('boards').map((b) => ({ type: 'board', ref: b.id, name: b.name, at: b.updated }))),
      recentOf('A render', () => now('renders').filter((r) => r.output && r.status !== 'failed').slice(0, 30).map((r) => ({ type: 'render', ref: r.id, name: r.title || base(r.output), at: r.ended }))),
      recentOf('A capture', () => now('captures').slice(0, 30).map((c) => ({ type: 'capture', ref: c.path, name: c.name, at: c.mtime }))),
      recentOf('A workspace folder', () => (cache.get('workspace')?.value?.folders || []).map((f) => ({ type: 'file', ref: f.path, name: f.name }))),
      recentOf('A download', () => now('downloads').filter((d) => d.path && d.state === 'completed').slice(0, 30).map((d) => ({ type: 'download', ref: d.path, name: d.name, at: d.at }))),
      recentOf('A deploy', () => now('deploys').filter((d) => d.url).slice(0, 20).map((d) => ({ type: 'deploy', ref: d.id || d.url, name: `${d.name || d.slug || 'site'} · ${d.url}`, at: d.at }))),
      // (round 49) files and folders in one dialog only exist on the Mac: on Windows that pair shows a folder picker only
      { label: 'A file…', action: async () => { const f = await window.hub.openDialog({ properties: /Mac/.test(navigator.platform) ? ['openFile', 'openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'], title: `Add to “${p.name}”` }); for (const x of f || []) add(p, 'file', x, base(x)); } },
    );
    return out;
  }
  async function renamePrompt(p) { const n = await Modal.prompt('Rename the project', { value: p.name }); if (n?.trim()) rename(p, n.trim()); }
  async function notesPrompt(p) { const n = await Modal.prompt(`Notes · ${p.name}`, { value: p.notes, label: 'Anything to remember about it (synced with your other computer)', multiline: true }); if (n != null) setNotes(p, n); }

  return {
    ready: () => ready, isLoaded: () => loaded, all, live, get, find, ofItem, projectOfChat, here, hereChat, currentScene, currentBoard,
    create, add, remove, rename, setStatus, setNotes, setCover, nextColor, nextMark, touch, removeProject, fromMake, syncMakes, hidesMake,
    sceneLinked, madeHere, onRenderJob, suggestions, acceptSuggestion, dismissSuggestion, things,
    openItem, openChat, openScene, openBoard, openHome, continueIn, itemMenu, projectMenu, menu, addMenu, renamePrompt, notesPrompt,
    grouping, setGrouping, panelSkip, panelTop, panelView, panelMenu, sketchGroups, sketchBrowse, sketchMenu,
    Src, warm, lookFor, coverOf, thumbOf, timeOf, nameOf, lastOf, gone, fileUrl, forget, onChange, changed, core: C,
    _data: () => data,
  };
})();
window.Projects = Projects;
