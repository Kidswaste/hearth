// (round 131, renderpre131) one-click render presets in the Lab's Render card (docs/upgrades/renderpre131.md), one check:
//   1. each preset chip fills the card's fields (format, size, frame rate, quality, the length line) for a 16:9
//      project scene at 60 fps
//   2. the Vertical reel picks the drop window from a known song (dev/make-test-song.js --form: the drop at bar 17)
//   3. two presets ticked, one ⇪ Export: both render (tiny: 1 s at 160 px, the check's own switch), probed for size,
//      frame rate and duration, named "<project> – <preset> – <date>" in the project's folder of the renders folder,
//      and joined to the project
//   4. the same name again: Replace? is asked first (Replace: one file; Cancel: both kept)
//   5. ＋ Save as preset: kept on the project (kv projects on disk), and the project menu's "Render the main scene…"
//      opens the card on it (the last-used preset)
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene or folder.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/renderpre131.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const base = (p) => String(p || '').split(/[\\/]/).pop();

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.player, 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;
  const CODE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ff3d7f', wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 1000; renderer.render(scene, cam); });`;
  const sk = SC.create({ name: 'Preset check', code: CODE, layers: [ThreeLayers.defaults({ id: 'rpMain', name: 'Main', code: CODE, slot: 0 })], frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id, 20000);
  await cmd.loadSong(SONG);
  const P = hk.player;
  await until(() => P.loaded && P.analysis?.sections?.length >= 4 && P.analysis?.drops?.length, 60000);
  await Lazy.load('projects'); await Projects.ready();
  const pj = Projects.create({ name: 'Reel Test' });
  Projects.add(pj, 'scene', sk.id, '', { links: false });
  pj.prefs = { fps: 60 };
  Projects.changed(pj, 'prefs');
  await Projects.flush();
  step('setup: a 16:9 scene with the fixture song (analyzed), in a project at 60 fps', P.analysis?.drops?.length > 0 && Projects.ofItem('scene', sk.id)?.[0]?.id === pj.id, { drops: P.analysis?.drops, sections: P.analysis?.sections?.map((s) => `${s.label}@${Math.round(s.start)}`) });

  const card = () => document.querySelector('dialog.lx-panel[open]');
  const openCard = async (o = {}) => { LabExport.panel(o); return until(() => card()?.querySelector('.rp-row'), 15000); };
  const closeCard = () => { const d = card(); if (d) d.close(); };
  const chip = (id) => card()?.querySelector(`.rp-chip[data-preset="${id}"]`);
  const rowOn = (label) => [...card().querySelectorAll('.sq-rp-row')].find((r) => r.querySelector('b')?.textContent === label)?.querySelectorAll('.sq-chip.on') || [];
  const read = () => ({ format: [...rowOn('Format')].map((b) => b.textContent).join('|'), fps: [...rowOn('Frame rate')].map((b) => b.textContent).join('|'), quality: [...rowOn('Quality')].map((b) => b.textContent).join('|'), sum: card().querySelector('.sq-rp-sum')?.textContent || '', len: card().querySelector('.rp-len')?.textContent || '', go: card().querySelector('.modal-actions .primary')?.textContent || '' });

  // ---------- 1. each preset fills the card ----------
  await openCard();
  step('the Render card has a Presets row at the top (under round 142\'s What to render), with the five presets', [...(card()?.querySelector('.sq-rp-body')?.children || [])].slice(0, 2).some((x) => x.classList.contains('rp-row')) && ['reel', 'loop', 'full', 'master', 'square'].every((id) => chip(id)), [...(card()?.querySelectorAll('.rp-chip') || [])].map((b) => b.textContent));
  const prores = await LabRenderPre.hasProres();
  const want = {
    reel: (r) => /^MP4/.test(r.format) && r.fps === '30' && /1080×1920/.test(r.sum) && /drop/.test(r.len),
    loop: (r) => /perfect loop/.test(r.format) && r.fps === '60' && /1920×1080/.test(r.sum) && /2 bars at 128/.test(r.len) && /WebM 480×270/.test(r.len),
    full: (r) => /^MP4/.test(r.format) && r.fps === '60' && /1920×1080/.test(r.sum) && r.quality.includes('High') && /whole song/.test(r.len),
    master: (r) => (prores ? /ProRes/.test(r.format) : /^MP4/.test(r.format) && r.quality.includes('Best')) && r.fps === '60' && /3840×2160/.test(r.sum) && /whole song/.test(r.len),
    square: (r) => /^MP4/.test(r.format) && r.fps === '60' && /1080×1080/.test(r.sum) && /15 s from the drop/.test(r.len),
  };
  const seen = {};
  for (const id of Object.keys(want)) { chip(id).click(); await wait(80); seen[id] = read(); }
  step('each preset fills the right fields (format, size, frame rate, quality, length)', Object.entries(want).every(([id, f]) => f(seen[id])), Object.fromEntries(Object.entries(seen).map(([id, r]) => [id, `${want[id](r) ? 'ok' : 'NO'} ${r.format} ${r.fps}fps ${r.quality} · ${r.sum.split(' · ').slice(-1)[0]} · ${r.len.slice(0, 70)}`])));
  await smoke({ shot: '/tmp/renderpre131-card.png' }).catch(() => {});
  step('…all five ticked, ⇪ Export says how many', LabRenderPre._S.cur.state().ticked.length === 5 && /Export 5 presets/.test(read().go), read().go);
  // the owner changes a field after a preset filled it: kept for that preset
  chip('reel').click(); await wait(50); // (ticked and not shown → shown)
  [...card().querySelectorAll('.sq-rp-row')].find((r) => r.querySelector('b')?.textContent === 'Frame rate').querySelectorAll('.sq-chip').forEach((b) => { if (b.textContent === '24') b.click(); });
  await wait(50);
  chip('full').click(); await wait(50); chip('reel').click(); await wait(50);
  step('the owner can still change a field: the reel keeps 24 fps after showing another preset', read().fps === '24', read().fps);
  closeCard();

  // ---------- 2. the reel's window: the drop with its build-up ----------
  await openCard();
  chip('reel').click(); await wait(50);
  const L = LabRenderPre._S.cur.state().filled.reel.length;
  const an = P.analysis; const tl = P.timeline();
  const bar = (tl.grid.beatsPerBar * 60) / tl.grid.bpm;
  const drop = an.drops[0];
  const buildStart = an.sections.filter((s) => s.start < drop - 0.5).pop()?.start ?? 0;
  const w = L?.range || {};
  const span = w.b - w.a;
  step('the reel picks the drop window: 15–30 s, the drop inside it with its build-up before, on whole bars', span >= 15 && span <= 30 && w.a < drop && drop < w.b && w.a >= buildStart - bar / 2 && Math.abs(((drop - w.a) / bar) - Math.round((drop - w.a) / bar)) < 0.1 && drop - w.a >= bar * 0.9,
    { window: [w.a, w.b], span, drop, buildStart, bar: Math.round(bar * 1000) / 1000, why: L?.why });
  closeCard();

  // ---------- 3. two presets in one go (tiny) ----------
  LabRenderPre.tiny({ long: 160, secs: 1 });
  await openCard();
  chip('reel').click(); await wait(50); chip('square').click(); await wait(50);
  const before = LabRenderPre.last;
  card().querySelector('.modal-actions .primary').click();
  const r3 = await until(() => LabRenderPre.last !== before && LabRenderPre.last?.files?.length + LabRenderPre.last?.failed?.length === 2 && LabRenderPre.last, 240000);
  // (the queue's result is set as it starts: wait for both files)
  await until(() => LabRenderPre.last?.files?.length + LabRenderPre.last?.failed?.length >= 2, 240000);
  const files = LabRenderPre.last?.files || [];
  const probes = {};
  for (const f of files) probes[f.preset] = await window.hub.video.probe(f.path);
  const date = RenderPreCore.dateOf();
  const reel = files.find((f) => f.preset === 'reel'); const sq = files.find((f) => f.preset === 'square');
  const pr = probes.reel; const ps = probes.square;
  step('two presets ticked, one ⇪ Export: both render (tiny: 1 s, 160 px long side)', reel && sq && pr?.w === 90 && pr?.h === 160 && ps?.w === 160 && ps?.h === 160 && Math.abs(pr.duration - 1) < 0.15 && Math.abs(ps.duration - 1) < 0.15 && Math.abs(pr.fps - 30) < 0.01 && Math.abs(ps.fps - 60) < 0.01,
    { reel: pr && `${pr.w}×${pr.h} ${pr.fps}fps ${pr.duration}s`, square: ps && `${ps.w}×${ps.h} ${ps.fps}fps ${ps.duration}s`, failed: LabRenderPre.last?.failed, r3: Boolean(r3) });
  const dir = LabRenderPre.last?.dir || '';
  step('…named "<project> – <preset> – <date>" in the project\'s folder of the renders folder', base(reel?.path) === `Reel Test – Vertical reel – ${date}.mp4` && base(sq?.path) === `Reel Test – Square post – ${date}.mp4` && base(dir) === 'Reel Test' && /[\\/]made[\\/]Reel Test$/.test(dir), files.map((f) => f.path));
  await wait(1800);
  const joined = (f) => pj.items.filter((it) => it.type === 'render' && (it.ref === f.path || window.Renders?.get?.(it.ref)?.output === f.path)).length;
  step('…and each joins the project once', files.length === 2 && files.every((f) => joined(f) === 1), pj.items.map((it) => `${it.type}:${base(it.ref)}`));
  step('the last render\'s settings (three.export) stay untouched by presets', store.get('three.export', {}).fps !== 30 || store.get('three.export', {}).custom !== '1080x1920', store.get('three.export', {}));

  // ---------- 4. the same name again: asked first ----------
  const runReel = async (answer) => {
    await openCard();
    chip('reel').click(); await wait(50);
    const asked0 = LabRenderPre.asked; const last0 = LabRenderPre.last;
    card().querySelector('.modal-actions .primary').click();
    const q = await until(() => [...document.querySelectorAll('dialog[open]')].find((d) => /Replace/.test(d.textContent)), 10000);
    const text = q?.textContent || '';
    [...(q?.querySelectorAll('button') || [])].find((b) => (answer ? /Replace it/ : /Cancel/).test(b.textContent))?.click();
    await until(() => LabRenderPre.last !== last0 && LabRenderPre.last?.files?.length, 120000);
    return { asked: LabRenderPre.asked - asked0, text, path: LabRenderPre.last?.files?.[0]?.path };
  };
  const a1 = await runReel(true);
  const list1 = (await window.hub.fs.list(dir)).map((x) => x.name).filter((n) => /Vertical reel/.test(n));
  step('the same name again: "Replace?" is asked first; Replace makes one file of that name', a1.asked === 1 && /already in “Reel Test”/.test(a1.text) && base(a1.path) === `Reel Test – Vertical reel – ${date}.mp4` && list1.length === 1, { text: a1.text.replace(/\s+/g, ' ').slice(0, 140), list1 });
  const a2 = await runReel(false);
  const list2 = (await window.hub.fs.list(dir)).map((x) => x.name).filter((n) => /Vertical reel/.test(n));
  step('…Cancel keeps both (the new one gets a number)', a2.asked === 1 && base(a2.path) === `Reel Test – Vertical reel – ${date} (2).mp4` && list2.length === 2, list2);

  // ---------- 5. save as a project preset, round trip ----------
  await openCard();
  chip('square').click(); await wait(50);
  [...card().querySelectorAll('.sq-rp-row')].find((r) => r.querySelector('b')?.textContent === 'Frame rate').querySelectorAll('.sq-chip').forEach((b) => { if (b.textContent === '25') b.click(); });
  await wait(50);
  card().querySelector('.rp-save').click();
  const pd = await until(() => [...document.querySelectorAll('dialog[open]')].find((d) => d !== card() && d.querySelector('input')), 5000);
  pd.querySelector('input').value = 'Promo';
  [...pd.querySelectorAll('button')].find((b) => b.textContent === 'OK').click();
  await until(() => card()?.querySelector('.rp-chip[data-preset^="my-"]'), 5000);
  await Projects.flush();
  const disk = await window.hub.kvGet('projects');
  const onDisk = (disk?.list || disk?.projects || []).find?.((x) => x.id === pj.id)?.prefs?.renderPresets?.[0];
  const sp = pj.prefs.renderPresets?.[0];
  step('＋ Save as preset keeps it on the project (its fields, the preset it came from) and on disk', sp?.name === 'Promo' && sp.base === 'square' && sp.fields.fps === 25 && sp.fields.custom === '1080x1080' && onDisk?.id === sp.id && card().querySelector(`.rp-chip[data-preset="${sp.id}"]`)?.classList.contains('on'), { sp, onDisk: Boolean(onDisk) });
  const last0 = LabRenderPre.last;
  card().querySelector('.modal-actions .primary').click();
  await until(() => LabRenderPre.last !== last0 && LabRenderPre.last?.files?.length, 120000);
  const pf = LabRenderPre.last?.files?.[0];
  const pp = pf && await window.hub.video.probe(pf.path);
  step('…rendering it: "<project> – Promo – <date>", 25 fps, square; it becomes the project\'s last-used preset', base(pf?.path) === `Reel Test – Promo – ${date}.mp4` && Math.abs(pp?.fps - 25) < 0.01 && pp?.w === pp?.h && pj.prefs.renderLast === sp.id, { path: base(pf?.path), fps: pp?.fps, w: pp?.w, h: pp?.h, last: pj.prefs.renderLast });
  await Lazy.load('projmenu');
  const row = ProjectMenu.items(pj, { where: 'menu' }).find((x) => x?.id === 'render');
  row?.action?.();
  await until(() => card()?.querySelector('.rp-row'), 20000);
  const st5 = LabRenderPre._S.cur?.state();
  step('the project menu\'s "Render the main scene…" opens the card on the project\'s last-used preset', row && st5?.shown === sp.id && st5.ticked.length === 1 && read().fps === '25' && /1080×1080/.test(read().sum), { shown: st5?.shown, fps: read().fps });
  closeCard();
  LabRenderPre.tiny(null);
  // (the check's renders: tiny files in the smoke run's own data folder, which smoke.js removes)
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 500));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
