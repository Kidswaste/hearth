// The Lab with the owner's other tools, main side (round 25, interop): OSC in / out over UDP, a read-only Ableton
// Link tempo follower, the OBS Browser Source page (a local server for the Lab's picture with alpha), and an
// obs-websocket (v5) client. The renderer side is interop.js (OSC map, clock, features), interop-midi.js (MIDI out)
// and interop-obs.js (frames, OBS control); this file only moves bytes and keeps the doors.
//   off by default   nothing listens until /osc on, /obs output on, /link on; nothing connects until /obs connect
//   OSC              one UDP socket in ("local": 127.0.0.1 only; "lan": this computer's network, senders from
//                    private addresses only), messages decoded here (bundles flattened), batched to the window once
//                    per turn of the event loop, 4,000 a second at most; out only to this computer or private
//                    addresses (never the internet)
//   Link             listens to Ableton Link's discovery (UDP multicast 224.76.78.75:20808) for the session's tempo
//                    and play state; it never announces itself (no phase: that needs Link's clock measurement)
//   Browser Source   http://127.0.0.1:<port>/ only (never the network), the page + its script, one WebSocket per
//                    viewer from that page only (Origin + Host checked, so a website can't read the picture);
//                    frames (WebP with alpha) go to every viewer that keeps up
//   obs-websocket    ws:// to this computer or a private address; the password is pasted once, kept encrypted with
//                    safeStorage (session-only when the system has no keychain), never logged, never sent back to
//                    the window; requests from the window are limited to a short list
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');

// ---------- addresses ----------
const v4 = (a) => String(a || '').replace(/^::ffff:/i, '');
const isLoop = (a) => /^127\.\d+\.\d+\.\d+$/.test(v4(a)) || v4(a) === '::1';
function isPrivate(a) {
  const s = v4(a);
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (!m) return /^(::1|fe[89ab][0-9a-f]:|f[cd][0-9a-f]{2}:)/i.test(s);
  const [x, y] = [Number(m[1]), Number(m[2])];
  return x === 10 || x === 127 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254);
}
// a place Hearth may send OSC to / connect OBS to: this computer or the local network ("localhost" included)
const okHost = (h) => h === 'localhost' || (net.isIPv4(h) && isPrivate(h));

// ---------- OSC 1.0 codec (pure: dev/interop-test.js) ----------
const pad4 = (n) => (n + 3) & ~3;
function oscStr(s) { const b = Buffer.from(`${s}\0`, 'utf8'); const out = Buffer.alloc(pad4(b.length)); b.copy(out); return out; }
// args: a number (float), { i } / { f } / { d } / { h } (typed), a string, true / false, null, a Buffer (blob)
function encodeMessage(addr, args = []) {
  if (typeof addr !== 'string' || addr[0] !== '/') throw new Error('An OSC address starts with /');
  let tags = ','; const parts = [];
  for (const a of args) {
    if (typeof a === 'number') { tags += 'f'; const b = Buffer.alloc(4); b.writeFloatBE(a); parts.push(b); } else if (typeof a === 'string') { tags += 's'; parts.push(oscStr(a)); } else if (a === true) tags += 'T'; else if (a === false) tags += 'F'; else if (a == null) tags += 'N';
    else if (Buffer.isBuffer(a) || a instanceof Uint8Array) { tags += 'b'; const n = Buffer.alloc(4); n.writeInt32BE(a.length); const d = Buffer.alloc(pad4(a.length)); Buffer.from(a).copy(d); parts.push(n, d); } else if (typeof a === 'object' && 'i' in a) { tags += 'i'; const b = Buffer.alloc(4); b.writeInt32BE(Math.round(a.i) | 0); parts.push(b); } else if (typeof a === 'object' && 'd' in a) { tags += 'd'; const b = Buffer.alloc(8); b.writeDoubleBE(Number(a.d)); parts.push(b); } else if (typeof a === 'object' && 'h' in a) { tags += 'h'; const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(Math.round(Number(a.h)))); parts.push(b); } else if (typeof a === 'object' && 'f' in a) { tags += 'f'; const b = Buffer.alloc(4); b.writeFloatBE(Number(a.f)); parts.push(b); } else { tags += 's'; parts.push(oscStr(String(a))); }
  }
  return Buffer.concat([oscStr(addr), oscStr(tags), ...parts]);
}
function encodeBundle(msgs, timetag = 1n) {
  const head = [oscStr('#bundle'), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(timetag)); return b; })()];
  const els = msgs.flatMap(([a, args]) => { const m = encodeMessage(a, args); const n = Buffer.alloc(4); n.writeInt32BE(m.length); return [n, m]; });
  return Buffer.concat([...head, ...els]);
}
function readStr(buf, off) { let end = off; while (end < buf.length && buf[end] !== 0) end += 1; if (end >= buf.length) throw new Error('unterminated string'); return [buf.toString('utf8', off, end), pad4(end + 1)]; }
// → [{ addr, args }] (bundles flattened, nested up to 4 deep); throws on a broken packet
function decode(buf, depth = 0, out = []) {
  if (depth > 4) throw new Error('bundles too deep');
  if (buf.length >= 16 && buf.toString('latin1', 0, 8) === '#bundle\0') {
    let off = 16;
    while (off + 4 <= buf.length) { const n = buf.readInt32BE(off); off += 4; if (n <= 0 || off + n > buf.length) throw new Error('bad bundle'); decode(buf.subarray(off, off + n), depth + 1, out); off += n; }
    return out;
  }
  let [addr, off] = readStr(buf, 0);
  if (addr[0] !== '/') throw new Error('not OSC');
  if (off >= buf.length) { out.push({ addr, args: [] }); return out; } // (old senders leave out the type tags)
  let tags; [tags, off] = readStr(buf, off);
  if (tags[0] !== ',') throw new Error('no type tags');
  const args = [];
  for (const t of tags.slice(1)) {
    if (args.length > 64) break;
    if (t === 'i') { args.push(buf.readInt32BE(off)); off += 4; } else if (t === 'f') { args.push(buf.readFloatBE(off)); off += 4; } else if (t === 's' || t === 'S') { let s; [s, off] = readStr(buf, off); args.push(s); } else if (t === 'b') { const n = buf.readInt32BE(off); off += 4; if (n < 0 || off + n > buf.length) throw new Error('bad blob'); args.push(Buffer.from(buf.subarray(off, off + n))); off = pad4(off + n); } else if (t === 'h') { args.push(Number(buf.readBigInt64BE(off))); off += 8; } else if (t === 't') { args.push(Number(buf.readBigUInt64BE(off))); off += 8; } else if (t === 'd') { args.push(buf.readDoubleBE(off)); off += 8; } else if (t === 'c') { args.push(String.fromCharCode(buf.readInt32BE(off))); off += 4; } else if (t === 'r') { args.push(buf.readUInt32BE(off)); off += 4; } else if (t === 'm') { args.push([...buf.subarray(off, off + 4)]); off += 4; } else if (t === 'T') args.push(true); else if (t === 'F') args.push(false); else if (t === 'N') args.push(null); else if (t === 'I') args.push(Infinity); else if (t === '[' || t === ']') { /* arrays: flattened */ } else throw new Error(`unknown type ${t}`);
  }
  out.push({ addr, args });
  return out;
}

// ---------- Ableton Link discovery (pure parse: dev/interop-test.js) ----------
// A Link peer announces itself on 224.76.78.75:20808: "_asdp_v" 1, a message type (1 alive · 2 response · 3 bye),
// a ttl, a group, its 8-byte node id, then entries (4-byte key, 4-byte size, value, big-endian): 'tmln' = tempo
// (microseconds a beat, int64), beat origin (micro-beats), time origin; 'stst' = playing, beats, time; 'sess' = the
// session id. Here only the tempo and the play state are read.
const LINK_GROUP = '224.76.78.75'; const LINK_PORT = 20808;
const LINK_HEAD = Buffer.from([0x5f, 0x61, 0x73, 0x64, 0x70, 0x5f, 0x76, 0x01]); // "_asdp_v" 1
function parseLink(buf) {
  if (buf.length < 20 || !buf.subarray(0, 8).equals(LINK_HEAD)) return null;
  const type = buf[8]; const ttl = buf[9]; const node = buf.subarray(12, 20).toString('hex');
  const out = { type, ttl, node, bpm: null, playing: null, session: null };
  let off = 20;
  while (off + 8 <= buf.length) {
    const key = buf.toString('latin1', off, off + 4); const n = buf.readUInt32BE(off + 4); off += 8;
    if (off + n > buf.length) break;
    if (key === 'tmln' && n >= 24) { const us = Number(buf.readBigInt64BE(off)); if (us > 0) out.bpm = Math.round((60e6 / us) * 1000) / 1000; }
    if (key === 'stst' && n >= 1) out.playing = buf[off] === 1;
    if (key === 'sess' && n >= 8) out.session = buf.subarray(off, off + 8).toString('hex');
    off += n;
  }
  return out;
}
// (tests: a peer's alive message)
function linkPacket({ bpm = 120, playing = false, node = crypto.randomBytes(8), type = 1 } = {}) {
  const ent = (key, val) => { const h = Buffer.alloc(8); h.write(key, 0, 'latin1'); h.writeUInt32BE(val.length, 4); return Buffer.concat([h, val]); };
  const tl = Buffer.alloc(24); tl.writeBigInt64BE(BigInt(Math.round(60e6 / bpm))); tl.writeBigInt64BE(0n, 8); tl.writeBigInt64BE(0n, 16);
  const ss = Buffer.alloc(17); ss[0] = playing ? 1 : 0;
  const head = Buffer.alloc(12); LINK_HEAD.copy(head); head[8] = type; head[9] = 5; head.writeUInt16BE(0, 10);
  return Buffer.concat([head, node, ent('tmln', tl), ent('sess', node), ent('stst', ss)]);
}

// ---------- obs-websocket v5 auth (pure: dev/interop-test.js) ----------
const sha64 = (s) => crypto.createHash('sha256').update(s).digest('base64');
const obsAuth = (password, salt, challenge) => sha64(sha64(password + salt) + challenge);

// ---------- a small WebSocket client (RFC 6455; the obs-websocket connection) ----------
function wsConnect(url, { protocol, onText, onClose, timeoutMs = 4000 }) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch { reject(new Error('Not a ws:// address')); return; }
    if (u.protocol !== 'ws:') { reject(new Error('Use a ws:// address (obs-websocket on this computer or your network)')); return; }
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (!okHost(host)) { reject(new Error('OBS must be on this computer or your local network')); return; }
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port) || 4455, host);
    let open = false; let head = Buffer.alloc(0); let buf = Buffer.alloc(0); let frag = null; let closed = false;
    const t = setTimeout(() => { if (!open) { sock.destroy(); reject(new Error(`OBS isn't answering on ${u.host} (is OBS open, with Tools → WebSocket Server Settings → Enable on?)`)); } }, timeoutMs);
    sock.setNoDelay(true);
    sock.on('connect', () => sock.write(`GET ${u.pathname || '/'} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n${protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : ''}\r\n`));
    const write = (op, payload) => {
      if (sock.destroyed) return;
      const len = payload.length; const mask = crypto.randomBytes(4);
      const h = len < 126 ? Buffer.from([0x80 | op, 0x80 | len]) : len < 65536 ? Buffer.from([0x80 | op, 0x80 | 126, len >> 8, len & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 0x80 | 127; b.writeUInt32BE(Math.floor(len / 2 ** 32), 2); b.writeUInt32BE(len >>> 0, 6); return b; })();
      const data = Buffer.from(payload); for (let i = 0; i < data.length; i += 1) data[i] ^= mask[i & 3];
      sock.write(Buffer.concat([h, mask, data]));
    };
    const api = { send: (text) => write(1, Buffer.from(text)), close: (code = 1000) => { const b = Buffer.alloc(2); b.writeUInt16BE(code); write(8, b); setTimeout(() => sock.destroy(), 500).unref?.(); }, get open() { return open && !sock.destroyed; } };
    const done = (code, why) => { if (closed) return; closed = true; clearTimeout(t); if (!open) reject(new Error(why || 'OBS closed the connection')); else onClose?.(code, why, api); };
    sock.on('data', (d) => {
      if (!open) {
        head = Buffer.concat([head, d]);
        const end = head.indexOf('\r\n\r\n'); if (end < 0) { if (head.length > 16384) sock.destroy(); return; }
        const text = head.toString('latin1', 0, end); const rest = head.subarray(end + 4);
        const want = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
        if (!/^HTTP\/1\.1 101/.test(text) || !new RegExp(`\\r\\nsec-websocket-accept:\\s*${want.replace(/[+/=]/g, (c) => `\\${c}`)}`, 'i').test(text)) { sock.destroy(); done(0, 'That is not obs-websocket'); return; }
        open = true; clearTimeout(t); resolve(api);
        d = rest; if (!d.length) return;
      }
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      while (buf.length >= 2) {
        const fin = buf[0] & 0x80; const op = buf[0] & 0x0f; let len = buf[1] & 0x7f; let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(2) * 2 ** 32 + buf.readUInt32BE(6); off = 10; }
        if (len > 32 * 1024 * 1024) { sock.destroy(); return; }
        if (buf[1] & 0x80) off += 4; // (a server never masks; tolerate it)
        if (buf.length < off + len) return;
        const data = buf.subarray(off, off + len); buf = buf.subarray(off + len);
        if (op === 8) { const code = data.length >= 2 ? data.readUInt16BE(0) : 1005; const why = data.length > 2 ? data.toString('utf8', 2) : ''; try { write(8, data.subarray(0, 2)); } catch { /* gone */ } sock.end(); done(code, why); return; }
        if (op === 9) { write(10, data); continue; }
        if (op === 10) continue;
        if (op === 0 && frag) { frag.push(Buffer.from(data)); if (fin) { const all = Buffer.concat(frag); frag = null; onText?.(all.toString('utf8'), api); } continue; }
        if (op === 1) { if (fin) onText?.(data.toString('utf8'), api); else frag = [Buffer.from(data)]; }
      }
    });
    sock.on('error', (err) => done(1006, err.code === 'ECONNREFUSED' ? `OBS isn't listening on ${u.host} (Tools → WebSocket Server Settings → Enable)` : err.message));
    sock.on('close', () => done(1006, 'Connection lost'));
  });
}

function register(ipcMain, getWin, { dataDir } = {}) {
  const send = (ch, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
  const dir = path.join(dataDir || os.tmpdir(), 'interop');
  const safe = () => { try { const { safeStorage } = require('electron'); return safeStorage?.isEncryptionAvailable() ? safeStorage : null; } catch { return null; } };

  // ================= OSC =================
  const osc = { sock: null, port: 0, scope: 'local', out: null, rx: 0, tx: 0, dropped: 0, bad: 0, rate: { t: 0, n: 0 }, queue: [], flushing: false, last: '', from: new Map() };
  function oscStatus() { return { on: Boolean(osc.sock), port: osc.port, scope: osc.scope, rx: osc.rx, tx: osc.tx, dropped: osc.dropped, bad: osc.bad, last: osc.last, senders: [...osc.from.entries()].slice(-8).map(([k, at]) => ({ from: k, at })), lan: lanIPs() }; }
  const lanIPs = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal && isPrivate(i.address) && !/^169\.254\./.test(i.address)).map((i) => i.address);
  function onPacket(buf, rinfo) {
    if (osc.scope === 'local' ? !isLoop(rinfo.address) : !isPrivate(rinfo.address)) { osc.dropped += 1; return; }
    const now = Date.now();
    if (now - osc.rate.t > 1000) { osc.rate.t = now; osc.rate.n = 0; }
    let msgs; try { msgs = decode(buf); } catch { osc.bad += 1; return; }
    const from = `${v4(rinfo.address)}:${rinfo.port}`;
    osc.from.delete(from); osc.from.set(from, now); if (osc.from.size > 32) osc.from.delete(osc.from.keys().next().value);
    for (const m of msgs) {
      if ((osc.rate.n += 1) > 4000) { osc.dropped += 1; continue; }
      osc.rx += 1; osc.last = m.addr;
      osc.queue.push({ a: m.addr.slice(0, 256), v: m.args.map((x) => (Buffer.isBuffer(x) ? `<blob ${x.length}>` : x)), from });
    }
    if (!osc.flushing && osc.queue.length) { osc.flushing = true; setImmediate(() => { osc.flushing = false; const q = osc.queue; osc.queue = []; if (q.length) send('interop:osc', q); }); }
  }
  async function oscStart({ port = 9000, scope = 'local' } = {}) {
    port = Number(port); if (!(port >= 1024 && port <= 65535)) throw new Error('An OSC port between 1024 and 65535');
    if (!['local', 'lan'].includes(scope)) throw new Error('scope: local or lan');
    oscStop();
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: false, recvBufferSize: 1 << 20 }); // (a big buffer: a TouchDesigner burst isn't dropped by the system)
    await new Promise((res, rej) => { s.once('error', (err) => rej(new Error(err.code === 'EADDRINUSE' ? `Port ${port} is taken (another app listens there): pick another (/osc port 9001)` : err.message))); s.bind(port, scope === 'local' ? '127.0.0.1' : '0.0.0.0', res); });
    s.on('error', () => {});
    s.on('message', onPacket);
    osc.sock = s; osc.port = s.address().port; osc.scope = scope; osc.rx = 0; osc.dropped = 0; osc.bad = 0;
    return oscStatus();
  }
  function oscStop() { try { osc.sock?.close(); } catch { /* closed */ } osc.sock = null; osc.port = 0; return oscStatus(); }
  function outSock() {
    if (osc.out) return osc.out;
    osc.out = dgram.createSocket('udp4'); osc.out.on('error', () => {});
    osc.out.bind(0, () => { try { osc.out.setBroadcast(true); } catch { /* fine */ } });
    return osc.out;
  }
  // the window → apps: { to: [{ host, port }], msgs: [[addr, args]], bundle? }
  function oscSend(o) {
    const to = (Array.isArray(o?.to) ? o.to : []).filter((t) => okHost(String(t?.host)) && Number(t.port) >= 1 && Number(t.port) <= 65535).slice(0, 8);
    const msgs = (Array.isArray(o?.msgs) ? o.msgs : []).slice(0, 256);
    if (!to.length || !msgs.length) return 0;
    const pkts = [];
    try { if (o.bundle) pkts.push(encodeBundle(msgs)); else for (const [a, args] of msgs) pkts.push(encodeMessage(a, args)); } catch { return 0; }
    const s = outSock();
    for (const t of to) for (const p of pkts) { s.send(p, Number(t.port), t.host === 'localhost' ? '127.0.0.1' : t.host); osc.tx += 1; }
    return pkts.length;
  }

  // ================= Ableton Link (tempo follower) =================
  const link = { sock: null, peers: new Map(), bpm: null, playing: null, timer: 0, sent: '' };
  function linkState() { const now = Date.now(); for (const [k, p] of link.peers) if (now - p.at > Math.max(3000, p.ttl * 1000 + 1000)) link.peers.delete(k); const best = [...link.peers.values()].sort((a, b) => b.at - a.at)[0]; return { on: Boolean(link.sock), peers: link.peers.size, bpm: best?.bpm ?? null, playing: best?.playing ?? null }; }
  function linkPush() { const st = linkState(); const k = JSON.stringify(st); if (k !== link.sent) { link.sent = k; send('interop:link', st); } }
  async function linkStart(o = {}) {
    if (link.sock) return linkState();
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    await new Promise((res, rej) => { s.once('error', (err) => rej(new Error(`Link: ${err.message}`))); s.bind(Number(o.port) || LINK_PORT, '0.0.0.0', res); });
    s.on('error', () => {});
    if (!o.port) { try { s.addMembership(LINK_GROUP); } catch { /* no multicast here: unicast still works for tests */ } for (const ip of lanIPs()) { try { s.addMembership(LINK_GROUP, ip); } catch { /* joined already */ } } }
    s.on('message', (buf, rinfo) => {
      if (!isPrivate(rinfo.address)) return;
      const m = parseLink(buf); if (!m) return;
      if (m.type === 3) link.peers.delete(m.node); else if (m.bpm) link.peers.set(m.node, { bpm: m.bpm, playing: m.playing, ttl: m.ttl || 5, at: Date.now() });
      linkPush();
    });
    link.sock = s; link.timer = setInterval(linkPush, 1000);
    return linkState();
  }
  function linkStop() { clearInterval(link.timer); try { link.sock?.close(); } catch { /* closed */ } link.sock = null; link.peers.clear(); link.sent = ''; return linkState(); }

  // ================= OBS Browser Source: a page with the Lab's picture =================
  const PAGE_PORTS = [47850, 47851, 47852, 47853, 0];
  const page = { server: null, port: 0, peers: new Set(), cfg: { key: 'alpha', fit: 'contain', lo: 0.04, hi: 0.18 }, frames: 0, skipped: 0 };
  const pageOrigins = () => [`http://127.0.0.1:${page.port}`, `http://localhost:${page.port}`];
  const pageUrl = () => (page.server ? `http://127.0.0.1:${page.port}/` : null);
  function pageStatus() { return { on: Boolean(page.server), url: pageUrl(), port: page.port, viewers: page.peers.size, frames: page.frames, skipped: page.skipped, cfg: page.cfg }; }
  function frameOf(op, payload) {
    const len = payload.length;
    const h = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeUInt32BE(Math.floor(len / 2 ** 32), 2); b.writeUInt32BE(len >>> 0, 6); return b; })();
    return Buffer.concat([h, payload]);
  }
  function pageRequest(req, res) {
    const hostOk = [`127.0.0.1:${page.port}`, `localhost:${page.port}`].includes(req.headers.host);
    if (!isLoop(req.socket.remoteAddress) || !hostOk) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Not here'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
    const files = { '/': ['obs-page.html', 'text/html; charset=utf-8'], '/obs-page.js': ['obs-page.js', 'text/javascript; charset=utf-8'] };
    const f = files[String(req.url || '/').split('?')[0]];
    if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    fs.readFile(path.join(__dirname, f[0]), (err, buf) => {
      if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Missing'); return; }
      res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src blob:; connect-src ws://${req.headers.host}; base-uri 'none'; form-action 'none'` });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }
  function pageUpgrade(req, sock) {
    const bad = (n) => { try { sock.end(`HTTP/1.1 ${n} No\r\nConnection: close\r\n\r\n`); } catch { /* gone */ } };
    if (!isLoop(req.socket.remoteAddress) || !pageOrigins().includes(req.headers.origin) || req.headers.origin !== `http://${req.headers.host}`) return bad(403);
    if (String(req.headers.upgrade).toLowerCase() !== 'websocket' || !req.headers['sec-websocket-key']) return bad(400);
    if (page.peers.size >= 4) return bad(503);
    const accept = crypto.createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.setNoDelay(true);
    page.peers.add(sock);
    sock.write(frameOf(1, Buffer.from(JSON.stringify({ t: 'cfg', ...page.cfg }))));
    send('interop:viewers', page.peers.size);
    // the page only says "still here" (ping) and closes: anything else is ignored; nothing it says reaches the Lab
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]); if (buf.length > 4096) { sock.destroy(); return; }
      while (buf.length >= 6) { const len = buf[1] & 0x7f; if (len > 125) { sock.destroy(); return; } if (buf.length < 6 + len) return; const op = buf[0] & 0x0f; buf = buf.subarray(6 + len); if (op === 8) { sock.end(frameOf(8, Buffer.alloc(0))); return; } }
    });
    const gone = () => { if (page.peers.delete(sock)) send('interop:viewers', page.peers.size); };
    sock.on('error', gone); sock.on('close', gone);
  }
  async function pageStart(o = {}) {
    if (page.server) return pageStatus();
    const srv = http.createServer(pageRequest);
    srv.on('upgrade', pageUpgrade); srv.on('clientError', (_e, s) => s.destroy());
    srv.headersTimeout = 10000; srv.requestTimeout = 15000;
    for (const pt of o.port === 0 ? [0] : o.port ? [Number(o.port)] : PAGE_PORTS) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await new Promise((res) => { srv.once('error', () => res(false)); srv.listen(pt, '127.0.0.1', () => res(true)); });
      if (ok) break;
    }
    if (!srv.listening) throw new Error('Could not open a port for the OBS page');
    page.server = srv; page.port = srv.address().port; page.frames = 0; page.skipped = 0;
    return pageStatus();
  }
  function pageStop() { for (const s of page.peers) s.destroy(); page.peers.clear(); try { page.server?.close(); } catch { /* closed */ } page.server = null; send('interop:viewers', 0); return pageStatus(); }
  function pageFrame(data) {
    if (!page.server || !page.peers.size || !data) return;
    const bin = frameOf(2, data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    for (const s of page.peers) { if (s.writableLength > 2 * 1024 * 1024) { page.skipped += 1; continue; } s.write(bin); }
    page.frames += 1;
  }
  function pageCfg(c = {}) {
    if (['alpha', 'luma', 'none'].includes(c.key)) page.cfg.key = c.key;
    if (['contain', 'cover', 'stretch'].includes(c.fit)) page.cfg.fit = c.fit;
    for (const k of ['lo', 'hi']) if (Number.isFinite(c[k])) page.cfg[k] = Math.max(0, Math.min(1, Number(c[k])));
    const msg = frameOf(1, Buffer.from(JSON.stringify({ t: 'cfg', ...page.cfg })));
    for (const s of page.peers) s.write(msg);
    return pageStatus();
  }

  // ================= obs-websocket (v5) =================
  const ALLOWED = new Set(['GetVersion', 'GetStats', 'GetSceneList', 'GetCurrentProgramScene', 'SetCurrentProgramScene', 'GetCurrentPreviewScene', 'SetCurrentPreviewScene', 'GetStudioModeEnabled', 'TriggerStudioModeTransition', 'GetRecordStatus', 'StartRecord', 'StopRecord', 'ToggleRecord', 'PauseRecord', 'ResumeRecord', 'GetStreamStatus', 'StartStream', 'StopStream', 'GetInputList', 'CreateInput', 'GetSceneItemList', 'GetReplayBufferStatus', 'SaveReplayBuffer', 'CreateRecordChapter']);
  const obsFile = path.join(dir, 'obs.json');
  const obs = { url: 'ws://127.0.0.1:4455', pass: null, passSaved: false, ws: null, state: 'off', why: '', version: null, scene: null, scenes: [], rec: null, stream: null, reqs: new Map(), n: 0, retry: 0, retryMs: 3000, want: false };
  (function loadObs() {
    try {
      const j = JSON.parse(fs.readFileSync(obsFile, 'utf8'));
      if (typeof j.url === 'string') obs.url = j.url;
      if (j.kx) { const ss = safe(); if (ss) { try { obs.pass = ss.decryptString(Buffer.from(j.kx, 'base64')); obs.passSaved = true; } catch { /* another keychain: paste it again */ } } }
    } catch { /* first time */ }
  }());
  function saveObs() {
    try {
      const ss = safe(); const row = { url: obs.url };
      if (obs.pass && ss) { row.kx = ss.encryptString(obs.pass).toString('base64'); obs.passSaved = true; } else obs.passSaved = false;
      fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(obsFile, JSON.stringify(row, null, 1), { mode: 0o600 });
    } catch (err) { console.warn('interop: could not save the OBS settings', err.message); }
  }
  const obsStatus = () => ({ state: obs.state, why: obs.why, url: obs.url, hasPassword: Boolean(obs.pass), passwordSaved: obs.passSaved, keychain: Boolean(safe()), version: obs.version, scene: obs.scene, scenes: obs.scenes, rec: obs.rec, stream: obs.stream });
  const obsPush = () => send('interop:obs', obsStatus());
  function obsReq(type, data) {
    if (!obs.ws?.open || obs.state !== 'on') return Promise.reject(new Error(obs.state === 'auth' ? 'OBS needs its WebSocket password: /obs password' : 'OBS is not connected: /obs connect'));
    const id = `h${(obs.n += 1)}`;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { obs.reqs.delete(id); reject(new Error(`OBS didn't answer ${type}`)); }, 8000);
      obs.reqs.set(id, { resolve, reject, t });
      obs.ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, ...(data ? { requestData: data } : {}) } }));
    });
  }
  async function obsRefresh() {
    const [v, sc, rec, st] = await Promise.all([obsReq('GetVersion'), obsReq('GetSceneList'), obsReq('GetRecordStatus').catch(() => null), obsReq('GetStreamStatus').catch(() => null)]);
    obs.version = v ? `OBS ${v.obsVersion} · obs-websocket ${v.obsWebSocketVersion}` : null;
    obs.scenes = (sc?.scenes || []).map((s) => s.sceneName).reverse(); // (OBS lists them bottom-up)
    obs.scene = sc?.currentProgramSceneName || null;
    obs.rec = rec ? { active: Boolean(rec.outputActive), paused: Boolean(rec.outputPaused), time: rec.outputTimecode || '' } : null;
    obs.stream = st ? { active: Boolean(st.outputActive), time: st.outputTimecode || '' } : null;
    obsPush();
  }
  function onObs(text, ws) {
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!obs.want && obs.state !== 'connecting') return; // (a socket being let go)
    obs.ws = ws; // (Hello can come in the same packet as the handshake, before wsConnect's caller resumes)
    const d = m?.d || {};
    if (m.op === 0) { // Hello
      const auth = d.authentication;
      if (auth && !obs.pass) { obs.state = 'auth'; obs.why = 'OBS asks for its WebSocket password: /obs password'; obs.want = false; obsPush(); ws.close(1000); return; }
      ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, ...(auth ? { authentication: obsAuth(obs.pass, auth.salt, auth.challenge) } : {}), eventSubscriptions: 1 | 4 | 64 } })); // General, Scenes, Outputs
      return;
    }
    if (m.op === 2) { obs.state = 'on'; obs.why = ''; obs.retryMs = 3000; obsPush(); obsRefresh().catch(() => {}); return; }
    if (m.op === 7) { const r = obs.reqs.get(d.requestId); if (!r) return; obs.reqs.delete(d.requestId); clearTimeout(r.t); if (d.requestStatus?.result) r.resolve(d.responseData || {}); else r.reject(new Error(`OBS: ${d.requestStatus?.comment || `${d.requestType} failed (${d.requestStatus?.code})`}`)); return; }
    if (m.op === 5) {
      const e = d.eventType; const x = d.eventData || {};
      if (e === 'CurrentProgramSceneChanged') obs.scene = x.sceneName;
      else if (e === 'SceneListChanged') obs.scenes = (x.scenes || []).map((s) => s.sceneName).reverse();
      else if (e === 'SceneCreated' || e === 'SceneRemoved' || e === 'SceneNameChanged') { obsReq('GetSceneList').then((sc) => { obs.scenes = (sc.scenes || []).map((s) => s.sceneName).reverse(); obsPush(); }).catch(() => {}); return; }
      else if (e === 'RecordStateChanged') obs.rec = { active: Boolean(x.outputActive), paused: x.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED', time: '', path: x.outputPath || undefined };
      else if (e === 'StreamStateChanged') obs.stream = { active: Boolean(x.outputActive), time: '' };
      else if (e === 'ExitStarted') { obs.why = 'OBS is closing'; }
      else return;
      obsPush(); send('interop:obs-event', { type: e, data: { sceneName: x.sceneName, outputActive: x.outputActive, outputState: x.outputState } });
    }
  }
  async function obsConnect(o = {}) {
    if (o.url) { const u = String(o.url).trim(); obs.url = /^wss?:\/\//.test(u) ? u : `ws://${u}`; saveObs(); }
    obsDisconnect(true);
    obs.want = true; obs.state = 'connecting'; obs.why = ''; obsPush();
    try {
      obs.ws = await wsConnect(obs.url, { protocol: 'obswebsocket.json', onText: onObs, onClose: onObsClose });
    } catch (err) { obs.state = 'off'; obs.why = err.message; obsPush(); scheduleRetry(); return obsStatus(); }
    // (wait for Identified, or the auth answer)
    for (let i = 0; i < 50 && obs.state === 'connecting'; i += 1) await new Promise((r) => setTimeout(r, 60)); // eslint-disable-line no-await-in-loop
    return obsStatus();
  }
  function onObsClose(code, why, ws) {
    if (ws !== obs.ws) return; // (one let go on purpose)
    for (const r of obs.reqs.values()) { clearTimeout(r.t); r.reject(new Error('OBS disconnected')); }
    obs.reqs.clear(); obs.ws = null;
    if (code === 4009) { obs.state = 'auth'; obs.why = 'OBS refused the password: paste it again (/obs password)'; obs.want = false; } else if (obs.state !== 'auth') { obs.state = 'off'; obs.why = why || (code === 4010 ? 'This obs-websocket is too old (OBS 28+ has v5)' : 'OBS disconnected'); }
    obsPush(); scheduleRetry();
  }
  function scheduleRetry() {
    clearTimeout(obs.retry);
    if (!obs.want) return;
    obs.retry = setTimeout(() => { if (obs.want && !obs.ws) obsConnect().catch(() => {}); }, obs.retryMs);
    obs.retryMs = Math.min(30000, obs.retryMs * 2);
  }
  function obsDisconnect(quiet = false) {
    obs.want = false; clearTimeout(obs.retry);
    const w = obs.ws; obs.ws = null;
    if (w) { try { w.close(1000); } catch { /* gone */ } }
    for (const r of obs.reqs.values()) { clearTimeout(r.t); r.reject(new Error('OBS disconnected')); }
    obs.reqs.clear();
    if (!quiet) { obs.state = 'off'; obs.why = ''; obsPush(); }
    return obsStatus();
  }

  // ---------- IPC ----------
  ipcMain.handle('interop:osc-start', (_e, o) => oscStart(o || {}));
  ipcMain.handle('interop:osc-stop', () => oscStop());
  ipcMain.handle('interop:osc-status', () => oscStatus());
  ipcMain.on('interop:osc-send', (_e, o) => { oscSend(o); });
  ipcMain.handle('interop:link-start', (_e, o) => linkStart(o || {}));
  ipcMain.handle('interop:link-stop', () => linkStop());
  ipcMain.handle('interop:link-status', () => linkState());
  ipcMain.handle('interop:page-start', (_e, o) => pageStart(o || {}));
  ipcMain.handle('interop:page-stop', () => pageStop());
  ipcMain.handle('interop:page-status', () => pageStatus());
  ipcMain.handle('interop:page-cfg', (_e, c) => pageCfg(c || {}));
  ipcMain.on('interop:page-frame', (_e, data) => pageFrame(data));
  ipcMain.handle('interop:obs-connect', (_e, o) => obsConnect(o || {}));
  ipcMain.handle('interop:obs-disconnect', () => obsDisconnect());
  ipcMain.handle('interop:obs-status', () => obsStatus());
  // the password: pasted once (a masked field in the window), kept here; null forgets it. Never returned, never logged.
  ipcMain.handle('interop:obs-password', (_e, p) => {
    obs.pass = typeof p === 'string' && p.length ? p.slice(0, 256) : null;
    saveObs();
    return { hasPassword: Boolean(obs.pass), saved: obs.passSaved, keychain: Boolean(safe()) };
  });
  ipcMain.handle('interop:obs-req', async (_e, type, data) => {
    if (!ALLOWED.has(type)) throw new Error(`Hearth doesn't send ${type} to OBS`);
    const r = await obsReq(type, data && typeof data === 'object' ? data : undefined);
    if (/^(Start|Stop|Toggle|Pause|Resume)(Record|Stream)$/.test(type) || type === 'SetCurrentProgramScene') setTimeout(() => obsRefresh().catch(() => {}), 300);
    return r;
  });
  // (tests only, in a throwaway copy: dev/checks/interop.js) UDP to / from the app, a hidden window as OBS
  ipcMain.handle('interop:test', async (_e, o = {}) => {
    if (!process.env.HEARTH_TEST_SAVE_DIR) throw new Error('Tests only');
    const T = (register.test ||= { got: [], sock: null, wins: new Map() });
    if (o.oscSend) { const s = dgram.createSocket('udp4'); const pk = o.oscSend.bundle ? encodeBundle(o.oscSend.msgs) : encodeMessage(o.oscSend.addr, o.oscSend.args || []); await new Promise((r) => s.send(pk, o.oscSend.port, '127.0.0.1', r)); s.close(); return pk.length; }
    if (o.oscListen != null) { T.sock?.close(); T.got = []; T.sock = dgram.createSocket('udp4'); T.sock.on('message', (b) => { try { for (const m of decode(b)) T.got.push({ a: m.addr, v: m.args, t: Date.now() }); } catch { T.got.push({ bad: true }); } }); await new Promise((r) => T.sock.bind(Number(o.oscListen) || 0, '127.0.0.1', r)); return T.sock.address().port; }
    if (o.oscGot) { const g = T.got; if (o.clear) T.got = []; return g; }
    if (o.link) { const s = dgram.createSocket('udp4'); await new Promise((r) => s.send(linkPacket(o.link), o.link.port, '127.0.0.1', r)); s.close(); return true; }
    if (o.open) { T.wins.get(o.win || 'a')?.destroy(); const { BrowserWindow } = require('electron'); const w = new BrowserWindow({ show: false, width: o.w || 640, height: o.h || 360, transparent: true, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } }); T.wins.set(o.win || 'a', w); await w.loadURL(o.open); return true; }
    if (o.eval) return T.wins.get(o.win || 'a')?.webContents.executeJavaScript(o.eval, true);
    if (o.close) { for (const w of T.wins.values()) w.destroy(); T.wins.clear(); T.sock?.close(); T.sock = null; return true; }
    if (o.get) return new Promise((res) => { http.get({ host: '127.0.0.1', port: page.port, path: o.get, headers: { Host: o.host || `127.0.0.1:${page.port}` } }, (rs) => { rs.resume(); res({ status: rs.statusCode, csp: rs.headers['content-security-policy'] || '' }); }).on('error', (err) => res({ err: err.message })); });
    if (o.raw) {
      return new Promise((res) => {
        const r = http.request({ host: '127.0.0.1', port: page.port, path: '/', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), Host: o.raw.host || `127.0.0.1:${page.port}`, ...(o.raw.origin ? { Origin: o.raw.origin } : {}) } });
        r.on('upgrade', (rs, s) => { s.destroy(); res(rs.statusCode); }); r.on('response', (rs) => res(rs.statusCode)); r.on('error', (err) => res(err.message)); r.end();
      });
    }
    if (o.fakeObs) return process.env.HEARTH_FAKE_OBS ? JSON.parse(process.env.HEARTH_FAKE_OBS) : null; // { url, password, state } from smoke.js --fake-obs
    if (o.fakeObsState) { const f = JSON.parse(process.env.HEARTH_FAKE_OBS || 'null'); if (!f) return null; return new Promise((res) => { http.get(f.state, (rs) => { let s = ''; rs.on('data', (d) => { s += d; }); rs.on('end', () => res(JSON.parse(s))); }).on('error', (err) => res({ err: err.message })); }); }
    if (o.obsFile) { try { return fs.readFileSync(obsFile, 'utf8'); } catch { return ''; } }
    return null;
  });
  return { oscStart, oscStop, pageStart, pageStop, obsConnect };
}

module.exports = { register, encodeMessage, encodeBundle, decode, parseLink, linkPacket, obsAuth, wsConnect, isPrivate, okHost };
