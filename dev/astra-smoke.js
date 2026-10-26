#!/usr/bin/env node
// Runs dev/smoke.js with Astra's UI checks (dev/checks/astra-*.js) against the fake engines in this dev folder.
//   node dev/astra-smoke.js [checkName] [--shot out.png]      checkName: collab (default), ui, manager
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// (round 67) Windows: paths go into the check's JS strings, so with forward slashes (a backslash would escape)
const fwd = (p) => p.split(path.sep).join('/');
const name = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'collab';
const src = fs.readFileSync(path.join(__dirname, 'checks', `astra-${name}.js`), 'utf8')
  .replaceAll('__FAKE_CODEX__', fwd(path.join(__dirname, 'fake-codex-astra.js')))
  .replaceAll('__FAKE_CLAUDE__', fwd(path.join(__dirname, 'fake-claude-astra.js')))
  .replaceAll('__TMP__', fwd(os.tmpdir()));
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'astra-check-')), 'check.js');
fs.writeFileSync(file, src);
const rest = process.argv.slice(2).filter((a) => a !== name);
// (round 48, bugbash3) fake-codex-astra.js speaks the exec JSONL only: Astra's default app-server transport (round 47)
// never got an answer from it and both checks hung. The app-server path is checked by astra-connect-smoke / codex-server-test.
const r = spawnSync(process.execPath, [path.join(__dirname, 'smoke.js'), '--script', file, '--wait', '6000', ...rest], { stdio: 'inherit', env: { ...process.env, HEARTH_CODEX_TRANSPORT: process.env.HEARTH_CODEX_TRANSPORT || 'exec' } });
process.exit(r.status ?? 1);
