#!/usr/bin/env node
// (round 95, aside95) Sync's choices on two versions, without a window:
//   giant     a very long chat (60 MB by default, ASIDE95_MB) kept aside / in conflict, each choice made by round 94's
//             engine (sync-engine.js at the round-94 commit, read from git) and by this one with asidework.js on a
//             store thread; the main process's longest stall measured by the lag probe (mainlag-probe.js,
//             HEARTH_LOOPLAG=prof: the event loop's delay and the CPU profile's busy stretches), and the results
//             compared (the same chat in place, the same versions in Deleted files). Choices: Use the one kept aside,
//             Keep both, Compare (kept aside); Keep the other, Merge, Keep both (conflict); Restore from Deleted files.
//             A version that can't be read stops a choice with nothing changed; a file changed while the choice was
//             being prepared stops it too.
//   theirs    "Keep the other" on two computers (dev/sync-sim.js): the version it replaced is in Deleted files on BOTH
//             computers (before: only on the one where the choice was made) and comes back from the other one; on
//             the computer where it was made it is listed once (sync-conflicts.js's rule); the conflict's own
//             bookkeeping (its record and copy in the trash's conflicts/ folder) is as before; a picture too
//   byId      new conflict records name the noticing computer by id; each side labelled exactly (sync.js Sync.whose):
//             the noticing computer, the one the copy came from, a third computer, two computers with the same name;
//             a record without it (older) labelled as before
//   mixed     round 94's engine on one computer and this one on the other: a conflict noticed by either is listed,
//             previewed and settled on the other; round 94's window code reads the new record's sides right
// Never touches real data or a real cloud drive: temp folders only.
//   node dev/aside95-test.js            ASIDE95_MB=20 for a quicker run
'use strict';
process.env.HEARTH_LOOPLAG = process.env.HEARTH_LOOPLAG || 'prof';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Probe = require('../mainlag-probe');

const ROOT = path.join(__dirname, '..');
const R94 = 'c33c1f37256c1d8dc89cb40fd1a3924fbd4fafe9'; // "Patch notes: round 94" (the release before this one)
const MB = Number(process.env.ASIDE95_MB) || 60;
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`); } };
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'as95-'));
const roots = new Set([tmpRoot]);
const day = () => new Date().toISOString().slice(0, 10);
const load = () => { const l = os.loadavg()[0] / Math.max(1, os.cpus().length); return Math.round(l * 100) / 100; };

// round 94's sync-engine.js, compiled as if it sat next to this one (its requires are this tree's)
let old = null;
function oldEngine() {
  if (old !== null) return old;
  try {
    const src = execFileSync('git', ['show', `${R94}:sync-engine.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const Module = require('module'); const fname = path.join(ROOT, 'sync-engine.round94.js');
    const m = new Module(fname, module); m.filename = fname; m.paths = Module._nodeModulePaths(ROOT); m._compile(src, fname);
    old = m.exports;
  } catch { old = false; }
  return old;
}
const R94src = (file) => { try { return execFileSync('git', ['show', `${R94}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };

// the store's files thread, as in the app
let worker = null; let seq = 0; const jobs = new Map();
function runOff(op, args) {
  if (!worker) {
    const { Worker } = require('worker_threads');
    worker = new Worker(path.join(ROOT, 'storework.js')); worker.unref();
    worker.on('message', ({ id, res, err }) => { const j = jobs.get(id); if (!j) return; jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  }
  return new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); worker.postMessage({ ...args, op, id }); });
}
const AW = require('../asidework');

// ---------- giant: before (round 94) and after ----------
function giant(tag, n, dataDir) {
  const messages = [];
  const pad = 'x'.repeat(3000);
  for (let i = 0; i < n; i++) messages.push({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', at: 1e12 + i, text: `${tag} ${i} ${pad}` });
  messages[5].file = path.join(dataDir, 'refs', 'cover.png'); // (a path: each form of it, this computer's and the cloud's)
  return { id: 'big', agentId: 'claude', title: 'Tour diary', updatedAt: 1, messages };
}
const N = Math.ceil((MB * 1024 * 1024) / 3080);
function theirsOf(v) {
  const t = { ...v, title: 'Tour diary (Mac)', updatedAt: 2, messages: v.messages.slice() };
  for (let i = t.messages.length - 20; i < t.messages.length; i++) t.messages[i] = { ...t.messages[i], text: `edited on the Mac ${i}` };
  for (let i = 0; i < 10; i++) t.messages.push({ id: `mac${i}`, role: 'user', at: 2e12 + i, text: `only on the Mac ${i}` });
  return t;
}
// a computer with a giant chat, a version of it kept aside and one in conflict (the cloud copy), and its engine
function setupGiant(name, make) {
  const base = path.join(tmpRoot, name);
  const dataDir = path.join(base, 'data'); const cloudRoot = path.join(base, 'cloud'); const app = path.join(base, 'app');
  for (const d of [dataDir, cloudRoot, app]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(app, 'config.json'), '{}\n'); fs.writeFileSync(path.join(app, 'theme.css'), '');
  const rel = 'chats/big.json';
  const ours = giant('pc', N, dataDir);
  fs.mkdirSync(path.join(dataDir, 'chats'), { recursive: true });
  const oursText = JSON.stringify(ours);
  fs.writeFileSync(path.join(dataDir, 'chats', 'big.json'), oursText);
  const theirs = theirsOf(ours);
  const stateDir = path.join(dataDir, 'sync');
  // versions kept aside (in this computer's Deleted files, as the pieces lane keeps them) and their notes, before the
  // engine starts (it reads its notes once)
  const notes = [];
  const keepAside = (id, v) => {
    const f = path.join(stateDir, 'trash', day(), 'chats', `${id.slice(-8)}-big.json`);
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v));
    notes.unshift({ id, at: Date.now(), rel, trash: `here:${day()}/chats/${id.slice(-8)}-big.json`, why: 'auto', side: 'theirs', kind: 'json', from: 'Studio Mac', fromPlatform: 'darwin', fields: [] });
  };
  for (const k of ['aaaa0001', 'aaaa0002', 'aaaa0009', 'aaaa000a']) keepAside(`${day()}-${k}`, theirs);
  fs.writeFileSync(path.join(stateDir, 'aside.json'), JSON.stringify(notes));
  const e = make({ dataDir, configPath: path.join(app, 'config.json'), themePath: path.join(app, 'theme.css'), cloudRoot, machineName: name, home: path.join(base, 'home'), platform: 'win32' });
  // a conflict record (the other computer's version as its copy, in the cloud's form)
  const conflict = (cid, v) => {
    const dir = path.join(cloudRoot, 'Hearth', '.sync', 'conflicts'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${cid}.copy.json`), JSON.stringify(require('../sync-merge').toCloud(v, e.ctx())));
    fs.writeFileSync(path.join(dir, `${cid}.json`), JSON.stringify({ id: cid, rel, kind: 'json', copy: `${cid}.copy.json`, at: Date.now(), by: name, from: 'Studio Mac', byPlatform: 'win32', fromId: 'StudioMac-1a2b3c4d', fromPlatform: 'darwin', oursAt: 1000, theirsAt: 2000, fields: [] }));
  };
  return { name, e, rel, dataDir, file: path.join(dataDir, 'chats', 'big.json'), ours, oursText, theirs, conflict };
}
// one choice, timed: → { ms (wall), maxMs (event-loop delay), blockMs (longest busy stretch of the CPU profile), r }
// (the test's own garbage collected first: its 60 MB reads of each result aren't the engine's stall)
const gc = (() => { try { require('v8').setFlagsFromString('--expose-gc'); return require('vm').runInNewContext('gc'); } catch { return () => {}; } })();
async function timed(fn) {
  gc(); await new Promise((res) => setTimeout(res, 20));
  await Probe.take({ reset: true });
  const t0 = Date.now();
  let r; try { r = await fn(); } catch (err) { r = { ok: false, error: err.message }; }
  await new Promise((res) => setTimeout(res, 30));
  const p = await Probe.take({ reset: true });
  return { ms: Date.now() - t0, maxMs: p.delay.max, blockMs: p.blocks?.[0]?.ms || 0, where: p.blocks?.[0]?.app?.[0] || p.blocks?.[0]?.top?.[0] || '', r };
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const hereEntries = async (e) => (await e.trash()).filter((t) => t.where === 'here' && /big\.json$/.test(t.rel));

async function giantRun(label, make) {
  const out = {};
  const G = setupGiant(label, make);
  const { e } = G;
  await e.aside(); // (its state read)
  // a version kept aside: Compare, then Use the one kept aside
  out.compare = await timed(() => e.aside(`${day()}-aaaa0001`, 'compare'));
  out.asideTheirs = await timed(() => e.aside(`${day()}-aaaa0001`, 'theirs'));
  const afterTheirs = readJson(G.file);
  out.asideTheirs.title = afterTheirs.title; out.asideTheirs.n = afterTheirs.messages.length; out.asideTheirs.path = String(afterTheirs.messages[5].file).slice(G.dataDir.length);
  // Keep both (kept aside): put this computer's back first
  fs.writeFileSync(G.file, G.oursText);
  out.asideBoth = await timed(() => e.aside(`${day()}-aaaa0002`, 'both'));
  const afterBoth = readJson(G.file);
  out.asideBoth.title = afterBoth.title; out.asideBoth.n = afterBoth.messages.length;
  // a conflict: Keep the other, Merge, Keep both (a chat: its own copy)
  for (const [k, how] of [['conflictTheirs', 'theirs'], ['conflictMerge', 'merge'], ['conflictBoth', 'both']]) {
    fs.writeFileSync(G.file, G.oursText);
    const cid = `${day()}-${{ theirs: 'bbbb0001', merge: 'bbbb0002', both: 'bbbb0003' }[how]}`;
    G.conflict(cid, G.theirs);
    out[k] = await timed(() => e.resolve(cid, how));
    const v = readJson(how === 'both' && out[k].r?.made ? path.join(G.dataDir, ...out[k].r.made.split('/')) : G.file);
    out[k].title = v.title; out[k].n = v.messages.length; out[k].path = String(v.messages[5].file).slice(G.dataDir.length); out[k].lastText = v.messages[v.messages.length - 11]?.text;
  }
  // Restore this computer's version from Deleted files (replacing the one in place)
  fs.writeFileSync(G.file, JSON.stringify(G.theirs));
  const ent = (await hereEntries(e)).find((t) => { try { return readJson(path.join(e.stateDir, 'trash', ...t.id.slice(5).split('/'))).title === 'Tour diary'; } catch { return false; } });
  out.restore = await timed(() => e.restore(ent?.id, { replace: true }));
  const afterRestore = readJson(G.file);
  out.restore.title = afterRestore.title; out.restore.n = afterRestore.messages.length; out.restore.path = String(afterRestore.messages[5].file).slice(G.dataDir.length);
  const tl = await e.trash(); out.trashHere = tl.filter((t) => t.where === 'here').length; out.trashCloud = tl.filter((t) => t.where === 'cloud').length;
  out.G = G;
  return out;
}

async function giantPart() {
  const O = oldEngine();
  const results = {};
  if (!O) console.log('(round 94\'s engine is not in this checkout: the "before" column is skipped)');
  else results.before = await giantRun('before', (o) => O.createEngine(o));
  const fresh = () => require('../sync-engine').createEngine;
  results.after = await giantRun('after', (o) => fresh()({ ...o, asideBig: AW.create({ runOff }) }));
  const A = results.after; const B = results.before;
  const acts = ['compare', 'asideTheirs', 'asideBoth', 'conflictTheirs', 'conflictMerge', 'conflictBoth', 'restore'];
  const rows = acts.map((k) => `  ${k.padEnd(15)} ${B ? `before: stall ${String(B[k].maxMs).padStart(7)} ms (busy ${String(B[k].blockMs).padStart(5)} ms, ${String(B[k].ms).padStart(5)} ms in all)` : ''}  after: stall ${String(A[k].maxMs).padStart(6)} ms (busy ${String(A[k].blockMs).padStart(4)} ms, ${String(A[k].ms).padStart(5)} ms in all)`);
  console.log(`giant chat: ${MB} MB, ${N} messages · load ${load()} per core\n${rows.join('\n')}`);
  for (const k of acts) if (A[k].blockMs >= 30) console.log(`  (after, ${k}: its longest busy stretch: ${A[k].where})`);
  for (const k of acts) ok(A[k].r?.ok !== false || k === 'compare', `giant: ${k} works`, A[k].r);
  // the same results as round 94's engine
  if (B) {
    for (const k of ['asideTheirs', 'conflictTheirs', 'conflictMerge', 'restore']) ok(A[k].title === B[k].title && A[k].n === B[k].n && A[k].path === B[k].path && A[k].lastText === B[k].lastText, `giant: ${k} leaves the same chat in place as before`, { a: { t: A[k].title, n: A[k].n, p: A[k].path }, b: { t: B[k].title, n: B[k].n, p: B[k].path } });
    ok(A.asideBoth.title === B.asideBoth.title && A.asideBoth.n === B.asideBoth.n, 'giant: Keep both (kept aside): the same chat as before (both titles, every message of both)', { a: [A.asideBoth.title, A.asideBoth.n], b: [B.asideBoth.title, B.asideBoth.n] });
    ok(A.conflictBoth.title === B.conflictBoth.title && A.conflictBoth.n === B.conflictBoth.n && A.conflictBoth.r?.made && /^chats\/big-[0-9a-f]{5}\.json$/.test(A.conflictBoth.r.made), 'giant: Keep both (conflict): its own chat "… (from Mac)", as before', { a: A.conflictBoth.r, t: A.conflictBoth.title });
    ok(A.trashHere === B.trashHere && A.trashCloud === B.trashCloud + 1, 'giant: as many versions in this computer\'s Deleted files as before, and Keep the other\'s replaced version in the synced ones too', { a: [A.trashHere, A.trashCloud], b: [B.trashHere, B.trashCloud] });
  }
  ok(A.asideTheirs.title === 'Tour diary (Mac)' && A.asideTheirs.n === N + 10 && A.asideTheirs.path === '\\refs\\cover.png', 'giant: Use the one kept aside: that version in place, its paths this computer\'s', A.asideTheirs);
  ok(A.restore.title === 'Tour diary' && A.restore.n === N, 'giant: Restore brings this computer\'s version back', A.restore);
  // the main process: a long stall before, none after (judged with the box's load in mind)
  const L = load(); const loaded = L > 0.9;
  for (const k of ['asideTheirs', 'asideBoth', 'conflictTheirs', 'conflictMerge', 'conflictBoth', 'restore']) {
    const lim = loaded ? 400 : 150;
    if (A[k].maxMs >= lim && loaded) console.log(`  (${k}: ${A[k].maxMs} ms with the box loaded ${L} per core: not judged)`);
    else ok(A[k].maxMs < lim, `giant: ${k} holds the main process under ${lim} ms`, { maxMs: A[k].maxMs, blockMs: A[k].blockMs, where: A[k].where, load: L });
    if (B && B[k].maxMs >= 300) ok(A[k].maxMs * 4 <= B[k].maxMs, `giant: ${k}: the stall is at least 4× shorter than round 94's`, { before: B[k].maxMs, after: A[k].maxMs });
  }
  // a version that can't be read: nothing changes, said so
  {
    const G = A.G; const e = G.e;
    fs.writeFileSync(G.file, G.oursText);
    const id = `${day()}-aaaa0009`;
    const tf = path.join(e.stateDir, 'trash', day(), 'chats', `${id.slice(-8)}-big.json`);
    fs.writeFileSync(tf, `${JSON.stringify(G.theirs).slice(0, 2e6)}`); // (damaged: cut short)
    const before = fs.readFileSync(G.file, 'utf8').length;
    const r = await e.aside(id, 'theirs');
    ok(r && r.ok === false && /can't be read/.test(r.error) && fs.readFileSync(G.file, 'utf8').length === before, 'giant: a kept version that can\'t be read → said so, nothing changed', r);
    // this computer's can't be read: Keep both stops; Use the one kept aside goes on (the damaged one kept in Deleted files first)
    fs.writeFileSync(tf, JSON.stringify(G.theirs));
    fs.writeFileSync(G.file, G.oursText.slice(0, 3e6));
    const hb = (await hereEntries(e)).length;
    const r2 = await e.aside(id, 'both');
    ok(r2 && r2.ok === false && /can't be read/.test(r2.error) && fs.readFileSync(G.file, 'utf8').length === 3e6, 'giant: Keep both with this computer\'s version damaged → said so, nothing changed (never taken as empty)', r2);
    const r3 = await e.aside(id, 'theirs');
    ok(r3?.ok && readJson(G.file).title === 'Tour diary (Mac)' && (await hereEntries(e)).length === hb + 1, 'giant: Use the one kept aside replaces a damaged one, which waits in Deleted files', r3);
    // changed while being prepared: nothing changes, try again
    fs.writeFileSync(G.file, G.oursText);
    const id2 = `${day()}-aaaa000a`;
    const big = await AW.create({ runOff }).take({ how: 'theirs', rel: G.rel, file: G.file, src: path.join(e.stateDir, 'trash', day(), 'chats', `${id2.slice(-8)}-big.json`), from: 'Mac', ctx: e.ctx() });
    fs.appendFileSync(G.file, ' ');
    const p = await big.put();
    ok(big.ok && p.ok === false && /changed/.test(p.error) && fs.readFileSync(G.file, 'utf8') === `${G.oursText} ` && !fs.readdirSync(path.dirname(G.file)).some((f) => /^\.hearth-tmp-/.test(f)), 'giant: changed while it was being prepared → nothing replaced, nothing left behind', p);
    const small = await AW.create({ runOff }).take({ how: 'theirs', rel: 'kv/notes.json', file: path.join(G.dataDir, 'kv', 'notes.json'), src: tf, ctx: e.ctx() });
    ok(small === null || (await AW.create({ runOff, min: 1e12 }).take({ how: 'theirs', rel: G.rel, file: G.file, src: tf, ctx: e.ctx() })) === null, 'giant: a small store stays the engine\'s own way');
  }
  return results;
}

// ---------- on two computers (dev/sync-sim.js) ----------
function hookEngines() {
  // which computers run round 94's engine (the mixed part): by name
  const p = require.resolve('../sync-engine'); const real = require(p);
  const OLD = new Set();
  require.cache[p].exports = { ...real, createEngine: (o) => (OLD.has(o.machineName) && oldEngine() ? oldEngine().createEngine(o) : real.createEngine(o)) };
  return OLD;
}
async function twoPart(OLD) {
  const T = require('./sync72-test');
  const K = require('../keptaside-core');
  const pair = async (name, o = {}) => {
    const w = T.world(`as95-${name}`); roots.add(path.dirname(w.dir));
    const pc = T.computer(w, o.pc || 'PC', { platform: 'win32' }); const mac = T.computer(w, o.mac || 'Mac', { platform: 'darwin' });
    for (const m of [pc, mac]) { if (!OLD.has(m.name)) m.e = m.make({ asideBig: AW.create({ runOff }) }); m.auto = false; }
    return { w, pc, mac };
  };
  const inTrash = (m, id) => (id.startsWith('recovery:') ? path.join(m.e.stateDir, 'recovery', ...id.slice(9).split('/')) : id.startsWith('here:') ? path.join(m.e.stateDir, 'trash', ...id.slice(5).split('/')) : path.join(m.e.cloudDir, 'trash', ...id.slice(6).split('/')));
  // sync-conflicts.js's Deleted files: a twin listed once (its rule, taken from the file)
  const twinSrc = /const twin = ([^\n]+);\n/.exec(fs.readFileSync(path.join(ROOT, 'sync-conflicts.js'), 'utf8'))?.[1];
  // eslint-disable-next-line no-new-func
  const listed = (all) => { const twin = new Function('all', `return ${twinSrc};`)(all); return all.filter((t) => !twin(t)); };
  // sync.js's Sync.whose (its rule, taken from the file), for a computer { id, name }
  const whoseSrc = /const whose = (\(c\) => \{[^\n]+\});\n/.exec(fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8'))?.[1];
  // eslint-disable-next-line no-new-func
  const whose = (c, me) => new Function('st', `return ${whoseSrc};`)({ machine: me })(c);
  ok(Boolean(twinSrc && whoseSrc), 'the window\'s rules are where this test reads them');

  // Keep the other: the version it replaced, on both computers
  {
    const { w, pc, mac } = await pair('theirs');
    const rel = 'kv/boards.json';
    pc.write(rel, [{ id: 'b1', name: 'Moods', updatedAt: 1, items: [] }]);
    ok(await T.converge(w) > 0, 'theirs: first sync', T.why(w));
    pc.edit(rel, (v) => { v[0].name = 'Moods (PC)'; }); mac.edit(rel, (v) => { v[0].name = 'Moods (Mac)'; });
    await T.converge(w);
    const c = (await pc.e.conflicts())[0];
    const m = c?.by === 'PC' ? pc : mac; const o = m === pc ? mac : pc; // (m: the computer that noticed it)
    ok(Boolean(c) && c.byId === m.e.machine().id && c.fromId === o.e.machine().id && c.by === m.name, 'byId: a new record names the noticing computer by id (and by name, as before)', c);
    const mine = m.json(rel)[0].name; const theirs = (await m.e.preview(c.id)).theirs[0].name;
    const beforeM = await m.e.trash(); const beforeO = await o.e.trash();
    ok((await m.e.resolve(c.id, 'theirs')).ok && m.json(rel)[0].name === theirs, 'theirs: Keep the other');
    const fresh = K.newEntries(beforeM, await m.e.trash(), rel);
    const here = fresh.find((t) => t.where === 'here'); const cloud = fresh.find((t) => t.where === 'cloud');
    ok(here && cloud && here.id.slice(5) === cloud.id.slice(6) && /\/[0-9a-f]{8}-boards\.json$/.test(here.id), 'theirs: the replaced version is in this computer\'s Deleted files and in the synced ones, under the same name', fresh);
    ok(cloud && JSON.parse(fs.readFileSync(inTrash(m, cloud.id), 'utf8'))[0].name === mine, 'theirs: …whole', cloud);
    ok(listed(await m.e.trash()).filter((t) => K.plainRel(t.rel) === rel).length === listed(beforeM).filter((t) => K.plainRel(t.rel) === rel).length + 1, 'theirs: …listed once on this computer (Deleted files)', listed(await m.e.trash()).map((t) => t.id));
    const arch = path.join(m.e.cloudDir, 'trash', day(), 'conflicts');
    ok(fs.existsSync(path.join(arch, `${c.id}.json`)) && fs.existsSync(path.join(arch, c.copy)) && !(await m.e.conflicts()).length, 'theirs: the conflict\'s own record and copy put away as before (the trash\'s conflicts/ folder)');
    ok(await T.converge(w) > 0 && o.json(rel)[0].name === theirs && !(await o.e.conflicts()).length, 'theirs: both computers use the other version', T.why(w));
    const onO = K.newEntries(beforeO, await o.e.trash(), rel).filter((t) => t.where === 'cloud');
    ok(onO.length === 1 && JSON.parse(fs.readFileSync(inTrash(o, onO[0].id), 'utf8'))[0].name === mine, 'theirs: the replaced version is in Deleted files on the OTHER computer too (before: only where the choice was made)', onO);
    const rr = onO[0] && await o.e.restore(onO[0].id, { replace: true });
    ok(rr?.ok && rr.rel === rel && o.json(rel)[0].name === mine, 'theirs: …and comes back from there (its name without the prefix)', rr);
    ok(await T.converge(w) > 0 && m.json(rel)[0].name === mine, 'theirs: …on both computers', T.why(w));
    // whose: as each computer sees this record
    const meM = { id: m.e.machine().id, name: m.name }; const meO = { id: o.e.machine().id, name: o.name };
    ok(whose(c, meM).a && !whose(c, meM).flip && whose(c, meO).b && whose(c, meO).flip && !whose(c, meO).third, 'byId: the noticing computer sees its version in place; the other sees the copy as its own', [whose(c, meM), whose(c, meO)]);
    ok(whose(c, { id: 'Studio-00000000', name: 'Studio' }).third && !whose(c, { id: 'Studio-00000000', name: 'Studio' }).a, 'byId: a third computer: neither version is called its own');
    ok(whose(c, { id: 'other-1', name: m.name }).third, 'byId: a third computer named like the noticing one: not mistaken for it (by name it was)', whose(c, { id: 'other-1', name: m.name }));
    const oldRec = { ...c }; delete oldRec.byId;
    ok(whose(oldRec, meM).a && whose(oldRec, meO).flip && whose(oldRec, { id: 'x', name: m.name }).a, 'byId: a record without it (round 94) labelled as before (by name)', [whose(oldRec, meM), whose(oldRec, meO)]);
  }
  // a picture: Keep the other → the replaced picture on the other computer too
  {
    const { w, pc, mac } = await pair('picture');
    const rel = 'refs/cover.png';
    const PNG = (n) => Buffer.from(`\x89PNG\r\n\x1a\n${'x'.repeat(n)}`, 'binary');
    pc.write(rel, PNG(100));
    ok(await T.converge(w) > 0, 'picture: first sync', T.why(w));
    pc.write(rel, PNG(200)); mac.write(rel, PNG(300));
    await T.converge(w);
    const m = (await pc.e.conflicts()).length ? pc : mac; const o = m === pc ? mac : pc;
    const c = (await m.e.conflicts())[0];
    const size = fs.statSync(m.p(rel)).size;
    const beforeO = await o.e.trash();
    ok((await m.e.resolve(c.id, 'theirs')).ok, 'picture: Keep the other');
    ok(await T.converge(w) > 0, 'picture: synced', T.why(w));
    const onO = K.newEntries(beforeO, await o.e.trash(), rel).filter((t) => t.where === 'cloud');
    ok(onO.length === 1 && fs.statSync(inTrash(o, onO[0].id)).size === size, 'picture: the replaced picture is in Deleted files on the other computer, as it was', onO);
  }
  // mixed: round 94 on one computer, this one on the other
  if (!oldEngine()) { console.log('(round 94\'s engine is not in this checkout: the mixed part is skipped)'); return; }
  const oldMine = (() => { // round 94's keptaside.js mineOf, as it was
    const src = R94src('keptaside.js'); const f = src && /function mineOf\(p\) \{\n([\s\S]*?)\n {2}\}/.exec(src)?.[1];
    // eslint-disable-next-line no-new-func
    return f ? (p, me) => new Function('p', 'Sync', f)(p, { status: () => ({ machine: me }) }) : null;
  })();
  ok(Boolean(oldMine), 'mixed: round 94\'s window code is where this test reads it');
  for (const [label, noticer] of [['new noticed, round 94 settles', 'PC'], ['round 94 noticed, new settles', 'Mac94']]) {
    OLD.add('Mac94');
    const { w, pc, mac } = await pair(`mixed-${noticer}`, { mac: 'Mac94' });
    const rel = 'kv/boards.json';
    pc.write(rel, [{ id: 'b1', name: 'Moods', updatedAt: 1, items: [] }]);
    ok(await T.converge(w) > 0, `mixed (${label}): first sync`, T.why(w));
    const first = noticer === 'PC' ? mac : pc; const second = noticer === 'PC' ? pc : mac;
    // the first one's change goes up while the second is away; the second changes it too, then comes back and notices
    second.offline = true;
    first.edit(rel, (v) => { v[0].name = `Moods (${first.name})`; });
    for (let i = 0; i < 6; i++) await T.round(w);
    second.edit(rel, (v) => { v[0].name = `Moods (${second.name})`; });
    second.offline = false;
    await T.converge(w);
    const cs = await second.e.conflicts(); const csFirst = await first.e.conflicts();
    ok(cs.length === 1 && csFirst.length === 1 && cs[0].id === csFirst[0].id && cs[0].by === second.name, `mixed (${label}): the record is listed on both computers`, { cs, csFirst });
    const c = csFirst[0];
    ok(noticer === 'PC' ? c.byId === pc.e.machine().id : c.byId === undefined, `mixed (${label}): byId only in the new engine's records`, c);
    const pv = await first.e.preview(c.id);
    ok(pv && pv.ours?.[0]?.name && pv.theirs?.[0]?.name && pv.ours[0].name !== pv.theirs[0].name, `mixed (${label}): the other version previews it`, pv && { ours: pv.ours, theirs: pv.theirs });
    const meF = { id: first.e.machine().id, name: first.name };
    if (oldMine) { const om = oldMine(c, meF); const nw = whose(c, meF); ok(om.a === nw.a && om.b === nw.b && om.b === true, `mixed (${label}): round 94's window and this one label the sides the same (the copy is this computer's)`, { om, nw }); }
    // the computer the copy came from keeps its own version (the copy: 'theirs' there)
    const r = await first.e.resolve(c.id, 'theirs');
    ok(r?.ok, `mixed (${label}): settled on the other computer`, r);
    ok(await T.converge(w) > 0 && !(await pc.e.conflicts()).length && !(await mac.e.conflicts()).length, `mixed (${label}): settled on both`, T.why(w));
    ok(pc.json(rel)[0].name === `Moods (${first.name})` && mac.json(rel)[0].name === `Moods (${first.name})`, `mixed (${label}): both computers have the version chosen`, [pc.json(rel), mac.json(rel)]);
    const t2 = await second.e.trash();
    ok(t2.some((t) => K.plainRel(t.rel) === rel && (() => { try { return JSON.parse(fs.readFileSync(inTrash(second, t.id), 'utf8'))[0].name === `Moods (${second.name})`; } catch { return false; } })()), `mixed (${label}): the version replaced is in Deleted files on the computer that noticed it`, t2.map((t) => t.id));
    OLD.delete('Mac94');
  }
}

(async () => {
  const OLD = hookEngines();
  await giantPart();
  await twoPart(OLD);
  console.log(`aside95-test: ${passes} passed, ${failures} failed`);
  worker?.terminate();
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); process.exit(1); });
