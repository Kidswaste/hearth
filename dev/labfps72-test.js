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
    const frames = []; const timers = [];
    const env = { XP_PAGE: false, realRAF: (f) => frames.push(f), realSetTimeout: (f) => { timers.push(f); return timers.length; }, realClearTimeout: () => {} };
    const mk = new Function(...Object.keys(env), `${src}\nreturn { upRelease, UPQ };`);
    const { upRelease, UPQ } = mk(...Object.values(env));
    const done = [];
    const ps = [0, 1, 2, 3].map((i) => upRelease(() => done.push(i), 4096 * 4096));
    upRelease(() => done.push('small'), 512 * 512);
    check(done.join() === 'small', 'a small picture goes at once; big ones wait for frames', done);
    const tick = () => { const l = frames.splice(0); for (const f of l) f(); };
    tick(); check(done.join() === 'small,0', 'one big picture a frame (1)', done);
    tick(); tick(); check(done.join() === 'small,0,1,2', 'one big picture a frame (2, 3)', done);
    // no frames (a hidden page): the timer hands them over
    const t = timers.splice(0); for (const f of t) f();
    check(done.join() === 'small,0,1,2,3' && UPQ.q.length === 0, 'a page that isn\'t drawing: the timer hands the last one over', done);
    Promise.all(ps).then(() => check(true, 'every hand-over resolves (a render\'s exact frame waits on it)'));
  }
}
// ---------- ▶ Play's wiring ----------
const gm = fs.readFileSync(path.join(ROOT, 'gamemode.js'), 'utf8'); const gmm = fs.readFileSync(path.join(ROOT, 'gamemodemain.js'), 'utf8'); const gp = fs.readFileSync(path.join(ROOT, 'game-preload.js'), 'utf8');
check(/quality: qualityPref\(\)/.test(gm) && /label: `Quality: \$\{qualityPref\(\) === 'full' \? 'Full' : 'Auto'\}`/.test(gm), '▶ Play: the choice goes with the game, and ▶ Play\'s menu shows Quality: Auto / Full');
check(/quality: req\.quality === 'full' \? 'full' : 'auto'/.test(gmm) && /gamequality-preload\.js/.test(gmm), 'the game window gets it (--hearth-game) and the preload that applies it');
check(/window\.__gameQuality/.test(gp) && /class="aq"/.test(gp), 'the F chip says it and has a Quality button');
setTimeout(() => { console.log(fails ? `\n${fails} failed` : '\nall passed'); process.exit(fails ? 1 : 0); }, 50);
