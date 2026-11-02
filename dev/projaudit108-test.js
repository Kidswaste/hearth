#!/usr/bin/env node
// (round 108, projaudit108) A project renamed on both computers while one computer's sync records are briefly held
// (Windows' antivirus, OneDrive or the indexer holding them: EBUSY / EPERM), through the two-computer simulator
// (dev/sync-sim.js, the worlds of dev/sync72-test.js, the real sync engine) with the project store's real shape:
//   records   the PC's own sync records (data/sync: its state, its bases) and its journal in the cloud held for a few
//             passes while the PC renames the project (and puts a chat in it) and the Mac renames it (and recolours it):
//             nothing goes up or is merged half-way while held; once they read: one name on both, the other kept aside
//             (a note in the sync panel names both), the chat put in and the colour both kept, nothing doubled
//   guard     the window's save of the projects store right after the Mac's version arrived, the file held at that
//             moment: the save waits (EHELD), then is merged: the rename made here survives AND the Mac's change stays
//   both      the two together, the Mac's rename arriving while the PC's records are held: after, Keep both = ONE
//             project with both names, on both computers
// Never touches real data or a real cloud drive: temp folders only.
//   node dev/projaudit108-test.js [--only name,name]
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
const Sim = require('./sync-sim');
const PC = require('../projects-core');
const WS = require('../project-workspace-core');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) { passes += 1; console.log(`✓ ${what}`); } else { failures += 1; console.log(`✖ ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`); } };
const projects = (m) => m.json('kv/projects.json') || { v: 1, list: [], dismissed: [] };
const proj = (m, id) => projects(m).list.find((p) => p.id === id) || null;
const editProject = (m, id, fn) => m.edit('kv/projects.json', (d) => { const p = d.list.find((x) => x.id === id); if (!p) throw Error(`no project ${id} on the ${m.name}`); fn(p, d); return d; });
const doubled = (m) => { const d = projects(m); const out = []; const ids = new Set(); for (const p of d.list) { if (ids.has(p.id)) out.push(`project ${p.id}`); ids.add(p.id); const seen = new Set(); for (const x of p.items) { if (seen.has(x.id)) out.push(`${p.id}:${x.id}`); seen.add(x.id); } } return out; };
const step = async (m) => { m.w.clock.advance(3000); m.view.tick(); m.last = await m.e.pass(); m.view.tick(); return m.last; };
const roots = new Set();
function pair(name) {
  const w = T.world(`pa108-${name}`);
  roots.add(path.dirname(w.dir));
  return { w, pc: T.computer(w, 'PC', { platform: 'win32' }), mac: T.computer(w, 'Mac', { platform: 'darwin', nfd: true }) };
}
// the PC's own sync records: its data/sync folder (state, bases, aside) and its journal in the cloud
const recordsOf = (m) => { const mine = path.resolve(path.join(m.data, 'sync')); const journal = path.resolve(path.join(m.cloudRoot, 'Hearth', '.sync', 'journal')); return (p) => { const a = path.resolve(String(p || '')); return a === mine || a.startsWith(mine + path.sep) || a.startsWith(journal + path.sep); }; };
const hold = (m, code = 'EBUSY') => { const mine = recordsOf(m); Sim.T.hook = (op, p, p2) => (mine(p) || (p2 && mine(p2)) ? code : null); };
const release = () => { Sim.T.hook = null; };
async function setup(name) {
  const { w, pc, mac } = pair(name);
  pc.write('chats/rc.json', T.chat('rc', [T.msg('user', 1, 'x')], { title: 'rc' }));
  pc.write('chats/rd.json', T.chat('rd', [T.msg('user', 1, 'y')], { title: 'rd' }));
  const p0 = PC.create({ id: 'pjneon', name: 'Neon', at: pc.now(), items: [{ type: 'chat', ref: 'rc', name: 'rc' }] });
  p0.workspace = WS.workspace({ chatId: 'rc' });
  const other = PC.create({ id: 'pjquiet', name: 'Quiet', at: pc.now(), items: [] });
  pc.write('kv/projects.json', { v: 1, list: [p0, other], dismissed: [] });
  ok(await T.converge(w, 60) > 0 && proj(mac, 'pjneon')?.name === 'Neon', `${name}: first sync`, T.why(w));
  return { w, pc, mac };
}
const cloudProjects = (w, m) => { try { return JSON.parse(Sim.raw.readFileSync(path.join(m.cloudRoot, 'Hearth', 'files', 'kv', 'projects.json'), 'utf8')); } catch { return null; } };

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

scenario('records', async () => {
  const { w, pc, mac } = await setup('records');
  const ci0 = proj(pc, 'pjneon').ident.ci;
  editProject(mac, 'pjneon', (p) => { PC.rename(p, 'Neon (Mac)', mac.now()); PC.setIdent(p, { ci: p.ident.ci + 1 }, mac.now()); });
  await step(mac);
  hold(pc);
  editProject(pc, 'pjneon', (p) => { PC.rename(p, 'Neon (PC)', pc.now()); p.items.push({ id: 'chat:rd', type: 'chat', ref: 'rd', name: 'rd', at: pc.now() }); p.updated = pc.now(); });
  const during = [];
  for (let i = 0; i < 4; i++) { await step(pc); await step(mac); during.push({ s: pc.last.state, held: pc.last.held, e: pc.last.error, blocked: (pc.last.blocked || []).map((x) => `${x.rel}:${x.why || x.reason || ''}`), waiting: (pc.last.waiting || []).map((x) => x.rel) }); }
  const held = { here: proj(pc, 'pjneon'), cloud: cloudProjects(w, mac)?.list?.find((p) => p.id === 'pjneon') };
  release();
  ok(held.here?.name === 'Neon (PC)' && held.here.items.some((x) => x.ref === 'rd'), 'records: while the PC\'s sync records are held, its rename and the chat it put in stay as typed (not merged half-way)', { here: held.here?.name, items: held.here?.items?.map((x) => x.id), during });
  ok(held.cloud?.name === 'Neon (Mac)', 'records: …and nothing of the PC\'s went up over the Mac\'s version meanwhile', held.cloud?.name);
  ok(await T.converge(w, 80) > 0, 'records: once they read, both computers end the same', T.why(w));
  const a = proj(pc, 'pjneon'); const b = proj(mac, 'pjneon');
  console.log('  (records: held passes', JSON.stringify(during), '· the name kept:', a?.name, ')', JSON.stringify([...pc.e.status().aside, ...mac.e.status().aside].map((n) => [n.why, n.side, n.from, n.fields])), JSON.stringify([pc.autoResolved, mac.autoResolved]).slice(0, 800));
  ok(a && b && a.name === b.name && ['Neon (PC)', 'Neon (Mac)'].includes(a.name), 'records: one name on both computers, the project once', { pc: a?.name, mac: b?.name });
  const lost = a?.name === 'Neon (PC)' ? 'Neon (Mac)' : 'Neon (PC)';
  const notes = [...pc.e.status().aside, ...mac.e.status().aside].filter((n) => n.rel === 'kv/projects.json');
  ok(notes.some((n) => (n.fields || []).some((f) => f.path === 'list.pjneon.name' && [f.ours, f.theirs].includes(lost))), 'records: the other name is kept aside (the sync panel\'s note names it): nothing lost', notes.map((n) => n.fields));
  ok(a?.items.some((x) => x.ref === 'rd') && b?.items.some((x) => x.ref === 'rd'), 'records: the chat the PC put in is in the project on both', b?.items?.map((x) => x.id));
  ok(a?.ident.ci === ci0 + 1 && b?.ident.ci === ci0 + 1, 'records: the Mac\'s new colour is kept on both', { pc: a?.ident, mac: b?.ident });
  ok(proj(pc, 'pjquiet') && proj(mac, 'pjquiet') && !doubled(pc).length && !doubled(mac).length && projects(pc).list.length === 2, 'records: the other project untouched, nothing doubled', [...doubled(pc), ...doubled(mac)]);
  ok(!T.copies(pc).length && !T.copies(mac).length, 'records: no stray copies', [...T.copies(pc), ...T.copies(mac)]);
});

scenario('guard', async () => {
  const { w, pc, mac } = await setup('guard');
  // the window on the PC still holds the version from before the Mac's rename arrived
  const windowCopy = JSON.parse(JSON.stringify(projects(pc)));
  editProject(mac, 'pjneon', (p) => { PC.rename(p, 'Neon (Mac)', mac.now()); });
  editProject(mac, 'pjquiet', (p) => { p.notes = 'notes from the Mac'; p.updated = mac.now(); });
  ok(await T.converge(w, 60) > 0 && proj(pc, 'pjneon')?.name === 'Neon (Mac)', 'guard: the Mac\'s rename arrived on the PC', proj(pc, 'pjneon')?.name);
  // the owner renames it in that window (the older copy) and it saves: the file held right then
  const p = windowCopy.list.find((x) => x.id === 'pjneon'); PC.rename(p, 'Neon (PC)', pc.now());
  const file = pc.p('kv/projects.json'); const real = fs.readFileSync;
  let err = null; let r;
  fs.readFileSync = function (f, ...a) { if (path.resolve(String(f)) === path.resolve(file)) throw Object.assign(new Error('EBUSY: held (test)'), { code: 'EBUSY' }); return real.call(this, f, ...a); };
  try { r = pc.e.guardWrite(file, windowCopy); } catch (e) { err = e; } finally { fs.readFileSync = real; }
  ok(err?.code === 'EHELD', 'guard: while the file is held, the window\'s save waits (EHELD): never written unmerged over the Mac\'s version', { err: err?.message, r: r?.list?.map((x) => [x.name, x.notes]) });
  ok(proj(pc, 'pjquiet')?.notes === 'notes from the Mac', 'guard: …the file on disk still has the Mac\'s change');
  const merged = pc.e.guardWrite(file, windowCopy); // the store tries again a moment later (store.js hold)
  pc.write('kv/projects.json', merged);
  const m = merged.list.find((x) => x.id === 'pjneon');
  ok(m?.name === 'Neon (PC)', 'guard: once it reads, the rename made here survives', m?.name);
  ok(merged.list.find((x) => x.id === 'pjquiet')?.notes === 'notes from the Mac', 'guard: …and the Mac\'s other change is kept (merged, not written over)', merged.list.map((x) => [x.name, x.notes]));
  ok(await T.converge(w, 60) > 0 && proj(mac, 'pjneon')?.name === 'Neon (PC)' && proj(mac, 'pjquiet')?.notes === 'notes from the Mac', 'guard: both computers end with the rename and the Mac\'s notes', { mac: proj(mac, 'pjneon')?.name, why: T.why(w) });
  const notes = [...pc.e.status().aside].filter((n) => n.rel === 'kv/projects.json');
  ok(notes.some((n) => (n.fields || []).some((f) => f.path === 'list.pjneon.name')), 'guard: the Mac\'s name is kept aside on the PC (the computer that settled it), not dropped', notes.map((n) => n.fields));
});

scenario('both', async () => {
  const { w, pc, mac } = await setup('both');
  mac.view.online = false;
  editProject(mac, 'pjneon', (p) => PC.rename(p, 'Neon (Mac)', mac.now()));
  editProject(pc, 'pjneon', (p) => PC.rename(p, 'Neon (PC)', pc.now()));
  for (let i = 0; i < 3; i++) await step(pc);
  hold(pc, 'EPERM');
  mac.view.online = true;
  for (let i = 0; i < 4; i++) { await step(mac); await step(pc); }
  release();
  ok(await T.converge(w, 80) > 0, 'both: converges once the records read', T.why(w));
  const won = proj(pc, 'pjneon')?.name;
  ok(['Neon (PC)', 'Neon (Mac)'].includes(won) && proj(mac, 'pjneon')?.name === won, 'both: one name on both', { pc: won, mac: proj(mac, 'pjneon')?.name });
  const holder = pc.e.status().aside.some((n) => n.rel === 'kv/projects.json') ? pc : mac;
  const n = holder.e.status().aside.find((x) => x.rel === 'kv/projects.json');
  ok(Boolean(n), 'both: the other name kept aside, on the computer that settled it', { pc: pc.e.status().aside, mac: mac.e.status().aside });
  if (!n) return;
  const r = await holder.e.aside(n.id, 'both');
  ok(r.ok, 'both: Keep both', r);
  ok(await T.converge(w, 80) > 0, 'both: after Keep both, both computers end the same', T.why(w));
  for (const m of [pc, mac]) {
    const d = projects(m);
    ok(d.list.filter((x) => /Neon/.test(x.name)).length === 1 && /Neon \(PC\)/.test(proj(m, 'pjneon')?.name) && /Neon \(Mac\)/.test(proj(m, 'pjneon')?.name) && !doubled(m).length, `both: ONE project named with both, nothing doubled, on the ${m.name}`, d.list.map((x) => [x.id, x.name]));
  }
});

// the Lab finds the other files of a model an imported project brought (labmodels-core.js folderOf): its numbered folder
// in the project's unpacked files, Mac and Windows paths; anything else as before
scenario('imported-model', async () => {
  const LM = require('../labmodels-core');
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok(eq(LM.folderOf('/Users/q/Library/Application Support/Hearth/data/assets/projects/Garage108/assets/0/car/car.gltf'), { dir: '/Users/q/Library/Application Support/Hearth/data/assets/projects/Garage108/assets/0', rel: 'car/car.gltf' }), 'imported-model: a model an imported project brought is a folder (its .bin and pictures go to the preview with it)');
  ok(eq(LM.folderOf('C:\\Users\\q\\Hearth\\data\\assets\\projects\\Garage108 2\\assets\\12\\car.obj'), { dir: 'C:\\Users\\q\\Hearth\\data\\assets\\projects\\Garage108 2\\assets\\12', rel: 'car.obj' }), 'imported-model: …written the Windows way');
  ok(eq(LM.folderOf('/d/data/assets/projects/P/files/3/chair/chair.obj'), { dir: '/d/data/assets/projects/P/files/3', rel: 'chair/chair.obj' }), 'imported-model: …a project file that is a model too');
  ok(LM.folderOf('/d/data/assets/x/car.gltf') === null && LM.folderOf('/d/data/assets/projects/P/car.gltf') === null && LM.folderOf('/d/data/assets/projects/P/assets/car.gltf') === null && LM.folderOf('/d/data/refs/1761800000000-Paint.png') === null, 'imported-model: anything else as before (a file alone is not a folder)');
  ok(eq(LM.folderOf('/d/data/refs/1761800000000-car/car/car.gltf'), { dir: '/d/data/refs/1761800000000-car', rel: 'car/car.gltf' }), 'imported-model: the Lab\'s own copies as before');
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); } finally { release(); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); // (the simulator's own temp folder)
  console.log(`\nprojaudit108: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
