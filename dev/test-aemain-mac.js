#!/usr/bin/env node
// Checks aemain.js's Mac paths on any OS: fakes process.platform = 'darwin' and a fake "/Applications"
// folder (via a temporary HOME/Applications, which aemain also searches), and a fake osascript on PATH.
//   node dev/test-aemain-mac.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-aemac-'));
const home = path.join(tmp, 'home');
const appDir = path.join(home, 'Applications', 'Adobe After Effects 2026');
fs.mkdirSync(path.join(appDir, 'Adobe After Effects 2026.app', 'Contents'), { recursive: true });
fs.writeFileSync(path.join(appDir, 'aerender'), '#!/bin/sh\necho "PROGRESS: Duration: 0:00:01:00"\nexit 0\n', { mode: 0o755 });
fs.mkdirSync(path.join(home, 'Applications', 'Adobe After Effects 2025 (Beta)', 'Adobe After Effects (Beta).app'), { recursive: true });
// osascript stand-in: logs its arguments, fails with -1743 when asked to.
const bin = path.join(tmp, 'bin');
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'osascript'), `#!/bin/sh\necho "$@" > "${tmp}/osascript.log"\nif [ -f "${tmp}/deny" ]; then echo "execution error: Not authorized to send Apple events to Adobe After Effects 2026. (-1743)" >&2; exit 1; fi\nexit 0\n`, { mode: 0o755 });
fs.writeFileSync(path.join(bin, 'mdfind'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
os.homedir = () => home;
Object.defineProperty(process, 'platform', { value: 'darwin' });

const ae = require('../aemain.js');
(async () => {
  const st = ae.status();
  assert.strictEqual(st.found, true, 'finds AE in ~/Applications');
  assert.strictEqual(st.dir, appDir, 'prefers the release over the Beta');
  assert.strictEqual(st.appName, 'Adobe After Effects 2026');
  assert.strictEqual(st.version, '2026');
  assert.ok(st.aerender.endsWith('/aerender'));
  const override = ae.status(path.join(appDir, 'Adobe After Effects 2026.app'));
  assert.strictEqual(override.dir, appDir, 'accepts the .app as an override');

  const { _test } = ae;
  assert.match(_test.macError('execution error: Not authorized to send Apple events (-1743)'), /Privacy & Security → Automation/);
  assert.match(_test.macError("Can't get application \"X\""), /couldn't find|Set its folder/);

  // runScript through the fake osascript
  const ipc = { handle: (name, fn) => { ipc[name] = fn; } };
  ae.registerIpc(ipc, () => null, () => undefined);
  const ok = await ipc['ae:run'](null, 'alert("hi")', 'test "quoted" label');
  assert.strictEqual(ok.ok, true, 'osascript accepted');
  const log = fs.readFileSync(path.join(tmp, 'osascript.log'), 'utf8');
  assert.match(log, /tell application "Adobe After Effects 2026"/);
  assert.match(log, /DoScriptFile ".*\.jsx"/);
  fs.writeFileSync(path.join(tmp, 'deny'), '');
  const denied = await ipc['ae:run'](null, 'alert(1)', 'x');
  assert.strictEqual(denied.ok, false);
  assert.match(denied.error, /Automation/);
  console.log('aemain Mac paths: OK', { dir: st.dir, aerender: st.aerender });
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((err) => { console.error(err); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
