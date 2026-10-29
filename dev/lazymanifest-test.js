#!/usr/bin/env node
// (round 85, manifest85) the lazy manifest is byte-stable and complete: dev/lazy-manifest.js --check runs twice (it
// writes nothing), each run must find lazy-data.js / lazy-meta.js up to date and the lazy build equal to the old order,
// no file may throw while the old order loads (follow-hook.js before FollowCore, projbundle.js before Projects), and
// the two runs must produce the same bytes for both files (--emit). A flapping manifest made /help, Ctrl/⌘+K and the
// keys sheet lose a command's words after a merge.
//   node dev/lazymanifest-test.js            (≈ 1 min: two recordings + two lazy builds in the headless app)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-lazymanifest-'));
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const runs = [];
try {
  for (const i of [1, 2]) {
    const emit = path.join(dir, `run${i}.json`);
    const t = Date.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, 'lazy-manifest.js'), '--check', '--emit', emit], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 900000 });
    const text = `${r.stdout || ''}${r.stderr || ''}`;
    const exceptions = text.split('\n').filter((l) => /^\s*exception: /.test(l));
    ok(!exceptions.length, `run ${i}: a file threw while the old order loaded:\n${exceptions.join('\n')}`);
    ok(r.status === 0, `run ${i}: lazy-manifest --check exited ${r.status}:\n${text.split('\n').filter((l) => /✖/.test(l)).join('\n') || text.slice(-3000)}`);
    ok(fs.existsSync(emit), `run ${i}: no --emit output`);
    const out = JSON.parse(fs.readFileSync(emit, 'utf8'));
    for (const f of ['lazy-data.js', 'lazy-meta.js']) ok(out[f] === fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'), `run ${i}: ${f} would change`);
    runs.push(out);
    console.log(`✓ run ${i}: up to date, no exceptions (${Math.round((Date.now() - t) / 1000)} s)`);
  }
  for (const f of ['lazy-data.js', 'lazy-meta.js']) ok(runs[0][f] === runs[1][f], `${f}: the two runs differ`);
  console.log('✓ both runs gave the same bytes for lazy-data.js and lazy-meta.js');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`lazymanifest-test: ${n} checks passed`);
