#!/usr/bin/env node
// (round 91, projaudit91) Every project flow made on computer A, looked at on computer B, through the two-computer
// simulator (dev/sync-sim.js, the worlds of dev/sync72-test.js, the real sync engine) with the project store's real
// shape and the real ProjectsCore. For each flow: does it arrive, is anything lost or doubled.
//   create      from the switcher (a chat, a scene, a moodboard, the worktable), from a chat, from a Lab scene
//   look        rename, a cover, the next colour and mark
//   move        things in and out on the PC while the Mac (offline) puts other things in and takes one out; the same
//               chat put in on both: once
//   status      archived on the PC, back to Active on the Mac
//   delete      deleted on the PC (Recently deleted on both), restored on the Mac (back on both, once, as it was)
//   rename-both renamed on both while apart: one name on both, the other kept aside (the sync panel's note);
//               its Keep both keeps both names in ONE project (before: a second project sharing the same chat, scene
//               and moodboard), nothing doubled
//   arrivals    ProjAuditCore.renamedAway: the computer whose name lost is told (its name and the one that came)
// Deleted-while-edited, duplicate and import are dev/projsync76-test.js's (run with it).
// Never touches real data or a real cloud drive: a temp folder.
//   node dev/projaudit91-test.js [--only name,name]
'use strict';
const path = require('path');
const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
const S = require('../sync-merge');
const PC = require('../projects-core');
const WS = require('../project-workspace-core');
const PA = require('../projaudit-core');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`); } };
const rounds = async (w, n) => { for (let i = 0; i < n; i++) await T.round(w); };

const projects = (m) => m.json('kv/projects.json') || { v: 1, list: [], dismissed: [] };
const proj = (m, id) => projects(m).list.find((p) => p.id === id) || null;
const editProjects = (m, fn) => m.edit('kv/projects.json', (d) => { const v = d || { v: 1, list: [], dismissed: [] }; fn(v); return v; });
const editProject = (m, id, fn) => editProjects(m, (d) => { const p = d.list.find((x) => x.id === id); if (!p) throw Error(`no project ${id} on the ${m.name}`); fn(p, d); });
// what the app does when kv/projects.json arrives: normalize; saved back when that changed it
const app = (m) => { const d = projects(m); const n = PC.normalize(JSON.parse(JSON.stringify(d))); if (JSON.stringify(n) !== JSON.stringify(d)) m.write('kv/projects.json', n); return n; };
const scene = (id, name) => ({ id, name, layers: [{ id: `${id}-l1`, name: 'Main', code: `// ${name}` }], updatedAt: 1 });
// the same item twice in one project, or the same project twice in the list
const doubled = (m) => { const d = projects(m); const out = []; const ids = new Set(); for (const p of d.list) { if (ids.has(p.id)) out.push(`project ${p.id}`); ids.add(p.id); const seen = new Set(); for (const x of p.items) { if (seen.has(x.id)) out.push(`${p.id}:${x.id}`); seen.add(x.id); } } return out; };
const same = async (w, label) => { const r = await T.converge(w, 80); ok(r > 0, `${label}: both computers end the same`, T.why(w)); return r; };

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });
const roots = new Set();
function pair(name) {
  const w = T.world(`pa91-${name}`);
  roots.add(path.dirname(w.dir));
  return { w, pc: T.computer(w, 'PC', { platform: 'win32' }), mac: T.computer(w, 'Mac', { platform: 'darwin', nfd: true }) };
}

scenario('create', async () => {
  const { w, pc, mac } = pair('create');
  // the switcher's ＋ New project (ProjectWorkspace.create): a chat, a scene, a moodboard, the worktable, saved one by one
  const at = pc.now();
  const sw = PC.create({ id: 'pjsw', name: 'From the switcher', at, items: [{ type: 'chat', ref: 'claude-project-pjsw', name: 'From the switcher' }, { type: 'scene', ref: 's-pjsw', name: 'From the switcher' }, { type: 'board', ref: 'b-pjsw', name: 'Moodboard' }] });
  sw.workspace = WS.workspace({ chatId: 'claude-project-pjsw', sceneId: 's-pjsw', boardId: 'b-pjsw' });
  pc.write('chats/claude-project-pjsw.json', T.chat('claude-project-pjsw', [T.msg('user', at, 'hi')], { title: 'From the switcher' }));
  pc.write('kv/three-sketches.json', [scene('s-pjsw', 'From the switcher'), scene('s-loose', 'Loose scene')]);
  pc.write('kv/boards.json', { list: [{ id: 'b-pjsw', name: 'Moodboard', updated: 1, count: 0, chats: [] }], current: null, links: {}, prefs: {} });
  pc.write('kv/board-b-pjsw.json', { id: 'b-pjsw', name: 'Moodboard', items: [], view: { x: 0, y: 0, z: 1 }, chats: [] });
  pc.write('kv/workbench-pjsw.json', { v: 1, title: 'From the switcher' });
  // from a chat (right-click › Project › ＋ New project…) and from a Lab scene (Sketches › right-click › Project › ＋ New…)
  pc.write('chats/loose.json', T.chat('loose', [T.msg('user', at, 'a loose idea')], { title: 'Loose idea' }));
  const fc = PC.create({ id: 'pjchat', name: 'From a chat', at, items: [{ type: 'chat', ref: 'loose', name: 'Loose idea' }] });
  const fs = PC.create({ id: 'pjscene', name: 'From a scene', at, items: [{ type: 'scene', ref: 's-loose', name: 'Loose scene' }] });
  pc.write('kv/projects.json', { v: 1, list: [fs, fc, sw], dismissed: [] });
  await same(w, 'create');
  const d = app(mac);
  ok(['pjsw', 'pjchat', 'pjscene'].every((id) => d.list.filter((p) => p.id === id).length === 1), 'create: the three projects arrive on the Mac, each once', d.list.map((p) => p.id));
  ok(JSON.stringify(proj(mac, 'pjsw').items) === JSON.stringify(sw.items) && JSON.stringify(proj(mac, 'pjsw').workspace) === JSON.stringify(sw.workspace), 'create: the switcher\'s project has its chat, scene, moodboard and links on the Mac');
  ok(mac.has('chats/claude-project-pjsw.json') && mac.has('chats/loose.json') && mac.has('kv/board-b-pjsw.json') && mac.has('kv/workbench-pjsw.json') && (mac.json('kv/three-sketches.json') || []).length === 2, 'create: what they hold is on the Mac too');
  ok(!doubled(mac).length && !T.copies(mac).length && !T.copies(pc).length, 'create: nothing doubled', [...doubled(mac), ...T.copies(mac)]);
});

scenario('look', async () => {
  const { w, pc, mac } = pair('look');
  const cap = path.join(pc.data, 'captures', 'cover.png');
  pc.write('captures/cover.png', Buffer.alloc(2048, 3));
  pc.write('kv/projects.json', { v: 1, list: [PC.create({ id: 'pjlook', name: 'Looks', at: pc.now(), items: [{ type: 'capture', ref: cap, name: 'cover.png' }] })], dismissed: [] });
  await same(w, 'look: first sync');
  editProject(pc, 'pjlook', (p) => { PC.rename(p, 'Looks right', pc.now()); PC.setCover(p, `capture:${cap}`, pc.now()); PC.setIdent(p, { ci: p.ident.ci + 1 }, pc.now()); PC.setIdent(p, { gi: p.ident.gi + 1 }, pc.now()); });
  const want = proj(pc, 'pjlook');
  await same(w, 'look');
  const got = proj(mac, 'pjlook');
  ok(got.name === 'Looks right' && got.ident.ci === want.ident.ci && got.ident.gi === want.ident.gi && got.ident.color === want.ident.color, 'look: the new name, colour and mark on the Mac', got);
  const macCap = path.join(mac.data, 'captures', 'cover.png');
  ok(got.cover && PC.normalize(projects(mac)).list[0].items.some((x) => x.id === got.cover) && got.items[0].ref === macCap && mac.has('captures/cover.png'), 'look: the cover is the Mac\'s own copy of the capture (its path and the cover\'s id agree)', { cover: got.cover, ref: got.items[0].ref });
});

scenario('move', async () => {
  const { w, pc, mac } = pair('move');
  for (const id of ['c1', 'c2', 'c3', 'c4']) pc.write(`chats/${id}.json`, T.chat(id, [T.msg('user', 1, id)], { title: id }));
  pc.write('kv/three-sketches.json', [scene('s1', 'One'), scene('s2', 'Two')]);
  pc.write('kv/projects.json', { v: 1, list: [PC.create({ id: 'pjmove', name: 'Mover', at: pc.now(), items: [{ type: 'chat', ref: 'c1', name: 'c1' }, { type: 'scene', ref: 's1', name: 'One' }] })], dismissed: [] });
  await same(w, 'move: first sync');
  mac.view.online = false;
  const f = path.join(pc.data, 'captures', 'still.png'); pc.write('captures/still.png', Buffer.alloc(4096, 1));
  editProject(pc, 'pjmove', (p) => { PC.addItem(p, { type: 'chat', ref: 'c2', name: 'c2' }, pc.now()); PC.addItem(p, { type: 'capture', ref: f, name: 'still.png' }, pc.now()); PC.addItem(p, { type: 'chat', ref: 'c4', name: 'c4' }, pc.now()); PC.removeItem(p, 'scene', 's1', pc.now()); });
  await rounds(w, 3);
  editProject(mac, 'pjmove', (p) => { PC.addItem(p, { type: 'chat', ref: 'c3', name: 'c3' }, mac.now()); PC.addItem(p, { type: 'scene', ref: 's2', name: 'Two' }, mac.now()); PC.addItem(p, { type: 'chat', ref: 'c4', name: 'c4' }, mac.now()); PC.removeItem(p, 'chat', 'c1', mac.now()); });
  mac.view.online = true;
  await same(w, 'move');
  for (const m of [pc, mac]) {
    const ids = PC.normalize(projects(m)).list[0].items.map((x) => x.id.replace(/\\/g, '/')).sort();
    ok(JSON.stringify(ids) === JSON.stringify(['capture:' + path.join(m.data, 'captures', 'still.png'), 'chat:c2', 'chat:c3', 'chat:c4', 'scene:s2'].sort()), `move: what each computer put in and took out, on the ${m.name}`, ids);
    ok(!doubled(m).length, `move: the chat put in on both is there once, on the ${m.name}`, doubled(m));
    ok(['c1', 'c2', 'c3', 'c4'].every((id) => m.has(`chats/${id}.json`)) && (m.json('kv/three-sketches.json') || []).length === 2, `move: taking out never deletes the chat or scene, on the ${m.name}`);
  }
  ok(await (async () => (await pc.e.conflicts()).length === 0 && (await mac.e.conflicts()).length === 0)(), 'move: no conflict');
});

scenario('status', async () => {
  const { w, pc, mac } = pair('status');
  pc.write('kv/projects.json', { v: 1, list: [PC.create({ id: 'pjst', name: 'Shelved', at: pc.now() })], dismissed: [] });
  await same(w, 'status: first sync');
  editProject(pc, 'pjst', (p) => PC.setStatus(p, 'archived', pc.now()));
  await same(w, 'status: archived');
  ok(proj(mac, 'pjst').status === 'archived' && !PC.live(projects(mac).list).length, 'status: archived on the PC → archived (out of the live list) on the Mac');
  editProject(mac, 'pjst', (p) => PC.setStatus(p, 'active', mac.now()));
  await same(w, 'status: unarchived');
  ok(proj(pc, 'pjst').status === 'active', 'status: back to Active on the Mac → Active on the PC');
});

scenario('delete', async () => {
  const { w, pc, mac } = pair('delete');
  pc.write('chats/dc.json', T.chat('dc', [T.msg('user', 1, 'keep me')], { title: 'dc' }));
  pc.write('kv/projects.json', { v: 1, list: [PC.create({ id: 'pjdel', name: 'Doomed', at: pc.now(), notes: 'notes', items: [{ type: 'chat', ref: 'dc', name: 'dc' }] })], dismissed: [] });
  await same(w, 'delete: first sync');
  const before = JSON.stringify(proj(pc, 'pjdel'));
  // projects.js removeProject: out of the list, into Recently deleted (data.trash) with its time
  editProjects(pc, (d) => { const i = d.list.findIndex((p) => p.id === 'pjdel'); const [p] = d.list.splice(i, 1); d.trash = [{ ...p, deletedAt: pc.now() }, ...(d.trash || [])]; });
  await same(w, 'delete');
  const dm = app(mac);
  ok(!dm.list.some((p) => p.id === 'pjdel') && (dm.trash || []).filter((p) => p.id === 'pjdel').length === 1, 'delete: on the Mac it is gone from Projects and waits in Recently deleted, once', { list: dm.list.map((p) => p.id), trash: (dm.trash || []).map((p) => p.id) });
  ok(mac.has('chats/dc.json'), 'delete: its chat stays on the Mac');
  // restored on the Mac (Projects ⋯ › Recently deleted, or Deleted things › Restore: projects.js restoreProject)
  editProjects(mac, (d) => { const t = d.trash.find((x) => x.id === 'pjdel'); const { deletedAt, ...rest } = t; d.trash = d.trash.filter((x) => x !== t); if (!d.trash.length) delete d.trash; d.list.unshift(rest); void deletedAt; });
  await same(w, 'delete: restored');
  for (const m of [pc, mac]) {
    const d = app(m);
    ok(d.list.filter((p) => p.id === 'pjdel').length === 1 && !(d.trash || []).some((p) => p.id === 'pjdel'), `delete: restored on the Mac → back once, out of Recently deleted, on the ${m.name}`);
    const { opened, updated, ...a } = JSON.parse(before); const { opened: o2, updated: u2, ...b } = d.list.find((p) => p.id === 'pjdel'); void opened; void updated; void o2; void u2;
    ok(JSON.stringify(a) === JSON.stringify(b), `delete: …as it was (name, notes, look, things), on the ${m.name}`);
  }
});

scenario('rename-both', async () => {
  const { w, pc, mac } = pair('rename');
  pc.write('chats/rc.json', T.chat('rc', [T.msg('user', 1, 'x')], { title: 'rc' }));
  const p0 = PC.create({ id: 'pjneon', name: 'Neon', at: pc.now(), items: [{ type: 'chat', ref: 'rc', name: 'rc' }] });
  p0.workspace = WS.workspace({ chatId: 'rc' });
  pc.write('kv/projects.json', { v: 1, list: [p0], dismissed: [] });
  await same(w, 'rename-both: first sync');
  mac.view.online = false;
  editProject(pc, 'pjneon', (p) => PC.rename(p, 'Neon (PC)', pc.now()));
  const pcMine = projects(pc).list.map((p) => ({ id: p.id, name: p.name }));
  await rounds(w, 3);
  editProject(mac, 'pjneon', (p) => PC.rename(p, 'Neon (Mac)', mac.now()));
  mac.view.online = true;
  await same(w, 'rename-both');
  const won = proj(pc, 'pjneon').name;
  ok(['Neon (PC)', 'Neon (Mac)'].includes(won) && proj(mac, 'pjneon').name === won && projects(pc).list.length === 1, 'rename-both: one name on both, one project', won);
  const lost = won === 'Neon (PC)' ? 'Neon (Mac)' : 'Neon (PC)';
  const notes = [...pc.e.status().aside, ...mac.e.status().aside].filter((n) => n.rel === 'kv/projects.json');
  ok(notes.length >= 1 && notes.some((n) => (n.fields || []).some((f) => f.path === 'list.pjneon.name' && [f.ours, f.theirs].includes(lost))), 'rename-both: the other name is kept aside (a note in the sync panel names both)', notes);
  const holder = pc.e.status().aside.length ? pc : mac;
  const n = holder.e.status().aside.find((x) => x.rel === 'kv/projects.json');
  const cmp = await holder.e.aside(n.id, 'compare');
  ok(cmp.ok && cmp.kept?.list?.[0]?.name === lost && cmp.now?.list?.[0]?.name === won, 'rename-both: Compare shows the kept-aside name and the one in use', { kept: cmp.kept?.list?.[0]?.name, now: cmp.now?.list?.[0]?.name });
  // the computer whose name lost is told when the other's arrives (projaudit91.js, from ProjAuditCore.renamedAway)
  const loser = won === 'Neon (PC)' ? mac : pc;
  const told = PA.renamedAway([{ id: 'pjneon', name: lost }], projects(loser).list, { pjneon: { name: lost, at: loser.now() - 1000 } }, loser.now());
  ok(told.length === 1 && told[0].mine === lost && told[0].now === won, 'rename-both: the computer whose name lost is told (its name, the one that came)', told);
  ok(PA.renamedAway(pcMine, pcMine, { pjneon: { name: 'Neon (PC)', at: pc.now() } }, pc.now()).length === 0, 'rename-both: …never for its own rename');
  // Keep both: ONE project with both names (before: a second project sharing the same chat), nothing doubled
  const r = await holder.e.aside(n.id, 'both');
  ok(r.ok, 'rename-both: Keep both', r);
  await same(w, 'rename-both: after Keep both');
  for (const m of [pc, mac]) {
    const d = app(m);
    ok(d.list.length === 1 && d.list[0].id === 'pjneon', `rename-both: Keep both keeps one project (no copy sharing its chat), on the ${m.name}`, d.list.map((p) => [p.id, p.name]));
    ok(d.list[0].name.includes('Neon (PC)') && d.list[0].name.includes('Neon (Mac)'), `rename-both: …named with both names, on the ${m.name}`, d.list[0].name);
    ok(!doubled(m).length && d.list[0].items.length === 1, `rename-both: …nothing doubled, on the ${m.name}`, doubled(m));
  }
  // a store that isn't the projects' keeps Keep both's copies (the Lab's scenes renamed two ways: two scenes)
  const kb = S.keepBoth([{ id: 's1', name: 'A (PC)' }], [{ id: 's1', name: 'A (Mac)' }], 'Mac', () => 'x');
  ok(kb.length === 2 && kb[1].name === 'A (Mac) (from Mac)', 'rename-both: other stores keep Keep both as before (a copy beside it)', kb);
  const kp = S.keepBoth({ v: 1, list: [{ id: 'p', name: 'A (PC)', items: [{ id: 'chat:c', type: 'chat', ref: 'c', name: 'one' }] }] }, { v: 1, list: [{ id: 'p', name: 'A (Mac)', items: [{ id: 'chat:c', type: 'chat', ref: 'c', name: 'two' }] }] }, 'Mac', () => 'x', { inPlace: S.inPlaceOf('kv/projects.json') });
  ok(kp.list.length === 1 && kp.list[0].name === 'A (PC) / A (Mac)' && kp.list[0].items.length === 1 && kp.list[0].items[0].name === 'one / two', 'rename-both: the projects\' Keep both, in one project: both names, an item named two ways once', kp);
});

scenario('core', async () => {
  // Ctrl/⌘+K rows: the live projects, archived ones out
  const list = [PC.create({ id: 'a', name: 'Alpha' }), { ...PC.create({ id: 'b', name: 'Beta' }), status: 'archived' }];
  const rows = PA.paletteRows(list);
  ok(rows.length === 1 && rows[0].id === 'a' && rows[0].kind === 'Project' && rows[0].label.endsWith('Alpha'), 'core: palette rows are the live projects', rows);
  // a drop on the Desk
  ok(PA.dropped([{ name: 'x.hearthproject', path: '/x.hearthproject' }]).kind === 'bundle', 'core: a .hearthproject dropped is an import (as before)');
  ok(JSON.stringify(PA.dropped([{ name: 'a.png', path: '/a.png' }, { name: 'b.wav', path: '/b.wav' }], { types: ['Files'] })) === JSON.stringify({ kind: 'files', paths: ['/a.png', '/b.wav'], chatId: '' }), 'core: files dropped join the project');
  ok(PA.dropped([], { types: ['application/x-hearth-chat'], chatId: 'c1' }).kind === 'chat', 'core: a chat dragged from the list joins');
  ok(PA.dropped([{ name: 'made-in-page.txt', path: '' }]).kind === 'none', 'core: a file with no path on the disk: nothing (the drop goes on as before)');
  // a scene made in the Lab just now
  const now = 1793360000000; const p = PC.create({ id: 'p', name: 'P' });
  const base = { project: p, surface: 'scene', sceneId: `s${now - 500}`, had: new Set(['s1']), by: 'user', now };
  ok(PA.sceneJoins(base), 'core: a scene made in the Lab just now joins the project in front of you');
  ok(!PA.sceneJoins({ ...base, surface: '' }) && !PA.sceneJoins({ ...base, project: null }), 'core: …not without a project in front of you in the Lab');
  ok(!PA.sceneJoins({ ...base, had: new Set([base.sceneId]) }) && !PA.sceneJoins({ ...base, had: new Set() }), 'core: …not a scene the Lab already had (or before it knew its scenes)');
  ok(!PA.sceneJoins({ ...base, sceneId: `s${now - 3600e3}` }) && !PA.sceneJoins({ ...base, sceneId: 'imported-x' }), 'core: …not an older scene that only now came (from the other computer, a pack)');
  ok(!PA.sceneJoins({ ...base, by: 'director' }), 'core: …not one a director made (its chat brings it in)');
  // renamedAway: only this computer's recent rename, replaced by an arrival
  const mine = { a: { name: 'Mine', at: now - 1000 } };
  ok(PA.renamedAway([{ id: 'a', name: 'Mine' }], [{ id: 'a', name: 'Theirs' }], mine, now).length === 1, 'core: renamedAway: my name replaced by an arrival');
  ok(!PA.renamedAway([{ id: 'a', name: 'Mine' }], [{ id: 'a', name: 'Theirs' }], { a: { name: 'Mine', at: now - 2 * 864e5 } }, now).length, 'core: …not for a rename of days ago');
  ok(!PA.renamedAway([{ id: 'a', name: 'Older' }], [{ id: 'a', name: 'Theirs' }], mine, now).length, 'core: …not when this window no longer held my name');
  // the cover follows its capture to the other computer's path (projects-core compact / normalize)
  const cv = PC.create({ id: 'cv', name: 'Cover', items: [{ type: 'capture', ref: '/Mac/data/captures/a.png' }] });
  cv.cover = 'capture:C:\\PC\\data\\captures\\a.png';
  ok(PC.normalize({ v: 1, list: [cv] }).list[0].cover === 'capture:/Mac/data/captures/a.png', 'core: a cover saved with the other computer\'s path is found again here');
  const two = PC.create({ id: 'two', name: 'Two', items: [{ type: 'capture', ref: '/a/x/a.png' }, { type: 'capture', ref: '/b/x/a.png' }] }); two.cover = 'capture:/c/x/a.png';
  ok(PC.normalize({ v: 1, list: [two] }).list[0].cover === null, 'core: …and none when that can\'t be told (two alike)');
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  for (const r of roots) require('fs').rmSync(r, { recursive: true, force: true }); // (the simulator's temp folder)
  console.log(`\nprojaudit91: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
