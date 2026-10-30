// (round 91, projaudit91) Every project flow on one computer, by clicks, the way the owner works:
//   create   from the name ▾ switcher (＋ New project → the card → Create project ↗), from a chat (the chats list:
//            right-click › Project › ＋ New project…), from a Lab scene (Sketches card: right-click › Project › ＋ New…)
//   look     rename (a click on the name on the Desk), a cover (a capture's right-click › Use as the cover), the colour
//            (right-click the mark) and the mark (a click)
//   move     a chat / a scene / a file into the project (＋ Add) and out (Take out of …); a file dropped from the
//            computer on the Desk joins the project; a chat dragged from the chats list onto the Desk joins it
//   switch   the name ▾ (a click), the keyboard (the ▾ focused: Enter, ↓, Enter) and Ctrl/⌘+K (the project's name, Enter)
//   status   Archive (⋯ › Status › Archived: out of the switcher, in Projects ⋯ › Archived projects; back to Active)
//   delete   ⋯ › Delete the project… → the toast's Undo; then delete again → Deleted things (Ctrl/⌘+K) › Restore
//   Lab      a new scene made in the Lab while a project is open joins it; Projects.here() in the Lab is the project
// Only the check's own temp data folder is used (smoke.js), never real data.
//   node dev/smoke.js --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/projaudit91.js
const { step, wait, until, click } = J;
J.shotDir = window.SMOKE_TMP || '/tmp';
const claude = H.claudeAgent();
const menuItem = (re) => [...document.querySelectorAll('#menu button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const pickMenu = async (re, ms = 4000) => { await until(() => menuItem(re), ms); const b = menuItem(re); if (b) await click(b); return Boolean(b); };
const modalInput = () => [...document.querySelectorAll('dialog[open] input:not([type=checkbox]), dialog[open] textarea')].find((n) => J.visible(n));
const answer = async (text) => { await until(() => modalInput(), 4000); const i = modalInput(); if (!i) return false; i.focus(); i.select?.(); await J.type(text); await J.key('Enter'); await wait(250); return true; };
const nameBtn = () => document.querySelector('.workspace-switcher .workspace-project-name');
const byName = (n) => Projects.all().find((p) => p.name === n) || null;
const deskName = () => document.querySelector('.pj-home .pj-p-name')?.textContent || '';
const toastBtn = (re) => [...document.querySelectorAll('.toast button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const timed = async (fn) => { const t = performance.now(); const r = await fn(); return { r, ms: Math.round(performance.now() - t) }; };
const slow = {};
let loose = null;
const fileRow = async (re) => { const d = document.querySelector('.pj-home .pw-project-files'); if (d && !d.open) { d.open = true; await wait(200); } await until(() => [...document.querySelectorAll('.pj-home .pw-project-files .pj-item')].some((r) => re.test(r.textContent)), 4000); return [...document.querySelectorAll('.pj-home .pw-project-files .pj-item')].find((r) => re.test(r.textContent)) || null; };
const dropOn = (node, dataTransfer) => { const r = node.getBoundingClientRect(); for (const type of ['dragenter', 'dragover', 'drop']) { const ev = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'dataTransfer', { value: dataTransfer }); Object.assign(ev, { clientX: r.left + 40, clientY: r.top + 200 }); node.dispatchEvent(ev); } };
const onDesk = async (id) => { if (ProjectWorkspace.current()?.id !== id) await ProjectWorkspace.open(id); await ProjectWorkspace.go('overview'); await until(() => J.visible(document.querySelector('.pj-home .pj-p-name')) && Projects.get(id) && deskName() === Projects.get(id).name, 15000); };
const section = async (name, fn) => { try { await fn(); } catch (err) { step(`${name}: stopped`, false, String(err?.message || err).slice(0, 300)); await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/pa91-${name.slice(0, 12).replace(/\W+/g, '-')}.png` }).catch(() => {}); } for (const d of document.querySelectorAll('dialog[open]')) try { d.close(); } catch { /* */ } hideMenu?.(); };


await Lazy.load('projects'); await Projects.ready();
// two projects to switch between (made by the app's own create, as the wizard does)
const pa = await ProjectWorkspace.create({ name: 'Audit Alpha', plugins: [] });
const pb = await ProjectWorkspace.create({ name: 'Audit Beta', plugins: [] });
step('setup: two projects, the second open', ProjectWorkspace.current()?.id === pb.id, ProjectWorkspace.current()?.name);
await ProjectWorkspace.go('overview');
await until(() => deskName() === 'Audit Beta', 15000);

// ---------- 1. create from the name ▾ switcher ----------
await section('1. create from the name ▾ switcher', async () => {
await click(nameBtn());
const newFromSwitcher = await pickMenu(/^＋ New project$/);
await until(() => document.querySelector('dialog.pw-wizard[open]'), 5000);
const wiz = document.querySelector('dialog.pw-wizard[open]');
step('switcher › ＋ New project opens the new project card', newFromSwitcher && Boolean(wiz));
if (wiz) {
  const title = wiz.querySelector('input'); title.focus(); await J.type('Audit Gamma');
  const t0 = performance.now();
  await click([...wiz.querySelectorAll('button')].find((b) => /Create project/.test(b.textContent)));
  await until(() => byName('Audit Gamma') && ProjectWorkspace.current()?.name === 'Audit Gamma' && ProjectWorkspace.state().phase === 'ready', 30000);
  slow.createWizard = Math.round(performance.now() - t0);
  step('…Create project ↗ makes it and opens it', ProjectWorkspace.current()?.name === 'Audit Gamma', { ms: slow.createWizard });
}
});

// ---------- 2. create from a chat (the chats list) ----------
await section('2. create from a chat (the chats list)', async () => {
loose = { id: `pa91-loose-${Date.now().toString(36)}`, agentId: claude.id, title: 'Loose idea chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [{ role: 'user', at: 1, text: 'a loose idea' }] };
await window.hub.saveChat(loose); Native.adopt(loose, { openIt: false });
await click('.space-chats');
const rowSel = `#chat-groups .item[data-key="${CSS.escape(loose.id)}"]`;
await until(() => J.visible(document.querySelector(rowSel)), 8000);
await click(rowSel, { right: true });
const pjMenu = await pickMenu(/^Project›?$/);
const newFromChat = pjMenu && await pickMenu(/^＋ New project…$/);
const typed = newFromChat && await answer('Audit Delta');
await until(() => byName('Audit Delta'), 4000);
step('chat › right-click › Project › ＋ New project… makes a project with the chat in it', Boolean(typed && byName('Audit Delta')?.items.some((x) => x.type === 'chat' && x.ref === loose.id)), { pjMenu, newFromChat, typed, items: byName('Audit Delta')?.items });
});

// ---------- 3. create from a Lab scene (Sketches) ----------
await section('3. create from a Lab scene (Sketches)', async () => {
await Lazy.load('lab'); await ThreeLab.cmd({ show: true });
await until(() => ThreeLab.scenes?.all?.().length, 15000);
const sc = ThreeLab.scenes.all()[0];
(await ThreeLab.cmd({ show: true })).browse();
await until(() => document.querySelector('dialog.sb-dialog[open] .sb-card, dialog.sb-dialog[open] [data-id]'), 6000);
const card = [...document.querySelectorAll('dialog.sb-dialog[open] .sb-grid > *')][0];
step('the Lab\'s Sketches opens with its cards', Boolean(card), document.querySelector('dialog.sb-dialog[open]')?.textContent?.slice(0, 80));
if (card) {
  await click(card, { right: true });
  const m1 = await pickMenu(/^Project›?$/); const m2 = m1 && (await pickMenu(/^＋ New project…$/)); const m3 = m2 && (await answer('Audit Epsilon')); const ok3 = m3;
  await until(() => byName('Audit Epsilon'), 4000);
  step('Lab › Sketches › right-click a scene › Project › ＋ New project… makes a project with the scene', Boolean(ok3 && byName('Audit Epsilon')?.items.some((x) => x.type === 'scene')), { m1, m2, m3, items: byName('Audit Epsilon')?.items, menu: [...document.querySelectorAll('#menu button')].map((b) => b.textContent.trim()).slice(0, 14) });
  document.querySelector('dialog.sb-dialog[open]')?.close();
}
});

// ---------- 4. switch: the name ▾, the keyboard, Ctrl/⌘+K ----------
await section('4. switch: the name ▾, the keyboard, Ctrl/⌘+K', async () => {
await ProjectWorkspace.open(pa.id); await ProjectWorkspace.go('overview');
await until(() => deskName() === 'Audit Alpha', 15000);
{
  await click(nameBtn());
  await until(() => menuItem(/Audit Beta/), 3000);
  const { ms } = await timed(async () => { await click(menuItem(/Audit Beta/)); await until(() => ProjectWorkspace.current()?.id === pb.id && ProjectWorkspace.state().phase === 'ready', 20000); });
  slow.switchClick = ms;
  step('name ▾ › another project switches to it', ProjectWorkspace.current()?.id === pb.id, { ms });
}
{
  nameBtn()?.focus();
  await J.key('Enter');
  await until(() => menuItem(/Audit Alpha/), 3000);
  // the keyboard: ↓ until Audit Alpha is the marked row, Enter
  let moved = 0;
  for (let i = 0; i < 12 && !document.querySelector('#menu button.kb, #menu button[aria-selected="true"], #menu button:focus')?.textContent.includes('Audit Alpha'); i++) { await J.key('ArrowDown'); moved++; }
  await J.key('Enter');
  await until(() => ProjectWorkspace.current()?.id === pa.id && ProjectWorkspace.state().phase === 'ready', 20000);
  step('the keyboard: the ▾ focused, Enter opens it, ↓ … Enter switches', ProjectWorkspace.current()?.id === pa.id, { moved, now: ProjectWorkspace.current()?.name });
}
{
  await J.key('k', { ctrl: true });
  await until(() => document.querySelector('.palette-input'), 4000);
  await J.type('Audit Beta');
  await wait(500);
  const rows = [...document.querySelectorAll('.palette-item')].map((r) => r.textContent.trim()).slice(0, 5);
  step('Ctrl/⌘+K: the project\'s name offers the project first', /Project/.test(rows[0] || '') && /Audit Beta/.test(rows[0] || ''), rows);
  await J.key('Enter');
  await until(() => ProjectWorkspace.current()?.id === pb.id && ProjectWorkspace.state().phase === 'ready', 20000);
  step('…Enter opens that project', ProjectWorkspace.current()?.id === pb.id, ProjectWorkspace.current()?.name);
  if (document.querySelector('.palette-input')) await J.key('Escape');
}
});

// ---------- 5. rename, colour, mark, cover ----------
await section('5. rename, colour, mark, cover', async () => {
  await onDesk(pb.id);
await click('.pj-home .pj-p-name');
const renamed = await answer('Audit Beta Two');
await until(() => deskName() === 'Audit Beta Two', 4000);
step('a click on the name renames the project (Desk, switcher, data)', renamed && deskName() === 'Audit Beta Two' && /Audit Beta Two/.test(nameBtn()?.textContent || '') && Projects.get(pb.id).name === 'Audit Beta Two', { desk: deskName(), bar: nameBtn()?.textContent });
{
  const before = { ...Projects.get(pb.id).ident };
  await click('.pj-home .pj-p-mark', { right: true }); await wait(300);
  const afterColour = { ...Projects.get(pb.id).ident };
  await click('.pj-home .pj-p-mark'); await wait(300);
  const afterMark = { ...Projects.get(pb.id).ident };
  step('right-click the mark: the next colour; a click: the next mark', afterColour.ci !== before.ci && afterMark.gi !== afterColour.gi, { before, afterColour, afterMark });
}
{
  const cap = `${await window.hub.attachmentsDir()}/../captures/pa91-cover.png`.replace(/attachments\/\.\.\//, '');
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  await window.hub.fs.write(cap, png);
  Projects.add(Projects.get(pb.id), 'capture', cap, 'pa91-cover.png', { links: false });
  await until(() => [...document.querySelectorAll('.pj-home .pw-shelf-row, .pj-home .pj-item, .pj-home [data-item]')].some((r) => /pa91-cover/.test(r.textContent)), 6000);
  const row = [...document.querySelectorAll('.pj-home .pw-shelf-row, .pj-home .pj-item, .pj-home [data-item]')].find((r) => /pa91-cover/.test(r.textContent));
  if (row) { await click(row, { right: true }); await pickMenu(/^Use as the cover$/); }
  await wait(400);
  step('a capture\'s right-click › Use as the cover sets the cover', Projects.get(pb.id).cover === `capture:${cap}`, { found: Boolean(row), cover: Projects.get(pb.id).cover });
}
});

// ---------- 6. move things in and out; drops on the Desk ----------
await section('6. move things in and out; drops on the Desk', async () => {
  await onDesk(pb.id);
{
  const p = Projects.get(pb.id);
  const other = { id: `pa91-other-${Date.now().toString(36)}`, agentId: claude.id, title: 'Other chat for the desk', createdAt: Date.now(), updatedAt: Date.now() + 5, messages: [] };
  await window.hub.saveChat(other); Native.adopt(other, { openIt: false });
  { const a = [...document.querySelectorAll('.pj-home .pj-p-actions button')].find((b) => /＋ Add/.test(b.textContent)); a?.scrollIntoView({ block: 'center' }); await wait(200); await click(a); }
  await pickMenu(/^A chat›?$/);
  const inOk = await pickMenu(/^Other chat for the desk/);
  await wait(300);
  step('＋ Add › A chat › a chat puts it in the project', inOk && Projects.get(pb.id).items.some((x) => x.ref === other.id), Projects.get(pb.id).items.map((x) => x.id));
  // out: its row in Project files › right-click › Take out of …
  const outRow = await fileRow(/Other chat for the desk/);
  if (outRow) { await click(outRow, { right: true }); await pickMenu(/^Take out of/); }
  await wait(300);
  step('…its row in Project files › right-click › Take out of … takes it out (the chat itself stays)', Boolean(outRow) && !Projects.get(pb.id).items.some((x) => x.ref === other.id) && H.chats.some((c) => c.id === other.id), { row: Boolean(outRow), items: Projects.get(pb.id).items.map((x) => x.id) });
  // a file dropped from the computer on the Desk
  const f = `${await window.hub.attachmentsDir()}/pa91-dropped.txt`;
  await window.hub.fs.write(f, 'dropped on the desk');
  const body = document.querySelector('.pj-home .pj-home-body') || document.querySelector('.pj-home');
  // (a File made in the page has no path on the disk: the drop's data is what Explorer / Finder give, name and path)
  dropOn(body, { files: [{ name: 'pa91-dropped.txt', path: f }], items: [{ kind: 'file' }], types: ['Files'], getData: () => '', dropEffect: 'none' });
  await wait(500);
  step('a file dropped from the computer on the Desk joins the project', Projects.get(pb.id).items.some((x) => x.type === 'file' && /pa91-dropped\.txt$/.test(x.ref)), { items: Projects.get(pb.id).items.map((x) => x.id), toast: document.querySelector('.toast')?.textContent });
  // a chat dragged from the chats list onto the Desk
  dropOn(body, { files: [], items: [], types: ['application/x-hearth-chat'], getData: (t) => (t === 'application/x-hearth-chat' ? other.id : ''), dropEffect: 'none' });
  await wait(500);
  step('a chat dragged from the chats list onto the Desk joins the project', Projects.get(pb.id).items.some((x) => x.ref === other.id), Projects.get(pb.id).items.map((x) => x.id));
  void p;
}
});

// ---------- 7. the Lab: a scene made while the project is open joins it; the Lab knows the project ----------
await section('7. the Lab: a scene made while the project is open joins it; the Lab knows the project', async () => {
{
  await ProjectWorkspace.go('scene');
  await until(() => H.activeId === 'tool:three' && ThreeLab.scenes?.currentId(), 15000);
  const was = new Set(ThreeLab.scenes.all().map((s) => s.id));
  step('the Lab knows the project in front of you (Projects.here())', Projects.here()?.id === pb.id, Projects.here()?.name);
  (await ThreeLab.cmd({ show: false })).duplicate();
  await until(() => ThreeLab.scenes.all().some((s) => !was.has(s.id)), 5000);
  const made = ThreeLab.scenes.all().find((s) => !was.has(s.id));
  await wait(600);
  step('a scene made in the Lab while the project is open (Duplicate) joins the project', Boolean(made) && Projects.get(pb.id).items.some((x) => x.type === 'scene' && x.ref === made?.id), { made: made?.id, scenes: Projects.get(pb.id).items.filter((x) => x.type === 'scene').map((x) => x.ref) });
  await ProjectWorkspace.go('overview');
  await until(() => /Audit Beta Two/.test(deskName()), 10000);
  // opening a scene from the Desk opens the Lab on it
  const sceneRow = made ? await fileRow(new RegExp(made.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/^Audit Beta Two · /, ''))) : null;
  if (sceneRow) { await click(sceneRow); await until(() => H.activeId === 'tool:three' && ThreeLab.scenes.currentId() === made.id, 10000); }
  step('a scene of the project opened from the Desk opens the Lab on it', Boolean(sceneRow) && H.activeId === 'tool:three' && ThreeLab.scenes.currentId() === made?.id, { row: Boolean(sceneRow), at: H.activeId, scene: ThreeLab.scenes.currentId() });
  await ProjectWorkspace.go('overview');
}
});

// ---------- 8. archive / unarchive ----------
await section('8. archive / unarchive', async () => {
  await onDesk(pb.id);
{
  await J.shot('pa91-desk-before-archive');
  const dots = [...document.querySelectorAll('.pj-home .pj-p-actions button')].find((b) => b.textContent.trim() === '⋯');
  dots?.scrollIntoView({ block: 'center' }); await wait(200); // (the Desk comes back where it was scrolled: the owner scrolls up to its head)
  step('the Desk\'s ⋯ can be clicked (nothing over it)', dots && J.hitOk(dots), { hit: document.elementFromPoint(dots.getBoundingClientRect().left + 5, dots.getBoundingClientRect().top + 5)?.className, rect: JSON.stringify(dots.getBoundingClientRect()) });
  await click(dots);
  const ok8 = (await pickMenu(/^Status›?$/)) && (await pickMenu(/^Archived$/));
  await wait(300);
  step('⋯ › Status › Archived archives it', ok8 && Projects.get(pb.id).status === 'archived');
  await click(nameBtn()); await until(() => menuItem(/^All projects$/), 3000);
  step('…an archived project is out of the name ▾ switcher', !menuItem(/Audit Beta Two/), [...document.querySelectorAll('#menu button')].map((b) => b.textContent.trim()));
  await J.key('Escape');
  const sel = document.querySelector('.pj-home .pj-p-status');
  if (sel) { sel.value = 'active'; sel.dispatchEvent(new Event('change')); }
  await wait(300);
  step('…the status box puts it back to Active', Projects.get(pb.id).status === 'active');
}
});

// ---------- 9. delete → Undo; delete → Deleted things › Restore ----------
await section('9. delete → Undo; delete → Deleted things › Restore', async () => {
  await onDesk(pb.id);
{
  const items = JSON.stringify(Projects.get(pb.id).items);
  { const d = [...document.querySelectorAll('.pj-home .pj-p-actions button')].find((b) => b.textContent.trim() === '⋯'); d?.scrollIntoView({ block: 'center' }); await wait(200); await click(d); }
  await pickMenu(/^Delete the project…$/);
  await wait(400);
  step('⋯ › Delete the project… deletes it (its chats stay)', !Projects.get(pb.id) && H.chats.some((c) => c.id === loose.id));
  step('…the open Desk doesn\'t keep showing the deleted project', !/Audit Beta Two/.test(deskName()) && !/Audit Beta Two/.test(nameBtn()?.textContent || ''), { desk: deskName(), bar: nameBtn()?.textContent, at: H.activeId });
  await until(() => toastBtn(/^Undo$/), 3000);
  if (toastBtn(/^Undo$/)) await click(toastBtn(/^Undo$/));
  await wait(300);
  step('…the toast\'s Undo brings it back as it was', JSON.stringify(Projects.get(pb.id)?.items) === items);
  Projects.removeProject(Projects.get(pb.id), { quiet: true });
  await Projects.flush();
  await J.key('k', { ctrl: true });
  await until(() => document.querySelector('.palette-input'), 4000);
  await J.type('Deleted things');
  await wait(500);
  await J.key('Enter');
  await until(() => [...document.querySelectorAll('dialog[open] button')].some((b) => /Deleted things/.test(b.textContent)), 6000);
  const tab = [...document.querySelectorAll('dialog[open] button')].find((b) => /^Deleted things$/.test(b.textContent.trim()));
  if (tab && tab.getAttribute('aria-selected') !== 'true') await click(tab);
  await until(() => [...document.querySelectorAll('dialog[open] *')].some((n) => n.children.length === 0 && /Audit Beta Two/.test(n.textContent)), 8000);
  const rowD = [...document.querySelectorAll('dialog[open] .vs-row, dialog[open] li, dialog[open] .vs-del')].find((n) => /Audit Beta Two/.test(n.textContent));
  const restore = rowD && [...rowD.querySelectorAll('button')].find((b) => /Restore/.test(b.textContent));
  if (restore) await click(restore);
  await until(() => Projects.get(pb.id), 6000);
  step('Ctrl/⌘+K › Deleted things lists the project; Restore brings it back with its things', Boolean(restore) && JSON.stringify(Projects.get(pb.id)?.items) === items, { row: rowD?.textContent?.slice(0, 120) });
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
}
});

step('slow steps (ms)', true, slow);
return J.done();
