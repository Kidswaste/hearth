// Real Chromium networking against local fixtures; never contacts OSM or Google.
// Run with Electron: electron dev/map-network-test.js
// The adapter maps localhost routes to service URLs only inside the production callbacks.
// map-session-test.js separately checks the production URL filters and setup lifecycle.
const { app, BrowserWindow, session } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-map-network-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {}); // Keep the test alive between its pre-update and post-update renderers.
const guard = require('../chromeguard');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
const requests = [];
const server = http.createServer((req, res) => {
  requests.push({ path: req.url, headers: req.headers });
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><title>Isolated map network check</title>'); }
  const status = /\/(cached-)?blocked/.test(req.url) ? 403 : req.url.startsWith('/throttle') ? 429 : 200;
  res.writeHead(status, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', ETag: 'fixture-tile' });
  res.end(png);
});
let win;
const timeout = setTimeout(() => finish(new Error('Network check timed out')), 30000);
function finish(error) {
  clearTimeout(timeout);
  if (error) console.error(error.stack || error);
  if (win && !win.isDestroyed()) win.destroy();
  server.close();
  app.exit(error ? 1 : 0);
}
(async () => {
  await app.whenReady();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ses = session.fromPartition('map-network-test');
  const semanticURL = url => new URL(url).pathname.startsWith('/google') ? 'https://accounts.google.com/signin' : 'https://tile.openstreetmap.org/12/2074/1409.png';
  const adapt = event => (filter, callback) => ses.webRequest[event]({ urls: [`${origin}/*`] }, (details, cb) => callback({ ...details, url: semanticURL(details.url) }, cb));
  win = new BrowserWindow({ show: false, webPreferences: { session: ses, backgroundThrottling: false } });
  await win.loadURL(origin);
  const image = route => win.webContents.executeJavaScript(`new Promise(resolve => { const img = new Image(); img.onload = () => resolve('loaded'); img.onerror = () => resolve('error'); img.src = ${JSON.stringify(origin)} + ${JSON.stringify(route)}; document.body.append(img); })`);
  assert.strictEqual(await image('/cached-blocked.png'), 'loaded', 'reproduce the original error PNG decoding before the fix');
  guard.hookSession({ webRequest: { onBeforeSendHeaders: adapt('onBeforeSendHeaders'), onHeadersReceived: adapt('onHeadersReceived') } });
  // A fresh renderer models the updater relaunch while retaining the session HTTP cache.
  win.destroy();
  win = new BrowserWindow({ show: false, webPreferences: { session: ses, backgroundThrottling: false } });
  await win.loadURL(origin);
  assert.strictEqual(await image('/cached-blocked.png'), 'error', 'previously cached 403 PNG must not paint after the update');
  assert.strictEqual(requests.filter(r => r.path === '/cached-blocked.png').length, 1, 'the blocked response was served from cache');
  assert.strictEqual(await image('/ok.png'), 'loaded', 'normal tiles must decode');
  assert.strictEqual(await image('/ok.png'), 'loaded', 'cached normal tiles must decode');
  assert.strictEqual(requests.filter(r => r.path === '/ok.png').length, 1, 'Chromium cache must remain effective');
  assert.strictEqual(await image('/blocked.png'), 'error', '403 PNG must not paint');
  assert.strictEqual(await image('/blocked.png'), 'error', 'repeat 403 PNG must not paint');
  assert.strictEqual(await image('/throttle.png'), 'error', '429 PNG must not paint');
  assert.strictEqual(await image('/google.png'), 'loaded', 'Google route must coexist');
  const tile = requests.find(r => r.path === '/ok.png').headers;
  assert.strictEqual(tile['user-agent'], 'Hearth/1.0 (+https://github.com/Kidswaste/hearth)');
  assert(!Object.keys(tile).some(k => k.startsWith('sec-ch-ua')), 'no conflicting browser identity');
  assert(!tile['cache-control'] && !tile.pragma, 'no cache bypass');
  const google = requests.find(r => r.path === '/google.png').headers;
  assert(google['sec-ch-ua'].includes('Google Chrome'), 'Google retains client hints');
  console.log('PASS: actual Electron requests identify Hearth, preserve Google hints, reuse cached tiles and reject 403/429 PNG bodies. All traffic stayed on localhost.');
  finish();
})().catch(finish);
