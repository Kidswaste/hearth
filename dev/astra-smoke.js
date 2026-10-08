#!/usr/bin/env node
// Runs dev/smoke.js with Astra's UI checks (dev/checks/astra-*.js) against the fake engines in this dev folder.
//   node dev/astra-smoke.js [checkName] [--shot out.png]      checkName: collab (default), ui, manager
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const name = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'collab';
const src = fs.readFileSync(path.join(__dirname, 'checks', `astra-${name}.js`), 'utf8')
  .replaceAll('__FAKE_CODEX__', path.join(__dirname, 'fake-codex-astra.js'))
  .replaceAll('__FAKE_CLAUDE__', path.join(__dirname, 'fake-claude-astra.js'))
  .replaceAll('__TMP__', os.tmpdir());
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'astra-check-')), 'check.js');
fs.writeFileSync(file, src);
const rest = process.argv.slice(2).filter((a) => a !== name);
const r = spawnSync(process.execPath, [path.join(__dirname, 'smoke.js'), '--script', file, '--wait', '6000', ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
