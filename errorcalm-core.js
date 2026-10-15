// (round 45, errorcalm) Errors in plain words: the pure part, shared by the window (errorcalm.js) and the Node tests
// (dev/errorcalm-test.js). No DOM, no IPC.
// Every error the owner can see becomes ONE plain sentence + the ONE action that fixes it; the raw text (codes, stack,
// JSON, the engine's own words) is kept for a small "Details" fold and for reports. Rounds 32–34 mapped their own
// areas (winpolish / macpolish: the engines on each system, offline: networks / limits / sign-in, renders: ffmpeg);
// this file asks those maps first and only adds what nobody mapped (Node's file errors, HTTP statuses, Electron's IPC
// wrapper, WebGL, JSON, code errors).
//   isRaw(text)               does it read like a machine wrote it (ENOENT, a stack, JSON, "undefined", spawn, IPC…)?
//   explain(raw, ctx)         → { kind, text, action: { id, label, target? }, path, raw } for one raw error
//   calm(message, ctx)        a whole message as shown ("Couldn't load song.wav: ENOENT: …"): the owner's words before
//                             the raw part are kept, the raw part becomes plain → { text, action, raw, changed }
//   lab(message, o)           a Lab scene's code error in plain words (the console keeps the raw line)
//   firstLine(err)            the error's own first line, without "Error:" and stack frames (the fallback)
// ctx (all optional): { where: 'file' | 'engine' | 'ffmpeg' | 'sync' | 'lab' | 'app' | 'gl', app: 'Meshy', engine:
//   'claude' | 'codex', path, what (the thing it was about: "the song"), platform, local (a service on this computer) }
// Actions (errorcalm.js runs them): retry (only when the caller can retry) · show (the file / its folder) · settings
// (a row of Settings / ⋯ AI setup, by its Find anything id) · checkai · restart · report · fixscene.
const ErrorCalmCore = (() => {
  const G = typeof globalThis !== 'undefined' ? globalThis : {};
  const NODE = typeof window === 'undefined' && typeof module !== 'undefined' && typeof require === 'function';
  // the other streams' maps: the window's globals, or required in Node (main process, tests)
  // (in the window, a lazy group's global is only read once the group is in: reading it earlier would load it)
  // (a script's top-level const isn't a property of window: each is read by its name, through `get`)
  const lib = (get, file, group) => {
    if (!NODE && group && G.Lazy?.isIn && !G.Lazy.isIn(group)) return null;
    try { const v = get(); if (v) return v; } catch { /* not here */ }
    if (!NODE) return null;
    try { return require(file); } catch { return null; }
  };
  /* global OfflineCore, RendersCore */
  const Offline = () => lib(() => (typeof OfflineCore !== 'undefined' ? OfflineCore : null), './offline-core');
  const Renders = () => lib(() => (typeof RendersCore !== 'undefined' ? RendersCore : null), './renders-core', 'renders');
  const WinP = () => (NODE ? lib(() => null, './winpolish') : null); // main-process modules: engines.js already used them for replies
  const MacP = () => (NODE ? lib(() => null, './macpolish') : null);

  // ---------- does it read like a machine wrote it? ----------
  const NODE_CODES = 'DEADLK|NOENT|ACCES|PERM|BUSY|EXIST|ISDIR|NOTDIR|NOTEMPTY|NOSPC|ROFS|MFILE|NFILE|NAMETOOLONG|XDEV|INVAL|PIPE|CONNREFUSED|CONNRESET|CONNABORTED|TIMEDOUT|NOTFOUND|AI_AGAIN|HOSTUNREACH|NETUNREACH|NETDOWN|ADDRINUSE|2BIG|CANCELED|OPNOTSUPP|LOOP|NOMEM|AGAIN|IO|SRCH|NOEXEC|BADF|DQUOT|FBIG|NXIO|NODEV|NOSYS|PROTO';
  const CODE = new RegExp(`\\bE(${NODE_CODES})\\b`);
  const SIGNS = [
    CODE, /\bERR_[A-Z0-9_]{3,}\b/, // Node's codes
    /^\s*at\s+\S.*(:\d+:\d+\)?|\(native\)|<anonymous>\)?)\s*$/m, /node:internal|\.m?js:\d+:\d+/, // a stack
    /\b(TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|AggregateError|DOMException|InternalError)\b/,
    /Cannot (read|set) propert(y|ies) of|is not a function|is not defined\b|is not iterable|is not a constructor|\b(undefined|null) is not\b|\[object [A-Z]\w+\]|Maximum call stack|Invalid array length/,
    /\bundefined\b|\bNaN\b/, /Unexpected token|Unexpected end of (JSON )?input|is not valid JSON|\bJSON\b/,
    /Error invoking remote method|No handler registered for|could not be cloned|\bIPC\b|ipcRenderer/,
    /\bspawn\b|\bMCP\b|\bstderr\b|\bstdout\b|\berrno\b|\bsyscall\b|\bsegfault\b|\bSIG(KILL|TERM|SEGV|ABRT|INT|HUP)\b/,
    /\bexit(ed)? (with )?(code|status) -?\d+|\bcode -?\d+$|Conversion failed!?|Invalid data found when processing input|moov atom not found/i,
    /\bHTTP\/?\d?(\.\d)? ?[1-5]\d\d\b|\bstatus( code)?:? ?[1-5]\d\d\b|\bstatusCode\b|\b[45]\d\d (Bad Request|Unauthorized|Payment Required|Forbidden|Not Found|Request Timeout|Conflict|Gone|Payload Too Large|Unprocessable|Too Many Requests|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out)\b/i,
    /\bGL_[A-Z_]{4,}\b|CONTEXT_LOST|WebGL context|webglcontextlost|THREE\.WebGLRenderer|GLSL|glCompileShader/i,
    /[{[]\s*"[\w$-]+"\s*:/, /\b0x[0-9a-f]{6,}\b/i, /file:\/\/\//,
    /\bfetch failed\b|Failed to fetch|NetworkError when attempting|socket hang up|getaddrinfo|\bECONN\w+/,
    /\bUNKNOWN: unknown error\b|cloud file provider/i, // (round 46) Windows' unmapped codes (OneDrive's online-only files)
  ];
  const isRaw = (text) => { const t = String(text ?? ''); return Boolean(t.trim()) && SIGNS.some((re) => re.test(t)); };

  // (round 46) the computer: given by the caller, else Node's, else the window's
  const platformOf = (ctx = {}) => ctx.platform || (NODE ? process.platform : typeof navigator !== 'undefined' ? (/Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux') : '');

  // ---------- small helpers ----------
  const STACK = /^\s*at\s+(?:.+\(.+:\d+:\d+\)|[^\s]+:\d+:\d+|node:|new |async |\S+\s*\(<anonymous>\)|\S+\s*\(native\))|^\s*at\s+\S+\s*$|^node:internal|^\s*\^+\s*$|^Node\.js v\d+/;
  const dropStack = (t) => String(t ?? '').split(/\r?\n/).filter((l) => !STACK.test(l)).join('\n').trim();
  // Electron's wrapper around a main-process error: "Error invoking remote method 'fs:read': Error: ENOENT…"
  const unwrap = (t) => String(t ?? '').replace(/^(Uncaught (\(in promise\) )?)?/, '').replace(/Error invoking remote method '[^']*':\s*/g, '').replace(/^(Error|\w+Error|Uncaught):\s*(?=\S)/, '').replace(/^Error:\s*/, '').trim();
  function firstLine(err) {
    const t = err && typeof err === 'object' ? (err.message || String(err)) : String(err ?? '');
    return unwrap(dropStack(t)).split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  }
  const base = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p || '');
  // the file an error names: Node's "open '/x/y.wav'", ffmpeg's "/x/y.wav: No such file…", "File not found: /x"
  function pathIn(t) {
    const s = String(t || '');
    const m = /\b(?:open|stat|lstat|scandir|mkdir|unlink|rename|rmdir|access|copyfile|readlink|utime|chmod|chown|watch|opendir|realpath|rm|cp|link|symlink|readdir|uv_cwd|spawn)\s+'([^']+)'/.exec(s)
      || /(?:^|\s)((?:[A-Za-z]:\\|\/|~\/)[^:'"\n]+?\.[A-Za-z0-9]{1,5}): (?:No such file|Permission denied|Invalid data|Is a directory|moov atom)/.exec(s)
      || /(?:File not found|No such file(?: or directory)?|not found|isn't there|does not exist)[:\s]+['"]?((?:[A-Za-z]:\\|\/|~\/)[^'"\n]+?)['"]?(?:\s|$)/i.exec(s);
    return m ? m[1].trim() : '';
  }
  const ENGINE_NAME = { claude: 'Claude', codex: 'Astra' };
  const sentence = (s) => { const t = String(s || '').trim().replace(/\s+/g, ' '); return !t ? t : /[.!?…]$/.test(t) ? t : `${t}.`; };
  const A = {
    retry: { id: 'retry', label: 'Retry' },
    show: { id: 'show', label: 'Show file' },
    folder: { id: 'show', label: 'Show folder', folder: true },
    checkai: { id: 'checkai', label: 'Check this AI', target: 'ai:check' },
    restart: { id: 'restart', label: 'Restart Hearth' },
    report: { id: 'report', label: 'Report…' },
    fixscene: { id: 'fixscene', label: '🩺 Fix my scene' },
    ffmpeg: { id: 'settings', label: 'Install ffmpeg…', target: 'set:check-computer' },
    computer: { id: 'settings', label: 'Check this computer', target: 'set:check-computer' },
    sync: { id: 'settings', label: 'Sync settings', target: 'set:sync' },
    claudePath: { id: 'settings', label: 'Claude program', target: 'set:claude-path' },
    codexPath: { id: 'settings', label: 'Codex program', target: 'set:codex-path' },
    meshyKey: { id: 'settings', label: 'Meshy key…', target: 'set:meshy-key' },
    files: { id: 'settings', label: 'Files it can use', target: 'ai:files' },
  };
  // an app's key row (Settings), when it has one
  const KEY_ROW = { meshy: A.meshyKey };

  // ---------- the map: [test, text(m, ctx), action] — first match wins ----------
  // text is ONE sentence for the owner; it may use ctx.what ("the song") or the file's name.
  const the = (ctx, p) => ctx.what || (p ? `“${base(p)}”` : 'That file');
  const appName = (ctx) => ctx.app || 'The service';
  // an HTTP status said as one ("HTTP 401", "status 404", "API Error: 400", "404 Not Found", a line that is just "404")
  // or its words; never any number that happens to be 401 ("line 401")
  // (the words as services write them, capitalised: "Not Found", never "not found" in a sentence)
  function http(codes, words) {
    const a = new RegExp(`\\b(?:HTTP\\/?[\\d.]* ?|status(?: code)?:? ?|API Error:? ?|statusCode:? ?)(?:${codes})\\b|^\\s*(?:${codes})\\s*$`, 'i');
    const b = new RegExp(`\\b(?:${words})\\b`);
    return { source: `http ${codes}`, exec: (t) => a.exec(t) || b.exec(t) };
  }
  const MAP = [
    // Chromium's own network words (a page in an app window, a website snapshot)
    [/\bERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NETWORK_CHANGED|NETWORK_IO_SUSPENDED|ADDRESS_UNREACHABLE|CONNECTION_(REFUSED|RESET|CLOSED|FAILED|TIMED_OUT|ABORTED)|TIMED_OUT|EMPTY_RESPONSE)\b/, (m, ctx) => `${ctx.app || 'The page'} couldn't be reached — check the internet connection, then try again`, A.retry],
    [/\bERR_(CERT_\w+|SSL_\w+|PROXY_\w+|TUNNEL_CONNECTION_FAILED)\b/, (m, ctx) => `A VPN, proxy or security setting on this network is blocking ${ctx.app || 'the page'}`, A.retry],
    [/\bERR_(BLOCKED_BY_\w+|ACCESS_DENIED|FILE_NOT_FOUND|INVALID_URL|UNSAFE_\w+|ABORTED)\b/, (m, ctx) => `${ctx.app || 'The page'} didn't open (it was blocked or isn't there)`, A.retry],
    // Electron: a part of Hearth that changed while it ran
    [/No handler registered for/, () => 'This part of Hearth was updated while it ran and needs a restart', A.restart],
    [/An object could not be cloned|could not be cloned/, () => 'Hearth couldn\'t pass that along inside itself (not your fault)', A.report],
    // the engines (Claude Code / Codex) missing
    [/Couldn.t find (Claude Code|Codex)|(claude|codex)(\.exe|\.cmd)?: (command )?not found|spawn \S*(claude|codex)(\.exe|\.cmd)? ENOENT/i,
      (m, ctx) => `Hearth can't find ${/codex/i.test(m[0]) || ctx.engine === 'codex' ? 'Astra (Codex)' : 'Claude (Claude Code)'} on this computer`, A.checkai],
    // ffmpeg / ffprobe missing
    [/spawn \S*ff(mpeg|probe)(\.exe)? ENOENT|ff(mpeg|probe) (isn.t installed|not found|is not installed)|ff(mpeg|probe): (command )?not found|'ff(mpeg|probe)' is not recognized/i,
      () => 'ffmpeg isn\'t installed, so Hearth can\'t make or read this video here', A.ffmpeg],
    // a program that is there but can't be started (not a program, not marked runnable, blocked)
    [/spawn (\S+?) (EACCES|EPERM|ENOEXEC|EINVAL|UNKNOWN)\b/, (m, ctx) => `Hearth couldn't start “${base(m[1])}”: it isn't a program this computer lets it run`, null,
      (ctx) => (ctx.engine === 'codex' ? A.codexPath : ctx.engine || ctx.where === 'engine' ? A.claudePath : A.computer)],
    // any other program
    [/spawn (\S+?) ENOENT/, (m) => `Hearth couldn't find the program “${base(m[1])}” on this computer`, A.computer],
    // a local service (OBS, Adobe's bridge, a game page, a tool server) not running
    [/ECONNREFUSED[^\n]*(127\.0\.0\.1|localhost|::1)|connect ECONNREFUSED (127\.0\.0\.1|::1)/, (m, ctx) => `${ctx.app ? `${ctx.app} isn't` : 'The app Hearth talks to isn\'t'} running or not ready yet — open it, then try again`, A.retry],
    // HTTP statuses (an app's service)
    [http('40[13]', 'Unauthorized|Forbidden|[Ii]nvalid (API |api )?key|invalid_api_key|[Aa]uthentication (failed|required)'),
      (m, ctx) => `${appName(ctx)} didn't accept your key or sign-in${KEY_ROW[String(ctx.app || '').toLowerCase()] ? ' — paste it again' : ''}`, null, (ctx) => KEY_ROW[String(ctx.app || '').toLowerCase()] || (ctx.where === 'engine' ? A.checkai : A.retry)],
    [http('402', 'Payment Required|insufficient (credits|balance|funds)|out of credits|not enough credits'), (m, ctx) => `${appName(ctx)} says your account is out of credits`, null, () => null],
    [http('413', 'Payload Too Large|Request Entity Too Large'), (m, ctx) => `That file is too big for ${ctx.app || 'the service'}`, null, () => null],
    [http('404|410', 'Not Found|Gone'), (m, ctx) => `${appName(ctx)} couldn't find that (it may have been deleted or moved)`, A.retry],
    [http('400|422', 'Bad Request|Unprocessable( Entity)?'), (m, ctx) => `${appName(ctx)} didn't accept that request`, A.report],
    [http('408|504', 'Gateway Time-?out|Request Timeout'), (m, ctx) => `${appName(ctx)} took too long to answer — try again`, A.retry],
    // Node's file errors (the file named when there is one)
    [new RegExp('\\bENOENT\\b|No such file or directory|cannot find the (file|path) specified|File not found', 'i'), (m, ctx, p) => `${the(ctx, p)} isn't there any more (moved, renamed or deleted)`, A.folder],
    [/\bEBUSY\b|resource busy or locked|being used by another process/i, (m, ctx, p) => `${the(ctx, p)} is open in another program — close it there, then try again`, A.retry],
    // (round 46) a cloud drive's online-only file it couldn't fetch: OneDrive paused / signed out (Windows says
    // "UNKNOWN" or "cloud file provider"), iCloud offline (EDEADLK)
    [/\bUNKNOWN: unknown error, (open|read|copyfile|stat|lstat|scandir)|cloud file provider|cloud operation|0x8007016a|\bEDEADLK\b|resource deadlock/i, (m, ctx, p) => `${p ? the(ctx, p) : 'That file'} is kept online by ${platformOf(ctx) === 'darwin' ? 'iCloud Drive' : platformOf(ctx) === 'win32' ? 'OneDrive' : 'a cloud drive'}, which couldn't download it right now — check it's running and signed in, then try again`, A.retry],
    // Windows: EPERM / EBUSY on a rename / delete is usually another program (an antivirus, a sync) holding the file
    [/\bEPERM\b[^\n]*\b(rename|unlink|rmdir|rm)\b/, (m, ctx, p) => (platformOf(ctx) === 'win32' ? `${the(ctx, p)} is held by another program (often an antivirus or OneDrive) — try again in a moment` : `Hearth wasn't allowed to change ${p ? the(ctx, p) : 'that file'} (it's locked or read-only)`), null, (ctx) => (platformOf(ctx) === 'win32' ? A.retry : A.folder)],
    [/\bE(ACCES|PERM)\b|permission denied|operation not permitted|access is denied/i, (m, ctx, p) => `Hearth wasn't allowed to open ${p ? the(ctx, p) : 'that file'} (${platformOf(ctx) === 'win32' ? 'it\'s read-only, or Windows Security\'s "Controlled folder access" blocks it' : platformOf(ctx) === 'darwin' ? 'it\'s locked, or macOS privacy settings block it: System Settings › Privacy & Security › Files and Folders' : 'it\'s protected or read-only'})`, A.folder],
    [/\bENOSPC\b|no space left|disk (is )?full|\bEDQUOT\b/i, () => 'The disk is full — free some space, then try again', A.folder],
    [/\bEROFS\b|read-only file system/i, (m, ctx, p) => `${p ? the(ctx, p) : 'That file'} is on a disk that can't be changed (read-only)`, A.folder],
    [/\bEEXIST\b|already exists/i, (m, ctx, p) => `Something named ${p ? the(ctx, p) : 'like that'} is already there`, A.folder],
    [/\bEISDIR\b|is a directory/i, (m, ctx, p) => `${p ? the(ctx, p) : 'That'} is a folder, not a file`, A.folder],
    [/\bENOTDIR\b|not a directory/i, () => 'Part of that path is a file where Hearth expected a folder', A.folder],
    [/\bENOTEMPTY\b|directory not empty/i, (m, ctx, p) => `${p ? the(ctx, p) : 'That folder'} isn't empty`, A.folder],
    [/\bENAMETOOLONG\b|name too long|path too long/i, () => 'That file\'s path is too long — move it to a shorter folder', A.folder],
    [/\bE[MN]FILE\b|too many open files/i, () => 'Too many files are open at once — restarting Hearth clears it', A.restart],
    [/\bEXDEV\b|cross-device/i, () => 'Hearth couldn\'t move it between two disks — try again', A.retry],
    [/\bENOMEM\b|out of memory|Array buffer allocation failed|Invalid array length|Allocation failed/i, () => 'The computer ran out of memory for this — close something heavy, then try again', A.retry],
    [/\bEADDRINUSE\b|address already in use/i, () => 'Another program is already using what Hearth needs (a port) — close it, then try again', A.retry],
    [/\bE2BIG\b|argument list too long/i, () => 'That was too much to pass along at once — try a smaller selection', A.retry],
    [/\bEINVAL\b/, () => 'Hearth couldn\'t do that the way it was asked (an unusual name or setting)', A.report],
    // WebGL / the graphics card
    [/CONTEXT_LOST|context (was )?lost|webglcontextlost|GPU process (crashed|was lost)/i, () => 'The graphics card reset the preview — it rebuilds by itself; restart Hearth if it stays blank', A.restart],
    [/Error creating WebGL context|WebGL (is )?(not )?(supported|available|unavailable)|could not create a WebGL|WebGL2? (context )?(creation )?failed/i, () => 'This computer couldn\'t start 3D graphics for the preview', A.restart],
    [/GL_OUT_OF_MEMORY|out of (video|gpu) memory/i, () => 'The graphics card ran out of memory — close other scenes or pick a smaller size', A.retry],
    [/GLSL|compile shader|glCompileShader|shader (failed|error|compil)/i, () => 'A shader in the scene doesn\'t compile', A.fixscene],
    // JSON / a garbled answer or file
    [/Unexpected token .{1,12} in JSON|Unexpected end of JSON input|is not valid JSON|JSON\.parse|Unexpected non-whitespace character after JSON/i,
      (m, ctx, p) => (p || ctx.where === 'file' ? `${the(ctx, p)} is damaged or isn't the kind of file Hearth expected` : `${ctx.app || 'The answer'} came back garbled — try again`), null, (ctx, p) => (p || ctx.where === 'file' ? A.folder : A.retry)],
    [/timed? ?out|did not answer|didn.t answer|ETIMEDOUT/i, (m, ctx) => `${ctx.app || 'It'} took too long to answer — try again`, A.retry],
    // code errors inside Hearth (the Lab's scene code goes through lab())
    [/\b(TypeError|ReferenceError|RangeError|SyntaxError|EvalError|URIError|InternalError)\b|Cannot (read|set) propert|is not a function|is not defined|is not iterable|is not a constructor|\[object \w+\]|Maximum call stack|\bundefined\b|\bnull\b/,
      () => 'Something went wrong inside Hearth (not your fault)', A.report],
  ];

  // ffmpeg's own failures: renders-core's map (round 13) when it is there, else a short fallback
  const FFMPEG = /ffmpeg|ffprobe|Conversion failed|Invalid data found|moov atom|Unknown encoder|Encoder not found|could not find codec|matches no streams|exit(ed)? (with )?code -?\d+/i;
  const FF_EXIT = { 1: 'ffmpeg couldn\'t convert this file with these settings', 69: 'ffmpeg couldn\'t read this file (damaged or an unusual format)', 137: 'ffmpeg was stopped from outside (the computer ran low on memory or slept)', 255: 'ffmpeg was stopped before it finished', '-2': 'ffmpeg was stopped before it finished', 234: 'ffmpeg was given a setting it doesn\'t know', 183: 'ffmpeg couldn\'t write the file', 254: 'ffmpeg couldn\'t open the file' };
  function ffmpegExplain(t, ctx, p) {
    const R = Renders();
    if (R?.explain) {
      const e = R.explain(t, ctx.platform || '');
      if (e && !/^It stopped (with|without)/.test(e.reason)) {
        const act = /not installed|install ffmpeg/i.test(e.reason) ? A.ffmpeg : /isn.t there|moved|damaged|being written/i.test(e.reason) ? A.folder : A.retry;
        return { kind: 'ffmpeg', text: sentence(e.reason), action: act };
      }
    }
    const code = /exit(?:ed)? (?:with )?(?:code|status) (-?\d+)|\bcode (-?\d+)$/i.exec(t);
    const c = code ? (code[1] ?? code[2]) : null;
    if (c != null) return { kind: 'ffmpeg', text: sentence(FF_EXIT[c] || 'ffmpeg stopped before it finished'), action: c === '69' || c === '254' ? A.folder : A.retry };
    if (/Conversion failed|Invalid argument|Error while|Error opening/i.test(t)) return { kind: 'ffmpeg', text: 'ffmpeg couldn\'t convert this file with these settings.', action: A.retry };
    if (/Invalid data found|moov atom|could not find codec|corrupt/i.test(t)) return { kind: 'ffmpeg', text: `${p ? `“${base(p)}”` : 'This video or sound file'} is damaged or still being written.`, action: A.folder };
    return null;
  }

  // the network / busy / limit / sign-in map (offline-core.js, round 34)
  function offlineExplain(t, ctx) {
    const O = Offline();
    const k = O?.classify?.(t)?.kind;
    if (!k) return null;
    const who = ctx.app || ENGINE_NAME[ctx.engine] || '';
    switch (k) {
      case 'offline': return { kind: 'offline', text: `There's no internet connection${who ? ` to ${who}` : ''} right now — check it, then try again.`, action: A.retry };
      case 'busy': return { kind: 'busy', text: `${who || 'The service'} is busy right now — try again in a moment.`, action: A.retry };
      case 'limit': return { kind: 'limit', text: `${who ? `${who}'s` : 'The'} usage limit is reached for now — it resets later.`, action: ctx.engine ? A.checkai : null };
      case 'signedout': return { kind: 'signedout', text: KEY_ROW[String(ctx.app || '').toLowerCase()] ? `${ctx.app} didn't accept your key — paste it again.` : `${who || 'That service'} is signed out — sign in again.`, action: ctx.engine || !ctx.app ? A.checkai : KEY_ROW[String(ctx.app).toLowerCase()] || A.retry };
      case 'proxy': return { kind: 'proxy', text: `A VPN or proxy on this network is blocking ${who || 'the connection'}.`, action: A.retry };
      default: return null;
    }
  }

  // engines' own errors on Windows / macOS (winpolish / macpolish, rounds 32–33): Node only (main process, tests)
  function systemExplain(t, ctx) {
    const plat = ctx.platform || (typeof process !== 'undefined' ? process.platform : '');
    const hit = plat === 'win32' ? WinP()?.plainError?.(t) : plat === 'darwin' ? MacP()?.plainError?.(t, {}) : null;
    if (!hit) return null;
    return { kind: `system-${hit.action}`, text: sentence(hit.text), action: hit.action === 'privacy' ? A.files : A.checkai };
  }

  // ---------- one raw error → { kind, text, action, path, raw } ----------
  function explain(raw, ctx = {}) {
    const full = String(raw && typeof raw === 'object' ? (raw.stack && !raw.message ? raw.stack : raw.message || String(raw)) : raw ?? '');
    const t = unwrap(dropStack(full)) || full;
    const p = ctx.path || pathIn(t);
    // (sync: a file problem is the sync folder's: its row in Settings is the fix, not a folder that may be gone)
    const out = (o) => ({ kind: o.kind, text: sentence(o.text), action: ctx.where === 'sync' && o.action?.id === 'show' ? A.sync : o.action || null, path: p || '', raw: full.trim() });
    if (ctx.where === 'lab') return out({ kind: 'lab', ...lab(t) });
    // the most specific maps first: the engines on this system, then programs / files, then the network family
    if (ctx.where === 'engine' || /claude|codex/i.test(t)) { const s = systemExplain(t, ctx); if (s) return out(s); }
    const spawnish = /\bspawn\b|not recognized|command not found|Couldn.t find/i.test(t);
    if (!spawnish && (ctx.where === 'ffmpeg' || /ffmpeg|ffprobe|Conversion failed|Invalid data found|moov atom/i.test(t)) && FFMPEG.test(t)) { const f = ffmpegExplain(t, ctx, p); if (f) return out(f); }
    const local = /ECONNREFUSED[^\n]*(127\.0\.0\.1|localhost|::1)/.test(t) || ctx.local;
    if (!spawnish && !local && !/\b(ENOENT|EACCES|EPERM|EBUSY|ENOSPC)\b/.test(t)) { const o = offlineExplain(t, ctx); if (o) return out(o); }
    for (const [re, text, action, actFn] of MAP) {
      const m = re.exec(t);
      if (!m) continue;
      const act = actFn ? actFn(ctx, p) : action;
      return out({ kind: re.source.slice(0, 24), text: text(m, ctx, p), action: act === undefined ? action : act });
    }
    if (ctx.local && /ECONNREFUSED/.test(t)) return out({ kind: 'local', text: `${ctx.app || 'The app Hearth talks to'} isn't running — open it, then try again`, action: A.retry });
    // nothing matched: an unknown raw text still never shows as the sentence
    return out({ kind: 'unknown', text: ctx.app ? `${ctx.app} ran into a problem it didn't explain` : 'Something unexpected went wrong', action: A.report });
  }

  // ---------- a whole message → the owner's words kept, the raw part plain ----------
  // "Couldn't load song.wav: ENOENT: no such file…" → "Couldn't load song.wav: “song.wav” isn't there any more (moved,
  // renamed or deleted)." A message that doesn't read raw is left exactly as it is (changed: false).
  const PROPER = /^(Hearth|Claude|Astra|Codex|Meshy|Suno|Adobe|Photoshop|After Effects|Premiere|OBS|Windows|macOS|Mac|Chrome|ffmpeg|GitHub|Google|Pinterest|WebGL|“)/;
  const lower = (s) => (PROPER.test(s) || /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  function split(message) {
    const t = String(message ?? '');
    // the owner's words: a short lead before ": " / " — " that doesn't itself read raw ("Couldn't save the scene")
    const re = /(:\s+|\s+—\s+|\s+-\s+)/g;
    let m;
    while ((m = re.exec(t))) {
      const lead = t.slice(0, m.index).trim();
      const rest = t.slice(m.index + m[0].length);
      if (!lead || lead.length > 90 || /^([A-Za-z]:\\|\/|~\/|\\\\)/.test(lead)) break; // (a path is never the owner's words)
      if (/^(Error|Uncaught|\w*Error|E[A-Z]{3,}|ERR_\w+|HTTP.*|API Error.*|Status.*|\d+|spawn .*|open|stat|scandir|mkdir|unlink|rename|read|write)$/i.test(lead) || isRaw(lead)) break;
      if (/\bline \d+\b/.test(lead)) break;
      if (isRaw(rest)) return { lead: lead.replace(/[.:]$/, ''), raw: rest };
    }
    return { lead: '', raw: t };
  }
  function calm(message, ctx = {}) {
    const msg = message && typeof message === 'object' ? (message.message || String(message)) : String(message ?? '');
    if (!isRaw(msg)) {
      // a place that gave its own words (ctx.lead) and a reason that already reads plain: both, as one sentence
      if (ctx.lead) return { text: `${ctx.lead}: ${lower(sentence(firstLine(msg) || msg))}`, action: null, raw: msg, changed: true, plain: true };
      return { text: msg, action: null, raw: '', changed: false };
    }
    const { lead, raw } = ctx.lead != null ? { lead: ctx.lead, raw: msg } : split(msg);
    const e = explain(raw, ctx);
    let text = lead ? `${lead}: ${lower(e.text)}` : e.text;
    // a lead that already says "it broke" needs no generic second half ("Something broke inside Hearth.")
    if (lead && /^Something (went wrong inside Hearth|unexpected went wrong)/.test(e.text) && /inside Hearth|went wrong|broke|failed|didn.t work/i.test(lead)) text = sentence(lead);
    // the lead often says what the plain sentence says again ("Couldn't open song.wav: “song.wav” isn't there…")
    if (lead && e.path && lead.includes(base(e.path))) text = `${lead}: ${lower(e.text.replace(`“${base(e.path)}”`, 'it'))}`;
    return { text, action: e.action, raw: (message && typeof message === 'object' && message.stack) || msg, path: e.path, kind: e.kind, changed: true };
  }

  // ---------- the Lab: a scene's code error in plain words (the console keeps the raw line for code work) ----------
  // o: { line, layer } → { text, action }
  function lab(message, o = {}) {
    const t = unwrap(String(message ?? ''));
    const at = `${o.line ? ` on line ${o.line}` : ''}${o.layer ? ` (layer “${o.layer}”)` : ''}`;
    let m;
    let s;
    if ((m = /^(?:ReferenceError: )?([$\w.]+) is not defined/.exec(t))) s = `Your scene uses “${m[1]}”${at}, which doesn't exist (a typo, or something not loaded)`;
    else if ((m = /Cannot read propert(?:y|ies) of (?:undefined|null)(?: \(reading '([^']+)'\))?/.exec(t))) s = `Your scene asks for ${m[1] ? `“${m[1]}” of ` : ''}something that isn't there yet${at}`;
    else if ((m = /Cannot set propert(?:y|ies) of (?:undefined|null)(?: \(setting '([^']+)'\))?/.exec(t))) s = `Your scene sets ${m[1] ? `“${m[1]}” on ` : ''}something that isn't there yet${at}`;
    else if ((m = /([$\w.]+(?:\(\.\.\.\))?) is not a function/.exec(t))) s = `Your scene calls “${m[1].replace(/\(\.\.\.\)$/, '')}”${at}, which isn't something it can call`;
    else if ((m = /([$\w.]+) is not a constructor/.exec(t))) s = `Your scene makes a “new ${m[1]}”${at}, which can't be made that way`;
    else if (/SyntaxError|Unexpected token|Unexpected end of input|missing \) after|Unterminated|Invalid or unexpected token|Unexpected identifier/.test(t)) s = `Your scene's code has a typo${at} (a missing bracket, comma or quote)`;
    else if (/GLSL|shader|ERROR: 0:\d+/i.test(t)) s = `A shader in your scene doesn't compile${at}`;
    else if (/CONTEXT_LOST|context lost/i.test(t)) return { text: 'The graphics card reset the preview — it rebuilds by itself.', action: A.restart };
    else if (/Maximum call stack|too much recursion/.test(t)) s = `Your scene calls itself without end${at}`;
    else if (/out of memory|Invalid array length|Array buffer allocation/i.test(t)) s = `Your scene asked for more memory than the preview has${at}`;
    else if (/Failed to fetch|NetworkError|404|Not Found|Failed to load|Could not load/i.test(t)) s = `Your scene couldn't load a file it asked for${at}`;
    else s = `Your scene's code stopped with an error${at}`;
    return { text: sentence(s), action: A.fixscene };
  }

  return { isRaw, explain, calm, split, lab, firstLine, dropStack, unwrap, pathIn, base, ACTIONS: A, MAP };
})();
if (typeof module !== 'undefined') module.exports = ErrorCalmCore;
