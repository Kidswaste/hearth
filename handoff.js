// Lean handoffs (round 42, handoff): when work moves to the other AI, it gets a short brief instead of the whole chat.
// Where: "Continue with…" (chat menu, the chats list), /handoff (the ⚇ menu), "Ask Astra instead" / "Switch to Astra"
// on a busy line or a usage limit (offline.js), and second opinions (👁, Ctrl/⌘+Alt+O, /opinion). The brief (goal,
// decisions, files, where we are, the open question, the last exchange word for word) is made here for free by
// handoff-core.js; only when that one is weak (nothing but a goal) and the chat is big does the cheapest model write the
// summary part (autocompact's prompt and shape), and the line says what it cost. The brief rides in the message (the
// chat's `handoff`, read by native.js withContext), never in the system prompt, so prompts stay byte-stable.
// The owner sees one line: "Handed to Astra with a short brief (≈ 2k tokens instead of ≈ 38k) · Send the whole chat
// instead"; that button makes the next message (or the second opinion, asked again) carry the whole chat. The original
// chat stays as it was, and a receiving AI with the chat tools can read earlier messages (chat_do earlier).
const Handoff = (() => {
  const C = HandoffCore;
  const CHEAP = { claude: { model: 'haiku', effort: 'low' }, codex: { model: 'gpt-6-luna', effort: 'minimal' } };
  const PERSONA = 'You write tight, structured summaries of a conversation so that it can continue without its history. Plain text, no preamble.';
  // the receiver can call chat_do (engines.js chatToolsOn: Claude unless switched off, Astra when given the chat tools)
  const chatTools = (a) => Boolean(a) && (a.engine === 'claude' ? a.chatTools !== false : a.chatTools === true || (a.hubTools === true && a.chatTools !== false));
  const nameOf = (a, fallback = 'the other AI') => a?.name || fallback;

  // the brief for these messages; a weak one on a big chat gets its summary part from the cheapest model (on `to`, the
  // AI that is up: the one handed to)
  async function make(messages, { from, to, kind = 'switch', model = true } = {}) {
    const opts = { from: nameOf(from), kind, chatTools: kind !== 'opinion' && chatTools(to) };
    let b = C.build(messages, opts);
    if (model && to && C.wantsModel(b) && typeof Autocompact !== 'undefined' && window.hub?.askOnce) {
      const cheap = CHEAP[to.engine] || CHEAP.claude;
      const t = toast(`Writing a short brief for ${to.name} on the lightest model…`, { timeout: 60000 });
      try {
        const r = await window.hub.askOnce({ agentId: to.id, text: C.modelPrompt(messages), options: { lean: true, helper: true, persona: PERSONA, model: cheap.model, effort: cheap.effort, ...(to.engine === 'codex' ? { verbosity: 'low' } : {}) } });
        const s = r?.ok ? Autocompact.shape(r.text) : null;
        if (s) b = { ...C.build(messages, { ...opts, summary: s }), by: (r.usage?.input || 0) + (r.usage?.output || 0) || C.tok(C.modelPrompt(messages)) };
        if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: to.id, usage: r.usage, source: 'handoff brief' } }));
      } catch (err) { console.warn('handoff brief', err); } finally { t?.remove(); }
    }
    return b;
  }
  // the chat continues from the brief: native.js withContext sends it (then what was said since) when the engine has no
  // session of this chat. at: the messages it stands in for end here; source / sourceAt: they live in another chat.
  function attach(chat, b, { at, from, to, source = null, sourceAt = null, kind = 'switch' }) {
    chat.handoff = { brief: b.text, tokens: b.tokens, wholeTokens: b.whole, at, from: nameOf(from), to: nameOf(to), kind, ...(source ? { source, sourceAt } : {}), ...(b.by ? { by: b.by } : {}) };
    return chat.handoff;
  }
  const info = (h) => ({ tokens: h.tokens, whole: h.wholeTokens, wholeSent: Boolean(h.whole) });

  // ---------- the one line ----------
  function show(agentId, chat, { rerun = null } = {}) {
    const h = chat?.handoff;
    if (!h || H.activeChat[agentId] !== chat.id || !Native.note) return null;
    const text = C.line(h.to, info(h), { by: h.by });
    const actions = h.whole || h.kind === 'opinion-whole' ? [] : [{ label: 'Send the whole chat instead', title: `${h.to} gets every message of the chat (≈ ${C.fmt(h.wholeTokens)} tokens) instead of the brief`, run: (box) => { box.dataset.gone = '1'; box.remove(); (rerun ? rerun() : sendWhole(agentId, chat)).catch((err) => toast(err.message, { type: 'error' })); } }];
    const box = Native.note(agentId, text, { id: 'handoff', actions });
    if (box) box.title = 'The brief: the goal, decisions, files, where you are, the open question and the last exchange word for word. The whole chat stays here.';
    return box;
  }
  // "Send the whole chat instead": the next message carries every earlier message (a new engine session of this chat)
  async function sendWhole(agentId, chat) {
    const h = chat.handoff;
    if (!h) return;
    const src = h.source ? await (Native.loadWhole || Native.loadChat)(h.source) : (Native.isWin?.(chat) ? await Native.loadWhole(chat.id) : chat); // (round 86: a windowed giant chat whole first)
    const msgs = (src?.messages || []).slice(0, h.source ? h.sourceAt ?? src.messages.length : h.at);
    h.whole = C.wholeText(msgs, { name: h.from });
    h.wholeTokens = C.tok(h.whole);
    if (chat.session?.id) chat.session = {}; // the next message starts fresh, with the whole chat
    Native.save(chat);
    show(agentId, chat);
    toast(`Your next message sends ${h.to} the whole chat (≈ ${C.fmt(h.wholeTokens)} tokens)`, { timeout: 3000 });
  }

  // ---------- the places that hand off ----------
  // "Continue with…" (native.js continueWith): the copy keeps every message for you; the AI gets the brief
  async function continued(copy, origin) {
    const from = H.agent(origin.agentId); const to = H.agent(copy.agentId);
    const b = await make(copy.messages, { from, to });
    attach(copy, b, { at: copy.messages.length, from, to });
    Native.save(copy);
    show(copy.agentId, copy);
    return copy.handoff;
  }
  // a new chat with the other AI that starts from the brief (/handoff, "Ask Astra instead"): the first message shows
  // the brief to you; the original chat stays where it was (handoffFrom)
  async function startCopy(copy, origin, upTo, { from, to, title, whole = false }) {
    const msgs = origin.messages.slice(0, upTo ?? origin.messages.length);
    const b = await make(msgs, { from, to });
    copy.messages = [{ role: 'assistant', text: `**${title}**\n\n${b.display}`, at: copy.createdAt, handoffBrief: true }, ...(copy.messages || [])];
    attach(copy, b, { at: 1, from, to, source: origin.id, sourceAt: upTo ?? origin.messages.length });
    if (whole) { copy.handoff.whole = C.wholeText(msgs, { name: nameOf(from) }); copy.handoff.wholeTokens = C.tok(copy.handoff.whole); }
    return copy;
  }
  // a second opinion: the judge reads the brief (whole: the whole chat) and judges the last reply in it
  function opinion(chat, agent, judge, { whole = false, extra = '' } = {}) {
    const msgs = chat.messages;
    if (whole) {
      const w = C.wholeText(msgs, { name: agent.name });
      return { text: `The user is working with ${agent.name}. Here is their whole chat:\n<earlier_conversation>\n${w}\n</earlier_conversation>${extra}\n\nGive your second opinion on ${agent.name}'s last reply.`, handoff: { tokens: C.tok(w), wholeTokens: C.tok(w), whole: true, to: nameOf(judge, 'Astra'), from: agent.name, kind: 'opinion-whole' } };
    }
    const b = C.build(msgs, { from: agent.name, kind: 'opinion' });
    return { text: `${b.text}${extra}\n\nGive your second opinion on ${agent.name}'s last reply (the last exchange above).`, handoff: { tokens: b.tokens, wholeTokens: b.whole, to: nameOf(judge, 'Astra'), from: agent.name, kind: 'opinion' } };
  }
  // the line under a second opinion; its button asks again with the whole chat, in place of this opinion
  function opinionShown(agentId, chat, hb, judge) {
    if (!hb?.handoff || (!hb.handoff.whole && hb.handoff.wholeTokens - hb.handoff.tokens < 300)) return null; // a short chat: nothing worth saying
    const view = { ...chat, handoff: hb.handoff };
    const op = chat.messages.at(-1);
    return show(agentId, view, { rerun: async () => {
      const i = chat.messages.lastIndexOf(op);
      if (i >= 0 && op.role === 'opinion') { chat.messages.splice(i, 1); Native.save(chat); Native.refresh(agentId, { keepScroll: true }); }
      await Native.secondOpinion(agentId, judge?.id || null, { whole: true });
    } });
  }
  // Claude ⇄ Astra in the same plain chat (director-task.js handover, not a director): the brief, synchronously
  function attachNow(chat, agent, prevName) {
    const b = C.build(chat.messages.slice(0, -1), { from: prevName, chatTools: chatTools(agent) });
    attach(chat, b, { at: chat.messages.length - 1, from: { name: prevName }, to: agent });
    setTimeout(() => show(agent.id, chat), 0);
    return chat.handoff;
  }

  // ---------- ask for more: chat_do {op: "earlier"} ----------
  // the messages a brief stands in for, from the chat that is answering
  async function earlierTool(args) {
    const agentId = args?.agentId;
    const chat = agentId ? Native.chatOf(agentId) : null;
    if (Native.isWin?.(chat)) await Native.loadWhole(chat.id); // (round 86, chatwindow86) its earlier messages word for word: the chat whole first
    const h = chat?.handoff;
    // (round 50, historylean) a chat that went on with a lighter history: any of its messages, word for word
    if (chat?.lean && !(h && h.at > chat.lean.at)) return { ok: true, value: C.earlier(chat.messages, { query: String(args.query || ''), last: Number(args.last) || 0 }) };
    if (!h) return { ok: false, error: 'This chat has no earlier chat handed over.' };
    const src = h.source ? await (Native.loadWhole || Native.loadChat)(h.source) : (Native.isWin?.(chat) ? await Native.loadWhole(chat.id) : chat); // (round 86: a windowed giant chat whole first)
    const msgs = (src?.messages || []).slice(0, h.source ? h.sourceAt ?? src.messages.length : h.at);
    return { ok: true, value: C.earlier(msgs, { query: String(args.query || ''), last: Number(args.last) || 0 }) };
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['chat_earlier'], (tool, args) => earlierTool(args || {}));

  return { make, attach, show, sendWhole, continued, startCopy, opinion, opinionShown, attachNow, earlierTool, chatTools };
})();
window.Handoff = Handoff;
