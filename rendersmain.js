// The render queue's main side (round 13, renders.js is the renderer side): runs a queued ffmpeg job through
// aemain's own runner (the same `video:job-event` events, the same job id, so every caller listening keeps working),
// pauses and resumes it (macOS / Linux: the process is suspended and continues where it was; Windows has no suspend
// signal, so a paused job is stopped quietly and starts again from the top when resumed), cancels it, relays an event
// for a job that never reached ffmpeg (a queued job that failed to start or was cancelled while waiting) and says
// which encoders this ffmpeg has (ProRes, VP9, Opus… for the presets that need them).
const { execFile } = require('child_process');
const aemain = require('./aemain');

const IS_WIN = process.platform === 'win32';
const paused = new Map(); // job id → 'suspend' | 'restart'
const quiet = new Set(); // job ids whose next 'done' is a pause on Windows (not an end)
let encCache = null; // { ffmpeg path, at, list }

function register(ipcMain, getWin, settings) {
  const send = (ev) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('video:job-event', ev); };
  const over = (o) => ({ ffmpeg: (o && o.ffmpeg) || settings().ffmpegPath || undefined });
  const child = (id) => aemain._jobs?.get(String(id)) || null;

  ipcMain.handle('renders:run', (_e, job, overrides) => {
    paused.delete(job.id);
    return aemain.transcode(job, (ev) => {
      if (ev.type === 'done' && quiet.has(ev.id)) { quiet.delete(ev.id); send({ id: ev.id, type: 'paused', mode: 'restart' }); return; }
      if (ev.type === 'done') paused.delete(ev.id);
      send(ev);
    }, over(overrides));
  });
  ipcMain.handle('renders:pause', (_e, id) => {
    const c = child(id);
    if (!c) return { ok: false, error: 'not running' };
    if (IS_WIN) { quiet.add(String(id)); paused.set(String(id), 'restart'); try { c.kill(); } catch { /* gone */ } return { ok: true, mode: 'restart' }; }
    try { c.kill('SIGSTOP'); paused.set(String(id), 'suspend'); return { ok: true, mode: 'suspend' }; } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('renders:resume', (_e, id) => {
    const c = child(id);
    if (!c || paused.get(String(id)) !== 'suspend') return { ok: false, mode: paused.get(String(id)) || null };
    try { c.kill('SIGCONT'); paused.delete(String(id)); return { ok: true, mode: 'suspend' }; } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('renders:cancel', (_e, id) => {
    const c = child(id);
    paused.delete(String(id)); quiet.delete(String(id));
    if (!c) return false;
    // a suspended process ignores SIGTERM until it runs again
    if (!IS_WIN) { try { c.kill('SIGCONT'); } catch { /* not stopped */ } }
    try { c.kill(); } catch { /* gone */ }
    return true;
  });
  // an event for a job that never reached ffmpeg, so its callers hear the end like any other
  ipcMain.handle('renders:relay', (_e, ev) => { if (ev && ev.id && ['done', 'progress', 'queued'].includes(ev.type)) send(ev); return true; });
  ipcMain.handle('renders:encoders', (_e, overrides) => {
    const { ffmpeg } = aemain.ffStatus(over(overrides));
    if (!ffmpeg) return { ffmpeg: null, list: [] };
    if (encCache && encCache.ffmpeg === ffmpeg && Date.now() - encCache.at < 10 * 60000) return encCache;
    return new Promise((resolve) => {
      execFile(ffmpeg, ['-hide_banner', '-encoders'], { timeout: 8000, windowsHide: true, maxBuffer: 4 << 20 }, (err, out) => {
        const list = err ? [] : [...String(out).matchAll(/^\s*[VAS][.\w]{5}\s+(\S+)/gm)].map((m) => m[1]);
        encCache = { ffmpeg, at: Date.now(), list };
        resolve(encCache);
      });
    });
  });
}

module.exports = { register };
