// Node tests for 📐 My templates (tools/three-templates-core.js): the fields read from a scene (text layers, media
// slots, palette, named sliders with their live values), a new scene made with values (sliders written into the code,
// the words, the palette, a reference's file, the song), values made safe, values typed in a chat, the template's own
// media as tpl: tokens (Mac and Windows folders), the file check, search / newest first, and the .hearthpack round trip
// of a template (packs-core + packsmain: kind "template", its fields kept, its media packed and unpacked).
//   node dev/labtemplates-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const C = require('../tools/three-templates-core.js');
const P = require('../packs-core.js');
const ROOT = path.join(__dirname, '..');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(`${fs.readFileSync(path.join(ROOT, 'tools/three-tweaks.js'), 'utf8')};this.ThreeTweaks = ThreeTweaks;`, ctx);
const T = ctx.ThreeTweaks;
let n = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const ORB = `const P = tweak({ speed: [1, 0, 5], glow: { value: 1.2, min: 0, max: 3, label: 'Glow amount' }, tint: '#ff3cac', wire: false, mode: { value: 'soft', options: ['soft', 'hard'] }, count: { value: 200, min: 10, max: 1000, step: 1 } });
const m = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3)); // plain literals are not fields
const tex = refTexture('logo');`;
const TITLE = `const P = tweak({ size: { value: 0.12, min: 0.02, max: 0.4, label: 'Size' }, color: { value: '#ffffff', label: 'Color' } });

textLayer(P, {"text":"HEARTH","mode":"2d"});`;
const SCENE = {
  name: 'Neon title',
  layers: [{ id: 'main', name: 'Orb', code: ORB }, { id: 'L2', name: 'Title', code: TITLE }, { id: 'pc', name: 'Other scene', code: '', precomp: { scene: 'x' } }],
  palette: ['#112233', '#ff8800', 'nope'],
  extras: { frame: '9:16', media: { path: '/music/song.mp3' }, midi: { cc: 1 }, selectedLayer: 'L2', layers: { main: { looks: [] } } },
  refs: [{ key: 'logo', name: 'logo.png', kind: 'image', path: '/refs/logo.png' }, { key: 'clip', name: 'clip.mp4', kind: 'video', path: '/refs/clip.mp4' }, { key: 'mesh', name: 'm.glb', kind: 'model', path: '/refs/m.glb' }],
};
const fields = C.extract(SCENE, { scan: T.scan, live: { main: { speed: 2.5 } } });
const F = (id) => fields.find((f) => f.id === id);

ok('extract: the text layer\'s words, the media slots (references + the song, not a 3D model), the palette, the named sliders', () => {
  assert.deepStrictEqual(fields.map((f) => f.kind).slice(0, 5), ['text', 'image', 'video', 'audio', 'palette']);
  assert.strictEqual(F('t:L2').value, 'HEARTH'); assert.strictEqual(F('t:L2').label, 'Title');
  assert.strictEqual(F('m:ref:logo').where, 'ref'); assert.strictEqual(F('m:ref:logo').value, '/refs/logo.png');
  assert.ok(!F('m:ref:mesh'), 'a model is not a media slot');
  assert.strictEqual(F('m:song').where, 'song'); assert.strictEqual(F('m:song').kind, 'audio');
  assert.deepStrictEqual(F('palette').value, ['#112233', '#ff8800']);
  const sl = fields.filter(C.isSlider).map((f) => f.id);
  assert.deepStrictEqual(sl.sort(), ['s:L2|color', 's:L2|size', 's:main|count', 's:main|glow', 's:main|mode', 's:main|speed', 's:main|tint', 's:main|wire'].sort());
  assert.ok(!fields.some((f) => f.layer === 'pc'), 'a precomp layer has no fields');
});
ok('extract: a slider keeps its range, label, options, whole-number step; the live (unsaved) value is the default', () => {
  assert.strictEqual(F('s:main|speed').value, 2.5);
  assert.strictEqual(F('s:main|speed').min, 0); assert.strictEqual(F('s:main|speed').max, 5);
  assert.strictEqual(F('s:main|glow').label, 'Glow amount');
  assert.deepStrictEqual(F('s:main|mode').options, ['soft', 'hard']);
  assert.strictEqual(F('s:main|tint').kind, 'color');
  assert.strictEqual(F('s:main|count').step, 1);
  // colors first among the sliders
  const sl = fields.filter(C.isSlider); assert.strictEqual(sl[0].kind, 'color');
});
const t = C.make(SCENE, fields, { name: 'Neon title', at: 1700000000000 });
ok('make: a portable template (no MIDI mapping, no selection, no precomp layer, palette cleaned)', () => {
  assert.strictEqual(t.format, C.FORMAT); assert.ok(/^neon-title-/.test(t.id));
  assert.ok(!t.scene.extras.midi && !t.scene.extras.selectedLayer);
  assert.strictEqual(t.scene.layers.length, 2);
  assert.deepStrictEqual(t.scene.palette, ['#112233', '#ff8800']);
  assert.strictEqual(C.check(t).ok, true);
});
ok('apply with no values: the scene as the template keeps it (the live slider value written in)', () => {
  const r = C.apply(t, {}, { scan: T.scan, applyValues: T.applyValues });
  assert.deepStrictEqual(r.changed, []);
  assert.ok(r.layers[0].code.includes('speed: [2.5, 0, 5]'), r.layers[0].code.split('\n')[0]);
  assert.strictEqual(r.layers[1].code, TITLE);
  assert.strictEqual(r.extras.media.path, '/music/song.mp3');
});
ok('apply with values: sliders in the code, the words, the palette, a new picture for the reference, a new song', () => {
  const r = C.apply(t, { 's:main|speed': 4, 's:main|tint': '#00ff00', 's:main|wire': true, 's:main|mode': 'hard', 's:main|count': 333.7, 's:L2|size': 0.3, 't:L2': 'HELLO "WORLD"', palette: ['#000000', '#ffffff'], 'm:ref:logo': '/new/brand.jpg', 'm:song': '/music/other.wav' }, { scan: T.scan, applyValues: T.applyValues, name: 'My new one' });
  const c0 = r.layers[0].code; const c1 = r.layers[1].code;
  assert.ok(c0.includes('speed: [4, 0, 5]') && c0.includes("tint: '#00ff00'") && c0.includes('wire: true') && c0.includes("value: 'hard'") && c0.includes('value: 334'), c0.split('\n')[0]);
  assert.ok(c0.includes('new THREE.BoxGeometry(1, 2, 3)'), 'the other literals stay');
  assert.ok(c1.includes('value: 0.3') && c1.includes('"text":"HELLO \\"WORLD\\""'), c1);
  assert.deepStrictEqual(r.palette, ['#000000', '#ffffff']);
  const logo = r.refs.find((x) => x.key === 'logo'); assert.strictEqual(logo.path, '/new/brand.jpg'); assert.strictEqual(logo.name, 'brand.jpg');
  assert.strictEqual(r.extras.media.path, '/music/other.wav');
  assert.strictEqual(r.name, 'My new one');
  assert.strictEqual(r.changed.length, 10);
  assert.strictEqual(t.scene.layers[0].code, ORB, 'the template itself is untouched');
});
ok('coerce: numbers clamped to the range, whole where whole, colors as #rrggbb, bad values → the default', () => {
  assert.strictEqual(C.coerce(F('s:main|speed'), 99), 5); assert.strictEqual(C.coerce(F('s:main|speed'), 'x'), 2.5);
  assert.strictEqual(C.coerce(F('s:main|tint'), 'F80'), '#ff8800'); assert.strictEqual(C.coerce(F('s:main|tint'), 'red'), '#ff3cac');
  assert.strictEqual(C.coerce(F('s:main|mode'), 'HARD'), 'hard'); assert.strictEqual(C.coerce(F('s:main|mode'), 'x'), 'soft');
  assert.strictEqual(C.coerce(F('s:main|wire'), 'on'), true);
  assert.deepStrictEqual(C.coerce(F('palette'), '#fff, 000000 nope'), ['#ffffff', '#000000']);
});
ok('values typed in a chat: JSON or key=value, by label / key / id / common words; unknown names listed', () => {
  const a = C.parseValues(t, '{"Title": "YO", "glow amount": 2, "song": "/s.wav", "colors": ["#123456"], "nope": 1}');
  assert.deepStrictEqual(a.values, { 't:L2': 'YO', 's:main|glow': 2, 'm:song': '/s.wav', palette: ['#123456'] });
  assert.deepStrictEqual(a.unknown, ['nope']);
  const b = C.parseValues(t, 'title="Hi, there", speed=3, logo=/x/y.png');
  assert.deepStrictEqual(b.values, { 't:L2': 'Hi, there', 's:main|speed': 3, 'm:ref:logo': '/x/y.png' });
  assert.throws(() => C.parseValues(t, '{broken'), /JSON/);
});
ok('tpl: tokens: media copied into the folder are written as tpl:files/<name>, read back as this computer\'s path', () => {
  const map = C.fileNames(C.mediaPaths(t));
  assert.deepStrictEqual([...map.values()].sort(), ['files/clip.mp4', 'files/logo.png', 'files/m.glb', 'files/song.mp3'], 'every reference travels (a 3D model too), not only the slots');
  const tok = C.tokenize(t, map);
  assert.strictEqual(tok.scene.refs[0].path, 'tpl:files/logo.png'); assert.strictEqual(tok.fields.find((f) => f.id === 'm:song').value, 'tpl:files/song.mp3');
  assert.strictEqual(C.tokenize({ p: '/elsewhere/a.png' }, map).p, '/elsewhere/a.png', 'a path it doesn\'t own stays');
  const mac = C.resolve(tok, '/Users/q/Hearth/data/templates/neon');
  assert.strictEqual(mac.scene.refs[0].path, '/Users/q/Hearth/data/templates/neon/files/logo.png');
  const win = C.resolve(tok, 'C:\\Hearth\\data\\templates\\neon');
  assert.strictEqual(win.scene.extras.media.path, 'C:\\Hearth\\data\\templates\\neon\\files\\song.mp3');
  assert.deepStrictEqual(C.unresolve(win, 'C:\\Hearth\\data\\templates\\neon'), tok, 'and back to tokens');
  assert.strictEqual(C.resolve({ x: 'tpl:files/../../etc' }, '/d').x, '', 'no way out of the folder');
  assert.deepStrictEqual([...C.fileNames(['/a/logo.png', '/b/logo.png'], ['logo.png']).values()], ['files/logo 2.png', 'files/logo 3.png'], 'names already in the folder are kept');
});
ok('check: a damaged or foreign file is refused; a good one is cleaned', () => {
  assert.strictEqual(C.check({ format: 'nope' }).ok, false);
  assert.strictEqual(C.check({ ...t, scene: { layers: [] } }).ok, false);
  assert.strictEqual(C.check({ ...t, v: 99 }).ok, false);
  const c = C.check({ ...t, id: '../x', fields: [...t.fields, null, { id: 1 }] });
  assert.ok(c.ok && /^neon-title-/.test(c.t.id) && c.t.fields.length === t.fields.length);
});
ok('the picker: newest first, search by name, field names and layer names', () => {
  const a = { ...t, name: 'Old one', updatedAt: 1 }; const b = { ...t, name: 'Chrome logo', updatedAt: 3, fields: [] }; const c2 = { ...t, name: 'Neon title', updatedAt: 2 };
  assert.deepStrictEqual(C.search([a, b, c2], '').map((x) => x.name), ['Chrome logo', 'Neon title', 'Old one']);
  assert.deepStrictEqual(C.search([a, b, c2], 'glow').map((x) => x.name), ['Neon title', 'Old one']);
  assert.deepStrictEqual(C.search([a, b, c2], 'chrome').map((x) => x.name), ['Chrome logo']);
  assert.strictEqual(C.describe(t), '1 text · 3 media slots · palette · 8 sliders');
  assert.strictEqual(C.describe(b), 'no fields: the scene as it is');
});

// the .hearthpack round trip (main side, plain Node)
ok('a template travels in a .hearthpack: kind "template", its fields kept, its media packed, then unpacked here', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-tpl-'));
  const data = path.join(tmp, 'data'); fs.mkdirSync(data);
  const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const logo = path.join(tmp, 'logo.png'); fs.writeFileSync(logo, PNG);
  const song = path.join(tmp, 'song.wav'); fs.writeFileSync(song, Buffer.alloc(2048, 1));
  const sc = { ...SCENE, refs: [{ key: 'logo', name: 'logo.png', kind: 'image', path: logo }], extras: { frame: '1:1', media: { path: song } } };
  const tt = C.make(sc, C.extract(sc, { scan: T.scan }), { name: 'Packed one' });
  const packs = require('../packsmain.js');
  packs._set({ dataDir: data });
  const s0 = tt.scene;
  const body = { scenes: [{ key: 'main', sketch: { name: s0.name, layers: s0.layers, code: s0.layers[0].code, palette: s0.palette }, extras: s0.extras, refs: s0.refs }], sequence: null, luts: [], song: { file: song, name: 'song.wav' }, template: { fields: tt.fields, desc: '' } };
  const out = path.join(tmp, 'Packed one.hearthpack');
  const w = await packs.write({ body, meta: { kind: 'template', name: tt.name }, inline: [], thumb: null, out });
  assert.ok(w.ok && w.files === 2, JSON.stringify(w));
  const pv = await packs.peek(out);
  assert.ok(pv.ok, (pv.problems || []).join(' '));
  assert.strictEqual(pv.manifest.kind, 'template');
  assert.strictEqual(pv.manifest.template.fields.length, tt.fields.length);
  assert.ok(/^A template with \d+ fields to fill in/.test(P.describe(pv.manifest)[0]), P.describe(pv.manifest)[0]);
  const u = await packs.unpack(out);
  assert.ok(u.ok, (u.problems || []).join(' '));
  const m = P.rewrite(u.manifest, (s) => { const e = P.entryOfToken(s); return e == null ? s : (u.map[e] || ''); });
  const lf = m.template.fields.find((f) => f.id === 'm:ref:logo');
  assert.ok(lf.value.startsWith(path.join(data, 'assets', 'packs')) && fs.readFileSync(lf.value).equals(PNG), lf.value);
  assert.strictEqual(m.scenes[0].refs[0].path, lf.value, 'the reference and its field point at the same unpacked file');
  assert.strictEqual(m.template.fields.find((f) => f.id === 'm:song').value, m.scenes[0].extras.media.path);
  // a pack that says "template" without fields is refused
  assert.strictEqual(P.checkManifest({ ...pv.manifest, template: null }).ok, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; }
  }
  console.log(`${n}/${tests.length} passed`);
})();
