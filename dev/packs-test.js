// Node tests for packs (round 28, packs-core.js + packsmain.js): the zip format (written here, read back here and by
// the system's unzip when there is one), the path guard (entry names, inside() on POSIX and Windows paths, a crafted
// zip-slip pack refused before anything is written), the caps (too many files, a zip bomb, a damaged file), the
// JSON paths (collected, made into tokens, missing ones dropped), the manifest checks and the card's plain lines.
//   node dev/packs-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const P = require(path.join(__dirname, '..', 'packs-core.js'));
const M = require(path.join(__dirname, '..', 'packsmain.js'));
let n = 0; let failed = 0;
const ok = async (name, fn) => { n += 1; try { await fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${err.stack.split('\n').slice(0, 3).join('\n  ')}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-packs-test-'));
const data = path.join(tmp, 'data'); fs.mkdirSync(data);
M._set({ dataDir: data });
const src = path.join(tmp, 'src'); fs.mkdirSync(src);
const tex = path.join(src, 'brick wall.png'); fs.writeFileSync(tex, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(5000, 7)]));
const tex2dir = path.join(src, 'b'); fs.mkdirSync(tex2dir); const tex2 = path.join(tex2dir, 'brick wall.png'); fs.writeFileSync(tex2, 'another one');
const song = path.join(src, 'song.mp3'); fs.writeFileSync(song, Buffer.alloc(20000, 3));
const body = () => ({
  scenes: [{ key: 'main', sketch: { name: 'Neon tunnel', layers: [{ id: 'main', name: 'Tunnel', code: "const P = tweak({ speed: { value: 1, label: 'Speed' } });", keys: { 's:speed': [{ t: 0, v: 1 }, { t: 2, v: 3 }] } }, { id: 'l2', name: 'Picture', code: 'refTexture("brick")' }] },
    extras: { frame: '9:16', media: { path: song }, looks: [{ name: 'Hot', values: [1] }], layers: { l2: { looks: [{ name: 'A' }] } } },
    refs: [{ key: 'brick', name: 'brick wall.png', kind: 'image', path: tex }, { key: 'brick2', name: 'brick wall.png', kind: 'image', path: tex2 }, { key: 'gone', name: 'gone.hdr', kind: 'data', path: '/nowhere/at/all/gone.hdr' }] }],
  song: { file: song, name: 'song.mp3' },
  luts: [{ name: 'teal', file: 'inline:teal.cube' }],
});
// a zip by hand (the evil ones)
function rawZip(entries) {
  const parts = []; const cds = []; let off = 0;
  for (const e of entries) {
    const d = Buffer.from(e.data || ''); const body2 = e.method === 8 ? zlib.deflateRawSync(d) : d;
    const x = { name: e.name, method: e.method || 0, crc: P.crc32(d), csize: body2.length, size: e.size ?? d.length, at: new Date(), offset: off };
    const lh = Buffer.from(P.localHeader(x)); parts.push(lh, body2); off += lh.length + body2.length; cds.push(x);
  }
  const cd = Buffer.concat(cds.map((x) => Buffer.from(P.centralHeader(x))));
  return Buffer.concat([...parts, cd, Buffer.from(P.endRecord(cds.length, cd.length, off))]);
}
const MAN = JSON.stringify(P.makeManifest({ kind: 'scene', name: 'Evil', scenes: [{ sketch: { name: 'x', layers: [{ code: '1' }] } }] }));

(async () => {
  await ok('crc32 matches zlib\'s', () => {
    for (const s of ['', 'a', 'hearthpack', 'x'.repeat(10000)]) assert.strictEqual(P.crc32(Buffer.from(s)), zlib.crc32 ? zlib.crc32(Buffer.from(s)) >>> 0 : P.crc32(Buffer.from(s)));
    assert.strictEqual(P.crc32(Buffer.from('123456789')), 0xcbf43926);
  });
  await ok('entry names: only the manifest, the picture and files/<one plain name>', () => {
    for (const good of ['hearthpack.json', 'thumb.jpg', 'files/a.png', 'files/brick wall 2.png', 'files/été.hdr']) assert.ok(P.entryOk(good), good);
    for (const bad of ['../x', 'files/../../evil.sh', '/etc/passwd', 'C:/x.png', 'files/C:x', 'files\\..\\x', 'files/a/b.png', 'files/', 'files/..', 'files/.hidden', 'other.txt', 'files/a\u0000.png', 'files/con.txt', 'files/x.', '', null, 'files/' + 'a'.repeat(300)]) assert.ok(!P.entryOk(bad), String(bad));
  });
  await ok('inside(): POSIX and Windows paths, ".." and siblings refused', () => {
    assert.ok(P.inside('/d/assets/packs/A', '/d/assets/packs/A/x.png', path.posix));
    assert.ok(!P.inside('/d/assets/packs/A', '/d/assets/packs/A/../B/x.png', path.posix));
    assert.ok(!P.inside('/d/assets/packs/A', '/d/assets/packs/AB/x.png', path.posix));
    assert.ok(!P.inside('/d/assets/packs/A', '/d/assets/packs/A', path.posix));
    assert.ok(!P.inside('/d/a', '/etc/passwd', path.posix));
    assert.ok(P.inside('C:\\H\\data', 'C:\\H\\data\\assets\\x.png', path.win32));
    assert.ok(!P.inside('C:\\H\\data', 'D:\\H\\data\\x.png', path.win32));
    assert.ok(!P.inside('C:\\H\\data', 'C:\\H\\data\\..\\x.png', path.win32));
  });
  await ok('paths in the JSON: collected (absolute, media only), rewritten as a copy', () => {
    const got = P.collectPaths({ a: '/Users/x/a.png', b: ['C:\\U\\b.mp3', 'file:///Users/x/c.glb'], c: 'relative/d.png', d: '/no-ext', e: 'just words', f: { g: '\\\\server\\s\\h.hdr' } });
    assert.deepStrictEqual(got.sort(), ['/Users/x/a.png', 'C:\\U\\b.mp3', '\\\\server\\s\\h.hdr', 'file:///Users/x/c.glb'].sort());
    const o = { a: '/x/a.png', n: 3, l: ['/x/a.png'] };
    const r = P.rewrite(o, (s) => (s === '/x/a.png' ? 'T' : s));
    assert.deepStrictEqual(r, { a: 'T', n: 3, l: ['T'] }); assert.strictEqual(o.a, '/x/a.png');
    const names = P.entryNames(['/a/brick.png', '/b/brick.png', '/c/BRICK.png']);
    assert.deepStrictEqual([...names.values()], ['files/brick.png', 'files/brick 2.png', 'files/BRICK 3.png']);
  });
  let packed = null;
  await ok('write: a scene with its files → one .hearthpack (manifest first, tokens, missing ones listed)', async () => {
    const out = path.join(tmp, 'Neon tunnel.hearthpack');
    const r = await M.write({ body: body(), meta: { kind: 'scene', name: 'Neon tunnel' }, inline: [{ name: 'teal.cube', text: 'LUT_3D_SIZE 2\n0 0 0\n1 1 1\n' }], thumb: `data:image/jpeg;base64,${Buffer.from('fakejpeg').toString('base64')}`, out });
    assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.path, out); assert.ok(fs.statSync(out).size === r.size);
    assert.strictEqual(r.files, 4); // 2 textures, the song, the LUT
    assert.deepStrictEqual(r.missing, ['gone.hdr']);
    assert.ok(!fs.existsSync(`${out}.part`));
    packed = out;
  });
  await ok('the system unzip reads it too (a plain zip)', () => {
    let list;
    try { list = execFileSync('unzip', ['-Z1', packed], { encoding: 'utf8' }); } catch { console.log('  (no unzip here: skipped)'); return; }
    assert.deepStrictEqual(list.trim().split('\n').sort(), ['files/brick wall 2.png', 'files/brick wall.png', 'files/song.mp3', 'files/teal.cube', 'hearthpack.json', 'thumb.jpg'].sort());
    execFileSync('unzip', ['-tq', packed]);
  });
  await ok('peek: the manifest (no local paths left), its picture, sizes; the card lines', async () => {
    const p = await M.peek(packed);
    assert.ok(p.ok, JSON.stringify(p.problems));
    const m = p.manifest;
    assert.strictEqual(m.format, 'hearthpack'); assert.strictEqual(m.name, 'Neon tunnel'); assert.strictEqual(m.made.platform, process.platform);
    const json = JSON.stringify(m);
    assert.ok(!json.includes(src), 'no path of the computer it came from');
    assert.strictEqual(m.scenes[0].extras.media.path, 'hearthpack:files/song.mp3');
    assert.strictEqual(m.scenes[0].refs[1].path, 'hearthpack:files/brick wall 2.png');
    assert.strictEqual(m.scenes[0].refs[2].path, '');
    assert.strictEqual(m.luts[0].file, 'hearthpack:files/teal.cube');
    assert.ok(p.thumb.startsWith('data:image/jpeg;base64,'));
    const lines = P.describe(m);
    assert.match(lines[0], /A Lab scene · 2 layers/); assert.match(lines[1], /1 slider · 2 saved looks · 2 keyframes/);
    assert.match(lines[2], /2 textures, 1 LUT, the song/); assert.match(lines[3], /1 file .*gone\.hdr/);
    assert.match(P.from(m), /^Made with Hearth/);
  });
  await ok('unpack: into data/assets/packs/<name>/ only, the same bytes, a second import gets its own folder', async () => {
    const u = await M.unpack(packed);
    assert.ok(u.ok, JSON.stringify(u.problems));
    assert.strictEqual(u.dir, path.join(data, 'assets', 'packs', 'Neon tunnel'));
    assert.deepStrictEqual(fs.readFileSync(u.map['files/brick wall.png']), fs.readFileSync(tex));
    assert.deepStrictEqual(fs.readFileSync(u.map['files/song.mp3']), fs.readFileSync(song));
    for (const t of Object.values(u.map)) assert.ok(P.inside(path.join(data, 'assets', 'packs'), t, path));
    const u2 = await M.unpack(packed);
    assert.strictEqual(u2.dir, path.join(data, 'assets', 'packs', 'Neon tunnel 2'));
  });
  await ok('zip-slip: a pack with "../" (or an absolute name) is refused, nothing written outside', async () => {
    for (const evil of ['files/../../../evil.txt', '../evil.txt', '/tmp/evil.txt', 'files/..\\..\\evil.txt']) {
      const f = path.join(tmp, 'evil.hearthpack');
      fs.writeFileSync(f, rawZip([{ name: 'hearthpack.json', data: MAN }, { name: evil, data: 'pwned' }]));
      const p = await M.peek(f); assert.ok(!p.ok && /isn't a name a pack may hold/.test(p.problems.join(' ')), evil);
      const u = await M.unpack(f); assert.ok(!u.ok, evil);
    }
    assert.ok(!fs.existsSync(path.join(tmp, 'evil.txt')) && !fs.existsSync(path.join(data, 'evil.txt')) && !fs.existsSync(path.join(data, 'assets', 'evil.txt')));
    assert.ok(!fs.existsSync(path.join(data, 'assets', 'packs', 'Evil')));
  });
  await ok('caps: a zip bomb, too many files, a damaged file, no manifest, a newer format, not a zip', async () => {
    const f = path.join(tmp, 'x.hearthpack');
    fs.writeFileSync(f, rawZip([{ name: 'hearthpack.json', data: MAN }, { name: 'files/bomb.txt', data: '0'.repeat(50 * 1048576), method: 8 }]));
    assert.match((await M.peek(f)).problems.join(' '), /zip bomb/);
    fs.writeFileSync(f, rawZip([{ name: 'hearthpack.json', data: MAN }, ...Array.from({ length: P.LIMITS.entries + 1 }, (_, i) => ({ name: `files/f${i}.txt`, data: 'x' }))]));
    assert.match((await M.peek(f)).problems.join(' '), /files: the most/);
    const good = rawZip([{ name: 'hearthpack.json', data: MAN }, { name: 'files/a.txt', data: 'hello hello' }]);
    const bad = Buffer.from(good); bad[good.indexOf('hello') + 1] ^= 0xff;
    fs.writeFileSync(f, bad);
    const u = await M.unpack(f); assert.ok(!u.ok && /damaged/.test(u.problems.join(' ')), JSON.stringify(u));
    assert.ok(!fs.existsSync(path.join(data, 'assets', 'packs', 'Evil')), 'a failed unpack removes its folder');
    fs.writeFileSync(f, rawZip([{ name: 'files/a.txt', data: 'x' }]));
    assert.match((await M.peek(f)).problems.join(' '), /no hearthpack\.json/);
    fs.writeFileSync(f, rawZip([{ name: 'hearthpack.json', data: JSON.stringify({ ...JSON.parse(MAN), v: 9 }) }]));
    assert.match((await M.peek(f)).problems.join(' '), /newer Hearth/);
    fs.writeFileSync(f, 'not a zip at all');
    assert.ok(!(await M.peek(f)).ok);
    assert.ok(!(await M.peek(path.join(tmp, 'a.zip'))).ok, 'only .hearthpack files');
  });
  await ok('manifest: tokens pointing at files that aren\'t in the pack are dropped (and listed missing)', () => {
    const m = P.makeManifest({ kind: 'scene', name: 'T', scenes: [{ sketch: { name: 'x', layers: [{ code: '' }] }, extras: { media: { path: 'hearthpack:files/nope.mp3' } }, refs: [{ path: 'hearthpack:files/../x.png' }] }] });
    const c = P.checkManifest(m, [{ name: 'hearthpack.json' }]);
    assert.ok(c.ok); assert.strictEqual(c.m.scenes[0].extras.media.path, ''); assert.strictEqual(c.m.scenes[0].refs[0].path, '');
    assert.deepStrictEqual(c.m.missing.sort(), ['nope.mp3', 'x.png'].sort());
    assert.ok(!P.checkManifest({ format: 'other' }).ok);
    assert.ok(!P.checkManifest(P.makeManifest({ kind: 'scene', name: 'T', scenes: [] })).ok);
    const big = P.makeManifest({ kind: 'scene', name: 'T', scenes: [{ sketch: { name: 'x', layers: [{ code: 'x'.repeat(P.LIMITS.code + 1) }] } }] });
    assert.ok(!P.checkManifest(big).ok);
  });
  await ok('safe names for files and folders', () => {
    assert.strictEqual(P.safeName('../../etc/passwd'), 'etc passwd');
    assert.strictEqual(P.safeName('  ...  '), 'Scene');
    assert.strictEqual(P.safeBase('C:\\Users\\x\\a:b.png'), 'a_b.png');
    assert.strictEqual(P.fmtSize(1536 * 1048576), '1.5 GB');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `FAIL ${failed} of ${n}` : `✓ ${n} packs tests`);
  process.exit(failed ? 1 : 0);
})();
