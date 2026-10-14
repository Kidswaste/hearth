// Drag and drop with Finder / Explorer (round 38, dragdrop), the main-process side. Loaded on its first IPC call
// (main.js lazyIpc). Nothing here uploads anything: files stay where they are, only Hearth's own made-up files (a reply's
// code block, a picture that lives only in the window) are written to a small temp folder to be dragged out.
//   dragdrop:out (send)      { path } | { paths } | { name, text } | { name, base64 } → a native drag (webContents.startDrag)
//                            with a proper icon: the picture itself, else the system's icon for that kind of file
//                            (cached per extension), else Hearth's flame
//   dragdrop:check (invoke)  [path] → [{ path, name, exists, isDir, size, cloud }]: folders, missing files and iCloud
//                            placeholders (not downloaded yet) told apart before anything reads them
//   dragdrop:clipboard       files copied in Finder / Explorer (⌘C / Ctrl+C on a file) → [path]
const fs = require('fs');
const os = require('os');
const path = require('path');
const Core = require('./dragdrop-core');

const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const FALLBACK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGP436PxnxLMMGrAqAGjBgwXAwAYNrIfHzn2lAAAAABJRU5ErkJggg==';
const icons = new Map(); // extension → the system's icon (NativeImage), filled after a first drag of that kind
let tempDir = null;
let lastDrag = null; // what the last drag carried (dev checks read it through dragdrop:check { last: true })

function outDir() {
  if (tempDir) return tempDir;
  tempDir = path.join(os.tmpdir(), 'Hearth drag');
  fs.mkdirSync(tempDir, { recursive: true });
  // files from earlier days go (they were only ever there to be dragged somewhere)
  try { for (const n of fs.readdirSync(tempDir)) { const p = path.join(tempDir, n); try { if (Date.now() - fs.statSync(p).mtimeMs > 86400000) fs.rmSync(p, { recursive: true, force: true }); } catch { /* in use */ } } } catch { /* empty */ }
  return tempDir;
}
// a made-up file: its own small folder each time, so the name stays exactly what the owner sees ("snippet.js")
function writeTemp(spec, dir = outDir()) {
  const sub = fs.mkdtempSync(path.join(dir, 'd-'));
  const file = path.join(sub, spec.name);
  if (spec.text != null) fs.writeFileSync(file, spec.text, 'utf8');
  else fs.writeFileSync(file, Buffer.from(spec.base64, 'base64'));
  return file;
}
function iconFor(file, dataDir) {
  const { nativeImage, app } = require('electron');
  const ext = path.extname(file).toLowerCase();
  let icon = null;
  if (IMAGE.test(file)) {
    try { const st = fs.statSync(file); if (st.size < 40 * 1048576) { icon = nativeImage.createFromPath(file); if (!icon.isEmpty()) icon = icon.resize({ width: Math.min(128, icon.getSize().width || 128) }); } } catch { icon = null; }
  }
  if ((!icon || icon.isEmpty()) && icons.has(ext)) icon = icons.get(ext);
  if (!icon || icon.isEmpty()) {
    // the system's icon for this kind of file comes for the next drag (it is asynchronous; a drag can't wait)
    if (!icons.has(ext) && app?.getFileIcon) app.getFileIcon(file, { size: 'normal' }).then((im) => { if (im && !im.isEmpty()) icons.set(ext, im); }).catch(() => {});
    try { icon = nativeImage.createFromPath(path.join(dataDir || '', 'hearth-icon.png')); if (!icon.isEmpty()) icon = icon.resize({ width: 48 }); } catch { icon = null; }
  }
  if (!icon || icon.isEmpty()) icon = nativeImage.createFromDataURL(FALLBACK_PNG);
  return icon;
}
function clipboardFiles() {
  const { clipboard } = require('electron');
  const raw = {};
  const fmts = (() => { try { return clipboard.availableFormats(); } catch { return []; } })();
  const buf = (f) => { try { return clipboard.readBuffer(f); } catch { return null; } };
  if (process.platform === 'darwin') {
    try { raw.fileUrl = clipboard.read('public.file-url'); } catch { /* none */ }
    const pl = buf('NSFilenamesPboardType'); if (pl?.length) raw.plist = pl.toString('utf8');
  } else if (process.platform === 'win32') {
    const w = buf('FileNameW'); if (w?.length) raw.fileNameW = w.toString('utf16le');
  } else {
    try { raw.uriList = clipboard.read('text/uri-list'); } catch { /* none */ }
    if (!raw.uriList && fmts.includes('x-special/gnome-copied-files')) raw.uriList = buf('x-special/gnome-copied-files')?.toString('utf8') || '';
  }
  raw.text = clipboard.readText();
  return Core.parseClipboard(raw, { win: process.platform === 'win32' });
}
async function check(paths) {
  const out = [];
  for (const p0 of (Array.isArray(paths) ? paths : []).slice(0, 200)) {
    let p = Core.toPath(p0, { win: process.platform === 'win32' });
    if (/^~[\\/]/.test(p)) p = path.join(os.homedir(), p.slice(2));
    const name = path.basename(p);
    const r = { path: p, name, exists: false, isDir: false, size: 0, cloud: null };
    try {
      const st = await fs.promises.stat(p);
      Object.assign(r, { exists: true, isDir: st.isDirectory(), size: st.size, cloud: st.isDirectory() ? null : Core.cloudOf({ name, size: st.size, blocks: st.blocks, platform: process.platform }) });
    } catch {
      // a file iCloud hasn't downloaded: ".name.icloud" sits there instead
      try { await fs.promises.access(path.join(path.dirname(p), `.${name}.icloud`)); r.cloud = 'icloud'; } catch { /* simply missing */ }
    }
    out.push(r);
  }
  return out;
}

function register(ipcMain, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  ipcMain.on('dragdrop:out', (e, spec0) => {
    const spec = Core.outSpec(spec0);
    if (!spec) return;
    try {
      let files;
      if (spec.paths) files = spec.paths.filter((p) => fs.existsSync(p));
      else if (spec.path) files = fs.existsSync(spec.path) ? [spec.path] : [];
      else files = [writeTemp(spec)];
      if (!files.length) return;
      lastDrag = { files, at: Date.now() };
      const icon = iconFor(files[0], o.dataDir);
      if (files.length > 1) e.sender.startDrag({ files, file: files[0], icon });
      else e.sender.startDrag({ file: files[0], icon });
    } catch (err) { console.warn('dragdrop:out', err.message); }
  });
  ipcMain.handle('dragdrop:check', (_e, paths) => (paths && paths.last ? lastDrag : check(paths)));
  ipcMain.handle('dragdrop:clipboard', () => { try { return clipboardFiles(); } catch { return []; } });
}

module.exports = { register, _test: { writeTemp, check, outDir } };
