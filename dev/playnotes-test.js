// ▶ Play's playtest notes (round 62, playnotes62): the pure part (playnotes-core.js: the key, the folder per game, a
// note as stored, the log's add / words / remove / the cap, the lines and the director's draft) and the store
// (playnotesmain.js on a throwaway data folder with a pretend game window: a note → its picture + log.json written
// atomically, read back after a restart, words added, removed, cleared to the test's trash; a log that can't be read is
// never written over), plus the page read (READ) on a pretend page: a Lab scene's saved states and cameras, an HTML
// build's window.game, the frame rate from the performance probe or the budget watch, nothing kept in the page.
//   node dev/playnotes-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const C = require('../playnotes-core');
let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`✓ ${name}`); };

(async () => {
  await t('the key: F8 by default, F1–F10 or a letter with a modifier; never the game\'s or Hearth\'s own', () => {
    assert.strictEqual(C.combo(C.DEFAULT_KEY).text, 'F8');
    assert.strictEqual(C.combo('f9').text, 'F9');
    assert.strictEqual(C.combo('Shift+F7').text, 'Shift+F7');
    assert.strictEqual(C.combo('Ctrl+N').text, 'Ctrl+N');
    assert.strictEqual(C.combo('⌘⇧N').text, 'Shift+Cmd+N');
    for (const bad of ['', 'N', 'F', 'Escape', 'Enter', 'F11', 'F12', 'Ctrl+P', 'Cmd+P', 'Cmd+Q', 'Ctrl+W', 'Space', 'F8+F9']) assert.strictEqual(C.combo(bad), null, bad);
  });
  await t('the key pressed: a note; with Shift added: a note + words; held / other modifiers: nothing', () => {
    const c = C.combo('F8');
    const k = (o) => ({ type: 'keyDown', key: 'F8', code: 'F8', shift: false, alt: false, control: false, meta: false, isAutoRepeat: false, ...o });
    assert.strictEqual(C.matches(c, k()), 'note');
    assert.strictEqual(C.matches(c, k({ shift: true })), 'box');
    assert.strictEqual(C.matches(c, k({ isAutoRepeat: true })), null);
    assert.strictEqual(C.matches(c, k({ type: 'keyUp' })), null);
    assert.strictEqual(C.matches(c, k({ control: true })), null);
    assert.strictEqual(C.matches(c, k({ key: 'F9', code: 'F9' })), null);
    const cn = C.combo('Alt+N');
    assert.strictEqual(C.matches(cn, k({ key: 'ñ', code: 'KeyN', alt: true })), 'note', 'by the key\'s place (a Mac\'s ⌥N types ñ)');
    assert.strictEqual(C.matches(cn, k({ key: 'n', code: 'KeyN' })), null, 'plain N stays the game\'s');
  });
  await t('one folder per game: a Lab scene by its id, an HTML build by its file', () => {
    assert.strictEqual(C.folder('lab:s1abc'), 'lab-s1abc');
    assert.ok(/^html-clink-[0-9a-f]{8}$/.test(C.folder('html:/Users/me/Games/clink/index.html')));
    assert.ok(/^html-coin_run-[0-9a-f]{8}$/.test(C.folder('html:c:\\games\\coin run.html')));
    assert.notStrictEqual(C.folder('html:/a/clink/index.html'), C.folder('html:/b/clink/index.html'));
    assert.strictEqual(C.folder('lab:../../x'), 'lab-x', 'never outside game-cache');
  });
  await t('a note as stored: known fields only, sizes capped, a too-big state kept as a mark', () => {
    const x = C.clean({ id: 'n1/../x', at: 5, session: 3, secs: 42.456, text: 'a'.repeat(3000), shot: '../n1.jpg', state: { game: { score: 3, player: [1, 2, 3] } }, cams: { World: { p: [0, 1, 5], q: [0, 0, 0, 1], z: 1 }, bad: { p: [1, 'x', 2] } }, pos: { x: 1.234, y: 0.5, z: -2, from: 'state' }, perf: { fps: 58.4, ms: 17.1, from: 'watch' }, hz: 60, junk: 1 });
    assert.strictEqual(x.id, 'n1x'); assert.strictEqual(x.shot, '..n1.jpg'.replace(/\//g, '')); assert.strictEqual(x.text.length, 2000); assert.strictEqual(x.secs, 42.46);
    assert.deepStrictEqual(Object.keys(x.cams), ['World']); assert.strictEqual(x.junk, undefined);
    assert.deepStrictEqual(x.pos, { x: 1.23, y: 0.5, z: -2, from: 'state' });
    const big = C.clean({ state: { blob: 'x'.repeat(C.MAX_STATE + 10) } });
    assert.strictEqual(big.state, null); assert.strictEqual(big.stateBig, true);
  });
  await t('the log: add (newest last, the oldest past the cap returned), words, remove, this session\'s', () => {
    let log = C.empty({ key: 'lab:s1', title: 'Clink', kind: 'lab', id: 's1' });
    for (let i = 0; i < C.MAX_NOTES + 3; i += 1) { const r = C.add(log, { id: `n${i}`, at: i, session: i < C.MAX_NOTES ? 1 : 2, shot: `n${i}.jpg` }); log = r.log; if (i >= C.MAX_NOTES) assert.strictEqual(r.dropped[0].id, `n${i - C.MAX_NOTES}`); }
    assert.strictEqual(log.notes.length, C.MAX_NOTES); assert.strictEqual(C.session(log, 2).length, 3);
    assert.strictEqual(C.update(log, 'n1', { text: 'the jump clips' }), null, 'dropped');
    assert.strictEqual(C.update(log, 'n10', { text: 'the jump' }).text, 'the jump');
    assert.strictEqual(C.update(log, 'n10', { text: 'clips', append: true }).text, 'the jump clips');
    assert.strictEqual(C.remove(log, 'n10').id, 'n10'); assert.strictEqual(C.remove(log, 'n10'), null);
    const L = C.list(log); assert.strictEqual(L[0].i, 1); assert.ok(!('state' in L[0]), 'no state bodies in the list');
  });
  await t('the words: a line per note, the director\'s draft (a task: "Fix this"), numbers kept short', () => {
    const note = C.clean({ secs: 102, text: 'the jump clips through the ledge', perf: { fps: 41.2, ms: 24.3, worst: 80, from: 'perf' }, hz: 240, pos: { x: 3.14, y: 0.4, z: -2, from: 'state' }, state: { game: { score: 12, level: 3, player: { position: [3.14, 0.4, -2] } } } });
    assert.strictEqual(C.clock(102), '1:42'); assert.strictEqual(C.clock(0), '0:00');
    assert.strictEqual(C.line(note), '1:42 · 41 fps (24.3 ms) · worst 80 ms · player 3.1, 0.4, -2 · “the jump clips through the ledge”');
    const d = C.draft(note, { title: 'Clink' });
    assert.ok(d.startsWith('Playtest note from Clink in ▶ Play, 1:42 in (41 fps (24.3 ms) on 240 Hz · worst 80 ms · player 3.1, 0.4, -2):'), d);
    assert.ok(/game\.score 12 · game\.level 3 · game\.player\.position 3\.1,0\.4,-2/.test(d), d);
    assert.ok(d.endsWith('Fix this.'));
    assert.ok(C.sameState({ a: [1, 2.0000001], b: { c: 'x' } }, { a: [1, 2], b: { c: 'x' } }));
    assert.ok(!C.sameState({ a: 1 }, { a: 1, b: 2 }));
  });

  // ---------- the page read: one expression, nothing left behind ----------
  const M = require('../playnotesmain');
  const run = (W) => { const ctx = vm.createContext({ window: W, performance: { now: () => 1000 }, Node: function Node() {}, ArrayBuffer, Object, Array, JSON, Map, Set, WeakMap, WeakSet, String, Math, isFinite }); for (const k of Object.keys(W)) ctx[k] = W[k]; W.window = W; return JSON.parse(vm.runInContext(M.READ, ctx)); };
  const v3 = (x, y, z) => ({ x, y, z, isVector3: true, toArray: () => [x, y, z] });
  const cam = (x, y, z) => ({ isCamera: true, position: v3(x, y, z), quaternion: { toArray: () => [0, 0, 0, 1] }, zoom: 1 });
  await t('the page read, a Lab scene: the layers\' saved states, their cameras, the player, the probe\'s frame rate', () => {
    const before = Object.keys({});
    const W = { __labHot: { save: () => ({ game: { score: 42, player: { position: [1, 0.4, -3] } }, spin: { n: 5 } }) }, __scenes: { World: { camera: cam(0, 2, 6) } }, __gamePerf: { recent: (k) => ({ fps: 59.8, ms: 16.7, worst: 21, frames: k, from: 'perf' }) }, __hearthBudget: { pace: () => ({ fps: 30, ms: 33, from: 'watch' }) } };
    const r = run(W);
    assert.strictEqual(r.kind, 'lab'); assert.deepStrictEqual(r.state.game.score, 42);
    assert.deepStrictEqual(r.pos, { x: 1, y: 0.4, z: -3, from: 'state' });
    assert.deepStrictEqual(r.cams.World.p, [0, 2, 6]);
    assert.strictEqual(r.perf.from, 'perf'); assert.strictEqual(r.perf.frames, 60);
    assert.deepStrictEqual(Object.keys(W).filter((k) => !k.startsWith('__') && k !== 'window'), before, 'nothing kept in the page');
  });
  await t('the page read, an HTML build: window.game, the camera as the position, the watch\'s frame rate', () => {
    const player = { isObject3D: true, position: v3(2, 0.4, 1), quaternion: { toArray: () => [0, 0, 0, 1] } };
    const r = run({ __game: { score: 3, keys: { KeyW: true }, player, fn: () => 1 }, camera: cam(1, 5, 9), __hearthBudget: { pace: () => ({ fps: 120.5, ms: 8.3, frames: 121, from: 'watch' }) } });
    assert.strictEqual(r.kind, 'html'); assert.strictEqual(r.from, '__game'); assert.strictEqual(r.state.score, 3);
    assert.deepStrictEqual(r.state.player, { position: [2, 0.4, 1], quaternion: [0, 0, 0, 1] });
    assert.ok(!('fn' in r.state)); assert.deepStrictEqual(r.pos, { x: 2, y: 0.4, z: 1, from: 'state' });
    assert.deepStrictEqual(r.cams.camera.p, [1, 5, 9]); assert.strictEqual(r.perf.from, 'watch'); assert.strictEqual(r.restore, false);
    const none = run({ camera: cam(1, 5, 9) });
    assert.strictEqual(none.state, undefined); assert.deepStrictEqual(none.pos, { x: 1, y: 5, z: 9, from: 'camera' });
  });

  // ---------- the store (playnotesmain.js) on a throwaway data folder ----------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playnotes-test-'));
  process.env.HEARTH_TEST_SAVE_DIR = path.join(dir, 'save');
  const sent = { game: [], hub: [] };
  const src = { kind: 'lab', id: 's1clink', title: 'Clink' };
  const page = { score: 7 };
  const fakeImg = { isEmpty: () => false, getSize: () => ({ width: 1920, height: 1080 }), resize: ({ width }) => ({ ...fakeImg, getSize: () => ({ width, height: Math.round((width * 9) / 16) }), toJPEG: () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }), toJPEG: () => Buffer.from([0xff, 0xd8]) };
  const wc = { send: (ch, d) => sent.game.push([ch, d]), capturePage: async () => fakeImg, executeJavaScript: async () => JSON.stringify({ kind: 'lab', state: { game: { score: page.score } }, cams: { World: { p: [0, 2, 6], q: [0, 0, 0, 1], z: 1 } }, pos: { x: 1, y: 0, z: 2, from: 'state' }, perf: { fps: 60, ms: 16.7, from: 'watch' }, readMs: 0.4 }) };
  const T0 = Date.now();
  const game = { win: { isDestroyed: () => false, webContents: wc }, source: src, started: T0, hz: 60 };
  const hub = { isDestroyed: () => false, webContents: { send: (ch, d) => sent.hub.push([ch, d]) } };
  let G = game;
  M.init({ dataDir: dir }); M.register({ ctx: () => ({ getWin: () => hub }), game: () => G });
  const ndir = path.join(dir, 'game-cache', 'lab-s1clink', 'notes');
  await t('the key in the window: F8 → a note (its picture, the state, the camera, the frame rate), the game doesn\'t get it', async () => {
    assert.strictEqual(M.arm({ key: 'F8', label: 'F8' }), 'F8');
    let prevented = 0; const e = { preventDefault: () => { prevented += 1; } };
    assert.strictEqual(M.key(e, { type: 'keyDown', key: 'w', code: 'KeyW' }), false, 'the game\'s keys pass');
    assert.strictEqual(M.key(e, { type: 'keyDown', key: 'F8', code: 'F8' }), true); assert.strictEqual(prevented, 1);
    for (let i = 0; i < 40 && !fs.existsSync(path.join(ndir, 'log.json')); i += 1) await new Promise((r) => setTimeout(r, 25));
    const log = JSON.parse(fs.readFileSync(path.join(ndir, 'log.json'), 'utf8'));
    assert.strictEqual(log.notes.length, 1); const nt = log.notes[0];
    assert.strictEqual(nt.session, T0); assert.deepStrictEqual(nt.state, { game: { score: 7 } }); assert.strictEqual(nt.w, 1280); assert.strictEqual(nt.h, 720);
    assert.ok(fs.existsSync(path.join(ndir, nt.shot)), 'the picture'); assert.deepStrictEqual(nt.cams.World.p, [0, 2, 6]); assert.strictEqual(nt.perf.fps, 60);
    assert.ok(!fs.readdirSync(ndir).some((f) => /tmp|\.part/.test(f)), 'atomic: no temp file left');
    assert.ok(sent.game.some(([ch, d]) => ch === 'game:note' && /Note 1/.test(d.text)));
    assert.ok(sent.hub.some(([ch, d]) => ch === 'game:notes-ev' && d.type === 'added' && d.n === 1 && d.note.canJump));
  });
  await t('Shift+F8: a note + the words box; its keys stay in it (Esc closes it, F isn\'t the chip), Enter\'s words kept', async () => {
    page.score = 9;
    const e = { preventDefault: () => {} };
    M.key(e, { type: 'keyDown', key: 'F8', code: 'F8', shift: true });
    for (let i = 0; i < 40 && !M._test.S.box; i += 1) await new Promise((r) => setTimeout(r, 25));
    const box = sent.game.find(([ch, d]) => ch === 'game:note-box' && d.open);
    assert.ok(box, 'box opened');
    assert.strictEqual(M.key(e, { type: 'keyDown', key: 'f', code: 'KeyF' }), true, 'F is typed into the box, not the chip');
    M.onText({ sender: wc }, { id: box[1].id, text: 'enemy spawns inside the wall', close: true });
    assert.strictEqual(M._test.S.box, null);
    const r = await M.op({ op: 'list', source: src });
    assert.strictEqual(r.notes.length, 2); assert.strictEqual(r.notes[1].text, 'enemy spawns inside the wall');
    M.onText({ sender: {} }, { id: box[1].id, text: 'from elsewhere' });
    assert.strictEqual((await M.op({ op: 'list', source: src })).notes[1].text, 'enemy spawns inside the wall', 'only the game window\'s box');
  });
  await t('the hub: the list, a note in full (to jump), words (voice: appended), a picture, read back after a restart', async () => {
    const L = (await M.op({ op: 'list', source: src })).notes;
    const g = await M.op({ op: 'get', source: src, id: L[0].id });
    assert.deepStrictEqual(g.note.state, { game: { score: 7 } });
    await M.op({ op: 'text', source: src, id: L[0].id, text: 'too dark', append: true });
    assert.strictEqual((await M.op({ op: 'text', source: src, id: L[0].id, text: 'here', append: true })).text, 'too dark here');
    const p = await M.op({ op: 'shot', source: src, id: L[0].id, path: true });
    assert.ok(p.ok && p.path.startsWith(ndir));
    M.init({ dataDir: path.join(dir, 'elsewhere') }); M.init({ dataDir: dir }); // (read again from the disk)
    const again = await M.op({ op: 'list', source: src });
    assert.strictEqual(again.notes.length, 2); assert.strictEqual(again.notes[0].text, 'too dark here');
    assert.strictEqual(again.notes[0].line, '0:00 · 60 fps (16.7 ms) · player 1, 0, 2 · “too dark here”');
  });
  await t('remove: the note and its picture (to the trash); clear: the game\'s notes to the trash, nothing else touched', async () => {
    const other = { kind: 'html', path: path.join(dir, 'coin', 'index.html'), title: 'Coin Run' };
    fs.mkdirSync(path.dirname(other.path), { recursive: true }); fs.writeFileSync(other.path, '<!doctype html>');
    G = { ...game, source: other, started: T0 + 5 };
    await M.take({});
    G = game;
    const L = (await M.op({ op: 'list', source: src })).notes;
    assert.ok((await M.op({ op: 'remove', source: src, id: L[0].id })).ok);
    assert.ok(!fs.existsSync(path.join(ndir, `${L[0].id}.jpg`)));
    const c = await M.op({ op: 'clear', source: src });
    assert.strictEqual(c.n, 1); assert.ok(String(c.where).includes('playnotes-trash'));
    assert.ok(!fs.existsSync(ndir)); assert.strictEqual((await M.op({ op: 'list', source: src })).notes.length, 0);
    assert.strictEqual((await M.op({ op: 'list', source: other })).notes.length, 1, 'the other game\'s notes stay');
    assert.ok(fs.readFileSync(other.path, 'utf8') === '<!doctype html>', 'the game\'s own files untouched');
  });
  await t('a log that can\'t be read is never written over (the note says so, nothing saved)', async () => {
    fs.mkdirSync(ndir, { recursive: true });
    fs.writeFileSync(path.join(ndir, 'log.json'), '{ broken');
    M.init({ dataDir: path.join(dir, 'x') }); M.init({ dataDir: dir });
    const r = await M.take({});
    assert.strictEqual(r.ok, true); assert.strictEqual(r.saved, false);
    assert.strictEqual(fs.readFileSync(path.join(ndir, 'log.json'), 'utf8'), '{ broken');
    assert.strictEqual((await M.op({ op: 'clear', source: src })).ok, false);
    assert.ok(/couldn't be read/.test(sent.game.filter(([ch]) => ch === 'game:note').pop()[1].text));
  });
  await t('the key changed from the hub; a key that isn\'t one is refused', async () => {
    assert.deepStrictEqual(await M.op({ op: 'key', key: 'F9' }), { ok: true, key: 'F9' });
    const e = { preventDefault: () => {} };
    assert.strictEqual(M.key(e, { type: 'keyDown', key: 'F8', code: 'F8' }), false);
    assert.strictEqual((await M.op({ op: 'key', key: 'W' })).ok, false);
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
