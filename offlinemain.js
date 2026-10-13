// (round 34, offline) The main-process side of "calm when things go wrong outside Hearth" (offline.js in the window):
//   net:probe   is the internet there? The OS's own answer (net.isOnline) and then one TCP connection to the engines'
//               service (or to the proxy this computer uses), 3 s at most. No HTTP, no engine, no tokens. Asked only while
//               something waits to be sent, never in a loop when nothing does.
//   net:power   the computer went to sleep / woke up (powerMonitor), so a reply cut off by sleep says so.
const net = require('net');

const HOSTS = [['api.anthropic.com', 443], ['chatgpt.com', 443]];
const TIMEOUT_MS = 3000;

// HTTPS_PROXY=http://host:port (a company proxy / a VPN client's): the engines go through it, so the check does too
function proxyTarget(env = process.env) {
  const raw = env.HTTPS_PROXY || env.https_proxy || env.ALL_PROXY || env.all_proxy || '';
  if (!raw) return null;
  try { const u = new URL(raw); return [u.hostname, Number(u.port) || (u.protocol === 'https:' ? 443 : 80)]; } catch { return null; }
}
function reach([host, port]) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: TIMEOUT_MS });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
  });
}
async function probe() {
  try {
    const { net: enet } = require('electron');
    if (typeof enet?.isOnline === 'function' && !enet.isOnline()) return { online: false, why: 'os' };
  } catch { /* not in Electron (tests) */ }
  const via = proxyTarget();
  const targets = via ? [via] : HOSTS;
  for (const t of targets) if (await reach(t)) return { online: true, via: via ? 'proxy' : t[0] };
  return { online: false, why: via ? 'proxy' : 'unreachable' };
}

function register(ipcMain, { getWin } = {}) {
  ipcMain.handle('net:probe', () => probe());
  try {
    const { powerMonitor } = require('electron');
    const tell = (state) => { const w = getWin?.(); if (w && !w.isDestroyed()) w.webContents.send('net:power', { state, at: Date.now() }); };
    powerMonitor.on('suspend', () => tell('suspend'));
    powerMonitor.on('resume', () => tell('resume'));
  } catch { /* no power events here */ }
}

module.exports = { register, probe, proxyTarget };
