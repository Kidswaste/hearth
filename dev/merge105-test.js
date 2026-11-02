#!/usr/bin/env node
// (round 105, merge105) A rename never loses a store's merge base. When a store was renamed (or moved) on one computer
// and its base file couldn't be read right then (held a moment on Windows), the new name got no base text, so the
// store's next merge was two-way: a counter store added both computers' whole counts (5 → 7 and 6 gave 13, not 8) and
// a thing removed on one computer came back (docs/upgrades/emptyread104.md, renameThere / renameHere "safe"). Now the
// base moves with the file: from the old base file, or from the renamed file itself when it is that very version. A
// base that truly can't be had leaves a counter at the larger count, never the sum. With the two-computer simulator
// (dev/sync-sim.js), on the main side and on the store thread; the rename case fails on round 104's code.
//   rename     · the PC renames a counter store while its base is held: the base comes along (counts 8, "gone" stays gone)
//   follow     · the Mac follows the rename while ITS base is held: the Mac's base comes along too
//   gone       · a base known by hash whose text is gone: the merge keeps the larger count (7), never 13
//   mixed      · this release on the PC, the previous release (git) on the Mac: the rename and the counts as above
//   node dev/merge105-test.js [--keep]
// Never touches real data: temp folders only (sync72-test's own, under the system's temp folder).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) { passes += 1; console.log(`✓ ${what}`); } else { failures += 1; console.log(`✖ ${what}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`); } };
function rmTemp(d) { // only a test's own temp folder: directly under the system's temp folder, named by a test
  const r = path.resolve(d);
  if (path.dirname(r) !== path.resolve(os.tmpdir()) || !/^hearth-sync72-/.test(path.basename(r))) { console.log(`  (not removed: ${r})`); return; }
  fs.rmSync(r, { recursive: true, force: true });
}

const T = require('./sync72-test');
const Sim = require('./sync-sim');
const raw = Sim.raw;
const baseOf = (m, rel) => path.join(m.data, 'sync', 'base', ...rel.split('/'));
const step = async (m) => { m.w.clock.advance(3000); m.view.tick(); m.last = await T.pass(m); m.view.tick(); return m.last; };
const FROM = 'stats/tally.json'; const TO = 'usage.json'; // a counter store (sync-merge.js COUNTER_RELS) reached by a rename

// both computers have the store at 5 with a "gone" entry, then the PC renames it; held: the base files held meanwhile
async function renamed(name, o = {}) {
  const w = T.world(name);
  const pc = T.computer(w, 'PC', { platform: 'win32', thread: o.thread });
  const mac = (o.macT || T).computer(w, 'Mac', { platform: 'darwin', thread: o.macT ? false : o.thread });
  pc.write(FROM, { clicks: { lab: 5 }, gone: { x: 1 } });
  const c1 = await T.converge(w);
  raw.mkdirSync(path.dirname(pc.p(TO)), { recursive: true });
  raw.renameSync(pc.p(FROM), pc.p(TO));
  const held = new Set((o.hold || []).map((m) => path.resolve(baseOf(m === 'pc' ? pc : mac, FROM))));
  Sim.T.hook = held.size ? (op, p) => (op === 'open' && held.has(path.resolve(p)) ? 'EBUSY' : null) : null;
  let c2; const x0 = { pcRenamed: 0, macRenamed: 0 };
  try {
    // the Mac offline while the PC moves it, so the Mac then sees the old name gone and the new one at once (a rename
    // it follows: renameHere), not a delete in one pass and a new file in a later one
    mac.view.online = false;
    for (let i = 0; i < 4; i++) { await step(pc); pc.view.tick(); x0.pcRenamed += pc.last?.last?.renamed || 0; }
    mac.view.online = true;
    for (let i = 0; i < 40 && !(mac.view.idle() && pc.view.idle()); i++) { w.clock.advance(2000); pc.view.tick(); mac.view.tick(); }
    await step(mac); x0.macRenamed = mac.last?.last?.renamed || 0;
    c2 = await T.converge(w);
  } finally { Sim.T.hook = null; }
  return { w, pc, mac, c1, c2, macRenamed: x0.macRenamed, pcRenamed: x0.pcRenamed };
}
// then the Mac adds 1 and removes "gone", the PC adds 2
async function countsAfter(x, beforeMerge) {
  const { w, pc, mac } = x;
  mac.edit(TO, (v) => { v.clicks.lab = 6; delete v.gone; }); await step(mac);
  pc.edit(TO, (v) => { v.clicks.lab = 7; });
  if (beforeMerge) beforeMerge();
  const c = await T.converge(w);
  return { c, pc: pc.json(TO), mac: mac.json(TO) };
}

async function renameCases(thread) {
  const tag = thread ? ' (store thread)' : '';
  // rename: the PC renames while its base is held
  {
    const x = await renamed(`m105-rename${thread ? '-t' : ''}`, { thread, hold: ['pc'] });
    ok(x.c1 > 0 && x.c2 > 0 && x.pcRenamed === 1 && x.mac.has(TO) && !x.mac.has(FROM), `rename${tag}: the PC moves the store (a rename, not a new upload) while its base is held; the Mac follows`, { ...T.why(x.w), pc: x.pcRenamed });
    ok(raw.existsSync(baseOf(x.pc, TO)) && raw.readFileSync(baseOf(x.pc, TO), 'utf8') === JSON.stringify({ clicks: { lab: 5 }, gone: { x: 1 } }), `rename${tag}: the PC's base moved to the new name (it was lost: no base text)`, raw.existsSync(baseOf(x.pc, TO)));
    ok(!raw.existsSync(baseOf(x.pc, FROM)), `rename${tag}: the old name's base is dropped`);
    const r = await countsAfter(x);
    ok(r.c > 0 && r.pc?.clicks?.lab === 8 && r.mac?.clicks?.lab === 8, `rename${tag}: each side's additions counted once (5 + 1 + 2 = 8, was 13)`, r);
    ok(r.pc && !r.pc.gone && r.mac && !r.mac.gone, `rename${tag}: "gone", removed on the Mac, stays removed (it came back)`, r);
  }
  // follow: the Mac follows the rename while the Mac's base is held
  {
    const x = await renamed(`m105-follow${thread ? '-t' : ''}`, { thread, hold: ['mac'] });
    ok(x.c2 > 0 && x.macRenamed === 1, `follow${tag}: the Mac follows it as a rename (renameHere) while its base is held`, { ...T.why(x.w), mac: x.macRenamed });
    ok(raw.existsSync(baseOf(x.mac, TO)) && raw.readFileSync(baseOf(x.mac, TO), 'utf8') === JSON.stringify({ clicks: { lab: 5 }, gone: { x: 1 } }) && !raw.existsSync(baseOf(x.mac, FROM)), `follow${tag}: the Mac's base moved with the rename it followed`);
    const r = await countsAfter(x);
    ok(r.c > 0 && r.pc?.clicks?.lab === 8 && r.mac?.clicks?.lab === 8 && !r.pc.gone, `follow${tag}: 8 on both, "gone" stays removed`, r);
  }
  // gone: the base known (by hash) but its text truly gone: the larger count, never the sum
  {
    const x = await renamed(`m105-gone${thread ? '-t' : ''}`, { thread });
    const r = await countsAfter(x, () => { raw.rmSync(baseOf(x.pc, TO), { force: true }); raw.rmSync(baseOf(x.mac, TO), { force: true }); });
    ok(r.c > 0 && r.pc?.clicks?.lab === 7 && r.mac?.clicks?.lab === 7, `gone${tag}: with no base text, a counter keeps the larger count (7), never both added (13)`, r);
    ok(r.pc?.gone?.x === 1, `gone${tag}: and nothing is removed without a base (two-way keeps everything, as before)`, r.pc);
  }
}

// mixed: the previous release (sync-engine.js before this round, from git) on the Mac
async function mixed() {
  let prev = null;
  try {
    const first = execFileSync('git', ['log', '--format=%H', '--grep=merge105', '--', 'sync-engine.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean).pop();
    prev = execFileSync('git', ['show', `${first || 'HEAD'}${first ? '^' : ''}:sync-engine.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { prev = null; }
  if (!prev || prev.includes('merge105')) { console.log('  (no git history here: the mixed-version case not run)'); return; }
  const file = path.join(ROOT, '.merge105-prev-sync-engine.js'); // beside sync-engine.js (its requires are relative); removed below
  fs.writeFileSync(file, prev);
  const key = require.resolve('../sync-engine'); const tkey = require.resolve('./sync72-test');
  const real = require.cache[key].exports; const realT = require.cache[tkey];
  let Tp;
  try {
    require.cache[key].exports = require(file); delete require.cache[tkey];
    Tp = require('./sync72-test'); // its createEngine: the previous release's
  } finally { require.cache[key].exports = real; require.cache[tkey] = realT; fs.rmSync(file, { force: true }); delete require.cache[file]; }
  try {
    const x = await renamed('m105-mixed', { macT: Tp, hold: ['pc'] });
    ok(x.c2 > 0 && x.mac.has(TO) && raw.existsSync(baseOf(x.pc, TO)), 'mixed: this release renames with its base held, the previous release follows', T.why(x.w));
    const r = await countsAfter(x);
    ok(r.c > 0 && r.pc?.clicks?.lab === 8 && r.mac?.clicks?.lab === 8 && !r.pc.gone && !r.mac.gone, 'mixed: 8 on both, "gone" stays removed', r);
  } finally { rmTemp(path.dirname(Tp.world('m105-end').dir)); }
}

async function main() {
  const t0 = Date.now();
  for (const [name, fn] of [['main side', () => renameCases(false)], ['store thread', () => renameCases(true)], ['mixed', mixed]]) {
    try { await fn(); } catch (err) { ok(false, `${name} threw`, err.stack); }
  }
  if (!process.argv.includes('--keep')) rmTemp(path.dirname(T.world('m105-end').dir));
  console.log(`\nmerge105: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
