#!/usr/bin/env node
// (round 82, perfguard82) The perf guard's calibration probe: a fixed micro-benchmark (CPU-bound integer mixing, a burst
// of short-lived objects for the GC, and layout — in Node a JSON round-trip + sort stands in for it) timed in the same
// session as the measurements, before and after each step. Its time against the same benchmark's time when the
// baseline was recorded says how much slower this box is right now ("the calibration factor"): perfguard.js scales
// its wall-time expectations by it, and refuses to judge when the box is too loaded to tell.
//   single   one thread, ms per run (median of 7)              — how fast one busy thread runs now
//   par      3 threads at once, ms per run (worker_threads)    — Hearth is 3–4 busy processes: their share of the box
//   cpuRatio the single runs' wall ÷ their CPU time (1 = never waited for a CPU; 2 = waited half of the time)
//   load     the 1-minute load average ÷ CPUs
//   node dev/perfguard-calib.js                               # one calibration, as JSON
//   node dev/perfguard-calib.js --json out.json -- cmd args…  # calibrate, run the command, calibrate again (exit = the
//       command's); used inside the run lock so the calibration sees the same minutes as the step it brackets
// The same benchmark runs in the app's window (dev/perfguard-probe.js, with real layout): BENCH_SRC.
'use strict';
const os = require('os');
const fs = require('fs');
const { Worker } = require('worker_threads');
const { spawnSync } = require('child_process');

// one run of the benchmark: `layout` is a function doing the layout part (the page's) or null (Node's stand-in)
const BENCH_SRC = `function perfguardBench(layout) {
  const now = () => performance.now();
  const t0 = now();
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < 8000000; i++) { h ^= i & 0xff; h = Math.imul(h, 16777619); h ^= h >>> 15; }
  const t1 = now();
  const keep = []; let s = 0;
  for (let i = 0; i < 200000; i++) { const o = { i, a: [i, i * 2], t: 'k' + (i & 4095) }; s += o.a.length; if ((i & 255) === 0) keep.push(o); }
  const t2 = now();
  let l = 0;
  if (layout) l = layout();
  else { const arr = []; for (let i = 0; i < 20000; i++) arr.push({ n: (i * 7919) % 10007, s: 'v' + i }); const back = JSON.parse(JSON.stringify(arr)); back.sort((a, b) => a.n - b.n); l = back[0].n; }
  const t3 = now();
  return { cpu: t1 - t0, gc: t2 - t1, layout: t3 - t2, total: t3 - t0, x: (h ^ s ^ keep.length ^ l) & 1 };
}`;
// eslint-disable-next-line no-new-func
const bench = new Function(`${BENCH_SRC}; return perfguardBench;`)();
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

async function calibrate({ reps = 7, threads = 3, parReps = 5 } = {}) {
  bench(null); // (warm the JIT)
  const runs = [];
  for (let i = 0; i < reps; i++) {
    const c0 = process.cpuUsage(); const t0 = performance.now();
    const r = bench(null);
    const wall = performance.now() - t0; const c = process.cpuUsage(c0); const cpu = (c.user + c.system) / 1000;
    runs.push({ ...r, wall, cpuMs: cpu });
  }
  // the same, on `threads` threads at once: ms per run while they share the box
  const src = `${BENCH_SRC}; const { parentPort, workerData } = require('worker_threads'); perfguardBench(null); const t0 = performance.now(); for (let i = 0; i < workerData; i++) perfguardBench(null); parentPort.postMessage(performance.now() - t0);`;
  const per = await Promise.all(Array.from({ length: threads }, () => new Promise((res) => {
    const w = new Worker(src, { eval: true, workerData: parReps });
    w.once('message', (ms) => { res(ms / parReps); w.terminate(); }); w.once('error', () => res(NaN));
  })));
  const single = median(runs.map((r) => r.total));
  return {
    at: new Date().toISOString(),
    single: r2(single), cpu: r2(median(runs.map((r) => r.cpu))), gc: r2(median(runs.map((r) => r.gc))), layout: r2(median(runs.map((r) => r.layout))),
    par: r2(Math.max(...per)),
    cpuRatio: r2(median(runs.map((r) => (r.cpuMs > 0 ? r.wall / r.cpuMs : NaN)))),
    load: r2(os.loadavg()[0] / os.cpus().length), loadavg: os.loadavg().map(r2),
  };
}

module.exports = { BENCH_SRC, calibrate, median };

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const sep = argv.indexOf('--');
    const ji = argv.indexOf('--json'); const out = ji >= 0 ? argv[ji + 1] : null;
    if (sep < 0) { const c = await calibrate(); if (out) fs.writeFileSync(out, JSON.stringify(c, null, 1)); console.log(JSON.stringify(c)); return; }
    const before = await calibrate();
    const t0 = Date.now();
    const r = spawnSync(argv[sep + 1], argv.slice(sep + 2), { stdio: 'inherit' });
    const after = await calibrate();
    if (out) fs.writeFileSync(out, JSON.stringify({ before, after, secs: Math.round((Date.now() - t0) / 1000) }, null, 1));
    process.exit(r.status == null ? 1 : r.status);
  })().catch((err) => { console.error(err); process.exit(2); });
}
