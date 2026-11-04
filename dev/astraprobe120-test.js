#!/usr/bin/env node
// (round 120, astraprobe120) "Check Astra works like Claude" (parityprobe.js) end to end against the fake Codex
// app-server (dev/fake-codex-server.js): Hearth's real engines.js plan, codex-server.js and datalock.js answers, in a
// temp copy of Hearth (its own data folder), test folders in a temp folder of this test's own. Four runs:
//   1. all pass: the check phrase comes back (developer instructions), the file is on disk, data/x.txt refused and
//      src/ok.txt written; the approval requests are in the report as shapes; the test folders go to the "Trash"
//   2. the legacy fallback: a server that refuses developerInstructions → retried the older way, reported as legacy
//   3. the lock refuses too much: approval requests Hearth can't read the files of → src/ok.txt refused too, ✗ with the
//      raw shape in the report
//   4. not signed in: one line, need 'login', no message sent, nothing left in the temp folder
//   node dev/astraprobe120-test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const own = require('./tmp-own');
const app = own.mkdtemp('astraprobe120-app-');
for (const f of ['engines.js', 'codex-server.js', 'codex-workspace.js', 'codex-usage.js', 'codex-capabilities.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'connectionsmain.js', 'access-rules.js', 'datalock.js', 'parityprobe.js']) fs.copyFileSync(path.join(ROOT, f), path.join(app, f));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(app, 'mcp'), { recursive: true });
const fake = path.join(__dirname, 'fake-codex-server.js');
const engines = require(path.join(app, 'engines.js'));
engines.setEnginePaths({ codex: fake });
const Probe = require(path.join(app, 'parityprobe.js'));
const tmpRoot = own.mkdtemp('astraprobe120-tmp-');
const trashDir = own.mkdtemp('astraprobe120-trash-');
const trash = async (p) => fs.renameSync(p, path.join(trashDir, path.basename(p)));
let checks = 0;
const ok = (cond, m) => { checks++; assert(cond, m); };
const ENV = ['FAKE_SERVER_NO_DEV', 'FAKE_SERVER_APPROVAL', 'FAKE_CODEX_LOGGED_OUT'];
async function probe(env = {}) {
  for (const k of ENV) delete process.env[k];
  Object.assign(process.env, env);
  const steps = [];
  const r = await Probe.run({ engines, trash, tmpRoot, stepMs: 20000, onStep: (s) => steps.push(s) });
  ok(!fs.readdirSync(tmpRoot).length, `no test folder left behind (${fs.readdirSync(tmpRoot)})`);
  ok(steps.some((s) => s.state === 'running') && steps.filter((s) => s.state === 'done').length === r.steps.length, 'each step is shown as it runs, then its result');
  ok(!/sk-|eyJ|Bearer/.test(r.report) && !r.report.includes(app), 'the report has no secret and no Hearth path');
  return r;
}
const line = (r, id) => r.steps.find((s) => s.id === id) || {};

(async () => {
  // 1. all pass
  let r = await probe();
  ok(r.ok, `all lines pass:\n${r.report}`);
  ok(r.mode === 'developer' && /developer instructions/.test(line(r, 'prompt').text) && /Codex 0\.162\.0/.test(line(r, 'prompt').text), `mode and version named: ${line(r, 'prompt').text}`);
  ok(line(r, 'tools').ok && line(r, 'lock').ok && line(r, 'cleanup').ok, 'tools, lock, cleanup pass');
  ok(r.requests.length === 2 && r.requests[0].decision === 'decline' && r.requests[1].decision === 'accept', `data/ declined, src/ accepted (${JSON.stringify(r.requests)})`);
  ok(/item\/fileChange\/requestApproval → Hearth answered decline/.test(r.report) && /<test>\/data\/x\.txt/.test(r.report), "the raw request shapes, with test paths relative to <test>");
  ok(/"threadId":"<text 36>"/.test(r.report), 'ids are left out');
  ok(/thread\/start developerInstructions approvalPolicy=untrusted → ok/.test(r.report), 'the lock chat asked for approvals');
  ok(fs.readdirSync(trashDir).length === 2 && fs.existsSync(path.join(trashDir, fs.readdirSync(trashDir).find((d) => /lock/.test(d)), 'src', 'ok.txt')), 'the 2 test folders that held files went to the Trash with them (the empty one was simply removed)');
  console.log('✓ all pass: the check phrase came back (developer instructions, Codex 0.162.0), the file is on disk, data/ refused and src/ written, folders in the Trash');

  // 2. the legacy fallback
  r = await probe({ FAKE_SERVER_NO_DEV: '1' });
  ok(r.ok && r.mode === 'legacy', `legacy run passes as legacy:\n${r.report}`);
  ok(/older way: this Codex refused developer instructions/.test(line(r, 'prompt').text), line(r, 'prompt').text);
  ok(/thread\/start developerInstructions .*→ error: .*developerInstructions/.test(r.report) && /thread\/start baseInstructions .*→ ok/.test(r.report) && /Prompt channel used: legacy/.test(r.report), 'the report shows the refusal and the retry');
  console.log('✓ legacy: a server refusing developer instructions is retried the older way and reported as legacy');

  // 3. requests Hearth can't read → src/ refused too
  r = await probe({ FAKE_SERVER_APPROVAL: 'bare' });
  ok(!r.ok && line(r, 'prompt').ok && !line(r, 'lock').ok && /so was src/.test(line(r, 'lock').text), `the lock line fails in plain words: ${line(r, 'lock').text}`);
  ok(r.requests.length === 2 && r.requests.every((x) => x.decision === 'decline'), 'both were declined');
  ok(/✗ data\/ was refused, but so was src\//.test(r.report) && /"itemId":"<text \d+>"/.test(r.report), 'the report carries the shape Hearth could not read');
  console.log('✓ refused lock: requests without visible files decline src/ too → ✗ with the raw shape for Claude');

  // 4. not signed in
  r = await probe({ FAKE_CODEX_LOGGED_OUT: '1' });
  ok(!r.ok && r.need === 'login' && r.steps.length === 1 && /isn't signed in/.test(r.steps[0].text), `one line, sign in: ${JSON.stringify(r.steps)}`);
  ok(/Needs: sign in to Codex/.test(r.report), 'the report says so');
  for (const k of ENV) delete process.env[k];
  console.log('✓ not signed in: one line with the sign-in need, nothing sent');
  console.log(`astraprobe120-test: passed (${checks} checks)`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
