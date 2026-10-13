// Node tests for "Describe it" (round 29, instantscene: tools/three-instant-core.js + three-instant-data.js): a few
// dozen phrasings against what Hearth really has (the gallery's starting points, the particles / physics / type
// presets, the ◐ Grade looks, the FX palettes, labaudio's reaction presets, loaded from their own files), checking
// the picks (3, all different), what was matched, colors → palettes, speed / intensity words, music words, negation,
// quoted text, the sliders set from the words, the gallery's "reads like a description" and the director's cost.
//   node dev/instantscene-test.js            (--show prints the picks of every phrasing)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('../tools/three-instant-core.js');
const G = require('../tools/three-grade-core.js');

// the Lab's data files are browser globals: run them in one context and take the globals out
const ctx = vm.createContext({ console }); ctx.window = ctx;
const load = (file, name) => { vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', file), 'utf8')}\n;globalThis.${name} = ${name};`, ctx, { filename: file }); return ctx[name]; };
const Gal = load('tools/three-gallery-data.js', 'LabGalleryData');
const FX = load('tools/three-fx-data.js', 'ThreeFXData');
const AM = load('tools/three-audio-map.js', 'ThreeAudioMap');
const PD = load('tools/three-particles-data.js', 'ParticleData');
const PH = load('tools/three-physics-data.js', 'PhysicsData');
const TY = load('tools/three-type-data.js', 'TypeData');
const SRC = { starts: Gal.STARTS, moods: Gal.MOODS, particles: PD.PRESETS, physics: PH.PRESETS, type: TY.PRESETS, grades: G.PRESETS, palettes: FX.PALETTES, reactions: AM.PRESETS };
const BASES = C.catalog(SRC);
const plan = (t, o = {}) => C.plan(t, SRC, { bases: BASES, ...o });
const show = process.argv.includes('--show');

let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };
const names = (p) => p.picks.map((x) => x.base.name);
const keys = (p) => p.picks.map((x) => x.base.key);

// phrasing → the base the first pick (or one of the 3) must be, and what else must hold
const CASES = [
  ['dreamy pink chrome tunnel that pulses on the kick, slow', { top3: ['Hyper tunnel', 'Chrome blob'], react: 'pump-kick', slower: true, color: true }],
  ['a hyper tunnel', { first: 'Hyper tunnel' }],
  ['outrun sunset with a neon grid', { first: 'Outrun sunset' }],
  ['synthwave 80s retro drive', { first: 'Outrun sunset', grade: 'neon' }],
  ['liquid chrome blob', { first: 'Chrome blob' }],
  ['molten gold luxury', { first: 'Molten gold' }],
  ['disco mirror ball', { first: 'Disco mirror ball' }],
  ['soft pastel lofi gradient, very slow', { top3: ['Pastel flow', 'Liquid gradient'], slower: true }],
  ['northern lights over stars', { first: 'Aurora night' }],
  ['dreamy bokeh lights', { first: 'Bokeh dream' }],
  ['joy division pulsar lines in black and white', { first: 'Pulsar lines', grade: 'noir' }],
  ['a spiral galaxy of stars', { top3: ['Particle galaxy', 'Galaxy'] }],
  ['hypnotic spiral', { first: 'Hypno spiral' }],
  ['trippy fractal zoom', { first: 'Fractal dive' }],
  ['particles that explode on every kick', { top3: ['Beat burst', 'Sparks on kick'], react: 'pump-kick' }],
  ['3d spectrum crown halo', { first: 'Spectrum crown' }],
  ['warp speed through stars, fast', { top3: ['Hyperspace', 'Warp stars'], faster: true }],
  ['club lasers that flash on the hi hats', { first: 'Laser show', react: 'strobe-hats' }],
  ['fire embers burning', { top3: ['Ember burst', 'Fire', 'Embers'] }],
  ['kinetic type opener', { first: 'Kinetic opener' }],
  ['glitch title cyber', { first: 'Glitch title' }],
  ['"OUT NOW" release poster', { first: 'Out now poster', quoted: 'OUT NOW' }],
  ['event announcement friday live show', { first: 'Friday live' }],
  ['snow falling slowly at night', { top3: ['Snow'], slower: true }],
  ['bouncing balls on the beat', { top3: ['Bouncing balls on beat'], react: 'step-beat' }],
  ['dominoes falling', { top3: ['Domino run'] }],
  ['flag in the wind', { top3: ['Flag in the wind'] }],
  ['smoke and fog, moody', { top3: ['Smoke'], grade: 'night' }],
  ['rain storm', { top3: ['Rain'] }],
  ['a tunnel but no text', { first: 'Hyper tunnel', noType: true }],
  ['chrome tunnel without music', { still: true }],
  ['intense aggressive club energy', { stronger: true }],
  ['subtle calm ambient', { softer: true }],
  ['wobbles on the bass', { react: 'wobble-sub' }],
  ['zooms on the drop', { react: 'zoom-drops' }],
  ['rises through the build', { react: 'rise-builds' }],
  ['follows the vocals', { react: 'follow-vocals' }],
  ['cinematic teal sci-fi', { grades: ['scifi', 'blockbuster'] }],
  ['vintage super 8 home movie', { grade: 'super8' }],
  ['matrix hacker code rain', { grade: 'matrix' }],
  ['golden sunny summer', { grade: 'golden' }],
  ['blue and orange', { color: true }],
  ['zzzz qqqq', { fallback: true }],
];

ok(`the catalog has what Hearth has (${BASES.length} starting points: gallery + particles + physics + type)`, () => {
  assert(BASES.filter((b) => b.kind === 'start').length >= 20);
  for (const k of ['particles', 'physics', 'type']) assert(BASES.some((b) => b.kind === k), k);
  assert(!BASES.some((b) => b.id === 'picture' && b.kind === 'particles'), 'presets that need your own files stay out');
  assert.strictEqual(new Set(BASES.map((b) => b.key)).size, BASES.length, 'keys are unique');
});

for (const [text, want] of CASES) {
  ok(`"${text}"`, () => {
    const p = plan(text);
    if (show) console.log('   ', names(p).join(' · '), '|', p.picks.map((x) => x.why.join(', ')).join(' || '));
    assert.strictEqual(p.picks.length, 3, 'three picks');
    assert.strictEqual(new Set(keys(p)).size, 3, 'three different picks');
    for (const x of p.picks) assert(x.why.length && x.name, 'each says why and has a name');
    if (want.first) assert.strictEqual(names(p)[0], want.first, `first: ${names(p).join(', ')}`);
    if (want.top3) assert(want.top3.some((w) => names(p).includes(w)), `one of ${want.top3} in ${names(p).join(', ')}`);
    if (want.react) assert.strictEqual(p.read.react, want.react);
    if (want.slower) assert(p.read.speed < 1, `speed ${p.read.speed}`);
    if (want.faster) assert(p.read.speed > 1, `speed ${p.read.speed}`);
    if (want.stronger) assert(p.read.intensity > 1.2, `intensity ${p.read.intensity}`);
    if (want.softer) assert(p.read.intensity < 0.9, `intensity ${p.read.intensity}`);
    if (want.grades) assert(want.grades.every((g) => p.picks.some((x) => x.grade?.id === g)), p.picks.map((x) => x.grade?.id).join(', '));
    if (want.grade) assert.strictEqual(p.picks[0].grade?.id, want.grade, `grade ${p.picks[0].grade?.id}`);
    if (want.color) assert(p.picks.every((x) => x.palette), 'colors → a palette on every pick');
    if (want.quoted) assert.strictEqual(p.read.quoted, want.quoted);
    if (want.noType) assert(!p.picks.some((x) => x.base.kind === 'type' || x.base.mood === 'type'), 'no text when asked for none');
    if (want.still) assert(p.read.still && !p.read.react, 'no music reaction');
    if (want.fallback) assert(p.picks.every((x) => x.base.kind === 'start'), 'nothing matched: gallery starting points');
  });
}

ok('the 3 picks differ in kind or mood, and each gets its own look / palette when there are several', () => {
  const p = plan('dreamy pink chrome tunnel that pulses on the kick, slow');
  assert.strictEqual(new Set(p.picks.map((x) => x.base.family)).size, 3);
  assert.strictEqual(new Set(p.picks.map((x) => x.palette?.name)).size, 3, p.picks.map((x) => x.palette?.name).join(', '));
  assert.strictEqual(p.picks[0].palette.cat, 'yours', 'the first pick uses your exact colors');
  assert(p.picks[0].palette.colors.every((c) => /^#[0-9a-f]{6}$/.test(c)));
  assert(p.picks[0].why.some((w) => /speed ×0\.\d/.test(w)) && p.picks[0].why.some((w) => /Pump on kick/.test(w)));
  assert.strictEqual(p.picks[0].name, 'Dreamy pink chrome tunnel');
});
ok('↻ 3 more: the next picks are new ones', () => {
  const a = plan('neon tunnel'); const b = plan('neon tunnel', { offset: 3 });
  assert.strictEqual(b.picks.length, 3);
  assert(!b.picks.some((x) => keys(a).includes(x.base.key)));
});
ok('color words: pink ranks pink palettes, black and white ranks grey ones', () => {
  const r = C.read('pink'); const top = C.rankPalettes(r, FX.PALETTES)[0];
  assert(top.colors.some((c) => C.sim('#ff5fa8', c) > 0.6), top.name);
  const bw = C.rankPalettes(C.read('black and white'), FX.PALETTES).slice(0, 3);
  assert(bw.some((p) => p.cat === 'Mono'), bw.map((p) => p.name).join(', '));
});
ok('very / slightly change how far a word moves speed; "not too fast" is a bit slower', () => {
  assert(C.read('very slow').speed < C.read('slow').speed);
  assert(C.read('slightly fast').speed < C.read('fast').speed && C.read('slightly fast').speed > 1);
  const nt = C.read('not too fast').speed; assert(nt < 1 && nt > 0.6, String(nt));
});
ok('tune(): colors follow the palette by lightness, speed and intensity scale, ranges hold', () => {
  const code = [
    'const P = tweak({',
    "  bg: { value: '#101010', label: 'Background', group: 'Colors' },",
    "  main: { value: '#ff8800', label: 'Main', group: 'Colors' },",
    "  hi: { value: '#ffffff', label: 'Highlight', group: 'Colors' },",
    "  speed: { value: 1, min: 0, max: 3, label: 'Speed', group: 'Motion' },",
    "  glow: { value: 0.8, min: 0, max: 1, label: 'Glow', group: 'Look' },",
    "  kick: { value: 0.5, min: 0, max: 2, label: 'Kick punch', group: 'Music' },",
    "  size: { value: 2, min: 0, max: 4, label: 'Size', group: 'Look' },",
    '});',
  ].join('\n');
  const t = C.tune(code, { palette: ['#000011', '#ff00aa', '#ffeeff'], speed: 0.5, intensity: 1.5, features: ['kick'] });
  assert(t.code.includes("bg: { value: '#000011'") && t.code.includes("main: { value: '#ff00aa'") && t.code.includes("hi: { value: '#ffeeff'"), t.code);
  assert(t.code.includes('speed: { value: 0.5,'));
  assert(t.code.includes('glow: { value: 1,'), 'clamped to its max');
  assert(t.code.includes('kick: { value: 1.125,'), 'the kick slider follows the words (×1.5 × intensity)');
  assert(t.code.includes('size: { value: 2,'), 'other sliders stay');
  const s = C.tune(code, { still: true });
  assert(s.code.includes('kick: { value: 0,'), 'no music: music sliders to 0');
});
ok('tune() on every gallery starting point keeps the code shape (same lines, every slider still a slider)', () => {
  const T = { TEMPLATES: [] }; // (template layers need ThreeLayers; the starting points written in the gallery file are enough)
  void T;
  for (const s of Gal.STARTS) for (const L of s.layers.filter((x) => x.code)) {
    const t = C.tune(L.code, { palette: ['#120024', '#ff2bd6', '#2bd9ff', '#ffd75e', '#ffffff'], speed: 0.5, intensity: 1.3, features: ['kick'] });
    assert.strictEqual(t.code.split('\n').length, L.code.split('\n').length, s.id);
    assert.strictEqual((t.code.match(/value:/g) || []).length, (L.code.match(/value:/g) || []).length, s.id);
    assert(t.changed.length > 0, `${s.id}: something changed`);
  }
});
ok('reads like a description (the gallery\'s "Make it from my words" row)', () => {
  for (const q of ['dreamy pink chrome tunnel', 'slow neon grid', 'something that pulses on the kick', 'pink blob']) assert(C.looksLikeDescription(q), q);
  for (const q of ['tunnel', 'chrome', 'outrun', '']) assert(!C.looksLikeDescription(q), q);
});
ok('the director brief says what was made, and its cost is shown in tokens', () => {
  const p = plan('dreamy pink chrome tunnel that pulses on the kick, slow').picks[0];
  const b = C.brief(p, 'dreamy pink chrome tunnel that pulses on the kick, slow');
  assert(b.includes(p.base.name) && b.includes('Pump on kick') && b.length < 600, b);
  assert.strictEqual(C.cost(b), Math.ceil(b.length / 3.6));
});
ok('every look, palette and reaction a word names exists in Hearth', () => {
  const D = require('../tools/three-instant-data.js');
  const grades = new Set(G.PRESETS.map((g) => g.id)); const cats = new Set(FX.PALETTES.flatMap((p) => [p.cat, p.name]));
  const reacts = new Set(AM.PRESETS.map((p) => p.id));
  for (const [w, e] of Object.entries(D.WORDS)) {
    if (e.grade) assert(grades.has(e.grade), `${w}: look ${e.grade}`);
    if (e.pal) assert(cats.has(e.pal), `${w}: palette ${e.pal}`);
  }
  for (const f of Object.values(D.REACT)) for (const id of Object.values(f)) assert(reacts.has(id), id);
});
console.log(`${n} passed`);
