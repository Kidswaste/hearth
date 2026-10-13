// Hearth's Chrome (round 30, chrome stream), the pure part: no Electron, so dev/chrome-test.js runs it in plain Node.
// Google refuses sign-in inside embedded browsers ("Couldn't sign you in — This browser or app may not be secure"),
// whatever user agent they present. So where Google sign-in is needed, Hearth uses the owner's real Google Chrome
// (or Edge / Brave: Chromium browsers Google accepts) with a profile of its own, and drives it through the Chrome
// DevTools Protocol (plain WebSocket JSON, Node's own WebSocket; no dependency).
//   candidates({ platform, env, home })      → where Chrome / Edge / Brave / Chromium usually are, best first
//   find({ platform, env, exists, regQuery }) → the first one installed: { name, kind, path, how } or null
//   googleOnly(url)                          → a site whose sign-in is Google's own (Gemini, AI Studio, YouTube Studio…)
//   isRejection({ url, text, hosts })        → Google's "Couldn't sign you in" page
//   clientHints(version, platform), userAgent(version, platform) → the cheap fix: headers that say "Google Chrome"
//   Client.connect(wsUrl)                    → a CDP connection: send(method, params, sessionId), on(method, fn)
//   Browser.connect(port)                    → pages(), open(url), close(id), activate(id), page(id) → Page
//   Page: navigate, waitLoad, waitFor(selector), evaluate, text, title, url, click(selector), type(selector, text),
//         shot({ maxWidth }), reload, back, forward
//   (round 31, chromeview) Browser.open(url, { bounds }) places a new window (off-screen when Chrome is out of sight),
//   windowOf(id) / place(id, bounds) move a page's window; Screencast(page, { onFrame }) → start / resize / ack / stop:
//   a page's frames sized to a Hearth view (Emulation.setDeviceMetricsOverride), paced by chromeview-core.js's Pacer
// Passwords never pass through here: the owner signs in on Google's own page in Chrome's own window.
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- finding Chrome ----------
const KINDS = { chrome: 'Google Chrome', edge: 'Microsoft Edge', brave: 'Brave', chromium: 'Chromium' };
function candidates({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  const out = [];
  const add = (kind, p) => { if (p && !out.some((c) => c.path === p)) out.push({ kind, name: KINDS[kind], path: p }); };
  if (platform === 'darwin') {
    const apps = ['/Applications', path.posix.join(home, 'Applications')];
    const mac = [['chrome', 'Google Chrome.app/Contents/MacOS/Google Chrome'], ['edge', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'], ['brave', 'Brave Browser.app/Contents/MacOS/Brave Browser'], ['chromium', 'Chromium.app/Contents/MacOS/Chromium']];
    for (const [kind, rel] of mac) for (const dir of apps) add(kind, path.posix.join(dir, rel));
    // (round 33, macpolish) Chrome Beta / Dev / Canary (and Chrome for Testing) when stable Chrome isn't there (kept after it)
    for (const ch of ['Google Chrome Beta', 'Google Chrome Dev', 'Google Chrome Canary', 'Google Chrome for Testing']) for (const dir of apps) add('chrome', path.posix.join(dir, `${ch}.app/Contents/MacOS/${ch}`));
  } else if (platform === 'win32') {
    const w = path.win32;
    // (round 32, winpolish) Windows' environment ignores case (ProgramFiles / PROGRAMFILES); a 32-bit Hearth sees the
    // 64-bit Program Files only as ProgramW6432; per-user installs live in LocalAppData
    const ev = (n) => { const k = Object.keys(env || {}).find((x) => x.toLowerCase() === n.toLowerCase()); return k ? env[k] : ''; };
    const roots = [...new Set([ev('ProgramW6432'), ev('ProgramFiles') || 'C:\\Program Files', ev('ProgramFiles(x86)') || 'C:\\Program Files (x86)', ev('LOCALAPPDATA') || (home ? w.join(home, 'AppData', 'Local') : null)].filter(Boolean))];
    const win = [['chrome', 'Google\\Chrome\\Application\\chrome.exe'], ['edge', 'Microsoft\\Edge\\Application\\msedge.exe'], ['brave', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'], ['chromium', 'Chromium\\Application\\chrome.exe']];
    for (const [kind, rel] of win) for (const r of roots) add(kind, w.join(r, rel));
    // Chrome Beta / Dev / Canary when stable Chrome isn't there (kept after the stable places)
    for (const rel of ['Google\\Chrome Beta\\Application\\chrome.exe', 'Google\\Chrome Dev\\Application\\chrome.exe', 'Google\\Chrome SxS\\Application\\chrome.exe']) for (const r of roots) add('chrome', w.join(r, rel));
  } else {
    const dirs = String(env.PATH || '/usr/local/bin:/usr/bin:/bin').split(':').filter(Boolean);
    const lin = [['chrome', ['google-chrome', 'google-chrome-stable']], ['edge', ['microsoft-edge', 'microsoft-edge-stable']], ['brave', ['brave-browser', 'brave']], ['chromium', ['chromium', 'chromium-browser']]];
    for (const [kind, names] of lin) {
      if (kind === 'chrome') add(kind, '/opt/google/chrome/chrome');
      for (const n of names) for (const d of dirs) add(kind, path.posix.join(d, n));
    }
  }
  return out;
}
// Windows' own record of where an app is ("App Paths"): read with reg.exe (no native module)
const APP_PATHS = { chrome: 'chrome.exe', edge: 'msedge.exe', brave: 'brave.exe' };
function regQueryDefault(key) {
  return new Promise((resolve) => {
    require('child_process').execFile('reg', ['query', key, '/ve'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      if (err) { resolve(null); return; }
      const m = String(out).match(/REG_(?:EXPAND_)?SZ\s+(.+)/);
      resolve(m ? m[1].trim().replace(/^"|"$/g, '').replace(/%([^%]+)%/g, (_x, v) => process.env[v] || `%${v}%`) : null);
    });
  });
}
async function find({ platform = process.platform, env = process.env, home = os.homedir(), exists = fs.existsSync, regQuery = regQueryDefault, prefer = null } = {}) {
  // HEARTH_CHROME_PATH: a stand-in (tests: Playwright's Chromium launched "as Chrome"), or the owner's own pick
  if (env.HEARTH_CHROME_PATH && exists(env.HEARTH_CHROME_PATH)) return { kind: 'chrome', name: env.HEARTH_CHROME_NAME || 'Google Chrome', path: env.HEARTH_CHROME_PATH, how: 'set' };
  const list = candidates({ platform, env, home });
  if (platform === 'win32') {
    for (const kind of ['chrome', 'edge', 'brave']) {
      for (const hive of ['HKLM', 'HKCU']) {
        const p = await regQuery(`${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${APP_PATHS[kind]}`);
        if (p && !list.some((c) => c.path.toLowerCase() === p.toLowerCase())) list.push({ kind, name: KINDS[kind], path: p, how: 'registry' }); // (sorted by kind below)
      }
    }
  }
  const order = (c) => (prefer && c.kind === prefer ? -1 : Object.keys(KINDS).indexOf(c.kind));
  const hit = list.filter((c) => { try { return exists(c.path); } catch { return false; } }).sort((a, b) => order(a) - order(b))[0];
  return hit ? { how: 'found', ...hit } : null;
}

// ---------- which sites, which pages ----------
// Sites whose only sign-in is a Google account: they open in Chrome by themselves (unless the owner says otherwise)
const GOOGLE_ONLY = /^(gemini|aistudio|notebooklm|labs|docs|drive|mail|photos|keep|calendar|meet|colab\.research|myaccount|accounts|cloud|console\.cloud|ads|analytics|search\.google|jules|stitch|whisk|flow)\.google(\.com)?$|^labs\.google$|^(studio|music)\.youtube\.com$/i;
const hostOf = (u) => { try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ''; } };
const googleOnly = (url) => GOOGLE_ONLY.test(hostOf(url));
const REJECT_URL = /\/(v\d\/)?signin\/(v\d\/)?(rejected|deniedsigninrejected|disallowed)|\/signin\/rejected|deniedsigninrejected/i;
const REJECT_TEXT = /couldn[’'`]?t sign you in|could not sign you in|this browser or app may not be secure|ce navigateur ou cette application ne sont peut-être pas sécurisés|impossible de vous connecter/i;
const REJECT_HOSTS = ['accounts.google.com'];
const rejectHost = (url, hosts = []) => { const h = hostOf(url); return [...REJECT_HOSTS, ...hosts].some((x) => h === x || h.endsWith(`.${x}`)); };
// Google's refusal page: its address says so, or (same host) its words do. text is optional (the address may be enough).
function isRejection({ url, text = '', hosts = [] } = {}) {
  if (!rejectHost(url, hosts)) return false;
  return REJECT_URL.test(String(url)) || REJECT_TEXT.test(String(text).slice(0, 4000));
}

// ---------- the cheap fix: say "Google Chrome" in the client hints too ----------
const PLATFORM = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
function userAgent(version, platform = process.platform) {
  const os0 = platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os0}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${String(version).split('.')[0]}.0.0.0 Safari/537.36`;
}
function clientHints(version, platform = process.platform) {
  const major = String(version).split('.')[0];
  return {
    'sec-ch-ua': `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not)A;Brand";v="24"`,
    'sec-ch-ua-full-version-list': `"Google Chrome";v="${version}", "Chromium";v="${version}", "Not)A;Brand";v="24.0.0.0"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': `"${PLATFORM[platform] || 'Windows'}"`,
  };
}
// headers of one request with the hints put right (the full list only when the page asked for it)
function withHints(headers, version, platform) {
  const h = clientHints(version, platform);
  const out = {};
  let full = false;
  for (const [k, v] of Object.entries(headers || {})) { const l = k.toLowerCase(); if (l === 'sec-ch-ua-full-version-list') full = true; if (!(l in h)) out[k] = v; }
  for (const [k, v] of Object.entries(h)) if (k !== 'sec-ch-ua-full-version-list' || full) out[k] = v;
  return out;
}

// ---------- the protocol ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
class Client {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); this.closed = false;
    ws.onmessage = (m) => {
      let msg; try { msg = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString('utf8')); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id); this.pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message || 'Chrome refused')); else p.resolve(msg.result || {});
        return;
      }
      for (const fn of this.handlers.get(msg.method) || []) { try { fn(msg.params || {}, msg.sessionId || null); } catch { /* a listener's own trouble */ } }
    };
    ws.onclose = () => { this.closed = true; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Chrome closed the connection')); } this.pending.clear(); for (const fn of this.handlers.get('close') || []) fn(); };
  }
  static connect(url, { timeout = 6000, WebSocketImpl = globalThis.WebSocket } = {}) {
    if (!WebSocketImpl) return Promise.reject(new Error('This Node has no WebSocket'));
    return new Promise((resolve, reject) => {
      const ws = new WebSocketImpl(url);
      const t = setTimeout(() => { try { ws.close(); } catch { /* gone */ } reject(new Error('Chrome didn\'t answer')); }, timeout);
      ws.onopen = () => { clearTimeout(t); resolve(new Client(ws)); };
      ws.onerror = (e) => { clearTimeout(t); reject(new Error(`Couldn't reach Chrome (${e?.message || 'connection refused'})`)); };
    });
  }
  send(method, params = {}, sessionId = null, { timeout = 30000 } = {}) {
    if (this.closed) return Promise.reject(new Error('Chrome is closed'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome didn't answer ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, new Set()); this.handlers.get(method).add(fn); return () => this.handlers.get(method)?.delete(fn); }
  once(method, pred = () => true, timeout = 15000) {
    return new Promise((resolve) => {
      let off = null;
      const t = setTimeout(() => { off?.(); resolve(null); }, timeout);
      off = this.on(method, (p, sid) => { if (!pred(p, sid)) return; clearTimeout(t); off(); resolve(p); });
    });
  }
  close() { try { this.ws.close(); } catch { /* gone */ } }
}

async function getJson(port, p, { host = '127.0.0.1', timeout = 2500 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(`http://${host}:${port}${p}`, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
}
const version = (port) => getJson(port, '/json/version');
// the port a running Chrome wrote in its profile ("DevToolsActivePort": the port, then the browser's path)
function activePort(profileDir) {
  try { const [p] = fs.readFileSync(path.join(profileDir, 'DevToolsActivePort'), 'utf8').split(/\r?\n/); const n = Number(p); return n > 0 ? n : null; } catch { return null; }
}

class Page {
  constructor(browser, targetId, sessionId) { this.b = browser; this.id = targetId; this.sid = sessionId; }
  send(m, p, o) { return this.b.c.send(m, p, this.sid, o); }
  async evaluate(expr, { timeout = 30000 } = {}) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, { timeout });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text || 'The page threw an error');
    return r.result?.value;
  }
  async waitLoad(timeout = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await this.evaluate('document.readyState', { timeout: 3000 }) === 'complete') return true; } catch { /* navigating */ }
      await wait(120);
    }
    return false;
  }
  async navigate(url, { wait: w = true, timeout = 20000 } = {}) {
    if (!/^(https?|file|about|data):/i.test(String(url))) throw new Error('Only web addresses can be opened');
    const loaded = w ? this.b.c.once('Page.loadEventFired', (_p, sid) => sid === this.sid, timeout) : null;
    const r = await this.send('Page.navigate', { url: String(url) });
    if (r.errorText) throw new Error(`The page didn't load (${r.errorText})`);
    if (w) { await loaded; await this.waitLoad(4000); }
    return true;
  }
  async waitFor(selector, timeout = 15000) {
    const t0 = Date.now();
    const q = `!!document.querySelector(${JSON.stringify(String(selector))})`;
    while (Date.now() - t0 < timeout) { try { if (await this.evaluate(q, { timeout: 3000 })) return true; } catch { /* navigating */ } await wait(150); }
    return false;
  }
  title() { return this.evaluate('document.title'); }
  url() { return this.evaluate('location.href'); }
  text(selector, max = 20000) {
    return this.evaluate(`(() => { const n = ${selector ? `document.querySelector(${JSON.stringify(String(selector))})` : 'document.body'}; if (!n) return null; return String(n.innerText || n.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, ${Number(max) || 20000}); })()`);
  }
  // a real mouse click in the middle of the element (scrolled into view first), like the owner's own
  async click(selector) {
    const box = await this.evaluate(`(() => { const n = document.querySelector(${JSON.stringify(String(selector))}); if (!n) return null; n.scrollIntoView({ block: 'center', inline: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
    if (!box) throw new Error(`Nothing matches ${selector} on the page`);
    if (!box.w || !box.h) throw new Error(`${selector} is on the page but not visible`);
    const base = { x: box.x, y: box.y, button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    return true;
  }
  // text typed into a box (the box's own text replaced unless append), as if typed: input events fire
  async type(selector, text, { append = false } = {}) {
    const ok = await this.evaluate(`(() => { const n = ${selector ? `document.querySelector(${JSON.stringify(String(selector))})` : 'document.activeElement'}; if (!n) return false; n.focus(); if (!${append ? 'true' : 'false'}) { if (n.select) n.select(); else if (n.isContentEditable) document.execCommand('selectAll'); } return true; })()`);
    if (!ok) throw new Error(selector ? `Nothing matches ${selector} on the page` : 'No box has the keyboard');
    await this.send('Input.insertText', { text: String(text) });
    return true;
  }
  async key(key = 'Enter') {
    const k = { Enter: { code: 'Enter', keyCode: 13, text: '\r' }, Tab: { code: 'Tab', keyCode: 9 }, Escape: { code: 'Escape', keyCode: 27 } }[key] || { code: key, keyCode: 0 };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: k.code, windowsVirtualKeyCode: k.keyCode, ...(k.text ? { text: k.text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: k.code, windowsVirtualKeyCode: k.keyCode });
    return true;
  }
  // a JPEG of what the page shows (at most maxWidth wide): base64
  async shot({ maxWidth = 1600, quality = 82 } = {}) {
    let clip;
    try {
      const m = await this.send('Page.getLayoutMetrics');
      const v = m.cssVisualViewport || m.layoutViewport;
      if (v?.clientWidth > maxWidth) clip = { x: v.pageX || 0, y: v.pageY || 0, width: v.clientWidth, height: v.clientHeight, scale: maxWidth / v.clientWidth };
    } catch { /* the whole page at its size */ }
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality, ...(clip ? { clip } : {}) }, { timeout: 20000 });
    return r.data;
  }
  reload() { return this.send('Page.reload', {}); }
  async history(step) {
    const h = await this.send('Page.getNavigationHistory');
    const e = h.entries?.[h.currentIndex + step];
    if (!e) return false;
    await this.send('Page.navigateToHistoryEntry', { entryId: e.id });
    return true;
  }
  back() { return this.history(-1); }
  forward() { return this.history(1); }
}

class Browser {
  constructor(c, port) { this.c = c; this.port = port; this.sessions = new Map(); c.on('Target.detachedFromTarget', (p) => { for (const [t, s] of this.sessions) if (s === p.sessionId) this.sessions.delete(t); }); }
  static async connect(port, o = {}) {
    const v = await version(port);
    if (!v?.webSocketDebuggerUrl) throw new Error('No Chrome is listening there');
    const b = new Browser(await Client.connect(v.webSocketDebuggerUrl, o), port);
    b.info = { browser: v.Browser || '', protocol: v['Protocol-Version'] || '' };
    return b;
  }
  get closed() { return this.c.closed; }
  async pages() {
    const { targetInfos = [] } = await this.c.send('Target.getTargets');
    return targetInfos.filter((t) => t.type === 'page' && !/^(devtools|chrome-extension):/.test(t.url)).map((t) => ({ id: t.targetId, url: t.url, title: t.title, attached: t.attached }));
  }
  // bounds: { left, top, width, height } for a new window (Chrome 130+ places it there at once: no flash on screen;
  // older ones ignore it and place() moves it right after)
  async open(url, { newWindow = false, background = false, bounds = null } = {}) {
    const { targetId } = await this.c.send('Target.createTarget', { url: String(url || 'about:blank'), newWindow: newWindow || Boolean(bounds), background, ...(bounds || {}) });
    return targetId;
  }
  // (round 31) a page's window and where it is: { windowId, bounds: { left, top, width, height, windowState } }
  windowOf(id) { return this.c.send('Browser.getWindowForTarget', { targetId: id }); }
  async place(id, bounds) {
    const { windowId, bounds: was } = await this.windowOf(id);
    if (was?.windowState && was.windowState !== 'normal') await this.c.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    const { left, top, width, height } = bounds;
    await this.c.send('Browser.setWindowBounds', { windowId, bounds: { left, top, width, height } });
    return windowId;
  }
  async close(id) { this.sessions.delete(id); await this.c.send('Target.closeTarget', { targetId: id }); return true; }
  async activate(id) { await this.c.send('Target.activateTarget', { targetId: id }); return true; }
  async page(id) {
    let sid = this.sessions.get(id);
    if (!sid) {
      ({ sessionId: sid } = await this.c.send('Target.attachToTarget', { targetId: id, flatten: true }));
      this.sessions.set(id, sid);
      await Promise.all([this.c.send('Page.enable', {}, sid), this.c.send('Runtime.enable', {}, sid)]).catch(() => {});
    }
    return new Page(this, id, sid);
  }
  closeAll() { return this.c.send('Browser.close').catch(() => {}); }
  disconnect() { this.c.close(); }
}

// ---------- (round 31, chromeview) a page's frames for a Hearth view ----------
// start({ width, height, scale, quality }): the page's viewport becomes the view's size (CSS pixels) at that pixel
// ratio, and its frames come as JPEGs. Chrome sends the next frame only after the last one is acked: ack() is called
// once Hearth drew it, and the Pacer spaces the acks (≤ maxFps, fewer while drawing is slow). stop(): no more frames
// (a hidden view costs nothing). A frame not acked within a second is acked anyway (a view that stalled).
class Screencast {
  constructor(page, { onFrame = () => {}, maxFps = 30, quality = 70 } = {}) {
    const { Pacer } = require('./chromeview-core');
    this.page = page; this.onFrame = onFrame; this.quality = quality; this.pacer = new Pacer({ maxFps });
    this.on = false; this.size = null; this.pending = null; this.timer = 0; this.watch = 0; this.frames = 0; this.bytes = 0;
    this.off = page.b.c.on('Page.screencastFrame', (p, sid) => this.frame(p, sid));
  }
  frame(p, sid) {
    if (sid !== this.page.sid) return;
    if (!this.on) { this.page.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); return; }
    this.frames += 1; this.bytes += p.data?.length || 0;
    this.pending = p.sessionId;
    clearTimeout(this.watch);
    this.watch = setTimeout(() => this.ack(), 1000);
    try { this.onFrame(p.data, p.metadata || {}); } catch { /* the view's own trouble */ }
  }
  ack(drawMs) {
    if (drawMs != null) this.pacer.drawn(drawMs);
    const sid = this.pending;
    if (sid == null || this.timer) return;
    clearTimeout(this.watch);
    const go = () => { this.timer = 0; if (this.pending !== sid) return; this.pending = null; this.pacer.acked(Date.now()); this.page.send('Page.screencastFrameAck', { sessionId: sid }).catch(() => {}); };
    const d = this.pacer.delay(Date.now());
    if (d > 0) this.timer = setTimeout(go, d); else go();
  }
  async metrics({ width, height, scale = 1 }) {
    await this.page.send('Emulation.setDeviceMetricsOverride', { width: Math.round(width), height: Math.round(height), deviceScaleFactor: scale, mobile: false });
  }
  async start({ width, height, scale = 1, quality = this.quality } = {}) {
    this.size = { width, height, scale, quality };
    await this.metrics(this.size);
    await this.page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    if (this.on) await this.page.send('Page.stopScreencast').catch(() => {});
    this.on = true; this.pending = null; clearTimeout(this.timer); this.timer = 0;
    await this.page.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: Math.round(width * scale), maxHeight: Math.round(height * scale), everyNthFrame: 1 });
  }
  // a new size: the viewport follows; the screencast restarts only when the frames' size cap changed
  async resize(size) {
    const was = this.size || {};
    const s = { ...was, ...size };
    if (!this.on) { this.size = s; return; }
    if (Math.round(s.width * s.scale) === Math.round(was.width * was.scale) && Math.round(s.height * s.scale) === Math.round(was.height * was.scale)) { this.size = s; await this.metrics(s); return; }
    await this.start(s);
  }
  async stop({ clear = false } = {}) {
    const was = this.on;
    this.on = false; clearTimeout(this.timer); clearTimeout(this.watch); this.timer = 0;
    if (was) await this.page.send('Page.stopScreencast').catch(() => {});
    if (this.pending != null) { this.page.send('Page.screencastFrameAck', { sessionId: this.pending }).catch(() => {}); this.pending = null; }
    if (clear) { await this.page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}); await this.page.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {}); }
  }
  dispose() { this.stop().catch(() => {}); this.off?.(); }
}

module.exports = { Screencast, candidates, find, googleOnly, isRejection, rejectHost, hostOf, userAgent, clientHints, withHints, Client, Browser, Page, version, activePort, getJson, KINDS };
