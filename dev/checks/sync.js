// Sync (round 10): turn on (no drive found here: the setup offers "Choose a folder…"; /sync on <temp folder>), the
// calm dot (synced / syncing / paused / conflict), Settings → Sync, a chat and a store arriving from "the other
// computer" (written into the temp cloud folder), a true conflict and the conflicts view ("Use the other one"),
// the right-click menu (pause / resume), /sync status, deleted files + restore. Only a temp folder is used as the cloud.
//   node dev/smoke.js --check-timeout 180000 --lib dev/checks/journey-lib.js --script dev/checks/sync.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const claude = H.claudeAgent();
const CLOUD = `/tmp/hearth-sync-smoke-${Date.now()}`;
const F = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const lastNote = () => [...(Native.view(claude.id)?.list.querySelectorAll('.msg.note') || [])].pop()?.textContent || '';
const run = async (line) => { await Commands.tryRun(line, claude.id); await wait(300); };
const dot = () => document.getElementById('sync-dot');
const settle = () => wait(2300); // the engine waits 2 s after a cloud file changes (it may still be written)

// 0. off: no dot, Settings offers one button, /sync status says so
await until(() => typeof Sync !== 'undefined' && Sync.status().state === 'off', 8000);
step('off by default: no dot in the rail', !dot() && Sync.status().on === false);
AppUI.openSettings();
await wait(400);
const sec = document.querySelector('.settings-dialog .sync-settings');
step('Settings shows Sync with one button', Boolean(sec) && /Turn on sync/.test(sec?.textContent || ''), sec?.textContent?.slice(0, 120));
document.querySelector('.settings-dialog')?.close();
await wait(200);
H.activate?.(claude.id);
await wait(300);
await run('/sync status');
step('/sync status when off', /Sync is off/.test(lastNote()), lastNote().slice(0, 80));

// 1. setup: nothing found on this test computer → "Choose a folder…"
const dlg = await Sync.setup();
await wait(300);
step('setup dialog: no drive here → choose a folder', Boolean(dlg?.open) && /No cloud drive found/.test(dlg.textContent) && /Choose a folder/.test(dlg.textContent));
dlg?.close();
await wait(200);

// 2. a chat of ours, then on with a temp "cloud drive" folder
const mine = { id: 'synctest-mine', agentId: claude.id, title: 'Mine before sync', updatedAt: Date.now(), messages: [{ role: 'user', at: 1, text: 'hello from here' }] };
await window.hub.saveChat(mine);
await window.hub.fs.write(`${CLOUD}/.keep`, '');
await run(`/sync on ${CLOUD}`);
await until(() => Sync.status().state === 'synced', 20000);
step('turned on: synced, the dot shows', Sync.status().state === 'synced' && dot()?.dataset.state === 'synced', Sync.status());
const pushed = await window.hub.fs.stat(F('chats/synctest-mine.json')).catch(() => null);
step('our chat is in the cloud copy', Boolean(pushed));
const cfgCloud = JSON.parse(await window.hub.fs.read(F('app/config.json')));
step('config in the cloud has no engine paths / layout', !cfgCloud.layout && !cfgCloud.settings?.enginePaths && Array.isArray(cfgCloud.agents));

// 3. the other computer adds a chat and changes a store
const theirs = { id: 'synctest-theirs', agentId: claude.id, title: 'Made on the Mac', updatedAt: Date.now(), messages: [{ role: 'user', at: 2, text: 'hello from the mac' }, { role: 'user', at: 3, text: 'hearth-data:/attachments/pic.png' }] };
await window.hub.fs.write(F('chats/synctest-theirs.json'), JSON.stringify(theirs));
await window.hub.fs.write(F('kv/sync-smoke.json'), JSON.stringify({ from: 'mac' }));
await settle();
await Sync.now();
await until(() => (H.chats || []).some((c) => c.id === 'synctest-theirs'), 8000);
step('a chat from the other computer appears in the list', (H.chats || []).some((c) => c.id === 'synctest-theirs'));
const got = await window.hub.getChat('synctest-theirs');
const attDir = await window.hub.attachmentsDir();
step('its paths point into this computer\'s data folder', got?.messages?.[1]?.text === `${attDir}${attDir.includes('\\') ? '\\' : '/'}pic.png`, got?.messages?.[1]?.text);
step('a store arrival offers a reload (calm toast, gold mark on the dot)', recentToasts().some((t) => /Changes from/.test(t.message)) && dot()?.classList.contains('fresh'));
step('kv store arrived', (await window.hub.kvGet('sync-smoke', {}))?.from === 'mac');

// 4. a true conflict: the same chat's title changed two ways
await api.ack();
const mineNow = await window.hub.getChat('synctest-mine');
await window.hub.saveChat({ ...mineNow, title: 'Renamed here' });
const cloudMine = JSON.parse(await window.hub.fs.read(F('chats/synctest-mine.json')));
await window.hub.fs.write(F('chats/synctest-mine.json'), JSON.stringify({ ...cloudMine, title: 'Renamed on the Mac' }));
await settle();
await Sync.now();
await until(() => Sync.status().state === 'conflict', 8000);
step('conflict: status and dot say so', Sync.status().state === 'conflict' && dot()?.dataset.state === 'conflict' && Sync.status().conflicts === 1, Sync.status().state);
await click('#sync-dot', { right: true });
await wait(250);
const menuText = document.getElementById('menu')?.textContent || '';
step('right-click the dot: sync now, conflicts, pause, open the folder, big videos', /Sync now/.test(menuText) && /Conflicts/.test(menuText) && /Pause sync/.test(menuText) && /cloud folder/.test(menuText) && /Sync big videos/.test(menuText), menuText.slice(0, 200));
await smoke({ shot: '/tmp/sync-menu.png' });
hideMenu();
const cd = await Sync.conflicts();
await wait(300);
const row = cd.querySelector('.sync-row');
step('conflicts view: the chat, the field, both versions', /Renamed here/.test(row?.textContent || '') && /Renamed on the Mac/.test(row?.textContent || '') && /title/.test(row?.textContent || ''), row?.textContent?.slice(0, 160));
await smoke({ shot: '/tmp/sync-conflicts.png' });
const before = (await window.hub.getChat('synctest-mine')).title;
await click([...cd.querySelectorAll('.sync-row button')].find((b) => /other one/.test(b.textContent)));
await wait(600);
const after = (await window.hub.getChat('synctest-mine')).title;
step('"Use the other one" swaps the version', before !== after && /Renamed/.test(after), { before, after });
cd.close();
await wait(200);
await Sync.now();
await until(() => Sync.status().state === 'synced', 8000);
step('resolved: synced again', Sync.status().state === 'synced' && dot()?.dataset.state === 'synced');

// 5. pause / resume from the dot's menu
await click('#sync-dot', { right: true });
await wait(250);
await click([...document.querySelectorAll('#menu button')].find((b) => /Pause sync/.test(b.textContent)));
await until(() => Sync.status().paused, 4000);
step('paused from the menu: the dot is paused', Sync.status().paused && dot()?.dataset.state === 'paused');
await run('/sync resume');
await until(() => !Sync.status().paused, 4000);
step('/sync resume', !Sync.status().paused);

// 6. deleted files: a chat deleted here goes to the synced trash and comes back
await window.hub.deleteChat('synctest-theirs'); // Hearth's own delete: chats → data/trash (a move)
await Sync.now();
const cloudTrashed = await window.hub.fs.stat(F('trash/synctest-theirs.json')).catch(() => null);
step('a deleted chat moves in the cloud copy too (to Hearth\'s trash folder)', Boolean(cloudTrashed));
await window.hub.restoreChat('synctest-theirs');
await Sync.now();
step('restored', Boolean(await window.hub.fs.stat(F('chats/synctest-theirs.json')).catch(() => null)));

// 7. /sync status in a chat: plain words, no tokens
await run('/sync status');
step('/sync status answers in the chat', /Everything is synced/.test(lastNote()), lastNote().slice(0, 120));
step('the keys sheet lists the dot\'s right-click', Keys.all().some((k) => /sync dot/.test(k.keys)));
step('no duplicate command names', !Commands.duplicates?.().length, Commands.duplicates?.());
await smoke({ shot: '/tmp/sync-dot.png' });
await api.off();
return J.done();
