#!/usr/bin/env node
// (round 33, macpolish) the Mac, simulated (no Mac here): path.posix, an injected platform / env and a fake disk (files,
// symlinks, mtimes, inodes). Covers macpolish.js (finding claude / codex: Homebrew, npm's prefix and ~/.npmrc, nvm, fnm,
// asdf, mise, Volta, pnpm, Bun, the installer, the login shell's PATH, the Claude / Codex / ChatGPT apps, npm's own Codex
// program; real programs before shims; the start plan for npm scripts without node on PATH; Settings → Engines paths;
// the login shell's PATH; Gatekeeper's quarantine and its fix commands; macOS' errors in plain words; the Trash on
// network shares / read-only disks; case-insensitive disks), the engines' Mac error lines (a temp copy of engines.js),
// installs.js on Mac paths, access-rules' Mac path forms and Chrome's Mac places.
//   node dev/macpolish-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = path.posix;
const ROOT = path.join(__dirname, '..');
const M = require('../macpolish');
const R = require('../access-rules');
const C = require('../chrome-cdp');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

// ---------- a fake Mac disk: { '/x/a': 'text' | { text, mtime } } + symlinks { '/link': '/target' } ----------
function fakeFs(files, links = {}) {
  const map = new Map(Object.entries(files).map(([k, v]) => [k, { text: typeof v === 'string' ? v : v.text ?? '', mtime: v.mtime || 1 }]));
  // a link anywhere along the path is followed (a linked folder too)
  const real = (p) => {
    let s = P.normalize(String(p));
    for (let i = 0; i < 8; i++) {
      const hit = Object.keys(links).find((l) => s === l || s.startsWith(`${l}/`));
      if (!hit) break;
      s = P.join(P.resolve(P.dirname(hit), links[hit]), s.slice(hit.length));
    }
    return s;
  };
  const dirs = new Set();
  const addDirs = (f) => { let d = P.dirname(f); while (!dirs.has(d)) { dirs.add(d); if (d === '/') break; d = P.dirname(d); } };
  for (const f of [...map.keys(), ...Object.keys(links)]) addDirs(f);
  return {
    isFile: (p) => map.has(real(p)),
    isDir: (p) => dirs.has(real(p).replace(/(.)\/+$/, '$1')),
    list: (p) => { const d = real(p).replace(/\/+$/, ''); const out = new Set(); for (const f of [...map.keys(), ...Object.keys(links)]) if (f.startsWith(`${d}/`)) out.add(f.slice(d.length + 1).split('/')[0]); return [...out]; },
    read: (p, max = 4096) => (map.get(real(p))?.text || '').slice(0, max),
    mtime: (p) => map.get(real(p))?.mtime || 0,
    real,
  };
}
const HOME = '/Users/quentin';
const DOCK = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME };
const NODE_SCRIPT = '#!/usr/bin/env node\n// cli\n';
const MACHO = '\u00cf\u00fa\u00ed\u00fe\u0007\u0000\u0000\u0001binary';
const ASDF_SHIM = '#!/usr/bin/env bash\n# asdf-plugin: nodejs 22.1.0\nexec /Users/quentin/.asdf/bin/asdf exec "claude" "$@"\n';
const MISE_SHIM = '#!/bin/sh\nexec mise x -- claude "$@"\n';

// ---------- 1. where copies live ----------
{
  // Homebrew's Node: npm puts a link in /opt/homebrew/bin to the package's script
  const brew = fakeFs({ '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js': NODE_SCRIPT, '/opt/homebrew/bin/node': MACHO }, { '/opt/homebrew/bin/claude': '../lib/node_modules/@anthropic-ai/claude-code/cli.js' });
  eq(M.candidates('claude', { env: DOCK, home: HOME, fs: brew }), ['/opt/homebrew/bin/claude'], 'Homebrew npm copy found from a Dock launch (PATH without /opt/homebrew/bin)');
  eq(M.candidates('codex', { env: DOCK, home: HOME, fs: brew }), [], 'nothing of the other engine');
  // npm's prefix from the environment and from ~/.npmrc (with ~)
  const pre = fakeFs({ '/Users/quentin/.npm-custom/bin/claude': NODE_SCRIPT, '/Volumes/Tools/npm/bin/codex': NODE_SCRIPT, '/Users/quentin/.npmrc': 'registry=https://r\nprefix = ~/.npm-custom\n' });
  eq(M.candidates('claude', { env: DOCK, home: HOME, fs: pre }), ['/Users/quentin/.npm-custom/bin/claude'], 'npm prefix from ~/.npmrc (~ expanded)');
  eq(M.candidates('codex', { env: { ...DOCK, npm_config_prefix: '/Volumes/Tools/npm' }, home: HOME, fs: pre }), ['/Volumes/Tools/npm/bin/codex'], 'npm prefix from npm_config_prefix');
  // nvm: NVM_BIN first, then every version newest first (v22.10 > v22.9 > v18)
  const nvm = fakeFs({ [`${HOME}/.nvm/versions/node/v18.20.0/bin/claude`]: NODE_SCRIPT, [`${HOME}/.nvm/versions/node/v22.9.0/bin/claude`]: NODE_SCRIPT, [`${HOME}/.nvm/versions/node/v22.10.0/bin/claude`]: NODE_SCRIPT });
  eq(M.candidates('claude', { env: DOCK, home: HOME, fs: nvm }), [`${HOME}/.nvm/versions/node/v22.10.0/bin/claude`, `${HOME}/.nvm/versions/node/v22.9.0/bin/claude`, `${HOME}/.nvm/versions/node/v18.20.0/bin/claude`], 'nvm: every version, newest first (numeric, not text order)');
  eq(M.candidates('claude', { env: { ...DOCK, NVM_BIN: `${HOME}/.nvm/versions/node/v18.20.0/bin` }, home: HOME, fs: nvm })[0], `${HOME}/.nvm/versions/node/v18.20.0/bin/claude`, 'nvm: the active Node (NVM_BIN) first');
  eq(M.candidates('claude', { env: { ...DOCK, NVM_DIR: '/opt/nvm' }, home: HOME, fs: fakeFs({ '/opt/nvm/versions/node/v20.1.0/bin/claude': NODE_SCRIPT }) }), ['/opt/nvm/versions/node/v20.1.0/bin/claude'], 'nvm: NVM_DIR');
  // fnm on macOS (Application Support), its default alias first
  const fnm = fakeFs({ [`${HOME}/Library/Application Support/fnm/node-versions/v20.11.0/installation/bin/codex`]: NODE_SCRIPT, [`${HOME}/Library/Application Support/fnm/node-versions/v22.2.0/installation/bin/codex`]: NODE_SCRIPT },
    { [`${HOME}/Library/Application Support/fnm/aliases/default`]: '../node-versions/v20.11.0/installation' });
  eq(M.candidates('codex', { env: DOCK, home: HOME, fs: fnm }), [`${HOME}/Library/Application Support/fnm/aliases/default/bin/codex`, `${HOME}/Library/Application Support/fnm/node-versions/v22.2.0/installation/bin/codex`], 'fnm: the default alias, then the other versions (the same file once)');
  // asdf / mise: the real install before the shim, even when the shim folder is first on PATH
  const asdf = fakeFs({ [`${HOME}/.asdf/shims/claude`]: ASDF_SHIM, [`${HOME}/.asdf/installs/nodejs/22.1.0/bin/claude`]: NODE_SCRIPT });
  eq(M.candidates('claude', { env: { ...DOCK, PATH: `${HOME}/.asdf/shims:/usr/bin` }, home: HOME, fs: asdf }), [`${HOME}/.asdf/installs/nodejs/22.1.0/bin/claude`, `${HOME}/.asdf/shims/claude`], 'asdf: the real program before its shim');
  const mise = fakeFs({ [`${HOME}/.local/share/mise/shims/claude`]: MISE_SHIM, [`${HOME}/.local/share/mise/installs/node/22.3.0/bin/claude`]: NODE_SCRIPT });
  eq(M.candidates('claude', { env: { ...DOCK, PATH: `${HOME}/.local/share/mise/shims:/usr/bin` }, home: HOME, fs: mise }), [`${HOME}/.local/share/mise/installs/node/22.3.0/bin/claude`, `${HOME}/.local/share/mise/shims/claude`], 'mise: the real program before its shim');
  ok(M.isShim(`${HOME}/somewhere/claude`, { fs: fakeFs({ [`${HOME}/somewhere/claude`]: MISE_SHIM }) }), 'a shim is known by what it says, wherever it is');
  ok(!M.isShim(`${HOME}/.nvm/versions/node/v22.10.0/bin/claude`, { fs: nvm }), 'a Node script is not a shim');
  // Volta: its bin/ holds links to volta-shim; the package's real command is under tools/image/packages
  const volta = fakeFs({ [`${HOME}/.volta/bin/volta-shim`]: MACHO, [`${HOME}/.volta/tools/image/packages/@anthropic-ai/claude-code/bin/claude`]: NODE_SCRIPT }, { [`${HOME}/.volta/bin/claude`]: 'volta-shim' });
  eq(M.candidates('claude', { env: DOCK, home: HOME, fs: volta }), [`${HOME}/.volta/tools/image/packages/@anthropic-ai/claude-code/bin/claude`, `${HOME}/.volta/bin/claude`], 'Volta: the real command before the shim');
  // pnpm, Bun, the installer (~/.local/bin → its versions), the old local install, MacPorts
  const misc = fakeFs({ [`${HOME}/Library/pnpm/claude`]: NODE_SCRIPT, [`${HOME}/.bun/bin/codex`]: NODE_SCRIPT, [`${HOME}/.local/share/claude/versions/2.1.400`]: MACHO, [`${HOME}/.claude/local/claude`]: '#!/bin/bash\nexec node_modules/.bin/claude "$@"\n', '/opt/local/bin/codex': MACHO },
    { [`${HOME}/.local/bin/claude`]: '../share/claude/versions/2.1.400' });
  eq(M.candidates('claude', { env: DOCK, home: HOME, fs: misc }), [`${HOME}/Library/pnpm/claude`, `${HOME}/.local/bin/claude`, `${HOME}/.claude/local/claude`], 'pnpm, the installer, the old ~/.claude/local');
  eq(M.candidates('codex', { env: DOCK, home: HOME, fs: misc }), [`${HOME}/.bun/bin/codex`, '/opt/local/bin/codex'], 'Bun, MacPorts');
  eq(M.candidates('claude', { env: { ...DOCK, PNPM_HOME: '/x/pnpm', BUN_INSTALL: '/x/bun' }, home: HOME, fs: fakeFs({ '/x/pnpm/claude': NODE_SCRIPT, '/x/bun/bin/claude': NODE_SCRIPT }) }), ['/x/pnpm/claude', '/x/bun/bin/claude'], 'PNPM_HOME / BUN_INSTALL');
  // the login shell's PATH (read once): a folder only the owner's ~/.zshrc adds
  const shell = fakeFs({ '/Users/quentin/work/tools/bin/claude': MACHO });
  eq(M.candidates('claude', { env: DOCK, home: HOME, fs: shell }), [], 'not found from the Dock PATH alone');
  eq(M.candidates('claude', { env: DOCK, home: HOME, fs: shell, shellPath: '/usr/bin:/Users/quentin/work/tools/bin' }), ['/Users/quentin/work/tools/bin/claude'], 'found through the login shell\'s PATH');
  // the apps' bundled CLIs, newest first; an app's own program (Contents/MacOS) is never taken
  const apps = fakeFs({
    [`${HOME}/Library/Application Support/Claude/claude-code/2.1.300/claude`]: { text: MACHO, mtime: 5 }, [`${HOME}/Library/Application Support/Claude/claude-code/2.1.410/claude`]: { text: MACHO, mtime: 9 },
    '/Applications/Codex.app/Contents/MacOS/Codex': MACHO, '/Applications/Codex.app/Contents/MacOS/codex': MACHO, '/Applications/Codex.app/Contents/Resources/codex': MACHO, [`${HOME}/Applications/ChatGPT.app/Contents/Resources/bin/codex`]: MACHO,
  });
  eq(M.candidates('claude', { env: DOCK, home: HOME, fs: apps }), [`${HOME}/Library/Application Support/Claude/claude-code/2.1.410/claude`, `${HOME}/Library/Application Support/Claude/claude-code/2.1.300/claude`], 'the Claude app\'s claude-code, newest first');
  eq(M.candidates('codex', { env: DOCK, home: HOME, fs: apps }), ['/Applications/Codex.app/Contents/Resources/codex', `${HOME}/Applications/ChatGPT.app/Contents/Resources/bin/codex`], 'Codex.app and ~/Applications/ChatGPT.app bundled CLIs (never Contents/MacOS)');
  // npm's codex script starts its own program: that program is found too (works with no Node at all)
  const arch = process.arch === 'x64' ? 'x86_64' : 'aarch64';
  const other = arch === 'x86_64' ? 'aarch64' : 'x86_64';
  const cx = fakeFs({ '/opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js': NODE_SCRIPT, [`/opt/homebrew/lib/node_modules/@openai/codex/vendor/${arch}-apple-darwin/codex/codex`]: MACHO, [`/opt/homebrew/lib/node_modules/@openai/codex/vendor/${other}-apple-darwin/codex/codex`]: MACHO },
    { '/opt/homebrew/bin/codex': '../lib/node_modules/@openai/codex/bin/codex.js' });
  eq(M.candidates('codex', { env: DOCK, home: HOME, fs: cx }), ['/opt/homebrew/bin/codex', `/opt/homebrew/lib/node_modules/@openai/codex/vendor/${arch}-apple-darwin/codex/codex`], 'npm Codex: the script, then its own program for this Mac\'s chip');
  // one entry per real file (a link on PATH and Homebrew's bin to the same program)
  const dup = fakeFs({ '/opt/homebrew/Caskroom/claude-code/2.1.400/claude': MACHO }, { '/opt/homebrew/bin/claude': '../Caskroom/claude-code/2.1.400/claude', '/usr/local/bin/claude': '/opt/homebrew/Caskroom/claude-code/2.1.400/claude' });
  eq(M.candidates('claude', { env: { ...DOCK, PATH: '/usr/local/bin:/usr/bin' }, home: HOME, fs: dup }), ['/usr/local/bin/claude'], 'the same program reached two ways is one copy');
  eq(M.candidates('claude', { env: {}, home: '', fs: fakeFs({}) }), [], 'an empty environment finds nothing and doesn\'t throw');
  ok(/nvm/.test(M.lookedIn()) && /asdf/.test(M.lookedIn()) && /Codex/.test(M.lookedIn()), '"not found" names where Hearth looked');
}

// ---------- 2. labels for /doctor ----------
{
  const f = fakeFs({}, { '/opt/homebrew/bin/claude': '../lib/node_modules/@anthropic-ai/claude-code/cli.js' });
  const w = (p) => M.whereOf(p, { home: HOME, fs: f });
  eq(w(`${HOME}/.nvm/versions/node/v22.1.0/bin/claude`), 'nvm', 'label: nvm');
  eq(w(`${HOME}/Library/Application Support/fnm/node-versions/v22/installation/bin/claude`), 'fnm', 'label: fnm');
  eq(w(`${HOME}/.asdf/installs/nodejs/22.1.0/bin/claude`), 'asdf', 'label: asdf');
  eq(w(`${HOME}/.local/share/mise/shims/claude`), 'mise', 'label: mise');
  eq(w(`${HOME}/.volta/bin/claude`), 'Volta', 'label: Volta');
  eq(w(`${HOME}/Library/pnpm/claude`), 'pnpm', 'label: pnpm');
  eq(w(`${HOME}/.bun/bin/codex`), 'Bun', 'label: Bun');
  eq(w('/opt/homebrew/bin/claude'), 'Homebrew', 'label: Homebrew (its npm)');
  eq(w(`${HOME}/.local/bin/claude`), 'installer', 'label: the installer');
  eq(w('/Applications/Codex.app/Contents/Resources/codex'), 'Codex app', 'label: Codex app');
  eq(w(`${HOME}/Applications/ChatGPT.app/Contents/Resources/codex`), 'ChatGPT app', 'label: ChatGPT app');
  eq(w(`${HOME}/Library/Application Support/Claude/claude-code/2.1.4/claude`), 'Claude app', 'label: Claude app');
  eq(w(`${HOME}/.npm-global/bin/claude`), 'npm', 'label: npm');
  eq(w('/opt/local/bin/codex'), 'MacPorts', 'label: MacPorts');
}

// ---------- 3. starting an npm script without node on PATH ----------
{
  const files = { '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js': NODE_SCRIPT, '/opt/homebrew/bin/node': MACHO };
  const links = { '/opt/homebrew/bin/claude': '../lib/node_modules/@anthropic-ai/claude-code/cli.js' };
  const o = (fs0, env = DOCK) => ({ platform: 'darwin', env, home: HOME, fs: fs0, execPath: '/Applications/Hearth.app/Contents/MacOS/Electron' });
  let p = M.plan('/opt/homebrew/bin/claude', ['-p', 'hi\n"there"'], o(fakeFs(files, links)));
  eq([p.via, p.command, p.args], ['node', '/opt/homebrew/bin/node', ['/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js', '-p', 'hi\n"there"']], 'npm script: the Node next to it runs it (arguments untouched)');
  p = M.plan('/opt/homebrew/bin/claude', ['x'], o(fakeFs({ '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js': NODE_SCRIPT, '/usr/local/bin/node': MACHO }, links), { PATH: '/usr/local/bin:/usr/bin' }));
  eq(p.via, 'direct', 'npm script with node on PATH: started as it always was');
  p = M.plan('/opt/homebrew/bin/claude', ['x'], o(fakeFs({ '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js': NODE_SCRIPT, [`${HOME}/.nvm/versions/node/v22.1.0/bin/node`]: MACHO }, links)));
  eq([p.via, p.command], ['node', `${HOME}/.nvm/versions/node/v22.1.0/bin/node`], 'no node on PATH: a Node found in the usual places (nvm)');
  p = M.plan('/opt/homebrew/bin/claude', ['x'], o(fakeFs({ '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js': NODE_SCRIPT }, links)));
  ok(p.electron && p.command === '/Applications/Hearth.app/Contents/MacOS/Electron' && p.extraEnv.ELECTRON_RUN_AS_NODE === '1' && p.args[0].endsWith('cli.js'), 'no Node anywhere: Hearth\'s own Electron runs it as Node');
  p = M.plan('/x/claude', [], o(fakeFs({ '/x/claude': '#!/usr/bin/env -S node --no-warnings\n', '/x/node': MACHO })));
  eq(p.via, 'node', '#!/usr/bin/env -S node … is a Node script too');
  eq(M.plan('/x/claude', [], o(fakeFs({ '/x/claude': MACHO }))).via, 'direct', 'a program (Mach-O): direct');
  eq(M.plan('/x/claude', [], o(fakeFs({ '/x/claude': ASDF_SHIM }))).via, 'direct', 'a shell script: direct');
  eq(M.plan('/x/claude', [], o(fakeFs({ '/x/claude': '#!/opt/homebrew/bin/node\n', '/opt/homebrew/bin/node': MACHO }))).via, 'direct', 'a fixed #!/…/node that exists: direct');
  eq(M.plan('/opt/homebrew/bin/claude', ['x'], { ...o(fakeFs(files, links)), platform: 'linux' }).via, 'direct', 'Linux: unchanged');
  eq(M.plan('/opt/homebrew/bin/claude', ['x'], { ...o(fakeFs(files, links)), platform: 'win32' }).via, 'direct', 'Windows: unchanged (winpolish plans those)');
}

// ---------- 4. a path pasted in Settings → Engines ----------
{
  const f = fakeFs({ '/Users/quentin/My Tools/claude': MACHO, '/Users/quentin/node/bin/codex': NODE_SCRIPT, '/Applications/Codex.app/Contents/Resources/codex': MACHO, '/Applications/Codex.app/Contents/MacOS/Codex': MACHO });
  const c = (p, engine = 'claude') => M.cleanPath(p, { platform: 'darwin', home: HOME, fs: f, engine });
  eq(c('"/Users/quentin/My Tools/claude"'), '/Users/quentin/My Tools/claude', 'quotes');
  eq(c('/Users/quentin/My\\ Tools/claude'), '/Users/quentin/My Tools/claude', 'a path dragged into Terminal (backslash-escaped spaces)');
  eq(c('~/My Tools/claude'), '/Users/quentin/My Tools/claude', '~');
  eq(c('~/My Tools/'), '/Users/quentin/My Tools/claude', 'a folder → the program in it');
  eq(c('~/node', 'codex'), '/Users/quentin/node/bin/codex', 'a folder → the program in its bin/');
  eq(c('/Applications/Codex.app', 'codex'), '/Applications/Codex.app/Contents/Resources/codex', 'an .app → the CLI it bundles (not the app itself)');
  eq(M.cleanPath('"C:\\x\\claude.cmd"', { platform: 'win32' }), 'C:\\x\\claude.cmd', 'Windows: only the quotes (winpolish cleans the rest)');
}

// ---------- 5. the login shell's PATH ----------
{
  eq(M.shellCommand('/bin/zsh'), ['/bin/zsh', ['-ilc', "printf '__HEARTH_PATH__%s__HEARTH_PATH__' \"$PATH\""]], 'zsh / bash: printf the PATH between markers');
  ok(/string join : \$PATH/.test(M.shellCommand('/opt/homebrew/bin/fish')[1][1]), 'fish: its PATH list joined with :');
  eq(M.parseShellOutput('Last login: …\n🎉 welcome\n__HEARTH_PATH__/opt/homebrew/bin:/usr/bin__HEARTH_PATH__\nbye'), '/opt/homebrew/bin:/usr/bin', 'what an rc file prints around it is ignored');
  eq(M.parseShellOutput('nothing'), null, 'no markers → nothing');
  const exists = (d) => !/missing/.test(d);
  eq(M.mergePath('/usr/bin:/bin', '/opt/homebrew/bin:/usr/bin:/x/missing:relative:/Users/q/.asdf/shims', { exists }), '/usr/bin:/bin:/opt/homebrew/bin:/Users/q/.asdf/shims', 'merge: added at the end, no repeats, only existing absolute folders');
  let asked = null;
  const run = (cmd, args, opts, cb) => { asked = { cmd, args, opts }; setImmediate(() => cb(null, '__HEARTH_PATH__/a:/b__HEARTH_PATH__')); return { stdin: { end() {} } }; };
  M.shellPath({ shell: '/bin/zsh', run }).then((p) => {
    eq(p, '/a:/b', 'shellPath reads the login shell\'s answer');
    ok(asked && asked.cmd === '/bin/zsh' && asked.opts.timeout > 0 && asked.opts.killSignal === 'SIGKILL', 'shellPath: the shell itself (no string to a shell), with a timeout');
  }).then(() => M.shellPath({ shell: 'zsh; rm -rf ~', run: () => { throw new Error('ran'); } })).then((p) => eq(p, null, 'a strange $SHELL is never run'))
    .then(async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macpolish-'));
      const cache = path.join(dir, 'shell-path.json');
      const before = process.env.PATH;
      const r = await M.adoptShellPath({ platform: 'darwin', cacheFile: cache, probe: async () => `${dir}:/definitely/missing` });
      ok(process.env.PATH === `${before}:${dir}` && r === dir, 'adoptShellPath: the shell\'s folders added at the end of this process\'s PATH (existing only)');
      ok(JSON.parse(fs.readFileSync(cache, 'utf8')).path === `${dir}:/definitely/missing`, 'adoptShellPath: remembered for the next start');
      ok(M.shellDirs.includes(dir), 'the shell\'s folders are offered to the engine search');
      process.env.PATH = before;
      eq(await M.adoptShellPath({ platform: 'linux', cacheFile: cache, probe: async () => '/x' }), null, 'Linux / Windows: nothing');
      ok(process.env.PATH === before, '…and PATH untouched');
      fs.rmSync(dir, { recursive: true, force: true });
    }).catch((e) => ok(false, `shell PATH: ${e.message}`));
}

// ---------- 6. Gatekeeper ----------
{
  const f = fakeFs({ '/Users/quentin/Downloads/claude': MACHO, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome': MACHO, "/Users/quentin/it's/codex": MACHO });
  const xa = (map) => (p) => map[p] || null;
  eq(M.quarantine('/Users/quentin/Downloads/claude', { fs: f, xattr: xa({ '/Users/quentin/Downloads/claude': '0081;65a1b2c3;Safari;ABC' }) }).approved, false, 'quarantine flag 0081: not approved yet');
  eq(M.quarantine('/Users/quentin/Downloads/claude', { fs: f, xattr: xa({ '/Users/quentin/Downloads/claude': '00c1;65a1b2c3;Safari;ABC' }) }).approved, true, 'flag 0x40 set: approved (opened once)');
  eq(M.quarantine('/Users/quentin/Downloads/claude', { fs: f, xattr: xa({}) }), null, 'no quarantine mark');
  const q = M.quarantine('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', { fs: f, xattr: xa({ '/Applications/Google Chrome.app': '0083;1;Chrome;X' }) });
  ok(q && q.bundle && q.target === '/Applications/Google Chrome.app', 'a program inside an .app: the bundle carries the mark');
  let p = M.fixPlan('unquarantine', '/Users/quentin/Downloads/claude', { fs: f });
  eq([p.file, p.args, p.command], ['/usr/bin/xattr', ['-d', 'com.apple.quarantine', '/Users/quentin/Downloads/claude'], "xattr -d com.apple.quarantine '/Users/quentin/Downloads/claude'"], 'the exact command for a program');
  p = M.fixPlan('unquarantine', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', { fs: f });
  eq([p.args, p.command], [['-dr', 'com.apple.quarantine', '/Applications/Google Chrome.app'], "xattr -dr com.apple.quarantine '/Applications/Google Chrome.app'"], 'the exact command for an app (the whole bundle)');
  eq(M.fixPlan('unquarantine', "/Users/quentin/it's/codex", { fs: f }).command, "xattr -d com.apple.quarantine '/Users/quentin/it'\\''s/codex'", 'a quote in the folder name is shown safely');
  eq(M.fixPlan('chmod', '/Users/quentin/Downloads/claude', { fs: f }).command, "chmod u+x '/Users/quentin/Downloads/claude'", 'chmod: only that one file, only for you');
  eq(M.fixPlan('clt').command, 'xcode-select --install', 'Apple\'s Command Line Tools: Apple\'s own installer');
  eq(M.fixPlan('privacy').url, M.PRIVACY_URL, 'privacy: the Full Disk Access pane');
  eq(M.fixPlan('rm', '/x'), null, 'no other action exists');
  eq(M.fixPlan('unquarantine', ''), null, 'no program, no command');
  ok(['unquarantine', 'chmod', 'clt', 'privacy'].every((a) => !/sudo|password/i.test(JSON.stringify(M.fixPlan(a, '/x', { fs: f })))), 'never sudo, never a password');
  const runs = [];
  const fakeRun = (result) => (file, args, opts, cb) => { runs.push({ file, args }); setImmediate(() => cb(result.err || null, '', result.stderr || '')); };
  (async () => {
    let r = await M.runFix(M.fixPlan('unquarantine', '/Users/quentin/Downloads/claude', { fs: f }), { run: fakeRun({}) });
    ok(r.ok && runs.at(-1).file === '/usr/bin/xattr' && runs.at(-1).args.at(-1) === '/Users/quentin/Downloads/claude', 'runFix runs xattr itself (no shell)');
    r = await M.runFix(M.fixPlan('unquarantine', '/Users/quentin/Downloads/claude', { fs: f }), { run: fakeRun({ err: new Error('exit 1'), stderr: 'xattr: /x: No such xattr: com.apple.quarantine' }) });
    ok(r.ok && r.already, 'already allowed: fine');
    r = await M.runFix(M.fixPlan('unquarantine', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', { fs: f }), { run: fakeRun({ err: new Error('exit 1'), stderr: 'xattr: [Errno 13] Permission denied' }) });
    ok(!r.ok && /never uses an administrator password/.test(r.error) && !/sudo/.test(r.error) && r.command, 'owned by another user: a plain no, the command to copy, never sudo');
    r = await M.runFix({ file: '/bin/rm', args: ['-rf', '/'] }, { run: fakeRun({}) });
    ok(!r.ok && runs.every((x) => x.file !== '/bin/rm'), 'runFix refuses anything but its own commands');
    let opened = null;
    r = await M.runFix(M.fixPlan('privacy'), { openExternal: (u) => { opened = u; } });
    ok(r.ok && opened === M.PRIVACY_URL, 'privacy: opens System Settings at Full Disk Access');
  })().catch((e) => ok(false, `runFix: ${e.message}`));
}

// ---------- 7. macOS' errors in plain words ----------
{
  const f = fakeFs({ '/Users/quentin/Downloads/claude': MACHO });
  const unapproved = () => '0081;1;Safari;X';
  const none = () => null;
  const pe = (text, o = {}) => M.plainError(text, { fs: f, xattr: none, ...o });
  const cases = [
    ['“claude” cannot be opened because the developer cannot be verified.', 'unquarantine'],
    ['“codex” is damaged and can’t be opened. You should move it to the Trash.', 'unquarantine'],
    ['Apple could not verify “claude” is free of malware', 'unquarantine'],
    ['zsh: bad CPU type in executable: claude', 'install'],
    ['spawn Unknown system error -86', 'install'],
    ['env: node: No such file or directory', 'install'],
    ["Error: Cannot find module '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js'", 'update'],
    ["SyntaxError: Unexpected token '?'", 'install'],
    ['dyld[123]: Library not loaded: @rpath/libc++.1.dylib', 'install'],
    ['xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), missing xcrun', 'clt'],
    ['Error: EPERM: operation not permitted, scandir \'/Users/quentin/Desktop\'', 'privacy'],
    ['ls: /Users/quentin/Library/Mobile Documents/com~apple~CloudDocs: Operation not permitted', 'privacy'],
    ['spawn /x/claude ENOENT', 'doctor'],
  ];
  for (const [text, action] of cases) { const r = pe(text, { bin: '/Users/quentin/Downloads/claude' }); ok(r && r.action === action && r.text && r.fix && !/\bat \S+:\d+/.test(r.text), `plain error for ${JSON.stringify(text.slice(0, 48))} → ${action}${r ? '' : ' (none)'}`); }
  let r = pe('Claude Code was stopped by macOS as it started (killed: 9).', { bin: '/Users/quentin/Downloads/claude', xattr: unapproved });
  ok(r.action === 'unquarantine' && /Gatekeeper/.test(r.text) && /xattr -d com\.apple\.quarantine '\/Users\/quentin\/Downloads\/claude'/.test(r.fix), 'killed at start + an unapproved mark → Gatekeeper, the exact command shown');
  r = pe('', { bin: '/Users/quentin/Downloads/claude', signal: 'SIGKILL', xattr: none });
  eq(r.action, 'install', 'killed at start, no mark → a damaged copy: Install');
  r = pe('', { bin: '/Users/quentin/Downloads/claude', signal: 'SIGKILL', xattr: () => '00c1;1;Safari;X' });
  eq(r.action, 'install', 'killed at start, mark approved → not Gatekeeper');
  r = pe("Couldn't start Claude Code (EACCES).", { bin: '/Users/quentin/Downloads/claude' });
  ok(r.action === 'chmod' && /chmod u\+x/.test(r.command), 'not executable → Make runnable (chmod u+x on that file)');
  eq(pe("Couldn't start Claude Code (EACCES).").action, 'doctor', 'no copy known → /doctor instead of chmod');
  eq(pe('Operation not permitted'), null, 'Operation not permitted outside the guarded folders isn\'t called a privacy problem (Astra\'s sandbox says it too)');
  eq(pe('rate limit reached'), null, 'other errors are left to the engines\' own fixes');
}

// ---------- 8. the Trash ----------
{
  const MOUNT = '/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)\n/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled, nobrowse, protect)\n//quentin@nas._smb._tcp.local/Media on /Volumes/Media (smbfs, nodev, nosuid, mounted by quentin)\n/dev/disk5s1 on /Volumes/USB STICK (msdos, local, nodev, nosuid, noowners, noatime, fskit)\n/dev/disk6s1 on /Volumes/Installer (hfs, local, nodev, nosuid, read-only, noowners, quarantine, mounted by quentin)\nnas:/export on /Volumes/nfs (nfs, nodev, nosuid)';
  const mounts = () => M.parseMounts(MOUNT);
  eq(mounts().find((m) => m.on === '/Volumes/USB STICK').type, 'msdos', 'mount lines parsed (names with spaces)');
  const tc = (p) => M.trashCheck(p, { platform: 'darwin', mounts, home: HOME });
  ok(tc(`${HOME}/Proj/a.txt`).ok, 'the Mac\'s own disk: the Trash');
  ok(tc(`${HOME}/Library/Mobile Documents/com~apple~CloudDocs/Proj/a b.txt`).ok, 'iCloud Drive (spaces in the path): the Trash (Recently Deleted)');
  ok(tc('/Volumes/USB STICK/clip.mov').ok, 'a USB stick: the Trash (.Trashes)');
  for (const [p, reason] of [['/Volumes/Media/clip.mov', 'network'], ['/Volumes/nfs/a', 'network'], ['/Volumes/Installer/a.pkg', 'readonly']]) {
    const r = tc(p);
    ok(!r.ok && r.reason === reason && !/Error|at /.test(r.error) && /(nothing was lost|Nothing was deleted)/.test(r.error), `no Trash (${reason}) → left alone with a plain reason: ${p}`);
  }
  eq(tc('/').reason, 'root', 'a whole disk never');
  eq(tc('/Volumes/Media').reason, 'root', 'a whole external disk never');
  eq(tc(HOME).reason, 'root', 'the home folder never');
  eq(tc('~/Proj/a.txt'), { ok: true, path: `${HOME}/Proj/a.txt` }, '~ expanded');
  eq(tc('Proj/a.txt').reason, 'relative', 'a relative path never');
  eq(M.trashCheck('C:\\a.txt', { platform: 'win32' }), { ok: true, path: 'C:\\a.txt' }, 'Windows: left to winpolish');
  const errs = { 'ENOENT: no such file': 'already gone', 'Failed to move item to trash: The volume is read only (NSFileWriteVolumeReadOnly)': 'read-only', 'Operation not permitted': 'Full Disk Access', 'Failed to move item to trash': 'Nothing was deleted' };
  for (const [e, want] of Object.entries(errs)) { const t = M.trashError(new Error(e), '/x/a.txt'); ok(t.includes(want) && t.includes('a.txt'), `trash error in plain words: ${e} → ${t}`); }
}

// ---------- 9. case-insensitive disks ----------
{
  // a fake stat: the boot disk ignores case (one inode per lower-cased path), /Volumes/Code cares about case
  const files = ['/Users/quentin', '/Applications', '/Volumes/Code', '/Volumes/Code/Src', '/Volumes/Photos', '/Volumes/Photos/DCIM'];
  const ci = (p) => !p.startsWith('/Volumes/Code');
  const key = (p) => (ci(p) ? p.toLowerCase() : p);
  const ino = new Map(files.map((f, i) => [key(f), i + 1]));
  const fsx = {
    statSync: (p) => { const i = ino.get(key(p)); if (!i) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return { ino: i, dev: 1 }; },
    readdirSync: (p) => (p === '/Volumes' ? ['Macintosh HD', 'Code', 'Photos'] : p === '/Volumes/Code' ? ['Src'] : p === '/Volumes/Photos' ? ['DCIM'] : []),
    realpathSync: (p) => (p === '/Volumes/Macintosh HD' ? '/' : p),
  };
  eq(M.caseless('/Users/quentin', { fs: fsx }), true, 'the boot disk ignores case');
  eq(M.caseless('/Volumes/Code/Src', { fs: fsx }), false, 'a case-sensitive APFS disk cares');
  eq(M.caseless('/nope', { fs: fsx }), null, 'unknown when the folder isn\'t there');
  eq(M.volumeInfo({ platform: 'darwin', fs: fsx, home: HOME }), { caseless: { '/': true, '/Volumes/Code': false, '/Volumes/Photos': true }, boot: 'Macintosh HD' }, 'volumeInfo: each disk measured, the boot disk named');
  eq(M.volumeInfo({ platform: 'linux' }), null, 'off the Mac: nothing');
}

// ---------- 10. the chats' folders on a Mac ----------
{
  const folders = ['/Users/quentin/Proj', '/var/folders/xy/T/hearth', '/tmp/work', `${HOME}/Library/Mobile Documents/com~apple~CloudDocs/Clips`, '/Volumes/Code/Src', '/Volumes/Photos/DCIM', '/Users/quentin/Músic'.normalize('NFD')];
  const mac = { caseless: { '/': true, '/Volumes/Code': false, '/Volumes/Photos': true }, boot: 'Macintosh HD' };
  const v = (o) => R.classify({ level: 'full', folders, cwd: '/Users/quentin/Proj', home: HOME, ...o }).verdict;
  const read = (file, extra = {}) => v({ tool: 'Read', input: { file_path: file }, mac, ...extra });
  const bash = (command, extra = {}) => v({ tool: 'Bash', input: { command }, mac, ...extra });
  for (const p of ['/Users/quentin/proj/a.txt', '/USERS/QUENTIN/PROJ/a.txt', '/private/var/folders/xy/T/hearth/x.png', '/private/tmp/work/a', '/Volumes/Macintosh HD/Users/quentin/Proj/a.txt', '~/Proj/a.txt', `${HOME}/Library/Mobile Documents/com~apple~CloudDocs/Clips/take 1.mov`, '/Volumes/Photos/dcim/IMG_1.JPG', '/Users/quentin/Músic/a.wav'.normalize('NFC')]) eq(read(p), 'allow', `inside the folder: ${p}`);
  for (const p of ['/Volumes/Code/src/a.js', '/Users/quentin/Projector/a.txt', '/private/etc/hosts', '/Volumes/Other/Proj/a.txt', '/Users/quentin/Proj/../Other/a']) ok(read(p) !== 'allow', `outside the folder asks: ${p}`);
  eq(read('/Volumes/Code/Src/a.js'), 'allow', 'a case-sensitive disk: the exact case is inside');
  eq(read('/users/quentin/proj/a.txt', { mac: { caseless: { '/': false } } }), 'ask', 'a case-sensitive boot disk (measured): other case asks');
  eq(read('/Users/quentin/proj/a.txt', { mac: null }), 'allow', 'no disk info yet: the boot disk is taken as APFS\' default (case-insensitive)');
  eq(read('/Volumes/Photos/dcim/a.jpg', { mac: null }), 'ask', 'no disk info yet: an external disk compares exactly (only asks)');
  eq(bash('cat ~/Library/Mobile\\ Documents/com~apple~CloudDocs/Clips/take\\ 1.mov | wc -c'), 'allow', 'iCloud Drive path with escaped spaces and ~ inside a name');
  eq(bash('cat "$HOME/proj/notes.md"'), 'allow', '$HOME expands to the home folder');
  eq(bash('cp /Users/quentin/Proj/a.txt /private/tmp/work/b.txt'), 'allow', 'cp into /private/tmp = /tmp');
  eq(R.classify({ tool: 'Read', input: { file_path: '/home/u/Proj/a' }, level: 'read', folders: ['/home/u/proj'], home: '/home/u' }).verdict, 'ask', 'Linux: case still matters');
  R.classify({ tool: 'Read', input: { file_path: '/x' }, level: 'read', home: HOME });
  eq(R.norm('/private/var/x'), '/var/x', '/private/var is /var on a Mac');
}

// ---------- 11. through engines.js and installs.js (a temp copy, like the other engine tests) ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macpolish-eng-'));
  for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'installs.js', 'winpolish.js', 'macpolish.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
  const T = require(path.join(dir, 'engines.js'))._test;
  const fe = (m, o = {}) => T.friendlyError('claude', m, { win: false, mac: true, bin: '', ...o });
  let r = fe('env: node: No such file or directory');
  ok(r.fixAction === 'install' && /Node\.js/.test(r.message) && /Fix: /.test(r.message) && /\(env: node/.test(r.message), 'engines: npm without Node on a Mac → Install button, plain words, raw line underneath');
  r = fe('“claude” cannot be opened because the developer cannot be verified.');
  ok(r.fixAction === 'unquarantine' && /Gatekeeper/.test(r.message) && r.fixEngine === 'claude', 'engines: Gatekeeper → Allow button');
  r = fe('zsh: bad CPU type in executable');
  eq(r.fixAction, 'install', 'engines: another kind of Mac → Install');
  r = fe('No such tool available: Bash');
  ok(!/Gatekeeper|Node\.js/.test(r.message), 'engines: the policy note keeps its own words on a Mac');
  r = fe('Codex sandbox: Operation not permitted /Users/q/Desktop/a');
  ok(!/privacy protection/.test(r.message), 'engines: a sandbox refusal isn\'t called a privacy problem');
  r = fe('env: node: No such file or directory', { mac: false });
  ok(!/Hearth couldn't find/.test(r.message), 'engines: off the Mac the Mac words aren\'t used');
  r = fe('Not logged in · Please run /login');
  ok(r.needsLogin, 'engines: sign-in still wins');
  const I = T.Installs;
  eq(I.kindOf('claude', `${HOME}/.asdf/installs/nodejs/22.1.0/bin/claude`), 'npm', 'kind: asdf\'s Node → npm');
  eq(I.kindOf('claude', `${HOME}/.local/share/mise/installs/node/22.3.0/bin/claude`), 'npm', 'kind: mise\'s Node → npm');
  eq(I.kindOf('claude', `${HOME}/Library/Application Support/fnm/node-versions/v22/installation/bin/claude`), 'npm', 'kind: fnm\'s Node → npm');
  eq(I.kindOf('codex', '/home/x/.nvm/versions/node/v22.0.0/bin/codex'), 'npm', 'kind: nvm → npm (unchanged)');
  // an nvm copy updates with the npm of its own Node
  const nd = fs.mkdtempSync(path.join(os.tmpdir(), 'macpolish-nvm-'));
  const bin = path.join(nd, '.nvm', 'versions', 'node', 'v22.1.0', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const n of ['claude', 'npm', 'node']) fs.writeFileSync(path.join(bin, n), '#!/bin/sh\n');
  ok(new RegExp(`^PATH='${bin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':"\\$PATH" '.*/npm' i -g @anthropic-ai/claude-code@latest$`).test(I.updatePlan('claude', path.join(bin, 'claude')).command), 'nvm copy: Update runs the npm next to it (its own Node first on PATH)');
  eq(I.updatePlan('claude', '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js').command, 'npm i -g @anthropic-ai/claude-code@latest', 'no npm next to it: plain npm (unchanged)');
  fs.rmSync(nd, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- 12. Chrome's places on a Mac ----------
{
  const list = C.candidates({ platform: 'darwin', env: {}, home: HOME }).map((c) => c.path);
  ok(list[0] === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' && list.includes(`${HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`), 'Chrome: /Applications first, then ~/Applications');
  for (const ch of ['Google Chrome Beta', 'Google Chrome Dev', 'Google Chrome Canary']) ok(list.includes(`/Applications/${ch}.app/Contents/MacOS/${ch}`) && list.indexOf(`/Applications/${ch}.app/Contents/MacOS/${ch}`) > list.indexOf('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), `Chrome: ${ch}, after stable Chrome`);
  ok(list.includes('/Applications/Chromium.app/Contents/MacOS/Chromium'), 'Chromium');
  eq(new Set(list).size, list.length, 'no place listed twice');
  C.find({ platform: 'darwin', env: {}, home: HOME, exists: (p) => p === '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary' }).then((f) => ok(f && f.kind === 'chrome' && /Canary/.test(f.path), 'only Canary installed: Canary is used'));
}

setTimeout(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 300);
