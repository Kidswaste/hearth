const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawnSync } = require('child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-workspace-ui-')); const script = path.join(dir, 'check.js');
fs.writeFileSync(script, fs.readFileSync(path.join(__dirname, 'checks/astra-workspace.js'), 'utf8').replaceAll('__ASTRA_FIXTURE__', path.join(__dirname, 'fake-codex-server.js').replaceAll('\\', '/')));
const r = spawnSync(process.execPath, [path.join(__dirname, 'smoke.js'), '--script', script, '--shot', path.join(dir, 'workspace.png'), '--wait', '1500'], { stdio: 'inherit', env: process.env });
process.exitCode = r.status || (r.error ? 1 : 0);
