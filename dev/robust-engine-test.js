#!/usr/bin/env node
// Robustness against real installs (round 9), with plain Node against the fake engines (dev/fake-claude.js,
// dev/fake-codex.js) and their failure switches (dev/fake-common.js): the install check (version, too old, signed in,
// every copy, the newest preferred), the one-click fixes (update / sign-in run in a window, then checked again), and
// every failure class a run heals from or explains (old option, too old for the model, signed out, MCP config missing,
// Codex cancelling tool calls, network drop). engines.js + store.js + installs.js are copied to a temp folder.
//   node dev/robust-engine-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.HEARTH_TEST_TERMINAL = '1'; // update / sign-in windows run headless, brew / npm / installers only echo
const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robust-engine-'));
for (const f of ['engines.js', 'store.js', 'installs.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const engines = require(path.join(dir, 'engines.js'));
const T = engines._test;
const I = T.Installs;
const FAKE = { claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') };
engines.setEnginePaths(FAKE);
const KV = path.join(dir, 'data', 'kv');
const switches = (o) => { fs.writeFileSync(path.join(KV, 'fake-switches.json'), JSON.stringify(o)); for (const f of fs.readdirSync(KV)) if (f.startsWith('fake-once-')) fs.rmSync(path.join(KV, f)); };
const learned = () => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'engine-installs.json'), 'utf8')).learnedMin || {};

const claude = { id: 'claude', name: 'Claude', mode: 'native', engine: 'claude' };
const astra = { id: 'astra', name: 'Astra', mode: 'native', engine: 'codex' };
let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };
function turn(agent, text, options = {}, onStart) {
  return new Promise((resolve) => {
    const events = [];
    const chatId = `t-${Math.random().toString(36).slice(2)}`;
    engines.send({ agent, chatId, session: {}, text, options }, (e) => {
      events.push(e);
      if (!['delta', 'tool', 'thinking', 'progress'].includes(e.type)) resolve({ events, end: e, notes: events.filter((x) => x.type === 'thinking').map((x) => x.text).join('') });
    });
    onStart?.(chatId);
  });
}
// (the re-check's timer doesn't keep an app alive; here something has to)
const fixed = (engine, action) => new Promise((resolve) => { const keep = setInterval(() => {}, 500); const done = (v) => { clearInterval(keep); resolve(v); }; const r = engines.fix(engine, action, (rep) => done({ r, rep: rep[engine] })); if (!r.ok) done({ r }); });

(async () => {
  // ---- versions, the check, kinds and update commands
  assert.strictEqual(I.semverOf('2.1.1 (Claude Code)'), '2.1.1');
  assert.strictEqual(I.semverOf('codex-cli 0.46.0'), '0.46.0');
  assert(I.cmp('2.1.280', '2.1.1') > 0 && I.cmp('2.10.0', '2.9.9') > 0 && I.cmp('1.0.0', '1.0.0') === 0);
  ok('versions are read from "2.1.1 (Claude Code)" / "codex-cli 0.46.0" and compared as numbers (2.10 > 2.9)');
  assert.strictEqual(I.kindOf('claude', '/opt/homebrew/Caskroom/claude-code/2.1.300/claude'), 'homebrew');
  assert.strictEqual(I.kindOf('claude', '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js'), 'npm');
  assert.strictEqual(I.kindOf('claude', path.join(os.homedir(), '.local', 'bin', 'claude')), 'native');
  assert.strictEqual(I.kindOf('claude', path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code', '2.1.1', 'claude')), 'desktop');
  assert.strictEqual(I.kindOf('codex', '/Applications/Codex.app/Contents/Resources/codex'), 'desktop');
  assert.strictEqual(I.kindOf('codex', '/home/x/.nvm/versions/node/v22.0.0/bin/codex'), 'npm');
  assert.strictEqual(I.updatePlan('claude', '/opt/homebrew/Caskroom/claude-code/2.1.300/claude').command, 'brew upgrade claude-code');
  assert.strictEqual(I.updatePlan('claude', '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js').command, 'npm i -g @anthropic-ai/claude-code@latest');
  assert(/claude' update$/.test(I.updatePlan('claude', path.join(os.homedir(), '.local', 'bin', 'claude')).command));
  assert(/install\.(sh|ps1)/.test(I.updatePlan('claude', null).command) && I.updatePlan('codex', null).command === 'npm i -g @openai/codex@latest');
  assert(/claude\.ai\/install/.test(I.updatePlan('claude', path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code', '2.1.1', 'claude')).command));
  ok('each kind of install gets its own update: Homebrew, npm, claude update, the official installer for the desktop copy / none');

  switches({});
  let c = await engines.checkEngine('claude');
  assert(c.found && c.semver === '2.1.300' && c.from === 'settings' && c.signedIn === true && !c.tooOld, JSON.stringify(c));
  const x = await engines.checkEngine('codex');
  assert(x.found && x.semver === '0.50.0' && x.signedIn === true && !x.tooOld, JSON.stringify(x));
  ok('the install check reads the copy in use: version, where it comes from, signed in');

  // ---- an old Claude Code (2.1.1): too old up front, one-click update, checked again
  switches({ claudeVersion: '2.1.1' });
  c = await engines.checkEngine('claude', { fresh: true });
  assert(c.tooOld && c.min === '2.1.280' && /update$/.test(c.plan.command), JSON.stringify(c));
  ok('Claude Code 2.1.1 is flagged too old before any run (needs 2.1.280), with its update command');
  const up = await fixed('claude', 'update');
  assert(up.r.ok && up.r.window === 'test', JSON.stringify(up.r));
  assert(up.rep && up.rep.semver === '2.1.400' && !up.rep.tooOld, JSON.stringify(up.rep));
  ok('Update runs `claude update` in a window and the copy is checked again afterwards (2.1.1 → 2.1.400, fine)');

  // ---- signed out: noticed up front, the run says so with a sign-in, the window signs in, checked again
  switches({ claudeLoggedOut: '1', codexLoggedOut: '1' });
  c = await engines.checkEngine('claude');
  assert(c.signedIn === false, JSON.stringify(c));
  assert((await engines.checkEngine('codex')).signedIn === false);
  ok('a signed-out Claude Code / Codex is noticed up front (auth status / login status)');
  let t = await turn(claude, 'hello');
  assert(t.end.type === 'error' && t.end.needsLogin, JSON.stringify(t.end));
  t = await turn(astra, 'hello');
  assert(t.end.type === 'error' && t.end.needsLogin, JSON.stringify(t.end));
  ok('a run while signed out ends with "isn\'t signed in" + the sign-in button (both engines)');
  const li = await fixed('claude', 'login');
  assert(li.r.ok && li.rep.signedIn === true, JSON.stringify(li));
  const li2 = await fixed('codex', 'login');
  assert(li2.r.ok && li2.rep.signedIn === true, JSON.stringify(li2));
  assert(engines.login('claude') === true);
  ok('sign-in runs in its own window (Mac / Windows / Linux), Hearth checks again afterwards: signed in');

  // ---- too old for the model: the error names the update, the minimum is learned
  switches({ claudeVersion: '2.1.300', claudeNeeds: '2.1.350' });
  t = await turn(claude, 'hello');
  assert(t.end.type === 'error' && t.end.fixAction === 'update' && /Press Update/.test(t.end.message), JSON.stringify(t.end));
  assert.strictEqual(learned().claude, '2.1.350');
  c = await engines.checkEngine('claude');
  assert(c.tooOld && c.min === '2.1.350');
  ok('"version 2.1.350 or newer is required": an Update button on the error, and 2.1.350 becomes the minimum');
  switches({ codexNeeds: '0.60.0' });
  t = await turn(astra, 'hello');
  assert(t.end.type === 'error' && t.end.fixAction === 'update', JSON.stringify(t.end));
  assert.strictEqual(learned().codex, '0.50.1');
  assert((await engines.checkEngine('codex')).tooOld === true);
  ok('Codex "requires a newer version": Update offered, that copy is remembered as too old');

  // ---- the newest copy on the computer is preferred, and a too-old run continues on it
  const bins = fs.mkdtempSync(path.join(os.tmpdir(), 'robust-bins-'));
  const wrap = (sub, v) => { fs.mkdirSync(path.join(bins, sub)); const f = path.join(bins, sub, 'claude'); fs.writeFileSync(f, `#!/bin/sh\nFAKE_CLAUDE_VERSION=${v} exec "${process.execPath}" "${FAKE.claude}" "$@"\n`, { mode: 0o755 }); return f; };
  const oldBin = wrap('a', '2.1.1'); const newBin = wrap('b', '2.1.500');
  const PATH0 = process.env.PATH;
  process.env.PATH = [path.join(bins, 'a'), path.join(bins, 'b'), PATH0].join(path.delimiter);
  engines.setEnginePaths({ codex: FAKE.codex });
  const store = I.data(); delete store.chosen.claude; delete store.learnedMin.claude; I.persist();
  switches({ claudeNeeds: '2.1.280' });
  t = await turn(claude, 'hello there');
  assert(t.end.type === 'done' && /newer copy/.test(t.notes), JSON.stringify(t.end).slice(0, 300) + t.notes);
  assert.strictEqual(I.data().chosen.claude, newBin);
  ok('a too-old copy first on PATH (2.1.1): the run continues on the newer copy Hearth found (2.1.500), which it now prefers');
  c = await engines.checkEngine('claude');
  assert(c.chosen === newBin && c.copies.some((k) => k.path === oldBin && k.ok === false) && c.copies.length >= 2, JSON.stringify(c.copies));
  ok('the check lists every copy with its version; the newest working one is chosen');
  engines.setEnginePaths({ claude: oldBin, codex: FAKE.codex });
  c = await engines.checkEngine('claude');
  assert(c.chosen === oldBin && c.from === 'settings' && c.newer?.path === newBin, JSON.stringify(c));
  ok('Settings → Engines still wins, and the check says a newer copy exists');
  process.env.PATH = PATH0;
  engines.setEnginePaths(FAKE);
  delete I.data().learnedMin.claude; delete I.data().learnedMin.codex; I.persist();

  // ---- MCP config missing: regenerated once
  switches({ claudeMcpMissing: 'once' });
  t = await turn({ ...claude, threeTools: true }, 'hello');
  assert(t.end.type === 'done', JSON.stringify(t.end));
  switches({ claudeMcpMissing: 'always' });
  t = await turn({ ...claude, threeTools: true }, 'hello');
  assert(t.end.type === 'error' && /Invalid MCP configuration/.test(t.end.message) && /tried once/.test(t.end.message), JSON.stringify(t.end));
  ok('"Invalid MCP configuration" (the tool file vanished): one more run with a fresh file; if it persists, a precise fix');

  // ---- Codex cancelling Hearth's tool calls
  switches({ codexMcpCancel: 'new' });
  t = await turn({ ...astra, threeTools: true, hubTools: true }, 'tools3 please');
  assert(t.end.type === 'done' && !/blocked/.test(t.end.text), JSON.stringify(t.end).slice(0, 300));
  ok('current Codex: Hearth\'s tools are pre-approved (default_tools_approval_mode), nothing is cancelled');
  switches({ codexMcpCancel: 'old' });
  t = await turn({ ...astra, threeTools: true, hubTools: true }, 'tools3 please');
  assert(t.end.type === 'done' && /approved/.test(t.notes) && !/blocked/.test(t.end.text), JSON.stringify(t.end).slice(0, 300) + t.notes);
  ok('an older Codex that ignores the pre-approval cancels a tool call: stopped before it answers, run again with approvals off');
  switches({ codexMcpCancel: 'always' });
  t = await turn({ ...astra, threeTools: true, hubTools: true }, 'tools3 please');
  assert(t.end.type === 'error' && t.end.fixAction === 'update' && /cancelled Hearth's tool call/.test(t.end.message), JSON.stringify(t.end));
  ok('a Codex that cancels anyway: "cancelled Hearth\'s tool call three · three_screenshot" with Update (not "Lab access was blocked")');

  // ---- network drop: once more after a pause; Stop works while waiting
  switches({ claudeNetwork: 'once', codexNetwork: 'once' });
  t = await turn(claude, 'hello');
  assert(t.end.type === 'done' && /connection dropped/.test(t.notes), JSON.stringify(t.end));
  t = await turn(astra, 'hello');
  assert(t.end.type === 'done' && /connection dropped/.test(t.notes), JSON.stringify(t.end));
  ok('a dropped connection: one more try after 3 s, then the reply (Claude: ENOTFOUND, Codex: stream disconnected)');
  switches({ claudeNetwork: 'always' });
  t = await turn(claude, 'hello');
  assert(t.end.type === 'error' && /already tried again/.test(t.end.message), JSON.stringify(t.end));
  switches({ claudeNetwork: 'always' });
  t = await turn(claude, 'hello', {}, (id) => setTimeout(() => engines.stop(id), 1500));
  assert(t.end.type === 'stopped', JSON.stringify(t.end));
  ok('still down after the retry: a precise network fix; Stop during the pause stops it');

  // ---- an option this Claude Code doesn't know (still dropped and retried) and the friendly errors
  switches({});
  process.env.FAKE_CLAUDE_REJECT = '--thinking-display';
  t = await turn(claude, 'hello');
  delete process.env.FAKE_CLAUDE_REJECT;
  assert(t.end.type === 'done' && T.claudeDropped.has('--thinking-display'));
  ok('an unknown option is still dropped and the run retried at once');
  assert.strictEqual(T.friendlyError('claude', 'spawn x ENOENT').fixAction, 'doctor');
  assert.strictEqual(T.friendlyError('codex', "error: unexpected argument '--ignore-rules' found").fixAction, 'update');
  ok('every known failure maps to a fix action (update / doctor / sign in)');

  console.log(`\n${passed} passed`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => { console.error('FAIL', err.stack || err.message); process.exit(1); });
