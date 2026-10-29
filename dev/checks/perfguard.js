// driver: node
// opt-in: PERFGUARD
// (round 77, perfguard77) The performance guard as a check: dev/perfguard.js measures the curated set (startup, projects,
// chat clicks / keys, Lab tool calls, a still Lab scene's draws, idle CPU, the window's heap, sync stalls) on the heavy
// profile and fails when one regressed; its table and the likely culprits are the log. ≈ 10–12 min (more when a
// regression is measured again to confirm it). Its fixture is /tmp/hearth-bigprofile72 (dev/bigprofile.js --projects 40:
// run-checks makes it once, as for projects72).
// (round 82, perfguard82) PERFGUARD_AB=<base ref> runs the paired A/B mode instead (the recommended one for release
// checks: base and this tree launched in turn, ≈ 20 min): PERFGUARD=1 PERFGUARD_AB=origin/main node dev/run-checks.js
// perfguard. When the guard can't tell (the box too loaded, or a change too close to call: its exit 3, "inconclusive")
// the check doesn't fail: it passes with a "skipped" note saying why, and the log has the guard's table.
// Opt-in: PERFGUARD=1 node dev/run-checks.js perfguard   (under flock /tmp/hearth-run.lock, as every app check — but
// with PERFGUARD_AB the guard takes the lock per launch itself: run it WITHOUT an outer flock)
//   node dev/checks/perfguard.js [--out <folder>]
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const i = argv.indexOf('--out');
const out = i >= 0 ? argv[i + 1] : path.join(require('os').tmpdir(), 'hearth-perfguard');
const ab = process.env.PERFGUARD_AB;
const r = spawnSync('node', [path.join(__dirname, '..', 'perfguard.js'), '--out', out, ...(ab ? ['--ab', ab, '--lock'] : [])], { stdio: 'inherit', timeout: ab ? 3600000 : 1700000 });
if (r.status === 3) {
  console.log(JSON.stringify({ skipped: [`perfguard: inconclusive (too loaded to tell, or too close to call): ${path.join(out, 'report.json')}`] }));
  process.exit(0);
}
process.exit(r.status == null ? 1 : r.status);
