#!/usr/bin/env node
// (round 97, syncsweep97) Every place sync writes a synced store into the data folder, each with a window (a StoreAck
// holder, as storeack77 runs it) that holds the older version and has a save of its own waiting. After the write, the
// holder's waiting save lands (StoreAck writes it first, or its own timer does): the write's result must stay, and the
// holder's own change must be kept too. Round 96 found restore() wrote without keeping the guard's base; this sweeps the
// rest. Through the two-computer simulator (dev/sync-sim.js via dev/sync72-test.js) with the real engine, its write guard
// (as store.js applies it), the real StoreAck core, the real pack lane (syncpack.js) and the real store (store.js, in a
// child process, for Combine).
//   pull · pull-thread       a version arrives from the other computer (main process / store thread)
//   merge · merge-thread     both changed: merged
//   absorb                   a cloud client's "conflicted copy" merged in
//   relink                   Rename for Windows: a store's link to the renamed file rewritten
//   resolve-theirs / -merge / -both   a conflict's choices · resolve-theirs-big / aside-theirs-big: a store over 1 MB
//                            (its JSON work on the store thread: asidework.js)
//   aside-theirs / -both     Kept aside: Use that one / Keep both
//   restore                  Restore from Deleted files (round 96's case, a small store)
//   restore-new              …of a store this computer doesn't have (gone here)
//   restore-big              …of a store over 1 MB (its version replaced is read on the store thread)
//   packs                    a very long chat's pieces taken (syncpack.js), the chat window saving after
//   combine                  Kept aside › Combine… (keptaside.js writeCombined, through store.js): something typed
//                            while it saves
//   race-resolve / race-aside / race-restore   a save landing WHILE the choice is being made (between its read and
//                            its write): kept, not written over
// Never touches real data or a real cloud drive: temp folders only.
//   node dev/syncsweep97-test.js [--only name,name] [--verbose]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('./sync72-test');
const SA = require('../storeack-core');
const AW = require('../asidework');
const Sim = require('./sync-sim');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
const VERBOSE = argv.includes('--verbose');
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) { passes += 1; if (VERBOSE) console.log(`  ok ${what}`); } else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`); } };
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });
const clone = (v) => JSON.parse(JSON.stringify(v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = '2026-10-31';

// the store thread (storework.js), for the paths that use it
let worker = null; let wseq = 0; const wjobs = new Map(); const ops = {};
function runOff(op, args) {
  ops[op] = (ops[op] || 0) + 1;
  if (!worker) {
    const { Worker } = require('worker_threads');
    worker = new Worker(path.join(__dirname, '..', 'storework.js'));
    worker.unref();
    worker.on('message', ({ id, res, err }) => { const j = wjobs.get(id); if (!j) return; wjobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(asBuf(res)); });
  }
  return new Promise((resolve, reject) => { const id = ++wseq; wjobs.set(id, { resolve, reject }); worker.postMessage({ ...args, op, id }); });
}
function asBuf(res) { if (res && typeof res === 'object') for (const k of Object.keys(res)) { const v = res[k]; if (v instanceof Uint8Array && !Buffer.isBuffer(v)) res[k] = Buffer.from(v.buffer, v.byteOffset, v.byteLength); } return res; }

// ---------- a window: a store in memory, saved the way store.js saves it (through sync's guard) ----------
// held: what it holds · change(fn): a change in memory, not written yet · save(): written now (StoreAck, or its timer)
function windowOf(m, rel) {
  const w = { held: null, dirty: false, writes: 0 };
  w.load = () => { w.held = m.json(rel); return w.held; };
  w.save = () => { const v = m.e.guardWrite(m.p(rel), clone(w.held)); m.write(rel, v); w.dirty = false; w.writes += 1; return v; };
  w.change = (fn) => { const r = fn(w.held); if (r !== undefined) w.held = r; w.dirty = true; };
  w.sa = SA.create({ ack: (rels, since) => m.e.ackPulled(rels, since) });
  w.sa.hold(rel, { name: rel, pending: () => w.dirty, flush: () => w.save(), read: async () => { await wait(1); return m.json(rel); }, apply: (v) => { w.held = v; } });
  // the arrival handled as the window does (StoreAck); a save still waiting after it (StoreAck left it: no guard) lands
  // on its own timer a moment later, as a debounced save does
  w.arrive = async (list) => { const r = await w.sa.arrived(list); if (w.dirty) w.save(); return r; };
  return w;
}
const take = (m) => { const l = m.pulled.slice(); m.pulled.length = 0; return l; };
function pair(name, o = {}) {
  const w = T.world(`ss97-${name}`);
  const pc = T.computer(w, 'PC', { platform: 'win32', ...o });
  const mac = T.computer(w, 'Mac', { platform: 'darwin', ...o });
  if (o.big) for (const m of [pc, mac]) { m.e.stop?.(); m.e = m.make({ asideBig: AW.create({ runOff }) }); }
  return { w, pc, mac };
}
const has = (v, s) => JSON.stringify(v).includes(s);
// notes: a list with ids (as notes.js keeps them); pad: bytes of text per note (to make a big store)
const note = (id, text, pad = 0) => ({ id, title: id, text: pad ? `${text} ${'·'.repeat(pad)}` : text, updatedAt: 1 });
const REL = 'kv/notes.json';

// the PC's window with a change waiting; act() makes the write; then the window's waiting save lands
async function guarded(tag, m, act, { mark, check } = {}) {
  const win = windowOf(m, REL); win.load(); m.e.ackPulled([REL]); take(m);
  win.change((v) => { v.push(note('typed-here', 'typed on the PC, not saved yet')); });
  const r = await act(win);
  const got = await win.arrive(take(m));
  const disk = m.json(REL);
  ok(has(disk, 'typed on the PC'), `${tag}: the window's own change waiting is kept`, disk.map((x) => x.id));
  if (mark) ok(has(disk, mark), `${tag}: the window's waiting save didn't write its older copy over what was written (${mark})`, disk.map((x) => `${x.id}:${String(x.text).slice(0, 40)}`));
  if (check) check(disk, win, got, r);
  return { win, got, r };
}
// a conflict left for a choice on the PC (auto-settle off): the PC and the Mac both change the first note
async function conflict(tag, w, pc, mac, pad = 0) {
  pc.auto = false; mac.auto = false;
  pc.view.online = false;
  pc.edit(REL, (v) => { v[0].text = `PC's text ${'·'.repeat(pad)}`; return v; });
  mac.edit(REL, (v) => { v[0].text = `Mac's text ${'·'.repeat(pad)}`; v.push(note('mac-only', 'a note only the Mac has')); return v; });
  for (let i = 0; i < 4; i++) await T.round(w);
  mac.view.online = false; pc.view.online = true;
  for (let i = 0; i < 6 && !(await pc.e.conflicts()).length; i++) await T.round(w);
  mac.view.online = true;
  const c = (await pc.e.conflicts()).find((x) => x.rel === REL);
  ok(Boolean(c), `${tag}: changed on both → a conflict on the PC`, await pc.e.conflicts());
  return c;
}
// a version kept aside on the PC (the guard: the PC's save won a line the Mac changed)
async function keptAside(tag, w, pc, mac) {
  pc.e.ackPulled(); take(pc);
  const held = pc.json(REL);
  mac.edit(REL, (v) => { v[0].text = 'Mac changed the first note'; return v; });
  ok(await T.converge(w) > 0, `${tag}: the Mac's edit arrives`, T.why(w));
  held[0].text = 'PC changed the first note';
  pc.write(REL, pc.e.guardWrite(pc.p(REL), clone(held)));
  const n = (await pc.e.aside())[0];
  ok(Boolean(n) && n.rel === REL, `${tag}: the Mac's version kept aside`, await pc.e.aside());
  return n;
}
async function start(tag, o = {}, pad = 0) {
  const p = pair(tag, o);
  p.pc.write(REL, [note('n1', 'first', pad), note('n2', 'second', pad)]);
  ok(await T.converge(p.w) > 0, `${tag}: first sync`, T.why(p.w));
  return p;
}

// ---------- pull / merge ----------
for (const thread of [false, true]) {
  scenario(thread ? 'pull-thread' : 'pull', async () => {
    const tag = thread ? 'pull-thread' : 'pull';
    const { w, pc, mac } = await start(tag, { thread });
    await guarded(tag, pc, async () => {
      mac.edit(REL, (v) => [...v, note('mac', 'the Mac\'s note')]);
      ok(await T.converge(w) > 0 && has(pc.json(REL), 'the Mac\'s note'), `${tag}: the Mac's note arrives`, T.why(w));
    }, { mark: 'the Mac\'s note' });
  });
  scenario(thread ? 'merge-thread' : 'merge', async () => {
    const tag = thread ? 'merge-thread' : 'merge';
    const { w, pc, mac } = await start(tag, { thread });
    await guarded(tag, pc, async () => {
      pc.edit(REL, (v) => [...v, note('pc-saved', 'the PC\'s saved note')]);
      mac.edit(REL, (v) => [...v, note('mac', 'the Mac\'s note')]);
      ok(await T.converge(w) > 0 && has(pc.json(REL), 'the Mac\'s note') && pc.e.status().last?.merged !== undefined, `${tag}: merged`, T.why(w));
    }, { mark: 'the Mac\'s note' });
  });
}

// ---------- a cloud client's copy merged in ----------
scenario('absorb', async () => {
  const { w, pc } = await start('absorb', { style: 'dropbox' });
  await guarded('absorb', pc, async () => {
    const cf = path.join(pc.cloudRoot, 'Hearth', 'files', 'kv', 'notes (Mac\'s conflicted copy 2026-10-31).json');
    const v = pc.json(REL); v.push(note('copy', 'only in the cloud client\'s copy'));
    Sim.raw.writeFileSync(cf, JSON.stringify(v));
    for (let i = 0; i < 6 && !has(pc.json(REL), 'only in the cloud'); i++) await T.round(w);
    ok(has(pc.json(REL), 'only in the cloud') && !Sim.raw.existsSync(cf), 'absorb: the copy merged in (and put away)', pc.json(REL).map((x) => x.id));
  }, { mark: 'only in the cloud client\'s copy' });
});

// ---------- Rename for Windows: a store's link follows ----------
scenario('relink', async () => {
  const { w, pc } = await start('relink', { platform: 'darwin' });
  const bad = 'captures/Shot 10:32.png';
  pc.write(bad, Buffer.alloc(300, 7));
  pc.edit(REL, (v) => { v[1].file = pc.p(bad); return v; }); // (a link to the capture, as a store keeps it)
  await T.converge(w);
  await guarded('relink', pc, async () => {
    const r = await pc.e.fix(bad, 'rename');
    ok(r.ok && r.links >= 1, 'relink: renamed, the note\'s link rewritten', r);
  }, { mark: 'Shot 10-32.png' });
});

// ---------- a conflict's choices ----------
for (const keep of ['theirs', 'merge', 'both']) {
  scenario(`resolve-${keep}`, async () => {
    const tag = `resolve-${keep}`;
    const { w, pc, mac } = await start(tag);
    const c = await conflict(tag, w, pc, mac);
    if (!c) return;
    await guarded(tag, pc, async () => { const r = await pc.e.resolve(c.id, keep); ok(r.ok, `${tag}: chosen`, r); }, { mark: keep === 'merge' ? 'a note only the Mac has' : 'Mac\'s text' });
  });
}

// ---------- the same, for a store over 1 MB: its JSON work on the store thread (aside95's asidework.js) ----------
const bigNotes = (m) => m.write(REL, Array.from({ length: 400 }, (_, i) => note(`n${i}`, `note ${i}`, 3000)));
scenario('resolve-theirs-big', async () => {
  const tag = 'resolve-theirs-big';
  const { w, pc, mac } = pair(tag, { big: true });
  bigNotes(pc);
  ok(await T.converge(w) > 0 && fs.statSync(pc.p(REL)).size > 1024 * 1024, `${tag}: first sync (a store over 1 MB)`, T.why(w));
  const c = await conflict(tag, w, pc, mac);
  if (!c) return;
  const t0 = ops.asideTake || 0;
  await guarded(tag, pc, async () => { const r = await pc.e.resolve(c.id, 'theirs'); ok(r.ok && (ops.asideTake || 0) > t0, `${tag}: chosen (on the store thread)`, { r, ops }); }, { mark: 'Mac\'s text' });
});
scenario('aside-theirs-big', async () => {
  const tag = 'aside-theirs-big';
  const { w, pc, mac } = pair(tag, { big: true });
  bigNotes(pc);
  ok(await T.converge(w) > 0, `${tag}: first sync`, T.why(w));
  const n = await keptAside(tag, w, pc, mac);
  if (!n) return;
  const t0 = ops.asideTake || 0;
  await guarded(tag, pc, async () => { const r = await pc.e.aside(n.id, 'theirs'); ok(r.ok && (ops.asideTake || 0) > t0, `${tag}: chosen (on the store thread)`, { r, ops }); }, { mark: 'Mac changed the first note' });
});

// ---------- Kept aside ----------
for (const how of ['theirs', 'both']) {
  scenario(`aside-${how}`, async () => {
    const tag = `aside-${how}`;
    const { w, pc, mac } = await start(tag);
    const n = await keptAside(tag, w, pc, mac);
    if (!n) return;
    await guarded(tag, pc, async () => { const r = await pc.e.aside(n.id, how); ok(r.ok, `${tag}: chosen`, r); }, { mark: 'Mac changed the first note' });
  });
}

// ---------- Restore from Deleted files ----------
const putInTrash = (m, value) => { const f = path.join(m.data, 'sync', 'trash', DAY, 'kv', 'notes.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(value)); return `here:${DAY}/kv/notes.json`; };
scenario('restore', async () => {
  const { pc } = await start('restore');
  const id = putInTrash(pc, [note('n1', 'first'), note('back', 'the version put back')]);
  await guarded('restore', pc, async () => { const r = await pc.e.restore(id, { replace: true }); ok(r.ok, 'restore: put back', r); }, { mark: 'the version put back' });
});
scenario('restore-new', async () => {
  const { w, pc } = await start('restore-new');
  // the store isn't on this computer (gone here); the window holds what it had and has typed a note since
  const win = windowOf(pc, REL); win.load(); pc.e.ackPulled([REL]); take(pc);
  fs.rmSync(pc.p(REL));
  win.change((v) => { v.push(note('typed-here', 'typed on the PC, not saved yet')); });
  const id = putInTrash(pc, [note('n1', 'first'), note('back', 'the version put back')]);
  const r = await pc.e.restore(id);
  ok(r.ok, 'restore-new: put back (nothing here to replace)', r);
  await win.arrive(take(pc));
  const disk = pc.json(REL);
  ok(has(disk, 'the version put back'), 'restore-new: the window\'s waiting save didn\'t write its copy over the version put back', disk.map((x) => x.id));
  ok(has(disk, 'typed on the PC'), 'restore-new: the window\'s own change is kept', disk.map((x) => x.id));
  ok(!fs.existsSync(path.join(pc.data, 'sync', 'trash', DAY, 'kv', 'notes.json')) || has(disk, 'the version put back'), 'restore-new: what came out of Deleted files is somewhere');
  void w;
});
scenario('restore-big', async () => {
  const PAD = 3000; // two notes of ~3 KB… ×200 below: a store of ~1.2 MB
  const { pc } = await start('restore-big', { big: true }, 0);
  pc.write(REL, Array.from({ length: 400 }, (_, i) => note(`n${i}`, `note ${i}`, PAD)));
  ok(fs.statSync(pc.p(REL)).size > 1024 * 1024, 'restore-big: the store is over 1 MB', fs.statSync(pc.p(REL)).size);
  const v = pc.json(REL); v[0] = note('n0', 'the version put back', PAD);
  const id = putInTrash(pc, v);
  const f0 = ops.asideForm || 0;
  await guarded('restore-big', pc, async () => { const r = await pc.e.restore(id, { replace: true }); ok(r.ok && (ops.asideForm || 0) >= f0 + 2, 'restore-big: put back (both forms made on the store thread)', { r, ops }); }, { mark: 'the version put back' });
});

// ---------- a very long chat's pieces taken (syncpack.js) ----------
scenario('packs', async () => {
  const { createPackLane } = require('../syncpack');
  const w = T.world('ss97-packs');
  const ID = 'giant'; const CR = `chats/${ID}.json`;
  const mk = (name, platform) => {
    const m = T.computer(w, name, { platform });
    m.e.stop?.();
    m.lane = createPackLane({ on: () => true, min: 100 * 1024, quietMs: 60000, now: m.now, cut: { min: 16 * 1024, max: 64 * 1024, every: 8 } });
    m.e = m.make({ packs: m.lane });
    return m;
  };
  const pc = mk('PC', 'win32'); const mac = mk('Mac', 'darwin');
  const msgs = Array.from({ length: 500 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', at: 1.7e12 + i * 1000, text: `message ${i} ${'words '.repeat(40)}` }));
  pc.write(CR, { id: ID, agentId: 'claude', title: 'Long chat', createdAt: 1.7e12, updatedAt: 1.7e12 + 5e5, messages: msgs });
  ok(await T.converge(w) > 0, 'packs: first sync', T.why(w));
  // the PC's chat window holds the chat and has a reply of its own waiting (streaming: the save comes in a moment)
  let held = pc.json(CR); pc.e.ackPulled(); take(pc);
  held.messages.push({ role: 'assistant', at: 1.95e12, text: 'the PC\'s reply, not saved yet' });
  const took0 = pc.lane.status().took;
  mac.edit(CR, (c) => { c.messages.push({ role: 'user', at: 1.94e12, text: 'from the Mac, in pieces' }); c.updatedAt = 1.94e12; });
  for (let i = 0; i < 8 && pc.lane.status().took === took0; i++) await T.round(w);
  ok(pc.lane.status().took > took0 && has(pc.json(CR), 'from the Mac, in pieces'), 'packs: the Mac\'s message arrives through the pieces', pc.lane.status());
  ok(take(pc).some((x) => x.rel === CR), 'packs: the window is told');
  // the window can't let it go (a save waiting: Native.forget says no), so its save lands: through the guard
  const saved = pc.e.guardWrite(pc.p(CR), clone(held)); pc.write(CR, saved); held = saved;
  const disk = pc.json(CR);
  ok(has(disk, 'from the Mac, in pieces'), 'packs: the chat window\'s save didn\'t write its older chat over the pieces taken', disk.messages.slice(-3).map((x) => x.text));
  ok(has(disk, 'the PC\'s reply'), 'packs: …and its own reply is kept', disk.messages.slice(-3).map((x) => x.text));
  pc.e.ackPulled([CR]);
  w.clock.advance(70000);
  ok(await T.converge(w, 80) > 0, 'packs: converges', T.why(w));
  for (const m of [pc, mac]) ok(has(m.json(CR), 'from the Mac, in pieces') && has(m.json(CR), 'the PC\'s reply'), `packs: both messages on the ${m.name}`, m.json(CR).messages.slice(-3).map((x) => x.text));
});

// ---------- a save landing while a choice is being made ----------
// The choice reads this computer's version, keeps it in Deleted files (a copy), then writes the result. A save that lands
// in between (a debounced save, a StoreAck holder's write) is the window's latest change: it must not be written over.
function duringCopy(fn) { // runs fn once, right after the next copy into Deleted files (keepHere)
  const fsp = fs.promises; const orig = fsp.copyFile; let done = false;
  fsp.copyFile = async (...a) => { const r = await orig.apply(fsp, a); if (!done && /[\\/]sync[\\/]trash[\\/]/.test(String(a[1]))) { done = true; fn(); } return r; };
  return () => { fsp.copyFile = orig; return done; };
}
async function race(tag, pc, act, mark) {
  const win = windowOf(pc, REL); win.load(); pc.e.ackPulled([REL]); take(pc);
  win.change((v) => { v.push(note('typed-here', 'typed on the PC, saved while the choice was made')); });
  const undo = duringCopy(() => win.save());
  const r = await act();
  ok(undo(), `${tag}: (the save landed during the choice)`);
  ok(r.ok || /changed/i.test(r.error || ''), `${tag}: the choice made, or "it changed: try again"`, r);
  await win.arrive(take(pc));
  const disk = pc.json(REL);
  ok(has(disk, 'saved while the choice was made') && has(win.held, 'saved while the choice was made'), `${tag}: the window's save made during the choice isn't written over (kept on disk and in the window)`, disk.map((x) => x.id));
  if (r.ok) ok(has(disk, mark), `${tag}: …and the choice's result is there`, disk.map((x) => `${x.id}:${String(x.text).slice(0, 30)}`));
}
scenario('race-resolve', async () => {
  const { w, pc, mac } = await start('race-resolve');
  const c = await conflict('race-resolve', w, pc, mac);
  if (c) await race('race-resolve', pc, () => pc.e.resolve(c.id, 'theirs'), 'Mac\'s text');
});
scenario('race-aside', async () => {
  const { w, pc, mac } = await start('race-aside');
  const n = await keptAside('race-aside', w, pc, mac);
  if (n) await race('race-aside', pc, () => pc.e.aside(n.id, 'theirs'), 'Mac changed the first note');
});
scenario('race-restore', async () => {
  const { pc } = await start('race-restore');
  const id = putInTrash(pc, [note('n1', 'first'), note('back', 'the version put back')]);
  await race('race-restore', pc, () => pc.e.restore(id, { replace: true }), 'the version put back');
});

// ---------- Kept aside › Combine… (keptaside.js writeCombined, through store.js) ----------
scenario('combine', async () => {
  const { spawnSync } = require('child_process');
  const ROOT = path.join(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ss97-'));
  for (const f of ['store.js', 'storework.js', 'fswalk.js', 'sync-merge.js', 'sync-hard.js', 'kvops.js', 'scenesafe-core.js', 'datasafe-core.js', 'recall-core.js', 'configsafe-core.js', 'crashsafe-core.js', 'storeack-core.js', 'projects-core.js', 'keptaside-core.js', 'keptaside.js', 'chatwin-core.js', 'bigchat-core.js', 'chatcalc-core.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* not every file is there */ } }
  fs.mkdirSync(path.join(dir, 'data', 'kv'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'kv', 'notes.json'), JSON.stringify([{ id: 'n1', title: 'Plan', text: 'one\ntwo\nthree', updatedAt: 1 }]));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ agents: [{ id: 'claude', name: 'Claude' }], settings: {} }));
  const r = spawnSync(process.execPath, [__filename, '--combine-child'], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  const out = (r.stdout || '').trim().split('\n').pop();
  let res = null; try { res = JSON.parse(out); } catch { /* below */ }
  ok(res && !res.error, 'combine: the child ran', { out: r.stdout?.slice(-1500), err: r.stderr?.slice(-1500) });
  if (res && !res.error) {
    ok(res.disk.includes('two, combined'), 'combine: the combined text stays (the window\'s copy, typed in while it saved, didn\'t write over it)', res);
    ok(res.typed && res.held.includes('two, combined'), 'combine: …what was typed meanwhile is kept, and the window holds the combined text', res);
    ok(res.outsideLeft === 0, 'combine: once the window read it again (ack), its saves are its own again', res);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
async function combineChild() {
  const store = require(path.join(process.cwd(), 'store.js'));
  const SAc = require(path.join(process.cwd(), 'storeack-core.js'));
  const K = require(path.join(process.cwd(), 'keptaside-core.js'));
  const D = path.join(process.cwd(), 'data');
  const J = () => JSON.parse(fs.readFileSync(path.join(D, 'kv', 'notes.json'), 'utf8'));
  // the notes window: holds the notes, saves through the store (as notes.js does, StoreAck-declared)
  let held = store.getKV('notes', []); let dirty = false; let typed = false;
  const C = SAc.create({ ack: (rels, since) => store.outsideAck(rels, since) });
  C.hold('notes', { pending: () => dirty, flush: async () => { await store.setKV('notes', held); await store.idle(); dirty = false; }, read: async () => store.getKV('notes', []), apply: (v) => { held = v; } });
  // keptaside.js's own writeCombined, run against this store (its source, as the window runs it)
  const src = fs.readFileSync(path.join(process.cwd(), 'keptaside.js'), 'utf8');
  const body = /async function writeCombined\(rel, edits\) \{[\s\S]*?\n {2}\}\n/.exec(src)[0];
  const window = { StoreAck: C, hub: {
    kvGet: async (name, d, o) => { const r = store.getKVStatus(name); // something typed in the notes while Combine saves (the read is a moment)
      if (!typed) { typed = true; held = [...held.map((x) => ({ ...x })), { id: 'n2', title: 'Typed', text: 'typed while it saved', updatedAt: 2 }]; dirty = true; }
      return o?.status ? r : r.value ?? d; },
    kvSet: async (name, v, o) => { const w = await store.setKV(name, v, o); await store.idle(); return w; } } };
  // eslint-disable-next-line no-new-func
  const writeCombined = new Function('window', 'K', `${body}; return writeCombined;`)(window, K);
  const edits = [{ path: 'n1.text', text: 'one\ntwo, combined\nthree' }];
  await writeCombined('kv/notes.json', edits);
  await store.idle();
  const disk = JSON.stringify(J());
  console.log(JSON.stringify({ disk, typed: disk.includes('typed while it saved'), held: JSON.stringify(held), outsideLeft: store._outside() }));
  store.flushSync?.();
}

async function main() {
  if (argv.includes('--combine-child')) { try { await combineChild(); } catch (err) { console.log(JSON.stringify({ error: String(err.stack || err) })); } process.exit(0); }
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const f0 = failures;
    try { await s.fn(); } catch (err) { failures += 1; console.log(`FAIL ${s.name}: threw ${err.stack || err}`); }
    console.log(`${failures === f0 ? 'ok  ' : 'FAIL'} ${s.name}`);
  }
  console.log(JSON.stringify({ pass: failures === 0, passes, failures, ms: Date.now() - t0 }));
  process.exit(failures ? 1 : 0);
}
main();
