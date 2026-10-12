#!/usr/bin/env node
// The asset library without Electron (round 24): AssetsCore (kinds, the index, dedupe by hash, gone files, tags,
// search and filters, the free libraries' JSON, LUTs), assets-work.js (a real folder walked and hashed: the duplicate
// found, unchanged files not read again), assetsmain.js's zip reader and glTF → GLB packer.
//   node dev/assets-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../assets-core');
const W = require('../assets-work');
const M = require('../assetsmain');
const FA = require('./fake-assets');

let pass = 0; let fail = 0;
const t = (name, fn) => { try { fn(); pass += 1; console.log(`ok   ${name}`); } catch (err) { fail += 1; console.log(`FAIL ${name}: ${err.message}`); } };

t('kinds by extension', () => {
  const k = { 'a.PNG': 'image', 'b.jpeg': 'image', 'sky.hdr': 'hdri', 's.exr': 'hdri', 'm.glb': 'model', 'm.fbx': 'model', 'f.otf': 'font', 'f.woff2': 'font', 's.wav': 'sound', 's.m4a': 'sound', 'l.cube': 'lut', 'x.glsl': 'shader', 'x.frag': 'shader', 'p.hpreset': 'preset', 'neon.look.json': 'preset', 'v.mp4': 'video', 'n.txt': null, 'data.json': null };
  for (const [f, want] of Object.entries(k)) assert.strictEqual(C.kindOf(f), want, f);
});
t('names and tags from paths', () => {
  assert.strictEqual(C.nice('/x/brick_wall_02_diff_1k.jpg'), 'brick wall 02');
  assert.deepStrictEqual(C.autoTags('/Users/me/Textures/Brick/red_brick_1k.jpg', '/Users/me/Textures'), ['brick', 'red']);
});
t('index: add, dedupe by hash, a second place, gone', () => {
  const db = C.empty();
  const a = C.upsert(db, { p: '/a/brick.png', s: 10, m: 1, h: 'aaaaaaaaaaaa' }, { src: 'folder' });
  assert.ok(a.added && a.item.k === 'image');
  const b = C.upsert(db, { p: '/b/copy of brick.png', s: 10, m: 2, h: 'aaaaaaaaaaaa' }, { src: 'download', o: 'Meshy' });
  assert.ok(!b.added && b.dup, 'the same bytes are one asset');
  assert.strictEqual(C.list(db).length, 1);
  assert.deepStrictEqual(a.item.alt, ['/b/copy of brick.png']);
  assert.strictEqual(a.item.src, 'download', 'a better source than a folder sticks');
  C.gone(db, '/a/brick.png');
  assert.strictEqual(a.item.p, '/b/copy of brick.png', 'the other place takes over');
  C.gone(db, '/b/copy of brick.png');
  assert.strictEqual(C.list(db).length, 0, 'an untouched asset whose files are gone leaves');
  const c = C.upsert(db, { p: '/c/sky.hdr', s: 5, m: 1, h: 'bbbbbbbbbbbb' }, {}).item;
  C.toggleFav(c);
  C.gone(db, '/c/sky.hdr');
  assert.ok(db.items.bbbbbbbbbbbb?.g, 'a favorite stays, faded');
  C.upsert(db, { p: '/d/sky.hdr', s: 5, m: 1, h: 'bbbbbbbbbbbb' }, {});
  assert.ok(!db.items.bbbbbbbbbbbb.g && db.items.bbbbbbbbbbbb.p === '/d/sky.hdr', 'found again elsewhere: back');
});
t('normalize keeps what it understands', () => {
  const n = C.normalize({ items: { x1: { p: '/q/a.ttf', tg: ['#Bold', 'Serif Font'] }, bad: { n: 'no path' } }, folders: [{ p: '/q' }, {}] });
  assert.strictEqual(Object.keys(n.items).length, 1);
  assert.strictEqual(n.items.x1.k, 'font');
  assert.deepStrictEqual(n.items.x1.tg, ['bold', 'serif-font']);
  assert.strictEqual(n.folders.length, 1);
});
t('search: words, kinds, tags, favorites, sources, ranking', () => {
  const db = C.empty();
  const add = (p, h, extra = {}) => C.upsert(db, { p, s: 1, m: 1, h }, extra).item;
  const brick = add('/t/Red Brick Wall.png', 'h1', { tg: ['brick', 'wall'] });
  add('/t/brick_sky.hdr', 'h2');
  const font = add('/f/Bold Grotesk.ttf', 'h3');
  add('/s/kick.wav', 'h4', { src: 'download', o: 'Suno' });
  C.toggleFav(font);
  assert.strictEqual(C.search(db, 'brick')[0], brick, 'a name hit first');
  assert.deepStrictEqual(C.search(db, 'kind:hdri').map((x) => x.h), ['h2']);
  assert.deepStrictEqual(C.search(db, 'hdri brick').map((x) => x.h), ['h2'], 'a kind word first is a filter');
  assert.deepStrictEqual(C.search(db, '#wall').map((x) => x.h), ['h1']);
  assert.deepStrictEqual(C.search(db, 'fav').map((x) => x.h), ['h3']);
  assert.deepStrictEqual(C.search(db, 'src:download').map((x) => x.h), ['h4']);
  assert.deepStrictEqual(C.search(db, 'suno').map((x) => x.h), ['h4'], 'the origin matches too');
  assert.strictEqual(C.search(db, 'nothing-like-this').length, 0);
  assert.strictEqual(C.search(db, '', { kind: 'font' }).length, 1);
  C.tagEdit(brick, '+red -wall');
  assert.deepStrictEqual(brick.tg.sort(), ['brick', 'red']);
  assert.deepStrictEqual(C.counts(db).fav, 1);
  assert.ok(C.topTags(db).some((x) => x.t === 'brick'));
  assert.strictEqual(C.byId(db, 'h1') , null, 'ids shorter than 6 never match');
});
t('Poly Haven JSON → cards and files', () => {
  const list = C.polyList({ a: { name: 'Sunset A', categories: ['sunset'], tags: ['warm'], download_count: 5 }, b: { name: 'Studio', categories: ['studio'], download_count: 9 } }, 'sunset', 'hdris');
  assert.strictEqual(list.length, 1); assert.strictEqual(list[0].kind, 'hdri');
  const hd = C.polyFiles({ hdri: { '1k': { hdr: { url: 'https://x/a_1k.hdr' } }, '2k': { hdr: { url: 'https://x/a_2k.hdr' } } } }, 'hdris', '4k');
  assert.strictEqual(hd[0].url, 'https://x/a_2k.hdr', 'a missing size falls back to the next one down');
  const tx = C.polyFiles({ Diffuse: { '1k': { jpg: { url: 'https://x/d.jpg' } } }, nor_gl: { '1k': { jpg: { url: 'https://x/n.jpg' } } } }, 'textures', '1k');
  assert.deepStrictEqual(tx.map((f) => f.role), ['main', 'normal']);
  const md = C.polyFiles({ gltf: { '1k': { gltf: { url: 'https://x/m.gltf', include: { 'scene.bin': { url: 'https://x/scene.bin' } } } } } }, 'models', '1k');
  assert.deepStrictEqual(md.map((f) => f.rel), ['m.gltf', 'scene.bin']);
});
t('ambientCG JSON → cards, sizes and the right download', () => {
  const raw = { foundAssets: [{ assetId: 'Bricks076', displayName: 'Bricks 076', tags: ['brick'], previewImage: { '256-PNG': 'https://x/p.png' }, downloadFolders: { default: { downloadFiletypeCategories: { zip: { downloads: [{ attribute: '1K-PNG', downloadLink: 'https://x/1p.zip' }, { attribute: '1K-JPG', downloadLink: 'https://x/1j.zip' }, { attribute: '2K-JPG', downloadLink: 'https://x/2j.zip' }] } } } } }] };
  const l = C.acgList(raw, 'materials');
  assert.deepStrictEqual(l[0].sizes, ['1k', '2k']);
  assert.strictEqual(C.acgFile(l[0].raw, '1k').downloadLink, 'https://x/1j.zip', 'JPG before PNG');
  assert.strictEqual(C.acgFile(l[0].raw, '8k').downloadLink, 'https://x/1j.zip', 'a size it lacks: the smallest JPG');
  assert.strictEqual(C.mapRole('Bricks076_1K-JPG_Color.jpg'), 'main');
  assert.strictEqual(C.mapRole('Bricks076_1K-JPG_NormalGL.jpg'), 'normal');
});
t('LUTs: parsed and applied', () => {
  const L = C.parseCube(FA.cube(4).toString());
  assert.strictEqual(L.n, 4);
  const [r, , b] = C.lutApply(L, 1, 1, 1);
  assert.ok(r === 1 && b < 0.85, 'the warm LUT');
  assert.strictEqual(C.parseCube('LUT_3D_SIZE 2\n0 0 0\n'), null, 'a short file is not a LUT');
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-assets-test-'));
FA.fixtures(dir);
t('a folder walked and hashed (worker job): kinds, the duplicate, skipped text', () => {
  const r = W.run({ type: 'scan', roots: [dir], known: {} });
  assert.ok(r.ok, r.error);
  const names = r.files.map((f) => path.basename(f.p)).sort();
  assert.ok(!names.includes('notes.txt'));
  for (const n of ['red_brick_wall_diff_1k.png', 'red brick (copy).png', 'sunset_sky_1k.hdr', 'robot_textured.glb', 'kick_hit.wav', 'Warm Film.cube', 'plasma.glsl', 'Neon pulse.hpreset']) assert.ok(names.includes(n), n);
  const png = r.files.filter((f) => /brick/i.test(f.p) && /\.png$/.test(f.p));
  assert.strictEqual(png.length, 2); assert.strictEqual(png[0].h, png[1].h, 'the copy has the same hash');
  const db = C.empty();
  for (const f of r.files) C.upsert(db, f, { src: 'folder', root: dir });
  assert.strictEqual(C.list(db).length, r.files.length - 1, 'one asset for the two bricks');
  // a second scan with what's known reads nothing again (hashes reused)
  const known = Object.fromEntries(r.files.map((f) => [f.p, [f.s, f.m, 'cafebabe0000']]));
  const r2 = W.run({ type: 'scan', roots: [dir], known });
  assert.ok(r2.files.every((f) => f.h === 'cafebabe0000'), 'unchanged files keep their hash');
});
t('big files hash by samples, consistently', () => {
  const big = path.join(dir, 'big.mp4');
  const b = Buffer.alloc(33 * 1048576, 7); b[20 * 1048576] = 1; fs.writeFileSync(big, b);
  const h1 = W.hashFile(big, b.length); const h2 = W.hashFile(big, b.length);
  assert.strictEqual(h1, h2);
  fs.rmSync(big);
});
t('zip reader (ambientCG downloads)', () => {
  const z = path.join(dir, 'm.zip');
  fs.writeFileSync(z, FA.zip([['Wood_Color.jpg', Buffer.from('color')], ['sub/Wood_NormalGL.jpg', Buffer.from('normal')], ['__MACOSX/x', Buffer.from('junk')]]));
  const out = M.unzip(z, path.join(dir, 'm'));
  assert.deepStrictEqual(out.map((p) => path.basename(p)).sort(), ['Wood_Color.jpg', 'Wood_NormalGL.jpg']);
  assert.strictEqual(fs.readFileSync(out.find((p) => /Normal/.test(p)), 'utf8'), 'normal');
});
t('glTF + parts → one GLB (Poly Haven models)', () => {
  const d = path.join(dir, 'chair'); fs.mkdirSync(path.join(d, 'textures'), { recursive: true });
  const p = FA.gltfParts();
  fs.writeFileSync(path.join(d, 'chair.gltf'), p.gltf); fs.writeFileSync(path.join(d, 'scene.bin'), p.bin); fs.writeFileSync(path.join(d, 'textures', 'diff.png'), p.tex);
  const glb = M.packGlb(path.join(d, 'chair.gltf'));
  const b = fs.readFileSync(glb);
  assert.strictEqual(b.readUInt32LE(0), 0x46546c67);
  const jl = b.readUInt32LE(12); const j = JSON.parse(b.toString('utf8', 20, 20 + jl));
  assert.ok(!j.buffers[0].uri && j.images[0].bufferView != null && j.images[0].mimeType === 'image/png', 'everything inside');
  const binLen = b.readUInt32LE(20 + jl); assert.ok(binLen >= p.bin.length + p.tex.length);
  assert.strictEqual(b.length, b.readUInt32LE(8));
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
