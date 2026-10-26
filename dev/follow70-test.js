// (round 70, follow70) ★ Follow artists and venues: the matching (case, accents, "feat.", "b2b", "DJ", "(live)", "The",
// "&" / "and", a title with no lineup, venues with or without "Le / La / Paris / Club"), the card's buttons, ★ New only
// for shows a later sync brings in (not the ones listed when you follow), any date ahead, Dismiss / made a quest, the
// store (a damaged one throws, never reads as empty; merge: the newer change wins), suggestions from "Shows I went to"
// (two nights or more, not yet followed), Paris dates whatever the computer's zone, and showsync61's fixture shows.
//   node dev/follow70-test.js
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../follow-core');
const SC = require('../showsync-core');
const FX = require('./showsync-fixtures');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const NOW = Date.parse('2026-10-26T12:00:00Z');
const D = 86400e3;
let n = 0;
const show = (o = {}) => ({ key: `k${++n}`, title: 'A night', start: NOW + 3 * D, venue: { name: 'Petit Bain', address: '7 Port de la Gare, 75013 Paris', key: 'petit bain' }, lineup: [], tickets: [{ platform: 'dice', url: 'https://dice.fm/event/x' }], platforms: ['dice'], ...o });
const st = (...follows) => { const s = F.empty(); for (const [kind, name] of follows) F.follow(s, kind, name, [], NOW); return s; };
const hit = (s, sh) => F.hits(s, sh).length > 0;

// ---------- names ----------
test('norm: case, accents, DJ, The, (live), (DJ set), & = and', () => {
  assert.equal(F.norm('ROSALÍA'), F.norm('rosalia'));
  assert.equal(F.norm('Ólafur Arnalds'), 'olafur arnalds');
  assert.equal(F.norm('DJ Koze'), F.norm('Koze'));
  assert.equal(F.norm('dj koze'), 'koze');
  assert.equal(F.norm('The Blaze'), F.norm('Blaze'));
  assert.equal(F.norm('Floating Points (DJ set)'), 'floating points');
  assert.equal(F.norm('Floating Points DJ Set'), 'floating points');
  assert.equal(F.norm('Bon Entendeur – Live'), 'bon entendeur');
  assert.equal(F.norm('Simon & Garfunkel'), F.norm('Simon and Garfunkel'));
  assert.equal(F.norm('L’Impératrice'), F.norm("L'Imperatrice"));
  assert.equal(F.norm('Røyksopp'), 'royksopp');
  assert.equal(F.norm('DJ'), 'dj', '"DJ" alone stays itself');
});
test('parts: b2b, feat., ft, x, vs, with, commas, +, /, &', () => {
  assert.deepEqual(F.parts('Ben UFO b2b Joy Orbison'), ['Ben UFO', 'Joy Orbison']);
  assert.deepEqual(F.parts('Kaytranada feat. Kali Uchis'), ['Kaytranada', 'Kali Uchis']);
  assert.deepEqual(F.parts('Bicep x Hammer'), ['Bicep', 'Hammer']);
  assert.deepEqual(F.parts('Burial ft Kode9, Moor Mother & Lyra'), ['Burial', 'Kode9', 'Moor Mother', 'Lyra']);
  assert.deepEqual(F.parts('Sherelle + Nia Archives'), ['Sherelle', 'Nia Archives']);
  assert.deepEqual(F.parts('Skee Mask B2B Objekt'), ['Skee Mask', 'Objekt'], 'B2B in capitals');
  assert.deepEqual(F.parts('Overmono (live) w/ Special Guests'), ['Overmono']);
  assert.deepEqual(F.parts('Simon & Garfunkel', true), ['Simon & Garfunkel'], 'strict: "&" keeps a band');
});
test('venueKey: Le / La / L’ / Paris / Club / accents / punctuation', () => {
  assert.equal(F.venueKey('Le Bataclan'), F.venueKey('Bataclan'));
  assert.equal(F.venueKey("L'Olympia"), 'olympia');
  assert.equal(F.venueKey('Rex Club'), F.venueKey('Rex'));
  assert.equal(F.venueKey('La Machine du Moulin Rouge'), 'machine moulin rouge');
  assert.equal(F.venueKey('Le Zénith Paris'), F.venueKey('Zenith'));
});

// ---------- matching ----------
test('an artist in the lineup, whatever the spelling', () => {
  const s = st(['artist', 'koze']);
  assert.ok(hit(s, show({ lineup: ['DJ Koze'] })));
  assert.ok(hit(s, show({ lineup: ['DJ KOZE (DJ set)'] })));
  assert.ok(hit(st(['artist', 'DJ Koze']), show({ lineup: ['Koze'] })));
  assert.ok(hit(st(['artist', 'Rosalía']), show({ lineup: ['ROSALIA'] })));
  assert.ok(hit(st(['artist', 'Joy Orbison']), show({ lineup: ['Ben UFO b2b Joy Orbison'] })));
  assert.ok(hit(st(['artist', 'Kali Uchis']), show({ lineup: ['Kaytranada feat. Kali Uchis'] })));
  assert.ok(hit(st(['artist', 'Simon & Garfunkel']), show({ lineup: ['Simon and Garfunkel'] })));
  assert.ok(hit(st(['artist', 'The Blaze']), show({ lineup: ['Blaze'] })));
});
test('no lineup: the title\'s named parts, or the name as whole words in the title', () => {
  assert.ok(hit(st(['artist', 'Nia Archives']), show({ title: 'Rinse Paris: Sherelle + Nia Archives' })));
  assert.ok(hit(st(['artist', 'Floating Points']), show({ title: 'Floating Points all night long' })));
  assert.ok(hit(st(['artist', 'Bon Entendeur']), show({ title: 'Bon Entendeur Live' })));
});
test('no false friends: part of a word, another artist, a short name inside a title', () => {
  assert.ok(!hit(st(['artist', 'Koze']), show({ lineup: ['Kozer'] })));
  assert.ok(!hit(st(['artist', 'Ben UFO']), show({ lineup: ['Ben Klock'] })));
  assert.ok(!hit(st(['artist', 'Ufo']), show({ title: 'Ben UFO all night', lineup: ['Ben UFO'] })), 'a 3-letter name only matches a whole lineup name');
  assert.ok(!hit(st(['artist', 'Points']), show({ title: 'Floating Points', lineup: ['Floating Points'] })), 'one word inside another name');
  assert.ok(!hit(st(['artist', 'Burial']), show({ title: 'Techno Burial Party' })), 'one word in the middle of a title');
  assert.ok(!hit(st(['artist', 'DJ']), show({ lineup: ['DJ Koze'] })));
});
test('a venue, with or without its article / Paris / Club', () => {
  assert.ok(hit(st(['venue', 'Bataclan']), show({ venue: { name: 'Le Bataclan' } })));
  assert.ok(hit(st(['venue', 'Le Bataclan']), show({ venue: { name: 'BATACLAN' } })));
  assert.ok(hit(st(['venue', 'Rex Club']), show({ venue: { name: 'Rex' } })));
  assert.ok(hit(st(['venue', 'La Machine du Moulin Rouge']), show({ venue: { name: 'La Machine' } })), 'a shorter listing name');
  assert.ok(hit(st(['venue', 'Petit Bain']), show({ venue: { name: 'Petit Bain (Paris 13e)' } })));
  assert.ok(!hit(st(['venue', 'Petit Bain']), show({ venue: { name: 'La Cigale' } })));
  assert.ok(!hit(st(['venue', 'Bataclan']), show({ lineup: ['Bataclan'], venue: { name: 'La Cigale' } })), 'a venue follow never matches a lineup');
});
test('hits name who matched (as written in the listing)', () => {
  const h = F.hits(st(['artist', 'koze'], ['venue', 'petit bain']), show({ lineup: ['DJ Koze'] }));
  assert.deepEqual(h.map((x) => [x.kind, x.as]), [['artist', 'DJ Koze'], ['venue', 'Petit Bain']]);
});
test('the card offers each artist on its own, and the band whole', () => {
  assert.deepEqual(F.cardArtists(show({ lineup: ['Ben UFO b2b Joy Orbison', 'Call Super'] })), ['Ben UFO', 'Joy Orbison', 'Call Super']);
  assert.deepEqual(F.cardArtists(show({ lineup: ['Simon & Garfunkel'] })), ['Simon & Garfunkel']);
  assert.deepEqual(F.cardArtists(show({ lineup: ['Bon Entendeur – Live'] })), ['Bon Entendeur']);
  assert.deepEqual(F.cardArtists(show({ title: 'Rinse Paris: Sherelle + Nia Archives' })), ['Sherelle', 'Nia Archives']);
  assert.deepEqual(F.cardArtists(show({ title: 'Possession' })), [], 'a party name alone: only the venue is offered');
  assert.deepEqual(F.cardArtists(show({ lineup: ['DJ Koze', 'Koze'] })), ['DJ Koze'], 'one button per artist');
});

// ---------- follow → news ----------
test('following: the shows already listed are known (★ badge), not "new"', () => {
  const s = F.empty(), a = show({ lineup: ['Floating Points'] }), b = show({ lineup: ['Other'] });
  const r = F.follow(s, 'artist', 'Floating Points', [a, b], NOW);
  assert.equal(r.listed.length, 1); assert.equal(r.already, false);
  assert.deepEqual(F.detect(s, [a, b], NOW), [], 'nothing new');
  assert.equal(F.follow(s, 'artist', 'floating points (dj set)', [], NOW).already, true, 'the same artist twice is one follow');
});
test('a later sync brings a show → one ★ New row, any date ahead, with the words for the tracker', () => {
  const s = st(['artist', 'Floating Points'], ['venue', 'La Cigale']);
  const later = show({ title: 'Floating Points b2b Four Tet', lineup: ['Floating Points b2b Four Tet'], start: Date.parse('2026-11-14T22:00:00Z'), venue: { name: 'Petit Bain' } });
  const far = show({ title: 'Arlo Parks', lineup: ['Arlo Parks'], venue: { name: 'La Cigale' }, start: NOW + 150 * D });
  const fresh = F.detect(s, [later, far, show({ lineup: ['Nobody'] })], NOW);
  assert.equal(fresh.length, 2);
  assert.equal(fresh[0].text, 'Floating Points at Petit Bain, Sat 14 Nov');
  assert.match(fresh[1].text, /^Arlo Parks at La Cigale, /);
  assert.equal(F.detect(s, [later, far], NOW).length, 0, 'the next sync: not new again');
  assert.equal(F.pending(s, NOW).length, 2);
  assert.ok(fresh[0].show.tickets[0].url.startsWith('https://') && typeof fresh[0].show.venue.address === 'string', 'the show kept for Make it a quest / Bring someone');
});
test('past, cancelled or no-key shows never become news; dismissed / made a quest leave the rows', () => {
  const s = st(['artist', 'Koze']);
  assert.equal(F.detect(s, [show({ lineup: ['Koze'], start: NOW - 2 * D }), show({ lineup: ['Koze'], cancelled: true }), show({ lineup: ['Koze'], key: '' })], NOW).length, 0);
  const [a, b] = [show({ lineup: ['Koze'] }), show({ lineup: ['DJ Koze'] })];
  F.detect(s, [a, b], NOW);
  F.mark(s, a.key, 'dismiss', NOW); F.mark(s, b.key, 'quest', NOW);
  assert.equal(F.pending(s, NOW).length, 0);
  assert.equal(F.detect(s, [a, b], NOW).length, 0, 'dismissed stays dismissed');
  assert.equal(F.pending(s, NOW + 30 * D).length, 0);
});
test('unfollow: no more news from them; follow again: back', () => {
  const s = st(['artist', 'Koze']);
  F.unfollow(s, F.fid('artist', 'Koze'), NOW);
  assert.equal(F.active(s).length, 0);
  assert.equal(F.detect(s, [show({ lineup: ['Koze'] })], NOW).length, 0);
  assert.equal(F.follow(s, 'artist', 'Koze', [], NOW + 1000).already, false);
  assert.equal(F.active(s).length, 1);
});
test('empty names refused', () => { assert.throws(() => F.follow(F.empty(), 'artist', ' ', [], NOW)); assert.throws(() => F.follow(F.empty(), 'band', 'x y', [], NOW)); });

// ---------- the store ----------
test('validate: damaged forms throw (never read as empty), odd entries are dropped', () => {
  for (const bad of [null, 'x', [], { v: 2, follows: [], news: [] }, { v: 1, follows: {}, news: [] }, { v: 1, follows: [], news: [], known: [] }, { v: 1, follows: [{ kind: 'planet', name: 'x' }], news: [] }]) assert.throws(() => F.validate(bad), JSON.stringify(bad));
  const s = F.validate({ v: 1, follows: [{ kind: 'artist', name: 'Koze', at: 'x' }, { kind: 'artist', name: 'DJ Koze' }, { kind: 'venue', name: '' }], news: [{ key: 'a', show: { key: 'b', start: 1 } }, null], known: { a: 1, b: 'x' } });
  assert.equal(s.follows.length, 1); assert.equal(s.news.length, 0); assert.deepEqual(s.known, { a: 1 });
});
test('merge: per follow and per row the newer change wins; an unfollow is a change', () => {
  const a = st(['artist', 'Koze']), b = F.validate(a);
  F.unfollow(b, F.fid('artist', 'Koze'), NOW + 5000);
  F.follow(a, 'venue', 'Bataclan', [], NOW + 1000);
  const m = F.merge(a, b, NOW);
  assert.deepEqual(F.active(m).map((f) => f.name), ['Bataclan']);
  const x = st(['artist', 'Koze']); F.detect(x, [show({ key: 'kz', lineup: ['Koze'] })], NOW);
  const y = F.validate(x); F.mark(y, 'kz', 'dismiss', NOW + 9000);
  assert.equal(F.pending(F.merge(x, y, NOW), NOW).length, 0); assert.equal(F.pending(F.merge(y, x, NOW), NOW).length, 0);
  F.validate(m);
});

// ---------- suggestions from "Shows I went to" ----------
test('suggest: artists / venues of two nights or more, not followed, a removed night not counted', () => {
  const night = (k, lineup, venue, o = {}) => ({ id: `went-${k}`, key: k, show: { key: k, title: lineup.join(' + '), start: NOW - 20 * D, venue: { name: venue }, lineup }, moment: 'm', ...o });
  const went = { v: 1, went: [night('a', ['Floating Points'], 'Petit Bain'), night('b', ['Floating Points (DJ set)', 'Four Tet'], 'Le Bataclan'), night('c', ['four tet'], 'Petit Bain'),
    night('d', ['Ben UFO'], 'La Cigale'), night('e', ['Ben UFO'], 'Cigale', { removedAt: '2026-10-01T00:00:00Z' }), night('f', ['Koze', 'DJ Koze'], 'Rex Club')] };
  const s = st(['artist', 'Four Tet']);
  const sug = F.suggest(went, s);
  assert.deepEqual(sug.map((x) => `${x.kind}:${x.name}:${x.n}`), ['artist:Floating Points:2', 'venue:Petit Bain:2']);
  assert.deepEqual(F.suggest({ v: 1, went: [] }, s), []);
  assert.deepEqual(F.suggest(null, s), []);
});

// ---------- Paris dates ----------
test('dates in Paris time, whatever the computer\'s zone (and summer time)', () => {
  assert.equal(F.dateWords(Date.parse('2026-11-14T22:00:00Z')), 'Sat 14 Nov');
  assert.equal(F.dateWords(Date.parse('2026-11-14T23:30:00Z')), 'Sun 15 Nov', '00:30 in Paris');
  assert.equal(F.dateWords(Date.parse('2026-07-03T22:30:00Z')), 'Sat 4 Jul', '00:30 in Paris summer time');
});

// ---------- showsync61's own fixture shows ----------
test('the fixture listings: followed names find their shows', () => {
  const map = FX.responses(), lists = [];
  for (const [u, f] of Object.entries(map)) { if (!f.file || !/html$/.test(f.file)) continue; const src = SC.sourceFromUrl(u); if (!src) continue; lists.push(SC.parsePage(FX.fillDates(fs.readFileSync(path.join(FX.DIR, f.file), 'utf8'), NOW), src).shows); }
  const shows = SC.merge(lists);
  const s = st(['artist', 'call super'], ['artist', 'NIA ARCHIVES'], ['venue', 'Bataclan'], ['artist', 'floating points']);
  const fresh = F.detect(s, shows, NOW - D);
  const titles = fresh.map((x) => x.show.title).sort();
  assert.ok(titles.some((t) => /Ben UFO, Call Super/.test(t)), titles.join(' | '));
  assert.ok(titles.some((t) => /Nia Archives/.test(t)));
  assert.ok(titles.some((t) => /Bon Entendeur/.test(t)));
  assert.ok(titles.some((t) => /Floating Points/.test(t)));
  assert.ok(!titles.some((t) => /Arlo Parks|Possession/.test(t)));
});

console.log(`\n${checks} checks passed (follow70)`);
