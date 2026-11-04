#!/usr/bin/env node
// (round 119, datalock119) Hearth's data folder is locked for a chat whose access covers Hearth's own folder
// (docs/upgrades/datalock119.md). Plain Node, part of `unit`, no engine started, own temp folders only:
// a fake Hearth source folder (a copy of engines.js & co, mcp/) holding a fake data folder (a config with a fake
// key, another chat's file, an attachment), and a chat with Full access to that folder.
//   1. Claude: Hearth's check (access-rules.js, what the permission tool asks) refuses Write / Edit into data,
//      `rm`, Remove-Item, a `>` redirect, Copy-Item into it, reading the config / another chat, and allows editing
//      the source; Claude's own deny rules (--disallowedTools) cover the data folder but not workspace/
//   2. Astra: the app-server plan asks Hearth before edits / commands and Hearth declines the data folder (through
//      codex-server.js, as the app-server would ask); `codex exec` leaves the Hearth folder out of the writable roots
//   3. the wording: the refusal line, and the prompt line both engines get
//   node dev/datalock119-test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { EventEmitter } = require('events');

const ROOT = path.join(__dirname, '..');
const dir = require('./tmp-own').mkdtemp('datalock119-');
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'codex-capabilities.js', 'codex-server.js', 'access-rules.js', 'datalock.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const DATA = path.join(dir, 'data');
for (const d of ['chats', 'attachments', 'workspace', 'kv']) fs.mkdirSync(path.join(DATA, d), { recursive: true });
fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify({ apiKey: 'sk-FAKE-not-a-real-key-000000', theme: 'dark' }));
fs.writeFileSync(path.join(DATA, 'chats', 'other-chat.json'), '{"messages":[]}');
fs.writeFileSync(path.join(DATA, 'attachments', 'pic.png'), 'png');

const E = require(path.join(dir, 'engines.js'));
const T = E._test;
const R = require(path.join(dir, 'access-rules.js'));
const MSG = 'Hearth\'s data folder is off limits: your chats and settings live there.';
let checks = 0;
const ok = (cond, m) => { checks++; assert(cond, m); };

// ---------- 1. Claude ----------
const agent = (engine, level = 'full') => ({ id: `dl119${engine}`, name: 'Helper', mode: 'native', engine, access: { level, folders: [dir] } });
const locks = T.dataLocksOf(agent('claude'));
ok(locks.includes(DATA), `the fake source folder's data/ is locked (${locks})`);
const check = (tool, input, cwd = path.join(DATA, 'workspace')) => R.classify({ tool, input, level: 'full', folders: [dir], cwd, home: require('os').homedir(), locked: locks });
const refused = (tool, input, cwd) => { const c = check(tool, input, cwd); ok(c.verdict === 'deny' && c.locked && c.why === MSG, `${tool} ${JSON.stringify(input)} should be refused, got ${c.verdict}: ${c.why}`); };
const allowed = (tool, input, cwd) => { const c = check(tool, input, cwd); ok(c.verdict === 'allow', `${tool} ${JSON.stringify(input)} should go ahead, got ${c.verdict}: ${c.why}`); };
const cfg = path.join(DATA, 'config.json');
refused('Write', { file_path: cfg, content: '{}' });
refused('Edit', { file_path: path.join(DATA, 'chats', 'other-chat.json'), old_string: '[]', new_string: '[1]' });
refused('MultiEdit', { file_path: cfg, edits: [] });
refused('Bash', { command: `rm -rf ${path.join(DATA, 'chats')}` });
refused('Bash', { command: 'rm ../config.json' }); // from where Claude runs (data/workspace)
refused('Bash', { command: 'cd .. && rm -rf *' });
refused('Bash', { command: `echo '{}' > ${cfg}` });
refused('Bash', { command: `cd ${dir} && node -e "require('fs').writeFileSync('data/config.json', '{}')"` });
refused('PowerShell', { command: `Remove-Item -Recurse -Force ${path.join(DATA, 'kv')}` });
refused('PowerShell', { command: `Copy-Item ${path.join(dir, 'engines.js')} -Destination ${path.join(DATA, 'kv')}` });
refused('PowerShell', { command: `Get-Content ${cfg} > ${path.join(dir, 'leak.txt')}` });
refused('Read', { file_path: cfg });
refused('Read', { file_path: path.join(DATA, 'chats', 'other-chat.json') });
refused('Bash', { command: `cat ${cfg}` });
refused('Bash', { command: 'cat data/config.json', }, dir);
allowed('Edit', { file_path: path.join(dir, 'engines.js'), old_string: 'a', new_string: 'b' });
allowed('Write', { file_path: path.join(dir, 'new-core.js'), content: '' });
allowed('Read', { file_path: path.join(dir, 'engines.js') });
allowed('Read', { file_path: path.join(DATA, 'attachments', 'pic.png') }); // what the owner attached stays readable
allowed('Bash', { command: `cd ${dir} && node dev/run-checks.js --exact access-test` });
allowed('Bash', { command: `cp ${path.join(dir, 'engines.js')} ${path.join(dir, 'engines.bak')}` });
// the same rules in a plain project folder: nothing is locked there
ok(!T.dataLocksOf({ id: 'p', engine: 'claude', access: { level: 'full', folders: [path.join(dir, 'mcp')] } }).length, 'a folder that holds no data folder locks nothing');
// Claude reads its folders without asking Hearth: its own deny rules cover the data folder, not its workspace
const args = T.claudeToolArgs(agent('claude'), {}, {});
const denied = (args[args.indexOf('--disallowedTools') + 1] || '').split(',');
const rule = (p) => `/${p.split(path.sep).join('/')}`;
for (const r of [`Read(${rule(DATA)}/*.json)`, `Edit(${rule(DATA)}/*.json)`, `Read(${rule(path.join(DATA, 'chats'))}/**)`, `Edit(${rule(path.join(DATA, 'attachments'))}/**)`]) ok(denied.includes(r), `Claude's deny rules include ${r}`);
ok(!denied.some((r) => r.includes('/workspace')), 'the workspace (where Claude runs) stays open');
ok(!denied.includes(`Read(${rule(path.join(DATA, 'attachments'))}/**)`), 'attachments stay readable');
ok(args.includes('--permission-prompt-tool'), 'edits and commands still ask Hearth');
console.log('✓ Claude: Write / Edit / rm / Remove-Item / > / Copy-Item into data and reading its config or another chat are refused; the source stays editable; deny rules cover data/');

// ---------- 2. Astra ----------
const plan = T.codexServerPlan(agent('codex', 'write'), {}, {});
ok(plan.thread.approvalPolicy === 'untrusted' && plan.turn.approvalPolicy === 'untrusted', 'Astra asks Hearth before edits and commands on this chat');
ok(typeof plan.decide === 'function', 'and Hearth answers');
ok(plan.turn.sandboxPolicy.writableRoots.includes(dir), 'the source folder stays writable (self-edit)');
const { Connection } = require(path.join(dir, 'codex-server.js'));
// what the app-server would ask, answered through codex-server.js the way a run wires it (conn.decide)
const answers = [];
const fakeSpawn = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdout.setEncoding = c.stderr.setEncoding = () => {}; c.stdin = new EventEmitter(); c.stdin.write = (line) => { try { const m = JSON.parse(line); if (m.result?.decision) answers.push(m.result.decision); } catch { /* the handshake */ } }; return c; };
const ask = (method, params, item) => {
  const conn = new Connection({ spawn: fakeSpawn, kill: () => {}, bin: 'codex', args: [], cwd: dir, env: {} });
  conn.ready.catch(() => {});
  conn.decide = plan.decide;
  if (item) conn.read(`${JSON.stringify({ method: 'item/started', params: { item } })}\n`);
  conn.read(`${JSON.stringify({ id: 7, method, params })}\n`);
  conn.close();
  return answers.pop();
};
ok(ask('item/fileChange/requestApproval', { itemId: 'f1' }, { id: 'f1', type: 'fileChange', changes: [{ path: cfg, kind: { type: 'update' } }] }) === 'decline', 'a patch to data/config.json is declined');
ok(ask('item/fileChange/requestApproval', { itemId: 'f2' }, { id: 'f2', type: 'fileChange', changes: [{ path: path.join(dir, 'engines.js'), kind: { type: 'update' } }] }) === 'accept', 'a patch to engines.js goes ahead');
ok(ask('item/fileChange/requestApproval', { itemId: 'f3' }, null) === 'decline', 'a patch Hearth can\'t see is declined');
ok(ask('applyPatchApproval', { fileChanges: { [path.join(DATA, 'kv', 'x.json')]: {} } }) === 'denied', 'the older protocol: a patch into data is denied');
ok(ask('item/commandExecution/requestApproval', { itemId: 'c1', command: `/bin/bash -lc 'rm -rf ${DATA}'`, cwd: dir }) === 'decline', 'a command deleting data is declined');
ok(ask('execCommandApproval', { command: ['bash', '-lc', 'cp engines.js data/kv/'], cwd: dir }) === 'denied', 'a copy into data is denied');
ok(ask('item/commandExecution/requestApproval', { itemId: 'c2', command: 'node dev/run-checks.js --exact access-test', cwd: dir }) === 'accept', 'a test run in the source goes ahead');
const why = plan.decide('item/fileChange/requestApproval', { changes: [{ path: cfg }] }).why;
ok(why === MSG, `Astra's refusal says it plainly (${why})`);
// a plain folder keeps Codex's old settings
const plainPlan = T.codexServerPlan({ id: 'p', engine: 'codex', access: { level: 'write', folders: [path.join(dir, 'mcp')] } }, {}, {});
ok(plainPlan.thread.approvalPolicy === 'never' && !plainPlan.decide, 'other folders: no change');
// `codex exec` (the fallback transport) can't ask: the folder holding data isn't writable there
const exec = T.codexArgs(agent('codex', 'write'), {}, {});
const roots = exec.find((a) => /^sandbox_workspace_write\.writable_roots=/.test(a)) || '';
ok(roots && !roots.includes(JSON.stringify(dir).slice(1, -1)), `exec: the Hearth folder is left out of the writable roots (${roots})`);
console.log('✓ Astra: patches and commands into data are declined through codex-server.js; the source stays editable; exec leaves the folder read-only');

// ---------- 3. the wording ----------
ok(R.LOCK_MSG === MSG, 'the refusal line');
for (const engine of ['claude', 'codex']) {
  const line = Object.fromEntries(E.promptParts(agent(engine))).datalock || '';
  ok(line.includes(DATA) && /off limits/.test(line) && !line.includes('\n'), `${engine}: one prompt line names the data folder`);
}
console.log('✓ the refusal says "Hearth\'s data folder is off limits: your chats and settings live there."; both engines get one prompt line');
console.log(`datalock119-test: passed (${checks} checks)`);
