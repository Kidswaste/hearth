// (round 97, labproj97) the first computer, in the app: dev/checks/labproj97.js runs this on a throwaway profile, then
// dev/labproj97-dst.js on a SECOND, fresh one (the import). Fixtures only (made here, in SMOKE_TMP), never real data.
//   1. a project "Labtrip": two scenes with several layers, a texture and a 3D model as references, a song kept with the
//      scene (Keep a copy: a copy in Hearth's references), its ⚡ trigger bars and loop, scene 2 pinned, History versions
//      (real runs), a picture per scene
//   2. Export project… (the card, Export…) → one .hearthproject in SMOKE_SAVES; what A holds written next to it
//   3. ⧉ Duplicate project: does the copy carry the Lab's work (refs, song, bars, loop, pin, History, pictures), is it
//      independent (an edit, a run, new bars in the copy leave the original alone, History included), are files shared
//      safely (a reference removed in the copy, even one whose file is the original's, never trashes the original's)
//   4. the copy deleted (Recently deleted): the original untouched, its files there
//   node dev/smoke.js --check-timeout 300000 --script dev/labproj97-src.js   (through dev/checks/labproj97.js)
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const ls = (k, d) => { try { const v = localStorage.getItem(`hub.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => localStorage.setItem(`hub.${k}`, JSON.stringify(v));
const card = () => document.querySelector('dialog.pb-card[open]');
const exists = async (p) => Boolean(p) && ((await hub.fs.stat(p).catch(() => null))?.size > 0);
const DIR = `${window.SMOKE_TMP}/lp97src`;
const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 1) s += String.fromCharCode(u[i]); return btoa(s); };
const png = async (color) => { const c = new OffscreenCanvas(64, 64); const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(8, 8, 20, 20); return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
const glb = () => { // one triangle: the smallest real glTF binary
  const pos = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'tri' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); js = new Uint8Array([...js, ...new Array((4 - (js.length % 4)) % 4).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + 36; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, 36, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(pos, 28 + js.length);
  return u;
};
const wav = () => { const n = 16000; const b = new ArrayBuffer(44 + n * 2); const v = new DataView(b); const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i += 1) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 6) * 9000), true);
  return new Uint8Array(b); };
const picture = (hue) => { const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, `hsl(${hue} 80% 20%)`); gr.addColorStop(1, `hsl(${hue + 120} 80% 70%)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 36); return c.toDataURL('image/jpeg', 0.8); };
// a layer that uses both references: a missing one is an error on screen ("does it run?")
const CODE1 = (tag) => `import * as THREE from 'three';
if (!refs.cube) throw new Error('The model reference is missing');
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); camera.position.z = 3;
scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: refTexture('brick') })));
renderer.setAnimationLoop(() => renderer.render(scene, camera));
// ${tag}
`;
const CODE2 = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#123'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
// night
`;
const allCode = (x) => ThreeLab.scenes.layersOf(x).map((L) => L.code).join('\n/*-*/\n');
// every version of `want` is still in `got`, for every layer (opening a scene may add one of its own)
const covers = (got, want) => Object.entries(want).every(([k, l]) => l.every((c) => (got[k] || []).includes(c)));
const histCodes = async (id) => { const v = await ThreeLab.scenes.versionsOf(id); return Object.fromEntries(Object.entries(v).map(([k, l]) => [k === id ? 'main' : k.slice(id.length + 1), l.map((x) => x.code)]).sort((x, y) => (x[0] < y[0] ? -1 : 1))); };
const hvFile = async (id) => (await hub.kvGet(SceneSafeCore.histSegName(id), null))?.versions || {};

try {
  await hub.fs.write(`${DIR}/brick.png`, b64(await png('#c84')), { base64: true });
  await hub.fs.write(`${DIR}/cube.glb`, b64(glb()), { base64: true });
  await hub.fs.write(`${DIR}/Labtrip song.wav`, b64(wav()), { base64: true });
  await Lazy.load('projects'); await Projects.ready();
  const P = Projects;

  // ---------- 1. the project ----------
  const p = await ProjectWorkspace.create({ name: 'Labtrip', persona: 'builder', plugins: [] });
  activate('tool:three');
  await ThreeLab.cmd();
  const S = ThreeLab.scenes; const D = ThreeLab.director; const sid = p.workspace.sceneId;
  await until(() => S.currentId() === sid, 10000);
  await D.refs.add(`${DIR}/brick.png`, 'brick');
  await D.refs.add(`${DIR}/cube.glb`, 'cube');
  D.setCode(CODE1('v1')); await wait(700); D.setCode(CODE1('v2')); await wait(700); D.setCode(CODE1('v3')); await wait(900);
  const sk = S.get(sid);
  sk.layers = [...(S.layersOf(sk) || []), ThreeLayers.defaults({ name: 'Glow', code: '// glow\n', opacity: 0.6, blend: 'screen' }), ThreeLayers.defaults({ name: 'Grain', code: '// grain\n', opacity: 0.3 })]; S.changed(sid);
  const lr = await ThreeLab.cmd({ show: false }).then((c) => c.loadSong(`${DIR}/Labtrip song.wav`));
  const song = await S.songCopy.keep();
  await until(() => ThreeLab.peek().state?.song === song, 8000);
  D.triggers({ kick: { lo: 41, hi: 120 } });
  lsSet(`three.loop:${song}`, { a: 1, b: 3, locked: false }); window.LabPresets?.changed();
  const s2 = S.create({ name: 'Labtrip night', code: CODE2, layers: [ThreeLayers.defaults({ name: 'Sky', code: CODE2 }), ThreeLayers.defaults({ name: 'Stars', code: '// stars\n', blend: 'add' })] });
  if (!P.get(p.id).items.some((x) => x.type === 'scene' && x.ref === s2.id)) P.add(p, 'scene', s2.id, s2.name);
  lsSet('three.sketchPins', [...new Set([...ls('three.sketchPins', []), s2.id])]); window.LabPresets?.changed();
  await S.keepThumb(sid, picture(20)); await S.keepThumb(s2.id, picture(200));
  await P.flush();
  await wait(2500); // (History's write is 1.5 s after a run; the stores' debounced saves)
  const A = { name: 'Labtrip', scenes: [] };
  for (const id of [sid, s2.id]) {
    const x = S.get(id);
    const media = S.extrasOf(id)?.media?.path || null;
    A.scenes.push({ id, name: x.name, code: allCode(x), layers: S.layersOf(x).map((L) => L.name), refs: ThreeLab.refsOf(id).map((r) => ({ key: r.key, size: r.size, path: r.path })), song: media, bars: media ? ls('three.triggersBySong', {})[media] || null : null, loop: media ? ls(`three.loop:${media}`, null) : null, hist: await histCodes(id), thumb: S.thumbOf(id), pinned: ls('three.sketchPins', []).includes(id) });
  }
  const a1 = A.scenes[0];
  step('a project: 2 scenes (3 + 2 layers), a texture and a model, a song kept with the scene (a copy in Hearth\'s references), its ⚡ bars and loop, History, scene 2 pinned, a picture each', lr?.ok && /[\\/]refs[\\/]\d+-Labtrip song\.wav$/.test(song || '') && a1.layers.length >= 3 && A.scenes[1].layers.length === 2 && a1.refs.length === 2 && a1.bars?.kick?.lo === 41 && a1.loop?.a === 1 && Object.values(a1.hist).some((l) => l.length >= 2) && A.scenes[1].pinned && a1.thumb && A.scenes[1].thumb && a1.thumb !== A.scenes[1].thumb, { song, layers: A.scenes.map((s) => s.layers), refs: a1.refs.map((r) => r.key), bars: a1.bars, loop: a1.loop, hist: a1.hist, pinned: A.scenes.map((s) => s.pinned) });

  // ---------- 2. Export project… ----------
  await Lazy.load('projbundle');
  const ex = ProjBundle.exportProject(P.get(p.id));
  const c1 = await until(() => card()?.querySelector('.pb-go') && card(), 30000);
  c1?.querySelector('.pb-go').click();
  await ex;
  const exported = ProjBundle.last.exported;
  step('Export project… writes one .hearthproject', exported && (await exists(exported)), exported);
  await hub.fs.write(`${window.SMOKE_SAVES}/lp97-expect.json`, JSON.stringify({ bundle: exported, ...A }));

  // ---------- 3. ⧉ Duplicate project ----------
  const Dp = await ProjBundle.duplicateProject(P.get(p.id));
  await wait(2000);
  const g = Dp && await ProjBundle.gather(P.get(Dp.id));
  const copyOf = (a) => g?.scenes.find((s) => s.sketch.name === `${a.name} copy`);
  const c1s = copyOf(a1); const c2s = copyOf(A.scenes[1]);
  step('Duplicate project: “Labtrip copy” with copies of both scenes (fresh ids, every layer)', Dp && c1s && c2s && c1s.id !== a1.id && S.layersOf(S.get(c1s.id)).length === a1.layers.length && S.layersOf(S.get(c2s.id)).length === 2, { name: Dp?.name, scenes: g?.scenes.map((s) => s.sketch.name), skipped: ProjBundle.last.skipped });
  const cRefs = c1s ? ThreeLab.refsOf(c1s.id) : [];
  step('…its texture and model: its own files (not the original\'s)', cRefs.length === 2 && cRefs.every((r) => !a1.refs.some((o) => o.path === r.path)) && (await Promise.all(cRefs.map((r) => exists(r.path)))).every(Boolean), cRefs.map((r) => r.path));
  const cSong = c1s ? S.extrasOf(c1s.id)?.media?.path : null;
  step('…its song: the copy\'s own file (a song kept with the scene is Hearth\'s copy), there', cSong && cSong !== a1.song && (await exists(cSong)), { cSong, orig: a1.song });
  step('…its ⚡ trigger bars and loop come along (for its song)', cSong && ls('three.triggersBySong', {})[cSong]?.kick?.lo === 41 && ls(`three.loop:${cSong}`, null)?.a === 1, { bars: ls('three.triggersBySong', {})[cSong] || null, loop: ls(`three.loop:${cSong}`, null) });
  const cHist = c1s ? await histCodes(c1s.id) : {};
  step('…its History (every version of each layer)', covers(cHist, a1.hist) && Object.values(cHist).some((l) => l.length >= 2), { copy: cHist, orig: a1.hist });
  step('…scene 2\'s copy is pinned like scene 2', c2s && ls('three.sketchPins', []).includes(c2s.id), ls('three.sketchPins', []));
  step('…each copy has its own scene\'s picture', c1s && c2s && S.thumbOf(c1s.id) === a1.thumb && S.thumbOf(c2s.id) === A.scenes[1].thumb, { c1: (S.thumbOf(c1s?.id) || '').slice(0, 40) });

  // independent: an edit and a run in the copy, its own bars, a reference removed there
  S.open(c1s.id);
  await until(() => S.currentId() === c1s.id && ThreeLab.peek().state?.song === cSong, 10000);
  await wait(800);
  D.setCode(CODE1('edited in the copy')); await wait(2600);
  D.triggers({ kick: { lo: 55 } }); await wait(1000); // (saved 400 ms after the last change)
  const o1 = S.get(a1.id);
  const oHist = await hvFile(a1.id);
  step('the copy edited and run: the original\'s code is unchanged', allCode(o1) === a1.code && /edited in the copy/.test(allCode(S.get(c1s.id))), null);
  step('…and the original\'s History doesn\'t have the copy\'s versions (its own file untouched)', !JSON.stringify(oHist).includes('edited in the copy') && covers(await histCodes(a1.id), a1.hist), { orig: Object.keys(oHist) });
  step('…new ⚡ bars in the copy leave the original song\'s bars alone', ls('three.triggersBySong', {})[a1.song]?.kick?.lo === 41 && ls('three.triggersBySong', {})[cSong]?.kick?.lo === 55, { orig: ls('three.triggersBySong', {})[a1.song], copy: ls('three.triggersBySong', {})[cSong] });
  const brickC = cRefs.find((r) => r.key === 'brick');
  ThreeLab.removeReference(brickC.id, { sketchId: c1s.id }); await wait(800);
  step('a reference removed in the copy: its own file goes to the Trash, the original\'s stays', !(await exists(brickC.path)) && (await exists(a1.refs.find((r) => r.key === 'brick').path)), brickC.path);
  // a copy whose reference file couldn't be copied points at the original's file: removing it there must not trash it
  const origCube = a1.refs.find((r) => r.key === 'cube');
  const all = D.refs.all(); (all[c2s.id] ||= []).push({ ...origCube, id: 'rshared97', key: 'cube' });
  ThreeLab.removeReference('rshared97', { sketchId: c2s.id }); await wait(800);
  step('a reference in the copy that shares the original\'s file, removed: the original\'s file stays (still used)', await exists(origCube.path), origCube.path);

  // ---------- 4. the copy deleted ----------
  P.removeProject(P.get(Dp.id), { quiet: true });
  await P.flush(); await wait(600);
  const after = [];
  for (const a of A.scenes) { const x = S.get(a.id); after.push({ code: x && allCode(x), refs: await Promise.all(ThreeLab.refsOf(a.id).map((r) => exists(r.path))), song: a.song ? await exists(a.song) : true, bars: a.song ? ls('three.triggersBySong', {})[a.song]?.kick?.lo : null, hist: await histCodes(a.id), pinned: ls('three.sketchPins', []).includes(a.id) }); }
  step('the copy deleted: in Recently deleted, the original project is still there with its scenes', !P.get(Dp.id) && P.trashed().some((x) => x.id === Dp.id) && P.get(p.id)?.items.filter((x) => x.type === 'scene').length === 2, null);
  step('…the original untouched: code, reference files, song, bars, History, pin', after.every((x, i) => x.code === A.scenes[i].code && x.refs.every(Boolean) && x.refs.length === A.scenes[i].refs.length && x.song && covers(x.hist, A.scenes[i].hist)) && after[0].bars === 41 && after[1].pinned, after.map((x) => ({ ...x, code: x.code?.slice(-30) })));
  step('…and the copy\'s scenes and their files stay too (a project\'s delete only forgets the grouping)', S.get(c1s.id) && S.get(c2s.id) && (await exists(cSong)) && (await exists(cRefs.find((r) => r.key === 'cube').path)), null);
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 600));
}
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
