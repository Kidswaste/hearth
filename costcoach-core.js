// 🧭 Cost coach, the pure part (round 43, costcoach). A weekly look at where the owner's tokens really went and the
// three changes that would have saved the most, each one an existing setting (no new knob). Local, 0 tokens: it reads
// what Hearth already keeps (each reply's usage in the chats, token-stats.json's per-day totals, each AI's fixed part
// from tokenaudit) and never sends anything anywhere.
//   recordsOf(chat, o)  one chat → compact per-reply records for the window (costcoachmain.js scans with it)
//   analyse(records, o) → where it went (by AI, by kind of chat, by cause) + the fixes, biggest saving first, the top 3,
//                         what is already lean (✓), and whether the weekly note is due (a fix worth ≥ 10 % of the week)
//   lighterSaves(seq, at, fixed)  what Continue lighter at `at` tokens would have saved on one chat (offers taken)
// Estimates are named as such on screen; the rules and their ratios are written down here and in docs/upgrades/costcoach.md.
// Runs in Node too: dev/costcoach-test.js.
const CostCoachCore = (() => {
  const DAY = 864e5;
  const WINDOW_DAYS = 7;
  const tok = (s) => Math.round(String(s || '').length / 4);
  const fmt = (n) => {
    n = Math.round(n || 0);
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
  };
  const pctOf = (n, of) => (of > 0 ? Math.round((n / of) * 100) : 0);

  // missions that run several answers for one message (missions.js ids)
  const SWARMY = new Set(['split', 'swarm', 'debate', 'duo', 'jam', 'pair', 'review', 'everyone']);
  const MISSION_NAME = { split: '🧩 Split it up', swarm: '🐝 Swarm', debate: '⚔ Debate', duo: '👥 Side by side', jam: '🎛 Jam', pair: '⌨ Pair on code', review: '🔍 Answer, then review', everyone: '📢 Ask everyone' };
  const KINDS = { director: 'Lab director chats', plain: 'Plain chats', missions: 'Missions', routines: 'Routines (🔁 Keep going)', other: 'Second opinions, summaries & the rest' };
  const CAUSES = {
    reread: ['Re-reading long chats', 'Every message re-reads the chat so far'],
    prompt: ['Instructions', 'Its instructions, personality, memory: the fixed part before your words'],
    tools: ['Tool definitions', 'The tools it has, sent with every message'],
    attach: ['Attachments', 'Files, pictures and pastes you sent'],
    words: ['Your words', 'What you typed'],
    thinking: ['Thinking', 'Its thinking before it answers (How hard it thinks)'],
    output: ['Answers it wrote', 'Its answers and tool calls (How long its answers are)'],
  };
  const OVERLAYS = {
    cacheMiss: ['Cache misses', 'Re-read at full price: a chat picked up after a pause, or right after a change'],
    handoff: ['Handoffs', 'What one AI sent the other when a chat changed hands'],
    swarm: ['Swarms & multi-answer missions', 'Messages that ran several answers (split, swarm, debate, side by side…)'],
  };
  // ratios the savings use (assumptions, not measurements: docs/upgrades/costcoach.md)
  const R = {
    summary: 3000, // ≈ what a continued-lighter chat sends instead of its history (autocompact: summary + kept exchanges)
    summaryReadCap: 30000, // the cheap summary run reads at most this much
    summaryOut: 700,
    thinkMult: { low: 0.5, medium: 1, high: 1.7, xhigh: 2.4 }, // thinking per effort (routerlearn's multipliers)
    short: { normal: 0.2, high: 0.35 }, // written answer tokens Short saves (concise measured ≈ 24 % fully followed)
    toolArgs: 0.5, // of a reply that called tools, the share that's tool arguments (needed), not prose
  };
  const QUICK_CHARS = 200;
  const CODEY = /```|\b(fix|bug|error|crash|code|function|shader|layer|script|refactor|debug|stack ?trace|exception)\b/i;
  const LIGHTER_DEFAULT = 40000;
  const LIGHTER_STEPS = [40000, 25000];
  const atOf = (agent) => (agent && agent.lighterAt === 0 ? 0 : Number(agent?.lighterAt) || LIGHTER_DEFAULT);

  // ---------- one chat → records ----------
  // o: { from, to } (ms). A record per finished reply with usage in the window; the user message before it says what
  // kind of message it was (a mission, a routine round, a quick ask) and what came with it (attachments).
  function recordsOf(chat, { from = 0, to = Infinity } = {}) {
    const out = [];
    const msgs = Array.isArray(chat?.messages) ? chat.messages : [];
    if (!chat?.id || !chat.agentId) return out;
    const h = chat.handoff && Number.isFinite(chat.handoff.at) ? chat.handoff : null;
    let handed = false;
    let user = null;
    let prev = null; // the reply before (for the gap and what it added to the history)
    let n = 0;
    msgs.forEach((m, idx) => {
      if (!m) return;
      if (m.role === 'user') { user = m; return; }
      if (m.role !== 'assistant' || !m.usage) return;
      const u = m.usage;
      const at = Number(m.at) || 0;
      const first = n === 0;
      n += 1;
      const p = prev; prev = m;
      if (at < from || at > to) return;
      const o = Math.max(0, u.output || 0);
      const think = Math.min(o, Math.max(0, Number(u.reasoning) || (m.thinking ? tok(m.thinking) : 0)));
      const atts = Array.isArray(user?.attachments) ? user.attachments : [];
      const att = atts.reduce((s, a) => s + Math.max(0, Number(a?.lean?.tokens) || 0), 0);
      const whole = atts.reduce((s, a) => s + (a?.whole ? Math.max(0, Number(a?.lean?.wholeTokens) || 0) : 0), 0);
      const text = String(user?.text || '');
      const r = {
        chat: chat.id, agent: chat.agentId, at, i: Math.max(0, u.input || 0), o, c: Math.max(0, u.cached || 0), w: Math.max(0, u.cacheWrite || 0),
        think, words: tok(text), att: Math.max(att, whole), whole: whole > att ? whole - att : 0,
        kind: user?.routine ? 'routine' : user?.mission && user.mission !== 'normal' ? 'mission' : '',
        mission: user?.mission && user.mission !== 'normal' ? String(user.mission) : '',
        quick: text.length > 0 && text.length <= QUICK_CHARS && !atts.length && !CODEY.test(text),
        code: CODEY.test(text), routed: Boolean(m.route), eff: m.route?.effort || '', answers: m.answers || '',
        tools: Array.isArray(m.tools) ? m.tools.length : 0, prevO: Math.max(0, p?.usage?.output || 0), gap: p?.at ? at - p.at : 0, first,
      };
      if (u.cost) r.cost = u.cost;
      if (user?.histLean) r.histLean = Math.max(0, (user.histLean.from || 0) - (user.histLean.to || 0)); // (round 50, historylean) a fresh start after a break
      if (h && !handed && idx > h.at) { handed = true; r.handoff = Math.max(0, (h.whole ? h.wholeTokens : h.tokens) || 0); if (!h.whole && h.wholeTokens > h.tokens) r.handoffSaved = h.wholeTokens - h.tokens; }
      out.push(r);
    });
    return out;
  }

  // ---------- Continue lighter, replayed on one chat ----------
  // seq: the chat's records in order · at: the offer size (0 = off) · fixed: the fixed part of each message.
  // After a reply whose next message would re-read more than `at`, the chat continues from a summary (≈ fixed + 3k +
  // the last exchanges); every later message re-reads that much less; the summary run itself is paid (cheap model).
  function lighterSaves(seq, at, fixed = 0) {
    if (!at || !Array.isArray(seq) || seq.length < 2) return 0;
    let off = 0; let saved = 0; let grow = 0; let growN = 0;
    for (let k = 0; k < seq.length; k++) {
      const x = seq[k].i;
      if (k && x > seq[k - 1].i) { grow += x - seq[k - 1].i; growN += 1; }
      saved += Math.min(off, Math.max(0, x - fixed));
      const eff = x - off;
      if (eff > at && k < seq.length - 1) {
        const tail = Math.min(Math.max(0, eff - fixed), 2 * (growN ? grow / growN : (eff - fixed) / (k + 1)));
        const base = fixed + R.summary + tail;
        if (x - base > off) {
          saved -= Math.min(Math.max(0, eff - fixed), R.summaryReadCap) + R.summaryOut;
          off = x - base;
        }
      }
    }
    return Math.max(0, Math.round(saved));
  }

  // ---------- the analysis ----------
  // records: recordsOf() for the window · o: {
  //   agents: [{ id, name, engine, dock, effort, verbosity, lighterAt }]   the AIs as set up now
  //   stats: token-stats.json (optional: the week's real totals per AI, incl. what no chat keeps)
  //   fixed: { agentId: { prompt, tools, trims: [{ key, id, label, saves, sleeps }] } }   tokenaudit's measure
  //   pinned: { agentId: missionId }   a mission 📌 from now on
  //   now, days }
  function analyse(records = [], o = {}) {
    const now = o.now || Date.now();
    const days = o.days || WINDOW_DAYS;
    const from = now - days * DAY;
    const agents = Array.isArray(o.agents) ? o.agents : [];
    const agentOf = new Map(agents.map((a) => [a.id, a]));
    const recs = records.filter((r) => r && r.at >= from && r.at <= now && agentOf.has(r.agent));
    const fixedOf = (id) => o.fixed?.[id] || null;
    // the fixed part of one message: tokenaudit's measure, else the chat's smallest message (its first one, mostly)
    const chatMin = new Map();
    for (const r of recs) { const v = Math.max(0, r.i - r.words - r.att); chatMin.set(r.chat, Math.min(chatMin.has(r.chat) ? chatMin.get(r.chat) : Infinity, v)); }
    const fxOf = (r) => { const f = fixedOf(r.agent); const v = f ? (f.prompt || 0) + (f.tools || 0) : chatMin.get(r.chat) || 0; return Math.min(v, r.i); };
    const kindOf = (r) => (r.kind === 'routine' ? 'routines' : r.kind === 'mission' ? 'missions' : agentOf.get(r.agent)?.dock ? 'director' : 'plain');

    const cause = Object.fromEntries(Object.keys(CAUSES).map((k) => [k, 0]));
    const over = Object.fromEntries(Object.keys(OVERLAYS).map((k) => [k, 0]));
    const kinds = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
    const per = new Map(); // agentId → { tokens, replies, kinds: {}, reread: {}, think, written, … }
    const P = (id) => { if (!per.has(id)) per.set(id, { id, tokens: 0, replies: 0, kinds: {}, reread: 0, rereadKind: {}, deepThink: 0, deepQuick: 0, deepOther: 0, deepN: 0, quickN: 0, written: 0, shortDone: 0, swarm: 0, swarmN: 0, plainTokens: 0, plainN: 0, att: 0, whole: 0, handoff: 0, handoffSaved: 0, handoffN: 0, miss: 0 }); return per.get(id); };
    for (const r of recs) {
      const a = agentOf.get(r.agent);
      const p = P(r.agent);
      const t = r.i + r.o;
      const fx = fxOf(r);
      const f = fixedOf(r.agent);
      const toolShare = f && (f.prompt || 0) + (f.tools || 0) > 0 ? (f.tools || 0) / ((f.prompt || 0) + (f.tools || 0)) : 0.5;
      const att = Math.min(r.att, Math.max(0, r.i - fx));
      const words = Math.min(r.words, Math.max(0, r.i - fx - att));
      const reread = Math.max(0, r.i - fx - att - words);
      cause.tools += fx * toolShare; cause.prompt += fx * (1 - toolShare);
      cause.attach += att; cause.words += words; cause.reread += reread;
      cause.thinking += r.think; cause.output += r.o - r.think;
      // what should have come from the cache (the fixed part + the old history) but was read at full price
      const miss = r.first ? 0 : Math.max(0, fx + reread - r.c - r.prevO);
      over.cacheMiss += miss; p.miss += miss;
      if (r.histLean) { p.hlN = (p.hlN || 0) + 1; p.hlSaved = (p.hlSaved || 0) + r.histLean; }
      if (r.handoff) { over.handoff += r.handoff; p.handoff += r.handoff; p.handoffSaved += r.handoffSaved || 0; p.handoffN += 1; }
      const k = kindOf(r);
      kinds[k] += t; p.kinds[k] = (p.kinds[k] || 0) + t;
      p.tokens += t; p.replies += 1; p.reread += reread; p.rereadKind[k] = (p.rereadKind[k] || 0) + reread;
      p.att += att; p.whole += r.whole || 0;
      if (r.mission && SWARMY.has(r.mission)) { over.swarm += t; p.swarm += t; p.swarmN += 1; } else if (!r.kind) { p.plainTokens += t; p.plainN += 1; }
      // thinking on the AI's own effort (Smart's picks are already Smart's)
      const eff = !r.routed && a && (a.effort === 'high' || a.effort === 'xhigh') ? a.effort : '';
      if (eff && r.think) {
        const m = R.thinkMult[eff];
        // Smart would pick: quick asks → low, code → stays hard, the rest → medium
        const s = r.quick ? r.think * (1 - R.thinkMult.low / m) : r.code ? 0 : r.think * (1 - R.thinkMult.medium / m);
        p.deepThink += r.think; p.deepN += 1;
        if (r.quick) { p.deepQuick += s; p.quickN += 1; } else p.deepOther += s;
      }
      const written = Math.max(0, r.o - r.think) * (r.tools ? R.toolArgs : 1);
      if (r.answers === 'short') p.shortDone += written; else p.written += written;
    }
    // the week's real totals (token-stats): what no chat keeps (second opinions, summaries, deleted chats) is "other"
    const statDays = []; for (let d = 0; d < days; d++) { const t = new Date(now - d * DAY); statDays.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`); }
    for (const a of agents) {
      let st = 0; let sr = 0;
      for (const d of statDays) { const x = o.stats?.days?.[d]?.a?.[a.id]; if (x) { st += (x.i || 0) + (x.o || 0); sr += x.r || 0; } }
      if (!st && !per.has(a.id)) continue;
      const p = P(a.id);
      const rest = Math.max(0, st - p.tokens);
      if (rest) { kinds.other += rest; p.kinds.other = (p.kinds.other || 0) + rest; p.tokens += rest; p.replies = Math.max(p.replies, sr); }
    }
    const total = [...per.values()].reduce((s, p) => s + p.tokens, 0);
    const replies = [...per.values()].reduce((s, p) => s + p.replies, 0);
    const known = Object.values(cause).reduce((s, v) => s + v, 0);
    const byCause = Object.entries(CAUSES).map(([key, [label, hint]]) => ({ key, label, hint, tokens: Math.round(cause[key]), share: pctOf(cause[key], total) }));
    if (total > known + 1) byCause.push({ key: 'other', label: 'Not kept in a chat', hint: 'Second opinions, summaries, deleted chats: counted by the meter, no detail', tokens: Math.round(total - known), share: pctOf(total - known, total) });
    byCause.sort((x, y) => y.tokens - x.tokens);
    const overlays = Object.entries(OVERLAYS).map(([key, [label, hint]]) => ({ key, label, hint, tokens: Math.round(over[key]), share: pctOf(over[key], total) })).filter((x) => x.tokens > 0);
    const byKind = Object.entries(KINDS).map(([key, label]) => ({ key, label, tokens: Math.round(kinds[key]), share: pctOf(kinds[key], total) })).filter((x) => x.tokens > 0).sort((x, y) => y.tokens - x.tokens);
    const byAI = [...per.values()].map((p) => ({ id: p.id, name: agentOf.get(p.id)?.name || p.id, tokens: Math.round(p.tokens), replies: p.replies, share: pctOf(p.tokens, total) })).filter((x) => x.tokens > 0).sort((x, y) => y.tokens - x.tokens);

    // ---------- the fixes (each an existing setting) and what is already lean ----------
    const fixes = [];
    const lean = [];
    const seqs = new Map(); // chatId → its records in order
    for (const r of recs) { if (!seqs.has(r.chat)) seqs.set(r.chat, []); seqs.get(r.chat).push(r); }
    for (const s of seqs.values()) s.sort((x, y) => x.at - y.at);
    for (const p of per.values()) {
      const a = agentOf.get(p.id);
      if (!a) continue;
      const name = a.name || 'This AI';
      // 1. re-reading long chats → Continue lighter (autocompact's offer size)
      if (p.reread > 0) {
        const mine = [...seqs.values()].filter((s) => s[0].agent === p.id);
        const sim = (at) => mine.reduce((n, s) => n + lighterSaves(s, at, fxOf(s[0])), 0);
        const cur = atOf(a);
        const top = Object.entries(p.rereadKind).sort((x, y) => y[1] - x[1])[0];
        const who = top && top[1] >= p.reread * 0.6 ? `${name}'s ${top[0] === 'director' ? 'Lab' : top[0] === 'plain' ? 'plain' : top[0] === 'routines' ? 'routine' : 'mission'} chats` : `${name}'s chats`;
        // off or later than the default → the default (40k); already at it → sooner (25k) only when that clearly pays
        // more (≥ 10 % of this AI's week): a hot cache makes re-reads cheap, so the offer itself stays the judge
        let best = null;
        if (!cur || cur > LIGHTER_DEFAULT) best = { at: LIGHTER_DEFAULT, saves: sim(LIGHTER_DEFAULT) - (cur ? sim(cur) : 0) };
        else if (cur > LIGHTER_STEPS[1]) { const s = sim(LIGHTER_STEPS[1]) - sim(cur); if (s >= p.tokens * 0.1) best = { at: LIGHTER_STEPS[1], saves: s }; }
        if (best && best.saves > 0) {
          fixes.push({
            id: `lighter:${p.id}`, kind: 'lighter', agentId: p.id, saves: best.saves, button: cur ? 'Offer sooner' : 'Turn on',
            text: `${who} re-read ≈ ${fmt(p.reread)} tokens this week; Continue lighter at ${fmt(best.at)} would have saved ≈ ${fmt(best.saves)}`,
            why: `${cur ? `It offers at ${fmt(cur)} now.` : 'It is off for this AI.'} Replayed on this week's chats: each time a chat passed ${fmt(best.at)}, a short summary (≈ 3k) stood in for the history, the summary's own cost counted. It's still an offer you click in the chat.`,
            fix: { type: 'agent', agentId: p.id, patch: { lighterAt: best.at === LIGHTER_DEFAULT ? undefined : best.at } },
          });
        } else if (cur && p.reread >= 20000) lean.push({ id: `lighter:${p.id}`, text: `${name}: Continue lighter offers at ${fmt(cur)} ✓` });
      }
      // 2. thinking on Deep for quick questions → Smart
      if (a.effort === 'high' || a.effort === 'xhigh') {
        const s = Math.round(p.deepQuick + p.deepOther);
        if (s > 0) {
          fixes.push({
            id: `smart:${p.id}`, kind: 'smart', agentId: p.id, saves: s, button: 'Let Smart decide',
            text: p.quickN ? `${name} thinks on Deep for quick questions too (${p.quickN} this week); Smart would have saved ≈ ${fmt(s)}` : `${name} thinks on Deep for everything; Smart would have saved ≈ ${fmt(s)}`,
            why: `≈ ${fmt(p.deepThink)} tokens of thinking on Deep. Smart thinks lightly on quick asks, keeps code fixes on Deep and the rest on medium (thinking ≈ ${R.thinkMult.low}× / ${R.thinkMult.medium}× / ${R.thinkMult[a.effort]}× by effort: an estimate).`,
            fix: { type: 'agent', agentId: p.id, patch: { effort: undefined } },
          });
        }
      } else if (p.replies >= 10 && (!a.effort || a.effort === 'medium')) lean.push({ id: `smart:${p.id}`, text: `${name}: Smart decides how hard it thinks ✓` });
      // 3. long answers → Short
      if (a.verbosity !== 'low') {
        const s = Math.round(p.written * (a.verbosity === 'high' ? R.short.high : R.short.normal));
        if (s > 0) {
          fixes.push({
            id: `short:${p.id}`, kind: 'short', agentId: p.id, saves: s, button: 'Make answers short',
            text: `${name} wrote ≈ ${fmt(p.written)} tokens of answers; Short answers would have saved ≈ ${fmt(s)}`,
            why: `Short drops the preamble, the closing recap and repeated code (≈ ${Math.round((a.verbosity === 'high' ? R.short.high : R.short.normal) * 100)} % of the written part, an estimate). Output tokens cost about 5× input ones. Tool calls (code sent to the Lab) aren't counted.`,
            fix: { type: 'agent', agentId: p.id, patch: { verbosity: 'low' } },
          });
        }
      } else if (p.written + p.shortDone > 0) lean.push({ id: `short:${p.id}`, text: `${name}: short answers ✓` });
      // 4. tool definitions: an unused tool still sent → Turn off; one that sleeps until needed → ✓
      for (const t of fixedOf(p.id)?.trims || []) {
        if (!(t.saves > 0)) continue;
        if (t.sleeps) { lean.push({ id: `tool:${p.id}:${t.key}`, text: `${t.label} would ride along on ${p.replies} of ${name}'s messages: they now sleep until needed ✓` }); continue; }
        const s = Math.round(t.saves * p.replies);
        if (s > 0) fixes.push({
          id: `tool:${p.id}:${t.key}`, kind: 'tool', agentId: p.id, saves: s, button: 'Turn off',
          text: `${t.label} rode along on ${p.replies} of ${name}'s messages, unused for 30 days; turning it off saves ≈ ${fmt(s)}`,
          why: `≈ ${fmt(t.saves)} tokens with every message (measured: Where its tokens go). It comes back with Undo or in What it can use.`,
          fix: { type: 'trim', agentId: p.id, key: t.key },
        });
      }
      // 5. a multi-answer mission pinned 📌 from now on → back to one answer
      const pin = o.pinned?.[p.id];
      if (pin && SWARMY.has(pin) && p.swarmN) {
        const avg = p.plainN ? p.plainTokens / p.plainN : 0;
        const s = Math.round(Math.max(0, p.swarm - p.swarmN * avg));
        if (s > 0) fixes.push({
          id: `unpin:${p.id}`, kind: 'unpin', agentId: p.id, saves: s, button: 'Unpin',
          text: `${MISSION_NAME[pin] || pin} is pinned for ${name}: ${p.swarmN} messages cost ≈ ${fmt(p.swarm)}; one answer each would have saved ≈ ${fmt(s)}`,
          why: 'Each of those messages ran several answers. Unpinned, it is back to "next message only": pick it in ◎ when you want it.',
          fix: { type: 'unpin', agentId: p.id, mission: pin },
        });
      }
      // already lean by default: attachments, handoffs
      if (p.att > 0) lean.push({ id: `attach:${p.id}`, text: `${name}: big attachments went lean (≈ ${fmt(p.att)} sent)${p.whole ? `, ≈ ${fmt(p.whole)} of them whole on your click` : ''} ✓` });
      if (p.hlN) lean.push({ id: `histlean:${p.id}`, text: `${name}: a lighter history after breaks (${p.hlN} fresh start${p.hlN === 1 ? '' : 's'}, ≈ ${fmt(p.hlSaved)} tokens not re-read) ✓` });
      if (p.handoffN) lean.push({ id: `handoff:${p.id}`, text: `Handoffs to ${name} sent a short brief (${p.handoffN}${p.handoffSaved ? `, ≈ ${fmt(p.handoffSaved)} less than the whole chat` : ''}) ✓` });
    }
    fixes.sort((x, y) => y.saves - x.saves);
    const floor = Math.max(3000, total * 0.02);
    const top = fixes.filter((f) => f.saves >= floor).slice(0, 3);
    for (const f of top) f.share = pctOf(f.saves, total);
    const best = top[0] || null;
    const note = best && total >= 30000 && best.saves >= total * 0.1
      ? { due: true, text: `Cost coach: ${top.length === 1 ? 'one change' : `${top.length} changes`} would have saved ≈ ${fmt(top.reduce((s, f) => s + f.saves, 0))} tokens last week (${pctOf(top.reduce((s, f) => s + f.saves, 0), total)} %). The biggest: ${best.kind === 'lighter' ? 'Continue lighter' : best.kind === 'smart' ? 'let Smart decide how hard it thinks' : best.kind === 'short' ? 'short answers' : best.kind === 'tool' ? 'an unused tool' : 'unpin a mission'}.` }
      : { due: false, text: '' };
    return { days, from, now, total: Math.round(total), replies, byAI, byKind, byCause, overlays, fixes, top, lean, note };
  }

  // a week key (Monday, local) for "once a week"
  function weekKey(now = Date.now()) {
    const d = new Date(now);
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12);
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
  }
  // the coach's own small store: { v, noted: { week: at }, applied: [{ id, at, saves, text }] } → a clean copy
  function cleanStore(v) {
    const s = v && typeof v === 'object' ? v : {};
    const noted = {};
    for (const [k, t] of Object.entries(s.noted || {}).sort((x, y) => (y[1] || 0) - (x[1] || 0)).slice(0, 12)) if (/^\d{4}-\d\d-\d\d$/.test(k) && Number(t)) noted[k] = Number(t);
    const applied = (Array.isArray(s.applied) ? s.applied : []).filter((x) => x && x.id && Number(x.at)).slice(-30).map((x) => ({ id: String(x.id), at: Number(x.at), saves: Math.round(Number(x.saves) || 0), text: String(x.text || '').slice(0, 300) }));
    return { v: 1, noted, applied };
  }
  // in plain words, for /cost-coach
  function words(res) {
    if (!res.total) return 'Cost coach: nothing used in the last 7 days.';
    const lines = [`Cost coach, last 7 days: ≈ ${fmt(res.total)} tokens in ${res.replies} replies (counted here, 0 tokens).`];
    lines.push(`Where it went: ${res.byCause.filter((c) => c.tokens > 0).slice(0, 4).map((c) => `${c.label.toLowerCase()} ${c.share} %`).join(' · ')}.`);
    if (res.byKind.length) lines.push(`By kind of chat: ${res.byKind.slice(0, 4).map((k) => `${k.label} ${k.share} %`).join(' · ')}.`);
    if (res.top.length) { lines.push('The changes that would save the most:'); res.top.forEach((f, i) => lines.push(`${i + 1}. ${f.text} → ${f.button}`)); } else lines.push('Nothing worth changing: this week is lean.');
    for (const l of res.lean.slice(0, 4)) lines.push(`- ${l.text}`);
    return lines.join('\n');
  }

  return { recordsOf, analyse, lighterSaves, weekKey, cleanStore, words, fmt, tok, atOf, SWARMY, MISSION_NAME, KINDS, CAUSES, OVERLAYS, R, LIGHTER_DEFAULT, WINDOW_DAYS };
})();
if (typeof module !== 'undefined') module.exports = CostCoachCore; else window.CostCoachCore = CostCoachCore;
