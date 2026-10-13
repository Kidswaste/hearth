// Chrome views, main side (round 31, chromeview stream). The owner: "open the chrome browser in the background or like
// don't necessarily show it to me, you can have your own client and use it that's fine but I should only interact with
// it to login then I wanna do everything within the app". The Hearth Chrome runs out of sight (chromemain.js); this
// is Hearth's own client for its pages: a Chrome view in a Hearth window (an app window, a website chat) shows a page
// and the owner uses it there.
//   frames: Page.startScreencast (JPEG, sized to the view at the screen's pixel ratio: chrome-cdp.js Screencast), each
//           frame acked once the view drew it (≤ 30 a second, fewer when drawing is slow), none at all while the view
//           is hidden (the screencast stops: no CPU spent on a page nobody looks at)
//   input:  the view maps mouse / wheel / keys / text (chromeview-core.js) and sends Input.* calls here (a short list
//           of allowed methods, nothing else reaches Chrome from a view)
//   the page's address, title, back / forward, loading; its cursor under the mouse; a right-click menu of Hearth's
//   own unless the page has one; downloads → Downloads/Hearth/<App> (like Hearth's app windows); a file picker → Hearth's
//   own file dialog; a popup → another Chrome view; signing in → the page's Chrome window comes on screen, then goes
//   back (chromemain.js signIn), the view waits meanwhile.
// Loaded on first use (main.js lazyIpc). Never sees a password: key presses go to the page like a keyboard's would.
// Tests: HEARTH_CHROME_TEST_BASE enables cview:test (the next file picker's answer, without a dialog).
const fs = require('fs');
const path = require('path');
const CDP = require('./chrome-cdp');
const Core = require('./chromeview-core');

let deps = { dataDir: null, getWin: () => null };
const C = () => { const m = require('./chromemain'); m.init({ dataDir: deps.dataDir || undefined, getWin: deps.getWin }); return m; };
const views = new Map(); // view id → { id, wc, target, page, cast, visible, size, label, app, key, frames, url, title }
const byTarget = new Map(); // target id → view id (one view shows a page at a time: the latest)
const pageSetup = new WeakSet(); // pages whose file picker / events are Hearth's
let hooked = null; // the browser whose events are wired
const downloads = new Map(); // guid → { d, staged, target }
const chooserAnswers = []; // (tests) the next file pickers' answers
const INPUT = new Set(['Input.dispatchMouseEvent', 'Input.dispatchKeyEvent', 'Input.insertText', 'Input.imeSetComposition']);

const send = (v, type, data = {}) => { try { if (v.wc && !v.wc.isDestroyed()) v.wc.send('cview:event', { view: v.id, type, ...data }); } catch { /* gone */ } };
const viewOf = (targetId) => views.get(byTarget.get(targetId));

// ---------- the browser's events (once per connection) ----------
function wire() {
  const m = C();
  const b = m.browser();
  if (!b || hooked === b) return;
  hooked = b;
  // where downloads land first (named by Chrome's guid), then moved into Downloads/Hearth/<App>
  const staging = path.join(deps.dataDir || path.join(__dirname, 'data'), 'chrome', 'downloads');
  try { fs.mkdirSync(staging, { recursive: true }); } catch { /* read-only */ }
  b.c.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: staging, eventsEnabled: true }).catch(() => {});
  b.c.on('Browser.downloadWillBegin', (p) => downloadBegins(p, staging));
  b.c.on('Browser.downloadProgress', (p) => downloadProgress(p));
  b.c.on('Page.screencastVisibilityChanged', () => {});
  b.c.on('Page.fileChooserOpened', (p, sid) => chooser(p, sid).catch(() => {}));
  b.c.on('Page.frameStartedLoading', (p, sid) => { const v = bySession(sid); if (v && p.frameId === v.target) send(v, 'loading', { on: true }); });
  b.c.on('Page.frameStoppedLoading', (p, sid) => { const v = bySession(sid); if (v && p.frameId === v.target) { send(v, 'loading', { on: false }); navState(v); } });
  b.c.on('Page.navigatedWithinDocument', (p, sid) => { const v = bySession(sid); if (v && p.frameId === v.target) navState(v, p.url); });
  b.c.on('Page.frameNavigated', (p, sid) => { const v = bySession(sid); if (v && !p.frame?.parentId) navState(v, p.frame?.url); });
  b.c.on('close', () => { if (hooked === b) hooked = null; for (const v of views.values()) { v.cast?.dispose(); v.cast = null; v.page = null; send(v, 'closed', { why: 'chrome' }); } byTarget.clear(); });
}
const bySession = (sid) => { for (const v of views.values()) if (v.page?.sid === sid) return v; return null; };
function hookEvents() {
  const ev = C().events;
  if (ev.__cview) return;
  ev.__cview = true;
  ev.on('popup', ({ opener, id, url }) => { const v = viewOf(opener); if (v) send(v, 'popup', { id, url: url || '' }); });
  ev.on('destroyed', (id) => { const v = viewOf(id); if (v) { byTarget.delete(id); v.cast?.dispose(); v.cast = null; v.page = null; send(v, 'closed', { why: 'page' }); } });
  ev.on('info', (t) => { const v = viewOf(t.targetId); if (v && (t.url !== v.url || t.title !== v.title)) navState(v, t.url, t.title); });
  ev.on('reveal', (id) => { const v = viewOf(id); if (v) { v.signing = true; v.cast?.stop({ clear: true }).catch(() => {}); send(v, 'signing', { on: true }); } });
  ev.on('conceal', (id) => { const v = viewOf(id); if (v) { v.signing = false; if (v.visible) startCast(v).catch(() => {}); send(v, 'signing', { on: false }); } });
}

// ---------- a view ----------
let navTimer = new Map();
function navState(v, url, title) {
  if (url) v.url = url;
  if (title != null) v.title = title;
  clearTimeout(navTimer.get(v.id));
  navTimer.set(v.id, setTimeout(async () => {
    navTimer.delete(v.id);
    if (!v.page) return;
    let back = false; let fwd = false;
    try { const h = await v.page.send('Page.getNavigationHistory'); back = h.currentIndex > 0; fwd = h.currentIndex < (h.entries?.length || 0) - 1; const e = h.entries?.[h.currentIndex]; if (e) { v.url = e.url || v.url; v.title = e.title || v.title; } } catch { /* navigating */ }
    send(v, 'nav', { url: v.url, title: v.title || '', back, forward: fwd, signIn: Core.signInPage(v.url, C().testHosts()), address: Core.address(v.url) });
  }, 60));
}
function sizeOf(o = {}) { return Core.frameSize(o.width || 800, o.height || 600, o.dpr || 1); }
async function startCast(v) {
  if (!v.page || v.signing) return;
  if (!v.cast) {
    v.cast = new CDP.Screencast(v.page, {
      maxFps: 30, quality: 72,
      onFrame: (data, meta) => {
        v.frames += 1;
        try { if (v.wc && !v.wc.isDestroyed()) v.wc.send('cview:frame', { view: v.id, data: Buffer.from(data, 'base64'), meta: { deviceWidth: meta.deviceWidth, deviceHeight: meta.deviceHeight, offsetTop: meta.offsetTop || 0, pageScaleFactor: meta.pageScaleFactor || 1 } }); } catch { /* gone */ }
      },
    });
  }
  const s = v.size;
  await v.cast.start({ width: s.width, height: s.height, scale: s.scale });
}
async function setupPage(page) {
  if (pageSetup.has(page)) return;
  pageSetup.add(page);
  // a file picker the page opens goes to Hearth's own dialog (Chrome's would open on a window nobody sees)
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
}
async function start(wc, id, o = {}) {
  hookEvents();
  const m = C();
  let target = o.id || null;
  try {
    if (o.key) {
      target = m.keys.get(o.key) || null;
      const alive = target && (await m.ensure().then(({ browser }) => browser.pages())).some((p) => p.id === target);
      if (!alive) {
        if (!/^https?:/i.test(String(o.url || ''))) return { ok: false, error: 'Nothing to show (no address)' };
        const r = await m.openWindow({ key: o.key, url: o.url, app: true });
        if (!r.ok) return r;
        target = r.id;
      }
    }
    if (!target) return { ok: false, error: 'No page to show' };
    wire();
    const page = await m.attach(target);
    await setupPage(page);
    const prev = viewOf(target);
    if (prev && prev.id !== id) { prev.cast?.dispose(); prev.cast = null; prev.page = null; send(prev, 'detached', {}); }
    const old = views.get(id);
    if (old && old.target !== target) { old.cast?.dispose(); old.cast = null; if (byTarget.get(old.target) === id) byTarget.delete(old.target); }
    const v = { id, wc, target, page, cast: old?.target === target ? old.cast : null, visible: o.visible !== false, size: sizeOf(o), label: o.label || '', app: o.app || null, key: o.key || m.keyOf(target), frames: old?.frames || 0, url: '', title: '' };
    views.set(id, v);
    byTarget.set(target, id);
    if (!wc.__cviewHooked) { wc.__cviewHooked = true; wc.once('destroyed', () => { for (const x of [...views.values()]) if (x.wc === wc) stop(x.id); }); }
    if (v.visible) await startCast(v);
    const info = await page.send('Runtime.evaluate', { expression: '[location.href, document.title]', returnByValue: true }).catch(() => null);
    navState(v, info?.result?.value?.[0] || '', info?.result?.value?.[1] || '');
    return { ok: true, id: target, key: v.key, signing: m.signing.has(target) };
  } catch (err) { return { ok: false, error: err.message }; }
}
async function stop(id, { close = false } = {}) {
  const v = views.get(id);
  if (!v) return { ok: false };
  views.delete(id);
  if (byTarget.get(v.target) === id) byTarget.delete(v.target);
  const cast = v.cast; v.cast = null;
  if (cast) { await cast.stop({ clear: !close }).catch(() => {}); cast.dispose(); }
  if (close) await C().browser()?.close(v.target).catch(() => {});
  return { ok: true };
}
async function visible(id, on, size) {
  const v = views.get(id);
  if (!v) return { ok: false };
  v.visible = Boolean(on);
  if (size) v.size = sizeOf(size);
  if (!v.visible) { await v.cast?.stop().catch(() => {}); return { ok: true, on: false }; }
  await startCast(v).catch(() => {});
  return { ok: true, on: true };
}
async function resize(id, size) {
  const v = views.get(id);
  if (!v) return { ok: false };
  v.size = sizeOf(size);
  if (v.cast && v.visible && !v.signing) await v.cast.resize({ width: v.size.width, height: v.size.height, scale: v.size.scale }).catch(() => {});
  return { ok: true, size: v.size };
}
function input(id, list) {
  const v = views.get(id);
  if (!v?.page || v.signing || !Array.isArray(list)) return;
  for (const x of list.slice(0, 40)) if (x && INPUT.has(x.m) && x.p && typeof x.p === 'object') v.page.send(x.m, x.p).catch(() => {});
}
async function nav(id, op, url) {
  const v = views.get(id);
  if (!v?.page) return { ok: false, error: 'The page isn\'t open' };
  try {
    if (op === 'back') return { ok: await v.page.back() };
    if (op === 'forward') return { ok: await v.page.forward() };
    if (op === 'reload') { await v.page.reload(); return { ok: true }; }
    if (op === 'stop') { await v.page.send('Page.stopLoading'); return { ok: true }; }
    if (op === 'go') {
      let u = String(url || '').trim();
      if (!/^[a-z]+:/i.test(u)) u = /\s/.test(u) || !/\./.test(u) ? `https://www.google.com/search?q=${encodeURIComponent(u)}` : `https://${u}`;
      if (!/^https?:/i.test(u)) return { ok: false, error: 'Only web addresses' };
      await v.page.navigate(u, { wait: false }); return { ok: true, url: u };
    }
    if (op === 'copy') { const r = await v.page.evaluate('String(getSelection() || "")'); return { ok: true, value: r }; }
    if (op === 'select-all') { await v.page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: process.platform === 'darwin' ? 4 : 2, commands: ['selectAll'] }); await v.page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }); return { ok: true }; }
    if (op === 'open-link' && /^https?:/i.test(String(url))) { // a link in a view of its own (right-click › Open in a new view)
      const b = C().browser();
      const nid = await b.open(String(url), { background: true, bounds: { left: -24000, top: -24000, width: 1280, height: 860 } });
      send(v, 'popup', { id: nid, url: String(url) });
      return { ok: true, id: nid };
    }
    return { ok: false, error: `Unknown ${op}` };
  } catch (err) { return { ok: false, error: err.message }; }
}
// the page's own cursor under the mouse (asked a few times a second at most, only while the mouse moves)
async function cursor(id, x, y) {
  const v = views.get(id);
  if (!v?.page) return 'default';
  try { return Core.cursorOf(await v.page.evaluate(Core.cursorExpr(x, y), { timeout: 1500 })); } catch { return 'default'; }
}
// right-click: the page's own menu when it has one (it handled the contextmenu event), else what Hearth's menu needs
const MENU_EXPR = (x, y) => `(() => { const n = document.elementFromPoint(${Number(x) || 0}, ${Number(y) || 0}); if (!n) return { handled: false }; const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, clientX: ${Number(x) || 0}, clientY: ${Number(y) || 0}, button: 2, buttons: 2, view: window }); const handled = !n.dispatchEvent(ev); const a = n.closest('a[href]'); const img = n.closest('img'); const ed = n.closest('input,textarea,[contenteditable=""],[contenteditable=true]'); return { handled, link: a ? a.href : null, image: img ? (img.currentSrc || img.src) : null, editable: Boolean(ed), selection: String(getSelection() || '').slice(0, 4000) }; })()`;
async function menu(id, x, y) {
  const v = views.get(id);
  if (!v?.page) return { handled: false };
  try { return await v.page.evaluate(MENU_EXPR(x, y), { timeout: 2000 }) || { handled: false }; } catch { return { handled: false }; }
}

// ---------- file pickers → Hearth's own dialog ----------
async function chooser(p, sid) {
  const v = bySession(sid);
  const pg = v?.page || [...views.values()].find((x) => x.page?.sid === sid)?.page;
  if (!pg) return;
  let files = null;
  if (chooserAnswers.length) files = chooserAnswers.shift();
  else {
    const { dialog, BrowserWindow } = require('electron');
    const parent = v?.wc && !v.wc.isDestroyed() ? BrowserWindow.fromWebContents(v.wc) : deps.getWin();
    const r = await dialog.showOpenDialog(parent, { title: `${v?.label || 'The page'} asks for a file`, properties: p.mode === 'selectMultiple' ? ['openFile', 'multiSelections'] : ['openFile'] });
    files = r.canceled ? [] : r.filePaths;
  }
  if (v) send(v, 'chooser', { n: files.length });
  if (!files.length) return; // (cancelled: the page's input stays as it was)
  try { await pg.send('DOM.setFileInputFiles', { files, backendNodeId: p.backendNodeId }); } catch { await pg.send('DOM.enable').catch(() => {}); await pg.send('DOM.setFileInputFiles', { files, backendNodeId: p.backendNodeId }).catch(() => {}); }
}

// ---------- downloads → Downloads/Hearth/<App> ----------
// appsmain.js keeps the list (an app window's ⤓, the hub's "→ Lab / board" offer); a website chat's go under its name
function sink() { try { return require('./appsmain').chromeDownloads || null; } catch { return null; } }
function downloadBegins(p, staging) {
  const v = viewOf(p.frameId) || [...views.values()].find((x) => x.visible) || null;
  const key = v?.key || C().keyOf(p.frameId) || '';
  const appId = v?.app || (/^app:/.test(key) ? key.slice(4) : /^agent:/.test(key) ? key.slice(6) : 'chrome');
  const name = v?.label || appId;
  const d = { id: `c${p.guid.slice(0, 12)}`, app: appId, appName: name, name: String(p.suggestedFilename || 'download'), path: '', state: 'progressing', received: 0, total: 0, url: p.url, at: Date.now(), chrome: true };
  downloads.set(p.guid, { d, staged: path.join(staging, p.guid), view: v?.id || null });
  sink()?.report?.(d);
  if (v) send(v, 'download', { d: { ...d } });
}
let dlLast = 0;
function downloadProgress(p) {
  const x = downloads.get(p.guid);
  if (!x) return;
  const { d } = x;
  d.received = p.receivedBytes || d.received; d.total = p.totalBytes || d.total;
  if (p.state === 'inProgress') { if (Date.now() - dlLast > 400) { dlLast = Date.now(); sink()?.report?.(d); } return; }
  downloads.delete(p.guid);
  if (p.state === 'completed') {
    try {
      const dir = sink()?.dir?.(d.appName) || path.join(require('electron').app.getPath('downloads'), 'Hearth', d.appName.replace(/[^\w .-]/g, '_'));
      fs.mkdirSync(dir, { recursive: true });
      const parsed = path.parse(d.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'download');
      let target = path.join(dir, parsed.base);
      for (let n = 1; fs.existsSync(target); n += 1) target = path.join(dir, `${parsed.name} (${n})${parsed.ext}`);
      try { fs.renameSync(x.staged, target); } catch { fs.copyFileSync(x.staged, target); fs.rmSync(x.staged, { force: true }); }
      Object.assign(d, { state: 'completed', path: target, name: path.basename(target) });
    } catch (err) { Object.assign(d, { state: 'failed', error: err.message }); }
  } else d.state = p.state === 'canceled' ? 'cancelled' : 'interrupted';
  sink()?.report?.(d);
  const v = views.get(x.view);
  if (v) send(v, 'download', { d: { ...d } });
}

// ---------- tests / numbers ----------
async function info() {
  const out = { views: [...views.values()].map((v) => ({ id: v.id, target: v.target, key: v.key, visible: v.visible, casting: Boolean(v.cast?.on), frames: v.frames, fps: v.cast?.pacer.fps || 0, bytes: v.cast?.bytes || 0, size: v.size, url: v.url, signing: Boolean(v.signing) })) };
  try { const b = C().browser(); if (b) { const r = await b.c.send('SystemInfo.getProcessInfo', {}, null, { timeout: 4000 }); out.chromeCpu = (r.processInfo || []).reduce((a, x) => a + (x.cpuTime || 0), 0); } } catch { /* older Chrome */ }
  try { const ms = require('electron').app.getAppMetrics(); out.hearthCpu = ms.reduce((a, x) => a + (x.cpu?.cumulativeCPUUsage || 0), 0); out.byType = {}; for (const x of ms) out.byType[x.type] = (out.byType[x.type] || 0) + (x.cpu?.cumulativeCPUUsage || 0); } catch { /* plain Node */ }
  return out;
}

// ---------- IPC ----------
let registered = false;
function register(ipcMain, d = {}) {
  if (d && typeof d === 'object') deps = { ...deps, ...d };
  if (registered) return;
  registered = true;
  ipcMain.handle('cview:start', (e, id, o) => start(e.sender, String(id), o || {}));
  ipcMain.handle('cview:stop', (_e, id, o) => stop(String(id), o || {}));
  ipcMain.handle('cview:visible', (_e, id, on, size) => visible(String(id), on, size));
  ipcMain.handle('cview:resize', (_e, id, size) => resize(String(id), size || {}));
  ipcMain.handle('cview:nav', (_e, id, op, url) => nav(String(id), String(op || ''), url));
  ipcMain.handle('cview:cursor', (_e, id, x, y) => cursor(String(id), x, y));
  ipcMain.handle('cview:menu', (_e, id, x, y) => menu(String(id), x, y));
  ipcMain.handle('cview:signIn', (_e, id, o = {}) => { const v = views.get(String(id)); if (!v) return { ok: false, error: 'No view' }; const m = C(); let key = v.key; if (!key) { key = `view:${v.target}`; m.keys.set(key, v.target); v.key = key; } return m.signIn({ key, url: o.url || null }); });
  ipcMain.handle('cview:signedIn', (_e, id) => { const v = views.get(String(id)); return C().signInDone(v ? { id: v.target } : {}); });
  ipcMain.handle('cview:info', () => info());
  ipcMain.handle('cview:test', (_e, op, a) => { if (!process.env.HEARTH_CHROME_TEST_BASE) return { ok: false }; if (op === 'chooser') { chooserAnswers.push((a || []).map(String)); return { ok: true }; } return { ok: false }; });
  ipcMain.on('cview:input', (_e, id, list) => input(String(id), list));
  ipcMain.on('cview:ack', (_e, id, ms) => { const v = views.get(String(id)); v?.cast?.ack(Number(ms) || 0); });
}

module.exports = { register, start, stop, visible, resize, input, nav, info, _test: { MENU_EXPR, views } };
