#!/usr/bin/env node
// Report to the developer (round 21, devreport), plain Node: the masking (keys, tokens, passwords, e-mails, home
// folders, app paths in stacks), the dedupe key, the new-issue URL trimmed to fit, "Fixes #N" matching, and the main
// side against dev/fake-gh.js (args + the --body-file's text captured): issue create with the repo / label / title, the
// label made when the repo lacks it, not signed in / not installed, issue states, the update's commit messages and
// crashes kept across a reload.
//   node dev/devreport-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'devreport-core.js'));
const M = require(path.join(ROOT, 'devreportmain.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devreport-'));
let n = 0;
const ok = (c, what) => { assert.ok(c, what); n += 1; };

(async () => {
  // ---------- masking ----------
  const home = '/Users/ruby';
  const appDir = '/Users/ruby/Library/Application Support/Hearth';
  const raw = [
    'api_key=sk-live-1234567890abcdef password: hunter22 token="abc.def.ghi"',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    'gh: ghp_ABCDEFGHIJKLMNOPQRSTUV and github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123 and sk-ant-api03-abcdefghij',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    'url https://user:s3cret@example.com/x?token=zzz&page=2 mail ruby.i@gmail.com',
    '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAB3NzaC1yc2E\n-----END OPENSSH PRIVATE KEY-----',
    'opened /Users/ruby/Movies/clip.mp4 and C:\\Users\\Ruby\\agent-hub\\data\\x.json and /home/ruby/.config',
  ].join('\n');
  const m = C.mask(raw, { home, appDir });
  for (const secret of ['sk-live-1234567890abcdef', 'hunter22', 'abc.def.ghi', 'abcdefghijklmnopqrstuvwxyz012345', 'ghp_ABCDEFGHIJKLMNOPQRSTUV', 'github_pat_11ABC', 'sk-ant-api03', 'eyJhbGciOiJIUzI1NiJ9', 's3cret', 'zzz', 'ruby.i@', 'AAAAB3NzaC1yc2E', '/Users/ruby', 'C:\\Users\\Ruby', '/home/ruby']) ok(!m.includes(secret), `masked: ${secret}`);
  ok(m.includes('~/Movies/clip.mp4') && m.includes('page=2') && m.includes('@gmail.com'), 'file names and harmless parts are kept');
  // stacks: the app's own lines, app-relative, file:line
  const stack = `Error: boom\n    at send (file://${encodeURI(appDir)}/native.js:1387:12)\n    at async run (file://${encodeURI(appDir)}/tools/three.js:20:5)\n    at Array.map (<anonymous>)\n    at node:internal/process:1:1`;
  ok(JSON.stringify(C.appStack(stack, { home, appDir })) === JSON.stringify(['native.js:1387 send', 'tools/three.js:20 run']), `app stack: ${C.appStack(stack, { home, appDir })}`);
  const win = 'Error\n    at foo (file:///C:/Users/Ruby/agent-hub/ui.js:5:2)';
  ok(C.appStack(win, { home: 'C:\\Users\\Ruby', appDir: 'C:\\Users\\Ruby\\agent-hub' })[0] === 'ui.js:5 foo', 'Windows app stack');

  // ---------- dedupe ----------
  const k1 = C.keyOf("Couldn't load /Users/ruby/a.mp4 (code 4)");
  const k2 = C.keyOf("Couldn't load /Users/ruby/b.mp4 (code 7)");
  ok(k1 === k2, 'the same error with another path / number has one key');
  const sent = [{ key: k1, at: Date.now() - 3600e3, number: 12 }];
  ok(C.dupOf(sent, k2)?.number === 12, 'a report of that error today is a duplicate');
  ok(!C.dupOf([{ key: k1, at: Date.now() - 2 * 864e5 }], k2), 'two days later it isn\'t');
  ok(!C.dupOf(sent, C.keyOf('another error')), 'another error isn\'t');

  // ---------- body + URL ----------
  const r = { id: 'hr-abc123', title: 'T', what: 'it broke', doing: 'in the Lab', error: { message: 'boom', stack: ['native.js:1 send'] }, logs: { errors: ['2× boom'], jank: [], engine: ['claude x exit=1'] }, info: { head: 'abc1234', os: 'macOS', release: '15.1', arch: 'arm64', electron: '33', chrome: '130', node: '20', engines: 'Claude Code 2.1' }, steps: ['three_eval', 'three_screenshot'], chat: 'Owner: secret plan' };
  const b0 = C.body(r); const b1 = C.body(r, { chat: true });
  ok(!b0.includes('secret plan') && b1.includes('secret plan'), 'chat text only when ticked');
  ok(b0.includes('hearth-report hr-abc123') && b0.includes('abc1234') && b0.includes('three_eval, three_screenshot') && b0.includes('native.js:1 send') && b0.includes('Fixes #'), 'the body has the id, version, steps, stack and the developer note');
  const small = C.issueUrl('Title here', b0);
  ok(!small.trimmed && small.url.startsWith('https://github.com/kidswaste/hearth/issues/new?labels=hearth-report&title=Title%20here&body='), 'a short report fits the link');
  const big = C.issueUrl('Big', b0 + 'x'.repeat(20000) + 'é'.repeat(3000));
  ok(big.trimmed && big.url.length <= C.URL_MAX && decodeURIComponent(big.url.split('&body=')[1]).includes('the full report is on the clipboard'), `a long one is trimmed to fit (${big.url.length})`);

  // ---------- fixed in an update ----------
  const reps = [{ id: 'hr-aaaaaa', number: 12, state: 'open' }, { id: 'hr-bbbbbb', number: null, state: 'open' }, { id: 'hr-cccccc', number: 13, state: 'open' }, { id: 'hr-dddddd', number: 14, state: 'fixed' }];
  const fixed = C.fixedBy(['Lab: preview black after Shuffle\n\nFixes #12', 'chat: retry (closes hr-bbbbbb)', 'Fixes #14', 'mentions #13 only'], reps);
  ok(fixed.map((x) => x.id).join() === 'hr-aaaaaa,hr-bbbbbb', `Fixes #N and the report id match, a bare mention doesn't (${fixed.map((x) => x.id)})`);

  // ---------- main side with a fake gh ----------
  const log = path.join(tmp, 'gh.log');
  process.env.FAKE_GH_LOG = log;
  process.env.FAKE_GH_STATE = path.join(tmp, 'gh.state');
  M._setGh(path.join(__dirname, 'fake-gh.js'));
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const st = await M.gh();
  ok(st.installed && st.signedIn && st.version === '2.50.0', `gh found and signed in (${JSON.stringify(st)})`);
  const body = `${b0}\n\nwith "quotes" and $(no shell)`;
  const res = await M.send({ title: 'Lab: preview black', body });
  ok(res.ok && res.number === 42 && res.url === 'https://github.com/kidswaste/hearth/issues/42', `issue created (${JSON.stringify(res)})`);
  const create = calls().find((c) => c.args[0] === 'issue' && c.args[1] === 'create');
  const a = create.args;
  ok(a[a.indexOf('--repo') + 1] === 'kidswaste/hearth' && a[a.indexOf('--label') + 1] === 'hearth-report' && a[a.indexOf('--title') + 1] === 'Lab: preview black', `gh args: ${a.join(' ')}`);
  ok(create.body === body, 'the --body-file holds the report exactly');
  ok(!fs.existsSync(a[a.indexOf('--body-file') + 1]), 'the body file is removed afterwards');
  ok(!calls().some((c) => c.args[0] === 'label'), 'no label made when it exists');
  // the repo lacks the label: made, then the issue
  fs.writeFileSync(log, '');
  process.env.FAKE_GH_MODE = 'nolabel';
  const res2 = await M.send({ title: 'x', body: 'y' });
  const seq = calls().map((c) => c.args.slice(0, 2).join(' '));
  ok(res2.ok && seq.filter((s) => s === 'issue create').length === 2 && seq.includes('label create'), `label created when missing (${seq.join(' → ')})`);
  const lc = calls().find((c) => c.args[0] === 'label').args;
  ok(lc[2] === 'hearth-report' && lc[lc.indexOf('--repo') + 1] === 'kidswaste/hearth', 'the label is hearth-report on kidswaste/hearth');
  process.env.FAKE_GH_MODE = 'noauth';
  const res3 = await M.send({ title: 'x', body: 'y' });
  ok(!res3.ok && res3.reason === 'auth', 'not signed in: says so (the window falls back to the browser)');
  process.env.FAKE_GH_MODE = 'fail';
  const res4 = await M.send({ title: 'x', body: 'y' });
  ok(!res4.ok && res4.reason === 'failed' && /502/.test(res4.error), 'a failing gh reports its error');
  process.env.FAKE_GH_MODE = 'ok';
  M._setGh(path.join(tmp, 'no-such-gh'));
  const st2 = await M.gh();
  ok(!st2.installed && !st2.signedIn, 'no gh: not installed');
  M._setGh(path.join(__dirname, 'fake-gh.js'));
  const states = await M.states([42, 7, 'x']);
  ok(states[42] === 'fixed' && states[7] === 'open' && Object.keys(states).length === 2, `issue states (${JSON.stringify(states)})`);
  // the update's commit messages (this checkout's last commit)
  const { execFileSync } = require('child_process');
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const prev = execFileSync('git', ['rev-parse', '--short', 'HEAD~1'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const msgs = await M.log({ from: prev, to: head });
  ok(msgs.length >= 1 && typeof msgs[0] === 'string', 'commit messages between two versions');
  ok((await M.log({ from: 'HEAD;rm', to: head })).length === 0, 'refs are checked');
  const inf = await M.info();
  ok(inf.head === head && inf.node && inf.home === os.homedir() && inf.appDir === ROOT, 'info: version, versions, home, app folder');
  // crashes survive the reload, told once
  M._setCrashFile(path.join(tmp, 'crashes.json'));
  M.noteCrash('page', 'Hearth: crashed (code 5)');
  const c1 = M.takeCrashes(); const c2 = M.takeCrashes();
  ok(c1.length === 1 && c1[0].kind === 'page' && c2.length === 0, 'a crash is handed over once');

  console.log(`devreport-test: ${n} checks passed`);
})().catch((err) => { console.error(err.message); process.exit(1); });
