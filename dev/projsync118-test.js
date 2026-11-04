#!/usr/bin/env node
// (round 118, projsync118) "Every chat belongs to exactly one project" (round 116, projchats116) across two computers,
// through the two-computer simulator (dev/sync-sim.js, the worlds of dev/sync72-test.js, the real sync engine and its
// merge) — mostly with ONE computer still on the older Hearth (chats in several projects or none, "Take out of"):
//   old       the PC on this release, the Mac on the older one: the Mac adds a chat to a second project (the keeper
//             leaves it in one, both agree, nothing moves on repeated syncs; also with the Mac's clock an hour behind
//             and the chat given back to a project the migration had moved it out of); the Mac takes a chat out of its
//             only project, makes a chat with no project: Earlier chats after the grace, never gone
//   both      both computers migrate at the same time, clocks 7 minutes apart: one Earlier chats, the same placement
//   deleted   Earlier chats deleted on the PC while the Mac moves a chat into it (this release / the older one); a
//             project with chats deleted (on the older Mac, on this PC): its chats go to Earlier chats at once
//   unread    the projects store held (EBUSY) or gone after the migration: the keeper skips, nothing written
//   window    the window's side (projchats.js in a small fake window): the keeper skips an unreadable store; an
//             import by the owner goes to the open project at once with a note (else Earlier chats)
// The PC's "app" here is ProjChatsCore as projchats.js runs it (the careful read, the sweep, a save when it changed);
// the older Mac's edits are what its Projects did (an add that isn't a move, a take-out, a delete to Recently deleted).
// Never touches real data: temp folders only (sync72-test's own, under the system's temp folder).
//   node dev/projsync118-test.js [--only old,both,deleted,unread,window] [--keep]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) { passes += 1; console.log(`✓ ${what}`); } else { failures += 1; console.log(`✖ ${what}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ''}`); } };
function rmTemp(d) { // only a test's own temp folder: directly under the system's temp folder, named by a test
  const r = path.resolve(d);
  if (path.dirname(r) !== path.resolve(os.tmpdir()) || !/^hearth-sync72-/.test(path.basename(r))) { console.log(`  (not removed: ${r})`); return; }
  fs.rmSync(r, { recursive: true, force: true });
}

const T = require('./sync72-test');
const Sim = require('./sync-sim');
const C = require('../projects-core');
const K = require('../projchats-core');
const clone = (x) => JSON.parse(JSON.stringify(x));
const GRACE = 3 * 60000;
const REL = 'kv/projects.json';

// ---------- the two computers' Hearths ----------
const chatsOf = (m) => { let names = []; try { names = fs.readdirSync(m.p('chats')).filter((f) => f.endsWith('.json')); } catch { /* none */ } return names.map((f) => m.json(`chats/${f}`)).filter((c) => c && c.id).map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt })); };
// this release: the careful read (kv:get { status: true }), then the migration once, the keeper after (projchats.js)
function newApp(m) {
  const seen = new Map();
  m.done = false; m.writes = 0;
  m.app = async () => {
    let r;
    // (read as the main process does: the simulated locks apply)
    try { const t = await fs.promises.readFile(m.p(REL), 'utf8'); try { r = { state: 'ok', value: JSON.parse(t) }; } catch { r = { state: 'unreadable' }; } } catch (err) { r = err.code === 'ENOENT' ? { state: 'missing' } : { state: 'unreadable' }; }
    const held = r.state === 'ok' && r.value && Array.isArray(r.value.list) ? C.normalize(clone(r.value)) : { v: 1, list: [], dismissed: [] };
    const rd = K.readable(r, { held, chats: chatsOf(m), done: m.done });
    if (!rd.ok) return { skipped: rd.why };
    const first = !m.done;
    const s = K.sweep(held, chatsOf(m), first ? { at: m.now() } : { at: m.now(), ready: K.lostReady(held, seen, m.now(), GRACE) });
    m.done = true;
    for (const id of [...seen.keys()]) if (K.where(held).has(id)) seen.delete(id);
    if (s.changed) { m.write(REL, held); m.writes += 1; }
    return s;
  };
  return m;
}
const oldApp = (m) => { m.app = async () => null; m.writes = 0; return m; };
// the older Hearth's Projects: add (not a move), take out, delete (to Recently deleted)
const editP = (m, fn) => m.edit(REL, (d) => { const v = C.normalize(d); fn(v); m.writes = (m.writes || 0) + 1; return v; });
const oldAdd = (m, pid, chatId) => editP(m, (d) => C.addItem(d.list.find((p) => p.id === pid), { type: 'chat', ref: chatId, name: chatId }, m.now()));
const oldTakeOut = (m, pid, chatId) => editP(m, (d) => C.removeItem(d.list.find((p) => p.id === pid), 'chat', chatId, m.now()));
const del = (m, pid) => editP(m, (d) => { const p = d.list.find((x) => x.id === pid); d.list = d.list.filter((x) => x !== p); d.trash = [{ ...p, deletedAt: m.now() }, ...(d.trash || [])]; });
const newMove = (m, chatId, pid) => editP(m, (d) => K.move(d, chatId, pid, { at: m.now() }));
// a round of sync, then each computer's Hearth looks at what arrived
async function cycle(w, n = 1) { for (let i = 0; i < n; i++) { await T.round(w); for (const m of w.ms) await m.app(); } }
async function settle(w, max = 60) { for (let i = 1; i <= max; i++) { await cycle(w); if (i >= 2 && T.settled(w)) return i; } return -1; }
const proj = (m) => C.normalize(m.json(REL) || {});
const where = (m, id) => proj(m).list.filter((p) => C.has(p, 'chat', id)).map((p) => p.id);
const problems = (m) => K.problems(proj(m), chatsOf(m));
// repeated syncs: nothing written by either Hearth, the store the same on both
async function steady(w, what) {
  const before = w.ms.map((m) => m.read(REL)); const wr = w.ms.map((m) => m.writes);
  await cycle(w, 6);
  ok(w.ms.every((m, i) => m.read(REL) === before[i] && m.writes === wr[i]), `${what}: no back-and-forth over 6 more syncs (nothing written, nothing changed)`, w.ms.map((m, i) => ({ n: m.name, writes: m.writes - wr[i] })));
}
const chat = (m, id) => m.write(`chats/${id}.json`, T.chat(id, [T.msg('user', 1, `hello ${id}`)], { createdAt: 1000 + id.length, title: id }));
// two computers with a store from before round 116 (A: c1 + c3, B: c2 + c3, c0 in none), synced, then migrated
async function start(name, { macOld = true, macSkew = 0, pcSkew = 0, migrate = true } = {}) {
  const w = T.world(name);
  const pc = newApp(T.computer(w, 'PC', { platform: 'win32', skew: pcSkew }));
  const mac = (macOld ? oldApp : newApp)(T.computer(w, 'Mac', { platform: 'darwin', skew: macSkew }));
  for (const id of ['c0', 'c1', 'c2', 'c3']) chat(pc, id);
  const A = C.create({ id: 'pjA', name: 'Stoop Ronin', at: 10 }); const B = C.create({ id: 'pjB', name: 'Neon', at: 20 });
  C.addItem(A, { type: 'chat', ref: 'c1', at: 100 }); C.addItem(B, { type: 'chat', ref: 'c2', at: 200 });
  C.addItem(A, { type: 'chat', ref: 'c3', at: 300 }); C.addItem(B, { type: 'chat', ref: 'c3', at: 250 });
  pc.write(REL, C.normalize({ v: 1, list: [A, B], dismissed: [] }));
  const save = { pc: pc.app, mac: mac.app }; pc.app = async () => null; mac.app = async () => null;
  ok(await T.converge(w) > 0, `${name}: first sync (the store from before every chat had one project)`, T.why(w));
  pc.app = save.pc; mac.app = save.mac;
  if (migrate) ok(await settle(w) > 0 && problems(pc).several.length === 0 && problems(pc).none.length === 0, `${name}: migrated and synced`, { pc: problems(pc), why: T.why(w) });
  return { w, pc, mac };
}
const agree = (w, what) => ok(T.settled(w) && w.ms.every((m) => !problems(m).none.length && !problems(m).several.length), `${what}: both computers agree, every chat in exactly one project`, { pc: problems(w.ms[0]), mac: problems(w.ms[1]), diff: T.differs(w.ms[0], w.ms[1]) });

const cases = [];
const add = (name, fn) => cases.push([name, fn]);

// ---------- 1. this release on the PC, the older one on the Mac ----------
add('old', async () => {
  for (const skew of [0, -3600e3]) {
    const tag = skew ? 'old (Mac clock 1 h behind)' : 'old';
    const { w, pc, mac } = await start(`ps118-old${skew ? '-skew' : ''}`, { macSkew: skew });
    ok(where(pc, 'c3').length === 1 && where(mac, 'c3').join() === where(pc, 'c3').join(), `${tag}: the migration's choice reached the older Mac`, { pc: where(pc, 'c3'), mac: where(mac, 'c3') });
    // the Mac adds c1 (in A) to B too: a second project
    oldAdd(mac, 'pjB', 'c1');
    ok(await settle(w) > 0, `${tag}: second project: synced`, T.why(w));
    ok(where(pc, 'c1').length === 1 && where(mac, 'c1').join() === where(pc, 'c1').join(), `${tag}: second project: c1 left in exactly one project, the same on both (${where(pc, 'c1')})`, { pc: where(pc, 'c1'), mac: where(mac, 'c1') });
    agree(w, `${tag}: second project`);
    await steady(w, `${tag}: second project`);
    // the migration moved c3 out of one project; the older Mac gives it back to that one (a make's room chat at its
    // start, an Add on the Mac), with its clock behind: the chat stays where the migration put it
    const kept = where(pc, 'c3')[0]; const other = kept === 'pjA' ? 'pjB' : 'pjA';
    oldAdd(mac, other, 'c3');
    ok(await settle(w) > 0, `${tag}: given back: synced`, T.why(w));
    ok(where(pc, 'c3').join() === kept && where(mac, 'c3').join() === kept, `${tag}: given back to a project it was moved out of: it stays in ${kept}`, { pc: where(pc, 'c3'), mac: where(mac, 'c3') });
    await steady(w, `${tag}: given back`);
    // the Mac takes c2 out of its only project (B)
    oldTakeOut(mac, 'pjB', 'c2');
    await settle(w);
    ok(where(pc, 'c2').length === 0 && pc.has('chats/c2.json'), `${tag}: taken out: in no project during the grace, the chat itself there`);
    w.clock.advance(GRACE + 1000);
    ok(await settle(w) > 0, `${tag}: taken out: synced after the grace`, T.why(w));
    ok(where(pc, 'c2').join() === K.EARLIER_ID && where(mac, 'c2').join() === K.EARLIER_ID && mac.has('chats/c2.json') && pc.has('chats/c2.json'), `${tag}: taken out: c2 is in Earlier chats on both, never gone`, { pc: where(pc, 'c2'), mac: where(mac, 'c2') });
    // the Mac makes a chat with no project
    chat(mac, 'c9');
    await settle(w);
    w.clock.advance(GRACE + 1000);
    ok(await settle(w) > 0, `${tag}: new chat on the Mac: synced`, T.why(w));
    ok(where(pc, 'c9').join() === K.EARLIER_ID && where(mac, 'c9').join() === K.EARLIER_ID, `${tag}: a chat made on the older Mac with no project goes to Earlier chats`, { pc: where(pc, 'c9'), mac: where(mac, 'c9') });
    agree(w, `${tag}: the end`);
    ok(proj(pc).list.filter(K.isEarlier).length === 1, `${tag}: one Earlier chats`);
    await steady(w, `${tag}: the end`);
    ok(!(await pc.e.conflicts()).length && !(await mac.e.conflicts()).length, `${tag}: no sync conflict`, { pc: await pc.e.conflicts(), mac: await mac.e.conflicts() });
  }
});

// ---------- 2. both computers migrate at the same time, clocks apart ----------
add('both', async () => {
  const { w, pc, mac } = await start('ps118-both', { macOld: false, macSkew: 7 * 60e3, migrate: false });
  for (const m of [pc, mac]) { m.view.online = false; }
  await pc.app(); await mac.app(); // the migration, on both, before either hears from the other
  ok(pc.done && mac.done && pc.writes === 1 && mac.writes === 1, 'both: each computer migrated once');
  for (const m of [pc, mac]) { m.view.online = true; }
  ok(await settle(w) > 0, 'both: synced', T.why(w));
  const e = proj(pc).list.filter(K.isEarlier);
  ok(e.length === 1 && proj(mac).list.filter(K.isEarlier).length === 1, 'both: ONE Earlier chats', proj(pc).list.map((p) => p.id));
  ok(where(pc, 'c0').join() === K.EARLIER_ID && where(pc, 'c3').join() === where(mac, 'c3').join() && where(pc, 'c3').length === 1, `both: the same placement on both (c3 in ${where(pc, 'c3')})`, { pc: where(pc, 'c3'), mac: where(mac, 'c3') });
  agree(w, 'both');
  ok(!(await pc.e.conflicts()).length && !(await mac.e.conflicts()).length, 'both: no sync conflict (record times 7 minutes apart merge)', { pc: await pc.e.conflicts(), mac: await mac.e.conflicts() });
  await steady(w, 'both');
});

// ---------- 3. deleted ----------
add('deleted', async () => {
  for (const macOld of [false, true]) {
    const tag = `deleted (Mac on ${macOld ? 'the older' : 'this'} release)`;
    const { w, pc, mac } = await start(`ps118-del-${macOld ? 'old' : 'new'}`, { macOld });
    mac.view.online = false;
    del(pc, K.EARLIER_ID); // the owner deletes Earlier chats on the PC (c0 was in it)
    if (macOld) oldAdd(mac, K.EARLIER_ID, 'c1'); else newMove(mac, 'c1', K.EARLIER_ID); // meanwhile the Mac moves c1 into it
    await pc.app();
    ok(where(pc, 'c0').join() === K.EARLIER_ID, `${tag}: Earlier chats deleted with a chat in it: back from Recently deleted at once for c0 (never left without a project)`, proj(pc).list.map((p) => p.id));
    mac.view.online = true;
    ok(await settle(w) > 0, `${tag}: synced`, T.why(w));
    w.clock.advance(GRACE + 1000);
    ok(await settle(w) > 0, `${tag}: synced after the grace`, T.why(w));
    ok(proj(pc).list.filter(K.isEarlier).length === 1, `${tag}: one Earlier chats`, proj(pc).list.map((p) => [p.id, Boolean(p.revived)]));
    ok(where(pc, 'c1').join() === (macOld ? 'pjA' : K.EARLIER_ID) && where(mac, 'c1').join() === where(pc, 'c1').join(), `${tag}: c1 in ${macOld ? 'its project (the older Mac added it to Earlier chats too: Earlier chats ranks last)' : 'Earlier chats, where the Mac moved it'}`, { pc: where(pc, 'c1'), mac: where(mac, 'c1') });
    ok(['c0', 'c1', 'c2', 'c3'].every((id) => pc.has(`chats/${id}.json`) && mac.has(`chats/${id}.json`)), `${tag}: no chat lost`);
    agree(w, tag);
    await steady(w, tag);
    // a project with chats deleted (on the Mac): its chats go to Earlier chats at once; the project waits in Recently deleted
    del(mac, 'pjB');
    await settle(w, 30);
    ok(proj(pc).list.every((p) => p.id !== 'pjB') && (proj(pc).trash || []).some((p) => p.id === 'pjB') && (proj(mac).trash || []).some((p) => p.id === 'pjB'), `${tag}: a project with chats deleted on the Mac: in Recently deleted on both`);
    ok(where(pc, 'c2').join() === K.EARLIER_ID && where(mac, 'c2').join() === K.EARLIER_ID && pc.has('chats/c2.json'), `${tag}: its chat went to Earlier chats without waiting for the grace`, { pc: where(pc, 'c2'), mac: where(mac, 'c2') });
    // and on this PC
    del(pc, 'pjA');
    await pc.app();
    ok(['c1', 'c3'].filter((id) => where(pc, 'c3').length || id !== 'c3').every((id) => where(pc, id).length === 1), `${tag}: a project deleted on this PC: its chats placed at once`, { c1: where(pc, 'c1'), c3: where(pc, 'c3') });
    ok(await settle(w) > 0, `${tag}: synced`, T.why(w));
    agree(w, `${tag}: deletes`);
    await steady(w, `${tag}: deletes`);
  }
});

// ---------- 4. a store that can't be read ----------
add('unread', async () => {
  const { w, pc, mac } = await start('ps118-unread', { macOld: false });
  chat(pc, 'c7');
  const f = pc.p(REL);
  Sim.lock(f, 'EBUSY');
  let r;
  try { w.clock.advance(GRACE + 1000); await pc.app(); r = await pc.app(); } finally { Sim.unlock(f); }
  ok(r && r.skipped === 'unreadable', 'unread: the PC\'s projects store held by another program: the keeper skips', r);
  ok(C.normalize(pc.json(REL)).list.length >= 3, 'unread: nothing written over it');
  // gone after the migration (a read that came back empty, a file being replaced): never "no projects"
  const keep = pc.read(REL); fs.renameSync(f, `${f}.aside`);
  try { await mac.app(); r = await pc.app(); } finally { fs.renameSync(`${f}.aside`, f); }
  ok(r && r.skipped === 'empty after the migration' && pc.read(REL) === keep, 'unread: the store gone after the migration: skipped, no store made with only Earlier chats', r);
  ok(K.readable({ state: 'ok', value: { v: 1, list: [] } }, { held: { list: [] }, chats: [{ id: 'x' }], done: true }).ok === false && K.readable({ state: 'ok', value: { v: 1, list: [], trash: [{ id: 'p' }] } }, { held: { list: [], trash: [{ id: 'p' }] }, chats: [{ id: 'x' }], done: true }).ok === true, 'unread: empty after the migration waits; everything deleted by the owner (Recently deleted) doesn\'t');
  ok(K.readable({ state: 'ok', value: { v: 1, list: [{ id: 'p' }] } }, { held: { list: [] }, chats: [], done: false }).ok === false && K.readable({ state: 'unreadable' }, { chats: [] }).ok === false && K.readable({ state: 'ok', value: [] }, { chats: [] }).ok === false, 'unread: the window\'s copy empty while the disk has projects / unreadable / not a store: skip');
  await settle(w); w.clock.advance(GRACE + 1000);
  ok(await settle(w) > 0 && where(pc, 'c7').join() === K.EARLIER_ID && where(mac, 'c7').join() === K.EARLIER_ID, 'unread: once readable, it runs (c7 to Earlier chats on both)', T.why(w));
  agree(w, 'unread');
});

// ---------- 5. the window's side: an unreadable store; an import by the owner ----------
function fakeWindow(stored, chatList) {
  const writes = []; const toasts = []; const kv = { projects: clone(stored) }; const local = new Map();
  const hooks = { scope: [], top: [], skip: [], menu: [], render: [], itemMenu: [], view: [] };
  let st = 'ok';
  const H = { chats: chatList.map((c) => ({ agentId: 'claude', updatedAt: 1, ...c })), activeChat: {}, activeId: 'claude', agent: () => ({ id: 'claude', name: 'Claude', mode: 'native' }), agents: () => [], claudeAgent: () => null, surfaceIdFor: () => '' };
  const ctx = {
    console, JSON, Math, Date, Promise, Map, Set, Array, Object, String, Number, Boolean, Error, structuredClone,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, Math.min(ms || 0, 5)); t.unref(); return t; }, clearTimeout, setInterval: () => 0,
    addEventListener: () => {}, dispatchEvent: () => {}, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    document: { querySelector: () => null, addEventListener: () => {} }, navigator: {},
    store: { get: (k, f) => (local.has(k) ? clone(local.get(k)) : f), set: (k, v) => local.set(k, v) },
    toast: (t) => toasts.push(t), el: () => ({}), showMenu: () => {}, Modal: {}, activate: () => {}, Tools: {}, H,
    Panel: { hooks, render: () => {}, soon: () => {}, view: () => null, setView: () => {} },
    Native: { hooks: { newChat: [] }, newChat: () => {} }, ChatScenes: { linkOf: () => null },
  };
  ctx.window = ctx;
  ctx.hub = ctx.window.hub = {
    kvGet: async (name, fallback, o) => { if (o?.status) return st === 'unreadable' ? { state: 'unreadable' } : kv[name] == null ? { state: 'missing' } : { state: 'ok', value: clone(kv[name]) }; return kv[name] == null ? fallback : clone(kv[name]); },
    kvSet: async (name, value) => { writes.push(name); kv[name] = clone(value); return {}; },
  };
  vm.createContext(ctx);
  for (const f of ['makes-core.js', 'projects-core.js', 'projects.js', 'projchats-core.js', 'projchats.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { ctx, H, kv, writes, toasts, setStatus: (s) => { st = s; } };
}
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
add('window', async () => {
  const A = C.create({ id: 'pjA', name: 'Stoop Ronin', at: 10 }); C.addItem(A, { type: 'chat', ref: 'c1', at: 1 });
  const B = C.create({ id: 'pjB', name: 'Neon', at: 20 }); C.addItem(B, { type: 'chat', ref: 'c2', at: 1 });
  const fw = fakeWindow(C.normalize({ v: 1, list: [A, B], dismissed: [] }), [{ id: 'c1' }, { id: 'c2' }]);
  const { ctx, H } = fw; const PCh = ctx.ProjChats; const P = ctx.Projects;
  await tick();
  ok(PCh._ok(), 'window: migrated');
  // the keeper with the store unreadable: nothing written, even for a chat whose project was deleted
  P.removeProject(P.get('pjB'), { quiet: true }); await P.flush();
  fw.setStatus('unreadable'); const n0 = fw.writes.length;
  await PCh.keep();
  ok(fw.writes.length === n0 && P.all().every((p) => !C.has(p, 'chat', 'c2')), 'window: the keeper skips while the store can\'t be read (nothing written)', fw.writes.length - n0);
  fw.setStatus('ok');
  await PCh.keep();
  ok(clone(P.all().filter((p) => C.has(p, 'chat', 'c2')).map((p) => p.id)).join() === K.EARLIER_ID, 'window: readable again: the deleted project\'s chat goes to Earlier chats at once (no grace)');
  // Import past chats… with a project open: into it at once, with a note
  PCh.setScope('pjA');
  H.chats = [{ id: 'imp-1', agentId: 'claude', title: 'old 1', createdAt: 5 }, { id: 'imp-2', agentId: 'claude', title: 'old 2', createdAt: 6 }, ...H.chats];
  const placed = await PCh.imported(['imp-1', 'imp-2']);
  ok(placed === 2 && ['imp-1', 'imp-2'].every((id) => clone(P.all().filter((p) => C.has(p, 'chat', id)).map((p) => p.id)).join() === 'pjA'), 'window: an import goes to the open project at once', P.all().map((p) => [p.id, p.items.map((x) => x.ref)]));
  ok(fw.toasts.some((t) => /2 imported chats went into “Stoop Ronin” \(the open project\)/.test(t)), 'window: with a note', fw.toasts);
  ok(K.problems(fw.kv.projects, H.chats).none.length === 0, 'window: saved (the store on disk has them)');
  // no project open: Earlier chats at once
  PCh.setScope(null);
  H.chats = [{ id: 'imp-3', agentId: 'claude', title: 'old 3', createdAt: 7 }, ...H.chats];
  await PCh.imported(['imp-3']);
  ok(clone(P.all().filter((p) => C.has(p, 'chat', 'imp-3')).map((p) => p.id)).join() === K.EARLIER_ID && fw.toasts.some((t) => /no project was open/.test(t)), 'window: no project open: Earlier chats, with a note');
  // moving a chat back into a project that has a record of moving it out clears that record (a real move back)
  const d = { v: 1, list: [C.create({ id: 'x', at: 1 }), C.create({ id: 'y', at: 2 })] };
  C.addItem(d.list[0], { type: 'chat', ref: 'k', at: 1 }); C.addItem(d.list[1], { type: 'chat', ref: 'k', at: 2 });
  K.sweep(d, [{ id: 'k' }]);
  ok(d.list[1].chatsMovedOut?.length === 1 && K.move(d, 'k', 'y') && !d.list[1].chatsMovedOut && d.list[0].chatsMovedOut.length === 1, 'window: a move back in clears the old record (the keeper then treats it as a real move)');
  P.add(P.get('pjA'), 'chat', 'imp-3'); const pa = P.get('pjA'); pa.chatsMovedOut = [{ id: 'imp-3', to: K.EARLIER_ID, item: null, at: 1 }];
  P.add(P.get(K.EARLIER_ID), 'chat', 'imp-3'); P.add(pa, 'chat', 'imp-3');
  ok(!pa.chatsMovedOut, 'window: Projects.add (Move to project…) clears it too');
});

(async () => {
  const t0 = Date.now();
  for (const [name, fn] of cases) {
    if (ONLY && !ONLY.includes(name)) continue;
    try { await fn(); } catch (err) { ok(false, `${name} threw`, err.stack); }
    Sim.T.hook = null; Sim.unlock();
  }
  if (!argv.includes('--keep')) rmTemp(path.dirname(T.world('ps118-end').dir));
  console.log(`\nprojsync118: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
})();
