// ▶ Play feels instant to control (round 53, gameinput): the game window's keys (gameinputmain.key, the main-side
// handler: Esc → the card, Esc again / Enter → leave even when the page is stuck, F → the chip only while the mouse is
// free, Alt+Space held on Windows) and the raw-mouse pointer lock of game-preload.js (unadjustedMovement asked, the
// plain kind where the system refuses it, a game's own choice kept, exitPointerLock told).
//   node dev/gameinput-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const GI = require('../gameinputmain');
let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`✓ ${name}`); };

(async () => {
  await t('keys: Esc → the card, Esc again leaves (from the main side), Enter in the card leaves', () => {
    const sent = []; const left = [];
    const g = { win: { webContents: { send: (c) => sent.push(c) } }, state: { menu: false, locked: false }, leave: (why) => left.push(why) };
    GI._test.use(g);
    const k = (key, extra = {}) => { const e = { prevented: false, preventDefault() { this.prevented = true; } }; const taken = GI.key(e, { type: 'keyDown', key, ...extra }); return { taken, prevented: e.prevented }; };
    assert.deepStrictEqual(k('Escape'), { taken: false, prevented: false }); // (the game gets its Esc too)
    assert.deepStrictEqual(sent, ['game:menu']); assert.strictEqual(g.state.menu, true);
    assert.deepStrictEqual(k('Escape'), { taken: true, prevented: true }); assert.deepStrictEqual(left, ['key']);
    g.state.menu = true; left.length = 0;
    assert.deepStrictEqual(k('Enter'), { taken: true, prevented: true }); assert.deepStrictEqual(left, ['key']);
    g.state.menu = false; left.length = 0; sent.length = 0;
    assert.strictEqual(k('Enter').taken, false); assert.strictEqual(left.length, 0);
    // F: the chip only while the mouse is free, not on a repeat, not with a modifier
    k('f'); assert.deepStrictEqual(sent, ['game:stats']);
    g.state.locked = true; k('f'); g.state.locked = false; k('f', { isAutoRepeat: true }); k('f', { meta: true });
    assert.deepStrictEqual(sent, ['game:stats']);
    // Esc with a modifier is not the card; key-ups are never looked at
    sent.length = 0; k('Escape', { control: true }); assert.strictEqual(GI.key({ preventDefault() {} }, { type: 'keyUp', key: 'Escape' }), false); assert.deepStrictEqual(sent, []);
    // Alt+Space (the window menu) held for the game on Windows / Linux; a plain Space is the game's
    const alt = k(' ', { alt: true }); assert.strictEqual(alt.taken, process.platform !== 'darwin');
    assert.strictEqual(k(' ').taken, false);
    GI._test.use(null);
    assert.strictEqual(GI.key({ preventDefault() {} }, { type: 'keyDown', key: 'Escape' }), false); // (no game: nothing)
  });

  // the preload's code for the game's world, run against a stand-in DOM
  const src = fs.readFileSync(path.join(__dirname, '..', 'game-preload.js'), 'utf8');
  const RAW = src.match(/const RAW = `([\s\S]*?)`;\n/)[1];
  const world = (native) => {
    const events = [];
    class Element {} Element.prototype.requestPointerLock = native;
    class Document {} Document.prototype.exitPointerLock = function () { return 'exited'; };
    new Function('Element', 'Document', 'dispatchEvent', 'Event', RAW)(Element, Document, (e) => events.push(e.type), class { constructor(type) { this.type = type; } }); // eslint-disable-line no-new-func
    return { el: new Element(), doc: new Document(), events, f: Element.prototype.requestPointerLock };
  };
  await t('pointer lock: raw movement asked; the plain kind where the system refuses it', async () => {
    const calls = [];
    const w = world(function (o) { calls.push(o); return o && o.unadjustedMovement ? Promise.reject(Object.assign(new Error('no'), { name: 'NotSupportedError' })) : Promise.resolve('plain'); });
    assert.strictEqual(await w.el.requestPointerLock(), 'plain');
    assert.deepStrictEqual(calls, [{ unadjustedMovement: true }, undefined]); assert.strictEqual(w.f.hearthRaw, 'fallback');
    const w2 = world(function (o) { calls.push(o); return Promise.resolve('raw'); });
    calls.length = 0; assert.strictEqual(await w2.el.requestPointerLock(), 'raw'); assert.strictEqual(w2.f.hearthRaw, 'raw');
    assert.deepStrictEqual(calls, [{ unadjustedMovement: true }]);
  });
  await t('pointer lock: a game\'s own choice kept; other refusals passed on; exitPointerLock told', async () => {
    const calls = [];
    const w = world(function (o) { calls.push(o); return o && o.unadjustedMovement === true ? Promise.reject(Object.assign(new Error('x'), { name: 'SecurityError' })) : Promise.resolve('ok'); });
    await w.el.requestPointerLock({ unadjustedMovement: false });
    assert.deepStrictEqual(calls, [{ unadjustedMovement: false }]);
    await assert.rejects(w.el.requestPointerLock(), /x/); assert.match(w.f.hearthRaw, /refused \(SecurityError\)/);
    assert.strictEqual(w.doc.exitPointerLock(), 'exited'); assert.deepStrictEqual(w.events, ['hearth-game-unlock']);
    // an old implementation that returns nothing
    const w3 = world(function () { return undefined; }); assert.strictEqual(w3.el.requestPointerLock(), undefined); assert.strictEqual(w3.f.hearthRaw, 'raw');
  });
  await t('no text selection / drag ghosts; editable fields keep selection', () => {
    assert.match(GI.CSS, /user-select: none/); assert.match(GI.CSS, /-webkit-user-drag: none/); assert.match(GI.CSS, /input, textarea[^}]*user-select: text/);
  });
  console.log(`\n${n} passed`);
})().catch((err) => { console.error('FAIL', err); process.exit(1); });
