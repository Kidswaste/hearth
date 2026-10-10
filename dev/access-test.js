#!/usr/bin/env node
// Chat file access (round 14), Node only: the classifier (access-rules.js), the engine flags for each level (Claude:
// tools, folders, --permission-prompt-tool; Codex: sandbox / writable roots), the one-line prompt note, and real runs
// of the fake CLIs through mcp/access-mcp.js against a stub hub (silent allow, allow, deny, the Trash rewrite, password
// refusal, Hearth not running, an older Claude Code without the flag, Codex under its sandbox).
// engines.js + store.js + mcp/ are copied to a temp folder so nothing touches a real data/ folder.
//   node dev/access-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'access-rules.js'));
let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };

// ---------------------------------------------------------------- classifier
const F = ['/home/u/proj', '/home/u/art'];
const C = (tool, input, level = 'full', extra = {}) => R.classify({ tool, input, level, folders: F, cwd: '/data/ws', home: '/home/u', ...extra });
const bash = (command, level) => C('Bash', { command }, level);
const v = (r) => `${r.verdict}/${r.risk}/${r.action}`;

assert.strictEqual(C('Read', { file_path: '/home/u/proj/a.js' }).verdict, 'allow');
assert.strictEqual(C('Read', { file_path: '/home/u/art/x/y.png' }).verdict, 'allow');
assert.strictEqual(v(C('Read', { file_path: '/etc/hosts' })), 'ask/low/read');
assert.strictEqual(v(C('Read', { file_path: '/home/u/proj/.env' })), 'ask/high/secrets');
assert.strictEqual(C('Read', { file_path: '/home/u/projector/a' }).verdict, 'ask', 'a sibling folder with the same prefix is outside');
assert.strictEqual(C('Read', { file_path: '/home/u/proj/../other/a' }).verdict, 'ask', '.. is resolved');
assert.strictEqual(C('Grep', { pattern: 'x', path: '/home/u/proj' }).verdict, 'allow');
ok('reads: silent inside the folders, a card outside them or for secret files');

assert.strictEqual(C('Write', { file_path: '/home/u/proj/b.js' }).verdict, 'allow');
assert.strictEqual(C('Write', { file_path: '/home/u/proj/b.js' }).backup, '/home/u/proj/b.js');
assert.strictEqual(C('Edit', { file_path: 'src/c.js' }, 'write', { cwd: '/home/u/proj' }).verdict, 'allow', 'relative to the cwd');
assert.strictEqual(v(C('Write', { file_path: '/home/u/Desktop/x.txt' })), 'ask/high/write');
assert.strictEqual(C('Write', { file_path: '/home/u/proj/b.js' }, 'read').verdict, 'deny');
assert.strictEqual(C('Read', { file_path: '/home/u/proj/a.js' }, 'off').verdict, 'deny');
ok('writes: silent inside (with a backup path), a careful card outside, refused at Read / Off');

assert.strictEqual(bash('ls', 'write').verdict, 'deny');
for (const cmd of ['cd /home/u/proj && ls -la', 'cd "/home/u/proj" && npm run build', 'cd /home/u/proj && node build.js && git status', 'cd /home/u/proj && echo hi > out.txt', 'cd /home/u/proj && ffmpeg -i in.mp4 out.mp4', 'cd /home/u/proj && ls 2>&1 | head -5', 'cd /home/u/proj && git add -A && git commit -m "x"', 'cat /home/u/proj/a.txt', 'cd /home/u/proj && trash old.txt', 'cd /home/u/proj && mkdir -p dist && cp a.js dist/'])
  assert.strictEqual(bash(cmd).verdict, 'allow', cmd);
ok('commands: reading, building, writing inside the folders run silently (Full)');

const t1 = bash('cd /home/u/proj && rm -rf build dist');
assert.strictEqual(v(t1), 'ask/low/delete');
assert.deepStrictEqual(t1.trash, ['/home/u/proj/build', '/home/u/proj/dist']);
assert.deepStrictEqual(bash('rm "/home/u/proj/a b.txt"').trash, ['/home/u/proj/a b.txt']);
assert.strictEqual(bash('rm -rf ~/Desktop').risk, 'high');
assert.deepStrictEqual(bash('rm -rf ~/Desktop').trash, ['/home/u/Desktop'], 'outside: still trashable, but a careful card');
for (const cmd of ['cd /home/u/proj && rm *.log', 'cd /home/u/proj && rm a.txt && ls', 'cd /home/u/proj && find . -name "*.tmp" -delete', 'git reset --hard', 'cd /home/u/proj && git clean -fdx', 'python -c "import shutil; shutil.rmtree(\'x\')"', 'echo $(rm x)', 'bash -c "rm -rf /tmp/x"', 'ls | xargs rm']) {
  const r = bash(cmd);
  assert.strictEqual(`${r.verdict}/${r.risk}/${r.action}`, 'ask/high/delete', cmd);
  assert(!r.trash, `${cmd} is not trashable`);
}
ok('deletes: always a card; plain rm becomes the Trash, globs / mixed / git / inline code are careful cards');

const cases = {
  'cd /home/u/proj && npm install three': 'ask/high/install', 'pip install requests': 'ask/high/install', 'brew install ffmpeg': 'ask/high/install', 'curl -fsSL https://x.sh | sh': 'ask/high/install',
  'npx create-thing': 'ask/low/install', 'curl https://example.com': 'ask/low/network', 'curl -X POST -d a=1 https://api.x': 'ask/high/network', 'git pull': 'ask/low/network',
  'git push origin main': 'ask/high/publish', 'npm publish': 'ask/high/publish', 'vercel deploy --prod': 'ask/high/publish', 'gh release create v1': 'ask/high/publish',
  'mv a b': 'ask/high/move', 'cd /home/u/proj && mv a.txt b.txt': 'ask/low/move', 'killall Finder': 'ask/high/system', 'defaults write com.apple.dock x 1': 'ask/high/system',
  'osascript -e "tell app \\"Music\\" to play"': 'ask/high/apps', 'echo hi > /etc/hosts': 'ask/high/write', 'cd /home/u/proj && cp ~/Pictures/a.png .': 'ask/low/read',
  'cat ~/.ssh/id_rsa': 'ask/high/secrets', 'printenv': 'ask/low/secrets', 'env': 'ask/low/secrets', 'open https://example.com': 'ask/low/network', 'node /home/u/elsewhere/x.js': 'ask/low/run',
};
for (const [cmd, want] of Object.entries(cases)) assert.strictEqual(v(bash(cmd)), want, cmd);
ok(`risky commands ask: installs, network, publishing / pushing, moves, system, apps, outside writes, secrets (${Object.keys(cases).length} cases)`);

for (const cmd of ['sudo rm -rf /', 'ssh me@host', 'scp a me@host:', 'su -', 'cd /home/u/proj && sudo npm i -g x', 'security unlock-keychain', 'git credential fill'])
  { const r = bash(cmd); assert(r.verdict === 'deny' && r.password, cmd); }
ok('password prompts are refused (sudo, ssh, scp, su, keychain, git credential)');

assert.strictEqual(v(C('mcp__gmail__send_email', {})), 'ask/high/run');
assert.strictEqual(C('WebFetch', { url: 'x' }).action, 'network');
ok('other tools the CLI had to ask about show a card');

const red = R.redact('curl -H "Authorization: Bearer abcdefghijklmn" TOKEN=sk-abcdefghijklmnop https://u:pw@host/x password=hunter2 ghp_abcdefghijklmnopqrstu');
assert(!/abcdefghijklmn|hunter2|pw@|ghp_abc/.test(red) && /•••/.test(red), red);
ok('secrets are masked in what cards and logs show');

assert.strictEqual(R.norm('C:\\Users\\X\\..\\Y\\f.txt'), 'c:/users/y/f.txt');
assert(R.insideAny(R.norm('C:\\Proj\\Sub\\a.txt'), [R.norm('c:\\proj')]));
assert.strictEqual(R.classify({ tool: 'Write', input: { file_path: 'C:\\Proj\\a.txt' }, level: 'write', folders: ['C:\\proj'] }).verdict, 'allow');
assert.strictEqual(R.norm('~/x', '', '/home/u'), '/home/u/x');
ok('Windows paths (case, backslashes, drive letters) and ~ compare correctly');

const g1 = bash('cd /home/u/proj && rm a.txt b.txt'); const g2 = bash('rm /home/u/proj/sub/c.txt');
assert.strictEqual(g1.grant, g2.grant, 'one "allow deletes in this folder" covers both');
assert.notStrictEqual(bash('git push').grant, bash('npm install').grant);
assert.strictEqual(bash('sudo x').grant, null);
ok('"Allow for this chat" keys group alike requests (never for password commands)');

// ---------------------------------------------------------------- engines: flags and prompt
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'access-engine-'));
for (const f of ['engines.js', 'store.js', 'installs.js', 'access-rules.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const engines = require(path.join(dir, 'engines.js'));
const FAKE_CLAUDE = path.join(__dirname, 'fake-claude.js');
const FAKE_CODEX = path.join(__dirname, 'fake-codex.js');
engines.setEnginePaths({ claude: FAKE_CLAUDE, codex: FAKE_CODEX });
const T = engines._test;
T.loadDropped(FAKE_CLAUDE);
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'access-proj-'));
const art = fs.mkdtempSync(path.join(os.tmpdir(), 'access-art-'));
const claude = { id: 'claude', name: 'Claude', mode: 'native', engine: 'claude' };
const astra = { id: 'astra', name: 'Astra', mode: 'native', engine: 'codex' };
const withAcc = (a, level, folders = [proj]) => ({ ...a, access: { level, folders }, accessChatId: 'chat-1' });
const after = (args, flag) => args[args.indexOf(flag) + 1];
const strip = (args) => args.filter((x, i) => args[i - 1] !== '--session-id' && args[i - 1] !== '--mcp-config');

(async () => {
  const base = T.claudeArgs(claude, {}, {});
  assert.deepStrictEqual(strip(T.claudeArgs({ ...claude, access: { level: 'off', folders: [proj] } }, {}, {})), strip(base).map((x) => x));
  assert.strictEqual(T.buildPrompt({ ...claude, access: { level: 'off', folders: [proj] } }), T.buildPrompt(claude));
  assert(!base.includes('--permission-prompt-tool'));
  ok('access off: the same flags and prompt as before (no tokens added)');

  const rd = T.claudeArgs(withAcc(claude, 'read', [proj, art]), {}, {});
  assert.strictEqual(after(rd, '--tools'), 'Read,Glob,Grep');
  assert(rd.includes(proj) && rd.includes(art) && rd.includes('--restricted'));
  assert.strictEqual(after(rd, '--permission-prompt-tool'), 'mcp__access__access_permission');
  assert(!rd.includes('--allowedTools') || !/Read/.test(after(rd, '--allowedTools')), 'reads are free only inside the working dirs, not everywhere');
  const wr = T.claudeArgs(withAcc(claude, 'write'), {}, {});
  assert.strictEqual(after(wr, '--tools'), 'Read,Edit,Write,Glob,Grep');
  assert(!wr.includes('acceptEdits') && !wr.includes('--permission-prompts'), 'edits go through Hearth, not acceptEdits');
  const fu = T.claudeArgs(withAcc(claude, 'full'), {}, {});
  assert(/Bash/.test(after(fu, '--tools')) && !fu.includes('--restricted'));
  const cfg = JSON.parse(fs.readFileSync(after(fu, '--mcp-config'), 'utf8'));
  assert(cfg.mcpServers.access && /access-mcp\.js$/.test(cfg.mcpServers.access.args[0]) && cfg.mcpServers.access.env.HUB_ACCESS_CHAT === 'chat-1');
  assert(cfg.mcpServers.chat, 'the chat tools stay');
  ok('Claude: Read → read tools; Read & write → edits through the permission tool; Full → + Bash; folders as --add-dir');

  const missing = T.claudeArgs(withAcc(claude, 'write', ['/no/such/folder', proj]), {}, {});
  assert(!missing.includes('/no/such/folder') && missing.includes(proj));
  ok('folders that are gone are left out');

  const pOff = T.buildPrompt(claude).length;
  const lineW = T.buildPrompt(withAcc(claude, 'write')).length - pOff;
  const lineF = T.buildPrompt(withAcc(claude, 'full')).length - pOff;
  assert(lineW > 0 && lineW < 260 + proj.length && lineF < 360 + proj.length, `${lineW} / ${lineF}`);
  assert(!/You have no tools/.test(T.buildPrompt(withAcc(claude, 'read'))));
  assert.strictEqual(T.buildPrompt(withAcc(claude, 'full')).split('\n').filter((l) => /File access/.test(l)).length, 1);
  ok(`the prompt gets one line when access is on (~${Math.round(lineF / 4)} tokens at Full)`);

  const cr = T.codexArgs(withAcc(astra, 'read'), {}, {});
  assert(!cr.includes('shell_tool') && cr.includes('sandbox_mode="read-only"') && cr.includes('approval_policy="never"') && !cr.some((x) => /writable_roots/.test(x)));
  const cw = T.codexArgs(withAcc(astra, 'write', [proj, art]), {}, {});
  assert(cw.includes('sandbox_mode="workspace-write"') && cw.includes(`sandbox_workspace_write.writable_roots=[${JSON.stringify(proj)}, ${JSON.stringify(art)}]`) && cw.includes('sandbox_workspace_write.network_access=false'));
  assert.strictEqual(after(cw, '-s'), 'workspace-write');
  const cf = T.codexArgs(withAcc(astra, 'full'), {}, {});
  assert(cf.includes('sandbox_mode="workspace-write"') && cf.includes('sandbox_workspace_write.network_access=false'));
  const co = T.codexArgs({ ...astra, access: { level: 'off' } }, {}, {});
  assert(co.includes('shell_tool') && after(co, '-s') === 'read-only');
  assert(/\.hearth-trash/.test(T.buildPrompt(withAcc(astra, 'full'))));
  ok('Codex: Read → read-only sandbox with its shell; Read & write / Full → workspace-write on the folders, no network, no approvals');

  // ---------------------------------------------------------------- real runs: fake CLI → access-mcp → stub hub
  const calls = [];
  let answer = () => ({ behavior: 'allow' });
  const hub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { tool, args } = JSON.parse(body);
      calls.push({ tool, args });
      const c = R.classify({ tool: args.tool, input: args.input, level: 'full', folders: [proj], cwd: args.cwd, home: os.homedir() });
      let value;
      if (c.verdict === 'deny') value = { behavior: 'deny', message: c.why };
      else if (c.verdict === 'allow') value = { behavior: 'allow', updatedInput: args.input };
      else value = answer(c, args);
      res.end(JSON.stringify({ ok: true, value }));
    });
  });
  await new Promise((r) => hub.listen(0, '127.0.0.1', r));
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  const info = path.join(dir, 'data', 'game-bridge.json');
  fs.writeFileSync(info, JSON.stringify({ port: hub.address().port, token: 't' }));
  const turn = (agent, text, options = {}) => new Promise((resolve) => {
    const events = [];
    engines.send({ agent, chatId: 'chat-1', session: {}, text, options }, (e) => { events.push(e); if (!['delta', 'tool', 'thinking', 'progress'].includes(e.type)) resolve({ events, end: e, text: events.filter((x) => x.type === 'delta').map((x) => x.text).join('') }); });
  });
  fs.writeFileSync(path.join(proj, 'a.txt'), 'alpha');
  fs.writeFileSync(path.join(proj, 'c.txt'), 'charlie');
  const access = { level: 'full', folders: [proj] };
  const line = (cs) => `access: ${JSON.stringify(cs)}`;
  answer = (c) => (c.trash ? { behavior: 'allow', updatedInput: { command: 'echo "Hearth moved 1 item to the Trash (recoverable)."' } } : { behavior: 'deny', message: 'The user denied this.' });
  let r = await turn(claude, line([['Read', { file_path: path.join(proj, 'a.txt') }], ['Write', { file_path: path.join(proj, 'b.txt'), content: 'bravo' }], ['Bash', { command: `cd "${proj}" && rm c.txt` }], ['Bash', { command: 'sudo ls' }], ['Bash', { command: 'git push' }]]), { access });
  assert.strictEqual(r.end.type, 'done', JSON.stringify(r.end));
  const t = r.end.text;
  assert(/permission tool: yes/.test(t), t);
  assert(/Read: ran · alpha/.test(t) && /Write: ran/.test(t) && /Bash: ran · Hearth moved 1 item to the Trash/.test(t) && /Bash: denied · sudo can ask for a password/.test(t) && /Bash: denied · The user denied this/.test(t), t);
  assert.strictEqual(fs.readFileSync(path.join(proj, 'b.txt'), 'utf8'), 'bravo');
  assert(fs.existsSync(path.join(proj, 'c.txt')), 'the rm itself did not run (Hearth does it with the Trash)');
  assert(!calls.some((c) => c.args.tool === 'Read'), 'reads inside the folder never ask');
  assert(calls.every((c) => c.tool === 'access_check' && c.args.chatId === 'chat-1' && c.args.agentId === 'claude' && c.args.cwd));
  const ev = r.events.filter((e) => e.type === 'tool' && e.access);
  assert(ev.some((e) => e.access.action === 'read') && ev.some((e) => e.access.action === 'write') && ev.some((e) => e.access.action === 'run' && e.access.id));
  ok('Claude run: silent read, allowed write, rm → Trash rewrite, password refused, push denied; tool events carry what they touch');

  fs.rmSync(info);
  r = await turn(claude, line([['Write', { file_path: path.join(proj, 'd.txt'), content: 'x' }]]), { access });
  assert(/Write: denied · Hearth couldn't check this/.test(r.end.text) && !fs.existsSync(path.join(proj, 'd.txt')), r.end.text);
  ok('Hearth not running: the permission tool denies');
  fs.writeFileSync(info, JSON.stringify({ port: hub.address().port, token: 't' }));

  process.env.FAKE_CLAUDE_REJECT = '--permission-prompt-tool';
  r = await turn(claude, line([['Write', { file_path: path.join(proj, 'e.txt'), content: 'echo' }], ['Bash', { command: 'ls' }]]), { access });
  delete process.env.FAKE_CLAUDE_REJECT;
  assert(r.end.type === 'done' && /permission tool: none/.test(r.end.text) && /Write: ran/.test(r.end.text) && /Bash: denied · No such tool available/.test(r.end.text), r.end.text);
  assert(T.claudeDropped.has('--permission-prompt-tool'));
  const fb = T.claudeArgs(withAcc(claude, 'full'), {}, {});
  assert(!/Bash/.test(after(fb, '--tools')) && after(fb, '--permission-mode') === 'acceptEdits' && !fb.includes('--permission-prompt-tool'));
  assert(/can't run commands/.test(T.buildPrompt(withAcc(claude, 'full'))));
  ok('an older Claude Code without --permission-prompt-tool: retried without it, edits as before, no commands');
  fs.rmSync(path.join(dir, 'data', 'claude-flags.json'), { force: true });
  T.loadDropped('/no/other/claude'); T.loadDropped(FAKE_CLAUDE);
  assert(!T.claudeDropped.has('--permission-prompt-tool'));

  r = await turn(astra, line([['Write', { file_path: path.join(proj, 'f.txt'), content: 'fox' }], ['Write', { file_path: path.join(art, 'g.txt'), content: 'no' }], ['Bash', { command: `cd "${proj}" && ls` }]]), { access: { level: 'write', folders: [proj] } });
  assert(r.end.type === 'done' && /sandbox: workspace-write; roots: /.test(r.end.text) && /network: false/.test(r.end.text) && /approvals: "never"/.test(r.end.text), r.end.text);
  assert(fs.existsSync(path.join(proj, 'f.txt')) && !fs.existsSync(path.join(art, 'g.txt')));
  const cev = r.events.filter((e) => e.type === 'tool' && e.access);
  assert(cev.some((e) => e.access.changes?.[0]?.kind === 'add') && cev.some((e) => e.access.action === 'run'));
  r = await turn(astra, line([['Bash', { command: `touch "${path.join(proj, 'h.txt')}"` }]]), { access: { level: 'read', folders: [proj] } });
  assert(/sandbox: read-only/.test(r.end.text) && /shell: on/.test(r.end.text) && !fs.existsSync(path.join(proj, 'h.txt')), r.end.text);
  ok('Codex runs under the mapped sandbox (writes only in the folders, read-only at Read) and reports edits / commands for the log');

  r = await turn(claude, line([['Write', { file_path: path.join(proj, 'i.txt'), content: 'x' }]]), { access, lean: true });
  assert(/Write: denied · No such tool/.test(r.end.text));
  ok('lean runs (second opinions, collaborations) never get file access');

  hub.close();
  for (const d of [dir, proj, art]) fs.rmSync(d, { recursive: true, force: true });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((err) => { console.error(`FAIL ${err.stack || err.message}`); process.exit(1); });
