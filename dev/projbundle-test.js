// Node tests for project bundles (round 75, projbundle75): projbundle-core.js (names, checks, secrets, fresh ids,
// canon) and projbundlemain.js (the streamed zip, peek, unpack) on throwaway folders:
//   - round trip: a project with scenes (layers, extras, references, notes, still, cues), a sequence, a board, two
//     chats (one linked to a scene, one to the board), the worktable, a capture and a folder → export → peek → unpack →
//     fresh ids → the same project (deep compare minus ids, paths by file name), every file byte-identical
//   - streamed: media and big files stored (not recompressed), text deflated; a cancel mid-file leaves nothing
//   - secrets: API keys in chats / keys named like secrets / key files / dotfiles never go in
//   - malicious zips: zip-slip names (.., absolute, drive, backslash, reserved), duplicates, a size lie (zip bomb),
//     a bad CRC, an encrypted entry, a newer version, a broken body, a missing manifest: refused before anything is
//     written (or the one damaged file skipped and named), nothing outside data/assets/projects ever written
//   node dev/projbundle-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const C = require(path.join(__dirname, '..', 'projbundle-core.js'));
const M = require(path.join(__dirname, '..', 'projbundlemain.js'));
const zipkit = require(path.join(__dirname, '..', 'zipkit.js'));

let n = 0; let failed = 0; let fileN = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'projbundle-test-'));
const SRC = path.join(TMP, 'owner'); // the owner's own files (read only)
const DATA = path.join(TMP, 'data'); // Hearth's data folder
fs.mkdirSync(SRC, { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
M._set({ dataDir: DATA });
const sha = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
const w = (rel, data) => { const p = path.join(SRC, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };

// ---------- a project, as projbundle.js gather() makes it ----------
const PNG = w('textures/brick.png', crypto.randomBytes(3000));
const SONG = w('music/song.wav', Buffer.concat([Buffer.from('RIFF'), crypto.randomBytes(200000)]));
const BOARDPIC = w('board/media/pic.jpg', crypto.randomBytes(5000));
const ATTACH = w('attachments/notes.txt', 'line one\n'.repeat(2000));
const CAPTURE = w('captures/shot 1.png', crypto.randomBytes(4000));
const FOLDER = path.join(SRC, 'Stoop site');
w('Stoop site/index.html', '<h1>hi</h1>'.repeat(300)); w('Stoop site/css/site.css', 'body{}'.repeat(100)); w('Stoop site/.env', 'SECRET=1'); w('Stoop site/api.key', 'k'); w('Stoop site/node_modules/x/i.js', 'x');
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
function project() {
  return {
    project: { id: 'pjold1', name: 'Stoop Ronin', ident: { ci: 2, gi: 3, color: '#a970ff', glyph: '●' }, status: 'active', notes: 'for the launch', from: 'hand', make: 'mk1', cover: 'scene:s1', at: 1000, updated: 2000, opened: 3000,
      items: [
        { id: 'chat:claude-c1', type: 'chat', ref: 'claude-c1', name: 'Stoop · Lab', at: 1 },
        { id: 'chat:codex-c2', type: 'chat', ref: 'codex-c2', name: 'Stoop · Notes', at: 2 },
        { id: 'scene:s1', type: 'scene', ref: 's1', name: 'Katana', at: 3 },
        { id: 'scene:s2', type: 'scene', ref: 's2', name: 'Dusk', at: 4 },
        { id: 'seq:s1', type: 'seq', ref: 's1', name: 'Katana sequence', at: 5 },
        { id: 'board:b1', type: 'board', ref: 'b1', name: 'Moodboard', at: 6 },
        { id: `capture:${CAPTURE}`, type: 'capture', ref: CAPTURE, name: 'shot 1.png', at: 7 },
        { id: `file:${FOLDER}`, type: 'file', ref: FOLDER, name: 'Stoop site', at: 8 },
      ],
      workspace: { v: 1, persona: 'director', plugins: ['Vital'], chatId: 'claude-c1', sceneId: 's1', boardId: 'b1', description: 'A katana scene' } },
    scenes: [
      { id: 's1', sketch: { id: 's1', name: 'Katana', code: 'const a = 1;', updatedAt: 50, layers: [{ id: 'main', name: 'Blade', code: 'tweak({ speed: { value: 1 } })' }, { id: 'L2', name: 'Glow', code: '// glow' }], palette: ['#ff3366'] },
        extras: { media: { path: SONG, time: 0 }, frame: '9:16', looks: [{ name: 'Hot', values: [1] }] },
        refs: [{ id: 'r1', key: 'brick', name: 'brick.png', kind: 'image', path: PNG, size: 3000, at: 9, src: '/Users/other/Desktop/brick.png' }],
        notes: [{ id: 'n1', t: 1.5, text: 'more glow here' }], thumb: { url: 'data:image/jpeg;base64,AAAA', at: 1 },
        maps: { 'scene:s1': { cues: [{ t: 1 }], marks: {} }, [SONG]: { grid: { bpm: 120 }, cues: [] } } },
      { id: 's2', sketch: { id: 's2', name: 'Dusk', code: 'const b = 2;', updatedAt: 60 }, extras: null, refs: [], notes: [], thumb: null, maps: {} },
    ],
    sequences: [{ key: 'seq:Katana sequence', edit: { seq: { scene: 's1', name: 'Katana sequence' }, clips: [{ id: 'k1', kind: 'scene', sketch: 's1', dur: 2 }, { id: 'k2', kind: 'scene', sketch: 's2', dur: 3 }, { id: 'k3', kind: 'scene', sketch: 'elsewhere', dur: 1 }] } }],
    boards: [{ id: 'b1', board: { id: 'b1', name: 'Moodboard', items: [{ id: 'i1', type: 'image', src: BOARDPIC, x: 0, y: 0 }], chats: ['codex-c2'], view: { x: 0, y: 0, z: 1 }, created: 5, updated: 6 } }],
    chats: [
      { id: 'claude-c1', agent: { id: 'claude', engine: 'claude', dock: '', name: 'Claude' }, chat: { id: 'claude-c1', agentId: 'claude', title: 'Stoop · Lab', createdAt: 10, updatedAt: 20, session: { resume: 'abc' }, messages: [{ role: 'user', text: `my key is ${KEY}` }, { role: 'assistant', text: 'ok', attachments: [{ path: ATTACH }] }] }, scene: 's1', board: null },
      { id: 'codex-c2', agent: { id: 'codex', engine: 'codex', dock: '', name: 'Astra' }, chat: { id: 'codex-c2', agentId: 'codex', title: 'Stoop · Notes', createdAt: 11, updatedAt: 21, session: {}, contextFrom: 'claude-c1', apiKey: 'zzz', messages: [{ role: 'user', text: 'hi' }] }, scene: null, board: 'b1' },
    ],
    workbench: { notes: ['x'], files: [] },
    files: [{ id: `capture:${CAPTURE}`, type: 'capture', ref: CAPTURE, name: 'shot 1.png', path: CAPTURE }, { id: `file:${FOLDER}`, type: 'file', ref: FOLDER, name: 'Stoop site', path: FOLDER }],
  };
}
const owner = () => Object.fromEntries(fs.readdirSync(SRC, { recursive: true }).map((r) => path.join(SRC, r)).filter((p) => fs.statSync(p).isFile()).map((p) => [p, sha(p)]));
const before = owner();

// ---------- core ----------
ok('entry names: only manifest / project.json / assets/<n>/… / files/<n>/…; no zip-slip', () => {
  for (const g of ['manifest.json', 'project.json', 'assets/0/brick.png', 'files/12/Stoop site/css/site.css']) assert.ok(C.entryOk(g), g);
  for (const b of ['../evil.txt', '/abs.txt', 'C:/x.txt', 'assets/0/..\\x', 'files/1/a/../../b', 'assets/x/a.png', 'assets/0/', 'assets/0/.env', 'assets/0/con.txt', 'other/0/a', 'assets/0/a\u0000b', 'assets/0/a:b', 'files/1/trail. ', `assets/0/${'a/'.repeat(20)}x`, 'x'.repeat(300)]) assert.ok(!C.entryOk(b), b);
});
ok('secrets: keys named like secrets dropped, API-key strings replaced, key files and dotfiles never packed', () => {
  const s = C.scrub({ a: { apiKey: 'x', token: 'y', keep: `use ${KEY} now`, nested: [{ password: 'p', name: 'n' }] }, tokens: 5 });
  assert.deepStrictEqual(s.value, { a: { keep: 'use [secret removed] now', nested: [{ name: 'n' }] }, tokens: 5 });
  assert.strictEqual(s.count, 4);
  for (const p of ['/u/.ssh/id_rsa.pub', '/u/x/.env.txt', '/u/a/server.pem', '/u/a/secrets.json', '/u/a/api.key', 'C:\\Users\\x\\.aws\\cred.txt']) assert.ok(C.secretFile(p), p);
  for (const p of ['/u/a/brick.png', '/u/song.wav', '/u/tokenized-art.png']) assert.ok(!C.secretFile(p), p);
});
ok('prepare: chats / files as chosen, sessions, a reference\'s original path and the make never travel', () => {
  const r = C.prepare(project(), { chats: false, files: false });
  assert.strictEqual(r.body.chats.length, 0);
  assert.ok(!r.body.project.items.some((x) => x.type === 'chat' || x.type === 'capture' || x.type === 'file'));
  assert.deepStrictEqual(r.leftOut, { chats: 2, files: 2 });
  assert.strictEqual(r.body.project.workspace.chatId, undefined);
  assert.strictEqual(r.body.project.make, undefined);
  const r2 = C.prepare(project());
  assert.deepStrictEqual(r2.body.chats[0].chat.session, {});
  assert.strictEqual(r2.body.scenes[0].refs[0].src, undefined);
  assert.ok(!JSON.stringify(r2.body).includes(KEY) && !('apiKey' in r2.body.chats[1].chat));
  assert.strictEqual(r2.secrets, 2);
});
ok('remap: every id fresh, links follow (chat ↔ scene / board, items, cover, workspace, sequence, cues), nothing points at an old id', () => {
  const b = C.prepare(project()).body;
  const { body: r, map, dropped } = C.remap(b);
  const olds = ['pjold1', 's1', 's2', 'b1', 'claude-c1', 'codex-c2', 'r1', 'n1'];
  const text = JSON.stringify({ ...r, files: undefined });
  for (const o of olds) assert.ok(!new RegExp(`"${o}"|:${o}"`).test(text), `old id ${o} still in ${text.slice(0, 200)}`);
  assert.strictEqual(r.chats.find((c) => c.chat.title === 'Stoop · Lab').scene, map.scene.get('s1'));
  assert.strictEqual(r.chats.find((c) => c.chat.title === 'Stoop · Notes').board, map.board.get('b1'));
  assert.deepStrictEqual(r.boards[0].board.chats, [map.chat.get('codex-c2')]);
  assert.strictEqual(r.chats[1].chat.contextFrom, map.chat.get('claude-c1'));
  assert.strictEqual(r.project.cover, `scene:${map.scene.get('s1')}`);
  assert.deepStrictEqual([r.project.workspace.chatId, r.project.workspace.sceneId, r.project.workspace.boardId], [map.chat.get('claude-c1'), map.scene.get('s1'), map.board.get('b1')]);
  assert.strictEqual(r.sequences[0].edit.seq.scene, map.scene.get('s1'));
  assert.deepStrictEqual(r.sequences[0].edit.clips.map((c) => c.sketch), [map.scene.get('s1'), map.scene.get('s2'), 'elsewhere']);
  assert.ok(r.scenes[0].maps[`scene:${map.scene.get('s1')}`] && r.scenes[0].maps[SONG]);
  assert.ok(r.project.items.every((x) => x.id === `${x.type}:${x.ref}`));
  assert.deepStrictEqual(dropped, []);
  assert.deepStrictEqual(C.canon(r), C.canon(b), 'the same project minus ids');
  const d = C.remap(b, { suffix: ' copy' }).body;
  assert.strictEqual(d.project.name, 'Stoop Ronin copy'); assert.strictEqual(d.scenes[0].sketch.name, 'Katana copy'); assert.strictEqual(d.boards[0].board.name, 'Moodboard copy');
});
ok('remap: a project-workspace chat keeps the "<agent>-project-<project>" form with the new project id', () => {
  const b = project(); b.chats[0].id = 'claude-project-pjold1'; b.chats[0].chat.id = b.chats[0].id; b.project.items[0] = { id: 'chat:claude-project-pjold1', type: 'chat', ref: 'claude-project-pjold1' }; b.project.workspace.chatId = 'claude-project-pjold1';
  const { body: r, map } = C.remap(b);
  assert.strictEqual(r.project.workspace.chatId, `claude-project-${map.project}`);
});
ok('canon tells a real difference apart (a changed layer, a lost link)', () => {
  const b = C.prepare(project()).body;
  const x = C.copy(b); x.scenes[0].sketch.layers[1].code = '// other';
  assert.notDeepStrictEqual(C.canon(x), C.canon(b));
  const y = C.copy(b); y.chats[0].scene = 's2';
  assert.notDeepStrictEqual(C.canon(y), C.canon(b));
});
ok('checkManifest: a newer format / store asks for ⬆ Update; checkBody: shapes and caps', () => {
  assert.ok(C.checkManifest(C.makeManifest({ name: 'A' })).ok);
  assert.match(C.checkManifest({ ...C.makeManifest({}), v: 2 }).problems[0], /newer Hearth/);
  assert.match(C.checkManifest({ ...C.makeManifest({}), stores: { 'three-sketches': 9 } }).problems[0], /newer Hearth/);
  assert.ok(!C.checkManifest({ format: 'hearthpack', v: 1 }).ok);
  assert.ok(C.checkBody(project()).ok);
  assert.ok(!C.checkBody({ project: { name: 'x', items: [] }, scenes: 'nope' }).ok);
  assert.ok(!C.checkBody({ project: { name: 'x', items: [] }, scenes: [{ id: 's', sketch: { code: 'x'.repeat(C.LIMITS.code + 1) } }] }).ok);
  assert.ok(!C.checkBody({ project: { name: 'x', items: [] }, chats: [{ id: 'c', chat: { messages: 'no' } }] }).ok);
});

// ---------- the main side: round trip ----------
const OUT = path.join(TMP, 'out');
fs.mkdirSync(OUT);
let exported = null; let prepared = null;
ok('export: one .hearthproject, streamed; media and big files stored, text deflated; secrets and dotfiles out; progress', async () => {
  const BIG = w('music/big.mov', Buffer.alloc(20 * 1048576, 7)); // compressible, but big: stored as it is
  const b = project(); b.scenes[1].extras = { media: { path: BIG } };
  prepared = C.prepare(b);
  let ticks = 0; const sender = { send: (ch, d) => { if (ch === 'projbundle:progress' && d.phase === 'write') ticks += 1; }, isDestroyed: () => false };
  const r = await M.exportBundle({ body: prepared.body, name: 'Stoop Ronin', job: 'j1', leftOut: prepared.leftOut, secrets: prepared.secrets, out: path.join(OUT, 'Stoop Ronin.hearthproject') }, sender);
  assert.ok(r.ok, JSON.stringify(r));
  exported = r.path;
  assert.ok(!fs.existsSync(`${r.path}.part`));
  const es = await zipkit.entries(r.path);
  const by = (re) => es.find((e) => re.test(e.name));
  assert.strictEqual(by(/brick\.png$/).method, 0); assert.strictEqual(by(/big\.mov$/).method, 0); assert.strictEqual(by(/big\.mov$/).csize, 20 * 1048576);
  assert.strictEqual(by(/notes\.txt$/).method, 8); assert.ok(by(/notes\.txt$/).csize < 2000);
  assert.ok(by(/^files\/\d+\/Stoop site\/css\/site\.css$/) && by(/^files\/\d+\/Stoop site\/index\.html$/));
  assert.ok(!es.some((e) => /\.env|api\.key|node_modules/.test(e.name)), es.map((e) => e.name).join(' '));
  assert.ok(ticks >= 1);
  const raw = fs.readFileSync(r.path);
  assert.ok(!raw.includes(Buffer.from(KEY)) && !raw.includes(Buffer.from('/Users/other/Desktop')));
  assert.ok(zipkit.entries && (await zipkit.names(r.path)).includes('manifest.json'));
});
ok('peek: checks without unpacking; the card\'s lines and counts; made-on line', async () => {
  const pv = await M.peek(exported);
  assert.ok(pv.ok, JSON.stringify(pv.problems));
  assert.strictEqual(pv.manifest.name, 'Stoop Ronin');
  assert.strictEqual(pv.counts.scenes, 2); assert.strictEqual(pv.counts.chats, 2); assert.strictEqual(pv.counts.boards, 1); assert.strictEqual(pv.counts.sequences, 1);
  assert.ok(pv.lines.some((l) => /2 scenes/.test(l)) && pv.lines.some((l) => /2 chats/.test(l)) && pv.lines.some((l) => /secret/.test(l)), pv.lines.join(' | '));
  assert.match(pv.from, /^Made with Hearth/);
  assert.ok(!fs.existsSync(path.join(DATA, 'assets')));
});
ok('round trip: unpack → fresh ids → the same project (deep compare minus ids), files byte-identical, all inside Hearth\'s folder', async () => {
  const r = await M.unpack({ file: exported, job: 'j2' });
  assert.ok(r.ok, JSON.stringify(r.problems));
  assert.ok(r.dir.startsWith(path.join(DATA, 'assets', 'projects')));
  assert.deepStrictEqual(r.skipped, []);
  const { body: back } = C.remap(r.body);
  const strip = (b) => { const c = C.copy(b); delete c.files; return c; };
  assert.deepStrictEqual(C.canon(strip(back)), C.canon(strip(prepared.body)));
  // every path now points into the import's folder, with the same bytes
  const pairs = [[back.scenes.find((s) => s.sketch.name === 'Katana').refs[0].path, PNG], [back.scenes.find((s) => s.sketch.name === 'Katana').extras.media.path, SONG], [back.boards[0].board.items[0].src, BOARDPIC], [back.chats.find((c) => c.chat.title === 'Stoop · Lab').chat.messages[1].attachments[0].path, ATTACH], [back.project.items.find((x) => x.type === 'capture').ref, CAPTURE], [path.join(back.project.items.find((x) => x.type === 'file').ref, 'css', 'site.css'), path.join(FOLDER, 'css', 'site.css')]];
  for (const [a, o] of pairs) { assert.ok(a.startsWith(r.dir), a); assert.strictEqual(sha(a), sha(o)); }
  // the song's beat map follows the song's new path
  const k = back.scenes.find((s) => s.sketch.name === 'Katana');
  assert.ok(k.maps[k.extras.media.path]);
  // a second import lands in its own folder (never over the first)
  const r2 = await M.unpack({ file: exported, job: 'j3' });
  assert.ok(r2.ok && r2.dir !== r.dir);
  assert.ok(await M.discard(r2.dir));
  assert.ok(!(await M.discard(SRC)), 'discard refuses anything outside data/assets/projects');
  assert.ok(fs.existsSync(SRC));
});
ok('cancel: an export stopped mid-file leaves no file and no .part; an unpack stopped leaves no folder', async () => {
  w('music/huge.wav', Buffer.alloc(120 * 1048576, 3));
  const b = C.prepare({ project: { id: 'p', name: 'Huge', items: [] }, scenes: [{ id: 's', sketch: { id: 's', name: 'S', code: '' }, extras: { media: { path: path.join(SRC, 'music/huge.wav') } }, refs: [], notes: [] }] }).body;
  const out = path.join(OUT, 'Huge.hearthproject');
  const sender = { send: (_c, d) => { if (d.phase === 'write') M.cancel('jc'); }, isDestroyed: () => false }; // (the first progress event: before any bytes are through)
  const r = await M.exportBundle({ body: b, name: 'Huge', job: 'jc', out }, sender);
  assert.deepStrictEqual(r, { ok: false, canceled: true });
  assert.ok(!fs.existsSync(out) && !fs.existsSync(`${out}.part`));
  const r2 = await M.exportBundle({ body: b, name: 'Huge', job: 'jd', out });
  assert.ok(r2.ok);
  const before2 = fs.existsSync(path.join(DATA, 'assets', 'projects')) ? fs.readdirSync(path.join(DATA, 'assets', 'projects')).length : 0;
  const sender2 = { send: (_c, d) => { if (d.phase === 'unpack') M.cancel('je'); }, isDestroyed: () => false };
  const u = await M.unpack({ file: out, job: 'je' }, sender2);
  assert.ok(u.canceled, JSON.stringify(u));
  assert.strictEqual(fs.readdirSync(path.join(DATA, 'assets', 'projects')).length, before2);
  fs.rmSync(path.join(SRC, 'music/huge.wav'));
});
ok('a file the project points at that isn\'t here is left out and named (not a failure)', async () => {
  const b = C.prepare({ project: { id: 'p', name: 'Gone', items: [] }, scenes: [{ id: 's', sketch: { id: 's', name: 'S', code: '' }, extras: { media: { path: '/nowhere/at/all/lost.wav' } }, refs: [], notes: [] }] }).body;
  const r = await M.exportBundle({ body: b, name: 'Gone', job: 'jg', out: path.join(OUT, 'Gone.hearthproject') });
  assert.ok(r.ok); assert.deepStrictEqual(r.skipped, ['lost.wav']);
  const pv = await M.peek(r.path);
  assert.ok(pv.lines.some((l) => /lost\.wav/.test(l)));
});

// ---------- malicious zips ----------
// a zip written by hand: entries { name, data, method?, size? (a lie), crc? (a lie), flags? }
function rawZip(file, entries) {
  const parts = []; const central = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '');
    const method = e.method ?? 0;
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const crc = e.crc ?? zipkit.crc32(data);
    const size = e.size ?? data.length;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800 | (e.flags || 0), 6); h.writeUInt16LE(method, 8);
    h.writeUInt32LE(crc >>> 0, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(size, 22); h.writeUInt16LE(name.length, 26);
    parts.push(h, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800 | (e.flags || 0), 8); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(size, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  fs.writeFileSync(file, Buffer.concat([...parts, cd, end]));
  return file;
}
const good = () => [{ name: 'manifest.json', data: JSON.stringify(C.makeManifest({ name: 'Evil' })) }, { name: 'project.json', data: JSON.stringify({ project: { id: 'p', name: 'Evil', items: [] }, scenes: [{ id: 's', sketch: { id: 's', name: 'S', code: '' }, extras: { media: { path: 'hearthproject:assets/0/a.png' } } }] }) }];
const projectsDir = () => path.join(DATA, 'assets', 'projects');
const listing = () => (fs.existsSync(projectsDir()) ? fs.readdirSync(projectsDir()).sort() : []);
for (const [label, extra, want] of [
  ['zip-slip "../"', [{ name: '../escape.txt', data: 'x' }], /isn't a name/],
  ['an absolute name', [{ name: '/tmp/abs.txt', data: 'x' }], /isn't a name/],
  ['a drive name', [{ name: 'C:/Windows/x.txt', data: 'x' }], /isn't a name/],
  ['a backslash name', [{ name: 'assets\\0\\..\\..\\x.txt', data: 'x' }], /isn't a name/],
  ['a nested ".." in files/', [{ name: 'files/1/a/../../../x.txt', data: 'x' }], /isn't a name/],
  ['a Windows-reserved name', [{ name: 'assets/0/con.txt', data: 'x' }], /isn't a name/],
  ['the same name twice', [{ name: 'assets/0/a.png', data: 'x' }, { name: 'assets/0/A.png', data: 'y' }], /twice/],
  ['an encrypted entry', [{ name: 'assets/0/a.png', data: 'x', flags: 1 }], /encrypted/],
  ['a zip bomb (ratio)', [{ name: 'assets/0/a.png', data: Buffer.alloc(30 * 1048576), method: 8 }], /zip bomb/],
]) {
  ok(`malicious: ${label} is refused before anything is written`, async () => {
    const was = listing();
    const f = rawZip(path.join(TMP, `evil-${++fileN}.hearthproject`), [...good(), ...extra]);
    const pv = await M.peek(f);
    assert.ok(!pv.ok && pv.problems.some((p) => want.test(p)), JSON.stringify(pv.problems));
    const u = await M.unpack({ file: f, job: `ev${fileN}` });
    assert.ok(!u.ok); assert.deepStrictEqual(listing(), was);
    assert.ok(!fs.existsSync(path.join(TMP, 'escape.txt')) && !fs.existsSync('/tmp/abs.txt'));
  });
}
ok('malicious: a size lie (says 10 bytes, inflates to 8 MB) stops at its stated size: that file is skipped, named, removed', async () => {
  const f = rawZip(path.join(TMP, 'lie.hearthproject'), [...good(), { name: 'assets/0/a.png', data: Buffer.alloc(8 * 1048576, 1), method: 8, size: 10 }]);
  const u = await M.unpack({ file: f, job: 'lie' });
  assert.ok(u.ok, JSON.stringify(u.problems));
  assert.ok(u.skipped.some((s) => /a\.png .*damaged/.test(s)), JSON.stringify(u.skipped));
  assert.ok(!fs.existsSync(path.join(u.dir, 'assets', '0', 'a.png')));
  assert.strictEqual(u.body.scenes[0].extras.media.path, '');
  await M.discard(u.dir);
});
ok('malicious: a bad CRC → that file skipped and named', async () => {
  const f = rawZip(path.join(TMP, 'crc.hearthproject'), [...good(), { name: 'assets/0/a.png', data: 'hello', crc: 1234 }]);
  const u = await M.unpack({ file: f, job: 'crc' });
  assert.ok(u.ok && u.skipped.some((s) => /damaged/.test(s)));
  assert.ok(!fs.existsSync(path.join(u.dir, 'assets', '0', 'a.png')));
  await M.discard(u.dir);
});
ok('malicious: a newer version, a hearthpack, a broken body, no manifest, a damaged JSON, not a zip: refused with a reason', async () => {
  const cases = [
    [[{ name: 'manifest.json', data: JSON.stringify({ ...C.makeManifest({}), v: 7 }) }, good()[1]], /newer Hearth/],
    [[{ name: 'manifest.json', data: JSON.stringify({ format: 'hearthpack', v: 1 }) }, good()[1]], /Not a Hearth project/],
    [[good()[0], { name: 'project.json', data: JSON.stringify({ project: { name: 'x', items: [] }, scenes: 'lots' }) }], /broken/],
    [[good()[1]], /no manifest/],
    [[good()[0], { name: 'project.json', data: '{"project": ' }], /can't be read/],
    [[good()[0], { name: 'project.json', data: '{}', crc: 99 }], /damaged/],
  ];
  for (const [es, want] of cases) { const pv = await M.peek(rawZip(path.join(TMP, `bad-${++fileN}.hearthproject`), es)); assert.ok(!pv.ok && pv.problems.some((p) => want.test(p)), JSON.stringify(pv.problems)); }
  fs.writeFileSync(path.join(TMP, 'junk.hearthproject'), 'not a zip at all');
  assert.ok(!(await M.peek(path.join(TMP, 'junk.hearthproject'))).ok);
  assert.ok(!(await M.peek(path.join(TMP, 'x.zip'))).ok);
});
ok('a reference to an entry that isn\'t in the file is emptied and named (dangling token)', async () => {
  const f = rawZip(path.join(TMP, 'dangling.hearthproject'), good());
  const pv = await M.peek(f);
  assert.ok(pv.ok && pv.manifest.skipped.includes('a.png'));
});
ok('the owner\'s files were only ever read: same bytes, nothing added next to them', () => {
  const now = owner();
  for (const k of Object.keys(before)) assert.strictEqual(now[k], before[k], k);
  assert.deepStrictEqual(Object.keys(now).filter((k) => !before[k] && !/big\.mov$/.test(k)), []);
});

(async () => {
  for (const [name, fn] of tests) {
    n += 1;
    try { await fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${String(err.stack).split('\n').slice(0, 4).join('\n  ')}`); }
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
