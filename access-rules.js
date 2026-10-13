// Chat file access (round 14): the classifier that decides, for one tool call a chat's engine wants to make, whether
// Hearth lets it through silently, asks the owner (an approval card) or refuses. Pure functions, no I/O: the renderer
// (access.js) and the Node tests (dev/access-test.js) load the same file.
//   AccessRules.classify({ tool, input, level, folders, cwd, home }) → {
//     verdict: 'allow' | 'ask' | 'deny', risk: 'low' | 'high', action, what, where, targets, why,
//     grant (the key "Allow for this chat" remembers), trash (paths Hearth can send to the Trash instead of rm),
//     backup (a file to copy before an edit), password (a command that would prompt for one) }
// Levels: off · read · write (read & write) · full (read, write, delete, run commands / apps).
// Safe (silent): reads and writes inside the chat's folders, read-only and build commands there. Risky (a card):
// deletes, moves, overwriting or reading outside the folders, installs, network, publishing / pushing, killing apps,
// system settings. Refused: what the level doesn't cover, and anything that would prompt for a password.
const AccessRules = (() => {
  const LEVELS = ['off', 'read', 'write', 'full'];
  const LEVEL_LABEL = { off: 'Off', read: 'Read', write: 'Read & write', full: 'Full' };
  const LEVEL_HINT = {
    off: 'no files, no commands',
    read: 'reads files in its folders',
    write: 'reads and edits files in its folders',
    full: 'reads, writes, deletes (to the Trash) and runs commands / apps',
  };
  const rank = (l) => Math.max(0, LEVELS.indexOf(l));
  const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead']);
  const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

  // ---------- paths (no Node `path`: this runs in the window too) ----------
  const isWinPath = (p) => /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p);
  const isAbs = (p) => p.startsWith('/') || isWinPath(p);
  // One comparable form: forward slashes, no trailing slash, `.` / `..` resolved, Windows paths lower-cased.
  let winHost = false; // set by classify() when Hearth runs on Windows
  function norm(p, base = '', home = '') {
    let s = String(p || '').trim();
    // Git Bash on Windows (where Claude Code runs commands) writes C:\x as /c/x
    if (winHost && /^\/[A-Za-z](\/|$)/.test(s)) s = `${s[1]}:/${s.slice(3)}`;
    if (!s) return '';
    // (round 32, winpolish) Windows' other spellings of one place: \\?\C:\x and \\.\C:\x (long-path / device names) are
    // C:\x, \\?\UNC\srv\share is \\srv\share; "\x" means the root of the current drive and "D:x" the current folder of
    // drive D: (another drive is never "inside" the chat's folder)
    if (/^[\\/]{2}[?.][\\/]UNC[\\/]/i.test(s)) s = `\\\\${s.slice(8)}`;
    else if (/^[\\/]{2}[?.][\\/][A-Za-z]:/.test(s)) s = s.slice(4);
    const baseDrive = /^[A-Za-z]:/.test(base) ? base.slice(0, 2) : '';
    if ((winHost || baseDrive) && /^\\(?!\\)/.test(s)) s = `${baseDrive || 'c:'}${s}`;
    if (/^[A-Za-z]:(?![\\/])/.test(s)) s = baseDrive && baseDrive.toLowerCase() === s.slice(0, 2).toLowerCase() ? `${base}/${s.slice(2)}` : `${s.slice(0, 2)}/${s.slice(2)}`;
    if (home && (s === '~' || s.startsWith('~/') || s.startsWith('~\\'))) s = home + s.slice(1);
    if (!isAbs(s) && base) s = `${base}/${s}`;
    const win = isWinPath(s);
    s = s.replace(/\\/g, '/');
    const lead = s.startsWith('//') ? '//' : s.startsWith('/') ? '/' : '';
    const unc = win && lead === '//';
    const out = [];
    const segs = s.slice(lead.length).split('/');
    const lastAt = s.endsWith('/') ? -1 : segs.length - 1;
    for (let [i, part] of segs.entries()) {
      // Windows' own rules: the last name loses its trailing dots and spaces ("secret.txt. " is "secret.txt"), a name
      // in the middle ending in one dot loses it ("proj." is "proj"); "..." stays a real name
      if (win && !/^\.+$/.test(part)) part = i === lastAt ? part.replace(/[. ]+$/, '') : part.replace(/([^.])\.$/, '$1');
      if (!part || part === '.') continue;
      if (part === '..') { if (out.length > (unc ? 2 : win ? 1 : 0)) out.pop(); continue; }
      out.push(part);
    }
    const r = lead + out.join('/');
    return win ? r.toLowerCase() : r;
  }
  const inside = (p, folder) => Boolean(p && folder) && (p === folder || p.startsWith(folder.endsWith('/') ? folder : `${folder}/`));
  const insideAny = (p, folders) => folders.some((f) => inside(p, f));
  const baseName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '');
  const dirName = (p) => { const s = String(p || '').replace(/[\\/]+$/, ''); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i > 0 ? s.slice(0, i) : s; };

  // Names that usually hold secrets: reading them would put keys into the chat (asks even inside the folders).
  const SECRET_FILE = /(^|\/)(\.env(\.[\w.-]+)?|\.npmrc|\.netrc|\.pgpass|id_(rsa|ed25519|ecdsa|dsa)(\.pub)?|[^/]*\.(pem|key|p12|pfx|keychain(-db)?)|credentials(\.json)?|secrets?\.(json|ya?ml|toml))$|(^|\/)\.(ssh|aws|gnupg|kube)\/|\/Keychains\//i;

  // ---------- secrets never shown, logged or sent back ----------
  function redact(text) {
    return String(text ?? '')
      .replace(/((?:api[_-]?key|token|secret|password|passwd|pwd|auth|bearer)["']?\s*[:=]\s*["']?)[^\s"'&]+/gi, '$1•••')
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, '$1 •••')
      .replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{12,}|xox[abpr]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{20,})/g, '•••')
      .replace(/(https?:\/\/[^\s:/@]+:)[^\s@/]+@/g, '$1•••@');
  }

  // ---------- shell: words, operators, redirects ----------
  // Splits a command line into segments (one command each, with how it was joined to the next) and redirect targets.
  // Quotes and backslashes are honoured; $(…) and backticks are only flagged (their insides are classified too).
  // ps (PowerShell / cmd on Windows): a backslash is a plain path character and the backtick is the escape.
  function tokenize(cmd, { ps = false } = {}) {
    const segs = [];
    let words = []; let redirects = []; let cur = ''; let has = false; let quote = null; let redirNext = null;
    const complex = ps ? /\$\(|@\(|\$\{|\{/.test(cmd) : /\$\(|`|<\(|\$\{/.test(cmd);
    const esc = ps ? '`' : '\\';
    const pushWord = () => {
      if (!has) return;
      if (redirNext) { redirects.push({ op: redirNext, target: cur }); redirNext = null; } else words.push(cur);
      cur = ''; has = false;
    };
    const endSeg = (join) => { pushWord(); if (words.length || redirects.length) segs.push({ words, redirects, join }); words = []; redirects = []; };
    for (let i = 0; i < cmd.length; i++) {
      const c = cmd[i];
      if (quote) {
        if (ps && quote === "'" && c === "'" && cmd[i + 1] === "'") { cur += "'"; i++; } // PowerShell's '' inside '…'
        else if (c === quote) quote = null;
        else if (c === esc && quote === '"' && i + 1 < cmd.length) { cur += cmd[++i]; }
        else cur += c;
        continue;
      }
      if (c === "'" || c === '"') { quote = c; has = true; continue; }
      if (c === esc && i + 1 < cmd.length) { if (cmd[i + 1] === '\n') { i++; continue; } cur += cmd[++i]; has = true; continue; }
      if (c === ' ' || c === '\t') { pushWord(); continue; }
      if (c === '\n' || c === ';') { endSeg(';'); continue; }
      if (c === '&' && cmd[i + 1] === '&') { endSeg('&&'); i++; continue; }
      if (c === '|' && cmd[i + 1] === '|') { endSeg('||'); i++; continue; }
      if (c === '|') { endSeg('|'); continue; }
      if (c === '&' && cmd[i + 1] === '>') { pushWord(); redirNext = '>'; i += cmd[i + 2] === '>' ? 2 : 1; continue; }
      if (c === '&') { endSeg('&'); continue; }
      if (c === '>' || c === '<') {
        // 2>&1 / >&2: a stream copy, not a file
        if (/^\d$/.test(cur) && has) { cur = ''; has = false; }
        pushWord();
        let op = c; if (cmd[i + 1] === '>') { op = '>>'; i++; }
        if (cmd[i + 1] === '&') { i++; while (/\d|-/.test(cmd[i + 1] || '')) i++; continue; }
        redirNext = op;
        continue;
      }
      if (c === '#' && !has && (i === 0 || /\s/.test(cmd[i - 1]))) { while (i + 1 < cmd.length && cmd[i + 1] !== '\n') i++; continue; }
      cur += c; has = true;
    }
    endSeg(null);
    return { segs, complex, unclosed: Boolean(quote) };
  }

  // Command families (first word, lower case, any folder / .exe stripped).
  const set = (s) => new Set(s.split(/\s+/));
  // (winshell) PowerShell's own verbs and aliases sit in the same families (Remove-Item = rm, Get-ChildItem = ls…)
  const PASSWORD = set('sudo su doas pkexec runas ssh scp sftp ssh-copy-id passwd kinit login ssh-add get-credential');
  const DELETE = set('rm rmdir unlink shred srm del erase rd remove-item ri');
  const MOVE = set('mv rename move ren move-item mi rename-item rni');
  const CD = set('cd pushd chdir set-location sl push-location');
  const READONLY = set('ls dir cat head tail less more wc grep egrep fgrep rg ag ack find fd tree file stat du df pwd echo printf which where whereis type date sort uniq cut tr diff cmp comm md5 md5sum shasum sha1sum sha256sum jq yq awk gawk sed basename dirname realpath readlink xxd hexdump od strings column nl true false test [ sleep ffprobe mdls mdfind identify exiftool get-content gc get-childitem gci select-string sls test-path get-item gi get-itemproperty gp resolve-path rvpa get-location gl split-path join-path get-filehash get-date get-process gps get-command gcm get-help select-object select where-object ? foreach-object % sort-object measure-object measure group-object format-table ft format-list fl format-wide out-string out-host out-null write-output write write-host get-acl get-psdrive cal uname whoami id hostname sw_vers system_profiler nproc uptime ps top lsof cd pushd popd');
  const WRITES = set('touch mkdir cp copy tee ln install zip unzip tar gzip gunzip ffmpeg convert magick sips truncate patch dd new-item ni md set-content add-content ac copy-item cpi out-file tee-object expand-archive compress-archive chmod');
  const INSTALL_TOOLS = set('brew apt apt-get yum dnf pacman port choco winget scoop softwareupdate snap flatpak mas install-module install-package install-script uninstall-module update-module');
  const PKG = { npm: /^(i|install|add|ci|uninstall|remove|rm|un|update|upgrade|link|publish|exec|x|dlx|create|init)$/, pnpm: /^(i|install|add|remove|rm|update|up|publish|dlx|create)$/, yarn: /^(add|install|remove|upgrade|publish|dlx|create|global)$/, bun: /^(add|install|i|remove|rm|update|publish|x|create)$/, pip: /^(install|uninstall|download)$/, pip3: /^(install|uninstall|download)$/, pipx: /.*/, gem: /^(install|uninstall|update|push)$/, cargo: /^(install|uninstall|publish|add)$/, go: /^(install|get)$/, conda: /^(install|remove|create|update)$/, uv: /^(add|pip|tool|remove)$/, composer: /^(require|install|update|remove)$/ };
  const NETWORK = set('curl wget nc ncat netcat telnet ftp rsync http https httpie aria2c invoke-webrequest iwr invoke-restmethod irm start-bitstransfer test-netconnection ping nslookup dig yt-dlp youtube-dl');
  const PUBLISH = set('vercel netlify firebase surge fly flyctl wrangler heroku twine gh glab railway render amplify');
  const SYSTEM = set('kill pkill killall taskkill shutdown reboot halt launchctl systemctl service crontab defaults diskutil mkfs fdisk format chown chgrp nvram csrutil spctl tccutil scutil networksetup pmset reg regedit setx osascript stop-process spps restart-computer stop-computer set-itemproperty sp new-itemproperty remove-itemproperty set-executionpolicy set-service stop-service start-service restart-service');
  const SHELLS = set('sh bash zsh fish dash ksh pwsh powershell cmd');
  const INLINE = { python: '-c', python3: '-c', node: '-e', ruby: '-e', perl: '-e', php: '-r', deno: 'eval', bun: '-e' };
  const GIT_READ = set('status log diff show branch rev-parse ls-files blame grep describe shortlog reflog config remote tag stash');
  const GIT_WRITE = set('add commit checkout switch merge rebase init mv restore cherry-pick revert worktree apply am');
  const GIT_NET = set('clone pull fetch submodule lfs');
  const cmdName = (w) => baseName(w).toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
  const ENV_ASSIGN = /^[A-Za-z_][\w]*=/;
  const isFlag = (w) => /^-/.test(w) || (/^\/[a-z?]{1,2}$/i.test(w));
  const hasGlob = (w) => /[*?[\]{}]|\$/.test(w);
  // PowerShell parameters whose value is not a file (-ItemType Directory, -Value "text", -Filter *.js): left out of the
  // paths; -Name / -NewName keep their value (a file name). Script-block braces and $null are not paths either.
  const PS_VALUE = /^-(itemtype|type|value|encoding|filter|include|exclude|depth|first|last|tail|totalcount|head|skip|pattern|simplematch|delimiter|property|erroraction|ea|warningaction|wa|outvariable|ov|errorvariable|ev|name|newname|algorithm|verb|argumentlist|windowstyle|seconds|milliseconds)$/i;
  const psClean = (args) => { const out = []; for (let i = 0; i < args.length; i++) { const a = args[i]; if (PS_VALUE.test(a)) { if (!/^-(name|newname)$/i.test(a)) i++; continue; } if (/^[{}()@%?]+$/.test(a) || /^\$(null|true|false)$/i.test(a)) continue; out.push(...a.split(',').filter(Boolean)); } return out; }; // a, b: a list
  const looksPath = (w) => /[\\/]/.test(w) || /^[.~]/.test(w) || /\.[A-Za-z0-9]{1,6}$/.test(w);

  // The findings for one simple command (words already split). ctx: { base, folders, home, cwd }.
  function commandFindings(words, ctx, out) {
    let w = words.slice();
    while (w.length && ENV_ASSIGN.test(w[0])) w.shift();
    // wrappers that only change how a command runs: look at the command they run
    while (w.length && /^(time|nice|nohup|command|exec|env|caffeinate|timeout|xargs|stdbuf)$/.test(cmdName(w[0]))) {
      const name = cmdName(w[0]);
      w.shift();
      if (name === 'env' && !w.length) { out.push({ verdict: 'ask', risk: 'low', action: 'secrets', why: 'prints every environment variable (they can hold keys)' }); return; }
      while (w.length && (isFlag(w[0]) || ENV_ASSIGN.test(w[0]) || (name === 'timeout' && /^\d/.test(w[0])))) w.shift();
    }
    // PowerShell: `(Get-ChildItem x)` starts with a bracket
    if (ctx.ps && w.length) { w[0] = w[0].replace(/^[@$]?\(+/, ''); if (!w[0]) w.shift(); }
    if (!w.length) return;
    const name = cmdName(w[0]);
    const raw = w.slice(1);
    const args = ctx.ps ? psClean(raw) : raw;
    const sub = (args.find((a) => !isFlag(a)) || '').toLowerCase();
    // PowerShell's $HOME / $env:USERPROFILE are the home folder
    const resolve = (p) => norm(ctx.ps ? String(p).replace(/^\$(home|env:userprofile)(?=[\\/]|$)/i, '~') : p, ctx.base, ctx.home);
    const outside = (paths) => paths.map(resolve).filter((p) => p && !insideAny(p, ctx.folders) && !/^\/dev\/(null|stdout|stderr|tty)$/.test(p));
    const pathArgs = (all = false) => args.filter((a) => !isFlag(a) && (all || looksPath(a)));

    if (CD.has(name)) { ctx.base = resolve(args.find((a) => !isFlag(a)) || ctx.home || '~'); return; }
    if (PASSWORD.has(name) || (name === 'security' && /unlock|add-generic|find-generic|find-internet|dump-keychain/.test(args.join(' '))) || (name === 'git' && /credential/.test(sub))) {
      out.push({ verdict: 'deny', risk: 'high', action: 'password', password: true, why: `${name} can ask for a password, and Hearth never handles passwords` }); return;
    }
    if (name === 'printenv' || (name === 'set' && !args.length) || name === 'history') { out.push({ verdict: 'ask', risk: 'low', action: 'secrets', why: 'prints environment variables / history (they can hold keys)' }); return; }
    if (SHELLS.has(name)) {
      const win = /^(pwsh|powershell|cmd)$/.test(name);
      if (win && raw.some((a) => /^-(e|ec|enc|encodedcommand)$/i.test(a))) { out.push({ verdict: 'ask', risk: 'high', action: 'run', why: 'an encoded PowerShell command Hearth can\'t read' }); return; }
      const i = raw.findIndex((a) => /^-\w*c$/.test(a) || /^-command$/i.test(a) || /^\/c$/i.test(a));
      if (i >= 0 && raw[i + 1]) { classifyShell(raw.slice(i + 1).join(' '), { ...ctx, ps: win }, out); return; }
      const script = pathArgs(true)[0];
      if (script && outside([script]).length) out.push({ verdict: 'ask', risk: 'high', action: 'run', targets: outside([script]), why: 'runs a script outside the chat\'s folders' });
      return;
    }
    if (name === 'eval' || name === 'invoke-expression' || name === 'iex') { classifyShell(raw.join(' '), ctx, out); return; }
    // PowerShell's Start-Process: as administrator is a password / UAC prompt; anything else starts a program
    if (name === 'start-process' || name === 'saps') {
      if (raw.some((a, j) => /^-verb$/i.test(raw[j - 1] || '') && /^runas$/i.test(a))) { out.push({ verdict: 'deny', risk: 'high', action: 'password', password: true, why: 'Start-Process -Verb RunAs asks for administrator rights, and Hearth never handles passwords' }); return; }
      out.push({ verdict: 'ask', risk: 'low', action: 'apps', why: 'starts a program or opens a file' }); return;
    }
    if (INLINE[name] && args.includes(INLINE[name])) {
      const code = args[args.indexOf(INLINE[name]) + 1] || '';
      if (/\b(rmtree|remove|unlink|rmdirSync|rmSync|rm\(|rmdir|unlinkSync|os\.remove|shutil\.rmtree|File\.delete|FileUtils\.rm)\b/.test(code)) out.push({ verdict: 'ask', risk: 'high', action: 'delete', why: 'inline code that deletes files' });
      else if (/\b(fetch|requests|urllib|http\.|https\.|socket|axios|XMLHttpRequest|Net::HTTP|open-uri)\b/.test(code)) out.push({ verdict: 'ask', risk: 'low', action: 'network', why: 'inline code that uses the network' });
      else if (/\b(subprocess|child_process|exec(Sync)?|spawn|system\(|os\.system|popen)\b/.test(code)) out.push({ verdict: 'ask', risk: 'low', action: 'run', why: 'inline code that starts other commands' });
      return;
    }
    if (DELETE.has(name) || (name === 'find' && args.some((a) => a === '-delete' || ((a === '-exec' || a === '-execdir') && /^(rm|unlink|shred)$/.test(cmdName(args[args.indexOf(a) + 1] || '')))))) {
      const targets = name === 'find' ? [args.find((a) => !isFlag(a)) || '.'] : pathArgs(true);
      const out0 = outside(targets);
      const plain = name !== 'find' && targets.length > 0 && !targets.some(hasGlob) && !ctx.complex;
      out.push({ verdict: 'ask', risk: out0.length || !plain ? 'high' : 'low', action: 'delete', targets: targets.map(resolve), plain, outsideTargets: out0,
        why: out0.length ? 'deletes files outside the chat\'s folders' : 'deletes files' });
      return;
    }
    if (name === 'trash' || name === 'gio' && sub === 'trash') { const o = outside(pathArgs(true)); out.push(o.length ? { verdict: 'ask', risk: 'low', action: 'delete', targets: o, why: 'moves files outside the folders to the Trash' } : { verdict: 'allow', action: 'delete', why: 'to the Trash (recoverable)' }); return; }
    if (MOVE.has(name)) {
      const t = pathArgs(true);
      const o = outside(t);
      out.push({ verdict: 'ask', risk: o.length ? 'high' : 'low', action: 'move', targets: t.map(resolve), why: o.length ? 'moves files across or outside the chat\'s folders' : 'moves / renames files (it can overwrite)' });
      return;
    }
    if (name === 'git') {
      const rest = args.join(' ');
      if (sub === 'push' || (sub === 'tag' && /-d|--delete/.test(rest)) || /^(send-email|request-pull)$/.test(sub)) { out.push({ verdict: 'ask', risk: 'high', action: 'publish', why: 'pushes to a remote (publishes your code)' }); return; }
      if ((sub === 'reset' && /--hard/.test(rest)) || sub === 'clean' || (sub === 'checkout' && /(^| )(--|\.)( |$)/.test(rest)) || (sub === 'restore' && !/--staged/.test(rest)) || (sub === 'branch' && /-D\b/.test(rest)) || (sub === 'stash' && /drop|clear/.test(rest)) || (sub === 'rm')) {
        out.push({ verdict: 'ask', risk: 'high', action: 'delete', why: `git ${sub} throws away work (not recoverable from the Trash)` }); return;
      }
      if (GIT_NET.has(sub) || (sub === 'remote' && /add|set-url/.test(rest))) { out.push({ verdict: 'ask', risk: 'low', action: 'network', why: `git ${sub} talks to a remote` }); return; }
      if (GIT_READ.has(sub) || GIT_WRITE.has(sub) || !sub) { if (ctx.base && !insideAny(ctx.base, ctx.folders) && !inside(ctx.base, ctx.cwd)) out.push({ verdict: 'ask', risk: 'low', action: 'run', targets: [ctx.base], why: 'a git command in a folder the chat wasn\'t given' }); return; }
      out.push({ verdict: 'ask', risk: 'low', action: 'run', why: `git ${sub}` }); return;
    }
    if (PKG[name] && PKG[name].test(sub)) {
      const publish = sub === 'publish' || (name === 'cargo' && sub === 'publish') || (name === 'gem' && sub === 'push');
      out.push({ verdict: 'ask', risk: 'high', action: publish ? 'publish' : 'install', why: publish ? `${name} ${sub} publishes a package` : `${name} ${sub} installs or removes software (and downloads it)` }); return;
    }
    if (name === 'npx' || name === 'bunx' || name === 'pnpx') { out.push({ verdict: 'ask', risk: 'low', action: 'install', why: `${name} may download and run a package` }); return; }
    if (INSTALL_TOOLS.has(name)) { out.push({ verdict: 'ask', risk: 'high', action: 'install', why: `${name} installs or changes software on this computer` }); return; }
    if (NETWORK.has(name)) {
      const o = name === 'rsync' ? outside(pathArgs()) : [];
      out.push({ verdict: 'ask', risk: o.length || args.some((a) => /^(-T|--upload-file|-d|--data|-F|--form|-X)$/.test(a)) || /POST|PUT|DELETE/.test(args.join(' ')) ? 'high' : 'low', action: 'network', why: `${name} uses the network` }); return;
    }
    if (PUBLISH.has(name) || (name === 'docker' && /push|login/.test(sub)) || (name === 'aws' && /s3|deploy|lambda|cloudformation/.test(sub))) { out.push({ verdict: 'ask', risk: 'high', action: 'publish', why: `${name} ${sub} publishes / deploys or changes an online account` }); return; }
    if (SYSTEM.has(name)) {
      if (name === 'chmod' || name === 'chown') { const o = outside(pathArgs(true).slice(1)); if (!o.length && name === 'chmod') return; }
      if (name === 'defaults' && /^(read|domains|find)$/.test(sub)) return;
      out.push({ verdict: 'ask', risk: 'high', action: name === 'osascript' ? 'apps' : 'system', why: name === 'osascript' ? 'controls other apps with AppleScript' : `${name} changes the system or stops programs` }); return;
    }
    if (name === 'open' || name === 'xdg-open' || name === 'start' || name === 'invoke-item') {
      if (args.some((a) => /^https?:/i.test(a))) { out.push({ verdict: 'ask', risk: 'low', action: 'network', why: 'opens a web page' }); return; }
      const o = outside(pathArgs().filter((a) => !/^-a$/.test(a)));
      if (o.length && !args.includes('-a')) out.push({ verdict: 'ask', risk: 'low', action: 'apps', targets: o, why: 'opens files outside the chat\'s folders' });
      return;
    }
    if (READONLY.has(name)) {
      if (name === 'sed' && args.some((a) => /^-i|^--in-place/.test(a))) { const o = outside(pathArgs()); if (o.length) out.push({ verdict: 'ask', risk: 'high', action: 'write', targets: o, why: 'edits files outside the chat\'s folders' }); return; }
      if (name === 'awk' && /system\(|print\s*>/.test(args.join(' '))) { out.push({ verdict: 'ask', risk: 'low', action: 'run', why: 'awk that writes files or runs commands' }); return; }
      const ps = pathArgs().filter((a) => !(ctx.ps && /^\$[\w:]+(\.\w+)*$/.test(a))); // a PowerShell variable ($_.Name) isn't a file
      const secret = ps.map(resolve).filter((p) => SECRET_FILE.test(p));
      if (secret.length) { out.push({ verdict: 'ask', risk: 'high', action: 'secrets', targets: secret, why: 'reads a file that usually holds keys or passwords' }); return; }
      const o = outside(ps);
      if (o.length) out.push({ verdict: 'ask', risk: 'low', action: 'read', targets: o, why: 'reads outside the chat\'s folders' });
      return;
    }
    if (WRITES.has(name)) {
      let t = pathArgs(true);
      if (name === 'ffmpeg' || name === 'convert' || name === 'magick' || name === 'sips') t = t.slice(-1);
      if (/^(cp|copy|ln|install|copy-item)$/.test(name) && t.length > 1) { const src = outside(t.slice(0, -1)); if (src.length) out.push({ verdict: 'ask', risk: 'low', action: 'read', targets: src, why: 'copies from outside the chat\'s folders' }); t = t.slice(-1); }
      if (name === 'chmod') t = t.slice(1);
      const o = outside(t);
      if (o.length) out.push({ verdict: 'ask', risk: 'high', action: 'write', targets: o, why: 'writes outside the chat\'s folders' });
      return;
    }
    // anything else (node, python, make, npm run, ffmpeg …): running is what Full allows; scripts outside the folders ask
    const script = args.find((a) => !isFlag(a) && looksPath(a));
    if ((/^(node|python3?|ruby|perl|php|deno|bun|swift|java)$/.test(name) && script && outside([script]).length) || (isAbs(w[0]) && outside([w[0]]).length && !/^\/(usr|bin|opt|Applications|System)\//.test(norm(w[0])))) {
      out.push({ verdict: 'ask', risk: 'low', action: 'run', targets: outside([script || w[0]]), why: 'runs a program outside the chat\'s folders' });
    }
  }

  function classifyShell(cmd, ctx, out) {
    const t = tokenize(String(cmd || ''), { ps: Boolean(ctx.ps) });
    const local = { ...ctx, complex: ctx.complex || t.complex };
    if (t.unclosed) out.push({ verdict: 'ask', risk: 'high', action: 'run', why: 'a command Hearth can\'t read (unclosed quote)' });
    for (let i = 0; i < t.segs.length; i++) {
      const seg = t.segs[i];
      // `curl … | sh`: downloading and running
      if (t.segs[i - 1]?.join === '|' && SHELLS.has(cmdName(seg.words[0] || '')) && t.segs[i - 1].words.some((x) => NETWORK.has(cmdName(x)))) out.push({ verdict: 'ask', risk: 'high', action: 'install', why: 'downloads and runs a script' });
      commandFindings(seg.words, local, out);
      for (const r of seg.redirects) {
        if (r.op === '<') continue;
        const p = norm(r.target, local.base, local.home);
        if (/^\/dev\/(null|stdout|stderr|tty)$/.test(p) || /^nul$/i.test(r.target)) continue;
        if (!insideAny(p, local.folders)) out.push({ verdict: 'ask', risk: 'high', action: 'write', targets: [p], why: 'writes a file outside the chat\'s folders' });
      }
    }
    // $(…) and backticks: what runs inside them is classified too
    if (!ctx.ps) for (const m of String(cmd).matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) classifyShell(m[1] || m[2] || '', { ...local }, out);
    else {
      // PowerShell: script blocks { … } (ForEach-Object, Where-Object…), $( … ) and ( Verb-Noun … ) run too
      for (const m of String(cmd).matchAll(/\{([^{}]*)\}|\$\(([^()]*)\)|\((\s*[A-Za-z]+-[A-Za-z][^()]*)\)/g)) classifyShell(m[1] || m[2] || m[3] || '', { ...local }, out);
      // .NET file calls ([IO.File]::Delete(…), $f.Delete()) can't be checked: a careful card
      const net = /\]::(Delete|Move|Copy|Replace|WriteAll\w*|AppendAll\w*|Create\w*)\s*\(|\.(Delete|MoveTo|CopyTo)\s*\(/i.exec(String(cmd));
      if (net) out.push({ verdict: 'ask', risk: 'high', action: /delete/i.test(net[0]) ? 'delete' : 'write', why: 'calls .NET file methods Hearth can\'t check' });
    }
    return { segs: t.segs, base: local.base, complex: local.complex };
  }

  const ORDER = { deny: 3, ask: 2, allow: 1 };
  const ACTION_WORD = { read: 'Read', write: 'Write', delete: 'Delete', move: 'Move', run: 'Run', install: 'Install', network: 'Use the network', publish: 'Publish', system: 'Change the system', apps: 'Control apps', secrets: 'Read secrets', password: 'Needs a password' };

  // The decision for one tool call. folders: the chat's folders (absolute); cwd: where the engine runs (relative paths).
  function classify({ tool, input = {}, level = 'off', folders = [], cwd = '', home = '' } = {}) {
    winHost = isWinPath(String(home || ''));
    const fs0 = folders.map((f) => norm(f, '', home)).filter(Boolean);
    const base = norm(cwd || '', '', home);
    const L = LEVELS.includes(level) ? level : 'off';
    const r = (o) => ({ verdict: 'allow', risk: 'low', targets: [], where: '', ...o, tool, level: L });
    const where = (ps) => [...new Set(ps.map((p) => dirName(p)))].slice(0, 3).join(', ');
    if (L === 'off') return r({ verdict: 'deny', risk: 'low', action: 'read', what: `${tool}`, why: 'File access is off for this chat' });
    const file = input.file_path || input.notebook_path || input.path || '';
    if (READ_TOOLS.has(tool)) {
      const p = file ? norm(file, base, home) : (fs0[0] || base);
      const what = tool === 'Read' ? `Read ${baseName(p)}` : `${tool === 'Grep' ? 'Search' : 'List'} ${input.pattern ? `"${String(input.pattern).slice(0, 40)}"` : ''} in ${baseName(p)}`.replace(/\s+/g, ' ');
      if (SECRET_FILE.test(p)) return r({ verdict: 'ask', risk: 'high', action: 'secrets', what, targets: [p], where: dirName(p), why: 'this file usually holds keys or passwords', grant: `secrets:${p}` });
      if (insideAny(p, fs0)) return r({ action: 'read', what, targets: [p], where: dirName(p) });
      return r({ verdict: 'ask', risk: 'low', action: 'read', what, targets: [p], where: dirName(p), why: 'outside the chat\'s folders', grant: `read:${dirName(p)}` });
    }
    if (WRITE_TOOLS.has(tool)) {
      const p = norm(file, base, home);
      const what = `${tool === 'Write' ? 'Write' : 'Edit'} ${baseName(p)}`;
      if (rank(L) < rank('write')) return r({ verdict: 'deny', action: 'write', what, targets: [p], where: dirName(p), why: 'This chat can only read files (the user can allow edits in ⋯ AI setup → Files on this computer)' });
      if (!p) return r({ verdict: 'ask', risk: 'high', action: 'write', what, why: 'no file named' });
      if (insideAny(p, fs0)) return r({ action: 'write', what, targets: [p], where: dirName(p), backup: p });
      return r({ verdict: 'ask', risk: 'high', action: 'write', what, targets: [p], where: dirName(p), backup: p, why: 'writes outside the chat\'s folders', grant: `write:${dirName(p)}` });
    }
    if (tool === 'Bash' || tool === 'PowerShell') {
      const cmd = String(input.command || '');
      const what = `Run: ${redact(cmd).replace(/\s+/g, ' ').slice(0, 140)}`;
      if (rank(L) < rank('full')) return r({ verdict: 'deny', action: 'run', what, why: 'This chat can\'t run commands (the user can choose Full in ⋯ AI setup → Files on this computer)' });
      const found = [];
      // (winshell) Claude Code on Windows runs commands through its PowerShell tool: PowerShell's quoting and verbs
      const sh = classifyShell(cmd, { base, folders: fs0, home: norm(home), cwd: base, complex: false, ps: tool === 'PowerShell' }, found);
      const worst = found.reduce((a, f) => (!a || ORDER[f.verdict] > ORDER[a.verdict] || (ORDER[f.verdict] === ORDER[a.verdict] && f.risk === 'high' && a.risk !== 'high') ? f : a), null);
      const targets = [...new Set(found.flatMap((f) => f.targets || []))];
      if (!worst || worst.verdict === 'allow') return r({ action: 'run', what, where: sh.base && insideAny(sh.base, fs0) ? sh.base : '', targets });
      const deletes = found.filter((f) => f.action === 'delete');
      // only `[cd X &&] rm a b` (plain paths, nothing else risky): Hearth can do it with the Trash instead
      const onlyRm = deletes.length && found.every((f) => f.action === 'delete' && f.plain) && sh.segs.every((s, i) => DELETE.has(cmdName(s.words[0] || '')) || (CD.has(cmdName(s.words[0] || '')) && i < sh.segs.length - 1)) && sh.segs.every((s) => !s.redirects.length && (s.join === '&&' || s.join === ';' || s.join === null));
      const trash = onlyRm ? deletes.flatMap((f) => f.targets) : null;
      // a delete Hearth can't send to the Trash isn't recoverable: always the careful card
      if (deletes.length && !trash && worst.action === 'delete') worst.risk = 'high';
      const scope = (p) => (p ? fs0.find((f) => inside(p, f)) || dirName(p) : '');
      const grantKey = worst.password ? null : worst.action === 'delete' || worst.action === 'move' || worst.action === 'write' || worst.action === 'read' || worst.action === 'secrets'
        ? `${worst.action}:${scope(worst.targets?.[0]) || sh.base || ''}` : worst.action === 'run' || worst.action === 'system' || worst.action === 'apps' ? `${worst.action}:${cmdName(sh.segs.find((s) => s.words.length && !CD.has(cmdName(s.words[0])))?.words[0] || '')}` : worst.action;
      return r({ verdict: worst.verdict, risk: worst.risk || 'high', action: worst.action, what, targets, where: where(targets) || (insideAny(sh.base, fs0) ? sh.base : ""), why: worst.why, grant: grantKey, ...(trash ? { trash } : {}), ...(worst.password ? { password: true } : {}), findings: found.length });
    }
    // anything else the engine had to ask about (a connector tool it wasn't given, web fetch…): the owner decides
    return r({ verdict: 'ask', risk: /mcp__/.test(tool) && !/(get|list|search|read|fetch|find|view)/i.test(tool) ? 'high' : 'low', action: /^Web/.test(tool) ? 'network' : 'run', what: `Use ${tool.replace(/^mcp__([^_]+(?:_[^_]+)*)__/, '$1 · ')}`, why: 'a tool this chat wasn\'t given', grant: `tool:${tool}` });
  }

  return { classify, tokenize, norm, inside, insideAny, redact, LEVELS, LEVEL_LABEL, LEVEL_HINT, ACTION_WORD, rank, READ_TOOLS, WRITE_TOOLS, SECRET_FILE, baseName, dirName };
})();
if (typeof module !== 'undefined') module.exports = AccessRules;
