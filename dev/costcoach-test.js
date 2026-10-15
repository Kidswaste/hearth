// 🧭 Cost coach (round 43, costcoach-core.js) on synthetic usage logs: the records a chat gives, attribution (by AI,
// kind of chat, cause; the meter's rest as "other"), Continue lighter replayed, the savings estimates, the top 3,
// nothing suggested when it's already applied, the weekly note's threshold, the small store.
//   node dev/costcoach-test.js
const C = require('../costcoach-core.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

const NOW = new Date(2026, 9, 15, 18).getTime(); // a Thursday
const H = 3600e3;
// a chat: n exchanges, the context growing by `grow` a message from `base`, replies `out` tokens (of which `think`)
function chat(id, agentId, { n = 10, base = 2000, grow = 3000, out = 400, think = 0, reasoning = false, text = 'make the orb pinker and slower please, with more glow', at0 = NOW - 2 * 24 * H, every = 10 * 60e3, cached = 0.9, mission = '', routine = false, attach = 0, whole = 0, handoffAt = null, route = null, answers = '' } = {}) {
  const messages = [];
  for (let k = 0; k < n; k++) {
    const at = at0 + k * every;
    const u = { role: 'user', text, at: at - 1000 };
    if (mission) u.mission = mission;
    if (routine) u.routine = { id: 'r1', n: k + 1, of: n };
    if (attach) u.attachments = [{ kind: 'text', name: 'log.txt', lean: { tokens: attach, wholeTokens: whole || attach * 10 }, ...(whole ? { whole: true } : {}) }];
    messages.push(u);
    const i = base + grow * k;
    const usage = { input: i, output: out, cached: k ? Math.round((i - grow) * cached) : 0, cacheWrite: k ? grow : i };
    if (reasoning) usage.reasoning = think;
    const m = { role: 'assistant', text: 'ok', at, usage };
    if (think && !reasoning) m.thinking = 'x'.repeat(think * 4);
    if (route) m.route = route;
    if (answers) m.answers = answers;
    messages.push(m);
  }
  const c = { id, agentId, title: id, messages };
  if (handoffAt != null) c.handoff = { at: handoffAt, tokens: 1200, wholeTokens: 38000 };
  return c;
}
const recsOf = (...chats) => chats.flatMap((c) => C.recordsOf(c, { from: NOW - 7 * 24 * H, to: NOW }));

// ---------- records ----------
{
  const c = chat('a', 'claude', { n: 4, think: 50, mission: 'swarm', attach: 300 });
  const r = C.recordsOf(c, { from: 0, to: NOW });
  ok('one record per reply with usage', r.length === 4);
  ok('a record keeps input, output, cache', r[1].i === 5000 && r[1].o === 400 && r[1].c === Math.round(2000 * 0.9) && r[1].w === 3000, r[1]);
  ok('thinking from the kept thinking text (≈ chars / 4)', r[0].think === 50, r[0].think);
  ok('thinking from Codex\'s reasoning count', C.recordsOf(chat('b', 'astra', { n: 1, think: 77, reasoning: true }), {})[0].think === 77);
  ok('thinking never more than the output', C.recordsOf(chat('b2', 'astra', { n: 1, out: 30, think: 77, reasoning: true }), {})[0].think === 30);
  ok('the mission of the message before', r[0].kind === 'mission' && r[0].mission === 'swarm');
  ok('a routine round', C.recordsOf(chat('r', 'claude', { n: 2, routine: true }), {})[0].kind === 'routine');
  ok('attachments: what was sent', r[0].att === 300 && r[0].whole === 0);
  ok('attachments sent whole: the whole size, the extra counted', (() => { const x = C.recordsOf(chat('w', 'claude', { n: 1, attach: 300, whole: 5000 }), {})[0]; return x.att === 5000 && x.whole === 4700; })());
  ok('a quick ask vs a code ask', C.recordsOf(chat('q', 'claude', { n: 1, text: 'what is a bloom pass?' }), {})[0].quick === true && C.recordsOf(chat('q2', 'claude', { n: 1, text: 'fix the shader error' }), {})[0].code === true);
  ok('the first reply, then the gap and what came before', r[0].first && !r[1].first && r[1].gap === 10 * 60e3 && r[1].prevO === 400);
  const w = C.recordsOf(chat('old', 'claude', { n: 10, at0: NOW - 9 * 24 * H, every: 6 * H }), { from: NOW - 7 * 24 * H, to: NOW });
  ok('only the window\'s replies', w.length > 0 && w.length < 10 && w.every((x) => x.at >= NOW - 7 * 24 * H), w.length);
  const h = C.recordsOf(chat('h', 'astra', { n: 3, handoffAt: 2 }), {});
  ok('a handoff counts on the first reply after it, once', !h[0].handoff && h[1].handoff === 1200 && h[1].handoffSaved === 36800 && !h[2].handoff, h.map((x) => x.handoff));
  ok('no agent → nothing', C.recordsOf({ id: 'x', messages: [] }).length === 0);
}

// ---------- attribution ----------
const agents = [
  { id: 'claude', name: 'Claude', engine: 'claude', dock: '', effort: 'high' },
  { id: 'dir', name: 'Three Director', engine: 'claude', dock: 'three', lighterAt: 0 },
  { id: 'astra', name: 'Astra', engine: 'codex', dock: '', verbosity: 'low' },
];
{
  const recs = recsOf(
    chat('plain', 'claude', { n: 6, think: 300, text: 'quick: what does fog do?' }),
    chat('lab', 'dir', { n: 20, base: 4000, think: 0, out: 900 }),
    chat('ms', 'claude', { n: 3, mission: 'debate' }),
    chat('rt', 'astra', { n: 4, routine: true }),
  );
  const sum = recs.reduce((s, r) => s + r.i + r.o, 0);
  const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // the meter saw 100k more for Claude (second opinions, a deleted chat)
  const claudeSum = recs.filter((r) => r.agent === 'claude').reduce((s, r) => s + r.i + r.o, 0);
  const stats = { days: { [day(NOW - H)]: { a: { claude: { i: claudeSum + 100000, o: 0, r: 99 } } } } };
  const res = C.analyse(recs, { agents, stats, now: NOW, fixed: { claude: { prompt: 600, tools: 400, trims: [] }, dir: { prompt: 1200, tools: 1800, trims: [] } } });
  ok('the total = every reply + the meter\'s rest', res.total === sum + 100000, [res.total, sum]);
  ok('by cause adds up to the total', near(res.byCause.reduce((s, c) => s + c.tokens, 0), res.total, 8), res.byCause);
  ok('the meter\'s rest is "not kept in a chat"', res.byCause.find((c) => c.key === 'other')?.tokens === 100000);
  const kind = (k) => res.byKind.find((x) => x.key === k)?.tokens || 0;
  const tokOf = (id) => recs.filter((r) => r.chat === id).reduce((s, r) => s + r.i + r.o, 0);
  ok('Lab director chats', kind('director') === tokOf('lab'), [kind('director'), tokOf('lab')]);
  ok('plain chats', kind('plain') === tokOf('plain'));
  ok('missions', kind('missions') === tokOf('ms'));
  ok('routines', kind('routines') === tokOf('rt'));
  ok('the rest', kind('other') === 100000);
  ok('by AI, biggest first', res.byAI[0].id === 'dir' && res.byAI.find((a) => a.id === 'claude').tokens === claudeSum + 100000, res.byAI);
  const cause = (k) => res.byCause.find((c) => c.key === k)?.tokens || 0;
  ok('thinking = the replies\' thinking', cause('thinking') === 6 * 300);
  ok('answers = output minus thinking', cause('output') === recs.reduce((s, r) => s + r.o, 0) - 1800);
  ok('tool definitions: the measured share of the fixed part', near(cause('tools'), 20 * 1800 + 9 * 400 + 4 * 0.5 * Math.min(...recs.filter((r) => r.chat === 'rt').map((r) => r.i - r.words)), 4), cause('tools'));
  ok('re-reading: what grew beyond the fixed part and your words', cause('reread') > 0 && cause('reread') > cause('words'));
  ok('swarms: the multi-answer missions\' tokens', res.overlays.find((o) => o.key === 'swarm')?.tokens === tokOf('ms'));
  ok('cache misses counted (10 % of the history wasn\'t cached)', (res.overlays.find((o) => o.key === 'cacheMiss')?.tokens || 0) > 0);
}

// ---------- Continue lighter, replayed ----------
{
  const seq = (n, grow, base = 3000) => Array.from({ length: n }, (_, k) => ({ i: base + grow * k }));
  ok('off saves nothing', C.lighterSaves(seq(30, 3000), 0, 3000) === 0);
  ok('a chat that never passes the size saves nothing', C.lighterSaves(seq(10, 3000), 40000, 3000) === 0);
  const s40 = C.lighterSaves(seq(30, 3000), 40000, 3000);
  const s25 = C.lighterSaves(seq(30, 3000), 25000, 3000);
  ok('a 30-message chat at 40k saves a lot', s40 > 300000, s40);
  ok('offering sooner saves more on a long chat', s25 > s40, [s25, s40]);
  // ≈ autocompact's 30-message measure (1,422k → ≈ 700k re-read, before the summaries' own cost)
  const all = seq(30, 3000).reduce((s, x) => s + x.i, 0);
  ok('about half of what it re-read (autocompact measured −48 %)', s40 / all > 0.35 && s40 / all < 0.6, [s40, all]);
  ok('passing the size on the last message saves nothing (no message after it)', C.lighterSaves(seq(14, 3000), 40000, 3000) === 0);
  ok('the summary\'s own cost is paid', C.lighterSaves([{ i: 3000 }, { i: 41000 }, { i: 41500 }], 40000, 3000) < 41000 - (3000 + 3000));
}

// ---------- the fixes and their numbers ----------
{
  const a = [
    { id: 'claude', name: 'Claude', engine: 'claude', effort: 'high' },
    { id: 'dir', name: 'Three Director', engine: 'claude', dock: 'three', lighterAt: 0 },
    { id: 'astra', name: 'Astra', engine: 'codex', effort: 'xhigh' },
  ];
  const quick = recsOf(chat('q', 'claude', { n: 20, base: 1500, grow: 400, think: 1500, out: 4500, text: 'what is a good bpm for this?' }));
  const code = recsOf(chat('c', 'claude', { n: 10, base: 1500, grow: 400, think: 900, out: 4500, text: 'fix the shader error on line 40' }));
  const lab = recsOf(chat('lab', 'dir', { n: 18, base: 3000, grow: 3000, out: 900 }));
  const ast = recsOf(chat('ast', 'astra', { n: 6, base: 4000, grow: 500, think: 1000, out: 1500, reasoning: true, text: 'thoughts on this layout? give me a longer explanation of the trade-offs between the two approaches, with examples of where each one fails and what you would do instead in a real project of this size and shape, step by step' }));
  const recs = [...quick, ...code, ...lab, ...ast];
  const res = C.analyse(recs, { agents: a, now: NOW, fixed: { claude: { prompt: 500, tools: 500, trims: [] }, dir: { prompt: 1000, tools: 2000, trims: [] } } });
  const fix = (id) => res.fixes.find((f) => f.id === id);
  // Smart on Deep (high): quick asks → low (1 − 0.5/1.7), code stays, the rest → medium
  ok('Deep → Smart: quick asks think lighter, code fixes keep Deep', near(fix('smart:claude')?.saves, 20 * 1500 * (1 - 0.5 / 1.7), 1), fix('smart:claude'));
  ok('Deep → Smart names the quick questions', /quick questions too \(20 this week\)/.test(fix('smart:claude')?.text || ''), fix('smart:claude')?.text);
  ok('xhigh: the rest → medium (1 − 1/2.4)', near(fix('smart:astra')?.saves, 6 * 1000 * (1 - 1 / 2.4), 1), fix('smart:astra'));
  ok('Short answers: ≈ 20 % of the written part at Normal', near(fix('short:claude')?.saves, (20 * 3000 + 10 * 3600) * 0.2, 2), fix('short:claude'));
  const labRe = lab.reduce((s, r) => s + Math.max(0, r.i - 3000 - r.words), 0);
  ok('Continue lighter: off → Turn on, saving = the replay', fix('lighter:dir')?.button === 'Turn on' && fix('lighter:dir').saves === C.lighterSaves(lab, 40000, 3000) && fix('lighter:dir').fix.patch.lighterAt === undefined, fix('lighter:dir'));
  ok('…in words: the Lab chats\' re-read, the size, the saving', /Three Director's Lab chats re-read ≈ .+ tokens this week; Continue lighter at 40k would have saved ≈ /.test(fix('lighter:dir')?.text || '') && labRe > 0, fix('lighter:dir')?.text);
  ok('fixes are biggest saving first', res.fixes.every((f, i) => !i || res.fixes[i - 1].saves >= f.saves));
  ok('the top 3 are the 3 biggest over the floor', res.top.length === 3 && res.top.map((f) => f.id).join() === res.fixes.filter((f) => f.saves >= Math.max(3000, res.total * 0.02)).slice(0, 3).map((f) => f.id).join(), res.fixes.map((f) => [f.id, f.saves, res.total]));
  ok('a fix under the floor (2 % of the week) is left out', res.fixes.some((f) => f.saves < res.total * 0.02) && res.top.every((f) => f.saves >= res.total * 0.02), res.fixes.map((f) => [f.id, f.saves]));
  ok('the biggest here is Continue lighter on the Lab', res.top[0].id === 'lighter:dir', res.top[0].id);
  ok('each fix is an existing setting', res.fixes.every((f) => (f.fix.type === 'agent' && Object.keys(f.fix.patch).every((k) => ['lighterAt', 'effort', 'verbosity'].includes(k))) || f.fix.type === 'trim' || f.fix.type === 'unpin'));
  ok('the weekly note is due (a fix ≥ 10 % of the week)', res.note.due && /Cost coach: 3 changes would have saved/.test(res.note.text), res.note);
  // lighter already on at 60k → "Offer sooner", saving only the difference
  const b = a.map((x) => (x.id === 'dir' ? { ...x, lighterAt: 60000 } : x));
  const r2 = C.analyse(recs, { agents: b, now: NOW, fixed: { dir: { prompt: 1000, tools: 2000, trims: [] } } });
  const f2 = r2.fixes.find((f) => f.id === 'lighter:dir');
  ok('at 60k: Offer sooner, the difference only', f2?.button === 'Offer sooner' && f2.saves === C.lighterSaves(lab, 40000, 3000) - C.lighterSaves(lab, 60000, 3000) && f2.fix.patch.lighterAt === undefined, f2);
}

// ---------- nothing suggested when it's already applied ----------
{
  const lean = [
    { id: 'claude', name: 'Claude', engine: 'claude', verbosity: 'low' }, // Smart, short answers
    { id: 'dir', name: 'Three Director', engine: 'claude', dock: 'three', lighterAt: 25000, boardTools: true },
  ];
  const recs = recsOf(chat('q', 'claude', { n: 12, think: 600, out: 1200, text: 'what is a good bpm?' }), chat('lab', 'dir', { n: 30, grow: 3000, out: 900, answers: 'short' }));
  const res = C.analyse(recs, { agents: lean, now: NOW, fixed: { dir: { prompt: 1000, tools: 2400, trims: [{ key: 'set:boardTools', id: 'boardTools', label: 'Board tools', saves: 873, sleeps: true }] } } });
  const ids = res.fixes.map((f) => f.id);
  ok('Continue lighter already at 25k: no fix, a ✓', !ids.includes('lighter:dir') && res.lean.some((l) => l.id === 'lighter:dir'), ids);
  ok('Smart already: no thinking fix, a ✓', !ids.includes('smart:claude') && res.lean.some((l) => l.id === 'smart:claude'));
  ok('Short already: no answers fix, a ✓', !ids.includes('short:claude') && res.lean.some((l) => l.id === 'short:claude'));
  ok('tools that sleep until needed: a ✓, not a fix', !ids.some((x) => x.startsWith('tool:')) && /Board tools would ride along on 30 of Three Director's messages: they now sleep until needed ✓/.test(res.lean.find((l) => l.id.startsWith('tool:'))?.text || ''), res.lean);
  ok('no note when nothing pays', !res.note.due);
  // the Director replied short already: its written part isn't counted again
  ok('replies asked short aren\'t counted for Short', !ids.includes('short:dir'));
}

// ---------- tools, pinned missions, small weeks ----------
{
  const a = [{ id: 'claude', name: 'Claude', engine: 'claude', verbosity: 'low' }];
  const recs = recsOf(chat('p', 'claude', { n: 20, base: 1200, grow: 200, out: 300 }), chat('s', 'claude', { n: 8, base: 1200, grow: 200, out: 300, mission: 'swarm' }));
  // make the swarm messages cost 4× (several answers)
  for (const r of recs) if (r.mission) { r.i *= 4; r.o *= 4; }
  const res = C.analyse(recs, { agents: a, now: NOW, pinned: { claude: 'swarm' }, fixed: { claude: { prompt: 400, tools: 800, trims: [{ key: 'conn:notes', id: 'notes', label: 'Notes (yours)', saves: 640 }] } } });
  const t = res.fixes.find((f) => f.id === 'tool:claude:conn:notes');
  ok('an unused tool: its measured saving × this week\'s messages', t?.saves === 640 * 28 && t.button === 'Turn off' && t.fix.type === 'trim', t);
  const u = res.fixes.find((f) => f.id === 'unpin:claude');
  const sw = recs.filter((r) => r.mission); const pl = recs.filter((r) => !r.mission);
  const avg = pl.reduce((s, r) => s + r.i + r.o, 0) / pl.length;
  ok('a pinned swarm: what it cost beyond one answer each', u && near(u.saves, sw.reduce((s, r) => s + r.i + r.o, 0) - 8 * avg, 1) && u.fix.mission === 'swarm', u);
  ok('not pinned: no unpin fix (only counted)', !C.analyse(recs, { agents: a, now: NOW }).fixes.some((f) => f.kind === 'unpin'));
  const tiny = C.analyse(recsOf(chat('t', 'claude', { n: 2, base: 800, grow: 100, out: 50 })), { agents: [{ id: 'claude', name: 'Claude', effort: 'high' }], now: NOW });
  ok('a tiny week: no top fix (under the floor), no note', tiny.top.length === 0 && !tiny.note.due, tiny.fixes);
  ok('an AI that isn\'t set up any more is left out', C.analyse(recs, { agents: [], now: NOW }).total === 0);
  ok('words: the summary and the fixes', /Cost coach, last 7 days/.test(C.words(res)) && /1\. /.test(C.words(res)));
}

// ---------- the week key and the small store ----------
ok('the week key is its Monday', C.weekKey(NOW) === '2026-10-12' && C.weekKey(new Date(2026, 9, 12, 1).getTime()) === '2026-10-12' && C.weekKey(new Date(2026, 9, 18, 23).getTime()) === '2026-10-12');
{
  const s = C.cleanStore({ noted: { '2026-10-12': 5, junk: 3 }, applied: [{ id: 'a', at: 1, saves: 3.4, text: 'x' }, { nope: 1 }, null], extra: 1 });
  ok('the store keeps only its own shape', s.v === 1 && Object.keys(s.noted).join() === '2026-10-12' && s.applied.length === 1 && s.applied[0].saves === 3 && !('extra' in s), s);
  ok('a missing / garbled store is clean and empty', JSON.stringify(C.cleanStore(null)) === JSON.stringify({ v: 1, noted: {}, applied: [] }) && C.cleanStore('x').applied.length === 0);
  ok('noted weeks are capped', Object.keys(C.cleanStore({ noted: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`2026-01-${String(i + 1).padStart(2, '0')}`, i + 1])) }).noted).length === 12);
}

console.log(`\n${n - fails}/${n} passed`);
if (fails) process.exit(1);
