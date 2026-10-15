#!/usr/bin/env node
// (round 44, sendpreview) The send preview's estimator (sendpreview-core.js): the parts add up, the chat the engine
// re-reads (its session, a lighter start, a handoff brief or whole chat, the earlier conversation sent along), the
// prompt cache (warm, expired after ≈ 5 minutes, a new session, another model), attachments (lean / whole), missions,
// Smart's effort, when the hint shows (3× this chat's usual, 30k at full price), the one cheaper way, calibration, the
// store's shape and the plain words. Run: node dev/sendpreview-test.js
const path = require('path');
const C = require(path.join(__dirname, '..', 'sendpreview-core.js'));

const fails = [];
const check = (ok, what, info) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) { fails.push(what); if (info !== undefined) console.log('   ', typeof info === 'string' ? info.slice(0, 600) : JSON.stringify(info).slice(0, 600)); } };
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * tol);
const NOW = 1_800_000_000_000;
const MIN = 60e3;

// a chat of n exchanges, ≈ `each` characters per message, the last one `ago` ms ago, in an engine session
function chatOf(n, { each = 4000, ago = MIN, session = 'S1', cached = 0.9, out = 600 } = {}) {
  const messages = [];
  let ctx = 800;
  for (let i = 0; i < n; i++) {
    const at = NOW - ago - (n - i) * 2 * MIN;
    messages.push({ role: 'user', text: `question ${i} `.padEnd(each, 'q'), at });
    ctx += each / 4 * 2;
    messages.push({ role: 'assistant', text: `answer ${i} `.padEnd(each, 'a'), at: at + MIN, usage: { input: Math.round(ctx), output: out, cached: Math.round(ctx * (i ? cached : 0)) } });
  }
  messages.at(-1).at = NOW - ago;
  return { id: 'c1', agentId: 'claude', session: session ? { id: session } : {}, messages };
}

// ---------- the parts add up ----------
{
  const chat = chatOf(10);
  const st = C.stats(chat);
  const hist = C.historyOf(chat);
  const e = C.estimate({ fixed: 1200, history: hist, words: 50, attachments: [{ name: 'a.png', kind: 'image', tokens: 1844, wholeTokens: 11060 }], answer: 600, now: NOW, lastAt: st.lastAt, hit: 0.9 });
  const sum = e.parts.reduce((n, p) => n + p.tokens, 0);
  check(sum === e.tokens && e.tokens === 1200 + hist.tokens + 50 + 1844 + 600, 'the parts add up to the estimate (fixed + history + words + attachments + answer)', { sum, tokens: e.tokens });
  check(e.parts.reduce((n, p) => n + p.fresh, 0) === e.fresh, 'full-price parts add up to the full-price total', e);
  check(e.cached + e.fresh === e.tokens, 'cached + full price = the total');
  check(hist.session && hist.kind === 'session' && near(hist.tokens, 20 * (4000 / 4 + 4), 0.01), 'history in a session: every message of it (≈ chars / 4)', hist);
  check(hist.cacheable === hist.tokens - 1000, 'what the cache can cover: everything but the last reply (it was never part of a prompt yet)', hist);
  check(st.n === 10 && st.out === 600 && near(st.hit, 0.9, 0.001), 'this chat\'s usual: 10 replies, the median answer, the cache share', st);
  check(st.median === C.median(chat.messages.filter((m) => m.usage).map((m) => m.usage.input + m.usage.output)), 'the median of what replies really cost (input + output)', st.median);
}

// ---------- the cache: warm, expired, a new session, another model ----------
{
  const chat = chatOf(12, { ago: 2 * MIN });
  const st = C.stats(chat);
  const base = { fixed: 1000, history: C.historyOf(chat), words: 20, answer: 500, now: NOW, lastAt: st.lastAt, hit: 0.9 };
  const warm = C.estimate(base);
  const cold = C.estimate({ ...base, now: NOW + 4 * MIN }); // 6 minutes after the last message
  check(!warm.cold && warm.cached > 0.8 * (warm.tokens - 1000 - 520), 'warm (2 min): most of what was sent before is likely cached', warm);
  check(cold.cold && cold.why === 'expired' && cold.cached === 0 && cold.fresh === cold.tokens, 'expired (≥ 5 min): nothing from the cache, all at full price', cold);
  check(warm.tokens === cold.tokens, 'the token count is the same either way (the cache changes the price, not the count)');
  const edge = C.estimate({ ...base, now: st.lastAt + C.CACHE_TTL - 1 });
  check(!edge.cold && C.estimate({ ...base, now: st.lastAt + C.CACHE_TTL }).cold, 'the cache is warm until 5 minutes, cold at 5');
  const model = C.estimate({ ...base, pick: { changed: true, label: 'Sonnet · low' } });
  check(model.cold && model.why === 'model', 'Smart picking another model / effort: its own cache, so cold', model.why);
  const noSess = C.historyOf({ ...chat, session: {} });
  const ns = C.estimate({ ...base, history: noSess });
  check(ns.cold && ns.why === 'new' && noSess.kind === 'earlier' && noSess.tokens <= C.CONTEXT_CHARS / 4 + 40, 'no session: the earlier conversation is sent along once, capped at 24k characters, uncached', noSess);
  check(C.estimate({ ...base, history: C.historyOf(null), lastAt: 0 }).why === 'none', 'a new chat: no history, nothing to cache');
  const hit0 = C.estimate({ ...base, hit: 0 });
  check(hit0.cached === 0 && !hit0.cold, 'a chat whose cache never hits: warm but nothing cached');
}

// ---------- history after Continue lighter / a handoff ----------
{
  const chat = chatOf(10);
  const lighter = { ...chat, session: {}, compact: { summary: 'S'.repeat(2400), index: 21, tail: 16 }, messages: [...chat.messages, { role: 'assistant', text: 'S'.repeat(2400), compactSummary: true, at: NOW }] };
  const h = C.historyOf(lighter);
  check(h.kind === 'lighter' && !h.session && h.tokens > 4600 && h.tokens < 5000, 'after Continue lighter (no reply yet): the summary + the kept exchanges', h);
  const resumed = { ...lighter, session: { id: 'S2' }, messages: [...lighter.messages, { role: 'user', text: 'u'.repeat(400), at: NOW }, { role: 'assistant', text: 'a'.repeat(400), at: NOW, usage: { input: 3000, output: 100 } }] };
  const h2 = C.historyOf(resumed);
  check(h2.kind === 'lighter' && h2.session && h2.tokens > h.tokens && h2.tokens < h.tokens + 400, 'resumed after it: the lighter start + what came since', h2);
  const brief = { ...chat, session: {}, handoff: { brief: 'B'.repeat(4800), tokens: 1200, at: 20, to: 'Astra' } };
  const hb = C.historyOf(brief);
  check(hb.kind === 'brief' && hb.tokens >= 1200 && hb.tokens < 1700, 'handed over: the short brief (+ what was said since)', hb);
  const whole = { ...brief, handoff: { ...brief.handoff, whole: 'W'.repeat(152000) } };
  const hw = C.historyOf(whole);
  check(hw.kind === 'whole' && hw.tokens > 38000, 'handed over with the whole chat: the whole chat', hw);
}

// ---------- attachments ----------
{
  const base = { fixed: 1000, history: C.historyOf(null), words: 30, answer: 500, now: NOW };
  const lean = C.estimate({ ...base, attachments: [{ name: 'shot.png', kind: 'image', tokens: 1844, wholeTokens: 11060 }] });
  const whole = C.estimate({ ...base, attachments: [{ name: 'shot.png', kind: 'image', tokens: 1844, wholeTokens: 11060, whole: true }] });
  check(whole.tokens - lean.tokens === 11060 - 1844, 'a picture sent whole costs its full size, lean its 1568 px copy');
  const log = C.estimate({ ...base, attachments: [{ name: 'server.log', kind: 'text', tokens: 586, wholeTokens: 327000, whole: true }] });
  check(log.fresh >= C.BIG_FRESH && C.should(log, {}).show && C.should(log, {}).why === 'big', 'a whole 5 MB log: ≥ 30k at full price → the hint shows', log.fresh);
  const opt = C.cheaper(log, [{ id: 'attachment', names: ['server.log'], label: 'trim', tokens: C.variant(log, { id: 'attachment', names: ['server.log'] }) }]);
  check(opt && opt.tokens === log.tokens - (327000 - 586), 'the cheaper way: the log trimmed, saving exactly its whole − lean', opt);
}

// ---------- missions and Smart's effort ----------
{
  const chat = chatOf(4);
  const st = C.stats(chat);
  const base = { fixed: 1000, history: C.historyOf(chat), words: 40, answer: 500, now: NOW, lastAt: st.lastAt };
  const plain = C.estimate(base);
  const swarm = C.estimate({ ...base, mission: { id: 'swarm', label: '🐝 Swarm', tokens: 4400, replacesOwn: true } });
  check(swarm.tokens === 4400 && swarm.raw === 0 && swarm.cached === 0, 'a mission that runs other AIs: its estimate (swarmlean) instead of the chat\'s own reply', swarm);
  const lab = C.estimate({ ...base, mission: { id: 'lab-variations', label: '4 variations', tokens: 68000, replacesOwn: true } });
  check(C.should(lab, st).show, 'Lab variations (≈ 68k): the hint shows');
  const back = C.variant(lab, { id: 'mission' });
  check(near(back, plain.tokens, 0.001), 'without the mission: the plain message again', { back, plain: plain.tokens });
  const high = C.estimate({ ...base, effort: 'high', baseEffort: 'medium' });
  const low = C.estimate({ ...base, effort: 'low', baseEffort: 'medium' });
  check(high.answer === 750 && low.answer === 300 && high.tokens - plain.tokens === 250, 'Smart\'s effort scales the answer (high 1.5×, low 0.6× of the usual)', { h: high.answer, l: low.answer });
}

// ---------- when it shows ----------
{
  const chat = chatOf(8, { each: 800 }); // a small chat: ≈ 3k a message
  const st = C.stats(chat);
  const base = { fixed: 800, history: C.historyOf(chat), words: 10, answer: 600, now: NOW, lastAt: st.lastAt, hit: 0.9 };
  const small = C.estimate(base);
  check(!C.should(small, st).show, 'a small message in a small chat: no hint', { tokens: small.tokens, median: st.median });
  const pic = C.estimate({ ...base, attachments: [{ name: '4k.png', kind: 'image', tokens: 1844, wholeTokens: 11060, whole: true }] });
  const sp = C.should(pic, st);
  check(sp.show && sp.why === 'unusual' && sp.times >= 3, 'a 4K screenshot at full size in that chat: ≥ 3× the usual → the hint', { tokens: pic.tokens, median: st.median, sp });
  const one = C.estimate({ ...base, history: C.historyOf({ messages: chat.messages.slice(0, 2) }) });
  check(!C.should({ ...one, tokens: 7900, fresh: 7900 }, { n: 5, median: 1000 }).show, 'never under 8k, even at 3× a tiny chat');
  check(!C.should({ tokens: 20000, fresh: 20000 }, { n: 1, median: 2000 }).show, 'one reply is no "usual" yet (only the 30k rule)');
  const longChat = chatOf(30, { each: 4000, ago: 2 * MIN });
  const lst = C.stats(longChat);
  const hot = C.estimate({ fixed: 1000, history: C.historyOf(longChat), words: 20, answer: 600, now: NOW, lastAt: lst.lastAt, hit: 0.95 });
  check(hot.tokens > 55000 && !C.should(hot, lst).show, 'a long chat with a warm cache: big but usual and mostly cached → no hint', { t: hot.tokens, f: hot.fresh, m: lst.median });
  const cool = C.estimate({ fixed: 1000, history: C.historyOf(longChat), words: 20, answer: 600, now: NOW + 10 * MIN, lastAt: lst.lastAt, hit: 0.95 });
  check(C.should(cool, lst).show && C.should(cool, lst).why === 'big', 'the same chat 12 minutes later: the cache expired → ≥ 30k at full price → the hint', cool.fresh);
  const opt = C.cheaper(cool, [
    { id: 'lighter', label: 'Continue lighter first', tokens: C.variant(cool, { id: 'lighter', after: 4500 }), prefer: true },
    { id: 'newchat', label: 'Ask on a new chat', tokens: C.variant(cool, { id: 'newchat' }) },
  ]);
  check(opt?.id === 'lighter' && opt.tokens < 7000, 'its cheaper way: Continue lighter first (it keeps the thread), ≈ 6k', opt);
  const topic = C.cheaper(cool, [
    { id: 'lighter', tokens: C.variant(cool, { id: 'lighter', after: 4500 }) },
    { id: 'newchat', tokens: C.variant(cool, { id: 'newchat' }), prefer: true },
  ]);
  check(topic?.id === 'newchat', 'a new topic: Ask on a new chat instead', topic);
  check(C.cheaper(cool, [{ id: 'attachment', tokens: cool.tokens - 2000 }]) === null, 'a way that saves too little is never offered');
  const lossless = C.cheaper(pic, [{ id: 'attachment', tokens: C.variant(pic, { id: 'attachment', names: ['4k.png'] }) }, { id: 'newchat', tokens: C.variant(pic, { id: 'newchat' }) }]);
  check(lossless?.id === 'attachment', 'the picture at 1568 px wins over a new chat (it loses nothing)', lossless);
}

// ---------- calibration ----------
{
  let cal = { f: 1, n: 0 };
  cal = C.calibrate(cal, 5000, 10000, NOW);
  check(cal.n === 1 && near(cal.f, 2, 0.01), 'the first reply moves the factor all the way (2× real → 2)', cal);
  for (let i = 0; i < 6; i++) cal = C.calibrate(cal, 5000, 7500, NOW);
  check(cal.f > 1.5 && cal.f < 1.75 && cal.n === 7, 'then a running mean moves it toward what replies really cost', cal);
  const one = C.calibrate(cal, 5000, 500000, NOW);
  check(one.f <= 6 && one.f < cal.f * 2.5, 'one odd reply (a 100× tool marathon) moves it only so far; the factor stays within 0.3–6', one);
  check(C.calibrate(cal, 50, 9000).f === cal.f && C.calibrate(cal, 5000, 0).f === cal.f, 'no learning from a tiny estimate or no usage');
  const chat = chatOf(6);
  const st = C.stats(chat);
  const raw = C.estimate({ fixed: 1000, history: C.historyOf(chat), words: 30, answer: 500, now: NOW, lastAt: st.lastAt });
  const real = Math.round(raw.raw * 1.6);
  let c2 = { f: 1, n: 0 };
  const errBefore = Math.abs(raw.tokens - real);
  for (let i = 0; i < 4; i++) c2 = C.calibrate(c2, raw.raw, real, NOW);
  const after = C.estimate({ fixed: 1000, history: C.historyOf(chat), words: 30, answer: 500, now: NOW, lastAt: st.lastAt, factor: c2.f });
  check(Math.abs(after.tokens - real) < errBefore * 0.1, 'calibrated: the estimate lands near what the engine reported', { before: raw.tokens, after: after.tokens, real });
  check(after.raw === raw.raw && after.factor === c2.f, 'the raw part (what is learned against) does not include the factor');
  const swarm = C.estimate({ fixed: 1000, history: C.historyOf(chat), words: 30, answer: 500, now: NOW, factor: 3, mission: { id: 'swarm', tokens: 4400, replacesOwn: true } });
  check(swarm.tokens === 4400, 'the factor never scales a mission (other AIs, swarmlean\'s own estimate)');
}

// ---------- the store (datasafe: anything else is not ours) ----------
{
  check(C.valid({ v: 1, ai: {} }) && !C.valid(null) && !C.valid({ ai: {} }) && !C.valid({ v: 1, ai: 3 }), 'the store\'s shape: { v: 1, ai: { [agentId]: { f, n, at } } }');
  const s = { v: 1, ai: {} };
  for (let i = 0; i < 50; i++) s.ai[`a${i}`] = { f: 1, n: 1, at: i };
  C.trim(s);
  check(Object.keys(s.ai).length === 40 && s.ai.a49 && !s.ai.a0, 'kept small: the 40 most recently used AIs');
}

// ---------- in plain words ----------
{
  const chat = chatOf(30, { each: 4000, ago: 12 * MIN });
  const st = C.stats(chat);
  const est = C.estimate({ fixed: 1200, history: C.historyOf(chat), words: 30, answer: 600, now: NOW, lastAt: st.lastAt, factor: 1.2, attachments: [{ name: 'shot.png', kind: 'image', tokens: 1844, wholeTokens: 11060, whole: true }] });
  const rows = C.lines(est, st, { fixedFrom: 'audit', pick: 'Opus · high', calN: 5 });
  const text = rows.map((r) => `${r.k} ${r.v ?? ''} ${r.note || ''}`).join('\n');
  check(/Re-reading this chat/.test(text) && /the cache expired \(last message 12 min ago\)/.test(text), 'words: the chat re-read, the cache expired 12 min ago', text);
  check(/shot\.png .*whole, at full size/.test(text) && /Its answer .*Smart: Opus · high/.test(text) && /Where its tokens go/.test(text), 'words: the attachment at full size, Smart\'s pick, the fixed part measured', text);
  check(/Adjusted to this AI's real use \(× 1\.2\)/.test(text), 'words: the calibration', text);
  const head = C.headline(est, st);
  check(/^≈ \d+k tokens with this message, nearly all at full price/.test(head), 'the headline', head);
  check(C.fmt(52340) === '52k' && C.fmt(6040) === '6k' && C.fmt(1240) === '1.2k' && C.fmt(812) === '810' && C.fmt(40) === '40', 'numbers: 52k, 6k, 1.2k, 810, 40');
}

console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
