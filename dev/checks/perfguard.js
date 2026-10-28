// driver: node
// opt-in: PERFGUARD
// (round 77, perfguard77) The performance guard as a check: dev/perfguard.js measures the curated set (startup, projects,
// chat clicks / keys, Lab tool calls, a still Lab scene's draws, idle CPU, the window's heap, sync stalls) on the heavy
// profile and fails when one regressed past max(15 %, 3 × its spread, its floor) against dev/perf-baseline.json; its
// table and the likely culprits are the log. ≈ 10–12 min (more when a regression is measured again to confirm it).
// Its fixture is /tmp/hearth-bigprofile72 (dev/bigprofile.js --projects 40: run-checks makes it once, as for projects72).
// Opt-in: PERFGUARD=1 node dev/run-checks.js perfguard   (under flock /tmp/hearth-run.lock, as every app check)
//   node dev/checks/perfguard.js [--out <folder>]
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const i = argv.indexOf('--out');
const out = i >= 0 ? argv[i + 1] : path.join(require('os').tmpdir(), 'hearth-perfguard');
const r = spawnSync('node', [path.join(__dirname, '..', 'perfguard.js'), '--out', out], { stdio: 'inherit', timeout: 1700000 });
process.exit(r.status == null ? 1 : r.status);
