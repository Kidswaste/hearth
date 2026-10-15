// 🛟 Recover lost scenes (round 43, scenesafe), main side: looks everywhere a Lab scene can still be and hands the
// window one list (scenesafe-core.js collect): the scenes file and its .prev copy, the rotating copies
// (data/kv/.history/three-sketches/), History's deleted scenes and layer versions (kv three-history + its copies), the
// time machine (kv three-tm-<scene>), what sync kept aside on this computer (data/sync/trash) and in the cloud folder
// (its copy, its trash, its conflict copies), and the newest backup zips (~/Documents/Hearth backups, or the folder
// set in Settings › Backups). Reads only: nothing here writes or deletes anything. Lazy IPC (main.js lazyIpc):
//   scenes:scan { quick?, current? } → { found: [...], sources: [{ label, n, at }], current, ms }
//     quick: this computer's own copies only (no zips, no cloud folder): the Lab's automatic offer at opening
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const SS = require('./scenesafe-core');

let o = { dataDir: path.join(__dirname, 'data'), configPath: path.join(__dirname, 'config.json'), syncmain: null, backupDir: null };
const kvDir = () => path.join(o.dataDir, 'kv');
const when = (t) => { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
async function readJson(file) {
  try { return JSON.parse(SS.readRetry(fs, file)); } catch { return undefined; }
}
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
async function ls(dir) { try { return await fsp.readdir(dir); } catch { return []; } }
function backupDir() {
  if (o.backupDir) return typeof o.backupDir === 'function' ? o.backupDir() : o.backupDir;
  try { const d = JSON.parse(fs.readFileSync(o.configPath, 'utf8'))?.settings?.backupDir; if (d) return d; } catch { /* default */ }
  return path.join(os.homedir(), 'Documents', 'Hearth backups');
}
// the files of a zip we need, into a temp folder (Windows' own bsdtar, the Mac's tar, unzip on Linux); missing members
// are fine (an old backup without History)
function unzipSome(zip, members) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-scenesafe-'));
  const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  return new Promise((resolve) => {
    const done = () => resolve(dir);
    if (process.platform === 'linux') execFile('unzip', ['-q', '-o', zip, ...members, '-d', dir], { timeout: 30000 }, done);
    else execFile(TAR, ['-xf', zip, '-C', dir, ...members], { timeout: 30000, windowsHide: true }, done);
  });
}

async function scan({ quick = false, current = null } = {}) {
  const t0 = Date.now();
  const sources = []; const thumbs = {};
  const add = (label, kind, list, at) => { if (Array.isArray(list) && list.length) sources.push({ label, kind, list, at: at || 0 }); };
  const addThumbs = (t) => { for (const [id, v] of Object.entries(t && typeof t === 'object' ? t : {})) if (v?.url && !thumbs[id]) thumbs[id] = v; };
  const addHistory = (h, where) => { const r = SS.fromHistory(h); add(`Deleted scenes in History${where}`, 'trash', r.trash); add(`Earlier versions in History${where}`, 'versions', r.versions); };
  const cloudCtx = () => { try { return o.syncmain?.pathCtx?.() || null; } catch { return null; } };
  const fromCloud = (v) => { const ctx = cloudCtx(); try { return ctx ? require('./sync-merge').fromCloud(v, ctx) : v; } catch { return v; } };
  const K = kvDir();
  // what is in your list now (the window's, else the file's)
  let cur = Array.isArray(current) ? current : null;
  const st = SS.readStatus(fs, path.join(K, 'three-sketches.json'));
  if (!cur) cur = st.state === 'ok' && Array.isArray(st.value) ? st.value : [];
  else if (st.state === 'ok' && Array.isArray(st.value)) add('The scenes file', 'scenes', st.value, mtime(path.join(K, 'three-sketches.json')));
  // this computer: the save before, the rotating copies, History, the time machine
  const prevF = path.join(K, 'three-sketches.prev.json');
  add('The save before the last one', 'scenes', await readJson(prevF), mtime(prevF));
  const hdir = path.join(K, '.history', 'three-sketches');
  for (const n of (await ls(hdir)).sort().reverse().slice(0, 40)) {
    const c = SS.parseCopy(n); if (!c) continue;
    add(`Automatic copy, ${when(c.at)}`, 'scenes', await readJson(path.join(hdir, n)), c.at);
  }
  addHistory(await readJson(path.join(K, 'three-history.json')), '');
  addHistory(await readJson(path.join(K, 'three-history.prev.json')), ' (the save before)');
  const hh = path.join(K, '.history', 'three-history');
  for (const n of (await ls(hh)).sort().reverse().slice(0, 12)) { const c = SS.parseCopy(n); if (c) addHistory(await readJson(path.join(hh, n)), ` (copy of ${when(c.at)})`); }
  let TM = null; try { TM = require('./tools/three-history-core'); } catch { /* no time machine */ }
  const tms = [];
  for (const n of (await ls(K)).filter((x) => /^three-tm-[\w-]+\.json$/.test(x) && !/-t\.json$/.test(x)).slice(0, 400)) {
    const id = n.slice(9, -5);
    const s = SS.fromTm(id, await readJson(path.join(K, n)), TM);
    if (s) tms.push(s);
  }
  add('The time machine', 'tm', tms);
  addThumbs(await readJson(path.join(K, 'three-thumbs.json')));
  addThumbs(await readJson(path.join(K, 'three-thumbs.prev.json')));
  // sync on this computer: files it moved aside (the other computer deleted them, or a choice replaced them)
  const strash = path.join(o.dataDir, 'sync', 'trash');
  for (const d of (await ls(strash)).filter((x) => /^\d{4}-\d\d-\d\d$/.test(x)).sort().reverse().slice(0, 30)) {
    for (const n of await ls(path.join(strash, d, 'kv'))) {
      const f = path.join(strash, d, 'kv', n);
      if (/three-sketches(\.prev)?\.json$/.test(n)) add(`Kept aside by sync on ${d}`, 'scenes', await readJson(f), mtime(f));
      else if (/three-history\.json$/.test(n)) addHistory(await readJson(f), ` (kept aside by sync on ${d})`);
    }
  }
  if (!quick) {
    // the cloud folder: its copy, its trash, conflict copies
    let root = null; try { root = o.syncmain?.status?.()?.root || null; } catch { root = null; }
    const cloud = root ? path.join(root, 'Hearth') : null;
    if (cloud && fs.existsSync(cloud)) {
      const cf = path.join(cloud, 'files', 'kv', 'three-sketches.json');
      const cv = await readJson(cf); if (cv) add('The cloud folder\'s copy', 'scenes', fromCloud(cv), mtime(cf));
      const ctrash = path.join(cloud, 'trash');
      for (const d of (await ls(ctrash)).filter((x) => /^\d{4}-\d\d-\d\d$/.test(x)).sort().reverse().slice(0, 30)) {
        for (const n of await ls(path.join(ctrash, d, 'kv'))) if (/three-sketches\.json$/.test(n)) { const f = path.join(ctrash, d, 'kv', n); const v = await readJson(f); if (v) add(`The cloud folder's trash, ${d}`, 'scenes', fromCloud(v), mtime(f)); }
        for (const n of (await ls(path.join(ctrash, d, 'conflicts'))).filter((x) => /^\d{4}-\d\d-\d\d-[0-9a-f]{8}\.json$/.test(x))) {
          const rec = await readJson(path.join(ctrash, d, 'conflicts', n));
          if (rec?.rel === 'kv/three-sketches.json' && rec.copy) { const v = await readJson(path.join(ctrash, d, 'conflicts', rec.copy)); if (v) add(`A sync conflict copy from ${rec.from || 'the other computer'} (${when(rec.at)})`, 'scenes', fromCloud(v), rec.at); }
        }
      }
      const confl = path.join(cloud, '.sync', 'conflicts');
      for (const n of (await ls(confl)).filter((x) => /^\d{4}-\d\d-\d\d-[0-9a-f]{8}\.json$/.test(x))) {
        const rec = await readJson(path.join(confl, n));
        if (rec?.rel === 'kv/three-sketches.json' && rec.copy) { const v = await readJson(path.join(confl, rec.copy)); if (v) add(`A sync conflict copy from ${rec.from || 'the other computer'} (${when(rec.at)})`, 'scenes', fromCloud(v), rec.at); }
      }
    }
    // backups: the newest 8 zips
    const bdir = backupDir();
    const zips = (await ls(bdir)).filter((n) => /\.zip$/i.test(n)).map((n) => ({ n, f: path.join(bdir, n), t: mtime(path.join(bdir, n)) })).sort((a, b) => b.t - a.t).slice(0, 8);
    for (const z of zips) {
      const tmp = await unzipSome(z.f, ['data/kv/three-sketches.json', 'data/kv/three-history.json', 'data/kv/three-thumbs.json']);
      try {
        add(`Backup ${z.n.replace(/^hearth-backup-|\.zip$/g, '')}`, 'scenes', await readJson(path.join(tmp, 'data', 'kv', 'three-sketches.json')), z.t);
        addHistory(await readJson(path.join(tmp, 'data', 'kv', 'three-history.json')), ` (backup ${z.n.replace(/^hearth-backup-|\.zip$/g, '')})`);
        addThumbs(await readJson(path.join(tmp, 'data', 'kv', 'three-thumbs.json')));
      } finally { fs.rm(tmp, { recursive: true, force: true }, () => {}); }
    }
  }
  const found = SS.collect(cur, sources, thumbs);
  return { found, sources: sources.map((s) => ({ label: s.label, kind: s.kind, n: s.list.length, at: s.at })), current: cur.length, file: st.state, ms: Date.now() - t0, quick: Boolean(quick) };
}

function register(ipcMain, opts = {}) {
  o = { ...o, ...opts };
  ipcMain.handle('scenes:scan', async (_e, a) => { try { return await scan(a || {}); } catch (err) { return { error: err.message, found: [], sources: [] }; } });
}

module.exports = { register, scan, _set: (patch) => { o = { ...o, ...patch }; } };
