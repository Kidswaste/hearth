#!/usr/bin/env node
// (round 75, syncstate75) Sync's own state kept in pieces (sync-state.js), proven crash-safe with the simulator's fault
// hook (dev/sync-sim.js T.hook: any fs call of the process can be made to fail). A "crash" here: from the k-th disk call
// in the state folder on, every call there fails (the process is dead to that folder); then a NEW store / engine reads
// the folder, as the app does after a restart.
//   crash      a save cut at EVERY one of its disk calls (changed / new / deleted files, the small part): what is read
//              afterwards is exactly the state before the save or exactly the new one, never a mix, never damaged;
//              nothing a cut save left behind stays (pieces no index names, temp files)
//   full       the same for a save that rewrites every piece (a new drive / a replaced map), and its tidy
//   migrate    the old single state.json: read, written in pieces, kept as state.json.prev; cut at every disk call it is
//              read again whole; an older Hearth that ran meanwhile (its newer state.json) is taken again
//   engine     through the two-computer simulator: the PC's first sync (400 files) and the Mac's join cut at several
//              points of their state saves, a restart, then edits / deletes on both: everything converges, nothing lost
//   steady     a pass with nothing changed writes nothing; one changed file writes one piece (+ the index)
//   held       the index held by another program (Windows): the pass waits ("held"), nothing written over it
//   two        two engines on one folder (sync switched off and on while a pass ends): every piece the index names is there
//   usage      the usage merge (store.js mergeKV) on the store thread: same file as before, sync's guard honoured
// Never touches real data: temp folders.
//   node dev/syncstate75-test.js [--only name,name] [--keep]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
const Sim = require('./sync-sim');
const SState = require('../sync-state');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500)}` : ''}`); } };
const raw = Sim.raw;
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-syncstate75-'));
Sim.install();
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// ---------- helpers ----------
const MAPS = SState.MAPS;
// a state's content, order-free (what a load gives back must be this, exactly)
function canon(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (MAPS.includes(k)) out[k] = Object.keys(v).sort().map((r) => [r, v[r]]);
    else out[k] = v;
  }
  return JSON.stringify(Object.keys(out).sort().map((k) => [k, out[k]]));
}
function makeState(cloudRoot, n, tag = 'a') {
  const s = { v: 1, cloudRoot, base: {}, local: {}, cloud: {}, prev: {}, keepAll: {}, freed: {}, own: {} /* (round 96, checkfix96) */, ext: { 'renders/x.mp4': '/v/x.mp4' }, lastPass: 1, lastOk: 1, purgedAt: 0 };
  for (let i = 0; i < n; i++) {
    const rel = i % 3 ? `workspace/p${i % 7}/f${i}.txt` : `chats/claude-${i}.json`;
    s.base[rel] = `${tag}${i}`; s.local[rel] = [i, 1000 + i, `${tag}${i}`]; s.cloud[rel] = [i, 2000 + i, `${tag}${i}`, 0];
    if (i % 50 === 0) s.prev[rel] = `old${i}`;
    if (i % 97 === 0) s.keepAll[rel] = 1;
    if (i % 113 === 0) s.freed[rel] = 1;
    if (i % 61 === 0) s.own[rel] = 1; // (round 96, checkfix96) a base this computer uploaded itself
  }
  return s;
}
const inDir = (dir, p) => typeof p === 'string' && (path.resolve(p) === dir || path.resolve(p).startsWith(dir + path.sep));
// from the k-th disk call under dir on, every call there fails (k = Infinity: none; counts them)
function crashAfter(dir, k) {
  const c = { n: 0, dead: false };
  const d = path.resolve(dir);
  Sim.T.hook = (op, p, p2) => {
    if (!inDir(d, p) && !inDir(d, p2)) return null;
    if (c.dead) return 'EIO';
    c.n += 1;
    if (c.n >= k) { c.dead = true; return 'EIO'; }
    return null;
  };
  return c;
}
const nolog = () => {};
const storeOf = (dir, cloudRoot, buckets) => SState.createStateStore({ dir, cloudRoot, log: nolog, buckets, fresh: () => ({ v: 1, cloudRoot, base: {}, local: {}, cloud: {}, ext: {}, lastPass: 0, lastOk: 0, purgedAt: 0 }) });
function copyDir(a, b) { raw.rmSync(b, { recursive: true, force: true }); fs.cpSync(a, b, { recursive: true }); }
const listState = (dir) => { try { return raw.readdirSync(path.join(dir, 'state')).sort(); } catch { return []; } };
// the state folder holds the index and exactly the pieces it names (nothing a cut save left)
function tidyOk(dir) {
  const names = listState(dir);
  let ix; try { ix = JSON.parse(raw.readFileSync(path.join(dir, 'state', 'index.json'), 'utf8')); } catch { return { ok: !names.length, why: 'no index', names }; } // (the old single file still the state: nothing else there)
  const want = new Set(['index.json', ...Object.values(ix.parts)]);
  const extra = names.filter((n) => !want.has(n)); const missing = [...want].filter((n) => !names.includes(n));
  return { ok: !extra.length && !missing.length, extra, missing };
}
const store = (dir, cloudRoot) => storeOf(dir, cloudRoot);
// mutate a loaded (watched) state into "B": changes, deletes, adds, the small part
function toB(s) {
  let i = 0;
  for (const rel of Object.keys(s.base)) {
    i += 1;
    if (i % 89 === 0) { delete s.base[rel]; delete s.local[rel]; delete s.cloud[rel]; delete s.prev[rel]; }
    else if (i % 97 === 0) { s.prev[rel] = s.base[rel]; s.base[rel] = `b${i}`; s.local[rel] = [1, 2, `b${i}`]; }
  }
  for (let j = 0; j < 12; j++) { const rel = `attachments/new-${j}.png`; s.base[rel] = `n${j}`; s.local[rel] = [j, j, `n${j}`]; s.cloud[rel] = [j, j, `n${j}`, 1]; }
  s.keepAll['chats/claude-0.json'] = 1; delete s.freed['chats/claude-0.json'];
  s.lastOk = 99; s.ext = { 'renders/y.mp4': '/v/y.mp4' };
}

// ---------- 1. a save cut at every disk call ----------
async function cutEverywhere(label, { n, mutate, legacy = false, buckets }) {
  const store = (d, c) => storeOf(d, c, buckets);
  const cloudRoot = '/cloud/drive';
  const seed = path.join(ROOT, `${label}-seed`);
  raw.mkdirSync(seed, { recursive: true });
  const A = makeState(cloudRoot, n);
  if (legacy) raw.writeFileSync(path.join(seed, 'state.json'), JSON.stringify(A));
  else { const st = store(seed, cloudRoot); const r = await st.load(); Object.assign(r.state, A); for (const k of MAPS) { r.state[k] = { ...A[k] }; } await st.save(r.state); ok(tidyOk(seed).ok, `${label}: the seed state saved whole`, tidyOk(seed)); }
  const canonA = canon(A);
  // the expected B, and how many disk calls its save makes
  const probe = path.join(ROOT, `${label}-probe`); copyDir(seed, probe);
  let canonB; let calls;
  {
    const st = store(probe, cloudRoot); const r = await st.load();
    ok(canon(r.state) === canonA, `${label}: what was saved reads back exactly`);
    mutate(r.state); canonB = canon(r.state);
    const c = crashAfter(probe, Infinity); await st.save(r.state); Sim.T.hook = null; calls = c.n;
    const r2 = await store(probe, cloudRoot).load();
    ok(canon(r2.state) === canonB, `${label}: the new state reads back exactly (no crash; ${calls} disk calls)`);
  }
  let gotA = 0; let gotB = 0; const bad = [];
  for (let k = 1; k <= calls + 1; k++) {
    const d = path.join(ROOT, `${label}-k`); copyDir(seed, d);
    const st = store(d, cloudRoot); const r = await st.load();
    mutate(r.state);
    crashAfter(d, k); await st.save(r.state); Sim.T.hook = null; // the process "dies" at its k-th disk call in the folder
    const after = await store(d, cloudRoot).load(); // the next start
    const c = after.held ? 'held' : canon(after.state);
    if (c === canonA) gotA += 1; else if (c === canonB) gotB += 1; else bad.push({ k, held: Boolean(after.held), fresh: Boolean(after.fresh), lost: after.lost });
    const t = tidyOk(d); if (!t.ok) bad.push({ k, tidy: t });
  }
  ok(!bad.length, `${label}: cut at each of its ${calls} disk calls: always the old state or the new one, whole, nothing left behind (${gotA}× old, ${gotB}× new)`, bad.slice(0, 5));
  ok(gotA > 0 && gotB > 0, `${label}: both outcomes happen (a cut before the index's rename keeps the old, after it the new)`, { gotA, gotB });
  return { calls };
}
scenario('crash', async () => {
  const r = await cutEverywhere('crash', { n: 1500, mutate: toB });
  // the pieces those changes fall in: each written (open) and its old one removed, + reading / writing / renaming the index
  const A = makeState('/cloud/drive', 1500); const B = JSON.parse(JSON.stringify(A)); toB(B);
  const touched = new Set(); for (const k of MAPS) for (const rel of new Set([...Object.keys(A[k]), ...Object.keys(B[k])])) if (JSON.stringify(A[k][rel]) !== JSON.stringify(B[k][rel])) touched.add(SState.bucketOf(rel));
  ok(r.calls <= 2 * touched.size + 4, `crash: a save of a few changes touches only their pieces (${r.calls} disk calls for ${touched.size} of 256 pieces, 1,500 files)`);
});
scenario('full', async () => {
  // a map replaced whole (a new drive, "start the cloud copy again"): every piece written again, the old ones removed
  await cutEverywhere('full', { n: 1500, buckets: 16, mutate: (s) => { toB(s); s.base = Object.fromEntries(Object.entries(s.base).filter((_, i) => i % 2)); } });
});

// ---------- 2. the old single file ----------
scenario('migrate', async () => {
  await cutEverywhere('migrate', { n: 2000, legacy: true, buckets: 16, mutate: (s) => { s.lastOk = 5; } });
  const cloudRoot = '/cloud/drive';
  const d = path.join(ROOT, 'migrate-1'); raw.mkdirSync(d, { recursive: true });
  const A = makeState(cloudRoot, 500);
  raw.writeFileSync(path.join(d, 'state.json'), JSON.stringify(A));
  const st = store(d, cloudRoot); const r = await st.load();
  ok(r.migrated && canon(r.state) === canon(A), 'migrate: the old state.json is read whole');
  await st.save(r.state);
  ok(!raw.existsSync(path.join(d, 'state.json')) && raw.existsSync(path.join(d, 'state.json.prev')) && tidyOk(d).ok, 'migrate: saved in pieces, the old file kept as state.json.prev', listState(d));
  const r2 = await store(d, cloudRoot).load();
  ok(!r2.migrated && canon(r2.state) === canon(A), 'migrate: the next start reads the pieces (same state)');
  // an older Hearth ran meanwhile (an update undone): it wrote a newer state.json; that one is taken again
  const A2 = makeState(cloudRoot, 600, 'z'); raw.writeFileSync(path.join(d, 'state.json'), JSON.stringify(A2));
  const later = new Date(Date.now() + 5000); raw.utimesSync(path.join(d, 'state.json'), later, later);
  const st3 = store(d, cloudRoot); const r3 = await st3.load();
  ok(r3.migrated && canon(r3.state) === canon(A2), 'migrate: a newer state.json from an older Hearth is taken again');
  await st3.save(r3.state);
  ok(canon((await store(d, cloudRoot).load()).state) === canon(A2) && tidyOk(d).ok, 'migrate: …and saved in pieces');
  // another cloud folder's state: a fresh start (as before), nothing of the other folder's used
  const r4 = await store(d, '/another/drive').load();
  ok(r4.fresh && !Object.keys(r4.state.base).length, 'migrate: another cloud folder starts fresh');
  // a damaged piece (never should be: flushed before the index names it): its files count as never synced (both sides
  // kept), the rest reads, and the piece is written again
  const ix = JSON.parse(raw.readFileSync(path.join(d, 'state', 'index.json'), 'utf8'));
  const [b0, name0] = Object.entries(ix.parts)[0];
  raw.writeFileSync(path.join(d, 'state', name0), '{"v":2,"rows":{"cut');
  const st5 = store(d, cloudRoot); const r5 = await st5.load();
  const inB0 = Object.keys(A2.base).filter((rel) => SState.bucketOf(rel) === Number(b0));
  ok(!r5.held && r5.lost === 1 && inB0.every((rel) => !r5.state.base[rel]) && Object.keys(r5.state.base).length === Object.keys(A2.base).length - inB0.length, 'migrate: a damaged piece: only its files lose their history', { lost: r5.lost, n: inB0.length });
  ok(st5.isDirty(), 'migrate: …and that piece is written again at the next save');
  await st5.save(r5.state);
  ok(tidyOk(d).ok && (await store(d, cloudRoot).load()).lost === 0, 'migrate: …then everything reads');
  ok(SState.bucketOf('chats/a.json') === SState.bucketOf('chats/a.json') && SState.bucketOf('chats/a.json') !== SState.bucketOf('chats/b.json') && SState.NB === 256, 'migrate: buckets by name, stable');
});

// ---------- 3. the engine, through the two-computer simulator ----------
const stateDirOf = (m) => path.join(m.data, 'sync');
async function engineCut(label, k, { joinCut = false } = {}) {
  const w = T.world(`s-${label}`);
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  for (let i = 0; i < 400; i++) pc.write(`workspace/p${i % 5}/f${i}.txt`, `file ${i}`);
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'hello')]));
  // the PC's first sync, its state saves cut at the k-th disk call (or the Mac's join)
  const who = joinCut ? mac : pc;
  if (joinCut) { await T.pass(pc); for (let i = 0; i < 6; i++) { w.clock.advance(3000); pc.view.tick(); mac.view.tick(); } } // (everything in the Mac's view of the cloud first)
  const c = crashAfter(path.join(stateDirOf(who), 'state'), k);
  await T.pass(who); Sim.T.hook = null; if (process.env.SS75_DEBUG) console.log(label, "calls", c.n, "dead", c.dead);
  // the restart: a new engine reads what is on the disk
  who.e.stop(); who.e = who.make();
  const n = await T.converge(w);
  ok(n > 0, `engine ${label}: converges after the cut (${c.n} disk calls before it)`, T.why(w));
  let same = true; for (let i = 0; i < 400; i += 1) if (mac.read(`workspace/p${i % 5}/f${i}.txt`) !== `file ${i}`) { same = false; break; }
  ok(same && T.texts(mac.json('chats/a.json')).join() === 'hello', `engine ${label}: every file arrived whole`);
  // and from there on everything still works: edits and deletes on both sides
  mac.write('workspace/p1/f1.txt', 'mac edit'); pc.write('workspace/p2/f2.txt', 'pc edit');
  raw.rmSync(mac.p('workspace/p3/f3.txt')); mac.edit('chats/a.json', (x) => { x.messages.push(T.msg('user', 2, 'from the mac')); });
  ok(await T.converge(w) > 0, `engine ${label}: edits after the restart converge`, T.why(w));
  ok(pc.read('workspace/p1/f1.txt') === 'mac edit' && mac.read('workspace/p2/f2.txt') === 'pc edit' && T.texts(pc.json('chats/a.json')).join() === 'hello,from the mac', `engine ${label}: both computers' edits kept`);
  ok(!pc.has('workspace/p3/f3.txt') || pc.read('workspace/p3/f3.txt') === 'file 3', `engine ${label}: a delete is either done or the file kept whole (never damaged)`);
  ok(tidyOk(stateDirOf(pc)).ok && tidyOk(stateDirOf(mac)).ok, `engine ${label}: both state folders hold exactly what their index names`, [tidyOk(stateDirOf(pc)), tidyOk(stateDirOf(mac))]);
}
scenario('engine', async () => {
  for (const k of [1, 2, 5, 12, 40, 200, 600]) await engineCut(`pc-k${k}`, k);
  for (const k of [3, 30, 300]) await engineCut(`mac-k${k}`, k, { joinCut: true });
});

// ---------- 4. steady passes write nothing; one change, one piece ----------
scenario('steady', async () => {
  const w = T.world('s-steady');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  T.computer(w, 'Mac', { platform: 'darwin' });
  for (let i = 0; i < 2000; i++) pc.write(`workspace/p${i % 9}/f${i}.txt`, `file ${i}`);
  ok(await T.converge(w) > 0, 'steady: 2,000 files sync', T.why(w));
  await T.round(w); await T.round(w);
  const s0 = pc.e._stateStore();
  await T.round(w); await T.round(w);
  const s1 = pc.e._stateStore();
  ok(s1.written === s0.written && s1.saves === s0.saves, 'steady: passes with nothing changed write nothing', { s0, s1 });
  pc.write('workspace/p1/f1.txt', 'changed'); await T.round(w, { order: [pc] });
  const s2 = pc.e._stateStore();
  ok(s2.written - s1.written === 1 && s2.saves - s1.saves === 1, `steady: one changed file writes one piece + the index (${s2.written - s1.written} piece(s), ${s2.bytes - s1.bytes} bytes)`, { s1, s2 });
  const ix = JSON.parse(raw.readFileSync(path.join(stateDirOf(pc), 'state', 'index.json'), 'utf8'));
  ok(Object.keys(ix.parts).length > 100 && raw.statSync(path.join(stateDirOf(pc), 'state', 'index.json')).size < 16 * 1024, `steady: ${Object.keys(ix.parts).length} pieces, a small index`);
  ok(s2.costMs < 50, `steady: that save cost the main process ${s2.costMs} ms`);
});

// ---------- 5. held ----------
scenario('held', async () => {
  const w = T.world('s-held');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  T.computer(w, 'Mac', { platform: 'darwin' });
  for (let i = 0; i < 50; i++) pc.write(`attachments/f${i}.txt`, `file ${i}`);
  ok(await T.converge(w) > 0, 'held: syncs', T.why(w));
  const ixf = path.join(stateDirOf(pc), 'state', 'index.json'); const before = raw.readFileSync(ixf, 'utf8');
  Sim.T.hook = (op, p) => (op === 'open' && typeof p === 'string' && path.resolve(p) === path.resolve(ixf) ? 'EBUSY' : null);
  pc.e.stop(); pc.e = pc.make();
  pc.write('attachments/new.txt', 'new');
  const r = await pc.e.pass();
  ok(r.state === 'offline' && r.error === 'held', 'held: the index held by another program: the pass waits', { state: r.state, error: r.error });
  ok(raw.readFileSync(ixf, 'utf8') === before, 'held: nothing written over it');
  Sim.T.hook = null;
  ok(await T.converge(w) > 0 && w.ms[1].read('attachments/new.txt') === 'new' && tidyOk(stateDirOf(pc)).ok, 'held: let go: it reads, and sync goes on', T.why(w));
});

// ---------- 6. two engines on one folder ----------
scenario('two', async () => {
  const w = T.world('s-two');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  T.computer(w, 'Mac', { platform: 'darwin' });
  for (let i = 0; i < 1500; i++) pc.write(`workspace/q${i % 4}/f${i}.txt`, `file ${i}`);
  const e1 = pc.e; const p1 = e1.pass(); // a pass still running…
  await new Promise((r) => setTimeout(r, 30));
  e1.stop(); pc.e = pc.make(); // …when sync is switched off and on (syncmain start())
  const r2 = await pc.e.pass(); await p1.catch(() => {});
  ok(tidyOk(stateDirOf(pc)).ok, 'two: every piece the index names is there, nothing extra', tidyOk(stateDirOf(pc)));
  ok(r2 && await T.converge(w) > 0, 'two: then it converges', T.why(w));
  const again = await SState.createStateStore({ dir: stateDirOf(pc), cloudRoot: pc.cloudRoot, fresh: () => ({}) }).load();
  ok(!again.held && !again.lost && Object.keys(again.state.base).length >= 1500, 'two: the state reads whole', { lost: again.lost, n: Object.keys(again.state.base || {}).length });
});

// ---------- 7. the usage merge on the store thread ----------
scenario('usage', async () => {
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'syncstate75-usage.js')], { encoding: 'utf8', timeout: 120000 });
  let out = null; try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { /* below */ }
  ok(out && Array.isArray(out.checks), 'usage: the store-thread run reports', (r.stderr || r.stdout).slice(-600));
  for (const [c, what, detail] of out?.checks || []) ok(c, `usage: ${what}`, detail);
  if (out?.ms) console.log(`  usage: the main process's part of a minute's merge with sync on: ${out.ms.first} ms, then ${out.ms.next} ms`);
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    Sim.T.hook = null;
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  console.log(`\nsyncstate75: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  if (!argv.includes('--keep')) { fs.rmSync(ROOT, { recursive: true, force: true }); const w = T.world('s-end'); fs.rmSync(path.dirname(w.dir), { recursive: true, force: true }); }
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
