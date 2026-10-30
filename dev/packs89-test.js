#!/usr/bin/env node
// (round 89, packs89) "Send very long chats in pieces" (syncpack.js + syncpack-core.js, Phase 1 of bigsave88's plan):
// the REAL sync engine on two (or three) computers through dev/sync-sim.js (each computer its own view of the cloud
// drive, uploads in several ticks, downloads in pieces, offline computers), with the pack lane.
//   1. off = today: the setting off gives the very same cloud files and data folders as an engine without the lane,
//      no "packs" in the machine record, no Hearth/packs, nothing in data/sync/packbase
//   2. the numbers: a 20 MB chat, six replies: bytes uploaded per reply with packs vs today (the whole file each time)
//   3. mixed versions: the other computer is an older Hearth (no "packs" in its record): no pieces, the whole file as
//      today, nothing lost; an older Hearth joining mid-stream shuts the gate on both, and gets everything
//   4. the setting turned off mid-stream on one computer · 5. the gate closing (a record that can't be read)
//   6. slow / out-of-order pieces (manifests before their segments): waits, never shorter
//   7. a lost segment: waits (never a shorter chat), the writer puts it back, it arrives
//   8. both writing at once: everything kept, a field changed two ways → the newer wins, the other Kept aside
//   9. tidy: pieces no manifest names go to the pack trash (never deleted), 30 days; the chat still syncs
//  10. read failures: a garbled manifest / a zero-filled piece = wait; an unreadable lane state = lane shut, not
//      rewritten · 11. the store's files thread (storework.js syncPack) · 12. decide() / the gate · 13. a chat deleted
//      here is never made again by a piece
//   node dev/packs89-test.js [--only name,…] [--verbose] [--no-bench]
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const T = require('./sync72-test'); // (its world / computer / rounds, on sync-sim; it installs the simulator)
const Sim = require('./sync-sim');
const S = require('../sync-merge');
const P = require('../chatpack-core');
const C = require('../syncpack-core');
const { createPackLane } = require('../syncpack');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ONLY = arg('--only', '');
const VERBOSE = argv.includes('--verbose');
let failures = 0; let passes = 0;
const ok = (cond, what, detail) => { if (cond) { passes += 1; if (VERBOSE) console.log(`  ok ${what}`); } else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500)}` : ''}`); } };
const raw = Sim.raw;
const roots = new Set();

// ---------- made-up chats (fixed seeds; never real data) ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const WORDS = ['portal', 'shader', 'naïve', 'café', 'émoji 🎛️', 'quote"d', 'back\\slash', 'line\nbreak', '日本語', '**bold**', '`code`', 'ok', 'reverb', 'sidechain'];
function makeChat(id, n, seed = 1, size = 60) {
  const r = rng(seed); const at0 = 1.7e12 + seed * 1e6;
  const msgs = Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', at: at0 + i * 1000, text: Array.from({ length: 4 + Math.floor(r() * size) }, () => WORDS[Math.floor(r() * WORDS.length)]).join(' ') }));
  return { id, agentId: 'claude', title: `Long chat ${id}`, createdAt: at0, updatedAt: at0 + n * 1000, messages: msgs };
}
const CUT = { min: 16 * 1024, max: 64 * 1024, every: 8 }; // (small pieces: a 600 KB chat makes a few dozen)
const MINT = 100 * 1024; // (a "very long chat" for the small worlds)

// ---------- computers with the pack lane ----------
let worker = null; let wseq = 0; const wjobs = new Map(); const threadOps = {};
function runOffWorker(op, args) {
  if (!worker) {
    const { Worker } = require('worker_threads');
    worker = new Worker(path.join(__dirname, '..', 'storework.js'));
    worker.unref();
    worker.on('message', ({ id, res, err }) => { const j = wjobs.get(id); if (!j) return; wjobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(asBuf(res)); });
  }
  threadOps[args.kind || op] = (threadOps[args.kind || op] || 0) + 1;
  return new Promise((resolve, reject) => { const id = ++wseq; wjobs.set(id, { resolve, reject }); worker.postMessage({ ...args, op, id }); });
}
function asBuf(res) { if (res && typeof res === 'object') for (const k of Object.keys(res)) { const v = res[k]; if (v instanceof Uint8Array && !Buffer.isBuffer(v)) res[k] = Buffer.from(v.buffer, v.byteOffset, v.byteLength); } return res; }

function world(name, o) { const w = T.world(`packs89-${name}`, o); roots.add(path.dirname(w.dir)); return w; }
// o: T.computer's options + { lane: false (no lane at all: today / an older Hearth), on (the setting), min, quietMs, cut, thread }
function computer(w, name, o = {}) {
  const m = T.computer(w, name, o);
  m.e.stop();
  m.packsOn = o.on !== false;
  m.lane = o.lane === false ? null : createPackLane({ on: () => m.packsOn, min: o.min ?? MINT, quietMs: o.quietMs ?? 60000, now: m.now, cut: o.cut === undefined ? CUT : o.cut, runOff: o.thread ? runOffWorker : undefined, log: VERBOSE ? (...a) => console.log(`  ${name}:`, ...a) : undefined });
  m.e = m.make(m.lane ? { packs: m.lane } : {});
  m.counts = []; m.view.stats.upBy ||= {};
  return m;
}
const ID = 'giant';
const REL = `chats/${ID}.json`;
const n = (m) => { const c = m.json(REL); return c && Array.isArray(c.messages) ? c.messages.length : -1; };
const texts = (m) => (m.json(REL)?.messages || []).map((x) => x.text);
async function round(w, o) { await T.round(w, o); for (const m of w.ms) m.counts.push(n(m)); }
const never = (m) => m.counts.every((x, i) => i === 0 || x < 0 || m.counts[i - 1] < 0 || x >= m.counts[i - 1]);
async function rounds(w, k, o) { for (let i = 0; i < k; i++) await round(w, o); }
// both data folders the same and nothing waiting (rounds until then; → rounds or -1)
async function converge(w, max = 60) { for (let i = 1; i <= max; i++) { await round(w); if (i >= 2 && T.settled(w)) return i; } return -1; }
const up = (m) => ({ files: m.view.stats.upBy.files || 0, packs: m.view.stats.upBy.packs || 0, meta: m.view.stats.upBy['.sync'] || 0, all: m.view.stats.upBytes || 0 });
const cloudWhole = (m) => { try { return JSON.parse(raw.readFileSync(path.join(m.cloudRoot, 'Hearth', 'files', 'chats', `${ID}.json`), 'utf8')); } catch { return null; } };
const record = (m) => { try { return JSON.parse(raw.readFileSync(path.join(m.cloudRoot, 'Hearth', '.sync', 'machines', `${m.e.machine().id}.json`), 'utf8')); } catch { return null; } };
const packDir = (m) => path.join(m.cloudRoot, 'Hearth', 'packs', 'chats', ID);
const say = (m, text, at) => m.edit(REL, (c) => { c.messages.push({ role: 'user', at: at ?? m.now(), text }); c.updatedAt = at ?? m.now(); });
const fmt = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`);
// let the quiet time pass (the whole cloud file is written by the computer whose chat it is)
async function quiet(w, ms) { w.clock.advance(ms); await rounds(w, 4); }

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// ---------- 1. off = today ----------
scenario('off', async () => {
  const run = async (tag, lane) => {
    const w = world(`off-${tag}`);
    const pc = computer(w, 'PC', { platform: 'win32', lane, on: false });
    const mac = computer(w, 'Mac', { platform: 'darwin', lane, on: false });
    pc.write(REL, makeChat(ID, 400, 3));
    pc.write('notes/plan.md', '# Plan\n');
    const a = await converge(w);
    say(mac, 'from the Mac', 1.8e12); const b = await converge(w);
    pc.edit(REL, (c) => { c.title = 'Renamed on the PC'; }); const c = await converge(w);
    const files = {}; const dir = path.join(pc.cloudRoot, 'Hearth', 'files');
    const walk = (d, r) => { for (const e of raw.readdirSync(d, { withFileTypes: true })) { const rr = r ? `${r}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(d, e.name), rr); else files[rr] = Sim.sha(raw.readFileSync(path.join(d, e.name))); } };
    walk(dir, '');
    return { w, pc, mac, ok: a > 0 && b > 0 && c > 0, files, snap: T.differs(pc, mac), data: Sim.snapshot(pc.data, S, pc.e.ctx()) };
  };
  const today = await run('today', false); const off = await run('lane-off', undefined);
  ok(today.ok && off.ok, 'off: both runs converge', { today: today.ok, off: off.ok });
  ok(JSON.stringify(today.files) === JSON.stringify(off.files), 'off: the setting off writes the very same cloud files (names and bytes) as an engine without the lane', { today: Object.keys(today.files), off: Object.keys(off.files) });
  ok(JSON.stringify(today.data) === JSON.stringify(off.data), 'off: the very same data folder');
  ok([off.pc, off.mac].every((m) => record(m) && !('packs' in record(m))) && [today.pc, today.mac].every((m) => !('packs' in (record(m) || {}))), 'off: no "packs" in the machine records', [record(off.pc), record(off.mac)].map((r) => r && Object.keys(r)));
  ok(!raw.existsSync(path.join(off.pc.cloudRoot, 'Hearth', 'packs')) && !raw.existsSync(path.join(off.mac.cloudRoot, 'Hearth', 'packs')), 'off: no Hearth/packs folder in the cloud');
  ok(!raw.existsSync(path.join(off.pc.data, 'sync', 'packbase')) && !raw.existsSync(path.join(off.mac.data, 'sync', 'packbase')), 'off: nothing in data/sync/packbase');
  ok(off.pc.lane.status().published === 0 && off.pc.lane.status().gate.why === 'off', 'off: the lane did nothing (gate: off)', off.pc.lane.status());
  ok(Math.abs(up(today.pc).files - up(off.pc).files) === 0, 'off: the same bytes uploaded into files/', { today: up(today.pc), off: up(off.pc) });
});

// ---------- 2. the numbers: a 20 MB chat, six replies ----------
scenario('bench', async () => {
  if (argv.includes('--no-bench')) return;
  const big = makeChat(ID, 6000, 7, 820); // (≈ 21 MB on disk; made up)
  const text = JSON.stringify(big, null, 2);
  const res = {};
  for (const tag of ['today', 'packs']) {
    const w = world(`bench-${tag}`);
    const lane = tag === 'today' ? false : undefined;
    const pc = computer(w, 'PC', { platform: 'win32', lane, min: C.MIN, cut: null, quietMs: 120000 });
    const mac = computer(w, 'Mac', { platform: 'darwin', lane, min: C.MIN, cut: null, quietMs: 120000 });
    pc.write(REL, text);
    const first = await converge(w, 30);
    for (let i = 0; i < 10 && !(pc.view.idle() && mac.view.idle() && (tag === 'today' || pc.lane.status().published > 0)); i++) await round(w); // (the first build of the pack: once per chat)
    await rounds(w, 2);
    const u0 = { pc: up(pc), mac: up(mac) };
    const per = []; const t0 = Date.now();
    for (let i = 0; i < 6; i++) {
      const who = i % 2 ? mac : pc; const b = up(who);
      say(who, `reply ${i} from ${who.name} ${'x'.repeat(2000 + i * 300)}`, 1.9e12 + i);
      await rounds(w, 3);
      const a = up(who); per.push({ who: who.name, files: a.files - b.files, packs: a.packs - b.packs, meta: a.meta - b.meta });
    }
    const c6 = await converge(w, 30);
    const said = Array.from({ length: 6 }, (_, i) => `reply ${i} from ${i % 2 ? 'Mac' : 'PC'}`);
    const all = said.every((s) => texts(pc).some((t) => t.startsWith(s)) && texts(mac).some((t) => t.startsWith(s)));
    res[tag] = { size: Buffer.byteLength(text), first, c6, per, all, ms: Date.now() - t0, u0, w, pc, mac };
  }
  const t = res.today; const p = res.packs;
  const perT = t.per.map((x) => x.files + x.packs); const perP = p.per.map((x) => x.files + x.packs);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  console.log(`  bench: a ${fmt(t.size)} chat (6,000 made-up messages), six replies; bytes the replying computer's cloud folder uploads per reply:`);
  console.log(`    today:  ${perT.map(fmt).join(' · ')}  (avg ${fmt(avg(perT))})`);
  console.log(`    packs:  ${perP.map(fmt).join(' · ')}  (avg ${fmt(avg(perP))}; the whole file: ${p.per.map((x) => fmt(x.files)).join(' / ')}; .sync lines ≈ ${fmt(avg(p.per.map((x) => x.meta)))})`);
  ok(t.all && p.all && t.c6 > 0 && p.c6 > 0, 'bench: every reply reached the other computer, both ways, today and with packs', { t: t.c6, p: p.c6 });
  ok(avg(perT) > t.size * 0.9, 'bench: today each reply uploads the whole chat again', perT);
  ok(p.per.every((x) => x.files === 0), 'bench: with packs, no reply re-uploads the whole chat file (it waits for a quiet moment)', p.per);
  ok(avg(perP) < t.size / 10 && Math.max(...perP) < 5 * 1048576, 'bench: with packs, each reply uploads a small part (≥ 10× less on average, ≤ 5 MB each)', perP.map(fmt));
  // quiet: the whole cloud file is written once, by the computer whose chat it is; it equals the chat
  const before = { pc: up(p.pc).files, mac: up(p.mac).files };
  await quiet(p.w, 200000);
  const whole = cloudWhole(p.pc);
  ok(whole && whole.messages.length === p.pc.json(REL).messages.length && S.eq(whole, S.toCloud(p.pc.json(REL), p.pc.e.ctx())), 'bench: once the chat is quiet, the whole cloud file is written, the very chat (an older Hearth finds it whole)', whole && whole.messages.length);
  const wholeUp = (up(p.pc).files - before.pc) + (up(p.mac).files - before.mac);
  ok(wholeUp > 0 && wholeUp < t.size * 1.5, 'bench: …written once (one computer), not by both', { wholeUp: fmt(wholeUp) });
  console.log(`    quiet: the whole file once: ${fmt(wholeUp)}; the first build of the pack: ${fmt(p.u0.pc.packs + p.u0.mac.packs)} (once per chat); first sync in ${p.first} rounds (today ${t.first})`);
  res.packs.summary = { perToday: perT, perPacks: perP };
  global.BENCH = res; // (for the write-up)
  for (const r of [t, p]) for (const m of [r.pc, r.mac]) m.e.stop();
});

// ---------- 3. mixed versions ----------
scenario('mixed', async () => {
  // a) the other computer is an older Hearth: no pieces at all, the whole file as today
  {
    const w = world('mixed-old');
    const pc = computer(w, 'PC', { platform: 'win32' }); // the setting on
    const mac = computer(w, 'Mac', { platform: 'darwin', lane: false }); // an older Hearth (no lane: no "packs" in its record)
    pc.write(REL, makeChat(ID, 400, 4));
    ok(await converge(w) > 0, 'mixed: first sync with an older Hearth', T.why(w));
    for (let i = 0; i < 4; i++) { say(i % 2 ? mac : pc, `mixed ${i}`, 1.81e12 + i); await rounds(w, 2); }
    ok(await converge(w) > 0, 'mixed: converges', T.why(w));
    ok([pc, mac].every((m) => [0, 1, 2, 3].every((i) => texts(m).includes(`mixed ${i}`))), 'mixed: every message on both (the whole file, as today)');
    ok(!raw.existsSync(path.join(pc.cloudRoot, 'Hearth', 'packs')) && pc.lane.status().gate.why === 'older', 'mixed: the gate stays shut (the Mac\'s record has no "packs"): no pieces written at all', pc.lane.status().gate);
    ok(record(pc)?.packs === 1, 'mixed: the PC\'s record says it reads packs', record(pc));
    ok(never(pc) && never(mac), 'mixed: never shorter');
  }
  // b) both on, mid-stream; then an older Hearth joins: the gate shuts on both, it gets everything, its writes merge
  {
    const w = world('mixed-join');
    const pc = computer(w, 'PC', { platform: 'win32' }); const mac = computer(w, 'Mac', { platform: 'darwin' });
    pc.write(REL, makeChat(ID, 400, 5));
    ok(await converge(w) > 0, 'mixed-join: first sync', T.why(w));
    for (let i = 0; i < 4; i++) { say(i % 2 ? mac : pc, `before ${i}`, 1.82e12 + i); await rounds(w, 2); }
    ok(await converge(w) > 0 && pc.lane.status().published > 0 && mac.lane.status().took > 0, 'mixed-join: both on: the pieces carry the changes', { pc: pc.lane.status(), mac: mac.lane.status() });
    const stale = cloudWhole(pc);
    ok(stale && stale.messages.length < pc.json(REL).messages.length, 'mixed-join: (the whole cloud file lags, as planned: the chat is not quiet yet)', stale && stale.messages.length);
    say(pc, 'in flight when the old one joined', 1.83e12); await round(w);
    const old = computer(w, 'Old', { platform: 'darwin', lane: false });
    for (const m of w.ms) m.counts = [];
    ok(await converge(w, 80) > 0, 'mixed-join: converges with the older Hearth', T.why(w));
    ok(pc.lane.status().gate.ok === false && mac.lane.status().gate.ok === false, 'mixed-join: its record (no "packs") shuts the gate on both', [pc.lane.status().gate, mac.lane.status().gate]);
    const want = ['before 0', 'before 1', 'before 2', 'before 3', 'in flight when the old one joined'];
    ok(want.every((t) => texts(old).includes(t)), 'mixed-join: the older Hearth gets every message (the whole file, written when the gate shut)', texts(old).slice(-6));
    say(old, 'from the older Hearth', 1.84e12);
    ok(await converge(w, 80) > 0, 'mixed-join: its write converges', T.why(w));
    ok(w.ms.every((m) => [...want, 'from the older Hearth'].every((t) => texts(m).includes(t))), 'mixed-join: nothing lost on any of the three');
    ok(w.ms.every((m) => !texts(m).some((t, i, a) => a.indexOf(t) !== i && /before|flight|older/.test(t))), 'mixed-join: nothing doubled');
    ok(w.ms.every(never), 'mixed-join: never shorter on any computer', w.ms.map((m) => m.counts.slice(-12)));
  }
});

// ---------- 4. the setting turned off mid-stream ----------
scenario('turnoff', async () => {
  const w = world('turnoff');
  const pc = computer(w, 'PC', { platform: 'win32' }); const mac = computer(w, 'Mac', { platform: 'darwin' });
  pc.write(REL, makeChat(ID, 400, 6));
  ok(await converge(w) > 0, 'turnoff: first sync', T.why(w));
  for (let i = 0; i < 3; i++) { say(pc, `on ${i}`, 1.85e12 + i); await rounds(w, 2); }
  say(pc, 'sent just before', 1.86e12); pc.view.tick(); await T.pass(pc); // (published; the Mac hasn't taken it)
  mac.packsOn = false; // Settings › Sync, unticked on the Mac
  const tookBefore = mac.lane.status().took;
  say(mac, 'after off, from the Mac', 1.87e12);
  ok(await converge(w, 60) > 0, 'turnoff: converges', T.why(w));
  ok(!('packs' in (record(mac) || { packs: 1 })), 'turnoff: the Mac\'s record no longer says "packs" (rewritten at once)', record(mac));
  ok(pc.lane.status().gate.ok === false, 'turnoff: the PC\'s gate shuts', pc.lane.status().gate);
  ok(mac.lane.status().took === tookBefore && mac.lane.status().gate.why === 'off', 'turnoff: the Mac\'s lane does nothing any more', mac.lane.status());
  ok([pc, mac].every((m) => ['on 0', 'on 1', 'on 2', 'sent just before', 'after off, from the Mac'].every((t) => texts(m).includes(t))), 'turnoff: nothing lost (what was in flight came as the whole file)');
  ok(never(pc) && never(mac), 'turnoff: never shorter');
  // on again on the Mac: packs resume
  mac.packsOn = true; const pub = pc.lane.status().published;
  say(pc, 'on again', 1.88e12);
  ok(await converge(w, 60) > 0 && texts(mac).includes('on again') && pc.lane.status().gate.ok && pc.lane.status().published > pub, 'turnoff: on again: the gate opens, pieces again', pc.lane.status());
});

// ---------- 5. the gate closing: a record that can't be read ----------
scenario('gate', async () => {
  const w = world('gate');
  const pc = computer(w, 'PC', { platform: 'win32' }); const mac = computer(w, 'Mac', { platform: 'darwin' });
  pc.write(REL, makeChat(ID, 400, 8));
  ok(await converge(w) > 0, 'gate: first sync', T.why(w));
  say(pc, 'g0', 1.89e12); ok(await converge(w) > 0 && pc.lane.status().gate.ok, 'gate: open with both on');
  const ghost = path.join(pc.cloudRoot, 'Hearth', '.sync', 'machines', 'ghost-0badf00d.json');
  raw.mkdirSync(path.dirname(ghost), { recursive: true }); raw.writeFileSync(ghost, '{"id":"ghost-0badf00d","na'); // (cut: a record being written)
  const filesBefore = up(pc).files;
  say(pc, 'g1 while a record is unreadable', 1.9e12);
  ok(await converge(w) > 0, 'gate: converges', T.why(w));
  ok(pc.lane.status().gate.why === 'unreadable' && mac.lane.status().gate.ok === false, 'gate: a record that can\'t be read shuts it (never "no such computer")', [pc.lane.status().gate, mac.lane.status().gate]);
  ok(up(pc).files > filesBefore && texts(mac).includes('g1 while a record is unreadable'), 'gate: shut: the whole file went, the change arrived as today');
  raw.rmSync(ghost, { force: true });
  await rounds(w, 2);
  const pub = pc.lane.status().published;
  say(pc, 'g2 open again', 1.91e12);
  ok(await converge(w) > 0 && pc.lane.status().gate.ok && pc.lane.status().published > pub && texts(mac).includes('g2 open again'), 'gate: open again once the record is gone', pc.lane.status());
});

// ---------- 6. slow / out-of-order pieces ----------
scenario('slow', async () => {
  const w = world('slow');
  const pc = computer(w, 'PC', { platform: 'win32', slowUp: 8 * 1024, upTicks: 4 });
  const mac = computer(w, 'Mac', { platform: 'darwin', slowUp: 8 * 1024, upTicks: 3, partialDown: 8 * 1024, downTicks: 3, style: 'dropbox' });
  pc.write(REL, makeChat(ID, 400, 9));
  ok(await converge(w, 80) > 0, 'slow: first sync', T.why(w));
  const said = []; let waits = 0;
  for (let i = 0; i < 8; i++) {
    const who = i % 3 === 2 ? mac : pc; const t = `slow ${i} ${who.name} ${'y'.repeat(9000 + i * 1000)}`; said.push(t.slice(0, 12));
    say(who, t, 1.92e12 + i);
    for (let j = 0; j < 3; j++) { await round(w); waits += [pc, mac].filter((m) => (m.last?.waiting || []).some((x) => x.why === 'pieces')).length; }
  }
  ok(await converge(w, 120) > 0, 'slow: converges', T.why(w));
  ok(waits > 0, 'slow: manifests did arrive before their pieces (and waited: "pieces" in the waiting list)', { waits });
  ok([pc, mac].every((m) => said.every((s) => texts(m).some((t) => t.startsWith(s)))), 'slow: every message on both');
  ok(never(pc) && never(mac), 'slow: never shorter while pieces were on their way', { pc: pc.counts.slice(-20), mac: mac.counts.slice(-20) });
});

// ---------- 7. a lost segment ----------
scenario('lost', async () => {
  const w = world('lost');
  const pc = computer(w, 'PC', { platform: 'win32', quietMs: 3600e3 }); const mac = computer(w, 'Mac', { platform: 'darwin', quietMs: 3600e3 });
  pc.write(REL, makeChat(ID, 400, 10));
  ok(await converge(w) > 0, 'lost: first sync', T.why(w));
  const before = n(mac);
  pc.edit(REL, (c) => { for (let i = 0; i < 30; i++) c.messages.push({ role: 'user', at: 1.93e12 + i, text: `burst ${i} ${'z'.repeat(3000)}` }); });
  await T.pass(pc); pc.view.tick();
  const mine = P.manifests(fs, packDir(pc)).find((x) => x.by === P.safeBy(pc.e.machine().id))?.m;
  const tail = mine?.segs.at(-1)?.h;
  for (const [k] of w.cloud.server) if (tail && k.includes(tail)) w.cloud.server.delete(k); // (the provider loses it)
  let sawWait = false;
  for (let i = 0; i < 6; i++) { await round(w); sawWait ||= (mac.last?.waiting || []).some((x) => x.rel === REL && x.why === 'pieces'); }
  ok(tail && !texts(mac).some((t) => t.startsWith('burst 29')) && n(mac) === before && sawWait, 'lost: a piece that never arrives: the Mac waits ("pieces"), its chat as it was', { n: n(mac), before, sawWait });
  ok(never(mac), 'lost: never shorter while it waits');
  // the PC looks at its own pieces now and then (10 min): the missing one is written again, then it arrives
  w.clock.advance(11 * 60000);
  ok(await converge(w, 40) > 0 && texts(mac).some((t) => t.startsWith('burst 29')), 'lost: the writer puts the piece back; the chat arrives whole', T.why(w));
  ok(never(mac), 'lost: never shorter');
});

// ---------- 8. both writing at once (Kept aside) ----------
scenario('both', async () => {
  const w = world('both');
  const pc = computer(w, 'PC', { platform: 'win32' }); const mac = computer(w, 'Mac', { platform: 'darwin' });
  pc.write(REL, makeChat(ID, 500, 11));
  ok(await converge(w) > 0, 'both: first sync', T.why(w));
  pc.view.online = false; mac.view.online = false; pc.offline = false; mac.offline = false;
  pc.edit(REL, (c) => { c.messages.push({ role: 'user', at: 1.94e12 + 1, text: 'PC offline 1' }); c.messages[5].reaction = '👍'; c.title = 'PC title'; c.updatedAt = 1.94e12 + 10; });
  mac.edit(REL, (c) => { c.messages.push({ role: 'user', at: 1.94e12 + 2, text: 'Mac offline 1' }); c.messages[400].pinned = true; c.title = 'Mac title'; c.updatedAt = 1.94e12 + 5; });
  await rounds(w, 2);
  pc.edit(REL, (c) => { c.messages.push({ role: 'assistant', at: 1.94e12 + 3, text: 'PC offline 2' }); });
  mac.edit(REL, (c) => { c.messages.push({ role: 'assistant', at: 1.94e12 + 4, text: 'Mac offline 2' }); });
  await rounds(w, 2);
  pc.view.online = true; mac.view.online = true;
  ok(await converge(w, 80) > 0, 'both: converges', T.why(w));
  const c = pc.json(REL);
  ok(['PC offline 1', 'PC offline 2', 'Mac offline 1', 'Mac offline 2'].every((t) => texts(pc).includes(t) && texts(mac).includes(t)), 'both: every new message from both sides on both', texts(pc).slice(-5));
  ok(c.messages[5].reaction === '👍' && c.messages[400].pinned === true, 'both: a reaction (PC) and a pin (Mac) on old messages both kept');
  ok(!texts(pc).filter((t, i, a) => a.indexOf(t) !== i && /offline/.test(t)).length, 'both: nothing doubled');
  ok(c.title === 'PC title' && mac.json(REL).title === 'PC title', 'both: the title changed two ways: the newer chat wins (the PC\'s), the same on both', [c.title, mac.json(REL).title]);
  const notes = [...pc.e.status().aside, ...mac.e.status().aside].filter((x) => x.rel === REL);
  const file = (m, t) => path.join(m.data, 'sync', 'trash', String(t).replace(/^here:/, ''));
  const kept = notes.find((x) => x.side === 'ours' || x.side === 'theirs');
  const where = kept && [pc, mac].find((m) => raw.existsSync(file(m, kept.trash)));
  ok(kept && where && JSON.parse(raw.readFileSync(file(where, kept.trash), 'utf8')).title === 'Mac title', 'both: the losing side\'s whole version is Kept aside (Deleted files, with its note in the sync panel)', notes);
  const cmp = kept && await where.e.aside(kept.id, 'compare');
  ok(cmp?.ok && cmp.kept?.title === 'Mac title' && cmp.now?.title === 'PC title', 'both: Compare shows both versions (the Kept aside flow)', cmp && { kept: cmp.kept?.title, now: cmp.now?.title });
  ok(never(pc) && never(mac), 'both: never shorter');
});

// ---------- 9. tidy ----------
scenario('tidy', async () => {
  const w = world('tidy');
  const pc = computer(w, 'PC', { platform: 'win32' }); const mac = computer(w, 'Mac', { platform: 'darwin' });
  pc.write(REL, makeChat(ID, 400, 12));
  ok(await converge(w) > 0, 'tidy: first sync', T.why(w));
  for (let i = 0; i < 10; i++) { say(i % 2 ? mac : pc, `t${i} ${'w'.repeat(20000)}`, 1.95e12 + i); await rounds(w, 2); }
  ok(await converge(w) > 0, 'tidy: converges', T.why(w));
  const segsIn = (d) => { try { return raw.readdirSync(d).filter((f) => f.endsWith('.seg')); } catch { return []; } };
  const before = segsIn(packDir(pc)).length;
  let moved = 0;
  for (const m of [pc, mac]) {
    const r = C.tidy(fs, { dirs: [packDir(m), path.join(m.data, 'sync', 'packbase', ID)], grace: 0, now: m.now(), trash: path.join(m.data, 'sync', 'packtrash') });
    moved += r.moved;
  }
  const trashSegs = (m) => { let k = 0; const walk = (d) => { let es = []; try { es = raw.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) walk(path.join(d, e.name)); else if (e.name.endsWith('.seg')) k += 1; } }; walk(path.join(m.data, 'sync', 'packtrash')); return k; };
  ok(moved > 0 && trashSegs(pc) + trashSegs(mac) === moved, 'tidy: pieces no manifest names are MOVED to the pack trash (never deleted)', { moved, pc: trashSegs(pc), mac: trashSegs(mac), before });
  for (const m of [pc, mac]) for (const x of P.manifests(fs, packDir(m))) if (x.m) ok((() => { try { P.read(fs, packDir(m), x.m); return true; } catch { return false; } })(), `tidy: every manifest still reads whole (${m.name}'s view, ${x.by})`);
  say(pc, 'after tidy', 1.96e12);
  ok(await converge(w) > 0 && texts(mac).includes('after tidy'), 'tidy: a new message still arrives', T.why(w));
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const kept29 = C.tidy(fs, { dirs: [], now: mac.now() + 29 * 864e5, trash: path.join(mac.data, 'sync', 'packtrash') }).purged;
  const purged = C.tidy(fs, { dirs: [], now: pc.now() + 31 * 864e5, trash: path.join(pc.data, 'sync', 'packtrash') }).purged;
  ok(purged >= 1 && kept29 === 0 && trashSegs(pc) === 0, 'tidy: the pack trash keeps 30 days', { purged, kept29, today: day(pc.now()) });
  ok(never(pc) && never(mac), 'tidy: never shorter');
});

// ---------- 10. read failures ----------
scenario('failures', async () => {
  const w = world('failures');
  const pc = computer(w, 'PC', { platform: 'win32', quietMs: 3600e3 }); const mac = computer(w, 'Mac', { platform: 'darwin', quietMs: 3600e3 });
  pc.write(REL, makeChat(ID, 400, 13));
  ok(await converge(w) > 0, 'failures: first sync', T.why(w));
  // a) the PC's manifest garbled on the way (the Mac's view): wait, the chat as it was
  say(pc, 'f1', 1.97e12); await T.pass(pc); pc.view.tick(); mac.view.tick();
  const mf = path.join(packDir(mac), P.manifestName(pc.e.machine().id));
  const good = raw.readFileSync(mf);
  const cut = good.subarray(0, Math.floor(good.length / 2)); raw.writeFileSync(mf, cut);
  const nb = n(mac); const r1 = await T.pass(mac);
  ok(n(mac) === nb && !texts(mac).includes('f1') && (r1.waiting || []).some((x) => x.rel === REL && x.why === 'pieces'), 'failures: a cut manifest: "waiting", the chat as it was (never shorter, never empty)', r1.waiting);
  raw.writeFileSync(mf, good);
  // b) a piece that is a placeholder of zeros (same size): wait
  const m2 = P.readManifest(fs, mf); const seg = path.join(packDir(mac), `${m2.segs.at(-1).h}.seg`);
  const sb = raw.readFileSync(seg); raw.writeFileSync(seg, Buffer.alloc(sb.length));
  const r2 = await T.pass(mac);
  ok(!texts(mac).includes('f1') && n(mac) === nb && (r2.waiting || []).some((x) => x.why === 'pieces'), 'failures: a zero-filled piece (a placeholder): waiting, never taken', r2.waiting);
  raw.writeFileSync(seg, sb);
  await T.pass(mac);
  ok(texts(mac).includes('f1'), 'failures: once the pieces are whole, it is taken');
  // c) the lane's own state unreadable: the lane shuts (the whole file as today), the file is never rewritten
  const sf = path.join(mac.data, 'sync', 'packbase', 'state.json');
  raw.writeFileSync(sf, '{"v":1,"chats":{"gi'); const t0 = raw.statSync(sf).mtimeMs;
  mac.e.stop(); mac.lane = createPackLane({ on: () => true, min: MINT, quietMs: 3600e3, now: mac.now, cut: CUT }); mac.e = mac.make({ packs: mac.lane });
  say(mac, 'f2 with the state unreadable', 1.98e12);
  ok(await converge(w) > 0 && texts(pc).includes('f2 with the state unreadable'), 'failures: an unreadable lane state: everything still syncs (the whole file, as today)', T.why(w));
  ok(mac.lane.status().gate.why === 'state' && raw.readFileSync(sf, 'utf8') === '{"v":1,"chats":{"gi' && raw.statSync(sf).mtimeMs === t0, 'failures: …the lane stays shut and never writes over its unreadable state', mac.lane.status().gate);
});

// ---------- 11. the store's files thread ----------
scenario('thread', async () => {
  const w = world('thread');
  const pc = computer(w, 'PC', { platform: 'win32', thread: true }); const mac = computer(w, 'Mac', { platform: 'darwin', thread: true });
  pc.write(REL, makeChat(ID, 500, 14));
  ok(await converge(w) > 0, 'thread: first sync', T.why(w));
  for (let i = 0; i < 4; i++) { say(i % 2 ? mac : pc, `th ${i}`, 1.99e12 + i); await rounds(w, 2); }
  ok(await converge(w) > 0 && [0, 1, 2, 3].every((i) => texts(pc).includes(`th ${i}`) && texts(mac).includes(`th ${i}`)), 'thread: publish and take on the files thread (storework.js syncPack): every message on both', T.why(w));
  ok(threadOps.publish > 0 && threadOps.take > 0, 'thread: the byte work ran there', threadOps);
});

// ---------- 12. decide() and the gate ----------
scenario('decide', async () => {
  const h = (c) => c.repeat(40);
  const base = { hasL: true, hasC: true, size: 20e6, min: 16e6, quietMs: 1000, known: new Set(), arriving: new Set() };
  const d = (x) => C.decide({ ...base, ...x });
  ok(d({ size: 1e6, lh: h('a'), ch: h('b'), bh: h('b') }) === null, 'decide: a chat under the line: as today');
  ok(d({ lh: h('a'), ch: h('a'), bh: h('b') }) === null, 'decide: the same here and there: as today (the engine takes it as the base)');
  ok(d({ lh: h('b'), ch: h('a'), bh: h('b') }) === null, 'decide: only the cloud\'s whole file changed: as today (brought here)');
  ok(d({ lh: h('a'), ch: h('b'), bh: h('b'), quiet: 10, author: true })?.hold === 'later', 'decide: changed here, not quiet: held (the pieces carry it)');
  ok(d({ lh: h('a'), ch: h('b'), bh: h('b'), quiet: 5000, author: true }) === null, 'decide: changed here and quiet: the whole file goes (this computer\'s own chat)');
  ok(d({ lh: h('a'), ch: h('b'), bh: h('b'), quiet: 5000, author: false })?.hold === 'later', 'decide: quiet, but a copy of the other computer\'s: held (that one writes it)');
  ok(d({ lh: h('a'), ch: h('b'), bh: h('b'), quiet: 1500, author: false, known: new Set([h('a')]) })?.hold === 'later', 'decide: …until 4× the quiet time');
  ok(d({ lh: h('a'), ch: h('b'), bh: h('b'), quiet: 4001, author: false, known: new Set([h('a')]) }) === null, 'decide: …then either writes it');
  ok(d({ lh: h('a'), ch: h('c'), bh: h('b'), known: new Set([h('c')]) })?.adopt === h('c'), 'decide: both changed, the cloud\'s is a version taken in here: adopted as the base');
  ok(d({ lh: h('a'), ch: h('c'), bh: h('b'), arriving: new Set([h('c')]) })?.hold === 'pieces', 'decide: both changed, its pieces on the way: waits for them');
  ok(d({ lh: h('a'), ch: h('c'), bh: h('b') }) === null, 'decide: both changed, a whole file nobody published as pieces (an older Hearth): the engine merges, as today');
  ok(d({ lh: 'inflight', ch: h('c'), bh: h('b') }) === null && d({ lh: h('a'), ch: 'unknown', bh: h('b') }) === null, 'decide: a hash not known yet: as today (the engine\'s own waits)');
  ok(d({ hasC: false, lh: h('a'), ch: null, bh: h('a') }) === null, 'decide: gone from the cloud with a base: the engine\'s delete rules, as today');
  ok(!C.gate([], true).ok && !C.gate([{ packs: 1 }], false).ok && C.gate([{ packs: 1 }], true).ok && !C.gate([{ packs: 1 }, { name: 'Old', format: 74 }], true).ok && !C.gate([{ error: 'bad' }], true).ok, 'gate: on here AND every other computer reads packs (none / older / unreadable: shut)');
  // the records: a cloud client's conflict copy is not a computer; one being written is "unreadable"
  const dir = path.join(path.dirname([...roots][0] || require('os').tmpdir()), `packs89-rec-${process.pid}`);
  raw.mkdirSync(dir, { recursive: true });
  raw.writeFileSync(path.join(dir, 'pc-1.json'), JSON.stringify({ id: 'pc-1', packs: 1 })); raw.writeFileSync(path.join(dir, 'mac-2.json'), JSON.stringify({ id: 'mac-2', packs: 1 }));
  raw.writeFileSync(path.join(dir, 'mac-2 2.json'), JSON.stringify({ id: 'mac-2' }));
  const r1 = C.readRecords(fs, dir, 'pc-1');
  raw.writeFileSync(path.join(dir, 'x-3.json'), '{"id":');
  const r2 = C.readRecords(fs, dir, 'pc-1');
  raw.rmSync(dir, { recursive: true, force: true });
  ok(r1.length === 1 && r1[0].id === 'mac-2' && C.gate(r1, true).ok && !C.gate(r2, true).ok, 'gate: records read (this computer and copies left out; a cut one shuts it)', { r1, r2 });
});

// ---------- 13. a chat deleted here is never made again by a piece ----------
scenario('deleted', async () => {
  const w = world('deleted');
  const pc = computer(w, 'PC', { platform: 'win32' }); const mac = computer(w, 'Mac', { platform: 'darwin' });
  pc.write(REL, makeChat(ID, 400, 15));
  ok(await converge(w) > 0, 'deleted: first sync', T.why(w));
  mac.view.online = false;
  pc.deleteChat(ID);
  await rounds(w, 2);
  mac.view.online = true;
  ok(await converge(w) > 0 && !pc.has(REL) && !mac.has(REL), 'deleted: a chat deleted on the PC stays deleted on both (no piece makes it again)', { pc: pc.has(REL), mac: mac.has(REL) });
  ok(mac.has(`trash/${ID}.json`), 'deleted: it waits in the trash');
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.split(',').includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  console.log(`\npacks89: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  if (!argv.includes('--keep')) for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* fine */ } }
  if (worker) worker.terminate();
  process.exit(failures ? 1 : 0);
}
if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });
module.exports = { world, computer, round, rounds, converge, say, texts, n, up, cloudWhole, record, packDir, makeChat, REL, ID, MINT, CUT };
