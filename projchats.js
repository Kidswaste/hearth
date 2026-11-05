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
//   - (round 120, projperf120) at the owner's scale (thousands of chats, 40+ projects): a plain draw of the list does
//     nothing here but two cheap looks (a new chat? a new chat or project in front?); the open project's ids, the
//     early-ids note (localStorage) and the bar are made again only when the projects store or the scope changed,
//     and written / repainted only when they differ; a chat's project is looked up in an index (made again after a
//     change); the keeper (after sync, every 2 minutes) first asks whether a sweep would change anything at all
//     (ProjChatsCore.due) and skips its careful read of the whole store and the sweep when not
//   - (round 121, listtidy121) Projects' and makes' old groups in the list (their top / skip / menu hooks, which made
//     every draw of 2,000 chats cost ½ s) are gone at their source, and panel.js has no such hooks any more: nothing
//     to take out here
//   - (round 124, chatfix124) a chat made here joins its project when it is first saved (Native's send hook), not 1.2 s
//     later: its row no longer vanishes from the list after its first message. place()'s rules are unchanged
//   - (round 125, askwhen125) the “Which project?” window opens only for the owner's own New chat (Native.newChat(id,
//     { byOwner: true })) with no project known; a chat code starts never asks (navigator.userActivation is not used)
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
  // (round 120, projperf120) chat id → its (first) project's id, as the scan of data().list gave: made again after any
  // change of the projects store (gen: its hearth:projects events; a new store object from sync) or a sweep here
  let gen = 0; let ix = null; let ixGen = -1; let ixData = null;
  function index() {
    const d = data();
    if (ix && ixGen === gen && ixData === d) return ix;
    ix = new Map();
    for (const p of d.list) for (const x of p.items) if (x && x.type === 'chat' && !ix.has(x.ref)) ix.set(x.ref, p.id);
    ixGen = gen; ixData = d;
    return ix;
  }
  const changedHere = () => { ix = null; }; // after ProjChatsCore changed the store in place (before its event)
  const projectIdOf = (chatId) => index().get(chatId) || null;
  async function save(why) { P.changed(null, why); await P.flush(); }
  function earlier() { const had = data().list.some(K.isEarlier); const e = K.ensureEarlier(data()); if (!had) P.changed(e, 'create'); return e; }

  // the migration, once per computer (its record: data/kv/projects.json, chatsMovedOut on each project it took a chat
  // out of, `was: 'no-project'` on each Earlier chats item it added)
  async function migrate() {
    if (!(await readOk())) { tries += 1; setTimeout(() => migrate().catch((err) => console.warn('projchats', err)), RETRY); paintBar(); return false; }
    ok = true;
    const first = !store.get(DONE, null);
    const r = K.sweep(data(), H.chats, first ? { at: Date.now() } : { at: Date.now(), ready: K.lostReady(data(), seenLost, Date.now(), GRACE) });
    if (r.changed) changedHere();
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
  // (round 120, projperf120) first, would a sweep change anything at all (ProjChatsCore.due: a chat in two projects, a
  // listed chat in none)? Not: no careful read (the whole store over IPC, ≈ 25 ms a tick on the heavy profile) and no
  // sweep, since nothing would be written. Else the careful read and the sweep, as before.
  async function keep() {
    if (!ok) return;
    const forgetPlaced = () => { for (const id of [...seenLost.keys()]) if (projectIdOf(id)) seenLost.delete(id); };
    if (!K.due(data(), H.chats || [])) { forgetPlaced(); return; }
    if (!(await readOk())) return; // (round 118, projsync118) a read failure is never “empty”: skipped, tried again later
    const r = K.sweep(data(), H.chats || [], { at: Date.now(), ready: K.lostReady(data(), seenLost, Date.now(), GRACE) });
    if (r.changed) changedHere();
    forgetPlaced();
    if (r.changed) { try { await save('chats116'); } catch (err) { console.warn('projchats keep', err); } }
  }

  // ---------- the open project ----------
  const current = () => (scope && P.get(scope)) || null;
  let savedScope = scope; // (round 120, projperf120) what localStorage holds: written only when it changes
  function setScope(pid, { quiet = false } = {}) {
    const p = pid ? P.get(pid) : null;
    scope = p ? p.id : null;
    if (scope !== savedScope) { store.set(SCOPE, scope); savedScope = scope; }
    refresh();
    if (!quiet) (Panel.soon || Panel.render)();
  }
  // the open project's chat ids (the list's filter), the early-ids note for the next start, the bar. Called when the
  // projects store or the scope changed (never by a plain draw). (round 120, projperf120) the note is written only when
  // the ids differ (≈ 40 KB of JSON for Earlier chats' 1,500 chats), the bar repainted only when what it shows differs
  let earlyKey = null;
  function refresh() {
    const p = current();
    const next = new Set(p ? p.items.filter((x) => x.type === 'chat').map((x) => x.ref) : []);
    const same = earlyKey === (p ? p.id : '') && next.size === ids.size && [...next].every((id) => ids.has(id));
    ids = next;
    if (!same) {
      earlyKey = p ? p.id : '';
      try { store.set(EARLY, { ids: [...ids].slice(0, 3000), at: Date.now() }); } catch { /* a convenience */ }
    }
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
  // (round 125, askwhen125) opts.byOwner: the owner asked for this new chat (Native.newChat's callers say so: the bar's,
  // an AI's and the chat's own ＋, Ctrl/⌘+N, Home's ⋯, the tray, Ctrl/⌘+K, /new). The “Which project?” window opens
  // only then, and only when no project is known. It used to guess from navigator.userActivation, which stays on for
  // seconds after any click: a chat code started just after an unrelated click (a tray card's Deny, a Lab button) asked
  function onNewChat(agentId, opts) {
    const was = pending.get(agentId);
    if (was && Date.now() - was.at < 3000) return; // chosen a moment ago (the bar's ＋ New chat, the question)
    const a = H.agent(agentId);
    const director = Boolean(a?.dock);
    // (round 116, labchat92) a chat started from the Lab ("Ask Claude about this layer", a linked chat) belongs to the
    // scene's project, whichever AI. A project known (the scene's, the open one): that one, never a question
    const pid = director ? sceneProjectId() || current()?.id : current()?.id || sceneProjectId();
    if (pid) { pending.set(agentId, { pid, at: Date.now() }); return; }
    if (!ok) return; // projects not read yet: the chat goes to Earlier chats when it is made (never none)
    if (!opts?.byOwner) return; // started by code: placed by place() (Earlier chats + a note), no window takes the keyboard
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
    return n;
  }
  // (round 124, chatfix124) a chat made here goes into its project the moment it is first saved (its first message:
  // Native.send makes it, saves it, then calls this, before the list is drawn again), with the project known from
  // onNewChat / newChatIn (else the open project, else Earlier chats: place()'s rules). It used to wait for place(),
  // 1.2 s after watch() saw it, and the list (open project's chats only) hid its row meanwhile. A chat another part of
  // Hearth adds to a project of its own (a workspace's, a jam's) is moved there by that P.add as before.
  function onSend(agentId, chat) {
    if (!ok || !chat?.id || projectIdOf(chat.id)) return;
    if (place([chat]) && known) known.add(chat.id);
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
  let barKey = null; // (round 120, projperf120) what the bar shows: repainted only when it changes
  const barKeyOf = (p) => (!ok ? `wait|${tries ? 1 : 0}` : p ? `p|${p.id}|${p.name}|${p.ident.glyph}|${p.ident.color}` : `none|${P.live().slice(0, 6).map((x) => `${x.id}\u0001${x.ident.glyph}\u0001${x.name}`).join('\u0002')}`);
  function paintBar() {
    const head = document.querySelector('#panel .panel-head');
    if (!head) return;
    if (!bar) { bar = el('div', { class: 'pc-bar', attrs: { role: 'group', 'aria-label': 'The open project' } }); head.prepend(bar); }
    const p = current();
    const key = barKeyOf(p);
    if (key === barKey) return;
    barKey = key;
    if (!ok) {
      bar.replaceChildren(el('span', { class: 'pc-wait hint', text: tries ? 'Your projects couldn’t be read yet, so every chat shows for now. Trying again every minute.' : 'Reading your projects… (every chat shows meanwhile)' }));
      return;
    }
    // (round 128, projmenu128) an open project: its one project menu (projmenu.js; Other projects › switches); none: the switcher
    const proj = el('button', { type: 'button', class: 'ghost small pc-project', title: p ? 'This project’s menu: open, make, look, share, settings, archive (Ctrl+Shift+O)' : 'Pick a project, or make a new one', attrs: { 'aria-haspopup': 'menu' }, on: { click: (e) => { const b = e.currentTarget.getBoundingClientRect(); const now = current(); if (now && P.openMenu) P.openMenu(now, b.left, b.bottom + 4, 'bar'); else showMenu(b.left, b.bottom + 4, projectMenu()); } } },
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
    const def = current()?.prefs?.agentId; // (round 128, projmenu128) the project's Default AI first
    const ais = H.agents().filter((a) => a.mode === 'native').sort((a, b) => (b.id === def) - (a.id === def));
    const go = (a) => { const p = current(); if (p) newChatIn(p.id, a.id); else { if (a.dock) Tools.openDock?.(a.dock); else activate(a.id); Native.newChat(a.id, { byOwner: true }); } };
    if (ais.length === 1) { go(ais[0]); return; }
    showMenu(x, y, ais.map((a) => ({ label: `With ${a.name}`, hint: [a.id === def ? 'default' : '', a.dock ? 'in the Lab' : ''].filter(Boolean).join(' · '), action: () => go(a) })));
  }

  // ---------- wiring ----------
  // the list: only the open project's chats (website chats aren't project chats: not listed)
  function inScope(c) { if (!ok) return true; return Boolean(c && ids.has(c.id)); }
  Panel.hooks.scope?.push(inScope);
  Panel.hooks.render.push(() => { watch(); follow(); });
  Native.hooks.newChat.push(onNewChat);
  Native.hooks.send?.push(onSend); // (round 124, chatfix124) (the unit tests' stand-in Native has no send hooks)
  addEventListener('hearth:projects', (e) => { gen += 1; if (e.detail?.why === 'sync') keepSoon(); else if (e.detail?.why === 'delete') keepSoon(500); /* (round 118, projsync118) its chats to Earlier chats now */ refresh(); });
  document.addEventListener('hearth:activate', () => setTimeout(follow, 0));
  setInterval(() => keepSoon(0), 2 * 60000);
  // an older “Only one project” view becomes the open project
  { const v = Panel.view?.(); if (v && String(v).startsWith('project:')) { scope = v.slice(8); store.set(SCOPE, scope); Panel.setView(null); } }
  migrate().then(() => Panel.render()).catch((err) => console.warn('projchats', err));

  return { current, setScope, newChatIn, ask, newProject, migrate, keep, readOk, imported, inScope, projectIdOf, pending, core: K, _ok: () => ok };
})();
