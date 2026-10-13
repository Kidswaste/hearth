// Node tests for Check this computer (round 28, firstrun-core.js + firstrunmain.js + the reach folder map): every line's
// state from made-up reports (missing / too old / signed out engines, ffmpeg, sync off / join / inside the drive,
// folders here / matched / missing / on the way, Mac permissions, Windows paths + SmartScreen, updates), the summary,
// the first-launch decision, the commands shown before a click, folders read from chats, the hand-made folder map.
//   node dev/firstrun-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'firstrun-core.js'));
let n = 0; let failed = 0;
const ok = async (name, fn) => { n += 1; try { await fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${err.stack.split('\n').slice(0, 3).join('\n  ')}`); } };
const row = (f, id) => C.rows(f).find((r) => r.id === id);
const eng = (report, problems = []) => ({ report: { label: 'Claude Code', semver: '2.1.400', ...report }, problems });

(async () => {
  await ok('nothing known yet: every line says checking, the summary too', () => {
    const rs = C.rows({ platform: 'linux' });
    assert.deepStrictEqual(rs.map((r) => r.id), ['claude', 'codex', 'ffmpeg', 'sync', 'folders', 'update']);
    assert.ok(rs.every((r) => r.state === 'checking'));
    assert.match(C.summary(rs).line, /^Checking 6 things/);
  });
  await ok('platform lines: Mac permissions (3), Windows paths + SmartScreen (2), none on Linux', () => {
    assert.deepStrictEqual(C.rows({ platform: 'darwin' }).filter((r) => r.id.startsWith('perm-')).map((r) => r.id), ['perm-screen', 'perm-camera', 'perm-microphone']);
    assert.deepStrictEqual(C.rows({ platform: 'win32' }).filter((r) => r.id.startsWith('win-')).map((r) => r.id), ['win-paths', 'win-smartscreen']);
    assert.strictEqual(C.rows({ platform: 'linux' }).length, 6);
  });
  await ok('engine ready: version and signed in, no button', () => {
    const r = row({ engines: { claude: eng({ signedIn: true }) } }, 'claude');
    assert.strictEqual(r.state, 'ok'); assert.match(r.text, /2\.1\.400, signed in/); assert.ok(!r.action);
    assert.match(row({ engines: { claude: eng({ signedIn: null }) } }, 'claude').text, /looks fine/);
  });
  await ok('engine missing: install, the exact command shown first, the official page', () => {
    const r = row({ used: { claude: true }, engines: { claude: eng({ found: false, plan: { command: 'curl -fsSL https://claude.ai/install.sh | bash' } }, [{ kind: 'missing', text: "Claude Code isn't installed", action: 'install', label: 'Install Claude Code' }]) } }, 'claude');
    assert.strictEqual(r.state, 'fix'); assert.deepStrictEqual(r.action, { kind: 'engine', engine: 'claude', act: 'install', label: 'Install Claude Code' });
    assert.strictEqual(r.cmd, 'curl -fsSL https://claude.ai/install.sh | bash'); assert.match(r.link.url, /claude/);
  });
  await ok('Codex through npm says Node.js is needed; unused Codex is only optional', () => {
    const f = { used: { claude: true, codex: false }, engines: { codex: { report: { label: 'Codex', plan: { command: 'npm i -g @openai/codex@latest' } }, problems: [{ text: "Codex isn't installed", action: 'install', label: 'Install Codex' }] } } };
    const r = row(f, 'codex');
    assert.strictEqual(r.state, 'optional'); assert.match(r.text, /Only needed for Astra/); assert.match(r.text, /Node\.js/); assert.strictEqual(r.title, 'Codex (for Astra)');
  });
  await ok('signed out: the sign-in command for the copy in use; several problems are all named', () => {
    const f = { engines: { claude: eng({ plan: { command: 'claude update' } }, [{ text: 'Claude Code 2.1.1 is too old (the model needs 2.1.280 or newer)', action: 'update', label: 'Update Claude Code' }, { text: "Claude Code isn't signed in", action: 'login', label: 'Sign in to Claude Code' }]) }, login: { claude: "'/x/claude' auth login || '/x/claude' /login" } };
    const r = row(f, 'claude');
    assert.strictEqual(r.cmd, 'claude update'); assert.match(r.text, /Then: claude code isn't signed in/i);
    f.engines.claude.problems.shift();
    const s = row(f, 'claude');
    assert.strictEqual(s.action.act, 'login'); assert.match(s.cmd, /auth login/);
    f.engines.claude.problems = [{ text: 'a newer one', action: 'use-newest', label: 'Use 2.1.500' }];
    assert.ok(!row(f, 'claude').cmd, 'use-newest runs nothing');
  });
  await ok('ffmpeg: found / missing with the install lines and the official page', () => {
    assert.strictEqual(row({ ffmpeg: { found: true } }, 'ffmpeg').state, 'ok');
    const r = row({ ffmpeg: { found: false, command: 'brew install ffmpeg' } }, 'ffmpeg');
    assert.strictEqual(r.state, 'fix'); assert.strictEqual(r.cmd, 'brew install ffmpeg'); assert.strictEqual(r.action.kind, 'ffmpeg'); assert.match(r.text, /Ready to post/);
  });
  await ok('sync: on, the Hearth from the other computer to join, a drive to use, no drive, inside the drive', () => {
    assert.strictEqual(row({ sync: { status: { on: true, state: 'synced' }, line: 'Everything is synced' } }, 'sync').state, 'ok');
    assert.strictEqual(row({ sync: { status: { on: true, state: 'offline', error: 'missing' } } }, 'sync').state, 'fix');
    const j = row({ sync: { status: { on: false }, detect: { proposed: { label: 'iCloud Drive', root: '/x', hearth: { machines: [{ name: 'Studio Mac' }] } } } } }, 'sync');
    assert.strictEqual(j.state, 'fix'); assert.strictEqual(j.action.label, 'Use this Hearth'); assert.match(j.text, /Studio Mac/);
    assert.strictEqual(row({ sync: { status: { on: false }, detect: { proposed: { label: 'Dropbox', root: '/d' } } } }, 'sync').state, 'optional');
    assert.strictEqual(row({ sync: { status: { on: false }, detect: { list: [] } } }, 'sync').action.label, 'Choose a folder…');
    const inside = row({ sync: { status: { on: false }, detect: { inside: { label: 'OneDrive' } } } }, 'sync');
    assert.strictEqual(inside.state, 'fix'); assert.ok(!inside.action);
    assert.strictEqual(row({ sync: { status: { on: false } } }, 'sync').state, 'checking', 'detect still coming');
  });
  await ok('folders: none, all here + matched, one missing (button with its path), one on its way', () => {
    assert.strictEqual(row({ folders: [] }, 'folders').state, 'ok');
    const here = row({ folders: [{ path: '/a', state: 'here' }, { path: '/Users/x/b', state: 'mapped' }] }, 'folders');
    assert.strictEqual(here.state, 'ok'); assert.match(here.text, /2 folders found here, 1 matched/);
    const miss = row({ home: '/home/me', folders: [{ path: '/Users/x/Projects/game', state: 'missing', from: ['Game chat'] }, { path: '/a', state: 'here' }] }, 'folders');
    assert.strictEqual(miss.state, 'fix'); assert.strictEqual(miss.action.path, '/Users/x/Projects/game'); assert.match(miss.text, /~\/Projects\/game \(Game chat\)/);
    assert.strictEqual(row({ folders: [{ path: '/w', state: 'waiting' }] }, 'folders').state, 'note');
  });
  await ok('Mac permissions: allowed, not asked (Allow…), denied (Open System Settings); never "needed"', () => {
    const rs = C.rows({ platform: 'darwin', perms: { screen: 'denied', camera: 'not-determined', microphone: 'granted' } });
    const by = Object.fromEntries(rs.map((r) => [r.id, r]));
    assert.strictEqual(by['perm-microphone'].state, 'ok');
    assert.deepStrictEqual([by['perm-camera'].state, by['perm-camera'].action.how, by['perm-camera'].action.label], ['optional', 'ask', 'Allow…']);
    assert.deepStrictEqual([by['perm-screen'].action.how, by['perm-screen'].action.label], ['open', 'Open System Settings']);
    assert.strictEqual(C.rows({ platform: 'darwin', perms: { screen: 'not-determined' } }).find((r) => r.id === 'perm-screen').action.how, 'ask');
    assert.ok(rs.filter((r) => r.id.startsWith('perm-')).every((r) => r.state !== 'fix'));
  });
  await ok('Windows: long paths off (command shown, run id), on; SmartScreen note until "Got it"', () => {
    const off = row({ platform: 'win32', longPaths: false, appDir: 'C:\\Users\\Me\\agent-hub', home: 'C:\\Users\\Me', commands: { longpaths: 'Start-Process reg.exe -Verb RunAs' } }, 'win-paths');
    assert.strictEqual(off.state, 'optional'); assert.deepStrictEqual(off.action, { kind: 'run', id: 'longpaths', label: 'Allow long paths' }); assert.match(off.cmd, /RunAs/); assert.match(off.text, /~\\agent-hub/);
    assert.strictEqual(row({ platform: 'win32', longPaths: true }, 'win-paths').state, 'ok');
    assert.strictEqual(row({ platform: 'win32', longPaths: null }, 'win-paths').state, 'ok', 'unknown (no reg) is fine');
    assert.strictEqual(row({ platform: 'win32' }, 'win-paths').state, 'checking');
    assert.strictEqual(row({ platform: 'win32' }, 'win-smartscreen').action.kind, 'ack');
    assert.strictEqual(row({ platform: 'win32', acks: { smartscreen: 1 } }, 'win-smartscreen').state, 'ok');
  });
  await ok('updates: from main, behind, another branch, no git (Mac: command, Windows: page), not a checkout, offline', () => {
    assert.strictEqual(row({ update: { ok: true, branch: 'main', behind: 0 } }, 'update').state, 'ok');
    assert.match(row({ update: { ok: true, branch: 'main', behind: 3 } }, 'update').text, /3 new changes/);
    assert.strictEqual(row({ update: { ok: true, branch: 'night' } }, 'update').state, 'note');
    const mac = row({ platform: 'darwin', update: { ok: false, reason: 'git' }, commands: { git: 'xcode-select --install' } }, 'update');
    assert.deepStrictEqual([mac.state, mac.cmd, mac.action.kind, mac.action.id], ['fix', 'xcode-select --install', 'run', 'git']);
    assert.strictEqual(row({ platform: 'win32', update: { ok: false, reason: 'git' } }, 'update').action.kind, 'link');
    assert.strictEqual(row({ update: { ok: false, reason: 'repo' } }, 'update').state, 'note');
    assert.strictEqual(row({ update: { ok: false, reason: 'fetch' } }, 'update').action.kind, 'update');
  });
  await ok('summary: things to set up first, then ready ✓ with the optional count', () => {
    const all = { platform: 'linux', engines: { claude: eng({ signedIn: true }), codex: eng({}) }, ffmpeg: { found: false }, sync: { status: { on: true } }, folders: [], update: { ok: true, branch: 'main' } };
    assert.strictEqual(C.summary(C.rows(all)).line, '1 thing to set up');
    all.ffmpeg.found = true;
    assert.strictEqual(C.summary(C.rows(all)).line, 'This computer is ready ✓');
    all.sync = { status: { on: false }, detect: { proposed: { label: 'Dropbox' } } };
    assert.strictEqual(C.summary(C.rows(all)).line, 'This computer is ready ✓ (1 optional)');
  });
  await ok('first launch: a fresh computer shows it once; one in use is only marked; tests and seen skip', () => {
    assert.strictEqual(C.autoDecision({ seen: false, test: false, chats: 0 }), 'show');
    assert.strictEqual(C.autoDecision({ seen: false, test: false, chats: 12 }), 'mark');
    assert.strictEqual(C.autoDecision({ seen: 'shown', test: false, chats: 0 }), 'skip');
    assert.strictEqual(C.autoDecision({ seen: false, test: true, chats: 0 }), 'skip');
  });

  // ---- main side ----
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-firstrun-'));
  const data = path.join(tmp, 'data');
  fs.mkdirSync(path.join(data, 'chats'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'Work', 'game'), { recursive: true });
  fs.mkdirSync(path.join(data, 'workspace', 'site'), { recursive: true });
  const R = require(path.join(ROOT, 'reachmain.js'));
  await ok('reach folder map: longest match, inside paths follow, Windows paths without case, siblings untouched', () => {
    const map = { '/Users/x/Projects': path.join(tmp, 'Work'), '/Users/x/Projects/game': path.join(tmp, 'Work', 'game') };
    assert.strictEqual(R.mapFolder('/Users/x/Projects/game/src/a.js', map), path.join(tmp, 'Work', 'game', 'src', 'a.js'));
    assert.strictEqual(R.mapFolder('/Users/x/Projects/', map), path.join(tmp, 'Work'));
    assert.strictEqual(R.mapFolder('/Users/x/Projects2/a', map), null);
    assert.strictEqual(R.mapFolder('C:\\Users\\Me\\Work\\x', { 'c:/users/me/work': '/w' }), path.join('/w', 'x'));
    assert.strictEqual(R.mapFolder('/a', { relative: '/b' }), null);
    R._set({ dataDir: data, folderMap: () => map });
    const l = R.localize('/Users/x/Projects/game');
    assert.deepStrictEqual([l.path, l.foreign], [path.join(tmp, 'Work', 'game'), true]);
  });
  await ok('folders chats use: from chat files (access) and agents, each resolved like a chat would', async () => {
    const M = require(path.join(ROOT, 'firstrunmain.js'));
    fs.writeFileSync(path.join(data, 'chats', 'a.json'), JSON.stringify({ id: 'a', title: 'Game chat', access: { level: 'write', folders: ['/Users/x/Projects/game', '/Users/x/Elsewhere/nothing'] } }));
    fs.writeFileSync(path.join(data, 'chats', 'b.json'), JSON.stringify({ id: 'b', title: 'Plain', messages: [] }));
    fs.writeFileSync(path.join(data, 'chats', 'c.json'), '{"access": broken');
    const handlers = {};
    M.register({ handle: (ch, fn) => { handlers[ch] = fn; } }, () => null, { dataDir: data, readConfig: () => ({ agents: [{ id: 'x', name: 'Site', workspace: path.join(data, 'workspace', 'site') }] }) });
    assert.deepStrictEqual(Object.keys(handlers).sort(), ['firstrun:facts', 'firstrun:folders', 'firstrun:perm', 'firstrun:run']);
    const list = await handlers['firstrun:folders']();
    const by = Object.fromEntries(list.map((x) => [x.path, x]));
    assert.strictEqual(by[path.join(data, 'workspace', 'site')].state, 'here');
    assert.deepStrictEqual([by['/Users/x/Projects/game'].state, by['/Users/x/Projects/game'].from], ['mapped', ['Game chat']]);
    assert.strictEqual(by['/Users/x/Elsewhere/nothing'].state, 'missing');
    assert.strictEqual(C.rows({ folders: list }).find((r) => r.id === 'folders').action.path, '/Users/x/Elsewhere/nothing');
  });
  await ok('facts: the commands shown before a click (ffmpeg = what the install runs), sign-in only for a real file', async () => {
    const M = require(path.join(ROOT, 'firstrunmain.js'));
    const I = require(path.join(ROOT, 'installs.js'));
    const bin = path.join(tmp, 'claude'); fs.writeFileSync(bin, '#!/bin/sh\n');
    const f = await M.facts({ bins: { claude: bin, codex: '/no/such/codex' } });
    assert.strictEqual(f.commands.ffmpeg, I.ffmpegLines().join('\n'));
    assert.match(f.login.claude, /auth login/); assert.ok(!f.login.codex);
    assert.strictEqual(f.platform, process.platform);
    if (process.platform === 'linux') { assert.strictEqual(f.perms, null); assert.strictEqual(f.longPaths, null); assert.strictEqual(f.commands.git, null); }
  });
  await ok('run: only the two documented commands, by id; perm: nothing off a Mac', async () => {
    const M = require(path.join(ROOT, 'firstrunmain.js'));
    assert.deepStrictEqual(Object.keys(M.COMMANDS).sort(), ['git', 'longpaths']);
    assert.deepStrictEqual(M.COMMANDS.git.lines, ['xcode-select --install']);
    assert.match(M.COMMANDS.longpaths.lines[0], /LongPathsEnabled \/t REG_DWORD \/d 1/);
    const h = {}; M.register({ handle: (ch, fn) => { h[ch] = fn; } }, () => null, {});
    const r = await h['firstrun:run'](null, 'rm -rf /');
    assert.strictEqual(r.ok, false);
    if (process.platform !== 'darwin') assert.deepStrictEqual(await h['firstrun:perm'](null, 'camera', 'ask'), { ok: false, status: null });
    assert.ok(Object.values(M.PANES).every((u) => u.startsWith('x-apple.systempreferences:com.apple.preference.security?Privacy_')));
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${n - failed}/${n} passed`);
  process.exit(failed ? 1 : 0);
})();
