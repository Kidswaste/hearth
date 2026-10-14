// 📜 Recipes (round 39, labrecipes), driven like the owner would: on one scene ✦ More › 📜 Recipes › ● Record a
// recipe (the red chip counts the steps), then a Glow filter from the effects picker with its strength moved, the
// "Glow amount" and "Background" sliders moved, "Speed" ♪ linked to the kick, the frame size 9:16 and a palette; ■ Stop
// on the chip → a name → data/recipes/<id>.json. A different scene ("Bloom" instead of "Glow amount", another Speed
// range, no Background color): the picker shows the steps, the one that doesn't fit skipped with its note; ▶ Use
// replays the rest as one change (the filter and its setting on the new layer, Bloom by role, the link's range moved,
// the frame, the palette; ◧ Before / after names it), one Undo puts everything back; editing (✕ a step, ↑ another)
// rewrites the file; ⇪ Share as a pack → Open → Add to my recipes; Delete → the Trash; /recipe for the AI; the ways in
// and nothing loaded before use.
//   node dev/smoke.js --check-timeout 300000 --save-dir /tmp/hearth-labrecipes-saves --script dev/checks/labrecipes.js --shot /tmp/labrecipes.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait } = SQL;
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(80); } return null; }; // (the value it waited for)
const lazyState = () => Lazy.state().find((g) => g.name === 'labrecipes')?.state;
const exists = async (p) => Boolean(await window.hub.fs.stat(p).catch(() => null));
const ctlOf = (id) => ThreeLab.stageHooks.ctlOf(id);
const val = (lid, key) => ctlOf(lid)?.controls().find((c) => c.key === key);

try {
  step('first screen: Recipes is not loaded (tier "use")', lazyState() === 'stub', lazyState());
  await SQL.lab();
  await until(() => typeof LabRecipesHook !== 'undefined', 15000);
  const d = ThreeLab.director; const S = ThreeLab.scenes; const cmd = await ThreeLab.cmd();
  const more = LabEasy.previewItem().items();
  const rc = more.find((x) => /Recipes/.test(x.label));
  const rows = rc?.items().map((x) => x.label) || [];
  step('✦ More › 📜 Recipes (● Record a recipe · Use a recipe… · Use on several scenes…) and the toolbar\'s ⋯ have it; still not loaded',
    rows.join('|') === '● Record a recipe|Use a recipe…|Use on several scenes…' && LabEasy.toolbarItems().some((r) => /Recipes/.test(r[0])) && lazyState() === 'stub', rows);

  // ---------- scene A: the one the steps are recorded on ----------
  const CODE_A = `const P = tweak({ glow: { value: 1.2, min: 0, max: 3, label: 'Glow amount', group: 'Look' }, speed: { value: 1, min: 0, max: 5, label: 'Speed' }, bg: { value: '#202020', label: 'Background' } });
const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d');
function f() { requestAnimationFrame(f); c.width = innerWidth; c.height = innerHeight; g.fillStyle = P.bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff'; const r = 20 + 30 * P.glow; g.beginPath(); g.arc(c.width / 2, c.height / 2, r, 0, 7); g.fill(); }
f();`;
  const A = S.create({ name: 'Recipe source', code: CODE_A, layers: [ThreeLayers.defaults({ id: 'main', name: 'Orb', code: CODE_A })], frame: '16:9', open: true });
  await until(() => S.currentId() === A.id, 6000);
  await until(() => val('main', 'glow'), 8000);
  await wait(800);

  // ---------- record ----------
  rc.items()[0].action();
  await until(() => LabRecipes?.state?.().recording, 15000);
  const chip = await until(() => document.querySelector('.rc-rec'), 4000);
  step('● Record a recipe loads Recipes and shows the red chip over the preview ("Recording · 0 steps")', chip && /Recording · 0 steps/.test(chip.textContent) && lazyState() === 'loaded' && LabRecipesHook.recording(), chip?.textContent);
  // 1. a filter from the effects picker, then its strength moved
  const glowIt = ThreeFX.items('filter').find((x) => x.id === 'glow');
  await ThreeFX.apply(glowIt);
  const gl = await until(() => d.layers().layers.find((L) => /^Glow/.test(L.name)), 8000);
  await until(() => val(gl.id, 'strength'), 8000);
  await wait(1000);
  d.sliders(gl.id, { strength: 2.2 });
  await wait(700);
  // 2. the Orb's sliders: glow and the background color
  d.selectLayer('main');
  await wait(300);
  d.sliders('main', { glow: 2.4 });
  await wait(300);
  d.sliders('main', { glow: 2.7 }); // the same slider again: one step with its last value
  await wait(300);
  d.sliders('main', { bg: '#3366ff' });
  await wait(700);
  // 3. ♪ Speed pulses on the kick, from 1 to 4
  ctlOf('main').link('speed', { band: 'kick', how: 'pulse', lo: 1, hi: 4, att: 0, dec: 0.2 });
  await wait(700);
  // 4. the frame size, 5. a palette
  cmd.size('9:16');
  await wait(400);
  d.refs.setPalette(['#ff3cac', '#784ba0', '#2b86c5']);
  await wait(900);
  const rec = LabRecipes.state().recording;
  const chipText = document.querySelector('.rc-rec .rc-count')?.textContent;
  step('the chip counts the steps captured: the filter, its strength (on the layer it made), Glow amount (once, its last value), Background, ♪ Speed, 9:16, the palette', rec?.steps.length === 7
    && /Filter: Glow/.test(rec.steps[0]) && /"Glow strength" → 2\.2 \(on the layer it made\)/.test(rec.steps[1]) && rec.steps.some((s) => /"Glow amount" → 2\.7/.test(s)) && !rec.steps.some((s) => /→ 2\.4/.test(s))
    && rec.steps.some((s) => /♪ "Speed" pulses on the kick/.test(s)) && rec.steps.some((s) => /Frame size 9:16/.test(s)) && rec.steps.some((s) => /^Palette/.test(s)) && chipText === 'Recording · 7 steps', { steps: rec?.steps, chipText });
  await smoke({ shot: '/tmp/labrecipes-chip.png' });

  // ---------- stop → a name → a file ----------
  document.querySelector('.rc-rec .rc-stop').click();
  const nameIn = await until(() => document.querySelector('dialog.ui-modal[open] input'), 6000);
  nameIn.value = 'Check recipe';
  nameIn.closest('form').requestSubmit();
  await until(() => LabRecipes.last.saved?.name === 'Check recipe', 8000);
  const r1 = LabRecipes.last.saved;
  const root = await LabRecipes.root();
  let json = null; try { json = JSON.parse(await window.hub.fs.read(`${root}/${r1.id}.json`)); } catch { /* none */ }
  step('■ Stop asks for a name and keeps it in the data folder (data/recipes/<id>.json, plain JSON); the chip goes', json?.format === 'hearth-recipe' && json.name === 'Check recipe' && json.steps.length === 7 && json.from === 'Recipe source'
    && !document.querySelector('.rc-rec') && !LabRecipesHook.recording(), { file: `${root}/${r1.id}.json`, kinds: json?.steps.map((s) => s.k) });

  // ---------- scene B: different sliders ----------
  const CODE_B = `const P = tweak({ bloom: { value: 0.2, min: 0, max: 1, label: 'Bloom', group: 'Look' }, speed: { value: 3, min: 0, max: 10, label: 'Speed' } });
const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d');
function f() { requestAnimationFrame(f); c.width = innerWidth; c.height = innerHeight; g.fillStyle = '#103020'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#ffe'; g.fillRect(c.width / 4, c.height / 3, c.width / 2 * (0.5 + P.bloom), c.height / 3); }
f();`;
  const B = S.create({ name: 'Recipe target', code: CODE_B, layers: [ThreeLayers.defaults({ id: 'tun', name: 'Tunnel', code: CODE_B })], frame: '1:1', open: true });
  await until(() => S.currentId() === B.id, 6000);
  await until(() => val('tun', 'bloom'), 8000);
  await wait(2500); // the scene's first time-machine version settles
  const pal0 = (d.refs.palette() || []).slice();

  // ---------- the picker: steps, what fits, the skipped one with its note ----------
  rc.items()[1].action();
  await until(() => document.querySelector('dialog.rc-dlg[open] .rc-step'), 8000);
  const stepRows = [...document.querySelectorAll('dialog.rc-dlg .rc-step')];
  const skipped = stepRows.filter((x) => x.classList.contains('rc-skip')).map((x) => x.textContent);
  const fitText = document.querySelector('dialog.rc-dlg .rc-fit')?.textContent;
  step('Use a recipe…: the picker lists it with its steps; "Background" is skipped here with a note, Glow amount → Bloom by its role', stepRows.length === 7 && skipped.length === 1 && /no slider like "Background" here/.test(skipped[0])
    && /6 of 7 steps fit "Recipe target"/.test(fitText) && stepRows.some((x) => /Bloom on Tunnel \(same role\)/.test(x.textContent)), { skipped, fitText });
  await smoke({ shot: '/tmp/labrecipes-picker.png' });

  // ---------- ▶ Use: one change ----------
  const layers0 = d.layers().layers.length;
  document.querySelector('dialog.rc-dlg .rc-use').click();
  await until(() => LabRecipes.last.replay, 30000);
  await wait(800);
  const res = LabRecipes.last.replay;
  const gl2 = d.layers().layers.find((L) => /^Glow/.test(L.name));
  const link = val('tun', 'speed')?.followsMusic;
  step('▶ Use replays it on this scene: the Glow filter with its strength, Bloom = 0.9 (2.7 of 0–3 → 0–1), Speed pulses on the kick with its range moved (1–4 of 0–5 → 2–8 of 0–10), 9:16, the palette; Background skipped with its note',
    res.applied === 6 && res.skipped.length === 1 && /Background/.test(res.skipped[0].why) && gl2 && val(gl2.id, 'strength')?.value === 2.2 && Math.abs(val('tun', 'bloom')?.value - 0.9) < 1e-6
    && link?.band === 'kick' && link?.how === 'pulse' && link?.lo === 2 && link?.hi === 8 && ThreeLab.stageHooks.size?.id === '9:16' && d.refs.palette().join() === '#ff3cac,#784ba0,#2b86c5' && d.layers().layers.length === layers0 + 1,
  { res, strength: gl2 && val(gl2.id, 'strength')?.value, bloom: val('tun', 'bloom')?.value, link, frame: ThreeLab.stageHooks.size?.id });
  await until(() => LabAB.state().pair, 6000);
  const ab = LabAB.state().pair;
  const tmList = await ThreeHistory.list(B.id);
  step('◧ Before / after sees the whole recipe as one change named after it; the time machine has its version', ab && /Recipe/.test(ab.label || ab.text) && tmList.some((v) => /📜 Recipe "Check recipe"/.test(v.label)), { ab, tm: tmList.slice(-3).map((v) => v.label) });

  // ---------- one Undo ----------
  await LabRecipes.undo();
  await wait(1200);
  step('one Undo puts it all back: no Glow layer, Bloom 0.2, Speed not linked, the frame 1:1, the palette as it was', d.layers().layers.length === layers0 && !d.layers().layers.some((L) => /^Glow/.test(L.name))
    && Math.abs(val('tun', 'bloom')?.value - 0.2) < 1e-6 && !val('tun', 'speed')?.followsMusic && ThreeLab.stageHooks.size?.id === '1:1' && (d.refs.palette() || []).join() === pal0.join(),
  { layers: d.layers().layers.map((L) => L.name), bloom: val('tun', 'bloom')?.value, link: val('tun', 'speed')?.followsMusic, frame: ThreeLab.stageHooks.size?.id, pal: d.refs.palette() });

  // ---------- edit: ✕ a step, ↑ another ----------
  await LabRecipes.open({ pick: r1.id });
  await until(() => document.querySelector('dialog.rc-dlg[open] .rc-step'), 8000);
  const bgRow = [...document.querySelectorAll('dialog.rc-dlg .rc-step')].find((x) => /Background/.test(x.textContent));
  bgRow.querySelector('.rc-del').click();
  await until(() => document.querySelectorAll('dialog.rc-dlg .rc-step').length === 6, 6000);
  const lastRow = [...document.querySelectorAll('dialog.rc-dlg .rc-step')].pop();
  const lastText = lastRow.querySelector('.rc-step-txt span').textContent;
  lastRow.querySelector('.rc-up').click();
  await wait(600);
  let json2 = null; try { json2 = JSON.parse(await window.hub.fs.read(`${root}/${r1.id}.json`)); } catch { /* none */ }
  const r1b = (await LabRecipes.list({ fresh: true })).find((x) => x.id === r1.id);
  step('editing in the picker: ✕ removes a step, ↑ moves one earlier; the file is rewritten; it all fits this scene now', json2?.steps.length === 6 && !json2.steps.some((s) => s.key === 'bg')
    && RecipeCore.describe(json2.steps[4]) === lastText && LabRecipes.planFor(r1b).every((p) => p.ok), { kinds: json2?.steps.map((s) => s.k), lastText });
  LabRecipes.close();

  // ---------- for the AI ----------
  const said = [];
  const aid = H.claudeAgent().id;
  await Commands.tryRun('/recipe list', aid, undefined, { source: 'code', say: (t) => said.push(String(t)) });
  await Commands.tryRun('/recipe show Check recipe', aid, undefined, { source: 'code', say: (t) => said.push(String(t)) });
  await Commands.tryRun('/recipe delete Check recipe', aid, undefined, { source: 'code', say: (t) => said.push(String(t)) });
  step('/recipe for the AI: list, show (its steps on this scene), and delete is refused (the owner\'s to do)', /"Check recipe" \(6 steps/.test(said[0] || '') && /1\. Filter: Glow/.test(said[1] || '') && /owner's to do/.test(said[2] || ''), said);

  // ---------- ⇪ Share as a pack → Open → Add to my recipes ----------
  const sharing = LabRecipes.share(r1b);
  await until(() => document.querySelector('dialog.pk-card[open] .pk-ok'), 15000);
  const saveCardText = document.querySelector('dialog.pk-card[open]')?.textContent || '';
  document.querySelector('dialog.pk-card[open] .pk-ok').click();
  const sh = await sharing;
  step('⇪ Share as a pack…: one .hearthpack of kind "recipe" (the card says "A recipe of 6 steps")', sh?.ok && /\.hearthpack$/.test(sh.path) && /A recipe of 6 steps/.test(saveCardText), { path: sh?.path, card: saveCardText.slice(0, 200) });
  const opening = LabPacks.openFile(sh.path);
  await until(() => document.querySelector('dialog.pk-card[open] .pk-ok'), 15000);
  const okLabel = document.querySelector('dialog.pk-card[open] .pk-ok')?.textContent;
  document.querySelector('dialog.pk-card[open] .pk-ok').click();
  await opening;
  const imp = LabPacks.last.imported;
  const all = await LabRecipes.list({ fresh: true });
  const r2 = all.find((x) => x.id === imp?.id);
  step('opening it: "Add to my recipes" → a second recipe with the same steps', okLabel === 'Add to my recipes' && r2 && r2.id !== r1.id && r2.steps.length === 6 && JSON.stringify(r2.steps.map((s) => s.k)) === JSON.stringify(r1b.steps.map((s) => s.k)), { okLabel, imp, names: all.map((x) => x.name) });

  // ---------- delete → the Trash ----------
  let rmErr = null;
  try { await LabRecipes.remove(r2); } catch (e) { rmErr = e.message; }
  const left = (await LabRecipes.list({ fresh: true })).map((x) => x.name);
  step('Delete moves the recipe\'s file to the Trash (the other one stays)', !rmErr && !(await exists(r2._file)) && left.includes('Check recipe') && !left.includes(r2.name), { rmErr, left });

  // ---------- several scenes ----------
  S.open(A.id);
  await until(() => S.currentId() === A.id, 6000);
  await wait(1200);
  const batch = await LabRecipes.useMany(r1b, [B.id]);
  await wait(600);
  step('Use on several scenes: the recipe runs on the ticked scenes one after another, then you\'re back where you were', batch.length === 1 && batch[0].applied === 6 && S.currentId() === A.id, batch);
  out.lazy = lazyState();
  out.errors = (window.__errors || []).slice(0, 5);
  // the picker on screen for the final picture
  S.open(B.id);
  await until(() => S.currentId() === B.id, 6000);
  await wait(800);
  await LabRecipes.open({ pick: r1.id });
  await wait(600);
} catch (e) { step('no exception', false, `${e.message}\n${e.stack}`); }
return JSON.stringify(out);
