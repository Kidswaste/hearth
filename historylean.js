// Lighter history (round 50, historylean): after a break, a long chat goes on in a fresh session with a lighter history
// instead of re-reading its whole old session at full price. The pure part (what is re-sent, when it pays, the
// simulator) is historylean-core.js; this file hooks it into the chat:
//   - Native.hooks.send: just before a message goes, decide from the chat's own numbers (the last reply's context, how
//     long ago it was, how long this engine's prompt cache lives, what the lighter history would weigh). When it pays,
//     the engine session is dropped for this chat (like Continue lighter does) and the message is marked.
//   - native.js withContext asks HistoryLean.context(): the message then carries the lighter history (built here from
//     the chat: every word, tool results / pictures / earlier code versions as stubs, older long answers shortened).
//   - One quiet line in the chat says what happened (≈ 9k sent instead of ≈ 48k), with "Keep the full history here".
//   - The reply's token line (hover) says it too; the cost coach and the Usage window's "How to save" count it.
// Off with ⋯ AI setup → Spending → "Offer to continue lighter: Off" (one setting for both), or per chat (the line's
// button, /history-lean off). `/history-lean` says what the next message would do; `/history-lean now` asks for it.
const HistoryLean = (() => {
  const C = HistoryLeanCore;
  const fmt = C.fmt;
  const memo = new WeakMap(); // chat → { key, built } (the lighter history is read once per change of the chat)
  const gone = (box) => { if (box) { box.dataset.gone = '1'; box.remove(); } };
  const agentOf = (chat) => { const a = H.agent(chat.agentId); return a && chat.engine && chat.engine !== a.engine ? { ...a, engine: chat.engine } : a; };
  const chatTools = (a) => (typeof Handoff !== 'undefined' && Handoff.chatTools ? Handoff.chatTools(a) : Boolean(a) && a.engine === 'claude' && a.chatTools !== false);

  // the lighter history for the messages before `upto` (memoized per change of the chat)
  function built(chat, upto, tools) {
    const ms = chat.messages || [];
    const key = `${upto}|${ms.length}|${ms[upto - 1]?.at || 0}|${chat.compact?.index ?? ''}|${chat.handoff?.at ?? ''}|${tools ? 1 : 0}`;
    const m = memo.get(chat);
    if (m?.key === key) return m.built;
    const b = C.build(chat, { upto, chatTools: tools });
    memo.set(chat, { key, built: b });
    return b;
  }
  // what the next message (or the one at index `upto`) would do in this chat
  function plan(chat, { now = Date.now(), upto } = {}) {
    const agent = chat && agentOf(chat);
    if (!agent || agent.mode !== 'native') return null;
    const end = upto ?? chat.messages.length;
    const tools = chatTools(agent);
    const input = C.inputOf(chat, agent, { now, upto: end, chatTools: tools, built: built(chat, end, tools) });
    return { ...C.decide(input), input };
  }

  // just before a message goes: a fresh session with the lighter history when it pays
  function onSend(agentId, chat) {
    const msg = chat?.messages?.at(-1);
    if (!msg || msg.role !== 'user' || msg.compactReq || !chat.session?.id) return;
    const d = plan(chat, { upto: chat.messages.length - 1, now: msg.at || Date.now() });
    if (chat.leanNext) delete chat.leanNext; // "now" is for one message
    if (!d?.rebase) return;
    const at = chat.messages.length - 1;
    chat.lean = { at, from: d.before, to: d.after, n: (chat.lean?.n || 0) + 1 };
    msg.histLean = { from: d.before, to: d.after, lean: d.input.lean, why: d.why };
    chat.session = {}; // a new engine session: its system prompt and flags are a new chat's (byte-stable)
    Native.save(chat);
    if (H.activeChat[agentId] === chat.id) setTimeout(() => show(agentId, chat, d), 0);
  }
  function show(agentId, chat, d) {
    if (H.activeChat[agentId] !== chat.id) return;
    const box = Native.note(agentId, C.line(d), { id: 'historylean', quiet: true, actions: [{ label: 'Keep the full history here', title: 'From the next break on, this chat resumes its whole session (re-read at full price once the cache has expired).', run: (b) => { gone(b); chat.leanOff = true; Native.save(chat); toast('This chat keeps its full history from the next break on.', { timeout: 3000 }); } }] });
    if (box) box.title = C.hover(d);
  }

  // native.js withContext: the message carries the lighter history while this chat's newest start is a lighter one
  function context(chat, text) {
    const l = chat?.lean;
    if (!l || chat.session?.id) return null;
    if (chat.compact && chat.compact.index > l.at) return null; // continued lighter (a summary) since
    if (chat.handoff && chat.handoff.at > l.at) return null; // handed over since
    const agent = agentOf(chat);
    const upto = Math.max(0, chat.messages.length - 1);
    const b = built(chat, upto, chatTools(agent));
    return `${b.text}${text}`;
  }

  // the reply's token line (hover): what the lighter start saved
  function onMessage(node, m, index, agent) {
    if (!m.usage || m.role !== 'assistant') return;
    const chat = Native.current(agent.id);
    const u = chat?.messages?.[index - 1];
    if (!u?.histLean) return;
    const b = node.querySelector('.meter-badge, .tok-badge');
    if (b && !/Fresh start after the break/.test(b.title)) b.title += `\nFresh start after the break: ≈ ${fmt(u.histLean.to)} sent instead of re-reading ≈ ${fmt(u.histLean.from)} (the cache had expired)`;
  }

  // /history-lean [now | off | on]: what the next message would do; ask for a fresh lighter start; this chat's switch
  function words(chat, d) {
    if (!d) return 'Run this in a chat.';
    const i = d.input;
    const ttl = i.ttl.known ? `${Math.round(i.ttl.ms / 60000)} min (as the engine reported)` : i.engine === 'codex' ? 'about 5–10 min, up to an hour' : 'an hour (a subscription\'s; the engine reports it with the next reply)';
    const gap = Number.isFinite(i.gap) ? `${Math.max(1, Math.round(i.gap / 60000))} min ago` : 'not yet';
    return [`Next message: ${d.rebase ? `a fresh start with the lighter history, ≈ ${fmt(d.after)} tokens instead of re-reading ≈ ${fmt(d.before)}` : `resumes the session (${d.why})`}.`,
      `Last reply ${gap}; the prompt cache lives ${ttl}. The lighter history: ≈ ${fmt(i.lean)} tokens (${i.stubs.tools} tool results, ${i.stubs.pictures} pictures, ${i.stubs.code} code versions as stubs${i.dropped ? `, ${i.dropped} oldest messages left for chat_do earlier` : ''}).`,
      chat.leanOff ? 'This chat keeps its full history (/history-lean on to undo).' : ''].filter(Boolean).join('\n');
  }

  if (typeof Native !== 'undefined') {
    Native.hooks.send.push(onSend);
    Native.hooks.message.push(onMessage);
  }
  if (typeof Commands !== 'undefined' && !Commands.get('history-lean')) {
    Commands.register({
      name: 'history-lean', aliases: ['lighter-history'], area: 'Messages', args: '[now | off | on]',
      desc: 'After a break, a long chat goes on with a lighter history (tool results and pictures not sent again): what the next message would do',
      complete: () => ['now', 'off', 'on'].map((value) => ({ value })),
      run: async (args, ctx) => {
        const a = String(args || '').trim().toLowerCase();
        const chat = Native.chatOf(ctx.agentId);
        if (!chat) return 'Open a chat first.';
        if (a === 'off') { chat.leanOff = true; Native.save(chat); return 'This chat keeps its full history after breaks.'; }
        if (a === 'on') { delete chat.leanOff; Native.save(chat); return 'This chat goes on with a lighter history after breaks (when it pays).'; }
        if (a === 'now') {
          if (!chat.session?.id) return 'This chat has no session to make lighter yet.';
          chat.leanNext = true; Native.save(chat);
          const d = plan(chat);
          return d?.rebase ? `Your next message starts a fresh session with the lighter history (≈ ${fmt(d.after)} tokens instead of ≈ ${fmt(d.before)}).` : `Not now: ${d?.why || 'no reply yet'}.`;
        }
        return words(chat, plan(chat));
      },
    });
  }

  return { plan, context, onSend, built };
})();
window.HistoryLean = HistoryLean;
