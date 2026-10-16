// (round 34, offline) When things go wrong outside Hearth: the pure part, shared by the window (offline.js) and the
// Node tests (dev/offline-test.js). No DOM, no IPC.
//   classify(text)          what an engine's error means: offline · proxy · busy · limit · signedout (or null)
//   parseReset(text, now)   when a usage limit resets, from Claude Code's / Codex's own words (epoch, "resets 6pm
//                           (Europe/Paris)", "try again in 2 hours 5 minutes", "try again at Oct 13th, 2026 6:00 PM")
//   clock(ms, now)          that moment in this computer's local time ("18:00", "18:00 tomorrow", "Tue 18:00")
//   backoff(n, after)       the wait before the n-th automatic retry of a busy engine (bounded: MAX_TRIES)
//   line(kind, o)           the one plain line the chat shows for each case
//   stitch(a, b)            a cut-off reply + its continuation, without the words the continuation repeated
//   continuePrompt(tail)    the short line that asks for the rest (the session is resumed, not the whole context)
//   reconcile / nextDue / wakeIn   the waiting queue: what survives a restart, what goes out next, never twice
const OfflineCore = (() => {
  // ---------- what an error means ----------
  // Real texts seen from the engines (dev/offline-test.js has one case per line):
  //   Claude Code: "Invalid API key · Please run /login", "OAuth token has expired…", "API Error: 401 …authentication_error",
  //     "API Error: 529 {…overloaded_error…}", "API Error: 429 {…rate_limit_error…}", "API Error: Connection error.",
  //     "API Error (Request timed out.)", "Claude AI usage limit reached|1760378400", "5-hour limit reached ∙ resets 6pm",
  //     "You've hit your limit · resets 6pm (Europe/Paris)"
  //   Codex: "stream disconnected before completion: error sending request for url (…)", "exceeded retry limit, last
  //     status: 429 Too Many Requests", "We're currently experiencing high demand…", "You've hit your usage limit. Upgrade
  //     to Pro (…) or try again in 2 hours 13 minutes.", "Your access token could not be refreshed because your refresh
  //     token has expired. Please log out and sign in again.", "Not logged in. Please run codex login"
  const SIGNED_OUT = /not logged in|(isn't|is not|not) signed in|please run \/login|run \/login|codex login|unauthori[sz]ed|\b401\b|authentication_error|invalid api key|invalid x-api-key|sign in again|log ?in again|log out and sign in|(access|oauth|refresh) token (has )?(expired|is invalid|was revoked|could not be refreshed)|token (has )?expired|credentials? (have |has )?(expired|missing)/i;
  const LIMIT = /usage limit|hit your (usage )?limit|(5-hour|weekly|daily|opus|session|monthly) limit (reached|hit)|limit reached[^.\n]*reset|limit will reset|out of (extra )?usage|insufficient_quota|usage_limit_reached|quota (exceeded|reached)/i;
  const PROXY = /\b407\b|proxy authentication|proxy (error|refused|connect|blocked)|tunnel(l)?ing socket|self[- ]signed certificate|unable to (get|verify) (local issuer|the first) certificate|certificate (has expired|verify failed|chain)|CERT_[A-Z_]+|UNABLE_TO_VERIFY|ERR_TLS|SSL routines|captive portal|blocked by (your )?(network|firewall|administrator)/i;
  const BUSY = /\b529\b|overloaded|\b503\b|service unavailable|\b502\b|bad gateway|internal server error|\bapi error: 5\d\d\b|high demand|server_is_overloaded|(at|over) capacity|temporarily unavailable|\b429\b|rate.?limit|too many requests|slow down/i;
  const NETWORK = /ENOTFOUND|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ENETDOWN|EPIPE|getaddrinfo|socket hang up|fetch failed|network (error|is unreachable|request failed|is down|changed)|stream disconnected|connection (closed|reset|error|refused|lost|dropped|timed out)|Request timed out|timed out waiting|error sending request|no internet|internet connection|dns (error|lookup)|failed to lookup|are you offline|you('| a)re offline/i;
  // the fix line engines.js appends ("Fix: … check the internet connection (or VPN / proxy)") is never the reason
  const reasonOf = (text) => String(text || '').split(/\n\nFix: /)[0];
  function classify(text, { now = Date.now() } = {}) {
    const t = reasonOf(text);
    if (!t.trim()) return null;
    if (SIGNED_OUT.test(t) && !LIMIT.test(t)) return { kind: 'signedout' };
    if (LIMIT.test(t)) { const resetAt = parseReset(t, now); return { kind: 'limit', ...(resetAt ? { resetAt } : {}) }; }
    if (PROXY.test(t)) return { kind: 'proxy' };
    if (BUSY.test(t)) { const after = retryAfter(t); return { kind: 'busy', ...(after ? { retryAfterMs: after } : {}) }; }
    if (NETWORK.test(t)) return { kind: 'offline' };
    return null;
  }

  // "retry-after: 30", "retry after 20 seconds", "try again in 45s" (a short wait the service asked for)
  function retryAfter(text) {
    const m = String(text).match(/retry[- ]after["':\s]+(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds?)?/i) || String(text).match(/try again in (\d+(?:\.\d+)?)\s*(ms|s|sec|seconds?)\b/i);
    if (!m) return 0;
    const n = Number(m[1]);
    return /^ms$/i.test(m[2] || '') ? n : n * 1000;
  }

  // ---------- when a limit resets ----------
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const UNIT_MS = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  // A time zone's offset from UTC at a moment (ms), through Intl; 0 for a name it doesn't know (then local time is used).
  function offsetOf(tz, at) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(at / 1000) * 1000;
  }
  const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
  // The wall-clock time y-mo-d h:mi in that zone (or this computer's), as a moment.
  function zoned(y, mo, d, h, mi, tz) {
    if (!tz) return new Date(y, mo, d, h, mi, 0, 0).getTime();
    const guess = Date.UTC(y, mo, d, h, mi);
    let t = guess - offsetOf(tz, guess);
    t = guess - offsetOf(tz, t); // across a daylight-saving change the second guess is right
    return t;
  }
  // Today's date in that zone (or here).
  function dateIn(tz, at) {
    if (!tz) { const d = new Date(at); return [d.getFullYear(), d.getMonth(), d.getDate()]; }
    const d = new Date(at + offsetOf(tz, at));
    return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
  }
  function parseReset(text, now = Date.now()) {
    const t = String(text || '');
    // Claude Code's old print-mode form: "…usage limit reached|1760378400" (seconds since 1970)
    const epoch = t.match(/\|(\d{10}|\d{13})\b/);
    if (epoch) { const n = Number(epoch[1]); return epoch[1].length === 10 ? n * 1000 : n; }
    // an ISO moment
    const iso = t.match(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))\b/);
    if (iso && !Number.isNaN(Date.parse(iso[1]))) return Date.parse(iso[1]);
    // "try again in 2 hours 13 minutes", "resets in 37 min", "in 1d 4h"
    const rel = t.match(/\b(?:try again|retry|resets?|available(?: again)?|reset)\s+in\s+((?:\d+(?:\.\d+)?\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b[\s,]*(?:and\s+)?)+)/i);
    if (rel) {
      let ms = 0;
      for (const [, n, u] of rel[1].matchAll(/(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi)) ms += Number(n) * UNIT_MS[u[0].toLowerCase()];
      if (ms > 0) return now + ms;
    }
    // "resets 6pm", "resets at 6:30pm (Europe/Paris)", "try again at Oct 13th, 2026 6:00 PM", "until 18:00"
    const abs = t.match(/\b(?:resets?|reset(?:s)? at|try again (?:at|after|on)|available (?:again )?at|until|limit will reset at)\s+(?:at\s+|on\s+)?(?:([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(?:(\d{4}),?\s*)?(?:at\s+)?)?(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?:\s*\(([^)]+)\)|\s+([A-Z][A-Za-z_]+\/[A-Za-z_/]+|UTC|GMT))?/i);
    if (abs && (abs[5] != null || abs[6] || /h\d|resets?\s+\d/i.test(abs[0]))) {
      let h = Number(abs[4]);
      const mi = Number(abs[5] || 0);
      const ap = (abs[6] || '').toLowerCase().replace(/\./g, '');
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      if (h > 23 || mi > 59) return null;
      let tz = (abs[7] || abs[8] || '').trim();
      if (/^(UTC|GMT)$/i.test(tz)) tz = 'UTC';
      if (tz && !validTz(tz)) tz = '';
      const mon = abs[1] ? MONTHS.indexOf(abs[1].slice(0, 3).toLowerCase()) : -1;
      if (mon >= 0 && abs[2]) {
        const [cy] = dateIn(tz, now);
        let at = zoned(abs[3] ? Number(abs[3]) : cy, mon, Number(abs[2]), h, mi, tz);
        if (!abs[3] && at < now - 86400000) at = zoned(cy + 1, mon, Number(abs[2]), h, mi, tz);
        return at;
      }
      const [y, m, d] = dateIn(tz, now);
      let at = zoned(y, m, d, h, mi, tz);
      if (at < now - 60000) at = zoned(y, m, d + 1, h, mi, tz); // a time of day already past: tomorrow's
      return at;
    }
    return null;
  }

  // That moment on this computer's clock: "18:00", "18:00 tomorrow", "Tue 18:00" (within a week), else "13 Oct 18:00".
  function clock(ms, now = Date.now(), { locale, h23 } = {}) {
    const d = new Date(ms);
    const opts = { hour: '2-digit', minute: '2-digit', ...(h23 ? { hourCycle: 'h23' } : {}) };
    const time = d.toLocaleTimeString(locale, opts);
    const day = (x) => { const y = new Date(x); return new Date(y.getFullYear(), y.getMonth(), y.getDate()).getTime(); };
    const days = Math.round((day(ms) - day(now)) / 86400000);
    if (days <= 0) return time;
    if (days === 1) return `${time} tomorrow`;
    if (days < 7) return `${d.toLocaleDateString(locale, { weekday: 'short' })} ${time}`;
    return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} ${time}`;
  }

  // ---------- bounded automatic retries ----------
  const MAX_TRIES = 3;
  const BUSY_WAIT = [20000, 40000, 80000];
  function backoff(n, retryAfterMs = 0) {
    if (retryAfterMs > 0) return Math.max(5000, Math.min(retryAfterMs, 300000));
    return BUSY_WAIT[Math.min(Math.max(n, 1), BUSY_WAIT.length) - 1];
  }
  // Waiting for the internet: how long between checks (a check costs nothing: no engine, no tokens), and before a
  // message that just failed for lack of internet goes out again (never a tight loop on flaky Wi-Fi).
  const PROBE_WAIT = [3000, 6000, 12000, 24000, 30000];
  const probeWait = (n) => PROBE_WAIT[Math.min(Math.max(n, 0), PROBE_WAIT.length - 1)];
  const RESEND_WAIT = [0, 5000, 15000, 30000, 60000];
  const resendWait = (n) => RESEND_WAIT[Math.min(Math.max(n, 0), RESEND_WAIT.length - 1)];

  // ---------- the one plain line ----------
  // o: { who (the engine's name), other (the other AI's name, or ''), resetAt, now, inS (seconds to the next try),
  //      queued, cancelled, gaveUp, slept, h23 }
  function line(kind, o = {}) {
    const who = o.who || 'Claude';
    const until = o.resetAt ? ` until ${clock(o.resetAt, o.now, { h23: o.h23 })}` : '';
    switch (kind) {
      case 'offline': return o.queued ? 'No internet — will send when you\'re back' : 'No internet — not sent';
      case 'busy':
        if (o.inS != null && !o.gaveUp && !o.cancelled) return `${who} is busy right now — retrying in ${o.inS} s`;
        return `${who} is busy right now — try again in a moment${o.other ? `, or ask ${o.other}` : ''}`;
      case 'limit':
        if (o.queued && o.resetAt) return `Usage limit reached${until} — will send at ${clock(o.resetAt, o.now, { h23: o.h23 })}`;
        return `Usage limit reached${until}${o.other ? ` — switch to ${o.other}?` : ''}`;
      case 'signedout': return 'Signed out —';
      case 'proxy': return `Can't reach ${who} from this network — a VPN or proxy may be blocking it`;
      case 'cutoff': {
        if (o.crashed) return o.queued ? 'Reply cut off (Hearth closed while it was being written) — will continue' : 'Reply cut off — Hearth closed while it was being written'; // (round 50, crashsafe)
        const why = o.slept ? 'while the computer slept' : 'the connection dropped';
        return o.queued ? `Reply cut off (${why}) — will continue when you're back` : `Reply cut off — ${why}`;
      }
      default: return '';
    }
  }

  // ---------- a cut-off reply + its continuation ----------
  // The continuation often repeats the last words (or the whole start) of what was already written; the repeat goes.
  function stitch(a, b) {
    const A0 = String(a || '');
    const A = A0.replace(/\s+$/, '');
    let B = String(b || '').replace(/^\s+/, '');
    if (!A) return B;
    if (!B) return A0;
    // it started over: the continuation holds the whole start of the cut reply
    const head = A.slice(0, Math.min(A.length, 160));
    if (head.length >= 24 && B.startsWith(head)) return B;
    // inside an open code block, a continuation that opens one again (```js) doesn't
    if (((A.match(/```/g) || []).length % 2) === 1) B = B.replace(/^```[\w+-]*\n/, '');
    // the longest overlap: the end of A that B starts with (whole words, at least 8 characters)
    for (let k = Math.min(A.length, B.length, 400); k >= 8; k--) {
      if (!A.endsWith(B.slice(0, k))) continue;
      const endsWell = /\s/.test(B[k] || ' ') || /\W/.test(B[k - 1]) || k === B.length;
      const startsWell = !/\w/.test(A[A.length - k - 1] || ' ') || /\W/.test(B[0]);
      if (endsWell && startsWell) return A + B.slice(k);
    }
    // the cut word, written again whole: "…the quick bro" + "brown fox" → "…the quick brown fox"
    const part = A.match(/([A-Za-zÀ-ɏ]+)$/);
    if (part && /\S$/.test(A0)) {
      const first = B.match(/^([A-Za-zÀ-ɏ]+)/);
      if (first && first[1].length > part[1].length && first[1].toLowerCase().startsWith(part[1].toLowerCase())) return A.slice(0, -part[1].length) + B;
    }
    if (/\s$/.test(A0)) return A0 + B;
    if (/^[.,;:!?)\]}'"’]/.test(B)) return A + B;
    return `${A}${/\n$/.test(A0) ? '\n' : ' '}${B}`;
  }
  // ~50 tokens: the session is resumed (the engine already has the conversation); the last words say where it was.
  const TAIL = 200;
  // (round 50, crashsafe) ask: the question, when Hearth itself closed mid-reply (the engine's session may not have it)
  function continuePrompt(written, ask = '') {
    const tail = String(written || '').replace(/\s+$/, '').slice(-TAIL);
    const q = String(ask || '').trim().slice(0, 4000);
    return `Your last reply was cut off (the connection dropped). Continue exactly where it stopped, without repeating anything already written.${tail ? ` It ended with:\n"""\n${tail}\n"""` : ''}${q ? `\nMy message was:\n"""\n${q}\n"""` : ''}`;
  }
  const isContinue = (text) => /^Your last reply was cut off \(the connection dropped\)\. Continue exactly where it stopped/.test(String(text || ''));

  // ---------- the waiting queue ----------
  // item: { id, kind: 'new' | 'retry' | 'continue', agentId, chatId, text?, mission?, after?, errAt?, reason, at,
  //         notBefore?, tries?, status: 'waiting' | 'sending' }
  // (round 36, capturefix) mission: the mission picked for a waiting message (Swarm, Ask everyone, Plan first…): it
  // runs as that mission when it goes out, not as a plain message (on disk with the item, so after a restart too).
  // after: the failed ask a mission re-run replaces (its time).
  // After a restart: an item that was going out when Hearth closed went out if its chat shows it (sent(item) → true);
  // otherwise it waits again. Never sent twice.
  function reconcile(items, sent) {
    return (Array.isArray(items) ? items : []).filter((it) => it && it.id && it.agentId)
      .filter((it) => it.status !== 'sending' || !sent(it))
      .map((it) => (it.status === 'sending' ? { ...it, status: 'waiting' } : it));
  }
  // A waiting message, made from what was typed: its mission goes with it ('normal' / none: a plain message)
  function newItem({ agentId, chatId = null, text, reason = 'offline', mission = null }) {
    return { kind: 'new', reason, agentId, chatId: chatId || null, text: String(text || ''), ...(mission && mission !== 'normal' ? { mission: String(mission) } : {}) };
  }
  // Did a 'new' item that was going out reach its chat? Its tag (qid) on the sent message, or (a mission, which sends
  // its own way) your words in the chat since it started going out.
  function reached(it, messages) {
    if (!Array.isArray(messages)) return false;
    return messages.some((m) => (it.id && m.qid === it.id) || (it.mission && m.role === 'user' && m.text === it.text && (m.at || 0) >= (it.sentAt || 0) - 2000));
  }
  const chatKey = (it) => it.chatId || `new:${it.agentId}`;
  // The next item that may go out now: online, its time has come, its chat isn't answering, and nothing older waits
  // in the same chat (one at a time, in order).
  function nextDue(items, { online, now = Date.now(), busy = () => false } = {}) {
    if (!online) return null;
    const seen = new Set();
    for (const it of items) {
      const k = chatKey(it);
      if (seen.has(k)) continue;
      seen.add(k);
      if (it.status !== 'waiting' || it.held) continue;
      if ((it.notBefore || 0) > now) continue;
      if (busy(it)) continue;
      return it;
    }
    return null;
  }
  // ms until the next item's time comes (null: none is waiting for a time)
  function wakeIn(items, now = Date.now()) {
    const t = items.filter((it) => it.status === 'waiting' && !it.held && it.notBefore > now).map((it) => it.notBefore - now);
    return t.length ? Math.min(...t) : null;
  }

  return { classify, parseReset, retryAfter, clock, backoff, MAX_TRIES, probeWait, resendWait, line, stitch, continuePrompt, isContinue, reconcile, nextDue, wakeIn, chatKey, newItem, reached, reasonOf, offsetOf, zoned };
})();
if (typeof module !== 'undefined') module.exports = OfflineCore;
