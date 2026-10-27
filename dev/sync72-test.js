#!/usr/bin/env node
// (round 72, sync72) PC ↔ Mac sync through a SIMULATED cloud provider (dev/sync-sim.js): each computer has its own view
// of the cloud drive and a fake provider moves files between them with delays, uploads in several ticks, downloads in
// pieces, cloud-only placeholders (iCloud stubs, Mac dataless files, OneDrive online-only files), its own conflict copies,
// case-only renames, Mac NFD names, skewed clocks and a computer offline for days. Both data folders behave like Mac /
// Windows disks (case-insensitive). Scripted scenarios, then a randomized run; after each: both computers end identical,
// nothing written on either side is lost, nothing is duplicated, per-computer settings stay put.
// Never touches real data or a real cloud drive: everything is in a temp folder.
//   node dev/sync72-test.js [--only name] [--seeds N] [--keep] [--verbose]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Sim = require('./sync-sim');
Sim.install();
const S = require('../sync-merge');
const { createEngine } = require('../sync-engine');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ONLY = arg('--only', '');
const SEEDS = Number(arg('--seeds', 4));
const VERBOSE = argv.includes('--verbose') || Boolean(process.env.SYNC72_VERBOSE);
const THREAD = argv.includes('--thread'); // every computer's big-store work on the store thread (as in the app)

let failures = 0; let passes = 0;
const ok = (cond, what, detail) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`); } };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-sync72-'));
const raw = Sim.raw;

// ---------- a world: a clock, a cloud, computers ----------
function world(name, o = {}) {
  const dir = path.join(ROOT, name);
  raw.mkdirSync(dir, { recursive: true });
  const clock = Sim.clock(Date.now());
  const w = { name, dir, clock, cloud: Sim.cloud({ log: VERBOSE ? (...a) => console.log('  cloud:', ...a) : undefined }), ms: [], seed: o.seed || 1 };
  w.rnd = () => { w.seed = (w.seed * 1103515245 + 12345) & 0x7fffffff; return w.seed / 0x7fffffff; };
  return w;
}
// the store thread, as in the app (storework.js: syncHash / syncPull / syncMerge); one for the whole run
let worker = null; let wseq = 0; const wjobs = new Map();
function runOff(op, args) {
  if (!worker) {
    const { Worker } = require('worker_threads');
    worker = new Worker(path.join(__dirname, '..', 'storework.js'));
    worker.unref();
    worker.on('message', ({ id, res, err }) => { const j = wjobs.get(id); if (!j) return; wjobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  }
  // reading a placeholder downloads it (the OS does it on a real Mac / PC; here the provider lives in this thread)
  for (const f of [args.file, args.cloudFile, args.localFile]) if (f) Sim.hydrate(Sim.ci(f));
  return new Promise((resolve, reject) => { const id = ++wseq; wjobs.set(id, { resolve, reject }); worker.postMessage({ ...args, op, id }); });
}
// o: { platform, style, placeholders, nfd, skew, partialDown, slowUp, auto, thread (every store through the store thread) }
function computer(w, name, o = {}) {
  const base = path.join(w.dir, name);
  const m = { name, w, auto: o.auto !== undefined ? o.auto : true, skew: o.skew || 0, pulled: [], autoResolved: [] };
  m.data = path.join(base, 'data'); m.home = path.join(base, 'home'); m.cloudRoot = path.join(base, 'cloud');
  m.config = path.join(base, 'app', 'config.json'); m.theme = path.join(base, 'app', 'theme.css');
  Sim.ciVolume(m.data); raw.mkdirSync(m.home, { recursive: true });
  m.now = () => w.clock.now() + m.skew;
  m.view = w.cloud.view(m.cloudRoot, { name, style: o.style || (o.platform === 'win32' ? 'onedrive' : 'icloud'), placeholders: o.placeholders || null, nfd: Boolean(o.nfd), partialDown: o.partialDown, slowUp: o.slowUp, upTicks: o.upTicks, downTicks: o.downTicks, now: m.now });
  const cfg = { agents: [{ id: 'claude', name: 'Claude', mode: 'native' }], theme: { accent: '#ff7a00' }, layout: { gridColumns: 2 },
    settings: { notify: true, zoom: 1, hotkey: `${name}+H`, enginePaths: { claude: `${m.home}/bin/claude` }, sync: { on: true } } };
  raw.mkdirSync(path.dirname(m.config), { recursive: true });
  raw.writeFileSync(m.config, `${JSON.stringify(cfg, null, 2)}\n`); raw.writeFileSync(m.theme, '/* theme */\n');
  m.make = (extra = {}) => createEngine({
    dataDir: m.data, configPath: m.config, themePath: m.theme, cloudRoot: m.cloudRoot, machineName: name, home: m.home,
    platform: o.platform || 'darwin', now: m.now, chunk: 256 * 1024,
    cloudAttributes: m.view.attributes, requestDownload: (file) => m.view.request(file),
    autoResolve: () => m.auto, onAutoResolved: (r) => m.autoResolved.push(r), onPulled: (l) => m.pulled.push(...l),
    log: VERBOSE ? (...a) => console.log(`  ${name}:`, ...a) : undefined,
    ...((o.thread ?? THREAD) ? { offMin: 0, hashJson: (file, a) => runOff('syncHash', { file, ...a }), pullJson: (a) => runOff('syncPull', a), mergeJson: (a) => runOff('syncMerge', a) } : {}),
    ...extra,
  });
  m.e = m.make();
  m.p = (rel) => path.join(m.data, ...rel.split('/'));
  // what the owner does on this computer (stamped with this computer's clock)
  m.write = (rel, data) => { const f = m.p(rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2)); const t = new Date(m.now()); fs.utimesSync(f, t, t); };
  m.read = (rel) => { try { return fs.readFileSync(m.p(rel), 'utf8'); } catch { return null; } };
  m.json = (rel) => { const t = m.read(rel); try { return t === null ? null : JSON.parse(t); } catch { return undefined; } };
  m.edit = (rel, fn) => { const v = m.json(rel); const r = fn(v); m.write(rel, r === undefined ? v : r); };
  m.has = (rel) => fs.existsSync(m.p(rel));
  m.deleteChat = (id) => { fs.mkdirSync(m.p('trash'), { recursive: true }); fs.renameSync(m.p(`chats/${id}.json`), m.p(`trash/${id}.json`)); }; // Hearth's Delete
  m.cfg = () => JSON.parse(raw.readFileSync(m.config, 'utf8'));
  m.setCfg = (fn) => { const c = m.cfg(); fn(c); raw.writeFileSync(m.config, `${JSON.stringify(c, null, 2)}\n`); const t = new Date(m.now()); raw.utimesSync(m.config, t, t); };
  m.last = null;
  w.ms.push(m);
  return m;
}
async function pass(m, o) { m.last = await m.e.pass(o); return m.last; }
// one round: time moves on, then each computer's provider and engine run (in a seeded order)
async function round(w, { step = 2000, order } = {}) {
  w.clock.advance(step);
  const list = order || (w.rnd() < 0.5 ? w.ms : [...w.ms].reverse());
  for (const m of list) { m.view.tick(); if (m.offline) continue; await pass(m); }
}
const snap = (m) => Sim.snapshot(m.data, S, m.e.ctx());
function differs(a, b) {
  const A = snap(a); const B = snap(b); const out = [];
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) if (A[k] !== B[k]) out.push(`${k}: ${A[k] === undefined ? 'missing on ' + a.name : B[k] === undefined ? 'missing on ' + b.name : 'differs'}`);
  return out;
}
function settled(w) {
  if (!w.ms.every((m) => m.view.online && m.view.idle() && m.last && !m.last.pending && !m.last.held && ['synced', 'conflict'].includes(m.last.state))) return false;
  for (let i = 1; i < w.ms.length; i++) if (differs(w.ms[0], w.ms[i]).length) return false;
  return true;
}
// rounds until both computers are identical and nothing waits; → the number of rounds, or -1
async function converge(w, max = 60, o = {}) {
  for (let i = 1; i <= max; i++) { await round(w, o); if (i >= 2 && settled(w)) return i; }
  return -1;
}
const why = (w) => ({ diff: w.ms.length > 1 ? differs(w.ms[0], w.ms[1]).slice(0, 6) : [], st: w.ms.map((m) => ({ n: m.name, state: m.last?.state, pending: m.last?.pending, cloudOnly: m.last?.cloudOnly?.slice(0, 4), held: Boolean(m.last?.held), idle: m.view.idle(), err: m.last?.last?.errors })) });

// the files in a data folder that look like a copy made by a cloud client or a conflict ("x 2.json", "x (1).png",
// "x-PC.json", "x (Mac's conflicted copy …)")
function copies(m) {
  const out = [];
  const walk = (dir, rel) => { for (const e of raw.readdirSync(dir, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) { if (!S.localOnly(`${r}/x`)) walk(path.join(dir, e.name), r); } else if (!S.localOnly(r) && / \d+\.[^.]+$|\(\d+\)\.[^.]+$|-(PC|Mac)(-\d+)?\.[^.]+$|conflicted copy/i.test(e.name)) out.push(r); } };
  walk(m.data, '');
  return out;
}
const chat = (id, msgs, extra = {}) => ({ id, agentId: 'claude', title: `Chat ${id}`, updatedAt: 1, messages: msgs, ...extra });
const msg = (role, at, text) => ({ role, at, text });
const texts = (c) => (c?.messages || []).map((x) => x.text);
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// ---------- 0. the merge rules on their own ----------
scenario('merge-unit', async () => {
  const L = (...a) => a.join('\n');
  const base = L('a', 'b', 'c', 'd', 'e', 'f');
  ok(S.mergeText(base, L('A', 'b', 'c', 'd', 'e', 'f'), L('a', 'b', 'c', 'd', 'e', 'F'), false) === L('A', 'b', 'c', 'd', 'e', 'F'), 'merge: different lines of a text edited on each side → both');
  ok(S.mergeText(base, L('x', ...base.split('\n')), L(...base.split('\n'), 'y'), false) === L('x', ...base.split('\n'), 'y'), 'merge: lines added at the start here and the end there → both');
  ok(S.mergeText(base, L('a', 'B1', 'c', 'd', 'e', 'f'), L('a', 'B2', 'c', 'd', 'e', 'f'), false) === null, 'merge: code: one line changed two ways → a conflict (never both pasted into code)');
  ok(S.mergeText(base, L('a', 'B1', 'c', 'd', 'e', 'f'), L('a', 'B2', 'c', 'd', 'e', 'f'), true) === L('a', 'B1', 'B2', 'c', 'd', 'e', 'f'), 'merge: prose: one line changed two ways → both lines kept');
  ok(S.mergeText(base, L('a', 'c', 'd', 'e', 'f'), L('a', 'b', 'c', 'd', 'e', 'f', 'g'), false) === L('a', 'c', 'd', 'e', 'f', 'g'), 'merge: a line deleted here, one added there');
  ok(S.mergeText('one', 'one (PC)', 'one (Mac)', true) === L('one (PC)', 'one (Mac)') && S.mergeText('one', 'two', 'three', false) === null, 'merge: single lines: prose keeps both, other text conflicts');
  ok(S.mergeText(null, L('a', 'b', 'c'), L('a', 'B', 'c', 'd'), true) === L('a', 'b', 'B', 'c', 'd') && S.mergeText(null, 'x', 'y', false) === null, 'merge: no common version: prose is united line by line, other text conflicts');
  const notes = S.merge3({ v: 1, notes: L('Goal', 'Music', 'Todo') }, { v: 1, notes: L('Goal (PC)', 'Music', 'Todo') }, { v: 1, notes: L('Goal', 'Music', 'Todo', 'End card') });
  ok(notes.value.notes === L('Goal (PC)', 'Music', 'Todo', 'End card') && !notes.conflicts.length, 'merge3: project notes edited on both, no conflict', notes);
  const code = S.merge3({ code: base }, { code: L('a', 'X', 'c', 'd', 'e', 'f') }, { code: L('a', 'Y', 'c', 'd', 'e', 'f') });
  ok(code.value.code === L('a', 'X', 'c', 'd', 'e', 'f') && code.conflicts.length === 1 && code.conflicts[0].path === 'code', 'merge3: code changed on the same line both ways: ours kept, one conflict', code.conflicts);
  // keepAll: the base may be newer than one side's start: nothing is removed
  const b2 = [{ id: 's1', layers: [{ id: 'l1' }, { id: 'l2' }] }, { id: 's2' }];
  const o2 = [{ id: 's1', layers: [{ id: 'l1' }, { id: 'l2' }] }, { id: 's2' }, { id: 's3' }];
  const t2 = [{ id: 's1', layers: [{ id: 'l1', name: 'PC' }] }];
  const normal = S.merge3(b2, o2, t2).value; const kept = S.merge3(b2, o2, t2, { keepAll: true }).value;
  ok(normal.length === 2 && kept.length === 3 && kept[0].layers.length === 2 && kept[0].layers[0].name === 'PC', 'merge3 keepAll: items missing on one side are kept, its changes taken', { normal, kept });
  ok(S.merge3({ msgs: [1, 2] }, { msgs: [1, 2] }, { msgs: [1] }, { keepAll: true }).value.msgs.length === 2, 'merge3 keepAll: "ours = base" still looks inside (nothing dropped)');
  // counters: a first join adds both histories; a cloud client's copy of ONE history never counts twice
  ok(S.merge3(null, { n: 5 }, { n: 7 }, { counters: true }).value.n === 12 && S.merge3(null, { n: 5 }, { n: 7 }, { counters: true, shared: true }).value.n === 7 && S.merge3({ n: 4 }, { n: 5 }, { n: 7 }, { counters: true }).value.n === 8, 'merge3 counters: join adds, shared takes the larger, three-way adds both additions');
  // chat messages from both, in time order, once
  const c3 = S.merge3({ messages: [msg('user', 1, 'a')] }, { messages: [msg('user', 1, 'a'), msg('user', 3, 'mac')] }, { messages: [msg('user', 1, 'a'), msg('user', 2, 'pc')] });
  ok(texts(c3.value).join() === 'a,pc,mac', 'merge3: chat messages from both computers, in time order', texts(c3.value));
});

// ---------- 1. the same chat written on both computers while the cloud is slow ----------
scenario('chat-both', async () => {
  const w = world('chat-both');
  const pc = computer(w, 'PC', { platform: 'win32' });
  const mac = computer(w, 'Mac', { platform: 'darwin', nfd: true });
  pc.write('chats/c1.json', chat('c1', [msg('user', 1000, 'hello'), msg('assistant', 1001, 'hi')]));
  ok(await converge(w) > 0, 'chat-both: the first chat reaches the Mac', why(w));
  // both computers add messages; the providers deliver late (no ticks for a while on the Mac)
  mac.view.online = false;
  pc.edit('chats/c1.json', (c) => { c.messages.push(msg('user', 2000, 'from the PC'), msg('assistant', 2001, 'PC reply')); c.updatedAt = 2001; });
  await round(w); await round(w);
  mac.edit('chats/c1.json', (c) => { c.messages.push(msg('user', 2500, 'from the Mac'), msg('assistant', 2501, 'Mac reply')); c.updatedAt = 2501; });
  await round(w);
  pc.edit('chats/c1.json', (c) => { c.messages.push(msg('user', 3000, 'PC again')); c.updatedAt = 3000; });
  await round(w);
  mac.view.online = true;
  const n = await converge(w);
  ok(n > 0, 'chat-both: converges after both wrote the same chat', why(w));
  const want = ['hello', 'hi', 'from the PC', 'PC reply', 'from the Mac', 'Mac reply', 'PC again'];
  for (const m of [pc, mac]) {
    const t = texts(m.json('chats/c1.json'));
    ok(want.every((x) => t.includes(x)) && !dupes(t).length && t.length === want.length, `chat-both: every message once, on the ${m.name}`, t);
    ok(JSON.stringify(t) === JSON.stringify(want), `chat-both: in time order on the ${m.name}`, t);
    ok(!copies(m).length, `chat-both: no copies in the ${m.name}'s data`, copies(m));
  }
  // the title renamed two ways at once: a real conflict, settled by itself (merge, newest wins), the other kept
  mac.view.online = false;
  pc.edit('chats/c1.json', (c) => { c.title = 'Title on the PC'; });
  await round(w); await round(w);
  mac.edit('chats/c1.json', (c) => { c.title = 'Title on the Mac'; c.messages.push(msg('user', 4000, 'and one more')); });
  mac.view.online = true;
  ok(await converge(w) > 0, 'chat-both: converges after a title conflict', why(w));
  const c = pc.json('chats/c1.json');
  ok(['Title on the PC', 'Title on the Mac'].includes(c.title) && texts(c).includes('and one more') && texts(c).length === 8, 'chat-both: one title wins, no message lost', { title: c.title, n: texts(c).length });
  ok(!copies(pc).length && !copies(mac).length, 'chat-both: still no duplicate files', [...copies(pc), ...copies(mac)]);
});

// where a version that lost can still be found: the synced trash, conflict copies, this computer's trash and the
// copies kept before an incoming change (Deleted files & previous versions)
function recoverable(w, needle) {
  const roots = [];
  for (const m of w.ms) roots.push(path.join(m.cloudRoot, 'Hearth', 'trash'), path.join(m.cloudRoot, 'Hearth', '.sync', 'conflicts'), path.join(m.data, 'sync', 'trash'), path.join(m.data, 'sync', 'recovery'));
  const walk = (d) => { let ents = []; try { ents = raw.readdirSync(d, { withFileTypes: true }); } catch { return false; } for (const e of ents) { const f = path.join(d, e.name); if (e.isDirectory() ? walk(f) : (() => { try { return raw.readFileSync(f, 'utf8').includes(needle); } catch { return false; } })()) return true; } return false; };
  return roots.some(walk);
}
const PROJECT = (notes, extra = {}) => ({ v: 1, list: [{ id: 'p1', name: 'Clink', ident: { ci: 1, gi: 2 }, status: 'active', notes, items: [], created: 1, updated: 1, ...extra }] });
const scene = (id, layers, extra = {}) => ({ id, name: `Scene ${id}`, layers, updated: 1, ...extra });
const layer = (id, code, extra = {}) => ({ id, name: `Layer ${id}`, code, ...extra });
const CODE = ['const a = 1;', 'const b = 2;', 'const c = 3;', 'const d = 4;', 'const e = 5;', 'const f = 6;'].join('\n');

// ---------- 2. project notes edited on both ----------
scenario('notes-both', async () => {
  const w = world('notes-both');
  const pc = computer(w, 'PC', { platform: 'win32' });
  const mac = computer(w, 'Mac', { platform: 'darwin' });
  pc.write('kv/projects.json', PROJECT('Goal: a 30 s intro\nMusic: the Vital pad\nTodo: logo reveal'));
  ok(await converge(w) > 0, 'notes-both: the project reaches the Mac', why(w));
  // different lines on each computer, at the same time: both edits kept, no conflict
  mac.view.online = false;
  pc.edit('kv/projects.json', (d) => { d.list[0].notes = d.list[0].notes.replace('Goal: a 30 s intro', 'Goal: a 20 s intro (PC)'); d.list[0].updated = 5; });
  await round(w); await round(w);
  mac.edit('kv/projects.json', (d) => { d.list[0].notes += '\nTodo: end card (Mac)'; d.list[0].updated = 6; });
  mac.view.online = true;
  ok(await converge(w) > 0, 'notes-both: converges after notes edited on both', why(w));
  for (const m of [pc, mac]) {
    const n = m.json('kv/projects.json').list[0].notes;
    ok(n.includes('Goal: a 20 s intro (PC)') && n.includes('Todo: end card (Mac)') && n.includes('Music: the Vital pad') && !n.includes('Goal: a 30 s intro'), `notes-both: both computers' lines are in the notes on the ${m.name}`, n);
  }
  // the SAME line changed two ways: with conflicts settling by themselves, notes keep both versions (nothing hidden)
  mac.view.online = false;
  pc.edit('kv/projects.json', (d) => { d.list[0].notes = d.list[0].notes.replace('Music: the Vital pad', 'Music: Serum 2 bass (PC)'); });
  await round(w); await round(w);
  mac.edit('kv/projects.json', (d) => { d.list[0].notes = d.list[0].notes.replace('Music: the Vital pad', 'Music: a piano loop (Mac)'); });
  mac.view.online = true;
  ok(await converge(w) > 0, 'notes-both: converges after the same line changed two ways', why(w));
  for (const m of [pc, mac]) {
    const n = m.json('kv/projects.json').list[0].notes;
    ok(n.includes('Serum 2 bass (PC)') && n.includes('a piano loop (Mac)'), `notes-both: both versions of the line are kept on the ${m.name}`, n);
  }
  ok(!copies(pc).length && !copies(mac).length, 'notes-both: no duplicate files', [...copies(pc), ...copies(mac)]);
});

// ---------- 3. a Lab scene saved on both ----------
scenario('scene-both', async () => {
  const w = world('scene-both');
  const pc = computer(w, 'PC', { platform: 'win32' });
  const mac = computer(w, 'Mac', { platform: 'darwin', nfd: true });
  pc.write('kv/three-sketches.json', [scene('s1', [layer('l1', CODE), layer('l2', '// stars')])]);
  ok(await converge(w) > 0, 'scene-both: the scene reaches the Mac', why(w));
  mac.view.online = false;
  pc.edit('kv/three-sketches.json', (list) => { list[0].layers[0].code = list[0].layers[0].code.replace('const a = 1;', 'const a = 10; // PC'); list.push(scene('s2', [layer('l9', '// PC scene')])); });
  await round(w); await round(w);
  mac.edit('kv/three-sketches.json', (list) => { list[0].layers[0].code = list[0].layers[0].code.replace('const f = 6;', 'const f = 60; // Mac'); list[0].layers.push(layer('l3', '// Mac layer')); list[0].layers[1].name = 'Stars (Mac)'; list.push(scene('s3', [layer('l8', '// Mac scene')])); });
  mac.view.online = true;
  ok(await converge(w) > 0, 'scene-both: converges after the scene saved on both', why(w));
  for (const m of [pc, mac]) {
    const list = m.json('kv/three-sketches.json');
    const s1 = list.find((s) => s.id === 's1');
    ok(list.map((s) => s.id).sort().join() === 's1,s2,s3', `scene-both: both new scenes, once, on the ${m.name}`, list.map((s) => s.id));
    ok(s1.layers.map((l) => l.id).join() === 'l1,l2,l3' && s1.layers[1].name === 'Stars (Mac)', `scene-both: the Mac's layer and name kept on the ${m.name}`, s1.layers.map((l) => `${l.id}:${l.name}`));
    ok(s1.layers[0].code.includes('const a = 10; // PC') && s1.layers[0].code.includes('const f = 60; // Mac'), `scene-both: different lines of one layer's code edited on each computer: both kept on the ${m.name}`, s1.layers[0].code);
  }
  // the same line of code two ways: the newer one wins, the other waits in Deleted files
  mac.view.online = false;
  pc.edit('kv/three-sketches.json', (list) => { list[0].layers[0].code = list[0].layers[0].code.replace('const c = 3;', 'const c = 30; // PC'); });
  await round(w); await round(w);
  mac.edit('kv/three-sketches.json', (list) => { list[0].layers[0].code = list[0].layers[0].code.replace('const c = 3;', 'const c = 300; // Mac'); });
  mac.view.online = true;
  ok(await converge(w) > 0, 'scene-both: converges after the same line changed two ways', why(w));
  const code = pc.json('kv/three-sketches.json')[0].layers[0].code;
  const won = code.includes('const c = 30; // PC') ? 'PC' : code.includes('const c = 300; // Mac') ? 'Mac' : null;
  ok(won && !code.includes('<<<<'), 'scene-both: one version of the line wins, the code stays valid', code);
  ok(recoverable(w, won === 'PC' ? 'const c = 300; // Mac' : 'const c = 30; // PC'), 'scene-both: the other version can be brought back (Deleted files)');
  ok(!copies(pc).length && !copies(mac).length, 'scene-both: no duplicate files', [...copies(pc), ...copies(mac)]);
});

// ---------- 4. deleted on one computer, edited on the other ----------
scenario('delete-edit', async () => {
  const w = world('delete-edit');
  const pc = computer(w, 'PC', { platform: 'win32' });
  const mac = computer(w, 'Mac', { platform: 'darwin' });
  pc.write('chats/keep.json', chat('keep', [msg('user', 1, 'first')]));
  pc.write('chats/gone.json', chat('gone', [msg('user', 1, 'delete me')]));
  pc.write('notes/plan.md', '# Plan\n- one\n');
  pc.write('notes/old.md', 'old note\n');
  ok(await converge(w) > 0, 'delete-edit: everything reaches the Mac', why(w));
  mac.view.online = false;
  pc.deleteChat('keep'); pc.deleteChat('gone');
  fs.rmSync(pc.p('notes/plan.md')); fs.rmSync(pc.p('notes/old.md'));
  await round(w); await round(w);
  mac.edit('chats/keep.json', (c) => { c.messages.push(msg('user', 2, 'edited on the Mac meanwhile')); });
  mac.write('notes/plan.md', '# Plan\n- one\n- two (Mac)\n');
  mac.view.online = true;
  ok(await converge(w) > 0, 'delete-edit: converges', why(w));
  for (const m of [pc, mac]) {
    ok(texts(m.json('chats/keep.json')).includes('edited on the Mac meanwhile'), `delete-edit: a chat edited on the Mac while deleted on the PC comes back with the edit, on the ${m.name}`, m.json('chats/keep.json'));
    ok((m.read('notes/plan.md') || '').includes('two (Mac)'), `delete-edit: a note edited while deleted elsewhere is kept, on the ${m.name}`);
    ok(!m.has('chats/gone.json') && !m.has('notes/old.md'), `delete-edit: plain deletes go through, on the ${m.name}`);
  }
  ok(mac.has('trash/gone.json') || fs.existsSync(path.join(mac.data, 'sync', 'trash')), 'delete-edit: the deleted chat waits in a trash on the Mac');
  ok(!copies(pc).length && !copies(mac).length, 'delete-edit: no duplicate files', [...copies(pc), ...copies(mac)]);
});

// ---------- 5. a big attachment, mid-upload ----------
scenario('big-midway', async () => {
  const w = world('big-midway');
  const pc = computer(w, 'PC', { platform: 'win32', slowUp: 1024 * 1024, upTicks: 4 });
  const mac = computer(w, 'Mac', { platform: 'darwin', partialDown: 1024 * 1024, downTicks: 3 });
  ok(await converge(w) > 0, 'big-midway: both start in sync', why(w));
  const big = Buffer.alloc(12 * 1024 * 1024); for (let i = 0; i < big.length; i += 4096) big.writeUInt32LE(i * 2654435761 >>> 0, i);
  const want = Sim.sha(big);
  pc.write('attachments/clip.mp4', big);
  pc.write('chats/clip.json', chat('clip', [msg('user', 1, 'see attachments/clip.mp4')]));
  let broken = 0;
  const look = () => { const b = (() => { try { return raw.readFileSync(mac.p('attachments/clip.mp4')); } catch { return null; } })(); if (b && Sim.sha(b) !== want) broken += 1; };
  for (let i = 0; i < 6; i++) { await round(w); look(); }
  // the Mac's provider stops mid-download for an hour (half the file sits in the cloud folder), the Mac keeps running
  mac.view.online = false;
  for (let i = 0; i < 40; i++) { await round(w, { step: 90 * 1000 }); look(); }
  mac.view.online = true;
  const n = await converge(w); look();
  ok(n > 0, 'big-midway: converges once the download finishes', why(w));
  ok(broken === 0, 'big-midway: the Mac never had a half video in its data folder', broken);
  ok(Sim.sha(raw.readFileSync(mac.p('attachments/clip.mp4'))) === want, 'big-midway: the whole video arrives');
  // the PC replaces it while the Mac's copy is still arriving: the newest one ends on both
  const big2 = Buffer.from(big); big2.write('second version', 100);
  pc.write('attachments/clip.mp4', big2);
  for (let i = 0; i < 3; i++) { await round(w); look(); }
  ok(await converge(w) > 0, 'big-midway: converges after a second version', why(w));
  ok(Sim.sha(raw.readFileSync(mac.p('attachments/clip.mp4'))) === Sim.sha(big2) && broken === 0, 'big-midway: the second version arrives whole', broken);
});

// ---------- 6. settings that must stay on each computer ----------
scenario('settings-local', async () => {
  const w = world('settings-local');
  const pc = computer(w, 'PC', { platform: 'win32' });
  const mac = computer(w, 'Mac', { platform: 'darwin' });
  pc.write('window.json', { x: 10, w: 1900 }); mac.write('window.json', { x: 0, w: 1440 });
  pc.write('kv/speed.json', { last: ['pc'] }); mac.write('kv/speed.json', { last: ['mac'] });
  ok(await converge(w) > 0, 'settings-local: first sync', why(w));
  pc.setCfg((c) => { c.settings.zoom = 1.5; c.settings.hotkey = 'Ctrl+Alt+H'; c.settings.enginePaths.claude = 'C:\\Tools\\claude.exe'; c.layout.gridColumns = 3; c.theme.accent = '#3366ff'; });
  await round(w); await round(w);
  mac.setCfg((c) => { c.settings.zoom = 0.9; c.settings.notify = false; });
  ok(await converge(w) > 0, 'settings-local: converges after settings changed on both', why(w));
  const P = pc.cfg(); const M = mac.cfg();
  ok(P.settings.zoom === 1.5 && M.settings.zoom === 0.9, 'settings-local: zoom stays on each computer', [P.settings.zoom, M.settings.zoom]);
  ok(P.settings.hotkey === 'Ctrl+Alt+H' && M.settings.hotkey === 'Mac+H', 'settings-local: the hotkey stays on each computer', [P.settings.hotkey, M.settings.hotkey]);
  ok(P.settings.enginePaths.claude === 'C:\\Tools\\claude.exe' && M.settings.enginePaths.claude.startsWith(mac.home), 'settings-local: engine paths stay on each computer', [P.settings.enginePaths, M.settings.enginePaths]);
  ok(P.layout.gridColumns === 3 && M.layout.gridColumns === 2, 'settings-local: the window layout stays on each computer');
  ok(M.theme.accent === '#3366ff' && P.settings.notify === false, 'settings-local: the look and shared settings travel both ways', [M.theme.accent, P.settings.notify]);
  ok(pc.json('window.json').w === 1900 && mac.json('window.json').w === 1440 && pc.json('kv/speed.json').last[0] === 'pc' && mac.json('kv/speed.json').last[0] === 'mac', 'settings-local: window place and recent clicks never sync');
});

// ---------- 7. cloud-only placeholders (iCloud stubs on the Mac, online-only files on the PC) ----------
scenario('placeholders', async () => {
  const w = world('placeholders');
  const pc = computer(w, 'PC', { platform: 'win32', placeholders: 'win' });
  const mac = computer(w, 'Mac', { platform: 'darwin', placeholders: 'stub' });
  pc.write('chats/c1.json', chat('c1', [msg('user', 1000, 'hello')]));
  pc.write('attachments/pic.png', Buffer.alloc(3000, 7));
  ok(await converge(w) > 0, 'placeholders: arrives through stubs (asked for, then downloaded)', why(w));
  ok(texts(mac.json('chats/c1.json')).join() === 'hello', 'placeholders: the chat is on the Mac');
  // the PC writes; the Mac's provider is late by one round (the Mac has a good pass meanwhile) and brings a stub,
  // while the owner writes in the same chat on the Mac
  mac.view.online = false;
  pc.edit('chats/c1.json', (c) => { c.messages.push(msg('user', 2000, 'from the PC')); });
  await round(w, { order: [pc, mac] });
  await round(w, { order: [pc, mac] });
  mac.view.online = true;
  mac.edit('chats/c1.json', (c) => { c.messages.push(msg('user', 2500, 'from the Mac')); });
  await round(w, { order: [mac, pc] });
  ok(await converge(w) > 0, 'placeholders: converges', why(w));
  for (const m of [pc, mac]) ok(texts(m.json('chats/c1.json')).join() === 'hello,from the PC,from the Mac', `placeholders: no message lost behind a stub, on the ${m.name}`, texts(m.json('chats/c1.json')));
  // a Mac "dataless" file (Optimise Mac Storage) and the PC's online-only files
  const w2 = world('dataless');
  const a = computer(w2, 'PC', { platform: 'win32', placeholders: 'win' });
  const b = computer(w2, 'Mac', { platform: 'darwin', placeholders: 'dataless' });
  a.write('kv/three-sketches.json', [scene('s1', [layer('l1', CODE)])]);
  a.write('captures/shot.png', Buffer.alloc(5000, 3));
  b.write('notes/mac.md', 'from the Mac\n');
  ok(await converge(w2) > 0, 'placeholders: dataless + online-only files converge', why(w2));
  b.edit('kv/three-sketches.json', (list) => { list[0].name = 'Renamed on the Mac'; });
  a.edit('kv/three-sketches.json', (list) => { list[0].layers.push(layer('l2', '// PC')); });
  ok(await converge(w2) > 0, 'placeholders: converges after edits on both', why(w2));
  const s = a.json('kv/three-sketches.json')[0];
  ok(s.name === 'Renamed on the Mac' && s.layers.length === 2, 'placeholders: both edits kept through placeholders', s);
});

// ---------- 8. case-only renames and accents (Mac NFD names) ----------
scenario('case-accents', async () => {
  const w = world('case-accents');
  const pc = computer(w, 'PC', { platform: 'win32' });
  const mac = computer(w, 'Mac', { platform: 'darwin', nfd: true });
  pc.write('attachments/Photo.png', Buffer.alloc(4000, 1));
  mac.write('notes/Café crème.md'.normalize('NFD'), 'un café\n');
  ok(await converge(w) > 0, 'case-accents: first sync', why(w));
  // a case-only rename on the PC
  fs.renameSync(pc.p('attachments/Photo.png'), pc.p('attachments/photo.png'));
  const n = await converge(w, 40);
  ok(n > 0, 'case-accents: a case-only rename settles (nothing left waiting)', why(w));
  for (const m of [pc, mac]) {
    const names = raw.readdirSync(path.join(m.data, 'attachments'));
    ok(names.length === 1 && names[0] === 'photo.png', `case-accents: one file, the new spelling, on the ${m.name}`, names);
  }
  // an accented name made on the Mac (NFD), edited on the PC (NFC): one file everywhere
  pc.write('notes/Café crème.md', 'un café\nedited on the PC\n');
  ok(await converge(w, 40) > 0, 'case-accents: converges after an accented file edited on the PC', why(w));
  for (const m of [pc, mac]) {
    const names = raw.readdirSync(path.join(m.data, 'notes'));
    ok(names.length === 1 && names[0].normalize('NFC') === 'Café crème.md' && (m.read('notes/Café crème.md') || '').includes('edited on the PC'), `case-accents: one accented note with the edit, on the ${m.name}`, names);
  }
  ok(!copies(pc).length && !copies(mac).length, 'case-accents: no duplicate files', [...copies(pc), ...copies(mac)]);
});

// ---------- 9. clocks that disagree ----------
scenario('clock-skew', async () => {
  const w = world('clock-skew');
  const pc = computer(w, 'PC', { platform: 'win32', skew: -7 * 60000 });
  const mac = computer(w, 'Mac', { platform: 'darwin', skew: 9 * 60000 });
  pc.write('chats/c1.json', chat('c1', [msg('user', 1, 'hi')]));
  ok(await converge(w, 30) > 0, 'clock-skew: first sync with clocks 16 min apart', why(w));
  for (let i = 0; i < 4; i++) {
    pc.edit('chats/c1.json', (c) => { c.messages.push(msg('user', 10 + i * 2, `pc ${i}`)); });
    await round(w);
    mac.edit('chats/c1.json', (c) => { c.messages.push(msg('user', 11 + i * 2, `mac ${i}`)); });
    pc.write(`attachments/p${i}.png`, Buffer.alloc(2000 + i, i));
    mac.write(`attachments/m${i}.png`, Buffer.alloc(3000 + i, i));
    await round(w);
  }
  const n = await converge(w, 30);
  ok(n > 0, 'clock-skew: changes still arrive within a minute of rounds', why(w));
  ok(texts(pc.json('chats/c1.json')).length === 9 && texts(mac.json('chats/c1.json')).length === 9, 'clock-skew: every message on both', [texts(pc.json('chats/c1.json')), texts(mac.json('chats/c1.json'))]);
});

// ---------- 10. a computer offline for days ----------
scenario('offline-days', async () => {
  const w = world('offline-days');
  const pc = computer(w, 'PC', { platform: 'win32' });
  const mac = computer(w, 'Mac', { platform: 'darwin', placeholders: 'dataless' });
  for (const id of ['a', 'b', 'c', 'd']) pc.write(`chats/${id}.json`, chat(id, [msg('user', 1, `${id} 1`)]));
  pc.write('kv/three-sketches.json', [scene('s1', [layer('l1', CODE)]), scene('s2', [layer('l2', '// two')])]);
  ok(await converge(w) > 0, 'offline-days: first sync', why(w));
  mac.view.online = false;
  for (let day = 0; day < 3; day++) {
    pc.edit('chats/a.json', (c) => { c.messages.push(msg('user', 100 + day, `pc day ${day}`)); });
    mac.edit('chats/a.json', (c) => { c.messages.push(msg('user', 200 + day, `mac day ${day}`)); });
    pc.write(`chats/pc${day}.json`, chat(`pc${day}`, [msg('user', 1, 'new on the PC')]));
    mac.write(`chats/mac${day}.json`, chat(`mac${day}`, [msg('user', 1, 'new on the Mac')]));
    for (let i = 0; i < 4; i++) await round(w, { step: 6 * 3600 * 1000 });
  }
  pc.deleteChat('b'); // deleted on the PC, edited on the Mac
  mac.edit('chats/b.json', (c) => { c.messages.push(msg('user', 300, 'mac kept working on b')); });
  pc.deleteChat('c'); // deleted on the PC only
  mac.deleteChat('d'); // deleted on the Mac only
  pc.edit('kv/three-sketches.json', (l) => { l[0].layers[0].code += '\n// pc offline edit'; });
  mac.edit('kv/three-sketches.json', (l) => { l[1].name = 'Two (Mac)'; l.push(scene('s3', [])); });
  await round(w, { step: 3600 * 1000 });
  mac.view.online = true;
  ok(await converge(w) > 0, 'offline-days: the Mac catches up after 3 days', why(w));
  for (const m of [pc, mac]) {
    const a = texts(m.json('chats/a.json'));
    ok(a.length === 7 && !dupes(a).length, `offline-days: every message of both computers, once, on the ${m.name}`, a);
    ok(['pc0', 'pc1', 'pc2', 'mac0', 'mac1', 'mac2'].every((id) => m.has(`chats/${id}.json`)), `offline-days: the new chats of both, on the ${m.name}`);
    ok(texts(m.json('chats/b.json')).includes('mac kept working on b'), `offline-days: a chat edited on the Mac is kept although the PC deleted it, on the ${m.name}`);
    ok(!m.has('chats/c.json') && !m.has('chats/d.json'), `offline-days: plain deletes from both sides go through, on the ${m.name}`);
    const sc = m.json('kv/three-sketches.json');
    ok(sc.length === 3 && sc[0].layers[0].code.includes('pc offline edit') && sc[1].name === 'Two (Mac)', `offline-days: scenes merged, on the ${m.name}`, sc.map((s) => s.name));
  }
  ok(!copies(pc).length && !copies(mac).length, 'offline-days: no duplicate files', [...copies(pc), ...copies(mac)]);
});

// ---------- 11. the cloud client's own copies of whole files ----------
scenario('provider-copies', async () => {
  for (const style of ['icloud', 'onedrive', 'dropbox', 'gdrive']) {
    const w = world(`provider-copies-${style}`);
    const pc = computer(w, 'PC', { platform: 'win32', style });
    const mac = computer(w, 'Mac', { platform: 'darwin', style });
    pc.write('notes/plan.md', 'plan v1\n');
    pc.write('attachments/logo.png', Buffer.alloc(2000, 1));
    ok(await converge(w) > 0, `provider-copies (${style}): first sync`, why(w));
    mac.view.online = false;
    pc.write('notes/plan.md', 'plan v2 from the PC\n');
    pc.setCfg(() => {}); fs.writeFileSync(pc.theme, '/* PC theme */\n');
    pc.write('attachments/logo.png', Buffer.alloc(2100, 2));
    await round(w); await round(w);
    mac.write('notes/plan.md', 'plan v2 from the Mac\n');
    fs.writeFileSync(mac.theme, '/* Mac theme */\n');
    mac.write('attachments/logo.png', Buffer.alloc(2200, 3));
    await round(w);
    mac.view.online = true;
    ok(await converge(w) > 0, `provider-copies (${style}): converges`, why(w));
    const plan = pc.read('notes/plan.md');
    ok(/from the (PC|Mac)/.test(plan), `provider-copies (${style}): one version of the note in place`, plan);
    ok(recoverable(w, plan.includes('PC') ? 'plan v2 from the Mac' : 'plan v2 from the PC'), `provider-copies (${style}): the other version can be brought back`);
    ok(!copies(pc).length && !copies(mac).length, `provider-copies (${style}): no "x 2" / conflicted copies in either data folder`, [...copies(pc), ...copies(mac)]);
    const themes = [raw.readFileSync(pc.theme, 'utf8'), raw.readFileSync(mac.theme, 'utf8')];
    ok(themes[0] === themes[1], `provider-copies (${style}): one theme on both`, themes);
  }
});

// ---------- 12. conflicts the owner settles (Keep PC / Keep Mac / Keep both), and what "waiting" says ----------
scenario('choices', async () => {
  const w = world('choices');
  const pc = computer(w, 'PC', { platform: 'win32', auto: false });
  const mac = computer(w, 'Mac', { platform: 'darwin', auto: false });
  pc.write('kv/three-sketches.json', [scene('s1', [layer('l1', CODE)])]);
  pc.write('chats/t.json', chat('t', [msg('user', 1, 'hi')], { title: 'Start' }));
  pc.write('attachments/cover.png', Buffer.alloc(3000, 1));
  ok(await converge(w) > 0, 'choices: first sync', why(w));
  const twoWays = async () => {
    mac.view.online = false;
    pc.edit('kv/three-sketches.json', (l) => { l[0].layers[0].code = l[0].layers[0].code.replace('const c = 3;', 'const c = 30; // PC'); l[0].name = 'Neon (PC)'; });
    pc.edit('chats/t.json', (c) => { c.title = 'Named on the PC'; });
    pc.write('attachments/cover.png', Buffer.alloc(3100, 2));
    await round(w); await round(w);
    mac.edit('kv/three-sketches.json', (l) => { l[0].layers[0].code = l[0].layers[0].code.replace('const c = 3;', 'const c = 300; // Mac'); l[0].name = 'Neon (Mac)'; });
    mac.edit('chats/t.json', (c) => { c.title = 'Named on the Mac'; });
    mac.write('attachments/cover.png', Buffer.alloc(3200, 3));
    mac.view.online = true;
    return converge(w);
  };
  ok(await twoWays() > 0, 'choices: converges with conflicts left for the owner', why(w));
  const list = await mac.e.conflicts();
  ok(list.length >= 3 && ['kv/three-sketches.json', 'chats/t.json', 'attachments/cover.png'].every((r) => list.some((c) => c.rel === r)), 'choices: a scene, a chat title and a picture are listed as conflicts', list.map((c) => c.rel));
  ok(mac.last.state === 'conflict' && mac.last.conflicts >= 3, 'choices: the status says conflict, with the count', mac.last.state);
  const pv = await mac.e.preview(list.find((c) => c.rel === 'kv/three-sketches.json').id);
  ok(pv && pv.canBoth && pv.canMerge && Array.isArray(pv.ours) && Array.isArray(pv.theirs) && pv.fromPlatform, 'choices: both versions side by side, "Keep both" offered for a scene', pv && { canBoth: pv.canBoth, from: pv.from, fromPlatform: pv.fromPlatform });
  // Keep both on the scene, Keep PC (theirs, seen from the Mac) on the chat, Keep Mac (mine) on the picture
  const byRel = (r) => list.find((c) => c.rel === r).id;
  ok((await mac.e.resolve(byRel('kv/three-sketches.json'), 'both')).ok, 'choices: Keep both (scene)');
  ok((await mac.e.resolve(byRel('chats/t.json'), 'theirs')).ok, 'choices: Keep PC (chat)');
  ok((await mac.e.resolve(byRel('attachments/cover.png'), 'mine')).ok, 'choices: Keep Mac (picture)');
  for (const c of await pc.e.conflicts()) await pc.e.resolve(c.id, 'mine'); // the PC's own records of the same pairs (none is left behind)
  ok(await converge(w) > 0, 'choices: converges after the choices', why(w));
  for (const m of [pc, mac]) {
    const sc = m.json('kv/three-sketches.json');
    const names = sc.map((s) => s.name);
    ok(sc.length === 2 && names.some((n) => /^Neon \((PC|Mac)\)$/.test(n)) && names.some((n) => /\(from (PC|Mac)\)$/.test(n)), `choices: Keep both left both scenes, one named "(from …)", on the ${m.name}`, names);
    ok(sc.some((s) => s.layers[0].code.includes('// PC')) && sc.some((s) => s.layers[0].code.includes('// Mac')), `choices: both versions of the code are there, on the ${m.name}`);
  }
  ok(!copies(pc).length && !copies(mac).length, 'choices: no duplicate files', [...copies(pc), ...copies(mac)]);
  // waiting, in words: a file only in the cloud (an iCloud stub of a big video) is listed with its reason
  const w2 = world('waiting');
  const a = computer(w2, 'PC', { platform: 'win32' });
  const b = computer(w2, 'Mac', { platform: 'darwin', placeholders: 'stub' });
  a.write('captures/long.mp4', Buffer.alloc(9 * 1024 * 1024, 5));
  for (let i = 0; i < 6; i++) await round(w2);
  ok(b.last.pending >= 1 && b.last.waiting.some((x) => x.rel === 'captures/long.mp4' && x.why === 'cloud-only'), 'waiting: a big video only in the cloud is listed by name, "cloud-only"', b.last.waiting);
});

// ---------- 13. everything at once, randomized ----------
scenario('random', async () => {
  for (let sd = 1; sd <= SEEDS; sd++) {
    const w = world(`random-${sd}`, { seed: sd * 7919 });
    const R = w.rnd; const pick = (a) => a[Math.floor(R() * a.length)];
    const pc = computer(w, 'PC', { platform: 'win32', placeholders: pick([null, 'win']), style: pick(['onedrive', 'dropbox', 'icloud']), skew: Math.floor((R() - 0.5) * 240000), slowUp: 64 * 1024, thread: THREAD || R() < 0.5 });
    const mac = computer(w, 'Mac', { platform: 'darwin', nfd: true, placeholders: pick([null, 'stub', 'dataless']), skew: Math.floor((R() - 0.5) * 240000), partialDown: 64 * 1024, thread: THREAD || R() < 0.5 });
    const said = new Map(); // chat id → texts that must survive
    let at = 10;
    const say = (m, id) => { const t = `${m.name} ${at}`; m.edit(`chats/${id}.json`, (c) => { (c || (c = chat(id, []))).messages.push(msg('user', at++, t)); return c; }); said.get(id).add(t); };
    for (const id of ['x', 'y', 'z']) { said.set(id, new Set()); pc.write(`chats/${id}.json`, chat(id, [])); }
    const victims = ['v1', 'v2', 'v3', 'v4']; const deleted = new Set(); // chats only ever deleted (never edited after)
    for (const id of victims) pc.write(`chats/${id}.json`, chat(id, [msg('user', 1, `victim ${id}`)]));
    pc.write('kv/projects.json', PROJECT('Notes'));
    const scenes = new Set(); const lines = new Set();
    ok(await converge(w) > 0, `random ${sd}: first sync`, why(w));
    for (let step = 0; step < 50; step++) {
      const m = pick([pc, mac]);
      const r = R();
      if (r < 0.45) { if (m.has(`chats/${pick(['x', 'y', 'z'])}.json`)) say(m, pick(['x', 'y', 'z'])); }
      else if (r < 0.6) { const id = `n${step}`; said.set(id, new Set()); m.write(`chats/${id}.json`, chat(id, [])); say(m, id); }
      else if (r < 0.7) m.write(`attachments/f${step}.bin`, Buffer.alloc(1000 + Math.floor(R() * 200000), step & 255));
      else if (r < 0.75) { scenes.add(`s${step}`); m.edit('kv/three-sketches.json', (l) => { const list = Array.isArray(l) ? l : []; if (list.length && R() < 0.5) pick(list).name = `${m.name} ${step}`; list.push(scene(`s${step}`, [layer('l', `// ${m.name}`)])); return list; }); }
      else if (r < 0.79) { const t = `${m.name} note ${step}`; lines.add(t); m.edit('kv/projects.json', (d) => { d.list[0].notes += `\n${t}`; }); }
      else if (r < 0.8) { const id = victims.find((v) => !deleted.has(v)); if (id && m.has(`chats/${id}.json`)) { m.deleteChat(id); deleted.add(id); } }
      else if (r < 0.87) { const v = pick([pc, mac]).view; v.online = !v.online; }
      else if (r < 0.9) m.e = m.make(); // Hearth restarted on that computer (what the engine keeps only in memory is gone)
      else await round(w, { step: Math.floor(R() * 600000) });
      if (R() < 0.5) await round(w);
    }
    pc.view.online = true; mac.view.online = true;
    ok(await converge(w, 90) > 0, `random ${sd}: converges`, why(w));
    let lost = [];
    for (const [id, set] of said) for (const m of [pc, mac]) { const t = texts(m.json(`chats/${id}.json`)); lost.push(...[...set].filter((x) => !t.includes(x)).map((x) => `${m.name}:${id}:${x}`)); if (dupes(t).length) lost.push(`${m.name}:${id}: duplicated ${dupes(t)}`); }
    ok(!lost.length, `random ${sd}: every message on both computers, once`, lost.slice(0, 8));
    for (const m of [pc, mac]) {
      const ids = new Set((m.json('kv/three-sketches.json') || []).map((x) => x.id));
      ok([...scenes].every((id) => ids.has(id)), `random ${sd}: every scene made on either computer, on the ${m.name}`, [...scenes].filter((id) => !ids.has(id)));
      const notes = m.json('kv/projects.json').list[0].notes;
      ok([...lines].every((t) => notes.includes(t)), `random ${sd}: every line added to the notes, on the ${m.name}`, [...lines].filter((t) => !notes.includes(t)));
      ok([...deleted].every((id) => !m.has(`chats/${id}.json`)) && victims.filter((v) => !deleted.has(v)).every((id) => m.has(`chats/${id}.json`)), `random ${sd}: deleted chats gone, the others there, on the ${m.name}`, { deleted: [...deleted], here: victims.filter((id) => m.has(`chats/${id}.json`)) });
    }
    ok(!copies(pc).length && !copies(mac).length, `random ${sd}: no duplicate files`, [...copies(pc), ...copies(mac)]);
  }
});

module.exports = { world, computer, round, converge, settled, differs, why, copies, recoverable, chat, msg, texts, dupes, ok, scenario, pass };

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.split(',').includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  console.log(`\nsync72: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  if (!argv.includes('--keep')) fs.rmSync(ROOT, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });
