#!/usr/bin/env node
// (round 32, winpolish) Windows, simulated (no Windows PC here): path.win32, an injected platform / env and a fake file
// list. Covers winpolish.js (finding claude / codex: npm's claude.cmd, the npm prefix, PATH, nvm-windows, Volta, scoop,
// winget, pnpm, Bun, the installer, the desktop apps; reading npm / pnpm / Yarn .cmd shims; the start plan: .exe
// direct, .cmd through its Node script, cmd.exe quoting checked against a model of cmd.exe + CommandLineToArgvW;
// Settings → Engines paths; the Recycle Bin guard; plain errors), the engines' Windows error lines (copied to a temp
// folder like the other engine tests), installs.js kinds, access-rules' Windows path forms and Chrome's places.
//   node dev/winpolish-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const W = path.win32;
const ROOT = path.join(__dirname, '..');
const P = require('../winpolish');
const R = require('../access-rules');
const C = require('../chrome-cdp');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

// ---------- a fake Windows disk: { 'C:\\x\\a.cmd': 'text' } (case-insensitive, folders implied) ----------
function fakeFs(files) {
  const map = new Map(Object.entries(files).map(([k, v]) => [W.normalize(k).toLowerCase(), { name: W.normalize(k), text: v.text ?? v, mtime: v.mtime || 1 }]));
  const dirs = new Set();
  for (const { name } of map.values()) { let d = W.dirname(name); while (d && !dirs.has(d.toLowerCase())) { dirs.add(d.toLowerCase()); const up = W.dirname(d); if (up === d) break; d = up; } }
  const k = (p) => W.normalize(String(p)).toLowerCase().replace(/\\+$/, '');
  return {
    isFile: (p) => map.has(k(p)),
    isDir: (p) => dirs.has(k(p)),
    list: (p) => { const d = k(p); const out = new Set(); for (const { name } of map.values()) { const n = name.toLowerCase(); if (n.startsWith(`${d}\\`)) out.add(name.slice(d.length + 1).split('\\')[0]); } return [...out]; },
    read: (p) => map.get(k(p))?.text || '',
    mtime: (p) => map.get(k(p))?.mtime || 0,
  };
}
const HOME = 'C:\\Users\\Quentin';
const ENV = { APPDATA: `${HOME}\\AppData\\Roaming`, LOCALAPPDATA: `${HOME}\\AppData\\Local`, USERPROFILE: HOME, ProgramFiles: 'C:\\Program Files', ProgramData: 'C:\\ProgramData', SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\system32\\cmd.exe', SystemDrive: 'C:', PATH: 'C:\\Windows\\system32;C:\\Windows' };
// npm's cmd-shim, today's form and an older one; pnpm's; Yarn's (a .cmd that calls another .cmd)
const NPM_SHIM = (rel) => `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${rel}" %*\r\n`;
const OLD_SHIM = (rel) => `@IF EXIST "%~dp0\\node.exe" (\r\n  "%~dp0\\node.exe"  "%~dp0\\${rel}" %*\r\n) ELSE (\r\n  @SETLOCAL\r\n  @SET PATHEXT=%PATHEXT:;.JS;=;%\r\n  node  "%~dp0\\${rel}" %*\r\n)`;
const EXE_SHIM = (rel) => `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%dp0%\\${rel}"   %*\r\n`;
const YARN_SHIM = (rel) => `@"%~dp0\\${rel}" %*\r\n`;
const CLAUDE_JS = 'node_modules\\@anthropic-ai\\claude-code\\cli.js';
const npmDir = `${ENV.APPDATA}\\npm`;

// ---------- 1. where copies are found ----------
{
  // npm's default prefix (%APPDATA%\npm) not on Hearth's PATH (started from the Start menu before a re-login)
  const f = fakeFs({ [`${npmDir}\\claude.cmd`]: NPM_SHIM(CLAUDE_JS), [`${npmDir}\\claude`]: '#!/bin/sh', [`${npmDir}\\claude.ps1`]: '#ps', [`${npmDir}\\${CLAUDE_JS}`]: '//' });
  eq(P.candidates('claude', { env: ENV, home: HOME, fs: f }), [`${npmDir}\\claude.cmd`], 'npm claude.cmd found off PATH (only the .cmd, not the sh / ps1 scripts)');
  // the same, with Windows' own key spelling (Path, AppData) and the folder on PATH with quotes and a %VAR%
  const env2 = { Path: `C:\\Windows;"%APPDATA%\\npm"`, AppData: ENV.APPDATA, LocalAppData: ENV.LOCALAPPDATA };
  eq(P.candidates('claude', { env: env2, home: HOME, fs: f })[0], `${npmDir}\\claude.cmd`, 'case-insensitive env keys, quoted PATH entries, %VAR% in PATH');
  eq(P.envGet({ Path: 'x' }, 'PATH'), 'x', 'envGet ignores case');
}
{
  const f = fakeFs({ 'D:\\tools\\claude.exe': 'MZ', 'D:\\tools\\claude.cmd': EXE_SHIM('claude.exe') });
  eq(P.candidates('claude', { env: { ...ENV, PATH: 'D:\\tools' }, home: HOME, fs: f }), ['D:\\tools\\claude.exe', 'D:\\tools\\claude.cmd'], 'on PATH: the .exe before the .cmd of the same folder');
}
{
  // a custom npm prefix: from the environment, from ~\.npmrc
  const f = fakeFs({ 'E:\\npm-global\\claude.cmd': NPM_SHIM(CLAUDE_JS), 'F:\\pfx\\codex.cmd': NPM_SHIM('node_modules\\@openai\\codex\\bin\\codex.js'), [`${HOME}\\.npmrc`]: 'registry=https://r\nprefix=F:\\pfx\n' });
  eq(P.candidates('claude', { env: { ...ENV, npm_config_prefix: 'E:\\npm-global' }, home: HOME, fs: f }), ['E:\\npm-global\\claude.cmd'], 'npm prefix from npm_config_prefix');
  eq(P.candidates('codex', { env: ENV, home: HOME, fs: f }), ['F:\\pfx\\codex.cmd'], 'npm prefix from ~\\.npmrc');
}
{
  // nvm-windows: the active Node's folder (NVM_SYMLINK) and every version under NVM_HOME, newest first
  const f = fakeFs({ 'C:\\nvm4w\\nodejs\\claude.cmd': NPM_SHIM(CLAUDE_JS), [`${ENV.APPDATA}\\nvm\\v18.20.1\\claude.cmd`]: 'x', [`${ENV.APPDATA}\\nvm\\v22.11.0\\claude.cmd`]: 'x', [`${ENV.APPDATA}\\nvm\\v20.9.0\\claude.cmd`]: 'x' });
  eq(P.candidates('claude', { env: { ...ENV, NVM_SYMLINK: 'C:\\nvm4w\\nodejs', NVM_HOME: `${ENV.APPDATA}\\nvm` }, home: HOME, fs: f }),
    ['C:\\nvm4w\\nodejs\\claude.cmd', `${ENV.APPDATA}\\nvm\\v22.11.0\\claude.cmd`, `${ENV.APPDATA}\\nvm\\v20.9.0\\claude.cmd`, `${ENV.APPDATA}\\nvm\\v18.20.1\\claude.cmd`], 'nvm-windows: active Node first, then versions newest first');
  eq(P.candidates('claude', { env: ENV, home: HOME, fs: f }).length, 3, 'nvm-windows default NVM_HOME (%APPDATA%\\nvm) without the variables');
}
{
  const L = ENV.LOCALAPPDATA;
  const f = fakeFs({
    [`${L}\\Volta\\bin\\claude.exe`]: 'MZ', [`${HOME}\\scoop\\shims\\codex.exe`]: 'MZ', 'C:\\ProgramData\\scoop\\shims\\claude.cmd': 'x',
    [`${L}\\Microsoft\\WinGet\\Links\\claude.exe`]: 'MZ', [`${L}\\Microsoft\\WinGet\\Packages\\OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe\\codex.exe`]: 'MZ',
    [`${L}\\pnpm\\claude.cmd`]: 'x', [`${HOME}\\.bun\\bin\\claude.exe`]: 'MZ', [`${HOME}\\.local\\bin\\claude.exe`]: 'MZ',
    [`${ENV.APPDATA}\\Claude\\claude-code\\2.1.300\\claude.exe`]: { text: 'MZ', mtime: 10 }, [`${ENV.APPDATA}\\Claude\\claude-code\\2.1.320\\claude.exe`]: { text: 'MZ', mtime: 20 },
    [`${L}\\OpenAI\\Codex\\bin\\abc123\\codex.exe`]: 'MZ', [`${npmDir}\\node_modules\\@openai\\codex\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe`]: 'MZ',
  });
  const cl = P.candidates('claude', { env: ENV, home: HOME, fs: f });
  for (const want of [`${L}\\Volta\\bin\\claude.exe`, 'C:\\ProgramData\\scoop\\shims\\claude.cmd', `${L}\\Microsoft\\WinGet\\Links\\claude.exe`, `${L}\\pnpm\\claude.cmd`, `${HOME}\\.bun\\bin\\claude.exe`, `${HOME}\\.local\\bin\\claude.exe`]) ok(cl.includes(want), `claude found at ${want}`);
  ok(cl.indexOf(`${ENV.APPDATA}\\Claude\\claude-code\\2.1.320\\claude.exe`) >= 0 && cl.indexOf(`${ENV.APPDATA}\\Claude\\claude-code\\2.1.320\\claude.exe`) < cl.indexOf(`${ENV.APPDATA}\\Claude\\claude-code\\2.1.300\\claude.exe`), 'the Claude app\'s bundled CLI, newest first');
  const cx = P.candidates('codex', { env: ENV, home: HOME, fs: f });
  for (const want of [`${HOME}\\scoop\\shims\\codex.exe`, `${L}\\Microsoft\\WinGet\\Packages\\OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe\\codex.exe`, `${L}\\OpenAI\\Codex\\bin\\abc123\\codex.exe`, `${npmDir}\\node_modules\\@openai\\codex\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe`]) ok(cx.includes(want), `codex found at ${want}`);
  ok(!cx.some((x) => /claude/i.test(x)) && !cl.some((x) => /codex/i.test(x)), 'each engine only finds its own program');
  ok(P.lookedIn({ env: ENV, home: HOME, fs: f }).some((d) => /WinGet\\Links$/.test(d)), 'lookedIn lists the folders');
  eq(P.candidates('claude', { env: {}, home: '', fs: fakeFs({}) }), [], 'an empty environment finds nothing and doesn\'t throw');
}

// ---------- 2. reading .cmd shims ----------
{
  const f = fakeFs({ [`${npmDir}\\claude.cmd`]: NPM_SHIM(CLAUDE_JS), 'D:\\n\\claude.cmd': OLD_SHIM(CLAUDE_JS), 'D:\\e\\claude.cmd': EXE_SHIM('node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe'), 'D:\\y\\claude.cmd': YARN_SHIM('..\\Data\\global\\node_modules\\.bin\\claude.cmd'), 'D:\\z\\claude.cmd': '@echo hi' });
  eq(P.readShim(`${npmDir}\\claude.cmd`, { fs: f }).script, `${npmDir}\\${CLAUDE_JS}`, 'npm cmd-shim (today\'s form) → its Node script');
  eq(P.readShim('D:\\n\\claude.cmd', { fs: f }).script, `D:\\n\\${CLAUDE_JS}`, 'npm cmd-shim (older form, %~dp0) → its Node script');
  eq(P.readShim('D:\\e\\claude.cmd', { fs: f }).exe, 'D:\\e\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe', 'a shim to a program → the program');
  eq(P.readShim('D:\\y\\claude.cmd', { fs: f }).cmd, 'D:\\Data\\global\\node_modules\\.bin\\claude.cmd', 'Yarn\'s shim to another .cmd → that .cmd');
  eq(P.readShim('D:\\z\\claude.cmd', { fs: f }), null, 'a .cmd that isn\'t a shim → null');
  eq(P.readShim('D:\\missing.cmd', { fs: f }), null, 'a missing file → null');
}

// ---------- 3. the start plan ----------
const ARGS = ['-p', '--output-format', 'stream-json', '--system-prompt', 'You are "Claude".\nBe brief & kind (100%)!'];
{
  const script = `${npmDir}\\${CLAUDE_JS}`;
  const base = { [`${npmDir}\\claude.cmd`]: NPM_SHIM(CLAUDE_JS), [script]: '//' };
  const opt = (files, env = ENV) => ({ platform: 'win32', env, fs: fakeFs(files), execPath: 'C:\\Hearth\\electron\\electron.exe' });
  // node.exe on PATH (the Node installer)
  let p = P.plan(`${npmDir}\\claude.cmd`, ARGS, opt({ ...base, 'C:\\Program Files\\nodejs\\node.exe': 'MZ' }, { ...ENV, PATH: `${ENV.PATH};C:\\Program Files\\nodejs` }));
  eq([p.via, p.command, p.args], ['node', 'C:\\Program Files\\nodejs\\node.exe', [script, ...ARGS]], 'npm claude.cmd → node.exe + its script, the arguments untouched (newlines, quotes, &, %)');
  ok(!p.options.shell && !p.options.windowsVerbatimArguments, 'no shell, no verbatim command line on the node route');
  // node.exe next to the shim wins (npm's rule)
  p = P.plan(`${npmDir}\\claude.cmd`, ARGS, opt({ ...base, [`${npmDir}\\node.exe`]: 'MZ', 'C:\\Program Files\\nodejs\\node.exe': 'MZ' }, { ...ENV, PATH: 'C:\\Program Files\\nodejs' }));
  eq(p.command, `${npmDir}\\node.exe`, 'node.exe next to the shim first');
  // the default Node install folder without PATH
  p = P.plan(`${npmDir}\\claude.cmd`, ARGS, opt({ ...base, 'C:\\Program Files\\nodejs\\node.exe': 'MZ' }));
  eq(p.command, 'C:\\Program Files\\nodejs\\node.exe', 'Node found in Program Files even when PATH lacks it');
  // no Node at all: Hearth's own Electron as Node
  p = P.plan(`${npmDir}\\claude.cmd`, ARGS, opt(base));
  eq([p.via, p.command, p.extraEnv, p.args[0]], ['node', 'C:\\Hearth\\electron\\electron.exe', { ELECTRON_RUN_AS_NODE: '1' }, script], 'no Node installed → Electron runs the script as Node');
  // .exe direct; a shim to an .exe; a .js; a .ps1 (its .cmd sibling)
  eq(P.plan('C:\\x\\claude.exe', ARGS, opt({})).via, 'direct', '.exe direct');
  const exeShim = { 'D:\\e\\claude.cmd': EXE_SHIM('bin\\claude.exe'), 'D:\\e\\bin\\claude.exe': 'MZ' };
  p = P.plan('D:\\e\\claude.cmd', ARGS, opt(exeShim));
  eq([p.via, p.command, p.args], ['direct', 'D:\\e\\bin\\claude.exe', ARGS], 'a shim to a program → that program, no cmd.exe');
  eq(P.plan('D:\\dev\\fake-claude.js', ARGS, opt({ 'C:\\Program Files\\nodejs\\node.exe': 'MZ' })).args[0], 'D:\\dev\\fake-claude.js', 'a .js runs with Node');
  p = P.plan(`${npmDir}\\claude.ps1`, ARGS, opt({ ...base, 'C:\\Program Files\\nodejs\\node.exe': 'MZ' }));
  eq([p.via, p.args[0]], ['node', script], 'a .ps1 → its .cmd sibling → Node');
  // a Yarn shim chain
  p = P.plan('D:\\y\\claude.cmd', ARGS, opt({ 'D:\\y\\claude.cmd': YARN_SHIM('..\\g\\claude.cmd'), 'D:\\g\\claude.cmd': NPM_SHIM(CLAUDE_JS), [`D:\\g\\${CLAUDE_JS}`]: '//', 'C:\\Program Files\\nodejs\\node.exe': 'MZ' }));
  eq([p.via, p.args[0]], ['node', `D:\\g\\${CLAUDE_JS}`], 'a shim calling a shim → the Node script at the end');
  // a shim whose script is gone, or an unknown .bat: cmd.exe /d /s /c with a quoted line
  p = P.plan(`${npmDir}\\claude.cmd`, ['-p', 'a b'], opt({ [`${npmDir}\\claude.cmd`]: NPM_SHIM(CLAUDE_JS) }));
  eq([p.via, p.command, p.args.slice(0, 3), p.options.windowsVerbatimArguments], ['cmd', ENV.ComSpec, ['/d', '/s', '/c'], true], 'unreadable shim → cmd.exe /d /s /c, verbatim');
  ok(p.args[3].startsWith('""C:\\Users\\Quentin\\AppData\\Roaming\\npm\\claude.cmd" ') && p.args[3].endsWith('"'), 'the whole line wrapped in one more pair of quotes for /s');
  eq(P.plan('C:\\x\\run.bat', ['x\ny'], opt({ 'C:\\x\\run.bat': '@echo %*' })).lossy, true, 'a newline through cmd.exe is flagged (it can\'t carry one)');
  eq(P.plan(`${npmDir}\\claude.cmd`, ARGS, { platform: 'darwin', env: ENV }), { command: `${npmDir}\\claude.cmd`, args: ARGS, options: {}, via: 'direct' }, 'Mac / Linux: unchanged');
}

// ---------- 4. cmd.exe quoting, against a model of what Windows does with the line ----------
// cmd.exe (no quotes left unescaped): one ^ level removed per parse (twice for a .cmd / .bat re-reading %*), then the
// program splits the line with the C runtime's rules (CommandLineToArgvW)
function argv(line) {
  const out = []; let cur = ''; let inQ = false; let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') {
      let n = 0; while (line[i + n] === '\\') n++;
      if (line[i + n] === '"') { cur += '\\'.repeat(n >> 1); if (n % 2) { cur += '"'; i += n; } else i += n - 1; } else { cur += '\\'.repeat(n); i += n - 1; }
      has = true;
    } else if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
      has = true;
    } else if (!inQ && (c === ' ' || c === '\t')) { if (has) { out.push(cur); cur = ''; has = false; } } else { cur += c; has = true; }
  }
  if (has) out.push(cur);
  return out;
}
const uncaret = (s) => s.replace(/\^(.)/g, '$1');
const NASTY = ['plain', 'two words', '', 'say "hi"', 'C:\\Program Files\\x\\', 'back\\\\"slash', 'a & b | c > d < e', '100% %PATH% !x!', '(paren) [br] ^caret', 'semi;colon,comma', 'émoji 🎬 ü', 'tab\there', '"', '\\', 'trail\\\\'];
for (const a of NASTY) {
  eq(argv(uncaret(P.quoteArg(a, { batch: false }))), [a], `cmd.exe line → the argument back (${JSON.stringify(a)})`);
  eq(argv(uncaret(uncaret(P.quoteArg(a, { batch: true })))), [a], `through a .cmd's %* → the argument back (${JSON.stringify(a)})`);
}
{
  const line = P.cmdLine('C:\\My Tools\\claude.cmd', NASTY);
  eq(argv(uncaret(uncaret(line))), ['C:\\My Tools\\claude.cmd', ...NASTY], 'a whole command line of awkward arguments comes back in order, the program first');
  ok(!/[^\^]&/.test(line.replace(/\^\^/g, '')), 'no unescaped & reaches cmd.exe');
  ok(line.startsWith('"C:\\My Tools\\claude.cmd" '), 'the program name in quotes (a space in its folder)');
}

// ---------- 5. Settings → Engines paths ----------
{
  const f = fakeFs({ [`${npmDir}\\claude.cmd`]: 'x', [`${npmDir}\\claude`]: 'sh', 'D:\\Codex\\codex.exe': 'MZ' });
  const o = { platform: 'win32', env: ENV, home: HOME, fs: f };
  eq(P.cleanPath(`"${npmDir}\\claude.cmd"`, o), `${npmDir}\\claude.cmd`, 'File Explorer\'s "Copy as path" quotes removed');
  eq(P.cleanPath('%APPDATA%\\npm\\claude.cmd', o), `${npmDir}\\claude.cmd`, '%APPDATA% expanded');
  eq(P.cleanPath(`${npmDir}\\claude`, o), `${npmDir}\\claude.cmd`, 'npm\'s extensionless sh script → its .cmd');
  eq(P.cleanPath(`${npmDir}\\claude.ps1`, o), `${npmDir}\\claude.cmd`, 'npm\'s .ps1 → its .cmd');
  eq(P.cleanPath('D:/Codex/', { ...o, engine: 'codex' }), 'D:\\Codex\\codex.exe', 'a folder (forward slashes, trailing slash) → the program in it');
  eq(P.cleanPath('\\\\?\\D:\\Codex\\codex.exe', o), 'D:\\Codex\\codex.exe', 'a long-path name → the plain path');
  eq(P.cleanPath('~\\AppData\\Roaming\\npm\\claude.cmd', o), `${npmDir}\\claude.cmd`, '~ is the home folder');
  eq(P.cleanPath(" '/usr/local/bin/claude' ", { platform: 'darwin', home: '/Users/q' }), '/usr/local/bin/claude', 'Mac: quotes trimmed only');
}

// ---------- 6. the Recycle Bin guard ----------
{
  const types = { C: 'fixed', D: 'fixed', E: 'removable', Z: 'network', R: 'cdrom' };
  let asked = [];
  const o = (extra = {}) => ({ platform: 'win32', env: ENV, fs: fakeFs({ 'F:\\$Recycle.Bin\\S-1\\x': 'x' }), driveType: (l) => { asked.push(l); return types[l] || 'unknown'; }, ...extra });
  eq(P.trashCheck('C:\\Users\\Quentin\\proj\\a.txt', o()), { ok: true, path: 'C:\\Users\\Quentin\\proj\\a.txt' }, 'system drive: the Recycle Bin');
  eq(asked, [], 'the system drive is never probed');
  eq(P.trashCheck('c:/users/quentin/proj/build/', o()).path, 'c:\\users\\quentin\\proj\\build', 'forward slashes and a trailing slash cleaned');
  eq(P.trashCheck('\\\\?\\C:\\very\\deep\\a.txt', o()).path, 'C:\\very\\deep\\a.txt', 'a \\\\?\\ long name cleaned for the shell');
  ok(P.trashCheck('D:\\Footage\\a.mov', o()).ok, 'a second fixed drive: the Recycle Bin');
  for (const [p, reason] of [['\\\\nas\\share\\a.txt', 'network'], ['\\\\?\\UNC\\nas\\share\\a.txt', 'network'], ['//nas/share/a.txt', 'network'], ['Z:\\mapped\\a.txt', 'network'], ['E:\\usb\\a.txt', 'removable'], ['R:\\disc\\a.txt', 'cdrom'], ['G:\\unknown\\a.txt', 'unknown']]) {
    const r = P.trashCheck(p, o());
    ok(!r.ok && r.reason === reason && /nothing was lost/.test(r.error) && !/Error|at /.test(r.error), `no Recycle Bin (${reason}) → left alone with a plain reason: ${p}`);
  }
  ok(P.trashCheck('F:\\stuff\\a.txt', o()).ok, 'drive type unknown but it has a $Recycle.Bin → the Recycle Bin');
  eq(P.trashCheck('C:\\', o()).reason, 'root', 'a whole drive never');
  eq(P.trashCheck('relative\\a.txt', o()).reason, 'relative', 'a relative path never');
  eq(P.trashCheck('/home/u/a', { platform: 'linux' }), { ok: true, path: '/home/u/a' }, 'Mac / Linux: unchanged');
  const errs = { 'ENOENT: no such file': 'already gone', 'The process cannot access the file because it is being used by another process.': 'another program', 'Access is denied. (0x80070005)': "didn't allow", 'Failed to move item to trash (0x800700CE)': 'too long', 'Failed to move item to trash': 'Nothing was deleted' };
  for (const [e, want] of Object.entries(errs)) { const t = P.trashError(new Error(e), 'C:\\x\\a.txt'); ok(t.includes(want) && t.includes('a.txt'), `trash error in plain words: ${e} → ${t}`); }
}

// ---------- 7. Windows' errors in plain words ----------
{
  const cases = [
    ["'node' is not recognized as an internal or external command,\r\noperable program or batch file.", 'install'],
    ["Error: Cannot find module 'C:\\Users\\Q\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js'", 'update'],
    ['The command line is too long.', 'install'],
    ["Couldn't start Claude Code (EINVAL).", 'doctor'],
    ['spawn EINVAL', 'doctor'],
    ['SyntaxError: Unexpected token \'?\'', 'install'],
    ['Error: EBUSY: resource busy or locked, open', 'doctor'],
    ["Couldn't start Codex (EACCES).", 'doctor'],
    ['This app can\'t run on your PC', 'install'],
  ];
  for (const [text, action] of cases) { const r = P.plainError(text); ok(r && r.action === action && r.text && r.fix, `plain error for ${JSON.stringify(text.slice(0, 50))} → ${action}`); }
  eq(P.plainError('rate limit reached'), null, 'other errors are left to the engines\' own fixes');
  const stack = "file:///C:/x/cli.js:12\nError: Cannot find module 'x'\nRequire stack:\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)\n    at Object.<anonymous> (C:\\x\\cli.js:3:1)\n    at node:internal/main/run_main_module:28:49\nNode.js v22.1.0";
  ok(!/\bat\b.*:\d+:\d+|Node\.js v/.test(P.dropStack(stack)) && /Cannot find module/.test(P.dropStack(stack)), 'stack frames dropped, the reason kept');
}

// ---------- 8. through engines.js (a temp copy, like the other engine tests) ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winpolish-'));
  for (const f of ['engines.js', 'store.js', 'installs.js', 'winpolish.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
  const T = require(path.join(dir, 'engines.js'))._test;
  const fe = (m, win = true) => T.friendlyError('claude', m, { win });
  let r = fe("'node' is not recognized as an internal or external command,");
  ok(r.fixAction === 'install' && /Node\.js/.test(r.message) && /Fix: /.test(r.message), 'engines: npm without Node → Install button + plain words');
  r = fe("Error: Cannot find module 'C:\\x\\cli.js'");
  ok(r.fixAction === 'update' && r.fixEngine === 'claude', 'engines: a half-removed npm install → Update button');
  r = fe('spawn EINVAL');
  ok(r.fixAction === 'doctor', 'engines: EINVAL → Run /doctor');
  r = fe('No such tool available: PowerShell');
  ok(!/Node\.js|antivirus/.test(r.message) && /PowerShell|Full/.test(r.message), 'engines: winshell\'s policy note keeps its own words');
  r = fe("'node' is not recognized as an internal or external command,", false);
  ok(!/Node\.js, which Windows/.test(r.message), 'engines: off Windows the Windows words aren\'t used');
  const line = T.lastErrorLine("Error: Cannot find module 'x'\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)\n    at Object.<anonymous> (C:\\x\\cli.js:3:1)\nNode.js v22.1.0");
  eq(line, "Error: Cannot find module 'x'", 'engines: the failure line is the reason, never a stack frame');
  const I = T.Installs;
  eq(I.kindOf('claude', 'C:\\Users\\Q\\AppData\\Roaming\\npm\\claude.cmd'), 'npm', 'kind: %APPDATA%\\npm → npm');
  eq(I.kindOf('claude', 'C:\\Users\\Q\\AppData\\Roaming\\nvm\\v22.1.0\\claude.cmd'), 'npm', 'kind: nvm-windows → npm');
  eq(I.kindOf('claude', 'C:\\Program Files\\nodejs\\claude.cmd'), 'npm', 'kind: the nodejs folder → npm');
  eq(I.kindOf('claude', 'C:\\Users\\Q\\AppData\\Local\\Volta\\bin\\claude.exe'), 'npm', 'kind: Volta → npm');
  eq(I.kindOf('claude', 'C:\\Users\\Q\\AppData\\Local\\pnpm\\claude.cmd'), 'pnpm', 'kind: pnpm');
  eq(I.kindOf('claude', 'C:\\Users\\Q\\scoop\\shims\\claude.exe'), 'scoop', 'kind: scoop');
  eq(I.kindOf('claude', 'C:\\Users\\Q\\AppData\\Local\\Microsoft\\WinGet\\Links\\claude.exe'), 'winget', 'kind: winget');
  eq(I.kindOf('claude', 'C:\\Users\\Q\\AppData\\Roaming\\Claude\\claude-code\\2.1.3\\claude.exe'), 'desktop', 'kind: the Claude app');
  ok(/pnpm add -g @anthropic-ai\/claude-code@latest/.test(I.updatePlan('claude', 'C:\\Users\\Q\\AppData\\Local\\pnpm\\claude.cmd').command), 'pnpm copies update with pnpm');
  ok(I.KIND_LABEL.scoop && I.KIND_LABEL.winget && I.KIND_LABEL.pnpm, 'labels for the new kinds');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- 9. the chats' folders: Windows' spellings of one place ----------
{
  const home = 'C:\\Users\\Me';
  const folders = ['C:\\Users\\Me\\Proj\\'];
  const read = (file, cwd = 'C:\\Users\\Me\\Proj') => R.classify({ tool: 'Read', input: { file_path: file }, level: 'write', folders, cwd, home }).verdict;
  const write = (file, cwd = 'C:\\Users\\Me\\Proj') => R.classify({ tool: 'Write', input: { file_path: file }, level: 'write', folders, cwd, home }).verdict;
  for (const p of ['c:\\users\\me\\proj\\a.txt', 'C:/Users/Me/Proj/a.txt', 'c:/USERS/me/proj/sub/', '\\\\?\\C:\\Users\\Me\\Proj\\a.txt', '\\\\.\\C:\\Users\\Me\\Proj\\a.txt', '\\Users\\Me\\Proj\\a.txt', 'C:\\Users\\Me\\Proj\\a.txt. ', 'C:\\Users\\Me\\Proj.\\a.txt', 'sub\\a.txt', 'c:sub\\a.txt']) eq(write(p), 'allow', `inside the folder: ${p}`);
  for (const p of ['D:\\Users\\Me\\Proj\\a.txt', 'D:a.txt', 'C:\\Users\\Me\\Projector\\a.txt', 'C:\\Users\\Me\\Proj\\..\\Other\\a.txt', '\\\\nas\\share\\Proj\\a.txt', '\\\\?\\UNC\\nas\\share\\a.txt', '\\Windows\\win.ini', 'C:\\Users\\Me\\Proj\\..\\..\\Me\\Other']) ok(write(p) !== 'allow', `outside the folder asks: ${p}`);
  eq(read('\\Users\\Me\\Proj\\a.txt', 'D:\\work'), 'ask', '"\\x" on another current drive is that drive\'s root, not the chat\'s folder');
  eq(R.norm('\\\\nas\\share\\a\\..\\..\\..\\b'), '//nas/share/b', 'UNC: .. never climbs above the share');
  eq(R.norm('\\\\?\\UNC\\NAS\\Share\\x'), '//nas/share/x', '\\\\?\\UNC\\ is the share');
  eq(R.norm('C:\\a\\...\\b'), 'c:/a/.../b', '"..." stays a real name');
  ok(R.insideAny(R.norm('\\\\NAS\\Share\\Clips\\a.mov'), [R.norm('\\\\nas\\share\\clips\\')]), 'a folder on a share: case and trailing slash ignored');
  eq(R.norm('/home/u/proj/a.'), '/home/u/proj/a.', 'Mac / Linux names keep their dots');
}

// ---------- 10. Chrome's places on Windows ----------
{
  const env = { programfiles: 'C:\\Program Files', 'programfiles(x86)': 'C:\\Program Files (x86)', localappdata: `${HOME}\\AppData\\Local`, ProgramW6432: 'C:\\Program Files' };
  const list = C.candidates({ platform: 'win32', env, home: HOME }).map((c) => c.path);
  ok(list.includes('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') && list.includes('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe') && list.includes(`${HOME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`), 'Chrome: Program Files, Program Files (x86), LocalAppData (lower-case env keys)');
  ok(list.indexOf(`${HOME}\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe`) > list.indexOf(`${HOME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`), 'Chrome Canary only after stable Chrome');
  eq(new Set(list).size, list.length, 'no place listed twice (ProgramW6432 = ProgramFiles)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
