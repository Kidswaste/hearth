// (round 98, bundle98) the second computer, in the app, on a FRESH profile and an empty data folder: the bundle
// dev/bundle98-src.js exported (SMOKE_SAVES) is imported with Import project… (its card, Import as a new project):
//   1. the model's .gltf and every file it names arrive in their layout (same sizes, a texture one folder up included),
//      the missing buffer named in "What was skipped"
//   2. the same file imported while a board's save throws (a full disk): nothing half-imported stays (no project, no
//      scene, no board, no History file, its unpacked folder in the Trash: Hearth's projects folder as it was)
//   3. the same file, Cancel pressed on the card while it adds its things: cancelled, the same
//   node dev/smoke.js --check-timeout 300000 --script dev/bundle98-dst.js   (through dev/checks/bundle98.js)
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const ls = (k, d) => { try { const v = localStorage.getItem(`hub.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } };
const card = () => document.querySelector('dialog.pb-card[open]');
const size = async (p) => (p ? (await hub.fs.stat(p).catch(() => null))?.size ?? -1 : -1);
const sizesUnder = async (gltf) => { const d = gltf.replace(/[\\/][^\\/]+$/, ''); const o = {}; for (const rel of ['buffers/car.bin', 'textures/wood grain.png', 'textures/normals/car_n.png', '../shared/rock.jpg', 'buffers/wheels.bin']) o[rel] = await size(`${d}/${rel}`); o['car.gltf'] = await size(gltf); return o; };
const kvState = async (name) => (await hub.kvGet(name, null, { status: true }))?.state;
async function importClick(file, { cancelWhileAdding = false } = {}) {
  const im = ProjBundle.importProject(file);
  const c = await until(() => card()?.querySelector('.pb-go') && card(), 30000);
  c?.querySelector('.pb-go').click();
  if (cancelWhileAdding) {
    await until(() => /Adding/.test(card()?.querySelector('.pb-status')?.textContent || ''), 30000);
    [...(card()?.querySelectorAll('.pb-actions button') || [])].find((b) => /Cancel/.test(b.textContent))?.click();
  }
  return im;
}
try {
  const A = JSON.parse(await hub.fs.read(`${window.SMOKE_SAVES}/bd98-expect.json`));
  await Lazy.load('projects'); await Projects.ready(); await Lazy.load('projbundle'); await Lazy.load('board'); await Board.ready();
  const P = Projects;
  const info = await hub.reach.info();
  const PROJ = `${info.dataDir}/assets/projects`;
  const state = async () => ({ projects: P.all().map((x) => x.id).sort(), scenes: (typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.all ? ThreeLab.scenes.all() : []).map((x) => x.id).sort(), boards: Board._.S.index.list.map((x) => x.id).sort(), folders: ((await hub.fs.list(PROJ).catch(() => [])) || []).map((f) => f.name).sort(), pins: JSON.stringify(ls('three.sketchPins', [])), chats: (H.chats || []).map((c) => c.id).sort() });

  // ---------- 1. the import ----------
  const B = await importClick(A.bundle);
  await wait(1200);
  const sid = B && P.get(B.id)?.items.find((x) => x.type === 'scene')?.ref;
  const ref = sid && ThreeLab.refsOf(sid).find((r) => r.key === 'car');
  const got = ref ? await sizesUnder(ref.path) : null;
  step('Import: the .gltf and every file it names in their layout in Hearth\'s folder (same sizes, the texture one folder up too)', ref && ref.path.startsWith(`${PROJ}/`) && /[\\/]car[\\/]car\.gltf$/.test(ref.path) && JSON.stringify(got) === JSON.stringify(A.want), { path: ref?.path, got, want: A.want });
  step('…the missing buffer named in "What was skipped" (once)', ProjBundle.last.skipped.filter((x) => /wheels\.bin \(used by car\.gltf/.test(x)).length === 1, ProjBundle.last.skipped);
  step('…the scene\'s History came too', sid && Object.keys(await ThreeLab.scenes.versionsOf(sid)).length > 0, null);

  // ---------- 2. an import failing half-way ----------
  for (const [label, arm, opts] of [
    ['a board\'s save throwing (a full disk)', () => { const was = Board.save; Board.save = async () => { throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }); }; return () => { Board.save = was; }; }, {}],
    ['Cancel pressed on the card while it adds', () => { const was = Board.create; Board.create = async (...a) => { await wait(2500); return was(...a); }; return () => { Board.create = was; }; }, { cancelWhileAdding: true }],
  ]) {
    const before = await state();
    const undo = arm();
    let r;
    try { r = await importClick(A.bundle, opts); } finally { undo(); }
    await wait(1500);
    const u = ProjBundle.last.undone || {};
    const after = await state();
    const hv = await Promise.all((u.kv || []).filter((n) => n.startsWith('three-hv-') || n.startsWith('board-')).map(kvState));
    step(`An import failing — ${label}: nothing half-imported stays (no project, scene, board or chat; no History or board store; its unpacked folder in the Trash)`, r === null && JSON.stringify(after) === JSON.stringify(before) && (opts.cancelWhileAdding ? u.boards >= 1 && hv.length >= 1 : u.scenes >= 1 && hv.length >= 2) && hv.every((x) => x === 'missing') && !(ProjBundle.last.left || []).length, { before, after, undone: u, hv, left: ProjBundle.last.left });
  }
  step('…the project imported first is untouched', P.get(B?.id) && ThreeLab.scenes.get(sid) && JSON.stringify(await sizesUnder(ref.path)) === JSON.stringify(A.want), null);
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 600));
}
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
