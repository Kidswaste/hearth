// ▶ Play's shadows chosen while getting ready (round 56, shadowready): the choice (Rules.shadowPick in
// tools/playbudget-page.js: the biggest size that fits the refresh, else down while each step helps ≥ 8 %), the look's
// maps per size (gamelook-preload.js on a fake three.js: plan / set / commit / seal, a size made before comes back as a
// swap with no new map, the remembered size used from the first look, the doctor's line) and the memory per game
// (playbudgetmain.js: the size kept with the game's record, read back, forgotten alone).
//   node dev/shadowready-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Rules = require('../tools/playbudget-page.js');
const { gameLookPage } = require('../gamelook-preload');
const PB = require('../playbudgetmain');
let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`✓ ${name}`); };

(async () => {
  const L = [2048, 1024, 512];
  await t('the choice: the biggest size that fits the refresh (10 % kept for the game\'s own work), measured from the top down', () => {
    assert.deepStrictEqual(Rules.shadowPick([], L, 60), { next: 2048 });
    assert.deepStrictEqual(Rules.shadowPick([[2048, 9]], L, 60), { size: 2048, why: 'fits' });
    assert.deepStrictEqual(Rules.shadowPick([[2048, 16]], L, 60), { next: 1024 }, '16 ms at 60 Hz: over 90 % of the frame');
    assert.deepStrictEqual(Rules.shadowPick([[2048, 30], [1024, 8]], L, 60), { size: 1024, why: 'fits' });
    assert.deepStrictEqual(Rules.shadowPick([[2048, 3.9]], L, 240), { next: 1024 }, '240 Hz: 3.75 ms');
    assert.deepStrictEqual(Rules.shadowPick([[2048, 3.5]], L, 240), { size: 2048, why: 'fits' });
  });
  await t('none fits: down while a step saves ≥ 8 %, else the bigger one (the shadows weren\'t what\'s slow)', () => {
    assert.deepStrictEqual(Rules.shadowPick([[2048, 40], [1024, 39]], L, 60), { size: 2048, why: 'not-shadows' });
    assert.deepStrictEqual(Rules.shadowPick([[2048, 40], [1024, 30]], L, 60), { next: 512 });
    assert.deepStrictEqual(Rules.shadowPick([[2048, 40], [1024, 30], [512, 29]], L, 60), { size: 1024, why: 'lowered' });
    assert.deepStrictEqual(Rules.shadowPick([[2048, 40], [1024, 30], [512, 20]], L, 60), { size: 512, why: 'smallest' });
    assert.deepStrictEqual(Rules.shadowPick([[1024, 30]], [1024, 512], 60), { next: 512 }, 'a remembered 1024: its ladder starts there');
    assert.deepStrictEqual(Rules.shadowPick([[2048, null]], L, 60), { size: 2048, why: 'not-shadows' }, 'not measurable: no guess below it');
  });
  await t('(round 57, readywalk) a remembered size is only checked: the walk again only when that check clearly fails', () => {
    const fitted = { size: 2048, ms: 9 }; const slow = { size: 1024, ms: 30 };
    assert.strictEqual(Rules.shadowHolds(10, fitted, 60), true, 'still fits the refresh');
    assert.strictEqual(Rules.shadowHolds(18, fitted, 60), true, 'a little over (a busy moment): kept');
    assert.strictEqual(Rules.shadowHolds(19, fitted, 60), false, 'clearly over the refresh: walked again');
    assert.strictEqual(Rules.shadowHolds(3, { size: 2048, ms: 3 }, 240), true);
    assert.strictEqual(Rules.shadowHolds(5, { size: 2048, ms: 3 }, 240), false, '240 Hz: 3.75 ms × 1.25');
    assert.strictEqual(Rules.shadowHolds(14, slow, 60), true, 'fits now: holds');
    assert.strictEqual(Rules.shadowHolds(44, slow, 60), true, 'as slow as when chosen (1.5×): holds');
    assert.strictEqual(Rules.shadowHolds(46, slow, 60), false, 'clearly slower than when chosen');
    assert.strictEqual(Rules.shadowHolds(19.9, { size: 1024, ms: 18 }, 60), true, '2 ms of slack on a near miss');
    assert.strictEqual(Rules.shadowHolds(NaN, slow, 60), false); assert.strictEqual(Rules.shadowHolds(10, null, 60), false); assert.strictEqual(Rules.shadowHolds(10, { size: 1024 }, 60), false, 'no time remembered: walked');
  });

  // ---------- the look's maps on a fake three.js ----------
  const fake = (o, screenW = 2560) => {
    let clock = 0;
    class Object3D { constructor() { this.isObject3D = true; this.children = []; } add(...x) { for (const c of x) this.children.push(c); return this; } traverse(cb) { cb(this); for (const c of this.children) c.traverse(cb); } }
    class Scene extends Object3D { constructor() { super(); this.isScene = true; } }
    const g = globalThis;
    Object.defineProperty(g, 'performance', { configurable: true, value: { now: () => (clock += 0.001) } });
    g.window = g; g.screen = { width: screenW, height: 1440 }; g.devicePixelRatio = 1; g.matchMedia = () => ({ matches: false });
    g.requestAnimationFrame = () => 0; delete g.__gameLook; delete g.__gameReady; g.__THREE_DEVTOOLS__ = new EventTarget();
    g.__gameReady = { phase: 'ready', pub: () => JSON.stringify({ phase: g.__gameReady.phase, first5: null }) };
    gameLookPage(o);
    let made = 0; const disposed = [];
    // three's shadow pass: a light whose map is null gets a new one at its mapSize (a new colour + depth texture)
    const r = { isWebGLRenderer: true, capabilities: { getMaxAnisotropy: () => 16, maxTextureSize: 16384 }, info: { memory: { textures: 0 } }, properties: { get: () => ({}) }, outputColorSpace: 'srgb', compile() {}, initTexture() {},
      render(scene) { scene.traverse((x) => { if (x.isLight && x.castShadow && x.shadow.map === null) { made += 1; const m = { width: x.shadow.mapSize.x, depthTexture: { dispose() {} }, dispose() { disposed.push(this.width); } }; x.shadow.map = m; } }); } };
    const ev = new Event('observe'); Object.defineProperty(ev, 'detail', { value: r }); g.__THREE_DEVTOOLS__.dispatchEvent(ev);
    const scene = new Scene();
    const light = (point) => { const l = new Object3D(); l.isLight = true; l.castShadow = true; l.isPointLight = point; l.shadow = { mapSize: { x: 512, y: 512, set(a, b) { this.x = a; this.y = b; } }, map: null, mapPass: null }; scene.add(l); return l; };
    const sun = light(false); const point = light(true);
    return { g, r, scene, sun, point, made: () => made, disposed, B: () => g.__gameLook.budget, look: () => g.__gameLook };
  };
  await t('(round 59, shadowlab59) a size swapped in asks the renderer for its shadow pass once (a page that skips it on still frames never draws with a missing map)', () => {
    const f = fake({ look: 'best', hz: 60 });
    f.r.shadowMap = { enabled: true, needsUpdate: false };
    f.r.render(f.scene); f.r.shadowMap.needsUpdate = false; // (three clears it after its pass)
    const S = f.B().shadow;
    S.set(1024);
    assert.strictEqual(f.r.shadowMap.needsUpdate, true, 'a size never made: its maps drawn at the next pass, never sampled missing');
    f.r.render(f.scene); f.r.shadowMap.needsUpdate = false;
    S.set(2048);
    assert.strictEqual(f.r.shadowMap.needsUpdate, true, 'a size made before (a pointer swap): drawn again, not shown as it was then');
    f.r.shadowMap.needsUpdate = false; f.r.shadowMap.enabled = false; S.set(1024);
    assert.strictEqual(f.r.shadowMap.needsUpdate, false, 'shadows switched off by the game: left alone');
  });
  await t('the look: plan from the screen\'s size, each size drawn once, the choice and its fallback kept, the rest let go', () => {
    const f = fake({ look: 'best', hz: 60 });
    f.r.render(f.scene);
    assert.strictEqual(f.sun.shadow.mapSize.x, 2048); assert.strictEqual(f.point.shadow.mapSize.x, 1024);
    const S = f.B().shadow;
    assert.deepStrictEqual(S.plan().ladder, [2048, 1024, 512]);
    assert.strictEqual(f.made(), 2);
    S.set(1024); f.r.render(f.scene); S.set(512); f.r.render(f.scene);
    assert.strictEqual(f.made(), 5, 'each size\'s maps made once (the sun at 2048 / 1024 / 512, the point light at 1024 / 512)');
    S.set(2048); f.r.render(f.scene);
    assert.strictEqual(f.made(), 5, 'a size made before: swapped back in, nothing made');
    assert.strictEqual(S.commit(1024, { why: 'fits', rows: [[2048, 30], [1024, 8]] }), 512);
    S.set(512); f.r.render(f.scene); S.set(1024); f.r.render(f.scene);
    assert.strictEqual(S.seal(), true, 'the fallback is ready');
    assert.strictEqual(f.made(), 5);
    assert.deepStrictEqual(f.disposed.sort((a, b) => a - b), [1024, 2048], 'the 2048 sun and the 1024 point light let go');
    const R = f.look().report();
    assert.strictEqual(R.shadows.now, 1024); assert.strictEqual(R.shadows.chosen.size, 1024); assert.strictEqual(R.shadows.chosen.by, 'ready'); assert.strictEqual(R.shadows.fallback, 512);
    assert.strictEqual(R.shadows.midPlay, 0);
    assert.ok(/Shadows: 1024 \(chosen while getting ready\)/.test(f.look().text()), f.look().text());
    // while playing: the guard's fallback is a swap (no map made); nothing new from here on
    f.g.__gameReady.phase = 'playing';
    S.set(512); f.r.render(f.scene); S.set(1024); f.r.render(f.scene);
    assert.strictEqual(f.made(), 5, 'the fallback while playing: nothing made');
    assert.strictEqual(f.look().report().shadows.midPlay, 0);
    // off: the game's own 512 (made under the card as the fallback): swapped in, the rest let go
    f.B().off('watch');
    assert.strictEqual(f.sun.shadow.mapSize.x, 512); f.r.render(f.scene);
    assert.strictEqual(f.made(), 5, 'switched off: the 512 maps made while getting ready reused');
  });
  await t('remembered: the next ▶ Play starts at the size chosen last time (same refresh and screen), its ladder from there', () => {
    const f = fake({ look: 'best', hz: 60, shadow: { size: 1024, to: 2048, hz: 60 } });
    f.r.render(f.scene);
    assert.strictEqual(f.sun.shadow.mapSize.x, 1024); assert.strictEqual(f.point.shadow.mapSize.x, 512);
    const p = f.B().shadow.plan(); assert.deepStrictEqual(p.ladder, [1024, 512]); assert.strictEqual(p.remembered, 1024);
    assert.strictEqual(f.made(), 2, 'never made at 2048');
    f.B().shadow.commit(1024, { by: 'remembered', why: 'fits' });
    assert.strictEqual(f.look().report().shadows.chosen.by, 'remembered');
    assert.ok(/Shadows: 1024 \(chosen while getting ready, remembered for this game\)/.test(f.look().text()), f.look().text());
    const f2 = fake({ look: 'best', hz: 144, shadow: { size: 1024, to: 2048, hz: 60 } }); f2.r.render(f2.scene);
    assert.strictEqual(f2.sun.shadow.mapSize.x, 2048, 'another refresh: chosen again');
    const f3 = fake({ look: 'best', hz: 60, shadow: { size: 1024, to: 2048, hz: 60 } }, 960); f3.r.render(f3.scene);
    assert.strictEqual(f3.sun.shadow.mapSize.x, 1024, 'another screen (its own size 1024): chosen again from there');
    assert.strictEqual(f3.look().report().shadows.chosen, null);
  });
  await t('getting ready skipped: the doctor says the size wasn\'t measured', () => {
    const f = fake({ look: 'best', hz: 60 }); f.r.render(f.scene);
    assert.ok(/Shadows: 2048 \(matched to the screen; not measured: getting ready was skipped\)/.test(f.look().text()), f.look().text());
  });

  // ---------- the memory per game ----------
  await t('remembered per game: the chosen size kept with the game\'s record, read back, forgotten alone', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-shadowready-'));
    PB.init({ dataDir: dir });
    const clink = { kind: 'lab', id: 's1clink', title: 'Clink' };
    assert.strictEqual(PB.note(clink, { off: [], shadow: { size: 1024, to: 2048, hz: 120, by: 'ready' } }), true);
    assert.deepStrictEqual({ ...PB.forGame(clink).shadow, at: 0 }, { size: 1024, to: 2048, hz: 120, at: 0 });
    assert.strictEqual(PB.note(clink, { off: [], shadow: { size: 1024, to: 2048, hz: 120, by: 'remembered' } }), false, 'the same: nothing written');
    assert.strictEqual(PB.note(clink, { off: [], shadow: { size: 99, to: 2048, hz: 120, by: 'ready' } }), false, 'nonsense ignored');
    assert.strictEqual(PB.note(clink, { off: [{ id: 'stream', by: 'watch', ms: 0.3 }] }), true);
    await new Promise((r) => setTimeout(r, 400));
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'game-cache', 'budget.json'), 'utf8'));
    assert.strictEqual(disk.games['lab:s1clink'].shadow.size, 1024); assert.deepStrictEqual(disk.games['lab:s1clink'].off, ['stream']);
    assert.strictEqual(PB.forgetShadow(clink), true);
    assert.strictEqual(PB.forGame(clink).shadow, undefined); assert.deepStrictEqual(PB.forGame(clink).off, ['stream'], 'the helpers kept');
    assert.strictEqual(PB.forgetShadow(clink), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  console.log(`${n} passed`);
  process.exit(0); // (the look's guard waits on a timer)
})().catch((e) => { console.error(e); process.exit(1); });
