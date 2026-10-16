// Space Hearth uses (round 53, diskcalm), in the real app on throwaway data: a heavy week written into the data
// folder, the profile, the backups folder and the temp folder (sparse files: big to the disk's accounting, no room
// used), then
//   1. the measure: every rebuildable part is exactly what was written; the line reads "X GB: … · …"
//   2. Settings › This computer & sync: one fold (one control at first sight) with that line; open, a row per part,
//      Free up only on the parts that come back by themselves (none on your work, backups, safety copies)
//   3. Free up (a click) moves that part to the test Trash and the row's size drops; Ctrl/⌘+K "Disk space" opens the
//      fold; /disk answers in words
//   4. every rebuildable part freed: the owner's work (chats, scenes, captures, renders), backups and safety copies
//      untouched, byte for byte
//   5. the calm tidy: an ended render's frames and an old temp folder go, a fresh one stays; one quiet line in Activity
//   node dev/smoke.js --check-timeout 180000 --script dev/checks/diskcalm.js --shot /tmp/diskcalm.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const MB = 1048576; const HOUR = 3600e3; const DAY = 24 * HOUR;
try {
  await Lazy.load('diskcalm');
  const D = window.hub.diskcalm;
  step(typeof DiskCalm !== 'undefined' && typeof DiskCalmCore !== 'undefined' && Boolean(D), 'the diskcalm group loads (DiskCalm, DiskCalmCore, hub.diskcalm)');
  const roots = await D.test('roots');
  const J = (...a) => a.join('/').replace(/\\/g, '/');

  // ---------- a heavy week ----------
  const work = [
    ['data', 'chats/dc-chat-1.json', 0, 0, JSON.stringify({ id: 'dc-chat-1', title: 'mine', messages: [{ role: 'user', text: 'keep me' }] })],
    ['data', 'captures/recordings/dc-take.webm', 420 * MB, DAY],
    ['data', 'renders/dc-clink.mp4', 450 * MB, DAY],
    ['data', 'kv/dc-notes.json', 0, 0, '{"keep":"me"}'],
    ['data', 'kv/.history/dc-notes/1.json', 3 * MB, DAY],
    ['data', 'trash/dc-old.json', 2 * MB, DAY],
    ['backups', 'Hearth backup dc.zip', 120 * MB, DAY],
  ];
  const rebuild = [
    ['data', 'game/dc_scene/play.html', 40 * 1024, 2 * DAY], ['data', 'game/dc_scene/assets/song.mp3', 9 * MB, 2 * DAY], ['data', 'game/dc_scene/hearth-play.json', 0, 2 * DAY, '{}'],
    ['data', 'game/dc_gone/play.html', 40 * 1024, 2 * DAY], ['data', 'game/dc_gone/hearth-play.json', 0, 2 * DAY, '{}'],
    ['data', 'game-cache/files/dc1.glb', 280 * MB, DAY],
    ['data', 'captures/Present bakes/dc-b1.mp4', 300 * MB, 2 * DAY],
    ['data', '.cache/asset-thumbs/dc.webp', 2 * MB, DAY],
    ['data', 'engine.prev.log', 2 * MB, DAY],
    ['userData', 'Partitions/hearth-game/GPUCache/dc_data', 30 * MB, DAY],
  ];
  const leftovers = [
    ['data', 'renders/.hearth-titles-xpdcold/frame_00001.png', 150 * MB, DAY],
    ['data', 'renders/.hearth-titles-xpdcnew/frame_00001.png', 20 * MB, 5 * 60e3],
    ['tmp', 'hub-zip-dcold/data/kv/notes.json', 380 * MB, 3 * DAY],
    ['tmp', 'hearth-backup-dcfresh/x.json', 10 * MB, 10 * 60e3],
  ];
  const spec = [...work, ...rebuild, ...leftovers].map(([where, rel, bytes, ago, text]) => ({ where, rel, bytes, ago, ...(text != null ? { text } : {}) }));
  await D.test('fixture', spec);
  const pathOf = ([where, rel]) => J(where === 'backups' ? roots.backups[0] : roots[where], rel);
  // the bakes list, as Present keeps it
  await window.hub.kvSet('present-bakes', [{ key: 'dc-b1', scene: 'dc scene', path: pathOf(rebuild[6]), bytes: 300 * MB, usedAt: Date.now() - 2 * DAY }]);
  const statOf = async (e) => { const s = await window.hub.fs.stat(pathOf(e)).catch(() => null); return s ? `${s.size}` : 'gone'; };
  const before = {}; for (const e of work) before[e[1]] = await statOf(e);
  const chatText = await window.hub.fs.read(pathOf(work[0])).catch(() => null);

  // ---------- 1. the measure ----------
  const m = await D.measure({ fresh: true });
  step(m.parts.play === 9 * MB + 80 * 1024 + 4 && m.parts.bakes === 300 * MB && m.parts.optimized === 280 * MB && m.parts.thumbs >= 2 * MB, 'the measure: Play builds, bakes, optimized, pictures exactly as written', { play: m.parts.play, bakes: m.parts.bakes, optimized: m.parts.optimized });
  step(m.parts.backups >= 120 * MB && m.parts.leftovers >= 560 * MB && m.parts.gameshaders >= 30 * MB && m.parts.work >= 870 * MB && m.parts.safety >= 5 * MB, 'backups, leftovers (data + temp), the game\'s shader cache, your work, safety copies counted', { backups: m.parts.backups, leftovers: m.parts.leftovers, work: m.parts.work });
  step(/^\d[\d.]* (GB|MB): .+ · /.test(m.line) && m.total >= 2 * 1024 * MB, `the one line: ${m.line}`);

  // ---------- 2. Settings ----------
  await AppUI.openSettings(); await wait(600);
  const fold = await until(() => document.querySelector('dialog.settings-dialog[open] .dc-fold'));
  const pcSec = fold?.closest('.settings-section');
  step(Boolean(fold) && /This computer/.test(pcSec?.querySelector('h3')?.textContent || ''), 'Settings › This computer & sync has "Space Hearth uses"');
  const state = await until(() => { const t = fold?.querySelector('summary .sc-state')?.textContent || ''; return /GB|MB/.test(t) ? t : null; });
  step(Boolean(state) && Boolean(fold.querySelector('summary').title) && !fold.open, `folded at first sight, with the line and a hover explanation: ${state}`);
  fold.querySelector('summary').click(); await wait(300);
  const rows = [...fold.querySelectorAll('.dc-row')];
  const rowOf = (id) => rows.find((r) => r.dataset.part === id);
  const freeBtns = rows.filter((r) => r.querySelector('.dc-free')).map((r) => r.dataset.part);
  step(rows.length >= 8 && ['play', 'bakes', 'optimized', 'leftovers'].every((id) => freeBtns.includes(id)), `a row per part; Free up on the rebuildable ones (${freeBtns.join(', ')})`);
  step(['work', 'backups', 'safety'].every((id) => rowOf(id) && !rowOf(id).querySelector('.dc-free')), 'no Free up on your work, backups or safety copies');
  step(/Rebuilt next time you press ▶ Play/.test(rowOf('play')?.textContent || '') && /never frees/i.test(rowOf('work')?.textContent || ''), 'each says what comes back by itself, or why it stays');
  await smoke({ shot: '/tmp/diskcalm-fold.png' });

  // ---------- 3. Free up (a click), Ctrl/⌘+K, /disk ----------
  rowOf('play').querySelector('.dc-free').click();
  const freed = await until(async () => { const x = await D.measure(); return x.parts.play === 0 ? x : null; }, 15000);
  const trash1 = await D.test('trash');
  step(Boolean(freed) && trash1.some((n) => /dc_scene$/.test(n)) && trash1.some((n) => /dc_gone$/.test(n)), 'Free up ▶ Play builds: both builds in the test Trash', trash1);
  const toastT = await until(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).find((t) => /Freed .*Rebuilt next time you press ▶ Play/.test(t)));
  step(Boolean(toastT), `a toast says what comes back: ${toastT}`);
  document.querySelector('dialog.settings-dialog[open]')?.close();
  const act = AppUI.actions().find((a) => /^Disk space/.test(a.label));
  step(Boolean(act), 'Ctrl/⌘+K has "Disk space…"', act?.label);
  act?.run();
  const opened = await until(() => { const d = document.querySelector('dialog.settings-dialog[open] .dc-fold'); return d?.open ? d : null; });
  step(Boolean(opened), 'Ctrl/⌘+K Disk space opens Settings at the fold, open');
  document.querySelector('dialog.settings-dialog[open]')?.close();
  const said = await Commands.get('disk').run('');
  step(/Space Hearth uses/.test(said) && /can be freed/.test(said), '/disk answers in words', said.split('\n')[0]);

  // ---------- 4. everything rebuildable freed; the owner's work untouched ----------
  for (const id of ['optimized', 'bakes', 'thumbs', 'logs', 'gameshaders']) {
    const r = await D.free(id);
    step(r.ok, `Free up ${id}: ${r.ok ? `${DiskCalmCore.fmt(r.freed)} freed` : r.why}`);
  }
  const refused = await D.free('work');
  step(!refused.ok && /never frees/i.test(refused.why), 'Free up of your work: refused', refused.why);
  const m2 = await D.measure({ fresh: true });
  step(m2.parts.bakes === 0 && m2.parts.optimized === 0 && m2.parts.thumbs === 0 && m2.parts.logs < 2 * MB, 'bakes, optimized copies, asset pictures, logs: gone from Hearth (in the Trash)', { bakes: m2.parts.bakes, optimized: m2.parts.optimized, logs: m2.parts.logs });
  const bakesList = await window.hub.kvGet('present-bakes', null);
  step(Array.isArray(bakesList) && bakesList.length === 0, 'the bakes list follows');
  const after = {}; for (const e of work) after[e[1]] = await statOf(e);
  const changed = work.filter((e) => after[e[1]] !== before[e[1]] || after[e[1]] === 'gone').map((e) => e[1]);
  const chatNow = await window.hub.fs.read(pathOf(work[0])).catch(() => null);
  step(!changed.length && chatNow === chatText, `the owner's work, backups and safety copies untouched (${work.length} files, the chat byte for byte)`, changed);

  // ---------- 5. the calm tidy ----------
  const t = await D.tidy();
  const exists = async (e) => Boolean(await window.hub.fs.stat(pathOf(e)).catch(() => null));
  step(!(await exists(leftovers[0])) && await exists(leftovers[1]), 'tidy: an ended render\'s title frames go; one still writing stays');
  const gone = !(await window.hub.fs.stat(J(roots.tmp, 'hub-zip-dcold')).catch(() => null));
  const stays = Boolean(await window.hub.fs.stat(J(roots.tmp, 'hearth-backup-dcfresh')).catch(() => null));
  step(gone && stays, 'tidy: an old temp folder goes; a fresh one stays', { gone, stays });
  step(/^Tidied .* — to the Trash$/.test(t.line || ''), `tidy: one quiet line: ${t.line}`);
  const inAct = await until(() => (window.Activity?.history?.() || []).find((e) => /^Tidied /.test(e.text)));
  step(Boolean(inAct) && inAct.icon === '🧹', 'the line is in Activity (the last 24 h)', inAct?.text);
  const t2 = await D.tidy();
  step(!t2.moved.length, 'tidy again: nothing more');
} catch (err) {
  out.problems.push(`threw: ${err.message}`);
}
return JSON.stringify(out, null, 1);
