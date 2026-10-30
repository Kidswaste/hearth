// (round 74, synchard74) A file that can't sync, in the sync panel, by clicks: on a Mac that syncs with a Windows PC, a
// Lab capture named "Capture 10:32.png" (":" is fine on a Mac, impossible on Windows) is held back, never sent to the
// cloud; the indicator says "⚠ 1 to fix"; the panel lists it by name with why in plain words and a "Rename for
// Windows" button; one click renames it, the chat that links to it follows, it goes up and the indicator is back to
// ✓ Synced. The PC runs an older Hearth (no format in its record): the panel says to update it there too. Only a temp
// folder is used as the cloud.
//   node dev/smoke.js --check-timeout 180000 --lib dev/checks/journey-lib.js --script dev/checks/synchard74.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const claude = H.claudeAgent();
const CLOUD = `/tmp/hearth-synchard74-${Date.now()}`;
const F = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const dot = () => document.getElementById('sync-dot');
const chip = () => dot()?.querySelector('.sync-chip')?.textContent || '';
const panel = () => document.querySelector('.sync-panel');
const btn = (re, root = panel()) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent));
const exists = async (p) => { try { return Boolean(await window.hub.fs.stat(p)); } catch { return false; } };
Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel', configurable: true });
const dataDir = (await window.hub.attachmentsDir()).replace(/[\\/]attachments$/, '');

// 0. the other computer: a Windows PC on an older Hearth (its record has no sync format)
const PC = { id: 'studio-pc-1a2b3c4d', name: 'Studio PC', platform: 'win32', dataDir: 'C:\\Users\\q\\Hearth\\data', cloudRoot: 'C:\\Users\\q\\OneDrive', home: 'C:\\Users\\q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${PC.id}.json`, JSON.stringify(PC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
const CAP = `${dataDir}/captures/Capture 10:32.png`;
await window.hub.fs.write(CAP, 'a capture made on the Mac');
await window.hub.saveChat({ id: 'synchard74-a', agentId: claude.id, title: 'The capture', updatedAt: Date.now(), messages: [{ role: 'user', at: 1, text: 'look', attachments: [{ path: CAP, name: 'Capture 10:32.png' }] }] });
await api.on({ root: CLOUD });
await Sync.refresh();
await until(() => (Sync.status().blocked || []).length > 0, 20000);
await wait(800);
const gotIt = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await wait(300); }

// 1. held back, said in a word on the indicator
step('the capture is held back: not in the cloud folder', !(await exists(F('captures/Capture 10:32.png'))) && (await exists(CAP)));
step('the indicator says "⚠ 1 to fix"', /⚠ 1 to fix/.test(chip()), chip());
step('…and its name says why to look', /1 file can't sync — see why/.test(dot()?.getAttribute('aria-label') || ''), dot()?.getAttribute('aria-label'));

// 2. the panel: by name, why in plain words, the fix
await click('#sync-dot');
await until(() => panel()?.querySelector('.sp-blocked'), 15000);
const sec = () => panel()?.querySelector('.sp-blocked');
const row = () => sec()?.querySelector('.sp-blk');
step('the panel has "Can\'t sync (1)"', /Can't sync \(1\)/.test(sec()?.textContent || ''), sec()?.textContent?.slice(0, 200));
step('the file by name, and why in plain words (Windows can\'t use ":")', /Capture 10:32\.png/.test(row()?.textContent || '') && /“:” in it, which Windows can't use/.test(row()?.textContent || '') && /nothing is lost/i.test(sec()?.textContent || ''), row()?.textContent);
step('a "Rename for Windows" button on its row', Boolean(btn(/^Rename for Windows$/, row())));
step('the PC runs an older Hearth: "update it there too"', /Hearth on Studio PC is an older version\. Update it there/.test(sec()?.textContent || ''), sec()?.textContent);
step('every button in the panel is named', [...panel().querySelectorAll('button')].every((b) => (b.textContent || b.getAttribute('aria-label') || '').trim()));
await smoke({ shot: '/tmp/synchard74-blocked.png' });

// 3. one click: renamed, the chat follows, it goes up, back to ✓ Synced
await click(btn(/^Rename for Windows$/, row()));
const up = await until(async () => exists(F('captures/Capture 10-32.png')), 15000);
step('one click: renamed here and sent to the cloud as "Capture 10-32.png"', up && (await exists(`${dataDir}/captures/Capture 10-32.png`)) && !(await exists(CAP)));
step('the toast says what happened, links included', recentToasts().some((t) => /Renamed to “Capture 10-32\.png”; 1 link to it updated/.test(t.message)), recentToasts().slice(-3).map((t) => t.message));
const chatText = await window.hub.fs.read(`${dataDir}/chats/synchard74-a.json`).catch(() => '');
step('the chat\'s link follows the new name', /Capture 10-32\.png/.test(String(chatText)) && !/captures[\\/]+Capture 10:32/.test(String(chatText)), String(chatText).slice(0, 300));
await until(() => !(Sync.status().blocked || []).length && Sync.status().state === 'synced', 15000);
await until(() => !panel()?.querySelector('.sp-blk'), 5000);
step('nothing can\'t sync any more: the row is gone, the indicator is ✓ Synced', !panel()?.querySelector('.sp-blk') && /✓ Synced/.test(chip()), { chip: chip(), sec: sec()?.textContent });
await smoke({ shot: '/tmp/synchard74-fixed.png' });
await J.key('Escape');
await until(() => !panel(), 2000);
step('Escape closes the panel', !panel());
await api.off();
return J.done();
