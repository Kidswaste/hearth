// The Claude Code and Codex copies on this computer (main process): every place they get installed (PATH, Homebrew,
// npm global, nvm / Volta / Bun, the native installer's ~/.local/bin, the Claude desktop app's bundled claude-code,
// Codex.app / ChatGPT.app, the Windows apps' folders), each one's version (`--version`, read once per binary: path +
// size + mtime), the newest working one (engines.js prefers it unless Settings → Engines names a program), whether
// it's signed in, and the exact command that updates / installs / signs in that copy, run in a visible Terminal /
// PowerShell window. Hearth never sees a password: sign-in and updates happen in that window.
// Data: data/engine-installs.json { versions: { binKey: { text, semver } }, chosen: { engine: path }, learnedMin: { engine: '2.1.280' } }
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR } = require('./store');

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
const semverOf = (text) => { const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(text || '')); return m ? `${+m[1]}.${+m[2]}.${+m[3]}` : null; };
function cmp(a, b) {
  const pa = String(a || '0.0.0').split('.').map(Number); const pb = String(b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
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
    try { child = spawn(bin, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (err) { resolve({ code: -1, out: err.message }); return; }
    const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } resolve({ code: -1, out: `${out}\n(timed out)`.trim() }); }, ms);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, out: err.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out: out.trim().slice(0, 2000) }); });
  });
}
async function version(bin, { cwd, fresh = false } = {}) {
  const key = binKey(bin);
  const d = data();
  if (!fresh && d.versions[key]) return d.versions[key];
  const r = await quick(bin, ['--version'], 8000, cwd);
  const text = r.code === 0 ? (r.out.split('\n').find((l) => l.trim()) || '').trim().slice(0, 120) : null;
  const v = { text, semver: text ? semverOf(text) : null, at: Date.now() };
  if (text) { d.versions[key] = v; persist(); } // a copy that didn't answer is asked again next time
  return v;
}
// Signed in? true / false, or null when this copy can't tell (an older Claude Code has no `auth status`).
async function signedIn(engine, bin, cwd) {
  const r = await quick(bin, engine === 'codex' ? ['login', 'status'] : ['auth', 'status'], 8000, cwd);
  if (/not (logged|signed) in|no credentials|please (run|log ?in|sign ?in)|login required|logged out/i.test(r.out)) return { ok: false, text: lastLine(r.out) };
  if (r.code === 0) return { ok: true, text: lastLine(r.out) };
  return { ok: null, text: lastLine(r.out) };
}
const lastLine = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean).pop()?.slice(0, 160) || '';

// ---------- where copies live ----------
const pathDirs = () => [...new Set((process.env.PATH || '').split(path.delimiter).filter(Boolean))];
function children(dir) { try { return fs.readdirSync(dir).map((n) => path.join(dir, n)); } catch { return []; } }
// every file named `name` under root (versioned app folders), newest first, a few at most
function allIn(root, name, depth = 3, limit = 3) {
  const found = [];
  const walk = (dir, level) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      // an app bundle's own program (Contents/MacOS/Codex) is the desktop app, not the command-line tool
      if (entry.isDirectory() && level < depth && entry.name !== 'MacOS' && entry.name !== 'node_modules') walk(full, level + 1);
      else if (entry.isFile() && entry.name === name) { try { found.push({ full, mtime: fs.statSync(full).mtimeMs }); } catch { /* raced */ } }
    }
  };
  walk(root, 0);
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((f) => f.full);
}
function candidates(engine) {
  const name = exe(engine);
  const list = [];
  const add = (file) => { if (file) list.push(file); };
  for (const dir of pathDirs()) add(path.join(dir, name));
  const common = [path.join(HOME, '.local', 'bin', name), path.join(HOME, '.npm-global', 'bin', name), path.join(HOME, '.volta', 'bin', name), path.join(HOME, '.bun', 'bin', name)];
  for (const v of children(path.join(HOME, '.nvm', 'versions', 'node'))) add(path.join(v, 'bin', name));
  if (IS_MAC) for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) add(path.join(dir, name));
  if (!IS_WIN && !IS_MAC) add(path.join('/usr/local/bin', name));
  common.forEach(add);
  if (engine === 'claude') {
    add(path.join(HOME, '.claude', 'local', name));
    if (IS_MAC) allIn(path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude-code'), 'claude').forEach(add);
    if (IS_WIN) allIn(path.join(process.env.APPDATA || '', 'Claude', 'claude-code'), 'claude.exe').forEach(add);
  } else {
    if (IS_MAC) for (const root of ['/Applications/Codex.app/Contents', '/Applications/ChatGPT.app/Contents', path.join(HOME, 'Applications', 'Codex.app', 'Contents'), path.join(HOME, 'Library', 'Application Support', 'Codex')]) allIn(root, 'codex', 4).forEach(add);
    if (IS_WIN) {
      allIn(path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin'), 'codex.exe').forEach(add);
      allIn(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'vendor'), 'codex.exe', 3, 1).forEach(add);
    }
  }
  // the same program reached two ways (a symlink in PATH and Homebrew's bin) is one copy
  const seen = new Set();
  return list.filter((f) => {
    let real;
    try { if (!fs.statSync(f).isFile()) return false; real = fs.realpathSync(f); } catch { return false; }
    if (seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}

// ---------- how a copy was installed, and how to update it ----------
function kindOf(engine, bin) {
  let real = bin;
  try { real = fs.realpathSync(bin); } catch { /* as given */ }
  const p = `${bin}\n${real}`.replace(/\\/g, '/');
  if (/\/(Cellar|Caskroom)\//.test(p) || (IS_MAC && /^\/opt\/homebrew\//.test(real) && !/node_modules/.test(real))) return 'homebrew';
  if (/node_modules\/@(anthropic-ai\/claude-code|openai\/codex)/.test(p) || /\/\.nvm\/|\/\.npm-global\/|\/\.volta\/|\/AppData\/Roaming\/npm\//i.test(p)) return 'npm';
  if (/\/\.bun\//.test(p)) return 'bun';
  if (engine === 'claude' && /Application Support\/Claude\/claude-code|AppData\/Roaming\/Claude\/claude-code/i.test(p)) return 'desktop';
  if (engine === 'codex' && /\.app\/Contents|Application Support\/Codex|AppData\/Local\/OpenAI\/Codex/i.test(p)) return 'desktop';
  if (engine === 'claude' && /\/\.local\/(bin|share\/claude)\/|\/\.claude\/local\//.test(p)) return 'native';
  return 'other';
}
const KIND_LABEL = { homebrew: 'Homebrew', npm: 'npm', bun: 'Bun', desktop: 'desktop app', native: 'installer', other: 'on PATH', settings: 'Settings → Engines' };
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
  if (kind === 'npm') return { how: 'update', kind, command: `npm i -g ${engine === 'claude' ? '@anthropic-ai/claude-code' : '@openai/codex'}@latest`, text: 'Update with npm' };
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

module.exports = { MIN, LABEL, KIND_LABEL, data, persist, semverOf, cmp, minFor, meetsMin, binKey, quick, version, signedIn, candidates, kindOf, updatePlan, loginPlan, runInTerminal, IS_WIN, IS_MAC };
