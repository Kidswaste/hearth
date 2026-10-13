#!/usr/bin/env node
// Lab adaptive quality (round 31 "labadapt"): the step-down / step-up logic of the preview ("<adapt-core>" in
// tools/three-sandbox.html), run in Node on simulated frame gaps: the order of the steps (resolution, filters, shadows,
// particles), sustained slowness only, steps the scene can't use passed over, climbing back with headroom, hysteresis
// (a climb that comes straight back down waits twice as long), the fps-cap floor, hitches ignored, hold, and a
// simulated machine that is just too slow for full quality settling instead of flickering.
//   node dev/labadapt-test.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'three-sandbox.html'), 'utf8');
const src = /\/\/ <adapt-core>[^\n]*\n([\s\S]*?)\/\/ <\/adapt-core>/.exec(html)?.[1];
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };
check(Boolean(src), 'the adapt core is in the sandbox');
if (!src) process.exit(1);
const adaptCore = new Function(`${src}\nreturn adaptCore;`)();
const T60 = 1000 / 60;
// feed `ms` of frames with gap g (or g(level)); returns the level changes seen
function run(A, ms, g, clock, onFloor) {
  const changes = [];
  const end = clock.t + ms;
  while (clock.t < end) {
    const gap = typeof g === 'function' ? g(A.level) : g;
    clock.t += gap;
    const v = A.feed(gap, T60, clock.t, onFloor);
    if (v?.step) changes.push({ at: Math.round(clock.t), level: A.level, step: v.step });
  }
  return changes;
}

// 1. the ladder: resolution first, then filters, shadows, particles; never below half resolution
{
  const A = adaptCore();
  const S = A.STEPS;
  const scales = S.map((s) => s.scale);
  const firstFx = S.findIndex((s) => s.fx > 0); const firstSh = S.findIndex((s) => s.shadow < 1); const firstPt = S.findIndex((s) => s.parts < 1);
  check(scales[0] === 1 && scales[1] === 0.85 && scales[2] === 0.7 && scales[3] === 0.5 && Math.min(...scales) === 0.5, 'resolution steps 1 → 0.85 → 0.7 → 0.5 first', scales);
  check(firstFx === 4 && firstSh > firstFx && firstPt > firstSh, 'then filters, then shadows, then particles', { firstFx, firstSh, firstPt });
  check(S.every((s, i) => !i || (s.scale <= S[i - 1].scale && s.fx >= S[i - 1].fx && s.shadow <= S[i - 1].shadow && s.parts <= S[i - 1].parts)), 'every step is lighter than the one before (never heavier in any knob)');
  check(S[0].scale === 1 && S[0].fx === 0 && S[0].shadow === 1 && S[0].parts === 1, 'level 0 is full quality');
}
// 2. smooth frames: nothing changes
{
  const A = adaptCore(); const c = { t: 0 };
  const ch = run(A, 20000, T60 * 1.05, c);
  check(A.level === 0 && !ch.length, 'smooth frames (60 fps): stays at full quality for 20 s', { level: A.level });
}
// 3. sustained: one slowish window is not enough, two in a row are; a badly slow window is enough on its own
{
  const A = adaptCore(); const c = { t: 0 };
  // 45 frames, 30 % slow (share 0.3): one window
  for (let i = 0; i < 45; i += 1) { const g = i % 10 < 3 ? 30 : T60; c.t += g; A.feed(g, T60, c.t); }
  check(A.level === 0, 'one window with 30 % slow frames: no step (a moment, not sustained)', { level: A.level });
  for (let i = 0; i < 45; i += 1) { const g = i % 10 < 3 ? 30 : T60; c.t += g; A.feed(g, T60, c.t); }
  check(A.level === 1, '…a second one in a row: one step down (0.85)', { level: A.level });
  const B = adaptCore(); const c2 = { t: 0 };
  run(B, 1700, 40, c2);
  check(B.level === 1, 'badly slow (every frame 40 ms): a step after one window', { level: B.level });
  // the window right after a step only settles
  const at = B.level; for (let i = 0; i < 4; i += 1) { c2.t += 40; B.feed(40, T60, c2.t); }
  check(B.level === at, 'the window right after a step settles (no double step)', { level: B.level });
}
// 4. steps the scene can't use are passed over (no filters, no shadows, no particles → stops at half resolution)
{
  const none = adaptCore({ useful: () => false }); const c = { t: 0 };
  const ch = run(none, 30000, 50, c);
  check(none.level === 3 && ch.length === 3, 'a plain scene: three steps (resolution) and no more, however slow', { level: none.level, steps: ch.length });
  const parts = adaptCore({ useful: (k) => k === 'parts' }); const c2 = { t: 0 };
  const ch2 = run(parts, 30000, 50, c2);
  check(ch2.map((x) => x.level).join(',') === '1,2,3,8,9', 'particles only: resolution steps, then straight to the particle steps', ch2.map((x) => x.level));
  const all = adaptCore(); const c3 = { t: 0 };
  const ch3 = run(all, 60000, 50, c3);
  check(all.level === all.STEPS.length - 1 && ch3.length === all.STEPS.length - 1, 'everything in the scene: every step, in order, down to the last', { level: all.level, steps: ch3.length });
  // and back up the same way, passing over the same steps
  const ch4 = run(parts, 60000, T60, c2);
  check(ch4.map((x) => x.level).join(',') === '8,3,2,1,0', 'climbing back passes over the same unused steps', ch4.map((x) => x.level));
}
// 5. climbing back: only after a calm while (4 s), one step at a time
{
  const A = adaptCore(); const c = { t: 0 };
  run(A, 3000, 50, c);
  const lv = A.level;
  const t0 = c.t;
  const ch = run(A, 30000, T60, c).filter((x) => x.step < 0); // (the climbs: a window still open from the slow part may step down once first)
  const first = ch[0] ? ch[0].at - t0 : null;
  check(lv >= 1 && first != null && first >= 4000, 'headroom: the first step up comes after ≥ 4 s of calm', { from: lv, firstUpAfterMs: first });
  check(ch.every((x, i) => !i || x.at - ch[i - 1].at >= 4000), '…and each next one ≥ 4 s after the one before', ch.map((x) => x.at - t0));
  check(A.level === 0, '…back to full quality', { level: A.level });
}
// 6. hysteresis: a climb that comes straight back down makes the next climb wait twice as long (up to 64 s)
{
  const A = adaptCore(); const c = { t: 0 };
  // a machine that is smooth at level 1 and too slow at level 0
  const machine = (l) => (l === 0 ? 24 : T60);
  const ch = run(A, 180000, machine, c);
  const ups = ch.filter((x, i) => i && x.level < ch[i - 1].level);
  const gaps = ups.map((x, i) => (i ? x.at - ups[i - 1].at : null)).filter(Boolean);
  check(ch.length <= 14, 'a machine just too slow for full quality: few changes in 3 minutes (no flicker)', { changes: ch.length });
  check(gaps.length >= 2 && gaps.every((g, i) => !i || g >= gaps[i - 1] * 1.5), 'each failed climb waits longer than the last (4 → 8 → 16 → 32 → 64 s)', gaps.map((g) => Math.round(g / 1000)));
  check(A.state().upWait <= 64000 && A.state().flips >= 2, 'the wait is capped at 64 s', A.state());
  // a long calm since the last step down: climbs are quick again
  const B = adaptCore(); const c2 = { t: 0 };
  run(B, 2000, 50, c2); run(B, 9000, T60, c2); run(B, 2000, 50, c2); // (down, up, straight back down: a flip)
  const w = B.state().upWait;
  run(B, 200000, T60, c2);
  run(B, 2000, 50, c2); const t1 = c2.t; const ch2 = run(B, 10000, T60, c2);
  check(w > 4000 && ch2.length && ch2[0].at - t1 < 7000, 'after a long calm the wait is back to ~4 s', { waitAfterFlip: w, nextUpAfterMs: ch2[0] ? Math.round(ch2[0].at - t1) : null });
}
// 7. the floor: at half resolution the page may cap the frame rate instead (a fast screen → a steady 60)
{
  let asked = 0;
  const A = adaptCore(); const c = { t: 0 };
  run(A, 30000, 50, c, () => { asked += 1; return true; });
  check(A.level === 3 && asked >= 1, 'at the lowest resolution the fps cap is tried first (no filter / shadow / particle steps while it holds)', { level: A.level, asked });
}
// 8. hitches say nothing; hold keeps a level
{
  const A = adaptCore(); const c = { t: 0 };
  for (let k = 0; k < 10; k += 1) { run(A, 600, T60, c); c.t += 400; A.feed(400, T60, c.t); }
  check(A.level === 0, 'a 400 ms hitch now and then (a reload, a hidden window): no step', { level: A.level });
  A.set(5, { hold: true });
  run(A, 20000, T60, c);
  check(A.level === 5 && A.state().hold, 'held at a level (tests): stays there', A.state());
  A.reset();
  check(A.level === 0 && !A.state().hold, 'reset: full quality, not held');
}
// 9. speed: the per-frame cost of feeding a gap
{
  const A = adaptCore(); const c = { t: 0 }; const n = 200000;
  const t = process.hrtime.bigint();
  for (let i = 0; i < n; i += 1) { c.t += T60; A.feed(T60, T60, c.t); }
  const ns = Number(process.hrtime.bigint() - t) / n;
  check(ns < 2000, 'feeding one frame costs well under a microsecond or two', `${Math.round(ns)} ns`);
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
