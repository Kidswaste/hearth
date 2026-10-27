// (round 71, eatnearby71) unit tests: 🍜 Eat nearby (eatnearby-core.js): which food stops (the Paris guide's "food"
// places, with the journal's ★ stars / ✓ stamps and hours typed by the owner, read by the errands hours parser), open in
// the 2 hours before doors (late nights, lunch-only, closing days, short openings, the October clock change), within
// ~10 min walk, ★ / ✓ first then by walk time; and "Go here first": the leave reminder's stop (leavesoon-core.js) moves
// the leave time earlier by the eat time + the walk to the venue, editable, kept through the store, in the words.
// Paris time (TZ=Europe/Paris), like the owner's computer.
//   node dev/eatnearby71-test.js
'use strict';
process.env.TZ = 'Europe/Paris';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const K = require('../leavesoon-core');
const E = require('../tools/errands-core');
const P = require('../tools/quest-paris');
const C = require('../eatnearby-core');
let checks = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const MIN = 60e3;
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CIGALE = { name: 'La Cigale', lat: 48.8823, lon: 2.3404 };
const BATACLAN = { name: 'Bataclan', lat: 48.8631, lon: 2.3708 };
const HOME = { lat: 48.8606, lon: 2.3780 }; // Oberkampf
const floor5 = (ms) => Math.floor(ms / 3e5) * 3e5;
const week = (text) => E.parse(text);

test('food places: the guide’s food stops only, with ★ / ✓ from the journal and hours typed here', () => {
  const food = P.guide.filter((g) => g.tags.includes('food'));
  const places = [{ id: 'pp-bouillon-pigalle', favorite: true, visitedAt: null }, { id: 'place-x', guide: 'pp-servan', favorite: false, visitedAt: '2026-10-01T20:00:00.000Z' }];
  const list = C.foodPlaces({ guide: P.guide, places, hours: { 'pp-servan': 'Mon–Fri 12:00–14:00, 19:30–22:30 · Sat, Sun closed', 'pp-mokonuts': 'gibberish hours' }, parse: E.parse });
  assert.deepEqual(list.map((x) => x.id).sort(), food.map((g) => g.id).sort()); checks++;
  assert.ok(!list.some((x) => x.id === 'pp-dizonord')); checks++; // a record shop, not food
  const bp = list.find((x) => x.id === 'pp-bouillon-pigalle'), sv = list.find((x) => x.id === 'pp-servan'), mk = list.find((x) => x.id === 'pp-mokonuts');
  assert.equal(bp.starred, true); assert.equal(bp.stamped, false); assert.equal(bp.pin, 'pp-bouillon-pigalle'); checks += 3;
  assert.equal(sv.stamped, true); assert.equal(sv.pin, 'place-x'); assert.equal(sv.mine, true); checks += 3; // a journal place linked to the guide (twin)
  assert.deepEqual(sv.week[1], [[720, 840], [1170, 1350]]); assert.deepEqual(sv.week[0], []); checks += 2;
  assert.equal(mk.week, null); assert.equal(C.openBefore(mk.week, at(2026, 10, 28, 20)).state, 'unknown'); checks += 2; // unreadable → unknown, never a crash
  const g2 = [{ id: 'pp-z', name: 'Z', lat: 48.86, lon: 2.37, tags: ['food'], why: '1 rue Z. A place.', hours: 'Daily 18:00–23:00' }];
  assert.deepEqual(C.foodPlaces({ guide: g2, parse: E.parse })[0].week[3], [[1080, 1380]]); checks++; // a guide entry's own hours, when it has them
  assert.equal(C.foodPlaces({ guide: g2, hours: { 'pp-z': '' }, parse: E.parse })[0].week, null); checks++; // the owner's empty entry wins over the guide's
});

test('open before doors: the 2 hours before, long enough to eat', () => {
  const doors = at(2026, 10, 28, 20, 0); // a Wednesday
  assert.deepEqual(C.openBefore(week('Daily 12:00–23:00'), doors, 45).text, 'Open before doors'); checks++;
  assert.equal(C.openBefore(week('Daily 19:00–23:00'), doors, 45).text, 'Opens at 19:00'); checks++; // 60 min ≥ 45
  assert.equal(C.openBefore(week('Daily 19:30–23:00'), doors, 45).state, 'closed'); checks++; // 30 min < 45
  assert.equal(C.openBefore(week('Daily 19:30–23:00'), doors, 30).state, 'open'); checks++; // eat time edited down: fits
  assert.equal(C.openBefore(week('Daily 12:00–19:00'), doors, 45).text, 'Closes at 19:00'); checks++;
  assert.equal(C.openBefore(week('Daily 12:00–14:30'), doors, 45).state, 'closed'); checks++; // lunch only
  assert.equal(C.openBefore(week('Mon–Tue 12:00–23:00 · Thu–Sun 12:00–23:00'), doors, 45).state, 'closed'); checks++; // closed on Wednesdays
  assert.equal(C.openBefore(week('Daily 12:00–14:30, 18:30–23:00'), doors, 45).state, 'open'); checks++; // the evening service counts
  const late = at(2026, 10, 29, 1, 0); // doors at 01:00 Thursday: Wednesday's late night (18:00–03:00) is still open
  assert.equal(C.openBefore(week('Wed 18:00–03:00'), late, 45).text, 'Open before doors'); checks++;
  assert.equal(C.openBefore(week('Thu 18:00–03:00'), late, 45).state, 'closed'); checks++;
  const dst = at(2026, 10, 25, 3, 30); // the 25-hour day: 01:30–03:30 runs through the doubled 02:00–03:00
  const r = C.openBefore(week('Sun 00:00–04:00'), dst, 45); assert.equal(r.text, 'Open before doors'); checks++;
  assert.equal(C.openBefore(null, doors).text, 'Hours unknown'); checks++;
});

test('nearby: within ~10 min walk, closed ones out, ★ then ✓ then by walk time', () => {
  const near = (dLat, dLon) => ({ lat: CIGALE.lat + dLat, lon: CIGALE.lon + dLon });
  const mk = (id, d, extra = {}) => ({ id, name: id, ...near(...d), starred: false, stamped: false, week: null, ...extra });
  const places = [
    mk('far', [0.012, 0]), // ~1.3 km: 22 min
    mk('farstar', [0.006, 0], { starred: true }), // ★ but 11 min: out
    mk('close', [0.001, 0]), // ~110 m
    mk('mid', [0.004, 0]), // ~445 m
    mk('star', [0.003, 0], { starred: true }),
    mk('stamp', [0.0035, 0], { stamped: true }),
    mk('both', [0.0045, 0], { starred: true, stamped: true }),
    mk('shut', [0.0015, 0], { week: week('Daily 12:00–14:00') }),
    mk('open', [0.002, 0], { week: week('Daily 11:00–23:00') }),
  ];
  const rows = C.nearby({ venue: CIGALE, doors: at(2026, 10, 28, 19, 30), eatMin: 45, places });
  assert.deepEqual(rows.map((r) => r.id), ['star', 'both', 'stamp', 'close', 'open', 'mid']); checks++; // ★ by walk (star is closer than both), then ✓, then the rest by walk
  for (const r of rows) assert.equal(r.walk, K.walkMin(K.metres(CIGALE, r)), r.id), checks++; // the leave reminders' own walk
  assert.ok(rows.every((r) => r.walk <= C.MAX_WALK)); checks++;
  assert.equal(rows.find((r) => r.id === 'open').hours.state, 'open'); assert.equal(rows.find((r) => r.id === 'close').hours.text, 'Hours unknown'); checks += 2;
  assert.equal(C.nearby({ venue: null, doors: 0, places }).length, 0); checks++;
  assert.equal(C.nearby({ venue: CIGALE, doors: at(2026, 10, 28, 19), places: Array.from({ length: 20 }, (_, i) => mk(`p${i}`, [i * 0.0002, 0])) }).length, C.LIMIT); checks++;
  // the real guide: Bouillon Pigalle is ~4 min from La Cigale; Bouillon République is the one stop within 10 min of the Bataclan
  const real = C.foodPlaces({ guide: P.guide, parse: E.parse });
  assert.deepEqual(C.nearby({ venue: CIGALE, doors: at(2026, 10, 28, 19), places: real }).map((r) => r.id), ['pp-bouillon-pigalle']); checks++;
  assert.deepEqual(C.nearby({ venue: BATACLAN, doors: at(2026, 10, 28, 19), places: real }).map((r) => [r.id, r.walk]), [['pp-bouillon-republique', 9]]); checks++;
});

test('Go here first: the leave time moves earlier by the eat time + the walk to the venue', () => {
  const start = at(2026, 10, 28, 20, 0), now = at(2026, 10, 28, 15, 0);
  const venue = { name: 'Bataclan', ...BATACLAN }, food = { id: 'pp-bouillon-republique', name: 'Bouillon République', lat: 48.866021, lon: 2.364706 };
  const base = { key: 'show:x', kind: 'show', title: 'Arlo Parks', place: venue, targetAt: start, words: 'starts at 20:00', from: 'Home', origin: 'home:1' };
  const plain = { ...base, travel: K.travel(HOME, venue) };
  const p0 = K.plan(plain, now);
  const row = C.nearby({ venue, doors: start, places: [{ ...food, starred: false, stamped: false, week: null }] })[0];
  const stop = C.stopOf(row, 45);
  assert.deepEqual(stop, { id: food.id, name: food.name, lat: food.lat, lon: food.lon, eatMin: 45, walkMin: row.walk }); checks++;
  const via = { ...base, travel: K.travel(HOME, food), stop };
  const p1 = K.plan(via, now);
  assert.equal(p1.leaveAt, floor5(start - (K.travel(HOME, food).min + 45 + row.walk) * MIN)); checks++; // exact, independently summed
  assert.ok(p0.leaveAt - p1.leaveAt >= 45 * MIN, `${(p0.leaveAt - p1.leaveAt) / MIN} min earlier`); checks++; // at least the eat time earlier
  assert.equal(p1.notifyAt, p1.leaveAt - K.LEAD * MIN); checks++;
  // edited: 60 min to eat → exactly 15 min earlier before the 5-minute rounding
  const p2 = K.plan({ ...via, stop: C.stopOf(row, 60) }, now);
  assert.equal(p2.leaveAt, floor5(start - (K.travel(HOME, food).min + 60 + row.walk) * MIN)); checks++;
  assert.ok(p1.leaveAt - p2.leaveAt >= 10 * MIN && p1.leaveAt - p2.leaveAt <= 20 * MIN); checks++;
  assert.equal(C.stopMinutes(stop), 45 + row.walk); assert.equal(K.stopMin(stop), C.stopMinutes(stop)); checks += 2;
  // too late with the stop (fine without it): the refusal says why
  const late = start - (K.travel(HOME, venue).min + 20) * MIN;
  assert.doesNotThrow(() => K.plan(plain, late)); checks++;
  assert.throws(() => K.plan(via, late), /already time to go: .*eat at Bouillon République first \(45 min, then \d+ min walk\)/); checks++;
  // eat time bounds
  assert.equal(C.eatOf(5), C.EAT_MIN); assert.equal(C.eatOf(500), C.EAT_MAX); assert.equal(C.eatOf('x'), C.EAT); assert.equal(C.eatOf(null), C.EAT); assert.equal(C.eatOf('60'), 60); checks += 4;
});

test('the stop is kept through the store, and said in the words; nothing changes without one', () => {
  const now = at(2026, 10, 28, 15, 0), start = at(2026, 10, 28, 20, 0);
  const food = { id: 'pp-bouillon-pigalle', name: 'Bouillon Pigalle', lat: 48.882583, lon: 2.337451 };
  const stop = { ...food, eatMin: 45, walkMin: 4 };
  const mk = (st) => { const it = { key: 'show:c', kind: 'show', title: 'Cigale night', place: CIGALE, targetAt: start, words: 'starts at 20:00', travel: K.travel(HOME, st || CIGALE), from: 'Home', origin: 'home:1', ...(st ? { stop: st } : {}) }; return { ...it, ...K.plan(it, now) }; };
  const s = K.empty(); const put = K.put(s, mk(stop), now);
  assert.deepEqual(put.stop, stop); checks++;
  const back = K.validate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.items[0].stop, stop); checks++; // the main side's file round trip
  assert.equal(K.check({ ...mk(null), stop: { ...stop, lat: 40 } }).stop, undefined); checks++; // a stop outside Paris is dropped
  assert.equal(K.check({ ...mk(null), stop: { ...stop, eatMin: 999 } }).stop, undefined); checks++;
  assert.equal(K.check({ ...mk(null), stop: 'x' }).stop, undefined); checks++;
  const it = back.items[0];
  assert.match(K.notice(it, it.leaveAt - 10 * MIN).body, /🍜 Eat at Bouillon Pigalle first \(45 min, then 4 min walk\)/); checks++;
  assert.match(K.hud(it, now).sub, / · 🍜 Bouillon Pigalle first$/); checks++;
  assert.match(K.confirmText(it, now), /; eat at Bouillon Pigalle first \(45 min, then 4 min walk\)\)\.$/); checks++;
  const plain = K.check(mk(null));
  assert.ok(!/🍜|eat at/.test(K.notice(plain, now).body + K.hud(plain, now).sub + K.confirmText(plain, now))); checks++;
  assert.equal(plain.stop, undefined); checks++;
  // ratp69's "Leave earlier" on a reminder with a stop still moves it once, by the line's minutes
  const s2 = K.empty(); K.put(s2, mk(stop), now); const before = s2.items[0].leaveAt; K.earlier(s2, 'show:c', now, 10);
  assert.equal(s2.items[0].leaveAt, before - 10 * MIN); assert.deepEqual(s2.items[0].stop, stop); checks += 2;
});

test('the files: lazy group, entry points, nothing on the first screen', () => {
  const LD = new Function(`${read('lazy-data.js')}; return LazyData;`)(); // eslint-disable-line no-new-func
  const g = LD.GROUPS.find((x) => x.name === 'eatnearby');
  assert.ok(g && g.tier === 'use' && g.after.includes('leavesoon')); checks++;
  assert.deepEqual(g.files, ['eatnearby-core.js', 'eatnearby.js']); assert.deepEqual(g.css, ['eatnearby.css']); checks += 2;
  assert.match(read('index.html'), /lazy-at\.js#[\w,-]*\beatnearby\b/); checks++;
  assert.ok(!/src="eatnearby/.test(read('index.html'))); checks++;
  assert.match(read('leavesoon.js'), /acts\.append\(eatButton\(s\)\)/); checks++; // the show card
  assert.match(read('weekendplan.js'), /EatNearby\.open\(o\.show, \{ slot:/); checks++; // the weekend's show slot
  assert.match(read('beforego.js'), /'🍜 Eat nearby'/); checks++; // 🎒 Before I go
  const src = read('eatnearby.js') + read('eatnearby-core.js');
  assert.ok(!/fetch\(|XMLHttpRequest|openExternal|Commands\.register/.test(src)); checks++; // no network, no command
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`✓ ${name}`); } catch (err) { failed++; console.log(`✖ ${name}\n  ${err.stack.split('\n').slice(0, 4).join('\n  ')}`); }
  }
  console.log(`eatnearby71-test: ${checks} checks, ${failed ? `${failed} test(s) FAILED` : 'all passed'}`);
  process.exit(failed ? 1 : 0);
})();
