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

module.exports = { snap, waited, judge };
