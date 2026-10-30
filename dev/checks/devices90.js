// (round 90, devices90) Settings › This computer & sync › "Your computers", by clicks, in a fake three-computer run (only
// a temp folder in the run's own scratch space is the cloud; the other two computers are made-up machine records):
//   · the list: this computer, a Mac seen a minute ago (reads pieces), an old laptop not seen for 20 days (an older
//     Hearth): name, system, last seen, Hearth version, reads pieces; "Forget this computer…" only on the old laptop
//   · "Send very long chats in pieces" is on here but waits: the laptop is the only one keeping it shut
//   · Forget → a plain confirmation (Cancel keeps it; "Forget it" forgets): its record moves to .sync/forgotten (same
//     bytes), the list says so, the gate opens (in use)
//   · it comes back (its record again): listed again, "came back"; the gate shuts again (it doesn't read pieces)
//   · the pieces' space in plain words, "Free up X: remove kept-aside pieces older than 7 days" → confirmation → the old
//     orphan piece is in the stand-in Trash (HEARTH_TEST_SAVE_DIR/devices90-trash), a piece a manifest names and a
//     young one stay; the notes (an automatic limit on request; the provider's own trash)
//   node dev/smoke.js --check-timeout 180000 --lib dev/checks/journey-lib.js --script dev/checks/devices90.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const CLOUD = `${window.SMOKE_TMP || '/tmp'}/hearth-devices90-${Date.now()}`;
const MD = `${CLOUD}/Hearth/.sync/machines`;
const ls = async (dir) => (await window.hub.fs.list(dir, { recursive: true }).catch(() => [])).filter((f) => !f.isDir);
const synced = async () => { await api.now(); await until(() => ['synced', 'pending'].includes(Sync.status().state), 20000); };
const hex = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const DAY = 864e5;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

// 0. the other two computers (made-up records) and sync on
const MAC = { id: 'studio-mac-5e5e5e5e', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000, format: 74, app: '0.90.0', packs: 1 };
const OLD = { id: 'old-laptop-0ld0ld00', name: 'Old laptop', platform: 'win32', dataDir: 'C:\\Users\\q\\AppData\\Roaming\\Hearth\\data', home: 'C:\\Users\\q', lastSeen: Date.now() - 20 * DAY, lastOk: Date.now() - 20 * DAY, format: 74, app: '0.80.0' };
const OLD_TEXT = JSON.stringify(OLD, null, 2);
await window.hub.fs.write(`${MD}/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${MD}/${OLD.id}.json`, OLD_TEXT);
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
await api.on({ root: CLOUD });
await api.packs(true); // "Send very long chats in pieces" on here
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 30000);
await synced();
step('the packs gate is shut: the old laptop (no "packs") keeps it waiting', (await api.packs())?.gate?.why === 'older', await api.packs());

// made-up pieces: one live chat in the cloud folder (a manifest + 1 piece), and this computer's pack trash
const { dataDir } = await api.detect();
const TRASH = `${dataDir}/sync/packtrash`;
const liveText = '"a live message (made up)"'; const liveH = await hex(liveText);
// (the live manifest is this computer's own: the pack lane leaves its own manifests alone, so no made-up chat is taken in)
const myRec = (await ls(MD)).find((f) => ![`${MAC.id}.json`, `${OLD.id}.json`].includes(f.name));
const myBy = String(JSON.parse(await window.hub.fs.read(myRec.path)).id).replace(/[^\w.-]+/g, '_').slice(0, 64);
const body = { hearthChatPack: 1, id: 'c1', by: myBy, seq: 1, at: 1, layout: 'compact', pre: '{"messages":', post: '}', n: 1, sealed: 0, segs: [{ h: liveH, n: 1, b: new TextEncoder().encode(liveText).length }] };
const sum = await hex(JSON.stringify(body));
await window.hub.fs.write(`${CLOUD}/Hearth/packs/chats/c1/${liveH}.seg`, liveText);
await window.hub.fs.write(`${CLOUD}/Hearth/packs/chats/c1/m-${myBy}.json`, JSON.stringify({ ...body, sum }));
const old = dayOf(Date.now() - 10 * DAY); const young = dayOf(Date.now() - 2 * DAY);
const orphanText = `"an old orphan piece ${'x'.repeat(200000)}"`; const orphanH = await hex(orphanText);
await window.hub.fs.write(`${TRASH}/cloud/${old}/c1/${orphanH}.seg`, orphanText);
await window.hub.fs.write(`${TRASH}/cloud/${old}/c1/${liveH}.seg`, liveText); // (the same piece a live manifest names: never moved)
const youngText = '"a young orphan"'; const youngH = await hex(youngText);
await window.hub.fs.write(`${TRASH}/cloud/${young}/c1/${youngH}.seg`, youngText);

// 1. Settings › This computer & sync › Your computers
await AppUI.openSettings('');
const fold = () => document.querySelector('dialog.settings-dialog .dv-fold');
await until(() => fold() && !fold().hidden, 15000);
step('Settings › This computer & sync has "Your computers" (sync on)', Boolean(fold()) && /Your computers/.test(fold().querySelector('summary').textContent));
await click(fold().querySelector('summary'));
const rows = () => [...fold().querySelectorAll('.dv-row')];
const rowOf = (re) => rows().find((r) => re.test(r.querySelector('.dv-name').textContent));
await until(() => rows().length === 3, 10000);
const me = rows().find((r) => r.classList.contains('dv-me'));
step('the list: this computer, the Mac and the old laptop', rows().length === 3 && Boolean(me) && /\(this computer\)/.test(me.textContent) && Boolean(rowOf(/Studio Mac/)) && Boolean(rowOf(/Old laptop/)), rows().map((r) => r.textContent));
step('each: system, last seen, Hearth version, reads pieces', /Mac · last seen \d+ minutes? ago|Mac · last seen just now/.test(rowOf(/Studio Mac/).textContent) && /Hearth 0\.90\.0 · reads pieces/.test(rowOf(/Studio Mac/).textContent) && /Windows · last seen 20 days ago · Hearth 0\.80\.0 · doesn't read pieces/.test(rowOf(/Old laptop/).textContent), rows().map((r) => r.querySelector('.dv-what').textContent));
step('"Forget this computer…" only on the computer not seen for a while (never this one, never the Mac)', Boolean(rowOf(/Old laptop/).querySelector('.dv-forget')) && !me.querySelector('.dv-forget') && !rowOf(/Studio Mac/).querySelector('.dv-forget'));
step('the summary says one computer wasn\'t seen for a week', /3 computers · 1 not seen for a week/.test(fold().querySelector('.sc-state').textContent), fold().querySelector('.sc-state').textContent);

// 2. Forget: a plain confirmation; Cancel keeps it
await click(rowOf(/Old laptop/).querySelector('.dv-forget'));
await until(() => rowOf(/Old laptop/).querySelector('.dv-confirm'), 3000);
const words = rowOf(/Old laptop/).querySelector('.dv-confirm-text').textContent;
step('the confirmation says: treated as new if it comes back, nothing of its data deleted', /treated as a new computer/.test(words) && /Nothing of its data is deleted/.test(words), words);
await click(rowOf(/Old laptop/).querySelector('.dv-no'));
await wait(300);
step('Cancel: nothing changed', !rowOf(/Old laptop/).querySelector('.dv-confirm') && Boolean(await window.hub.fs.stat(`${MD}/${OLD.id}.json`)));
await click(rowOf(/Old laptop/).querySelector('.dv-forget'));
await until(() => rowOf(/Old laptop/)?.querySelector('.dv-yes'), 3000);
await click(rowOf(/Old laptop/).querySelector('.dv-yes'));
await until(() => rows().length === 2, 8000);
const forgotten = await ls(`${CLOUD}/Hearth/.sync/forgotten`);
const movedRec = forgotten.find((f) => f.name.endsWith(`-${OLD.id}.json`));
step('forgotten: its record is moved to .sync/forgotten (the same bytes), not deleted', !(await window.hub.fs.stat(`${MD}/${OLD.id}.json`)) && Boolean(movedRec) && (await window.hub.fs.read(movedRec.path)) === OLD_TEXT, forgotten.map((f) => f.name));
step('the list says it was forgotten', /Forgotten: Old laptop \(forgotten just now\)/.test(fold().querySelector('.dv-gone').textContent), fold().querySelector('.dv-gone').textContent);
await synced(); await synced();
step('the packs gate reopens (the old laptop was the only one keeping it shut)', (await api.packs())?.gate?.ok === true, await api.packs());

// 3. the pieces' space and Free up
const space = () => fold().querySelector('.dv-space');
await until(() => space().querySelector('.dv-free'), 8000);
const line = space().querySelector('.dv-line').textContent;
step('the pieces\' space in plain words (cloud folder, kept for merging, kept aside, older than 7 days)', /In your cloud folder: .+ of pieces/.test(line) && /kept aside/.test(line) && /older than 7 days/.test(line), line);
const btn = space().querySelector('.dv-free');
step('"Free up X: remove kept-aside pieces older than 7 days"', /^Free up \d+ (KB|MB): remove kept-aside pieces older than 7 days$/.test(btn.textContent), btn.textContent);
step('the notes: an automatic limit on request; the provider\'s own trash is theirs', /ask for one and it can be added/.test(space().textContent) && /That trash is your provider's/.test(space().textContent));
await click(btn);
await until(() => space().querySelector('.dv-confirm .dv-yes'), 3000);
await click(space().querySelector('.dv-confirm .dv-yes'));
await until(async () => !(await window.hub.fs.stat(`${TRASH}/cloud/${old}/c1/${orphanH}.seg`)), 8000);
const bin = await ls(`${window.SMOKE_SAVES}/devices90-trash`);
step('Free up: the old orphan piece is in the Trash (moved, not deleted)', bin.some((f) => f.name.endsWith(`${orphanH}.seg`)) || bin.some((f) => f.path.includes(orphanH)), bin.map((f) => f.name));
step('…a piece a manifest names stays, and so does a young one', Boolean(await window.hub.fs.stat(`${TRASH}/cloud/${old}/c1/${liveH}.seg`)) && Boolean(await window.hub.fs.stat(`${TRASH}/cloud/${young}/c1/${youngH}.seg`)) && Boolean(await window.hub.fs.stat(`${CLOUD}/Hearth/packs/chats/c1/${liveH}.seg`)));
// a manifest that can't be read: nothing removed
const again = `"another old orphan ${'y'.repeat(1000)}"`; const againH = await hex(again);
await window.hub.fs.write(`${TRASH}/cloud/${old}/c2/${againH}.seg`, again);
await window.hub.fs.write(`${CLOUD}/Hearth/packs/chats/c2/m-${myBy}.json`, '{"hearthChatPack":1,"id":"c2"');
const held = await api.packFree();
step('a manifest that can\'t be read: nothing removed at all', held.ok === false && held.held === 'manifest' && Boolean(await window.hub.fs.stat(`${TRASH}/cloud/${old}/c2/${againH}.seg`)), held);

// 4. the old laptop comes back (its own Hearth writes its record again)
await window.hub.fs.write(`${MD}/${OLD.id}.json`, JSON.stringify({ ...OLD, lastSeen: Date.now(), lastOk: Date.now() }));
fold().open = false; fold().open = true;
await until(() => rows().length === 3, 8000);
step('it comes back: listed again, and the forgotten entry says it came back', Boolean(rowOf(/Old laptop/)) && !rowOf(/Old laptop/).querySelector('.dv-forget') && /Old laptop \(came back/.test(fold().querySelector('.dv-gone').textContent), fold().querySelector('.dv-gone').textContent);
await synced(); await synced();
step('…and the packs gate shuts again (it doesn\'t read pieces)', (await api.packs())?.gate?.why === 'older', await api.packs());
document.querySelector('dialog.settings-dialog')?.close();
await api.packs(false);
await api.off();
return J.done();
