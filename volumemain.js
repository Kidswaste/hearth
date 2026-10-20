const fs = require('fs'), path = require('path');
let value = .75, file = null;
const listeners = new Set();
const get = () => value;
function init({ app, session, ipcMain, webContents, getWin }) {
  file = path.join(app.getPath('userData'), 'playback-volume.json');
  try { const n = JSON.parse(fs.readFileSync(file, 'utf8')).volume; if (Number.isFinite(n) && n >= 0 && n <= 1) value = n; } catch {}
  const register = ses => ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'volume-preload.js') });
  register(session.defaultSession);
  app.on('session-created', register);
  ipcMain.on('volume:initial', e => { e.returnValue = value; });
  ipcMain.handle('volume:get', () => value);
  ipcMain.handle('volume:set', async (e, n) => {
    if (e.sender !== getWin()?.webContents || e.senderFrame !== e.sender.mainFrame) throw Error('Use Hearth’s volume control.');
    if (!Number.isFinite(n) || n < 0 || n > 1) throw Error('Volume must be between 0 and 100%.');
    // Persist before applying, so a failed save is visible rather than silently forgotten.
    require('./crashsafe-core').writeAtomicSync(fs, file, JSON.stringify({ volume: n }));
    value = n;
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue;
      for (const frame of wc.mainFrame.framesInSubtree) {
        try { frame.send('volume:changed', value); } catch {}
      }
    }
    for (const fn of listeners) { try { fn(value); } catch {} }
    return value;
  });
}
module.exports = { init, get, onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
