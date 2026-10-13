// Spending guard, the pure part (round 30, budget). A weekly token limit per AI, read from the meter's own aggregates
// (token-stats.json, written by store.js after every reply: no new counting here), the level it is at (near = 80 %,
// over = 100 %), how Smart steps down near it (router.js picks; this lowers the tier one rung near the limit and two
// past it, never below what a picture or a Lab build needs, never a model / effort the owner picked), whether a costly
// action would pass the limit, and the week at a glance (biggest chats, biggest tools, one-click fixes).
// Runs in Node too: dev/budget-test.js.
const BudgetCore = (() => {
  const DAY = 864e5;
  const NEAR = 0.8;
  const TIERS = ['chat', 'quick', 'normal', 'hard'];
  const MODES = [
    ['warn', 'Warn me'],
    ['cheaper', 'Use cheaper answers'],
    ['ask', 'Ask before each message'],
  ];
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // this week: Monday (local) through today
  function weekDays(now = Date.now()) {
    const d = new Date(now);
    const back = (d.getDay() + 6) % 7; // Monday = 0
    return Array.from({ length: back + 1 }, (_, i) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back + i, 12).getTime()));
  }
  // the 7 days before this week (for suggested limits)
  function lastWeekDays(now = Date.now()) {
    const first = weekDays(now)[0];
    const [y, m, dd] = first.split('-').map(Number);
    return Array.from({ length: 7 }, (_, i) => dayKey(new Date(y, m - 1, dd - 7 + i, 12).getTime()));
  }
  const tot = (t) => (t?.i || 0) + (t?.o || 0);
  const fmt = (n) => {
    n = Math.round(n || 0);
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
  };
  const money = (n) => (n >= 100 ? `$${Math.round(n)}` : `$${(n || 0).toFixed(2)}`);

  // one AI over some days: { tokens, cost, replies }
  function used(stats, agentId, days) {
    const out = { tokens: 0, cost: 0, replies: 0 };
    for (const d of days) {
      const t = stats?.days?.[d]?.a?.[agentId];
      if (!t) continue;
      out.tokens += tot(t); out.cost += t.cost || 0; out.replies += t.r || 0;
    }
    return out;
  }
  // null | 'near' | 'over'
  function level(tokens, limit) {
    if (!limit || limit <= 0) return null;
    if (tokens >= limit) return 'over';
    if (tokens >= limit * NEAR) return 'near';
    return null;
  }
  const pct = (tokens, limit) => (limit ? Math.round((tokens / limit) * 100) : 0);
  // ≈ $ for some tokens, at this AI's own average price this week (only when the engine reported prices)
  const priceOf = (u, tokens) => (u.cost > 0 && u.tokens > 0 ? (u.cost / u.tokens) * tokens : 0);
  // plain words: "≈ 1.2M tokens (≈ $3.40)"
  const words = (u, tokens = u.tokens) => { const $ = priceOf(u, tokens); return `≈ ${fmt(tokens)} tokens${$ >= 0.01 ? ` (≈ ${money($)})` : ''}`; };

  // Would this cost pass the limit? null, or { now, after, limit, level } for the line in a confirm.
  function wouldPass(tokens, extra, limit) {
    if (!limit || !(extra > 0)) return null;
    const after = tokens + extra;
    if (after < limit) return null;
    return { now: tokens, after, limit, already: tokens >= limit };
  }

  // ---------- stepping down ----------
  // The lowest tier a message may go to: a picture needs the middle model, a Lab chat's tools need a steady model,
  // and a Lab build (or code there) keeps the chat's own model (the 'normal' tier: its own model, medium effort).
  function floorOf({ images = 0, director = false, labBuild = false } = {}) {
    if (director && labBuild) return 'normal';
    if (images || director) return 'quick';
    return 'chat';
  }
  // near: one rung down, over: two; never below the floor, never up
  function stepDown(tier, lvl, floor = 'chat') {
    const i = TIERS.indexOf(tier);
    if (i < 0 || !lvl) return tier;
    const steps = lvl === 'over' ? 2 : 1;
    return TIERS[Math.max(Math.min(i, TIERS.indexOf(floor)), i - steps)];
  }
  // What to send instead of Smart's pick d (router.js decide): { tier, model, effort, label, why } or null (nothing to
  // change). The owner's picks stay: a pinned model / effort (Router left d.model / d.effort null for it), "think
  // harder" (d.forced), and a big context's cache (d.kept: stepping down would re-read it uncached, costing more).
  // R: { PLAN, rankOf, nameOf }; pinned: { model, effort } the owner set for the chat; base: the chat's own model.
  function cheaper(d, { lvl, floor = 'chat', R, pinned = {}, base = '' }) {
    if (!d || !lvl || d.forced || d.kept || !R?.PLAN) return null;
    const tier = stepDown(d.tier, lvl, floor);
    if (tier === d.tier) return null;
    const engine = R.PLAN[d.engine] ? d.engine : 'claude';
    const plan = R.PLAN[engine][tier];
    const own = pinned.model || base || '';
    let model = d.model;
    if (!pinned.model && plan.model && R.rankOf(engine, plan.model) < R.rankOf(engine, model || own)) model = plan.model;
    const effort = pinned.effort ? d.effort : plan.effort;
    if (model === d.model && effort === d.effort) return null;
    const label = `${R.nameOf(engine, model || own)} · ${effort || pinned.effort || 'medium'}`;
    return { tier, model, effort, label, why: `${d.why}; lighter: ${lvl === 'over' ? 'past' : 'near'} your weekly limit` };
  }

  // Limits to offer, from last week's use (or this week's so far): a few round numbers around it.
  function suggestions(lastWeek, thisWeek = 0) {
    const base = Math.max(lastWeek, thisWeek * 1.5, 0);
    const round = (n) => { const p = 10 ** Math.max(3, Math.floor(Math.log10(Math.max(n, 1000))) - 1); return Math.max(p, Math.round(n / p) * p); };
    const out = base > 0 ? [0.75, 1, 1.5, 2].map((f) => round(base * f)) : [500e3, 1e6, 2e6, 5e6];
    return [...new Set(out)].sort((a, b) => a - b);
  }

  // ---------- the week at a glance ----------
  // stats: token-stats.json · agents: [{ id, name, engine, effort }] · limits: { agentId: { limit, mode } }
  // sets: { agentId: [[setKey, tokens a message]] } (what each AI sends with every message, mcp/cost.js)
  // optional: { setKey: [label, patch to switch it off] } · chatTitle(id) → title
  function week(stats, { agents = [], limits = {}, sets = {}, optional = {}, chatTitle = (id) => id, now = Date.now() } = {}) {
    const days = weekDays(now);
    const start = new Date(`${days[0]}T00:00`).getTime();
    const per = agents.map((a) => {
      const u = used(stats, a.id, days);
      const lim = limits[a.id]?.limit || 0;
      return { id: a.id, name: a.name, engine: a.engine, ...u, limit: lim, mode: limits[a.id]?.mode || 'warn', level: level(u.tokens, lim), pct: pct(u.tokens, lim) };
    }).filter((p) => p.tokens || p.limit);
    // chats used this week, biggest first (their whole size: the meter keeps chats as totals)
    const chats = Object.entries(stats?.chats || {}).filter(([, c]) => (c.last || 0) >= start)
      .map(([id, c]) => ({ id, agentId: c.a, title: chatTitle(id), tokens: tot(c), ctx: c.ctx || 0, replies: c.r || 0, cost: c.cost || 0 }))
      .sort((a, b) => b.tokens - a.tokens).slice(0, 5);
    // where the tokens went by place (chat, the Lab director, second opinions…), this week
    const places = {};
    for (const d of days) for (const [k, t] of Object.entries(stats?.days?.[d]?.t || {})) places[k] = (places[k] || 0) + tot(t);
    const where = Object.entries(places).map(([k, tokens]) => ({ key: k, tokens })).sort((a, b) => b.tokens - a.tokens).slice(0, 5);
    // tool sets sent with every message × this week's replies
    const tools = [];
    for (const p of per) for (const [k, n] of sets[p.id] || []) if (n > 0 && p.replies) tools.push({ agentId: p.id, agentName: p.name, key: k, label: optional[k]?.[0] || k, each: n, week: n * p.replies, optional: Boolean(optional[k]) });
    tools.sort((a, b) => b.week - a.week);
    // one-click fixes, biggest saving first
    const fixes = [];
    for (const t of tools) if (t.optional && t.week >= 5000) fixes.push({ kind: 'tools', agentId: t.agentId, key: t.key, saves: t.week, text: `Turn off ${t.label} for ${t.agentName}: saves ≈ ${fmt(t.week)} a week`, patch: optional[t.key][1] });
    for (const c of chats) if (c.ctx >= 30000) fixes.push({ kind: 'fresh', agentId: c.agentId, chatId: c.id, saves: Math.round(c.ctx * 0.8), text: `Start “${c.title}” fresh from a summary: each message re-reads ≈ ${fmt(c.ctx)}` });
    for (const p of per) {
      const a = agents.find((x) => x.id === p.id);
      if (a && (a.effort === 'high' || a.effort === 'xhigh') && p.replies >= 10) fixes.push({ kind: 'smart', agentId: p.id, saves: Math.round(p.tokens * 0.2), text: `Let ${p.name} think on Smart: lighter answers for small asks (saves ≈ ${fmt(p.tokens * 0.2)} a week)`, patch: { effort: undefined } });
    }
    fixes.sort((a, b) => b.saves - a.saves);
    const all = per.reduce((s, p) => ({ tokens: s.tokens + p.tokens, cost: s.cost + p.cost, replies: s.replies + p.replies }), { tokens: 0, cost: 0, replies: 0 });
    return { days, per, all, chats, where, tools: tools.slice(0, 6), fixes: fixes.slice(0, 4) };
  }

  return { NEAR, TIERS, MODES, weekDays, lastWeekDays, dayKey, used, level, pct, priceOf, words, wouldPass, floorOf, stepDown, cheaper, suggestions, week, fmt, money };
})();
if (typeof module !== 'undefined') module.exports = BudgetCore; else window.BudgetCore = BudgetCore;
