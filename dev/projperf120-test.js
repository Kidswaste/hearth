#!/usr/bin/env node
// (round 120, projperf120) The one-project chats list's own work at the owner's scale, without the app: projchats.js
// (+ projchats-core.js, projects.js, projects-core.js) in a small fake window holding 3,000 chats and 41 projects
// ("Earlier chats" with most of them, as after the round 116 migration). What a plain draw, a project switch, an
// arrival of the projects store and the keeper's tick cost, and what they write:
//   counts (exact)  a plain draw writes nothing and repaints no bar; a switch writes the scope and the open project's
//                   ids once and repaints the bar once; an arrival that doesn't change the open project writes and
//                   repaints nothing; the keeper with nothing to do reads nothing (no careful read) and writes nothing;
//                   Projects' / makes' old list groups added after the file ran are taken out at the next draw
//   rules           ProjChatsCore.due(data, chats) is true exactly when sweep() would change something (random stores)
//   times           per operation, judged load-aware (dev/loadwait.js: over budget only by what the process waited for a
//                   CPU is "CAN'T TELL", not a failure; budgets scaled by the box's calibration factor)
// Budgets: what round 120 measured after the fix with a margin (docs/upgrades/projperf120.md). In the app, on the heavy
// profile, dev/checks/projperf120.js measures the same stretches end to end (opt-in: BIGPROFILE70=1).
//   node dev/projperf120-test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const LW = require('./loadwait');

const ROOT = path.join(__dirname, '..');
const C = require('../projects-core');
const K = require('../projchats-core');
const clone = (x) => JSON.parse(JSON.stringify(x));
let passes = 0; let failures = 0; let cantTell = 0;
const ok = (c, what, detail) => { if (c) { passes += 1; console.log(`✓ ${what}`); } else { failures += 1; console.log(`✖ ${what}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`); } };

// Budgets, ms per operation (measured after the fix on the shared dev box), × the box's calibration factor
const BUDGET = {
  drawHook: 0.05, // projchats' render hook in a plain draw (same chats list): measured 0.002
  replyHook: 0.6, // … with a new chats list (a reply saved: watch() looks for new chats over 3,000): 0.18
  scopePass: 1, // the scope filter over 3,000 chats: 0.26–0.51
  switchMs: 2, // a project switched (Earlier chats ↔ Clink: ids, the early-ids note of 2,831 ids, the bar): 0.15
  arrival: 1.5, // an arrival of the projects store (hearth:projects) not changing the open project: 0.39
  keepIdle: 1.5, // the keeper with nothing due (ProjChatsCore.due over 41 projects and 3,000 chats, no read): 0.41
};

// ---------- the fake window: projchats.js as the app runs it ----------
function fakeWindow(stored, chatList) {
  const kv = { projects: clone(stored) }; const local = new Map();
  const counts = { writes: 0, carefulReads: 0, kvSets: 0, barPaints: 0, soon: 0 };
  const hooks = { scope: [], top: [], skip: [], menu: [], render: [], itemMenu: [], view: [] };
  const listeners = new Map();
  const node = (cls) => ({ cls, style: { setProperty() {} }, children: [], prepend(n) { this.children.unshift(n); }, replaceChildren(...k) { if (this.cls === 'pc-bar') counts.barPaints += 1; this.children = k; }, append(...k) { this.children.push(...k); } });
  const head = node('panel-head');
  const H = { chats: chatList, activeChat: {}, activeId: 'claude', agent: () => ({ id: 'claude', name: 'Claude', mode: 'native' }), agents: () => [{ id: 'claude', name: 'Claude', mode: 'native' }], claudeAgent: () => ({ id: 'claude' }), surfaceIdFor: () => '' };
  const ctx = {
    console, JSON, Math, Date, Promise, Map, Set, Array, Object, String, Number, Boolean, Error, structuredClone,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, Math.min(ms || 0, 5)); t.unref(); return t; }, clearTimeout, setInterval: () => 0,
    addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); },
    dispatchEvent: (e) => { for (const fn of listeners.get(e.type) || []) fn(e); return true; },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    document: { querySelector: (s) => (s === '#panel .panel-head' ? head : null), addEventListener: () => {} }, navigator: {},
    store: { get: (k, f) => (local.has(k) ? JSON.parse(local.get(k)) : f), set: (k, v) => { if (k.startsWith('projchats.')) counts.writes += 1; local.set(k, JSON.stringify(v)); } },
    toast: () => {}, el: (tag, o) => node(o?.class || tag), showMenu: () => {}, Modal: {}, activate: () => {}, Tools: {}, H,
    Panel: { hooks, render: () => {}, soon: () => { counts.soon += 1; }, view: () => null, setView: () => {} },
    Native: { hooks: { newChat: [] }, newChat: () => {} }, ChatScenes: { linkOf: () => null },
  };
  ctx.window = ctx;
  ctx.hub = ctx.window.hub = {
    kvGet: async (name, fallback, o) => { if (o?.status) { counts.carefulReads += 1; return kv[name] == null ? { state: 'missing' } : { state: 'ok', value: clone(kv[name]) }; } return kv[name] == null ? fallback : clone(kv[name]); },
    kvSet: async (name, value) => { counts.kvSets += 1; kv[name] = clone(value); return {}; },
  };
  vm.createContext(ctx);
  for (const f of ['makes-core.js', 'projects-core.js', 'projects.js', 'projchats-core.js', 'projchats.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { ctx, H, kv, counts, hooks, local, head, fire: (t) => ctx.dispatchEvent(new ctx.CustomEvent(t)) };
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// the owner's scale: 3,000 chats; 40 projects with 1–15 chats each (Clink with 15); the rest in Earlier chats
function ownerStore(nChats = 3000, nProjects = 40) {
  const chats = []; for (let i = 0; i < nChats; i++) chats.push({ id: `chat-${i}`, agentId: 'claude', title: `Chat ${i}`, createdAt: 1e12 + i, updatedAt: 1e12 + i });
  const list = []; let k = 0;
  for (let p = 0; p < nProjects; p++) {
    const pj = C.create({ id: `pj${p}`, name: p ? `Project ${p}` : 'Clink', at: 1e12 + p * 1000 });
    const n = p ? 1 + (p % 7) : 15;
    for (let j = 0; j < n; j++) C.addItem(pj, { type: 'chat', ref: chats[k++].id, at: 1e12 + k }, 1e12 + k);
    list.push(pj);
  }
  const d = C.normalize({ v: 1, list, dismissed: [] });
  K.sweep(d, chats, { at: 1e12 }); // the rest → Earlier chats (the migration ran)
  return { d, chats };
}

// a timed stretch: n runs of fn, judged on the total against n × budget × the box factor, load-aware
const results = {};
function timed(name, n, budget, fn) {
  for (let i = 0; i < Math.min(n, 20); i++) fn(i); // warm
  const c0 = LW.calibMs(); const a = LW.snap(); const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn(i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6; const w = LW.waited(a, LW.snap());
  const factor = LW.boxFactor(Math.max(c0, LW.calibMs()));
  const per = ms / n; const b = budget * factor;
  results[name] = Math.round(per * 1000) / 1000;
  const j = LW.judge(ms, b * n, w);
  const about = { perOpMs: results[name], budgetMs: Math.round(b * 1000) / 1000, factor: Math.round(factor * 100) / 100, waited: w };
  if (j === 'load') { cantTell += 1; console.log(`CAN'T TELL ${name} ${JSON.stringify(about)}`); } else ok(j === 'ok', `${name}: ${results[name]} ms per run (budget ${about.budgetMs})`, about);
}

(async () => {
  const t0 = Date.now();
  const { d, chats } = ownerStore();
  ok(K.problems(d, chats).none.length === 0 && K.problems(d, chats).several.length === 0, `the store: ${d.list.length} projects, ${chats.length} chats, ${d.list.find(K.isEarlier).items.length} in Earlier chats`);
  const fw = fakeWindow(d, chats);
  fw.local.set('projchats.migrated', JSON.stringify({ v: 1, at: 1 }));
  const { ctx, H, counts, hooks } = fw; const PCh = ctx.ProjChats; const P = ctx.Projects;
  await tick(60);
  ok(PCh._ok(), 'the window read its projects (the careful read) and the keeper may run');
  const renderHook = () => { for (const fn of hooks.render) fn(); };

  // ---------- counts ----------
  PCh.setScope(K.EARLIER_ID); await tick();
  let c = { ...counts };
  for (let i = 0; i < 50; i++) renderHook();
  ok(counts.writes === c.writes && counts.barPaints === c.barPaints, 'a plain draw (50 of them): nothing written, no bar repainted', { writes: counts.writes - c.writes, barPaints: counts.barPaints - c.barPaints });
  c = { ...counts };
  PCh.setScope('pj0');
  ok(counts.writes - c.writes === 2 && counts.barPaints - c.barPaints === 1, 'a switch: the scope and the open project\'s ids written once, the bar repainted once', { writes: counts.writes - c.writes, barPaints: counts.barPaints - c.barPaints });
  c = { ...counts };
  PCh.setScope('pj0');
  ok(counts.writes === c.writes && counts.barPaints === c.barPaints, 'the same project again: nothing written, no repaint');
  const early = JSON.parse(fw.local.get('projchats.early'));
  ok(early.ids.length === 15 && early.ids.every((id) => P.get('pj0').items.some((x) => x.ref === id)), 'the early-ids note holds the open project\'s chats');
  c = { ...counts };
  P.changed(null, 'sync', false); await tick(40);
  ok(counts.writes === c.writes && counts.barPaints === c.barPaints && counts.carefulReads === c.carefulReads && counts.kvSets === c.kvSets, 'an arrival that changes nothing here: no write, no repaint, the keeper reads nothing (nothing due)', { writes: counts.writes - c.writes, barPaints: counts.barPaints - c.barPaints, reads: counts.carefulReads - c.carefulReads });
  c = { ...counts };
  P.rename(P.get('pj0'), 'Clink 2'); await tick(40);
  ok(counts.barPaints - c.barPaints === 1 && counts.writes === c.writes, 'the open project renamed: the bar repainted once, the ids not written again', { writes: counts.writes - c.writes, barPaints: counts.barPaints - c.barPaints });
  P.add(P.get('pj0'), 'chat', 'chat-2999'); await tick(40);
  ok(PCh.inScope({ id: 'chat-2999' }) && JSON.parse(fw.local.get('projchats.early')).ids.includes('chat-2999') && PCh.projectIdOf('chat-2999') === 'pj0', 'a chat moved into the open project: in the list, in the note, its project looked up anew');
  // the keeper: nothing due → no careful read; a chat in two projects → the careful read, the sweep, a save
  c = { ...counts };
  await PCh.keep();
  ok(counts.carefulReads === c.carefulReads && counts.kvSets === c.kvSets, 'the keeper with nothing to do: no careful read, nothing written');
  P._data().list.find((p) => p.id === 'pj3').items.push({ ...P.get('pj4').items.find((x) => x.type === 'chat') });
  c = { ...counts };
  await PCh.keep(); await P.flush();
  ok(counts.carefulReads - c.carefulReads === 1 && counts.kvSets > c.kvSets && K.problems(P._data(), H.chats).several.length === 0, 'a chat in two projects: the careful read, then the sweep keeps it in one and saves', { reads: counts.carefulReads - c.carefulReads, sets: counts.kvSets - c.kvSets });
  // a chat with no project: due (the sweep's grace decides when), read carefully each time, never placed before the grace
  H.chats = [{ id: 'new-1', agentId: 'claude', title: 'from the other computer', createdAt: 2e12 }, ...H.chats];
  c = { ...counts };
  await PCh.keep();
  ok(counts.carefulReads - c.carefulReads === 1 && !PCh.projectIdOf('new-1'), 'a chat with no project: read carefully, left for its grace');
  // Projects' / makes' old list groups, added by their DOMContentLoaded handlers after projchats.js ran
  hooks.top.push(() => {}); hooks.skip.push(() => false);
  c = { ...counts };
  renderHook();
  ok(!hooks.top.length && !hooks.skip.length && counts.soon > c.soon, 'old project / make groups added later are taken out at the next draw (and the list drawn again)');
  hooks.top.push(() => {}); hooks.menu.push(P.panelMenu);
  fw.fire('DOMContentLoaded');
  ok(!hooks.top.length && !hooks.menu.includes(P.panelMenu), '… and at DOMContentLoaded (the lazy loader runs those after the group\'s files)');

  // ---------- the rule: due() is true exactly when a sweep would change something ----------
  let seed = 120; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let agree = 0; let mismatch = null;
  for (let t = 0; t < 300; t++) {
    const cs = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => ({ id: `c${i}` }));
    const ps = Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => { const p = C.create({ id: `p${i}`, at: i + 1 }); for (const x of cs) if (rnd() < 0.3) C.addItem(p, { type: 'chat', ref: x.id, at: 1 }, 1); return p; });
    if (rnd() < 0.2 && ps.length) C.addItem(ps[0], { type: 'chat', ref: 'gone', at: 1 }, 1); // a chat not in the list
    const dd = C.normalize({ v: 1, list: ps, dismissed: [] });
    const due = K.due(dd, cs); const r = K.sweep(clone(dd), cs, { at: 5 });
    if (due === r.changed) agree += 1; else if (!mismatch) mismatch = { t, due, report: r };
  }
  ok(agree === 300, `due() agrees with sweep() on 300 random stores (${agree})`, mismatch);
  ok(!K.due(null, []) && !K.due({ list: [] }, []) && K.due({ list: [] }, [{ id: 'x' }]), 'due(): no store / nothing → false; a chat with no project → true');

  // ---------- times ----------
  H.chats = H.chats.filter((x) => x.id !== 'new-1'); await PCh.keep();
  PCh.setScope(K.EARLIER_ID); renderHook();
  timed('a plain draw: the render hook', 2000, BUDGET.drawHook, () => renderHook());
  timed('a reply saved: the render hook with a new chats list', 300, BUDGET.replyHook, (i) => { const x = H.chats[(i % 50) + 10]; H.chats = [{ ...x, updatedAt: 3e12 + i }, ...H.chats.filter((y) => y !== x)]; renderHook(); });
  const a = { id: 'claude', mode: 'native' };
  timed('the scope filter over 3,000 chats', 300, BUDGET.scopePass, () => { for (const x of H.chats) for (const fn of hooks.scope) fn(x, a); });
  timed('a project switch (Earlier chats ↔ Clink)', 200, BUDGET.switchMs, (i) => PCh.setScope(i % 2 ? K.EARLIER_ID : 'pj0'));
  const onProjects = (why) => ctx.dispatchEvent(new ctx.CustomEvent('hearth:projects', { detail: { why } }));
  timed('an arrival of the projects store (the event)', 300, BUDGET.arrival, () => onProjects('change'));
  await tick(40);
  const keepTimes = []; const r0 = counts.carefulReads;
  const kc = LW.calibMs(); const ka = LW.snap(); const kt = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) await PCh.keep();
  const kms = Number(process.hrtime.bigint() - kt) / 1e6; keepTimes.push(kms / 200);
  const kj = LW.judge(kms, BUDGET.keepIdle * 200 * LW.boxFactor(Math.max(kc, LW.calibMs())), LW.waited(ka, LW.snap()));
  results['the keeper, nothing due'] = Math.round((kms / 200) * 1000) / 1000;
  if (kj === 'load') { cantTell += 1; console.log(`CAN'T TELL the keeper, nothing due ${results['the keeper, nothing due']} ms`); } else ok(kj === 'ok', `the keeper with nothing due: ${results['the keeper, nothing due']} ms per run (budget ${BUDGET.keepIdle})`);
  ok(counts.carefulReads === r0, '… and 200 of them read nothing');

  console.log(`\nprojperf120: ${passes} passed, ${failures} failed, ${cantTell} can't tell (${Date.now() - t0} ms) ${JSON.stringify(results)}`);
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
