#!/usr/bin/env node
// (round 34, autocompact) Continue lighter, the pure part (autocompact.js): when the offer shows (context size, cache,
// how much of the history is still talked about, a topic change, the owner's size), the summary's shape, the
// summarizer's input (byte-stable, no dates or ids), and a 30-message chat simulated with the fake engines' token
// model (dev/fake-claude.js: input = 700 + everything said so far / 4, the cache serves all but the newest part).
//   node dev/autocompact-test.js [--table]
const path = require('path');
const AC = require(path.join(__dirname, '..', 'autocompact.js'));
const CC = require(path.join(__dirname, '..', 'context-core.js'));

const fails = [];
const check = (ok, what, info) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) { fails.push(what); if (info !== undefined) console.log('   ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 600)); } };
const words = (n, seed) => Array.from({ length: n }, (_, i) => `${seed}${i % 37}`).join(' ');
const pad = (topic, chars) => { let s = `About the ${topic}: `; let i = 0; while (s.length < chars) s += `${topic} detail ${i++} keeps the ${topic} glow and ${topic} timing consistent. `; return s; };

// a chat of n exchanges about one topic; usage like the fake engines (cached = all but the newest message)
function chat(n, { topic = 'tunnel', chars = 6000, last = null, fixed = 700 } = {}) {
  const messages = [];
  let said = 0;
  for (let i = 0; i < n; i++) {
    const u = i === n - 1 && last ? last : `${i ? '' : 'Build a neon tunnel scene. '}${pad(topic, chars)}`;
    const r = `Done: I changed the ${topic} (${i}).`;
    said += u.length + r.length;
    const input = fixed + Math.ceil(said / 4);
    messages.push({ role: 'user', text: u, at: i }, { role: 'assistant', text: r, at: i, usage: { input, output: 20, cached: i ? input - Math.ceil((u.length + r.length) / 4) : 0 } });
  }
  return { id: 'c', agentId: 'claude', title: 'Tunnel', session: { id: 's' }, messages };
}
const AG = { id: 'claude', engine: 'claude', mode: 'native' };

// ---------- 1. the decision ----------
const small = AC.decide(AC.inputOf(chat(4), AG));
check(!small.offer && /under/.test(small.why), `a short chat: no offer (${small.why}, ${small.before})`);
const big = chat(30);
const d = AC.decide(AC.inputOf(big, AG));
check(d.offer && d.before > 40000 && d.after < 8000, `a long chat past 40k: the offer (${d.before} → ≈ ${d.after}, ${d.why}, gain ${d.gain} vs cost ${d.cost})`, d);
check(AC.line(d) === `This chat re-reads ≈ ${Math.round(d.before / 1000)}k tokens each message. Continue lighter? (keeps a summary, ≈ ${Math.round(d.after / 1000)}k)`, `one calm line: “${AC.line(d)}”`);
check(!AC.decide(AC.inputOf(big, { ...AG, lighterAt: 0 })).offer, 'off in ⋯ AI setup: never offered');
check(!AC.decide(AC.inputOf(big, { ...AG, lighterAt: 100000 })).offer && AC.decide(AC.inputOf(chat(18), { ...AG, lighterAt: 25000 })).offer, 'the owner\'s size decides when (100k: not yet; 25k: an 18-message chat already)');
check(AC.atOf({}) === 40000 && AC.atOf({ lighterAt: 0 }) === 0 && AC.atOf({ lighterAt: 60000 }) === 60000, 'default on at about 40k');
// most of the context is the last exchanges: nothing to gain
const tailHeavy = chat(6, { chars: 300 });
tailHeavy.messages.push({ role: 'user', text: pad('tunnel', 160000) }, { role: 'assistant', text: 'ok', usage: { input: 42000, output: 5, cached: 1000 } });
const th = AC.decide(AC.inputOf(tailHeavy, AG));
check(!th.offer && /last exchanges/.test(th.why), `most of the context is the last exchanges: no offer (${th.why})`);
// a topic change offers earlier
const shift = AC.inputOf(chat(20, { last: 'Now something else entirely: write invoices template letterhead spreadsheet budget quarterly' }), AG);
const same = AC.inputOf(chat(20), AG);
const ds = AC.decide(shift); const dn = AC.decide(same);
check(ds.topic && ds.offer && !dn.offer && dn.before > 30000 && dn.before < 40000, `a topic change offers below the size (${ds.before}: ${ds.why}); the same topic doesn't (${dn.why})`, { ds, dn });
// cache: a cold cache makes it pay sooner, a hot cache needs the size anyway
const cold = AC.decide({ ...AC.inputOf(big, AG), hitRate: 0 });
const hot = AC.decide({ ...AC.inputOf(big, AG), hitRate: 1 });
check(cold.gain > hot.gain * 5 && hot.offer, `the cache counts: per message ${cold.perMessage} cold vs ${hot.perMessage} hot`);
// a hot cache and a tiny horizon: not worth it (the gain must clearly beat the one-time cost)
const marginal = AC.decide({ ...AC.inputOf(chat(20, { chars: 8000 }), AG), hitRate: 1, userCount: 2, at: 1000 });
check(!marginal.offer && /cache/.test(marginal.why), `a hot cache and few messages to come: not worth it (${marginal.gain} vs ${marginal.cost})`);
// the verbatim tail: the last two exchanges
const sp = AC.split(big);
check(sp.kept.length === 4 && sp.kept[0].role === 'user' && sp.older.length === 56, `the last ${AC.KEEP_EXCHANGES} exchanges are kept word for word (${sp.kept.length} messages), the rest summarized (${sp.older.length})`);
// after a first compaction, the next one starts from it (and from the kept tail)
const again = chat(30);
again.messages.push({ role: 'assistant', text: 'Goal: x', compactSummary: true });
again.compact = { summary: 'Goal: tunnel\nDecisions:\n- neon', index: again.messages.length, tail: 56 };
for (let i = 0; i < 6; i++) again.messages.push({ role: 'user', text: `more ${i}` }, { role: 'assistant', text: `ok ${i}`, usage: { input: 9000 + i, output: 5, cached: 8000 } });
const sa = AC.split(again);
check(sa.from === 56 && sa.previous && sa.older[0].text === big.messages[56].text && !sa.older.some((m) => m.compactSummary), 'a second summary reads the earlier summary + what came after it, never the divider');
const ia = AC.inputOf(again, AG);
check(ia.fixed >= 300 && ia.fixed < 9000, `the fixed part after a compaction leaves out what was carried (${ia.fixed})`);

// ---------- 2. the summary ----------
const reply = 'Here is the summary:\n\n**Goal:** a neon tunnel for Shorts\nDecisions:\n* bloom 0.4\n- palette ember\nFiles and names:\n- layer "Glow"\n- sketches/tunnel.js\nOpen tasks:\n- none\nWhere we stopped: tuning the kick';
const sh = AC.shape(reply);
check(sh && sh.startsWith('Goal: a neon tunnel') && /Decisions:\n- bloom 0\.4\n- palette ember/.test(sh) && !/Open tasks/.test(sh) && /Where we stopped: tuning the kick$/.test(sh), 'the summary\'s shape: parts in order, preamble and empty parts dropped, bullets normalized', sh);
check(AC.shape('Sure! We talked about many things.') === null, 'a reply that isn\'t a summary is refused (the free one is used)');
const long = `Goal: g\nDecisions:\n${Array.from({ length: 400 }, (_, i) => `- decision ${i} with a few words`).join('\n')}\nWhere we stopped: here`;
const capped = AC.shape(long);
check(Math.ceil(capped.length / 4) <= AC.SUMMARY_MAX_TOKENS && /decision 399/.test(capped) && !/decision 0 /.test(capped) && /^Goal: g/.test(capped) && /Where we stopped: here$/.test(capped), `capped at ≈ ${AC.SUMMARY_MAX_TOKENS} tokens: oldest list lines go first, the goal and the end stay`);
const ls = CC.localSummary(big);
const local = AC.fromLocal(ls);
check(/^Goal: /.test(local) && AC.shape(local) === local, 'the free summary comes in the same shape', local.slice(0, 200));
// the prompt: the parts asked for, standing instructions left out, only the older part, no dates / ids / times
const p1 = AC.prompt(AC.split(big));
const p2 = AC.prompt(AC.split(JSON.parse(JSON.stringify(big))));
check(p1 === p2 && !/\b\d{4}-\d\d-\d\d\b|\b\d\d:\d\d\b|[0-9a-f]{8}-[0-9a-f]{4}-/.test(p1), `the summarizer's input is byte-stable (${p1.length} chars) and has no dates or ids`);
const distinct = chat(30, { last: 'KEPT-WORD-FOR-WORD please tune the kick' });
const p3 = AC.prompt(AC.split(distinct));
check(AC.HEADS.every((h) => p3.includes(`${h}:`)) && /standing instructions/.test(p3) && !p3.includes('KEPT-WORD-FOR-WORD'), 'it asks for goal / decisions / files / open tasks / where we stopped, leaves out standing instructions and the kept exchanges');
const huge = chat(60, { chars: 9000 });
const tp = AC.transcript(AC.split(huge));
check(tp.length <= 120100 && tp.startsWith('User: Build a neon tunnel'), `a very long history: the summarizer reads at most ≈ 30k tokens, the goal kept (${tp.length} chars)`);
check(AC.CHEAP.claude.model === 'haiku' && AC.CHEAP.claude.effort === 'low' && AC.CHEAP.codex.effort === 'minimal', 'the summary runs on the cheapest model, low effort');

// ---------- 3. a 30-message chat, before → after (the fake engines' token model) ----------
// Each message the owner sends ≈ 1.5k tokens (a director turn: the ask + what the tools brought back), each reply short.
// Before: every message re-reads everything. After: the owner clicks the offer when it shows.
function simulate(offerOn, { n = 30, chars = 6000, cachedHit = 0.9 } = {}) {
  const c = { id: 'sim', agentId: 'claude', title: 'Sim', session: { id: 's1' }, messages: [] };
  let said = 0; let total = 0; let full = 0; const per = []; let compactions = 0; let compactCost = 0;
  for (let i = 0; i < n; i++) {
    const u = `${i ? '' : 'Build a neon tunnel scene. '}${pad(i < 18 ? 'tunnel' : 'tunnel ending', chars)}`;
    const r = `Done: I changed the tunnel (${i}).`;
    let input;
    if (!c.session.id && c.compact) {
      // the first message after continuing lighter: a new session with the summary + the kept exchanges
      const carried = Math.ceil(c.compact.summary.length / 4) + 60 + c.messages.slice(c.compact.tail).filter((m) => !m.compactSummary).reduce((s, m) => s + Math.ceil(m.text.length / 4) + 4, 0);
      said = (carried - 60) * 4; c.session.id = `s${compactions + 1}`;
    }
    said += u.length + r.length;
    input = 700 + Math.ceil(said / 4);
    const fresh = per.length && per.at(-1).session === c.session.id ? Math.ceil((u.length + r.length) / 4) : input;
    const cached = Math.max(0, Math.round((input - fresh) * cachedHit));
    per.push({ input, session: c.session.id });
    total += input; full += input - cached + cached * 0.1;
    c.messages.push({ role: 'user', text: u }, { role: 'assistant', text: r, usage: { input, output: 20, cached } });
    if (offerOn) {
      const dd = AC.decide(AC.inputOf(c, AG));
      if (dd.offer) {
        const parts = AC.split(c);
        const summary = AC.fromLocal(CC.localSummary({ ...c, messages: parts.older }), parts.previous);
        compactCost += Math.ceil(AC.prompt(parts).length / 4) * 0.2 + Math.ceil(summary.length / 4) * 5 * 0.2;
        c.messages.push({ role: 'assistant', text: summary, compactSummary: true });
        c.compact = { summary, index: c.messages.length, tail: parts.tail };
        c.session = {};
        compactions++;
      }
    }
  }
  return { per: per.map((x) => x.input), total, full: Math.round(full + compactCost), compactions, last: per.at(-1).input, avg: Math.round(total / per.length) };
}
const rows = [];
for (const [label, chars] of [['≈ 1.5k tokens a message (a plain chat with pastes)', 6000], ['≈ 3k tokens a message (a director turn with tool results)', 12000]]) {
  const before = simulate(false, { chars });
  const after = simulate(true, { chars });
  rows.push({ label, before, after });
  console.log(`\n${label}, every 5th message: before ${before.per.filter((_, i) => i % 5 === 4).join(' · ')}  →  after ${after.per.filter((_, i) => i % 5 === 4).join(' · ')}`);
  console.log(`  total re-read ${before.total} → ${after.total} (−${Math.round((1 - after.total / before.total) * 100)} %), average ${before.avg} → ${after.avg}, last message ${before.last} → ${after.last}, ${after.compactions} offer(s) taken; cache-weighted full-price ${before.full} → ${after.full} (−${Math.round((1 - after.full / before.full) * 100)} %, summaries included)`);
  check(after.compactions >= 1 && after.compactions <= 3, `the offer comes rarely (${after.compactions} times in 30 messages)`);
  check(after.total < before.total && after.full < before.full && after.last < before.last * 0.35, `it re-reads less: ${before.total} → ${after.total} tokens, ${before.full} → ${after.full} at full-price weight, last ${before.last} → ${after.last}`);
}
if (process.argv.includes('--table')) console.log(JSON.stringify(rows.map((r) => ({ label: r.label, before: r.before.per, after: r.after.per })), null, 0));

console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
