#!/usr/bin/env node
// (round 77, perfguard77) The performance guard: the gains of rounds 65–76 measured together, so they can't erode
// quietly. A short curated set (≈ 10–12 min on the shared 4-CPU test box) on the heavy owner-like profile
// (dev/bigprofile.js: 1,500 chats, 120 long ones, 50 Lab scenes… with 40 projects), each measurement repeated and
// taken as a median, compared with dev/perf-baseline.json (committed).
//   startup   dev/coldstart-report.js: a warm-up launch, then STARTS cold starts of the same copy (its caches warm, as
//             on the owner's computer) and one more with CPU profiles of both processes (the culprit list only)
//   app       dev/perfguard-probe.js through dev/smoke.js, RUNS launches: projects (cold / warm open, switch), chats
//             (list clicks, keys), Lab tool calls through the real MCP path, a still Lab scene's draws, idle CPU, heap
//   sync      dev/sync72-perf.js (Node only, Windows-slow disk), SYNC runs: steady / small-change passes' main-process
//             stalls and a steady pass's wall time
// Each launch (or sync run) gives one value per metric (the median of its own repeats); the metric is the median of
// those values and its spread their median absolute deviation (MAD). A metric REGRESSES when it is worse than the
// baseline by more than max(15 %, 3 × its recorded spread, its floor) — the floor is the measurement's own grain (the
// event-loop histogram's 10 ms, a draw a second…). A regression is measured again once (that part only, its values
// pooled with the first ones) before it fails: one bad minute on a shared box isn't a regression.
//   node dev/perfguard.js                     # measure, compare with dev/perf-baseline.json, exit 1 on a regression
//   node dev/perfguard.js --baseline          # measure and write dev/perf-baseline.json (after an intended change)
//   node dev/perfguard.js --only startup,sync # some parts (a baseline written with --only keeps the other parts' rows)
//   node dev/perfguard.js --from <out dir>    # judge an earlier run's measurements again (no launches)
//   options: --out <dir> (logs, profiles, measurements; default <tmp>/hearth-perfguard) · --runs N (app launches, 3) ·
//   --starts N (cold starts, 5) · --sync N (sync runs, 3) · --no-confirm · --lock (each app-launching step takes
//   /tmp/hearth-run.lock itself: for a run NOT already under `flock /tmp/hearth-run.lock`) · --file <baseline json>
// App-launching steps: 1 cold-start series (7 short launches) + RUNS app launches. Under the run lock as usual:
//   flock /tmp/hearth-run.lock node dev/perfguard.js          (or PERFGUARD=1 node dev/run-checks.js perfguard)
// Rebaselining after an intended change: docs/upgrades/perfguard77.md ("Rebaselining").
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const DEV = __dirname;
const ROOT = path.join(DEV, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const OUT = path.resolve(opt('--out', path.join(os.tmpdir(), 'hearth-perfguard')));
const FILE = path.resolve(opt('--file', path.join(DEV, 'perf-baseline.json')));
const FIXTURE = opt('--fixture', '/tmp/hearth-bigprofile72'); // (run-checks makes the same one for projects72)
const SYNC_FIXTURE = opt('--sync-fixture', path.join(os.tmpdir(), 'hearth-sync72-bigprofile'));
const N = { runs: Number(opt('--runs', 3)), starts: Number(opt('--starts', 5)), sync: Number(opt('--sync', 3)) };
const PARTS = (opt('--only', 'startup,app,sync')).split(',').map((s) => s.trim()).filter(Boolean);
const LOCK = has('--lock');

// ---------- the metrics: lower is better for all; floor = the smallest change that can mean anything ----------
// section: where its culprits come from (the CPU profile of that part)
const METRICS = {
  'start.ready': { part: 'startup', label: 'Start → first usable chat', unit: 'ms', floor: 60, section: 'startup' },
  'start.settled': { part: 'startup', label: 'Start → settled (last long task)', unit: 'ms', floor: 120, section: 'startup' },
  'project.coldOpen': { part: 'app', label: 'Project cold open (Hearth\'s part)', unit: 'ms', floor: 40, section: 'projects' },
  'project.warmOpen': { part: 'app', label: 'Project warm open (Hearth\'s part)', unit: 'ms', floor: 40, section: 'projects' },
  'project.switch': { part: 'app', label: 'Project switch (Hearth\'s part)', unit: 'ms', floor: 40, section: 'projects' },
  'chat.switch': { part: 'app', label: 'Long chat opened from its list row', unit: 'ms', floor: 20, section: 'chats' },
  'chat.clickHandler': { part: 'app', label: 'Chat list click: window handlers', unit: 'ms', floor: 3, section: 'chats' },
  'chat.clickCpu': { part: 'app', label: 'Chat list click: window CPU in 600 ms', unit: 'ms', floor: 8, section: 'chats' },
  'chat.keyHandler': { part: 'app', label: 'Typing: window handlers per key', unit: 'ms', floor: 1, section: 'chats' },
  'lab.toolCall': { part: 'app', label: 'Lab tool call (no picture), end to end', unit: 'ms', floor: 8, section: 'lab' },
  'lab.stillDraws': { part: 'app', label: 'Still Lab scene: draws a second', unit: '/s', floor: 0.4, section: 'lab' },
  'idle.windowCpu': { part: 'app', label: 'Idle on a chat: the window', unit: '% CPU', floor: 0.5, section: 'idle' },
  'idle.allCpu': { part: 'app', label: 'Idle on a chat: every process', unit: '% CPU', floor: 1, section: 'idle' },
  'mem.windowHeap': { part: 'app', label: 'Window JS heap after GC (end of run)', unit: 'MB', floor: 4, section: 'memory' },
  'sync.steadyStall': { part: 'sync', label: 'Sync steady pass: main-process stall', unit: 'ms', floor: 10, section: 'sync' },
  'sync.changeStall': { part: 'sync', label: 'Sync small-change pass: main-process stall', unit: 'ms', floor: 10, section: 'sync' },
  'sync.steadyWall': { part: 'sync', label: 'Sync steady pass: wall time', unit: 'ms', floor: 40, section: 'sync' },
};

const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const mad = (xs) => { const m = median(xs); return m == null ? null : median(xs.filter(Number.isFinite).map((x) => Math.abs(x - m))); };
const rnd = (x) => (x == null || !Number.isFinite(x) ? null : Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 100) / 100);
const log = (...a) => console.log(...a);
const sh = (cmd, a, o = {}) => spawnSync(LOCK ? 'flock' : cmd, LOCK ? ['/tmp/hearth-run.lock', cmd, ...a] : a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20, timeout: 1500000, ...o });

function machine() {
  const git = (a) => { try { return execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  let electron = null; try { electron = fs.readFileSync(path.join(path.dirname(process.env.ELECTRON || '/opt/hearth-electron/electron'), 'version'), 'utf8').trim(); } catch { /* unknown */ }
  return {
    cpus: os.cpus().length, cpu: os.cpus()[0]?.model || '?', memGB: Math.round(os.totalmem() / 1073741824), platform: `${os.platform()} ${os.release()}`,
    node: process.version, electron, gl: 'SwiftShader (software) under Xvfb', commit: git(['rev-parse', '--short', 'HEAD']), dirty: Boolean(git(['status', '--porcelain', '--untracked-files=no'])),
    loadStart: os.loadavg().map((x) => Math.round(x * 100) / 100),
  };
}

// ---------- the parts ----------
function ensureFixture() {
  if (fs.existsSync(path.join(FIXTURE, 'kv', 'projects.json'))) return;
  log(`making the fixture ${FIXTURE} (dev/bigprofile.js --projects 40)…`);
  execFileSync('node', [path.join(DEV, 'bigprofile.js'), FIXTURE, '--projects', '40'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
}

function startup(m, tag) {
  const json = path.join(OUT, `startup${tag}.json`); const prof = path.join(OUT, `startup${tag}-profiles`);
  log(`startup: a warm-up launch + ${N.starts} cold starts + 1 profiled (dev/coldstart-report.js)…`);
  const r = sh('node', [path.join(DEV, 'coldstart-report.js'), '--data', FIXTURE, '--runs', String(N.starts + 1), '--json', json, '--profile', prof]);
  fs.writeFileSync(path.join(OUT, `startup${tag}.log`), `${r.stdout || ''}${r.stderr || ''}`);
  let j = null; try { j = JSON.parse(fs.readFileSync(json, 'utf8')); } catch { m.problems.push(`startup: no measurements (exit ${r.status}; ${path.join(OUT, `startup${tag}.log`)})`); return; }
  const runs = j.runs.slice(0, -1); // (the last one is profiled: slower, culprits only)
  for (const run of runs) { push(m, 'start.ready', run.ready); push(m, 'start.settled', run.settled); }
  // culprits, waits: the start's phases (splash milestones) and how long the main process took to answer each IPC
  // channel in the first 5 s (medians over the starts): work off the main thread (the store thread reading chats) shows
  // here, not in the profiles
  const waits = new Map(); const addW = (k, v) => { if (Number.isFinite(v)) (waits.get(k) || waits.set(k, []).get(k)).push(v); };
  for (const run of runs) {
    const sp = Object.entries(run.splash || {}).filter(([, v]) => Number.isFinite(v)).sort((a, b) => a[1] - b[1]);
    sp.forEach(([k, v], i) => { if (i && !/features/.test(k)) addW(`start phase: ${sp[i - 1][0].replace('splash:', '')} → ${k.replace('splash:', '')}`, v - sp[i - 1][1]); });
    for (const [ch, x] of Object.entries(run.ipc || {})) if (!/^engine:/.test(ch)) addW(`ipc answered: ${ch} ×${x[0]}`, x[1]); // (engine:* look for the CLIs: seconds, in the background)
  }
  addTops(m, 'startup', [...waits].map(([k, v]) => [k, median(v)]), 1);
  // culprits: the profiled start's top functions per process, start → ready
  try {
    const text = fs.readFileSync(path.join(prof, 'summary.txt'), 'utf8').split('\n');
    const tops = new Map();
    for (let i = 0; i < text.length; i++) {
      const h = text[i].match(/^\s+(main|window) · (start → first paint|first paint → ready|ready → settled) /); if (!h) continue;
      const fns = (text[i + 2] || '').replace(/^\s+fns:\s*/, '').split(' · ');
      for (const f of fns) { const x = f.match(/^(\d+) (.+?)\s*$/); if (x && !/^\((program|idle|root)\)$/.test(x[2])) tops.set(`${h[1]}: ${x[2]}`, (tops.get(`${h[1]}: ${x[2]}`) || 0) + Number(x[1])); }
    }
    addTops(m, 'startup', [...tops], 1);
  } catch { m.problems.push('startup: no profile summary'); }
}

function app(m, tag) {
  for (let i = 1; i <= N.runs; i++) {
    const dir = path.join(OUT, `app${tag}-${i}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    log(`app: launch ${i} of ${N.runs} (dev/perfguard-probe.js on the heavy profile, ≈ 2–2.5 min)…`);
    const t0 = Date.now();
    const r = sh('node', [path.join(DEV, 'smoke.js'), '--fake-engines', '--data', FIXTURE, '--wait', '1000', '--check-timeout', '600000', '--tmp', path.join(dir, 'tmp'), '--script', path.join(DEV, 'perfguard-probe.js'), '--shot', path.join(dir, 'end.png')]);
    fs.writeFileSync(path.join(dir, 'smoke.log'), `${r.stdout || ''}${r.stderr || ''}`);
    let p = null; try { p = JSON.parse(fs.readFileSync(path.join(dir, 'tmp', 'perfguard-probe.json'), 'utf8')); } catch { m.problems.push(`app launch ${i}: no measurements (exit ${r.status}; ${path.join(dir, 'smoke.log')})`); continue; }
    for (const pr of p.problems || []) m.problems.push(`app launch ${i}: ${pr}`);
    for (const [k, xs] of Object.entries(p.samples || {})) if (METRICS[k]) push(m, k, median(xs));
    for (const [s, list] of Object.entries(p.tops || {})) addTops(m, s, list, N.runs);
    (m.notes.app ||= []).push({ launch: i, secs: Math.round((Date.now() - t0) / 1000), ...p.notes });
  }
}

function sync(m, tag) {
  for (let i = 1; i <= N.sync; i++) {
    log(`sync: run ${i} of ${N.sync} (dev/sync72-perf.js: the engine on the heavy profile, a Windows-slow disk, ≈ 35 s)…`);
    const r = spawnSync('node', [path.join(DEV, 'sync72-perf.js'), '--json', '--budget', '100000', '--fixture', SYNC_FIXTURE], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 900000 });
    fs.writeFileSync(path.join(OUT, `sync${tag}-${i}.log`), `${r.stdout || ''}${r.stderr || ''}`);
    let j = null; try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { m.problems.push(`sync run ${i}: no measurements (exit ${r.status})`); continue; }
    const steady = j.phases.filter((p) => /steady/.test(p.label)); const change = j.phases.filter((p) => /changed|saved|arrives|saves again|merge/.test(p.label));
    push(m, 'sync.steadyStall', median(steady.map((p) => p.delayMax))); push(m, 'sync.changeStall', median(change.map((p) => p.delayMax))); push(m, 'sync.steadyWall', median(steady.map((p) => p.ms)));
    const tops = new Map();
    for (const p of [...steady, ...change]) for (const b of p.blocks || []) for (const t of b.top || []) { const x = String(t).match(/^(\d+)ms (.+)$/); if (x) tops.set(x[2], (tops.get(x[2]) || 0) + Number(x[1])); }
    addTops(m, 'sync', [...tops], N.sync);
  }
}

function push(m, k, v) { if (Number.isFinite(v)) (m.values[k] ||= []).push(rnd(v)); }
function addTops(m, section, list, div) { const t = m.tops[section] ||= {}; for (const [k, ms] of list) t[k] = rnd((t[k] || 0) + ms / div); }
const topList = (t, n = 12) => Object.entries(t || {}).sort((a, b) => b[1] - a[1]).slice(0, n);

function measure(parts, tag = '') {
  const m = { values: {}, tops: {}, notes: {}, problems: [] };
  if (parts.includes('startup') || parts.includes('app')) ensureFixture();
  if (parts.includes('startup')) startup(m, tag);
  if (parts.includes('app')) app(m, tag);
  if (parts.includes('sync')) sync(m, tag);
  return m;
}
function summarize(m) {
  return Object.fromEntries(Object.entries(METRICS).filter(([k]) => m.values[k]?.length).map(([k, d]) => {
    const v = m.values[k]; const md = median(v); const sp = mad(v);
    return [k, { label: d.label, unit: d.unit, median: rnd(md), spread: rnd(sp), spreadPct: md ? rnd((sp / md) * 100) : null, n: v.length, values: v }];
  }));
}

// ---------- compare ----------
function judge(base, now) {
  const rows = [];
  for (const [k, d] of Object.entries(METRICS)) {
    const b = base.metrics?.[k]; const c = now[k];
    if (!b || !c) { if (b || c) rows.push({ k, d, b, c, verdict: b ? 'not measured' : 'new (no baseline)' }); continue; }
    const tol = Math.max(0.15 * Math.abs(b.median), 3 * (b.spread || 0), d.floor);
    const delta = c.median - b.median;
    rows.push({ k, d, b, c, tol, delta, verdict: delta > tol ? 'REGRESSED' : delta < -tol ? 'better' : 'ok' });
  }
  return rows;
}
function table(rows) {
  const fmt = (x, u) => (x == null ? '—' : `${rnd(x)}${u === 'ms' ? ' ms' : u === 'MB' ? ' MB' : u === '/s' ? '/s' : u === '% CPU' ? ' %' : ''}`);
  const lines = [['metric', 'baseline', 'now', 'change', 'allowed', ''].join(' | ')];
  for (const r of rows) {
    const pct = r.b && r.c && r.b.median ? `${r.delta >= 0 ? '+' : ''}${Math.round((r.delta / r.b.median) * 100)} %` : '';
    lines.push([r.d.label, fmt(r.b?.median, r.d.unit), fmt(r.c?.median, r.d.unit), r.b && r.c ? `${r.delta >= 0 ? '+' : ''}${fmt(r.delta, r.d.unit)} (${pct})` : '', r.tol != null ? `+${fmt(r.tol, r.d.unit)}` : '', r.verdict].join(' | '));
  }
  const w = lines.map((l) => l.split(' | ')).reduce((a, cells) => cells.map((c, i) => Math.max(a[i] || 0, c.length)), []);
  return lines.map((l, j) => { const s = l.split(' | ').map((c, i) => (i ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  '); return j === 0 ? `${s}\n${'-'.repeat(s.length)}` : s; }).join('\n');
}
function culprits(section, base, now) {
  const b = base.tops?.[section] || {};
  // the top 8 now, then the 3 that grew most since the baseline (when not already listed)
  const top = topList(now.tops?.[section], 8); const listed = new Set(top.map(([k]) => k));
  const grew = Object.entries(now.tops?.[section] || {}).filter(([k]) => !listed.has(k)).map(([k, ms]) => [k, ms, ms - (b[k] || 0)]).filter((x) => x[2] > 0).sort((x, y) => y[2] - x[2]).slice(0, 3);
  return [...top, ...grew].map(([k, ms]) => { const was = b[k]; const d = was == null ? 'new in the top' : `${ms - was >= 0 ? '+' : ''}${rnd(ms - was)} ms vs baseline`; return `    ${String(rnd(ms)).padStart(6)} ms  ${k}  (${d})`; });
}

// ---------- main ----------
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  let m;
  if (opt('--from')) m = JSON.parse(fs.readFileSync(path.join(path.resolve(opt('--from')), 'measured.json'), 'utf8'));
  else {
    const mach = machine();
    log(`perfguard: ${PARTS.join(' + ')} on ${mach.cpus} CPUs (load ${mach.loadStart.join(' ')}), commit ${mach.commit}${mach.dirty ? ' + changes' : ''} · logs ${OUT}`);
    m = measure(PARTS);
    m.machine = { ...mach, loadEnd: os.loadavg().map((x) => Math.round(x * 100) / 100), minutes: Math.round((Date.now() - t0) / 6000) / 10 };
    m.settings = { ...N, parts: PARTS, fixture: FIXTURE, syncFixture: SYNC_FIXTURE };
    fs.writeFileSync(path.join(OUT, 'measured.json'), JSON.stringify(m, null, 1));
  }
  let now = summarize(m);

  if (has('--baseline')) {
    let old = {}; try { old = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* the first one */ }
    const keep = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !PARTS.includes(METRICS[k]?.part || k)));
    const sections = new Set(Object.entries(METRICS).filter(([, d]) => PARTS.includes(d.part)).map(([, d]) => d.section));
    const base = {
      about: 'dev/perfguard.js baseline (round 77, perfguard77): medians of per-launch values; spread = their median absolute deviation. Rebaseline: docs/upgrades/perfguard77.md',
      when: new Date().toISOString(), machine: m.machine, settings: m.settings,
      // when / where each part was last measured (a baseline written with --only keeps the others' rows and notes)
      parts: { ...(old.parts || {}), ...Object.fromEntries(PARTS.map((pt) => [pt, { when: new Date().toISOString(), commit: m.machine?.commit, dirty: m.machine?.dirty, load: [m.machine?.loadStart, m.machine?.loadEnd] }])) },
      metrics: { ...keep(old.metrics), ...now },
      tops: { ...Object.fromEntries(Object.entries(old.tops || {}).filter(([s]) => !sections.has(s))), ...Object.fromEntries(Object.entries(m.tops).map(([s, t]) => [s, Object.fromEntries(topList(t, 30))])) },
      problems: m.problems,
    };
    fs.writeFileSync(FILE, `${JSON.stringify(base, null, 1)}\n`);
    const w = Math.max(...Object.values(METRICS).map((d) => d.label.length));
    log(`\n${'metric'.padEnd(w)}  ${'median'.padStart(10)}  ${'spread (MAD)'.padStart(16)}  n\n${'-'.repeat(w + 34)}`);
    for (const [k, d] of Object.entries(METRICS)) if (now[k]) log(`${d.label.padEnd(w)}  ${`${now[k].median} ${d.unit}`.padStart(10)}  ${`±${now[k].spread} (${now[k].spreadPct} %)`.padStart(16)}  ${now[k].n}`);
    if (m.problems.length) log(`\nproblems:\n  ${m.problems.join('\n  ')}`);
    log(`\nbaseline written: ${FILE} (${Math.round((Date.now() - t0) / 6000) / 10} min)`);
    process.exit(m.problems.length ? 1 : 0);
  }

  let base; try { base = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { console.error(`No baseline at ${FILE}: node dev/perfguard.js --baseline`); process.exit(2); }
  let rows = judge(base, now);
  // a regression is measured again once (its part only, pooled): the box is shared and one bad minute isn't a regression
  const again = [...new Set(rows.filter((r) => r.verdict === 'REGRESSED').map((r) => r.d.part))];
  if (again.length && !has('--no-confirm') && !opt('--from')) {
    log(`\n${rows.filter((r) => r.verdict === 'REGRESSED').map((r) => r.d.label).join(', ')}: over the line, measuring ${again.join(' + ')} again to confirm…`);
    const m2 = measure(again, '-again');
    for (const [k, v] of Object.entries(m2.values)) m.values[k] = [...(m.values[k] || []), ...v];
    for (const [s, t] of Object.entries(m2.tops)) m.tops[s] = Object.fromEntries(Object.entries(t).map(([k, ms]) => [k, rnd(((m.tops[s]?.[k] || 0) + ms) / 2)]));
    m.problems.push(...m2.problems); m.confirmed = again;
    fs.writeFileSync(path.join(OUT, 'measured.json'), JSON.stringify(m, null, 1));
    now = summarize(m); rows = judge(base, now);
  }
  const bad = rows.filter((r) => r.verdict === 'REGRESSED');
  // a part asked for that measured nothing guards nothing: that fails too (its problems say why)
  const missing = rows.filter((r) => r.verdict === 'not measured' && PARTS.includes(r.d.part));
  log(`\nperfguard: now vs baseline (${base.when?.slice(0, 10)}, commit ${base.machine?.commit}); allowed = max(15 %, 3 × spread, floor)\n`);
  log(table(rows));
  if (bad.length) {
    log('\nLikely culprits (where the regressed part spends its time now: the top functions of its CPU profile by self time; for startup also its phases and the main process\'s IPC answer times; then what grew most):');
    const seen = new Set();
    for (const r of bad) { if (seen.has(r.d.section)) continue; seen.add(r.d.section); log(`  ${r.d.section} (${bad.filter((x) => x.d.section === r.d.section).map((x) => x.d.label).join(', ')}):`); log(culprits(r.d.section, base, m).join('\n') || '    (no profile)'); }
  }
  if (m.problems.length) log(`\nproblems:\n  ${m.problems.join('\n  ')}`);
  log(`\n${bad.length ? `✖ ${bad.length} regressed` : '✓ no regression'}${missing.length ? ` · ✖ ${missing.length} not measured` : ''} · ${rows.filter((r) => r.verdict === 'better').length} better · ${Math.round((Date.now() - t0) / 6000) / 10} min · ${path.join(opt('--from') ? path.resolve(opt('--from')) : OUT, 'measured.json')}`);
  process.exit(bad.length || missing.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(2); });
