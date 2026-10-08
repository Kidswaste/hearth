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

function list(dir, { recursive = false, depth = 4, match, skipDirs = ['node_modules', '.git'] } = {}) {
  const out = [];
  const re = match ? new RegExp(match, 'i') : null;
  const walk = (d, level) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!re) out.push({ name: e.name, path: full, isDir: true });
        if (recursive && level < depth && !skipDirs.includes(e.name)) walk(full, level + 1);
        continue;
      }
      if (re && !re.test(e.name)) continue;
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      out.push({ name: e.name, path: full, size: st.size, mtime: st.mtimeMs, isDir: false });
    }
  };
  walk(assertAbs(dir), 0);
  return out;
}

function read(file, { maxBytes = 20 * 1024 * 1024, encoding = 'utf8' } = {}) {
  const p = assertAbs(file);
  const { size } = fs.statSync(p);
  if (size > maxBytes) throw new Error(`File is ${Math.round(size / 1048576)} MB, over the ${Math.round(maxBytes / 1048576)} MB limit`);
  if (encoding === 'buffer') return fs.readFileSync(p); // arrives in the renderer as a Uint8Array
  return fs.readFileSync(p, encoding === 'base64' ? 'base64' : 'utf8');
}

function write(file, content, { base64 = false } = {}) {
  const p = assertAbs(file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.hubtmp`;
  const bytes = content instanceof Uint8Array ? content : content instanceof ArrayBuffer ? new Uint8Array(content) : null;
  fs.writeFileSync(tmp, bytes || (base64 ? Buffer.from(content, 'base64') : content));
  fs.renameSync(tmp, p);
  return true;
}

// Full-text search across text files. Returns up to `limit` hits with a snippet each.
function search(dir, query, { match = '\\.(md|txt|json|csv|js|html|jsx)$', limit = 200, maxFileBytes = 2 * 1024 * 1024 } = {}) {
  const q = query.toLowerCase();
  const hits = [];
  for (const f of list(dir, { recursive: true, match })) {
    if (f.size > maxFileBytes) continue;
    let text;
    try { text = fs.readFileSync(f.path, 'utf8'); } catch { continue; }
    const lower = text.toLowerCase();
    let idx = lower.indexOf(q);
    let count = 0;
    const snippets = [];
    while (idx >= 0 && count < 50) {
      count += 1;
      if (snippets.length < 3) {
        const line = text.slice(0, idx).split('\n').length;
        snippets.push({ line, text: text.slice(Math.max(0, idx - 60), idx + q.length + 80).replace(/\s+/g, ' ') });
      }
      idx = lower.indexOf(q, idx + q.length);
    }
    if (count) hits.push({ ...f, count, snippets });
    if (hits.length >= limit) break;
  }
  return hits.sort((a, b) => b.count - a.count);
}

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

async function trash(paths) {
  const done = [];
  const failed = [];
  for (const p of paths) {
    try { await shell.trashItem(assertAbs(p)); done.push(p); } catch (err) { failed.push({ path: p, error: err.message }); }
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
    return new Promise((resolve, reject) => {
      // GNU tar (Linux) can't write zips: use zip there
      const [cmd, args, opts] = process.platform === 'linux' ? ['zip', ['-qr', target, ...fs.readdirSync(tmp)], { cwd: tmp }] : [TAR, ['-a', '-cf', target, '-C', tmp, ...fs.readdirSync(tmp)], { windowsHide: true }];
      execFile(cmd, args, opts, (err) => {
        // the temp copy: Windows (antivirus, indexer) can still hold it for a moment; never crash over it
        try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { setTimeout(() => fs.rm(tmp, { recursive: true, force: true }, () => {}), 5000); }
        if (err) reject(err); else resolve({ path: target, size: fs.statSync(target).size });
      });
    });
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
const HUB = { data: path.join(__dirname, 'data'), config: path.join(__dirname, 'config.json'), theme: path.join(__dirname, 'theme.css') };
const BACKUP_SKIP = ['workspace', 'ae'];
function hubSettings() { try { return JSON.parse(fs.readFileSync(HUB.config, 'utf8')).settings || {}; } catch { return {}; } }
const backupDir = () => hubSettings().backupDir || path.join(os.homedir(), 'Documents', 'Hearth backups');

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
  return new Promise((resolve, reject) => {
    const done = (err) => (err ? reject(err) : resolve(dir));
    // GNU tar (Linux) can't read zips; unzip can
    if (process.platform === 'linux') execFile('unzip', ['-q', '-o', assertAbs(zipPath), '-d', dir], done);
    else execFile(TAR, ['-xf', assertAbs(zipPath), '-C', dir], { windowsHide: true }, done);
  });
}
const readJsonSafe = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const jsonFiles = (dir) => { try { return fs.readdirSync(dir).filter((n) => n.endsWith('.json') && !n.endsWith('.prev.json') && !n.endsWith('.tmp')); } catch { return []; } };

// Compares a backup with the current data and (unless dryRun) merges it in. Nothing of yours is deleted:
//   chats      missing here are added; with newer: true, chats the backup has a newer version of replace yours
//              (yours are kept in data/trash/restored-<date>/ first)
//   tool data  (kv: notes, prompts, sketches…) files missing here are added; different ones are reported, kept
//   memory     lines missing here are added
//   attachments missing files are copied
// config.json and theme.css are never restored automatically (agents in the backup but not here are listed).
async function restoreBackup(zipPath, { dryRun = true, newer = false } = {}) {
  const tmp = await unzipTo(zipPath);
  try {
    const src = fs.existsSync(path.join(tmp, 'data')) ? path.join(tmp, 'data') : tmp;
    if (!fs.existsSync(path.join(src, 'chats')) && !fs.existsSync(path.join(src, 'kv'))) throw new Error("That zip doesn't look like a Hearth backup (no data/chats or data/kv).");
    const report = { dryRun, chats: { add: 0, newer: 0, same: 0, older: 0, replaced: 0 }, kv: { add: 0, differ: [], same: 0 }, memory: { add: 0 }, attachments: { add: 0 }, agentsMissing: [], titles: [] };
    const stamp = new Date().toISOString().slice(0, 10);
    const keepDir = path.join(HUB.data, 'trash', `restored-${stamp}`);
    // chats
    const chatsSrc = path.join(src, 'chats');
    const chatsDst = path.join(HUB.data, 'chats');
    fs.mkdirSync(chatsDst, { recursive: true });
    for (const n of jsonFiles(chatsSrc)) {
      const theirs = readJsonSafe(path.join(chatsSrc, n), null);
      if (!theirs) continue;
      const mineP = path.join(chatsDst, n);
      const mine = fs.existsSync(mineP) ? readJsonSafe(mineP, null) : null;
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
      if (fs.readFileSync(mineP, 'utf8') === fs.readFileSync(path.join(kvSrc, n), 'utf8')) report.kv.same += 1;
      else report.kv.differ.push(n.replace(/\.json$/, ''));
    }
    // memory
    const memSrc = readJsonSafe(path.join(src, 'memory.json'), null);
    if (memSrc) {
      const memP = path.join(HUB.data, 'memory.json');
      const mem = { shared: '', agents: {}, ...readJsonSafe(memP, {}) };
      const merge = (mine, theirs) => {
        const have = new Set(String(mine || '').split('\n').map((l) => l.trim()).filter(Boolean));
        const add = String(theirs || '').split('\n').map((l) => l.trim()).filter((l) => l && !have.has(l));
        report.memory.add += add.length;
        return [String(mine || '').trim(), ...add].filter(Boolean).join('\n');
      };
      mem.shared = merge(mem.shared, memSrc.shared);
      for (const [id, text] of Object.entries(memSrc.agents || {})) mem.agents[id] = merge(mem.agents[id], text);
      if (!dryRun && report.memory.add) fs.writeFileSync(memP, JSON.stringify(mem, null, 2));
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
  }
}

function registerIpc(ipcMain, getWin) {
  const handle = (name, fn) => ipcMain.handle(name, async (_e, ...args) => fn(...args));
  handle('fs:list', (dir, opts) => list(dir, opts));
  handle('fs:read', (file, opts) => read(file, opts));
  handle('fs:write', (file, content, opts) => write(file, content, opts));
  handle('fs:stat', (file) => { try { const s = fs.statSync(assertAbs(file)); return { size: s.size, mtime: s.mtimeMs, isDir: s.isDirectory() }; } catch { return null; } });
  handle('fs:search', (dir, q, opts) => search(dir, q, opts));
  handle('fs:trash', (paths) => trash(paths));
  handle('fs:zip', (entries, out) => zip(entries, out));
  handle('fs:diff', (fileA, fileB, opts) => diffLines(read(fileA, { maxBytes: 80 * 1048576 }), read(fileB, { maxBytes: 80 * 1048576 }), opts));
  handle('fs:reveal', (p) => shell.showItemInFolder(assertAbs(p)));
  handle('fs:open', (p) => shell.openPath(assertAbs(p)));
  handle('fs:watch', (id, file) => watch(id, file, (p) => getWin()?.webContents.send('fs:changed', { id, path: p })));
  handle('fs:unwatch', (id) => unwatch(id));
  handle('fs:copy', (from, to) => { fs.copyFileSync(assertAbs(from), assertAbs(to)); return true; });
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
}

module.exports = { registerIpc, list, read, write, diffLines, zip, backupNow, listBackups, restoreBackup };
