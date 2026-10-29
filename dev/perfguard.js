#!/usr/bin/env node
// (round 77, perfguard77) The performance guard: the gains of rounds 65–76 measured together, so they can't erode
// quietly. A short curated set (≈ 10–12 min on the shared 4-CPU test box) on the heavy owner-like profile
// (dev/bigprofile.js: 1,500 chats, 120 long ones, 50 Lab scenes… with 40 projects), each measurement repeated and
// taken as a median.
//   startup   dev/coldstart-report.js: a warm-up launch, then STARTS cold starts of the same copy (its caches warm, as
//             on the owner's computer) and one more with CPU profiles of both processes (the culprit list only)
//   app       dev/perfguard-probe.js through dev/smoke.js, RUNS launches: projects (cold / warm open, switch), chats
//             (list clicks, keys), Lab tool calls through the real MCP path, a still Lab scene's draws, idle CPU, heap
//   sync      dev/sync72-perf.js (Node only, Windows-slow disk), SYNC runs: steady / small-change passes' main-process
//             stalls and a steady pass's wall time
// (round 82, perfguard82) Load-aware: on this shared box the same tree came out 20–40 % "slower" whenever other agents
// kept the load ≈ 3, so the guard now
//   - measures CPU TIME beside the wall times (the main process's + the window's CPU for a start, the window thread's CPU per open /
//     switch / click / key, main + window CPU per Lab tool call, a sync pass's CPU): a busy box makes things wait,
//     it barely makes them cost more CPU. Wall times stay (they are what the owner feels) but are judged after
//     dividing by the CALIBRATION FACTOR: a fixed CPU + GC + layout micro-benchmark (dev/perfguard-calib.js) timed
//     before and after every step (and in the app's window at the start and end of each launch), against the same
//     benchmark when the baseline was recorded;
//   - records the load average and the calibration in its report (report.json) and REFUSES TO JUDGE when the box is
//     too loaded to tell (exit 3, "inconclusive"), instead of failing;
//   - has a PAIRED A/B MODE (--ab <base ref>, the recommended mode for release checks): a throwaway git worktree of the
//     base, base and new launched alternately in the same minutes, the difference judged with statistics (Mann–Whitney
//     on every sample, a launch-level bootstrap 95 % interval of the median difference) — no stored baseline at all.
// Compare mode (the default, against dev/perf-baseline.json): a metric REGRESSES when it is worse than the baseline by
// more than max(15 %, 3 × its recorded spread, its floor) — a wall time after dividing by the calibration factor; a wall
// time over the line whose own CPU time is fine, on a box slower than at the baseline, is "load?" (inconclusive), not a
// regression. A regression is measured again once (that part only, pooled) before it fails.
//   node dev/perfguard.js --ab origin/main --lock  # paired A/B against a base (release checks): exit 1 on a regression
//   node dev/perfguard.js                          # compare with dev/perf-baseline.json
//   node dev/perfguard.js --baseline               # measure and write dev/perf-baseline.json (after an intended change)
//   node dev/perfguard.js --only startup,sync      # some parts (a baseline written with --only keeps the other parts' rows)
//   node dev/perfguard.js --from <out dir>         # judge an earlier run's measurements again (no launches)
//   options: --out <dir> (logs, profiles, measurements, report.json; default <tmp>/hearth-perfguard) · --runs N (app
//   launches, 3; in A/B: per side) · --starts N (cold starts, 5; in A/B: per block, 3) · --sync N (sync runs, 3; in A/B:
//   per side) · --rounds N (A/B: startup blocks per side, 3) · --no-confirm · --lock (each app-launching step takes
//   /tmp/hearth-run.lock itself: for a run NOT already under `flock /tmp/hearth-run.lock`) · --file <baseline json> ·
//   --keep-base (A/B: keep the base worktree)
// Exit: 0 no regression · 1 regressed (or a part measured nothing) · 3 inconclusive (too loaded to tell, or a change
// too close to call) · 2 the guard itself failed.
// App-launching steps: 1 cold-start series (7 short launches) + RUNS app launches (A/B: 2 × (ROUNDS series + RUNS)).
//   flock /tmp/hearth-run.lock node dev/perfguard.js          (or PERFGUARD=1 node dev/run-checks.js perfguard)
// Rebaselining after an intended change: docs/upgrades/perfguard77.md ("Rebaselining"); load-aware judging and A/B:
// docs/upgrades/perfguard82.md.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { BENCH_SRC } = require('./perfguard-calib.js');

const DEV = __dirname;
const ROOT = path.join(DEV, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const OUT = path.resolve(opt('--out', path.join(os.tmpdir(), 'hearth-perfguard')));
const FILE = path.resolve(opt('--file', path.join(DEV, 'perf-baseline.json')));
const FIXTURE = opt('--fixture', '/tmp/hearth-bigprofile72'); // (run-checks makes the same one for projects72)
const SYNC_FIXTURE = opt('--sync-fixture', path.join(os.tmpdir(), 'hearth-sync72-bigprofile'));
const AB = opt('--ab');
const N = { runs: Number(opt('--runs', 3)), starts: Number(opt('--starts', AB ? 3 : 5)), sync: Number(opt('--sync', 3)), rounds: Number(opt('--rounds', 3)) };
const PARTS = (opt('--only', 'startup,app,sync')).split(',').map((s) => s.trim()).filter(Boolean);
const LOCK = has('--lock');
const CALIB = path.join(DEV, 'perfguard-calib.js');
const EXIT = { ok: 0, regressed: 1, error: 2, inconclusive: 3 };

// ---------- the metrics: lower is better for all; floor = the smallest change that can mean anything ----------
// section: where its culprits come from (the CPU profile of that part)
// kind (round 82): wall = a time the owner waits (judged after dividing by the calibration factor; `cpu` names its CPU
// twin) · cpu = CPU time (judged as is: a busy box barely moves it) · level = a count, a % of a CPU, a heap size
const METRICS = {
  'start.ready': { part: 'startup', label: 'Start → first usable chat', unit: 'ms', floor: 60, section: 'startup', kind: 'wall', cpu: 'start.cpuReady' },
  'start.settled': { part: 'startup', label: 'Start → settled (last long task)', unit: 'ms', floor: 120, section: 'startup', kind: 'wall', cpu: 'start.cpuSettled' },
  'start.cpuReady': { part: 'startup', label: 'Start → first screen: CPU, main + window', unit: 'ms', floor: 80, section: 'startup', kind: 'cpu' },
  'start.cpuSettled': { part: 'startup', label: 'Start → settled: CPU, main + window', unit: 'ms', floor: 120, section: 'startup', kind: 'cpu' },
  'project.coldOpen': { part: 'app', label: 'Project cold open (Hearth\'s part)', unit: 'ms', floor: 40, section: 'projects', kind: 'wall', cpu: 'project.coldOpenCpu' },
  'project.warmOpen': { part: 'app', label: 'Project warm open (Hearth\'s part)', unit: 'ms', floor: 40, section: 'projects', kind: 'wall', cpu: 'project.warmOpenCpu' },
  'project.switch': { part: 'app', label: 'Project switch (Hearth\'s part)', unit: 'ms', floor: 40, section: 'projects', kind: 'wall', cpu: 'project.switchCpu' },
  'project.coldOpenCpu': { part: 'app', label: 'Project cold open: window CPU', unit: 'ms', floor: 15, section: 'projects', kind: 'cpu' },
  'project.warmOpenCpu': { part: 'app', label: 'Project warm open: window CPU', unit: 'ms', floor: 15, section: 'projects', kind: 'cpu' },
  'project.switchCpu': { part: 'app', label: 'Project switch: window CPU', unit: 'ms', floor: 15, section: 'projects', kind: 'cpu' },
  'chat.switch': { part: 'app', label: 'Long chat opened from its list row', unit: 'ms', floor: 20, section: 'chats', kind: 'wall', cpu: 'chat.switchCpu' },
  'chat.switchCpu': { part: 'app', label: 'Long chat opened: window CPU', unit: 'ms', floor: 10, section: 'chats', kind: 'cpu' },
  'chat.clickHandler': { part: 'app', label: 'Chat list click: window handlers', unit: 'ms', floor: 3, section: 'chats', kind: 'wall', cpu: 'chat.clickThreadCpu' },
  'chat.clickCpu': { part: 'app', label: 'Chat list click: window busy in 600 ms', unit: 'ms', floor: 8, section: 'chats', kind: 'wall', cpu: 'chat.clickThreadCpu' },
  'chat.clickThreadCpu': { part: 'app', label: 'Chat list click: window CPU in 700 ms', unit: 'ms', floor: 8, section: 'chats', kind: 'cpu' },
  'chat.keyHandler': { part: 'app', label: 'Typing: window handlers per key', unit: 'ms', floor: 1, section: 'chats', kind: 'wall', cpu: 'chat.keyCpu' },
  'chat.keyCpu': { part: 'app', label: 'Typing: window CPU per key', unit: 'ms', floor: 1, section: 'chats', kind: 'cpu' },
  'lab.toolCall': { part: 'app', label: 'Lab tool call (no picture), end to end', unit: 'ms', floor: 8, section: 'lab', kind: 'wall', cpu: 'lab.toolCallCpu' },
  'lab.toolCallCpu': { part: 'app', label: 'Lab tool call: CPU, main + window', unit: 'ms', floor: 15, section: 'lab', kind: 'cpu' },
  'lab.stillDraws': { part: 'app', label: 'Still Lab scene: draws a second', unit: '/s', floor: 0.4, section: 'lab', kind: 'level' },
  'idle.windowCpu': { part: 'app', label: 'Idle on a chat: the window', unit: '% CPU', floor: 0.5, section: 'idle', kind: 'level' },
  'idle.allCpu': { part: 'app', label: 'Idle on a chat: every process', unit: '% CPU', floor: 1, section: 'idle', kind: 'level' },
  'mem.windowHeap': { part: 'app', label: 'Window JS heap after GC (end of run)', unit: 'MB', floor: 4, section: 'memory', kind: 'level' },
  'sync.steadyStall': { part: 'sync', label: 'Sync steady pass: main-process stall', unit: 'ms', floor: 10, section: 'sync', kind: 'wall', cpu: 'sync.steadyCpu' },
  'sync.changeStall': { part: 'sync', label: 'Sync small-change pass: main-process stall', unit: 'ms', floor: 10, section: 'sync', kind: 'wall', cpu: 'sync.changeCpu' },
  'sync.steadyWall': { part: 'sync', label: 'Sync steady pass: wall time', unit: 'ms', floor: 40, section: 'sync', kind: 'wall', cpu: 'sync.steadyCpu' },
  'sync.steadyCpu': { part: 'sync', label: 'Sync steady pass: CPU', unit: 'ms', floor: 40, section: 'sync', kind: 'cpu' },
  'sync.changeCpu': { part: 'sync', label: 'Sync small-change pass: CPU', unit: 'ms', floor: 40, section: 'sync', kind: 'cpu' },
};
// (round 82) when the box is too loaded to tell: the calibration benchmark more than LOAD.factor × slower than at the
// baseline, its runs waiting for a CPU (wall ÷ CPU) more than LOAD.wait, or the 1-minute load average over LOAD.load × the
// CPUs. Past those a wall time is not judged (compare mode) or nothing is (A/B) — exit 3, inconclusive.
const LOAD = { factor: 1.8, wait: 1.6, load: 1.75, unstable: 2.2, slower: 1.25 };

const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const mad = (xs) => { const m = median(xs); return m == null ? null : median(xs.filter(Number.isFinite).map((x) => Math.abs(x - m))); };
const rnd = (x) => (x == null || !Number.isFinite(x) ? null : Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 100) / 100);
const log = (...a) => console.log(...a);
const loadNow = () => os.loadavg().map((x) => Math.round(x * 100) / 100);
// a step: `node <args>` with the calibration benchmark before and after it (dev/perfguard-calib.js), under the run lock
// with --lock (so the calibration sees the same minutes as the step); app-launching steps only take the lock
function sh(a, calibFile, { lock = true, ...o } = {}) {
  const cmd = ['node', CALIB, '--json', calibFile, '--', 'node', ...a];
  return spawnSync(LOCK && lock ? 'flock' : cmd[0], LOCK && lock ? ['/tmp/hearth-run.lock', ...cmd] : cmd.slice(1), { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20, timeout: 1500000, ...o });
}
function readCalib(m, part, side, file, win) {
  let c = null; try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* the step died */ }
  m.calib.push({ part, side, before: c?.before || null, after: c?.after || null, win: win || null });
}

function machine() {
  const git = (a) => { try { return execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  let electron = null; try { electron = fs.readFileSync(path.join(path.dirname(process.env.ELECTRON || '/opt/hearth-electron/electron'), 'version'), 'utf8').trim(); } catch { /* unknown */ }
  return {
    cpus: os.cpus().length, cpu: os.cpus()[0]?.model || '?', memGB: Math.round(os.totalmem() / 1073741824), platform: `${os.platform()} ${os.release()}`,
    node: process.version, electron, gl: 'SwiftShader (software) under Xvfb', commit: git(['rev-parse', '--short', 'HEAD']), dirty: Boolean(git(['status', '--porcelain', '--untracked-files=no'])),
    loadStart: loadNow(),
  };
}

// ---------- the parts ----------
// side: { name: 'new' | 'base', root: the checkout whose app is launched } (compare mode: always this checkout)
const THIS = { name: 'new', root: ROOT };
function ensureFixture() {
  if (fs.existsSync(path.join(FIXTURE, 'kv', 'projects.json'))) return;
  log(`making the fixture ${FIXTURE} (dev/bigprofile.js --projects 40)…`);
  execFileSync('node', [path.join(DEV, 'bigprofile.js'), FIXTURE, '--projects', '40'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
}

function startup(m, tag, side = THIS) {
  const json = path.join(OUT, `startup${tag}.json`); const prof = path.join(OUT, `startup${tag}-profiles`);
  const profiled = !AB; // (A/B: no profiled start; the culprits are the start's phases and IPC answers)
  log(`startup${side === THIS ? '' : ` [${side.name}]`}: a warm-up launch + ${N.starts} cold starts${profiled ? ' + 1 profiled' : ''} (dev/coldstart-report.js)…`);
  const r = sh([path.join(DEV, 'coldstart-report.js'), '--app', side.root, '--data', FIXTURE, '--runs', String(N.starts + (profiled ? 1 : 0)), '--json', json, ...(profiled ? ['--profile', prof] : [])], path.join(OUT, `startup${tag}-calib.json`));
  fs.writeFileSync(path.join(OUT, `startup${tag}.log`), `${r.stdout || ''}${r.stderr || ''}`);
  readCalib(m, 'startup', side.name, path.join(OUT, `startup${tag}-calib.json`));
  let j = null; try { j = JSON.parse(fs.readFileSync(json, 'utf8')); } catch { m.problems.push(`startup${tag}: no measurements (exit ${r.status}; ${path.join(OUT, `startup${tag}.log`)})`); return; }
  const runs = profiled ? j.runs.slice(0, -1) : j.runs; // (the profiled one is slower: culprits only)
  // every start is its own launch: one sample each
  for (const run of runs) {
    push(m, 'start.ready', [run.ready]); push(m, 'start.settled', [run.settled]);
    // (Hearth's own processes: the main process + the window. Not the GPU process: here it is SwiftShader, software GL
    // whose worker threads spin while they wait, so its CPU grows with the box's load — on the owner's Mac it's a GPU)
    const own = (c) => (c && Number.isFinite(c.browser) && Number.isFinite(c.renderer) ? c.browser + c.renderer : NaN);
    push(m, 'start.cpuReady', [own(run.cpu?.ready)]); push(m, 'start.cpuSettled', [own(run.cpu?.settled)]);
  }
  // culprits, waits: the start's phases (splash milestones) and how long the main process took to answer each IPC
  // channel in the first 5 s (medians over the starts): work off the main thread (the store thread reading chats) shows
  // here, not in the profiles
  const waits = new Map(); const addW = (k, v) => { if (Number.isFinite(v)) (waits.get(k) || waits.set(k, []).get(k)).push(v); };
  for (const run of runs) {
    const sp = Object.entries(run.splash || {}).filter(([, v]) => Number.isFinite(v)).sort((a, b) => a[1] - b[1]);
    sp.forEach(([k, v], i) => { if (i && !/features/.test(k)) addW(`start phase: ${sp[i - 1][0].replace('splash:', '')} → ${k.replace('splash:', '')}`, v - sp[i - 1][1]); });
    for (const [ch, x] of Object.entries(run.ipc || {})) if (!/^engine:/.test(ch)) addW(`ipc answered: ${ch} ×${x[0]}`, x[1]); // (engine:* look for the CLIs: seconds, in the background)
    for (const [ty, ms] of Object.entries(run.cpu?.ready || {})) if (ty === 'browser' || ty === 'renderer') addW(`CPU to the first screen: ${ty} process`, ms); // (not the GPU process: SwiftShader here)
  }
  addTops(m, 'startup', [...waits].map(([k, v]) => [k, median(v)]), AB ? N.rounds : 1);
  if (!profiled) return;
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

// one app launch (dev/perfguard-probe.js, this checkout's, against side.root's app)
function appLaunch(m, tag, i, side = THIS, div = N.runs) {
  const dir = path.join(OUT, `app${tag}-${i}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const lib = path.join(OUT, 'calib-lib.js'); fs.writeFileSync(lib, `${BENCH_SRC}\n`);
  log(`app${side === THIS ? '' : ` [${side.name}]`}: launch ${i} (dev/perfguard-probe.js on the heavy profile, ≈ 2–2.5 min)…`);
  const t0 = Date.now();
  const r = sh([path.join(DEV, 'smoke.js'), '--app', side.root, '--fake-engines', '--data', FIXTURE, '--wait', '1000', '--check-timeout', '600000', '--tmp', path.join(dir, 'tmp'), '--lib', lib, '--script', path.join(DEV, 'perfguard-probe.js'), '--shot', path.join(dir, 'end.png')], path.join(dir, 'calib.json'));
  fs.writeFileSync(path.join(dir, 'smoke.log'), `${r.stdout || ''}${r.stderr || ''}`);
  let p = null; try { p = JSON.parse(fs.readFileSync(path.join(dir, 'tmp', 'perfguard-probe.json'), 'utf8')); } catch { m.problems.push(`app launch ${tag}${i}: no measurements (exit ${r.status}; ${path.join(dir, 'smoke.log')})`); }
  readCalib(m, 'app', side.name, path.join(dir, 'calib.json'), p?.calib);
  if (!p) return;
  for (const pr of p.problems || []) m.problems.push(`app launch ${tag}${i}: ${pr}`);
  for (const [k, xs] of Object.entries(p.samples || {})) if (METRICS[k]) push(m, k, xs);
  for (const [s, list] of Object.entries(p.tops || {})) addTops(m, s, list, div);
  (m.notes.app ||= []).push({ launch: `${tag}${i}`, side: side.name, secs: Math.round((Date.now() - t0) / 1000), ...p.notes });
}
function app(m, tag) { for (let i = 1; i <= N.runs; i++) appLaunch(m, tag, i); }

function syncRun(m, tag, i, side = THIS, div = N.sync) {
  log(`sync${side === THIS ? '' : ` [${side.name}]`}: run ${i} (dev/sync72-perf.js: the engine on the heavy profile, a Windows-slow disk, ≈ 35 s)…`);
  const cf = path.join(OUT, `sync${tag}-${i}-calib.json`);
  const r = sh([path.join(DEV, 'sync72-perf.js'), '--root', side.root, '--json', '--budget', '100000', '--fixture', SYNC_FIXTURE], cf, { lock: false, maxBuffer: 64 << 20, timeout: 900000 });
  fs.writeFileSync(path.join(OUT, `sync${tag}-${i}.log`), `${r.stdout || ''}${r.stderr || ''}`);
  readCalib(m, 'sync', side.name, cf);
  let j = null; try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { m.problems.push(`sync run ${tag}${i}: no measurements (exit ${r.status})`); return; }
  const steady = j.phases.filter((p) => /steady/.test(p.label)); const change = j.phases.filter((p) => /changed|saved|arrives|saves again|merge/.test(p.label));
  push(m, 'sync.steadyStall', steady.map((p) => p.delayMax)); push(m, 'sync.changeStall', change.map((p) => p.delayMax)); push(m, 'sync.steadyWall', steady.map((p) => p.ms));
  push(m, 'sync.steadyCpu', steady.map((p) => p.cpuMs)); push(m, 'sync.changeCpu', change.map((p) => p.cpuMs));
  const tops = new Map();
  for (const p of [...steady, ...change]) for (const b of p.blocks || []) for (const t of b.top || []) { const x = String(t).match(/^(\d+)ms (.+)$/); if (x) tops.set(x[2], (tops.get(x[2]) || 0) + Number(x[1])); }
  addTops(m, 'sync', [...tops], div);
}
function sync(m, tag) { for (let i = 1; i <= N.sync; i++) syncRun(m, tag, i); }

// a launch's (or a start's, or a sync run's) samples of a metric: one cluster. values = the clusters' medians (the
// compare mode's unit), raw = the clusters themselves (A/B's statistics)
function push(m, k, xs) { const c = (xs || []).filter(Number.isFinite).map(rnd); if (!c.length) return; (m.raw[k] ||= []).push(c); (m.values[k] ||= []).push(rnd(median(c))); }
function addTops(m, section, list, div) { const t = m.tops[section] ||= {}; for (const [k, ms] of list) t[k] = rnd((t[k] || 0) + ms / div); }
const topList = (t, n = 12) => Object.entries(t || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
const fresh = () => ({ values: {}, raw: {}, tops: {}, notes: {}, problems: [], calib: [] });

function measure(parts, tag = '') {
  const m = fresh();
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

// ---------- the calibration: how busy the box was, per part ----------
function calibOf(m, part, side) {
  const list = (m.calib || []).filter((c) => c.part === part && (!side || c.side === side));
  const node = list.flatMap((c) => [c.before, c.after]).filter(Boolean);
  const win = list.flatMap((c) => [c.win?.before, c.win?.after]).filter(Boolean);
  if (!node.length && !win.length) return null;
  const singles = node.map((c) => c.single).filter(Number.isFinite);
  return {
    n: node.length, single: rnd(median(singles)), par: rnd(median(node.map((c) => c.par))), win: rnd(median(win.map((c) => c.single))),
    wait: rnd(median(node.map((c) => c.cpuRatio))), load: rnd(Math.max(...node.map((c) => c.load).filter(Number.isFinite), 0)),
    loadavg: node.map((c) => c.loadavg?.[0]).filter(Number.isFinite), unstable: singles.length > 1 ? rnd(Math.max(...singles) / Math.min(...singles)) : 1,
  };
}
// how much slower the box is now than at the baseline: the geometric mean of the benchmark's ratios (app: the window's
// benchmark, with layout, in place of Node's single thread), null without a calibrated baseline
function factorOf(now, base, part) {
  if (!now || !base) return null;
  const r = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null);
  const one = part === 'app' && r(now.win, base.win) != null ? r(now.win, base.win) : r(now.single, base.single);
  const xs = [one, r(now.par, base.par)].filter((x) => x != null);
  return xs.length ? rnd(Math.min(3, Math.max(0.5, Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length)))) : null;
}
function loadGate(c, f) {
  const why = [];
  if (!c) return why;
  if (f != null && f > LOAD.factor) why.push(`the calibration ran ${f}× slower than at the baseline (> ${LOAD.factor}×)`);
  if (c.wait > LOAD.wait) why.push(`the calibration waited for a CPU (wall ${c.wait}× its CPU time, > ${LOAD.wait}×)`);
  if (c.load > LOAD.load) why.push(`load average ${rnd(c.load * os.cpus().length)} on ${os.cpus().length} CPUs (> ${LOAD.load} a CPU)`);
  if (c.unstable > LOAD.unstable) why.push(`the box changed speed during the part (calibration ${c.unstable}× apart)`);
  return why;
}
const calibLine = (c, f) => (c ? `calibration ${c.single} ms${c.win != null ? ` (window ${c.win} ms)` : ''}, 3 threads ${c.par} ms, waited ${c.wait}× · load ≤ ${rnd(c.load * os.cpus().length)}${f != null ? ` · ${f}× the baseline's` : ''}` : 'no calibration');

// ---------- compare mode ----------
// (round 82) a metric over the line must also be told apart from the noise: a one-sided Mann–Whitney test of every
// sample now (a time, wall or CPU, ÷ the calibration factor) against every sample of the baseline (p ≤ 0.05). Then:
//   CPU time / level over the line: REGRESSED when significant, else "unsure" (inconclusive)
//   wall time over the line and significant: REGRESSED — unless its CPU twin is fine (the extra time is waiting, not
//     work) AND the box is slower than at the baseline: then "load?" (inconclusive). A wall time over the line that is
//     NOT significant, with a fine CPU twin, is ok: this box's waits (software GL, other agents' disks) swing ±30 %
//     between sessions on their own. (A new timer or a lost cache on a box no slower than at the baseline still fails.)
function judge(base, now, ctx = {}) {
  const rows = [];
  for (const [k, d] of Object.entries(METRICS)) {
    if (ctx.parts && !ctx.parts.includes(d.part)) continue; // (a part not run this time: not listed)
    const b = base.metrics?.[k]; const c = now[k];
    if (!b || !c) { if (b || c) rows.push({ k, d, b, c, verdict: b ? 'not measured' : 'new (no baseline)' }); continue; }
    const tol = Math.max(0.15 * Math.abs(b.median), 3 * (b.spread || 0), d.floor);
    // (a CPU time too: the calibration runs without waiting for a CPU here — it measures how much work a CPU gets
    // through now, and a shared core's caches / sibling thread slow Hearth's CPU time by the same factor)
    const f = d.kind === 'wall' || d.kind === 'cpu' ? ctx.factor?.[d.part] ?? null : null;
    const scaled = f != null ? c.median / f : c.median;
    const delta = scaled - b.median;
    const bx = (base.raw?.[k] || []).flat(); const nx = (ctx.raw?.[k] || []).flat().map((x) => (f != null ? x / f : x));
    const p = bx.length && nx.length ? mannWhitney(bx, nx) : null;
    const sig = p == null || p <= ALPHA; // (a baseline without samples: the line alone, as before round 82)
    rows.push({ k, d, b, c, tol, delta, f, scaled, p, verdict: delta > tol ? (sig ? 'REGRESSED' : 'unsure') : delta < -tol ? 'better' : 'ok' });
  }
  for (const r of rows) {
    if (r.d.kind !== 'wall' || !r.d.cpu || (r.verdict !== 'REGRESSED' && r.verdict !== 'unsure')) continue;
    const twin = rows.find((x) => x.k === r.d.cpu);
    if (!twin || !['ok', 'better'].includes(twin.verdict)) continue; // (its CPU grew too, or isn't known: as judged)
    const slower = (ctx.factor?.[r.d.part] ?? 1) > LOAD.slower || (ctx.calib?.[r.d.part]?.wait ?? 1) > 1.15;
    r.why = `its CPU time (${twin.d.label}) is ${twin.verdict}`;
    if (r.verdict === 'unsure') { r.note = `over the line, but within the noise and by waiting, not work (${r.why})`; r.verdict = 'ok'; } else if (slower) r.verdict = 'load?';
  }
  for (const r of rows) if ((r.verdict === 'REGRESSED' || r.verdict === 'unsure') && ctx.gate?.[r.d.part]?.length) r.verdict = 'too loaded'; // (refused: the box can't tell)
  return rows;
}
function table(rows, ab) {
  const fmt = (x, u) => (x == null ? '—' : `${rnd(x)}${u === 'ms' ? ' ms' : u === 'MB' ? ' MB' : u === '/s' ? '/s' : u === '% CPU' ? ' %' : ''}`);
  const head = ab ? ['metric', 'base', 'new', 'change', 'p', '95 % interval', 'allowed', ''] : ['metric', 'baseline', 'now', 'now ÷ calib.', 'change', 'allowed', 'p', ''];
  const lines = [head.join(' | ')];
  for (const r of rows) {
    const bm = ab ? r.bm : r.b?.median;
    const pct = bm && r.delta != null ? `${r.delta >= 0 ? '+' : ''}${Math.round((r.delta / bm) * 100)} %` : '';
    const change = r.delta != null ? `${r.delta >= 0 ? '+' : ''}${fmt(r.delta, r.d.unit)} (${pct})` : '';
    lines.push((ab
      ? [r.d.label, fmt(r.bm, r.d.unit), fmt(r.nm, r.d.unit), change, r.p != null ? String(r.p) : '', r.ci ? `${fmt(r.ci[0], r.d.unit)} … ${fmt(r.ci[1], r.d.unit)}` : '', r.tol != null ? `+${fmt(r.tol, r.d.unit)}` : '', r.verdict]
      : [r.d.label, fmt(r.b?.median, r.d.unit), fmt(r.c?.median, r.d.unit), r.f != null ? fmt(r.scaled, r.d.unit) : '', change, r.tol != null ? `+${fmt(r.tol, r.d.unit)}` : '', r.delta > r.tol && r.p != null ? String(r.p) : '', r.verdict]).join(' | '));
  }
  const w = lines.map((l) => l.split(' | ')).reduce((a, cells) => cells.map((c, i) => Math.max(a[i] || 0, c.length)), []);
  return lines.map((l, j) => { const s = l.split(' | ').map((c, i) => (i ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  '); return j === 0 ? `${s}\n${'-'.repeat(s.length)}` : s; }).join('\n');
}
function culprits(section, base, now) {
  const b = base.tops?.[section] || {};
  // the top 8 now, then the 3 that grew most since the baseline (when not already listed)
  const top = topList(now.tops?.[section], 8); const listed = new Set(top.map(([k]) => k));
  const grew = Object.entries(now.tops?.[section] || {}).filter(([k]) => !listed.has(k)).map(([k, ms]) => [k, ms, ms - (b[k] || 0)]).filter((x) => x[2] > 0).sort((x, y) => y[2] - x[2]).slice(0, 3);
  return [...top, ...grew].map(([k, ms]) => { const was = b[k]; const d = was == null ? 'new in the top' : `${ms - was >= 0 ? '+' : ''}${rnd(ms - was)} ms vs ${base.name || 'baseline'}`; return `    ${String(rnd(ms)).padStart(6)} ms  ${k}  (${d})`; });
}

// ---------- A/B statistics ----------
// a small seeded generator: the same samples give the same interval
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
// Mann–Whitney U: one-sided p that `y` tends to be larger than `x` (exact by enumeration for small samples, else the
// normal approximation with the tie correction)
function mannWhitney(x, y) {
  const n1 = x.length; const n2 = y.length; if (!n1 || !n2) return null;
  const all = [...x.map((v) => [v, 0]), ...y.map((v) => [v, 1])].sort((a, b) => a[0] - b[0]);
  const rank = new Array(all.length); let ties = 0;
  for (let i = 0; i < all.length;) { let j = i; while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j += 1; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) rank[k] = rk; const t = j - i + 1; ties += t ** 3 - t; i = j + 1; }
  const ry = all.reduce((a, e, i) => a + (e[1] ? rank[i] : 0), 0);
  const U = ry - (n2 * (n2 + 1)) / 2; // pairs where y > x (ties half)
  if (n1 + n2 <= 16) { // exact: every way to pick n2 of the ranks
    const ranks = rank.slice(); let ge = 0; let tot = 0;
    const rec = (start, left, sum) => { if (!left) { tot += 1; if (sum >= ry - 1e-9) ge += 1; return; } for (let i = start; i <= ranks.length - left; i++) rec(i + 1, left - 1, sum + ranks[i]); };
    rec(0, n2, 0); return rnd(ge / tot);
  }
  const mu = (n1 * n2) / 2; const N2 = n1 + n2;
  const sd = Math.sqrt(((n1 * n2) / 12) * ((N2 + 1) - ties / (N2 * (N2 - 1))));
  if (!sd) return U > mu ? 0 : 1;
  const z = (U - mu - 0.5) / sd;
  return rnd(0.5 * erfc(z / Math.SQRT2));
}
function erfc(x) { const z = Math.abs(x); const t = 1 / (1 + 0.5 * z); const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
// a 95 % interval of median(new) − median(base): the launches resampled (a launch's samples move together)
function bootstrap(xc, yc, B = 2000) {
  if (!xc.length || !yc.length) return null;
  const g = rng(xc.flat().length * 7919 + yc.flat().length); const pick = (cl) => { const out = []; for (let i = 0; i < cl.length; i++) out.push(...cl[Math.floor(g() * cl.length)]); return out; };
  const d = []; for (let b = 0; b < B; b++) d.push(median(pick(yc)) - median(pick(xc)));
  d.sort((a, b) => a - b); return [rnd(d[Math.floor(0.025 * B)]), rnd(d[Math.floor(0.975 * B)])];
}
const ALPHA = 0.05;
function judgeAB(mb, mn) {
  const rows = [];
  for (const [k, d] of Object.entries(METRICS)) {
    if (!PARTS.includes(d.part)) continue;
    const xc = mb.raw[k] || []; const yc = mn.raw[k] || [];
    if (!xc.length || !yc.length) { if (xc.length || yc.length) rows.push({ k, d, verdict: 'not measured' }); continue; }
    const x = xc.flat(); const y = yc.flat(); const bm = median(x); const nm = median(y);
    const delta = nm - bm; const tol = Math.max(0.1 * Math.abs(bm), d.floor);
    const p = mannWhitney(x, y); const pBetter = mannWhitney(y, x); const ci = bootstrap(xc, yc);
    let verdict = 'ok';
    if (p <= ALPHA && ci[0] > 0 && delta > tol) verdict = 'REGRESSED';
    else if (pBetter <= ALPHA && ci[1] < 0 && -delta > tol) verdict = 'better';
    else if (delta > tol && (p < 0.2 || ci[0] > 0)) verdict = 'unsure'; // a change worth a look that the samples can't settle
    rows.push({ k, d, bm: rnd(bm), nm: rnd(nm), delta: rnd(delta), tol: rnd(tol), p, ci, nb: x.length, nn: y.length, launches: [xc.length, yc.length], verdict });
  }
  return rows;
}

// the base checkout for A/B: a throwaway git worktree of <ref> (detached), in the out folder
function makeBase(ref) {
  const dir = path.join(OUT, 'ab-base');
  const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`);
  try { git('worktree', 'remove', '--force', dir); } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true }); try { git('worktree', 'prune'); } catch { /* fine */ }
  git('worktree', 'add', '--detach', dir, sha);
  return { name: 'base', root: dir, ref, sha: sha.slice(0, 9), drop: () => { try { git('worktree', 'remove', '--force', dir); } catch { fs.rmSync(dir, { recursive: true, force: true }); try { git('worktree', 'prune'); } catch { /* fine */ } } } };
}
function measureAB(base) {
  const mb = fresh(); const mn = fresh(); const NEW = { name: 'new', root: ROOT };
  const order = (i) => (i % 2 ? [[NEW, mn], [base, mb]] : [[base, mb], [NEW, mn]]); // base, new · new, base · …
  if (PARTS.includes('startup') || PARTS.includes('app')) ensureFixture();
  if (PARTS.includes('startup')) for (let i = 0; i < N.rounds; i++) for (const [s, m] of order(i)) startup(m, `-${s.name}-${i + 1}`, s);
  if (PARTS.includes('app')) for (let i = 0; i < N.runs; i++) for (const [s, m] of order(i)) appLaunch(m, `-${s.name}`, i + 1, s, N.runs);
  if (PARTS.includes('sync')) for (let i = 0; i < N.sync; i++) for (const [s, m] of order(i)) syncRun(m, `-${s.name}`, i + 1, s, N.sync);
  return { mb, mn };
}

function writeReport(rep) { fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(rep, null, 1)}\n`); }

// ---------- main ----------
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const mins = () => Math.round((Date.now() - t0) / 6000) / 10;

  // ===== A/B =====
  if (AB) {
    const mach = machine();
    let base; try { base = makeBase(AB); } catch (err) { console.error(`perfguard --ab: can't make a worktree of ${AB}: ${String(err.stderr || err.message).trim()}`); process.exit(EXIT.error); }
    log(`perfguard A/B: ${mach.commit}${mach.dirty ? ' + changes' : ''} (new) vs ${AB} = ${base.sha} (base), ${PARTS.join(' + ')}, alternating · ${mach.cpus} CPUs, load ${mach.loadStart.join(' ')} · logs ${OUT}`);
    let ab;
    try { ab = measureAB(base); } finally { if (!has('--keep-base')) base.drop(); }
    const { mb, mn } = ab;
    const machEnd = { ...mach, loadEnd: loadNow(), minutes: mins() };
    fs.writeFileSync(path.join(OUT, 'measured.json'), JSON.stringify({ mode: 'ab', base: { ref: AB, sha: base.sha }, machine: machEnd, settings: { ...N, parts: PARTS }, sides: { base: mb, new: mn } }, null, 1));
    const rows = judgeAB(mb, mn);
    let stored = null; try { stored = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* none */ }
    const box = {}; const gate = {};
    for (const part of PARTS) {
      const cb = calibOf(mb, part, 'base'); const cn = calibOf(mn, part, 'new'); const all = calibOf({ calib: [...mb.calib, ...mn.calib] }, part);
      const f = factorOf(all, stored?.calib?.[part], part);
      const why = loadGate(all, f);
      if (cb && cn && cb.single && cn.single && Math.max(cb.single / cn.single, cn.single / cb.single) > 1.4) why.push(`the box's speed differed between the sides (calibration base ${cb.single} ms, new ${cn.single} ms)`);
      box[part] = { base: cb, new: cn, factor: f, tooLoaded: why }; gate[part] = why;
    }
    // a part too loaded to tell: what looked worse there isn't judged (what looked fine stays fine)
    for (const r of rows) if ((r.verdict === 'REGRESSED' || r.verdict === 'unsure') && gate[r.d.part]?.length) r.verdict = 'too loaded';
    const reg = rows.filter((r) => r.verdict === 'REGRESSED'); const unsure = rows.filter((r) => r.verdict === 'unsure' || r.verdict === 'too loaded');
    const missing = rows.filter((r) => r.verdict === 'not measured');
    const loaded = [...new Set(rows.filter((r) => r.verdict === 'too loaded').map((r) => r.d.part))];
    const verdict = reg.length || missing.length ? 'regressed' : unsure.length ? 'inconclusive' : 'ok';
    log(`\nperfguard A/B: new (${mach.commit}${mach.dirty ? ' + changes' : ''}) vs base (${AB} = ${base.sha}); every sample of each side, base and new launched in turn.`);
    log(`Regressed = Mann–Whitney p ≤ ${ALPHA}, the 95 % interval of the median difference above 0, and the difference over max(10 %, floor).\n`);
    log(table(rows, true));
    log('\nthe box:');
    for (const part of PARTS) log(`  ${part.padEnd(8)} base: ${calibLine(box[part].base)}\n  ${''.padEnd(8)} new:  ${calibLine(box[part].new, box[part].factor)}${gate[part].length ? `\n  ${''.padEnd(8)} ✖ too loaded to tell: ${gate[part].join('; ')}` : ''}`);
    if (reg.length) {
      log('\nLikely culprits (where the regressed part spends its time in the new tree, and what grew most vs the base):');
      const seen = new Set();
      for (const r of reg) { if (seen.has(r.d.section)) continue; seen.add(r.d.section); log(`  ${r.d.section} (${reg.filter((x) => x.d.section === r.d.section).map((x) => x.d.label).join(', ')}):`); log(culprits(r.d.section, { ...mb, name: 'base' }, mn).join('\n') || '    (no profile)'); }
    }
    const problems = [...mb.problems.map((p) => `base: ${p}`), ...mn.problems.map((p) => `new: ${p}`)];
    if (problems.length) log(`\nproblems:\n  ${problems.join('\n  ')}`);
    writeReport({ mode: 'ab', verdict, base: { ref: AB, sha: base.sha }, new: { commit: mach.commit, dirty: mach.dirty }, machine: machEnd, box, rows: rows.map(({ d, ...r }) => ({ label: d.label, unit: d.unit, kind: d.kind, ...r })), problems });
    const summary = verdict === 'inconclusive'
      ? `? inconclusive: ${unsure.map((r) => `${r.d.label} (${r.verdict === 'too loaded' ? 'too loaded to tell' : 'too close to call'})`).join(', ')}: run again on a quieter box${loaded.length ? '' : ', or with more --runs / --rounds'}`
      : verdict === 'regressed' ? `✖ ${reg.length} regressed${missing.length ? ` · ✖ ${missing.length} not measured` : ''}` : '✓ no regression';
    log(`\n${summary} · ${rows.filter((r) => r.verdict === 'better').length} better · ${mins()} min · ${path.join(OUT, 'report.json')}`);
    process.exit(EXIT[verdict]);
  }

  // ===== measure (compare / baseline) =====
  let m;
  if (opt('--from')) { m = JSON.parse(fs.readFileSync(path.join(path.resolve(opt('--from')), 'measured.json'), 'utf8')); m.calib ||= []; m.raw ||= {}; }
  else {
    const mach = machine();
    log(`perfguard: ${PARTS.join(' + ')} on ${mach.cpus} CPUs (load ${mach.loadStart.join(' ')}), commit ${mach.commit}${mach.dirty ? ' + changes' : ''} · logs ${OUT}`);
    m = measure(PARTS);
    m.machine = { ...mach, loadEnd: loadNow(), minutes: mins() };
    m.settings = { ...N, parts: PARTS, fixture: FIXTURE, syncFixture: SYNC_FIXTURE };
    fs.writeFileSync(path.join(OUT, 'measured.json'), JSON.stringify(m, null, 1));
  }
  let now = summarize(m);
  const parts = m.settings?.parts || PARTS;

  if (has('--baseline')) {
    let old = {}; try { old = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* the first one */ }
    const keep = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !PARTS.includes(METRICS[k]?.part || k)));
    const sections = new Set(Object.entries(METRICS).filter(([, d]) => PARTS.includes(d.part)).map(([, d]) => d.section));
    const base = {
      about: 'dev/perfguard.js baseline (round 77, perfguard77; calibration + CPU times from round 82, perfguard82): medians of per-launch values; spread = their median absolute deviation; calib = the calibration benchmark per part when it was recorded. Rebaseline: docs/upgrades/perfguard77.md',
      when: new Date().toISOString(), machine: m.machine, settings: m.settings,
      // when / where each part was last measured (a baseline written with --only keeps the others' rows and notes)
      parts: { ...(old.parts || {}), ...Object.fromEntries(PARTS.map((pt) => [pt, { when: new Date().toISOString(), commit: m.machine?.commit, dirty: m.machine?.dirty, load: [m.machine?.loadStart, m.machine?.loadEnd] }])) },
      calib: { ...(old.calib || {}), ...Object.fromEntries(PARTS.map((pt) => [pt, calibOf(m, pt)]).filter(([, c]) => c)) },
      metrics: { ...keep(old.metrics), ...now },
      raw: { ...keep(old.raw), ...Object.fromEntries(Object.entries(m.raw || {}).filter(([k]) => PARTS.includes(METRICS[k]?.part))) }, // (round 82) every sample, by launch
      tops: { ...Object.fromEntries(Object.entries(old.tops || {}).filter(([s]) => !sections.has(s))), ...Object.fromEntries(Object.entries(m.tops).map(([s, t]) => [s, Object.fromEntries(topList(t, 30))])) },
      problems: m.problems,
    };
    fs.writeFileSync(FILE, `${JSON.stringify(base, null, 1)}\n`);
    const w = Math.max(...Object.values(METRICS).map((d) => d.label.length));
    log(`\n${'metric'.padEnd(w)}  ${'median'.padStart(10)}  ${'spread (MAD)'.padStart(16)}  n\n${'-'.repeat(w + 34)}`);
    for (const [k, d] of Object.entries(METRICS)) if (now[k]) log(`${d.label.padEnd(w)}  ${`${now[k].median} ${d.unit}`.padStart(10)}  ${`±${now[k].spread} (${now[k].spreadPct} %)`.padStart(16)}  ${now[k].n}`);
    log('\nthe box:'); for (const pt of PARTS) log(`  ${pt.padEnd(8)} ${calibLine(base.calib[pt])}`);
    if (m.problems.length) log(`\nproblems:\n  ${m.problems.join('\n  ')}`);
    log(`\nbaseline written: ${FILE} (${mins()} min)`);
    process.exit(m.problems.length ? 1 : 0);
  }

  // ===== compare =====
  let base; try { base = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { console.error(`No baseline at ${FILE}: node dev/perfguard.js --baseline`); process.exit(EXIT.error); }
  const context = () => {
    const ctx = { calib: {}, factor: {}, gate: {}, parts };
    for (const part of parts) { const c = calibOf(m, part); ctx.calib[part] = c; ctx.factor[part] = factorOf(c, base.calib?.[part], part); ctx.gate[part] = loadGate(c, ctx.factor[part]); }
    return ctx;
  };
  let ctx = context();
  let rows = judge(base, now, { ...ctx, raw: m.raw });
  // a regression is measured again once (its part only, pooled): the box is shared and one bad minute isn't a regression
  const doubt = (r) => r.verdict === 'REGRESSED' || r.verdict === 'unsure' || r.verdict === 'load?';
  const again = [...new Set(rows.filter(doubt).map((r) => r.d.part))];
  if (again.length && !has('--no-confirm') && !opt('--from')) {
    log(`\n${rows.filter(doubt).map((r) => r.d.label).join(', ')}: over the line, measuring ${again.join(' + ')} again to confirm…`);
    const m2 = measure(again, '-again');
    for (const [k, v] of Object.entries(m2.values)) m.values[k] = [...(m.values[k] || []), ...v];
    for (const [k, v] of Object.entries(m2.raw)) m.raw[k] = [...(m.raw[k] || []), ...v];
    for (const [s, t] of Object.entries(m2.tops)) m.tops[s] = Object.fromEntries(Object.entries(t).map(([k, ms]) => [k, rnd(((m.tops[s]?.[k] || 0) + ms) / 2)]));
    m.problems.push(...m2.problems); m.calib.push(...m2.calib); m.confirmed = again;
    fs.writeFileSync(path.join(OUT, 'measured.json'), JSON.stringify(m, null, 1));
    now = summarize(m); ctx = context(); rows = judge(base, now, { ...ctx, raw: m.raw });
  }
  const bad = rows.filter((r) => r.verdict === 'REGRESSED');
  const unsure = rows.filter((r) => r.verdict === 'load?' || r.verdict === 'too loaded' || r.verdict === 'unsure');
  // a part asked for that measured nothing guards nothing: that fails too (its problems say why)
  const missing = rows.filter((r) => r.verdict === 'not measured' && parts.includes(r.d.part));
  const verdict = bad.length || missing.length ? 'regressed' : unsure.length ? 'inconclusive' : 'ok';
  log(`\nperfguard: now vs baseline (${base.when?.slice(0, 10)}, commit ${base.machine?.commit}); allowed = max(15 %, 3 × spread, floor); a time (wall or CPU) is judged ÷ the calibration factor (how much slower the box is than at the baseline)\n`);
  log(table(rows));
  log('\nthe box:');
  for (const part of parts) log(`  ${part.padEnd(8)} now:      ${calibLine(ctx.calib[part], ctx.factor[part])}\n  ${''.padEnd(8)} baseline: ${calibLine(base.calib?.[part])}${!base.calib?.[part] ? ' (recorded before round 82: wall times judged as measured)' : ''}${ctx.gate[part].length ? `\n  ${''.padEnd(8)} ✖ too loaded to tell its wall times: ${ctx.gate[part].join('; ')}` : ''}`);
  for (const r of rows.filter((x) => x.verdict === 'load?')) log(`  load?: ${r.d.label}: over the line, but ${r.why} and the box is slower than at the baseline`);
  for (const r of rows.filter((x) => x.note)) log(`  ok: ${r.d.label}: ${r.note}`);
  for (const r of rows.filter((x) => x.verdict === 'unsure')) log(`  unsure: ${r.d.label}: over the line, but not told apart from the noise (p ${r.p})`);
  if (bad.length) {
    log('\nLikely culprits (where the regressed part spends its time now: the top functions of its CPU profile by self time; for startup also its phases, the main process\'s IPC answer times and each process\'s CPU; then what grew most):');
    const seen = new Set();
    for (const r of bad) { if (seen.has(r.d.section)) continue; seen.add(r.d.section); log(`  ${r.d.section} (${bad.filter((x) => x.d.section === r.d.section).map((x) => x.d.label).join(', ')}):`); log(culprits(r.d.section, base, m).join('\n') || '    (no profile)'); }
  }
  if (m.problems.length) log(`\nproblems:\n  ${m.problems.join('\n  ')}`);
  const outDir = opt('--from') ? path.resolve(opt('--from')) : OUT;
  if (!opt('--from')) writeReport({ mode: 'compare', verdict, baseline: { when: base.when, commit: base.machine?.commit, calib: base.calib || null }, machine: m.machine, box: Object.fromEntries(parts.map((p) => [p, { now: ctx.calib[p], factor: ctx.factor[p], tooLoaded: ctx.gate[p] }])), rows: rows.map(({ d, ...r }) => ({ label: d.label, unit: d.unit, kind: d.kind, ...r })), problems: m.problems });
  const summary = verdict === 'inconclusive' ? `? inconclusive: ${unsure.length} metric(s) over the line on a box too busy to tell (${unsure.map((r) => r.d.label).join(', ')}) — run again on a quieter box, or use --ab <base>` : bad.length ? `✖ ${bad.length} regressed` : '✓ no regression';
  log(`\n${summary}${missing.length ? ` · ✖ ${missing.length} not measured` : ''} · ${rows.filter((r) => r.verdict === 'better').length} better · ${mins()} min · ${path.join(outDir, 'measured.json')}`);
  process.exit(EXIT[verdict]);
})().catch((err) => { console.error(err); process.exit(EXIT.error); });
