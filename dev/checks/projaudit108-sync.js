// (round 108, projaudit108) A project changed on both computers, kept aside, chosen by clicks, in the app, through the
// real sync engine and a temp cloud folder in the run's own scratch space ("the Mac" writes its version into the cloud
// copy as its sync would; Sync now brings it). Settling by itself is on, as the owner has it:
//   both      here: renamed on the Desk ("Tour (PC)") and a chat put in; the Mac: renamed ("Tour (Mac)") and its notes
//             written → one version kept, the other kept aside; the sync panel says so
//   compare   the panel's Compare… → both side by side ("In use now" / "Kept aside"), the two names in words (no paths
//             or ids)
//   keep      Keep this one on the kept-aside side → that name here, at once on the Desk and in the name ▾; the version
//             it replaced in Deleted files; in the cloud copy
//   undo      the toast's Undo → the version that was in use again (its name and its things), on the Desk and in the
//             name ▾; one project, never two
// Only a temp folder is used as the cloud, and the check's own temp data folder (never real data).
//   node dev/smoke.js --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/projaudit108-sync.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const CLOUD = `${window.SMOKE_TMP || '/tmp'}/pa108sync-${Date.now()}`;
const MAC = { id: 'studio-mac-108a2b3c', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
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
const nameBtn = () => document.querySelector('.workspace-switcher .workspace-project-name');
const deskName = () => document.querySelector('.pj-home .pj-p-name')?.textContent || '';
const view = () => document.querySelector('dialog.ka-view[open]');
const toastBtn = (re) => { for (const t of [...document.querySelectorAll('.toast')].reverse()) { const b = [...t.querySelectorAll('button')].find((x) => re.test(x.textContent.trim()) && J.visible(x)); if (b) return b; } return null; };
const modalInput = () => [...document.querySelectorAll('dialog[open] input:not([type=checkbox])')].find((n) => J.visible(n));
const text = (n) => (n?.textContent || '').replace(/\s+/g, ' ').trim();
const JARGON = /(\/tmp\/|\.json\b|\bkv\/|\bchats\/|studio-mac-|\bundefined\b|\bnull\b|\bNaN\b|\[object)/;
const trash = async () => (await api.trash()) || [];
async function still(fn) { await api.pause(true); try { await api.now(); await fn(); } finally { await api.pause(false); } }
const section = async (name, fn) => { try { await fn(); } catch (err) { step(`${name}: ran to the end`, false, String(err?.stack || err).slice(0, 400)); } };

await Lazy.load('projects'); await Projects.ready();
const p = await ProjectWorkspace.create({ name: 'Tour', plugins: [] });
await ProjectWorkspace.go('overview');
await until(() => deskName() === 'Tour', 15000);
const extra = { id: `pa108-setlist-${Date.now().toString(36)}`, agentId: H.claudeAgent().id, title: 'Setlist ideas', createdAt: Date.now(), updatedAt: Date.now(), messages: [{ role: 'user', at: 1, text: 'open with the slow one' }] };
await window.hub.saveChat(extra); Native.adopt(extra, { openIt: false });
await Projects.flush(); await syncNow(); await syncNow();
await until(async () => (await cloudJson('kv/projects.json'))?.list?.some((x) => x.id === p.id), 15000);
step('setup: the project is in the cloud copy', (await cloudJson('kv/projects.json'))?.list?.some((x) => x.id === p.id));

let note = null;
await section('both', async () => {
  await still(async () => {
    await click('.pj-home .pj-p-name');
    await until(() => modalInput(), 4000);
    modalInput().select(); await J.type('Tour (PC)'); await J.key('Enter');
    await until(() => Projects.get(p.id)?.name === 'Tour (PC)', 4000);
    Projects.add(Projects.get(p.id), 'chat', extra.id, extra.title);
    await Projects.flush(); await wait(300);
    await macEdit('kv/projects.json', (d) => ({ ...d, list: d.list.map((x) => (x.id === p.id ? { ...x, name: 'Tour (Mac)', notes: 'Soundcheck at five (from the Mac)', updated: Date.now() } : x)) }));
  });
  await until(async () => { await syncNow(); note = (Sync.status().aside || []).find((n) => n.rel === 'kv/projects.json'); return note; }, 20000);
  const here = Projects.get(p.id);
  step('changed on both: one version kept, the other kept aside (a note in the sync panel)', Boolean(note) && ['Tour (PC)', 'Tour (Mac)'].includes(here?.name), { note, name: here?.name });
  step('…what doesn\'t clash is kept from both: the chat put in here and the Mac\'s notes', here?.items.some((x) => x.ref === extra.id) && /Soundcheck at five/.test(here?.notes || ''), { items: here?.items.map((x) => x.id), notes: here?.notes });
});

let kept = null;
await section('compare', async () => {
  if (!note) return;
  await click('#sync-dot');
  await until(() => document.querySelector(`.sync-panel .sp-aside[data-id="${note.id}"] .sp-aside-compare`) || document.querySelector('.sync-panel .sp-aside .sp-aside-compare'), 10000);
  const row = document.querySelector(`.sync-panel .sp-aside[data-id="${note.id}"]`) || document.querySelector('.sync-panel .sp-aside');
  step('the sync panel: the project kept aside, with Compare…', /kept aside/.test(text(row)) && /project/i.test(text(row)), text(row));
  await click(row.querySelector('.sp-aside-compare'));
  await until(() => view() && !view().querySelector('.ka-main')?.textContent.includes('Looking at both'), 15000);
  await wait(200);
  const v = view();
  const body = text(v?.querySelector('.ka-main'));
  const heads = [...(v?.querySelectorAll('.ka-h b') || [])].map(text);
  kept = Projects.get(p.id)?.name;
  step('Compare: both side by side, the two names in words', /Tour \(PC\)/.test(body) && /Tour \(Mac\)/.test(body), body.slice(0, 400));
  step('…"In use now" and "Kept aside", each with Keep this one', heads.some((h) => /In use now/.test(h)) && heads.some((h) => /Kept aside/.test(h)) && v.querySelectorAll('.ka-keep').length === 2, heads);
  step('…no paths or ids in the view', !JARGON.test(text(v)), text(v).match(JARGON)?.[0]);
});

await section('keep', async () => {
  if (!view()) return;
  const before = Projects.get(p.id);
  const other = before.name === 'Tour (PC)' ? 'Tour (Mac)' : 'Tour (PC)';
  const btn = view().querySelector('.ka-keep-b'); // (the kept-aside version's column: "b"; this computer's as it is now: "a")
  const t0 = Date.now();
  await click(btn);
  await until(() => !view(), 15000);
  await until(() => Projects.get(p.id)?.name === other, 10000);
  await until(() => deskName() === other && nameBtn()?.textContent.includes(other), 6000);
  step(`Keep this one (the kept-aside “${other}”) → that version here, on the Desk and in the name ▾ at once`, Projects.get(p.id)?.name === other && deskName() === other && nameBtn()?.textContent.includes(other), { name: Projects.get(p.id)?.name, desk: deskName(), bar: nameBtn()?.textContent, ms: Date.now() - t0 });
  const t = (await trash()).filter((x) => /projects/.test(x.rel));
  step('…the version it replaced is in Deleted files (nothing gone for good)', t.length >= 1, t.map((x) => x.rel));
  await syncNow();
  step('…and in the cloud copy (the Mac gets it)', (await cloudJson('kv/projects.json'))?.list?.find((x) => x.id === p.id)?.name === other);
  await until(() => toastBtn(/^Undo$/), 6000);
  const u = toastBtn(/^Undo$/);
  if (u) await click(u);
  await until(() => Projects.get(p.id)?.name === before.name, 15000);
  await until(() => deskName() === before.name && nameBtn()?.textContent.includes(before.name), 6000);
  const back = Projects.get(p.id);
  step(`Undo → “${before.name}” again, its things as they were, on the Desk and in the name ▾`, back?.name === before.name && JSON.stringify(back.items.map((x) => x.id).sort()) === JSON.stringify(before.items.map((x) => x.id).sort()) && deskName() === before.name && nameBtn()?.textContent.includes(before.name), { name: back?.name, desk: deskName(), bar: nameBtn()?.textContent, items: back?.items.map((x) => x.id) });
  await syncNow();
  step('…and in the cloud copy', (await cloudJson('kv/projects.json'))?.list?.find((x) => x.id === p.id)?.name === before.name);
  step('…one project “Tour”, never two', Projects.all().filter((x) => /^Tour/.test(x.name)).length === 1, Projects.all().map((x) => x.name));
});
SyncPanel?.close?.();
return J.done();
