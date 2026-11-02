// (round 108, projaudit108) "the other computer", in the app, on a FRESH profile and an empty data folder: the bundle
// dev/projaudit108-src.js exported is imported by clicks (Projects › ⋯ › ⇩ Import project…, the file picked by the
// open dialog: smoke's --open; the card's Import), then the project's scene opened from its Desk: the model made of
// several files shows its pictures (the colour one and the one a folder up, read back from the graphics card).
//   node dev/smoke.js --check-timeout 600000 --open <bundle> --lib dev/projaudit108-lib.js --script dev/projaudit108-dst.js
const slow = {};
try {
  const A = JSON.parse(await hub.fs.read(`${window.SMOKE_SAVES}/pa108-expect.json`));
  await Lazy.load('projects'); await Projects.ready();
  const P = Projects;
  await safe('import', async () => {
    await click(document.querySelector('#agent-buttons [data-space=projects]'));
    const more = await until(() => [...document.querySelectorAll('.pj-quick-more')].find(visible), 15000);
    await click(more);
    const picked = await pickMenu(/^⇩ Import project…/);
    const c = await until(() => card()?.querySelector('.pb-go') && card(), 30000);
    step('Projects › ⋯ › ⇩ Import project… (the file picked) opens the import card', picked && Boolean(c), { picked, card: card()?.textContent?.slice(0, 200) });
    const before = new Set(P.all().map((x) => x.id));
    const t0 = performance.now();
    await click(c.querySelector('.pb-go'));
    const got = await until(() => P.all().find((x) => !before.has(x.id)), 60000);
    await until(() => !card(), 20000);
    slow.import = Math.round(performance.now() - t0);
    step('…Import adds the project', got && got.name === A.name, { name: got?.name, ms: slow.import, skipped: ProjBundle.last?.skipped });
    // the imported project opens by itself (its card: Files, Scene, Board, Sound, Ready): the owner waits for it
    const opened = await until(() => ProjectWorkspace.state().project === got.id && ProjectWorkspace.state().phase !== 'opening' && performance.now(), 100000, 100);
    slow.importOpen = opened ? Math.round(opened - t0) : null;
    step('…and opens it (ready)', ProjectWorkspace.state().phase === 'ready' && ProjectWorkspace.current()?.id === got.id, { state: JSON.stringify(ProjectWorkspace.state()).slice(0, 300), ms: slow.importOpen });
    const id = got.id;
    const tD = performance.now(); const okDesk = await onDesk(id); slow.desk = Math.round(performance.now() - tD); slow.afterDesk = JSON.stringify(ProjectWorkspace.state()).slice(0, 200) + ` desk:${Boolean(okDesk)} ${deskName()}`;
    const sid = P.get(id).items.find((x) => x.type === 'scene')?.ref;
    await fileRow(/Garage108/);
    const sec = [...document.querySelectorAll('.pj-home .pw-project-files .pj-sec')].find((x) => /scene/i.test(x.querySelector('h4')?.textContent || ''));
    const sc = sec?.querySelector('.pj-item');
    const t1 = performance.now();
    if (sc) await click(sc);
    const inLab = await until(() => H.activeId === 'tool:three' && ThreeLab.scenes?.currentId() === sid, 30000);
    const where = { at: H.activeId, cur: typeof ThreeLab !== 'undefined' ? ThreeLab.scenes?.currentId() : null, sid, state: JSON.stringify(ProjectWorkspace.state()).slice(0, 400), card: document.querySelector('.pw-loading')?.textContent?.slice(0, 200), current: ProjectWorkspace.current()?.id, id, ms: Math.round(performance.now() - t1) };
    const readyAt = await until(() => ProjectWorkspace.state().phase !== 'opening' && performance.now(), 100000, 100);
    slow.sceneReady = readyAt ? Math.round(readyAt - t1) : null; slow.sceneState = JSON.stringify(ProjectWorkspace.state()).slice(0, 300);
    if (!inLab) await ProjectWorkspace.open(id, 'scene'); // (the row may be the project's chat: the scene opened as the Desk's Scene does)
    await until(() => H.activeId === 'tool:three' && ThreeLab.scenes?.currentId() === sid, 30000);
    const ref = ThreeLab.refsOf(sid).find((r) => /car\.gltf$/.test(r.path));
    const dir = ref?.path.replace(/[\\/]car\.gltf$/, '');
    const files = dir ? { gltf: await size(`${dir}/car.gltf`), bin: await size(`${dir}/buffers/car.bin`), red: await size(`${dir}/textures/paint red.png`), glow: await size(`${dir}/../shared/glow.png`) } : null;
    step('the imported scene\'s model: every file it names arrived, in its layout (same sizes)', JSON.stringify(files) === JSON.stringify(A.files), { path: ref?.path, files, want: A.files });
    const L = layerNamed(sid, '🧊 car');
    const st = await modelLoaded('car');
    const px = L ? await pixels(L.name) : null;
    slow.openScene = Math.round(performance.now() - t1);
    step('the scene opened from the Desk (a click on its row): the Lab on it, the model loads', inLab && st?.loaded && !st.error, { inLab: Boolean(inLab), where, st, row: sc?.textContent?.slice(0, 60) });
    step('…its pictures show: the colour one and the one a folder up (read back from the graphics card)', near(px?.map, RED) && near(px?.emissiveMap, YELLOW), px);
  });
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 700));
}
step('slow steps (ms)', true, slow);
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
