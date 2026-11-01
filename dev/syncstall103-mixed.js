// (round 103, syncstall103) Mixed versions: one computer of the two-computer simulator runs the PREVIOUS release's
// sync engine (sync-engine.js as it was before this round, from git, compiled as if it sat next to this one: its
// requires are this tree's, as dev/aside95-test.js does for round 94), the other this one. Loaded before a sync suite:
//   node -r ./dev/syncstall103-mixed.js dev/sync72-test.js            (the Mac on the previous release)
//   SYNCSTALL103_OLD=PC node -r ./dev/syncstall103-mixed.js dev/synchard74-test.js
// SYNCSTALL103_BASE: the git revision of the previous release (default: this round's base, 729f245).
// The previous engine not in this checkout (a shallow clone): says so and runs every computer on this one.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.SYNCSTALL103_BASE || '729f245';
const OLD = new Set(String(process.env.SYNCSTALL103_OLD || 'Mac').split(',').filter(Boolean));
let old = null;
try {
  const src = execFileSync('git', ['show', `${BASE}:sync-engine.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const Module = require('module'); const fname = path.join(ROOT, 'sync-engine.previous.js');
  const m = new Module(fname, module); m.filename = fname; m.paths = Module._nodeModulePaths(ROOT); m._compile(src, fname);
  old = m.exports;
} catch (err) { console.log(`(syncstall103-mixed: the previous engine (${BASE}) is not in this checkout: ${err.message.split('\n')[0]}; every computer runs this one)`); }
const p = require.resolve('../sync-engine'); const real = require(p);
let made = 0;
require.cache[p].exports = { ...real, createEngine: (o) => { if (old && OLD.has(o.machineName)) { made += 1; return old.createEngine(o); } return real.createEngine(o); } };
if (old) console.log(`(syncstall103-mixed: ${[...OLD].join(', ')} on the previous release's engine, ${BASE})`);
process.on('exit', () => { if (old) console.log(`(syncstall103-mixed: ${made} engines made on the previous release)`); });
