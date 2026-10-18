#!/usr/bin/env node
// Session regression: Electron only retains the last listener for each webRequest event.
// No requests leave the process. Run: node dev/map-session-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const CDP = require('../chrome-cdp');
const listeners = {};
const registrations = {};
const ses = { webRequest: Object.fromEntries(['onBeforeSendHeaders', 'onHeadersReceived'].map(event => [event, (filter, fn) => {
  registrations[event] = (registrations[event] || 0) + 1;
  listeners[event] = { filter, fn };
}])) };
const events = {};
const electron = { app: { on: (event, fn) => { events[event] = fn; }, whenReady: () => Promise.resolve() }, session: { defaultSession: ses }, webContents: { getAllWebContents: () => [] } };
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../chromeguard.js'), 'utf8'), {
  require: name => name === 'electron' ? electron : CDP, module: mod, process, URL, setTimeout, console,
});
const invoke = (event, details) => { let result; listeners[event].fn(details, r => { result = r; }); return result; };
(async () => {
  mod.exports.setup();
  await Promise.resolve();
  mod.exports.hookSession(ses);
  events['session-created'](ses);
  assert.strictEqual(registrations.onBeforeSendHeaders, 1, 'setup must not replace or duplicate the shared handler');
  assert.strictEqual(registrations.onHeadersReceived, 1);
  const filter = listeners.onBeforeSendHeaders.filter.urls;
  assert(filter.includes('https://tile.openstreetmap.org/*'));
  assert(filter.includes('*://accounts.google.com/*'));
  assert.deepStrictEqual(Array.from(listeners.onHeadersReceived.filter.urls), ['https://tile.openstreetmap.org/*']);
  const original = { 'user-agent': 'generic Chrome', 'Sec-CH-UA': 'Chromium', 'sec-ch-ua-platform': 'Windows', 'If-None-Match': 'tile-etag', 'If-Modified-Since': 'Wed, 14 Oct 2026 00:00:00 GMT', Accept: 'image/png', Cookie: 'unchanged' };
  const tile = invoke('onBeforeSendHeaders', { url: 'https://tile.openstreetmap.org/12/2074/1409.png', requestHeaders: original }).requestHeaders;
  assert.strictEqual(tile['User-Agent'], 'Hearth/1.0 (+https://github.com/Kidswaste/hearth)');
  assert.strictEqual(Object.keys(tile).filter(k => k.toLowerCase() === 'user-agent').length, 1);
  assert(!Object.keys(tile).some(k => k.toLowerCase().startsWith('sec-ch-ua')));
  for (const key of ['If-None-Match', 'If-Modified-Since', 'Accept', 'Cookie']) assert.strictEqual(tile[key], original[key]);
  assert(!Object.keys(tile).some(k => /^(referer|cache-control|pragma)$/i.test(k)), 'do not invent referrers or bypass caching');
  assert.strictEqual(original['user-agent'], 'generic Chrome', 'do not mutate input');
  const google = invoke('onBeforeSendHeaders', { url: 'https://accounts.google.com/signin', requestHeaders: original }).requestHeaders;
  assert.deepStrictEqual(google, CDP.withHints(original, process.versions.chrome || '130.0.0.0', process.platform));
  for (const statusCode of [200, 304, 403, 429, 500]) {
    const result = invoke('onHeadersReceived', { url: 'https://tile.openstreetmap.org/12/2074/1409.png', statusCode });
    assert.strictEqual(result.cancel, statusCode >= 400, `status ${statusCode}`);
    assert.deepStrictEqual(Object.keys(result), ['cancel'], 'successful cache headers remain untouched');
  }
  for (const url of ['https://tile.openstreetmap.org.example.com/a.png', 'https://accounts.google.com/a.png']) {
    assert.strictEqual(invoke('onHeadersReceived', { url, statusCode: 403 }).cancel, false);
  }
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert(!main.includes('.onBeforeSendHeaders('), 'main must not replace the shared session handler');
  console.log('PASS: one shared session handler, native OSM identity, unchanged Google hints/cache validators, error-tile cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
