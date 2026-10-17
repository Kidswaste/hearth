// The Lab's director chats "disappeared" after the round 53 → 54 update (round 54 fix, labchats54), on real throwaway git
// repos: config.json is a tracked file Hearth writes (the owner's agents: the Three Director docked in the Lab). The
// update puts it in a stash while git merges; round 53's window saw the repo's own config.json meanwhile and saved it
// (Tools: the rail's new tool placed), so the owner's stash couldn't come back: no Three Director, its chats out of the
// Lab (they stayed in data/chats). Here a git post-merge hook does what that window did, at the same moment.
//   1. an update with the window's save in the middle: the owner's agents, look and theme.css come back, the window's
//      addition is kept, the update is in, nothing is dropped (its write waits in its own named stash)
//   2. the owner's broken state (left by 53 → 54, then a second update on top): bringBack() at the start brings the
//      Three Director, the look and theme.css back, once per stash (a later deletion stays deleted), stashes kept
//   3. a config.json that can't be read is never written over
//   4. bringConfig: nothing of the owner's is replaced or removed
//   node dev/labchats54-test.js            (--from <dir>: the updater files from another copy, e.g. round 54's base)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const FROM = (() => { const i = process.argv.indexOf('--from'); return i > 0 ? path.resolve(process.argv[i + 1]) : path.join(__dirname, '..'); })();
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-labchats54-'));
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const read = (f) => fs.readFileSync(f, 'utf8');
const json = (f) => JSON.parse(read(f));
const fails = [];
const ok = (c, what) => { console.log(`${c ? '✓' : '✖'} ${what}`); if (!c) fails.push(what); return c; };
const ids = (cfg) => (cfg.agents || []).map((a) => a.id);

// the repo's own config.json (what git has: two agents) and the owner's (their Three Director, their look)
const REPO = { agents: [{ id: 'claude', name: 'Claude', mode: 'native', engine: 'claude' }, { id: 'astra', name: 'Astra', mode: 'native', engine: 'codex' }], layout: { start: 'single', chatsPanel: true }, theme: { background: '#0f1115', accent: '#7c5cff' } };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', threeTools: true, toolMode: 'full' };
const OWNER = { ...REPO, agents: [...REPO.agents, DIRECTOR], theme: { ...REPO.theme, accent: '#ff7a1a' }, settings: { startOn: 'tool:three', enginePaths: {}, autoBackupDays: 1 }, tools: { placed: ['creative'], hidden: ['creative', 'board'] } };
// what round 53's window saved while the owner's config waited in the stash: the repo's, with the rail's new tool placed
const WINDOW = { ...REPO, tools: { placed: ['creative'], hidden: ['creative'] } };
const text = (v) => `${JSON.stringify(v, null, 2)}\n`;

function makeApp(name) {
  const origin = path.join(T, `${name}-origin.git`);
  g(T, 'init', '--bare', '-q', '-b', 'main', origin);
  const dev = path.join(T, `${name}-dev`);
  g(T, 'clone', '-q', origin, dev);
  write(path.join(dev, 'index.html'), '<script defer src="ui.js"></script>');
  write(path.join(dev, 'ui.js'), '// ui 1\n');
  write(path.join(dev, 'main.js'), '// main 1\n');
  write(path.join(dev, 'config.json'), text(REPO));
  write(path.join(dev, 'theme.css'), '/* your own CSS */\n');
  for (const f of ['updatermain.js', 'updatesafe-core.js']) fs.copyFileSync(path.join(FROM, f), path.join(dev, f));
  g(dev, 'add', '-A'); g(dev, 'commit', '-qm', 'round 53'); g(dev, 'push', '-q', 'origin', 'main');
  const app = path.join(T, `${name}-app`);
  g(T, 'clone', '-q', origin, app);
  // the owner's own files (Hearth writes config.json: agents, settings, look; theme.css: their CSS)
  write(path.join(app, 'config.json'), text(OWNER));
  write(path.join(app, 'theme.css'), '/* your own CSS */\n.lab { --glow: gold; }\n');
  return { origin, dev, app };
}
function pushUpdate(dev, n) {
  write(path.join(dev, 'main.js'), `// main ${n}\n`); write(path.join(dev, 'ui.js'), `// ui ${n}\n`);
  g(dev, 'commit', '-qam', `round ${n}`); g(dev, 'push', '-q', 'origin', 'main');
}
const stashes = (app) => g(app, 'stash', 'list', '--format=%gs').split('\n').filter(Boolean);
const fresh = (file) => { delete require.cache[require.resolve(file)]; delete require.cache[require.resolve(path.join(path.dirname(file), 'updatesafe-core.js'))]; return require(file); };

(async () => {
  // ---------- 1. the update, with the window saving the repo's config.json in the middle ----------
  {
    const { dev, app } = makeApp('a');
    pushUpdate(dev, 54);
    // the window's save, right after git's merge (before the owner's edits come back): a post-merge hook
    write(path.join(T, 'window.json'), text(WINDOW));
    const hook = path.join(app, '.git', 'hooks', 'post-merge');
    write(hook, `#!/bin/sh\ncat "${path.join(T, 'window.json')}" > config.json\n`); fs.chmodSync(hook, 0o755);
    const U = fresh(path.join(app, 'updatermain.js'));
    const r = await U.apply();
    ok(r.ok && r.restart === true, `the update went in (${JSON.stringify(r).slice(0, 140)})`);
    ok(read(path.join(app, 'main.js')) === '// main 54\n', 'the new code is in place');
    let cfg = null; try { cfg = json(path.join(app, 'config.json')); } catch { cfg = {}; }
    ok(ids(cfg).includes('threedirector'), `the Lab's Three Director is still in config.json (its chats show in the Lab) · agents: ${ids(cfg)}`);
    ok(cfg.agents?.find((a) => a.id === 'threedirector')?.toolMode === 'full', 'with its own settings');
    ok(cfg.theme?.accent === '#ff7a1a' && cfg.settings?.startOn === 'tool:three', `the owner's look and settings are kept (${cfg.theme?.accent}, ${cfg.settings?.startOn})`);
    ok(JSON.stringify(cfg.tools?.hidden) === JSON.stringify(['creative', 'board']), `the owner's rail is kept (${JSON.stringify(cfg.tools)})`);
    ok(/--glow: gold/.test(read(path.join(app, 'theme.css'))), 'theme.css: the owner\'s CSS is back');
    ok(!r.kept?.length, `nothing reported as left in a stash (${r.kept})`);
    ok(stashes(app).some((m) => /written while the update ran/.test(m)), `the window's write is kept in its own named stash (nothing dropped): ${stashes(app)}`);
    fs.rmSync(hook);
  }

  // ---------- 2. the owner's state after 53 → 54 (and one more update on top): brought back at the start ----------
  {
    const { dev, app } = makeApp('b');
    // 53 → 54 as it went: the owner's edits in their stash, the window's save in config.json, the stash not back
    g(app, 'stash', 'push', '-q', '-m', 'hearth-update 2026-10-17 09:12 (764fb08 → f994ef0): your edits');
    write(path.join(app, 'config.json'), text(WINDOW));
    pushUpdate(dev, 54); g(app, 'pull', '-q', '--ff-only');
    // and a second update the same way (its stash holds only the window's config.json)
    g(app, 'stash', 'push', '-q', '-m', 'hearth-update 2026-10-17 21:40 (f994ef0 → abcdef1): your edits');
    write(path.join(app, 'config.json'), text(WINDOW));
    pushUpdate(dev, 55); g(app, 'pull', '-q', '--ff-only');
    // the owner ran /director-setup meanwhile? not here: the Lab has no director at all
    ok(!ids(json(path.join(app, 'config.json'))).includes('threedirector'), 'before: the Three Director is gone from config.json (the bug)');
    const U = fresh(path.join(app, 'updatermain.js'));
    ok(typeof U.bringBack === 'function', 'updatermain.bringBack() exists (run a moment after the start by main.js)');
    const r = U.bringBack ? await U.bringBack() : { brought: [] };
    const cfg = json(path.join(app, 'config.json'));
    ok(ids(cfg).includes('threedirector') && cfg.agents.find((a) => a.id === 'threedirector').dock === 'three', `the Three Director is back, docked in the Lab: ${ids(cfg)} · brought: ${r.brought}`);
    ok(cfg.theme?.accent === '#ff7a1a' && cfg.settings?.startOn === 'tool:three', 'the owner\'s look and settings are back');
    ok(ids(cfg).indexOf('claude') === 0 && new Set(ids(cfg)).size === ids(cfg).length, 'no agent twice');
    ok(/--glow: gold/.test(read(path.join(app, 'theme.css'))), 'theme.css: the owner\'s CSS is back');
    ok(stashes(app).filter((m) => /your edits/.test(m)).length === 2, 'both stashes are kept (nothing dropped)');
    ok(read(path.join(app, 'main.js')) === '// main 55\n', 'the code stays the newest');
    const r2 = U.bringBack ? await U.bringBack() : { brought: ['?'] };
    ok(!r2.brought.length, 'once: the second start brings nothing');
    // the owner deletes the director on purpose later: it stays deleted
    write(path.join(app, 'config.json'), text({ ...cfg, agents: cfg.agents.filter((a) => a.id !== 'threedirector') }));
    const r3 = U.bringBack ? await U.bringBack() : { brought: [] };
    ok(!r3.brought.length && !ids(json(path.join(app, 'config.json'))).includes('threedirector'), 'an agent deleted later stays deleted');
  }

  // ---------- 3. a config.json that can't be read is never written over ----------
  {
    const { app } = makeApp('c');
    g(app, 'stash', 'push', '-q', '-m', 'hearth-update 2026-10-17 09:12 (764fb08 → f994ef0): your edits');
    write(path.join(app, 'config.json'), '{ "agents": [ half a fi');
    const U = fresh(path.join(app, 'updatermain.js'));
    const r = U.bringBack ? await U.bringBack() : { brought: [] };
    ok(read(path.join(app, 'config.json')) === '{ "agents": [ half a fi' && !r.brought.includes('agent Three Director'), 'an unreadable config.json is left as it is (never treated as empty)');
    ok(stashes(app).length === 1, 'its stash is kept');
  }

  // ---------- 4. bringConfig: the owner's wins, nothing removed ----------
  {
    let C = null; try { C = require(path.join(FROM, 'updatesafe-core.js')); } catch { C = null; }
    const bc = C?.bringConfig;
    if (ok(typeof bc === 'function', 'updatesafe-core.bringConfig exists')) {
      const a = bc(WINDOW, OWNER, REPO).value;
      ok(ids(a).join() === 'claude,astra,threedirector' && a.theme.accent === '#ff7a1a' && a.settings.startOn === 'tool:three', 'the repo\'s own parts give way to the owner\'s');
      const mine = { ...OWNER, agents: [...OWNER.agents.slice(0, 2), { ...DIRECTOR, name: 'My director' }], theme: { ...OWNER.theme, accent: '#00ff00' } };
      const b = bc(mine, OWNER, REPO).value;
      ok(b.agents.find((x) => x.id === 'threedirector').name === 'My director' && b.theme.accent === '#00ff00', 'what the owner changed since stays theirs');
      const c = bc(OWNER, WINDOW, REPO).value;
      ok(ids(c).join() === ids(OWNER).join() && c.theme.accent === '#ff7a1a' && JSON.stringify(c.tools) === JSON.stringify(OWNER.tools), 'the window\'s save never replaces the owner\'s');
      ok(bc(null, OWNER, REPO).value === null && bc(OWNER, null, REPO).value === OWNER, 'not a config: unchanged');
    }
  }

  // ---------- 5. (round 55, fixes55) Windows: the update finished as Hearth restarts (startSwap / swapSync) ----------
  {
    const Cof = (app) => fresh(path.join(app, 'updatesafe-core.js'));
    const stage = (app) => { g(app, 'fetch', '-q', 'origin', 'main'); const C = Cof(app); C.writeState(app, 'pending', { from: g(app, 'rev-parse', 'HEAD'), to: g(app, 'rev-parse', 'origin/main'), branch: 'main', at: Date.now() }); return C; };
    const fakeApp = () => ({ calls: [], relaunch() { this.calls.push('relaunch'); }, exit() { this.calls.push('exit'); } });
    const marks = (f) => /^(<<<<<<<|>>>>>>>|=======)/m.test(read(f));
    const hasSwap = (C) => typeof C.restoreSteps === 'function';

    // 5a. the owner's config.json and theme.css clash with the update's: the owner's win, the update's new parts added
    {
      const { dev, app } = makeApp('d');
      const NEW = { ...REPO, theme: { ...REPO.theme, accent: '#8a6cff' }, layout: { ...REPO.layout, compact: true }, quests: { on: true } };
      write(path.join(dev, 'config.json'), text(NEW));
      write(path.join(dev, 'theme.css'), '/* your own CSS (Settings › Look) */\n');
      pushUpdate(dev, 54);
      const C = stage(app);
      const A = fakeApp();
      let threw = null; try { C.startSwap(A, { dir: app }); } catch (err) { threw = err; }
      ok(!threw, `startSwap never throws (${threw?.message || 'ok'})`);
      ok(read(path.join(app, 'main.js')) === '// main 54\n' && A.calls.join() === 'relaunch,exit', 'at the restart: the update is in, Hearth starts once more');
      let cfg = {}; try { cfg = json(path.join(app, 'config.json')); } catch { cfg = {}; }
      ok(!marks(path.join(app, 'config.json')) && !marks(path.join(app, 'theme.css')), 'no conflict marks in config.json / theme.css');
      ok(ids(cfg).includes('threedirector'), `restart path: the Lab's Three Director is still in config.json · agents: ${ids(cfg)}`);
      ok(cfg.theme?.accent === '#ff7a1a' && cfg.settings?.startOn === 'tool:three' && JSON.stringify(cfg.tools?.hidden) === '["creative","board"]', `restart path: the owner's values win (${cfg.theme?.accent})`);
      ok(cfg.layout?.compact === true && cfg.quests?.on === true, `restart path: the update's new parts are added (${JSON.stringify(cfg.layout)}, ${JSON.stringify(cfg.quests)})`);
      ok(/--glow: gold/.test(read(path.join(app, 'theme.css'))), 'restart path: theme.css keeps the owner\'s CSS');
      ok(stashes(app).some((m) => /your edits/.test(m)), `restart path: the owner's stash is kept (never dropped after a clash): ${stashes(app)}`);
      const sw = C.readState(app, 'swapped');
      ok(sw?.ok && (sw.own || []).includes('config.json') && (sw.own || []).includes('theme.css'), `the window is told plainly (${JSON.stringify(sw && { own: sw.own, kept: sw.kept })})`);
    }
    // 5b. no clash: the owner's edits back, their stash dropped
    {
      const { dev, app } = makeApp('e');
      pushUpdate(dev, 54);
      const C = stage(app);
      C.startSwap(fakeApp(), { dir: app });
      const cfg = json(path.join(app, 'config.json'));
      ok(ids(cfg).includes('threedirector') && /--glow: gold/.test(read(path.join(app, 'theme.css'))) && read(path.join(app, 'main.js')) === '// main 54\n', 'restart path, no clash: the update in, the owner\'s config and theme back');
      ok(!stashes(app).length, 'its stash came back whole and is dropped');
    }
    // 5c. something writes config.json during the restart merge (a post-merge hook): kept apart, merged, owner's win
    {
      const { dev, app } = makeApp('f');
      pushUpdate(dev, 54);
      const C = stage(app);
      const hook = path.join(app, '.git', 'hooks', 'post-merge');
      write(hook, `#!/bin/sh\ncat "${path.join(T, 'window.json')}" > config.json\n`); fs.chmodSync(hook, 0o755);
      C.startSwap(fakeApp(), { dir: app });
      fs.rmSync(hook);
      const cfg = json(path.join(app, 'config.json'));
      ok(hasSwap(C) && ids(cfg).includes('threedirector') && cfg.theme.accent === '#ff7a1a' && JSON.stringify(cfg.tools?.hidden) === '["creative","board"]', `restart path: a write during the merge never replaces the owner's (${JSON.stringify(cfg.tools)})`);
      ok(stashes(app).some((m) => /written while the update ran/.test(m)) && !stashes(app).some((m) => /your edits/.test(m)), `the write is kept in its own named stash, the owner's came back: ${stashes(app)}`);
    }
    // 5d. the staged merge fails at the restart (history moved): the owner's edits back, no marks, nothing lost
    {
      const { dev, app } = makeApp('g');
      pushUpdate(dev, 54);
      g(app, 'fetch', '-q', 'origin', 'main');
      // a staged commit that isn't a fast-forward of HEAD (unrelated history): the merge refuses
      const orphan = g(app, 'commit-tree', g(app, 'rev-parse', 'origin/main^{tree}'), '-m', 'orphan');
      const C = Cof(app);
      const r = C.swapSync({ dir: app, pending: { from: g(app, 'rev-parse', 'HEAD'), to: orphan } });
      const cfg = json(path.join(app, 'config.json'));
      ok(!r.ok && ids(cfg).includes('threedirector') && /--glow: gold/.test(read(path.join(app, 'theme.css'))) && !marks(path.join(app, 'config.json')), `a failed restart merge puts the owner's files back (${r.reason})`);
      ok(!stashes(app).length && read(path.join(app, 'main.js')) === '// main 1\n', 'its stash came back whole (dropped), the old code stays');
    }
    // 5e. git missing at the restart: Hearth starts as usual, the staged update waits for the next start
    {
      const { dev, app } = makeApp('h');
      pushUpdate(dev, 54);
      const C = stage(app);
      let threw = null; let r = null;
      try { r = C.startSwap(fakeApp(), { dir: app, gitBin: path.join(T, 'no-git-here') }); } catch (err) { threw = err; }
      ok(!threw && r === false && C.readState(app, 'pending')?.to, `no git: no throw, the usual start, the staged update kept (${threw?.message || 'ok'})`);
      ok(ids(json(path.join(app, 'config.json'))).includes('threedirector'), 'and nothing of the owner\'s touched');
    }
  }

  fs.rmSync(T, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
