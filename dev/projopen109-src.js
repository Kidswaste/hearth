// (round 109, projopen109) "the PC", in the app, on a throwaway profile (dev/checks/projopen109.js runs it, then
// dev/projopen109-dst.js on a SECOND, fresh profile). Fixtures only (made in SMOKE_TMP), never real data:
//   a project "Garage109" whose scene has two layers that each run their own frame loop (fps107's lesson: a Lab check
//   on a scene with two or more loops) and a model made of several files (projaudit108's car: a .gltf, its .bin in
//   buffers/, a picture in textures/, one a folder up) added through the Lab's own add; exported from the Desk's ⋯
//   (⇪ Export project… → Export…) to one .hearthproject in SMOKE_SAVES
//   node dev/smoke.js --check-timeout 600000 --lib dev/projaudit108-lib.js --script dev/projopen109-src.js
const DIR = `${window.SMOKE_TMP}/po109src`;
const LOOP = (tag, color) => `import * as THREE from 'three';\nconst renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);\nconst scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); camera.position.z = 4;\nscene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));\nconst m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.22, 96, 12), new THREE.MeshStandardMaterial({ color: ${color}, roughness: 0.4 })); scene.add(m);\nrenderer.setAnimationLoop((t) => { m.rotation.y = t / 900; renderer.render(scene, camera); });\n// ${tag}\n`;
const slow = {};
try {
  const gltf = await makeCar(DIR);
  await Lazy.load('projects'); await Projects.ready();
  const p = await ProjectWorkspace.create({ name: 'Garage109', plugins: [] });
  const sid = p.workspace.sceneId;
  await safe('model', async () => {
    await ProjectWorkspace.go('scene');
    await until(() => H.activeId === 'tool:three' && ThreeLab.scenes?.currentId() === sid, 20000);
    const D = ThreeLab.director;
    const first = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid))[0];
    (await ThreeLab.cmd()).selectLayer?.(first?.id);
    D.setCode(LOOP('loop one', '0x3388ff')); await wait(1500);
    // a second layer with its own frame loop
    const add = await D.addLayer?.({ name: 'loop two', code: LOOP('loop two', '0xff8833') }).catch((e) => ({ error: e.message }));
    await wait(1500);
    const res = await ThreeModels.add(gltf, { name: 'car' });
    const st = await modelLoaded('car');
    const L = layerNamed(sid, '🧊 car');
    const px = L ? await pixels(L.name) : null;
    const layers = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid)).map((x) => x.name);
    const loops = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid)).filter((x) => /setAnimationLoop/.test(x.code || '')).length;
    step('the project\'s scene: two layers with their own frame loops and a .gltf of several files (its pictures show)', loops >= 2 && st?.loaded && near(px?.map, RED), { layers, loops, add, res: res?.error || 'ok', st, px });
    await wait(1500);
  });
  await safe('export', async () => {
    await onDesk(p.id);
    const c = await deskAction(/^⇪ Export project…/, () => card()?.querySelector('.pb-go') && card(), 30000);
    step('the Desk\'s ⋯ › ⇪ Export project… opens the export card', Boolean(c), menuMissed);
    const t0 = performance.now();
    await click(c.querySelector('.pb-go'));
    await until(() => !card() && ProjBundle.last?.exported, 60000);
    slow.export = Math.round(performance.now() - t0);
    const file = ProjBundle.last?.exported;
    step('…Export… writes one .hearthproject', file && (await size(file)) > 0, { file, ms: slow.export });
    await hub.fs.write(`${window.SMOKE_SAVES}/po109-expect.json`, JSON.stringify({ bundle: file, name: 'Garage109' }));
  });
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 700));
}
step('slow steps (ms)', true, { ...slow, menuMissed });
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
