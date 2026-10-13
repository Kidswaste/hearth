#!/usr/bin/env node
// Unit test for Hearth's Chrome (round 30, chrome stream), plain Node: finding Chrome on a Mac, on Windows (standard
// folders and the registry's App Paths) and on Linux, Edge / Brave as fallbacks, the owner's pick first; which sites are
// Google-only; Google's refusal page (by address and by its words, only on Google's host); the client hints (the cheap
// fix); then the DevTools client against dev/fake-cdp.js: connect, list / open / close pages, navigate and wait for
// the load, read the title and text, click a button in its box, type into a box, a screenshot (scaled), wait for a
// selector, errors in plain words, the connection closing.
//   node dev/chrome-test.js
const path = require('path');
const assert = require('assert');
const C = require(path.join(__dirname, '..', 'chrome-cdp.js'));
const fake = require('./fake-cdp');

let failed = 0; let passed = 0;
async function t(name, fn) { try { await fn(); passed += 1; console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}: ${err.message}`); } }

(async () => {
  // ---------- finding Chrome ----------
  await t('Mac: /Applications Google Chrome first, then ~/Applications, Edge, Brave', async () => {
    const has = (set) => (p) => set.includes(p);
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const edge = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    const brave = '/Users/o/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
    const env = {};
    assert.strictEqual((await C.find({ platform: 'darwin', env, home: '/Users/o', exists: has([edge, chrome]) })).path, chrome);
    const e = await C.find({ platform: 'darwin', env, home: '/Users/o', exists: has([brave, edge]) });
    assert.strictEqual(e.kind, 'edge'); assert.strictEqual(e.name, 'Microsoft Edge');
    assert.strictEqual((await C.find({ platform: 'darwin', env, home: '/Users/o', exists: has([brave]) })).kind, 'brave');
    assert.strictEqual(await C.find({ platform: 'darwin', env, home: '/Users/o', exists: () => false }), null);
    assert.strictEqual((await C.find({ platform: 'darwin', env, home: '/Users/o', exists: has([chrome, brave]), prefer: 'brave' })).kind, 'brave', 'the owner\'s pick first');
  });
  await t('Windows: Program Files, LocalAppData, the registry\'s App Paths', async () => {
    const env = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\o\\AppData\\Local' };
    const list = C.candidates({ platform: 'win32', env, home: 'C:\\Users\\o' }).map((c) => c.path);
    assert.ok(list.includes('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'));
    assert.ok(list.includes('C:\\Users\\o\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'));
    assert.ok(list.includes('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'));
    const local = 'C:\\Users\\o\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
    assert.strictEqual((await C.find({ platform: 'win32', env, exists: (p) => p === local, regQuery: async () => null })).path, local);
    // installed somewhere unusual: only the registry knows
    const odd = 'D:\\Apps\\Chrome\\chrome.exe';
    const asked = [];
    const r = await C.find({ platform: 'win32', env, exists: (p) => p === odd, regQuery: async (k) => { asked.push(k); return /chrome\.exe$/.test(k) && k.startsWith('HKLM') ? odd : null; } });
    assert.strictEqual(r.path, odd); assert.strictEqual(r.how, 'registry');
    assert.ok(asked.some((k) => k === 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe'));
    assert.ok(asked.some((k) => /HKCU.*msedge\.exe$/.test(k)), 'Edge is asked for too');
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    assert.strictEqual((await C.find({ platform: 'win32', env, exists: (p) => p === edge, regQuery: async () => null })).kind, 'edge');
  });
  await t('Linux: PATH names and /opt/google/chrome; HEARTH_CHROME_PATH wins', async () => {
    const env = { PATH: '/usr/local/bin:/usr/bin' };
    assert.strictEqual((await C.find({ platform: 'linux', env, exists: (p) => p === '/usr/bin/google-chrome-stable' })).path, '/usr/bin/google-chrome-stable');
    assert.strictEqual((await C.find({ platform: 'linux', env, exists: (p) => p === '/opt/google/chrome/chrome' })).kind, 'chrome');
    assert.strictEqual((await C.find({ platform: 'linux', env, exists: (p) => p === '/usr/bin/chromium' })).kind, 'chromium');
    const set = await C.find({ platform: 'linux', env: { ...env, HEARTH_CHROME_PATH: '/x/chrome' }, exists: (p) => p === '/x/chrome' || p === '/usr/bin/chromium' });
    assert.strictEqual(set.path, '/x/chrome'); assert.strictEqual(set.name, 'Google Chrome'); assert.strictEqual(set.how, 'set');
  });

  // ---------- sites and pages ----------
  await t('Google-only sites', () => {
    for (const u of ['https://gemini.google.com/app', 'https://aistudio.google.com/', 'https://notebooklm.google.com/', 'https://studio.youtube.com/', 'https://labs.google/fx/tools/whisk', 'https://docs.google.com/x']) assert.ok(C.googleOnly(u), u);
    for (const u of ['https://fonts.google.com/', 'https://www.google.com/search?q=x', 'https://chatgpt.com/', 'https://suno.com/', 'https://www.youtube.com/watch', 'https://evilgoogle.com/', 'nonsense']) assert.ok(!C.googleOnly(u), u);
  });
  await t('Google\'s refusal page: by address, by its words, only on Google\'s host', () => {
    assert.ok(C.isRejection({ url: 'https://accounts.google.com/v3/signin/rejected?continue=x' }));
    assert.ok(C.isRejection({ url: 'https://accounts.google.com/signin/v2/deniedsigninrejected?x' }));
    assert.ok(C.isRejection({ url: 'https://accounts.google.com/v3/signin/identifier?x', text: 'Couldn’t sign you in\nThis browser or app may not be secure. Learn more' }));
    assert.ok(C.isRejection({ url: 'https://accounts.google.com/x', text: "Couldn't sign you in" }));
    assert.ok(!C.isRejection({ url: 'https://accounts.google.com/v3/signin/identifier', text: 'Sign in · Use your Google Account' }));
    assert.ok(!C.isRejection({ url: 'https://evil.example/', text: "Couldn't sign you in — This browser or app may not be secure" }), 'another site saying it is not Google');
    assert.ok(C.isRejection({ url: 'http://127.0.0.1:5/fake', text: "Couldn't sign you in", hosts: ['127.0.0.1'] }), 'the test host, when asked');
  });
  await t('client hints say Google Chrome, the system matches the user agent', () => {
    const h = C.clientHints('152.0.7977.130', 'darwin');
    assert.ok(/"Google Chrome";v="152"/.test(h['sec-ch-ua']) && /"Chromium";v="152"/.test(h['sec-ch-ua']));
    assert.strictEqual(h['sec-ch-ua-platform'], '"macOS"');
    assert.ok(/Macintosh/.test(C.userAgent('152.0.7977.130', 'darwin')) && /Chrome\/152\.0\.0\.0 /.test(C.userAgent('152.0.7977.130', 'darwin')));
    assert.ok(/Windows NT 10\.0/.test(C.userAgent('152.0.1.2', 'win32')));
    assert.ok(!/Electron/.test(C.userAgent('152.0.1.2', 'linux')));
    const out = C.withHints({ 'User-Agent': 'x', 'sec-ch-ua': '"Chromium";v="152", "Not_A Brand";v="99"', 'Sec-CH-UA-Platform': '"Windows"', Cookie: 'c' }, '152.0.7977.130', 'win32');
    assert.strictEqual(out.Cookie, 'c'); assert.strictEqual(out['User-Agent'], 'x');
    assert.ok(/Google Chrome/.test(out['sec-ch-ua'])); assert.strictEqual(out['sec-ch-ua-platform'], '"Windows"');
    assert.ok(!('Sec-CH-UA-Platform' in out), 'no duplicate header in another case');
    assert.ok(!('sec-ch-ua-full-version-list' in out), 'the full list only when the page asked');
    assert.ok(/152\.0\.7977\.130/.test(C.withHints({ 'Sec-CH-UA-Full-Version-List': 'x' }, '152.0.7977.130', 'win32')['sec-ch-ua-full-version-list']));
  });

  // ---------- the DevTools client against a fake Chrome ----------
  const f = await fake.start();
  let b = null;
  await t('connect: /json/version, then the browser WebSocket', async () => {
    assert.ok((await C.version(f.port)).webSocketDebuggerUrl);
    b = await C.Browser.connect(f.port);
    assert.strictEqual(b.info.browser, 'FakeChrome/152.0');
    assert.strictEqual(await C.version(1), null, 'nothing listening: null, no throw');
  });
  let id = null; let p = null;
  await t('pages: list, open, attach', async () => {
    assert.strictEqual((await b.pages()).length, 1);
    id = await b.open('https://suno.com/create', { newWindow: true });
    const list = await b.pages();
    assert.strictEqual(list.length, 2); assert.ok(list.some((x) => x.id === id && x.url === 'https://suno.com/create'));
    p = await b.page(id);
    assert.ok(f.log.includes('Target.attachToTarget') && f.log.includes('Page.enable'));
    assert.strictEqual(await b.page(id).then((x) => x.sid), p.sid, 'one session per page');
  });
  await t('navigate waits for the load; title, url, text', async () => {
    await p.navigate('https://suno.com/song-42');
    assert.strictEqual(await p.title(), 'Page song-42');
    assert.strictEqual(await p.url(), 'https://suno.com/song-42');
    assert.ok(/Fake page at https:\/\/suno\.com\/song-42/.test(await p.text()));
    assert.strictEqual(await p.text('#go'), 'Go');
    assert.strictEqual(await p.text('#nope'), null);
    await assert.rejects(() => p.navigate('javascript:alert(1)'), /Only web addresses/);
  });
  await t('click: a real mouse click in the element\'s box', async () => {
    await p.click('#go');
    assert.strictEqual(await p.title(), 'Clicked 1');
    await assert.rejects(() => p.click('#nope'), /Nothing matches #nope/);
    await assert.rejects(() => p.click('#hidden'), /not visible/);
  });
  await t('type: into a box (replacing, or appended), then Enter', async () => {
    await p.type('#q', 'neon city');
    assert.strictEqual(f.targets.get(id).els['#q'].value, 'neon city');
    f.targets.get(id).els['#q'].selected = false;
    await p.type('#q', ' at night', { append: true });
    assert.strictEqual(f.targets.get(id).els['#q'].value, 'neon city at night');
    await p.key('Enter');
    assert.strictEqual(f.targets.get(id).entered, 1);
    await assert.rejects(() => p.type('#nope', 'x'), /Nothing matches/);
  });
  await t('screenshot: a JPEG, scaled to the width asked', async () => {
    const data = await p.shot({ maxWidth: 1000 });
    assert.strictEqual(Buffer.from(data, 'base64')[0], 0xff);
    const sp = f.targets.get(id).shotParams;
    assert.strictEqual(sp.format, 'jpeg'); assert.strictEqual(sp.clip.scale, 0.5);
  });
  await t('wait for a selector / the load; page errors in plain words', async () => {
    assert.strictEqual(await p.waitFor('#go', 500), true);
    assert.strictEqual(await p.waitFor('#later', 400), false);
    assert.strictEqual(await p.waitLoad(500), true);
    await assert.rejects(() => p.evaluate('nope()'), /nope is not defined/);
    assert.strictEqual(await p.evaluate('1 + 1'), 2);
  });
  await t('back / forward without history: false, no throw; activate; close', async () => {
    assert.strictEqual(await p.back(), false);
    assert.ok(await b.activate(id));
    await b.close(id);
    assert.strictEqual((await b.pages()).length, 1);
    await assert.rejects(() => b.page('T999'), /No target/);
  });
  await t('the connection closing: pending calls fail, the client knows', async () => {
    const closed = new Promise((r) => b.c.on('close', r));
    await b.closeAll();
    await closed;
    assert.ok(b.closed);
    await assert.rejects(() => b.pages(), /closed/i);
  });
  await t('activePort: the port Chrome writes in its profile', () => {
    const fs = require('fs'); const os = require('os');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-chrome-'));
    assert.strictEqual(C.activePort(d), null);
    fs.writeFileSync(path.join(d, 'DevToolsActivePort'), '45123\n/devtools/browser/abc');
    assert.strictEqual(C.activePort(d), 45123);
    fs.rmSync(d, { recursive: true, force: true });
  });
  f.stop();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
