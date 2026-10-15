// Frame-budget numbers from a smoke trace (dev/smoke.js `{ trace: 'stop', detail: true }`), for the 240 Hz check
// (dev/checks/hz240.js). Everything is on the app window's renderer main thread:
//   tasks      top-level tasks, how many ran over 4.2 ms (one 240 Hz frame), 8.3 ms (120 Hz) and 50 ms
//   frames     main-thread work per drawn frame (every task since the previous frame + this frame's style / layout /
//              paint): over 4.2 ms a 240 Hz screen misses that frame, whatever the vsync here is
//   forced     style recalcs and layouts run synchronously inside script (a layout read after a write)
//   style / layout   how many, how many elements / objects, ms
//   segments   per labelled stretch (performance.mark('hz240:<name>') in the page; a stretch runs to the next mark):
//              every real input in it with input → next commit latency (main side: input, handlers, the frame's
//              rendering and commit) and the main-thread busy time in that span (≤ 4.2 ms fits a 240 Hz frame)
const SCRIPT = new Set(['FunctionCall', 'EventDispatch', 'TimerFire', 'FireAnimationFrame', 'EvaluateScript', 'v8.callFunction', 'v8.run', 'FireIdleCallback', 'RunMicrotasks', 'v8.evaluateModule']);
const RENDER = new Set(['PrePaint', 'Paint', 'UpdateLayer', 'LocalFrameView::RunPrePaintLifecyclePhase', 'Layerize']);
const INPUT = /^(pointer|mouse|key|wheel|click|auxclick|contextmenu|input|beforeinput|touch|dblclick|compositionend)/;
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

function stats(events, opts = {}) {
  const budget = opts.budget || 4.2;
  const names = {}; for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names[`${e.pid}:${e.tid}`] = e.args?.name;
  // the window's main thread: the renderer main thread that worked the most (the Lab's sandbox may have its own)
  const busy = {};
  for (const e of events) if (e.name === 'RunTask' && e.ph === 'X' && names[`${e.pid}:${e.tid}`] === 'CrRendererMain') busy[`${e.pid}:${e.tid}`] = (busy[`${e.pid}:${e.tid}`] || 0) + (e.dur || 0);
  // (round 32) the thread that set the check's hz240 marks is the window's, even when a heavy Lab scene on software GL
  // keeps its sandbox busier (smooth32's lab-stream stretch)
  const marked = events.find((e) => e.cat?.includes('user_timing') && /^hz240:/.test(e.name) && busy[`${e.pid}:${e.tid}`] !== undefined);
  const main = marked ? `${marked.pid}:${marked.tid}` : Object.entries(busy).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!main) return { error: 'no renderer main thread in the trace' };
  const on = events.filter((e) => `${e.pid}:${e.tid}` === main).sort((a, b) => a.ts - b.ts);
  const X = on.filter((e) => e.ph === 'X');
  const tasks = X.filter((e) => e.name === 'RunTask');
  // which task each event belongs to (tasks don't overlap on one thread)
  let ti = 0; const taskOf = (ts) => { while (ti < tasks.length && tasks[ti].ts + tasks[ti].dur < ts) ti++; const t = tasks[ti]; return t && t.ts <= ts ? t : null; };
  for (const e of X) { if (e.name === 'RunTask') continue; const t = taskOf(e.ts); if (t && RENDER.has(e.name)) t.render = true; if (t && (e.name === 'TimerFire' || e.name === 'FireIdleCallback')) t.bg = true; }
  // forced: style / layout inside a script event
  const scripts = X.filter((e) => SCRIPT.has(e.name));
  let si = 0; const open = [];
  const inScript = (e) => { while (si < scripts.length && scripts[si].ts <= e.ts) open.push(scripts[si++]); for (let i = open.length - 1; i >= 0; i--) if (open[i].ts + open[i].dur < e.ts) open.splice(i, 1); const hit = open.filter((s) => s.ts <= e.ts && e.ts + e.dur <= s.ts + s.dur + 1); return hit.length ? { outer: hit[0], inner: hit.findLast((s) => s.args?.data?.url) || hit.at(-1) } : null; };
  const forced = { n: 0, ms: 0, by: {} };
  const styleLayout = X.filter((e) => e.name === 'UpdateLayoutTree' || e.name === 'Layout');
  for (const e of styleLayout) {
    const s = inScript(e); if (!s) continue;
    forced.n++; forced.ms += e.dur / 1000; e.__forced = true;
    // where: the event type, and the innermost script with a source (file:line:column)
    const o = s.outer.args?.data || {}; const d = s.inner.args?.data || {};
    // (with the stack category: the JS frame that asked for it, the most telling place)
    const st = (e.args?.beginData?.stackTrace || e.args?.data?.stackTrace || [])[0];
    const at = st ? ` ${String(st.url).split('/').pop()}:${st.lineNumber}:${st.columnNumber} ${st.functionName || ''}`.trimEnd() : d.url ? ` ${d.url.split('/').pop()}:${d.lineNumber}:${d.columnNumber}${d.functionName ? ` ${d.functionName}` : ''}` : '';
    const k = `${e.name === 'Layout' ? 'layout' : 'style'} in ${o.type || s.outer.name}${at}`;
    forced.by[k] = (forced.by[k] || 0) + e.dur / 1000; e.__by = k;
  }
  // frames: the work since the previous frame's end, up to this frame's end
  const frames = []; let since = null; let acc = 0;
  for (const t of tasks) {
    acc += t.dur / 1000;
    if (t.render) { frames.push({ ts: t.ts, end: t.ts + t.dur, work: acc, render: t.dur / 1000, since }); acc = 0; since = t.ts + t.dur; }
  }
  const fw = frames.map((f) => f.work).sort((a, b) => a - b);
  const td = tasks.map((t) => t.dur / 1000);
  const styles = X.filter((e) => e.name === 'UpdateLayoutTree'); const layouts = X.filter((e) => e.name === 'Layout');
  const out = {
    tasks: { n: tasks.length, busyMs: Math.round(td.reduce((a, b) => a + b, 0)), over4: td.filter((d) => d > budget).length, over8: td.filter((d) => d > 8.3).length, over50: td.filter((d) => d > 50).length, maxMs: r1(Math.max(0, ...td)) },
    frames: { n: frames.length, over4: fw.filter((d) => d > budget).length, over8: fw.filter((d) => d > 8.3).length, p50: r1(pct(fw, 0.5)), p95: r1(pct(fw, 0.95)), worst: r1(fw.at(-1) || 0) },
    forced: { n: forced.n, ms: r1(forced.ms), top: Object.entries(forced.by).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${r1(v)}ms ${k}`) },
    style: { n: styles.length, elements: styles.reduce((a, e) => a + (e.args?.elementCount || 0), 0), ms: r1(styles.reduce((a, e) => a + e.dur, 0) / 1000) },
    layout: { n: layouts.length, objects: layouts.reduce((a, e) => a + (e.args?.beginData?.dirtyObjects || 0), 0), ms: r1(layouts.reduce((a, e) => a + e.dur, 0) / 1000) },
  };
  // inputs (EventTiming: one per DOM event; events from one input share its timeStamp)
  const inputs = new Map();
  for (const e of on) {
    if (e.name !== 'EventTiming' || e.ph !== 'b') continue;
    const d = e.args?.data; if (!d || !INPUT.test(d.type)) continue;
    const k = d.timeStamp; const i = inputs.get(k) || { ts: e.ts, type: d.type, proc: 0, commit: 0, t: d.timeStamp, pStart: Infinity, pEnd: 0 };
    i.proc += Math.max(0, d.processingEnd - d.processingStart);
    // (round 38, inputlatency) the input's phases: waiting for the main thread, handlers, then until the frame commits
    if (d.processingStart > 0) { i.pStart = Math.min(i.pStart, d.processingStart); i.pEnd = Math.max(i.pEnd, d.processingEnd); }
    if (d.commitFinishTime) i.commit = Math.max(i.commit, e.ts + (d.commitFinishTime - d.timeStamp) * 1000);
    inputs.set(k, i);
  }
  const marks = on.filter((e) => e.cat?.includes('user_timing') && /^hz240:/.test(e.name) && e.ph !== 'e').sort((a, b) => a.ts - b.ts);
  const markAt = events.filter((e) => e.cat?.includes('user_timing') && /^at:/.test(e.name) && e.ph !== 'e').sort((a, b) => a.ts - b.ts);
  const markAll = events.filter((e) => e.cat?.includes('user_timing') && /^hz240:/.test(e.name) && e.ph !== 'e').sort((a, b) => a.ts - b.ts);
  const segs = (marks.length ? marks : markAll).map((m, i, a) => ({ name: m.name.slice(6), from: m.ts, to: a[i + 1]?.ts ?? Infinity }));
  // main-thread busy µs between two trace times
  const busyIn = (a, b) => { let s = 0; for (const t of tasks) { if (t.ts > b) break; const x = Math.max(a, t.ts); const y = Math.min(b, t.ts + t.dur); if (y > x) s += y - x; } return s / 1000; };
  // (round 45, chatswitch) the same in the thread's own CPU time (tdur): what the work costs, whatever else the machine
  // runs (on a loaded machine wall time stretches 5–20×; a task's share is its CPU time × the part inside the span)
  // (fg: without the tasks that ran a timer or an idle callback: other features' background work in between)
  const cpuIn = (a, b, fg = false) => { let s = 0; for (const t of tasks) { if (t.ts > b) break; if (fg && t.bg && !t.render) continue; const x = Math.max(a, t.ts); const y = Math.min(b, t.ts + t.dur); if (y > x) s += (t.tdur ?? t.dur) * (t.dur ? (y - x) / t.dur : 1); } return s / 1000; };
  // where main-thread time goes: the leaf-most well-known phases inside tasks, by name (ms), per stretch
  const PHASES = new Set(['UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'UpdateLayer', 'HitTest', 'FunctionCall', 'EventDispatch', 'TimerFire', 'FireAnimationFrame', 'v8.callFunction', 'RunMicrotasks', 'ParseHTML', 'MajorGC', 'MinorGC', 'V8.GC_SCAVENGER', 'ScrollLayer', 'IntersectionObserverController::computeIntersections', 'LocalFrameView::RunPostLifecycleSteps', 'ProxyMain::BeginMainFrame::commit', 'Commit']);
  const phases = X.filter((e) => PHASES.has(e.name));
  const phaseIn = (a, b) => { const by = {}; let open = null; for (const e of phases) { if (e.ts < a || e.ts >= b) continue; if (open && e.ts < open.ts + open.dur && (SCRIPT.has(open.name))) continue; open = e; by[e.name] = (by[e.name] || 0) + e.dur / 1000; } return Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k} ${r1(v)}`).join(', '); };
  const fcalls = X.filter((e) => e.name === 'FunctionCall' && e.args?.data?.url);
  out.segments = {};
  for (const s of segs) {
    const ins = [...inputs.values()].filter((i) => i.ts >= s.from && i.ts < s.to && i.commit);
    const lat = ins.map((i) => (i.commit - i.ts) / 1000).sort((a, b) => a - b);
    const work = ins.map((i) => busyIn(i.ts, i.commit)).sort((a, b) => a - b);
    const fr = frames.filter((f) => f.end >= s.from && f.end < s.to).map((f) => f.work);
    const tk = tasks.filter((t) => t.ts >= s.from && t.ts < s.to).map((t) => t.dur / 1000);
    const st = styles.filter((e) => e.ts >= s.from && e.ts < s.to); const ly = layouts.filter((e) => e.ts >= s.from && e.ts < s.to);
    const fo = styleLayout.filter((e) => e.ts >= s.from && e.ts < s.to && e.__forced);
    const foBy = {}; for (const e of fo) foBy[e.__by] = (foBy[e.__by] || 0) + e.dur / 1000;
    out.segments[s.name] = {
      inputs: ins.length,
      busyMs: r1(busyIn(s.from, s.to)), // (round 35, streamrender) all main-thread task time in the stretch
      cpuMs: r1(cpuIn(s.from, s.to)), // (round 45) … its CPU time
      workCpu: (() => { const a = ins.map((i) => cpuIn(i.ts, i.commit)).sort((x, y) => x - y); return { p50: r1(pct(a, 0.5)), max: r1(a.at(-1) || 0) }; })(), // (round 45) input → its frame, CPU time
      workFg: (() => { const a = ins.map((i) => cpuIn(i.ts, i.commit, true)).sort((x, y) => x - y); return { p50: r1(pct(a, 0.5)), max: r1(a.at(-1) || 0) }; })(), // … without timers / idle callbacks in between
      // (round 45) the check's own 'at:<what>' marks in the stretch: from its first input (or its start) to each, wall · CPU ms
      at: (() => { const t0 = ins.length ? Math.min(...ins.map((i) => i.ts)) : s.from; const o = {}; for (const e of markAt) { if (e.ts < s.from || e.ts >= s.to || o[e.name.slice(3)]) continue; o[e.name.slice(3)] = { ms: r1((e.ts - t0) / 1000), cpuMs: r1(cpuIn(t0, e.ts)), fgMs: r1(cpuIn(t0, e.ts, true)) }; } return o; })(),
      longestCpu: r1(Math.max(0, ...tasks.filter((t) => t.ts >= s.from && t.ts < s.to).map((t) => (t.tdur ?? t.dur) / 1000))),
      latency: { p50: r1(pct(lat, 0.5)), p95: r1(pct(lat, 0.95)), max: r1(lat.at(-1) || 0) },
      // (round 38, inputlatency) input delay (timeStamp → first handler) · processing (handlers, summed per input) ·
      // presentation (last handler → the frame's commit), p50 / p95 ms
      phasesOfInput: (() => {
        const ok = ins.filter((i) => i.pEnd > 0);
        const s = (f) => { const a = ok.map(f).filter((x) => x >= 0).sort((x, y) => x - y); return { p50: r1(pct(a, 0.5)), p95: r1(pct(a, 0.95)), max: r1(a.at(-1) || 0) }; };
        return { n: ok.length, delay: s((i) => i.pStart - i.t), proc: s((i) => i.proc), pres: s((i) => (i.commit - i.ts) / 1000 - (i.pEnd - i.t)) };
      })(),
      work: { p50: r1(pct(work, 0.5)), p95: r1(pct(work, 0.95)), max: r1(work.at(-1) || 0), over4: work.filter((w) => w > budget).length },
      frames: { n: fr.length, over4: fr.filter((w) => w > budget).length, over8: fr.filter((w) => w > 8.3).length, worst: r1(Math.max(0, ...fr)) },
      longTasks: { over4: tk.filter((d) => d > budget).length, over8: tk.filter((d) => d > 8.3).length, max: r1(Math.max(0, ...tk)) },
      style: { n: st.length, elements: st.reduce((a, e) => a + (e.args?.elementCount || 0), 0), ms: r1(st.reduce((a, e) => a + e.dur, 0) / 1000) },
      layout: { n: ly.length, objects: ly.reduce((a, e) => a + (e.args?.beginData?.dirtyObjects || 0), 0), ms: r1(ly.reduce((a, e) => a + e.dur, 0) / 1000) },
      phases: phaseIn(s.from, s.to),
      scripts: (() => { const by = {}; for (const e of fcalls) { if (e.ts < s.from || e.ts >= s.to) continue; const d = e.args.data; const k = `${d.url.split('/').pop()}:${d.lineNumber}${d.functionName ? ` ${d.functionName}` : ''}`; by[k] = (by[k] || 0) + e.dur / 1000; } return Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${r1(v)}ms ${k}`); })(),
      forced: { n: fo.length, ms: r1(fo.reduce((a, e) => a + e.dur, 0) / 1000), top: Object.entries(foBy).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${r1(v)}ms ${k}`) },
      // (round 41, smooth41) script time per file (JS entries: listeners, timers, rAF, idle callbacks, observers) and
      // what fired by itself (timers, idle callbacks): the per-feature cost of a stretch
      files: (() => { const by = {}; for (const e of fcalls) { if (e.ts < s.from || e.ts >= s.to) continue; const k = e.args.data.url.split('/').pop().split('?')[0] || '?'; const o = by[k] ||= { ms: 0, n: 0 }; o.ms += e.dur / 1000; o.n += 1; } return Object.fromEntries(Object.entries(by).sort((x, y) => y[1].ms - x[1].ms).slice(0, 14).map(([k, v]) => [k, `${r1(v.ms)}ms/${v.n}`])); })(),
      // (round 45) script CPU ms per file (thread time: holds on a loaded machine)
      filesCpu: (() => { const by = {}; for (const e of fcalls) { if (e.ts < s.from || e.ts >= s.to) continue; const k = e.args.data.url.split('/').pop().split('?')[0] || '?'; by[k] = (by[k] || 0) + (e.tdur ?? e.dur) / 1000; } return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, r1(v)])); })(),
      forcedFiles: (() => { const by = {}; for (const e of fo) { const m = /([\w.-]+\.js):\d+/.exec(e.__by || ''); const k = m ? m[1] : '?'; by[k] = (by[k] || 0) + 1; } return by; })(),
      fired: (() => { const n = { timer: 0, idle: 0, raf: 0 }; for (const e of X) { if (e.ts < s.from || e.ts >= s.to) continue; if (e.name === 'TimerFire') n.timer++; else if (e.name === 'FireIdleCallback') n.idle++; else if (e.name === 'FireAnimationFrame') n.raf++; } return n; })(),
    };
  }
  return out;
}
module.exports = { stats };
