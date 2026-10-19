// 🔁 Keep going (round 41, routines), the plain part: what a routine is, when the next round may go, when it pauses
// and when it stops. No DOM, no Hearth globals, so dev/routines-test.js runs it in Node; routines.js (the live part:
// the card, the header chip, sending, Activity, ⋯ AI setup) uses it.
// The owner drives Hearth's own development this way: after each batch, "keep pushing another 5". A routine is that
// for one chat: each time a reply finishes, Hearth sends the owner's routine words as a new turn (marked 🔁, never as
// if the owner typed it), for a time, a number of extra rounds, or until stopped, with a spending cap.
// A routine (kept per computer, localStorage 'routines.list'):
//   { id, agentId, chatId, title, prompt, how: { kind: 'rounds', rounds } | { kind: 'time', ms } | { kind: 'until', at }
//     | { kind: 'forever' }, pause: 'none' | '1m' | 'idle10' | 'quiet60', resumeAfter (ms; 0 = the owner's message
//     pauses it until ▶), cap (tokens; 0 = none, only for short routines), lighter, waitReset, afterRestart,
//     createdAt, endAt, status: 'running' | 'paused' | 'done' | 'stopped', why, round (rounds sent), done (rounds
//     answered), tokens, rounds: [{ n, at, ms, tokens, ok }], errors, net, saidDone, lastEnd, quietUntil, resetAt,
//     inFlight, kickoff, askOk }
const RoutinesCore = (() => {
  const MIN = 60000; const HOUR = 60 * MIN;
  const SETTLE = 2500; // after a reply ends: anything typed meanwhile, a hook, the chat's own queue go first
  // (round 51, routinelean) short and byte-stable (the same bytes every round, so the prompt cache holds); it asks for a
  // one-line summary at the end (fewer output tokens, and the notification shows that line instead of the answer)
  const DEFAULT_PROMPT = 'Keep improving: do the next 5 improvements. End with one line "Changed: …". If nothing is left worth doing, say so plainly.';  const HOW = [
    { id: '30m', kind: 'time', ms: 30 * MIN, label: '30 min' },
    { id: '1h', kind: 'time', ms: HOUR, label: '1 h' },
    { id: '3h', kind: 'time', ms: 3 * HOUR, label: '3 h' },
    { id: 'until', kind: 'until', label: 'Until…' },
    { id: 'rounds', kind: 'rounds', label: 'Rounds' },
    { id: 'forever', kind: 'forever', label: 'Until I stop it' },
  ];
  const PAUSES = [
    { id: 'none', label: 'No pause' },
    { id: '1m', label: '1 min', ms: MIN },
    { id: 'idle10', label: 'Until I\'m idle 10 min', idle: 10 * MIN },
    { id: 'quiet60', label: 'When I haven\'t written for an hour', quiet: HOUR },
  ];
  const WHEN_I_WRITE = [
    { ms: 0, label: 'Pause it until I press ▶' },
    { ms: 10 * MIN, label: 'Continue after 10 min quiet' },
    { ms: HOUR, label: 'Continue after 1 h quiet' },
  ];
  const CAPS = [50000, 100000, 300000, 1000000, 3000000, 10000000, 30000000];
  const NO_LIMIT_CAP = 300000; // the default cap when no weekly limit is set
  const MAX_ROUNDS = 200; // a hard ceiling, whatever was chosen
  const ERR_STOP = 2; // the same failure twice in a row: stop
  const DONE_STOP = 2; // "nothing left to do" / "I'm stuck" twice in a row: stop
  const NET_PAUSE = 6; // the internet / a busy service failing this many rounds in a row: pause (the queue retries before that)
  const TRANSIENT = new Set(['offline', 'busy', 'proxy']); // offline.js retries these by itself (the message waits)
  // (round 51, routinelean) it stops by itself when rounds stop producing real change
  const STALE_STOP = 2; // rounds in a row that changed no file and nothing in the scene (once a round has changed something)
  const REPEAT_STOP = 2; // answers in a row that repeat the one before (≥ SAME alike)
  const SAME = 0.9; // how alike two answers must be to count as the same (word triples shared)
  const MARGINS = [25, 50, 75, 80, 90, 95]; // account-wide ceiling, not a per-run percentage allowance
  const MARGIN = 90;
  const LONG = 60000; // a routine's chat re-reading this much goes on lighter between rounds even with a warm cache…
  const LEAN_SHARE = 0.4; // …when the lighter history is at most this share of it

  const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n || 0)));
  const mins = (ms) => { const m = Math.max(0, Math.round(ms / MIN)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
  const clock = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const uid = () => `rt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  // Provider-normalized input already includes cache; output already includes reasoning.
  // Missing reports are unknown, never a free round. Interrupted reports are lower bounds.
  function usageOf(u) {
    if (!u || !number(u.input) || !number(u.output)) return null;
    const cached = number(u.cached) ? Math.min(u.cached, u.input) : 0;
    const cacheWrite = number(u.cacheWrite) ? Math.min(u.cacheWrite, u.input - cached) : 0;
    return { input:u.input, output:u.output, cached, cacheWrite, fresh:u.input-cached-cacheWrite,
      tokens:u.input+u.output, partial:u.partial === true, cost:number(u.cost) ? u.cost : null };
  }
  function tally(r, u) {
    if (!u || u.partial) r.usageUnknown = true;
    if (!u) return;
    r.usageTotals ||= { input:0, output:0, cached:0, cacheWrite:0, fresh:0, cost:0, costReports:0 };
    for (const k of ['input','output','cached','cacheWrite','fresh']) r.usageTotals[k] += u[k];
    if (u.cost != null) { r.usageTotals.cost += u.cost; r.usageTotals.costReports++; }
  }

  function helperUsage(r, raw) { const u=usageOf(raw);tally(r,u);if(u)r.tokens+=u.tokens;return u; }
  // "18:30" → the next time it is 18:30 (today, or tomorrow when it has passed); null when it isn't a time
  function untilAt(hhmm, now = Date.now()) {
    const m = /^(\d{1,2})[:h.](\d{2})$/.exec(String(hhmm || '').trim());
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    const d = new Date(now); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d.getTime() <= now + MIN) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  // a long routine must have a spending cap: forever, 3 h or more, more than 10 rounds
  function needsCap(how, now = Date.now()) {
    if (!how || how.kind === 'forever') return true;
    if (how.kind === 'time') return how.ms >= 3 * HOUR;
    if (how.kind === 'until') return (how.at || 0) - now >= 3 * HOUR;
    if (how.kind === 'rounds') return how.rounds > 10;
    return true;
  }
  // the default cap from the weekly Spending limit: a quarter of it, never more than what's left this week (≥ 20k);
  // no limit set: 300k
  function defaultCap(spend = {}) {
    const limit = Number(spend.limit) || 0;
    if (!limit) return NO_LIMIT_CAP;
    const left = limit - (Number(spend.tokens) || 0);
    return Math.max(20000, Math.round(Math.min(limit * 0.25, left) / 10000) * 10000);
  }

  // a routine as chosen in the card (or loaded), made safe; null without its chat
  function normalize(r, now = Date.now()) {
    if (!r || typeof r !== 'object' || !r.agentId || !r.chatId) return null;
    const h = r.how || {};
    let how;
    if (h.kind === 'rounds') how = { kind: 'rounds', rounds: Math.min(MAX_ROUNDS, Math.max(1, Math.round(Number(h.rounds) || 5))) };
    else if (h.kind === 'time') how = { kind: 'time', ms: Math.min(48 * HOUR, Math.max(MIN, Number(h.ms) || HOUR)) };
    else if (h.kind === 'until') { const at = Number(h.at) || untilAt(h.time, now); if (!at) return null; how = { kind: 'until', at }; }
    else how = { kind: 'forever' };
    const createdAt = Number(r.createdAt) || now;
    const pause = PAUSES.some((p) => p.id === r.pause) ? r.pause : 'none';
    let cap = number(Number(r.cap)) ? Math.round(Number(r.cap)) : 0;
    if (!cap && needsCap(how, createdAt)) cap = NO_LIMIT_CAP; // a long one is never without a cap
    return {
      id: String(r.id || uid()), agentId: String(r.agentId), chatId: String(r.chatId), title: clip(r.title || '', 60),
      prompt: String(r.prompt ?? '').trim().slice(0, 4000) || DEFAULT_PROMPT,
      how, pause, resumeAfter: [0, 10 * MIN, HOUR].includes(Number(r.resumeAfter)) ? Number(r.resumeAfter) : 0, cap,
      lighter: r.lighter !== false, waitReset: r.waitReset !== false, afterRestart: r.afterRestart === true,
      createdAt, endAt: how.kind === 'time' ? createdAt + how.ms : how.kind === 'until' ? how.at : 0,
      status: ['running', 'paused', 'done', 'stopped'].includes(r.status) ? r.status : 'running', why: String(r.why || ''),
      round: Number(r.round) || 0, done: Number(r.done) || 0, tokens: Number(r.tokens) || 0,
      rounds: Array.isArray(r.rounds) ? r.rounds.slice(-MAX_ROUNDS) : [],
      usageUnknown:r.usageUnknown === true, usageTotals:r.usageTotals ? Object.fromEntries(['input','output','cached','cacheWrite','fresh','cost','costReports'].map(k=>[k,number(r.usageTotals[k])?r.usageTotals[k]:0])) : null,
      errors: Number(r.errors) || 0, net: Number(r.net) || 0, saidDone: Number(r.saidDone) || 0, lastKind: r.lastKind || '',
      lastEnd: Number(r.lastEnd) || 0, quietUntil: Number(r.quietUntil) || 0, resetAt: Number(r.resetAt) || 0,
      inFlight: r.inFlight === true, kickoff: r.kickoff !== false && !(Number(r.round) > 0), askOk: r.askOk === true,
      ...(r.counted ? { counted: Number(r.counted) } : {}),
      // (round 51, routinelean) what it achieved and when it stalls; the usage-limit margin and its pace
      margin: MARGINS.includes(Number(r.margin)) ? Number(r.margin) : MARGIN, files: Number(r.files) || 0, changedRounds: Number(r.changedRounds) || 0,
      changedEver: r.changedEver === true, stale: Number(r.stale) || 0, repeats: Number(r.repeats) || 0, lastText: String(r.lastText || '').slice(-1500),
      pct: r.pct && typeof r.pct === 'object' ? r.pct : {}, limSnap: r.limSnap && typeof r.limSnap === 'object' ? r.limSnap : null,
      limitWait: r.limitWait === true, leanStarts: Number(r.leanStarts) || 0, ...(r.lastErr ? { lastErr: String(r.lastErr).slice(0, 160) } : {}),
    };
  }
  const live = (r) => r && (r.status === 'running' || r.status === 'paused');
  const avg = (r) => (r.done ? r.tokens / r.done : 0);

  // ---------- may the next round go now? ----------
  // ctx: { now, busy (a reply runs in that chat), draft (the owner is typing there), queued (a message waits to go out:
  // the offline queue, the chat's own queue), idleMs (no input in Hearth for), quietMs (since the owner last wrote),
  // askFirst (Spending: "ask before each message" and near / past the weekly limit) }
  // → { act: 'send' } · { act: 'wait', ms, why } · { act: 'pause', why } · { act: 'stop', status, why } · { act: 'none' }
  function nextStep(r, ctx = {}) {
    const now = ctx.now ?? Date.now();
    if (!r || r.status !== 'running') return { act: 'none' };
    if (r.inFlight || ctx.busy) return { act: 'none' }; // its end calls again
    if (r.usageUnknown) return { act:'pause', why:'usage was not fully reported; review this run before starting a new budget' };
    if (r.how.kind === 'rounds' && r.round >= r.how.rounds) return { act: 'stop', status: 'done', why: `all ${r.how.rounds} round${r.how.rounds === 1 ? '' : 's'} done` };
    if (r.round >= MAX_ROUNDS) return { act: 'stop', status: 'done', why: `${MAX_ROUNDS} rounds (the most a routine runs)` };
    if (r.endAt && now >= r.endAt) return { act: 'stop', status: 'done', why: r.how.kind === 'until' ? `it's ${clock(r.endAt)}` : 'the time is up' };
    if (r.cap && r.tokens >= r.cap) return { act: 'stop', status: 'stopped', why: `it reached its token budget (${fmt(r.cap)} tokens)` };
    const estimate = Math.max(avg(r), r.rounds.at(-1)?.tokens || 0, r.done ? 0 : ctx.lastTokens || 0);
    if (r.cap && estimate && r.tokens + estimate > r.cap) return { act: 'stop', status: 'stopped', why: `another round is estimated to exceed its token budget (${fmt(r.tokens)} of ${fmt(r.cap)} used; about ${fmt(estimate)} for a round)` };
    if (r.resetAt && now < r.resetAt) return { act: 'wait', ms: r.resetAt - now, why: r.limitWait ? `paused until ${(ctx.when || clock)(r.resetAt)} (limit)` : `waiting for the usage limit to reset at ${clock(r.resetAt)}` };
    const lim = limitCheck(r, ctx.limits, now, ctx.when);
    if (lim) return lim;
    if (ctx.askFirst && !r.askOk) return { act: 'pause', why: 'your Spending setting asks before each message (near the weekly limit): ▶ to go on' };
    if (r.quietUntil && now < r.quietUntil) return { act: 'wait', ms: r.quietUntil - now, why: `you wrote: it goes on after ${mins(r.resumeAfter)} quiet` };
    if (ctx.queued) return { act: 'wait', ms: 15000, why: 'a message waits to go out first' };
    if (ctx.draft) return { act: 'wait', ms: 15000, why: 'you\'re typing in this chat' };
    const since = now - (r.lastEnd || 0);
    if (since < SETTLE) return { act: 'wait', ms: SETTLE - since, why: '' };
    if (!r.kickoff) {
      const p = PAUSES.find((x) => x.id === r.pause) || PAUSES[0];
      if (p.ms && since < p.ms) return { act: 'wait', ms: p.ms - since, why: `next round in ${mins(p.ms - since) === '0 min' ? 'under a minute' : mins(p.ms - since)}` };
      if (p.idle && (ctx.idleMs ?? Infinity) < p.idle) return { act: 'wait', ms: Math.max(15000, p.idle - (ctx.idleMs || 0)), why: 'next round once you\'ve been idle 10 min' };
      if (p.quiet && (ctx.quietMs ?? Infinity) < p.quiet) return { act: 'wait', ms: Math.max(15000, p.quiet - (ctx.quietMs || 0)), why: 'next round once you haven\'t written for an hour' };
    }
    return { act: 'send' };
  }
  // a round goes out: its number
  function sent(r, now = Date.now()) {
    r.round += 1; r.inFlight = true; r.kickoff = false; r.resetAt = 0; r.limitWait = false; r.why = ''; r.sentAt = now; r.asked = false;
    return r.round;
  }

  // ---------- (round 51, routinelean) the usage limits: pause before one would be hit ----------
  // limits: this AI's windows as usagelimits knows them [{ key, long ('session limit'), used (%), resetsAt }]. A window
  // whose use plus one more round (its pace so far, r.pct) reaches the margin (90 % by default) holds the routine:
  // until the window resets when it may wait for resets (then it goes on by itself), else it pauses for ▶.
  // → null · { act: 'wait', ms, why, hold (the time it goes on), key } · { act: 'pause', why }
  function limitCheck(r, limits, now = Date.now(), when = clock) {
    if (!Array.isArray(limits) || !limits.length) return null;
    let hit = null;
    for (const w of limits) {
      if (!w || typeof w.used !== 'number' || !Number.isFinite(w.used)) continue;
      if (w.resetsAt && now >= w.resetsAt) continue; // already reset: its number is old
      const next = w.used + (Number(r.pct?.[w.key]) || 0);
      if (next < r.margin) continue;
      if (!hit || (w.resetsAt || Infinity) > (hit.resetsAt || Infinity)) hit = w; // the one that frees up last
    }
    if (!hit) return null;
    const name = hit.long || 'usage limit';
    if (r.waitReset && hit.resetsAt) {
      const hold = hit.resetsAt + MIN; // a minute after the reset, so the new window is really there
      return { act: 'wait', ms: hold - now, hold, key: hit.key, why: `paused until ${when(hold)} (limit)`, detail: `${Math.round(hit.used)}% of the ${name} is used; ${r.margin}% is where Keep going stops` };
    }
    return { act: 'pause', why: `${Math.round(hit.used)}% of the ${name} is used (it stops at ${r.margin}%)${hit.resetsAt ? `; it resets ${when(hit.resetsAt)}` : ''}` };
  }
  // at each round's send: how much of each window the last round used (the pace a next round is judged by)
  function limitStep(r, limits) {
    const snap = {};
    for (const w of Array.isArray(limits) ? limits : []) {
      if (!w?.key || typeof w.used !== 'number') continue;
      const was = r.limSnap?.[w.key];
      const same = was && (!was.resetsAt || !w.resetsAt || Math.abs(was.resetsAt - w.resetsAt) < 2 * MIN);
      if (same && w.used >= was.used) {
        const d = w.used - was.used;
        const p = Number(r.pct[w.key]) || 0;
        r.pct[w.key] = Math.round((p ? (p + d) / 2 : d) * 10) / 10;
      }
      snap[w.key] = { used: w.used, resetsAt: w.resetsAt || 0 };
    }
    r.limSnap = snap;
    return r.pct;
  }

  // ---------- (round 51, routinelean) did a round really change something? ----------
  // the tools a reply used, by the names engines.js gives them: Claude "Edit · app.js" / "Write · x" /
  // "mcp__three__three_edit_code", Astra "Edited · a.js, b.js" / "three · three_edit_code"
  const FILE_TOOL = /^(?:Edit|MultiEdit|Write|NotebookEdit|Edited)(?: · (.+))?$/;
  const READ_ONLY = /three_(?:screenshot|read_code|search_code|console|get_code|help|seen|contact_sheet|eval|sliders_get|list)|board_(?:list|get|read|search|look)/;
  const SCENE_TOOL = /(?:^|__|· )(?:three_|board_)\w+/;
  // tools: the reply's tool names; ai: what aiundo recorded for that reply ([{ area, target }]) → { files, scene, changed }
  function changeOf(tools = [], ai = []) {
    const files = new Set(); let scene = 0;
    for (const t of Array.isArray(tools) ? tools : []) {
      const s = String(t || '');
      const f = FILE_TOOL.exec(s);
      if (f) { for (const n of String(f[1] || 'a file').split(/,\s*/)) files.add(n.trim()); continue; }
      if (SCENE_TOOL.test(s) && !READ_ONLY.test(s)) scene += 1;
    }
    for (const e of Array.isArray(ai) ? ai : []) {
      if (e?.area === 'file') files.add(String(e.u?.path || e.target || 'a file').split(/[\\/]/).pop());
      else if (e) scene += 1;
    }
    return { files: files.size, names: [...files].slice(0, 12), scene, changed: files.size > 0 || scene > 0 };
  }
  // how alike two answers are: the share of word triples they have in common (0–1)
  function similar(a, b) {
    const grams = (s) => { const w = String(s || '').toLowerCase().replace(/```[\s\S]*?```/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean); const g = new Set(); for (let i = 0; i < Math.max(1, w.length - 2); i++) g.add(w.slice(i, i + 3).join(' ')); return g; };
    const A = grams(a); const B = grams(b);
    if (!A.size || !B.size) return 0;
    let n = 0; for (const x of A) if (B.has(x)) n += 1;
    return n / Math.max(A.size, B.size);
  }
  // the round's one-line summary for a notification: its "Changed: …" line, else its last sentence
  function summaryOf(text) {
    const t = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ');
    const line = t.split(/\r?\n/).map((l) => l.replace(/^[\s>*_#-]+|[*_]+/g, '').trim()).filter(Boolean);
    const ch = [...line].reverse().find((l) => /^(?:changed|summary|done|what changed)\s*:/i.test(l));
    if (ch) return clip(ch, 140);
    const last = line.at(-1) || '';
    const s = last.match(/[^.!?]+[.!?]*\s*$/)?.[0] || last;
    return clip(s, 140);
  }

  // ---------- (round 51, routinelean) between rounds: go on lighter? ----------
  // input: historylean's numbers for the chat (HistoryLean.plan(chat).input: ctx re-read when resuming, lean (the lighter
  // history), fixed, gap, ttl, warm, off, blocked) and how many rounds may follow. Its own rule (a cold cache, a big gain)
  // already applies to any message; a routine knows more rounds follow, so it also goes lighter with a warm cache once
  // the chat re-reads ≥ 60k and the lighter history is ≤ 40 % of it. → { lean, why }
  function leanBetween(i, { remaining = 1 } = {}) {
    if (!i || i.off) return { lean: false, why: 'off' };
    if (i.blocked) return { lean: false, why: i.blocked };
    const before = Number(i.ctx) || 0; const after = (Number(i.lean) || 0) + (Number(i.fixed) || 0);
    if (!before || before - after < 2000) return { lean: false, why: 'the history is already lean' };
    if (i.warm != null ? i.warm < 0.5 : false) return { lean: true, why: 'the cache has expired' };
    if (remaining >= 1 && before >= LONG && after <= before * LEAN_SHARE) return { lean: true, why: `the chat re-reads ≈ ${fmt(before)} tokens a step and more rounds follow` };
    return { lean: false, why: 'the cache is warm' };
  }

  // ---------- (round 51, routinelean) what Keep going spent and achieved, per day (Usage window) ----------
  // stats: { days: { 'YYYY-MM-DD': { t (tokens), r (rounds), f (files changed), c (rounds that changed something), n (routines started) } } }
  const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function statAdd(stats, d = {}, now = Date.now()) {
    const s = stats && typeof stats === 'object' && stats.days && typeof stats.days === 'object' ? stats : { days: {} };
    const k = dayKey(now);
    const x = (s.days[k] ||= { t: 0, r: 0, f: 0, c: 0, n: 0 });
    for (const f of ['t', 'r', 'f', 'c', 'n']) x[f] = (Number(x[f]) || 0) + (Number(d[f]) || 0);
    const keys = Object.keys(s.days).sort();
    while (keys.length > 15) delete s.days[keys.shift()];
    return s;
  }
  // the sums of today and of the last 7 days
  function statSum(stats, now = Date.now()) {
    const out = { today: { t: 0, r: 0, f: 0, c: 0, n: 0 }, week: { t: 0, r: 0, f: 0, c: 0, n: 0 } };
    const days = stats?.days || {};
    const today = dayKey(now);
    for (let i = 0; i < 7; i++) {
      const k = dayKey(now - i * 864e5);
      const x = days[k]; if (!x) continue;
      for (const f of Object.keys(out.week)) { out.week[f] += Number(x[f]) || 0; if (k === today) out.today[f] += Number(x[f]) || 0; }
    }
    return out;
  }
  const statWords = (x) => (x.r ? `≈ ${fmt(x.t)} tokens · ${x.r} round${x.r === 1 ? '' : 's'} · ${x.f} file${x.f === 1 ? '' : 's'} changed${x.c < x.r ? ` · ${x.c} of ${x.r} rounds changed something` : ''}` : 'nothing yet');

  // ---------- the AI said it's done / stuck (the end of its reply, so "once I'm done with X" early on doesn't count) ----------
  const DONE_RE = /\b(nothing(?: else| more)? (?:is )?left(?: (?:worth|to) (?:improv|do|chang|add|fix)\w*)?|nothing (?:else |more )?(?:worth|to) (?:improv|do|chang|add|fix)\w*|no (?:further|more|other|obvious) (?:improvements?|changes?|work) (?:left|needed|to make|worth)|(?:i'?m|i am|we'?re|we are|everything(?:'s| is)) (?:all |now )?(?:done|finished|complete)\b|all done\b|that'?s everything|there(?:'s| is) nothing (?:else |more |left )?(?:to|worth))/i;
  const STUCK_RE = /\b(i'?m stuck|i am stuck|(?:can'?t|cannot|unable to) (?:proceed|continue|go further|make (?:more |further )?progress)|blocked (?:on|by|until)|i need (?:you|your (?:input|help|decision|answer|ok|approval))|(?:without|until i get) (?:your|more) (?:input|information|answer)|waiting (?:for|on) (?:you|your))/i;
  function saysDone(text) {
    const t = String(text || '').replace(/```[\s\S]*?```/g, ' ').trim();
    const tail = t.slice(-500);
    if (STUCK_RE.test(tail)) return 'stuck';
    if (DONE_RE.test(tail)) return 'done';
    return null;
  }

  // ---------- a round ended ----------
  // ev: { type: 'done' | 'error' | 'stopped', text, tokens, ms, kind (offline-core's classify: offline · busy · proxy ·
  // limit · signedout), resetAt, asked (a permission card / question showed in this chat during the round), plan (a
  // plan waits for ▶ Go ahead) } → { act: 'continue' | 'pause' | 'stop' | 'wait', why } (r is updated)
  function roundEnded(r, ev = {}, now = Date.now()) {
    const previous = { status:r.status, why:r.why };
    r.inFlight = false; r.lastEnd = now;
    const n = r.round;
    const rec = (ok, extra = {}) => { r.rounds.push({ n, at: now, ms: ev.ms || 0, tokens: ev.tokens || 0, ok, ...(ev.usage !== undefined ? {usage:ev.usage} : {}), ...extra }); if (r.rounds.length > MAX_ROUNDS) r.rounds.shift(); };
    if (ev.usage !== undefined) tally(r, ev.usage);
    if (ev.tokens) r.tokens += ev.tokens;
    let out;
    if (ev.type === 'stopped') { rec(false, { stopped: true }); out = { act: 'pause', why: 'you stopped the reply' }; }
    else if (ev.type === 'error') {
      const kind = ev.kind || 'other';
      if (TRANSIENT.has(kind)) {
        r.net += 1;
        rec(false, { kind });
        out = r.net >= NET_PAUSE ? { act: 'pause', why: 'the connection kept failing' } : { act: 'wait', why: kind === 'busy' ? 'the AI\'s service is busy: the message is retried' : 'no internet: the message goes out when it\'s back' };
      } else if (kind === 'limit') {
        rec(false, { kind });
        if (r.waitReset && ev.resetAt && ev.resetAt > now) { r.resetAt = ev.resetAt + 30000; out = { act: 'continue', why: `waiting for the usage limit to reset at ${clock(r.resetAt)}` }; }
        else out = { act: 'stop', why: 'the usage limit was reached' };
      } else if (kind === 'signedout') { rec(false, { kind }); out = { act: 'stop', why: 'the AI is signed out' }; }
      else {
        r.errors += 1; // in a row (an answered round sets it back to 0)
        r.lastKind = `e:${clip(ev.text, 40)}`;
        rec(false, { kind: 'error', error: clip(ev.text, 160) });
        out = r.errors >= ERR_STOP ? { act: 'stop', why: `it failed ${r.errors} times in a row${r.lastErr && similar(r.lastErr, ev.text) >= 0.6 ? ' with the same error' : ''} (${clip(ev.text, 80) || 'an error'})` } : { act: 'continue', why: '' };
        r.lastErr = clip(ev.text, 160);
      }
    } else {
      r.done += 1; r.errors = 0; r.net = 0; r.lastKind = '';
      const said = saysDone(ev.text);
      r.saidDone = said ? r.saidDone + 1 : 0;
      // (round 51, routinelean) real change: files / the scene (when the engine tells), and an answer that isn't a repeat
      const ch = ev.change || null;
      if (ch) {
        r.files += ch.files || 0;
        if (ch.changed) { r.changedRounds += 1; r.changedEver = true; r.stale = 0; } else r.stale += 1;
      }
      const text = String(ev.text || '');
      const same = r.lastText && text && similar(text, r.lastText) >= SAME;
      r.repeats = same ? r.repeats + 1 : 0;
      r.lastText = text.slice(-1500);
      rec(true, { ...(said ? { said } : {}), ...(ch ? { files: ch.files || 0, changed: Boolean(ch.changed) } : {}), ...(same ? { same: true } : {}), ...(ev.summary ? { sum: clip(ev.summary, 140) } : {}) });
      if (r.saidDone >= DONE_STOP) out = { act: 'stop', status: 'done', why: said === 'stuck' ? 'it said it\'s stuck twice in a row' : 'it said it\'s done twice in a row' };
      else if (r.repeats >= REPEAT_STOP) out = { act: 'stop', status: 'done', why: `its last ${r.repeats} answers repeated the one before: nothing new is coming` };
      else if (ch && r.changedEver && r.stale >= STALE_STOP && !ev.asked && !ev.plan) out = { act: 'stop', status: 'done', why: `the last ${r.stale} rounds changed no file and nothing in the scene` };
      else if (ev.asked) out = { act: 'pause', why: 'it asked for your OK: answer it, then ▶' };
      else if (ev.plan) out = { act: 'pause', why: 'its plan waits for your ▶ Go ahead' };
      else out = { act: 'continue', why: '' };
    }
    if (previous.status !== 'running') { r.status=previous.status; r.why=previous.why; return {act:'none',why:r.why}; }
    if (r.usageUnknown && (out.act === 'continue' || out.act === 'wait')) out={act:'pause',why:'usage was not fully reported; review this run before starting a new budget'};
    if (out.act === 'pause') { r.status = 'paused'; r.why = out.why; }
    if (out.act === 'stop') { r.status = out.status || 'stopped'; r.why = out.why; }
    if (out.act === 'continue' || out.act === 'wait') r.why = out.why;
    return out;
  }

  // ---------- the owner, restarts, ▶ / ❚❚ ----------
  // the owner wrote in this chat: paused until ▶, or (their choice) going on after a quiet time
  function ownerWrote(r, now = Date.now()) {
    if (!live(r)) return r;
    if (r.resumeAfter) { r.quietUntil = now + r.resumeAfter; if (r.status === 'running') r.why = `you wrote: it goes on after ${mins(r.resumeAfter)} quiet`; }
    else { r.status = 'paused'; r.why = 'you wrote in this chat'; }
    return r;
  }
  // Hearth started again: a running routine asks first (▶ Resume), unless the owner chose "keep going after a restart"
  function restarted(r) {
    if (r.inFlight) { r.usageUnknown = true; r.inFlight = false; r.lastEnd = Date.now(); r.status='paused'; r.why='Hearth closed during a round; its full usage is unknown'; }
    if (r.status === 'running' && !r.afterRestart) { r.status = 'paused'; r.why = 'Hearth restarted: ▶ to go on'; r.restartPaused = true; }
    return r;
  }
  function resume(r, now = Date.now()) {
    if (!live(r)) return r;
    if (r.why && /Spending/.test(r.why)) r.askOk = true;
    r.status = 'running'; r.why = ''; r.quietUntil = 0; r.net = 0; r.kickoff = true; r.restartPaused = false;
    if (r.lastEnd > now) r.lastEnd = now;
    return r;
  }
  function pause(r, why = 'paused by you') { if (r.status === 'running') { r.status = 'paused'; r.why = why; } return r; }
  function stop(r, why = 'stopped by you') { if (live(r)) { r.status = 'stopped'; r.why = why; r.inFlight = false; } return r; }

  // ---------- words ----------
  function howText(how) {
    if (how.kind === 'rounds') return `${how.rounds} more round${how.rounds === 1 ? '' : 's'}`;
    if (how.kind === 'time') return `for ${mins(how.ms)}`;
    if (how.kind === 'until') return `until ${clock(how.at)}`;
    return 'until you stop it';
  }
  const pauseText = (id) => (PAUSES.find((p) => p.id === id) || PAUSES[0]).label.toLowerCase();
  // the header chip: "🔁 3 of 5 · ≈ 42k tokens so far"
  function chipText(r, now = Date.now(), when = clock) {
    const n = r.round;
    const prog = r.how.kind === 'rounds' ? `${n} of ${r.how.rounds}` : r.endAt ? `${n} · ${mins(r.endAt - now)} left` : `${n}`;
    const held = r.status === 'running' && r.limitWait && r.resetAt > now; // (round 51) waiting out a usage limit
    const icon = r.status === 'paused' || held ? '❚❚' : r.status === 'running' ? '🔁' : r.status === 'done' ? '✓' : '■';
    return `${icon} ${prog}${held ? ` · paused until ${when(r.resetAt)} (limit)` : ''} · ≈ ${fmt(r.tokens)}${r.usageUnknown ? '+' : ''} tokens so far${r.cap ? ` of ${fmt(r.cap)}` : ''}`;
  }
  function describe(r) {
    return `🔁 Keep going ${howText(r.how)}${r.pause !== 'none' ? `, ${pauseText(r.pause)} between rounds` : ''}${r.cap ? `, token budget ${fmt(r.cap)} (checked between rounds)` : ''}`;
  }
  // the routine's message as the AI gets it: the owner's words as written (nothing hidden, nothing added)
  const message = (r) => r.prompt;

  return { MIN, HOUR, SETTLE, DEFAULT_PROMPT, HOW, PAUSES, WHEN_I_WRITE, CAPS, NO_LIMIT_CAP, MAX_ROUNDS, ERR_STOP, DONE_STOP, NET_PAUSE, TRANSIENT,
    STALE_STOP, REPEAT_STOP, SAME, MARGINS, MARGIN, LONG, LEAN_SHARE, limitCheck, limitStep, changeOf, similar, summaryOf, leanBetween, dayKey, statAdd, statSum, statWords,
    untilAt, needsCap, defaultCap, normalize, live, nextStep, sent, saysDone, roundEnded, ownerWrote, restarted, resume, pause, stop,
    howText, pauseText, chipText, describe, message, usageOf, helperUsage, fmt, mins, clock, clip, uid };
})();
if (typeof module !== 'undefined') module.exports = RoutinesCore;
