#!/usr/bin/env node
// ▶ Play's Quality: auto (round 72, labfps72): qualityCore() from gamequality-preload.js on fake looks (the median / p90
// frame gaps of a 24-frame look against the screen's refresh), plus the Lab preview's pieces that are plain code: the
// modal cap in the preview page's applyCap and the uploads' one-a-frame queue.
//   node dev/labfps72-test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { qualityCore } = require(path.join(ROOT, 'gamequality-preload.js'));
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };

// a fake game: its frame time = cpu + gpu × (scale²) (the pixels drawn), shown at the refresh (vsync: a whole number of
// refreshes); a look every second
const B = 1000 / 240;
function frameGap(cpu, gpu, scale, hz = 240) { const ms = Math.max(cpu, gpu * scale * scale); const r = 1000 / hz; return Math.max(1, Math.ceil(ms / r - 1e-9)) * r; }
function run(q, { cpu = 1, gpu = 6, secs = 60, hz = 240, change = null } = {}) {
  const steps = [];
  for (let t = 1000; t <= secs * 1000; t += 1000) {
    const g = change ? change(t, { cpu, gpu }) : { cpu, gpu };
    const gap = frameGap(g.cpu, g.gpu, q.scale, hz);
    const v = q.feed({ med: gap, p90: gap * 1.02 }, 1000 / hz, t);
    if (v.step) steps.push([t, v.scale, v.why]);
  }
  return steps;
}

// 1. GPU-bound at 240 Hz (6 ms of pixels, 1 ms of JS): steps down until it fits, then stays
{
  const q = qualityCore();
  const s = run(q, { cpu: 1, gpu: 6 });
  check(q.scale < 1 && frameGap(1, 6, q.scale) <= B + 1e-6, 'GPU-bound (6 ms of pixels at 240 Hz): steps down until the frame fits', { scale: q.scale, steps: s });
  const tries = s.filter(([, , w]) => w === 'room').map(([t]) => t);
  check(tries.length <= 3 && tries.every((t, i) => i < 2 || t - tries[i - 1] > tries[i - 1] - tries[i - 2]), 'and settles: a climb now and then to see if there\'s room, each later than the last (no flicker)', s);
  check(s[0] && s[0][0] <= 2000, 'reacts within ~2 s (two looks that miss)', s[0]);
}
// 2. CPU-bound (the game's own JS: 7 ms): a step down doesn't help → undone, held, and after 3 tries left alone
{
  const q = qualityCore();
  const s = run(q, { cpu: 7, gpu: 2, secs: 600 });
  check(q.scale === 1, 'CPU-bound: back at full resolution (fewer pixels don\'t help)', { scale: q.scale });
  const downs = s.filter(([, , w]) => w === 'missed').length;
  check(downs === 3 && s.some(([, , w]) => w === 'not-pixels-stop'), 'it tries 3 times (down to the floor, then back: 30 s, 60 s apart), then not again this play', s.map(([t, sc, w]) => `${t / 1000}s ${sc} ${w}`));
  check(s.filter(([, sc]) => sc === 1).length === 3 && s.length === 12, 'each try: 3 steps down, 1 back up (12 changes in 10 minutes)', s.length);
  check(q.state().held === 'this play', 'state: held for this play', q.state());
}
// 3. a heavy moment that passes: down, then back up to full when there's room
{
  const q = qualityCore();
  const s = run(q, { cpu: 1, gpu: 6, secs: 120, change: (t) => (t < 20000 ? { cpu: 1, gpu: 6 } : { cpu: 1, gpu: 2 }) });
  check(q.scale === 1, 'a heavy moment that passes: back to full', { scale: q.scale, steps: s });
  check(s.some(([, , w]) => w === 'room'), 'climbed back step by step (room)', s);
}
// 4. a climb that misses goes straight back down, and the next climb waits twice as long
{
  const q = qualityCore();
  // fits at 0.75, misses at 0.85: gpu 6.5 ms → 0.85² × 6.5 = 4.7 > 4.17; 0.75² × 6.5 = 3.66
  const s = run(q, { cpu: 1, gpu: 6.5, secs: 120 });
  const ups = s.filter(([, , w]) => w === 'room').map(([t]) => t);
  const missed = s.filter(([, , w]) => w === 'up-missed').length;
  check(q.scale === 0.75 && missed >= 1, 'a climb into frames that miss comes straight back down', { scale: q.scale, steps: s });
  check(ups.length >= 2 && ups[1] - ups[0] > ups[0] - (s.find(([, , w]) => w === 'helped')?.[0] || 0), 'and the next climb waits longer', ups);
  check(ups.length <= 4, 'at most a few climbs in 2 minutes (no flicker)', ups.length);
}
// 5. Full: never steps; switching to full goes back to every pixel at once
{
  const q = qualityCore(); q.mode('full');
  const s = run(q, { cpu: 1, gpu: 8 });
  check(q.scale === 1 && s.length === 0, 'Quality full: never fewer pixels', { scale: q.scale, steps: s });
  const q2 = qualityCore(); run(q2, { cpu: 1, gpu: 8, secs: 10 });
  const was = q2.scale; q2.mode('full');
  check(was < 1 && q2.scale === 1 && q2.state().mode === 'full', 'auto → full: every pixel at once', { was, now: q2.scale });
  q2.mode('auto');
  check(q2.state().mode === 'auto' && q2.scale === 1, 'full → auto: from full, steps again', q2.state());
}
// 6. fits at 60 Hz: nothing happens; a frame that fits with room never moves
{
  const q = qualityCore();
  const s = run(q, { cpu: 2, gpu: 3, hz: 60, secs: 120 });
  check(s.length === 0 && q.scale === 1, 'a game that fits: full resolution, no steps', s);
}
// 7. the floor: 67 % of the screen's pixels in each direction at most (44 % of the pixels)
{
  const q = qualityCore();
  run(q, { cpu: 1, gpu: 40 });
  check(q.scale === 0.67, 'the floor is 67 % (never a smeared picture)', q.scale);
  check(q.feed({ med: 0, p90: 0 }, B, 1e9).step === 0 && q.feed(null, B, 1e9).step === 0, 'a look without frames changes nothing');
}

// ---------- the Lab preview page (tools/three-sandbox.html): plain lines ----------
const html = fs.readFileSync(path.join(ROOT, 'tools', 'three-sandbox.html'), 'utf8');
check(/if \(capWant\.modal\) c = c \? Math\.min\(c, 30\) : 30;/.test(html) && /capWant\.modal = msg\.modal === true/.test(html), 'the preview page: a modal over the Lab caps it at 30 fps, whatever the setting');
const iCap = html.indexOf('if (capWant.modal)'); const iLock = html.indexOf('if (RDY.lock) c = 0;', iCap);
check(iCap > 0 && iLock > iCap, 'a show (Present / ▶ Play lock) still draws at the screen\'s rate (the lock comes after)');
// the uploads' queue, run with fake frames and timers
{
  const src = /const UPQ = \{[\s\S]*?\nfunction upFlush\(k\) \{[\s\S]*?\n\}\n/.exec(html)?.[0];
  check(Boolean(src), 'the uploads\' queue is in the page');
  if (src) {
    const frames = []; const timers = []; const after = [];
    // (round 89, labfps89) a frame hands over in a task queued from it (right after the frame): after = those tasks
    const env = { XP_PAGE: false, realRAF: (f) => frames.push(f), realSetTimeout: (f, ms) => { (ms === 0 ? after : timers).push(f); return timers.length + after.length; }, realClearTimeout: () => {} };
    const mk = new Function(...Object.keys(env), `${src}\nreturn { upRelease, UPQ };`);
    const { upRelease, UPQ } = mk(...Object.values(env));
    const done = [];
    const ps = [0, 1, 2, 3].map((i) => upRelease(() => done.push(i), 4096 * 4096));
    upRelease(() => done.push('small'), 512 * 512);
    check(done.join() === 'small', 'a small picture goes at once; big ones wait for frames', done);
    const tick = () => { const l = frames.splice(0); for (const f of l) f(); const n0 = done.length; const a = after.splice(0); if (l.length) check(done.length === n0, 'the hand-over waits until after the frame', done); for (const f of a) f(); };
    tick(); check(done.join() === 'small,0', 'one big picture a frame (1)', done);
    tick(); tick(); check(done.join() === 'small,0,1,2', 'one big picture a frame (2, 3)', done);
    // no frames (a hidden page): the timer hands them over
    const t = timers.splice(0); for (const f of t) f();
    check(done.join() === 'small,0,1,2,3' && UPQ.q.length === 0, 'a page that isn\'t drawing: the timer hands the last one over', done);
    Promise.all(ps).then(() => check(true, 'every hand-over resolves (a render\'s exact frame waits on it)'));
  }
}
// (round 90, labcompile90) a 4K picture in slices: its memory first, then ~2 MP a frame, mipmaps with the last, then the
// scene's texture takes it over (nothing uploaded again); two renderers drawing it: one piece, as before
{
  const src = /const UPQ = \{[\s\S]*?\nfunction upFlush\(k\) \{[\s\S]*?\n\}\n/.exec(html)?.[0];
  check(Boolean(src && /function upSlice\(/.test(src)), 'the slices are in the uploads\' queue');
  if (src) {
    class Source { constructor(d) { this.data = d; this.dataReady = true; this.version = 0; } }
    class Texture { constructor(img) { this.source = new Source(img); this.version = 0; this.flipY = true; this.generateMipmaps = true; this.minFilter = 1008; this.colorSpace = 'srgb'; } get image() { return this.source.data; } set image(v) { this.source.data = v; } set needsUpdate(v) { if (v) { this.version += 1; this.source.version += 1; } } dispose() { this.disposed = true; } }
    class Vector2 { constructor() { this.x = 0; this.y = 0; } set(x, y) { this.x = x; this.y = y; return this; } }
    class Box2 { constructor(a, b) { this.min = a; this.max = b; } }
    class ImageBitmap { constructor(w, h) { this.width = w; this.height = h; } }
    const mkEnv = (nR) => {
      const frames = []; const after = []; const log = [];
      const tex = new Texture(); tex.wrapS = 1001;
      const bmp = new ImageBitmap(4096, 4096);
      const mkR = (id) => ({ __lastScene: { traverse: (fn) => fn({ material: { map: tex } }) }, capabilities: { maxTextureSize: 16384 }, getContext: () => ({ isContextLost: () => false }),
        initTexture: (t) => log.push({ id, op: 'init', t, ready: t.source.dataReady, ver: t.source.version }), copyTextureToTexture: (s, d, box, at) => log.push({ id, op: 'copy', y0: box.min.y, y1: box.max.y, w: box.max.x - box.min.x, at: at.y, mips: d.generateMipmaps, d }) });
      const env = { XP_PAGE: false, realRAF: (f) => frames.push(f), realSetTimeout: (f, ms) => { if (ms === 0) after.push(f); return 1; }, realClearTimeout: () => {}, realNow: () => 0, THREE: { Texture, Box2, Vector2 }, ImageBitmap, renderers: new Set(Array.from({ length: nR }, (_, i) => mkR(i))) };
      const { upRelease, UPQ } = new Function(...Object.keys(env), `${src}\nreturn { upRelease, UPQ };`)(...Object.values(env));
      const tick = () => { const l = frames.splice(0); for (const f of l) f(); const a = after.splice(0); for (const f of a) f(); };
      return { upRelease, UPQ, tex, bmp, log, tick };
    };
    const E = mkEnv(1); let one = 0; let resolved = false;
    E.upRelease(() => { one += 1; }, 4096 * 4096, E.tex, E.bmp).then(() => { resolved = true; });
    let n = 0; const per = [];
    for (; n < 30 && !E.log.some((x) => x.op === 'init' && x.t === E.tex); n++) { const k = E.log.length; E.tick(); per.push(E.log.slice(k).filter((x) => x.t !== E.tex).length); }
    const copies = E.log.filter((x) => x.op === 'copy');
    const alloc = E.log[0];
    check(alloc?.op === 'init' && alloc.t !== E.tex && alloc.ready === false, 'a 4K picture: its memory made first, no pixels (one gap)', alloc && { op: alloc.op, ready: alloc.ready });
    check(copies.length === 8 && copies.every((c, i) => c.y0 === i * 512 && c.y1 === c.y0 + 512 && c.at === c.y0 && c.w === 4096), 'then 8 slices of 4096 × 512 (2.1 MP), in order, each at its own rows', copies.map((c) => `${c.y0}-${c.y1}`));
    check(per.length === 9 && per.every((k) => k === 1), 'one upload a frame (the memory, then a slice per gap after a frame)', per);
    check(copies.slice(0, -1).every((c) => c.mips === false) && copies.at(-1).mips === true, 'the mipmaps made once, with the last slice', copies.map((c) => c.mips));
    const take = E.log.at(-1);
    check(take?.op === 'init' && take.t === E.tex && E.tex.source === copies[0].d.source && E.tex.version === 1 && take.ver === copies[0].d.source.version && E.tex.flipY === false, 'then the scene\'s texture takes it over (same source, its version unchanged: nothing uploaded again)', { ver: E.tex.version });
    check(copies[0].d.disposed === true && E.tex.source.dataReady === true, 'the slices\' texture let go, the picture marked ready for a later upload');
    check(one === 0 && E.UPQ.q.length === 0, 'the one-piece hand-over never ran', one);
    setTimeout(() => check(resolved, 'the hand-over resolves when the last slice is in (an exact frame waits on it)'), 0);
    const F = mkEnv(2); let one2 = 0;
    F.upRelease(() => { one2 += 1; }, 4096 * 4096, F.tex, F.bmp); F.tick();
    check(one2 === 1 && !F.log.some((x) => x.op === 'copy'), 'two renderers drawing it: one piece, as before', { one2 });
    const G = mkEnv(1); let one3 = 0;
    G.upRelease(() => { one3 += 1; }, 1500 * 1000, G.tex, new ImageBitmap(1500, 1000)); G.tick();
    check(one3 === 1, 'a picture under 4 MP: one piece, as before', { one3 });
  }
}
// ---------- ▶ Play's wiring ----------
const gm = fs.readFileSync(path.join(ROOT, 'gamemode.js'), 'utf8'); const gmm = fs.readFileSync(path.join(ROOT, 'gamemodemain.js'), 'utf8'); const gp = fs.readFileSync(path.join(ROOT, 'game-preload.js'), 'utf8');
check(/quality: qualityPref\(\)/.test(gm) && /label: `Quality: \$\{qualityPref\(\) === 'full' \? 'Full' : 'Auto'\}`/.test(gm), '▶ Play: the choice goes with the game, and ▶ Play\'s menu shows Quality: Auto / Full');
check(/quality: req\.quality === 'full' \? 'full' : 'auto'/.test(gmm) && /gamequality-preload\.js/.test(gmm), 'the game window gets it (--hearth-game) and the preload that applies it');
check(/window\.__gameQuality/.test(gp) && /class="aq"/.test(gp), 'the F chip says it and has a Quality button');
setTimeout(() => { console.log(fails ? `\n${fails} failed` : '\nall passed'); process.exit(fails ? 1 : 0); }, 50);
