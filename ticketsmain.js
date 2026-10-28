// (round 68, tickets68) 🎟 My ticket, main side: the owner's ticket files copied into Hearth's data folder under each show,
// the index, the Downloads look (names only), the Wallet pass read, the screen kept awake while a ticket is on screen.
//   data/tickets/index.json            { v, shows: { <show key>: { show, files: [{ id, name, file, kind, bytes, sha, addedAt, from }] } }, dismissed }
//                                      careful read (datasafe-core: an index that can't be read is never treated as empty,
//                                      never saved over), atomic writes (crashsafe-core)
//   data/tickets/<show key>/<id>-<name>.<ext>   the copies (the owner's own file is only read, never moved or changed)
// One channel, loaded on first use (main.js lazyIpc): tickets:op { op, … }
//   list · pick (the computer's file picker) · add { show, path | data+name, from } · remove { key, id } (to the Trash / Recycle Bin) · suggest { shows } ·
//   hud { shows } · dismiss { sig } · pass { key, id } · reveal / open { key, id } · awake { on } · test { downloads, picks } (tests only)
// Nothing runs while idle: no timer, no watcher; Downloads is listed (names, sizes, dates) only when a card or the ✦
// tracker asks (kept 20 s while the folder doesn't change). Nothing is uploaded anywhere.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const C = require('./tickets-core');

let dataDir = null, downloadsDir = null, blocker = null, testPicks = null;
const TEST = () => Boolean(process.env.HEARTH_TEST_SAVE_DIR);
const dir = () => path.join(dataDir, 'tickets');
const indexFile = () => path.join(dir(), 'index.json');
const E = () => require('electron');

// ---------- the index ----------
function readIndex() {
  const r = require('./datasafe-core').load(fs, indexFile(), null);
  if (r.state === 'missing' && r.value == null) return { index: C.empty(), ok: true };
  if (r.value == null) return { index: C.empty(), ok: false };
  try { return { index: C.validate(r.value), ok: r.canSave !== false }; } catch { return { index: C.empty(), ok: false }; }
}
function mustRead() {
  const r = readIndex();
  if (!r.ok) throw Error('Your ticket list could not be read, so nothing was changed (Hearth never saves over it). Your ticket files are still in Hearth’s data folder › tickets.');
  return r.index;
}
function writeIndex(index) {
  fs.mkdirSync(dir(), { recursive: true });
  require('./crashsafe-core').writeAtomicSync(fs, indexFile(), JSON.stringify(C.validate(index)));
}
const fileOf = (key, f) => path.join(dir(), key, f.file);
const urlOf = (key, f) => pathToFileURL(fileOf(key, f)).href;
// (round 78, winperf78) each ticket file looked at asynchronously, all at once (was existsSync one by one on the main
// process: 80 at the start on the test profile, through the ✦ tracker); keep(t) leaves out shows not asked about
const here = (p) => fsp.access(p).then(() => true, () => false);
async function view(index, now = Date.now(), keep = null) {
  const shows = C.summary(index, now).filter((t) => !keep || keep(t));
  return Promise.all(shows.map(async (t) => ({ ...t, files: await Promise.all(t.files.map(async (f) => ({ id: f.id, name: f.name, kind: f.kind, bytes: f.bytes, addedAt: f.addedAt, url: urlOf(t.key, f), here: await here(fileOf(t.key, f)) }))) })));
}

// ---------- add: a copy under the show ----------
const newId = () => `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.slice(0, 16);
async function add({ show, path: src, data, name, from = 'pick' } = {}) {
  let bytes, base;
  if (src) {
    src = path.resolve(String(src));
    if (src.startsWith(dir() + path.sep)) throw Error('That file is already one of Hearth’s ticket copies.');
    const st = await fsp.stat(src).catch(() => null);
    if (!st?.isFile()) throw Error('That file can’t be found any more. Was it moved?');
    base = path.basename(src);
    const why = C.refuse(base, st.size); if (why) throw Error(why);
    bytes = await fsp.readFile(src); // the owner's file is only read
  } else if (data) {
    base = String(name || 'ticket.png'); bytes = Buffer.from(String(data), 'base64');
    const why = C.refuse(base, bytes.length); if (why) throw Error(why);
  } else throw Error('Pick a ticket file first.');
  const sh = C.show(show), index = mustRead();
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const id = newId(), file = C.fileName(id, base);
  const { entry, dup } = C.addFile(index, sh, { id, name: base, file, kind: C.kindOf(base), bytes: bytes.length, sha, addedAt: new Date().toISOString(), from });
  if (!dup) {
    const to = path.join(dir(), sh.key, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    require('./crashsafe-core').writeAtomicSync(fs, to, bytes);
    writeIndex(index);
  }
  cache.at = 0;
  return { dup, entry: { id: entry.id, name: entry.name, kind: entry.kind, url: urlOf(sh.key, entry) }, list: await view(index) };
}

// ---------- remove: to the Trash / Recycle Bin (never deleted for good) ----------
async function toBin(p) {
  if (!fs.existsSync(p)) return null;
  const moveTo = async (base) => { const to = path.join(base, `${Date.now().toString(36)}-${path.basename(p)}`); fs.mkdirSync(base, { recursive: true }); fs.renameSync(p, to); return to; };
  if (TEST()) return moveTo(path.join(process.env.HEARTH_TEST_SAVE_DIR, 'tickets-trash'));
  // (platform46) a network share / a USB stick on Windows, a Mac network volume: no Trash there (it would delete for good)
  const check = process.platform === 'win32' ? require('./winpolish').trashCheck(p, { platform: 'win32' })
    : process.platform === 'darwin' ? require('./macpolish').trashCheck(p, { platform: 'darwin' }) : { ok: true };
  if (!check.ok) return moveTo(path.join(dataDir, 'trash', 'tickets'));
  try { await E().shell.trashItem(check.path || p); return 'trash'; } catch { return moveTo(path.join(dataDir, 'trash', 'tickets')); }
}
async function remove({ key, id } = {}) {
  const index = mustRead(), f = C.removeFile(index, String(key || ''), String(id || ''));
  if (!f) throw Error('That ticket isn’t in Hearth any more.');
  const where = await toBin(path.join(dir(), key, f.file));
  writeIndex(index);
  try { fs.rmdirSync(path.join(dir(), key)); } catch { /* not empty, or gone */ }
  return { where, list: await view(index) };
}

// ---------- Downloads: names only, a suggestion only (nothing is moved, renamed or opened) ----------
const cache = { at: 0, dir: '', mtime: 0, files: [] };
function downloads() { return downloadsDir || (TEST() ? path.join(process.env.HEARTH_TEST_SAVE_DIR, 'Downloads') : E().app.getPath('downloads')); }
async function listDownloads() {
  const d = downloads(), dm = (await fsp.stat(d).catch(() => null))?.mtimeMs || 0; // a file added / renamed changes the folder's date
  if (cache.dir === d && cache.mtime === dm && Date.now() - cache.at < 20e3) return cache.files;
  let names = [];
  try { names = (await fsp.readdir(d, { withFileTypes: true })).filter((x) => x.isFile() && C.kindOf(x.name)).map((x) => x.name).slice(0, 400); } catch { names = []; }
  const files = [];
  for (const n of names) { const st = await fsp.stat(path.join(d, n)).catch(() => null); if (st) files.push({ name: n, path: path.join(d, n), size: st.size, mtime: st.mtimeMs }); }
  cache.at = Date.now(); cache.dir = d; cache.mtime = dm; cache.files = files;
  return files;
}
async function suggest(shows, index) {
  const list = (Array.isArray(shows) ? shows : []).slice(0, 60).map((s) => { try { return C.show(s); } catch { return null; } }).filter(Boolean);
  if (!list.length) return [];
  return C.suggest(await listDownloads(), list, { dismissed: index.dismissed, has: (k) => !!index.shows[k] });
}

// ---------- an Apple Wallet pass: its words and, when its code is a QR code, the code itself ----------
async function pass({ key, id } = {}) {
  const index = mustRead(), f = index.shows[key]?.files.find((x) => x.id === id);
  if (!f || f.kind !== 'pkpass') throw Error('That isn’t a Wallet pass.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-pass-'));
  try {
    await require('./zipkit').extract(fileOf(key, f), tmp, { members: ['pass.json'] });
    let raw = fs.readFileSync(path.join(tmp, 'pass.json'));
    if (raw[0] === 0xff && raw[1] === 0xfe) raw = Buffer.from(raw.toString('utf16le').slice(1)); else if (raw[0] === 0xef && raw[1] === 0xbb) raw = raw.subarray(3);
    const j = JSON.parse(raw.toString('utf8'));
    const style = j.eventTicket || j.generic || j.boardingPass || j.storeCard || j.coupon || {};
    const fields = ['headerFields', 'primaryFields', 'secondaryFields', 'auxiliaryFields'].flatMap((k) => (Array.isArray(style[k]) ? style[k] : []))
      .map((x) => ({ label: String(x.label || '').slice(0, 60), value: String(x.value ?? '').slice(0, 160) })).filter((x) => x.value).slice(0, 10);
    const code = (Array.isArray(j.barcodes) ? j.barcodes[0] : null) || j.barcode || null;
    let svg = '';
    if (code?.format === 'PKBarcodeFormatQR' && code.message && Buffer.byteLength(String(code.message)) <= 200) { try { svg = require('./remote-qr').svg(String(code.message)); } catch { svg = ''; } }
    return { title: String(j.description || j.organizationName || '').slice(0, 120), org: String(j.organizationName || '').slice(0, 80), date: String(j.relevantDate || '').slice(0, 40), fields,
      code: code ? { format: String(code.format || '').replace(/^PKBarcodeFormat/, ''), text: String(code.altText || '').slice(0, 80) } : null, svg };
  } catch (err) {
    throw Error(`That Wallet pass can’t be read here (${String(err.message).slice(0, 80)}). Open it in Wallet instead.`);
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* the temp folder goes later */ } }
}

// ---------- the screen stays on while a ticket is shown (no sleep at the door) ----------
function awake(on) {
  const pb = E().powerSaveBlocker;
  if (on && blocker == null) blocker = pb.start('prevent-display-sleep');
  else if (!on && blocker != null) { try { pb.stop(blocker); } catch { /* gone */ } blocker = null; }
  return blocker != null;
}

// the computer's own file picker (PDF, images, Wallet passes; several at once); tests: what the check set
async function pick(req, e) {
  if (TEST()) { const p = testPicks || []; testPicks = null; return { paths: p }; }
  const { dialog, BrowserWindow } = E();
  const win = (e && BrowserWindow.fromWebContents(e.sender)) || BrowserWindow.getFocusedWindow() || undefined;
  const r = await dialog.showOpenDialog(win, { title: req.title ? String(req.title).slice(0, 120) : 'Your ticket', buttonLabel: 'Add my ticket', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Tickets (PDF, images, Wallet passes)', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'pkpass'] }, { name: 'All files', extensions: ['*'] }] });
  return { paths: r.canceled ? [] : r.filePaths.slice(0, 4) };
}

async function op(req = {}, e = null) {
  const o = String(req.op || '');
  if (o === 'pick') return pick(req, e);
  if (o === 'list') { const r = readIndex(); return { list: await view(r.index), problem: r.ok ? '' : 'Your ticket list could not be read just now. Nothing was changed.' }; }
  if (o === 'add') return add(req);
  if (o === 'remove') return remove(req);
  if (o === 'suggest') { const r = readIndex(); return { suggest: await suggest(req.shows, r.index) }; }
  if (o === 'hud') {
    const r = readIndex(), now = Date.now();
    const soon = (Array.isArray(req.shows) ? req.shows : []).filter((s) => Number(s?.start) - now < 7 * 24 * 3600e3); // this week's show quests
    return { ready: await view(r.index, now, (t) => t.phase === 'day'), keys: Object.keys(r.index.shows), suggest: soon.length ? await suggest(soon, r.index) : [] };
  }
  if (o === 'dismiss') { const index = mustRead(); const sig = String(req.sig || '').slice(0, 400); if (sig && !index.dismissed.includes(sig)) { index.dismissed.push(sig); writeIndex(index); } return { ok: true }; }
  if (o === 'pass') return pass(req);
  if (o === 'reveal' || o === 'open') {
    const f = mustRead().shows[req.key]?.files.find((x) => x.id === req.id); if (!f) throw Error('That ticket isn’t in Hearth any more.');
    const p = fileOf(req.key, f);
    if (TEST()) return { path: p };
    if (o === 'reveal') E().shell.showItemInFolder(p); else { const err = await E().shell.openPath(p); if (err) throw Error(err); }
    return { path: p };
  }
  if (o === 'awake') return { on: awake(!!req.on) };
  if (o === 'test' && TEST()) { if (Array.isArray(req.picks)) testPicks = req.picks.map(String); if (req.downloads !== undefined) { downloadsDir = req.downloads ? String(req.downloads) : null; cache.at = 0; } return { downloads: downloads(), dir: dir() }; }
  throw Error(`Unknown ticket step: ${o}`);
}

function register(ipcMain, o = {}) {
  dataDir = o.dataDir;
  ipcMain.handle('tickets:op', async (e, req) => { try { return { ok: true, value: await op(req || {}, e) }; } catch (err) { return { ok: false, error: err.message }; } });
}

module.exports = { register, op, _test: { readIndex, setDataDir: (d) => { dataDir = d; }, setDownloads: (d) => { downloadsDir = d; cache.at = 0; } } };
