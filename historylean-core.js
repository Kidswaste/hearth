// Lighter history (round 50, historylean), the pure part: what a long chat re-sends to the AI after a break, and when
// a fresh session with a lighter history costs less than resuming the old one.
// Why: both engines keep the chat's history in their own session (Claude Code's session file, Codex's thread) and
// re-read all of it with every message and every tool step: old tool results (whole file reads, console dumps, layer
// lists), the pictures Claude looked at, attachments, every version of the code, long answers acted on long ago. Neither
// engine lets Hearth edit a session (no supported flag or API trims it), and a warm prompt cache makes re-reading it
// cheap (≈ 0.1×). But once the cache has expired (Claude: 5 minutes on an API key, 1 hour on a subscription — Claude
// Code says which in each reply's usage; Codex: about 5–10 minutes, up to an hour), the next message re-reads the
// whole session at full price anyway. At that moment Hearth starts a fresh session whose first message carries a
// lighter history it builds from the chat itself: every word the owner wrote and the AI answered, but tool results
// and pictures as one-line stubs, earlier code versions as stubs, older long answers shortened. No cache is broken
// (it was gone), nothing in the chat changes, and the AI can fetch any earlier message word for word (chat_do earlier).
// A warm cache is only broken when the numbers say so by a wide margin (never mid-task).
// Node-testable: dev/historylean-test.js (the builder, the decision, a simulator for 40 / 100 / 300 exchanges).
const HistoryLeanCore = (() => {
  const KEEP = 2; // the last exchanges go word for word (what the owner just talked about)
  const RECENT = 8; // the exchanges before those: lightly trimmed
  const MAX_CHARS = 48000; // the lighter history at most (≈ 12k tokens); older exchanges drop first, the goal stays
  const KEEP_CHARS = 16000; // one message of the last exchanges at most (a huge paste is clipped in the middle)
  const RECENT_USER = 1600; const RECENT_REPLY = 1200; // a recent exchange
  const OLD_USER = 500; const OLD_REPLY = 320; // an older exchange
  const CODE_LINES = 12; // a code block longer than this is a stub when a newer version follows (or it's old)
  const CODE_KEEP_LINES = 120; // the newest version of a piece of code is kept whole up to this many lines
  const FLOOR = 20000; // a chat that re-reads less than this a message never restarts
  const MIN_SAVE = 8000; // …nor when the lighter history saves less than this
  const SHARE = 0.7; // the lighter start must be at most 70 % of what resuming re-reads
  const HORIZON = 6; // messages after this one that profit (a chat that got this long tends to go on)
  const READ = 0.1; // a cache read, relative to fresh input (both engines)
  const WRITE = { claude: 1.25, codex: 1 }; // what fresh input costs: Claude writes the cache (≈ 1.25×), Codex doesn't charge for it
  const REREAD = 3000; // a fresh session mid-task may re-read one thing it had (a layer's code, a file): counted against it
  const WRAP = 90; // the lines around the history (tokens)
  const MIN = 60000;
  const TTL = { '5m': 5 * MIN, '1h': 60 * MIN };

  const tok = (s) => Math.ceil(String(s || '').length / 4);
  const fmt = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n || 0)));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const talk = (m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'opinion') && !m.compactReq && !m.compactSummary && !m.handoffBrief && (m.text || m.ctx || m.attachments?.length);
  const who = (m) => (m.role === 'user' ? 'User' : m.role === 'opinion' ? `${m.from || 'Another AI'} (second opinion)` : 'Assistant');
  // a long text: its start and end, and how much was left out between them
  function clipMid(s, n) {
    s = String(s || '');
    if (s.length <= n) return s;
    const head = Math.round(n * 0.65); const tail = Math.round(n * 0.3);
    return `${s.slice(0, head).trimEnd()} […≈ ${fmt(tok(s.slice(head, s.length - tail)))} tokens left out…] ${s.slice(-tail).trimStart()}`;
  }

  // ---------- the cache ----------
  // How long this engine's prompt cache lives: Claude Code reports it in each reply's usage (engines.js: usage.ttl from
  // cache_creation's ephemeral_1h / ephemeral_5m); unknown counts as an hour (a subscription's default: never break a
  // cache that may be warm). Codex's cache lives about 5–10 minutes, at most an hour.
  function ttlOf(engine, usage) {
    if (engine === 'codex') return { ms: 60 * MIN, known: false, curve: true };
    const t = usage?.ttl;
    return t && TTL[t] ? { ms: TTL[t], known: true } : { ms: 60 * MIN, known: false };
  }
  // when a send preview should count the cache as gone (Codex: past its usual 10 minutes)
  const expiresAfter = (engine, usage) => (engine === 'codex' ? 10 * MIN : ttlOf(engine, usage).ms);
  // the chance the cache is still warm `gap` ms after the last reply
  function warmth(engine, gap, ttl = ttlOf(engine)) {
    if (!Number.isFinite(gap)) return 0;
    if (ttl.curve) return gap < 5 * MIN ? 1 : gap < 10 * MIN ? 0.6 : gap < 60 * MIN ? 0.15 : 0;
    return gap < ttl.ms + MIN ? 1 : 0; // a minute of margin
  }

  // ---------- what a reply really re-read ----------
  // the context of a reply's last model call: Codex reports it (contextInput); Claude reports the sum over all its tool
  // steps, so it's that sum over the steps (tools + 1), a little more for the growth within the reply
  function ctxOf(m) {
    const u = m?.usage;
    if (!u) return 0;
    if (Number.isFinite(u.contextInput)) return u.contextInput;
    const steps = clamp((Array.isArray(m.tools) ? m.tools.length : 0) + 1, 1, 24);
    return Math.round(Math.min(u.input || 0, steps > 1 ? (u.input || 0) / steps * 1.15 : (u.input || 0)));
  }
  // model calls per reply, the chat's recent average (each one re-reads the history)
  function stepsOf(messages) {
    const rs = (messages || []).filter((m) => m.role === 'assistant' && m.usage).slice(-6);
    if (!rs.length) return 1;
    return clamp(rs.reduce((n, m) => n + (Array.isArray(m.tools) ? m.tools.length : 0) + 1, 0) / rs.length, 1, 8);
  }

  // ---------- the lighter history ----------
  const FENCE = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g;
  const FILE = /([\w.-]+\/)*[\w-]+\.(?:m?js|ts|tsx|jsx|py|html|css|glsl|frag|vert|json|md|sh|rb|go|rs|java|c|cpp|h|swift|kt|txt|yml|yaml)\b/;
  // a code block's identity: the file it names (in its first lines or just before it), else its language
  const codeKey = (lang, body, before) => { const f = (String(body).split('\n').slice(0, 3).join('\n').match(FILE) || String(before).slice(-200).match(FILE) || [])[0]; return `${(lang || 'code').toLowerCase()}|${f || ''}`; };
  // every long code block of the chat → its key; the newest of each key is "current", the others superseded
  function codeIndex(list) {
    const newest = new Map(); // key → [message index, block index]
    list.forEach((m, i) => {
      if (m.role === 'user' && !/```/.test(m.text || '')) return;
      let b = 0;
      for (const x of String(m.ctx || m.text || '').matchAll(FENCE)) { if (x[2].split('\n').length > CODE_LINES) newest.set(codeKey(x[1], x[2], String(m.text).slice(0, x.index)), `${i}:${b}`); b += 1; }
    });
    return new Set(newest.values());
  }
  // the code blocks of an older message: superseded or too long → a one-line stub
  function stubCode(text, i, current) {
    let b = 0;
    return String(text || '').replace(FENCE, (all, lang, body) => {
      const lines = body.split('\n').length - (body.endsWith('\n') ? 1 : 0);
      const id = `${i}:${b++}`;
      if (lines <= CODE_LINES) return all;
      if (current.has(id) && lines <= CODE_KEEP_LINES) return all;
      return `[code${lang ? ` (${lang})` : ''}, ${lines} lines: ${current.has(id) ? 'long, left out' : 'an earlier version, a newer one follows'}]`;
    });
  }
  // what was attached, as stubs (pictures and files aren't sent again)
  function attachStubs(m) {
    return (m.attachments || []).map((a) => (a.kind === 'image' ? `[picture: ${a.name || 'image'}, not sent again]` : `[attached: ${a.name || 'a file'}${a.tokens || a.lean?.tokens ? ` (≈ ${fmt(a.tokens || a.lean.tokens)} tokens)` : ''}, not sent again]`)).join(' ');
  }
  // the tools a reply used, one line (their results aren't sent again)
  function toolLine(m) {
    const ts = Array.isArray(m.tools) ? m.tools : [];
    if (!ts.length) return '';
    const n = new Map(); for (const t of ts) n.set(t, (n.get(t) || 0) + 1);
    let s = [...n].map(([t, k]) => (k > 1 ? `${t} ×${k}` : t)).join(', ');
    if (s.length > 180) s = `${s.slice(0, 177)}…`;
    return `[used ${s}; results not sent again]`;
  }
  // the user's words without the attachments' bodies Hearth packed in (<file …>…</file>, the attached-files list)
  const ownWords = (m) => String(m.ctx || m.text || '').replace(/<file\b[^>]*>[\s\S]*?<\/file>/g, '').trim();
  // one message at its tier: 'keep' (word for word), 'recent', 'old'
  function render(m, tier, i, current) {
    const head = `${who(m)}: `;
    if (m.role === 'user') {
      const stubs = attachStubs(m);
      if (tier === 'keep') {
        // what was really sent (a trimmed file's parts included), pictures as stubs
        const sent = String(m.sent || m.ctx || m.text || '').replace(/\n\n\[Attached (?:image|files)[^\]]*\][\s\S]*$/, '');
        return `${head}${clipMid(sent, KEEP_CHARS)}${(m.attachments || []).some((a) => a.kind === 'image') ? ` ${(m.attachments || []).filter((a) => a.kind === 'image').map((a) => `[picture: ${a.name || 'image'}, not sent again]`).join(' ')}` : ''}`;
      }
      const words = clipMid(stubCode(ownWords(m), i, current), tier === 'recent' ? RECENT_USER : OLD_USER);
      return `${head}${words}${stubs ? `${words ? ' ' : ''}${stubs}` : ''}`;
    }
    const tools = toolLine(m);
    if (tier === 'keep') return `${head}${clipMid(m.ctx || m.text, KEEP_CHARS)}${tools ? `\n${tools}` : ''}`;
    const body = clipMid(stubCode(m.ctx || m.text, i, current), tier === 'recent' ? RECENT_REPLY : OLD_REPLY);
    return `${head}${body}${tools ? `\n${tools}` : ''}`;
  }

  // The part of the chat the lighter history covers, and what stands before it: the Continue lighter summary or the
  // handoff brief the session began from (whichever is newer).
  function scope(chat, upto) {
    const ms = (chat?.messages || []).slice(0, upto);
    const c = chat?.compact; const h = chat?.handoff;
    if (c && c.index >= (h?.at ?? -1) && c.summary) return { head: `<summary>\n${c.summary}\n</summary>`, list: ms.slice(c.tail ?? c.index) };
    if (h?.brief && !h.whole) return { head: h.brief, list: ms.slice(h.at) };
    return { head: '', list: ms };
  }

  // chat (its messages; the last one is the message being sent unless `upto` says otherwise) → { text (the message to
  // send: the lighter history + the owner's text), history (the history alone), tokens, dropped, stubs }
  // o: { chatTools (the AI can call chat_do earlier), upto (messages before this index), text (the message) }
  function build(chat, o = {}) {
    const upto = o.upto ?? Math.max(0, (chat?.messages?.length || 0) - 1);
    const { head, list: raw } = scope(chat, upto);
    const list = raw.filter(talk);
    const current = codeIndex(list);
    // tiers: from the end, the last KEEP exchanges word for word, then RECENT trimmed, then the rest shortened
    let users = 0;
    const tiers = new Array(list.length);
    for (let i = list.length - 1; i >= 0; i--) {
      tiers[i] = users < KEEP ? 'keep' : users < KEEP + RECENT ? 'recent' : 'old';
      if (list[i].role === 'user') users += 1;
    }
    const rows = list.map((m, i) => render(m, tiers[i], i, current));
    // over the cap: the oldest rows go (the first message, the goal, always stays)
    let total = rows.reduce((n, r) => n + r.length + 2, 0) + head.length;
    let cut = 1; // rows[1..cut) are dropped
    while (total > MAX_CHARS && cut < rows.length - 1 && tiers[cut] !== 'keep') { total -= rows[cut].length + 2; cut += 1; }
    const dropped = cut - 1;
    const fetch = o.chatTools ? 'chat_do {op: "earlier", query: "<words>"} returns any earlier message word for word' : 'ask me if you need an earlier detail';
    const kept = dropped > 0 ? [rows[0], `[… ${dropped} earlier messages left out here; ${o.chatTools ? 'chat_do earlier finds them' : 'ask me for them'} …]`, ...rows.slice(cut)] : rows;
    const history = [head, kept.join('\n\n')].filter(Boolean).join('\n\n');
    const stubs = { tools: list.reduce((n, m) => n + (Array.isArray(m.tools) ? m.tools.length : 0), 0), pictures: list.reduce((n, m) => n + (m.attachments || []).filter((a) => a.kind === 'image').length, 0), code: (history.match(/\[code[^\]]*lines: /g) || []).length, clipped: (history.match(/\[…≈ /g) || []).length };
    const intro = `We continue this chat in a fresh session to save tokens. Here is our conversation so far, lighter: tool results and pictures are not sent again, and earlier code versions and older long answers are shortened (in [brackets]). Re-run a tool to see the current state; ${fetch}. Continue naturally; don't redo finished work.`;
    const text = `${intro}\n\n<earlier_conversation>\n${history}\n</earlier_conversation>\n\n${o.text ?? ''}`;
    return { text, history, tokens: tok(text) - tok(o.text ?? ''), dropped, stubs, messages: list.length };
  }

  // ---------- the decision ----------
  // input: { engine, ctx (what resuming re-reads: the last reply's context), gap (ms since the last reply), ttl
  //   (ttlOf), lean (tokens of the lighter history), fixed (prompt + tools, every message pays it), steps (model calls
  //   per reply), tools (the last reply used tools: mid-task), off, force, blocked (a reason it can't: an attachment
  //   that points at the old session…) }
  // → { rebase, why, before, after, warm (the chance the cache is warm), gain (full-price tokens over the next few
  //   messages), extra (what restarting costs more right now) }
  function decide(i) {
    const engine = i.engine === 'codex' ? 'codex' : 'claude';
    const before = Math.round(i.ctx || 0);
    const after = Math.round((i.fixed || 0) + (i.lean || 0) + WRAP);
    const out = { rebase: false, why: '', before, after };
    if (i.off) return { ...out, why: 'off' };
    if (i.blocked) return { ...out, why: i.blocked };
    if (!before) return { ...out, why: 'no reply yet' };
    if (!i.force && before < FLOOR) return { ...out, why: `under ${fmt(FLOOR)}` };
    if (after > before * (i.force ? 0.95 : SHARE) || before - after < (i.force ? 1000 : MIN_SAVE)) return { ...out, why: 'the history is already lean' };
    const warm = warmth(engine, i.gap, i.ttl || ttlOf(engine));
    const W = WRITE[engine];
    const steps = clamp(i.steps || 1, 1, 8);
    const nowCont = before * (warm * READ + (1 - warm) * W);
    const nowLean = after * W + (i.tools ? REREAD * W : 0);
    const later = HORIZON * steps * READ * (before - after);
    const gain = Math.round(nowCont - nowLean + later);
    const extra = Math.round(Math.max(0, nowLean - nowCont));
    Object.assign(out, { warm, gain, extra });
    if (i.force) return { ...out, rebase: true, why: 'asked' };
    if (warm >= 0.5) {
      // a warm cache is broken only for a big, sure gain, and never mid-task (its tool results would be gone)
      if (i.tools) return { ...out, why: 'the cache is warm and it is mid-task' };
      if (gain < 3 * Math.max(extra, 1)) return { ...out, why: 'the cache is warm: not worth breaking' };
      return { ...out, rebase: true, why: 'a big history, even with the cache warm' };
    }
    if (gain <= 0) return { ...out, why: 'no gain' };
    return { ...out, rebase: true, why: warm > 0 ? 'the cache has most likely expired' : 'the cache has expired' };
  }

  // the chat's own numbers → decide()'s input (the message being sent is the last one: `upto` leaves it out)
  function inputOf(chat, agent, { now = Date.now(), upto, chatTools = false, built = null } = {}) {
    const ms = chat?.messages || [];
    const end = upto ?? ms.length;
    const prior = ms.slice(0, end);
    const last = [...prior].reverse().find((m) => m.role === 'assistant' && m.usage) || null;
    const engine = chat?.engine || agent?.engine || 'claude';
    // the fixed part: the session's first reply minus its message (what it carried included), at least 300
    const start = chat?.lean && chat.lean.at < end ? chat.lean.at : chat?.compact ? chat.compact.index : chat?.handoff ? chat.handoff.at : 0;
    const first = prior.slice(start).find((m) => m.role === 'assistant' && m.usage);
    const firstUser = prior.slice(start).find((m) => m.role === 'user');
    const carried = (firstUser?.histLean ? (firstUser.histLean.lean || 0) + WRAP : 0) + tok(firstUser?.sent || firstUser?.text);
    // (the first reply's own tool results are in it too: capped, a Director's prompt + tools is ≈ 2–4k)
    const fixed = first ? clamp(ctxOf(first) - carried, 300, 5000) : 1500;
    const b = built || build(chat, { upto: end, chatTools });
    const msg = ms[end];
    return {
      engine, ctx: ctxOf(last), gap: last?.at ? now - last.at : Infinity, ttl: ttlOf(engine, last?.usage), lean: b.tokens, fixed,
      steps: stepsOf(prior), tools: Array.isArray(last?.tools) && last.tools.length > 0,
      off: agent?.lighterAt === 0 || Boolean(chat?.leanOff), force: Boolean(chat?.leanNext),
      blocked: !chat?.session?.id ? 'no session' : chat.handoff?.whole && !(chat.compact && chat.compact.index >= chat.handoff.at) && !(chat.lean && chat.lean.at > chat.handoff.at) ? 'the whole chat was asked for' : msg?.attachments?.some((a) => a.ref) ? 'an attachment refers to the session' : msg?.compactReq ? 'compacting' : '',
      stubs: b.stubs, dropped: b.dropped,
    };
  }

  // ---------- words ----------
  const line = (d) => `↻ Fresh start after the break: ≈ ${fmt(d.after)} tokens sent instead of re-reading ≈ ${fmt(d.before)}. Earlier tool results and pictures stay in the chat; they weren't sent again.`;
  const hover = (d) => `The prompt cache had ${d.warm > 0 ? 'most likely ' : ''}expired, so resuming would have re-read the whole session at full price. A new session started with a lighter history: every message's words, tool results and pictures as one-line stubs, earlier code versions and older long answers shortened. The AI can look up any earlier message.`;

  // ---------- the simulator (dev/historylean-test.js --table) ----------
  // A synthetic chat of `n` exchanges in a profile, sent through a model of the engine's session and its prompt cache,
  // once as today (resume the session every time; the engine compacts itself past `window`) and once with the lighter
  // restart at breaks. Per message: tokens re-read (every model call's input: what usage.input reports) and the
  // full-price weight after the cache (cache reads 0.1×, Claude's cache writes 1.25×).
  const PROFILES = {
    // a coding chat: a file read and a command per reply, a code block in most answers, a trimmed file every 4th ask
    code: { fixed: 300, user: 260, answer: 650, code: 34, steps: [2600, 900], pics: 0, file: 4 },
    // pictures: one screenshot attached to every ask (1568 px ≈ 1.8k tokens), short answers
    pictures: { fixed: 300, user: 130, answer: 380, code: 0, steps: [250], pics: 1800, file: 0 },
    // the Three Director: five tool steps a reply (eval, edit, a small screenshot, read code, sliders), short answers
    director: { fixed: 2130, user: 110, answer: 260, code: 0, steps: [380, 300, 520, 1900, 320], pics: 0, file: 0, tools: ['three_eval', 'three_edit_code', 'three_screenshot', 'three_read_code', 'three_sliders'] },
  };
  const WORDS = 'shot glow layer beat camera palette kick snare bloom grain orbit spline mesh shader timing slider color frame scene light'.split(' ');
  const words = (n, k) => { let s = ''; let j = k; while (s.length < n * 4) { s += `${WORDS[j % WORDS.length]} `; j = (j * 7 + 3) % 997; } return s.slice(0, n * 4).trim(); };
  function exchange(p, k) {
    const user = { role: 'user', text: `${k}: ${words(p.user, k)}` };
    if (p.pics) user.attachments = [{ kind: 'image', name: `shot-${k}.png`, tokens: p.pics }];
    if (p.file && k % p.file === 0) { user.attachments = [...(user.attachments || []), { kind: 'text', name: `src/part-${k % 3}.js`, tokens: 1500, lean: { tokens: 1500 } }]; }
    let text = words(p.answer, k + 1);
    if (p.code) text += `\n\n\`\`\`js\n// src/app.js\n${Array.from({ length: p.code }, (_, j) => `const v${j} = ${k} * ${j}; // ${words(4, j)}`).join('\n')}\n\`\`\``;
    const reply = { role: 'assistant', text, tools: p.tools ? p.tools.slice(0, p.steps.length) : p.steps.map((_, j) => (j ? 'Bash' : 'Read · app.js')) };
    const sent = tok(user.text) + (user.attachments || []).reduce((n, a) => n + a.tokens, 0);
    return { user, reply, sent, answer: tok(text), results: p.steps.slice(), args: p.steps.length * 60 };
  }
  // the gap before exchange k (minutes): a few minutes usually, a coffee break every 7th, a long break every 20th
  const gapBefore = (k) => (k && k % 20 === 0 ? 180 : k && k % 7 === 0 ? 15 : 2);
  function simulate({ engine = 'claude', profile = 'director', n = 40, lean = false, window = 160000, afterCompact = 15000 } = {}) {
    const p = PROFILES[profile];
    const W = WRITE[engine];
    const chat = { messages: [], session: { id: 's1' }, engine };
    const ttl = ttlOf(engine, { ttl: '1h' }); // the owner's subscription: Claude's cache lives an hour
    let hist = 0; // what the session holds beyond the fixed part
    let leanStarts = 0; const per = []; const weight = [];
    let t = 0;
    for (let k = 0; k < n; k++) {
      const gap = gapBefore(k) * MIN;
      t += gap;
      const ex = exchange(p, k);
      const warm = k === 0 ? 0 : warmth(engine, gap, ttl);
      let ctx = p.fixed + hist; // what resuming re-reads before this message
      let fresh0 = 0; // tokens of the first call not served by the cache
      if (lean && k > 0) {
        chat.messages.push({ ...ex.user, at: t });
        const steps = p.steps.length + 1;
        const lastReply = chat.messages.filter((m) => m.role === 'assistant').at(-1);
        const L = build(chat, { upto: chat.messages.length - 1, chatTools: engine === 'claude' }).tokens;
        const d = decide({ engine, ctx, gap, ttl, lean: L, fixed: p.fixed, steps, tools: Boolean(lastReply?.tools?.length) });
        chat.messages.pop();
        if (d.rebase) { hist = L + WRAP; ctx = p.fixed + hist; fresh0 = ctx; leanStarts += 1; }
      }
      if (hist + p.fixed > window) { hist = afterCompact; ctx = p.fixed + hist; fresh0 = ctx; } // the engine's own compaction
      if (!fresh0) fresh0 = Math.round(ctx * (1 - warm));
      // model calls: the first reads the history + the new message; each tool result adds to the next call's input
      let inTok = 0; let w = 0; let cur = ctx + ex.sent;
      const calls = [ex.sent + 0, ...ex.results.map((r) => r + 60)];
      for (let c = 0; c < calls.length; c++) {
        if (c === 0) { inTok += cur; w += (cur - ex.sent - fresh0) * READ + (fresh0 + ex.sent) * W; } else { cur += calls[c]; inTok += cur; w += (cur - calls[c]) * READ + calls[c] * W; }
      }
      hist += ex.sent + ex.args + ex.results.reduce((a, b) => a + b, 0) + ex.answer;
      per.push(inTok); weight.push(Math.round(w));
      chat.messages.push({ ...ex.user, at: t }, { ...ex.reply, at: t + 30000, usage: { input: inTok, ttl: '1h' } });
    }
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    return { per, weight, total: sum(per), totalWeight: sum(weight), avg: Math.round(sum(per) / n), avgWeight: Math.round(sum(weight) / n), last: per.at(-1), leanStarts };
  }

  return { build, decide, inputOf, ttlOf, expiresAfter, warmth, ctxOf, stepsOf, clipMid, stubCode, codeIndex, toolLine, attachStubs, scope, line, hover, simulate, exchange,
    tok, fmt, KEEP, RECENT, MAX_CHARS, FLOOR, MIN_SAVE, SHARE, HORIZON, READ, WRITE, TTL, PROFILES, WRAP };
})();
if (typeof module !== 'undefined') module.exports = HistoryLeanCore; else window.HistoryLeanCore = HistoryLeanCore;
