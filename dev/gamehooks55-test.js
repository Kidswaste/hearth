// ▶ Play's own scripts in the game's window never break the game (round 55, fixes55). gamelook-preload.js,
// tools/gamestream-page.js and tools/gameaudio-page.js hook the game's three.js (render, add / attach), its fetch / XHR,
// its pictures (img.src), its WebGL uploads and its sound (decodeAudioData): a throw in Hearth's part of a hook must
// never stop the game's own call. Plain Node: each script runs in a vm with just enough of a browser, then each hook is
// made to meet something that throws (an object whose getter throws, a renderer whose properties throw…):
//   the game's call still runs and returns its own result, and nothing is thrown at the game.
//   node dev/gamehooks55-test.js        (--from <dir>: the scripts of another copy, e.g. round 54's)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FROM = (() => { const i = process.argv.indexOf('--from'); return i > 0 ? path.resolve(process.argv[i + 1]) : path.join(__dirname, '..'); })();
const fails = [];
const ok = (c, what) => { console.log(`${c ? '✓' : '✖'} ${what}`); if (!c) fails.push(what); return c; };
const boom = () => { throw new Error('boom'); };
const tryIt = (fn) => { try { return { v: fn() }; } catch (err) { return { err }; } };

// a minimal browser: enough for the three scripts to install their hooks
function browser() {
  const W = new vm.createContext({});
  vm.runInContext(`
    var window = globalThis; var self = globalThis;
    var location = { href: 'hearth-game://abc/play.html', origin: 'hearth-game://abc' };
    var document = { currentScript: null, baseURI: location.href, visibilityState: 'visible', addEventListener() {}, querySelectorAll: () => [], documentElement: null, readyState: 'complete' };
    var addEventListener = () => {};
    var performance = { now: () => Date.now(), getEntriesByType: () => [] };
    window.fetches = 0;
    var fetch = function (input) { window.fetches += 1; return Promise.resolve({ ok: true, headers: { get: () => '10' }, blob: async () => ({ size: 1 }) }); };
    function XMLHttpRequest() {} XMLHttpRequest.prototype.open = function () { this.opened = true; }; XMLHttpRequest.prototype.send = function () { this.sent = true; return 'sent'; };
    XMLHttpRequest.prototype.addEventListener = function () {};
    function HTMLImageElement() { this._src = ''; }
    Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, enumerable: true, get() { return this._src; }, set(v) { this._src = String(v); } });
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, enumerable: true, get() { return true; } });
    HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
    HTMLImageElement.prototype.addEventListener = function () {}; HTMLImageElement.prototype.removeEventListener = function () {};
    function HTMLVideoElement() {} function ImageBitmap() {}
    function Response() {} Response.prototype.arrayBuffer = function () {};
    function HTMLMediaElement() {} HTMLMediaElement.prototype.play = function () { return 'played'; };
    window.decoded = 0;
    function BaseAudioContext() {} BaseAudioContext.prototype.decodeAudioData = function (buf, ok) { window.decoded += 1; if (ok) ok('buffer'); return Promise.resolve('buffer'); };
    window.AudioContext = class AudioContext extends BaseAudioContext { constructor() { super(); this.sampleRate = 48000; this.state = 'running'; } createBufferSource() { return { connect() {}, start() {} }; } createBuffer() { return {}; } get destination() { return {}; } suspend() { return Promise.resolve(); } resume() { return Promise.resolve(); } }
    var WeakRef = globalThis.WeakRef; var URL = globalThis.URL || null; var URLSearchParams = globalThis.URLSearchParams || null;
    var setTimeout = (f) => 0; var requestAnimationFrame = () => 0; var matchMedia = () => ({ matches: false });
    var screen = { width: 1920, height: 1080 }; var devicePixelRatio = 1;
    var PerformanceObserver = function () { this.observe = () => {}; };
    // three.js's devtools hook (EventTarget): the scripts listen to it
    var __listeners = {};
    window.__THREE_DEVTOOLS__ = { addEventListener(t, f) { (__listeners[t] = __listeners[t] || []).push(f); }, dispatch(t, detail) { for (const f of __listeners[t] || []) f({ detail }); } };
  `, W);
  W.URL = URL; W.URLSearchParams = URLSearchParams; W.WeakRef = WeakRef;
  return W;
}
// three.js's shapes, just enough: Object3D (add / attach on its prototype), Scene, a renderer
function three(W) {
  return vm.runInContext(`(() => {
    class Object3D { constructor() { this.children = []; this.parent = null; this.isObject3D = true; this.visible = true; }
      add(...os) { for (const o of os) { o.parent = this; this.children.push(o); } return this; } // (the game's add doesn't read what Hearth's look reads)
      attach(o) { return this.add(o); }
      traverse(f) { f(this); for (const c of this.children) c.traverse(f); } }
    class Scene extends Object3D { constructor() { super(); this.isScene = true; } }
    class Mesh extends Object3D { constructor(m) { super(); this.isMesh = true; this.material = m; this.geometry = { attributes: {} }; } }
    const renderer = { isWebGLRenderer: true, drawn: 0, capabilities: { getMaxAnisotropy: () => 16, maxTextureSize: 4096 }, outputColorSpace: 'srgb', info: { memory: { textures: 0 }, programs: [] },
      properties: { get() { throw new Error('three: not a known object'); } },
      render(scene, camera) { this.drawn += 1; return 'drawn'; }, compile() { return 'compiled'; }, getContext() { return null; } };
    return { Object3D, Scene, Mesh, renderer };
  })()`, W);
}
const run = (W, file) => vm.runInContext(fs.readFileSync(path.join(FROM, file), 'utf8'), W, { filename: file });

(async () => {
  // ---------- gamelook-preload.js ----------
  {
    const W = browser(); const T = three(W);
    run(W, 'gamelook-preload.js');
    vm.runInContext('gameLookPage({ look: "best", hz: 60 })', W);
    W.__THREE_DEVTOOLS__.dispatch('observe', T.renderer);
    const scene = new T.Scene();
    ok(tryIt(() => T.renderer.render(scene, {})).v === 'drawn', 'gamelook: the game\'s render runs and returns its own result');
    const bad = Object.defineProperty(new T.Object3D(), 'isObject3D', { get: boom });
    const r = tryIt(() => scene.add(bad));
    ok(!r.err && r.v === scene, `gamelook: scene.add of an object that throws on a look: the game's add runs, nothing thrown at the game (${r.err?.message || 'ok'})`);
    const r2 = tryIt(() => scene.attach(bad));
    ok(!r2.err, `gamelook: attach likewise (${r2.err?.message || 'ok'})`);
    const sceneBad = Object.defineProperty(new T.Scene(), 'isObject3D', { get: boom });
    ok(tryIt(() => T.renderer.render(sceneBad, {})).v === 'drawn', 'gamelook: a scene that throws on a look still draws');
    const odd = { isWebGLRenderer: true, get render() { throw new Error('frozen'); } };
    ok(!tryIt(() => W.__THREE_DEVTOOLS__.dispatch('observe', odd)).err, 'gamelook: a renderer that can\'t be hooked: nothing thrown into the game\'s constructor');
  }

  // ---------- tools/gamestream-page.js ----------
  {
    const W = browser(); const T = three(W);
    W.__gameReady = { phase: 'playing' };
    run(W, 'tools/gamestream-page.js');
    W.__THREE_DEVTOOLS__.dispatch('observe', T.renderer);
    const scene = new T.Scene();
    ok(T.renderer.render(scene, {}) === 'drawn', 'gamestream: the first frame draws');
    scene.add(new T.Mesh({ type: 'MeshStandardMaterial' })); // (added while playing: Hearth looks at it before it's drawn)
    const before = T.renderer.drawn;
    const r = tryIt(() => T.renderer.render(scene, {}));
    ok(!r.err && r.v === 'drawn' && T.renderer.drawn === before + 1, `gamestream: three's properties throwing on Hearth's look: the game's frame still drawn, once (${r.err?.message || r.v})`);
    ok(T.renderer.render(scene, {}) === 'drawn', 'gamestream: and the next ones');
    const weird = { toString: boom, get url() { return undefined; } };
    const f = tryIt(() => W.fetch(weird));
    ok(!f.err && W.fetches === 1, `gamestream: the game's fetch of an input Hearth can't name still goes out (${f.err?.message || 'ok'})`);
    const x = new W.XMLHttpRequest(); x.open('GET', { toString: boom });
    const s = tryIt(() => x.send());
    ok(!s.err && x.sent, `gamestream: the game's XHR still sent (${s.err?.message || 'ok'})`);
    const bad = Object.defineProperty(new T.Object3D(), 'isObject3D', { get: boom });
    ok(!tryIt(() => scene.add(bad)).err, 'gamestream: scene.add of an object that throws on a look: nothing thrown at the game');
  }

  // ---------- tools/gameaudio-page.js ----------
  {
    const W = browser();
    run(W, 'tools/gameaudio-page.js');
    const ctx = new W.AudioContext();
    ok(ctx && ctx.sampleRate === 48000, 'gameaudio: the game\'s AudioContext is made');
    const odd = Object.create(W.BaseAudioContext.prototype, { sampleRate: { get: boom } });
    let p = null; const d = tryIt(() => { p = W.BaseAudioContext.prototype.decodeAudioData.call(odd, new ArrayBuffer(64)); return p; });
    ok(!d.err && W.decoded === 1, `gameaudio: a decode Hearth can't fingerprint goes to the browser's own decode (${d.err?.message || 'ok'})`);
    const v = p ? await p.catch((e) => `rejected: ${e.message}`) : null;
    ok(v === 'buffer', `gameaudio: with its own result (${v})`);
    ok(tryIt(() => W.HTMLMediaElement.prototype.play.call(new W.HTMLMediaElement())).v === 'played', 'gameaudio: the game\'s play() runs');
    ok(!tryIt(() => W.AudioContext.prototype.suspend.call(ctx)).err && !tryIt(() => W.AudioContext.prototype.resume.call(ctx)).err, 'gameaudio: suspend / resume');
  }

  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
