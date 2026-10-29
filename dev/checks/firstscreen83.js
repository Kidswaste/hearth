// (round 83, firstscreen83) The dialogs split off first-screen files (appui-dialogs.js, meter-dash.js,
// sync-conflicts.js) open through their old names, both when their group is already in (an idle moment after the
// first screen) and when it is still a stand-in (the first one opened loads it): Settings, Downloads, Recently deleted
// chats, Backups, the old usage list, the Usage dashboard (each tab, Ctrl+Shift+U opens and closes it), Sync's
// conflicts and Deleted files.
//   node dev/smoke.js --script dev/checks/firstscreen83.js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = []; const bad = [];
const ok = (c, m) => { (c ? out : bad).push(m); };
const closeAll = async () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); await sleep(60); };
const state = (g) => Lazy.state().find((x) => x.name === g)?.state;
async function round(label) {
  const before = { appdialogs: state('appdialogs'), meterdash: state('meterdash'), syncconflicts: state('syncconflicts') };
  await AppUI.openSettings();
  const s = document.querySelector('dialog.settings-dialog[open]');
  ok(s && s.querySelectorAll('.settings-section').length > 3 && s.querySelector('.sf-search, input[type=search]'), `${label}: Settings opens with its sections and search (${s?.querySelectorAll('.settings-section').length} sections)`);
  // the look row names the look (THEMES from appui.js), the Backups… button opens Backups
  ok(s && /Backups…/.test(s.textContent), `${label}: Settings has Backups…`);
  await closeAll();
  ok(await AppUI.downloadsDialog() && document.querySelector('dialog.downloads-dialog[open] .download-list'), `${label}: Downloads opens`);
  await closeAll();
  ok(await AppUI.trashDialog() && document.querySelector('dialog.trash-dialog[open]'), `${label}: Recently deleted chats opens`);
  await closeAll();
  const b = await AppUI.backupsDialog();
  ok(b && document.querySelector('dialog[open]'), `${label}: Backups opens`);
  await closeAll();
  await Meter.dashboard('budgets');
  const m = document.querySelector('dialog.meter-dlg[open]');
  ok(m && m.querySelector('.mt-budgets') && m.querySelectorAll('.mt-kpi').length >= 4, `${label}: the Usage dashboard opens at Budgets with its tiles`);
  for (const t of ['overview', 'agents', 'models', 'tools', 'chats', 'features', 'export']) {
    m?.querySelector(`.mt-tabs button[data-t="${t}"]`)?.click(); await sleep(30);
    ok(m?.querySelector('.mt-pane')?.childElementCount > 0, `${label}: dashboard tab ${t} draws`);
  }
  ok(m?.querySelector('.mt-pane canvas, .mt-pane table, .mt-pane p'), `${label}: a chart / table / note in the pane`);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'U', ctrlKey: true, shiftKey: true, bubbles: true }));
  await sleep(80);
  ok(!document.querySelector('dialog.meter-dlg[open]'), `${label}: Ctrl+Shift+U closes the open dashboard`);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'U', ctrlKey: true, shiftKey: true, bubbles: true }));
  for (let i = 0; i < 30 && !document.querySelector('dialog.meter-dlg[open]'); i++) await sleep(100);
  ok(document.querySelector('dialog.meter-dlg[open]'), `${label}: Ctrl+Shift+U opens it again`);
  await closeAll();
  await AppUI.usageDialog();
  ok(document.querySelector('dialog.meter-dlg[open]'), `${label}: the old usage entry opens the dashboard`);
  await closeAll();
  await Sync.conflicts();
  ok(document.querySelector('dialog.sync-conflicts[open]'), `${label}: Sync conflicts opens`);
  await closeAll();
  await Sync.trash();
  ok(document.querySelector('dialog.sync-list[open]') && /Deleted files/.test(document.querySelector('dialog.sync-list[open]').textContent), `${label}: Sync Deleted files opens`);
  await closeAll();
  ok(typeof Sync.whatIs({ rel: 'kv/notes.json' }) === 'string' && Sync.held() === null, `${label}: Sync.whatIs / held() stay synchronous`);
  await closeAll();
  return before;
}
// 1. the groups loaded in idle moments after the first screen (the usual case)
const before = await round('loaded');
ok(Object.values(before).every((s) => s === 'loaded'), `groups in before the first open: ${JSON.stringify(before)}`);
// 2. after a reload with every group held back: the first open of each loads its group
localStorage.setItem('fs83.round', round.toString());
localStorage.setItem('fs83.part1', JSON.stringify({ out, bad }));
localStorage.setItem('lazy.hold', '1');
return `part 1: ${bad.length ? `FAIL ${bad.length}` : 'PASS'} ${out.length} ok`;
//@@ reload
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { out, bad } = JSON.parse(localStorage.getItem('fs83.part1'));
const ok = (c, m) => { (c ? out : bad).push(m); };
const closeAll = async () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); await sleep(60); };
const state = (g) => Lazy.state().find((x) => x.name === g)?.state;
const round = eval(`(${localStorage.getItem('fs83.round')})`); // eslint-disable-line no-eval
localStorage.removeItem('lazy.hold');
const before = await round('stand-in');
ok(Object.values(before).every((s) => s === 'stub'), `groups held before the first open: ${JSON.stringify(before)}`);
ok(Lazy.misses().filter((x) => ['AppUIDialogs', 'MeterDash', 'SyncConflicts'].includes(x.name)).length === 0, 'no global touched before its group');
localStorage.removeItem('fs83.round'); localStorage.removeItem('fs83.part1');
return `${bad.length ? `FAIL ${bad.length}\n✖ ${bad.join('\n✖ ')}\n` : 'PASS '}${out.length} ok\n${out.join('\n')}`;
