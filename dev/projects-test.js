// Node tests for projects-core.js (round 23): the project model, items, identity from the makes' palette, merge-friendly
// data, suggestions (names, links, timing; no tokens), search ranking, covers and "continue where you left off".
//   node dev/projects-test.js
const assert = require('assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'projects-core.js'));
const MC = require(path.join(__dirname, '..', 'makes-core.js'));
let n = 0; let failed = 0;
const ok = (name, fn) => { n += 1; try { fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${err.stack.split('\n').slice(0, 3).join('\n  ')}`); } };
const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 12);

ok('create: a name, the makes\' identity, status, notes; the same thing is one item', () => {
  const p = C.create({ id: 'pjx', name: 'Stoop Ronin', notes: 'for the launch' });
  assert.deepStrictEqual(p.ident, MC.identity('pjx'));
  assert.strictEqual(p.status, 'active');
  assert.strictEqual(p.notes, 'for the launch');
  assert.ok(C.addItem(p, { type: 'chat', ref: 'c1', name: 'Stoop Ronin · Lab' }));
  assert.strictEqual(C.addItem(p, { type: 'chat', ref: 'c1', name: 'renamed' }), null);
  assert.strictEqual(p.items.length, 1);
  assert.strictEqual(p.items[0].name, 'renamed');
  assert.strictEqual(C.addItem(p, { type: 'nope', ref: 'x' }), null);
  const q = C.create({ id: 'pjy' });
  assert.match(q.name, /^(Gold|Ember|Violet|Rose|Sky|Mint|Lime|Ice) \w+$/);
});
ok('changes stamp updated; remove, cover, status, notes, rename, look', () => {
  const p = C.create({ id: 'pj1', name: 'A', at: 1 });
  C.addItem(p, { type: 'scene', ref: 's1' }, 5);
  assert.strictEqual(p.updated, 5);
  assert.ok(C.setCover(p, 'scene:s1', 6));
  assert.ok(!C.setCover(p, 'scene:nope', 7) || p.cover === null);
  C.setCover(p, 'scene:s1', 8);
  assert.ok(C.removeItem(p, 'scene', 's1', 9));
  assert.strictEqual(p.cover, null);
  assert.ok(C.setStatus(p, 'done') && !C.setStatus(p, 'weird'));
  assert.ok(C.setNotes(p, 'x') && !C.setNotes(p, 'x'));
  assert.ok(C.rename(p, '  Neon  Rose ') && p.name === 'Neon Rose');
  const was = p.ident.color;
  assert.ok(C.setIdent(p, { ci: p.ident.ci + 1 }) && p.ident.color !== was);
});
ok('normalize: keeps lists of objects with ids (sync merges them item by item), drops broken rows', () => {
  const p = C.create({ id: 'pjn', name: 'N', items: [{ type: 'chat', ref: 'c' }] });
  const d = C.normalize({ list: [p, null, { id: 3 }, { ...p, id: 'pjm', status: 'zzz', items: [{ type: 'chat', ref: 'c' }, { type: 'bad', ref: 'x' }] }], dismissed: ['stoop ronin', 4] });
  assert.strictEqual(d.list.length, 2);
  assert.strictEqual(d.list[1].status, 'active');
  assert.deepStrictEqual(d.list[1].items.map((x) => x.id), ['chat:c']);
  assert.deepStrictEqual(d.dismissed, ['stoop ronin']);
  assert.deepStrictEqual(C.normalize(null), { v: 1, list: [], dismissed: [] });
  // small: no pictures, only refs and names
  assert.ok(JSON.stringify(d).length < 2000);
});
ok('merge with sync-merge: two computers add different items to the same project, both stay', () => {
  const SM = require(path.join(__dirname, '..', 'sync-merge.js'));
  const base = { v: 1, list: [C.create({ id: 'pjm', name: 'M', at: 1 })], dismissed: [] };
  const mac = JSON.parse(JSON.stringify(base)); const pc = JSON.parse(JSON.stringify(base));
  C.addItem(mac.list[0], { type: 'chat', ref: 'mac-chat' }, 10);
  C.addItem(pc.list[0], { type: 'scene', ref: 'pc-scene' }, 11);
  pc.list.push(C.create({ id: 'pjnew', name: 'New on PC', at: 12 }));
  const r = SM.merge3(base, mac, pc);
  const m = r.value.list.find((x) => x.id === 'pjm');
  assert.deepStrictEqual(m.items.map((x) => x.id).sort(), ['chat:mac-chat', 'scene:pc-scene']);
  assert.ok(r.value.list.some((x) => x.id === 'pjnew'));
});
ok('keys: names to words, generic words out ("Stoop Ronin · Lab" → stoop ronin)', () => {
  assert.ok(C.keysOf('Stoop Ronin · Lab').has('stoop ronin'));
  assert.ok(C.keysOf('stoop-ronin').has('stoop ronin'));
  assert.ok(!C.keysOf('New chat').size);
  assert.ok(!C.keysOf('Lab scene 2').size);
});
const things = [
  { type: 'chat', ref: 'c1', name: 'Stoop Ronin · Lab', at: NOW - 1 * DAY, links: ['scene:s1'] },
  { type: 'chat', ref: 'c2', name: 'Stoop Ronin characters', at: NOW - 2 * DAY },
  { type: 'chat', ref: 'c3', name: 'stoop ronin website', at: NOW - 1 * DAY },
  { type: 'chat', ref: 'c4', name: 'Ronin stoop?', at: NOW - 3 * DAY },
  { type: 'scene', ref: 's1', name: 'Neon Rose', at: NOW - 1 * DAY, links: ['chat:c1'] },
  { type: 'scene', ref: 's2', name: 'Stoop Ronin intro', at: NOW - 2 * DAY },
  { type: 'file', ref: '/ws/stoop-ronin', name: 'stoop-ronin', at: NOW - 1 * DAY },
  { type: 'chat', ref: 'c9', name: 'Tax questions', at: NOW },
  { type: 'chat', ref: 'c10', name: 'New chat', at: NOW },
];
ok('suggest: "N chats and M scenes are about “Stoop Ronin”", links join (the chat\'s scene), unrelated stay out', () => {
  const s = C.suggest(things, { now: NOW });
  assert.strictEqual(s.length >= 1, true);
  const top = s[0];
  assert.strictEqual(top.name, 'Stoop Ronin');
  const ids = top.things.map((t) => `${t.type}:${t.ref}`);
  for (const id of ['chat:c1', 'chat:c2', 'chat:c3', 'scene:s1', 'scene:s2', 'file:/ws/stoop-ronin']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('chat:c9') && !ids.includes('chat:c10'));
  assert.match(top.why, /chats.*scenes.*are about “Stoop Ronin”/);
});
ok('suggest: things already in a project and dismissed suggestions stay out; too few is no suggestion', () => {
  const taken = new Set(['chat:c1', 'chat:c2', 'chat:c3', 'chat:c4', 'scene:s2', 'file:/ws/stoop-ronin']);
  assert.ok(!C.suggest(things, { taken, now: NOW }).some((x) => x.key === 'stoop ronin'));
  assert.ok(!C.suggest(things, { dismissed: new Set(['stoop ronin', 'stoop', 'ronin']), now: NOW }).length);
  assert.ok(!C.suggest(things.slice(7), { now: NOW }).length);
});
ok('suggest: timing keeps old namesakes out (60 days), one kind needs 4+', () => {
  const t = [
    { type: 'chat', ref: 'a', name: 'Moth Garden', at: NOW }, { type: 'scene', ref: 'b', name: 'moth garden glow', at: NOW - DAY },
    { type: 'board', ref: 'c', name: 'Moth Garden refs', at: NOW - 2 * DAY }, { type: 'chat', ref: 'old', name: 'garden moth notes', at: NOW - 200 * DAY },
  ];
  const s = C.suggest(t, { now: NOW });
  assert.strictEqual(s[0].things.length, 3);
  assert.ok(!s[0].things.some((x) => x.ref === 'old'));
  const one = [1, 2, 3].map((i) => ({ type: 'chat', ref: `x${i}`, name: `Kiln talk ${i}`, at: NOW }));
  assert.ok(!C.suggest(one, { now: NOW }).length);
});
ok('search: every word must be there; title hits first, then body (code, captions), recent breaks ties', () => {
  const docs = [
    { type: 'scene', ref: 's1', title: 'Neon Rose', body: 'const p = tweak({ bloom: 1 }) particles', at: NOW - 40 * DAY },
    { type: 'chat', ref: 'c1', title: 'Bloom ideas', at: NOW - DAY },
    { type: 'board', ref: 'b1', title: 'Refs', body: 'a soft bloom caption', at: NOW },
    { type: 'command', ref: 'bloom', title: '/bloom', sub: 'glow' },
  ];
  const hits = C.search('bloom', docs, { now: NOW });
  assert.deepStrictEqual(hits.map((h) => h.ref).slice(0, 2), ['bloom', 'c1']);
  assert.strictEqual(hits.length, 4);
  assert.deepStrictEqual(C.search('bloom particles', docs, { now: NOW }).map((h) => h.ref), ['s1']);
  assert.deepStrictEqual(C.search('bloom', docs, { type: 'board', now: NOW }).map((h) => h.ref), ['b1']);
  assert.deepStrictEqual(C.search('   ', docs), []);
  assert.match(C.snippet('x'.repeat(100) + ' the bloom pass ' + 'y'.repeat(100), 'bloom'), /^….*bloom/);
});
ok('sliders: named controls from tweak({ … })', () => {
  assert.deepStrictEqual(C.sliderNames("const P = tweak({ speed: [1, 0, 5], glow: { value: 1.2, min: 0, max: 3 }, tint: '#ff3cac' });"), ['speed', 'glow', 'tint']);
  assert.deepStrictEqual(C.sliderNames('no sliders'), []);
});
ok('cover: chosen by hand first, then the latest render / still, then the latest scene', () => {
  const p = C.create({ id: 'pjc', items: [{ type: 'scene', ref: 'old', at: 1 }, { type: 'scene', ref: 'new', at: 2 }, { type: 'chat', ref: 'c', at: 3 }] });
  const pics = { 'scene:old': 'old.jpg', 'scene:new': 'new.jpg', 'render:r': 'r.png' };
  const look = { thumb: (x) => pics[x.id] || null, time: () => 0 };
  assert.strictEqual(C.cover(p, look), 'new.jpg');
  C.addItem(p, { type: 'render', ref: 'r', at: 4 });
  assert.strictEqual(C.cover(p, look), 'r.png');
  C.setCover(p, 'scene:old');
  assert.strictEqual(C.cover(p, look), 'old.jpg');
  assert.strictEqual(C.cover(C.create({ id: 'e' }), look), null);
});
ok('continue: the latest of a kind by its own time (a chat answered later wins)', () => {
  const p = C.create({ id: 'pjl', items: [{ type: 'chat', ref: 'a', at: 1 }, { type: 'chat', ref: 'b', at: 2 }, { type: 'scene', ref: 's', at: 3 }] });
  assert.strictEqual(C.latest(p, 'chat').ref, 'b');
  assert.strictEqual(C.latest(p, 'chat', (x) => (x.ref === 'a' ? 99 : 0)).ref, 'a');
  assert.strictEqual(C.latest(p, ['render', 'capture']), null);
  assert.strictEqual(C.countText(p), '2 chats · 1 scene');
});

console.log(`${n - failed}/${n} passed`);
if (failed) process.exit(1);
