// (round 63, soundbank63) Sound bank, the main-process side (docs/upgrades/soundbank63.md).
// One index of every Serum 2 / Vital preset the owner has: the Sound desk's bank (and what the ✦ Preset window saved
// into it), plus — opt-in, READ-ONLY — the plugins' own user preset folders. Each entry keeps local tags, a feature
// summary for "similar to this", a favorite star, "used in" (park sketches / takes) and a 3-second preview WAV.
//   <data>/creative-vst/soundbank/index.json      the index (atomic writes: temp file + rename)
//   <data>/creative-vst/soundbank/previews/*.wav  the cached previews (≤ MAX_PREVIEWS, oldest dropped)
// Previews render only when the owner asks ("make previews"), one at a time, in a SEPARATE plugin host process started
// for the queue at below-normal priority and stopped when the queue ends or is cancelled: the live instrument's host is
// never asked to do anything, so a preview can't hold back live audio, and nothing runs while idle.
// Plugin folders are only ever listed and read (readdir / stat / read): nothing here writes, renames or deletes there.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), zlib = require('zlib');
const C = require('./tools/soundbank-core.js');
const DS = require('./datasafe-core'); // careful reads: an index that can't be read is never treated as empty, never saved over
const EXT = { '.vital': 'Vital', '.serumpreset': 'Serum 2' };
const MAX_FILES = 3000, MAX_PREVIEWS = 500, MAX_READ = 4e6;

// The plugins' default user preset folders (verified against Xfer's / Vital's install layouts as documented, 2026-10;
// Serum 2's Mac location varies by installer, so both known places are listed; Vital's data folder can be moved in
// Vital.config's data_directory, which is honoured). Env HEARTH_SOUNDBANK_ROOTS = {"Vital":[…],"Serum 2":[…]} (tests).
function defaultFolders(env = process.env, home = os.homedir(), platform = process.platform) {
  if (env.HEARTH_SOUNDBANK_ROOTS) { try { const j = JSON.parse(env.HEARTH_SOUNDBANK_ROOTS); return [...(j.Vital || []).map(p => ({ path: p, instrument: 'Vital' })), ...(j['Serum 2'] || []).map(p => ({ path: p, instrument: 'Serum 2' }))]; } catch { return []; } }
  const out = [], add = (p, instrument) => { if (p && !out.some(x => x.path === p)) out.push({ path: p, instrument }); };
  const docs = [path.join(home, 'Documents')]; if (platform === 'win32' && env.OneDrive) docs.push(path.join(env.OneDrive, 'Documents')); // OneDrive-redirected Documents
  for (const d of docs) add(path.join(d, 'Xfer', 'Serum 2 Presets', 'Presets', 'User'), 'Serum 2');
  if (platform === 'darwin') add(path.join(home, 'Library', 'Audio', 'Presets', 'Xfer Records', 'Serum 2 Presets', 'Presets', 'User'), 'Serum 2');
  const vitalData = [];
  for (const cfg of [env.APPDATA && path.join(env.APPDATA, 'vital'), path.join(home, 'Library', 'Application Support', 'vital'), path.join(home, '.config', 'vital'), path.join(home, '.local', 'share', 'vital')].filter(Boolean).map(d => path.join(d, 'Vital.config'))) {
    try { const j = JSON.parse(fs.readFileSync(cfg, 'utf8')); if (typeof j.data_directory === 'string' && path.isAbsolute(j.data_directory)) vitalData.push(j.data_directory); } catch { /* no config there */ }
  }
  if (platform === 'win32') vitalData.push(...docs.map(d => path.join(d, 'Vital')));
  else if (platform === 'darwin') vitalData.push(path.join(home, 'Music', 'Vital'), path.join(home, 'Library', 'Audio', 'Presets', 'Vital'));
  else vitalData.push(path.join(home, '.local', 'share', 'vital'));
  for (const d of vitalData) add(path.join(d, 'User', 'Presets'), 'Vital');
  return out;
}

function writeAtomic(file, data) { // a reader (or a crash) only ever sees the old file or the whole new one
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } catch (e) { fs.closeSync(fd); try { fs.rmSync(tmp, { force: true }); } catch {} throw e; }
  fs.closeSync(fd);
  for (let i = 0; ; i++) { try { fs.renameSync(tmp, file); return; } catch (e) { if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { try { fs.rmSync(tmp, { force: true }); } catch {} throw e; } const t = Date.now() + 30 * (i + 1); while (Date.now() < t) { /* a virus scanner holding the file on Windows: retry */ } } }
}
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
function decodeState(state) { // the desk's 'z1:' + base64(zlib(raw_state)) → raw bytes (or null)
  try { const raw = Buffer.from(state.startsWith('z1:') ? state.slice(3) : state, 'base64'); return state.startsWith('z1:') ? zlib.inflateSync(raw, { maxOutputLength: 64e6 }) : raw; } catch { return null; }
}
const encodeState = bytes => 'z1:' + zlib.deflateSync(bytes, { level: 6 }).toString('base64');
function jsonOf(bytes) { if (!bytes || bytes.length > 64e6) return null; let s = bytes.toString('utf8'); s = s.replace(/\0+$/, ''); if (s[0] !== '{') return null; try { return JSON.parse(s); } catch { return null; } }

function create({ dataDir, hostFactory, log = () => {} }) {
  const home = path.join(dataDir, 'creative-vst', 'soundbank'), file = path.join(home, 'index.json'), previews = path.join(home, 'previews');
  let index = null, saveTimer = null, lastScan = 0, scanning = null;
  const queue = { jobs: [], running: false, current: null, done: 0, total: 0, errors: 0, cancelled: false, startedAt: 0, lastError: '' };
  let host = null, hostPlugin = null, states = new Map();

  // The index through datasafe-core (load / readRetry): a held file (a virus scanner, a sync client) is retried; a damaged
  // one falls back to index.prev.json; when neither reads, the bank works in memory for now and NEVER saves over the
  // file (canSave false; read again on the next open). Only a file that reads but is garbled with no copy is kept
  // aside as index.json.unreadable before a new index is started.
  const fresh = () => ({ v: 1, settings: { pluginFolders: false, folders: [] }, entries: {}, files: {} });
  let canSave = true, prevKept = false, again = false; // again: the next open of the picker tries the read once more
  function load() {
    if (index && (canSave || !again)) return index; again = false;
    const r = DS.load(fs, file, null), good = j => j?.v === 1 && j.entries && typeof j.entries === 'object';
    if (good(r.value)) { index = r.value; canSave = r.canSave; if (r.from === 'prev') log('soundbank: index read from its .prev copy'); }
    else if (r.state === 'missing') { index ||= fresh(); canSave = true; }
    else if (r.state === 'unreadable' && r.code === 'EGARBLED' || (r.state === 'ok' && !good(r.value))) {
      try { fs.copyFileSync(file, file.replace(/\.json$/, '.json.unreadable')); index = fresh(); canSave = true; log('soundbank: index damaged, kept aside as index.json.unreadable'); }
      catch { index ||= fresh(); canSave = false; }
    } else { index ||= fresh(); canSave = false; log(`soundbank: index can't be read now (${r.code}); not saving over it`); }
    index.settings ||= { pluginFolders: false, folders: [] }; index.settings.folders ||= []; index.files ||= {}; index.entries ||= {};
    return index;
  }
  function write() {
    if (!index || !canSave) return false;
    // the last good index stays as index.prev.json (datasafe's fallback), once per session, before the first write
    if (!prevKept) { try { fs.copyFileSync(file, file.replace(/\.json$/, '.prev.json')); } catch { /* none yet */ } prevKept = true; }
    writeAtomic(file, JSON.stringify(index)); return true;
  }
  function save(now = false) { clearTimeout(saveTimer); saveTimer = null; if (now) { write(); return; } saveTimer = setTimeout(() => { saveTimer = null; try { write(); } catch (e) { log('soundbank: save failed ' + e.message); } }, 250); }
  function retag(x) { x.tags = C.tagsOf({ name: `${x.name} ${x.label || ''}`, folder: x.folder || '', style: x.style || '', metaTags: x.metaTags || [], features: x.features }); x.vector = C.vector(x.features || {}); return x; }

  // ---------- the desk's bank (the window sends its list: label, instrument name, plugin path, state, from) ----------
  function syncBank(bank) {
    if (!Array.isArray(bank)) return; const ix = load(), seen = new Set();
    for (const b of bank.slice(0, 64)) {
      if (!b || typeof b.state !== 'string' || typeof b.name !== 'string' || !['Vital', 'Serum 2'].includes(b.name)) continue;
      const id = 'b' + hash(b.state); seen.add(id);
      const x = ix.entries[id] ||= { id, favorite: false, usedIn: [], at: new Date().toISOString() };
      const source = b.from === 'preset-hover' ? 'hover' : 'bank';
      Object.assign(x, { source, instrument: b.name, name: String(b.label || b.name).slice(0, 100), plugin: typeof b.path === 'string' ? b.path : x.plugin });
      if (b.features && typeof b.features === 'object' && x.featureSource !== 'render') { x.features = sanitize(b.features); x.featureSource = 'desk'; }
      if (!x.features && b.name === 'Vital') { const j = jsonOf(decodeState(b.state)); if (j) { x.features = C.vitalFeatures(j); x.featureSource = 'state'; x.style = typeof j.preset_style === 'string' ? j.preset_style : ''; } }
      retag(x); states.set(id, b.state);
    }
    for (const [id, x] of Object.entries(ix.entries)) if ((x.source === 'bank' || x.source === 'hover') && !seen.has(id)) drop(id);
    save();
  }
  function sanitize(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) if (/^[a-z]{2,12}$/.test(k) && (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))) o[k] = v; return o; }
  function drop(id) { const x = index.entries[id]; if (x?.preview?.file) try { fs.rmSync(path.join(previews, x.preview.file), { force: true }); } catch {} delete index.entries[id]; }

  // ---------- the plugins' own folders: read-only, opt-in ----------
  function folders() { const ix = load(); return [...defaultFolders(), ...ix.settings.folders.map(p => ({ path: p, instrument: null, mine: true }))]; }
  async function walk(root, depth, out) {
    if (depth > 6 || out.length >= MAX_FILES) return;
    let list; try { list = await fs.promises.readdir(root, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (out.length >= MAX_FILES) return; if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const p = path.join(root, e.name);
      if (e.isDirectory()) await walk(p, depth + 1, out);
      else if (EXT[path.extname(e.name).toLowerCase()]) out.push(p);
    }
  }
  async function readHead(p, n) { const fh = await fs.promises.open(p, 'r'); try { const b = Buffer.alloc(n); const { bytesRead } = await fh.read(b, 0, n, 0); return b.subarray(0, bytesRead); } finally { await fh.close(); } }
  async function scanFolders(force = false) {
    const ix = load(); if (!ix.settings.pluginFolders) return { scanned: false };
    if (scanning) return scanning; if (!force && Date.now() - lastScan < 60000) return { scanned: false };
    scanning = (async () => {
      const found = []; const roots = folders();
      for (const r of roots) { const before = found.length; await walk(r.path, 0, found); r.count = found.length - before; }
      const keep = new Set();
      for (const p of found) {
        let st; try { st = await fs.promises.stat(p); } catch { continue; }
        const instrument = EXT[path.extname(p).toLowerCase()], id = 'f' + hash(p), old = ix.files[p]; keep.add(id);
        if (old && old.mtime === st.mtimeMs && old.size === st.size && ix.entries[id]) continue;
        const root = roots.find(r => p.startsWith(r.path + path.sep)), folder = root ? path.relative(root.path, path.dirname(p)) : path.basename(path.dirname(p));
        const x = ix.entries[id] ||= { id, favorite: false, usedIn: [], at: new Date().toISOString() };
        Object.assign(x, { source: 'plugin', instrument, name: path.basename(p, path.extname(p)).slice(0, 100), file: p, folder: folder.split(path.sep).join(' / ').slice(0, 120) });
        if (x.preview && old && (old.mtime !== st.mtimeMs || old.size !== st.size)) { dropPreview(x); }
        try {
          if (instrument === 'Vital' && st.size <= MAX_READ) { const j = jsonOf(await fs.promises.readFile(p)); if (j) { if (x.featureSource !== 'render') { x.features = C.vitalFeatures(j); x.featureSource = 'file'; } x.style = typeof j.preset_style === 'string' ? j.preset_style : ''; x.author = typeof j.author === 'string' ? j.author.slice(0, 60) : ''; } }
          else if (instrument === 'Serum 2') { const m = C.serumMeta(await readHead(p, 65600)); if (m) { if (m.name) x.name = m.name; x.author = m.author; x.metaTags = m.tags; } }
        } catch { /* unreadable: listed by name only */ }
        retag(x); ix.files[p] = { mtime: st.mtimeMs, size: st.size, id };
      }
      for (const [p, f] of Object.entries(ix.files)) if (!keep.has(f.id)) { delete ix.files[p]; if (ix.entries[f.id]) drop(f.id); }
      lastScan = Date.now(); save(); return { scanned: true, files: found.length, roots: roots.map(r => ({ path: r.path, instrument: r.instrument, count: r.count || 0 })) };
    })();
    try { return await scanning; } finally { scanning = null; }
  }
  function forgetFolders() { const ix = load(); for (const [p, f] of Object.entries(ix.files)) { delete ix.files[p]; if (ix.entries[f.id]) drop(f.id); } save(); }

  // ---------- previews: one at a time, a separate low-priority host, cancelable ----------
  function dropPreview(x) { if (x.preview?.file) try { fs.rmSync(path.join(previews, x.preview.file), { force: true }); } catch {} delete x.preview; }
  function status() { return { running: queue.running, current: queue.current, done: queue.done, total: queue.total, errors: queue.errors, cancelled: queue.cancelled, lastError: queue.lastError }; }
  function startPreviews({ ids = [], roots = [] } = {}) {
    const ix = load(); const want = (ids.length ? ids : Object.keys(ix.entries).filter(id => !ix.entries[id].preview?.error)).filter(id => ix.entries[id] && !ix.entries[id].preview?.file && !queue.jobs.includes(id) && queue.current !== id);
    // grouped per instrument: the preview host loads each plugin once
    want.sort((a, b) => String(ix.entries[a].instrument).localeCompare(String(ix.entries[b].instrument)));
    queue.jobs.push(...want); if (!queue.running) { queue.done = 0; queue.errors = 0; queue.total = 0; queue.cancelled = false; queue.lastError = ''; }
    queue.total += want.length; queue.roots = Array.isArray(roots) ? roots.filter(r => typeof r === 'string' && path.isAbsolute(r)).slice(0, 12) : [];
    if (!queue.running && queue.jobs.length) run();
    return status();
  }
  function cancel() { queue.cancelled = true; queue.jobs = []; stopHost(); return status(); }
  function stopHost() { try { host?.stop(); } catch {} host = null; hostPlugin = null; }
  async function run() {
    queue.running = true; queue.startedAt = Date.now();
    try {
      while (queue.jobs.length && !queue.cancelled) {
        const id = queue.jobs.shift(), x = index.entries[id]; queue.current = id; if (!x) continue;
        try { await renderOne(x); } catch (e) { if (queue.cancelled) break; x.preview = { error: String(e.message || e).slice(0, 200), at: new Date().toISOString() }; queue.errors++; queue.lastError = x.preview.error; }
        queue.done++; save();
        await new Promise(r => setTimeout(r, 60)); // breathe between jobs
      }
    } finally { queue.running = false; queue.current = null; stopHost(); states = new Map([...states].filter(([id]) => index.entries[id])); save(); }
  }
  async function renderOne(x) {
    host ||= hostFactory();
    const scan = host.scan(queue.roots || []); if (!scan.ok) throw Error(scan.error);
    const plugin = (x.plugin && scan.plugins.some(p => p.path === x.plugin)) ? x.plugin : scan.plugins.find(p => p.name === x.instrument)?.path;
    if (!plugin) throw Error(`${x.instrument} isn't installed in the folders the Sound desk scans.`);
    let state = x.source === 'plugin' ? null : states.get(x.id);
    if (x.source === 'plugin') { const st = fs.statSync(x.file); if (st.size > 16e6) throw Error('Preset file too large.'); state = encodeState(fs.readFileSync(x.file)); }
    if (!state) throw Error('Open the Sound bank once more (its state was not sent).');
    if (state.length > 12e6) throw Error('Preset too large to preview.');
    if (hostPlugin !== plugin) { const r = await host.request({ action: 'inspect', plugin, name: x.instrument }); if (!r.ok) throw Error(r.error); hostPlugin = plugin; }
    if (queue.cancelled) throw Error('Cancelled.');
    const t0 = Date.now(), r = await host.request({ action: 'render', plugin, name: x.instrument, state, duration: C.PREVIEW.duration, notes: C.PREVIEW.notes });
    if (!r.ok) throw Error(r.error);
    if (queue.cancelled) throw Error('Cancelled.');
    const name = `${x.id}.wav`; writeAtomic(path.join(previews, name), Buffer.from(r.audio, 'base64'));
    x.preview = { file: name, at: new Date().toISOString(), ms: Date.now() - t0, peak: Math.round(r.peak * 1000) / 1000, silent: !!r.silent };
    // the controls as the preset left them (Vital's own JSON, when read from the file / state, has the real units: kept)
    if (Array.isArray(r.parameters) && !['file', 'state'].includes(x.featureSource)) { const f = C.features(r.parameters); if (Object.keys(f).length >= 3) { x.features = f; x.featureSource = 'render'; } }
    retag(x); prune();
  }
  function prune() { const withP = Object.values(index.entries).filter(x => x.preview?.file).sort((a, b) => String(b.preview.at).localeCompare(String(a.preview.at))); for (const x of withP.slice(MAX_PREVIEWS)) dropPreview(x); }

  // ---------- what the window asks ----------
  const pub = x => { const { vector, ...rest } = x; return rest; };
  async function list({ bank, scan = false } = {}) {
    again = !canSave; load(); if (bank) syncBank(bank);
    let scanned = null; if (index.settings.pluginFolders) scanned = await scanFolders(scan);
    return { ok: true, entries: Object.values(index.entries).map(pub), settings: index.settings, queue: status(), folders: index.settings.pluginFolders ? folders().map(f => ({ path: f.path, instrument: f.instrument, mine: !!f.mine, exists: fs.existsSync(f.path) })) : [], scanned };
  }
  function similarTo(id, n = 8) { const ix = load(), x = ix.entries[id]; if (!x) return { ok: false, error: 'No such preset.' }; const all = Object.values(ix.entries).map(e => ({ ...e, vector: e.vector || C.vector(e.features || {}) })); return { ok: true, similar: C.similar({ ...x, vector: x.vector || C.vector(x.features || {}) }, all, n).map(pub) }; }
  function update(id, patch = {}) {
    const ix = load(), x = ix.entries[id]; if (!x) return { ok: false, error: 'No such preset.' };
    if (typeof patch.favorite === 'boolean') x.favorite = patch.favorite;
    if (Array.isArray(patch.aiTags)) x.aiTags = patch.aiTags.filter(t => C.TAGS.includes(t)).slice(0, 4);
    if (patch.used && typeof patch.used === 'object') {
      const u = { kind: patch.used.kind === 'take' ? 'take' : 'sketch', sketch: String(patch.used.sketch || '').slice(0, 120), title: String(patch.used.title || '').slice(0, 120), at: new Date().toISOString() };
      x.usedIn = (x.usedIn || []).filter(v => !(v.kind === u.kind && v.sketch === u.sketch && v.title === u.title)); x.usedIn.unshift(u); x.usedIn = x.usedIn.slice(0, 12);
    }
    if (patch.lastLoaded) x.lastLoaded = new Date().toISOString();
    save(); return { ok: true, entry: pub(x) };
  }
  function settings(patch = {}) {
    const ix = load();
    if (typeof patch.pluginFolders === 'boolean') { ix.settings.pluginFolders = patch.pluginFolders; if (!patch.pluginFolders) forgetFolders(); else lastScan = 0; }
    if (typeof patch.addFolder === 'string' && path.isAbsolute(patch.addFolder) && !ix.settings.folders.includes(patch.addFolder) && ix.settings.folders.length < 12) { ix.settings.folders.push(patch.addFolder); ix.settings.pluginFolders = true; lastScan = 0; }
    if (typeof patch.removeFolder === 'string') { ix.settings.folders = ix.settings.folders.filter(p => p !== patch.removeFolder); lastScan = 0; }
    save(); return { ok: true, settings: ix.settings };
  }
  function previewBytes(id) { const x = load().entries[id]; if (!x?.preview?.file) return null; try { return fs.readFileSync(path.join(previews, x.preview.file)); } catch { return null; } }
  function stateOf(id) { // a plugin-folder preset for loading live: read, never written
    const x = load().entries[id]; if (!x) return { ok: false, error: 'No such preset.' };
    if (x.source !== 'plugin') { const s = states.get(id); return s ? { ok: true, state: s, instrument: x.instrument, name: x.name } : { ok: false, error: 'This bank preset is loaded from the Sound desk bank.' }; }
    try { const st = fs.statSync(x.file); if (st.size > 16e6) throw Error('Preset file too large.'); const state = encodeState(fs.readFileSync(x.file)); if (state.length > 12e6) throw Error('Preset too large.'); return { ok: true, state, instrument: x.instrument, name: x.name }; } catch (e) { return { ok: false, error: e.message }; }
  }
  return { list, similarTo, update, settings, startPreviews, cancel, status, previewBytes, stateOf, scanFolders, syncBank, flush: () => { if (saveTimer) save(true); }, stop: () => { cancel(); if (saveTimer) save(true); }, _test: { index: () => load(), file, previews, canSave: () => canSave } };
}

function register(ipcMain, { dataDir, getWin, app }) {
  const vst = require('./creative-vstmain.js');
  const bank = create({ dataDir, hostFactory: () => vst.create({ dataDir, lowPriority: true }) });
  const own = (e, fn) => { if (e.sender !== getWin()?.webContents || e.senderFrame !== e.sender.mainFrame) return { ok: false, error: 'Only the Hearth workspace can use the sound bank.' }; try { return fn(); } catch (err) { return { ok: false, error: err.message }; } };
  ipcMain.handle('soundbank:list', (e, o) => own(e, () => bank.list(o || {})));
  ipcMain.handle('soundbank:similar', (e, id, n) => own(e, () => bank.similarTo(String(id), Math.min(24, Number(n) || 8))));
  ipcMain.handle('soundbank:update', (e, id, patch) => own(e, () => bank.update(String(id), patch || {})));
  ipcMain.handle('soundbank:settings', (e, patch) => own(e, () => bank.settings(patch || {})));
  ipcMain.handle('soundbank:previews', (e, o) => own(e, () => { if (o?.bank) bank.syncBank(o.bank); return { ok: true, ...bank.startPreviews(o || {}) }; }));
  ipcMain.handle('soundbank:cancel', e => own(e, () => ({ ok: true, ...bank.cancel() })));
  ipcMain.handle('soundbank:queue', e => own(e, () => ({ ok: true, ...bank.status() })));
  ipcMain.handle('soundbank:preview', (e, id) => own(e, () => bank.previewBytes(String(id))));
  ipcMain.handle('soundbank:state', (e, id) => own(e, () => bank.stateOf(String(id))));
  app.once('will-quit', () => bank.stop());
}
module.exports = { create, register, defaultFolders, writeAtomic, decodeState, encodeState };
