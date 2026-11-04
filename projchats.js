// (round 116, projchats116) Chats live in projects. Every chat belongs to exactly one project; a project holds many
// chats with any AI. projchats-core.js holds the rules (the migration, a move, where a new chat goes); this is the
// window's side:
//   - the chats list shows only the open project's chats. A bar at its top names the project (click: switch project,
//     ＋ New project…, open its page) with “＋ New chat” beside it (pick the AI). No project open: the bar asks which.
//   - “New chat” (the list, the chat's own ＋, Ctrl/⌘+N, the tray) makes the chat in the open project; with no project
//     open it asks which project first (with “＋ New project…”). A Lab director's new chat goes to the project of the
//     scene on screen. A chat never ends up in no project: one made outside all of these goes to the open project, else
//     to “Earlier chats”.
//   - the open project follows what you open: a project (its page or its workspace), a chat (Ctrl/⌘+K, a link…).
//   - the migration (once per computer; its keeper again after the other computer's changes arrive): a chat in several
//     projects stays in one, a chat in none goes to “Earlier chats” (a fixed id: both computers make the same one).
//     It runs only after a careful read of the projects store says it is there and readable (a store that can't be
//     read is never taken as “no projects”): else it waits and tries again. Its writes are ordinary saves of the
//     projects store, so sync's write guard, store.settle and its choice writes treat them like any other change.
//   - (round 118, projsync118) the keeper reads carefully too before it writes (ProjChatsCore.readable: a read failure,
//     or an empty copy after the migration, is never “no projects”); a deleted project's chats go to Earlier chats at
//     once (deleted here or on the other computer), other chats with no project after the grace; chats the owner
//     imported (Import past chats…) go to the open project at once, with a note (else Earlier chats)
window.ProjChats = (() => {
  const K = ProjChatsCore;
  const P = Projects;
  const SCOPE = 'projchats.scope';
  const DONE = 'projchats.migrated';
  const EARLY = 'projchats.early'; // the chat ids last shown (panel.js filters with them until this file loads)
  const GRACE = 3 * 60000; // a chat seen with no project this long (an arrival, an import) goes to Earlier chats
  const RETRY = 60000;
  let scope = store.get(SCOPE, null);
  let tries = 0; // careful reads that said “not now”
  let ok = false; // the projects store was read carefully and this window holds it: the sweeps may run
  let ids = new Set(); // the open project's chat ids
  const pending = new Map(); // agent id → { pid, at }: the project a new chat of that AI goes to
  const seenLost = new Map(); // chat id → when first seen with no project

  // ---------- the projects store, read carefully ----------
  // (round 118, projsync118) the rules in ProjChatsCore.readable: unreadable, not a store, this window's copy empty while
  // the disk has projects, or no projects at all after the migration with chats about → wait (never written over)
  async function readOk() {
    await P.ready();
    let r = null;
    try { r = await window.hub.kvGet('projects', null, { status: true }); } catch { return false; }
    return K.readable(r, { held: P._data(), chats: H.chats, done: Boolean(store.get(DONE, null)) }).ok;
  }
  const data = () => P._data();
  const projectIdOf = (chatId) => { for (const p of data().list) if (p.items.some((x) => x.type === 'chat' && x.ref === chatId)) return p.id; return null; };
  async function save(why) { P.changed(null, why); await P.flush(); }
  function earlier() { const had = data().list.some(K.isEarlier); const e = K.ensureEarlier(data()); if (!had) P.changed(e, 'create'); return e; }

  // the migration, once per computer (its record: data/kv/projects.json, chatsMovedOut on each project it took a chat
  // out of, `was: 'no-project'` on each Earlier chats item it added)
  async function migrate() {
    if (!(await readOk())) { tries += 1; setTimeout(() => migrate().catch((err) => console.warn('projchats', err)), RETRY); paintBar(); return false; }
    ok = true;
    const first = !store.get(DONE, null);
    const r = K.sweep(data(), H.chats, first ? { at: Date.now() } : { at: Date.now(), ready: K.lostReady(data(), seenLost, Date.now(), GRACE) });
    if (r.changed) {
      try { await save('chats116'); } catch (err) { console.warn('projchats: not saved yet', err); ok = false; setTimeout(() => migrate().catch(() => {}), RETRY); return false; }
    }
    if (first) {
      store.set(DONE, { v: 1, at: Date.now(), moved: r.moved.length, earlier: r.earlier.length });
      if (r.moved.length || r.earlier.length) toast(`Every chat now belongs to one project${r.earlier.length ? ` (${r.earlier.length} chat${r.earlier.length === 1 ? '' : 's'} without one went to “Earlier chats”)` : ''}. Nothing was deleted.`, { timeout: 9000 });
    }
    if (!scope || !P.get(scope)) setScope(followed() || P.live()[0]?.id || null, { quiet: true });
    refresh();
    return true;
  }
  // the keeper: after the other computer's changes arrive, and now and then (a chat from an older Hearth, a project restored)
  let keepT = 0;
  function keepSoon(ms = 4000) { clearTimeout(keepT); keepT = setTimeout(keep, ms); }
  async function keep() {
    if (!ok) return;
    if (!(await readOk())) return; // (round 118, projsync118) a read failure is never “empty”: skipped, tried again later
    const r = K.sweep(data(), H.chats || [], { at: Date.now(), ready: K.lostReady(data(), seenLost, Date.now(), GRACE) });
    for (const id of [...seenLost.keys()]) if (projectIdOf(id)) seenLost.delete(id);
    if (r.changed) { try { await save('chats116'); } catch (err) { console.warn('projchats keep', err); } }
  }

  // ---------- the open project ----------
  const current = () => (scope && P.get(scope)) || null;
  function setScope(pid, { quiet = false } = {}) {
    const p = pid ? P.get(pid) : null;
    scope = p ? p.id : null;
    store.set(SCOPE, scope);
    refresh();
    if (!quiet) (Panel.soon || Panel.render)();
  }
  function refresh() {
    const p = current();
    ids = new Set(p ? p.items.filter((x) => x.type === 'chat').map((x) => x.ref) : []);
    try { store.set(EARLY, { ids: [...ids].slice(0, 3000), at: Date.now() }); } catch { /* a convenience */ }
    paintBar();
  }
  // what is open: a project's workspace or page, else the chat in front of you's project
  function followed() {
    const ws = window.ProjectWorkspace?.current?.()?.id || window.ProjectsHome?.openProject?.() || null;
    if (ws) return ws;
    const c = P.hereChat();
    return c ? projectIdOf(c) : null;
  }
  let lastWs = null; let lastChat = null;
  function follow() {
    if (!ok) return;
    const ws = window.ProjectWorkspace?.current?.()?.id || window.ProjectsHome?.openProject?.() || null;
    const chat = P.hereChat() || null;
    const wsNew = ws !== lastWs; const chatNew = chat !== lastChat;
    lastWs = ws; lastChat = chat;
    let to = null;
    if (wsNew && ws) to = ws;
    else if (chatNew && chat) to = projectIdOf(chat);
    if (to && to !== scope && P.get(to)) setScope(to);
  }

  // ---------- new chats ----------
  const sceneProjectId = () => { try { const s = P.currentScene(); return s ? P.ofItem('scene', s)[0]?.id || null : null; } catch { return null; } };
  function onNewChat(agentId) {
    const was = pending.get(agentId);
    if (was && Date.now() - was.at < 3000) return; // chosen a moment ago (the bar's ＋ New chat, the question)
    const a = H.agent(agentId);
    const director = Boolean(a?.dock);
    // (round 116, labchat92) a chat started from the Lab ("Ask Claude about this layer", a linked chat) belongs to the
    // scene's project, whichever AI; and the "Which project?" window only answers the owner's own press: a chat started
    // by code (no fresh click or key) never opens a window that takes the keyboard (it goes to Earlier chats, with a note)
    const pid = director ? sceneProjectId() || current()?.id : current()?.id || sceneProjectId();
    if (pid) { pending.set(agentId, { pid, at: Date.now() }); return; }
    if (!ok) return; // projects not read yet: the chat goes to Earlier chats when it is made (never none)
    if (navigator.userActivation && !navigator.userActivation.isActive) return; // placed by place(): Earlier chats + a note
    ask(agentId);
  }
  // a chat in a project of your choice: the AI given, in the project given
  function newChatIn(pid, agentId) {
    const a = H.agent(agentId) || H.claudeAgent();
    if (!a || !P.get(pid)) return;
    pending.set(a.id, { pid, at: Date.now() });
    setScope(pid);
    if (a.dock) Tools.openDock?.(a.dock); else activate(a.id);
    Native.newChat(a.id);
  }
  // no project open: which one? (or a new one)
  function ask(agentId) {
    document.querySelector('.pc-ask')?.close();
    const d = el('dialog', { class: 'ui-modal pc-ask', attrs: { 'aria-label': 'Which project is this chat for?' } });
    const pick = (pid) => { pending.set(agentId, { pid, at: Date.now() }); setScope(pid); d.close(); Native.newChat(agentId); };
    const list = el('div', { class: 'pc-ask-list' }, ...P.live().slice(0, 12).map((p) => el('button', { type: 'button', class: 'ghost pc-ask-p', text: `${p.ident.glyph} ${p.name}`, title: `Start the chat in “${p.name}”`, on: { click: () => pick(p.id) } })));
    d.append(el('h2', { text: 'Which project is this chat for?' }), el('p', { class: 'hint', text: 'Every chat belongs to one project. You can move it later (right-click the chat › Move to project…).' }), list,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => d.close() } }),
        el('button', { type: 'button', class: 'primary', text: '＋ New project…', on: { click: async () => { d.close(); const p = await newProject(); if (p) pick(p.id); } } })));
    d.addEventListener('close', () => setTimeout(() => d.remove(), 0));
    document.body.append(d);
    d.showModal();
  }
  async function newProject() {
    const nm = await Modal.prompt('New project', { placeholder: 'Stoop Ronin', label: 'Its name (you can change it later)' });
    if (!nm?.trim()) return null;
    const p = P.create({ name: nm.trim() });
    setScope(p.id);
    return p;
  }
  // a chat that just appeared in the list: made here (it is open, or its AI had a project chosen) → its project now;
  // anything else (an arrival from the other computer, an import) → the keeper, after a grace
  let known = Array.isArray(H.chats) ? new Set(H.chats.map((c) => c.id)) : null; let lastList = H.chats;
  function watch() {
    if (H.chats === lastList || !Array.isArray(H.chats)) return;
    lastList = H.chats;
    if (!known) { known = new Set(H.chats.map((c) => c.id)); return; }
    const fresh = [];
    for (const c of H.chats) if (!known.has(c.id)) { known.add(c.id); fresh.push(c); }
    if (fresh.length) setTimeout(() => place(fresh), 1200); // (a project's own chat is added to it right after it is saved)
  }
  function place(list) {
    if (!ok) return;
    let n = 0;
    for (const c of list) {
      if (projectIdOf(c.id) || !H.chats.some((x) => x.id === c.id)) continue;
      const pend = pending.get(c.agentId);
      if (!pend && H.activeChat[c.agentId] !== c.id) continue;
      pending.delete(c.agentId);
      const director = Boolean(H.agent(c.agentId)?.dock);
      const pid = K.targetFor({ pending: pend && P.get(pend.pid) ? pend.pid : null, scope: current()?.id || null, sceneProject: director ? sceneProjectId() : null, director });
      const p = pid === K.EARLIER_ID ? earlier() : P.get(pid);
      if (!p) continue;
      P.add(p, 'chat', c.id, c.title || '');
      n += 1;
      if (K.isEarlier(p)) toast(`This chat is in “${p.name}” (no project was open). Right-click it › Move to project… to change.`, { timeout: 7000 });
    }
    if (n) refresh();
  }

  // (round 118, projsync118) chats the owner just imported (Import past chats…): the open project's at once (else
  // Earlier chats), with a note. ids: the imported chats' ids. → how many were placed
  async function imported(idList) {
    const set = new Set(idList || []);
    if (!set.size) return 0;
    if (!ok || !(await readOk())) return 0; // projects not read: the keeper places them later (never none)
    const list = (H.chats || []).filter((c) => set.has(c.id));
    const p = current();
    const placed = K.adopt(data(), list, p ? p.id : K.EARLIER_ID, { at: Date.now() });
    if (!placed.length) return 0;
    for (const id of placed) seenLost.delete(id);
    const to = p || data().list.find(K.isEarlier);
    P.changed(to, 'import');
    try { await P.flush(); } catch (err) { console.warn('projchats import', err); }
    refresh();
    toast(`${placed.length} imported chat${placed.length === 1 ? '' : 's'} went into “${to?.name || K.EARLIER_NAME}”${p ? ' (the open project)' : ' (no project was open)'}. Right-click a chat › Move to project… to change.`, { timeout: 8000 });
    return placed.length;
  }

  // ---------- the bar at the top of the chats list ----------
  let bar = null;
  function paintBar() {
    const head = document.querySelector('#panel .panel-head');
    if (!head) return;
    if (!bar) { bar = el('div', { class: 'pc-bar', attrs: { role: 'group', 'aria-label': 'The open project' } }); head.prepend(bar); }
    const p = current();
    if (!ok) {
      bar.replaceChildren(el('span', { class: 'pc-wait hint', text: tries ? 'Your projects couldn’t be read yet, so every chat shows for now. Trying again every minute.' : 'Reading your projects… (every chat shows meanwhile)' }));
      return;
    }
    const proj = el('button', { type: 'button', class: 'ghost small pc-project', title: 'The project whose chats are listed. Click: switch project, new project, its page', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); showMenu(b.left, b.bottom + 4, projectMenu()); } } },
      el('span', { class: 'pc-mark', text: p ? p.ident.glyph : '▣' }), el('span', { class: 'pc-name', text: p ? p.name : 'No project open' }), el('span', { class: 'pc-caret', text: '▾' }));
    if (p) proj.style.setProperty('--pj', p.ident.color);
    const add = el('button', { type: 'button', class: 'ghost small pc-new', text: '＋ New chat', title: p ? `A new chat in “${p.name}” (pick the AI)` : 'A new chat (asks which project first)', on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); newChatMenu(b.left, b.bottom + 4); } } });
    const row = el('div', { class: 'pc-row' }, proj, add);
    if (p) { bar.replaceChildren(row); return; }
    const ps = P.live().slice(0, 6);
    bar.replaceChildren(row, el('div', { class: 'pc-empty' },
      el('p', { class: 'hint', text: ps.length ? 'Pick a project to see its chats:' : 'No projects yet. Make one to start a chat in it.' }),
      ...ps.map((x) => el('button', { type: 'button', class: 'ghost small pc-pick', text: `${x.ident.glyph} ${x.name}`, on: { click: () => setScope(x.id) } })),
      el('button', { type: 'button', class: 'ghost small pc-pick', text: '＋ New project…', on: { click: () => newProject() } })));
  }
  function projectMenu() {
    const p = current();
    return [
      ...P.live().slice(0, 15).map((x) => ({ label: `${x.ident.glyph} ${x.name}`, checked: x === p, hint: C2(x), action: () => setScope(x.id) })),
      '-',
      { label: '＋ New project…', action: () => newProject() },
      p ? { label: '⌂ Open its page', action: () => P.openHome(p.id) } : null,
      { label: 'All projects…', action: () => P.openHome() },
    ].filter(Boolean);
  }
  const C2 = (p) => { const n = p.items.filter((x) => x.type === 'chat').length; return `${n} chat${n === 1 ? '' : 's'}`; };
  function newChatMenu(x, y) {
    const ais = H.agents().filter((a) => a.mode === 'native');
    const go = (a) => { const p = current(); if (p) newChatIn(p.id, a.id); else { if (a.dock) Tools.openDock?.(a.dock); else activate(a.id); Native.newChat(a.id); } };
    if (ais.length === 1) { go(ais[0]); return; }
    showMenu(x, y, ais.map((a) => ({ label: `With ${a.name}`, hint: a.dock ? 'in the Lab' : '', action: () => go(a) })));
  }

  // ---------- wiring ----------
  // the list: only the open project's chats (website chats aren't project chats: not listed). Projects' and makes'
  // own groups in the list are gone (one project at a time), and so is the “Group by project / Only one project” menu.
  function inScope(c) { if (!ok) return true; return Boolean(c && ids.has(c.id)); }
  Panel.hooks.scope?.push(inScope);
  for (const k of ['top', 'skip']) Panel.hooks[k]?.splice(0);
  { const m = Panel.hooks.menu; const i = m ? m.indexOf(P.panelMenu) : -1; if (i >= 0) m.splice(i, 1); }
  Panel.hooks.render.push(() => { watch(); follow(); });
  Native.hooks.newChat.push(onNewChat);
  addEventListener('hearth:projects', (e) => { if (e.detail?.why === 'sync') keepSoon(); else if (e.detail?.why === 'delete') keepSoon(500); /* (round 118, projsync118) its chats to Earlier chats now */ refresh(); });
  document.addEventListener('hearth:activate', () => setTimeout(follow, 0));
  setInterval(() => keepSoon(0), 2 * 60000);
  // an older “Only one project” view becomes the open project
  { const v = Panel.view?.(); if (v && String(v).startsWith('project:')) { scope = v.slice(8); store.set(SCOPE, scope); Panel.setView(null); } }
  migrate().then(() => Panel.render()).catch((err) => console.warn('projchats', err));

  return { current, setScope, newChatIn, ask, newProject, migrate, keep, readOk, imported, inScope, projectIdOf, pending, core: K, _ok: () => ok };
})();
