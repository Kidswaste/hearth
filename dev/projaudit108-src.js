// (round 108, projaudit108) "the PC", in the app, by clicks (dev/checks/projaudit108.js runs it on a throwaway profile,
// then dev/projaudit108-dst.js on a SECOND, fresh one). Fixtures only (made in SMOKE_TMP), never real data.
//   model      a project "Garage108": its scene gets a model made of several files (a .gltf, its .bin in buffers/, a
//              picture in textures/, one a folder up) through the Lab's own add; the preview shows its pictures;
//              the Desk's ⋯ › ⇪ Export project… → the card's Export… → one .hearthproject (SMOKE_SAVES)
//   duplicate  the Desk's ⋯ › ⧉ Duplicate project → the copy; its scene edited in the Lab (two runs: History), an earlier
//              version restored from its Earlier versions… (the time machine); then the copy's ⋯ › Delete the
//              project…: the original's code, History, time machine, model files and pictures on screen untouched
//   node dev/smoke.js --check-timeout 600000 --lib dev/projaudit108-lib.js --script dev/projaudit108-src.js
const DIR = `${window.SMOKE_TMP}/pa108src`;
const CODE = (tag) => `import * as THREE from 'three';\nconst renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);\nconst scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50);\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));\n// ${tag}\n`;
const slow = {};
let A = null; // what the original holds
try {
  const gltf = await makeCar(DIR);
  await Lazy.load('projects'); await Projects.ready();
  const P = Projects;
  const p = await ProjectWorkspace.create({ name: 'Garage108', plugins: [] });
  const sid = p.workspace.sceneId;

  // ---------- model: the Lab's own add, in the project's scene ----------
  await safe('model', async () => {
    await ProjectWorkspace.go('scene');
    await until(() => H.activeId === 'tool:three' && ThreeLab.scenes?.currentId() === sid, 20000);
    const D = ThreeLab.director;
    // a layer of code of its own first (History for it), then the model
    const first = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid))[0];
    (await ThreeLab.cmd()).selectLayer?.(first?.id);
    D.setCode(CODE('v1')); await wait(700); D.setCode(CODE('v2')); await wait(2200);
    const res = await ThreeModels.add(gltf, { name: 'car' });
    const L = layerNamed(sid, '🧊 car');
    const st = await modelLoaded('car');
    const px = L ? await pixels(L.name) : null;
    step('model: a .gltf of several files added to the project\'s scene in the Lab; its pictures show (the colour one and the one a folder up, read back from the graphics card)', st?.loaded && near(px?.map, RED) && near(px?.emissiveMap, YELLOW), { res, st, px });
    await wait(1500);
    A = { sid, code: allCode(ThreeLab.scenes.get(sid)), hist: await histCodes(sid), tm: (await ThreeHistory.list(sid)).length, refs: ThreeLab.refsOf(sid).map((r) => r.path), layers: ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid)).map((x) => x.name) };
    const dir = A.refs.find((r) => /car\.gltf$/.test(r))?.replace(/[\\/]car\.gltf$/, '');
    A.files = dir ? { gltf: await size(`${dir}/car.gltf`), bin: await size(`${dir}/buffers/car.bin`), red: await size(`${dir}/textures/paint red.png`), glow: await size(`${dir}/../shared/glow.png`) } : null;
    step('…its files copied whole into Hearth\'s references (the layout kept)', A.files && Object.values(A.files).every((n) => n > 0), { refs: A.refs, files: A.files });
  });

  // ---------- export, by clicks ----------
  await safe('export', async () => {
    await onDesk(p.id);
    const c = await deskAction(/^⇪ Export project…/, () => card()?.querySelector('.pb-go') && card(), 30000);
    step('the Desk\'s ⋯ › ⇪ Export project… opens the export card', Boolean(c), menuMissed);
    const t0 = performance.now();
    await click(c.querySelector('.pb-go'));
    await until(() => !card() && ProjBundle.last?.exported, 60000);
    slow.exportModel = Math.round(performance.now() - t0);
    const file = ProjBundle.last?.exported;
    step('…Export… writes one .hearthproject', file && (await size(file)) > 0, { file, ms: slow.exportModel });
    await hub.fs.write(`${window.SMOKE_SAVES}/pa108-expect.json`, JSON.stringify({ bundle: file, name: 'Garage108', files: A?.files || null }));
  });

  // ---------- duplicate → edit the copy's scene and History → delete the copy ----------
  await safe('duplicate', async () => {
    await onDesk(p.id);
    const before = new Set(P.all().map((x) => x.id));
    const copy = await deskAction(/^⧉ Duplicate project/, () => P.all().find((x) => !before.has(x.id)), 30000);
    const picked = Boolean(copy);
    await wait(1500);
    const csid = copy && P.get(copy.id)?.items.find((x) => x.type === 'scene')?.ref;
    step('the Desk\'s ⋯ › ⧉ Duplicate project makes “Garage108 copy” with its own scene', picked && copy && /Garage108 copy/.test(copy.name) && csid && csid !== sid, { name: copy?.name, csid });
    const cref = csid && ThreeLab.refsOf(csid).find((r) => /car\.gltf$/.test(r.path));
    step('…the copy\'s model is its own folder (not the original\'s)', cref && !A.refs.includes(cref.path), { copy: cref?.path, orig: A.refs });
    // the copy opened, its scene edited in the Lab (two runs: its History)
    await ProjectWorkspace.open(copy.id, 'scene');
    await until(() => H.activeId === 'tool:three' && ThreeLab.scenes.currentId() === csid, 30000);
    const cfirst = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(csid)).find((x) => !/🧊/.test(x.name));
    (await ThreeLab.cmd()).selectLayer?.(cfirst?.id);
    await ThreeHistory.capture(csid, { force: true, label: 'before the copy\'s edits' });
    ThreeLab.director.setCode(CODE('edited in the copy 1')); await wait(800); ThreeLab.director.setCode(CODE('edited in the copy 2')); await wait(2400);
    await ThreeHistory.capture(csid, { force: true, label: 'the copy edited' });
    step('the copy\'s scene edited (two runs): its History has them', /edited in the copy 2/.test(allCode(ThreeLab.scenes.get(csid))) && /edited in the copy 1/.test(await histCodes(csid)), null);
    // an earlier version restored: ▦ All your sketches › right-click the copy's card › Earlier versions… › Preview › Restore
    (await ThreeLab.cmd()).browse();
    const sb = await until(() => [...document.querySelectorAll('.sb-card')].find((c) => c.textContent.includes(ThreeLab.scenes.get(csid).name) && visible(c)), 8000);
    let restored = false; const dbg = { card: Boolean(sb) };
    if (sb) {
      await click(sb, { right: true });
      dbg.menu = [...document.querySelectorAll('#menu button')].map((b) => b.textContent.trim()).slice(0, 20);
      if (await pickMenu(/^Earlier versions…$/)) {
        const rows = () => [...document.querySelectorAll('dialog[open] .vs-row')];
        await until(() => rows().length >= 2, 12000); dbg.rows = rows().map((r) => r.textContent.trim().slice(0, 90)); dbg.previews = [];
        // the version from before the copy's edits: the row whose Preview shows the code then ("// v2"; which row holds
        // it depends on when the time machine and the safety copy were taken)
        for (let i = 0; i < rows().length && !restored; i++) {
          const pv = [...rows()[i].querySelectorAll('button')].find((b) => /^Preview$/.test(b.textContent.trim()));
          if (!pv) continue;
          await click(pv);
          const d = await until(() => document.querySelector('dialog.vs-pv[open]'), 5000);
          const has = /\/\/ v2\b/.test(d?.textContent || '') && !/edited in the copy/.test(d?.textContent || ''); dbg.previews.push(has);
          const rb = has && [...d.querySelectorAll('button')].find((b) => /^Restore this version$/.test(b.textContent.trim()));
          if (rb) { await click(rb); restored = Boolean(await until(() => /\/\/ v2/.test(allCode(ThreeLab.scenes.get(csid))) && !/edited in the copy/.test(allCode(ThreeLab.scenes.get(csid))), 8000)); } else d?.close();
          await wait(200);
        }
      }
    }
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    step('…an earlier version restored in the copy (Earlier versions… › Preview › Restore this version)', restored, { ...dbg, code: allCode(ThreeLab.scenes.get(csid))?.slice(-60) });
    // the original, while the copy is still there
    const mid = { code: allCode(ThreeLab.scenes.get(sid)), hist: await histCodes(sid), tm: (await ThreeHistory.list(sid)).length };
    step('…the original\'s code, History and time machine untouched by the copy\'s edits', mid.code === A.code && mid.hist === A.hist && mid.tm === A.tm, { tm: [mid.tm, A.tm], code: mid.code === A.code, hist: mid.hist === A.hist });
    // the copy deleted from its Desk: ⋯ › Delete the project…
    const onCopy = await onDesk(copy.id);
    const del = { onCopy: Boolean(onCopy), desk: deskName() };
    del.done = Boolean(await deskAction(/^Delete the project…/, () => !P.get(copy.id), 6000));
    await P.flush(); await wait(800);
    step('the copy\'s ⋯ › Delete the project… deletes it (to Recently deleted)', !P.get(copy.id) && P.trashed().some((x) => x.id === copy.id), del);
    const after = { project: P.get(p.id), code: allCode(ThreeLab.scenes.get(sid)), hist: await histCodes(sid), tm: (await ThreeHistory.list(sid)).length, refs: ThreeLab.refsOf(sid).map((r) => r.path), layers: ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid) || {}).map((x) => x.name) };
    const dir = after.refs.find((r) => /car\.gltf$/.test(r))?.replace(/[\\/]car\.gltf$/, '');
    const files = dir ? { gltf: await size(`${dir}/car.gltf`), bin: await size(`${dir}/buffers/car.bin`), red: await size(`${dir}/textures/paint red.png`), glow: await size(`${dir}/../shared/glow.png`) } : null;
    step('…the original untouched: the project, its scene\'s code and layers, History, time machine, its model\'s files', after.project && after.project.items.some((x) => x.ref === sid) && after.code === A.code && after.hist === A.hist && after.tm === A.tm && JSON.stringify(after.refs) === JSON.stringify(A.refs) && JSON.stringify(after.layers) === JSON.stringify(A.layers) && JSON.stringify(files) === JSON.stringify(A.files), { tm: [after.tm, A.tm], layers: after.layers, files, want: A.files });
    // and its scene opens with its pictures
    await ProjectWorkspace.open(p.id, 'scene');
    await until(() => H.activeId === 'tool:three' && ThreeLab.scenes.currentId() === sid, 30000);
    const L = layerNamed(sid, '🧊 car');
    await modelLoaded('car');
    const px = L ? await pixels(L.name) : null;
    step('…and its scene opens with the model\'s pictures', near(px?.map, RED) && near(px?.emissiveMap, YELLOW), px);
  });
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 700));
}
step('slow steps (ms)', true, { ...slow, menuFallbacks, menuMissed });
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
