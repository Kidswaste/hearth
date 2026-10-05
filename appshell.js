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
const ICON_PNG = path.join(DATA_DIR, 'hearth-icon.png');
const ICON_ICO = path.join(DATA_DIR, 'hearth-icon.ico');

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
// Hearth's icon: a flame in the Forgeheart rarity colors (gold → orange → red, a white-hot core) on dark
// steel, a thin rainbow rim, and three embers for the agents. Drawn at any size, anti-aliased.
const APP_NAME = 'Hearth';
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mixc = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
function hsl2rgb(h) {
  const f = (n) => { const k = (n + h * 12) % 12; return 0.5 - 0.45 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
// Signed distance (in px, + inside) to a flame shape whose base sits at (cx, yb) and tip at yt.
function flameDist(x, y, cx, yb, yt, R, sway) {
  const n = (yb - y) / (yb - yt); // 0 at the base, 1 at the tip
  const bulb = 0.24; // the round bottom, as a fraction of the height
  if (n < -bulb || n > 1) return -1e3;
  const k = clamp01(n);
  // a teardrop: a round bulb below the base, then narrowing to the tip
  const hw = R * (n < 0 ? Math.sqrt(Math.max(0, 1 - (n / bulb) ** 2)) : Math.pow(1 - k, 1.25) * (1 + 0.35 * Math.sin(k * Math.PI)));
  const c = cx + sway * Math.sin(k * Math.PI) * k;
  return hw - Math.abs(x - c);
}
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 256;
  const gold = [255, 215, 94]; const orange = [255, 140, 66]; const red = [255, 92, 92]; const core = [255, 247, 220];
  const steelA = [26, 31, 35]; const steelB = [10, 13, 15];
  const embers = [[94, 222, [72, 221, 255]], [128, 228, [189, 139, 255]], [162, 222, [124, 217, 146]]];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const X = (x + 0.5) / s; const Y = (y + 0.5) / s; // in 256-space
      // rounded square
      const r = 58;
      const dx = Math.max(r - X, 0, X - (256 - r)); const dy = Math.max(r - Y, 0, Y - (256 - r));
      const edge = r - Math.hypot(dx, dy); // + inside, in 256-space
      const cover = clamp01(edge * s + 0.5);
      if (!cover) continue;
      let col = mixc(steelA, steelB, clamp01((X + Y) / 512 + 0.15));
      // soft warm glow behind the flame
      const glow = clamp01(1 - Math.hypot(X - 128, Y - 150) / 120);
      col = mixc(col, [70, 38, 22], glow * glow * 0.9);
      // rainbow rim
      const rim = clamp01(1 - Math.abs(edge - 5) / 2.6);
      if (rim) col = mixc(col, hsl2rgb((Math.atan2(Y - 128, X - 128) / (Math.PI * 2) + 1.08) % 1), rim * 0.85);
      // outer flame (gold at the tip → orange → red at the base)
      const f1 = flameDist(X, Y, 128, 168, 30, 50, -16);
      const a1 = clamp01(f1 * s + 0.5);
      if (a1) {
        const n = clamp01((200 - Y) / 170);
        const fc = n > 0.55 ? mixc(orange, gold, (n - 0.55) / 0.45) : mixc(red, orange, n / 0.55);
        col = mixc(col, fc, a1);
      }
      // inner flame (white-hot core)
      const f2 = flameDist(X, Y, 126, 172, 92, 24, 8);
      const a2 = clamp01(f2 * s + 0.5);
      if (a2) col = mixc(col, mixc(gold, core, clamp01((190 - Y) / 70)), a2);
      // embers: the agents around the fire
      for (const [ex, ey, ec] of embers) {
        const d = Math.hypot(X - ex, Y - ey);
        const ea = clamp01((8 - d) * s + 0.5);
        if (ea) col = mixc(col, ec, ea);
      }
      px[i] = Math.round(col[0]); px[i + 1] = Math.round(col[1]); px[i + 2] = Math.round(col[2]); px[i + 3] = Math.round(255 * cover);
    }
  }
  return pngFromRgba(px, size);
}
// Writes the PNG and a multi-size .ico (16–256 px) so the taskbar, desktop and window all get a sharp icon.
function writeIconFiles() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map((z) => drawIcon(z));
  fs.writeFileSync(ICON_PNG, pngs[pngs.length - 1]);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((z, k) => {
    const o = k * 16;
    dir[o] = z >= 256 ? 0 : z; dir[o + 1] = z >= 256 ? 0 : z; dir[o + 2] = 0; dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(pngs[k].length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += pngs[k].length;
  });
  fs.writeFileSync(ICON_ICO, Buffer.concat([header, dir, ...pngs]));
}
function ensureIcon() {
  if (!fs.existsSync(ICON_PNG) || !fs.existsSync(ICON_ICO)) writeIconFiles();
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
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show ${APP_NAME}`, click: () => { win.show(); win.focus(); } },
    { label: 'New chat with Claude', click: () => { win.show(); win.focus(); actions.send('tray:new-chat'); } },
    { label: 'Command palette', click: () => { win.show(); win.focus(); actions.send('tray:palette'); } },
    { type: 'separator' },
    { label: 'Restart', click: () => restartApp() },
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

// ---------- restart ----------
// Closes cleanly (the window saves its state first) and starts again with the same arguments.
function restartApp() {
  quitting = true;
  app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--restart' && !a.startsWith('--remote-debugging')) });
  app.quit();
}

// ---------- Start menu / desktop shortcuts ----------
// "Hearth" starts the app, or restarts it when it's already running (the --restart argument reaches the
// running copy through the single-instance lock).
function createShortcuts() {
  const target = process.execPath;
  const appDir = app.getAppPath();
  const places = [
    path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${APP_NAME}.lnk`),
    path.join(os.homedir(), 'Desktop', `${APP_NAME}.lnk`),
  ];
  const ps = places.map((p) => `$s=$w.CreateShortcut('${p.replace(/'/g, "''")}');$s.TargetPath='${target.replace(/'/g, "''")}';$s.Arguments='"${appDir}" --restart';$s.WorkingDirectory='${appDir.replace(/'/g, "''")}';$s.IconLocation='${ICON_ICO.replace(/'/g, "''")},0';$s.Description='Start ${APP_NAME} (or restart it if it is already open)';$s.Save()`).join(';');
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
  createShortcuts, restartApp, writeIconFiles, APP_NAME, ICON_ICO_PATH: ICON_ICO, attachContextMenu, setupDownloads, toggleWindow, ICON_ICO,
  markQuitting: () => { quitting = true; },
};
