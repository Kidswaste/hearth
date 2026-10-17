// ▶ Play's budget (round 55, playbudget): the rules (2 % of a frame at the screen's refresh, never under 0.1 ms; the most
// expensive helper first; the A/B's verdict against its noise), the watch in tools/playbudget-page.js on a fake page
// (a helper over the budget for 3 s in a row is switched off, the cheaper one stays, the line and the note), the look's
// own accounting / step aside / off (gamelook-preload.js on a fake three.js: its hooks out of the way, shadows back at
// the game's size) and the memory per game (playbudgetmain.js: kept, read back, forgotten; datasafe + atomic write).
//   node dev/playbudget-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Rules = require('../tools/playbudget-page.js');
const { gameLookPage } = require('../gamelook-preload');
const PB = require('../playbudgetmain');
let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`✓ ${name}`); };

(async () => {
  await t('the budget: 2 % of a frame at the refresh, never under 0.1 ms', () => {
    assert.strictEqual(+Rules.budgetMs(60).toFixed(3), 0.333);
    assert.strictEqual(+Rules.budgetMs(144).toFixed(3), 0.139);
    assert.strictEqual(Rules.budgetMs(240), 0.1);
    assert.strictEqual(Rules.budgetMs(360), 0.1);
    assert.strictEqual(+Rules.budgetMs(0).toFixed(3), 0.333, 'an unknown refresh: 60 Hz');
  });
  await t('the most expensive helper still on goes first; the chip and the watch never', () => {
    assert.deepStrictEqual(Rules.pick({ look: 0.02, stream: 0.3, audio: 0.01, chip: 5, watch: 5 }, new Set()), { id: 'stream', ms: 0.3 });
    assert.deepStrictEqual(Rules.pick({ look: 0.02, stream: 0.3 }, new Set(['stream'])), { id: 'look', ms: 0.02 });
    assert.strictEqual(Rules.pick({ look: 0, stream: 0 }, new Set()), null);
  });
  await t('the A/B: slower only beyond the budget and the noise, and in (nearly) every pair', () => {
    assert.strictEqual(Rules.judge([[3.5, 3.0], [3.6, 3.1], [3.5, 3.05], [3.55, 3.0]], 0.1, 0.45).slower, true);
    assert.strictEqual(Rules.judge([[3.5, 3.0], [3.6, 3.1], [3.5, 3.05], [3.55, 3.0]], 0.1, 0.01).slower, false, 'the frames alone (a busy computer): never');
    assert.strictEqual(Rules.judge([[3.05, 3.0], [3.06, 3.0], [3.04, 3.0]], 0.1, 0.3).slower, false, 'the difference under the budget');
    assert.strictEqual(Rules.judge([[3.5, 3.0], [3.0, 3.6], [2.9, 3.1]], 0.1, 0.5).slower, false, 'not slower in most pairs');
    assert.strictEqual(Rules.judge([[3.5, 3.0]], 0.1, 0.5).slower, false, 'one pair is never enough');
    assert.strictEqual(Rules.judge([[18, 8], [12, 9], [19, 18], [14, 10]], 0.33, 8.3).slower, true, 'a noisy software GPU: the helpers\' own measured time explains the difference');
  });
  await t('plain words', () => {
    assert.strictEqual(Rules.note('Clink', ['stream']), "Hearth's helpers were slowing Clink a little; turned off: loads during play");
    assert.strictEqual(Rules.note('Clink', ['look', 'stream']), "Hearth's helpers were slowing Clink a little; turned off: the look and loads during play");
    assert.strictEqual(Rules.note('Clink', []), '');
    assert.strictEqual(Rules.fmt(0.031), 'Hearth: 0.03 ms');
    assert.strictEqual(Rules.fmt(0.001), 'Hearth: < 0.01 ms');
  });

  // ---------- the watch, on a fake page ----------
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'playbudget-page.js'), 'utf8');
  function fakePage(q, helpers) {
    let clock = 0; let cb = null; const events = [];
    const ctx = { URLSearchParams, Event, JSON, Math, Number, Object, Set, Array, String, Boolean, Promise, Uint8Array,
      performance: { now: () => clock }, document: { currentScript: { src: `/__playbudget-page.js?${q}` }, visibilityState: 'visible', title: 'x' },
      requestAnimationFrame: (f) => { cb = f; return 1; }, setTimeout: (f) => { f(); return 1; }, dispatchEvent: (e) => { events.push(e.type); return true; }, ...helpers };
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
    // a frame: the game's helpers spend what they spend, the watch's own callback runs
    const frame = (ms) => { clock += ms; cb(clock); };
    return { B: ctx.__hearthBudget, frame, events, ctx, set clock(v) { clock = v; }, get clock() { return clock; } };
  }
  await t('the watch: a helper over the budget for 3 s in a row is switched off (the cheaper one stays), said once, remembered', () => {
    let lookMs = 0; let streamMs = 0; const offs = [];
    const helpers = { __gameReady: { phase: 'playing' },
      __gameLook: { budget: { spent: () => lookMs, pause() {}, off: (by) => { offs.push(['look', by]); return true; } } },
      __gameStream: { budget: { spent: () => streamMs, pause() {}, off: (by) => { offs.push(['stream', by]); return true; } } } };
    const streamOn = () => !offs.some((o) => o[0] === 'stream'); // (switched off: its hooks spend nothing more)
    const p = fakePage('hz=60&t=Clink', helpers);
    // 60 fps: the look 0.02 ms a frame, loads during play 0.5 ms a frame (over 0.33)
    for (let f = 0; f < 60 * 3; f += 1) { lookMs += 0.02; streamMs += 0.01; p.frame(16.7); }
    assert.deepStrictEqual(offs, [], 'under the budget: nothing goes');
    for (let f = 0; f < 60 * 7; f += 1) { lookMs += 0.02; if (streamOn()) streamMs += 0.5; p.frame(16.7); }
    assert.deepStrictEqual(offs, [['stream', 'watch']]);
    assert.deepStrictEqual(p.events, ['hearth-budget'], 'told once (game-preload.js relays it to Hearth)');
    const pub = JSON.parse(p.B.pub());
    assert.strictEqual(pub.note, "Hearth's helpers were slowing Clink a little; turned off: loads during play");
    assert.strictEqual(pub.off[0].id, 'stream'); assert.strictEqual(pub.off[0].by, 'watch'); assert.ok(pub.off[0].ms > 0.33);
    assert.ok(p.B.isOff('stream') && !p.B.isOff('look'));
    for (let f = 0; f < 60 * 3; f += 1) { lookMs += 0.02; p.frame(16.7); }
    assert.ok(/^Hearth: 0\.0\d ms$/.test(p.B.line()), p.B.line());
    assert.deepStrictEqual(offs.length, 1, 'the cheap one stays');
  });
  await t('the watch waits for play, and a short spike (a level loading) is not "sustained"', () => {
    let ms = 0; const offs = []; const ready = { phase: 'ready' };
    const p = fakePage('hz=240&t=Clink', { __gameReady: ready, __gameLook: { budget: { spent: () => ms, pause() {}, off: () => { offs.push(1); return true; } } } });
    for (let f = 0; f < 240 * 5; f += 1) { ms += 1; p.frame(4.17); }
    assert.deepStrictEqual(offs, [], 'getting ready: not watched');
    ready.phase = 'playing';
    for (let f = 0; f < 240 * 4; f += 1) { ms += 0.01; p.frame(4.17); }
    for (let f = 0; f < 240 * 2; f += 1) { ms += 0.5; p.frame(4.17); } // (2 s over)
    for (let f = 0; f < 240 * 4; f += 1) { ms += 0.01; p.frame(4.17); }
    assert.deepStrictEqual(offs, [], 'two seconds over, then fine: kept');
  });
  await t('remembered off from the start: listed, not watched, not switched again', () => {
    const p = fakePage('hz=240&t=Clink&off=look,bogus', {});
    const pub = JSON.parse(p.B.pub());
    assert.deepStrictEqual(pub.off.map((o) => [o.id, o.by]), [['look', 'remembered']]);
    assert.ok(p.B.isOff('look')); assert.ok(!p.B.isOff('bogus'));
  });

  // ---------- the look's own part ----------
  await t('the look: its hooks\' time counted, stepped aside on pause, off puts the game\'s methods and shadow sizes back', () => {
    let clock = 0;
    class Object3D { constructor() { this.isObject3D = true; this.children = []; this.parent = null; } add(...o) { for (const x of o) { x.parent = this; this.children.push(x); } return this; } traverse(cb) { cb(this); for (const c of this.children) c.traverse(cb); } }
    class Scene extends Object3D { constructor() { super(); this.isScene = true; } }
    const g = globalThis;
    Object.defineProperty(g, 'performance', { configurable: true, value: { now: () => (clock += 0.001) } });
    g.window = g; g.screen = { width: 2560, height: 1440 }; g.devicePixelRatio = 1; g.matchMedia = () => ({ matches: false });
    g.requestAnimationFrame = () => 0; delete g.__gameLook; g.__THREE_DEVTOOLS__ = new EventTarget();
    const add0 = Object3D.prototype.add;
    gameLookPage({ look: 'best', hz: 240 });
    const base = function render() {};
    const r = { isWebGLRenderer: true, capabilities: { getMaxAnisotropy: () => 16, maxTextureSize: 16384 }, info: { memory: { textures: 0 } }, properties: { get: () => ({}) }, outputColorSpace: 'srgb', render: base, compile() {}, initTexture() {} };
    const ev = new Event('observe'); Object.defineProperty(ev, 'detail', { value: r }); g.__THREE_DEVTOOLS__.dispatchEvent(ev);
    const scene = new Scene(); const L = new Object3D(); L.isLight = true; L.castShadow = true; L.shadow = { mapSize: { x: 512, y: 512, set(a, b) { this.x = a; this.y = b; } }, map: null };
    scene.add(L);
    r.render(scene, {});
    const B = g.__gameLook.budget;
    assert.strictEqual(L.shadow.mapSize.x, 2048);
    const s0 = B.spent(); for (let i = 0; i < 50; i += 1) { scene.add(new Object3D()); r.render(scene, {}); }
    const s1 = B.spent(); assert.ok(s1 > s0, 'counted');
    B.pause(true); for (let i = 0; i < 50; i += 1) { scene.add(new Object3D()); r.render(scene, {}); } B.pause(false);
    assert.strictEqual(B.spent(), s1, 'stepped aside: nothing counted');
    assert.strictEqual(B.picture(false), true); assert.strictEqual(L.shadow.mapSize.x, 512); B.picture(true); assert.strictEqual(L.shadow.mapSize.x, 2048);
    assert.strictEqual(B.off('watch'), true);
    assert.strictEqual(r.render, base, 'the renderer\'s own render back');
    assert.strictEqual(Object3D.prototype.add, add0, 'Object3D.add back');
    assert.strictEqual(L.shadow.mapSize.x, 512, 'the shadow map at the game\'s own size');
    assert.ok(/turned off/.test(g.__gameLook.text()));
  });

  // ---------- the memory per game ----------
  await t('remembered per game: kept, read back, forgotten (datasafe read, atomic write)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-playbudget-'));
    PB.init({ dataDir: dir });
    const clink = { kind: 'lab', id: 's1clink', title: 'Clink' }; const html = { kind: 'html', path: path.join(dir, 'game', 'index.html'), title: 'game' };
    assert.deepStrictEqual(PB.forGame(clink), { off: [] });
    assert.strictEqual(PB.note(clink, { off: [{ id: 'stream', by: 'watch', ms: 0.4 }, { id: 'look', by: 'remembered' }, { id: 'chip', by: 'watch' }] }), true);
    assert.strictEqual(PB.note(clink, { off: [{ id: 'stream', by: 'watch', ms: 0.4 }] }), false, 'nothing new');
    assert.deepStrictEqual(PB.forGame(clink).off, ['stream']);
    assert.deepStrictEqual(PB.forGame(html).off, [], 'another game: its own');
    await new Promise((r) => setTimeout(r, 450));
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'game-cache', 'budget.json'), 'utf8'));
    assert.deepStrictEqual(disk.games['lab:s1clink'].off, ['stream']);
    PB.init({ dataDir: path.join(dir, 'other') }); PB.init({ dataDir: dir }); // (read again from the disk)
    assert.deepStrictEqual(PB.forGame(clink).off, ['stream']);
    assert.strictEqual(PB.reset(clink), true); assert.deepStrictEqual(PB.forGame(clink), { off: [] });
    assert.ok(/^<script src="\/__playbudget-page\.js\?hz=240&t=Clink&off=stream%2Clook"><\/script>$/.test(PB.pageTag({ hz: 240, title: 'Clink', off: ['stream', 'look', 'chip'] })), PB.pageTag({ hz: 240, title: 'Clink', off: ['stream', 'look'] }));
    // an unreadable file is never written over
    fs.writeFileSync(path.join(dir, 'game-cache', 'budget.json'), '{ broken');
    PB.init({ dataDir: path.join(dir, 'x') }); PB.init({ dataDir: dir });
    PB.note(clink, { off: [{ id: 'look', by: 'watch' }] });
    await new Promise((r) => setTimeout(r, 450));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'game-cache', 'budget.json'), 'utf8'), '{ broken');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  console.log(`${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
