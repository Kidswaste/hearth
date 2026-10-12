#!/usr/bin/env node
// A stand-in for the GitHub CLI (gh), for the Report-to-the-developer tests (dev/devreport-test.js): never touches the
// network. Each call is appended to FAKE_GH_LOG (JSON lines: { args, body } with the --body-file's text read back).
//   FAKE_GH_MODE: ok (default) · noauth (not signed in) · nolabel (issue create fails until `label create` ran) · fail
//   FAKE_GH_STATE: a file noting that the label exists (nolabel mode)
const fs = require('fs');
const args = process.argv.slice(2);
const mode = process.env.FAKE_GH_MODE || 'ok';
const logFile = process.env.FAKE_GH_LOG;
const stateFile = process.env.FAKE_GH_STATE || `${logFile || '/tmp/fake-gh'}.state`;
const at = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
let body = null;
if (at('--body-file')) { try { body = fs.readFileSync(at('--body-file'), 'utf8'); } catch { body = '(unreadable)'; } }
if (logFile) fs.appendFileSync(logFile, `${JSON.stringify({ args, body })}\n`);
const out = (s) => { process.stdout.write(`${s}\n`); process.exit(0); };
const fail = (s, code = 1) => { process.stderr.write(`${s}\n`); process.exit(code); };
if (args[0] === '--version') out('gh version 2.50.0 (2024-05-29)\nhttps://github.com/cli/cli/releases/tag/v2.50.0');
if (args[0] === 'auth' && args[1] === 'status') { if (mode === 'noauth') fail('You are not logged into any GitHub hosts. To log in, run: gh auth login'); out('github.com\n  ✓ Logged in to github.com account someone (keyring)'); }
if (args[0] === 'label' && args[1] === 'create') { fs.writeFileSync(stateFile, 'label'); out(''); }
if (args[0] === 'issue' && args[1] === 'create') {
  if (mode === 'fail') fail('HTTP 502: Bad gateway');
  if (mode === 'nolabel' && !fs.existsSync(stateFile)) fail("could not add label: 'hearth-report' not found");
  out('\nCreating issue in kidswaste/hearth\n\nhttps://github.com/kidswaste/hearth/issues/42');
}
if (args[0] === 'issue' && args[1] === 'view') out(JSON.stringify(args[2] === '42' ? { state: 'CLOSED', stateReason: 'COMPLETED' } : { state: 'OPEN', stateReason: '' }));
fail(`fake gh: unknown command ${args.join(' ')}`);
