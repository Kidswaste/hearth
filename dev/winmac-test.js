#!/usr/bin/env node
// (round 31, winmac) Unit tests for winmac.js (file: URLs, names with either slash, joins, key names, the Mac PATH fix)
// run with both path flavours (path.win32 / path.posix) whatever this computer is, plus the static scan
// (dev/winmac-scan.js) staying at zero for the path / URL rules. Node only: node dev/winmac-test.js
'use strict';
const path = require('path');
const url = require('url');
const W = require('../winmac');
const { scan, scanText } = require('./winmac-scan');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const eq = (a, b, what) => ok(a === b, `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

// names the owner really has: spaces, # and ? and %, accents, emoji, a phone's .MOV, a camera's .JPG
const NAMES = ['take #2.mp4', 'a b c.png', 'Músique été.wav', 'what?.lrc', '100% done.jpg', 'clip 🎬.MOV', 'IMG_0001.JPG', "it's (final) [v2] & co.glb", 'semi;colon,comma=eq+plus@at$.srt'];
const FLAVOURS = [
  { name: 'win32', p: path.win32, roots: ['C:\\Users\\Quentin\\Documents\\Hearth data', 'D:\\Clips', '\\\\NAS\\share\\Footage'] },
  { name: 'posix', p: path.posix, roots: ['/Users/quentin/Library/Application Support/Hearth', '/Volumes/My Drive/Clips', '/tmp'] },
];

for (const F of FLAVOURS) {
  for (const root of F.roots) {
    for (const n of NAMES) {
      const full = F.p.join(root, 'sub folder', n);
      const u = W.fileUrl(full);
      const tag = `${F.name} ${full}`;
      // a real URL with no raw space / # / ? / % left in its path, the drive kept as "C:"
      let parsed = null;
      try { parsed = new URL(u); } catch { /* checked below */ }
      ok(parsed && parsed.protocol === 'file:', `${tag}: parses as a file: URL (${u})`);
      ok(!/[\s#?\\]/.test(u.slice(7)) && !/%(?![0-9A-F]{2})/.test(u), `${tag}: nothing left unencoded (${u})`);
      ok(parsed && parsed.hash === '' && parsed.search === '', `${tag}: no part read as #hash / ?query`);
      // Node's own reader gets the same path back (Windows rules for Windows paths)
      const back = url.fileURLToPath(u, { windows: F.name === 'win32' });
      if (root.startsWith('\\\\')) ok(back.toLowerCase() === full.toLowerCase() && back.endsWith(full.slice(root.length)), `${tag}: fileURLToPath round trip (a URL host is lower case)`);
      else eq(back, full, `${tag}: fileURLToPath round trip`);
      eq(W.fromFileUrl(u, { win: F.name === 'win32' }), full, `${tag}: fromFileUrl round trip`);
      if (F.name === 'posix') eq(decodeURIComponent(new URL(url.pathToFileURL(full).href).pathname), decodeURIComponent(parsed.pathname), `${tag}: same path as pathToFileURL`);
      // names: either slash, any computer
      eq(W.baseName(full), F.p.basename(full), `${tag}: baseName`);
      eq(W.dirName(full), F.p.dirname(full), `${tag}: dirName`);
      eq(W.extOf(full), F.p.extname(full).slice(1).toLowerCase(), `${tag}: extOf (lower case)`);
      eq(W.join(F.p.join(root, 'sub folder'), n), full, `${tag}: join keeps the folder's slash`);
    }
    eq(W.join(root, 'a', 'b.png'), F.p.join(root, 'a', 'b.png'), `${F.name} join of several names`);
    eq(W.join(`${root}${F.p.sep}`, 'x.mp4'), F.p.join(root, 'x.mp4'), `${F.name} join after a trailing slash`);
  }
}

// edge cases
eq(W.fileUrl(''), '', 'empty path → empty URL');
eq(W.fileUrl(null), '', 'null → empty URL');
for (const keep of ['https://x.com/a b.png', 'data:image/png;base64,AAAA', 'blob:file:///abc', 'file:///C:/already/there.png', 'hearth-data:/workspace/a.png']) eq(W.fileUrl(keep), keep, `URL passes through: ${keep}`);
eq(W.fileUrl('c:\\x\\y.png'), 'file:///C:/x/y.png', 'a lower-case drive letter');
eq(W.fileUrl('C:/mixed\\slashes/a.png'), 'file:///C:/mixed/slashes/a.png', 'mixed slashes');
eq(W.fileUrl('\\\\?\\C:\\very\\deep\\a b.png'), 'file:///C:/very/deep/a%20b.png', 'a Windows long-path name (\\\\?\\)');
eq(W.fileUrl('\\\\?\\UNC\\nas\\share\\a.png'), 'file://nas/share/a.png', 'a long-path UNC name');
eq(W.fileUrl('\\\\nas\\share\\a b.png'), 'file://nas/share/a%20b.png', 'a UNC share is the host');
eq(url.fileURLToPath(W.fileUrl('\\\\nas\\share\\a b.png'), { windows: true }), '\\\\nas\\share\\a b.png', 'UNC round trip (Node, Windows rules)');
eq(W.fromFileUrl('file://localhost/Users/x/a%20b.png'), '/Users/x/a b.png', 'file://localhost/…');
eq(W.fromFileUrl('file:///C:/x/a.png?t=123'), 'C:/x/a.png', 'a cache-busting ?t= dropped');
eq(W.fromFileUrl('/plain/path'), '/plain/path', 'not a URL: as it was');
eq(W.baseName('C:\\x\\'), 'x', 'baseName of a folder with a trailing slash');
eq(W.dirName('C:\\x'), 'C:\\', 'dirName at a drive root');
eq(W.dirName('/x'), '/', 'dirName at /');
eq(W.dirName('name.png'), '', 'dirName of a bare name');
eq(W.extOf('/a.b/c'), '', 'no extension (a dot in a folder only)');
eq(W.extOf('.hidden'), '', 'a dot-file has no extension');
eq(W.parts('C:\\a/b\\c').join('|'), 'C:|a|b|c', 'parts splits on both slashes');
ok(W.samePath('C:\\Users\\Me\\A.png', 'c:/users/me/a.png'), 'samePath: Windows names ignore case and slash');
ok(!W.samePath('/Users/me/A.png', '/Users/me/a.png', { caseless: false }), 'samePath caseless:false tells them apart');
ok(W.samePath('/a/b/', '/a/b'), 'samePath ignores a trailing slash');

// long paths: Node's fs already names them \\?\… on Windows, so deep data folders work without LongPathsEnabled
const deep = `C:\\Users\\Quentin\\${'Very long folder name '.repeat(14)}\\clip.mp4`;
ok(deep.length > 260 && path.win32.toNamespacedPath(deep).startsWith('\\\\?\\C:\\'), 'Node namespaces a > 260-character Windows path');
ok(W.fileUrl(deep).startsWith('file:///C:/Users/'), 'fileUrl of a > 260-character path');

// key names: ⌘ on a Mac, as written elsewhere
eq(W.macKeys('Undo (Ctrl+Z)', { mac: true }), 'Undo (⌘Z)', 'macKeys Ctrl+Z');
eq(W.macKeys('Ctrl+Shift+K', { mac: true }), '⌘Shift+K', 'macKeys keeps "Shift+" in running text');
eq(W.macKeys('Ctrl+Shift+K', { mac: true, shift: true }), '⌘⇧K', 'macKeys with shift symbols');
eq(W.macKeys('Alt+N · Ctrl+click · Ctrl+drag', { mac: true }), '⌥N · Ctrl+click · Ctrl+drag', 'Ctrl+click / drag stay (the Mac right-click)');
eq(W.macKeys('Ctrl+/', { mac: true }), '⌘/', 'macKeys Ctrl+/');
eq(W.macKeys('Undo (Ctrl+Z)', { mac: false }), 'Undo (Ctrl+Z)', 'macKeys off the Mac: unchanged');
ok(W.macKeys(null, { mac: true }) === null && typeof W.macKeys(5, { mac: true }) === 'number', 'macKeys leaves non-text alone');

// the PATH a Mac Dock launch gets
const dock = '/usr/bin:/bin:/usr/sbin:/sbin';
const home = '/Users/quentin';
const exists = (d) => !d.includes('/opt/local');
const listDir = (d) => (d.endsWith('/.nvm/versions/node') ? ['v18.20.1', 'v22.3.0', 'v20.11.1', 'system'] : []);
const fixed = W.withToolDirs(dock, { platform: 'darwin', home, exists, listDir });
ok(fixed.startsWith(`${dock}:`), 'Mac: what the Dock gave stays first');
for (const d of ['/opt/homebrew/bin', '/usr/local/bin', `${home}/.local/bin`, `${home}/.npm-global/bin`, `${home}/.volta/bin`, `${home}/.bun/bin`, `${home}/.nvm/versions/node/v22.3.0/bin`]) ok(fixed.split(':').includes(d), `Mac: PATH gets ${d}`);
ok(!fixed.includes('/opt/local'), 'Mac: a folder that does not exist is not added');
ok(!fixed.includes('v18.20.1') && !fixed.includes('v20.11.1'), 'Mac: only the newest nvm Node');
eq(new Set(fixed.split(':')).size, fixed.split(':').length, 'Mac: no folder twice');
eq(W.withToolDirs(fixed, { platform: 'darwin', home, exists, listDir }), fixed, 'Mac: fixing twice changes nothing');
const shellPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
ok(W.withToolDirs(shellPath, { platform: 'darwin', home, exists, listDir }).startsWith(shellPath), 'Mac launched from a terminal: its order kept');
eq(W.withToolDirs('C:\\Windows;C:\\Program Files\\nodejs', { platform: 'win32', home: 'C:\\Users\\q', exists, listDir }), 'C:\\Windows;C:\\Program Files\\nodejs', 'Windows: PATH untouched');
eq(W.withToolDirs('/usr/bin', { platform: 'linux', home: '/home/q', exists, listDir }), '/usr/bin', 'Linux: PATH untouched');
ok(W.fixProcessPath() === null || process.platform === 'darwin', 'fixProcessPath does nothing off the Mac');

// the scan: the path / URL rules stay at zero (anything new is fixed or reviewed in dev/winmac-scan.js), and it still
// catches the patterns it is for
const hits = scan();
for (const rule of ['file-url', 'slash-split', 'slash-join', 'ctrl-text', 'shell-cmd', 'path-delim', 'ext-case', 'crlf', 'hard-path', 'zip-tool', 'trash-direct', 'case-win-only']) {
  const mine = hits.filter((h) => h.rule === rule);
  ok(!mine.length, `scan ${rule}: ${mine.length} new hit(s)${mine.length ? `\n  ${mine.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text.slice(0, 120)}`).join('\n  ')}` : ''}`);
}
const planted = [
  "v.src = `file://${c.src}`;",
  "const name = filePath.split('/').pop();",
  'toast(\'Copied: paste with Ctrl+V\'); ctx.say(\'Press Ctrl+Z to undo\');',
  "execSync(`rm -rf ${dir}`);",
  "const dirs = env.PATH.split(':');",
  "if (/\\.(png|jpg)$/.test(f)) add(f);",
  "const lines = fs.readFileSync(p, 'utf8').split('\\n');",
  "const out = `${dir}/render.mp4`;",
  "const DEF = '/Users/someone/Desktop/x.html';",
  "execFile(TAR, ['-a', '-cf', target, '-C', src]);", // (round 46)
  "await shell.trashItem(p);",
  "const key = (p) => (platform === 'win32' ? p.toLowerCase() : p);",
].join('\n');
const caught = new Set(scanText(planted, 'planted.js').map((h) => h.rule));
for (const rule of ['file-url', 'slash-split', 'ctrl-text', 'shell-cmd', 'path-delim', 'ext-case', 'crlf', 'slash-join', 'hard-path', 'zip-tool', 'trash-direct', 'case-win-only']) ok(caught.has(rule), `scan catches a planted ${rule}`);
ok(!scanText("v.src = WinMac.fileUrl(c.src); // winmac-ok", 'x.js').length, 'scan: the helper and winmac-ok lines pass');
ok(!scanText("const c = WinPolish.trashCheck(p); await shell.trashItem(check.path);", 'x.js').length && !scanText("const k = platform === 'win32' ? p.toLowerCase() : platform === 'darwin' ? p.normalize('NFC').toLowerCase() : p;", 'x.js').length, 'scan (round 46): the checked trash and the Mac-aware fold pass');

// (round 46, platform46) the same file named two ways, and "Ctrl/⌘+K" as each computer says it
ok(W.sameFile('C:\\Users\\Q\\Song.WAV', 'c:/users/q/song.wav', { mac: false }), 'sameFile: Windows ignores case and the slash kind');
ok(W.sameFile('/Users/q/Mu\u0301sique.mp3', '/users/q/M\u00fasique.MP3', { mac: true }), 'sameFile: the Mac ignores case and the Unicode form (NFD / NFC)');
ok(!W.sameFile('/home/q/Song.wav', '/home/q/song.wav', { mac: false }), 'sameFile: Linux compares as written');
eq(W.keyWords('Ctrl/⌘+K is Find anything', { mac: true }), '⌘K is Find anything', 'keyWords: the Mac says ⌘K');
eq(W.keyWords('Ctrl/⌘+K is Find anything', { mac: false }), 'Ctrl+K is Find anything', 'keyWords: Windows says Ctrl+K');
eq(W.keyWords('Ctrl/⌘+Alt+O, then Ctrl+click', { mac: true }), '⌘⌥O, then Ctrl+click', 'keyWords: ⌥ on the Mac; Ctrl+click stays (the Mac\'s right-click)');
eq(W.macKeys('try Ctrl/⌘+K', { mac: true }), 'try ⌘K', 'macKeys: a both-computers label collapses to ⌘ on the Mac');

console.log(`winmac-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
