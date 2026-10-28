// (round 76, projsync76) A project across two computers, in the app, by clicks: the Desk's sync status line ("✓ All
// here · synced …", "↻ 1 file still arriving from Studio Mac", a click opens the sync panel); a project deleted on the
// other computer while it changed here → kept with "Deleted elsewhere?" and Keep it / Delete it on its Desk (Keep it
// folds the deleted copy's note in, nothing lost); the open project deleted on the other computer → a toast with
// Restore; a project opened before its chat arrived → "Still arriving from Studio Mac…", opening by itself once it
// lands. Sync runs on a temp folder; "the other computer" is a machine record in it. Arrivals are what Sync's own
// onPulled does (the store written, then hearth:synced).
//   node dev/smoke.js --check-timeout 240000 --lib dev/checks/journey-lib.js --script dev/checks/projsync76.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const CLOUD = `/tmp/hearth-projsync76-${Date.now()}`;
const MAC = { id: 'studio-mac-76a2b3c4', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
await api.on({ root: CLOUD });
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 20000);
await wait(1200);
const gotIt = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await wait(300); }
// what Sync.onPulled does when a store arrives: written, then hearth:synced
const arrive = async (files) => { dispatchEvent(new CustomEvent('hearth:synced', { detail: { files: files.map((rel) => ({ rel, kind: 'json', from: 'Studio Mac' })) } })); await wait(400); };
const line = () => document.querySelector('.pj-sync-line');

// 1. the Desk's line
await Lazy.load('projects'); await Projects.ready();
const p = await ProjectWorkspace.create({ name: 'Twin desk', plugins: [] });
await ProjectWorkspace.go('overview');
await until(() => line() && J.visible(line()), 15000);
await until(() => /All here/.test(line()?.textContent || ''), 8000);
step('the Desk says "✓ All here · synced …" under the project\'s name', /^✓ All here · synced (just now|\d+ (sec|min)s? ago|a moment ago|.+ ago)$/.test(line()?.textContent || ''), line()?.textContent);
step('…its name and tooltip say it plainly', /^Sync status: All here/.test(line()?.getAttribute('aria-label') || '') && /Click: the sync panel/.test(line()?.title || ''), { name: line()?.getAttribute('aria-label'), title: line()?.title });
Projects.add(Projects.get(p.id), 'chat', 'claude-late-chat', 'Late chat', { links: false });
await until(() => /still arriving/.test(line()?.textContent || ''), 8000);
step('a chat of the project not here yet → "↻ 1 file still arriving from Studio Mac"', line()?.textContent === '↻ 1 file still arriving from Studio Mac' && /Late chat/.test(line()?.title || ''), { text: line()?.textContent, title: line()?.title });
await smoke({ shot: '/tmp/projsync76-desk-line.png' });
await click(line());
await until(() => document.querySelector('.sync-panel'), 5000);
step('a click on it opens the sync panel', Boolean(document.querySelector('.sync-panel')));
await J.key('Escape'); await until(() => !document.querySelector('.sync-panel'), 2000);
// it lands: the line comes back to All here by itself
const late = { id: 'claude-late-chat', agentId: H.claudeAgent().id, title: 'Late chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [], session: {} };
await window.hub.saveChat(late); H.chats = await window.hub.listChats();
await arrive(['chats/claude-late-chat.json']);
await until(() => /All here/.test(line()?.textContent || ''), 8000);
step('when it lands, the line says All here again by itself', /^✓ All here/.test(line()?.textContent || ''), line()?.textContent);

// 2. deleted on the other computer while it changed here: kept, with the choice on its Desk
await Projects.flush();
const store = await window.hub.kvGet('projects');
const mine = store.list.find((x) => x.id === p.id);
const merged = { ...store, list: store.list.map((x) => (x.id === p.id ? { ...x, notes: 'Changed here after the delete' } : x)), trash: [{ ...mine, notes: 'The Mac\'s last note', deletedAt: Date.now() - 120000 }, ...(store.trash || [])] };
await window.hub.kvSet('projects', merged);
await arrive(['kv/projects.json']);
await until(() => document.querySelector('.pj-revived'), 8000);
const toastText = [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).join(' | ');
step('a toast says it was deleted on the other computer but kept, with Open', /deleted on your other computer, but it changed since, so it's kept/.test(toastText), toastText.slice(0, 300));
const rv = document.querySelector('.pj-revived');
step('its Desk says so, with Keep it / Delete it', /Deleted on your other computer \(2 min ago\), but it changed after that/.test(rv?.textContent || '') && [...rv.querySelectorAll('button')].map((b) => b.textContent).join() === 'Keep it,Delete it', rv?.textContent);
step('it isn\'t listed in Recently deleted meanwhile', !Projects.trashed().some((x) => x.id === p.id));
await smoke({ shot: '/tmp/projsync76-revived.png' });
await click([...rv.querySelectorAll('button')].find((b) => b.textContent === 'Keep it'));
await until(() => !document.querySelector('.pj-revived'), 5000);
await Projects.flush();
const after = (await window.hub.kvGet('projects'));
const kept = after.list.find((x) => x.id === p.id);
step('Keep it: one project, both notes (nothing lost), out of Recently deleted, no mark', kept && !kept.revived && /Changed here after the delete/.test(kept.notes) && /The Mac's last note/.test(kept.notes) && !(after.trash || []).some((x) => x.id === p.id), { notes: kept?.notes, trash: (after.trash || []).map((x) => x.id) });

// 3. the open project deleted on the other computer (no change here): a toast with Restore
document.querySelectorAll('#toasts .toast').forEach((t) => t.remove());
const s2 = await window.hub.kvGet('projects');
const cur = s2.list.find((x) => x.id === p.id);
await window.hub.kvSet('projects', { ...s2, list: s2.list.filter((x) => x.id !== p.id), trash: [{ ...cur, deletedAt: Date.now() }, ...(s2.trash || [])] });
await arrive(['kv/projects.json']);
await until(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /was deleted on your other computer/.test(t.textContent)), 6000);
const gone = [...document.querySelectorAll('#toasts .toast')].find((t) => /was deleted on your other computer/.test(t.textContent));
step('the open project deleted on the other computer: a toast says its things stay, with Restore', /Its chats, scenes and files stay here/.test(gone?.textContent || '') && /Restore/.test(gone?.querySelector('button')?.textContent || ''), gone?.textContent);
await click(gone.querySelector('button'));
await until(() => Projects.get(p.id), 3000);
step('Restore brings it back', Boolean(Projects.get(p.id)) && !Projects.trashed().some((x) => x.id === p.id));
await ProjectWorkspace.home();

// 4. a project opened before its chat arrived: a calm wait, then it opens by itself
const qid = `pj76arrive${Date.now().toString(36)}`;
const chatId = `${H.claudeAgent().id}-project-${qid}`;
const s3 = await window.hub.kvGet('projects');
const q = Projects.core.create({ id: qid, name: 'Made on the Mac', items: [{ type: 'chat', ref: chatId, name: 'Made on the Mac' }] });
q.workspace = ProjectWorkspaceCore.workspace({ chatId });
await window.hub.kvSet('projects', { ...s3, list: [q, ...s3.list] });
await arrive(['kv/projects.json']);
await until(() => Projects.get(qid), 3000);
ProjectWorkspace.open(qid).catch(() => {});
await until(() => document.querySelector('.pw-loading.pw-arriving'), 10000);
const card = document.querySelector('.pw-loading');
step('opening it before its chat arrived: "Still arriving from Studio Mac…", calm (not failed)', /Still arriving from Studio Mac…/.test(card?.textContent || '') && !card.classList.contains('failed') && /opens by itself/.test(card.textContent), card?.textContent.slice(0, 300));
step('…with Try now and Back to projects', ['Try now', 'Back to projects'].every((t) => [...card.querySelectorAll('button')].some((b) => b.textContent === t)));
await smoke({ shot: '/tmp/projsync76-arriving.png' });
const qc = { id: chatId, agentId: H.claudeAgent().id, title: 'Made on the Mac', createdAt: Date.now(), updatedAt: Date.now(), messages: [{ role: 'user', at: Date.now(), text: 'started on the Mac' }], session: {} };
await window.hub.saveChat(qc); H.chats = await window.hub.listChats();
await arrive([`chats/${chatId}.json`]);
await until(() => ProjectWorkspace.current()?.id === qid && ProjectWorkspace.state().phase === 'ready', 30000);
step('when the chat lands, the project opens by itself', ProjectWorkspace.current()?.id === qid && ProjectWorkspace.state().phase === 'ready', ProjectWorkspace.state());
step('…with its own chat (no second chat made)', ProjectWorkspace.currentChat()?.id === chatId && Projects.get(qid).items.filter((x) => x.type === 'chat').length === 1);
await ProjectWorkspace.home();
await api.off();
return J.done();
