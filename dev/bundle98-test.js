// (round 98, bundle98) Node tests: a model made of several files in a .hearthproject and in ⧉ Duplicate project, and a
// failed import / copy taking back everything it wrote. Throwaway folders only (os.tmpdir()/bd98-…, removed after); the
// Trash is a folder of the test's own (projbundlemain _set({ trash })), so "went to the Trash" is looked at, not assumed.
//   - assetdeps-core.js: a .gltf with its .bin and textures in sub-folders and one folder up (layout kept, nothing
//     rewritten), a missing buffer named; written on Windows (a "\" URI, another case, an absolute path, a dotfile, two
//     names differing by case: only those URIs rewritten); an .obj with its .mtl (options before a texture), a .glb
//     naming an outside file (packed; one that would need a rewrite: named); data: / http(s) URIs left alone
//   - projbundlemain.js: export → peek → unpack: every file the model names lands in its layout next to it, the same
//     bytes, the .gltf itself byte for byte; entry names with "/" only (a PC's bundle opens on a Mac); a buffer missing
//     where it was made named in the card's skipped and the import's; an older bundle (the .gltf alone) named on import;
//     copyAsset (Duplicate): the folder copied whole, never over a file, a copy failing half-way to the Trash; untake
//     refuses anything it didn't make
//   - failure injection, main side: a full disk / a refused write at the first and a middle file, at the end of the
//     unpack, a cancel: the import stops, its folder in the Trash, nothing left in Hearth's folder; a damaged file:
//     skipped and named (its part in the Trash), the import goes on
//   - failure injection, window side (projbundle.js apply in a sandbox with every store faked): a thrown write, a full
//     disk, a cancel from the card at each step of an import and of a Duplicate → nothing half-imported stays (scenes,
//     chats, boards, sequences, pins, bars, loops, sequence picks, History files, the worktable's store, copies, the
//     project): each went to its Trash; nothing that was there before was touched; History is written before the Lab
//     can open its scene, never over a file that's there
//   node dev/bundle98-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const AD = require(path.join(ROOT, 'assetdeps-core.js'));
const C = require(path.join(ROOT, 'projbundle-core.js'));
const M = require(path.join(ROOT, 'projbundlemain.js'));

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const TMP = require('./tmp-own').mkdtemp('bd98-');
const SRC = path.join(TMP, 'pc'); const DATA = path.join(TMP, 'data'); const TRASH = path.join(TMP, 'Trash'); const OUT = path.join(TMP, 'out');
for (const d of [SRC, DATA, TRASH, OUT]) fs.mkdirSync(d, { recursive: true });
let trashed = [];
const fakeTrash = async (paths) => { const done = []; for (const p of paths) { const t = path.join(TRASH, `${trashed.length}-${path.basename(p)}`); fs.renameSync(p, t); trashed.push(p); done.push(p); } return { done, failed: [] }; };
M._set({ dataDir: DATA, trash: fakeTrash });
const w = (rel, data) => { const p = path.join(SRC, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
const sha = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
const rnd = (n) => crypto.randomBytes(n);
// every file under a folder (relative, "/")
const tree = (dir) => { const out = []; const go = (d, r) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const rr = r ? `${r}/${e.name}` : e.name; if (e.isDirectory()) go(path.join(d, e.name), rr); else out.push(rr); } }; go(dir, ''); return out.sort(); };

// ---------- fixtures: a multi-file glTF (a .bin and textures in sub-folders, one texture a folder up, a buffer missing) ----------
const BIN = rnd(4096); const WOOD = rnd(3000); const ROCK = rnd(2000); const NORMAL = rnd(1500);
const CAR = {
  asset: { version: '2.0', generator: 'bundle98 fixture' },
  buffers: [{ uri: 'buffers/car.bin', byteLength: 4096 }, { uri: 'buffers/wheels.bin', byteLength: 64 }, { uri: 'data:application/octet-stream;base64,AAAA', byteLength: 3 }],
  images: [{ uri: 'textures/wood%20grain.png' }, { uri: 'textures/normals/car_n.png' }, { uri: '../shared/rock.jpg' }, { uri: 'https://example.com/sky.png' }],
};
const carText = `${JSON.stringify(CAR, null, 2)}\n`;
const carGltf = w('models/car/car.gltf', carText);
w('models/car/buffers/car.bin', BIN); w('models/car/textures/wood grain.png', WOOD); w('models/car/textures/normals/car_n.png', NORMAL); w('models/shared/rock.jpg', ROCK);
// (buffers/wheels.bin is missing: named, never dropped silently)
const resolveUri = (gltfPath, uri) => path.join(path.dirname(gltfPath), ...decodeURIComponent(uri).split('/'));

// ---------- assetdeps-core ----------
ok('a .gltf with a .bin and textures in sub-folders and one folder up: every file in its layout, nothing rewritten, the missing buffer named', () => {
  const pl = AD.plan(carGltf, { fs, path, name: 'car.gltf' });
  assert.strictEqual(pl.main.rel, 'car/car.gltf', 'one folder up is named: the model goes in its own folder (named as on this computer)');
  assert.strictEqual(pl.main.data, undefined, 'nothing inside the model is rewritten');
  assert.deepStrictEqual(pl.files.map((f) => f.rel).sort(), ['car/buffers/car.bin', 'car/textures/normals/car_n.png', 'car/textures/wood grain.png', 'shared/rock.jpg']);
  assert.deepStrictEqual(pl.missing, [{ name: 'wheels.bin', of: 'car.gltf' }]);
  assert.deepStrictEqual(AD.missingLines(pl.missing), ['wheels.bin (used by car.gltf: not on this computer)']);
  assert.strictEqual(pl.moved, 0);
});
ok('written on Windows: a "\\" URI, another case, an absolute path, a dotfile, two names by case → only those URIs rewritten, the rest of the JSON as it was', () => {
  const abs = w('elsewhere/decal.png', rnd(100));
  const j = { asset: { version: '2.0' }, buffers: [{ uri: 'Buffers\\Truck.bin', byteLength: 10 }], images: [{ uri: 'TEXTURES/Paint.PNG' }, { uri: `file:///${abs.replace(/^\//, '')}` }, { uri: '.cache/x.png' }, { uri: 'textures/paint.png' }, { uri: 'con.png' }], extras: { keep: 'me' } };
  const g = w('win/truck.gltf', JSON.stringify(j));
  w('win/buffers/truck.bin', rnd(10)); w('win/textures/paint.png', rnd(20)); w('win/.cache/x.png', rnd(5)); w('win/con.png', rnd(5));
  const pl = AD.plan(g, { fs, path, name: 'truck.gltf' });
  const out = JSON.parse(pl.main.data.toString());
  assert.strictEqual(out.buffers[0].uri, 'Buffers/Truck.bin', '"\\" → "/" (its place kept, the name as the URI spells it)');
  assert.strictEqual(out.images[0].uri, 'TEXTURES/Paint.PNG', 'another case: kept (packed under that spelling)');
  assert.ok(/^hearth-files\/\d+-decal\.png$/.test(out.images[1].uri), out.images[1].uri);
  assert.ok(/^hearth-files\/\d+-cache_x\.png$|^hearth-files\/\d+-x\.png$/.test(out.images[2].uri), out.images[2].uri);
  assert.strictEqual(out.images[3].uri, 'TEXTURES/Paint.PNG', 'the same file by another case: one copy, the URI points at it');
  assert.ok(/^hearth-files\/\d+-_con\.png$/.test(out.images[4].uri), out.images[4].uri);
  assert.deepStrictEqual(out.extras, { keep: 'me' }); assert.strictEqual(out.asset.version, '2.0');
  const rels = pl.files.map((f) => f.rel);
  assert.ok(rels.includes('Buffers/Truck.bin') && rels.includes('TEXTURES/Paint.PNG'), rels.join());
  assert.strictEqual(new Set(rels.map((r) => r.toLowerCase())).size, rels.length, 'no two names differing by case only');
  for (const r of rels) assert.ok(C.entryOk(`assets/0/${r}`), r);
  assert.deepStrictEqual(pl.missing, []);
});
ok('an .obj with its .mtl (options before a texture), a texture missing named; a .glb naming an outside file packed, one needing a rewrite named', () => {
  const o = w('obj/chair.obj', 'mtllib chair parts.mtl\no chair\nv 0 0 0\n');
  w('obj/chair parts.mtl', 'newmtl seat\nmap_Kd -s 1 1 1 -o 0.5 maps/seat.png\nbump -bm 0.4 maps/seat_n.png\nmap_Ks maps/gone.png\n');
  w('obj/maps/seat.png', rnd(30)); w('obj/maps/seat_n.png', rnd(30));
  const pl = AD.plan(o, { fs, path, name: 'chair.obj' });
  assert.deepStrictEqual(pl.files.map((f) => f.rel).sort(), ['chair parts.mtl', 'maps/seat.png', 'maps/seat_n.png']);
  assert.deepStrictEqual(pl.missing, [{ name: 'gone.png', of: 'chair parts.mtl' }]);
  assert.strictEqual(pl.main.data, undefined);
  // a .glb with an outside image (its JSON chunk names it)
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, images: [{ uri: 'tex/a.png' }, { uri: 'C:\\Users\\Q\\b.png' }] }).padEnd(80, ' '));
  const glb = Buffer.alloc(20 + json.length); glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(json.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20);
  const gp = w('glb/m.glb', glb); w('glb/tex/a.png', rnd(9));
  const pg = AD.plan(gp, { fs, path, name: 'm.glb' });
  assert.deepStrictEqual(pg.files.map((f) => f.rel), ['tex/a.png']);
  assert.deepStrictEqual(pg.missing.map((m) => m.name), ['b.png'], 'another computer\'s absolute path: not here, named');
  assert.strictEqual(AD.plan(w('one/solid.stl', rnd(80)), { fs, path }).files.length, 0);
  assert.strictEqual(AD.isModel('x.stl'), false); assert.strictEqual(AD.isModel('X.GLTF'), true);
});
ok('URIs: data: and http(s) carry nothing; file:// and drive paths are absolute; %20 decoded for glTF only; "./" and ".." normalised', () => {
  assert.strictEqual(AD.parseUri('data:x', 'gltf').type, 'data');
  assert.strictEqual(AD.parseUri('https://a/b.png', 'gltf').type, 'remote');
  assert.deepStrictEqual(AD.parseUri('file:///C:/a%20b/c.png', 'gltf'), { type: 'abs', path: 'C:/a b/c.png' });
  assert.deepStrictEqual(AD.parseUri('./tex/a%20b.png?v=2', 'gltf'), { type: 'rel', segs: ['tex', 'a b.png'], slash: false });
  assert.deepStrictEqual(AD.parseUri('tex/a%20b.png', 'mtl'), { type: 'rel', segs: ['tex', 'a%20b.png'], slash: false });
  assert.deepStrictEqual(AD.normSegs(['a', '..', '..', 'b', '.', 'c']), ['..', 'b', 'c']);
});

// ---------- projbundlemain: export → peek → unpack ----------
const sceneBody = (refs, extra = {}) => C.prepare({ project: { id: 'p', name: extra.name || 'Garage', items: extra.items || [] }, scenes: [{ id: 's1', sketch: { id: 's1', name: 'Garage', code: 'x' }, extras: null, refs, notes: [] }], files: extra.files || [] }).body;
let bundle = null;
ok('export → peek → unpack: the .gltf and every file it names in its layout (same bytes, the model byte for byte), "/" only in entry names, the missing buffer named on the card and on import', async () => {
  const body = sceneBody([{ id: 'r1', key: 'car', name: 'car.gltf', kind: 'model', path: carGltf }]);
  const before = tree(SRC).map((f) => `${f}:${sha(path.join(SRC, f))}`);
  const r = await M.exportBundle({ body, name: 'Garage', job: 'e1', out: path.join(OUT, 'Garage.hearthproject') });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.files, 5, 'the model + 4 files it names');
  assert.deepStrictEqual(r.skipped, ['wheels.bin (used by car.gltf: not on this computer)']);
  const zip = await require(path.join(ROOT, 'zipkit.js')).entries(r.path);
  for (const e of zip) { assert.ok(!e.name.includes('\\'), e.name); assert.ok(C.entryOk(e.name), e.name); }
  assert.deepStrictEqual(tree(SRC).map((f) => `${f}:${sha(path.join(SRC, f))}`), before, 'the owner\'s files only read');
  const pv = await M.peek(r.path);
  assert.ok(pv.ok && pv.lines.some((l) => /wheels\.bin \(used by car\.gltf/.test(l)), JSON.stringify(pv.lines));
  const u = await M.unpack({ file: r.path, job: 'u1' });
  assert.ok(u.ok, JSON.stringify(u));
  const g = u.body.scenes[0].refs[0].path;
  assert.ok(g.startsWith(u.dir) && g.endsWith(`${path.sep}car${path.sep}car.gltf`), g);
  assert.strictEqual(sha(g), sha(carGltf), 'the .gltf byte for byte (nothing rewritten)');
  for (const x of [...CAR.buffers, ...CAR.images].map((y) => y.uri).filter((y) => !/^(data|https?):/.test(y) && y !== 'buffers/wheels.bin')) assert.strictEqual(sha(resolveUri(g, x)), sha(resolveUri(carGltf, x)), x);
  assert.ok(!fs.existsSync(resolveUri(g, 'buffers/wheels.bin')));
  assert.strictEqual(u.skipped.filter((x) => /wheels\.bin/.test(x)).length, 1, `named once: ${u.skipped}`);
  bundle = { file: r.path, dir: u.dir };
});
ok('a project file item that is an .obj: its .mtl and textures come too (files/<n>/…); the card counts them', async () => {
  const o = path.join(SRC, 'obj/chair.obj');
  const sz = await M.sizes({ paths: [carGltf], dirs: [o] });
  assert.strictEqual(sz.files[0].files, 5); assert.ok(sz.files[0].missing?.[0].includes('wheels.bin'));
  assert.strictEqual(sz.dirs[0].files, 4);
  const body = sceneBody([], { items: [{ id: 'file:o', type: 'file', ref: o, name: 'chair' }], files: [{ id: 'file:o', type: 'file', ref: o, path: o, name: 'chair' }] });
  const r = await M.exportBundle({ body, name: 'Chair', job: 'e2', out: path.join(OUT, 'Chair.hearthproject') });
  assert.ok(r.ok);
  assert.ok(r.skipped.includes('gone.png (used by chair parts.mtl: not on this computer)'), r.skipped.join());
  const u = await M.unpack({ file: r.path, job: 'u2' });
  const ref = u.body.project.items.find((x) => x.type === 'file').ref;
  for (const f of ['chair parts.mtl', 'maps/seat.png', 'maps/seat_n.png']) assert.strictEqual(sha(path.join(path.dirname(ref), ...f.split('/'))), sha(path.join(SRC, 'obj', ...f.split('/'))), f);
  await M.discard(u.dir);
});
ok('secrets never travel: a model naming a key or a credentials file (../.ssh/id_rsa, api-token.png): never packed, named', async () => {
  const g = w('sec/m.gltf', JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'm.bin' }, { uri: '../.ssh/id_rsa' }], images: [{ uri: 'api-token.png' }, { uri: 'ok.png' }] }));
  w('sec/m.bin', rnd(8)); w('.ssh/id_rsa', 'PRIVATE KEY'); w('sec/api-token.png', rnd(8)); w('sec/ok.png', rnd(8));
  const r = await M.exportBundle({ body: sceneBody([{ id: 'r', key: 'm', name: 'm.gltf', path: g }], { name: 'Sec' }), name: 'Sec', job: 'es', out: path.join(OUT, 'Sec.hearthproject') });
  const names = (await require(path.join(ROOT, 'zipkit.js')).entries(r.path)).map((e) => e.name);
  assert.ok(names.some((n) => n.endsWith('/m.bin')) && names.some((n) => n.endsWith('/ok.png')), names.join());
  assert.ok(!names.some((n) => /id_rsa|token/.test(n)), names.join());
  assert.deepStrictEqual(r.skipped.filter((x) => /never packed/.test(x)).length, 2, r.skipped.join());
});
ok('an older project file (the .gltf alone, made before this round): the import names the files it lacks', async () => {
  const body = { project: { id: 'p', name: 'Old', items: [] }, scenes: [{ id: 's', sketch: { id: 's', name: 'S', code: '' }, refs: [{ id: 'r', key: 'car', name: 'car.gltf', path: 'hearthproject:assets/0/car.gltf' }], notes: [] }] };
  const man = C.makeManifest({ name: 'Old', counts: C.summarize(body) });
  const out = path.join(OUT, 'Old.hearthproject');
  await M.writeZip(out, [{ name: C.MANIFEST, data: Buffer.from(JSON.stringify(man)) }, { name: C.BODY, data: Buffer.from(JSON.stringify(body)) }, { name: 'assets/0/car.gltf', path: carGltf }]);
  const u = await M.unpack({ file: out, job: 'u3' });
  assert.ok(u.ok);
  for (const n of ['car.bin', 'wood grain.png', 'car_n.png', 'rock.jpg', 'wheels.bin']) assert.ok(u.skipped.some((s) => s.startsWith(`${n} (used by car.gltf: it wasn't in the project file`)), `${n}: ${u.skipped}`);
  await M.discard(u.dir);
});
ok('copyAsset (Duplicate): the model\'s folder copied whole into data/refs/<time>-<name>/, the missing buffer named; a copy failing half-way goes to the Trash; a model of one file: copied by the window as before', async () => {
  const c = await M.copyAsset(carGltf);
  assert.ok(c.ok && c.dir.startsWith(path.join(DATA, 'refs')) && /[\\/]refs[\\/]\d{10,}-car$/.test(c.dir), JSON.stringify(c));
  assert.deepStrictEqual(tree(c.dir), ['car/buffers/car.bin', 'car/car.gltf', 'car/textures/normals/car_n.png', 'car/textures/wood grain.png', 'shared/rock.jpg']);
  assert.strictEqual(sha(c.path), sha(carGltf));
  assert.deepStrictEqual(c.missing, ['wheels.bin (used by car.gltf: not on this computer)']);
  const glbOne = w('single/one.glb', rnd(50));
  assert.deepStrictEqual(await M.copyAsset(glbOne), { ok: true, single: true, missing: [] });
  let n = 0; M._set({ fault: async (stage) => { if (stage === 'copy' && ++n === 3) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }); } });
  const t0 = trashed.length; const refsBefore = tree(path.join(DATA, 'refs'));
  const f = await M.copyAsset(carGltf);
  M._set({ fault: null });
  assert.deepStrictEqual(f, { ok: false, error: 'the disk is full' });
  assert.strictEqual(trashed.length, t0 + 1, 'its folder went to the Trash');
  assert.deepStrictEqual(tree(path.join(DATA, 'refs')), refsBefore, 'nothing half-copied left in data/refs');
  // and Duplicate's untake takes the good copy back too
  const u = await M.untake({ files: [c.path] });
  assert.deepStrictEqual(u.done, [c.dir]); assert.ok(!fs.existsSync(c.dir));
});
ok('untake: only what an import / copy writes (History, its boards\' and worktable\'s stores, copies in data/refs/<time>-…); anything else refused, a missing one skipped', async () => {
  const kv = path.join(DATA, 'kv'); fs.mkdirSync(kv, { recursive: true });
  for (const n of ['three-hv-snew', 'three-hv-snew.prev', 'board-bnew', 'workbench-pnew', 'projects', 'three-sketches', 'three-hv-sold']) fs.writeFileSync(path.join(kv, `${n}.json`), '{}');
  const own = path.join(DATA, 'refs', 'mine.png'); fs.writeFileSync(own, 'x');
  const copy = path.join(DATA, 'refs', '1700000000000-copy.png'); fs.writeFileSync(copy, 'x');
  const r = await M.untake({ kv: ['three-hv-snew', 'board-bnew', 'workbench-pnew', 'projects', 'three-sketches', '../config', 'three-hv-gone'], files: [own, copy, path.join(SRC, 'brick.png'), '/', DATA] });
  assert.deepStrictEqual(r.done.map((p) => path.basename(p)).sort(), ['1700000000000-copy.png', 'board-bnew.json', 'three-hv-snew.json', 'three-hv-snew.prev.json', 'workbench-pnew.json']);
  for (const n of ['projects', 'three-sketches', 'three-hv-sold']) assert.ok(fs.existsSync(path.join(kv, `${n}.json`)), n);
  assert.ok(fs.existsSync(own));
});

// ---------- failure injection, main side ----------
const projectsDir = () => path.join(DATA, 'assets', 'projects');
async function unpackWith(fault, job, sender = null) {
  const before = tree(projectsDir()); const t0 = trashed.length;
  M._set({ fault });
  try { return { r: await M.unpack({ file: bundle.file, job }, sender), before, t0 }; } finally { M._set({ fault: null }); }
}
for (const [label, at, code] of [['a full disk at the first file', 1, 'ENOSPC'], ['a full disk at a middle file', 3, 'ENOSPC'], ['a refused write (EACCES) at the last file', 5, 'EACCES'], ['a read-only disk at the second file', 2, 'EROFS']]) {
  ok(`unpack, ${label}: the import stops, its folder in the Trash, nothing left in Hearth's folder`, async () => {
    let n = 0;
    const { r, before, t0 } = await unpackWith(async (stage) => { if (stage === 'extract' && ++n === at) throw Object.assign(new Error(`${code}: injected`), { code }); }, `f${at}${code}`);
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    assert.ok(code === 'ENOSPC' ? /disk is full/.test(r.problems[0]) : r.problems[0].includes(code), r.problems[0]);
    assert.deepStrictEqual(tree(projectsDir()), before);
    assert.strictEqual(trashed.length, t0 + 1); assert.ok(trashed.at(-1).startsWith(projectsDir()));
  });
}
ok('unpack, a failure once every file is out (making the body): the same, in the Trash', async () => {
  const { r, before, t0 } = await unpackWith(async (stage) => { if (stage === 'finish') throw new Error('injected at the end'); }, 'ffin');
  assert.strictEqual(r.ok, false); assert.deepStrictEqual(tree(projectsDir()), before); assert.strictEqual(trashed.length, t0 + 1);
});
ok('unpack, Cancel from the card at the third file: cancelled, its folder (two files out) in the Trash', async () => {
  let n = 0;
  const { r, before, t0 } = await unpackWith(async (stage) => { if (stage === 'extract' && ++n === 3) M.cancel('fcan'); }, 'fcan');
  assert.ok(r.canceled, JSON.stringify(r)); assert.deepStrictEqual(tree(projectsDir()), before); assert.strictEqual(trashed.length, t0 + 1);
});
ok('unpack, a damaged file (not the disk): skipped and named, its part in the Trash, the import goes on', async () => {
  let n = 0;
  const { r, t0 } = await unpackWith(async (stage, name) => { if (stage === 'extract' && /car\.bin$/.test(name) && ++n === 1) throw new Error(`"${name}" is damaged (its check doesn't match)`); }, 'fdmg');
  assert.ok(r.ok); assert.ok(r.skipped.some((s) => /car\.bin \(damaged in the file\)/.test(s)), r.skipped.join());
  assert.strictEqual(trashed.length, t0, 'nothing written for it (the fault came before its bytes): nothing to trash');
  await M.discard(r.dir);
  assert.strictEqual(trashed.length, t0 + 1, 'discard: to the Trash');
});

// ---------- failure injection, window side: projbundle.js apply in a sandbox ----------
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function sandbox({ fault = null, cancelAt = null } = {}) {
  const W = {
    kv: new Map([['three-hv-sold', { v: 1, id: 'sold', versions: { sold: [{ at: 1, code: 'old' }] } }], ['board-bold', { id: 'bold', items: [] }]]),
    kvTrash: [], refs: new Set(['/data/refs/1700000000001-song.wav', '/data/refs/1700000000002-old.png']), fileTrash: [],
    disk: new Set(['/pc/brick.png', '/pc/models/car.gltf']),
    chats: new Map([['claude-old', { id: 'claude-old', messages: [] }]]), chatTrash: [],
    scenes: ['sold'], labDeleted: [], boards: new Map([['bold', { id: 'bold', name: 'Old board', items: [], chats: [] }]]),
    cuts: new Map([['seq:Old', { seq: { scene: 'sold' } }]]), projects: [{ id: 'pold', name: 'Old project', items: [] }], projTrash: [],
    store: new Map([['three.sketchPins', ['sold']], ['three.triggersBySong', { '/music/a.wav': { kick: { lo: 1 } } }], ['three.seq.byScene', { sold: 'seq:Old' }]]),
    links: new Map(), boardLinks: new Map(), listed: [], calls: {}, order: [],
  };
  const signal = { aborted: false };
  const hit = (op) => { const n = (W.calls[op] = (W.calls[op] || 0) + 1); W.order.push(`${op}#${n}`); if (cancelAt === `${op}#${n}`) signal.aborted = true; return fault && (fault[`${op}#${n}`] || fault[op]) ? (fault[`${op}#${n}`] || fault[op])() : null; };
  const disk = (msg = 'ENOSPC: no space left on device, write') => Object.assign(new Error(msg), { code: 'ENOSPC' });
  let t = 1800000000000;
  const hub = {
    kvGet: async (name) => (W.kv.has(name) ? { state: 'ok', value: clone(W.kv.get(name)) } : { state: 'missing' }),
    kvSet: async (name, v) => { const f = hit(`kvSet:${name.replace(/-.*$/, '')}`); if (f) return { error: f.message }; W.kv.set(name, clone(v)); return undefined; },
    saveChat: async (chat) => { const f = hit('saveChat'); if (f) return { error: f.message }; W.chats.set(chat.id, clone(chat)); return {}; },
    deleteChat: async (id) => { if (!W.chats.has(id)) throw new Error('no chat'); W.chats.delete(id); W.chatTrash.push(id); },
    importRef: async (p) => { const f = hit('importRef'); if (f) throw f; if (!W.refs.has(p) && !W.disk.has(p)) throw new Error('ENOENT'); const np = `/data/refs/${t++}-${p.split('/').pop()}`; W.refs.add(np); return np; },
    fs: { stat: async (p) => (W.refs.has(p) || W.disk.has(p) ? { size: 1 } : null) },
    reach: { info: async () => ({ dataDir: '/data' }) },
    projbundle: {
      adopt: async (o) => { const f = hit('adopt'); if (f) return { ok: false, error: f.message }; W.chats.set(o.id, clone(o.head)); return { ok: true }; },
      copyAsset: async (p) => { const f = hit('copyAsset'); if (f) return { ok: false, error: f.message }; const dir = `/data/refs/${t++}-car`; W.refs.add(dir); return { ok: true, path: `${dir}/car.gltf`, dir, files: 4, missing: ['wheels.bin (used by car.gltf: not on this computer)'] }; },
      untake: async ({ kv = [], files = [] }) => {
        const done = [];
        for (const n of kv) if (/^(three-hv-[\w-]{1,80}|board-[\w-]{1,80}|workbench-[\w-]{1,100})$/.test(n) && W.kv.has(n)) { W.kv.delete(n); W.kvTrash.push(n); done.push(n); }
        for (const f of files) { const top = f.replace(/^(\/data\/refs\/\d{10,}-[^/]+).*$/, '$1'); if (/^\/data\/refs\/\d{10,}-/.test(f) && W.refs.has(top)) { W.refs.delete(top); W.fileTrash.push(top); done.push(top); } }
        return { done, failed: [] };
      },
    },
  };
  const projects = { list: W.projects };
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Object, Array, Map, Set, Error, String, Number, Boolean, Math, Date, RegExp,
    localStorage: { length: 0, key: () => null },
    toast: () => {}, calmError: (e) => e.message, el: () => ({}),
    Projects: {
      ready: async () => {}, get: (id) => projects.list.find((x) => x.id === id) || null, trashed: () => W.projTrash.map((id) => ({ id })),
      create: (o) => { const p = { id: o.id, name: o.name, items: o.items.map((x) => ({ ...x, id: `${x.type}:${x.ref}` })) }; projects.list.unshift(p); hit('create'); return p; },
      setStatus: () => true, setCover: () => true, setWorkspace: () => true,
      flush: async () => { const f = hit('flush'); if (f) throw f; },
      removeProject: (p) => { const i = projects.list.indexOf(p); if (i < 0) return false; projects.list.splice(i, 1); W.projTrash.push(p.id); return true; },
      openHome: async () => {},
    },
    ProjectsCore: { newId: () => `p${t++}`, countText: () => '' },
    H: { agent: (id) => (String(id).startsWith('claude') ? { id: 'claude', name: 'Claude', engine: 'claude' } : null), agents: () => [{ id: 'claude', mode: 'native', engine: 'claude' }], claudeAgent: () => ({ id: 'claude' }), chats: [{ id: 'claude-old' }] },
    Native: { adopt: (c) => { W.listed.push(c.id); } }, Panel: { render: () => {} },
    ChatScenes: { link: (c, s) => W.links.set(c, s), unlink: (c) => W.links.delete(c) },
    ThreeLab: {
      cmd: async () => ({}),
      scenes: {
        adoptScene: (o) => { const f = hit('adoptScene'); if (f) return null; W.order.push(`scene:${o.sketch.id}`); W.scenes.push(o.sketch.id); return { id: o.sketch.id }; },
        all: () => W.scenes.map((id) => ({ id })), blocked: () => false, okStores: () => [],
        remove: (id) => { if (W.scenes.length === 1) return false; W.scenes = W.scenes.filter((x) => x !== id); W.labDeleted.push(id); return true; },
      },
    },
    Board: {
      ready: async () => {}, _: { flush: async () => {} },
      create: async (name) => { const f = hit('boardCreate'); if (f) throw f; const id = `b${t++}`; const b = { id, name, items: [], chats: [] }; W.boards.set(id, b); W.kv.set(`board-${id}`, clone(b)); return b; },
      load: async (id) => W.boards.get(id), save: async (b) => { const f = hit('boardSave'); if (f) throw f; W.kv.set(`board-${b.id}`, clone(b)); },
      remove: async (id) => { W.boards.delete(id); }, linkChat: (c, b) => W.boardLinks.set(c, b),
    },
    CutStore: { editFor: async () => null, sequences: () => [...W.cuts.keys()].map((key) => ({ key })), storeEdit: async (k, e) => { const f = hit('storeEdit'); if (f) throw f; W.cuts.set(k, clone(e)); }, deleteSequence: (k) => W.cuts.delete(k) },
  };
  ctx.window = ctx;
  ctx.hub = hub;
  ctx.store = { get: (k, d) => (W.store.has(k) ? clone(W.store.get(k)) : d), set: (k, v) => { if (v == null) W.store.delete(k); else W.store.set(k, clone(v)); } };
  ctx.Lazy = { load: async () => {}, loaded: () => true };
  ctx.LabPresets = { changed: () => {} };
  vm.createContext(ctx);
  for (const f of ['labproj-core.js', 'projbundle-core.js', 'labproj.js', 'projbundle.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  // a project as gather() makes it: two scenes (History, a pin, its song kept with the scene and its bars and loop, a
  // sequence pick, a glTF model and a texture as references), a sequence, two boards, two chats (one giant), the worktable
  const body = {
    project: { id: 'pold', name: 'Garage', items: [{ type: 'scene', ref: 's1', name: 'Garage' }, { type: 'scene', ref: 's2', name: 'Night' }, { type: 'seq', ref: 's1', name: 'Drive' }, { type: 'board', ref: 'bA', name: 'Mood' }, { type: 'board', ref: 'bB', name: 'Refs' }, { type: 'chat', ref: 'claude-c1', name: 'Talk' }, { type: 'chat', ref: 'claude-c2', name: 'Long' }], workspace: { sceneId: 's1', boardId: 'bA', chatId: 'claude-c1' } },
    scenes: [
      { id: 's1', sketch: { id: 's1', name: 'Garage', code: 'a', layers: [{ id: 'L1', code: 'a' }] }, extras: { media: { path: '/data/refs/1700000000001-song.wav' } }, refs: [{ id: 'r1', key: 'car', name: 'car.gltf', kind: 'model', path: '/pc/models/car.gltf' }, { id: 'r2', key: 'brick', name: 'brick.png', kind: 'image', path: '/pc/brick.png' }], notes: [], thumb: null, maps: {}, lab: { history: { s1: [{ at: 1, code: 'a0' }], 's1:L1': [{ at: 2, code: 'a1' }] }, pinned: true, seqpick: 'seq:Drive', song: { path: '/data/refs/1700000000001-song.wav', triggers: { kick: { lo: 41 } }, loop: { a: 1, b: 3 } } } },
      { id: 's2', sketch: { id: 's2', name: 'Night', code: 'n' }, extras: null, refs: [], notes: [], thumb: null, maps: {}, lab: { history: { s2: [{ at: 1, code: 'n0' }] }, pinned: true } },
    ],
    sequences: [{ key: 'seq:Drive', edit: { seq: { scene: 's1', name: 'Drive' }, clips: [] } }],
    boards: [{ id: 'bA', board: { id: 'bA', name: 'Mood', items: [{ id: 'i1' }], chats: ['claude-c1'] } }, { id: 'bB', board: { id: 'bB', name: 'Refs', items: [], chats: [] } }],
    chats: [{ id: 'claude-c1', agent: { id: 'claude', engine: 'claude' }, chat: { agentId: 'claude', title: 'Talk', messages: [{ role: 'user', text: 'hi' }] }, scene: 's1', board: 'bA' }, { id: 'claude-c2', agent: { id: 'claude', engine: 'claude' }, chat: { agentId: 'claude', title: 'Long', messages: [], __bigChat: { id: 'claude-c2' } }, scene: null, board: null }],
    workbench: { cards: [1] },
    files: [],
  };
  const snap = () => clone({ kv: [...W.kv.keys()].sort(), refs: [...W.refs].sort(), chats: [...W.chats.keys()].sort(), scenes: W.scenes.slice().sort(), boards: [...W.boards.keys()].sort(), cuts: [...W.cuts.keys()].sort(), projects: projects.list.map((p) => p.id).sort(), store: [...W.store.entries()].sort(), links: [...W.links.entries()], boardLinks: [...W.boardLinks.entries()], listed: W.listed.slice() });
  return { W, ctx, body, signal, snap, disk, PB: ctx.ProjBundle };
}
const STEPS = ['boardCreate#1', 'boardCreate#2', 'adoptScene#1', 'adoptScene#2', 'storeEdit#1', 'boardSave#1', 'boardSave#2', 'saveChat#1', 'adopt#1', 'kvSet:workbench#1', 'flush#1'];
const ERRS = { thrown: () => new Error('injected: the write threw'), disk: () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }) };
// after a failure: nothing it made is live, each is in its own Trash, nothing that was there before was touched
function checkTakenBack(sb, base, label) {
  const { W } = sb; const now = sb.snap();
  assert.deepStrictEqual(now, base, `${label}: the live state is as before the import`);
  const was = { kv: new Set(base.kv), refs: new Set(base.refs), chats: new Set(base.chats), scenes: new Set(base.scenes) };
  for (const n of W.kvTrash) assert.ok(!was.kv.has(n), `${label}: ${n} was there before and went to the Trash`);
  for (const f of W.fileTrash) assert.ok(!was.refs.has(f), `${label}: ${f} was there before`);
  for (const c of W.chatTrash) assert.ok(!was.chats.has(c), `${label}: ${c}`);
  for (const s of W.labDeleted) assert.ok(!was.scenes.has(s), `${label}: ${s}`);
  // what it wrote, by kind, went to its Trash (History files, boards' stores, the worktable's, copies)
  const u = clone(sb.PB.last.undone); // (made in the sandbox's realm: compared as plain data)
  assert.ok(u, `${label}: undone`); assert.deepStrictEqual(u.left, [], `${label}: everything went back`);
  for (const n of u.kv) if (W.kvTrash.includes(n) === false) assert.ok(!W.kv.has(n), `${label}: ${n} not written, or trashed`);
  for (const f of u.files) assert.ok(W.fileTrash.some((x) => f.startsWith(x)), `${label}: ${f} in the Trash`);
  assert.strictEqual(W.labDeleted.length, u.scenes, `${label}: its scenes in the Lab's deleted`);
  assert.strictEqual(W.chatTrash.length, u.chats, `${label}: its chats in the chats' Trash`);
  assert.strictEqual(W.listed.length, 0, `${label}: no chat listed`);
  if (u.project) assert.ok(W.projTrash.includes(u.project), `${label}: the project in Recently deleted`);
}
for (const mode of ['import', 'duplicate']) {
  ok(`apply (${mode}), nothing failing: everything there; History written before its scene was added, never over a file; nothing in any Trash`, async () => {
    const sb = sandbox(); const base = sb.snap();
    const r = await sb.PB.apply(sb.body, { mode, suffix: mode === 'duplicate' ? ' copy' : '' });
    const { W } = sb;
    assert.strictEqual(W.scenes.length, 3); assert.strictEqual(W.chats.size, 3); assert.strictEqual(W.boards.size, 3); assert.strictEqual(W.cuts.size, 2);
    assert.ok(W.projects?.length !== 0 && sb.ctx.Projects.get(r.project.id));
    for (const s of W.scenes.filter((x) => x !== 'sold')) {
      const hv = `three-hv-${s}`; assert.ok(W.kv.has(hv), hv);
      assert.ok(W.order.indexOf(`kvSet:three#${W.order.filter((x) => x.startsWith('kvSet:three#')).length}`) >= 0);
    }
    // History before its scene: each scene's kvSet:three comes before scene:<id>
    const hvAt = W.order.map((x, i) => [x, i]).filter(([x]) => x.startsWith('kvSet:three#')).map(([, i]) => i);
    const scAt = W.order.map((x, i) => [x, i]).filter(([x]) => x.startsWith('scene:')).map(([, i]) => i);
    assert.ok(hvAt.length === 2 && hvAt[0] < scAt[0] && hvAt[1] < scAt[1] && hvAt[1] > scAt[0], W.order.join(' '));
    assert.deepStrictEqual(W.kv.get('three-hv-sold'), { v: 1, id: 'sold', versions: { sold: [{ at: 1, code: 'old' }] } });
    assert.strictEqual(W.listed.length, 1); assert.strictEqual(W.links.size, 1); assert.strictEqual(W.boardLinks.size, 1);
    assert.strictEqual(sb.ctx.store.get('three.sketchPins').length, 3);
    assert.deepStrictEqual([W.kvTrash, W.fileTrash, W.chatTrash, W.labDeleted, W.projTrash].map((x) => x.length), [0, 0, 0, 0, 0]);
    if (mode === 'duplicate') {
      assert.ok(r.skipped.some((x) => /car\.gltf of “Garage copy”: wheels\.bin \(used by car\.gltf/.test(x)) || r.skipped.some((x) => /wheels\.bin/.test(x)), r.skipped.join(' | '));
      assert.strictEqual(W.refs.size, base.refs.length + 3, 'the song, the model\'s folder, the texture: copied');
    }
    assert.ok(base.kv.length < W.kv.size);
  });
  for (const step of STEPS) {
    for (const [kind, mk] of Object.entries(ERRS)) {
      ok(`apply (${mode}), ${kind === 'disk' ? 'a full disk' : 'a thrown write'} at ${step}: nothing half-imported stays, all of it in its Trash`, async () => {
        const sb = sandbox({ fault: { [step]: mk } }); const base = sb.snap();
        await assert.rejects(sb.PB.apply(sb.body, { mode, suffix: mode === 'duplicate' ? ' copy' : '' }));
        assert.ok(sb.W.calls[step.split('#')[0]] >= Number(step.split('#')[1]), `${step} was reached`);
        checkTakenBack(sb, base, `${mode} ${step} ${kind}`);
      });
    }
    if (step === 'flush#1') continue; // (Cancel is looked at until the project is added: after that it's in)
    ok(`apply (${mode}), Cancel from the card at ${step}: cancelled, nothing half-imported stays`, async () => {
      const sb = sandbox({ cancelAt: step }); const base = sb.snap();
      await assert.rejects(sb.PB.apply(sb.body, { mode, suffix: mode === 'duplicate' ? ' copy' : '', signal: sb.signal }), (e) => e.code === 'ECANCELED');
      checkTakenBack(sb, base, `${mode} cancel ${step}`);
    });
  }
  ok(`apply (${mode}), a History file that can't be written: named, the rest goes in; a failure after it takes back what was written`, async () => {
    const sb = sandbox({ fault: { 'kvSet:three#1': ERRS.disk } });
    const r = await sb.PB.apply(sb.body, { mode });
    assert.ok(r.skipped.some((x) => /History of “Garage.*couldn't be saved/.test(x)), r.skipped.join());
    const sb2 = sandbox({ fault: { 'kvSet:three#2': ERRS.disk, 'saveChat#1': ERRS.thrown } }); const base2 = sb2.snap();
    await assert.rejects(sb2.PB.apply(sb2.body, { mode }));
    checkTakenBack(sb2, base2, 'history then chat');
    assert.strictEqual(sb2.W.kvTrash.filter((n) => n.startsWith('three-hv-')).length, 1, 'the one History file written: in the Trash');
  });
}
ok('Duplicate, a reference that can\'t be copied (and a model whose copy fails): named, the copy shares the original\'s; a later failure trashes only the copies it made', async () => {
  const sb = sandbox({ fault: { 'copyAsset#1': ERRS.disk, 'importRef#2': ERRS.thrown, 'flush#1': ERRS.disk } }); const base = sb.snap();
  await assert.rejects(sb.PB.apply(sb.body, { mode: 'duplicate', suffix: ' copy' }));
  checkTakenBack(sb, base, 'dup copies');
  assert.strictEqual(sb.W.fileTrash.length, 1, 'the song\'s copy (the model and the texture weren\'t copied)');
  assert.ok(sb.W.refs.has('/data/refs/1700000000001-song.wav'), 'the original song stays');
});

(async () => {
  let n = 0; let failed = 0;
  for (const [name, fn] of tests) {
    n += 1;
    try { await fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${String(err.stack || err).split('\n').slice(0, 6).join('\n  ')}`); }
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failed ? `${failed} of ${n} failed` : `all ${n} passed`);
  process.exit(failed ? 1 : 0);
})();
