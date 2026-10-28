#!/usr/bin/env node
// (round 76, projsync76) A whole project's life across two computers, through the two-computer simulator (dev/sync-sim.js,
// the worlds of dev/sync72-test.js, the real sync engine) with the real project stores' shapes and the real project code
// where it runs in Node (ProjectsCore, ProjectWorkspaceCore, ProjBundleCore, ProjSyncCore):
//   arrive        a project made on the PC opened on the Mac before its chat / scene / board / worktable / files arrived:
//                 "N files still arriving from PC", then "All here" by itself as they land; the return point falls back
//   both          the same project's notes, worktable (shelf + storyboard), scene code and "opened" changed on both while
//                 the Mac is offline: everything kept, no conflict
//   rename-add    renamed on the PC while the Mac adds a scene to it
//   delete-edit   deleted on the PC while the Mac edits it: kept with a clear choice (Keep it / Delete it), nothing lost;
//                 deleted while the Mac only opened it: deleted on both; deleted while the Mac writes in its chat
//   bundle        duplicated on the PC (projbundle75) while the Mac edits the original; imported on the Mac and opened on
//                 the PC before its files arrive; both computers duplicate the same project offline
//   per-computer  return points, "Keep the Lab ready", the Lab's asset cache never reach the other computer
//   restore       an earlier version restored on the PC (versions75) while the Mac edits the project
// Never touches real data or a real cloud drive: a temp folder.
//   node dev/projsync76-test.js [--only name,name] [--verbose]
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
const Sim = require('./sync-sim');
const S = require('../sync-merge');
const PC = require('../projects-core');
const PS = require('../projsync-core');
const PB = require('../projbundle-core');
const WS = require('../project-workspace-core');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`); } };
const raw = Sim.raw;
const ROOT = path.join(__dirname, '..');
async function rounds(w, n, o) { for (let i = 0; i < n; i++) await T.round(w, o); }

// ---------- the project's stores, as the app writes them ----------
const projects = (m) => m.json('kv/projects.json') || { v: 1, list: [], dismissed: [] };
const proj = (m, id) => projects(m).list.find((p) => p.id === id) || null;
const editProjects = (m, fn) => m.edit('kv/projects.json', (d) => { const v = d || { v: 1, list: [], dismissed: [] }; fn(v); return v; });
const editProject = (m, id, fn) => editProjects(m, (d) => { const p = d.list.find((x) => x.id === id); if (!p) throw Error(`no project ${id} on the ${m.name}`); fn(p); });
// what the app does when kv/projects.json arrives (Projects.reloadFromDisk): normalize, saved back when that changed it
function app(m) { const d = projects(m); const n = PC.normalize(JSON.parse(JSON.stringify(d))); if (JSON.stringify(n) !== JSON.stringify(PC.normalize(d)) || JSON.stringify((d.list || []).map((p) => [p.id, Boolean(p.revived)])) !== JSON.stringify(n.list.map((p) => [p.id, Boolean(p.revived)]))) m.write('kv/projects.json', n); return n; }
const scene = (id, name, code = '// scene') => ({ id, name, layers: [{ id: `${id}-l1`, name: 'Main', code }], updatedAt: 1 });
const board = (id, name) => ({ id, name, created: 1, updated: 1, seq: 1, items: [{ id: 'i1', type: 'note', text: 'mood' }], view: { x: 0, y: 0, z: 1 }, chats: [] });
const worktable = () => ({ v: 1, title: 'Clink', drawing: { strokes: [], color: '#ff547d' }, storyboard: { title: 'A small world', panels: [{ title: 'An unexpected signal', notes: 'Wide shot.', duration: 3, image: null }, { title: 'Move closer', notes: 'A detail.', duration: 2, image: null }, { title: 'The reveal', notes: 'Hold.', duration: 4, image: null }] }, shelf: [{ name: 'Brick', image: 'data:image/png;base64,AAAA' }] });
// a project made the way ProjectWorkspace.create makes it (a chat, a scene, a moodboard, the worktable, a capture)
function makeProject(m, name, id) {
  const at = m.now();
  const chatId = `claude-project-${id}`; const sid = `s-${id}`; const bid = `b-${id}`;
  const cap = path.join(m.data, 'captures', `${name} still.png`);
  const p = PC.create({ id, name, at, notes: 'Goal: a 30 s intro\nMusic: the Vital pad', items: [{ type: 'chat', ref: chatId, name }, { type: 'scene', ref: sid, name }, { type: 'board', ref: bid, name: `${name} · Moodboard` }, { type: 'capture', ref: cap, name: `${name} still.png` }] });
  p.workspace = WS.workspace({ chatId, sceneId: sid, boardId: bid });
  return { p, chatId, sid, bid, cap };
}
function writeProject(m, made, { record = true, rest = true } = {}) {
  const { p, chatId, sid, bid } = made;
  if (record) editProjects(m, (d) => { d.list.unshift(p); });
  if (!rest) return;
  m.write(`chats/${chatId}.json`, T.chat(chatId, [T.msg('user', m.now(), `Let's make ${p.name}`)], { title: p.name }));
  m.edit('kv/three-sketches.json', (l) => [...(Array.isArray(l) ? l : []), scene(sid, p.name, ['const a = 1;', 'const b = 2;', 'const c = 3;', 'const d = 4;', 'const e = 5;', 'const f = 6;'].join('\n'))]);
  m.edit('kv/boards.json', (x) => { const v = x || { list: [], current: null, links: {}, prefs: {} }; v.list.unshift({ id: bid, name: `${p.name} · Moodboard`, updated: 1, count: 1, chats: [] }); return v; });
  m.write(`kv/board-${bid}.json`, board(bid, `${p.name} · Moodboard`));
  m.write(`kv/workbench-${p.id}.json`, worktable());
  m.write(`captures/${p.name} still.png`, Buffer.alloc(700 * 1024, 7));
}
// what this computer has of an item (projects.js gone(): chats, scenes, boards)
function present(m) {
  const sk = new Set((m.json('kv/three-sketches.json') || []).map((s) => s.id));
  const bd = new Set(((m.json('kv/boards.json') || {}).list || []).map((b) => b.id));
  return (x) => (x.type === 'chat' ? m.has(`chats/${x.ref}.json`) : x.type === 'scene' || x.type === 'seq' ? sk.has(x.ref) : x.type === 'board' ? bd.has(x.ref) : null);
}
// the Desk's line on a computer, from that computer's engine status (as the app's Sync.status() has it)
function line(m, id) {
  const p = proj(m, id);
  // a project made on the other computer names its files with that computer's paths: this computer's form is in the
  // store (sync rewrites them), so the data folder is this computer's
  return PS.status(p, { sync: { on: true, ...m.e.status() }, present: present(m), dataDir: m.data, ci: m.name === 'PC', now: m.now(), ago: () => '2 min ago' });
}
const conflicts = async (m) => (await m.e.conflicts()).length;

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// ---------- 1. made on the PC, opened on the Mac before everything arrived ----------
scenario('arrive', async () => {
  const w = T.world('p-arrive');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin', partialDown: 64 * 1024, downTicks: 6 });
  pc.write('chats/hello.json', T.chat('hello', [T.msg('user', 1, 'hi')]));
  ok(await T.converge(w) > 0, 'arrive: first sync', T.why(w));
  const made = makeProject(pc, 'Clink', 'pjclink');
  // the project's record goes up first (the wizard saves each link as it makes it), its parts a moment later
  writeProject(pc, made, { rest: false });
  await rounds(w, 4);
  ok(Boolean(proj(mac, 'pjclink')), 'arrive: the project reached the Mac before its parts');
  writeProject(pc, made, { record: false });
  await T.round(w); await T.round(w);
  const early = line(mac, 'pjclink');
  ok(early && early.kind === 'arriving' && early.n >= 3 && /still arriving from PC$/.test(early.text), 'arrive: the Mac\'s Desk says "N files still arriving from PC"', early);
  ok(early && early.names.includes('Clink') && early.title.includes('Click: the sync panel'), 'arrive: its tooltip names what is on its way', early?.title);
  ok(PS.arriving(Error('This project’s chat is not available on this computer yet. Its saved link has been kept.')) && PS.arriving(Error('This scene is not available on this computer yet.')) && PS.arriving(Error('The moodboard is not available on this computer yet.')) && PS.arriving(Error('This project’s scene has not arrived on this computer yet.')) && !PS.arriving(Error('Add a native AI in Settings')), 'arrive: opening it waits calmly for every "not here yet" (chat, scene, moodboard), not for other errors');
  // the return point remembered on the Mac (another scene, a chat) falls back to the project's own while those aren't here
  const pt = WS.resume(made.p, { tab: 'scene', chatId: 'claude-elsewhere', sceneId: 's-not-here' }, [], []);
  ok(pt.tab === 'scene' && pt.chatId === made.chatId && pt.sceneId === made.sid, 'arrive: a return point to things not here falls back to the project\'s chat and scene', pt);
  ok(await T.converge(w, 80) > 0, 'arrive: everything lands', T.why(w));
  const done = line(mac, 'pjclink');
  ok(done && done.kind === 'here' && done.text === 'All here · synced 2 min ago', 'arrive: then "All here · synced …" by itself', done);
  ok(line(pc, 'pjclink')?.kind === 'here', 'arrive: the PC says All here too', line(pc, 'pjclink'));
  const cap = mac.read('captures/Clink still.png');
  ok(cap && cap.length === 700 * 1024, 'arrive: the capture arrived whole on the Mac');
  ok(proj(mac, 'pjclink').items.find((x) => x.type === 'capture').ref.startsWith(mac.data), 'arrive: its capture\'s path is the Mac\'s own', proj(mac, 'pjclink').items.find((x) => x.type === 'capture').ref);
  // sync off: no line; offline: says so; a part only in the cloud: arriving
  ok(PS.status(proj(mac, 'pjclink'), { sync: { on: false } }) === null, 'arrive: no line while sync is off');
  const off = PS.status(proj(mac, 'pjclink'), { sync: { on: true, state: 'offline', lastOk: mac.now() - 7200e3 }, present: present(mac), now: mac.now() });
  ok(off.kind === 'offline' && /^Offline · last synced/.test(off.text), 'arrive: offline says when it last synced', off.text);
  const co = PS.status(proj(mac, 'pjclink'), { sync: { on: true, state: 'pending', waiting: [{ rel: 'captures/Clink still.png', why: 'cloud-only' }], peers: [{ name: 'Studio PC', lastSeen: 1 }] }, present: present(mac), dataDir: mac.data, now: mac.now() });
  ok(co.kind === 'arriving' && co.text === '1 file still arriving from Studio PC', 'arrive: a file only in the cloud for now counts as arriving (named by the other computer)', co.text);
  const up = PS.status(proj(mac, 'pjclink'), { sync: { on: true, state: 'pending', waiting: [{ rel: 'captures/Clink still.png', why: 'writing' }] }, present: present(mac), dataDir: mac.data, now: mac.now() });
  ok(up.kind === 'going' && up.text === '1 file still syncing', 'arrive: a file going up says "still syncing"', up.text);
  // an old project whose scene was deleted long ago is not "arriving" (faded on the Desk instead)
  const old = { ...proj(mac, 'pjclink'), updated: 1, at: 1, items: proj(mac, 'pjclink').items.map((x) => ({ ...x, at: 1 })).concat([{ id: 'scene:gone', type: 'scene', ref: 'gone', at: 1 }]) };
  ok(PS.status(old, { sync: { on: true, state: 'synced' }, present: present(mac), now: mac.now() }).kind === 'here', 'arrive: a scene deleted long ago doesn\'t count as arriving');
  ok(!T.copies(pc).length && !T.copies(mac).length, 'arrive: no duplicate files', [...T.copies(pc), ...T.copies(mac)]);
});

// ---------- 2. the same project changed on both while the Mac is offline ----------
scenario('both', async () => {
  const w = T.world('p-both');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin', nfd: true });
  const made = makeProject(pc, 'Stoop', 'pjstoop');
  writeProject(pc, made);
  ok(await T.converge(w) > 0, 'both: the project reaches the Mac', T.why(w));
  mac.view.online = false;
  // the PC: a notes line, a shot's notes, a thing put on the worktable shelf, a line of the scene's code, opened it
  editProject(pc, 'pjstoop', (p) => { p.notes = p.notes.replace('Goal: a 30 s intro', 'Goal: a 20 s intro (PC)'); p.updated = pc.now(); p.opened = pc.now(); });
  pc.edit('kv/workbench-pjstoop.json', (x) => { x.storyboard.panels[0].notes = 'Wide shot, slow push (PC).'; x.shelf.unshift({ name: 'Rust (PC)', image: 'data:image/png;base64,BBBB' }); x.drawing.strokes.push({ color: '#fff', width: 4, brush: 'pen', points: [[1, 1], [2, 2]] }); });
  pc.edit('kv/three-sketches.json', (l) => { l[0].layers[0].code = l[0].layers[0].code.replace('const a = 1;', 'const a = 10; // PC'); });
  await rounds(w, 3);
  w.clock.advance(60000);
  // the Mac, offline: another notes line, another shot, its own shelf thing, another line of code, opened it too
  const macOpened = mac.now();
  editProject(mac, 'pjstoop', (p) => { p.notes += '\nTodo: end card (Mac)'; p.updated = mac.now(); p.opened = macOpened; });
  mac.edit('kv/workbench-pjstoop.json', (x) => { x.storyboard.panels[2].notes = 'Hold on the logo (Mac).'; x.shelf.unshift({ name: 'Moss (Mac)', image: 'data:image/png;base64,CCCC' }); x.drawing.strokes.push({ color: '#000', width: 2, brush: 'pen', points: [[5, 5]] }); });
  mac.edit('kv/three-sketches.json', (l) => { l[0].layers[0].code = l[0].layers[0].code.replace('const f = 6;', 'const f = 60; // Mac'); });
  mac.view.online = true;
  ok(await T.converge(w) > 0, 'both: converges', T.why(w));
  ok(await conflicts(pc) === 0 && await conflicts(mac) === 0, 'both: no conflict (opening the project on both computers was one)', { pc: await pc.e.conflicts(), mac: await mac.e.conflicts() });
  for (const m of [pc, mac]) {
    const p = proj(m, 'pjstoop');
    ok(p.notes.includes('Goal: a 20 s intro (PC)') && p.notes.includes('Todo: end card (Mac)') && p.notes.includes('Music: the Vital pad'), `both: both computers' notes lines on the ${m.name}`, p.notes);
    ok(p.opened === macOpened, `both: "opened" is the latest of the two on the ${m.name}`, p.opened);
    const wt = m.json('kv/workbench-pjstoop.json');
    ok(wt.storyboard.panels[0].notes.includes('(PC)') && wt.storyboard.panels[2].notes.includes('(Mac)') && wt.storyboard.panels[1].notes === 'A detail.', `both: a shot edited on each computer: both kept on the ${m.name}`, wt.storyboard.panels.map((x) => x.notes));
    ok(['Rust (PC)', 'Moss (Mac)', 'Brick'].every((n) => wt.shelf.some((x) => x.name === n)) && wt.shelf.length === 3, `both: things put first on the worktable shelf on each computer: all kept, once, on the ${m.name}`, wt.shelf.map((x) => x.name));
    ok(wt.drawing.strokes.length === 2, `both: strokes drawn on each computer: both kept on the ${m.name}`, wt.drawing.strokes.length);
    const code = m.json('kv/three-sketches.json')[0].layers[0].code;
    ok(code.includes('const a = 10; // PC') && code.includes('const f = 60; // Mac'), `both: the scene's code edited on different lines: both on the ${m.name}`, code);
  }
  // the same shot changed two ways: still a real conflict (one wins, the other kept in Deleted files), never mixed
  mac.view.online = false;
  pc.edit('kv/workbench-pjstoop.json', (x) => { x.storyboard.panels[1].notes = 'Closer (PC)'; });
  await rounds(w, 3);
  mac.edit('kv/workbench-pjstoop.json', (x) => { x.storyboard.panels[1].notes = 'Closer (Mac)'; });
  mac.view.online = true;
  ok(await T.converge(w) > 0, 'both: converges after the same shot changed two ways', T.why(w));
  const n1 = pc.json('kv/workbench-pjstoop.json').storyboard.panels[1].notes;
  // (round 78, guardloss78) a shot's notes (prose) changed two ways now merge inside the shot: both lines stay
  ok((n1.includes('Closer (PC)') && n1.includes('Closer (Mac)')) || (['Closer (PC)', 'Closer (Mac)'].includes(n1) && T.recoverable(w, n1 === 'Closer (PC)' ? 'Closer (Mac)' : 'Closer (PC)')), 'both: the same shot two ways: both kept (or one wins and the other can be brought back)', n1);
  ok(!T.copies(pc).length && !T.copies(mac).length, 'both: no duplicate files', [...T.copies(pc), ...T.copies(mac)]);
});

// ---------- 3. renamed on one computer while the other adds a scene ----------
scenario('rename-add', async () => {
  const w = T.world('p-rename');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const made = makeProject(pc, 'Neon', 'pjneon');
  writeProject(pc, made);
  ok(await T.converge(w) > 0, 'rename-add: first sync', T.why(w));
  mac.view.online = false;
  editProject(pc, 'pjneon', (p) => { PC.rename(p, 'Neon Nights', pc.now()); });
  await rounds(w, 3);
  w.clock.advance(30000);
  mac.edit('kv/three-sketches.json', (l) => [...l, scene('s-extra', 'Neon · rain')]);
  editProject(mac, 'pjneon', (p) => { PC.addItem(p, { type: 'scene', ref: 's-extra', name: 'Neon · rain' }, mac.now()); });
  mac.view.online = true;
  ok(await T.converge(w) > 0, 'rename-add: converges', T.why(w));
  ok(await conflicts(pc) === 0 && await conflicts(mac) === 0, 'rename-add: no conflict');
  for (const m of [pc, mac]) {
    const p = proj(m, 'pjneon');
    ok(p.name === 'Neon Nights', `rename-add: the new name on the ${m.name}`, p.name);
    ok(p.items.some((x) => x.id === 'scene:s-extra') && p.items.filter((x) => x.type === 'scene').length === 2, `rename-add: the scene added on the Mac is in it on the ${m.name}`, p.items.map((x) => x.id));
    ok((m.json('kv/three-sketches.json') || []).some((s) => s.id === 's-extra'), `rename-add: the scene itself on the ${m.name}`);
    ok(projects(m).list.length === 1, `rename-add: one project, not two, on the ${m.name}`);
  }
  // renamed two ways at once: one name, never two projects
  mac.view.online = false;
  editProject(pc, 'pjneon', (p) => { PC.rename(p, 'Neon (PC)', pc.now()); });
  await rounds(w, 3);
  editProject(mac, 'pjneon', (p) => { PC.rename(p, 'Neon (Mac)', mac.now()); });
  mac.view.online = true;
  ok(await T.converge(w) > 0, 'rename-add: converges after a rename two ways', T.why(w));
  const nm = proj(pc, 'pjneon').name;
  ok(['Neon (PC)', 'Neon (Mac)'].includes(nm) && proj(mac, 'pjneon').name === nm && projects(pc).list.length === 1, 'rename-add: renamed two ways: one name on both, one project', nm);
});

// ---------- 4. deleted on one computer while the other edits it ----------
scenario('delete-edit', async () => {
  const w = T.world('p-delete');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  for (const [n, id] of [['Keep me', 'pjkeep'], ['Peeked', 'pjpeek'], ['Chatty', 'pjchat']]) writeProject(pc, makeProject(pc, n, id));
  ok(await T.converge(w) > 0, 'delete-edit: first sync', T.why(w));
  mac.view.online = false;
  // the PC deletes all three (projects.js removeProject: out of the list, into Recently deleted), one with a last note
  editProject(pc, 'pjkeep', (p) => { p.notes += '\nPC: last thought before deleting'; });
  editProjects(pc, (d) => { const at = pc.now(); for (const id of ['pjkeep', 'pjpeek', 'pjchat']) { const i = d.list.findIndex((p) => p.id === id); const [p] = d.list.splice(i, 1); d.trash = [{ ...p, deletedAt: at }, ...(d.trash || [])]; } });
  await rounds(w, 3);
  w.clock.advance(60000);
  // the Mac, offline: edits one, only opens another, writes in the third's chat
  editProject(mac, 'pjkeep', (p) => { p.notes += '\nMac: a new idea'; PC.addItem(p, { type: 'scene', ref: 's-macidea', name: 'Idea' }, mac.now()); p.opened = mac.now(); });
  editProject(mac, 'pjpeek', (p) => { p.opened = mac.now(); });
  mac.edit('chats/claude-project-pjchat.json', (c) => { c.messages.push(T.msg('user', mac.now(), 'still working on it (Mac)')); });
  mac.view.online = true;
  ok(await T.converge(w) > 0, 'delete-edit: converges', T.why(w));
  // each app reads the projects (Projects.reloadFromDisk) and saves what normalize settled
  app(pc); app(mac);
  ok(await T.converge(w) > 0, 'delete-edit: converges after both apps read it', T.why(w));
  for (const m of [pc, mac]) {
    const d = PC.normalize(projects(m));
    const k = d.list.find((p) => p.id === 'pjkeep');
    ok(k && k.revived && k.revived.at > 0, `delete-edit: edited on the Mac while deleted on the PC: kept, marked for a choice, on the ${m.name}`, d.list.map((p) => [p.id, p.revived]));
    ok(k && k.notes.includes('Mac: a new idea') && k.items.some((x) => x.ref === 's-macidea'), `delete-edit: the Mac's edit is in it on the ${m.name}`, k?.notes);
    ok((d.trash || []).some((p) => p.id === 'pjkeep' && p.notes.includes('PC: last thought before deleting')), `delete-edit: the PC's last version waits beside it (nothing lost) on the ${m.name}`);
    ok(!d.list.some((p) => p.id === 'pjpeek') && (d.trash || []).some((p) => p.id === 'pjpeek'), `delete-edit: only opened on the Mac: the delete goes through (Recently deleted) on the ${m.name}`, d.list.map((p) => p.id));
    ok(!d.list.some((p) => p.id === 'pjchat') && (d.trash || []).some((p) => p.id === 'pjchat'), `delete-edit: its chat written on the Mac: the project is deleted, on the ${m.name}`);
    ok(T.texts(m.json('chats/claude-project-pjchat.json')).includes('still working on it (Mac)'), `delete-edit: …and the chat (with the Mac's message) stays, on the ${m.name}`);
    ok(m.json('kv/three-sketches.json').some((s) => s.id === 's-pjpeek'), `delete-edit: a deleted project's scene stays, on the ${m.name}`);
  }
  // the owner chooses on the PC: Keep it → the deleted copy's note line joins it, out of Recently deleted, on both
  editProjects(pc, (d) => { const n = PC.normalize(d); const p = n.list.find((x) => x.id === 'pjkeep'); PC.keepRevived(p, n.trash.find((x) => x.id === 'pjkeep'), pc.now()); n.trash = n.trash.filter((x) => x.id !== 'pjkeep'); Object.assign(d, n); });
  ok(await T.converge(w) > 0, 'delete-edit: converges after Keep it', T.why(w));
  app(pc); app(mac);
  for (const m of [pc, mac]) {
    const d = PC.normalize(projects(m));
    const k = d.list.find((p) => p.id === 'pjkeep');
    ok(k && !k.revived && k.notes.includes('Mac: a new idea') && k.notes.includes('PC: last thought before deleting'), `delete-edit: Keep it: one project with both computers' notes, no mark, on the ${m.name}`, k);
    ok(!(d.trash || []).some((p) => p.id === 'pjkeep'), `delete-edit: Keep it: no longer in Recently deleted on the ${m.name}`);
  }
  // deleted on the PC again while the Mac edits, then the owner picks Delete it on the Mac
  mac.view.online = false;
  editProjects(pc, (d) => { const i = d.list.findIndex((p) => p.id === 'pjkeep'); const [p] = d.list.splice(i, 1); d.trash = [{ ...p, deletedAt: pc.now() }, ...(d.trash || [])]; });
  await rounds(w, 3);
  editProject(mac, 'pjkeep', (p) => { p.status = 'paused'; });
  mac.view.online = true;
  ok(await T.converge(w) > 0, 'delete-edit: converges (second time)', T.why(w));
  app(mac);
  editProjects(mac, (d) => { const n = PC.normalize(d); const p = n.list.find((x) => x.id === 'pjkeep'); ok(Boolean(p?.revived), 'delete-edit: marked again for a choice'); n.list = n.list.filter((x) => x.id !== 'pjkeep'); const { revived, ...was } = p; n.trash = [{ ...was, deletedAt: mac.now() }, ...n.trash.filter((x) => x.id !== 'pjkeep')]; Object.assign(d, n); });
  ok(await T.converge(w) > 0, 'delete-edit: converges after Delete it', T.why(w));
  app(pc); app(mac);
  for (const m of [pc, mac]) {
    const d = PC.normalize(projects(m));
    ok(!d.list.some((p) => p.id === 'pjkeep') && d.trash.filter((p) => p.id === 'pjkeep').length === 1 && !d.trash.find((p) => p.id === 'pjkeep').revived, `delete-edit: Delete it: deleted on both, once in Recently deleted, on the ${m.name}`);
  }
  ok(await conflicts(pc) === 0 && await conflicts(mac) === 0, 'delete-edit: no conflict left');
  ok(!T.copies(pc).length && !T.copies(mac).length, 'delete-edit: no duplicate files', [...T.copies(pc), ...T.copies(mac)]);
});

// ---------- 5. duplicate / import (projbundle75) on one computer, then sync ----------
// the body ProjBundle builds from the stores (projbundle.js gather(), minus the zip): the project, its scenes, boards, chats, worktable
function bodyOf(m, id) {
  const p = proj(m, id);
  const sk = m.json('kv/three-sketches.json') || [];
  return {
    project: JSON.parse(JSON.stringify(p)),
    scenes: p.items.filter((x) => x.type === 'scene').map((x) => sk.find((s) => s.id === x.ref)).filter(Boolean).map((s) => ({ id: s.id, sketch: JSON.parse(JSON.stringify(s)) })),
    boards: p.items.filter((x) => x.type === 'board').map((x) => ({ id: x.ref, board: m.json(`kv/board-${x.ref}.json`) })).filter((x) => x.board),
    chats: p.items.filter((x) => x.type === 'chat').map((x) => ({ id: x.ref, chat: m.json(`chats/${x.ref}.json`), agent: { id: 'claude' } })).filter((x) => x.chat),
    workbench: m.json(`kv/workbench-${id}.json`), sequences: [], files: [],
  };
}
// what ProjBundle.duplicateProject / importProject write (fresh ids, every store saved like any change)
function adopt(m, body, files = []) {
  const b = body;
  editProjects(m, (d) => { d.list.unshift(b.project); });
  m.edit('kv/three-sketches.json', (l) => [...(l || []), ...b.scenes.map((s) => s.sketch)]);
  for (const x of b.boards) { m.write(`kv/board-${x.id}.json`, x.board); m.edit('kv/boards.json', (v) => { v.list.unshift({ id: x.id, name: x.board.name, updated: 1, count: 1, chats: x.board.chats || [] }); return v; }); }
  for (const c of b.chats) m.write(`chats/${c.id}.json`, c.chat);
  if (b.workbench && !m.has(`kv/workbench-${b.project.id}.json`)) m.write(`kv/workbench-${b.project.id}.json`, b.workbench);
  for (const f of files) m.write(f.rel, f.data);
}
scenario('bundle', async () => {
  const w = T.world('p-bundle');
  const pc = T.computer(w, 'PC', { platform: 'win32', partialDown: 64 * 1024, downTicks: 8 });
  const mac = T.computer(w, 'Mac', { platform: 'darwin', partialDown: 64 * 1024, downTicks: 5 });
  writeProject(pc, makeProject(pc, 'Orbit', 'pjorbit'));
  ok(await T.converge(w, 80) > 0, 'bundle: first sync', T.why(w));
  const before = JSON.stringify(bodyOf(pc, 'pjorbit').scenes);
  // the PC duplicates it while the Mac (offline) edits the original's notes and scene
  mac.view.online = false;
  const dup = PB.remap(bodyOf(pc, 'pjorbit'), { suffix: ' copy' }).body;
  adopt(pc, dup);
  await rounds(w, 3);
  editProject(mac, 'pjorbit', (p) => { p.notes += '\nMac: louder drums'; });
  mac.edit('kv/three-sketches.json', (l) => { l.find((s) => s.id === 's-pjorbit').layers[0].code += '\n// Mac'; });
  mac.view.online = true;
  ok(await T.converge(w, 80) > 0, 'bundle: converges after a duplicate on the PC', T.why(w));
  for (const m of [pc, mac]) {
    const list = projects(m).list;
    const orig = list.find((p) => p.id === 'pjorbit'); const copy = list.find((p) => p.id === dup.project.id);
    ok(orig && copy && copy.name === 'Orbit copy' && list.length === 2, `bundle: the original and its copy on the ${m.name}`, list.map((p) => p.name));
    ok(orig.notes.includes('Mac: louder drums') && !copy.notes.includes('Mac: louder drums'), `bundle: the Mac's edit went to the original only, on the ${m.name}`);
    const sk = m.json('kv/three-sketches.json');
    ok(sk.find((s) => s.id === 's-pjorbit').layers[0].code.endsWith('// Mac') && !sk.find((s) => s.id === dup.project.workspace.sceneId).layers[0].code.includes('// Mac'), `bundle: the copy's scene is its own (the original's edit didn't reach it) on the ${m.name}`);
    ok(m.has(`chats/${dup.project.workspace.chatId}.json`) && m.has(`kv/board-${dup.project.workspace.boardId}.json`) && m.has(`kv/workbench-${dup.project.id}.json`), `bundle: the copy's chat, moodboard and worktable on the ${m.name}`);
    const ids = new Set(); let clash = false; for (const p of list) for (const x of p.items) { if (x.type !== 'capture' && ids.has(x.id)) clash = true; ids.add(x.id); }
    ok(!clash, `bundle: no scene / board / chat shared between the original and the copy on the ${m.name}`);
  }
  ok(JSON.stringify(bodyOf(pc, 'pjorbit').scenes) !== before && bodyOf(pc, 'pjorbit').scenes.length === 1, 'bundle: the original kept its own scene');
  // imported on the Mac (a .hearthproject made elsewhere, with a big file), opened on the PC before the file arrives
  const imp = PB.remap(bodyOf(mac, 'pjorbit')).body;
  imp.project.name = 'Orbit (imported)';
  const rel = 'assets/projects/Orbit (imported)/take.wav';
  imp.project.items.push({ id: `file:${path.join(mac.data, ...rel.split('/'))}`, type: 'file', ref: path.join(mac.data, ...rel.split('/')), name: 'take.wav', at: mac.now() });
  adopt(mac, imp, [{ rel, data: Buffer.alloc(900 * 1024, 3) }]);
  let seen = null;
  const trail = [];
  for (let i = 0; i < 16 && !seen; i++) { await T.round(w); const p = proj(pc, imp.project.id); if (p) { const st = line(pc, imp.project.id); trail.push([st.kind, st.n, pc.e.status().waiting.map((x) => `${x.rel}:${x.why}`).slice(0, 4)]); if (st.kind === 'arriving' && st.names.includes('take.wav')) seen = st; } }
  ok(seen && /still arriving from Mac$/.test(seen.text), 'bundle: on the PC an imported project\'s file still on its way: "… still arriving from Mac"', trail);
  ok(await T.converge(w, 80) > 0, 'bundle: converges after an import on the Mac', T.why(w));
  ok(line(pc, imp.project.id).kind === 'here' && pc.read(rel)?.length === 900 * 1024, 'bundle: then All here on the PC, the file whole', line(pc, imp.project.id));
  // both computers duplicate the same project while apart: two copies, each its own
  mac.view.online = false;
  const d1 = PB.remap(bodyOf(pc, 'pjorbit'), { suffix: ' copy' }).body; adopt(pc, d1);
  const d2 = PB.remap(bodyOf(mac, 'pjorbit'), { suffix: ' copy' }).body; adopt(mac, d2);
  mac.view.online = true;
  ok(await T.converge(w, 80) > 0, 'bundle: converges after both duplicated', T.why(w));
  for (const m of [pc, mac]) { const ids = projects(m).list.map((p) => p.id); ok(ids.includes(d1.project.id) && ids.includes(d2.project.id) && d1.project.id !== d2.project.id && new Set(ids).size === ids.length, `bundle: both copies, each once, on the ${m.name}`, ids); }
  ok(await conflicts(pc) === 0 && await conflicts(mac) === 0, 'bundle: no conflict');
  ok(!T.copies(pc).length && !T.copies(mac).length, 'bundle: no duplicate files', [...T.copies(pc), ...T.copies(mac)]);
});

// ---------- 6. what stays on each computer ----------
scenario('per-computer', async () => {
  const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const pw = src('project-workspace.js');
  // return points (the tab, chat, scene, Creative board feature to resume) and "Keep the Lab ready" are this computer's
  // localStorage (ui.js store), never a store in the data folder
  ok(/resumeKey='workspace\.returnPoints'/.test(pw) && /store\.set\(resumeKey/.test(pw) && !/kvSet\([^)]*returnPoints/.test(pw), 'per-computer: return points are kept in this computer\'s local storage');
  ok(/store\.get\('projects\.keepLab'/.test(pw) && /store\.set\('projects\.keepLab'/.test(pw), 'per-computer: "Keep the Lab ready" is this computer\'s setting');
  ok(/localStorage\.getItem\(`hub\.\$\{key\}`\)/.test(src('ui.js')), 'per-computer: ui.js store is localStorage (outside the data folder sync looks at)');
  for (const f of ['routine-feedback.js', 'tools/three-boot.js']) ok(!/kvSet\([^)]*returnPoints/.test(src(f)), `per-computer: ${f} only reads return points`);
  // the Lab's asset cache (labload75) lives in the preview page's memory: nothing of it is written to the data folder
  const sb = src('tools/three-sandbox.html');
  ok(/kept in this page/.test(sb) && !/kvSet|hub\.fs\.write|writeFile/.test(sb.slice(sb.indexOf('kept in this page') - 2000, sb.indexOf('kept in this page') + 4000)), 'per-computer: the Lab\'s asset cache is in the page\'s memory only');
  // a project's synced record carries nothing per-computer: no tab / return point / cache in its workspace
  const w = T.world('p-local');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  writeProject(pc, makeProject(pc, 'Local', 'pjlocal'));
  ok(await T.converge(w) > 0, 'per-computer: first sync', T.why(w));
  const keys = Object.keys(proj(mac, 'pjlocal').workspace || {});
  ok(keys.every((k) => ['v', 'persona', 'plugins', 'description', 'chatId', 'sceneId', 'boardId', 'banner', 'bannerAt', 'descriptionAt', 'importedAt'].includes(k)), 'per-computer: the project\'s workspace holds only shared links and setup', keys);
  // each computer opening the project at its own times: "opened" settles to the later one, no conflict
  editProject(pc, 'pjlocal', (p) => { p.opened = pc.now() + 1000; });
  editProject(mac, 'pjlocal', (p) => { p.opened = mac.now() + 2000; });
  ok(await T.converge(w) > 0, 'per-computer: converges after both opened it', T.why(w));
  ok(await conflicts(pc) === 0 && await conflicts(mac) === 0 && proj(pc, 'pjlocal').opened === proj(mac, 'pjlocal').opened, 'per-computer: opened on both: no conflict, the later time');
  ok(S.localOnly('sync/state/index.json') && !S.localOnly('kv/workbench-pjlocal.json') && !S.localOnly('kv/projects.json'), 'per-computer: the worktable and projects sync; sync\'s own state never');
});

// ---------- 6b. the app on screen while the other computer's version arrives (Projects.reloadFromDisk) ----------
// The Mac's window holds the projects in memory with a change not written yet when the PC's version lands. What the
// window then writes goes through sync's write guard (engine.guardWrite, as store.js does after a pull).
scenario('on-screen', async () => {
  const w = T.world('p-onscreen');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  writeProject(pc, makeProject(pc, 'Live', 'pjlive'));
  ok(await T.converge(w) > 0, 'on-screen: first sync', T.why(w));
  const appWrite = (m, value) => m.write('kv/projects.json', m.e.guardWrite(m.p('kv/projects.json'), value));
  let held = PC.normalize(projects(mac)); mac.e.ackPulled(['kv/projects.json']); // the Mac's window read what arrived (and says so)
  // the PC renames it and adds a render; the Mac types a note line that isn't written yet
  editProject(pc, 'pjlive', (p) => { PC.rename(p, 'Live (final)', pc.now()); PC.addItem(p, { type: 'render', ref: 'r-pc', name: 'PC render' }, pc.now()); });
  held.list[0].notes += '\nMac: typed just now';
  ok(await T.converge(w) > 0, 'on-screen: the PC\'s version reaches the Mac', T.why(w));
  // reloadFromDisk: the pending change is written first (guarded), sync is told the window has what arrived, then read
  appWrite(mac, held);
  mac.e.ackPulled(['kv/projects.json']);
  held = PC.normalize(projects(mac));
  const p = held.list[0];
  ok(p.name === 'Live (final)' && p.items.some((x) => x.ref === 'r-pc') && p.notes.includes('Mac: typed just now'), 'on-screen: the Mac\'s unsaved line and the PC\'s rename + render are all in it', p);
  // the owner takes the PC's render out on the Mac: it stays out (before, the guard's old base brought it back)
  PC.removeItem(held.list[0], 'render', 'r-pc', mac.now());
  appWrite(mac, held);
  ok(await T.converge(w) > 0, 'on-screen: converges after taking it out', T.why(w));
  for (const m of [pc, mac]) ok(!proj(m, 'pjlive').items.some((x) => x.ref === 'r-pc') && proj(m, 'pjlive').notes.includes('Mac: typed just now'), `on-screen: taken out on the Mac stays out, the note stays, on the ${m.name}`, proj(m, 'pjlive').items.map((x) => x.id));
  // without telling sync (the window reloaded but sync still had the old base): the render came back — the bug fixed above
  editProject(pc, 'pjlive', (q) => { PC.addItem(q, { type: 'render', ref: 'r-pc2', name: 'PC render 2' }, pc.now()); });
  ok(await T.converge(w) > 0, 'on-screen: another render arrives', T.why(w));
  const stale = PC.normalize(projects(mac)); PC.removeItem(stale.list[0], 'render', 'r-pc2', mac.now());
  const back = mac.e.guardWrite(mac.p('kv/projects.json'), stale);
  ok(back.list[0].items.some((x) => x.ref === 'r-pc2'), 'on-screen: (why the window tells sync) without it, an item taken out right after it arrived is merged back in');
});

// ---------- 7. an earlier version restored on one computer while the other edits ----------
scenario('restore', async () => {
  const w = T.world('p-restore');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  writeProject(pc, makeProject(pc, 'Echo', 'pjecho'));
  ok(await T.converge(w) > 0, 'restore: first sync', T.why(w));
  const earlier = JSON.parse(JSON.stringify(proj(pc, 'pjecho')));
  editProject(pc, 'pjecho', (p) => { p.notes = p.notes.replace('Goal: a 30 s intro', 'Goal: something else entirely'); p.status = 'paused'; p.updated = pc.now(); });
  ok(await T.converge(w) > 0, 'restore: an edit reaches the Mac', T.why(w));
  mac.view.online = false;
  // PC: 🕘 Earlier versions › Restore (Projects.replaceWith: the earlier version under its id, stamped now)
  editProject(pc, 'pjecho', (p) => { for (const k of Object.keys(p)) if (k !== 'id') delete p[k]; Object.assign(p, JSON.parse(JSON.stringify(earlier)), { id: 'pjecho', updated: pc.now() }); });
  await rounds(w, 3);
  editProject(mac, 'pjecho', (p) => { p.notes += '\nMac: new line meanwhile'; PC.addItem(p, { type: 'board', ref: 'b-new', name: 'Refs' }, mac.now()); });
  mac.view.online = true;
  ok(await T.converge(w) > 0, 'restore: converges', T.why(w));
  for (const m of [pc, mac]) {
    const p = proj(m, 'pjecho');
    ok(p.notes.includes('Goal: a 30 s intro') && !p.notes.includes('something else entirely') && p.status === 'active', `restore: the restored version on the ${m.name}`, { notes: p.notes, status: p.status });
    ok(p.notes.includes('Mac: new line meanwhile') && p.items.some((x) => x.id === 'board:b-new'), `restore: what the Mac did meanwhile stays on the ${m.name}`, p.notes);
  }
  ok(await conflicts(pc) === 0 && await conflicts(mac) === 0, 'restore: no conflict');
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  console.log(`\nprojsync76: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
