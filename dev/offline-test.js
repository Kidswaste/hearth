#!/usr/bin/env node
// Unit test for "calm when things go wrong outside Hearth" (round 34, offline): the classifier against the engines' real
// error texts (Claude Code stream-json results / stderr, Codex exec-json errors), the reset time of a usage limit in
// every wording (epoch, "resets 6pm (Europe/Paris)", "try again in 2 hours 13 minutes", "try again at Oct 13th, 2026
// 6:00 PM") shown in local time, the bounded backoff, the plain lines, stitching a cut-off reply to its continuation
// without repeats, the continue prompt's size, and the waiting queue (restart reconcile: never twice; order per chat;
// the next wake), plus the main side's proxy target.
//   node dev/offline-test.js
process.env.TZ = 'America/New_York'; // "this computer" is in New York: zone-named resets must be converted
const C = require('../offline-core.js');
const M = require('../offlinemain.js');

let fails = 0;
const check = (ok, label, extra) => { if (!ok) { fails += 1; console.log(`✖ ${label}${extra !== undefined ? ` · ${JSON.stringify(extra)}` : ''}`); } else console.log(`✓ ${label}`); };
const kind = (t) => C.classify(t)?.kind || null;

// ---------- the classifier, on real texts ----------
const CASES = [
  // no internet / flaky Wi-Fi
  ['offline', 'Error: getaddrinfo ENOTFOUND api.anthropic.com'],
  ['offline', 'API Error: Connection error.'],
  ['offline', 'API Error (Request timed out.)'],
  ['offline', 'stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)'],
  ['offline', 'request to https://api.anthropic.com/v1/messages failed, reason: connect ECONNREFUSED 127.0.0.1:443'],
  ['offline', 'TypeError: fetch failed'],
  ['offline', 'read ECONNRESET'],
  ['offline', 'getaddrinfo EAI_AGAIN chatgpt.com'],
  ['offline', 'connect ENETUNREACH 2606:4700::6810:1'],
  ['offline', 'getaddrinfo ENOTFOUND api.anthropic.com\n\nFix: Network problem (Hearth already tried again once): check the internet connection (or VPN / proxy), then press Retry.'], // the fix line's "proxy" isn't the reason
  // busy / rate limited
  ['busy', 'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'],
  ['busy', 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed the rate limit for your organization."}}'],
  ['busy', 'API Error: 500 {"type":"error","error":{"type":"api_error","message":"Internal server error"}}'],
  ['busy', "We're currently experiencing high demand, which may cause temporary errors."],
  ['busy', 'exceeded retry limit, last status: 429 Too Many Requests'],
  ['busy', 'unexpected status 503 Service Unavailable: upstream connect error'],
  ['busy', 'Fake engine error: the model is overloaded'],
  // usage limit
  ['limit', 'Claude AI usage limit reached|1760378400'],
  ['limit', '5-hour limit reached ∙ resets 6pm'],
  ['limit', "You've hit your limit · resets 6pm (Europe/Paris)"],
  ['limit', "You've hit your usage limit. Upgrade to Pro (https://openai.com/chatgpt/pricing) or try again in 2 hours 13 minutes."],
  ['limit', 'Claude usage limit reached. Your limit will reset at 6pm (Europe/Paris).'],
  ['limit', 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"usage limit reached for your plan"}}'],
  // signed out
  ['signedout', 'Invalid API key · Please run /login'],
  ['signedout', 'OAuth token has expired. Please obtain a new token or refresh your existing token.'],
  ['signedout', 'API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'],
  ['signedout', 'Not logged in. Please run codex login'],
  ['signedout', 'Your access token could not be refreshed because your refresh token has expired. Please log out and sign in again.'],
  // a VPN / proxy in the way
  ['proxy', 'API Error: Connection error. (self signed certificate in certificate chain)'],
  ['proxy', 'Error: unable to get local issuer certificate'],
  ['proxy', 'tunneling socket could not be established, statusCode=407'],
  ['proxy', 'Proxy Authentication Required (407)'],
  // not ours: the other fixes keep them
  [null, "Couldn't start Claude Code (ENOENT)."],
  [null, 'This model requires a newer version of Codex. Please upgrade to the latest version.'],
  [null, 'The conversation is too long for the model'],
  [null, 'Invalid MCP configuration:\nMCP config file not found: /tmp/x.json'],
  [null, ''],
];
for (const [want, text] of CASES) check(kind(text) === want, `${want || 'not ours'}: ${text.split('\n')[0].slice(0, 90)}`, kind(text));
check(C.classify('retry-after: 30 · API Error: 529 Overloaded').retryAfterMs === 30000, 'a retry-after the service asked for is kept');

// ---------- when the limit resets (shown in local time) ----------
const NOW = Date.UTC(2026, 9, 13, 12, 0); // 13 Oct 2026, 12:00 UTC = 08:00 in New York, 14:00 in Paris
const at = (t) => C.parseReset(t, NOW);
check(at('Claude AI usage limit reached|1760378400') === 1760378400000, 'Claude\'s "…|<seconds>" form');
check(at('reset at 2026-10-13T22:00:00Z') === Date.UTC(2026, 9, 13, 22, 0), 'an ISO moment');
check(at('…or try again in 2 hours 13 minutes.') === NOW + (2 * 60 + 13) * 60000, 'Codex\'s "try again in 2 hours 13 minutes"');
check(at('resets in 37 min') === NOW + 37 * 60000, '"resets in 37 min"');
check(at("You've hit your limit · resets 6pm (Europe/Paris)") === Date.UTC(2026, 9, 13, 16, 0), '"resets 6pm (Europe/Paris)" = 16:00 UTC (summer time)', new Date(at("You've hit your limit · resets 6pm (Europe/Paris)") || 0).toISOString());
check(at('5-hour limit reached ∙ resets 6pm') === new Date(2026, 9, 13, 18, 0).getTime(), '"resets 6pm" with no zone: this computer\'s 6 pm');
check(at('resets 7am') === new Date(2026, 9, 14, 7, 0).getTime(), 'a time already past today: tomorrow\'s');
check(at('Your limit will reset at 6:30pm (America/Los_Angeles).') === Date.UTC(2026, 9, 14, 1, 30), '"6:30pm (America/Los_Angeles)"');
check(at('Try again at Oct 20th, 2026 6:00 PM.') === new Date(2026, 9, 20, 18, 0).getTime(), '"try again at Oct 20th, 2026 6:00 PM"');
check(at('resets 6pm (Mars/Olympus)') === new Date(2026, 9, 13, 18, 0).getTime(), 'an unknown zone name: local time');
check(at('usage limit reached') === null, 'no time named: none');
check(at('resets 25:99') === null, 'nonsense: none');
const winter = C.parseReset('resets 6pm (Europe/Paris)', Date.UTC(2026, 11, 1, 9, 0));
check(winter === Date.UTC(2026, 11, 1, 17, 0), 'Paris in winter (UTC+1)', new Date(winter || 0).toISOString());
check(C.classify("You've hit your limit · resets 6pm (Europe/Paris)", { now: NOW }).resetAt === Date.UTC(2026, 9, 13, 16, 0), 'classify carries the reset time');
const local = new Date(Date.UTC(2026, 9, 13, 16, 0));
check(C.clock(local.getTime(), NOW, { locale: 'en-GB', h23: true }) === '12:00', 'shown in local time: 6 pm Paris = 12:00 in New York', C.clock(local.getTime(), NOW, { locale: 'en-GB', h23: true }));
check(C.clock(new Date(2026, 9, 14, 18, 0).getTime(), NOW, { locale: 'en-GB', h23: true }) === '18:00 tomorrow', '"18:00 tomorrow"');
check(/^Fri 18:00$/.test(C.clock(new Date(2026, 9, 16, 18, 0).getTime(), NOW, { locale: 'en-GB', h23: true })), 'within a week: the day');

// ---------- bounded retries ----------
check(C.backoff(1) === 20000 && C.backoff(2) === 40000 && C.backoff(3) === 80000 && C.backoff(9) === 80000, 'busy: 20 / 40 / 80 s, never longer');
check(C.MAX_TRIES === 3, 'three automatic retries at most');
check(C.backoff(1, 2000) === 5000 && C.backoff(1, 30000) === 30000 && C.backoff(1, 3600000) === 300000, 'a retry-after is honoured within 5 s – 5 min');
check(C.probeWait(0) === 3000 && C.probeWait(99) === 30000, 'internet checks: from 3 s, then at most every 30 s');
check(C.resendWait(0) === 0 && C.resendWait(1) === 5000 && C.resendWait(99) === 60000, 'a resend after a failure waits longer each time (no tight loop on flaky Wi-Fi)');

// ---------- the plain lines ----------
const T = (k, o) => C.line(k, { now: NOW, h23: true, ...o });
check(T('offline', { queued: true }) === 'No internet — will send when you\'re back', 'offline, waiting');
check(T('busy', { who: 'Claude', inS: 20 }) === 'Claude is busy right now — retrying in 20 s', 'busy, retrying');
check(T('busy', { who: 'Claude', gaveUp: true, other: 'Astra' }) === 'Claude is busy right now — try again in a moment, or ask Astra', 'busy, stopped retrying');
check(T('limit', { resetAt: new Date(2026, 9, 13, 18, 0).getTime(), other: 'Astra' }).replace(/ /g, ' ') === 'Usage limit reached until 18:00 — switch to Astra?', 'limit with its reset time and the other AI', T('limit', { resetAt: new Date(2026, 9, 13, 18, 0).getTime(), other: 'Astra' }));
check(T('limit', {}) === 'Usage limit reached', 'limit, no time, no other AI');
check(T('signedout') === 'Signed out —', 'signed out (the Sign in button follows)');
check(/VPN or proxy/.test(T('proxy', { who: 'Claude' })), 'proxy');
check(T('cutoff', { slept: true }) === 'Reply cut off — while the computer slept' && /will continue when you're back/.test(T('cutoff', { queued: true })), 'cut off: why, and that it continues by itself');

// ---------- stitching a cut-off reply ----------
const full = 'Here is the plan. First we sketch the orb, then we add the kick pulse, and finally the gold drop for the chorus.';
const cut = full.slice(0, full.indexOf(' ', 50));
const rest = full.slice(cut.length);
const ov = cut.slice(cut.lastIndexOf(' ', cut.length - 12) + 1);
check(C.stitch(cut, ov + rest) === full, 'the repeated last words go', C.stitch(cut, ov + rest));
check(C.stitch(cut, rest.trim()) === full, 'a clean continuation joins with one space');
check(C.stitch(cut, full) === full, 'a continuation that started over replaces the cut part');
check(C.stitch('the quick bro', 'brown fox') === 'the quick brown fox', 'a cut word written again whole');
check(C.stitch('Done.\n\n', 'Next part') === 'Done.\n\nNext part', 'a cut at a paragraph break keeps it');
check(C.stitch('```js\nconst a = 1;\n', '```js\nconst b = 2;\n```') === '```js\nconst a = 1;\nconst b = 2;\n```', 'inside a code block, the re-opened fence goes');
check(C.stitch('', 'abc') === 'abc' && C.stitch('abc', '') === 'abc', 'empty sides');
check(C.stitch('I like cats', 'cats and dogs') === 'I like cats cats and dogs', 'a short accidental overlap (under 8 characters) isn\'t taken for a repeat');
const p = C.continuePrompt(`${'x'.repeat(5000)} the end of it`);
check(p.length < 420 && p.endsWith('the end of it\n"""') && C.isContinue(p), 'the continue line is short (≈ 100 tokens at most): only the last words, not the conversation', p.length);

// ---------- the queue ----------
const q = [
  { id: 'a', agentId: 'claude', chatId: 'c1', kind: 'retry', status: 'sending' },
  { id: 'b', agentId: 'claude', chatId: 'c1', kind: 'new', status: 'waiting', text: 'second' },
  { id: 'c', agentId: 'claude', chatId: 'c2', kind: 'new', status: 'sending', text: 'went' },
  { id: 'd', agentId: 'astra', chatId: null, kind: 'new', status: 'waiting', text: 'new chat' },
  { nope: 1 },
];
const r = C.reconcile(q, (it) => it.id === 'c');
check(r.map((x) => x.id).join() === 'a,b,d', 'after a restart: what went out is gone (never twice), junk dropped', r.map((x) => x.id));
check(r[0].status === 'waiting', 'what was going out but didn\'t: waits again');
check(C.nextDue(r, { online: false }) === null, 'offline: nothing goes out');
check(C.nextDue(r, { online: true })?.id === 'a', 'online: the first of a chat goes first');
check(C.nextDue(r, { online: true, busy: (it) => it.chatId === 'c1' })?.id === 'd', 'a chat still answering waits; another chat goes');
check(C.nextDue([{ ...r[0], status: 'sending' }, r[1]], { online: true }) === null, 'one at a time per chat (in order)');
check(C.nextDue([{ ...r[0], notBefore: NOW + 20000 }, r[2]], { online: true, now: NOW })?.id === 'd', 'a retry waiting for its time doesn\'t hold other chats');
check(C.wakeIn([{ ...r[0], notBefore: NOW + 20000 }, { ...r[2], notBefore: NOW + 5000 }], NOW) === 5000 && C.wakeIn(r, NOW) === null, 'the next wake');
check(C.chatKey({ agentId: 'astra', chatId: null }) === 'new:astra', 'a message for a chat not started yet');

// ---------- the main side ----------
check(JSON.stringify(M.proxyTarget({ HTTPS_PROXY: 'http://10.0.0.2:3128' })) === '["10.0.0.2",3128]' && M.proxyTarget({}) === null, 'the internet check goes through the proxy this computer uses');
M.probe().then((r2) => {
  check(typeof r2?.online === 'boolean', 'the internet check answers (no engine, no tokens)', r2);
  console.log(fails ? `FAIL ${fails}` : 'all passed');
  process.exit(fails ? 1 : 0);
});
