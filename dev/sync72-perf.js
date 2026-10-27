#!/usr/bin/env node
// (round 72, sync72) What cloud sync costs the main process on the heavy profile (dev/bigprofile.js: 1,500 chats, 120
// long ones, 800 attachments, Sidequest, 50 Lab scenes… ≈ 5,000 files, 140 MB), on a Windows-slow disk (every fs.*Sync
// call 150 µs slower, like HEARTH_SLOWFS_US in the app checks), with the store thread doing the big-JSON hashing as in
// the app (storework.js, syncHash). No Electron, nothing real: a throwaway copy of the fixture and a temp cloud folder.
// Phases: the PC's first pass (everything goes up), its steady passes (nothing changed), one long chat changed, the Mac
// joining (everything comes down into an empty Hearth), the Mac's steady passes. For each: wall time, and the main
// process's event-loop delay (p99 / max, perf_hooks) with its longest busy stretches and what was running (CPU profile).
//   node dev/sync72-perf.js [--fixture DIR] [--slowfs 150] [--budget 50] [--json]
//   exit 1 when a phase's busiest stretch is over the budget (ms)
'use strict';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
process.env.HEARTH_LOOPLAG = process.env.HEARTH_LOOPLAG || 'prof';
process.env.HEARTH_SLOWFS_US = opt('--slowfs', process.env.HEARTH_SLOWFS_US || '150');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..');
const FIXTURE = opt('--fixture', path.join(os.tmpdir(), 'hearth-sync72-bigprofile'));
const BUDGET = Number(opt('--budget', 50));
const JSON_OUT = argv.includes('--json');

if (!fs.existsSync(path.join(FIXTURE, 'chats'))) { process.stderr.write(`making the fixture in ${FIXTURE}…\n`); require('./bigprofile').bigprofile(FIXTURE); }
const probe = require(path.join(ROOT, 'mainlag-probe.js')); // after the env: it slows fs.*Sync and profiles the thread
const { createEngine } = require(path.join(ROOT, 'sync-engine.js'));

const RUN = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-sync72-perf-'));
const pcData = path.join(RUN, 'pc', 'data'); const macData = path.join(RUN, 'mac', 'data'); const cloud = path.join(RUN, 'cloud');
fs.cpSync(FIXTURE, pcData, { recursive: true });
fs.mkdirSync(macData, { recursive: true }); fs.mkdirSync(cloud, { recursive: true });
for (const d of [path.join(RUN, 'pc', 'app'), path.join(RUN, 'mac', 'app')]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify({ agents: [{ id: 'claude', name: 'Claude' }], settings: {} })); fs.writeFileSync(path.join(d, 'theme.css'), '/* */\n'); }

// the store thread, as in the app (store.js runOff → storework.js)
const worker = new Worker(path.join(ROOT, 'storework.js'));
let seq = 0; const jobs = new Map();
worker.on('message', ({ id, res, err }) => { const j = jobs.get(id); if (!j) return; jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
const runOff = (op, args) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); worker.postMessage({ ...args, op, id }); });

const engine = (who, data) => createEngine({ dataDir: data, configPath: path.join(RUN, who, 'app', 'config.json'), themePath: path.join(RUN, who, 'app', 'theme.css'), cloudRoot: cloud, machineName: who === 'pc' ? 'PC' : 'Mac', home: path.join(RUN, who), settleMs: 0, hashJson: (file, a) => runOff('syncHash', { file, ...a }), pullJson: (a) => runOff('syncPull', a), mergeJson: (a) => runOff('syncMerge', a) });
const out = { fixture: FIXTURE, slowFsUs: Number(process.env.HEARTH_SLOWFS_US), phases: [] };
async function phase(label, fn) {
  await probe.take({ reset: true }); // starts this phase's histogram and profile
  const t0 = Date.now();
  const r = await fn();
  const ms = Date.now() - t0;
  const p = await probe.take({ reset: true, label });
  const busiest = p.blocks?.[0]?.ms || 0;
  const row = { label, ms, delayP99: p.delay.p99, delayMax: p.delay.max, busiest, fsSyncN: p.fsSync.n, fsSyncMs: p.fsSync.ms, moved: r?.last ? Object.fromEntries(Object.entries(r.last).filter(([, v]) => v)) : null, pending: r?.pending, blocks: (p.blocks || []).slice(0, 4).map((b) => ({ ms: b.ms, top: b.app?.slice(0, 3) || b.top })), fsTop: p.fsSync.top.slice(0, 5).map((x) => `${x.n}× ${Math.round(x.ms)}ms ${x.k}`) };
  out.phases.push(row);
  if (!JSON_OUT) console.log(`${label.padEnd(34)} ${String(ms).padStart(6)} ms   loop p99 ${String(row.delayP99).padStart(6)} ms  max ${String(row.delayMax).padStart(6)} ms   busiest ${String(busiest).padStart(4)} ms   fs.*Sync ${row.fsSyncN}× ${row.fsSyncMs} ms   ${JSON.stringify(row.moved)}`);
  return r;
}
(async () => {
  const pc = engine('pc', pcData);
  await phase('PC: first pass (all up)', () => pc.pass());
  for (let i = 1; i <= 3; i++) await phase(`PC: steady pass ${i}`, () => pc.pass());
  // one long chat gets a reply (what happens all day)
  const long = fs.readdirSync(path.join(pcData, 'chats')).find((f) => /long\d+\.json$/.test(f));
  const file = path.join(pcData, 'chats', long); const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  c.messages.push({ role: 'user', at: Date.now(), text: 'one more' }); fs.writeFileSync(file, JSON.stringify(c));
  await phase('PC: one long chat changed', () => pc.pass());
  const mac = engine('mac', macData);
  await phase('Mac: joins (all down)', () => mac.pass());
  for (let i = 1; i <= 2; i++) await phase(`Mac: steady pass ${i}`, () => mac.pass());
  await phase('PC: steady after the Mac joined', () => pc.pass());
  // the owner's everyday case: a Lab scene saved on the Mac (the whole 2.3 MB scenes store) arrives on the PC
  const scenes = (dir) => path.join(dir, 'kv', 'three-sketches.json');
  const editScenes = (dir, fn) => { const l = JSON.parse(fs.readFileSync(scenes(dir), 'utf8')); fn(l); fs.writeFileSync(scenes(dir), JSON.stringify(l, null, 2)); };
  editScenes(macData, (l) => { l[0].name = 'Saved on the Mac'; });
  await phase('Mac: a Lab scene saved (push)', () => mac.pass());
  await phase('PC: that scene arrives (2.3 MB store)', () => pc.pass());
  // both save the scenes at once: merged
  editScenes(macData, (l) => { l[1].name = 'Mac edit'; });
  editScenes(pcData, (l) => { l[2].name = 'PC edit'; });
  await phase('Mac: saves again (push)', () => mac.pass());
  await phase('PC: both changed the scenes (merge)', () => pc.pass());
  await phase('Mac: the merged scenes arrive', () => mac.pass());
  const worst = Math.max(...out.phases.map((p) => p.busiest));
  out.worst = worst; out.budget = BUDGET; out.pass = worst <= BUDGET;
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else {
    for (const p of out.phases) if (p.blocks.length && p.blocks[0].ms > BUDGET / 2) console.log(`  ${p.label}: ${p.blocks.map((b) => `${b.ms}ms [${b.top.join(' · ')}]`).join('  |  ')}`);
    if (argv.includes('--fs')) for (const p of out.phases) if (p.fsSyncN > 100) console.log(`  ${p.label} fs.*Sync: ${p.fsTop.join('  |  ')}`);
    console.log(`\nworst main-process busy stretch: ${worst} ms (budget ${BUDGET} ms) → ${out.pass ? 'ok' : 'OVER'}`);
  }
  await worker.terminate();
  if (!argv.includes('--keep')) fs.rmSync(RUN, { recursive: true, force: true });
  process.exit(out.pass ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
