// Node tests for ⧉ Make a batch (tools/three-batch-core.js): CSV / TSV / plain lines parsing (quotes, line breaks in
// quotes, a BOM, \r\n, semicolons with decimal commas), the columns mapped to the template's fields (labels, slider keys,
// plain words, a name column, unknown columns), each cell made safe for its field, paths on a Mac and on Windows
// (relative to the CSV's folder, ~/, file:// URLs, .., UNC), "every song in this folder", file names from a pattern
// (safe on both systems, unique in the batch), the jobs' order, the whole batch's time left, the summary CSV and
// /batch's words.
//   node dev/labbatch-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const B = require('../tools/three-batch-core.js');
const C = require('../tools/three-templates-core.js');
const ROOT = path.join(__dirname, '..');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(`${fs.readFileSync(path.join(ROOT, 'tools/three-tweaks.js'), 'utf8')};this.ThreeTweaks = ThreeTweaks;`, ctx);
const T = ctx.ThreeTweaks;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const BG = `const P = tweak({ bg: { value: '#ff0000', label: 'Background' }, speed: { value: 1, min: 0, max: 4, label: 'Speed' }, mode: { value: 'soft', options: ['soft', 'hard'] } });
const tex = refTexture('logo');`;
const TITLE = 'const P = tweak({ size: { value: 0.1, min: 0.02, max: 0.4, label: \'Size\' } });\n\ntextLayer(P, {"text":"HEARTH","mode":"2d"});\n';
const SCENE = {
  name: 'Neon title',
  layers: [{ id: 'main', name: 'Backdrop', code: BG }, { id: 'words', name: 'Title', code: TITLE }],
  palette: ['#112233', '#ff8800'],
  extras: { frame: '9:16', media: { path: '/music/song.mp3' } },
  refs: [{ key: 'logo', name: 'logo.png', kind: 'image', path: '/refs/logo.png' }],
};
const t = C.make(SCENE, C.extract(SCENE, { scan: T.scan }), { name: 'Neon title' });
const F = (label) => t.fields.find((f) => f.label === label);

ok('CSV: quotes, "" inside quotes, a line break inside quotes, a BOM, \\r\\n, blank lines dropped', () => {
  const r = B.parseTable('\uFEFFtitle,song\r\n"Hello, world","a.mp3"\r\n\r\n"Say ""hi""\nagain",b.mp3\r\n');
  assert.strictEqual(r.delim, ',');
  assert.deepStrictEqual(r.rows, [['title', 'song'], ['Hello, world', 'a.mp3'], ['Say "hi"\nagain', 'b.mp3']]);
});
ok('TSV and semicolons (a decimal-comma Excel) are found by themselves; one column has no separator', () => {
  assert.strictEqual(B.delimOf('Title\tSong\nA\tB'), '\t');
  assert.strictEqual(B.delimOf('Title;Speed\nA;1,5'), ';');
  assert.strictEqual(B.delimOf('Title\nA'), null);
  assert.deepStrictEqual(B.parseTable('a\tb, c\n1\t2').rows, [['a', 'b, c'], ['1', '2']]);
});
ok('plain lines: one value per line for the main field (the words), commas in a title kept', () => {
  const r = B.parseRows('Summer\nWinter, again\n\n  Spring  \n', t);
  assert.strictEqual(r.mode, 'lines');
  assert.strictEqual(r.main, 't:words');
  assert.deepStrictEqual(r.rows.map((x) => x.values['t:words']), ['Summer', 'Winter, again', 'Spring']);
  assert.deepStrictEqual(r.rows.map((x) => x.n), [1, 2, 3]);
  // another field picked for the lines: a color each
  const c = B.parseRows('#00ff00\nnope\n#00f', t, { main: 's:main|bg' });
  assert.deepStrictEqual(c.rows.map((x) => x.values['s:main|bg']), ['#00ff00', undefined, '#0000ff']);
  assert.ok(/isn't a color/.test(c.problems[0]));
});
ok('a header maps columns to fields: labels, slider keys, plain words (title, song, logo, colors), a name column; unknown ones listed', () => {
  const r = B.parseRows('Title,song,LOGO,colors,speed,bg,name,mood\nA,/m/a.mp3,/p/a.png,#000 #fff,2,#00ff00,first,happy\nB,,,,,,,\n', t);
  assert.strictEqual(r.mode, 'header');
  assert.deepStrictEqual(r.columns.map((c) => c.field || c.special || (c.unknown ? '?' : '-')), ['t:words', 'm:song', 'm:ref:logo', 'palette', 's:main|speed', 's:main|bg', 'name', '?']);
  assert.deepStrictEqual(r.unknown, ['mood']);
  assert.deepStrictEqual(r.rows[0].values, { 't:words': 'A', 'm:song': '/m/a.mp3', 'm:ref:logo': '/p/a.png', palette: ['#000000', '#ffffff'], 's:main|speed': 2, 's:main|bg': '#00ff00' });
  assert.strictEqual(r.rows[0].name, 'first');
  assert.deepStrictEqual(r.rows[1].values, { 't:words': 'B' }, 'empty cells keep the template\'s own');
  // a title that happens to have a comma isn't a header
  assert.strictEqual(B.parseRows('Hello, world\nBye', t).mode, 'lines');
});
ok('cells made safe for their field: ranges clamped, decimal commas, choices, wrong media kinds, bad numbers flagged', () => {
  const r = B.parseRows('title;speed;mode;song\nA;1,5;HARD;/x/clip.mp4\nB;99;weird;/x/pic.png\nC;abc;soft;\n', t);
  assert.strictEqual(r.delim, ';');
  assert.strictEqual(r.rows[0].values['s:main|speed'], 1.5);
  assert.strictEqual(r.rows[0].values['s:main|mode'], 'hard');
  assert.strictEqual(r.rows[0].values['m:song'], '/x/clip.mp4', 'a video\'s sound may be the song');
  assert.strictEqual(r.rows[1].values['s:main|speed'], 4, 'clamped to the slider\'s range');
  assert.ok(!('s:main|mode' in r.rows[1].values) && !('m:song' in r.rows[1].values));
  assert.ok(!('s:main|speed' in r.rows[2].values));
  assert.ok(r.problems.some((p) => /weird/.test(p)) && r.problems.some((p) => /pic\.png isn't a sound/.test(p)) && r.problems.some((p) => /"abc" isn't a number/.test(p)), r.problems.join(' | '));
});
ok('paths on a Mac: relative to the CSV\'s folder, .. folded, ~/, file:// URLs, quotes; a relative path without a folder is flagged', () => {
  assert.deepStrictEqual(B.resolvePath('songs/a.mp3', '/Users/q/Batch'), { path: '/Users/q/Batch/songs/a.mp3', problem: null });
  assert.strictEqual(B.resolvePath('../Music/b c.mp3', '/Users/q/Batch/').path, '/Users/q/Music/b c.mp3');
  assert.strictEqual(B.resolvePath('~/Music/a.mp3', null, { home: '/Users/q' }).path, '/Users/q/Music/a.mp3');
  assert.strictEqual(B.resolvePath('file:///Users/q/M%C3%BAsic/a%20b.wav').path, '/Users/q/Músic/a b.wav');
  assert.strictEqual(B.resolvePath('"/Users/q/a.png"').path, '/Users/q/a.png');
  assert.strictEqual(B.resolvePath('/Users/q/./x/../a.png').path, '/Users/q/a.png');
  assert.ok(B.resolvePath('a.png').problem);
});
ok('paths on Windows: drive letters, either slash, relative to a Windows folder, UNC shares, file:///C:/ URLs', () => {
  assert.strictEqual(B.resolvePath('songs\\a.mp3', 'C:\\Users\\q\\Batch').path, 'C:\\Users\\q\\Batch\\songs\\a.mp3');
  assert.strictEqual(B.resolvePath('songs/a.mp3', 'C:\\Users\\q\\Batch\\').path, 'C:\\Users\\q\\Batch\\songs\\a.mp3');
  assert.strictEqual(B.resolvePath('..\\Music\\b.mp3', 'C:\\Users\\q\\Batch').path, 'C:\\Users\\q\\Music\\b.mp3');
  assert.strictEqual(B.resolvePath('c:/Users/q/a.png').path, 'C:\\Users\\q\\a.png');
  assert.strictEqual(B.resolvePath('D:\\a\\..\\..\\b.png').path, 'D:\\b.png', 'never above the drive');
  assert.strictEqual(B.resolvePath('\\\\nas\\share\\clips\\a.mp4').path, '\\\\nas\\share\\clips\\a.mp4');
  assert.strictEqual(B.resolvePath('x.mp4', '\\\\nas\\share\\clips').path, '\\\\nas\\share\\clips\\x.mp4');
  assert.strictEqual(B.resolvePath('file:///C:/Users/q/a%20b.png').path, 'C:\\Users\\q\\a b.png');
  assert.strictEqual(B.resolvePath('~\\Music\\a.mp3', null, { home: 'C:\\Users\\q' }).path, 'C:\\Users\\q\\Music\\a.mp3');
  assert.strictEqual(B.dirOf('C:\\a\\b.csv'), 'C:\\a'); assert.strictEqual(B.dirOf('C:\\b.csv'), 'C:\\'); assert.strictEqual(B.dirOf('/a/b.csv'), '/a');
  // a CSV row with a Windows path, read with its folder
  const r = B.parseRows('song\nsongs\\01 intro.mp3\n', t, { base: 'C:\\Users\\q\\Batch' });
  assert.strictEqual(r.rows[0].values['m:song'], 'C:\\Users\\q\\Batch\\songs\\01 intro.mp3');
});
ok('every song in a folder: sorted naturally, only sounds, the title from each file\'s name; it reads back as rows', () => {
  const files = ['/m/10 Last.mp3', '/m/2 second_song.wav', '/m/cover.png', '/m/1 First-Song.mp3'];
  const { text, count } = B.folderText(files, F('Song'), t);
  assert.strictEqual(count, 3);
  const r = B.parseRows(text, t);
  assert.strictEqual(r.mode, 'header');
  assert.deepStrictEqual(r.rows.map((x) => [x.values['m:song'], x.values['t:words']]), [['/m/1 First-Song.mp3', 'First - Song'], ['/m/2 second_song.wav', 'second song'], ['/m/10 Last.mp3', 'Last']]);
  const pics = B.folderText(['C:\\p\\b.png', 'C:\\p\\a.jpg', 'C:\\p\\s.mp3'], F('Logo'), t, { names: false });
  assert.deepStrictEqual(B.parseRows(pics.text, t).rows.map((x) => x.values['m:ref:logo']), ['C:\\p\\a.jpg', 'C:\\p\\b.png']);
});
ok('file names: the pattern\'s tokens (fields, {format}, {size}, {n}, {template}, {name}), safe on a Mac and on Windows, unique', () => {
  const row = { n: 3, name: '', values: { 't:words': 'Summer: "Live"?', 'm:song': 'C:\\m\\track one.mp3', 's:main|bg': '#00ff00' } };
  const c = { t, row, values: row.values, format: '9:16', w: 1080, h: 1920, count: 12 };
  assert.strictEqual(B.fileName('{title} {format}', c).name, 'Summer Live 9x16');
  assert.strictEqual(B.fileName('{n} - {song} - {size}', c).name, '03 - track one - 1080x1920');
  assert.strictEqual(B.fileName('{template} {Background} {speed}', c).name, 'Neon title 00ff00 1');
  const u = B.fileName('{title} {mood}', c);
  assert.deepStrictEqual(u.unknown, ['mood']);
  assert.strictEqual(u.name, 'Summer Live');
  assert.strictEqual(B.fileName('{name} {format}', { ...c, row: { ...row, name: 'first cut' } }).name, 'first cut 9x16');
  assert.strictEqual(B.fileName('{nothing}', c).name, 'Neon title 03 9x16', 'an empty name falls back');
  assert.strictEqual(B.safeName('CON'), '_CON'); assert.strictEqual(B.safeName('a/b\\c:d*e|f<g>h'), 'a b c d e f g h'); assert.strictEqual(B.safeName('end. . '), 'end');
  assert.ok(B.safeName('x'.repeat(300)).length <= 120);
  assert.deepStrictEqual(B.uniqueNames(['A 9x16', 'a 9x16', 'B', 'A 9x16']), ['A 9x16', 'a 9x16 (2)', 'B', 'A 9x16 (3)']);
  assert.ok(/^Neon title · batch \d{4}-\d\d-\d\d \d\dh\d\d$/.test(B.folder('Neon/title')), B.folder('Neon/title'));
});
ok('jobs row by row; the whole batch\'s time left from the pace so far, the running job\'s own estimate', () => {
  const js = B.jobs([{ n: 1 }, { n: 2 }], ['16:9', '9:16']);
  assert.deepStrictEqual(js.map((j) => `${j.row.n} ${j.format}`), ['1 16:9', '1 9:16', '2 16:9', '2 9:16']);
  const w = [{ work: 100 }, { work: 100 }, { work: 200 }];
  assert.strictEqual(B.batchLeft(w, 0), null, 'nothing measured yet: no made-up number');
  w[0].t0 = 1000; w[0].left = 9; // running, 1 s in, says 9 s left: 10 s for 100 units
  assert.strictEqual(B.batchLeft(w, 2000), 9 + 10 + 20);
  w[0].t1 = 11000; w[1].t0 = 11000; w[1].left = 4; // the first took 10 s; the second says 4 s
  assert.strictEqual(B.batchLeft(w, 12000), 4 + 20);
  w[1].t1 = 15000;
  assert.strictEqual(B.batchLeft(w, 15000), Math.round(200 * (14000 / 200) / 1000));
});
ok('the summary CSV: a BOM, \\r\\n, quoted cells, formulas defused, the values used per row', () => {
  const recs = [{ n: 1, file: '/out/A 9x16.mp4', format: '9:16', w: 90, h: 160, frames: 6, secs: 0.2, status: 'made', values: { 't:words': 'A, "quoted"', palette: ['#000000', '#ffffff'] } },
    { n: 2, format: '9:16', status: 'cancelled', values: { 't:words': '=SUM(1)' } }];
  const s = B.summaryCsv(recs, B.usedFields(t, [{ values: recs[0].values }]));
  assert.ok(s.startsWith('\uFEFFRow,File,Format,Width,Height,Frames,Seconds,Status,Note,Title,Palette\r\n'), s.slice(0, 120));
  const back = B.parseTable(s).rows;
  assert.deepStrictEqual(back[1], ['1', 'A 9x16.mp4', '9:16', '90', '160', '6', '0.2', 'made', '', 'A, "quoted"', '#000000 #ffffff']);
  assert.strictEqual(back[2][9], '\'=SUM(1)');
  assert.strictEqual(back[2][7], 'cancelled');
});
ok('/batch\'s words: a template, a CSV / folder, lines, formats, a recipe, names, now; status and cancel', () => {
  const a = B.parseArgs('"Neon title" file /Users/q/batch.csv formats 9:16 1x1 recipe Finish names "{title} {format}" secs 12 now');
  assert.deepStrictEqual({ ...a }, { template: 'Neon title', file: '/Users/q/batch.csv', folder: null, lines: null, formats: ['9:16', '1:1'], recipe: 'Finish', names: '{title} {format}', secs: 12, now: true, long: null, op: null });
  const b = B.parseArgs('Neon title lines Summer | Winter | "Spring" formats socials');
  assert.deepStrictEqual([b.template, b.lines, b.formats, b.now], ['Neon title', ['Summer', 'Winter', 'Spring'], ['16:9', '9:16', '1:1', '4:5'], false]);
  assert.strictEqual(B.parseArgs('this folder "C:\\My Songs"').folder, 'C:\\My Songs');
  assert.strictEqual(B.parseArgs('cancel').op, 'cancel');
  assert.strictEqual(B.parseArgs('"Now playing" now').template, 'Now playing');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n  ${e.stack.split('\n').slice(0, 3).join('\n  ')}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
