// Round 13 (speed): pick up where you left off. When Hearth opens, one small card (bottom left, by the keys button)
// offers what you were in the middle of: the last chat, the last Lab scene and where its sequence was, the last
// render, a flow waiting for you. One click goes back; × or 20 seconds and it's gone; nothing shows when there is
// nothing to pick up. /resume shows it again (or /resume chat | lab | render | flow goes straight there); /resume off
// stops the card. Where you are is noted when you switch screens and when the window hides or closes (localStorage,
// synchronous, so it survives a quit); nothing polls.
const SpeedResume = (() => {
  const KEY = 'speed.where';
  const DAY = 864e5;
  const prev = store.get(KEY, null); // what the last session left, read once before anything overwrites it
  const cur = { ...(prev || {}) };
  let lastNative = prev?.chat?.agentId || null;
  const on = () => store.get('speed.resume', true) !== false;
  const fmtT = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;
  const base = (p) => String(p || '').split(/[\\/]/).pop();

  // ---------- noting where you are ----------
  function labNow() {
    try {
      const api = typeof ThreeLab !== 'undefined' && ThreeLab.peek?.();
      if (!api) return null; // the Lab never opened this session: keep what the last one said
      const sceneId = ThreeLab.scenes?.currentId?.() || null;
      const seqOn = typeof ThreeSeq !== 'undefined' && Boolean(ThreeSeq.active);
      return { sceneId, name: api.state?.sketch || ThreeLab.scenes?.get?.(sceneId)?.name || '', seqOn, seqKey: seqOn ? ThreeSeq.key : (cur.lab?.seqKey || null), seqT: seqOn ? ThreeSeq.time : (cur.lab?.seqT || 0) };
    } catch { return null; }
  }
  function snapshot(touch = '') {
    try {
      cur.t = Date.now();
      cur.active = H.activeId || cur.active;
      if (H.agent(H.activeId)?.mode === 'native') lastNative = H.activeId;
      const chatId = lastNative && H.activeChat?.[lastNative];
      const chat = chatId && H.chats?.find((c) => c.id === chatId);
      if (chat && (cur.chat?.chatId !== chatId || touch === 'chat')) cur.chat = { agentId: lastNative, chatId, title: chat.title || 'Chat', t: Date.now() };
      const lab = labNow();
      if (lab?.sceneId) cur.lab = { ...lab, t: touch === 'lab' || cur.lab?.sceneId !== lab.sceneId ? Date.now() : (cur.lab?.t || Date.now()) };
      store.set(KEY, cur);
    } catch (err) { console.warn('resume', err); }
  }
  const soon = debounce(() => snapshot(), 600);
  document.addEventListener('hearth:activate', (e) => {
    const id = e.detail?.surfaceId || e.detail?.id || '';
    if (H.agent(e.detail?.id)?.mode === 'native') lastNative = e.detail.id;
    setTimeout(() => snapshot(id === 'tool:three' ? 'lab' : H.agent(e.detail?.id)?.mode === 'native' ? 'chat' : ''), 0);
  });
  addEventListener('hearth:sketch', () => setTimeout(() => snapshot('lab'), 0));
  document.addEventListener('visibilitychange', () => { if (document.hidden) snapshot(); });
  addEventListener('pagehide', () => snapshot());
  addEventListener('beforeunload', () => snapshot());
  // renders and recordings: the newest one
  const noteRender = (path, name = '') => { if (!path) return; cur.render = { path, name: name || base(path), t: Date.now() }; store.set(KEY, cur); };
  try { if (typeof ThreeSeq !== 'undefined' && ThreeSeq.on) { ThreeSeq.on('render', (d) => noteRender(d?.output)); ThreeSeq.on('mode', () => soon()); } } catch { /* the sequence is optional */ }
  document.addEventListener('hearth:recording', (e) => { if (e.detail && e.detail.recording === false) noteRender(e.detail.path); });
  document.addEventListener('hearth:chat-thing', (e) => { const t = e.detail?.thing; if (t?.k === 'video' && t.path) noteRender(t.path, t.name); });

  // ---------- what can be picked up ----------
  function items(from = prev) {
    const out = [];
    if (!from) return out;
    const now = Date.now();
    const c = from.chat;
    if (c && H.chats?.some((x) => x.id === c.chatId) && H.agent(c.agentId) && !(H.activeId === c.agentId && H.activeChat?.[c.agentId] === c.chatId)) {
      out.push({ id: 'chat', icon: '💬', label: c.title, hint: `${H.agent(c.agentId).name} · ${Speed.ago(c.t)}`, run: () => { activate(c.agentId); Native.open(c.agentId, c.chatId); } });
    }
    const l = from.lab;
    if (l?.sceneId && now - (l.t || 0) < 14 * DAY && !(H.surfaceIdFor?.(H.activeId) === 'tool:three' && ThreeLab.scenes?.currentId?.() === l.sceneId)) {
      out.push({ id: 'lab', icon: '◭', label: `${l.name || 'Lab scene'}${l.seqOn ? ` · ▤ ${fmtT(l.seqT)}` : ''}`, hint: `Three.js Lab · ${Speed.ago(l.t)}`, run: () => openLab(l) });
    }
    const r = from.render;
    if (r?.path && now - r.t < 3 * DAY) out.push({ id: 'render', icon: '🎬', label: r.name || base(r.path), hint: `last render · ${Speed.ago(r.t)}`, run: () => { if (typeof CaptureView !== 'undefined') CaptureView.open(r.path); else window.hub.fs?.open?.(r.path); } });
    try {
      const run = typeof Flows !== 'undefined' && Flows.active?.().filter((x) => x.status === 'waiting-you' || x.status === 'hung').sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
      if (run && now - (run.updated || 0) < 3 * DAY) out.push({ id: 'flow', icon: run.status === 'hung' ? '↻' : '⏸', label: run.flowName, hint: Flows.STATUS_LABEL?.[run.status] || run.status, run: () => FlowsUI.open({ runId: run.id }) });
    } catch { /* flows are optional */ }
    // the place you were last comes first
    const lead = String(from.active || '') === 'tool:three' ? 'lab' : H.agent(from.active)?.mode === 'native' ? 'chat' : null;
    return out.sort((a, b) => (b.id === lead) - (a.id === lead)).slice(0, 3);
  }
  async function openLab(l) {
    activate('tool:three');
    await ThreeLab.cmd();
    if (l.sceneId && ThreeLab.scenes?.currentId?.() !== l.sceneId) ThreeLab.scenes?.open?.(l.sceneId);
    if (l.seqOn && typeof ThreeSeq !== 'undefined') {
      await new Promise((r) => setTimeout(r, 400));
      try { if (l.seqKey && ThreeSeq.key !== l.seqKey) await ThreeSeq.open(l.seqKey); await ThreeSeq.enter(); ThreeSeq.seek(l.seqT || 0); } catch (err) { toast(err.message, { type: 'error' }); }
    }
  }

  // ---------- the card ----------
  let card = null; let hideT = 0;
  function close() { clearTimeout(hideT); if (!card) return; const c = card; card = null; c.classList.add('out'); setTimeout(() => c.remove(), 160); }
  function show(list, { title = 'Pick up where you left off', timeout = 20000 } = {}) {
    close();
    if (!list.length) return null;
    const row = (it) => el('button', { type: 'button', class: 'sr-row', title: it.hint, dataset: { resume: it.id }, on: { click: () => { close(); Promise.resolve().then(it.run).catch((err) => toast(err.message, { type: 'error' })); } } },
      el('span', { class: 'sr-ic', text: it.icon }), el('span', { class: 'sr-label', text: it.label }), el('span', { class: 'sr-hint', text: it.hint }));
    card = el('div', { class: 'speed-card speed-resume', role: 'dialog', 'aria-label': title, 'data-no-usage': '' },
      el('div', { class: 'sr-head' }, el('b', { text: title }), el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'sr-x', text: '×', title: 'Dismiss', on: { click: () => close() } })),
      ...list.map(row));
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Dismiss', action: () => close() }, { label: 'Don\'t show this card when Hearth opens', hint: '/resume off', action: () => { store.set('speed.resume', false); close(); toast('The card stays away (/resume on brings it back; /resume shows it once)', { timeout: 2600 }); } }]); });
    const arm = () => { clearTimeout(hideT); if (timeout) hideT = setTimeout(close, timeout); };
    card.addEventListener('mouseenter', () => clearTimeout(hideT));
    card.addEventListener('mouseleave', arm);
    document.body.append(card);
    arm();
    return card;
  }
  // when Hearth opens: once, quietly, only with something to pick up (a reload a moment ago on the same screen: nothing)
  function atStart() {
    if (!on() || !prev) return;
    if (Date.now() - (prev.t || 0) < 60e3 && prev.active === H.activeId) return;
    show(items(prev));
  }
  addEventListener('DOMContentLoaded', () => setTimeout(atStart, 2500));

  // ---------- /resume ----------
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('resume')) return;
    Commands.register({
      name: 'resume', area: 'App', args: '[chat | lab | render | flow | off | on]', keywords: 'pick up continue where left off last chat scene render restore session',
      desc: 'Pick up where you left off: the last chat, Lab scene (and its sequence position), render or a flow waiting for you; alone, the card',
      examples: ['/resume', '/resume lab', '/resume off'],
      complete: () => ['chat', 'lab', 'render', 'flow', 'off', 'on'].map((value) => ({ value })),
      run: async (args) => {
        const a = String(args || '').trim().toLowerCase();
        if (a === 'off') { store.set('speed.resume', false); close(); return 'The pick-up card no longer shows when Hearth opens (`/resume` still shows it).'; }
        if (a === 'on') { store.set('speed.resume', true); return 'The pick-up card shows when Hearth opens, when there is something to pick up.'; }
        snapshot();
        // this session's places, and what the last one left when this one hasn't been anywhere yet
        const merged = { ...(prev || {}), ...cur, chat: cur.chat || prev?.chat, lab: cur.lab || prev?.lab, render: cur.render || prev?.render };
        const list = items(merged);
        if (a) {
          const it = list.find((x) => x.id === a || (a === 'video' && x.id === 'render') || (a === 'scene' && x.id === 'lab'));
          if (!it) return `Nothing to pick up for “${a}” (or you're already there).`;
          await it.run();
          return null;
        }
        if (!list.length) return 'Nothing to pick up: you are where you left off.';
        show(list, { title: 'Pick up', timeout: 30000 });
        return null;
      },
    });
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register();
  queueMicrotask(() => { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Pick up where you left off…', () => Commands.exec('/resume', H.claudeAgent()?.id)); });

  return { items, show, close, snapshot, get prev() { return prev; }, get cur() { return cur; }, isOpen: () => Boolean(card) };
})();
