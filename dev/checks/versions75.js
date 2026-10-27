// (round 75, versions75) 🕘 Earlier versions and Deleted things, by clicks: right-click a chat › Earlier versions… → the
// timeline (when, which computer, "2 messages fewer", where it was kept) → Preview (read-only) → Restore this version →
// the chat is the old one, the toast's Undo puts it back; the sync panel's Earlier versions… → find the chat → its
// timeline lists "kept before a restore"; a project's menu › Earlier versions… → restore its notes; Deleted things →
// Restore a deleted chat; Escape closes; every button named. Sync runs against a temp folder only.
//   node dev/smoke.js --check-timeout 240000 --lib dev/checks/journey-lib.js --script dev/checks/versions75.js
const { step, wait, until, click } = J;
const claude = H.claudeAgent();
const CLOUD = `/tmp/hearth-versions75-${Date.now()}`;
const dlg = () => [...document.querySelectorAll('dialog.vs-dialog')].filter((d) => d.open).at(-1) || null;
const btnIn = (root, re) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const menuItem = (re) => [...document.querySelectorAll('#menu button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const toastBtn = (re) => [...document.querySelectorAll('.toast button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const M = (i, text) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', at: 1000 + i, text });
const msgs = (n) => Array.from({ length: n }, (_, i) => M(i, `message ${i + 1}`));
const chatNow = async (id) => window.hub.getChat(id);

// 0. sync on (a temp folder): its base keeps the version both computers had, the one before it too
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
const id = `vs75-${Date.now().toString(36)}`;
await window.hub.saveChat({ id, agentId: claude.id, title: 'Intro video', updatedAt: Date.now(), messages: msgs(3) });
await window.hub.sync.on({ root: CLOUD });
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 20000);
await Sync.now({ quiet: true }).catch(() => {});
await window.hub.saveChat({ id, agentId: claude.id, title: 'Intro video v2', updatedAt: Date.now(), messages: msgs(5) });
await wait(400);
await Sync.now({ quiet: true }).catch(() => {});
await until(() => Sync.status().state === 'synced', 20000);
H.chats = await window.hub.listChats(); Panel.render();
await click('.space-chats'); // the chats list (rail › Chats)
await until(() => J.visible(document.querySelector(`#chat-groups .item[data-key="${CSS.escape(id)}"]`)), 8000);
const row = await until(() => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(id)}"]`), 8000) && document.querySelector(`#chat-groups .item[data-key="${CSS.escape(id)}"]`);
step('the chat is in the list', Boolean(row));

// 1. right-click › Earlier versions…
await click(row, { right: true });
await until(() => menuItem(/^Earlier versions…$/), 3000);
step('right-click a chat: "Earlier versions…" is in its menu', Boolean(menuItem(/^Earlier versions…$/)));
await click(menuItem(/^Earlier versions…$/));
await until(() => dlg()?.querySelector('.vs-row'), 12000);
const rows = () => [...(dlg()?.querySelectorAll('.vs-row') || [])];
const three = () => rows().find((r) => /2 messages fewer/.test(r.textContent));
step('the timeline opens with the earlier versions', rows().length >= 1, rows().map((r) => r.textContent.slice(0, 90)));
step('a version says what differs in plain words ("2 messages fewer", the old title)', Boolean(three()) && /title “Intro video”/.test(three()?.textContent || ''), three()?.textContent);
step('…and which computer and where it was kept', /both computers/.test(three()?.textContent || '') && /synced version/.test(three()?.textContent || ''), three()?.textContent);
await until(() => /Looked in:/.test(dlg()?.querySelector('.vs-status')?.textContent || ''), 15000);
step('it says where it looked (backups too)', /Looked in:.*sync.*backups/.test(dlg()?.querySelector('.vs-status')?.textContent || ''), dlg()?.querySelector('.vs-status')?.textContent);

// 2. Preview: read-only
await click(btnIn(three(), /^Preview$/));
await until(() => document.querySelector('dialog.vs-pv[open]'), 4000);
const pv = document.querySelector('dialog.vs-pv[open]');
step('Preview shows that version, read-only', pv?.querySelectorAll('.vs-msg').length === 3 && !pv.querySelector('textarea, [contenteditable="true"], input:not([type="search"])'), pv?.querySelectorAll('.vs-msg').length);
step('Preview says what differs from now', /Compared with now: 2 messages fewer/.test(pv?.textContent || ''));

// 3. Restore this version → the chat is the old one; the one it replaced is kept (Undo)
await click(btnIn(pv, /^Restore this version$/));
await until(async () => (await chatNow(id))?.messages?.length === 3, 6000);
const after = await chatNow(id);
step('Restore: the chat is the earlier version (3 messages, its old title)', after?.messages?.length === 3 && after.title === 'Intro video', { n: after?.messages?.length, title: after?.title });
step('Restore: the dialogs close', !dlg());
await until(() => toastBtn(/^Undo$/), 3000);
step('a toast says the version you had is kept, with Undo', Boolean(toastBtn(/^Undo$/)));
await click(toastBtn(/^Undo$/));
await until(async () => (await chatNow(id))?.messages?.length === 5, 6000);
step('Undo puts the 5-message chat back', (await chatNow(id))?.messages?.length === 5 && (await chatNow(id))?.title === 'Intro video v2');

// 4. the sync panel › Earlier versions… → find the chat → its timeline
await click('#sync-dot');
await until(() => document.querySelector('.sync-panel'), 4000);
const evBtn = btnIn(document.querySelector('.sync-panel'), /^Earlier versions…$/);
step('the sync panel has "Earlier versions…"', Boolean(evBtn));
await click(evBtn);
await until(() => dlg()?.querySelector('.vs-q'), 6000);
step('it opens "Earlier versions of synced things"', /Earlier versions of synced things/.test(dlg()?.textContent || ''));
await click(dlg().querySelector('.vs-q'));
await J.type('Intro video');
await wait(200);
const hit = [...dlg().querySelectorAll('.vs-thing')].find((b) => /Intro video v2/.test(b.textContent));
step('typing finds the chat', Boolean(hit));
await click(hit);
await until(() => dlg()?.querySelector('.vs-row'), 12000);
step('its timeline lists the version kept before the restore (this computer)', rows().some((r) => /kept before a restore/.test(r.textContent)), rows().map((r) => r.textContent.slice(0, 80)));
const unnamed = [...dlg().querySelectorAll('button')].filter((b) => !(b.textContent.trim() || b.getAttribute('aria-label')));
step('every button in the timeline has a name', !unnamed.length, unnamed.length);
await J.key('Escape');
await until(() => !dlg(), 2000);
step('Escape closes it', !dlg());

// 5. a project: its menu › Earlier versions… → its notes as they were
if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
const p = Projects.create({ name: 'Versions check' });
Projects.setNotes(p, 'goal\nmusic\nlook\ntodo');
await Projects.flush();
await Sync.now({ quiet: true }).catch(() => {});
Projects.setNotes(p, 'goal\nmusic BAD\nlook\ntodo');
await Projects.flush();
await wait(300);
await Sync.now({ quiet: true }).catch(() => {});
showMenu(200, 200, Projects.menu(p));
await until(() => menuItem(/^Earlier versions…$/), 3000);
step('a project\'s menu has "Earlier versions…"', Boolean(menuItem(/^Earlier versions…$/)));
await click(menuItem(/^Earlier versions…$/));
await until(() => rows().some((r) => /notes: 1 line changed/.test(r.textContent)), 12000);
const nrow = rows().find((r) => /notes: 1 line changed/.test(r.textContent));
step('the project\'s timeline: "notes: 1 line changed"', Boolean(nrow), rows().map((r) => r.textContent.slice(0, 80)));
if (nrow) await click(btnIn(nrow, /^Restore$/));
await until(() => Projects.get(p.id)?.notes === 'goal\nmusic\nlook\ntodo', 5000);
step('Restore: the project\'s notes are back (changed in the window, so nothing saves the old ones over them)', Projects.get(p.id)?.notes === 'goal\nmusic\nlook\ntodo', Projects.get(p.id)?.notes);
await until(async () => (await window.hub.kvGet('projects', null))?.list?.find((x) => x.id === p.id)?.notes === 'goal\nmusic\nlook\ntodo', 3000);
step('…and saved (sync sends it like any edit)', (await window.hub.kvGet('projects', null))?.list?.find((x) => x.id === p.id)?.notes === 'goal\nmusic\nlook\ntodo');

// 6. Deleted things: a deleted chat comes back
const gone = `vs75-gone-${Date.now().toString(36)}`;
await window.hub.saveChat({ id: gone, agentId: claude.id, title: 'Old idea', updatedAt: Date.now(), messages: msgs(2) });
await window.hub.deleteChat(gone);
H.chats = await window.hub.listChats(); Panel.render();
await Versions.home({ tab: 'deleted' });
await until(() => /Old idea/.test(dlg()?.textContent || ''), 8000);
const drow = [...(dlg()?.querySelectorAll('.vs-del li') || [])].find((li) => /Old idea/.test(li.textContent));
step('Deleted things lists the deleted chat (when, how many messages, where)', Boolean(drow) && /2 messages/.test(drow?.textContent || '') && /Recently deleted/.test(drow?.textContent || ''), drow?.textContent);
step('Deleted things has the four kinds', ['Chats', 'Projects', 'Lab scenes', 'Boards'].every((t) => new RegExp(t).test(dlg()?.textContent || '')));
await click(btnIn(drow, /^Restore$/));
await until(async () => Boolean(await chatNow(gone)), 5000);
step('Restore brings it back into the list', Boolean(await chatNow(gone)) && (H.chats || []).some((c) => c.id === gone));
await J.key('Escape');
await until(() => !dlg(), 2000);

// 7. a Lab scene: ▦ All your sketches › right-click a card › Earlier versions… → a time machine version → Restore
activate('tool:three');
await ThreeLab.cmd?.();
await until(() => ThreeLab.scenes && typeof ThreeHistory !== 'undefined', 30000);
const L = ThreeLab.scenes;
const sc = L.create({ name: 'Versions scene', code: '// first\nconst a = 1;', open: true });
await wait(1200);
await ThreeHistory.capture(sc.id, { force: true, label: 'first' });
const x = L.get(sc.id);
x.layers = L.layersOf(x).map((l, i) => (i ? l : { ...l, code: '// second\nconst a = 2;\nconst b = 3;' }));
L.changed(sc.id);
await ThreeHistory.capture(sc.id, { force: true, label: 'second' });
const C = await ThreeLab.cmd();
C.browse(); // ▦ All your sketches (its toolbar button / the Lab's menu / O)
const browse = await until(() => document.querySelector('.sb-grid'), 4000);
step('the Lab\'s All your sketches', Boolean(browse));
if (browse) {
  const card = await until(() => [...document.querySelectorAll('.sb-card')].find((c) => /Versions scene/.test(c.textContent) && J.visible(c)), 5000) && [...document.querySelectorAll('.sb-card')].find((c) => /Versions scene/.test(c.textContent));
  await click(card, { right: true });
  await until(() => menuItem(/^Earlier versions…$/), 3000);
  step('right-click a scene card: "Earlier versions…"', Boolean(menuItem(/^Earlier versions…$/)));
  await click(menuItem(/^Earlier versions…$/));
  await until(() => rows().some((r) => /Lab time machine/.test(r.textContent)), 12000);
  const tmRow = rows().find((r) => /Lab time machine/.test(r.textContent));
  step('the scene\'s timeline has its time machine versions (who made it, its label)', Boolean(tmRow), rows().map((r) => r.textContent.slice(0, 80)));
  if (tmRow) {
    await click(btnIn(tmRow, /^Preview$/));
    await until(() => document.querySelector('dialog.vs-pv[open]'), 4000);
    step('Preview shows the scene\'s code then', /const a = 1;/.test(document.querySelector('dialog.vs-pv[open]')?.textContent || ''));
    await click(btnIn(document.querySelector('dialog.vs-pv[open]'), /^Restore this version$/));
    await until(() => /const a = 1;/.test(L.layersOf(L.get(sc.id))[0].code), 5000);
    step('Restore: the scene is back to that version (through the time machine, undoable there too)', /const a = 1;/.test(L.layersOf(L.get(sc.id))[0].code));
  }
}
await J.key('Escape'); await wait(200); await J.key('Escape');

await window.hub.sync.off?.();
return J.done();
