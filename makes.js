// Makes (round 11): one identity for everything Hearth creates. The owner: "when we create something or it's in the
// middle of being created, give it a chatroom or a category whenever needed, name it and allow me to navigate it ahead
// of time even if nothing has been made in it yet (if we're about to make a three.js animation that then cuts into a
// video, make the video chat and the three.js chat with the same name and logo ahead of time), and keep consistency
// across all things that get created through Commands."
// - A make (makes-core.js holds the data model and every naming / identity rule) has a name, a color and a mark, a
//   category, who made it (the command or run), its parts and their rooms, its outputs, a status and a progress.
// - Rooms ahead of time: /makes plan <words> (the Commands page, three_do make for the directors) makes every room at
//   once — a Three Director chat "<Name> · Lab" with its own scene in the make's color, a Video Director chat
//   "<Name> · Video", a frame on the board… — grouped under the make in the chats list, each readable before anything
//   is in it ("planned · waiting for Lab"). Empty rooms are real chats; a make is dismissed as a whole (to the trash,
//   Undo / restore brings every room back).
// - Every creation joins it: /dispatch comps (comp-dispatch.js), /intro video projects (Intro.onChange), jams
//   (jam.js), runs on the Commands page / Flows that make something, renders and recordings (their file names carry
//   the make's name when made in its room), and every creator command of the registry (MakesCore.CREATORS, onBefore).
// - One place: "Makes" on the Commands page (rooms, parts, outputs, status; right-click submenus; open any room;
//   rename the whole make: every room follows).
// - Chats: a room's agent gets one short line about its make only on its first message or when your words point at the
//   other rooms (token frugality); "Hand off to <next room>" carries the make along.
// - For the progress bars (another stream): Makes.progress(makeId, partId?, { pct, label, eta }) stores it and tells
//   Makes.onChange listeners (and the window event 'hearth:makes').
// Data: data/kv/makes.json { list: [make] } (synced like other kv files).
const Makes = (() => {
  const C = MakesCore;
  const KEY = 'makes';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cap = C.cap;
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  // the make's color on a node (custom properties need setProperty: el()'s style object can't set them)
  const tint = (node, color) => { node.style.setProperty('--mk', color); return node; };
  let data = { list: [] };
  let loaded = false;
  const ready = (async () => {
    try { const d = await window.hub.kvGet(KEY, null); if (d && Array.isArray(d.list)) data = { list: d.list }; } catch { /* first run */ }
    loaded = true; idx = null;
  })();
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => window.hub.kvSet(KEY, { list: data.list.slice(0, 200) }).catch(() => {}), 300); }
  const listeners = new Set();
  let panelT = 0;
  function changed(make, why = 'change', extra = {}) {
    idx = null;
    if (make) make.updated = Date.now();
    save();
    const detail = { make, id: make?.id || null, why, ...extra };
    for (const fn of listeners) { try { fn(detail); } catch (err) { console.warn(err); } }
    dispatchEvent(new CustomEvent('hearth:makes', { detail }));
    if (why !== 'progress') { clearTimeout(panelT); panelT = setTimeout(() => { Panel.render(); paintPage(); }, 60); } else paintProgress(make);
  }
  const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // ---------- finding ----------
  const get = (id) => data.list.find((m) => m.id === id) || null;
  const live = () => data.list.filter((m) => !m.dismissed);
  function find(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return null;
    if (/^\d+$/.test(s)) return live()[Number(s) - 1] || null;
    return get(q) || live().find((m) => m.name.toLowerCase() === s) || live().find((m) => m.name.toLowerCase().includes(s)) || data.list.find((m) => m.name.toLowerCase().includes(s)) || null;
  }
  // chat id → { make, part }: an index made again after any change (the chats list asks for every row)
  let idx = null;
  function roomOf(chatId) {
    if (!chatId) return null;
    if (!idx) { idx = new Map(); for (const make of data.list) for (const part of make.parts) if (part.chatId && !idx.has(part.chatId)) idx.set(part.chatId, { make, part }); }
    return idx.get(chatId) || null;
  }
  const ofSrc = (kind, id) => data.list.find((m) => m.src?.kind === kind && m.src.id === id) || null;
  const summary = (chatId) => (H.chats || []).find((c) => c.id === chatId) || null;
  // the color and mark a chat shows (chat-scenes.js asks): its make's, for the rooms the make made
  function identFor(chatId) {
    const r = roomOf(chatId);
    if (!r || !r.part.own) return null;
    const { color, colorName, glyph } = r.make.ident;
    return { color, colorName, glyph };
  }
  // the room in front of you: the open chat (or the docked director's), else the owner of the Lab scene on screen
  function hereChat() {
    let sid = '';
    try { sid = H.surfaceIdFor?.(H.activeId) || ''; } catch { /* early */ }
    let agentId = H.activeId;
    if (String(sid).startsWith('tool:')) agentId = (typeof Tools !== 'undefined' && Tools.dockedAgent?.(sid.slice(5)))?.id || null;
    const c = agentId ? H.activeChat?.[agentId] : null;
    if (c && roomOf(c)) return c;
    if (sid === 'tool:three' && typeof ChatScenes !== 'undefined' && typeof ThreeLab !== 'undefined') { try { const o = ChatScenes.ownerOf(ThreeLab.scenes?.currentId()); if (o && roomOf(o)) return o; } catch { /* the Lab isn't up */ } }
    return c || null;
  }
  const here = () => { const r = roomOf(hereChat()); return r && !r.make.dismissed ? r : null; };
  // file names of what is made in a room: "Neon Tunnel · Lab" (capture.js asks)
  const fileHere = () => { const r = here(); return r ? C.fileBase(r.make, r.part) : null; };
  // "<Name> · Jam" for something made in a room (jam.js names its sketch with it)
  const nameIn = (chatId, what) => { const r = roomOf(chatId); return r && !r.make.dismissed ? `${r.make.name} · ${what}` : null; };
  const avoid = () => live().slice(0, 7).map((m) => [m.ident.ci, m.ident.gi]);

  // ---------- agents for the rooms ----------
  const natives = () => H.agents().filter((a) => a.mode === 'native' && a.enabled !== false);
  function agentFor(kind) {
    if (kind === 'lab') return natives().find((a) => a.dock === 'three' && a.threeTools) || natives().find((a) => a.dock === 'three') || null;
    if (kind === 'video') return natives().find((a) => a.dock === 'ae' && a.videoTools) || natives().find((a) => a.dock === 'ae') || null;
    if (kind === 'astra') return natives().find((a) => a.engine === 'codex' && !a.dock) || null;
    if (kind === 'chat') return H.claudeAgent?.() || natives().find((a) => a.engine === 'claude' && !a.dock) || null;
    return null;
  }
  // the directors a plan needs are set up without asking (the same agents /director-setup makes)
  async function ensureAgent(kind) {
    let a = agentFor(kind);
    if (a) return a;
    const mk = { lab: { id: 'threedirector', name: 'Three Director', icon: '◆', color: '#7c5cff', dock: 'three', threeTools: true }, video: { id: 'videodirector', name: 'Video Director', icon: '🎬', color: '#bd8bff', dock: 'ae', videoTools: true } }[kind];
    if (!mk) throw new Error(kind === 'astra' ? 'No Astra agent here (Settings → Agents).' : 'No Claude chat agent here.');
    H.config.agents.push({ ...mk, id: `${mk.id}${H.agent(mk.id) ? Date.now() : ''}`, mode: 'native', engine: 'claude', selfReview: true, enabled: true });
    await saveConfig();
    for (let i = 0; i < 30 && !(a = agentFor(kind)); i += 1) await sleep(100);
    try { Tools.syncDocks?.(); } catch { /* docks follow on the next view */ }
    if (!a) throw new Error(`Couldn't set up the ${mk.name}.`);
    return a;
  }
  async function labUp(ms = 8000) {
    if (typeof ThreeLab === 'undefined') return null;
    try { await ThreeLab.cmd({ show: false }); } catch { return null; }
    for (let t = 0; t < ms && !(ThreeLab.scenes && ThreeLab.director); t += 100) await sleep(100);
    return ThreeLab.scenes || null;
  }
  // a Lab room's scene: its own, made now, in the make's color, named after the room (chat-scenes.js follows the title)
  async function sceneFor(part, { wait = true } = {}) {
    if (typeof ChatScenes === 'undefined' || !part.chatId) return null;
    const S = wait ? await labUp() : (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
    if (!S || !ThreeLab.director) return null;
    const have = ChatScenes.linkOf(part.chatId);
    if (have) return have;
    try { return ChatScenes.fresh(part.chatId)?.id || null; } catch (err) { console.warn(err); return null; }
  }
  async function boardFrame(make, part) {
    if (typeof Board === 'undefined') return null;
    try {
      const b = await Board.ready();
      if (!b) return null;
      const it = Board.addFrame({ title: C.roomTitle(make, part), color: make.ident.color });
      if (it) { part.frameId = it.id; part.boardId = b.id; }
      return it;
    } catch (err) { console.warn(err); return null; }
  }
  // the chat a room is: empty, saved now (a real chat, not a draft), titled "<Name> · <Room>"
  async function makeRoom(make, part, { scenes = true } = {}) {
    const k = C.KINDS[part.kind];
    if (k?.room === 'board') { await boardFrame(make, part); return; }
    if (k?.room !== 'chat' || part.chatId) return;
    const agent = await ensureAgent(part.kind);
    const at = Date.now();
    const chat = { id: `${agent.id}-${at.toString(36)}${part.id}`, agentId: agent.id, title: C.roomTitle(make, part), createdAt: at, updatedAt: at, session: {}, messages: [], make: { id: make.id, part: part.id } };
    part.chatId = chat.id; part.agentId = agent.id; idx = null;
    Native.adopt(chat, { openIt: false });
    if (part.kind === 'lab' && scenes) await sceneFor(part);
  }

  // ---------- planning a make: every room now ----------
  let by = null; // the command running now (Commands.onBefore), stamped on what it makes
  const byNow = (extra = {}) => (by ? { cmd: `/${by.def.name}`, source: by.source, ...extra } : { ...extra });
  async function plan(input, { show = true, from = null, name = null, kinds = null, who = null } = {}) {
    await ready;
    const text = typeof input === 'string' ? input : String(input?.text || '');
    const pl = C.parsePlan(text, { kinds: kinds || input?.parts || null });
    const make = C.create({ name: name || input?.name || pl.name, idea: pl.idea || text, parts: pl.parts, cat: 'plan', by: who || byNow(), from: from || hereChat(), avoid: avoid() });
    data.list.unshift(make);
    for (const p of make.parts) await makeRoom(make, p);
    for (const p of make.parts) if (C.isRoom(p.kind)) p.status = 'planned';
    changed(make, 'plan');
    if (show) openRoom(make, make.parts.find((p) => p.chatId) || make.parts[0]);
    return make;
  }
  // one more room in a make (Plan another room ›)
  async function addRoom(make, kind, brief = '') {
    const p = C.addPart(make, { kind, brief, id: `p${make.parts.length + 1}${Date.now().toString(36).slice(-3)}` });
    await makeRoom(make, p);
    changed(make, 'room');
    return p;
  }

  // ---------- opening a room ----------
  async function openRoom(make, part) {
    if (!part) return;
    if (part.kind === 'board' || part.frameId) {
      activate('tool:board');
      if (!part.frameId) await boardFrame(make, part);
      for (let i = 0; i < 40 && !Board.isMounted?.(); i += 1) await sleep(100);
      try { if (part.frameId) { Board.select([part.frameId]); Board.zoomSel?.(); } } catch { /* the frame was deleted */ }
      return;
    }
    if (!part.chatId) { if (make.from && summary(make.from)) Native.open(summary(make.from).agentId, make.from); return; }
    const c = summary(part.chatId);
    if (!c) { toast(make.dismissed ? `“${make.name}” is dismissed: restore it first` : 'That room is gone', { action: make.dismissed ? { label: 'Restore', fn: () => restore(make) } : undefined }); return; }
    const agent = H.agent(c.agentId);
    if (part.kind === 'lab' && agent?.dock === 'three' && typeof ChatScenes !== 'undefined' && !ChatScenes.linkOf(c.id)) await sceneFor(part, { wait: false });
    Native.open(c.agentId, c.id);
    if (agent?.dock) Tools.openDock?.(agent.dock);
  }

  // ---------- rename, dismiss, restore ----------
  function rename(make, name) {
    const list = C.rename(make, name);
    if (!list.length && !make.name) return 0;
    for (const { part, title } of list) {
      if (part.chatId && summary(part.chatId)) Native.rename(part.chatId, title);
      if (part.frameId && typeof Board !== 'undefined') { try { Board.patch([part.frameId], { title }, 'rename'); } catch { /* another board is open */ } }
    }
    if (make.src?.kind === 'intro' && typeof Intro !== 'undefined') { const p = Intro.get(make.src.id); if (p) { p.name = make.name; Intro.changed(p); } }
    changed(make, 'rename');
    return list.length;
  }
  async function dismiss(make, { quiet = false } = {}) {
    const ids = C.dismiss(make);
    let n = 0;
    for (const id of ids) {
      const s = summary(id);
      if (!s) continue;
      if (Native.isBusy(id)) window.hub.stop(id);
      await window.hub.deleteChat(id);
      Native.forget?.(id);
      H.chats = H.chats.filter((c) => c.id !== id);
      if (H.activeChat[s.agentId] === id) Native.newChat(s.agentId);
      n += 1;
    }
    changed(make, 'dismiss');
    if (!quiet) toast(`Dismissed “${make.name}”${n ? ` · ${n} room${n === 1 ? '' : 's'} in the trash (30 days)` : ''}`, { timeout: 7000, action: { label: 'Undo', fn: () => restore(make) } });
    return n;
  }
  async function restore(make) {
    const ids = C.restore(make);
    for (const id of ids) { try { await window.hub.restoreChat(id); } catch { /* already back, or emptied from the trash */ } }
    try { H.chats = await window.hub.listChats(); } catch { /* keep the list */ }
    changed(make, 'restore');
    return ids.length;
  }

  // ---------- progress (the progress-bar stream attaches here) ----------
  // Makes.progress(makeId, partId?, { pct, label, eta }) → the stored record; every listener hears it
  function progress(makeId, partId = null, p = {}) {
    const make = typeof makeId === 'object' ? makeId : get(makeId);
    if (!make) return null;
    if (partId && typeof partId === 'object') { p = partId; partId = null; }
    const rec = C.progress(make, partId, p);
    if (rec) changed(make, 'progress', { partId, progress: rec });
    return rec;
  }
  function setPart(make, part, status, extra = {}) {
    if (!part || (part.status === status && !Object.keys(extra).length)) return;
    part.status = status;
    Object.assign(part, extra);
    changed(make, 'part', { partId: part.id });
  }
  function addOutput(make, path, partId = null, kind) {
    const o = C.addOutput(make, { path, kind }, partId);
    if (o) changed(make, 'output', { output: o });
    return o;
  }

  // ---------- handing a room's work to the next room ----------
  const nextRoom = (make, part) => make.parts.slice(make.parts.indexOf(part) + 1).find((p) => p.chatId || p.frameId) || null;
  async function handoff(make, part) {
    const next = nextRoom(make, part);
    if (!next) { setPart(make, part, 'done'); return null; }
    setPart(make, part, 'done');
    let last = '';
    try { const chat = await Native.load(part.chatId); last = cap(String([...(chat?.messages || [])].reverse().find((m) => m.role === 'assistant')?.text || '').replace(/<[^>]+>/g, ''), 400); } catch { /* no reply yet */ }
    await openRoom(make, next);
    const out = make.outputs.find((o) => o.part === part.id || !o.part);
    const c = next.chatId && summary(next.chatId);
    if (c) {
      setTimeout(async () => {
        Native.setDraft(c.agentId, `From “${C.roomTitle(make, part)}”${last ? `: ${last}` : ''}\n${/\s/.test(next.brief || '') ? `Now: ${next.brief}` : 'Take it from here.'}`);
        if (out && next.kind === 'video') { try { await Native.attachPaths(c.agentId, [out.path]); } catch { /* the file moved */ } }
      }, 350);
    }
    return next;
  }

  // ---------- adapters: what other modules create becomes a make ----------
  // /dispatch (comp-dispatch.js): the parts' chats are the make's rooms. Dispatched from a make's room, the parts join
  // that make; otherwise a new make named after the main chat (or the parts' words).
  function compMake({ id, hostChatId, hostTitle, parts }) {
    const inRoom = roomOf(hostChatId);
    let make = inRoom && !inRoom.make.dismissed ? inRoom.make : null;
    if (!make) {
      const t = String(hostTitle || '').replace(/\s·\s.*$/, '').trim();
      const nm = t && !/^(new chat|comp|jam)$/i.test(t) ? t : C.nameFor(parts.map((p) => p.brief).join(' and '));
      make = C.create({ name: nm, idea: parts.map((p) => p.brief).join(' | '), cat: 'comp', by: byNow(), from: hostChatId, src: { kind: 'comp', id }, avoid: avoid() });
      data.list.unshift(make);
    }
    const n = parts.length;
    const added = parts.map((p, i) => C.addPart(make, { kind: 'lab', id: `c${id.slice(-4)}${i + 1}`, label: `Lab ${i + 1}/${n}`, sub: cap(p.name, 28), brief: p.brief, status: 'working' }));
    for (const p of added) { p.compId = id; p.compN = Number(added.indexOf(p)) + 1; }
    changed(make, 'comp');
    return { id: make.id, titles: added.map((p) => C.roomTitle(make, p)) };
  }
  const COMP_STATE = { sent: 'working', working: 'working', waiting: 'ready', done: 'done', stuck: 'stuck' };
  function fromComp(m) {
    const make = (m.make && get(m.make)) || data.list.find((x) => x.parts.some((p) => p.compId === m.id));
    if (!make) return;
    let dirty = false;
    for (const cp of m.parts || []) {
      const part = make.parts.find((p) => p.compId === m.id && p.compN === cp.n);
      if (!part) continue;
      if (cp.chatId && part.chatId !== cp.chatId) { part.chatId = cp.chatId; idx = null; part.own = summary(cp.chatId)?.title === C.roomTitle(make, part) || !summary(cp.chatId); dirty = true; }
      const st = COMP_STATE[cp.state] || 'working';
      if (part.status !== st) { part.status = st; dirty = true; }
      const last = cap(cp.last || '', 120);
      if (last && part.last !== last) { part.last = last; dirty = true; }
    }
    if (dirty) changed(make, 'comp');
  }
  // /intro video projects (intro.js): one make per project, its steps are the parts
  const INTRO_ST = { done: 'done', ok: 'done', running: 'working', working: 'working', error: 'stuck', failed: 'stuck', stale: 'ready', proposed: 'planned', todo: 'planned' };
  function fromIntro(p) {
    if (!p || !loaded) return;
    let make = ofSrc('intro', p.id);
    const steps = (typeof IntroData !== 'undefined' && IntroData.STEPS) || [];
    if (!make) {
      make = C.create({ id: `mk-${p.id}`, name: p.name, idea: p.idea, cat: 'intro', by: byNow(), from: p.chatId, src: { kind: 'intro', id: p.id }, at: p.at, avoid: avoid(), parts: steps.map((s) => ({ kind: 'step', id: s.id, label: s.name })) });
      data.list.unshift(make);
    }
    let dirty = make.name !== p.name;
    make.name = p.name;
    for (const s of steps) {
      const part = make.parts.find((x) => x.id === s.id);
      const st = p.steps?.[s.id] || {};
      const want = INTRO_ST[st.status] || 'planned';
      if (part && part.status !== want) { part.status = want; dirty = true; }
      if (part && st.total) { const pct = Math.round((100 * (st.done || 0)) / st.total); if (part.progress?.pct !== pct) { part.progress = { pct, label: st.sub || '', eta: null, at: Date.now() }; dirty = true; } }
    }
    for (const o of p.outputs || []) if (o.path && C.addOutput(make, { path: o.path, kind: 'video' }, 'render')) dirty = true;
    if (p.status === 'done' && !make.done) { make.done = true; dirty = true; }
    if (dirty) changed(make, 'intro');
  }
  // jams (jam.js): rounds are the progress; in a make's room the jam joins that make
  const JAM_ST = { running: 'working', done: 'done', stopped: 'ready', error: 'stuck' };
  function fromJam(m, chat) {
    if (!loaded || !m) return;
    let make = data.list.find((x) => x.parts.some((p) => p.jamId === m.id));
    if (!make) {
      const r = roomOf(chat?.id);
      make = r && !r.make.dismissed ? r.make : null;
      if (!make) {
        make = C.create({ name: C.nameFor(m.idea) || (m.idea ? cap(m.idea, 32) : ''), idea: m.idea, cat: 'jam', by: byNow(), from: chat?.id || null, src: { kind: 'jam', id: m.id }, avoid: avoid() });
        data.list.unshift(make);
      }
      const p = C.addPart(make, { kind: 'step', id: `j${m.id.slice(-4)}`, label: 'Jam', brief: m.idea || '' });
      p.jamId = m.id;
    }
    const part = make.parts.find((p) => p.jamId === m.id);
    part.status = JAM_ST[m.status] || 'working';
    part.progress = { pct: Math.round((100 * (m.list?.length || 0)) / Math.max(1, m.total || 1)), label: `round ${m.list?.length || 0} of ${m.total}`, eta: null, at: Date.now() };
    changed(make, 'jam');
  }
  // runs (the Commands page / Flows) whose steps create something
  const RUN_ST = { running: 'working', 'waiting-ai': 'working', 'waiting-you': 'ready', hung: 'stuck', done: 'done', stopped: 'ready' };
  function runCreators(run) {
    const names = run.flow?.commands?.length ? run.flow.commands : (run.flow?.nodes || []).filter((n) => n.kind === 'action' && n.cmd).map((n) => String(n.cmd).replace(/^\//, '').split(/\s+/)[0]);
    return names.filter((n) => C.creatorOf(n, n === 'scene' ? 'new' : n === 'comp' ? 'render' : ''));
  }
  function fromRun(run) {
    if (!loaded || !run?.id || !run.flow) return;
    let make = ofSrc('run', run.id) || data.list.find((x) => x.parts.some((p) => p.runId === run.id));
    if (!make) {
      const makers = runCreators(run);
      if (!makers.length || ['done', 'stopped'].includes(run.status) && Date.now() - (run.updated || 0) > 60000) return;
      const r = roomOf(run.chatId);
      make = r && !r.make.dismissed ? r.make : null;
      if (!make) {
        const nm = String(run.flowName || run.title || '').replace(/^\//, '').replace(/^\w/, (x) => x.toUpperCase());
        make = C.create({ name: nm ? `${nm} · ${C.genName(run.id).split(' ')[1]}` : '', idea: run.flowName, cat: 'run', by: { cmd: run.flowName, run: run.id }, from: run.chatId || null, src: { kind: 'run', id: run.id }, avoid: avoid() });
        data.list.unshift(make);
      }
      const p = C.addPart(make, { kind: 'step', id: `r${run.id.slice(-5)}`, label: cap(run.flowName || 'Run', 24) });
      p.runId = run.id;
    }
    const part = make.parts.find((p) => p.runId === run.id);
    if (!part) return;
    const st = RUN_ST[run.status] || 'working';
    let pct = null;
    try { const g = run.flow.guided && typeof CmdPageCore !== 'undefined' ? CmdPageCore.progress(run, Flows.nodeOf) : null; if (g) pct = Math.round((100 * g.done) / Math.max(1, g.total)); } catch { /* not a guided run */ }
    if (pct == null) pct = Math.round((100 * (run.steps || []).filter((e) => e.status === 'done').length) / Math.max(1, (run.flow.nodes || []).filter((n) => n.kind !== 'start').length));
    if (st === 'done') pct = 100;
    if (part.status === st && part.progress?.pct === pct) return;
    part.status = st;
    part.progress = { pct, label: Flows.STATUS_LABEL?.[run.status] || run.status, eta: null, at: Date.now() };
    changed(make, 'run');
  }

  // ---------- every creator command goes through here (the registry audit: MakesCore.CREATORS) ----------
  let runMake = null; // { make, part } a standalone creator made for the command running now
  function beforeCommand(e) {
    if (e.nested) return;
    const cr = C.creatorOf(e.def.name, e.args);
    by = cr ? e : null;
    runMake = null;
    if (!cr || cr.adapter) return; // the adapters (comp, intro, jam, makes, capture) tell Makes themselves
    const r = here();
    let make = r?.make || null;
    if (!make) {
      if (!cr.standalone) return;
      let nm = '';
      try { if (e.place === 'three' && ThreeLab.scenes) nm = ThreeLab.scenes.get(ThreeLab.scenes.currentId())?.name || ''; } catch { /* no Lab */ }
      make = C.create({ name: nm, idea: `/${e.def.name} ${e.args || ''}`.trim(), cat: cr.cat || 'render', by: byNow(), from: hereChat(), src: { kind: 'cmd', id: `${e.def.name}-${Date.now().toString(36)}` }, avoid: avoid() });
      data.list.unshift(make);
    }
    const part = C.addPart(make, { kind: 'step', id: `x${Date.now().toString(36)}`, label: cap(e.def.name.replace(/-/g, ' '), 24), brief: `/${e.def.name} ${e.args || ''}`.trim(), status: 'working' });
    runMake = { make, part };
    changed(make, 'command');
  }
  function afterCommand(e) {
    if (e.nested) return;
    if (runMake) { setPart(runMake.make, runMake.part, e.ok ? 'done' : 'stuck'); }
    by = null; runMake = null;
  }
  // captures and recordings: in a make's room (or while a creator runs) they are the make's outputs
  function onCapture(path, kind) {
    if (!path || !loaded) return;
    const r = runMake || here();
    if (r) addOutput(r.make, path, r.part.id, kind);
  }

  // ---------- the chats list: each make with its rooms, above the agents ----------
  const ST_TAG = { planned: 'planned', waiting: 'planned', working: 'working', ready: '', done: '✓', stuck: 'stuck' };
  const MAX_GROUPS = 8;
  function roomsOf(make) { return make.parts.filter((p) => p.own && p.chatId && summary(p.chatId)); }
  function panelTop(root, { row, itemOf, q, collapsed, toggleGroup }) {
    if (!loaded) return;
    const list = live().filter((m) => roomsOf(m).length);
    let shown = 0;
    for (const make of list) {
      if (shown >= MAX_GROUPS && !q) break;
      let rooms = roomsOf(make);
      if (q && !make.name.toLowerCase().includes(q)) rooms = rooms.filter((p) => summary(p.chatId).title.toLowerCase().includes(q));
      if (!rooms.length) continue;
      shown += 1;
      const key = `make:${make.id}`;
      const st = C.statusOf(make);
      const closed = collapsed.has(key) && !q;
      const group = el('div', { class: `group mk-group mk-${st}`, dataset: { id: key, make: make.id } }); tint(group, make.ident.color); group.style.setProperty('--agent', make.ident.color);
      const pct = C.pctOf(make);
      const toggle = el('button', { class: 'group-toggle', type: 'button', title: `${make.name} · ${C.CATS[make.cat] || 'Make'} · ${C.chain(make)} · ${C.STATUS_LABEL[st]}${pct ? ` · ${pct} %` : ''}\nRight-click: rooms, rename, dismiss…`, on: { click: () => toggleGroup(key) } },
        el('span', { class: 'caret', text: closed ? '▸' : '▾' }), el('span', { class: 'mk-mark', text: make.ident.glyph }), el('span', { class: 'group-name', text: make.name }),
        el('span', { class: 'group-kind mk-st', text: st === 'planned' ? 'planned' : st === 'done' ? '✓' : st === 'stuck' ? 'stuck' : pct ? `${pct} %` : C.STATUS_LABEL[st] }));
      const more = el('button', { class: 'group-add mk-more', type: 'button', text: '⋯', title: 'This make: its rooms, rename, hand off, dismiss…', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); showMenu(b.left, b.bottom + 2, makeMenu(make)); } } });
      const head = el('div', { class: 'group-head' }, toggle, more);
      head.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, makeMenu(make)); });
      group.append(head);
      if (!closed) {
        for (const p of rooms) {
          const c = summary(p.chatId);
          const agent = H.agent(c.agentId);
          if (!agent) continue;
          const r = row(agent, itemOf(c));
          r.dataset.agent = agent.id;
          r.classList.add('mk-room');
          // under its make's name the row says only its room ("Lab 1/2 · red pulse"); the full title stays in the tooltip
          const t = r.querySelector('.item-title');
          if (t && t.textContent.startsWith(`${make.name} · `)) t.textContent = t.textContent.slice(make.name.length + 3);
          if (!r.querySelector('.chat-ident')) r.prepend(el('span', { class: 'chat-ident mk-ident', text: make.ident.glyph }));
          const tag = ST_TAG[p.status];
          if (tag && !r.querySelector('.busy')) r.append(el('span', { class: `mk-tag mk-t-${p.status}`, text: tag, title: C.waitText(make, p) }));
          r.addEventListener('contextmenu', (e) => { if (!e.altKey) return; e.preventDefault(); e.stopImmediatePropagation(); showMenu(e.clientX, e.clientY, makeMenu(make)); }, { capture: true });
          group.append(r);
        }
      }
      root.append(group);
    }
    if (!q && list.length > shown) root.append(el('button', { class: 'show-more mk-more-makes', type: 'button', text: `${list.length - shown} more makes ›`, on: { click: () => show() } }));
  }
  // a room of a make leaves its agent's group (it shows under its make)
  const panelSkip = (c) => { const r = loaded && roomOf(c.id); return Boolean(r && r.part.own && !r.make.dismissed); };
  function paintProgress(make) {
    if (!make) return;
    const g = document.querySelector(`#chat-groups .mk-group[data-make="${make.id}"] .mk-st`);
    const st = C.statusOf(make);
    const pct = C.pctOf(make);
    const t = st === 'planned' ? 'planned' : st === 'done' ? '✓' : pct ? `${pct} %` : C.STATUS_LABEL[st];
    if (g && g.textContent !== t) g.textContent = t;
  }

  // ---------- menus (right-click on a make, its rooms, the Makes list) ----------
  function makeMenu(make) {
    const rooms = make.parts.filter((p) => p.chatId || p.frameId || C.KINDS[p.kind]?.room);
    const st = C.statusOf(make);
    const nextOf = rooms.find((p) => p.status !== 'done' && nextRoom(make, p));
    return [
      rooms.length ? { label: `↗ Open ${C.label(rooms[0], make)}`, action: () => openRoom(make, rooms[0]) } : null,
      rooms.length > 1 ? { label: 'Rooms', items: () => rooms.map((p) => ({ label: `${C.KINDS[p.kind]?.icon || '•'} ${C.label(p, make)}`, hint: C.waitText(make, p), action: () => openRoom(make, p) })) } : null,
      nextOf ? { label: `⇢ Hand off to ${C.label(nextRoom(make, nextOf), make)}`, hint: `from ${C.label(nextOf, make)}`, action: () => handoff(make, nextOf) } : null,
      { label: 'Rename the make…', hint: 'every room follows', action: () => renamePrompt(make) },
      { label: 'Plan another room', items: () => ['lab', 'video', 'board', 'chat', 'astra'].map((k) => ({ label: `${C.KINDS[k].icon} ${C.KINDS[k].label}`, hint: C.KINDS[k].who, action: () => addRoom(make, k).then((p) => openRoom(make, p)).catch((e) => toast(e.message, { type: 'error' })) })) },
      make.outputs.length ? { label: `Outputs (${make.outputs.length})`, items: () => make.outputs.slice(0, 12).map((o) => ({ label: base(o.path), items: [{ label: 'Open', action: () => openOutput(o.path) }, { label: 'Show in folder', action: () => window.hub.fs.reveal(o.path) }, { label: 'Attach to the chat', action: () => attachHere(o.path) }] })) } : null,
      { label: 'Show in Makes', hint: 'the Commands page', action: () => show(make.id) },
      { label: 'More', items: () => [
        { label: 'Copy the name', action: () => copyText(make.name, 'Name copied') },
        { label: st === 'done' ? 'Not done yet' : 'Mark it done', action: () => { make.done = st !== 'done'; if (make.done) for (const p of make.parts) p.status = 'done'; changed(make, 'done'); } },
        make.from && summary(make.from) ? { label: 'The chat it came from', action: () => Native.open(summary(make.from).agentId, make.from) } : null,
      ].filter(Boolean) },
      make.dismissed ? { label: 'Restore (its rooms come back)', action: () => restore(make) } : { label: 'Dismiss the make…', danger: true, hint: 'its rooms to the trash', action: () => dismissAsk(make) },
    ].filter(Boolean);
  }
  async function renamePrompt(make) {
    const nm = await Modal.prompt('Rename the make', { value: make.name, label: `Every room follows: “${make.name} · Lab” → “<new name> · Lab”` });
    if (nm && nm.trim() && nm.trim() !== make.name) { const n = rename(make, nm.trim()); toast(`“${make.name}”${n ? ` · ${n} room${n === 1 ? '' : 's'} renamed` : ''}`, { timeout: 2500 }); }
  }
  async function dismissAsk(make) {
    const n = roomsOf(make).length;
    if (n && !(await Modal.confirm(`Dismiss “${make.name}”?`, `Its ${n} room${n === 1 ? '' : 's'} go${n === 1 ? 'es' : ''} to the trash (30 days); Restore brings the whole make back. Scenes, files and frames stay.`, { ok: 'Dismiss', danger: true }))) return;
    await dismiss(make);
  }
  async function openOutput(path) { if (typeof CaptureView !== 'undefined') return CaptureView.open(path); activate('tool:ae'); await Review.ensureMounted?.(); return Review.open(path); }
  async function attachHere(path) { const a = H.agent(H.activeId); const id = a?.mode === 'native' ? a.id : H.claudeAgent()?.id; if (id) await Native.attachPaths(id, [path]); }

  // ---------- the room itself: what it will hold, before anything is in it ----------
  function roomCard(make, part, chat) {
    const started = (chat.messages || []).some((m) => m.role === 'user' || m.role === 'assistant');
    const wait = C.waitText(make, part);
    const strip = el('div', { class: 'mk-strip' }, ...make.parts.flatMap((p, i) => [
      i ? el('span', { class: 'mk-arrow', text: '→' }) : null,
      el('button', { class: `mk-chip mk-c-${p.status}${p === part ? ' on' : ''}`, type: 'button', text: `${C.KINDS[p.kind]?.icon || '•'} ${C.label(p, make)}`, title: `${C.waitText(make, p)}${p.brief ? ` · ${p.brief}` : ''}`, disabled: p === part, on: { click: () => openRoom(make, p) } }),
    ]));
    const next = nextRoom(make, part);
    const acts = el('div', { class: 'mk-acts' },
      !started && part.brief ? el('button', { class: 'ghost small', type: 'button', text: '✎ Start here', title: 'Put this room\'s part in the chat box (nothing is sent)', on: { click: () => Native.setDraft(chat.agentId, part.brief.replace(/^\w/, (x) => x.toUpperCase())) } }) : null,
      started && next ? el('button', { class: 'ghost small', type: 'button', text: `⇢ Hand off to ${C.label(next, make)}`, title: 'This part is done: open the next room with what was made here', on: { click: () => handoff(make, part) } }) : null,
      el('button', { class: 'ghost small', type: 'button', text: '⋯', title: 'This make: rooms, rename, dismiss…', on: { click: (e) => showMenuAt(e.currentTarget, makeMenu(make)) } }));
    const card = tint(el('div', { class: `mk-room-card${started ? ' mk-slim' : ''}`, dataset: { make: make.id } },
      el('div', { class: 'mk-rc-head' }, el('span', { class: 'mk-mark', text: make.ident.glyph }), el('b', { text: make.name }), el('span', { class: 'mk-room-name', text: `· ${C.label(part, make)}` }),
        el('span', { class: `mk-pill mk-c-${part.status}`, text: started ? (C.STATUS_LABEL[part.status] || part.status) : wait })),
      started ? null : el('p', { class: 'mk-holds', text: `This room will hold ${part.brief ? `the ${part.brief}` : C.KINDS[part.kind]?.holds || 'its part'}${C.KINDS[part.kind]?.who ? ` (${C.KINDS[part.kind].who})` : ''}. Nothing is made here yet.` }),
      make.parts.length > 1 ? strip : null, acts), make.ident.color);
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, makeMenu(make)); });
    return card;
  }
  function onRender(agentId, v, chat) {
    v.list.querySelector(':scope > .mk-room-card')?.remove();
    const r = chat && roomOf(chat.id);
    if (!r || r.make.dismissed) return;
    v.list.prepend(roomCard(r.make, r.part, chat));
    // a Lab room opened before the Lab was up gets its own scene now
    if (r.part.kind === 'lab' && typeof ChatScenes !== 'undefined' && typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director && !ChatScenes.linkOf(chat.id) && !(chat.messages || []).length) {
      const sk = ChatScenes.fresh(chat.id);
      if (sk) ChatScenes.openScene(sk.id).catch?.(() => {});
    }
  }

  // ---------- the agents: one lean line, only when it matters ----------
  const POINTS = /\b(other (room|chat|part)s?|(the|that) (video|lab|board|edit|scene) (room|chat|part)|next (step|room|part)|previous (step|part|room)|hand ?off|the make|this make|whole make|before you|after you)\b/i;
  function compose(agentId, chat, raw) {
    const r = roomOf(chat?.id);
    if (!r || r.make.dismissed || r.part.compId) return undefined; // a comp part's brief already frames it
    const users = (chat.messages || []).filter((m) => m.role === 'user').length;
    if (users > 1 && !POINTS.test(raw)) return undefined;
    return `${C.contextLine(r.make, r.part)}\n${raw}`;
  }
  function onSend(agentId, chat) {
    const r = roomOf(chat?.id);
    if (!r || r.part.compId) return;
    if (['planned', 'waiting', 'ready', 'stuck'].includes(r.part.status)) setPart(r.make, r.part, 'working');
  }
  function onEvent(ev, chat) {
    const r = chat && roomOf(chat.id);
    if (!r || r.part.compId || !ev || ev.type === 'delta') return;
    if (ev.type === 'done' && r.part.status === 'working') setPart(r.make, r.part, 'ready');
    else if (ev.type === 'error') setPart(r.make, r.part, 'stuck');
    else if (ev.type === 'stopped' && r.part.status === 'working') setPart(r.make, r.part, 'ready');
  }

  // ---------- the directors: three_do make ----------
  async function makeTool(args = {}, ctx = {}) {
    const op = String(args.op || 'list').toLowerCase();
    if (op === 'plan') {
      const text = String(args.text || args.idea || args.what || '').trim();
      if (!text && !args.parts) return { ok: false, error: 'plan needs text: what will be made ("a three.js animation that cuts into a video").' };
      const make = await plan({ text, name: args.name, parts: Array.isArray(args.parts) ? args.parts : null }, { show: false, from: ctx.chatId || null, who: { cmd: 'three_do make', agent: true } });
      return { ok: true, value: `Planned “${make.name}” (${C.chain(make)}): ${make.parts.map((p) => (p.chatId ? `room “${summary(p.chatId)?.title}”` : `${C.label(p, make)}`)).join(', ')}. They show grouped in the owner's chats list, empty until each part starts.` };
    }
    if (op === 'status') {
      const make = find(args.make) || roomOf(ctx.chatId)?.make || live()[0];
      return make ? { ok: true, value: lineOf(make) } : { ok: false, error: 'No make yet.' };
    }
    return { ok: true, value: live().slice(0, 8).map((m, i) => `${i + 1}. ${lineOf(m)}`).join('\n') || 'No makes yet.' };
  }
  const lineOf = (m) => `${m.ident.glyph} ${m.name} (${C.CATS[m.cat] || 'Make'}, ${C.STATUS_LABEL[C.statusOf(m)]}${C.pctOf(m) ? ` ${C.pctOf(m)} %` : ''}): ${m.parts.map((p) => `${C.label(p, m)} ${p.status}`).join(' → ') || 'no parts'}${m.outputs.length ? ` · ${m.outputs.length} output${m.outputs.length === 1 ? '' : 's'}` : ''}`;

  // ---------- one place: Makes on the Commands page ----------
  const pageSel = { id: null };
  function pageSections(q) {
    if (!loaded) return [];
    const s = String(q || '').trim().toLowerCase();
    let list = data.list.filter((m) => !m.dismissed);
    if (s) list = list.filter((m) => `${m.name} ${m.idea} ${C.CATS[m.cat]}`.toLowerCase().includes(s.replace(/^\//, '')));
    const out = [];
    if (list.length) out.push({ head: `Makes · ${list.length}`, items: list.slice(0, s ? 12 : 6).map((m) => ({ node: pageRow(m) })) });
    if (!s && data.list.length > 6) out[0]?.items.push({ node: el('button', { class: 'cp-row mk-allrow', type: 'button', dataset: { ext: 'makes:all' }, text: `All makes (${data.list.length}) ›` }) });
    return out;
  }
  function pageRow(m) {
    const st = C.statusOf(m);
    return tint(el('button', { class: `cp-row mk-row mk-${st}`, type: 'button', dataset: { ext: `make:${m.id}` }, title: lineOf(m) },
      el('span', { class: 'cp-pv mk-pv', text: m.ident.glyph }),
      el('span', { class: 'cp-rtext' }, el('b', { text: m.name }), el('span', { class: 'cp-desc', text: `${C.chain(m) || C.CATS[m.cat]} · ${C.STATUS_LABEL[st]}${C.pctOf(m) && st !== 'done' ? ` · ${C.pctOf(m)} %` : ''}` })),
      el('span', { class: 'cp-area', text: (C.CATS[m.cat] || 'make').toLowerCase() })), m.ident.color);
  }
  function pagePick(id, right) {
    if (id === 'makes:all') { renderAll(right); return; }
    const make = get(String(id).replace(/^make:/, ''));
    if (make) renderDetail(make, right);
  }
  function pageMenu(id, e) {
    const make = get(String(id).replace(/^make:/, ''));
    if (make) showMenu(e.clientX, e.clientY, makeMenu(make));
  }
  function renderAll(right) {
    pageSel.id = 'all';
    const rows = data.list.map((m) => { const r = pageRow(m); if (m.dismissed) r.classList.add('mk-dismissed'); return r; });
    const box = el('div', { class: 'cp-example mk-all' }, el('div', { class: 'cp-ex-head' }, el('h2', { text: 'Every make' }), el('span', { class: 'cp-area', text: `${data.list.length}` })),
      el('p', { class: 'cp-def', text: 'Everything Hearth made or is making for you, newest first. Dismissed ones stay here (Restore brings their rooms back).' }), el('div', { class: 'mk-list' }, ...rows));
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-ext]'); if (b) pagePick(b.dataset.ext, right); });
    box.addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-ext]'); if (b) { e.preventDefault(); pageMenu(b.dataset.ext, e); } });
    right.replaceChildren(box);
  }
  function renderDetail(make, right) {
    pageSel.id = make.id;
    const st = C.statusOf(make);
    const pct = C.pctOf(make);
    const partRow = (p) => {
      const c = p.chatId && summary(p.chatId);
      return el('div', { class: `mk-part mk-c-${p.status}` },
        el('span', { class: 'mk-picon', text: C.KINDS[p.kind]?.icon || '•' }),
        el('span', { class: 'mk-ptext' }, el('b', { text: c ? c.title : p.frameId ? C.roomTitle(make, p) : C.label(p, make) }), el('span', { class: 'cp-desc', text: `${C.waitText(make, p)}${p.progress?.pct != null && p.status !== 'done' ? ` · ${p.progress.pct} %${p.progress.label ? ` ${p.progress.label}` : ''}` : ''}${p.last ? ` · “${p.last}”` : ''}` })),
        c || p.frameId || C.KINDS[p.kind]?.room ? el('button', { class: 'ghost small', type: 'button', text: '↗ Open', on: { click: () => openRoom(make, p) } }) : null);
    };
    const outs = make.outputs.slice(0, 8).map((o) => el('div', { class: 'mk-out' }, el('span', { class: 'mk-picon', text: o.kind === 'video' ? '▶' : o.kind === 'still' ? '▣' : '•' }), el('span', { class: 'mk-ptext', text: base(o.path), title: o.path }),
      el('button', { class: 'ghost small', type: 'button', text: 'Open', on: { click: () => openOutput(o.path) } }), el('button', { class: 'ghost small', type: 'button', text: '⧉', title: 'Show in folder', on: { click: () => window.hub.fs.reveal(o.path) } })));
    const first = make.parts.find((p) => p.chatId || p.frameId);
    const box = tint(el('div', { class: 'cp-example mk-detail', dataset: { make: make.id } },
      el('div', { class: 'cp-big mk-big' }, el('span', { class: 'mk-bigmark', text: make.ident.glyph }), el('span', { class: 'mk-bigname', text: make.name })),
      el('div', { class: 'cp-ex-head' }, el('h2', { text: make.name }), el('span', { class: 'cp-area', text: C.CATS[make.cat] || 'Make' }), el('span', { class: `mk-pill mk-c-${st}`, text: `${C.STATUS_LABEL[st]}${pct && st !== 'done' ? ` · ${pct} %` : ''}` }), el('span', { class: 'spacer' }),
        el('button', { class: 'ghost small', type: 'button', text: '⋯', title: 'Rooms, rename, hand off, dismiss…', on: { click: (e) => showMenuAt(e.currentTarget, makeMenu(make)) } })),
      make.idea ? el('p', { class: 'cp-def', text: make.idea }) : null,
      el('div', { class: 'cp-sub', text: make.parts.length ? `${make.parts.length} part${make.parts.length === 1 ? '' : 's'}: ${C.chain(make)}` : 'No parts yet' }),
      el('div', { class: 'mk-parts' }, ...make.parts.map(partRow)),
      outs.length ? el('div', { class: 'cp-sub', text: `Outputs (${make.outputs.length})` }) : null, outs.length ? el('div', { class: 'mk-outs' }, ...outs) : null,
      el('div', { class: 'cp-small', text: `${make.by?.cmd ? `Made by ${make.by.cmd}${make.by.agent ? ' (an agent)' : ''}` : 'Made'} · ${timeAgo(make.at)}${make.from && summary(make.from) ? ` · from “${summary(make.from).title}”` : ''}${make.dismissed ? ' · dismissed' : ''}` }),
      el('div', { class: 'cp-row-btns' },
        first && !make.dismissed ? el('button', { class: 'primary', type: 'button', text: `↗ Open ${C.label(first, make)}`, on: { click: () => openRoom(make, first) } }) : null,
        el('button', { class: 'ghost', type: 'button', text: '✎ Rename', on: { click: () => renamePrompt(make) } }),
        make.dismissed ? el('button', { class: 'ghost', type: 'button', text: '↺ Restore', on: { click: () => restore(make) } }) : el('button', { class: 'ghost', type: 'button', text: 'Dismiss…', on: { click: () => dismissAsk(make) } }))), make.ident.color);
    right.replaceChildren(box);
  }
  function paintPage() {
    if (typeof CmdPage === 'undefined' || !CmdPage.isOpen?.()) return;
    const st = CmdPage.state;
    if (st.view === 'ext' && pageSel.id && st.right) { if (pageSel.id === 'all') renderAll(st.right); else { const m = get(pageSel.id); if (m) renderDetail(m, st.right); } }
    CmdPage.refreshList?.();
  }
  // the Makes list (Commands page), on one make when given
  async function show(id = null) {
    if (typeof CmdPage === 'undefined') return;
    CmdPage.open();
    await sleep(60);
    const st = CmdPage.state;
    if (!st.right) return;
    st.view = 'ext';
    if (id) pagePick(`make:${id}`, st.right); else renderAll(st.right);
  }

  // ---------- /makes ----------
  function register() {
    if (Commands.get('makes')) return;
    const sub = ['plan', 'list', 'open', 'rename', 'dismiss', 'restore', 'next', 'status', 'progress'];
    Commands.register({
      name: 'makes', area: 'App', args: '[plan <what> | open <make> [room] | rename <make> = <name> | next | dismiss <make> | restore <make> | status]',
      desc: 'Everything Hearth makes, one name and mark each: plan a make (its rooms are made now, grouped in the chats list) · open one · rename it (every room follows) · hand off to the next room · dismiss / restore',
      keywords: 'make makes plan rooms ahead project category same name logo three video chat room folder group',
      examples: ['/makes plan a three.js animation that cuts into a video', '/makes plan a neon tunnel loop then the edit', '/makes', '/makes rename 1 = Launch teaser', '/makes next'],
      complete: (a) => {
        const s = String(a || '');
        if (!/\s/.test(s)) return sub.filter((x) => x.startsWith(s.toLowerCase())).map((x) => ({ value: x === 'plan' ? 'plan ' : x, hint: { plan: 'what will be made: its rooms now', open: 'a make\'s room', rename: 'every room follows', next: 'hand off to the next room', dismiss: 'its rooms to the trash', restore: 'back from the trash', status: 'where each make is', list: 'every make', progress: 'set a progress' }[x] }));
        const verb = s.split(/\s+/)[0].toLowerCase();
        if (verb === 'plan') return ['a three.js animation that cuts into a video', 'board refs, then a Lab scene, then the edit', 'a neon loop then a 15 s video'].map((v) => ({ value: `plan ${v}` }));
        if (['open', 'rename', 'dismiss', 'status'].includes(verb)) return live().slice(0, 8).map((m) => ({ value: `${verb} ${m.name}`, hint: C.chain(m) }));
        if (verb === 'restore') return data.list.filter((m) => m.dismissed).slice(0, 8).map((m) => ({ value: `restore ${m.name}` }));
        return [];
      },
      run: async (args, ctx) => {
        await ready;
        const s = String(args || '').trim();
        const [verb0, ...rest] = s.split(/\s+/);
        const verb = (verb0 || '').toLowerCase();
        const restText = rest.join(' ');
        if (verb === 'plan') {
          if (!restText) return 'What will be made? e.g. /makes plan a three.js animation that cuts into a video';
          const make = await plan(restText, { from: ctx.chatId || hereChat(), show: ctx.source !== 'code' });
          return `${make.ident.glyph} **${make.name}** is planned: ${make.parts.map((p) => (p.chatId ? `“${summary(p.chatId)?.title}”` : C.roomTitle(make, p))).join(' → ')}. The rooms are in your chats list (grouped under ${make.ident.glyph} ${make.name}), empty until each part starts.`;
        }
        if (verb === 'open') {
          const m = find(rest[0]) || find(restText) || here()?.make;
          if (!m) return 'Which make? /makes lists them.';
          const want = restText.toLowerCase().replace(m.name.toLowerCase(), '').trim();
          const p = (want && m.parts.find((x) => C.label(x, m).toLowerCase().startsWith(want))) || m.parts.find((x) => x.chatId || x.frameId);
          if (p) await openRoom(m, p); else await show(m.id);
          return null;
        }
        if (verb === 'rename') {
          const [a, b] = restText.split(/\s*=\s*/);
          const m = b ? find(a) : here()?.make;
          const nm = (b ?? a ?? '').trim();
          if (!m || !nm) return 'Rename which make? /makes rename <make> = <new name> (in a room: /makes rename <new name>)';
          const was = m.name;
          const n = rename(m, nm);
          return `“${was}” is “${m.name}” now${n ? ` (${n} room${n === 1 ? '' : 's'} renamed)` : ''}.`;
        }
        if (verb === 'dismiss') { const m = find(restText) || here()?.make; if (!m) return 'Which make?'; const n = await dismiss(m); return `Dismissed “${m.name}”${n ? ` (${n} room${n === 1 ? '' : 's'} in the trash; /makes restore ${m.name} brings them back)` : ''}.`; }
        if (verb === 'restore') { const m = data.list.find((x) => x.dismissed && x.name.toLowerCase().includes(restText.toLowerCase())) || find(restText); if (!m) return 'Which make?'; const n = await restore(m); return `“${m.name}” is back${n ? ` with its ${n} room${n === 1 ? '' : 's'}` : ''}.`; }
        if (verb === 'next') { const r = roomOf(ctx.chatId) || here(); if (!r) return 'This chat isn\'t a make\'s room.'; const nx = await handoff(r.make, r.part); return nx ? `Handed “${r.make.name}” to ${C.label(nx, r.make)}.` : `That was the last room: “${r.make.name}” · ${C.label(r.part, r.make)} is done.`; }
        if (verb === 'progress') { const m = find(rest[0]) || here()?.make; const pct = Number.parseFloat(rest[1]); if (!m || !Number.isFinite(pct)) return '/makes progress <make> <pct> [label]'; progress(m.id, null, { pct, label: rest.slice(2).join(' ') }); return `${m.name}: ${Math.round(pct)} %`; }
        if (verb === 'status' && restText) { const m = find(restText); return m ? lineOf(m) : 'No such make.'; }
        if (verb && !['list', 'status'].includes(verb)) return `Use /makes plan <what>, open, rename, next, dismiss, restore or status.`;
        if (ctx.source !== 'code') show();
        return live().length ? live().slice(0, 10).map((m, i) => `${i + 1}. ${lineOf(m)}`).join('\n') : 'No makes yet: /makes plan a three.js animation that cuts into a video makes one with its rooms.';
      },
    });
  }

  // ---------- wiring ----------
  window.addEventListener('DOMContentLoaded', () => {
    Panel.hooks.skip?.push(panelSkip);
    Panel.hooks.top?.push(panelTop);
    Native.hooks.render.push(onRender);
    Native.hooks.compose.push(compose);
    Native.hooks.send.push(onSend);
    Native.hooks.event.push(onEvent);
    Commands.onBefore?.(beforeCommand);
    Commands.onRun?.(afterCommand);
    register();
    if (typeof HubBridge !== 'undefined') HubBridge.register(['three_make'], (name, args, ctx) => makeTool(args || {}, ctx || {}));
    if (typeof CmdPage !== 'undefined' && CmdPage.ext) {
      CmdPage.ext.sections.push(pageSections);
      CmdPage.ext.pick.push(pagePick);
      CmdPage.ext.menu.push(pageMenu);
    }
    document.addEventListener('hearth:capture', (e) => onCapture(e.detail?.path, e.detail?.kind === 'shot' ? 'still' : undefined));
    document.addEventListener('hearth:recording', (e) => { if (e.detail && e.detail.recording === false) onCapture(e.detail.path, 'video'); });
    Keys.add([
      { area: 'Makes', keys: 'Right-click a make', what: 'In the chats list (or ⋯ on its row): open a room, hand off, rename the whole make, plan another room, dismiss / restore' },
      { area: 'Makes', keys: 'Alt+right-click a room', what: 'The make\'s menu instead of the chat\'s' },
    ]);
    try { AppUI.addAction?.('Makes: everything Hearth makes, with its rooms', () => show()); AppUI.addAction?.('Makes: plan a make (its rooms now)…', async () => { const t = await Modal.prompt('Plan a make', { placeholder: 'a three.js animation that cuts into a video', label: 'What will be made? Its rooms are made now, with one name and mark.' }); if (t) plan(t).catch((e) => toast(e.message, { type: 'error' })); }); } catch { /* the palette is optional */ }
    ready.then(() => {
      if (typeof Intro !== 'undefined') { Intro.onChange((p) => fromIntro(p)); Intro.load?.().then(() => { for (const p of Intro.list()) fromIntro(p); }).catch(() => {}); }
      if (typeof Flows !== 'undefined') Flows.onChange((run) => { try { fromRun(run); } catch (err) { console.warn(err); } });
      Panel.render();
    });
  });

  return {
    ready: () => ready, list: () => data.list.slice(), live, get, find, roomOf, ofChat: (chatId) => roomOf(chatId)?.make || null, here, identFor, fileHere, nameIn,
    plan, addRoom, openRoom, rename, dismiss, restore, handoff, progress, setPart, addOutput, onChange, show, makeMenu,
    compMake, fromComp, fromIntro, fromJam, fromRun, makeTool,
    core: C,
  };
})();
window.Makes = Makes;
