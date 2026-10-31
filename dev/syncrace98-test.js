#!/usr/bin/env node
// (round 98, syncrace98) The two cases round 97 (syncsweep97) left open, each with the real engine, the real StoreAck
// core, the real store (store.js, a copy in a temp folder so its data folder is the test's own) and the real store
// thread (storework.js) doing the window's saves, as in the app. The timing is driven, not waited for: the store thread
// is held (store._hold, a test hook behind HEARTH_TEST_STORE_HOLD) so a save handed to it lands exactly where the test
// wants it.
//   Case 1: a save already handed to the store thread before sync writes the same store, landing after it
//     handed          the window's save handed over after the pull read the Mac's version (store thread path), before
//                     its write; the thread held until after the write
//     during          the window's save made while the pull writes (between its temp file and its rename), main path
//     during-thread   …the same on the store-thread pull path; two saves meanwhile, the later one wins
//     restore         Restore from Deleted files with a save handed over while it copies the version in place aside
//     quit            a save waiting for sync's write is still written on quit (flushSync); idle() waits for it
//   Case 2: a rename here and a window holding the old name
//     rename-here     the Mac renamed a store; the PC's window holds it under the old name with a change not written:
//                     its change lands in the new name, the old name isn't written back
// Never touches real data or a real cloud drive: temp folders only.
//   node dev/syncrace98-test.js [--only name,name] [--verbose]
'use strict';
process.env.HEARTH_STORE_THREAD = '1'; // store.js saves through its thread in Node too (as in Electron)
process.env.HEARTH_TEST_STORE_HOLD = '1'; // the thread's test hold (storework.js _hold)
const fs = require('fs');
const path = require('path');
const T = require('./sync72-test');
const SA = require('../storeack-core');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
const VERBOSE = argv.includes('--verbose');
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) { passes += 1; if (VERBOSE) console.log(`  ok ${what}`); } else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`); } };
const scenarios = [];
const roots = new Set(); // the simulator's temp folders (removed at the end)
const scenario = (name, fn) => scenarios.push({ name, fn });
const clone = (v) => JSON.parse(JSON.stringify(v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (v, s) => JSON.stringify(v ?? null).includes(s);
const note = (id, text) => ({ id, title: id, text, updatedAt: 1 });

// the store's files (store.js, storework.js and what they require), copied next to the PC's data folder: store.js keeps
// its data in <its folder>/data, so the copy's data folder is the simulated PC's (never the real one; a symlink would
// resolve to the repo's)
const STORE_FILES = (() => {
  const seen = new Set(); const q = ['store.js', 'storework.js'];
  while (q.length) {
    const f = q.shift(); if (seen.has(f)) continue;
    let s; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    seen.add(f);
    for (const m of s.matchAll(/require\('\.\/([\w.-]+?)(?:\.js)?'\)/g)) q.push(`${m[1]}.js`);
  }
  return [...seen];
})();

// a second store thread for the engine's own JSON work (syncHash / syncPull / syncMerge), as T.computer's thread mode
let worker = null; let wseq = 0; const wjobs = new Map();
function runOff(op, args) {
  if (!worker) {
    const { Worker } = require('worker_threads');
    worker = new Worker(path.join(ROOT, 'storework.js'));
    worker.unref();
    worker.on('message', ({ id, res, err }) => { const j = wjobs.get(id); if (!j) return; wjobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  }
  return new Promise((resolve, reject) => { const id = ++wseq; wjobs.set(id, { resolve, reject }); worker.postMessage({ ...args, op, id }); });
}

// the store thread held: a save handed to it waits until off()
function holdOf(store) {
  let sab = null;
  return {
    on() { if (sab) return; sab = new SharedArrayBuffer(4); store._hold(sab); },
    off() { if (!sab) return; const v = new Int32Array(sab); Atomics.store(v, 0, 1); Atomics.notify(v, 0); sab = null; },
    get on_() { return Boolean(sab); },
  };
}

// the PC (its window saves through the real store) and the Mac
async function setup(tag, o = {}) {
  const w = T.world(`sr98-${tag}`);
  roots.add(path.dirname(w.dir));
  const dir = path.join(w.dir, 'PC');
  fs.mkdirSync(path.join(dir, 'data', 'kv'), { recursive: true });
  for (const f of STORE_FILES) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  if (path.resolve(pc.data) !== path.resolve(dir, 'data')) throw new Error('the PC\'s data folder is not the store copy\'s');
  const store = require(path.join(dir, 'store.js'));
  const hold = holdOf(store);
  const hooks = {};
  pc.remake = (extra = {}) => {
    pc.e.stop?.();
    pc.e = pc.make({
      onPulled: (l) => { pc.pulled.push(...l); hooks.pulled?.(l); },
      fault: (what, file) => hooks.fault?.(what, file),
      ...(o.thread ? { offMin: 0, hashJson: (file, a) => runOff('syncHash', { file, ...a }), pullJson: (a) => runOff('syncPull', a), mergeJson: (a) => runOff('syncMerge', a) } : {}),
      // as syncmain.js wires them (when the store has them)
      ...(store.settle ? { localWrite: (file) => { const r = store.settle(file); hooks.settle?.(file); return r; } } : {}),
      ...(store.movedHere ? { movedHere: (from, to) => store.movedHere(from, to) } : {}),
      ...extra,
    });
  };
  pc.remake();
  // sync's write guard, as syncmain.js sets it
  store.setBeforeWrite((file, v) => pc.e.guardWrite(file, v), (file) => { const rel = pc.e.relOfLocal(file); return Boolean(rel && pc.e.hasPulled(rel)); });
  const done = () => { hold.off(); try { store.flushSync(); } catch { /* stopped */ } };
  return { w, pc, mac, store, hold, hooks, done };
}

// a window holding a store (StoreAck-declared, as notes.js / board.js are), saving through the store (hub.kvSet)
function windowOf(store, pc, name) {
  const rel = `kv/${name}.json`;
  const w = { held: null, dirty: false, saves: [] };
  w.load = () => { w.held = store.getKV(name, null); return w.held; };
  w.saveNow = () => { w.dirty = false; const p = store.setKV(name, clone(w.held)); w.saves.push(p); return p; };
  w.change = (fn) => { const r = fn(w.held); if (r !== undefined) w.held = r; w.dirty = true; };
  w.sa = SA.create({ ack: (rels, since) => { pc.e.ackPulled(rels, since); store.outsideAck(rels, since); } });
  w.sa.hold(rel, { name: rel, pending: () => w.dirty, flush: () => w.saveNow(), read: async () => store.getKV(name, null), apply: (v) => { w.held = v; } });
  w.arrive = async (list) => { const r = await w.sa.arrived(list); if (w.dirty) await w.saveNow(); return r; };
  return w;
}
const take = (m) => { const l = m.pulled.slice(); m.pulled.length = 0; return l; };
// rounds until both computers agree; the PC's window handles each arrival as the app does (hearth:synced → StoreAck)
async function settle(s, win, max = 40) {
  for (let i = 1; i <= max; i++) {
    await T.round(s.w);
    s.hold.off();
    await s.store.idle();
    const l = take(s.pc);
    if (l.length && win) await win.arrive(l);
    await s.store.idle();
    if (i >= 2 && T.settled(s.w)) return i;
  }
  return -1;
}
const REL = 'kv/notes.json';
async function start(tag, o) {
  const s = await setup(tag, o);
  s.store.setKV('notes', [note('n1', 'first'), note('n2', 'second')]);
  await s.store.idle();
  ok(await settle(s, null) > 0, `${tag}: first sync`, T.why(s.w));
  const win = windowOf(s.store, s.pc, 'notes'); win.load(); s.pc.e.ackPulled(); take(s.pc);
  return { ...s, win };
}
// both computers end with the Mac's note and the window's change; the window holds both too
function both(tag, s, mine, theirs) {
  const pcv = s.pc.json(REL); const macv = s.mac.json(REL);
  ok(has(pcv, theirs), `${tag}: the Mac's change stays on the PC (not written over by the window's save handed over before)`, pcv?.map((x) => `${x.id}:${x.text}`));
  ok(has(pcv, mine), `${tag}: the window's own change is kept on the PC`, pcv?.map((x) => `${x.id}:${x.text}`));
  ok(has(macv, theirs) && has(macv, mine), `${tag}: …and both reach the Mac`, macv?.map((x) => `${x.id}:${x.text}`));
  ok(has(s.win.held, theirs) && has(s.win.held, mine), `${tag}: the window holds both`, s.win.held?.map((x) => x.id));
}

// ---------- case 1: a save handed to the store thread before sync's write, landing after it ----------
scenario('handed', async () => {
  const tag = 'handed';
  const s = await start(tag, { thread: true });
  const { pc, mac, win, hold, hooks } = s;
  let fired = false;
  // the pull has read the Mac's version (store thread), its write is next: the window's save is handed over now, the
  // thread held (busy with something else) so it lands after
  pc.remake({ pullJson: async (a) => { const r = await runOff('syncPull', a); if (!fired && a.rel === REL) { fired = true; hold.on(); win.change((v) => [...v, note('typed', 'typed on the PC')]); win.saveNow(); } return r; } });
  hooks.settle = () => setTimeout(() => hold.off(), 30); // (the fixed engine waits for it: let it go)
  hooks.pulled = () => hold.off(); // (the old one wrote and announced: let it go after)
  mac.edit(REL, (v) => [...v, note('mac', 'the Mac\'s note')]);
  ok(await settle(s, win) > 0, `${tag}: converges`, T.why(s.w));
  ok(fired, `${tag}: (the save was handed over between the pull's read and its write)`);
  both(tag, s, 'typed on the PC', 'the Mac\'s note');
  s.done();
});
for (const thread of [false, true]) {
  const tag = thread ? 'during-thread' : 'during';
  scenario(tag, async () => {
    const s = await start(tag, { thread });
    const { pc, mac, win, hold, hooks } = s;
    let fired = false;
    // the pull's temp file is written, its rename is next: the window saves twice now (the thread held)
    hooks.fault = (what, file) => {
      if (fired || what !== 'pull' || !/notes\.json$/.test(file)) return;
      fired = true; hold.on();
      win.change((v) => [...v, note('typed', 'typed on the PC, first')]); win.saveNow();
      win.change((v) => { v.find((x) => x.id === 'typed').text = 'typed on the PC, then changed'; }); win.saveNow();
    };
    hooks.pulled = () => hold.off();
    mac.edit(REL, (v) => [...v, note('mac', 'the Mac\'s note')]);
    ok(await settle(s, win) > 0, `${tag}: converges`, T.why(s.w));
    ok(fired, `${tag}: (the saves were made while the pull wrote)`);
    both(tag, s, 'typed on the PC, then changed', 'the Mac\'s note');
    ok(!has(pc.json(REL), 'typed on the PC, first'), `${tag}: the saves made meanwhile land in order (the later one wins)`, pc.json(REL)?.map((x) => `${x.id}:${x.text}`));
    s.done();
  });
}
scenario('restore', async () => {
  const tag = 'restore';
  const s = await start(tag);
  const { pc, win, hold, hooks } = s;
  // a version in Deleted files (as a choice's Undo leaves it)
  const day = new Date(pc.now()).toISOString().slice(0, 10);
  const tf = path.join(pc.data, 'sync', 'trash', day, 'kv', 'notes.json');
  fs.mkdirSync(path.dirname(tf), { recursive: true });
  fs.writeFileSync(tf, JSON.stringify([note('n1', 'first'), note('n2', 'second'), note('back', 'the version put back')]));
  const id = `here:${day}/kv/notes.json`;
  // while the version in place is copied aside (before the rename), the window's save is handed over, the thread held
  const fsp = fs.promises; const orig = fsp.copyFile; let fired = false;
  fsp.copyFile = async (...a) => { const r = await orig.apply(fsp, a); if (!fired && /[\\/]sync[\\/]trash[\\/]/.test(String(a[1]))) { fired = true; hold.on(); win.change((v) => [...v, note('typed', 'typed on the PC')]); win.saveNow(); } return r; };
  hooks.settle = () => setTimeout(() => hold.off(), 30);
  let r;
  try { r = await pc.e.restore(id, { replace: true }); } finally { fsp.copyFile = orig; }
  hold.off(); await s.store.idle();
  ok(fired, `${tag}: (the save was handed over while it restored)`);
  ok(r?.ok || /changed/i.test(r?.error || ''), `${tag}: restored, or "it changed: try again"`, r);
  await win.arrive(take(pc)); await s.store.idle();
  const disk = pc.json(REL);
  ok(has(disk, 'typed on the PC') && has(win.held, 'typed on the PC'), `${tag}: the window's change is kept`, disk?.map((x) => x.id));
  if (r?.ok) ok(has(disk, 'the version put back'), `${tag}: the version put back stays (not written over by the save handed over before)`, disk?.map((x) => `${x.id}:${x.text}`));
  s.done();
});
scenario('quit', async () => {
  const tag = 'quit';
  const s = await setup(tag);
  const { store, pc } = s;
  store.setKV('notes', [note('n1', 'first')]); await store.idle();
  ok(typeof store.settle === 'function', `${tag}: the store has settle (sync's write waits for the saves on their way)`);
  if (typeof store.settle !== 'function') { s.done(); return; }
  const release = await store.settle(pc.p(REL));
  let landed = false;
  store.setKV('notes', [note('n1', 'first'), note('n2', 'saved while sync wrote')]).then(() => { landed = true; });
  await wait(30);
  ok(!landed && !has(pc.json(REL), 'saved while sync wrote'), `${tag}: a save made while sync writes the store waits`);
  const idle = store.idle().then(() => 'idle');
  ok(await Promise.race([idle, wait(50).then(() => 'waiting')]) === 'waiting', `${tag}: idle() waits for it`);
  release();
  ok(await Promise.race([idle, wait(3000).then(() => 'stuck')]) === 'idle' && has(pc.json(REL), 'saved while sync wrote'), `${tag}: once sync's write is done it lands, and idle() resolves`, pc.json(REL));
  // on quit, one still waiting is written
  const release2 = await store.settle(pc.p(REL));
  store.setKV('notes', [note('n1', 'first'), note('n3', 'waiting at quit')]);
  store.flushSync();
  ok(has(pc.json(REL), 'waiting at quit'), `${tag}: a save still waiting at quit is written (flushSync)`, pc.json(REL));
  release2();
  // a save of another store isn't held by it
  const r3 = await store.settle(pc.p(REL));
  ok(!store._gated?.(pc.p('kv/other.json')), `${tag}: only that store's saves wait`);
  r3();
});

// ---------- case 2: a rename here and a window holding the old name ----------
scenario('rename-here', async () => {
  const tag = 'rename-here';
  const s = await setup(tag);
  const { store, pc, mac } = s;
  const OLD = 'kv/board-b1.json'; const NEW = 'kv/board-b2.json';
  store.setKV('board-b1', { id: 'b1', items: [note('i1', 'a card')] });
  await store.idle();
  ok(await settle(s, null) > 0, `${tag}: first sync`, T.why(s.w));
  const win = windowOf(store, pc, 'board-b1'); win.load(); pc.e.ackPulled(); take(pc);
  win.change((v) => { v.items.push(note('typed', 'typed on the PC under the old name')); });
  // the Mac renames it (as a move: same content, new name)
  fs.renameSync(mac.p(OLD), mac.p(NEW));
  ok(await settle(s, win) > 0, `${tag}: converges`, T.why(s.w));
  for (const [m, who] of [[pc, 'PC'], [mac, 'Mac']]) {
    ok(!m.has(OLD), `${tag}: the old name isn't written back on the ${who} (the rename stays)`, fs.readdirSync(m.p('kv')));
    ok(has(m.json(NEW), 'a card') && has(m.json(NEW), 'typed on the PC under the old name'), `${tag}: the window's change is in the new name on the ${who}`, m.json(NEW));
  }
  s.done();
});

async function main() {
  const t0 = Date.now();
  for (const sc of scenarios) {
    if (ONLY && !ONLY.includes(sc.name)) continue;
    const f0 = failures;
    try { await sc.fn(); } catch (err) { failures += 1; console.log(`FAIL ${sc.name}: threw ${err.stack || err}`); }
    console.log(`${failures === f0 ? 'ok  ' : 'FAIL'} ${sc.name}`);
  }
  console.log(JSON.stringify({ pass: failures === 0, passes, failures, ms: Date.now() - t0 }));
  if (!argv.includes('--keep')) for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
main();
