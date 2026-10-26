// (round 66, herepin66) "I'm here" on the Paris map: unit tests for tools/herepin-core.js — distance and walking minutes
// (~4.5 km/h, "about N min walk"), the pin (inside Paris, forgotten after 3 hours, lighter each hour), tonight's shows
// (until 6 am, ended / cancelled out), the candidates from the real Paris guide (park-jam spots by their 'jam' tag) and
// the ranking (nearest first, within 45 min, ties: show → jam → place → name, de-duplicated, limited), the tracker row.
//   node dev/herepin66-test.js
'use strict';
const assert = require('node:assert/strict');
const K = require('../tools/herepin-core');
const P = require('../tools/quest-paris');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const H = 3600e3;
const NOW = new Date(2026, 9, 24, 20, 0).getTime(); // a Saturday, 20:00 on this computer's clock

// a point d metres east of `a` (for exact distances)
const east = (a, d) => ({ lat: a.lat, lon: a.lon + d / (111320 * Math.cos(a.lat * Math.PI / 180)) });
const here = { lat: 48.8656, lon: 2.3780, at: NOW }; // Oberkampf

test('distance: haversine in metres, symmetric, 0 on the spot', () => {
  assert.equal(K.metres(here, here), 0);
  const b = east(here, 1000);
  assert.ok(Math.abs(K.metres(here, b) - 1000) < 2, String(K.metres(here, b)));
  assert.equal(Math.round(K.metres(here, b)), Math.round(K.metres(b, here)));
  // République → Bastille is about 1.6 km as the crow flies
  const d = K.metres({ lat: 48.8674, lon: 2.3636 }, { lat: 48.8532, lon: 2.3692 });
  assert.ok(d > 1500 && d < 1700, String(d));
});

test('walking minutes at 4.5 km/h, never 0, labelled "about N min walk"', () => {
  assert.equal(K.KMH, 4.5);
  assert.equal(K.minutes(4500), 60);
  assert.equal(K.minutes(750), 10);
  assert.equal(K.minutes(375), 5);
  assert.equal(K.minutes(0), 1);
  assert.equal(K.minutes(30), 1);
  assert.equal(K.walkText(7), 'about 7 min walk');
});

test('the pin: inside Paris only, rounded, kept as { lat, lon, at }', () => {
  const p = K.make(48.86561234567, 2.37801234567, NOW);
  assert.deepEqual(p, { lat: 48.865612, lon: 2.378012, at: NOW });
  assert.throws(() => K.make(51.5, -0.12, NOW), /outside the Paris map/);
  assert.throws(() => K.make(NaN, 2.35, NOW));
  assert.equal(K.valid(null), null);
  assert.equal(K.valid({ lat: 48.86, lon: 2.35 }), null); // no time
  assert.equal(K.valid('48.86,2.35'), null);
  assert.deepEqual(K.valid({ lat: '48.86', lon: '2.35', at: String(NOW) }), { lat: 48.86, lon: 2.35, at: NOW });
});

test('the pin fades after 3 hours (and gets lighter each hour)', () => {
  const p = K.make(48.86, 2.35, NOW);
  assert.ok(K.fresh(p, NOW));
  assert.ok(K.fresh(p, NOW + 2 * H + 59 * 60e3));
  assert.equal(K.fresh(p, NOW + 3 * H), null);
  assert.equal(K.fresh(p, NOW + 30 * H), null);
  assert.equal(K.fresh({ ...p, at: NOW + 10 * 60e3 }, NOW), null); // set "in the future" (a clock change): not trusted
  assert.deepEqual([0, 1, 2, 2.9].map((h) => K.age(p, NOW + h * H)), [0, 1, 2, 2]);
  assert.equal(K.ageText(p, NOW + 20e3), 'just now');
  assert.equal(K.ageText(p, NOW + 25 * 60e3), '25 min ago');
  assert.equal(K.ageText(p, NOW + 80 * 60e3), '1 h 20 ago');
  assert.equal(K.leftText(p, NOW + 25 * 60e3), 'fades in 2 h 35');
  assert.equal(K.leftText(p, NOW + 2 * H), 'fades in 1 h');
});

const show = (o) => ({ key: o.key, title: o.title || o.key, start: o.start, end: o.end, dateOnly: !!o.dateOnly, cancelled: !!o.cancelled, venue: { name: o.venue || 'Venue', ...(o.at || {}) } });
test('tonight runs until 6 am; ended and cancelled shows are out', () => {
  assert.equal(new Date(K.tonightEnd(NOW)).getHours(), 6);
  assert.equal(K.tonightEnd(NOW) - NOW, 10 * H); // 20:00 → 06:00 next day
  const late = new Date(2026, 9, 25, 2, 0).getTime(); // 2 am: still "tonight" until 6 am the same morning
  assert.equal(K.tonightEnd(late), new Date(2026, 9, 25, 6, 0).getTime());
  assert.ok(K.isTonight(show({ key: 'a', start: NOW + 3 * H }), NOW)); // 23:00
  assert.ok(K.isTonight(show({ key: 'b', start: NOW + 6 * H }), NOW)); // 2 am
  assert.ok(K.isTonight(show({ key: 'c', start: NOW - 2 * H }), NOW)); // started at 18:00, still on (4 h)
  assert.ok(!K.isTonight(show({ key: 'd', start: NOW - 5 * H }), NOW)); // 15:00 + 4 h: over
  assert.ok(!K.isTonight(show({ key: 'e', start: NOW + 11 * H }), NOW)); // tomorrow 7 am
  assert.ok(!K.isTonight(show({ key: 'f', start: NOW + 26 * H }), NOW)); // tomorrow night
  assert.ok(!K.isTonight(show({ key: 'g', start: NOW + H, cancelled: true }), NOW));
  const dateOnly = show({ key: 'h', start: new Date(2026, 9, 24).getTime(), dateOnly: true }); // a date only (time to confirm)
  assert.ok(K.isTonight(dateOnly, NOW - 8 * H)); // at noon: today's, so tonight's
  assert.ok(!K.isTonight(dateOnly, NOW)); // showsync's own rule: a date-only listing counts until 18:00
});

test('candidates: every Paris guide place, park-jam spots by their tag, tonight’s shows with a known spot', () => {
  const shows = [
    show({ key: 'near', start: NOW + 2 * H, venue: 'Le Pop-Up', at: east(here, 300) }),
    show({ key: 'pin', start: NOW + 3 * H, venue: 'La Maroquinerie' }), // no coordinates: the map's venue pin gives them
    show({ key: 'nowhere', start: NOW + 3 * H, venue: 'Somewhere' }), // no spot at all: left out
    show({ key: 'tomorrow', start: NOW + 26 * H, at: east(here, 100) }),
  ];
  const venueAt = (s) => (s.venue.name === 'La Maroquinerie' ? { lat: 48.8687, lon: 2.3925 } : null);
  const c = K.candidates({ guide: P.guide, shows, venueAt, now: NOW });
  const guideIn = P.guide.filter((g) => K.inParis(g.lat, g.lon));
  assert.equal(c.filter((x) => x.kind !== 'show').length, guideIn.length);
  const jams = c.filter((x) => x.kind === 'jam');
  assert.ok(jams.length >= 4, String(jams.length));
  assert.ok(jams.every((x) => x.tags.includes('jam')));
  assert.ok(jams.some((x) => x.id === 'place-buttes') && jams.some((x) => x.id === 'pp-belleville-view'));
  assert.deepEqual(c.filter((x) => x.kind === 'show').map((x) => x.id).sort(), ['show:near', 'show:pin']);
  assert.equal(c.find((x) => x.id === 'show:pin').lat, 48.8687);
});

test('rank: nearest first by walking minutes, within 45 min, limited, ties show → jam → place, no duplicates', () => {
  const it = (id, kind, d, name = id) => ({ id, kind, name, ...east(here, d) });
  const r = K.rank(here, [it('far', 'place', 3600), it('b', 'place', 800), it('a', 'jam', 200), it('s', 'show', 200), it('p', 'place', 200), it('b', 'place', 800), it('x', 'place', 1600)]);
  assert.deepEqual(r.map((x) => x.id), ['s', 'a', 'p', 'b', 'x']); // 3.6 km = 48 min: out
  assert.deepEqual(r.map((x) => x.min), [3, 3, 3, 11, 21]);
  assert.equal(r[3].walk, 'about 11 min walk');
  assert.ok(Math.abs(r[3].m - 800) <= 2, String(r[3].m)); // whole metres
  assert.ok(r.every((x, i) => !i || x.m >= r[i - 1].m));
  const many = Array.from({ length: 20 }, (_, i) => it('n' + i, 'place', 100 + i * 50));
  assert.equal(K.rank(here, many).length, K.LIMIT);
  assert.deepEqual(K.rank(here, many, { limit: 3 }).map((x) => x.id), ['n0', 'n1', 'n2']);
  assert.deepEqual(K.rank(here, many, { maxMin: 5 }).map((x) => x.id), ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']); // ≤ 375 m
  assert.deepEqual(K.rank(null, many), []);
  assert.deepEqual(K.rank({ lat: 10, lon: 10 }, many), []); // a pin outside Paris: nothing
});

test('rank on the real guide from Oberkampf: real places, sorted, all walkable', () => {
  const c = K.candidates({ guide: P.guide, now: NOW });
  const r = K.rank(here, c);
  assert.ok(r.length >= 3, String(r.length));
  assert.ok(r.every((x) => x.min <= 45 && P.byId(x.id)));
  assert.ok(r.every((x, i) => !i || x.m >= r[i - 1].m));
  // the walk matches the distance at 4.5 km/h (±1 min of rounding)
  for (const x of r) assert.ok(Math.abs(x.min - (x.m / 4500) * 60) <= 1, `${x.id} ${x.m} m ${x.min} min`);
});

test('the tracker’s "Near me" row: only while the pin is fresh', () => {
  const p = K.make(48.86, 2.35, NOW);
  assert.equal(K.hud(null, NOW), null);
  assert.equal(K.hud(p, NOW + 3 * H), null);
  assert.equal(K.hud(p, NOW).text, '📍 Near me');
  assert.equal(K.hud(p, NOW, 4).text, '📍 Near me · 4 close');
  assert.equal(K.hud(p, NOW, 0).text, '📍 Near me · nothing close');
  assert.match(K.hud(p, NOW + 30 * 60e3).title, /set 30 min ago \(fades in 2 h 30\)/);
});

console.log(`\nherepin66-test: ${checks} checks passed`);
