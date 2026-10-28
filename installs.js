// The Claude Code and Codex copies on this computer (main process): every place they get installed (PATH, Homebrew,
// npm global, nvm / Volta / Bun, the native installer's ~/.local/bin, the Claude desktop app's bundled claude-code,
// Codex.app / ChatGPT.app, the Windows apps' folders), each one's version (`--version`, read once per binary: path +
// size + mtime), the newest working one (engines.js prefers it unless Settings → Engines names a program), whether
// it's signed in, and the exact command that updates / installs / signs in that copy, run in a visible Terminal /
// PowerShell window. Hearth never sees a password: sign-in and updates happen in that window.
// Data: data/engine-installs.json { versions: { binKey: { text, semver } }, chosen: { engine: path }, learnedMin: { engine: '2.1.280' },
//   found: { engine: { key, at, paths, folders } } (round 79: where the copies were found, see find()) } — this computer only (sync-merge LOCAL_FILES)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR } = require('./store');
// (round 32) Windows: npm's .cmd copies, nvm / Volta / scoop / winget, started right (a test copy without the file: as before)
const WinPolish = (() => { try { return require('./winpolish'); } catch { return { spawn, candidates: () => [] }; } })();
// (round 33) the Mac: nvm / fnm / asdf / mise / Volta / pnpm / Bun / the login shell's PATH / the apps' bundled CLIs
const MacPolish = (() => { try { return require('./macpolish'); } catch { return { candidates: () => [] }; } })();

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const HOME = os.homedir();
const exe = (name) => (IS_WIN ? `${name}.exe` : name);
const FILE = path.join(DATA_DIR, 'engine-installs.json');
const LABEL = { claude: 'Claude Code', codex: 'Codex' };
// The oldest version Hearth knows works with the owner's models: Claude Code below 2.1.280 was refused by the model
// ("version 2.1.280 or newer is required", round 9). A newer minimum named by an error is learned (learnedMin).
const MIN = { claude: '2.1.280', codex: null };

let saved = null;
function data() {
  if (!saved) { try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { saved = {}; } }
  saved.versions ||= {}; saved.chosen ||= {}; saved.learnedMin ||= {};
  return saved;
}
function persist() {
  const d = data();
  const keys = Object.keys(d.versions);
  if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete d.versions[k];
  try { fs.writeFileSync(FILE, JSON.stringify(d, null, 1)); } catch { /* only a cache */ }
}

// ---------- versions ----------
const semverOf = (text) => { const m = /(\d+)\.(\d+)\.(\d+)(-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?/.exec(String(text || '')); return m ? `${+m[1]}.${+m[2]}.${+m[3]}${m[4] || ''}` : null; };
function cmp(a, b) {
  const [ca, ...ra] = String(a || '0.0.0').split('-'); const [cb, ...rb] = String(b || '0.0.0').split('-');
  const pa = ca.split('.').map(Number); const pb = cb.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  if (!ra.length || !rb.length) return Number(!ra.length) - Number(!rb.length);
  const aa = ra.join('-').split('.'), bb = rb.join('-').split('.');
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if (aa[i] === bb[i]) continue;
    if (aa[i] == null || bb[i] == null) return aa[i] == null ? -1 : 1;
    const an = /^\d+$/.test(aa[i]), bn = /^\d+$/.test(bb[i]);
    if (an && bn) return Number(aa[i]) - Number(bb[i]);
    if (an !== bn) return an ? -1 : 1;
    return aa[i] < bb[i] ? -1 : 1;
  }
  return 0;
}
const minFor = (engine) => { const l = data().learnedMin[engine]; const m = MIN[engine]; return !l ? m : !m ? l : cmp(l, m) > 0 ? l : m; };
// true / false, or null when either is unknown (an unreadable version is never called too old)
const meetsMin = (engine, semver) => { const m = minFor(engine); return !m || !semver ? null : cmp(semver, m) >= 0; };
function binKey(bin) { try { const st = fs.statSync(bin); return `${bin}|${st.size}|${Math.round(st.mtimeMs)}`; } catch { return bin || ''; } }

// Runs one short command of a copy (version, sign-in status), never throws, never hangs.
function quick(bin, args, ms = 8000, cwd = os.tmpdir()) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try { child = WinPolish.spawn(bin, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (err) { resolve({ code: -1, out: err.message }); return; }
    const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } resolve({ code: -1, out: `${out}\n(timed out)`.trim() }); }, ms);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, out: err.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out: out.trim().slice(0, 2000) }); });
  });
}
// (round 78, winperf78) one question per binary at a time: the engine check and Astra's doctor asked together at the
// start and each started its own `--version`
const asking = new Map();
function version(bin, o = {}) {
  const key = binKey(bin);
  if (asking.has(key)) return asking.get(key);
  const p = versionNow(bin, o, key).finally(() => asking.delete(key));
  asking.set(key, p);
  return p;
}
async function versionNow(bin, { cwd, fresh = false } = {}, key = binKey(bin)) {
  const d = data();
  if (!fresh && d.versions[key]) return { ...d.versions[key], semver: semverOf(d.versions[key].text) };
  const r = await quick(bin, ['--version'], 8000, cwd);
  const text = r.code === 0 ? (r.out.split('\n').find((l) => l.trim()) || '').trim().slice(0, 120) : null;
  const v = { text, semver: text ? semverOf(text) : null, at: Date.now() };
  if (text) { d.versions[key] = v; persist(); } // a copy that didn't answer is asked again next time
  return v;
}
// Signed in? true / false, or null when this copy can't tell (an older Claude Code has no `auth status`).
// An older Claude Code has no `auth` command and would take "auth status" as a prompt: its --help is read first (once
// per binary) and `auth status` only asked when it lists `auth`.
async function hasAuth(bin, cwd) {
  const d = data();
  const v = d.versions[binKey(bin)];
  if (v && typeof v.auth === 'boolean') return v.auth;
  const r = await quick(bin, ['--help'], 8000, cwd);
  const auth = r.code === 0 && /^\s+auth\b/m.test(r.out);
  if (v) { v.auth = auth; persist(); }
  return auth;
}
async function signedIn(engine, bin, cwd) {
  if (engine === 'claude' && !(await hasAuth(bin, cwd))) return { ok: null, text: '' };
  const r = await quick(bin, engine === 'codex' ? ['login', 'status'] : ['auth', 'status'], 8000, cwd);
  if (/not (logged|signed) in|no credentials|please (run|log ?in|sign ?in)|login required|logged out/i.test(r.out)) return { ok: false, text: lastLine(r.out) };
  if (r.code === 0) return { ok: true, text: lastLine(r.out) };
  return { ok: null, text: lastLine(r.out) };
}
const lastLine = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean).pop()?.slice(0, 160) || '';

// ---------- where copies live ----------
const pathDirs = () => [...new Set((process.env.PATH || '').split(path.delimiter).filter(Boolean))];
// (round 79, winstart79) every file question of the scan goes through a small facade F (isFile / isDir / list / entries /
// read / mtime / real): the plain one below asks synchronously (as before); scanAsync() answers the same questions with
// fs.promises, off the main thread
const syncFs = {
  isFile: (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } },
  isDir: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
  list: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
  entries: (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory(), file: e.isFile() })); } catch { return []; } },
  read: (p, max = 16384) => { try { const fd = fs.openSync(p, 'r'); try { const b = Buffer.alloc(max); const n = fs.readSync(fd, b, 0, max, 0); return b.slice(0, n).toString('utf8'); } finally { fs.closeSync(fd); } } catch { return ''; } },
  mtime: (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } },
  real: (p) => { try { return fs.realpathSync(p); } catch { return p; } },
};
// every file named `name` under root (versioned app folders), newest first, a few at most
function allIn(root, name, depth = 3, limit = 3, F = syncFs) {
  const found = [];
  const walk = (dir, level) => {
    for (const entry of F.entries(dir)) {
      const full = path.join(dir, entry.name);
      // an app bundle's own program (Contents/MacOS/Codex) is the desktop app, not the command-line tool
      if (entry.dir && level < depth && entry.name !== 'MacOS' && entry.name !== 'node_modules') walk(full, level + 1);
      else if (entry.file && entry.name === name) found.push({ full, mtime: F.mtime(full) });
    }
  };
  walk(root, 0);
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((f) => f.full);
}
function scanWith(engine, F) {
  const name = exe(engine);
  const list = [];
  const add = (file) => { if (file) list.push(file); };
  // (round 32, winpolish) Windows: every .exe / .cmd copy (npm, nvm-windows, Volta, scoop, winget, pnpm, the apps)
  if (IS_WIN) WinPolish.candidates(engine, { fs: F }).forEach(add);
  // (round 33, macpolish) the Mac: real programs before version-manager shims, one per real file (deduped below)
  if (IS_MAC) MacPolish.candidates(engine, { shellPath: MacPolish.shellDirs, fs: F }).forEach(add);
  for (const dir of pathDirs()) add(path.join(dir, name));
  const common = [path.join(HOME, '.local', 'bin', name), path.join(HOME, '.npm-global', 'bin', name), path.join(HOME, '.volta', 'bin', name), path.join(HOME, '.bun', 'bin', name)];
  const nvm = path.join(HOME, '.nvm', 'versions', 'node');
  for (const v of F.list(nvm)) add(path.join(nvm, v, 'bin', name));
  if (IS_MAC) for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) add(path.join(dir, name));
  if (!IS_WIN && !IS_MAC) add(path.join('/usr/local/bin', name));
  common.forEach(add);
  if (engine === 'claude') {
    add(path.join(HOME, '.claude', 'local', name));
    if (IS_MAC) allIn(path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude-code'), 'claude', 3, 3, F).forEach(add);
    if (IS_WIN) allIn(path.join(process.env.APPDATA || '', 'Claude', 'claude-code'), 'claude.exe', 3, 3, F).forEach(add);
  } else {
    if (IS_MAC) for (const root of ['/Applications/Codex.app/Contents', '/Applications/ChatGPT.app/Contents', path.join(HOME, 'Applications', 'Codex.app', 'Contents'), path.join(HOME, 'Library', 'Application Support', 'Codex')]) allIn(root, 'codex', 4, 3, F).forEach(add);
    if (IS_WIN) {
      allIn(path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin'), 'codex.exe', 3, 3, F).forEach(add);
      allIn(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'vendor'), 'codex.exe', 3, 1, F).forEach(add);
    }
  }
  // the same program reached two ways (a symlink in PATH and Homebrew's bin) is one copy
  const seen = new Set();
  return list.map(f => IS_WIN && engine === 'codex' ? WinPolish.codexRuntime(f, { fs: F }) : f).filter((f) => {
    if (!F.isFile(f)) return false;
    const real = F.real(f);
    if (seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}
function candidates(engine) {
  // a test copy of Hearth (dev/smoke.js) never picks up the machine's real engines: only Settings → Engines counts
  if (process.env.HEARTH_TEST_SAVE_DIR) return [];
  return scanWith(engine, syncFs);
}

// (round 79, winstart79) The scan without blocking: scanWith() runs against a memo of answers; what it asked that isn't
// known yet gets a stand-in answer (missing / empty), then every such question is asked at once with fs.promises
// (libuv's threads: on Windows each one a Defender-scanned open, none of them on the main thread any more) and the scan
// runs again over the fuller memo, until it asks nothing new. Each run is a few hundred map lookups. Answers to the same
// questions as the synchronous scan, so the same copies in the same order. afs: fs.promises (tests count its calls).
async function scanAsync(run, { afs = fs.promises, rounds = 16 } = {}) {
  const memo = new Map();
  let result = null;
  for (let round = 0; round < rounds; round++) {
    const misses = new Map();
    const ask = (kind, p, arg, stand) => { const k = `${kind}\0${p}\0${arg ?? ''}`; if (memo.has(k)) return memo.get(k); if (p) misses.set(k, { kind, p, arg }); return stand; };
    const stat = (p) => ask('stat', p, null, null);
    const F = {
      isFile: (p) => Boolean(stat(p)?.file), isDir: (p) => Boolean(stat(p)?.dir), mtime: (p) => stat(p)?.mtime || 0,
      list: (p) => ask('list', p, null, []), entries: (p) => ask('entries', p, null, []),
      read: (p, max = 16384) => ask('read', p, max, ''), real: (p) => ask('real', p, null, p) ?? p,
    };
    result = run(F);
    if (!misses.size) return { result, memo };
    await Promise.all([...misses].map(async ([k, { kind, p, arg }]) => {
      let v;
      try {
        if (kind === 'stat') { const s = await afs.stat(p); v = { file: s.isFile(), dir: s.isDirectory(), mtime: s.mtimeMs, size: s.size }; }
        else if (kind === 'list') v = await afs.readdir(p);
        else if (kind === 'entries') v = (await afs.readdir(p, { withFileTypes: true })).map((e) => ({ name: e.name, dir: e.isDirectory(), file: e.isFile() }));
        else if (kind === 'real') v = await afs.realpath(p);
        else if (kind === 'read') { const h = await afs.open(p, 'r'); try { const b = Buffer.alloc(arg); const { bytesRead } = await h.read(b, 0, arg, 0); v = b.slice(0, bytesRead).toString('utf8'); } finally { await h.close(); } }
      } catch { v = kind === 'stat' ? null : kind === 'real' ? p : kind === 'read' ? '' : []; }
      memo.set(k, v);
    }));
  }
  return { result, memo };
}

// (round 79, winstart79) Where each engine's copies were found, kept (data/engine-installs.json `found`, this computer
// only: keyed by the computer, its PATH and the install folders' variables). The engine check (start, every 30 min,
// focus) used to look in every place again: on Windows ≈ 250 file checks per check (PATH × .exe / .cmd / .bat, npm,
// nvm, Volta, scoop, winget, the apps), each a synchronous, Defender-scanned open on the main thread. Now:
//   kept      the copies found last time are checked first (do they still exist?) together with the date of every
//             folder the scan looked into (a new install — npm, the installer, a desktop app's new version folder —
//             adds a file to one of them, which changes its date): all at once, asynchronously (≈ 40 on Windows)
//   look again (the whole scan, asynchronously) only when a kept copy is gone, a folder changed, PATH changed, a week
//             passed, or on purpose: /doctor, after an install / update / sign-in window, after the computer wakes
// Sign-in is never kept here: every engine check still asks `auth status` / `login status` (a sign-out shows at once).
const FOUND_MS = 7 * 864e5;
const scanState = { hits: 0, scans: 0, lastMs: 0, lastCalls: 0, last: '' };
function scanKey() {
  const env = ['PATH', 'APPDATA', 'LOCALAPPDATA', 'NVM_HOME', 'NVM_SYMLINK', 'VOLTA_HOME', 'PNPM_HOME', 'SCOOP', 'SCOOP_GLOBAL', 'npm_config_prefix', 'NPM_CONFIG_PREFIX', 'NVM_DIR', 'NVM_BIN'].map((k) => process.env[k] || '');
  return require('crypto').createHash('sha1').update(JSON.stringify([process.platform, os.hostname(), HOME, IS_MAC ? MacPolish.shellDirs || '' : '', env])).digest('hex').slice(0, 16);
}
// the folders a scan looked into (and the few files it read: ~/.npmrc), with their dates (−1: not there): a file added
// to / removed from a folder changes the folder's date
function foldersOf(memo) {
  const dirs = new Map();
  for (const k of memo.keys()) {
    const [kind, p] = k.split('\0');
    if (kind === 'list' || kind === 'entries' || kind === 'read') dirs.set(p, null);
    else if (kind === 'stat') dirs.set(path.dirname(p), null);
  }
  for (const [k, v] of memo) { const [kind, p] = k.split('\0'); if (kind === 'stat' && dirs.has(p)) dirs.set(p, v ? Math.round(v.mtime) : -1); }
  return dirs;
}
async function dateOf(p, afs) { try { return Math.round((await afs.stat(p)).mtimeMs); } catch { return -1; } }
// → the copies of `engine` on this computer (best first), as candidates() finds them; fresh: look everywhere again
async function find(engine, { fresh = false, afs = fs.promises } = {}) {
  if (process.env.HEARTH_TEST_SAVE_DIR) return [];
  const d = data(); d.found ||= {};
  const key = scanKey(); const kept = d.found[engine];
  if (!fresh && kept && kept.key === key && Date.now() - kept.at < FOUND_MS && Array.isArray(kept.paths)) {
    const folders = Object.entries(kept.folders || {});
    const [copies, dates] = await Promise.all([Promise.all(kept.paths.map((p) => afs.stat(p).then((s) => s.isFile(), () => false))), Promise.all(folders.map(([p]) => dateOf(p, afs)))]);
    if (copies.every(Boolean) && folders.every(([, t], i) => dates[i] === t)) { scanState.hits += 1; scanState.last = 'kept'; scanState.lastCalls = copies.length + folders.length; return kept.paths.slice(); }
  }
  const t0 = Date.now();
  const { result, memo } = await scanAsync((F) => scanWith(engine, F), { afs });
  const dirs = foldersOf(memo);
  // folders the scan only reached through a file's stat (PATH folders) have no date yet: one more round for them
  await Promise.all([...dirs].filter(([, t]) => t == null).map(async ([p]) => { dirs.set(p, await dateOf(p, afs)); }));
  d.found[engine] = { key, at: Date.now(), paths: result, folders: Object.fromEntries(dirs) };
  persist();
  scanState.scans += 1; scanState.last = fresh ? 'look again' : kept ? 'changed' : 'first'; scanState.lastMs = Date.now() - t0; scanState.lastCalls = memo.size + dirs.size;
  return result;
}

// ---------- how a copy was installed, and how to update it ----------
function kindOf(engine, bin) {
  let real = bin;
  try { real = fs.realpathSync(bin); } catch { /* as given */ }
  const p = `${bin}\n${real}`.replace(/\\/g, '/');
  if (/\/(Cellar|Caskroom)\//.test(p) || (IS_MAC && /^\/opt\/homebrew\//.test(real) && !/node_modules/.test(real))) return 'homebrew';
  if (/\/scoop\/(shims|apps)\//i.test(p)) return 'scoop';
  if (/\/WinGet\/(Links|Packages)\//i.test(p)) return 'winget';
  if (/\/pnpm\//i.test(p)) return 'pnpm';
  if (/node_modules\/@(anthropic-ai\/claude-code|openai\/codex)/.test(p) || /\/\.asdf\/installs\/|\/mise\/installs\/|\/fnm\/node-versions\/|\/\.fnm\/|\/\.nvm\/|\/\.npm-global\/|\/\.volta\/|\/AppData\/Roaming\/npm\/|\/AppData\/Roaming\/nvm\/|\/AppData\/Local\/Volta\/|\/Program Files\/nodejs\//i.test(p)) return 'npm';
  if (/\/\.bun\//.test(p)) return 'bun';
  if (engine === 'claude' && /Application Support\/Claude\/claude-code|AppData\/Roaming\/Claude\/claude-code/i.test(p)) return 'desktop';
  if (engine === 'codex' && /\.app\/Contents|Application Support\/Codex|AppData\/Local\/OpenAI\/Codex/i.test(p)) return 'desktop';
  if (engine === 'claude' && /\/\.local\/(bin|share\/claude)\/|\/\.claude\/local\//.test(p)) return 'native';
  return 'other';
}
const KIND_LABEL = { homebrew: 'Homebrew', npm: 'npm', pnpm: 'pnpm', scoop: 'scoop', winget: 'winget', bun: 'Bun', desktop: 'desktop app', native: 'installer', other: 'on PATH', settings: 'Settings → Engines' };
const q = (s) => (IS_WIN ? `& '${String(s).replace(/'/g, "''")}'` : `'${String(s).replace(/'/g, `'\\''`)}'`);
const INSTALL = {
  claude: IS_WIN ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash',
  codex: 'npm i -g @openai/codex@latest',
};
// → { command (a shell line for the Terminal / PowerShell window), text (what it does, for the notice), how }
function updatePlan(engine, bin) {
  if (!bin) return { how: 'install', command: INSTALL[engine], text: `Install ${LABEL[engine]} (${engine === 'claude' ? 'the official installer' : 'npm'})` };
  const kind = kindOf(engine, bin);
  if (kind === 'homebrew') return { how: 'update', kind, command: `brew upgrade ${engine === 'claude' ? 'claude-code' : 'codex'}`, text: `Update with Homebrew (brew upgrade ${engine === 'claude' ? 'claude-code' : 'codex'})` };
  // (round 33, macpolish) an nvm / fnm / asdf / mise copy updates with the npm of its own Node (the one next to it),
  // not whichever npm the Terminal's PATH finds first
  const ownNpm = !IS_WIN && kind === 'npm' && bin && fs.existsSync(path.join(path.dirname(bin), 'npm')) && fs.existsSync(path.join(path.dirname(bin), 'node')) ? path.dirname(bin) : null;
  if (ownNpm) return { how: 'update', kind, command: `PATH=${q(ownNpm)}:"$PATH" ${q(path.join(ownNpm, 'npm'))} i -g ${engine === 'claude' ? '@anthropic-ai/claude-code' : '@openai/codex'}@latest`, text: 'Update with npm (its own Node)' };
  if (kind === 'npm') return { how: 'update', kind, command: `npm i -g ${engine === 'claude' ? '@anthropic-ai/claude-code' : '@openai/codex'}@latest`, text: 'Update with npm' };
  if (kind === 'pnpm') return { how: 'update', kind, command: `pnpm add -g ${engine === 'claude' ? '@anthropic-ai/claude-code' : '@openai/codex'}@latest`, text: 'Update with pnpm' };
  if (kind === 'bun') return { how: 'update', kind, command: `bun add -g ${engine === 'claude' ? '@anthropic-ai/claude-code' : '@openai/codex'}@latest`, text: 'Update with Bun' };
  // the desktop apps update their own copy; a standalone copy next to it is quicker and Hearth prefers the newest
  if (kind === 'desktop') return { how: 'install', kind, command: INSTALL[engine], text: `Update the ${engine === 'claude' ? 'Claude' : 'Codex'} app, or install the standalone ${LABEL[engine]} (Hearth picks the newest copy)` };
  if (engine === 'claude') return { how: 'update', kind, command: `${q(bin)} update`, text: 'claude update' };
  return { how: 'update', kind, command: INSTALL.codex, text: 'Update with npm' };
}
function loginPlan(engine, bin) {
  // an older Claude Code without `auth login` signs in with its interactive /login
  if (engine === 'claude') return IS_WIN ? `${q(bin)} auth login; if ($LASTEXITCODE -ne 0) { ${q(bin)} /login }` : `${q(bin)} auth login || ${q(bin)} /login`;
  return `${q(bin)} login`;
}

// ---------- a visible Terminal / PowerShell window ----------
// Mac: a .command file opened in Terminal. Windows: a PowerShell window (-EncodedCommand: no quoting surprises).
// Linux: the first terminal emulator found. When the window's work ends it writes `marker`, which watch() waits for.
// Tests (HEARTH_TEST_SAVE_DIR, set by dev/smoke.js, or HEARTH_TEST_TERMINAL) run the script without a window, keep its
// output, and only echo what isn't the engine itself (brew / npm / the installers never run in a test).
function runInTerminal({ title, lines, marker, cwd, bin }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-term-'));
  const headless = Boolean(process.env.HEARTH_TEST_SAVE_DIR || process.env.HEARTH_TEST_TERMINAL);
  if (headless) lines = lines.map((l) => (bin && l.startsWith(q(bin)) ? l : `echo '(test) would run: ${l.replace(/'/g, '')}'`));
  if (IS_WIN && !headless) {
    const ps = [`$Host.UI.RawUI.WindowTitle = '${title.replace(/'/g, "''")}'`, `Write-Host '${title.replace(/'/g, "''")} (Hearth never sees your password)'`, 'Write-Host ""',
      ...lines, 'Write-Host ""', ...(marker ? [`Set-Content -LiteralPath '${marker.replace(/'/g, "''")}' -Value done`] : []), "Write-Host 'Done: go back to Hearth. You can close this window.'"].join('\n');
    const b64 = Buffer.from(ps, 'utf16le').toString('base64');
    try { spawn('powershell.exe', ['-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64], { detached: true, stdio: 'ignore', windowsHide: false }).on('error', () => {}).unref(); return { ok: true, window: 'PowerShell' }; } catch (err) { return { ok: false, error: err.message }; }
  }
  const sh = ['#!/bin/sh', 'clear 2>/dev/null', `echo "${title.replace(/"/g, "'")} (Hearth never sees your password)."`, 'echo',
    ...lines, 'echo', ...(marker ? [`echo done > '${marker.replace(/'/g, `'\\''`)}'`] : []), 'echo "Done: go back to Hearth. You can close this window."', ''].join('\n');
  const file = path.join(tmp, IS_MAC ? 'hearth.command' : 'hearth.sh');
  fs.writeFileSync(file, sh, { mode: 0o755 });
  if (headless) {
    const log = fs.openSync(path.join(tmp, 'output.txt'), 'w');
    spawn('sh', [file], { cwd: cwd || os.tmpdir(), detached: true, stdio: ['ignore', log, log] }).on('error', () => {}).unref();
    return { ok: true, window: 'test', file, output: path.join(tmp, 'output.txt') };
  }
  if (IS_MAC) { spawn('open', ['-a', 'Terminal', file], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); return { ok: true, window: 'Terminal', file }; }
  const term = [['x-terminal-emulator', ['-e']], ['gnome-terminal', ['--']], ['konsole', ['-e']], ['xfce4-terminal', ['-x']], ['xterm', ['-e']]]
    .find(([t]) => pathDirs().some((d) => fs.existsSync(path.join(d, t))));
  if (!term) return { ok: false, error: 'no terminal window found', file };
  spawn(term[0], [...term[1], 'sh', '-c', `sh '${file}'; echo; echo "Press Enter to close"; read x`], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return { ok: true, window: 'terminal', file };
}

// (round 28, firstrun) the documented ffmpeg install (Homebrew on a Mac, winget on Windows): main.js runs it after a
// click; the "Check this computer" list shows the same lines before that click
function ffmpegLines() {
  if (IS_WIN) return ['winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements'];
  if (IS_MAC) {
    return ['command -v brew >/dev/null 2>&1 || [ -x /opt/homebrew/bin/brew ] || [ -x /usr/local/bin/brew ] || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      'eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"', 'brew install ffmpeg'];
  }
  return ['sudo apt-get install -y ffmpeg || sudo dnf install -y ffmpeg || sudo pacman -S --noconfirm ffmpeg'];
}

module.exports = { ffmpegLines, MIN, LABEL, KIND_LABEL, data, persist, semverOf, cmp, minFor, meetsMin, binKey, quick, version, signedIn, candidates, find, scanAsync, scanWith, scanState, kindOf, updatePlan, loginPlan, runInTerminal, IS_WIN, IS_MAC };
