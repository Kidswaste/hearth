// 🔁 Keep going, leaner (round 51, routinelean): the plain rules in routines-core.js and a model of 10-round routines.
//   - it stops by itself when rounds stop producing real change (no file / scene change twice, the same answer twice,
//     the same error twice), saying why in plain words; what a round changed is read from its tools and aiundo
//   - it pauses before a usage limit (90 % by default, its pace per round), "paused until 6 pm (limit)", and goes on
//     after the reset when allowed
//   - between rounds it goes on lighter (historylean's fresh start) when the cache has expired, or when the chat
//     re-reads a lot and more rounds follow
//   - the one-line summary a notification shows, the Usage window's day / week sums
//   - the model (`--table`): 10 rounds per AI and kind of chat, before (resume every round) and after, tokens re-read per
//     round and their full-price weight; and rounds until a sensible stop. Budgets on both.
//   node dev/routinelean-test.js [--table]
const C = require('../routines-core.js');
const HL = require('../historylean-core.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else if (!TABLE) console.log(`✓ ${name}`); };
const TABLE = process.argv.includes('--table');
const T0 = new Date(2026, 9, 14, 12, 0, 0).getTime();
const MIN = 60000; const HOUR = 60 * MIN;
const mk = (o = {}) => C.normalize({ agentId: 'claude', chatId: 'c1', createdAt: T0, lastEnd: T0 - 10000, how: { kind: 'rounds', rounds: 10 }, ...o }, T0);
const step = (r, ctx = {}) => C.nextStep(r, { now: T0, idleMs: 0, quietMs: 0, ...ctx });
const done = (r, text, change, extra = {}) => { C.sent(r, T0); return C.roundEnded(r, { type: 'done', text, tokens: 1000, change, ...extra }, T0); };
const words = (k) => Array.from({ length: 40 }, (_, i) => ['glow', 'orbit', 'grain', 'palette', 'kick', 'lens', 'fog', 'trail', 'pulse', 'mesh'][(k * 7 + i * 3) % 10] + (i % 5 === 0 ? k : '')).join(' ');

// ---------- the prompt: short and byte-stable ----------
ok('the default words are short (≤ 40 tokens) and ask for a one-line summary', HL.tok(C.DEFAULT_PROMPT) <= 40 && /Changed:/.test(C.DEFAULT_PROMPT) && /next 5 improvements/.test(C.DEFAULT_PROMPT), HL.tok(C.DEFAULT_PROMPT));
const r0 = mk();
ok('every round sends the same bytes (nothing added: no date, no round number)', C.message(r0) === C.message(mk({ round: 7, tokens: 9999 })) && C.message(r0) === C.DEFAULT_PROMPT);

// ---------- what a round changed ----------
let ch = C.changeOf(['Read · app.js', 'Edit · app.js', 'Bash', 'Write · notes.md']);
ok('Claude: Edit / Write are file changes (by name, once each)', ch.changed && ch.files === 2 && ch.scene === 0, ch);
ch = C.changeOf(['Edited · a.js, b.js', 'Shell · npm test']);
ok('Astra: "Edited · a.js, b.js" is two files', ch.files === 2, ch);
ch = C.changeOf(['mcp__three__three_screenshot', 'mcp__three__three_read_code', 'mcp__three__three_eval', 'mcp__three__three_console']);
ok('Lab: looking (screenshot, read, eval, console) is no change', !ch.changed, ch);
ch = C.changeOf(['mcp__three__three_edit_code', 'three · three_add_layer']);
ok('Lab: edit_code / add_layer change the scene (Claude and Astra names)', ch.changed && ch.scene === 2 && ch.files === 0, ch);
ch = C.changeOf([], [{ area: 'file', u: { path: '/x/src/app.js' } }, { area: 'lab', target: 'Scene' }]);
ok('aiundo\'s record counts (a file by its name, a Lab change as the scene)', ch.files === 1 && ch.names[0] === 'app.js' && ch.scene === 1, ch);
ok('no tools: no change', !C.changeOf([]).changed && !C.changeOf().changed);

// ---------- similar answers ----------
ok('the same answer is alike (1)', C.similar('Changed: the glow and the orbit trails.', 'Changed: the glow and the orbit trails.') === 1);
ok('a different round is not', C.similar(words(1), words(2)) < C.SAME, C.similar(words(1), words(2)));
ok('code blocks are left out of the comparison', C.similar('Same words here today ```js\nconst a = 1;\n```', 'Same words here today ```js\nconst b = 2;\n```') === 1);

// ---------- it stops when nothing changes ----------
let r = mk();
let e = done(r, words(1), C.changeOf(['Edit · a.js']));
ok('a round that changed files goes on', e.act === 'continue' && r.files === 1 && r.changedRounds === 1 && r.changedEver);
e = done(r, words(2), C.changeOf(['Read · a.js']));
ok('one round without a change goes on', e.act === 'continue' && r.stale === 1);
e = done(r, words(3), C.changeOf(['Read · a.js']));
ok('two rounds in a row without a change: it stops, in plain words', e.act === 'stop' && r.status === 'done' && /last 2 rounds changed no file and nothing in the scene/.test(r.why), r.why);
r = mk();
done(r, words(1), C.changeOf([])); done(r, words(2), C.changeOf([])); e = done(r, words(3), C.changeOf([]));
ok('a chat that never changes files (writing, questions) isn\'t stopped by that rule', e.act === 'continue' && r.stale === 3);
r = mk();
done(r, words(1), C.changeOf(['Edit · a.js'])); done(r, words(2), C.changeOf([])); e = done(r, words(3), C.changeOf(['Edit · b.js']));
ok('a change in between starts the count again', e.act === 'continue' && r.stale === 0 && r.files === 2);
r = mk();
done(r, words(1), null); done(r, words(2), null); e = done(r, words(3), null);
ok('unknown change (no info): never stops on it', e.act === 'continue');
r = mk();
done(r, words(1), C.changeOf(['Edit · a.js']));
e = done(r, words(2), C.changeOf([]), { asked: true });
done(r, words(3), C.changeOf([]));
ok('a round waiting for a permission card pauses (it never answers it)', e.act === 'pause' && /your OK/.test(e.why));

// ---------- the same answer twice ----------
r = mk();
done(r, words(1), null);
e = done(r, 'Polished a few small details; the scene is in good shape.', null);
e = done(r, 'Polished a few small details; the scene is in good shape.', null);
ok('one repeat goes on', e.act === 'continue' && r.repeats === 1);
e = done(r, 'Polished a few small details; the scene is in good shape.', null);
ok('the same answer twice in a row after the first: it stops and says why', e.act === 'stop' && r.status === 'done' && /repeated the one before/.test(r.why), r.why);

// ---------- the same error twice ----------
r = mk();
C.sent(r, T0); C.roundEnded(r, { type: 'error', text: 'TypeError: cannot read x of undefined in app.js' }, T0);
C.sent(r, T0); e = C.roundEnded(r, { type: 'error', text: 'TypeError: cannot read x of undefined in app.js' }, T0);
ok('the same error twice: stops, "with the same error"', e.act === 'stop' && /2 times in a row with the same error/.test(r.why), r.why);

// ---------- usage limits ----------
const lim = (used, o = {}) => [{ key: 'five_hour', long: 'session limit', used, resetsAt: T0 + 2 * HOUR, ...o }];
r = mk();
ok('far from the limit: it goes', step(r, { limits: lim(60) }).act === 'send');
let d = step(r, { limits: lim(91) });
ok('past 90 %: held until a minute after the reset, in plain words', d.act === 'wait' && d.hold === T0 + 2 * HOUR + MIN && /^paused until \d\d:\d\d \(limit\)$/.test(d.why) && /91% of the session limit/.test(d.detail), d);
d = step(r, { limits: lim(91), when: () => '6 pm' });
ok('"paused until 6 pm (limit)" with the app\'s clock words', d.why === 'paused until 6 pm (limit)', d.why);
r.resetAt = d.hold; r.limitWait = true;
ok('while held: it waits, the chip says it', step(r, { limits: lim(91), now: T0 + HOUR }).act === 'wait' && /paused until .* \(limit\)/.test(C.chipText(r, T0 + HOUR)), C.chipText(r, T0 + HOUR));
ok('after the reset it goes on by itself (the old number is past its reset)', step(r, { now: T0 + 2 * HOUR + 2 * MIN, limits: lim(91) }).act === 'send');
r = mk({ waitReset: false });
d = step(r, { limits: lim(92) });
ok('not allowed to wait for resets: it pauses for ▶ and says why', d.act === 'pause' && /92% of the session limit is used \(it stops at 90%\)/.test(d.why), d);
r = mk({ margin: 80 });
ok('the margin is the owner\'s (80 %)', step(r, { limits: lim(81) }).act === 'wait');
ok('an unknown margin → 90 %', mk({ margin: 33 }).margin === 90);
r = mk();
C.limitStep(r, lim(70)); C.sent(r, T0); C.roundEnded(r, { type: 'done', text: words(1) }, T0);
C.limitStep(r, lim(78));
ok('its pace: the rise between two round sends (8 % a round)', r.pct.five_hour === 8, r.pct);
ok('…so it holds before the round that would pass 90 % (84 + 8)', step(r, { limits: lim(84), now: T0 + 10000 }).act === 'wait' && step(r, { limits: lim(81), now: T0 + 10000 }).act === 'send');
C.limitStep(r, lim(10, { resetsAt: T0 + 7 * HOUR }));
ok('a new window cycle doesn\'t count as a negative pace', r.pct.five_hour === 8);
const both = [{ key: 'five_hour', long: 'session limit', used: 95, resetsAt: T0 + HOUR }, { key: 'seven_day', long: 'weekly limit', used: 96, resetsAt: T0 + 50 * HOUR }];
ok('two windows over: it waits for the one that frees up last (the week)', step(mk(), { limits: both }).hold === T0 + 50 * HOUR + MIN);
ok('a window already reset is ignored', step(mk(), { limits: lim(99, { resetsAt: T0 - MIN }) }).act === 'send');
ok('no numbers: it goes', step(mk(), { limits: [] }).act === 'send' && step(mk(), {}).act === 'send');
r = mk({ limitWait: true, resetAt: T0 + HOUR }); C.sent(r, T0);
ok('a round going out clears the hold', !r.limitWait && !r.resetAt);

// ---------- lighter between rounds ----------
const ib = (o) => ({ engine: 'claude', ctx: 80000, lean: 9000, fixed: 2000, warm: 1, ...o });
ok('warm, long, more rounds follow: lighter', C.leanBetween(ib(), { remaining: 3 }).lean);
ok('warm, but the chat is short (40k): resume (the cache holds)', !C.leanBetween(ib({ ctx: 40000 }), { remaining: 3 }).lean);
ok('warm and the lighter history isn\'t much smaller: resume', !C.leanBetween(ib({ lean: 40000 }), { remaining: 3 }).lean);
ok('the last round: resume', !C.leanBetween(ib(), { remaining: 0 }).lean);
ok('cold cache: lighter even for a 20k chat', C.leanBetween(ib({ ctx: 20000, warm: 0 }), { remaining: 0 }).lean);
ok('off / blocked: never', !C.leanBetween(ib({ off: true })).lean && !C.leanBetween(ib({ blocked: 'no session' })).lean);

// ---------- the one-line summary ----------
ok('its "Changed: …" line', C.summaryOf('Did things.\n\n**Changed:** the glow, the trails and the fog.\n') === 'Changed: the glow, the trails and the fog.', C.summaryOf('Did things.\n\n**Changed:** the glow, the trails and the fog.\n'));
ok('else its last sentence, clipped', C.summaryOf(`Long answer. ${'x '.repeat(10)}\n\nAll five are in. The scene breathes with the kick now.`) === 'The scene breathes with the kick now.');
ok('≤ 140 characters', C.summaryOf(`Changed: ${'word '.repeat(80)}`).length <= 140);

// ---------- the Usage window's sums ----------
let s = C.statAdd(null, { n: 1 }, T0);
s = C.statAdd(s, { t: 12000, r: 1, f: 3, c: 1 }, T0);
s = C.statAdd(s, { t: 8000, r: 1, f: 0, c: 0 }, T0 + 3 * 864e5);
s = C.statAdd(s, { t: 99999, r: 9 }, T0 - 9 * 864e5);
const sum = C.statSum(s, T0 + 3 * 864e5);
ok('today and 7 days', sum.today.t === 8000 && sum.today.r === 1 && sum.week.t === 20000 && sum.week.r === 2 && sum.week.f === 3 && sum.week.n === 1, sum);
ok('in words', C.statWords(sum.week) === '≈ 20k tokens · 2 rounds · 3 files changed · 1 of 2 rounds changed something', C.statWords(sum.week));
let big = null; for (let i = 0; i < 30; i++) big = C.statAdd(big, { r: 1 }, T0 + i * 864e5);
ok('15 days kept at most', Object.keys(big.days).length === 15);

// =====================================================================================================================
// The model: 10 rounds of "do the next 5 improvements" per AI and kind of chat. Each round: the routine's words, then
// tool steps (each a model call re-reading the session), then a short answer. Rounds are chained (the next goes a few
// seconds after the reply ends, so the cache is warm on every engine). Before: every round resumes the session (as
// round 41 did when the chat wasn't on screen; Continue lighter's offer left out), except round 50's historylean fresh start
// after an expired cache, which applied to rounds too. After: routinelean's rule between
// rounds (historylean's lighter history: every word, tool results as one-line stubs). Tokens = every model call's input
// (what the meter shows); weight = the same at full price (cache reads 0.1×, Claude's cache writes 1.25×).
const ROUND = {
  code: { fixed: 2000, user: 30, answer: 450, code: 0, steps: [2600, 1400, 900, 2600, 1300, 900, 1800, 1200], pics: 0, file: 0, tools: ['Read · app.js', 'Edit · app.js', 'Bash', 'Read · ui.js', 'Edit · ui.js', 'Bash', 'Read · style.css', 'Edit · style.css'] },
  director: { fixed: 2130, user: 30, answer: 300, code: 0, steps: [380, 300, 520, 1900, 320, 380, 300, 520, 1900, 320], pics: 0, file: 0, tools: ['three_eval', 'three_edit_code', 'three_screenshot', 'three_read_code', 'three_sliders', 'three_eval', 'three_edit_code', 'three_screenshot', 'three_read_code', 'three_sliders'] },
};
function simulate({ engine = 'claude', profile = 'code', rounds = 10, lean = false, ttl = '1h', gap = 0.1, window = 160000, afterCompact = 15000 } = {}) {
  const p = ROUND[profile];
  const W = HL.WRITE[engine];
  const chat = { messages: [], session: { id: 's1' }, engine };
  let hist = 0; const per = []; const weight = []; let leans = 0;
  for (let k = 0; k < rounds; k++) {
    const ex = HL.exchange(p, k);
    let ctx = p.fixed + hist;
    const warm = k === 0 ? 0 : HL.warmth(engine, gap * MIN, HL.ttlOf(engine, { ttl }));
    let fresh0 = Math.round(ctx * (1 - warm));
    if (k > 0) {
      chat.messages.push({ ...ex.user });
      const L = HL.build(chat, { upto: chat.messages.length - 1, chatTools: engine === 'claude' }).tokens;
      chat.messages.pop();
      // before: round 50's own rule (historylean: only once the cache has expired, and only when it pays); after: routinelean's
      const b = lean ? C.leanBetween({ engine, ctx, lean: L, fixed: p.fixed, warm }, { remaining: rounds - k - 1 })
        : { lean: HL.decide({ engine, ctx, gap: gap * MIN, ttl: HL.ttlOf(engine, { ttl }), lean: L, fixed: p.fixed, steps: p.steps.length + 1, tools: true }).rebase };
      if (b.lean) { hist = L + HL.WRAP; ctx = p.fixed + hist; fresh0 = ctx; leans += 1; }
    }
    if (hist + p.fixed > window) { hist = afterCompact; ctx = p.fixed + hist; fresh0 = ctx; }
    let inTok = 0; let w = 0; let cur = ctx + ex.sent;
    const calls = [ex.sent, ...ex.results.map((x) => x + 60)];
    for (let c = 0; c < calls.length; c++) {
      if (c === 0) { inTok += cur; w += (cur - ex.sent - fresh0) * HL.READ + (fresh0 + ex.sent) * W; } else { cur += calls[c]; inTok += cur; w += (cur - calls[c]) * HL.READ + calls[c] * W; }
    }
    hist += ex.sent + ex.args + ex.results.reduce((a, b) => a + b, 0) + ex.answer;
    per.push(inTok); weight.push(Math.round(w));
    chat.messages.push({ ...ex.user }, { ...ex.reply, usage: { input: inTok, ttl } });
  }
  const tot = (a) => a.reduce((x, y) => x + y, 0);
  return { per, weight, avg: Math.round(tot(per) / rounds), avgWeight: Math.round(tot(weight) / rounds), total: tot(per), totalWeight: tot(weight), last: per.at(-1), leans };
}
// rounds until a sensible stop: the work runs out after `useful` rounds; then the rounds change nothing and their
// answers say the same thing. Before: only the "done" words, the cap or the end stop it. After: routinelean's rules.
function stopAfter({ rounds = 10, useful = 4, lean = false } = {}) {
  const r = mk({ how: { kind: 'rounds', rounds } });
  let k = 0;
  for (k = 1; k <= rounds; k++) {
    if (C.nextStep(r, { now: T0 + k * 10 * MIN, idleMs: HOUR, quietMs: HOUR }).act !== 'send') break;
    C.sent(r, T0 + k * 10 * MIN);
    const work = k <= useful;
    const text = work ? `Round ${k}: ${words(k)}\nChanged: ${words(k).slice(0, 60)}` : 'Polished a few small details; the scene is in good shape overall.';
    const out = C.roundEnded(r, { type: 'done', text, tokens: 1, change: lean ? C.changeOf(work ? ['Edit · app.js'] : ['Read · app.js']) : null }, T0 + k * 10 * MIN + 5000);
    if (!lean) { r.repeats = 0; } // before: no repeat rule
    if (out.act === 'stop') return { rounds: k, why: r.why };
  }
  return { rounds: k - 1, why: r.status === 'done' ? r.why : 'all rounds done' };
}

const CASES = [
  ['Claude (subscription, 1 h cache) · coding', { engine: 'claude', profile: 'code', ttl: '1h' }],
  ['Claude (API key, 5 min cache) · coding, idle 10 min between rounds', { engine: 'claude', profile: 'code', ttl: '5m', gap: 10 }],
  ['Astra · coding', { engine: 'codex', profile: 'code' }],
  ['Claude · Lab director chat', { engine: 'claude', profile: 'director' }],
  ['Astra · Lab director chat', { engine: 'codex', profile: 'director' }],
  ['Astra · Lab director chat, idle 10 min between rounds', { engine: 'codex', profile: 'director', gap: 10 }],
];
const rows = CASES.map(([name, o]) => ({ name, before: simulate(o), after: simulate({ ...o, lean: true }) }));
const pct = (a, b) => `${Math.round((1 - b / a) * 100)} %`;
const k = (x) => (x >= 1000 ? `${(x / 1000).toFixed(x >= 100000 ? 0 : 1)}k` : String(x));
for (const row of rows) {
  ok(`${row.name}: tokens per round −25 % or more over 10 rounds`, row.after.avg <= row.before.avg * 0.75, [row.before.avg, row.after.avg]);
  ok(`${row.name}: full-price weight per round not higher`, row.after.avgWeight <= row.before.avgWeight * 1.0, [row.before.avgWeight, row.after.avgWeight]);
  ok(`${row.name}: round 10 re-reads ≤ 60 % of before`, row.after.last <= row.before.last * 0.6, [row.before.last, row.after.last]);
}
const sBefore = stopAfter({ lean: false }); const sAfter = stopAfter({ lean: true });
ok('rounds until a sensible stop: 10 → 6 (work ran out after 4)', sBefore.rounds === 10 && sAfter.rounds === 6, [sBefore, sAfter]);
// the stop's saving in tokens: the rounds it didn't send (Claude coding, after the lighter rule too)
const full = simulate({ engine: 'claude', profile: 'code', lean: true });
const stopSaved = full.per.slice(sAfter.rounds).reduce((a, b) => a + b, 0);
ok('…which leaves 4 rounds of tokens unspent', stopSaved > 0);

if (TABLE) {
  console.log('| AI · chat | tokens per round, avg of 10 (before → after) | full-price weight per round | round 10 re-reads | lighter starts |');
  console.log('|---|---:|---:|---:|---:|');
  for (const row of rows) console.log(`| ${row.name} | ${k(row.before.avg)} → **${k(row.after.avg)}** (−${pct(row.before.avg, row.after.avg)}) | ${k(row.before.avgWeight)} → **${k(row.after.avgWeight)}** (−${pct(row.before.avgWeight, row.after.avgWeight)}) | ${k(row.before.last)} → ${k(row.after.last)} | ${row.before.leans} → ${row.after.leans} |`);
  const tb = simulate({ engine: 'claude', profile: 'code' }).total; const ta = full.per.slice(0, sAfter.rounds).reduce((a, b) => a + b, 0);
  console.log(`\nStop: work runs out after round 4 → before ${sBefore.rounds} rounds (${sBefore.why}), after ${sAfter.rounds} (${sAfter.why}). Claude coding, whole routine: ${k(tb)} → ${k(ta)} tokens (−${pct(tb, ta)}).`);
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
