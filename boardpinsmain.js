// Pinterest window for the mood board (round 14), main-process side: Pinterest's own search page in a visible Hearth
// window with its own signed-in session (partition 'persist:pinterest'; the owner signs in there, Hearth never sees a
// password). A small sandboxed preload (board-pin-preload.js) puts an "＋ Board" button on the pin under the pointer;
// a click (a real one) sends that pin's picture address, its link and its title here, and they go to the board page
// (board-pins.js), which downloads the picture and keeps the pin's link as the item's source. Nothing is scraped:
// only the pin the owner clicks is read, from the page they are looking at; no Pinterest API is called.
// Required from boardmain.js (registerIpc), so main.js needs no change.
const path = require('path');
// electron is required on first use, so tests can load the pure helpers (searchUrl, okBase, clean) in plain Node
const electron = () => require('electron');

const PARTITION = 'persist:pinterest';
const DEFAULT = 'https://www.pinterest.com/search/pins/?q={q}';
let win = null; let getMain = () => null; let status = { board: '', added: 0 };
let lastDrag = null;

// Pinterest (any country domain) or a local test page; nothing else can be loaded as "the Pinterest window"
function okBase(u) {
  try {
    const x = new URL(String(u).replace('{q}', 'x'));
    if (x.protocol === 'https:' && /(^|\.)pinterest\.[a-z.]{2,8}$/i.test(x.hostname)) return true;
    if (x.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(x.hostname)) return true;
    return x.protocol === 'file:';
  } catch { return false; }
}
function searchUrl(query, base) {
  const b = base && okBase(base) ? String(base) : DEFAULT;
  const q = encodeURIComponent(String(query || '').trim().slice(0, 120));
  if (!q) { try { const u = new URL(b.replace('{q}', '')); return /pinterest\./.test(u.hostname) ? `${u.origin}/` : b.replace('{q}', ''); } catch { return 'https://www.pinterest.com/'; } }
  return b.includes('{q}') ? b.replace('{q}', q) : `${b}${b.includes('?') ? '&' : '?'}q=${q}`;
}
// sign-in popups (Pinterest, Google, Apple, Facebook) open as small windows in the same session; other links go to
// the owner's browser
const SIGN_IN = /^https:\/\/([a-z0-9-]+\.)*(pinterest\.[a-z.]+|google\.com|accounts\.google\.com|appleid\.apple\.com|facebook\.com)\//i;

function prepareSession() {
  const ses = electron().session.fromPartition(PARTITION);
  if (ses.__hearthPins) return ses;
  ses.__hearthPins = true;
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'));
  ses.on('will-download', (e) => e.preventDefault());
  return ses;
}

function open({ query = '', base = null, board = '' } = {}) {
  const url = searchUrl(query, base);
  if (board) status.board = String(board).slice(0, 60);
  if (win && !win.isDestroyed()) {
    win.loadURL(url).catch(() => {});
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    return { ok: true, url, reused: true };
  }
  prepareSession();
  const main = getMain();
  const b = main && !main.isDestroyed() ? main.getBounds() : null;
  win = new (electron().BrowserWindow)({
    width: 1080, height: 820, title: 'Pinterest · Hearth', autoHideMenuBar: true, backgroundColor: '#ffffff',
    ...(b ? { x: Math.round(b.x + Math.max(0, b.width - 1100)), y: b.y + 40 } : {}),
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'board-pin-preload.js'), spellcheck: false },
  });
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url: to }) => {
    if (SIGN_IN.test(to)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false } } };
    if (/^https?:\/\//i.test(to)) electron().shell.openExternal(to).catch(() => {});
    return { action: 'deny' };
  });
  wc.on('did-finish-load', () => sendStatus());
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle(`Pinterest · Hearth${status.board ? ` → ${status.board}` : ''}`); });
  win.on('closed', () => { win = null; });
  win.loadURL(url).catch(() => {});
  return { ok: true, url };
}
function sendStatus() { if (win && !win.isDestroyed()) win.webContents.send('pins:status', status); }

// what the preload sends: checked here (addresses only, short title), then handed to the board page
function clean(d) {
  const u = (x) => { try { const v = new URL(String(x || '')); return /^(https?|file|data):$/.test(v.protocol) ? v.href.slice(0, 4000) : null; } catch { return null; } };
  const image = u(d?.image);
  if (!image || (/^data:/.test(image) && !/^data:image\//.test(image))) return null;
  const link = u(d?.link);
  return { image, link: link && !/^data:/.test(link) ? link : null, title: String(d?.title || '').replace(/\s+/g, ' ').trim().slice(0, 160), w: Number(d?.w) || 0, h: Number(d?.h) || 0 };
}

// the test hook: point at the n-th pin and click its "＋ Board" with real (trusted) input events
async function testClick(n = 0) {
  if (!win || win.isDestroyed()) return { ok: false, error: 'no window' };
  const wc = win.webContents;
  const r = await wc.executeJavaScript(`(() => { const im = [...document.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().width >= 60)[${Number(n) || 0}]; if (!im) return null; im.scrollIntoView({ block: 'center' }); const b = im.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!r) return { ok: false, error: 'no picture', seen: await wc.executeJavaScript(`[...document.images].map((i) => Math.round(i.getBoundingClientRect().width) + ':' + i.complete + ':' + i.naturalWidth).join(' ') + ' ' + innerWidth + 'x' + innerHeight`).catch((e) => e.message) };
  wc.sendInputEvent({ type: 'mouseMove', x: Math.round(r.x), y: Math.round(r.y) });
  await new Promise((res) => setTimeout(res, 250));
  const btn = await wc.executeJavaScript(`(() => { const b = document.querySelector('#hearth-pin-add'); if (!b || b.hidden) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
  if (!btn) return { ok: false, error: 'no button' };
  for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) { wc.sendInputEvent({ type, x: Math.round(btn.x), y: Math.round(btn.y), button: 'left', clickCount: 1 }); await new Promise((res) => setTimeout(res, 40)); }
  return { ok: true };
}

// (round 30, pinboard) "Find images like this": what the window shows now (pinboard-core.js's page script: pictures on
// screen with their links and titles, read only) and one modest step down the page. Never clicks, never types.
async function readPage(op, a = {}) {
  if (!win || win.isDestroyed()) return { ok: false, error: 'The Pinterest window isn\'t open' };
  const wc = win.webContents;
  const t0 = Date.now();
  while (wc.isLoading() && Date.now() - t0 < 12000) await new Promise((r) => setTimeout(r, 150));
  const Core = require('./pinboard-core');
  try { return { ok: true, value: await wc.executeJavaScript(op === 'scroll' ? Core.SCROLL_EXPR : Core.readExpr(a), true) }; } catch (err) { return { ok: false, error: err.message }; }
}

function register(ipcMain, getWin) {
  getMain = getWin || getMain;
  const fromPins = (e) => win && !win.isDestroyed() && e.sender === win.webContents;
  ipcMain.on('pins:add', (e, d) => {
    if (!fromPins(e)) return;
    const pin = clean(d); const m = getMain();
    if (pin && m && !m.isDestroyed()) m.webContents.send('board:pin', pin);
  });
  ipcMain.on('pins:drag', (e, d) => { if (fromPins(e)) { lastDrag = clean(d); const m = getMain(); if (lastDrag && m && !m.isDestroyed()) m.webContents.send('board:pin-drag', lastDrag); } });
  ipcMain.handle('board:pins', async (_e, op, a = {}) => {
    if (op === 'open') return open(a || {});
    if (op === 'close') { if (win && !win.isDestroyed()) win.close(); return { ok: true }; }
    if (op === 'status') { status = { board: String(a?.board || status.board || '').slice(0, 60), added: Number(a?.added) || 0 }; sendStatus(); if (win && !win.isDestroyed()) win.setTitle(`Pinterest · Hearth${status.board ? ` → ${status.board}` : ''}`); return { ok: true }; }
    if (op === 'state') return { open: Boolean(win && !win.isDestroyed()), url: win && !win.isDestroyed() ? win.webContents.getURL() : null, title: win && !win.isDestroyed() ? win.getTitle() : null, partition: PARTITION, lastDrag };
    if (op === 'test-click') return testClick(a?.n);
    if (op === 'url') return { url: searchUrl(a?.query, a?.base) };
    if (op === 'read' || op === 'scroll') return readPage(op, a || {}); // (round 30, pinboard) Find images like this
    return { ok: false, error: `unknown op ${op}` };
  });
}

module.exports = { register, searchUrl, okBase, clean, PARTITION };
