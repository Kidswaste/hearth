#!/usr/bin/env node
// ✥ Direct (round 46, labdirect): the pure parts of "<direct-core>" in tools/three-sandbox.html, in Node: a layer's
// transform (translate % · rotate · scale about the frame's centre) and back, the box a layer covers on screen,
// "pin" (scale / turn about the picked thing's middle, not the frame's), Shift's snap to the frame's lines and the other
// layers', the drawn box from alpha, the sliders' ranges, the arrows' 1 / 10 px.
//   node dev/labdirect-test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'tools', 'three-sandbox.html'), 'utf8');
const src = /\/\/ <direct-core>[^\n]*\n([\s\S]*?)\/\/ <\/direct-core>/.exec(html)?.[1];
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };
check(Boolean(src), 'the direct core is in the sandbox');
if (!src) process.exit(1);
const C = new Function(`${src}\nreturn directCore;`)()();
const near = (x, y, e = 1e-6) => Math.abs(x - y) <= e;
const W = 1080; const H = 1920;

// ---------- 1. the transform and its inverse ----------
const id = { x: 0, y: 0, scale: 1, rotate: 0 };
check(near(C.fwd(100, 200, W, H, id)[0], 100) && near(C.fwd(100, 200, W, H, id)[1], 200), 'no transform: a point stays');
const mv = { x: 10, y: -5, scale: 1, rotate: 0 };
check(near(C.fwd(540, 960, W, H, mv)[0], 540 + 108) && near(C.fwd(540, 960, W, H, mv)[1], 960 - 96), 'x / y are % of the frame (10 % of 1080 = 108 px)');
const t = { x: 7, y: 12, scale: 1.7, rotate: 33 };
let worst = 0;
for (const [qx, qy] of [[0, 0], [W, H], [123, 1700], [540, 960], [900, 50]]) { const [px, py] = C.fwd(qx, qy, W, H, t); const [ax, ay] = C.inv(px, py, W, H, t); worst = Math.max(worst, Math.abs(ax - qx), Math.abs(ay - qy)); }
check(worst < 1e-6, 'inv undoes fwd (moved, scaled, turned)', { worst });
const [cx, cy] = C.fwd(W / 2, H / 2, W, H, { x: 0, y: 0, scale: 2.5, rotate: 77 });
check(near(cx, W / 2) && near(cy, H / 2), 'scale and rotate are about the frame\'s centre (as the CSS transform-origin 50% 50%)');
const r90 = C.fwd(W / 2 + 100, H / 2, W, H, { x: 0, y: 0, scale: 1, rotate: 90 });
check(near(r90[0], W / 2) && near(r90[1], H / 2 + 100), 'rotate is clockwise on screen (CSS: +90° turns right → down)', r90);

// ---------- 2. the box on screen, pin ----------
const sb = C.screenBox({ x0: 100, y0: 100, x1: 300, y1: 200 }, W, H, { x: 0, y: 0, scale: 1, rotate: 0 });
check(sb.x0 === 100 && sb.x1 === 300 && sb.y0 === 100 && sb.y1 === 200, 'screen box of an untransformed box is itself');
const sbr = C.screenBox({ x0: 440, y0: 910, x1: 640, y1: 1010 }, W, H, { x: 0, y: 0, scale: 1, rotate: 90 });
check(near(sbr.x1 - sbr.x0, 100) && near(sbr.y1 - sbr.y0, 200), 'turned 90°: the box covers its height across', sbr);
const q = [200, 300]; const from = { x: 3, y: -4, scale: 1, rotate: 0 }; const to = { scale: 2.2, rotate: 40 };
const p = C.pin(q, W, H, from, to);
const before = C.fwd(q[0], q[1], W, H, from); const after = C.fwd(q[0], q[1], W, H, { ...to, ...p });
check(near(before[0], after[0], 1e-6) && near(before[1], after[1], 1e-6), 'pin: scaling / turning keeps the picked thing\'s middle where it shows', { before, after });

// ---------- 3. snapping ----------
const lines = C.frameLines(W, H);
check(lines.xs.includes(W / 2) && lines.xs.includes(W / 3) && lines.ys.includes((2 * H) / 3) && lines.xs.includes(0) && lines.ys.includes(H), 'the frame\'s lines: edges, thirds, centre');
const s1 = C.snap({ x0: 500, y0: 100, x1: 586, y1: 140 }, lines, 8); // middle 543 → 540
check(near(s1.dx, -3) && s1.gx === 540 && s1.dy === 0 && s1.gy === null, 'the middle 3 px off the centre snaps onto it (one guide)', s1);
const s2 = C.snap({ x0: 365, y0: 1240, x1: 500, y1: 1300 }, lines, 8); // left 365 → 360 (third); the nearest y line (1280) is 10 px from the middle
check(near(s2.dx, -5) && s2.gx === 360 && s2.gy === null, 'an edge near a third snaps; 20 px away doesn\'t', s2);
const s3 = C.snap({ x0: 10, y0: 10, x1: 20, y1: 20 }, { xs: [13.5], ys: [] }, 8);
check(near(s3.dx, -1.5) && s3.gx === 13.5, 'the nearest of the three (edge, middle, edge) wins: another layer\'s line', s3);
check(C.snap({ x0: 100, y0: 100, x1: 200, y1: 200 }, lines, 8).dx === 0, 'far from every line: no snap');

// ---------- 4. what's drawn ----------
const w = 10; const h = 6; const data = new Uint8ClampedArray(w * h * 4);
const set = (x, y, a) => { data[(y * w + x) * 4 + 3] = a; };
check(C.bbox(data, w, h) === null, 'nothing drawn: no box');
set(2, 1, 255); set(6, 4, 200); set(8, 5, 5);
const bb = C.bbox(data, w, h);
check(near(bb.x0, 0.2) && near(bb.y0, 1 / 6) && near(bb.x1, 0.7) && near(bb.y1, 5 / 6), 'the drawn box from alpha (faint pixels under 12 ignored)', bb);

// ---------- 5. the sliders' ranges, the arrows ----------
const c1 = C.clampT({ x: 150.456, y: -3.333, scale: 9, rotate: 200 });
check(c1.x === 100 && c1.y === -3.33 && c1.scale === 3 && c1.rotate === -160, 'Move X / Y ±100 %, Scale ≤ 3, Rotate wraps to −180…180, rounded as the sliders step', c1);
check(C.clampT({ scale: 0.01 }).scale === 0.1 && C.clampT({ rotate: -190.3 }).rotate === 169.5 && !('x' in C.clampT({ scale: 1 })), 'Scale ≥ 0.1; only what was given');
const n1 = C.nudge('ArrowRight', false, W, H); const n10 = C.nudge('ArrowUp', true, W, H);
check(near(n1.x, 100 / W) && n1.y === 0 && near(n10.y, -1000 / H) && n10.x === 0, 'arrows: 1 px (Shift: 10 px) of the frame, in %', { n1, n10 });
check(near(C.angle(0, 0, 0, 10), 90) && near(C.angle(0, 0, -10, 0), 180), 'angles in degrees, clockwise on screen');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
