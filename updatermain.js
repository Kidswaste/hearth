// Updates from the app's own git checkout (the folder Hearth runs from: ~/Library/Application Support/Hearth on a Mac,
// %USERPROFILE%\agent-hub on Windows): looks at origin/main, lists what's new, pulls it, then reloads the window, or
// restarts the app when a file the main process loads changed. Used by updater.js (the ⬆ Update button, /update).
// (round 37, updatesafe) safe on both computers, several times a day:
//  - hand edits go into a NAMED stash ("hearth-update <date> (abc1234 → def5678): your edits") and come back after;
//    a file added by hand with the same name as a new one is kept in its own named stash; nothing is ever discarded
//  - every failure is one plain message + one fix (updatesafe-core.js explain): no git (install after a click, the
//    command shown), not a checkout (connect, files untouched), another user's folder, a stuck lock, a detached HEAD,
//    diverged history (yours kept on a side branch), no network / a proxy (this computer's proxy tried by itself), a
//    certificate, Windows files held open (finished as Hearth restarts: stage, then swap at start), long paths,
//    permissions (the sudo / icacls line runs only in a visible window after a click)
//  - a journal in .git/hearth-update: an update cut short (crash, power) is finished or rolled back cleanly
//  - "Go back to the previous version": git back to the commit before the last update, your edits kept
//  - never touches data/ (or electron/): those are never stashed, reset or written
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const C = require('./updatesafe-core');

const BRANCH = C.BRANCH;

// files the window loads (a reload is enough when only these changed)
function rendererFiles(dir) {
  const set = new Set();
  try {
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^":]+\.(?:js|css))"/g)) set.add(m[1].replace(/^\.\//, ''));
  } catch { /* none */ }
  return set;
}
function needsRestartIn(dir, files) {
  const renderer = rendererFiles(dir);
  return files.some((f) => {
    if (/^(docs|dev)\//.test(f) || /\.(md|png|jpe?g|svg|txt)$/i.test(f)) return false;
    if (f === 'index.html' || renderer.has(f) || /^tools\/.*\.(js|css|html)$/.test(f) && !/main\.js$/.test(f)) return false;
    if (/\.(css|html)$/.test(f)) return false;
    return true; // main.js, preload.js, *main.js, engines, mcp servers, package.json…
  });
}

// opts (tests): dir, platform, gitBin, originUrl, resolveProxy(url) → 'PROXY h:p; DIRECT', terminal({ title, lines }),
// gitCandidates (where else git may be when it isn't on PATH)
function create(opts = {}) {
  const DIR = opts.dir || __dirname;
  const PLAT = opts.platform || process.platform;
  const ORIGIN = opts.originUrl || C.ORIGIN_URL;
  let bin = opts.gitBin || null;
  let proxy = null; // a proxy that worked this session: -c http.proxy=…
  let busy = false; // an update / fix is running (a lock seen meanwhile is ours)
  const done = (message, extra = {}) => ({ ok: true, retry: true, message, ...extra });
  const ex = (reason, ctx = {}) => ({ ok: false, ...C.explain(reason, { platform: PLAT, dir: DIR, ...ctx }) });

  // Git installed after Hearth started isn't on its PATH yet (Windows), or Homebrew's isn't (a Mac started from the Dock)
  function gitCandidates() {
    if (opts.gitCandidates) return opts.gitCandidates;
    if (PLAT === 'win32') {
      const e = process.env;
      return [e.ProgramW6432, e.ProgramFiles, e['ProgramFiles(x86)']].filter(Boolean).map((p) => path.join(p, 'Git', 'cmd', 'git.exe'))
        .concat(e.LOCALAPPDATA ? [path.join(e.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe')] : []);
    }
    return PLAT === 'darwin' ? ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'] : ['/usr/bin/git', '/usr/local/bin/git'];
  }
  function run(file, args, timeout) {
    return new Promise((resolve) => {
      execFile(file, ['-c', 'core.quotepath=false', ...(proxy ? ['-c', `http.proxy=${proxy}`] : []), ...args], { cwd: DIR, timeout, windowsHide: true, maxBuffer: 8 * 1048576, env: C.gitEnv() }, (err, stdout, stderr) => {
        resolve({ ok: !err, out: String(stdout || '').replace(/\s+$/, ''), err: String(stderr || err?.message || '').trim(), missing: err?.code === 'ENOENT', timedOut: Boolean(err?.killed) });
      });
    });
  }
  async function git(args, { timeout = 60000 } = {}) {
    if (!bin) {
      const r = await run('git', args, timeout);
      if (!r.missing) { bin = 'git'; return r; }
      const found = gitCandidates().find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
      if (!found) return r;
      bin = found;
    }
    return run(bin, args, timeout);
  }
  const lines = (r) => (r.ok && r.out ? r.out.split('\n').filter(Boolean) : []);
  const sha = async (rev) => { const r = await git(['rev-parse', '--verify', '-q', rev]); return r.ok ? r.out : ''; };
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

  // ---------- before anything: can git work here, is something half-done? ----------
  async function preflight() {
    const top = await git(['rev-parse', '--show-toplevel'], { timeout: 15000 });
    if (top.missing) return ex('git');
    if (!top.ok) {
      const why = C.classify(top.err);
      if (why === 'clt') return ex('clt');
      if (why === 'owner') return ex('owner');
      return ex('repo');
    }
    // Hearth's folder must BE the checkout, not a folder inside another project (asked from git itself: no path
    // comparison to trip over subst drives, symlinks or letter case)
    const prefix = await git(['rev-parse', '--show-prefix']);
    if (prefix.ok && prefix.out) return ex('repo-other', { top: top.out });
    const gd = await git(['rev-parse', '--absolute-git-dir']);
    const gitDir = gd.ok ? gd.out : path.join(DIR, '.git');
    const lock = path.join(gitDir, 'index.lock');
    if (!busy && fs.existsSync(lock)) {
      let age = 0;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { /* gone */ }
      if (age > 10000) return { ...ex('lock'), lockAge: age };
    }
    if (C.readState(DIR, 'pending')) return { ok: false, reason: 'staged', message: 'An update is ready and goes in when Hearth restarts (Windows was holding some files open).', fix: { id: 'restart-swap', label: 'Restart and finish the update' } };
    const merging = ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD'].find((f) => fs.existsSync(path.join(gitDir, f)));
    const j = C.readState(DIR, 'journal');
    if (!busy && (merging || j)) {
      const head = await sha('HEAD');
      // a journal whose update never moved anything and left nothing changed: just stale
      const dirty = lines(await git(['status', '--porcelain', '--untracked-files=no']));
      if (merging || (j && (head === j.to || head !== j.from || dirty.length || j.edits || j.files))) {
        return { ...ex('half', { when: j?.at ? ago(j.at) : '', stash: j?.edits?.name || j?.files?.name || '' }), merging: merging || null, journal: j };
      }
      C.writeState(DIR, 'journal', null);
    }
    const br = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (br.ok && br.out === 'HEAD') return ex('detached');
    return { ok: true, gitDir, branch: br.out };
  }

  // fetch main; when the network fails, once more through this computer's own proxy (Electron knows it)
  async function fetchMain() {
    let f = await git(['fetch', '--quiet', 'origin', BRANCH], { timeout: 90000 });
    if (f.ok) return f;
    let reason = C.classify(f.err);
    if (!proxy && ['network', 'proxy', 'ssl'].includes(reason)) {
      const p = await systemProxy();
      if (p) {
        proxy = p;
        const again = await git(['fetch', '--quiet', 'origin', BRANCH], { timeout: 90000 });
        if (again.ok) return again;
        proxy = null;
        f = again; reason = C.classify(again.err) === 'network' ? 'proxy' : C.classify(again.err);
      }
    }
    return { ...f, reason };
  }
  async function systemProxy() {
    try {
      const resolve = opts.resolveProxy || ((u) => require('electron').session.defaultSession.resolveProxy(u));
      const s = String(await resolve('https://github.com') || '');
      const m = /(?:PROXY|HTTPS)\s+([^\s;]+)/i.exec(s);
      return m ? `http://${m[1]}` : null;
    } catch { return null; }
  }

  // ---------- status ----------
  async function status({ fetch = true } = {}) {
    const pre = await preflight();
    if (!pre.ok) return pre;
    if (fetch) {
      const f = await fetchMain();
      if (!f.ok) return { ...ex(f.reason === 'unknown' ? 'network' : f.reason, { detail: f.err }), reason: 'fetch', why: f.reason };
    }
    const remoteRef = `origin/${BRANCH}`;
    const [head, remote, dirtyR, log, ahead, count] = await Promise.all([
      git(['rev-parse', 'HEAD']), git(['rev-parse', remoteRef]),
      git(['status', '--porcelain', '--untracked-files=no']),
      git(['log', '--format=%h\t%s\t%ct', `HEAD..${remoteRef}`, '-n', '40']),
      git(['rev-list', '--count', `${remoteRef}..HEAD`]),
      git(['rev-list', '--count', `HEAD..${remoteRef}`]),
    ]);
    if (!remote.ok) return { ...ex('network', { detail: remote.err }), reason: 'fetch' };
    const commits = log.out ? log.out.split('\n').map((l) => { const [hash, subject, t] = l.split('\t'); return { hash, subject, at: Number(t) * 1000 }; }) : [];
    const behind = Number(count.out) || 0;
    // (round 29) the patch notes this copy doesn't have yet (docs/patch-notes/round-NN.md, newest first), read from the
    // fetched main without touching the files here
    const notes = [];
    const nd = await git(['diff', '--name-only', `HEAD..${remoteRef}`, '--', 'docs/patch-notes/']);
    const roundOf = (f) => Number((/round-(\d+)\.md$/.exec(f) || [])[1]) || 0;
    for (const f of lines(nd).filter(roundOf).sort((x, y) => roundOf(y) - roundOf(x)).slice(0, 6)) {
      const t = await git(['show', `${remoteRef}:${f}`]);
      if (t.ok && t.out) notes.push({ file: f, round: roundOf(f), text: t.out });
    }
    // (round 37) what the update will meet: a file added by hand with a new file's name, paths Windows can't write,
    // anything inside the data folder (never)
    let plan = { collide: [], tooLong: [], data: [], diverged: false };
    if (behind) {
      const incoming = lines(await git(['diff', '--name-only', `HEAD...${remoteRef}`]));
      const added = lines(await git(['diff', '--name-only', '--diff-filter=A', `HEAD...${remoteRef}`]));
      const tracked = new Set(lines(await git(['ls-files', '--', ...added.slice(0, 400)])));
      plan = {
        collide: added.filter((f) => !C.OWN.test(f) && !tracked.has(f) && fs.existsSync(path.join(DIR, f))),
        tooLong: PLAT === 'win32' && (await git(['config', '--bool', 'core.longpaths'])).out !== 'true' ? C.tooLong(DIR, incoming, PLAT) : [],
        data: incoming.filter((f) => C.OWN.test(f)),
        diverged: Number(ahead.out) > 0,
      };
    }
    const last = C.readState(DIR, 'last');
    // an update finished (or not) as Hearth restarted: said once, in the same words as any other
    let swapped = C.readState(DIR, 'swapped');
    if (swapped) {
      C.writeState(DIR, 'swapped', null);
      if (swapped.ok) {
        const n = [swapped.kept?.length ? `Your own edits to ${swapped.kept.join(', ')} clashed with the update: kept in the stash "${swapped.stash?.name}".` : '',
          swapped.own?.length && swapped.stash ? C.ownNote(swapped.own, swapped.stash.name) : '',
          swapped.keptFiles ? `You had added ${swapped.keptFiles.files.join(', ')} by hand: the update's file is in place, yours is kept in the stash "${swapped.keptFiles.name}".` : ''].filter(Boolean).join(' ');
        swapped = { ...swapped, note: `Finished as Hearth restarted.${n ? ` ${n}` : ''}` };
      } else {
        const e = C.explain(swapped.reason, { platform: PLAT, dir: DIR, detail: swapped.detail });
        swapped = { ...swapped, ...e, message: `The update couldn't finish as Hearth restarted. ${e.message}` };
      }
    }
    return {
      notes, plan, swapped,
      ok: true, head: head.out.slice(0, 7), remote: remote.out.slice(0, 7), branch: pre.branch,
      behind, ahead: Number(ahead.out) || 0, commits,
      dirty: dirtyR.out ? dirtyR.out.split('\n').length : 0, dir: DIR,
      back: last && last.to === head.out ? { from: last.from.slice(0, 7), to: last.to.slice(0, 7), at: last.at } : null,
    };
  }

  // ---------- stashes: named, found again by their commit, dropped only once safely back ----------
  async function stashPush(kind, from, to, paths = null) {
    const name = C.stashName(kind, from, to);
    const args = ['stash', 'push', ...(paths ? ['--include-untracked'] : []), '-m', name, ...(paths ? ['--', ...paths] : [])];
    const r = await git(args);
    if (!r.ok) return { error: r.err || r.out };
    const s = await sha('stash@{0}');
    const msg = await git(['log', '-1', '--format=%gs', '-g', 'stash@{0}']);
    if (!s || !msg.out.includes(name)) return { error: 'the stash could not be found again' };
    return { sha: s, name, files: paths || undefined };
  }
  // puts a stash back; on a clash the clashing files keep the new version (a file full of conflict marks would break
  // the app) and the stash stays, named. → { ok, kept: [files] }
  async function stashRestore(s) {
    if (!s?.sha) return { ok: true, kept: [] };
    // (round 54 fix, labchats54) a file of the stash written meanwhile stopped the WHOLE stash from coming back ("your
    // local changes would be overwritten"): round 53's window saved the repo's config.json while git had it in place of
    // the owner's, and the owner's agents (the Lab's Three Director, so its chats) stayed in the stash. That write goes
    // in its own named stash first, the owner's edits come back, then config.json gains what the write added (nothing
    // of the owner's is replaced: bringConfig)
    // (round 55, fixes55) the same steps as Windows' finish-at-restart (updatesafe-core restoreSteps): on a clash the
    // owner's config.json / theme.css win too, instead of waiting in the stash for bringBack at the next start
    return C.runStepsAsync(C.restoreSteps({ dir: DIR, stash: s }), git);
  }
  // config.json gains what the one in commit `rev` has that it lacks (or has only as the repo's own): C.bringConfig.
  // A config.json that can't be read here, or one in rev that can't, leaves the file as it is. → [what came back]
  const CONFIG = 'config.json';
  const parse = (r) => { try { return r.ok ? JSON.parse(r.out) : null; } catch { return null; } };
  async function configFrom(rev, head = undefined) {
    const file = path.join(DIR, CONFIG);
    // never written over what wasn't read: a file that can't be read or parsed is left exactly as it is
    let raw = null; try { raw = fs.readFileSync(file, 'utf8'); } catch (err) { console.warn('update: config.json not read', err.code); }
    const cur = raw == null ? null : parse({ ok: true, out: raw });
    const other = parse(await git(['show', `${rev}:${CONFIG}`]));
    if (!cur || !other) return [];
    const r = C.bringConfig(cur, other, head === undefined ? parse(await git(['show', `HEAD:${CONFIG}`])) : head);
    if (!r.brought.length) return [];
    const tmp = `${file}.${process.pid}.update.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(r.value, null, 2)}\n`);
    fs.renameSync(tmp, file);
    return r.brought;
  }
  // (round 54 fix, labchats54) at the start: an update's "your edits" stash still here is one that couldn't come back
  // (a successful one is dropped). Round 53 → 54 left the owner's config.json in one: the Lab's Three Director gone,
  // its chats out of the Lab. Once per stash, newest first: config.json gains the owner's agents and parts (nothing
  // removed: bringConfig); another of its files comes back only when no update changed it since and it is untouched
  // here. The stashes stay (nothing dropped). → { ok, brought: [what] }
  async function bringBack() {
    if (busy) return { ok: false, brought: [] };
    const gd = C.gitDirOf(DIR);
    if (!gd) return { ok: true, brought: [] };
    let common = gd; try { common = path.resolve(gd, fs.readFileSync(path.join(gd, 'commondir'), 'utf8').trim()); } catch { /* not a worktree */ }
    if (![gd, common].some((d) => fs.existsSync(path.join(d, 'logs', 'refs', 'stash')) || fs.existsSync(path.join(d, 'refs', 'stash')))) return { ok: true, brought: [] }; // no stash: no git run
    const done = new Set(C.readState(DIR, 'ownback', null)?.shas || []);
    const list = lines(await git(['stash', 'list', '--format=%H%x09%gs'])).map((l) => l.split('\t')).filter(([h, m]) => h && C.OWN_EDITS.test(m || '') && !done.has(h));
    if (!list.length) return { ok: true, brought: [] };
    busy = true;
    try {
      const head = parse(await git(['show', `HEAD:${CONFIG}`]));
      const brought = [];
      for (const [h] of list) {
        for (const f of lines(await git(['diff', '--name-only', `${h}^1`, h]))) {
          if (f === CONFIG) { brought.push(...(await configFrom(h, head))); continue; }
          if (brought.includes(f) || C.OWN.test(f)) continue;
          const [was, now] = [await sha(`${h}^1:${f}`), await sha(`HEAD:${f}`)];
          if (!was || was !== now) continue; // an update changed it since: the owner's version stays in the stash
          if (!(await git(['diff', '--quiet', 'HEAD', '--', f])).ok) continue; // changed here since: that one stays
          if ((await git(['checkout', h, '--', f])).ok) { await git(['reset', '-q', '--', f]); brought.push(f); }
        }
        done.add(h);
      }
      C.writeState(DIR, 'ownback', { at: Date.now(), shas: [...done].slice(-40), brought });
      return { ok: true, brought };
    } finally { busy = false; }
  }
  const identity = async () => ((await git(['config', 'user.email'])).out ? [] : ['-c', 'user.name=Hearth', '-c', 'user.email=hearth@localhost']);
  const changedFiles = async (a, b) => lines(await git(['diff', '--name-only', a, b]));

  // ---------- apply ----------
  async function apply() {
    if (busy) return { ok: false, message: 'An update is already running.' };
    busy = true;
    try { return await applyNow(); } finally { busy = false; }
  }
  async function applyNow() {
    const s = await status({ fetch: true });
    if (!s.ok) return s;
    if (!s.behind) return { ok: true, changed: 0, restart: false, message: 'Already up to date.' };
    if (s.plan.data.length) return ex('data');
    if (s.plan.tooLong.length) return { ...ex('longpath', { files: s.plan.tooLong }), files: s.plan.tooLong };
    // (round 45, backupauto) a backup of your things first (skipped when a good one is under an hour old; never more
    // than 3 minutes in the way; a failed one doesn't stop the update: data/ isn't touched by it)
    try { await require('./backupautomain').before('update'); } catch { /* backups not there */ }
    const from = await sha('HEAD');
    const to = await sha(`origin/${BRANCH}`);
    const j = { step: 'start', from, to, at: Date.now(), branch: s.branch };
    C.writeState(DIR, 'journal', j);
    // hand edits (tracked) → one named stash; files added by hand with a new file's name → another
    if (s.dirty) {
      j.edits = await stashPush('edits', from, to);
      if (j.edits.error) { C.writeState(DIR, 'journal', null); return ex(C.classify(j.edits.error), { detail: j.edits.error }); }
      C.writeState(DIR, 'journal', j);
    }
    if (s.plan.collide.length) {
      j.files = await stashPush('files', from, to, s.plan.collide);
      if (j.files.error) { await stashRestore(j.edits); C.writeState(DIR, 'journal', null); return ex(C.classify(j.files.error), { detail: j.files.error }); }
      C.writeState(DIR, 'journal', j);
    }
    const diverged = s.plan.diverged;
    j.step = 'merge'; C.writeState(DIR, 'journal', j);
    const m = diverged
      ? await git([...(await identity()), 'merge', '--no-edit', `origin/${BRANCH}`], { timeout: 180000 })
      : await git(['merge', '--ff-only', `origin/${BRANCH}`], { timeout: 180000 });
    if (!m.ok) {
      const reason = C.classify(`${m.err}\n${m.out}`);
      await undo(j);
      if (reason === 'conflict' || reason === 'diverged') return { ...ex('diverged', { ahead: s.ahead }), ahead: s.ahead };
      if (reason === 'locked') {
        C.writeState(DIR, 'pending', { from, to, branch: s.branch, at: Date.now() });
        return { ...ex('locked', { detail: m.err }), staged: true };
      }
      return ex(reason, { detail: m.err || m.out });
    }
    return finish(j, s);
  }
  // after the merge: hand edits back, the journal closed, "Go back" remembered
  async function finish(j, s = {}) {
    j.step = 'restore'; C.writeState(DIR, 'journal', j);
    const back = await stashRestore(j.edits);
    const after = await sha('HEAD');
    const files = await changedFiles(j.from, after);
    C.writeState(DIR, 'journal', null);
    C.writeState(DIR, 'last', { from: j.from, to: after, at: Date.now(), branch: j.branch });
    const kept = back.kept;
    const notes = [];
    if (j.edits && back.ok) notes.push(`Your own edits (${s.dirty || 'some'} file${s.dirty === 1 ? '' : 's'}) were put aside and are back in place.`);
    if (kept.length) notes.push(`Your own edits to ${kept.join(', ')} clashed with the update: the file${kept.length === 1 ? ' has' : 's have'} the new version, and your edits are kept in the stash "${j.edits.name}" (\`git stash list\`).`);
    if (back.own?.length && !back.ok) notes.push(C.ownNote(back.own, j.edits.name));
    if (j.files) notes.push(`You had added ${j.files.files.join(', ')} by hand, and the update brings a file with the same name: the update's file is in place, yours is kept in the stash "${j.files.name}".`);
    return { ok: true, changed: files.length, restart: needsRestartIn(DIR, files), from: j.from.slice(0, 7), to: after.slice(0, 7), files: files.slice(0, 200),
      kept, own: back.own || [], stashes: [j.edits && !back.ok ? j.edits : null, j.files || null].filter(Boolean).map((x) => x.name), note: notes.join(' ') };
  }
  // an update that didn't go in: the partial files put back (only the update's own), the stashes back, journal closed
  async function undo(j) {
    if (fs.existsSync(path.join((await git(['rev-parse', '--absolute-git-dir'])).out || path.join(DIR, '.git'), 'MERGE_HEAD'))) await git(['merge', '--abort']);
    const head = await sha('HEAD');
    if (head === j.from) C.cleanPartialSync({ dir: DIR, gitBin: bin || 'git', from: j.from, to: j.to });
    else if (head === j.to && j.from) await git(['reset', '-q', '--keep', j.from]);
    await stashRestore(j.files);
    await stashRestore(j.edits);
    C.writeState(DIR, 'journal', null);
  }

  // ---------- go back to the version before the last update ----------
  async function back() {
    if (busy) return { ok: false, message: 'An update is running.' };
    busy = true;
    try {
      const last = C.readState(DIR, 'last');
      const head = await sha('HEAD');
      if (!last?.from) return { ok: false, message: 'There is no update to go back from yet.' };
      if (last.to !== head) return { ok: false, message: 'Hearth changed since that update, so going back would mix versions. Nothing was changed.' };
      const pre = await preflight();
      if (!pre.ok && pre.reason !== 'detached') return pre;
      const dirty = lines(await git(['status', '--porcelain', '--untracked-files=no']));
      const st = dirty.length ? await stashPush('back', head, last.from) : null;
      if (st?.error) return ex(C.classify(st.error), { detail: st.error });
      const r = await git(['reset', '-q', '--keep', last.from]);
      if (!r.ok) { await stashRestore(st); return ex(C.classify(r.err), { detail: r.err }); }
      const put = await stashRestore(st);
      const files = await changedFiles(last.from, head);
      C.writeState(DIR, 'last', null);
      C.writeState(DIR, 'wentBack', { from: head, to: last.from, at: Date.now() });
      return { ok: true, back: true, changed: files.length, restart: needsRestartIn(DIR, files), from: head.slice(0, 7), to: last.from.slice(0, 7), files: files.slice(0, 200),
        note: put.kept.length ? `Your edits to ${put.kept.join(', ')} are kept in the stash "${st.name}".` : '' };
    } finally { busy = false; }
  }

  // ---------- the one fix per problem (ids only cross IPC: the window can't make Hearth run anything else) ----------
  async function terminal(fix, title) {
    const lines2 = fix.command.split('\n');
    const runT = opts.terminal || ((o) => require('./installs').runInTerminal(o));
    const r = await runT({ title, lines: lines2 });
    return { ok: r?.ok !== false, waiting: true, window: r?.window, command: fix.command, message: r?.ok === false ? `Couldn't open a window to run it (${r.error}). Run this yourself: ${fix.command}` : `A ${r?.window || 'terminal'} window opened running: ${fix.command}. When it says it's done, press Try again.` };
  }
  async function fix(id) {
    if (busy) return { ok: false, message: 'An update is running.' };
    busy = true;
    try { return await fixNow(String(id || '')); } finally { busy = false; }
  }
  async function fixNow(id) {
    if (id === 'retry') return done('');
    if (id === 'install-git') return terminal(C.installGit(PLAT), 'Install Git for Hearth updates');
    if (id === 'own-folder') return terminal(C.explain('perm', { platform: PLAT, dir: DIR }).fix, 'Give your account Hearth\'s folder');
    if (id === 'safe-dir') {
      const r = await git(['config', '--global', '--add', 'safe.directory', DIR.replace(/\\/g, '/')]);
      return r.ok ? done('Hearth\'s folder is trusted by git now.') : ex(C.classify(r.err), { detail: r.err });
    }
    if (id === 'ssl-windows') { const r = await git(['config', '--global', 'http.sslBackend', 'schannel']); return r.ok ? done('Git uses Windows\' certificates now.') : ex('unknown', { detail: r.err }); }
    if (id === 'longpaths') { const r = await git(['config', 'core.longpaths', 'true']); return r.ok ? done('Long paths are on for Hearth\'s folder.') : ex(C.classify(r.err), { detail: r.err }); }
    if (id === 'unlock') {
      const gd = (await git(['rev-parse', '--absolute-git-dir'])).out || path.join(DIR, '.git');
      const lock = path.join(gd, 'index.lock');
      try { if (Date.now() - fs.statSync(lock).mtimeMs < 5000) return { ok: false, message: 'Git is busy right now (the marker is fresh). Try again in a moment.' }; fs.unlinkSync(lock); } catch { /* gone already */ }
      return done('Cleared.');
    }
    if (id === 'connect') return connect();
    if (id === 'onto-main') return ontoMain();
    if (id === 'side-branch') return sideBranch();
    if (id === 'resume' || id === 'rollback') return halfDone(id);
    if (id === 'restart-swap') return { ok: true, restart: true, message: 'Restarting to finish the update…' };
    return { ok: false, message: 'Not a fix Hearth runs.' };
  }
  // not a checkout: the same steps as mac/connect-git.sh; files on disk (data/ included) stay exactly as they are
  async function connect() {
    const own = C.gitDirOf(DIR);
    if (!own) { const r = await git(['init', '-q']); if (!r.ok) return ex(C.classify(r.err), { detail: r.err }); }
    const has = await git(['remote', 'get-url', 'origin']);
    await git(has.ok ? ['remote', 'set-url', 'origin', ORIGIN] : ['remote', 'add', 'origin', ORIGIN]);
    const f = await fetchMain();
    if (!f.ok) return ex(f.reason === 'unknown' ? 'network' : f.reason, { detail: f.err });
    if (!(await sha('HEAD'))) {
      const r = await git(['reset', '-q', `origin/${BRANCH}`]); // the index only: no file is written
      if (!r.ok) return ex(C.classify(r.err), { detail: r.err });
      await git(['branch', '-M', BRANCH]);
    }
    await git(['branch', '-u', `origin/${BRANCH}`, BRANCH]);
    const changed = lines(await git(['status', '--porcelain', '--untracked-files=no'])).length;
    return done(`Connected to Hearth on GitHub.${changed ? ` ${changed} file${changed === 1 ? '' : 's'} here differ from main: they count as your edits and are kept through updates.` : ''}`);
  }
  async function ontoMain() {
    const head = await sha('HEAD');
    const main = await sha(BRANCH) || '';
    const remote = await sha(`origin/${BRANCH}`);
    const contained = async (tip) => tip && (await git(['merge-base', '--is-ancestor', head, tip])).ok;
    let saved = '';
    if (!(await contained(main)) && !(await contained(remote))) {
      saved = `hearth-saved-${C.branchStamp()}`;
      const b = await git(['branch', saved, head]);
      if (!b.ok) return ex(C.classify(b.err), { detail: b.err });
    }
    const dirty = lines(await git(['status', '--porcelain', '--untracked-files=no']));
    const st = dirty.length ? await stashPush('move', head, main || remote) : null;
    if (st?.error) return ex(C.classify(st.error), { detail: st.error });
    const co = main ? await git(['checkout', '-q', BRANCH]) : await git(['checkout', '-q', '-b', BRANCH, '--track', `origin/${BRANCH}`]);
    if (!co.ok) { await stashRestore(st); return ex(C.classify(co.err), { detail: co.err }); }
    const put = await stashRestore(st);
    return done(`Back on main.${saved ? ` The version you were on is kept as the branch "${saved}".` : ''}${put.kept.length ? ` Your edits to ${put.kept.join(', ')} are kept in the stash "${st.name}".` : ''}`);
  }
  // diverged and clashing: your commits on a side branch, main = origin/main; counts as the update (Go back works)
  async function sideBranch() {
    const s = await status({ fetch: true });
    if (!s.ok) return s;
    const from = await sha('HEAD');
    const to = await sha(`origin/${BRANCH}`);
    const side = `hearth-mine-${C.branchStamp()}`;
    const b = await git(['branch', side, from]);
    if (!b.ok) return ex(C.classify(b.err), { detail: b.err });
    const j = { step: 'start', from, to, at: Date.now(), branch: s.branch, side };
    C.writeState(DIR, 'journal', j);
    if (s.dirty) { j.edits = await stashPush('edits', from, to); if (j.edits.error) { C.writeState(DIR, 'journal', null); return ex(C.classify(j.edits.error), { detail: j.edits.error }); } }
    if (s.plan.collide.length) j.files = await stashPush('files', from, to, s.plan.collide);
    C.writeState(DIR, 'journal', j);
    const r = await git(['reset', '-q', '--keep', to]);
    if (!r.ok) { await undo(j); return ex(C.classify(r.err), { detail: r.err }); }
    const res = await finish(j, s);
    return { ...res, retry: false, side, note: `Your ${s.ahead} own change${s.ahead === 1 ? ' is' : 's are'} kept on the branch "${side}". ${res.note || ''}`.trim() };
  }
  // an update cut short: finish it, or go back to exactly how it was
  async function halfDone(id) {
    const j = C.readState(DIR, 'journal') || {};
    const gd = (await git(['rev-parse', '--absolute-git-dir'])).out || path.join(DIR, '.git');
    if (['MERGE_HEAD', 'CHERRY_PICK_HEAD'].some((f) => fs.existsSync(path.join(gd, f)))) await git(['merge', '--abort']);
    if (['rebase-merge', 'rebase-apply'].some((f) => fs.existsSync(path.join(gd, f)))) await git(['rebase', '--abort']);
    const head = await sha('HEAD');
    if (!j.from) { C.writeState(DIR, 'journal', null); return done('Cleaned up.'); }
    if (id === 'resume' && head === j.to) { const r = await finish(j); return { ...r, retry: false }; }
    if (head === j.to) await git(['reset', '-q', '--keep', j.from]); // the merge went in: back before it
    else if (head === j.from) C.cleanPartialSync({ dir: DIR, gitBin: bin || 'git', from: j.from, to: j.to });
    await stashRestore(j.files);
    const put = await stashRestore(j.edits);
    C.writeState(DIR, 'journal', null);
    if (id === 'resume') return applyNow();
    return done(`Back to how it was before the update (${String(j.from).slice(0, 7)}).${put.kept.length ? ` Your edits to ${put.kept.join(', ')} are in the stash "${j.edits.name}".` : ''}`, { retry: false, rolledBack: true });
  }

  return { status, apply, back, fix, preflight, bringBack, needsRestart: (files) => needsRestartIn(DIR, files), get git() { return bin; }, get busy() { return busy; } };
}

const self = create();
function register(ipcMain, { restart, getWin } = {}) {
  ipcMain.handle('update:status', (_e, o) => self.status(o || {}));
  ipcMain.handle('update:apply', () => require('./powerwisemain').during('update', () => self.apply())); // (round 39) awake while it updates
  ipcMain.handle('update:back', () => self.back()); // (round 37) Go back to the previous version
  ipcMain.handle('update:fix', (_e, id) => self.fix(String(id || ''))); // (round 37) the one fix for a failed update
  ipcMain.handle('update:restart', () => { setTimeout(restart, 150); return true; }); // after the answer reaches the window
  ipcMain.handle('update:reload', () => { try { require('./safetynetmain').noteReload('an update'); } catch { /* tests */ } getWin?.()?.webContents.reloadIgnoringCache(); return true; });
}

// (round 54 fix, labchats54) applying(): an update / go back / fix is moving files right now (main.js holds config.json's
// news and the window's saves meanwhile: the owner's config.json waits in a stash, the file on disk is the repo's own)
module.exports = { register, create, status: self.status, apply: self.apply, back: self.back, fix: self.fix, bringBack: self.bringBack, applying: () => self.busy, needsRestart: (files) => needsRestartIn(__dirname, files) };
