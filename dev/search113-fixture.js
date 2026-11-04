#!/usr/bin/env node
// (round 113, search113) The app check's data (dev/checks/search113.js): the heavy owner-like profile with a giant chat
// (dev/bigprofile.js --projects 40 --giant 1: 2,200 chat files, 40 projects, Clink's 63 MB chat; the same as perfguard's
// /tmp/hearth-perf93-fresh, used as it is when it's there) + the query set's chats (dev/search113-queries.js: Kyoto,
// Café, the intro font decision in Clink, a long and a giant chat with a rare word, a chat in the Trash, a version kept
// aside, a .prev copy, a damaged file). Made up, a fixed seed; never real data. The base is linked, not copied (cp -al:
// no extra disk); every file this script writes is a new file (a linked one is unlinked first, so the base never changes).
//   node dev/search113-fixture.js [dir] [--base /tmp/hearth-perf93-fresh]        (default /tmp/hearth-search113)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Q = require('./search113-queries.js');

function make(dir = '/tmp/hearth-search113', base = '/tmp/hearth-perf93-fresh') {
  if (!fs.existsSync(path.join(base, 'chats', 'claude-giant0.json')) || !fs.existsSync(path.join(base, 'kv', 'projects.json'))) {
    execFileSync('node', [path.join(__dirname, 'bigprofile.js'), base, '--projects', '40', '--giant', '1'], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  try { execFileSync('cp', ['-al', base, dir]); } catch { fs.cpSync(base, dir, { recursive: true }); }
  // (a file of the base is never written through its link: unlinked, then written new)
  const safeFs = { ...fs, writeFileSync: (f, text) => { try { fs.unlinkSync(f); } catch { /* new */ } fs.writeFileSync(f, text); }, readFileSync: fs.readFileSync, mkdirSync: fs.mkdirSync };
  Q.addTo(dir, { fs: safeFs, giantN: 3200, giantPad: 48 }); // (the giant one ≥ 8 MB: read by its bytes, windowed when opened)
  return { dir, base, chats: fs.readdirSync(path.join(dir, 'chats')).length, giant: fs.statSync(path.join(dir, 'chats', 's113-giant.json')).size };
}
if (require.main === module) {
  const a = process.argv.slice(2); const bi = a.indexOf('--base');
  const base = bi >= 0 ? a[bi + 1] : undefined; const dir = a.find((x, i) => !x.startsWith('--') && (bi < 0 || i !== bi + 1));
  const t0 = Date.now(); console.log(JSON.stringify({ ...make(dir || undefined, base || undefined), ms: Date.now() - t0 }));
}
module.exports = { make };
