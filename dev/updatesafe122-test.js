#!/usr/bin/env node
// (round 122, updatesafe122) Updating an OLD install to this version, on real installs built from Hearth's own git
// history in temp folders: an "origin" whose main is this checkout's HEAD (it borrows this repo's objects read-only,
// nothing is copied or written here), and installs checked out at round 115 (34d9ed5) or round 110 (b74a1c2) with
// their remote-tracking main left where it was then. Round 116 removed ~340 files (the Life tab, the music studio).
// The real updater (updatermain.js create().apply(), the same call as ⬆ Update) runs on each:
//   (a) a clean round-115 install
//   (b) round 115 + the owner's own edits to files that still exist (one untouched since, one changed elsewhere)
//   (c) round 115 + an edit to a file round 116 deleted (the quest guide's window file, the quest journal: slim116)
//   (d) round 115 + an edit to projects.js that clashes with the update, + a good edit, + an edit to a deleted file
//   (e) round 115 + untracked leftovers (node_modules bits, a stray .orig, a hand-made file with a new file's name)
//   (f) round 110 + a data folder full of the removed features' stores (quests, VST, studio, tickets, photos…)
//   (g) Windows: CRLF checkout (core.autocrlf=true), a deleted file held open (the merge fails half-way, staged and
//       finished at the next start by updatesafe-core.startSwap) with an edit to that file
//   (h) the real jump: round 115's OWN updater (the install's updatermain.js, as on the owner's computers) runs the
//       update with (d)'s edits, then this version's first start (bringBack) tidies what it left
// Every case: the data folder byte-identical (content + times), done or refused in plain words, the owner's edits back
// or kept in kept-from-updates/ with a note, no conflict marks, the app boots (dev/boot-test.js run IN the updated
// install: lazy groups, manifest, IPC channels, first-screen budget) and lazy-data.js / lazy-meta.js are main's,
// nothing but git is run and no terminal opens (nothing installed).
//   node dev/updatesafe122-test.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');

// every program the updater starts (it must only ever be git: nothing installed behind the owner's back)
const ran = [];
const execFile0 = cp.execFile;
cp.execFile = function patched(file, ...rest) { ran.push(path.basename(String(file))); return execFile0.call(this, file, ...rest); };
const C = require('../updatesafe-core');
const { create } = require('../updatermain');
const { execFileSync } = cp;

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
for (const k of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete process.env[k];
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete process.env[k];
const T = require('./tmp-own').mkdtemp('hearth-updatesafe122-');
process.env.GIT_CONFIG_GLOBAL = path.join(T, 'global.gitconfig');
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, '');
process.env.GIT_CONFIG_NOSYSTEM = '1';
const ID = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...ID }, maxBuffer: 64 << 20 }).replace(/\s+$/, '');
const gTry = (cwd, ...args) => { try { return g(cwd, ...args); } catch { return null; } };
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const lf = (s) => (s == null ? s : String(s).replace(/\r\n/g, '\n'));
const t0 = Date.now();
const say = (r) => { if (process.argv.includes('--verbose')) console.log(`  → ${r.ok ? 'done' : r.reason}: ${r.note || r.message || ''}`); return r; }; // (--verbose: what the owner reads)

// ---------- "GitHub": main = this checkout's HEAD; the old rounds as they were ----------
// (a shallow copy — the Windows zip keeps 50 versions — may not reach round 110: said, not failed)
if (!gTry(ROOT, 'rev-parse', '--verify', '-q', 'b74a1c2^{commit}')) { console.log('updatesafe122-test: skipped (this copy\'s git history doesn\'t reach round 110: run it in a full clone)'); process.exit(0); }
const R115 = g(ROOT, 'rev-parse', '34d9ed5^{commit}');
const R110 = g(ROOT, 'rev-parse', 'b74a1c2^{commit}');
const MAIN = g(ROOT, 'rev-parse', 'HEAD');
const origin = path.join(T, 'origin.git');
g(T, 'init', '-q', '--bare', '-b', 'main', origin);
// (this repo's objects borrowed read-only: no copy of the history, nothing written here)
fs.writeFileSync(path.join(origin, 'objects', 'info', 'alternates'), `${path.resolve(ROOT, g(ROOT, 'rev-parse', '--git-common-dir'), 'objects')}\n`);
g(origin, 'update-ref', 'refs/heads/main', MAIN);
const gRaw = (cwd, ...args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }); } catch { return null; } };
const atMain = (f) => gRaw(origin, 'show', `main:${f}`); // (the exact bytes, LF as committed)
const gone = new Set(g(origin, 'diff', '--name-only', '--diff-filter=D', R115, MAIN).split('\n').filter(Boolean));
// three files round 116 removed (slim116), named once here: the quest guide, the quest journal, the VST host
const [QG, QJ, VST] = ['questguide.js', 'tools/quest-journal.js', 'creative-vstmain.js']; // slim116's removed files (round 122, updatesafe122)

// the owner's data folder: everyday stores + the removed features' stores (binary ones too)
const bin = (n, seed) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255));
const DATA = {
  'config.json': `${JSON.stringify({ settings: { theme: 'forge' }, agents: [{ id: 'claude', name: 'Claude' }, { id: 'threedirector', name: 'Three Director', dock: 'three' }], defaultsSeen: ['claude', 'threedirector'] }, null, 2)}\n`,
  'chats/c1.json': '{"title":"my chat","messages":[{"role":"user","text":"bonjour"}]}',
  'kv/projects.json': '{"v":1,"list":[{"id":"p1","name":"Stoop Ronin","items":[]}]}',
  'kv/quest-guide-store.json': '{"quests":[{"id":"q1","title":"Find the bakery"}]}',
  'quest-guide/session.json': '{"active":"q1","steps":3}',
  'leavesoon/reminders.json': '[{"at":1790000000000,"what":"leave for the show"}]',
  'creative-vst/warm.json': '{"used":true}',
  'creative-vst/soundbank/index.json': '{"presets":["Serum 2/Pad 1","Vital/Bass"]}',
  'creative-vst/plugins.json': '{"paths":["C:\\\\Program Files\\\\Common Files\\\\VST3\\\\Serum2.vst3"]}',
  'creative-live/set-1.json': '{"bpm":124,"clips":[1,2,3]}',
  'creative-park/jam.json': '{"notes":[60,62,64]}',
  'tickets/show-1/ticket.pdf': bin(4096, 7),
  'trash/tickets/old/ticket.pdf': bin(512, 3),
  'paris-photos/IMG_0001.jpg': bin(8192, 11),
  'sketches/loop 1.wav': bin(16384, 5),
  'workspace/notes.md': '# notes\n',
};
function snapData(app) {
  const out = {};
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
      const st = fs.lstatSync(p);
      if (e.isDirectory()) { out[`${r}/`] = 'dir'; walk(p, r); } else out[r] = `${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}:${st.size}:${st.mtimeMs}`;
    }
  };
  walk(path.join(app, 'data'), '');
  return JSON.stringify(out);
}

// an install: the app folder (named Hearth, as the Windows zip / the Mac installer make it) at an old round, its
// origin/main where that round last saw it, the data folder full
let n = 0;
function install(rev, { crlf = false } = {}) {
  const base = path.join(T, `i${++n}`);
  const app = path.join(base, 'Hearth');
  fs.mkdirSync(base);
  g(base, 'clone', '-q', '--shared', '--no-checkout', origin, app);
  if (crlf) g(app, 'config', 'core.autocrlf', 'true');
  g(app, 'update-ref', 'refs/remotes/origin/main', rev);
  g(app, 'checkout', '-q', '-B', 'main', rev);
  g(app, 'branch', '-q', '-u', 'origin/main');
  for (const [f, v] of Object.entries(DATA)) write(path.join(app, 'data', ...f.split('/')), v);
  return app;
}
const terminals = [];
const U = (app, o = {}) => create({ dir: app, terminal: (x) => { terminals.push(x); return { ok: true }; }, ...o });
const head = (app) => g(app, 'rev-parse', 'HEAD');
const dirty = (app) => g(app, 'status', '--porcelain', '--untracked-files=no');
const stashes = (app) => g(app, 'stash', 'list', '--format=%gs');
const marks = (app, files) => files.filter((f) => /^(<{7}|={7}|>{7})( |$)/m.test(read(path.join(app, f)) || ''));
// the app boots: dev/boot-test.js run inside the updated install (its own files: lazy groups, manifest, channels)
function boots(app) {
  try { execFileSync(process.execPath, [path.join(app, 'dev', 'boot-test.js')], { cwd: app, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }); return true; } catch (err) { console.log(String(err.stdout || '').split('\n').slice(-5).join('\n'), String(err.stderr || '').slice(0, 600)); return false; }
}
const manifestIsMain = (app) => ['lazy-data.js', 'lazy-meta.js', 'index.html', 'main.js'].every((f) => lf(read(path.join(app, f))) === atMain(f));
// the kept-aside folder the note names, and what is in it
const keptDir = (app, r) => { const m = /kept-from-updates[\\/][^"”]+?(?=[\\/]?["”]|$)/.exec(r.note || ''); return r.aside?.dir ? path.join(app, r.aside.dir) : m ? path.join(app, m[0]) : null; };
// what happens at the next start (main.js): the update's own stashes looked at once more (nothing resurrected)
async function nextStart(app) { return U(app).bringBack({ own: { config: path.join(app, 'data', 'config.json'), theme: path.join(app, 'data', 'theme.css') } }); }

(async () => {
  ok([QG, QJ, VST].every((f) => gone.has(f)), 'set-up: round 116 removed the Life tab and the music studio files');

  // ---------- (a) a clean round-115 install ----------
  {
    const app = install(R115);
    const snap = snapData(app);
    ok(fs.existsSync(path.join(app, QG)) && !dirty(app), '(a) set-up: round 115, clean');
    const s = await U(app).status();
    ok(s.ok && s.behind > 30 && s.plan.data.length === 0 && s.plan.collide.length === 0, `(a) ⬆ sees the update (${s.behind} versions behind, nothing in data/)`);
    const r = say(await U(app).apply());
    ok(r.ok && head(app) === MAIN && r.restart === true, `(a) updated to main, restart asked (${r.message || r.note || ''})`);
    ok(!dirty(app) && !stashes(app), '(a) clean after, no stash');
    ok(!fs.existsSync(path.join(app, QG)) && !fs.existsSync(path.join(app, VST)), '(a) the removed files are gone from the folder');
    ok(snapData(app) === snap, '(a) data folder byte-identical (content and times)');
    await nextStart(app);
    ok(snapData(app) === snap, '(a) …and after the next start\'s look at the stashes');
    // (boot-test itself loads main-process modules that may make folders in data/: always last)
    ok(boots(app) && manifestIsMain(app), '(a) the updated install boots (boot-test in it), lazy manifest = main\'s');
  }

  // ---------- (b) edits to files that still exist ----------
  {
    const app = install(R115);
    const snap = snapData(app);
    const ux = path.join(app, 'chat-ux.js'); const mem = path.join(app, 'memory.js');
    const uxMine = `${read(ux)}// my own tweak (Quentin)\n`;
    const memMine = read(mem).replace(/^/, '// (my note) memory editor\n');
    write(ux, uxMine); write(mem, memMine);
    ok(atMain('chat-ux.js') === gRaw(app, 'show', `${R115}:chat-ux.js`) && atMain('memory.js') !== gRaw(app, 'show', `${R115}:memory.js`),'(b) set-up: chat-ux.js untouched since, memory.js changed since (elsewhere)');
    const r = say(await U(app).apply());
    ok(r.ok && head(app) === MAIN, `(b) updated (${r.message || ''})`);
    ok(read(ux) === uxMine, '(b) the edit to an untouched file is back exactly');
    ok(read(mem) === `// (my note) memory editor\n${atMain('memory.js')}`,'(b) the edit to a changed file is back, merged with the update');
    ok(/put aside and are back in place/.test(r.note) && !stashes(app), `(b) said in plain words, no stash left (${r.note})`);
    ok(snapData(app) === snap && boots(app), '(b) data identical, boots');
  }

  // ---------- (c) an edit to a file round 116 deleted ----------
  {
    const app = install(R115);
    const snap = snapData(app);
    const qg = path.join(app, QG); const qj = path.join(app, QJ);
    const qgMine = `${read(qg)}// my quest tweak\n`; const qjMine = read(qj).replace(/^/, '// journal tweak\n');
    write(qg, qgMine); write(qj, qjMine);
    const s = await U(app).status();
    ok(s.ok && s.plan.removedEdits.join() === [QG, QJ].join(), `(c) ⬆ says beforehand which edited files the update removes (${s.plan.removedEdits})`);
    const r = say(await U(app).apply());
    ok(r.ok && head(app) === MAIN, `(c) the update is not blocked (${r.message || ''})`);
    ok(!fs.existsSync(qg) && !fs.existsSync(qj), '(c) the deleted files are not left in the app folder');
    const k = keptDir(app, r);
    ok(k && read(path.join(k, QG)) === qgMine && read(path.join(k, QJ)) === qjMine, `(c) the owner's versions are kept in kept-from-updates/ (${k && path.relative(app, k)})`);
    ok(r.note.includes(QG) && /removed/.test(r.note) && /kept-from-updates/.test(r.note), `(c) the note names the files and the folder (${r.note})`);
    ok(!/has the new version|have the new version/.test(r.note), '(c) the note doesn\'t claim a new version of a removed file');
    ok(k && fs.existsSync(path.join(k, 'README.txt')), '(c) the folder says what it is');
    ok(stashes(app).split('\n').filter(Boolean).length === 1, '(c) the stash stays too (named)');
    ok(!dirty(app), '(c) the checkout is clean (nothing half-applied)');
    const back = await nextStart(app);
    ok(!fs.existsSync(qg) && !back.brought.length, '(c) the next start doesn\'t bring the removed file back');
    ok(snapData(app) === snap && boots(app) && manifestIsMain(app), '(c) data identical, boots, manifest = main\'s');
  }

  // ---------- (d) a clashing edit to projects.js (+ a good edit, + an edit to a deleted file) ----------
  {
    const app = install(R115);
    const snap = snapData(app);
    const pj = path.join(app, 'projects.js'); const mem = path.join(app, 'memory.js'); const qg = path.join(app, QG);
    const pjMine = read(pj).replace('the chats list groups a project\'s chats', 'the chats list groups a project\'s chats (my way)');
    ok(pjMine !== read(pj), '(d) set-up: an edit on a line round 121 rewrote');
    const memMine = `${read(mem)}// mine\n`; const qgMine = `${read(qg)}// mine\n`;
    write(pj, pjMine); write(mem, memMine); write(qg, qgMine);
    const r = say(await U(app).apply());
    ok(r.ok && head(app) === MAIN, `(d) updated (${r.message || ''})`);
    ok(lf(read(pj)) === atMain('projects.js') && !marks(app, ['projects.js', 'memory.js']).length, '(d) projects.js is the update\'s, whole: no conflict marks, nothing half-applied');
    ok(lf(read(mem)) === `${atMain('memory.js')}// mine\n`, '(d) the edit that doesn\'t clash is back');
    ok(!fs.existsSync(qg), '(d) the removed file stays removed');
    const k = keptDir(app, r);
    ok(k && read(path.join(k, 'projects.js')) === pjMine && read(path.join(k, QG)) === qgMine, '(d) the clashing and the removed file\'s versions are kept aside');
    ok(/projects\.js/.test(r.note) && r.note.includes(QG) && /kept-from-updates/.test(r.note) && /stash/.test(r.note), `(d) the note names them, the folder and the stash (${r.note})`);
    ok(r.kept.includes('projects.js') && stashes(app), '(d) the stash stays (named)');
    ok(g(app, 'status', '--porcelain', '--untracked-files=no') === ' M memory.js', `(d) only the good edit shows as changed (${dirty(app)})`);
    const back = await nextStart(app);
    ok(lf(read(pj)) === atMain('projects.js') && !fs.existsSync(qg) && !back.brought.includes('projects.js'), '(d) the next start doesn\'t put the clashing edit in');
    ok(snapData(app) === snap && boots(app), '(d) data identical, boots');
  }

  // ---------- (e) untracked leftovers ----------
  {
    const app = install(R115);
    const snap = snapData(app);
    const left = {
      'node_modules/.package-lock.json': '{"lockfileVersion":3}',
      'node_modules/left-pad/index.js': 'module.exports = 1;\n',
      'projects.js.orig': '// a merge tool\'s copy\n',
      [`${QJ}.orig`]: '// beside a file the update removes\n',
      'creative-vst-host.pyc': bin(64, 1),
    };
    for (const [f, v] of Object.entries(left)) write(path.join(app, ...f.split('/')), v);
    const mineNew = '// my own datalock.js, made by hand before the update brought one\n';
    write(path.join(app, 'datalock.js'), mineNew);
    const s = await U(app).status();
    ok(s.ok && s.plan.collide.join() === 'datalock.js' && !s.dirty, `(e) ⬆ sees the hand-made file with a new file's name only (${s.plan.collide})`);
    const r = say(await U(app).apply());
    ok(r.ok && head(app) === MAIN, `(e) updated (${r.message || ''})`);
    ok(Object.entries(left).every(([f, v]) => Buffer.compare(fs.readFileSync(path.join(app, ...f.split('/'))), Buffer.from(v)) === 0), '(e) the untracked leftovers are untouched');
    ok(lf(read(path.join(app, 'datalock.js'))) === atMain('datalock.js') && /datalock\.js/.test(r.note) && /stash/.test(r.note), `(e) the update's datalock.js in place, the owner's kept in a named stash, said (${r.note})`);
    ok(g(app, 'show', `stash@{0}^3:datalock.js`) === mineNew.trim(), '(e) …and it is really in that stash');
    ok(!dirty(app) && snapData(app) === snap && boots(app), '(e) clean, data identical, boots');
  }

  // ---------- (f) round 110, a data folder full of the removed features' stores ----------
  {
    const app = install(R110);
    for (let i = 0; i < 40; i += 1) write(path.join(app, 'data', 'quest-guide', 'days', `2026-10-${String(i % 30 + 1).padStart(2, '0')}-${i}.json`), `{"i":${i}}`);
    for (let i = 0; i < 20; i += 1) write(path.join(app, 'data', 'creative-vst', 'sketches', `sketch ${i}.wav`), bin(2048, i));
    const snap = snapData(app);
    const r = say(await U(app).apply());
    ok(r.ok && head(app) === MAIN && !dirty(app), `(f) round 110 → main in one go (${r.message || r.changed})`);
    ok(snapData(app) === snap, '(f) every store of the removed features is byte-identical');
    await nextStart(app);
    ok(snapData(app) === snap && boots(app) && manifestIsMain(app), '(f) still after the next start; boots; manifest = main\'s');
    // Windows long paths: what this update writes, measured for the usual folders (core.longpaths is off by default)
    const incoming = g(app, 'diff', '--name-only', R110, MAIN).split('\n').filter(Boolean);
    const longest = incoming.reduce((a, f) => (f.length > a.length ? f : a), '');
    for (const d of ['C:\\Users\\Quentin\\Hearth', 'C:\\Users\\Quentin\\agent-hub', 'C:\\Users\\Quentin Vandenberghe-Longname\\OneDrive - Personal\\Documents\\Hearth']) {
      ok(C.tooLong(d, incoming, 'win32').length === 0, `(f) no file of this update is too long for Windows under ${d} (longest: ${longest.length} chars)`);
    }
  }

  // ---------- (g) Windows: CRLF, a removed file held open, an edit to it ----------
  {
    const app = install(R115, { crlf: true });
    ok(!dirty(app) && /\r\n/.test(read(path.join(app, 'projects.js'))), '(g) set-up: a CRLF checkout (Git for Windows\' default), clean');
    const snap = snapData(app);
    const qg = path.join(app, QG); const ux = path.join(app, 'chat-ux.js');
    const qgMine = `${read(qg)}// my tweak\r\n`; const uxMine = `${read(ux)}// mine\r\n`;
    write(qg, qgMine); write(ux, uxMine);
    const real = execFileSync('sh', ['-c', 'command -v git']).toString().trim();
    const wrap = path.join(T, 'heldgit'); const flag = path.join(T, 'held');
    // the merge writes part of the new version, then Windows refuses to unlink a removed file that is held open
    fs.writeFileSync(wrap, `#!/bin/sh\nfor a in "$@"; do if [ "$a" = merge ] && [ -f '${flag}' ]; then ${real} show origin/main:main.js > main.js; echo "error: unable to unlink old '${QG}': Invalid argument" >&2; exit 128; fi; done\nexec ${real} "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(flag, '');
    const r = say(await U(app, { gitBin: wrap, platform: 'win32' }).apply());
    ok(!r.ok && r.reason === 'locked' && r.staged && /restart/i.test(r.message), `(g) held open: staged for the restart, in plain words (${r.message})`);
    ok(head(app) === R115 && read(qg) === qgMine && read(ux) === uxMine && lf(read(path.join(app, 'main.js'))) === gRaw(app, 'show', `${R115}:main.js`) && !stashes(app), '(g) nothing half-done: the old version, the edits back, no stash');
    fs.unlinkSync(flag);
    const calls = [];
    const swapped = C.startSwap({ relaunch: () => calls.push('relaunch'), exit: () => calls.push('exit') }, { dir: app, gitBin: real });
    ok(swapped && calls.join() === 'relaunch,exit' && head(app) === MAIN, '(g) the next start finishes it, then starts once more');
    ok(!fs.existsSync(qg) && read(ux) === uxMine, '(g) the removed file is gone, the other edit back (CRLF kept)');
    const s = await U(app, { platform: 'win32' }).status({ fetch: false });
    const k = keptDir(app, s.swapped || {});
    ok(s.swapped?.ok && s.swapped.note.includes(QG) && /kept-from-updates/.test(s.swapped.note), `(g) the window says it once, naming the kept file (${s.swapped?.note})`);
    ok(k && read(path.join(k, QG)) === qgMine, '(g) the owner\'s version is in kept-from-updates/, byte for byte (CRLF as on Windows)');
    ok(!dirty(app).split('\n').filter((l) => l && l !== ' M chat-ux.js').length, `(g) nothing else changed (${dirty(app)})`);
    ok(snapData(app) === snap && boots(app), '(g) data identical, boots');
  }

  // ---------- (h) the real jump: round 115's own updater, then this version's first start ----------
  {
    const app = install(R115);
    const snap = snapData(app);
    const pj = path.join(app, 'projects.js'); const mem = path.join(app, 'memory.js'); const qg = path.join(app, QG);
    const pjMine = read(pj).replace('the chats list groups a project\'s chats', 'the chats list groups a project\'s chats (my way)');
    const memMine = `${read(mem)}// mine\n`; const qgMine = `${read(qg)}// mine\n`;
    write(pj, pjMine); write(mem, memMine); write(qg, qgMine);
    const old = require(path.join(app, 'updatermain.js')); // round 115's code, loaded before it updates itself
    const r = say(await old.create({ dir: app, terminal: (x) => { terminals.push(x); return { ok: true }; } }).apply());
    ok(r.ok && head(app) === MAIN, `(h) round 115's updater takes it to main (${r.message || ''})`);
    const leftMarks = marks(app, ['projects.js']).length > 0; const leftFile = fs.existsSync(qg);
    console.log(`  (h) round 115's own updater left: ${leftMarks ? 'conflict marks in projects.js' : 'no conflict marks'}, ${leftFile ? `${QG} in the folder` : `no ${QG}`}`);
    ok(snapData(app) === snap, '(h) data identical after the old updater');
    // this version starts (main.js: configsafe.afterStart → bringBack a few seconds in)
    const back = await nextStart(app);
    ok(!marks(app, ['projects.js']).length && lf(read(pj)) === atMain('projects.js') && !fs.existsSync(qg), `(h) the first start of this version tidies it: projects.js whole, the removed file gone (${back.tidied || 'nothing to tidy'})`);
    const st = await U(app).status({ fetch: false });
    const k = st.tidied ? path.join(app, /"(kept-from-updates\/[^"]+)"/.exec(st.tidied)?.[1] || '-') : null;
    ok(k && read(path.join(k, 'projects.js')) === pjMine && read(path.join(k, QG)) === qgMine && (!leftMarks || /<{7}/.test(read(path.join(k, 'projects.js.as-the-update-left-it.txt')) || '')), `(h) the owner's versions (and the marked file as it was) are in kept-from-updates/ (${st.tidied})`);
    ok(!(await U(app).status({ fetch: false })).tidied, '(h) said once');
    ok(lf(read(mem)) === `${atMain('memory.js')}// mine\n`, '(h) the good edit is untouched');
    ok(!(await nextStart(app)).tidied, '(h) the start after: nothing more');
    ok(snapData(app) === snap && boots(app), '(h) data identical, boots');
  }

  // ---------- nothing installed, nothing but git ----------
  ok(terminals.length === 0, 'no terminal window opened (nothing installed)');
  const others = [...new Set(ran)].filter((b) => !/^(git|heldgit)(\.exe)?$/.test(b));
  ok(ran.length > 0 && others.length === 0, `the updater ran only git (${others.join(', ') || 'git'})`);

  console.log(`updatesafe122-test: ${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s)`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
