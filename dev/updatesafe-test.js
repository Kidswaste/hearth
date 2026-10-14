#!/usr/bin/env node
// (round 37, updatesafe) Safe updates, every real-world failure simulated with REAL git in temp folders (an "origin"
// with main, a "dev" clone pushing new commits, an "app" clone standing in for the installed Hearth with a data/
// folder that must never change). Windows is simulated: messages and fixes with platform 'win32', long paths through
// path.win32, files held open through a git wrapper that fails the merge half-way like Windows does.
// Covers: no git (and git found off PATH), not a checkout (connect, files untouched), inside another project,
// another user's folder, a stuck lock, local edits + a hand-added file with a new file's name (named stashes, said),
// a detached HEAD (onto main, the version kept), diverged history (merged, or kept aside on a branch), no network,
// a proxy (this computer's proxy tried), locked files (staged, swapped at the next start), long paths, permissions
// (the sudo / icacls line only in a visible window after a click), a half-finished update (finish / roll back), an
// update touching data/ (refused), Go back to the previous version, the plain-words table.
//   node dev/updatesafe-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const C = require('../updatesafe-core');
const { create } = require('../updatermain');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
// the sandbox's own proxy must not carry these local test remotes; a private global git config (safe.directory, sslBackend)
for (const k of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete process.env[k];
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-updatesafe-'));
process.env.GIT_CONFIG_GLOBAL = path.join(T, 'global.gitconfig');
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, '');
process.env.GIT_CONFIG_NOSYSTEM = '1';
const ID = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ID } }).trim();
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
let n = 0;

// origin + dev + app (with data/ holding "the owner's data")
function setup(name = `s${++n}`) {
  const base = path.join(T, name);
  fs.mkdirSync(base);
  const origin = path.join(base, 'origin.git');
  g(base, 'init', '-q', '--bare', '-b', 'main', origin);
  const dev = path.join(base, 'dev');
  g(base, 'clone', '-q', origin, dev);
  write(path.join(dev, '.gitignore'), 'data/\nelectron/\n');
  write(path.join(dev, 'index.html'), '<script defer src="ui.js"></script>');
  write(path.join(dev, 'ui.js'), '// ui 1\n');
  write(path.join(dev, 'main.js'), '// main 1\n');
  write(path.join(dev, 'notes.txt'), 'one\n');
  g(dev, 'add', '-A'); g(dev, 'commit', '-qm', 'first'); g(dev, 'push', '-q', 'origin', 'main');
  const app = path.join(base, 'app');
  g(base, 'clone', '-q', origin, app);
  write(path.join(app, 'data', 'chats', 'c1.json'), '{"title":"my chat"}');
  write(path.join(app, 'data', 'kv', 'notes.json'), '{"n":1}');
  return { base, origin, dev, app };
}
const dataSnap = (app) => JSON.stringify(['chats/c1.json', 'kv/notes.json'].map((f) => [read(path.join(app, 'data', f)), fs.statSync(path.join(app, 'data', f)).mtimeMs]));
function push(dev, files, msg) { for (const [f, s] of Object.entries(files)) write(path.join(dev, f), s); g(dev, 'add', '-A'); g(dev, 'commit', '-qm', msg); g(dev, 'push', '-q', 'origin', 'main'); }
const head = (d) => g(d, 'rev-parse', 'HEAD');
const stashes = (d) => g(d, 'stash', 'list', '--format=%gs');

(async () => {
  // ---------- 1. plain words (no git) ----------
  const cls = {
    'fatal: unable to access \'https://github.com/x/\': Could not resolve host: github.com': 'network',
    'fatal: unable to access \'https://github.com/x/\': Received HTTP code 407 from proxy after CONNECT': 'proxy',
    'fatal: unable to access \'https://github.com/x/\': SSL certificate problem: unable to get local issuer certificate': 'ssl',
    'error: unable to unlink old \'ui.js\': Invalid argument': 'locked',
    'error: unable to unlink old \'main.js\': Permission denied': 'locked',
    'error: insufficient permission for adding an object to repository database .git/objects': 'perm',
    'error: unable to create file tools/very/long/name.js: Filename too long': 'longpath',
    'fatal: detected dubious ownership in repository at \'C:/Users/quent/agent-hub\'': 'owner',
    'fatal: Unable to create \'C:/Users/quent/agent-hub/.git/index.lock\': File exists.': 'lock',
    'error: The following untracked working tree files would be overwritten by merge:\n\tnew.js': 'untracked',
    'hint: You have divergent branches and need to specify how to reconcile them.': 'diverged',
    'CONFLICT (content): Merge conflict in notes.txt\nAutomatic merge failed; fix conflicts and then commit the result.': 'conflict',
    'xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), missing xcrun at: …': 'clt',
    'fatal: could not read Username for \'https://github.com\': terminal prompts disabled': 'auth',
    'something odd': 'unknown',
  };
  for (const [t, want] of Object.entries(cls)) ok(C.classify(t) === want, `classify → ${want} (got ${C.classify(t)}): ${t.slice(0, 60)}`);
  ok(C.gitLine('remote: x\nfatal: unable to access: Could not resolve host') === 'unable to access: Could not resolve host', 'the one line of git\'s words');
  const every = ['git', 'clt', 'repo', 'repo-other', 'owner', 'lock', 'half', 'detached', 'diverged', 'network', 'proxy', 'ssl', 'auth', 'locked', 'perm', 'longpath', 'data', 'unknown'];
  for (const plat of ['darwin', 'win32']) {
    for (const r of every) {
      const e = C.explain(r, { platform: plat, dir: plat === 'win32' ? 'C:\\Users\\quent\\agent-hub' : '/Users/q/Library/Application Support/Hearth', files: ['a'] });
      ok(e.message && !/undefined|\[object/.test(e.message) && e.message.length < 420, `${plat} ${r}: one plain message (${e.message?.length})`);
      ok(r === 'data' || r === 'conflict' || (e.fix && e.fix.id && e.fix.label), `${plat} ${r}: one fix button`);
      if (e.fix?.password || e.fix?.admin) ok(e.fix.command, `${plat} ${r}: a fix asking for a password / administrator shows its command`);
    }
  }
  ok(C.explain('git', { platform: 'darwin' }).fix.command === 'xcode-select --install' && /winget install --id Git\.Git/.test(C.explain('git', { platform: 'win32' }).fix.command), 'install Git: xcode-select on a Mac, winget on Windows (shown before the click)');
  ok(C.explain('perm', { platform: 'darwin', dir: '/x y' }).fix.password && /sudo chown -R "\$USER" "\/x y"/.test(C.explain('perm', { platform: 'darwin', dir: '/x y' }).fix.command), 'Mac permissions: sudo, marked as asking for the password');
  ok(/icacls "C:\\Users\\quent\\agent-hub"/.test(C.explain('perm', { platform: 'win32', dir: 'C:\\Users\\quent\\agent-hub' }).fix.command), 'Windows permissions: icacls on the folder');
  ok(C.explain('locked', { platform: 'win32' }).fix.id === 'restart-swap' && /restarts/.test(C.explain('locked', { platform: 'win32' }).message), 'Windows files held open: finish as Hearth restarts');
  ok(C.explain('ssl', { platform: 'win32' }).fix.id === 'ssl-windows', 'Windows certificates: schannel');
  // long paths, path.win32
  const winDir = 'C:\\Users\\quent\\agent-hub';
  const long = `tools/${'deep/'.repeat(50)}file.js`;
  ok(C.tooLong(winDir, ['ui.js', long], 'win32').join() === long, `a path over 259 characters on Windows (${path.win32.join(winDir, long).length})`);
  ok(C.tooLong(winDir, [`tools/${'x'.repeat(259 - winDir.length - 7)}`], 'win32').length === 0 && C.tooLong(winDir, [`tools/${'x'.repeat(260 - winDir.length - 7)}`], 'win32').length === 1, 'exactly 259 fits, 260 doesn\'t');
  ok(C.tooLong('/Users/q/Hearth', [long], 'darwin').length === 1, 'a Mac folder measured as a Windows path too (the other computer)');
  ok(/^hearth-update \d{4}-\d\d-\d\d \d\d:\d\d \(abcdef1 → 1234567\): your edits$/.test(C.stashName('edits', 'abcdef1999', '1234567999')), `named stash (${C.stashName('edits', 'abcdef1999', '1234567999')})`);
  ok(C.gitEnv().GIT_TERMINAL_PROMPT === '0' && C.gitEnv().GIT_ASK_YESNO === 'false' && C.gitEnv().LC_ALL === 'C', 'git never prompts (password, Windows "try again? (y/n)") and answers in English');
  ok(C.mainSide('main.js') && C.mainSide('updatermain.js') && C.mainSide('mcp/three-mcp.js') && !C.mainSide('ui.js') && !C.mainSide('tools/three.js'), 'the swap knows main-process files');

  // ---------- 2. an ordinary update: named stash for edits, a hand-added file with a new file's name, data untouched ----------
  {
    const { dev, app } = setup();
    const U = create({ dir: app });
    const snap = dataSnap(app);
    push(dev, { 'ui.js': '// ui 2\n', 'new.js': '// new from main\n' }, 'Sharper');
    write(path.join(app, 'notes.txt'), 'one (my edit)\n');
    write(path.join(app, 'new.js'), '// MY own new.js\n');
    write(path.join(app, 'mine.txt'), 'untracked, no clash\n');
    const s = await U.status();
    ok(s.ok && s.behind === 1 && s.plan.collide.join() === 'new.js', `status sees the clash with a hand-added file (${JSON.stringify(s.plan)})`);
    const r = await U.apply();
    ok(r.ok && r.changed === 2 && read(path.join(app, 'ui.js')) === '// ui 2\n', `updated (${JSON.stringify(r).slice(0, 200)})`);
    ok(read(path.join(app, 'notes.txt')) === 'one (my edit)\n', 'the hand edit is back in place');
    ok(read(path.join(app, 'new.js')) === '// new from main\n' && read(path.join(app, 'mine.txt')) === 'untracked, no clash\n', 'the update\'s new.js is in; other hand-added files untouched');
    const list = stashes(app);
    ok(/hearth-update .*your files with the same names as new ones/.test(list) && !/your edits/.test(list), `only the clashing file is kept, in a named stash (${list})`);
    ok(/new\.js/.test(r.note) && /stash "hearth-update/.test(r.note), `and the result says so (${r.note})`);
    ok(/MY own new\.js/.test(g(app, 'show', 'stash@{0}^3:new.js')), 'the owner\'s new.js is inside that stash');
    ok(dataSnap(app) === snap, 'data/ untouched');
    ok(!C.readState(app, 'journal') && C.readState(app, 'last')?.to === head(app), 'journal closed, the last update remembered');
    // Go back to the previous version (edits kept), then forward again
    write(path.join(app, 'notes.txt'), 'one (edit after the update)\n');
    let st = await U.status({ fetch: false });
    ok(st.back && st.back.to === head(app).slice(0, 7), 'Go back is offered for this version');
    const b = await U.back();
    ok(b.ok && b.back && read(path.join(app, 'ui.js')) === '// ui 1\n' && !fs.existsSync(path.join(app, 'new.js')), `went back to the previous version (${JSON.stringify(b).slice(0, 160)})`);
    ok(read(path.join(app, 'notes.txt')) === 'one (edit after the update)\n' && dataSnap(app) === snap, 'going back keeps hand edits and data/');
    ok(b.restart === r.restart && b.changed === 2, 'going back restarts / reloads like the update did');
    st = await U.status({ fetch: false });
    ok(st.behind === 1 && !st.back, 'after going back: the update is offered again, no second Go back');
    ok(!(await U.back()).ok, 'a second Go back has nothing to undo');
    const again = await U.apply();
    ok(again.ok && read(path.join(app, 'ui.js')) === '// ui 2\n', 'and forward again');
  }

  // ---------- 3. no git ----------
  {
    const { app } = setup();
    const U = create({ dir: app, gitBin: path.join(T, 'no-such-git'), platform: 'darwin' });
    const s = await U.status();
    ok(!s.ok && s.reason === 'git' && s.fix.id === 'install-git' && s.fix.command === 'xcode-select --install', `no git: one plain message and Install Git (${s.reason})`);
    const ran = [];
    const U2 = create({ dir: app, gitBin: path.join(T, 'no-such-git'), platform: 'win32', terminal: (o) => { ran.push(o); return { ok: true, window: 'PowerShell' }; } });
    const f = await U2.fix('install-git');
    ok(f.ok && f.waiting && ran.length === 1 && /winget install --id Git\.Git/.test(ran[0].lines.join()) && /winget/.test(f.message), 'Install Git runs only after the click, in a visible window, the command shown');
    // installed after Hearth started: not on its PATH yet, found where installers put it
    const PATH = process.env.PATH;
    process.env.PATH = path.join(T, 'empty-path');
    const U3 = create({ dir: app, gitCandidates: ['/nope/git', execFileSync('sh', ['-c', 'command -v git'], { env: { PATH } }).toString().trim()] });
    const s3 = await U3.status({ fetch: false });
    process.env.PATH = PATH;
    ok(s3.ok && U3.git && U3.git !== 'git', `git found off PATH (${U3.git})`);
  }

  // ---------- 4. not a checkout → connect (files untouched); inside another project ----------
  {
    const { origin, dev } = setup();
    const zip = path.join(T, `zip${n}`);
    fs.mkdirSync(zip);
    for (const f of ['.gitignore', 'index.html', 'ui.js', 'main.js', 'notes.txt']) fs.copyFileSync(path.join(dev, f), path.join(zip, f));
    write(path.join(zip, 'notes.txt'), 'one (edited in the zip copy)\n');
    write(path.join(zip, 'data', 'chats', 'c1.json'), '{"title":"my chat"}');
    write(path.join(zip, 'data', 'kv', 'notes.json'), '{"n":1}');
    const snap = dataSnap(zip);
    const U = create({ dir: zip, originUrl: origin });
    let s = await U.status();
    ok(!s.ok && s.reason === 'repo' && s.fix.id === 'connect' && /git remote add origin/.test(s.fix.command), `not a checkout: Connect, the steps shown (${s.reason})`);
    const f = await U.fix('connect');
    ok(f.ok && f.retry && /Connected/.test(f.message) && /1 file/.test(f.message), `connected (${f.message})`);
    ok(read(path.join(zip, 'notes.txt')) === 'one (edited in the zip copy)\n' && dataSnap(zip) === snap, 'connecting wrote no file');
    push(dev, { 'ui.js': '// ui 2\n' }, 'More');
    s = await U.status();
    ok(s.ok && s.behind === 1 && s.dirty === 1 && s.branch === 'main', `then updates like a checkout (${JSON.stringify(s).slice(0, 100)})`);
    const r = await U.apply();
    ok(r.ok && read(path.join(zip, 'ui.js')) === '// ui 2\n' && read(path.join(zip, 'notes.txt')) === 'one (edited in the zip copy)\n', 'the zip copy\'s own edit survives its first update');
    // Hearth's folder inside another git project (a home folder under git)
    const outer = path.join(T, `outer${n}`);
    fs.mkdirSync(path.join(outer, 'Hearth'), { recursive: true });
    g(outer, 'init', '-q');
    const s2 = await create({ dir: path.join(outer, 'Hearth') }).status({ fetch: false });
    ok(!s2.ok && s2.reason === 'repo-other' && s2.fix.id === 'connect', `inside another project: never pulls that one (${s2.reason})`);
  }

  // ---------- 5. stuck lock, another user's folder ----------
  {
    const { app } = setup();
    const U = create({ dir: app });
    const lock = path.join(app, '.git', 'index.lock');
    write(lock, '');
    const old = (Date.now() - 120000) / 1000;
    fs.utimesSync(lock, old, old);
    let s = await U.status({ fetch: false });
    ok(!s.ok && s.reason === 'lock' && s.fix.id === 'unlock', `a stuck lock: Clear the stuck marker (${s.reason})`);
    ok((await U.fix('unlock')).ok && !fs.existsSync(lock) && (await U.status({ fetch: false })).ok, 'cleared, then fine');
    write(lock, '');
    ok((await U.status({ fetch: false })).ok, 'a fresh lock (a git running right now) is left alone');
    ok(!(await U.fix('unlock')).ok && fs.existsSync(lock), 'and Clear refuses a fresh one');
    fs.unlinkSync(lock);
    if (process.getuid?.() === 0) {
      execFileSync('chown', ['-R', '65534', app]);
      s = await U.status({ fetch: false });
      ok(!s.ok && s.reason === 'owner' && s.fix.id === 'safe-dir', `another user's folder: Trust Hearth's folder (${s.reason}: ${s.message?.slice(0, 60)})`);
      const f = await U.fix('safe-dir');
      const s9 = await U.status({ fetch: false }); ok(f.ok && /\[safe\]\s+directory = /.test(read(process.env.GIT_CONFIG_GLOBAL)) && s9.ok, `trusted, then fine (${s9.message || f.message})`);
      execFileSync('chown', ['-R', '0', app]);
    }
  }

  // ---------- 6. detached HEAD ----------
  {
    const { dev, app } = setup();
    push(dev, { 'ui.js': '// ui 2\n' }, 'Two');
    const U = create({ dir: app });
    g(app, 'checkout', '-q', '--detach', 'HEAD');
    write(path.join(app, 'notes.txt'), 'made while detached\n');
    g(app, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'detached work');
    const lost = head(app);
    write(path.join(app, 'ui.js'), '// hand edit while detached\n');
    const s = await U.status();
    ok(!s.ok && s.reason === 'detached' && s.fix.id === 'onto-main', `detached HEAD: Go back onto main (${s.reason})`);
    const f = await U.fix('onto-main');
    ok(f.ok && /hearth-saved-/.test(f.message), `back on main, the version kept (${f.message})`);
    ok(g(app, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main' && g(app, 'branch', '--list', 'hearth-saved-*', '--format=%(objectname)') === lost, 'the detached commit is on its own branch');
    ok(read(path.join(app, 'ui.js')) === '// hand edit while detached\n', 'the hand edit moved along');
    const r = await U.apply();
    ok(r.ok && r.kept.includes('ui.js') && read(path.join(app, 'ui.js')) === '// ui 2\n' && /hand edit while detached/.test(g(app, 'stash', 'show', '-p', 'stash@{0}')), `then the update goes in; the clashing hand edit waits in its named stash (${JSON.stringify(r).slice(0, 120)})`);
  }

  // ---------- 7. diverged history ----------
  {
    const { dev, app } = setup();
    push(dev, { 'ui.js': '// ui 2\n' }, 'Two');
    write(path.join(app, 'main.js'), '// main, mine\n');
    g(app, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'my own commit');
    const U = create({ dir: app });
    let s = await U.status();
    ok(s.ok && s.ahead === 1 && s.behind === 1 && s.plan.diverged, 'diverged seen');
    let r = await U.apply();
    ok(r.ok && read(path.join(app, 'ui.js')) === '// ui 2\n' && read(path.join(app, 'main.js')) === '// main, mine\n', `no clash: both kept, merged (${JSON.stringify(r).slice(0, 100)})`);
    // clashing commits
    push(dev, { 'notes.txt': 'theirs\n' }, 'Theirs');
    write(path.join(app, 'notes.txt'), 'mine\n');
    g(app, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'mine on notes');
    write(path.join(app, 'ui.js'), '// a hand edit too\n');
    const before = head(app);
    r = await U.apply();
    ok(!r.ok && r.reason === 'diverged' && r.fix.id === 'side-branch', `clashing commits: one plain message, Keep mine aside (${r.reason})`);
    ok(head(app) === before && read(path.join(app, 'notes.txt')) === 'mine\n' && read(path.join(app, 'ui.js')) === '// a hand edit too\n' && !fs.existsSync(path.join(app, '.git', 'MERGE_HEAD')), 'nothing changed, no half merge');
    const f = await U.fix('side-branch');
    ok(f.ok && /hearth-mine-/.test(f.note) && read(path.join(app, 'notes.txt')) === 'theirs\n', `main taken, mine aside (${f.note})`);
    ok(g(app, 'branch', '--list', 'hearth-mine-*', '--format=%(objectname)') === before && read(path.join(app, 'ui.js')) === '// a hand edit too\n', 'my commits on the side branch, the hand edit still here');
    const b = await U.back();
    ok(b.ok && head(app) === before, 'and Go back returns to my version');
  }

  // ---------- 8. no network, a proxy ----------
  {
    const { app } = setup();
    g(app, 'remote', 'set-url', 'origin', 'https://127.0.0.1:9/hearth.git');
    const asked = [];
    const U = create({ dir: app, resolveProxy: async (u) => { asked.push(u); return 'PROXY 127.0.0.1:9; DIRECT'; } });
    const s = await U.status();
    ok(!s.ok && s.reason === 'fetch' && s.why === 'proxy' && /proxy/.test(s.message) && s.fix.id === 'retry', `network down: this computer's proxy tried, then a plain message (${s.why}: ${s.message.slice(0, 80)})`);
    ok(asked[0] === 'https://github.com', 'asked Electron for the system proxy');
    const U2 = create({ dir: app, resolveProxy: async () => 'DIRECT' });
    const s2 = await U2.status();
    ok(!s2.ok && s2.reason === 'fetch' && s2.why === 'network' && /internet/.test(s2.message), `no proxy: Check the internet connection (${s2.why})`);
    const r = await U2.apply();
    ok(!r.ok && head(app) && !C.readState(app, 'journal'), 'apply offline: nothing started');
  }

  // ---------- 9. Windows: files held open → staged, swapped at the next start ----------
  {
    const { dev, app } = setup();
    push(dev, { 'ui.js': '// ui 2\n', 'main.js': '// main 2\n', 'extra.js': '// new\n' }, 'Big');
    const real = execFileSync('sh', ['-c', 'command -v git']).toString().trim();
    const wrap = path.join(T, `lockgit${n}`);
    const flag = path.join(T, `locked${n}`);
    // a merge that writes some files then fails like Windows does when a file is held open
    fs.writeFileSync(wrap, `#!/bin/sh\nfor a in "$@"; do if [ "$a" = merge ] && [ -f '${flag}' ]; then ${real} show origin/main:ui.js > ui.js; ${real} show origin/main:extra.js > extra.js; echo "error: unable to unlink old 'main.js': Invalid argument" >&2; exit 128; fi; done\nexec ${real} "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(flag, '');
    write(path.join(app, 'notes.txt'), 'one (my edit)\n');
    const snap = dataSnap(app);
    const from = head(app);
    const U = create({ dir: app, gitBin: wrap, platform: 'win32' });
    const r = await U.apply();
    ok(!r.ok && r.reason === 'locked' && r.staged && r.fix.id === 'restart-swap' && /Windows is holding/.test(r.message), `held open: staged for the restart (${r.reason}: ${r.message?.slice(0, 70)})`);
    ok(head(app) === from && read(path.join(app, 'ui.js')) === '// ui 1\n' && !fs.existsSync(path.join(app, 'extra.js')), 'the half-written files were put back (only the update\'s own)');
    ok(read(path.join(app, 'notes.txt')) === 'one (my edit)\n' && !stashes(app), 'the hand edit is back, no stash left over');
    ok(C.readState(app, 'pending')?.to && !C.readState(app, 'journal'), 'pending noted in .git/hearth-update, no half journal');
    const s = await U.status({ fetch: false });
    ok(!s.ok && s.reason === 'staged' && s.fix.id === 'restart-swap', 'until the restart, ⬆ says it goes in when Hearth restarts');
    ok((await U.fix('restart-swap')).restart, 'the fix restarts');
    // the next start (files free now)
    fs.unlinkSync(flag);
    const calls = [];
    const fakeApp = { relaunch: (o) => calls.push(['relaunch', o]), exit: (c) => calls.push(['exit', c]) };
    const swapped = C.startSwap(fakeApp, { dir: app });
    ok(swapped && calls.map((c) => c[0]).join() === 'relaunch,exit', 'at start: swapped in, and starts once more (main.js changed) before any window');
    ok(read(path.join(app, 'ui.js')) === '// ui 2\n' && read(path.join(app, 'main.js')) === '// main 2\n' && read(path.join(app, 'notes.txt')) === 'one (my edit)\n' && dataSnap(app) === snap, 'the update is in, the edit and data/ kept');
    ok(!C.startSwap(fakeApp, { dir: app }) && calls.length === 2, 'the next start: one stat, nothing to do');
    const s2 = await create({ dir: app }).status({ fetch: false });
    ok(s2.ok && s2.swapped?.ok && s2.swapped.changed === 3 && s2.back, `the window hears it once, Go back offered (${JSON.stringify(s2.swapped).slice(0, 80)})`);
    ok(!(await create({ dir: app }).status({ fetch: false })).swapped, 'only once');
  }

  // ---------- 10. long paths (Windows simulated) ----------
  {
    const { dev, app } = setup();
    const deep = `tools/${'deep-folder/'.repeat(22)}a-file-with-a-long-name.js`;
    push(dev, { [deep]: '// deep\n' }, 'Deep');
    const U = create({ dir: app, platform: 'win32' });
    const r = await U.apply();
    ok(!r.ok && r.reason === 'longpath' && r.fix.id === 'longpaths' && r.fix.command === 'git config core.longpaths true', `long paths: Allow long paths for Hearth (${r.reason})`);
    ok(!fs.existsSync(path.join(app, 'tools')) && !C.readState(app, 'journal'), 'nothing written before');
    const f = await U.fix('longpaths');
    ok(f.ok && f.retry && g(app, 'config', 'core.longpaths') === 'true', 'switched on for this checkout only (no administrator)');
    ok((await U.apply()).ok && fs.existsSync(path.join(app, deep)), 'then the update goes in');
  }

  // ---------- 11. permissions (the password line only in a visible window, after the click) ----------
  {
    const { dev, app } = setup();
    push(dev, { 'ui.js': '// ui 2\n' }, 'Two');
    const real = execFileSync('sh', ['-c', 'command -v git']).toString().trim();
    const wrap = path.join(T, `permgit${n}`);
    fs.writeFileSync(wrap, `#!/bin/sh\nfor a in "$@"; do if [ "$a" = merge ]; then echo "error: insufficient permission for adding an object to repository database .git/objects" >&2; exit 128; fi; done\nexec ${real} "$@"\n`, { mode: 0o755 });
    const ran = [];
    for (const plat of ['darwin', 'win32']) {
      const U = create({ dir: app, gitBin: wrap, platform: plat, terminal: (o) => { ran.push(o); return { ok: true, window: plat === 'win32' ? 'PowerShell' : 'Terminal' }; } });
      const r = await U.apply();
      ok(!r.ok && r.reason === 'perm' && r.fix.id === 'own-folder' && (plat === 'win32' ? /icacls/.test(r.fix.command) && r.fix.admin : /sudo chown/.test(r.fix.command) && r.fix.password), `${plat}: permissions, the fixing line shown (${r.fix?.command})`);
      ok(ran.length === (plat === 'win32' ? 1 : 0), `${plat}: nothing ran before the click`);
      const f = await U.fix('own-folder');
      ok(f.waiting && ran.at(-1).lines.join() === r.fix.command && f.message.includes(r.fix.command), `${plat}: after the click, in a visible window`);
      ok(head(app) && read(path.join(app, 'ui.js')) === '// ui 1\n', `${plat}: nothing changed meanwhile`);
    }
  }

  // ---------- 12. a half-finished update (a crash / power cut in the middle) ----------
  for (const how of ['rollback', 'resume']) {
    const { dev, app } = setup();
    push(dev, { 'ui.js': '// ui 2\n', 'extra.js': '// new\n' }, 'Two');
    const U = create({ dir: app });
    await U.status();
    const from = head(app); const to = g(app, 'rev-parse', 'origin/main');
    write(path.join(app, 'notes.txt'), 'one (my edit)\n');
    // what an interrupted apply leaves: the edit stashed (named), some new files written, the journal
    const name = C.stashName('edits', from, to);
    g(app, 'stash', 'push', '-m', name);
    const edits = { sha: g(app, 'rev-parse', 'stash@{0}'), name };
    write(path.join(app, 'ui.js'), '// ui 2\n'); write(path.join(app, 'extra.js'), '// new\n');
    C.writeState(app, 'journal', { step: 'merge', from, to, at: Date.now() - 60000, branch: 'main', edits });
    const s = await U.status({ fetch: false });
    ok(!s.ok && s.reason === 'half' && s.fix.id === 'resume' && s.alt.id === 'rollback' && s.message.includes(name), `${how}: half-finished seen: Finish / Go back, the stash named (${s.message.slice(0, 80)})`);
    const f = await U.fix(how);
    if (how === 'rollback') ok(f.ok && f.rolledBack && head(app) === from && read(path.join(app, 'ui.js')) === '// ui 1\n' && !fs.existsSync(path.join(app, 'extra.js')) && read(path.join(app, 'notes.txt')) === 'one (my edit)\n', `rolled back cleanly (${f.message})`);
    else ok(f.ok && head(app) === to && read(path.join(app, 'ui.js')) === '// ui 2\n' && read(path.join(app, 'notes.txt')) === 'one (my edit)\n', `finished (${JSON.stringify(f).slice(0, 100)})`);
    ok(!stashes(app) && !C.readState(app, 'journal') && (await U.status({ fetch: false })).ok, `${how}: no stash left, journal closed`);
  }
  {
    // a merge left open by hand (MERGE_HEAD with conflict marks)
    const { dev, app } = setup();
    push(dev, { 'notes.txt': 'theirs\n' }, 'Theirs');
    write(path.join(app, 'notes.txt'), 'mine\n');
    g(app, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'mine');
    const mine = head(app);
    g(app, 'fetch', '-q');
    try { g(app, '-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', 'origin/main'); } catch { /* the conflict */ }
    const U = create({ dir: app });
    const s = await U.status({ fetch: false });
    ok(!s.ok && s.reason === 'half' && s.merging === 'MERGE_HEAD', 'a merge left open: half-finished');
    const f = await U.fix('rollback');
    ok(f.ok && head(app) === mine && read(path.join(app, 'notes.txt')) === 'mine\n' && !fs.existsSync(path.join(app, '.git', 'MERGE_HEAD')), 'rolled back: the merge aborted, my version intact');
  }

  // ---------- 13. an update that would touch data/ is refused ----------
  {
    const { dev, app } = setup();
    write(path.join(dev, 'data', 'chats', 'c1.json'), '{"title":"overwritten"}');
    g(dev, 'add', '-f', 'data/chats/c1.json'); g(dev, 'commit', '-qm', 'bad'); g(dev, 'push', '-q', 'origin', 'main');
    const snap = dataSnap(app);
    const r = await create({ dir: app }).apply();
    ok(!r.ok && r.reason === 'data' && dataSnap(app) === snap && !g(app, 'status', '--porcelain'), `an update touching data/: refused, nothing changed (${r.reason})`);
  }

  // ---------- 14. the IPC: ids only ----------
  {
    const added = new Set();
    require('../updatermain').register({ handle: (ch) => added.add(ch) }, { restart: () => {}, getWin: () => null });
    ok(['update:status', 'update:apply', 'update:back', 'update:fix', 'update:restart', 'update:reload'].every((c) => added.has(c)), 'IPC channels');
    const { app } = setup();
    ok(!(await create({ dir: app }).fix('rm -rf /')).ok, 'an unknown fix id runs nothing');
  }

  fs.rmSync(T, { recursive: true, force: true });
  console.log(`updatesafe-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
