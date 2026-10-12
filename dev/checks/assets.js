// The asset library (round 24, assets): a temp folder of real asset files (dev/fake-assets.js fixtures: PNG, HDR, a GLB
// with its own texture, a TTF, a WAV, a .cube LUT, a shader, a preset, a duplicate PNG) watched and indexed (dedupe by
// hash), thumbnails made off the main thread and cached on disk (picture, HDR, GLB, font with its real name, waveform,
// LUT), search / filters / tags / favorites by command and in the panel, the virtualized grid with 3,000 cards, cards
// dropped on the Lab preview (a model layer, the sky lighting it, a picture layer, a text layer in the font), on the
// board and in a chat, the director's three_do asset, and the free sources against a fake Poly Haven / ambientCG
// (search, previews, size choice, downloads with progress: an HDRI, PBR maps, a glTF packed into a GLB, a zip unpacked).
//   node dev/smoke.js --fake-assets --check-timeout 300000 --script dev/checks/assets.js --shot /tmp/assets.png
const FIX = '/tmp/hearth-asset-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const fail = []; const out = {};
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const say = async (line) => { let text = ''; let err = ''; await Commands.tryRun(line, C.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { err = String(e); } }); return err ? `ERR ${err}` : text; };
const shot = async (n) => { try { await smoke({ shot: `/tmp/hearth-checks/assets-${n}.png` }); } catch { /* optional */ } };
const drop = (target, h, o = {}) => {
  const dt = new DataTransfer();
  dt.setData('application/x-hearth-asset', h);
  dt.setData('text/plain', Assets.get(h).p);
  const r = target.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, shiftKey: Boolean(o.shift) };
  target.dispatchEvent(new DragEvent('dragover', at));
  return target.dispatchEvent(new DragEvent('drop', at));
};
const byName = (re) => Assets.all().find((x) => re.test(x.p));

try {
  // ---- 0. lazy, registered, nothing scanned at startup ----
  ok(typeof Commands.get('assets')?.run === 'function', '/assets is listed from the start');
  await Lazy.load('assets');
  ok(window.Assets && window.AssetsUI && window.AssetsFree, 'the assets group loads');
  ok(!(Commands.duplicates?.() || []).length, `no duplicate commands (${JSON.stringify(Commands.duplicates?.() || []).slice(0, 160)})`);
  ok(Keys.all().some((k) => k.area === 'Assets' && k.keys === 'Ctrl+Shift+A'), 'Ctrl+Shift+A in the keys sheet');
  ok(AppUI.actions().some((a) => /^Assets: the asset library/.test(a.label)), 'in the palette');
  const kv0 = await hub.kvGet('assets', null);
  ok(!kv0, 'no index written before the library is used');

  // ---- 1. Ctrl/⌘+Shift+A opens the panel ----
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', code: 'KeyA', ctrlKey: true, shiftKey: true, bubbles: true }));
  ok(await until(() => AssetsUI.isOpen(), 3000), 'Ctrl+Shift+A opens the library');
  ok(/empty/i.test(AssetsUI.el.querySelector('.as-empty')?.textContent || ''), 'an empty library says how to fill it');

  // ---- 2. a watched folder: indexed, deduplicated ----
  const t0 = performance.now();
  const w = await say(`/assets watch ${FIX}`);
  out.watchMs = Math.round(performance.now() - t0);
  ok(/Watching/.test(w), `/assets watch (${w})`);
  const n = Assets.all().length;
  out.indexed = n;
  ok(n === 9, `9 assets from 10 asset files (the copy is the same asset): ${n}`);
  const brick = byName(/red_brick_wall/); const hdr = byName(/sunset_sky/); const glb = byName(/robot_textured/); const font = byName(/Dejavu/i); const wav = byName(/kick_hit/); const lut = byName(/Warm Film/); const shader = byName(/plasma/); const preset = byName(/Neon pulse/);
  ok(brick && brick.alt?.length === 1 && /Copies/.test(brick.alt[0]), `the duplicate is a second place of the same asset (${JSON.stringify(brick?.alt)})`);
  ok(brick?.k === 'image' && hdr?.k === 'hdri' && glb?.k === 'model' && font?.k === 'font' && wav?.k === 'sound' && lut?.k === 'lut' && shader?.k === 'shader' && preset?.k === 'preset', 'every kind recognised');
  ok(brick?.tg.includes('brick') && brick.tg.includes('textures'), `tags from the path (${brick?.tg})`);
  ok(!Assets.all().some((x) => /notes\.txt/.test(x.p)), 'a text file is not an asset');
  const dupe = await say('/assets dupes');
  ok(/red brick/i.test(dupe) && /Copies/.test(dupe), '/assets dupes lists it');
  // a rescan reads nothing new
  const re = await say('/assets scan');
  ok(/0 new, 0 gone/.test(re), `a rescan: ${re}`);

  // ---- 3. thumbnails: made off the main thread, cached by hash ----
  await AssetsUI.open({ q: '' });
  const want = [brick, hdr, glb, font, wav, lut];
  ok(await until(() => want.every((x) => x.t === 1), 30000), `thumbnails for picture, HDR, GLB, font, sound, LUT (${want.map((x) => `${x.k}:${x.t}${x.te ? `(${x.te})` : ''}`).join(' ')})`);
  const st = await hub.fs.stat(`${Assets.dirs.thumbs}/${brick.h}.webp`);
  ok(st && st.size > 50, `cached on disk as WebP (${st?.size} bytes)`);
  ok(/DejaVu Sans/i.test(font.n) && font.i?.fam, `the font's real name (${font.n})`);
  ok(wav.i?.dur === 1, `the sound's length (${wav.i?.dur})`);
  ok(glb.i?.tris === 1, `the GLB's counts (${JSON.stringify(glb.i)})`);
  ok(brick.i?.w === 64 && brick.i?.h === 48, 'the picture\'s size');
  ok(shader.t === -1 && /Plasma/.test(shader.i?.first || ''), `a shader card shows its first line (${shader.i?.first})`);
  const imgs = [...AssetsUI.el.querySelectorAll('.as-card img')];
  ok(imgs.length >= 6, `cards show their pictures (${imgs.length})`);
  await shot('library');

  // ---- 4. search, filters, tags, favorites ----
  ok(Assets.search('kind:hdri').length === 1 && Assets.search('hdri')[0] === hdr, 'kind filters');
  const sAll = await say('/assets find brick');
  ok(/red brick wall/i.test(sAll), `/assets find (${sAll.slice(0, 80)})`);
  ok(/wall/.test(await say('/assets tag #1 +wall +red')) && brick.tg.includes('wall'), '/assets tag adds tags');
  ok(Assets.search('#wall')[0] === brick, 'search by tag');
  ok(/★/.test(await say('/assets fav #1')) && brick.f, '/assets fav');
  ok(Assets.search('fav').length === 1, 'favorites filter');
  // the panel: typing filters the grid, a kind chip filters, Filters › Tag
  const q = AssetsUI.el.querySelector('.as-q');
  q.value = 'warm'; q.dispatchEvent(new Event('input'));
  ok(await until(() => AssetsUI.el.querySelectorAll('.as-card').length === 1, 2000), `typing filters the cards (${AssetsUI.el.querySelectorAll('.as-card').length})`);
  q.value = ''; q.dispatchEvent(new Event('input'));
  await wait(300);
  const chip = [...AssetsUI.el.querySelectorAll('.as-kind')].find((b) => b.textContent === '🔤');
  chip?.click(); await wait(100);
  ok(AssetsUI.el.querySelectorAll('.as-card').length === 1, 'the 🔤 chip shows the fonts');
  chip?.click();
  // right-click a card: the menu
  const card = AssetsUI.el.querySelector(`.as-card[data-h="${hdr.h}"]`);
  card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }));
  await wait(150);
  const menuText = document.getElementById('menu')?.textContent || '';
  ok(/Use in/.test(menuText) && /Favorite/.test(menuText) && /Tags/.test(menuText) && /Project/.test(menuText), `the card menu (${menuText.slice(0, 120)})`);
  hideMenu();

  // ---- 5. the virtualized grid: 3,000 cards, only a screenful in the page ----
  const fake = [];
  for (let i = 0; i < 3000; i += 1) { const h = `f${String(i).padStart(11, '0')}`; Assets.db.items[h] = { h, n: `fake texture ${i}`, p: `/nowhere/fake_${i}.png`, k: 'image', x: 'png', s: 1000, m: 1, src: 'file', a: 1, tg: ['fake'], t: -1 }; fake.push(h); }
  AssetsUI.refilter();
  await wait(200);
  const inDom = AssetsUI.el.querySelectorAll('.as-card').length;
  ok(inDom > 10 && inDom < 160, `3,010 assets, ${inDom} cards in the page`);
  const grid = AssetsUI.el.querySelector('.as-grid');
  const per = [];
  for (let i = 1; i <= 20; i += 1) { grid.scrollTop = i * 900; const t1 = performance.now(); AssetsUI._render(); per.push(performance.now() - t1); await new Promise((r) => requestAnimationFrame(r)); }
  per.sort((a, b) => a - b);
  out.renderMs = { median: +per[10].toFixed(2), max: +per[19].toFixed(2) };
  ok(per[10] < 8, `a scroll step paints a new screenful in ${per[10].toFixed(1)} ms (median)`);
  ok(AssetsUI.el.querySelectorAll('.as-card').length < 160, 'still a screenful after scrolling');
  ok(Assets._.queue().length <= 160, `only on-screen cards ask for pictures (${Assets._.queue().length} queued)`);
  for (const h of fake) delete Assets.db.items[h];
  Assets.changed('edit');
  AssetsUI.refilter();

  // ---- 6. drops on the Lab preview: model layer, the sky, a picture layer, a text layer ----
  activate('tool:three'); await ThreeLab.cmd();
  const D = ThreeLab.director;
  const host = ThreeLab.stageHooks?.host || document.querySelector('.three-preview');
  ok(host, 'the Lab preview is there');
  drop(host, glb.h);
  ok(await until(() => D.layers().layers.some((L) => /🧊 robot textured/.test(L.name)), 25000), `a GLB card dropped on the preview → a model layer (${D.layers().layers.map((L) => L.name).join(', ')})`);
  drop(host, hdr.h);
  ok(await until(() => /hdri:\s*refs\.\w+/.test(D.codeOf(D.layers().layers.find((L) => /🧊/.test(L.name)).id)?.code || ''), 15000), 'an HDR card dropped → the sky lighting the model');
  drop(host, brick.h);
  ok(await until(() => D.layers().layers.some((L) => /^🖼 red brick wall/.test(L.name)), 15000), 'a picture card → a 🖼 picture layer');
  const ft = await Assets.use(font, 'text', { words: 'ASSETS' });
  ok(/🔤/.test(ft) && await until(() => D.layers().layers.some((L) => /^🔤/.test(L.name)), 10000), `a font → a 🔤 text layer (${ft})`);
  const pic = D.layers().layers.find((L) => /^🖼/.test(L.name));
  ok(pic && /new Image\(\)/.test(D.codeOf(pic.id).code) && /refs\.\w+/.test(D.codeOf(pic.id).code), 'the picture layer reads the file as a scene reference');
  await wait(1500);
  const errs = (await HubBridge.call('three_console', {}))?.value;
  out.labConsole = JSON.stringify(errs || '').slice(0, 300);
  ok(!/did not load|SyntaxError|ReferenceError/.test(JSON.stringify(errs || '')), `no errors in the Lab (${out.labConsole})`);
  await shot('lab');
  // the preview's right-click has 🗂 Assets
  const lab = ThreeLab.lab;
  ok(typeof AssetsHooks.previewItem().items === 'function' && AssetsHooks.previewItem().items().some((x) => x && /asset library/.test(x.label || '')), 'the preview menu\'s 🗂 Assets');
  void lab;

  // ---- 7. the director: three_do asset ----
  const f1 = await HubBridge.call('three_do', { cmd: 'asset', op: 'find', q: 'kind:lut' });
  ok(f1?.ok && f1.value.found?.[0]?.name === 'Warm Film' && f1.value.found[0].id.length === 10, `three_do asset find (${JSON.stringify(f1).slice(0, 160)})`);
  const help = await HubBridge.call('three_do', { cmd: 'asset', op: 'help' });
  ok(help?.ok && /ASSET LIBRARY/.test(help.value), 'three_do asset help');
  const u1 = await HubBridge.call('three_do', { cmd: 'asset', op: 'use', id: shader.h.slice(0, 10) });
  ok(u1?.ok && /shader layer/.test(u1.value), `three_do asset use: a shader file → a ◇ layer (${JSON.stringify(u1).slice(0, 160)})`);

  // ---- 8. the board and a chat ----
  activate('tool:board'); await Lazy.load('board'); await Board.ready?.();
  await until(() => document.querySelector('.bd-root')?.offsetParent, 8000);
  const before = Board.items().length;
  drop(document.querySelector('.bd-root'), brick.h);
  ok(await until(() => Board.items().length === before + 1, 10000), `a card dropped on the board (${before} → ${Board.items().length})`);
  activate(C.id);
  await wait(300);
  const v = Native.view(C.id);
  drop(v.form || v.root, lut.h);
  ok(await until(() => (v.attachments || []).some((a) => /Warm Film/.test(a.name || a.path || '')) && /Warm Film \(LUT/.test(v.input?.value || ''), 6000), `a LUT card dropped in a chat: its picture attached + a line with its path (${JSON.stringify((v.attachments || []).map((a) => a.name || a.path))} · ${(v.input?.value || '').slice(0, 80)})`);
  drop(v.form || v.root, brick.h);
  ok(await until(() => (v.attachments || []).some((a) => /red_brick/.test(a.path || '')), 6000), 'a picture card is attached as the picture');

  // ---- 9. the free sources (fake Poly Haven / ambientCG) ----
  const st0 = await hub.assets.status();
  ok(st0.test, 'the fake sources are up (--fake-assets)');
  const fr = await say('/assets free sunset');
  ok(/Fake Sunset/.test(fr) && /sunset_fake/.test(fr), `/assets free sunset (${fr.slice(0, 120)})`);
  const g1 = await say('/assets get polyhaven sunset_fake 1k');
  const sky = Assets.all().find((x) => x.src === 'polyhaven' && x.k === 'hdri');
  ok(/in your assets/.test(g1) && sky && sky.i?.lic === 'CC0' && sky.tg.includes('sunset'), `a Poly Haven HDRI downloaded into the library (${g1})`);
  const tex = await AssetsFree.get({ source: 'polyhaven', id: 'brick_wall_02', type: 'textures', size: '1k' });
  ok(tex?.k === 'image' && tex.i?.maps?.normal && tex.i.maps.rough, `Poly Haven textures: the color map with its normal / rough maps (${JSON.stringify(tex?.i?.maps || {}).slice(0, 120)})`);
  const chair = await AssetsFree.get({ source: 'polyhaven', id: 'fake_chair', type: 'models', size: '1k' });
  ok(chair?.k === 'model' && /\.glb$/.test(chair.p), `a Poly Haven glTF arrives as one GLB (${chair?.p})`);
  const acgList = await AssetsFree.search('brick', { source: 'ambientcg', type: 'materials' });
  ok(acgList.length === 1 && acgList[0].sizes.join() === '1k,2k', `ambientCG search (${acgList.map((x) => x.id)})`);
  let progressSeen = 0;
  const mat = await AssetsFree.get({ source: 'ambientcg', id: 'Bricks076', type: 'materials', size: '1k', onProgress: () => { progressSeen += 1; } });
  ok(mat?.k === 'image' && /_Color\.jpg$/.test(mat.p) && mat.i?.maps?.normal && mat.i.maps.rough, `ambientCG: the zip unpacked, the color map indexed with its maps (${mat?.p})`);
  ok(progressSeen > 0, `download progress events (${progressSeen})`);
  // the Free tab: cards with cached previews, a click downloads
  await AssetsUI.open({ tab: 'free' });
  AssetsFree.view(AssetsUI.el.querySelector('.as-body'), { q: '', source: 'polyhaven', type: 'hdris' });
  ok(await until(() => AssetsUI.el.querySelectorAll('.as-free-grid .as-card').length === 2, 8000), 'the Free tab lists Poly Haven skies');
  ok(await until(() => AssetsUI.el.querySelector('.as-free-grid .as-card img'), 8000), 'their previews (cached from the source)');
  const studioCard = [...AssetsUI.el.querySelectorAll('.as-free-grid .as-card')].find((c) => /Fake Studio/.test(c.textContent));
  const nBefore = Assets.all().length;
  studioCard.click();
  ok(await until(() => Assets.all().some((x) => /studio_fake/.test(x.p) || (x.alt || []).some((p) => /studio_fake/.test(p))), 10000), `a click on a free card downloads it into the library (the same bytes as another sky: one asset, two places) ${Assets.all().length - nBefore}`);
  await shot('free');
  // the size remembered per type (2k for skies by default, 1k after the last 1k sky)
  ok(store.get('assets.size.hdris', null) === '2k' || store.get('assets.size.hdris', null) === '1k', 'the size choice is remembered');

  // ---- 10. app downloads join the library; small index ----
  Apps.emit('download', { id: 'x1', app: 'meshy', appName: 'Meshy', name: 'plain_triangle.glb', path: `${FIX}/plain_triangle.glb`, state: 'completed' });
  ok(await until(() => Assets.all().find((x) => /plain_triangle/.test(x.p))?.src === 'download', 4000), 'a finished app download is indexed (from Meshy)');
  await wait(900);
  const kv = await hub.kvGet('assets', null);
  out.kvBytes = JSON.stringify(kv).length;
  ok(kv && Object.keys(kv.items).length === Assets.all().length && out.kvBytes < 12000, `the index in kv is small (${out.kvBytes} bytes for ${Object.keys(kv?.items || {}).length} assets)`);
  ok(/assets:/.test(await say('/assets stats')), '/assets stats');
  out.count = Assets.all().length;
} catch (err) {
  fail.push(`threw: ${err.stack || err.message}`);
}
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
