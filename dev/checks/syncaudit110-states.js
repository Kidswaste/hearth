// (round 110, syncaudit110) Part 2 of the sync walk (part 1, syncaudit110.js, runs the real engine): the states only a
// made-up engine status can show on this computer, in the engine's own shape, and every button that fixes one, clicked.
// window.hub.sync is read-only, so the status and the calls a button makes go through Sync / SyncPanel._setApi (round
// 92's seam); each click is judged by the call it made. Nothing real is read or written; nothing is uploaded; the update
// check is answered here (no network).
//   · a file held by another program (EBUSY / EPERM on Windows), here or by the cloud drive, then free again: the
//     "waiting" wording, Try again now, and back to ✓ by itself; a drive asleep; mixed with a file that needs a click
//   · disk full (here / the cloud folder's disk): Free up space… and what it offers
//   · the other computer on an older Hearth; a file a newer Hearth saved; this Hearth too old (Check for updates…)
//   · a very long folder path on the PC: Hearth's own files (Show Hearth's folder / Show the cloud folder) and a file
//     (Shorten for Windows); read-only (Allow changes)
//   · a very long chat's pieces on their way; placeholders (Download); big videos kept here (Sync big videos); many
//     deletions (Review them by name… → Keep them); the cloud folder gone (Start the cloud copy again from here); paused
//     (Resume sync); this computer's own records unreadable; a sync error
// In every state: the chip, the panel's title, the indicator's tooltip and name, the ⋯ menu's first line and Sync now's
// note say the same thing; never "Everything is synced" while something is wrong, never an alarm while all is well; no
// paths, ids or codes in the main text. This computer acts as a Windows PC for the words.
//   node dev/smoke.js --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/syncaudit110-states.js
const { step, wait, until, click } = J;
const real = window.hub.sync;
const T = Date.now();
Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
const audit = J.out.audit = {};
const dot = () => document.getElementById('sync-dot');
const chip = () => dot()?.querySelector('.sync-chip')?.textContent || '';
const panel = () => document.querySelector('.sync-panel');
const h2 = () => panel()?.querySelector('h2')?.textContent || '';
const text = (n) => (n?.textContent || '').replace(/\s+/g, ' ').trim();
const mainText = () => { const p = panel()?.cloneNode(true); if (!p) return ''; for (const d of p.querySelectorAll('details')) d.remove(); return text(p); };
const btn = (re, root = panel()) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const JARGON = /(\/tmp\/|[A-Z]:\\|\/Users\/|\.json\b|\bmanifest\b|\bbase\b|\bE[A-Z]{3,}\b|\bkv\/|\bchats\/|\brefs\/|\bundefined\b|\bnull\b|\bNaN\b)/;
const lastToast = () => recentToasts()[0]?.message || '';
const FOOT = /^(Sync now|Deleted files…|Earlier versions…|⋯|×|Copy details for Claude|What syncs: .*)$/;

// ---------- the made-up engine ----------
let FAKE = null;
const calls = [];
const copy = (x) => JSON.parse(JSON.stringify(x));
const over = {};
const fakeApi = new Proxy({}, { get: (t, k) => (FAKE && over[k] ? over[k] : typeof real[k] === 'function' ? (...a) => real[k](...a) : real[k]) });
const rec = (name, ret) => async (...a) => { calls.push({ name, args: copy(a ?? []) }); return typeof ret === 'function' ? ret(...a) : ret === undefined ? copy(FAKE) : ret; };
over.status = async () => copy(FAKE);
over.now = rec('now');
over.conflicts = async () => [];
over.trash = async () => [];
over.pause = rec('pause', (on) => { FAKE = { ...FAKE, paused: Boolean(on), state: on ? 'paused' : 'synced' }; return copy(FAKE); });
over.big = rec('big', (on) => { FAKE = { ...FAKE, big: Boolean(on) }; return copy(FAKE); });
over.download = rec('download');
over.fix = rec('fix', (rel, how) => ({ ok: true, to: how === 'rename' ? 'projects/tour/short/scene.json' : rel }));
over.showFolder = rec('showFolder', true);
over.freeable = rec('freeable', { items: [], bytes: 0, can: true, why: '' });
await Lazy.load('syncpanel');
Sync._setApi(() => fakeApi); SyncPanel._setApi(() => fakeApi);
// the update check, answered here (no network)
await Lazy.load('updater').catch(() => null);
const updChecks = [];
if (typeof Updater !== 'undefined') Updater.check = async (o) => { updChecks.push(o || {}); return { ok: true, upToDate: true }; }; // (a global const: not on window)
step('the update check is answered here (no real check runs)', typeof Updater !== 'undefined' && /updChecks/.test(String(Updater.check)));
const BASE = { on: true, paused: false, big: true, root: 'C:\\Users\\q\\OneDrive', label: 'OneDrive', provider: 'onedrive', machine: 'Studio PC', cloudRoot: 'C:\\Users\\q\\OneDrive', cloudDir: 'C:\\Users\\q\\OneDrive\\Hearth',
  kinds: [], transfers: [], moving: 0, aside: [], packs: { on: false }, state: 'synced', at: T - 30000, lastOk: T - 30000, pending: 0, conflicts: 0, cloudOnly: [], skippedBig: [], unreadable: [], waiting: [], blocked: [], peersOld: [], need: 0, lastError: null, held: null, error: '', longPath: null,
  peers: [{ name: 'Studio Mac', platform: 'darwin', lastSeen: T - 60000, lastOk: T - 60000 }] };
async function openPanel() {
  if (panel()) return panel();
  await until(() => J.visible(dot()), 5000);
  if (J.visible(dot())) await click('#sync-dot'); else await Sync.panel();
  await until(() => panel()?.querySelector('h2'), 15000);
  return panel();
}
// a state: the status, the panel open, then every place that says it, compared
async function show(name, patch, o = {}) {
  FAKE = { ...copy(BASE), ...patch };
  for (const d of document.querySelectorAll('dialog[open]')) d.close(); // (a dialog a button opened)
  await Sync.refresh(); await openPanel(); await SyncPanel.render(); await wait(60);
  const tipL = (dot()?.title || '').split('\n');
  const menu0 = Sync.items()[0];
  const n0 = calls.length; const t0 = Date.now();
  await Sync.now(); // Sync now's note (the made-up engine answers with the same status)
  calls.length = n0; // (that call isn't a button's)
  FAKE = { ...copy(BASE), ...patch }; await Sync.refresh(); await SyncPanel.render(); await wait(40);
  const note = recentToasts().find((x) => x.at >= t0)?.message || '';
  const a = audit[name] = { chip: chip(), title: h2(), tip: tipL[1] || '', name: dot()?.getAttribute('aria-label') || '', menu: typeof menu0 === 'string' ? menu0 : menu0?.label || '', note, text: mainText().slice(0, 600),
    buttons: [...(panel()?.querySelectorAll('button') || [])].map((b) => b.textContent.trim()).filter((b) => b && !FOOT.test(b)) };
  console.log(`[SA110S] ${name} ${JSON.stringify(a)}`);
  const alarm = /^⚠/.test(a.chip); const calm = /^✓/.test(a.chip);
  const bad = /can't sync|couldn't|isn't (there|reachable)|too long|is full|conflict|older version|newer Hearth|Update Hearth/;
  step(`${name}: the chip, the title and the indicator's name agree`, a.name === `Sync: ${a.title}` && Boolean(a.chip), a);
  if (alarm) step(`${name}: "${a.chip}": nowhere does it say "Everything is synced"`, ![a.tip, a.menu, a.note].some((x) => /Everything is synced/.test(x)), { tip: a.tip, menu: a.menu, note: a.note });
  if (calm && !o.calmOk) step(`${name}: "${a.chip}": nothing on the panel says something is wrong`, !panel()?.querySelector('.sp-warn, .sp-blocked li, .sp-longpath') && !bad.test(a.tip), { tip: a.tip, warn: text(panel()?.querySelector('.sp-warn, .sp-blocked, .sp-longpath')).slice(0, 160) });
  step(`${name}: no paths, ids or codes in the main text`, !JARGON.test(a.text), a.text.match(JARGON)?.[0]);
  return a;
}
async function press(re, what) {
  let b = null; let prev = null;
  for (let i = 0; i < 15; i++) { await wait(60); b = btn(re); if (b && b === prev) break; prev = b; }
  if (!b) { step(`there is a button: ${what}`, false, audit); return false; }
  await click(b); await wait(250); return true;
}
const called = (name, test = () => true) => calls.find((c) => c.name === name && test(c.args));
const fixBtns = (a) => a.buttons.filter((b) => !/^(Compare…|Keep .*|Use the one kept aside)$/.test(b));

// ---------- a file another program holds, then free again ----------
const LOCK = { rel: 'captures/park-take.mp4', why: 'locked', where: 'here', code: 'EBUSY', at: T };
let a = await show('a file in use (EBUSY), here', { blocked: [LOCK] });
step('in use: the chip says it waits (not "to fix": Hearth tries again by itself)', /^↻ 1 waiting$/.test(a.chip) && /wait/i.test(a.title) && !/can't sync/.test(a.title), a);
step('in use: the panel says who holds it and that Hearth tries again by itself, with "Try again now"', /Another program is using it/.test(a.text) && /tries again by itself/.test(a.text) && a.buttons.includes('Try again now'), a);
step('in use: the tooltip and the note say it waits, not "can\'t sync"', /wait/.test(a.tip) && !/can't sync/.test(a.tip) && !/can't sync/.test(a.note), { tip: a.tip, note: a.note });
await press(/^Try again now$/, 'Try again now');
step('"Try again now" runs a pass', Boolean(called('now')), calls.slice(-2));
// free again: the next pass finds it fine
FAKE = { ...copy(BASE), at: Date.now(), lastOk: Date.now() }; await Sync.refresh(); await SyncPanel.render();
step('free again: "✓ Synced", the row gone, by itself', chip() === '✓ Synced' && !panel()?.querySelector('.sp-blk'), { chip: chip(), title: h2() });
a = await show('a file in use (EPERM on Windows), by the cloud drive', { blocked: [{ ...LOCK, where: 'cloud', code: 'EPERM' }] });
step('held by the cloud drive: "Your cloud drive is busy with it", waits', /cloud drive is busy/.test(a.text) && /^↻ 1 waiting$/.test(a.chip), a);
a = await show('the drive asleep for one file', { blocked: [{ ...LOCK, why: 'drive', code: 'EIO' }] });
step('the drive didn\'t answer: waits, Hearth tries again by itself', /^↻ 1 waiting$/.test(a.chip) && /tries again by itself/.test(a.text), a);
a = await show('a file in use and a read-only one', { blocked: [LOCK, { rel: 'notes-export.md', why: 'read-only', where: 'here', code: 'EPERM', at: T }] });
step('in use + read-only: one needs a click, so "⚠ … to fix", both listed with their buttons', /^⚠ \d to fix$/.test(a.chip) && a.buttons.includes('Try again now') && a.buttons.includes('Allow changes'), a);
await press(/^Allow changes$/, 'Allow changes');
step('"Allow changes" asks the engine to make it writable', Boolean(called('fix', (x) => x[0] === 'notes-export.md' && x[1] === 'writable')), calls.slice(-2));

// ---------- disk full ----------
a = await show('disk full here', { state: 'pending', pending: 1, waiting: [{ rel: 'renders/tour-final.mp4', why: 'disk-full' }], blocked: [{ rel: 'renders/tour-final.mp4', why: 'disk-full', where: 'here', code: 'ENOSPC', at: T }] });
step('disk full: "⚠ 1 to fix", the disk named, nothing damaged, with "Free up space…"', /^⚠ 1 to fix$/.test(a.chip) && /disk is full/.test(a.text) && /Nothing was damaged/.test(a.text) && a.buttons.includes('Free up space…'), a);
await press(/^Free up space…$/, 'Free up space…');
await until(() => /Free up space on this computer/.test(h2()), 5000);
await wait(200);
const free = audit['disk full: Free up space…'] = { title: h2(), text: mainText().slice(0, 500) };
console.log(`[SA110S] free ${JSON.stringify(free)}`);
step('"Free up space…" opens Free up space on this computer', /Free up space on this computer/.test(free.title) && Boolean(called('freeable')), free);
step('…when there is nothing Hearth can free, it says how to make room another way', /Recycle Bin|Trash|make room|free some space/i.test(free.text), free.text);
await press(/^‹ Back$/, '‹ Back');
a = await show('disk full: the cloud folder\'s disk', { blocked: [{ rel: 'renders/tour-final.mp4', why: 'disk-full', where: 'cloud', code: 'ENOSPC', at: T }] });
step('the cloud folder\'s disk full: said so, it goes once there is room', /disk with your cloud folder is full/.test(a.text) && /^⚠/.test(a.chip), a);

// ---------- older / newer Hearth ----------
a = await show('the other computer on an older Hearth', { peersOld: [{ name: 'Studio Mac', platform: 'darwin', format: 70 }] }, { calmOk: true });
step('older there: "✓ Synced" (it goes on), a plain line to update it on that computer', a.chip === '✓ Synced' && /Hearth on Studio Mac is an older version/.test(a.text) && /syncing goes on meanwhile/.test(a.text), a);
a = await show('a file a newer Hearth saved', { blocked: [{ rel: 'kv/boards.json', why: 'newer-app', where: 'cloud', at: T }] });
step('saved by a newer Hearth: says update Hearth here, with "Check for updates…"', /newer Hearth/.test(a.text) && a.buttons.includes('Check for updates…'), a);
if (a.buttons.includes('Check for updates…')) { await press(/^Check for updates…$/, 'Check for updates…'); await until(() => updChecks.length, 3000); step('"Check for updates…" checks for an update', updChecks.length >= 1, updChecks); }
a = await show('this Hearth too old', { state: 'offline', error: 'old-version', need: 80 });
step('too old here: "⚠ Update", with "Check for updates…"', a.chip === '⚠ Update' && a.buttons.includes('Check for updates…'), a);
const u0 = updChecks.length;
await press(/^Check for updates…$/, 'Check for updates…');
await until(() => updChecks.length > u0, 3000);
step('…the button checks for an update', updChecks.length > u0, updChecks.length);

// ---------- a very long folder path on the PC ----------
const LP = { n: 3, which: 'data', over: 12, by: 'Studio Mac', data: 168, cloud: 44, sample: ['kv/board-a-very-long-board-id.json'] };
a = await show('a long folder path on the PC (Hearth\'s folder)', { longPath: LP });
step('long path (Hearth\'s folder): the chip and the title say something needs a look (not "✓ Synced")', /^⚠/.test(a.chip) && !/^Synced/.test(a.title), a);
step('long path: the tooltip doesn\'t say everything is synced', !/Everything is synced/.test(a.tip), a.tip);
step('long path: what to do in plain words, with "Show Hearth\'s folder"', /folder path on this computer is too long/.test(a.text) && /move the whole Hearth folder/.test(a.text) && a.buttons.includes('Show Hearth\'s folder'), a);
await press(/^Show Hearth's folder$/, 'Show Hearth\'s folder');
step('"Show Hearth\'s folder" shows it', Boolean(called('showFolder', (x) => x[0] === 'data')), calls.slice(-1));
a = await show('a long folder path on the PC (the cloud folder)', { longPath: { ...LP, which: 'cloud' } });
await press(/^Show the cloud folder$/, 'Show the cloud folder');
step('the cloud folder is the long one: says how, "Show the cloud folder" shows it', /cloud drive's folder is the long one/.test(a.text) && Boolean(called('showFolder', (x) => x[0] === 'cloud')), a);
a = await show('a file too long for Windows', { blocked: [{ rel: `projects/tour/${'very-long-folder-name/'.repeat(8)}scene.glb`, why: 'win-long', part: 'scene.glb', over: 20, at: T }] });
await press(/^Shorten for Windows$/, 'Shorten for Windows');
await until(() => /Renamed to/.test(lastToast()), 3000);
step('a file too long for Windows: "Shorten for Windows" renames it, and says so', Boolean(called('fix', (x) => x[1] === 'rename')) && /Renamed to/.test(lastToast()), { calls: calls.slice(-2), toast: lastToast() });
a = await show('one of Hearth\'s own files too long on the PC (seen from the Mac)', { blocked: [{ rel: 'kv/board-a-very-long-board-id.json', why: 'win-long-app', over: 12, at: T }] });
step('Hearth\'s own file: no rename offered, the fix said to be on the PC', !a.buttons.some((b) => /Rename|Shorten/.test(b)) && /never renamed|isn't renamed/.test(a.text), a);

// ---------- the other states, each with its button ----------
a = await show('a very long chat\'s pieces on their way', { state: 'pending', pending: 1, packs: { on: true, gate: { ok: true } }, waiting: [{ rel: 'chats/sa110-long.json', why: 'pieces' }] });
step('pieces: "↻ 1 waiting", the newest part still coming, it stays as it is here meanwhile', /^↻ 1 waiting$/.test(a.chip) && /newest part is still coming/.test(a.text) && /stays as it is here/.test(a.text), a);
a = await show('online-only placeholders', { state: 'pending', pending: 2, cloudOnly: ['renders/a.mp4', 'renders/b.mov'], waiting: [{ rel: 'renders/a.mp4', why: 'cloud-only' }, { rel: 'renders/b.mov', why: 'cloud-only' }] });
await press(/^Download those 2 now$/, 'Download those 2 now');
step('placeholders: "Download those 2 now" downloads them', Boolean(called('download')), calls.slice(-1));
a = await show('big videos kept here', { skippedBig: ['renders/old-cut.mov'], big: false }, { calmOk: true });
await press(/^Sync big videos$/, 'Sync big videos');
step('big videos kept here: "Sync big videos" turns it on', Boolean(called('big', (x) => x[0] === true)), calls.slice(-1));
a = await show('many deletions waiting', { state: 'held', held: { deletes: 42, list: [{ rel: 'chats/sa110-long.json', where: 'here', by: 'Studio Mac' }] } });
await press(/^Review them by name…$/, 'Review them by name…');
await until(() => document.querySelector('dialog.sync-list[open]'), 4000);
const hd = document.querySelector('dialog.sync-list[open]');
audit['many deletions: the list'] = { text: text(hd).slice(0, 300) };
step('"Review them by name…" lists them, with Keep them / Delete those 42', /Keep them/.test(text(hd)) && /Delete those 42/.test(text(hd)), text(hd).slice(0, 200));
step('…by name, no paths (a chat not here any more is "A chat", not "The chat “A chat”")', !/chats\/|\.json|“A chat”/.test(text(hd)), text(hd).slice(0, 300));
const keepB = [...(hd?.querySelectorAll('button') || [])].find((b) => /^Keep them/.test(b.textContent.trim()));
if (keepB) { await click(keepB); await until(() => called('now', (x) => x[0]?.mass === 'keep'), 3000); }
step('…"Keep them (bring them back)" asks the engine to keep them', Boolean(called('now', (x) => x[0]?.mass === 'keep')), calls.slice(-1));
a = await show('the cloud folder gone', { state: 'offline', error: 'missing' });
await press(/^Start the cloud copy again from here$/, 'Start the cloud copy again from here');
step('folder gone: "Start the cloud copy again from here" starts it again', Boolean(called('now', (x) => x[0]?.fresh === true)), calls.slice(-1));
a = await show('paused', { state: 'paused', paused: true });
await press(/^Resume sync$/, 'Resume sync');
step('paused: "Resume sync" resumes', Boolean(called('pause', (x) => x[0] === false)), calls.slice(-1));
a = await show('this computer\'s own records unreadable', { state: 'offline', error: 'held' });
step('own records unreadable: "‖ Waiting", nothing changed, tries again by itself (never "offline" or "empty")', a.chip === '‖ Waiting' && /Nothing was changed/.test(a.text) && !/isn't reachable|empty/.test(a.text), a);
a = await show('a sync error', { state: 'error', error: 'EACCES: permission denied, open \'C:\\Users\\q\\OneDrive\\Hearth\\files\\kv\\boards.json\'' });
step('error: "⚠ Problem", the reason in plain words, the raw one only under Details', a.chip === '⚠ Problem' && /Last problem/.test(a.text) && !/EACCES/.test(a.text), a);
step('error: Sync now\'s note reads as one sentence ("…allowed to open the sync folder", not "open The sync folder")', /couldn't finish/.test(a.note) && !/[a-z,] The sync folder/.test(a.note), a.note);

// every alarm state had a way forward on the panel: its own button, or words saying the fix is elsewhere
const stuck = Object.entries(audit).filter(([, x]) => x.chip && /^⚠/.test(x.chip) && !fixBtns(x).length && !/on (the|your) (Mac|PC|other computer)|tries again by itself/.test(x.text)).map(([k]) => k);
step('every "⚠" state has a button that does the fix (or says where the fix is)', !stuck.length, stuck);
SyncPanel.close();
FAKE = null; Sync._setApi(null); SyncPanel._setApi(null);
await Sync.refresh();
step('sync is off again: no indicator', !Sync.status().on && !dot());
step('nothing covered a button while it was clicked', !(J.out.misses || []).length, J.out.misses);
return J.done();
