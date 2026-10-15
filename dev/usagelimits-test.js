// ⏳ Usage left (round 48, usagelimits-core.js): reading the engines' own words (rate_limit_event, a refused message,
// Claude Code's local /usage, Codex's account limits), keeping the newest per window, freshness words, the forecast
// math (local tokens, samples, average; hit / ok / early / reached / reset), the calm notes once per window cycle.
//   node dev/usagelimits-test.js
const C = require('../usagelimits-core.js');
const M = require('../usagelimitsmain.js')._test;

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const MIN = 60e3; const HOUR = 36e5; const DAY = 864e5;
const NOW = new Date(2026, 9, 15, 14, 0).getTime(); // Thu 15 Oct 2026, 2 pm local

// ---------- reading ----------
{
  const s = Math.floor(NOW / 1000);
  const r = C.fromEvent({ status: 'allowed', rateLimitType: 'five_hour', resetsAt: s + 7800, utilization: 0.42 }, NOW);
  ok('event: one window, utilization 0–1 → percent', r.length === 1 && r[0].key === 'five_hour' && Math.abs(r[0].used - 42) < 1e-9 && r[0].resetsAt === (s + 7800) * 1000 && r[0].at === NOW, r);
  const u = C.fromEvent({ status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.81, resetsAt: s + 2 * 86400,
    unifiedWindows: { five_hour: { utilization: 0.1, resetsAt: s + 3600 }, seven_day: { utilization: 0.8, resetsAt: s + 2 * 86400 }, seven_day_overage_included: { utilization: 0.2, resetsAt: s + 9 } } }, NOW);
  ok('event: unifiedWindows give every window (an overage bucket left out)', u.length === 2 && u.find((x) => x.key === 'five_hour').used === 10 && u.find((x) => x.key === 'seven_day').used === 81, u);
  const rej = C.fromEvent({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: s + 600 }, NOW);
  ok('event: rejected without utilization = 100 %', rej[0].used === 100 && rej[0].status === 'rejected', rej);
  const bare = C.fromEvent({ status: 'allowed', rateLimitType: 'five_hour', resetsAt: s + 600 }, NOW);
  ok('event: allowed without utilization keeps "unknown", not 0', bare.length === 1 && bare[0].used === null, bare);
  ok('event: nothing usable → nothing', C.fromEvent(null).length === 0 && C.fromEvent({ status: 'allowed' }).length === 0 && C.fromEvent({ rateLimitType: 'overage', utilization: 0.5 }).length === 0);
  ok('event: past 1 (running past the cap) stays above 100', C.fromEvent({ rateLimitType: 'five_hour', utilization: 1.05, resetsAt: s + 60 }, NOW)[0].used > 100);
}
{
  const e1 = C.fromError('5-hour limit reached ∙ resets 6pm', NOW);
  ok('error: "5-hour limit reached ∙ resets 6pm" → the session at 100 %, reset 6 pm', e1.length === 1 && e1[0].key === 'five_hour' && e1[0].used === 100 && new Date(e1[0].resetsAt).getHours() === 18, e1);
  const e2 = C.fromError(`Claude AI usage limit reached|${Math.floor((NOW + 2 * HOUR) / 1000)}`, NOW);
  ok('error: the epoch form → an unnamed limit with its reset', e2[0].key === 'limit' && e2[0].resetsAt === Math.floor((NOW + 2 * HOUR) / 1000) * 1000, e2);
  ok('error: weekly words → the week', C.fromError('Weekly limit reached · resets Mon 9am', NOW)[0]?.key === 'seven_day');
  ok('error: a busy 529 / network error is not a limit', C.fromError('API Error: 529 overloaded', NOW).length === 0 && C.fromError('getaddrinfo ENOTFOUND', NOW).length === 0);
}
{
  const t = 'Total cost: $0.00\nCurrent session: 42% used · resets 6pm\nCurrent week (all models): 31% used · resets Oct 18, 9am\nCurrent week (Sonnet only): 5% used\nCurrent week (Fable): 2% used';
  const r = C.fromUsageText(t, NOW);
  ok('/usage text: session, week, Sonnet (an unknown model left out)', r.map((x) => x.key).join() === 'five_hour,seven_day,seven_day_sonnet' && r[0].used === 42 && r[1].used === 31, r);
  ok('/usage text: reset times read (6 pm today, Oct 18 9 am)', new Date(r[0].resetsAt).getHours() === 18 && new Date(r[1].resetsAt).getDate() === 18 && r[2].resetsAt === null, r.map((x) => x.resetsAt));
  ok('/usage text: only the cost lines (an API key) → nothing', C.fromUsageText('Total cost: $0.0000\nUsage: 0 input', NOW).length === 0);
}
{
  const r = C.fromCodex({ available: true, checkedAt: NOW, buckets: [{ id: 'codex', name: 'Codex', windows: [{ key: 'primary', used: 23, remaining: 77, minutes: 300, resetsAt: NOW + HOUR }, { key: 'secondary', used: 60, minutes: 10080, resetsAt: NOW + 3 * DAY }] }] });
  ok('Codex account limits → session + week', r.length === 2 && r[0].key === 'five_hour' && r[1].key === 'seven_day' && r[1].used === 60 && r[0].at === NOW, r);
  ok('Codex unavailable → nothing', C.fromCodex({ available: false }).length === 0);
}

// ---------- the store ----------
{
  let s = C.clean(null);
  s = C.merge(s, 'claude', [{ key: 'seven_day', used: 30, resetsAt: NOW + 3 * DAY, at: NOW - HOUR, source: 'event' }]).state;
  s = C.merge(s, 'claude', [{ key: 'seven_day', used: 20, resetsAt: NOW + 3 * DAY, at: NOW - 2 * HOUR, source: 'usage' }]).state;
  ok('merge: an older report never replaces a newer one', s.engines.claude.windows.seven_day.used === 30);
  s = C.merge(s, 'claude', [{ key: 'seven_day', used: null, resetsAt: NOW + 3 * DAY, at: NOW, source: 'event' }]).state;
  ok('merge: "allowed" with no number keeps the last number of the same cycle (fresher time)', s.engines.claude.windows.seven_day.used === 30 && s.engines.claude.windows.seven_day.at === NOW);
  s = C.merge(s, 'claude', [{ key: 'seven_day', used: 34, resetsAt: NOW + 3 * DAY, at: NOW + 10 * MIN, source: 'event' }]).state;
  ok('merge: samples of the cycle kept', s.engines.claude.samples.seven_day.length === 2, s.engines.claude.samples);
  s = C.merge(s, 'claude', [{ key: 'seven_day', used: 1, resetsAt: NOW + 10 * DAY, at: NOW + 20 * MIN, source: 'event' }]).state;
  ok('merge: a new cycle starts its samples afresh', s.engines.claude.samples.seven_day.length === 1 && s.engines.claude.samples.seven_day[0][1] === 1, s.engines.claude.samples);
  const big = C.clean({ engines: { claude: { windows: { x: { at: 'bad' } }, samples: { five_hour: Array.from({ length: 90 }, (_, i) => [i, i]) } } }, noted: { old: 1, fresh: Date.now() } });
  ok('clean: bad windows dropped, samples capped, old notes forgotten', !big.engines.claude.windows.x && big.engines.claude.samples.five_hour.length === 40 && !big.noted.old && big.noted.fresh);
}

// ---------- freshness ----------
ok('ago: just now · 3 min · 2 h · yesterday · 3 days', [C.ago(20e3), C.ago(3 * MIN), C.ago(2 * HOUR), C.ago(DAY + HOUR), C.ago(3 * DAY)].join('|') === 'just now|3 min ago|2 h ago|yesterday|3 days ago');
ok('countdown: 45 min · 2 h 10 min · 3 h · 1 d 4 h', [C.countdown(45 * MIN), C.countdown(130 * MIN), C.countdown(3 * HOUR), C.countdown(28 * HOUR)].join('|') === '45 min|2 h 10 min|3 h|1 d 4 h');
{
  const v = C.view({ key: 'five_hour', used: 58.4, resetsAt: NOW + 130 * MIN, at: NOW - 3 * MIN, source: 'event' }, NOW);
  ok('view: used / left / reset countdown / as of', v.used === 58 && v.left === 42 && v.resetIn === 130 * MIN && v.ago === '3 min ago' && v.level === 'ok', v);
  ok('view: 80 % is "near", 95 % "high", past 100 shows 100 used / 0 left', C.view({ used: 85, at: NOW }, NOW).level === 'near' && C.view({ used: 96, at: NOW }, NOW).level === 'high' && C.view({ used: 104, at: NOW }, NOW).left === 0 && C.view({ used: 104, at: NOW }, NOW).used === 100);
  const r = C.view({ key: 'five_hour', used: 90, resetsAt: NOW - MIN, at: NOW - HOUR }, NOW);
  ok('view: past its reset → "reset", no stale number shown', r.reset && r.used === null && r.left === null, r);
  ok('view: unknown used stays unknown', C.view({ key: 'five_hour', used: null, resetsAt: NOW + HOUR, at: NOW }, NOW).left === null);
  const st = C.clean({ engines: { claude: { windows: { seven_day: { used: 3, at: NOW, resetsAt: NOW + DAY }, five_hour: { used: 1, at: NOW, resetsAt: NOW + HOUR }, limit: { used: 100, at: NOW - 7 * HOUR, resetsAt: null } } } } });
  ok('views: session first, then the week; an old unnamed refusal fades', C.views(st, 'claude', NOW).map((v) => v.key).join() === 'five_hour,seven_day');
}

// ---------- the forecast ----------
{
  // the week started 3 days ago, 60 % used: the average pace runs out in 2 more days, before the reset in 4 days
  const w = { key: 'seven_day', used: 60, resetsAt: NOW + 4 * DAY, at: NOW };
  const f = C.forecast(w, { now: NOW });
  ok('forecast (average): 60 % in 3 days → the limit in ≈ 2 days', f.state === 'hit' && f.method === 'average' && Math.abs(f.hitAt - (NOW + 2 * DAY)) < MIN, f);
  ok('… in words: "At your pace this week you\'ll reach the weekly limit around …"', /^At your pace this week you'll reach the weekly limit around .+ \(it resets .+\)\.$/.test(C.forecastWords(f, 'seven_day', NOW, w.resetsAt)), C.forecastWords(f, 'seven_day', NOW, w.resetsAt));
  const g = C.forecast({ key: 'seven_day', used: 20, resetsAt: NOW + 4 * DAY, at: NOW }, { now: NOW });
  ok('forecast (average): 20 % in 3 days → ≈ 47 % at the reset, fine', g.state === 'ok' && g.atReset === 47, g);
  ok('… in words: "you\'re fine"', /about 47% of this week when it resets.*you're fine/.test(C.forecastWords(g, 'seven_day', NOW, NOW + 4 * DAY)));
  // local tokens: 300k counted since the start for 30 % → 10k per percent; the last 48 h ran 200k / 38 h
  const local = { inWindow: 300000, recentTokens: 200000, recentMs: 38 * HOUR };
  const t = C.forecast({ key: 'seven_day', used: 30, resetsAt: NOW + 4 * DAY, at: NOW }, { now: NOW, local });
  const pace = (30 / 300000) * (200000 / (38 * HOUR));
  ok('forecast (local tokens): the recent pace × percent per token → ≈ 81 % at the reset', t.method === 'tokens' && t.state === 'ok' && t.atReset === Math.round(30 + pace * 4 * DAY), { t, expect: 30 + pace * 4 * DAY });
  const t2 = C.forecast({ key: 'seven_day', used: 30, resetsAt: NOW + 4 * DAY, at: NOW }, { now: NOW, local: { ...local, recentTokens: 400000 } });
  ok('forecast (local tokens): twice the recent pace → the limit before the reset', t2.state === 'hit' && Math.abs(t2.hitAt - (NOW + 70 / (pace * 2))) < MIN, t2);
  const sm = C.forecast({ key: 'five_hour', used: 50, resetsAt: NOW + 3 * HOUR, at: NOW }, { now: NOW, samples: [[NOW - HOUR, 20], [NOW - 30 * MIN, 35], [NOW, 50]] });
  ok('forecast (samples): +30 % in the last hour → the session limit in ≈ 1 h 40 min', sm.method === 'samples' && sm.state === 'hit' && Math.abs(sm.hitAt - (NOW + 100 * MIN)) < MIN, sm);
  ok('… in words: "At this pace the session limit comes around …, … before it resets"', /^At this pace the session limit comes around .+, 1 h 20 min before it resets\.$/.test(C.forecastWords(sm, 'five_hour', NOW, NOW + 3 * HOUR)), C.forecastWords(sm, 'five_hour', NOW, NOW + 3 * HOUR));
  ok('forecast: too early in the window → "early"', C.forecast({ key: 'seven_day', used: 2, resetsAt: NOW + 7 * DAY - HOUR, at: NOW }, { now: NOW }).state === 'early');
  // a mostly-used window never says "too early": the number itself, next to its bar
  const hi = C.forecast({ key: 'seven_day', used: 84, resetsAt: new Date(2026, 9, 31, 9).getTime(), at: NOW, source: 'usage' }, { now: NOW });
  const hiW = C.forecastWords(hi, 'seven_day', NOW);
  ok('forecast: 84 % used, no pace to go on (the reset further than a week) → the number, not "too early"', hi.state === 'used' && hi.high && /^84% of this week's limit is used; 16% left until .+ — go lighter \(tips below\)\.$/.test(hiW) && !/early/i.test(hiW), hiW);
  const early85 = C.forecastWords(C.forecast({ key: 'five_hour', used: 85, resetsAt: NOW + 5 * HOUR - 5 * MIN, at: NOW }, { now: NOW }), 'five_hour', NOW);
  ok('forecast: 85 % in the first minutes of a session → the number with its countdown', /^85% of this session's limit is used; 15% left until it resets in 4 h 55 min — go lighter/.test(early85), early85);
  const mid = C.forecastWords(C.forecast({ key: 'seven_day', used: 60, resetsAt: NOW + 7 * DAY - HOUR, at: NOW }, { now: NOW }), 'seven_day', NOW);
  ok('forecast: 60 % early → the number without "go lighter"', /^60% of this week's limit is used; 40% left until /.test(mid) && !/lighter|early/.test(mid), mid);
  const low = C.forecastWords(C.forecast({ key: 'seven_day', used: 4, resetsAt: NOW + 7 * DAY - HOUR, at: NOW }, { now: NOW }), 'seven_day', NOW);
  ok('forecast: a small number early → "Only 4% used so far: too early…"', low === 'Only 4% used so far: too early in the week to tell your pace.', low);
  const noReset = C.forecastWords(C.forecast({ key: 'five_hour', used: 90, at: NOW }, { now: NOW }), 'five_hour', NOW);
  ok('forecast: 90 % with no reset time → the number, no date invented', noReset === "90% of this session's limit is used; 10% left — go lighter (tips below).", noReset);
  ok('headline: a mostly-used window ranks with what runs out first', C.headline([{ key: 'five_hour', f: { state: 'ok' }, words: 's' }, { key: 'seven_day', f: hi, words: hiW }]).key === 'seven_day');
  ok('forecast: reached → its reset', C.forecast({ key: 'five_hour', used: 100, resetsAt: NOW + HOUR, at: NOW }, { now: NOW }).state === 'reached');
  ok('forecast: past the reset → "reset"', C.forecast({ key: 'five_hour', used: 70, resetsAt: NOW - 1, at: NOW - HOUR }, { now: NOW }).state === 'reset');
  ok('forecast: unknown number or reset → "unknown" (nothing invented)', C.forecast({ key: 'five_hour', used: null, resetsAt: NOW + HOUR, at: NOW }).state === 'unknown' && C.forecast({ key: 'five_hour', used: 40, at: NOW }).state === 'unknown');
  const hd = C.headline([{ key: 'seven_day', f: { state: 'ok' }, words: 'w' }, { key: 'five_hour', f: { state: 'hit', hitAt: 5 }, words: 's' }]);
  ok('headline: what runs out first beats the week\'s outlook', hd.key === 'five_hour');
}

// ---------- tokens on this computer ----------
{
  const day = (o) => C.dayKey(NOW - o * DAY);
  const stats = { days: { [day(0)]: { a: { claude: { i: 9000, o: 1000 }, astra: { i: 5, o: 5 } } }, [day(1)]: { a: { claude: { i: 20000, o: 0 } } }, [day(3)]: { a: { claude: { i: 30000, o: 0 } } } } };
  const l = C.localTokens(stats, ['claude'], { now: NOW, start: NOW - 3 * DAY });
  ok('local tokens: today, 7 days, the sparkline, since the window started, the recent 48 h', l.today === 10000 && l.week === 60000 && l.spark.length === 7 && l.spark[6] === 10000 && l.inWindow === 60000 && l.recentTokens === 30000, l);
  ok('a saving as a share of the weekly limit (only from a fair local sample)', C.shareOfWeek(200000, { used: 30 }, { inWindow: 600000 }) === 10 && C.shareOfWeek(100, { used: 30 }, { inWindow: 600000 }) === null && C.shareOfWeek(5, { used: null }, {}) === null && C.shareOfWeek(231000, { used: 83 }, { inWindow: 718 }) === null);
}

// ---------- the calm notes ----------
{
  let s = C.clean({ engines: { claude: { windows: { seven_day: { used: 82, resetsAt: NOW + 2 * DAY, at: NOW - MIN }, five_hour: { used: 40, resetsAt: NOW + HOUR, at: NOW } } } } });
  let d = C.heads(s, NOW);
  ok('heads: 82 % of the week → one note with what\'s left and when it resets', d.length === 1 && d[0].level === 80 && /^Claude has 18% of its weekly limit left\. It resets .+\.$/.test(d[0].text), d);
  s.noted[d[0].id] = NOW;
  ok('heads: once per window cycle', C.heads(s, NOW).length === 0);
  s.engines.claude.windows.seven_day.used = 96;
  d = C.heads(s, NOW);
  ok('heads: 95 % is its own note (and marks 80 % too)', d.length === 1 && d[0].level === 95 && d[0].also.length === 1, d);
  s.noted[d[0].id] = NOW;
  d = C.heads(s, NOW + 2 * DAY + MIN);
  ok('heads: once it resets, a calm "full again" note', d.length === 1 && d[0].level === 'reset' && /weekly limit has reset/.test(d[0].text), d);
  ok('heads: a window never noted says nothing on reset', C.heads(C.clean({ engines: { claude: { windows: { five_hour: { used: 50, resetsAt: NOW - MIN, at: NOW - HOUR } } } } }), NOW).length === 0);
  ok('heads: a number older than 12 h is not news', C.heads(C.clean({ engines: { codex: { windows: { five_hour: { used: 90, resetsAt: NOW + 5 * DAY, at: NOW - 13 * HOUR } } } } }), NOW).length === 0);
  const r = C.heads(C.clean({ engines: { codex: { windows: { five_hour: { used: 100, resetsAt: NOW + 70 * MIN, at: NOW } } } } }), NOW);
  ok('heads: reached → "Astra reached its session limit. It resets in 1 h 10 min."', r[0]?.text === 'Astra reached its session limit. It resets in 1 h 10 min.', r);
}

// ---------- the main side's version gate ----------
ok('main: version gate (2.1.301 and newer)', M.atLeast(M.semver('2.1.301 (Claude Code)'), M.MIN_VERSION) && M.atLeast(M.semver('2.2.0'), M.MIN_VERSION) && !M.atLeast(M.semver('2.1.300 (Claude Code) fake'), M.MIN_VERSION) && !M.atLeast(M.semver('1.9.999'), M.MIN_VERSION));

console.log(`\n${n - fails}/${n} passed`);
if (fails) process.exit(1);
