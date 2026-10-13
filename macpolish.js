// (round 33, macpolish) The Mac, solid (the twin of winpolish.js): finding Claude Code / Codex however Mac people install
// them, starting npm copies when a Dock launch has no `node` on PATH, Gatekeeper's quarantine said in one sentence with a
// fix that runs only after a click, the Trash only where the Mac really has one, and plain words for what macOS says when
// something fails. Main process only (plain Node, no Electron): engines.js, installs.js, fsapi.js and chromemain.js use
// it; dev/macpolish-test.js runs every part with path.posix and an injected platform / env / fake disk, so it is tested
// here without a Mac.
//   candidates(engine, { env, home, fs, shellPath }) → every copy (PATH, the login shell's PATH, Homebrew, npm's prefix
//                                              and ~/.npmrc, nvm, fnm, asdf, mise, Volta, pnpm, Bun, the installer's
//                                              ~/.local/bin and ~/.claude/local, the Claude / Codex / ChatGPT apps'
//                                              bundled CLIs, npm's own Codex program), real programs before version-
//                                              manager shims, one entry per real file
//   whereOf(file, { home, fs })               → 'nvm' | 'fnm' | 'asdf' | 'mise' | 'Volta' | 'Homebrew' | … (for /doctor)
//   plan(bin, args, { platform, env, fs })    → how to start it: an npm script (`#!/usr/bin/env node`) runs with the
//                                              Node it was installed with (or one Hearth finds, or Hearth's own Electron
//                                              as Node) when PATH has none: no more "env: node: No such file"
//   spawn(bin, args, opts)                    → child_process.spawn through plan() (elsewhere: spawn as it was)
//   cleanPath(p, { home, fs, engine })        → a path pasted in Settings → Engines: quotes, `\ `, ~, a folder, an .app
//   shellPath() / adoptShellPath()            → the login shell's PATH (a Dock launch doesn't get it), added at the END
//   quarantine(file) / fixPlan(action, file)  → Gatekeeper: the quarantine mark (unapproved?) and the exact command that
//                                              lifts it (xattr, no password); runFix() runs it only when asked (a click)
//   plainError(text, { bin, signal })         → one calm sentence + the button that fixes it, for macOS' own error texts
//   trashCheck(p, { platform, mounts })       → network shares and read-only disks have no Trash: the file stays, said why
//   caseless(dir) / volumeInfo()              → is this disk case-insensitive (APFS default) — for the chats' folder checks
const MacPolish = (() => {
  const cp = require('child_process');
  const nodeFs = require('fs');
  const os = require('os');
  const P = require('path').posix;

  const PKG = { claude: '@anthropic-ai/claude-code', codex: '@openai/codex' };
  const unquote = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
  const tilde = (s, home) => (home ? String(s).replace(/^~(?=\/|$)/, home).replace(/^\$\{?HOME\}?(?=\/|$)/, home) : String(s));

  // small fs facade (tests pass a fake one)
  const realFs = {
    isFile: (p) => { try { return nodeFs.statSync(p).isFile(); } catch { return false; } },
    isDir: (p) => { try { return nodeFs.statSync(p).isDirectory(); } catch { return false; } },
    list: (p) => { try { return nodeFs.readdirSync(p); } catch { return []; } },
    read: (p, max = 4096) => { try { const fd = nodeFs.openSync(p, 'r'); try { const b = Buffer.alloc(max); const n = nodeFs.readSync(fd, b, 0, max, 0); return b.slice(0, n).toString('utf8'); } finally { nodeFs.closeSync(fd); } } catch { return ''; } },
    mtime: (p) => { try { return nodeFs.statSync(p).mtimeMs; } catch { return 0; } },
    real: (p) => { try { return nodeFs.realpathSync(p); } catch { return p; } },
  };
  function byVersionDesc(a, b) {
    const pa = String(a).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0); const pb = String(b).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
    return 0;
  }
  const versions = (dir, fs) => fs.list(dir).filter((n) => /^v?\d+(\.\d+)*/.test(n)).sort(byVersionDesc);

  // ---------- where copies live on a Mac ----------
  // The folders an install puts its commands in, best first: { dir, via, shim }. A version manager's shim (asdf / mise
  // shims, Volta's bin) only works with that manager on PATH and its config around: the real program behind it is listed
  // first (its installs folder), the shim after.
  function binDirs({ env = process.env, home = os.homedir(), fs = realFs, shellPath = '' } = {}) {
    const out = [];
    const add = (d, via, shim = false) => { if (d) out.push({ dir: P.normalize(tilde(unquote(d), home)).replace(/(.)\/+$/, '$1'), via, shim }); };
    const SHIM_DIR = /\/\.asdf\/shims$|\/mise\/shims$|\/\.volta\/bin$|\/\.nodenv\/shims$|\/\.nodebrew\/current\/bin$/;
    for (const d of String(env.PATH || '').split(':')) if (d.trim() && d.startsWith('/')) add(d, 'PATH', SHIM_DIR.test(d));
    for (const d of String(shellPath || '').split(':')) if (d.trim() && d.startsWith('/')) add(d, 'your shell\'s PATH', SHIM_DIR.test(d));
    add('/opt/homebrew/bin', 'Homebrew'); add('/usr/local/bin', 'Homebrew');
    // npm: the prefix named by the environment or ~/.npmrc (its commands in prefix/bin), the usual ~/.npm-global
    const pre = env.npm_config_prefix || env.NPM_CONFIG_PREFIX;
    if (pre) add(P.join(tilde(pre, home), 'bin'), 'npm');
    if (home) {
      const m = /^\s*prefix\s*=\s*(.+?)\s*$/m.exec(fs.read(P.join(home, '.npmrc')) || '');
      if (m) add(P.join(tilde(unquote(m[1]), home), 'bin'), 'npm');
      add(P.join(home, '.npm-global', 'bin'), 'npm'); add(P.join(home, '.npm-packages', 'bin'), 'npm');
    }
    // nvm: the active Node (NVM_BIN) then every installed version, newest first
    if (env.NVM_BIN) add(env.NVM_BIN, 'nvm');
    const nvm = env.NVM_DIR || (home && P.join(home, '.nvm'));
    if (nvm) for (const v of versions(P.join(nvm, 'versions', 'node'), fs)) add(P.join(nvm, 'versions', 'node', v, 'bin'), 'nvm');
    // fnm: its default alias, then every version (macOS keeps them in Application Support; XDG / ~/.fnm elsewhere)
    const fnmRoots = [env.FNM_DIR, home && P.join(home, 'Library', 'Application Support', 'fnm'), home && P.join(home, '.local', 'share', 'fnm'), home && P.join(home, '.fnm')].filter(Boolean);
    for (const r of fnmRoots) {
      if (!fs.isDir(r)) continue;
      add(P.join(r, 'aliases', 'default', 'bin'), 'fnm');
      for (const v of versions(P.join(r, 'node-versions'), fs)) add(P.join(r, 'node-versions', v, 'installation', 'bin'), 'fnm');
    }
    // asdf and mise: the real Node installs first, their shims after
    const asdf = env.ASDF_DATA_DIR || (home && P.join(home, '.asdf'));
    if (asdf) for (const v of versions(P.join(asdf, 'installs', 'nodejs'), fs)) add(P.join(asdf, 'installs', 'nodejs', v, 'bin'), 'asdf');
    const mise = env.MISE_DATA_DIR || (env.XDG_DATA_HOME ? P.join(env.XDG_DATA_HOME, 'mise') : home && P.join(home, '.local', 'share', 'mise'));
    if (mise) for (const v of versions(P.join(mise, 'installs', 'node'), fs)) add(P.join(mise, 'installs', 'node', v, 'bin'), 'mise');
    // pnpm, Bun, the official installer, MacPorts, ~/bin
    add(env.PNPM_HOME || (home && P.join(home, 'Library', 'pnpm')), 'pnpm');
    add(env.BUN_INSTALL ? P.join(env.BUN_INSTALL, 'bin') : home && P.join(home, '.bun', 'bin'), 'Bun');
    if (home) { add(P.join(home, '.local', 'bin'), 'installer'); add(P.join(home, '.claude', 'local'), 'installer'); }
    add('/opt/local/bin', 'MacPorts');
    if (home) add(P.join(home, 'bin'), 'PATH');
    // shims last
    if (asdf) add(P.join(asdf, 'shims'), 'asdf', true);
    if (mise) add(P.join(mise, 'shims'), 'mise', true);
    add(P.join(env.VOLTA_HOME || (home ? P.join(home, '.volta') : ''), 'bin'), 'Volta', true);
    const seen = new Set();
    return out.filter((d) => { if (!d.dir || d.dir === '.' || seen.has(d.dir)) return false; seen.add(d.dir); return true; });
  }
  // files named `name` under root (versioned app folders), newest first; an app's own program (Contents/MacOS) is the
  // desktop app, never the command-line tool
  function allIn(root, name, { fs = realFs, depth = 3, limit = 3, filter = null } = {}) {
    const found = [];
    const walk = (dir, level) => {
      for (const n of fs.list(dir)) {
        const full = P.join(dir, n);
        if (n === name && fs.isFile(full) && (!filter || filter(full))) found.push({ full, mtime: fs.mtime(full) });
        else if (level < depth && n !== 'MacOS' && n !== 'node_modules' && n !== 'Frameworks' && fs.isDir(full)) walk(full, level + 1);
      }
    };
    if (root) walk(root, 0);
    return found.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((f) => f.full);
  }
  // a version manager's shim: asdf / mise / nodenv shims (small scripts that ask the manager), Volta's (a link to volta-shim)
  function isShim(file, { fs = realFs } = {}) {
    if (/\/\.asdf\/shims\/|\/mise\/shims\/|\/\.nodenv\/shims\//.test(file)) return true;
    if (/\/volta-shim$/.test(fs.real(file))) return true;
    const head = fs.read(file, 400);
    return /^#!.*\b(ba|z)?sh\b[\s\S]*\b(asdf exec|mise (x|exec)|exec mise|nodenv exec)\b/.test(head);
  }
  function candidates(engine, { env = process.env, home = os.homedir(), fs = realFs, shellPath = '' } = {}) {
    const real = []; const shims = []; const seen = new Set();
    const add = (f, shim = null) => {
      if (!f || !fs.isFile(f)) return;
      const r = fs.real(f);
      if (seen.has(f) || seen.has(r)) return;
      seen.add(f); seen.add(r);
      ((shim ?? isShim(f, { fs })) ? shims : real).push(f);
    };
    // Volta keeps each global package's real commands under tools/image/packages (its bin/ only has shims)
    const volta = env.VOLTA_HOME || (home ? P.join(home, '.volta') : '');
    for (const d of binDirs({ env, home, fs, shellPath })) {
      if (d.via === 'Volta' && volta) add(P.join(volta, 'tools', 'image', 'packages', PKG[engine], 'bin', engine), false);
      add(P.join(d.dir, engine), d.shim || null);
    }
    if (engine === 'claude') {
      // the Claude desktop app's own Claude Code (~/Library/Application Support/Claude/claude-code/<version>/claude)
      if (home) allIn(P.join(home, 'Library', 'Application Support', 'Claude', 'claude-code'), 'claude', { fs }).forEach((f) => add(f, false));
      for (const app of ['/Applications/Claude.app', home && P.join(home, 'Applications', 'Claude.app')]) if (app) allIn(P.join(app, 'Contents', 'Resources'), 'claude', { fs, depth: 4, limit: 1, filter: (f) => /claude-code/.test(f) }).forEach((f) => add(f, false));
    } else {
      for (const root of ['/Applications/Codex.app/Contents', home && P.join(home, 'Applications', 'Codex.app', 'Contents'), '/Applications/ChatGPT.app/Contents', home && P.join(home, 'Applications', 'ChatGPT.app', 'Contents'), home && P.join(home, 'Library', 'Application Support', 'Codex')]) if (root) allIn(root, 'codex', { fs, depth: 4 }).forEach((f) => add(f, false));
      // npm's codex is a Node script that starts its own program (vendor/<arch>-apple-darwin/codex/codex): that program
      // is found too, so Codex works without any Node at all
      for (const f of [...real]) {
        const r = fs.real(f);
        const m = /^(.*\/node_modules\/@openai\/codex)\/bin\/codex(\.js)?$/.exec(r);
        if (!m) continue;
        const arch = process.arch === 'x64' ? 'x86_64' : 'aarch64';
        const hits = allIn(P.join(m[1], 'vendor'), 'codex', { fs, depth: 3, limit: 4 });
        hits.sort((a, b) => Number(b.includes(arch)) - Number(a.includes(arch))).slice(0, 1).forEach((h) => add(h, false));
      }
    }
    return [...real, ...shims];
  }
  // how a copy got here, in words /doctor shows next to its kind ("npm · nvm")
  function whereOf(file, { home = os.homedir(), fs = realFs } = {}) {
    const s = `${file}\n${fs.real(file)}`;
    const h = home ? home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '\\0';
    if (/\.app\/Contents\//.test(s)) return /ChatGPT\.app/.test(s) ? 'ChatGPT app' : /Codex\.app/.test(s) ? 'Codex app' : 'Claude app';
    if (/Application Support\/Claude\/claude-code\//.test(s)) return 'Claude app';
    if (/Application Support\/Codex\//.test(s)) return 'Codex app';
    if (/\/\.nvm\//.test(s)) return 'nvm';
    if (/\/fnm\/|\/\.fnm\/|fnm_multishells/.test(s)) return 'fnm';
    if (/\/\.asdf\//.test(s)) return 'asdf';
    if (/\/mise\//.test(s)) return 'mise';
    if (/\/\.volta\//.test(s)) return 'Volta';
    if (/\/pnpm\//i.test(s)) return 'pnpm';
    if (/\/\.bun\//.test(s)) return 'Bun';
    if (/\/(Cellar|Caskroom)\/|^\/opt\/homebrew\//m.test(s)) return 'Homebrew';
    if (/^\/opt\/local\//m.test(s)) return 'MacPorts';
    if (/\/\.local\/(bin|share\/claude)\/|\/\.claude\/local\//.test(s)) return 'installer';
    if (/\/node_modules\//.test(s) || new RegExp(`^${h}/\\.npm-(global|packages)/`, 'm').test(s)) return 'npm';
    if (/^\/usr\/local\//m.test(s)) return 'Homebrew';
    return '';
  }
  const lookedIn = () => 'PATH, your shell\'s PATH, Homebrew, npm, nvm, fnm, asdf, mise, Volta, pnpm, Bun, ~/.local/bin and the Claude / Codex apps';

  // ---------- starting an npm script without `node` on PATH ----------
  // npm installs claude / codex as a link to a Node script (`#!/usr/bin/env node`). Started from the Dock, PATH may have
  // no node ("env: node: No such file or directory"). The Node next to the link (the one npm / nvm / Homebrew installed
  // it with) is used, else the first on PATH (then it runs as it always did), else a Node in the usual places, else
  // Hearth's own Electron runs it as Node (as it runs its own tool servers).
  function nodeDirs({ env = process.env, home = os.homedir(), fs = realFs } = {}) {
    return binDirs({ env, home, fs }).filter((d) => !d.shim).map((d) => d.dir);
  }
  function plan(bin, args = [], { platform = process.platform, env = process.env, home = os.homedir(), fs = realFs, execPath = process.execPath } = {}) {
    const direct = { command: bin, args, options: {}, via: 'direct' };
    if (platform !== 'darwin' || !bin) return direct;
    const head = fs.read(bin, 256);
    const m = /^#!\s*(\S+)(?:\s+(?:-S\s+)?(\S+))?/.exec(head);
    if (!m) return direct; // a program (Mach-O), or no read access: as it was
    const viaEnv = /\/env$/.test(m[1]);
    const interp = viaEnv ? m[2] : P.basename(m[1]);
    if (interp !== 'node') return direct; // a shell script (asdf shim, ~/.claude/local wrapper): as it was
    if (!viaEnv && fs.isFile(m[1])) return direct; // a fixed #!/opt/homebrew/bin/node that exists
    const script = fs.real(bin);
    const near = P.join(P.dirname(bin), 'node');
    if (fs.isFile(near) && P.basename(bin) !== 'node') return { command: near, args: [script, ...args], options: {}, via: 'node', script };
    if (String(env.PATH || '').split(':').some((d) => d && fs.isFile(P.join(d, 'node')))) return direct;
    const found = nodeDirs({ env: { ...env, PATH: '' }, home, fs }).map((d) => P.join(d, 'node')).find((f) => fs.isFile(f));
    if (found) return { command: found, args: [script, ...args], options: {}, via: 'node', script };
    return { command: execPath, args: [script, ...args], options: {}, extraEnv: { ELECTRON_RUN_AS_NODE: '1' }, via: 'node', script, electron: true };
  }
  function spawn(bin, args, opts = {}) {
    if (process.platform !== 'darwin') return cp.spawn(bin, args, opts);
    const p = plan(bin, args, { env: opts.env || process.env });
    const options = { ...opts, ...p.options };
    if (p.extraEnv) options.env = { ...(opts.env || process.env), ...p.extraEnv };
    const child = cp.spawn(p.command, p.args, options);
    child.hearthVia = p.via;
    return child;
  }

  // ---------- a path pasted in Settings → Engines ----------
  // Quotes, a Terminal-escaped path (a file dragged into Terminal: `/Users/me/My\ Tools/claude`), ~, a trailing slash; a
  // folder gets the engine inside it (or in its bin/); an .app gets the CLI it bundles.
  function cleanPath(p, { platform = process.platform, home = os.homedir(), fs = realFs, engine = '' } = {}) {
    let s = unquote(p);
    if (!s || platform !== 'darwin') return s;
    s = s.replace(/\\(.)/g, '$1');
    s = tilde(s, home);
    if (s.length > 1) s = s.replace(/\/+$/, '');
    if (engine && /\.app$/i.test(s) && fs.isDir(s)) { const hit = allIn(P.join(s, 'Contents'), engine, { fs, depth: 5, limit: 1 })[0]; if (hit) return hit; }
    if (engine && fs.isDir(s)) { const hit = [P.join(s, engine), P.join(s, 'bin', engine)].find((f) => fs.isFile(f)); if (hit) return hit; }
    return s;
  }

  // ---------- the login shell's PATH ----------
  // A Dock / Finder launch gets launchd's PATH (/usr/bin:/bin:/usr/sbin:/sbin). winmac adds the usual folders; what the
  // owner's own shell adds (~/.zshrc / ~/.zprofile: a custom npm prefix, asdf, mise, fnm, a corporate tools folder) is
  // read once from the login shell itself, in the background, and added at the END (what Hearth had still wins).
  const MARK = '__HEARTH_PATH__';
  function shellCommand(shell) {
    const fish = /\/fish$/.test(shell);
    return [shell, ['-ilc', fish ? `printf '${MARK}%s${MARK}' (string join : $PATH)` : `printf '${MARK}%s${MARK}' "$PATH"`]];
  }
  function parseShellOutput(out) {
    const m = new RegExp(`${MARK}(.*?)${MARK}`, 's').exec(String(out || ''));
    return m ? m[1].trim() : null;
  }
  function shellPath({ shell = process.env.SHELL || '/bin/zsh', timeout = 6000, run = cp.execFile } = {}) {
    return new Promise((resolve) => {
      if (!/^\/[\w./-]+$/.test(shell)) { resolve(null); return; }
      const [cmd, args] = shellCommand(shell);
      try {
        const child = run(cmd, args, { timeout, killSignal: 'SIGKILL', env: { ...process.env, HEARTH_SHELL_PROBE: '1', DISABLE_AUTO_UPDATE: 'true' }, encoding: 'utf8', maxBuffer: 1 << 20 }, (err, out) => resolve(parseShellOutput(out)));
        child?.stdin?.end?.();
      } catch { resolve(null); }
    });
  }
  // dirs of `extra` that aren't in `cur` yet, appended (absolute, existing ones only)
  function mergePath(cur, extra, { exists = (d) => realFs.isDir(d) } = {}) {
    const have = String(cur || '').split(':').filter(Boolean);
    const add = String(extra || '').split(':').filter((d) => d.startsWith('/') && !have.includes(d) && exists(d));
    return [...have, ...[...new Set(add)]].join(':');
  }
  let shellDirs = '';
  async function adoptShellPath({ platform = process.platform, cacheFile = '', probe = shellPath } = {}) {
    if (platform !== 'darwin') return null;
    // last time's answer first (no wait), then the shell asked again
    try { const c = JSON.parse(nodeFs.readFileSync(cacheFile, 'utf8')); if (c?.path) { shellDirs = c.path; process.env.PATH = mergePath(process.env.PATH, c.path); } } catch { /* first run */ }
    const p = await probe();
    if (!p) return null;
    shellDirs = p;
    const before = process.env.PATH;
    process.env.PATH = mergePath(before, p);
    if (cacheFile) { try { nodeFs.mkdirSync(P.dirname(cacheFile), { recursive: true }); nodeFs.writeFileSync(cacheFile, JSON.stringify({ path: p, at: Date.now() })); } catch { /* only a cache */ } }
    return process.env.PATH === before ? '' : process.env.PATH.slice(before.length).replace(/^:/, '');
  }

  // ---------- Gatekeeper ----------
  // A program downloaded with a browser carries com.apple.quarantine ("flags;time;agent;id"). Until it is approved once
  // (flag 0x40) macOS may refuse to start it ("developer cannot be verified", "is damaged", or a silent kill: 9).
  function xattrDefault(file) {
    try { return cp.execFileSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', file], { timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { return null; }
  }
  // the folder to un-quarantine: an app bundle as a whole, else the real file
  function targetOf(file, { fs = realFs } = {}) {
    const r = fs.real(String(file || ''));
    const m = /^(.*?\.app)(\/|$)/.exec(r);
    return m ? { path: m[1], bundle: true } : { path: r, bundle: false };
  }
  function quarantine(file, { xattr = xattrDefault, fs = realFs } = {}) {
    if (!file) return null;
    const t = targetOf(file, { fs });
    const v = xattr(t.path) || (t.bundle ? xattr(fs.real(file)) : null);
    if (!v) return null;
    const flags = parseInt(String(v).split(';')[0], 16);
    return { value: v, approved: Number.isFinite(flags) && Boolean(flags & 0x40), target: t.path, bundle: t.bundle };
  }
  const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const PRIVACY_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
  // The exact command a fix button runs (shown before the click): never sudo, never a password, never a shell string.
  function fixPlan(action, file, { fs = realFs } = {}) {
    if (action === 'unquarantine') {
      if (!file) return null;
      const t = targetOf(file, { fs });
      const args = [t.bundle ? '-dr' : '-d', 'com.apple.quarantine', t.path];
      return { action, file: '/usr/bin/xattr', args, target: t.path, command: `xattr ${args.slice(0, 2).join(' ')} ${sq(t.path)}`, text: `Remove macOS's download quarantine from ${P.basename(t.path)}` };
    }
    if (action === 'chmod') {
      if (!file) return null;
      const r = fs.real(file);
      return { action, file: '/bin/chmod', args: ['u+x', r], target: r, command: `chmod u+x ${sq(r)}`, text: `Mark ${P.basename(r)} as a program you can run` };
    }
    if (action === 'clt') return { action, file: '/usr/bin/xcode-select', args: ['--install'], command: 'xcode-select --install', text: 'Install Apple\'s Command Line Tools (Apple\'s own installer window opens)', detached: true };
    if (action === 'privacy') return { action, url: PRIVACY_URL, command: 'System Settings → Privacy & Security → Full Disk Access', text: 'Open Privacy & Security → Full Disk Access, and switch Hearth on' };
    return null;
  }
  // runs a fixPlan (only ever after the owner pressed its button): → { ok, error?, command }
  function runFix(planned, { run = cp.execFile, openExternal = null } = {}) {
    return new Promise((resolve) => {
      if (!planned) { resolve({ ok: false, error: 'Nothing to fix' }); return; }
      if (planned.url) { Promise.resolve(openExternal?.(planned.url)).then(() => resolve({ ok: true, command: planned.command }), (e) => resolve({ ok: false, error: String(e?.message || e), command: planned.command })); return; }
      if (!['/usr/bin/xattr', '/bin/chmod', '/usr/bin/xcode-select'].includes(planned.file)) { resolve({ ok: false, error: 'Not a fix Hearth runs' }); return; }
      if (planned.detached) {
        try { const c = cp.spawn(planned.file, planned.args, { detached: true, stdio: 'ignore' }); c.on('error', () => {}); c.unref(); resolve({ ok: true, command: planned.command }); } catch (e) { resolve({ ok: false, error: e.message, command: planned.command }); }
        return;
      }
      run(planned.file, planned.args, { timeout: 15000, encoding: 'utf8' }, (err, _out, errOut) => {
        if (!err) { resolve({ ok: true, command: planned.command }); return; }
        const why = String(errOut || err.message || '');
        // no such attribute: it was already lifted (fine)
        if (planned.action === 'unquarantine' && /No such xattr/i.test(why)) { resolve({ ok: true, command: planned.command, already: true }); return; }
        if (/Permission denied|Operation not permitted|EPERM|EACCES/i.test(why)) {
          resolve({ ok: false, command: planned.command, error: `macOS didn't let Hearth change ${P.basename(planned.target || '')} (it belongs to another user or the system). Hearth never uses an administrator password: if you are an administrator, copy the command and run it yourself in Terminal.` });
          return;
        }
        resolve({ ok: false, command: planned.command, error: why.split('\n')[0].slice(0, 200) || 'It didn\'t work' });
      });
    });
  }

  // ---------- macOS' own error texts, in plain words ----------
  // → { text, fix, action: 'unquarantine' | 'install' | 'update' | 'doctor' | 'chmod' | 'clt' | 'privacy', command? }
  const GATEKEEPER = /cannot be opened because (the developer cannot be verified|it is from an unidentified developer|Apple cannot check it)|Apple could not verify|is damaged and can.?t be opened|can.?t be opened because|Malware|com\.apple\.quarantine|was blocked from use because it is not from an identified developer|not opened.*(downloaded from the Internet|identified developer)/i;
  const KILLED_AT_START = /stopped by macOS as it started|Killed: 9|code signature (invalid|not valid)|CODESIGNING|Code Signature Invalid/i;
  const MAC_ERRORS = [
    [/Bad CPU type in executable|Unknown system error -86|EBADARCH|incompatible (cpu|architecture)|have \(arm64\), need \(x86_64\)|have \(x86_64\), need \(arm64\)/i,
      'This copy is built for another kind of Mac (Intel vs Apple silicon).', 'Press Install for the right one for this Mac, then Retry.', 'install'],
    [/env: (‘|')?node(’|')?: No such file or directory|node: (command )?not found|No such file or directory.*\bnode\b/i,
      'This copy was installed with npm and needs Node.js, which Hearth couldn\'t find.', 'Press Install to get the standalone version (no Node.js needed), or install Node.js (brew install node) and press Retry.', 'install'],
    [/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/i,
      'This copy\'s files are incomplete (an npm install that was interrupted or half-removed).', 'Press Update to reinstall it, then Retry.', 'update'],
    [/SyntaxError: Unexpected token|Unexpected reserved word|requires Node(\.js)? (version )?\d+|Node\.js \d+(\.\d+)* or (newer|higher|later)|unsupported engine/i,
      'The Node.js on this Mac is too old for this copy.', 'Press Install to get the standalone version (no Node.js needed), or update Node.js (brew upgrade node), then Retry.', 'install'],
    [/dyld(\[\d+\])?: Library not loaded|dyld: Symbol not found|image not found/i,
      'This copy is missing a part macOS needs to start it (a broken or half-updated install).', 'Press Install for a fresh copy, then Retry.', 'install'],
    [/xcrun: error: invalid active developer path|xcode-select: (note|error): no developer tools|requires the command line developer tools/i,
      'A command the AI ran needs Apple\'s Command Line Tools (git, make…), which aren\'t installed.', 'Press Install tools: Apple\'s own installer opens (`xcode-select --install`), then Retry.', 'clt'],
    [/spawn (\S+ )?EACCES|\(EACCES\)/i,
      'macOS says this copy isn\'t allowed to run (it isn\'t marked as a program).', 'Press Make runnable (it runs `chmod u+x` on that one file), or run /doctor to pick another copy.', 'chmod'],
    [/^(?=.*(Operation not permitted|EPERM)).*(\/Desktop|\/Documents|\/Downloads|\/Mobile Documents|\/CloudStorage|\/Volumes\/|\/Library\/(Mail|Messages|Safari))/im,
      'macOS\'s privacy protection didn\'t let it into a folder (Desktop, Documents, Downloads, iCloud Drive or an external disk need your OK).', 'Press Privacy settings and switch Hearth on under Full Disk Access (or Files and Folders), restart Hearth, then Retry.', 'privacy'],
    [/spawn (\S+ )?ENOENT/i,
      'The copy Hearth was using isn\'t there any more (moved, uninstalled or mid-update).', 'Run /doctor: it finds the copies on this Mac and picks one.', 'doctor'],
  ];
  function plainError(text, { bin = '', signal = '', xattr = xattrDefault, fs = realFs } = {}) {
    const t = String(text || '');
    const killed = signal === 'SIGKILL' || KILLED_AT_START.test(t);
    if (GATEKEEPER.test(t) || killed) {
      const q = bin ? quarantine(bin, { xattr, fs }) : null;
      if (GATEKEEPER.test(t) || (q && !q.approved)) {
        const planned = fixPlan('unquarantine', bin || '', { fs });
        const name = planned ? P.basename(planned.target) : 'it';
        return { text: `macOS blocked ${name} because it was downloaded from the internet and hasn't been approved yet (Gatekeeper).`, fix: `Press Allow: Hearth shows the exact command first${planned ? ` (\`${planned.command}\`, no password)` : ''}; only do it for a copy you got from Anthropic / OpenAI. Then Retry.`, action: 'unquarantine', command: planned?.command || '' };
      }
      if (killed) return { text: 'macOS stopped it right as it started (a damaged or unsigned copy).', fix: 'Press Install for a fresh copy, then Retry.', action: 'install' };
    }
    const hit = MAC_ERRORS.find(([re]) => re.test(t));
    if (!hit) return null;
    const out = { text: hit[1], fix: hit[2], action: hit[3] };
    if (hit[3] === 'chmod') { const planned = bin ? fixPlan('chmod', bin, { fs }) : null; if (!planned) return { ...out, fix: 'Run /doctor to pick another copy.', action: 'doctor' }; out.command = planned.command; }
    return out;
  }

  // ---------- the Trash ----------
  // A network share (SMB / AFP / NFS / WebDAV) has no Trash: Finder deletes such a file at once, and shell.trashItem can't
  // move it anywhere. A read-only disk can't change at all. Hearth leaves those files and says why. Local disks, USB
  // drives (they get a .Trashes) and iCloud Drive (Recently Deleted) are fine.
  const NETWORK_FS = /^(smbfs|afpfs|nfs|webdav|cifs|ftp|cddafs|macfuse|osxfuse|fusefs)$/i;
  let mountCache = null;
  function parseMounts(text) {
    // "//me@nas/share on /Volumes/share (smbfs, nodev, nosuid, mounted by me)"
    return String(text || '').split('\n').map((l) => /^(.+?) on (\/.*?) \(([^,)]+)((?:,[^)]*)?)\)\s*$/.exec(l)).filter(Boolean)
      .map((m) => ({ from: m[1], on: m[2], type: m[3].trim(), readOnly: /\bread-only\b/.test(m[4] || '') }));
  }
  function mountsDefault() {
    if (mountCache && Date.now() - mountCache.at < 60000) return mountCache.list;
    let list = [];
    try { list = parseMounts(cp.execFileSync('/sbin/mount', [], { timeout: 3000, encoding: 'utf8' })); } catch { /* unknown */ }
    mountCache = { at: Date.now(), list };
    return list;
  }
  const volumeOf = (p) => { const m = /^\/Volumes\/[^/]+/.exec(p); return m ? m[0] : '/'; };
  function trashCheck(p, { platform = process.platform, mounts = mountsDefault, home = os.homedir() } = {}) {
    if (platform !== 'darwin') return { ok: true, path: p };
    let s = P.normalize(tilde(String(p || ''), home));
    if (s.length > 1) s = s.replace(/\/+$/, '');
    const name = P.basename(s) || s;
    if (!s.startsWith('/')) return { ok: false, path: s, reason: 'relative', error: `Hearth only deletes files named with their full path (${name}); nothing was deleted.` };
    if (s === '/' || /^\/Volumes\/[^/]+$/.test(s) || s === home) return { ok: false, path: s, reason: 'root', error: `Hearth never deletes a whole disk or your home folder (${name}).` };
    const vol = volumeOf(s);
    const m = vol === '/' ? null : (mounts() || []).find((x) => x.on === vol);
    if (m && NETWORK_FS.test(m.type)) return { ok: false, path: s, reason: 'network', error: `${name} is on a network share (${P.basename(vol)}), which has no Trash on a Mac: Finder would delete it for good, so Hearth left it where it is (nothing was lost). Delete it yourself in Finder if you're sure.` };
    if (m && m.readOnly) return { ok: false, path: s, reason: 'readonly', error: `${name} is on a read-only disk (${P.basename(vol)}), so it can't go to the Trash. Nothing was deleted.` };
    return { ok: true, path: s };
  }
  function trashError(err, p) {
    const msg = String(err?.message || err || '');
    const name = P.basename(String(p || '')) || String(p || '');
    if (/ENOENT|not (be )?found|doesn.?t exist|does not exist|no such file/i.test(msg)) return `${name} was already gone.`;
    if (/locked|NSFileWriteVolumeReadOnly|read-only/i.test(msg)) return `${name} is locked or on a read-only disk (Finder → Get Info → Locked), so it couldn't go to the Trash. Nothing was deleted.`;
    if (/not permitted|EPERM|EACCES|permission|privacy/i.test(msg)) return `macOS didn't let Hearth move ${name} to the Trash (its privacy protection for that folder, or the file belongs to another user). Nothing was deleted. System Settings → Privacy & Security → Full Disk Access → Hearth fixes the first.`;
    if (/in use|busy|EBUSY/i.test(msg)) return `${name} is in use by another app, so it couldn't go to the Trash. Close that app and try again (nothing was deleted).`;
    return `macOS couldn't move ${name} to the Trash (${msg.split('\n')[0].slice(0, 120) || 'no reason given'}). Nothing was deleted.`;
  }

  // ---------- case-insensitive disks ----------
  // APFS / HFS+ are case-insensitive by default ("Proj" and "proj" are one folder), a case-sensitive APFS volume isn't.
  // Asked of the disk itself: the same folder spelled with other case is the same file (inode).
  function caseless(dir, { fs = nodeFs } = {}) {
    try {
      const st = fs.statSync(dir);
      const flip = dir.replace(/[A-Za-z](?=[^/]*$)/, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
      if (flip === dir) return null;
      try { const st2 = fs.statSync(flip); return st2.ino === st.ino && st2.dev === st.dev; } catch { return false; }
    } catch { return null; }
  }
  // what the window's folder checks need: the boot disk's name (/Volumes/<it> is /) and which disks ignore case
  function volumeInfo({ platform = process.platform, fs = nodeFs, home = os.homedir() } = {}) {
    if (platform !== 'darwin') return null;
    const out = { caseless: {}, boot: '' };
    out.caseless['/'] = (caseless(home, { fs }) ?? caseless('/Applications', { fs })) !== false;
    let vols = [];
    try { vols = fs.readdirSync('/Volumes'); } catch { /* none */ }
    for (const v of vols.slice(0, 12)) {
      const full = `/Volumes/${v}`;
      try { if (fs.realpathSync(full) === '/') { out.boot = v; continue; } } catch { continue; }
      const probe = (() => { try { return fs.readdirSync(full).find((n) => /[A-Za-z]/.test(n)); } catch { return null; } })();
      out.caseless[full] = probe ? caseless(`${full}/${probe}`, { fs }) === true : false;
    }
    return out;
  }

  // ---------- IPC (main.js): the fix buttons ----------
  // mac:fix { target: 'claude' | 'codex' | 'chrome', action, dry } → dry: { ok, command, text } (shown before the click);
  // else runs it. The program is found here (never a path from the window), the command is one of fixPlan's.
  // mac:volumes → volumeInfo() (the chats' folder checks: case and the boot disk's name)
  function register(ipcMain, { locate = () => null, chrome = async () => null, openExternal = null } = {}) {
    ipcMain.handle('mac:fix', async (_e, o = {}) => {
      if (process.platform !== 'darwin' && !process.env.HEARTH_TEST_MACFIX) return { ok: false, error: 'Only on a Mac' };
      const action = String(o.action || '');
      const target = String(o.target || '');
      const file = target === 'chrome' ? (await chrome())?.path : ['claude', 'codex'].includes(target) ? locate(target) : null;
      const planned = fixPlan(action, file);
      if (!planned) return { ok: false, error: file || action === 'clt' || action === 'privacy' ? 'Nothing to fix' : 'Hearth couldn\'t find that program' };
      if (o.dry) return { ok: true, command: planned.command, text: planned.text };
      return runFix(planned, { openExternal });
    });
    let vols = null;
    ipcMain.handle('mac:volumes', () => { if (!vols || Date.now() - vols.at > 60000) vols = { at: Date.now(), info: volumeInfo() }; return vols.info; });
  }

  return { PKG, binDirs, candidates, isShim, whereOf, lookedIn, plan, spawn, cleanPath, shellCommand, parseShellOutput, shellPath, mergePath, adoptShellPath, get shellDirs() { return shellDirs; },
    quarantine, targetOf, fixPlan, runFix, plainError, parseMounts, trashCheck, trashError, caseless, volumeInfo, register, PRIVACY_URL };
})();
module.exports = MacPolish;
