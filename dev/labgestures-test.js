#!/usr/bin/env node
// Lab gestures (round 34 "labgestures"): the pure parts of "<gest-core>" in tools/three-sandbox.html, in Node: wheel
// events told apart (Mac trackpad / Mac mouse / Windows notch / precision touchpad / pinch / lines / pages) and
// normalised to pixels, what each one does, and the motion math on fake 60 / 120 / 144 / 240 Hz clocks: coasting
// after a flick and easing to a target land on the same spot at every rate, settle (then nothing runs), the release
// velocity, zoom toward the pointer keeps that point put, framing distances, the pitch limit.
//   node dev/labgestures-test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'tools', 'three-sandbox.html'), 'utf8');
const src = /\/\/ <gest-core>[^\n]*\n([\s\S]*?)\/\/ <\/gest-core>/.exec(html)?.[1];
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };
check(Boolean(src), 'the gesture core is in the sandbox');
if (!src) process.exit(1);
const G = new Function(`${src}\nreturn gestCore;`)()();
const near = (x, y, e = 1e-9) => Math.abs(x - y) <= e;

// ---------- 1. wheel events: which device, in pixels ----------
const W = (o) => ({ deltaMode: 0, deltaX: 0, deltaY: 0, wheelDeltaY: 0, ctrlKey: false, shiftKey: false, ...o });
const k = (o, prev, now = 1000) => G.wheel(W(o), prev, now);
check(k({ deltaY: 2, wheelDeltaY: -6 }).kind === 'trackpad', 'Mac trackpad (Chromium: wheelDelta = −3 × delta) → trackpad');
check(k({ deltaY: 4.000244140625, wheelDeltaY: -12 }).kind === 'mouse' && k({ deltaY: -12.000732421875, wheelDeltaY: 36 }).kind === 'mouse', 'Mac mouse wheel (4.000244… px a notch, accelerated ×3) → mouse');
check(k({ deltaY: 100, wheelDeltaY: -120 }).kind === 'mouse' && k({ deltaY: -100, wheelDeltaY: 120 }).kind === 'mouse', 'Windows mouse notch (100 px, wheelDelta 120) → mouse');
check(k({ deltaY: 125 }).kind === 'mouse' && k({ deltaY: 150 }).kind === 'mouse', 'a notch at 125 % / 150 % display scale (no wheelDelta) → mouse');
check(k({ deltaY: 3.3333, wheelDeltaY: -4 }).kind === 'trackpad' && k({ deltaY: 7 }).kind === 'trackpad', 'Windows precision touchpad (small, fractional) → trackpad');
check(k({ deltaX: 3, deltaY: 1 }).kind === 'trackpad', 'sideways movement → trackpad (wheels don\'t)');
const ln = k({ deltaMode: 1, deltaY: 3 }); const pg = k({ deltaMode: 2, deltaY: 1 });
check(ln.kind === 'mouse' && ln.dy === 48 && pg.kind === 'mouse' && pg.dy === 800, 'deltaMode lines × 16 px, pages × 800 px, both a mouse', { ln: ln.dy, pg: pg.dy });
const pin = k({ deltaY: -2.5, ctrlKey: true });
check(pin.pinch && pin.kind === 'trackpad', 'pinch (Chromium: ctrl+wheel, small fractional delta) → pinch');
check(!k({ deltaY: 100, wheelDeltaY: -120, ctrlKey: true }).pinch && !k({ deltaY: 4.000244140625, ctrlKey: true }).pinch, 'Ctrl / ⌘ + a mouse wheel is not a pinch (no 37 % jump a notch)');
// a stream keeps its kind: a trackpad flick's big momentum deltas don't turn into a mouse
const first = k({ deltaY: 3 }, null, 0);
check(k({ deltaY: 120 }, first, 100).kind === 'trackpad' && k({ deltaY: 120 }, first, 1000).kind === 'mouse', 'a wheel stream keeps its kind within 400 ms (a fast flick stays a trackpad); a new stream is looked at again');
check(k({ deltaY: 2, wheelDeltaY: -6 }, { kind: 'mouse', t: 0, ctrl: false }, 100).kind === 'trackpad', 'Chromium\'s own trackpad mark beats the stream rule');

// ---------- 2. what a wheel does ----------
const z = G.act(k({ deltaY: 100, wheelDeltaY: -120 }), false);
const zin = G.act(k({ deltaY: -100, wheelDeltaY: 120 }), false);
check(z.op === 'zoom' && z.k > 1.1 && z.k < 1.25 && near(z.k * zin.k, 1, 1e-12), 'a mouse notch zooms ≈ 16 % (out and in exactly undo each other)', { k: z.k });
const pz = G.act(k({ deltaY: -5, ctrlKey: true }), false);
check(pz.op === 'zoom' && pz.k < 1 && pz.k > 0.9, 'pinching out a little zooms in a little', { k: pz.k });
check(G.act(k({ deltaY: -9999, ctrlKey: true }), false).k >= Math.exp(-0.6) - 1e-12, 'a pinch event is capped (no jump on a huge delta)');
const tr = G.act(k({ deltaX: -4, deltaY: 6 }), false);
check(tr.op === 'turn' && tr.dx === 4 && tr.dy === -6, 'two fingers turn, the picture following the fingers (natural scrolling)', tr);
check(G.act(k({ deltaX: -4, deltaY: 6 }), true).op === 'pan', 'Shift + two fingers pans');
const mx = G.act(k({ deltaMode: 1, deltaY: 3 }), false);
check(mx.op === 'zoom' && mx.k > 1, 'a line-mode wheel (Firefox-style) zooms too');

// ---------- 3. frame-rate independent motion ----------
// run fn(dt) at hz for secs (optional jitter), with f60-style dt (≤ 250 ms)
function play(hz, secs, fn, jitter = 0) {
  let t = 0; let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  while (t < secs * 1000) { const dt = (1000 / hz) * (1 + (jitter ? (rnd() - 0.5) * 2 * jitter : 0)); t += dt; fn(Math.min(250, dt)); }
}
// coasting: a flick at 1 rad/s keeps going for the same distance at every rate
const coastAt = (hz, jitter) => { let x = 0; let v = 0.001; play(hz, 8, (dt) => { const c = G.coast(v, dt); x += c.d; v = c.v; }, jitter); return x; };
const c60 = coastAt(60); const c120 = coastAt(120); const c144 = coastAt(144); const c240 = coastAt(240); const cj = coastAt(240, 0.3);
check([c120, c144, c240, cj].every((x) => near(x, c60, 1e-12)), 'a flick coasts the same distance at 60 / 120 / 144 / 240 Hz (and with 30 % frame jitter)', { c60, c240, cj });
check(near(G.coast(0.001, 1e9).d, 0.001 * G.TAU.coast, 1e-12), 'its whole run is velocity × tau', G.TAU.coast);
// easing to a target: the same path at every rate
const easeAt = (hz) => { const V = G.view(5); G.goTo(V, { yaw: 1, s: 2, px: 3 }); const marks = []; let t = 0; play(hz, 0.5, (dt) => { G.step(V, dt); t += dt; if (Math.abs(t - 100) < 1000 / hz / 2 + 1e-9) marks.push(V.yaw); }); return { V, at100: marks[0] }; };
const e60 = easeAt(60); const e240 = easeAt(240);
check(near(e60.at100, e240.at100, 1e-9), 'easing to a framed view: where it is after 100 ms is the same at 60 and 240 Hz', { e60: e60.at100, e240: e240.at100 });
// settling: once there, a step says nothing moves (the loop stops; labpace's still check takes over)
const settle = (hz) => { const V = G.view(5); G.goTo(V, { yaw: 1, s: 0.5, px: 2, pz: -1 }); let n = 0; let ms = 0; const dt = 1000 / hz; while (G.step(V, dt) && n < 100000) { n += 1; ms += dt; } return { V, ms, n }; };
const s60 = settle(60); const s240 = settle(240);
check(s60.V.yaw === 1 && s60.V.s === 0.5 && s60.V.px === 2 && s60.V.pz === -1 && !G.step(s60.V, 16), 'easing lands exactly on the target, then a step reports still', { ms: Math.round(s60.ms) });
check(Math.abs(s60.ms - s240.ms) < 20 && s240.ms < 2000, 'it settles in the same time at 60 and 240 Hz (≈ 1.5 s at most), not per frame', { ms60: Math.round(s60.ms), ms240: Math.round(s240.ms) });
// a fling then rest: the velocity dies out and the loop stops
const fl = (hz) => { const V = G.view(5); G.fling(V, 'turn', 1.2, 0, 800, 0); let ms = 0; const dt = 1000 / hz; while (G.step(V, dt) && ms < 10000) ms += dt; return { V, ms }; };
const f60 = fl(60); const f240 = fl(240);
check(near(f60.V.yaw, f240.V.yaw, 1e-5) && f60.V.yaw < 0 && f60.ms < 4000 && Math.abs(f60.ms - f240.ms) < 20, 'a fling (1.2 px/ms right) turns the same amount at 60 and 240 Hz and stops by itself', { yaw60: f60.V.yaw, yaw240: f240.V.yaw, ms: Math.round(f60.ms) });
// a still view: no work
const still = G.view(5);
check(!G.step(still, 16) && !G.step(still, 4) && G.identity(still), 'an untouched view is identity and its step does nothing');

// ---------- 4. release velocity ----------
const sm = []; for (let t = 0; t <= 100; t += 4) sm.push([t, t * 0.5, 0]);
const v1 = G.velocity(sm, 102);
check(near(v1[0], 0.5, 1e-9) && v1[1] === 0, 'release velocity from the last 80 ms (0.5 px/ms)', v1);
check(G.velocity(sm, 200)[0] === 0, 'the pointer rested before letting go: no coast (a placed view stays placed)');
check(G.velocity([[0, 0, 0], [3, 10, 0]], 4)[0] === 0, 'too short a sample to tell: no coast');
// 240 Hz pointer samples give the same velocity as 60 Hz ones
const s240s = []; for (let t = 0; t <= 100; t += 1000 / 240) s240s.push([t, t * 0.8, -t * 0.2]);
const s60s = []; for (let t = 0; t <= 100; t += 1000 / 60) s60s.push([t, t * 0.8, -t * 0.2]);
const va = G.velocity(s240s, 101); const vb = G.velocity(s60s, 101);
check(near(va[0], vb[0], 1e-9) && near(va[1], vb[1], 1e-9), 'the same drag sampled at 240 or 60 Hz has the same release velocity (no jitter from the rate)', { va, vb });

// ---------- 5. turn / pan / zoom / frame ----------
const V = G.view(5);
G.turn(V, 100, 0, 800);
check(near(V.yaw, -(2 * Math.PI * 100) / 800) && V.t.yaw === V.yaw, 'a drag right turns the camera left around the subject (like orbit controls), view and target together');
G.turn(V, 0, 1e6, 800);
check(V.e0 + V.pitch >= -G.LIM - 1e-12 && V.pitch === V.t.pitch, 'looking down stops just short of straight down (no flip)', V.pitch);
const P = G.view(5); G.pan(P, 10, -20, 0.01);
check(near(P.px, -0.1) && near(P.py, -0.2), 'pan: the content follows the pointer (drag right / up → the view moves left / down)', { px: P.px, py: P.py });
// zoom toward the pointer: the world point under it stays where it is all along the ease
const Z = G.view(10); const halfH = 4; const halfW = 7; const nx = 0.5; const ny = -0.25;
const worldX0 = Z.px + nx * halfW; const worldY0 = Z.py + ny * halfH;
G.zoom(Z, 0.5, nx, ny, halfW, halfH, true);
let held = true;
play(240, 2, (dt) => { G.step(Z, dt); const hw = halfW * Z.s; const hh = halfH * Z.s; if (Math.abs(Z.px + nx * hw - worldX0) > 1e-4 || Math.abs(Z.py + ny * hh - worldY0) > 1e-4) held = false; });
check(held && near(Z.s, 0.5, 1e-6), 'zoom toward the pointer: the point under it stays put (within 1e-4 of the view) all through the eased zoom', { s: Z.s });
const Z2 = G.view(10); G.zoom(Z2, 0.8, 0, 0, 1, 1, true); G.zoom(Z2, 0.8, 0, 0, 1, 1, true);
check(near(Z2.t.s, 0.64) && Z2.s === 1, 'notches add up on the target while the view eases toward it');
const Z3 = G.view(10); G.zoom(Z3, 1e9); check(Z3.t.s === 1e3, 'zoom is bounded (no losing the scene)');
check(near(G.fitDistance(1, Math.PI / 2, 1, 1), Math.SQRT2, 1e-12), 'fit distance: a unit sphere in a 90° view stands √2 away');
check(G.fitDistance(1, Math.PI / 3, 9 / 16) > G.fitDistance(1, Math.PI / 3, 16 / 9), 'a tall (9:16) frame stands further back than a wide one (the narrow side decides)');
const F = G.view(5); G.goTo(F, { s: 2, px: 1 }); check(G.near(F, { s: 2, px: 1 }) && !G.near(F, { s: 1 }), 'near(): a view already heading to the framed target (double-click again goes back)');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
