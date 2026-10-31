// driver: node
// (round 98, bundle98) A model made of several files, and an import / a copy that fails half-way. Two app runs, each on
// its own throwaway profile and empty data folder (dev/smoke.js), sharing only the folder the export is saved to:
//   1. dev/bundle98-src.js — a project whose scene's model is a glTF of several files (a .bin, textures in two folders,
//      one a folder up, one buffer missing) is exported; ⧉ Duplicate copies the model's folder whole (removing it in the
//      copy sends the folder to the Trash); Duplicate failing (a board's save, the project's own save) leaves nothing
//   2. dev/bundle98-dst.js — a FRESH profile imports it: every file in its layout, the missing one named; the same file
//      imported while a write fails, and cancelled from the card while it adds: nothing half-imported stays
//   node dev/checks/bundle98.js [--out <folder>]   (sh dev/run-checks.sh bundle98)
// The temp folder is short (/tmp/bd98/r…: the app copies, profiles, saves) and removed afterwards.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
fs.mkdirSync('/tmp/bd98', { recursive: true });
const BASE = fs.mkdtempSync('/tmp/bd98/r');
const SAVES = path.join(BASE, 's');
fs.mkdirSync(SAVES, { recursive: true });
const steps = []; const problems = [];
function run(script, label) {
  const tmp = path.join(BASE, label); fs.mkdirSync(tmp, { recursive: true });
  const r = spawnSync('node', [path.join(ROOT, 'dev', 'smoke.js'), '--check-timeout', '300000', '--save-dir', SAVES, '--tmp', path.join(tmp, 't'), '--script', path.join(ROOT, 'dev', script), '--shot', path.join(tmp, 'shot.png')],
    { cwd: ROOT, encoding: 'utf8', timeout: 900000, maxBuffer: 64 << 20, env: { ...process.env, TMPDIR: tmp, HEARTH_THREE_DIR: process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package' } });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  const line = text.split('\n').find((l) => l.startsWith('{"steps"'));
  let res = null; try { res = JSON.parse(line); } catch { /* no result */ }
  if (!res) { problems.push(`${label}: no result (exit ${r.status}) ${text.slice(-600)}`); console.log(`✖ ${label}: no result\n${text.slice(-1500)}`); return null; }
  for (const s of res.steps) {
    steps.push({ ...s, phase: label });
    console.log(`${s.ok ? '✓' : '✖'} [${label}] ${s.name}${s.ok ? '' : `  ${JSON.stringify(s.info ?? null).slice(0, 900)}`}`);
    if (!s.ok) problems.push(`${label}: ${s.name}`);
  }
  const pageProblems = (text.match(/\d+ problem\(s\):\n([\s\S]*?)(\n\n|$)/) || [])[1];
  if (r.status !== 0 && pageProblems) { problems.push(`${label}: page errors: ${pageProblems.slice(0, 300)}`); console.log(`✖ [${label}] page errors\n${pageProblems.slice(0, 1200)}`); }
  return res;
}
try {
  const a = run('bundle98-src.js', 'pc');
  if (a && fs.existsSync(path.join(SAVES, 'bd98-expect.json'))) run('bundle98-dst.js', 'fresh');
  else problems.push('fresh: not run (no bundle from the first run)');
} finally {
  fs.rmSync(BASE, { recursive: true, force: true });
}
const out = { pass: !problems.length, steps: steps.length, fails: problems };
console.log(JSON.stringify(out, null, 1));
process.exit(problems.length ? 1 : 0);
