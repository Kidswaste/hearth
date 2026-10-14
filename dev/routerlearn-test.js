// Smart learns from you (round 39, routerlearn.js): the learning rules, how router.js applies them, and a simulation of
// scripted owners over six weeks (tokens, cost and bad answers, before → after; docs/upgrades/routerlearn.md).
//   node dev/routerlearn-test.js            (rules + simulation)
//   node dev/routerlearn-test.js --sim-only (just the numbers)
global.Router = require('../router.js');
const R = global.Router;
const L = require('../routerlearn.js');

const simOnly = process.argv.includes('--sim-only');
let fails = 0; let n = 0;
const ok = (name, cond, info) => { if (simOnly) return; n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const DAY = 864e5;
const T0 = Date.UTC(2026, 9, 1);
const claude = (text, more = {}) => R.decide({ engine: 'claude', text, baseModel: 'claude-opus-5-5', ...more });

if (!simOnly) {
// ---------- router.js: kinds ----------
ok('kinds: chit-chat / question / small / make', claude('thanks!').kind === 'chat' && claude('what does bloom do in three.js?').kind === 'question' && claude('rename the chat to Orb').kind === 'small' && claude('make me a short poem about embers').kind === 'make');
ok('kinds: code / Lab build / analysis / picture', claude('fix this:\n```js\nconst a = b.map(x => x*2)\n```').kind === 'code' && claude('add a tunnel of glowing rings', { director: true }).kind === 'lab'
  && claude('compare these two approaches for the particle system and tell me the trade-offs').kind === 'analysis' && claude('look at this frame and tell me what you would change about the lighting', { images: 1 }).kind === 'picture');
ok('explicit asks and go-aheads are their own kinds (never learned)', claude('think carefully: is it the kick?').kind === 'asked' && claude('quick: make the title bigger').kind === 'asked'
  && claude('yes do it', { history: [{ role: 'user', text: 'plan' }, { role: 'assistant', text: 'p', route: { tier: 'hard' } }] }).kind === 'follow');

// ---------- the rules ----------
{
  const st = {};
  let c = null;
  for (let i = 0; i < 3 && !c; i++) c = L.record(st, 'code', 'stronger', T0 + i * 60e3);
  ok('3 "asked again stronger" on code fixes → one rung up', c && c.kind === 'code' && c.from === 0 && c.to === 1 && c.why === 'up' && /you asked again with a stronger model or more thinking \(3 times\)/.test(c.what), c);
  ok('…shifts say so', JSON.stringify(L.shiftsOf(st)) === '{"code":1}');
  const d = claude('fix this:\n```js\nconst a = b.map(x => x*2)\n```', { learned: L.shiftsOf(st) });
  ok('router.js: a learned code fix gets the top rung (own model, xhigh)', d.rung === 'max' && d.tier === 'hard' && d.effort === 'xhigh' && d.model === null && d.label === 'Opus · xhigh' && d.learned === 1 && /learned it from you/.test(d.why), d);
  ok('…other kinds untouched', claude('thanks!', { learned: L.shiftsOf(st) }).label === 'Haiku · low');
  ok('…the evidence starts over at the new rung', st.code.log.length === 0 && st.code.fail[0] === T0 + 2 * 60e3);
  ok('never past one rung up', (() => { for (let i = 0; i < 12; i++) L.record(st, 'code', 'stronger', T0 + DAY + i); return st.code.d === 1; })());
  ok('the words', L.line(L.describe(st)) === 'code fixes → Deepest', L.describe(st));
}
{
  const st = {};
  const seq = ['stronger', 'accepted', 'accepted', 'accepted', 'complaint', 'accepted', 'accepted', 'accepted', 'accepted', 'accepted'];
  seq.forEach((s, i) => L.record(st, 'question', s, T0 + i));
  ok('hysteresis: one retry and one complaint among 10 replies → stays put', !st.question.d);
  L.record(st, 'question', 'stopped', T0 + 20); L.record(st, 'question', 'edited', T0 + 21);
  ok('…stopped + edited (half each): still put', !st.question.d);
  let c = null;
  for (let i = 0; i < 5 && !c; i++) c = L.record(st, 'question', 'stopped', T0 + 30 + i);
  ok('weak signals add up: a few more early stops → up', st.question.d === 1 && c?.why === 'up', st.question);
  const st2 = {};
  for (let i = 0; i < 400; i++) L.record(st2, 'question', i % 12 === 5 ? 'complaint' : 'accepted', T0 + i * 3600e3);
  ok('one complaint every 12 replies (≈ 8 %, a rung that fits): never steps up', !st2.question.d, st2.question);
  const st3 = {};
  c = null;
  for (let i = 0; i < 60 && !c; i++) c = L.record(st3, 'question', i % 4 === 1 ? 'complaint' : 'accepted', T0 + i * 3600e3);
  ok('one every 4 replies (25 %, too weak): steps up within ~ 30 replies', c?.why === 'up' && st3.question.log.length === 0, c);
}
{
  const st = {};
  for (let i = 0; i < 3; i++) L.record(st, 'question', 'stronger', T0 + i);
  ok('quick questions step up to Normal', L.describe(st)[0].rung === 'Normal');
  const d = claude('what does bloom do in three.js?', { learned: L.shiftsOf(st) });
  ok('router.js: a learned quick question keeps the own model at medium', d.rung === 'normal' && d.model === null && d.effort === 'medium', d);
  let c = null;
  for (let i = 0; i < 60; i++) c = L.record(st, 'question', 'accepted', T0 + DAY + i * 0.1 * DAY) || c;
  ok('60 clean replies within two weeks of the step up: still up (prefers staying put)', st.question.d === 1 && !c);
  for (let i = 0; i < L.RULES.relaxClean - 1; i++) c = L.record(st, 'question', 'accepted', T0 + 15 * DAY + i) || c;
  ok('…the clean run starts over? no: it counts on, but waits out the two weeks', st.question.d === 0 && c?.why === 'relax', c);
}
{
  const st = {};
  const P = L.RULES.probeClean;
  for (let i = 0; i < P - 1; i++) L.record(st, 'make', 'accepted', T0 + i * 0.2 * DAY);
  ok(`${P - 1} clean replies: no probe yet`, !st.make.d);
  let c = L.record(st, 'make', 'accepted', T0 + P * 0.2 * DAY);
  ok(`${P} clean over 7+ days: one rung below, to try (probe)`, st.make.d === -1 && c?.why === 'probe' && st.make.trial, c);
  ok('router.js: a lighter everyday make', claude('make me a short poem about embers', { learned: L.shiftsOf(st) }).label === 'Sonnet · low');
  L.record(st, 'make', 'accepted', T0 + 12 * DAY); c = L.record(st, 'make', 'complaint', T0 + 12 * DAY + 1);
  ok('…on trial: one complaint is not enough', st.make.d === -1 && !c);
  c = L.record(st, 'make', 'stronger', T0 + 12 * DAY + 2);
  ok('…a complaint and a retry in its first replies: back up at once, and that rung is locked', st.make.d === 0 && c?.why === 'back' && st.make.fail[-1], c);
  for (let i = 0; i < 80; i++) L.record(st, 'make', 'accepted', T0 + 13 * DAY + i * 0.3 * DAY);
  ok('…no second probe within 45 days', st.make.d === 0);
  for (let i = 0; i < P; i++) L.record(st, 'make', 'accepted', T0 + 60 * DAY + i * 0.2 * DAY);
  ok('…after 45 days it may try again', st.make.d === -1);
  for (let i = 0; i < L.RULES.trial + 1; i++) L.record(st, 'make', 'accepted', T0 + 75 * DAY + i);
  ok('…and a trial that went well ends (normal rules again)', st.make.d === -1 && !st.make.trial);
}
{
  const st = {};
  ok('the lighter-model choice counts: twice → one rung down', (() => { L.record(st, 'small', 'weaker', T0); L.record(st, 'small', 'accepted', T0 + 1); L.record(st, 'small', 'weaker', T0 + 2); return st.small.d === -1; })(), st.small);
  ok('router.js: a small ask goes to the lightest model', claude('rename the chat to Orb', { learned: L.shiftsOf(st) }).label === 'Haiku · low');
}
{
  const st = {};
  for (let i = 0; i < 4; i++) L.record(st, 'chat', 'weaker', T0 + i);
  ok('bounds: chit-chat never goes below the lightest', !st.chat.d);
  for (let i = 0; i < 4; i++) L.record(st, 'picture', 'weaker', T0 + i);
  ok('bounds: pictures never go to the lightest model', !st.picture.d);
  for (let i = 0; i < 4; i++) L.record(st, 'lab', 'weaker', T0 + i);
  ok('bounds: a Lab build may go one rung down, not two', st.lab.d === -1 && !L.allowed('lab', -2));
  ok('router.js: Lab floors still apply on a learned step', claude('thanks', { director: true, learned: { chat: -1 } }).tier === 'quick');
  ok('unknown kinds / signals are ignored', L.record(st, 'asked', 'stronger', T0) === null && L.record(st, 'code', 'shrug', T0) === null);
}
// ---------- the cache: router.js still never steps down a big chat; a learned step up says it re-reads ----------
{
  const big = [{ role: 'user', text: 'x' }, { role: 'assistant', text: 'y', route: { tier: 'hard' }, usage: { input: 60000 } }];
  const d = claude('fix this:\n```js\nconst a = b.map(x => x*2)\n```', { history: big, learned: { code: 1 } });
  ok('a learned step up in a big chat is flagged for the cache line', d.rung === 'max' && d.reread === 60000, d);
  const d2 = claude('fix this:\n```js\nconst a = b.map(x => x*2)\n```', { history: [{ role: 'user', text: 'x' }, { role: 'assistant', text: 'y', route: { tier: 'hard', rung: 'max' }, usage: { input: 60000 } }], learned: { code: 1 } });
  ok('…once: already on that rung, no line', d2.reread === 0, d2);
  const small = [{ role: 'user', text: 'x' }, { role: 'assistant', text: 'y', route: { tier: 'hard' }, usage: { input: 5000 } }];
  ok('…a small chat: no line', claude('fix this:\n```js\nconst a = b.map(x => x*2)\n```', { history: small, learned: { code: 1 } }).reread === 0);
  const d3 = claude('what is a LUT?', { history: [{ role: 'user', text: 'x' }, { role: 'assistant', text: 'y', route: { tier: 'normal' }, usage: { input: 60000 } }], learned: { question: -1 } });
  ok('a learned step down never breaks a big chat\'s cache', d3.kept && d3.tier === 'normal', d3);
  ok('a go-ahead after a top-rung reply stays on top', claude('yes do it', { history: [{ role: 'user', text: 'x' }, { role: 'assistant', text: 'y', route: { tier: 'hard', rung: 'max' }, usage: { input: 3000 } }] }).effort === 'xhigh');
  ok('"think harder" (forced) ignores what was learned', claude('x', { force: 'high', learned: { small: -1 } }).effort === 'high');
}
// ---------- byte-stable: nothing learned reaches a prompt ----------
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'engines.js'), 'utf8');
  ok('engines.js never reads what Smart learned (the prompt stays byte-stable)', !/RouterLearn|router-learn/.test(src));
}

}

// ---------- the simulation: scripted owners over six weeks ----------
// $ per 1M tokens (input, output) and a thinking multiplier per effort: the same assumptions as dev/router-test.js.
const PRICE = { haiku: [0.1, 0.5], sonnet: [2, 10], opus: [4, 20] };
const THINK = { low: 0.5, medium: 1, high: 1.7, xhigh: 2.4 };
const MSG = { // the kind's message, its context, the answer's size at medium
  chat: ['thanks!', 6000, 120], question: ['what does bloom do in three.js?', 6000, 500], small: ['rename the chat to Orb', 6000, 150],
  make: ['make me a short poem about embers', 9000, 900], code: ['fix this:\n```js\nconst a = b.map(x => x*2)\n```', 12000, 1500],
  lab: ['add a tunnel of glowing rings', 14000, 1600], analysis: ['compare these two approaches for the particle system and tell me the trade-offs', 12000, 1800],
};
// how often an answer falls short for this owner, per kind and rung (chat, quick, normal, hard, max)
const OWNERS = {
  'Lab-heavy, picky on code and questions': {
    mix: { chat: 0.14, question: 0.18, small: 0.08, make: 0.12, code: 0.14, lab: 0.26, analysis: 0.08 },
    bad: { chat: [0.02, 0.02, 0.02, 0.02, 0.02], question: [0.4, 0.24, 0.08, 0.06, 0.05], small: [0.12, 0.05, 0.04, 0.04, 0.04], make: [0.3, 0.16, 0.08, 0.07, 0.06],
      code: [0.6, 0.5, 0.4, 0.3, 0.1], lab: [0.6, 0.45, 0.32, 0.22, 0.09], analysis: [0.5, 0.3, 0.15, 0.07, 0.05] },
  },
  'Easy-going (the rules already fit)': {
    mix: { chat: 0.2, question: 0.25, small: 0.15, make: 0.2, code: 0.12, lab: 0, analysis: 0.08 },
    bad: { chat: [0.03, 0.03, 0.03, 0.03, 0.03], question: [0.25, 0.07, 0.06, 0.05, 0.05], small: [0.12, 0.05, 0.04, 0.04, 0.04], make: [0.3, 0.14, 0.07, 0.06, 0.06],
      code: [0.6, 0.4, 0.2, 0.08, 0.07], lab: [0.6, 0.4, 0.2, 0.08, 0.07], analysis: [0.5, 0.25, 0.12, 0.06, 0.05] },
  },
  'Mostly small talk and makes (the rules aim high)': {
    mix: { chat: 0.25, question: 0.2, small: 0.2, make: 0.3, code: 0.05, lab: 0, analysis: 0 },
    bad: { chat: [0.02, 0.02, 0.02, 0.02, 0.02], question: [0.2, 0.04, 0.04, 0.04, 0.04], small: [0.04, 0.03, 0.03, 0.03, 0.03], make: [0.12, 0.04, 0.04, 0.04, 0.04],
      code: [0.6, 0.4, 0.2, 0.08, 0.07], lab: [0.6, 0.4, 0.2, 0.08, 0.07], analysis: [0.5, 0.25, 0.12, 0.06, 0.05] },
  },
};
// what the owner does after a reply that fell short: ask again harder, complain ("that's wrong, try again"), stop it, or let it go
const REACT = [['stronger', 0.45], ['complaint', 0.25], ['stopped', 0.15], ['none', 0.15]];
const RUNGS = L.RUNGS;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickW = (r, pairs) => { let x = r(); for (const [k, w] of pairs) { if ((x -= w) < 0) return k; } return pairs.at(-1)[0]; };
function priceOf(d, inTok, outTok, stopped = false) {
  const m = /haiku/.test(d.model || '') ? 'haiku' : /sonnet/.test(d.model || '') ? 'sonnet' : 'opus';
  const out = outTok * (THINK[d.effort] || 1) * (stopped ? 0.4 : 1);
  return { usd: (PRICE[m][0] * inTok + PRICE[m][1] * out) / 1e6, tok: inTok + out };
}
function simulate(owner, { learn, weeks = 6, perDay = 45, seed = 1 }) {
  const r = rng(seed);
  const o = OWNERS[owner];
  const st = {};
  const weekly = Array.from({ length: weeks }, () => ({ usd: 0, tok: 0, bad: 0, msgs: 0, replies: 0 }));
  const changes = [];
  const kinds = Object.entries(o.mix).filter(([, w]) => w > 0);
  for (let day = 0; day < weeks * 7; day++) {
    const w = weekly[Math.floor(day / 7)];
    for (let i = 0; i < perDay; i++) {
      const now = T0 + day * DAY + (i / perDay) * 14 * 3600e3;
      const kind = pickW(r, kinds);
      const [text, inTok, outTok] = MSG[kind];
      const d = R.decide({ engine: 'claude', text, baseModel: 'claude-opus-5-5', director: kind === 'lab', learned: learn ? L.shiftsOf(st) : null });
      const rung = RUNGS.indexOf(d.rung);
      const bad = r() < o.bad[kind][rung];
      const react = bad ? pickW(r, REACT) : 'accepted';
      let cost = priceOf(d, inTok, outTok, react === 'stopped');
      w.usd += cost.usd; w.tok += cost.tok; w.msgs += 1; w.replies += 1;
      if (bad) w.bad += 1;
      if (react === 'stronger' || react === 'complaint') {
        // the owner's second try: harder (own model, high / xhigh) or the same rung again
        const again = react === 'stronger' ? R.decide({ engine: 'claude', text, baseModel: 'claude-opus-5-5', force: d.effort === 'high' || d.effort === 'xhigh' ? 'xhigh' : 'high' }) : d;
        const r2 = react === 'stronger' ? RUNGS.indexOf(again.effort === 'xhigh' ? 'max' : 'hard') : rung;
        cost = priceOf(again, inTok + outTok, outTok);
        w.usd += cost.usd; w.tok += cost.tok; w.replies += 1;
        if (r() < o.bad[kind][Math.max(r2, rung)]) w.bad += 1;
      }
      if (learn && react !== 'none') { const c = L.record(st, kind, react, now); if (c) changes.push({ day, ...c }); }
    }
  }
  return { weekly, changes, learned: L.line(L.describe(st)) };
}
const sum = (ws, k, from = 0) => ws.slice(from).reduce((s, w) => s + w[k], 0);
if (process.env.RL_DEBUG) for (const owner of Object.keys(OWNERS)) console.log(owner, simulate(owner, { learn: true, seed: 7919 * Number(process.env.RL_DEBUG) }).changes.map((c) => `d${c.day} ${c.kind} ${c.from}→${c.to} ${c.why}`).join(' | '));
const SEEDS = 20;
const results = {};
for (const owner of Object.keys(OWNERS)) {
  const agg = { before: { usd: 0, tok: 0, bad: 0, replies: 0, msgs: 0, lateUsd: 0, lateBad: 0, lateMsgs: 0 }, after: { usd: 0, tok: 0, bad: 0, replies: 0, msgs: 0, lateUsd: 0, lateBad: 0, lateMsgs: 0 }, changes: 0, learned: {} };
  for (let s = 1; s <= SEEDS; s++) {
    for (const [key, learn] of [['before', false], ['after', true]]) {
      const res = simulate(owner, { learn, seed: s * 7919 });
      const a = agg[key];
      a.usd += sum(res.weekly, 'usd') / SEEDS; a.tok += sum(res.weekly, 'tok') / SEEDS; a.bad += sum(res.weekly, 'bad') / SEEDS; a.replies += sum(res.weekly, 'replies') / SEEDS; a.msgs += sum(res.weekly, 'msgs') / SEEDS;
      a.lateUsd += sum(res.weekly, 'usd', 4) / SEEDS; a.lateBad += sum(res.weekly, 'bad', 4) / SEEDS; a.lateMsgs += sum(res.weekly, 'msgs', 4) / SEEDS;
      if (learn) { agg.changes += res.changes.length / SEEDS; agg.learned[res.learned || '(nothing)'] = (agg.learned[res.learned || '(nothing)'] || 0) + 1; }
    }
  }
  results[owner] = agg;
}
const pct = (a, b) => { const x = (a - b) / b; return `${x > 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`; };
const fmtK = (t) => `${(t / 1e6).toFixed(1)}M`;
console.log(`\nSimulation: 6 weeks × 45 messages a day, ${SEEDS} seeds each (averages). Bad = an answer that fell short; second tries are counted as replies.`);
for (const [owner, a] of Object.entries(results)) {
  const b = a.before; const f = a.after;
  console.log(`\n${owner}`);
  console.log(`  replies ${Math.round(b.replies)} → ${Math.round(f.replies)} · tokens ${fmtK(b.tok)} → ${fmtK(f.tok)} (${pct(f.tok, b.tok)}) · cost $${b.usd.toFixed(2)} → $${f.usd.toFixed(2)} (${pct(f.usd, b.usd)})`);
  console.log(`  bad answers ${Math.round(b.bad)} → ${Math.round(f.bad)} (${pct(f.bad, b.bad)}) · weeks 5–6: ${(100 * b.lateBad / b.lateMsgs).toFixed(1)}% → ${(100 * f.lateBad / f.lateMsgs).toFixed(1)}% of messages, $${b.lateUsd.toFixed(2)} → $${f.lateUsd.toFixed(2)}`);
  console.log(`  changes made: ${a.changes.toFixed(1)} on average · learned at the end: ${Object.entries(a.learned).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} (${v}/${SEEDS})`).join('; ')}`);
}
const picky = results['Lab-heavy, picky on code and questions'];
const easy = results['Easy-going (the rules already fit)'];
const light = results['Mostly small talk and makes (the rules aim high)'];
ok('sim: a picky owner gets clearly fewer bad answers', picky.after.bad < picky.before.bad * 0.85, [picky.before.bad, picky.after.bad]);
ok('sim: …without spending much more (retries it no longer needs pay for most of it)', picky.after.usd < picky.before.usd * 1.1, [picky.before.usd, picky.after.usd]);
ok('sim: an owner the rules already fit: few changes, about the same quality and cost', easy.changes < 8 && easy.after.bad < easy.before.bad * 1.08 && easy.after.usd < easy.before.usd * 1.05, [easy.changes, easy.before.bad, easy.after.bad, easy.before.usd, easy.after.usd]);
ok('sim: an owner the rules aim too high for spends less', light.after.usd < light.before.usd && light.after.bad < light.before.bad * 1.15, [light.before.usd, light.after.usd, light.before.bad, light.after.bad]);

if (!simOnly) { console.log(`\n${n - fails}/${n} passed`); if (fails) process.exit(1); }
