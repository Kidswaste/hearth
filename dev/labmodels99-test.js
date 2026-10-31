#!/usr/bin/env node
// (round 99, labmodels99) A 3D model made of several files in the Lab itself, without Electron. Nothing real is touched:
// the app's top-level files are copied to a temp folder (store.js keeps its data next to itself) and run there.
//   core      labmodels-core.js: a reference's folder, the missing files in plain words, the preview's resolution (the
//             same cases through tools/three-sandbox.html's own refModelResolve: "..", %20, another case, a query),
//             the resource path, a drop grouped (a folder → its models; a .gltf with its .bin / pictures → the model once)
//   import    store.js importRef / importRefWhole (the Lab's "add a reference") on fixtures: a .gltf with its .bin and
//             pictures in sub-folders and one a folder up (a buffer missing: "wheels.bin isn't next to car.gltf"), an
//             .obj with its .mtl (options before the picture's name) and a picture, a .glb (one file, as before), a .glb
//             that names outside files, files whose names sync never carries (a venv/ folder, a .part) moved or named,
//             a secret-looking file never copied; each copy byte for byte in data/refs/<time>-<name>/, never over a file
//   sync      every file of such a copy syncs (sync-merge.js localOnly) and is one the Lab always brings down
//             (sync-kinds.js needed); through the two-computer simulator: the folder written on the PC arrives whole on
//             the Mac with iCloud stubs / dataless files, and from the Mac to a PC whose OneDrive keeps files online-only
//   trash     a model's folder goes to the Trash only when no other reference lies in it (scenesafe-core.js refShared)
//   node dev/labmodels99-test.js [--only core,import,sync,trash]   (unit:labmodels99-test)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.argv[2] !== '--inside') {
  // a copy of the app's own files (store.js, projbundlemain.js and what they load) in a short temp folder
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm99-'));
  for (const f of fs.readdirSync(ROOT)) if (/\.(js|json)$/.test(f) && f !== 'package-lock.json' && fs.statSync(path.join(ROOT, f)).isFile()) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  const r = spawnSync(process.execPath, [__filename, '--inside', dir, ...process.argv.slice(2)], { cwd: dir, env: { ...process.env, HEARTH_PROJBUNDLE_INLINE: '0' }, stdio: 'inherit', timeout: 240000 });
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(r.status ?? 1);
}

const APP = process.argv[3];
const argv = process.argv.slice(4);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`); } };
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });
const LM = require(path.join(APP, 'labmodels-core.js'));
const SS = require(path.join(APP, 'scenesafe-core.js'));
const S = require(path.join(APP, 'sync-merge.js'));
const K = require(path.join(APP, 'sync-kinds.js'));
const sha = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
const rnd = (n, seed = 1) => { const b = Buffer.alloc(n); let x = seed * 2654435761 >>> 0; for (let i = 0; i < n; i += 4) { x = (x * 1664525 + 1013904223) >>> 0; b.writeUInt32LE(x, Math.min(i, n - 4)); } return b; };
const tree = (dir) => { const out = []; const go = (d, r) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const rr = r ? `${r}/${e.name}` : e.name; if (e.isDirectory()) go(path.join(d, e.name), rr); else out.push(rr); } }; go(dir, ''); return out.sort(); };
const SRC = fs.mkdtempSync(path.join(os.tmpdir(), 'lm99src-'));
const w = (rel, data) => { const p = path.join(SRC, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');

// ---------- core ----------
scenario('core', async () => {
  ok(JSON.stringify(LM.folderOf('/Users/me/Hearth/data/refs/1761800000000-car/car/car.gltf')) === JSON.stringify({ dir: '/Users/me/Hearth/data/refs/1761800000000-car', rel: 'car/car.gltf' }), 'core: a Mac path in a model\'s folder');
  ok(JSON.stringify(LM.folderOf('C:\\Hearth\\data\\refs\\1761800000000-car\\car.gltf')) === JSON.stringify({ dir: 'C:\\Hearth\\data\\refs\\1761800000000-car', rel: 'car.gltf' }), 'core: a Windows path in a model\'s folder');
  ok(LM.folderOf('/d/data/refs/1761800000000-Paint.png') === null && LM.folderOf('/d/data/assets/x/car.gltf') === null, 'core: a reference copied alone is not a folder');
  ok(JSON.stringify(LM.missingText([{ name: 'wheels.bin', of: 'car.gltf' }, { name: 'scratch.part', of: 'car.gltf', why: 'its name never syncs (a temporary or system file\'s name)' }])) === JSON.stringify(['wheels.bin isn\'t next to car.gltf', 'scratch.part (used by car.gltf): its name never syncs (a temporary or system file\'s name)']), 'core: missing files in plain words');
  ok(LM.normRel('car/./textures/../buffers/car.bin') === 'car/buffers/car.bin' && LM.normRel('../x') === null, 'core: a relative path made plain');
  // the preview's resolution: the core's and the page's own (tools/three-sandbox.html), on the same cases
  const html = fs.readFileSync(path.join(ROOT, 'tools', 'three-sandbox.html'), 'utf8');
  const src = /function refModelResolve\(url, prefix, files\) \{[\s\S]*?\n\}/.exec(html)?.[0];
  ok(Boolean(src), 'core: the page has refModelResolve');
  // eslint-disable-next-line no-new-func
  const page = src ? new Function(`${src}; return refModelResolve;`)() : () => 'none';
  const files = new Map([['car/car.bin', 'blob:1'], ['car/textures/wood grain.png', 'blob:2'], ['shared/Rock.JPG', 'blob:3'], ['car/maps/seat.png', 'blob:4']]);
  const P = 'hearth-ref://m7/';
  const base = LM.baseOf(P, 'car/car.gltf');
  ok(base === 'hearth-ref://m7/car/', 'core: the resource path is the model\'s own folder', base);
  const cases = [[`${base}car.bin`, 'blob:1'], [`${base}textures/wood%20grain.png`, 'blob:2'], [`${base}../shared/rock.jpg`, 'blob:3'], [`${base}./maps/seat.png?v=2`, 'blob:4'], [`${base}../../etc/passwd`, null], [`${base}nothere.bin`, null], ['blob:null/abc', null], ['hearth-ref://m8/car/car.bin', null], [`${base}maps\\seat.png`, 'blob:4']];
  for (const [u, want] of cases) { const a = LM.resolve(u, P, files); const b = page(u, P, files); ok(a === want && b === want, `core: ${u} → ${want} (core ${a}, page ${b})`); }
  // a drop: a folder with a glTF Separate export, a .gltf + its .bin + pictures + a song
  const fakeFs = { '/drop/Car export': [{ path: '/drop/Car export/car.gltf', name: 'car.gltf' }, { path: '/drop/Car export/car.bin', name: 'car.bin' }, { path: '/drop/Car export/tex/paint.png', name: 'paint.png' }, { path: '/drop/Car export/tex', name: 'tex', isDir: true }], '/drop/Notes': [{ path: '/drop/Notes/a.txt', name: 'a.txt' }] };
  const uses = async (ps) => Object.fromEntries(ps.map((p) => [p, p.endsWith('car.gltf') ? [p.replace('car.gltf', 'car.bin'), p.replace('car.gltf', 'tex/paint.png')] : p.endsWith('chair.obj') ? ['/drop/chair.mtl', '/drop/Seat.PNG'] : []]));
  const g = await LM.groupDrop([{ name: 'Car export', path: '/drop/Car export', isDir: true }, { name: 'Notes', path: '/drop/Notes', isDir: true }, { name: 'chair.obj', path: '/drop/chair.obj' }, { name: 'chair.mtl', path: '/drop/chair.mtl' }, { name: 'seat.png', path: '/drop/seat.png' }, { name: 'song.mp3', path: '/drop/song.mp3' }], { list: async (d) => fakeFs[d] || [], uses });
  ok(JSON.stringify(g.add.map((e) => e.path)) === JSON.stringify(['/drop/Car export/car.gltf', '/drop/chair.obj', '/drop/song.mp3']), 'core: a drop adds the folder\'s model, the .obj once (its .mtl and picture — another case — come with it) and the song', g.add.map((e) => e.path));
  ok(JSON.stringify(g.with) === JSON.stringify([{ model: 'chair.obj', n: 2 }]) && g.folders.length === 2 && g.folders[0].models === 1 && /no 3D model in it/.test(g.folders[1].why), 'core: what came with each model, and a folder with no model named', g);
  const g2 = await LM.groupDrop([{ name: 'car.gltf', path: '/x/car.gltf' }, { name: 'car.bin', path: '/x/car.bin' }, { name: 'paint.png', path: '/x/tex/paint.png' }], { list: async () => [], uses: async () => { throw new Error('no plan'); } });
  ok(g2.add.length === 3, 'core: a plan that fails: every file added as before (nothing lost)', g2);
});

// ---------- import ----------
const store = () => require(path.join(APP, 'store.js'));
const REFS = () => path.join(APP, 'data', 'refs');
const gltf = (bufs, imgs) => JSON.stringify({ asset: { version: '2.0' }, buffers: bufs.map((uri) => ({ uri, byteLength: 24 })), images: imgs.map((uri) => ({ uri })) }, null, 2);
scenario('import', async () => {
  const st = store();
  // a .gltf with its .bin and pictures in sub-folders, one a folder up, a buffer missing
  const car = w('pc/car/car.gltf', gltf(['buffers/car.bin', 'buffers/wheels.bin'], ['textures/wood%20grain.png', 'textures/normals/car_n.png', '../shared/rock.jpg']));
  w('pc/car/buffers/car.bin', rnd(24, 1)); w('pc/car/textures/wood grain.png', PNG); w('pc/car/textures/normals/car_n.png', PNG); w('pc/shared/rock.jpg', rnd(300, 3));
  const before = tree(REFS());
  const r = await st.importRefWhole(car);
  const f = LM.folderOf(r.path);
  ok(f && /^\d{10,}-car$/.test(path.basename(f.dir)) && f.dir === r.dir && path.dirname(r.dir) === REFS(), 'import: the .gltf goes in a folder of its own, data/refs/<time>-car/', r);
  ok(JSON.stringify(tree(r.dir)) === JSON.stringify(['car/buffers/car.bin', 'car/car.gltf', 'car/textures/normals/car_n.png', 'car/textures/wood grain.png', 'shared/rock.jpg']), 'import: every file it names, in its layout (one a folder up: the model in a folder named as its own)', tree(r.dir));
  ok(sha(r.path) === sha(car) && sha(path.join(r.dir, 'shared', 'rock.jpg')) === sha(path.join(SRC, 'pc', 'shared', 'rock.jpg')), 'import: byte for byte (the .gltf unchanged)');
  ok(JSON.stringify(r.missing) === JSON.stringify(['wheels.bin isn\'t next to car.gltf']) && r.files === 5, 'import: the missing buffer named plainly', r.missing);
  ok(r.used.length === 4 && r.used.every((p) => fs.existsSync(p) && p.startsWith(SRC)), 'import: the files it brought (a drop of them adds the model once)', r.used);
  ok(tree(REFS()).length === before.length + 5, 'import: nothing else written');
  // importRef (every caller of refs:import): the model's path, the folder copied whole too
  const p2 = await st.importRef(car);
  ok(typeof p2 === 'string' && LM.folderOf(p2) && fs.existsSync(path.join(LM.folderOf(p2).dir, 'car', 'buffers', 'car.bin')), 'import: importRef copies a model whole too (its path back, as before)', p2);
  // an .obj with its .mtl (options before the picture's name) and a picture
  const obj = w('pc/chair/chair.obj', 'mtllib chair.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl seat\nf 1/1 2/2 3/3\n');
  w('pc/chair/chair.mtl', 'newmtl seat\nKd 1 1 1\nmap_Kd -s 1 1 1 maps/seat.png\n'); w('pc/chair/maps/seat.png', PNG);
  const o = await st.importRefWhole(obj);
  ok(JSON.stringify(tree(o.dir)) === JSON.stringify(['chair.mtl', 'chair.obj', 'maps/seat.png']) && !o.missing.length && o.files === 3, 'import: an .obj with its .mtl and picture', { t: tree(o.dir), o });
  // a .glb: one file, as before (no folder)
  const glbBytes = Buffer.concat([Buffer.from('glTF'), rnd(60, 9)]); glbBytes.writeUInt32LE(2, 4); glbBytes.writeUInt32LE(glbBytes.length, 8);
  const glb = w('pc/robot.glb', glbBytes);
  const g = await st.importRefWhole(glb);
  ok(!LM.folderOf(g.path) && path.dirname(g.path) === REFS() && /^\d{10,}-robot\.glb$/.test(path.basename(g.path)) && sha(g.path) === sha(glb) && g.files === 1 && !g.missing.length, 'import: a .glb is one file in refs/ (as before)', g);
  // a .glb that names an outside file (rare): its folder copied whole too
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, images: [{ uri: 'decal.png' }] }).padEnd(48, ' '));
  const glb2b = Buffer.alloc(20 + json.length); glb2b.write('glTF', 0); glb2b.writeUInt32LE(2, 4); glb2b.writeUInt32LE(glb2b.length, 8); glb2b.writeUInt32LE(json.length, 12); glb2b.writeUInt32LE(0x4e4f534a, 16); json.copy(glb2b, 20);
  const glb2 = w('pc/decal/sign.glb', glb2b); w('pc/decal/decal.png', PNG);
  const g2 = await st.importRefWhole(glb2);
  ok(LM.folderOf(g2.path) && JSON.stringify(tree(g2.dir)) === JSON.stringify(['decal.png', 'sign.glb']), 'import: a .glb naming an outside picture brings it', g2);
  // names sync never carries: a picture in a venv/ folder (moved to hearth-files/, the .gltf's URI rewritten), a
  // .part picture (named: its name never syncs), a secret-looking file (never copied)
  const odd = w('pc/odd/odd.gltf', gltf(['odd.bin'], ['venv/tex.png', 'scratch.part', 'id_rsa']));
  w('pc/odd/odd.bin', rnd(24, 4)); w('pc/odd/venv/tex.png', PNG); w('pc/odd/scratch.part', PNG); w('pc/odd/id_rsa', 'KEY');
  const d = await st.importRefWhole(odd);
  const t = tree(d.dir); const j = JSON.parse(fs.readFileSync(d.path, 'utf8'));
  ok(t.includes('odd.bin') && t.some((x) => /^hearth-files\/\d+-tex\.png$/.test(x)) && !t.some((x) => /venv|scratch|id_rsa/.test(x)) && /^hearth-files\/\d+-tex\.png$/.test(j.images[0].uri) && j.images[1].uri === 'scratch.part', 'import: a venv/ picture moved where sync carries it (its URI rewritten); the .part and the key never copied', { t, images: j.images });
  ok(d.missing.some((m) => /^scratch\.part \(used by odd\.gltf\): its name never syncs/.test(m)) && d.missing.some((m) => /^id_rsa .*never packed/.test(m)), 'import: …and both named', d.missing);
  // never over a file: two copies at once land in two folders
  const [a, b] = await Promise.all([st.importRefWhole(car), st.importRefWhole(car)]);
  ok(a.dir !== b.dir && fs.existsSync(path.join(a.dir, 'car', 'car.gltf')) && fs.existsSync(path.join(b.dir, 'car', 'car.gltf')), 'import: two copies at once never meet', [a.dir, b.dir]);
  // a file that isn't there: said, nothing written
  const n0 = tree(REFS()).length; let err = null;
  try { await st.importRefWhole(path.join(SRC, 'pc', 'gone.gltf')); } catch (e) { err = e; }
  ok(err && /gone\.gltf couldn't be copied/.test(err.message) && tree(REFS()).length === n0, 'import: a model that isn\'t there throws in plain words, writes nothing', err?.message);
  // every file of every copy syncs and is brought down by itself
  for (const rel of tree(REFS())) { const r2 = `refs/${rel}`; ok(!S.localOnly(r2) && K.needed.has(r2), `sync: ${r2} syncs and is always brought down`); }
});

// ---------- sync: through the two-computer simulator (online-only files on either side) ----------
let simRoot = null; // (the simulator's temp folder: removed at the end)
scenario('sync', async () => {
  const T = require(path.join(ROOT, 'dev', 'sync72-test.js'));
  const MB = 1048576;
  const DIRREL = 'refs/1761800000099-car';
  const files = { 'car/car.gltf': Buffer.from(gltf(['buffers/car.bin'], ['textures/wood grain.png', 'textures/normals/car_n.png', '../shared/rock.jpg'])), 'car/buffers/car.bin': rnd(12 * MB, 5), 'car/textures/wood grain.png': rnd(9 * MB, 6), 'car/textures/normals/car_n.png': rnd(200 * 1024, 7), 'shared/rock.jpg': rnd(64 * 1024, 8) };
  const same = (a, b) => Buffer.isBuffer(a) && a.equals(b);
  const readOr = (f) => { try { return fs.readFileSync(f); } catch { return null; } };
  for (const opt of [{ name: 'mac-icloud-stub', mac: { placeholders: 'stub' } }, { name: 'mac-dataless', mac: { placeholders: 'dataless' } }, { name: 'pc-onedrive', pc: { placeholders: 'win' }, from: 'mac' }]) {
    const wd = T.world(`lm99-${opt.name}`); simRoot = path.dirname(wd.dir);
    const mk = (n, o) => { const m = T.computer(wd, n, o); m.e = m.make({ allowDownload: K.needed }); return m; };
    const pc = mk('PC', { platform: 'win32', ...(opt.pc || {}) }); const mac = mk('Mac', { platform: 'darwin', ...(opt.mac || {}) });
    pc.write('kv/three-refs.json', { s1: [] });
    ok(await T.converge(wd) > 0, `sync/${opt.name}: first sync`, T.why(wd));
    const from = opt.from === 'mac' ? mac : pc; const to = from === pc ? mac : pc;
    for (const [rel, buf] of Object.entries(files)) from.write(`${DIRREL}/${rel}`, buf);
    from.edit('kv/three-refs.json', (r) => { r.s1.push({ id: 'rcar', key: 'car', name: 'car.gltf', kind: 'model', path: from.p(`${DIRREL}/car/car.gltf`), size: files['car/car.gltf'].length, files: 5, at: 1 }); });
    let n = -1;
    for (let i = 1; i <= 40; i++) { await T.round(wd); if (Object.entries(files).every(([rel, buf]) => same(readOr(to.p(`${DIRREL}/${rel}`)), buf))) { n = i; break; } }
    ok(n > 0, `sync/${opt.name}: every file of the model's folder arrives on the ${to.name} (the 12 MB .bin and the 9 MB picture too, online-only there)`, { n, why: T.why(wd), only: to.last?.cloudOnly, have: Object.keys(files).filter((rel) => same(readOr(to.p(`${DIRREL}/${rel}`)), files[rel])) });
    ok(await T.converge(wd) > 0, `sync/${opt.name}: settled`, T.why(wd));
    const ref = (to.json('kv/three-refs.json')?.s1 || [])[0];
    const fwd = (p) => String(p).replace(/\\/g, '/');
    ok(ref && fwd(ref.path) === fwd(to.p(`${DIRREL}/car/car.gltf`)) && LM.folderOf(ref.path)?.rel === 'car/car.gltf', `sync/${opt.name}: the reference's path is the ${to.name}'s own, its folder found there`, ref?.path);
  }
});

// ---------- trash ----------
scenario('trash', async () => {
  const dir = '/d/data/refs/1761800000000-car';
  const r1 = { id: 'a', path: `${dir}/car/car.gltf` }; const r2 = { id: 'b', path: `${dir}/car/textures/wood.png` }; const r3 = { id: 'c', path: '/d/data/refs/1761800000001-car/car/car.gltf' };
  ok(!SS.refShared(dir, { refsAll: { s1: [r1], s2: [r3] }, except: r1, under: true }), 'trash: the model\'s folder goes whole when nothing else lies in it');
  ok(SS.refShared(dir, { refsAll: { s1: [r1], s2: [r2] }, except: r1, under: true }), 'trash: …and stays when another scene\'s reference lies in it');
  ok(SS.refShared(r1.path, { refsAll: { s1: [r1], s2: [{ id: 'd', path: r1.path.replace(/\//g, '\\').toUpperCase() }] }, except: r1 }), 'trash: the same model used by another scene (written the Windows way) is never trashed');
  // the Lab's own rule (tools/three.js trashRefFile) finds the folder the same way LabModelsCore does
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'three.js'), 'utf8');
  const re = /const dir = \/(.+)\/\.exec\(r\.path\)\?\.\[1\];/.exec(src)?.[1];
  // eslint-disable-next-line no-new-func
  const lab = re ? new RegExp(re) : null;
  for (const p of [r1.path, r2.path, 'C:\\H\\data\\refs\\1761800000000-car\\car.gltf']) ok(lab && lab.exec(p)?.[1] === LM.folderOf(p)?.dir, `trash: the Lab's folder rule and LabModelsCore agree on ${p}`);
});

(async () => {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const f0 = failures;
    try { await s.fn(); } catch (err) { failures += 1; console.log(`FAIL ${s.name}: threw ${err.stack}`); }
    console.log(`${failures === f0 ? 'ok  ' : 'FAIL'} ${s.name}`);
  }
  fs.rmSync(SRC, { recursive: true, force: true });
  if (simRoot && /hearth-sync72-/.test(simRoot)) fs.rmSync(simRoot, { recursive: true, force: true });
  console.log(`labmodels99-test: ${passes} passed, ${failures} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(failures ? 1 : 0);
})();
