// (round 97, labproj97) Node tests: a project's Lab work in a .hearthproject and in ⧉ Duplicate project, on throwaway
// folders only (dev/checks/labproj97.js is the same in the app, two profiles).
//   - labproj-core.js: a scene's part (History, its song's ⚡ bars and loop, a pin, a sequence pick), fresh ids (History
//     keys follow the scene, the sequence pick its sequence, another scene's versions never ride along), its shape
//     checked, the cards' counts, songs compared as Windows and the Mac do (\ or /, any case), History's file name and
//     join exactly scenesafe-core.js's, a song in Hearth's own folder told from the owner's music
//   - scenesafe-core.js refShared: a reference's file still used by another scene (or a song) is never trashed
//   - projbundle-core.js: remap carries the Lab part; checkBody refuses a broken one; the secrets scrub reaches History
//   - projbundlemain.js: export → peek (the card says History / bars / pin) → unpack: the song packed once, its bars and
//     loop under the unpacked song's path (the same text as the scene's song), History whole, a song missing on the
//     computer it came from named (never silently dropped); entry names have only "/" (a bundle made on Windows opens on
//     a Mac)
//   node dev/labproj97-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const LP = require(path.join(__dirname, '..', 'labproj-core.js'));
const SS = require(path.join(__dirname, '..', 'scenesafe-core.js'));
const C = require(path.join(__dirname, '..', 'projbundle-core.js'));
const M = require(path.join(__dirname, '..', 'projbundlemain.js'));
const zipkit = require(path.join(__dirname, '..', 'zipkit.js'));

let n = 0; let failed = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const TMP = require('./tmp-own').mkdtemp('lp97-');
const SRC = path.join(TMP, 'pc'); const DATA = path.join(TMP, 'data');
fs.mkdirSync(path.join(SRC, 'refs'), { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
M._set({ dataDir: DATA });
const w = (rel, data) => { const p = path.join(SRC, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
const sha = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

// ---------- labproj-core ----------
ok('songKey: the same text first, else the same file written the other system\'s way (\\ or /, any case)', () => {
  const m = { '/Users/q/Music/Song.wav': 1, 'C:\\Users\\Q\\Music\\Beat.MP3': 2 };
  assert.strictEqual(LP.songKey(m, '/Users/q/Music/Song.wav'), '/Users/q/Music/Song.wav');
  assert.strictEqual(LP.songKey(m, 'c:/users/q/music/beat.mp3'), 'C:\\Users\\Q\\Music\\Beat.MP3');
  assert.strictEqual(LP.songKey(m, '/Users/q/Music/Other.wav'), null);
  assert.strictEqual(LP.songKey(null, '/x.wav'), null);
});
ok('History\'s file name and join are scenesafe-core.js\'s own (on 500 ids and random versions)', () => {
  for (let i = 0; i < 500; i += 1) { const id = i % 3 ? `s${crypto.randomBytes(5).toString('hex')}` : `Sc${crypto.randomBytes(4).toString('base64').replace(/[^\w]/g, 'x')}`; assert.strictEqual(LP.histSegName(id), SS.histSegName(id), id); }
  const rnd = () => Object.fromEntries(['s1', 's1:l2'].map((k) => [k, Array.from({ length: 30 }, (_, j) => ({ at: Math.floor(Math.random() * 1000), code: `c${j % 12}` }))]));
  for (let i = 0; i < 50; i += 1) { const a = rnd(); const b = rnd(); assert.deepStrictEqual(LP.histJoin(a, b), SS.histJoin(a, b)); }
});
ok('sceneLab: History (its scene\'s keys only), the pin, the sequence pick, its song\'s bars and loop (found the Windows way)', () => {
  const versions = { s1: [{ at: 2, code: 'b' }, { at: 1, code: 'a' }], 's1:l2': [{ at: 3, code: 'x' }], s10: [{ at: 1, code: 'other' }] };
  const lab = LP.sceneLab({ id: 's1', song: 'C:\\Music\\Song.wav', versions, pins: ['s1'], bySong: { 'c:/music/song.wav': { kick: { lo: 41 } } }, loopOf: (p) => (p === 'C:\\Music\\Song.wav' ? { a: 1, b: 3 } : null), seqpick: { s1: 'seq:Intro' } });
  assert.deepStrictEqual(Object.keys(lab.history).sort(), ['s1', 's1:l2']);
  assert.strictEqual(lab.pinned, true); assert.strictEqual(lab.seqpick, 'seq:Intro');
  assert.deepStrictEqual(lab.song, { path: 'C:\\Music\\Song.wav', triggers: { kick: { lo: 41 } }, loop: { a: 1, b: 3 } });
  assert.strictEqual(LP.sceneLab({ id: 's2', versions, pins: [], bySong: {}, seqpick: {} }), null, 'nothing of its own: no part');
  assert.strictEqual(LP.sceneLab({ id: 's2', song: 'scene:s2', bySong: { 'scene:s2': {} } }), null, 'a scene\'s own timeline is no song');
});
ok('remapLab: History follows the scene (layers keep their ids), another scene\'s versions never ride along, the sequence pick follows its sequence', () => {
  const lab = { history: { s1: [{ at: 1, code: 'a' }], 's1:L7': [{ at: 1, code: 'b' }], s10: [{ at: 1, code: 'x' }] }, pinned: true, seqpick: 'seq:Intro' };
  const r = LP.remapLab(lab, 's1', 'snew', new Map([['seq:Intro', 'seq:Intro copy']]));
  assert.deepStrictEqual(Object.keys(r.history).sort(), ['snew', 'snew:L7']);
  assert.strictEqual(r.seqpick, 'seq:Intro copy');
  assert.strictEqual(LP.remapLab(lab, 's1', 'snew', new Map()).seqpick, undefined, 'a sequence that didn\'t come: no pick');
  assert.ok(lab.history.s1, 'the original part is never changed');
});
ok('checkLab: a broken or oversized part is refused before the card', () => {
  assert.deepStrictEqual(LP.checkLab({ history: { s: [{ at: 1, code: 'a' }] }, pinned: true, seqpick: 'seq:x', song: { path: '/a.wav', triggers: {}, loop: { a: 1 } } }), []);
  assert.ok(LP.checkLab('x').length);
  assert.ok(LP.checkLab({ history: { s: 'no' } }).length);
  assert.ok(LP.checkLab({ history: { s: Array.from({ length: 41 }, () => ({ code: '' })) } }).length, 'more than 40 versions');
  assert.ok(LP.checkLab({ history: { s: [{ code: 'x'.repeat(100) }] } }, { code: 50 }).length, 'code too big');
  assert.ok(LP.checkLab({ seqpick: 'no' }).length && LP.checkLab({ pinned: 'yes' }).length && LP.checkLab({ song: { path: 3 } }).length);
});
ok('ownSong: a song kept with a scene (refs/) or come in a project file is Hearth\'s copy; the owner\'s music isn\'t (Mac and Windows)', () => {
  assert.ok(LP.ownSong('/Users/q/Library/Application Support/Hearth/data/refs/1700000000000-a.wav', '/Users/q/Library/Application Support/Hearth/data'));
  assert.ok(LP.ownSong('C:\\Users\\Q\\Hearth\\data\\assets\\projects\\Labtrip\\assets\\0\\a.wav', 'c:\\users\\q\\hearth\\data'));
  assert.ok(!LP.ownSong('/Users/q/Music/a.wav', '/Users/q/Library/Application Support/Hearth/data'));
  assert.ok(!LP.ownSong('/Users/q/Library/Application Support/Hearth/data-old/refs/a.wav', '/Users/q/Library/Application Support/Hearth/data'));
  assert.ok(!LP.ownSong('scene:s1', '/d'));
});
ok('refShared: a file another scene\'s reference or a song still uses is kept; the last user\'s goes', () => {
  const r1 = { id: 'r1', path: '/d/refs/1-brick.png' }; const r2 = { id: 'r2', path: '/d/refs/1-brick.png' };
  assert.ok(SS.refShared(r1.path, { refsAll: { a: [r1], b: [r2] }, except: r1 }));
  assert.ok(!SS.refShared(r1.path, { refsAll: { a: [r1] }, except: r1 }));
  assert.ok(!SS.refShared(r1.path, { refsAll: { a: [] } }));
  assert.ok(SS.refShared('C:\\D\\refs\\1-Song.wav', { refsAll: {}, extras: { s: { media: { path: 'c:/d/refs/1-song.wav' } } } }));
  assert.ok(!SS.refShared('', {}));
});

// ---------- projbundle-core ----------
const SONG = w('refs/1700000000000-Labtrip song.wav', Buffer.concat([Buffer.from('RIFF'), crypto.randomBytes(30000)]));
const PNG = w('refs/1700000000001-brick.png', crypto.randomBytes(2000));
const body = () => ({
  project: { id: 'p1', name: 'Labtrip', items: [{ id: 'scene:s1', type: 'scene', ref: 's1', name: 'Labtrip' }, { id: 'scene:s2', type: 'scene', ref: 's2', name: 'Night' }, { id: 'seq:s1', type: 'seq', ref: 's1', name: 'Intro' }] },
  scenes: [
    { id: 's1', sketch: { id: 's1', name: 'Labtrip', code: '// a', layers: [{ id: 'L1', code: '// a' }, { id: 'L2', code: '// glow' }] }, extras: { media: { path: SONG } }, refs: [{ id: 'r1', key: 'brick', name: 'brick.png', kind: 'image', path: PNG, size: 2000 }], notes: [], thumb: { url: 'data:image/jpeg;base64,AAAA', at: 1 }, maps: { [SONG]: { bpm: 120 } },
      lab: { history: { s1: [{ at: 3, code: `// v2 ${KEY}` }, { at: 2, code: '// v1' }], 's1:L2': [{ at: 1, code: '// glow v1' }] }, seqpick: 'seq:Intro', song: { path: SONG, triggers: { kick: { on: true, lo: 41, hi: 120 } }, loop: { a: 1, b: 3, locked: false } } } },
    { id: 's2', sketch: { id: 's2', name: 'Night', code: '// night' }, extras: null, refs: [], notes: [], thumb: { url: 'data:image/jpeg;base64,BBBB', at: 1 }, maps: {}, lab: { pinned: true } },
  ],
  sequences: [{ key: 'seq:Intro', edit: { seq: { scene: 's1', name: 'Intro' }, clips: [] } }], boards: [], chats: [], workbench: null, files: [],
});
ok('remap: History keys, the sequence pick and the pin follow the fresh ids (Duplicate: " copy")', () => {
  const { body: b, map } = C.remap(body(), { suffix: ' copy' });
  const s1 = b.scenes.find((s) => s.sketch.name === 'Labtrip copy');
  const nid = map.scene.get('s1');
  assert.deepStrictEqual(Object.keys(s1.lab.history).sort(), [nid, `${nid}:L2`].sort());
  assert.strictEqual(s1.lab.seqpick, b.sequences[0].key); assert.strictEqual(b.sequences[0].key, 'seq:Intro copy');
  assert.strictEqual(b.scenes.find((s) => s.sketch.name === 'Night copy').lab.pinned, true);
  assert.strictEqual(s1.lab.song.path, s1.extras.media.path);
});
ok('checkBody refuses a broken Lab part; prepare scrubs a key out of History; the card says what Lab work comes', () => {
  assert.ok(C.checkBody(body()).ok);
  const bad = body(); bad.scenes[0].lab.history.s1 = 'nope';
  const cb = C.checkBody(bad); assert.ok(!cb.ok && /History/.test(cb.problems.join()), cb.problems.join());
  const p = C.prepare(body());
  assert.ok(!JSON.stringify(p.body).includes(KEY) && p.secrets >= 1);
  const s = C.summarize(body());
  assert.deepStrictEqual([s.versions, s.songBars, s.pinned], [3, 1, 1]);
  assert.ok(C.describe({}, s).some((l) => /History \(3 versions\) · ⚡ trigger bars for 1 song · 1 pinned scene/.test(l)), C.describe({}, s).join(' | '));
});

// ---------- projbundlemain: the file ----------
const OUT = path.join(TMP, 'out'); fs.mkdirSync(OUT);
let file = null;
ok('export → peek → unpack: the song packed once, its bars and loop under the unpacked song (the scene\'s own path), History whole, files byte-identical', async () => {
  const prepared = C.prepare(body());
  const r = await M.exportBundle({ body: prepared.body, name: 'Labtrip', job: 'lp1', leftOut: prepared.leftOut, secrets: prepared.secrets, out: path.join(OUT, 'Labtrip.hearthproject') });
  assert.ok(r.ok, JSON.stringify(r)); file = r.path;
  const names = await zipkit.names(file);
  assert.strictEqual(names.filter((x) => /Labtrip song\.wav$/.test(x)).length, 1, names.join(' '));
  assert.ok(names.every((x) => !x.includes('\\')), 'entry names use "/" only (a Windows-made file opens on a Mac)');
  assert.ok(!fs.readFileSync(file).includes(Buffer.from(KEY)));
  const pv = await M.peek(file);
  assert.ok(pv.ok && pv.lines.some((l) => /History \(3 versions\)/.test(l)), pv.lines.join(' | '));
  const u = await M.unpack({ file, job: 'lp2' });
  assert.ok(u.ok, JSON.stringify(u.problems)); assert.deepStrictEqual(u.skipped, []);
  const { body: b } = C.remap(u.body);
  const s1 = b.scenes.find((s) => s.sketch.name === 'Labtrip');
  assert.ok(s1.extras.media.path.startsWith(u.dir) && s1.lab.song.path === s1.extras.media.path, s1.lab.song.path);
  assert.strictEqual(sha(s1.extras.media.path), sha(SONG));
  assert.deepStrictEqual(s1.lab.song.triggers, { kick: { on: true, lo: 41, hi: 120 } }); assert.strictEqual(s1.lab.song.loop.a, 1);
  assert.ok(s1.maps[s1.extras.media.path], 'the beat map follows too');
  assert.deepStrictEqual(Object.values(s1.lab.history).map((l) => l.length).sort(), [1, 2]);
  assert.ok(Object.keys(s1.lab.history).every((k) => k.split(':')[0] === s1.id));
  assert.strictEqual(b.scenes.find((s) => s.sketch.name === 'Night').lab.pinned, true);
  assert.strictEqual(sha(s1.refs[0].path), sha(PNG));
});
ok('a song missing on the computer it came from: named in the file\'s "skipped", its path left empty (the window names its bars), never silently dropped', async () => {
  const b = body(); const gone = path.join(SRC, 'refs', '1700000000009-gone.wav');
  b.scenes[0].extras.media.path = gone; b.scenes[0].lab.song.path = gone; b.scenes[0].maps = {};
  const r = await M.exportBundle({ body: C.prepare(b).body, name: 'Gone', job: 'lp3', out: path.join(OUT, 'Gone.hearthproject') });
  assert.ok(r.ok && r.skipped.some((x) => /gone\.wav/.test(x)), JSON.stringify(r.skipped));
  const pv = await M.peek(r.path);
  assert.ok(pv.lines.some((l) => /gone\.wav/.test(l)), pv.lines.join(' | '));
  const u = await M.unpack({ file: r.path, job: 'lp4' });
  const s1 = u.body.scenes.find((s) => s.sketch.name === 'Labtrip');
  assert.ok(!s1.extras.media.path && !s1.lab.song.path && s1.lab.song.triggers, 'the bars arrive; the window says their song wasn\'t in the file');
});

(async () => {
  for (const [name, fn] of tests) {
    n += 1;
    try { await fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${String(err.stack).split('\n').slice(0, 5).join('\n  ')}`); }
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
