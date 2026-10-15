// App windows, main side (round 14, apps stream). Each app (Meshy, Suno, Figma, Poly Haven…) opens in its own
// window: a slim chrome page (apps-window.html: back, reload, open in browser, send to chat, downloads) around a
// <webview> in the app's own persistent session ("persist:app-<id>"), so the owner signs in on the service's own
// page and Hearth never sees a password. Closing a window only hides it (sign-in and page kept); a window hidden for
// a few minutes is parked (destroyed, its last address remembered) so it costs nothing.
// Downloads from an app window land in Downloads/Hearth/<App> and are offered to the right place in the hub
// (apps.js routes them: Lab, board, the system player, the chat).
// API keys the owner pastes (Meshy) are encrypted with Electron's safeStorage in the profile folder (never in data/,
// never synced, never in a backup), used only here: no page and no engine ever receives one. Meshy jobs run here
// (apps-meshy-api.js is the only file that knows Meshy's API) and survive a reload of the hub page.
// Tests: HEARTH_MESHY_BASE / HEARTH_POLYHAVEN_BASE point the services at dev/fake-meshy.js.
const { app, BrowserWindow, safeStorage, session, shell, net, nativeImage, webContents, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AppsCore = require('./apps-core');
const MeshyAPI = require('./apps-meshy-api');

// (round 16) hidden windows are freed sooner: after 3 minutes (was 5); a third hidden window sends the oldest hidden one
// away after 20 s (at most MAX_HIDDEN wait in the background, each one a whole web page in memory); with Hearth itself
// minimized or the computer asleep, after a minute. A page that's still playing sound always waits.
const PARK_MS = Number(process.env.HEARTH_APPS_PARK_MS) || 3 * 60000;
const MAX_HIDDEN = 2;
let hubAway = false;
const MESHY_BASE = process.env.HEARTH_MESHY_BASE || MeshyAPI.BASE;
const POLY_BASE = process.env.HEARTH_POLYHAVEN_BASE || 'https://api.polyhaven.com';
const POLL_MS = process.env.HEARTH_MESHY_BASE ? 250 : 4000;
// sign-in pages that open as a popup inside the app window (the session stays the app's)
const AUTH_HOSTS = ['accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com', 'login.live.com', 'github.com', 'discord.com', 'auth0.com', 'clerk.com', 'adobelogin.com', 'facebook.com', 'id.tiktok.com', 'workos.com'];
const isAuth = (url) => { const h = AppsCore.hostOf(url); return AUTH_HOSTS.some((a) => h === a || h.endsWith(`.${a}`)) || /\/(oauth|auth|login|signin|sso)\b/i.test(String(url)); };

let getWin = () => null;
let store = null;
let appshell = null;
const wins = new Map(); // app id → { win, spec, park, lastUrl, title, guestId }
const hostIds = new Set(); // webContents ids of the chrome pages (their guests are app pages)
let catalog = []; // [{ id, name, icon, group }] from the hub page (the chrome's app switcher)
const downloads = []; // newest first: { id, app, appName, name, path, state, received, total, url, at }
const hooked = new Set(); // partitions whose downloads are routed here
const pasteWaits = new Map();
// (round 30, chrome) apps that open in the owner's Google Chrome instead (Google sign-in: chromemain.js, loaded on use)
const cwins = new Map(); // app id → { spec, url } (its Chrome window is chromemain's key `app:<id>`)
let chromeM = null;
const chromeMod = () => { if (!chromeM) { chromeM = require('./chromemain'); chromeM.init({ dataDir: dataDir(), getWin }); } return chromeM; };
const ckey = (id) => `app:${id}`;
// (round 31, chromeview) an app "in Chrome" shows in its usual Hearth window: a Chrome view of the page (Chrome itself
// stays out of sight) instead of the <webview>. spec.chromeKey marks that window; downloads Chrome makes land in the
// same Downloads/Hearth/<App> folder and list (chromeviewmain.js reports them through chromeDownloads below).
const frameOf = (e) => Boolean(e?.spec?.chromeKey);
let lastOffer = null; // the last time an app window offered Chrome (apps:status, for dev/checks/chrome.js)
const inChrome = async (id) => cwins.has(id) && chromeM && await chromeM.hasWindow(ckey(id));

const toHub = (data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('apps:event', data); };
const toChrome = (appId, channel, data) => { const e = wins.get(appId); if (e?.win && !e.win.isDestroyed()) e.win.webContents.send(channel, data); };
const uid = () => `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const testDir = () => process.env.HEARTH_TEST_SAVE_DIR || null;
const dataDir = () => store?.DATA_DIR || path.join(__dirname, 'data');
// (round 43, datasafe) a file held for a moment (Windows) is read again; one that still can't be read isn't "empty": a
// save built on that read is merged with the file once it reads (the other API keys / Meshy jobs are never wiped)
const DS = require('./datasafe-core');
const unread = new Set();
const readJson = (p, d) => { const r = DS.load(fs, p, d); if (r.canSave && !r.doubt) unread.delete(p); else unread.add(p); return r.value; };
const writeJson = (p, v) => {
  if (unread.has(p)) { const r = DS.load(fs, p, null); if (!r.canSave) { console.warn('apps: not saved over', path.basename(p), '(it can\'t be read just now)'); return; } v = DS.union(r.value, v); unread.delete(p); }
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(`${p}.tmp`, JSON.stringify(v, null, 1)); fs.renameSync(`${p}.tmp`, p); } catch (err) { console.warn('apps:', err.message); }
};

// ---------- folders ----------
function downloadsRoot() { return testDir() ? path.join(testDir(), 'apps-downloads') : path.join(app.getPath('downloads'), 'Hearth'); }
function downloadsDir(appName) { const d = path.join(downloadsRoot(), AppsCore.safeName(appName || 'Apps')); fs.mkdirSync(d, { recursive: true }); return d; }
const meshyDir = () => { const d = path.join(dataDir(), 'apps', 'meshy'); fs.mkdirSync(d, { recursive: true }); return d; };
function uniquePath(dir, name) {
  const p = path.parse(AppsCore.safeName(name, 120));
  let target = path.join(dir, p.base);
  for (let n = 1; fs.existsSync(target); n += 1) target = path.join(dir, `${p.name} (${n})${p.ext}`);
  return target;
}

// ---------- API keys (safeStorage) ----------
const KEYS_FILE = () => path.join(app.getPath('userData'), 'hearth-app-keys.json');
const sessionKeys = new Map(); // only when this computer can't encrypt: kept until Hearth quits
function canEncrypt() { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } }
function getKey(service) {
  if (service === 'meshy' && process.env.HEARTH_MESHY_KEY) return process.env.HEARTH_MESHY_KEY;
  if (sessionKeys.has(service)) return sessionKeys.get(service);
  const enc = readJson(KEYS_FILE(), {})[service];
  if (!enc) return null;
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return null; }
}
function setKey(service, value) {
  const v = String(value || '').trim();
  if (!/^[\w.-]{8,200}$/.test(v)) return { ok: false, error: 'That doesn\'t look like an API key (copy it from the service\'s API settings).' };
  const all = readJson(KEYS_FILE(), {});
  if (canEncrypt()) {
    all[service] = safeStorage.encryptString(v).toString('base64');
    writeJson(KEYS_FILE(), all);
    sessionKeys.delete(service);
    return { ok: true, stored: 'keychain' };
  }
  sessionKeys.set(service, v);
  return { ok: true, stored: 'session' };
}
function forgetKey(service) {
  sessionKeys.delete(service);
  const all = readJson(KEYS_FILE(), {});
  delete all[service];
  writeJson(KEYS_FILE(), all);
  return { ok: true };
}
const keyInfo = (service) => { const k = getKey(service); return { has: Boolean(k), test: k === MeshyAPI.TEST_KEY, stored: sessionKeys.has(service) ? 'session' : k ? 'keychain' : null, canEncrypt: canEncrypt() }; };

// ---------- downloads from app windows ----------
function hookSession(partition, appIdOf) {
  if (hooked.has(partition)) return;
  hooked.add(partition);
  const ses = session.fromPartition(partition);
  appshell?.skipDownloads?.(ses); // the hub's own download toast (appshell.setupDownloads) leaves these to us
  ses.on('will-download', (_e, item, wc) => {
    try { require('./powerwisemain').download(item); } catch { /* (round 39, powerwise) a big one keeps the computer awake */ }
    const appId = appIdOf(wc);
    const spec = wins.get(appId)?.spec || catalog.find((a) => a.id === appId) || { id: appId, name: appId };
    const target = uniquePath(downloadsDir(spec.name), item.getFilename() || 'download');
    item.setSavePath(target);
    const d = { id: uid(), app: spec.id, appName: spec.name, name: path.basename(target), path: target, state: 'progressing', received: 0, total: item.getTotalBytes(), url: item.getURL(), at: Date.now() };
    downloads.unshift(d);
    downloads.length = Math.min(downloads.length, 200);
    let lastSent = 0;
    const report = (state, force) => {
      d.state = state; d.received = item.getReceivedBytes(); d.total = item.getTotalBytes();
      const now = Date.now();
      if (!force && now - lastSent < 400) return; // a fast download sends ≤ 2–3 updates a second
      lastSent = now;
      toChrome(spec.id, 'appwin:downloads', listDownloads(spec.id));
      toHub({ type: 'download', d: { ...d } });
    };
    report('progressing', true);
    item.on('updated', (_ev, state) => report(state));
    item.once('done', (_ev, state) => report(state === 'completed' ? 'completed' : state, true));
  });
}
const listDownloads = (appId) => downloads.filter((d) => !appId || d.app === appId).slice(0, 40);
// a file Hearth fetched for an app (Poly Haven, Meshy's web results…), in the same list
async function fetchTo({ url, appId, appName, name } = {}) {
  if (!/^https?:\/\//i.test(String(url))) return { ok: false, error: 'Only web addresses can be downloaded.' };
  const dir = downloadsDir(appName || appId || 'Apps');
  const target = uniquePath(dir, name || decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download'));
  const d = { id: uid(), app: appId || 'apps', appName: appName || appId || 'Apps', name: path.basename(target), path: target, state: 'progressing', received: 0, total: 0, url, at: Date.now() };
  downloads.unshift(d);
  downloads.length = Math.min(downloads.length, 200); // (round 20, soak) the same cap as the apps' own downloads
  toHub({ type: 'download', d: { ...d }, quiet: true });
  try {
    const res = await net.fetch(url);
    if (!res.ok) throw new Error(`The server answered ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(target, buf);
    Object.assign(d, { state: 'completed', received: buf.length, total: buf.length });
  } catch (err) { Object.assign(d, { state: 'failed', error: err.message }); }
  toChrome(d.app, 'appwin:downloads', listDownloads(d.app));
  toHub({ type: 'download', d: { ...d }, quiet: true });
  return d.state === 'completed' ? { ok: true, path: target, id: d.id } : { ok: false, error: d.error };
}
async function fetchJson(url) {
  if (!/^https?:\/\//i.test(String(url))) return { ok: false, error: 'Not a web address' };
  try { const res = await net.fetch(url, { headers: { Accept: 'application/json' } }); if (!res.ok) return { ok: false, error: `${res.status}` }; return { ok: true, value: await res.json() }; } catch (err) { return { ok: false, error: err.message }; }
}

// ---------- the windows ----------
const boundsFile = () => path.join(app.getPath('userData'), 'hearth-app-windows.json');
const savedBounds = (id) => readJson(boundsFile(), {})[id] || null;
function saveBounds(id, win) {
  if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  const all = readJson(boundsFile(), {});
  all[id] = { ...win.getBounds(), url: wins.get(id)?.lastUrl || all[id]?.url || null };
  writeJson(boundsFile(), all);
}
function guestOf(entry) { try { return entry.guestId ? webContents.fromId(entry.guestId) : null; } catch { return null; } }
function park(entry, ms = hubAway ? Math.min(PARK_MS, 60000) : PARK_MS) {
  clearTimeout(entry.park);
  entry.parkAt = Date.now() + ms;
  entry.park = setTimeout(() => {
    const w = entry.win;
    if (!w || w.isDestroyed() || w.isVisible()) return;
    if (guestOf(entry)?.isCurrentlyAudible?.()) { park(entry); return; } // still playing something: later
    entry.parked = true; entry.closing = true;
    saveBounds(entry.spec.id, w);
    w.destroy();
    if (frameOf(entry) && chromeM) chromeM.pageOp(entry.spec.chromeKey, 'close').catch(() => {}); // (round 31) its page in Chrome goes too (it costs as much as a window)
  }, ms);
}
// the hidden windows beyond MAX_HIDDEN (oldest hidden first) go away soon
function capHidden() {
  const hidden = [...wins.values()].filter((e) => e.win && !e.win.isDestroyed() && !e.win.isVisible()).sort((a, b) => (a.hiddenAt || 0) - (b.hiddenAt || 0));
  for (const e of hidden.slice(0, Math.max(0, hidden.length - MAX_HIDDEN))) if ((e.parkAt || Infinity) > Date.now() + 20000) park(e, 20000);
}
// a hidden window's page is quiet: muted (pages that ignore the pause, autoplay), unmuted when shown again
function quiet(entry, on) { const g = guestOf(entry); try { if (g && !g.isDestroyed()) g.setAudioMuted(Boolean(on)); } catch { /* gone */ } }
function pace(st = {}) {
  hubAway = Boolean(st.hidden || st.asleep);
  if (hubAway) for (const e of wins.values()) if (e.win && !e.win.isDestroyed() && !e.win.isVisible() && (e.parkAt || 0) > Date.now() + 60000) park(e, 60000);
}
function openWindow(spec = {}) {
  const id = String(spec.id || '').replace(/[^\w-]/g, '');
  if (!id) return { ok: false, error: 'No app id' };
  const url = spec.url && /^(https?|file):/i.test(spec.url) ? spec.url : null;
  const ex0 = wins.get(id);
  if (ex0?.win && !ex0.win.isDestroyed() && frameOf(ex0) !== Boolean(spec.chromeKey)) { ex0.closing = true; saveBounds(id, ex0.win); ex0.win.destroy(); wins.delete(id); } // (round 31) a Chrome view ↔ Hearth's own page: a fresh window
  const ex = wins.get(id);
  if (ex?.win && !ex.win.isDestroyed()) {
    clearTimeout(ex.park);
    if (url && spec.go) toChrome(id, 'appwin:navigate', url);
    if (!spec.background) { if (ex.win.isMinimized()) ex.win.restore(); ex.win.show(); ex.win.focus(); }
    toHub({ type: 'window', id, state: 'shown' });
    return { ok: true, reused: true };
  }
  const partition = `persist:app-${String(spec.partition || id).replace(/[^\w-]/g, '')}`;
  hookSession(partition, (wc) => { const host = wc?.hostWebContents; for (const [aid, e] of wins) if (e.win && !e.win.isDestroyed() && (host?.id === e.win.webContents.id || e.guestId === wc?.id)) return aid; return id; });
  const b = savedBounds(id);
  const hub = getWin();
  const win = new BrowserWindow({
    width: b?.width || 1280, height: b?.height || 860, ...(b?.x != null ? { x: b.x, y: b.y } : {}), minWidth: 420, minHeight: 300,
    title: `${spec.name || id} · Hearth`, backgroundColor: '#14161b', autoHideMenuBar: true, show: !spec.background,
    icon: appshell?.ensureIcon?.(),
    webPreferences: { preload: path.join(__dirname, 'apps-preload.js'), contextIsolation: true, sandbox: true, webviewTag: true, spellcheck: true },
  });
  const entry = { win, spec: { ...spec, id, partition }, park: null, lastUrl: (spec.resume !== false && b?.url && AppsCore.sameSite(b.url, url || b.url) && !spec.go) ? b.url : url, title: '', guestId: null };
  wins.set(id, entry);
  hostIds.add(win.webContents.id);
  const hostId = win.webContents.id;
  win.loadFile(path.join(__dirname, 'apps-window.html'), { query: { id } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('did-attach-webview', (_e, guest) => { entry.guestId = guest.id; configureGuest(guest, entry); });
  win.on('close', (e) => {
    if (entry.closing || !hub || hub.isDestroyed()) return;
    e.preventDefault();
    saveBounds(id, win);
    const g = guestOf(entry);
    // hidden windows don't keep playing: the media on the page pauses (it resumes with a click when shown again)
    g?.executeJavaScript?.('document.querySelectorAll("video,audio").forEach((m) => { try { m.pause(); } catch {} })', true).catch(() => {});
    if (frameOf(entry) && chromeM) chromeM.pageOp(entry.spec.chromeKey, 'eval', { expr: 'document.querySelectorAll("video,audio").forEach((m) => { try { m.pause(); } catch {} }), true' }).catch(() => {}); // (round 31) in Chrome too
    win.hide();
    entry.hiddenAt = Date.now();
    if (!g?.isCurrentlyAudible?.()) quiet(entry, true);
    park(entry);
    capHidden();
    toHub({ type: 'window', id, state: 'hidden' });
  });
  win.on('show', () => { clearTimeout(entry.park); entry.parkAt = 0; quiet(entry, false); });
  win.on('closed', () => { hostIds.delete(hostId); if (wins.get(id) === entry) wins.delete(id); toHub({ type: 'window', id, state: 'closed' }); });
  if (hub && !hub.__appsHooked) { hub.__appsHooked = true; hub.once('closed', closeAll); }
  toHub({ type: 'window', id, state: 'opened' });
  return { ok: true };
}
// (round 30, chrome) does this app open in Chrome? The owner's choice per app, else by itself for a site whose
// sign-in is Google's own (Gemini, NotebookLM, YouTube Studio…) when Chrome is on this computer
async function wantsChrome(spec) {
  if (spec.inHearth || !/^https?:/i.test(String(spec.url || ''))) return false;
  const p = chromeMod().prefs().apps[spec.id];
  if (p === 'hearth') return false;
  if (p === 'chrome') return true;
  return chromeMod().googleOnly(spec.url) && Boolean(await chromeMod().found());
}
const siteUrl = (e) => e?.siteUrl || e?.spec?.url || null;
async function openInChrome(spec) {
  const id = spec.id;
  const ex = wins.get(id);
  const saved = savedBounds(id)?.url;
  const url = (spec.go && spec.url) || siteUrl(ex) || (saved && !isAuth(saved) && AppsCore.sameSite(saved, spec.url) ? saved : null) || spec.url;
  const r = await chromeMod().openWindow({ key: ckey(id), url, app: true, go: Boolean(spec.go && spec.url) });
  if (!r.ok) return r;
  const full = { ...(ex?.chromeSpec || ex?.spec || {}), ...spec };
  cwins.set(id, { spec: full, url });
  // (round 31) its page shows in Hearth's own window, as a Chrome view (Chrome itself stays out of sight)
  const w = openWindow({ ...full, id, url, go: false, chromeKey: ckey(id) });
  if (w.ok) { const e = wins.get(id); if (e) e.chromeSpec = full; }
  toHub({ type: 'window', id, state: 'shown', chrome: true });
  return { ok: true, chrome: true, view: w.ok };
}
// (round 31) the app's Chrome page shown in its Hearth window (an AI or the board's finder asked to show it)
async function showView(id) {
  const c = cwins.get(id);
  const cat = catalog.find((a) => a.id === id) || {};
  const spec = { ...(wins.get(id)?.chromeSpec || {}), ...cat, ...(c?.spec || {}), id };
  if (!chromeM?.keys.has(ckey(id))) { if (!/^https?:/i.test(String(spec.url || ''))) return { ok: false, error: 'That app isn\'t open in Chrome' }; return openInChrome(spec); }
  cwins.set(id, { spec, url: spec.url });
  const w = openWindow({ ...spec, go: false, chromeKey: ckey(id) });
  return { ...w, chrome: true };
}
// (round 31) downloads from Chrome views (chromeviewmain.js): the same folder and list as Hearth's app windows
const chromeDownloads = {
  dir: (appName) => downloadsDir(appName),
  report(d) {
    const i = downloads.findIndex((x) => x.id === d.id);
    if (i >= 0) downloads[i] = { ...downloads[i], ...d }; else { downloads.unshift({ ...d }); downloads.length = Math.min(downloads.length, 200); }
    toChrome(d.app, 'appwin:downloads', listDownloads(d.app));
    toHub({ type: 'download', d: { ...d } });
  },
};
async function openAny(spec = {}) {
  const id = String(spec.id || '').replace(/[^\w-]/g, '');
  if (id && await wantsChrome({ ...spec, id }).catch(() => false)) {
    const r = await openInChrome({ ...spec, id });
    if (r.ok) return r;
    const w = openWindow(spec); // Chrome couldn't: Hearth's own window, with the reason
    if (w.ok) setTimeout(() => toChrome(id, 'appwin:key', { op: 'hint', text: `Chrome didn't open: ${r.error} (opened here instead)` }), 1500);
    return w;
  }
  return openWindow(spec);
}
// Google's refusal page showed in an app window (or its sign-in popup): the window offers Chrome (chromeguard.js)
function offerChrome(target, contents) {
  for (const [id, e] of wins) {
    if (!e.win || e.win.isDestroyed() || (e.guestId !== target?.id && e.win.webContents.id !== target?.id)) continue;
    toChrome(id, 'appwin:offer', { url: siteUrl(e) });
    lastOffer = { id, url: siteUrl(e), popup: Boolean(contents && contents !== target), at: Date.now() };
    if (contents && contents !== target) { try { BrowserWindow.fromWebContents(contents)?.close(); } catch { /* gone */ } } // the dead-end popup goes
    if (!e.win.isVisible()) e.win.show();
    e.win.focus();
    return true;
  }
  return false;
}
function configureGuest(guest, entry) {
  const home = entry.spec.url || entry.lastUrl;
  guest.setWindowOpenHandler(({ url }) => {
    if (isAuth(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true } };
    // the service's own links stay in its window; anything else opens in the normal browser
    if (AppsCore.sameSite(url, home) || (entry.spec.hosts || []).some((h) => AppsCore.hostOf(url).endsWith(h))) { guest.loadURL(url).catch(() => {}); return { action: 'deny' }; }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  guest.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || (process.platform === 'darwin' && input.meta);
    const k = String(input.key || '').toLowerCase();
    const act = (op) => { event.preventDefault(); toChrome(entry.spec.id, 'appwin:key', op); };
    if ((mod && k === 'r') || k === 'f5') act('reload');
    else if ((input.alt && k === 'arrowleft') || (mod && k === '[')) act('back');
    else if ((input.alt && k === 'arrowright') || (mod && k === ']')) act('forward');
    else if (mod && k === 'w') act('close');
    else if (mod && input.shift && k === 'enter') act('to-chat');
    else if (mod && k === 'l') act('copy-link');
  });
}
function closeWindow(id, { destroy = false } = {}) {
  const e = wins.get(id);
  if (!e?.win || e.win.isDestroyed()) return { ok: false, error: 'Not open' };
  if (destroy) { e.closing = true; saveBounds(id, e.win); e.win.destroy(); } else e.win.close();
  return { ok: true };
}
function closeAll() { for (const [id, e] of wins) { if (e.win && !e.win.isDestroyed()) { e.closing = true; saveBounds(id, e.win); e.win.destroy(); } } }
const listWindows = () => [...wins.entries()].filter(([, e]) => e.win && !e.win.isDestroyed()).map(([id, e]) => ({ id, name: e.spec.name, visible: e.win.isVisible(), focused: e.win.isFocused(), url: e.lastUrl, title: e.title, audible: Boolean(guestOf(e)?.isCurrentlyAudible?.()) }));
// (round 30) with the apps open in Chrome (each one listed once: its Chrome window when it has one)
async function allWindows() {
  const out = [];
  for (const [id, c] of cwins) {
    if (!(await inChrome(id))) { cwins.delete(id); continue; }
    const info = await chromeM.pageOp(ckey(id), 'info');
    out.push({ id, name: c.spec.name || id, visible: true, focused: false, url: info.value?.url || c.url, title: info.value?.title || '', audible: false, chrome: true });
  }
  return [...out, ...listWindows().filter((w) => !out.some((x) => x.id === w.id))];
}

// text typed into the app's page (Suno's lyrics / style boxes): the chrome page fills it and reads it back
async function pasteChrome(id, { text, field, strict } = {}) {
  await chromeM.pageOp(ckey(id), 'wait', { timeout: 6000 });
  const r = await chromeM.pageOp(ckey(id), 'eval', { expr: AppsCore.fillScript(String(text || ''), field || '', Boolean(strict)) });
  const v = (r.ok && r.value) || { ok: false, error: r.error || 'The page didn\'t answer' };
  if (!v.ok && !strict) { try { clipboard.writeText(String(text || '')); v.copied = true; } catch { /* no clipboard */ } }
  return v;
}
async function paste(id, o = {}) {
  if (await inChrome(id)) return pasteChrome(id, o);
  return pasteHere(id, o);
}
function pasteHere(id, { text, field, strict } = {}) {
  const e = wins.get(id);
  if (!e?.win || e.win.isDestroyed()) return Promise.resolve({ ok: false, error: 'The app window isn\'t open.' });
  const reqId = uid();
  return new Promise((resolve) => {
    pasteWaits.set(reqId, resolve);
    toChrome(id, 'appwin:paste', { reqId, text: String(text || ''), field: field || '', strict: Boolean(strict) });
    setTimeout(() => { if (pasteWaits.has(reqId)) { pasteWaits.delete(reqId); resolve({ ok: false, error: 'The page didn\'t answer (still loading?)' }); } }, 15000);
  });
}
async function pagePicture(id, { whole = false } = {}) {
  // whole: the window with its chrome (a picture of how the app window looks), else the app's page only
  if (await inChrome(id)) { const r = await chromeM.pageOp(ckey(id), 'shot'); return r.ok ? store.saveAttachment(`${id}-page.jpg`, r.value) : null; }
  const g = whole ? wins.get(id)?.win?.webContents : guestOf(wins.get(id) || {});
  if (!g) return null;
  try { const img = await g.capturePage(); if (img.isEmpty()) return null; const s = img.getSize(); const small = s.width > 1600 ? img.resize({ width: 1600 }) : img; return store.saveAttachment(`${id}-page.jpg`, small.toJPEG(85).toString('base64')); } catch { return null; }
}

// (round 30, chrome) the AI's hands on an app's page, the same in Hearth's window and in Chrome: read its text, click,
// type, press a key, a picture, wait, go somewhere. op: text | click | type | key | shot | wait | go | info
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => (sel ? `document.querySelector(${JSON.stringify(String(sel))})` : 'document.body');
async function pageAny(id, op, a = {}) {
  // (round 30, pinboard) Find images like this: the pictures on screen (read only) and one modest step down the page
  if (op === 'pins' || op === 'scroll') {
    const PC = require('./pinboard-core');
    const expr = op === 'scroll' ? PC.SCROLL_EXPR : PC.readExpr(a);
    if (await inChrome(id)) return { ...(await chromeM.pageOp(ckey(id), 'eval', { expr })), where: 'chrome' };
    const g0 = guestOf(wins.get(id) || {});
    if (!g0 || g0.isDestroyed()) return { ok: false, error: 'The app window isn\'t open' };
    try { return { ok: true, value: await g0.executeJavaScript(expr, true) }; } catch (err) { return { ok: false, error: err.message }; }
  }
  if (await inChrome(id)) {
    if (op === 'shot') { const r = await chromeM.pageOp(ckey(id), 'shot'); return r.ok ? { ok: true, image: r.value, mime: 'image/jpeg', where: 'chrome' } : r; }
    return { ...(await chromeM.pageOp(ckey(id), op, a)), where: 'chrome' };
  }
  const e = wins.get(id);
  const g = guestOf(e || {});
  if (!g || g.isDestroyed()) return { ok: false, error: 'The app window isn\'t open' };
  const js = (code) => g.executeJavaScript(code, true);
  try {
    switch (op) {
      case 'info': return { ok: true, value: { url: g.getURL(), title: g.getTitle() } };
      case 'text': { const t = await js(`(() => { const n = ${q(a.selector)}; return n ? String(n.innerText || n.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, ${Math.min(50000, Number(a.max) || 20000)}) : null; })()`); return t == null ? { ok: false, error: `Nothing matches ${a.selector}` } : { ok: true, value: t }; }
      case 'click': {
        const b = await js(`(() => { const n = ${q(a.selector)}; if (!n) return null; n.scrollIntoView({ block: 'center', inline: 'center' }); const r = n.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height }; })()`);
        if (!b) return { ok: false, error: `Nothing matches ${a.selector} on the page` };
        if (!b.w || !b.h) return { ok: false, error: `${a.selector} is on the page but not visible` };
        for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) g.sendInputEvent({ type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
        return { ok: true, value: `Clicked ${a.selector}` };
      }
      case 'type': {
        const ok = await js(`(() => { const n = ${a.selector ? q(a.selector) : 'document.activeElement'}; if (!n) return false; n.focus(); if (!${a.append ? 'true' : 'false'}) { if (n.select) n.select(); else if (n.isContentEditable) document.execCommand('selectAll'); } return true; })()`);
        if (!ok) return { ok: false, error: a.selector ? `Nothing matches ${a.selector} on the page` : 'No box has the keyboard' };
        await g.insertText(String(a.text ?? ''));
        if (a.enter) await pageAny(id, 'key', { key: 'Enter' });
        return { ok: true, value: `Typed ${String(a.text ?? '').length} characters` };
      }
      case 'key': { const k = a.key || 'Enter'; g.sendInputEvent({ type: 'keyDown', keyCode: k }); if (k === 'Enter') g.sendInputEvent({ type: 'char', keyCode: '\r' }); g.sendInputEvent({ type: 'keyUp', keyCode: k }); return { ok: true, value: 'done' }; }
      case 'shot': { const img = await g.capturePage(); if (img.isEmpty()) return { ok: false, error: 'The page shows nothing yet' }; const sz = img.getSize(); return { ok: true, image: (sz.width > 1600 ? img.resize({ width: 1600 }) : img).toJPEG(82).toString('base64'), mime: 'image/jpeg' }; }
      case 'wait': {
        const t0 = Date.now(); const ms = Math.min(60000, Number(a.timeout) || 15000);
        while (Date.now() - t0 < ms) { try { if (a.selector ? await js(`!!${q(a.selector)}`) : !g.isLoading() && await js('document.readyState') === 'complete') return { ok: true, value: true }; } catch { /* navigating */ } await sleep(150); }
        return { ok: true, value: false };
      }
      case 'go': if (!/^https?:\/\//i.test(String(a.url))) return { ok: false, error: 'Only web addresses' }; await g.loadURL(String(a.url)).catch(() => {}); return { ok: true, value: { url: g.getURL(), title: g.getTitle() } };
      default: return { ok: false, error: `Unknown page action ${op} (text, click, type, key, shot, wait, go, info)` };
    }
  } catch (err) { return { ok: false, error: err.message }; }
}
async function navChrome(id, op, url) {
  const k = ckey(id);
  if (op === 'download' && /^https?:/i.test(String(url))) return chromeM.pageOp(k, 'eval', { expr: `(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(String(url))}; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); return true; })()` }); // (round 31) it lands in Downloads/Hearth/<App>
  if (op === 'url' && /^https?:/i.test(String(url))) return chromeM.pageOp(k, 'go', { url, wait: false });
  if (op === 'home') return chromeM.pageOp(k, 'go', { url: cwins.get(id)?.spec?.url, wait: false });
  if (['reload', 'back', 'forward'].includes(op)) return chromeM.pageOp(k, op);
  if (op === 'close') return wins.has(id) ? closeWindow(id) : chromeM.pageOp(k, 'close'); // (round 31) its Hearth window hides, like any app window
  if (op === 'copy-link') { const r = await chromeM.pageOp(k, 'info'); if (r.ok) clipboard.writeText(r.value.url); return { ok: r.ok }; }
  if (op === 'to-chat') {
    const [info, sel, pic] = await Promise.all([chromeM.pageOp(k, 'info'), chromeM.pageOp(k, 'eval', { expr: 'String(getSelection() || "")' }), pagePicture(id)]);
    toHub({ type: 'to-chat', app: id, appName: cwins.get(id)?.spec?.name || id, url: info.value?.url, title: info.value?.title, selection: String(sel.value || '').slice(0, 4000), picture: pic });
    const w = getWin(); if (w && !w.isDestroyed()) { w.show(); w.focus(); }
    return { ok: true };
  }
  return showView(id); // (round 31) shown in its Hearth window
}

// ---------- Meshy jobs ----------
const JOBS_FILE = () => path.join(meshyDir(), 'jobs.json');
let jobs = null; // [{ id, op, name, prompt, opts, step, steps, tasks: { preview, refine, … }, status, pct, label, files, error, at, acked, credits }]
const loadJobs = () => { jobs ||= readJson(JOBS_FILE(), []); return jobs; };
const saveJobs = () => writeJson(JOBS_FILE(), loadJobs().slice(0, 60));
const running = new Map(); // job id → { stop }
function meshyClient() { return MeshyAPI.client({ key: getKey('meshy'), base: MESHY_BASE, fetch: (u, o) => net.fetch(u, o) }); }
const pub = (j) => { const { opts, ...rest } = j; return { ...rest, opts: { ...opts, imageUrl: opts?.imageUrl && /^data:/.test(opts.imageUrl) ? '(picture)' : opts?.imageUrl, modelUrl: opts?.modelUrl && /^data:/.test(opts.modelUrl) ? '(model file)' : opts?.modelUrl } }; };
function emitJob(j) { toHub({ type: 'meshy', job: pub(j) }); }
// a local picture → a data: URI Meshy accepts (PNG / JPEG, at most 2048 px)
function imageUri(src) {
  const s = String(src || '');
  if (/^(https?:|data:image\/)/i.test(s)) return s;
  if (!fs.existsSync(s)) throw new Error(`No picture at ${s}`);
  let img = nativeImage.createFromPath(s);
  if (img.isEmpty()) throw new Error('Meshy reads PNG or JPEG pictures (this one couldn\'t be opened).');
  const { width, height } = img.getSize();
  if (Math.max(width, height) > 2048) img = img.resize(width >= height ? { width: 2048 } : { height: 2048 });
  return `data:image/jpeg;base64,${img.toJPEG(90).toString('base64')}`;
}
function modelUri(src) {
  const s = String(src || '');
  if (/^(https?:|data:)/i.test(s)) return s;
  const st = fs.statSync(s);
  if (st.size > 40 * 1048576) throw new Error('That model is over 40 MB: Meshy needs it smaller.');
  return `data:model/gltf-binary;base64,${fs.readFileSync(s).toString('base64')}`;
}
function startMeshy(args = {}) {
  if (!getKey('meshy')) return { ok: false, error: 'No Meshy API key yet: /meshy key to paste it once (Meshy → Settings → API). It is stored encrypted on this computer and never shown to a chat.' };
  const op = String(args.op || 'text');
  const o = { ...(args.opts || {}) };
  try {
    if (op === 'image') o.imageUrl = imageUri(o.image);
    if ((op === 'retexture' || op === 'remesh') && !o.taskId) o.modelUrl = modelUri(o.model);
    delete o.image; delete o.model;
    const steps = op === 'text' ? (o.draft ? ['preview'] : ['preview', 'refine']) : [op];
    MeshyAPI.body(steps[0], o); // validates before anything is spent
    const est = MeshyAPI.estimate(op, o);
    const j = { id: `m${uid()}`, op, name: AppsCore.safeName(args.name || o.prompt || o.stylePrompt || op, 48), prompt: o.prompt || o.stylePrompt || '', opts: o, steps, step: steps[0], tasks: {}, status: 'running', pct: 0, label: 'starting', files: {}, error: '', at: Date.now(), acked: false, credits: est.credits, chatId: args.chatId || null, to: args.to || null, source: args.source || null };
    loadJobs().unshift(j);
    saveJobs();
    runJob(j);
    return { ok: true, job: pub(j) };
  } catch (err) { return { ok: false, error: err.message }; }
}
async function runJob(j) {
  if (running.has(j.id)) return;
  const ctl = { stopped: false };
  running.set(j.id, ctl);
  const span = j.steps.length === 2 ? { preview: [0, 55], refine: [55, 94] } : { [j.steps[0]]: [0, 94] };
  try {
    const c = meshyClient();
    for (const step of j.steps) {
      j.step = step;
      if (!j.tasks[step]) {
        const o = step === 'refine' ? { ...j.opts, previewId: j.tasks.preview } : j.opts;
        j.label = `${step === 'refine' ? 'texturing' : 'sending'}…`; emitJob(j);
        j.tasks[step] = await c.create(step, o);
        saveJobs();
      }
      const [a, b] = span[step];
      const t = await c.wait(step, j.tasks[step], {
        interval: POLL_MS, stop: () => ctl.stopped,
        onProgress: (task) => { j.pct = Math.round(a + (b - a) * task.progress / 100); j.label = `${step === 'preview' ? 'shape' : step === 'refine' ? 'texture' : step} ${task.progress} %${task.status === 'waiting' && task.queue ? ` · ${task.queue} ahead in Meshy's queue` : ''}`; emitJob(j); },
      });
      j.result = { glb: t.glb, thumb: t.thumb, fbx: t.fbx, usdz: t.usdz };
    }
    j.label = 'downloading the model'; j.pct = 96; emitJob(j);
    if (!j.result?.glb) throw new Error('Meshy finished without a GLB file.');
    const base = `${AppsCore.safeName(j.name, 40)}-${j.id.slice(-6)}`;
    const glb = path.join(meshyDir(), `${base}.glb`);
    const res = await net.fetch(j.result.glb);
    if (!res.ok) throw new Error(`The model download failed (${res.status})`);
    fs.writeFileSync(glb, Buffer.from(await res.arrayBuffer()));
    j.files.glb = glb;
    if (j.result.thumb) {
      try { const r2 = await net.fetch(j.result.thumb); if (r2.ok) { const p = path.join(meshyDir(), `${base}.png`); fs.writeFileSync(p, Buffer.from(await r2.arrayBuffer())); j.files.thumb = p; } } catch { /* the picture is a bonus */ }
    }
    j.status = 'done'; j.pct = 100; j.label = 'ready';
  } catch (err) {
    j.status = ctl.stopped ? 'stopped' : 'failed';
    j.error = ctl.stopped ? 'Stopped (Meshy may still finish it: /meshy resume)' : err.message;
    j.label = j.status;
  } finally {
    running.delete(j.id);
    saveJobs();
    emitJob(j);
  }
}
function meshy(op, args = {}) {
  if (op === 'start') return startMeshy(args);
  if (op === 'jobs') {
    // jobs that were running when Hearth closed carry on (polling only: nothing is spent twice)
    if (args.resume !== false && getKey('meshy')) for (const j of loadJobs()) if (j.status === 'running' && !running.has(j.id)) runJob(j);
    return { ok: true, value: loadJobs().slice(0, 40).map(pub) };
  }
  if (op === 'resume') {
    const j = loadJobs().find((x) => x.id === args.id) || loadJobs().find((x) => ['failed', 'stopped'].includes(x.status) && Object.keys(x.tasks || {}).length);
    if (!j) return { ok: false, error: 'Nothing to pick up.' };
    j.status = 'running'; j.error = '';
    runJob(j);
    return { ok: true, job: pub(j) };
  }
  if (op === 'stop') { const c = running.get(args.id); if (c) c.stopped = true; return { ok: Boolean(c) }; }
  if (op === 'ack') { for (const j of loadJobs()) if (j.id === args.id) j.acked = true; saveJobs(); return { ok: true }; }
  if (op === 'forget') { jobs = loadJobs().filter((j) => j.id !== args.id); saveJobs(); return { ok: true }; }
  if (op === 'balance') return meshyClient().balance().then((n) => ({ ok: true, value: n })).catch((err) => ({ ok: false, error: err.message }));
  if (op === 'estimate') { try { return { ok: true, value: MeshyAPI.estimate(args.op || 'text', args.opts || {}) }; } catch (err) { return { ok: false, error: err.message }; } }
  return { ok: false, error: `Unknown Meshy operation ${op}` };
}

// ---------- IPC ----------
function register(ipcMain, gw, deps = {}) {
  getWin = gw;
  store = deps.store || require('./store');
  appshell = deps.appshell || null;
  app.on('before-quit', () => { for (const e of wins.values()) e.closing = true; for (const c of running.values()) c.stopped = true; });
  const h = (ch, fn) => ipcMain.handle(ch, (_e, ...a) => fn(...a));
  // from the hub page
  h('apps:open', (spec) => openAny(spec || {})); // (round 30) in Chrome when that app asks for it (Google sign-in)
  h('apps:close', (id, o) => closeWindow(String(id), o || {}));
  h('apps:closeAll', () => { closeAll(); return { ok: true }; });
  h('apps:windows', () => allWindows());
  h('apps:page', (id, op, a) => pageAny(String(id), String(op || ''), a || {})); // (round 30) the AI's hands on the page (apps_page)
  h('apps:chrome', async (id, op) => { // (round 30) this app in Chrome ('chrome'), back in Hearth ('hearth'), automatic (null)
    const s = String(id || '').replace(/[^\w-]/g, '');
    if (op === 'status') return { pref: chromeMod().prefs().apps[s] || null, open: await inChrome(s), found: await chromeMod().found(), hidden: chromeMod().hidden() };
    if (op === 'view') return showView(s); // (round 31) its Chrome page in its Hearth window
    const r = chromeMod().setPref('apps', s, op === 'chrome' || op === 'hearth' ? op : null);
    if (op === 'hearth' && cwins.has(s)) { await chromeM.pageOp(ckey(s), 'close').catch(() => {}); cwins.delete(s); if (frameOf(wins.get(s))) closeWindow(s, { destroy: true }); }
    return r;
  });
  h('apps:nav', async (id, op, url) => {
    if (await inChrome(id)) return navChrome(id, op, url);
    if (!wins.has(id)) return { ok: false, error: 'Not open' };
    // a file fetched in the app's own session (its sign-in cookies apply), landing like any download from the window
    if (op === 'download') { const g = guestOf(wins.get(id)); if (!g || !/^https?:/i.test(String(url))) return { ok: false, error: 'No page' }; g.downloadURL(String(url)); return { ok: true }; }
    toChrome(id, 'appwin:key', op === 'url' || op === 'hint' ? { op, url, text: String(url || '').slice(0, 300) } : op); return { ok: true }; });
  h('apps:paste', (id, o) => paste(String(id), o || {}));
  h('apps:picture', (id, o) => pagePicture(String(id), o || {}));
  h('apps:catalog', (list) => { catalog = Array.isArray(list) ? list.slice(0, 200) : []; for (const id of wins.keys()) toChrome(id, 'appwin:catalog', catalog); return true; });
  h('apps:downloads', (appId) => listDownloads(appId || null));
  h('apps:dirs', () => ({ downloads: downloadsRoot(), meshy: meshyDir() }));
  h('apps:key', (service, op, value) => {
    const s = String(service || '').replace(/[^\w-]/g, '');
    if (op === 'set') return setKey(s, value);
    if (op === 'forget') return forgetKey(s);
    return keyInfo(s);
  });
  h('apps:fetchTo', (o) => fetchTo(o || {}));
  h('apps:fetchJson', (url) => fetchJson(String(url || '')));
  h('apps:meshy', (op, args) => meshy(String(op || ''), args || {}));
  h('apps:status', async () => ({ lastOffer, meshyBase: MESHY_BASE, polyBase: POLY_BASE, meshyKey: keyInfo('meshy'), windows: await allWindows(), downloadsDir: downloadsRoot(), parkMs: PARK_MS, maxHidden: MAX_HIDDEN, testBase: process.env.HEARTH_MESHY_BASE || null }));

  // from an app window's chrome (apps-window.html via apps-preload.js); the sender names its app
  const appOf = (e) => { for (const [id, x] of wins) if (x.win && !x.win.isDestroyed() && x.win.webContents.id === e.sender.id) return [id, x]; return [null, null]; };
  const c = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { const [id, x] = appOf(e); return id ? fn(id, x, ...a) : null; });
  c('appwin:init', (id, x) => ({ spec: x.spec, url: x.lastUrl || x.spec.url || 'about:blank', catalog, downloads: listDownloads(id), mac: process.platform === 'darwin' }));
  c('appwin:state', (id, x, s = {}) => { if (s.url && /^https?:/i.test(s.url)) { x.lastUrl = s.url; if (!isAuth(s.url)) x.siteUrl = s.url; } if (s.title != null) { x.title = String(s.title).slice(0, 200); x.win.setTitle(`${x.title ? `${x.title} · ` : ''}${x.spec.name} · Hearth`); } return true; });
  c('appwin:external', (_id, _x, url) => { if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url)); return true; });
  c('appwin:toChat', async (id, x, o = {}) => { const pic = o.picture === false ? null : await pagePicture(id); toHub({ type: 'to-chat', app: id, appName: x.spec.name, url: o.url || x.lastUrl, title: o.title || x.title, selection: String(o.selection || '').slice(0, 4000), picture: pic }); const w = getWin(); if (w && !w.isDestroyed()) { w.show(); w.focus(); } return { ok: true }; });
  c('appwin:route', (id, _x, downloadId, target) => { const d = downloads.find((y) => y.id === downloadId); if (!d) return { ok: false }; toHub({ type: 'route', d: { ...d }, target: String(target) }); return { ok: true }; });
  c('appwin:action', (id, x, action, o = {}) => { toHub({ type: 'action', app: id, action: String(action), url: o.url || x.lastUrl, title: o.title || x.title }); return true; });
  c('appwin:openApp', (_id, _x, other) => { toHub({ type: 'open', id: String(other) }); return true; });
  c('appwin:reveal', (_id, _x, p) => { if (downloads.some((d) => d.path === p)) shell.showItemInFolder(p); else shell.openPath(downloadsRoot()); return true; });
  c('appwin:pasteResult', (_id, _x, reqId, r) => { pasteWaits.get(reqId)?.(r || { ok: false }); pasteWaits.delete(reqId); return true; });
  c('appwin:signOut', async (id, x) => { await session.fromPartition(x.spec.partition).clearStorageData(); toChrome(id, 'appwin:key', 'reload'); return { ok: true }; });
  c('appwin:hide', (id) => closeWindow(id));
  // (round 30, chrome) "Open in Chrome (for Google sign-in)" from the window's ⋯ or its offer after Google refused
  c('appwin:chrome', async (id, x, op) => {
    if (op === 'status') { const f = await chromeMod().found(); return { found: f ? f.name : null, pref: chromeMod().prefs().apps[id] || null, auto: chromeMod().googleOnly(x.spec.url) }; }
    if (op === 'everyday') return chromeMod().everyday(siteUrl(x) || x.lastUrl);
    if (op === 'hearth' || op === 'auto') {
      const r = chromeMod().setPref('apps', id, op === 'hearth' ? 'hearth' : null);
      if (op === 'hearth' && frameOf(x)) { // (round 31) from its Chrome view back to Hearth's own page: the window opens again with it
        const spec = { ...(x.chromeSpec || x.spec), chromeKey: null };
        await chromeM.pageOp(ckey(id), 'close').catch(() => {}); cwins.delete(id);
        setTimeout(() => openWindow({ ...spec, id, go: false }), 50);
      }
      return r;
    }
    if (op === 'signin') return chromeMod().signIn({ key: ckey(id) }); // (round 31) the view's "Sign in (opens Chrome once)" from the app window's ⋯
    chromeMod().setPref('apps', id, 'chrome');
    const r = await openInChrome({ ...x.spec, id, url: siteUrl(x) || x.spec.url, go: true });
    if (r.ok) toHub({ type: 'chrome-app', id, name: x.spec.name });
    return r;
  });
}

module.exports = { register, pace, offerChrome, chromeDownloads, isAppGuest: (contents) => Boolean(contents?.hostWebContents && hostIds.has(contents.hostWebContents.id)), _test: { isAuth, imageUri } };
