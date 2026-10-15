// 🛟 Scene safety (round 43, scenesafe), on a throwaway copy of the app, driven like the owner would:
//  1. the scenes file can't be read when the Lab opens (here: a folder where the file should be, so every read fails,
//     like a file Windows keeps locked) → the calm card "couldn't be read — nothing was changed", nothing is written
//     (no starter scene saved, an edit while it's like this isn't saved either), the Lab still works; Retry once the
//     file reads again → your scenes, saving back on
//  2. a starter list sent over your scenes (the old bug's write) → the scenes stay, the Lab is told
//  3. Delete… still deletes; the copy right before it is in data/kv/.history
//  4. the file gone + a cut-short file: the careful read says "missing" (with copies → the starter waits) / uses .prev
//  5. 🛟 Recover lost scenes… (Sketch ▾): finds scenes in .prev, the rotating copies, History's trash and a backup zip,
//     with where each came from; Bring back merges them next to yours (nothing replaced), saved; Undo takes them back
//  6. the ways in: Sketch ▾ row, Find anything action, Settings › Backups button, /recover-scenes list
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/scenesafe.js --shot /tmp/scenesafe.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const sc = (id, name, extra = {}) => ({ id, name, code: `import * as THREE from 'three';\n// ${name}\nconst scene = new THREE.Scene();\nexport default { scene };`, updatedAt: Date.now() - 3600e3, ...extra });
const read = async (p) => { try { return JSON.parse(await window.hub.fs.read(p)); } catch { return null; } };
const ids = (v) => (Array.isArray(v) ? v.map((x) => x.id) : v);

try {
  const info = await window.hub.reach.info();
  const KV = `${info.dataDir}/kv`;
  const F = `${KV}/three-sketches.json`;
  const mine = [sc('ssa', 'Orb'), sc('ssb', 'Waves'), sc('ssc', 'Tunnel')];
  // ---------- 1. unreadable at the Lab's start ----------
  await window.hub.fs.write(`${F}/x`, 'a folder where the file should be: every read fails'); // (fs:write makes the folder)
  const t0 = Date.now();
  activate('tool:three');
  await until(() => typeof LabSceneSafe !== 'undefined' && LabSceneSafe.state().ready, 30000);
  const card = await until(() => document.querySelector('.lab-ssafe-card[data-kind="unreadable"]'), 15000);
  step('unreadable at start: the calm card, after a few quiet retries', card && /nothing was changed/.test(document.querySelector('.lab-ssafe-card')?.textContent || ''), { ms: Date.now() - t0, state: LabSceneSafe.state() });
  step('the Lab still opens (a starter scene on screen)', ThreeLab.scenes.all().length === 1 && ThreeLab.scenes.blocked(), ThreeLab.scenes.all().map((x) => x.name));
  await smoke({ shot: '/tmp/scenesafe-card.png' }).catch(() => {});
  // an edit while it's like this: never written
  ThreeLab.scenes.rename(ThreeLab.scenes.currentId(), 'Edited while unreadable');
  await wait(1500);
  const stF = await window.hub.fs.stat(F);
  step('nothing was written over it (no starter scene saved, an edit not saved)', stF?.isDir === true, stF);
  // the file reads again → Retry
  await window.hub.fs.trash([F]).catch(() => null);
  if (await window.hub.fs.stat(F)) { step('test setup: the folder could not be removed', false); }
  await window.hub.fs.write(F, JSON.stringify(mine, null, 2));
  document.querySelector('.lab-ssafe-card .primary')?.click(); // Retry
  await until(() => ThreeLab.scenes.all().some((x) => x.id === 'ssa'), 15000);
  await wait(300);
  step('Retry: your scenes are back, the card gone', ['ssa', 'ssb', 'ssc'].every((id) => ThreeLab.scenes.get(id)) && !document.querySelector('.lab-ssafe-card'), ids(ThreeLab.scenes.all()));
  step('the untouched starter isn\'t added; the one you edited while it waited is kept (your work isn\'t lost either)', !ThreeLab.scenes.all().some((x) => x.name === 'Basic scene') && ThreeLab.scenes.all().some((x) => x.name === 'Edited while unreadable'), ThreeLab.scenes.all().map((x) => x.name));
  ThreeLab.scenes.rename('ssb', 'Waves 2');
  await until(async () => (await read(F))?.find?.((x) => x.id === 'ssb')?.name === 'Waves 2', 5000);
  step('saving is back on', (await read(F))?.find((x) => x.id === 'ssb')?.name === 'Waves 2');

  // ---------- 2. the old bug's write: a starter list over your scenes ----------
  const r = await window.hub.kvSet('three-sketches', [sc('basic1', 'Basic scene')]);
  const after = await read(F);
  step('a starter list sent over your scenes: they stay (the starter joins them)', ['ssa', 'ssb', 'ssc', 'basic1'].every((id) => ids(after).includes(id)) && r?.restored?.length >= 3, { file: ids(after), r });
  await window.hub.kvSet('three-sketches', after.filter((x) => x.id !== 'basic1'), { removed: ['basic1'] });

  // ---------- 3. Delete still deletes ----------
  ThreeLab.scenes.open('ssa');
  await wait(400);
  const removed = ThreeLab.scenes.remove('ssc');
  await until(async () => !ids(await read(F))?.includes('ssc'), 6000);
  const hist = await window.hub.fs.list(`${KV}/.history/three-sketches`).catch(() => []);
  step('Delete… still deletes (the file loses it)', removed && !ids(await read(F)).includes('ssc'), ids(await read(F)));
  step('a copy from right before is in data/kv/.history', (hist || []).some((x) => /-before\.json$/.test(x.name)), (hist || []).map((x) => x.name));

  // ---------- 4. the careful read: missing / cut short ----------
  const keepF = await window.hub.fs.read(F);
  await window.hub.fs.write(`${KV}/three-sketches.prev.json`, JSON.stringify([sc('prevonly', 'Only in prev'), ...mine], null, 2));
  await window.hub.fs.write(F, '[{"id":"ssa","name":"Or');
  let rr = await LabSceneSafe.read('three-sketches', []);
  step('a cut-short file reads as its .prev copy (said so), never as empty', rr.ok && rr.from === 'prev' && rr.value.length === 4, { state: rr.state, from: rr.from, n: rr.value?.length });
  await window.hub.fs.trash([F]);
  rr = await LabSceneSafe.read('three-sketches', []);
  step('the file gone with copies around: "missing" and the starter waits (not saved)', rr.ok && rr.state === 'missing' && rr.hold === true && rr.found >= 1, rr);
  await window.hub.fs.write(F, keepF);
  await wait(300);

  // ---------- 5. Recover lost scenes ----------
  await window.hub.kvSet('three-history', { versions: {}, trash: [{ id: 'trashed1', name: 'From the trash', code: sc('x', 'x').code, deletedAt: Date.now() - 7200e3 }] });
  const BK = '/tmp/hearth-scenesafe-backups';
  const SRC = '/tmp/hearth-scenesafe-bsrc';
  await window.hub.fs.write(`${SRC}/kv/three-sketches.json`, JSON.stringify([sc('frombackup', 'From a backup')]));
  await window.hub.fs.zip([{ path: SRC, name: 'data' }], `${BK}/hearth-backup-2026-10-01-10-00.zip`);
  H.config.settings = { ...H.config.settings, backupDir: BK };
  await saveConfig();
  await wait(300);
  // the way in: Sketch ▾ › 🛟 Recover lost scenes…
  const sketchBtn = [...document.querySelectorAll('.surface[data-id="tool:three"] button')].find((b) => /^Sketch ▾/.test(b.textContent));
  sketchBtn?.click();
  await wait(300);
  let row = [...document.querySelectorAll('.lab-pop .menu-item')].find((x) => /Recover lost scenes/.test(x.textContent));
  if (!row) { const sec = [...document.querySelectorAll('.lab-pop .menu-item')].find((x) => /^History/.test(x.textContent)); // (round 43, menucalm) Sketch ▾ › History › if (sec) { sec.click(); await wait(250); row = [...document.querySelectorAll('.lab-pop .menu-item')].find((x) => /Recover lost scenes/.test(x.textContent)); } }
  step('Sketch ▾ › History has 🛟 Recover lost scenes…', Boolean(row));
  if (row) row.click(); else LabSceneSafe.recover();
  await until(() => document.querySelectorAll('.lab-ssafe-dialog .lab-ssafe-item').length > 0, 30000);
  await wait(300);
  const dlg = document.querySelector('.lab-ssafe-dialog');
  const items = [...dlg.querySelectorAll('.lab-ssafe-item')].map((x) => x.textContent);
  const has = (re) => items.some((t) => re.test(t));
  step('found: the scene only in .prev, the deleted one in History, the one in a backup', has(/Only in prev/) && has(/From the trash/) && has(/From a backup/), items.map((t) => t.slice(0, 60)));
  step('each says where it came from', items.every((t) => /From: /.test(t)) && has(/Backup 2026-10-01/) && has(/History/));
  step('your own scenes aren\'t offered', !has(/^Orb|Waves 2/));
  await smoke({ shot: '/tmp/scenesafe-dialog.png' }).catch(() => {});
  // a scene deleted on purpose (History's trash) is offered unticked; the owner ticks it here
  const trashBox = [...dlg.querySelectorAll('.lab-ssafe-item')].find((x) => /From the trash/.test(x.textContent))?.querySelector('input');
  step('a scene you deleted on purpose is offered, not ticked', trashBox && !trashBox.checked && [...dlg.querySelectorAll('.lab-ssafe-item')].filter((x) => /Only in prev|From a backup/.test(x.textContent)).every((x) => x.querySelector('input').checked));
  trashBox?.click();
  const before = ThreeLab.scenes.all().map((x) => x.id);
  const go = [...dlg.querySelectorAll('button')].find((b) => /^Bring back \d/.test(b.textContent));
  step('the found ones are ticked, one button says how many', Boolean(go), go?.textContent);
  go?.click();
  await wait(800);
  const now = ThreeLab.scenes.all().map((x) => x.id);
  const added = now.filter((id) => !before.includes(id));
  step('brought back next to yours: nothing of yours replaced or removed', before.every((id) => now.includes(id)) && ['prevonly', 'trashed1', 'frombackup'].every((id) => now.includes(id)), { before, now });
  await until(async () => { const v = ids(await read(F)) || []; return ['prevonly', 'trashed1', 'frombackup'].every((id) => v.includes(id)); }, 6000);
  { const v = ids(await read(F)) || []; step('saved at once', ['prevonly', 'trashed1', 'frombackup'].every((id) => v.includes(id)), v); }
  // Undo (the toast's action)
  const undo = [...document.querySelectorAll('.toast button, .toasts button')].find((b) => /^Undo$/.test(b.textContent.trim()));
  step('one Undo on the toast', Boolean(undo));
  undo?.click();
  await wait(1200);
  await until(async () => !ids(await read(F))?.includes('frombackup'), 6000);
  step('Undo takes exactly those back', added.every((id) => !ThreeLab.scenes.get(id)) && before.every((id) => ThreeLab.scenes.get(id)) && !ids(await read(F)).includes('frombackup'), ids(ThreeLab.scenes.all()));

  // ---------- 6. the other ways in ----------
  step('Find anything knows "Recover lost Lab scenes…"', (AppUI.actions?.() || []).some((a) => /Recover lost Lab scenes/.test(a.label)));
  await Commands.tryRun('/recover-scenes list', H.claudeAgent().id);
  await wait(1500);
  step('/recover-scenes list answers in the chat', /in your list|Scenes that aren't/.test(document.querySelector('.native-note:last-of-type, .note:last-of-type')?.textContent || document.body.textContent));
  AppUI.backupsDialog?.();
  await wait(500);
  const bbtn = [...document.querySelectorAll('.backups-dialog button')].find((b) => /Recover lost Lab scenes/.test(b.textContent));
  step('Settings › Backups has "Recover lost Lab scenes…"', Boolean(bbtn));
  document.querySelector('.backups-dialog')?.close();
} catch (err) {
  step('no error', false, String(err?.stack || err).slice(0, 600));
}
const problems = out.steps.filter((s) => !s.ok);
return JSON.stringify({ ok: !problems.length, problems: problems.map((p) => p.name), ...out }, null, 1);
