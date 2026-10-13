// Unit test for updatermain.js on real throwaway git repos: an "origin" with main, a clone standing in for the
// installed app (with updatermain.js and a small index.html in it), new commits pushed from another clone.
// Checks: up to date, behind with the new subjects, a hand edit kept through the pull (--autostash), reload vs restart
// (a window file vs a main-process file), a clash reported without losing the edit, no git repo, offline origin.
//   node dev/updater-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-updater-'));
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const fails = [];
const ok = (c, what) => { console.log(`${c ? '✓' : '✖'} ${what}`); if (!c) fails.push(what); };

(async () => {
  const origin = path.join(T, 'origin.git');
  g(T, 'init', '--bare', '-b', 'main', origin);
  const dev = path.join(T, 'dev');
  g(T, 'clone', origin, dev);
  write(path.join(dev, 'index.html'), '<script defer src="ui.js"></script><link rel="stylesheet" href="app.css">');
  write(path.join(dev, 'ui.js'), '// ui 1\n');
  write(path.join(dev, 'app.css'), 'body{}\n');
  write(path.join(dev, 'main.js'), '// main 1\n');
  write(path.join(dev, 'notes.txt'), 'one\n');
  fs.copyFileSync(path.join(__dirname, '..', 'updatermain.js'), path.join(dev, 'updatermain.js'));
  g(dev, 'add', '-A'); g(dev, 'commit', '-qm', 'first'); g(dev, 'push', '-q', 'origin', 'main');
  const app = path.join(T, 'app');
  g(T, 'clone', '-q', origin, app);
  const U = require(path.join(app, 'updatermain.js'));

  let s = await U.status();
  ok(s.ok && s.behind === 0, `up to date at first (${JSON.stringify(s).slice(0, 120)})`);

  // a window-only change → reload
  write(path.join(dev, 'ui.js'), '// ui 2\n'); g(dev, 'commit', '-qam', 'Sharper chat cards');
  write(path.join(dev, 'app.css'), 'body{color:red}\n'); g(dev, 'commit', '-qam', 'Redder');
  g(dev, 'push', '-q', 'origin', 'main');
  s = await U.status();
  ok(s.behind === 2 && s.commits[0].subject === 'Redder' && s.commits[1].subject === 'Sharper chat cards', `behind 2 with the subjects (${s.behind}: ${s.commits.map((c) => c.subject)})`);
  write(path.join(app, 'notes.txt'), 'one (my edit)\n'); // a hand edit
  s = await U.status({ fetch: false });
  ok(s.dirty === 1, `a hand edit is seen (${s.dirty})`);
  let r = await U.apply();
  ok(r.ok && r.changed === 2 && r.restart === false, `window files only: reload (${JSON.stringify(r).slice(0, 160)})`);
  ok(fs.readFileSync(path.join(app, 'ui.js'), 'utf8') === '// ui 2\n', 'the new code is in place');
  ok(fs.readFileSync(path.join(app, 'notes.txt'), 'utf8') === 'one (my edit)\n', 'the hand edit is kept');
  s = await U.status();
  ok(s.behind === 0, 'up to date after');

  // (round 29) patch notes: the rounds this copy doesn't have yet, newest first, read from the fetched main
  write(path.join(dev, 'docs', 'patch-notes', 'round-7.md'), '# Round 7\nSeven.\n');
  write(path.join(dev, 'docs', 'patch-notes', 'round-12.md'), '# Round 12\nTwelve.\n');
  g(dev, 'add', '-A'); g(dev, 'commit', '-qm', 'Patch notes'); g(dev, 'push', '-q', 'origin', 'main');
  s = await U.status();
  ok(s.notes?.length === 2 && s.notes[0].round === 12 && /Twelve/.test(s.notes[0].text) && s.notes[1].round === 7, `patch notes not here yet, newest first (${s.notes?.map((n) => n.round)})`);
  ok(!fs.existsSync(path.join(app, 'docs', 'patch-notes', 'round-12.md')), 'read without touching the files here');
  await U.apply();
  s = await U.status();
  ok(s.notes.length === 0, 'none left after the update');

  // a main-process change → restart
  write(path.join(dev, 'main.js'), '// main 2\n'); g(dev, 'commit', '-qam', 'Main side'); g(dev, 'push', '-q', 'origin', 'main');
  r = await U.apply();
  ok(r.ok && r.restart === true, `main.js changed: restart (${r.restart})`);
  ok(U.needsRestart(['docs/upgrades/x.md', 'tools/three-seq.js', 'index.html']) === false && U.needsRestart(['mcp/board-mcp.js']) === true && U.needsRestart(['preload.js']) === true, 'restart only for main-process files');

  // a clash with a hand edit: reported, edit not lost
  write(path.join(dev, 'notes.txt'), 'one (their edit)\n'); g(dev, 'commit', '-qam', 'Notes'); g(dev, 'push', '-q', 'origin', 'main');
  r = await U.apply();
  const stash = g(app, 'stash', 'list');
  ok(r.ok && r.kept?.includes('notes.txt') && /stash/.test(r.note), `a clash is explained (${r.note?.slice(0, 90)})`);
  ok(fs.readFileSync(path.join(app, 'notes.txt'), 'utf8') === 'one (their edit)\n', 'the clashing file has the new version (no conflict marks)');
  ok(/stash@/.test(stash) && /my edit/.test(g(app, 'stash', 'show', '-p', 'stash@{0}')), 'the hand edit is safe in the stash');
  ok(!g(app, 'status', '--porcelain', '--untracked-files=no'), 'the checkout is clean');

  // offline origin
  g(app, 'remote', 'set-url', 'origin', path.join(T, 'nowhere.git'));
  s = await U.status();
  ok(!s.ok && s.reason === 'fetch', `offline: a plain message (${s.message?.slice(0, 60)})`);

  // not a repo
  const bare = path.join(T, 'plain'); fs.mkdirSync(bare);
  fs.copyFileSync(path.join(__dirname, '..', 'updatermain.js'), path.join(bare, 'updatermain.js'));
  const U2 = require(path.join(bare, 'updatermain.js'));
  s = await U2.status();
  ok(!s.ok && s.reason === 'repo', `not a git checkout: a plain message (${s.reason})`);

  fs.rmSync(T, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
