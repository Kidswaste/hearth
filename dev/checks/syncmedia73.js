// (round 73, syncmedia73) Big files and choice in the sync panel, by clicks: a big render on its way shows as its own row
// with a progress bar that moves in place (the panel isn't rebuilt for a percentage); a chat saved meanwhile reaches the
// cloud folder while the render still copies (two lanes); "What syncs" opens from the panel with a toggle and sizes per
// kind; turning Lab captures off says nothing is deleted, keeps a new capture out of the cloud, and on again sends it;
// "Free up space on this computer…" lists the big synced files first and, on a computer whose cloud drive can't make
// files online-only (this Linux box), says so plainly and changes nothing. The ⋯ menu reaches both. Only a temp folder
// is used as the cloud; a big file's copy is slowed only for this check (data/sync/test-slow.json, test runs only).
//   node dev/smoke.js --check-timeout 240000 --lib dev/checks/journey-lib.js --script dev/checks/syncmedia73.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const claude = H.claudeAgent();
const CLOUD = `/tmp/hearth-syncmedia73-${Date.now()}`;
const F = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const dot = () => document.getElementById('sync-dot');
const chip = () => dot()?.querySelector('.sync-chip')?.textContent || '';
const panel = () => document.querySelector('.sync-panel');
const btn = (re, root = panel()) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent));
const exists = async (p) => { try { return Boolean(await window.hub.fs.stat(p)); } catch { return false; } };
Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
const dataDir = (await window.hub.attachmentsDir()).replace(/[\\/]attachments$/, '');

// 0. sync on, "the other computer" (a Mac) already in the cloud folder
const MAC = { id: 'studio-mac-5e6f7a8b', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
await window.hub.saveChat({ id: 'syncmedia73-a', agentId: claude.id, title: 'Before the render', updatedAt: Date.now(), messages: [{ role: 'user', at: 1, text: 'hello' }] });
await api.on({ root: CLOUD });
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 20000);
await wait(1500);
const gotIt = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await wait(300); }

// 1. a big render goes up on its own lane, with a progress bar that moves in place
await window.hub.fs.write(`${dataDir}/sync/test-slow.json`, '350'); // 350 ms per 4 MB piece: ≈ 4 s for this render
const SIZE = 48 * 1024 * 1024;
await window.hub.fs.write(`${dataDir}/renders/Intro final.mp4`, 'v'.repeat(SIZE));
await click('#sync-dot');
await until(() => panel()?.querySelector('h2'), 20000);
step('the sync panel opens', Boolean(panel()));
if (!panel()) return J.done();
await click(btn(/^Sync now$/));
await until(() => panel()?.querySelector('.sp-moving .sp-bar'), 12000);
const row = () => panel()?.querySelector('.sp-moving .sp-tr');
step('a big render on its way: its own row, by name, "↑", with a bar', /Big files on their way \(1\)/.test(panel()?.querySelector('.sp-moving')?.textContent || '') && /↑ .*Intro final/.test(row()?.textContent || '') && row()?.querySelector('[role="progressbar"]'), panel()?.querySelector('.sp-moving')?.textContent?.slice(0, 200));
step('…and not listed a second time under Waiting', ![...panel().querySelectorAll('.sp-sec:not(.sp-moving) .sp-wait li')].some((li) => /Intro final/.test(li.textContent)), [...panel().querySelectorAll('.sp-wait li')].map((li) => li.textContent));
const bar0 = row()?.querySelector('.sp-bar > i'); const v0 = Number(row()?.querySelector('.sp-bar')?.getAttribute('aria-valuenow'));
let adds = 0; const mo = new MutationObserver((ms) => { for (const m of ms) if (m.type === 'childList' && m.target === panel()) adds += 1; });
mo.observe(panel(), { childList: true });
// 2. a chat saved now reaches the cloud folder while the render still copies
await window.hub.saveChat({ id: 'syncmedia73-b', agentId: claude.id, title: 'Written while the render copies', updatedAt: Date.now(), messages: [{ role: 'user', at: 2, text: 'not waiting' }] });
await click(btn(/^Sync now$/));
const chatUp = await until(async () => exists(F('chats/syncmedia73-b.json')), 6000);
step('a chat saved meanwhile is in the cloud folder while the render is still on its way (two lanes)', chatUp && (Sync.status().transfers || []).length === 1 && !(await exists(F('renders/Intro final.mp4'))), { chatUp, moving: Sync.status().transfers });
await wait(1200);
const v1 = Number(row()?.querySelector('.sp-bar')?.getAttribute('aria-valuenow'));
const bar1 = row()?.querySelector('.sp-bar > i');
step('the bar moves in place: the same element (kept even when the panel redraws for the chat), a higher percentage', bar1 && bar1 === bar0 && v1 > v0, { v0, v1, same: bar1 === bar0, redraws: adds });
mo.disconnect();
await smoke({ shot: '/tmp/syncmedia73-moving.png' });
await window.hub.fs.write(`${dataDir}/sync/test-slow.json`, '0');
await until(() => !(Sync.status().transfers || []).length && Sync.status().state === 'synced', 30000);
await until(() => !panel()?.querySelector('.sp-moving'), 4000);
step('done: the row goes, the render is whole in the cloud folder, "✓ Synced"', !panel()?.querySelector('.sp-moving') && (await window.hub.fs.stat(F('renders/Intro final.mp4')))?.size === SIZE && /✓ Synced/.test(chip()), chip());

// 3. What syncs: a fold in the panel, a toggle and sizes per kind
const fold = () => btn(/^What syncs: /);
step('"What syncs: everything ›" is in the panel', /^What syncs: everything ›$/.test(fold()?.textContent || ''), fold()?.textContent);
await click(fold());
await until(() => panel()?.querySelector('.sp-kind'), 4000);
const kinds = [...panel().querySelectorAll('.sp-kind')];
const label = (id) => panel().querySelector(`.sp-kind[data-kind="${id}"]`);
step('every kind with a toggle, all on but the per-computer runtime', ['Chats', 'Projects & scenes', 'Lab captures', 'Renders', 'Music sketches & stems', 'Photos', 'Tickets'].every((t) => kinds.some((k) => k.querySelector('b')?.textContent === t && k.querySelector('input').checked)) && label('runtime') && !label('runtime').querySelector('input').checked, kinds.map((k) => `${k.querySelector('b')?.textContent}:${k.querySelector('input').checked}`));
step('sizes shown: Renders 48.0 MB here and in the cloud', /48\.0 MB here · 48\.0 MB in the cloud/.test(label('renders')?.textContent || ''), label('renders')?.textContent);
step('each toggle is named', kinds.every((k) => /^Sync /.test(k.querySelector('input').getAttribute('aria-label') || '')));
await smoke({ shot: '/tmp/syncmedia73-kinds.png' });
// Lab captures off: says nothing is deleted; a new capture stays out of the cloud
await click(label('captures').querySelector('input'));
await until(() => Sync.status().kinds?.find((k) => k.id === 'captures')?.on === false, 6000);
step('turning Lab captures off says it plainly: nothing is deleted', recentToasts().some((t) => /Lab captures stop syncing/.test(t.message) && /Nothing is deleted/.test(t.message)), recentToasts().slice(-2).map((t) => t.message));
await until(() => /everything but Lab captures/.test(fold()?.textContent || ''), 4000);
step('the fold says it: "everything but Lab captures"; the row says "off here: left where it is"', /everything but Lab captures/.test(fold()?.textContent || '') && /off here: left where it is/.test(label('captures')?.textContent || ''), [fold()?.textContent, label('captures')?.textContent]);
await window.hub.fs.write(`${dataDir}/captures/syncmedia73-shot.png`, 'a capture');
await click(btn(/^Sync now$/));
await until(() => Sync.status().state === 'synced', 8000);
step('a new capture stays on this computer while captures are off, still "Synced"', !(await exists(F('captures/syncmedia73-shot.png'))) && Sync.status().state === 'synced' && (await exists(`${dataDir}/captures/syncmedia73-shot.png`)));
await click(label('captures').querySelector('input'));
await until(() => Sync.status().kinds?.find((k) => k.id === 'captures')?.on === true, 6000);
await click(btn(/^Sync now$/));
const sent = await until(async () => exists(F('captures/syncmedia73-shot.png')), 8000);
step('on again: it goes up', sent);

// 4. Free up space: the list first; this computer's cloud drive can't do it: said plainly, nothing changed
await click(btn(/^Free up space on this computer…$/));
await until(() => /Not possible|Nothing to free|safely in the cloud/.test(panel()?.textContent || '') && !/Looking for/.test(panel()?.textContent || ''), 8000);
const ptxt = panel()?.textContent || '';
step('Free up space: its own view in the panel', /Free up space on this computer/.test(panel()?.querySelector('h2')?.textContent || ''), panel()?.querySelector('h2')?.textContent);
step('here (no online-only files on this computer): "Not possible…" in plain words, how many would qualify, nothing changed', /Not possible with this cloud drive/.test(ptxt) && /aren't available|can't/.test(ptxt) && /1 big file, 48\.0 MB, would qualify\. Nothing was changed\./.test(ptxt) && !btn(/Make them online-only/), ptxt.slice(0, 300));
await smoke({ shot: '/tmp/syncmedia73-free.png' });
await click(btn(/^‹ Back$/));
await until(() => btn(/^Sync now$/), 4000);
step('‹ Back returns to the panel', Boolean(btn(/^Sync now$/)));

// 5. the ⋯ menu reaches both
const labels = Sync.items().map((x) => (typeof x === 'string' ? x : x?.label));
step('the ⋯ menu has "What syncs…" and "Free up space on this computer…"', labels.includes('What syncs…') && labels.includes('Free up space on this computer…'), labels);
await J.key('Escape');
await until(() => !panel(), 2000);
await Sync.panelAt('free');
await until(() => /Free up space on this computer/.test(panel()?.querySelector('h2')?.textContent || ''), 6000);
step('from the menu, the panel opens straight at Free up space', /Free up space on this computer/.test(panel()?.querySelector('h2')?.textContent || ''));
await J.key('Escape');
await api.off();
return J.done();
