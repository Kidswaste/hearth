#!/usr/bin/env node
// (round 90, devices90) "Forget this computer…" and the space very long chats' pieces take (devices90-core.js), with the
// REAL sync engine and the pack lane on three computers through dev/sync-sim.js (each its own view of the cloud drive):
//   1. forget: an old laptop (an older Hearth) that stopped syncing keeps "Send very long chats in pieces" shut for the
//      other two; the list shows it (name, system, last seen, version, reads pieces) as not seen for a week; forgetting
//      it MOVES its record to .sync/forgotten (the same bytes, never deleted); this computer and a computer seen lately
//      can't be forgotten; the gate opens on both, pieces flow
//   2. rejoin: the forgotten laptop comes back with messages it wrote while away: nothing lost or doubled on any of the
//      three, never shorter, its record back (the gate shuts again: it doesn't read pieces), listed "came back"
//   3. rejoin (this version): the engine's hook writes the record of a forgotten computer at the start of its first pass
//      back; for a computer that wasn't forgotten it does nothing
//   4. forget refusals on a made-up folder: a record being written, a record that can't be read right now (held), a
//      record rewritten between the look and the move, odd names
//   5. free up: only kept-aside pieces older than 7 days move (to a stand-in Trash), never a piece any manifest names;
//      a manifest that can't be read anywhere (cloud folder, packbase, pack trash) or one only in the cloud (placeholder)
//      = nothing moves at all; a Trash that refuses = the piece stays; space() adds up
//   node dev/devices90-test.js [--only name,…] [--verbose]
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const T = require('./sync72-test'); // (installs the simulator)
const Sim = require('./sync-sim');
const PK = require('./packs89-test'); // (its made-up chats and helpers; its own run doesn't start)
const P = require('../chatpack-core');
const C = require('../syncpack-core');
const DV = require('../devices90-core');
const { createPackLane } = require('../syncpack');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ONLY = arg('--only', '');
const VERBOSE = argv.includes('--verbose');
let failures = 0; let passes = 0;
const ok = (cond, what, detail) => { if (cond) { passes += 1; if (VERBOSE) console.log(`  ok ${what}`); } else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`); } };
const raw = Sim.raw;
const DAY = 864e5;
const roots = new Set();
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-devices90-'));
roots.add(SCRATCH);

const { REL, ID, MINT, CUT, makeChat, say, texts, rounds, converge } = PK;
// a computer with the pack lane (o.lane false: an older Hearth: no lane, no hook) and the devices hook
function computer(w, name, o = {}) {
  const m = T.computer(w, name, o);
  m.e.stop();
  m.packsOn = o.on !== false;
  m.lane = o.lane === false ? null : createPackLane({ on: () => m.packsOn, min: MINT, quietMs: 60000, now: m.now, cut: CUT, log: VERBOSE ? (...a) => console.log(`  ${name}:`, ...a) : undefined });
  m.hookCalls = [];
  const hk = DV.hook(fsp, path.join(m.cloudRoot, 'Hearth'));
  m.e = m.make({ ...(m.lane ? { packs: m.lane } : {}), ...(o.lane === false || o.hook === false ? {} : { devices: { beforePass: async (a) => { const r = await hk.beforePass(a); m.hookCalls.push(r); return r; } } }), appVersion: o.app });
  m.counts = []; m.view.stats.upBy ||= {};
  return m;
}
const where = (m) => ({ cloudDir: path.join(m.cloudRoot, 'Hearth'), stateDir: path.join(m.data, 'sync'), myId: m.e.machine().id });
const machinesDir = (m) => path.join(m.cloudRoot, 'Hearth', '.sync', 'machines');
const recFile = (m, of) => path.join(machinesDir(m), `${of.e.machine().id}.json`);
const never = (m) => m.counts.every((x, i) => i === 0 || x < 0 || m.counts[i - 1] < 0 || x >= m.counts[i - 1]);
function leave(w, m) { w.ms.splice(w.ms.indexOf(m), 1); }
function back(w, m) { for (let i = 0; i < 6; i++) m.view.tick(); w.ms.push(m); } // (its cloud client catches up first, as when the laptop is opened)

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// ---------- 1 + 2. forget an old laptop, then it comes back ----------
scenario('forget', async () => {
  const w = T.world('devices90-forget'); roots.add(path.dirname(w.dir));
  const pc = computer(w, 'PC', { platform: 'win32', app: '0.90.0' });
  const mac = computer(w, 'Mac', { platform: 'darwin', app: '0.90.0' });
  const old = computer(w, 'OldLaptop', { platform: 'win32', lane: false }); // an older Hearth (no "packs", no version in its record)
  pc.write(REL, makeChat(ID, 400, 21));
  ok(await converge(w, 80) > 0, 'forget: first sync on three computers', T.why(w));
  ok(pc.lane.status().gate.why === 'older' && mac.lane.status().gate.why === 'older', 'forget: the old laptop (no "packs") keeps the gate shut on both', [pc.lane.status().gate, mac.lane.status().gate]);
  // the laptop goes away for good (a week and more)
  leave(w, old);
  w.clock.advance(8 * DAY);
  say(pc, 'a week later', pc.now());
  ok(await converge(w) > 0, 'forget: the two others go on', T.why(w));
  ok(pc.lane.status().gate.ok === false, 'forget: …and the gate is still shut for the laptop that never comes back', pc.lane.status().gate);
  // the list (this computer's view of the cloud folder)
  const L = await DV.list(fsp, { ...where(pc), now: pc.now() });
  const byName = Object.fromEntries(L.computers.map((c) => [c.name, c]));
  ok(L.computers.length === 3 && byName.PC?.me && !byName.Mac?.me && byName.OldLaptop, 'list: the three computers, this one marked', L.computers.map((c) => [c.name, c.me]));
  ok(byName.PC.platform === 'win32' && byName.Mac.platform === 'darwin' && byName.Mac.app === '0.90.0' && byName.Mac.packs === true && byName.OldLaptop.packs === false && byName.OldLaptop.app === '', 'list: system, Hearth version, reads pieces', L.computers);
  ok(byName.OldLaptop.stale && byName.OldLaptop.canForget && !byName.Mac.stale && !byName.Mac.canForget && !byName.PC.canForget, 'list: only the laptop not seen for a week can be forgotten', L.computers.map((c) => [c.name, c.stale, c.canForget]));
  ok(Math.abs(pc.now() - byName.OldLaptop.lastSeen - 8 * DAY) < 2 * DAY && pc.now() - byName.Mac.lastSeen < 3600e3, 'list: last seen', { old: pc.now() - byName.OldLaptop.lastSeen, mac: pc.now() - byName.Mac.lastSeen });
  // refusals
  ok((await DV.forget(fsp, { ...where(pc), file: byName.PC.file, now: pc.now() })).why === 'this-computer', 'forget: never this computer');
  ok((await DV.forget(fsp, { ...where(pc), file: byName.Mac.file, now: pc.now() })).why === 'recent', 'forget: never a computer seen lately');
  ok(raw.existsSync(recFile(pc, pc)) && raw.existsSync(recFile(pc, mac)), 'forget: (their records are where they were)');
  // forgotten
  const before = raw.readFileSync(recFile(pc, old));
  const r = await DV.forget(fsp, { ...where(pc), file: byName.OldLaptop.file, now: pc.now(), by: 'PC' });
  const moved = r.ok ? raw.readFileSync(path.join(pc.cloudRoot, 'Hearth', r.to)) : null;
  ok(r.ok && !raw.existsSync(recFile(pc, old)) && moved && moved.equals(before), 'forget: its record is MOVED to .sync/forgotten (the very same bytes; nothing deleted)', r);
  ok(raw.readdirSync(path.join(pc.cloudRoot, 'Hearth', '.sync', 'forgotten')).some((f) => f.endsWith('.note.json')), 'forget: with a small note (who, when)');
  const L2 = await DV.list(fsp, { ...where(pc), now: pc.now() });
  ok(L2.computers.length === 2 && L2.forgotten.length === 1 && L2.forgotten[0].name === 'OldLaptop' && !L2.forgotten[0].back && L2.forgotten[0].by === 'PC', 'forget: listed as forgotten', L2);
  // the gate reopens on both (the Mac's view gets the move from the provider)
  const pub0 = pc.lane.status().published; const took0 = mac.lane.status().took;
  for (let i = 0; i < 3; i++) { say(i % 2 ? mac : pc, `pieces ${i}`, pc.now() + i); await rounds(w, 2); }
  ok(await converge(w) > 0, 'forget: converges', T.why(w));
  ok(pc.lane.status().gate.ok && mac.lane.status().gate.ok, 'forget: the gate reopens on both (the laptop was the only one keeping it shut)', [pc.lane.status().gate, mac.lane.status().gate]);
  ok(pc.lane.status().published > pub0 && mac.lane.status().took > took0, 'forget: the pieces carry the changes now', { pc: pc.lane.status().published, mac: mac.lane.status().took });
  ok(C.gate(C.readRecords(fs, machinesDir(mac), mac.e.machine().id), true).ok, 'forget: the gate rule itself, on the Mac\'s view');
  // 2. the laptop comes back, with messages written while it was away (it never knew it was forgotten)
  old.edit(REL, (c) => { c.messages.push({ role: 'user', at: old.now(), text: 'written on the laptop while away' }); c.updatedAt = old.now(); });
  const want = ['a week later', 'pieces 0', 'pieces 1', 'pieces 2', 'written on the laptop while away'];
  back(w, old);
  for (const m of w.ms) m.counts = [];
  ok(await converge(w, 100) > 0, 'rejoin: converges with the laptop back', T.why(w));
  ok(raw.existsSync(recFile(pc, old)) && raw.existsSync(recFile(mac, old)), 'rejoin: its record is back in the computers\' list');
  ok(pc.lane.status().gate.ok === false && mac.lane.status().gate.ok === false, 'rejoin: it doesn\'t read pieces: the gate shuts again on both', [pc.lane.status().gate, mac.lane.status().gate]);
  ok(w.ms.every((m) => want.every((t) => texts(m).includes(t))), 'rejoin: nothing lost on any of the three (its own messages too)', w.ms.map((m) => texts(m).slice(-6)));
  ok(w.ms.every((m) => !texts(m).some((t, i, a) => a.indexOf(t) !== i && /week|pieces|away/.test(t))), 'rejoin: nothing doubled');
  ok(w.ms.every(never), 'rejoin: never shorter on any computer', w.ms.map((m) => m.counts.slice(-10)));
  say(old, 'after coming back', old.now());
  ok(await converge(w, 80) > 0 && w.ms.every((m) => texts(m).includes('after coming back')), 'rejoin: it syncs on as usual', T.why(w));
  const L3 = await DV.list(fsp, { ...where(pc), now: pc.now() });
  ok(L3.computers.length === 3 && L3.forgotten[0]?.back === true, 'rejoin: listed again, and the forgotten entry says it came back', L3.forgotten);
});

// ---------- 3. this version comes back: its record at the start of its first pass ----------
scenario('hook', async () => {
  const w = T.world('devices90-hook'); roots.add(path.dirname(w.dir));
  const pc = computer(w, 'PC', { platform: 'win32' });
  const lap = computer(w, 'Laptop', { platform: 'darwin', on: false }); // this version, the setting off here
  pc.write(REL, makeChat(ID, 300, 22));
  ok(await converge(w) > 0, 'hook: first sync', T.why(w));
  ok(lap.hookCalls.length > 0 && lap.hookCalls.every((r) => !r.back), 'hook: a computer that wasn\'t forgotten: nothing done (its record is written as today)', lap.hookCalls);
  leave(w, lap);
  w.clock.advance(9 * DAY);
  await rounds(w, 2);
  const r = await DV.forget(fsp, { ...where(pc), file: `${lap.e.machine().id}.json`, now: pc.now(), by: 'PC' });
  ok(r.ok, 'hook: the laptop is forgotten', r);
  await rounds(w, 2);
  lap.write('notes/away.md', '# written while away\n');
  back(w, lap);
  ok(!raw.existsSync(recFile(lap, lap)), 'hook: (its own view of the cloud folder no longer has its record)');
  lap.hookCalls = [];
  await T.pass(lap);
  ok(lap.hookCalls[0]?.back === true && raw.existsSync(recFile(lap, lap)), 'hook: its first pass back writes its record at once (before anything moves)', lap.hookCalls);
  const rec = JSON.parse(raw.readFileSync(recFile(lap, lap), 'utf8'));
  ok(rec.id === lap.e.machine().id && rec.name === 'Laptop' && !('packs' in rec), 'hook: the record is its own (the same id: a returning computer)', rec);
  ok(await converge(w) > 0 && pc.read('notes/away.md') === '# written while away\n', 'hook: what it wrote while away arrives', T.why(w));
  lap.hookCalls = []; await T.pass(lap);
  ok(lap.hookCalls.every((r2) => !r2.back), 'hook: once back, nothing more', lap.hookCalls);
});

// ---------- 4. forget refusals (a made-up folder) ----------
scenario('refuse', async () => {
  const cloud = path.join(SCRATCH, 'refuse', 'Hearth'); const md = path.join(cloud, '.sync', 'machines');
  fs.mkdirSync(md, { recursive: true });
  const now = Date.now();
  const put = (id, rec, age) => { const f = path.join(md, `${id}.json`); fs.writeFileSync(f, typeof rec === 'string' ? rec : JSON.stringify(rec)); const t = new Date(now - age); fs.utimesSync(f, t, t); return f; };
  put('me-1', { id: 'me-1', name: 'Me', lastSeen: now }, 0);
  put('cut-1', '{"id":"cut-1","na', 1000); // being written right now
  const oldCut = put('cut-2', '{"id":"cut-2","na', 10 * DAY); // garbled and untouched for 10 days
  const held = put('held-1', { id: 'held-1', name: 'Held', lastSeen: now - 30 * DAY }, 30 * DAY);
  const moving = put('moving-1', { id: 'moving-1', name: 'Moving', lastSeen: now - 30 * DAY }, 30 * DAY);
  fs.writeFileSync(path.join(md, 'x 2.json'), JSON.stringify({ id: 'x', name: 'copy' })); // a cloud client's copy: not a computer
  const L = await DV.list(fsp, { cloudDir: cloud, myId: 'me-1', now });
  ok(L.computers.length === 5 && L.computers.filter((c) => c.unreadable).length === 2 && L.computers.find((c) => c.file === 'cut-1.json')?.canForget === false && L.computers.find((c) => c.file === 'cut-2.json')?.canForget === true, 'refuse: records that can\'t be read are listed (they shut the gate), never left out; a conflict copy isn\'t a computer', L.computers.map((c) => [c.file, c.unreadable, c.canForget]));
  ok((await DV.forget(fsp, { cloudDir: cloud, myId: 'me-1', file: 'cut-1.json', now })).why === 'being-written' && fs.existsSync(path.join(md, 'cut-1.json')), 'refuse: a record being written right now is never forgotten');
  ok((await DV.forget(fsp, { cloudDir: cloud, myId: 'me-1', file: 'me-1.json', now })).why === 'this-computer', 'refuse: this computer');
  for (const bad of ['../me-1.json', '.hidden.json', 'a/b.json', '', null, 'x 2.json']) ok(!(await DV.forget(fsp, { cloudDir: cloud, myId: 'me-1', file: bad, now })).ok, `refuse: odd name ${JSON.stringify(bad)}`);
  // a read that fails (held by another program): never "nothing there", nothing moved
  const heldFs = { ...fsp, readFile: async (p, e) => { if (p === held) throw Object.assign(new Error('busy'), { code: 'EBUSY' }); return fsp.readFile(p, e); } };
  ok((await DV.forget(heldFs, { cloudDir: cloud, myId: 'me-1', file: 'held-1.json', now })).why === 'unreadable' && fs.existsSync(held), 'refuse: a record that can\'t be read right now: nothing changed');
  // rewritten between the look and the move (the computer synced meanwhile): not forgotten
  let n = 0;
  const racyFs = { ...fsp, readFile: async (p, e) => { if (p === moving && ++n === 2) fs.writeFileSync(moving, JSON.stringify({ id: 'moving-1', name: 'Moving', lastSeen: now })); return fsp.readFile(p, e); } };
  ok((await DV.forget(racyFs, { cloudDir: cloud, myId: 'me-1', file: 'moving-1.json', now })).why === 'recent' && fs.existsSync(moving), 'refuse: a record rewritten just before the move stays');
  const r = await DV.forget(fsp, { cloudDir: cloud, myId: 'me-1', file: 'cut-2.json', now });
  ok(r.ok && !fs.existsSync(oldCut) && fs.readFileSync(path.join(cloud, r.to), 'utf8') === '{"id":"cut-2","na', 'refuse: a garbled record untouched for 10 days can be forgotten (moved as it is)', r);
  // rejoin (pure): only a missing own record with a forgotten copy
  let wrote = 0; const wm = async () => { wrote += 1; };
  ok(!(await DV.rejoin(fsp, { cloudDir: cloud, id: 'me-1', writeMachine: wm })).back && wrote === 0, 'rejoin: own record there: nothing');
  ok(!(await DV.rejoin(fsp, { cloudDir: cloud, id: 'new-1', writeMachine: wm })).back && wrote === 0, 'rejoin: a new computer (never forgotten): nothing (its record is written as today)');
  ok((await DV.rejoin(fsp, { cloudDir: cloud, id: 'cut-2', writeMachine: wm })).back && wrote === 1, 'rejoin: forgotten and back: its record at once');
  const busyFs = { ...fsp, stat: async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } };
  ok(!(await DV.rejoin(busyFs, { cloudDir: cloud, id: 'cut-2', writeMachine: wm })).back && wrote === 1, 'rejoin: its record can\'t be looked at: nothing (never taken as "gone")');
  const bad = await DV.list({ ...fsp, readdir: async () => { throw Object.assign(new Error('x'), { code: 'EIO' }); } }, { cloudDir: cloud, myId: 'me-1', now });
  ok(bad.error === 'EIO' && bad.computers.length === 0, 'refuse: a computers\' folder that can\'t be read says so (never "no computers")', bad);
});

// ---------- 5. free up ----------
function packWorld(tag) {
  const base = path.join(SCRATCH, tag); const cloudDir = path.join(base, 'cloud', 'Hearth'); const stateDir = path.join(base, 'data', 'sync');
  const binDir = path.join(base, 'os-trash');
  fs.mkdirSync(binDir, { recursive: true });
  const seg = (dir, text) => { const b = Buffer.from(text); const h = P.sha1(b); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${h}.seg`), b); return { h, n: 1, b: b.length }; };
  const man = (dir, by, segs) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, P.manifestName(by)), P.manifestText({ hearthChatPack: 1, id: 'c1', by, seq: 1, at: 1, layout: 'compact', pre: '{"messages":', post: '}', n: segs.length, sealed: Math.max(0, segs.length - 1), segs })); };
  return { base, cloudDir, stateDir, binDir, seg, man, trashItem: async (p) => { const to = path.join(binDir, `${crypto.randomBytes(3).toString('hex')}-${path.basename(p)}`); fs.renameSync(p, to); return to; } };
}
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const exists = (p) => fs.existsSync(p);
scenario('free', async () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const X = packWorld('free');
  const old = dayOf(now - 10 * DAY); const young = dayOf(now - 2 * DAY);
  const T0 = path.join(X.stateDir, 'packtrash');
  // live: the cloud folder's pieces and a manifest; this computer's packbase copy and its manifest
  const live = X.seg(path.join(X.cloudDir, 'packs', 'chats', 'c1'), '"live message"');
  const named = X.seg(path.join(X.cloudDir, 'packs', 'chats', 'c1'), '"named again"');
  X.man(path.join(X.cloudDir, 'packs', 'chats', 'c1'), 'pc-1', [live, named]);
  const baseSeg = X.seg(path.join(X.stateDir, 'packbase', 'c1'), '"base message"');
  X.man(path.join(X.stateDir, 'packbase', 'c1'), 'peer-mac-1', [baseSeg]);
  // the pack trash: old pieces (one of them a name a live manifest uses again), young ones, an old own manifest
  const a = X.seg(path.join(T0, 'cloud', old, 'c1'), '"old orphan a"');
  X.seg(path.join(T0, 'cloud', old, 'c1'), '"named again"'); // (the same piece as a live one: never moved)
  const b = X.seg(path.join(T0, 'base', old, 'c1'), '"old orphan b"');
  X.seg(path.join(T0, 'base', old, 'c1'), '"base message"'); // (named by packbase's manifest)
  const sOld = X.seg(path.join(T0, 'base', old, 'c2'), '"old self piece"');
  X.man(path.join(T0, 'self', old, 'c2'), 'self-3', [sOld]); // (an old own version: it goes too, so its piece isn't kept for it)
  const y = X.seg(path.join(T0, 'cloud', young, 'c1'), '"young orphan"');
  const ySelf = X.seg(path.join(T0, 'base', old, 'c3'), '"named by a young self manifest"');
  X.man(path.join(T0, 'self', young, 'c3'), 'self-4', [ySelf]); // (a manifest kept aside lately still names its piece)
  const sp = await DV.space(fsp, { cloudDir: X.cloudDir, stateDir: X.stateDir, now });
  const sizeOfTree = (d) => { let s = 0; const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, e.name); if (e.isDirectory()) walk(q); else s += fs.statSync(q).size; } }; if (exists(d)) walk(d); return s; };
  ok(sp.cloud.bytes === sizeOfTree(path.join(X.cloudDir, 'packs')) && sp.base.bytes === sizeOfTree(path.join(X.stateDir, 'packbase')) && sp.trash.bytes === sizeOfTree(T0) && sp.trash.old === sp.trash.bytes - sizeOfTree(path.join(T0, 'cloud', young)) - sizeOfTree(path.join(T0, 'self', young)), 'space: the pieces in the cloud folder, the copies kept for merging, the pack trash and its part older than 7 days', sp);
  const dry = await DV.freeUp(fsp, { cloudDir: X.cloudDir, stateDir: X.stateDir, now, dry: true, trashItem: async () => { throw new Error('dry'); } });
  ok(dry.ok && dry.moved > 0 && fs.readdirSync(X.binDir).length === 0, 'free: a dry run moves nothing', dry);
  const r = await DV.freeUp(fsp, { cloudDir: X.cloudDir, stateDir: X.stateDir, now, trashItem: X.trashItem });
  const inTrash = (kind, d, c, h) => exists(path.join(T0, kind, d, c, `${h}.seg`));
  ok(r.ok && !inTrash('cloud', old, 'c1', a.h) && !inTrash('base', old, 'c1', b.h) && !inTrash('base', old, 'c2', sOld.h) && !exists(path.join(T0, 'self', old)), 'free: old kept-aside pieces (and an old own version) moved to the Trash', r);
  ok(inTrash('cloud', old, 'c1', named.h) && inTrash('base', old, 'c1', baseSeg.h) && inTrash('base', old, 'c3', ySelf.h), 'free: a piece any manifest still names is never touched (cloud folder, packbase, a manifest kept aside lately)');
  ok(inTrash('cloud', young, 'c1', y.h) && exists(path.join(T0, 'self', young, 'c3', P.manifestName('self-4'))), 'free: pieces younger than 7 days stay');
  ok(exists(path.join(X.cloudDir, 'packs', 'chats', 'c1', `${live.h}.seg`)) && exists(path.join(X.cloudDir, 'packs', 'chats', 'c1', `${named.h}.seg`)) && exists(path.join(X.stateDir, 'packbase', 'c1', `${baseSeg.h}.seg`)), 'free: nothing outside the pack trash moves');
  ok(dry.bytes === r.bytes && dry.moved === r.moved && dry.bytes < sp.trash.old, 'free: the dry run (the size the button shows) = what really moves, never the named pieces', { dry, r, old: sp.trash.old });
  ok(r.kept === 3 && fs.readdirSync(X.binDir).length === r.items.length && r.bytes > 0, 'free: everything moved is in the Trash (moved, not deleted)', { r, bin: fs.readdirSync(X.binDir) });
  for (const m of P.manifests(fs, path.join(X.cloudDir, 'packs', 'chats', 'c1'))) ok(!m.error && (() => { try { P.read(fs, path.join(X.cloudDir, 'packs', 'chats', 'c1'), m.m, { verify: false }); return true; } catch (err) { return err.code === 'count'; } })(), 'free: the live manifest still finds all its pieces');
  const sp2 = await DV.space(fsp, { cloudDir: X.cloudDir, stateDir: X.stateDir, now });
  ok(sp2.trash.bytes === sp.trash.bytes - r.bytes, 'free: the space shown goes down by what moved', { before: sp.trash, after: sp2.trash, moved: r.bytes });
});
scenario('unreadable', async () => {
  const now = Date.parse('2026-10-30T12:00:00Z'); const old = dayOf(now - 10 * DAY); const young = dayOf(now - 1 * DAY);
  const cases = [
    ['a cut manifest in the cloud folder', (X) => fs.writeFileSync(path.join(X.cloudDir, 'packs', 'chats', 'c9', 'm-mac-1.json'), '{"hearthChatPack":1,"id":"c9"'), 'manifest'],
    ['a manifest still only in the cloud (an iCloud placeholder)', (X) => fs.writeFileSync(path.join(X.cloudDir, 'packs', 'chats', 'c9', '.m-mac-1.json.icloud'), 'stub'), 'placeholder'],
    ['a garbled manifest in packbase', (X) => { fs.mkdirSync(path.join(X.stateDir, 'packbase', 'c9'), { recursive: true }); fs.writeFileSync(path.join(X.stateDir, 'packbase', 'c9', 'm-peer-mac-1.json'), '\0\0\0\0'); }, 'manifest'],
    ['a garbled manifest in the pack trash', (X) => { fs.mkdirSync(path.join(X.stateDir, 'packtrash', 'self', young, 'c9'), { recursive: true }); fs.writeFileSync(path.join(X.stateDir, 'packtrash', 'self', young, 'c9', 'm-self-2.json'), '{'); }, 'manifest'],
    ['a manifest written by a newer Hearth', (X) => { const t = JSON.parse(P.manifestText({ hearthChatPack: 1, id: 'c9', by: 'mac-1', seq: 1, at: 1, layout: 'compact', pre: '', post: '', n: 0, sealed: 0, segs: [] })); t.hearthChatPack = 2; fs.writeFileSync(path.join(X.cloudDir, 'packs', 'chats', 'c9', 'm-mac-1.json'), JSON.stringify(t)); }, 'newer'],
  ];
  for (const [what, spoil, held] of cases) {
    const X = packWorld(`unreadable-${held}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(path.join(X.cloudDir, 'packs', 'chats', 'c9'), { recursive: true });
    const a = X.seg(path.join(X.stateDir, 'packtrash', 'cloud', old, 'c9'), '"orphan"');
    spoil(X);
    const r = await DV.freeUp(fsp, { cloudDir: X.cloudDir, stateDir: X.stateDir, now, trashItem: X.trashItem });
    ok(!r.ok && r.held === held && r.moved === 0 && exists(path.join(X.stateDir, 'packtrash', 'cloud', old, 'c9', `${a.h}.seg`)) && fs.readdirSync(X.binDir).length === 0, `unreadable: ${what} → nothing removed at all`, r);
  }
  // a pieces folder that can't be read
  const X = packWorld('unreadable-folder');
  X.seg(path.join(X.stateDir, 'packtrash', 'cloud', old, 'c9'), '"orphan"');
  const eio = { ...fsp, readdir: async (p, o) => { if (String(p).includes(`${path.sep}packs`)) throw Object.assign(new Error('io'), { code: 'EIO' }); return fsp.readdir(p, o); } };
  const r = await DV.freeUp(eio, { cloudDir: X.cloudDir, stateDir: X.stateDir, now, trashItem: X.trashItem });
  ok(!r.ok && r.held === 'folder' && fs.readdirSync(X.binDir).length === 0, 'unreadable: a pieces folder that can\'t be read → nothing removed', r);
  // a Trash that refuses (a drive without one): the piece stays, said why
  const Y = packWorld('no-trash');
  const b = Y.seg(path.join(Y.stateDir, 'packtrash', 'cloud', old, 'c9'), '"orphan"');
  const r2 = await DV.freeUp(fsp, { cloudDir: Y.cloudDir, stateDir: Y.stateDir, now, trashItem: async () => { throw new Error('no Trash on that drive: left where it is'); } });
  ok(r2.ok && r2.moved === 0 && r2.failed.length === 1 && /no Trash/.test(r2.failed[0].why) && exists(path.join(Y.stateDir, 'packtrash', 'cloud', old, 'c9', `${b.h}.seg`)), 'unreadable: a Trash that refuses: the pieces stay where they are (never deleted instead)', r2);
  // nothing at all yet
  const Z = packWorld('empty');
  const r3 = await DV.freeUp(fsp, { cloudDir: Z.cloudDir, stateDir: Z.stateDir, now, trashItem: Z.trashItem });
  const s3 = await DV.space(fsp, { cloudDir: Z.cloudDir, stateDir: Z.stateDir, now });
  ok(r3.ok && r3.moved === 0 && s3.cloud.bytes === 0 && s3.trash.bytes === 0 && !s3.error, 'unreadable: no pieces at all: nothing to do, zero space');
});
scenario('words', async () => {
  ok(DV.fmt(0) === '0 MB' && DV.fmt(52e6) === '52 MB' && DV.fmt(2.4e9) === '2.4 GB' && DV.fmt(1500) === '2 KB', 'words: sizes in plain words');
  ok(DV.ago(Date.now() - 8 * DAY) === '8 days ago' && DV.ago(0) === 'never', 'words: last seen in plain words');
  ok(DV.platformWord('win32') === 'Windows' && DV.platformWord('darwin') === 'Mac', 'words: systems');
  ok(Object.values(DV.HELD).every((t) => /nothing was removed/.test(t)), 'words: every held free-up says nothing was removed');
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.split(',').includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  console.log(`\ndevices90: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  if (!argv.includes('--keep')) for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* fine */ } }
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
