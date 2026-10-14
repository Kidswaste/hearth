#!/usr/bin/env node
// (round 38, dragdrop) Unit tests for dragdrop-core.js (what a drop does on each spot, paths from Finder / Explorer,
// iCloud placeholders, the clipboard's copied files, names of dragged-out files) and dragdropmain.js's helpers
// (temp files for drags out, the drop check on a real temp folder). Mac and Windows paths whatever this computer is.
//   node dev/dragdrop-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../dragdrop-core');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

// ---------- paths: Mac, Windows, file: URLs, spaces / accents / # ----------
eq(C.toPath('file:///Users/me/M%C3%BAsic/take%20%232.wav'), '/Users/me/Músic/take #2.wav', 'mac file URL with accents, space, #');
eq(C.toPath('file:///C:/Clips/take%20%232.mp4', { win: true }), 'C:\\Clips\\take #2.mp4', 'windows file URL → backslashes');
eq(C.toPath('file:///C:/Clips/a%20b.png'), 'C:/Clips/a b.png', 'windows file URL read on the Mac keeps the drive');
eq(C.toPath('"C:\\Users\\Quentin\\My Videos\\clip (final).mov"', { win: true }), 'C:\\Users\\Quentin\\My Videos\\clip (final).mov', 'Explorer "Copy as path" quotes');
eq(C.toPath("'/Users/me/a b/'"), '/Users/me/a b', 'quoted mac path, trailing slash');
eq(C.toPath('\\\\?\\C:\\very\\long\\name.png', { win: true }), 'C:\\very\\long\\name.png', 'windows long-path prefix');
eq(C.toPath('\\\\?\\UNC\\nas\\share\\a.png', { win: true }), '\\\\nas\\share\\a.png', 'windows long UNC prefix');
eq(C.toPath('file://nas/share/a%20b.png', { win: true }), '\\\\nas\\share\\a b.png', 'UNC file URL');
eq(C.toPath('C:\\'), 'C:\\', 'a drive root keeps its slash');
eq(C.toPath('  /tmp/x.png  '), '/tmp/x.png', 'spaces around');
ok(C.isAbsolute('C:\\a') && C.isAbsolute('/a') && C.isAbsolute('\\\\nas\\s') && C.isAbsolute('~/a') && !C.isAbsolute('a/b') && !C.isAbsolute('notes.txt'), 'isAbsolute both kinds');
eq(C.baseName('C:\\Clips\\été #1.mov'), 'été #1.mov', 'base name, windows');
eq(C.baseName('/Users/me/Clips/été #1.mov'), 'été #1.mov', 'base name, mac');
eq(C.nice('e\u0301te\u0301.png'), 'été.png', 'a Mac\'s decomposed accents read composed');
eq(C.extOf('archive.tar.GZ'), 'gz', 'extension lowercased');

// ---------- kinds ----------
const K = { 'a.PNG': 'image', 'b.jpeg': 'image', 'c.mov': 'video', 'd.MP3': 'audio', 'e.flac': 'audio', 'scene.hearthpack': 'pack', 'm.glb': 'model', 's.hdr': 'sky', 'f.woff2': 'font', 'n.md': 'text', 'x.json': 'text', 'IMG_1.HEIC': 'heic', 'p.pdf': 'pdf', 'z.zip': 'archive', 'setup.exe': 'app', 'r.docx': 'doc', 'weird.xyz': 'other' };
for (const [n, k] of Object.entries(K)) eq(C.kindOf(n), k, `kind of ${n}`);
eq(C.kindOf('', 'image/png'), 'image', 'a pasted screenshot has only its type');
eq(C.kindOf('', 'image/heic'), 'heic', 'heic by type');
eq(C.kindOf('noext', 'audio/mpeg'), 'audio', 'type when the name says nothing');

// ---------- iCloud placeholders ----------
eq(C.icloudName('.Song.mp3.icloud'), 'Song.mp3', 'placeholder name');
eq(C.cloudOf({ name: '.Song.mp3.icloud' }), 'icloud', 'old-style placeholder');
eq(C.cloudOf({ name: 'Song.mp3', size: 5e6, blocks: 0, platform: 'darwin' }), 'icloud', 'dataless file on a Mac');
eq(C.cloudOf({ name: 'Song.mp3', size: 5e6, blocks: 0, platform: 'win32' }), null, 'no blocks on Windows means nothing');
eq(C.cloudOf({ name: 'Song.mp3', size: 5e6, blocks: 9800, platform: 'darwin' }), null, 'downloaded file');
eq(C.cloudOf({ name: 'empty.txt', size: 0, blocks: 0, platform: 'darwin' }), null, 'an empty file isn\'t a placeholder');

// ---------- the overlay per spot ----------
const sn = (...types) => C.sniff(types.map((type) => ({ kind: 'file', type })));
eq(C.overlay('lab', sn('audio/mpeg')), 'Drop to use as the song', 'lab: a song');
eq(C.overlay('lab', sn('video/mp4')), 'Drop to add a video layer', 'lab: a video');
eq(C.overlay('lab', sn('image/png')), 'Drop to add a picture layer', 'lab: a picture');
eq(C.overlay('lab', sn('image/png', 'image/jpeg')), 'Drop to add 2 picture layers', 'lab: pictures');
eq(C.overlay('lab', sn('')), 'Drop to add it to this scene (a pack opens its preview)', 'lab: a pack / unknown');
eq(C.overlay('chat', sn('image/png')), 'Drop to attach this picture', 'chat: a picture');
eq(C.overlay('chat', sn('image/png', 'image/png', 'image/png')), 'Drop to attach 3 pictures', 'chat: pictures');
eq(C.overlay('chat', sn('')), 'Drop to attach (a folder: let this AI use it)', 'chat: a folder or unknown');
eq(C.overlay('chat', sn('text/plain', 'image/png')), 'Drop to attach 2 files', 'chat: mixed');
eq(C.overlay('chat', sn(...Array(30).fill('image/png'))), 'Drop to attach the first 20 of 30', 'chat: many at once');
eq(C.overlay('slot', sn('image/png'), { label: 'Logo' }), 'Drop to use as Logo', 'template slot');
eq(C.overlay('board', sn('image/png')), 'Drop to add to the board', 'board');
eq(C.sniff([{ kind: 'string', type: 'text/plain' }, { kind: 'file', type: '' }]).count, 1, 'sniff counts files only');

// ---------- a chat ----------
const MB = 1048576;
let p = C.planChat([
  { name: 'shot.png', path: '/Users/me/Desktop/shot.png', size: 2 * MB },
  { name: 'pasted.png', mime: 'image/png', size: 1000, blob: {} },
  { name: 'Project', path: '/Users/me/Project', isDir: true },
  { name: 'notes.md', path: 'C:\\Users\\Q\\notes.md', size: 10 * 1024 },
  { name: 'huge.log', path: 'C:\\logs\\huge.log', size: 30 * MB },
  { name: 'Song.mp3', path: '/Users/me/iCloud/Song.mp3', cloud: 'icloud' },
  { name: 'gone.png', path: '/x/gone.png', missing: true },
  { name: 'clip.mov', path: '/Users/me/clip.mov', size: 800 * MB },
  { name: 'IMG_9.HEIC', path: '/Users/me/IMG_9.HEIC', size: 3 * MB },
  { name: 'big.png', path: '/Users/me/big.png', size: 60 * MB },
  { name: 'a.hearthpack', path: '/Users/me/a.hearthpack', size: MB },
], { access: false });
eq(p.steps.map((s) => s.do), ['image', 'blob', 'folder', 'text', 'video', 'image', 'pack'], 'chat without file access');
ok(p.steps.find((s) => s.e.name === 'big.png').big, 'a big picture is flagged (attached where it is)');
eq(p.skipped.length, 4, 'four left out');
ok(/huge\.log is 30\.0 MB, too big to paste in/.test(p.skipped[0].why) && /Files on this computer/.test(p.skipped[0].why), 'big text: one line with the fix');
ok(/still in iCloud: download it first/.test(p.skipped[1].why), 'iCloud placeholder: plain message');
ok(/can't be found/.test(p.skipped[2].why), 'missing file');
ok(/HEIC.*export it as JPEG/.test(p.skipped[3].why), 'HEIC explained');
p = C.planChat([{ name: 'huge.log', path: '/l/huge.log', size: 30 * MB }, { name: 'r.pdf', path: '/r.pdf', size: MB }, { name: 'x.zip', path: '/x.zip', size: MB }], { access: true });
eq(p.steps.map((s) => s.do), ['file', 'file', 'file'], 'with file access: big / other files by their place');
ok(p.steps[0].big, 'big text flagged');
p = C.planChat([{ name: 'r.pdf', path: '/r.pdf', size: MB }], { access: false });
ok(/^r\.pdf: PDFs need this AI to read files/.test(p.skipped[0].why), `unsupported type in one line (${p.skipped[0].why})`);
p = C.planChat([{ name: 'thing.xyz', path: '/t.xyz', size: 1 }], {});
ok(/\.xyz files need/.test(p.skipped[0].why), 'unknown extension named');
p = C.planChat(Array.from({ length: 45 }, (_, i) => ({ name: `p${i}.png`, path: `/p/p${i}.png`, size: 1000 })), {});
eq([p.steps.length, p.more], [20, 25], 'many files: 20 at a time, the rest counted');
ok(/25 more files not added \(20 at a time/.test(C.summary(p, ['Attached 20'])), 'the calm line for many');
p = C.planChat(Array.from({ length: 5 }, (_, i) => ({ name: `F${i}`, path: `/f/F${i}`, isDir: true })), {});
eq([p.steps.filter((s) => s.do === 'folder').length, p.skipped.length], [3, 2], 'at most 3 folders asked at once');
p = C.planChat([{ name: 'remote.txt', mime: 'text/plain', size: 10, blob: {} }, { name: 'web.mp4', mime: 'video/mp4', size: 10, blob: {} }], {});
eq(p.steps.map((s) => s.do), ['blob'], 'a text with no path is read; a video with no path is explained');
ok(/no place on this computer/.test(p.skipped[0].why), 'no path explained');

// ---------- the Lab preview ----------
const L = (name, extra = {}) => ({ name, path: `/Users/me/${name}`, size: MB, ...extra });
eq(C.planLab([L('track.mp3')], {}).steps.map((s) => s.do), ['song'], 'lab: audio → the song');
eq(C.planLab([L('clip.mp4')], { songLoaded: false }).steps.map((s) => s.do), ['footage'], 'lab: video with no song → footage');
eq(C.planLab([L('clip.mp4')], { songLoaded: true }).steps.map((s) => s.do), ['video-layer'], 'lab: video with a song → a video layer, the song stays');
eq(C.planLab([L('clip.mp4'), L('track.wav')], {}).steps.map((s) => s.do), ['video-layer', 'song'], 'lab: video + song dropped together');
eq(C.planLab([L('a.mp3'), L('b.mp3')], {}).steps.map((s) => s.do), ['song', 'ref'], 'lab: second song → a reference');
eq(C.planLab([L('a.png'), { name: 'pasted.png', mime: 'image/png', blob: {} }], {}).steps.map((s) => s.do), ['picture', 'picture'], 'lab: pictures, pasted too');
eq(C.planLab([L('m.glb'), L('sky.hdr'), L('font.otf'), L('data.json'), L('x.hearthpack')], {}).steps.map((s) => s.do), ['model', 'model', 'ref', 'ref', 'pack'], 'lab: models, sky, font, data, pack');
p = C.planLab([L('r.pdf'), L('Folder', { isDir: true }), L('i.heic'), L('w.mov', { size: 3000 * MB }), L('.x.png.icloud')], {});
eq(p.steps.length, 0, 'lab: nothing usable');
ok(/The Lab can't use PDFs: songs, videos, pictures/.test(p.skipped[0].why), 'lab: unsupported in one line');
ok(/is a folder: drop the files inside it/.test(p.skipped[1].why), 'lab: folder explained');
ok(/HEIC/.test(p.skipped[2].why) && /too big for a scene/.test(p.skipped[3].why) && /x\.png is still in iCloud/.test(p.skipped[4].why), 'lab: heic, huge, iCloud');
p = C.planLab(Array.from({ length: 30 }, (_, i) => L(`p${i}.jpg`)), {});
eq([p.steps.length, p.more], [12, 18], 'lab: 12 layers at a time');
const code = C.pictureLayer('my-pic');
ok(/refTexture\('my_pic'\)/.test(code) && /tweak\(/.test(code) && /setAnimationLoop/.test(code), 'the picture layer reads its reference');
let parsed = true; try { new Function(code.replace(/^import .*$/m, '')); } catch { parsed = false; } // eslint-disable-line no-new-func
ok(parsed, 'the picture layer is valid JS');

// ---------- summary ----------
eq(C.summary({ steps: [], skipped: [], more: 0 }, ['Attached 2']), 'Attached 2', 'summary: done only');
ok(/2 files left out: a · b/.test(C.summary({ steps: [], skipped: [{ why: 'a' }, { why: 'b' }], more: 0 })), 'summary: two reasons');
ok(/3 files left out: a \(and 2 more\)/.test(C.summary({ steps: [], skipped: [{ why: 'a' }, { why: 'b' }, { why: 'c' }], more: 0 })), 'summary: many reasons stay one line');

// ---------- out of Hearth: names ----------
eq(C.codeName('javascript', 'const a = 1;'), 'snippet.js', 'code name from the language');
eq(C.codeName('PowerShell', 'Get-Item'), 'snippet.ps1', 'powershell');
eq(C.codeName('', '// file: scene.js\nimport x'), 'scene.js', 'a name in the first line');
eq(C.codeName('py', '# hello.py\nprint(1)'), 'hello.py', 'python file name comment');
eq(C.codeName('', '{ "a": 1 }'), 'snippet.json', 'json guessed');
eq(C.codeName('', 'just words'), 'snippet.txt', 'plain text');
eq(C.safeName('a/b:c*?.png'), 'a b c.png', 'unsafe characters');
eq(C.safeName('CON.txt'), '_CON.txt', 'reserved Windows name');
eq(C.safeName('name. '), 'name', 'no trailing dot / space');
ok(C.safeName('x'.repeat(300) + '.png').length <= 120 && C.safeName('x'.repeat(300) + '.png').endsWith('.png'), 'long names cut, extension kept');
eq(C.outSpec({ path: 'relative.png' }), null, 'a relative path is refused');
eq(C.outSpec({ path: 'C:\\R\\out.mp4' }), { path: 'C:\\R\\out.mp4' }, 'a windows path passes');
eq(C.outSpec({ name: 'x.js', text: 'a' }), { name: 'x.js', text: 'a' }, 'text out');
eq(C.outSpec({ name: 'p.png', dataUrl: 'data:image/png;base64,AAAA' }), { name: 'p.png', base64: 'AAAA' }, 'a data URL out');
eq(C.outSpec({ paths: ['/a.png', 'b.png'] }), { paths: ['/a.png'] }, 'several paths, relative ones dropped');
eq(C.outSpec({}), null, 'nothing to drag');

// ---------- the clipboard: files copied in Finder / Explorer ----------
eq(C.parseClipboard({ fileUrl: 'file:///Users/me/Desktop/a%20b.png' }), ['/Users/me/Desktop/a b.png'], 'mac public.file-url');
eq(C.parseClipboard({ plist: '<plist><array><string>/Users/me/x &amp; y.mov</string><string>/Users/me/été.wav</string></array></plist>' }), ['/Users/me/x & y.mov', '/Users/me/été.wav'], 'mac several copied files');
eq(C.parseClipboard({ fileNameW: 'C:\\Users\\Q\\clip #2.mp4\u0000' }, { win: true }), ['C:\\Users\\Q\\clip #2.mp4'], 'windows FileNameW');
eq(C.parseClipboard({ uriList: '# copy\nfile:///home/u/a.png\nhttps://x.y/z' }), ['/home/u/a.png'], 'uri-list, links ignored');
eq(C.parseClipboard({ text: '"C:\\a b\\c.png"\r\nD:\\d.wav' }, { win: true }), ['C:\\a b\\c.png', 'D:\\d.wav'], 'pasted paths, one per line');
eq(C.parseClipboard({ text: 'hello world' }), [], 'plain text is not files');
eq(C.parseClipboard({ text: 'a/relative/path.png' }), [], 'relative paths are not files');
ok(C.looksLikeName('Screenshot 2026-10-14 at 09.12.33.png') && C.looksLikeName('') && !C.looksLikeName('some words here') && !C.looksLikeName('/Users/me/a.png'), 'a Finder copy\'s text is just a name');

// ---------- dragdropmain.js helpers ----------
(async () => {
  let M = null;
  try { M = require('../dragdropmain')._test; } catch (err) { console.log(`(dragdropmain not loaded: ${err.message})`); }
  if (M) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-dd-'));
    const f1 = M.writeTemp({ name: 'snippet.js', text: 'const é = 1;' }, dir);
    eq([path.basename(f1), fs.readFileSync(f1, 'utf8')], ['snippet.js', 'const é = 1;'], 'a code block becomes a file named as shown');
    const f2 = M.writeTemp({ name: 'snippet.js', base64: Buffer.from('xy').toString('base64') }, dir);
    ok(f2 !== f1 && fs.readFileSync(f2, 'utf8') === 'xy', 'same name twice: each its own folder');
    const weird = path.join(dir, 'take #2 été (final).png');
    fs.writeFileSync(weird, 'x');
    fs.mkdirSync(path.join(dir, 'A folder'));
    fs.writeFileSync(path.join(dir, '.Song.mp3.icloud'), '');
    const r = await M.check([weird, `file://${encodeURI(weird).replace(/#/g, '%23')}`, path.join(dir, 'A folder'), path.join(dir, 'Song.mp3'), path.join(dir, 'nope.png')]);
    eq(r.map((x) => [x.exists, x.isDir, x.cloud]), [[true, false, null], [true, false, null], [true, true, null], [false, false, 'icloud'], [false, false, null]], 'check: file, its file: URL, folder, iCloud placeholder, missing');
    eq(r[1].path, weird, 'a file: URL with # and accents names the same file');
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`dragdrop-test: ${pass} passed${fail ? `, ${fail} FAILED` : ''}`);
  process.exit(fail ? 1 : 0);
})();
