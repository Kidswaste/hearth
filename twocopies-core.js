// Two copies of Hearth on one computer (round 64, twocopies64). Plain Node, no Electron: dev/twocopies-test.js runs it
// on fixture folder trees (Windows and Mac layouts); twocopiesmain.js does the Electron parts with these answers.
//
// What happened: the owner unzipped a second Hearth (%USERPROFILE%\Hearth, from Hearth-Windows.zip) next to their real
// one (%USERPROFILE%\agent-hub, their chats in data\chats). The new copy started with an empty data folder: "all my chats
// are gone". Both copies are called "agent-hub" (package.json), so Electron gave them ONE profile (localStorage,
// IndexedDB, cookies, the single-window lock) while each kept its own data folder: what one copy noted in the profile
// (the open chat, the Lab scene, the resume card, the queue typed while a reply ran, Keep going routines, first-run
// and what's-new marks) the other read as its own.
//
//   copyId / ensureId(dataDir)    a stable id for a data folder, kept in data/hearth-origin.json (moves with the folder,
//                                 so a moved copy keeps its profile; never synced: sync-merge LOCAL_FILES)
//   pickProfile(o)                which Electron profile this copy uses: the usual one (the copy that owns it: marked
//                                 in <profile>/hearth-copy.json) or its own one next to it ("<profile>-copy-<id>")
//   candidates(o) / findOthers(o) the other Hearth copies on this computer that have chats (Windows: agent-hub / Hearth
//                                 in the home folder, Desktop, Downloads, Documents, OneDrive, where the Start menu /
//                                 Desktop Hearth.lnk and the login item point; Mac: ~/Library/Application Support/Hearth,
//                                 ~/Applications/Hearth.app's launcher, /Applications/Hearth.app's boot.js HEARTH_DIR…)
//   openPlan(o)                   how to start another copy ("Open that one")
//   loginItemPlan(o)              "Start with Windows" off in this copy never removes ANOTHER copy's login entry
//   shortcutHold(o)               a copy with no chats never takes the Start menu / Desktop shortcuts while another
//                                 copy with chats exists
const nodePath = require('path');

const MARKER = 'hearth-copy.json'; // in the profile folder: which data folder (copy) owns this profile
const CHOICE = 'twocopies.json'; // in the data folder: { choice: 'fresh' | 'brought', other, at }
const CHAT_FILE = /^[\w-]{1,80}\.json$/;
const pathOf = (platform) => (platform === 'win32' ? nodePath.win32 : nodePath.posix);

// ---------- small, careful reads (a held file is never decided on) ----------
function readJson(fs, file) {
  try { return { ok: true, value: JSON.parse(require('./scenesafe-core').readRetry(fs, file, { tries: 3 })) }; } catch (err) {
    return { ok: false, missing: err && err.code === 'ENOENT', code: err && err.code };
  }
}
const exists = (fs, p) => { try { return Boolean(p) && fs.existsSync(p); } catch { return false; } };
// the chats a data folder holds (chat files; .prev copies and anything else don't count)
function countChats(fs, P, dataDir) {
  let n = 0; let newest = 0;
  let names = [];
  try { names = fs.readdirSync(P.join(dataDir, 'chats')); } catch { return { chats: 0, newest: 0 }; }
  for (const name of names) {
    if (!CHAT_FILE.test(name) || /\.prev\.json$/.test(name)) continue;
    n += 1;
    try { const t = fs.statSync(P.join(dataDir, 'chats', name)).mtimeMs; if (t > newest) newest = t; } catch { /* gone */ }
  }
  return { chats: n, newest };
}
// a Hearth folder: its code (main.js + store.js) next to a data folder (or the start of one)
const isCopy = (fs, P, dir) => exists(fs, P.join(dir, 'main.js')) && exists(fs, P.join(dir, 'store.js'));

// ---------- this data folder's id ----------
const newId = () => {
  try { return require('crypto').randomUUID().replace(/-/g, ''); } catch { return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`; }
};
// → the id, made once (null when data/hearth-origin.json exists but can't be read now: nothing is decided on it)
function ensureId({ fs, path: P = nodePath, dataDir, appDir, platform = process.platform, now = Date.now() }) {
  const file = P.join(dataDir, 'hearth-origin.json');
  const r = readJson(fs, file);
  if (r.ok && r.value && typeof r.value.copyId === 'string' && /^[\w-]{8,64}$/.test(r.value.copyId)) return r.value.copyId;
  if (!r.ok && !r.missing) return null; // held / half-written: next start
  const value = { ...(r.ok && r.value && typeof r.value === 'object' ? r.value : { dataDir, appDir, platform, at: now }), copyId: newId() };
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    require('./crashsafe-core').writeAtomicSync(fs, file, JSON.stringify(value, null, 2));
    return value.copyId;
  } catch { return null; }
}

// ---------- which profile ----------
const sideDir = (P, defaultDir, copyId) => `${defaultDir.replace(/[\\/]+$/, '')}-copy-${String(copyId).slice(0, 8)}`;
// a profile some copy already used (its localStorage / cookies / preferences are there)
const profileUsed = (fs, P, dir) => ['Local Storage', 'Preferences', 'Partitions', 'IndexedDB', MARKER].some((n) => exists(fs, P.join(dir, n)));
// o = { fs, path, defaultDir (Electron's usual profile for "agent-hub"), copyId, dataDir, appDir, chatsHere,
//       others() → [{ dir, chats }] (only asked when it matters) }
// → { dir, primary (this copy owns the usual profile), claim (write / refresh the marker), why }
function pickProfile({ fs, path: P = nodePath, defaultDir, copyId, dataDir, appDir, chatsHere = 0, others = () => [] }) {
  if (!copyId || !defaultDir) return { dir: defaultDir, primary: true, claim: false, why: 'no id' };
  const side = sideDir(P, defaultDir, copyId);
  const m = readJson(fs, P.join(defaultDir, MARKER));
  const marker = m.ok && m.value && typeof m.value === 'object' ? m.value : null;
  if (marker && marker.copyId === copyId) return { dir: defaultDir, primary: true, claim: marker.dataDir !== dataDir || marker.appDir !== appDir, why: 'mine' };
  if (exists(fs, side)) return { dir: side, primary: false, claim: false, why: 'own profile' }; // once on its own, it stays
  if (!m.ok && !m.missing) return { dir: defaultDir, primary: true, claim: false, why: 'marker held' }; // decided at a start that can read it
  if (marker) {
    // another copy owns it: while that copy's data folder is there, this one gets its own; a gone copy's is taken over
    if (marker.dataDir && exists(fs, marker.dataDir)) return { dir: side, primary: false, claim: false, why: 'other copy', owner: marker };
    return { dir: defaultDir, primary: true, claim: true, why: 'owner gone', owner: marker };
  }
  // no copy marked it yet (every install before this version): a profile nobody used is this copy's; a used one goes
  // to the copy with chats (the most of them on this computer), never to a new empty copy
  if (!profileUsed(fs, P, defaultDir)) return { dir: defaultDir, primary: true, claim: true, why: 'fresh profile' };
  if (chatsHere > 0) {
    let most = null;
    try { for (const o of others() || []) if (!most || o.chats > most.chats) most = o; } catch { most = null; }
    if (!most || most.chats <= chatsHere) return { dir: defaultDir, primary: true, claim: true, why: 'has the chats' };
    return { dir: side, primary: false, claim: false, why: 'another copy has more chats', owner: { appDir: most.dir } };
  }
  return { dir: side, primary: false, claim: false, why: 'new copy, profile in use' };
}
function writeMarker({ fs, path: P = nodePath, defaultDir, copyId, dataDir, appDir, now = Date.now() }) {
  try {
    fs.mkdirSync(defaultDir, { recursive: true });
    require('./crashsafe-core').writeAtomicSync(fs, P.join(defaultDir, MARKER), JSON.stringify({ copyId, dataDir, appDir, at: now }, null, 2));
    return true;
  } catch { return false; }
}

// ---------- where other copies are ----------
// the Mac's launchers: ~/Applications/Hearth.app/Contents/MacOS/hearth (setup-mac.sh: exec "<electron>" "<dir>" --restart)
// and /Applications/Hearth.app/Contents/Resources/app/boot.js (install-mac.sh: const HEARTH_DIR = "<dir>";)
function launcherDir(text) {
  const m = /exec\s+"[^"]*"\s+"([^"]+)"/.exec(String(text || ''));
  return m ? m[1] : '';
}
function bootDir(text) {
  const m = /HEARTH_DIR\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(String(text || ''));
  return m ? m[1].replace(/\\(["\\])/g, '$1') : '';
}
const HEARTHY = /^(hearth|agent[- ]?hub)\b/i;
// o = { fs, platform, home, env, links: [{ target, args }] (Windows shortcuts read by the caller), loginItems:
//       [{ path, args }] } → folders to look at (not checked yet), each once
function candidates({ fs, platform = process.platform, home, env = {}, links = [], loginItems = [], apps = ['/Applications'] }) {
  const P = pathOf(platform);
  const out = []; const seen = new Set();
  const add = (d) => {
    if (!d || typeof d !== 'string') return;
    const n = P.normalize(d).replace(/[\\/]+\.?$/, '');
    const k = platform === 'win32' || platform === 'darwin' ? n.toLowerCase() : n;
    if (!seen.has(k)) { seen.add(k); out.push(n); }
  };
  const near = (dir, depth = 1) => { // Hearth-looking folders inside dir (and one level down: "Hearth-Windows\Hearth")
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents.slice(0, 400)) {
      if (!e.isDirectory() || !HEARTHY.test(e.name)) continue;
      add(P.join(dir, e.name));
      if (depth > 0) near(P.join(dir, e.name), depth - 1);
    }
  };
  if (!home) return out;
  if (platform === 'win32') {
    add(P.join(home, 'agent-hub')); add(P.join(home, 'Hearth'));
    const places = ['', 'Desktop', 'Downloads', 'Documents'].map((x) => (x ? P.join(home, x) : home));
    const od = env.OneDrive || env.OneDriveConsumer || env.OneDriveCommercial || P.join(home, 'OneDrive');
    places.push(P.join(od, 'Desktop'), P.join(od, 'Documents'), P.join(od, 'Bureau'));
    for (const d of places) near(d);
    const W = require('./winfresh-core');
    for (const l of links || []) add(W.folderOf(l));
    for (const it of loginItems || []) add(W.folderOf({ target: it.path, args: Array.isArray(it.args) ? it.args.join(' ') : it.args }));
  } else {
    if (platform === 'darwin') add(P.join(home, 'Library', 'Application Support', 'Hearth'));
    add(P.join(home, 'agent-hub')); add(P.join(home, 'Hearth'));
    for (const d of [home, P.join(home, 'Desktop'), P.join(home, 'Downloads'), P.join(home, 'Documents')]) near(d);
    if (platform === 'darwin') {
      for (const app of [P.join(home, 'Applications', 'Hearth.app'), ...apps.map((a) => P.join(a, 'Hearth.app'))]) {
        try { add(launcherDir(fs.readFileSync(P.join(app, 'Contents', 'MacOS', 'hearth'), 'utf8'))); } catch { /* not this kind */ }
        try { add(bootDir(fs.readFileSync(P.join(app, 'Contents', 'Resources', 'app', 'boot.js'), 'utf8'))); } catch { /* not this kind */ }
      }
    }
  }
  return out;
}
const same = (platform, a, b) => {
  const P = pathOf(platform);
  const n = (p) => { const x = P.normalize(String(p || '')).replace(/[\\/]+\.?$/, ''); return platform === 'win32' || platform === 'darwin' ? x.toLowerCase() : x; };
  return Boolean(a && b) && n(a) === n(b);
};
// → [{ dir, dataDir, chats, newest }] the OTHER copies with chats, the most chats first
function findOthers(o) {
  const { fs, platform = process.platform, appDir } = o;
  const P = pathOf(platform);
  let real = appDir; try { real = fs.realpathSync ? fs.realpathSync(appDir) : appDir; } catch { real = appDir; }
  const out = [];
  for (const dir of candidates(o)) {
    if (same(platform, dir, appDir) || same(platform, dir, real)) continue;
    let r = dir; try { r = fs.realpathSync ? fs.realpathSync(dir) : dir; } catch { r = dir; }
    if (same(platform, r, appDir) || same(platform, r, real) || out.some((x) => same(platform, x.real, r))) continue;
    if (!isCopy(fs, P, dir)) continue;
    const dataDir = P.join(dir, 'data');
    const c = countChats(fs, P, dataDir);
    if (c.chats > 0) out.push({ dir, real: r, dataDir, chats: c.chats, newest: c.newest });
  }
  return out.sort((a, b) => b.chats - a.chats || b.newest - a.newest).map(({ real: _r, ...x }) => x);
}

// ---------- the card's choice (data/twocopies.json) ----------
function readChoice({ fs, path: P = nodePath, dataDir }) {
  const r = readJson(fs, P.join(dataDir, CHOICE));
  return r.ok && r.value && typeof r.value === 'object' ? r.value : r.ok || r.missing ? null : { held: true };
}
function writeChoice({ fs, path: P = nodePath, dataDir, choice, other = '', now = Date.now() }) {
  try { require('./crashsafe-core').writeAtomicSync(fs, P.join(dataDir, CHOICE), JSON.stringify({ choice, other, at: now }, null, 2)); return true; } catch { return false; }
}
// show the card? this copy has no chats, the owner never chose for it, and another copy has chats
function shouldAsk({ chatsHere = 0, choice = null, others = [] }) {
  if (chatsHere > 0 || !others.length) return false;
  if (choice && (choice.held || choice.choice === 'fresh' || choice.choice === 'brought')) return false;
  return true;
}

// ---------- "Open that one" ----------
// → { cmd, args, cwd } or { folder } (can't start it from here: its folder is shown instead)
function openPlan({ fs, platform = process.platform, other, execPath = '', passArgs = [], home = '', apps = ['/Applications'] }) {
  const P = pathOf(platform);
  if (platform === 'win32') {
    const exe = P.join(other, 'electron', 'electron.exe');
    if (exists(fs, exe)) return { cmd: exe, args: [other, ...passArgs], cwd: other };
    // no Electron of its own there ("Start Hearth.cmd" starts that same electron.exe): this copy's runs that folder
    return execPath ? { cmd: execPath, args: [other, ...passArgs], cwd: other } : { folder: other };
  }
  if (platform === 'darwin') {
    // the app that starts that folder (install-mac.sh's Hearth.app / setup-mac.sh's launcher), else its own Electron
    for (const app of [...apps.map((a) => P.join(a, 'Hearth.app')), ...(home ? [P.join(home, 'Applications', 'Hearth.app')] : [])]) {
      let dir = '';
      try { dir = bootDir(fs.readFileSync(P.join(app, 'Contents', 'Resources', 'app', 'boot.js'), 'utf8')); } catch { /* no */ }
      if (!dir) { try { dir = launcherDir(fs.readFileSync(P.join(app, 'Contents', 'MacOS', 'hearth'), 'utf8')); } catch { /* no */ } }
      if (dir && same(platform, dir, other)) return { cmd: 'open', args: ['-n', app], cwd: other };
    }
    const own = P.join(other, 'electron-mac', 'Hearth.app', 'Contents', 'MacOS', 'Electron');
    if (exists(fs, own)) return { cmd: own, args: [other, ...passArgs], cwd: other };
    // an Electron that runs a folder given to it (not an installed Hearth.app, which always runs its own boot.js)
    if (execPath && !/Hearth\.app\/Contents\/MacOS\//.test(execPath)) return { cmd: execPath, args: [other, ...passArgs], cwd: other };
    return { folder: other };
  }
  return execPath ? { cmd: execPath, args: [other, ...passArgs], cwd: other } : { folder: other };
}

// ---------- the login item ("Start with Windows") ----------
// items: getLoginItemSettings().launchItems ([{ name, path, args, enabled }]); want: this copy's setting
// → 'set' (this copy's entry), 'clear' (this copy's entry goes), 'leave' (none of ours to change: another copy's stays)
function loginItemPlan({ want, items = [], appDir, name = 'Hearth' }) {
  if (want) return 'set';
  const W = require('./winfresh-core');
  const ours = (items || []).filter((it) => !name || !it.name || it.name === name);
  if (!ours.length) return 'clear'; // nothing there (or not readable): clearing changes nothing
  const other = ours.find((it) => { const d = W.folderOf({ target: it.path, args: Array.isArray(it.args) ? it.args.join(' ') : it.args }); return d && !W.sameDir(d, appDir); });
  return other ? 'leave' : 'clear';
}

// ---------- the shortcuts ----------
// a copy with no chats never makes / takes the Start menu + Desktop shortcuts while another copy has chats
// → null (go on with winfresh's plan) or { action: 'elsewhere', other, hold: true } (nothing written: asked again later)
function shortcutHold({ chatsHere = 0, others = [] }) {
  if (chatsHere > 0 || !others.length) return null;
  return { action: 'elsewhere', other: others[0].dir, chats: others[0].chats, hold: true };
}

module.exports = { MARKER, CHOICE, pathOf, countChats, isCopy, ensureId, sideDir, profileUsed, pickProfile, writeMarker, launcherDir, bootDir, candidates, findOthers, same, readChoice, writeChoice, shouldAsk, openPlan, loginItemPlan, shortcutHold };
