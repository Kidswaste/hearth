// Phone remote, main side (round 24, remote): a small web server on the local network for a phone or a tablet to
// play the Lab and the live stage (the page: remote-page.html + remote-page.js; the Lab side: remote.js).
//   off by default   started by /remote on, stopped by /remote off, and by itself after a quiet while (nobody
//                    connected for 10 min, or nobody touching anything for an hour)
//   LAN only         bound to this computer's local network address (never 0.0.0.0); a request from an address
//                    outside the private ranges, or naming another host (DNS rebinding), or a socket from another
//                    page (Origin) is refused
//   pairing          a 6-digit code shown on the computer (5 minutes, one use, 5 wrong tries → a new code and a
//                    short lock); a paired device gets its own random key, remembered on the phone and here only
//                    (data/remote, never synced, encrypted with safeStorage when the system has it); revocable
//                    (/remote devices · forget)
//   no secrets       in URLs, ever; the key itself never travels after pairing: each connection answers a fresh
//                    challenge with an HMAC of it (plain HTTP on the LAN, so a listener can't replay it)
//   one WebSocket    hand-made (RFC 6455, text + binary, no fragments, 64 KB a message, masked from the phone):
//                    JSON both ways, the preview's JPEG frames as binary
// The renderer (remote.js) does everything Lab-side; this file only moves messages and keeps the doors.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const PORTS = [47830, 47831, 47832, 47833, 47834];
const MAX_MSG = 64 * 1024;
const MAX_PEERS = 8; // sockets at once (paired or not)
const CODE_MS = 5 * 60000;
const AUTH_MS = 10000; // a socket has 10 s to say who it is
const IN_TYPES = new Set(['set', 'act', 'scene', 'cue', 'go', 'preview', 'state', 'layer', 'group', 'bpm', 'rename']);
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ---------- addresses ----------
const v4 = (a) => String(a || '').replace(/^::ffff:/i, '');
function isPrivate(a) {
  const s = v4(a);
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (!m) return /^(::1|fe[89ab][0-9a-f]:|f[cd][0-9a-f]{2}:)/i.test(s);
  const [x, y] = [Number(m[1]), Number(m[2])];
  return x === 10 || x === 127 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254);
}
// this computer's address on the local network: Wi-Fi / Ethernet first, private IPv4 only
function lanAddress() {
  const all = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' || i.family === 4) if (!i.internal && isPrivate(i.address) && !/^169\.254\./.test(i.address)) all.push({ name, address: i.address });
  }
  const rank = (n) => (/^(en0|wlan0|wl|wi-?fi|wlp)/i.test(n) ? 0 : /^(en\d|eth|ethernet|enp|eno)/i.test(n) ? 1 : /^(vbox|vmnet|docker|br-|virbr|utun|tun|tap|zt|tailscale|veth)/i.test(n) ? 3 : 2);
  all.sort((a, b) => rank(a.name) - rank(b.name));
  return all[0] || null;
}

function register(ipcMain, getWin, { dataDir } = {}) {
  const send = (ch, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
  const dir = path.join(dataDir || os.tmpdir(), 'remote');
  const file = path.join(dir, 'devices.json');
  const pageFile = (n) => path.join(__dirname, n);

  // ---------- paired devices (a key per device: 32 random bytes, kept by the phone and here) ----------
  // (at rest the keys are encrypted with the system's keychain through Electron's safeStorage when it's there)
  let devices = null;
  const safe = () => { try { const { safeStorage } = require('electron'); return safeStorage?.isEncryptionAvailable() ? safeStorage : null; } catch { return null; } };
  function loadDevices() {
    if (devices) return devices;
    try {
      const ss = safe();
      devices = JSON.parse(fs.readFileSync(file, 'utf8')).map((d) => { if (d?.kx) { try { return { ...d, key: ss.decryptString(Buffer.from(d.kx, 'base64')), kx: undefined }; } catch { return null; } } return d; }).filter((d) => d && d.id && d.key);
    } catch { devices = []; }
    return devices;
  }
  function saveDevices() {
    try {
      const ss = safe();
      const rows = loadDevices().map(({ key, ...d }) => (ss ? { ...d, kx: ss.encryptString(key).toString('base64') } : { ...d, key }));
      fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(rows, null, 1), { mode: 0o600 });
    } catch (err) { console.warn('remote: could not save devices', err.message); }
  }
  const publicDevice = (d) => ({ id: d.id, name: d.name, created: d.created, lastSeen: d.lastSeen || 0, online: [...peers.values()].some((p) => p.dev === d.id) });

  // ---------- the pairing code ----------
  let code = null; // { value, at, fails }
  let lockUntil = 0; let failsTotal = 0;
  function newCode() { code = { value: String(crypto.randomInt(0, 1000000)).padStart(6, '0'), at: Date.now(), fails: 0 }; send('remote:code', publicCode()); return publicCode(); }
  const publicCode = () => (code && Date.now() - code.at < CODE_MS ? { code: code.value, expires: code.at + CODE_MS } : null);

  // ---------- the server ----------
  let server = null; let host = null; let port = 0; let startedAt = 0;
  let idleMs = 10 * 60000; let touchMs = 60 * 60000; let lastTouch = 0; let lastSeenSomeone = 0; let idleTimer = 0;
  const peers = new Map(); // socket → { id, dev, name, nonce, preview, addr, alive, rate }
  let nextPeer = 1;
  const origin = () => `http://${host}:${port}`;
  const url = () => (server ? `${origin()}/` : null);

  function headers(type) {
    return {
      'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src ws://${host}:${port}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    };
  }
  function onRequest(req, res) {
    if (!isPrivate(req.socket.remoteAddress) || req.headers.host !== `${host}:${port}`) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Not here'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
    const p = String(req.url || '/').split('?')[0];
    const files = { '/': ['remote-page.html', 'text/html; charset=utf-8'], '/remote-page.js': ['remote-page.js', 'text/javascript; charset=utf-8'] };
    const f = files[p];
    if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    fs.readFile(pageFile(f[0]), (err, buf) => {
      if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Missing'); return; }
      res.writeHead(200, headers(f[1]));
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  // ---------- WebSocket (RFC 6455, the small part a browser uses) ----------
  function frame(op, payload) {
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeUInt32BE(Math.floor(len / 2 ** 32), 2); b.writeUInt32BE(len >>> 0, 6); return b; })();
    return Buffer.concat([head, payload]);
  }
  const sendJson = (sock, obj) => { if (!sock.destroyed) sock.write(frame(1, Buffer.from(JSON.stringify(obj)))); };
  function close(sock, codeN = 1000, why = '') {
    if (sock.destroyed) return;
    const b = Buffer.alloc(2 + Buffer.byteLength(why)); b.writeUInt16BE(codeN, 0); b.write(why, 2);
    try { sock.end(frame(8, b)); } catch { /* gone */ }
    setTimeout(() => sock.destroy(), 1000).unref?.();
  }
  function onUpgrade(req, sock) {
    const bad = (n) => { try { sock.end(`HTTP/1.1 ${n} No\r\nConnection: close\r\n\r\n`); } catch { /* gone */ } };
    if (!isPrivate(req.socket.remoteAddress) || req.headers.host !== `${host}:${port}` || req.headers.origin !== origin()) return bad(403);
    if (String(req.headers.upgrade).toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13' || !req.headers['sec-websocket-key']) return bad(400);
    if (peers.size >= MAX_PEERS) return bad(503);
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.setNoDelay(true);
    const p = { id: nextPeer++, dev: null, name: '', nonce: crypto.randomBytes(32).toString('hex'), preview: false, addr: v4(req.socket.remoteAddress), alive: Date.now(), rate: { t: Date.now(), n: 0 } };
    peers.set(sock, p);
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      while (buf.length >= 2) {
        const fin = buf[0] & 0x80; const op = buf[0] & 0x0f; const masked = buf[1] & 0x80; let len = buf[1] & 0x7f; let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; if (buf.readUInt32BE(2)) { close(sock, 1009, 'too big'); return; } len = buf.readUInt32BE(6); off = 10; }
        if (!masked) { close(sock, 1002, 'unmasked'); return; }
        if (len > MAX_MSG) { close(sock, 1009, 'too big'); buf = Buffer.alloc(0); return; }
        if (buf.length < off + 4 + len) return;
        const mask = buf.subarray(off, off + 4); const data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
        for (let i = 0; i < data.length; i += 1) data[i] ^= mask[i & 3];
        buf = buf.subarray(off + 4 + len);
        p.alive = Date.now();
        if (!fin || op === 0) { close(sock, 1009, 'no fragments'); return; }
        if (op === 8) { close(sock, 1000); return; }
        if (op === 9) { sock.write(frame(10, data)); continue; }
        if (op === 1) onText(sock, p, data.toString('utf8'));
      }
    });
    sock.on('error', () => {});
    sock.on('close', () => { peers.delete(sock); if (p.dev) { send('remote:leave', { peer: p.id, dev: p.dev, name: p.name }); lastSeenSomeone = Date.now(); } });
    sendJson(sock, { t: 'hi', nonce: p.nonce, v: 1 });
    setTimeout(() => { if (!p.dev && !sock.destroyed) close(sock, 4000, 'who are you'); }, AUTH_MS).unref?.();
  }
  const hmac = (key, nonce) => crypto.createHmac('sha256', Buffer.from(key, 'hex')).update(nonce).digest();
  function onText(sock, p, text) {
    // a burst limit: 240 messages a second is far beyond ten fingers at 60 fps
    const now = Date.now();
    if (now - p.rate.t > 1000) { p.rate.t = now; p.rate.n = 0; }
    if ((p.rate.n += 1) > 240) { close(sock, 1008, 'too fast'); return; }
    let m; try { m = JSON.parse(text); } catch { close(sock, 1003, 'json'); return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (!p.dev) return hello(sock, p, m);
    if (m.t === 'ping') { sendJson(sock, { t: 'pong' }); return; }
    if (!IN_TYPES.has(m.t)) return;
    if (m.t === 'preview') p.preview = Boolean(m.on);
    if (m.t === 'rename') { const d = loadDevices().find((x) => x.id === p.dev); if (d) { d.name = cleanName(m.name) || d.name; p.name = d.name; saveDevices(); send('remote:devices', status()); } return; }
    if (m.t !== 'state' && m.t !== 'preview') lastTouch = now;
    send('remote:msg', { peer: p.id, dev: p.dev, name: p.name, msg: m });
  }
  const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} '’._-]/gu, '').trim().slice(0, 32);
  function hello(sock, p, m) {
    if (m.t === 'auth') {
      const d = loadDevices().find((x) => x.id === String(m.id || ''));
      const mac = Buffer.from(String(m.mac || ''), 'hex');
      const want = d ? hmac(d.key, p.nonce) : crypto.randomBytes(32);
      if (!d || mac.length !== 32 || !crypto.timingSafeEqual(mac, want)) { sendJson(sock, { t: 'no', why: 'unknown' }); close(sock, 4003, 'unknown device'); return; }
      return welcome(sock, p, d, null);
    }
    if (m.t === 'pair') {
      if (Date.now() < lockUntil) { sendJson(sock, { t: 'no', why: 'locked', wait: Math.ceil((lockUntil - Date.now()) / 1000) }); close(sock, 4002, 'locked'); return; }
      if (!publicCode()) { sendJson(sock, { t: 'no', why: 'expired' }); close(sock, 4002, 'no code'); return; }
      const given = Buffer.from(String(m.code || '').replace(/\D/g, '').padEnd(6, 'x').slice(0, 6)); const real = Buffer.from(code.value);
      if (!crypto.timingSafeEqual(given, real)) {
        code.fails += 1; failsTotal += 1;
        if (code.fails >= 5) { lockUntil = Date.now() + 30000; newCode(); send('remote:alert', { text: 'Five wrong pairing codes: a new code, pairing paused for 30 s' }); }
        if (failsTotal >= 20) { code = null; send('remote:code', null); send('remote:alert', { text: 'Too many wrong pairing codes: pairing is off until you show a new code (/remote pair)' }); }
        sendJson(sock, { t: 'no', why: 'code' }); close(sock, 4002, 'wrong code'); return;
      }
      const key = crypto.randomBytes(32).toString('hex');
      const d = { id: crypto.randomBytes(9).toString('base64url'), name: cleanName(m.name) || 'Phone', key, created: Date.now(), lastSeen: Date.now() };
      loadDevices().push(d); saveDevices();
      code = null; send('remote:code', null); // one use
      return welcome(sock, p, d, key);
    }
    close(sock, 4000, 'who are you');
  }
  function welcome(sock, p, d, key) {
    p.dev = d.id; p.name = d.name; d.lastSeen = Date.now(); saveDevices();
    lastTouch = Date.now();
    sendJson(sock, key ? { t: 'paired', id: d.id, key, name: d.name } : { t: 'ok', id: d.id, name: d.name });
    send('remote:join', { peer: p.id, dev: d.id, name: d.name, addr: p.addr, paired: Boolean(key) });
  }

  function status() {
    const list = loadDevices().map(publicDevice);
    const online = [...peers.values()].filter((p) => p.dev).map((p) => ({ peer: p.id, dev: p.dev, name: p.name, addr: p.addr, preview: p.preview }));
    return { on: Boolean(server), url: url(), host, port, startedAt, code: publicCode(), devices: list, online, idleMin: Math.round(idleMs / 60000), lan: lanAddress() };
  }
  function checkIdle() {
    if (!server) return;
    const now = Date.now(); const someone = [...peers.values()].some((p) => p.dev);
    for (const [s, p] of peers) if (now - p.alive > 75000) { s.destroy(); peers.delete(s); } // a phone that went away without a word (sleep, walked off)
    if (!someone && now - Math.max(lastSeenSomeone, lastTouch, startedAt) > idleMs) stop('idle');
    else if (someone && now - Math.max(lastTouch, startedAt) > touchMs) stop('idle');
  }
  async function start(o = {}) {
    // (the address: this computer on the local network; tests may use the loopback, nothing else)
    if (o.host && !/^127\.\d+\.\d+\.\d+$/.test(o.host)) throw new Error('The remote listens on the local network or 127.0.0.1 only');
    if (server) return status();
    const want = o.host || lanAddress()?.address;
    if (!want) throw new Error('No local network found: connect this computer to Wi-Fi or Ethernet (the same network as the phone)');
    if (o.idleMs > 0) idleMs = Number(o.idleMs);
    if (o.touchMs > 0) touchMs = Number(o.touchMs);
    const srv = http.createServer(onRequest);
    srv.on('upgrade', onUpgrade);
    srv.on('clientError', (_e, s) => s.destroy());
    srv.headersTimeout = 10000; srv.requestTimeout = 15000; srv.maxHeadersCount = 40;
    const ports = o.port === 0 ? [0] : o.port ? [Number(o.port)] : PORTS.concat(0);
    for (const pt of ports) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await new Promise((res) => { srv.once('error', () => res(false)); srv.listen(pt, want, () => res(true)); });
      if (ok) break;
    }
    if (!srv.listening) throw new Error('Could not open a port for the remote');
    server = srv; host = want; port = srv.address().port; startedAt = Date.now(); lastTouch = 0; lastSeenSomeone = 0;
    idleTimer = setInterval(checkIdle, Math.min(15000, Math.max(200, idleMs / 4)));
    for (const [s] of peers) s.destroy();
    peers.clear();
    newCode();
    send('remote:devices', status());
    return status();
  }
  function stop(why = 'off') {
    if (!server) return status();
    clearInterval(idleTimer); idleTimer = 0;
    for (const [s] of peers) close(s, 1001, why === 'idle' ? 'remote off (idle)' : 'remote off');
    peers.clear();
    try { server.close(); } catch { /* closed */ }
    server = null; code = null;
    send('remote:stopped', { why });
    return status();
  }
  function kick(dev, forget = false) {
    let n = 0;
    for (const [s, p] of peers) if (p.dev === dev || String(p.id) === dev) { if (forget) sendJson(s, { t: 'no', why: 'forgotten' }); close(s, forget ? 4003 : 4001, forget ? 'forgotten' : 'kicked'); peers.delete(s); n += 1; }
    if (forget) { devices = loadDevices().filter((d) => d.id !== dev); saveDevices(); }
    send('remote:devices', status());
    return n;
  }

  // ---------- IPC ----------
  ipcMain.handle('remote:start', (_e, o) => start(o || {}));
  ipcMain.handle('remote:stop', () => stop('off'));
  ipcMain.handle('remote:status', () => status());
  ipcMain.handle('remote:pair', () => { if (!server) throw new Error('The remote is off: /remote on'); failsTotal = 0; return newCode(); });
  ipcMain.handle('remote:kick', (_e, id) => kick(String(id), false));
  ipcMain.handle('remote:forget', (_e, id) => kick(String(id), true));
  ipcMain.handle('remote:idle', (_e, min) => { const n = Number(min); if (n >= 1 && n <= 24 * 60) idleMs = n * 60000; return Math.round(idleMs / 60000); });
  // the Lab side → phones: { to: peer id | null (everyone), msg }
  ipcMain.on('remote:send', (_e, o) => {
    if (!server || !o?.msg) return;
    const text = frame(1, Buffer.from(JSON.stringify(o.msg)));
    for (const [s, p] of peers) if (p.dev && (o.to == null || o.to === p.id) && s.writableLength < 256 * 1024) s.write(text);
  });
  // a preview frame (a small JPEG data URL) → binary, to the phones showing the preview (skipped by a slow one)
  ipcMain.on('remote:frame', (_e, dataUrl) => {
    if (!server || typeof dataUrl !== 'string') return;
    const i = dataUrl.indexOf('base64,'); if (i < 0) return;
    let bin = null;
    for (const [s, p] of peers) {
      if (!p.dev || !p.preview || s.writableLength > 96 * 1024) continue;
      bin ||= frame(2, Buffer.from(dataUrl.slice(i + 7), 'base64'));
      s.write(bin);
    }
  });
  // (dev/checks/remote.js only, in a test copy: a hidden window as the phone)
  ipcMain.handle('remote:test', async (_e, o) => {
    if (!process.env.HEARTH_TEST_SAVE_DIR) throw new Error('Tests only');
    const { BrowserWindow } = require('electron');
    const wins = (register.testWins ||= new Map()); const id = o.win || 'a';
    if (o.open) { wins.get(id)?.destroy(); const w = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } }); wins.set(id, w); await w.loadURL(o.open); return true; }
    if (o.eval) return wins.get(id)?.webContents.executeJavaScript(o.eval, true);
    if (o.close) { for (const w of wins.values()) w.destroy(); wins.clear(); return true; }
    if (o.file) return fs.readFileSync(file, 'utf8');
    if (o.shot) { const img = await wins.get(id)?.webContents.capturePage(); const f = path.join(os.tmpdir(), `hearth-remote-${String(o.shot).replace(/\W/g, '')}.png`); if (img) fs.writeFileSync(f, img.toPNG()); return f; }
    if (o.get) return new Promise((res) => { http.get({ host, port, path: o.get, headers: { Host: o.host || `${host}:${port}` } }, (rs) => { rs.resume(); res({ status: rs.statusCode, csp: rs.headers['content-security-policy'] || '' }); }).on('error', (err) => res({ err: err.message })); });
    if (o.raw) { // a socket from somewhere else (no Origin / another Origin): must be refused
      return new Promise((res) => {
        const r = http.request({ host, port, path: '/', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), Host: o.raw.host || `${host}:${port}`, ...(o.raw.origin ? { Origin: o.raw.origin } : {}) } });
        r.on('upgrade', (rs, s) => { s.destroy(); res(rs.statusCode); }); r.on('response', (rs) => res(rs.statusCode)); r.on('error', (err) => res(err.message)); r.end();
      });
    }
    return null;
  });
  return { start, stop, status };
}

module.exports = { register, isPrivate, lanAddress };
