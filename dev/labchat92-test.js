#!/usr/bin/env node
// (round 92, labchat92) tools/three-chatlink-core.js, the chat ↔ Lab glue's pure parts: the owner's cursor through an
// AI edit, what counts as a whole layer, when a whole-layer rewrite is refused, an apply's outcome in words (errors
// said once whichever way they came), the message the owner's click sends, the scene line.
//   node dev/labchat92-test.js
const assert = require('assert');
const C = require('../tools/three-chatlink-core.js');

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok ${n} - ${name}`); };

t('caret: before the change stays, after it moves by the change, inside goes to its end', () => {
  const a = 'const a = 1;\nconst b = 2;\n';
  const b = 'const a = 10;\nconst b = 2;\n';
  assert.strictEqual(C.caret(a, b, 3), 3);
  assert.strictEqual(C.caret(a, b, a.length), b.length);
  assert.strictEqual(C.caret(a, b, a.indexOf('b')), b.indexOf('b'));
  assert.strictEqual(C.caret(a, a, 7), 7);
  const c = 'color: red; size: 2';
  const d = 'color: blue; size: 2';
  assert.strictEqual(C.caret(c, d, 9), d.indexOf(';')); // inside "red": at the end of "blue"
  assert.strictEqual(C.caret('abc', '', 2), 0);
  assert.strictEqual(C.caret('', 'abc', 0), 0);
  assert.strictEqual(C.caret('abc', 'abc', 99), 3);
  // a long text with the change far below the cursor (the common case: the AI edits another line)
  const big = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n');
  const big2 = big.replace('line 300', 'line three hundred');
  assert.strictEqual(C.caret(big, big2, 50), 50);
  assert.strictEqual(C.caret(big, big2, big.length - 5), big2.length - 5);
});

t('wholeLayer: an ES module that imports three, draws and loops; not a snippet, not another language', () => {
  const layer = "import * as THREE from 'three';\nconst r = new THREE.WebGLRenderer({ alpha: true });\nconst s = new THREE.Scene(); const c = new THREE.PerspectiveCamera();\nr.setAnimationLoop(() => r.render(s, c));";
  assert.ok(C.wholeLayer(layer));
  assert.ok(C.wholeLayer(layer, 'javascript'));
  assert.ok(C.wholeLayer(layer.replace('setAnimationLoop(() =>', 'requestAnimationFrame(function f() {').replace('));', '); });'), 'js'));
  assert.ok(!C.wholeLayer("const cube = new THREE.Mesh(new THREE.BoxGeometry());\nscene.add(cube);"));
  assert.ok(!C.wholeLayer(layer, 'python'));
  assert.ok(!C.wholeLayer("import * as THREE from 'three';\nconst m = new THREE.Mesh();\nexport default m; // no loop, nothing drawn here at all ok"));
  assert.ok(!C.wholeLayer(''));
});

t('staleRewrite: refused only when the owner typed lately and the AI\'s look is not the code now', () => {
  const now = 1_000_000;
  assert.strictEqual(C.staleRewrite({ handAt: 0, seenText: null, code: 'x', now }), false); // never typed here
  assert.strictEqual(C.staleRewrite({ handAt: now - 5000, seenText: null, code: 'x', now }), true); // typed, AI never read it
  assert.strictEqual(C.staleRewrite({ handAt: now - 5000, seenText: 'old', code: 'x', now }), true); // typed after its read
  assert.strictEqual(C.staleRewrite({ handAt: now - 5000, seenText: 'x', code: 'x', now }), false); // it read the typed code
  assert.strictEqual(C.staleRewrite({ handAt: now - 11 * 60 * 1000, seenText: null, code: 'x', now }), false); // long ago
  const e = C.staleError('Base', 12000);
  assert.ok(/editing "Base" by hand \(last change 12 s ago\)/.test(e) && /nothing was changed/.test(e) && /three_read_code/.test(e) && /three_edit_code/.test(e));
  assert.ok(/2 min/.test(C.staleError('Base', 125000)));
});

t('outcome: no errors; errors said once (row, "[layer] … (line n)" line, health); other layers left out; console lines', () => {
  const ok = C.outcome({ errors: [], console: ['applied92 ready', '[warn] slow'] }, [], 'Ring');
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.words, 'it runs with no errors');
  assert.deepStrictEqual(ok.console, ['applied92 ready']);
  const bad = C.outcome({ errors: [{ layer: 'Ring', message: 'SyntaxError: missing ) after argument list', line: 9 }, '[Ring] SyntaxError: missing ) after argument list (line 9)', { layer: 'Base', message: 'TypeError: x is undefined' }] },
    [{ message: 'SyntaxError: missing ) after argument list', line: null }], 'Ring');
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.errors.length, 1);
  assert.deepStrictEqual(bad.errors[0], { message: 'SyntaxError: missing ) after argument list', line: 9 });
  assert.strictEqual(bad.words, '1 error: SyntaxError: missing ) after argument list (line 9)');
  const two = C.outcome({ errors: 'none' }, [{ message: 'TypeError: a' }, { message: 'TypeError: b', line: 3 }], 'Ring');
  assert.strictEqual(two.words, '2 errors: TypeError: a · TypeError: b (line 3)');
  assert.strictEqual(C.outcome(null).ok, true);
});

t('tellText: what was applied, its errors or no errors, console, no code; undone said', () => {
  const out = C.outcome({ console: ['ready'] }, [], 'Ring');
  const a = C.tellText({ layer: 'Ring', scene: 'Chat A', out });
  assert.ok(/replaced the layer "Ring" in the Lab scene "Chat A"/.test(a) && /no errors/.test(a) && /Console: ready/.test(a) && /What next\?/.test(a));
  const bad = C.outcome({}, [{ message: 'SyntaxError: x', line: 2 }], 'Ring');
  const b = C.tellText({ how: 'added', layer: 'From chat', scene: 'Chat A', out: bad });
  assert.ok(/is a new layer "From chat"/.test(b) && /- SyntaxError: x \(line 2\)/.test(b) && /Please fix it\./.test(b));
  const u = C.tellText({ layer: 'Ring', scene: 'Chat A', out: bad, undone: true });
  assert.ok(/I undid it/.test(u) && !/Please fix it/.test(u));
  assert.ok(a.length < 300 && !/import/.test(a));
});

t('sceneLine: the scene, layers bottom first with the selected starred, the picked object; capped', () => {
  assert.strictEqual(C.sceneLine({ scene: 'Chat A', layers: ['Base', 'Ring'], selected: 'Ring' }), '[Lab scene "Chat A" · layers, bottom first (* = selected): Base, Ring*]');
  const p = C.sceneLine({ scene: 'S', layers: ['A'], selected: 'A', picked: '"Duck" (Mesh) in layer "A"' });
  assert.ok(/picked in the scene editor: "Duck" \(Mesh\)/.test(p));
  const many = C.sceneLine({ scene: 'S', layers: Array.from({ length: 30 }, (_, i) => `L${i}`), selected: 'L3' });
  assert.ok(/L3\*/.test(many) && /\+14\]$/.test(many) && many.length < 400);
  assert.ok(/none/.test(C.sceneLine({ scene: 'S' })));
});

console.log(`\n${n} passed`);
