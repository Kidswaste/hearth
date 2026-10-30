// (round 92, syncpanel92) The whole sync panel as the owner sees it, by clicks, across every state: the chip in the rail,
// the panel (title, what it says, the button that fixes it), the toast after Sync now, and the Details fold. Each state:
// plain words, what to do with its button, no paths / ids / codes in the main text, chip = panel = toast, and never
// "everything is synced" while something is wrong.
//   Real engine (a temp cloud folder in the run's own scratch space; "the Mac" and an old laptop are made-up machine
//   records): in sync · the cloud folder gone (missing) → "Start the cloud copy again from here" brings it back · an old
//   laptop not seen for 20 days → "Your computers…" → Forget → it is gone from the panel · the cloud drive unplugged.
//   Then sync goes off and the panel is fed made-up engine statuses (the engine's own shape, nothing real is read or
//   written): syncing · waiting for a very long chat's pieces · online-only placeholders (Download) and a Lab file ·
//   a big file on its way / big videos kept here · a conflict · kept aside · deleted files (the list, no raw paths) ·
//   permission / disk full / path too long on Windows (can't sync, each with its fix) · a sync error · this computer's
//   own notes unreadable · the cloud folder emptied · this Hearth too old · the other computer on an old version ·
//   many deletions waiting · paused · first-time setup.
// Every made-up status is put back when it ends; sync is off at the end. Nothing is uploaded; nothing real is touched.
//   node dev/smoke.js --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/syncpanel92.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const DAY = 864e5;
const CLOUD = `${window.SMOKE_TMP || '/tmp'}/sp92-${Date.now()}`;
const MD = `${CLOUD}/Hearth/.sync/machines`;
const dot = () => document.getElementById('sync-dot');
const chip = () => dot()?.querySelector('.sync-chip')?.textContent || '';
const panel = () => document.querySelector('.sync-panel');
const h2 = () => panel()?.querySelector('h2')?.textContent || '';
const btn = (re, root = panel()) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()));
// the main text: the panel without its Details folds (what the owner reads first)
const mainText = () => { const p = panel()?.cloneNode(true); if (!p) return ''; for (const d of p.querySelectorAll('details')) d.remove(); return p.textContent.replace(/\s+/g, ' '); };
// jargon the main text must not have: paths, ids, engine words, error codes
const JARGON = /(\/tmp\/|[A-Z]:\\|\/Users\/|\.json\b|\bmanifest\b|\bbase\b|\bE[A-Z]{3,}\b|\bkv\/|\bchats\/|\brefs\/|studio-mac-|old-laptop-|\berrno\b|\bundefined\b|\bnull\b|\bNaN\b)/;
const lastToast = () => recentToasts()[0]?.message || ''; // (newest first)
const audit = J.out.audit = {}; // state → what the owner sees (the write-up's table is made from this)
const see = (name, extra = {}) => { audit[name] = { chip: chip(), title: h2(), text: mainText().slice(0, 600), buttons: [...(panel()?.querySelectorAll('button') || [])].map((b) => b.textContent.trim()).filter(Boolean), ...extra }; console.log(`[SP92] ${name} ${JSON.stringify(audit[name])}`); return audit[name]; };
const chipWhole = () => { const c = dot()?.querySelector('.sync-chip'); return Boolean(c) && c.scrollWidth <= c.clientWidth + 1; };
// a click on a button that may not be there: a failed step, not a stop (the rest of the states are still looked at)
async function tap(b, what) { if (!b || !J.visible(b)) { step(`there is a button to click: ${what}`, false); return false; } await click(b); return true; }
const shot = (n) => smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/sp92-${n}.png` }).catch(() => null);
async function openPanel() {
  if (panel()) return panel();
  await until(() => J.visible(dot()), 5000);
  if (!J.visible(dot())) { step('the indicator is in the rail to click', false, { on: Sync.status().on, state: Sync.status().state, dot: Boolean(dot()) }); await Sync.panel(); } else await click('#sync-dot');
  await until(() => panel()?.querySelector('h2'), 20000);
  return panel();
}
const synced = async () => { await api.now(); await until(() => ['synced', 'pending'].includes(Sync.status().state), 20000); await Sync.refresh(); };
// this computer as a Windows PC for the panel's words
Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });

// ---------- 0. the fake two computers, sync on (real engine, temp cloud folder) ----------
const MAC = { id: 'studio-mac-92a1b2c3', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000, format: 74, app: '0.91.0', packs: 1 };
const OLD = { id: 'old-laptop-92d4e5f6', name: 'Old laptop', platform: 'win32', dataDir: 'C:\\Users\\q\\AppData\\Roaming\\Hearth\\data', home: 'C:\\Users\\q', lastSeen: Date.now() - 20 * DAY, lastOk: Date.now() - 20 * DAY, format: 74, app: '0.80.0' };
await window.hub.fs.write(`${MD}/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${MD}/${OLD.id}.json`, JSON.stringify(OLD));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
const claude = H.claudeAgent();
await window.hub.saveChat({ id: 'sp92-diary', agentId: claude.id, title: 'Tour diary', updatedAt: Date.now(), messages: [{ role: 'user', at: 1, text: 'made up for the check' }] });
try { H.chats = await window.hub.listChats(); } catch { /* the list comes later */ }
await api.on({ root: CLOUD });
await api.autoResolve(false);
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 30000);
await synced();
await until(() => /Synced/.test(chip()), 4000);
// the one-time welcome note sits where the panel opens: Got it
await until(() => store.get('two.welcomed', 0) && document.querySelector('.two-welcome'), 8000);
const gotIt = [...document.querySelectorAll('.two-welcome button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await until(() => !document.querySelector('.two-welcome'), 2000); }

// ---------- 1. idle and in sync ----------
await openPanel();
see('in sync');
step('in sync: "✓ Synced" in the rail, "Synced …" on the panel, the computers by name', /^✓ Synced$/.test(chip()) && /^Synced (just now|\d+ min ago)/.test(h2()) && /Studio Mac/.test(mainText()), audit['in sync']);
step('in sync: Sync now, Deleted files, ⋯ More', Boolean(btn(/^Sync now$/)) && Boolean(btn(/^Deleted files/)) && Boolean(panel().querySelector('[aria-label="More sync options"]')));
step('in sync: no paths or ids in the main text', !JARGON.test(mainText()), mainText().match(JARGON)?.[0]);
const det = () => panel()?.querySelector('details.sp-details');
step('a "Details" fold holds the technical side, with "Copy details for Claude"', Boolean(det()) && /Details/.test(det().querySelector('summary')?.textContent || '') && Boolean(btn(/Copy details for Claude/, det())), det()?.textContent?.slice(0, 120));
if (det()) { det().open = true; step('…its lines name the cloud folder and the state (for a report)', det().textContent.includes(CLOUD) && /synced/.test(det().textContent), det().textContent.slice(0, 200)); det().open = false; }
await tap(btn(/^Sync now$/), '/^Sync now$/');
await until(() => btn(/^Sync now$/) && !btn(/^Sync now$/).disabled, 8000);
// the toast after Sync now from the menu says the same thing
await Sync.now();
step('in sync: Sync now\'s note says "Everything is synced"', /^Everything is synced with/.test(lastToast()), lastToast());

// ---------- 2. an old laptop not seen for 20 days → Your computers → Forget ----------
step('a computer not seen for a while: the panel says so, with "Your computers…"', /Old laptop/.test(mainText()) && /20 days/.test(mainText()) && Boolean(btn(/^Your computers/)), mainText().slice(0, 400));
see('stale computer');
if (btn(/^Your computers/)) {
  await tap(btn(/^Your computers/), '/^Your computers/');
  const fold = () => document.querySelector('dialog.settings-dialog .dv-fold');
  await until(() => fold()?.open && fold().querySelector('.dv-forget'), 15000);
  step('"Your computers…" opens Settings at Your computers, open, with Forget on the old laptop', Boolean(fold()?.open) && Boolean(fold()?.querySelector('.dv-forget')), fold()?.textContent?.slice(0, 160));
  const row = [...(fold()?.querySelectorAll('.dv-row') || [])].find((r) => /Old laptop/.test(r.textContent));
  if (row) {
    await click(row.querySelector('.dv-forget'));
    await until(() => row.querySelector('.dv-yes'), 3000);
    await click(row.querySelector('.dv-yes'));
    await until(() => /Old laptop/.test(fold()?.querySelector('.dv-gone')?.textContent || ''), 8000);
  }
  document.querySelector('dialog.settings-dialog')?.close();
  await synced();
  await openPanel();
  step('a forgotten computer: no longer in the panel', !/Old laptop/.test(mainText()) && /Studio Mac/.test(mainText()), mainText().slice(0, 300));
  see('forgotten computer');
}

// ---------- 3. the cloud folder missing (Hearth/files gone): paused, "Start the cloud copy again from here" ----------
await window.hub.fs.trash([`${CLOUD}/Hearth/files`]).catch(() => null);
await Sync.now({ quiet: true });
await until(() => Sync.status().state === 'offline' && Sync.status().error === 'missing', 10000);
await openPanel(); await SyncPanel.render();
see('cloud folder missing');
step('missing: the chip and the panel both say it is the folder (not "Offline")', /^⚠ Folder$/.test(chip()) && /cloud folder isn't there/.test(h2()) && chipWhole(), audit['cloud folder missing']);
step('missing: what happened in plain words, nothing touched', /moved, renamed|isn't connected/.test(mainText()) && /nothing here was touched/i.test(mainText()), mainText().slice(0, 300));
step('missing: the fixes as buttons ("Start the cloud copy again from here", "Pick the folder again…")', Boolean(btn(/^Start the cloud copy again from here$/)) && Boolean(btn(/^Pick the folder again/)), audit['cloud folder missing'].buttons);
step('missing: no paths in the main text', !JARGON.test(mainText()), mainText().match(JARGON)?.[0]);
await shot('missing');
await tap(btn(/^Start the cloud copy again from here$/), '/^Start the cloud copy again from here$/');
await until(() => Sync.status().state === 'synced', 20000);
await SyncPanel.render();
step('…one click: the cloud copy is made again from here, "✓ Synced"', Sync.status().state === 'synced' && /^✓ Synced$/.test(chip()) && Boolean(await window.hub.fs.stat(`${CLOUD}/Hearth/files`)), { state: Sync.status().state, chip: chip() });

// ---------- 4. the cloud drive unplugged (the whole folder gone): offline, catches up, "Pick the folder again…" ----------
await window.hub.fs.trash([CLOUD]).catch(() => null);
await Sync.now({ quiet: true }).catch(() => null);
await until(() => Sync.status().state === 'offline' && !Sync.status().error, 10000);
await openPanel(); await SyncPanel.render();
see('offline / unplugged', { toast: lastToast() });
step('unplugged: "○ Offline" in the rail, "Offline · catches up…" on the panel', /^○ Offline$/.test(chip()) && /^Offline/.test(h2()), audit['offline / unplugged']);
step('unplugged: says it keeps working here and catches up, and offers "Pick the folder again…"', /keeps working here/.test(mainText()) && /catches up/.test(mainText()) && Boolean(btn(/^Pick the folder again/)), mainText().slice(0, 300));
await Sync.now();
step('unplugged: the note says the same (not reachable), with "Pick the folder again…"', /isn't reachable/.test(lastToast()) && /Offline/.test(lastToast()), lastToast());
if (btn(/^Pick the folder again/)) {
  await tap(btn(/^Pick the folder again/), '/^Pick the folder again/');
  await until(() => document.querySelector('dialog.sync-setup[open]'), 6000);
  step('"Pick the folder again…" opens the drive / folder choice', Boolean(document.querySelector('dialog.sync-setup[open]')));
  document.querySelector('dialog.sync-setup')?.close();
}
SyncPanel.close();
await api.off();
await Sync.refresh();
step('sync off: the indicator leaves the rail', !dot());

// ---------- made-up engine statuses from here on (sync is off; nothing is read or written) ----------
let FAKE = null;
const copy = (x) => JSON.parse(JSON.stringify(x));
const over = {}; // the calls a made-up status answers (window.hub.sync itself is read-only: Sync / SyncPanel._setApi)
const fakeApi = new Proxy({}, { get: (t, k) => (FAKE && over[k] ? over[k] : typeof api[k] === 'function' ? (...a) => api[k](...a) : api[k]) }); // (a frozen target can't be proxied with other values)
over.status = async () => copy(FAKE);
over.now = async () => copy(FAKE);
over.conflicts = async () => [];
over.trash = async () => [];
Sync._setApi(() => fakeApi);
if (typeof SyncPanel !== 'undefined') SyncPanel._setApi(() => fakeApi);
const T = Date.now();
const BASE = { on: true, paused: false, big: true, root: 'C:\\Users\\q\\iCloudDrive', label: 'iCloud Drive', provider: 'icloud', machine: 'Studio PC', cloudRoot: 'C:\\Users\\q\\iCloudDrive', cloudDir: 'C:\\Users\\q\\iCloudDrive\\Hearth',
  kinds: [], transfers: [], moving: 0, aside: [], packs: { on: true }, state: 'synced', at: T - 30000, lastOk: T - 30000, pending: 0, conflicts: 0, cloudOnly: [], skippedBig: [], unreadable: [], waiting: [], blocked: [], peersOld: [], need: 0, lastError: null, held: null, error: '',
  peers: [{ name: 'Studio Mac', platform: 'darwin', lastSeen: T - 60000, lastOk: T - 60000 }] };
async function show(name, patch) {
  FAKE = { ...copy(BASE), ...patch };
  await Sync.refresh();
  await openPanel();
  await SyncPanel.render();
  await wait(50);
  return see(name);
}
const clean = (name) => step(`${name}: no paths, ids or codes in the main text`, !JARGON.test(mainText()), mainText().match(JARGON)?.[0]);

// 5. syncing
await show('syncing', { state: 'syncing' });
step('syncing: "↻ Syncing" in the rail and on the panel', /^↻ Syncing$/.test(chip()) && /^Syncing/.test(h2()), audit.syncing);

// 6. waiting for a very long chat's pieces
await show('waiting for pieces', { state: 'pending', pending: 1, waiting: [{ rel: 'chats/sp92-diary.json', why: 'pieces' }] });
step('pieces: "↻ 1 waiting", the chat by its name, why in words', /^↻ 1 waiting$/.test(chip()) && /1 waiting/.test(h2()) && /Tour diary/.test(mainText()) && /newest part is still coming/.test(mainText()), audit['waiting for pieces']);
clean('pieces');
await Sync.now();
step('pieces: Sync now\'s note says it is on its way (not "synced")', /on the way/.test(lastToast()) && !/Everything is synced/.test(lastToast()), lastToast());

// 7. online-only placeholders (OneDrive / iCloud): a big render waits for a click; a Lab file comes by itself
await show('online-only placeholders', { state: 'pending', pending: 3, cloudOnly: ['renders/tour-final.mp4', 'renders/teaser.mov', 'refs/neon-texture.png'], waiting: [{ rel: 'renders/tour-final.mp4', why: 'cloud-only' }, { rel: 'renders/teaser.mov', why: 'cloud-only' }, { rel: 'refs/neon-texture.png', why: 'cloud-only' }, { rel: 'chats/sp92-unknown.json', why: 'arriving' }] });
step('placeholders: each says it is only in the cloud and what to do, with "Download …"', /only in the cloud/.test(mainText()) && /Download/.test(mainText()) && Boolean(btn(/^Download /)), audit['online-only placeholders']);
step('placeholders: a Lab file says it comes by itself', /Lab file/.test(mainText()) && /by itself/.test(mainText()), mainText().slice(0, 500));
step('placeholders: a chat not here yet is "A chat", not its id', !/sp92-unknown/.test(mainText()) && /A chat/.test(mainText()), mainText().slice(0, 500));
clean('placeholders');

// 8. a big file on its way, and big videos kept here
await show('big file waiting', { state: 'pending', pending: 2, moving: 2, transfers: [{ rel: 'captures/park-take.mp4', op: 'up', moving: true, done: 120e6, total: 480e6 }, { rel: 'renders/tour-final.mp4', op: 'up', moving: false, done: 0, total: 900e6 }], skippedBig: ['renders/old-cut.mov'], big: false });
step('big file: "↻ 2 waiting", "Big files on their way (2)" with a bar', /^↻ 2 waiting$/.test(chip()) && /Big files on their way \(2\)/.test(mainText()) && Boolean(panel().querySelector('.sp-bar')), audit['big file waiting']);
step('big videos kept here: says why, with "Sync big videos"', /kept on this computer/.test(mainText()) && Boolean(btn(/^Sync big videos$/)), audit['big file waiting'].buttons);
clean('big file');

// 9. a conflict: both sides, Keep PC / Keep Mac / Keep both
const C1 = { id: 'c92', rel: 'chats/sp92-diary.json', kind: 'json', from: 'Studio Mac', fromPlatform: 'darwin', oursAt: T - 120000, theirsAt: T - 60000, canBoth: true, ours: { title: 'Tour diary (PC)', messages: [] }, theirs: { title: 'Tour diary (Mac)', messages: [] }, fields: [] };
over.conflicts = async () => [copy(C1)];
over.preview = async () => copy(C1);
await show('conflict', { state: 'conflict', conflicts: 1 });
await until(() => panel()?.querySelector('.sp-conflict'), 4000);
see('conflict');
step('conflict: "⚠ 1 conflict" / "1 conflict — choose", Keep PC / Keep Mac / Keep both', /^⚠ 1 conflict$/.test(chip()) && /1 conflict — choose/.test(h2()) && Boolean(btn(/^Keep PC$/)) && Boolean(btn(/^Keep Mac$/)) && Boolean(btn(/^Keep both$/)), audit.conflict);
await Sync.now();
step('conflict: the note doesn\'t say "Everything is synced"', !/Everything is synced/.test(lastToast()) && /1 conflict/.test(lastToast()), lastToast());
clean('conflict');
over.conflicts = async () => []; delete over.preview;

// 10. kept aside (both computers changed it; sync kept one)
await show('kept aside', { aside: [{ id: 'a92', at: T - 300000, rel: 'kv/boards.json', why: 'guard', side: 'theirs', from: 'Studio Mac', fromPlatform: 'darwin', kind: 'json', fields: [] }] });
step('kept aside: "Mac\'s version of Mood boards kept aside — compare", Compare / Keep both / Use that one / OK', /Mac's version of Mood boards kept aside/.test(mainText()) && Boolean(btn(/^Compare$/)) && Boolean(btn(/^Use that one$/)) && Boolean(btn(/^OK$/)), audit['kept aside']);
step('kept aside: the chip and title say so too', /kept aside/.test(h2()), h2());
clean('kept aside');

// 11. deleted files: the list in plain words (the path only on hover)
over.trash = async () => [{ id: 't1', rel: 'chats/sp92-diary.json', day: new Date(T - DAY).toISOString().slice(0, 10), where: 'here' }, { id: 't2', rel: 'kv/boards.json', day: new Date(T).toISOString().slice(0, 10), recovery: true }];
await show('deleted files', {});
await tap(btn(/^Deleted files/), '/^Deleted files/');
const tdlg = () => [...document.querySelectorAll('dialog.sync-list[open]')].pop();
await until(() => tdlg(), 6000);
const tText = (tdlg()?.textContent || '').replace(/\s+/g, ' ');
audit['deleted files'] = { text: tText.slice(0, 400), buttons: [...(tdlg()?.querySelectorAll('button') || [])].map((b) => b.textContent.trim()) }; console.log(`[SP92] deleted files ${JSON.stringify(audit['deleted files'])}`);
step('deleted files: names, when, and Restore; no raw paths', /Tour diary/.test(tText) && /Mood boards/.test(tText) && /Restore/.test(tText) && !/chats\/|kv\/|\.json/.test(tText), tText.slice(0, 300));
step('deleted files: says how long they are kept', /30 days/.test(tText), tText.slice(0, 200));
tdlg()?.close();
over.trash = async () => [];

// 12. errors a file can hit: permission (Windows: in use), disk full, path too long on Windows; a read-only file
await show('cannot sync (permission, disk full, too long)', { blocked: [
  { rel: 'captures/park-take.mp4', why: 'locked', where: 'here', at: T },
  { rel: 'renders/tour-final.mp4', why: 'disk-full', where: 'here', at: T },
  { rel: `projects/tour/${'very-long-folder-name/'.repeat(8)}scene.json`, why: 'win-long', part: 'scene.json', at: T },
  { rel: 'notes-export.md', why: 'read-only', where: 'here', at: T }] });
const cs = audit['cannot sync (permission, disk full, too long)'];
step('can\'t sync: "⚠ 4 to fix" / "4 files can\'t sync — see why", each with its fix', /^⚠ 4 to fix$/.test(chip()) && /4 files can't sync/.test(h2()) && Boolean(btn(/^Try again now$/)) && Boolean(btn(/^Free up space/)) && Boolean(btn(/^Shorten for Windows$/)) && Boolean(btn(/^Allow changes$/)), cs);
step('can\'t sync: plain reasons (another program, the disk is full, too long for Windows)', /Another program is using it/.test(mainText()) && /disk is full/.test(mainText()) && /too long for Windows/.test(mainText()), mainText().slice(0, 600));
clean('can\'t sync');
await Sync.now();
step('a fault is never "Everything is synced": Sync now\'s note names the files that can\'t sync', !/Everything is synced/.test(lastToast()) && /can't sync/.test(lastToast()), lastToast());
step('…and the indicator\'s tooltip agrees', !/Everything is synced/.test(dot()?.title || '') && /can't sync/.test(dot()?.title || ''), dot()?.title);

// 13. a sync error (the whole pass failed: permission on the cloud folder)
await show('sync error', { state: 'error', error: `EACCES: permission denied, open '${BASE.cloudDir}\\files\\kv\\boards.json'`, lastError: null, at: T });
step('error: "⚠ Problem" / "Sync hit a problem — see why", "Last problem" in plain words, the raw reason only under Details', /^⚠ Problem$/.test(chip()) && /Sync hit a problem/.test(h2()) && /Last problem/.test(mainText()) && !/EACCES/.test(mainText()), audit['sync error']);
clean('error');
await Sync.now();
step('error: the note says it couldn\'t finish (not "Syncing" / "synced")', /couldn't finish/i.test(lastToast()) && !/Everything is synced/.test(lastToast()), lastToast());

// 14. this computer's own sync notes can't be read (a store read failure is never "empty"): waits, never "offline"
await show('own notes unreadable', { state: 'offline', error: 'held' });
step('own notes unreadable: says it waits and why, not "the drive isn\'t reachable"', !/isn't reachable/.test(mainText()) && /can't read/.test(mainText()) && /Nothing was changed/.test(mainText()) && /^‖ Waiting$/.test(chip()), audit['own notes unreadable']);
await Sync.now();
step('…its note says the same', /can't read/.test(lastToast()) && !/isn't reachable/.test(lastToast()), lastToast());

// 15. the cloud folder emptied (the cloud drive starting over)
await show('cloud folder emptied', { state: 'offline', error: 'emptied', known: 40 });
step('emptied: "⚠ Folder" / "The cloud folder is empty · paused", nothing deleted, "Start the cloud copy again from here"', /^⚠ Folder$/.test(chip()) && /cloud folder is empty/.test(h2()) && /nothing here was deleted/i.test(mainText()) && Boolean(btn(/^Start the cloud copy again from here$/)), audit['cloud folder emptied']);

// 16. this Hearth is too old for the cloud copy
await show('this computer on an old version', { state: 'offline', error: 'old-version', need: 80 });
step('old here: "⚠ Update" / "Update Hearth here…", with "Check for updates…"', /^⚠ Update$/.test(chip()) && /Update Hearth here/.test(h2()) && Boolean(btn(/^Check for updates/)) && chipWhole(), audit['this computer on an old version']);

// 17. the other computer on an old version
await show('other computer on an old version', { peersOld: [{ name: 'Studio Mac', platform: 'darwin', format: 70 }] });
step('old there: still "✓ Synced", and a plain line to update it on that computer', /^✓ Synced$/.test(chip()) && /Studio Mac/.test(mainText()) && /older version/.test(mainText()) && /Update it/.test(mainText()), audit['other computer on an old version']);

// 18. many files deleted at once: waits for your yes
await show('many deletions waiting', { state: 'held', held: { deletes: 42, list: [{ rel: 'chats/sp92-diary.json', where: 'here', by: 'Studio Mac' }] } });
step('deletions: "⚠ Review" / "42 deletions wait for your yes", "Review them by name…"', /^⚠ Review$/.test(chip()) && /42 deletions wait for your yes/.test(h2()) && Boolean(btn(/^Review them by name/)), audit['many deletions waiting']);

// 19. paused
await show('paused', { state: 'paused', paused: true });
step('paused: "‖ Paused", says changes stay here, with "Resume sync"', /^‖ Paused$/.test(chip()) && /paused/i.test(h2()) && Boolean(btn(/^Resume sync$/)), audit.paused);
let resumed = null; over.pause = async (on) => { resumed = on; FAKE = { ...FAKE, state: 'synced', paused: false }; return copy(FAKE); };
await tap(btn(/^Resume sync$/), '/^Resume sync$/');
await until(() => resumed === false, 3000);
step('…"Resume sync" resumes', resumed === false && /Sync resumed/.test(lastToast()), { resumed, toast: lastToast() });
delete over.pause;

// every button in every state had a name; the panel closes
const unnamed = [...(panel()?.querySelectorAll('button') || [])].filter((b) => !(b.textContent.trim() || b.getAttribute('aria-label')));
step('every button in the panel has a name', !unnamed.length, unnamed.length);
SyncPanel.close();
FAKE = null;
Sync._setApi(null); SyncPanel._setApi(null);
await Sync.refresh();

// 20. first-time setup (sync off): the one-click offer in plain words
step('first time: sync off, no indicator', !Sync.status().on && !dot());
const sd = await Sync.setup();
await until(() => document.querySelector('dialog.sync-setup[open]'), 4000);
const sText = (document.querySelector('dialog.sync-setup')?.textContent || '').replace(/\s+/g, ' ');
audit['first-time setup'] = { text: sText.slice(0, 500), buttons: [...(document.querySelector('dialog.sync-setup')?.querySelectorAll('button') || [])].map((b) => b.textContent.trim()) }; console.log(`[SP92] first-time setup ${JSON.stringify(audit['first-time setup'])}`);
step('first time: says what it does, with one obvious button', /Turn on sync|Use this Hearth|Choose a folder/.test(sText) && !/Engine paths/.test(sText), audit['first-time setup']);
step('first time: no folder paths in the words', !/\/tmp\/|[A-Z]:\\|\/Users\//.test(sText), sText.slice(0, 300));
sd?.close?.();
document.querySelector('dialog.sync-setup')?.close();

step('nothing covered the panel or the indicator while they were used', !(J.out.misses || []).length, J.out.misses);
return J.done();
