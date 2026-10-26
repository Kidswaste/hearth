// (round 69, photos69) Photos in My Paris, main side (loaded on first use through main.js lazyIpc):
//   parisphotos:put    write one resized copy (the window made it: a JPEG with no GPS unless the owner keeps it) into
//                      <data>/paris-photos/<YYYY-MM>/ — only names of that shape, atomically
//   parisphotos:dir    where those copies live (the window shows them as file: URLs)
//   parisphotos:trash  copies Hearth made → the computer's Trash (never anything else; originals are never touched)
//   parisphotos:heic   a HEIC / HEIF photo → JPEG bytes, on this computer: macOS's own `sips`, else Electron's image
//                      reader, else (Windows) the system's HEIF codec through PowerShell; a plain "why not" when none can
//   parisphotos:scan   a folder (a phone import): its photos (≤ 3,000, 4 folders deep) with the EXIF read from each
//                      file's first bytes (when, where, which way up). Only reads.
// Nothing is uploaded or fetched. The owner's original photos are only ever read.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const K = require('./tools/parisphotos-core');
const CS = require('./crashsafe-core');

const MAX_SCAN = 3000, DEPTH = 4;
const SKIP = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information', '.Trashes', '.Spotlight-V100', '.thumbnails']);

function create({ dataDir, nativeImage = null, platform = process.platform }) {
  const root = typeof dataDir === 'string' ? path.join(dataDir, 'paris-photos') : ''; // (dev/boot-test.js registers with no data folder)
  const abs = (rel) => { if (!K.REL.test(String(rel))) throw Error('Not one of Hearth\'s photo copies.'); return path.join(dataDir, ...rel.split('/')); };
  async function put(rel, bytes) {
    const file = abs(rel), b = Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []));
    if (K.kindOf(b) !== 'jpeg' || b.length > K.MAX_BYTES) throw Error('That copy isn\'t a JPEG Hearth made.');
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await CS.writeAtomic(fsp, file, b);
    return file;
  }
  async function trash(rels, trashItem, trashCheck = (p) => ({ ok: true, path: p })) {
    const done = [], failed = [];
    for (const rel of rels || []) {
      let file; try { file = abs(rel); } catch (err) { failed.push({ rel, error: err.message }); continue; }
      if (!fs.existsSync(file)) { done.push(rel); continue; }
      // (winmac) a data folder on a network share / USB stick has no Trash: the copy stays, said why (never deleted for good)
      const check = trashCheck(file); if (!check.ok) { failed.push({ rel, error: check.error }); continue; }
      try { await trashItem(check.path); done.push(rel); } catch (err) { failed.push({ rel, error: err.message }); }
    }
    return { done, failed };
  }
  const run = (cmd, args, opts = {}) => new Promise((ok) => execFile(cmd, args, { timeout: 45000, windowsHide: true, ...opts }, (err, stdout, stderr) => ok({ err, stdout, stderr })));
  async function heic(bytes) {
    const b = Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []));
    if (K.kindOf(b) !== 'heic') return { ok: false, why: 'That file isn\'t a HEIC photo.' };
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hearth-heic-')), src = path.join(tmp, 'in.heic'), out = path.join(tmp, 'out.jpg');
    try {
      await fsp.writeFile(src, b);
      if (platform === 'darwin') { // macOS reads HEIC itself; sips keeps the date and which way up
        await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', src, '--out', out]);
        if (fs.existsSync(out)) return { ok: true, bytes: await fsp.readFile(out), via: 'sips' };
      }
      if (nativeImage) {
        try { const img = nativeImage.createFromPath(src); if (img && !img.isEmpty()) return { ok: true, bytes: img.toJPEG(92), via: 'electron' }; } catch { /* not on this computer */ }
      }
      if (platform === 'win32') { // the system's HEIF codec (Microsoft's free "HEIF Image Extensions"), through WPF
        const ps = 'Add-Type -AssemblyName PresentationCore; $s=[IO.File]::OpenRead($env:HEARTH_HEIC_IN); try { $d=[Windows.Media.Imaging.BitmapDecoder]::Create($s,[Windows.Media.Imaging.BitmapCreateOptions]::None,[Windows.Media.Imaging.BitmapCacheOption]::OnLoad); $e=New-Object Windows.Media.Imaging.JpegBitmapEncoder; $e.QualityLevel=92; $e.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($d.Frames[0])); $o=[IO.File]::Create($env:HEARTH_HEIC_OUT); $e.Save($o); $o.Close() } finally { $s.Close() }';
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { env: { ...process.env, HEARTH_HEIC_IN: src, HEARTH_HEIC_OUT: out } });
        if (fs.existsSync(out) && fs.statSync(out).size > 0) return { ok: true, bytes: await fsp.readFile(out), via: 'windows', rotate: true };
        return { ok: false, why: 'Windows can\'t open HEIC photos yet. Install Microsoft\'s free "HEIF Image Extensions" from the Microsoft Store, or set your iPhone to Settings › Camera › Formats › Most Compatible (JPEG), then add them again.' };
      }
      return { ok: false, why: 'This computer can\'t open HEIC photos. Export them as JPEG (Photos › Export, or your phone\'s "Most Compatible" setting) and add them again.' };
    } catch (err) {
      return { ok: false, why: `That HEIC photo couldn't be converted (${err.message}).` };
    } finally { fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
  }
  async function head(file, size, kind) {
    const want = Math.min(size, kind === 'heic' ? 1048576 : 262144), fh = await fsp.open(file, 'r');
    try { const buf = Buffer.alloc(want); const { bytesRead } = await fh.read(buf, 0, want, 0); return buf.subarray(0, bytesRead); } finally { await fh.close(); }
  }
  async function scan(dir) {
    if (!dir || !path.isAbsolute(dir)) throw Error('Choose a folder on this computer.');
    const st = await fsp.stat(dir).catch(() => null); if (!st?.isDirectory()) throw Error('That folder can\'t be opened.');
    const found = []; let more = false;
    const walk = async (d, depth) => {
      let list; try { list = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
      for (const e of list) {
        if (found.length >= MAX_SCAN) { more = true; return; }
        if (e.name.startsWith('.') || e.name.startsWith('._')) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (depth < DEPTH && !SKIP.has(e.name)) await walk(p, depth + 1); continue; }
        if (e.isFile() && K.isPhotoName(e.name)) found.push(p);
      }
    };
    await walk(dir, 0);
    const out = []; let i = 0;
    const worker = async () => {
      while (i < found.length) {
        const p = found[i++];
        try {
          const s = await fsp.stat(p); if (s.size > K.MAX_BYTES || s.size < 64) continue;
          const b = await head(p, s.size, /\.hei[cf]$/i.test(p) ? 'heic' : ''), x = K.readExif(b);
          if (!x) continue;
          out.push({ path: p, name: path.basename(p), size: s.size, mtime: s.mtimeMs, kind: x.kind, exif: { date: x.date, offset: x.offset, gps: x.gps, gpsTime: x.gpsTime, orientation: x.orientation } });
        } catch { /* unreadable: left out */ }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return { dir, photos: out.sort((a, b) => a.path.localeCompare(b.path)), more };
  }
  return { root, abs, put, trash, heic, scan };
}

function register(ipcMain, { dataDir }) {
  let electron = null; try { electron = require('electron'); } catch { /* node (dev/boot-test.js): no Electron */ }
  const api = create({ dataDir, nativeImage: electron?.nativeImage || null });
  const binCheck = (p) => (process.platform === 'darwin' ? require('./macpolish').trashCheck(p) : require('./winpolish').trashCheck(p));
  const wrap = (fn) => async (_e, ...a) => { try { return { ok: true, ...(await fn(...a)) }; } catch (err) { return { ok: false, error: err.message }; } };
  ipcMain.handle('parisphotos:put', wrap(async (rel, bytes) => ({ file: await api.put(rel, bytes) })));
  ipcMain.handle('parisphotos:dir', wrap(async () => ({ dir: dataDir, root: api.root })));
  ipcMain.handle('parisphotos:trash', wrap(async (rels) => api.trash(rels, (f) => electron.shell.trashItem(f), binCheck))); // binCheck: the trashCheck before trashItem
  ipcMain.handle('parisphotos:heic', async (_e, bytes) => { try { return await api.heic(bytes); } catch (err) { return { ok: false, why: err.message }; } });
  ipcMain.handle('parisphotos:scan', wrap(async (dir) => api.scan(dir)));
}
module.exports = { create, register };
