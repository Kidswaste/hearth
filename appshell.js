// Desktop integration: window memory, tray, global hotkey, app icon, shortcuts, startup,
// right-click menus with spellcheck, downloads, notifications plumbing.
const { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, session, shell } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { DATA_DIR } = require('./store');

const WINDOW_STATE = path.join(DATA_DIR, 'window.json');
const ICON_PNG = path.join(DATA_DIR, 'icon.png');
const ICON_ICO = path.join(DATA_DIR, 'icon.ico');

// ---------- app icon (drawn in code so the hub needs no image assets) ----------
function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n += 1) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngFromRgba(rgba, size) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// A rounded violet tile with a ring of four agent dots around a center hub.
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 256;
  const dots = [[128, 64], [192, 128], [128, 192], [64, 128]].map(([x, y]) => [x * s, y * s, 24 * s]);
  const colors = [[217, 119, 87], [16, 163, 127], [79, 140, 255], [139, 123, 255]];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      // rounded square coverage (radius 56)
      const r = 56 * s;
      const dx = Math.max(r - x - 0.5, 0, x + 0.5 - (size - r));
      const dy = Math.max(r - y - 0.5, 0, y + 0.5 - (size - r));
      const cover = Math.min(1, Math.max(0, r - Math.hypot(dx, dy) + 0.5));
      if (!cover) continue;
      const t = (x + y) / (2 * size);
      let col = [Math.round(40 + 40 * t), Math.round(32 + 10 * t), Math.round(78 + 60 * t)];
      // hub ring
      const dc = Math.hypot(x + 0.5 - 128 * s, y + 0.5 - 128 * s);
      const ring = Math.min(1, Math.max(0, 1 - Math.abs(dc - 64 * s) / (6 * s)));
      col = col.map((c) => Math.round(c + (200 - c) * ring * 0.55));
      const hub = Math.min(1, Math.max(0, 30 * s - dc + 0.5));
      col = col.map((c) => Math.round(c + (245 - c) * hub));
      dots.forEach(([cx, cy, cr], k) => {
        const a = Math.min(1, Math.max(0, cr - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5));
        col = col.map((c, j) => Math.round(c + (colors[k][j] - c) * a));
      });
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = Math.round(255 * cover);
    }
  }
  return pngFromRgba(px, size);
}
function ensureIcon() {
  if (!fs.existsSync(ICON_PNG) || !fs.existsSync(ICON_ICO)) {
    const png = drawIcon(256);
    fs.writeFileSync(ICON_PNG, png);
    // An .ico file may simply wrap a PNG image.
    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
    header[6] = 0; header[7] = 0; header[8] = 0; header[9] = 0;
    header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
    fs.writeFileSync(ICON_ICO, Buffer.concat([header, png]));
  }
  return nativeImage.createFromPath(ICON_PNG);
}

// ---------- window memory ----------
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(WINDOW_STATE, 'utf8')); } catch { return { width: 1480, height: 940 }; }
}
function trackWindowState(win) {
  const save = () => {
    if (win.isDestroyed()) return;
    const state = { ...(win.isMaximized() ? loadWindowState() : win.getBounds()), maximized: win.isMaximized() };
    try { fs.writeFileSync(WINDOW_STATE, JSON.stringify(state)); } catch { /* not critical */ }
  };
  let timer;
  const later = () => { clearTimeout(timer); timer = setTimeout(save, 500); };
  win.on('resize', later);
  win.on('move', later);
  win.on('close', save);
}

// ---------- tray, hotkey, startup ----------
let tray = null;
let quitting = false;
function toggleWindow(win) {
  if (win.isVisible() && win.isFocused()) win.hide();
  else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}
function setupTray(win, icon, actions) {
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Agent Hub');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Agent Hub', click: () => { win.show(); win.focus(); } },
    { label: 'New chat with Claude', click: () => { win.show(); win.focus(); actions.send('tray:new-chat'); } },
    { label: 'Command palette', click: () => { win.show(); win.focus(); actions.send('tray:palette'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => toggleWindow(win));
}
function applySettings(win, settings = {}) {
  globalShortcut.unregisterAll();
  const hotkey = settings.hotkey ?? 'Control+Alt+H';
  let hotkeyOk = true;
  if (hotkey) {
    try { hotkeyOk = globalShortcut.register(hotkey, () => toggleWindow(win)); } catch { hotkeyOk = false; }
  }
  app.setLoginItemSettings({ openAtLogin: Boolean(settings.launchAtStartup), args: [app.getAppPath()] });
  session.defaultSession.setSpellCheckerLanguages(settings.spellLanguages?.length ? settings.spellLanguages : ['en-US']);
  return { hotkeyOk };
}
function setupCloseToTray(win, getSettings) {
  win.on('close', (e) => {
    if (!quitting && getSettings().closeToTray) { e.preventDefault(); win.hide(); }
  });
  app.on('before-quit', () => { quitting = true; });
}

// ---------- Start menu / desktop shortcuts ----------
function createShortcuts() {
  const target = process.execPath;
  const appDir = app.getAppPath();
  const places = [
    path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Agent Hub.lnk'),
    path.join(os.homedir(), 'Desktop', 'Agent Hub.lnk'),
  ];
  const ps = places.map((p) => `$s=$w.CreateShortcut('${p.replace(/'/g, "''")}');$s.TargetPath='${target.replace(/'/g, "''")}';$s.Arguments='"${appDir}"';$s.WorkingDirectory='${appDir.replace(/'/g, "''")}';$s.IconLocation='${ICON_ICO.replace(/'/g, "''")}';$s.Description='Agent Hub';$s.Save()`).join(';');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', `$w=New-Object -ComObject WScript.Shell;${ps}`], { windowsHide: true }, (err) => {
      resolve(err ? { error: err.message } : { created: places });
    });
  });
}

// ---------- right-click menus ----------
function attachContextMenu(contents, send) {
  contents.on('context-menu', (_e, p) => {
    const items = [];
    if (p.misspelledWord) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => contents.replaceMisspelling(s) });
      items.push({ label: 'Add to dictionary', click: () => contents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (p.selectionText) items.push({ role: 'copy' });
    const sel = p.selectionText?.trim();
    if (sel) {
      items.push({ type: 'separator' });
      items.push({ label: 'Ask Claude about this', click: () => send('context:ask', sel) });
      items.push({ label: 'Save to notes', click: () => send('context:note', sel) });
      items.push({ label: `Search the web for “${sel.slice(0, 30)}${sel.length > 30 ? '…' : ''}”`, click: () => shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(sel)}`) });
    }
    if (p.linkURL && /^https?:/.test(p.linkURL)) {
      items.push({ type: 'separator' }, { label: 'Open link in browser', click: () => shell.openExternal(p.linkURL) });
      items.push({ label: 'Copy link', click: () => require('electron').clipboard.writeText(p.linkURL) });
    }
    if (p.mediaType === 'image' && p.srcURL) items.push({ type: 'separator' }, { label: 'Copy image', click: () => contents.copyImageAt(p.x, p.y) });
    if (!items.length) return;
    Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents.hostWebContents || contents) || undefined });
  });
}

// ---------- downloads from website agents ----------
function setupDownloads(send) {
  const hook = (ses) => {
    ses.on('will-download', (_e, item) => {
      const dir = app.getPath('downloads');
      const parsed = path.parse(item.getFilename());
      let target = path.join(dir, parsed.base);
      for (let n = 1; fs.existsSync(target); n += 1) target = path.join(dir, `${parsed.name} (${n})${parsed.ext}`);
      item.setSavePath(target);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const report = (state) => send('download:update', {
        id, name: path.basename(target), path: target, state,
        received: item.getReceivedBytes(), total: item.getTotalBytes(), url: item.getURL(),
      });
      report('progressing');
      item.on('updated', (_ev, state) => report(state));
      item.once('done', (_ev, state) => report(state));
    });
  };
  hook(session.defaultSession);
  app.on('session-created', hook);
}

module.exports = {
  ensureIcon, loadWindowState, trackWindowState, setupTray, applySettings, setupCloseToTray,
  createShortcuts, attachContextMenu, setupDownloads, toggleWindow, ICON_ICO,
  markQuitting: () => { quitting = true; },
};
