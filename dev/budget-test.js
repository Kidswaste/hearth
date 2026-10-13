// Spending (round 30, budget-core.js): the weekly limit, its levels, Smart stepping down near it (never below a
// picture's / a Lab build's floor, never the owner's own picks), "this would pass your limit", the week at a glance.
//   node dev/budget-test.js
const B = require('../budget-core.js');
const R = require('../router.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };

// ---------- the week ----------
const wed = new Date(2026, 9, 14, 15).getTime(); // a Wednesday
ok('the week starts on Monday', JSON.stringify(B.weekDays(wed)) === JSON.stringify(['2026-10-12', '2026-10-13', '2026-10-14']), B.weekDays(wed));
ok('on a Monday it is just today', B.weekDays(new Date(2026, 9, 12, 9).getTime()).length === 1);
ok('on a Sunday it is 7 days', B.weekDays(new Date(2026, 9, 18, 23).getTime()).length === 7);
ok('last week is the 7 days before', (() => { const d = B.lastWeekDays(wed); return d.length === 7 && d[0] === '2026-10-05' && d[6] === '2026-10-11'; })(), B.lastWeekDays(wed));
const stats = { days: {
  '2026-10-12': { a: { claude: { i: 300000, o: 20000, r: 30, cost: 1.6 }, astra: { i: 50000, o: 5000, r: 4 } }, t: { chat: { i: 200000, o: 10000 }, three: { i: 150000, o: 15000 } } },
  '2026-10-14': { a: { claude: { i: 500000, o: 30000, r: 40, cost: 2.65 } }, t: { three: { i: 530000 } } },
  '2026-10-08': { a: { claude: { i: 900000, o: 100000, r: 90 } } },
}, chats: {
  'claude-a': { a: 'claude', i: 400000, o: 20000, r: 20, ctx: 42000, last: wed - 3600e3 },
  'claude-b': { a: 'claude', i: 90000, o: 9000, r: 12, ctx: 8000, last: wed - 7200e3 },
  'claude-old': { a: 'claude', i: 990000, o: 9000, r: 99, ctx: 8000, last: wed - 10 * 864e5 },
} };
const u = B.used(stats, 'claude', B.weekDays(wed));
ok('this week\'s use sums the meter\'s days (tokens, $, replies)', u.tokens === 850000 && Math.abs(u.cost - 4.25) < 1e-9 && u.replies === 70, u);
ok('last week is not counted', B.used(stats, 'claude', ['2026-10-08']).tokens === 1e6);
ok('plain words with a price', B.words(u) === '≈ 850k tokens (≈ $4.25)', B.words(u));
ok('plain words without a price', B.words(B.used(stats, 'astra', B.weekDays(wed))) === '≈ 55k tokens');

// ---------- levels ----------
ok('no limit: no level', B.level(9e9, 0) === null);
ok('under 80 %: calm', B.level(790, 1000) === null);
ok('80 %: near', B.level(800, 1000) === 'near');
ok('100 %: over', B.level(1000, 1000) === 'over');
ok('would pass: null when it fits', B.wouldPass(500, 400, 1000) === null);
ok('would pass: the numbers when it does not', (() => { const p = B.wouldPass(800, 400, 1000); return p && p.after === 1200 && !p.already; })());
ok('would pass: already past', B.wouldPass(1200, 10, 1000)?.already === true);
ok('limits offered around last week', (() => { const s = B.suggestions(1e6); return s.length === 4 && s.includes(1e6) && s[0] < 1e6 && s[3] > 1e6; })(), B.suggestions(1e6));
ok('limits offered with no history', B.suggestions(0).length === 4);

// ---------- stepping down ----------
ok('near: one rung', B.stepDown('hard', 'near') === 'normal' && B.stepDown('normal', 'near') === 'quick');
ok('over: two rungs', B.stepDown('hard', 'over') === 'quick' && B.stepDown('normal', 'over') === 'chat');
ok('never below the floor', B.stepDown('normal', 'over', 'quick') === 'quick' && B.stepDown('hard', 'over', 'normal') === 'normal');
ok('never up (a tier already under the floor stays)', B.stepDown('chat', 'over', 'quick') === 'chat');
ok('no level: unchanged', B.stepDown('hard', null) === 'hard');
ok('floors: picture → quick, Lab chat → quick, Lab build → normal', B.floorOf({ images: 1 }) === 'quick' && B.floorOf({ director: true }) === 'quick' && B.floorOf({ director: true, labBuild: true }) === 'normal' && B.floorOf({}) === 'chat');
const base = 'claude-opus-5-5';
const pick = (text, more = {}) => R.decide({ engine: 'claude', text, baseModel: base, ...more });
let d = pick('make me a short poem about embers'); // normal: own model, medium
let c = B.cheaper(d, { lvl: 'near', R, base });
ok('near: an everyday make goes to Sonnet · low', c && c.tier === 'quick' && c.model === 'sonnet' && c.effort === 'low' && c.label === 'Sonnet · low' && /near your weekly limit/.test(c.why), c);
c = B.cheaper(d, { lvl: 'over', R, base });
ok('over: to Haiku · low', c && c.tier === 'chat' && c.model === 'haiku' && c.label === 'Haiku · low', c);
d = pick('fix this:\n```js\nconst a = b.map(x => x*2)\n```');
c = B.cheaper(d, { lvl: 'near', R, base });
ok('near: code keeps its own model, medium effort', c && c.tier === 'normal' && c.model === null && c.effort === 'medium' && c.label === 'Opus · medium', c);
d = pick('build a glowing particle tunnel', { director: true });
c = B.cheaper(d, { lvl: 'over', R, base, floor: B.floorOf({ director: true, labBuild: d.tier === 'hard' }) });
ok('a Lab build never drops below its own model', d.tier === 'hard' && c && c.tier === 'normal' && c.model === null, { d: d.tier, c });
d = pick('look at this frame and tell me what you would change about the lighting', { images: 1 });
c = B.cheaper(d, { lvl: 'over', R, base, floor: B.floorOf({ images: 1 }) });
ok('a picture stays on the middle model at least', c && c.tier === 'quick' && c.model === 'sonnet', c);
d = pick('thanks');
ok('chit-chat is already the lightest: nothing to change', B.cheaper(d, { lvl: 'over', R, base }) === null);
d = pick('make me a short poem about embers', { pinned: { model: 'claude-opus-5-5' } });
c = B.cheaper(d, { lvl: 'over', R, pinned: { model: 'claude-opus-5-5' }, base });
ok('a model you picked stays (only the effort steps down)', c && c.model === null && c.effort === 'low' && c.label === 'Opus · low', c);
d = pick('make me a short poem about embers', { pinned: { effort: 'high' } });
c = B.cheaper(d, { lvl: 'over', R, pinned: { effort: 'high' }, base });
ok('an effort you picked stays (only the model steps down)', c && c.effort === null && c.model === 'haiku' && c.label === 'Haiku · high', c);
d = pick('anything', { force: 'high' });
ok('"think harder" is never stepped down', B.cheaper(d, { lvl: 'over', R, base }) === null);
ok('a big context kept for its cache is never stepped down', B.cheaper({ ...pick('make a poem'), kept: true }, { lvl: 'over', R, base }) === null);
ok('no level: nothing changes', B.cheaper(pick('make a poem'), { lvl: null, R, base }) === null);
d = R.decide({ engine: 'codex', text: 'make me a short poem about embers', baseModel: 'gpt-6-astra' });
c = B.cheaper(d, { lvl: 'near', R, base: 'gpt-6-astra' });
ok('Astra steps down too (Sol · low)', c && c.model === 'gpt-6-sol' && c.effort === 'low', c);

// ---------- the week at a glance ----------
const w = B.week(stats, {
  agents: [{ id: 'claude', name: 'Claude', engine: 'claude', effort: 'high' }, { id: 'astra', name: 'Astra', engine: 'codex' }],
  limits: { claude: { limit: 1e6, mode: 'cheaper' } },
  sets: { claude: [['chatTools', 1800], ['boardTools', 1000]], astra: [['chatTools', 900]] },
  optional: { boardTools: ['Board tools', { boardTools: undefined }] },
  chatTitle: (id) => ({ 'claude-a': 'Intro video', 'claude-b': 'Shader' }[id] || id), now: wed,
});
ok('each AI: use, limit, level', w.per[0].tokens === 850000 && w.per[0].pct === 85 && w.per[0].level === 'near' && w.per[0].mode === 'cheaper', w.per[0]);
ok('biggest chats: this week\'s only, biggest first', w.chats.length === 2 && w.chats[0].title === 'Intro video', w.chats);
ok('where it went, biggest first', w.where[0].key === 'three' && w.where[0].tokens === 695000, w.where);
ok('every-message tools × replies', w.tools.some((t) => t.key === 'boardTools' && t.week === 70000 && t.each === 1000), w.tools);
const fx = w.fixes.map((f) => f.kind);
ok('fixes: board tools off with its weekly saving', w.fixes.some((f) => f.kind === 'tools' && f.text === 'Turn off Board tools for Claude: saves ≈ 70k a week' && 'boardTools' in f.patch), w.fixes);
ok('fixes: a chat that re-reads a lot starts fresh', fx.includes('fresh'));
ok('fixes: an AI on Deep can go Smart', fx.includes('smart'));
ok('fixes: biggest saving first', w.fixes.every((f, i) => !i || w.fixes[i - 1].saves >= f.saves));
ok('chat tools are never offered to switch off', !w.fixes.some((f) => f.key === 'chatTools'));
ok('an empty week is calm', (() => { const e = B.week({ days: {}, chats: {} }, { agents: [{ id: 'claude', name: 'Claude' }], now: wed }); return e.per.length === 0 && e.fixes.length === 0 && e.all.tokens === 0; })());

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
