// (round 78, guardloss78) The other side of a conflict sync settled by itself, in the app, through the real sync engine
// (a temp cloud folder; "the Mac" edits the cloud copy, then Sync now pulls it): a note being typed in on this computer
// while the Mac changed the SAME line → this computer's line stays, the Mac's version is kept aside: the sync panel says
// "Mac's version of Notes kept aside — compare", Compare shows both, Keep both brings the Mac's version back beside it
// ("… (from Mac)"), and it is in Deleted files. Then the Mac changes the line NEXT to one typed here → both, no note.
//   node dev/smoke.js --check-timeout 240000 --lib dev/checks/journey-lib.js --script dev/checks/guardloss78.js
const { step, wait, until, click, type } = J;
const api = window.hub.sync;
const CLOUD = `/tmp/hearth-guardloss78-${Date.now()}`;
const MAC = { id: 'studio-mac-78a2b3c4', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
await api.on({ root: CLOUD });
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 20000);
await wait(1200);
const gotIt = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await wait(300); }
const cloudOf = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const cloudJson = async (rel) => { try { return JSON.parse(await window.hub.fs.read(cloudOf(rel))); } catch { return null; } };
const macEdit = async (rel, fn) => { const v = fn(await cloudJson(rel)); await window.hub.fs.write(cloudOf(rel), JSON.stringify(v, null, 2)); };
const syncNow = async () => { await Sync.now({ quiet: true }); await wait(700); };
const noteText = async () => (await window.hub.kvGet('notes', [])).find((n) => /Set list/.test(n.text))?.text || '';

// ---------- 1. the same line, two ways: kept aside ----------
await Notes.create({ text: '# Set list\n- intro\n- drop\n- outro', focus: true });
await wait(900); await syncNow();
await until(async () => (await cloudJson('kv/notes.json'))?.some?.((n) => /Set list/.test(n.text)), 15000);
step('the note is in the cloud folder (first sync)', (await cloudJson('kv/notes.json'))?.some((n) => /Set list/.test(n.text)));
await macEdit('kv/notes.json', (l) => l.map((n) => (/Set list/.test(n.text) ? { ...n, text: n.text.replace('- drop', '- drop at 1:12 (Mac)'), updatedAt: Date.now() } : n)));
const area = document.querySelector('.notes-panel textarea');
await click(area);
const at = area.value.indexOf('- drop') + '- drop'.length;
area.setSelectionRange(at, at);
await type(' — the big one');
await syncNow(); await syncNow();
await until(() => (Sync.status().aside || []).length > 0, 15000);
const notes = Sync.status().aside || [];
step('a note says the other version was kept aside', notes.length === 1 && notes[0].rel === 'kv/notes.json', notes);
step('this computer\'s line stays in the note', /drop — the big one/.test(await noteText()), await noteText());
await click('#sync-dot');
await until(() => document.querySelector('.sync-panel .sp-aside'), 8000);
const row = document.querySelector('.sync-panel .sp-aside');
step('the sync panel: "Mac\'s version of Notes kept aside — compare"', /^Mac's version of Notes kept aside — compare$/.test(row?.querySelector('.sp-what')?.textContent || ''), row?.textContent);
await click(row.querySelector('.sp-aside-compare')); // (round 94, keptaside94) the shared compare view
await until(() => document.querySelector('dialog.ka-view[open] .ka-diff'), 8000);
const sides = document.querySelector('dialog.ka-view[open] .ka-main')?.textContent || '';
step('Compare shows both versions', /the big one/.test(sides) && /1:12 \(Mac\)/.test(sides), sides);
await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/guardloss78-aside.png` });
const trash = await api.trash();
step('the Mac\'s version is in Deleted files', trash.some((t) => t.rel === 'kv/notes.json' && t.where === 'here'), trash.map((t) => t.id));
await click(document.querySelector('dialog.ka-view[open] .ka-both'));
await until(async () => (await window.hub.kvGet('notes', [])).some((n) => /1:12 \(Mac\)/.test(n.text)), 10000);
const all = await window.hub.kvGet('notes', []);
step('Keep both: the Mac\'s version is back beside it, this computer\'s line kept', all.some((n) => /1:12 \(Mac\)/.test(n.text)) && all.some((n) => /the big one/.test(n.text)), all.map((n) => `${n.title}: ${n.text.split('\n')[2]}`));
await until(() => !(Sync.status().aside || []).length, 6000);
step('…and the note in the panel is gone', !document.querySelector('.sync-panel .sp-aside') && !(Sync.status().aside || []).length);
SyncPanel.close();

// ---------- 2. neighbouring lines: merged, nothing kept aside ----------
await syncNow();
await macEdit('kv/notes.json', (l) => l.map((n) => (/Set list/.test(n.text) && /the big one/.test(n.text) ? { ...n, text: n.text.replace('- outro', '- outro (Mac: fade)'), updatedAt: Date.now() } : n)));
const area2 = document.querySelector('.notes-panel textarea');
if (area2 && /the big one/.test(area2.value)) {
  await click(area2);
  const p2 = area2.value.indexOf('the big one') + 'the big one'.length; // the line right above the Mac's
  area2.setSelectionRange(p2, p2);
  await type(' (count in)');
}
await syncNow(); await syncNow();
await until(async () => /count in/.test(await noteText()) && /fade/.test(await noteText()), 15000);
const t2 = (await window.hub.kvGet('notes', [])).find((n) => /the big one/.test(n.text))?.text || '';
step('the Mac\'s line and the one typed here on neighbouring lines: both in the note', /count in/.test(t2) && /fade/.test(t2), t2);
step('…and nothing was kept aside', !(Sync.status().aside || []).length, Sync.status().aside);
Notes.close();
await api.off();
return J.done();
