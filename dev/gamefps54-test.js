// ▶ Play's look at full frame rate (round 54 fix, gamefps54): gamelook-preload.js's gameLookPage() on a fake three.js
// (no GPU): shadow maps at most 2048² (a point light 1024²) whatever the screen, the scene looked at whole only before
// its first frame, then only what the game adds (a projectile a frame costs no whole-scene sweep), a picture put on an
// existing material later still found by the slow background walk (a slice a frame).
//   node dev/gamefps54-test.js
const assert = require('assert');
const { gameLookPage } = require('../gamelook-preload');
let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`✓ ${name}`); };

// ---------- a fake three.js: what gameLookPage reads ----------
class Object3D {
  constructor() { this.isObject3D = true; this.children = []; this.parent = null; this.visible = true; }
  add(...objs) { for (const o of objs) { o.parent = this; this.children.push(o); } return this; }
  traverse(cb) { cb(this); for (const c of this.children) c.traverse(cb); }
}
class Scene extends Object3D { constructor() { super(); this.isScene = true; this.background = null; this.environment = null; this.walks = 0; } traverse(cb) { this.walks += 1; super.traverse(cb); } }
class Texture { constructor() { this.isTexture = true; this.anisotropy = Texture.DEFAULT_ANISOTROPY; this.minFilter = 1008; this.magFilter = 1006; this.generateMipmaps = true; this.colorSpace = ''; this.type = 1009; } }
Texture.DEFAULT_ANISOTROPY = 1;
const mesh = (map) => { const m = new Object3D(); m.isMesh = true; m.material = { map: map || null }; return m; };
const light = (kind) => { const L = new Object3D(); L.isLight = true; L.castShadow = true; if (kind === 'point') L.isPointLight = true; L.shadow = { mapSize: { x: 512, y: 512, set(a, b) { this.x = a; this.y = b; } }, map: null }; return L; };
let clock = 0;
function page(w, h) {
  const g = globalThis;
  Object.defineProperty(g, 'performance', { configurable: true, value: { now: () => clock } });
  g.window = g; g.screen = { width: w, height: h }; g.devicePixelRatio = 1; g.matchMedia = () => ({ matches: false });
  g.requestAnimationFrame = () => 0; // (the guard waits on frames: none here, it settles on "fits" by itself)
  delete g.__gameLook; g.__THREE_DEVTOOLS__ = new EventTarget();
  gameLookPage({ look: 'best', hz: 240 });
  const r = { isWebGLRenderer: true, capabilities: { getMaxAnisotropy: () => 16, maxTextureSize: 16384 }, info: { memory: { textures: 0 } }, properties: { get: () => ({}) }, outputColorSpace: 'srgb', render() {}, compile() {}, initTexture() {} };
  const ev = new Event('observe'); Object.defineProperty(ev, 'detail', { value: r }); g.__THREE_DEVTOOLS__.dispatchEvent(ev);
  return r;
}

(async () => {
  for (const [w, h, sun, point] of [[3840, 2160, 2048, 1024], [2560, 1440, 2048, 1024], [1920, 1080, 2048, 1024], [1280, 720, 1024, 512]]) {
    await t(`shadows on a ${w}×${h} screen: sun / spot ${sun}², point ${point}² (never 4096²)`, () => {
      const r = page(w, h); const scene = new Scene(); const s = light(); const sp = light(); const p = light('point');
      scene.add(s, sp, p, mesh(new Texture()));
      r.render(scene, {});
      assert.strictEqual(s.shadow.mapSize.x, sun); assert.strictEqual(sp.shadow.mapSize.x, sun); assert.strictEqual(p.shadow.mapSize.x, point);
    });
  }
  await t('a projectile a frame: the scene looked at whole once (before its first frame), each new object before it is drawn, never a whole-scene sweep inside a frame', () => {
    clock = 0; const r = page(2560, 1440); const scene = new Scene();
    for (let i = 0; i < 500; i += 1) scene.add(mesh(new Texture()));
    r.render(scene, {});
    assert.strictEqual(scene.walks, 1);
    let late = null; let worst = 0;
    for (let f = 1; f <= 1200; f += 1) { // 5 s at 240 Hz
      clock = f * 4.17;
      const b = mesh(); b.material = { map: null }; scene.add(b);
      if (f === 300) { late = new Texture(); late.anisotropy = 1; scene.children[10].material.map = late; } // a picture put on a material the scene had
      const before = scene.walks; r.render(scene, {}); worst = Math.max(worst, scene.walks - before);
      assert.ok(b.material, 'added');
    }
    const R = globalThis.__gameLook.report();
    assert.strictEqual(scene.walks, 1, 'no whole-scene traverse mid-play');
    assert.strictEqual(worst, 0);
    assert.strictEqual(late.anisotropy, 16, 'the picture put on later is found by the slow walk');
    assert.ok(R.cost.playMax < 5, `a frame's own look stays small (${R.cost.playMax} ms on the fake clock)`);
  });
  await t('a texture made later gets the best anisotropy from three\'s default (no sweep needed)', () => {
    assert.strictEqual(new Texture().anisotropy, 16);
  });
  // (round 57, framepace57) gamefps54's verdict from interleaved on / off blocks (dev/framepace-verdict.js), on frames
  // like this machine's: a software graphics card, gaps in whole 60 Hz refreshes (83 / 100 / 117 ms), a busy machine
  const V = require('./framepace-verdict');
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const blockOf = (drift, o = {}) => { const g = []; for (let i = 0; i < 12; i += 1) g.push(16.67 * Math.max(1, Math.round((100 + drift + (o.slow || 0)) / 16.67 + (rnd() - 0.5) * 1.6))); return { gapMean: g.reduce((a, b) => a + b, 0) / g.length, over: 0.05 + rnd() * 0.04 + (o.over || 0), cpu: 6 + rnd() * 0.8 + (o.over || 0) }; };
  const pairsOf = (n, on = {}) => Array.from({ length: n }, (_, i) => { const drift = Math.sin(i) * 20; return { on: blockOf(drift, on), off: blockOf(drift) }; });
  await t('verdict: nothing of Hearth\'s per frame on a busy machine (gaps in whole refreshes, drifting ±20 ms): not slower, 20 tries', () => {
    for (let k = 0; k < 20; k += 1) { const j = V.judge(pairsOf(10)); assert.ok(j.ok, JSON.stringify(j)); }
  });
  await t('verdict: a helper that costs 1 ms a frame around the render: caught by its CPU, even when frames hide it', () => {
    for (let k = 0; k < 10; k += 1) { const j = V.judge(pairsOf(10, { over: 1 })); assert.ok(!j.ok && !j.cpu.ok && /around the game's render/.test(j.why), JSON.stringify(j)); }
  });
  await t('verdict: the 1 ms helper still caught when the machine is loaded to ~1 frame a second (the frame\'s CPU reads 65 ms)', () => {
    const P = pairsOf(10, { over: 1 }).map((p) => ({ on: { ...p.on, cpu: 65 }, off: { ...p.off, cpu: 64 } }));
    const j = V.judge(P); assert.ok(!j.ok && !j.cpu.ok && j.cpu.allow <= 0.5, JSON.stringify(j.cpu));
  });
  await t('verdict: frames really slower (+15 %, the picture or anything off the main thread): caught by the gaps', () => {
    let caught = 0; for (let k = 0; k < 10; k += 1) { const j = V.judge(pairsOf(10, { slow: 15 })); if (!j.frames.ok) caught += 1; assert.ok(j.cpu.ok); }
    assert.ok(caught >= 9, `caught ${caught} of 10`);
  });
  await t('verdict: too few pairs is never a pass', () => { assert.ok(!V.judge(pairsOf(3)).ok); });
  console.log(`${n} passed`);
  process.exit(0); // (the look's guard keeps watching: a timer)
})().catch((e) => { console.error(e); process.exit(1); });
