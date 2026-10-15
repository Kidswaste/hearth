// 💾 Automatic backups (round 45, backupauto), on a throwaway copy of the app (its own Documents folder under the test's
// save folder; never the real one), driven like the owner would:
//  1. an automatic backup waits while rendering and on a low battery, then runs when the computer is idle; it is checked,
//     and "Last backup: just now ✓" shows in Settings › This computer & sync
//  2. Settings › Backups: the backup by date with what's inside (3 scenes · 2 chats…), Restore missing things, Show in
//     Finder / Explorer; never a folder inside the data folder
//  3. the rotation trims: two weeks of daily backups on a moving clock leave fewer, the newest kept
//  4. a damaged zip is reported (Check again, the ⚠ row) and tidied once a good one follows; a backup whose check fails says why in
//     plain words with Retry (Settings line + dialog), and Retry works
//  5. Restore missing things merges a deleted scene (and a deleted chat) back; a "before a restore" backup comes first
//  6. /backup status, the calm note after 3 days without a good backup
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/backupauto.js --shot /tmp/backupauto.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await wait(150); } };
const read = async (p) => { try { return JSON.parse(await window.hub.fs.read(p)); } catch { return null; } };
const DAY = 864e5;
const T = (o) => window.hub.backupauto.test(o);
const sc = (id, name) => ({ id, name, code: `// ${name}\nexport default {};`, updatedAt: Date.now() - 3600e3 });

try {
  const info = await window.hub.reach.info();
  const D = info.dataDir;
  await until(() => typeof BackupAuto !== 'undefined', 20000);
  step('the backups part loads right after the first screen', typeof BackupAuto !== 'undefined');
  // throwaway things to back up
  await window.hub.kvSet('three-sketches', [sc('bas1', 'Orb'), sc('bas2', 'Waves'), sc('bas3', 'Tunnel')]);
  const now = Date.now();
  await window.hub.saveChat({ id: 'claude-ba1', agentId: 'claude', title: 'Backup test one', messages: [{ role: 'user', text: 'hi', at: now }], updatedAt: now });
  await window.hub.saveChat({ id: 'claude-ba2', agentId: 'claude', title: 'Backup test two', messages: [{ role: 'user', text: 'yo', at: now }], updatedAt: now });
  await window.hub.saveMemory({ shared: 'likes teal\nworks to music', agents: {} });
  const nChats = (await window.hub.listChats()).filter((c) => !c.unreadable).length;

  // ---------- 1. automatic, on powerwise's schedule ----------
  const s0 = await T({ auto: true, before: true, idle: 600000 });
  step('on by default, nothing yet, in this computer\'s Documents', s0.state.auto && !s0.state.lastOk && /Documents[\\/]Hearth backups$/.test(s0.state.dir), s0.state);
  const tok = await window.hub.power.hold('render');
  const d1 = await T({ tick: true });
  step('never while rendering', d1.decision?.why === 'busy:render' && !d1.state.running, d1.decision);
  await window.hub.power.release(tok);
  await window.hub.power.test({ battery: true });
  const d2 = await T({ tick: true, battery: { level: 0.25, charging: false } });
  step('never on battery below 40 %', d2.decision?.why === 'battery', d2.decision);
  await window.hub.power.test({ battery: false });
  await wait(300);
  const d3 = await T({ tick: true, idle: 5000 });
  step('waits while the computer is in use', d3.decision?.why === 'not idle', d3.decision);
  const d4 = await T({ tick: true, idle: 600000 });
  step('runs when the computer is idle', d4.decision?.go === true, d4.decision);
  const r1 = (await T({ wait: true })).result;
  step('the automatic backup worked and was checked', r1?.ok && r1.counts?.scenes === 3 && r1.counts?.chats === nChats, r1);
  const st1 = await window.hub.backupauto.state();
  step('remembered: last backup, automatic', st1.lastOk > 0 && st1.last?.ok && st1.last.reason === 'auto', st1.last);
  await AppUI.openSettings();
  const line = await until(() => { const l = document.querySelector('.ba-line'); return l && /Last backup: just now ✓/.test(l.textContent) ? l : null; }, 8000);
  const pcH = [...document.querySelectorAll('dialog[open] h3')].find((x) => x.textContent === 'This computer & sync');
  step('Settings › This computer & sync: "Last backup: just now ✓"', Boolean(line && pcH?.parentElement?.contains(line)), document.querySelector('.ba-line')?.textContent);
  await smoke({ shot: '/tmp/backupauto-settings.png' }).catch(() => {});
  document.querySelector('dialog[open]')?.close();

  // ---------- 2. Settings › Backups ----------
  AppUI.backupsDialog();
  const row = await until(() => document.querySelector('.backups-dialog .ba-row'), 8000);
  const rowText = row?.textContent || '';
  step('Backups: the backup by date with what\'s inside', /Today/.test(document.querySelector('.ba-day')?.textContent || '') && /3 scenes/.test(rowText) && new RegExp(`${nChats} chats`).test(rowText) && /2 memory lines/.test(rowText) && /settings/.test(rowText), rowText);
  step('…checked ✓, automatic', row?.dataset.ok === 'true' && /automatic/.test(rowText));
  step('…Restore missing things + Show in folder on the row', [...row.querySelectorAll('button')].some((b) => b.textContent === 'Restore missing things') && [...row.querySelectorAll('button')].some((b) => /^Show in (Finder|Explorer|folder)$/.test(b.textContent)));
  step('…Recover… (Lab scenes included) and Back up now', [...document.querySelectorAll('.backups-dialog button')].some((b) => b.textContent === 'Recover…' && /Lab scenes/.test(b.title)) && Boolean(document.querySelector('.backups-dialog .ba-now')));
  step('…where: Documents › Hearth backups', /Where: Documents › Hearth backups/.test(document.querySelector('.ba-where')?.textContent || ''), document.querySelector('.ba-where')?.textContent);
  await smoke({ shot: '/tmp/backupauto-dialog.png' }).catch(() => {});
  const inside = await window.hub.backupauto.setDir(`${D}/backups`);
  step('never inside the data folder (said why)', !inside.ok && /inside Hearth's own data folder/.test(inside.why || ''), inside);
  document.querySelector('.backups-dialog')?.close();

  // ---------- 3. rotation ----------
  let made = 1;
  for (let d = 1; d <= 13; d++) { await T({ clock: d * DAY }); const r = await window.hub.backupauto.run('auto'); if (r.ok) made += 1; }
  const L = await window.hub.backupauto.list();
  const names = L.items.map((b) => b.name);
  step(`rotation: ${made} daily backups → ${L.items.length} kept`, made === 14 && L.items.length < made && L.items.length >= 7, names);
  step('…the newest stays', L.items[0]?.at >= L.state.lastOk - 60000, L.items[0]);

  // ---------- 4. damaged ----------
  const victim = L.items[L.items.length - 1];
  await T({ corrupt: victim.path });
  const v = await window.hub.backupauto.verify(victim.path);
  step('a damaged zip: Check again says so', !v.ok && v.problems.length > 0, v);
  const L2 = await window.hub.backupauto.list();
  step('…marked ⚠ in the list', L2.items.find((b) => b.name === victim.name)?.ok === false);
  await T({ corruptNext: true, clock: 14 * DAY });
  const bad = await window.hub.backupauto.run('auto');
  step('a backup whose check fails isn\'t kept, plain why', !bad.ok && bad.code === 'VERIFY' && /checking it found a problem/.test(bad.why), bad);
  await BackupAuto.refresh();
  await AppUI.openSettings();
  const badLine = await until(() => { const l = document.querySelector('.ba-line'); return l && /didn't finish/.test(l.textContent) ? l : null; }, 5000);
  step('Settings line: "didn\'t finish" with Retry', badLine && !badLine.querySelector('.ba-retry').hidden, badLine?.textContent);
  document.querySelector('dialog[open]')?.close();
  AppUI.backupsDialog();
  const why = await until(() => document.querySelector('.backups-dialog .ba-why'), 5000);
  step('Backups: the why and Retry', /checking it found a problem/.test(why?.textContent || '') && [...document.querySelectorAll('.backups-dialog .ba-status button')].some((b) => b.textContent === 'Retry'));
  await smoke({ shot: '/tmp/backupauto-failed.png' }).catch(() => {});
  [...document.querySelectorAll('.backups-dialog .ba-status button')].find((b) => b.textContent === 'Retry')?.click();
  const fixed = await until(async () => { const s = await window.hub.backupauto.state(); return s.last?.ok && !s.running ? s : null; }, 30000);
  step('Retry: a good backup', Boolean(fixed));
  document.querySelector('.backups-dialog')?.close();
  const zips = (await window.hub.backupauto.list()).items;
  step('the damaged backup is tidied away once a good one follows', !zips.some((b) => b.name === victim.name) && !zips.some((b) => b.ok === false), zips.map((b) => [b.name, b.ok]));

  // ---------- 5. restore merges a deleted scene back ----------
  const newest = zips.find((b) => b.ok === true);
  await window.hub.kvSet('three-sketches', [sc('bas1', 'Orb'), sc('bas3', 'Tunnel')], { removed: ['bas2'] });
  await window.hub.deleteChat('claude-ba2');
  const before = await read(`${D}/kv/three-sketches.json`);
  step('(the scene and the chat were deleted)', before?.length === 2 && !before.some((x) => x.id === 'bas2'), before?.map((x) => x.id));
  await T({ clock: 14 * DAY + 3600e3 }); // an hour later: the "before a restore" backup isn't skipped as fresh
  const p = AppUI.restoreBackup(newest.path);
  const modal = await until(() => [...document.querySelectorAll('dialog.ui-modal')].find((x) => /Restore from backup/.test(x.textContent)), 8000);
  step('Restore missing things: says what comes back first', /Lab scenes \+1/.test(modal?.textContent || '') && /Chats: 1 to add/.test(modal?.textContent || ''), modal?.textContent?.slice(0, 500));
  modal?.querySelector('button[value="ok"]')?.click();
  await p;
  const after = await until(async () => { const v2 = await read(`${D}/kv/three-sketches.json`); return v2?.some((x) => x.id === 'bas2') ? v2 : null; }, 8000);
  step('the deleted scene is back (merged: the others kept)', after && ['bas1', 'bas2', 'bas3'].every((id) => after.some((x) => x.id === id)) && after.length === 3, after?.map((x) => x.id));
  step('the deleted chat is back', (await window.hub.listChats()).some((c) => c.id === 'claude-ba2'));
  const L3 = await window.hub.backupauto.list();
  step('a backup "before a restore" came first', L3.items.some((b) => b.reason === 'restore' && b.ok), L3.items.slice(0, 3).map((b) => [b.name, b.reason]));

  // ---------- 6. chat, the calm note ----------
  await Commands.tryRun('/backup status', H.claudeAgent().id);
  await wait(1200);
  step('/backup status answers in the chat', /Last backup/.test(document.body.textContent), '');
  await T({ auto: false, state: { lastOk: Date.now() + 14 * DAY + 3600e3 - 4 * DAY, last: null } });
  await BackupAuto.refresh();
  const h = window.Hints?.state?.() || {};
  step('no good backup for 3 days: one calm note (Hints)', BackupAuto.state().stale && (h.waiting || []).some((q) => /^backup:stale/.test(q.id)) || (h.log || []).some((x) => /backup:stale/.test(JSON.stringify(x))), { stale: BackupAuto.state().stale, waiting: h.waiting });
  await T({ clock: 0, idle: null });
} catch (err) {
  step('no error', false, String(err?.stack || err).slice(0, 600));
}
const problems = out.steps.filter((s) => !s.ok);
return JSON.stringify({ ok: !problems.length, pass: !problems.length, problems: problems.map((p) => p.name), ...out }, null, 1);
