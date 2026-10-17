const assert = require('assert/strict');
const C = require('../tools/workbench-core');
const vm = require('vm');
let tests = 0;
function test(name, fn) { fn(); tests++; console.log('✓ ' + name); }
test('project round trip preserves every station', () => assert.deepEqual(C.validate(C.defaults()), C.defaults()));
test('rejects corrupt levels without accepting a partial project', () => { const p = C.defaults(); p.game.cells[0][0] = 9; assert.throws(() => C.validate(p)); });
test('rejects drawing coordinates outside canvas', () => { const p = C.defaults(); p.drawing.strokes = [{ color: '#abcdef', width: 4, points: [[Infinity, 12]] }]; assert.throws(() => C.validate(p)); });
test('rejects active storyboard image types', () => { const p = C.defaults(); p.storyboard.panels[0].image = 'data:image/svg+xml,<svg onload="alert(1)"/>'; assert.throws(() => C.validate(p)); });
test('textures deterministic, tint and variation are effective', () => { const p = C.defaults().texture, a = C.texture(p), b = C.texture(p); assert.deepEqual(a, b); assert.notDeepEqual(a.color, C.texture({ ...p, seed: 91 }).color); assert.notDeepEqual(a.color, C.texture({ ...p, color: '#ff547d' }).color); for (const m of Object.values(a)) assert.equal(m.length, p.size ** 2 * 4); });
test('every texture has periodic edge transitions comparable to interior', () => { for (const kind of ['cloud', 'stone', 'wood', 'metal', 'cells']) { const p = { ...C.defaults().texture, kind, size: 128 }, a = C.texture(p).height; let seam = 0, inside = 0; for (let y = 0; y < 128; y++) { seam += Math.abs(a[(y * 128) * 4] - a[(y * 128 + 127) * 4]); for (let x = 1; x < 128; x++) inside += Math.abs(a[(y * 128 + x) * 4] - a[(y * 128 + x - 1) * 4]); } assert.ok(seam / 128 < inside / (128 * 127) * 5 + 3, kind); } });
test('normal maps point out of surface', () => { const a = C.texture(C.defaults().texture).normal; for (let i = 0; i < a.length; i += 4) { assert.ok(a[i + 2] >= 128); assert.equal(a[i + 3], 255); } });
test('all oscillator shapes produce finite audible bounded samples', () => { for (const wave of ['sine', 'saw', 'square', 'triangle']) { const a = C.synth({ ...C.defaults().synth, wave }); assert.ok(a.some(v => Math.abs(v) > .02)); assert.ok(a.every(v => Number.isFinite(v) && Math.abs(v) <= .981)); assert.ok(Math.abs(a.at(-1)) < .01); } });
test('ADSR alters a rendered sound', () => { const p = C.defaults().synth; assert.notDeepEqual(C.synth(p), C.synth({ ...p, attack: 1 })); });
test('patch validation is atomic and rejects invented names / bad ranges', () => { const params = [{ key: 'cutoff', value: 100, min: 20, max: 20000 }, { key: 'wave', value: 'Saw', choices: ['Sine', 'Saw'] }, { key: 'on', value: true }]; assert.deepEqual(C.patch(params, { cutoff: 800, wave: 'Sine', on: false }), { cutoff: 800, wave: 'Sine', on: false }); for (const bad of [{ cutoff: 999999 }, { imaginary: 1 }, { on: 0 }, { wave: 'Alien' }]) assert.throws(() => C.patch(params, bad)); });
test('game export is standalone, valid JS and escapes user text', () => { const p = C.level(); p.title = '</script><script>alert(1)</script>'; const html = C.gameHTML(p); const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]; assert.equal(scripts.length, 1); new vm.Script(scripts[0][1]); assert.ok(html.includes('&lt;/script&gt;')); p.cells[13][2] = 0; assert.throws(() => C.gameHTML(p)); });
test('drawing SVG retains strokes and transparent background', () => { const svg = C.drawingSVG({ strokes: [{ color: '#ff547d', width: 8, points: [[5, 5], [80, 150]] }] }); assert.ok(svg.includes('L80.0 150.0')); assert.ok(!svg.includes('<rect')); });
test('exported game actually moves, collects and finishes', () => {
  const g = C.level(); g.cells.forEach(r => r.forEach((v, i) => { if (v > 1) r[i] = 0; })); g.cells[13][2] = 2; g.cells[13][3] = 4; g.cells[13][5] = 3;
  const status = {}, start = {}, events = {}; let tick, playerX = 0;
  const ctx = { fillStyle: '', fillRect(x, y, w) { if (w === 22) playerX = x; }, fillText() {} };
  const document = { hidden: false, querySelector: s => s === 'canvas' ? { getContext: () => ctx } : s === '#start' ? start : status, querySelectorAll: () => [], addEventListener() {} };
  vm.runInNewContext(C.gameHTML(g).match(/<script>([\s\S]*?)<\/script>/)[1], { document, requestAnimationFrame: fn => { tick = fn; }, addEventListener: (key, fn) => { events[key] = fn; } });
  start.onclick(); events.keydown({ key: 'ArrowRight', preventDefault() {} }); for (let i = 0; i < 90; i++) tick(i * 16);
  assert.ok(playerX > 130); assert.equal(status.textContent, 'Complete! Your little world works.');
});
console.log(`${tests} workbench checks passed.`);
