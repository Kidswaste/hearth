// (round 114, directorswitch) The Three Director's AI switcher: "◆ Claude ▾" at the left of the dock's strip.
// The owner asked to "switch AIs in the three director so i can go from one chat to the other". What already existed
// and is reused here (nothing new underneath):
//   · a chat with its own engine (`chat.engine`, astra.js beforeSend → engines.js options.engine, round 10's comp parts):
//     a Claude chat and an Astra chat of the same director run side by side, each keeps its own session;
//   · chats linked to a Lab scene (chat-scenes.js; a second chat on the same scene is linked as a guest, round 72), so
//     the new chat's Lab calls reach this scene, on screen or backstage, and its draft starts with labchat92's scene line;
//   · the hand-over brief (handoff.js startCopy, the path of /handoff and "Ask Astra instead"): only on "Continue this
//     conversation", and it rides in the first message the owner sends there;
//   · sign-in (round 111, EngineHealth.signIn): a signed-out or missing AI says so in the dock, in plain words.
// The menu lists each AI (Claude, Astra, and other agents with the Lab's tools) with its recent chats about this scene,
// each marked "new reply" / "working…". One click on an AI opens its latest chat about this scene; with none yet it asks
// "Continue this conversation" or "Fresh chat". Alt+Shift+A goes to the next AI the same way. Nothing is sent by itself.
// The in-place switch (/director-engine, the ⚇ menu: same chat, the task state handed over) is unchanged.
// Lazy: loads with director-dock.js (group directordock).
const DirectorSwitch = (() => {
  const ENGINES = ['claude', 'codex'];
  const NAME = { claude: 'Claude', codex: 'Astra' };
  const LABEL = { claude: 'Claude Code', codex: 'Codex' };
  const MARK = { claude: '✳', codex: '✧' };
  const RECENT = 4; // chats per AI in the menu
  const stats = { opened: 0, fresh: 0, continued: 0, signIn: 0, keys: 0 };
  const director = () => (typeof Tools !== 'undefined' && Tools.dockedAgent?.('three')) || H.agents().find((a) => a.mode === 'native' && a.dock === 'three') || null;
  const CS = () => (typeof ChatScenes !== 'undefined' ? ChatScenes : null);
  const links = () => CS()?.data?.()?.links || {};
  const fail = (err) => toast(typeof calmError === 'function' ? calmError(err) : String(err?.message || err), { type: 'error' });
  const ago = (t) => (typeof timeAgo === 'function' && t ? timeAgo(t) : '');
  const summary = (id) => (id && H.chats.find((c) => c.id === id)) || null;
  // the AI a chat of this director talks to: its own engine (a chat made here for the other AI), else the director's
  const engineOf = (a, chatId) => { const open = Native.chatOf?.(a.id); return (chatId && open?.id === chatId ? open.engine : null) || summary(chatId)?.engine || a.engine || 'claude'; };
  const current = (a) => H.activeChat[a.id] || null;
  const labIn = () => (!window.Lazy?.isIn || Lazy.isIn('lab')) && typeof ThreeLab !== 'undefined' && ThreeLab.scenes;
  // the scene this conversation is about: the open chat's own (owner or guest), else the one on screen
  function sceneOf(a) {
    const L = links()[current(a)];
    if (L?.sketch && (!labIn() || ThreeLab.scenes.get(L.sketch))) return L.sketch;
    return labIn() ? ThreeLab.scenes.currentId?.() || null : null;
  }
  const sceneName = (id) => (id && labIn() ? ThreeLab.scenes.get(id)?.name : '') || '';
  // this director's chats about a scene with one AI, newest first
  function chatsFor(a, sceneId, engine) {
    if (!sceneId) return [];
    const L = links();
    return H.chats.filter((c) => c.agentId === a.id && L[c.id]?.sketch === sceneId && engineOf(a, c.id) === engine).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
  }
  // other agents that have the Lab's tools (a plain Claude / Astra with threeTools): they work in their own chat view
  const labAgents = () => H.agents().filter((x) => x.mode === 'native' && !x.dock && x.threeTools && x.enabled !== false);
  const guestChats = (x, sceneId) => (sceneId ? H.chats.filter((c) => c.agentId === x.id && links()[c.id]?.sketch === sceneId).sort((p, q) => (q.updatedAt || 0) - (p.updatedAt || 0)) : []);
  // the Lab on screen (H.activeId is the director's own id while its docked chat has the focus)
  const inLab = () => H.activeId === 'tool:three' || H.surfaceIdFor?.(H.activeId) === 'tool:three';
  const busy = (id) => Boolean(id && Native.isBusy?.(id));
  const unread = (id) => Boolean(id && H.unreadChats?.has(id));
  const markText = (id) => [busy(id) ? '◌ working…' : '', unread(id) ? '● new reply' : ''].filter(Boolean).join(' · ');

  // ---------- can that AI answer? (round 111's sign-in) ----------
  // → 'ok' | 'signedout' | 'missing' | null (not known: go ahead, a failed reply still gets its Sign in card)
  async function health(engine) {
    try { if (window.Lazy && typeof EngineHealth === 'undefined') await Lazy.load('enginehealth'); } catch { /* not known */ }
    if (typeof EngineHealth === 'undefined') return null;
    let r = EngineHealth.report?.()?.[engine];
    if (!r) r = (await EngineHealth.check({ engines: [engine] }).catch(() => null))?.[engine] || null;
    if (!r) return null;
    return !r.found ? 'missing' : r.signedIn === false ? 'signedout' : 'ok';
  }
  const cachedHealth = (engine) => { const r = typeof EngineHealth !== 'undefined' ? EngineHealth.report?.()?.[engine] : null; return !r ? null : !r.found ? 'missing' : r.signedIn === false ? 'signedout' : 'ok'; };
  // the owner picked an AI that can't answer: the sign-in path, and its outcome said in the dock (never silent)
  async function signInFirst(a, engine, st) {
    stats.signIn += 1;
    const what = st === 'missing' ? `${NAME[engine]} (${LABEL[engine]}) isn't installed on this computer` : `${NAME[engine]} (${LABEL[engine]}) isn't signed in`;
    let r;
    try { r = await EngineHealth.signIn(engine, { agentId: a.id }); } catch (err) { r = { ok: false, how: 'failed', text: typeof calmError === 'function' ? calmError(err) : String(err?.message || err) }; }
    const text = `**${what}**, so the director stayed with ${NAME[engineOf(a, current(a))]}. ${r?.text || 'Ctrl+K → doctor shows what Hearth found.'} Then pick ${NAME[engine]} again in the AI switcher (◆ ▾ at the top of the chat).`;
    Native.note(a.id, text, { id: 'directorswitch', actions: [{ label: 'Open the doctor', run: () => Commands.exec('/doctor', a.id) }] });
    toast(`${what}: see the note in the director's chat`, { type: r?.ok ? undefined : 'error', timeout: 6000 });
    return { switched: false, signIn: r, status: st };
  }

  // ---------- going there ----------
  function show(a) { try { Tools.openDock?.('three'); DirectorDock.setCollapsed?.(DirectorDock.surface('three'), false); } catch { /* the dock shows anyway */ } }
  function openChat(a, chatId) {
    if (current(a) !== chatId) { Native.open(a.id, chatId); stats.opened += 1; }
    show(a);
    paintSoon();
    return { switched: true, chatId };
  }
  // a chat of this director with that AI, linked to the scene (owner when nobody owns it, else a guest like a second
  // chat on one scene); carry: the current chat's brief rides in its first message (handoff.js), on that click only
  async function start(a, engine, { carry = false } = {}) {
    const st = await health(engine);
    if (st === 'missing' || st === 'signedout') return signInFirst(a, engine, st);
    if (window.Lazy && !labIn()) await Lazy.load('lab').catch(() => {});
    await CS()?.ready?.();
    const sceneId = sceneOf(a);
    const fromId = current(a);
    const fromEngine = engineOf(a, fromId);
    // an empty chat already made for this AI and scene is used again (no pile of empty chats)
    const empty = !carry && chatsFor(a, sceneId, engine).find((c) => c.id !== fromId && c.title === titleFor(sceneId, engine));
    if (empty) { const ch = await Native.load(empty.id).catch(() => null); if (ch && !ch.messages?.length) return openChat(a, empty.id); }
    const now = Date.now();
    const chat = { id: `${a.id}-${now.toString(36)}`, agentId: a.id, title: titleFor(sceneId, engine), createdAt: now, updatedAt: now, session: {}, messages: [] };
    if (engine !== a.engine) chat.engine = engine; // the director's own engine stays the default (as round 10's parts)
    if (carry) {
      const origin = fromId ? await (Native.loadWhole || Native.load)(fromId).catch(() => null) : null;
      if (!origin?.messages?.some((m) => m.role === 'user' || m.role === 'assistant')) throw new Error('This chat has nothing to carry over yet: pick "Fresh chat".');
      if (window.Lazy && typeof Handoff === 'undefined') await Lazy.load('handoff');
      const twin = H.agents().find((x) => x.mode === 'native' && x.engine === engine && !x.dock); // its lightest model writes a weak brief's summary (handoff.js)
      const from = { ...a, name: NAME[fromEngine], engine: fromEngine };
      const to = { ...a, id: twin?.id || a.id, name: NAME[engine], engine, ...(engine === 'codex' ? { hubTools: true } : {}) };
      chat.title = `${origin.title || 'Chat'} (→ ${NAME[engine]})`;
      chat.continuedFrom = NAME[fromEngine];
      chat.handoffFrom = origin.id;
      await Handoff.startCopy(chat, origin, origin.messages.length, { from, to, title: `Continued from ${NAME[fromEngine]}${origin.title ? ` ("${origin.title}")` : ''}` });
      stats.continued += 1;
    } else stats.fresh += 1;
    Native.adopt(chat, { openIt: false });
    if (sceneId && CS()) {
      const owner = CS().ownerOf(sceneId);
      if (!owner) CS().link(chat.id, sceneId, { rename: false }); else CS().linkGuest(chat.id, sceneId, { why: 'switch' });
    }
    openChat(a, chat.id);
    if (carry) Handoff.show(a.id, chat);
    // labchat92's one line about the scene, in the chat box (the owner sends it, or not)
    const line = sceneId && typeof LabChatLink !== 'undefined' ? LabChatLink.sceneLine(sceneId) : '';
    if (line && Native.setDraft) Native.setDraft(a.id, `${line}\n`);
    toast(carry ? `${NAME[engine]} takes this conversation over in a new chat: your next message carries a short brief` : `A fresh ${NAME[engine]} chat about ${sceneName(sceneId) ? `"${sceneName(sceneId)}"` : 'this scene'}`, { timeout: 3500 });
    return { switched: true, chatId: chat.id, carried: carry };
  }
  const titleFor = (sceneId, engine) => `${sceneName(sceneId) || 'Scene'} · ${NAME[engine]}`;

  // One click on an AI: its latest chat about this scene; none yet → the plain choice (Continue / Fresh)
  async function pick(engine, { anchor = null, choice = null } = {}) {
    const a = director();
    if (!a) throw new Error('No Three Director yet: /director-setup docks one in the Lab.');
    const now = engineOf(a, current(a));
    if (engine === now && !choice) { show(a); return { switched: false, same: true }; }
    if (choice) return choice === 'continue' ? start(a, engine, { carry: true }) : start(a, engine);
    const st = await health(engine);
    if (st === 'missing' || st === 'signedout') return signInFirst(a, engine, st);
    if (window.Lazy && !labIn()) await Lazy.load('lab').catch(() => {});
    await CS()?.ready?.();
    const there = chatsFor(a, sceneOf(a), engine).find((c) => c.id !== current(a));
    if (there) return openChat(a, there.id);
    const cur = Native.chatOf(a.id);
    if (!cur?.messages?.some((m) => m.role === 'user' || m.role === 'assistant')) return start(a, engine);
    const at = anchor || pill();
    const r = at?.getBoundingClientRect?.() || { left: innerWidth / 2 - 120, bottom: innerHeight / 3 };
    showMenu(r.left, r.bottom + 4, [
      `Switch to ${NAME[engine]}`,
      { label: 'Continue this conversation', hint: 'with a short brief', tip: `${NAME[engine]} gets a short brief of this chat (the goal, decisions, files, the last exchange) with your next message. This chat stays as it is.`, action: () => start(a, engine, { carry: true }).catch(fail) },
      { label: 'Fresh chat', hint: 'same scene', tip: `A new ${NAME[engine]} chat about this scene; nothing of this chat is sent`, action: () => start(a, engine).catch(fail) },
    ]);
    return { switched: false, asked: true };
  }
  // Alt+Shift+A / Ctrl+K "Director: switch AI": the next AI
  function cycle() {
    const a = director();
    if (!a) { toast('No Three Director yet: /director-setup docks one in the Lab.', { type: 'error' }); return null; }
    const now = engineOf(a, current(a));
    stats.keys += 1;
    return pick(ENGINES[(ENGINES.indexOf(now) + 1) % ENGINES.length]).catch(fail);
  }

  // ---------- the menu ----------
  function menuItems() {
    const a = director();
    if (!a) return [];
    const cur = current(a);
    const now = engineOf(a, cur);
    const sceneId = sceneOf(a);
    const has = Boolean(Native.chatOf(a.id)?.messages?.some((m) => m.role === 'user' || m.role === 'assistant'));
    const items = [sceneName(sceneId) ? `Talk about "${sceneName(sceneId)}" with…` : 'Talk with…'];
    for (const engine of ENGINES) {
      const st = cachedHealth(engine);
      const list = chatsFor(a, sceneId, engine);
      const others = list.filter((c) => c.id !== cur);
      const marks = others.map((c) => c.id).filter((id) => busy(id) || unread(id));
      items.push({
        label: `${MARK[engine]} ${NAME[engine]}`, checked: engine === now,
        hint: engine === now ? 'this chat' : st === 'missing' ? 'not installed' : st === 'signedout' ? 'signed out: sign in' : marks.length ? markText(marks[0]) : others.length ? 'its last chat' : 'new chat',
        tip: engine === now ? `You're talking to ${NAME[engine]} in this chat` : st === 'missing' || st === 'signedout' ? `${LABEL[engine]} ${st === 'missing' ? 'isn\'t installed' : 'isn\'t signed in'}: click to sign in (round 111's sign-in, its outcome shows in the chat)` : others.length ? `Open ${NAME[engine]}'s latest chat about this scene` : `Start a ${NAME[engine]} chat about this scene`,
        action: () => pick(engine).catch(fail),
      });
      for (const c of others.slice(0, RECENT)) items.push({ label: `↳ ${c.title}`, hint: markText(c.id) || ago(c.updatedAt), tip: `Open this ${NAME[engine]} chat about the scene (it stays as it was)`, action: () => openChat(a, c.id) });
      if (engine !== now) {
        items.push({ label: `↳ Continue this conversation with ${NAME[engine]}`, hint: 'short brief', disabled: !has, tip: has ? `A new ${NAME[engine]} chat on this scene; your next message there carries a short brief of this one (nothing is sent until you do)` : 'Nothing to carry over yet', action: () => pick(engine, { choice: 'continue' }).catch(fail) });
        items.push({ label: `↳ Fresh chat with ${NAME[engine]}`, hint: 'same scene', tip: `A new ${NAME[engine]} chat on this scene, with the Lab's tools`, action: () => pick(engine, { choice: 'fresh' }).catch(fail) });
      }
    }
    const extra = labAgents();
    if (extra.length) {
      items.push('-', 'Other AIs with the Lab’s tools (their own chat view)');
      for (const x of extra) {
        const last = guestChats(x, sceneId)[0];
        items.push({ label: `${x.icon || '◇'} ${x.name}`, hint: last ? markText(last.id) || ago(last.updatedAt) : 'new chat', tip: last ? `Open ${x.name}'s chat about this scene` : `A ${x.name} chat linked to this scene (its draft starts with the scene's line)`, action: () => otherAgent(x, sceneId).catch(fail) });
      }
    }
    items.push('-', { label: 'Switch AI', key: 'Alt+Shift+A', tip: 'Goes to the next AI the same way (Ctrl+K: Director: switch AI)', action: () => cycle() });
    return items;
  }
  async function otherAgent(x, sceneId) {
    const last = guestChats(x, sceneId)[0];
    if (last) { activate(x.id); Native.open(x.id, last.id); return { switched: true, chatId: last.id }; }
    if (window.Lazy && typeof LabChatLink === 'undefined') await Lazy.load('lab').catch(() => {});
    if (typeof LabChatLink !== 'undefined') LabChatLink.ask('', { sceneId, agentId: x.id });
    else { activate(x.id); Native.newChat(x.id); }
    return { switched: true, agentId: x.id };
  }
  function open(anchor = pill()) {
    if (!anchor?.isConnected) { const a = director(); if (a) show(a); anchor = pill(); }
    const r = anchor?.getBoundingClientRect?.();
    if (!r) return;
    // what the rows say about each AI is read once, in the background (the next opening has it)
    for (const e of ENGINES) if (!cachedHealth(e)) health(e).catch(() => {});
    showMenu(r.left, r.bottom + 4, menuItems());
  }

  // ---------- the pill ----------
  let btn = null;
  const pill = () => (btn?.isConnected ? btn : null);
  function mount(entry) {
    if (!entry?.strip || entry.s?.tool?.id !== 'three') return;
    btn ||= el('button', { type: 'button', class: 'dd-ai', dataset: { feature: 'Director AI switcher' }, on: { click: (e) => { e.stopPropagation(); open(btn); } } },
      el('span', { class: 'dd-ai-icon' }), el('span', { class: 'dd-ai-name' }), el('span', { class: 'dd-ai-caret', text: '▾' }), el('span', { class: 'dd-ai-dot' }));
    if (btn.parentElement !== entry.strip || entry.strip.firstChild !== btn) entry.strip.prepend(btn);
    paint();
  }
  function paint() {
    const a = director();
    if (!btn || !a) return;
    const cur = current(a);
    const now = engineOf(a, cur);
    const sceneId = sceneOf(a);
    btn.querySelector('.dd-ai-icon').textContent = a.icon || '◆';
    btn.querySelector('.dd-ai-name').textContent = NAME[now] || now;
    btn.dataset.engine = now;
    // the other chats about this scene: one still working, one with a reply not read yet
    const rest = ENGINES.flatMap((e) => chatsFor(a, sceneId, e)).filter((c) => c.id !== cur);
    const working = rest.filter((c) => busy(c.id)); const fresh = rest.filter((c) => unread(c.id));
    const dot = btn.querySelector('.dd-ai-dot');
    dot.className = `dd-ai-dot${working.length ? ' busy' : ''}${fresh.length ? ' unread' : ''}`;
    const who = (c) => `${NAME[engineOf(a, c.id)]} ("${c.title}")`;
    const say = [...working.map((c) => `${who(c)} is working`), ...fresh.map((c) => `${who(c)} has a new reply`)];
    btn.title = (globalThis.macText || String)(`You're talking to ${NAME[now]}. Click to switch AI or to go to another chat about this scene · Alt+Shift+A${say.length ? `\n${say.join('\n')}` : ''}`);
    btn.setAttribute('aria-label', `AI: ${NAME[now]}${say.length ? ` · ${say.join(', ')}` : ''}. Switch AI`);
  }
  let paintT = 0;
  function paintSoon() { clearTimeout(paintT); paintT = setTimeout(paint, 40); }

  // ---------- keys, Ctrl/⌘+K ----------
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.code !== 'KeyA' || e.repeat) return;
    if (!inLab() || !DirectorDock.entry('three')) return;
    e.preventDefault();
    cycle();
  });
  // (registered once AppUI is there: this file can run before appui.js, dev/lazy-manifest.js's old order)
  const register = () => {
    try {
      Keys.add({ area: 'Director dock', keys: 'Alt+Shift+A', what: 'Director: switch AI (Claude ⇄ Astra, each its own chat about this scene)', when: inLab, run: () => cycle() });
      AppUI.addAction?.('Director: switch AI', () => { if (!inLab()) activate('tool:three'); setTimeout(() => { const a = director(); if (a) show(a); setTimeout(() => open(), 120); }, 60); }, 'Alt+Shift+A');
    } catch { /* the keys sheet / palette are optional */ }
  };
  if (typeof AppUI !== 'undefined') register(); else document.addEventListener('DOMContentLoaded', register, { once: true });
  if (typeof Native !== 'undefined' && Native.hooks?.event) { Native.hooks.event.push(() => paintSoon()); Native.hooks.send?.push(() => paintSoon()); }
  addEventListener('hearth:view', () => paintSoon());
  addEventListener('hearth:scene-link', () => paintSoon());
  // director-dock.js attached before this file ran: put the pill in its strip now
  if (typeof DirectorDock !== 'undefined') { const e = DirectorDock.entry('three'); if (e) mount(e); }

  return { mount, paint, open, pick, cycle, start, menuItems, chatsFor, engineOf, sceneOf, health, stats, NAME };
})();
window.DirectorSwitch = DirectorSwitch;
