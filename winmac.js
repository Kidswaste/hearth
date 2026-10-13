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

  // ---------- key names ----------
  // "Ctrl+Shift+S" → "⌘⇧S" on a Mac (Hearth's own shortcuts take ⌘ where they say Ctrl). "Ctrl+click" stays: on a Mac
  // that is the right-click. { mac } defaults to this computer (a window: navigator.platform; Node: process.platform).
  const onMac = () => (typeof navigator !== 'undefined' && navigator.platform ? /Mac/.test(navigator.platform) : typeof process !== 'undefined' && process.platform === 'darwin');
  function macKeys(text, { mac = onMac(), shift = false } = {}) {
    if (!mac || text == null || typeof text !== 'string' || !/\b(?:Ctrl|Alt)\b/.test(text)) return text;
    let t = text.replace(/\bCtrl\+(?!click|drag)/g, '⌘').replace(/\bAlt\+(?!click|drag)/g, '⌥');
    if (shift) t = t.replace(/\bShift\+/g, '⇧');
    return t.replace(/⌘\/⌘/g, '⌘').replace(/([⌘⌥⇧])\+/g, '$1');
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

  return { fileUrl, fromFileUrl, parts, baseName, dirName, join, extOf, samePath, macKeys, withToolDirs, fixProcessPath };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WinMac;
