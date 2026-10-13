// Hearth's Chrome, main side (round 30, chrome stream). The owner: "every Google sign-in inside Hearth shows
// 'Couldn't sign you in'… could we just use Chrome and hook into Chrome?" Yes: where Google sign-in is needed, the
// page opens in the owner's real Google Chrome (Edge / Brave when there's no Chrome), in a profile of Hearth's own
// (data/chrome/profile: Chrome 136+ refuses remote control of the everyday profile, and the owner's own tabs stay
// theirs). The owner signs in to Google once there, in Chrome's own window; it stays signed in. Hearth drives it through
// the DevTools protocol on a free port bound to 127.0.0.1 (chrome-cdp.js): app windows open as Chrome app windows
// (--app=, no tabs or address bar, so they look like Hearth's), and the AI tools read, click, type and take pictures
// there the same way they do in Hearth's own windows (appsmain.js).
// Loaded on first use (main.js lazyIpc) or by appsmain.js when an app opens in Chrome. Never sees a password.
// Tests: HEARTH_CHROME_PATH (Playwright's Chromium "as Chrome"), HEARTH_CHROME_FLAGS (e.g. --no-sandbox),
// HEARTH_CHROME_PROFILE (a temp profile).
const shell = { openExternal: (u) => require('electron').shell.openExternal(u), openPath: (p) => require('electron').shell.openPath(p) }; // (electron on use: dev/boot-test.js reads this file in plain Node)
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const CDP = require('./chrome-cdp');

let dataDir = () => path.join(__dirname, 'data');
let getWin = () => null;
const st = { found: undefined, foundAt: 0, browser: null, port: null, child: null, plain: null, connecting: null };
const keys = new Map(); // 'app:suno' / 'agent:<id>' → targetId (the Chrome window Hearth opened for it)

const profileDir = () => process.env.HEARTH_CHROME_PROFILE || path.join(dataDir(), 'chrome', 'profile');
const prefsFile = () => path.join(dataDir(), 'chrome-prefs.json');
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const extraFlags = () => String(process.env.HEARTH_CHROME_FLAGS || '').split(/\s+/).filter(Boolean);
const toHub = (data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('chrome:event', data); };

// ---------- preferences: which apps open in Chrome ('chrome' | 'hearth'; none = automatic) ----------
function prefs() { const p = readJson(prefsFile(), {}); return { apps: p.apps || {}, browser: p.browser || null }; }
function setPref(kind, id, value) {
  const p = readJson(prefsFile(), {});
  const k = kind === 'browser' ? null : 'apps';
  if (!k) p.browser = value || null;
  else { p[k] ||= {}; if (value === 'chrome' || value === 'hearth') p[k][id] = value; else delete p[k][id]; }
  try { fs.mkdirSync(path.dirname(prefsFile()), { recursive: true }); fs.writeFileSync(`${prefsFile()}.tmp`, JSON.stringify(p, null, 1)); fs.renameSync(`${prefsFile()}.tmp`, prefsFile()); } catch (err) { return { ok: false, error: err.message }; }
  if (kind === 'browser') st.found = undefined;
  return { ok: true, prefs: prefs() };
}

// ---------- finding it ----------
async function found({ fresh = false } = {}) {
  if (!fresh && st.found !== undefined && Date.now() - st.foundAt < 60000) return st.found;
  st.found = await CDP.find({ prefer: prefs().browser }).catch(() => null);
  st.foundAt = Date.now();
  return st.found;
}
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.unref(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const live = () => Boolean(st.browser && !st.browser.closed);

async function status({ fresh = false } = {}) {
  const f = await found({ fresh });
  if (!live()) await attachExisting().catch(() => null);
  let pages = [];
  if (live()) { try { pages = await st.browser.pages(); } catch { /* closing */ } }
  return {
    found: f ? { name: f.name, kind: f.kind, path: f.path } : null,
    running: live() || Boolean(st.plain && st.plain.exitCode == null),
    controlled: live(), plain: Boolean(st.plain && st.plain.exitCode == null && !live()),
    profile: profileDir(), port: live() ? st.port : null, browser: live() ? st.browser.info?.browser || '' : '',
    pages: pages.length, windows: [...keys.entries()].map(([key, id]) => ({ key, id, page: pages.find((p) => p.id === id) || null })).filter((x) => x.page),
    prefs: prefs(), testBase: process.env.HEARTH_CHROME_TEST_BASE || null, // (dev/checks/chrome.js: the local test pages)
  };
}

// (Chrome binds its debugging port to 127.0.0.1 only; the owner's everyday profile never gets one)
// a Hearth Chrome that's still open from before (Hearth restarted): its port is written in the profile
async function attachExisting() {
  const port = CDP.activePort(profileDir());
  if (!port || !(await CDP.version(port))) return null;
  return connect(port);
}
async function connect(port) {
  const b = await CDP.Browser.connect(port);
  st.browser = b; st.port = port;
  b.c.on('close', () => { if (st.browser === b) { st.browser = null; st.port = null; keys.clear(); toHub({ type: 'closed' }); } });
  b.c.send('Target.setDiscoverTargets', { discover: true }).catch(() => {});
  b.c.on('Target.targetDestroyed', ({ targetId }) => { for (const [k, id] of keys) if (id === targetId) { keys.delete(k); toHub({ type: 'window', key: k, state: 'closed' }); } });
  return b;
}
function run(f, args) {
  const child = spawn(f.path, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
  return child;
}
const baseArgs = () => [`--user-data-dir=${profileDir()}`, '--no-first-run', '--no-default-browser-check', ...extraFlags()];
const urlArg = (url, app) => (url ? [app ? `--app=${url}` : url] : []);

// Chrome with Hearth's hand on it: started (or found running) with its debugging port, connected
async function ensure({ url = null, app = false } = {}) {
  if (live()) return { browser: st.browser, opened: false };
  if (st.connecting) return st.connecting;
  st.connecting = (async () => {
    const f = await found();
    if (!f) throw new Error('Google Chrome isn\'t installed on this computer (Microsoft Edge or Brave work too). Install Chrome, then try again.');
    if (await attachExisting()) return { browser: st.browser, opened: false };
    fs.mkdirSync(profileDir(), { recursive: true });
    const port = await freePort();
    try { fs.rmSync(path.join(profileDir(), 'DevToolsActivePort'), { force: true }); } catch { /* none */ }
    st.child = run(f, [...baseArgs(), `--remote-debugging-port=${port}`, ...urlArg(url, app)]);
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const p = (await CDP.version(port)) ? port : CDP.activePort(profileDir());
      if (p && await CDP.version(p)) { await connect(p); toHub({ type: 'started' }); return { browser: st.browser, opened: Boolean(url) }; }
      if (st.child.exitCode != null && Date.now() - t0 > 3000) break; // handed over to a Chrome already open on this profile (without Hearth's hand)
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('The Hearth Chrome is open without Hearth\'s hand on it (you signed in that way, or it started before Hearth). Close its windows once, then try again.');
  })().finally(() => { st.connecting = null; });
  return st.connecting;
}

// ---------- windows ----------
const sameSite = (a, b) => { const h = (u) => CDP.hostOf(u).replace(/^www\./, ''); const x = h(a); const y = h(b); return Boolean(x) && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)); };
// open (or bring forward) the Chrome window for a key: app windows as Chrome app windows (--app), else a tab
async function openWindow({ key, url, app = true, go = false } = {}) {
  if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, error: 'Only web addresses open in Chrome' };
  try {
    const { browser, opened } = await ensure({ url, app });
    let pages = await browser.pages();
    let id = key ? keys.get(key) : null;
    if (id && !pages.some((p) => p.id === id)) { keys.delete(key); id = null; }
    const claimed = new Set(keys.values());
    if (!id && key) id = pages.find((p) => !claimed.has(p.id) && sameSite(p.url, url))?.id || null; // (Hearth restarted: the window is still there)
    if (id) {
      if (go) await (await browser.page(id)).navigate(url, { wait: false }).catch(() => {});
      await browser.activate(id).catch(() => {});
      if (key) keys.set(key, id);
      return { ok: true, id, reused: true };
    }
    if (opened) { pages = await browser.pages(); id = pages.find((p) => sameSite(p.url, url))?.id || pages.at(-1)?.id; } // the first start opened it
    if (!id) {
      // a second start on the same profile hands its --app window to the running Chrome: that's an app window
      const before = new Set(pages.map((p) => p.id));
      const f = await found();
      if (app && f) run(f, [...baseArgs(), ...urlArg(url, true)]);
      const t0 = Date.now();
      while (app && !id && Date.now() - t0 < 8000) {
        await new Promise((r) => setTimeout(r, 200));
        const fresh = (await browser.pages()).filter((p) => !before.has(p.id));
        id = (fresh.find((p) => sameSite(p.url, url)) || fresh[0])?.id || null;
      }
      if (!id) id = await browser.open(url, { newWindow: true }); // (a plain window when that didn't work)
    }
    if (key) keys.set(key, id);
    await browser.activate(id).catch(() => {});
    toHub({ type: 'window', key, state: 'opened' });
    return { ok: true, id };
  } catch (err) { return { ok: false, error: err.message }; }
}
const idOf = (ref) => keys.get(ref) || ref;
async function page(ref) {
  if (!live()) { await attachExisting().catch(() => null); if (!live()) throw new Error('The Hearth Chrome isn\'t open'); }
  const id = idOf(ref);
  if (!(await st.browser.pages()).some((p) => p.id === id)) { for (const [k, v] of keys) if (v === id) keys.delete(k); throw new Error('That Chrome window was closed'); }
  return st.browser.page(id);
}
const hasWindow = async (key) => { if (!live() || !keys.has(key)) return false; try { return (await st.browser.pages()).some((p) => p.id === keys.get(key)); } catch { return false; } };

// one thing done on a page: what the AI tools and the app windows' buttons use
async function pageOp(ref, op, a = {}) {
  try {
    if (op === 'pages') { await ensure(); return { ok: true, value: (await st.browser.pages()).map((p) => ({ ...p, key: [...keys].find(([, v]) => v === p.id)?.[0] || null })) }; }
    if (op === 'open') return openWindow({ key: ref || null, url: a.url, app: a.app !== false, go: true });
    const p = await page(ref);
    switch (op) {
      case 'go': await p.navigate(a.url, { wait: a.wait !== false }); return { ok: true, value: { url: await p.url().catch(() => a.url), title: await p.title().catch(() => '') } };
      case 'wait': return { ok: true, value: a.selector ? await p.waitFor(a.selector, Math.min(60000, Number(a.timeout) || 15000)) : await p.waitLoad(Math.min(60000, Number(a.timeout) || 20000)) };
      case 'info': return { ok: true, value: { url: await p.url(), title: await p.title() } };
      case 'title': return { ok: true, value: await p.title() };
      case 'text': { const t = await p.text(a.selector, a.max); return t == null ? { ok: false, error: `Nothing matches ${a.selector}` } : { ok: true, value: t }; }
      case 'click': await p.click(a.selector); return { ok: true, value: `Clicked ${a.selector}` };
      case 'type': await p.type(a.selector, a.text ?? '', { append: Boolean(a.append) }); if (a.enter) await p.key('Enter'); return { ok: true, value: `Typed ${String(a.text ?? '').length} characters` };
      case 'key': await p.key(a.key || 'Enter'); return { ok: true, value: 'done' };
      case 'eval': return { ok: true, value: await p.evaluate(String(a.expr || 'null')) }; // (Hearth's own scripts: AppsCore.fillScript…)
      case 'shot': return { ok: true, value: await p.shot({ maxWidth: Number(a.maxWidth) || 1600 }), mime: 'image/jpeg' };
      case 'reload': await p.reload(); return { ok: true };
      case 'back': return { ok: await p.back() };
      case 'forward': return { ok: await p.forward() };
      case 'show': await st.browser.activate(p.id); return { ok: true };
      case 'close': await st.browser.close(p.id); for (const [k, v] of keys) if (v === p.id) keys.delete(k); return { ok: true };
      default: return { ok: false, error: `Unknown Chrome action ${op}` };
    }
  } catch (err) { return { ok: false, error: err.message }; }
}

// ---------- the owner's own ways in ----------
// the page in the owner's everyday Chrome (their own profile and logins; Hearth has no hand on it)
async function everyday(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, error: 'Not a web address' };
  const f = await found();
  if (!f) { shell.openExternal(String(url)); return { ok: true, how: 'browser' }; }
  if (process.platform === 'darwin') {
    const bundle = f.path.split('/Contents/MacOS/')[0];
    run({ path: '/usr/bin/open' }, ['-a', bundle, String(url)]);
  } else run(f, [String(url)]);
  return { ok: true, how: f.name };
}
// sign in to Google in the Hearth Chrome. plain: without Hearth's hand on it (if Google still refuses with it): the
// Hearth Chrome is closed and opened again on Google's page with no debugging port; the next time Hearth needs it,
// it opens it again with its hand on it (the sign-in stays in the profile)
async function signIn({ plain = false, url = 'https://accounts.google.com/' } = {}) {
  if (!plain) return openWindow({ key: 'signin', url, app: false });
  const f = await found();
  if (!f) return { ok: false, error: 'Google Chrome isn\'t installed on this computer.' };
  if (live()) { await st.browser.closeAll(); st.browser?.disconnect(); st.browser = null; keys.clear(); await new Promise((r) => setTimeout(r, 1500)); }
  fs.mkdirSync(profileDir(), { recursive: true });
  st.plain = run(f, [...baseArgs(), url]);
  return { ok: true, plain: true };
}
async function quit() { if (live()) { await st.browser.closeAll(); return { ok: true }; } return { ok: false, error: 'The Hearth Chrome isn\'t open' }; }
function revealProfile() { fs.mkdirSync(profileDir(), { recursive: true }); shell.openPath(profileDir()); return { ok: true }; }

// ---------- IPC (the hub page) ----------
let registered = false;
function register(ipcMain, deps = {}) {
  if (deps.dataDir) dataDir = () => deps.dataDir;
  if (deps.getWin) getWin = deps.getWin;
  if (registered) return;
  registered = true;
  ipcMain.handle('chrome:status', (_e, o) => status(o || {}));
  ipcMain.handle('chrome:open', (_e, o) => openWindow(o || {}));
  ipcMain.handle('chrome:page', (_e, ref, op, a) => pageOp(ref, String(op || ''), a || {}));
  ipcMain.handle('chrome:everyday', (_e, url) => everyday(url));
  ipcMain.handle('chrome:signIn', (_e, o) => signIn(o || {}));
  ipcMain.handle('chrome:quit', () => quit());
  ipcMain.handle('chrome:profile', () => revealProfile());
  ipcMain.handle('chrome:pref', (_e, kind, id, value) => (kind ? setPref(kind, id, value) : prefs()));
}
function init(deps = {}) { if (deps.dataDir) dataDir = () => deps.dataDir; if (deps.getWin) getWin = deps.getWin; }

module.exports = { register, init, status, found, ensure, openWindow, pageOp, hasWindow, everyday, signIn, prefs, setPref, googleOnly: CDP.googleOnly, keys };
