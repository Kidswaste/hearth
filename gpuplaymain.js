// 📈 Test play performance (round 76, gpuplay76), the main process's side (lazyIpc: loaded on the first test). Read-only
// facts the game's page can't see, asked twice per test (its start: mark; its end: everything):
//   gpuplay:facts ({ mark }) → { platform, os, cpu, versions, display (the game's screen: hz, size, scale, primary),
//     displays, gpus (getGPUInfo basic: vendor, device, active, virtual), procs (each process's processor use over the
//     test, % of one core: the game's page, Hearth's window, the GPU process, the main process), Windows only: hags
//     (hardware-accelerated GPU scheduling), pref (Windows' graphics preference for Hearth), windowed (optimizations
//     for windowed games) }
//   gpuplay:copy (text)  → the clipboard (the game window or Hearth may not have the focus a web clipboard needs)
//   gpuplay:display      → Windows' / the Mac's display settings (the refresh rate and the main display live there)
// Nothing is written anywhere, nothing is sent anywhere; the registry is only read (reg query, 3 s at most each).
const os = require('os');

const VIRTUAL = new Set([0, 0x1414, 0x15ad, 0x80ee, 0x1ae0, 0x1af4, 0x1234, 0x1b36]);
const VENDOR = { 0x10de: 'NVIDIA', 0x1002: 'AMD', 0x1022: 'AMD', 0x8086: 'Intel', 0x106b: 'Apple', 0x5143: 'Qualcomm', 0x13b5: 'Arm' };
let ctx = null;
let mark = null; // { at, cpu: Map pid → cumulative CPU seconds (or null) }

const regQuery = (key, value) => new Promise((resolve) => {
  if (process.platform !== 'win32') { resolve(null); return; }
  try {
    require('child_process').execFile('reg', ['query', key, '/v', value], { windowsHide: true, timeout: 3000 }, (err, out) => { // winmac-ok: Windows-only (guarded above), reg.exe is a system tool
      if (err) { resolve(null); return; }
      const m = /REG_\w+\s+(.*)$/m.exec(String(out || ''));
      resolve(m ? m[1].trim() : null);
    });
  } catch { resolve(null); }
});
// "GpuPreference=2;" → plain words (what Settings › System › Display › Graphics shows)
const prefWords = (v) => { const m = /GpuPreference=(\d)/.exec(String(v || '')); return m ? ({ 0: 'Let Windows decide', 1: 'Power saving', 2: 'High performance' }[m[1]] || `GpuPreference=${m[1]}`) : 'not set'; };
const flag = (v, name) => { const m = new RegExp(`${name}=(\\d)`).exec(String(v || '')); return m ? m[1] === '1' : null; };

function cpuNow(app) {
  const m = new Map();
  try { for (const p of app.getAppMetrics()) m.set(p.pid, { type: p.type, cum: Number.isFinite(p.cpu?.cumulativeCPUUsage) ? p.cpu.cumulativeCPUUsage : null, pct: Number(p.cpu?.percentCPUUsage) || 0 }); } catch { /* none */ }
  return m;
}
const gameInfo = () => { try { return require('./gamemodemain').info(); } catch { return null; } };

async function facts(o = {}) {
  const { app, screen } = require('electron');
  if (o.mark) { mark = { at: Date.now(), cpu: cpuNow(app) }; return { ok: true }; }
  const g = gameInfo() || {};
  const hub = ctx?.getWin?.();
  const pids = { game: g.pid || null, hub: hub && !hub.isDestroyed() ? hub.webContents.getOSProcessId() : null };
  const now = cpuNow(app); const secs = mark ? Math.max(0.5, (Date.now() - mark.at) / 1000) : 0;
  const use = (pid) => { const a = now.get(pid); if (!a) return null; const b = mark?.cpu.get(pid); if (b && a.cum != null && b.cum != null && secs) return Math.round(((a.cum - b.cum) / secs) * 1000) / 10; return Math.round(a.pct * 10) / 10; };
  const byType = (t) => [...now.entries()].find(([, v]) => v.type === t)?.[0];
  const procs = { game: pids.game ? use(pids.game) : null, hub: pids.hub ? use(pids.hub) : null, gpu: byType('GPU') ? use(byType('GPU')) : null, browser: byType('Browser') ? use(byType('Browser')) : null };
  let displays = []; let primary = null;
  try {
    primary = screen.getPrimaryDisplay();
    displays = screen.getAllDisplays().map((d) => ({ id: d.id, label: d.label || '', hz: Math.round(d.displayFrequency || 0), w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor), scale: d.scaleFactor, primary: d.id === primary.id }));
  } catch { displays = []; }
  const gd = g.display ? displays.find((d) => d.id === g.display.id) : null;
  const display = gd || (g.display ? { id: g.display.id, label: g.display.label, hz: g.display.hz, w: g.display.w, h: g.display.h, scale: g.display.scale, primary: primary ? g.display.id === primary.id : null } : displays.find((d) => d.primary) || null);
  let gpus = [];
  try {
    const info = await app.getGPUInfo('basic');
    gpus = (info?.gpuDevice || []).map((d) => ({ vendor: VENDOR[d.vendorId] || `0x${Number(d.vendorId || 0).toString(16)}`, device: `0x${Number(d.deviceId || 0).toString(16)}`, name: d.deviceString || '', active: Boolean(d.active), driver: d.driverVersion || '', virtual: VIRTUAL.has(Number(d.vendorId) || 0) }));
  } catch { gpus = []; }
  const out = {
    platform: process.platform, os: `${os.type()} ${os.release()}`, cpu: `${os.cpus()?.[0]?.model?.trim() || '?'} ×${os.cpus()?.length || 0}`,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome }, display, displays, gpus, procs, secs: Math.round(secs * 10) / 10,
  };
  if (process.platform === 'win32') {
    const [hags, pref, global] = await Promise.all([
      regQuery('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode'),
      regQuery('HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', process.execPath),
      regQuery('HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', 'DirectXUserGlobalSettings'),
    ]);
    out.hags = hags == null ? null : /0x2$/i.test(hags) || hags === '2';
    out.pref = prefWords(pref);
    out.windowed = flag(global, 'SwapEffectUpgradeEnable');
  }
  return out;
}

function register(ipcMain, c = {}) {
  ctx = c;
  const fromHub = (e) => { const w = ctx.getWin?.(); return Boolean(w && !w.isDestroyed() && e.sender === w.webContents); };
  ipcMain.handle('gpuplay:facts', (e, o) => (fromHub(e) ? facts(o || {}) : null));
  ipcMain.handle('gpuplay:copy', (e, text) => { if (!fromHub(e)) return false; require('electron').clipboard.writeText(String(text || '').slice(0, 200000)); return true; });
  ipcMain.handle('gpuplay:display', async (e) => {
    if (!fromHub(e)) return false;
    const { shell } = require('electron');
    const url = process.platform === 'win32' ? 'ms-settings:display' : process.platform === 'darwin' ? 'x-apple.systempreferences:com.apple.Displays-Settings.extension' : '';
    if (!url) return false;
    try { await shell.openExternal(url); return true; } catch { return false; }
  });
}

module.exports = { register, _test: { prefWords, flag } };
