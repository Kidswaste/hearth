// (round 98, bundle98) the first computer, in the app: dev/checks/bundle98.js runs this on a throwaway profile, then
// dev/bundle98-dst.js on a SECOND, fresh one. Fixtures only (made here, in SMOKE_TMP), never real data.
//   1. a project "Garage98": a scene whose model is a glTF made of several files (car.gltf + buffers/car.bin + textures in
//      two sub-folders + one texture a folder up, ../shared/rock.jpg; buffers/wheels.bin missing), a board
//   2. Export project… → one .hearthproject; its "skipped" names wheels.bin
//   3. ⧉ Duplicate project: the copy's model is its own folder in Hearth's references, every file in its layout, the same
//      bytes; wheels.bin named in "What was skipped"; removing the model in the copy sends its folder to the Trash, the
//      original's files untouched
//   4. Duplicate failing — a board's save throwing (a full disk), then the project's own save — nothing half-copied stays:
//      no project, its scenes in the Lab's deleted, no History file for them, no copied model, its board out of the list,
//      the pins as they were
//   node dev/smoke.js --check-timeout 300000 --script dev/bundle98-src.js   (through dev/checks/bundle98.js)
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const ls = (k, d) => { try { const v = localStorage.getItem(`hub.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } };
const card = () => document.querySelector('dialog.pb-card[open]');
const size = async (p) => (p ? (await hub.fs.stat(p).catch(() => null))?.size ?? -1 : -1);
const DIR = `${window.SMOKE_TMP}/bd98src`;
const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 1) s += String.fromCharCode(u[i]); return btoa(s); };
const bytes = (n, seed) => { const u = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i += 1) { x = (x * 1103515245 + 12345) >>> 0; u[i] = x >>> 24; } return u; };
// a real glTF: one triangle, its buffer in buffers/, pictures in textures/ and one folder up
const TRI = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
const GLTF = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  buffers: [{ uri: 'buffers/car.bin', byteLength: 36 }, { uri: 'buffers/wheels.bin', byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  images: [{ uri: 'textures/wood%20grain.png' }, { uri: 'textures/normals/car_n.png' }, { uri: '../shared/rock.jpg' }] };
const FILES = { 'car/buffers/car.bin': TRI, 'car/textures/wood grain.png': bytes(3000, 1), 'car/textures/normals/car_n.png': bytes(1500, 2), 'shared/rock.jpg': bytes(2000, 3) };
const sizesUnder = async (gltf) => { const d = gltf.replace(/[\\/][^\\/]+$/, ''); const o = {}; for (const rel of ['buffers/car.bin', 'textures/wood grain.png', 'textures/normals/car_n.png', '../shared/rock.jpg', 'buffers/wheels.bin']) o[rel] = await size(`${d}/${rel}`); o['car.gltf'] = await size(gltf); return o; };
const kvState = async (name) => (await hub.kvGet(name, null, { status: true }))?.state;

try {
  await hub.fs.write(`${DIR}/car/car.gltf`, JSON.stringify(GLTF, null, 2));
  for (const [rel, u] of Object.entries(FILES)) await hub.fs.write(`${DIR}/${rel}`, b64(u), { base64: true });
  const gltf = `${DIR}/car/car.gltf`;
  const want = await sizesUnder(gltf);
  await Lazy.load('projects'); await Projects.ready(); await Lazy.load('board'); await Board.ready();
  const P = Projects;

  // ---------- 1. the project ----------
  const p = await ProjectWorkspace.create({ name: 'Garage98', persona: 'builder', plugins: [] });
  activate('tool:three');
  await ThreeLab.cmd();
  const S = ThreeLab.scenes; const D = ThreeLab.director; const sid = p.workspace.sceneId;
  await until(() => S.currentId() === sid, 10000);
  // the model as a reference of the scene, pointing at its file where its other files are (as an imported project's
  // reference does: the Lab's own "add a reference" copies one file)
  (D.refs.all()[sid] ||= []).push({ id: 'rcar98', key: 'car', name: 'car.gltf', kind: 'model', path: gltf, size: want['car.gltf'], at: Date.now() });
  // History: a few runs (written 1.5 s after a run)
  const CODE = (tag) => `import * as THREE from 'three';\nconst renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);\nconst scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50);\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));\n// ${tag}\n`;
  D.setCode(CODE('v1')); await wait(700); D.setCode(CODE('v2')); await wait(2200);
  const bd = await Board.create('Garage98 board', { quiet: true, open: false });
  P.add(P.get(p.id), 'board', bd.id, bd.name);
  await P.flush(); await wait(1200);
  step('a project: a scene whose model is a glTF of several files (a .bin, textures in two folders, one a folder up; one buffer missing), its History, a board', ThreeLab.refsOf(sid).some((r) => r.path === gltf) && Object.keys(await S.versionsOf(sid)).length > 0 && want['buffers/car.bin'] === 36 && want['../shared/rock.jpg'] === 2000 && want['buffers/wheels.bin'] === -1, want);

  // ---------- 2. Export project… ----------
  await Lazy.load('projbundle');
  const ex = ProjBundle.exportProject(P.get(p.id));
  const c1 = await until(() => card()?.querySelector('.pb-go') && card(), 30000);
  const always = c1?.querySelector('.pb-line')?.textContent || '';
  c1?.querySelector('.pb-go').click();
  const er = await ex;
  step('Export project…: one .hearthproject; the missing buffer named in what it left out', er?.ok && (er.skipped || []).some((x) => /^wheels\.bin \(used by car\.gltf/.test(x)) && er.files >= 5, { files: er?.files, skipped: er?.skipped, always });
  await hub.fs.write(`${window.SMOKE_SAVES}/bd98-expect.json`, JSON.stringify({ bundle: ProjBundle.last.exported, name: 'Garage98', want }));

  // ---------- 3. ⧉ Duplicate project ----------
  const info = await hub.reach.info();
  const pinsBefore = JSON.stringify(ls('three.sketchPins', []));
  const Dp = await ProjBundle.duplicateProject(P.get(p.id));
  await wait(1200);
  const cid = Dp && P.get(Dp.id)?.items.find((x) => x.type === 'scene')?.ref;
  const cref = cid && ThreeLab.refsOf(cid).find((r) => r.key === 'car');
  const got = cref ? await sizesUnder(cref.path) : null;
  step('Duplicate project: the copy\'s model is its own folder in Hearth\'s references, every file it names in its layout (same sizes)', cref && cref.path !== gltf && cref.path.startsWith(`${info.dataDir}/refs/`) && /[\\/]refs[\\/]\d{10,}-car[\\/]car[\\/]car\.gltf$/.test(cref.path) && JSON.stringify(got) === JSON.stringify(want), { path: cref?.path, got, want });
  step('…the missing buffer named in "What was skipped"', ProjBundle.last.skipped.some((x) => /wheels\.bin \(used by car\.gltf/.test(x)), ProjBundle.last.skipped);
  const folder = cref?.path.replace(/[\\/]car[\\/]car\.gltf$/, '');
  if (cref) ThreeLab.removeReference(cref.id, { sketchId: cid }); await wait(1200);
  step('the model removed in the copy: its whole folder goes to the Trash, the original\'s files stay', folder && (await size(`${folder}/shared/rock.jpg`)) === -1 && !(await hub.fs.stat(folder).catch(() => null)) && JSON.stringify(await sizesUnder(gltf)) === JSON.stringify(want), { folder });

  // ---------- 4. Duplicate failing: nothing half-copied stays ----------
  for (const [label, arm] of [['a board\'s save throwing (a full disk)', () => { const was = Board.save; Board.save = async () => { throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }); }; return () => { Board.save = was; }; }],
    ['the project\'s own save throwing (after everything else went in)', () => { const was = P.flush; let n = 0; P.flush = async (...a) => { n += 1; if (n === 1) throw new Error('injected: the projects store couldn\'t be written'); return was(...a); }; return () => { P.flush = was; }; }]]) {
    const before = { projects: P.all().map((x) => x.id).sort(), scenes: S.all().map((x) => x.id).sort(), boards: Board._.S.index.list.map((x) => x.id).sort(), refs: ((await hub.fs.list(`${info.dataDir}/refs`).catch(() => [])) || []).map((f) => f.name).sort(), pins: JSON.stringify(ls('three.sketchPins', [])) };
    const undo = arm();
    let r;
    try { r = await ProjBundle.duplicateProject(P.get(p.id)); } finally { undo(); }
    await wait(1500);
    const u = ProjBundle.last.undone || {};
    const after = { projects: P.all().map((x) => x.id).sort(), scenes: S.all().map((x) => x.id).sort(), boards: Board._.S.index.list.map((x) => x.id).sort(), refs: ((await hub.fs.list(`${info.dataDir}/refs`).catch(() => [])) || []).map((f) => f.name).sort(), pins: JSON.stringify(ls('three.sketchPins', [])) };
    const hv = await Promise.all((u.kv || []).map(kvState));
    step(`Duplicate failing at ${label}: no copy, no new scene (in the Lab's deleted), no board, no copied file, no History file or board store left, the pins as they were`, r === null && JSON.stringify(after) === JSON.stringify(before) && u.scenes >= 1 && (u.kv || []).length >= 2 && hv.every((x) => x === 'missing') && !(u.left || []).length && (!u.project || P.trashed().some((x) => x.id === u.project)), { before, after, undone: u, hv });
  }
  step('…the original untouched by all of it (its scene, its model\'s files, its board)', S.get(sid) && ThreeLab.refsOf(sid).some((r) => r.path === gltf) && JSON.stringify(await sizesUnder(gltf)) === JSON.stringify(want) && Board._.S.index.list.some((x) => x.id === bd.id) && pinsBefore === JSON.stringify(ls('three.sketchPins', [])), null);
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 600));
}
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
