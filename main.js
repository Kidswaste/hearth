const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');
// (round 39, powerwise) keep the computer awake only while it matters, battery / saver, calm timers after a wake (first, so
// its test counter sees every timer the main process starts)
const powerwise = require('./powerwisemain');
// (round 31, winmac) started from the Mac's Dock, PATH lacks Homebrew / npm / nvm: claude, codex, ffmpeg, git and the
// chats' own commands are found again (Windows / Linux: unchanged)
require('./winmac').fixProcessPath();
// (round 37, updatesafe) an update Windows couldn't finish while Hearth ran (files held open) goes in now, before the
// rest loads; when main-process files changed, Hearth starts once more right away (no window yet). Usually: one stat.
if (require('./updatesafe-core').startSwap(app, { log: console.log })) return;
const store = require('./store');
// (round 19, splash) modules the first screen doesn't need are required on their first use instead of before the window
// opens (Electron's 'ready' waits for everything main.js does at load): the same object to every caller, made on demand
function later(file, onLoad) {
  let mod = null;
  const get = () => { if (!mod) { mod = require(file); onLoad?.(mod); } return mod; };
  return new Proxy({}, { get: (_t, k) => (k === 'loaded' ? Boolean(mod) : get()[k]), has: (_t, k) => k in get() }); // (.loaded: in yet? without loading it)
}
// the install check's results go to the window once the engines module is in (its first use registers this)
const engines = later('./engines', (m) => { m.onInstalls((report, info) => send('engine:installs', { ...report, fixed: info })); });
const importer = later('./importer');
const appshell = require('./appshell');
// (round 29, fastboot) these are set up right after the window is made (registerAfterWindow, same tick: before the page
// can ask anything), not before Electron's 'ready': main.js's top level is time the window waits for
const fsapi = later('./fsapi');
const portable = later('./portable');
const nowplaying = later('./nowplaying', (m) => m.pace?.(bgmain.state())); // (Lab → live sound: "what's playing")
const aemain = later('./aemain');
const gamebridge = later('./gamebridge');
const syncmain = later('./syncmain');
const appsmain = later('./appsmain');
const bgmain = require('./bgmain'); // (round 16) is anybody looking / on battery / asleep, and the steady idle cursor
// (round 36) native feel: window memory per computer + screen layout, the Mac's inset title bar, light / dark, menus, the badge
const nativefeel = require('./nativefeelmain');
const bigscreen = require('./bigscreenmain'); // (round 38) full screen + size of everything per screen

const CONFIG_PATH = path.join(__dirname, 'config.json');
const THEME_PATH = path.join(__dirname, 'theme.css');

// Present as plain Chrome so sign-in pages (Google, etc.) don't reject the app. (round 30, chrome) naming this computer's
// real system, with matching client hints for Google's sites (chromeguard.js); Google's refusal page offers Chrome.
const chromeguard = require('./chromeguard');
app.userAgentFallback = chromeguard.userAgent();
if (process.platform === 'win32') app.setAppUserModelId('Hearth');

// Sign-in popups stay inside the app so the login lands in the right agent.
const AUTH_HOSTS = [
  'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com',
  'login.live.com', 'auth.openai.com', 'auth0.openai.com', 'github.com', 'miro.com', 'slack.com',
];
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'clipboard-read', 'notifications', 'media', 'fullscreen', 'midi', 'midiSysex', 'display-capture']);
// Ctrl+<key> combos the hub handles even while a website has focus.
const HUB_KEYS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'g', 'r', ',', 'b', 'n', '\\', 'k', 'f', '/', '=', '+', '-', '0', 'tab', 'j', ';']);

let win;
// (round 19, splash) when this start reached each step, in ms since launch (/startup shows them; boot:status)
const bootTimes = { wall0: Date.now() - performance.now() };
const bootMark = (k) => { if (bootTimes[k] == null) bootTimes[k] = Math.round(performance.now()); };

// A second launch just brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    // The desktop "Hearth" shortcut passes --restart: restart cleanly instead of just showing the window.
    if (argv.includes('--restart')) { appshell.restartApp(); return; }
    const pack = argv.find((a) => /\.hearthpack$/i.test(a)); // (round 28, packs) opening a .hearthpack while Hearth runs
    if (pack && typeof packOpen === 'function') { packOpen(pack); return; }
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

// (round 16) config.json is read on every message (engine:send / once, settings()): read from disk once per version of
// the file (size + modified time: one stat instead of a read), parsed fresh each call so callers can't edit the cache
// (round 43, datasafe) through datasafemain.js: a held / damaged config.json is read again, then the last good version or
// its newest automatic copy (data/.history/config) is used, and it is never saved over until it reads again
const datasafe = require('./datasafemain');
const cfgStore = datasafe.config({ configPath: CONFIG_PATH, dataDir: store.DATA_DIR, onRecovered: () => send('config:changed', loadAll()), onDoubt: () => send('data:doubt', { what: 'config' }) });
function readConfig() { return cfgStore.read(); }
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

// (round 19, splash) the window's own color before its first frame: the loading screen's (index.html #splash-css), so
// no white or off-color frame ever shows; the window stays hidden until that first frame is drawn ('ready-to-show'),
// or 0.25 s at most (a slow graphics start, software GL: the window still opens at once, in that same color)
const SPLASH_BG = '#08090c';
const SHOW_AT_MOST_MS = 250;
function createWindow() {
  const icon = appshell.ensureIcon();
  // (round 36, nativefeel) where it was on this computer with these screens, never off-screen (a monitor that's gone)
  const { screen } = require('electron');
  nativefeel._set({ dataDir: store.DATA_DIR });
  let placed = null;
  try { placed = nativefeel.restore(screen); } catch { placed = null; }
  nativefeel.earlyTheme(require('electron').nativeTheme); // (round 40, firstscreen) light / dark before the window, not after
  const state = { ...(placed?.bounds || {}), maximized: Boolean(placed?.maximized) };
  const st = settings();
  win = new BrowserWindow({
    show: false,
    x: state.x,
    y: state.y,
    width: state.width || 1480,
    height: state.height || 940,
    minWidth: 760,
    minHeight: 480,
    title: appshell.APP_NAME,
    icon: process.platform === 'win32' && fs.existsSync(appshell.ICON_ICO) ? appshell.ICON_ICO : icon, // (Windows: every size of the .ico, crisp at 125 / 150 %)
    autoHideMenuBar: true,
    backgroundColor: SPLASH_BG,
    ...nativefeel.frameOptions(st), // the Mac: traffic lights in the rail (titleBarStyle hiddenInset)
    webPreferences: {
      additionalArguments: [`--hearth-frame=${nativefeel.frameKind(st)}`, ...bigscreen.startArgs(placed, screen)], // (preload.js → hub.native.frame; round 38: the screen's zoom for the first frame)
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webviewTag: true,
      spellcheck: true,
      autoplayPolicy: 'no-user-gesture-required', // Three.js Lab plays audio inside its sandbox frame
    },
  });
  bootMark('window');
  win.loadFile(path.join(__dirname, 'index.html'));
  // on screen with its first frame (maximize() shows a hidden window, so it waits for this moment too); what the first
  // screen doesn't need (tray, downloads, the global hotkey, login item, spellcheck languages) is set up right after
  let shown = false;
  const showNow = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    clearTimeout(showTimer);
    if (state.maximized) win.maximize(); else win.show();
    nativefeel.applyFlags(win, placed); // full screen as it was
    bootMark('shown');
    setImmediate(afterShown);
  };
  const showTimer = setTimeout(showNow, SHOW_AT_MOST_MS);
  win.once('ready-to-show', () => { bootMark('firstFrame'); showNow(); });
  const afterShown = () => {
    if (win.isDestroyed()) return;
    appshell.setupTray(win, icon, { send });
    appshell.setupDownloads(send);
    appshell.applySettings(win, settings());
  };
  nativefeel.track(win, screen, send);
  bigscreen.track(win, screen, send); // (round 38) the screen it's on, full screen per screen
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
  // (round 43, datasafe) a new page reads everything again: what the old one couldn't read is forgotten with it
  win.webContents.on('did-start-navigation', (d) => { if (d?.isMainFrame !== false && !d?.isSameDocument) store.newPage(); });
  // Ctrl/⌘+; opens the command bar (cmdbar.js) even while the Lab's sandboxed frame has the keyboard.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || (process.platform === 'darwin' && input.meta)) && (input.key === ';' || input.code === 'Semicolon')) {
      event.preventDefault();
      send('shortcut', { key: ';', shift: input.shift });
    }
    // Ctrl/⌘+. Again, Ctrl/⌘+Shift+. recent actions (speed-core.js), from the Lab's frame too
    if (input.type === 'keyDown' && (input.control || (process.platform === 'darwin' && input.meta)) && !input.alt && input.code === 'Period') {
      event.preventDefault();
      send('shortcut', { key: '.', shift: input.shift });
    }
  });
  win.on('focus', () => { nativeAttention?.clear(); send('window:focus', true); }); // (round 36: the Dock / taskbar badge goes too)
  win.on('blur', () => send('window:focus', false));

  appshell.setupCloseToTray(win, settings);
  bgmain.attach(win);
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
    if (appsmain.isAppGuest(contents)) return; // an app window's page keeps its keys (appsmain.js handles them)
    if (input.type !== 'keyDown' || !(input.control || (process.platform === 'darwin' && input.meta))) return;
    const key = input.key.toLowerCase();
    // Ctrl/⌘+Shift+M: the board drawer, from a website agent too
    if (HUB_KEYS.has(key) || (input.shift && (key === ' ' || key === 'm'))) {
      event.preventDefault();
      send('shortcut', { key, shift: input.shift });
    }
  });
});

// (round 19, splash) the startup sync pass (≤ 1.5 s, only with sync on) used to keep the window from opening; now the
// window opens at once and only reads / writes of your data wait for the pass, which runs while the page loads
let syncGate = null; // the startup pass, until it's done
const waiting = new Map(); // kv name → since (shown by the splash when the start is slow)
const afterSync = (fn) => (...a) => (syncGate ? syncGate.then(() => fn(...a)) : fn(...a));
ipcMain.handle('boot:status', () => ({
  times: bootTimes, syncOn: Boolean(syncmain.status()?.on),
  syncing: syncGate ? syncmain.status()?.label || 'your cloud folder' : null,
  reads: [...waiting].filter(([, t]) => Date.now() - t > 300).map(([k]) => k),
}));
ipcMain.handle('config:get', afterSync(() => loadAll()));
ipcMain.handle('config:save', afterSync((_e, config) => {
  config = syncmain.guardConfig(config); // a config that just arrived from another computer is merged, not undone
  // (round 29, safetynet) temp file + rename: a crash or a power cut mid-save can't leave half a config.json
  // (round 43, datasafe) never a config that isn't one, never over a file it couldn't read, never every agent at once
  const r = cfgStore.save(config);
  if (!r.ok) return r;
  if (r.kept) send('config:changed', loadAll()); // the guard kept something the window dropped: the window gets it back
  return appshell.applySettings(win, (r.value || config).settings || {});
}));
ipcMain.handle('open-file', (_e, which) => shell.openPath(which === 'theme' ? THEME_PATH : CONFIG_PATH));
ipcMain.handle('open-external', (_e, url) => openExternal(url));
ipcMain.handle('open-data-folder', () => shell.openPath(store.DATA_DIR));

ipcMain.handle('chats:list', afterSync(() => store.listChats()));
ipcMain.handle('chats:get', afterSync((_e, id) => store.getChat(id)));
ipcMain.handle('chats:save', afterSync((_e, chat) => store.saveChat(chat)));
ipcMain.handle('chats:delete', afterSync((_e, id) => store.deleteChat(id)));
ipcMain.handle('chats:searchText', (_e, query) => store.searchChats(query));
ipcMain.handle('chats:recall', (_e, o) => store.recall(o || {})); // (round 30) recall: "what did we decide about X?", ranked, local
ipcMain.handle('chats:trash', () => store.listTrash());
ipcMain.handle('chats:restore', afterSync((_e, id) => store.restoreChat(id)));
ipcMain.handle('history:get', afterSync(() => store.getHistory()));
ipcMain.handle('history:save', afterSync((_e, history) => store.saveHistory(history)));
// (round 43, scenesafe) o.status: { state: 'ok' | 'missing' | 'unreadable', value } instead of a silent fallback (the Lab's
// scenes); kv:set's o.removed: the scenes deleted on purpose (any other one a save would drop is kept)
const kvRead = (name, fallback, o) => (o?.status ? store.getKVStatus(name) : store.getKVOff(name, fallback));
ipcMain.handle('kv:get', (_e, name, fallback, o) => {
  if (!syncGate) return kvRead(name, fallback, o);
  const k = String(name);
  waiting.set(k, Date.now());
  return syncGate.then(() => { waiting.delete(k); return kvRead(name, fallback, o); });
});
ipcMain.handle('kv:set', afterSync((_e, name, value, o) => store.setKV(name, value, o)));
// (round 20, offmain) how long the main process's thread was blocked since the last ask (event-loop delay: max / p99 in
// ms, and the store thread's writes): dev/checks/offmain.js measures flows with it; started on the first ask
let lagH = null;
ipcMain.handle('perf:lag', () => {
  if (!lagH) { lagH = require('perf_hooks').monitorEventLoopDelay({ resolution: 5 }); lagH.enable(); return null; }
  const r = { maxMs: Math.round(lagH.max / 1e5) / 10, p99Ms: Math.round(lagH.percentile(99) / 1e5) / 10, meanMs: Math.round(lagH.mean / 1e5) / 10, store: store.writerStats() };
  lagH.reset();
  return r;
});

// The renderer names the agent; engine, model and prompt are always read from config.json here.
// A one-off question to an agent (second opinions): returns { ok, text } or { ok: false, error }.
ipcMain.handle('engine:once', (_e, { agentId, text, images, options }) => {
  engines.setEnginePaths(settings().enginePaths);
  const agent = readConfig().agents.find((a) => a.id === agentId);
  if (!agent || agent.mode !== 'native') return { ok: false, error: `No chat agent ${agentId}` };
  return engines.once({ agent, text, images: (images || []).filter((p) => typeof p === 'string'), options: options || {} });
});
// Astra's /astra-doctor: engine paths, versions, sign-in state.
ipcMain.handle('engine:doctor', () => { engines.setEnginePaths(settings().enginePaths); return engines.doctor(readConfig().agents); });
ipcMain.handle('engine:send', (_e, { agentId, chatId, session, text, options }) => {
  engines.setEnginePaths(settings().enginePaths);
  const agent = readConfig().agents.find((a) => a.id === agentId);
  if (!agent || agent.mode !== 'native') throw new Error(`${agentId} is not a native agent`);
  const turn = powerwise.turn(chatId); // (round 39) a long turn keeps the computer awake until it ends
  engines.send({ agent, chatId, session: session || {}, text, options: options || {} }, (event) => {
    if (event.type === 'done' || event.type === 'error' || event.type === 'stopped') turn.end();
    send('engine:event', { chatId, ...event });
  }, (event) => send('engine:live', { chatId, ...event })); // (round 21) steps, subagents, pulses: native.js / chat-live.js
});
ipcMain.handle('attachments:save', (_e, name, base64) => store.saveAttachment(name, base64));
ipcMain.handle('refs:import', (_e, src) => store.importRef(String(src)));
ipcMain.handle('attachments:dir', () => store.ATTACH_DIR);
ipcMain.handle('usage:get', () => store.getUsage());
// Token meter aggregates (kv/token-stats.json); the first call builds them from the chats.
const configAgents = () => { try { return readConfig().agents || []; } catch { return []; } };
ipcMain.handle('usage:stats', () => store.getTokenStats(configAgents()));
ipcMain.handle('usage:rebuild', () => store.rebuildTokenStats(configAgents()));
ipcMain.handle('memory:get', afterSync(() => store.getMemory()));
ipcMain.handle('memory:save', afterSync((_e, memory) => store.saveMemory(memory)));
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

ipcMain.handle('chats:import', async (_e, opts = {}) => {
  let file = typeof opts?.path === 'string' ? opts.path : null;
  if (!file) {
    const pick = await dialog.showOpenDialog(win, {
      title: 'Import past chats',
      buttonLabel: opts?.dryRun ? 'Check' : 'Import',
      filters: [{ name: 'claude.ai or ChatGPT export', extensions: ['zip', 'json'] }],
      properties: ['openFile'],
    });
    if (pick.canceled || !pick.filePaths[0]) return null;
    file = pick.filePaths[0];
  }
  try {
    return { path: file, ...await importer.importFile(file, agentForSource, { dryRun: Boolean(opts?.dryRun), onProgress: (p) => send('import:progress', p) }) };
  } catch (err) {
    return { path: file, error: err.message };
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
ipcMain.handle('engine:login', (_e, engine) => { engines.setEnginePaths(settings().enginePaths); return engines.login(engine); });
// Every Claude Code / Codex copy, the one in use, too old? signed in? (engine-health.js at startup, /doctor), and the
// update / install / sign-in run in a visible window; the check after it comes back as 'engine:installs'.
ipcMain.handle('engine:installs', (_e, opts) => { engines.setEnginePaths(settings().enginePaths); return engines.checkInstalls(opts || {}); });
// ffmpeg (sharp MP4 recordings, exact frames, renders): found or not, and a one-click install in a visible
// Terminal / PowerShell window (Homebrew on a Mac, winget on Windows); a status call after it forgets the old miss.
ipcMain.handle('tools:ffmpeg', (_e, o = {}) => {
  if (o.fresh) { require('./framereader').forgetTools(); require('./aemain').forgetTools(); }
  return require('./aemain').ffStatus({ ffmpeg: settings().ffmpegPath || undefined });
});
ipcMain.handle('tools:installFfmpeg', () => {
  const I = require('./installs');
  const marker = path.join(require('os').tmpdir(), `hearth-ffmpeg-${Date.now()}.done`);
  const lines = I.ffmpegLines(); // (round 28) shared with the "Check this computer" list, which shows it first
  return { ...I.runInTerminal({ title: 'Install ffmpeg for Hearth', lines, marker }), marker, command: lines.join('\n') };
});
ipcMain.handle('engine:fix', (_e, engine, action) => { engines.setEnginePaths(settings().enginePaths); return engines.fix(String(engine), String(action || 'update')); });
// (round 33, macpolish) the Mac's fix buttons (Gatekeeper's quarantine, chmod, Apple's tools, the privacy pane: the command
// shown first, run after a click) and the disks' case for the chats' folder checks; the login shell's PATH read once
const macpolish = require('./macpolish');
macpolish.register(ipcMain, { locate: (e) => { engines.setEnginePaths(settings().enginePaths); return engines.locate(e); }, chrome: () => require('./chrome-cdp').find().catch(() => null), openExternal: (u) => shell.openExternal(u) });
macpolish.adoptShellPath({ cacheFile: path.join(store.DATA_DIR, 'shell-path.json'), probe: () => new Promise((r) => setTimeout(r, 3000)).then(() => macpolish.shellPath()) }).catch(() => {}); // (last time's answer at once; the shell asked after the window opened)
ipcMain.handle('engine:status', () => { engines.setEnginePaths(settings().enginePaths); return engines.status(); });

// ---------- window & desktop ----------
ipcMain.handle('window:show', () => { win.show(); win.focus(); });
// (round 36, nativefeel) something finished while Hearth was in the background: the Dock's number + one bounce (Mac),
// the taskbar flash + a number on the icon (Windows); cleared when the window gets the focus
let nativeAttention = null;
ipcMain.handle('window:flash', () => (nativeAttention ? nativeAttention.attention() : null));
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
  return fsapi.zip(entries, r.filePath, { skipDirs: ['workspace', 'ae', 'sync'] });
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
ipcMain.handle('stage:onTop', () => { if (!stageWin || stageWin.isDestroyed()) return null; const on = !stageWin.isAlwaysOnTop(); stageWin.setAlwaysOnTop(on); return on; });
ipcMain.handle('stage:open', (_e, { query, width, height, fresh }) => {
  const { screen } = require('electron');
  // ⟲ Restart from scratch: a new window (and renderer process), without telling the Lab the Stage closed
  if (fresh && stageWin && !stageWin.isDestroyed()) { stageWin.__silent = true; stageWin.destroy(); stageWin = null; }
  const url = `${require('url').pathToFileURL(path.join(__dirname, 'tools', 'three-sandbox.html')).href}${query}`;
  if (!stageWin || stageWin.isDestroyed()) {
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    const k = width && height ? Math.min(1, (area.width * 0.8) / width, (area.height * 0.85) / height) : 1;
    stageWin = new BrowserWindow({
      width: width ? Math.round(width * k) : 1280, height: height ? Math.round(height * k) : 720, useContentSize: true,
      title: 'Hearth Stage', backgroundColor: '#000000', autoHideMenuBar: true, icon: appshell.ensureIcon(),
      webPreferences: { preload: path.join(__dirname, 'stage-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    const w = stageWin;
    const awake = powerwise.hold('present', { label: 'the Stage window is showing' }); // (round 39) a second screen: the screen stays on
    w.on('closed', () => { awake(); if (stageWin === w) stageWin = null; if (!w.__silent && !win.isDestroyed()) win.webContents.send('stage:closed'); });
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
// ---------- live sound for the Lab (Spotify, YouTube… or a mic) and what's playing ----------
// Screen-capture APIs need a click inside the page that asks; the Lab's click happens in the hub window, so the
// capture is started here in the sketch's frame (the Stage window when it's open) with a user gesture.
ipcMain.handle('live:start', async (_e, kind) => {
  try {
    if (stageWin && !stageWin.isDestroyed()) return await stageWin.webContents.mainFrame.executeJavaScript(`window.__startLive ? window.__startLive(${JSON.stringify(kind)}) : false`, true);
    // the Lab's own preview: the hub page captures and forwards the analysis
    return await win.webContents.executeJavaScript(`window.__labLiveStart ? window.__labLiveStart(${JSON.stringify(kind)}) : false`, true);
  } catch { return false; }
});
ipcMain.handle('np:start', () => nowplaying.start((info) => { if (win && !win.isDestroyed()) win.webContents.send('np:update', info); }));
ipcMain.handle('np:stop', () => nowplaying.stop());
ipcMain.handle('np:control', (_e, cmd) => nowplaying.control(String(cmd)));
app.on('before-quit', (e) => {
  // (round 20, offmain) saves still on the store thread land first (at most 2 s), then the rest is written here
  if (store.pendingCount() && !quitFlushed) {
    e.preventDefault(); quitFlushed = true;
    Promise.race([store.idle(), new Promise((r) => setTimeout(r, 2000))]).then(() => { store.flushSync(); app.quit(); });
    return;
  }
  store.flushSync();
  if (nowplaying.loaded) nowplaying.stop(); syncmain.quit();
});
let quitFlushed = false;
ipcMain.on('stage:fullscreen', () => { if (stageWin && !stageWin.isDestroyed()) stageWin.setFullScreen(!stageWin.isFullScreen()); });
// (round 22, labstage) the Stage window as a live output: which screens there are, and putting it fullscreen on one
// (the other screen than Hearth's by default), so the hub stays on the main screen
ipcMain.handle('stage:displays', () => {
  const { screen } = require('electron');
  const mine = screen.getDisplayMatching(win.getBounds()).id;
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: d.label || `Screen ${i + 1}`, width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor), hz: d.displayFrequency || 0, primary: d.id === screen.getPrimaryDisplay().id, hub: d.id === mine }));
});
ipcMain.handle('stage:place', (_e, { display = 'other', fullscreen = true } = {}) => {
  if (!stageWin || stageWin.isDestroyed()) return null;
  const { screen } = require('electron');
  const all = screen.getAllDisplays(); const mine = screen.getDisplayMatching(win.getBounds());
  const d = all.find((x) => x.id === display) || (display === 'other' ? all.find((x) => x.id !== mine.id) : null) || mine;
  if (stageWin.isFullScreen()) stageWin.setFullScreen(false);
  stageWin.setBounds({ ...d.workArea });
  if (fullscreen) stageWin.setFullScreen(true);
  stageWin.showInactive(); // the hub keeps the keyboard
  return { id: d.id, other: d.id !== mine.id, fullscreen: Boolean(fullscreen) };
});

// (round 16) A main-process module only some features use loads on its first IPC call: its channels are read from its
// source (ipcMain.handle('x:y', …) / ipcMain.on('x:y', …)), stand-in handlers require it and hand the call over.
// dev/boot-test.js checks the channels read match what register() really adds.
// (round 29) also through a one-line helper of the file's own: `const h = (ch, fn) => ipcMain.handle(ch, …)`, h('x:y', …)
function ipcChannels(src) {
  const chans = [...src.matchAll(/ipcMain\.(handle|on)\(\s*'([^']+)'/g)].map((m) => ({ kind: m[1], ch: m[2] }));
  for (const [, name, , kind] of src.matchAll(/const (\w+) = \((\w+)[^)]*\) => ipcMain\.(handle|on)\(\2\b/g)) {
    for (const m of src.matchAll(new RegExp(`\\b${name}\\(\\s*'([^']+)'`, 'g'))) chans.push({ kind, ch: m[1] });
  }
  return chans;
}
function lazyIpc(file, register) {
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const chans = ipcChannels(src);
  const real = new Map(); // channel → handler / listeners
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    for (const { kind, ch } of chans) { if (kind === 'handle') ipcMain.removeHandler(ch); else ipcMain.removeAllListeners(ch); }
    const ipc = {
      handle: (ch, fn) => { real.set(ch, fn); ipcMain.handle(ch, fn); },
      on: (ch, fn) => { real.set(ch, [...(real.get(ch) || []), fn]); ipcMain.on(ch, fn); },
      removeHandler: (ch) => ipcMain.removeHandler(ch),
    };
    register(require(path.join(__dirname, file)), ipc);
  };
  for (const { kind, ch } of chans) {
    if (kind === 'handle') ipcMain.handle(ch, (e, ...a) => { load(); const fn = real.get(ch); if (!fn) throw new Error(`${file}: no handler for ${ch}`); return fn(e, ...a); });
    else ipcMain.on(ch, (e, ...a) => { load(); for (const fn of real.get(ch) || []) fn(e, ...a); });
  }
  return { load, channels: chans.map((c) => c.ch) };
}
// (round 28, packs) a .hearthpack opened from Finder / Explorer (or dropped on the app's icon) → the window's import card
let packPending = process.argv.find((a) => /\.hearthpack$/i.test(a)) || null;
const packOpen = (p) => { if (win && !win.isDestroyed()) { win.webContents.send('packs:open', p); if (win.isMinimized()) win.restore(); win.show(); win.focus(); } else packPending = p; };
app.on('open-file', (e, p) => { if (/\.hearthpack$/i.test(p)) { e.preventDefault(); packOpen(p); } });
ipcMain.handle('packs:pending', () => { const p = packPending; packPending = null; return p; });
// (round 29, fastboot) every module the window talks to registers its IPC right after the window is made, in the same
// tick (the page can't send anything before this returns), instead of before Electron's 'ready': the window opens that
// much sooner and the requires below run while its page process starts. Order unchanged.
function registerAfterWindow() {
  const { nativeTheme, systemPreferences, nativeImage } = require('electron');
  nativeAttention = nativefeel.register(ipcMain, { getWin: () => win, nativeTheme, systemPreferences, app, nativeImage, appshell, send });
  bigscreen.register(ipcMain, { getWin: () => win, screen: require('electron').screen }); // (round 38) ⛶ full screen, size of everything
  powerwise.register(ipcMain, { bgmain, getWin: () => win }); // (round 39) staying awake while it matters, battery / saver, wake
  fsapi.registerIpc(ipcMain, () => win);
  gamebridge.start(() => win);
  aemain.registerIpc(ipcMain, () => win, () => settings().aePath);
  require('./boardmain').registerIpc(ipcMain, () => win); // mood board: file import, website snapshots
  require('./capturemain').register(ipcMain, () => win, settings); // screenshots / recordings of Hearth itself, frame reader
  lazyIpc('rendersmain.js', (m, ipc) => m.register(ipc, () => win, settings)); // the render queue: pause / resume / cancel ffmpeg jobs (round 29: on first use)
  lazyIpc('renderfastmain.js', (m, ipc) => m.register(ipc, () => win, settings)); // (round 41, renderfast) Lab exports stream their frames into ffmpeg (on first use)
  lazyIpc('adobemain.js', (m, ipc) => m.register(ipc, () => win, settings)); // Photoshop, Illustrator, Premiere, Media Encoder, InDesign scripting
  lazyIpc('deploymain.js', (m, ipc) => m.register(ipc, () => win, settings)); // publish on Vercel / Netlify / Cloudflare Pages / GitHub Pages
  lazyIpc('voicemain.js', (m, ipc) => m.register(ipc, () => win, { settings, dataDir: store.DATA_DIR })); // (round 23) voice: local speech-to-text (whisper), system voices
  lazyIpc('remotemain.js', (m, ipc) => m.register(ipc, () => win, { dataDir: store.DATA_DIR })); // (round 24) phone remote: a LAN-only server for the Lab / stage, off until /remote on
  lazyIpc('interopmain.js', (m, ipc) => m.register(ipc, () => win, { dataDir: store.DATA_DIR })); // (round 25) interop: OSC in / out, Ableton Link tempo, the OBS Browser Source page, obs-websocket; all off until used
  lazyIpc('publishmain.js', (m, ipc) => m.register(ipc, () => win, settings)); // (round 27) Ready to post: measures a finished video (ffmpeg) for the platform checks and cover ideas
  lazyIpc('motionmain.js', (m, ipc) => m.register(ipc, () => win, { dataDir: store.DATA_DIR })); // (round 25) camera / body tracking: MediaPipe's files, downloaded once after a yes; the camera permission on a Mac
  lazyIpc('firstrunmain.js', (m, ipc) => m.register(ipc, () => win, { readConfig, dataDir: store.DATA_DIR })); // (round 28) Check this computer: Mac permissions, Windows paths, chats' folders, the shown install commands
  lazyIpc('packsmain.js', (m, ipc) => m.register(ipc, { dataDir: store.DATA_DIR, getWin: () => win })); // (round 28) packs: a scene and everything it uses as one .hearthpack file (zip-slip guard, size caps)
  appsmain.register(ipcMain, () => win, { store, appshell }); // app windows (Meshy, Suno, Figma…), their downloads, the Meshy API
  syncmain.register(ipcMain, () => win, { dataDir: store.DATA_DIR, configPath: CONFIG_PATH, themePath: THEME_PATH, store }); // sync through a cloud drive folder
  require('./chatmediamain').register(ipcMain, { workspace: path.join(store.DATA_DIR, 'workspace') }); // pictures / videos a chat made, shown in the reply
  require('./reachmain').register(ipcMain, { dataDir: store.DATA_DIR, syncmain, folderMap: () => settings().reachFolders }); // (round 19) paths from the other computer, open / reveal / preview what a chat made
  lazyIpc('twocomputersmain.js', (m, ipc) => m.register(ipc, { dataDir: store.DATA_DIR, syncmain, getWin: () => win })); // (round 35) two computers: this computer's id / name, media found again after a switch, "Find this file"
  lazyIpc('filewatchmain.js', (m, ipc) => m.register(ipc, { getWin: () => win })); // (round 42) files changed outside Hearth: one watcher service (sync's folders use it too), calm reloads in the window
  lazyIpc('updatermain.js', (m, ipc) => m.register(ipc, { restart: () => appshell.restartApp(), getWin: () => win })); // ⬆ Update: pull main from the app's git checkout, reload / restart (round 29: on first use)
  lazyIpc('chromemain.js', (m, ipc) => m.register(ipc, { dataDir: store.DATA_DIR, getWin: () => win })); // (round 30) Hearth's Chrome: Google sign-in in the owner's real Chrome, driven over the DevTools protocol
  lazyIpc('chromeviewmain.js', (m, ipc) => m.register(ipc, { dataDir: store.DATA_DIR, getWin: () => win })); // (round 31) Chrome views: that Chrome out of sight, its pages shown and used inside Hearth's windows
  // (round 30, chrome) Google's "Couldn't sign you in" anywhere: the app window offers Chrome, else the hub does (a website chat)
  chromeguard.setup({ onReject: (contents, opener) => {
    const target = opener || contents;
    if (appsmain.offerChrome(target, contents)) return;
    send('chrome:offer', { wcId: target.id, url: (() => { try { return target.getURL(); } catch { return ''; } })(), popup: Boolean(opener) });
    if (opener) { try { BrowserWindow.fromWebContents(contents)?.close(); } catch { /* gone */ } } // the dead-end sign-in popup goes
  } });
  require('./offlinemain').register(ipcMain, { getWin: () => win }); // (round 34, offline) is the internet there (no engine, no tokens), sleep / wake
  require('./safetynetmain').register(ipcMain, { dataDir: store.DATA_DIR, getWin: () => win }); // (round 29) Hearth never loses work: the session marker, the page reloading after a crash, the work journal
  require('./devreportmain').register(ipcMain, { dataDir: store.DATA_DIR }); // (round 21) Report to the developer: gh issue / versions / crashes
  lazyIpc('assetsmain.js', (m, ipc) => m.register(ipc, { dataDir: store.DATA_DIR, getWin: () => win })); // (round 24) the asset library: folder scans + hashes off-thread, thumbnails cache, Poly Haven / ambientCG downloads (round 29: on first use)
  require('./connectionsmain').register(ipcMain, { readConfig }); // (round 26) the owner's own MCP servers: Test, and what engines.js hands each AI
  lazyIpc('hooksmain.js', (m, ipc) => m.register(ipc, () => win)); // (round 26) hooks: "when a file appears in a folder" (fs.watch, only while a hook asks; round 29: loaded then)
  lazyIpc('tokenauditmain.js', (m, ipc) => m.register(ipc, { dataDir: store.DATA_DIR })); // (round 36) ⋯ AI setup → Spending: where each AI's fixed tokens go (reads only)
  lazyIpc('costcoachmain.js', (m, ipc) => m.register(ipc, { dataDir: store.DATA_DIR })); // (round 43) 🧭 Cost coach: the last 7 days of replies as compact records (reads only)
  lazyIpc('scenesafemain.js', (m, ipc) => m.register(ipc, { dataDir: store.DATA_DIR, configPath: CONFIG_PATH, syncmain })); // (round 43) 🛟 Recover lost scenes: every copy of the Lab's scenes still on this computer, the cloud folder, backups (reads only)
  datasafe.register(ipcMain, { dataDir: store.DATA_DIR, configPath: CONFIG_PATH, store, cfg: cfgStore, syncmain, onConfig: () => send('config:changed', loadAll()) }); // (round 43, datasafe) what couldn't be read (the calm card), 🛟 Recover… (chats, memory, settings, tool data)
  store.onDoubt(() => send('data:doubt', {}));
  lazyIpc('dragdropmain.js', (m, ipc) => m.register(ipc, { dataDir: store.DATA_DIR })); // (round 38) files with Finder / Explorer: native drags out, drops checked (folders, iCloud placeholders), copied files pasted

  // config.json / theme.css edited outside Hearth (an editor, sync): told to the window. (round 16) the OS tells us
  // (fs.watch, re-armed when an editor replaces the file); a calm stat every 5 s is the safety net (was a stat every
  // 400 ms per file); either way a change is sent once (size + modified time).
  for (const file of [CONFIG_PATH, THEME_PATH]) {
    let seen = ''; let t = null; let w = null;
    const stamp = () => { try { const st = fs.statSync(file); return `${st.size}:${st.mtimeMs}`; } catch { return ''; } };
    seen = stamp();
    const check = () => { const now = stamp(); if (now === seen) return; seen = now; send('config:changed', loadAll()); };
    const soon = () => { clearTimeout(t); t = setTimeout(check, 60); };
    const arm = () => { try { w?.close(); w = fs.watch(file, (ev) => { soon(); if (ev === 'rename') setTimeout(arm, 100); }); w.on('error', () => { w = null; }); } catch { w = null; } };
    arm();
    // (round 39, powerwise) the safety net on the background schedule: every 10 s on screen, slower minimized / on
    // battery, none while the computer sleeps (was a stat every 5 s per file, always)
    powerwise.every(`config-stat:${path.basename(file)}`, 10000, () => { if (!w) arm(); check(); });
  }
  bgmain.register(() => win);
  bgmain.subscribe((st) => { syncmain.pace?.(st); if (nowplaying.loaded) nowplaying.pace(st); appsmain.pace?.(st); });
  syncmain.setBusy?.(() => (engines.loaded ? engines.busy?.() || 0 : 0)); // (no replies can run before the engines module is in)
  require('./jankmain').register(ipcMain, bgmain, () => win); // (round 20) jank watch: main loop lag, GPU crashes, the owner's busy moments
  syncmain.setHold?.(() => require('./jankmain').hold()); // a sync pass waits out a drag / typing burst
}
// /background (sync.js): what Hearth is doing in the background right now, and what each of its processes costs
ipcMain.handle('bg:state', () => {
  const procs = app.getAppMetrics().map((m) => ({ type: m.type, name: m.name || m.serviceName || '', cpu: Math.round((m.cpu?.percentCPUUsage || 0) * 10) / 10, mb: Math.round((m.memory?.workingSetSize || 0) / 1024) }));
  return { ...bgmain.state(), calmMs: bgmain.CALM_MS, sync: syncmain._pace?.() || null, replies: engines.loaded ? engines.busy?.() || 0 : 0, procs };
});

app.whenReady().then(async () => {
  bootMark('appReady');
  createWindow(); // (round 29, fastboot) first: the page process starts while the rest is set up (same tick, so no IPC yet)
  // data moved here from another computer (or folder): point saved file locations at the new data folder
  try { const r = portable.fixMovedPaths(); if (r.moved) console.log(`Hearth: data moved from ${r.from}, fixed ${r.changed} paths in ${r.files} files`); } catch (err) { console.error('fixMovedPaths', err); }
  registerAfterWindow();
  // "System sound" in the Lab: the sound of the whole computer (Windows), without a picker
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(([src]) => cb(src ? { video: src, ...(process.platform === 'win32' ? { audio: 'loopback' } : {}) } : {})).catch(() => cb({}));
  });
  // a Mac app needs a menu bar for ⌘C / ⌘V / ⌘Q and friends; (round 36, nativefeel) the full Mac menus (About, Settings…
  // ⌘,, Hide, Quit, Edit, View, Window, Help) and on Windows a clean menu bar Alt shows (nativefeel-core.js menuTemplate)
  nativefeel.setupMenu({ Menu, app, getWin: () => win, send, appName: appshell.APP_NAME });
  if (process.platform === 'darwin') {
    try { app.dock?.setIcon(appshell.ensureIcon()); } catch { /* the icon is optional */ }
  }
  // sync on: what the other computer did arrives before the window reads your data (≤ 1.5 s; see afterSync above)
  const syncFrom = performance.now();
  syncGate = syncmain.ready().catch(() => {}).then(() => { syncGate = null; bootTimes.syncMs = Math.round(performance.now() - syncFrom); });
});
app.on('window-all-closed', () => app.quit());
// (round 31, winmac) a Mac: clicking Hearth in the Dock (or opening it again) brings back a window that "Closing the
// window keeps Hearth running" hid; before, only the menu-bar icon could
app.on('activate', () => { if (win && !win.isDestroyed() && !win.isVisible()) { win.show(); win.focus(); } });
