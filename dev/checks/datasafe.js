// 🛟 Data safety (round 43, datasafe), on a throwaway copy of the app (its data from dev/datasafe-test.js --make-fixture):
// config.json, memory.json, a chat file and the notes are held (EBUSY / EPERM, like an antivirus or OneDrive on Windows)
// for the first 20 s of the start.
//  1. the window still opens (from the automatic copy of the settings), the calm card says what couldn't be read and that
//     nothing was changed; the held chat keeps its row in the list
//  2. saves while held (settings, memory, notes) write nothing over the files
//  3. once they read again: every save lands MERGED with what was on disk (nothing lost), the card's Retry clears it
//  4. 🛟 Recover…: finds a chat that is only in a backup zip; Bring back adds it next to yours
//  5. the ways in: Settings › Backups › Recover…, Ctrl/⌘+K, /recover
//   node dev/datasafe-test.js --make-fixture /tmp/hearth-datasafe-fixture
//   node dev/smoke.js --data /tmp/hearth-datasafe-fixture --wait 300 --check-timeout 120000 --script dev/checks/datasafe.js --shot /tmp/datasafe.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await wait(150); } };
const raw = async (p) => { try { return JSON.parse(await window.hub.fs.read(p)); } catch { return null; } };

try {
  const info = await window.hub.reach.info();
  const D = info.dataDir;
  const CFG = D.replace(/[\\/]data[\\/]?$/, '') + (D.includes('\\') ? '\\config.json' : '/config.json');
  // ---------- 1. at the start ----------
  await until(() => typeof DataSafe !== 'undefined', 15000);
  const card = await until(() => document.querySelector('.ds-card'), 15000);
  const text = card?.textContent || '';
  step('the calm card: what couldn\'t be read, "nothing was changed"', card && /Nothing was changed/.test(text) && /Settings and agents/.test(text), text.slice(0, 400));
  step('the window opened from the automatic copy of the settings', H.config?.settings?.dsMarker === 'copy' && H.config.agents?.length >= 1, H.config?.settings);
  await smoke({ shot: '/tmp/datasafe-card.png' }).catch(() => {});
  const ids = (H.chats || []).map((c) => c.id);
  step('the held chat keeps its row in the chats list', ids.includes('claude-dsa') && ids.includes('claude-dsb'), ids);
  const health = await window.hub.datasafe.health();
  step('health knows: settings (copy), the chat file', health.config?.from === 'copy' && Boolean(health.chats), health);

  // ---------- 2. saves while held ----------
  const cfgBefore = await window.hub.fs.read(CFG);
  H.config.settings = { ...H.config.settings, dsTest: 'yes' };
  const r1 = await saveConfig();
  const mem0 = await window.hub.getMemory();
  const r2 = await window.hub.saveMemory({ ...mem0, shared: `${mem0.shared ? `${mem0.shared}\n` : ''}a line added while held` });
  const n0 = await window.hub.kvGet('notes', []);
  const r3 = await window.hub.kvSet('notes', [...(n0 || []), { id: 'dsnew', title: 'New', text: 'added while held', updatedAt: Date.now() }]);
  await wait(400);
  const cfgNow = await window.hub.fs.read(CFG);
  const memNow = await raw(`${D}/memory.json`);
  const notesNow = await raw(`${D}/kv/notes.json`);
  step('settings saved while held: nothing written over config.json', r1?.held && cfgNow === cfgBefore, r1);
  step('memory saved while held: your lines untouched', r2?.held && /ds line A/.test(memNow?.shared || '') && !/while held/.test(memNow?.shared || ''), { r2, memNow });
  step('notes saved while held: the 3 notes untouched', r3?.held && notesNow?.length === 3, { r3, n: notesNow?.length });
  step('(the window had read memory / notes as empty: the old bug\'s setup)', !mem0.shared && Array.isArray(n0) && !n0.length, { mem0, n0 });

  // ---------- 3. once they read again ----------
  const landed = await until(async () => {
    const c = await raw(CFG); const m = await raw(`${D}/memory.json`); const n = await raw(`${D}/kv/notes.json`);
    return c?.settings?.dsTest === 'yes' && /while held/.test(m?.shared || '') && n?.length === 4 ? { c, m, n } : null;
  }, 45000);
  step('settings: your change landed on top of the real file (its own value kept)', landed?.c?.settings?.dsMarker === 'real' && landed?.c?.settings?.dsTest === 'yes', landed?.c?.settings);
  step('memory: the old lines + the new one', /ds line A/.test(landed?.m?.shared || '') && /ds line B/.test(landed?.m?.shared || '') && /while held/.test(landed?.m?.shared || ''), landed?.m);
  step('notes: the 3 old + the new one', (landed?.n || []).map((x) => x.id).join(',').includes('dsn1') && landed?.n?.some((x) => x.id === 'dsnew'), landed?.n?.map((x) => x.id));
  await until(() => H.config?.settings?.dsMarker === 'real', 10000);
  step('the window gets the real settings once they read', H.config?.settings?.dsMarker === 'real' && H.config?.settings?.dsTest === 'yes', H.config?.settings);
  document.querySelector('.ds-card .primary')?.click(); // Retry
  await wait(800);
  step('Retry: the card goes once everything reads', !document.querySelector('.ds-card'));

  // ---------- 4. Recover… ----------
  const p = DataSafe.recover();
  const row = await until(() => [...document.querySelectorAll('.ds-recover .ds-row')].find((r) => /Only in a backup/.test(r.textContent)), 30000);
  step('Recover… finds the chat that is only in a backup zip, with where it came from', row && /Backup/.test(row.textContent), [...document.querySelectorAll('.ds-recover .ds-row')].map((r) => r.textContent.slice(0, 90)));
  await smoke({ shot: '/tmp/datasafe-recover.png' }).catch(() => {});
  for (const b of document.querySelectorAll('.ds-recover .ds-row input')) b.checked = false;
  if (row) { const box = row.querySelector('input'); box.checked = true; box.dispatchEvent(new Event('change')); }
  [...document.querySelectorAll('.ds-recover button')].find((b) => /^Bring back/.test(b.textContent))?.click();
  await p;
  await until(() => (H.chats || []).some((c) => c.id === 'claude-dsz'), 10000);
  step('Bring back: the chat is added next to yours', (H.chats || []).some((c) => c.id === 'claude-dsz') && (H.chats || []).some((c) => c.id === 'claude-dsa'), (H.chats || []).map((c) => c.id));
  document.querySelector('.ds-recover')?.close();

  // ---------- 5. the ways in ----------
  step('Ctrl/⌘+K knows "Recover…"', (AppUI.actions?.() || []).some((a) => /^Recover…/.test(a.label)));
  step('/recover is a command', Boolean(Commands.get?.('recover')));
  AppUI.backupsDialog?.();
  await wait(500);
  step('Settings › Backups has "Recover…"', [...document.querySelectorAll('.backups-dialog button')].some((b) => /^Recover…$/.test(b.textContent.trim())));
  document.querySelector('.backups-dialog')?.close();
} catch (err) {
  step('no error', false, String(err?.stack || err).slice(0, 600));
}
const problems = out.steps.filter((s) => !s.ok);
return JSON.stringify({ ok: !problems.length, problems: problems.map((p) => p.name), ...out }, null, 1);
