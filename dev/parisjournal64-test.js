// (round 64, parisjournal64) My Paris: unit tests for tools/parisjournal-core.js on fixture records (a quest journal with
// finished / half-done place quests, a personal quest, a finished and a half-walked walk, a show log, park takes, a visit
// stamp): moments by kind, month and arrondissement, pins, the monthly recap (counts, the 20 arrondissements, what's new,
// Paris explored %), month words, and that nothing it reads is changed.
//   node dev/parisjournal64-test.js
'use strict';
const assert = require('node:assert/strict');
const C = require('../tools/quest-core');
const P = require('../tools/quest-paris');
const K = require('../tools/parisjournal-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const at = (y, m, d, h = 15) => new Date(y, m - 1, d, h).toISOString(); // the computer's own calendar, like the app

// ---------- fixtures ----------
function journal() {
  const s = C.upgrade(C.initial()); P.addGuide(s);
  const finish = (c, when, { photo = '', note = '', upto = c.quests.length } = {}) => c.quests.slice(0, upto).forEach((q, i) => {
    s.records[q.id] = { startedAt: when, completedAt: when };
    if (photo && i === upto - 1) (s.submissions ||= {})[q.id] = [{ id: 'sub-' + q.id, at: when, proof: { type: 'chat', title: 'Fixture field note', chatId: 'chat-fixture', agentId: 'astra', messageId: '1', excerpt: note, analysis: '', coverage: 'Fixture only', images: [photo], fingerprint: 'a'.repeat(64) }, intent: '', brief: q.done, review: null }];
  });
  finish(P.startPlace(s, 'pp-superfly'), at(2026, 9, 12), { photo: '/fixture/superfly.jpg', note: '# Superfly\nThe counter played me a Brazilian record' });
  finish(P.startPlace(s, 'pp-bataclan'), at(2026, 10, 3));
  finish(P.startPlace(s, 'pp-sainte-chapelle'), at(2026, 10, 6), { upto: 2 }); // not finished: no moment
  finish(P.startPersonal(s, 'airpods'), at(2026, 10, 5));
  finish(P.startPersonal(s, 'drink'), at(2026, 10, 7)); // no pin: never on the map
  const walk = (id, stops, when, upto) => {
    const c = { id, title: 'Walk: ' + stops.map((x) => P.byId(x).name).join(' → '), subtitle: 'PARIS / WALK / 2 H', path: 'life', badge: 'Paris walker', why: 'fixture',
      walk: { v: 1, budget: 120, m: 2300, km: 2.3, total: 100, start: { id: null, name: 'Métro A', lat: 48.86, lon: 2.37 }, end: { id: null, name: 'Métro B', lat: 48.87, lon: 2.37 }, stops: stops.map((x) => ({ id: x, name: P.byId(x).name, lat: P.byId(x).lat, lon: P.byId(x).lon, kind: P.byId(x).kind })), link: '' },
      quests: stops.map((x, i) => ({ id: `q-${id.slice(2)}-${i + 1}`, title: `${i + 1}. ${P.byId(x).name}`, done: 'fixture', tiny: 'fixture', deep: 'fixture', minutes: 30, xp: 25, tool: null, place: x })) };
    s.campaigns.push(c); finish(c, when, { upto });
  };
  walk('c-walk-fixture1', ['pp-betinos', 'pp-denoyez', 'place-canal'], at(2026, 10, 10), 3);
  walk('c-walk-fixture2', ['pp-rex', 'pp-cigale'], at(2026, 10, 11), 1); // only the first stop walked
  s.atlas.places.find((p) => p.id === 'pp-philharmonie').visitedAt = at(2026, 8, 30); // a visit stamp (August)
  return s;
}
const show = (key, title, start, venue, extra = {}) => ({ id: `went-${key}`, key, show: { key, title, start, end: null, doors: null, venue: { key: '', url: '', ...venue }, lineup: ['Fixture Artist'], links: {}, tickets: [], platforms: [] }, rating: null, moment: 'fixture moment', photo: null, note: '', questId: '', at: new Date(start).toISOString(), updatedAt: new Date(start).toISOString(), ...extra });
const shows = () => ({ v: 1, prep: {}, went: [
  show('cigale1026', 'Arlo at La Cigale', Date.parse(at(2026, 10, 4, 20)), { name: 'La Cigale', address: '120 boulevard de Rochechouart, 75018 Paris', lat: 48.8822, lon: 2.3404 }, { rating: 5, moment: 'The encore with the whole room singing', photo: { path: '/fixture/ref.jpg', jpg: '/fixture/cigale.jpg' } }),
  show('glazart926', 'Night at Glazart', Date.parse(at(2026, 9, 20, 21)), { name: 'Glazart', address: '7 avenue de la Porte de la Villette, 75019 Paris', lat: null, lon: null }, { rating: 3 }), // (parisdedupe64) was Le Trabendo: Codex's 60-place guide now has it, so it pins
  show('gone0926', 'Removed night', Date.parse(at(2026, 9, 21, 21)), { name: 'Petit Bain', address: '', lat: 48.8355, lon: 2.3762 }, { removedAt: at(2026, 9, 22) }),
] });
const take = (folder, place, when, extra = {}) => ({ v: 1, id: 'take-' + Date.parse(when).toString(36), at: when, week: '2026-W41', sketch: folder, folder, place, bars: 8, beats: 4, bpm: 96, seconds: 20, notes: 14, instrument: 'Vital', loop: `/fixture/park/${folder}/${place} loop.wav`, ...extra });
const takes = () => [
  take('Park sketch · Belleville · 12 Oct', 'Belleville', at(2026, 10, 12, 15)),
  take('Park sketch · Belleville · 12 Oct', 'Belleville', at(2026, 10, 12, 16), { layered: '/fixture/park/b layered.wav' }),
  take('Park sketch · Buttes-Chaumont · 14 Oct', 'Buttes-Chaumont', at(2026, 10, 14, 17)),
];
const all = () => { const s = journal(); return { s, list: K.collect({ C, s, P, shows: shows(), takes: takes() }) }; };

// ---------- tests ----------
test('moments: finished place quests, a personal quest with a pin, walks (whole or a stop), shows, park sessions', () => {
  const { list } = all(), by = (k) => list.filter((m) => m.kind === k);
  assert.deepEqual(by('place').map((m) => m.id).sort(), ['place-c-pp-bataclan', 'place-c-pp-superfly', 'place-c-pq-airpods', 'stop-q-walk-fixture2-1'].sort());
  assert.equal(by('walk').length, 1); assert.equal(by('show').length, 2); assert.equal(by('park').length, 2);
  assert(!list.some((m) => /sainte-chapelle|drink|gone0926/.test(m.id)), 'half-done quests, pinless personal quests and removed nights stay out');
  assert.deepEqual(list.map((m) => m.at), [...list.map((m) => m.at)].sort().reverse(), 'newest first');
  const w = by('walk')[0]; assert.deepEqual(w.arrs.sort((a, b) => a - b), [10, 11, 20]); assert.deepEqual(w.places, ['pp-betinos', 'pp-denoyez', 'place-canal']); assert.equal(w.place.id, 'pp-betinos');
  const stop = list.find((m) => m.id === 'stop-q-walk-fixture2-1'); assert.equal(stop.place.id, 'pp-rex'); assert.equal(stop.via, 'Walk: Rex Club → La Cigale');
});

test('the moment itself: photo, the owner\'s own words, rating, the loop to play', () => {
  const { list } = all(), get = (id) => list.find((m) => m.id === id);
  const sf = get('place-c-pp-superfly'); assert.equal(sf.photo, '/fixture/superfly.jpg'); assert.equal(sf.note, 'The counter played me a Brazilian record'); assert.equal(sf.month, '2026-09');
  const cg = get('show-cigale1026'); assert.equal(cg.photo, '/fixture/cigale.jpg'); assert.equal(cg.rating, 5); assert.match(cg.note, /encore/);
  const bv = list.find((m) => m.kind === 'park' && /Belleville/.test(m.title));
  assert.equal(bv.loop, '/fixture/park/b layered.wav', 'the newest take, layered when there is one'); assert.equal(bv.loops.length, 2); assert.match(bv.note, /^2 loops · 8 bars at 96 BPM/);
  assert.equal(bv.place.id, 'pp-belleville-view'); assert.equal(bv.at, at(2026, 10, 12, 15), 'a session starts at its first take');
});

test('arrondissements: the guide\'s own, a Paris postcode, the nearest centre inside Paris, none outside', () => {
  const { list } = all(), get = (id) => list.find((m) => m.id === id);
  assert.deepEqual(get('show-cigale1026').arrs, [18]);
  const tr = get('show-glazart926'); assert.deepEqual(tr.arrs, [19], 'from 75019 in the address'); assert(tr.pinless, 'no coordinates: counted, not pinned');
  assert.deepEqual(get('place-c-pq-airpods').arrs, [9]);
  assert.equal(K.arrOf({ address: '1 avenue Foch, 75116 Paris' }), 16);
  assert.equal(K.arrOf({ address: '5 rue X, 75020' }), 20);
  assert.equal(K.arrOf({ lat: 48.8650, lon: 2.3780 }), 11, 'Oberkampf');
  assert.equal(K.arrOf({ lat: 48.8049, lon: 2.1204 }), null, 'Versailles is not Paris');
  assert.equal(K.arrOf({ lat: 48.8462, lon: 2.4380 }), null, 'Vincennes (outside the ring) is not an arrondissement');
  assert.equal(K.arrOf({ arr: 7, address: '75011' }), 7, 'a place\'s own arrondissement wins');
});

test('months and pins: by month, one pin per spot, photos on pins, pinless moments left off the map', () => {
  const { list } = all();
  assert.deepEqual(K.months(list).map((m) => [m.key, m.n]), [['2026-10', 7], ['2026-09', 2]]);
  const oct = K.pins(list, '2026-10'), ids = oct.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length); assert(ids.every((x) => x.startsWith('mp-')));
  assert.equal(oct.length, 7, 'seven October moments at seven spots');
  const cg = oct.find((p) => p.moments.includes('show-cigale1026')); assert.equal(cg.photo, '/fixture/cigale.jpg'); assert.equal(cg.kind, 'music');
  const sep = K.pins(list, '2026-09'); assert.equal(sep.length, 1, 'Glazart has no coordinates: only Superfly is pinned in September');
  assert.equal(K.pins(list, '').length, 8);
  // two moments at one place share a pin
  const two = [...list, { ...list.find((m) => m.id === 'place-c-pp-bataclan'), id: 'show-x', kind: 'show', month: '2026-10' }];
  const bt = K.pins(two, '2026-10').find((p) => p.moments.includes('show-x')); assert.equal(bt.moments.length, 2); assert.match(bt.name, /· 2$/);
});

test('the monthly recap: counts, the 20 arrondissements, new this month, Paris explored', () => {
  const { s, list } = all(), r = K.recap(list, '2026-10', { guide: P.guide, stamps: K.stamps(s) });
  assert.deepEqual(r.counts, { place: 3, show: 1, walk: 1, park: 2 });
  assert.equal(r.arrs.length, 20);
  const lit = r.arrs.map((n, i) => (n ? i + 1 : 0)).filter(Boolean); assert.deepEqual(lit, [2, 9, 10, 11, 18, 19, 20]);
  assert.equal(r.arrs[10], 2, '11e: the Bataclan and the walk through Betino’s'); assert.equal(r.arrCount, 7);
  assert.deepEqual(r.newArrs, [2, 9, 10, 11, 18, 20], '19e was already lit in September (the Trabendo)');
  assert(r.newSpots.includes('Le Bataclan') && r.newSpots.includes('Rue Dénoyez') && !r.newSpots.includes('Superfly Records'));
  // explored: guide places with a moment or a visit stamp, up to the end of the month
  const want = ['pp-superfly', 'pp-philharmonie', 'pp-bataclan', 'pp-betinos', 'pp-denoyez', 'place-canal', 'pp-rex', 'pp-cigale', 'pp-belleville-view', 'place-buttes'];
  assert.deepEqual(r.explored.ids.sort(), want.sort());
  assert.equal(r.explored.total, P.guide.length); assert.equal(r.explored.pct, Math.round(want.length / P.guide.length * 100));
  assert.equal(r.explored.gained, 8); assert.equal(r.explored.before, Math.round(2 / P.guide.length * 100), 'September ended with Superfly + the stamped Philharmonie');
  assert.equal(r.best.id, 'show-cigale1026');
  const sep = K.recap(list, '2026-09', { guide: P.guide, stamps: K.stamps(s) });
  assert.deepEqual(sep.counts, { place: 1, show: 1, walk: 0, park: 0 }); assert.deepEqual(sep.newArrs, [3, 19]);
  const aug = K.recap(list, '2026-08', { guide: P.guide, stamps: K.stamps(s) }); assert.equal(aug.total, 0); assert.equal(aug.explored.n, 1, 'a stamp counts toward explored');
  assert.match(K.recapText(aug), /nothing on your Paris map yet/);
  const text = K.recapText(r);
  assert.match(text, /^October 2026 in Paris: 3 places · 1 show · 1 walk · 2 park sessions\./); assert.match(text, /7 of 20 arrondissements/); assert.match(text, /Paris explored: \d+% of the guide's \d+ places \(\+8 this month\)/);
});

test('the image card\'s content: tiles, grid, explored, up to 3 photos, a safe file name', () => {
  const { s, list } = all(), c = K.card(K.recap(list, '2026-10', { guide: P.guide, stamps: K.stamps(s) }));
  assert.deepEqual(c.tiles.map((t) => [t.n, t.label]), [[3, 'Places'], [1, 'Show'], [1, 'Walk'], [2, 'Park sessions']]);
  assert.equal(c.arrs.length, 20); assert(c.photos.length <= 3 && c.photos.includes('/fixture/cigale.jpg'));
  assert.equal(K.fileName('2026-10'), 'My Paris 2026-10.png');
});

test('month words: names (English / French), short, with a year, last / this, YYYY-MM', () => {
  const now = new Date(2026, 9, 18);
  const cases = { '': '2026-10', this: '2026-10', october: '2026-10', oct: '2026-10', octobre: '2026-10', september: '2026-09', 'sept.': '2026-09', last: '2026-09', november: '2025-11', 'dec 2024': '2024-12', '2026-3': '2026-03', '3/2026': '2026-03', 'août': '2026-08' };
  for (const [w, want] of Object.entries(cases)) assert.equal(K.parseMonth(w, now), want, w);
  for (const w of ['banana', 'ju', '2026-13']) assert.equal(K.parseMonth(w, now), null, w);
  assert.equal(K.monthName('2026-10'), 'October 2026'); assert.equal(K.monthName('2026-10', true), 'Oct 2026');
  assert.equal(K.shiftMonth('2026-01', -1), '2025-12');
});

test('reads only: the journal, the show log and the takes are left exactly as they were', () => {
  const s = journal(), sh = shows(), tk = takes(), before = JSON.stringify([s, sh, tk]);
  const list = K.collect({ C, s, P, shows: sh, takes: tk }); K.recap(list, '2026-10', { guide: P.guide, stamps: K.stamps(s) }); K.pins(list, '');
  assert.equal(JSON.stringify([s, sh, tk]), before);
  C.validate(s); // still a journal Codex's rules accept
  assert.deepEqual(K.collect({ C, s: C.upgrade(C.initial()), P, shows: null, takes: [] }), [], 'a fresh journal: no moments');
  assert.deepEqual(K.collect({ C, s: null, P }), [], 'no journal: nothing, no error');
});

console.log(`\nparisjournal64-test: ${checks} checks passed`);
