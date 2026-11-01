#!/usr/bin/env node
// (round 103, syncstall103) What holds the event loop when sync runs over very many small files: synchard74's `many`
// (the two-computer simulator, dev/sync-sim.js, the engine on this thread), each phase under dev/loadwait.js
// stallWatch (each hold split into the code's own work and its wait for a CPU) and a CPU profile (the inspector's, the
// same samples --cpu-prof writes). Every hold of `--keep` ms or more is laid over the profile's samples inside it, and
// each sample is put on
//   engine   the deepest frame that is sync's own code (sync-*.js, storeack…, the app's files)
//   sim      a frame of dev/sync-sim.js (the simulator's fs wrappers, its case-insensitive disk) is on the stack
//            ABOVE that app frame: the hold is the simulator's, the app has none of it
//   gc / native / other
// so a hold is told apart: the engine's (named by function and line) or the simulator's under it. Also laid over each
// hold: every sync fs call of 5 ms or more inside it (--sync-ms; a sync call on a busy disk sleeps where the profiler's
// sampler can't see it), the garbage collector's pauses, and --marks: globalThis.__mk(label) calls of a temporary
// instrumentation of the engine (which statement came just before the hold).
//   node dev/syncstall103.js [--many 50000] [--keep 60] [--phases first,steady,join,rename | none] [--prof out.json]
//                            [--sync-ms 5] [--marks] [--only-first]
// Never touches real data: a temp folder (TMPDIR), removed at the end.
'use strict';
const path = require('path');
const fs = require('fs');
const inspector = require('inspector');
// every sync fs call of the process timed (wrapped BEFORE the simulator keeps its originals): a sync call on a busy disk
// sleeps uninterruptibly, where a CPU profile's sampler can't see it; each slow one is kept with its caller
Error.stackTraceLimit = 40;
const SYNC_MS = Number((() => { const i = process.argv.indexOf('--sync-ms'); return i >= 0 ? process.argv[i + 1] : 5; })());
const slowSync = [];
const nowMs = () => Number(process.hrtime.bigint()) / 1e6;
for (const k of Object.keys(fs)) {
  if (!/Sync$/.test(k) || typeof fs[k] !== 'function') continue;
  const f = fs[k];
  fs[k] = function timed(...a) {
    const t0 = nowMs();
    try { return f.apply(this, a); } finally {
      const ms = nowMs() - t0;
      if (ms >= SYNC_MS) slowSync.push({ k, ms, at: t0, stack: new Error().stack.split('\n').slice(2, 14).map((l) => l.trim().replace(/^at /, '')) });
    }
  };
}
// --marks: globalThis.__mk(label) calls (a temporary instrumentation of the engine) kept with their time, each hold then
// says which marks were just before / inside it
const MARKS = []; if (process.argv.includes('--marks')) globalThis.__mk = (l) => MARKS.push([l, Number(process.hrtime.bigint()) / 1e6]);
// the garbage collector's pauses (perf_hooks 'gc' entries, on the same clock), laid over each hold
const GCS = []; { const { PerformanceObserver, performance } = require('perf_hooks'); const o0 = performance.timeOrigin; const h0 = Number(process.hrtime.bigint()) / 1e6 - performance.now(); new PerformanceObserver((l) => { for (const e of l.getEntries()) GCS.push({ at: h0 + e.startTime, ms: e.duration, kind: e.detail?.kind ?? e.kind }); }).observe({ entryTypes: ['gc'] }); void o0; }
const T = require('./sync72-test');
const Sim = require('./sync-sim');
const LW = require('./loadwait');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const N = Number(arg('--many', 50000));
const KEEP = Number(arg('--keep', 60));
const PHASES = arg('--phases', 'first,steady,join,rename').split(',');
const PROF = arg('--prof', '');
const raw = Sim.raw;

const ses = new inspector.Session(); ses.connect();
const post = (m, p) => new Promise((res, rej) => ses.post(m, p || {}, (e, r) => (e ? rej(e) : res(r))));

const ROOT = path.resolve(__dirname, '..');
const kindOf = (url) => {
  if (!url) return 'native';
  const f = url.replace(/^file:\/\//, '');
  if (f.includes('/dev/sync-sim.js')) return 'sim';
  if (f.startsWith(ROOT) && !f.includes('/dev/') && !f.includes('/node_modules/')) return 'app';
  if (f.includes('/dev/')) return 'test';
  return 'node';
};
function analyse(prof, holds) {
  const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
  const parent = new Map(); for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const stackOf = (id) => { const s = []; for (let x = id; x != null; x = parent.get(x)) s.push(nodes.get(x)); return s; }; // leaf first
  const label = (n) => `${n.callFrame.functionName || '(anon)'} ${path.basename(n.callFrame.url || '')}:${n.callFrame.lineNumber + 1}`;
  const ts = []; let t = prof.startTime; for (let i = 0; i < prof.samples.length; i++) { t += prof.timeDeltas[i] || 0; ts.push(t / 1000); }
  return holds.map((h) => {
    const by = { engine: 0, sim: 0, gc: 0, idle: 0, other: 0 }; const fn = new Map(); const leaf = new Map(); let n = 0;
    for (let i = 0; i < ts.length; i++) {
      if (ts[i] < h.from || ts[i] > h.to) continue;
      n += 1; const st = stackOf(prof.samples[i]); const top = st[0]; const nm = top.callFrame.functionName;
      if (nm === '(idle)' || nm === '(program)') { by.idle += 1; continue; }
      if (nm === '(garbage collector)') { by.gc += 1; continue; }
      const ai = st.findIndex((x) => kindOf(x.callFrame.url) === 'app');
      const si = st.findIndex((x) => kindOf(x.callFrame.url) === 'sim');
      if (si >= 0 && (ai < 0 || si < ai)) { by.sim += 1; const k = `sim: ${label(st[si])} ← ${ai >= 0 ? label(st[ai]) : '?'}`; fn.set(k, (fn.get(k) || 0) + 1); continue; }
      if (ai >= 0) { by.engine += 1; const k = label(st[ai]); fn.set(k, (fn.get(k) || 0) + 1); const lk = `${label(top)} ← ${k}`; leaf.set(lk, (leaf.get(lk) || 0) + 1); continue; }
      by.other += 1; const k = `other: ${label(top)}`; fn.set(k, (fn.get(k) || 0) + 1);
    }
    // the lines of the hottest app functions inside the hold (positionTicks: a node's samples by line)
    const lines = new Map();
    for (let i = 0; i < ts.length; i++) {
      if (ts[i] < h.from || ts[i] > h.to) continue;
      const nd = nodes.get(prof.samples[i]); if (kindOf(nd.callFrame.url) !== 'app') continue;
      for (const pt of nd.positionTicks || []) { const k = `${nd.callFrame.functionName || '(anon)'} ${path.basename(nd.callFrame.url)}:${pt.line}`; lines.set(k, (lines.get(k) || 0) + pt.ticks); }
    }
    const topk = (m, k = 5) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([f, c]) => `${f} ×${c}`);
    return { ...h, samples: n, by, top: topk(fn), leaf: topk(leaf, 4), lines: topk(lines, 4) };
  });
}

async function main() {
  const w = T.world('h-stall103');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  let t = Date.now(); const dirs = new Set();
  for (let i = 0; i < N; i++) { const d = path.join(pc.data, 'workspace', `proj${i % 50}`, `d${Math.floor(i / 1000)}`); if (!dirs.has(d)) { raw.mkdirSync(d, { recursive: true }); dirs.add(d); } raw.writeFileSync(path.join(d, `f${i}.txt`), `small file ${i}\n`); }
  console.log(`made ${N} files in ${Date.now() - t} ms`);
  await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 500 });
  const out = [];
  const phase = async (name, fn) => {
    const prof = PHASES.includes(name);
    if (prof) await post('Profiler.start');
    slowSync.length = 0; MARKS.length = 0; GCS.length = 0;
    const sw = LW.stallWatch({ keep: KEEP }); const t0 = Date.now(); const r = await fn(); const s = sw.stop(); const ms = Date.now() - t0;
    let rep = s.kept;
    if (prof) { const { profile } = await post('Profiler.stop'); rep = analyse(profile, s.kept); if (PROF) fs.writeFileSync(PROF.replace(/(\.json)?$/, `-${name}.cpuprofile`), JSON.stringify(profile)); }
    out.push({ name, ms, maxMs: s.maxMs, maxOwn: s.maxOwn, cpu: s.worst?.cpu });
    console.log(`\n== ${name}: ${ms} ms · longest hold ${s.maxMs} ms · most own ${s.maxOwn} ms (${s.worst ? `${s.worst.ms} = ${s.worst.own} own (${s.worst.cpu} on a CPU) + ${s.worst.wait} wait` : '-'}) · ${s.kept.length} holds ≥ ${KEEP} ms · the watcher's own reads ≤ ${s.watchMax} ms (not counted)`);
    for (const h of rep.sort((a, b) => b.own - a.own).slice(0, 8)) {
      console.log(`  ${h.ms} ms = ${h.own} own (${h.cpu} cpu) + ${h.wait} wait${h.by ? ` · samples ${h.samples}: engine ${h.by.engine} sim ${h.by.sim} gc ${h.by.gc} idle ${h.by.idle} other ${h.by.other}` : ''}`);
      for (const x of h.top || []) console.log(`      ${x}`);
      for (const x of h.leaf || []) console.log(`        leaf ${x}`);
      for (const x of h.lines || []) console.log(`        line ${x} (whole-phase ticks of that node)`);
      if (MARKS.length) { const before = MARKS.filter(([, t]) => t < h.from).slice(-1); const inside = MARKS.filter(([, t]) => t >= h.from && t <= h.to); console.log(`      marks: before ${before.map(([l, t]) => `${l} (${(h.from - t).toFixed(0)} ms earlier)`).join('')} · inside ${inside.map(([l, t]) => `${l} @${(t - h.from).toFixed(0)}`).join(' ')}`); }
      { const gi = GCS.filter((g) => g.at + g.ms >= h.from && g.at <= h.to); if (gi.length) console.log(`      gc inside: ${gi.map((g) => `${g.ms.toFixed(0)} ms (kind ${g.kind})`).join(', ')}`); }
      // the sync fs calls inside this hold: whose (the first app frame), and whether the simulator made it
      const inside = slowSync.filter((c) => c.at >= h.from - 1 && c.at <= h.to);
      const by = new Map();
      for (const c of inside) {
        const app = c.stack.find((l) => l.includes(ROOT) && !l.includes('/dev/')) || '?';
        const sim = c.stack.findIndex((l) => l.includes('sync-sim.js')); const ai = c.stack.indexOf(app);
        const k = `${sim >= 0 && (ai < 0 || sim < ai) ? 'sim' : 'engine'} ${c.k} ← ${app.replace(ROOT + '/', '')}`;
        const e = by.get(k) || { n: 0, ms: 0 }; e.n += 1; e.ms += c.ms; by.set(k, e);
      }
      for (const [k, e] of [...by].sort((a, b) => b[1].ms - a[1].ms).slice(0, 5)) console.log(`      sync ${k} ×${e.n} ${e.ms.toFixed(0)} ms`);
    }
    // all slow sync calls of the phase, by caller
    { const by = new Map(); for (const c of slowSync) { const app = c.stack.find((l) => l.includes(ROOT) && !l.includes('/dev/')) || c.stack.find((l) => !l.includes('syncstall103')) || '?'; const simI = c.stack.findIndex((l) => l.includes('sync-sim.js')); const ai = c.stack.indexOf(app); const k = `${simI >= 0 && (ai < 0 || simI < ai) ? 'sim' : 'engine'} ${c.k} ← ${app.replace(ROOT + '/', '')}`; const e = by.get(k) || { n: 0, ms: 0, max: 0 }; e.n += 1; e.ms += c.ms; e.max = Math.max(e.max, c.ms); by.set(k, e); }
      console.log(`  slow sync calls (≥ ${SYNC_MS} ms) this phase: ${slowSync.length}`);
      for (const [k, e] of [...by].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10)) console.log(`    ${k} ×${e.n} total ${e.ms.toFixed(0)} ms max ${e.max.toFixed(0)} ms`); }
    return r;
  };
  const r1 = await phase('first', () => pc.e.pass());
  console.log(`  pushed ${r1.last.pushed} pending ${r1.pending}`);
  if (argv.includes('--only-first')) { fs.rmSync(path.dirname(w.dir), { recursive: true, force: true }); process.exit(0); }
  await phase('steady', () => pc.e.pass());
  pc.view.tick(); mac.view.tick(); w.clock.advance(3000);
  const r3 = await phase('join', () => mac.e.pass());
  console.log(`  pulled ${r3.last.pulled}`);
  for (let k = 0; k < 5; k++) raw.renameSync(path.join(pc.data, 'workspace', `proj${k}`), path.join(pc.data, 'workspace', `proj${k}-renamed`));
  const r4 = await phase('rename', () => pc.e.pass());
  console.log(`  renamed ${r4.last.renamed} pushed ${r4.last.pushed} deletedThere ${r4.last.deletedThere}`);
  console.log(`\nsummary: ${out.map((x) => `${x.name} ${x.ms} ms, hold ${x.maxMs} / own ${x.maxOwn} (${x.cpu ?? '?'} on a CPU)`).join(' · ')}`);
  if (!argv.includes('--keep-files')) fs.rmSync(path.dirname(w.dir), { recursive: true, force: true });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
