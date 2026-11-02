#!/usr/bin/env node
// (round 104, emptyread104) A read that fails is never "empty": every place round 104's audit found that took a held
// (EBUSY / EPERM), unlistable or half-written file as "nothing there" and then wrote or acted on it. Each case fails on
// the code before this round:
//   sync      · a merge whose base file can't be read: never merged as if there were no base (a counter counted twice,
//               a thing removed on one computer brought back), main side and store thread
//             · this computer's journal held when it is written: its earlier lines are kept (were replaced)
//             · the cloud's format note held: the pass waits (it went on as if there were no minimum)
//             · sync's write guard can't read the file a window saves over: the save waits (was written unmerged)
//   store     · a save the sync guard can't check yet is held and tried again, never written as given
//   scenes    · a save dropping Lab scenes, the file unreadable right then: refused (the guard was skipped)
//   settings  · configsafe's state note held: not rewritten with only the new mark
//   scan      · dev/datasafe-scan.js flags round 102's localJsonText and the other shapes; the app as it is passes
//   node dev/emptyread104-test.js [--keep]
// Never touches real data: temp folders only.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) { passes += 1; console.log(`✓ ${what}`); } else { failures += 1; console.log(`✖ ${what}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`); } };
const busy = (code = 'EBUSY') => Object.assign(new Error(`${code}: held (test)`), { code });
const TMP = require('./tmp-own').mkdtemp('er104-');
// only this test's own temp folders are ever removed: under the system's temp folder, named by a test
function rmTemp(d) {
  const r = path.resolve(d);
  if (path.dirname(r) !== path.resolve(os.tmpdir()) || !/^(er104-|hearth-sync72-)/.test(path.basename(r))) { console.log(`  (not removed: ${r})`); return; }
  fs.rmSync(r, { recursive: true, force: true });
}

// ---------------------------------------------------------------- sync (the two-computer simulator)
async function syncCases() {
  const T = require('./sync72-test');
  const Sim = require('./sync-sim');
  const raw = Sim.raw;
  const step = async (m) => { m.w.clock.advance(3000); m.view.tick(); m.last = await m.e.pass(); m.view.tick(); return m.last; };
  const baseOf = (m, rel) => path.join(m.data, 'sync', 'base', ...rel.split('/'));
  const near = (m, rel) => (m.last?.blocked || []).some((x) => x.rel === rel) || (m.last?.waiting || []).some((x) => x.rel === rel);

  // 1. the base held while both computers changed a counter store
  {
    const w = T.world('er104-base');
    const pc = T.computer(w, 'PC', { platform: 'win32' }); const mac = T.computer(w, 'Mac', { platform: 'darwin' });
    const rel = 'kv/ui-usage.json';
    pc.write(rel, { clicks: { lab: 5 }, gone: { x: 1 } });
    ok(await T.converge(w) > 0 && mac.json(rel)?.clicks?.lab === 5, 'base: both computers have the counts', T.why(w));
    ok(raw.existsSync(baseOf(pc, rel)), 'base: the PC keeps a base for the store');
    mac.edit(rel, (v) => { v.clicks.lab = 6; delete v.gone; }); await step(mac); // the Mac: +1, and "gone" removed
    pc.edit(rel, (v) => { v.clicks.lab = 7; }); // the PC: +2
    Sim.T.hook = (op, p) => (op === 'open' && path.resolve(p) === path.resolve(baseOf(pc, rel)) ? 'EBUSY' : null);
    for (let i = 0; i < 3; i++) await step(pc);
    Sim.T.hook = null;
    const during = pc.json(rel);
    ok(during?.clicks?.lab === 7 && during.gone, 'base: while its base can\'t be read, the PC\'s store is not merged (no count added twice, nothing removed comes back)', during);
    ok(near(pc, rel), 'base: the store waits, by name', { blocked: pc.last.blocked, waiting: pc.last.waiting });
    ok(await T.converge(w) > 0, 'base: converges once the base reads', T.why(w));
    const after = pc.json(rel);
    ok(after?.clicks?.lab === 8 && !after.gone && mac.json(rel)?.clicks?.lab === 8, 'base: then each side\'s additions counted once (5 + 1 + 2 = 8), "gone" stays removed', { pc: after, mac: mac.json(rel) });
  }

  // 2. this computer's journal held when the pass writes it
  {
    const w = T.world('er104-journal');
    const pc = T.computer(w, 'PC', { platform: 'win32' }); const mac = T.computer(w, 'Mac', { platform: 'darwin' });
    pc.write('chats/claude-a.json', T.chat('claude-a', [{ role: 'user', text: 'first' }]));
    ok(await T.converge(w) > 0, 'journal: first sync', T.why(w));
    const jf = path.join(pc.cloudRoot, 'Hearth', '.sync', 'journal', `${pc.e.machine().id}.jsonl`);
    const before = raw.readFileSync(jf, 'utf8').split('\n').filter(Boolean);
    ok(before.some((l) => l.includes('chats/claude-a.json')), 'journal: the PC\'s journal names its first chat');
    pc.write('chats/claude-b.json', T.chat('claude-b', [{ role: 'user', text: 'second' }]));
    Sim.T.hook = (op, p) => (op === 'open' && path.resolve(p) === path.resolve(jf) ? 'EBUSY' : null);
    await step(pc);
    Sim.T.hook = null;
    const during = raw.readFileSync(jf, 'utf8').split('\n').filter(Boolean);
    ok(before.every((l) => during.includes(l)), 'journal: a held journal is never rewritten without its earlier lines', { before: before.length, during: during.length });
    pc.write('chats/claude-c.json', T.chat('claude-c', [{ role: 'user', text: 'third' }]));
    ok(await T.converge(w) > 0, 'journal: converges', T.why(w));
    const after = raw.readFileSync(jf, 'utf8');
    ok(before.every((l) => after.includes(l)) && after.includes('chats/claude-b.json') && after.includes('chats/claude-c.json'), 'journal: once it reads, every line is there: the earlier ones and the ones written while it was held', after.split('\n').length);
  }

  // 3. the cloud's format note held
  {
    const w = T.world('er104-format');
    const pc = T.computer(w, 'PC', { platform: 'win32' }); const mac = T.computer(w, 'Mac', { platform: 'darwin' });
    ok(await T.converge(w) > 0, 'format: first sync', T.why(w));
    const ff = path.join(pc.cloudRoot, 'Hearth', '.sync', 'format.json');
    raw.mkdirSync(path.dirname(ff), { recursive: true }); raw.writeFileSync(ff, JSON.stringify({ min: 1 }));
    pc.write('chats/claude-f.json', T.chat('claude-f', [{ role: 'user', text: 'while held' }]));
    Sim.T.hook = (op, p) => (op === 'open' && path.resolve(p) === path.resolve(ff) ? 'EPERM' : null);
    const r = await step(pc);
    Sim.T.hook = null;
    ok(r.state === 'offline' && r.error === 'held', 'format: a format note that can\'t be read: the pass waits (as for its own records)', { state: r.state, error: r.error });
    ok(!raw.existsSync(path.join(pc.cloudRoot, 'Hearth', 'files', 'chats', 'claude-f.json')), 'format: nothing went up meanwhile');
    ok(await T.converge(w) > 0 && mac.has('chats/claude-f.json'), 'format: once it reads, sync goes on', T.why(w));
  }

  // 4. sync's write guard can't read the file a window saves over
  {
    const w = T.world('er104-guard');
    const pc = T.computer(w, 'PC', { platform: 'win32' }); const mac = T.computer(w, 'Mac', { platform: 'darwin' });
    const rel = 'kv/notes-er.json';
    mac.write(rel, { a: 1 });
    ok(await T.converge(w) > 0, 'guard: first sync', T.why(w));
    mac.edit(rel, (v) => { v.b = 2; });
    ok(await T.converge(w) > 0 && pc.json(rel)?.b === 2, 'guard: the Mac\'s change arrived on the PC', pc.json(rel));
    const file = pc.p(rel); const real = fs.readFileSync;
    fs.readFileSync = function (p, ...a) { if (path.resolve(String(p)) === path.resolve(file)) throw busy('EBUSY'); return real.call(this, p, ...a); };
    let r; let err = null;
    try { r = pc.e.guardWrite(file, { a: 1, c: 3 }); } catch (e) { err = e; } finally { fs.readFileSync = real; }
    ok(err?.code === 'EHELD', 'guard: the window\'s older copy is not handed back unmerged while the file can\'t be read (the save waits: EHELD)', { err: err?.message, r });
    fs.readFileSync = function (p, ...a) { if (path.resolve(String(p)) === path.resolve(file)) throw Object.assign(new Error('gone'), { code: 'ENOENT' }); return real.call(this, p, ...a); };
    try { r = pc.e.guardWrite(file, { a: 1, c: 3 }); err = null; } catch (e) { err = e; } finally { fs.readFileSync = real; }
    ok(!err && r?.c === 3, 'guard: a file that is gone (ENOENT) is saved as given, as before', { err: err?.message, r });
    const m = pc.e.guardWrite(file, { a: 1, c: 3 });
    ok(m?.b === 2 && m?.c === 3, 'guard: once it reads, the save is merged with what arrived', m);
  }
  rmTemp(path.dirname(T.world('er104-end').dir)); // sync72-test's own temp folder (hearth-sync72-…)
}

// ---------------------------------------------------------------- the store thread's merge (storework.js syncMerge)
async function storeThreadMerge() {
  const { Worker } = require('worker_threads');
  const S = require('../sync-merge');
  const dir = path.join(TMP, 'sw'); fs.mkdirSync(dir, { recursive: true });
  const local = path.join(dir, 'local.json'); const cloud = path.join(dir, 'cloud.json'); const base = path.join(dir, 'base.json');
  const ours = { clicks: { lab: 7 } }; const theirs = { clicks: { lab: 6 } };
  fs.writeFileSync(local, JSON.stringify(ours)); fs.writeFileSync(cloud, JSON.stringify(theirs));
  fs.mkdirSync(base); // a base that can't be read (EISDIR: as a held file)
  const h = (v) => require('crypto').createHash('sha1').update(JSON.stringify(v)).digest('hex');
  const ctx = { home: os.homedir(), dataDir: dir, platform: process.platform, machines: [] };
  const lh = h(S.toCloud(ours, ctx)); const ch = h(theirs);
  const wk = new Worker(path.join(ROOT, 'storework.js'));
  const r = await new Promise((res, rej) => { wk.once('message', (m) => (m.err ? rej(new Error(m.err)) : res(m.res))); wk.postMessage({ op: 'syncMerge', id: 1, rel: 'kv/ui-usage.json', localFile: local, cloudFile: cloud, baseFile: base, ctx, lh, ch, counters: true, keepAll: false }); });
  await wk.terminate();
  ok(r?.stale === true, 'store thread: a merge whose base can\'t be read waits (stale), never merged as if there were none', r && { stale: r.stale, text: r.text });
}

// ---------------------------------------------------------------- the store: a save sync's guard can't check yet
function storeHeld() {
  const dir = path.join(TMP, 'store');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['store.js', 'storework.js', 'fswalk.js', 'sync-merge.js', 'sync-hard.js', 'kvops.js', 'scenesafe-core.js', 'datasafe-core.js', 'datasafemain.js', 'recall-core.js', 'configsafe-core.js', 'crashsafe-core.js', 'bigchat-core.js', 'chatcalc-core.js', 'chatwin-core.js', 'versions-core.js', 'syncpack-core.js', 'keptaside-core.js', 'asidework.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
  fs.mkdirSync(path.join(dir, 'data', 'kv'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'kv', 'er.json'), JSON.stringify({ a: 1, b: 2 }));
  fs.writeFileSync(path.join(dir, 't.js'), `
const st = require('./store'); const fs = require('fs'); const path = require('path');
const file = path.join(__dirname, 'data', 'kv', 'er.json');
let n = 0;
st.setBeforeWrite((f, v) => { n += 1; if (n === 1) { const e = new Error("er can't be read just now"); e.code = 'EHELD'; throw e; } const disk = JSON.parse(fs.readFileSync(f, 'utf8')); return { ...disk, ...v }; }, () => true);
const r = st.setKV('er', { a: 1, c: 3 });
const now = JSON.parse(fs.readFileSync(file, 'utf8'));
Promise.resolve(r).then((rr) => {
  setTimeout(() => { const later = JSON.parse(fs.readFileSync(file, 'utf8')); console.log(JSON.stringify({ r: rr || null, now, later, n })); process.exit(0); }, 2500);
});`);
  const run = spawnSync(process.execPath, [path.join(dir, 't.js')], { cwd: dir, env: { ...process.env, HEARTH_TEST_SAVE_DIR: path.join(dir, 'saves'), HEARTH_STORE_THREAD: '' }, encoding: 'utf8', timeout: 30000 });
  let out = null; try { out = JSON.parse(String(run.stdout).trim().split('\n').pop()); } catch { out = null; }
  ok(out && out.now.b === 2 && !('c' in out.now), 'store: a save sync\'s guard couldn\'t check is not written as given (the file keeps what it had)', out || `${run.stdout}${run.stderr}`.slice(-600));
  ok(out && out.later.b === 2 && out.later.c === 3 && out.n >= 2, 'store: it is tried again and merged once the guard can read', out);
}

// ---------------------------------------------------------------- the Lab's scenes (scenesafe-core prepareWrite)
function scenes() {
  const SS = require('../scenesafe-core');
  const dir = path.join(TMP, 'scenes', 'kv'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'three-sketches.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }]));
  const st = fs.statSync(file);
  const held = new Proxy(fs, { get(t, k) { if (k === 'readFileSync') return (p, ...a) => { if (path.resolve(String(p)) === path.resolve(file)) throw busy('EPERM'); return t.readFileSync(p, ...a); }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const env = { fs: held, path, cache: new Map([[file, { size: st.size, mtimeMs: st.mtimeMs, ids: ['a', 'b'] }]]), now: () => Date.now() };
  let r = null; let err = null;
  try { r = SS.prepareWrite(env, { file, value: [{ id: 'a', code: 'A2' }], sent: ['a'] }); } catch (e) { err = e; }
  ok(err && !r, 'scenes: a save that leaves a scene out while the file can\'t be read is refused (the guard was skipped and scene "b" lost)', { err: err?.message, value: r?.value });
  // the .prev copy can't be read: it is not replaced this time (it may hold scenes the file doesn't)
  const prev = path.join(dir, 'three-sketches.prev.json'); fs.writeFileSync(prev, JSON.stringify([{ id: 'a' }, { id: 'old' }]));
  const pheld = new Proxy(fs, { get(t, k) { if (k === 'readFileSync') return (p, ...a) => { if (path.resolve(String(p)) === path.resolve(prev)) throw busy('EBUSY'); return t.readFileSync(p, ...a); }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const r2 = SS.prepareWrite({ fs: pheld, path, cache: new Map(), now: () => Date.now() }, { file, value: [{ id: 'a' }, { id: 'b' }], sent: ['a', 'b'] });
  ok(r2.keepPrev === false, 'scenes: a .prev copy that can\'t be read is not replaced by this save (it may hold scenes the file doesn\'t)', { keepPrev: r2.keepPrev });
}

// ---------------------------------------------------------------- configsafe's state note
function configsafe() {
  const CS = require('../configsafe-core');
  const dir = path.join(TMP, 'cs'); fs.mkdirSync(dir, { recursive: true });
  const p = { state: path.join(dir, 'state.json') };
  fs.writeFileSync(p.state, JSON.stringify({ handedBack: 123, theme: 456 }));
  const held = new Proxy(fs, { get(t, k) { if (k === 'readFileSync') return (f, ...a) => { if (path.resolve(String(f)) === path.resolve(p.state)) throw busy('EBUSY'); return t.readFileSync(f, ...a); }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const w = CS.patchState ? CS.patchState(p, { tookBack: 789 }, held) : (CS.writeState(p, { ...(CS.readState(p, held) || {}), tookBack: 789 }, held), true);
  const now = JSON.parse(fs.readFileSync(p.state, 'utf8'));
  ok(now.handedBack === 123 && now.theme === 456 && w === false, 'settings: a state note that can\'t be read is not rewritten with only the new mark', { now, w });
  ok(CS.patchState && CS.patchState(p, { tookBack: 789 }) === true && JSON.parse(fs.readFileSync(p.state, 'utf8')).handedBack === 123, 'settings: once it reads, the mark is added and the rest kept');
}

// ---------------------------------------------------------------- the scan
function scan() {
  const S = require('./datasafe-scan.js');
  const f = (src) => S.emptyReads(src, 'x.js');
  ok(f('async function localJsonText(rel, value) { let cur = {}; try { cur = S.parseJson(await fsp.readFile(F, \'utf8\')); } catch { /* none */ } return JSON.stringify(apply(cur, value)); }\nasync function pull() { const ok = await casWrite(L.file, L, await localJsonText(rel, v), \'pull\'); }').length === 1, 'scan: round 103\'s shape (async read, the default set before the try, an empty catch, the result written by the caller) is flagged');
  ok(f('async function localJsonText(rel, value) { let cur = {}; try { cur = S.parseJson(await fsp.readFile(F, \'utf8\')); } catch (err) { if (err?.code !== \'ENOENT\') throw err; } return JSON.stringify(apply(cur, value)); }\nasync function pull() { const ok = await casWrite(L.file, L, await localJsonText(rel, v), \'pull\'); }').length === 0, 'scan: …and its fix (only ENOENT is "none") is not');
  ok(f('function save(x) { let lines = []; try { lines = fs.readFileSync(f, \'utf8\').split(\'\\n\'); } catch { lines = []; } lines.push(x); fs.writeFileSync(f, lines.join(\'\\n\')); }').length === 1, 'scan: read-modify-write with "[]" on any error is flagged');
  ok(f('async function carry() { const t = await fsp.readFile(b, \'utf8\').catch(() => undefined); await atomicWrite(to, t); }').length === 1, 'scan: read(…).catch(() => default) then a write is flagged');
  ok(f('function show() { try { return JSON.parse(fs.readFileSync(f, \'utf8\')); } catch { return null; } }').length === 0, 'scan: a read only shown (no write) is not flagged');
  ok(f('function save(x) { let v; try { v = JSON.parse(fs.readFileSync(f, \'utf8\')); } catch { return { ok: false, held: true }; } fs.writeFileSync(f, x); }').length === 0, 'scan: a read that refuses on failure is not flagged');
  // round 102's sync-engine.js (git history): its localJsonText is found
  let old = null;
  try { old = execFileSync('git', ['show', 'd264c23:sync-engine.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { old = null; }
  if (old) ok(S.emptyReads(old, 'sync-engine.js').some((x) => x.fn === 'localJsonText'), 'scan: round 102\'s sync-engine.js (git d264c23) is flagged at localJsonText');
  else console.log('  (no git history here: round 102\'s file not checked)');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'datasafe-scan.js')], { encoding: 'utf8' });
  ok(r.status === 0, 'scan: the app as it is now passes (every finding fixed or audited)', r.stdout.slice(-800));
}

async function main() {
  const t0 = Date.now();
  for (const [name, fn] of [['scan', scan], ['scenes', scenes], ['configsafe', configsafe], ['store thread', storeThreadMerge], ['store', storeHeld], ['sync', syncCases]]) {
    try { await fn(); } catch (err) { ok(false, `${name} threw`, err.stack); }
  }
  if (!process.argv.includes('--keep')) rmTemp(TMP);
  console.log(`\nemptyread104: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
