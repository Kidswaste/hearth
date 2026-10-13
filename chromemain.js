// Hearth's Chrome, main side (round 30, chrome stream). The owner: "every Google sign-in inside Hearth shows
// 'Couldn't sign you in'… could we just use Chrome and hook into Chrome?" Yes: where Google sign-in is needed, the
// page opens in the owner's real Google Chrome (Edge / Brave when there's no Chrome), in a profile of Hearth's own
// (data/chrome/profile: Chrome 136+ refuses remote control of the everyday profile, and the owner's own tabs stay
// theirs). The owner signs in to Google once there, in Chrome's own window; it stays signed in. Hearth drives it through
// the DevTools protocol on a free port bound to 127.0.0.1 (chrome-cdp.js): app windows open as Chrome app windows
// (--app=, no tabs or address bar, so they look like Hearth's), and the AI tools read, click, type and take pictures
// there the same way they do in Hearth's own windows (appsmain.js).
// Loaded on first use (main.js lazyIpc) or by appsmain.js when an app opens in Chrome. Never sees a password.
// (round 31, chromeview) The owner: "open the chrome browser in the background… I should only interact with it to
// login, then I wanna do everything within the app". So the Hearth Chrome now runs out of sight: started with no window
// (--no-startup-window), each page in a window of its own placed far off-screen (still rendering: the background
// throttling flags are off), and Hearth shows and drives the pages in its own windows (chromeviewmain.js: Chrome
// views). The only time a Chrome window comes on screen is signing in (signIn: the page's own window moves on screen,
// and back out of sight once the page leaves the sign-in page or the owner says "I'm signed in"), or with AI setup's
// Chrome › "Show Chrome" (for debugging). Popups a page opens become another Chrome view (the 'popup' event); a link
// that opened as a tab gets a window of its own (a background tab would stop drawing).
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
const events = new (require('events'))(); // (round 31) 'created' / 'popup' / 'reveal' / 'conceal' / 'destroyed' / 'info' / 'signed-in' for chromeviewmain.js
events.setMaxListeners(50);
const signing = new Map(); // (round 31) target id → { key, temp, saw, opener } while its window is on screen for a sign-in
const keys = new Map(); // 'app:suno' / 'agent:<id>' → targetId (the Chrome window Hearth opened for it)

const profileDir = () => process.env.HEARTH_CHROME_PROFILE || path.join(dataDir(), 'chrome', 'profile');
const prefsFile = () => path.join(dataDir(), 'chrome-prefs.json');
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const extraFlags = () => String(process.env.HEARTH_CHROME_FLAGS || '').split(/\s+/).filter(Boolean);
const toHub = (data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('chrome:event', data); };

// ---------- preferences: which apps open in Chrome ('chrome' | 'hearth'; none = automatic) ----------
// (round 31) show: Chrome's windows on screen (AI setup › Chrome › Show Chrome, for debugging); off: out of sight
function prefs() { const p = readJson(prefsFile(), {}); return { apps: p.apps || {}, browser: p.browser || null, show: Boolean(p.show) }; }
const hidden = () => !prefs().show && !process.env.HEARTH_CHROME_SHOW;
function setPref(kind, id, value) {
  const p = readJson(prefsFile(), {});
  const k = kind === 'browser' || kind === 'show' ? null : 'apps';
  if (kind === 'show') p.show = Boolean(value);
  else if (!k) p.browser = value || null;
  else { p[k] ||= {}; if (value === 'chrome' || value === 'hearth') p[k][id] = value; else delete p[k][id]; }
  try { fs.mkdirSync(path.dirname(prefsFile()), { recursive: true }); fs.writeFileSync(`${prefsFile()}.tmp`, JSON.stringify(p, null, 1)); fs.renameSync(`${prefsFile()}.tmp`, prefsFile()); } catch (err) { return { ok: false, error: err.message }; }
  if (kind === 'browser') st.found = undefined;
  if (kind === 'show') applyShow().catch(() => {});
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

async function status(o = {}) {
  const { fresh = false } = o;
  const f = await found({ fresh });
  if (!live()) await attachExisting().catch(() => null);
  let pages = [];
  if (live()) { try { pages = await st.browser.pages(); } catch { /* closing */ } }
  if (o.bounds && live()) { for (const p of pages) { try { p.bounds = (await st.browser.windowOf(p.id)).bounds; } catch { /* closing */ } } } // (round 31) where each window is (dev/checks/chromeview.js: off-screen)
  return {
    all: o.bounds ? pages.map((p) => ({ id: p.id, url: p.url, bounds: p.bounds || null, key: [...keys].find(([, v]) => v === p.id)?.[0] || null })) : undefined,
    found: f ? { name: f.name, kind: f.kind, path: f.path } : null,
    running: live() || Boolean(st.plain && st.plain.exitCode == null),
    controlled: live(), plain: Boolean(st.plain && st.plain.exitCode == null && !live()),
    profile: profileDir(), port: live() ? st.port : null, browser: live() ? st.browser.info?.browser || '' : '',
    pages: pages.length, windows: [...keys.entries()].map(([key, id]) => ({ key, id, page: pages.find((p) => p.id === id) || null })).filter((x) => x.page),
    hidden: hidden(), signing: [...signing].map(([id, x]) => ({ id, key: x.key })),
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
  b.c.on('Target.targetDestroyed', ({ targetId }) => {
    for (const [k, id] of keys) if (id === targetId) { keys.delete(k); toHub({ type: 'window', key: k, state: 'closed' }); }
    events.emit('destroyed', targetId);
    if (signing.has(targetId)) { const x = signing.get(targetId); signing.delete(targetId); if (!x.opener && ![...signing.values()].some((y) => !y.opener)) { toHub({ type: 'signed-in', key: x.key, how: 'closed' }); events.emit('signed-in', x.key); } }
  });
  // (round 31) windows pages open (popups, links as tabs) and where pages go (a sign-in finishing)
  b.c.on('Target.targetCreated', ({ targetInfo }) => { if (targetInfo?.type === 'page') created(b, targetInfo).catch(() => {}); });
  b.c.on('Target.targetInfoChanged', ({ targetInfo }) => { if (targetInfo?.type === 'page') { events.emit('info', targetInfo); watchSignIn(targetInfo); } });
  return b;
}
function run(f, args) {
  const child = spawn(f.path, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
  return child;
}
// (round 31) pages keep drawing in windows nobody sees (Hearth's views show them); never --enable-automation (the
// "controlled by automated software" bar, navigator.webdriver): it's the owner's real Chrome with its normal user agent
const KEEP_DRAWING = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const OFF = { left: -24000, top: -24000, width: 1280, height: 860 }; // far off every screen (a Windows / Mac desktop spans less)
const HIDE_ARGS = () => ['--no-startup-window', `--window-position=${OFF.left},${OFF.top}`, `--window-size=${OFF.width},${OFF.height}`];
const baseArgs = () => [`--user-data-dir=${profileDir()}`, '--no-first-run', '--no-default-browser-check', ...KEEP_DRAWING, ...extraFlags()];
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
    const out = hidden();
    st.child = run(f, [...baseArgs(), `--remote-debugging-port=${port}`, ...(out ? HIDE_ARGS() : urlArg(url, app))]);
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const p = (await CDP.version(port)) ? port : CDP.activePort(profileDir());
      if (p && await CDP.version(p)) { await connect(p); toHub({ type: 'started' }); return { browser: st.browser, opened: Boolean(url) && !out }; }
      if (st.child.exitCode != null && Date.now() - t0 > 3000) break; // handed over to a Chrome already open on this profile (without Hearth's hand)
      // (round 33, macpolish) killed by macOS at once (Gatekeeper: a Chrome downloaded and never opened): said plainly
      if (process.platform === 'darwin' && st.child.signalCode === 'SIGKILL') break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (process.platform === 'darwin' && (st.child.signalCode || st.child.exitCode)) {
      const why = require('./macpolish').plainError('', { bin: f.path, signal: st.child.signalCode || '' });
      if (why) throw new Error(why.action === 'unquarantine' ? `${why.text} Open ${f.name} once from Applications, or press Allow (Hearth shows the command first: ${why.command}).` : `macOS stopped ${f.name} right as it started (a damaged copy). Reinstall it from google.com/chrome, then try again.`);
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
      if (!hidden()) await browser.activate(id).catch(() => {}); // (out of sight: Hearth's view shows it; activating would pull Chrome forward)
      if (key) keys.set(key, id);
      return { ok: true, id, reused: true };
    }
    if (hidden()) { // (round 31) a window of its own, off-screen from its first frame
      id = await browser.open(url, { background: true, bounds: offBounds() });
      if (key) keys.set(key, id);
      await conceal(id).catch(() => {}); // (a Chrome too old to place it at once)
      toHub({ type: 'window', key, state: 'opened' });
      return { ok: true, id };
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
      case 'show': { // (round 31) out of sight: Hearth shows its view (the app window / the website chat) instead
        if (hidden() && !signing.has(p.id)) { const key = [...keys].find(([, v]) => v === p.id)?.[0] || null; toHub({ type: 'show', key, id: p.id }); return { ok: true, view: true }; }
        await st.browser.activate(p.id); return { ok: true };
      }
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
// (round 31) not plain: the sign-in window comes on screen (a view's own page when key is given: it continues in the
// view afterwards), and goes back out of sight once the page leaves the sign-in page, or signInDone()
async function signIn({ plain = false, url = null, key = null, stay = false } = {}) {
  if (!plain) return revealFor({ key, url, stay });
  url = url || 'https://accounts.google.com/';
  const f = await found();
  if (!f) return { ok: false, error: 'Google Chrome isn\'t installed on this computer.' };
  if (live()) { await st.browser.closeAll(); st.browser?.disconnect(); st.browser = null; keys.clear(); await new Promise((r) => setTimeout(r, 1500)); }
  fs.mkdirSync(profileDir(), { recursive: true });
  st.plain = run(f, [...baseArgs(), url]);
  return { ok: true, plain: true };
}
// ---------- (round 31) out of sight, on screen for a sign-in ----------
let screenOf = () => { try { const { screen } = require('electron'); return screen.getPrimaryDisplay().workArea; } catch { return { x: 0, y: 0, width: 1440, height: 900 }; } };
let offN = 0;
const offBounds = () => { offN = (offN + 1) % 8; return { ...OFF, left: OFF.left + offN * 40, top: OFF.top + offN * 40 }; };
function onBounds(n = 0) {
  const wa = screenOf();
  const width = Math.min(1180, Math.max(640, wa.width - 120)); const height = Math.min(880, Math.max(480, wa.height - 100));
  return { left: Math.round(wa.x + (wa.width - width) / 2 + n * 28), top: Math.round(wa.y + Math.max(20, (wa.height - height) / 3) + n * 28), width, height };
}
const isOff = (b) => Boolean(b) && (b.left + b.width < -2000 || b.top + b.height < -2000);
async function conceal(id) { if (!live()) return; const { bounds } = await st.browser.windowOf(id); if (!isOff(bounds)) await st.browser.place(id, offBounds()); }
async function reveal(id, n = 0) { if (!live()) return; await st.browser.place(id, onBounds(n)); }
const testHosts = () => String(process.env.HEARTH_CHROME_REJECT_HOSTS || '').split(',').map((x) => x.trim()).filter(Boolean);
const signInPage = (url) => require('./chromeview-core').signInPage(url, testHosts());
// a window opened by a page (a popup, or a link that opened as a tab)
async function created(b, info) {
  const id = info.targetId; const opener = info.openerId || null;
  events.emit('created', info);
  if (opener && signing.has(opener)) { signing.set(id, { key: signing.get(opener).key, opener }); return; } // (a sign-in popup stays on screen)
  if (!hidden()) return;
  let w = null; let ow = null;
  try { w = await b.windowOf(id); } catch { return; }
  if (opener) { try { ow = await b.windowOf(opener); } catch { /* gone */ } }
  if (ow && w && ow.windowId === w.windowId) {
    // a tab beside its opener: the opener's page would stop drawing behind it. It gets a window of its own instead.
    let url = info.url && info.url !== 'about:blank' ? info.url : '';
    const t0 = Date.now();
    while (!url && Date.now() - t0 < 2500) { await new Promise((r) => setTimeout(r, 120)); const t = (await b.pages().catch(() => [])).find((p) => p.id === id); if (!t) return; if (t.url && t.url !== 'about:blank') url = t.url; }
    if (!/^https?:/i.test(url)) return;
    const nid = await b.open(url, { background: true, bounds: offBounds() });
    await b.close(id).catch(() => {});
    events.emit('popup', { opener, id: nid, url, tab: true });
    toHub({ type: 'popup', opener, id: nid });
    return;
  }
  if (!isOff(w?.bounds)) await b.place(id, offBounds()).catch(() => {});
  if (opener) { events.emit('popup', { opener, id, url: info.url || '' }); toHub({ type: 'popup', opener, id }); }
}
function watchSignIn(info) {
  const x = signing.get(info.targetId);
  if (!x || x.opener) return;
  const url = info.url || '';
  if (signInPage(url)) { x.saw = true; return; }
  if (x.saw && /^https?:/i.test(url)) signInDone({ id: info.targetId, how: 'left' }).catch(() => {});
}
async function revealFor({ key = null, url = null, stay = false } = {}) {
  try {
    const { browser } = await ensure();
    const google = 'https://accounts.google.com/ServiceLogin';
    let id = key ? keys.get(key) : null;
    if (id && !(await browser.pages()).some((p) => p.id === id)) { keys.delete(key); id = null; }
    let temp = false;
    if (!id) {
      if (key && !url) return { ok: false, error: 'That page isn\'t open in the Hearth Chrome' };
      id = await browser.open(url || google, { bounds: onBounds(signing.size) });
      temp = !key; if (key) keys.set(key, id);
    } else {
      const now = (await browser.pages()).find((p) => p.id === id)?.url || '';
      // a page not on a sign-in page: Google's sign-in for a Google site (back to the page after); any other site shows
      // as it is (its own "Log in" / "Continue with Google"), and "I'm signed in" ends it if no sign-in page shows
      const g = CDP.googleOnly(now) || /(^|\.)google\.com$/.test(CDP.hostOf(now));
      if (!signInPage(now) && (url || g)) { const target = url || `${google}?continue=${encodeURIComponent(now)}`; await (await browser.page(id)).navigate(target, { wait: false }).catch(() => {}); }
    }
    events.emit('reveal', id); // (its view lets go of the page's size first: the window shows the page as it is)
    const now = (await browser.pages()).find((p) => p.id === id)?.url || url || '';
    signing.set(id, { key, temp, saw: Boolean(signInPage(now)) || Boolean(url && signInPage(url)) || (!key && !stay), opener: null }); // (stay: "Open the Hearth Chrome", on screen until Done)
    await reveal(id, signing.size - 1);
    await browser.activate(id).catch(() => {});
    toHub({ type: 'signing', key, id });
    return { ok: true, id, signing: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
// the sign-in is over (the page left the sign-in page, or the owner said so): its window goes back out of sight (a
// window opened only for signing in closes), the view carries on with the page
async function signInDone({ id = null, key = null, how = 'said' } = {}) {
  const ids = [...signing].filter(([tid, x]) => (!id && !key) || tid === id || (key && x.key === key) || (id && x.opener === id)).map(([tid]) => tid);
  if (!ids.length) return { ok: false, error: 'Nothing is signing in' };
  let k = key;
  for (const tid of ids) {
    const x = signing.get(tid); signing.delete(tid);
    if (!x.opener) k = k || x.key;
    if (x.temp) { await st.browser?.close(tid).catch(() => {}); continue; }
    if (hidden()) await conceal(tid).catch(() => {});
    if (!x.opener) events.emit('conceal', tid);
  }
  toHub({ type: 'signed-in', key: k, how });
  events.emit('signed-in', k);
  return { ok: true, key: k };
}
// "Show Chrome" changed: every window on screen (cascaded), or back out of sight
async function applyShow() {
  if (!live()) return;
  const pages = await st.browser.pages();
  let n = 0;
  for (const p of pages) { if (signing.has(p.id)) continue; if (hidden()) await conceal(p.id).catch(() => {}); else await reveal(p.id, n++ % 8).catch(() => {}); }
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
  ipcMain.handle('chrome:signedIn', (_e, o) => signInDone(o || {})); // (round 31) "I'm signed in"
  quitWithHearth();
}
// (round 31) a Chrome nobody can see doesn't outlive Hearth (one on screen, "Show Chrome", stays the owner's)
let quitHooked = false;
function quitWithHearth() {
  if (quitHooked) return;
  quitHooked = true;
  try { require('electron').app?.on?.('before-quit', () => { if (live() && hidden() && !signing.size) st.browser.closeAll(); }); } catch { /* plain Node (tests) */ }
}
function init(deps = {}) { if (deps.dataDir) dataDir = () => deps.dataDir; if (deps.getWin) getWin = deps.getWin; if (deps.screen) screenOf = deps.screen; quitWithHearth(); }
// (round 31) the page behind a key or a target id, attached (chromeviewmain.js)
async function attach(ref) { if (!live()) await ensure(); return page(ref); }
const browser = () => (live() ? st.browser : null);
const keyOf = (id) => [...keys].find(([, v]) => v === id)?.[0] || null;

module.exports = { register, init, status, found, ensure, openWindow, pageOp, hasWindow, everyday, signIn, signInDone, prefs, setPref, googleOnly: CDP.googleOnly, keys, events, attach, browser, keyOf, hidden, signing, conceal, reveal, testHosts };
