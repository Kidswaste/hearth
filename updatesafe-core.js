// Safe updates (round 37, updatesafe), the pure part plus the start-up swap: what a git failure means in plain words
// and the one fix for it, Windows path lengths, the names of the stashes Hearth makes, where its own update notes live
// (inside the checkout's .git folder: never in data/), and the update Windows couldn't finish while Hearth ran,
// finished at the next start before anything else loads (main.js's first lines).
//   classify(text)            → a reason: network / proxy / ssl / auth / locked / perm / longpath / owner / untracked /
//                               local / conflict / diverged / lock / clt / unknown
//   explain(reason, ctx)      → { reason, message, fix?: { id, label, command?, password?, admin? } } — the fix's
//                               command is shown before the click; nothing that asks for a password runs silently
//   tooLong(dir, files, plat) → the incoming files whose full path Windows can't write (260+ characters)
//   stashName(kind, from, to) → 'hearth-update 2026-10-14 09:12 (abc1234 → def5678): your edits'
//   bringConfig(cur, other, head) → the owner's config.json parts / agents from a stash brought back, nothing removed
//   stateDir(dir)             → <checkout>/.git/hearth-update (a worktree's .git file is followed)
//   startSwap(app, opts)      → true when an update staged for the restart went in and Hearth starts once more
// Plain Node, no Electron: dev/updatesafe-test.js runs it with real git in temp folders.
const fs = require('fs');
const path = require('path');

const ORIGIN_URL = 'https://github.com/Kidswaste/hearth.git'; // the same as mac/connect-git.sh
const BRANCH = 'main';
const WIN_MAX = 259; // MAX_PATH 260 with the closing NUL: 259 characters is the longest path Windows writes without long paths
// never part of an update, never stashed, never reset: the owner's data and the local Electron
const OWN = /^(data|electron|electron-mac)(\/|$)/;

const RULES = [
  ['clt', /xcrun: error: invalid active developer path|no developer tools were found|requires the command line developer tools/i],
  ['owner', /detected dubious ownership|safe\.directory/i],
  ['lock', /index\.lock': File exists|Unable to create '[^']*\.lock'|Another git process seems to be running/i],
  ['longpath', /Filename too long|File name too long|path too long/i],
  ['untracked', /untracked working tree files would be (overwritten|removed)/i],
  ['local', /Your local changes to the following files would be overwritten|Please commit your changes or stash them/i],
  ['diverged', /divergent branches|Not possible to fast-forward|not possible to fast-forward|refusing to merge unrelated histories/i],
  ['conflict', /CONFLICT|Automatic merge failed|fix conflicts/i],
  ['locked', /unable to unlink|Unlink of file .* failed|Deletion of directory .* failed|Device or resource busy|being used by another process|unable to create file .*(Invalid argument|Permission denied)|Resource busy/i],
  ['perm', /Permission denied|insufficient permission|Operation not permitted|Read-only file system|EACCES|EPERM|unable to (create|write|open)/i],
  ['proxy', /proxy|Received HTTP code 407|CONNECT tunnel failed|Proxy CONNECT aborted/i],
  ['ssl', /SSL certificate problem|unable to get local issuer certificate|self[- ]signed certificate|server certificate verification failed|schannel/i],
  ['auth', /Authentication failed|could not read Username|terminal prompts disabled|Repository not found|HTTP Basic: Access denied|returned error: 403/i],
  ['network', /Could not resolve host|Failed to connect|Connection timed out|Connection refused|Network is unreachable|Operation timed out|timed out|unable to access|early EOF|RPC failed|Couldn't connect|does not appear to be a git repository|Could not read from remote/i],
];
function classify(text) {
  const t = String(text || '');
  for (const [reason, re] of RULES) if (re.test(t)) return reason;
  return 'unknown';
}
// the one line of git's own words worth showing ("fatal: …" without the prefix)
function gitLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const l = lines.find((x) => /^(fatal|error):/.test(x)) || lines.at(-1) || '';
  return l.replace(/^(fatal|error):\s*/, '').slice(0, 220);
}

const q = (p, plat) => (plat === 'win32' ? `"${p}"` : `"${String(p).replace(/(["\\$`])/g, '\\$1')}"`);
function installGit(plat) {
  if (plat === 'darwin') return { id: 'install-git', label: 'Install Git', command: 'xcode-select --install', note: 'Apple\'s own installer window opens (Git comes with Apple\'s command line tools).' };
  if (plat === 'win32') return { id: 'install-git', label: 'Install Git', command: 'winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements', note: 'It runs in a PowerShell window you can watch; Windows may ask to allow the installer.' };
  return { id: 'install-git', label: 'Install Git', command: 'sudo apt-get install -y git || sudo dnf install -y git', password: true, note: 'It runs in a terminal window; your password is typed there, never in Hearth.' };
}

// ctx: { platform, dir, detail, branch, ahead, behind, files, stash, side }
function explain(reason, ctx = {}) {
  const plat = ctx.platform || process.platform;
  const dir = ctx.dir || '';
  const said = ctx.detail ? ` (git said: ${gitLine(ctx.detail)})` : '';
  const retry = { id: 'retry', label: 'Try again' };
  const M = {
    git: () => ({ message: 'Git isn\'t installed on this computer, so Hearth can\'t update itself. It is a free tool from the people who make Hearth\'s update system; installing it takes a minute.', fix: installGit(plat) }),
    clt: () => ({ message: 'Git on this Mac needs Apple\'s command line tools, which aren\'t installed yet.', fix: installGit('darwin') }),
    repo: () => ({ message: 'This copy of Hearth isn\'t connected to Hearth on GitHub (it came from a zip or a copied folder), so it can\'t pull updates. Connecting keeps every file here as it is, your data included; the next update then brings in what\'s new.', fix: { id: 'connect', label: 'Connect to Hearth on GitHub', command: `git init\ngit remote add origin ${ORIGIN_URL}\ngit fetch origin ${BRANCH}\ngit reset origin/${BRANCH}   (files on disk stay as they are)\ngit branch -M ${BRANCH}` } }),
    'repo-other': () => ({ message: `Hearth's folder sits inside another git project (${ctx.top || 'a parent folder'}), not in its own checkout, so an update would pull the wrong project. Connecting gives Hearth's folder its own link to GitHub; the other project isn't touched.`, fix: { id: 'connect', label: 'Connect this folder to Hearth on GitHub', command: `git init\ngit remote add origin ${ORIGIN_URL}\ngit fetch origin ${BRANCH}\ngit reset origin/${BRANCH}   (files on disk stay as they are)` } }),
    owner: () => ({ message: 'Git refuses to work in Hearth\'s folder because it belongs to another user account on this computer (a copy made as administrator, or moved from another account).', fix: { id: 'safe-dir', label: 'Trust Hearth\'s folder', command: `git config --global --add safe.directory ${q(dir.replace(/\\/g, '/'), plat)}` } }),
    lock: () => ({ message: 'An earlier git command stopped half-way and left its "busy" marker behind, so nothing can change Hearth\'s files until it is cleared.', fix: { id: 'unlock', label: 'Clear the stuck marker', command: `delete ${path.join('.git', 'index.lock')} (only when no git is running)` } }),
    half: () => ({ message: `The last update stopped half-way${ctx.when ? ` (${ctx.when})` : ''}. Your edits are safe${ctx.stash ? ` in "${ctx.stash}"` : ''}. Finish it now, or go back to exactly how it was before.`, fix: { id: 'resume', label: 'Finish the update' }, alt: { id: 'rollback', label: 'Go back to how it was' } }),
    detached: () => ({ message: 'This copy isn\'t on the main line right now (git calls it a "detached HEAD": an older version was checked out by hand), so updates can\'t land. Hearth can step back onto main; anything made here is kept on its own branch first.', fix: { id: 'onto-main', label: 'Go back onto main', command: `git branch hearth-saved-<date>   (only if this version has something main doesn't)\ngit checkout ${BRANCH}` } }),
    diverged: () => ({ message: `This copy has ${ctx.ahead || 'some'} change${ctx.ahead === 1 ? '' : 's'} of its own that clash with what's new on main, so the two can't be combined by themselves. Hearth can keep yours on a side branch (nothing is deleted) and take main.`, fix: { id: 'side-branch', label: 'Keep mine aside and update', command: `git branch hearth-mine-<date>   (your ${ctx.ahead || ''} change${ctx.ahead === 1 ? '' : 's'}, kept)\ngit reset --keep origin/${BRANCH}` } }),
    conflict: () => ({ message: 'Your edits and the update changed the same lines. The update went in; your edits are kept in a named stash.', fix: null }),
    network: () => ({ message: `Couldn't reach GitHub${said}. Check the internet connection (or the VPN), then try again; nothing changed here.`, fix: retry }),
    proxy: () => ({ message: `Couldn't get through the network's proxy to GitHub${said}. Hearth also tried this computer's own proxy setting. If you're on a work or school network, try another network, then try again.`, fix: retry }),
    ssl: () => (plat === 'win32'
      ? { message: `GitHub's certificate couldn't be checked${said}: a work network or an antivirus is inspecting secure connections. Git can use Windows' own certificate store, which already trusts it.`, fix: { id: 'ssl-windows', label: 'Use Windows\' certificates', command: 'git config --global http.sslBackend schannel' } }
      : { message: `GitHub's certificate couldn't be checked${said}: a work network or an antivirus is inspecting secure connections. Try another network, then try again.`, fix: retry }),
    auth: () => ({ message: `GitHub asked for a sign-in to read Hearth's code${said}. Hearth never types passwords: if the project became private, sign in to GitHub in a terminal once (\`gh auth login\`), then try again.`, fix: retry }),
    locked: () => (plat === 'win32'
      ? { message: 'Windows is holding some of Hearth\'s files open while it runs, so they can\'t be replaced right now. Nothing was changed. Hearth can finish the update as it restarts, when those files are free (its helper processes close too).', fix: { id: 'restart-swap', label: 'Restart and finish the update' } }
      : { message: `Some of Hearth's files are busy and couldn't be replaced${said}. Nothing was changed. Restarting Hearth frees them and finishes the update.`, fix: { id: 'restart-swap', label: 'Restart and finish the update' } }),
    perm: () => (plat === 'win32'
      ? { message: `Windows didn't let Hearth change its own files${said}. Usually the folder was copied as administrator. Giving your account full control of Hearth's folder fixes it; Windows asks to allow it.`, fix: { id: 'own-folder', label: 'Fix the folder\'s permissions', admin: true, command: `icacls ${q(dir, plat)} /grant "%USERNAME%":(OI)(CI)F /T /Q` } }
      : { message: `This computer didn't let Hearth change its own files${said}. Usually some files were created by "sudo" once. Making your account the owner again fixes it; it asks for your password in a Terminal window (Hearth never sees it).`, fix: { id: 'own-folder', label: 'Fix the folder\'s owner', password: true, command: `sudo chown -R "$USER" ${q(dir, plat)}` } }),
    longpath: () => ({ message: `Some new files have paths longer than Windows allows by default (${ctx.files?.length || 'a few'} file${ctx.files?.length === 1 ? '' : 's'}, e.g. ${ctx.files?.[0] || '…'}). Git can write them when long paths are switched on for Hearth's folder (no administrator needed).`, fix: { id: 'longpaths', label: 'Allow long paths for Hearth', command: 'git config core.longpaths true' } }),
    untracked: () => ({ message: 'A file you added by hand has the same name as a new file in the update.', fix: retry }),
    local: () => ({ message: 'Files you changed by hand would be overwritten.', fix: retry }),
    data: () => ({ message: 'This update would change files inside Hearth\'s data folder, which updates never touch. Nothing was changed.', fix: null }),
    unknown: () => ({ message: `The update didn't go through${said}. Nothing was lost.`, fix: retry }),
  };
  const r = (M[reason] || M.unknown)();
  return { reason, ...r };
}

// the incoming files whose full Windows path is over the limit (dir as Windows writes it)
function tooLong(dir, files, plat = process.platform) {
  const P = path.win32;
  const base = plat === 'win32' ? dir : P.join('C:\\', ...String(dir).split(/[\\/]/).filter(Boolean));
  return (files || []).filter((f) => P.join(base, ...f.split('/')).length > WIN_MAX);
}
const stamp = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
const branchStamp = (now = new Date()) => stamp(now).replace(/[: ]/g, '-');
function stashName(kind, from, to, now = new Date()) {
  const what = { edits: 'your edits', files: 'your files with the same names as new ones', leftovers: 'files of an interrupted update', back: 'your edits (before going back)', move: 'your edits (before moving onto main)', during: 'written while the update ran' }[kind] || kind;
  return `hearth-update ${stamp(now)} (${String(from || '').slice(0, 7)} → ${String(to || '').slice(0, 7)}): ${what}`;
}
// a stash of the owner's own edits (config.json, theme.css…: tracked files Hearth itself writes), by its message
const OWN_EDITS = /hearth-update [^(]*\([0-9a-f]* → [0-9a-f]*\): your edits/;

// (round 54 fix, labchats54) config.json is a tracked file the app writes: the owner's agents, settings, look. An update
// puts it in a stash while git merges, so for that moment the file on disk is the repo's own (two agents, no Three
// Director). Round 53's window saved what it then saw (Tools: the rail's new tool placed) and the stash could not come
// back over it: the owner's config stayed in the stash, the Lab lost its docked director and its chats "disappeared".
// bringConfig(cur, other, head) → { value, brought: [what] }: what `other` (a config.json from a stash) has that `cur`
// lacks, or has only as the repo's own (`head`, git's config.json), brought into a copy of cur. Agents join by id
// (cur's own version wins; the repo's two alone count as "not the owner's"); a part the repo doesn't have keeps cur's
// values and gains the keys only other has. Nothing is ever removed. Not objects → cur unchanged.
function bringConfig(cur, other, head = null) {
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const brought = [];
  if (!isObj(cur) || !isObj(other)) return { value: cur, brought };
  const out = { ...cur };
  for (const [k, v] of Object.entries(other)) {
    if (k === 'agents') {
      if (!Array.isArray(v)) continue;
      const now = Array.isArray(out.agents) ? out.agents : [];
      const repoOnly = !now.length || (isObj(head) && Array.isArray(head.agents) && same(now, head.agents));
      if (repoOnly) {
        // the repo's agents only: the owner's list (its order), then any the repo's list adds
        const ids = new Set(v.map((a) => a?.id));
        const next = [...v, ...now.filter((a) => !ids.has(a?.id))];
        if (!same(next, now)) { out.agents = next; brought.push(...v.filter((a) => !now.some((x) => x?.id === a?.id)).map((a) => `agent ${a?.name || a?.id}`)); }
      } else {
        const ids = new Set(now.map((a) => a?.id));
        const add = v.filter((a) => a?.id && !ids.has(a.id));
        if (add.length) { out.agents = [...now, ...add]; brought.push(...add.map((a) => `agent ${a.name || a.id}`)); }
      }
      continue;
    }
    if (!(k in out) || (isObj(head) && k in head && same(out[k], head[k]))) {
      // (round 55, fixes55) the owner's values win; keys only the update's file has stay (nothing removed)
      const next = isObj(v) && isObj(out[k]) ? { ...out[k], ...v } : v;
      if (!same(out[k], next)) { out[k] = next; brought.push(k); }
      continue;
    }
    if (isObj(v) && isObj(out[k])) {
      const add = Object.keys(v).filter((kk) => !(kk in out[k]));
      if (add.length) { out[k] = { ...out[k], ...Object.fromEntries(add.map((kk) => [kk, v[kk]])) }; brought.push(...add.map((kk) => `${k}.${kk}`)); }
    }
  }
  return { value: out, brought };
}

// (round 55, fixes55) putting an update's stash back, ONE way for both places that do it: updatermain (the ⬆ Update
// while Hearth runs, async git) and swapSync (Windows: the update finished at the restart, sync git before any window).
// Round 54 made only the first one safe; the restart path still let one clash leave the owner's config.json (agents:
// the Lab's Three Director) and theme.css in the stash until the next start.
//  - a file of the stash written meanwhile goes in its own named stash first ("written while the update ran"), then
//    the owner's edits come back and config.json gains what that write added (bringConfig: the owner's values win)
//  - a clash: the owner's own files win (config.json = the update's file + the owner's agents / values via
//    bringConfig; theme.css = the owner's CSS); any other clashing file keeps the update's version (conflict marks
//    would break the app); the stash then stays, named
//  - a stash is never dropped unless it came back whole; a config.json that can't be read is never written over
// Written as a generator of git commands (yield [args] → { ok, out }) so both drivers share it. → { ok, kept, own }
const OWNER_FILES = ['config.json', 'theme.css'];
function* restoreSteps({ dir, stash, from = '', to = '' }) {
  if (!stash?.sha) return { ok: true, kept: [], own: [] };
  const ls = (r) => (r?.ok && r.out ? r.out.split('\n').filter(Boolean) : []);
  if (!from && !to) [, from = '', to = ''] = /\(([0-9a-f]*) → ([0-9a-f]*)\)/.exec(stash.name || '') || [];
  const inStash = new Set(ls(yield ['diff', '--name-only', `${stash.sha}^1`, stash.sha]));
  const touched = inStash.size ? ls(yield ['diff', '--name-only', 'HEAD']).filter((f) => inStash.has(f)) : [];
  let during = null;
  if (touched.length) {
    const name = stashName('during', from, to);
    if ((yield ['stash', 'push', '--include-untracked', '-m', name, '--', ...touched]).ok) {
      const s = (yield ['rev-parse', '--verify', '-q', 'stash@{0}']).out;
      if (s && s !== stash.sha && ((yield ['log', '-1', '--format=%gs', '-g', 'stash@{0}']).out || '').includes(name)) during = { sha: s, name };
    }
  }
  const headCfg = function* () { return parseJson(yield ['show', `HEAD:${CONFIG_FILE}`]); };
  const a = yield ['stash', 'apply', stash.sha];
  const clash = ls(yield ['diff', '--name-only', '--diff-filter=U']);
  if (a.ok && !clash.length) {
    yield* dropStash(stash.sha);
    const own = during && touched.includes(CONFIG_FILE) ? mergeConfigFile(dir, parseJson(yield ['show', `${during.sha}:${CONFIG_FILE}`]), yield* headCfg()) : [];
    return { ok: true, kept: [], own, during };
  }
  yield ['reset', '-q'];
  const own = [];
  const others = clash.filter((f) => !OWNER_FILES.includes(f));
  if (others.length) yield ['checkout', 'HEAD', '--', ...others];
  if (clash.includes('theme.css') && moved(dir)) {
    // (round 55, configsafe) moved: the tracked theme.css is the update's; the owner's CSS from the stash goes into
    // data/theme.css while that one is still the repo's own (an owner's data CSS is never written over)
    yield ['checkout', 'HEAD', '--', 'theme.css'];
    const t = yield ['show', `${stash.sha}:theme.css`];
    const pristine = new Set([(yield ['show', 'HEAD:theme.css']).out, (yield ['show', `${stash.sha}^1:theme.css`]).out]);
    const file = ownTarget(dir, 'theme.css');
    let mine = null; try { mine = fs.readFileSync(file, 'utf8'); } catch { mine = null; }
    if (t.ok && (mine == null || pristine.has(String(mine).replace(/\s+$/, '')))) {
      try { const tmp = `${file}.${process.pid}.update.tmp`; fs.writeFileSync(tmp, `${t.out}\n`); fs.renameSync(tmp, file); own.push('theme.css'); } catch (err) { console.warn('update: theme.css not written', err.code || err.message); }
    }
  } else if (clash.includes('theme.css')) {
    // the owner's CSS wins (the update's theme.css stays in git's history)
    if ((yield ['checkout', stash.sha, '--', 'theme.css']).ok) { yield ['reset', '-q', '--', 'theme.css']; own.push('theme.css'); } else yield ['checkout', 'HEAD', '--', 'theme.css'];
  }
  if (clash.includes(CONFIG_FILE) || (moved(dir) && inStash.has(CONFIG_FILE))) yield ['checkout', 'HEAD', '--', CONFIG_FILE]; // (moved: the tracked one stays the repo's; the owner's parts go to data below)
  // the stash didn't come back whole: config.json (whatever is there now) still gains the owner's agents and values
  if (inStash.has(CONFIG_FILE)) {
    const b = mergeConfigFile(dir, parseJson(yield ['show', `${stash.sha}:${CONFIG_FILE}`]), yield* headCfg());
    if (b.length || clash.includes(CONFIG_FILE)) own.push(CONFIG_FILE);
  }
  const kept = clash.filter((f) => !own.includes(f));
  return { ok: false, kept: kept.length || clash.length ? kept : ['(see the stash)'], own, during };
}
function* dropStash(sha) {
  const r = yield ['stash', 'list', '--format=%H'];
  const i = (r.out || '').split('\n').indexOf(sha);
  if (i >= 0) yield ['stash', 'drop', '-q', `stash@{${i}}`];
}
const CONFIG_FILE = 'config.json';
const parseJson = (r) => { try { return r?.ok ? JSON.parse(r.out) : null; } catch { return null; } };
// config.json gains what `other` has (bringConfig, head = git's own config.json); never written over a file that can't
// be read or parsed; atomic. → [what came back]
// (round 55, configsafe) once the owner's settings moved into the data folder (data/config.json there), what a stash
// held of theirs goes into those copies; the tracked files stay the repo's own. Before the move: the old files.
const ownTarget = (dir, name) => (fs.existsSync(path.join(dir, 'data', CONFIG_FILE)) ? path.join(dir, 'data', name) : path.join(dir, name));
const moved = (dir) => fs.existsSync(path.join(dir, 'data', CONFIG_FILE));
function mergeConfigFile(dir, other, head) {
  const file = ownTarget(dir, CONFIG_FILE);
  let cur = null;
  try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { console.warn('update: config.json not read', err.code || err.message); return []; }
  if (!other) return [];
  const r = bringConfig(cur, other, head);
  if (!r.brought.length) return [];
  try {
    const tmp = `${file}.${process.pid}.update.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(r.value, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } catch (err) { console.warn('update: config.json not written', err.code || err.message); return []; }
  return r.brought;
}
// said once after the update, in plain words
const ownNote = (own, stash) => `Your ${own.map((f) => (f === CONFIG_FILE ? 'settings and agents' : f === 'theme.css' ? 'theme' : f)).join(' and ')} stayed yours (the update's new parts were added around them); a copy of your edits is kept in the stash "${stash}".`;
// the two drivers: sync (gitSync's git(...args)) and async (updatermain's git(args) → Promise)
function runSteps(gen, git) {
  let step = gen.next();
  while (!step.done) step = gen.next(git(...step.value));
  return step.value;
}
async function runStepsAsync(gen, git) {
  let step = gen.next();
  while (!step.done) step = gen.next(await git(step.value));
  return step.value;
}

// <checkout>/.git/hearth-update: the journal, the staged swap, the last update for "Go back"
function gitDirOf(dir) {
  const dot = path.join(dir, '.git');
  try {
    const st = fs.statSync(dot);
    if (st.isDirectory()) return dot;
    const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dot, 'utf8'));
    if (m) return path.resolve(dir, m[1].trim());
  } catch { /* not a checkout */ }
  return null;
}
function stateDir(dir) { const g = gitDirOf(dir); return g ? path.join(g, 'hearth-update') : null; }
function readState(dir, name, fallback = null) {
  const d = stateDir(dir);
  if (!d) return fallback;
  try { return JSON.parse(fs.readFileSync(path.join(d, `${name}.json`), 'utf8')); } catch { return fallback; }
}
function writeState(dir, name, value) {
  const d = stateDir(dir);
  if (!d) return false;
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, `${name}.json`);
  if (value == null) { try { fs.unlinkSync(f); } catch { /* none */ } return true; }
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, f);
  return true;
}

// ---------- the swap at start ----------
// An update Windows couldn't finish while Hearth ran (files held open) is staged as pending.json { from, to }; the
// next start finishes it with plain synchronous git before main.js loads anything else, and when a file the main
// process loads changed, starts once more (no window was made yet). Anything unexpected: the pending note is kept
// for the window to explain (Finish / Go back), nothing half-done is left.
function startSwap(app, { dir = __dirname, gitBin = 'git', log = () => {} } = {}) {
  const d = stateDir(dir);
  if (!d || !fs.existsSync(path.join(d, 'pending.json'))) return false; // the usual start: one stat
  let pending;
  try { pending = JSON.parse(fs.readFileSync(path.join(d, 'pending.json'), 'utf8')); } catch { return false; }
  // a second launch while Hearth still runs (files still held): leave it for the real restart
  try { if (app?.requestSingleInstanceLock && !app.requestSingleInstanceLock()) return false; } catch { /* tests */ }
  // (round 55, fixes55) nothing here may stop Hearth from starting (main.js's first lines): any throw → the usual start,
  // the pending note kept for the window to explain
  try {
    const r = swapSync({ dir, gitBin: findGitSync(gitBin), pending, log });
    if (r.keep) { log(`updatesafe: the staged update waits (${r.reason})`); return false; } // git didn't answer: try at the next start
    writeState(dir, 'pending', null);
    writeState(dir, 'swapped', { ...r, at: Date.now() });
    if (r.ok && r.restart && app) { app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--restart') }); app.exit(0); return true; }
  } catch (err) { log(`updatesafe: the staged update couldn't go in at start (${err.message})`); }
  return false;
}
// git installed after Hearth's PATH was set (Windows: Program Files\Git; a Mac started from the Dock: Homebrew)
function findGitSync(bin) {
  if (bin !== 'git') return bin;
  const { execFileSync } = require('child_process');
  try { execFileSync('git', ['--version'], { windowsHide: true, stdio: 'ignore', timeout: 15000 }); return 'git'; } catch (err) { if (err.code !== 'ENOENT') return 'git'; }
  const e = process.env;
  const cands = process.platform === 'win32'
    ? [e.ProgramW6432, e.ProgramFiles, e['ProgramFiles(x86)']].filter(Boolean).map((p) => path.join(p, 'Git', 'cmd', 'git.exe')).concat(e.LOCALAPPDATA ? [path.join(e.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe')] : [])
    : ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']; // winmac-ok: the Mac's / Linux's own places (Windows above)
  return cands.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || 'git';
}
// git's environment for Hearth: never a prompt (no password / username question, no Windows "Unlink failed. Should I
// try again? (y/n)" that would wait forever), English messages (so a French or German Windows reads the same), no
// optional index lock from a background look (it would collide with a git the owner runs at that moment)
const gitEnv = (extra = {}) => ({ ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASK_YESNO: 'false', GCM_INTERACTIVE: 'never', LC_ALL: 'C', LANGUAGE: 'C', GIT_OPTIONAL_LOCKS: '0', ...extra });
function gitSync(dir, gitBin = 'git') {
  const { execFileSync } = require('child_process');
  const env = gitEnv();
  return (...args) => {
    try { return { ok: true, out: String(execFileSync(gitBin, args, { cwd: dir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 8 << 20 })).replace(/\s+$/, '') }; } catch (err) { return { ok: false, out: String(err.stdout || '').trim(), err: String(err.stderr || err.message || '').trim() }; }
  };
}
// An update that stopped half-way leaves some files already in their new version. Put back ONLY what is provably the
// update's own writing: a changed file whose content is exactly the new version's (git hash-object = the blob in
// `to`), a file the update removed, a new file of the update identical to its new version. Anything else (it would be
// yours) stays where it is and is listed. Returns { restored, removed, left }.
function cleanPartialSync({ dir, gitBin = 'git', from, to }) {
  const git = gitSync(dir, gitBin);
  const restored = []; const removed = []; const left = [];
  const incoming = new Set(git('diff', '--name-only', from, to).out.split('\n').filter(Boolean));
  const blob = (rev, f) => { const r = git('rev-parse', '--verify', '-q', `${rev}:${f}`); return r.ok ? r.out : null; };
  const status = git('status', '--porcelain', '-z', '--untracked-files=all').out.split('\0').filter(Boolean);
  for (const line of status) {
    const code = line.slice(0, 2); const f = line.slice(3);
    if (OWN.test(f) || !incoming.has(f)) { if (code !== '??' || incoming.has(f)) left.push(f); continue; }
    const want = blob(to, f);
    const exists = fs.existsSync(path.join(dir, f));
    const now = exists ? git('hash-object', '--', f).out : null;
    if (code === '??') {
      if (want && now === want) { try { fs.unlinkSync(path.join(dir, f)); removed.push(f); } catch { left.push(f); } } else left.push(f);
      continue;
    }
    // tracked: changed to the new version, or removed by the update (missing here, gone in `to`)
    if ((exists && want && now === want) || (!exists && !want)) {
      git('reset', '-q', '--', f);
      if (git('checkout', 'HEAD', '--', f).ok) restored.push(f); else left.push(f);
    } else left.push(f);
  }
  return { restored, removed, left };
}
function swapSync({ dir, gitBin = 'git', pending, log = () => {} }) {
  const git = gitSync(dir, gitBin);
  if (!pending?.to || !pending?.from) return { ok: false, reason: 'unknown' };
  const h = git('rev-parse', 'HEAD');
  // (round 55, fixes55) git didn't answer (not found, a lock…): nothing touched, the staged update waits (keep: true)
  if (!h.ok) return { ok: false, keep: true, reason: classify(h.err) === 'unknown' ? 'git' : classify(h.err), detail: gitLine(h.err), from: pending.from, to: pending.to };
  const head = h.out;
  if (head !== pending.from) return { ok: head === pending.to, reason: head === pending.to ? 'done' : 'moved', from: pending.from, to: pending.to };
  const dirty = git('status', '--porcelain', '--untracked-files=no').out;
  // (round 55, fixes55) a stash is ours only when stash@{0} carries our name (a "No local changes to save" would have
  // left someone else's stash on top, later applied and dropped as if it were the owner's edits)
  const pushStash = (name, paths = null) => {
    if (!git('stash', 'push', ...(paths ? ['--include-untracked'] : []), '-m', name, ...(paths ? ['--', ...paths] : [])).ok) return null;
    const s = git('rev-parse', '--verify', '-q', 'stash@{0}').out;
    return s && (git('log', '-1', '--format=%gs', '-g', 'stash@{0}').out || '').includes(name) ? { sha: s, name } : null;
  };
  let stash = null; let files = null;
  if (dirty) {
    stash = pushStash(stashName('edits', pending.from, pending.to));
    if (!stash) return { ok: false, reason: 'local', from: pending.from, to: pending.to };
  }
  // a file added by hand with the same name as a new file of the update: kept in its own named stash (said after)
  const added = git('diff', '--name-only', '--diff-filter=A', pending.from, pending.to).out.split('\n').filter(Boolean);
  const collide = added.filter((f) => !OWN.test(f) && fs.existsSync(path.join(dir, f)));
  if (collide.length) {
    const s = pushStash(stashName('files', pending.from, pending.to), collide);
    if (s) files = { ...s, files: collide };
  }
  const restore = (s) => runSteps(restoreSteps({ dir, stash: s, from: pending.from, to: pending.to }), git);
  const m = git('merge', '--ff-only', '--no-edit', pending.to);
  if (!m.ok) {
    const reason = classify(`${m.err}\n${m.out}`);
    if (git('rev-parse', 'HEAD').out === pending.from) cleanPartialSync({ dir, gitBin, from: pending.from, to: pending.to });
    // the same safe way back as after a good merge (no conflict marks left, the owner's files win, kept when not whole)
    if (files) restore(files);
    if (stash) restore(stash);
    log(`updatesafe: the staged update couldn't go in at start (${reason})`);
    return { ok: false, reason, detail: gitLine(m.err || m.out), from: pending.from, to: pending.to };
  }
  const back = stash ? restore(stash) : { ok: true, kept: [], own: [] };
  const kept = back.ok ? [] : back.kept;
  const changed = git('diff', '--name-only', pending.from, pending.to).out.split('\n').filter(Boolean);
  writeState(dir, 'last', { from: pending.from, to: pending.to, at: Date.now(), branch: pending.branch || BRANCH });
  writeState(dir, 'journal', null);
  return { ok: true, from: pending.from, to: pending.to, files: changed.slice(0, 200), changed: changed.length, restart: changed.some(mainSide), kept, own: back.own || [], stash: back.ok ? null : stash, keptFiles: files };
}
// a file the main process loads (a restart, not a reload): same rule as updatermain's needsRestart without index.html
const mainSide = (f) => /(^|\/)(main|preload|[\w-]*main|engines|store|appshell|winmac|storework|sync-engine|sync-merge|chromeguard|updatesafe-core)\.js$|^mcp\/|^package\.json$/.test(f);

module.exports = { ORIGIN_URL, BRANCH, OWN, WIN_MAX, classify, gitLine, explain, installGit, tooLong, stashName, OWN_EDITS, bringConfig, OWNER_FILES, restoreSteps, runSteps, runStepsAsync, mergeConfigFile, ownNote, stamp, branchStamp, gitDirOf, stateDir, readState, writeState, startSwap, swapSync, cleanPartialSync, gitSync, gitEnv, mainSide };
