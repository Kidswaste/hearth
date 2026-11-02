// (round 106, tmpclean106) A temp folder a dev script or test owns: made in os.tmpdir() like fs.mkdtempSync, and removed
// when the process ends, however it ends: a normal end, process.exit (a failed test exits 1), an uncaught error, or
// Ctrl-C / a kill (SIGINT / SIGTERM / SIGHUP, when nothing else listens for them). Before, a test that failed or was
// stopped half-way left its folder in /tmp (one per run; 300–400 MB for the profile-copying ones).
//   const { mkdtemp } = require('./tmp-own'); const dir = mkdtemp('hearth-foo-');
// `--keep` on the command line, or HEARTH_TMP_KEEP=1, keeps them (a test that has its own --keep prints the folder).
// Only folders made through here are removed: never a fixture, never a folder another run made.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const made = new Set();
const rmSync = fs.rmSync; // (taken before a test may wrap fs: dev/sync-sim.js)
const keep = () => process.argv.includes('--keep') || process.env.HEARTH_TMP_KEEP === '1';
function cleanup() {
  if (keep()) return;
  for (const d of made) { try { rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* a helper still writing: the run's temp root goes anyway */ } }
  made.clear();
}
let hooked = false;
function hook() {
  if (hooked) return; hooked = true;
  process.on('exit', cleanup);
  for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) {
    const on = () => {
      if (process.listenerCount(sig) > 1) return; // the script handles it too (and ends through process.exit → 'exit')
      cleanup(); process.exit(128 + n);
    };
    process.on(sig, on);
  }
}
// fs.mkdtempSync(path.join(os.tmpdir(), prefix)), removed at the end
function mkdtemp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.add(d); hook();
  return d;
}
// a folder made some other way (a fixed name in os.tmpdir()), removed at the end the same way
function own(dir) { made.add(dir); hook(); return dir; }

module.exports = { mkdtemp, own, cleanup };
