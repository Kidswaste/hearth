#!/usr/bin/env node
// (round 182, projclean182) What a project is (projkind-core.js): its kind, its one line, the "Older version" shelf,
// the screen's lists, and what could come next.   node dev/projkind-test.js
'use strict';
const assert = require('assert');
const path = require('path');
const K = require(path.join(__dirname, '..', 'projkind-core.js'));
const PC = require(path.join(__dirname, '..', 'projcreate-core.js'));
let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };
const proj = (o = {}) => ({ id: o.id || `pj${Math.random().toString(36).slice(2, 8)}`, name: 'Clink', items: [], at: 1000, updated: 1000, opened: 0, status: 'active', ...o });

// ---------- 1. the kind ----------
assert.equal(K.kindOf(proj({ workspace: { kind: 'game' } })), 'game');
assert.equal(K.kindOf(proj({ workspace: { kind: 'music', start: 'game' } })), 'music', 'the owner\'s kind wins over how it started');
assert.equal(K.kindOf(proj({ workspace: { start: 'visualizer' } })), 'music');
assert.equal(K.kindOf(proj({ workspace: { start: 'particles' } })), 'music');
assert.equal(K.kindOf(proj({ workspace: { start: 'footage' } })), 'video');
assert.equal(K.kindOf(proj({ workspace: { start: 'empty' } })), null);
assert.equal(K.kindOf(proj({ workspace: { kind: 'nonsense' } })), null);
assert.equal(K.kindOf(proj()), null, 'a project from before workspaces has no kind');
for (const k of K.KINDS) { assert.ok(K.STARTS[k.id].includes(k.start), `${k.id}: its first start is one of its starts`); for (const s of K.STARTS[k.id]) assert.ok(PC.STARTS.some((x) => x.id === s), `${k.id} › ${s} is a real start`); }
assert.ok(PC.STARTS.every((s) => K.IDS.some((k) => K.STARTS[k].includes(s.id))), 'every start is offered by at least one kind');
assert.ok(!K.STARTS.music.includes('game') && !K.STARTS.video.includes('game') && !K.STARTS.game.includes('visualizer'), 'games, music and videos are apart at creation');
ok('a project is a game, music or a video: the owner\'s choice, else how it started; each kind has its own starts');

// ---------- 2. the one line ----------
assert.equal(K.pitchOf(proj({ pitch: 'A coin game that never stops.' })), 'A coin game that never stops.');
assert.equal(K.pitchOf(proj({ workspace: { description: 'From the description' }, notes: 'from the notes' })), 'From the description');
assert.equal(K.pitchOf(proj({ notes: '\n\n  first line  \nsecond' })), 'first line');
assert.equal(K.pitchOf(proj()), '');
assert.ok(K.pitchOf(proj({ pitch: 'x'.repeat(900) })).length <= K.PITCH_MAX);
ok('what it is going to be: the owner\'s line, else its description, else its notes\' first line');

// ---------- 3. the "Older version" shelf ----------
const F = new Map([['old1', ''], ['old2', ''], ['new1', 'gpu']]);
assert.equal(K.shelfOf(proj({ workspace: { sceneId: 'old1' } }), F), 'older');
assert.equal(K.shelfOf(proj({ workspace: { sceneId: 'new1' } }), F), 'current');
assert.equal(K.shelfOf(proj({ workspace: { sceneId: 'old1' }, items: [{ type: 'scene', ref: 'new1' }] }), F), 'current', 'one new-player scene keeps it current');
assert.equal(K.shelfOf(proj({ items: [{ type: 'scene', ref: 'old1' }, { type: 'scene', ref: 'old2' }, { type: 'chat', ref: 'new1' }] }), F), 'older', 'only scenes count');
assert.equal(K.shelfOf(proj({ items: [{ type: 'chat', ref: 'c1' }] }), F), 'current', 'no scene: a project being started, not an old one');
assert.equal(K.shelfOf(proj({ workspace: { sceneId: 'gone' } }), F), 'current', 'a scene that is not here says nothing');
assert.equal(K.shelfOf(proj({ workspace: { sceneId: 'old1' } }), null), 'current', 'formats not read yet: nothing is folded away');
assert.equal(K.shelfOf(proj({ workspace: { sceneId: 'old1' }, shelf: 'current' }), F), 'current', 'the owner moved it back');
assert.equal(K.shelfOf(proj({ workspace: { sceneId: 'new1' }, shelf: 'older' }), F), 'older', 'the owner folded it away');
assert.equal(K.shelfOf(proj({ workspace: { sceneId: 'old1' } }), { old1: '' }), 'older', 'a plain object of formats works too');
ok('“Older version”: every scene made for the old player, unless the owner moved it');

// ---------- 4. the screen's lists ----------
const list = [
  proj({ id: 'a', name: 'Zeta', workspace: { kind: 'game', sceneId: 'new1' }, updated: 5000, at: 100 }),
  proj({ id: 'b', name: 'alpha', workspace: { kind: 'music', sceneId: 'new1' }, updated: 9000, at: 300, pin: true, series: 'Night' }),
  proj({ id: 'c', name: 'Mid', workspace: { start: 'footage', sceneId: 'new1' }, updated: 7000, at: 200, series: 'Night' }),
  proj({ id: 'd', name: 'Old game', workspace: { kind: 'game', sceneId: 'old1' }, updated: 99999 }),
  proj({ id: 'e', name: 'No kind', updated: 1 }),
];
const A = K.arrange(list, { formats: F });
assert.deepEqual(A.pinned.map((p) => p.id), ['b']);
assert.deepEqual(A.current.map((p) => p.id), ['c', 'a', 'e'], 'last worked on first');
assert.deepEqual(A.older.map((p) => p.id), ['d']);
assert.deepEqual(A.counts, { all: 4, game: 1, music: 1, video: 1, none: 1, older: 1 }, 'the tabs count the current projects; the old game is not a current game');
assert.deepEqual(K.arrange(list, { formats: F, kind: 'game' }).current.map((p) => p.id), ['a']);
assert.deepEqual(K.arrange(list, { formats: F, kind: 'game' }).older.map((p) => p.id), ['d'], 'the fold follows the tab');
assert.deepEqual(K.arrange(list, { formats: F, kind: 'none' }).current.map((p) => p.id), ['e']);
assert.deepEqual(K.arrange(list, { formats: F, sort: 'name' }).current.map((p) => p.id), ['c', 'e', 'a'], 'by name, case aside');
assert.deepEqual(K.arrange(list, { formats: F, sort: 'new' }).current.map((p) => p.id), ['e', 'c', 'a']);
assert.deepEqual([...K.arrange(list, { formats: F, series: 'Night' }).pinned, ...K.arrange(list, { formats: F, series: 'Night' }).current].map((p) => p.id), ['b', 'c']);
assert.deepEqual(K.seriesOf(list), [{ name: 'Night', n: 2 }]);
assert.equal(K.arrange(list, {}).older.length, 0, 'without formats nothing is folded');
ok('the lists: pinned first, the kind tabs, three orders, a series, and the fold');

// ---------- 5. what could come next ----------
assert.equal(K.nextName('Clink'), 'Clink II');
assert.equal(K.nextName('Clink II'), 'Clink III');
assert.equal(K.nextName('Ascend to Heaven 2'), 'Ascend to Heaven 3');
for (const kind of [...K.IDS, null]) {
  const p = proj({ name: 'Clink', workspace: kind ? { kind } : undefined });
  const u = K.followUps(p);
  assert.ok(u.follow.length === 3 && u.fresh.length >= 2, `${kind}: three follow-ups and a different series`);
  assert.ok(u.follow.every((x) => x.series === 'Clink' && x.name && x.pitch && K.IDS.includes(x.kind)), 'a follow-up stays in the project\'s series');
  assert.ok(u.fresh.every((x) => !x.series && !x.name && x.pitch && K.IDS.includes(x.kind)), 'a different series starts clean');
  if (kind) assert.ok(u.fresh[0].kind !== kind, 'the different series leads with another kind');
}
assert.equal(K.followUps(proj({ name: 'Clink II', series: 'Clink', workspace: { kind: 'game' } })).follow[0].name, 'Clink III');
assert.equal(K.followUps(proj({ name: 'Clink II', series: 'Clink', workspace: { kind: 'game' } })).follow[0].series, 'Clink');
const prompt = K.ideasPrompt(proj({ name: 'Clink', pitch: 'A coin game', workspace: { kind: 'game' } }), [proj({ name: 'Ascend to Heaven', workspace: { kind: 'game' } })], { mood: 'ember light' });
assert.ok(/"name":"Clink"/.test(prompt) && /A coin game/.test(prompt) && /Ascend to Heaven \(game\)/.test(prompt) && /ember light/.test(prompt) && /DIFFERENT series/.test(prompt));
const ai = K.parseIdeas('Sure!\n{"follow":[{"label":"A sequel","kind":"game","name":"Clink Deep","pitch":"The mine goes down."},{"label":"x","kind":"opera","name":"n","pitch":"p"},{"label":"","pitch":"no label"}],"fresh":[{"label":"A rain film","kind":"video","name":"Wet Neon","pitch":"One street, one storm."}]}', proj({ name: 'Clink', workspace: { kind: 'game' } }));
assert.ok(ai.follow.length === 2 && ai.follow[0].series === 'Clink' && ai.follow[0].ai && ai.follow[1].kind === 'game' && ai.fresh.length === 1 && ai.fresh[0].series === '' && ai.fresh[0].kind === 'video', JSON.stringify(ai));
assert.equal(K.parseIdeas('no json here'), null);
assert.equal(K.parseIdeas('{"follow":[],"fresh":[]}'), null);
ok('what could come next: follow-ups in the same series, a different series, and the AI\'s answer read safely');

// ---------- 6. the name suggestion knows the kind ----------
assert.ok(/small video game/.test(PC.namePrompt('x', null, 'game')) && /short video/.test(PC.namePrompt('x', null, 'video')) && /music-visual project\. Facts:/.test(PC.namePrompt('x', null)));
ok('✦ Suggest a name is told what kind of project it is');

// ---------- 7. the holding project, the personality, ✦ Sort my projects ----------
const earlier = proj({ id: 'pj-earlier-chats', name: 'Earlier chats', workspace: { sceneId: 'old1' }, updated: 9e12, notes: 'Chats from before projects' });
assert.equal(K.shelfOf(earlier, F), 'current', '“Earlier chats” is never folded away');
const H2 = K.arrange([...list, earlier], { formats: F });
assert.equal(H2.current.at(-1).id, 'pj-earlier-chats', 'it comes last, whatever its time');
assert.equal(H2.counts.all, 4, 'and is not counted as a project');
assert.ok(!K.arrange([...list, earlier], { formats: F, kind: 'none' }).current.some((p) => p.id === 'pj-earlier-chats'));
assert.equal(K.kindOf(proj({ workspace: { persona: 'builder' } })), 'game', 'a game builder\'s project is a game');
assert.equal(K.kindOf(proj({ workspace: { persona: 'producer' } })), 'music');
assert.equal(K.kindOf(proj({ workspace: { persona: 'partner' } })), null);
const unsorted = [proj({ id: 'u1', name: 'Goo orb' }), proj({ id: 'u2', name: 'Cat Simulator', workspace: { kind: 'game' } }), proj({ id: 'u3', name: 'Done', workspace: { kind: 'video' }, pitch: 'Has both.' }), earlier];
assert.deepEqual(unsorted.filter(K.needs).map((p) => p.id), ['u1', 'u2']);
const sp = K.sortPrompt(unsorted);
assert.ok(/Goo orb/.test(sp) && /Cat Simulator/.test(sp) && !/"Done"/.test(sp) && !/Earlier chats/.test(sp), 'only the projects missing a kind or a line are asked about');
assert.equal(K.sortPrompt([unsorted[2]]), '', 'nothing missing: nothing asked');
const rows = K.parseSort('Here:\n[{"id":"u1","kind":"video","line":"A glossy orb that breathes with the bass."},{"id":"u2","kind":"music","line":"You are a cat. Knock things over."},{"id":"u3","kind":"game","line":"x"},{"id":"zzz","kind":"game","line":"x"},{"id":"u1b","kind":"opera"}]', unsorted);
assert.deepEqual(rows, [{ id: 'u1', kind: 'video', pitch: 'A glossy orb that breathes with the bass.' }, { id: 'u2', pitch: 'You are a cat. Knock things over.' }], 'a kind or a line that is there is kept; unknown ids and kinds are dropped');
assert.equal(K.parseSort('nope', unsorted), null);
ok('“Earlier chats” stays out of the way; the personality hints the kind; ✦ Sort my projects only fills what is missing');

console.log(`\nall passed (${passed})`);
