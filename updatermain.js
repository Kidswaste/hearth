// Updates from the app's own git checkout (the folder Hearth runs from: ~/Library/Application Support/Hearth on a Mac,
// %USERPROFILE%\agent-hub on Windows): looks at origin/main, lists what's new, pulls it (local edits kept with
// --autostash, like the pull command you ran by hand), then reloads the window, or restarts the app when a file the
// main process loads changed. Used by updater.js (the ⬆ Update button, /update).
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DIR = __dirname;
const BRANCH = 'main';

function git(args, { timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: DIR, timeout, windowsHide: true, maxBuffer: 4 * 1048576, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || err?.message || '').trim(), missing: err?.code === 'ENOENT' });
    });
  });
}

// files the window loads (a reload is enough when only these changed)
function rendererFiles() {
  const set = new Set();
  try {
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^":]+\.(?:js|css))"/g)) set.add(m[1].replace(/^\.\//, ''));
  } catch { /* none */ }
  return set;
}
function needsRestart(files) {
  const renderer = rendererFiles();
  return files.some((f) => {
    if (/^(docs|dev)\//.test(f) || /\.(md|png|jpe?g|svg|txt)$/i.test(f)) return false;
    if (f === 'index.html' || renderer.has(f) || /^tools\/.*\.(js|css|html)$/.test(f) && !/main\.js$/.test(f)) return false;
    if (/\.(css|html)$/.test(f)) return false;
    return true; // main.js, preload.js, *main.js, engines, mcp servers, package.json…
  });
}

async function status({ fetch = true } = {}) {
  const top = await git(['rev-parse', '--show-toplevel'], { timeout: 10000 });
  if (top.missing) return { ok: false, reason: 'git', message: 'Git isn\'t installed, so Hearth can\'t update itself. Install Git (Mac: run `xcode-select --install`; Windows: git-scm.com), then try again.' };
  if (!top.ok) return { ok: false, reason: 'repo', message: 'This copy of Hearth isn\'t a git checkout, so it can\'t pull updates.' };
  if (fetch) {
    const f = await git(['fetch', '--quiet', 'origin', BRANCH], { timeout: 90000 });
    if (!f.ok) return { ok: false, reason: 'fetch', message: `Couldn't reach GitHub (${(f.err.split('\n').find((l) => /^fatal:/.test(l)) || f.err.split('\n')[0] || 'no answer').replace(/^fatal:\s*/, '')}). Check the internet connection and try again.` };
  }
  const [head, remote, branch, dirty, log, ahead] = await Promise.all([
    git(['rev-parse', 'HEAD']), git(['rev-parse', `origin/${BRANCH}`]), git(['rev-parse', '--abbrev-ref', 'HEAD']),
    git(['status', '--porcelain', '--untracked-files=no']),
    git(['log', '--format=%h\t%s\t%ct', `HEAD..origin/${BRANCH}`, '-n', '40']),
    git(['rev-list', '--count', `origin/${BRANCH}..HEAD`]),
  ]);
  const commits = log.out ? log.out.split('\n').map((l) => { const [hash, subject, t] = l.split('\t'); return { hash, subject, at: Number(t) * 1000 }; }) : [];
  const count = await git(['rev-list', '--count', `HEAD..origin/${BRANCH}`]);
  // (round 29) the patch notes this copy doesn't have yet (docs/patch-notes/round-NN.md, newest first), read from the
  // fetched main without touching the files here
  const notes = [];
  const nd = await git(['diff', '--name-only', `HEAD..origin/${BRANCH}`, '--', 'docs/patch-notes/']);
  const roundOf = (f) => Number((/round-(\d+)\.md$/.exec(f) || [])[1]) || 0;
  for (const f of (nd.out ? nd.out.split('\n') : []).filter(roundOf).sort((x, y) => roundOf(y) - roundOf(x)).slice(0, 6)) {
    const t = await git(['show', `origin/${BRANCH}:${f}`]);
    if (t.ok && t.out) notes.push({ file: f, round: roundOf(f), text: t.out });
  }
  return {
    notes,
    ok: true, head: head.out.slice(0, 7), remote: remote.out.slice(0, 7), branch: branch.out,
    behind: Number(count.out) || 0, ahead: Number(ahead.out) || 0, commits,
    dirty: dirty.out ? dirty.out.split('\n').length : 0, dir: DIR,
  };
}

async function apply() {
  const before = await git(['rev-parse', 'HEAD']);
  const pull = await git(['pull', '--autostash', '--no-edit', 'origin', BRANCH], { timeout: 180000 });
  if (!pull.ok) {
    const conflict = /CONFLICT|conflict/.test(pull.out + pull.err);
    return { ok: false, conflict, message: conflict
      ? 'The update clashes with changes made to this copy by hand. Nothing was lost: your edits are kept in the stash (`git stash list`). Ask a chat to help merge them, or run the pull in a terminal.'
      : `The update didn't go through: ${(pull.err || pull.out).split('\n').slice(-2).join(' ')}` };
  }
  // the update went in but putting a hand edit back clashed: the clashing files get the new version (a file full of
  // conflict marks would break the app) and the hand edit stays safe in the stash
  let kept = [];
  const clash = await git(['diff', '--name-only', '--diff-filter=U']);
  if (clash.out || /autostash[^\n]*conflict/i.test(`${pull.out}\n${pull.err}`)) {
    kept = clash.out ? clash.out.split('\n') : [];
    await git(['reset', '-q']);
    if (kept.length) await git(['checkout', 'HEAD', '--', ...kept]);
  }
  const after = await git(['rev-parse', 'HEAD']);
  if (after.out === before.out) return { ok: true, changed: 0, restart: false, message: 'Already up to date.' };
  const diff = await git(['diff', '--name-only', before.out, after.out]);
  const files = diff.out ? diff.out.split('\n') : [];
  return { ok: true, changed: files.length, restart: needsRestart(files), from: before.out.slice(0, 7), to: after.out.slice(0, 7), files: files.slice(0, 200),
    kept, note: kept.length ? `Your own edits to ${kept.join(', ')} clashed with the update: the file${kept.length === 1 ? ' has' : 's have'} the new version, and your edits are kept in the stash (\`git stash list\`).` : '' };
}

function register(ipcMain, { restart, getWin }) {
  ipcMain.handle('update:status', (_e, opts) => status(opts || {}));
  ipcMain.handle('update:apply', () => apply());
  ipcMain.handle('update:restart', () => { setTimeout(restart, 150); return true; }); // after the answer reaches the window
  ipcMain.handle('update:reload', () => { getWin()?.webContents.reloadIgnoringCache(); return true; });
}

module.exports = { register, status, apply, needsRestart };
