// 📱 See it on my phone (round 136, phone136), main side: a finished render, or the Lab's live preview, on the owner's
// phone over his own Wi-Fi. The window side is phoneview.js (the card with the QR), the phone's page is
// phoneview-page.html + phoneview-page.js.
//   one share at a time   a render (the video file, played looping) or live (the preview as a stream of JPEG frames,
//                         multipart/x-mixed-replace, "MJPEG": the same small JPEGs the phone remote's preview sends)
//   LAN only              bound to this computer's local network address (remotemain.js lanAddress(): private IPv4,
//                         never 0.0.0.0, never a public interface); requests from outside the private ranges, or
//                         naming another host (DNS rebinding), are refused
//   a one-time token      128 random bits, made for this share and in the QR code's address; every request needs it;
//                         it dies with the share (Stop, the card closed, 30 min with nobody watching, the window gone)
//   nothing else          GET / HEAD only, five paths under the token, no listing, no upload, nothing cached
// Not the deploy / publish path (deploymain.js): nothing here leaves the local network and nothing is uploaded.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { isPrivate, lanAddress } = require('./remotemain.js'); // (the phone remote's address rules, reused)

const PORTS = [47840, 47841, 47842, 47843, 47844]; // (the phone remote uses 47830…; a steady port for the firewall)
const IDLE_MS = 30 * 60000;
const SEEN_MS = 15000; // a phone counts as connected for 15 s after its last request (the page pings every 5 s)
const MAX_PHONES = 8;
const VIDEO = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };
const BOUNDARY = 'hearthframe';
const isTest = () => Boolean(process.env.HEARTH_TEST_SAVE_DIR);

function register(ipcMain, getWin) {
  const send = (ch, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
  let S = null; // the share: { server, host, port, token, mode, file, type, size, title, label, startedAt, last, idleMs, timer, phones: Map, streams: Set, frame, served, refused }
  let lastFrame = null;

  const base = () => (S ? `http://${S.host}:${S.port}` : null);
  const phonesNow = () => { if (!S) return 0; const t = Date.now(); for (const st of S.streams) if (st.cid) S.phones.set(st.cid, t); for (const [id, at] of S.phones) if (t - at > SEEN_MS) S.phones.delete(id); return Math.max(S.phones.size, S.streams.size ? 1 : 0); };
  function status() {
    if (!S) return { on: false };
    return { on: true, mode: S.mode, url: `${base()}/v/${S.token}/`, address: base(), host: S.host, port: S.port, title: S.title, label: S.label, phones: phonesNow(), startedAt: S.startedAt, idleMin: Math.round(S.idleMs / 60000), idleMs: S.idleMs, served: S.served, refused: S.refused, streams: S.streams.size, frames: S.frames, platform: process.platform };
  }
  let lastSent = '';
  function changed() { const s = status(); const k = `${s.on}|${s.phones}|${s.streams}|${s.label}`; if (k !== lastSent) { lastSent = k; send('phone:status', s); } }
  const wantFrames = () => send('phone:want', { frames: Boolean(S && S.mode === 'live' && S.streams.size) });

  function headers(type, more = {}) {
    return {
      'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      ...more,
    };
  }
  function refuse(res, code, text) { if (S) S.refused += 1; res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(text); }
  const tokenOk = (t) => { if (!S || typeof t !== 'string' || t.length !== S.token.length) return false; return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(S.token)); };

  function onRequest(req, res) {
    if (!S) { refuse(res, 410, 'Stopped'); return; }
    if (!isPrivate(req.socket.remoteAddress) || req.headers.host !== `${S.host}:${S.port}`) { refuse(res, 403, 'Not here'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
    const u = new URL(String(req.url || '/'), 'http://x');
    const m = /^\/v\/([0-9a-f]+)\/([a-z.-]*)$/.exec(u.pathname);
    if (!m || !tokenOk(m[1])) { refuse(res, 403, 'This link has ended. Scan the new code on the computer.'); return; }
    const what = m[2];
    const cid = String(u.searchParams.get('c') || '').replace(/[^\w-]/g, '').slice(0, 24);
    if (cid && (S.phones.has(cid) || S.phones.size < MAX_PHONES)) S.phones.set(cid, Date.now());
    S.last = Date.now();
    if (what === '') return file(res, req, path.join(__dirname, 'phoneview-page.html'), 'text/html; charset=utf-8');
    if (what === 'page.js') return file(res, req, path.join(__dirname, 'phoneview-page.js'), 'text/javascript; charset=utf-8');
    if (what === 'info') { res.writeHead(200, headers('application/json')); res.end(JSON.stringify({ mode: S.mode, title: S.title, label: S.label })); changed(); return; }
    if (what === 'ping') { res.writeHead(204, headers('text/plain')); res.end(); changed(); return; }
    if (what === 'video' && S.mode === 'render') return video(req, res);
    if (what === 'live' && S.mode === 'live') return live(req, res, cid);
    refuse(res, 404, 'Not found');
  }
  function file(res, req, f, type) {
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Missing'); return; }
      res.writeHead(200, headers(type)); res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }
  // the render: byte ranges (a phone's player asks for pieces, and iPhones need them)
  function video(req, res) {
    fs.stat(S.file, (err, st) => {
      if (err || !st.isFile()) { refuse(res, 404, 'The video is gone'); return; }
      const size = st.size; const r = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
      let a = 0; let b = size - 1; let code = 200;
      if (r) {
        a = r[1] === '' ? Math.max(0, size - Number(r[2])) : Number(r[1]); b = r[1] !== '' && r[2] !== '' ? Math.min(size - 1, Number(r[2])) : size - 1;
        if (!(a <= b && a < size)) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
        code = 206;
      }
      res.writeHead(code, headers(S.type, { 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1, ...(code === 206 ? { 'Content-Range': `bytes ${a}-${b}/${size}` } : {}) }));
      if (req.method === 'HEAD') { res.end(); return; }
      S.served += 1;
      const s = fs.createReadStream(S.file, { start: a, end: b });
      s.on('error', () => res.destroy()); res.on('close', () => s.destroy());
      s.pipe(res);
    });
  }
  // live: one long response, a JPEG per part, as fast as the Lab sends them (a slow phone skips frames)
  function live(req, res, cid) {
    if (S.streams.size >= MAX_PHONES) { refuse(res, 503, 'Too many phones'); return; }
    res.writeHead(200, headers(`multipart/x-mixed-replace; boundary=${BOUNDARY}`, { Connection: 'close', Pragma: 'no-cache' }));
    if (req.method === 'HEAD') { res.end(); return; }
    req.socket.setNoDelay(true);
    const st = { res, cid, sent: 0 };
    S.streams.add(st);
    const share = S;
    res.on('close', () => { share.streams.delete(st); if (S === share) { changed(); wantFrames(); } });
    if (lastFrame) part(st, lastFrame);
    changed(); wantFrames();
  }
  function part(st, jpg) {
    if (st.res.writableLength > 384 * 1024) return; // that phone is behind: skip this frame
    st.res.write(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.length}\r\n\r\n`);
    st.res.write(jpg); st.res.write('\r\n');
    st.sent += 1;
  }

  function checkIdle() {
    if (!S) return;
    if (S.streams.size) S.last = Date.now(); // someone is watching live
    if (Date.now() - S.last > S.idleMs) { stop('idle'); return; }
    changed();
  }
  function watchWindow() {
    // the card lives in the window: the window reloading or going away ends the share (a server only while the card is open)
    const w = getWin(); const wc = w && !w.isDestroyed() ? w.webContents : null;
    if (!wc || wc.__phoneWatched) return;
    wc.__phoneWatched = true;
    wc.on('did-navigate', () => stop('window'));
    wc.on('render-process-gone', () => stop('window'));
    wc.once('destroyed', () => stop('window'));
  }

  async function start(o = {}) {
    const mode = o.mode === 'live' ? 'live' : o.mode === 'render' ? 'render' : null;
    if (!mode) throw new Error('A render or live');
    // (the address: this computer on the local network; tests may use the loopback, nothing else)
    if (o.host && !/^127\.\d+\.\d+\.\d+$/.test(o.host)) throw new Error('It opens on the local network (or 127.0.0.1 for a test) only');
    let file = null; let type = null;
    if (mode === 'render') {
      file = path.resolve(String(o.file || ''));
      type = VIDEO[path.extname(file).toLowerCase()];
      if (!type) throw new Error('Only a video (MP4, MOV, WebM) opens on the phone');
      const st = await fs.promises.stat(file).catch(() => null);
      if (!st?.isFile()) throw new Error('That video is not there any more');
    }
    const host = o.host || lanAddress()?.address;
    if (!host) throw new Error('No local network found: connect this computer to Wi-Fi or Ethernet (the same network as the phone)');
    stop('replaced'); // one share at a time: a new one gets a new token
    const srv = http.createServer(onRequest);
    srv.on('clientError', (_e, s) => s.destroy());
    srv.headersTimeout = 10000; srv.requestTimeout = 0; srv.maxHeadersCount = 40; // (requestTimeout 0: the live stream is one long response)
    const ports = o.port === 0 ? [0] : o.port ? [Number(o.port)] : PORTS.concat(0);
    for (const pt of ports) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await new Promise((res) => { srv.once('error', () => res(false)); srv.listen(pt, host, () => res(true)); });
      if (ok) break;
    }
    if (!srv.listening) throw new Error('Could not open a port on this computer for the phone');
    const idleMs = isTest() && o.idleMs > 0 ? Number(o.idleMs) : IDLE_MS; // (shorter only in a test copy)
    S = { server: srv, host, port: srv.address().port, token: crypto.randomBytes(16).toString('hex'), mode, file, type, title: String(o.title || (file ? path.basename(file) : 'Live')).slice(0, 120), label: String(o.label || '').slice(0, 80), startedAt: Date.now(), last: Date.now(), idleMs, phones: new Map(), streams: new Set(), served: 0, refused: 0, frames: 0, timer: 0 };
    S.timer = setInterval(checkIdle, Math.min(30000, Math.max(100, idleMs / 4)));
    lastFrame = null;
    watchWindow();
    lastSent = ''; changed();
    return status();
  }
  function stop(why = 'off') {
    if (!S) return status();
    const s = S; S = null;
    clearInterval(s.timer);
    for (const st of s.streams) { try { st.res.end(); st.res.socket?.destroy(); } catch { /* gone */ } }
    s.streams.clear();
    try { s.server.close(); s.server.closeAllConnections?.(); } catch { /* closed */ }
    lastFrame = null;
    if (why !== 'replaced') { send('phone:stopped', { why }); wantFrames(); }
    lastSent = '';
    return status();
  }

  // ---------- IPC ----------
  // (a refusal comes back as { on: false, error } in plain words: the window says it as it is, nothing is logged as a fault)
  ipcMain.handle('phone:start', async (_e, o) => { try { return await start(o || {}); } catch (err) { return { ...status(), error: err.message }; } });
  ipcMain.handle('phone:stop', (_e, why) => stop(why === 'card' ? 'card' : 'off'));
  ipcMain.handle('phone:status', () => status());
  ipcMain.on('phone:label', (_e, label) => { if (S) { S.label = String(label || '').slice(0, 80); changed(); } });
  // a live frame from the Lab (a JPEG data URL) → every phone watching
  ipcMain.on('phone:frame', (_e, dataUrl) => {
    if (!S || S.mode !== 'live' || typeof dataUrl !== 'string') return;
    const i = dataUrl.indexOf('base64,'); if (i < 0) return;
    lastFrame = Buffer.from(dataUrl.slice(i + 7), 'base64');
    S.frames += 1;
    for (const st of S.streams) part(st, lastFrame);
  });
  // (dev/checks/phone136.js only, in a test copy: a hidden window as the phone, and raw requests)
  ipcMain.handle('phone:test', async (_e, o) => {
    if (!isTest()) throw new Error('Tests only');
    const { BrowserWindow } = require('electron');
    const wins = (register.testWins ||= new Map()); const id = o.win || 'a';
    if (o.open) { wins.get(id)?.destroy(); const w = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } }); wins.set(id, w); await w.loadURL(o.open).catch(() => {}); return true; }
    if (o.eval) return wins.get(id)?.webContents.executeJavaScript(o.eval, true);
    if (o.close) { for (const w of wins.values()) w.destroy(); wins.clear(); return true; }
    if (o.get) { // { get: path, host?, address?, port?, range?, bytes? } → { status, type, length, first? } or { err }
      const host = o.address || S?.host || '127.0.0.1'; const port = o.port || S?.port;
      return new Promise((res) => {
        const r = http.get({ host, port, path: o.get, timeout: 4000, headers: { Host: o.host || `${host}:${port}`, ...(o.range ? { Range: o.range } : {}) } }, (rs) => {
          const chunks = []; let n = 0;
          rs.on('data', (d) => { n += d.length; if (o.bytes && n < o.bytes + 65536) chunks.push(d); if (o.bytes && n >= o.bytes) rs.destroy(); });
          const done = () => res({ status: rs.statusCode, type: rs.headers['content-type'] || '', length: Number(rs.headers['content-length'] || 0), range: rs.headers['content-range'] || '', csp: rs.headers['content-security-policy'] || '', got: n, jpeg: Buffer.concat(chunks).includes(Buffer.from([0xff, 0xd8, 0xff])) });
          rs.on('end', done); rs.on('close', done);
        });
        r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', (err) => res({ err: err.code || err.message }));
      });
    }
    if (o.addresses) return Object.entries(require('os').networkInterfaces()).flatMap(([name, l]) => (l || []).filter((i) => i.family === 'IPv4' || i.family === 4).map((i) => ({ name, address: i.address, internal: i.internal, private: isPrivate(i.address) })));
    if (o.bound) return S ? S.server.address() : null;
    return null;
  });
  return { start, stop, status };
}

module.exports = { register };
