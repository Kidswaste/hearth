// Tidy (round 18): the app's surfaces read as one. Settings: a search filters every row (More settings opens when a
// match is inside), every switch shows its cost and runs its own command (state read back), /settings <words> opens it
// filtered; menus: deletes last and red, after a line; file rows in one order and wording; the rail: Ctrl+N walks
// agents then tools and each tooltip names its key; the rail ⋯ lists hidden tools; Ctrl+K with nothing typed is a
// short list; the Commands page: Principal first, Studio + Discover one compact row.
//   node dev/smoke.js --script dev/checks/tidy.js --shot /tmp/tidy.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {}; const fail = [];
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const visRows = (root) => [...root.querySelectorAll('.sf-row')].filter((r) => r.checkVisibility({ contentVisibilityAuto: true })); // (a folded <details> hides its rows too)
await wait(1500);
try {
  // ---- Settings ----
  await AppUI.openSettings(); await wait(500);
  const dlg = document.querySelector('dialog.settings-dialog[open]');
  ok(dlg?.querySelector('.sf-search'), 'Settings has a search field');
  out.switches = dlg.querySelectorAll('.sf-row').length;
  ok(out.switches >= 20 && visRows(dlg).length < out.switches, `switches, the rare ones folded (${visRows(dlg).length} of ${out.switches} shown)`);
  ok([...dlg.querySelectorAll('.sf-row')].every((r) => r.querySelector('.sf-cost') && r.querySelector('code')), 'each switch says its cost and its command');
  const inp = dlg.querySelector('.sf-search');
  const search = async (q) => { inp.value = q; inp.dispatchEvent(new Event('input')); await wait(120); };
  await search('tokens');
  out.tokens = visRows(dlg).map((r) => r.querySelector('code').textContent);
  ok(out.tokens.includes('/board-tools') && out.tokens.includes('/deploy-tools') && dlg.querySelector('details.settings-more').open, `"tokens" finds the costly switches, More opens (${out.tokens})`);
  await search('hotkey');
  ok([...dlg.querySelectorAll('.settings-section')].filter((s) => !s.hidden).map((s) => s.querySelector('h3').textContent).join() === 'Startup and tray', '"hotkey" finds the field in More settings');
  await search('zzqq'); ok(!dlg.querySelector('.sf-none').hidden, 'nothing matches: one line says so');
  await search('');
  const row = (re) => [...dlg.querySelectorAll('.sf-row')].find((r) => re.test(r.dataset.find));
  const chime = row(/chime/);
  chime.querySelector('[data-v="on"]').click(); await wait(300);
  ok(store.get('chat.chime', false) === true && chime.querySelector('.on')?.dataset.v === 'on', 'a switch runs its command and shows the new state');
  chime.querySelector('[data-v="off"]').click(); await wait(300);
  ok(store.get('chat.chime', true) === false, 'and back off');
  dlg.close(); await wait(150);
  await Commands.tryRun('/settings rail', H.claudeAgent().id); await wait(600);
  const d2 = document.querySelector('dialog.settings-dialog[open]');
  ok(d2?.querySelector('.sf-search').value === 'rail' && [...d2.querySelectorAll('.settings-section')].some((s) => !s.hidden && /rail/i.test(s.textContent)), '/settings rail opens it filtered');
  d2?.close();

  // ---- menus ----
  showMenu(100, 100, [{ label: 'Open', action() {} }, { label: 'Move to the Trash', action() {} }, { label: 'Rename', action() {} }, { label: 'x', more: true, action() {} }, { label: 'y', more: true, action() {} }]);
  await wait(80);
  out.menu = [...document.querySelectorAll('#menu > *')].map((n) => (n.classList.contains('menu-sep') ? '-' : `${n.firstChild?.textContent}${n.classList.contains('danger') ? '!' : ''}`));
  ok(out.menu.join('|') === 'Open|Rename|More…|-|Move to the Trash!', `deletes go last, red, after a line, More… above it (${out.menu.join(' | ')})`);
  hideMenu();
  ok(MediaFile.items('/x/y.mp4').map((i) => i.label).join('|') === `Open|${MediaFile.revealLabel}|Copy path`, 'file rows: Open, Reveal, Copy path');

  // ---- the rail ----
  const titles = [...document.querySelectorAll('#agent-buttons .agent-btn')].map((b) => b.title);
  out.rail = titles;
  ok(titles.every((t, i) => i > 8 || new RegExp(`(Ctrl|⌘)\\+?${i + 1}\\b`).test(t)), `every rail tooltip names its key (${titles})`);
  const lab = H.railOrder().indexOf('tool:three');
  if (lab >= 0 && lab < 9) { activate(H.claudeAgent().id); await wait(200); handleShortcut({ key: String(lab + 1) }); await wait(800); ok(H.surfaceIdFor(H.activeId) === 'tool:three', `Ctrl+${lab + 1} opens the Lab`); activate(H.claudeAgent().id); await wait(300); }
  const more = Simplify.moreItems().filter((x) => typeof x === 'object');
  ok(more.length >= 6 && more.every((x) => x.icon && !/^[^\p{L}]/u.test(x.label)), `the rail ⋯ uses the icon set (${more.map((x) => x.label).slice(0, 4)})`);

  // ---- Ctrl+K ----
  AppUI.palette(); await wait(300);
  out.palette = document.querySelectorAll('.palette-item').length;
  ok(out.palette > 0 && out.palette <= 30, `Ctrl+K with nothing typed: a short list (${out.palette})`);
  const pi = document.querySelector('.palette-input'); pi.value = 'lab'; pi.dispatchEvent(new Event('input')); await wait(150);
  ok(document.querySelectorAll('.palette-item').length > 10, 'typing searches everything');
  document.querySelector('.palette')?.remove();

  // ---- the Commands page ----
  CmdPage.open(); await wait(1200);
  out.heads = [...document.querySelectorAll('.cp-head')].map((h) => h.textContent).slice(0, 6);
  ok(out.heads[0] === 'Principal', `Principal first (${out.heads})`);
  const chips = document.querySelector('.cp-sec.cp-compact');
  ok(chips && chips.querySelector('[data-ext^="studio:"]') && chips.querySelector('[data-ext="tour:discover"]'), 'Studio and Discover share one compact row');
} catch (err) { fail.push(`threw: ${err.stack || err.message}`); }
out.problems = fail; out.ok = !fail.length;
return JSON.stringify(out, null, 1);
