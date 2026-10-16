#!/usr/bin/env node
// ◉ Looks (round 50, labmaterials): the pure parts of tools/three-materials-core.js in Node: 16 presets, words people
// use find them, a spec is cleaned (unknown → null, the preset's own color / shine left out, shine clamped), the
// material settings each preset makes (metals are metal, glass transmits, shine is 1 − roughness, a color wins, neon
// glows in its color), which ones need reflections, plain words, the recipe step's words, and the sandbox lib wrapper.
//   node dev/labmaterials-test.js
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'tools', 'three-materials-core.js'));
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };

// ---------- 1. the presets ----------
const want = ['chrome', 'brushed', 'gold', 'mirror', 'glass', 'frosted', 'plastic', 'ceramic', 'clay', 'rubber', 'velvet', 'holo', 'neon', 'toon', 'wire', 'xray'];
check(C.PRESETS.length === 16 && want.every((k) => C.has(k)), '16 presets: chrome … x-ray', C.PRESETS.map((p) => p.id));
check(new Set(C.PRESETS.map((p) => p.name)).size === 16 && C.PRESETS.every((p) => /^#[0-9a-f]{6}$/.test(p.color) && p.shine >= 0 && p.shine <= 1), 'each has a name, a color and a shine');

// ---------- 2. words people use ----------
const words = { chrome: 'chrome', 'Frosted glass': 'frosted', 'brushed metal': 'brushed', iridescent: 'holo', holographic: 'holo', 'x-ray': 'xray', wireframe: 'wire', emissive: 'neon', 'glossy plastic': 'plastic', 'matte clay': 'clay', porcelain: 'ceramic', cartoon: 'toon', steel: 'brushed', Mirror: 'mirror', GOLD: 'gold' };
const miss = Object.entries(words).filter(([w, k]) => C.find(w)?.id !== k);
check(!miss.length, 'find: names, other words, any case', miss.map(([w]) => [w, C.find(w)?.id]));
check(C.find('banana') === null && C.find('') === null, 'find: nothing for an unknown word');

// ---------- 3. a clean spec ----------
check(C.normalize({ k: 'nope' }) === null && C.normalize(null) === null, 'normalize: an unknown look is null');
check(JSON.stringify(C.normalize({ k: 'Chrome' })) === '{"k":"chrome"}', 'normalize: by name, nothing else when it is the preset as it is');
check(JSON.stringify(C.normalize({ k: 'gold', c: '#FFC45C', s: 0.82 })) === '{"k":"gold"}', 'normalize: the preset\'s own color / shine are left out');
check(JSON.stringify(C.normalize({ k: 'glass', c: '#88CCFF', s: 1.7 })) === '{"k":"glass","c":"#88ccff","s":1}', 'normalize: a color (lower case), shine clamped to 0–1');
check(JSON.stringify(C.normalize({ k: 'clay', c: 'red', s: 'x' })) === '{"k":"clay"}', 'normalize: a color that isn\'t #rrggbb and a shine that isn\'t a number are ignored');

// ---------- 4. what each one makes ----------
const P = (s) => C.params(s);
check(['chrome', 'brushed', 'gold', 'mirror'].every((k) => P({ k }).o.metalness === 1), 'metals are metal');
check(P({ k: 'mirror' }).o.roughness <= 0.02 && P({ k: 'chrome' }).o.roughness <= 0.06, 'chrome and mirror are smooth');
check(P({ k: 'glass' }).kind === 'phys' && P({ k: 'glass' }).o.transmission === 1 && P({ k: 'frosted' }).o.transmission === 1 && P({ k: 'frosted' }).o.roughness > P({ k: 'glass' }).o.roughness, 'glass and frosted glass transmit; frosted is rougher');
check(Math.abs(P({ k: 'chrome', s: 0.3 }).o.roughness - 0.7) < 1e-9 && Math.abs(P({ k: 'plastic', s: 0.9 }).o.roughness - 0.1) < 1e-9, 'shine is 1 − roughness');
check(P({ k: 'plastic', c: '#00ff00' }).o.color === '#00ff00' && P({ k: 'plastic' }).o.color === '#e8423f', 'a color wins over the preset\'s');
check(P({ k: 'neon', c: '#00ffcc' }).o.emissive === '#00ffcc' && P({ k: 'neon' }).o.color === '#000000' && P({ k: 'neon', s: 1 }).o.emissiveIntensity > P({ k: 'neon', s: 0 }).o.emissiveIntensity, 'neon glows in its color; shine = how much');
check(P({ k: 'velvet' }).o.sheen === 1 && P({ k: 'holo' }).o.iridescence === 1 && P({ k: 'brushed' }).o.anisotropy > 0, 'velvet has sheen, holographic iridescence, brushed metal anisotropy');
check(P({ k: 'wire' }).o.wireframe === true && P({ k: 'xray' }).o.blending === 'add' && P({ k: 'xray' }).o.depthWrite === false && P({ k: 'toon' }).kind === 'toon', 'wireframe, x-ray (additive, see-through), toon');
check(C.PRESETS.every((p) => P({ k: p.id })), 'every preset makes settings');
check(C.params({ k: 'nope' }) === null, 'an unknown look makes nothing');

// ---------- 5. reflections, words ----------
check(['chrome', 'gold', 'glass', 'mirror', 'brushed', 'frosted'].every((k) => C.needsEnv({ k })) && !['clay', 'neon', 'wire', 'xray', 'toon'].some((k) => C.needsEnv({ k })), 'metal and glass ask for an environment light; clay, neon, wireframe, x-ray, toon don\'t');
check(C.describe({ k: 'glass', c: '#88ccff', s: 0.4 }) === 'Glass · #88ccff · shine 40 %' && C.describe({ k: 'gold' }) === 'Gold' && C.describe(null) === 'Original', 'plain words');

// ---------- 6. the recipe step's words, the preview's lib ----------
global.window = undefined;
const R = require(path.join(ROOT, 'tools', 'three-recipes-core.js'));
check(R.KINDS.includes('mat'), 'recipes know a look step');
const fakeWin = {}; new Function('window', require('fs').readFileSync(path.join(ROOT, 'tools', 'three-materials-core.js'), 'utf8'))(fakeWin); // eslint-disable-line no-new-func
const lib = String(fakeWin.__sbxLibFn?.matcore || '');
check(/globalThis\.matcore = \(function hearthMatCore/.test(lib) && Boolean(fakeWin.MatCore?.PRESETS), 'the preview page gets it as globalThis.matcore (read twice: no clash)');
let ran = null; try { const g = {}; new Function('globalThis', `(${lib})();`)(g); ran = g.matcore; } catch (e) { ran = e.message; } // eslint-disable-line no-new-func
check(ran && ran.PRESETS?.length === 16, 'the lib runs on its own', typeof ran === 'string' ? ran : undefined);

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
