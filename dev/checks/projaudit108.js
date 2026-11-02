// driver: node
// (round 108, projaudit108) Project handling end to end, by clicks, after rounds 92–107 (docs/upgrades/projaudit108.md).
// App runs, each on its own throwaway profile and empty data folder (dev/smoke.js), sharing only the folder the export
// is saved to:
//   1. pc     dev/projaudit108-src.js — a project whose scene has a model made of several files (the Lab's own add);
//             exported from the Desk's ⋯; duplicated, the copy's scene and History edited, the copy deleted: the
//             original untouched
//   2. fresh  dev/projaudit108-dst.js — "the other computer": Projects › ⋯ › Import project… of that file; the project
//             opens; its scene opened from the Desk: the model's pictures show
//   3. start  dev/projaudit108-start.js — a project switched right after a start, before the Lab's code is in: the Lab
//             opens on that project's scene
//   4. giant  dev/projaudit108-big.js on dev/bigchat84-fixture.js's data (a 6,000-message chat in project "Clink"):
//             switch to it with the name ▾, Find in this project (a word in message #30, its row opens the chat on it),
//             ⇪ Export project…
// (The two-computer flows are dev/checks/projaudit108-sync.js and dev/projaudit108-test.js.)
//   node dev/checks/projaudit108.js [--only pc,fresh,start,giant] [--out <folder>]   (sh dev/run-checks.sh projaudit108)
// The temp folder is short (/tmp/pa108/r…: the app copies, profiles, saves, the giant fixture) and removed afterwards.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
fs.mkdirSync('/tmp/pa108', { recursive: true });
const BASE = fs.mkdtempSync('/tmp/pa108/r');
const SAVES = path.join(BASE, 's');
fs.mkdirSync(SAVES, { recursive: true });
const steps = []; const problems = [];
function run(script, label, extra = []) {
  const tmp = path.join(BASE, label); fs.mkdirSync(tmp, { recursive: true });
  const r = spawnSync('node', [path.join(ROOT, 'dev', 'smoke.js'), '--check-timeout', '600000', '--save-dir', SAVES, '--tmp', path.join(tmp, 't'), ...extra, '--lib', path.join(ROOT, 'dev', 'projaudit108-lib.js'), '--script', path.join(ROOT, 'dev', script), '--shot', path.join(tmp, 'shot.png')],
    { cwd: ROOT, encoding: 'utf8', timeout: 1500000, maxBuffer: 64 << 20, env: { ...process.env, TMPDIR: tmp, HEARTH_THREE_DIR: process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package' } });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  const line = text.split('\n').reverse().find((l) => l.startsWith('{"steps"'));
  let res = null; try { res = JSON.parse(line); } catch { /* no result */ }
  if (!res) { problems.push(`${label}: no result (exit ${r.status}) ${text.slice(-600)}`); console.log(`✖ ${label}: no result\n${text.slice(-1500)}`); return null; }
  for (const s of res.steps) {
    steps.push({ ...s, phase: label });
    const slow = /^slow steps/.test(s.name);
    console.log(`${s.ok ? '✓' : '✖'} [${label}] ${s.name}${!s.ok || slow ? `  ${JSON.stringify(s.info ?? null).slice(0, 900)}` : ''}`);
    if (!s.ok) problems.push(`${label}: ${s.name}`);
  }
  const pageProblems = (text.match(/\d+ problem\(s\):\n([\s\S]*?)(\n\n|$)/) || [])[1];
  if (r.status !== 0 && pageProblems) { problems.push(`${label}: page errors: ${pageProblems.slice(0, 300)}`); console.log(`✖ [${label}] page errors\n${pageProblems.slice(0, 1200)}`); }
  return res;
}
const want = (n) => !ONLY || ONLY.includes(n);
try {
  if (want('pc') || want('fresh')) {
    const a = run('projaudit108-src.js', 'pc');
    const exp = path.join(SAVES, 'pa108-expect.json');
    if (want('fresh')) {
      if (a && fs.existsSync(exp)) run('projaudit108-dst.js', 'fresh', ['--open', JSON.parse(fs.readFileSync(exp, 'utf8')).bundle]);
      else problems.push('fresh: not run (no bundle from the first run)');
    }
  }
  if (want('start')) run('projaudit108-start.js', 'start', ['--no-lazy-wait', '--wait', '800']);
  if (want('giant')) {
    const data = path.join(BASE, 'giant-data');
    const f = spawnSync('node', [path.join(ROOT, 'dev', 'bigchat84-fixture.js'), data], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    if (f.status !== 0) problems.push(`giant: the fixture wasn't made ${String(f.stderr).slice(-300)}`);
    else run('projaudit108-big.js', 'giant', ['--fake-engines', '--data', data, '--wait', '1000']);
  }
} finally {
  fs.rmSync(BASE, { recursive: true, force: true });
}
const out = { pass: !problems.length, steps: steps.length, fails: problems };
console.log(JSON.stringify(out, null, 1));
process.exit(problems.length ? 1 : 0);
