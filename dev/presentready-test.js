#!/usr/bin/env node
// ▣ Present, got ready (round 52, presentready): the pure part (tools/three-ready-core.js) in Node:
//   1. the bake cache key: stable (key order, ids, float noise), and different for a slider, a keyframe, the code, the
//      song (path, size, date), the size, the frame rate, the kind
//   2. the cache: a hit, a scene's older bakes stale, the oldest past the count / the size over, a junk index
//   3. the measure: the screen's rate from frame gaps, holds / can't hold, the bake's frame rate (60 for long pieces)
//      and size (the frame's shape in the screen, even, ≤ 4K), the timeline moments, the progress
//   4. the background schedule's hush (powerwise.js): kept timers run, the others wait, and come back one at a time
//   node dev/presentready-test.js
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'tools/three-ready-core.js'));
const PW = require(path.join(ROOT, 'powerwise.js'));
let fails = 0; let n = 0;
const check = (ok, name, info) => { n += 1; console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };

// ---------- 1. the key ----------
const plan = { fps: 60, w: 1920, h: 1080, dur: 12, song: { src: '/m/song.wav', start: 0 }, groups: [{ id: '#g0', kind: 'scene', layers: [{ id: 'main', code: 'const P = tweak({ speed: [1.5, 0, 3] });', values: { 0: 1.5 }, props: { opacity: 1, keys: { opacity: [{ t: 1, v: 0 }, { t: 3, v: 1 }] } } }] }] };
const song = { path: '/m/song.wav', size: 882044, mtime: 1760000000000 };
const base = { plan, song, w: 1920, h: 1080, fps: 60, kind: 'mp4' };
const k0 = C.key(base);
check(/^pr[0-9a-f]{16}$/.test(k0), 'a key is "pr" + 16 hex', k0);
check(C.key(JSON.parse(JSON.stringify(base))) === k0, 'the same scene → the same key');
const reordered = { kind: 'mp4', fps: 60, h: 1080, w: 1920, song: { mtime: song.mtime, size: song.size, path: song.path }, plan: { groups: plan.groups, h: 1080, w: 1920, song: plan.song, dur: 12, fps: 60 } };
check(C.key(reordered) === k0, 'key order doesn\'t matter');
check(C.key({ ...base, plan: { ...plan, dur: 12 + 1e-9 } }) === k0, 'float noise below a millionth doesn\'t matter');
check(C.key({ ...base, plan: { ...plan, extra: undefined, fn() {} } }) === k0, 'undefined / functions are left out');
const variant = (fn) => { const p = JSON.parse(JSON.stringify(plan)); fn(p); return C.key({ ...base, plan: p }); };
const changes = {
  slider: variant((p) => { p.groups[0].layers[0].values[0] = 1.6; }),
  keyframe: variant((p) => { p.groups[0].layers[0].props.keys.opacity[1].t = 3.5; }),
  code: variant((p) => { p.groups[0].layers[0].code += ' '; }),
  opacity: variant((p) => { p.groups[0].layers[0].props.opacity = 0.9; }),
  songFile: C.key({ ...base, song: { ...song, path: '/m/other.wav' } }),
  songEdited: C.key({ ...base, song: { ...song, mtime: song.mtime + 1000 } }),
  songSize: C.key({ ...base, song: { ...song, size: song.size + 1 } }),
  noSong: C.key({ ...base, song: null }),
  size: C.key({ ...base, w: 2560, h: 1440 }),
  fps: C.key({ ...base, fps: 120 }),
  kind: C.key({ ...base, kind: 'loop' }),
};
for (const [what, k] of Object.entries(changes)) check(k !== k0, `a change makes a new key: ${what}`);
check(new Set(Object.values(changes)).size === Object.keys(changes).length, 'every change gives its own key');
const bin = (n2) => C.key({ ...base, plan: { ...plan, buf: new Uint8Array(n2).fill(7) } });
check(bin(1000) === bin(1000) && bin(1000) !== bin(1001), 'binary data counts by its length and content, never in full');

// ---------- 2. the cache ----------
const E = (key, scene, at, bytes = 1e8) => ({ key, scene, path: `/bakes/${key}.mp4`, bytes, at, usedAt: at });
let idx = [E('prA', 's1', 1), E('prB', 's1', 2), E('prC', 's2', 3), E('prD', 's3', 4)];
let p = C.plan(idx, { key: 'prB', scene: 's1' });
check(p.hit?.key === 'prB', 'the same key: a hit');
check(p.stale.map((e) => e.key).join() === 'prA', 'the scene\'s other bake is stale', p.stale.map((e) => e.key));
check(!p.over.length, 'nothing over the limits');
p = C.plan(idx, { key: 'prZ', scene: 's1' });
check(!p.hit && p.stale.map((e) => e.key).sort().join() === 'prA,prB', 'a changed scene: no hit, both its bakes stale');
check(!C.plan(idx, { key: 'prZ', scene: 's9' }).stale.length, 'another scene\'s bakes are never stale for this one');
const many = Array.from({ length: 15 }, (_, i) => E(`pr${i}`, `s${i}`, i));
p = C.plan(many, { key: 'pr14', scene: 's14' });
check(p.hit?.key === 'pr14' && p.over.length === 3 && p.over.every((e) => ['pr0', 'pr1', 'pr2'].includes(e.key)), 'past 12 bakes: the 3 least recently used go', p.over.map((e) => e.key));
const big = [E('prX', 'a', 1, 3e9), E('prY', 'b', 2, 3e9)];
p = C.plan(big, { key: 'prN', scene: 'c' });
check(p.over.map((e) => e.key).join() === 'prX', 'past 4 GB: the oldest goes', p.over.map((e) => e.key));
p = C.plan(big, { key: 'prY', scene: 'b' });
check(p.over.map((e) => e.key).join() === 'prX', 'the hit is kept even when the others are over');
idx = C.use(idx, 'prA', 99);
check(C.plan(Array.from({ length: 12 }, (_, i) => E(`q${i}`, `t${i}`, 50 + i)).concat(idx), { key: 'new', scene: 'z' }).over.every((e) => e.key !== 'prA'), 'a bake used lately is kept (least recently used goes)');
idx = C.add(idx, E('prB', 's1', 7));
check(idx.filter((e) => e.key === 'prB').length === 1, 'adding a key again replaces it');
check(C.drop(idx, ['prA', 'prC']).map((e) => e.key).join() === 'prD,prB', 'drop');
check(C.plan(null, { key: 'x', scene: 'y' }).hit === null && C.plan([null, 3, { key: 1 }], { key: 'x' }).stale.length === 0, 'a junk index reads as empty');

// ---------- 3. the measure ----------
const gapsAt = (ms, k = 120, jit = 0.2) => Array.from({ length: k }, (_, i) => ms + (i % 2 ? jit : -jit));
check(C.hzOf(gapsAt(16.67)) === 60 && C.hzOf(gapsAt(4.17)) === 240 && C.hzOf(gapsAt(6.94)) === 144 && C.hzOf(gapsAt(8.33)) === 120, 'the screen\'s rate from idle frames (60 / 120 / 144 / 240)');
check(C.hzOf([16.7, 16.6, 33, 16.7, 50, 16.6, 16.8]) === 60, 'slow frames don\'t lower the rate read');
let v = C.verdict(gapsAt(4.17), 240);
check(v.holds && v.fps >= 235, '240 Hz held', v);
v = C.verdict(gapsAt(16.7), 240);
check(!v.holds && /about 60 fps/.test(v.why), '60 fps on a 240 Hz screen: can\'t hold', v.why);
v = C.verdict([...gapsAt(16.7, 100), ...Array(2).fill(40)], 60);
check(v.holds, '2 % hitches still hold', v);
v = C.verdict([...gapsAt(16.7, 90), ...Array(10).fill(40)], 60);
check(!v.holds, '10 % of the frames over 1.5 frame times: can\'t hold', v);
check(!C.verdict([16, 17, 16], 60).holds, 'too few frames: can\'t tell, so no');
let f = C.bakeFps(240, 20);
check(f.fps === 120 && f.capped && /120/.test(f.why), 'a short piece on a 240 Hz screen: 120 fps', f);
f = C.bakeFps(240, 180);
check(f.fps === 60 && /over 30 s/.test(f.why), 'a long piece: 60 fps, and it says so', f);
f = C.bakeFps(60, 180);
check(f.fps === 60 && !f.capped, '60 Hz: the screen\'s own rate', f);
let s = C.bakeSize({ w: 3840, h: 2160 });
check(s.w === 3840 && s.h === 2160, '4K screen: 4K', s);
s = C.bakeSize({ w: 5120, h: 2880 });
check(s.w <= 3840 && s.w % 2 === 0 && s.h % 2 === 0 && s.capped, '5K: down to 4K, even sides', s);
s = C.bakeSize({ w: 3840, h: 2160 }, { w: 1080, h: 1920 });
check(s.h === 2160 && s.w === 1216, 'a 9:16 frame on a 16:9 screen: its own shape, as tall as the screen', s);
s = C.bakeSize({ w: 1281, h: 721 });
check(s.w % 2 === 0 && s.h % 2 === 0, 'odd screens → even sides', s);
const pts = C.points(120, 8);
check(pts.length === 8 && pts[0] === 0 && pts[7] < 120 && pts.every((x, i) => !i || x > pts[i - 1]), 'eight moments across a 2-minute song', pts);
check(C.points(0).join() === '0' && C.points(10, 100).length === 24, 'no timeline: the start only; at most 24');
check(C.progress('song', 0) === 0 && C.progress('measure', 1) === 100 && C.progress('shaders', 0.5) > C.progress('assets', 1), 'progress: 0 → 100 through the stages in order');
check(C.fmtLeft(75) === '1 min 15 s' && C.fmtLeft(8) === '8 s', 'time left in words');

// ---------- 4. the background schedule's hush ----------
{
  let now = 0; const q = [];
  const setTimer = (fn, ms) => { const t = { fn, at: now + ms }; q.push(t); return t; };
  const clearTimer = (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); };
  const adv = (ms) => { const end = now + ms; for (;;) { q.sort((a, b) => a.at - b.at); const t = q[0]; if (!t || t.at > end) break; q.shift(); now = t.at; t.fn(); } now = end; };
  const sc = PW.createScheduler({ state: () => ({}), now: () => now, setTimer, clearTimer });
  const runs = { updater: 0, routines: 0, backup: 0 };
  sc.every('updater', 60000, () => { runs.updater += 1; });
  sc.every('routines', 30000, () => { runs.routines += 1; });
  sc.every('backup', 60000, () => { runs.backup += 1; });
  adv(61000);
  const before = { ...runs };
  sc.hush(true, ['routines']);
  adv(10 * 60000);
  check(runs.updater === before.updater && runs.backup === before.backup, 'hushed: background timers wait', runs);
  check(runs.routines >= before.routines + 19, 'hushed: a kept timer (Keep going) runs on', runs);
  check(sc.list().find((t) => t.id === 'updater').next === null, 'a waiting timer has no next run');
  sc.hush(false);
  adv(900);
  check(runs.updater === before.updater && runs.backup === before.backup, 'back: not all at once (a second first)');
  adv(2000);
  check(runs.updater === before.updater + 1 && runs.backup === before.backup + 1, 'back: the overdue ones run, one after the other', runs);
  check(sc.hush(false) === false && sc.hush(true, []) === true && sc.hush(true, ['x']) === false && sc.hushed.join() === 'x', 'hush is idempotent; a second hush only changes what is kept');
}

console.log(fails ? `${fails} of ${n} failed` : `all ${n} passed`);
process.exit(fails ? 1 : 0);
