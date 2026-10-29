// Lean handoffs, the pure part (round 42, handoff). When work moves from one AI to the other (Continue with…, /handoff,
// "Ask Astra instead" on a busy line or a usage limit, a second opinion), the receiving AI has no session of this chat:
// it used to get the chat itself (the newest 24k characters, so a long chat lost its goal) or a few clipped lines. Now it
// gets a short brief made here, for free: the goal, the decisions, the files and names, the open tasks, where we stopped
// (autocompact's summary shape, from context-core's local summary), the open question, and the last exchange word for
// word. The whole chat stays in Hearth (readable, searchable) and goes along only when the owner asks ("Send the whole
// chat instead"). Node-testable: dev/handoff-test.js.
const HandoffCore = (() => {
  const req = (name, file) => (typeof globalThis[name] !== 'undefined' ? globalThis[name] : typeof require === 'function' ? require(file) : null);
  const CC = () => req('ContextCore', './context-core.js');
  const AC = () => req('Autocompact', './autocompact.js');
  const LAST_USER_CHARS = 2400; // the last exchange, word for word (a huge paste is clipped in the middle)
  const LAST_REPLY_CHARS = 3600;
  const WHOLE_CHARS = 200000; // "the whole chat": everything up to ≈ 50k tokens, the first message (the goal) always kept
  const BIG = 12000; // tokens of older history from which a weak local brief may be redone by the cheapest model
  const SUMMARY_WORDS = 220;

  const tok = (s) => Math.ceil(String(s || '').length / 4);
  const fmt = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n || 0)));
  const clipMid = (s, n) => { const t = String(s || '').trim(); return t.length > n ? `${t.slice(0, Math.round(n * 0.65))}\n[…]\n${t.slice(-Math.round(n * 0.3))}` : t; };
  const talk = (m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'opinion') && !m.compactReq && !m.handoffBrief && (m.ctx || m.text);
  const textOf = (m) => String(m.ctx || m.text || '');
  // the same rows the chat's earlier-conversation context uses (native.js withContext)
  const who = (m, name = 'Assistant') => (m.role === 'user' ? 'User' : m.role === 'opinion' ? `${m.from || 'Another AI'} (second opinion)` : name);

  // ---------- the whole chat ----------
  // what "Send the whole chat instead" sends: every message, up to ≈ 30k tokens (the goal kept, the newest part after it)
  function wholeText(messages, { name } = {}) {
    const rows = (messages || []).filter(talk).map((m) => `${who(m, name)}: ${textOf(m)}`);
    let body = rows.join('\n\n');
    if (body.length > WHOLE_CHARS) { const goal = rows[0] || ''; body = `${goal}\n\n[…]\n\n${body.slice(-(WHOLE_CHARS - goal.length - 10))}`; }
    return body;
  }
  const wholeTokens = (messages) => (messages || []).filter(talk).reduce((n, m) => n + tok(textOf(m)) + 3, 0);

  // ---------- the parts ----------
  // the last exchange: the newest user message and the reply after it (a reply alone when the chat starts with one)
  function lastExchange(messages) {
    const ms = (messages || []).filter(talk);
    const ui = ms.map((m) => m.role).lastIndexOf('user');
    if (ui < 0) return { index: ms.length, user: null, reply: ms.filter((m) => m.role === 'assistant').at(-1) || null };
    return { index: ui, user: ms[ui], reply: ms.slice(ui + 1).find((m) => m.role === 'assistant') || null };
  }
  // the open question: what the last reply asked the user (its last question), else what the user asked last
  function openQuestion(reply, user) {
    const qs = String(reply ? textOf(reply) : '').replace(/```[\s\S]*?```/g, ' ').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => /\?$/.test(s) && s.length > 8);
    if (qs.length) return { from: 'reply', text: qs.at(-1).slice(0, 300) };
    if (user && /\?/.test(textOf(user))) return { from: 'user', text: textOf(user).replace(/\s+/g, ' ').slice(0, 300) };
    return null;
  }
  // the summary block: autocompact's shape (Goal · Decisions · Files and names · Open tasks · Where we stopped) from the
  // free local summary, or a summary the cheapest model wrote (already shaped by Autocompact.shape)
  function summaryOf(messages, summary = null) {
    if (summary) return { text: summary, local: null, weak: false };
    const ms = (messages || []).filter(talk);
    if (!ms.length) return { text: '', local: null, weak: false };
    const cc = CC(); const ac = AC();
    const ls = cc ? cc.localSummary({ messages: ms.map((m) => ({ role: m.role === 'opinion' ? 'assistant' : m.role, text: textOf(m), at: m.at, suggest: m.suggest })) }, { maxWords: SUMMARY_WORDS }) : null;
    const text = ls && ac ? ac.fromLocal(ls) : ls?.text || '';
    // weak: nothing but a goal (no decision, file, name or open task found)
    const weak = !ls || !((ls.decisions?.length || 0) + (ls.files?.length || 0) + (ls.names?.length || 0) + (ls.open?.length || 0));
    return { text: text || '', local: ls, weak };
  }
  // files touched: the paths in the chat (texts, attachments, what was sent), newest last, at most 12
  function filesOf(messages) {
    const out = []; const seen = new Set(); // (round 82, bigchat82) a seen set: includes() on the growing list was quadratic in a giant chat
    const PATH = /(?:[A-Za-z]:\\|~?\/)?(?:[\w.-]+[\\/])+[\w.-]+\.[A-Za-z0-9]{1,5}\b/g;
    for (const m of messages || []) {
      for (const s of [m.text, m.sent].filter(Boolean)) for (const p of String(s).replace(/```[\s\S]*?```/g, ' ').match(PATH) || []) if (!/^https?:/.test(p) && !seen.has(p)) { seen.add(p); out.push(p); }
      for (const a of m.attachments || []) if (a?.name && /\.[A-Za-z0-9]{1,5}$/.test(a.name) && !seen.has(a.name)) { seen.add(a.name); out.push(a.name); }
    }
    return out.slice(-12);
  }

  // ---------- the brief ----------
  // messages: what the receiving AI should know (everything before the new message); opts: { from (the AI it comes
  // from), to, kind: 'switch' | 'opinion', summary (a cheap-model summary), chatTools (the receiver can call chat_do) }
  // → { text (goes in the message, never in the system prompt), display (the same for the owner, no tags), tokens,
  //     whole (tokens of the whole chat), weak, big, older (tokens summarized) }
  function build(messages, { from = 'the other AI', kind = 'switch', summary = null, chatTools = false } = {}) {
    const ms = (messages || []).filter(talk);
    const last = lastExchange(ms);
    const older = ms.slice(0, last.index);
    const olderTok = wholeTokens(older);
    // a summary only when there is something older than the last exchange (a one-exchange chat is its last exchange)
    const sum = older.length ? summaryOf(ms, summary) : { text: '', weak: false };
    const files = filesOf(messages);
    const q = openQuestion(last.reply, last.user);
    const parts = [];
    if (sum.text) parts.push(sum.text);
    // the summary names files among names; the touched paths get their own line when the summary left some out
    const missing = files.filter((f) => !sum.text.includes(f));
    if (missing.length) parts.push(`Files touched:\n${missing.map((f) => `- ${f}`).join('\n')}`);
    if (q) parts.push(`Open question${q.from === 'reply' ? ` (${from} asked)` : ''}: ${q.text}`);
    const lx = [last.user ? `User: ${clipMid(textOf(last.user), LAST_USER_CHARS)}` : null, last.reply ? `${from}: ${clipMid(textOf(last.reply), LAST_REPLY_CHARS)}` : null].filter(Boolean);
    if (lx.length) parts.push(`Last exchange, word for word:\n${lx.join('\n\n')}`);
    const whole = wholeTokens(ms);
    const head = kind === 'opinion'
      ? `[A short brief made by Hearth stands in for the user's chat with ${from} (≈ ${fmt(whole)} tokens).]`
      : `[You're taking over this conversation from ${from}. A short brief made by Hearth stands in for the earlier chat (≈ ${fmt(whole)} tokens), which stays in Hearth. Continue from here; don't redo finished work.]`;
    const more = kind === 'opinion' ? '' : chatTools
      ? '\n\n(Need an earlier detail? chat_do {op: "earlier", query: "<words>"} returns the matching earlier messages.)'
      : '\n\n(Need an earlier detail? Ask the user: Hearth can send the whole chat.)';
    const body = parts.join('\n\n');
    const text = `${head}\n<handoff_brief>\n${body}${more}\n</handoff_brief>`;
    return { text, display: body, tokens: tok(text), whole, weak: Boolean(sum.weak), big: olderTok >= BIG, older: olderTok, files, question: q?.text || '' };
  }
  // the brief is weak and the chat is big: worth asking the cheapest model for the summary part (cost shown)
  const wantsModel = (b) => Boolean(b && b.weak && b.big);
  // what the cheapest model reads to write the summary part (autocompact's prompt, the older part only)
  function modelPrompt(messages) {
    const ms = (messages || []).filter(talk);
    const last = lastExchange(ms);
    return AC().prompt({ older: ms.slice(0, last.index), previous: '' });
  }

  // the owner's one line
  const line = (to, b, { by = null } = {}) => (b.wholeSent
    ? `Handed to ${to} with the whole chat (≈ ${fmt(b.whole)} tokens)`
    : `Handed to ${to} with a short brief (≈ ${fmt(b.tokens)} tokens instead of ≈ ${fmt(b.whole)})${by ? ` · summary by the lightest model, ≈ ${fmt(by)} tokens` : ''}`);

  // ---------- "ask for more": the earlier messages that match (chat_do earlier) ----------
  function earlier(messages, { query = '', last = 0, max = 6000 } = {}) {
    const ms = (messages || []).filter(talk);
    if (!ms.length) return 'No earlier messages.';
    let pick;
    if (last) pick = ms.slice(-Math.max(1, Math.min(12, Number(last) || 2)));
    else {
      const cc = CC();
      const q = cc ? cc.words(query) : new Set(String(query).toLowerCase().split(/\W+/).filter((w) => w.length > 2));
      if (!q.size) return 'Give query (words to look for) or last (how many of the newest earlier messages).';
      // (round 82, bigchat82) a message that holds none of the words as letters can't have them: its words aren't made
      // (a 6,000-message chat: 1.4 s → a fraction; the same messages found)
      const qs = [...q];
      const scored = ms.map((m, i) => { const lc = textOf(m).toLowerCase(); if (!qs.some((x) => lc.includes(x))) return { m, i, n: 0 }; const w = cc ? cc.words(textOf(m)) : new Set(lc.split(/\W+/)); let n = 0; for (const x of q) if (w.has(x)) n++; return { m, i, n }; }).filter((x) => x.n).sort((a, b) => b.n - a.n || b.i - a.i).slice(0, 4).sort((a, b) => a.i - b.i);
      if (!scored.length) return `Nothing earlier mentions "${String(query).slice(0, 60)}".`;
      pick = scored.map((x) => x.m);
    }
    const per = Math.max(600, Math.floor(max / pick.length));
    return pick.map((m) => `${who(m)}: ${clipMid(textOf(m), per)}`).join('\n\n');
  }

  return { build, wholeText, wholeTokens, lastExchange, openQuestion, filesOf, summaryOf, wantsModel, modelPrompt, line, earlier, tok, fmt, talk, LAST_USER_CHARS, LAST_REPLY_CHARS, WHOLE_CHARS, BIG };
})();
if (typeof module !== 'undefined') module.exports = HandoffCore; else window.HandoffCore = HandoffCore;
