// ▶ Play's hitch map (round 63, hitchmap63): the recorder's pure part (tools/hitchmap-page.js Rules: the typed ring, the
// spike and picture rules), the recorder itself in a pretend page (frames stepped by hand: the ring, a spike's event, its
// own time as a budget helper, off / stop), the map (hitchmap-core.js: decode, the axes, binning into the heatmap, the
// timeline, worst-spot detection on fixture traces, GamePerf's causes, pictures matched to spots, jump / draft) and the
// store (hitchmapmain.js on a throwaway data folder with a pretend game window: a spike's picture, the map built and saved
// per game, listed / read back, at most 20 a game, the page's tag only when armed).
//   node dev/hitchmap-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const R = require('../tools/hitchmap-page');
const C = require('../hitchmap-core');
let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`✓ ${name}`); };

// a fixture trace: the player walks a circle of radius 6 on the ground (x / z, bobbing in y), the camera behind and above;
// 240 Hz frames (4.17 ms) with a little noise; hitches: `at` places (each pass), plus one-offs
function walk({ secs = 30, hz = 240, period = 6, hitchAt = [], oneOff = [], seed = 7 } = {}) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const rows = []; let tm = 0; const ref = 1000 / hz; let last = -1e9;
  while (tm < secs * 1000) {
    const ang = (tm / 1000 / period) * Math.PI * 2;
    const x = 6 * Math.cos(ang); const z = 6 * Math.sin(ang); const y = Math.abs(Math.sin(tm / 300)) * 0.5;
    let dt = ref + (rnd() - 0.5) * 0.4;
    for (const h of hitchAt) if (Math.hypot(x - h.x, z - h.z) < 0.4 && tm - last > 1500) { dt = h.ms; last = tm; }
    for (const o of oneOff) if (!o.done && tm >= o.t) { dt = o.ms; o.done = true; }
    tm += dt;
    rows.push([tm, dt, x, y, z, x + 3, y + 2, z + 3]);
  }
  return C.fromRows(rows);
}

(async () => {
  await t('the ring: 8 numbers a frame, made once, the oldest overwritten, read back oldest first', () => {
    const r = R.ring(4);
    assert.strictEqual(r.a.length, 32);
    const buf = r.a;
    for (let i = 1; i <= 6; i += 1) R.push(r, i * 10, i, i, 0, -i, 0, 1, 2);
    assert.strictEqual(r.a, buf, 'the same array (no allocation)');
    assert.strictEqual(r.len, 4); assert.strictEqual(r.total, 6);
    const o = R.ordered(r);
    assert.deepStrictEqual([0, 1, 2, 3].map((k) => o[k * 8]), [30, 40, 50, 60]);
    assert.strictEqual(o[3 * 8 + 4], -6);
    const r2 = R.ring(8); R.push(r2, 1, 2, 3, 4, 5, 6, 7, 8);
    assert.strictEqual(R.ordered(r2).length, 8, 'not wrapped: a view of what was written');
    assert.strictEqual(R.N, 131072);
  });
  await t('spikes and pictures: ≥ 4× the usual frame and ≥ 3 refreshes; ≤ 4 pictures, 2 s apart, then only a new worst', () => {
    assert.strictEqual(R.spikeMs(4.17, 240), 20);
    assert.strictEqual(R.spikeMs(50, 60), 200);
    assert.strictEqual(R.typical(0, 5), 5);
    assert.ok(R.typical(4, 400) < 4.5, 'a spike barely moves the usual frame');
    const s = { n: 0, last: 0, worst: 0 };
    assert.strictEqual(R.shot(s, 1000, 50), false, 'not in the first 1.5 s');
    assert.strictEqual(R.shot(s, 2000, 50), true);
    Object.assign(s, { n: 1, last: 2000, worst: 50 });
    assert.strictEqual(R.shot(s, 3000, 80), false, '2 s apart');
    assert.strictEqual(R.shot(s, 4100, 30), true, 'the second: any spike');
    Object.assign(s, { n: 2, last: 4100, worst: 50 });
    assert.strictEqual(R.shot(s, 7000, 40), false, 'then only a new worst');
    assert.strictEqual(R.shot(s, 7000, 60), true);
    Object.assign(s, { n: 4, last: 7000, worst: 900 });
    assert.strictEqual(R.shot(s, 99000, 5000), false, 'four at most');
  });

  await t('the recorder in a page: per frame into the ring (player from window.game, camera from __scenes), a spike → one event, its own time a budget helper, off stops it', () => {
    let rafs = []; let tnow = 0; const events = [];
    const listeners = {};
    const mw = (x, y, z) => { const e = new Array(16).fill(0); e[12] = x; e[13] = y; e[14] = z; return { elements: e }; };
    const player = { isObject3D: true, matrixWorld: mw(0, 0, 0) };
    const cam = { isObject3D: true, isCamera: true, matrixWorld: mw(0, 5, 5), position: { x: 0, y: 5, z: 5 } };
    const win = {
      performance: { now: () => tnow }, requestAnimationFrame: (f) => { rafs.push(f); return rafs.length; },
      addEventListener: (ty, f) => { listeners[ty] = (listeners[ty] || 0) + 1; }, removeEventListener: (ty) => { listeners[ty] -= 1; },
      dispatchEvent: (e) => { events.push(e.type); return true; }, Event: function Ev(type) { this.type = type; },
      __gameReady: { phase: 'playing' }, game: { player }, __scenes: { World: { camera: cam, scene: {} } },
      URLSearchParams, Float32Array, Float64Array, Uint8Array, Object, JSON, Math, Number, String, Date,
      btoa: (s) => Buffer.from(s, 'binary').toString('base64'), document: { currentScript: { src: 'hearth-game://x/__hitchmap-page.js?hz=240' } },
      __hearthHitchOpts: { n: 64 },
    };
    win.window = win;
    const ctx = vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'tools', 'hitchmap-page.js'), 'utf8'), ctx);
    const H = win.__hearthHitch;
    assert.ok(H && H.budget && typeof H.budget.spent === 'function');
    assert.strictEqual(listeners.visibilitychange, 1);
    const step = (dt, x, z) => { tnow += dt; player.matrixWorld.elements[12] = x; player.matrixWorld.elements[14] = z; const fs2 = rafs; rafs = []; for (const f of fs2) f(tnow); };
    for (let i = 0; i < 400; i += 1) step(4.17, i * 0.01, -i * 0.01);
    step(120, 9, 9); // a spike (after the first 1.5 s): its event
    for (let i = 0; i < 5; i += 1) step(4.17, 9, 9);
    const p = JSON.parse(H.pub());
    assert.ok(p.on && p.frames >= 404, `frames ${p.frames}`);
    assert.strictEqual(p.posFrom, 'player'); assert.strictEqual(p.camKey, 'World');
    assert.strictEqual(p.spikes, 1); assert.strictEqual(p.shots, 1);
    assert.deepStrictEqual(events, ['hearth-hitch']);
    assert.strictEqual(rafs.length, 1, 'one frame callback of its own');
    const sp = JSON.parse(H.spike()); assert.ok(Math.abs(sp.dt - 120) < 0.01);
    const d = C.decode(H.dump());
    assert.strictEqual(d.n, 64, 'the ring kept its last 64 frames (n: 64 here)');
    const last = d.a.subarray(63 * 8, 64 * 8);
    assert.strictEqual(last[2], 9); assert.strictEqual(last[4], 9); assert.strictEqual(last[6], 5);
    const spike = [...Array(64).keys()].map((k) => d.a[k * 8 + 1]).find((x) => x > 100);
    assert.ok(Math.abs(spike - 120) < 0.01, 'the spike in the trace');
    assert.ok(/^● Hitch map \d:\d\d$/.test(H.line()), H.line());
    // the budget's A/B steps it aside; the watch's off stops it for the session
    H.budget.pause(true); const before = JSON.parse(H.pub()).frames; step(4.17, 0, 0); step(4.17, 0, 0); assert.strictEqual(JSON.parse(H.pub()).frames, before, 'paused: nothing kept');
    H.budget.pause(false);
    assert.strictEqual(H.budget.off('watch'), true);
    step(4.17, 0, 0);
    assert.strictEqual(rafs.length, 0, 'off: no frame callback any more');
    assert.strictEqual(listeners.visibilitychange, 0);
    assert.ok(/stopped/.test(H.line()));
    assert.strictEqual(JSON.parse(H.dump()).off, 'watch');
  });

  await t('the trace: decoded from the page\'s base64, the pauses (> 5 s) left out', () => {
    const r = R.ring(16);
    for (let i = 0; i < 5; i += 1) R.push(r, i * 4, 4, i, 0, 0, 0, 0, 0);
    R.push(r, 9000, 8000, 5, 0, 0, 0, 0, 0);
    const a = R.ordered(r);
    const d = C.decode({ v: 1, cols: 8, n: r.len, hz: 240, data: Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64') });
    assert.strictEqual(d.n, 6); assert.strictEqual(d.a[5 * 8 + 1], 8000);
    assert.strictEqual(C.stats(d.a, d.n, 240).frames, 5, 'the 8 s gap is a pause');
    assert.strictEqual(C.decode({ v: 2 }), null);
  });
  await t('the axes: x / z for a 3D game (even with jumps), x / y for a 2D one', () => {
    const w = walk({ secs: 8 });
    assert.deepStrictEqual(C.axes(w.a, w.n).ax, [0, 2]);
    const rows = []; for (let i = 0; i < 500; i += 1) rows.push([i * 4, 4, i * 0.1, Math.sin(i / 20) * 5, 0, 0, 0, 10]);
    const f = C.fromRows(rows);
    assert.deepStrictEqual(C.axes(f.a, f.n).ax, [0, 1]);
  });
  await t('binning into the heatmap: known points in known cells, mean / worst / hitches per cell', () => {
    const rows = [[1, 4, 0, 0, 0, 0, 0, 0], [2, 4, 0.1, 0, 0.1, 0, 0, 0], [3, 40, 9.9, 0, 9.9, 0, 0, 0], [4, 6, 9.8, 0, 9.7, 0, 0, 0], [5, 4, 5, 0, 0, 0, 0, 0]];
    const f = C.fromRows(rows);
    const B = { a0: 0, a1: 10, b0: 0, b1: 10 };
    const g = C.grid(f.a, f.n, { ax: [0, 2], bounds: B, size: 10, hz: 240 });
    assert.strictEqual(g.w, 10); assert.strictEqual(g.h, 10);
    assert.strictEqual(g.n[0], 2); assert.strictEqual(g.mean[0], 4);
    assert.strictEqual(g.n[99], 2); assert.strictEqual(g.max[99], 40); assert.strictEqual(g.hitches[99], 1); assert.strictEqual(g.mean[99], 23);
    assert.strictEqual(g.n[5], 1, 'x 5, z 0: the 6th cell of the first row');
    assert.strictEqual(C.cellOf(-5, 50, B, 10, 10), 90, 'outside: clamped to the edge');
    let total = 0; for (const x of g.n) total += x; assert.strictEqual(total, 5);
    const wide = C.grid(f.a, f.n, { ax: [0, 2], bounds: { a0: 0, a1: 20, b0: 0, b1: 5 }, size: 40 });
    assert.deepStrictEqual([wide.w, wide.h], [40, 10], 'the aspect kept');
  });
  await t('the timeline: the session in buckets, mean and worst each', () => {
    const w = walk({ secs: 10, oneOff: [{ t: 5000, ms: 300 }] });
    const tl = C.timeline(w.a, w.n, { buckets: 100 });
    assert.strictEqual(tl.k, 100);
    const worst = Array.from(tl.max).indexOf(Math.max(...tl.max));
    assert.ok(worst >= 51 && worst <= 54, `the 300 ms frame ending at 5.3 s: bucket ${worst}`);
    assert.ok(tl.mean[10] > 4 && tl.mean[10] < 4.4);
  });
  await t('worst spots on a fixture trace: a place that hitches every pass beats a bigger one-off elsewhere', () => {
    const K = { x: 6, z: 0 };
    const w = walk({ secs: 30, hitchAt: [{ ...K, ms: 400 }], oneOff: [{ t: 9000, ms: 600 }, { t: 20000, ms: 90 }] });
    const st = C.stats(w.a, w.n, 240);
    assert.ok(st.hitch >= 8 && st.hitch < 9, `a hitch at 240 Hz: ${st.hitch} ms`);
    const sp = C.spots(w.a, w.n, { hz: 240 });
    const top = sp.list[0];
    assert.ok(Math.hypot(top.x - K.x, top.z - K.z) < 1, `spot 1 at ${top.x}, ${top.z}`);
    assert.ok(top.n >= 4, `hitched each pass: ${top.n}`);
    assert.ok(top.worst >= 399 && top.lost > 1500, JSON.stringify(top));
    assert.ok(Math.abs(top.typical - 4.17) < 0.2, 'the usual frame there');
    assert.strictEqual(sp.list.length, 3, 'the one-offs are spots of their own');
    assert.strictEqual(sp.list[1].worst, 600);
    // a smooth game: no spots
    const smooth = walk({ secs: 5 });
    assert.strictEqual(C.spots(smooth.a, smooth.n, { hz: 240 }).list.length, 0);
    // a camera that never moves: one spot holds every hitch (the timeline tells them apart)
    const still = C.fromRows([...Array(300).keys()].map((i) => [i * 4, i % 50 === 49 ? 60 : 4, 1, 1, 1, 1, 1, 1]));
    const s2 = C.spots(still.a, still.n, { hz: 240 });
    assert.strictEqual(s2.list.length, 1); assert.strictEqual(s2.list[0].n, 6);
  });
  await t('GamePerf\'s slow frames put down to causes per spot (matched by time)', () => {
    const w = walk({ secs: 20, hitchAt: [{ x: 6, z: 0, ms: 300 }] });
    const sp = C.spots(w.a, w.n, { hz: 240 }).list;
    const slows = sp[0].times.map(([tm, dt], i) => ({ end: tm + 1, dt, cause: i === 0 ? 'shader' : 'gc', fn: i === 0 ? 'spawnBoss' : null }));
    slows.push({ end: 1, dt: 50, cause: 'texture' });
    C.attribute(sp, slows);
    assert.strictEqual(sp[0].causes.shader, 1); assert.strictEqual(sp[0].causes.gc, sp[0].n - 1);
    assert.strictEqual(sp[0].fn, 'spawnBoss');
    assert.ok(/garbage collection ×\d, a shader compile/.test(C.causeText(sp[0].causes)));
  });
  await t('the summary: heatmap + timeline + spots, a spike\'s picture on its spot, jump there (state / camera), the director\'s draft', () => {
    const w = walk({ secs: 30, hitchAt: [{ x: 6, z: 0, ms: 400 }], oneOff: [{ t: 9000, ms: 600 }] });
    const sp = C.spots(w.a, w.n, { hz: 240 }).list;
    const shotT = sp[0].times[0][0];
    const m = C.build({ ...w, hz: 240, cost: { ms: 6, frames: w.n }, posFrom: 'player', camKey: 'World', off: null },
      { shots: [{ id: 'hx-1', t: shotT, dt: 400, file: 'hx-1.jpg', w: 1280, h: 720, state: { Game: { angle: 0, score: 3 } }, cams: { World: { p: [9, 2, 3], q: [0, 0, 0, 1] } }, pos: { x: 6, y: 0, z: 0 } }], game: { title: 'Clink' }, session: 5 });
    assert.strictEqual(m.grid.axes.join(), 'x,z');
    assert.strictEqual(m.grid.n.length, m.grid.w * m.grid.h);
    assert.strictEqual(m.timeline.mean.length, m.timeline.k);
    assert.strictEqual(m.spots[0].shot, 'hx-1');
    assert.strictEqual(m.spots[1].shot, undefined);
    assert.ok(m.cost.perFrame > 0 && m.cost.perFrame < 0.01);
    assert.ok(JSON.stringify(m).length < 200000, `${JSON.stringify(m).length} bytes`);
    const j1 = C.jumpOf(m, 1); assert.strictEqual(j1.from, 'picture'); assert.strictEqual(j1.state.Game.score, 3);
    const j2 = C.jumpOf(m, 2); assert.strictEqual(j2.from, 'camera'); assert.deepStrictEqual(Object.keys(j2.cams), ['World']); assert.strictEqual(j2.cams.World.look.length, 3);
    const d = C.draft(m, 1, { title: 'Clink' });
    assert.ok(/^Hitch map from Clink in ▶ Play \(0:30 played, 240 Hz: 4\.2 ms a frame/.test(d), d);
    assert.ok(/Worst spot #1 of \d, near x 6, z 0/.test(d) && /worst 400 ms/.test(d) && /Game state then: Game\.angle 0 · Game\.score 3/.test(d) && /Fix this:/.test(d), d);
    assert.ok(/^0:30 played · 240 Hz · usual frame 4\.\d ms · \d+ hitches · worst spot x 6, z 0 \(400 ms\)$/.test(C.brief(m)), C.brief(m));
    assert.ok(/^near x 6, z 0 · \d hitches, worst 400 ms · [\d.]+ s lost/.test(C.line(m.spots[0], m)), C.line(m.spots[0], m));
  });

  await t('the store: a spike\'s picture, the map built and saved per game, listed and read back, 20 at most, the tag only when armed', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hitchmap-test-'));
    process.env.HEARTH_TEST_SAVE_DIR = tmp;
    const M = require('../hitchmapmain');
    M.init({ dataDir: tmp });
    assert.strictEqual(M.arm({}), false); assert.strictEqual(M.pageTag(240), '');
    assert.strictEqual(M.arm({ on: true }), true); assert.ok(/<script src="\/__hitchmap-page\.js\?hz=240"><\/script>/.test(M.pageTag(240)));
    assert.ok(M.isPage('/__hitchmap-page.js')); assert.ok(fs.existsSync(M.pageFile()));
    // a pretend game window: its page answers the dump / the spike / the playtest notes' read
    const w = walk({ secs: 20, hitchAt: [{ x: 6, z: 0, ms: 400 }] });
    const dump = JSON.stringify({ v: 1, cols: 8, n: w.n, total: w.n, hz: 240, t0: 1000, cost: { ms: 4, frames: w.n }, on: true, off: null, camKey: 'World', posFrom: 'player', shots: [], data: Buffer.from(w.a.buffer).toString('base64'),
      slows: [{ at: 1000 + C.spots(w.a, w.n, { hz: 240 }).list[0].times[0][0] - 400, dt: 400, gc: true, work: 1, render: 1 }] });
    const img = { isEmpty: () => false, getSize: () => ({ width: 1920, height: 1080 }), resize: () => ({ getSize: () => ({ width: 1280, height: 720 }), toJPEG: () => Buffer.from('jpeg!') }) };
    const wc = { executeJavaScript: async (code) => (/dump\(\)/.test(code) ? JSON.stringify(JSON.parse(dump)) : /spike\(\)/.test(code) ? JSON.stringify({ t: 2000, dt: 400 }) : JSON.stringify({ state: { Game: { angle: 0 } }, cams: { World: { p: [1, 2, 3], q: [0, 0, 0, 1] } }, pos: { x: 6, y: 0, z: 0, from: 'state' } })), capturePage: async () => img };
    const g = { win: { isDestroyed: () => false, webContents: wc }, source: { kind: 'lab', id: 's1clink', title: 'Clink' }, started: 1700000000000, hz: 240 };
    const told = [];
    M.register({ ctx: () => ({ getWin: () => ({ isDestroyed: () => false, webContents: { send: (ch, d) => told.push([ch, d]) } }) }), game: () => g });
    await M.onSpike({ sender: wc });
    const dir = path.join(tmp, 'game-cache', 'lab-s1clink', 'hitch');
    assert.ok(fs.existsSync(path.join(dir, `h${(1700000000000).toString(36)}-1.jpg`)), 'the spike\'s picture');
    const r = await M.collect('end');
    assert.ok(r.ok && r.saved, JSON.stringify(r));
    const file = path.join(dir, `h${(1700000000000).toString(36)}.json`);
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(Math.hypot(m.spots[0].x - 6, m.spots[0].z) < 1);
    assert.strictEqual(m.spots[0].causes.gc, 1, 'GamePerf\'s slow frame matched');
    assert.strictEqual(m.shots.length, 1); assert.strictEqual(m.shots[0].state.Game.angle, 0);
    assert.strictEqual(told[0][0], 'game:hitch-ev'); assert.strictEqual(told[0][1].type, 'built');
    const ls = await M.op({ op: 'list', source: g.source });
    assert.strictEqual(ls.maps.length, 1);
    const got = await M.op({ op: 'get', source: g.source });
    assert.strictEqual(got.map.id, m.id);
    assert.strictEqual((await M.op({ op: 'shot', source: g.source, file: '../x.jpg' })).ok, false, 'never outside the folder');
    assert.strictEqual((await M.op({ op: 'shot', source: g.source, file: `${m.id}-1.jpg`, path: true })).ok, true);
    // the window's close waits once
    const p1 = M.closing(g); assert.ok(p1 && typeof p1.then === 'function'); await p1;
    assert.strictEqual(M.closing(g), null, 'once');
    // 20 maps a game at most: the oldest go
    for (let i = 1; i <= 21; i += 1) { M.arm({ on: true }); g.started = 1700000000000 + i * 1000; await M.collect('end'); }
    await new Promise((res) => setTimeout(res, 300));
    const left = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    assert.strictEqual(left.length, 20, `${left.length} maps`);
    assert.ok(!left.includes(`h${(1700000000000).toString(36)}.json`), 'the oldest went');
    assert.ok(!fs.existsSync(path.join(dir, `h${(1700000000000).toString(36)}-1.jpg`)), '… with its picture');
    // off: no tag, no collect
    M.arm({}); assert.strictEqual(M.pageTag(240), ''); assert.strictEqual((await M.collect('end')).ok, false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  await t('▶ Play\'s budget counts it as a helper (first to go on a tie), never remembered per game', () => {
    const B = require('../tools/playbudget-page');
    assert.ok(B.ALL.includes('hitch') && B.ORDER[0] === 'hitch');
    assert.strictEqual(B.pick({ hitch: 0.2, look: 0.2 }, new Set()).id, 'hitch');
    assert.strictEqual(B.pick({ hitch: 0.01, look: 0.2 }, new Set()).id, 'look');
    assert.strictEqual(B.NAMES.hitch, 'the hitch map');
    assert.ok(!require('../playbudgetmain').IDS.includes('hitch'));
  });
  console.log(`${n} passed`);
})().catch((err) => { console.error('FAIL', err); process.exit(1); });
