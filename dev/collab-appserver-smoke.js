// (round 67 fix) node dev/collab-appserver-smoke.js: a relay Astra → Claude with Astra on the app-server transport
// (dev/checks/collab-appserver.js), in a test copy like every smoke.
const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawnSync } = require('child_process');
const fwd = (p) => p.split(path.sep).join('/');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-collab-appserver-'));
const script = path.join(dir, 'check.js');
fs.writeFileSync(script, fs.readFileSync(path.join(__dirname, 'checks/collab-appserver.js'), 'utf8')
  .replaceAll('__FAKE_CODEX_SERVER__', fwd(path.join(__dirname, 'fake-codex-server.js')))
  .replaceAll('__FAKE_CLAUDE__', fwd(path.join(__dirname, 'fake-claude-astra.js'))));
const r = spawnSync(process.execPath, [path.join(__dirname, 'smoke.js'), '--script', script, '--wait', '1500', '--check-timeout', '90000'], { stdio: 'inherit', env: process.env });
process.exitCode = r.status || (r.error ? 1 : 0);
