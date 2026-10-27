// (round 73, startfast73) Sums sampling CPU profiles for the startup reports (dev/coldstart-report.js --profile):
//   fromCpuprofile(p, toMs)  a .cpuprofile (the main process: dev/boot-probe.js HEARTH_BOOT_CPUPROF) → { nodes, samples }
//   fromTrace(events, pid, toMs, tid)  a trace's Profile / ProfileChunk events of one process (v8.cpu_profiler) → same;
//                            with tid, only the profiles of that thread (the page's main thread, not its workers)
//   top(prof, a, b, n)       self time by function (and by file) between two times (ms)
//   busy(prof, gapMs)        busy stretches: runs of non-idle samples with gaps < gapMs → [{ at, ms }]
// toMs maps the profile's own µs clock to the caller's ms clock.
const IDLE = new Set(['(idle)', '(program)', '(garbage collector)', '(root)']);

function index(nodes) {
  const m = new Map();
  for (const n of nodes) m.set(n.id, n);
  return m;
}

function fromCpuprofile(p, toMs) {
  const nodes = index(p.nodes || []);
  const samples = []; let t = p.startTime;
  for (let i = 0; i < (p.samples || []).length; i++) { t += p.timeDeltas[i] || 0; samples.push({ t: toMs(t), id: p.samples[i] }); }
  return { nodes, samples };
}

function fromTrace(events, pid, toMs, tid) {
  const nodes = new Map(); const samples = [];
  const byId = new Map(); // profile id → running time (µs)
  for (const e of events) {
    if (e.pid !== pid) continue;
    if (e.name === 'Profile' && (tid == null || e.tid === tid)) byId.set(e.id, e.args?.data?.startTime ?? 0);
    if (e.name !== 'ProfileChunk' || !byId.has(e.id)) continue;
    const d = e.args?.data || {}; const cp = d.cpuProfile || {};
    for (const n of cp.nodes || []) nodes.set(n.id, { ...nodes.get(n.id), ...n });
    let t = byId.get(e.id) ?? 0;
    const deltas = d.timeDeltas || [];
    for (let i = 0; i < (cp.samples || []).length; i++) { t += deltas[i] || 0; samples.push({ t: toMs(t), id: cp.samples[i] }); }
    byId.set(e.id, t);
  }
  samples.sort((a, b) => a.t - b.t);
  return { nodes, samples };
}

const label = (n) => {
  const f = n?.callFrame || {};
  const file = String(f.url || '').split('/').pop() || '';
  return { fn: `${f.functionName || '(anon)'} ${file}${file ? `:${(f.lineNumber ?? -1) + 1}` : ''}`, file: file || f.functionName || '?' };
};

function top(prof, a = -Infinity, b = Infinity, n = 12) {
  const fns = new Map(); const files = new Map(); let total = 0; let all = 0;
  for (let i = 0; i < prof.samples.length; i++) {
    const s = prof.samples[i]; if (s.t < a || s.t >= b) continue;
    const next = prof.samples[i + 1]; const dt = next ? Math.min(next.t - s.t, 5) : 0.5;
    all += dt;
    const node = prof.nodes.get(s.id); const name = node?.callFrame?.functionName;
    if (IDLE.has(name) && name !== '(garbage collector)' && name !== '(program)') continue;
    total += dt;
    const l = label(node);
    fns.set(l.fn, (fns.get(l.fn) || 0) + dt); files.set(l.file, (files.get(l.file) || 0) + dt);
  }
  const r = (m) => [...m].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => `${Math.round(v)} ${k}`);
  return { busyMs: Math.round(total), spanMs: Math.round(all), fns: r(fns), files: r(files) };
}

function busy(prof, gapMs = 2) {
  const out = []; let cur = null;
  for (let i = 0; i < prof.samples.length; i++) {
    const s = prof.samples[i]; const name = prof.nodes.get(s.id)?.callFrame?.functionName;
    if (name === '(idle)' || name === '(root)' || name === '(program)') continue;
    if (cur && s.t - cur.end <= gapMs) cur.end = s.t;
    else { if (cur) out.push(cur); cur = { start: s.t, end: s.t }; }
  }
  if (cur) out.push(cur);
  return out.map((x) => ({ at: Math.round(x.start), ms: Math.round(x.end - x.start) }));
}

module.exports = { fromCpuprofile, fromTrace, top, busy };
