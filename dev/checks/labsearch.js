// 🔎 Lab search (round 36, labsearch), driven like the owner would: nothing loaded before use; / in the Lab (a real key
// press) and the toolbar's 🔎 open it; typing "vertical video" letter by letter (each keystroke timed, < 16 ms) puts
// ▦ All formats first; Enter on an action runs the menu's own row (❚❚ Freeze), on a submenu opens it (Frame size); an
// effect is applied (VHS → a filter layer); a template opens its form; a layer is jumped to (selected, its row lit); a
// slider is shown in the sliders panel; nothing found → the last row puts the words in the director's box, not sent;
// the AI's /lab-search lists matches as text. Ends with the box open on "glow" for the screenshot.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/labsearch.js --shot /tmp/labsearch.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const lazyState = () => Lazy.state().find((g) => g.name === 'labsearch')?.state;
const dlg = () => document.querySelector('dialog.ls-dlg[open]');
const press = async (key, code, vk, text) => {
  for (const type of [text ? 'keyDown' : 'rawKeyDown', 'keyUp']) await Promise.race([smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(text && type !== 'keyUp' ? { text, unmodifiedText: text } : {}) } }), wait(3000)]);
};
// types into the box like the keyboard would, one letter at a time; each keystroke's time is the box's own measure
async function type(q, { clear = true } = {}) {
  const i = LabSearch.input();
  if (clear) { i.value = ''; i.dispatchEvent(new Event('input')); }
  const times = [];
  for (const ch of q) {
    i.value += ch;
    const t0 = performance.now();
    i.dispatchEvent(new Event('input'));
    times.push({ box: LabSearch.last.ms, all: Math.round((performance.now() - t0) * 100) / 100 });
  }
  return times;
}
const idx = (r) => LabSearch.results.findIndex((x) => x.id === r?.id);
const enter = () => LabSearch.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
async function openBox(how = 'button') {
  if (dlg()) LabSearch.close();
  if (how === 'button') document.querySelector('.ls-btn').click();
  else await LabSearchHook.open();
  return until(() => dlg(), 15000);
}

try {
  await until(() => typeof Lazy !== 'undefined' && lazyState(), 20000);
  step('first screen: Lab search is not loaded (tier "use")', lazyState() === 'stub', lazyState());
  await SQL.lab();
  await until(() => typeof LabSearchHook !== 'undefined' && document.querySelector('.ls-btn') && ThreeLab.search, 30000);
  const S = ThreeLab.scenes; const d = ThreeLab.director; const LS = () => ThreeLab.search;
  const btn = document.querySelector('.ls-btn');
  step('the toolbar has a small 🔎 next to ⋯; the keys sheet lists / for it; still not loaded', btn && btn.checkVisibility({ visibilityProperty: true }) && btn.nextElementSibling?.textContent === '⋯'
    && Keys.all().some((k) => k.area === 'Lab' && k.keys === '/') && lazyState() === 'stub', { next: btn?.nextElementSibling?.textContent });

  // ---------- a scene to search in ----------
  const ORB = 'const P = tweak({ glowAmount: { value: 1.2, min: 0, max: 3, label: \'Glow amount\' }, tint: \'#ff3cac\' });\nconst c = document.createElement(\'canvas\'); document.body.append(c);\n';
  const layers = [ThreeLayers.defaults({ id: 'bg', name: 'Backdrop', code: 'document.body.style.background = "#203040";' }), ThreeLayers.defaults({ id: 'orb', name: 'Search orb', code: ORB, slot: 1 })];
  const sc = S.create({ name: 'Search check', code: layers[0].code, layers, open: true });
  await until(() => S.currentId() === sc.id, 8000);
  d.selectLayer('Search orb');
  await wait(1500);

  // ---------- / opens it (a real key press in the Lab) ----------
  LS().pane.focus();
  await wait(100);
  await press('/', 'Slash', 191, '/');
  const viaKey = await until(() => dlg(), 15000);
  step('/ in the Lab opens the box (the group loads now), the / is not typed in it, the index is built', viaKey && lazyState() === 'loaded' && LabSearch.input().value === '' && document.activeElement === LabSearch.input(), { state: lazyState(), items: LabSearch.last.items, buildMs: LabSearch.last.buildMs, value: LabSearch.input()?.value });
  await press('Escape', 'Escape', 27);
  await until(() => !dlg(), 3000);
  step('Esc closes it', !dlg());
  step('the 🔎 button opens it too', await openBox('button'));
  await wait(1500); // (the box warms its search up in idle moments while you start typing)

  // ---------- typing: plain words, timed per keystroke ----------
  const t1 = await type('vertical video');
  const r1 = LabSearch.results;
  await until(() => LabSearch.results.some((r) => r.kind === 'gallery'), 15000); // the gallery joins a moment later
  const t2 = await type('make it brighter');
  const r2 = LabSearch.results;
  const t3 = await type('glwo');
  const r3 = LabSearch.results;
  const times = [...t1, ...t2, ...t3];
  const maxBox = Math.max(...times.map((t) => t.box)); const maxAll = Math.max(...times.map((t) => t.all));
  step('per keystroke on the full index: < 16 ms (search + the list)', maxAll < 16, { items: LabSearch.last.items, maxBox, maxAll, avg: Math.round((times.reduce((s, t) => s + t.all, 0) / times.length) * 100) / 100 });
  step('"vertical video" → ▦ All formats first (once: the same row in two menus is listed once), 9:16 in the list', /All formats/.test(r1[0]?.label) && !/All formats/.test(r1[1]?.label) && r1.some((r) => r.label === '9:16'), r1.slice(0, 4).map((r) => `${r.label} (${r.kind})`));
  step('"make it brighter" → Adjust (brightness) near the top', r2.slice(0, 5).some((r) => /Adjust/.test(r.label)), r2.slice(0, 5).map((r) => `${r.label} (${r.kind})`));
  step('"glwo" (a typo) → Glow first', /^Glow/.test(r3[0]?.label) && r3[0].kind === 'fx', r3.slice(0, 3).map((r) => `${r.label} (${r.kind})`));
  const glowRow = document.querySelector('.ls-row[data-kind="fx"] .fx-thumb, .ls-row[data-kind="fx"] .ls-pic');
  step('effects show their small picture (the picker\'s)', Boolean(glowRow));

  // ---------- an action: the menu's own row ----------
  const frozen0 = ThreeLab.stageHooks.frozen;
  await type('freeze');
  const fr = LabSearch.results[0];
  enter();
  await until(() => ThreeLab.stageHooks.frozen !== frozen0, 5000);
  step('"freeze" → the preview\'s ❚❚ Freeze row; Enter freezes the picture and closes the box', /Freeze/.test(fr?.label) && fr.kind === 'action' && /Right-click the preview/.test(fr.path) && ThreeLab.stageHooks.frozen === !frozen0 && !dlg(), fr);
  ThreeLab.stageHooks.setFreeze(frozen0);
  await openBox();
  await type('frame size');
  const fs = LabSearch.results.find((r) => r.kind === 'action');
  const fsIdx = idx(fs);
  await LabSearch.pick(fsIdx);
  await until(() => document.getElementById('menu')?.checkVisibility?.(), 3000);
  const menuRows = [...(document.getElementById('menu')?.querySelectorAll('button') || [])].map((b) => b.textContent.trim().slice(0, 12));
  step('a submenu row (Frame size) opens that menu', /Frame size/.test(fs?.label) && menuRows.some((t) => /9:16/.test(t)), { fs, menuRows: menuRows.slice(0, 6) });
  hideMenu();

  // ---------- an effect ----------
  const n0 = d.layers().layers.length;
  await openBox();
  await type('vhs');
  const vh = LabSearch.results.find((r) => r.kind === 'fx' && /^f:filter:/.test(r.id));
  const vhAt = idx(vh);
  await LabSearch.pick(vhAt);
  await until(() => d.layers().layers.length > n0, 8000);
  const names = d.layers().layers.map((L) => L.name);
  step('"vhs" → the VHS tape filter in the first 3 (the VHS palette has the exact name); Enter adds it as a layer (as the effects picker does)', vhAt >= 0 && vhAt < 3 && vh?.kind === 'fx' && /vhs/i.test(vh.label) && names.length === n0 + 1 && names.some((x) => /vhs/i.test(x)), { vh, names });

  // ---------- a layer: jump to it ----------
  await openBox();
  await type('backdrop');
  const bd = LabSearch.results.find((r) => r.kind === 'layer');
  await LabSearch.pick(idx(bd));
  await wait(300);
  const selNow = LS().layers().find((L) => L.selected)?.name;
  step('"backdrop" → the layer; Enter selects it and lights its row', bd && selNow === 'Backdrop' && Boolean(document.querySelector('.ly-row.ls-flash')), { bd, selNow });

  // ---------- a slider ----------
  d.selectLayer('Search orb'); await wait(600);
  await openBox();
  await type('glow amount');
  const sl = LabSearch.results.find((r) => r.kind === 'slider');
  await LabSearch.pick(idx(sl));
  await wait(500);
  const tws = [...document.querySelectorAll('.tw-search')].find((n) => n.checkVisibility?.({ visibilityProperty: true }));
  step('"glow amount" → the slider; Enter shows it in the sliders panel', sl && tws?.value === 'Glow amount', { sl, search: tws?.value });

  // ---------- a template: its form ----------
  await Lazy.load('labtemplates');
  await LabTemplates.saveCurrent({ name: 'Search check template' });
  await LabTemplates.list({ fresh: true });
  await openBox();
  await until(() => LabSearch.find('search check template').some((r) => r.item.kind === 'template'), 10000);
  await type('search check templ');
  const tp = LabSearch.results.find((r) => r.kind === 'template');
  await LabSearch.pick(idx(tp));
  const formOpen = await until(() => document.querySelector('dialog.lt-form[open]'), 10000);
  step('a template → Enter opens its form (My templates)', tp && formOpen, { tp, rank: idx(tp) });
  LabTemplates.closeForm?.();
  await wait(300);

  // ---------- gallery and recent scenes are in the list ----------
  await openBox();
  await type('tunnel');
  const gl = LabSearch.results.find((r) => r.kind === 'gallery');
  await type('search check');
  step('gallery starting points and help are found too', Boolean(gl) && LabSearch.find('how do i render').some((r) => r.item.kind === 'help'), { gl });

  // ---------- nothing found: the director's box, not sent ----------
  const words = 'qwzx flurbo spinning cathedral';
  await type(words);
  const rs = LabSearch.results;
  step('nothing found → one row: "Ask the director: <your words>"', rs.length === 1 && rs[0].kind === 'ask' && rs[0].label === `Ask the director: ${words}`, rs.map((r) => r.label));
  enter();
  await until(() => LabSearch.last.asked, 15000);
  await wait(1200);
  const box = [...document.querySelectorAll('.composer textarea')].find((t) => t.value === words);
  step('Enter puts the words in the director\'s box, not sent (still there a moment later)', LabSearch.last.asked?.filled && Boolean(box), LabSearch.last.asked);
  if (box) { box.value = ''; box.dispatchEvent(new Event('input')); }

  // ---------- the AI's way ----------
  const said = await Commands.get('lab-search').run('glow', { source: 'code' });
  step('/lab-search glow (an AI) → the matches as text', /Glow/.test(said) && said.split('\n').length >= 3, said.split('\n').slice(0, 3));
  step('no errors from Lab search in the console', !(window.__smokeErrors || []).some((e) => /LabSearch|three-search/.test(String(e))));

  // ---------- the picture ----------
  await openBox();
  await type('glow');
  await wait(400);
} catch (err) {
  step(`threw: ${err.message}`, false, String(err.stack || '').split('\n').slice(0, 3));
}
out.ok = out.steps.every((s) => s.ok);
return JSON.stringify(out, null, 1);
