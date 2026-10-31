// (round 97, labproj97) the second computer, in the app, on a FRESH profile and an empty data folder: the bundle
// dev/labproj97-src.js exported (SMOKE_SAVES, the same folder for both runs) is imported with Import project… (its
// card, Import as a new project), then each scene is opened. Does it run (no error: its code throws when a reference is
// missing), are the texture, the model, the song, its ⚡ bars and loop, History, the pin and each scene's picture there?
//   node dev/smoke.js --check-timeout 300000 --script dev/labproj97-dst.js   (through dev/checks/labproj97.js)
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const ls = (k, d) => { try { const v = localStorage.getItem(`hub.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } };
const card = () => document.querySelector('dialog.pb-card[open]');
const size = async (p) => (p ? (await hub.fs.stat(p).catch(() => null))?.size || 0 : 0);
try {
  const A = JSON.parse(await hub.fs.read(`${window.SMOKE_SAVES}/lp97-expect.json`));
  await Lazy.load('projects'); await Projects.ready(); await Lazy.load('projbundle');
  const P = Projects;
  step('a fresh profile: no project, no scene of the bundle, nothing pinned, no bars', !P.all().some((x) => x.name === A.name) && !(ls('three.sketchPins', []) || []).length && !Object.keys(ls('three.triggersBySong', {}) || {}).length, null);
  const im = ProjBundle.importProject(A.bundle);
  const c = await until(() => card()?.querySelector('.pb-go') && card(), 30000);
  const adds = [...(c?.querySelectorAll('.pb-adds li') || [])].map((x) => x.textContent);
  c?.querySelector('.pb-go').click();
  await im;
  const B = P.get(ProjBundle.last.imported);
  step('Import as a new project: “Labtrip”, nothing skipped', B && B.name === A.name && !ProjBundle.last.skipped.length, { skipped: ProjBundle.last.skipped, adds });
  await wait(1500);
  const S = ThreeLab.scenes; const D = ThreeLab.director;
  const info = await hub.reach.info();
  const ids = B.items.filter((x) => x.type === 'scene').map((x) => x.ref);
  for (const a of A.scenes) {
    const id = ids.find((x) => S.get(x)?.name === a.name);
    const x = id && S.get(id);
    step(`“${a.name}”: there with every layer, the same code`, x && JSON.stringify(S.layersOf(x).map((L) => L.name)) === JSON.stringify(a.layers) && S.layersOf(x).map((L) => L.code).join('\n/*-*/\n') === a.code, { layers: x && S.layersOf(x).map((L) => L.name) });
    if (!x) continue;
    const refs = ThreeLab.refsOf(id);
    const rs = await Promise.all(refs.map(async (r) => ({ key: r.key, size: await size(r.path), inside: r.path.startsWith(`${info.dataDir}/assets/projects/`) })));
    step(`“${a.name}”: its references (${a.refs.map((r) => r.key).join(', ') || 'none'}) in Hearth's folder, byte for byte the same size`, rs.length === a.refs.length && a.refs.every((o) => rs.some((r) => r.key === o.key && r.size === o.size && r.inside)), rs);
    if (a.song) {
      const song = S.extrasOf(id)?.media?.path;
      step(`“${a.name}”: its song is here (in Hearth's folder)`, song && (await size(song)) > 1000 && song.startsWith(`${info.dataDir}/`), song);
      step(`“${a.name}”: its song's ⚡ trigger bars and loop`, song && ls('three.triggersBySong', {})[song]?.kick?.lo === a.bars?.kick?.lo && ls(`three.loop:${song}`, null)?.a === a.loop?.a, { bars: ls('three.triggersBySong', {}), loop: song && ls(`three.loop:${song}`, null) });
    }
    const v = await S.versionsOf(id);
    const got = Object.fromEntries(Object.entries(v).map(([k, l]) => [k === id ? 'main' : k.slice(id.length + 1), l.map((y) => y.code)]).sort((x, y) => (x[0] < y[0] ? -1 : 1)));
    step(`“${a.name}”: its History (${Object.values(a.hist).reduce((n, l) => n + l.length, 0)} versions)`, Object.entries(a.hist).every(([k, l]) => l.every((c) => (got[k] || []).includes(c))) && Object.keys(a.hist).length > 0 === Object.keys(got).length > 0, { got: Object.keys(v).map((k) => `${k.slice(id.length) || 'main'} ×${v[k].length}`), want: Object.fromEntries(Object.entries(a.hist).map(([k, l]) => [k, l.length])) });
    step(`“${a.name}”: its own picture`, S.thumbOf(id) === a.thumb, (S.thumbOf(id) || '').slice(0, 40));
    step(`“${a.name}”: ${a.pinned ? 'pinned' : 'not pinned'} as it was`, ls('three.sketchPins', []).includes(id) === a.pinned, ls('three.sketchPins', []));
    a.newId = id; a.newSong = S.extrasOf(id)?.media?.path || null;
  }
  // opened, one after the other: does it run?
  activate('tool:three');
  await ThreeLab.cmd();
  for (const a of A.scenes) {
    if (!a.newId) continue;
    S.open(a.newId);
    await until(() => S.currentId() === a.newId, 10000);
    await wait(1200); await D.built?.(8000); await wait(800);
    const rep = D.report();
    step(`“${a.name}” opened: it runs (no error${a.refs.length ? ': its texture and model loaded' : ''})${a.song ? ', its song on the timeline' : ''}`, !rep.errors.length && (!a.song || ThreeLab.peek().state?.song === a.newSong), { errors: rep.errors, song: ThreeLab.peek().state?.song, stats: String(rep.stats).slice(0, 80) });
  }
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 600));
}
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
