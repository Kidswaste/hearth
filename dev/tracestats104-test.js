#!/usr/bin/env node
// (round 104, checksgc104) dev/trace-stats.js longTasks on a RECORDED trace (dev/fixtures/trace-gc104.json: the window's
// main thread from chatwindow86's edit step, a light trace's categories — toplevel, the page's marks, V8's GC events —
// cut to 145 ms around a 89.6 ms task that was only a major garbage collection, 81.7 ms of its own CPU, run right after
// a run of tiny tasks; time 0 is the step's mark, cw86:edit):
//   · a GC-only task is found and said to be one (gc), and judged even though the page's long-task observer never
//     reports it (unobserved);
//   · an observed task's CPU is its OWN events' CPU: an observed span that starts on the tiny task before it and ends
//     2.7 ms before the GC's end (the observer's span is rounded and read on another clock) was matched by round 102
//     to the tiny tasks wholly inside it (0.2 ms of CPU: "can't tell") instead of the 81.7 ms task it was;
//   · a span its own events don't cover stays unknown; a key's span (cover: 0) takes whatever ran in it;
//   · load: CPU under the budget, the rest no more than the thread's wait for a CPU.
//   node dev/tracestats104-test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { longTasks } = require('./trace-stats.js');

const ev = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'trace-gc104.json'), 'utf8'));
let pass = 0; let fail = 0;
const ok = (c, msg) => { if (c) pass += 1; else { fail += 1; console.log(`✖ ${msg}`); } };
const near = (a, b, d = 0.15) => a != null && Math.abs(a - b) <= d;
const MARK = 'cw86:edit';

// round 102's match (dev/trace-stats.js before this round): the outermost events wholly inside the span ± 1 ms, or
// when none, the ones overlapping it. Kept here to show the fixture holds the case it got wrong
function round102(events, o) {
  const m = events.find((e) => e.name === MARK);
  const all = events.filter((e) => e.ph === 'X').sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const top = []; for (const t of all) { const p = top.at(-1); if (p && t.ts < p.ts + p.dur) continue; top.push(t); }
  const a = m.ts + (o.at - 1) * 1000; const b = m.ts + (o.at + o.ms + 1) * 1000;
  const inside = top.filter((t) => t.ts >= a && t.ts + t.dur <= b);
  return inside.reduce((x, t) => x + (t.tdur || 0), 0) / 1000;
}

// 1. the GC-only task, found from the trace alone
{
  const r = longTasks(ev, { min: 50, mark: MARK });
  const t = r.tasks[0];
  ok(r.tasks.length === 1 && near(t.at, 695.3) && near(t.ms, 89.6) && near(t.cpuMs, 81.7), `the long task: ${JSON.stringify(r.tasks)}`);
  ok(t?.gc === true, 'it is said to be a garbage collection');
}
// 2. the observer saw nothing: the GC-only task is still judged, over a 60 ms budget on its own CPU
{
  const r = longTasks(ev, { min: 50, budget: 60, mark: MARK, observed: [], delays: { 1: 30 } });
  const t = r.tasks[0];
  ok(r.tasks.length === 1 && t.gc && t.unobserved && near(t.cpuMs, 81.7), `unobserved GC task added: ${JSON.stringify(r.tasks)}`);
  ok(r.verdict === 'over' && /garbage collection/.test(r.why) && /not reported/.test(r.why), `judged over: ${r.verdict} ${r.why}`);
  // … and not added twice when the observer did see it
  const r2 = longTasks(ev, { min: 50, budget: 60, mark: MARK, observed: [{ at: 695.3, ms: 89.6 }], delays: { 1: 30 } });
  ok(r2.tasks.length === 1 && !r2.tasks[0].unobserved && r2.tasks[0].gc && near(r2.tasks[0].cpuMs, 81.7, 0.3) && r2.verdict === 'over', `observed GC task judged once: ${JSON.stringify(r2.tasks)}`);
}
// 3. cw103's case: the observed span starts on the tiny task just before (695.2) and is 87 ms long, so the GC task's own
//    event sticks out of it by 2.7 ms; round 102 took the tiny tasks inside it
{
  const o = { at: 695.2, ms: 87 };
  const old = round102(ev, o);
  ok(old < 1, `round 102 matched it to ${old.toFixed(2)} ms of CPU (the fixture holds the case)`);
  const r = longTasks(ev, { min: 50, budget: 60, mark: MARK, observed: [o], delays: { 1: 30 } });
  const t = r.tasks[0];
  ok(r.tasks.length === 1 && t.cpuMs >= 81.7 && t.cpuMs < 82.5, `its own events' CPU: ${JSON.stringify(t)}`);
  ok(r.verdict === 'over', `judged on it: ${r.verdict} (${r.why})`);
  // the same span 3 ms early (the observer's clock the other way): still the task's own
  const r3 = longTasks(ev, { min: 50, budget: 60, mark: MARK, observed: [{ at: 692.3, ms: 89 }] });
  ok(r3.tasks[0].cpuMs >= 81.7 && r3.tasks[0].cpuMs < 85, `early span: ${JSON.stringify(r3.tasks[0])}`);
}
// 4. a span its own events cover only 70 % of (the GC's last 3.9 ms are not its own) stays unknown: judged on wall time by the check
{
  const r = longTasks(ev, { min: 10, budget: 12, mark: MARK, observed: [{ at: 781, ms: 19 }], delays: { 1: 30 } });
  const u = r.tasks.find((t) => t.at === 781);
  ok(u && u.cpuMs === null && u.judged === 'unknown', `uncovered span: ${JSON.stringify(u)}`);
  // a key's span (key → frame: not one task, cover 0): the CPU of what ran in it, here a few tenths of a ms
  const k = longTasks(ev, { min: 0, budget: 12, mark: MARK, observed: [{ at: 670, ms: 15 }], cover: 0, delays: { 1: 30 } });
  const kt = k.tasks.find((t) => t.at === 670);
  ok(kt && kt.cpuMs > 0 && kt.cpuMs < 10 && kt.judged === 'load', `key span: ${JSON.stringify(kt)}`);
}
// 5. load: under a 85 ms budget its CPU fits, and its 7.9 ms off the CPU are within the thread's 30 ms wait for one
{
  const r = longTasks(ev, { min: 50, budget: 85, mark: MARK, observed: [{ at: 695.3, ms: 89.6 }], delays: { 1: 30 } });
  ok(r.verdict === 'load', `load: ${r.verdict} ${r.why}`);
  const r2 = longTasks(ev, { min: 50, budget: 85, mark: MARK, observed: [{ at: 695.3, ms: 89.6 }], delays: { 1: 1 } });
  ok(r2.verdict === 'over', `off the CPU longer than it waited for one: ${r2.verdict} ${r2.why}`);
}
console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
