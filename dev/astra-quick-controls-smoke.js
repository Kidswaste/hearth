const fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-quick-controls-'));
const script = path.join(dir, 'check.js');
fs.writeFileSync(script, fs.readFileSync(path.join(__dirname, 'checks/astra-quick-controls.js'), 'utf8')
  .replaceAll('__ASTRA_FIXTURE__', path.join(__dirname, 'fake-codex-server.js').replaceAll('\\', '/')));
const r = require('child_process').spawnSync(process.execPath,
  [path.join(__dirname, 'smoke.js'), '--script', script, '--shot', path.join(dir, 'controls.png'), '--wait', '1500'],
  { stdio: 'inherit', env: process.env });
process.exitCode = r.status || (r.error ? 1 : 0);
