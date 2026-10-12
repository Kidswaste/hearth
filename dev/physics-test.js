#!/usr/bin/env node
// ⚛ Light physics (round 25): the solver in tools/three-sandbox.html ("<physics-core>") and the scene builders, run in
// Node: things fall, bounce, stack, topple, swing, flap and settle as they should; a kick changes velocities; the
// same steps give the same numbers; a cached state restores exactly; every scene builder runs (speed per step).
//   node dev/physics-test.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'three-sandbox.html'), 'utf8');
const coreSrc = /function physicsCore\(\) \{[\s\S]*?\n\}\n(?=\/\/ <\/physics-core>)/.exec(html)?.[0];
const buildSrc = /const PH_BUILDS = \{[\s\S]*?\n(?=\/\/ a 🧊 model layer's model)/.exec(html)?.[0];
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };
check(Boolean(coreSrc && buildSrc), 'the solver and the builders are in the sandbox');
const seeded = (seed = 1) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const document = { createElement: () => ({ getContext: () => ({ font: '', measureText: (ch) => ({ width: /[MW]/.test(ch) ? 90 : /[Iil1]/.test(ch) ? 30 : 65 }) }) }) };
const PH = {};
const { core, BUILDS } = new Function('seeded', 'document', 'PH', `${coreSrc}\n${buildSrc}\nreturn { core: physicsCore(), BUILDS: PH_BUILDS };`)(seeded, document, PH);
const { World } = core;
const ENV = { gravity: 1, bounce: 0.3, friction: 0.5, damping: 0.05, stiffness: 0.5, timeScale: 1, sub: 8, iters: 1, wind: 0, turb: 0, kick: false, kickImp: 0, kickMode: 'jump', kickOnly: 'all', drop: false, dropImp: 0 };
const run = (W, n, env = {}, each = null) => { const t = process.hrtime.bigint(); for (let s = 0; s < n; s += 1) { W.step({ ...ENV, ...env, ...(each ? each(W.misc[0] + 1) : {}) }); } return Number(process.hrtime.bigint() - t) / 1e6 / n; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const angleOf = (W, k) => (2 * Math.acos(Math.min(1, Math.abs(W.bq[k * 4 + 3]))) * 180) / Math.PI;

// 1. a ball falls and bounces back up (bounce 0.8), then a dead ball (bounce 0) stays down
{
  const mk = (bounce) => { const W = new World({}).finish ? new World({}) : null; W.sphere(0, 2, 0, 0.2, {}); W.finish(); let peak = 0; let landed = false; let minY = 9; for (let s = 0; s < 150; s += 1) { W.step({ ...ENV, bounce }); const y = W.x[1]; minY = Math.min(minY, y); if (y < 0.25) landed = true; if (landed) peak = Math.max(peak, y); } return { minY: r3(minY), peak: r3(peak) }; };
  const a = mk(0.8); const b = mk(0);
  check(a.minY > 0.17 && a.peak > 1.0, 'a ball falls onto the floor and bounces back up (bounce 0.8)', a);
  check(b.peak < 0.3, '…and with bounce 0 it stays down', b);
}
// 2. a stack of boxes stands still and falls asleep
{
  const W = new World({}); for (let k = 0; k < 6; k += 1) W.box(0, 0.25 + k * 0.5, 0, 0.25, 0.25, 0.25, {}); W.finish();
  const ms = run(W, 300, { iters: 2 }); const p = W.probe();
  check(Math.abs(W.bc[5 * 3 + 1] - 2.75) < 0.02 && Math.abs(W.bc[5 * 3]) < 0.01 && p.asleep === 6, 'a stack of 6 boxes stands (top at 2.75 m) and sleeps', { top: r3(W.bc[16]), asleep: p.asleep, msPerStep: r3(ms) });
}
// 3. a domino run: the first is tipped, they all fall
{
  const W = new World({}); const n = 16; for (let k = 0; k < n; k += 1) W.box(k * 0.35, 0.4, 0, 0.04, 0.4, 0.15, k === 0 ? { spin: [0, 0, -2.5] } : {}); W.finish();
  const ms = run(W, 420, { iters: 2 }); const ang = []; for (let k = 0; k < n; k += 1) ang.push(Math.round(angleOf(W, k)));
  check(ang.every((a) => a > 55), 'dominoes topple one after another (every one tilted > 55°)', { angles: ang.join(','), msPerStep: r3(ms) });
}
// 4. a kick: balls at rest jump (velocities change), only on the kick
{
  const W = new World({}); for (let k = 0; k < 10; k += 1) W.sphere(k * 0.5 - 2.25, 0.2, 0, 0.2, {}); W.finish();
  run(W, 60); const before = W.probe();
  W.step({ ...ENV, kick: true, kickImp: 3, kickMode: 'jump' }); const after = W.probe(); let vy = 0; for (let k = 0; k < 10; k += 1) vy += W.v[W.bodies[k].i0 * 3 + 1] / 10;
  check(before.maxV < 0.05 && after.maxV > 2 && vy > 1.5 && after.kicks === 1, 'a kick impulse makes resting balls jump (velocities up)', { before: before.maxV, after: after.maxV, meanVy: r3(vy) });
  const W2 = new World({}); W2.sphere(0, 0.2, 0, 0.2, {}); W2.finish(); run(W2, 30); W2.step({ ...ENV, kick: true, kickImp: 3, kickMode: 'push' });
  check(W2.v[0] > 2 && Math.abs(W2.v[1]) < 1, 'kick "push" pushes sideways', { vx: r3(W2.v[0]), vy: r3(W2.v[1]) });
}
// 5. cloth: a flag pinned on one side flies out in the wind, hangs without it
{
  const mk = (wind) => { const W = new World({}); const pins = []; for (let j = 0; j < 14; j += 1) pins.push([0, j]); W.cloth(0, 3, 0, 22, 14, 0.09, { pins }); W.finish(); const ms = run(W, 200, { wind, turb: 0.5 }); let mx = 0; let my = 9; for (let i = 0; i < W.N; i += 1) { mx = Math.max(mx, W.x[i * 3]); my = Math.min(my, W.x[i * 3 + 1]); } return { reach: r3(mx), low: r3(my), ms: r3(ms) }; };
  const calm = mk(0); const windy = mk(8);
  check(calm.reach < 0.6 && windy.reach > 1.4 && windy.low > calm.low, 'a flag hangs without wind and flies out in the wind', { calm, windy });
}
// 6. a pendulum keeps time: period 2π√(L/g)
{
  const W = new World({}); const L = 1.5; const pin = W.pin(0, 3, 0); const b = W.sphere(Math.sin(0.15) * L, 3 - Math.cos(0.15) * L, 0, 0.08, { density: 8 }); W.dist(pin, W.bodies[b].i0, 0); W.finish();
  let last = W.x[W.bodies[b].i0 * 3]; const cross = [];
  for (let s = 1; s <= 600; s += 1) { W.step({ ...ENV, damping: 0, sleep: false }); const x = W.x[W.bodies[b].i0 * 3]; if (last < 0 && x >= 0) cross.push(s / 60); last = x; }
  const T = cross.length > 2 ? (cross[cross.length - 1] - cross[0]) / (cross.length - 1) : 0; const want = 2 * Math.PI * Math.sqrt(L / 9.81);
  check(Math.abs(T - want) / want < 0.03, 'a pendulum swings with its period (2π√(L/g), within 3 %)', { period: r3(T), want: r3(want) });
}
// 7. Newton's cradle: the first ball stops, the last one flies out
{
  const W = new World({}); const R = 0.2; const n = 5; const balls = [];
  for (let k = 0; k < n; k += 1) { const x = (k - 2) * (2 * R + 0.002); const a = k === 0 ? 0.7 : 0; const b = W.sphere(x - Math.sin(a) * 1.5, 3 - Math.cos(a) * 1.5, 0, R, { density: 30 }); balls.push(W.bodies[b].i0); for (const z of [-0.5, 0.5]) { const p = W.pin(x, 3, z); W.dist(p, W.bodies[b].i0, 0); } }
  W.finish(); let maxLast = 0; let firstAtHit = null; let back = 0;
  for (let s = 0; s < 150; s += 1) { W.step({ ...ENV, bounce: 0.97, friction: 0, damping: 0, sub: 16 }); const vl = Math.abs(W.v[balls[n - 1] * 3]); maxLast = Math.max(maxLast, vl); if (vl > 1 && firstAtHit === null) firstAtHit = Math.abs(W.v[balls[0] * 3]); if (s > 80) back = Math.min(back, W.v[balls[0] * 3]); }
  check(maxLast > 1.5 && firstAtHit !== null && firstAtHit < maxLast * 0.5 && back < -1, 'Newton\'s cradle: the last ball flies out, the first one nearly stops, then it comes back the other way', { lastSpeed: r3(maxLast), firstWhenLastMoves: r3(firstAtHit ?? -1), firstBack: r3(back) });
}
// 8. water: a dam breaks, spreads and stays in its tank
{
  const W = new World({ walls: { x: 1.2, z: 0.3 } }); W.water(-1.2, 0, -0.3, -0.5, 0.9, 0.3, 0.055); W.finish(); const y0 = W.probe().meanY;
  const ms = run(W, 150, { sub: 4, damping: 0 }); let out = 0; let maxX = -9; for (const i of W.fluid) { const x = W.x[i * 3]; maxX = Math.max(maxX, x); if (Math.abs(x) > 1.21 || W.x[i * 3 + 1] < -0.01) out += 1; }
  const p = W.probe();
  check(out === 0 && maxX > 0.6 && p.meanY < y0 * 0.7 && Number.isFinite(p.sig), 'water: the dam breaks and spreads across the tank, nothing leaks', { drops: W.N, meanY: [r3(y0), p.meanY], reach: r3(maxX), msPerStep: r3(ms) });
}
// 9. determinism and cached states
{
  const mk = () => { const W = new World({ walls: { x: 1.5, z: 1 } }); for (let k = 0; k < 30; k += 1) W.sphere((k % 5) * 0.3 - 0.6, 1 + k * 0.25, (k % 3) * 0.2, 0.12, {}); for (let k = 0; k < 6; k += 1) W.box(k * 0.5 - 1.2, 0.3, 0.6, 0.2, 0.3, 0.2, {}); W.blob(0, 2, -0.5, 0.3, {}); return W.finish(); };
  const kick = (st) => ({ kick: st % 30 === 0, kickImp: 3, kickMode: 'jump' });
  const A = mk(); run(A, 240, {}, kick); const B = mk(); run(B, 240, {}, kick);
  check(A.x.every((v, i) => v === B.x[i]) && A.v.every((v, i) => v === B.v[i]), 'the same steps give exactly the same state (twice)', { sig: A.probe().sig });
  const C = mk(); run(C, 120, {}, kick); const snap = C.snapshot(); run(C, 120, {}, kick);
  const D = mk(); run(D, 37, {}, kick); D.restore(snap); run(D, 120, {}, kick);
  check(C.x.every((v, i) => v === A.x[i]) && D.x.every((v, i) => v === A.x[i]), 'a cached state restores exactly (scrubbing back re-simulates to the same frame)', { snapshotKB: Math.round(A.bytes() / 1024) });
}
// 10. bodies appear on time; pins let go on the drop
{
  const W = new World({}); for (let k = 0; k < 5; k += 1) W.sphere(0, 3, 0, 0.1, { spawnStep: 10 + k * 10 }); W.finish();
  run(W, 25); const p = W.probe();
  check(p.bodies === 2, 'bodies appear at their time (2 of 5 after 25 steps)', p.bodies);
  const C = new World({}); const pins = []; for (let i = 0; i < 10; i += 1) pins.push([i, 0]); C.cloth(-0.5, 3, 0, 10, 8, 0.1, { pins, release: true }); C.finish();
  run(C, 30); const y1 = C.probe().meanY; C.step({ ...ENV, drop: true }); run(C, 40); const y2 = C.probe().meanY;
  check(y2 < y1 - 0.5, 'a curtain\'s pins let go on the drop (it falls)', { before: y1, after: y2 });
}
// 11. every scene builder runs (2 s), nothing goes NaN; the cost per step
{
  const bad = []; const cost = {};
  for (const [name, fn] of Object.entries(BUILDS)) {
    const W = new World({}); fn(W, { n: name === 'pyramid' ? 6 : 12, s: 1, rnd: seeded(7), opts: { text: 'HI' }, model: null }); if (!W._p.length) W.sphere(0, 1, 0, 0.2, {}); W.finish();
    const ms = run(W, 120, { iters: W.clusters.length > 4 ? 2 : 1, kick: false, wind: 2, turb: 0.5 }, (st) => ({ kick: st % 30 === 0, kickImp: 2 }));
    const p = W.probe(); cost[name] = r3(ms);
    if (!Number.isFinite(p.sig) || !Number.isFinite(p.ke) || p.maxV > 60) bad.push({ name, p });
  }
  check(!bad.length, `all ${Object.keys(BUILDS).length} scene builders run 2 s without blowing up`, bad.length ? bad : undefined);
  console.log('  ms per step:', JSON.stringify(cost));
}
// 13. the runner: each step's music from its own time (markers, a grid, drops), going back from cached states
{
  const mk = () => { const W = new World({}); for (let k = 0; k < 8; k += 1) W.sphere(k * 0.5 - 2, 0.2, 0, 0.2, {}); return W.finish(); };
  const E = { ...ENV, kickImp: 2 };
  const A = new core.Runner(mk()); A.m.ksrc = [0.5, 1.0, 1.25]; A.m.drops = [1.1]; A.run(90, E, Infinity, Date.now);
  const B = new core.Runner(mk()); B.m.ksrc = 'grid'; B.run(150, E, Infinity, Date.now);
  check(A.kicks === 3 && A.drops === 1 && B.kicks === 5, 'kicks land on their markers (3 of 3), a drop on its time, a 120 BPM grid without a song (5 in 2.5 s)', { markers: A.kicks, drops: A.drops, grid: B.kicks });
  const C = new core.Runner(mk()); C.m.ksrc = [0.5, 1.0, 1.25]; C.m.drops = [1.1]; C.run(90, E, Infinity, Date.now);
  C.seek(40); const back = C.W.misc[0]; C.run(90, E, Infinity, Date.now);
  check(back === 30 && C.resims === 1 && C.W.x.every((v, i) => v === A.W.x[i]), 'going back restores the cached state before (step 30 for 40) and steps to the same numbers', { restoredAt: back, snaps: C.snaps.size });
  // the worker's path: the world sent as data (structured clone of its own fields), stepped there, the same numbers
  const W1 = mk(); const data = {}; for (const [k, v] of Object.entries(W1)) if (typeof v !== 'function' && k[0] !== '_') data[k] = v;
  const W2 = Object.assign(Object.create(World.prototype), structuredClone(data));
  const R1 = new core.Runner(W1); const R2 = new core.Runner(W2); R1.m.ksrc = R2.m.ksrc = 'grid'; R1.run(120, { ...E }, Infinity, Date.now); R2.run(120, { ...E }, Infinity, Date.now);
  check(W1.x.every((v, i) => v === W2.x[i]), 'a world handed to the worker as data steps to exactly the same numbers as the page\'s');
}
// 12. the directors' help topic (on demand: three_do help physics, and its aliases)
{
  const G = require(path.join(__dirname, '..', 'mcp', 'three-guide.js'));
  check(/LIGHT PHYSICS/.test(G.help('physics')) && /three_do \{ cmd: "physics"/.test(G.help('cloth')) && /LIGHT PHYSICS/.test(G.help('ragdoll')), 'three_do help physics (and cloth, ragdoll…) explains the layer and the tool');
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
