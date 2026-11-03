// driver: node
// (round 109, projopen109) An imported project's first open, measured piece by piece, and a project open that the Desk
// interrupts (docs/upgrades/projopen109.md). App runs, each on its own throwaway profile and empty data folder
// (dev/smoke.js), sharing only the folder the export is saved to:
//   1. pc     dev/projopen109-src.js — a project whose scene has two layers with their own frame loops and a model
//             made of several files; exported from the Desk's ⋯
//   2. fresh  dev/projopen109-dst.js — "the other computer": Projects › ⋯ › Import project… of that file; its first
//             open split into the Lab's code, the preview page's start, the first drawn scene, the model, textures
//             and shaders; then the Desk asked for mid-open (the 90 s "Warming shaders" hang), twice, and a reopen
//   3. menu   dev/projopen109-menu.js on projopen86's fixture, with 2 busy CPU processes beside it (--burn n): the
//             Desk's ⋯ and its rows clicked fast around a Desk redraw (round 108's "a ⋯ row that did nothing");
//             --nohold: the Desk drawn under a press as before this round
//   node dev/checks/projopen109.js [--only pc,fresh,menu] [--runs 2] [--app <dir>]   (sh dev/run-checks.sh projopen109)
//   --runs n: the fresh run n times (each on a fresh profile), its numbers listed per run · --app <dir>: another
//   checkout's app (a before: an archive of the base), run with this checkout's dev/
// The temp folder is short (/tmp/po109/r…) and removed afterwards.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ONLY = opt('--only') ? opt('--only').split(',') : null;
const RUNS = Math.max(1, Number(opt('--runs', 1)) || 1);
fs.mkdirSync('/tmp/po109', { recursive: true });
const BASE = fs.mkdtempSync('/tmp/po109/r');
const SAVES = path.join(BASE, 's');
fs.mkdirSync(SAVES, { recursive: true });
const steps = []; const problems = []; const numbers = [];
function run(script, label, extra = []) {
  const tmp = path.join(BASE, label); fs.mkdirSync(tmp, { recursive: true });
  const r = spawnSync('node', [path.join(ROOT, 'dev', 'smoke.js'), ...(opt('--app') ? ['--app', opt('--app')] : []), '--check-timeout', '900000', '--save-dir', SAVES, '--tmp', path.join(tmp, 't'), ...extra, '--lib', path.join(ROOT, 'dev', 'projaudit108-lib.js'), '--script', path.join(ROOT, 'dev', script), '--shot', path.join(tmp, 'shot.png')],
    { cwd: ROOT, encoding: 'utf8', timeout: 1500000, maxBuffer: 64 << 20, env: { ...process.env, TMPDIR: tmp, HEARTH_THREE_DIR: process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package' } });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  const line = text.split('\n').reverse().find((l) => l.startsWith('{"steps"'));
  let res = null; try { res = JSON.parse(line); } catch { /* no result */ }
  if (!res) { problems.push(`${label}: no result (exit ${r.status}) ${text.slice(-600)}`); console.log(`✖ ${label}: no result\n${text.slice(-1500)}`); return null; }
  for (const s of res.steps) {
    steps.push({ ...s, phase: label });
    const slow = /^slow steps/.test(s.name);
    if (slow) numbers.push({ run: label, ...s.info });
    console.log(`${s.ok ? '✓' : '✖'} [${label}] ${s.name}${!s.ok || slow ? `  ${JSON.stringify(s.info ?? null).slice(0, 4000)}` : ''}`);
    if (!s.ok) problems.push(`${label}: ${s.name}`);
  }
  const pageProblems = (text.match(/\d+ problem\(s\):\n([\s\S]*?)(\n\n|$)/) || [])[1];
  if (r.status !== 0 && pageProblems) { problems.push(`${label}: page errors: ${pageProblems.slice(0, 300)}`); console.log(`✖ [${label}] page errors\n${pageProblems.slice(0, 1200)}`); }
  return res;
}
const want = (n) => !ONLY || ONLY.includes(n);
try {
  const a = !(want('pc') || want('fresh')) ? null : want('pc') || !fs.existsSync(path.join(SAVES, 'po109-expect.json')) ? run('projopen109-src.js', 'pc') : null;
  const exp = path.join(SAVES, 'po109-expect.json');
  if (want('fresh')) {
    if (fs.existsSync(exp)) for (let i = 0; i < RUNS; i++) run('projopen109-dst.js', RUNS > 1 ? `fresh${i + 1}` : 'fresh', ['--no-lazy-wait', '--wait', '800', '--open', JSON.parse(fs.readFileSync(exp, 'utf8')).bundle]);
    else problems.push(`fresh: not run (no bundle from the first run${a ? '' : ': it gave no result'})`);
  }
  if (want('menu')) {
    const data = path.join(BASE, 'menu-data');
    const f = spawnSync('node', [path.join(ROOT, 'dev', 'projopen86-fixture.js'), data], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    if (f.status !== 0) problems.push(`menu: the fixture wasn't made ${String(f.stderr).slice(-300)}`);
    else run('projopen109-menu.js', 'menu', ['--fake-engines', '--data', data, '--wait', '1000', '--burn', opt('--burn', '2'), ...(argv.includes('--nohold') ? ['--eval', 'window.PO109_NOHOLD = 1'] : [])]);
  }
} finally {
  fs.rmSync(BASE, { recursive: true, force: true });
}
const firsts = numbers.filter((x) => x.first).map((x) => x.first.total);
const out = { pass: !problems.length, steps: steps.length, firstOpenMs: firsts, fails: problems };
console.log(JSON.stringify(out, null, 1));
process.exit(problems.length ? 1 : 0);
