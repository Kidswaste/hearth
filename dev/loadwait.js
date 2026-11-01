// (round 88, checkfix88) How long THIS process waited on a busy box over a stretch of time, for timing tests that
// must tell "the app was slow" from "the box was busy" (dev/perfguard.js does the same for the perf guard since round
// 82, with CPU time and a calibration). Linux only (null elsewhere: the test then judges the wall time as before):
//   cpuWait  the main thread's run delay (time it was ready to run but waited for a CPU: /proc/thread-self/schedstat)
//            + the largest run delay of one of the process's other threads (libuv's pool: fs calls, zlib…) over the
//            stretch. Not CPU the app spent: time it couldn't spend.
//   ioFull   the box's IO pressure, "full" (every runnable task stalled on IO at once: /proc/pressure/io), ms
//   cpuMs    the CPU time the process itself spent (process.cpuUsage), for the report
// A timing over its budget is the box's, not the app's, when what's over is no more than cpuWait + ioFull ("can't
// tell"); over by more, it is the app's (a long computation, a sync read on a calm disk, a timer set too long).
//   const L = require('./loadwait'); const a = L.snap(); …; const w = L.waited(a, L.snap());
//   L.judge(ms, budget, w) → 'ok' | 'load' | 'over'
'use strict';
const fs = require('fs');

const LINUX = process.platform === 'linux';
const delayOf = (file) => { try { return Number(fs.readFileSync(file, 'utf8').split(' ')[1]) / 1e6; } catch { return null; } };
const psi = (kind) => { try { const m = fs.readFileSync(`/proc/pressure/${kind}`, 'utf8').match(/^full .*total=(\d+)/m); return m ? Number(m[1]) / 1000 : null; } catch { return null; } };

function snap() {
  if (!LINUX) return null;
  const main = delayOf('/proc/thread-self/schedstat');
  if (main == null) return null;
  const threads = {};
  try { for (const tid of fs.readdirSync('/proc/self/task')) { if (Number(tid) === process.pid) continue; const d = delayOf(`/proc/self/task/${tid}/schedstat`); if (d != null) threads[tid] = d; } } catch { /* none */ }
  const c = process.cpuUsage();
  return { t: Date.now(), main, threads, ioFull: psi('io'), cpu: (c.user + c.system) / 1000 };
}

function waited(a, b) {
  if (!a || !b) return null;
  let other = 0;
  for (const [tid, d] of Object.entries(b.threads)) if (a.threads[tid] != null) other = Math.max(other, d - a.threads[tid]);
  const r = (x) => Math.round(x);
  return { wallMs: r(b.t - a.t), cpuWait: r(b.main - a.main + other), ioFull: a.ioFull != null && b.ioFull != null ? r(b.ioFull - a.ioFull) : 0, cpuMs: r(b.cpu - a.cpu) };
}

// ms over budget: the box's ('load') when the overrun is no more than what the process waited for, else the app's
function judge(ms, budget, w) {
  if (!(ms > budget)) return 'ok';
  if (!w) return 'over';
  return ms - (w.cpuWait + w.ioFull) <= budget ? 'load' : 'over';
}

// (round 102, checks102) the event loop's longest hold, load-aware, stall by stall. perf_hooks' monitorEventLoopDelay
// gives a wall time only: a stall of 120 ms on a busy box may be 30 ms of work and 90 ms waiting for a CPU. Here a
// timer ticks every `every` ms; each tick reads the main thread's own run delay (schedstat), so each gap between two
// ticks (= how long the loop was held) is split into
//   ms     the gap's wall time beyond the tick period (what monitorEventLoopDelay's max reports)
//   wait   the main thread's wait for a CPU inside it (runnable, not running: the box), + the longest such wait of
//          one of the process's other threads (as waited() counts it: the loop held on a pool thread or a GC helper
//          that was itself waiting for a CPU)
//   own    ms − wait, and never less than its own CPU time: the hold that is the code's own (script, GC, and any sync read: the disk's time is NOT taken
//          out here, unlike judge(): a sync read on the loop is the code's, however busy the disk)
//   cpu    of which the thread ran on a CPU (the rest of own: blocked, a sync read, a lock, waiting on a GC helper)
// stop() → { maxMs, maxOwn, worst (the gap with the largest own), longest (the gap with the largest ms) }.
// judgeStall(s, budget) → 'ok' | 'load' (the wall hold over, its own part not) | 'over'. Off Linux: own = ms (wall time).
// (round 103, syncstall103) keep: gaps of at least that many ms are also kept with their start / end (hrtime ms, the
// clock a CPU profile's samples use) in stop().kept, for a profile to say what held the loop
function stallWatch({ every = 5, keep = 0 } = {}) {
  const now = () => Number(process.hrtime.bigint()) / 1e6;
  const rd = () => { if (!LINUX) return [null, null]; try { const f = fs.readFileSync('/proc/thread-self/schedstat', 'utf8').split(' '); return [Number(f[0]) / 1e6, Number(f[1]) / 1e6]; } catch { return [null, null]; } };
  // the process's other threads (libuv's pool: fs calls; V8's GC helpers): the loop can be held waiting on one of them
  // while it waits for a CPU (a stall measured at 333 ms with 1 ms on a CPU and 0 ms of the main thread's own wait)
  let tids = []; let listed = 0;
  const others = () => {
    if (!LINUX) return null;
    if (Date.now() - listed > 1000) { listed = Date.now(); try { tids = fs.readdirSync('/proc/self/task').filter((t) => Number(t) !== process.pid); } catch { tids = []; } }
    const o = {}; for (const t of tids) { const d = delayOf(`/proc/self/task/${t}/schedstat`); if (d != null) o[t] = d; } return o;
  };
  const at = () => { const [c, d] = rd(); return { t: now(), c, d, o: others() }; };
  let prev = at();
  const gaps = []; const kept = [];
  let longest = null; let worst = null;
  const tick = () => {
    const cur = at();
    const ms = cur.t - prev.t - every;
    if (ms > 1) {
      let other = 0; if (cur.o && prev.o) for (const [t, d] of Object.entries(cur.o)) if (prev.o[t] != null) other = Math.max(other, d - prev.o[t]);
      const wait = (cur.d != null && prev.d != null ? cur.d - prev.d : 0) + other;
      const cpu = cur.c != null && prev.c != null ? cur.c - prev.c : 0;
      const g = { ms: Math.round(ms), wait: Math.round(Math.min(ms, wait)), own: Math.round(Math.max(cpu, ms - wait)), cpu: cur.c != null && prev.c != null ? Math.round(cpu) : null }; // (own: never below what it ran on a CPU)
      if (!longest || g.ms > longest.ms) longest = g;
      if (!worst || g.own > worst.own) worst = g;
      gaps.push(g);
      if (keep && g.ms >= keep) kept.push({ ...g, from: prev.t, to: cur.t });
    }
    prev = cur;
  };
  const timer = setInterval(tick, every);
  return {
    stop() { clearInterval(timer); tick(); return { maxMs: longest ? longest.ms : 0, maxOwn: worst ? worst.own : 0, worst, longest, n: gaps.length, kept }; },
  };
}
const judgeStall = (s, budget) => (!(s.maxMs >= budget) ? 'ok' : s.maxOwn >= budget ? 'over' : 'load');

module.exports = { snap, waited, judge, stallWatch, judgeStall };
