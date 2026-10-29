// File-system services for the tools (Forgeheart workspace, Three.js Lab, After Effects kit):
// listing, reading, writing, searching, watching, zipping, recycling and diffing.
const { dialog, net, shell } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
// Windows' own bsdtar (Git's GNU tar on the PATH can't write zips); the Mac's tar is bsdtar.
const TAR = process.platform === 'win32' ? require('path').join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

const assertAbs = (p) => {
  if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error(`Not an absolute path: ${p}`);
  return path.normalize(p);
};

// (round 20) list / search live in fswalk.js; a recursive listing and a search run on the store thread (storework.js)
const { list, search } = require('./fswalk');
const offThread = (op, args, here) => { try { const st = require('./store'); return st.runOff ? st.runOff(op, args).catch(() => here()) : here(); } catch { return here(); } };

function read(file, { maxBytes = 20 * 1024 * 1024, encoding = 'utf8' } = {}) {
  const p = assertAbs(file);
  const { size } = fs.statSync(p);
  if (size > maxBytes) throw new Error(`File is ${Math.round(size / 1048576)} MB, over the ${Math.round(maxBytes / 1048576)} MB limit`);
  // (round 43, datasafe) a file held for a moment (Windows: an antivirus, OneDrive) is read again a few times (≈ 0.4 s)
  // instead of failing: templates, recipes and the undo log read through here
  for (let i = 0; ; i++) {
    try { return encoding === 'buffer' ? fs.readFileSync(p) : fs.readFileSync(p, encoding === 'base64' ? 'base64' : 'utf8'); } catch (err) {
      if (i >= 4 || !['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EIO', 'UNKNOWN'].includes(err.code)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, require('./scenesafe-core').waitFor(i, 30 * (i + 1))); // (round 65, mainhang65) ≤ 50 ms in all on the main thread
    }
  }
}

function write(file, content, { base64 = false } = {}) {
  const p = assertAbs(file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  ownWrite(p);
  const tmp = `${p}.hubtmp`;
  const bytes = content instanceof Uint8Array ? content : content instanceof ArrayBuffer ? new Uint8Array(content) : null;
  const fd = fs.openSync(tmp, 'w'); // (round 50, crashsafe) flushed to the disk before the rename (a power cut: old or whole)
  try { fs.writeSync(fd, bytes || (base64 ? Buffer.from(content, 'base64') : content)); try { fs.fsyncSync(fd); } catch { /* can't */ } } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, p);
  return true;
}

// (round 42, filewatch) Hearth's own writes aren't "changed outside Hearth": told to the watcher service when it's loaded
const ownWrite = (p) => { try { require.cache[path.join(__dirname, 'filewatchmain.js')]?.exports.own(p); } catch { /* not loaded */ } };

const watchers = new Map();
function watch(id, file, onChange) {
  unwatch(id);
  const p = assertAbs(file);
  let timer;
  const w = fs.watch(p, () => { clearTimeout(timer); timer = setTimeout(() => onChange(p), 300); });
  watchers.set(id, w);
}
function unwatch(id) {
  watchers.get(id)?.close();
  watchers.delete(id);
}

// (round 32, winpolish) deletes stay recoverable on Windows: a file on a network share / USB drive (no Recycle Bin there:
// Windows would delete it for good) is left alone with a plain reason; long-path (\\?\) names and trailing slashes are
// cleaned first; a failure says what happened in plain words. Nothing is ever deleted permanently.
const WinPolish = require('./winpolish');
const MacPolish = require('./macpolish');
async function trash(paths) {
  const done = [];
  const failed = [];
  for (const p of paths) {
    let target;
    try { target = assertAbs(p); } catch { failed.push({ path: p, error: `Hearth only deletes files named with their full path (${p}); nothing was deleted.` }); continue; }
    // (round 33, macpolish) the Mac: a network share or a read-only disk has no Trash (left alone, said why)
    const check = process.platform === 'darwin' ? MacPolish.trashCheck(target) : WinPolish.trashCheck(target);
    if (!check.ok) { failed.push({ path: p, error: check.error, reason: check.reason }); continue; }
    try { await shell.trashItem(check.path); done.push(p); } catch (err) { failed.push({ path: p, error: process.platform === 'win32' ? WinPolish.trashError(err, check.path) : process.platform === 'darwin' ? MacPolish.trashError(err, check.path) : err.message }); }
  }
  return { done, failed };
}

// entries: [{ path, name }] -> zip at `out` (Windows bsdtar writes .zip with -a)
function zip(entries, out, { skipDirs = [] } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-zip-'));
  try {
    for (const e of entries) {
      const dest = path.join(tmp, e.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.statSync(e.path).isDirectory()) {
        fs.cpSync(e.path, dest, { recursive: true, filter: (src) => !skipDirs.includes(path.basename(src)) || src === e.path });
      } else fs.copyFileSync(e.path, dest);
    }
    const target = assertAbs(out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) fs.rmSync(target);
    // (round 46, platform46) plain Node on every computer (zipkit.js): Windows' tar.exe garbled accented names, the
    // Mac's tar added "._" files; nothing outside to be missing
    const done = () => { try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { setTimeout(() => fs.rm(tmp, { recursive: true, force: true }, () => {}), 5000); } };
    // the temp copy: Windows (antivirus, indexer) can still hold it for a moment; never crash over it
    return require('./zipkit').writeZip(tmp, target, { skip: (rel) => /(^|\/)(\._[^/]*|\.DS_Store)$/.test(rel) })
      .then(() => { done(); return { path: target, size: fs.statSync(target).size }; }, (err) => { done(); try { fs.rmSync(target, { force: true }); } catch { /* none */ } throw err; });
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
}

// Line diff (Myers). Gives up when the files differ by more than maxEdits lines.
function diffLines(aText, bText, { maxEdits = 2500, context = 3 } = {}) {
  const a = aText.split('\n');
  const b = bText.split('\n');
  // Trim the common head and tail first; builds usually differ in a few places.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const A = a.slice(start, endA);
  const B = b.slice(start, endB);
  const N = A.length;
  const M = B.length;
  const limit = Math.min(N + M, maxEdits);
  const off = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace = [];
  let found = false;
  for (let d = 0; d <= limit; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) { x += 1; y += 1; }
      v[off + k] = x;
      if (x >= N && y >= M) { found = true; break; }
    }
    if (found) break;
  }
  if (!found) return { tooBig: true, linesA: a.length, linesB: b.length };
  // Backtrack into an edit script.
  const ops = [];
  let x = N;
  let y = M;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d -= 1) {
    const vv = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1]) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : vv[off + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push(['=', A[x - 1]]); x -= 1; y -= 1; }
    if (d > 0) {
      if (x === prevX) ops.push(['+', B[y - 1]]); else ops.push(['-', A[x - 1]]);
    }
    x = prevX; y = prevY;
  }
  ops.reverse();
  // Group into hunks with surrounding context lines.
  const hunks = [];
  let lineA = start + 1;
  let lineB = start + 1;
  let hunk = null;
  let sinceChange = Infinity;
  const pre = a.slice(Math.max(0, start - context), start).map((t) => ['=', t]);
  const all = [...pre, ...ops];
  lineA -= pre.length; lineB -= pre.length;
  all.forEach(([op, text], i) => {
    if (op !== '=') {
      if (!hunk) {
        hunk = { startA: lineA, startB: lineB, lines: [] };
        for (let j = Math.max(0, i - context); j < i; j += 1) hunk.lines.push(all[j]);
        hunk.startA -= hunk.lines.length; hunk.startB -= hunk.lines.length;
        hunks.push(hunk);
      }
      hunk.lines.push([op, text]);
      sinceChange = 0;
    } else if (hunk) {
      sinceChange += 1;
      if (sinceChange <= context) hunk.lines.push([op, text]);
      else hunk = null;
    }
    if (op !== '+') lineA += 1;
    if (op !== '-') lineB += 1;
  });
  const added = ops.filter((o) => o[0] === '+').length;
  const removed = ops.filter((o) => o[0] === '-').length;
  // Cap each line's length so minified one-line blobs don't flood the view.
  for (const h of hunks) h.lines = h.lines.map(([op, t]) => [op, t.length > 400 ? `${t.slice(0, 400)} … (${t.length} chars)` : t]);
  return { hunks, added, removed, linesA: a.length, linesB: b.length };
}

async function fetchText(url) {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

// ---------- backups: one-click backups to a folder, the list of them, and a merging restore ----------
// Paths of the hub's own files (fsapi.js sits next to main.js and config.json).
// (round 55, configsafe) the owner's config.json / theme.css live in data/ (the ones next to main.js are the repo's defaults)
const HUB = { data: path.join(__dirname, 'data'), get config() { return require('./configsafe-core').ownFile(__dirname, 'config.json'); }, get theme() { return require('./configsafe-core').ownFile(__dirname, 'theme.css'); } };
const BACKUP_SKIP = ['workspace', 'ae', 'sync'];
function hubSettings() { try { return JSON.parse(fs.readFileSync(HUB.config, 'utf8')).settings || {}; } catch { return {}; } }
// (round 45, backupauto) this computer's own backup folder (data/.backup/state.json; the old synced settings.backupDir
// only while it is a folder here): backupautomain.js
const backupDir = () => { try { return require('./backupautomain').dir(); } catch { return hubSettings().backupDir || path.join(os.homedir(), 'Documents', 'Hearth backups'); } };

function listBackups(dir = backupDir()) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return { dir, items: [] }; }
  const items = names.filter((n) => /\.zip$/i.test(n)).map((n) => {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    return { name: n, path: p, size: st.size, mtime: st.mtimeMs };
  }).sort((a, b) => b.mtime - a.mtime);
  return { dir, items };
}
// Zips data + config + theme into the backup folder (no dialog) and keeps the newest `keep` hearth-*.zip files;
// older ones go to the Recycle Bin / Trash.
async function backupNow({ keep = 10 } = {}) {
  // (round 45, backupauto) one backup the new way (checked after it's written, big media once, the rotation); the
  // answer keeps its old shape ({ path, size, dir, removed }) and throws in plain words when it failed
  let BA = null; try { BA = require('./backupautomain'); } catch { BA = null; }
  if (BA) {
    const r = await BA.run('manual');
    if (!r.ok) throw Object.assign(new Error(r.why), { fix: r.fix, code: r.code });
    return { ...r, removed: r.removed || 0 };
  }
  const dir = backupDir();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const entries = [{ path: HUB.data, name: 'data' }, { path: HUB.config, name: 'config.json' }, { path: HUB.theme, name: 'theme.css' }].filter((e) => fs.existsSync(e.path));
  const r = await zip(entries, path.join(dir, `hearth-backup-${stamp}.zip`), { skipDirs: BACKUP_SKIP });
  const old = listBackups(dir).items.filter((b) => /^hearth-backup-/.test(b.name)).slice(Math.max(1, keep));
  if (old.length) await trash(old.map((b) => b.path));
  return { ...r, dir, removed: old.length };
}

function unzipTo(zipPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-restore-'));
  // (round 46) plain Node first (zipkit: the same on both computers, every file's CRC checked); the system's tool only
  // for a zip it can't read (another program's compression)
  return require('./zipkit').extract(assertAbs(zipPath), dir).then(() => dir, (zerr) => new Promise((resolve, reject) => {
    if (zerr.code === 'EZIPCRC') { reject(zerr); return; }
    const done = (err) => (err ? reject(err) : resolve(dir));
    // GNU tar (Linux) can't read zips; unzip can
    if (process.platform === 'linux') execFile('unzip', ['-q', '-o', assertAbs(zipPath), '-d', dir], done);
    else execFile(TAR, ['-xf', assertAbs(zipPath), '-C', dir], { windowsHide: true }, done);
  }));
}
const readJsonSafe = (p, fallback) => { try { return JSON.parse(require('./scenesafe-core').readRetry(fs, p)); } catch { return fallback; } };
const jsonFiles = (dir) => { try { return fs.readdirSync(dir).filter((n) => n.endsWith('.json') && !n.endsWith('.prev.json') && !n.endsWith('.tmp')); } catch { return []; } };

// Compares a backup with the current data and (unless dryRun) merges it in. Nothing of yours is deleted:
//   chats      missing here are added; with newer: true, chats the backup has a newer version of replace yours
//              (yours are kept in data/trash/restored-<date>/ first)
//   tool data  (kv: notes, prompts, sketches…) files missing here are added; different ones are reported, kept
//   memory     lines missing here are added
//   attachments missing files are copied
// config.json and theme.css are never restored automatically (agents in the backup but not here are listed).
// (round 45, backupauto) a list store (each item with an id: Lab scenes, notes, prompts, boards…) or a keyed store that
// differs: what the backup has and yours doesn't is added (never removed or replaced). Not stores about this run / this
// computer (an old offline queue would send old messages again).
const NO_MERGE = new Set(['offline-queue', 'fake-switches', 'jank-log', 'dev-reports', 'downloads-log', 'token-stats', 'ui-usage', 'media-here', 'toolwake']);
function missingOf(mine, theirs) {
  const withIds = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && (typeof x.id === 'string' || typeof x.id === 'number'));
  if (Array.isArray(mine) && withIds(theirs) && (!mine.length || withIds(mine))) {
    const have = new Set(mine.map((x) => String(x.id)));
    const add = theirs.filter((x) => !have.has(String(x.id)));
    return add.length ? { n: add.length, value: [...mine, ...add], ids: add.map((x) => String(x.id)) } : null;
  }
  if (mine && theirs && typeof mine === 'object' && typeof theirs === 'object' && !Array.isArray(mine) && !Array.isArray(theirs)) {
    const add = Object.keys(theirs).filter((k) => !(k in mine));
    return add.length ? { n: add.length, value: { ...mine, ...Object.fromEntries(add.map((k) => [k, theirs[k]])) } } : null;
  }
  return null;
}
// (round 84, bigchat84) a chat's title and times for the restore's comparison: a GIANT one (≥ 8 MB) from its own fields,
// cut on the files thread (store.js chatHead), never parsed here (two 60 MB parses held the main process ≈ 1.5 s per
// look, and a restore looks twice). null when it can't be read (yours then counts as unreadable: never copied over)
async function chatMeta(file) {
  let size = 0; try { size = fs.statSync(file).size; } catch { return null; }
  if (size >= 8 * 1024 * 1024) { try { const st = require('./store'); const h = st.chatHead ? await st.chatHead(file) : null; if (h) return h.head ? h.head : null; } catch { /* read here */ } }
  return readJsonSafe(file, null);
}
async function restoreBackup(zipPath, { dryRun = true, newer = false } = {}) {
  let BA = null; try { BA = require('./backupautomain'); } catch { BA = null; }
  // (round 45, backupauto) a backup of how things are now comes first (unless a good one is a few minutes old); the zip
  // being restored is kept out of that backup's rotation
  if (!dryRun && BA) { BA.pin?.(zipPath, true); try { await BA.before('restore'); } catch { /* the restore only adds */ } }
  const tmp = await unzipTo(zipPath);
  try {
    const src = fs.existsSync(path.join(tmp, 'data')) ? path.join(tmp, 'data') : tmp;
    if (!fs.existsSync(path.join(src, 'chats')) && !fs.existsSync(path.join(src, 'kv'))) throw new Error("That zip doesn't look like a Hearth backup (no data/chats or data/kv).");
    const report = { dryRun, chats: { add: 0, newer: 0, same: 0, older: 0, replaced: 0 }, kv: { add: 0, differ: [], same: 0, merge: [] }, memory: { add: 0 }, attachments: { add: 0 }, media: { add: 0, missing: 0 }, agentsMissing: [], titles: [] };
    const stamp = new Date().toISOString().slice(0, 10);
    const keepDir = path.join(HUB.data, 'trash', `restored-${stamp}`);
    // chats
    const chatsSrc = path.join(src, 'chats');
    const chatsDst = path.join(HUB.data, 'chats');
    fs.mkdirSync(chatsDst, { recursive: true });
    for (const n of jsonFiles(chatsSrc)) {
      const theirs = await chatMeta(path.join(chatsSrc, n)); // (round 84, bigchat84: was readJsonSafe, also below)
      if (!theirs) continue;
      const mineP = path.join(chatsDst, n);
      const mine = fs.existsSync(mineP) ? await chatMeta(mineP) : null;
      // (round 43, datasafe) yours is there but can't be read just now: never copied over (it was, as "missing")
      if (!mine && fs.existsSync(mineP)) { report.chats.unreadable = (report.chats.unreadable || 0) + 1; continue; }
      if (!mine) {
        report.chats.add += 1;
        if (report.titles.length < 8) report.titles.push(theirs.title || n);
        if (!dryRun) fs.copyFileSync(path.join(chatsSrc, n), mineP);
      } else if ((theirs.updatedAt || 0) > (mine.updatedAt || 0)) {
        report.chats.newer += 1;
        if (!dryRun && newer) {
          fs.mkdirSync(keepDir, { recursive: true });
          fs.copyFileSync(mineP, path.join(keepDir, n));
          fs.copyFileSync(path.join(chatsSrc, n), mineP);
          report.chats.replaced += 1;
        }
      } else if ((theirs.updatedAt || 0) < (mine.updatedAt || 0)) report.chats.older += 1;
      else report.chats.same += 1;
    }
    // tool data
    const kvSrc = path.join(src, 'kv');
    const kvDst = path.join(HUB.data, 'kv');
    fs.mkdirSync(kvDst, { recursive: true });
    for (const n of jsonFiles(kvSrc)) {
      const mineP = path.join(kvDst, n);
      if (!fs.existsSync(mineP)) { report.kv.add += 1; if (!dryRun) fs.copyFileSync(path.join(kvSrc, n), mineP); continue; }
      if (fs.readFileSync(mineP, 'utf8') === fs.readFileSync(path.join(kvSrc, n), 'utf8')) { report.kv.same += 1; continue; }
      const name = n.replace(/\.json$/, '');
      // (round 45, backupauto) what the backup has and yours doesn't comes in (a deleted Lab scene, a lost note)
      const mine = NO_MERGE.has(name) ? undefined : readJsonSafe(mineP, undefined);
      const m = mine === undefined ? null : missingOf(mine, readJsonSafe(path.join(kvSrc, n), undefined));
      if (!m) { report.kv.differ.push(name); continue; }
      report.kv.merge.push({ name, n: m.n });
      if (!dryRun) { const st = require('./store'); await st.setKV(name, m.value); } // through the store: its guard, .prev and copies
    }
    if (BA) { try { report.media = await BA.restoreMedia(zipPath, { dryRun }); } catch { /* the zip's own files are what matters */ } }
    // memory
    const memSrc = readJsonSafe(path.join(src, 'memory.json'), null);
    if (memSrc) {
      const memP = path.join(HUB.data, 'memory.json');
      // (round 43, datasafe) your memory there but unreadable: merged later, never replaced by the backup's lines alone
      const memNow = fs.existsSync(memP) ? readJsonSafe(memP, null) : {};
      if (!memNow) throw new Error('Your memory file can\'t be read just now (another program may be holding it). Nothing was changed; try again in a moment.');
      const mem = { shared: '', agents: {}, ...memNow };
      const merge = (mine, theirs) => {
        const have = new Set(String(mine || '').split('\n').map((l) => l.trim()).filter(Boolean));
        const add = String(theirs || '').split('\n').map((l) => l.trim()).filter((l) => l && !have.has(l));
        report.memory.add += add.length;
        return [String(mine || '').trim(), ...add].filter(Boolean).join('\n');
      };
      mem.shared = merge(mem.shared, memSrc.shared);
      for (const [id, text] of Object.entries(memSrc.agents || {})) mem.agents[id] = merge(mem.agents[id], text);
      if (!dryRun && report.memory.add) { const st = require('./store'); await st.saveMemory(mem); } // (round 43) through the store: its copies and .prev
    }
    // attachments
    const attSrc = path.join(src, 'attachments');
    const attDst = path.join(HUB.data, 'attachments');
    if (fs.existsSync(attSrc)) {
      fs.mkdirSync(attDst, { recursive: true });
      for (const n of fs.readdirSync(attSrc)) {
        if (fs.existsSync(path.join(attDst, n)) || !fs.statSync(path.join(attSrc, n)).isFile()) continue;
        report.attachments.add += 1;
        if (!dryRun) fs.copyFileSync(path.join(attSrc, n), path.join(attDst, n));
      }
    }
    // agents in the backup's config that this hub doesn't have
    const cfg = readJsonSafe(path.join(tmp, 'config.json'), null);
    const here = new Set((readJsonSafe(HUB.config, {}).agents || []).map((a) => a.id));
    report.agentsMissing = (cfg?.agents || []).filter((a) => !here.has(a.id)).map((a) => a.name || a.id);
    return report;
  } finally {
    fs.rm(tmp, { recursive: true, force: true }, () => {});
    if (!dryRun) BA?.pin?.(zipPath, false);
  }
}

function registerIpc(ipcMain, getWin) {
  const handle = (name, fn) => ipcMain.handle(name, async (_e, ...args) => fn(...args));
  handle('fs:list', (dir, opts) => (opts?.recursive ? offThread('flist', { dir, opts }, () => list(dir, opts)) : list(dir, opts)));
  handle('fs:read', (file, opts) => read(file, opts));
  handle('fs:write', (file, content, opts) => write(file, content, opts));
  handle('fs:stat', (file) => { try { const s = fs.statSync(assertAbs(file)); return { size: s.size, mtime: s.mtimeMs, isDir: s.isDirectory() }; } catch { return null; } });
  handle('fs:search', (dir, q, opts) => offThread('fsearch', { dir, q, opts }, () => search(dir, q, opts)));
  handle('fs:trash', (paths) => trash(paths));
  handle('fs:zip', (entries, out) => zip(entries, out));
  handle('fs:diff', (fileA, fileB, opts) => diffLines(read(fileA, { maxBytes: 80 * 1048576 }), read(fileB, { maxBytes: 80 * 1048576 }), opts));
  handle('fs:reveal', (p) => shell.showItemInFolder(assertAbs(p)));
  handle('fs:open', (p) => shell.openPath(assertAbs(p)));
  handle('fs:watch', (id, file) => watch(id, file, (p) => { try { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('fs:changed', { id, path: p }); } catch { /* window gone */ } }));
  handle('fs:unwatch', (id) => unwatch(id));
  handle('fs:copy', (from, to) => { fs.mkdirSync(path.dirname(assertAbs(to)), { recursive: true }); ownWrite(to); fs.copyFileSync(assertAbs(from), assertAbs(to)); return true; });
  handle('fs:home', () => os.homedir());
  handle('backup:now', (opts) => backupNow(opts));
  handle('backup:list', () => listBackups());
  handle('backup:dir', () => backupDir());
  handle('backup:pick', async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Restore from a Hearth backup', defaultPath: backupDir(), filters: [{ name: 'Hearth backup', extensions: ['zip'] }], properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('backup:restore', (zipPath, opts) => restoreBackup(zipPath, opts));
  handle('net:text', (url) => fetchText(url));
  // Headless tests (dev/smoke.js) can't answer native dialogs: HEARTH_TEST_SAVE_DIR saves there without asking,
  // HEARTH_TEST_OPEN (paths joined with the path delimiter) is what every open dialog picks.
  const TEST_SAVE = process.env.HEARTH_TEST_SAVE_DIR; const TEST_OPEN = process.env.HEARTH_TEST_OPEN;
  handle('dialog:open', async (opts) => {
    if (TEST_OPEN != null) return TEST_OPEN.split(path.delimiter).filter(Boolean);
    const r = await dialog.showOpenDialog(getWin(), { properties: ['openFile'], ...opts });
    return r.canceled ? [] : r.filePaths;
  });
  // Saves text or base64 content wherever the user picks. Returns the path or null.
  handle('dialog:saveFile', async ({ defaultPath, filters, content, base64 }) => {
    if (TEST_SAVE) { const p = path.join(TEST_SAVE, path.basename(defaultPath || 'file')); write(p, content, { base64 }); return p; }
    const r = await dialog.showSaveDialog(getWin(), { defaultPath, filters });
    if (r.canceled || !r.filePath) return null;
    write(r.filePath, content, { base64 });
    return r.filePath;
  });
  // (round 84, bigchat84) a big file saved in parts (a giant chat's export: tens of MB made a few ms at a time in the
  // window): start asks where (as dialog:saveFile), each part is written as it comes (asynchronously: the main process
  // only hands it to the disk), end flushes it and puts it in place (a temp file renamed: never a half file there)
  const streams = new Map(); let streamSeq = 0;
  handle('dialog:saveStart', async ({ defaultPath, filters } = {}) => {
    let p = null;
    if (TEST_SAVE) p = path.join(TEST_SAVE, path.basename(defaultPath || 'file'));
    else { const r = await dialog.showSaveDialog(getWin(), { defaultPath, filters }); if (r.canceled || !r.filePath) return null; p = r.filePath; }
    p = assertAbs(p); fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.hubtmp`; const fh = await fs.promises.open(tmp, 'w');
    const id = `s${++streamSeq}`;
    const t = setTimeout(() => { const x = streams.get(id); streams.delete(id); x?.fh.close().catch(() => {}).then(() => fs.promises.rm(tmp, { force: true })).catch(() => {}); }, 10 * 60000); t.unref?.();
    streams.set(id, { p, tmp, fh, t, bytes: 0 });
    return { id, path: p };
  });
  handle('dialog:savePart', async (id, bytes) => {
    const x = streams.get(String(id)); if (!x) throw new Error('That save was stopped.');
    const b = bytes instanceof Uint8Array ? bytes : Buffer.from(String(bytes ?? ''), 'utf8');
    await x.fh.write(b); x.bytes += b.length; return x.bytes;
  });
  handle('dialog:saveEnd', async (id, ok = true) => {
    const x = streams.get(String(id)); if (!x) return null;
    streams.delete(String(id)); clearTimeout(x.t);
    try { if (ok) { try { await x.fh.sync(); } catch { /* a disk that can't */ } } } finally { await x.fh.close().catch(() => {}); }
    if (!ok) { await fs.promises.rm(x.tmp, { force: true }).catch(() => {}); return null; }
    ownWrite(x.p); await fs.promises.rename(x.tmp, x.p);
    return x.p;
  });
}

module.exports = { registerIpc, list, read, write, diffLines, zip, backupNow, listBackups, restoreBackup };
