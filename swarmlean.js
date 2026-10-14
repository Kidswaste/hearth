// Lean missions (round 33, swarmlean). ◎ Missions that bring in more AIs (Swarm, Debate, Side by side, Answer then
// review, Ask everyone, Lab variations…) multiply tokens; this keeps them lean without making them worse:
//   · helpers get only what they need: the task (no chat history, no saved memory, no <remember> / <suggest> habits:
//     engines.js options.helper) and the cheaper model with low effort (Router.PLAN's quick tier; medium effort when
//     the AI is set to Deep); the one who writes the final answer keeps the chat's own model. A model or effort the
//     owner set for that seat (claude:opus, astra~high) or pinned for the chat is never routed away.
//   · reviewers see the result, not the chat (they always did: /opinion, critique): they get the helper pick too.
//   · before a costly mission, its card in the ◎ picker says what it will take, in one plain line
//     ("≈ 3 helpers · about 6k tokens"), with no extra click; past the weekly spending limit (⋯ AI setup → Spending,
//     budget.js) starting it asks first.
//   · afterwards only a short summary goes back into the chat's context (brief(): the opening of the final answer, code
//     blocks named, not pasted); the full output stays in the result card.
// Pure parts (estimateOf, brief, helperPick) run in Node too: dev/swarmlean-test.js. Measured: dev/mission-tokens.js.
const SwarmLean = (() => {
  // ---------- pure ----------
  // typical sizes (tokens), from dev/mission-tokens.js on the fake engines with replies of a typical length
  const T = {
    lean: 260, // a lean helper's own prompt (role line + no-tools line + the owner's standing instructions)
    answer: 450, // a typical answer
    review: 300, // a review / critique / rebuttal note
    chat: 1500, // a chat's own turn when its context is unknown (prompt + a few exchanges, mostly cached)
    crewFixed: 970, // a Lab crew helper's tools + role line per step (tools/three-crew.js fixed())
    crewSteps: 5, crewCtx: 450, crewOut: 900, // its steps, what each adds, what it writes
  };
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(Math.round(n)));
  const round = (n) => (n >= 10000 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 50) * 50);
  // What a mission will take: { helpers, runs, tokens, line } or null (a single reply: nothing to say).
  // o: { ctx: this chat's context tokens, task: the message's tokens, seats: how many answer (Swarm), rounds (Debate),
  //      everyone: how many AIs Ask everyone reaches, code: the Lab scene's code tokens (variations) }
  function estimateOf(id, o = {}) {
    const ctx = Math.max(0, o.ctx || T.chat);
    const q = Math.max(20, o.task || 40);
    const one = T.lean + q + T.answer; // one lean helper answering
    const mine = ctx + q + T.answer; // this chat's own reply
    let helpers = 0; let runs = 0; let tokens = 0; let what = 'helper';
    switch (id) {
      case 'swarm': case 'council': { // seats answer, the chair (one of them, its own session) writes the final answer
        const s = Math.max(2, o.seats || 3);
        helpers = s - 1; runs = s + 1;
        tokens = s * one + (T.lean + q + T.answer + (s - 1) * T.answer + T.answer);
        break;
      }
      case 'debate': { // both answer, read each other for (rounds - 1) more rounds, then one merges
        const r = Math.max(2, o.rounds || 2);
        helpers = 1; runs = 2 * r + 1; what = 'other AI';
        let input = 0; let had = T.lean + q;
        for (let i = 0; i < r; i += 1) { input += 2 * (had + (i ? T.answer : 0)); had += T.answer + (i ? T.answer : 0); }
        tokens = input + 2 * r * T.answer + (had + T.answer) + T.answer;
        break;
      }
      case 'duo': helpers = 1; runs = 2; what = 'other AI'; tokens = 2 * one; break;
      case 'pair': helpers = 1; runs = 3; what = 'other AI'; tokens = one + (T.lean + q + T.answer + T.review) + (T.lean + q + 2 * T.answer + T.review); break;
      case 'review': helpers = 1; runs = 2; what = 'reviewer'; tokens = mine + (T.lean + q + T.answer + T.review); break;
      case 'other': case 'research': helpers = 1; runs = 1; what = id === 'other' ? 'other AI' : 'researcher'; tokens = one + (id === 'other' ? Math.min(T.answer, 750) : 0); break;
      case 'everyone': { const n = Math.max(1, o.everyone || 2); helpers = n + (o.hostAsked ? 1 : 0); runs = helpers; what = 'AI'; tokens = n * (T.lean + q + T.answer) + (o.hostAsked ? mine : 0); break; }
      case 'split': helpers = 3; runs = 4; tokens = mine + 3 * (T.lean + q + 2 * T.answer) + 3 * T.review; break; // Claude decides how many (usually 2–4)
      case 'jam': helpers = 1; runs = 8; what = 'other AI'; tokens = 4 * (T.crewFixed + (o.code || 1200) + 2 * T.crewCtx) * 3 + 4 * T.review; break;
      case 'lab-variations': {
        const n = o.n || 4;
        helpers = n; runs = n * T.crewSteps;
        let each = 0;
        for (let k = 0; k < T.crewSteps; k += 1) each += T.crewFixed + (o.code || 1200) + 150 + k * T.crewCtx;
        tokens = n * (each + T.crewOut);
        break;
      }
      default: return null;
    }
    tokens = round(tokens);
    const who = `${helpers} ${what}${helpers === 1 ? '' : 's'}`;
    return { helpers, runs, tokens, line: `≈ ${who} · about ${fmt(tokens)} tokens` };
  }

  // The short summary that goes back into a chat's context: the opening of the text up to about n characters, cut at a
  // paragraph or a sentence, big code blocks named instead of pasted. The full text stays in the card.
  function brief(text, n = 900) {
    let t = String(text || '').replace(/<(remember|suggest)>[\s\S]*?<\/\1>/gi, '').trim();
    t = t.replace(/```(\w*)\n([\s\S]*?)```/g, (all, lang, body) => (all.length > 400 ? `[${lang || 'code'} block, ${body.split('\n').length} lines: in the result card]` : all));
    t = t.replace(/\n{3,}/g, '\n\n');
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    const at = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('. '), cut.lastIndexOf('\n- '));
    return `${(at > n * 0.5 ? cut.slice(0, at + 1) : cut).trimEnd()} … [the rest is in the result card]`;
  }

  // The cheaper pick for a helper: { model, effort } or null (keep what it has). R: Router (PLAN, rankOf).
  // agent: { engine, model, effort }; seat: { model, effort } the owner set for that seat; chat: { model, effort } pinned.
  function helperPick(agent, { seat = {}, chat = {}, R } = {}) {
    if (!agent || !R?.PLAN) return null;
    if (seat.model || seat.effort || chat.model || chat.effort) return null; // the owner picked for this seat / chat
    const engine = R.PLAN[agent.engine] ? agent.engine : 'claude';
    const plan = R.PLAN[engine].quick;
    const model = plan.model && R.rankOf(engine, plan.model) < R.rankOf(engine, agent.model) ? plan.model : null;
    // an AI set to Deep (⋯ AI setup → How hard it thinks) keeps a middle effort for its helpers; Smart / Quick: low
    return { ...(model ? { model } : {}), effort: agent.effort === 'high' || agent.effort === 'xhigh' || agent.effort === 'max' ? 'medium' : plan.effort || 'low' };
  }

  // ---------- in the app ----------
  if (typeof window === 'undefined') return { estimateOf, brief, helperPick, T };
  const R = () => (typeof Router !== 'undefined' ? Router : null);
  // engine options for one helper run of this AI (lean is set by the caller): helper + the cheaper pick
  function helperOptions(agentId, { seat = {}, chat = {} } = {}) {
    const agent = H.agent(agentId);
    const p = helperPick(agent, { seat, chat, R: R() });
    return { helper: true, ...(p?.model ? { model: p.model } : {}), ...(p?.effort ? { effort: p.effort } : {}) };
  }
  // Is this turn of a collaboration (astra.js) a helper's? Council seats other than the chair, and every review /
  // critique note. The chair, Side by side and Debate seats are the answers themselves: their own model.
  function isHelper(m, seatIdx, kind, judge) {
    if (kind === 'critique' || kind === 'verdict') return true;
    if (m.mode === 'council') return seatIdx !== judge && kind !== 'final';
    return false;
  }
  // "Answer, then review": the next second opinion of this chat is the mission's reviewer (native.js askAstra)
  const reviewNext = new Set();
  const markReview = (agentId) => reviewNext.add(agentId);
  function takeReview(hostId, reviewerId) {
    if (!reviewNext.delete(hostId)) return {};
    return helperOptions(reviewerId);
  }

  // how big this chat is: the meter's last context size, else its text
  function ctxOf(agentId) {
    const chatId = H.activeChat?.[agentId];
    const chat = typeof Native !== 'undefined' ? Native.chatOf?.(agentId) : null;
    // (round 35, bugbash2) continued lighter and no reply since: the next message sends the light start (the meter
    // still holds the long chat's last size until a reply comes)
    const lt = chat?.compact?.lighter;
    if (lt?.after && !chat.messages.slice(chat.compact.index).some((m) => m.role === 'assistant' && m.usage)) return lt.after;
    const s = chatId && typeof Meter !== 'undefined' ? Meter.stats?.chats?.[chatId] : null;
    if (s?.ctx) return s.ctx;
    if (!chat?.messages?.length) return 0;
    return Math.min(60000, Math.ceil(chat.messages.reduce((n, m) => n + String(m.text || '').length, 0) / 4) + 300);
  }
  const draftOf = (agentId) => { try { return Native.view?.(agentId)?.root?.querySelector('textarea')?.value || ''; } catch { return ''; } };
  // the estimate for a mission in this chat (the ◎ picker's line)
  function estimate(agentId, id) {
    const agent = H.agent(agentId);
    const o = { ctx: ctxOf(agentId), task: Math.ceil(draftOf(agentId).length / 4) || 40 };
    if (id === 'swarm' && agent?.dock === 'three') { id = 'lab-variations'; o.n = 4; }
    if (id === 'lab-variations' || id === 'jam') o.code = 1200;
    if (id === 'everyone') {
      const t = H.agents().filter((a) => a.askAll !== false && a.mode === 'native');
      o.everyone = t.filter((a) => a.id !== agentId).length || 1;
      o.hostAsked = t.some((a) => a.id === agentId);
    }
    const e = estimateOf(id, o);
    if (!e) return null;
    const b = budgetPass(agentId, e.tokens);
    return b ? { ...e, over: b, line: `${e.line} · ${b === 'already' ? 'past' : 'passes'} your weekly limit` } : e;
  }
  // null | 'pass' (it would pass this week's limit) | 'already' (it's past it)
  function budgetPass(agentId, tokens) {
    if (typeof Budget === 'undefined' || !Budget.state) return null;
    try {
      const s = Budget.state(agentId);
      if (!s?.limit) return null;
      if (s.tokens >= s.limit) return 'already';
      return s.tokens + tokens >= s.limit ? 'pass' : null;
    } catch { return null; }
  }
  // the spending guard needs budget.js (a lazy group): loaded when a limit exists
  const hasLimits = () => { try { return Object.values(store.get('budget.limits', {}) || {}).some((x) => x?.limit > 0); } catch { return false; } };
  function warm() { if (hasLimits() && typeof Budget === 'undefined' && window.Lazy?.load) Lazy.load('budget').catch(() => {}); }
  // a costly mission, and a weekly limit is set: okToStart decides (asynchronously)
  const asks = (agentId, id) => hasLimits() && Boolean(estimateOf(id === 'swarm' && H.agent(agentId)?.dock === 'three' ? 'lab-variations' : id));
  // before a costly mission starts: true = go. Past the weekly limit it asks first.
  async function okToStart(agentId, id) {
    if (hasLimits() && typeof Budget === 'undefined' && window.Lazy?.load) await Lazy.load('budget').catch(() => {});
    const e = estimate(agentId, id);
    if (!e?.over) return true;
    const s = Budget.state(agentId);
    const name = H.agent(agentId)?.name || 'This AI';
    return Modal.confirm(e.over === 'already' ? 'Past this week\'s limit' : 'This would pass your weekly limit',
      `${e.line.replace(/ · (past|passes) your weekly limit$/, '')}. ${name} has used ${BudgetCore.fmt(s.tokens)} of its ${BudgetCore.fmt(s.limit)} this week. Start it anyway?`, { ok: 'Start' });
  }

  return { estimateOf, brief, helperPick, T, helperOptions, isHelper, markReview, takeReview, estimate, asks, okToStart, warm, ctxOf };
})();
if (typeof module !== 'undefined') module.exports = SwarmLean;
