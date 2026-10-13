// (round 32, winpolish) Windows, solid: finding Claude Code / Codex wherever Windows people install them, starting the
// npm ones (claude.cmd / codex.cmd) correctly, sending things to the Recycle Bin only where it really is recoverable,
// and plain words for what Windows says when something fails. Main process only (plain Node, no Electron): engines.js,
// installs.js and fsapi.js require it; dev/winpolish-test.js runs every part with path.win32 and an injected
// platform / env / file list, so it is tested here without a Windows PC.
//   candidates(engine, { env, home, fs })    → every place a copy may be (PATH × .exe/.cmd/.bat, npm's folder and
//                                              prefix, nvm-windows, Volta, scoop, winget, pnpm, Bun, the installer,
//                                              the Claude / Codex desktop apps), best first, existing files only
//   plan(bin, args, { platform, env, fs })   → how to start it: { command, args, options, via: direct | node | cmd }
//                                              npm's .cmd shim is read and its Node script run with node.exe (no
//                                              cmd.exe at all); an unreadable shim goes through cmd.exe /d /s /c with
//                                              every argument quoted (Node ≥ 18.20.2 refuses .cmd / .bat without a
//                                              shell: CVE-2024-27980, "spawn EINVAL")
//   spawn(bin, args, opts)                   → child_process.spawn through plan() (elsewhere: spawn as it was)
//   cleanPath(p, { env })                    → a path pasted in Settings → Engines: quotes, %APPDATA%, a missing .cmd
//   trashCheck(p, { platform, env, fs, driveType }) → { ok, path } or { ok: false, error } before shell.trashItem:
//                                              network shares and USB drives have no Recycle Bin (Windows would
//                                              delete for good), so Hearth leaves those files alone and says so
//   plainError(text, { platform })           → one calm sentence + what to do, for Windows' own error texts
const WinPolish = (() => {
  const cp = require('child_process');
  const nodeFs = require('fs');
  const os = require('os');
  const W = require('path').win32;

  // Windows' environment ignores case (Path, PATH, ProgramFiles(x86)); an injected plain object doesn't
  function envGet(env, name) {
    if (!env) return '';
    if (env[name] != null) return String(env[name]);
    const k = Object.keys(env).find((x) => x.toLowerCase() === name.toLowerCase());
    return k ? String(env[k]) : '';
  }
  const unquote = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
  const expand = (s, env) => String(s || '').replace(/%([^%;\\/]+)%/g, (m, v) => envGet(env, v) || m);
  const PKG = { claude: '@anthropic-ai/claude-code', codex: '@openai/codex' };

  // small fs facade (tests pass a fake one)
  const realFs = {
    isFile: (p) => { try { return nodeFs.statSync(p).isFile(); } catch { return false; } },
    isDir: (p) => { try { return nodeFs.statSync(p).isDirectory(); } catch { return false; } },
    list: (p) => { try { return nodeFs.readdirSync(p); } catch { return []; } },
    read: (p, max = 16384) => { try { const fd = nodeFs.openSync(p, 'r'); try { const b = Buffer.alloc(max); const n = nodeFs.readSync(fd, b, 0, max, 0); return b.slice(0, n).toString('utf8'); } finally { nodeFs.closeSync(fd); } } catch { return ''; } },
    mtime: (p) => { try { return nodeFs.statSync(p).mtimeMs; } catch { return 0; } },
  };

  // ---------- where copies live on Windows ----------
  // The folders an npm / Node / package-manager install puts its commands in, best first. Only folders that are named
  // somewhere (env) or exist (fs) come back; the caller tries `name.exe`, `name.cmd`, `name.bat` in each.
  function binDirs({ env = process.env, home = os.homedir(), fs = realFs } = {}) {
    const dirs = [];
    const add = (d) => { if (d) dirs.push(W.normalize(unquote(expand(d, env)))); };
    const appData = envGet(env, 'APPDATA') || (home ? W.join(home, 'AppData', 'Roaming') : '');
    const local = envGet(env, 'LOCALAPPDATA') || (home ? W.join(home, 'AppData', 'Local') : '');
    const pf = envGet(env, 'ProgramW6432') || envGet(env, 'ProgramFiles') || 'C:\\Program Files';
    const pdata = envGet(env, 'ProgramData') || 'C:\\ProgramData';
    for (const d of envGet(env, 'PATH').split(';')) if (d.trim()) add(d);
    // npm: the prefix named by the environment or the user's .npmrc, else its default %APPDATA%\npm (bins sit in the
    // prefix itself on Windows, not in prefix\bin)
    add(envGet(env, 'npm_config_prefix') || envGet(env, 'NPM_CONFIG_PREFIX'));
    if (home) {
      const m = /^\s*prefix\s*=\s*(.+?)\s*$/m.exec(fs.read(W.join(home, '.npmrc')) || '');
      if (m) add(m[1]);
    }
    if (appData) add(W.join(appData, 'npm'));
    // nvm-windows: the active Node (NVM_SYMLINK, default C:\Program Files\nodejs) holds its global commands; every
    // installed version under NVM_HOME too (newest first)
    add(envGet(env, 'NVM_SYMLINK'));
    add(W.join(pf, 'nodejs'));
    const nvmHome = envGet(env, 'NVM_HOME') || (appData ? W.join(appData, 'nvm') : '');
    if (nvmHome) for (const v of fs.list(nvmHome).filter((n) => /^v?\d+\.\d+/.test(n)).sort(byVersionDesc)) add(W.join(nvmHome, v));
    // Volta, pnpm, Bun, scoop (user and global shims), winget (user and machine links), the official installer
    add(envGet(env, 'VOLTA_HOME') ? W.join(envGet(env, 'VOLTA_HOME'), 'bin') : local && W.join(local, 'Volta', 'bin'));
    add(envGet(env, 'PNPM_HOME') || (local && W.join(local, 'pnpm')));
    if (home) add(W.join(home, '.bun', 'bin'));
    add(envGet(env, 'SCOOP') ? W.join(envGet(env, 'SCOOP'), 'shims') : home && W.join(home, 'scoop', 'shims'));
    add(envGet(env, 'SCOOP_GLOBAL') ? W.join(envGet(env, 'SCOOP_GLOBAL'), 'shims') : W.join(pdata, 'scoop', 'shims'));
    if (local) add(W.join(local, 'Microsoft', 'WinGet', 'Links'));
    add(W.join(pf, 'WinGet', 'Links'));
    if (home) { add(W.join(home, '.local', 'bin')); add(W.join(home, '.claude', 'local')); }
    const seen = new Set();
    return dirs.filter((d) => { const k = d.toLowerCase().replace(/\\+$/, ''); if (!d || seen.has(k)) return false; seen.add(k); return true; });
  }
  function byVersionDesc(a, b) {
    const pa = a.replace(/^v/, '').split('.').map(Number); const pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
    return 0;
  }
  // files named `name` under root (versioned app folders), newest first
  function allIn(root, name, { fs = realFs, depth = 3, limit = 3 } = {}) {
    const found = [];
    const walk = (dir, level) => {
      for (const n of fs.list(dir)) {
        const full = W.join(dir, n);
        if (n.toLowerCase() === name.toLowerCase() && fs.isFile(full)) found.push({ full, mtime: fs.mtime(full) });
        else if (level < depth && n !== 'node_modules' && fs.isDir(full)) walk(full, level + 1);
      }
    };
    if (root) walk(root, 0);
    return found.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((f) => f.full);
  }
  const EXTS = ['.exe', '.cmd', '.bat'];
  function candidates(engine, { env = process.env, home = os.homedir(), fs = realFs } = {}) {
    const out = [];
    const add = (f) => { if (f && fs.isFile(f) && !out.some((x) => x.toLowerCase() === f.toLowerCase())) out.push(f); };
    for (const d of binDirs({ env, home, fs })) for (const x of EXTS) add(W.join(d, engine + x));
    const appData = envGet(env, 'APPDATA') || (home ? W.join(home, 'AppData', 'Roaming') : '');
    const local = envGet(env, 'LOCALAPPDATA') || (home ? W.join(home, 'AppData', 'Local') : '');
    // winget's own package folders (when its Links folder wasn't made): Anthropic.ClaudeCode_…, OpenAI.Codex_…
    if (local) {
      const pk = W.join(local, 'Microsoft', 'WinGet', 'Packages');
      for (const n of fs.list(pk).filter((x) => new RegExp(engine === 'claude' ? '^Anthropic\\.Claude' : '^OpenAI\\.Codex', 'i').test(x))) allIn(W.join(pk, n), `${engine}.exe`, { fs, depth: 2, limit: 1 }).forEach(add);
    }
    if (engine === 'claude') {
      // the Claude desktop app's own Claude Code (%APPDATA%\Claude\claude-code\<version>\claude.exe)
      if (appData) allIn(W.join(appData, 'Claude', 'claude-code'), 'claude.exe', { fs }).forEach(add);
    } else {
      if (local) allIn(W.join(local, 'OpenAI', 'Codex', 'bin'), 'codex.exe', { fs }).forEach(add);
      // npm's codex.cmd starts a Node script that starts this program: found directly too (no Node needed)
      if (appData) allIn(W.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'vendor'), 'codex.exe', { fs, limit: 1 }).forEach(add);
    }
    // the same folder holding claude.exe and claude.cmd: the .exe first (it was added first)
    return out;
  }
  // every folder that was looked in, for /doctor and the "not found" message
  const lookedIn = (opts) => binDirs(opts);

  // ---------- starting a .cmd / .bat ----------
  // npm (cmd-shim), pnpm and Yarn write a .cmd that runs `node "<script>" %*` (or a program). Read it and run that
  // directly: no cmd.exe, no quoting, arguments with newlines and quotes arrive as they are.
  //   → { script, exe, cmd, dir } (one of script / exe / cmd) or null
  function readShim(file, { fs = realFs } = {}) {
    const text = fs.read(file);
    if (!text) return null;
    const dir = W.dirname(file);
    const targets = [];
    const re = /"%~?dp0%?\\?([^"%]+)"/gi;
    let m;
    while ((m = re.exec(text))) targets.push(m[1]);
    const rel = targets.filter((t) => !/(^|\\)node(\.exe)?$/i.test(t));
    const pick = (re2) => rel.find((t) => re2.test(t));
    const js = pick(/\.(c|m)?js$/i);
    if (js) return { script: W.normalize(W.join(dir, js)), dir };
    const exe = pick(/\.exe$/i);
    if (exe) return { exe: W.normalize(W.join(dir, exe)), dir };
    const cmd = pick(/\.(cmd|bat)$/i);
    if (cmd) return { cmd: W.normalize(W.join(dir, cmd)), dir };
    return null;
  }
  // node.exe for a shim: the one next to it (npm's rule), else the first on PATH / the usual places, else null
  function findNode({ env = process.env, fs = realFs, near = '' } = {}) {
    const pf = envGet(env, 'ProgramW6432') || envGet(env, 'ProgramFiles') || 'C:\\Program Files';
    const local = envGet(env, 'LOCALAPPDATA');
    const list = [near && W.join(near, 'node.exe'), ...envGet(env, 'PATH').split(';').filter((d) => d.trim()).map((d) => W.join(unquote(expand(d, env)), 'node.exe')),
      envGet(env, 'NVM_SYMLINK') && W.join(envGet(env, 'NVM_SYMLINK'), 'node.exe'), W.join(pf, 'nodejs', 'node.exe'), local && W.join(local, 'Volta', 'bin', 'node.exe')];
    return list.find((f) => f && fs.isFile(f)) || null;
  }

  // cmd.exe quoting (the rules cross-spawn uses): each argument quoted for the program (backslashes before a quote
  // doubled, quotes escaped), then every cmd.exe special character escaped with ^, twice for a .cmd / .bat (it
  // re-reads %*). cmd.exe can't carry a line break: newlines become spaces (the caller logs it).
  const META = /([()\][%!^"`<>&|;, *?])/g;
  function quoteArg(arg, { batch = true } = {}) {
    let a = String(arg ?? '').replace(/\r?\n/g, ' ');
    a = a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1');
    a = `"${a}"`.replace(META, '^$1');
    return batch ? a.replace(META, '^$1') : a;
  }
  // the program itself in plain quotes (cmd.exe's own quoting: spaces, & and ( in a folder name are safe inside them)
  const quoteCommand = (file) => `"${String(file).replace(/"/g, '')}"`;
  function cmdLine(file, args) { return [quoteCommand(W.normalize(file)), ...args.map((a) => quoteArg(a, { batch: /\.(cmd|bat)$/i.test(file) }))].join(' '); }

  // How to start `bin` with `args`. On Windows: an .exe directly; npm's .cmd through its Node script; a .js with Node;
  // a .ps1 through its sibling .cmd / .exe (npm writes all three); anything else through cmd.exe, quoted.
  function plan(bin, args = [], { platform = process.platform, env = process.env, fs = realFs, execPath = process.execPath, depth = 0 } = {}) {
    const direct = { command: bin, args, options: {}, via: 'direct' };
    if (platform !== 'win32' || !bin) return direct;
    const ext = W.extname(bin).toLowerCase();
    if (ext === '.ps1') {
      const base = bin.slice(0, -4);
      const sib = ['.exe', '.cmd'].map((x) => base + x).find((f) => fs.isFile(f));
      if (sib) return plan(sib, args, { platform, env, fs, execPath, depth });
    }
    const viaNode = (script, near) => {
      const node = findNode({ env, fs, near });
      // no Node installed: Hearth's own Electron runs the script as Node (as it runs its tool servers)
      return node ? { command: node, args: [script, ...args], options: {}, via: 'node', script }
        : { command: execPath, args: [script, ...args], options: {}, extraEnv: { ELECTRON_RUN_AS_NODE: '1' }, via: 'node', script, electron: true };
    };
    if (/^\.(c|m)?js$/.test(ext)) return viaNode(bin, W.dirname(bin));
    if (ext !== '.cmd' && ext !== '.bat') return direct;
    const shim = depth < 3 ? readShim(bin, { fs }) : null;
    if (shim?.script && fs.isFile(shim.script)) return viaNode(shim.script, shim.dir);
    if (shim?.exe && fs.isFile(shim.exe)) return { command: shim.exe, args, options: {}, via: 'direct', shim: bin };
    if (shim?.cmd && fs.isFile(shim.cmd)) return plan(shim.cmd, args, { platform, env, fs, execPath, depth: depth + 1 });
    const line = cmdLine(bin, args);
    const comspec = envGet(env, 'ComSpec') || W.join(envGet(env, 'SystemRoot') || 'C:\\Windows', 'System32', 'cmd.exe');
    return { command: comspec, args: ['/d', '/s', '/c', `"${line}"`], options: { windowsVerbatimArguments: true }, via: 'cmd', lossy: args.some((a) => /[\r\n]/.test(String(a))), long: line.length > 8000 };
  }
  // child_process.spawn through plan(): same options otherwise (env merged when the plan sets one)
  function spawn(bin, args, opts = {}) {
    if (process.platform !== 'win32') return cp.spawn(bin, args, opts);
    const p = plan(bin, args, { env: opts.env || process.env });
    const options = { ...opts, ...p.options };
    if (p.extraEnv) options.env = { ...(opts.env || process.env), ...p.extraEnv };
    const child = cp.spawn(p.command, p.args, options);
    child.hearthVia = p.via;
    return child;
  }

  // ---------- a path pasted in Settings → Engines ----------
  // File Explorer's "Copy as path" adds quotes; %APPDATA% / ~ are read; an npm path without its extension (…\npm\claude,
  // the sh script) gets the .cmd / .exe next to it; a folder gets the engine's program in it.
  function cleanPath(p, { platform = process.platform, env = process.env, home = os.homedir(), fs = realFs, engine = '' } = {}) {
    let s = unquote(p);
    if (!s) return '';
    if (platform !== 'win32') return s.replace(/^~(?=\/|$)/, home);
    s = expand(s, env).replace(/^~(?=[\\/]|$)/, home).replace(/\//g, '\\');
    s = s.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
    if (s.length > 3) s = s.replace(/\\+$/, '');
    if (engine && fs.isDir(s)) { const hit = EXTS.map((x) => W.join(s, engine + x)).find((f) => fs.isFile(f)); if (hit) return hit; }
    if (!W.extname(s) || W.extname(s).toLowerCase() === '.ps1') {
      const base = W.extname(s) ? s.slice(0, -4) : s;
      const hit = EXTS.map((x) => base + x).find((f) => fs.isFile(f));
      if (hit) return hit;
    }
    return s;
  }

  // ---------- the Recycle Bin ----------
  // Windows sends a file on a network share or a USB stick straight to oblivion when asked to "recycle" it (those drives
  // have no Recycle Bin). Hearth only lets shell.trashItem run where the Recycle Bin exists: a local fixed drive.
  //   driveType(letter) → 'fixed' | 'removable' | 'network' | 'cdrom' | 'ram' | 'unknown' (cached; PowerShell asks)
  const driveCache = new Map();
  function driveTypeDefault(letter) {
    const L = String(letter).toUpperCase();
    if (driveCache.has(L)) return driveCache.get(L);
    let t = 'unknown';
    try {
      const out = cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[System.IO.DriveInfo]::new('${L}').DriveType`], { windowsHide: true, timeout: 5000, encoding: 'utf8' });
      t = String(out).trim().toLowerCase() || 'unknown';
    } catch { /* unknown */ }
    driveCache.set(L, t);
    return t;
  }
  function trashCheck(p, { platform = process.platform, env = process.env, fs = realFs, driveType = driveTypeDefault } = {}) {
    if (platform !== 'win32') return { ok: true, path: p };
    let s = String(p || '').replace(/\//g, '\\');
    s = s.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
    s = W.normalize(s);
    if (s.length > 3) s = s.replace(/\\+$/, '');
    const name = W.basename(s) || s;
    if (/^\\\\/.test(s)) return { ok: false, path: s, reason: 'network', error: `${name} is on a network share, which has no Recycle Bin on Windows, so Hearth didn't delete it (nothing was lost). Delete it yourself in File Explorer if you're sure.` };
    const m = /^([A-Za-z]):\\/.exec(s);
    if (!m) return { ok: false, path: s, reason: 'relative', error: `Hearth only deletes files named with their full path (${name}); nothing was deleted.` };
    if (/^[A-Za-z]:\\?$/.test(s)) return { ok: false, path: s, reason: 'root', error: 'Hearth never deletes a whole drive.' };
    const sysDrive = (envGet(env, 'SystemDrive') || 'C:').slice(0, 1).toUpperCase();
    const letter = m[1].toUpperCase();
    if (letter !== sysDrive) {
      let t = driveType(letter);
      if (t === 'unknown') t = fs.isDir(`${letter}:\\$Recycle.Bin`) ? 'fixed' : 'unknown';
      if (t !== 'fixed') {
        const what = t === 'network' ? 'a network drive' : t === 'removable' ? 'a USB / removable drive' : `drive ${letter}:, which Windows doesn't say has a Recycle Bin`;
        return { ok: false, path: s, reason: t, error: `${name} is on ${what}; Windows would delete it for good instead of using the Recycle Bin, so Hearth left it where it is (nothing was lost). Delete it yourself in File Explorer if you're sure.` };
      }
    }
    return { ok: true, path: s };
  }
  // what shell.trashItem's failure means, in plain words (nothing was deleted either way)
  function trashError(err, p) {
    const msg = String(err?.message || err || '');
    const name = W.basename(String(p || '')) || String(p || '');
    if (/ENOENT|not (be )?found|cannot find|does not exist/i.test(msg)) return `${name} was already gone.`;
    if (/in use|being used|sharing violation|EBUSY|0x80070020/i.test(msg)) return `${name} is open in another program, so Windows couldn't move it to the Recycle Bin. Close that program and try again (nothing was deleted).`;
    if (/access is denied|EPERM|EACCES|0x80070005|permission/i.test(msg)) return `Windows didn't allow moving ${name} to the Recycle Bin (a protected or read-only file, or your antivirus' "controlled folder access"). Nothing was deleted.`;
    if (/too long|0x800700ce|ENAMETOOLONG/i.test(msg)) return `${name}'s path is too long for the Recycle Bin. Nothing was deleted; move it to a shorter folder first.`;
    return `Windows couldn't move ${name} to the Recycle Bin (${msg.split('\n')[0].slice(0, 120) || 'no reason given'}). Nothing was deleted.`;
  }

  // ---------- Windows' own error texts, in plain words ----------
  // → { text, fix, action: 'install' | 'update' | 'doctor' } or null (engines.js adds it to the failed reply with a button)
  const STACK = /^\s*at\s+(?:.+\(.+:\d+:\d+\)|[^\s]+:\d+:\d+|node:|new |async )|^\s*at\s+\S+\s*$|^node:internal|^\s*\^+\s*$|^Node\.js v\d+/;
  const dropStack = (text) => String(text || '').split(/\r?\n/).filter((l) => !STACK.test(l)).join('\n').trim();
  const WIN_ERRORS = [
    [/is not recognized as an internal or external command|'node' is not recognized|node(\.exe)?: (command )?not found|The system cannot find the path specified/i,
      'Windows couldn\'t start it: this copy was installed with npm and needs Node.js, which Windows can\'t find.', 'Press Install to get the standalone version (no Node.js needed), or install Node.js (nodejs.org) and press Retry.', 'install'],
    [/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/i,
      'This copy\'s files are incomplete (an npm install that was interrupted or half-removed).', 'Press Update to reinstall it, then Retry.', 'update'],
    [/The command line is too long|ENAMETOOLONG|E2BIG/i,
      'Windows refused the command line as too long.', 'Press Install to get the standalone version (it takes a longer command line), then Retry.', 'install'],
    [/spawn EINVAL|\bEINVAL\b/i,
      'Windows wouldn\'t start this program the way it was given (often a .cmd / .bat set in Settings → Engines).', 'Run /doctor: it shows the copies Hearth can start and lets you pick one.', 'doctor'],
    [/SyntaxError: Unexpected token|Unexpected reserved word|requires Node(\.js)? (version )?\d+|Node\.js \d+(\.\d+)* or (newer|higher|later)|unsupported engine/i,
      'The Node.js on this PC is too old for this copy.', 'Press Install to get the standalone version (no Node.js needed), or update Node.js, then Retry.', 'install'],
    [/EBUSY|being used by another process|resource busy or locked/i,
      'Windows says a file it needs is in use (an update still running, or your antivirus scanning it).', 'Wait a few seconds and press Retry; if it keeps happening, run /doctor.', 'doctor'],
    [/spawn (EACCES|EPERM)|\((EACCES|EPERM)\)|blocked by (your )?(antivirus|group policy|administrator)|Windows Defender|SmartScreen|This program is blocked/i,
      'Windows (or your antivirus) didn\'t allow Hearth to start it.', 'Allow it in Windows Security (Protection history → Allow), or run /doctor to pick another copy, then Retry.', 'doctor'],
    [/This app can't run on your PC|not a valid Win32 application|%1 is not a valid|UNKNOWN: unknown error, (spawn|open)/i,
      'This copy doesn\'t run on this PC (a download for another kind of computer, or a broken file).', 'Press Install for a fresh copy, then Retry.', 'install'],
  ];
  function plainError(text) {
    const t = String(text || '');
    const hit = WIN_ERRORS.find(([re]) => re.test(t));
    return hit ? { text: hit[1], fix: hit[2], action: hit[3] } : null;
  }

  return { envGet, binDirs, candidates, lookedIn, readShim, findNode, quoteArg, cmdLine, plan, spawn, cleanPath, trashCheck, trashError, plainError, dropStack, PKG, _driveCache: driveCache };
})();
module.exports = WinPolish;
