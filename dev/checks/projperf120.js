// opt-in: BIGPROFILE70
// (round 120, projperf120) The one-project chats list (round 116, projchats116) and its keeper (round 118) at the owner's
// scale, measured in the app: the heavy profile with 40 projects (dev/bigprofile.js --projects 40: 1,500 chats, most of
// them in "Earlier chats" after the migration). In-page, per stretch: the list's own work (Panel.render and its hooks,
// timed by wrapping the hooks), the projects bar's repaints (a MutationObserver on .pc-bar), and the convenience writes
// to localStorage (hub.projchats.*):
//   switch     a project picked from the bar (ProjChats.setScope, as the bar's menu does) and the list drawn
//   follow     a chat of another project opened (Native.open, as Ctrl/⌘+K does without a workspace): the scope follows
//   type       letters typed into the list's search box (Panel.setFilter + the draw)
//   sync       an arrival of the projects store from the other computer (Projects.changed(…, 'sync')) and the keeper
//              run it schedules (ProjChats.keep: the careful read + the sweep)
//   reply      a reply saved in a background chat (H.chats replaced, one chat newer) and the draw
//   idle       10 s with the list open: renders, bar repaints, writes
// Also what must stay right: the list shows only the open project's chats (no project / make groups), the bar names
// it, the early-ids note holds its chats, every chat in exactly one project.
// Counts are exact (a plain draw repaints no bar and writes nothing); times are performance.now() in the window, judged
// loosely (see BUDGET). window.PP_REPORT = 1 reports without failing.
//   BIGPROFILE70=1 node dev/run-checks.js --exact projperf120
//   by hand: node dev/smoke.js --fake-engines --data /tmp/hearth-bigprofile72 --wait 1000 --check-timeout 600000 --script dev/checks/projperf120.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, every = 100) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return false; };
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const settle = async () => { await frame(); await frame(); await wait(20); };
const r2 = (x) => Math.round(x * 100) / 100;
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? r2(s[Math.floor((s.length - 1) / 2)]) : null; };
const out = { chats: 0, projects: 0, numbers: {}, budgets: {}, problems: [] };
const n = out.numbers;
const fail = (m) => out.problems.push(m);
// Budgets: what round 120 measured after the fix (in the comments), with a margin (docs/upgrades/projperf120.md). The
// times here are wall times in a window on a shared box (Xvfb, software GL): they fail only past LOOSE × the budget
// (before the fix the draws took 450 ms: 100× these); the load-aware judgement of projchats' own work per operation
// is dev/projperf120-test.js (dev/loadwait.js). The counts are exact.
const LOOSE = window.PP_LOOSE || 4;
const BUDGET = window.PP_BUDGET || {
  switchMs: 15, // a project switched and its list drawn, median (measured 4.6; before 459)
  switchHookMs: 2, // … of it, projchats' own work (its hooks + the early-ids note) (0.7)
  followDrawMs: 15, // a chat of another project opened: the list drawn for its project (3; before 455)
  typeHookMs: 0.5, // a letter typed: projchats' hooks in that draw, median (0.2)
  replyMs: 15, // a reply saved in a background chat: the list drawn (2.6; before 460)
  replyHookMs: 1, // … projchats' hooks in that draw (0.2)
  scopePassMs: 1, // the list's filter (only the open project's chats) over every chat (0.1)
  syncEventMs: 2, // the projects store arriving: the event's handlers (no change in the open project) (0.7)
  keepAfterSyncMs: 3, // the keeper after that arrival: nothing due, so no careful read (0.3; before 28.5)
  keepIdleMs: 2, // the keeper's 2-minute tick with nothing due (0.2; before 24.5)
  sweepMs: 2, // the sweep itself over every project and chat (0.3)
  writesPerRender: 0, // localStorage writes by projchats in a plain draw (typing, a reply)
  barPaintsPerRender: 0, // bar repaints in a plain draw
  barPaintsPerSync: 0, // bar repaints for an arrival that doesn't change the open project's bar (before 1)
  writesPerSync: 0, // localStorage writes for that arrival (before 1: the 1,576 ids again)
  idleWrites: 0, // over 10 s idle
  idleBarPaints: 0,
};
out.budgets = BUDGET;

await until(() => typeof H !== 'undefined' && (H.chats || []).length > 1000, 60000);
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
if (!H.panelOpen) { H.panelOpen = true; applyLayout(); }
if (window.Lazy && !Lazy.isIn('projects')) await Lazy.load('projects');
await until(() => window.ProjChats?._ok?.(), 60000);
await until(() => document.querySelector('#panel .pc-bar .pc-project'), 10000);
await wait(1500);
const PCh = window.ProjChats; const P = Projects; const K = ProjChatsCore;
out.chats = H.chats.length; out.projects = P.all().length;
const earlier = P.all().find(K.isEarlier);
n.earlierChats = earlier ? earlier.items.filter((x) => x.type === 'chat').length : 0;

// ---------- instruments ----------
let writes = 0; let writeMs = 0;
const ls = Storage.prototype.setItem;
Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('hub.projchats.')) { const t = performance.now(); ls.call(this, k, v); writeMs += performance.now() - t; writes += 1; return; } return ls.call(this, k, v); };
let barPaints = 0;
const barRecs = (recs) => { for (const r of recs) if (r.type === 'childList' && r.target.classList?.contains('pc-bar')) barPaints += 1; };
const mo = new MutationObserver(barRecs);
mo.observe(document.querySelector('#panel .panel-head'), { childList: true, subtree: true });
// projchats' own hooks in the draw (render: watch + follow; scope: per chat)
let hookMs = 0; let renders = 0;
const wrapAll = (list, count) => { for (let i = 0; i < list.length; i++) { const fn = list[i]; if (fn.__pp) continue; const w = function (...a) { const t = performance.now(); try { return fn.apply(this, a); } finally { hookMs += performance.now() - t; if (count) renders += 1; } }; w.__pp = true; list[i] = w; } };
wrapAll(Panel.hooks.render, true);
// the scope hook runs once per chat in a draw: timed apart, over the whole list at once (a timer per call would cost more
// than the hook)
const scopePass = () => { const a = H.claudeAgent(); const t = performance.now(); for (const c of H.chats) for (const fn of Panel.hooks.scope) fn(c, a); return performance.now() - t; };
const snap = () => (barRecs(mo.takeRecords()), { writes, writeMs, barPaints, hookMs, renders, t: performance.now() });
const diff = (a, b) => ({ writes: b.writes - a.writes, writeMs: r2(b.writeMs - a.writeMs), barPaints: b.barPaints - a.barPaints, hookMs: r2(b.hookMs - a.hookMs), renders: b.renders - a.renders, ms: r2(b.t - a.t) });

// ---------- switch project from the bar ----------
const live = P.live().filter((p) => p.items.some((x) => x.type === 'chat'));
const targets = [];
for (let i = 0; i < 12; i++) targets.push(i % 2 ? (earlier?.id || live[0].id) : live[(i >> 1) % live.length].id);
const sw = { ms: [], hook: [], writes: 0, barPaints: 0 };
for (const pid of targets) {
  await settle();
  const a = snap();
  PCh.setScope(pid); Panel.render();
  const d = diff(a, snap());
  sw.ms.push(d.ms); sw.hook.push(d.hookMs + d.writeMs); sw.writes += d.writes; sw.barPaints += d.barPaints;
}
n.switchMs = med(sw.ms); n.switchHookMs = med(sw.hook); n.switchWrites = sw.writes / targets.length; n.switchBarPaints = sw.barPaints / targets.length;

// ---------- a chat of another project opened (Ctrl/⌘+K) ----------
const native = new Set(H.agents().filter((a) => a.mode === 'native' && !a.dock).map((a) => a.id));
const fo = { ms: [], hook: [], draw: [] };
for (const p of live.filter((x) => !K.isEarlier(x)).slice(0, 12)) {
  const c = p.items.map((x) => x.type === 'chat' && H.chats.find((y) => y.id === x.ref && native.has(y.agentId))).find(Boolean);
  if (!c || PCh.projectIdOf(c.id) !== p.id) continue;
  PCh.setScope(earlier?.id || live[0].id); Panel.render(); await settle();
  const a = snap();
  activate(c.agentId); Native.open(c.agentId, c.id);
  // the scope follows (the open chat seen at the next draw / hearth:activate), then the list drawn for it
  const flipped = await until(() => PCh.current()?.id === p.id, 5000, 0);
  const t = performance.now(); Panel.flush(); const drawMs = performance.now() - t;
  const okd = flipped && document.querySelector(`#chat-groups .item[data-key="${CSS.escape(c.id)}"]`);
  const d = diff(a, snap());
  fo.draw.push(r2(drawMs));
  if (!okd) fail(`follow: opening ${c.id} didn't switch the list to “${p.name}”`);
  fo.ms.push(d.ms); fo.hook.push(d.hookMs + d.writeMs);
}
n.followMs = med(fo.ms); n.followDrawMs = med(fo.draw); n.followHookMs = med(fo.hook); n.followRuns = fo.ms.length;

// ---------- typing in the list's search box ----------
PCh.setScope(earlier?.id || live[0].id); Panel.render(); await settle();
const ty = { ms: [], hook: [], writes: 0, barPaints: 0, n: 0 };
for (const word of ['shader', 'notes', 'zz']) {
  for (let i = 1; i <= word.length; i++) {
    const a = snap();
    Panel.setFilter(word.slice(0, i)); Panel.render();
    const d = diff(a, snap());
    ty.ms.push(d.ms); ty.hook.push(d.hookMs + d.writeMs); ty.writes += d.writes; ty.barPaints += d.barPaints; ty.n += 1;
    await frame();
  }
  Panel.setFilter(''); Panel.render(); await settle();
}
n.scopePassMs = med(Array.from({ length: 9 }, scopePass));
n.typeMs = med(ty.ms); n.typeHookMs = med(ty.hook); n.typeWritesPerRender = ty.writes / ty.n; n.typeBarPaintsPerRender = ty.barPaints / ty.n;

// ---------- a reply saved in a background chat ----------
const re = { ms: [], hook: [], writes: 0, barPaints: 0, n: 0 };
for (let i = 0; i < 10; i++) {
  await settle();
  const bg = H.chats[20 + i];
  H.chats = [{ ...bg, updatedAt: Date.now() }, ...H.chats.filter((c) => c.id !== bg.id)];
  const a = snap();
  Panel.render();
  const d = diff(a, snap());
  re.ms.push(d.ms); re.hook.push(d.hookMs + d.writeMs); re.writes += d.writes; re.barPaints += d.barPaints; re.n += 1;
}
n.replyMs = med(re.ms); n.replyHookMs = med(re.hook); n.replyWritesPerRender = re.writes / re.n; n.replyBarPaintsPerRender = re.barPaints / re.n;

// ---------- a sync arrival from the other computer ----------
const sy = { ev: [], writes: 0, barPaints: 0, n: 0, keep: [], sweep: [], keepAgain: [], due: [] };
for (let i = 0; i < 8; i++) {
  await settle();
  const a = snap();
  const t = performance.now(); P.changed(null, 'sync', false); const evMs = performance.now() - t;
  const d = diff(a, snap());
  sy.ev.push(r2(evMs)); sy.writes += d.writes; sy.barPaints += d.barPaints; sy.n += 1;
  // the keeper's run (as keepSoon would, 4 s later): its window time (the read's IPC wait excluded is not possible
  // from here: the wall time of the call is kept, the sweep alone below)
  const t1 = performance.now(); await PCh.keep(); sy.keep.push(r2(performance.now() - t1));
  // and its 2-minute tick with nothing changed since
  const t2 = performance.now(); await PCh.keep(); sy.keepAgain.push(r2(performance.now() - t2));
  const t3 = performance.now(); K.sweep(P._data(), H.chats, { at: Date.now(), ready: () => false }); sy.sweep.push(r2(performance.now() - t3));
  const t4 = performance.now(); K.due?.(P._data(), H.chats); sy.due.push(r2(performance.now() - t4));
}
n.syncEventMs = med(sy.ev); n.syncWrites = sy.writes / sy.n; n.syncBarPaints = sy.barPaints / sy.n;
n.keepAfterSyncMs = med(sy.keep); n.keepIdleMs = med(sy.keepAgain); n.sweepMs = med(sy.sweep); n.dueMs = med(sy.due);

// ---------- idle with the list open ----------
await settle(); await wait(500);
{
  const a = snap();
  let busy = 0; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) busy += e.duration; });
  try { po.observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
  await wait(10000);
  po.disconnect();
  const d = diff(a, snap());
  n.idleRenders = d.renders; n.idleWrites = d.writes; n.idleBarPaints = d.barPaints; n.idleHookMs = d.hookMs; n.idleLongTaskMs = r2(busy);
}
Storage.prototype.setItem = ls; mo.disconnect();

// ---------- still right ----------
PCh.setScope(live[0].id); Panel.render(); await settle();
const shown = [...document.querySelectorAll('#chat-groups .item')].map((r) => r.dataset.key).filter(Boolean);
const mine = new Set(live[0].items.filter((x) => x.type === 'chat').map((x) => x.ref));
if (!shown.length || shown.some((id) => !mine.has(id))) fail(`the list after the stretches shows chats outside “${live[0].name}”: ${shown.filter((id) => !mine.has(id)).slice(0, 5)}`);
const bar = document.querySelector('#panel .pc-bar .pc-name')?.textContent;
if (bar !== live[0].name) fail(`the bar says “${bar}”, not “${live[0].name}”`);
const early = JSON.parse(localStorage.getItem('hub.projchats.early') || 'null');
if (!early || early.ids.length !== mine.size || early.ids.some((id) => !mine.has(id))) fail('hub.projchats.early is not the open project\'s chats');
const pr = K.problems(P._data(), H.chats);
if (pr.none.length || pr.several.length) fail(`chats without one project: none ${pr.none.length}, several ${pr.several.length}`);

// ---------- budgets ----------
const over = (k, v, b) => { if (v != null && b != null && v > b) fail(`${k}: ${v} (budget ${b})`); };
const slow = (k, v, b) => over(k, v, b * LOOSE);
slow('switch: the list drawn ms', n.switchMs, BUDGET.switchMs);
slow('switch: projchats ms', n.switchHookMs, BUDGET.switchHookMs);
slow('follow: the list drawn ms', n.followDrawMs, BUDGET.followDrawMs);
slow('type: projchats ms per letter', n.typeHookMs, BUDGET.typeHookMs);
slow('reply: the list drawn ms', n.replyMs, BUDGET.replyMs);
slow('reply: projchats ms in the draw', n.replyHookMs, BUDGET.replyHookMs);
slow('the scope filter over every chat ms', n.scopePassMs, BUDGET.scopePassMs);
slow('sync: the event ms', n.syncEventMs, BUDGET.syncEventMs);
slow('sync: the keeper after it ms', n.keepAfterSyncMs, BUDGET.keepAfterSyncMs);
slow('the keeper\'s tick, nothing due ms', n.keepIdleMs, BUDGET.keepIdleMs);
slow('the keeper\'s sweep ms', n.sweepMs, BUDGET.sweepMs);
over('writes per plain draw (typing)', n.typeWritesPerRender, BUDGET.writesPerRender);
over('writes per plain draw (a reply)', n.replyWritesPerRender, BUDGET.writesPerRender);
over('bar repaints per plain draw (typing)', n.typeBarPaintsPerRender, BUDGET.barPaintsPerRender);
over('bar repaints per plain draw (a reply)', n.replyBarPaintsPerRender, BUDGET.barPaintsPerRender);
over('bar repaints per sync arrival', n.syncBarPaints, BUDGET.barPaintsPerSync);
over('writes per sync arrival', n.syncWrites, BUDGET.writesPerSync);
over('writes over 10 s idle', n.idleWrites, BUDGET.idleWrites);
over('bar repaints over 10 s idle', n.idleBarPaints, BUDGET.idleBarPaints);
if (window.PP_REPORT) { out.wouldFail = out.problems; out.problems = []; }
out.pass = !out.problems.length;
return JSON.stringify(out, null, 1);
