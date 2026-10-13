// "What can I do here?" (round 31, quickstart): one calm card per window (a chat, the Lab, the board) with 3–5 things
// worth trying there right now, each one click that opens the feature (never a command to type). Picked locally
// (quickstart-core.js) from what this build has, what you have not used yet (the click log in usage.js, the commands
// you ran, the missions in this chat, what you already tried from the card) and what's on screen (a song loaded →
// "React to the drums", an empty scene → "Describe it", a board with pictures → "Find images like this", a long chat
// → "What did we decide?"). Token-free: nothing is sent, nothing is added to any prompt; a feature that spends asks
// first, as it always does. The ways in (⋯ menus, the first time a window opens) are in quickstart-hooks.js; this file
// loads on first use (lazy group "quickstartui").
const Quickstart = (() => {
  const Q = QuickstartCore;
  const ST = 'quickstart';
  const state = () => ({ seen: {}, gone: {}, tried: [], hide: [], ...store.get(ST, {}) });
  const put = (patch) => store.set(ST, { ...state(), ...patch });
  const err = (e) => toast(String(e?.message || e), { type: 'error' });

  // ---------- what this build has (a lazy group's global is never touched before its group is in) ----------
  const groupOf = (name) => (typeof LazyData !== 'undefined' ? LazyData.GROUPS.find((g) => (g.globals || []).includes(name))?.name : null);
  const G = {
    RecallHooks: () => (typeof RecallHooks !== 'undefined' ? RecallHooks : null), ChatFresh: () => (typeof ChatFresh !== 'undefined' ? ChatFresh : null),
    Commands: () => (typeof Commands !== 'undefined' ? Commands : null), Missions: () => (typeof Missions !== 'undefined' ? Missions : null),
    Options: () => (typeof Options !== 'undefined' ? Options : null), BoardDrawer: () => (typeof BoardDrawer !== 'undefined' ? BoardDrawer : null),
    Activity: () => (typeof Activity !== 'undefined' ? Activity : null), Voice: () => (typeof Voice !== 'undefined' ? Voice : null),
    Budget: () => (typeof Budget !== 'undefined' ? Budget : null), LabInstantHook: () => (typeof LabInstantHook !== 'undefined' ? LabInstantHook : null),
    LabGalleryHook: () => (typeof LabGalleryHook !== 'undefined' ? LabGalleryHook : null), ThreeLab: () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null),
    LabEasy: () => (typeof LabEasy !== 'undefined' ? LabEasy : null), AutoEdit: () => (typeof AutoEdit !== 'undefined' ? AutoEdit : null),
    AutoPolish: () => (typeof AutoPolish !== 'undefined' ? AutoPolish : null), LookMatch: () => (typeof LookMatch !== 'undefined' ? LookMatch : null),
    ThreeHistoryUI: () => (typeof ThreeHistoryUI !== 'undefined' ? ThreeHistoryUI : null), LabPacksHook: () => (typeof LabPacksHook !== 'undefined' ? LabPacksHook : null),
    Board: () => (typeof Board !== 'undefined' ? Board : null), PinboardHook: () => (typeof PinboardHook !== 'undefined' ? PinboardHook : null),
  };
  const lazyState = (grp) => (typeof Lazy !== 'undefined' ? Lazy.state().find((x) => x.name === grp)?.state : null);
  function has(name) {
    const grp = groupOf(name);
    if (grp && lazyState(grp) && lazyState(grp) !== 'loaded') return lazyState(grp) !== 'failed'; // in this build, not in yet
    return Boolean(G[name]?.());
  }
  async function get(name) {
    const grp = groupOf(name);
    if (grp && typeof Lazy !== 'undefined' && !Lazy.loaded(grp)) await Lazy.load(grp);
    const v = G[name]?.();
    if (!v) throw new Error('That isn\'t available here');
    return v;
  }

  // ---------- what's on screen ----------
  const director = () => H.agents().find((a) => a.dock === 'three' && a.mode === 'native') || null;
  const isIn = (grp) => (typeof Lazy === 'undefined' ? true : Lazy.isIn(grp));
  const PICS = new Set(['image', 'gif', 'video', 'web']);
  function boardNow() {
    if (!isIn('board') || typeof Board === 'undefined') return null;
    try { return Board.current() || null; } catch { return null; }
  }
  async function boardsWithItems() {
    const b = boardNow();
    if (b) { try { return Board.boards().filter((x) => (x.count || 0) > 0).length; } catch { /* below */ } }
    try { const idx = await window.hub.kvGet('boards', null); return (idx?.list || []).filter((x) => (x.count || 0) > 0).length; } catch { return 0; }
  }
  function labNow() {
    const out = { song: false, layers: 0, empty: true };
    if (!isIn('lab') || typeof ThreeLab === 'undefined') return out;
    try {
      const cmd = ThreeLab.peek();
      if (!cmd) return out;
      out.song = Boolean(cmd.state.song);
      out.layers = cmd.layers().length;
      // empty: no layer, or the one plain "Shape" a new scene starts from, untouched (as Describe it's chip reads it)
      const d = ThreeLab.director;
      const Ls = d?.layers?.().layers || [];
      const t = typeof ThreeLayers !== 'undefined' ? ThreeLayers.TEMPLATES.find((x) => x.id === 'empty') : null;
      out.empty = !Ls.length || (Ls.length === 1 && Boolean(t) && d.codeOf(Ls[0].id)?.code?.trim() === t.code.trim());
    } catch { /* the Lab still coming up: as a new scene */ }
    return out;
  }
  async function context(place, agentId) {
    const b = boardNow();
    const pics = b ? (b.items || []).filter((i) => PICS.has(i.type)).length : 0;
    if (place === 'chat') {
      const chat = agentId ? Native.current(agentId) : null;
      return { agentId, messages: chat?.messages?.length || 0, partner: Boolean(Native.partnerOf?.(H.agent(agentId))), busy: Boolean(chat && Native.isBusy(chat.id)), boards: await boardsWithItems(), chats: (H.chats || []).length };
    }
    if (place === 'lab') return { ...labNow(), agentId: director()?.id || null, director: Boolean(director()), boardPictures: pics };
    return { items: b ? (b.items || []).length : 0, pictures: pics, linked: Boolean(b?.chats?.length), director: Boolean(director()) };
  }
  // what you already used: commands run, the buttons in the click log, the missions in this chat, the card's own picks
  function signals(place, agentId) {
    const st = state();
    let counts = {}; let usage = []; const missions = [];
    try { counts = Commands.counts() || {}; } catch { /* none */ }
    try { usage = Object.entries(Usage.data?.items || {}).filter(([, v]) => v.n > 0).map(([k]) => k); } catch { /* none */ }
    const id = place === 'lab' ? director()?.id : agentId;
    try { for (const m of (id && Native.current(id)?.messages) || []) if (m.mission && !missions.includes(m.mission)) missions.push(m.mission); } catch { /* none */ }
    return { counts, usage, missions, tried: st.tried };
  }
  async function picks(place, agentId, n = 5) {
    const c = await context(place, agentId);
    return { c, list: Q.pick(place, c, { has, sig: signals(place, agentId), hide: state().hide, n }) };
  }

  // ---------- the actions: each opens its feature ----------
  const view = (id) => (typeof Native !== 'undefined' ? Native.view(id) : null);
  async function mission(agentId, id) {
    const M = await get('Missions');
    if (!agentId) throw new Error('This needs the Three Director: ⋯ › Director › Make the Three Director');
    const m = M.shown(agentId).find((x) => x.id === id);
    if (!m) throw new Error('That mission isn\'t here');
    const no = M.why(agentId, m);
    if (no) throw new Error(no);
    M.set(agentId, id);
    view(agentId)?.input?.focus();
    toast(`Your next message: ${m.icon} ${m.label}. Write it, then send.`, { timeout: 3200 });
  }
  // a menu item from another feature: its action, or its submenu right where the card was
  function doItem(it, at) {
    if (!it) throw new Error('That isn\'t available here');
    if (it.items) { const list = typeof it.items === 'function' ? it.items() : it.items; showMenu(at?.x ?? innerWidth / 2, at?.y ?? 120, list); return; }
    return it.action?.();
  }
  const ACTIONS = {
    'chat-recall': async (c) => (await get('RecallHooks')).open('', { agentId: c.agentId }),
    'chat-fresh': async (c) => (await get('ChatFresh')).start(c.agentId),
    'chat-find': (c) => Commands.exec('/find', c.agentId),
    'chat-plan': (c) => mission(c.agentId, 'plan'),
    'chat-duo': (c) => mission(c.agentId, 'duo'),
    'chat-missions': async (c) => {
      const b = document.querySelector(`.surface[data-id="${CSS.escape(c.agentId)}"] .ms-btn`);
      if (b) { b.click(); return; }
      (await get('Options')).open({ agentId: c.agentId });
    },
    'chat-setup': async (c) => (await get('Options')).open({ agentId: c.agentId }),
    'chat-board': async () => (await get('BoardDrawer')).toggle(true),
    'chat-activity': async () => (await get('Activity')).open(),
    'chat-voice': async (c) => (await get('Voice')).start({ agentId: c.agentId }),
    'chat-spending': async () => (await get('Budget')).glance(),
    'lab-describe': async () => (await get('LabInstantHook')).open(),
    'lab-gallery': async () => (await get('LabGalleryHook')).open(),
    'lab-song': async () => (await get('ThreeLab')).act('music'),
    'lab-drums': (c) => mission(c.agentId, 'lab-stems'),
    'lab-react': async () => (await get('LabEasy')).run('/make-it-react', { title: 'React to the music', undo: '/make-it-react undo' }),
    'lab-musicvideo': async (c, at) => doItem((await get('AutoEdit')).item(), at),
    'lab-polish': async (c, at) => doItem((await get('AutoPolish')).item(), at),
    'lab-lookmatch': async (c, at) => doItem((await get('LookMatch')).item(), at),
    'lab-variations': (c) => mission(c.agentId, 'lab-variations'),
    'lab-history': async () => (await get('ThreeHistoryUI')).open(),
    'lab-vertical': (c) => mission(c.agentId, 'lab-vertical'),
    'lab-share': async (c, at) => doItem((await get('LabPacksHook')).moreItem(), at),
    'board-add': async () => (await get('Board'))._.pickFiles(),
    'board-template': async (c, at) => doItem((await get('Board'))._.boardItems().find((x) => x?.label === 'New from a template'), at),
    'board-pins': async () => (await get('PinboardHook')).open({}),
    'board-vibe': async () => {
      const D = await get('BoardDrawer');
      Modal.alert('The board\'s vibe', String(D.vibeText({ board: Board.current(), rule: false }) || 'Nothing to read yet.').replace(/\*\*|`/g, ''));
    },
    'board-tolab': async () => (await get('Board'))._.toLab(),
    'board-link': async (c, at) => doItem((await get('Board'))._.boardItems().find((x) => x?.label === 'Link to a chat'), at),
    'board-present': async () => (await get('Board'))._.present?.(),
  };
  async function go(entry, c, at) {
    const st = state();
    if (!st.tried.includes(entry.id)) put({ tried: [...st.tried, entry.id].slice(-200) }); // tried: off the card for good
    try { await ACTIONS[entry.run || entry.id]?.(c, at); } catch (e) { err(e); }
  }

  // ---------- the card (one at a time, in the window it is about) ----------
  let card = null; // { root, place, agentId, sid }
  const sidNow = () => (H.activeId ? H.surfaceIdFor?.(H.activeId) : '') || '';
  function close() {
    if (!card) return;
    const r = card.root; card = null;
    document.body.classList.remove('qs-on-chat', 'qs-on-lab', 'qs-on-board');
    r.classList.add('qs-out');
    setTimeout(() => r.remove(), 140);
  }
  // × = gone for good: never shows by itself again in this kind of window (⋯ › What can I do here? still opens it)
  function dismiss() { if (!card) return; const g = state().gone; put({ gone: { ...g, [card.place]: true } }); close(); }
  function notForMe(id) { const h = state().hide; if (!h.includes(id)) put({ hide: [...h, id] }); }
  const hostFor = (sid) => document.querySelector(`#surfaces > .surface[data-id="${CSS.escape(sid)}"]`) || document.querySelector('#surfaces > .surface.active');
  async function open(place, { agentId = null, auto = false } = {}) {
    place ||= Q.placeOf(H.activeId, H.agent?.(H.activeId));
    if (!Q.PLACES.includes(place)) { toast('Open a chat, the Lab or the board: the card shows what to try there.', { timeout: 3000 }); return null; }
    if (place === 'chat') agentId ||= H.agent?.(H.activeId)?.mode === 'native' ? H.activeId : null;
    const { c, list } = await picks(place, agentId);
    if (auto && list.length < 3) return null; // by itself only when it has something worth it
    close();
    const sid = sidNow();
    const host = hostFor(sid);
    if (!host) return null;
    const rows = list.map((e) => {
      const b = el('button', { type: 'button', class: `qs-row${e.fit ? ' qs-fit' : ''}`, dataset: { qs: e.id }, title: e.why },
        el('span', { class: 'qs-ic', text: e.icon }),
        el('span', { class: 'qs-text' }, el('b', { text: e.label }), el('span', { class: 'qs-why', text: e.why })));
      b.addEventListener('click', () => { const r = b.getBoundingClientRect(); close(); go(e, c, { x: r.left, y: r.bottom + 2 }); });
      b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); showMenu(ev.clientX, ev.clientY, [{ label: 'Not for me', action: () => { notForMe(e.id); b.remove(); if (!card?.root.querySelector('.qs-row')) close(); } }]); });
      return b;
    });
    const root = el('div', { class: 'qs-card', role: 'dialog', 'aria-label': 'What can I do here?', 'data-no-usage': '', dataset: { place } },
      el('div', { class: 'qs-head' }, el('b', { text: '✦ What can I do here?' }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'qs-x', text: '×', title: auto ? 'Got it (it won\'t show by itself again; ⋯ › What can I do here? brings it back)' : 'Close', on: { click: () => (auto ? dismiss() : close()) } })),
      ...(rows.length ? rows : [el('p', { class: 'qs-done', text: `You have tried everything worth trying in ${Q.NAMES[place]}. ✓` })]),
      el('div', { class: 'qs-foot', text: auto ? 'Shown once · ⋯ › What can I do here? any time' : 'Right-click one: not for me' }));
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); auto ? dismiss() : close(); } });
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(root);
    card = { root, place, agentId, sid, auto };
    document.body.classList.add(`qs-on-${place}`); // the window's own first-run chips step aside while the card is up
    if (auto) { const s = state().seen; put({ seen: { ...s, [place]: Date.now() } }); }
    return root;
  }
  // another window on screen: the card goes (it was about the other one)
  addEventListener('hearth:view', () => setTimeout(() => { if (card && card.sid !== sidNow()) close(); }, 0));
  // the card's choice as text (/what-can-i-do in a chat, tests)
  async function list(place, agentId) { return (await picks(place, agentId)).list.map((e) => ({ id: e.id, label: e.label, why: e.why, fit: e.fit })); }
  function reset() { store.set(ST, {}); }
  return { open, close, dismiss, list, picks, context, signals, has, notForMe, reset, state, ACTIONS, get card() { return card; } };
})();
