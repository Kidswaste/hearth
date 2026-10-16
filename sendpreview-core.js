// Send preview, the pure part (round 44, sendpreview): what the message in the chat box will cost before it goes,
// worked out here for 0 tokens. Runs in the page (sendpreview.js) and in Node (dev/sendpreview-test.js).
// The parts of one message, as the engine will count them (input with the cache + output):
//   fixed       the part every message sends: instructions + tool definitions (tokenaudit's measure, else what the
//               chat's first plain reply showed, else a default)
//   history     the chat the engine re-reads: its own session (since the last Continue lighter / handoff), or, with no
//               session, what native.js withContext sends instead (the handoff brief or whole chat, the lighter
//               summary, the earlier conversation capped at 24k characters)
//   words       your message
//   attachments what attachlean will send (its chip costs; whole when you clicked the cost)
//   answer      its answer (this chat's usual one, × the effort Smart picks)
//   mission     ◎ missions that bring in more AIs (swarmlean's estimate)
// The cache: what the last message already sent (fixed + history but the last reply) is likely read from the prompt
// cache at about a tenth of the price, unless the cache expired (≈ 5 minutes after the last message), the session
// starts anew, or Smart picks another model / effort this time (each keeps its own cache).
// A small correction factor per AI (calibrate) learns from what the engines report after sending.
// When it shows: only when the message costs much more than usual: ≥ 3× this chat's median (and ≥ 8k), or ≥ 30k
// tokens at full price (not from the cache). Then one cheaper way, the best one (cheaper()).
const SendPreviewCore = (() => {
  const CACHE_TTL = 5 * 60e3; // both engines' prompt caches expire about 5 minutes after the last use
  const CONTEXT_CHARS = 24000; // native.js withContext: the earlier conversation sent along, at most
  const DEFAULT_FIXED = 1000; // before anything is measured (a plain Claude reply ≈ 764 input tokens, HANDOFF)
  const DEFAULT_ANSWER = 500;
  const DEFAULT_HIT = 0.9; // a hot cache usually serves almost all of what was sent before
  const BIG_FRESH = 30000; // full-price tokens that always deserve a look
  const TIMES_USUAL = 3; // × this chat's median
  const MIN_UNUSUAL = 8000; // …and at least this much (3× a tiny chat is still tiny)
  const MIN_SAVE = 3000; // a cheaper way must save at least this…
  const MAX_SHARE = 0.6; // …and cost at most 60 % of sending as it is
  const EFFORT = { minimal: 0.4, low: 0.6, medium: 1, high: 1.5, xhigh: 2.2 }; // answer + thinking vs medium (routerlearn's ratios, rounded)
  const F_MIN = 0.3; const F_MAX = 6;

  const tok = (s) => Math.ceil(String(s || '').length / 4);
  const fmt = (n) => { n = Math.max(0, Math.round(n || 0)); return n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n >= 100 ? String(Math.round(n / 10) * 10) : String(n); };
  const median = (a) => { const s = a.filter((x) => x > 0).sort((x, y) => x - y); if (!s.length) return 0; const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const talk = (m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'opinion') && !m.compactReq && !m.compactSummary && !m.handoffBrief;
  const textOf = (m) => m.sent || m.ctx || m.text || '';
  const label = (m) => (m.role === 'user' ? 'User' : m.role === 'opinion' ? `${m.from} (second opinion)` : 'Assistant');
  // pictures a message carried (they sit in the engine's history as what its Read tool saw)
  const picTok = (m) => (m.attachments || []).reduce((n, a) => n + (a.kind === 'image' ? (a.lean?.tokens || a.tokens || 1600) : 0), 0);

  // ---------- this chat's replies: what "usual" is ----------
  // → { n, median (input + output per reply), out (median answer), hit (share the cache served), lastAt, last }
  function stats(chat) {
    const ms = chat?.messages || [];
    const replies = ms.filter((m) => m.role === 'assistant' && m.usage && m.usage.input > 0).slice(-12);
    const totals = replies.map((m) => (m.usage.input || 0) + (m.usage.output || 0));
    const hits = replies.slice(-4).filter((m, i, a) => i > 0 || a.length === 1).map((m) => clamp((m.usage.cached || 0) / Math.max(1, m.usage.input), 0, 1));
    const lastAt = ms.reduce((t, m) => Math.max(t, m.at || 0), 0);
    return { n: replies.length, median: median(totals), out: median(replies.map((m) => m.usage.output || 0)), hit: replies.length > 1 ? hits.reduce((a, b) => a + b, 0) / hits.length : null, lastAt, last: [...ms].reverse().find((m) => m.role === 'assistant') || null };
  }

  // ---------- the chat the engine re-reads ----------
  // → { tokens, cacheable (of it, already sent once: everything but the last reply), kind, session }
  function historyOf(chat) {
    const ms = (chat?.messages || []);
    if (!ms.length) return { tokens: 0, cacheable: 0, kind: 'none', session: false };
    const h = chat.handoff;
    const c = chat.compact;
    const lastReply = [...ms].reverse().find((m) => m.role === 'assistant' && !m.compactSummary);
    if (chat.session?.id) {
      // the engine resumes its own session: everything said in it (since a lighter start or a handoff, which began it)
      let from = 0; let carried = 0; let kind = 'session';
      if (c && c.index >= (h?.at || 0)) { from = c.index; carried = tok(c.summary) + 60 + ms.slice(c.tail ?? c.index, c.index).filter(talk).reduce((n, m) => n + tok(m.ctx || m.text) + 4, 0); kind = 'lighter'; }
      else if (h?.brief) { from = h.at; carried = h.whole ? tok(h.whole) : (h.tokens || tok(h.brief)); kind = h.whole ? 'whole' : 'brief'; }
      const own = ms.slice(from).filter(talk).reduce((n, m) => n + tok(textOf(m)) + picTok(m) + 4, 0);
      const tokens = carried + own;
      return { tokens, cacheable: Math.max(0, tokens - (lastReply ? tok(lastReply.text) : 0)), kind, session: true };
    }
    // no session: the message carries the earlier conversation once (native.js withContext), nothing of it cached
    const say = (list) => list.filter((m) => m.role !== 'error' && !m.handoffBrief && (m.ctx || m.text)).map((m) => `${label(m)}: ${m.ctx || m.text}`).join('\n\n');
    const capped = (s) => Math.min(s.length, CONTEXT_CHARS) + (s.length > CONTEXT_CHARS ? 1 : 0);
    if (h?.brief && !(c && c.index >= h.at)) {
      const since = capped(say(ms.slice(h.at)));
      return { tokens: (h.whole ? tok(h.whole) + 30 : tok(h.brief)) + Math.ceil(since / 4), cacheable: 0, kind: h.whole ? 'whole' : 'brief', session: false };
    }
    if (c) {
      const after = capped(say(ms.slice(c.tail ?? c.index).filter((m) => !m.compactSummary && !m.compactReq)));
      return { tokens: tok(c.summary) + 40 + Math.ceil(after / 4), cacheable: 0, kind: 'lighter', session: false };
    }
    if (ms.length < 1) return { tokens: 0, cacheable: 0, kind: 'none', session: false };
    const earlier = say(ms);
    return { tokens: earlier ? Math.ceil(capped(earlier) / 4) + 30 : 0, cacheable: 0, kind: earlier ? 'earlier' : 'none', session: false };
  }

  // ---------- the estimate ----------
  // input: { fixed, fixedFrom, history (historyOf), words (tokens), attachments: [{ name, kind, tokens, wholeTokens,
  //   whole, px }], answer (tokens, the chat's usual), effort / baseEffort (Smart's pick vs the usual), pick: { label,
  //   changed }, mission: { id, label, tokens, replacesOwn } | null, now, lastAt, hit, factor (calibration, own part) }
  // → { tokens, fresh, cached, raw (own part before the factor), parts: [{ id, tokens, fresh }], cold, why (why the cache
  //   is cold or ''), factor }
  function estimate(i) {
    const f = clamp(Number(i.factor) || 1, F_MIN, F_MAX);
    const hist = i.history || { tokens: 0, cacheable: 0, session: false };
    const fixed = Math.max(0, Math.round(i.fixed ?? DEFAULT_FIXED));
    const words = Math.max(0, Math.round(i.words || 0));
    const atts = (i.attachments || []).map((a) => ({ ...a, sent: Math.round(a.whole ? (a.wholeTokens || a.tokens || 0) : (a.tokens || 0)) }));
    const att = atts.reduce((n, a) => n + a.sent, 0);
    const mult = (EFFORT[i.effort] || 1) / (EFFORT[i.baseEffort] || 1);
    const answer = Math.round((i.answer || DEFAULT_ANSWER) * mult);
    // the cache: what was sent before, if it's still warm and this message uses the same model and effort
    const age = i.lastAt ? (i.now ?? Date.now()) - i.lastAt : Infinity;
    let why = '';
    if (!hist.session) why = hist.tokens ? 'new' : 'none';
    else if (age >= (i.ttl || CACHE_TTL)) why = 'expired'; // (round 50, historylean) the engine's own cache life when known
    else if (i.pick?.changed) why = 'model';
    const cold = Boolean(why);
    const hit = clamp(i.hit ?? DEFAULT_HIT, 0, 1);
    const fixedCached = cold ? 0 : Math.round(fixed * hit);
    const histCached = cold ? 0 : Math.round(Math.min(hist.cacheable || 0, hist.tokens || 0) * hit);
    const cached = fixedCached + histCached;
    const own = fixed + (hist.tokens || 0) + words + att + answer;
    const m = i.mission && i.mission.tokens > 0 ? i.mission : null;
    // a mission that runs other AIs instead of this chat's own reply: they read the task (+ the attachments), not the chat
    const raw = m?.replacesOwn ? 0 : own;
    const ownTokens = Math.round(raw * f);
    const tokens = ownTokens + (m ? Math.round(m.tokens + (m.replacesOwn ? att : 0)) : 0);
    const cachedT = m?.replacesOwn ? 0 : Math.round(cached * f);
    const parts = [
      { id: 'fixed', tokens: fixed, fresh: fixed - fixedCached },
      { id: 'history', tokens: hist.tokens || 0, fresh: (hist.tokens || 0) - histCached },
      { id: 'words', tokens: words, fresh: words },
      ...atts.map((a) => ({ id: 'attachment', name: a.name, kind: a.kind, whole: Boolean(a.whole), tokens: a.sent, wholeTokens: a.wholeTokens || a.sent, lean: a.tokens || 0, px: a.px, fresh: a.sent })),
      { id: 'answer', tokens: answer, fresh: answer },
      ...(m ? [{ id: 'mission', label: m.label, tokens: m.tokens, fresh: m.tokens }] : []),
    ].filter((p) => p.tokens > 0 || p.id === 'words');
    return { tokens, fresh: Math.max(0, tokens - cachedT), cached: cachedT, raw, factor: f, parts, cold, why, age: Number.isFinite(age) ? age : null, att, answer, fixed, words, history: hist, ttl: i.ttl || CACHE_TTL };
  }

  // ---------- when it's worth showing ----------
  // → { show, why: 'big' | 'unusual' | '', times }
  function should(est, st = {}) {
    if (!est || est.tokens <= 0) return { show: false, why: '' };
    const times = st.median ? est.tokens / st.median : 0;
    if (est.fresh >= BIG_FRESH) return { show: true, why: 'big', times };
    if ((st.n || 0) >= 2 && st.median && est.tokens >= TIMES_USUAL * st.median && est.tokens >= MIN_UNUSUAL) return { show: true, why: 'unusual', times };
    return { show: false, why: '', times };
  }

  // ---------- the one cheaper way ----------
  // options: [{ id, tokens (what the message would cost that way), lossless?, prefer? }] → the best one or null.
  // A lossless one (a picture at 1568 px, a file trimmed, the short brief) wins when it saves enough; else the biggest
  // saving, Continue lighter before a new chat (it keeps the thread) unless the topic changed.
  const WEIGHT = { attachment: 1.5, brief: 1.5, mission: 1.1, lighter: 1, newchat: 0.8 };
  function cheaper(est, options = []) {
    let best = null; let score = 0;
    for (const o of options) {
      if (!o || !(o.tokens >= 0)) continue;
      const save = est.tokens - o.tokens;
      if (save < MIN_SAVE || o.tokens > est.tokens * MAX_SHARE) continue;
      const s = save * (WEIGHT[o.id] || 1) * (o.prefer ? 1.5 : 1);
      if (s > score) { score = s; best = { ...o, save }; }
    }
    return best;
  }
  // what the message would cost with one change (the same estimate, a part replaced)
  function variant(est, change) {
    const f = est.factor;
    const own = (x) => Math.round(x * f);
    switch (change.id) {
      case 'attachment': { // the named attachments go lean (their chip's own number)
        const dropped = est.parts.filter((p) => p.id === 'attachment' && change.names.includes(p.name)).reduce((n, p) => n + (p.tokens - p.lean), 0);
        return est.tokens - own(dropped);
      }
      case 'brief': return est.tokens - own(Math.max(0, change.from - change.to));
      case 'lighter': return own(change.after + est.words + est.att + est.answer);
      case 'newchat': return own(est.fixed + est.words + est.att + est.answer);
      case 'mission': return own(est.fixed + (est.history.tokens || 0) + est.words + est.att + est.answer);
      default: return est.tokens;
    }
  }

  // ---------- calibration: a small correction per AI, from what the engines report ----------
  // cal: { f, n, at } · raw: the own part estimated before the factor · real: input + output the engine reported
  function calibrate(cal, raw, real, now = Date.now()) {
    const c = { f: 1, n: 0, ...(cal || {}) };
    if (!(raw >= 200) || !(real > 0)) return c;
    const r = clamp(real / raw, 0.1, 12);
    const a = Math.max(0.25, 1 / (c.n + 1)); // the first replies move it most, then a slow running mean
    const lf = Math.log(clamp(c.f, F_MIN, F_MAX)) + a * (Math.log(r) - Math.log(clamp(c.f, F_MIN, F_MAX)));
    return { f: Math.round(clamp(Math.exp(lf), F_MIN, F_MAX) * 1000) / 1000, n: Math.min(999, c.n + 1), at: now };
  }
  // the store's shape (kv send-preview): { v: 1, ai: { [agentId]: { f, n, at } } }; anything else is not ours
  const valid = (s) => Boolean(s) && typeof s === 'object' && s.v === 1 && s.ai && typeof s.ai === 'object';
  function trim(s, keep = 40) { // the most recently used AIs only
    const ids = Object.keys(s.ai).sort((a, b) => (s.ai[b].at || 0) - (s.ai[a].at || 0));
    for (const id of ids.slice(keep)) delete s.ai[id];
    return s;
  }

  // ---------- in plain words ----------
  const mins = (ms) => { const m = Math.round(ms / 60000); return m >= 120 ? `${Math.round(m / 60)} h` : `${Math.max(1, m)} min`; };
  function lines(est, st = {}, o = {}) {
    const rows = [];
    for (const p of est.parts) {
      if (p.id === 'fixed') rows.push({ k: 'Its instructions and tools', v: p.tokens, note: o.fixedFrom === 'audit' ? 'measured in Where its tokens go' : o.fixedFrom === 'reply' ? 'from this chat\'s first reply' : 'until it\'s measured' });
      else if (p.id === 'history') {
        const h = est.history;
        const k = h.kind === 'brief' ? 'The handoff brief' : h.kind === 'whole' ? 'The whole chat, handed over' : h.kind === 'lighter' ? 'The lighter summary + what came after' : h.kind === 'earlier' ? 'The chat so far, sent along once' : h.kind === 'leanbreak' ? 'The lighter history (a fresh start after the break)' : 'Re-reading this chat';
        const note = est.cold ? (est.why === 'expired' ? `the cache expired (last message ${mins(est.age)} ago): all at full price` : est.why === 'model' ? `${o.pick || 'another model'} this time: its cache is separate, so all at full price` : 'a new session: no cache yet')
          : `≈ ${fmt(p.tokens - p.fresh)} of it likely from the cache, at about a tenth of the price`;
        rows.push({ k, v: p.tokens, note });
      } else if (p.id === 'words') { if (p.tokens) rows.push({ k: 'Your words', v: p.tokens }); }
      else if (p.id === 'attachment') rows.push({ k: p.name || 'An attachment', v: p.tokens, note: p.whole && p.wholeTokens > p.lean ? (p.kind === 'image' ? 'whole, at full size' : 'whole') : p.px ? `at ${p.px}` : '' });
      else if (p.id === 'answer') rows.push({ k: 'Its answer', v: p.tokens, note: o.pick ? `Smart: ${o.pick}` : '' });
      else if (p.id === 'mission') rows.push({ k: p.label || 'The mission', v: p.tokens, note: 'the other AIs together' });
    }
    if (est.factor !== 1 && o.calN) rows.push({ k: `Adjusted to this AI's real use (× ${est.factor.toFixed(2).replace(/0$/, '')})`, v: null, note: `learned from ${o.calN} repl${o.calN === 1 ? 'y' : 'ies'}` });
    return rows;
  }
  function headline(est, st = {}, sh = should(est, st)) {
    const full = est.fresh >= est.tokens * 0.8 ? ', nearly all at full price' : est.cached ? `, ≈ ${fmt(est.fresh)} at full price` : '';
    const usual = st.median && sh.times >= 1.5 ? ` · about ${Math.round(sh.times)}× this chat's usual (≈ ${fmt(st.median)})` : '';
    return `≈ ${fmt(est.tokens)} tokens with this message${full}${usual}`;
  }

  return { CACHE_TTL, CONTEXT_CHARS, DEFAULT_FIXED, BIG_FRESH, TIMES_USUAL, MIN_UNUSUAL, EFFORT, tok, fmt, median, stats, historyOf, estimate, should, cheaper, variant, calibrate, valid, trim, lines, headline };
})();
if (typeof module !== 'undefined') module.exports = SendPreviewCore; else window.SendPreviewCore = SendPreviewCore;
