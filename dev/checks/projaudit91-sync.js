// (round 91, projaudit91) Project flows between two computers, in the app, through the real sync engine (a temp cloud
// folder; "the Mac" writes its version into the cloud copy as its sync would, then Sync now pulls it):
//   arrive     a project made on the Mac shows in Projects, in the name ▾ switcher and in Ctrl/⌘+K, once
//   archive    archived on the Mac: out of the switcher here
//   rename     renamed here by a click on the Desk's name while the Mac renamed it too: one name, the Mac's kept aside
//              ("Mac's version of Projects kept aside — compare"), Compare shows both, Keep both → ONE project named
//              with both (no second project sharing its chat), the name ▾ says it at once
//   told       renamed here, then the Mac's name arrives: a toast says so, its "Use …" puts this computer's name back
//   deleted    the project whose Desk is open deleted on the Mac: back to Projects, a toast with Restore (Restore → back)
// Only a temp folder is used as the cloud, and the check's own temp data folder (never real data).
//   node dev/smoke.js --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/projaudit91-sync.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const CLOUD = `${window.SMOKE_TMP || '/tmp'}/hearth-projaudit91-${Date.now()}`;
const MAC = { id: 'studio-mac-91a2b3c4', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
await api.on({ root: CLOUD });
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 20000);
await api.autoResolve(true);
await until(() => store.get('two.welcomed', 0) && document.querySelector('.two-welcome'), 8000);
const gotIt = [...document.querySelectorAll('.two-welcome button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await wait(300); }
const cloudOf = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const cloudJson = async (rel) => { try { return JSON.parse(await window.hub.fs.read(cloudOf(rel))); } catch { return null; } };
const macEdit = async (rel, fn) => { const v = fn(await cloudJson(rel)); await window.hub.fs.write(cloudOf(rel), JSON.stringify(v, null, 2)); };
const syncNow = async () => { await Sync.now({ quiet: true }).catch(() => {}); await wait(700); };
const menuItem = (re) => [...document.querySelectorAll('#menu button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const nameBtn = () => document.querySelector('.workspace-switcher .workspace-project-name');
const deskName = () => document.querySelector('.pj-home .pj-p-name')?.textContent || '';
const toastBtn = (re) => [...document.querySelectorAll('.toast button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const modalInput = () => [...document.querySelectorAll('dialog[open] input:not([type=checkbox])')].find((n) => J.visible(n));
const switcherNames = async () => { await click(nameBtn()); await until(() => menuItem(/^All projects$/), 3000); const xs = [...document.querySelectorAll('#menu button')].map((b) => b.textContent.trim()); await J.key('Escape'); await wait(150); return xs; };
const section = async (name, fn) => { try { await fn(); } catch (err) { step(`${name}: stopped`, false, String(err?.message || err).slice(0, 300)); } for (const d of document.querySelectorAll('dialog[open]')) try { d.close(); } catch { /* */ } };
const macProject = (id, name, at) => ({ id, name, ident: ProjectsCore.MC.identity(id), status: 'active', notes: '', from: 'hand', make: null, cover: null, items: [], at, updated: at, opened: at });

await Lazy.load('projects'); await Projects.ready();
const home = await ProjectWorkspace.create({ name: 'Twin Neon', plugins: [] });
await ProjectWorkspace.go('overview');
await until(() => deskName() === 'Twin Neon', 15000);
await Projects.flush(); await syncNow(); await syncNow();
await until(async () => (await cloudJson('kv/projects.json'))?.list?.some((p) => p.id === home.id), 15000);
step('setup: the project made here is in the cloud copy', (await cloudJson('kv/projects.json'))?.list?.some((p) => p.id === home.id));

await section('arrive', async () => {
  const at = Date.now();
  await macEdit('kv/projects.json', (d) => ({ ...d, list: [macProject('pjmac91a', 'Made on the Mac', at), ...d.list] }));
  await syncNow();
  await until(() => Projects.get('pjmac91a'), 10000);
  step('a project made on the Mac is here, once', Projects.all().filter((p) => p.id === 'pjmac91a').length === 1);
  const xs = await switcherNames();
  step('…in the name ▾ switcher', xs.some((x) => /Made on the Mac/.test(x)), xs);
  await J.key('k', { ctrl: true }); await until(() => document.querySelector('.palette-input'), 4000);
  await J.type('Made on the Mac'); await wait(500);
  const rows = [...document.querySelectorAll('.palette-item')].map((r) => r.textContent.trim());
  step('…and in Ctrl/⌘+K as a project', /Made on the Mac.*Project/.test(rows[0] || ''), rows.slice(0, 3));
  await J.key('Escape');
});

await section('archive', async () => {
  await macEdit('kv/projects.json', (d) => ({ ...d, list: d.list.map((p) => (p.id === 'pjmac91a' ? { ...p, status: 'archived', updated: Date.now() } : p)) }));
  await syncNow();
  await until(() => Projects.get('pjmac91a')?.status === 'archived', 10000);
  const xs = await switcherNames();
  step('archived on the Mac: out of the switcher here', Projects.get('pjmac91a')?.status === 'archived' && !xs.some((x) => /Made on the Mac/.test(x)), xs);
});

await section('rename both', async () => {
  // the Mac renames it in the cloud copy; here the owner renames it on the Desk before that arrives
  await macEdit('kv/projects.json', (d) => ({ ...d, list: d.list.map((p) => (p.id === home.id ? { ...p, name: 'Neon (Mac)', updated: Date.now() } : p)) }));
  await click('.pj-home .pj-p-name');
  await until(() => modalInput(), 4000);
  modalInput().select(); await J.type('Neon (PC)'); await J.key('Enter');
  await until(() => Projects.get(home.id)?.name === 'Neon (PC)', 4000);
  step('renamed here by a click on the Desk\'s name; the name ▾ says it at once', /^Neon \(PC\) ▾$/.test(nameBtn()?.textContent || ''), nameBtn()?.textContent);
  await syncNow(); await syncNow();
  await until(() => (Sync.status().aside || []).some((n) => n.rel === 'kv/projects.json'), 15000);
  const note = (Sync.status().aside || []).find((n) => n.rel === 'kv/projects.json');
  step('one name kept (this computer\'s), the Mac\'s kept aside with a note', Projects.get(home.id)?.name === 'Neon (PC)' && Boolean(note), { name: Projects.get(home.id)?.name, note });
  await click('#sync-dot');
  await until(() => document.querySelector('.sync-panel .sp-aside'), 8000);
  const row = document.querySelector('.sync-panel .sp-aside');
  step('the sync panel: "Mac\'s version of Projects kept aside — compare"', /kept aside/.test(row?.textContent || '') && /project/i.test(row?.textContent || ''), row?.textContent);
  if (row) {
    await click(row.querySelector('.sp-aside-compare'));
    await until(() => document.querySelector('.sync-panel .sp-aside .sp-sides'), 6000);
    const sides = document.querySelector('.sync-panel .sp-aside .sp-sides')?.textContent || '';
    step('Compare shows both names', /Neon \(Mac\)/.test(sides) && /Neon \(PC\)/.test(sides), sides.slice(0, 300));
    await click(document.querySelector('.sync-panel .sp-aside .sp-aside-both'));
    await until(() => /Neon \(PC\).*Neon \(Mac\)/.test(Projects.get(home.id)?.name || ''), 8000);
    const twins = Projects.all().filter((p) => /Neon/.test(p.name));
    step('Keep both: ONE project named with both (no second project sharing its chat)', twins.length === 1 && /Neon \(PC\) \/ Neon \(Mac\)/.test(twins[0].name), twins.map((p) => [p.id, p.name]));
    await until(() => /Neon \(PC\) \/ Neon \(Mac\)/.test(nameBtn()?.textContent || ''), 4000);
    step('…the name ▾ and the Desk say it', /Neon \(PC\) \/ Neon \(Mac\)/.test(nameBtn()?.textContent || '') && /Neon \(PC\) \/ Neon \(Mac\)/.test(deskName()), { bar: nameBtn()?.textContent, desk: deskName() });
  }
  await J.key('Escape');
});

await section('told', async () => {
  await click('.pj-home .pj-p-name');
  await until(() => modalInput(), 4000);
  modalInput().select(); await J.type('Glow (PC)'); await J.key('Enter');
  await until(() => Projects.get(home.id)?.name === 'Glow (PC)', 4000);
  await Projects.flush(); await syncNow();
  await until(async () => (await cloudJson('kv/projects.json'))?.list?.find((p) => p.id === home.id)?.name === 'Glow (PC)', 10000);
  await macEdit('kv/projects.json', (d) => ({ ...d, list: d.list.map((p) => (p.id === home.id ? { ...p, name: 'Glow (Mac)', updated: Date.now() } : p)) }));
  await syncNow();
  await until(() => Projects.get(home.id)?.name === 'Glow (Mac)', 10000);
  await until(() => toastBtn(/^Use “Glow \(PC\)”$/), 5000);
  const t = [...document.querySelectorAll('.toast')].map((n) => n.textContent).find((x) => /Glow \(PC\)/.test(x));
  step('the Mac\'s name arrives over the one typed here: a toast says so', /“Glow \(PC\)” is now “Glow \(Mac\)”/.test(t || ''), t);
  if (toastBtn(/^Use “Glow \(PC\)”$/)) await click(toastBtn(/^Use “Glow \(PC\)”$/));
  await until(() => Projects.get(home.id)?.name === 'Glow (PC)', 4000);
  step('…its "Use …" puts this computer\'s name back', Projects.get(home.id)?.name === 'Glow (PC)' && /Glow \(PC\)/.test(nameBtn()?.textContent || ''), nameBtn()?.textContent);
});

await section('deleted', async () => {
  await Projects.flush(); await syncNow(); await syncNow();
  await ProjectWorkspace.go('overview');
  await until(() => /Glow/.test(deskName()), 8000);
  await macEdit('kv/projects.json', (d) => { const p = d.list.find((x) => x.id === home.id); return { ...d, list: d.list.filter((x) => x.id !== home.id), trash: [{ ...p, deletedAt: Date.now() }, ...(d.trash || [])] }; });
  await syncNow();
  await until(() => !Projects.get(home.id), 10000);
  await until(() => !/Glow/.test(deskName()) && !/Glow/.test(nameBtn()?.textContent || ''), 6000);
  step('deleted on the Mac while its Desk is open here: the Desk goes back to Projects', !Projects.get(home.id) && !/Glow/.test(deskName()) && !/Glow/.test(nameBtn()?.textContent || ''), { desk: deskName(), bar: nameBtn()?.textContent, at: H.activeId });
  await until(() => toastBtn(/^Restore$/), 5000);
  step('…a toast says so, with Restore', Boolean(toastBtn(/^Restore$/)));
  if (toastBtn(/^Restore$/)) await click(toastBtn(/^Restore$/));
  await until(() => Projects.get(home.id), 4000);
  step('…Restore brings it back, once', Projects.all().filter((p) => p.id === home.id).length === 1);
});

return J.done();
