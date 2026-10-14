// Fresh start with a summary (round 24, context). A long chat re-reads its whole history with every message; a fresh
// start moves on in a new chat that carries only the essential state: the goal, what was decided, what exists now,
// what is open, the key files and names, and where it stopped. The summary is made here, for free (no engine call;
// the chat's own compact summary when it has one), shown and editable before anything moves, and stays visible and
// editable as the new chat's first message (✎). It says what the next message will cost instead (≈ base + prompt +
// tools + summary), and after the first reply in the new chat, what it really saved. The old chat stays in the list.
// `/fresh` (the long-chat banner's "New chat from a summary" too), `/fresh ask` lets the agent write it (one message
// at today's size), `/fresh auto on [60k]` does it by itself past that size (opt-in per agent; you can still edit it).
const ChatFresh = (() => {
  const C = ContextCore;
  const AUTO_DEFAULT = 60000;
  const lastInput = (chat) => [...(chat?.messages || [])].reverse().find((m) => m.usage)?.usage.input || 0;
  const summaryOf = (chat) => (chat.compact?.summary ? { text: chat.compact.summary, tokens: C.tok(chat.compact.summary), agent: true } : C.localSummary(chat));
  const wrap = (title, text) => `**Where we are** (summary of "${title}")\n\n${text}`;
  // what the next message will cost after the fresh start: the fixed part of the last message + the summary
  function estimate(chat, summaryText) {
    const x = [...chat.messages].reverse().find((m) => m.ctx)?.ctx;
    const fixedPart = x ? x.b + x.s + (x.t || []).reduce((n, t) => n + t[1], 0) : 0;
    // the engine re-reads the summary as the earlier conversation (native.js withContext), wrapped in one line
    const carried = C.tok(`Here is our earlier conversation (from a summary of the earlier chat chat). Continue it naturally.\n\n<earlier_conversation>\nAssistant: ${wrap(chat.title, summaryText)}\n</earlier_conversation>\n\n`);
    return { before: lastInput(chat), after: fixedPart + carried, carried, fixedPart };
  }
  async function start(agentId, { auto = false, ask = false, text = null } = {}) {
    const chat = Native.current(agentId);
    if (!chat) throw new Error('Open a chat first.');
    if (Native.isBusy(chat.id)) throw new Error('Still answering');
    if (!chat.messages.some((m) => m.role === 'assistant')) { toast('Nothing to carry over yet', { timeout: 1500 }); return null; }
    if (ask) return Native.summarizeAndContinue(agentId); // the agent writes it (one message at today's size)
    let summary = text ?? summaryOf(chat).text;
    const est = estimate(chat, summary);
    if (!auto && text == null) {
      const v = await Modal.form('Fresh start with a summary', [
        { name: 'summary', type: 'textarea', rows: 14, value: summary,
          label: `What the new chat carries (edit freely). Next message ≈ ${C.fmt(est.after || est.carried)} tokens${est.before ? ` instead of ${C.fmt(est.before)}` : ''}. Made here for free; /fresh ask has ${H.agent(agentId)?.name || 'the agent'} write it instead.` },
      ], { ok: 'Start fresh' });
      if (!v?.summary?.trim()) return null;
      summary = v.summary.trim();
    }
    const now = Date.now();
    const fresh = {
      id: `${agentId}-${now.toString(36)}`, agentId, title: `${chat.title.replace(/ \(continued\)$/, '')} (continued)`, createdAt: now, updatedAt: now,
      session: {}, continuedFrom: 'summary of the earlier chat', contextFrom: chat.id, model: chat.model,
      ...(chat.captureTools ? { captureTools: true } : {}), ...(chat.style ? { style: chat.style } : {}),
      fresh: { from: chat.id, before: est.before, carried: C.tok(summary), at: now, auto },
      messages: [{ role: 'assistant', text: wrap(chat.title, summary), at: now, freshSummary: true }],
    };
    // the old chat's pinned facts come along (chat-memory.js)
    if (typeof ChatMemory !== 'undefined') { await ChatMemory.load(); for (const f of ChatMemory.factsOf('chat', chat.id)) ChatMemory.add('chat', fresh.id, f.t, { always: f.always }); }
    try { if (typeof Projects !== 'undefined' && Projects.isLoaded?.()) { const p = Projects.projectOfChat(chat.id); if (p) Projects.add(p, { type: 'chat', ref: fresh.id, name: fresh.title }); } } catch { /* projects not loaded */ }
    Native.adopt(fresh, { openIt: false, show: false });
    Native.open(agentId, fresh.id);
    toast(`${auto ? 'Long chat: continuing fresh by itself' : 'Continuing fresh'} · next message ≈ ${C.fmt(est.after || est.carried)} tokens${est.before ? ` instead of ${C.fmt(est.before)}` : ''} (the old chat stays in the list)`,
      { timeout: 5000, action: { label: 'Back', fn: () => Native.open(agentId, chat.id) } });
    return fresh;
  }
  // edit the summary a fresh chat carries (before its first reply it is exactly what goes along)
  async function edit(agentId) {
    const chat = Native.current(agentId);
    const m = chat?.messages.find((x) => x.freshSummary);
    if (!m) return 'This chat didn\'t start from a summary.';
    const body = m.text.replace(/^\*\*Where we are\*\*[^\n]*\n\n/, '');
    const v = await Modal.form('The summary this chat carries', [{ name: 'summary', type: 'textarea', rows: 14, value: body, label: chat.session?.id ? 'The engine already read it: an edit goes along with your next message as a correction.' : 'Exactly what goes along with your first message.' }], { ok: 'Save' });
    if (v?.summary == null) return undefined;
    const head = m.text.match(/^\*\*Where we are\*\*[^\n]*\n\n/)?.[0] || '';
    m.text = `${head}${v.summary.trim()}`;
    m.edited = true;
    // the engine has read it already: the change rides once with the next message
    if (chat.session?.id) chat.freshEdit = v.summary.trim();
    if (chat.fresh) chat.fresh.carried = C.tok(v.summary);
    Native.save(chat);
    Native.refresh(agentId, { keepScroll: true });
    return 'Saved.';
  }

  // ---------- after the first reply in a fresh chat: what it really saved ----------
  Native.hooks.event.push((event, chat) => {
    if (event.type !== 'done' || !chat.fresh || chat.fresh.after) return;
    const u = event.usage?.input;
    if (!u) return;
    chat.fresh.after = u;
    Native.save(chat);
    if (chat.fresh.before > u) toast(`Fresh start: this message sent ${C.fmt(u)} tokens instead of ≈ ${C.fmt(chat.fresh.before)} (saved ≈ ${C.fmt(chat.fresh.before - u)}, and as much on every next one)`, { timeout: 5000 });
  });
  // an edited summary after the engine read it rides once with the next message
  Native.hooks.compose.push((agentId, chat, raw, msg) => {
    if (!chat.freshEdit || msg?.role !== 'user') return undefined;
    const t = chat.freshEdit; delete chat.freshEdit;
    return `${raw}\n\n[The summary we started from was corrected: ${t}]`;
  });
  // auto (opt-in per agent): past its size, a fresh start by itself after a finished reply
  Native.hooks.event.push((event, chat) => {
    const agent = H.agent(chat.agentId);
    const limit = agent?.freshAuto;
    const input = event.usage?.input || 0;
    if (!limit || event.type !== 'done' || input < limit) return;
    // the auto-compact (native.js) takes that one; (round 35, bugbash2) not since Continue lighter replaced it (it never
    // compacts silently now): a fresh start you turned on no longer stops working past 110k
    if (input >= 110000 && agent.autoCompact !== false && typeof Autocompact === 'undefined' && window.Lazy?.loaded?.('budget') !== false) return;
    if (H.activeChat[chat.agentId] !== chat.id || Native.view(chat.agentId)?.queue?.length) return;
    setTimeout(() => start(chat.agentId, { auto: true }).catch(() => {}), 500);
  });
  // ✎ on a fresh chat's summary message
  Native.hooks.message.push((node, m, index, agent) => {
    if (!m.freshSummary) return;
    node.classList.add('fresh-summary');
    node.querySelector('.msg-foot')?.prepend(el('button', { type: 'button', class: 'msg-act', text: '✎ Edit the summary', title: 'What this chat carries from the old one', on: { click: (e) => { e.stopPropagation(); edit(agent.id).then((r) => { if (r && r !== 'Saved.') toast(r); }); } } }));
  });

  // /fresh (chat-cmds.js hands its run here): free summary · ask (the agent writes it) · edit · auto on|off [60k]
  async function run(args, ctx) {
    const a = String(args || '').trim().toLowerCase();
    if (a === 'edit') return edit(ctx.agentId);
    if (a.startsWith('auto')) {
      const agent = H.agent(ctx.agentId);
      if (!agent) return 'Run this in a chat.';
      if (/off/.test(a)) delete agent.freshAuto;
      else { const n = (a.match(/(\d+)\s*k/) || [])[1]; agent.freshAuto = n ? Number(n) * 1000 : AUTO_DEFAULT; }
      await saveConfig();
      return agent.freshAuto ? `${agent.name} continues fresh from a summary by itself once a message passes ${C.fmt(agent.freshAuto)} tokens (the summary stays editable: ✎).` : `${agent.name} no longer starts fresh by itself.`;
    }
    await start(ctx.agentId, { ask: a === 'ask' });
    return undefined;
  }

  return { start, edit, estimate, summaryOf, run };
})();
window.ChatFresh = ChatFresh;
