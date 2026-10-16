// (round 31, winmac) The owner works on a Mac and a Windows PC every day: the small path / URL / key-name helpers that
// have to behave the same on both, in one place. Plain functions, no Electron, no DOM: the window loads it as a
// <script> (global WinMac, before ui.js), main-side files require() it, dev/winmac-test.js runs it with both path
// flavours (path.win32 / path.posix).
//   WinMac.fileUrl('C:\\Clips\\take #2.mp4')   → 'file:///C:/Clips/take%20%232.mp4'
//   WinMac.fileUrl('/Users/me/Músic/a b.wav')  → 'file:///Users/me/M%C3%BAsic/a%20b.wav'
//   WinMac.fileUrl('\\\\nas\\share\\a.png')    → 'file://nas/share/a.png'
//   WinMac.fromFileUrl('file:///C:/a%20b/c.png') → 'C:/a b/c.png' (fromFileUrl(u, { win: true }) → 'C:\\a b\\c.png')
//   WinMac.baseName / dirName / extOf / parts: split on / and \ alike (a Windows path read on the Mac and back)
//   WinMac.macKeys('Undo (Ctrl+Z)')            → 'Undo (⌘Z)' on a Mac (the window passes { mac }), unchanged elsewhere
//   WinMac.withToolDirs(env, …)               → PATH with Homebrew / npm / volta / bun / nvm folders a Dock launch lacks
const WinMac = (() => {
  const PASS = /^(?:data|blob|https?|file|hearth-[\w-]+|about|chrome|devtools):/i;
  const DRIVE = /^[A-Za-z]:(?:[\\/]|$)/;
  const UNC = /^[\\/]{2}(?![\\/?.])[^\\/]+[\\/]+[^\\/]+/;

  // an absolute (or relative) file path → a file: URL the window can load: every name part encoded (spaces, # ? %,
  // accents, emoji), the drive letter kept ("C:"), \ read as /, a UNC share as the URL's host. URLs pass through.
  function fileUrl(p) {
    if (p == null || p === '') return '';
    let s = String(p);
    if (PASS.test(s) && !DRIVE.test(s)) return s;
    s = s.replace(/^[\\/]{2}\?[\\/]UNC[\\/]/i, '\\\\').replace(/^[\\/]{2}\?[\\/]/, ''); // a Windows long-path name (\\?\C:\…)
    if (UNC.test(s)) {
      const [host, ...rest] = s.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
      return `file://${host}/${rest.map(encodeURIComponent).join('/')}`;
    }
    const f = s.replace(/\\/g, '/').replace(/^\/+/, '');
    return `file:///${f.split('/').map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg.toUpperCase() : encodeURIComponent(seg))).join('/')}`;
  }
  // a file: URL → the path it names ("/Users/x/a b.png", "C:/x/a b.png"; { win: true } → "C:\\x\\a b.png");
  // anything that isn't a file: URL comes back as it was
  function fromFileUrl(u, { win = false } = {}) {
    const s = String(u ?? '');
    if (!/^file:/i.test(s)) return s;
    const m = /^file:\/\/([^/]*)(\/.*)?$/i.exec(s.replace(/[?#].*$/, '')) || [null, '', s.replace(/^file:/i, '')];
    const host = m[1] && m[1].toLowerCase() !== 'localhost' ? m[1] : '';
    let p = m[2] || '/';
    try { p = decodeURIComponent(p); } catch { /* left as it was */ }
    if (host) p = `//${host}${p}`;
    else if (/^\/[A-Za-z]:(?:\/|$)/.test(p)) p = p.slice(1);
    return win ? p.replace(/\//g, '\\') : p;
  }

  // ---------- names, either kind of slash ----------
  const parts = (p) => String(p ?? '').split(/[\\/]+/).filter(Boolean);
  const trimEnd = (p) => { const s = String(p ?? ''); return s.length > 1 && !/^[A-Za-z]:[\\/]$/.test(s) ? s.replace(/[\\/]+$/, '') : s; };
  const baseName = (p) => { const s = trimEnd(p); return s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1); };
  function dirName(p) {
    const s = trimEnd(p);
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    if (i < 0) return '';
    if (i === 0) return s[0]; // "/a" → "/"
    if (/^[A-Za-z]:$/.test(s.slice(0, i))) return s.slice(0, i + 1); // "C:\a" → "C:\"
    return s.slice(0, i);
  }
  // a name (or names) under a folder with the folder's own slash: "C:\Renders" + "a.mp4" → "C:\Renders\a.mp4",
  // "/Users/me/Renders/" + "a.mp4" → "/Users/me/Renders/a.mp4" (the window has no path.join; mixed "C:\x/a.mp4" paths
  // were shown to the owner and didn't compare equal to the same file named by Node)
  function join(dir, ...names) {
    const d = String(dir ?? '');
    const sep = /^[A-Za-z]:(?:\\|$)|^\\\\/.test(d) || (d.includes('\\') && !d.includes('/')) ? '\\' : '/';
    const rest = names.flatMap((n) => String(n ?? '').split(/[\\/]+/)).filter(Boolean);
    if (!d) return rest.join(sep);
    return rest.length ? `${d.replace(/[\\/]+$/, '') || d[0]}${d.replace(/[\\/]+$/, '') ? sep : ''}${rest.join(sep)}` : d;
  }
  // ".JPG" from a camera, ".MOV" from a phone: extensions compare lower-case ("" when there is none)
  const extOf = (p) => { const b = baseName(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
  // the same file named two ways? Windows and the Mac's usual disks ignore case; slashes and a trailing slash don't count
  const samePath = (a, b, { caseless = true } = {}) => {
    const n = (x) => trimEnd(String(x ?? '').replace(/\\/g, '/'));
    return caseless ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
  };

  // (round 46) one file named two ways? Windows paths (a drive / a share) without case and with either slash; the Mac
  // without case and in one Unicode form (Finder / FSEvents give decomposed accents, the window composed); Linux exactly
  function sameFile(a, b, { mac = onMac() } = {}) {
    const x = String(a ?? ''); const y = String(b ?? '');
    if (x === y) return true;
    if (/^[A-Za-z]:[\\/]|^[\\/]{2}/.test(x)) return x.replace(/\//g, '\\').toLowerCase() === y.replace(/\//g, '\\').toLowerCase();
    return mac ? x.normalize('NFC').toLowerCase() === y.normalize('NFC').toLowerCase() : false;
  }

  // ---------- key names ----------
  // "Ctrl+Shift+S" → "⌘⇧S" on a Mac (Hearth's own shortcuts take ⌘ where they say Ctrl). "Ctrl+click" stays: on a Mac
  // that is the right-click. { mac } defaults to this computer (a window: navigator.platform; Node: process.platform).
  const onMac = () => (typeof navigator !== 'undefined' && navigator.platform ? /Mac/.test(navigator.platform) : typeof process !== 'undefined' && process.platform === 'darwin');
  function macKeys(text, { mac = onMac(), shift = false } = {}) {
    if (!mac || text == null || typeof text !== 'string' || !/\b(?:Ctrl|Alt)\b/.test(text)) return text;
    let t = text.replace(/\bCtrl\/⌘\+?|⌘\/Ctrl\+?/g, '⌘+').replace(/\bCtrl\+(?!click|drag)/g, '⌘').replace(/\bAlt\+(?!click|drag)/g, '⌥');
    if (shift) t = t.replace(/\bShift\+/g, '⇧');
    return t.replace(/⌘\/⌘/g, '⌘').replace(/([⌘⌥⇧])\+/g, '$1');
  }

  // (round 46) "Ctrl/⌘+K" (written for both computers) as this computer says it: ⌘K on a Mac, Ctrl+K elsewhere
  function keyWords(text, { mac = onMac() } = {}) {
    if (text == null || typeof text !== 'string') return text;
    return mac ? macKeys(text, { mac: true }) : text.replace(/\bCtrl\/⌘\+?|⌘\/Ctrl\+?/g, 'Ctrl+');
  }

  // (round 49, winmac49) any shortcut as this computer says it, wherever it is written: "Ctrl+Shift+K", "Ctrl/⌘+K",
  // "⇧⌘K", "Cmd+K". The Mac: symbols in Apple's order (⌃⌥⇧⌘), no "+", "⌘-click" for the mouse ("Ctrl+click" stays: the
  // Mac's right-click); keys macOS itself takes with ⌘ (⌘Tab, ⌘Space, ⌥⌘D Dock, ⌥⌘H) are the real Control there (⌃),
  // which Hearth's handlers take too. Windows: "Ctrl+Alt+Shift+K" words. { both: true }: only the "Ctrl/⌘" spellings
  // (text that may name one system's keys on purpose: patch notes). Idempotent.
  const MODS = String.raw`(?:Ctrl\/⌘\+?|⌘\/Ctrl\+?|(?:Ctrl|Control|Cmd|Command|Alt|Option|Shift)\+|[⌃⌥⇧⌘]\+(?=(?:Ctrl|Alt|Shift|Cmd)\+))`; // (also "⌘+Alt+R")
  const KEY = String.raw`(?:F\d{1,2}(?!\d)|Enter|Return|Tab|Space|Esc(?:ape)?|Backspace|Delete|Del|Home|End|PgUp|PgDn|PageUp|PageDown|Insert|right-click|double-click|click|drag|wheel|scroll|drop|[A-Za-z0-9](?![A-Za-z0-9])|[↑↓←→↩⇥⌫,.;:'/\\=\-+\`\[\]{}|?<>*])`;
  const WORD_CHAIN = new RegExp(`(?<![A-Za-z/])((?:${MODS})+)(${KEY})`, 'g');
  const SYM_KEY = new RegExp(`[⌃⌥⇧⌘]+(?!\\+)${KEY}`); // a symbol naming a key ("⌘V"; not "⌘ Command palette")
  const SYM_CHAIN = new RegExp(`((?:[⌃⌥⇧⌘]\\+?){1,4})(${KEY})`, 'g');
  const MOUSE = /^(?:right-click|double-click|click|drag|wheel|scroll|drop)$/;
  const MAC_ORDER = ['ctrl', 'alt', 'shift', 'cmd'];
  const MAC_SYM = { ctrl: '⌃', alt: '⌥', shift: '⇧', cmd: '⌘' };
  const WIN_WORD = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', cmd: 'Ctrl' };
  // Hearth's Ctrl shortcuts macOS keeps for itself with ⌘: shown (and pressed) with the real Control key on a Mac
  const MAC_REAL_CTRL = new Set(['ctrl+tab', 'ctrl+shift+tab', 'ctrl+space', 'ctrl+alt+space', 'ctrl+alt+h', 'ctrl+alt+d', 'ctrl+alt+esc']);
  const modOf = (m) => (/^⌘\/|\/⌘|^cmd|^command|^⌘/i.test(m) ? 'cmd' : /^(?:control|⌃)/i.test(m) ? 'ctrl' : /^ctrl/i.test(m) ? 'ctrl?' : /^(?:alt|option|⌥)/i.test(m) ? 'alt' : 'shift');
  function sayChain(mods, key, mac) {
    const k = key.length === 1 ? key.toUpperCase() : key;
    const plain = mods.filter((m) => m !== 'cmd').map((m) => m.replace('?', '')).concat(k.toLowerCase()).join('+');
    const realCtrl = mac && mods.every((m) => m !== 'cmd') && MAC_REAL_CTRL.has(plain);
    const set = new Set(mods.map((m) => (m === 'ctrl?' ? (mac && !realCtrl ? 'cmd' : 'ctrl') : m)));
    if (mac) return `${MAC_ORDER.filter((m) => set.has(m)).map((m) => MAC_SYM[m]).join('')}${MOUSE.test(k) ? '-' : ''}${k}`;
    const words = new Set(mods.map((m) => WIN_WORD[m.replace('?', '')]));
    return [...['Ctrl', 'Alt', 'Shift'].filter((w) => words.has(w)), k].join('+'); // Windows' own order
  }
  function keyLabel(text, { mac = onMac(), both = false } = {}) {
    if (text == null || typeof text !== 'string' || !/Ctrl|Control|Cmd|Command|Alt|Option|Shift|[⌃⌥⇧⌘]/.test(text)) return text;
    // a text that names both systems' keys on purpose ("⌘V / Ctrl+V") keeps them; only "Ctrl/⌘" is made this one's
    const rest = text.replace(/Ctrl\/⌘|⌘\/Ctrl/g, '');
    if (!both && /(?<![A-Za-z/])(?:Ctrl|Alt|Cmd)\+/.test(rest) && SYM_KEY.test(rest)) both = true;
    let t = text.replace(WORD_CHAIN, (all, chain, key) => {
      if (both && !/⌘/.test(chain)) return all;
      if (mac && /^Ctrl\+$/.test(chain) && key === 'click') return all; // the Mac's right-click, said as such
      return sayChain(chain.match(/Ctrl\/⌘|⌘\/Ctrl|[A-Za-z]+|[⌃⌥⇧⌘]/g).map(modOf), key, mac);
    });
    // (⌃ names the Mac's own Control key — "F11 / ⌃⌘F": Windows leaves it as written)
    if (!both) t = t.replace(SYM_CHAIN, (all, chain, key) => (!mac && chain.includes('⌃') ? all : sayChain([...chain.replace(/\+/g, '')].map(modOf), key, mac)));
    return t.replace(/Ctrl\/⌘|⌘\/Ctrl/g, mac ? '⌘' : 'Ctrl');
  }

  // (round 49) a key that TYPES a character is not a shortcut. Windows: AltGr arrives as Ctrl+Alt (AZERTY's @ # { [ | \ ~,
  // QWERTZ's @ € { [ ] } \ µ, Polish ą ć ę…), told apart from the left Ctrl+Alt by the right Alt key being down. The Mac:
  // ⌥ types @ [ ] { } | \ ~ on most European layouts (in a text field: typing wins; a dead key — ⌥N, ⌥E on every Mac —
  // stays the shortcut: Alt+N is code ⇄ nodes).
  function typesChar(e, { mac = onMac(), altRight = false, editable = false } = {}) {
    const k = e && e.key;
    if (typeof k !== 'string' || !(k === 'Dead' || ([...k].length === 1 && k > ' '))) return false;
    if (!mac) return Boolean(altRight && e.ctrlKey && e.altKey && !e.metaKey);
    return Boolean(editable && e.altKey && !e.ctrlKey && !e.metaKey && /^[@[\]{}|\\~^`#€<>]$/.test(k));
  }
  // (round 49) letters by the letter printed on the key, not its place: on AZERTY A sits where QWERTY has Q and M where
  // ";" is, on QWERTZ Y and Z swap; handlers that read e.code (so ⌥ / AltGr letters still match) get the key that says
  // the letter. `map` is navigator.keyboard's layout map when the window has it.
  const PUNCT = { ',': 'Comma', '.': 'Period', ';': 'Semicolon', '/': 'Slash', "'": 'Quote', '[': 'BracketLeft', ']': 'BracketRight', '-': 'Minus', '=': 'Equal', '`': 'Backquote', '\\': 'Backslash' };
  function layoutCode(e, map = null, { mac = onMac() } = {}) {
    const code = (e && e.code) || '';
    if (!/^(?:Key[A-Z]|Semicolon|Quote|Comma|Period|Slash|BracketLeft|BracketRight|Backquote|Minus|Equal|Backslash|IntlBackslash)$/.test(code)) return code;
    const typed = typeof e.key === 'string' && e.key.length === 1 && !(mac && e.altKey) ? e.key : null; // (⌥ changes the Mac's letters)
    const mapped = map && typeof map.get === 'function' ? map.get(code) : null;
    const ch = (typed && /^[a-z]$/i.test(typed) ? typed : mapped && /^[a-z]$/i.test(mapped) ? mapped : typed || mapped || '').toLowerCase();
    if (/^[a-z]$/.test(ch)) return `Key${ch.toUpperCase()}`;
    return /^Key[A-Z]$/.test(code) && PUNCT[ch] ? PUNCT[ch] : code;
  }

  // ---------- programs a Dock launch can't find ----------
  // An app started from the Mac's Dock / Finder gets PATH=/usr/bin:/bin:/usr/sbin:/sbin: no Homebrew, npm, volta, bun
  // or nvm folders, so `claude` (a Node script: "env: node: No such file"), `codex`, `ffmpeg`, `git` from Homebrew and
  // every tool a chat's own commands call went missing. The usual folders are added at the END (what the shell gave
  // still wins), only those that exist, once. Windows and Linux: PATH as it was.
  function withToolDirs(envPath, { platform = typeof process !== 'undefined' ? process.platform : '', home = '', exists = () => true, listDir = () => [] } = {}) {
    const cur = String(envPath || '');
    if (platform !== 'darwin') return cur;
    const have = cur.split(':').filter(Boolean);
    const j = (...a) => a.join('/').replace(/\/+/g, '/');
    const nvm = home ? j(home, '.nvm', 'versions', 'node') : '';
    const newestNode = nvm ? [...listDir(nvm)].filter((v) => /^v\d+/.test(v)).sort((a, b) => {
      const pa = a.slice(1).split('.').map(Number); const pb = b.slice(1).split('.').map(Number);
      return (pb[0] - pa[0]) || (pb[1] - pa[1]) || (pb[2] - pa[2]);
    })[0] : null;
    const want = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/opt/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin',
      ...(home ? [j(home, '.local', 'bin'), j(home, '.npm-global', 'bin'), j(home, '.volta', 'bin'), j(home, '.bun', 'bin'), j(home, 'bin')] : []),
      ...(newestNode ? [j(nvm, newestNode, 'bin')] : [])];
    const add = want.filter((d) => !have.includes(d) && exists(d));
    return [...have, ...add].join(':');
  }

  // main.js, first thing: this process's PATH (and so every program it starts) gets those folders
  function fixProcessPath() {
    if (typeof process === 'undefined' || process.platform !== 'darwin' || typeof require !== 'function') return null;
    const fs = require('fs'); const os = require('os');
    const before = process.env.PATH || '';
    process.env.PATH = withToolDirs(before, { platform: 'darwin', home: os.homedir(), exists: (d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } }, listDir: (d) => { try { return fs.readdirSync(d); } catch { return []; } } });
    return process.env.PATH === before ? null : process.env.PATH.slice(before.length).replace(/^:/, '');
  }

  return { fileUrl, fromFileUrl, parts, baseName, dirName, join, extOf, samePath, sameFile, macKeys, keyWords, keyLabel, typesChar, layoutCode, MAC_REAL_CTRL, withToolDirs, fixProcessPath };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WinMac;
