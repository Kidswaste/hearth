// (Nov 9, labplayer) Hearth's Lab player: the Lab preview page (tools/three-sandbox.html) in its OWN Electron app, so
// it has its own graphics process. In one app every window queues its drawing in one graphics process, and a heavy
// scene there made Hearth's whole interface wait (measured: 166 → 84 fps, stutters to 92 ms); in its own process
// Windows shares the card between the two (131 fps, 58 ms at worst).
// Started and driven by labplayermain.js over Node IPC (serialization 'advanced': a song's bytes pass as they are).
// The window: frameless, no taskbar entry, never takes the focus (Hearth keeps the keyboard; the mouse reaches the
// scene), placed over the Lab's preview area and kept just above Hearth's window (moveAbove), hidden when told.
//   in  { op: 'load', url } · { op: 'to', msg } (to the page) · { op: 'place', bounds, above, zoom } · { op: 'hide' } · { op: 'quit' }
//   out { op: 'ready' } · { op: 'from', msg } (from the page) · { op: 'gone', why } (the page's process ended)
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
// the page loads three.js from hearth-three://library/<version>/… (offline-library.js): served here too, from Hearth's
// own kept copies in its data folder (handed over at start); without it the page waited for three.js forever
protocol.registerSchemesAsPrivileged([{ scheme: 'hearth-three', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

app.setName('Hearth Lab Player');
app.setPath('userData', process.env.HEARTH_LP_USERDATA || path.join(app.getPath('appData'), 'Hearth Lab Player')); // (a test copy: its own profile)
// the same switches Hearth runs the Lab with (main.js), and the graphics path it chose (gpu52), handed over at start
app.commandLine.appendSwitch('enable-precise-memory-info');
app.commandLine.appendSwitch('gpu-program-cache-size-kb', '32768');
app.commandLine.appendSwitch('max-active-webgl-contexts', '64');
// (CalculateNativeWinOcclusion off: Windows' occlusion check took this window, laid over Hearth's, for covered and gave
// its page 2 animation frames a second; its own visibility is Hearth's to say: it hides the window when nobody sees it)
const lpDisabled = ['CalculateNativeWinOcclusion'];
try { for (const [n, v] of JSON.parse(process.env.HEARTH_LP_SWITCHES || '[]')) { if (n === 'disable-features') { lpDisabled.push(...String(v || '').split(',').filter(Boolean)); continue; } if (v == null || v === '') app.commandLine.appendSwitch(n); else app.commandLine.appendSwitch(n, v); } } catch { /* none */ }
app.commandLine.appendSwitch('disable-features', [...new Set(lpDisabled)].join(','));

const send = (m) => { try { process.send?.(m); } catch { /* Hearth gone */ } };
let win = null; let lastUrl = null; let placed = false; let shown = false; let zoom = 1;

const applyZoom = () => { try { if (win && Math.abs(win.webContents.getZoomFactor() - zoom) > 1e-4) win.webContents.setZoomFactor(zoom); } catch { /* loading: did-finish-load sets it */ } };
function make() {
  win = new BrowserWindow({
    show: false, frame: false, skipTaskbar: true, focusable: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    hasShadow: false, roundedCorners: false, backgroundColor: '#000000', title: 'Hearth Lab Player',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.setMenu(null);
  if (process.env.HEARTH_LP_MUTE) win.webContents.setAudioMuted(true); // (a test copy's player: dev/smoke.js)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (url !== lastUrl) e.preventDefault(); });
  win.webContents.on('render-process-gone', (_e, d) => send({ op: 'gone', why: d?.reason || 'gone' }));
  // (HEARTH_LP_DEBUG=1: the page's console comes along, for debugging the player)
  if (process.env.HEARTH_LP_DEBUG) {
    win.webContents.on('console-message', (e) => send({ op: 'console', level: e.level, text: String(e.message || '').slice(0, 300) }));
    win.webContents.on('did-fail-load', (_e, code, desc, url) => send({ op: 'console', level: 'error', text: `load failed ${code} ${desc} ${url}` }));
    win.webContents.on('did-finish-load', () => {
      send({ op: 'console', level: 'info', text: `loaded ${win.webContents.getURL().slice(0, 120)}` });
      setTimeout(() => win?.webContents.executeJavaScript('new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); })')
        .then((n) => send({ op: 'console', level: 'info', text: `animation frames in 1 s: ${n} · bounds ${JSON.stringify(win.getBounds())} · visible ${win.isVisible()}` })).catch(() => {}), 2000);
    });
  }
  win.webContents.on('did-finish-load', () => { applyZoom(); setTimeout(applyZoom, 300); });
  win.on('closed', () => { win = null; });
}

ipcMain.on('lp:from', (_e, msg) => send({ op: 'from', msg }));

// (HEARTH_LP_DEBUG=1) what arrived for the page, in short (type, keys, size), and two questions a check may ask: run an
// expression in the page ('eval'), and what the window really shows ('capture': its composited picture, counted)
const DBG = Boolean(process.env.HEARTH_LP_DEBUG); const seen = [];
const brief = (v, d = 0) => (v == null ? String(v) : ArrayBuffer.isView(v) ? `${v.constructor.name}(${v.length})` : v instanceof ArrayBuffer ? `ArrayBuffer(${v.byteLength})` : Array.isArray(v) ? (d > 1 ? `[${v.length}]` : v.slice(0, 12).map((x) => brief(x, d + 1))) : typeof v === 'object' ? (d > 1 ? `{${Object.keys(v).length}}` : Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [k, brief(x, d + 1)]))) : typeof v === 'string' ? (v.length > 60 ? `str(${v.length})` : v) : v);
async function debug(m) {
  if (m.kind === 'seen') return seen.splice(0);
  if (!win) return { error: 'no window' };
  if (m.kind === 'info') return { pid: process.pid, visible: win.isVisible(), bounds: win.getBounds(), content: win.getContentBounds(), zoom: win.webContents.getZoomFactor(), wanted: zoom, gpu: app.getGPUFeatureStatus(), features: app.commandLine.getSwitchValue('disable-features'), hwnd: win.getNativeWindowHandle().readUInt32LE(0) };
  if (m.kind === 'eval') return win.webContents.executeJavaScript(m.code, true).then((value) => ({ value }), (err) => ({ error: String(err?.message || err) }));
  if (m.kind === 'capture') {
    const img = await win.webContents.capturePage(); const { width, height } = img.getSize(); const b = img.toBitmap();
    let lit = 0; let sum = 0; const n = width * height; const cols = new Set();
    for (let i = 0; i < b.length; i += 4) { const v = b[i] + b[i + 1] + b[i + 2]; sum += v; if (v > 30) lit += 1; if (cols.size < 64 && !(i % 404)) cols.add((b[i] >> 4) << 8 | (b[i + 1] >> 4) << 4 | (b[i + 2] >> 4)); }
    if (m.file) require('fs').writeFileSync(m.file, img.toPNG());
    return { width, height, lit: n ? lit / n : 0, mean: n ? sum / n / 3 : 0, colours: cols.size, bounds: win.getBounds(), visible: win.isVisible() };
  }
  return { error: `debug: ${m.kind}?` };
}

process.on('message', (m) => {
  if (!m || typeof m !== 'object') return;
  if (m.op === 'quit') { app.quit(); return; }
  if (m.op === 'debug') { if (DBG) debug(m).then((result) => send({ op: 'debug', id: m.id, result }), (err) => send({ op: 'debug', id: m.id, result: { error: String(err?.message || err) } })); return; }
  if (DBG && m.op === 'to' && seen.length < 4000) seen.push(brief(m.msg));
  if (!win) return;
  if (m.op === 'load') { lastUrl = m.url; win.loadURL(m.url).catch(() => {}); return; }
  if (m.op === 'to') { try { win.webContents.send('lp:to', m.msg); } catch { /* loading */ } return; }
  if (m.op === 'place') {
    const b = m.bounds;
    if (!b || b.width < 2 || b.height < 2) { win.hide(); placed = false; shown = false; return; }
    win.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
    // (Nov 10, labplayer2) an exact frame size (1080p shown smaller): the page is zoomed so it sees the frame's own
    // width and height, as Hearth's scaled frame does
    if (m.zoom > 0) zoom = m.zoom;
    applyZoom(); // (asked of the page each time: a zoom set while a page loads can be dropped)
    // (Nov 10, labplayer2: why scenes were black) shown by Electron FIRST, then moved above Hearth's window. moveAbove
    // also shows the window (SetWindowPos + SWP_SHOWWINDOW), but behind Chromium's back: placed before its page was
    // loaded (Hearth's order: place, load, place) the window was on screen and the page never presented to it: black,
    // 1–5 frames a second (measured; docs/upgrades/labplayer2.md). win.isVisible() said true, so showInactive() never ran.
    if (!shown) { win.showInactive(); shown = true; }
    if (m.above) { try { win.moveAbove(m.above); } catch { /* the id went stale: next time */ } }
    placed = true;
    return;
  }
  if (m.op === 'hide') { if (placed) win.hide(); placed = false; shown = false; }
});

// Hearth gone (its IPC channel closed): the player goes too
process.on('disconnect', () => app.quit());
app.on('window-all-closed', () => app.quit());
app.whenReady().then(() => {
  try {
    const lib = require('../offline-library').create({ dataDir: process.env.HEARTH_LP_DATA || path.join(__dirname, '..', 'data'), fetcher: (url, opts) => net.fetch(url, opts), localDir: process.env.HEARTH_THREE_DIR || '' });
    protocol.handle('hearth-three', (req) => lib.response(req));
  } catch (err) { send({ op: 'console', level: 'error', text: `three.js library: ${err.message}` }); }
  make(); send({ op: 'ready', pid: process.pid });
});
