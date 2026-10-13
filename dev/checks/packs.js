// Packs (round 28, packs): a scene with assets round-trips through ONE .hearthpack, through the buttons. The packs
// group stays unloaded until used; a Lab scene with a texture reference, the song, a LUT its grade uses, keyframes, a
// saved look and a palette is saved from Sketch ▾ › Share › Save as a pack… (the card says what's inside), opened
// again from Share › Open a pack… (the preview card: picture, name, what's inside, size, where it came from, the
// sandbox note; nothing added before "Add"), and lands as a new scene: same layers, keyframes, looks and palette, its
// files in Hearth's own folder (data/assets/packs/…) and the asset library, paths rewritten, the reference copied, the
// LUT imported under a new name, no errors. Also: ✦ More › ⇪ Share, a gallery starting point saved as a pack, a
// crafted zip-slip pack refused on its card (nothing written), a dropped .hearthpack caught.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --save-dir /tmp/hearth-packs-saves --open /tmp/hearth-packs-saves/Packtest.hearthpack --script dev/checks/packs.js --shot /tmp/packs.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const lazyState = () => Lazy.state().find((g) => g.name === 'packs')?.state;
const SONG = '/tmp/hearth-test-song.wav';
const DIR = '/tmp/hearth-packs-check';
const PNG = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#c84'; g.fillRect(0, 0, 8, 8); return c.toDataURL('image/png').split(',')[1]; })();
const clickRow = async (label) => { const b = await until(() => [...document.querySelectorAll('.mb-menu .menu-item')].find((x) => x.querySelector('b')?.textContent === label), 4000); if (b) [...document.querySelectorAll('.mb-menu .menu-item')].find((x) => x.querySelector('b')?.textContent === label).click(); return b; };
const cardOpen = () => document.querySelector('dialog.pk-card[open]');

try {
  step('first screen: the packs group is not loaded (tier "use")', lazyState() === 'stub', lazyState());
  await SQL.lab();
  await until(() => typeof LabPacksHook !== 'undefined', 15000);
  step('the Lab loads its small hook only (packs still not loaded)', typeof LabPacksHook !== 'undefined' && lazyState() === 'stub', lazyState());
  const info = await window.hub.reach.info();
  const data = info.dataDir;

  // ---------- a scene with assets ----------
  await window.hub.fs.write(`${DIR}/brick.png`, PNG, { base64: true });
  await window.hub.fs.write(`${DIR}/packtest.cube`, 'TITLE "packtest"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n');
  const lut = await LabGrade.importCube(`${DIR}/packtest.cube`, { name: 'packtest' });
  const code = `const P = tweak({ speed: { value: 1, min: 0, max: 4, label: 'Speed' }, glow: { value: 0.5, min: 0, max: 1, label: 'Glow' } });
const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); const img = new Image(); img.src = refs.brick;
function f() { requestAnimationFrame(f); c.width = innerWidth; c.height = innerHeight; g.fillStyle = '#336'; g.fillRect(0, 0, c.width, c.height); if (img.complete && img.naturalWidth) g.drawImage(img, 20, 20, 80, 80); }
f();`;
  const layers = [ThreeLayers.defaults({ id: 'main', name: 'Brick', code, keys: { 's:speed': [{ t: 0, v: 1 }, { t: 2, v: 3 }] } }), ThreeLayers.defaults({ name: 'Glow on top', code: '// a quiet second layer\n', opacity: 0.6, blend: 'screen' })];
  const S = ThreeLab.scenes;
  const sc = S.create({ name: 'Packtest', code, layers, frame: '9:16', open: true });
  await until(() => S.currentId() === sc.id, 5000);
  await ThreeLab.director.refs.add(`${DIR}/brick.png`, 'brick');
  ThreeLab.director.refs.setPalette(['#ff3366', '#22ccff']);
  S.setExtras(sc.id, { media: { path: SONG }, looks: [{ name: 'Hot', values: [3, 1] }], packGrade: { lut: lut.name } });
  await wait(1500);
  step('a test scene: 2 layers, a texture reference, the song, a LUT, keyframes, a look, a palette', S.get(sc.id) && ThreeLab.director.refs.list().length === 1 && S.extrasOf(sc.id)?.media?.path === SONG, { refs: ThreeLab.director.refs.list().map((r) => r.key), lut: lut.name });

  // ---------- ✦ More › ⇪ Share is there ----------
  const more = LabEasy.previewItem().items();
  const share = more.find((x) => x.label === '⇪ Share');
  step('the preview\'s ✦ More has ⇪ Share (Save as a pack…, Open a pack…)', share && share.items().map((x) => x.label).includes('⇪ Save as a pack…') && share.items().some((x) => x.label === 'Open a pack…'), more.map((x) => x.label));

  // ---------- save: Sketch ▾ › Share › Save as a pack… ----------
  const sketchBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Sketch ▾');
  sketchBtn.click();
  const shareRow = await clickRow('Share');
  const saveRow = shareRow && await clickRow('⇪ Save as a pack…');
  await until(cardOpen, 15000);
  const c1 = cardOpen();
  const lines1 = [...(c1?.querySelectorAll('.pk-lines li') || [])].map((x) => x.textContent);
  step('Sketch ▾ › Share › Save as a pack… → the save card (loads the packs group then)', shareRow && saveRow && c1 && lazyState() === 'loaded' && c1.querySelector('.pk-name').textContent === 'Packtest', { lines: lines1, state: lazyState() });
  step('the save card says what\'s inside: 2 layers, sliders, a look, keyframes, the texture, the LUT, the song (a toggle)', /2 layers/.test(lines1[0]) && /2 sliders · 1 saved look · 2 keyframes/.test(lines1[1]) && /1 texture, 1 LUT, the song/.test(lines1[2]) && c1.querySelector('.pk-toggle input')?.checked, lines1);
  await smoke({ shot: '/tmp/packs-save.png' });
  c1.querySelector('.pk-ok').click();
  await until(() => LabPacks.last.saved, 20000);
  const saved = LabPacks.last.saved;
  step('saved one .hearthpack (in the test save folder), 3 files in it, nothing missing', saved?.ok && /Packtest\.hearthpack$/.test(saved.path) && saved.files === 3 && !saved.missing.length, saved);

  // ---------- open: Share › Open a pack… → the preview card ----------
  const before = S.all().length;
  sketchBtn.click();
  await clickRow('Share');
  await clickRow('Open a pack…');
  await until(cardOpen, 15000);
  const c2 = cardOpen();
  const facts = [...(c2?.querySelectorAll('.pk-facts div') || [])].map((x) => x.textContent);
  const lines2 = [...(c2?.querySelectorAll('.pk-lines li') || [])].map((x) => x.textContent);
  const note = c2?.querySelector('.pk-note')?.textContent || '';
  step('Open a pack… → the preview card: picture, name, what\'s inside, size, where it came from, the file', c2 && c2.querySelector('.pk-head').textContent === 'Open a pack' && c2.querySelector('.pk-pic img')?.naturalWidth > 0 && c2.querySelector('.pk-name').textContent === 'Packtest' && /the song/.test(lines2[2] || '') && /KB|MB/.test(facts[0]) && /^Made with Hearth/.test(facts[1]) && facts[2].includes('Packtest.hearthpack'), { facts, lines2, thumb: Boolean(c2?.querySelector('.pk-pic img')) });
  step('the card says the layers are code that runs in the Lab\'s sandboxed preview, and nothing is added yet', /2 layers are code, the same kind as any Lab scene/.test(note) && /sandboxed preview/.test(note) && /Nothing is added until you say so/.test(note) && S.all().length === before, note);
  await smoke({ shot: '/tmp/packs-open.png' });
  c2.querySelector('.pk-ok').click();
  await until(() => LabPacks.last.imported, 20000);
  const imp = LabPacks.last.imported;
  await wait(2500);

  // ---------- what landed ----------
  const nx = S.get(imp?.main);
  const nl = S.layersOf(nx || {});
  step('a new scene "Packtest 2", opened, its 2 layers, keyframes, palette', nx && nx.name === 'Packtest 2' && S.currentId() === nx.id && nl.length === 2 && nl[0].keys?.['s:speed']?.length === 2 && nl[1].blend === 'screen' && JSON.stringify(nx.palette) === JSON.stringify(['#ff3366', '#22ccff']), { name: nx?.name, layers: nl.map((L) => L.name), palette: nx?.palette });
  const ex = S.extrasOf(nx?.id) || {};
  const sep = data.includes('\\') ? '\\' : '/';
  const packDir = `${data}${sep}assets${sep}packs${sep}Packtest`;
  step('its song and look came along; the song\'s path rewritten into Hearth\'s own folder (data/assets/packs/Packtest)', ex.looks?.[0]?.name === 'Hot' && ex.media?.path === `${packDir}${sep}hearth-test-song.wav` && imp.dir === packDir, { media: ex.media?.path, dir: imp.dir });
  const refs = ThreeLab.director.refs.list();
  step('the texture is the new scene\'s reference "brick" (a copy, like any reference)', refs.length === 1 && refs[0].key === 'brick' && !refs[0].path.startsWith(DIR), refs.map((r) => [r.key, r.path]));
  step('the LUT is in the grade under a new name (yours stays), the scene follows it', imp.luts?.[0]?.[0] === 'packtest' && imp.luts[0][1] === 'packtest-2' && ex.packGrade?.lut === 'packtest-2' && (await LabGrade.luts()).imported.some((x) => x.name === 'packtest-2'), { luts: imp.luts, grade: ex.packGrade });
  await until(() => typeof Assets !== 'undefined', 5000);
  const inLib = typeof Assets !== 'undefined' ? Assets.all().filter((it) => String(it.p).startsWith(packDir)) : [];
  step('its 3 files are in the asset library (Imported, tagged "pack")', imp.files === 3 && inLib.length === 3 && inLib.every((it) => it.src === 'import' && it.tg.includes('pack')), inLib.map((it) => [it.n, it.k, it.src]));
  const rep = ThreeLab.director.report();
  step('it runs in the Lab with no errors', rep.sketch === 'Packtest 2' && !rep.errors.length, { sketch: rep.sketch, errors: rep.errors });
  await smoke({ shot: '/tmp/packs-imported.png' });

  // ---------- a sequence (two scenes) round trip ----------
  const scB = S.create({ name: 'Packtest B', code: '// B\n' });
  const SD = ThreeSeqData;
  let e = SD.create({ format: '9:16', fps: 30, name: 'Packtest seq' });
  e.seq.scene = sc.id;
  e = SD.addScene(e, { sketch: sc.id, name: 'Packtest', poster: null }, { dur: 2 });
  e = SD.addScene(e, { sketch: scB.id, name: 'Packtest B', poster: null }, { dur: 2 });
  await CutStore.storeEdit('seq:Packtest seq', e, 'check');
  await ThreeSeq.list();
  step('Share offers "Save its sequence as a pack…" for a scene with a sequence', LabPacksHook.rows(() => sc.id).some((r) => r[0] === '⇪ Save its sequence as a pack…'), LabPacksHook.rows(() => sc.id).map((r) => r[0]));
  LabPacks.last.saved = null;
  LabPacks.saveSequence(sc.id).catch((err) => { LabPacks.last.error = err.message; });
  await until(cardOpen, 15000);
  const c5 = cardOpen();
  step('… its card: "A sequence of 2 scenes"', c5?.querySelector('.pk-sub')?.textContent === 'Lab sequence' && /A sequence of 2 scenes/.test(c5.querySelector('.pk-lines li')?.textContent || ''), [...(c5?.querySelectorAll('.pk-lines li') || [])].map((x) => x.textContent));
  c5?.querySelector('.pk-ok')?.click();
  await until(() => LabPacks.last.saved, 15000);
  const seqPath = LabPacks.last.saved?.path;
  LabPacks.last.imported = null;
  LabPacks.openFile(seqPath);
  await until(cardOpen, 15000);
  step('… opening it offers "Add as 2 new scenes"', cardOpen()?.querySelector('.pk-ok')?.textContent === 'Add as 2 new scenes');
  cardOpen()?.querySelector('.pk-ok')?.click();
  await until(() => LabPacks.last.imported, 20000);
  const si = LabPacks.last.imported;
  const se = si?.sequence ? await CutStore.editFor(`seq:${si.sequence}`) : null;
  const clipIds = (se?.clips || []).filter((c) => c.kind === 'scene').map((c) => c.sketch);
  step('… 2 new scenes and the sequence, owned by the new main scene, its clips pointing at the new scenes', si?.scenes.length === 2 && se?.seq?.scene === si.main && clipIds.length === 2 && clipIds.every((id) => si.scenes.includes(id)), { seq: si?.sequence, clipIds, scenes: si?.scenes });
  await wait(1000);

  // ---------- a gallery starting point as a pack (the gallery's right-click row) ----------
  await Lazy.load('gallery');
  const start = LabGallery.items().find((x) => x.kind === 'start');
  const row = LabPacksHook.galleryItem(start, () => null);
  row.action();
  await until(cardOpen, 15000);
  const c3 = cardOpen();
  step('gallery right-click › ⇪ Save as a pack… → its card ("Gallery starting point", its layers)', row.label === '⇪ Save as a pack…' && c3?.querySelector('.pk-sub')?.textContent === 'Gallery starting point' && /layer/.test(c3.querySelector('.pk-lines li')?.textContent || ''), { name: c3?.querySelector('.pk-name')?.textContent });
  LabPacks.last.saved = null;
  c3.querySelector('.pk-ok').click();
  await until(() => LabPacks.last.saved, 15000);
  step('… saved as its own .hearthpack', LabPacks.last.saved?.ok && LabPacks.last.saved.path.endsWith(`${start.name}.hearthpack`), LabPacks.last.saved);

  // ---------- a crafted zip-slip pack: refused on its card, nothing written ----------
  const P = PacksCore;
  const enc = (s) => new TextEncoder().encode(s);
  const parts = []; const cds = []; let off = 0;
  for (const [name, text] of [['hearthpack.json', JSON.stringify(P.makeManifest({ kind: 'scene', name: 'Evil', scenes: [{ sketch: { name: 'x', layers: [{ code: '' }] } }] }))], ['files/../../../../packs-evil.txt', 'pwned']]) {
    const d = enc(text); const e = { name, method: 0, crc: P.crc32(d), csize: d.length, size: d.length, at: new Date(), offset: off };
    const lh = P.localHeader(e); parts.push(lh, d); off += lh.length + d.length; cds.push(e);
  }
  const cd = cds.map((e) => P.centralHeader(e)); const cdLen = cd.reduce((a, b) => a + b.length, 0);
  const all = [...parts, ...cd, P.endRecord(cds.length, cdLen, off)];
  const buf = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let o2 = 0; for (const b of all) { buf.set(b, o2); o2 += b.length; }
  await window.hub.fs.write(`${DIR}/Evil.hearthpack`, buf);
  const n0 = S.all().length;
  LabPacks.openFile(`${DIR}/Evil.hearthpack`);
  await until(cardOpen, 8000);
  const c4 = cardOpen();
  const probs = [...(c4?.querySelectorAll('.pk-problems li') || [])].map((x) => x.textContent);
  step('a zip-slip pack: "can\'t be opened", why, no Add button', c4 && /can't be opened/.test(c4.querySelector('.pk-head').textContent) && probs.some((p) => /outside Hearth's folder/.test(p)) && !c4.querySelector('.pk-ok'), probs);
  c4.querySelector('.pk-cancel').click();
  await wait(300);
  const leaked = await window.hub.fs.stat(`${data}${sep}packs-evil.txt`) || await window.hub.fs.stat('/tmp/packs-evil.txt') || await window.hub.fs.stat(`${packDir}${sep}..${sep}Evil`);
  step('… nothing written, no scene added', !leaked && S.all().length === n0);

  // ---------- a dropped .hearthpack is caught (anywhere on the window) ----------
  const dt = new DataTransfer();
  dt.items.add(new File(['x'], 'Dropped.hearthpack'));
  const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
  document.querySelector('.composer textarea, main, body').dispatchEvent(ev);
  await wait(400);
  step('a .hearthpack dropped anywhere is taken by packs (not by the chat or the Lab)', ev.defaultPrevented);
  document.querySelectorAll('dialog.pk-card').forEach((d) => d.remove());
} catch (err) { step('no exception', false, String(err?.stack || err).slice(0, 600)); }

const bad = out.steps.filter((s) => !s.ok);
out.ok = !bad.length;
out.summary = `${out.steps.length - bad.length}/${out.steps.length} steps`;
return JSON.stringify(out, null, 1);
