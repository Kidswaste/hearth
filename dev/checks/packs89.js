// (round 89, packs89) Settings › Sync › "Send very long chats in pieces (both computers need this update)", by clicks,
// in a fake two-computer run: "the other computer" is a Mac whose machine record (in a temp cloud folder) says it reads
// packs. The row is OFF by default; ticked, this computer's record says "packs" and a long chat's changes go to
// Hearth/packs/ as pieces: the bytes written into the cloud folder per reply are measured (the whole chat file is NOT
// written again for each reply); unticked, the whole file goes again at once and the record no longer says "packs".
// run-checks sets HEARTH_PACKS_MIN (a "very long chat" from 300 KB, so the check stays small) and HEARTH_PACKS_QUIET_MS
// (10 min: the whole file waits for a quiet moment longer than this check). Only a temp folder is the cloud.
//   HEARTH_PACKS_MIN=300000 HEARTH_PACKS_QUIET_MS=600000 node dev/smoke.js --check-timeout 240000 --lib dev/checks/journey-lib.js --script dev/checks/packs89.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const claude = H.claudeAgent();
const CLOUD = `${window.SMOKE_TMP || '/tmp'}/hearth-packs89-${Date.now()}`; // (the run's own scratch folder, removed after the run)
const ID = `packs89-chat-${Date.now().toString(36)}`;
const PACKS = `${CLOUD}/Hearth/packs/chats/${ID}`;
const WHOLE = `${CLOUD}/Hearth/files/chats/${ID}.json`;
const fmt = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`);
const ls = async (dir) => (await window.hub.fs.list(dir, { recursive: true }).catch(() => [])).filter((f) => !f.isDir);
const synced = async () => { await api.now(); await until(() => ['synced', 'pending'].includes(Sync.status().state), 20000); };

// 0. the other computer (a Mac with this update and the setting on), a long chat (≈ 600 KB: made up), sync on
const MAC = { id: 'studio-mac-5e5e5e5e', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000, format: 74, packs: 1 };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
const words = ['portal', 'shader', 'reverb', 'sidechain', 'café', 'naïve', 'loop', 'tempo'];
const chat = { id: ID, agentId: claude.id, title: 'A very long chat (made up)', updatedAt: Date.now(), messages: Array.from({ length: 1400 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', at: 1.7e12 + i * 1000, text: Array.from({ length: 50 }, (_, k) => words[(i * 7 + k) % words.length]).join(' ') })) };
await window.hub.saveChat(chat);
await api.on({ root: CLOUD });
await api.autoResolve(true);
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 30000);
const whole0 = await window.hub.fs.stat(WHOLE);
step('sync on: the long chat went up whole (the setting is off: as today)', Boolean(whole0 && whole0.size > 300000), whole0);
step('off by default: no Hearth/packs folder', !(await window.hub.fs.stat(`${CLOUD}/Hearth/packs`)));

// 1. Settings › This computer & sync: the row, off; a click turns it on
await AppUI.openSettings('');
const row = () => [...document.querySelectorAll('dialog.settings-dialog label.check')].find((l) => /Send very long chats in pieces/.test(l.textContent));
await until(() => row() && !row().hidden, 10000);
step('Settings › Sync has "Send very long chats in pieces (both computers need this update)", unticked', Boolean(row()) && /Send very long chats in pieces \(both computers need this update\)/.test(row().textContent) && !row().querySelector('input').checked, row()?.textContent);
await click(row().querySelector('input'));
await until(() => row().querySelector('input').checked, 4000);
step('a click ticks it', row().querySelector('input').checked);
document.querySelector('dialog.settings-dialog')?.close();
await wait(800);
await synced(); await synced();
const mine = (await ls(`${CLOUD}/Hearth/.sync/machines`)).filter((f) => f.name !== `${MAC.id}.json`);
const rec = mine.length ? JSON.parse(await window.hub.fs.read(mine[0].path)) : null;
step('this computer\'s machine record now says it reads packs', rec?.packs === 1, rec && { packs: rec.packs, name: rec.name });
step('the gate is open (the Mac reads them too): "in use"', (await api.packs())?.gate?.ok === true, await api.packs());
const built = await ls(PACKS);
step('the long chat\'s pieces and this computer\'s manifest are in Hearth/packs/', built.some((f) => /^m-.+\.json$/.test(f.name)) && built.some((f) => /\.seg$/.test(f.name)), built.map((f) => f.name).slice(0, 6));

// 2. replies: each one writes only new pieces + the manifest into the cloud folder; the whole chat file is not written again
const per = [];
const wholeBefore = await window.hub.fs.stat(WHOLE);
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  const c = await window.hub.getChat(ID);
  c.messages.push({ role: i % 2 ? 'assistant' : 'user', at: Date.now(), text: `reply ${i}: ${words.join(' ').repeat(6)}` }); c.updatedAt = Date.now();
  await window.hub.saveChat(c);
  await wait(300);
  await synced();
  const files = (await ls(`${CLOUD}/Hearth`)).filter((f) => f.mtime >= t0 - 5);
  per.push({ packs: files.filter((f) => f.path.includes('/packs/')).reduce((a, f) => a + f.size, 0), whole: files.filter((f) => f.path === WHOLE).reduce((a, f) => a + f.size, 0), files: files.map((f) => f.name) });
}
const wholeAfter = await window.hub.fs.stat(WHOLE);
console.log(`packs89: chat ${fmt(wholeBefore.size)}; bytes into the cloud folder per reply: ${per.map((p) => `${fmt(p.packs)} pieces + ${fmt(p.whole)} whole file`).join(' · ')}`);
step('each reply writes only new pieces into the cloud folder (a small part of the chat), never the whole file again', per.every((p) => p.packs > 0 && p.packs < wholeBefore.size / 4 && p.whole === 0) && wholeAfter.mtime === wholeBefore.mtime, per);
J.out.bytesPerReply = per.map((p) => p.packs); J.out.chatBytes = wholeBefore.size;

// 3. the sync panel: nothing waiting for this computer's own replies
step('nothing waits in the sync panel for them', !(Sync.status().waiting || []).some((w) => w.rel === `chats/${ID}.json`), Sync.status().waiting);

// 4. unticked: the whole file goes at once (with every reply), and the record no longer says "packs"
await AppUI.openSettings('');
await until(() => row() && !row().hidden, 10000);
await click(row().querySelector('input'));
await until(() => !row().querySelector('input').checked, 4000);
document.querySelector('dialog.settings-dialog')?.close();
await wait(800);
await synced(); await synced();
const whole2 = JSON.parse(await window.hub.fs.read(WHOLE));
step('unticked: the whole chat file is written again at once, with every reply', whole2.messages.length === 1403 && whole2.messages.at(-1).text.startsWith('reply 2'), whole2.messages.length);
const rec2 = JSON.parse(await window.hub.fs.read(mine[0].path));
step('…and this computer\'s record no longer says "packs" (the Mac stops too)', !('packs' in rec2), Object.keys(rec2));
await api.off();
return J.done();
