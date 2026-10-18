#!/usr/bin/env node
// (round 60, winfresh60) A fresh Windows install from Hearth-Windows.zip, simulated with REAL git in temp folders: a
// SHALLOW checkout (depth 50) of an older main, core.autocrlf=false / core.filemode=false, a remote-tracking main left
// from before the zip was made (an island the checkout's history doesn't reach, as in the real zip), no git identity
// (a Git for Windows just installed), the folder named "Hearth" (not agent-hub). Then main moves on: a window file, a
// main-process file, config.json's defaults, a gap of more than 50 versions, a branch forked below the shallow edge,
// the owner's own commit (diverged), main rewritten below the edge (deeper fetch), main replaced by unrelated history
// (taken, the old version kept as a branch). Plus: configsafe's first-start move, a private repo refusing (401 / 403 /
// "Repository not found" → sign in to GitHub, never "no network"), Git missing on Windows, the shortcut / login-item
// helpers (winfresh-core.js) and no code assuming the folder is called agent-hub.
//   node dev/winfresh-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const C = require('../updatesafe-core');
const CS = require('../configsafe-core');
const W = require('../winfresh-core');
const { create } = require('../updatermain');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
for (const k of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete process.env[k];
for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL']) delete process.env[k];
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-winfresh-'));
// a computer where Git was just installed: no user.name / user.email, and git may not guess one
process.env.GIT_CONFIG_GLOBAL = path.join(T, 'global.gitconfig');
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, '[user]\n\tuseConfigOnly = true\n');
process.env.GIT_CONFIG_NOSYSTEM = '1';
const ID = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ID } }).trim();
const gTry = (cwd, ...args) => { try { return g(cwd, ...args); } catch { return null; } };
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
const head = (d) => g(d, 'rev-parse', 'HEAD');

const DEF1 = { settings: { theme: 'forge', launchAtStartup: false }, agents: [{ id: 'claude', name: 'Claude' }, { id: 'threedirector', name: 'Three Director', dock: 'three' }] };
const DEF2 = { settings: { theme: 'forge', launchAtStartup: false, quietHints: true }, agents: [...DEF1.agents, { id: 'astra', name: 'Astra' }] };

(async () => {
  // ---------- the "GitHub" main, an older main the zip was made from, the zip itself ----------
  const origin = path.join(T, 'origin.git');
  g(T, 'init', '-q', '--bare', '-b', 'main', origin);
  const dev = path.join(T, 'dev');
  g(T, 'clone', '-q', origin, dev);
  write(path.join(dev, '.gitignore'), 'data/\nelectron/\n');
  write(path.join(dev, 'index.html'), '<script defer src="ui.js"></script>');
  write(path.join(dev, 'ui.js'), '// ui 0\n');
  write(path.join(dev, 'main.js'), '// main 0\n');
  write(path.join(dev, 'notes.txt'), 'one\n');
  write(path.join(dev, 'configsafe-core.js'), '// this version keeps settings in data/\n'); // (Go back: no hand-back to a pre-move version)
  write(path.join(dev, 'config.json'), json(DEF1));
  g(dev, 'add', '-A'); g(dev, 'commit', '-qm', 'first');
  const commits = (n, tag) => { for (let i = 0; i < n; i += 1) { write(path.join(dev, 'log.txt'), `${tag} ${i}\n`); g(dev, 'add', 'log.txt'); g(dev, 'commit', '-qm', `${tag} ${i}`); } };
  commits(60, 'old');
  g(dev, 'push', '-q', 'origin', 'main');
  // the zip: a depth-50 clone of the main of that day, then the newer version fetched (depth 50) from another place and
  // checked out, so the remote-tracking main is the older one and below this checkout's history
  const app = path.join(T, 'Users', 'Jane Doe', 'Hearth');
  fs.mkdirSync(path.dirname(app), { recursive: true });
  g(T, 'clone', '-q', '--depth', '50', '--branch', 'main', `file://${origin}`, app);
  commits(70, 'zip');
  g(dev, 'push', '-q', 'origin', 'main');
  g(app, 'fetch', '-q', '--depth', '50', `file://${origin}`, 'main');
  g(app, 'reset', '-q', '--hard', 'FETCH_HEAD');
  g(app, 'config', 'core.autocrlf', 'false'); g(app, 'config', 'core.filemode', 'false');
  fs.rmSync(path.join(app, '.git', 'logs', 'refs', 'remotes'), { recursive: true, force: true }); // (the zip carried none)
  ok(g(app, 'rev-parse', '--is-shallow-repository') === 'true' && !gTry(app, 'merge-base', 'HEAD', 'origin/main'), 'set-up: a shallow checkout whose origin/main is an island below its history (like the real zip)');

  // ---------- 1. first start: configsafe moves the tracked config into data/, nothing dirty after ----------
  const cfg = CS.migrate({ appDir: app, dataDir: path.join(app, 'data') });
  const own = JSON.parse(read(path.join(app, 'data', 'config.json')));
  ok(cfg.mode === 'data' && cfg.migrated[0] === 'config.json' && own.defaultsSeen.join() === 'claude,threedirector', `fresh install: config.json moved into data/ (${cfg.mode} ${cfg.migrated})`);
  const U = create({ dir: app, platform: 'win32' });
  const after = await CS.afterStart(U, cfg);
  ok(after.settled.length === 0 && after.brought.length === 0 && !g(app, 'status', '--porcelain', '--untracked-files=no'), `fresh install: nothing settled or brought, the checkout stays clean (${JSON.stringify(after)})`);

  // ---------- 2. before any look at GitHub: the zip's old origin/main offers nothing ----------
  let s = await U.status({ fetch: false });
  ok(s.ok && s.behind === 0 && s.ahead === 0 && s.stale && !s.commits.length && !s.plan.diverged, `not looked yet: no "update" from the zip's old note (${JSON.stringify({ b: s.behind, a: s.ahead, stale: s.stale })})`);
  s = await U.status();
  ok(s.ok && s.behind === 0 && s.ahead === 0 && !s.stale, `first real look: up to date, nothing of "its own" (${JSON.stringify({ b: s.behind, a: s.ahead, r: s.reason, m: s.message })})`);

  // ---------- 3. main moves on: window file, main-process file, config.json defaults; a hand edit kept ----------
  write(path.join(dev, 'ui.js'), '// ui 1\n'); g(dev, 'commit', '-qam', 'Sharper chat cards');
  write(path.join(dev, 'main.js'), '// main 1\n'); g(dev, 'commit', '-qam', 'Main side');
  write(path.join(dev, 'config.json'), json(DEF2)); g(dev, 'commit', '-qam', 'New default agent');
  g(dev, 'push', '-q', 'origin', 'main');
  write(path.join(app, 'notes.txt'), 'one (my edit)\n');
  s = await U.status();
  ok(s.ok && s.behind === 3 && s.ahead === 0 && !s.plan.diverged && s.commits[0].subject === 'New default agent', `behind 3, not diverged (${JSON.stringify({ b: s.behind, a: s.ahead, p: s.plan })})`);
  const before = head(app);
  let r = await U.apply();
  ok(r.ok && r.changed === 3 && r.restart === true && read(path.join(app, 'main.js')) === '// main 1\n', `updated on a shallow checkout, restart for main.js (${JSON.stringify(r).slice(0, 220)})`);
  ok(read(path.join(app, 'notes.txt')) === 'one (my edit)\n' && /back in place/.test(r.note || ''), 'the hand edit went into a named stash and came back');
  ok(!g(app, 'stash', 'list') && !C.readState(app, 'journal'), 'the stash is dropped once back, journal closed');
  const eff = CS.effective(JSON.parse(read(path.join(app, 'data', 'config.json'))), JSON.parse(read(path.join(app, 'config.json'))));
  ok(eff.agents.some((a) => a.id === 'astra') && eff.settings.quietHints === true && eff.agents.some((a) => a.id === 'threedirector'), 'config.json\'s new defaults reach what Hearth uses (new agent, new setting), the owner\'s agents kept');
  ok(read(path.join(app, 'data', 'config.json')) === json(own), 'data/config.json untouched by the update');

  // ---------- 4. Go back to the previous version, then forward again ----------
  s = await U.status({ fetch: false });
  ok(s.back && s.back.from === before.slice(0, 7), 'Go back is offered');
  r = await U.back();
  ok(r.ok && r.back && head(app) === before && read(path.join(app, 'main.js')) === '// main 0\n' && r.restart === true, `went back on a shallow checkout (${JSON.stringify(r).slice(0, 160)})`);
  ok(read(path.join(app, 'notes.txt')) === 'one (my edit)\n', 'going back keeps the hand edit');
  r = await U.apply();
  ok(r.ok && read(path.join(app, 'main.js')) === '// main 1\n', 'and forward again');

  // ---------- 5. a gap of more than 50 versions ----------
  commits(120, 'gap');
  write(path.join(dev, 'mcp', 'x-mcp.js'), '// server\n'); g(dev, 'add', '-A'); g(dev, 'commit', '-qm', 'A new MCP server');
  g(dev, 'push', '-q', 'origin', 'main');
  s = await U.status();
  ok(s.ok && s.behind === 121 && s.ahead === 0 && s.commits.length === 40, `121 behind across the gap (${s.behind}, ${s.ahead})`);
  r = await U.apply();
  ok(r.ok && head(app) === head(dev) && r.restart === true && g(app, 'rev-parse', '--is-shallow-repository') === 'true', `fast-forward across 121 versions, still shallow (${JSON.stringify(r).slice(0, 120)})`);

  // ---------- 6. a branch forked below the shallow edge merged into main ----------
  const old = g(dev, 'rev-list', '--max-parents=0', 'HEAD');
  g(dev, 'checkout', '-q', '-b', 'side', `${old}`); write(path.join(dev, 'side.txt'), 'side\n'); g(dev, 'add', '-A'); g(dev, 'commit', '-qm', 'Side work');
  g(dev, 'checkout', '-q', 'main'); g(dev, 'merge', '-q', '--no-edit', 'side'); g(dev, 'push', '-q', 'origin', 'main');
  s = await U.status();
  ok(s.ok && s.behind >= 2 && s.ahead === 0 && !s.plan.diverged, `a merge of a branch older than the shallow edge: behind (its old root counts too), nothing "of its own" (${s.behind}, ${s.ahead})`);
  r = await U.apply();
  ok(r.ok && read(path.join(app, 'side.txt')) === 'side\n', 'and it goes in');

  // ---------- 7. the owner's own commit + main moved on: merged (no git identity on this computer) ----------
  write(path.join(app, 'mine.txt'), 'mine\n'); g(app, 'add', 'mine.txt'); g(app, 'commit', '-qm', 'My own change');
  write(path.join(dev, 'ui.js'), '// ui 2\n'); g(dev, 'commit', '-qam', 'Cards again'); g(dev, 'push', '-q', 'origin', 'main');
  s = await U.status();
  ok(s.ok && s.behind === 1 && s.ahead === 1 && s.plan.diverged && !s.plan.unrelated, `diverged by one own change (${s.ahead})`);
  r = await U.apply();
  ok(r.ok && read(path.join(app, 'mine.txt')) === 'mine\n' && read(path.join(app, 'ui.js')) === '// ui 2\n', `combined with main without a git identity set (${JSON.stringify(r).slice(0, 160)})`);
  ok(/Hearth/.test(g(app, 'log', '-1', '--format=%an')), 'the merge is signed "Hearth"');

  // ---------- 8. main rewritten below the shallow edge: a deeper fetch finds where they meet ----------
  {
    const o2 = path.join(T, 'o2.git'); g(T, 'clone', '-q', '--bare', origin, o2);
    const d2 = path.join(T, 'd2'); g(T, 'clone', '-q', o2, d2);
    const a2 = path.join(T, 'a2', 'Hearth'); fs.mkdirSync(path.dirname(a2), { recursive: true });
    g(T, 'clone', '-q', '--depth', '50', `file://${o2}`, a2);
    write(path.join(a2, 'mine2.txt'), 'mine\n'); g(a2, 'add', 'mine2.txt'); g(a2, 'commit', '-qm', 'Mine on top');
    g(d2, 'reset', '-q', '--hard', 'HEAD~80'); write(path.join(d2, 're.txt'), 're\n'); g(d2, 'add', '-A'); g(d2, 'commit', '-qm', 'Rewritten'); g(d2, 'push', '-q', '-f', 'origin', 'main');
    const U2 = create({ dir: a2 });
    const s2 = await U2.status();
    ok(s2.ok && gTry(a2, 'merge-base', 'HEAD', 'origin/main') && s2.behind === 1 && s2.plan.diverged && !s2.plan.unrelated, `the merge base below the edge is fetched (--deepen) before counting (${JSON.stringify({ b: s2.behind, a: s2.ahead, p: s2.plan })})`);
  }

  // ---------- 9. main replaced by unrelated history: nothing made here → taken; something made here → kept aside ----------
  {
    const o3 = path.join(T, 'o3.git'); g(T, 'clone', '-q', '--bare', origin, o3);
    const a3 = path.join(T, 'a3', 'Hearth'); fs.mkdirSync(path.dirname(a3), { recursive: true });
    g(T, 'clone', '-q', '--depth', '50', `file://${o3}`, a3);
    write(path.join(a3, 'notes.txt'), 'one (edit in a3)\n');
    const d3 = path.join(T, 'd3'); g(T, 'clone', '-q', o3, d3);
    g(d3, 'checkout', '-q', '--orphan', 'fresh'); write(path.join(d3, 'notes.txt'), 'one\n'); write(path.join(d3, 'ui.js'), '// fresh\n');
    g(d3, 'add', '-A'); g(d3, 'commit', '-qm', 'Fresh history'); g(d3, 'push', '-q', '-f', 'origin', 'fresh:main');
    const was = head(a3);
    const U3 = create({ dir: a3 });
    const s3 = await U3.status();
    ok(s3.ok && s3.behind === 1 && s3.ahead === 0 && s3.plan.unrelated && s3.plan.take && !s3.plan.diverged && g(a3, 'rev-parse', '--is-shallow-repository') === 'false', `unrelated even after fetching all: nothing made here, main is taken (${JSON.stringify({ b: s3.behind, a: s3.ahead, p: s3.plan })})`);
    const r3 = await U3.apply();
    ok(r3.ok && head(a3) === head(d3) && read(path.join(a3, 'ui.js')) === '// fresh\n' && read(path.join(a3, 'notes.txt')) === 'one (edit in a3)\n', `taken with the hand edit kept (${JSON.stringify(r3).slice(0, 160)})`);
    ok(g(a3, 'branch', '--list', 'hearth-saved-*', '--format=%(objectname)') === was, 'the version before is kept as a hearth-saved branch');
    // the same with a version made here: never merged, kept on a side branch by the one fix
    const a4 = path.join(T, 'a4', 'Hearth'); fs.mkdirSync(path.dirname(a4), { recursive: true });
    g(T, 'clone', '-q', '--depth', '50', `file://${origin}`, a4);
    g(a4, 'remote', 'set-url', 'origin', o3);
    write(path.join(a4, 'own.txt'), 'own\n'); g(a4, 'add', 'own.txt'); g(a4, 'commit', '-qm', 'Made here');
    const U4 = create({ dir: a4 });
    const s4 = await U4.status();
    ok(s4.ok && s4.ahead === 1 && s4.plan.unrelated && s4.plan.diverged && !s4.plan.take, `unrelated with one version made here: counted as 1, not the whole history (${s4.ahead})`);
    const r4 = await U4.apply();
    ok(!r4.ok && r4.reason === 'diverged' && r4.fix.id === 'side-branch' && /1 change of its own/.test(r4.message), `kept aside, not merged (${r4.reason}: ${r4.message?.slice(0, 80)})`);
    const f4 = await U4.fix('side-branch');
    ok(f4.ok && f4.side && head(a4) === head(d3) && g(a4, 'show', `${f4.side}:own.txt`) === 'own', `Keep mine aside and update (${JSON.stringify(f4).slice(0, 120)})`);
  }

  // ---------- 10. a checkout with no fetch line in its config still updates origin/main ----------
  {
    const a5 = path.join(T, 'a5', 'Hearth'); fs.mkdirSync(path.dirname(a5), { recursive: true });
    g(T, 'clone', '-q', '--depth', '50', `file://${origin}`, a5);
    g(a5, 'config', '--unset-all', 'remote.origin.fetch');
    write(path.join(dev, 'ui.js'), '// ui 3\n'); g(dev, 'commit', '-qam', 'Cards three'); g(dev, 'push', '-q', 'origin', 'main');
    const s5 = await create({ dir: a5 }).status();
    ok(s5.ok && s5.behind === 1 && s5.commits[0].subject === 'Cards three', `no fetch line: origin/main still updated (${s5.behind} ${s5.message || ''})`);
  }

  // ---------- 11. a private repo refusing: sign in to GitHub, never "no network" ----------
  {
    const said = {
      'remote: Repository not found.\nfatal: repository \'https://github.com/kidswaste/hearth.git/\' not found': 'auth',
      'fatal: unable to access \'https://github.com/kidswaste/hearth.git/\': The requested URL returned error: 403': 'auth',
      'remote: Permission to kidswaste/hearth.git denied to someone.\nfatal: unable to access \'https://github.com/kidswaste/hearth.git/\': The requested URL returned error: 403': 'auth',
      'fatal: Authentication failed for \'https://github.com/kidswaste/hearth.git/\'': 'auth',
      'fatal: unable to access \'https://github.com/kidswaste/hearth.git/\': The requested URL returned error: 401': 'auth',
      'fatal: Cannot prompt because user interactivity has been disabled.\nfatal: could not read Username for \'https://github.com\': terminal prompts disabled': 'auth',
      'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.': 'auth',
      'fatal: unable to access \'https://github.com/kidswaste/hearth.git/\': Could not resolve host: github.com': 'network',
      'fatal: unable to access \'https://github.com/kidswaste/hearth.git/\': Failed to connect to github.com port 443': 'network',
    };
    for (const [t, want] of Object.entries(said)) ok(C.classify(t) === want, `"${t.slice(0, 70)}…" → ${want} (${C.classify(t)})`);
    const wrap = path.join(T, 'git-private.sh');
    write(wrap, `#!/bin/sh\nfor a in "$@"; do if [ "$a" = fetch ]; then echo "remote: Repository not found." >&2; echo "fatal: repository 'https://github.com/kidswaste/hearth.git/' not found" >&2; exit 128; fi; done\nexec git "$@"\n`);
    fs.chmodSync(wrap, 0o755);
    const ran = [];
    const Up = create({ dir: app, gitBin: wrap, platform: 'win32', terminal: (o) => { ran.push(o); return { ok: true, window: 'PowerShell' }; } });
    const sp = await Up.status();
    ok(!sp.ok && sp.why === 'auth' && sp.fix?.id === 'sign-in' && /private/.test(sp.message) && /sign/i.test(sp.message) && !/internet|VPN/i.test(sp.message), `Repository not found: sign in to GitHub (${sp.why}: ${sp.message?.slice(0, 120)})`);
    ok(/Git Credential Manager/.test(sp.message) && /never sees your password/.test(sp.message), 'Windows: GitHub\'s own window (Git Credential Manager), no password in Hearth');
    ok(sp.fix.command.includes(`-C "${app}" fetch origin main`), `the sign-in command is shown, the folder quoted (${sp.fix.command})`);
    const f = await Up.fix('sign-in');
    ok(f.ok && f.waiting && ran.length === 1 && /fetch origin main/.test(ran[0].lines.join('\n')), 'Sign in to GitHub opens a visible window only after the click');
    const mac = C.explain('auth', { platform: 'darwin', dir: '/Users/q/Library/Application Support/Hearth' });
    ok(/token/.test(mac.message) && /keychain/.test(mac.message) && mac.fix.id === 'sign-in' && !/gh auth/.test(mac.message), 'a Mac: Terminal asks for the user name and a token (no gh needed)');
    const off = C.explain('auth', { platform: 'win32', dir: app, git: 'C:\\Program Files\\Git\\cmd\\git.exe' });
    ok(off.fix.command.startsWith('& "C:\\Program Files\\Git\\cmd\\git.exe" -C'), `git found off PATH: the command uses it (${off.fix.command})`);
  }

  // ---------- 12. Git missing on Windows: install, then GitHub's sign-in in the same window ----------
  {
    const ran = [];
    const Ug = create({ dir: app, gitBin: path.join(T, 'no-such-git'), gitCandidates: [], platform: 'win32', terminal: (o) => { ran.push(o); return { ok: true, window: 'PowerShell' }; } });
    const sg = await Ug.status();
    ok(!sg.ok && sg.reason === 'git' && sg.fix.id === 'install-git' && /private/.test(sg.message) && /sign in/.test(sg.message), `no Git: install, and said that GitHub asks to sign in once (${sg.message})`);
    const fg = await Ug.fix('install-git');
    const all = ran[0]?.lines.join('\n') || '';
    ok(fg.ok && /winget install --id Git\.Git/.test(all) && /git-scm\.com\/download\/win/.test(all) && all.includes(`-C "${app}" fetch origin main`), `the window installs Git (winget, else the download page) then signs in (${all.replace(/\n/g, ' | ').slice(0, 220)})`);
  }

  // ---------- 13. stashes on the shallow checkout keep Hearth's names ----------
  {
    write(path.join(app, 'notes.txt'), 'one (another edit)\n');
    write(path.join(dev, 'notes.txt'), 'one (theirs)\n'); g(dev, 'commit', '-qam', 'Notes clash'); g(dev, 'push', '-q', 'origin', 'main');
    const rr = await U.apply();
    const list = g(app, 'stash', 'list', '--format=%gs');
    ok(rr.ok && rr.kept?.includes('notes.txt') && C.OWN_EDITS.test(list) && /\(([0-9a-f]{7}) → ([0-9a-f]{7})\)/.test(list), `a clash keeps the edit in a stash Hearth finds by name (${list})`);
  }

  // ---------- 14. the shortcuts and the login item (winfresh-core) ----------
  {
    const dir = 'C:\\Users\\Jane Doe\\Hearth';
    const exe = `${dir}\\electron\\electron.exe`;
    ok(W.loginItemArgs(dir, 'win32')[0] === '"C:\\Users\\Jane Doe\\Hearth"' && W.loginItemArgs('/x y/Hearth', 'linux')[0] === '/x y/Hearth', 'Start with Windows: the folder quoted (Electron joins arguments unquoted)');
    ok(W.shortcutArgs(dir) === '"C:\\Users\\Jane Doe\\Hearth" --restart', 'the shortcut: "<folder>" --restart');
    ok(W.shortcutPlan({ existing: null, execPath: exe, appDir: dir }).action === 'create', 'no shortcut yet: made');
    ok(W.shortcutPlan({ existing: { target: exe, args: `"${dir}" --restart` }, execPath: exe, appDir: `${dir}\\.` }).action === 'keep', 'already this copy\'s (Start Hearth.cmd passes "<folder>\\."): kept');
    ok(W.shortcutPlan({ existing: { target: exe.toLowerCase(), args: `"${dir.toLowerCase()}" --restart` }, execPath: exe, appDir: dir }).action === 'keep', 'letter case doesn\'t matter on Windows');
    const old = 'C:\\Users\\Jane Doe\\agent-hub';
    const elsewhere = W.shortcutPlan({ existing: { target: `${old}\\electron\\electron.exe`, args: `"${old}" --restart` }, execPath: exe, appDir: dir, exists: (d) => d === old });
    ok(elsewhere.action === 'elsewhere' && elsewhere.other === old, 'an older copy\'s shortcut, that copy still there: left alone, said once');
    ok(W.shortcutPlan({ existing: { target: `${old}\\electron\\electron.exe`, args: `"${old}" --restart` }, execPath: exe, appDir: dir, exists: () => false }).action === 'create', 'the older copy is gone: pointed here');
    ok(W.shortcutPlan({ existing: { target: `${old}\\electron\\electron.exe`, args: '--restart' }, execPath: exe, appDir: dir, exists: (d) => d === old }).action === 'elsewhere', 'a shortcut without the folder argument: its folder from electron.exe\'s place');
    ok(W.shortcutPlan({ marker: { appDir: dir }, existing: null, execPath: exe, appDir: dir }).action === 'done', 'once per copy (the note in its data folder)');
    ok(W.shortcutPlan({ marker: { appDir: old }, existing: null, execPath: exe, appDir: dir }).action === 'create', 'a data folder carried from another copy: this copy still gets its shortcuts');
  }

  // ---------- 15. nothing assumes the folder is called agent-hub ----------
  {
    const hits = [];
    for (const f of fs.readdirSync(ROOT).filter((x) => /\.(js|cmd|html)$/.test(x))) {
      fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((l, i) => { if (/agent-hub[\\/]|[\\/]agent-hub\b(?!-)/.test(l) && !/^\s*\/\//.test(l)) hits.push(`${f}:${i + 1}`); });
    }
    ok(!hits.length, `no path names the agent-hub folder (${hits.join(', ')})`);
    const sh = fs.readFileSync(path.join(ROOT, 'appshell.js'), 'utf8');
    ok(/loginItemArgs\(__dirname\)/.test(sh) && !/args: \[app\.getAppPath\(\)\]/.test(sh), 'the login item uses the folder Hearth runs from, quoted');
  }

  fs.rmSync(T, { recursive: true, force: true });
  console.log(`winfresh: ${pass} passed, ${fail} failed`);
  console.log(JSON.stringify({ pass: fail === 0, passed: pass, failed: fail }));
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); fs.rmSync(T, { recursive: true, force: true }); process.exit(1); });
