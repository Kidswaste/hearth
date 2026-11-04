// (round 121, sendlag121) The meter's numbers (kv/token-stats.json, meter.js) as pure code, shared by store.js (the
// first build, the quit flush, Node tools) and the store thread (storework.js tokenStat: one reply's numbers added
// there, so the main process never reads, parses or writes the file while a reply ends). Moved here from store.js
// unchanged, except dayKey (no Intl: see below).
// { v, since, backfilledAt,
//   days: { 'YYYY-MM-DD': { a: { agentId: T }, m: { model: T }, t: { tool: T }, h: { hour: tokens } } },
//   chats: { chatId: { a, model, last, peak, ctx, ...T } } }
// T = { i: input (cached included), o: output, c: cache reads, w: cache writes, r: replies, ms, tools, cost }
'use strict';
// the local day as YYYY-MM-DD, as toLocaleDateString('en-CA') writes it, without Intl: its first call in the main process
// loaded the locale data (≈ 25–100 ms after the first reply: the chatwindow86 check's "token stats write" in its send
// step) and each later call built a new formatter
const p2 = (n) => (n < 10 ? `0${n}` : String(n));
const dayKey = (t = Date.now()) => { const d = new Date(t); const y = d.getFullYear(); return `${y < 1000 ? String(y).padStart(4, '0') : y}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const emptyStats = () => ({ v: 1, since: Date.now(), days: {}, chats: {} });
const round6 = (n) => Math.round(n * 1e6) / 1e6;
function bump(t, usage, meta) {
  t.i = (t.i || 0) + (usage.input || 0);
  t.o = (t.o || 0) + (usage.output || 0);
  if (usage.cached) t.c = (t.c || 0) + usage.cached;
  if (usage.cacheWrite) t.w = (t.w || 0) + usage.cacheWrite;
  if (usage.cost) t.cost = round6((t.cost || 0) + usage.cost);
  if (meta.ms) t.ms = (t.ms || 0) + meta.ms;
  if (meta.tools) t.tools = (t.tools || 0) + meta.tools;
  t.r = (t.r || 0) + (meta.replies ?? 1);
  return t;
}
// Which tool a reply belongs to: a docked director's tool, a one-off second opinion, or plain chat.
const toolOf = (meta) => (meta.chatId?.startsWith('once-') ? 'second-opinion' : meta.dock || 'chat');
function statInto(stats, agentId, usage, meta, at = Date.now()) {
  const day = (stats.days[dayKey(at)] ||= { a: {}, m: {}, t: {}, h: {} });
  bump(day.a[agentId] ||= {}, usage, meta);
  bump(day.m[meta.model || 'default'] ||= {}, usage, meta);
  bump(day.t[toolOf(meta)] ||= {}, usage, meta);
  const hour = new Date(at).getHours();
  day.h[hour] = (day.h[hour] || 0) + (usage.input || 0) + (usage.output || 0);
  if (meta.chatId && !meta.chatId.startsWith('once-')) {
    const c = (stats.chats[meta.chatId] ||= { a: agentId });
    bump(c, usage, meta);
    c.last = at;
    const context = usage.contextInput ?? usage.input ?? 0;
    c.peak = Math.max(c.peak || 0, context);
    c.ctx = context; // last model call's input, not all repeated inputs across a tool-using turn
    if (usage.contextWindow) c.contextWindow = usage.contextWindow;
    if (meta.model) c.model = meta.model;
  }
}
// replies added in the order they ended: [{ agentId, usage, meta, at }]
function addAll(stats, list) { for (const x of list) statInto(stats, x.agentId, x.usage, x.meta || {}, x.at); return stats; }
module.exports = { dayKey, emptyStats, bump, toolOf, statInto, addAll };
