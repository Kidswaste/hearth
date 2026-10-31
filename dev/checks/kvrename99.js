// (round 99, kvrename99) One of Hearth's own files too long for the PC's folders, in the sync panel, by clicks.
//   1. Real engine, this computer as a Mac; the PC is a made-up machine record whose data folder path is long (≈ 190
//      characters). A board whose id is long (kv/board-<74 characters>.json) is too long for that PC: it is held back
//      (not in the cloud folder), and the panel says it is one of Hearth's own files, found by its name, that the PC's
//      folder is too long for it, with NO "Rename for Windows" (round 74 offered one, and its click cut the board off:
//      Hearth then read it as missing). The rename asked anyway (an older window) is refused; Hearth still reads the board.
//   2. The PC's side (made-up engine statuses, sync off: nothing read or written): "The folder path on this computer is
//      too long", which folder to move and how, plain words without paths, and "Show Hearth's folder" / "Show the cloud
//      folder" (the call is answered by the made-up status: nothing is opened).
// Only a temp folder is used as the cloud. Nothing is uploaded; nothing real is touched.
//   node dev/smoke.js --check-timeout 180000 --lib dev/checks/journey-lib.js --script dev/checks/kvrename99.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const CLOUD = `${window.SMOKE_TMP || '/tmp'}/kr99-${Date.now()}`;
const F = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const panel = () => document.querySelector('.sync-panel');
const btn = (re, root = panel()) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()));
const exists = async (p) => { try { return Boolean(await window.hub.fs.stat(p)); } catch { return false; } };
const mainText = () => { const p = panel()?.cloneNode(true); if (!p) return ''; for (const d of p.querySelectorAll('details')) d.remove(); return p.textContent.replace(/\s+/g, ' '); };
const JARGON = /(\/tmp\/|[A-Z]:\\|\/Users\/|\.json\b|\bkv\/|\bchats\/|\bE[A-Z]{3,}\b|\bundefined\b|\bnull\b|\bNaN\b)/;
const dataDir = (await window.hub.attachmentsDir()).replace(/[\\/]attachments$/, '');
const BOARD = `board-${'k'.repeat(74)}`; const REL = `kv/${BOARD}.json`;

// ---------- 1. this computer as a Mac; the PC's folders are deep ----------
Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel', configurable: true });
const deep = `C:\\Users\\quentin\\Documents\\Clients\\${'Long client project folder name\\'.repeat(5)}Hearth\\data`;
const PC = { id: 'deep-pc-99a1b2c3', name: 'Studio PC', platform: 'win32', dataDir: deep, cloudRoot: 'C:\\Users\\quentin\\OneDrive', home: 'C:\\Users\\quentin', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000, format: 74, app: '0.98.0' };
step(`the PC's data folder path is long (${deep.length} characters)`, deep.length > 170);
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${PC.id}.json`, JSON.stringify(PC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
await window.hub.kvSet(BOARD, { id: BOARD.slice(6), title: 'Tour board', items: [{ id: 'c1', text: 'a card on the board' }] });
await api.on({ root: CLOUD });
await Sync.refresh();
const mine = () => (Sync.status().blocked || []).find((b) => b.rel === REL);
await until(() => mine(), 25000);
await wait(600);
const gotIt = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await wait(300); }
step('the board is said to be too long for the PC as one of Hearth\'s own files (win-long-app, no fix)', mine()?.why === 'win-long-app' && !mine()?.fix, mine());
step('it is held back: not in the cloud folder, still where Hearth reads it', !(await exists(F(REL))) && (await exists(`${dataDir}/kv/${BOARD}.json`)));

await click('#sync-dot');
await until(() => panel()?.querySelector('.sp-blk[data-why="win-long-app"]'), 15000);
const row = () => panel()?.querySelector('.sp-blk[data-why="win-long-app"]');
const rt = () => (row()?.textContent || '').replace(/\s+/g, ' ');
step('its row says it is one of Hearth\'s own files, found by its name, not renamed', /One of Hearth's own files: Hearth finds it by this name, so it isn't renamed/.test(rt()), rt());
step('…that the PC\'s folder is too long for it, by how much, and to look on the PC', /The folder Hearth uses on your PC is \d+ characters? too long for it/.test(rt()) && /On the PC, open this panel/.test(rt()) && /nothing is lost/.test(rt()), rt());
step('no "Rename for Windows" (nor any button) on its row', !row()?.querySelector('button'), row()?.innerHTML?.slice(0, 300));
step('the row\'s words have no paths or codes', !JARGON.test(rt().replace(/^.*?(One of)/, '$1')), rt().match(JARGON)?.[0]);
await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/kvrename99-mac.png` }).catch(() => null);

// the rename asked anyway (an older window, a stale panel): refused, the board where Hearth reads it
const r = await api.fix(REL, 'rename');
step('Rename for Windows asked anyway: refused, in plain words', r && !r.ok && /Hearth finds it by this name, so it is never renamed/.test(r.error || ''), r);
const back = await window.hub.kvGet(BOARD, null);
step('Hearth still reads the board (was: missing, an empty board, after the click)', back?.items?.[0]?.text === 'a card on the board', back);
step('…and nothing else was made under another name', !(await exists(`${dataDir}/kv/${BOARD.slice(0, 40)}`)));
SyncPanel.close();
await api.off();

// ---------- 2. the PC's side: made-up statuses (sync off; nothing is read or written) ----------
Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
let FAKE = null; const asked = [];
const copy = (x) => JSON.parse(JSON.stringify(x));
const over = { status: async () => copy(FAKE), now: async () => copy(FAKE), conflicts: async () => [], trash: async () => [], showFolder: async (which) => { asked.push(which); return true; } };
const fakeApi = new Proxy({}, { get: (t, k) => (FAKE && over[k] ? over[k] : typeof api[k] === 'function' ? (...a) => api[k](...a) : api[k]) });
Sync._setApi(() => fakeApi);
if (typeof SyncPanel !== 'undefined') SyncPanel._setApi(() => fakeApi);
const T = Date.now();
const BASE = { on: true, paused: false, big: true, root: 'C:\\Users\\q\\OneDrive', label: 'OneDrive', provider: 'onedrive', machine: 'Studio PC', cloudDir: 'C:\\Users\\q\\OneDrive\\Hearth',
  kinds: [], transfers: [], moving: 0, aside: [], packs: { on: false }, state: 'synced', at: T - 30000, lastOk: T - 30000, pending: 0, conflicts: 0, cloudOnly: [], skippedBig: [], unreadable: [], waiting: [], blocked: [], peersOld: [], need: 0, lastError: null, held: null, error: '',
  peers: [{ name: 'Studio Mac', platform: 'darwin', lastSeen: T - 60000, lastOk: T - 60000 }] };
async function show(patch) {
  FAKE = { ...copy(BASE), ...patch };
  await Sync.refresh();
  if (!panel()) { await click('#sync-dot'); await until(() => panel()?.querySelector('h2'), 15000); }
  await SyncPanel.render(); await wait(50);
}
await show({ longPath: { n: 2, over: 25, sample: [REL, 'kv/projects.json'], data: 196, cloud: 40, which: 'data', by: 'Studio Mac' } });
const lp = () => panel()?.querySelector('.sp-longpath');
const lt = () => (lp()?.textContent || '').replace(/\s+/g, ' ');
step('the PC: "The folder path on this computer is too long"', /The folder path on this computer is too long/.test(lt()), lt());
step('…how many of Hearth\'s files, where they are, by how much, never renamed, nothing lost', /2 of Hearth's own files \(on your Studio Mac\)/.test(lt()) && /25 characters too many/.test(lt()) && /never renamed/.test(lt()) && /nothing is lost/.test(lt()), lt());
step('…Hearth\'s folder is the long one: how to move it', /Hearth's folder is the long one: quit Hearth, move the whole Hearth folder somewhere short/.test(lt()) && /saved file locations follow/.test(lt()), lt());
step('…no paths or codes in the main text', !JARGON.test(mainText()), mainText().match(JARGON)?.[0]);
const sf = btn(/^Show Hearth's folder$/, lp());
step('a "Show Hearth\'s folder" button', Boolean(sf));
if (sf) await click(sf);
step('…which asks for Hearth\'s folder (data)', asked[asked.length - 1] === 'data', asked);
await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/kvrename99-pc.png` }).catch(() => null);
await show({ longPath: { n: 1, over: 4, sample: [REL], data: 30, cloud: 250, which: 'cloud' } });
step('the cloud folder is the long one: said, with how to move it in the cloud app', /cloud drive's folder is the long one/.test(lt()) && /1 of Hearth's own file /.test(lt()), lt());
const sc = btn(/^Show the cloud folder$/, lp());
if (sc) await click(sc);
step('…"Show the cloud folder" asks for the cloud folder', Boolean(sc) && asked[asked.length - 1] === 'cloud', asked);
await show({ longPath: null });
step('a short path: no note', !lp());
step('every button in the panel has a name', [...(panel()?.querySelectorAll('button') || [])].every((b) => (b.textContent || b.getAttribute('aria-label') || '').trim()));
SyncPanel.close();
FAKE = null;
Sync._setApi(null); SyncPanel._setApi(null);
await Sync.refresh();
return J.done();
