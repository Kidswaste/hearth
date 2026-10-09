// Mood board, main-process side (board.js is the page): copies dropped files into Hearth's data folder (originals
// are never touched), saves pictures the page makes (thumbnails, posters, frame grabs, exports) and takes a live
// snapshot of a website in an offscreen window (title, favicon, colors, fonts, a picture). Required from main.js
// with one line: require('./boardmain').registerIpc(ipcMain, () => win).
const fs = require('fs');
const path = require('path');
const { BrowserWindow, session } = require('electron');
const { DATA_DIR } = require('./store');

const BOARD_DIR = path.join(DATA_DIR, 'board');
const MEDIA_DIR = path.join(BOARD_DIR, 'media');
const EXPORT_DIR = path.join(BOARD_DIR, 'exports');
const MAX_IMPORT = 2 * 1024 * 1024 * 1024; // 2 GB: a long reference clip is fine, a disk image isn't
const safeName = (name) => String(name || 'file').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').slice(-80) || 'file';
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
// Windows and macOS paths compare without case (C:\Users vs c:\users, a file dropped from Finder)
const norm = (p) => (process.platform === 'linux' ? path.resolve(p) : path.resolve(p).toLowerCase());
const inMedia = (p) => norm(p).startsWith(norm(MEDIA_DIR) + path.sep);

function ensureDirs() { for (const d of [MEDIA_DIR, EXPORT_DIR]) fs.mkdirSync(d, { recursive: true }); }

// A copy of a file the owner dropped (a file already in the board's folder is reused, not copied twice).
function importFile(src) {
  ensureDirs();
  const from = path.resolve(String(src || ''));
  const st = fs.statSync(from);
  if (!st.isFile()) throw new Error('Not a file');
  if (st.size > MAX_IMPORT) throw new Error('That file is over 2 GB');
  if (inMedia(from)) return { path: from, size: st.size, name: path.basename(from) };
  const file = path.join(MEDIA_DIR, `${stamp()}-${safeName(path.basename(from))}`);
  fs.copyFileSync(from, file);
  return { path: file, size: st.size, name: path.basename(from) };
}

// Pictures the page makes (base64), named after what they are: "thumb-ab12.jpg", "grab-…png", exports.
function saveData(name, base64, { exportDir = false } = {}) {
  ensureDirs();
  const file = path.join(exportDir ? EXPORT_DIR : MEDIA_DIR, `${stamp()}-${safeName(name)}`);
  fs.writeFileSync(file, Buffer.from(String(base64 || ''), 'base64'));
  return file;
}

// A picture / clip dragged in from a web page: download it into the board's folder (fails cleanly offline).
async function fetchMedia(url) {
  ensureDirs();
  const u = new URL(String(url));
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only web addresses can be downloaded');
  const res = await session.fromPartition('board-snap').fetch(u.href, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`The site answered ${res.status}`);
  const type = res.headers.get('content-type') || '';
  // too big: refused before downloading it into memory (when the site says its size)
  if (Number(res.headers.get('content-length')) > 300 * 1048576) throw new Error('Over 300 MB');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 300 * 1048576) throw new Error('Over 300 MB');
  // the type the site sent wins over the address's extension (image.php?id=3, /photo.aspx, /media/1234)
  const fromType = /png/.test(type) ? '.png' : /gif/.test(type) ? '.gif' : /webp/.test(type) ? '.webp' : /avif/.test(type) ? '.avif' : /svg/.test(type) ? '.svg' : /mp4/.test(type) ? '.mp4' : /webm/.test(type) ? '.webm' : /quicktime/.test(type) ? '.mov' : /jpe?g/.test(type) ? '.jpg' : '';
  const urlExt = path.extname(u.pathname).toLowerCase();
  const ext = /^\.(png|jpe?g|gif|webp|avif|svg|bmp|mp4|webm|mov|m4v|mkv)$/.test(urlExt) ? urlExt : fromType || urlExt;
  const file = path.join(MEDIA_DIR, `${stamp()}-${safeName(path.basename(u.pathname, path.extname(u.pathname)) || u.hostname)}${ext}`);
  fs.writeFileSync(file, buf);
  return { path: file, size: buf.length, type };
}

// What a page looks like: an offscreen window loads it, waits for it to settle, reads its title, favicon, theme
// color, main fonts and the colors it actually uses, and captures a picture. Nothing from the page reaches Hearth's
// window; popups, downloads and permissions are refused. data: and file: pages work too (tests, saved pages).
let snapping = Promise.resolve();
function snapshot(url, { width = 1280, height = 800, wait = 900, timeout = 15000 } = {}) {
  const run = () => snapOnce(url, { width, height, wait, timeout });
  const p = snapping.then(run, run); // one page at a time: cheap on a laptop, and favicons don't cross
  snapping = p.catch(() => {});
  return p;
}
async function snapOnce(url, { width, height, wait, timeout }) {
  let u;
  try { u = new URL(String(url)); } catch { return { ok: false, error: 'Not a web address' }; }
  if (!/^(https?|file|data):$/.test(u.protocol)) return { ok: false, error: 'Only http, https, file and data pages' };
  ensureDirs();
  const ses = session.fromPartition('board-snap');
  if (!ses.__boardReady) { // once per run: no permissions, no downloads
    ses.__boardReady = true;
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ses.on('will-download', (e) => e.preventDefault());
  }
  const w = new BrowserWindow({
    show: false, width, height, useContentSize: true, enableLargerThanScreen: true, // tall / wide snapshots aren't clipped to the screen
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'board-snap', backgroundThrottling: false, autoplayPolicy: 'document-user-activation-required', spellcheck: false },
  });
  const wc = w.webContents;
  wc.setAudioMuted(true);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  try { wc.setFrameRate(8); } catch { /* older Electron */ }
  try { w.setContentSize(width, height); } catch { /* clamped by the system */ }
  let favicon = null;
  let lastPaint = null;
  wc.on('page-favicon-updated', (_e, icons) => { favicon = icons?.[0] || favicon; });
  wc.on('paint', (_e, _dirty, image) => { lastPaint = image; });
  const done = () => { try { if (!w.isDestroyed()) w.destroy(); } catch { /* gone */ } };
  try {
    const loaded = new Promise((resolve, reject) => {
      wc.once('did-finish-load', resolve);
      wc.once('did-fail-load', (_e, code, desc, _url, main) => { if (main !== false && code !== -3) reject(new Error(desc || `load failed (${code})`)); });
    });
    const timer = new Promise((_r, reject) => setTimeout(() => reject(new Error('The page took too long')), timeout));
    wc.loadURL(u.href).catch(() => { /* reported through did-fail-load */ });
    await Promise.race([loaded, timer]);
    await new Promise((r) => setTimeout(r, wait));
    const info = await Promise.race([wc.executeJavaScript(`(() => {
      const meta = (n) => document.querySelector('meta[name="' + n + '"], meta[property="' + n + '"]')?.content || '';
      const font = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim() : ''; };
      const weight = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontWeight : ''; };
      const bg = getComputedStyle(document.body || document.documentElement).backgroundColor;
      const icon = document.querySelector('link[rel~="icon"]')?.href || '';
      return { title: document.title, description: meta('description') || meta('og:description'), themeColor: meta('theme-color'), ogImage: meta('og:image'),
        headingFont: font('h1, h2, header, .title'), bodyFont: font('p, article, main, body'), headingWeight: weight('h1, h2'), background: bg, icon,
        words: (document.body?.innerText || '').split(/\\s+/).length };
    })()`, true), new Promise((r) => setTimeout(() => r({}), 3000))]).catch(() => ({}));
    let img = await Promise.race([wc.capturePage().catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
    if (!img || img.isEmpty()) img = lastPaint;
    let shot = null;
    if (img && !img.isEmpty()) {
      const size = img.getSize();
      const scaled = size.width > 1280 ? img.resize({ width: 1280, quality: 'good' }) : img;
      shot = path.join(MEDIA_DIR, `${stamp()}-site-${safeName(u.hostname || 'page')}.jpg`);
      fs.writeFileSync(shot, scaled.toJPEG(84));
    }
    return { ok: true, url: u.href, title: info.title || wc.getTitle() || u.hostname, favicon: favicon || info.icon || null, description: (info.description || '').slice(0, 300), themeColor: info.themeColor || null, ogImage: info.ogImage || null,
      fonts: { heading: info.headingFont || null, body: info.bodyFont || null, headingWeight: info.headingWeight || null }, background: info.background || null, words: info.words || 0, shot };
  } catch (err) {
    return { ok: false, error: err.message, url: u.href };
  } finally { done(); }
}

// Removes media no board uses any more (to the trash folder logic of the page: it passes the paths still in use).
function unused(keep) {
  ensureDirs();
  const used = new Set((keep || []).map((p) => norm(p)));
  return fs.readdirSync(MEDIA_DIR).map((n) => path.join(MEDIA_DIR, n)).filter((p) => !used.has(norm(p)));
}

function registerIpc(ipcMain) {
  ensureDirs();
  ipcMain.handle('board:dir', () => ({ dir: BOARD_DIR, media: MEDIA_DIR, exports: EXPORT_DIR }));
  ipcMain.handle('board:import', (_e, src) => { try { return { ok: true, ...importFile(src) }; } catch (err) { return { ok: false, error: err.message }; } });
  ipcMain.handle('board:save', (_e, name, base64, opts) => saveData(name, base64, opts || {}));
  ipcMain.handle('board:fetch', async (_e, url) => { try { return { ok: true, ...(await fetchMedia(url)) }; } catch (err) { return { ok: false, error: err.message }; } });
  ipcMain.handle('board:snap', (_e, url, opts) => snapshot(url, opts || {}));
  ipcMain.handle('board:unused', (_e, keep) => unused(keep));
}

module.exports = { registerIpc, importFile, saveData, snapshot, BOARD_DIR, MEDIA_DIR, EXPORT_DIR };
