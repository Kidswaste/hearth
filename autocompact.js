// Continue lighter (round 34, autocompact). A long chat re-reads its whole history with every message. Past a size the
// owner picks (⋯ AI setup → Spending → "Offer to continue lighter", default at about 40k tokens), and only when the
// numbers say continuing costs clearly more than a compacted continuation, one calm line shows under the reply:
//   "This chat re-reads ≈ 48k tokens each message. Continue lighter? (keeps a summary, ≈ 3k)"  [Continue lighter]
// Never silent, never blocking: nothing happens unless the owner clicks. The decision uses real numbers: what the last
// reply really sent (its context), how much of it the prompt cache served (cachewise), how much of the older history
// the last exchanges still talk about, and whether the newest message changed topic.
// Continuing lighter: the cheapest model at low effort (a lean one-shot run, no tools, no memory) writes a tight
// structured summary (goal, decisions, files and names, open tasks, where we stopped; the owner's standing instructions
// are in the system prompt already, so never repeated); the last couple of exchanges go along word for word; the chat
// keeps every message (a 🗜 divider holds the summary; old messages stay readable and in recall's search); the engine
// session restarts, so the system prompt and flags stay exactly those of a new chat (byte-stable, dev/cache-test.js).
// The manual 🗜 Compact (chat menu, /compact, the meter) uses the same cheaper path once this file is loaded.
// The saving shows where tokens already show: the chat's context meter ("≈ 3k context", hover: was 48k) and the
// token line of each reply after it (hover). The pure part (decide / transcript / shape / estimate) runs in Node too:
// dev/autocompact-test.js.
const Autocompact = (() => {
  const DEFAULT_AT = 40000;
  const PRESETS = [0, 25000, 40000, 60000, 100000]; // 0 = off
  const KEEP_EXCHANGES = 2; // the last exchanges carried word for word
  const SUMMARY_WORDS = 300;
  const SUMMARY_MAX_TOKENS = 700;
  const TRANSCRIPT_CHARS = 120000; // what the summarizer reads at most (≈ 30k tokens: the newest part, the goal kept)
  const MESSAGE_CHARS = 6000; // one older message as the summarizer reads it (a long paste is clipped in the middle)
  // the cheapest model + effort per engine (the same as Smart's "chat" tier, router.js PLAN)
  const CHEAP = { claude: { model: 'haiku', effort: 'low' }, codex: { model: 'gpt-6-luna', effort: 'minimal' } };
  // prices relative to the chat's own model's fresh input (cachewise: a cache read ≈ 0.1, a cache write ≈ 1.25)
  const CACHE_READ = 0.1;
  const CACHE_WRITE = 1.25;
  const CHEAP_INPUT = 0.2; // the cheapest model reads at about a fifth of the price
  const OUTPUT = 5; // output costs ≈ 5× input on both engines
  const WRAP = 60; // the "We compacted our earlier conversation…" lines around the summary (native.js withContext)

  const tok = (s) => Math.ceil(String(s || '').length / 4);
  const fmt = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n || 0)));
  const atOf = (agent) => (agent && agent.lighterAt === 0 ? 0 : Number(agent?.lighterAt) || DEFAULT_AT);
  const presetLabel = (n) => (n ? `≈ ${fmt(n)} tokens` : 'Off'); // (round 35, bugbash2) "At about 40k tokens" was cut off in its box (Spending's limit row says ≈ too)
  const STOP = new Set('the and for that this with you your are was were have has had not but can will would could should just like into from them they then than what when where which who how about there their here also some more very much make made want need lets let use its our out all any one two get got now new yes okay sure please thanks thank'.split(' '));
  const words = (t) => { const s = new Set(); for (const w of String(t || '').toLowerCase().replace(/```[\s\S]*?```/g, ' ').match(/[a-z][a-z0-9_-]{2,}/g) || []) if (!STOP.has(w)) s.add(w.slice(0, 6)); return s; };
  const shared = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
  const talk = (m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'opinion') && !m.compactReq && !m.compactSummary && m.text;
  const usageOf = (chat) => [...(chat?.messages || [])].reverse().find((m) => m.role === 'assistant' && m.usage)?.usage || null;

  // Where the verbatim tail starts: the user message that opens the last `keep` exchanges (never before `from`).
  function tailStart(messages, keep = KEEP_EXCHANGES, from = 0) {
    let seen = 0;
    for (let i = messages.length - 1; i >= from; i--) {
      const m = messages[i];
      if (m.role === 'user' && !m.compactReq && ++seen === keep) return i;
    }
    return from;
  }
  // The part a summary replaces: everything talked since the last summary (or the start), before the verbatim tail.
  function split(chat, keep = KEEP_EXCHANGES) {
    const ms = chat?.messages || [];
    const from = chat?.compact ? (chat.compact.tail ?? chat.compact.index) : 0;
    const tail = tailStart(ms, keep, from);
    return { from, tail, older: ms.slice(from, tail).filter(talk), kept: ms.slice(tail).filter(talk), previous: chat?.compact?.summary || '' };
  }
  const historyTok = (list) => list.reduce((n, m) => n + tok(m.ctx || m.text) + 4, 0);

  // ---------- the decision ----------
  // input: { ctx (what the last reply sent), cached (of it from the cache), at (the owner's size; 0 = off), fixed (the
  // part every message sends anyway: prompt + tools, from the chat's first reply), older / kept (messages), previous
  // (an earlier summary), userCount, lastUser (text), hitRate (share of recent input served by the cache) }
  // → { offer, why, before, after, perMessage: [continue, lighter], cost, horizon, relevance, topic, factor }
  function decide(input) {
    const at = input.at ?? DEFAULT_AT;
    const ctx = input.ctx || 0;
    const out = { offer: false, before: ctx, after: 0, why: '' };
    if (!at) return { ...out, why: 'off' };
    if (!ctx) return { ...out, why: 'no reply yet' };
    const older = input.older || [];
    const kept = input.kept || [];
    if (!older.length) return { ...out, why: 'nothing older than the last exchanges' };
    const olderTok = historyTok(older) + tok(input.previous);
    const keptTok = historyTok(kept);
    const summaryTok = Math.min(SUMMARY_MAX_TOKENS, Math.max(120, Math.round(olderTok * 0.08)));
    const fixed = Math.max(0, Math.min(input.fixed || 0, ctx - keptTok));
    const after = fixed + summaryTok + keptTok + WRAP;
    out.after = after;
    // how much of the older history the last exchanges still talk about (a message sharing ≥ 2 of their words)
    const recent = words(kept.map((m) => m.text).join(' '));
    const olderWords = older.map((m) => ({ t: tok(m.ctx || m.text), w: words(m.text) }));
    const relTok = olderWords.reduce((n, x) => n + (shared(x.w, recent) >= Math.min(2, x.w.size) ? x.t : 0), 0);
    const relevance = olderTok ? Math.min(1, relTok / olderTok) : 1;
    // a topic change: the newest message shares (almost) nothing with the older history
    const lastWords = words(input.lastUser);
    const all = new Set(); for (const x of olderWords) for (const w of x.w) all.add(w);
    const topic = lastWords.size >= 4 && shared(lastWords, all) / lastWords.size < 0.2;
    const factor = topic ? 0.6 : relevance < 0.35 ? 0.75 : 1;
    Object.assign(out, { relevance: Math.round(relevance * 100) / 100, topic, factor });
    if (ctx < at * factor) return { ...out, why: `under ${fmt(at * factor)}` };
    if (after > ctx * 0.5) return { ...out, why: 'most of it is the last exchanges' };
    // per message, in full-price input tokens: the cache serves `hit` of the context at a tenth of the price
    const hit = Math.max(0, Math.min(1, input.hitRate ?? (ctx ? (input.cached || 0) / ctx : 0)));
    const rate = hit * CACHE_READ + (1 - hit);
    const cont = ctx * rate;
    const light = after * rate;
    // what continuing lighter costs once: the cheapest model reads the older part and writes the summary, and the
    // first message after it writes the (small) new start to the cache
    const cost = Math.round(Math.min(olderTok, TRANSCRIPT_CHARS / 4) * CHEAP_INPUT + summaryTok * OUTPUT * CHEAP_INPUT + after * CACHE_WRITE);
    // how many more messages to expect: a chat that got this long tends to go on (half its messages so far, 3–12)
    const horizon = Math.max(3, Math.min(12, Math.round((input.userCount || 0) / 2)));
    const gain = Math.round(horizon * (cont - light));
    Object.assign(out, { perMessage: [Math.round(cont), Math.round(light)], cost, horizon, gain, hit: Math.round(hit * 100) / 100 });
    // "clearly more": the next few messages would save at least twice what continuing lighter costs
    if (gain < cost * 2) return { ...out, why: 'the cache already makes it cheap enough' };
    out.offer = true;
    out.why = topic ? 'a new topic' : relevance < 0.35 ? 'most of the history is no longer talked about' : 'a long chat';
    return out;
  }
  // the numbers of a chat (its messages, its agent's size) → decide()
  function inputOf(chat, agent) {
    const u = usageOf(chat);
    const { older, kept, previous } = split(chat);
    const replies = (chat?.messages || []).filter((m) => m.role === 'assistant' && m.usage).slice(-4);
    const hitRate = replies.length > 1 ? replies.slice(1).reduce((n, m) => n + (m.usage.cached || 0) / Math.max(1, m.usage.input), 0) / (replies.length - 1) : undefined;
    // the fixed part: the first reply of this session's start (prompt + tools + its first message) minus that message
    const ms = chat?.messages || [];
    const start = chat?.compact ? chat.compact.index : 0;
    const first = ms.slice(start).find((m) => m.role === 'assistant' && m.usage);
    const firstUser = ms.slice(start).find((m) => m.role === 'user');
    const carried = chat?.compact ? tok(chat.compact.summary) + WRAP + historyTok(ms.slice(chat.compact.tail ?? start, start).filter(talk)) : 0;
    const fixed = first ? Math.max(300, first.usage.input - tok(firstUser?.sent || firstUser?.text) - carried) : 1500;
    return { ctx: u?.input || 0, cached: u?.cached || 0, at: atOf(agent), fixed, older, kept, previous, hitRate,
      userCount: ms.filter((m) => m.role === 'user' && !m.compactReq).length, lastUser: [...ms].reverse().find((m) => m.role === 'user')?.text || '' };
  }
  const line = (d) => `This chat re-reads ≈ ${fmt(d.before)} tokens each message. Continue lighter? (keeps a summary, ≈ ${fmt(d.after)})`;

  // ---------- the summary ----------
  const HEADS = ['Goal', 'Decisions', 'Files and names', 'Open tasks', 'Where we stopped'];
  const PERSONA = 'You write tight, structured summaries of a conversation so that it can continue without its history. Plain text, no preamble.';
  const clipMid = (s, n) => (s.length > n ? `${s.slice(0, Math.round(n * 0.6))} […] ${s.slice(-Math.round(n * 0.3))}` : s);
  const who = (m) => (m.role === 'user' ? 'User' : m.role === 'opinion' ? `${m.from || 'Another AI'} (second opinion)` : 'Assistant');
  // what the summarizer reads: the older part only (no dates, ids or times: the same chat gives the same bytes)
  function transcript({ older = [], previous = '' } = {}, max = TRANSCRIPT_CHARS) {
    const rows = older.map((m) => `${who(m)}: ${clipMid(String(m.ctx || m.text).replace(/<(file)\b[^>]*>[\s\S]*?<\/\1>/g, '[attached file]').trim(), MESSAGE_CHARS)}`);
    let body = rows.join('\n\n');
    if (body.length > max) { const goal = rows[0] || ''; body = `${goal}\n\n[…]\n\n${body.slice(-(max - goal.length - 10))}`; }
    return `${previous ? `<earlier_summary>\n${previous}\n</earlier_summary>\n\n` : ''}${body}`;
  }
  function prompt(parts) {
    return `Summarize this conversation so it can continue without its history. Reply with only these parts, in this order, as terse lines (under ${SUMMARY_WORDS} words in all):
Goal: one line
Decisions: "- " lines, what was decided or chosen, with exact values
Files and names: "- " lines, files, scenes, layers, settings, with their exact names
Open tasks: "- " lines, what is left or in progress
Where we stopped: one line
Leave out the user's standing instructions and preferences (the assistant has them already), small talk, and anything settled that no longer matters. The last exchanges are kept word for word after your summary.

<conversation>
${transcript(parts)}
</conversation>`;
  }
  // the model's reply → the summary's shape (its parts in order, capped); null when it isn't one
  function shape(text) {
    let t = String(text || '').replace(/```[a-z]*\n?|```/g, '').replace(/\r/g, '').trim();
    const heads = HEADS.map((h) => new RegExp(`^\\s*(?:[#*_ ]*)${h}(?:[*_ ]*)\\s*:`, 'im'));
    const found = heads.filter((re) => re.test(t)).length;
    if (found < 2) return null;
    const firstAt = Math.min(...heads.map((re) => { const m = re.exec(t); return m ? m.index : Infinity; }));
    t = t.slice(firstAt);
    // one part per heading, in the fixed order (a part the model left out is left out)
    const parts = [];
    for (let i = 0; i < HEADS.length; i++) {
      const m = heads[i].exec(t);
      if (!m) continue;
      const rest = t.slice(m.index + m[0].length).replace(/^[*_]+[ \t]*/, '').replace(/^[ \t]+/, '');
      const ends = heads.map((re) => { const x = re.exec(rest); return x ? x.index : Infinity; });
      const body = rest.slice(0, Math.min(...ends)).split('\n').map((l) => l.trim().replace(/^[*•]\s+/, '- ').replace(/^\*\*|\*\*$/g, '')).filter((l) => l && !/^[-–]\s*$/.test(l));
      if (!body.length || /^(?:-\s*)?(?:none|n\/a|nothing)\.?$/i.test(body.join(' '))) continue;
      const inline = body.length === 1 && !body[0].startsWith('- ');
      parts.push({ h: HEADS[i], lines: inline ? [body[0]] : body.map((l) => (l.startsWith('- ') ? l : `- ${l}`)), inline });
    }
    return cap(parts);
  }
  // over the cap: the longest list loses its oldest lines first; the goal and where we stopped stay
  function cap(parts) {
    const text = () => parts.map((p) => (p.inline ? `${p.h}: ${p.lines[0]}` : `${p.h}:\n${p.lines.join('\n')}`)).join('\n');
    let s = text();
    while (tok(s) > SUMMARY_MAX_TOKENS) {
      const lists = parts.filter((p) => !p.inline && p.lines.length > 1).sort((a, b) => b.lines.length - a.lines.length);
      if (!lists.length) { s = `${s.slice(0, SUMMARY_MAX_TOKENS * 4 - 1)}…`; break; }
      lists[0].lines.shift();
      s = text();
    }
    return s || null;
  }
  // the free summary (context-core.js localSummary) in the same shape: used when the model's reply isn't a summary
  function fromLocal(ls, previous = '') {
    if (!ls) return previous || '';
    const parts = [
      { h: 'Goal', lines: [ls.goal || 'continue the conversation'], inline: true },
      ls.decisions?.length ? { h: 'Decisions', lines: ls.decisions.map((s) => `- ${s}`) } : null,
      [...(ls.files || []), ...(ls.names || [])].length ? { h: 'Files and names', lines: [...(ls.files || []), ...(ls.names || [])].slice(-12).map((s) => `- ${s}`) } : null,
      ls.open?.length ? { h: 'Open tasks', lines: ls.open.map((s) => `- ${s}`) } : null,
      ls.done?.length ? { h: 'Where we stopped', lines: [ls.done.at(-1)], inline: true } : null,
    ].filter(Boolean);
    return cap(parts);
  }

  // ---------- in the app ----------
  const inApp = typeof window !== 'undefined' && typeof Native !== 'undefined';
  const handles = (agent) => atOf(agent) > 0; // the offer replaces the long-chat banner and the silent auto-compact
  const running = new Set(); // chat ids being summarized
  const gone = (box) => { if (box) { box.dataset.gone = '1'; box.remove(); } }; // a note removed for good (not back on a redraw)
  function offerFor(chat) {
    const agent = H.agent(chat.agentId);
    if (!agent || agent.mode !== 'native' || Native.isBusy(chat.id) || running.has(chat.id)) return null;
    const d = decide(inputOf(chat, agent));
    if (!d.offer) return null;
    // once per growth step: an ignored offer comes back only when the chat is half again as big
    if (chat.lighterOffered && d.before < chat.lighterOffered * 1.5) return null;
    return d;
  }
  function show(agentId, chat, d) {
    chat.lighterOffered = d.before;
    Native.save(chat);
    const box = Native.note(agentId, line(d), { id: 'autocompact', actions: [{ label: '🗜 Continue lighter', title: `A short summary (goal, decisions, files, open tasks) made by the cheapest model replaces the older messages for the AI; the last ${KEEP_EXCHANGES} exchanges go word for word. Every message stays in the chat.`, run: (b) => { gone(b); run(agentId).catch((err) => toast(err.message, { type: 'error' })); } }] });
    box?.classList.add('lighter-note');
    if (box) box.title = `Why now: ${d.why}. Next ${d.horizon} messages ≈ ${fmt(d.gain)} tokens lighter (full-price terms, after the cache) for ≈ ${fmt(d.cost)} once.`;
    return box;
  }
  // after a finished reply in the open chat: offer when it pays
  function onEvent(event, chat) {
    if (event.type !== 'done' || !chat || H.activeChat[chat.agentId] !== chat.id) return;
    if (Native.view(chat.agentId)?.queue?.length) return; // more is on its way
    setTimeout(() => { if (H.activeChat[chat.agentId] !== chat.id) return; const d = offerFor(chat); if (d) show(chat.agentId, chat, d); }, 300);
  }

  async function summaryFor(agent, parts, chat) {
    const cheap = CHEAP[agent.engine] || CHEAP.claude;
    let r = null;
    try { r = await window.hub.askOnce({ agentId: agent.id, text: prompt(parts), options: { lean: true, helper: true, persona: PERSONA, model: cheap.model, effort: cheap.effort, ...(agent.engine === 'codex' ? { verbosity: 'low' } : {}) } }); } catch (err) { r = { ok: false, error: err.message }; }
    const s = r?.ok ? shape(r.text) : null;
    if (s) return { text: s, by: 'model', usage: r.usage, model: cheap.model };
    // the free summary when the cheap run failed or didn't answer in shape
    if (typeof ContextCore === 'undefined' && window.Lazy) await window.Lazy.load('context').catch(() => {});
    const ls = typeof ContextCore !== 'undefined' ? ContextCore.localSummary({ ...chat, messages: parts.older }, { maxWords: SUMMARY_WORDS }) : null;
    return { text: fromLocal(ls, parts.previous) || parts.previous || '(earlier conversation)', by: 'local', usage: r?.usage, error: r?.ok ? 'not a summary' : r?.error };
  }
  // continue lighter now (the offer's button, 🗜 Compact, /compact, /lighter now)
  async function run(agentId, { auto = false } = {}) {
    const chat = Native.current(agentId);
    const agent = H.agent(agentId);
    if (!chat || !agent) throw new Error('Open a chat first.');
    if (Native.isBusy(chat.id) || running.has(chat.id)) throw new Error('Still answering');
    const parts = split(chat);
    if (!parts.older.length) { toast(`Nothing to make lighter yet: the last ${KEEP_EXCHANGES} exchanges always go word for word.`, { timeout: 2500 }); return null; }
    const d = decide({ ...inputOf(chat, agent), at: 1 });
    running.add(chat.id);
    const wait = Native.note(agentId, `🗜 Continuing lighter… (a summary on the lightest model; ${KEEP_EXCHANGES} last exchanges kept word for word)`, { id: 'autocompact' });
    try {
      const s = await summaryFor(agent, parts, chat);
      // a message sent meanwhile: its reply would bring the long session back, so the switch waits for it
      for (let i = 0; i < 1200 && Native.isBusy(chat.id); i++) await new Promise((r) => setTimeout(r, 250));
      gone(wait);
      const now = Date.now();
      const index = chat.messages.length + 1;
      chat.messages.push({ role: 'assistant', text: s.text, at: now, compactSummary: true, compactFrom: d.before, lighter: { kept: KEEP_EXCHANGES, by: s.by, ...(s.model ? { model: s.model } : {}), ...(s.usage ? { cost: (s.usage.input || 0) + (s.usage.output || 0) } : {}) } });
      chat.compact = { summary: s.text, index, tail: parts.tail, at: now, lighter: { before: d.before, after: d.after } };
      chat.session = {}; // a new engine session: the system prompt and flags are those of a new chat (byte-stable)
      chat.longDismissed = false;
      delete chat.lighterOffered;
      Native.save(chat);
      if (H.activeChat[agentId] === chat.id) Native.refresh(agentId, { keepScroll: true });
      toast(`${auto ? 'Long chat: ' : ''}Continuing lighter${d.before ? ` · next message ≈ ${fmt(d.after)} tokens instead of ${fmt(d.before)}` : ''}${s.by === 'local' ? ' (summary made here, free)' : ''}`, { timeout: 3500 });
      return chat.compact;
    } finally { running.delete(chat.id); gone(wait); }
  }

  // the saving in the existing readouts: the reply's token line (hover) after continuing lighter
  function onMessage(node, m, index, agent) {
    if (!m.usage || m.role !== 'assistant') return;
    const chat = Native.current(agent.id);
    const lt = chat?.compact?.lighter;
    if (!lt || index < chat.compact.index || !(lt.before > m.usage.input)) return;
    const b = node.querySelector('.meter-badge, .tok-badge');
    if (b && !/Continued lighter/.test(b.title)) b.title += `\nContinued lighter: ≈ ${fmt(m.usage.input)} instead of ≈ ${fmt(lt.before)} per message (≈ ${fmt(lt.before - m.usage.input)} less)`;
  }

  // ⋯ AI setup → Spending: "Offer to continue lighter"
  function row(a, { repaint } = {}) {
    const cur = atOf(a);
    const values = PRESETS.includes(cur) ? PRESETS : [...PRESETS, cur].sort((x, y) => x - y);
    const pick = el('select', { class: 'opt-pick', attrs: { 'aria-label': 'Offer to continue lighter' } }, values.map((n) => el('option', { value: String(n), text: presetLabel(n), selected: n === cur })));
    pick.addEventListener('change', async () => {
      const n = Number(pick.value) || 0;
      for (const t of new Set([a, H.agent(a.id)].filter(Boolean))) { if (n === DEFAULT_AT) delete t.lighterAt; else t.lighterAt = n; }
      await saveConfig();
      repaint?.();
    });
    return el('div', { class: 'opt-row', title: 'When a chat gets long enough that a summary would clearly cost less than re-reading everything, one line under the reply offers to continue lighter. Nothing happens unless you click.' },
      el('span', { class: 'opt-label', text: 'Offer to continue lighter' }), pick);
  }

  if (inApp) {
    Native.hooks.event.push(onEvent);
    Native.hooks.message.push(onMessage);
    if (typeof Commands !== 'undefined' && !Commands.get('lighter')) {
      Commands.register({
        name: 'lighter', aliases: ['continue-lighter'], area: 'Messages', args: '[now | off | <size, e.g. 40k>]',
        desc: 'Continue this chat lighter: a short summary + the last exchanges replace the history for the AI (every message stays)',
        complete: () => ['now', 'off', '25k', '40k', '60k', '100k'].map((value) => ({ value })),
        run: async (args, ctx) => {
          const a = String(args || '').trim().toLowerCase();
          const agent = H.agent(ctx.agentId);
          if (!agent || agent.mode !== 'native') return 'Run this in a chat.';
          if (!a || a === 'now') { await run(ctx.agentId); return undefined; }
          const m = /^(\d+(?:\.\d+)?)\s*(k)?$/.exec(a);
          if (a !== 'off' && !m) return 'Say now, off, or a size like 40k.';
          const n = a === 'off' ? 0 : Math.round(Number(m[1]) * (m[2] || Number(m[1]) < 1000 ? 1000 : 1));
          for (const t of new Set([agent, H.agent(agent.id)].filter(Boolean))) { if (n === DEFAULT_AT) delete t.lighterAt; else t.lighterAt = n; }
          await saveConfig();
          return n ? `${agent.name} offers to continue lighter once a chat re-reads about ${fmt(n)} tokens a message (and only when it pays).` : `${agent.name} no longer offers to continue lighter.`;
        },
      });
    }
  }

  return { decide, inputOf, split, tailStart, transcript, prompt, shape, fromLocal, line, run, row, handles, atOf, offerFor,
    DEFAULT_AT, PRESETS, KEEP_EXCHANGES, CHEAP, HEADS, SUMMARY_MAX_TOKENS };
})();
if (typeof module !== 'undefined') module.exports = Autocompact; else window.Autocompact = Autocompact;
