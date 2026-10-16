#!/usr/bin/env node
// (round 50, historylean) Lighter history, the pure part (historylean-core.js): the lighter history a fresh session
// starts from (stubs for tool results, pictures and earlier code versions; older long answers shortened; the last
// exchanges word for word; the goal kept under the cap; byte-stable), the decision (only when the prompt cache has gone,
// or by a wide margin when it's warm and not mid-task), the cache's life per engine, and budgets on the simulated long
// chats (40 / 100 / 300 exchanges, code / pictures / Lab director, Claude and Astra).
//   node dev/historylean-test.js            # the checks
//   node dev/historylean-test.js --table    # + the before / after table (Markdown)
const path = require('path');
const C = require(path.join(__dirname, '..', 'historylean-core.js'));

const fails = [];
const check = (ok, what, info) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) { fails.push(what); if (info !== undefined) console.log('   ', typeof info === 'string' ? info.slice(0, 800) : JSON.stringify(info).slice(0, 800)); } };
const MIN = 60000;

// ---------- a chat with everything that weighs ----------
const code = (n, file = 'src/app.js', v = 1) => `\`\`\`js\n// ${file}\n${Array.from({ length: n }, (_, i) => `const a${i} = ${v} * ${i};`).join('\n')}\n\`\`\``;
const long = (n) => 'The glow follows the kick and the camera eases in on the second beat. '.repeat(n);
function chat() {
  const ms = [
    { role: 'user', text: 'GOAL-MARK: build a neon tunnel that pulses on the kick, vertical.' },
    { role: 'assistant', text: `Here is the first version.\n\n${code(40, 'src/app.js', 1)}`, tools: ['three_read_code', 'three_eval', 'three_screenshot'], usage: { input: 30000, cached: 0 } },
    { role: 'user', text: 'Look at this frame', attachments: [{ kind: 'image', name: 'frame-1.png', tokens: 1800 }], images: ['/tmp/frame-1.png'] },
    { role: 'assistant', text: `I see it. ${long(80)}`, tools: ['three_eval', 'three_eval', 'three_edit_code'], usage: { input: 40000, cached: 30000 } },
    { role: 'user', text: 'Here is the log', sent: `Here is the log\n\n<file name="render.log">\n${'line\n'.repeat(400)}</file>`, attachments: [{ kind: 'text', name: 'render.log', tokens: 1500, lean: { tokens: 1500 } }] },
    { role: 'assistant', text: `Fixed:\n\n${code(40, 'src/app.js', 2)}`, tools: ['Read · render.log'], usage: { input: 50000, cached: 40000 } },
  ];
  for (let i = 0; i < 14; i++) ms.push({ role: 'user', text: `step ${i}: make it warmer ${i}` }, { role: 'assistant', text: `Done step ${i}. ${long(6)}`, tools: ['three_sliders'], usage: { input: 52000 + i * 1000, cached: 50000 } });
  ms.push({ role: 'user', text: 'KEEP-USER-MARK the last ask', attachments: [{ kind: 'image', name: 'last.png', tokens: 1800 }] }, { role: 'assistant', text: `KEEP-REPLY-MARK ${long(40)}\n\n${code(40, 'src/app.js', 3)}`, tools: ['three_screenshot'], usage: { input: 70000, cached: 60000 } });
  ms.push({ role: 'user', text: 'now the new message' });
  return { id: 'c1', agentId: 'claude', messages: ms, session: { id: 'sess-1' } };
}

// ---------- the lighter history ----------
const c = chat();
const b = C.build(c, { chatTools: true, text: 'now the new message' });
check(b.text.includes('GOAL-MARK'), 'the goal (first message) is kept');
check(b.text.endsWith('now the new message'), 'the owner\'s message comes last');
check(!b.history.includes('now the new message'), 'the message being sent is not part of the history');
check(b.text.includes('[used three_read_code, three_eval, three_screenshot; results not sent again]'), 'a reply\'s tools: one line, results not sent again');
check(b.text.includes('three_eval ×2'), 'repeated tools are counted');
check(b.text.includes('[picture: frame-1.png, not sent again]'), 'an older picture: a stub');
check(b.text.includes('[picture: last.png, not sent again]'), 'a picture in the last exchanges: a stub too (never re-sent)');
check(b.text.includes('[attached: render.log (≈ 2k tokens), not sent again]'), 'an older attachment: a stub with its size');
check(!b.text.includes('line\nline\nline'), 'an older attachment\'s body is not sent again');
check(/\[code \(js\), \d+ lines: an earlier version, a newer one follows\]/.test(b.text), 'an earlier version of the same file: a stub');
check((b.text.match(/const a39 = 3 \* 39/g) || []).length === 1, 'the newest version of the code is kept whole');
check(!b.text.includes('const a39 = 1 * 39') && !b.text.includes('const a39 = 2 * 39'), 'earlier versions are not');
check(b.text.includes('KEEP-USER-MARK') && b.text.includes('KEEP-REPLY-MARK'), 'the last exchanges go word for word');
check(/I see it\. .*\[…≈ \d+ tokens left out…\]/s.test(b.text), 'an older long answer is shortened (start + end, how much is left out)');
check(b.text.includes('chat_do {op: "earlier"'), 'with the chat tools: how to fetch an earlier message');
check(C.build(c, { chatTools: false }).text.includes('ask me if you need an earlier detail'), 'without them: ask the owner');
check(C.build(c, { chatTools: true, text: 'x' }).text === C.build(c, { chatTools: true, text: 'x' }).text, 'byte-stable: the same chat gives the same bytes');
check(!/\b\d{1,2}:\d{2}\b(?! \*)|20\d\d-\d\d-/.test(b.history.replace(/const a\d+ = .*$/gm, "")), 'no dates or times');
check(b.stubs.tools === 22 && b.stubs.pictures === 2, 'stubs counted', b.stubs);
const whole = c.messages.slice(0, -1).reduce((n, m) => n + C.tok(m.sent || m.text) + (m.attachments || []).reduce((k, a) => k + (a.tokens || 0), 0), 0);
check(b.tokens < whole * 0.75, `lighter than the chat's own words and attachments (${b.tokens} < ${whole})`);
// the cap: a 300-exchange chat stays under ≈ 12k tokens, the goal kept, the drop said
const big = { messages: [{ role: 'user', text: 'GOAL-MARK big chat' }], session: { id: 's' } };
for (let i = 0; i < 300; i++) big.messages.push({ role: 'user', text: `ask ${i} ${long(3)}` }, { role: 'assistant', text: `answer ${i} ${long(8)}`, tools: ['three_eval'] });
big.messages.push({ role: 'user', text: 'next' });
const bb = C.build(big, { chatTools: true });
check(bb.history.length <= C.MAX_CHARS + 600, `capped (${bb.history.length} chars ≤ ${C.MAX_CHARS})`);
check(bb.history.startsWith('User: GOAL-MARK big chat') && bb.dropped > 0 && /\[… \d+ earlier messages left out here; chat_do earlier finds them …\]/.test(bb.history), 'over the cap: the oldest go, the goal stays, the drop is said');
check(bb.history.includes('answer 299'), 'the newest stay');
// what stands before: the Continue lighter summary / the handoff brief
const cc = { ...chat(), compact: { summary: 'SUMMARY-MARK', index: 10, tail: 8 } };
const bc = C.build(cc, {});
check(bc.history.startsWith('<summary>\nSUMMARY-MARK') && !bc.history.includes('GOAL-MARK'), 'after Continue lighter: its summary, then the messages from its kept tail');
const ch = { ...chat(), handoff: { brief: 'BRIEF-MARK', at: 6 } };
check(C.build(ch, {}).history.startsWith('BRIEF-MARK'), 'after a handoff: the brief, then what came since');

// ---------- the cache ----------
check(C.ttlOf('claude', { ttl: '1h' }).ms === 60 * MIN && C.ttlOf('claude', { ttl: '5m' }).ms === 5 * MIN, 'Claude\'s cache life as reported (1 h / 5 min)');
check(C.ttlOf('claude', {}).ms === 60 * MIN && !C.ttlOf('claude', {}).known, 'unknown: an hour (never break a cache that may be warm)');
check(C.warmth('claude', 4 * MIN, C.ttlOf('claude', { ttl: '5m' })) === 1 && C.warmth('claude', 7 * MIN, C.ttlOf('claude', { ttl: '5m' })) === 0, '5-minute cache: warm at 4 min, gone at 7');
check(C.warmth('claude', 50 * MIN, C.ttlOf('claude', { ttl: '1h' })) === 1 && C.warmth('claude', 2 * 60 * MIN, C.ttlOf('claude', {})) === 0, '1-hour cache: warm at 50 min, gone at 2 h');
check(C.warmth('codex', 3 * MIN) === 1 && C.warmth('codex', 8 * MIN) > 0.5 && C.warmth('codex', 20 * MIN) < 0.5 && C.warmth('codex', 2 * 60 * MIN) === 0, 'Codex: warm, likely, unlikely, gone');
check(C.expiresAfter('codex') === 10 * MIN && C.expiresAfter('claude', { ttl: '5m' }) === 5 * MIN && C.expiresAfter('claude', { ttl: '1h' }) === 60 * MIN && C.expiresAfter('claude', {}) === undefined, 'when a send preview counts the cache as gone (unknown: its own 5 minutes)');
check(C.ctxOf({ usage: { input: 50000, contextInput: 12000 } }) === 12000, 'Codex reports the last call\'s context');
check(C.ctxOf({ usage: { input: 50000 }, tools: ['a', 'b', 'c', 'd'] }) === 11500, 'Claude: the sum over its steps, divided (× 1.15 for growth)');
check(C.ctxOf({ usage: { input: 9000 } }) === 9000, 'one step: its input');

// ---------- the decision ----------
const base = { engine: 'claude', ctx: 80000, lean: 9000, fixed: 2100, steps: 5, ttl: C.ttlOf('claude', { ttl: '1h' }) };
const cold = C.decide({ ...base, gap: 3 * 60 * MIN, tools: true });
check(cold.rebase && /expired/.test(cold.why), 'cold cache, big chat: a fresh lighter start', cold);
check(cold.after === 2100 + 9000 + C.WRAP && cold.before === 80000, 'before / after in tokens');
const warmTask = C.decide({ ...base, gap: 2 * MIN, tools: true });
check(!warmTask.rebase && /mid-task/.test(warmTask.why), 'warm cache, mid-task: resume (never break it)', warmTask);
check(!C.decide({ ...base, gap: 2 * MIN, tools: false, ctx: 30000, lean: 12000, fixed: 300, steps: 1 }).rebase, 'warm cache, a small gain: resume');
const warmBig = C.decide({ ...base, gap: 2 * MIN, tools: false, ctx: 150000, lean: 8000, fixed: 300, steps: 1 });
check(!warmBig.rebase && warmBig.gain > 0, 'warm cache, even a huge history with no task under way: resume (never broken by itself)', warmBig);
check(!C.decide({ ...base, gap: 3 * 60 * MIN, ctx: 15000 }).rebase, 'a small chat never restarts');
check(!C.decide({ ...base, gap: 3 * 60 * MIN, ctx: 30000, lean: 25000 }).rebase, 'an already lean history: resume');
check(!C.decide({ ...base, gap: 3 * 60 * MIN, off: true }).rebase, 'off: resume');
check(!C.decide({ ...base, gap: 3 * 60 * MIN, blocked: 'x' }).rebase, 'blocked: resume');
check(C.decide({ ...base, gap: MIN, force: true, ctx: 15000, lean: 4000 }).rebase, '/history-lean now: a fresh start when it saves anything');
check(C.decide({ ...base, engine: 'codex', ttl: C.ttlOf('codex'), gap: 20 * MIN, tools: true }).rebase, 'Astra after 20 min (its cache most likely gone): a fresh lighter start');
check(!C.decide({ ...base, engine: 'codex', ttl: C.ttlOf('codex'), gap: 3 * MIN, tools: true }).rebase, 'Astra after 3 min: resume');
check(!C.decide({ ...base, gap: 30 * MIN, tools: true }).rebase, 'Claude on a subscription (1 h cache) after 30 min: resume');
check(C.decide({ ...base, ttl: C.ttlOf('claude', { ttl: '5m' }), gap: 30 * MIN, tools: true }).rebase, 'Claude on an API key (5 min cache) after 30 min: a fresh lighter start');

// ---------- the chat's numbers ----------
const now = Date.now();
const ic = chat();
ic.messages.forEach((m, i) => { m.at = now - 3 * 60 * MIN - (ic.messages.length - i) * MIN; });
ic.messages.at(-1).at = now;
const inp = C.inputOf(ic, { engine: 'claude' }, { now, upto: ic.messages.length - 1, chatTools: true });
check(inp.gap > 2 * 60 * MIN && inp.ctx > 0 && inp.lean > 0 && inp.fixed >= 300 && inp.steps > 1, 'inputOf: gap, context, lighter size, fixed part, steps', inp);
check(C.decide(inp).rebase, 'the test chat after 3 h: a fresh lighter start', C.decide(inp));
const withRef = chat(); withRef.messages.at(-1).attachments = [{ kind: 'text', name: 'a.js', ref: 3 }];
check(/refers to the session/.test(C.inputOf(withRef, { engine: 'claude' }, { upto: withRef.messages.length - 1 }).blocked), 'an attachment sent as "same as before" (it points into the old session): no fresh start');
check(C.inputOf({ ...chat(), session: {} }, { engine: 'claude' }).blocked === 'no session', 'no session: nothing to make lighter');
check(C.inputOf({ ...chat(), handoff: { whole: 'x', at: 2 } }, { engine: 'claude' }).blocked === 'the whole chat was asked for', '"Send the whole chat instead" is respected');
check(C.inputOf(chat(), { engine: 'claude', lighterAt: 0 }).off && C.inputOf({ ...chat(), leanOff: true }, { engine: 'claude' }).off, 'off with Continue lighter Off, or per chat');
check(C.line({ before: 80000, after: 11000 }).includes('≈ 11k tokens sent instead of re-reading ≈ 80k'), 'the line says it in tokens');

// ---------- the simulated long chats: budgets ----------
const BUDGET = { // the share each case must save at least, tokens re-read per message (averaged over the chat)
  'claude code': 0.15, 'claude pictures': 0.35, 'claude director': 0.3,
  'codex code': 0.5, 'codex pictures': 0.55, 'codex director': 0.55,
};
const rows = [];
for (const engine of ['claude', 'codex']) {
  for (const profile of ['code', 'pictures', 'director']) {
    for (const n of [40, 100, 300]) {
      const a = C.simulate({ engine, profile, n });
      const l = C.simulate({ engine, profile, n, lean: true });
      const save = 1 - l.avg / a.avg;
      const saveW = 1 - l.avgWeight / a.avgWeight;
      rows.push({ engine, profile, n, a, l, save, saveW });
      if (n !== 40) check(save >= BUDGET[`${engine} ${profile}`] && saveW >= BUDGET[`${engine} ${profile}`] * 0.8, `${engine} ${profile} ${n} exchanges: −${Math.round(save * 100)} % re-read, −${Math.round(saveW * 100)} % after the cache (budget ${Math.round(BUDGET[`${engine} ${profile}`] * 100)} %)`);
      check(l.leanStarts <= n / 5, `${engine} ${profile} ${n}: ${l.leanStarts} fresh starts, only at breaks`);
    }
  }
}
// never a warm cache broken mid-task: the director's 2-minute gaps never restart
{
  const r = C.simulate({ engine: 'claude', profile: 'director', n: 19, lean: true });
  check(r.leanStarts === 0, 'a director chat with no break past the cache\'s life: no fresh start');
}

if (process.argv.includes('--table')) {
  const k = (x) => (x >= 1000 ? `${(x / 1000).toFixed(x >= 100000 ? 0 : 1)}k` : String(x));
  const pc = (x) => `−${Math.round(x * 100)} %`;
  console.log('\n| AI · chat | exchanges | re-read per message (before → after) | after the cache (full-price weight) | cache share before → after | fresh starts |');
  console.log('|---|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    const share = (s) => `${Math.round(100 * (1 - s.totalWeight / s.total))} %`;
    console.log(`| ${r.engine === 'codex' ? 'Astra' : 'Claude'} · ${r.profile} | ${r.n} | ${k(r.a.avg)} → **${k(r.l.avg)}** (${pc(r.save)}) | ${k(r.a.avgWeight)} → **${k(r.l.avgWeight)}** (${pc(r.saveW)}) | ${share(r.a)} → ${share(r.l)} | ${r.l.leanStarts} |`);
  }
}

console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
