const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const engines = require('./engines');
const importer = require('./importer');
const appshell = require('./appshell');
const fsapi = require('./fsapi');
const portable = require('./portable');
const aemain = require('./aemain');
const gamebridge = require('./gamebridge');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const THEME_PATH = path.join(__dirname, 'theme.css');

// Present as plain Chrome so sign-in pages (Google, etc.) don't reject the app.
app.userAgentFallback =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
if (process.platform === 'win32') app.setAppUserModelId('Hearth');

// Sign-in popups stay inside the app so the login lands in the right agent.
const AUTH_HOSTS = [
  'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com',
  'login.live.com', 'auth.openai.com', 'auth0.openai.com', 'github.com', 'miro.com', 'slack.com',
];
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'clipboard-read', 'notifications', 'media', 'fullscreen', 'midi', 'midiSysex']);
// Ctrl+<key> combos the hub handles even while a website has focus.
const HUB_KEYS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'g', 'r', ',', 'b', 'n', '\\', 'k', 'f', '/', '=', '+', '-', '0', 'tab', 'j']);

let win;

// A second launch just brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    // The desktop "Hearth" shortcut passes --restart: restart cleanly instead of just showing the window.
    if (argv.includes('--restart')) { appshell.restartApp(); return; }
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}
function settings() {
  try { return readConfig().settings || {}; } catch { return {}; }
}

function loadAll() {
  try {
    const themeCss = fs.existsSync(THEME_PATH) ? fs.readFileSync(THEME_PATH, 'utf8') : '';
    return { config: readConfig(), themeCss };
  } catch (err) {
    return { error: `${path.basename(CONFIG_PATH)}: ${err.message}` };
  }
}

function isAuthUrl(url) {
  try {
    const { hostname } = new URL(url);
    return AUTH_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

const send = (channel, data) => win?.webContents.send(channel, data);

function createWindow() {
  const { config } = loadAll();
  const icon = appshell.ensureIcon();
  const state = appshell.loadWindowState();
  win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width || 1480,
    height: state.height || 940,
    minWidth: 760,
    minHeight: 480,
    title: appshell.APP_NAME,
    icon,
    autoHideMenuBar: true,
    backgroundColor: config?.theme?.background || '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webviewTag: true,
      spellcheck: true,
      autoplayPolicy: 'no-user-gesture-required', // Three.js Lab plays audio inside its sandbox frame
    },
  });
  if (state.maximized) win.maximize();
  appshell.trackWindowState(win);
  win.loadFile('index.html');
  // Links clicked in native chats open in your normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openExternal(url);
  });
  win.webContents.on('found-in-page', (_e, result) => send('find:result', result));
  win.on('focus', () => { win.flashFrame(false); send('window:focus', true); });
  win.on('blur', () => send('window:focus', false));

  appshell.setupTray(win, icon, { send });
  appshell.setupCloseToTray(win, settings);
  appshell.setupDownloads(send);
  appshell.applySettings(win, settings());
}

app.on('web-contents-created', (_event, contents) => {
  contents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  appshell.attachContextMenu(contents, send);

  if (contents.getType() !== 'webview') return;

  contents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true } };
    }
    openExternal(url);
    return { action: 'deny' };
  });

  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || (process.platform === 'darwin' && input.meta))) return;
    const key = input.key.toLowerCase();
    if (HUB_KEYS.has(key) || (input.shift && key === ' ')) {
      event.preventDefault();
      send('shortcut', { key, shift: input.shift });
    }
  });
});

ipcMain.handle('config:get', () => loadAll());
ipcMain.handle('config:save', (_e, config) => {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  return appshell.applySettings(win, config.settings || {});
});
ipcMain.handle('open-file', (_e, which) => shell.openPath(which === 'theme' ? THEME_PATH : CONFIG_PATH));
ipcMain.handle('open-external', (_e, url) => openExternal(url));
ipcMain.handle('open-data-folder', () => shell.openPath(store.DATA_DIR));

ipcMain.handle('chats:list', () => store.listChats());
ipcMain.handle('chats:get', (_e, id) => store.getChat(id));
ipcMain.handle('chats:save', (_e, chat) => store.saveChat(chat));
ipcMain.handle('chats:delete', (_e, id) => store.deleteChat(id));
ipcMain.handle('chats:searchText', (_e, query) => store.searchChats(query));
ipcMain.handle('chats:trash', () => store.listTrash());
ipcMain.handle('chats:restore', (_e, id) => store.restoreChat(id));
ipcMain.handle('history:get', () => store.getHistory());
ipcMain.handle('history:save', (_e, history) => store.saveHistory(history));
ipcMain.handle('kv:get', (_e, name, fallback) => store.getKV(name, fallback));
ipcMain.handle('kv:set', (_e, name, value) => store.setKV(name, value));

// The renderer names the agent; engine, model and prompt are always read from config.json here.
// A one-off question to an agent (second opinions): returns { ok, text } or { ok: false, error }.
ipcMain.handle('engine:once', (_e, { agentId, text, images }) => {
  engines.setEnginePaths(settings().enginePaths);
  const agent = readConfig().agents.find((a) => a.id === agentId);
  if (!agent || agent.mode !== 'native') return { ok: false, error: `No chat agent ${agentId}` };
  return engines.once({ agent, text, images: (images || []).filter((p) => typeof p === 'string') });
});
ipcMain.handle('engine:send', (_e, { agentId, chatId, session, text, options }) => {
  engines.setEnginePaths(settings().enginePaths);
  const agent = readConfig().agents.find((a) => a.id === agentId);
  if (!agent || agent.mode !== 'native') throw new Error(`${agentId} is not a native agent`);
  engines.send({ agent, chatId, session: session || {}, text, options: options || {} }, (event) => {
    send('engine:event', { chatId, ...event });
  });
});
ipcMain.handle('attachments:save', (_e, name, base64) => store.saveAttachment(name, base64));
ipcMain.handle('refs:import', (_e, src) => store.importRef(String(src)));
ipcMain.handle('attachments:dir', () => store.ATTACH_DIR);
ipcMain.handle('usage:get', () => store.getUsage());
ipcMain.handle('memory:get', () => store.getMemory());
ipcMain.handle('memory:save', (_e, memory) => store.saveMemory(memory));
// Claude's connected apps with tool counts, for the agent editor.
function describeConnectors(cache) {
  const claude = cache.claude;
  if (!claude) return null;
  return {
    checkedAt: claude.checkedAt,
    servers: claude.servers.map(({ name, status }) => {
      const prefix = `mcp__${name.replace(/[^A-Za-z0-9_-]/g, '_')}__`;
      const tools = claude.tools.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
      return { name, status, tools: tools.length, readTools: tools.filter(engines.isReadOnlyTool).length };
    }),
  };
}
ipcMain.handle('connectors:get', () => describeConnectors(engines.readConnectorCache()));
ipcMain.handle('connectors:refresh', async () => describeConnectors(await engines.discoverConnectors()));

// Past chats go to the matching native agent, else to the matching website agent.
function agentForSource(source) {
  const agents = readConfig().agents;
  const engine = source === 'claude.ai' ? 'claude' : 'codex';
  const match = agents.find((a) => a.mode === 'native' && a.engine === engine)
    || agents.find((a) => (a.url || '').includes(source))
    || agents[0];
  return match.id;
}

ipcMain.handle('chats:import', async () => {
  const pick = await dialog.showOpenDialog(win, {
    title: 'Import past chats',
    buttonLabel: 'Import',
    filters: [{ name: 'claude.ai or ChatGPT export', extensions: ['zip', 'json'] }],
    properties: ['openFile'],
  });
  if (pick.canceled || !pick.filePaths[0]) return null;
  try {
    return importer.importFile(pick.filePaths[0], agentForSource);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('pick-folder', async (_e, current, title) => {
  const pick = await dialog.showOpenDialog(win, {
    title: title || 'Choose a folder',
    defaultPath: current || undefined,
    properties: ['openDirectory'],
  });
  return pick.canceled ? null : pick.filePaths[0];
});
ipcMain.handle('engine:stop', (_e, chatId) => engines.stop(chatId));
ipcMain.handle('engine:stopAll', () => engines.stopAll());
ipcMain.handle('engine:login', (_e, engine) => engines.login(engine));
ipcMain.handle('engine:status', () => engines.status());

// ---------- window & desktop ----------
ipcMain.handle('window:show', () => { win.show(); win.focus(); });
ipcMain.handle('window:flash', () => { if (win.isFocused()) return; if (process.platform === 'darwin') app.dock?.bounce('informational'); else win.flashFrame(true); });
ipcMain.handle('window:isFocused', () => win.isFocused() && win.isVisible());
ipcMain.handle('window:reload', () => win.webContents.reloadIgnoringCache());
ipcMain.handle('find:start', (_e, text, opts) => (text ? win.webContents.findInPage(text, opts) : null));
ipcMain.handle('find:stop', () => win.webContents.stopFindInPage('keepSelection'));
ipcMain.handle('shortcuts:create', () => appshell.createShortcuts());
ipcMain.handle('app:restart', () => appshell.restartApp());
// A picture of the whole window (as you see it), saved with the chat attachments.
ipcMain.handle('window:capture', async () => {
  const img = await win.webContents.capturePage();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return store.saveAttachment(`hearth-${stamp}.png`, img.toPNG().toString('base64'));
});
ipcMain.handle('window:onTop', (_e, on) => { win.setAlwaysOnTop(Boolean(on), 'floating'); return win.isAlwaysOnTop(); });
ipcMain.handle('data:export', async () => {
  const r = await dialog.showSaveDialog(win, {
    defaultPath: `agent-hub-backup-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'Zip', extensions: ['zip'] }],
  });
  if (r.canceled || !r.filePath) return null;
  const entries = [
    { path: store.DATA_DIR, name: 'data' },
    { path: CONFIG_PATH, name: 'config.json' },
    { path: THEME_PATH, name: 'theme.css' },
  ].filter((e) => fs.existsSync(e.path));
  // Website logins live in Electron's own profile, not data/, so they're never in the backup.
  return fsapi.zip(entries, r.filePath, { skipDirs: ['workspace', 'ae'] });
});

// One zip with the app, your data and settings, to set Hearth up on a Mac (see mac/README.md).
ipcMain.handle('data:packForMac', async () => {
  const r = await dialog.showSaveDialog(win, { defaultPath: portable.defaultPackName(), filters: [{ name: 'Zip', extensions: ['zip'] }] });
  if (r.canceled || !r.filePath) return null;
  return portable.packForMac(r.filePath);
});
ipcMain.handle('app:platform', () => process.platform);

// ---------- Stage window: the Lab's sketch in its own renderer process and GPU context ----------
// The hub window is busy (chats, timeline, panels); a sketch running in its own window gets steady frames.
// Messages between the Lab and the sandbox page are relayed here (stage-preload.js on the other side).
let stageWin = null;
ipcMain.handle('stage:open', (_e, { query, width, height }) => {
  const { screen } = require('electron');
  const url = `${require('url').pathToFileURL(path.join(__dirname, 'tools', 'three-sandbox.html')).href}${query}`;
  if (!stageWin || stageWin.isDestroyed()) {
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    const k = width && height ? Math.min(1, (area.width * 0.8) / width, (area.height * 0.85) / height) : 1;
    stageWin = new BrowserWindow({
      width: width ? Math.round(width * k) : 1280, height: height ? Math.round(height * k) : 720, useContentSize: true,
      title: 'Hearth Stage', backgroundColor: '#000000', autoHideMenuBar: true, icon: appshell.ensureIcon(),
      webPreferences: { preload: path.join(__dirname, 'stage-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    stageWin.on('closed', () => { stageWin = null; if (!win.isDestroyed()) win.webContents.send('stage:closed'); });
    stageWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
  // a new frame size: reshape the window to it (re-runs with the same size leave your window alone)
  const sizeKey = width && height ? `${width}x${height}` : 'fit';
  if (stageWin.__size !== sizeKey) {
    if (stageWin.__size && width && height) {
      const area = screen.getDisplayMatching(stageWin.getBounds()).workArea;
      const k = Math.min(1, (area.width * 0.8) / width, (area.height * 0.85) / height);
      stageWin.setContentSize(Math.round(width * k), Math.round(height * k));
    }
    stageWin.setAspectRatio(width && height ? width / height : 0);
    stageWin.__size = sizeKey;
  }
  stageWin.loadURL(url);
  stageWin.show();
  return true;
});
ipcMain.handle('stage:close', () => { if (stageWin && !stageWin.isDestroyed()) stageWin.close(); });
ipcMain.handle('stage:focus', () => { if (stageWin && !stageWin.isDestroyed()) { stageWin.show(); stageWin.focus(); } });
ipcMain.on('stage:to', (_e, msg) => { if (stageWin && !stageWin.isDestroyed()) stageWin.webContents.send('stage:to', msg); });
ipcMain.on('stage:from', (_e, msg) => { if (win && !win.isDestroyed()) win.webContents.send('stage:from', msg); });
ipcMain.on('stage:fullscreen', () => { if (stageWin && !stageWin.isDestroyed()) stageWin.setFullScreen(!stageWin.isFullScreen()); });

fsapi.registerIpc(ipcMain, () => win);
gamebridge.start(() => win);
aemain.registerIpc(ipcMain, () => win, () => settings().aePath);

for (const file of [CONFIG_PATH, THEME_PATH]) {
  fs.watchFile(file, { interval: 400 }, () => send('config:changed', loadAll()));
}

app.whenReady().then(() => {
  // data moved here from another computer (or folder): point saved file locations at the new data folder
  try { const r = portable.fixMovedPaths(); if (r.moved) console.log(`Hearth: data moved from ${r.from}, fixed ${r.changed} paths in ${r.files} files`); } catch (err) { console.error('fixMovedPaths', err); }
  if (process.platform === 'darwin') {
    // a Mac app needs a menu bar for ⌘C / ⌘V / ⌘Q and friends
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Hearth', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]));
    try { app.dock?.setIcon(appshell.ensureIcon()); } catch { /* the icon is optional */ }
  }
  createWindow();
});
app.on('window-all-closed', () => app.quit());
