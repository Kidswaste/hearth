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
  const DEFAULT_PROMPT = 'Keep improving: do the next 5 improvements, then summarise what changed. If nothing is left worth doing, say so plainly.';
  const HOW = [
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
  const CAPS = [50000, 100000, 300000, 1000000, 3000000];
  const NO_LIMIT_CAP = 300000; // the default cap when no weekly limit is set
  const MAX_ROUNDS = 200; // a hard ceiling, whatever was chosen
  const ERR_STOP = 2; // the same failure twice in a row: stop
  const DONE_STOP = 2; // "nothing left to do" / "I'm stuck" twice in a row: stop
  const NET_PAUSE = 6; // the internet / a busy service failing this many rounds in a row: pause (the queue retries before that)
  const TRANSIENT = new Set(['offline', 'busy', 'proxy']); // offline.js retries these by itself (the message waits)

  const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n || 0)));
  const mins = (ms) => { const m = Math.max(0, Math.round(ms / MIN)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
  const clock = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const uid = () => `rt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

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
    let cap = Math.max(0, Math.round(Number(r.cap) || 0));
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
      errors: Number(r.errors) || 0, net: Number(r.net) || 0, saidDone: Number(r.saidDone) || 0, lastKind: r.lastKind || '',
      lastEnd: Number(r.lastEnd) || 0, quietUntil: Number(r.quietUntil) || 0, resetAt: Number(r.resetAt) || 0,
      inFlight: r.inFlight === true, kickoff: r.kickoff !== false && !(Number(r.round) > 0), askOk: r.askOk === true,
      ...(r.counted ? { counted: Number(r.counted) } : {}),
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
    if (r.how.kind === 'rounds' && r.round >= r.how.rounds) return { act: 'stop', status: 'done', why: `all ${r.how.rounds} round${r.how.rounds === 1 ? '' : 's'} done` };
    if (r.round >= MAX_ROUNDS) return { act: 'stop', status: 'done', why: `${MAX_ROUNDS} rounds (the most a routine runs)` };
    if (r.endAt && now >= r.endAt) return { act: 'stop', status: 'done', why: r.how.kind === 'until' ? `it's ${clock(r.endAt)}` : 'the time is up' };
    if (r.cap && r.tokens >= r.cap) return { act: 'stop', status: 'stopped', why: `it reached its spending cap (≈ ${fmt(r.cap)} tokens)` };
    if (r.cap && r.done && r.tokens + avg(r) > r.cap) return { act: 'stop', status: 'stopped', why: `another round would pass its spending cap (≈ ${fmt(r.tokens)} of ${fmt(r.cap)} tokens used)` };
    if (r.resetAt && now < r.resetAt) return { act: 'wait', ms: r.resetAt - now, why: `waiting for the usage limit to reset at ${clock(r.resetAt)}` };
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
    r.round += 1; r.inFlight = true; r.kickoff = false; r.resetAt = 0; r.why = ''; r.sentAt = now; r.asked = false;
    return r.round;
  }

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
    r.inFlight = false; r.lastEnd = now;
    const n = r.round;
    const rec = (ok, extra = {}) => { r.rounds.push({ n, at: now, ms: ev.ms || 0, tokens: ev.tokens || 0, ok, ...extra }); if (r.rounds.length > MAX_ROUNDS) r.rounds.shift(); };
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
        out = r.errors >= ERR_STOP ? { act: 'stop', why: `it failed ${r.errors} times in a row (${clip(ev.text, 80) || 'an error'})` } : { act: 'continue', why: '' };
      }
    } else {
      r.done += 1; r.errors = 0; r.net = 0; r.lastKind = '';
      const said = saysDone(ev.text);
      r.saidDone = said ? r.saidDone + 1 : 0;
      rec(true, said ? { said } : {});
      if (r.saidDone >= DONE_STOP) out = { act: 'stop', status: 'done', why: said === 'stuck' ? 'it said it\'s stuck twice in a row' : 'it said it\'s done twice in a row' };
      else if (ev.asked) out = { act: 'pause', why: 'it asked for your OK: answer it, then ▶' };
      else if (ev.plan) out = { act: 'pause', why: 'its plan waits for your ▶ Go ahead' };
      else out = { act: 'continue', why: '' };
    }
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
    if (r.inFlight) { r.inFlight = false; r.lastEnd = Date.now(); }
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
  function chipText(r, now = Date.now()) {
    const n = r.round;
    const prog = r.how.kind === 'rounds' ? `${n} of ${r.how.rounds}` : r.endAt ? `${n} · ${mins(r.endAt - now)} left` : `${n}`;
    const icon = r.status === 'paused' ? '❚❚' : r.status === 'running' ? '🔁' : r.status === 'done' ? '✓' : '■';
    return `${icon} ${prog} · ≈ ${fmt(r.tokens)} tokens so far${r.cap && r.how.kind === 'forever' ? ` of ${fmt(r.cap)}` : ''}`;
  }
  function describe(r) {
    return `🔁 Keep going ${howText(r.how)}${r.pause !== 'none' ? `, ${pauseText(r.pause)} between rounds` : ''}${r.cap ? `, at most ≈ ${fmt(r.cap)} tokens` : ''}`;
  }
  // the routine's message as the AI gets it: the owner's words as written (nothing hidden, nothing added)
  const message = (r) => r.prompt;

  return { MIN, HOUR, SETTLE, DEFAULT_PROMPT, HOW, PAUSES, WHEN_I_WRITE, CAPS, NO_LIMIT_CAP, MAX_ROUNDS, ERR_STOP, DONE_STOP, NET_PAUSE, TRANSIENT,
    untilAt, needsCap, defaultCap, normalize, live, nextStep, sent, saysDone, roundEnded, ownerWrote, restarted, resume, pause, stop,
    howText, pauseText, chipText, describe, message, fmt, mins, clock, clip, uid };
})();
if (typeof module !== 'undefined') module.exports = RoutinesCore;
