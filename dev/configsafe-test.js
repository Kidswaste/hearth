// 🛡 configsafe (round 55): the owner's settings live in the data folder, on real throwaway git repos. config.json and
// theme.css are tracked files; the owner's copies used to be them, so every update had to stash them (round 53 → 54 left
// them in the stash: labchats54). Now they move once into data/ and the tracked files are the repo's defaults.
//   1. an old-layout install (the owner's agents / look / CSS in the tracked files): moved once into data (a copy kept in
//      data/.configsafe), the tracked files go back to the repo's own, a second start moves nothing
//   2. an update over it (the repo changes config.json, theme.css and code): no stash at all, the owner's agents, look and
//      CSS intact, the repo's new default agent / part show up, a default agent the owner removed stays removed
//   3. an old-layout install whose owner config is still in an update stash (round 53 → 54's state): brought into data
//      at the start, once, stashes kept; then updates need no stash
//   4. a tracked config.json that can't be read: this start stays on the old layout (nothing written), moved next start
//   5. effective(): the owner's values win, agents join by id, nothing of the owner's replaced
//   7. ↶ Go back to a version from before the move: it gets the owner's settings in the tracked files, and what it
//      changed there comes back into data at the next start of a version with the move
//   6. every reader goes through the owner's file (main.js, fsapi, backups, Recover, sync, the capture MCP server)
//   node dev/configsafe-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-configsafe-'));
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const read = (f) => fs.readFileSync(f, 'utf8');
const json = (f) => JSON.parse(read(f));
const fails = [];
const ok = (c, what) => { console.log(`${c ? '✓' : '✖'} ${what}`); if (!c) fails.push(what); return c; };
const ids = (cfg) => (cfg?.agents || []).map((a) => a.id);
const text = (v) => `${JSON.stringify(v, null, 2)}\n`;

const REPO = { agents: [{ id: 'claude', name: 'Claude', mode: 'native', engine: 'claude' }, { id: 'astra', name: 'Astra', mode: 'native', engine: 'codex' }], layout: { start: 'single', chatsPanel: true }, theme: { background: '#0f1115', accent: '#7c5cff' } };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', icon: '◆', mode: 'native', engine: 'claude', dock: 'three', threeTools: true, toolMode: 'full' };
// the owner: their Three Director, their look, their settings, and Astra removed on purpose
const OWNER = { ...REPO, agents: [REPO.agents[0], DIRECTOR], theme: { ...REPO.theme, accent: '#ff7a1a' }, settings: { startOn: 'tool:three', autoBackupDays: 1 }, tools: { hidden: ['board'] } };
const OWN_CSS = '/* your own CSS */\n.lab { --glow: gold; }\n';
const WINDOW = { ...REPO, tools: { placed: ['creative'], hidden: ['creative'] } }; // round 53's mid-update save
const CODE = ['updatermain.js', 'updatesafe-core.js', 'configsafe-core.js', 'scenesafe-core.js', 'crashsafe-core.js'];

function makeApp(name, { code = CODE } = {}) {
  const origin = path.join(T, `${name}-origin.git`);
  g(T, 'init', '--bare', '-q', '-b', 'main', origin);
  const dev = path.join(T, `${name}-dev`);
  g(T, 'clone', '-q', origin, dev);
  write(path.join(dev, '.gitignore'), 'data/\n');
  write(path.join(dev, 'index.html'), '<script defer src="ui.js"></script>');
  write(path.join(dev, 'ui.js'), '// ui 1\n');
  write(path.join(dev, 'main.js'), '// main 1\n');
  write(path.join(dev, 'config.json'), text(REPO));
  write(path.join(dev, 'theme.css'), '/* your own CSS */\n');
  for (const f of code) fs.copyFileSync(path.join(ROOT, f), path.join(dev, f));
  g(dev, 'add', '-A'); g(dev, 'commit', '-qm', 'round 54'); g(dev, 'push', '-q', 'origin', 'main');
  const app = path.join(T, `${name}-app`);
  g(T, 'clone', '-q', origin, app);
  write(path.join(app, 'data', 'chats', 'threedirector-clink.json'), text({ id: 'threedirector-clink', agentId: 'threedirector', title: 'Clink' }));
  return { origin, dev, app };
}
// an old-layout install: the owner's copies are the tracked files
const ownerEdits = (app) => { write(path.join(app, 'config.json'), text(OWNER)); write(path.join(app, 'theme.css'), OWN_CSS); };
function pushUpdate(dev, n, { config = null, theme = null } = {}) {
  write(path.join(dev, 'main.js'), `// main ${n}\n`); write(path.join(dev, 'ui.js'), `// ui ${n}\n`);
  if (config) write(path.join(dev, 'config.json'), text(config));
  if (theme) write(path.join(dev, 'theme.css'), theme);
  g(dev, 'commit', '-qam', `round ${n}`); g(dev, 'push', '-q', 'origin', 'main');
}
const stashes = (app) => g(app, 'stash', 'list', '--format=%gs').split('\n').filter(Boolean);
const dirty = (app) => g(app, 'status', '--porcelain', '--untracked-files=no');
function load(app) {
  for (const f of CODE) { try { delete require.cache[require.resolve(path.join(app, f))]; } catch { /* not loaded */ } }
  const CS = fs.existsSync(path.join(app, 'configsafe-core.js')) ? require(path.join(app, 'configsafe-core.js')) : null; // (a version from before the move has none)
  return { CS, U: require(path.join(app, 'updatermain.js')) };
}
// what main.js does at a start: migrate (before anything reads), then a moment later afterStart (bring back + settle)
async function start(app) {
  const { CS, U } = load(app);
  const cfg = CS.migrate({ appDir: app, dataDir: path.join(app, 'data') });
  const after = await CS.afterStart(U, cfg);
  return { cfg, after, CS, U };
}
const used = (app, CS) => CS.effective(json(path.join(app, 'data', 'config.json')), json(path.join(app, 'config.json'))); // what Hearth uses

(async () => {
  // ---------- 1 + 2. an old-layout install, moved once, then updated with no stash ----------
  {
    const { dev, app } = makeApp('a');
    ownerEdits(app);
    const s1 = await start(app);
    ok(s1.cfg.mode === 'data' && s1.cfg.migrated.join() === 'config.json,theme.css', `moved into the data folder: ${s1.cfg.migrated}`);
    const own = json(path.join(app, 'data', 'config.json'));
    ok(ids(own).join() === 'claude,threedirector' && own.theme.accent === '#ff7a1a' && own.settings.startOn === 'tool:three', `data/config.json is the owner's (agents ${ids(own)}, accent ${own.theme.accent})`);
    ok(read(path.join(app, 'data', 'theme.css')) === OWN_CSS, 'data/theme.css is the owner\'s CSS');
    ok(read(path.join(app, 'data', '.configsafe', 'config.json')) === text(OWNER) && read(path.join(app, 'data', '.configsafe', 'theme.css')) === OWN_CSS, 'the tracked files\' content is kept byte for byte in data/.configsafe');
    ok(!dirty(app) && json(path.join(app, 'config.json')).agents.length === 2 && read(path.join(app, 'theme.css')) === '/* your own CSS */\n', `the tracked files are the repo's own again (git status: "${dirty(app)}") · settled ${s1.after.settled}`);
    ok(!s1.after.brought.length, `nothing reported as brought back on a plain move (${s1.after.brought})`);
    const u1 = used(app, s1.CS);
    ok(ids(u1).join() === 'claude,threedirector', `what Hearth uses: the owner's agents, Astra stays removed (${ids(u1)})`);
    ok(fs.existsSync(path.join(app, 'data', 'chats', 'threedirector-clink.json')), 'the chats are untouched');

    // the owner keeps working: the window saves into data/config.json; a second start moves nothing
    write(path.join(app, 'data', 'config.json'), text({ ...json(path.join(app, 'data', 'config.json')), settings: { ...own.settings, later: true } }));
    const s2 = await start(app);
    ok(!s2.cfg.migrated.length && json(path.join(app, 'data', 'config.json')).settings.later === true, 'a second start moves nothing (once): the owner\'s later save stays');
    ok(!s2.after.settled.length && !s2.after.brought.length, 'and has nothing to settle or bring');

    // the update: the repo adds a default agent and a part, changes its default look and theme.css, and code
    const muse = { id: 'muse', name: 'Muse', mode: 'native', engine: 'claude' };
    pushUpdate(dev, 55, { config: { ...REPO, agents: [...REPO.agents, muse], layout: { ...REPO.layout, compact: true }, theme: { ...REPO.theme, accent: '#123456' }, askAll: { pressEnter: true } }, theme: '/* your own CSS (new hint) */\n' });
    const before = stashes(app).length;
    const { U, CS } = load(app);
    const r = await U.apply();
    ok(r.ok && read(path.join(app, 'main.js')) === '// main 55\n', `the update went in (${JSON.stringify(r).slice(0, 120)})`);
    ok(stashes(app).length === before && before === 0, `no stash at all (${stashes(app)})`);
    ok(!/your edits/.test(r.message || '') && !r.kept?.length, 'nothing said about hand edits');
    const own2 = json(path.join(app, 'data', 'config.json'));
    ok(ids(own2).join() === 'claude,threedirector' && own2.theme.accent === '#ff7a1a' && own2.settings.later === true, 'data/config.json untouched by the update');
    ok(read(path.join(app, 'data', 'theme.css')) === OWN_CSS, 'data/theme.css untouched by the update');
    const u2 = used(app, CS);
    ok(ids(u2).join() === 'claude,threedirector,muse', `what Hearth uses: the owner's agents + the repo's new one, Astra still removed (${ids(u2)})`);
    ok(u2.theme.accent === '#ff7a1a' && u2.layout.compact === true && u2.askAll?.pressEnter === true && u2.agents[1].dock === 'three', 'the owner\'s look wins; the repo\'s new keys and parts are filled in; the director stays docked in the Lab');
    // the Three Director's chats stay with it: its agent id is unchanged
    ok(u2.agents.some((a) => a.id === json(path.join(app, 'data', 'chats', 'threedirector-clink.json')).agentId), 'Clink\'s chat still has its agent');
    // one more start after the update: nothing moves, nothing settles
    const s3 = await start(app);
    ok(!s3.cfg.migrated.length && !s3.after.settled.length && !dirty(app), 'after the update: nothing to move or settle, the checkout stays clean');
    // and the next update: still no stash
    pushUpdate(dev, 56);
    const r2 = await load(app).U.apply();
    ok(r2.ok && stashes(app).length === 0 && json(path.join(app, 'data', 'config.json')).theme.accent === '#ff7a1a', 'the next update: no stash either, the owner\'s look kept');
  }

  // ---------- 3. the owner's config still in an update stash (round 53 → 54's state) ----------
  {
    const { dev, app } = makeApp('b');
    ownerEdits(app);
    g(app, 'stash', 'push', '-q', '-m', 'hearth-update 2026-10-17 09:12 (764fb08 → f994ef0): your edits');
    write(path.join(app, 'config.json'), text(WINDOW)); // what the window saved meanwhile
    pushUpdate(dev, 55); g(app, 'pull', '-q', '--ff-only');
    ok(!ids(json(path.join(app, 'config.json'))).includes('threedirector'), 'before: the Three Director only in the stash (the bug)');
    const s = await start(app);
    const own = json(path.join(app, 'data', 'config.json'));
    ok(ids(own).includes('threedirector') && own.agents.find((a) => a.id === 'threedirector').dock === 'three', `brought into data/config.json from the stash: ${ids(own)} · brought: ${s.after.brought}`);
    ok(own.theme.accent === '#ff7a1a' && own.settings?.startOn === 'tool:three', 'the owner\'s look and settings too');
    ok(JSON.stringify(own.tools?.placed) === '["creative"]', 'the window\'s save is kept too (nothing dropped)');
    ok(read(path.join(app, 'data', 'theme.css')) === OWN_CSS, 'data/theme.css: the owner\'s CSS from the stash');
    ok(stashes(app).length === 1, 'the stash is kept (nothing dropped)');
    ok(!dirty(app), `the tracked files are the repo's own (${dirty(app)})`);
    ok(read(path.join(app, 'data', '.configsafe', 'config.json')) === text(WINDOW), 'what the tracked config.json held is kept in data/.configsafe');
    const s2 = await start(app);
    ok(!s2.after.brought.length && !s2.cfg.migrated.length, 'once: the next start brings nothing');
    // the owner removes the director later on purpose: it stays removed
    const cfg = json(path.join(app, 'data', 'config.json'));
    write(path.join(app, 'data', 'config.json'), text({ ...cfg, agents: cfg.agents.filter((a) => a.id !== 'threedirector') }));
    const s3 = await start(app);
    ok(!s3.after.brought.length && !ids(used(app, s3.CS)).includes('threedirector'), 'an agent removed later stays removed');
    pushUpdate(dev, 56);
    const r = await load(app).U.apply();
    ok(r.ok && stashes(app).length === 1, `the next update needs no stash (${stashes(app).length} kept: the old one)`);
  }

  // ---------- 4. a tracked config.json that can't be read: the old layout this start, nothing written ----------
  {
    const { app } = makeApp('c');
    write(path.join(app, 'config.json'), '{ "agents": [ half a fi');
    const { CS } = load(app);
    const c = CS.migrate({ appDir: app, dataDir: path.join(app, 'data') });
    ok(c.mode === 'legacy' && c.why === 'garbled' && !fs.existsSync(path.join(app, 'data', 'config.json')), `garbled: stays on the old layout, nothing written (${c.mode}, ${c.why})`);
    ok(read(path.join(app, 'config.json')) === '{ "agents": [ half a fi', 'the tracked file left exactly as it is');
    write(path.join(app, 'config.json'), text(OWNER));
    const c2 = CS.migrate({ appDir: app, dataDir: path.join(app, 'data') });
    ok(c2.mode === 'data' && ids(json(path.join(app, 'data', 'config.json'))).includes('threedirector'), 'readable again: moved at that start');
    // a held file (Windows: EBUSY) at the first start: the same
    const { app: app2 } = makeApp('d');
    ownerEdits(app2);
    const held = new Proxy(fs, { get: (t, k) => (k === 'readFileSync' ? (p, ...a) => { if (String(p).endsWith(`${path.sep}config.json`) && !String(p).includes(`${path.sep}data${path.sep}`)) { const e = new Error('EBUSY'); e.code = 'EBUSY'; throw e; } return t.readFileSync(p, ...a); } : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
    const c3 = CS.migrate({ appDir: app2, dataDir: path.join(app2, 'data'), fs: held });
    ok(c3.mode === 'legacy' && c3.why === 'held' && !fs.existsSync(path.join(app2, 'data', 'config.json')), 'held: the old layout this start, nothing decided');
    // a fresh install (nothing customised): the repo's config becomes the owner's starting copy
    const { app: app3 } = makeApp('e');
    const c4 = CS.migrate({ appDir: app3, dataDir: path.join(app3, 'data') });
    const f4 = json(path.join(app3, 'data', 'config.json'));
    ok(c4.mode === 'data' && ids(f4).join() === 'claude,astra' && f4.defaultsSeen.join() === 'claude,astra', 'a fresh install starts from the repo\'s defaults');
  }

  // ---------- 7. Go back past the move, edit there, update again ----------
  {
    const { dev, app } = makeApp('f', { code: CODE.filter((f) => f !== 'configsafe-core.js') }); // round 54: no move yet
    ownerEdits(app);
    // round 55 brings the move (the updater code in the checkout is the new one, as when Hearth updates itself)
    fs.copyFileSync(path.join(ROOT, 'configsafe-core.js'), path.join(dev, 'configsafe-core.js')); g(dev, 'add', '-A');
    pushUpdate(dev, 55);
    for (const f of CODE) if (f !== 'configsafe-core.js') fs.copyFileSync(path.join(ROOT, f), path.join(app, f));
    let U = load(app).U;
    const r = await U.apply();
    ok(r.ok && fs.existsSync(path.join(app, 'configsafe-core.js')), `the update with the move went in (${String(r.message || '').slice(0, 80)})`);
    await start(app);
    ok(!dirty(app) && ids(json(path.join(app, 'data', 'config.json'))).includes('threedirector'), 'moved, the checkout clean');
    U = load(app).U;
    const b = await U.back();
    ok(b.ok && !fs.existsSync(path.join(app, 'configsafe-core.js')), `went back to round 54 (${String(b.message || b.note || '').slice(0, 80)})`);
    const handed = json(path.join(app, 'config.json'));
    ok(ids(handed).includes('threedirector') && handed.theme.accent === '#ff7a1a' && read(path.join(app, 'theme.css')) === OWN_CSS, `round 54 reads the owner's settings and CSS (the director and its chats stay in the Lab): ${ids(handed)}`);
    // round 54 is used for a while: the owner changes the look and adds an agent there (it writes the tracked file)
    write(path.join(app, 'config.json'), text({ ...handed, theme: { ...handed.theme, accent: '#abcdef' }, agents: [...handed.agents, { id: 'oldnew', name: 'Made in 54' }] }));
    const r2 = await U.apply(); // ⬆ Update again (54's updater: the owner's file goes through a stash and back)
    ok(r2.ok && fs.existsSync(path.join(app, 'configsafe-core.js')), 'updated again');
    const s = await start(app);
    const own = json(path.join(app, 'data', 'config.json'));
    ok(own.theme.accent === '#abcdef' && ids(own).includes('oldnew') && ids(own).includes('threedirector'), `what round 54 changed came back into data/config.json (${own.theme.accent}, ${ids(own)})`);
    ok(!dirty(app) && s.after.settled.includes('config.json'), 'the tracked files are the repo\'s own again');
    write(path.join(app, 'data', 'config.json'), text({ ...own, theme: { ...own.theme, accent: '#000001' } }));
    const s2 = await start(app);
    ok(json(path.join(app, 'data', 'config.json')).theme.accent === '#000001' && !s2.after.settled.length, 'once: later saves in data stay the owner\'s');
  }

  // ---------- 5. effective() ----------
  {
    const CS = require(path.join(ROOT, 'configsafe-core.js'));
    const def = { agents: [{ id: 'claude', name: 'Claude', effort: 'high' }, { id: 'astra', name: 'Astra' }, { id: 'muse', name: 'Muse' }], theme: { accent: '#111', radius: 10 }, layout: { a: 1 } };
    const own = { agents: [{ id: 'mine', name: 'Mine' }, { id: 'claude', name: 'My Claude' }], theme: { accent: '#f00' }, settings: { x: 1 }, defaultsSeen: ['claude', 'astra'] };
    const e = CS.effective(own, def);
    ok(ids(e).join() === 'mine,claude,muse', `agents join by id, the owner's order first, a removed default stays removed, a new one joins (${ids(e)})`);
    ok(e.agents[1].name === 'My Claude' && e.agents[1].effort === 'high', 'the owner\'s fields win, a field only the default has is filled in');
    ok(e.theme.accent === '#f00' && e.theme.radius === 10 && e.layout.a === 1 && e.settings.x === 1, 'parts: the owner\'s values win, missing keys / parts filled');
    ok(JSON.stringify(own.agents) === JSON.stringify([{ id: 'mine', name: 'Mine' }, { id: 'claude', name: 'My Claude' }]) && !('radius' in own.theme), 'the owner\'s object is never changed');
    e.layout.a = 2; ok(def.layout.a === 1, 'the defaults are never changed through the result');
    ok(e.defaultsSeen.join() === 'claude,astra,muse' && CS.effective({ ...own, defaultsSeen: e.defaultsSeen }, def).defaultsSeen === e.defaultsSeen, `defaultsSeen: each default once, unchanged when nothing is new (${e.defaultsSeen})`);
    ok(CS.effective(null, def) === null && CS.effective(own, null) === own, 'not a config: unchanged');
  }

  // ---------- 6. every reader goes through the owner's file ----------
  {
    const src = (f) => read(path.join(ROOT, f));
    const main = src('main.js');
    ok(/const CONFIG_PATH = CFG\.mode === 'data' \? CFG\.paths\.config/.test(main) && /configsafe\.migrate\(/.test(main) && main.indexOf('configsafe.migrate(') < main.indexOf('datasafe.config('), 'main.js: moved before the config is first read; CONFIG_PATH is data/config.json');
    ok(/cfg: cfgView/.test(main) && /function readConfig\(\) \{ return configsafe\.effective\(/.test(main), 'main.js: the window, the engines, Recover read the defaults + the owner\'s');
    ok(/configsafe\.afterStart\(/.test(main), 'main.js: bring back + settle a moment after the start');
    const raw = [];
    const walk = (dir, rel = '') => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) { if (!['dev', 'docs', 'data', 'electron', 'node_modules', '.git', '.claude', 'mac', 'assets'].includes(e.name)) walk(path.join(dir, e.name), `${rel}${e.name}/`); } else if (e.name.endsWith('.js')) { const t = read(path.join(dir, e.name)); if (/path\.join\(__dirname,\s*(?:'\.\.',\s*)?'(?:config\.json|theme\.css)'/.test(t)) raw.push(`${rel}${e.name}`); } } };
    walk(ROOT);
    ok(raw.join() === '', `no file reads the tracked config.json / theme.css by itself (${raw})`);
    ok(require(path.join(ROOT, 'sync-merge.js')).localOnly('config.json') && require(path.join(ROOT, 'sync-merge.js')).localOnly('theme.css'), 'sync: data/config.json travels once, as app/config.json (not a second time as a data file)');
  }

  fs.rmSync(T, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
