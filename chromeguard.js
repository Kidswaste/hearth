// Google sign-in inside Hearth (round 30, chrome stream), the always-on part (small: the rest is chromemain.js, on use).
// 1. The cheap fix first: Hearth already presents a plain Chrome user agent; Google also reads the client hints
//    (Sec-CH-UA…), where Electron says "Chromium" without "Google Chrome", and on a Mac the old user agent claimed
//    Windows while the hints said macOS. So the user agent now names the real system, and requests to Google's sites
//    carry hints that match it ("Google Chrome", this Chromium's version). Whether Google accepts it can only be seen
//    with a real Google account: when it still refuses, 2. takes over.
// 2. Google's refusal page ("Couldn't sign you in — This browser or app may not be secure") is noticed wherever it
//    shows (an app window, its sign-in popup, a website chat), and the owner is offered "Sign in with Chrome instead"
//    in one click (appsmain.js for app windows, chrome-ui.js in the hub for website chats).
// Tests: HEARTH_CHROME_REJECT_HOSTS="127.0.0.1" lets a local fake refusal page count (dev/checks/chrome.js).
const { app, session, webContents } = require('electron');
const CDP = require('./chrome-cdp');

const version = () => process.versions.chrome || '130.0.0.0';
const userAgent = () => CDP.userAgent(version());
const HINT_URLS = ['*://*.google.com/*', '*://accounts.google.com/*', '*://*.youtube.com/*', '*://*.gstatic.com/*', '*://labs.google/*'];
const TILE_URLS = ['https://tile.openstreetmap.org/*'];
const isTile = url => { try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'tile.openstreetmap.org'; } catch { return false; } };
function requestHeaders(d) {
  if (!isTile(d.url)) return CDP.withHints(d.requestHeaders, version(), process.platform);
  const headers = { ...d.requestHeaders };
  // This native file:// app has no web Referer. Identify it honestly; retain cache validators.
  for (const key of Object.keys(headers)) if (key.toLowerCase() === 'user-agent' || key.toLowerCase().startsWith('sec-ch-ua')) delete headers[key];
  headers['User-Agent'] = 'Hearth/1.0 (+https://github.com/Kidswaste/hearth)';
  return headers;
}
const hooked = new WeakSet();
function hookSession(ses) {
  if (!ses || hooked.has(ses)) return;
  hooked.add(ses);
  // Electron retains only ONE listener per webRequest event, regardless of URL filter.
  // Keep Google hints and the map's native-app identity in the same registration.
  try { ses.webRequest.onBeforeSendHeaders({ urls: [...HINT_URLS, ...TILE_URLS] }, (d, cb) => cb({ requestHeaders: requestHeaders(d) })); } catch { /* a session that can't be hooked */ }
  // A 403/429 can contain a valid PNG; <img>.onerror alone cannot distinguish it from a map.
  // Cancel before decoding, including cached errors. Successful tiles retain Chromium caching.
  try { ses.webRequest.onHeadersReceived({ urls: TILE_URLS }, (d, cb) => cb({ cancel: isTile(d.url) && d.statusCode >= 400 })); } catch { /* a session that can't be hooked */ }
}
const testHosts = () => String(process.env.HEARTH_CHROME_REJECT_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
const openers = new Map(); // a popup's webContents id → the page that opened it
const PROBE = 'String((document.body && document.body.innerText) || "").slice(0, 4000)';

// deps: { onReject(contents, opener, url) }
function setup(deps = {}) {
  app.on('session-created', hookSession);
  app.whenReady().then(() => hookSession(session.defaultSession)).catch(() => {});
  // (round 30 fix) set up after the main window is made (round 29, fastboot): its page is hooked too, not only later ones
  const hook = (contents) => {
    contents.on('did-create-window', (w) => { try { openers.set(w.webContents.id, contents); w.webContents.once('destroyed', () => openers.delete(w.webContents.id)); } catch { /* gone */ } });
    let last = '';
    const check = async () => {
      let url = '';
      try { url = contents.getURL(); } catch { return; }
      if (!CDP.rejectHost(url, testHosts()) || url === last) return;
      let text = '';
      if (!CDP.isRejection({ url, hosts: testHosts() })) { try { text = await contents.executeJavaScript(PROBE, false); } catch { return; } }
      if (!CDP.isRejection({ url, text, hosts: testHosts() })) return;
      last = url;
      try { deps.onReject?.(contents, openers.get(contents.id) || null, url); } catch (err) { console.warn('chromeguard:', err.message); }
    };
    contents.on('did-finish-load', check);
    contents.on('did-navigate-in-page', () => setTimeout(check, 400));
  };
  try { for (const c of webContents.getAllWebContents()) hook(c); } catch { /* not ready */ }
  app.on('web-contents-created', (_e, contents) => hook(contents));
}

module.exports = { setup, userAgent, hookSession };
