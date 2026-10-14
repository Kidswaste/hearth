// Node tests for 🔎 Lab search's ranking (tools/three-search-core.js): words and stems, the typo distance, plain words
// and synonyms ("glow" → bloom, "make it brighter", "slow motion", "vertical video" → ▦ All formats 9:16), typos
// ("blomm", "glwo", "partcles"), prefixes while typing, nothing found, the recent picks and danger rows, the help
// answers, and the time per keystroke on a big index (typed letter by letter).
//   node dev/labsearch-test.js
const assert = require('assert');
const C = require('../tools/three-search-core.js');
let n = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

// the kind of rows the Lab gives it (labels, hints and paths as the real menus / catalogs write them)
const ROWS = [
  { id: 'f:filter:glow', kind: 'fx', label: 'Glow', hint: 'Filter · Blur & light · Soft bloom around bright parts', path: 'Effects › Filter', tags: 'bloom light filter effect add apply' },
  { id: 'f:filter:bloom2', kind: 'fx', label: 'Bloom (HDR)', hint: 'Filter · Blur & light', path: 'Effects › Filter', tags: 'filter effect' },
  { id: 'f:filter:adjust', kind: 'fx', label: 'Adjust', hint: 'Filter · Color · Brightness, contrast, saturation, vibrance, temperature, gamma', path: 'Effects › Filter', tags: 'basic correction filter effect' },
  { id: 'f:filter:vhs', kind: 'fx', label: 'VHS tape', hint: 'Filter · Retro', path: 'Effects › Filter', tags: 'filter effect' },
  { id: 'f:layer:particles', kind: 'fx', label: 'Particles', hint: 'Layer · Shapes', path: 'Effects › Layer', tags: 'layer effect' },
  { id: 'a:formats', kind: 'action', label: '▦ All formats', hint: '16:9, 9:16, 1:1, 4:5 in one go, each reframed', path: 'Right-click the preview › ✦ More › ⇪ Make' },
  { id: 'a:916', kind: 'action', label: '9:16', hint: '1080×1920 · Shift+2', path: 'Right-click the preview › Frame size' },
  { id: 'a:169', kind: 'action', label: '16:9', hint: '1920×1080 · Shift+3', path: 'Right-click the preview › Frame size' },
  { id: 'a:speed', kind: 'action', label: 'Lab playback speed: ½×', hint: '', path: 'Ctrl/⌘+K' },
  { id: 'a:speed1', kind: 'action', label: 'Lab playback speed: 1×', hint: '', path: 'Ctrl/⌘+K' },
  { id: 'a:freeze', kind: 'action', label: '❚❚ Freeze', hint: 'F', path: 'Right-click the preview' },
  { id: 'a:react', kind: 'action', label: '✦ Make it react to the music', hint: 'Kick, bass and loudness move the right sliders', path: 'Right-click the preview › ✦ More › ♪ Music' },
  { id: 'a:make', kind: 'action', label: '⇪ Make', hint: 'variations, render again', path: 'Right-click the preview › ✦ More', sub: true },
  { id: 'a:del', kind: 'action', label: 'Delete this layer', hint: '', path: 'Layer "Orb" (right-click)', danger: true },
  { id: 'a:dup', kind: 'action', label: '⧉ Duplicate', hint: '', path: 'Layer "Orb" (right-click)' },
  { id: 'a:restart', kind: 'action', label: '⟲ Restart from scratch', hint: 'Ctrl+Shift+Enter', path: 'Right-click the preview' },
  { id: 'a:doctor', kind: 'action', label: '🩺 Fix my scene', hint: 'A free check of the scene with one-click fixes', path: 'Right-click the preview › ✦ More' },
  { id: 'l:orb', kind: 'layer', label: 'Orb', hint: 'selected · layer in this scene', path: 'Layers', tags: 'layer' },
  { id: 'l:bg', kind: 'layer', label: 'Backdrop', hint: 'layer in this scene', path: 'Layers', tags: 'layer' },
  { id: 's:orb|glow', kind: 'slider', label: 'Glow amount', hint: 'slider · Orb · Look', path: 'Sliders', tags: 'glow slider' },
  { id: 't:neon', kind: 'template', label: 'Neon title', hint: 'my template · 7 fields to fill in', path: '📐 My templates', tags: 'template my own Title Color' },
  { id: 'g:tunnel', kind: 'gallery', label: 'Hyper tunnel', hint: 'start from · Energy · A tunnel rushing at you', path: 'Gallery', tags: 'tunnel speed gallery start starting point new scene' },
  { id: 'c:old', kind: 'scene', label: 'Summer promo', hint: 'your scene · 2 h ago', path: 'Your sketches', tags: 'scene sketch recent mine' },
  ...C.HELP.map((h) => ({ id: `h:${h.title}`, kind: 'help', label: h.title, hint: h.text.slice(0, 110), path: 'Help', tags: h.tags })),
];
const ix = C.build(ROWS);
const top = (q, k = 1, o) => C.search(ix, q, o).slice(0, k).map((r) => r.item.id);
const ids = (q, o) => C.search(ix, q, o).map((r) => r.item.id);

ok('words: lower case, accents off, stems on both sides, frame sizes stay one word', () => {
  assert.deepStrictEqual(C.words('Brighter Layers'), ['bright', 'layer']);
  assert.deepStrictEqual(C.words('9:16 · 1080×1920'), ['9:16', '1080x1920']);
  assert.deepStrictEqual(C.words('Décor ½×'), ['decor', 'half', 'x']);
  assert.strictEqual(C.stem('glass'), 'glass');
  assert.strictEqual(C.stem('particles'), 'particle');
});
ok('typo distance: a swap counts once, stops early past the limit', () => {
  assert.strictEqual(C.dist('glwo', 'glow', 1), 1);
  assert.strictEqual(C.dist('blomm', 'bloom', 1), 1);
  assert.strictEqual(C.dist('abc', 'xyz', 1), 2);
});
ok('a name wins: "glow" → Glow first, its synonym Bloom found too, the Glow slider listed', () => {
  assert.strictEqual(top('glow')[0], 'f:filter:glow');
  assert.ok(ids('glow').includes('f:filter:bloom2'), 'bloom by synonym');
  assert.ok(ids('glow').includes('s:orb|glow'));
  assert.ok(ids('bloom').includes('f:filter:glow'), 'and back');
});
ok('typos: blomm, glwo, partcles, vhs tpae', () => {
  assert.ok(top('blomm', 2).includes('f:filter:bloom2'), ids('blomm').join());
  assert.strictEqual(top('glwo')[0], 'f:filter:glow');
  assert.strictEqual(top('partcles')[0], 'f:layer:particles');
  assert.strictEqual(top('vhs tpae')[0], 'f:filter:vhs');
  assert.ok(!ids('slow').includes('f:filter:glow'), 'the first letter is rarely the typo: slow ≠ glow');
});
ok('while typing: prefixes from the first letters of the last word', () => {
  assert.strictEqual(top('partic')[0], 'f:layer:particles');
  assert.strictEqual(top('fre')[0], 'a:freeze');
  assert.strictEqual(top('fix my sc')[0], 'a:doctor');
});
ok('plain words: slow motion, vertical video, make it brighter, react to the music', () => {
  assert.strictEqual(top('slow motion')[0], 'a:speed');
  assert.strictEqual(top('vertical video')[0], 'a:formats', ids('vertical video').join());
  assert.ok(ids('vertical video').includes('a:916'));
  assert.ok(top('tiktok', 2).includes('a:formats'));
  assert.ok(top('make it brighter', 2).includes('f:filter:adjust'), ids('make it brighter').join());
  assert.strictEqual(top('react to the music')[0], 'a:react');
  assert.strictEqual(top('black screen')[0], 'a:doctor', ids('black screen').join());
  assert.ok(top('copy this layer', 2).includes('a:dup'));
});
ok('a sentence may miss one word; one or two words must all match', () => {
  assert.strictEqual(top('add a glow filter please')[0], 'f:filter:glow');
  assert.deepStrictEqual(ids('glow zzqx'), []);
});
ok('only little words: they count after all ("make" → ⇪ Make)', () => {
  assert.strictEqual(top('make')[0], 'a:make');
});
ok('nothing found: an empty list (the box then offers "Ask the director")', () => {
  assert.deepStrictEqual(ids('qwzx flurb'), []);
  assert.deepStrictEqual(ids('   '), []);
});
ok('layers, templates, the gallery, scenes and help are found by name', () => {
  assert.strictEqual(top('orb')[0], 'l:orb');
  assert.strictEqual(top('neon title')[0], 't:neon');
  assert.strictEqual(top('tunnel')[0], 'g:tunnel');
  assert.strictEqual(top('summer')[0], 'c:old');
  assert.ok(top('how do i save sliders', 3).some((id) => id.startsWith('h:How do I save')), ids('how do i save sliders').join());
});
ok('your recent picks come first among equals; a delete row sinks', () => {
  const plain = ids('playback speed');
  assert.deepStrictEqual(plain.slice(0, 2).sort(), ['a:speed', 'a:speed1']); // a tie
  assert.strictEqual(ids('playback speed', { recent: new Map([[plain[1], 0]]) })[0], plain[1]);
  const d = C.search(C.build([{ id: 'x', kind: 'action', label: 'Delete this layer', danger: true }, { id: 'y', kind: 'action', label: 'Delete the cue' }]), 'delete');
  assert.strictEqual(d[0].item.id, 'y');
});
ok('help answers: each has a title, a text, words to be found by', () => {
  assert.ok(C.HELP.length >= 12);
  for (const h of C.HELP) assert.ok(h.title && h.text && h.tags, h.title);
});
ok('fast: < 16 ms per keystroke on a 3 000-row index (typed letter by letter, fresh memo)', () => {
  const W = 'glow bloom grain glitch tunnel orb particles neon chrome blob retro grid sunset type title lyric camera mirror kaleido pixel ascii vhs film dust spark wave bars ring rings galaxy fog smoke fire water liquid metal glass light shadow color palette look grade lut speed beat kick snare hat drop cue marker loop render export frame size layer slider knob scene sketch template gallery'.split(' ');
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pickW = (k) => Array.from({ length: k }, () => W[Math.floor(rnd() * W.length)]).join(' ');
  const big = [...ROWS];
  for (let i = 0; i < 3000; i += 1) big.push({ id: `r${i}`, kind: ['action', 'fx', 'gallery', 'help'][i % 4], label: `${pickW(2)} ${i}`, hint: pickW(6), path: `Menu › ${pickW(1)}`, tags: pickW(3) });
  const t0 = process.hrtime.bigint();
  const bix = C.build(big);
  const buildMs = Number(process.hrtime.bigint() - t0) / 1e6;
  // warmed up like the box does when it opens; each keystroke the best of 3 on a fresh word memo (the machine is shared)
  for (const q of ['a', 'm', 'glow', 'vertical video']) C.search(bix, q);
  let max = 0; let sum = 0; let k = 0;
  for (const q of ['vertical video', 'make it brighter', 'glwo particles', 'neon tunnel retro', 'slow motion', 'fix my scene']) {
    for (let i = 1; i <= q.length; i += 1) {
      let ms = Infinity;
      for (let r = 0; r < 3; r += 1) {
        bix.memo.clear();
        const s = process.hrtime.bigint();
        C.search(bix, q.slice(0, i));
        ms = Math.min(ms, Number(process.hrtime.bigint() - s) / 1e6);
      }
      max = Math.max(max, ms); sum += ms; k += 1;
    }
  }
  console.log(`   build ${buildMs.toFixed(1)} ms for ${big.length} rows · per keystroke avg ${(sum / k).toFixed(2)} ms, max ${max.toFixed(2)} ms`);
  assert.ok(max < 16, `max ${max} ms`);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; }
  }
  console.log(`${n}/${tests.length} passed`);
})();
