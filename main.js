const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const THEME_PATH = path.join(__dirname, 'theme.css');

// Present as plain Chrome so sign-in pages (Google, etc.) don't reject the app.
app.userAgentFallback =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

// Sign-in popups stay inside the app so the login lands in the right agent.
const AUTH_HOSTS = [
  'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com',
  'login.live.com', 'auth.openai.com', 'auth0.openai.com', 'github.com',
];
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'notifications', 'media', 'fullscreen']);
// Ctrl+<key> combos the hub handles even while a site has focus.
const HUB_KEYS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'g', 'r', ',', 'b']);

let win;

function loadAll() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const themeCss = fs.existsSync(THEME_PATH) ? fs.readFileSync(THEME_PATH, 'utf8') : '';
    return { config, themeCss };
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

function createWindow() {
  const { config } = loadAll();
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    title: 'Agent Hub',
    autoHideMenuBar: true,
    backgroundColor: config?.theme?.background || '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webviewTag: true,
    },
  });
  win.loadFile('index.html');
}

app.on('web-contents-created', (_event, contents) => {
  contents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  if (contents.getType() !== 'webview') return;

  contents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true } };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const key = input.key.toLowerCase();
    if (HUB_KEYS.has(key) || (input.shift && key === ' ')) {
      event.preventDefault();
      win?.webContents.send('shortcut', { key, shift: input.shift });
    }
  });
});

ipcMain.handle('config:get', () => loadAll());
ipcMain.handle('open-file', (_e, which) => shell.openPath(which === 'theme' ? THEME_PATH : CONFIG_PATH));

for (const file of [CONFIG_PATH, THEME_PATH]) {
  fs.watchFile(file, { interval: 400 }, () => win?.webContents.send('config:changed', loadAll()));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
