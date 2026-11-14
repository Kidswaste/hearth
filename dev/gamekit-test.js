// The game kit (round 180, gamekit), the parts that run in Node: a game's saves (gamesavesmain.js), the "Play in"
// window (gamemode-core.js windowPlan), the Game start's layers (gamekit-core.js), the guide's words.
//   node dev/gamekit-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../gamesavesmain');
const C = require('../gamemode-core');
const K = require('../gamekit-core');
const PC = require('../projcreate-core');

(async () => {
  let n = 0;
  const t = async (name, fn) => { await fn(); n += 1; console.log(`✓ ${name}`); };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-gamesaves-'));
  const trashed = [];
  const deps = { trash: async (p) => { trashed.push(p); fs.renameSync(p, `${p}.trashed`); } };
  const game = { kind: 'lab', id: 'smweq/..\\huefy0' };

  await t('a slot is written whole, read back, listed newest first', async () => {
    assert.deepStrictEqual(await S.op(dir, game, { op: 'read', slot: 'slot1' }), { ok: true, data: null, at: null });
    const w = await S.op(dir, game, { op: 'write', slot: 'slot1', data: { hp: 3, items: ['key'] } });
    assert.ok(w.ok && w.bytes > 10);
    await new Promise((r) => setTimeout(r, 5));
    assert.ok((await S.op(dir, game, { op: 'write', slot: 'Boss fight 2', data: [1, 2], note: 'before the boss' })).ok);
    assert.deepStrictEqual((await S.op(dir, game, { op: 'read', slot: 'slot1' })).data, { hp: 3, items: ['key'] });
    const l = (await S.op(dir, game, { op: 'list' })).slots;
    assert.deepStrictEqual(l.map((x) => x.slot), ['Boss fight 2', 'slot1']);
    assert.strictEqual(l[0].note, 'before the boss');
    const d = S.dirOf(dir, game);
    assert.ok(d.startsWith(path.join(dir, 'game-saves')) && !/\.\./.test(path.relative(dir, d)), 'the folder stays inside game-saves');
    assert.deepStrictEqual(fs.readdirSync(path.join(d, 'slots')).sort(), ['Boss fight 2.json', 'slot1.json'], 'no half-written file left');
  });
  await t('a slot\'s name can\'t leave the folder; too big says so', async () => {
    for (const slot of ['../x', 'a/b', '', '.hidden', 'x'.repeat(41), 'a\\b']) assert.strictEqual((await S.op(dir, game, { op: 'write', slot, data: 1 })).ok, false, slot);
    const big = await S.op(dir, game, { op: 'write', slot: 'big', data: 'x'.repeat(S.MAX + 10) });
    assert.ok(!big.ok && /too big/.test(big.why));
  });
  await t('settings: small values with no slot, two writes at once both land', async () => {
    assert.deepStrictEqual(await S.op(dir, game, { op: 'get', key: 'best' }), { ok: true, value: null, has: false });
    await Promise.all([S.op(dir, game, { op: 'set', key: 'best', value: 12 }), S.op(dir, game, { op: 'set', key: 'volume', value: 0.5 })]);
    assert.strictEqual((await S.op(dir, game, { op: 'get', key: 'best' })).value, 12);
    assert.strictEqual((await S.op(dir, game, { op: 'get', key: 'volume' })).value, 0.5);
    await S.op(dir, game, { op: 'set', key: 'best', value: null });
    assert.strictEqual((await S.op(dir, game, { op: 'get', key: 'best' })).has, false);
    assert.deepStrictEqual((await S.op(dir, game, { op: 'list' })).slots.length, 2, 'settings are not a slot');
  });
  await t('deleting goes to the Trash (never unlinked); another game\'s saves are its own', async () => {
    const other = { kind: 'html', path: '/games/clink/index.html' };
    await S.op(dir, other, { op: 'write', slot: 'slot1', data: 'theirs' });
    assert.notStrictEqual(S.gameKey(other), S.gameKey(game));
    assert.strictEqual((await S.op(dir, game, { op: 'remove', slot: 'slot1' }, {})).ok, false, 'no Trash given: nothing is deleted');
    assert.deepStrictEqual(await S.op(dir, game, { op: 'remove', slot: 'slot1' }, deps), { ok: true, removed: true });
    assert.strictEqual(trashed.length, 1);
    assert.deepStrictEqual(await S.op(dir, game, { op: 'remove', slot: 'slot1' }, deps), { ok: true, removed: false });
    assert.deepStrictEqual((await S.op(dir, game, { op: 'reset' }, deps)), { ok: true, removed: true });
    assert.strictEqual(trashed.length, 2);
    assert.deepStrictEqual((await S.op(dir, game, { op: 'list' })).slots, []);
    assert.strictEqual((await S.op(dir, other, { op: 'read', slot: 'slot1' })).data, 'theirs');
  });
  await t('Play in: a window of the screen\'s own pixels, in the middle, never bigger than the screen', async () => {
    const d = { scale: 1, bounds: { x: 0, y: 0, width: 3440, height: 1440 }, workArea: { x: 0, y: 0, width: 3440, height: 1400 } };
    assert.strictEqual(C.windowPlan(d, 'full'), null);
    assert.strictEqual(C.windowPlan(d, 'nonsense'), null);
    const a = C.windowPlan(d, '720');
    assert.deepStrictEqual([a.width, a.height, a.fits], [1280, 720, true]);
    assert.ok(a.x === 1080 && a.y > 0 && a.y + a.height < 1400);
    const hi = C.windowPlan({ scale: 2, workArea: { x: 100, y: 0, width: 1728, height: 1080 } }, '1080');
    assert.deepStrictEqual([hi.width, hi.height], [960, 540], '1920 × 1080 pixels on a 2× screen');
    const small = C.windowPlan({ scale: 1, workArea: { x: 0, y: 0, width: 1366, height: 728 } }, '1080');
    assert.ok(small.width <= 1350 && small.height <= 680 && !small.fits && Math.abs(small.width / small.height - 16 / 9) < 0.01);
  });
  await t('the Game start: four v2 layers that use the kit; the card offers it', async () => {
    const L = K.layers();
    assert.deepStrictEqual(L.map((x) => x.name), ['World', 'Player', 'HUD', 'Game logic']);
    for (const x of L) { assert.ok(/\bexport\s+default\b/.test(x.code) && !/WebGLRenderer|setAnimationLoop|localStorage/.test(x.code), x.name); new Function(x.code.replace(/export default/, 'return')); } // eslint-disable-line no-new-func
    const logic = L[3].code;
    for (const w of ['onStep(', 'input.pressed(', 'input.pad(', 'save.write(', 'save.get(', 'save.start()']) assert.ok(logic.includes(w), w);
    assert.ok(K.isGame({ workspace: { kind: 'game' } }) && !K.isGame({ workspace: {} }) && !K.isGame(null));
    const s = PC.startOf('game');
    assert.ok(s.id === 'game' && s.game === true && PC.STARTS.includes(s));
  });
  await t('the guide: help gamekit teaches input, onStep and save, on demand only (in no prompt)', async () => {
    const g = require('../mcp/three-guide');
    const help = g.help || g.topic || g.guide;
    assert.strictEqual(typeof help, 'function', 'the guide answers by topic');
    const text = String(help('gamekit'));
    for (const w of ['input.held', 'onStep(', 'save.write', 'save.start()', 'F5']) assert.ok(text.includes(w), w);
    for (const a of ['save', 'saves', 'gamepad', 'onstep']) assert.strictEqual(String(help(a)), text, a);
    assert.ok(String(help('games')).includes('help gamekit') && String(help('game')).includes('help gamekit'), 'the games topic names it');
    assert.ok(!g.FULL.includes('input.held') && !g.CORE.includes('gamekit'), 'no prompt carries it');
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${n} groups passed`);
})().catch((err) => { console.error(err); process.exit(1); });
