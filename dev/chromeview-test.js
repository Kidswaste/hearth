#!/usr/bin/env node
// Unit test for Chrome views (round 31, chromeview stream), plain Node: the input mapping and coordinate scaling of
// chromeview-core.js (where the frame sits in the view, a view point → the page's CSS pixels at any pixel ratio and
// through letterbox bars, double / triple clicks, buttons, the wheel in lines and pages, keys with their text, ⌘
// editing commands on a Mac, AltGr, the keys Hearth keeps, the frames' size cap, the frame pacer, sign-in pages, the
// page's cursor, the address in plain words), then chrome-cdp.js's Screencast and window placement against
// dev/fake-cdp.js: the viewport follows the view, frames arrive and are acked at ≤ 30 a second, a resize restarts
// only when the frame size changes, stop means no more frames, windows open off-screen and move.
//   node dev/chromeview-test.js
const path = require('path');
const assert = require('assert');
const K = require(path.join(__dirname, '..', 'chromeview-core.js'));
const C = require(path.join(__dirname, '..', 'chrome-cdp.js'));
const fake = require('./fake-cdp');

let failed = 0; let passed = 0;
async function t(name, fn) { try { await fn(); passed += 1; console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}: ${err.message}`); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---------- coordinates ----------
  await t('fit: the frame as large as fits, centred, never stretched', () => {
    assert.deepStrictEqual(K.fit(800, 600, 1600, 1200), { x: 0, y: 0, w: 800, h: 600, scale: 0.5 });
    const b = K.fit(800, 600, 800, 400); // wider frame: bars above and below
    assert.deepStrictEqual([b.x, b.y, b.w, b.h], [0, 100, 800, 400]);
    const c = K.fit(800, 600, 300, 600); // taller frame: bars left and right
    assert.deepStrictEqual([c.x, c.y, c.w, c.h], [250, 0, 300, 600]);
    assert.strictEqual(K.fit(0, 0, 10, 10).w, 0);
  });
  await t('toPage: view CSS pixels → the page\'s CSS pixels, the same at pixel ratio 1, 2 and 1.25', () => {
    for (const dpr of [1, 2, 1.25]) {
      const meta = { deviceWidth: 800, deviceHeight: 600, frameW: 800 * dpr, frameH: 600 * dpr };
      assert.deepStrictEqual(K.toPage(100, 50, { w: 800, h: 600 }, meta), { x: 100, y: 50 }, `dpr ${dpr}`);
      assert.deepStrictEqual(K.toPage(400, 300, { w: 800, h: 600 }, meta), { x: 400, y: 300 });
    }
  });
  await t('toPage: a view bigger than the frame (a resize catching up) scales; the letterbox bars are outside', () => {
    const meta = { deviceWidth: 800, deviceHeight: 400, frameW: 1600, frameH: 800 };
    // view 1000x600: the frame is drawn 1000x500 at y 50
    assert.deepStrictEqual(K.toPage(500, 300, { w: 1000, h: 600 }, meta), { x: 400, y: 200 });
    assert.deepStrictEqual(K.toPage(0, 50, { w: 1000, h: 600 }, meta), { x: 0, y: 0 });
    assert.strictEqual(K.toPage(500, 20, { w: 1000, h: 600 }, meta), null, 'above the frame');
    assert.strictEqual(K.toPage(-1, 300, { w: 1000, h: 600 }, meta), null, 'left of the view');
    const edge = K.toPage(1000, 550, { w: 1000, h: 600 }, meta);
    assert.ok(edge.x < 800 && edge.y < 400, 'the far edge stays inside the page');
  });
  await t('toPage: offsetTop (the page\'s top bar on some screens) and no metadata yet', () => {
    assert.deepStrictEqual(K.toPage(10, 60, { w: 800, h: 600 }, { deviceWidth: 800, deviceHeight: 600, frameW: 800, frameH: 600, offsetTop: 20 }), { x: 10, y: 40 });
    assert.deepStrictEqual(K.toPage(10, 20, { w: 800, h: 600 }, {}), { x: 10, y: 20 });
  });

  // ---------- the mouse ----------
  await t('modifiers: Alt 1, Ctrl 2, Meta 4, Shift 8', () => {
    assert.strictEqual(K.modifiers({}), 0);
    assert.strictEqual(K.modifiers({ altKey: true, shiftKey: true }), 9);
    assert.strictEqual(K.modifiers({ ctrlKey: true, metaKey: true }), 6);
  });
  await t('Clicks: double and triple clicks (same button, quick, close by); a fourth stays a triple', () => {
    const c = new K.Clicks();
    assert.strictEqual(c.press(0, 10, 10, 1000), 1);
    assert.strictEqual(c.press(0, 11, 12, 1200), 2);
    assert.strictEqual(c.press(0, 11, 12, 1400), 3);
    assert.strictEqual(c.press(0, 11, 12, 1500), 3);
    assert.strictEqual(c.count(), 3);
    assert.strictEqual(c.press(0, 11, 12, 2200), 1, 'too slow');
    assert.strictEqual(c.press(0, 40, 12, 2300), 1, 'too far');
    assert.strictEqual(c.press(1, 40, 12, 2350), 1, 'another button');
  });
  await t('mouse: pressed / released carry the button and the click count; moved carries the held buttons', () => {
    const p = K.mouse('mousePressed', { button: 0, buttons: 1, shiftKey: true }, { x: 5, y: 6 }, 2);
    assert.deepStrictEqual(p, { type: 'mousePressed', x: 5, y: 6, modifiers: 8, buttons: 1, button: 'left', clickCount: 2 });
    assert.strictEqual(K.mouse('mouseReleased', { button: 1 }, { x: 0, y: 0 }).button, 'middle');
    assert.strictEqual(K.mouse('mousePressed', { button: 2 }, { x: 0, y: 0 }).button, 'right');
    const drag = K.mouse('mouseMoved', { buttons: 1 }, { x: 9, y: 9 });
    assert.strictEqual(drag.button, 'left'); assert.strictEqual(drag.buttons, 1); assert.ok(!('clickCount' in drag));
    assert.strictEqual(K.mouse('mouseMoved', { buttons: 0 }, { x: 9, y: 9 }).button, 'none');
  });
  await t('wheel: pixels as they are, lines × 40, pages × the page\'s height; huge turns clamped; turns add up', () => {
    assert.deepStrictEqual(K.wheel({ deltaY: 120, deltaX: -3 }, { x: 1, y: 2 }), { type: 'mouseWheel', x: 1, y: 2, deltaX: -3, deltaY: 120, modifiers: 0, button: 'none', buttons: 0 });
    assert.strictEqual(K.wheel({ deltaY: 3, deltaMode: 1 }, { x: 0, y: 0 }).deltaY, 120);
    assert.strictEqual(K.wheel({ deltaY: 1, deltaMode: 2 }, { x: 0, y: 0 }, 600).deltaY, 540);
    assert.strictEqual(K.wheel({ deltaY: 99999 }, { x: 0, y: 0 }).deltaY, 4000);
    const a = K.addWheel(K.wheel({ deltaY: 50 }, { x: 0, y: 0 }), K.wheel({ deltaY: 70 }, { x: 3, y: 4 }));
    assert.deepStrictEqual([a.deltaY, a.x, a.y], [120, 3, 4]);
  });

  // ---------- the keyboard ----------
  await t('keys: a typed letter goes with its text; Enter types \\r; arrows and Backspace are raw keys', () => {
    const [a] = K.keys({ key: 'a', code: 'KeyA', keyCode: 65 });
    assert.strictEqual(a.type, 'keyDown'); assert.strictEqual(a.text, 'a'); assert.strictEqual(a.windowsVirtualKeyCode, 65);
    const [A] = K.keys({ key: 'A', code: 'KeyA', keyCode: 65, shiftKey: true });
    assert.strictEqual(A.text, 'A'); assert.strictEqual(A.modifiers, 8);
    const [en] = K.keys({ key: 'Enter', code: 'Enter' });
    assert.strictEqual(en.text, '\r'); assert.strictEqual(en.windowsVirtualKeyCode, 13);
    const [left] = K.keys({ key: 'ArrowLeft', code: 'ArrowLeft' });
    assert.strictEqual(left.type, 'rawKeyDown'); assert.ok(!left.text); assert.strictEqual(left.windowsVirtualKeyCode, 37);
    assert.strictEqual(K.keys({ key: 'Backspace', code: 'Backspace' })[0].windowsVirtualKeyCode, 8);
    const [up] = K.keys({ key: 'a', code: 'KeyA', keyCode: 65 }, { up: true });
    assert.strictEqual(up.type, 'keyUp'); assert.ok(!up.text);
    assert.strictEqual(K.keys({ key: 'é', code: 'Digit2' })[0].text, 'é');
    assert.strictEqual(K.keys({ key: '😀', code: '' })[0].text, '😀');
  });
  await t('keys: shortcuts type nothing; on a Mac ⌘A / ⌘C / ⌘X / ⌘V / ⌘Z / ⌘⇧Z are Chrome\'s editing commands', () => {
    const [cc] = K.keys({ key: 'c', code: 'KeyC', ctrlKey: true });
    assert.strictEqual(cc.type, 'rawKeyDown'); assert.ok(!cc.text); assert.strictEqual(cc.modifiers, 2); assert.strictEqual(cc.windowsVirtualKeyCode, 67);
    assert.deepStrictEqual(K.keys({ key: 'a', code: 'KeyA', metaKey: true }, { mac: true })[0].commands, ['selectAll']);
    assert.deepStrictEqual(K.keys({ key: 'c', code: 'KeyC', metaKey: true }, { mac: true })[0].commands, ['copy']);
    assert.deepStrictEqual(K.keys({ key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true }, { mac: true })[0].commands, ['redo']);
    assert.ok(!K.keys({ key: 'a', code: 'KeyA', metaKey: true }, { mac: false })[0].commands, 'not on Windows');
    assert.ok(!K.keys({ key: 'b', code: 'KeyB', metaKey: true }, { mac: true })[0].commands, '⌘B goes to the page as it is');
  });
  await t('keys: AltGr on Windows (Ctrl+Alt) still types; dead keys and IME presses type nothing themselves', () => {
    assert.strictEqual(K.keys({ key: '@', code: 'Digit2', ctrlKey: true, altKey: true })[0].text, '@');
    assert.ok(!K.keys({ key: 'Dead', code: 'BracketLeft' })[0].text);
    assert.ok(!K.keys({ key: 'Process', code: 'KeyA', isComposing: true })[0].text);
  });
  await t('reserved: Hearth keeps reload, back / forward, close, the address, the palette, F5; the page gets the rest', () => {
    for (const e of [{ key: 'r', ctrlKey: true }, { key: 'w', ctrlKey: true }, { key: 'k', ctrlKey: true }, { key: 'l', ctrlKey: true }, { key: 'F5' }, { key: 'ArrowLeft', altKey: true }, { key: 'Enter', ctrlKey: true, shiftKey: true }]) assert.ok(K.reserved(e), JSON.stringify(e));
    for (const e of [{ key: 'c', ctrlKey: true }, { key: 'v', ctrlKey: true }, { key: 'a', ctrlKey: true }, { key: 'z', ctrlKey: true }, { key: 'Enter', ctrlKey: true }, { key: 'b', ctrlKey: true }, { key: 'x' }, { key: 'ArrowLeft' }]) assert.ok(!K.reserved(e), JSON.stringify(e));
    assert.ok(K.reserved({ key: 'r', metaKey: true }, { mac: true }));
    assert.ok(!K.reserved({ key: 'r', ctrlKey: true }, { mac: true }), 'Ctrl+R on a Mac goes to the page');
  });

  // ---------- frames ----------
  await t('frameSize: the view × the pixel ratio; past the area cap, softer frames instead of huge ones', () => {
    assert.deepStrictEqual(K.frameSize(800, 600, 2), { width: 800, height: 600, scale: 2, maxWidth: 1600, maxHeight: 1200 });
    const big = K.frameSize(2560, 1440, 2);
    assert.ok(big.maxWidth * big.maxHeight <= 2.4e6 * 1.01, `${big.maxWidth}x${big.maxHeight}`);
    assert.ok(big.scale < 1 && big.scale >= 0.5, String(big.scale));
    assert.strictEqual(K.frameSize(10.4, 0, 1).height, 1);
  });
  await t('Pacer: ≤ 30 frames a second; slower while drawing is slow; back up when it is quick again', () => {
    const p = new K.Pacer({ maxFps: 30 });
    assert.strictEqual(p.delay(1000), 0, 'the first frame at once');
    p.acked(1000);
    assert.ok(Math.abs(p.delay(1010) - 23) <= 1, String(p.delay(1010)));
    assert.strictEqual(p.delay(1040), 0);
    for (let i = 0; i < 10; i++) p.drawn(40); // a busy computer
    assert.ok(p.fps < 30 && p.fps >= 8, String(p.fps));
    for (let i = 0; i < 30; i++) p.drawn(2);
    assert.strictEqual(p.fps, 30);
  });

  // ---------- sign-in ----------
  await t('signInPage: Google\'s sign-in, its refusal, a site\'s login; ordinary pages are none', () => {
    assert.strictEqual(K.signInPage('https://accounts.google.com/v3/signin/identifier?continue=x'), 'google');
    assert.strictEqual(K.signInPage('https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com'), 'google');
    assert.strictEqual(K.signInPage('https://accounts.google.com/v3/signin/rejected?x'), 'refused');
    assert.strictEqual(K.signInPage('https://www.pinterest.com/login/'), 'site');
    assert.strictEqual(K.signInPage('https://suno.com/sign-in'), 'site');
    assert.strictEqual(K.signInPage('https://gemini.google.com/app'), null);
    assert.strictEqual(K.signInPage('https://accounts.google.com/'), null, 'the account page itself isn\'t a sign-in');
    assert.strictEqual(K.signInPage('https://myaccount.google.com/'), null);
    assert.strictEqual(K.signInPage('about:blank'), null);
    assert.strictEqual(K.signInPage('http://127.0.0.1:5555/v3/signin/rejected', ['127.0.0.1']), 'refused', 'test hosts count');
  });
  await t('signInLeft: done once the page leaves the sign-in page for a real address', () => {
    assert.ok(K.signInLeft('https://accounts.google.com/v3/signin/identifier', 'https://gemini.google.com/app'));
    assert.ok(!K.signInLeft('https://accounts.google.com/v3/signin/identifier', 'https://accounts.google.com/v3/signin/challenge/pwd'));
    assert.ok(!K.signInLeft('https://gemini.google.com/app', 'https://gemini.google.com/app/x'));
    assert.ok(!K.signInLeft('https://accounts.google.com/v3/signin/identifier', 'about:blank'));
  });
  await t('cursorOf: the page\'s cursor as one Hearth shows; custom pictures fall back to their keyword', () => {
    assert.strictEqual(K.cursorOf('pointer'), 'pointer');
    assert.strictEqual(K.cursorOf('url(x.png) 4 4, grab'), 'grab');
    assert.strictEqual(K.cursorOf('url(x.png)'), 'default');
    assert.strictEqual(K.cursorOf('-webkit-grab'), 'default');
    assert.ok(/elementFromPoint\(12, 34\)/.test(K.cursorExpr(12, 34)));
  });
  await t('address: host and path in plain words', () => {
    assert.strictEqual(K.address('https://www.pinterest.com/search/pins/?q=rain'), 'pinterest.com/search/pins/?q=rain');
    assert.strictEqual(K.address('https://gemini.google.com/'), 'gemini.google.com');
    assert.strictEqual(K.address('about:blank'), 'about:blank');
  });

  // ---------- the protocol: windows and the screencast against the fake Chrome ----------
  const f = await fake.start();
  const b = await C.Browser.connect(f.port);
  await t('open(url, { bounds }): a window of its own, placed off-screen from the start; place() moves it', async () => {
    const id = await b.open('https://example.com/a', { background: true, bounds: { left: -24000, top: -24000, width: 1280, height: 860 } });
    const w = await b.windowOf(id);
    assert.deepStrictEqual([w.bounds.left, w.bounds.top], [-24000, -24000]);
    await b.place(id, { left: 100, top: 80, width: 1000, height: 700 });
    const w2 = await b.windowOf(id);
    assert.deepStrictEqual([w2.bounds.left, w2.bounds.top, w2.bounds.width], [100, 80, 1000]);
    const last = f.log.filter((m) => m === 'Target.createTarget').length;
    assert.ok(last >= 1);
  });
  await t('Screencast: the viewport becomes the view\'s size, frames come, each acked, ≤ 30 a second', async () => {
    const id = (await b.pages()).at(-1).id;
    const pg = await b.page(id);
    let frames = 0; let meta = null;
    const sc = new C.Screencast(pg, { onFrame: (_d, m) => { frames += 1; meta = m; setTimeout(() => sc.ack(1), 0); } });
    await sc.start({ width: 640, height: 400, scale: 2 });
    const tp = f.targets.get(id);
    assert.deepStrictEqual([tp.metrics.width, tp.metrics.height, tp.metrics.deviceScaleFactor], [640, 400, 2]);
    assert.strictEqual(tp.focusEmu, true);
    assert.deepStrictEqual([tp.cast.params.maxWidth, tp.cast.params.maxHeight, tp.cast.params.format], [1280, 800, 'jpeg']);
    await sleep(600);
    assert.ok(frames >= 5, `frames ${frames}`);
    assert.ok(frames <= 21, `paced: ${frames} in 0.6 s`);
    assert.strictEqual(meta.deviceWidth, 640);
    assert.ok(tp.acks >= frames - 1, `acks ${tp.acks}`);
    // the same pixels: the viewport changes, no restart; new pixels: a restart
    const starts = () => f.log.filter((m) => m === 'Page.startScreencast').length;
    const s0 = starts();
    await sc.resize({ width: 640, height: 400, scale: 2 });
    assert.strictEqual(starts(), s0);
    await sc.resize({ width: 700, height: 400, scale: 2 });
    assert.strictEqual(starts(), s0 + 1);
    assert.strictEqual(tp.metrics.width, 700);
    // stopped: no more frames (a hidden view costs nothing)
    await sc.stop();
    assert.strictEqual(tp.cast, null);
    const n0 = frames;
    await sleep(200);
    assert.strictEqual(frames, n0, 'no frames once stopped');
    await sc.stop({ clear: true });
    assert.strictEqual(tp.metrics, null, 'the viewport is the window\'s again');
    sc.dispose();
  });
  await t('Screencast: a frame the view never acks is acked after a second (a stalled view doesn\'t freeze the page)', async () => {
    const id = (await b.pages()).at(-1).id;
    const pg = await b.page(id);
    let frames = 0;
    const sc = new C.Screencast(pg, { onFrame: () => { frames += 1; } });
    await sc.start({ width: 300, height: 200, scale: 1 });
    await sleep(1300);
    assert.ok(frames >= 2, `frames ${frames}`);
    await sc.stop(); sc.dispose();
  });
  await t('input through the page session: a click in a box, the wheel scrolls, IME text', async () => {
    const id = (await b.pages()).at(-1).id;
    const pg = await b.page(id);
    const tp = f.targets.get(id);
    const at = K.toPage(140, 55, { w: 800, h: 600 }, { deviceWidth: 800, deviceHeight: 600, frameW: 1600, frameH: 1200 });
    await pg.send('Input.dispatchMouseEvent', K.mouse('mousePressed', { button: 0, buttons: 1 }, at, 1));
    await pg.send('Input.dispatchMouseEvent', K.mouse('mouseReleased', { button: 0 }, at, 1));
    assert.strictEqual(tp.title, 'Clicked 1');
    await pg.send('Input.dispatchMouseEvent', K.wheel({ deltaY: 3, deltaMode: 1 }, at));
    assert.strictEqual(tp.scrollY, 120);
    await pg.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
    assert.strictEqual(tp.ime, 'にほ');
  });
  b.disconnect();
  f.stop();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
