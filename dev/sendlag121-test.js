#!/usr/bin/env node
// (round 121, sendlag121) A reply's end never holds the main process: usage.json and kv/token-stats.json are handed to
// the store thread (store.js addUsage → mergeFile / tokenStat, storework.js), and what they hold afterwards is what the
// main-process way wrote, number for number. No Electron: the store's files are copied to a temp folder (store.js keeps
// its data next to itself: real data is never touched) and run with the thread on (HEARTH_STORE_THREAD=1).
//   1. 40 replies' numbers on a year-sized stats file (≈ 1 MB, made up): each addUsage call's own hold of the loop
//      (dev/loadwait.js stallWatch: the wait for a CPU taken out) under 8 ms; the files = the same replies added the
//      old way (tokenstats-core addAll on the file as it was; usage.json's counts)
//   2. the meter's read (getTokenStats, getTokenStatsText: as text from the thread) right after a reply: the reply is in it
//   3. quit (flushSync) with replies still queued / on the thread: each written once
//   4. a stats file that can't be read (garbled): not written over, noted in doubt; a missing one: not made here
//   5. sync writing the stats file (settle): a reply's numbers wait, then are added to what arrived
//   node dev/sendlag121-test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FILES = ['store.js', 'scenesafe-core.js', 'datasafe-core.js', 'storework.js', 'fswalk.js', 'sync-merge.js', 'sync-hard.js', 'kvops.js', 'crashsafe-core.js', 'tokenstats-core.js'];
if (process.argv[2] !== '--inside') {
  const dir = require('./tmp-own').mkdtemp('hearth-sendlag121-');
  for (const f of FILES) fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, f));
  fs.copyFileSync(__filename, path.join(dir, 't.js'));
  fs.copyFileSync(path.join(__dirname, 'loadwait.js'), path.join(dir, 'loadwait.js'));
  fs.copyFileSync(path.join(__dirname, 'perfguard-calib.js'), path.join(dir, 'perfguard-calib.js'));
  let code = 1;
  for (const part of ['main', 'quit']) {
    const r = spawnSync(process.execPath, [path.join(dir, 't.js'), '--inside', part], { cwd: dir, env: { ...process.env, HEARTH_STORE_THREAD: '1' }, stdio: 'inherit', timeout: 120000 });
    code = r.status ?? 1; if (code) break;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(code);
}

let passes = 0; let failures = 0;
const ok = (cond, what, extra) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}${extra === undefined ? '' : ` ${JSON.stringify(extra).slice(0, 400)}`}`); } };
const PART = process.argv[3];
const store = require(path.join(process.cwd(), 'store.js'));
const TS = require(path.join(process.cwd(), 'tokenstats-core.js'));
const LW = require(path.join(process.cwd(), 'loadwait.js'));
const KV = path.join(process.cwd(), 'data', 'kv');
const STATS = path.join(KV, 'token-stats.json');
const USAGE = path.join(process.cwd(), 'data', 'usage.json');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// a year of made-up numbers: 365 days, 4,000 chats (≈ 1 MB)
function bigStats() {
  const T = () => ({ i: 123456, o: 23456, c: 100000, w: 2000, r: 40, ms: 123456, tools: 12, cost: 1.234567 });
  const days = {};
  for (let i = 0; i < 365; i++) days[TS.dayKey(Date.now() - i * 864e5)] = { a: { claude: T(), astra: T() }, m: { 'model-a': T() }, t: { chat: T() }, h: { 3: 5000 } };
  const chats = {}; for (let i = 0; i < 4000; i++) chats[`claude-x${i}`] = { a: 'claude', model: 'model-a', last: 1, peak: 9, ctx: 8, ...T() };
  return { v: 1, since: 1, backfilledAt: 2, days, chats };
}
const reply = (i) => [i % 3 ? 'claude' : 'astra', { input: 1000 + i, output: 50 + i, cached: i % 2 ? 900 : 0, cost: 0.001 * i, contextInput: 4000 + i }, { chatId: `claude-x${i % 7}`, model: 'model-a', dock: '', ms: 1200 + i, tools: i % 4 }];
// the old way's answer: the replies added to the file as it was (the time each was added only picks its day / hour)
const expect = (before, list) => TS.addAll(JSON.parse(JSON.stringify(before)), list.map(([agentId, usage, meta]) => ({ agentId, usage, meta, at: Date.now() })));
const strip = (s) => { const o = JSON.parse(JSON.stringify(s)); for (const c of Object.values(o.chats)) delete c.last; return o; }; // (c.last: the moment itself)

(async () => {
  fs.mkdirSync(KV, { recursive: true });
  if (PART === 'main') {
    // ---------- 1. 40 replies on a year of stats ----------
    const before = bigStats();
    fs.writeFileSync(STATS, JSON.stringify(before));
    fs.writeFileSync(USAGE, JSON.stringify({ '2020-01-01': { claude: { input: 1, output: 1, replies: 1 } } }));
    await store.idle(); // (the thread started)
    const list = Array.from({ length: 40 }, (_, i) => reply(i));
    const holds = [];
    const cal = LW.calibMs(); const factor = LW.boxFactor(cal);
    for (const [i, r] of list.entries()) {
      const sw = LW.stallWatch({ every: 1 });
      const t0 = process.hrtime.bigint();
      store.addUsage(...r);
      const callMs = Number(process.hrtime.bigint() - t0) / 1e6;
      await wait(i % 5 === 4 ? 60 : 3); // (some together, some apart: batches of one and of several)
      const s = sw.stop();
      holds.push({ callMs: Math.round(callMs * 10) / 10, own: s.maxOwn, ms: s.maxMs });
    }
    await store.idle();
    const worst = holds.reduce((a, h) => (h.own > a.own ? h : a), holds[0]);
    const maxCall = Math.max(...holds.map((h) => h.callMs));
    const budget = 8 * factor;
    ok(maxCall < budget && worst.own < budget, `each reply's numbers hold the main process under ${Math.round(budget)} ms (own time; box ×${factor.toFixed(2)}): call ${maxCall} ms, loop ${worst.own} ms`, holds.slice(0, 8));
    const got = J(STATS); const want = expect(before, list);
    ok(JSON.stringify(strip(got)) === JSON.stringify(strip(want)), 'token stats: the same numbers as the main-process way, key for key');
    ok(Object.keys(got.days).length === Object.keys(want.days).length && Object.keys(got.chats).length === 4000, 'token stats: every day and chat kept');
    const u = J(USAGE); const day = TS.dayKey();
    const sum = (agent, k) => list.filter((r) => r[0] === agent).reduce((a, r) => a + (k === 'replies' ? 1 : r[1][k] || 0), 0);
    ok(u['2020-01-01']?.claude?.input === 1, 'usage.json: the old days kept');
    ok(['input', 'output', 'replies', 'cached'].every((k) => u[day]?.claude?.[k] === sum('claude', k) && u[day]?.astra?.[k] === sum('astra', k)), 'usage.json: today = the replies, each counted once', u[day]);
    ok(JSON.stringify(Object.keys(u[day].claude)) === JSON.stringify(['input', 'output', 'replies', 'cached']), 'usage.json: the same fields in the same order as before', Object.keys(u[day].claude));
    ok(!fs.readdirSync(KV).some((f) => /\.tmp$/.test(f)), 'no temp file left');

    // ---------- 2. the meter's read right after a reply ----------
    store.addUsage('claude', { input: 7, output: 7 }, { chatId: 'claude-meter' });
    const seenNow = await store.getTokenStats([]);
    ok(seenNow?.chats?.['claude-meter']?.i === 7, 'the meter right after a reply: the reply is in it');
    store.addUsage('claude', { input: 4, output: 4 }, { chatId: 'claude-meter' });
    const txt = await store.getTokenStatsText([]);
    ok(typeof txt === 'string' && JSON.parse(txt).chats['claude-meter'].i === 11 && txt === JSON.stringify(J(STATS)), 'the meter\'s read as text from the thread (parsed in the window): the file as it is, this reply in it');

    // ---------- 4. a garbled stats file: not written over, in doubt; a missing one: not made ----------
    fs.writeFileSync(STATS, '{"v":1,"days":{"2026-');
    store.addUsage('claude', { input: 5, output: 5 }, { chatId: 'claude-z' });
    await store.idle(); await wait(50);
    ok(fs.readFileSync(STATS, 'utf8') === '{"v":1,"days":{"2026-', 'a garbled stats file is not written over');
    ok(store.health().doubts.some((d) => /token-stats/.test(d.name)), 'a garbled stats file: noted in doubt', store.health().doubts);
    const tg = await store.getTokenStatsText([]);
    ok(typeof tg === 'object' && tg?.unreadable === true && fs.readFileSync(STATS, 'utf8') === '{"v":1,"days":{"2026-', 'the meter\'s read of a garbled file: "can\'t be read", never rebuilt over it', tg);
    fs.rmSync(STATS);
    store.addUsage('claude', { input: 5, output: 5 }, { chatId: 'claude-z' });
    await store.idle(); await wait(50);
    ok(!fs.existsSync(STATS), 'a missing stats file is not made here (the meter builds it from the chats)');

    // ---------- 5. sync writing the stats file: the reply waits, then adds to what arrived ----------
    const arrived = bigStats(); arrived.days['2020-02-02'] = { a: { claude: { i: 9, o: 9, r: 1 } }, m: {}, t: {}, h: {} };
    fs.writeFileSync(STATS, JSON.stringify(bigStats()));
    store.addUsage('claude', { input: 1, output: 1 }, { chatId: 'claude-a' }); await store.idle(); // (the thread keeps this version)
    const release = await store.settle(STATS);
    store.addUsage('claude', { input: 3, output: 3 }, { chatId: 'claude-s' });
    await wait(80);
    ok(!J(STATS).chats['claude-s'], 'while sync writes the stats file, a reply\'s numbers wait');
    fs.writeFileSync(STATS, JSON.stringify(arrived)); // (sync's write: the other computer's version)
    release();
    await store.getTokenStats([]);
    const after = J(STATS);
    ok(after.days['2020-02-02']?.a?.claude?.i === 9 && after.chats['claude-s']?.i === 3, 'after sync\'s write: the reply added to what arrived', { arrived: Boolean(after.days['2020-02-02']), s: after.chats['claude-s'] });
  } else {
    // ---------- 3. quit with replies queued and on the thread: each written once ----------
    const before = bigStats();
    fs.writeFileSync(STATS, JSON.stringify(before));
    await store.idle();
    const list = Array.from({ length: 6 }, (_, i) => reply(i));
    for (const r of list.slice(0, 3)) store.addUsage(...r);
    await new Promise((r) => setImmediate(r)); // (the first three handed to the thread)
    for (const r of list.slice(3)) store.addUsage(...r); // (these still queued)
    store.flushSync();
    const got = J(STATS); const want = expect(before, list);
    ok(JSON.stringify(strip(got)) === JSON.stringify(strip(want)), 'quit: every reply\'s numbers written, each once', { got: got.chats['claude-x0'], want: want.chats['claude-x0'] });
  }
  console.log(`sendlag121 ${PART}: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
