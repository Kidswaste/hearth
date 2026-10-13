// A fake Chrome DevTools endpoint for dev/chrome-test.js (round 30, chrome stream): plain Node, no dependency.
// HTTP /json/version + a WebSocket (handshake and frames by hand) that answers the CDP calls chrome-cdp.js makes, over
// a tiny pretend page per target: a title, a button (#go: clicking it in its box changes the title), a text box
// (#q: focus + Input.insertText fill it), its text, navigation (Page.loadEventFired), a JPEG for screenshots.
// Page scripts (Runtime.evaluate) run in a vm with a small stand-in document, so the client's own scripts are tested.
//   const f = await require('./fake-cdp').start(); f.port, f.log (methods called), f.targets, f.stop()
const http = require('http');
const crypto = require('crypto');
const vm = require('vm');

function frame(text) {
  const data = Buffer.from(text);
  const len = data.length;
  const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255])]);
  return Buffer.concat([head, data]);
}
// client frames are masked; returns [messages, rest]
function parse(buf) {
  const out = [];
  let off = 0;
  while (buf.length - off >= 2) {
    const op = buf[off] & 15; let len = buf[off + 1] & 127; let p = off + 2;
    if (len === 126) { if (buf.length - p < 2) break; len = buf.readUInt16BE(p); p += 2; } else if (len === 127) { if (buf.length - p < 8) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    const masked = buf[off + 1] & 128;
    const mask = masked ? buf.slice(p, p + 4) : null; if (masked) p += 4;
    if (buf.length - p < len) break;
    const data = Buffer.from(buf.slice(p, p + len));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    out.push({ op, text: data.toString('utf8') });
    off = p + len;
  }
  return [out, buf.slice(off)];
}

// a pretend page: what a page script can see
function makePage(url) {
  const page = { url, title: 'Fake page', ready: 'complete', clicks: 0, focused: null, loads: 0 };
  const el = (id, box, extra = {}) => ({ id, value: '', innerText: '', textContent: '', box, getBoundingClientRect: () => ({ left: box.x, top: box.y, width: box.w, height: box.h }), scrollIntoView() {}, focus() { page.focused = this; }, select() { this.selected = true; }, ...extra });
  page.els = {
    '#go': el('go', { x: 100, y: 40, w: 80, h: 30 }, { innerText: 'Go' }),
    '#q': el('q', { x: 100, y: 100, w: 200, h: 30 }),
    '#hidden': el('hidden', { x: 0, y: 0, w: 0, h: 0 }),
  };
  page.text = () => `Fake page at ${page.url}\nGo`;
  page.run = (expr) => {
    const document = {
      get title() { return page.title; }, get readyState() { return page.ready; },
      querySelector: (s) => page.els[s] || null,
      get activeElement() { return page.focused; },
      body: { get innerText() { return page.text(); }, get textContent() { return page.text(); } },
      execCommand() { return true; },
    };
    const ctx = { document, location: { get href() { return page.url; } }, getSelection: () => '', String, JSON, Math, Promise };
    return vm.runInNewContext(expr, ctx, { timeout: 1000 });
  };
  return page;
}

async function start() {
  const log = [];
  const targets = new Map(); // id → page
  const sessions = new Map(); // session id → target id
  let n = 0;
  const addTarget = (url) => { const id = `T${++n}`; targets.set(id, makePage(url)); return id; };
  addTarget('about:blank');
  const server = http.createServer((req, res) => {
    if (req.url === '/json/version') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ Browser: 'FakeChrome/152.0', 'Protocol-Version': '1.3', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/fake` }));
      return;
    }
    res.statusCode = 404; res.end();
  });
  const sockets = new Set();
  server.on('upgrade', (req, socket) => {
    const accept = crypto.createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    let buf = Buffer.alloc(0);
    const send = (o) => { try { socket.write(frame(JSON.stringify(o))); } catch { /* gone */ } };
    socket.on('data', (d) => {
      let msgs; [msgs, buf] = parse(Buffer.concat([buf, d]));
      for (const m of msgs) {
        if (m.op === 8) { socket.end(); return; }
        if (m.op !== 1) continue;
        const { id, method, params = {}, sessionId } = JSON.parse(m.text);
        log.push(method);
        const page = sessionId ? targets.get(sessions.get(sessionId)) : null;
        const reply = (result) => send({ id, result, ...(sessionId ? { sessionId } : {}) });
        const fail = (message) => send({ id, error: { code: -32000, message }, ...(sessionId ? { sessionId } : {}) });
        try {
          switch (method) {
            case 'Target.getTargets': reply({ targetInfos: [...targets].map(([tid, p]) => ({ targetId: tid, type: 'page', url: p.url, title: p.title, attached: false })) }); break;
            case 'Target.setDiscoverTargets': reply({}); break;
            case 'Target.createTarget': reply({ targetId: addTarget(params.url) }); break;
            case 'Target.attachToTarget': { if (!targets.has(params.targetId)) { fail('No target with given id found'); break; } const sid = `S${params.targetId}`; sessions.set(sid, params.targetId); reply({ sessionId: sid }); break; }
            case 'Target.activateTarget': reply({}); break;
            case 'Target.closeTarget': targets.delete(params.targetId); reply({ success: true }); send({ method: 'Target.targetDestroyed', params: { targetId: params.targetId } }); break;
            case 'Page.enable': case 'Runtime.enable': reply({}); break;
            case 'Page.navigate': page.url = params.url; page.title = `Page ${params.url.split('/').pop()}`; page.loads += 1; reply({ frameId: 'F', loaderId: `L${page.loads}` }); setTimeout(() => send({ method: 'Page.loadEventFired', params: { timestamp: Date.now() / 1000 }, sessionId }), 30); break;
            case 'Page.reload': page.loads += 1; reply({}); break;
            case 'Page.getNavigationHistory': reply({ currentIndex: 0, entries: [{ id: 1, url: page.url, title: page.title }] }); break;
            case 'Runtime.evaluate': {
              let value;
              try { value = page.run(params.expression); } catch (err) { send({ id, sessionId, result: { result: { type: 'object' }, exceptionDetails: { text: 'Uncaught', exception: { description: `${err.name}: ${err.message}` } } } }); break; }
              Promise.resolve(value).then((v) => reply({ result: { type: typeof v, value: v } }));
              break;
            }
            case 'Input.dispatchMouseEvent': {
              if (params.type === 'mouseReleased') { const hit = Object.values(page.els).find((e) => params.x >= e.box.x && params.x <= e.box.x + e.box.w && params.y >= e.box.y && params.y <= e.box.y + e.box.h); if (hit?.id === 'go') { page.clicks += 1; page.title = `Clicked ${page.clicks}`; } }
              reply({}); break;
            }
            case 'Input.insertText': if (page.focused) page.focused.value = page.focused.selected ? params.text : page.focused.value + params.text; reply({}); break;
            case 'Input.dispatchKeyEvent': if (params.type === 'keyDown' && params.key === 'Enter') page.entered = (page.entered || 0) + 1; reply({}); break;
            case 'Page.getLayoutMetrics': reply({ cssVisualViewport: { pageX: 0, pageY: 0, clientWidth: 2000, clientHeight: 1000 } }); break;
            case 'Page.captureScreenshot': page.shotParams = params; reply({ data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]).toString('base64') }); break;
            case 'Browser.close': reply({}); setTimeout(() => socket.end(), 20); break;
            default: fail(`'${method}' wasn't found`);
          }
        } catch (err) { fail(err.message); }
      }
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { port: server.address().port, log, targets, stop: () => { for (const s of sockets) s.destroy(); server.close(); } };
}

// Test pages for dev/checks/chrome.js (smoke --pw-chrome): an app page (a button, a prompt box), a page whose "Sign in"
// opens a popup, Google's refusal page as it looks (on 127.0.0.1: HEARTH_CHROME_REJECT_HOSTS lets it count), a chat page.
const PAGES = {
  '/page': '<!doctype html><title>Hearth test page</title><p>Hello from the test page</p><button id="go" onclick="document.title=\'Clicked\'" style="width:120px;height:40px">Go</button><br><textarea id="q" placeholder="Describe your song" style="width:300px;height:60px"></textarea>',
  '/start': '<!doctype html><title>Test app</title><p>A test app</p><a id="signin" href="/v3/signin/rejected?continue=x" target="_blank" style="display:inline-block;padding:10px">Sign in with Google</a>',
  '/v3/signin/rejected': '<!doctype html><title>Sign in - Google Accounts</title><h1>Couldn’t sign you in</h1><p>This browser or app may not be secure. <a href="#">Learn more</a></p><p>Try using a different browser. If you’re already using a supported browser, you can try again to sign in.</p>',
  '/chat': '<!doctype html><title>Test chat</title><a id="signin" href="/v3/signin/rejected?continue=chat" style="display:inline-block;padding:10px">Sign in</a><textarea id="box" style="width:300px;height:60px" onkeydown="if(event.key===\'Enter\'){event.preventDefault();document.title=\'sent: \'+this.value}"></textarea>',
};
// (round 30, pinboard) a Pinterest-like search and an Unsplash-like one (dev/fixtures/pinboard-*.html) with their
// pictures: small solid PNGs, a color per address (dev/checks/pinboard.js)
function png(seed) {
  const zlib = require('zlib');
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const W = 24; const H = 32; const row = Buffer.alloc(1 + W * 3);
  for (let x = 0; x < W; x++) row.set([h & 255, (h >> 8) & 255, (h >> 16) & 255], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: H }, () => row));
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function pinboardPage(url) {
  const p = url.split('?')[0];
  const fix = (f) => require('fs').readFileSync(require('path').join(__dirname, 'fixtures', f), 'utf8');
  if (/^\/pinboard\/(i|u)\//.test(p)) return { type: 'image/png', body: png(url) };
  if (/^\/pinboard\/search\b/.test(p)) return { type: 'text/html; charset=utf-8', body: fix('pinboard-pinterest.html') };
  if (/^\/pinboard\/s\/photos\//.test(p)) return { type: 'text/html; charset=utf-8', body: fix('pinboard-unsplash.html') };
  if (/^\/pinboard\/login\b/.test(p)) return { type: 'text/html; charset=utf-8', body: '<!doctype html><title>Log in</title><form><input type="email"><input type="password"><button>Log in</button></form>' };
  return null;
}

async function pages() {
  const server = http.createServer((req, res) => {
    const pb = /^\/pinboard\//.test(req.url) ? pinboardPage(req.url) : null;
    if (pb) { res.statusCode = 200; res.setHeader('Content-Type', pb.type); res.end(pb.body); return; }
    const html = PAGES[req.url.split('?')[0]];
    res.statusCode = html ? 200 : 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html || 'not found');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, stop: () => server.close() };
}

module.exports = { start, pages };
