#!/usr/bin/env node
// (round 111, signin111) Every way Claude Code / Codex say "you're signed out" ends in a working Sign in. Plain Node,
// no Electron, fake engines only (dev/fake-claude.js, dev/fake-codex.js): no real engine, no real credentials, no network.
//   1. the wordings: each sign-in / auth error either CLI prints (read from Claude Code 2.1's cli.js and Codex's
//      codex-rs sources) → friendlyError needsLogin (Windows / Mac / Linux) and offline-core's "Signed out" line;
//      ordinary errors (paths with 401, PowerShell's UnauthorizedAccess, an MCP server's 401, limits, proxies…) → not
//   2. the window: the exact argv for Windows (cmd's start, then PowerShell's Start-Process), the Mac (Terminal, then
//      the .command's own app) and Linux (each terminal found); cmd's 8191-character line, the title's quoting, ComSpec;
//      the attempts in order, each one logged; the Linux line run for real by sh
//   3. sign-in without a window: the engine's own link (only an https page of its own service), how it ended, the
//      engine checked again; nothing of the engine's output but its link (no state, no URL) goes to the log
//   4. Claude Code 2.1's JSON `auth status` read as signed in / out
//   node dev/signin111-test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

process.env.HEARTH_TEST_TERMINAL = '1';
const ROOT = path.join(__dirname, '..');
const dir = require('./tmp-own').mkdtemp('signin111-');
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'offline-core.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const engines = require(path.join(dir, 'engines.js'));
const T = engines._test;
const I = T.Installs;
const C = require(path.join(ROOT, 'offline-core.js'));
const FAKE = { claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') };
engines.setEnginePaths(FAKE);
const KV = path.join(dir, 'data', 'kv');
fs.mkdirSync(KV, { recursive: true });
const switches = (o) => fs.writeFileSync(path.join(KV, 'fake-switches.json'), JSON.stringify(o));
const LOG = path.join(dir, 'data', 'engine.log');

let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };

// ---------- 1. the wordings ----------
const SIGNED_OUT = {
  claude: [
    'Failed to authenticate: OAuth session expired and could not be refreshed', // the owner's, round 110
    'Not logged in · Please run /login',
    'Invalid API key · Please run /login',
    'OAuth token revoked · Please run /login',
    'OAuth token has expired. Please obtain a new token or refresh your existing token. · Please run /login',
    'API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired."}} · Please run /login',
    'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    'API Error: 403 {"type":"error","error":{"type":"permission_error","message":"OAuth authentication is currently not supported."}} · Please run /login',
    'Your account does not have access to Claude Code. Please run /login.',
    'Your account does not have access to Claude. Please login again or contact your administrator.',
    'Your organization does not have access to Claude. Please login again or contact your administrator.',
    'Session expired. Please run /login to sign in again.',
    'Your session has expired. Please run /login to sign in again.',
    'Please run /login and sign in with your Claude.ai account (not Console).',
    'Not logged in. Run claude auth login to authenticate.',
    '{"type":"result","subtype":"error","is_error":true,"result":"Invalid API key · Please run /login"}',
  ],
  codex: [
    'Your access token could not be refreshed because your refresh token has expired. Please log out and sign in again.',
    'Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.',
    'Your access token could not be refreshed because your refresh token was revoked. Please log out and sign in again.',
    'Your access token could not be refreshed. Please log out and sign in again.',
    'Your access token could not be refreshed because you have since logged out or signed in to another account. Please sign in again.',
    'Your refresh token has already been used to generate a new access token. Please try signing in again.',
    "Not signed in. Please run 'codex login'",
    'Not logged in. Please run codex login',
    'Not logged in',
    'Run `codex login`.',
    'Run codex login again or provide a supported auth env var.',
    'Fix auth storage access or run codex login again.',
    'ChatGPT auth is missing a refresh token',
    'ChatGPT auth is missing an access token',
    'Missing sign-in credentials',
    'Token data is not available.',
    'ChatGPT login is required, but an API key is currently being used.',
    'Failed to refresh token: 401 Unauthorized',
    'unexpected status 401 Unauthorized: {"detail":"Unauthorized"}, url: https://chatgpt.com/backend-api/codex/responses, request id: req-1',
    'unexpected status 401 Unauthorized: plain text error, url: https://chatgpt.com/backend-api/codex/models, auth error: missing_authorization_header, auth error code: token_expired',
    'exceeded retry limit, last status: 401 Unauthorized',
  ],
};
// ordinary errors: never a Sign in button
const NOT_SIGNED_OUT = [
  "Couldn't start Claude Code (ENOENT).",
  'Error: ENOENT: no such file or directory, open \'C:\\Users\\q\\Projects\\401\\notes.md\'',
  'File C:\\x\\a.ps1 cannot be loaded because running scripts is disabled on this system. FullyQualifiedErrorId : UnauthorizedAccess',
  'Unauthorized access to the path C:\\Windows is denied.',
  'MCP server "slack" requires re-authorization (token expired)',
  'MCP server "github" failed: 401 Unauthorized',
  'MCP server may or may not require login. Run `codex mcp login figma` to login.',
  'Credit balance is too low',
  'Claude AI usage limit reached|1760378400',
  "You've hit your usage limit. Upgrade to Pro or try again in 2 hours 13 minutes.",
  'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"rate limited"}}',
  'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
  'Proxy Authentication Required (407)',
  'tunneling socket could not be established, statusCode=407',
  'This model requires a newer version of Codex. Please upgrade to the latest version.',
  'model_not_found: the model `gpt-9` does not exist',
  'The conversation is too long for the model',
  'stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)',
  'Invalid MCP configuration:\nMCP config file not found: /tmp/x.json',
  'Amazon Bedrock rejected the request because its AWS signature has expired. Refresh your AWS credentials and retry.',
  'git push failed: Authentication failed for https://github.com/x/y (git credential)',
  'Invalid API key · Fix external API key',
  'Request timed out after 401 seconds of waiting? no: 4010 ms',
];
for (const [engine, list] of Object.entries(SIGNED_OUT)) {
  for (const text of list) {
    for (const [win, mac] of [[false, false], [true, false], [false, true]]) {
      const r = T.friendlyError(engine, text, { win, mac, bin: FAKE[engine] });
      assert(r.needsLogin, `${engine} (${win ? 'Windows' : mac ? 'Mac' : 'Linux'}): not seen as signed out: ${text}\n→ ${JSON.stringify(r)}`);
      assert(/isn't signed in/.test(r.message) && /Hearth never sees your password/.test(r.fix), JSON.stringify(r));
    }
    assert.strictEqual(C.classify(text)?.kind, 'signedout', `offline-core: ${text}`);
    // the other engine reads the same words the same way (an error can come from either side of a collaboration)
    assert(T.friendlyError(engine === 'claude' ? 'codex' : 'claude', text, { win: false, mac: false }).needsLogin);
  }
}
ok(`${SIGNED_OUT.claude.length} Claude Code and ${SIGNED_OUT.codex.length} Codex sign-in wordings → "isn't signed in" + Sign in (Windows, Mac, Linux) and the chat's "Signed out" line`);
for (const text of NOT_SIGNED_OUT) {
  for (const engine of ['claude', 'codex']) for (const [win, mac] of [[false, false], [true, false], [false, true]]) {
    const r = T.friendlyError(engine, text, { win, mac });
    assert(!r.needsLogin, `${engine}: wrongly seen as signed out: ${text}`);
  }
  assert.notStrictEqual(C.classify(text)?.kind, 'signedout', `offline-core: wrongly signed out: ${text}`);
}
ok(`${NOT_SIGNED_OUT.length} ordinary errors (a path with 401, PowerShell's UnauthorizedAccess, an MCP server's 401, limits, a proxy, git, Bedrock…) never get a Sign in button`);
let r = T.friendlyError('claude', 'Invalid API key · Fix external API key', { win: false, mac: false });
assert(!r.needsLogin && /ANTHROPIC_API_KEY/.test(r.fix), JSON.stringify(r));
r = T.friendlyError('codex', 'Invalid API key · Fix external API key', { win: false, mac: false });
assert(/OPENAI_API_KEY/.test(r.fix));
ok('a wrong API key set on this computer says to remove it (signing in would not help)');
assert(/astra-login/.test(T.friendlyError('codex', 'Not logged in').fix) && !/astra-login/.test(T.friendlyError('claude', 'Not logged in · Please run /login').fix));
ok('the fix line names the right command per engine (/astra-login only for Codex)');

// ---------- 2. the window ----------
const SCRIPT = I.psScript({ title: 'Sign in to Claude Code for Hearth', lines: ["& 'C:\\Users\\O''Brien\\AppData\\Roaming\\npm\\claude.cmd' auth login; if ($LASTEXITCODE -ne 0) { & 'C:\\Users\\O''Brien\\AppData\\Roaming\\npm\\claude.cmd' /login }"], marker: "C:\\Users\\O'Brien\\AppData\\Local\\Temp\\hearth-fix-claude-1.done" });
assert(SCRIPT.includes("Set-Content -LiteralPath 'C:\\Users\\O''Brien\\AppData\\Local\\Temp\\hearth-fix-claude-1.done' -Value done"), SCRIPT);
const WENV = { SystemRoot: 'C:\\WINDOWS', ComSpec: 'C:\\WINDOWS\\system32\\cmd.exe' };
const PS = 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
let plan = I.terminalPlan({ platform: 'win32', title: 'Sign in to "Claude" Code & 100% for Hearth^', script: SCRIPT, file: 'C:\\T\\hearth-term-x\\hearth.ps1', env: WENV });
const B64 = Buffer.from(SCRIPT, 'utf16le').toString('base64');
const ARGS = `-NoProfile -NoExit -ExecutionPolicy Bypass -EncodedCommand ${B64}`;
assert.deepStrictEqual(plan.attempts.map((a) => [a.how, a.cmd, ...a.args]), [
  ['start', 'C:\\WINDOWS\\system32\\cmd.exe', '/d', '/s', '/c', `"start "Sign in to Claude Code 100 for Hearth" "${PS}" ${ARGS}"`],
  ['Start-Process', PS, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `Start-Process -FilePath '${PS}' -ArgumentList '${ARGS}'`],
]);
assert(!plan.viaFile && plan.attempts[0].opts.windowsVerbatimArguments === true && plan.attempts[0].opts.detached === true && plan.attempts[0].opts.windowsHide === false);
assert(plan.attempts[1].opts.windowsVerbatimArguments !== true, 'Start-Process: Node quotes the -Command argument itself');
assert(/^[A-Za-z0-9+/=]+$/.test(B64) && Buffer.from(B64, 'base64').toString('utf16le') === SCRIPT, 'the encoded script is the script, in characters cmd never reads');
const line = `"${plan.attempts[0].cmd}" ${plan.attempts[0].args.join(' ')}`;
assert(line.length < I.CMD_MAX, `${line.length} characters`);
// what cmd /s does with it: strips the first and the last quote → start "<title>" "<powershell>" …
const inner = plan.attempts[0].args[3].slice(1, -1);
assert(/^start "[^"%^&|<>]*" "[^"]+powershell\.exe" -NoProfile /.test(inner), inner.slice(0, 120));
assert.strictEqual((inner.match(/"/g) || []).length, 4, 'exactly the title\'s and the program\'s quotes');
ok('Windows: cmd /d /s /c "start "<title>" "<powershell.exe>" … -EncodedCommand <base64>", then Start-Process with the same arguments (exact argv)');
assert.strictEqual(I.safeTitle('a"b%PATH%c^&|<>d'), 'abPATHcd');
assert.strictEqual(I.safeTitle(''), 'Hearth');
for (const spec of ['"C:\\WINDOWS\\system32\\cmd.exe"', 'C:\\Tools\\tcc.exe', '%SystemRoot%\\system32\\cmd.exe', '']) {
  const p = I.terminalPlan({ platform: 'win32', title: 'x', script: 'x', file: 'f', env: { SystemRoot: 'D:\\Win', ComSpec: spec } });
  assert.strictEqual(p.attempts[0].cmd, 'D:\\Win\\System32\\cmd.exe', `ComSpec ${spec}`);
}
assert.strictEqual(I.terminalPlan({ platform: 'win32', title: 'x', script: 'x', file: 'f', env: { windir: 'E:\\W', ComSpec: 'e:\\w\\SYSTEM32\\CMD.EXE' } }).attempts[0].cmd, 'e:\\w\\SYSTEM32\\CMD.EXE');
plan = I.terminalPlan({ platform: 'win32', title: 'x', script: 'x', file: 'f', env: WENV, has: () => false });
assert(plan.attempts[0].args[3].includes('"powershell.exe"') && plan.attempts[1].cmd === 'powershell.exe');
ok('ComSpec is used only when it names a cmd.exe (no quotes, no %VAR%); else %SystemRoot%\\System32\\cmd.exe; PowerShell by its full path when it is there');
const long = I.psScript({ title: 't', lines: [`Write-Host '${'x'.repeat(3200)}'`], marker: 'C:\\m' });
plan = I.terminalPlan({ platform: 'win32', title: 'Sign in', script: long, file: 'C:\\T\\h t\\hearth.ps1', env: WENV });
assert(plan.viaFile && plan.attempts[0].args[3] === `"start "Sign in" "${PS}" -NoProfile -NoExit -ExecutionPolicy Bypass -File "C:\\T\\h t\\hearth.ps1""`, plan.attempts[0].args[3]);
assert(plan.attempts[1].args[5] === `Start-Process -FilePath '${PS}' -ArgumentList '-NoProfile -NoExit -ExecutionPolicy Bypass -File "C:\\T\\h t\\hearth.ps1"'`);
ok('a script whose encoded line would pass cmd\'s 8191 characters runs from a .ps1 file (-File "<file>")');
plan = I.terminalPlan({ platform: 'darwin', title: 'x', file: '/var/folders/x/hearth-term-1/hearth.command' });
assert.deepStrictEqual(plan.attempts.map((a) => [a.cmd, ...a.args]), [['/usr/bin/open', '-a', 'Terminal', '/var/folders/x/hearth-term-1/hearth.command'], ['/usr/bin/open', '/var/folders/x/hearth-term-1/hearth.command']]);
ok('Mac: open -a Terminal <file>.command, then open <file>.command (whatever app opens them)');
const odd = path.join(dir, "it's here $HOME `x`");
fs.mkdirSync(odd, { recursive: true });
const shFile = path.join(odd, 'hearth.sh');
const shMarker = path.join(odd, 'done "1".txt');
fs.writeFileSync(shFile, I.shScript({ title: 'Sign in "x" $HOME', lines: ['echo running'], marker: shMarker }), { mode: 0o755 });
plan = I.terminalPlan({ platform: 'linux', title: 'x', file: shFile, terms: ['xterm', 'gnome-terminal', 'konsole', 'kitty'] });
assert.deepStrictEqual(plan.attempts.map((a) => a.cmd), ['gnome-terminal', 'konsole', 'kitty', 'xterm']);
assert.deepStrictEqual(plan.attempts.map((a) => a.args.slice(0, -1)), [['--', 'sh', '-c'], ['-e', 'sh', '-c'], ['sh', '-c'], ['-e', 'sh', '-c']]);
const shLine = plan.attempts[0].args.at(-1).replace('; read x', '');
const ran = spawnSync('sh', ['-c', shLine], { encoding: 'utf8' });
assert(ran.status === 0 && /running/.test(ran.stdout) && /Sign in 'x' 'HOME/.test(ran.stdout.replace(/\$/g, "'")) && fs.readFileSync(shMarker, 'utf8').trim() === 'done', ran.stdout + ran.stderr);
assert.deepStrictEqual(I.terminalPlan({ platform: 'linux', title: 'x', file: shFile, terms: [] }).attempts, []);
ok('Linux: each terminal found, in order; the line runs the script for real with quotes, $ and ` in its folder; the marker is written');

(async () => {
  // the attempts in order, each logged
  const lines = [];
  const fakeSpawn = (results) => (cmd) => {
    const want = results.shift();
    if (want === 'throw') throw Object.assign(new Error('spawn EACCES'), { code: 'EACCES' });
    const ch = new (require('events'))();
    ch.unref = () => {};
    setTimeout(() => { if (want === 'enoent') ch.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' })); else if (typeof want === 'number') ch.emit('exit', want, null); }, 5);
    return ch;
  };
  const W = I.terminalPlan({ platform: 'win32', title: 't', script: 's', file: 'f', env: WENV });
  r = await I.tryAll(W, { spawnFn: fakeSpawn([1, 0]), log: (l) => lines.push(l) });
  assert(r.ok && r.how === 'Start-Process' && r.window === 'PowerShell' && lines.length === 2 && /^start: .*cmd\.exe .*failed \(exit code 1\)/.test(lines[0]) && /^Start-Process: .*opened/.test(lines[1]), JSON.stringify({ r, lines }));
  assert(lines.every((l) => l.length < 600), 'the long base64 is cut in the log');
  lines.length = 0;
  r = await I.tryAll(W, { spawnFn: fakeSpawn(['enoent', 'throw']), log: (l) => lines.push(l) });
  assert(!r.ok && /start: ENOENT; Start-Process: EACCES/.test(r.error) && lines.length === 2, JSON.stringify(r));
  lines.length = 0;
  const L = I.terminalPlan({ platform: 'linux', title: 't', file: '/tmp/x.sh', terms: ['gnome-terminal', 'xterm'] });
  r = await I.tryAll(L, { spawnFn: fakeSpawn([1, 'alive']), log: (l) => lines.push(l), aliveMs: 50 });
  assert(r.ok && r.how === 'xterm', JSON.stringify(r));
  r = await I.tryAll({ attempts: [] }, { log: (l) => lines.push(l) });
  assert(!r.ok && r.error === 'no terminal window found');
  ok('each way is tried in turn until one opens (an exit code, a spawn error, a still-running terminal); every attempt is logged');
  fs.rmSync(LOG, { force: true });
  await I.tryAll(W, { spawnFn: fakeSpawn([0]) });
  assert(/terminal: start: .*cmd\.exe .*→ opened/.test(fs.readFileSync(LOG, 'utf8')));
  ok('the attempts go to data/engine.log');

  // ---------- 3. sign-in without a window ----------
  assert.strictEqual(I.loginUrlOf("Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.ai/oauth/authorize?code=true&client_id=a&state=b\n"), 'https://claude.ai/oauth/authorize?code=true&client_id=a&state=b');
  assert.strictEqual(I.loginUrlOf('Starting local login server on http://localhost:1455.\nIf your browser did not open, navigate to this URL to authenticate:\n\nhttps://auth.openai.com/oauth/authorize?response_type=code&state=x\n\nOn a remote…'), 'https://auth.openai.com/oauth/authorize?response_type=code&state=x');
  for (const bad of ['http://claude.ai/oauth', 'https://claude.ai.evil.com/x', 'https://evil.com/?claude.ai', 'javascript:alert(1)', 'https://user:pw@claude.ai/x', 'file:///etc/passwd']) assert.strictEqual(I.safeLoginUrl(bad), null, bad);
  assert.strictEqual(I.loginUrlOf('visit http://localhost:1455/x or https://evil.example/a'), null);
  assert.deepStrictEqual(I.loginEnded(0, 'Opening browser…\nLogin successful.\n'), { ok: true, why: 'Login successful.' });
  assert.deepStrictEqual(I.loginEnded(1, 'visit: https://claude.ai/x\nLogin failed: OAuth error: access_denied\n'), { ok: false, why: 'Login failed: OAuth error: access_denied' });
  assert.deepStrictEqual(I.linkLoginArgs('claude'), ['auth', 'login']);
  assert.deepStrictEqual(I.linkLoginArgs('codex'), ['login']);
  ok('only an https page of the engine\'s own sign-in service is taken from its output (Claude: claude.ai / claude.com, Codex: auth.openai.com)');

  const keep = setInterval(() => {}, 500);
  const link = (engine) => new Promise((resolve) => {
    const events = [];
    let first;
    engines.signInByLink(engine, (ev) => events.push(ev), (rep, info) => resolve({ first, events, rep: rep[engine], info })).then((x) => { first = x; if (!x.ok) resolve({ first: x, events }); });
  });
  fs.rmSync(LOG, { force: true });
  switches({ claudeLoggedOut: '1', codexLoggedOut: '1' });
  assert.strictEqual((await engines.checkEngine('claude')).signedIn, false);
  for (const engine of ['claude', 'codex']) {
    const o = await link(engine);
    assert(o.first.ok && /^https:\/\/(claude\.ai|auth\.openai\.com)\//.test(o.first.url), JSON.stringify(o.first));
    assert(o.events[0].state === 'link' && o.events.at(-1).state === 'done' && o.events.at(-1).ok === true, JSON.stringify(o.events));
    assert(o.info.action === 'login' && o.info.finished && o.info.via === 'link' && o.rep.signedIn === true, JSON.stringify(o));
  }
  ok('signed out → the engine\'s own sign-in link (Claude: auth login, Codex: login) → it ends → checked again: signed in');
  switches({ claudeLoggedOut: '1', loginFails: '1' });
  let o = await link('claude');
  assert(o.first.ok && o.events.at(-1).ok === false && /Login failed/.test(o.events.at(-1).why) && o.rep.signedIn === false, JSON.stringify(o));
  ok('a sign-in that fails in the browser says so ("Login failed: …") and the engine still shows signed out');
  switches({ claudeLoggedOut: '1', loginMs: '60000' });
  const p = link('claude');
  await new Promise((res) => setTimeout(res, 1500));
  const again = await engines.signInByLink('claude');
  assert(again.ok && /claude\.ai/.test(again.url), 'the same link again while one waits');
  assert(engines.stopLink('claude'));
  o = await p;
  assert(o.events.at(-1).state === 'done' && o.events.at(-1).ok === false && o.events.at(-1).why === 'stopped', JSON.stringify(o.events));
  ok('one link sign-in per engine at a time; Cancel stops the engine waiting');
  switches({ claudeNoAuth: '1' });
  delete I.data().versions[I.binKey(FAKE.claude)]; // (what --help said is kept per binary: this one is "another" copy now)
  o = await link('claude');
  assert(!o.first.ok && o.first.old, JSON.stringify(o));
  switches({});
  delete I.data().versions[I.binKey(FAKE.claude)];
  // (no "not found" run here: a path that isn't there makes Hearth look for the engine elsewhere, and this computer may
  // have a real one; the not-found answers are plain code paths: engines.fix / signInByLink return { notFound })
  ok('an old Claude Code without `auth login` is said plainly (update it; no link)');
  const logText = fs.readFileSync(LOG, 'utf8');
  assert(/claude sign-in \(link\): link shown \(claude\.ai\)/.test(logText) && /codex sign-in \(link\): link shown \(auth\.openai\.com\)/.test(logText), logText);
  assert(!/fake-state|oauth\/authorize|client_id/.test(logText), 'no link or state in the log');
  ok('data/engine.log says what happened, never the link itself');

  // ---------- 4. Claude Code 2.1's JSON auth status ----------
  switches({ claudeLoggedOut: '1' });
  let s = await I.signedIn('claude', FAKE.claude, path.join(dir, 'data', 'workspace'));
  assert(s.ok === false && s.text === 'Not logged in', JSON.stringify(s));
  switches({});
  s = await I.signedIn('claude', FAKE.claude, path.join(dir, 'data', 'workspace'));
  assert(s.ok === true && /claude\.ai/.test(s.text), JSON.stringify(s));
  ok('Claude Code\'s JSON `auth status` ({ "loggedIn": false }, exit 1) is read as signed out (it was "can\'t tell")');
  clearInterval(keep);
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
