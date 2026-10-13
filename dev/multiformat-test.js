// ▦ All formats (round 33, multiformat): the model in Node (tools/three-formats-core.js).
//   node dev/multiformat-test.js
const assert = require('assert');
const path = require('path');
const FC = require(path.join(__dirname, '..', 'tools', 'three-formats-core.js'));
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`✓ ${name}`); };
const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;

t('four shapes, full sizes, smaller sizes stay even and in shape', () => {
  assert.deepStrictEqual(FC.FORMATS.map((f) => f.id), ['16:9', '9:16', '1:1', '4:5']);
  assert.deepStrictEqual(FC.sizeOf('9:16'), { w: 1080, h: 1920 });
  assert.deepStrictEqual(FC.sizeOf('4x5'), { w: 1080, h: 1350 });
  const s = FC.sizeOf('4:5', 160);
  assert.ok(s.w % 2 === 0 && s.h % 2 === 0 && s.h === 160 && near(s.w / s.h, 0.8, 0.02), JSON.stringify(s));
  assert.strictEqual(FC.nearest(1920, 1080), '16:9'); assert.strictEqual(FC.nearest(1080, 1350), '4:5'); assert.strictEqual(FC.nearest(720, 1280), '9:16');
});
t('picks: remembered ones, else the Lab\'s shape + 9:16', () => {
  assert.deepStrictEqual(FC.defaults('16:9', null), ['16:9', '9:16']);
  assert.deepStrictEqual(FC.defaults('1:1', []), ['9:16', '1:1']);
  assert.deepStrictEqual(FC.defaults('9:16', null), ['9:16']);
  assert.deepStrictEqual(FC.defaults('16:9', ['4:5', 'nope', '1:1']), ['1:1', '4:5']);
});
t('a nudge stays inside the zoomed-out picture', () => {
  assert.deepStrictEqual(FC.clamp({ z: 0.1, x: 5, y: -5 }), { z: 0.4, x: 0, y: -0 });
  const c = FC.clamp({ z: 1, x: 3, y: 0.4 }); assert.strictEqual(c.x, 1.5); assert.strictEqual(c.y, 0.4);
  assert.strictEqual(FC.clamp({ z: 9 }).z, FC.Z_MAX);
  assert.ok(FC.isPlain({ z: 1, x: 0, y: 0 }) && !FC.isPlain({ z: 0.8 }));
});
t('the crop a nudge shows (the same view the export page draws)', () => {
  assert.deepStrictEqual(FC.view({ z: 1, x: 0, y: 0 }), { left: 0.3, top: 0.3, width: 0.4, height: 0.4 });
  assert.deepStrictEqual(FC.view({ z: 0.4 }), { left: 0, top: 0, width: 1, height: 1 });
  const v = FC.view({ z: 1, x: 1.5, y: -1.5 }); assert.ok(near(v.left, 0.6) && near(v.top, 0), JSON.stringify(v));
  const p = FC.toPage({ z: 0.8, x: 0.2, y: 0.3 }); assert.ok(p.on && p.z === 0.8 && p.x === 0.2 && p.y === -0.3);
  assert.strictEqual(FC.toPage({}).on, false);
});
// a picture with a bright block on a dark background (the subject), in overscan fractions
const pic = (w, h, x0, y0, x1, y1, bg = [10, 10, 14], fg = [230, 80, 40]) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; const inside = x >= x0 * w && x < x1 * w && y >= y0 * h && y < y1 * h; const c = inside ? fg : bg;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return px;
};
t('where the subject is: what differs from the border\'s colour', () => {
  const b = FC.subjectBox(pic(100, 100, 0.3, 0.4, 0.6, 0.7), 100, 100);
  assert.ok(near(b.x0, 0.3, 0.02) && near(b.x1, 0.6, 0.02) && near(b.y0, 0.4, 0.02) && near(b.y1, 0.7, 0.02), JSON.stringify(b));
  assert.strictEqual(FC.subjectBox(pic(50, 50, 0, 0, 0, 0), 50, 50), null);
});
t('auto framing: a subject already inside stays put', () => {
  // the middle quarter of the overscan = the format's own frame; a small subject in its centre
  const a = FC.autoFrame({ x0: 0.45, x1: 0.55, y0: 0.45, y1: 0.55 }, '16:9');
  assert.deepStrictEqual([a.z, a.x, a.y], [1, 0, 0]); assert.match(a.why, /already/);
});
t('auto framing: a wide subject in 9:16 zooms out just enough and sits in the safe box', () => {
  // much wider than the 9:16 frame (overscan fraction 0.15…0.85 = ±1.4 frame units)
  const box = { x0: 0.15, x1: 0.85, y0: 0.45, y1: 0.55 };
  const a = FC.autoFrame(box, '9:16');
  assert.ok(a.z < 1 && a.z >= FC.Z_MIN, JSON.stringify(a));
  const s = FC.safeBox('9:16');
  const U = (f) => (f * 2 - 1) * FC.OVER;
  const inX = (v) => (v - a.x) * a.z; const inY = (v) => (v - a.y) * a.z; // → the frame's -1…1
  const fr = (v) => (v + 1) / 2;
  assert.ok(fr(inX(U(box.x0))) >= s.x0 - 1e-3 && fr(inX(U(box.x1))) <= s.x1 + 1e-3, 'x in the safe box');
  assert.ok(fr(inY(U(box.y0))) >= s.y0 - 1e-3 && fr(inY(U(box.y1))) <= s.y1 + 1e-3, 'y in the safe box');
});
t('auto framing: an off-centre subject that fits is moved, not shrunk', () => {
  const a = FC.autoFrame({ x0: 0.72, x1: 0.78, y0: 0.45, y1: 0.55 }, '1:1');
  assert.strictEqual(a.z, 1); assert.ok(a.x > 0.5, JSON.stringify(a)); assert.match(a.why, /moved/);
});
t('auto framing: a scene filling everything keeps its own framing', () => {
  const a = FC.autoFrame({ x0: 0.01, x1: 0.99, y0: 0.02, y1: 0.98 }, '9:16');
  assert.deepStrictEqual([a.z, a.x, a.y], [1, 0, 0]);
  assert.strictEqual(FC.autoFrame(null, '1:1').z, 1);
});
t('safe box from publishkit\'s zones (top bar, right buttons, bottom caption)', () => {
  const zones = [{ x: 0, y: 0, w: 1, h: 0.08 }, { x: 0.84, y: 0.42, w: 0.16, h: 0.46 }, { x: 0, y: 0.78, w: 0.84, h: 0.22 }];
  const s = FC.safeBox('9:16', zones);
  assert.ok(near(s.y0, 0.09) && near(s.y1, 0.77) && near(s.x1, 0.83) && near(s.x0, 0.04), JSON.stringify(s));
});
t('auto framing: a subject past the picture\'s reach still ends up in frame (as far in as it can)', () => {
  const box = { x0: 0.88, x1: 0.95, y0: 0.45, y1: 0.55 };
  const a = FC.autoFrame(box, '9:16');
  const U = (f) => (f * 2 - 1) * FC.OVER; const fr = (v) => ((v - a.x) * a.z + 1) / 2;
  assert.ok(fr(U(box.x1)) <= 1 && fr(U(box.x0)) > 0.5, JSON.stringify(a));
});
t('a corner stamp (YouTube\'s length) doesn\'t narrow the safe box', () => {
  assert.strictEqual(FC.safeBox('16:9', [{ x: 0.82, y: 0.84, w: 0.18, h: 0.16 }]).x1, 0.96);
});
t('clear names: one folder, a file per shape', () => {
  assert.strictEqual(FC.stem('My: scene', '9:16', 1080, 1920), 'My scene 9x16 1080x1920');
  assert.match(FC.folder('Orb', new Date(2026, 9, 13, 21, 5)), /^Orb · all formats 2026-10-13 21h05$/);
});
console.log(`${n} tests passed`);
