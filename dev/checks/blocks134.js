// (round 134, blocks134) 🧩 Effect building blocks (docs/upgrades/blocks134.md), in one check, by clicks where it can:
//   1. ⋯ › 🧩 Blocks opens the folded card: 12 blocks, each with a LIVE thumbnail (drawn on the backstage stage, again
//      and again while the card is open) and a one-line description
//   2. a generator (Noise field) is added as its own layer above the selected one, in the scene's palette; ONE
//      Ctrl/⌘+Z takes it away; an effect (Bloom) is added as a filter layer above the selected one; ONE Ctrl/⌘+Z
//   3. a chain of three, dragged into a new order (the layers follow); ONE Ctrl/⌘+Z puts the order back
//   4. 💾 Save as my block: kept in kv three-blocks, listed under Mine with its own thumbnail; a click on it adds the
//      chain again (one undo)
//   5. nothing was sent to any AI so far; ✦ Combine for me shows the cost first (on the button and in the confirm,
//      Cancel: nothing sent); OK sends ONE message; the fake director answers with ONE three_do blocks call (4 blocks,
//      its slider values); ONE Ctrl/⌘+Z takes the whole combination away
// Only the check's own temp data (smoke.js); never an owner's scene.
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/blocks134.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane && ThreeLab.groupsHost, 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks; const d = ThreeLab.director;
  const sent = [];
  const send0 = Native.send.bind(Native); Native.send = (...a) => { sent.push(String(a[1] || '').slice(0, 60)); return send0(...a); };
  const CODE = "import * as THREE from 'three';\nconst P = tweak({ glow: [0.5, 0, 2] });\nconst renderer = new THREE.WebGLRenderer({ alpha: true });\nrenderer.setSize(innerWidth, innerHeight);\ndocument.body.append(renderer.domElement);\nrenderer.setAnimationLoop(() => renderer.clear());";
  const sk = SC.create({ name: 'Blocks check', code: CODE, layers: [ThreeLayers.defaults({ id: 'bkBase', name: 'Base', code: CODE, slot: 0 })], frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id && hk.layers().length === 1, 20000);
  const PAL = ['#0b1e3f', '#1fa2ff', '#ffd75e'];
  d.refs.setPalette(PAL);
  const names = () => hk.layers().map((L) => L.name);
  const zKey = async () => { hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true })); await wait(1200); };
  const clickAdd = async (node) => { const b0 = LabBlocks.stats.built; node.click(); await until(() => LabBlocks.stats.built > b0, 20000); }; // (the undo step is noted once every block has run)
  const layerCode = (name) => ThreeLab.groupsHost.layers().find((L) => L.name === name)?.code || '';

  // ---------- 1. the card from ⋯, live thumbnails ----------
  const row = LabEasy.toolbarItems().find((r) => r[0] === '🧩 Blocks');
  row?.[2]();
  const pop = await until(() => document.querySelector('.bk-pop'), 10000);
  const tiles = () => [...document.querySelectorAll('.bk-pop .bk-tile:not(.bk-mine)')];
  await until(() => tiles().length === 12 && tiles().every((t) => /^data:image/.test(t.querySelector('img')?.src || '')), 150000);
  await until(() => tiles().some((t) => Number(t.querySelector('img')?.dataset.n) >= 2), 120000);
  const t1 = tiles();
  step('⋯ › 🧩 Blocks opens the card: 12 blocks, each with a live thumbnail (drawn again while open) and one line', Boolean(row && pop) && t1.length === 12 && t1.every((t) => /^data:image/.test(t.querySelector('img').src) && t.querySelector('.bk-desc')?.textContent.length > 8) && t1.some((t) => Number(t.querySelector('img').dataset.n) >= 2),
    { row: Boolean(row), tiles: t1.length, drawn: t1.map((t) => `${t.dataset.id}:${t.querySelector('img').dataset.n || 0}`).join(' '), thumbs: LabBlocks.stats.thumbs });
  await smoke({ shot: '/tmp/blocks134-card.png' }).catch(() => {});

  // ---------- 2. a generator, then a filter: each one Undo ----------
  const tile = (id) => document.querySelector(`.bk-pop .bk-tile[data-id="${id}"]`);
  ThreeLab.groupsHost.select('bkBase');
  await clickAdd(tile('noise'));
  await until(() => names().includes('🧩 Noise field'), 10000);
  const nc = layerCode('🧩 Noise field');
  step('a click on Noise field adds it as its own layer above the selected one, in the scene\'s palette', JSON.stringify(names()) === JSON.stringify(['Base', '🧩 Noise field']) && /shader\(/.test(nc) && nc.includes(PAL[0]) && nc.includes(PAL[2]), { layers: names(), palette: PAL.filter((c) => nc.includes(c)) });
  await zKey(); await until(() => names().length === 1, 6000);
  step('…ONE Ctrl/⌘+Z takes it away', JSON.stringify(names()) === '["Base"]', names());
  ThreeLab.groupsHost.select('bkBase');
  await clickAdd(tile('bloom'));
  await until(() => names().includes('🧩 Bloom / glow'), 10000);
  step('a click on Bloom adds a filter layer above the selected one', JSON.stringify(names()) === JSON.stringify(['Base', '🧩 Bloom / glow']) && ThreeLayers.isFilter(layerCode('🧩 Bloom / glow')), names());
  await zKey(); await until(() => names().length === 1, 6000);
  step('…ONE Ctrl/⌘+Z takes it away', JSON.stringify(names()) === '["Base"]', names());

  // ---------- 3. a chain, reordered by drag: one undo ----------
  ThreeLab.groupsHost.select('bkBase');
  for (const id of ['noise', 'bloom', 'grain']) { const n = names().length; await clickAdd(tile(id)); await until(() => names().length === n + 1, 10000); }
  const c3 = names();
  await until(() => document.querySelectorAll('.bk-pop .bk-row').length === 3, 5000);
  const rowOf = (txt) => [...document.querySelectorAll('.bk-pop .bk-row')].find((r) => r.textContent.includes(txt));
  const dt = new DataTransfer();
  rowOf('Grain').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  rowOf('Noise field').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  rowOf('Noise field').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  await until(() => JSON.stringify(names()) !== JSON.stringify(c3), 6000);
  const c3b = names();
  step('a chain of three; dragging Grain onto Noise field puts it at the bottom of the chain', JSON.stringify(c3) === JSON.stringify(['Base', '🧩 Noise field', '🧩 Bloom / glow', '🧩 Grain / film']) && JSON.stringify(c3b) === JSON.stringify(['Base', '🧩 Grain / film', '🧩 Noise field', '🧩 Bloom / glow']), { was: c3, now: c3b });
  await zKey(); await until(() => JSON.stringify(names()) === JSON.stringify(c3), 6000);
  step('…ONE Ctrl/⌘+Z puts the order back', JSON.stringify(names()) === JSON.stringify(c3), names());

  // ---------- 4. 💾 save as my block ----------
  document.querySelector('.bk-pop .bk-save')?.click();
  const dlg = await until(() => document.querySelector('dialog[open] input'), 5000);
  if (dlg) { dlg.value = 'Glow chain'; dlg.dispatchEvent(new Event('input', { bubbles: true })); [...dlg.closest('dialog').querySelectorAll('button')].find((b) => b.textContent.trim() === 'OK')?.click(); }
  await until(() => LabBlocks.stats.saved === 1, 6000);
  const kv = await window.hub.kvGet('three-blocks', null);
  const mineTile = await until(() => document.querySelector('.bk-pop .bk-mine'), 6000);
  await until(() => /^data:image/.test(document.querySelector('.bk-pop .bk-mine img')?.src || ''), 90000);
  step('💾 Save as my block: kept in kv three-blocks (it syncs) and listed under Mine with its own thumbnail', kv?.blocks?.[0]?.name === 'Glow chain' && kv.blocks[0].chain.map((s) => s.block).join() === 'noise,bloom,grain' && Boolean(mineTile) && /^data:image/.test(document.querySelector('.bk-pop .bk-mine img')?.src || ''), { kv: kv?.blocks?.map((b) => `${b.id}: ${b.chain.map((s) => s.block).join('→')}`), tile: mineTile?.textContent });
  const n4 = names().length;
  await clickAdd(document.querySelector('.bk-pop .bk-mine'));
  await until(() => names().length === n4 + 3, 15000);
  const n4b = names().length;
  await zKey(); await until(() => names().length === n4, 6000);
  step('…a click on it adds the whole chain (3 layers), ONE Ctrl/⌘+Z takes them away', n4b === n4 + 3 && names().length === n4, { before: n4, after: n4b, undone: names().length });

  // ---------- 5. ✦ Combine for me: cost first, one message, one undo ----------
  step('nothing was sent to any AI so far (thumbnails, adds, reorder, save)', sent.length === 0, sent);
  document.querySelector('.bk-pop .bk-combine')?.click();
  await until(() => document.querySelector('.bk-pop .bk-mood'), 3000);
  const mood = document.querySelector('.bk-pop .bk-mood');
  mood.value = 'dreamy underwater pulse'; mood.dispatchEvent(new Event('input', { bubbles: true }));
  const go = await until(() => { const b = document.querySelector('.bk-pop .bk-go'); return b && /tokens/.test(b.textContent) ? b : null; }, 6000);
  const goText = go?.textContent || '';
  go?.click();
  const cd = await until(() => [...document.querySelectorAll('dialog[open]')].find((x) => /tokens/.test(x.textContent)), 5000);
  const cdText = cd?.textContent || '';
  [...(cd?.querySelectorAll('button') || [])].find((x) => /Cancel/i.test(x.textContent))?.click();
  await wait(400);
  step('✦ Combine for me shows the cost first (on the button and in the confirm); Cancel sends nothing', /≈[\d,]+ tokens/.test(goText) && /≈[\d,]+ tokens/.test(cdText) && sent.length === 0 && LabBlocks.stats.asked === 0, { button: goText, confirm: cdText.replace(/\s+/g, ' ').slice(0, 140) });
  Native.newChat(agent.id); await wait(600);
  const chatId = H.activeChat[agent.id];
  ChatScenes.link(chatId, sk.id, { rename: false });
  if (SC.currentId() !== sk.id) SC.open(sk.id);
  await until(() => SC.currentId() === sk.id, 20000);
  if (!LabBlocks.isOpen()) await LabBlocks.open();
  const b5 = names();
  if (!document.querySelector('.bk-pop .bk-mood')) document.querySelector('.bk-pop .bk-combine')?.click();
  await until(() => document.querySelector('.bk-pop .bk-go'), 3000);
  document.querySelector('.bk-pop .bk-mood').value = 'dreamy underwater pulse';
  document.querySelector('.bk-pop .bk-go').click();
  const cd2 = await until(() => [...document.querySelectorAll('dialog[open]')].find((x) => /tokens/.test(x.textContent)), 5000);
  [...(cd2?.querySelectorAll('button') || [])].find((x) => /^Combine/.test(x.textContent.trim()))?.click();
  await until(() => !Native.isBusy(chatId) && Native.current(agent.id)?.messages.at(-1)?.role === 'assistant', 120000);
  await until(() => names().length === b5.length + 4, 20000);
  const b5b = names();
  const disp = ThreeLab.groupsHost.layers().find((L) => /^🧩 Displacement/.test(L.name));
  step('OK sends ONE message; the fake director builds 4 blocks with ONE three_do blocks call, its slider values kept', sent.length === 1 && b5b.length === b5.length + 4 && ['Noise field', 'Displacement', 'Bloom', 'Beat strobe'].every((w) => b5b.some((x) => x.includes(w))) && LabBlocks.stats.aiBuilt === 1 && /amount: \{ value: 2\.1\b/.test(disp?.code || ''),
    { sent: sent.length, layers: b5b.slice(-5), reply: String(Native.current(agent.id)?.messages.at(-1)?.text || '').slice(0, 120) });
  await zKey(); await until(() => names().length === b5.length, 8000);
  step('…and the whole combination is ONE undo step (one Ctrl/⌘+Z)', JSON.stringify(names()) === JSON.stringify(b5), names());
  LabBlocks.close();
  step('closing the card ends its stage (nothing runs while it is folded)', !LabBlocks.isOpen() && !document.querySelector('.bk-pop'));
  await smoke({ shot: '/tmp/blocks134.png' }).catch(() => {});
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 500));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
