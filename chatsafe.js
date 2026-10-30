// (round 55, chatsafe55) A chat never moves to another AI and never disappears from where you expect it, whatever
// happens to its AI. Round 54: the Three Director went missing from config.json during an update; its Lab chats then
// showed under Claude, and opening one there moved it to Claude for good (round 52's "adopt"). Now:
//   - a chat whose AI is missing (removed, renamed, config lost) or turned off shows under its own AI's name in the
//     chats list ("Three Director — not set up", panel.js) and keeps its agent id, always
//   - opening it shows it read-only: a docked director's chats in the tool's dock (the Lab keeps a read-only chat panel
//     of them instead of none, tools.js syncDock → mountDock), the others in a reader
//   - one plain button, "Bring back Three Director": from an update's stash or a copy (chatsafemain.js), else made again
//     under the same id (the /director-setup director) — its chats are simply its own again
//   - "Continue with Claude…" (asked first) goes on in a copy with Claude; the original stays with its own AI
// Loaded on first use (lazy group 'chatsafe'). Nothing is sent to an AI and no chat file is written here.
const ChatSafe = (() => {
  const who = (id) => Panel.whoWas(id);
  const isOn = (id) => H.agents().some((a) => a.id === id && a.mode === 'native');
  const summaries = (ids) => (H.chats || []).filter((c) => ids.includes(c.agentId)).sort((a, b) => (b.pinned - a.pinned) || b.updatedAt - a.updatedAt);
  const fail = (err) => toast(calmError(err), { type: 'error', raw: err });
  const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 120)); } return Boolean(fn()); };

  // ---------- the chat itself, read-only ----------
  const SHOWN = 60; // the last messages shown (↑ shows the rest)
  const shown = (m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'opinion') && !m.compactReq;
  const rowEl = (m, name) => el('div', { class: `chatsafe-msg ${m.role}` },
    el('div', { class: 'chatsafe-who', text: m.role === 'user' ? 'You' : m.role === 'opinion' ? `${m.from || 'Second opinion'}` : (m.compactSummary ? 'Summary' : name) }),
    el('div', { class: 'chatsafe-text', text: String(m.text || '').slice(0, 40000) }));
  function messagesEl(chat, name, all = false) {
    if (chat?.big) return bigEl(chat, name);
    const box = el('div', { class: 'chatsafe-msgs' });
    const msgs = (chat?.messages || []).filter(shown);
    const from = all ? 0 : Math.max(0, msgs.length - SHOWN);
    if (from) box.append(el('button', { type: 'button', class: 'ghost small chatsafe-earlier', text: `↑ Show ${from} earlier message${from === 1 ? '' : 's'}`, on: { click: () => box.replaceWith(messagesEl(chat, name, true)) } }));
    if (!msgs.length) box.append(el('p', { class: 'hint', text: 'No messages in this chat yet.' }));
    for (const m of msgs.slice(from)) box.append(rowEl(m, name));
    return box;
  }
  // (round 87, chatcalc87) a GIANT chat (≥ 8 MB) isn't read whole for this: its own fields and count from the store
  // thread (the main process parsed all of it here: ≈ 1 s held for 60 MB), its last messages by range, and "Show
  // earlier" a page more by range each time (drawing all 6,000 at once held the window ≈ 30 s). A read that fails says
  // so and can be tried again: never "No messages"
  async function read(id) {
    const h = window.hub.chatWin ? await window.hub.chatWin('head', { id }).catch(() => null) : null;
    if (!h?.big || !h.head) return window.hub.getChat(id).catch(() => null);
    return { ...h.head, id: h.head.id || id, messages: null, big: { n: Number(h.n) || 0 } };
  }
  const PAGE = 120;
  function bigEl(chat, name) {
    const box = el('div', { class: 'chatsafe-msgs' });
    const st = { lo: chat.big.n, busy: false, rows: 0 };
    const btn = el('button', { type: 'button', class: 'ghost small chatsafe-earlier', text: '↑ Show earlier messages', on: { click: () => more(PAGE) } });
    const note = el('p', { class: 'hint', text: 'Opening…' });
    box.append(btn, note);
    async function more(count, first = false) {
      if (st.busy || st.lo <= 0) return;
      st.busy = true; btn.disabled = true;
      try {
        const from = Math.max(0, st.lo - count);
        const r = await window.hub.chatWin('range', { id: chat.id, from, to: st.lo }).catch(() => null);
        const msgs = r?.bytes ? JSON.parse(new TextDecoder().decode(r.bytes)).messages : null;
        if (!Array.isArray(msgs) || msgs.length !== st.lo - from) throw new Error('read');
        st.lo = from;
        const add = msgs.filter(shown);
        st.rows += add.length;
        // put in a few at a time (newest first, just under the button), each batch its own task. (round 88, checkfix88)
        // The first page keeps the end in view from its first batch on: the older batches then go in above what is on
        // screen, where content-visibility leaves them unlaid-out. Scrolled to the end only after the last batch, each
        // batch went in at the visible top and its long replies were laid out there: 60–100 ms tasks for rows that
        // ended up off screen anyway.
        const toEnd = () => { const sc = box.closest('.chatsafe-body'); if (sc) sc.scrollTop = sc.scrollHeight; else if (box.scrollHeight > box.clientHeight) box.scrollTop = box.scrollHeight; else box.lastElementChild?.scrollIntoView?.({ block: 'end' }); };
        if (first) note.remove();
        for (let i = add.length; i > 0; i -= 10) { btn.after(...add.slice(Math.max(0, i - 10), i).map((m) => rowEl(m, name))); if (first) toEnd(); if (i > 10) await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); }
        btn.textContent = '↑ Show earlier messages';
        if (!st.lo) btn.remove();
        note.remove();
        if (!st.rows && !st.lo) box.append(el('p', { class: 'hint', text: 'No messages in this chat yet.' }));
        if (first) toEnd();
      } catch {
        if (first) note.textContent = 'This chat couldn\'t be read just now (nothing was changed). Try again in a moment.';
        else btn.textContent = '↑ The earlier messages couldn\'t be read just now (nothing was changed): try again';
      } finally { st.busy = false; btn.disabled = false; }
    }
    if (st.lo) more(Math.round(SHOWN * 1.5), true); else { btn.remove(); note.textContent = 'No messages in this chat yet.'; }
    return box;
  }
  const note = (id) => {
    const w = who(id);
    return w.state === 'off' ? `${w.name} is turned off. Its chats are as they were and open read-only until it is back on.`
      : `${w.name} isn't set up right now. Its chats are as they were, still its own, and open read-only until it is back.`;
  };
  const bringLabel = (id) => (who(id).state === 'off' ? `Turn ${who(id).name} back on` : `Bring back ${who(id).name}`);

  // ---------- open: a docked director's chat in its tool's dock, the others in a reader ----------
  const picks = new Map(); // toolId -> the chat to show when its dock panel is drawn
  async function open(chatId, { agentId = null, quiet = false } = {}) {
    let aid = agentId || (H.chats || []).find((c) => c.id === chatId)?.agentId || null;
    if (!aid) { const c = await read(chatId); aid = c?.agentId || null; }
    if (!aid) return false;
    if (isOn(aid)) { Native.open(aid, chatId); return true; } // its AI is back: the real chat
    const w = who(aid);
    if (w.dock && w.state !== 'retired' && typeof Tools !== 'undefined' && Tools.enabled().some((t) => t.id === w.dock)) {
      picks.set(w.dock, chatId);
      const d = docks.get(w.dock);
      if (d) { d.sel = chatId; draw(d); }
      if (!quiet) activate(`tool:${w.dock}`);
      return true;
    }
    if (quiet) return false;
    const chat = await read(chatId);
    if (!chat) { toast('That chat couldn\'t be read just now: nothing was changed, try again in a moment', { type: 'error' }); return false; }
    reader(chat);
    return true;
  }
  function reader(chat) {
    const aid = chat.agentId; const w = who(aid);
    const dialog = el('dialog', { class: 'ui-modal chatsafe-reader' });
    const close = () => dialog.close();
    const acts = el('div', { class: 'dialog-actions' },
      el('button', { type: 'button', class: 'ghost', text: 'Continue with Claude…', on: { click: () => { close(); continueElsewhere(chat.id).catch(fail); } } }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', text: 'Close', on: { click: close } }),
      w.state !== 'retired' ? el('button', { type: 'button', class: 'primary', text: bringLabel(aid), on: { click: () => { close(); bringBack(aid).catch(fail); } } }) : null);
    dialog.append(el('h2', { text: chat.title || 'Chat' }), el('p', { class: 'hint chatsafe-note', text: w.state === 'retired' ? `${w.name} is no longer part of Hearth. This chat is kept as it was, read-only.` : note(aid) }), messagesEl(chat, w.name), acts);
    dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 0));
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('.chatsafe-msgs')?.lastElementChild?.scrollIntoView?.({ block: 'end' });
  }

  // ---------- the dock's read-only panel (tools.js syncDock: its docked AI missing, its chats there) ----------
  const docks = new Map(); // toolId -> { s, ids, sel, root, sig, seq }
  function mountDock(s, ids) {
    const toolId = s.tool.id;
    const d = { s, ids, sel: picks.get(toolId) || null, root: el('div', { class: 'chatsafe-dock', dataset: { feature: 'Chats waiting for their AI' } }), sig: '', seq: 0 };
    docks.set(toolId, d);
    s.dock.replaceChildren(d.root);
    draw(d);
  }
  function refreshDock(s) { const d = docks.get(s.tool.id); if (d && d.root.isConnected) draw(d); }
  async function draw(d) {
    const list = summaries(d.ids);
    if (!d.sel || !list.some((c) => c.id === d.sel)) d.sel = list[0]?.id || null;
    const sig = `${d.sel}|${list.map((c) => `${c.id}:${c.title}:${c.updatedAt}`).join(',')}|${d.ids.map((i) => who(i).state).join(',')}`;
    if (sig === d.sig) return; // (nothing changed: nothing rewritten)
    d.sig = sig;
    const seq = (d.seq += 1);
    const first = d.ids[0]; const w = who(first);
    const rows = el('div', { class: 'chatsafe-list', role: 'list' }, list.map((c) => el('button', {
      type: 'button', class: `chatsafe-item${c.id === d.sel ? ' active' : ''}`, text: c.title || 'Chat', title: `${c.title || 'Chat'} · ${timeAgo(c.updatedAt)}`, dataset: { chat: c.id },
      on: { click: () => { d.sel = c.id; picks.set(d.s.tool.id, c.id); draw(d); }, contextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Continue with Claude…', action: () => continueElsewhere(c.id).catch(fail) }]); } },
    })));
    const head = el('div', { class: 'chatsafe-head' },
      el('div', { class: 'chatsafe-title', text: `${w.icon || '◆'} ${Panel.missing(first).name}` }),
      el('p', { class: 'hint', text: note(first) }),
      el('button', { type: 'button', class: 'primary chatsafe-bring', text: bringLabel(first), on: { click: () => bringBack(first).catch(fail) } }));
    const body = el('div', { class: 'chatsafe-body' }, el('p', { class: 'hint', text: list.length ? 'Opening…' : 'No chats.' }));
    const foot = el('div', { class: 'chatsafe-foot' }, el('span', { class: 'hint', text: 'Read-only' }), el('span', { class: 'spacer' }),
      d.sel ? el('button', { type: 'button', class: 'ghost small', text: 'Continue with Claude…', on: { click: () => continueElsewhere(d.sel).catch(fail) } }) : null);
    d.root.replaceChildren(head, rows, body, foot);
    if (!d.sel) return;
    const chat = await read(d.sel);
    if (seq !== d.seq) return;
    body.replaceChildren(chat ? messagesEl(chat, w.name) : el('p', { class: 'hint', text: 'This chat couldn\'t be read just now (nothing was changed). Try again in a moment.' }));
    body.scrollTop = body.scrollHeight;
  }

  // ---------- Bring back <its AI> ----------
  let bringing = null;
  function bringBack(agentId) {
    if (!bringing) bringing = doBring(agentId).finally(() => { bringing = null; });
    return bringing;
  }
  async function doBring(agentId) {
    const w = who(agentId);
    if (w.state === 'retired') { toast(`${w.name} is no longer part of Hearth: its chats stay as they are (Continue with Claude… goes on in a copy)`, { timeout: 6000 }); return { ok: false, how: 'retired' }; }
    if (isOn(agentId)) return { ok: true, how: 'here' };
    let r = null;
    try { r = await window.hub.chatsafe.bring(agentId); } catch (err) { r = { ok: false, how: 'error', error: err.message }; }
    if (!r.ok && r.how === 'none') {
      // nowhere to bring it from: made again under the same id (a director: the one /director-setup makes), so its
      // chats are its own again
      if (!H.config || !Array.isArray(H.config.agents)) throw new Error('Your settings aren\'t read yet: nothing was changed, try again in a moment');
      if (!H.config.agents.some((a) => a.id === agentId)) {
        const director = w.dock === 'three' || /^threedirector/.test(agentId);
        H.config.agents.push(director
          ? { id: agentId, name: w.name || 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', threeTools: true, selfReview: true, enabled: true }
          : { id: agentId, name: w.name, ...(w.icon ? { icon: w.icon } : {}), ...(w.color ? { color: w.color } : {}), mode: 'native', engine: w.engine === 'codex' ? 'codex' : 'claude', ...(w.dock ? { dock: w.dock } : {}), enabled: true });
        await saveConfig();
      }
      r = { ok: true, how: 'made' };
    }
    if (!r.ok) throw new Error(r.error || `${w.name} couldn't be brought back just now: nothing was changed, try again in a moment`);
    await until(() => isOn(agentId), 6000);
    const from = r.how === 'stash' || r.how === 'copy' ? ` (from ${r.from})` : r.how === 'made' ? ' (set up again: no copy of it was found)' : '';
    toast(`${w.name} is back${from}. Its chats are where they were.`, { timeout: 6000 });
    if (w.dock && typeof Tools !== 'undefined') { Tools.syncDocks(); Tools.openDock(w.dock); }
    Panel.render();
    return r;
  }

  // ---------- Continue with Claude… (asked first; a copy goes on, the original stays with its own AI) ----------
  async function continueElsewhere(chatId) {
    const s = (H.chats || []).find((c) => c.id === chatId);
    const target = H.claudeAgent?.();
    if (!target) { toast('No Claude to continue with: bring this chat\'s own AI back instead', { type: 'error' }); return false; }
    const name = who(s?.agentId || '').name;
    const yes = await Modal.confirm(`Continue with ${target.name}?`, `A copy of “${s?.title || 'this chat'}” goes on with ${target.name}. This chat stays with ${name}, as it is, and is its own again when ${name} is back.`, { ok: `Continue with ${target.name}` });
    if (!yes) return false;
    await Native.continueWith(chatId, target.id);
    return true;
  }

  // the chats list redraws (a chat renamed, a reply saved): the dock panel follows, when drawn
  Panel.hooks.render.push(() => { for (const d of docks.values()) if (d.root.isConnected) draw(d); });

  if (typeof Commands !== 'undefined' && !Commands.get('bring-back')) {
    const away = () => [...Panel._model().keys()].filter((id) => id && !isOn(id) && who(id).state !== 'retired');
    Commands.register({
      name: 'bring-back', area: 'Chat', args: '[AI]',
      desc: 'Bring back the AI some chats wait for (a missing or turned-off AI: from an update\'s stash or a copy, else set up again under the same id); its chats are its own again',
      complete: (a) => away().map((id) => ({ value: who(id).name })).filter((x) => x.value.toLowerCase().startsWith(a.trim().toLowerCase())),
      run: async (args) => {
        const ids = away();
        if (!ids.length) return 'Every chat\'s AI is here.';
        const q = args.trim().toLowerCase();
        const id = q ? ids.find((i) => who(i).name.toLowerCase().startsWith(q) || i === q) : ids[0];
        if (!id) return `No chats wait for "${args.trim()}". Waiting: ${ids.map((i) => who(i).name).join(', ')}.`;
        const r = await bringBack(id);
        return r?.ok ? `${who(id).name} is back; its chats are where they were.` : `${who(id).name} wasn't brought back.`;
      },
    });
  }

  return { open, mountDock, refreshDock, bringBack, continueElsewhere, reader, read };
})();
