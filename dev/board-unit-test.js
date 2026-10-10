#!/usr/bin/env node
// Pure parts of the mood board, no app needed: vibe descriptors on synthetic pictures (dark / bright, warm / cool,
// flat / busy, symmetric, a horizon), every mood rule, every layout on odd inputs, colors and harmonies, the text a
// chat gets (short, with the owner's notes).   node dev/board-unit-test.js
const path = require('path');
const D = require(path.join(__dirname, '..', 'board-data.js'));
const V = require(path.join(__dirname, '..', 'board-vibe.js'));
const L = require(path.join(__dirname, '..', 'board-layout.js'));
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
function img(w, h, f) { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } return d; }
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const dark = V.fromPixels(img(160, 90, () => [12, 14, 30]), 160, 90);
const bright = V.fromPixels(img(160, 90, () => [240, 238, 230]), 160, 90);
check(dark.light < 0.1 && bright.light > 0.9, `light: dark ${dark.light}, bright ${bright.light}`);
const warm = V.fromPixels(img(120, 80, () => [230, 140, 60]), 120, 80);
const cool = V.fromPixels(img(120, 80, () => [60, 140, 230]), 120, 80);
check(warm.warmth > 0.3 && cool.warmth < -0.3, `warmth: warm ${warm.warmth}, cool ${cool.warmth}`);
const busy = V.fromPixels(img(120, 80, () => { const v = rnd() * 255; return [v, v, v]; }), 120, 80);
check(busy.edges > 0.5 && busy.grain > 0.5 && dark.edges < 0.05, `texture: busy edges ${busy.edges} grain ${busy.grain}, flat ${dark.edges}`);
check(dark.space > 0.9 && busy.space < 0.1, `negative space: flat ${dark.space}, busy ${busy.space}`);
const sym = V.fromPixels(img(120, 80, (x) => (Math.abs(x - 60) < 20 ? [255, 255, 255] : [0, 0, 0])), 120, 80);
const asym = V.fromPixels(img(120, 80, (x) => (x < 30 ? [255, 255, 255] : [0, 0, 0])), 120, 80);
check(sym.symmetry > 0.9 && asym.symmetry < 0.6, `symmetry: ${sym.symmetry} vs ${asym.symmetry}`);
const horizon = V.fromPixels(img(120, 80, (x, y) => (y < 52 ? [120, 170, 230] : [60, 50, 30])), 120, 80);
check(horizon.horizon != null && Math.abs(horizon.horizon - 0.65) < 0.05, `horizon at ${horizon.horizon}`);
const two = V.fromPixels(img(100, 100, (x) => (x < 70 ? [10, 10, 10] : [255, 46, 136])), 100, 100);
check(two.palette.length >= 2 && Math.abs(two.palette[0].share - 0.7) < 0.05 && D.family(two.palette[1].hex) === 'pink', `palette: ${JSON.stringify(two.palette)}`);
const accent = V.fromPixels(img(100, 100, (x, y) => (x < 20 && y < 20 ? [0, 255, 0] : [128, 128, 128])), 100, 100);
check(accent.palette.some((c) => D.family(c.hex) === 'green'), 'a 4 % accent color survives the palette');
check(V.aspectWord(1080, 1920) === '9:16' && V.aspectWord(1920, 1080) === '16:9' && V.aspectWord(1000, 1000) === '1:1', 'aspect names');

// every mood rule fires on a vibe made for it, and only adds words
const base = { light: 0.5, contrast: 0.5, sat: 0.4, warmth: 0, edges: 0.3, grain: 0.3, space: 0.3, symmetry: 0.5, colorful: 0.3, centered: 0.4, motion: null, pace: null, horizon: null };
const probes = [{ light: 0.1, warmth: -0.5 }, { light: 0.1, warmth: 0.2 }, { light: 0.3, contrast: 0.7 }, { light: 0.8, contrast: 0.2 }, { light: 0.8, sat: 0.7 }, { sat: 0.7, contrast: 0.6 }, { sat: 0.1 }, { sat: 0.3, warmth: 0.2 }, { warmth: 0.4 }, { warmth: -0.4 }, { edges: 0.6 }, { edges: 0.05 }, { space: 0.6 }, { symmetry: 0.9 },
  { motion: 0.7 }, { motion: 0.4 }, { motion: 0.05 }, { pace: 0.5 }, { pace: 6 }, { colorful: 0.7 }, { grain: 0.7 }, { grain: 0.02, edges: 0.1 }, { light: 0.6, warmth: 0.3, sat: 0.4 }, { light: 0.3, sat: 0.6 }, { contrast: 0.9 }, { contrast: 0.1 }, { space: 0.8, light: 0.7 },
  { symmetry: 0.2, edges: 0.5 }, { warmth: -0.4, light: 0.7 }, { warmth: 0.4, light: 0.3 }, { lightArc: 'strobing' }, { lightArc: 'brightening' }, { lightArc: 'darkening' }, { centered: 0.9 }, { horizon: 0.7 }];
let fired = 0;
D.MOODS.forEach(([test, words], i) => { const v = { ...base, ...probes[i] }; if (test(v)) fired++; else console.log('  mood rule', i, words, 'did not fire'); });
check(fired === D.MOODS.length, `all ${D.MOODS.length} mood rules fire on their vibe`);
check(V.moods({ ...base, light: 0.1, warmth: -0.5, motion: 0.7 }).length <= 4, 'at most 4 mood words');

// layouts never produce NaN or zero sizes, even for odd items
const odd = [{ id: 'a', type: 'image', x: 0, y: 0, w: 1, h: 1000 }, { id: 'b', type: 'video', x: 5, y: 5, w: 2000, h: 3, vibe: { duration: 0, motion: 0 } }, { id: 'c', type: 'note', x: -9, y: 9, w: 260, h: 220, rot: 45 }, { id: 'd', type: 'swatch', color: '#000', x: 0, y: 0, w: 200, h: 240 }];
let goodLayouts = 0;
for (const l of D.LAYOUTS) { const r = L.arrange(odd, l); if (Object.values(r.boxes).length === odd.length && Object.values(r.boxes).every((b) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0)) goodLayouts++; else console.log('  layout', l.id); }
check(goodLayouts === D.LAYOUTS.length, `all ${D.LAYOUTS.length} layouts are sane on odd items`);
check(Object.keys(L.arrange([odd[0]], 'grid').boxes).length === 1, 'one item arranges');
const al = L.align(odd, 'left'); check(new Set(Object.values(al).map((p) => p.x)).size === 1, 'align left lines them up');
const fv = L.fitView({ x: 0, y: 0, w: 100000, h: 100 }, 1000, 800); check(fv.z >= 0.02, 'fit clamps to 2 %');

// colors
check(D.colorName('#ff2e88') === 'vivid pink' && D.colorName('#000000') === 'black' && D.family('#808080') === 'gray', 'color names');
check(D.HARMONIES.every((h) => D.harmony(h.id, '#36d6e7').every((c) => /^#[0-9a-f]{6}$/.test(c))), `${D.HARMONIES.length} harmonies give valid colors`);
check(D.PALETTES.every((p) => p.colors.length === 5 && p.colors.every((c) => /^#[0-9a-f]{6}$/.test(c))), `${D.PALETTES.length} palettes are 5 valid colors`);

// what a chat reads
const item = { type: 'video', title: 'Neon alley', note: 'the pink glow', tags: ['night'], vibe: { ...dark, kind: 'clip', duration: 12, aspect: '9:16', motion: 0.7, cutCount: 14, pace: 0.8, cutsPerMin: 70, moods: ['nocturnal', 'electric'] } };
const t = V.text(item);
check(t.length < 700 && /cuts\/min/.test(t) && /pink glow/.test(t) && /#night/.test(t) && /nocturnal/.test(t), `item line (${t.length} chars)`);
check(!/palette/.test(V.text(item, ['motion'])) && /motion/.test(V.text(item, ['motion'])), 'a focus narrows the line');
const bt = V.boardText('Test', [item, { type: 'swatch', color: '#e6b450' }]);
check(bt.split('\n').length >= 4 && bt.length < 900, `board text (${bt.length} chars)`);
check(V.distance(dark, dark) === 0 && V.distance(dark, bright) > 0.4, 'vibe distance');
// pack11 (board-pack.js): vibe groups, their names, mood collections
{
  const P = require(path.join(__dirname, '..', 'board-pack.js'));
  const mk = (id, light, warmth, motion, moods) => ({ id, vibe: { light, warmth, sat: 0.4, contrast: 0.4, motion, moods, palette: [{ hex: warmth > 0 ? '#e08040' : '#3060c0', share: 0.6 }] } });
  const items = [mk('a', 0.1, -0.6, 0.1, ['nocturnal', 'cool']), mk('b', 0.12, -0.5, 0.15, ['nocturnal', 'moody']), mk('c', 0.08, -0.7, 0.05, ['nocturnal']),
    mk('d', 0.9, 0.7, 0.8, ['sunny', 'energetic']), mk('e', 0.85, 0.6, 0.7, ['sunny']), mk('f', 0.95, 0.65, 0.9, ['sunny', 'warm'])];
  const g = P.clusterVibes(items, 2);
  check(g.length === 2 && g.every((x) => x.length === 3) && g.some((x) => x.every((i) => 'abc'.includes(i.id))), `two vibe groups: ${g.map((x) => x.map((i) => i.id).join('')).join(' / ')}`);
  const names = g.map((x) => P.groupName(x));
  check(names.some((n) => /nocturnal/.test(n)) && names.some((n) => /sunny/.test(n)), `groups named by their moods: ${names.join(' / ')}`);
  check(P.clusterVibes(items).length >= 2 && P.clusterVibes([items[0]]).length === 1 && P.clusterVibes([]).length === 0, 'automatic group count, odd inputs');
  check(/bright|dark|mid/.test(P.groupName([{ vibe: { light: 0.9, motion: 0.1 } }])), 'no moods: named by light and motion');
  const mc = P.moodCollections(items);
  check(mc[0].name === 'nocturnal' && mc[0].n === 3 && mc.some((m) => m.name === 'sunny') && !mc.some((m) => m.name === 'cool'), `mood collections: ${mc.map((m) => `${m.name} ${m.n}`).join(', ')}`);
}
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
