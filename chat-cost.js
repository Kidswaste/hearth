// What each message sent (round 24, context). Every reply's token line in the chat (the meter's badge) gets a thin bar
// that splits the input the engine counted into: the engine's own base, the system prompt, each tool set, the history
// it re-read, this message's attachments, @ references and memory, and the words you typed (hover for numbers, click
// for the list and the fixes). When a chat is expensive it names the cheapest fix once ("this chat sends 1k tokens of
// Board tools every message and never used them: switch them off?"), with a one-click Fix; `/context` shows the same.
// The system prompt and tools are measured in the main process (mcp/cost.js exactOf, the text engines.js really sends);
// nothing here adds a token to any message.
const ChatCost = (() => {
  const C = ContextCore;
  const fixedCache = new Map(); // agent signature → Promise<{ system, memory, tools: [[set, tokens]] }>
  const atSend = new Map(); // chat id → { fresh, agentId }
  const latest = new Map(); // `${agentId}|${signature}` → the resolved fixed cost
  // the agent as engines.js sees it for this chat (a chat's own /capture-tools and /crew ride along)
  const agentFor = (agentId, chat) => {
    const a = H.agent(agentId);
    if (!a) return null;
    return { ...JSON.parse(JSON.stringify(a)), ...(chat?.captureTools ? { captureTools: true } : {}), ...(chat?.crew ? { crewOn: true } : {}), exact: true };
  };
  const sigOf = (a) => JSON.stringify([a.id, a.engine, a.dock, a.threeTools, a.gameTools, a.chatTools, a.boardTools, a.captureTools, a.appsTools, a.adobeTools, a.deployTools, a.openTool, a.hubTools, a.nodesTool, a.toolMode, a.crewOn, a.memoryWhenRelevant, a.systemPrompt?.length, a.autoMemory, a.workspace]);
  function fixed(agentId, chat) {
    const a = agentFor(agentId, chat);
    if (!a || !window.hub.directorCost) return Promise.resolve(null);
    const sig = sigOf(a);
    if (!fixedCache.has(sig)) {
      fixedCache.set(sig, window.hub.directorCost([a]).then((r) => r?.directors?.[0] || null).catch(() => null));
      setTimeout(() => fixedCache.delete(sig), 120000); // memory and prompts change: measured again after 2 minutes
    }
    return fixedCache.get(sig);
  }
  const baseKey = (engine) => `ctx.base.${engine || 'claude'}`;
  const baseOf = (engine) => store.get(baseKey(engine), 0) || 0;

  // ---------- at send and at the end of a reply ----------
  Native.hooks.send.push((agentId, chat) => {
    const talk = chat.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    atSend.set(chat.id, { agentId, fresh: !chat.session?.id && talk.length === 1 });
    // keep the resolved cost at hand for finish (which must not wait)
    const a = agentFor(agentId, chat);
    if (a) fixed(agentId, chat).then((f) => { if (f) latest.set(`${agentId}|${sigOf(a)}`, f); });
  });
  // measured synchronously from what is cached (the cost was asked for at send); a reply that beat it gets none
  Native.hooks.finish.push((event, chat, extras) => {
    const s = atSend.get(chat.id);
    atSend.delete(chat.id);
    const u = event.usage;
    if (event.type !== 'done' || !u?.input || !s) return;
    const f = latest.get(`${s.agentId}|${sigOf(agentFor(s.agentId, chat) || {})}`);
    if (!f) return;
    const user = [...chat.messages].reverse().find((m) => m.role === 'user');
    const sent = user ? C.tok(user.sent || user.text) : 0;
    const refs = (user?.attachments || []).reduce((n, a) => n + (a.tokens || 0), 0);
    const memory = user?.memTokens || 0;
    const message = user ? C.tok(user.text) : 0;
    const attach = Math.max(0, sent - message - refs - memory);
    const engine = H.agent(s.agentId)?.engine;
    // a brand-new chat's first message re-reads nothing: what is left over is the engine's own base (learned per engine)
    if (s.fresh) {
      const b = u.input - f.system - f.tools.reduce((n, t) => n + t[1], 0) - sent;
      if (b >= 0 && b < 40000) { const old = baseOf(engine); store.set(baseKey(engine), Math.round(old ? old * 0.6 + b * 0.4 : b)); }
    }
    const bd = C.breakdown({ input: u.input, base: baseOf(engine), system: f.system, tools: f.tools, message, attach, refs, memory });
    // stored small: one short object per reply
    extras.ctx = { b: bd.base, s: bd.system, mem: f.memory || 0, t: bd.tools, h: bd.history, m: bd.message, a: bd.attach, r: bd.refs, y: bd.memory };
    setTimeout(() => suggest(s.agentId, chat, extras.ctx, u.input), 0);
  });

  // ---------- the parts, named ----------
  const SET_NAME = { threeTools: 'Lab tools', chatTools: 'chat tools', boardTools: 'Board tools', captureTools: 'Capture tools', appsTools: 'App tools', adobeTools: 'Adobe tools', deployTools: 'Deploy tools', gameTools: 'Forgeheart tools', openTool: 'chat_open' };
  function parts(x) {
    const tools = (x.t || []).reduce((n, t) => n + t[1], 0);
    return [
      ['history', 'History re-read', x.h],
      ['tools', 'Tools', tools, (x.t || []).map(([k, n]) => `${SET_NAME[k] || k} ${C.fmt(n)}`).join(', ')],
      ['system', 'System prompt', x.s, x.mem ? `memory ${C.fmt(x.mem)} of it` : ''],
      ['base', 'Engine base', x.b],
      ['refs', '@ references', x.r],
      ['attach', 'Attachments', x.a],
      ['memory', 'Memory (relevant)', x.y],
      ['message', 'Your words', x.m],
    ].filter((p) => p[2] > 0);
  }
  const textOf = (x, total) => parts(x).map(([, label, n, more]) => `${label}: ${C.fmt(n)}${total ? ` (${Math.round((n / total) * 100)}%)` : ''}${more ? ` · ${more}` : ''}`).join('\n');
  function usedTools(chat, n = 20) {
    return chat.messages.filter((m) => m.role === 'assistant').slice(-n).flatMap((m) => m.tools || []);
  }
  function fixesFor(chat, x) {
    const replies = chat.messages.filter((m) => m.role === 'assistant').length;
    const summary = C.localSummary(chat).tokens + 40;
    return C.fixes({ bd: { history: x.h }, sets: x.t || [], used: usedTools(chat), memAlways: x.mem || 0, summaryTokens: summary, replies: Math.min(replies, 20) })
      .filter((f) => f.kind !== 'tools' || replies >= 3); // tools a chat hasn't needed yet: only after a few replies
  }
  // once per chat and kind of fix, when it saves at least 2k tokens a message
  function suggest(agentId, chat, x, input) {
    if (input < 8000 || store.get('ctx.fixTips', true) === false) return;
    const f = fixesFor(chat, x)[0];
    if (!f || f.saves < 2000 || chat.ctxTips?.[f.kind]) return;
    chat.ctxTips = { ...(chat.ctxTips || {}), [f.kind]: Date.now() };
    Native.save(chat);
    toast(`💡 ${f.text}`, { timeout: 9000, action: { label: 'Fix', fn: () => Commands.exec(f.cmd, agentId) } });
  }

  // ---------- the bar under a reply ----------
  const COLORS = { history: 'var(--ctx-history, #8b7cf6)', tools: 'var(--ctx-tools, #f59e0b)', system: 'var(--ctx-system, #38bdf8)', base: 'var(--ctx-base, #64748b)', refs: 'var(--ctx-refs, #34d399)', attach: 'var(--ctx-attach, #22c55e)', memory: 'var(--ctx-memory, #f472b6)', message: 'var(--ctx-message, #e5e7eb)' };
  Native.hooks.message.push((node, m, index, agent) => {
    if (m.role !== 'assistant' || !m.ctx || !m.usage?.input) return;
    const foot = node.querySelector('.msg-foot');
    if (!foot) return;
    const total = m.usage.input;
    const ps = parts(m.ctx);
    const bar = el('button', { type: 'button', class: 'ctx-bd', title: `What this message sent (≈ ${C.fmt(total)} tokens):\n${textOf(m.ctx, total)}\nClick: the list and how to make it cheaper`,
      on: { click: (e) => { e.stopPropagation(); menu(agent.id, m, e.clientX, e.clientY); } } },
    ...ps.map(([k, , n]) => el('i', { style: `flex:${Math.max(1, Math.round((n / total) * 100))};background:${COLORS[k]}` })));
    const badge = foot.querySelector('.meter-badge, .tok-badge');
    if (badge) badge.after(bar); else foot.prepend(bar);
  });
  function menu(agentId, m, x, y) {
    const chat = Native.current(agentId);
    const total = m.usage.input;
    const fx = chat ? fixesFor(chat, m.ctx) : [];
    showMenu(x, y - 4, [
      { label: `This message sent ≈ ${C.fmt(total)} tokens`, disabled: true },
      ...parts(m.ctx).map(([k, label, n, more]) => ({ label: `${label} · ${C.fmt(n)}`, hint: `${Math.round((n / total) * 100)}%${more ? ` · ${more}` : ''}`, disabled: true, key: k })),
      fx.length ? '-' : null,
      ...fx.slice(0, 3).map((f) => ({ label: `${f.cmd} · saves ≈ ${C.fmt(f.saves)} a message`, hint: f.text, action: () => Commands.exec(f.cmd, agentId) })),
      '-',
      { label: 'Attach only what\'s needed: @ in the chat box', action: () => { Native.insertDraft(agentId, '@'); } },
      { label: store.get('ctx.fixTips', true) === false ? 'Tips when a chat is expensive' : '✓ Tips when a chat is expensive', more: true, action: () => store.set('ctx.fixTips', store.get('ctx.fixTips', true) === false) },
    ].filter(Boolean));
  }

  // ---------- /context ----------
  function contextText(chat, args = '') {
    const last = [...chat.messages].reverse().find((m) => m.usage);
    if (!last) return 'No replies yet.';
    const n = last.usage.input;
    const x = [...chat.messages].reverse().find((m) => m.ctx)?.ctx;
    const fx = x ? fixesFor(chat, x) : [];
    if (/^fix\b/i.test(args.trim())) {
      if (!fx.length) return 'Nothing to fix: this chat is lean.';
      Commands.exec(fx[0].cmd, chat.agentId);
      return `Running ${fx[0].cmd} (saves ≈ ${C.fmt(fx[0].saves)} tokens a message).`;
    }
    const lines = [`Each message sends about **${C.fmt(n)} tokens** (${Math.round(n / 2000)}% of a 200k window).${chat.compact ? ` Compacted ${timeAgo(chat.compact.at)}.` : ''}`];
    if (x) lines.push('', '**The last message was made of**', ...textOf(x, n).split('\n').map((l) => `- ${l}`));
    if (fx.length) lines.push('', '**Cheapest fixes**', ...fx.slice(0, 3).map((f) => `- \`${f.cmd}\` saves ≈ ${C.fmt(f.saves)} a message: ${f.text}`), '', '`/context fix` runs the first one.');
    else lines.push('', n > 30000 ? '`/compact` summarizes it here · `/fresh` moves to a new chat from a summary' : 'That\'s light: nothing to do.');
    lines.push('Type @ in the chat box to attach only what a message needs (cost shown first).');
    return lines.join('\n');
  }

  return { fixed, parts, textOf, fixesFor, contextText, baseOf, menu };
})();
window.ChatCost = ChatCost;
