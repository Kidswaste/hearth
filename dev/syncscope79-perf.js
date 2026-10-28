#!/usr/bin/env node
// (round 79, syncscope79) What one sync pass costs at 50,000 files: every file looked at (a "whole look", what every
// pass did before this round) vs only what the watchers heard (a scoped pass). Node only: the engine on the heavy
// profile (dev/bigprofile.js, ≈ 4,400 files) + 45,600 small files in 228 folders, with the Windows simulation of round
// 78 (HEARTH_WINSIM=1: each sync fs call 150 µs, each async open / stat / readdir / read answers 1 ms later, as through
// Defender and the cloud drive's filter) and the store thread doing the big-JSON hashing, as in the app.
// Phases (the PC; the cloud folder is a plain folder): its first pass (everything up, not compared), then for each case
// a whole pass and a scoped pass in turn, on the same change:
//   steady         nothing changed (the calm check, every 1–5 min)
//   one chat       a long chat got a message
//   arrival        a picture the other computer made lands in the cloud folder (with its journal line)
//   twenty         20 files saved in 4 folders
// For each: wall time, async fs calls (stats, folder listings, all), the event loop's longest wait.
//   HEARTH_WINSIM=1 node dev/syncscope79-perf.js [--fixture DIR] [--root DIR (another copy of Hearth: whole looks
//   only, the "before")] [--runs 3] [--json] [--keep]
'use strict';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
process.env.HEARTH_LOOPLAG = process.env.HEARTH_LOOPLAG || '1';
process.env.HEARTH_PROBE_FS = '1';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const ROOT = path.resolve(opt('--root', path.join(__dirname, '..')));
const BIG = opt('--big', path.join(os.tmpdir(), 'hearth-sync72-bigprofile'));
const FIXTURE = opt('--fixture', path.join(os.tmpdir(), 'hearth-syncscope79-50k'));
const RUNS = Number(opt('--runs', 3));
const JSON_OUT = argv.includes('--json');
const say = (...a) => { if (!JSON_OUT) console.log(...a); };

// the 50,000-file fixture (made once, kept for the next runs)
if (!fs.existsSync(path.join(FIXTURE, 'done'))) {
  say(`making the fixture in ${FIXTURE}…`);
  if (!fs.existsSync(path.join(BIG, 'chats'))) require('./bigprofile').bigprofile(BIG);
  fs.rmSync(FIXTURE, { recursive: true, force: true });
  fs.cpSync(BIG, FIXTURE, { recursive: true });
  let n = 0; const have = () => { let c = 0; const w = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) w(path.join(d, e.name)); else c += 1; } }; w(FIXTURE); return c; };
  const need = 50000 - have();
  for (let d = 0; n < need; d++) {
    const dir = path.join(FIXTURE, 'workspace', `proj${Math.floor(d / 12)}`, `part${d % 12}`);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 200 && n < need; i++, n++) fs.writeFileSync(path.join(dir, `f${i}.md`), `# note ${d}/${i}\n${'x'.repeat(40 + (i % 60))}\n`);
  }
  fs.writeFileSync(path.join(FIXTURE, 'done'), String(have()));
}
const probe = require(path.join(ROOT, 'mainlag-probe.js'));
// stats and folder listings of the process, counted (on top of the probe's own wrappers: its total counts every call)
const count = { stat: 0, readdir: 0 };
for (const k of ['stat', 'readdir']) { const f = fs.promises[k]; fs.promises[k] = function (...a) { count[k] += 1; return f.apply(this, a); }; }
const { createEngine } = require(path.join(ROOT, 'sync-engine.js'));

const RUN = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-syncscope79-perf-'));
const data = path.join(RUN, 'pc', 'data'); const cloud = path.join(RUN, 'cloud');
fs.cpSync(FIXTURE, data, { recursive: true }); fs.rmSync(path.join(data, 'done'), { force: true });
fs.mkdirSync(cloud, { recursive: true });
const app = path.join(RUN, 'pc', 'app'); fs.mkdirSync(app, { recursive: true });
fs.writeFileSync(path.join(app, 'config.json'), JSON.stringify({ agents: [{ id: 'claude', name: 'Claude' }], settings: {} })); fs.writeFileSync(path.join(app, 'theme.css'), '/* */\n');
const worker = new Worker(path.join(ROOT, 'storework.js'));
let seq = 0; const jobs = new Map();
worker.on('message', ({ id, res, err }) => { const j = jobs.get(id); if (!j) return; jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
const runOff = (op, args) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); worker.postMessage({ ...args, op, id }); });
const e = createEngine({ dataDir: data, configPath: path.join(app, 'config.json'), themePath: path.join(app, 'theme.css'), cloudRoot: cloud, machineName: 'PC', home: path.join(RUN, 'pc'), settleMs: 0, jsonSettleMs: 0, hashJson: (file, a) => runOff('syncHash', { file, ...a }), pullJson: (a) => runOff('syncPull', a), mergeJson: (a) => runOff('syncMerge', a) });
const scoped = typeof e.scope === 'function';

async function measure(label, fn) {
  await probe.take({ reset: true });
  const c0 = { ...count }; const t0 = Date.now();
  const r = await fn();
  const ms = Date.now() - t0; const p = await probe.take({ reset: true });
  const row = { label, ms, stat: count.stat - c0.stat, readdir: count.readdir - c0.readdir, fsAsync: p.fsAsync.n, loopMax: p.delay.max, look: scoped ? e.scope().mode : 'full', moved: r?.last ? Object.fromEntries(Object.entries(r.last).filter(([, v]) => v)) : null };
  say(`${label.padEnd(30)} ${String(ms).padStart(6)} ms · stat ${String(row.stat).padStart(6)} · readdir ${String(row.readdir).padStart(4)} · async fs ${String(row.fsAsync).padStart(6)} · loop max ${String(row.loopMax).padStart(5)} ms · ${row.look} ${JSON.stringify(row.moved)}`);
  return row;
}
const longChat = fs.readdirSync(path.join(data, 'chats')).find((f) => /long\d+\.json$/.test(f)) || fs.readdirSync(path.join(data, 'chats')).find((f) => f.endsWith('.json'));
const changes = {
  steady: () => ({ local: [], cloud: [] }),
  'one chat': (k) => { const f = path.join(data, 'chats', longChat); const c = JSON.parse(fs.readFileSync(f, 'utf8')); (c.messages ||= []).push({ role: 'user', at: Date.now(), text: `one more ${k}` }); fs.writeFileSync(f, JSON.stringify(c)); return { local: [`chats/${longChat}`], cloud: [] }; },
  arrival: (k) => { const rel = `attachments/from-mac-${k}.png`; const f = path.join(cloud, 'Hearth', 'files', ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); const b = Buffer.alloc(180 * 1024, k & 255); fs.writeFileSync(f, b); const old = new Date(Date.now() - 10000); fs.utimesSync(f, old, old); return { local: [], cloud: [rel] }; },
  twenty: (k) => { const l = []; for (let i = 0; i < 20; i++) { const rel = `workspace/proj${i % 4}/part${i % 3}/f${i}.md`; fs.writeFileSync(path.join(data, ...rel.split('/')), `# changed ${k}/${i}\n`); l.push(rel); } return { local: l, cloud: [] }; },
};
(async () => {
  const out = { root: ROOT, winsim: process.env.HEARTH_WINSIM === '1', files: Number(fs.readFileSync(path.join(FIXTURE, 'done'), 'utf8')), scopedEngine: scoped, phases: [] };
  say(`${out.files} files · Windows simulation ${out.winsim ? 'on' : 'off'} · ${scoped ? 'this Hearth (whole and scoped)' : `${ROOT} (whole looks only)`}`);
  out.phases.push(await measure('first pass (all up)', () => e.pass()));
  await measure('settle (whole)', () => e.pass());
  let k = 0;
  for (const [name, make] of Object.entries(changes)) {
    for (let i = 0; i < RUNS; i++) {
      make(++k); out.phases.push({ case: name, ...(await measure(`${name}: whole`, () => e.pass())) });
      if (!scoped) continue;
      const sc = make(++k); out.phases.push({ case: name, ...(await measure(`${name}: scoped`, () => e.pass({ scope: sc }))) });
    }
  }
  if (global.gc) { global.gc(); out.heapMB = Math.round(process.memoryUsage().heapUsed / 1048576); say(`heap after the passes (gc): ${out.heapMB} MB`); } // (node --expose-gc: what the engine keeps between passes)
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  out.summary = {};
  for (const name of Object.keys(changes)) for (const look of ['whole', 'scoped']) {
    const rows = out.phases.filter((p) => p.case === name && p.label.endsWith(look));
    if (rows.length) out.summary[`${name}: ${look}`] = { ms: med(rows.map((r) => r.ms)), stat: med(rows.map((r) => r.stat)), readdir: med(rows.map((r) => r.readdir)), fsAsync: med(rows.map((r) => r.fsAsync)), loopMax: med(rows.map((r) => r.loopMax)) };
  }
  if (JSON_OUT) console.log(JSON.stringify(out, null, 1));
  else { say('\nmedians:'); for (const [k2, v] of Object.entries(out.summary)) say(`  ${k2.padEnd(20)} ${String(v.ms).padStart(6)} ms · stat ${String(v.stat).padStart(6)} · readdir ${String(v.readdir).padStart(4)} · async fs ${String(v.fsAsync).padStart(6)} · loop max ${v.loopMax} ms`); }
  await worker.terminate();
  if (!argv.includes('--keep')) fs.rmSync(RUN, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
