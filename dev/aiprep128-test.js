#!/usr/bin/env node
// (round 128, aiprep128) The project brief (projectbrief-core.js, engines.js's `brief` part), in one Node test:
//   1. a fake project's inputs: the moodboard (palette from its pictures' vibes and swatches, moods, notes), Lab
//      references, the song's analysis (BPM, key, sections with energy, drops), the scene; no paths, secrets redacted
//   2. the one AI pass through the fake engine (dev/fake-claude.js via engines.once): the brief parsed and stored
//   3. stale: the moodboard / notes changed → named; the same inputs or a scene edit → not stale
//   4. the director's `brief` part: ≤ 600 characters, the same bytes for the same brief, the parts before it unchanged
//      (cached prefix), none for a plain chat, a lean run or a crew helper
//   5. no picture without the project's consent: the request has none and the engine gets none; with it, exactly one
// Everything in a temp root (engines.js + mcp/ copied there, the fake engines); no data/ of the owner's is touched.
//   node dev/aiprep128-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiprep128-'));
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'macpolish.js', 'access-rules.js', 'datalock.js', 'context-core.js', 'toolwake.js', 'spawnhelper.js', 'spawnhelper-child.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const engines = require(path.join(dir, 'engines.js'));
engines.setEnginePaths({ claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') });
const C = require(path.join(ROOT, 'projectbrief-core.js'));
let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };

// ---------- a fake project ----------
const vibe = (hexes, extra = {}) => ({ palette: hexes.map((hex, i) => ({ hex, share: 0.5 - i * 0.1 })), light: 0.3, contrast: 0.6, sat: 0.7, warmth: 0.4, edges: 0.2, grain: 0.1, space: 0.3, symmetry: 0.5, moods: ['moody', 'neon'], ...extra });
const board = () => ({ id: 'b1', name: 'Dusk refs', items: [
  { id: 'i1', type: 'image', title: 'Harbor at night', x: 0, y: 0, w: 300, h: 200, vibe: vibe(['#1a1033', '#ff3cac', '#2de2e6']) },
  { id: 'i2', type: 'image', title: 'Neon sign', x: 320, y: 0, w: 300, h: 200, vibe: vibe(['#ff3cac', '#120c24']), stamp: '★' },
  { id: 'i3', type: 'swatch', color: '#f6c177', x: 0, y: 220, w: 200, h: 240 },
  { id: 'i4', type: 'note', text: 'slow and dreamy, then explode on the drop. api_key=sk-abcdefghijklmnop', x: 220, y: 220, w: 200, h: 120 },
] });
const analysis = { bpm: 124.02, key: 'A minor', duration: 182, drops: [64.1, 128.3], fps: 30, level: new Array(30 * 182).fill(0.5),
  sections: [{ start: 0, end: 32, label: 'Intro', energy: 'quiet' }, { start: 32, end: 64, label: 'Build', energy: 'medium' }, { start: 64, end: 96, label: 'Drop', energy: 'loud' }, { start: 96, end: 182, label: 'Outro', energy: 'quiet' }] };
const raw = (over = {}) => ({
  project: { name: 'Night Harbor', notes: 'A 9:16 visual for the single.', workspace: { chatId: 'c1', sceneId: 's1', boardId: 'b1' } },
  board: board(), refs: [{ id: 'r1', key: 'logo', name: 'logo', kind: 'image', path: '/Users/owner/secret/logo.png' }],
  song: { path: '/Users/owner/Music/night-harbor.wav', analysis },
  scene: { name: 'Harbor', layers: [{ name: 'Background', code: 'x' }, { name: 'Rings', code: 'y' }], palette: ['#000000'], frame: '9:16' },
  ...over,
});

(async () => {
  // ---------- 1. gathering ----------
  const x = C.inputs(raw());
  assert.equal(x.name, 'Night Harbor');
  assert.ok(x.board.palette.includes('#ff3cac') && x.board.palette.includes('#f6c177'), `the moodboard's palette: ${x.board.palette}`);
  assert.ok(x.board.palette.every((h) => /^#[0-9a-f]{6}$/.test(h)) && x.board.palette.length <= 6);
  assert.equal(x.board.pictures, 2);
  assert.ok(x.board.moods.includes('moody'));
  assert.equal(x.refs[0].name, 'logo');
  assert.equal(x.song.bpm, 124);
  assert.equal(x.song.key, 'A minor');
  assert.deepEqual(x.song.sections.map((s) => s.label), ['Intro', 'Build', 'Drop', 'Outro']);
  assert.deepEqual(x.song.drops, [64, 128]);
  assert.deepEqual(x.scene.layers, ['Background', 'Rings']);
  const text0 = C.prompt(x);
  assert.ok(!/sk-abcdefghijklmnop/.test(text0), 'a secret in a board note never reaches the prompt');
  assert.ok(!/\/Users\/owner/.test(text0), 'no file paths in the prompt (names only)');
  assert.ok(/124 BPM/.test(text0) && /Drop 1:04–1:36 loud/.test(text0) && /drops at 1:04, 2:08/.test(text0), 'the song\'s tempo, sections and drops');
  ok('a fake project\'s inputs: moodboard palette, moods and notes, references, the song\'s BPM / key / sections / drops, the scene; no paths, secrets redacted');

  // ---------- 2. the AI pass through the fake engine, parsed and stored ----------
  const kvFile = path.join(dir, 'project-briefs.json');
  const asked = [];
  const deps = (over = {}) => ({
    read: async () => (fs.existsSync(kvFile) ? JSON.parse(fs.readFileSync(kvFile, 'utf8')) : null),
    write: async (d) => { fs.writeFileSync(kvFile, JSON.stringify(d)); },
    gather: async () => raw(), now: () => 1700000000000,
    picture: async () => { const p = path.join(dir, 'board-overview.jpg'); fs.writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xd9])); asked.push('picture'); return p; },
    ask: async (rq) => {
      asked.push(rq);
      const r = await engines.once({ agent: { id: 'claude', name: 'Claude', mode: 'native', engine: 'claude' }, text: rq.text, images: rq.images, options: { lean: true, helper: true, effort: 'low' } });
      return { ...r, by: 'Claude' };
    },
    ...over,
  });
  const b1 = await C.prepare('pj1', {}, deps());
  assert.equal(b1.mood, 'warm neon dusk');
  assert.ok(b1.steps.length >= 3 && b1.steps.length <= 6, 'three to six first steps');
  assert.ok(b1.palette.length && b1.palette.every((h) => x.board.palette.includes(h)), `the palette comes from the moodboard: ${b1.palette}`);
  assert.equal(b1.tempo.length, 4, 'a tempo line per section');
  assert.ok(/full bloom/.test(b1.tempo.find((t) => /Drop/.test(t.section)).plan));
  const stored = JSON.parse(fs.readFileSync(kvFile, 'utf8'));
  const e1 = C.entry(stored, 'pj1');
  assert.ok(e1 && e1.at === 1700000000000 && e1.by === 'Claude' && e1.fp.board && e1.fp.song, 'stored with its time, its AI and the inputs\' fingerprints');
  assert.deepEqual(C.view(e1).steps, b1.steps);
  assert.ok(stored.v === 1 && Array.isArray(stored.list), 'a list of objects with ids (sync merges it item by item)');
  // another project's brief stays as it was
  fs.writeFileSync(kvFile, JSON.stringify(C.put(stored, 'pj0', { brief: { steps: ['old'] }, at: 1 })));
  await C.prepare('pj1', {}, deps());
  assert.deepEqual(C.entry(JSON.parse(fs.readFileSync(kvFile, 'utf8')), 'pj0').brief.steps, ['old']);
  assert.equal(C.parse('Sure! no json here'), null, 'an answer that isn\'t a brief is refused');
  assert.equal(C.parse('{"mood": "x", "steps": []}'), null, 'a brief without steps is refused');
  const edited = C.fromText(C.toText(b1));
  assert.deepEqual(edited.steps, b1.steps); assert.deepEqual(edited.palette, b1.palette); assert.equal(edited.mood, b1.mood);
  ok('one AI pass through the fake engine: the brief parsed (mood, moodboard palette, tempo per section, 3–6 steps), stored with time + fingerprints; other projects untouched; Edit round-trips');

  // ---------- 3. stale ----------
  const fp0 = e1.fp;
  assert.deepEqual(C.changed(fp0, C.fingerprints(C.inputs(raw()))), [], 'the same project: not stale');
  const moved = raw(); moved.board.items[0].x = 999; // moving a picture on the board isn't a change of what it says
  assert.deepEqual(C.changed(fp0, C.fingerprints(C.inputs(moved))), []);
  const more = raw(); more.board.items.push({ id: 'i5', type: 'note', text: 'add rain', x: 0, y: 0, w: 1, h: 1 });
  assert.deepEqual(C.changed(fp0, C.fingerprints(C.inputs(more))), ['the moodboard'], 'a note added to the moodboard');
  const scene = raw(); scene.scene.layers.push({ name: 'Rain' });
  assert.deepEqual(C.changed(fp0, C.fingerprints(C.inputs(scene))), [], 'the director building the scene doesn\'t make its own brief stale');
  const notes = raw({ notes: 'Make it 16:9 instead.' });
  assert.deepEqual(C.changed(fp0, C.fingerprints(C.inputs(notes))), ['your notes']);
  const song = raw(); song.song = { path: '/x/other-song.mp3' };
  assert.ok(C.changed(fp0, C.fingerprints(C.inputs(song))).includes('the song'));
  ok('stale: a moodboard note / the owner\'s notes / another song are named; the same inputs, a picture moved or the scene built on are not');

  // ---------- 4. the director's part ----------
  const part = C.compact(b1, 'Night Harbor');
  assert.ok(part.length <= C.PART_MAX, `≤ ${C.PART_MAX} characters (${part.length})`);
  assert.equal(C.compact(JSON.parse(JSON.stringify(b1)), 'Night Harbor'), part, 'the same brief → the same bytes');
  const long = { ...b1, steps: b1.steps.map((s) => s.repeat(8)).concat(['x'.repeat(200), 'y'.repeat(200)]), tempo: b1.tempo.map((t) => ({ ...t, plan: t.plan.repeat(9) })), questions: ['q'.repeat(300)] };
  assert.ok(C.compact(long, 'N').length <= C.PART_MAX, 'a long brief is cut to the cap');
  const T = engines._test;
  const DIRECTOR = { id: 'threedirector', name: 'Three Director', engine: 'claude', mode: 'native', dock: 'three', threeTools: true };
  const partsOf = (agent, options) => T.promptParts0(T.runAgent(agent, { chatId: 'c1', session: {}, text: 'make a visual for this song', options }).agent, null);
  const without = partsOf(DIRECTOR, {});
  const withA = partsOf(DIRECTOR, { brief: part });
  const withB = partsOf(DIRECTOR, { brief: part });
  const bi = withA.findIndex((p) => p[0] === 'brief');
  assert.ok(bi > 0 && withA[bi][1] === part, 'a director in a project with a brief gets it as the `brief` part');
  assert.equal(JSON.stringify(withA), JSON.stringify(withB), 'byte-stable from one message to the next');
  assert.equal(JSON.stringify(withA.slice(0, bi)), JSON.stringify(without.slice(0, bi)), 'the parts before it are unchanged (the cached prefix stays)');
  assert.equal(JSON.stringify(withA.filter((p) => p[0] !== 'brief')), JSON.stringify(without), 'nothing else changes');
  assert.ok(!partsOf({ id: 'claude', name: 'Claude', engine: 'claude', mode: 'native' }, { brief: part }).some((p) => p[0] === 'brief'), 'a plain chat never gets it');
  assert.ok(!partsOf(DIRECTOR, { brief: part, lean: true }).some((p) => p[0] === 'brief'), 'a lean run never gets it');
  assert.ok(!partsOf(DIRECTOR, { brief: part, crew: true }).some((p) => p[0] === 'brief'), 'a crew helper never gets it');
  assert.ok(partsOf({ ...DIRECTOR, id: 'td-x', engine: 'codex', hubTools: true }, { brief: part }).some((p) => p[0] === 'brief' && p[1] === part), 'Astra directors get the same part');
  assert.ok(T.buildPrompt(T.runAgent(DIRECTOR, { options: { brief: 'z'.repeat(5000) } }).agent).length - T.buildPrompt(DIRECTOR).length < 700, 'capped in engines.js too');
  ok(`the director's \`brief\` part: ${part.length} ≤ ${C.PART_MAX} characters, byte-stable, after the cached parts, only for directors (Claude and Astra), never lean / crew`);

  // ---------- 5. pictures only with consent ----------
  asked.length = 0;
  fs.rmSync(kvFile, { force: true });
  const noEyes = await C.prepare('pj2', {}, deps());
  assert.ok(!asked.includes('picture'), 'no consent: the moodboard isn\'t even drawn');
  assert.deepEqual(asked.find((a) => a.text).images, [], 'no consent: no picture in the request');
  assert.ok(/pictures seen: 0/.test(noEyes.look) && noEyes.pictures === 0, 'no consent: the engine got none');
  assert.ok(!C.request(x, { consent: 'yes', picture: '/p.jpg' }).images.length && !C.request(x, { consent: false, picture: '/p.jpg' }).images.length, 'only an explicit true counts');
  asked.length = 0;
  const eyes = await C.prepare('pj2', { eyes: true }, deps());
  assert.ok(asked.includes('picture') && asked.find((a) => a.text).images.length === 1, 'the owner\'s tick: one overview picture');
  assert.ok(/pictures seen: 1/.test(eyes.look) && eyes.eyes === true, 'the engine got exactly one');
  asked.length = 0;
  const again = await C.prepare('pj2', {}, deps());
  assert.ok(again.eyes === true && asked.includes('picture'), 'the consent is kept with the project');
  asked.length = 0;
  const off = await C.prepare('pj2', { eyes: false }, deps());
  assert.ok(off.eyes === false && !asked.includes('picture'), 'and taken back');
  const emptyBoard = raw(); emptyBoard.board.items = emptyBoard.board.items.filter((i) => i.type !== 'image');
  assert.deepEqual(C.request(C.inputs(emptyBoard), { consent: true, picture: '/p.jpg' }).images, [], 'a board with no pictures sends none');
  ok('no picture without consent: none drawn, none in the request, none reached the engine; the owner\'s tick sends exactly one, kept with the project until taken back');

  console.log(`\nall passed (${passed})`);
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((err) => { console.error(err); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
