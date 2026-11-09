// (Nov 9, labplayer) Hearth's Lab player: the Lab preview page (tools/three-sandbox.html) in its OWN Electron app, so
// it has its own graphics process. In one app every window queues its drawing in one graphics process, and a heavy
// scene there made Hearth's whole interface wait (measured: 166 → 84 fps, stutters to 92 ms); in its own process
// Windows shares the card between the two (131 fps, 58 ms at worst).
// Started and driven by labplayermain.js over Node IPC (serialization 'advanced': a song's bytes pass as they are).
// The window: frameless, no taskbar entry, never takes the focus (Hearth keeps the keyboard; the mouse reaches the
// scene), placed over the Lab's preview area and kept just above Hearth's window (moveAbove), hidden when told.
//   in  { op: 'load', url } · { op: 'to', msg } (to the page) · { op: 'place', bounds, above } · { op: 'hide' } · { op: 'quit' }
//   out { op: 'ready' } · { op: 'from', msg } (from the page) · { op: 'gone', why } (the page's process ended)
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
// the page loads three.js from hearth-three://library/<version>/… (offline-library.js): served here too, from Hearth's
// own kept copies in its data folder (handed over at start); without it the page waited for three.js forever
protocol.registerSchemesAsPrivileged([{ scheme: 'hearth-three', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

app.setName('Hearth Lab Player');
app.setPath('userData', path.join(app.getPath('appData'), 'Hearth Lab Player'));
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
let win = null; let lastUrl = null; let placed = false;

function make() {
  win = new BrowserWindow({
    show: false, frame: false, skipTaskbar: true, focusable: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    hasShadow: false, roundedCorners: false, backgroundColor: '#000000', title: 'Hearth Lab Player',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.setMenu(null);
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
  win.on('closed', () => { win = null; });
}

ipcMain.on('lp:from', (_e, msg) => send({ op: 'from', msg }));

process.on('message', (m) => {
  if (!m || typeof m !== 'object') return;
  if (m.op === 'quit') { app.quit(); return; }
  if (!win) return;
  if (m.op === 'load') { lastUrl = m.url; win.loadURL(m.url).catch(() => {}); return; }
  if (m.op === 'to') { try { win.webContents.send('lp:to', m.msg); } catch { /* loading */ } return; }
  if (m.op === 'place') {
    const b = m.bounds;
    if (!b || b.width < 2 || b.height < 2) { win.hide(); placed = false; return; }
    win.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
    if (m.above) { try { win.moveAbove(m.above); } catch { /* the id went stale: next time */ } }
    if (!win.isVisible()) win.showInactive();
    placed = true;
    return;
  }
  if (m.op === 'hide') { if (placed) win.hide(); placed = false; }
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
