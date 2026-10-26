// (round 67, errands67) Errands: unit tests for tools/errands-core.js — reading opening hours the way people type them
// (English, French, OSM style, 24/7, split days, lunch breaks), writing them back, where a shop stands right now
// (open / closes soon / opens later / closed now / closed today, Sundays and closing days, late nights past midnight,
// 24 h places), the built-in Paris shops (all readable, "AirPods" → Apple Opéra first), and the errand in a real
// QuestCore journal (add → validate → Done ✓ completes its quest with XP and no proof review; edit; remove; the list).
// Every time is this computer's local clock (new Date(y, m, d, h, min)), so the tests pass in any time zone.
//   node dev/errands67-test.js
'use strict';
const assert = require('node:assert/strict');
const E = require('../tools/errands-core');
const C = require('../tools/quest-core');
const H = require('../tools/herepin-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
// Oct 2026: Sat 24, Sun 25, Mon 26, Tue 27, Wed 28, Thu 29, Fri 30, Sat 31
const at = (day, h, m = 0) => new Date(2026, 9, day, h, m);
const SAT = 24, SUN = 25, MON = 26, TUE = 27, WED = 28, FRI = 30;
const usual = E.parse('Mon–Sat 10:00–20:00 · Sun closed');

test('reads the usual way of writing hours, days left out are closed', () => {
  assert.deepEqual(usual[1], [[600, 1200]]); assert.deepEqual(usual[6], [[600, 1200]]); assert.deepEqual(usual[0], []);
  assert.equal(E.format(usual), 'Mon–Sat 10:00–20:00 · Sun closed');
  assert.equal(E.format(E.parse('Mon-Sat 10:00-20:00')), 'Mon–Sat 10:00–20:00 · Sun closed'); // Sunday not mentioned: closed
  assert.equal(E.parse(''), null); assert.equal(E.parse('   '), null);
});

test('French, OSM style, "to", h-times, am/pm, daily, 7/7, weekdays / weekend', () => {
  assert.equal(E.format(E.parse('lun-ven 9h-19h; sam 10h - 18h')), 'Mon–Fri 09:00–19:00 · Sat 10:00–18:00 · Sun closed');
  assert.equal(E.format(E.parse('Mo-Fr 09:30-19:00; Sa 10:00-13:00')), 'Mon–Fri 09:30–19:00 · Sat 10:00–13:00 · Sun closed');
  assert.equal(E.format(E.parse('Monday to Friday 9am-6pm')), 'Mon–Fri 09:00–18:00 · Sat, Sun closed');
  assert.equal(E.format(E.parse('Daily 10:00–21:00')), 'Daily 10:00–21:00');
  assert.equal(E.format(E.parse('7/7 10-20')), 'Daily 10:00–20:00');
  assert.equal(E.format(E.parse('10:00-19:00')), 'Daily 10:00–19:00'); // no day named: every day
  assert.equal(E.format(E.parse('weekdays 8-20 · weekend 10-18')), 'Mon–Fri 08:00–20:00 · Sat, Sun 10:00–18:00');
  assert.equal(E.format(E.parse('dimanche fermé; lundi au samedi 10h30-19h30')), 'Mon–Sat 10:30–19:30 · Sun closed');
});

test('lunch breaks, split day lists, a later line overrides, wrapping ranges', () => {
  const w = E.parse('Mon-Fri 9-12, 14-18, Sat, Sun closed');
  assert.deepEqual(w[3], [[540, 720], [840, 1080]]); assert.deepEqual(w[6], []); assert.deepEqual(w[0], []);
  assert.equal(E.format(w), 'Mon–Fri 09:00–12:00, 14:00–18:00 · Sat, Sun closed');
  assert.equal(E.format(E.parse('Daily 10-20; Tue closed')), 'Mon, Wed–Sun 10:00–20:00 · Tue closed');
  assert.equal(E.format(E.parse('Fri-Mon 18:00-23:00')), 'Mon, Fri–Sun 18:00–23:00 · Tue–Thu closed'); // Fri → Mon wraps the week
});

test('late nights: a close after midnight belongs to the evening it started', () => {
  const w = E.parse('Tue-Sat 22:00-02:00');
  assert.deepEqual(w[2], [[1320, 1560]]);
  assert.equal(E.format(w), 'Mon, Sun closed · Tue–Sat 22:00–02:00');
  assert.deepEqual(E.parse('Fri 18:00-00:00')[5], [[1080, 1440]]);
  assert.deepEqual(E.parse('Fri 18:00-midnight')[5], [[1080, 1440]]);
});

test('every written form reads back to the same week (round trip)', () => {
  for (const t of ['Mon–Sat 10:00–20:00 · Sun 11:00–19:00', 'Tue-Sat 22:00-02:00', 'Mon-Fri 9-12, 14-18', 'Open 24 h', 'Closed all week', 'Fri 18:00-00:00; Sat 10-02', 'Daily 10-20; Tue closed']) {
    const w = E.parse(t); assert.deepEqual(E.parse(E.format(w)), w, t);
  }
  for (const s of E.SHOPS) assert.deepEqual(E.parse(E.format(s.week)), s.week, s.name);
});

test('what can’t be read says how to write it (nothing guessed)', () => {
  for (const bad of ['sometimes', 'Mon-Sat', 'Mon 25:00-26:00', 'Mon 10-14, 12-18', 'Funday 10-20', 'Mon 10:75-12']) assert.throws(() => E.parse(bad), /Write them like: Mon–Sat 10:00–20:00 · Sun closed/, bad);
});

test('status on a usual weekday: opens at, open now, closes soon, closed now', () => {
  assert.deepEqual([E.status(usual, at(MON, 8)).state, E.status(usual, at(MON, 8)).text], ['later', 'Opens at 10:00']);
  const o = E.status(usual, at(MON, 12));
  assert.equal(o.state, 'open'); assert.equal(o.text, 'Open now · closes at 20:00'); assert.equal(o.short, 'open till 20:00'); assert.equal(o.minutesLeft, 480); assert.equal(o.open, true);
  assert.equal(E.status(usual, at(MON, 10)).state, 'open'); // the opening minute counts
  const s = E.status(usual, at(MON, 19, 30)); assert.equal(s.state, 'soon'); assert.equal(s.text, 'Closes soon · at 20:00'); assert.equal(s.minutesLeft, 30);
  const c = E.status(usual, at(MON, 20)); assert.equal(c.state, 'closed'); assert.equal(c.text, 'Closed now · opens tomorrow at 10:00'); assert.equal(c.open, false);
});

test('Sundays and closing days: closed today, and the next opening skips them', () => {
  const sun = E.status(usual, at(SUN, 12)); assert.equal(sun.state, 'today'); assert.equal(sun.text, 'Closed today · opens tomorrow at 10:00'); assert.equal(sun.short, 'closed today');
  assert.equal(E.status(usual, at(SAT, 21)).text, 'Closed now · opens Mon at 10:00'); // Saturday night: Sunday is skipped
  const tueShut = E.parse('Mon, Wed-Sat 10-19');
  assert.equal(E.status(tueShut, at(TUE, 11)).text, 'Closed today · opens tomorrow at 10:00');
  assert.equal(E.status(tueShut, at(MON, 20)).text, 'Closed now · opens Wed at 10:00');
  const apple = E.shop('apple-opera').week;
  assert.equal(E.status(apple, at(SUN, 10, 30)).text, 'Opens at 11:00');
  assert.equal(E.status(apple, at(SUN, 15)).text, 'Open now · closes at 19:00');
  assert.equal(E.status(E.shop('gibert-st-michel').week, at(SUN, 15)).state, 'today');
  const mono = E.shop('monoprix-republique').week; // Sunday mornings only
  assert.equal(E.status(mono, at(SUN, 12, 15)).state, 'soon');
  assert.equal(E.status(mono, at(SUN, 14)).text, 'Closed now · opens tomorrow at 08:00');
});

test('late nights: open past midnight, the small hours count, then closed', () => {
  const bar = E.parse('Tue-Sat 22:00-02:00');
  const t = E.status(bar, at(TUE, 23)); assert.equal(t.state, 'open'); assert.equal(t.text, 'Open now · closes at 02:00 (late)'); assert.equal(t.late, true); assert.equal(t.minutesLeft, 180);
  assert.equal(E.status(bar, at(WED, 1, 30)).text, 'Closes soon · at 02:00'); // Tuesday's night, on Wednesday's clock
  assert.equal(E.status(bar, at(WED, 1, 30)).minutesLeft, 30);
  assert.equal(E.status(bar, at(SUN, 1)).state, 'soon'); // Saturday's night runs into Sunday (closed day) morning
  assert.equal(E.status(bar, at(SUN, 3)).text, 'Closed today · opens Tue at 22:00');
  assert.equal(E.status(bar, at(MON, 1)).text, 'Closed today · opens tomorrow at 22:00'); // Sunday had no night
  assert.equal(E.status(bar, at(WED, 12)).text, 'Opens at 22:00');
  const mid = E.parse('Fri 18:00-00:00');
  assert.equal(E.status(mid, at(FRI, 22)).text, 'Open now · closes at 00:00');
  assert.equal(E.status(mid, at(SAT, 0, 30)).state, 'today');
});

test('24 h places, stretches that carry over midnight, unknown and never-open hours', () => {
  const always = E.parse('24/7');
  for (const d of [SAT, SUN, MON]) { const s = E.status(always, at(d, 3)); assert.equal(s.text, 'Open 24 h'); assert.equal(s.always, true); }
  assert.equal(E.status(E.shop('pharmacie-champs').week, at(SUN, 4)).text, 'Open 24 h');
  const wknd = E.parse('Fri 18:00-00:00; Sat 24h; Sun 00:00-20:00'); // Friday 18:00 straight through to Sunday 20:00
  assert.equal(E.status(wknd, at(FRI, 19)).text, 'Open now · closes at 20:00 Sun');
  assert.equal(E.status(wknd, at(SAT, 12)).text, 'Open now · closes at 20:00 tomorrow');
  assert.equal(E.status(wknd, at(SUN, 19, 10)).state, 'soon');
  assert.deepEqual([E.status(null).state, E.status(null).text], ['unknown', 'Hours unknown']);
  assert.equal(E.status(E.parse('Closed all week'), at(MON, 12)).state, 'never');
});

test('the built-in shops: all well-known Paris shops, all readable, inside the map, usual hours', () => {
  assert.ok(E.SHOPS.length >= 10);
  assert.ok(['apple-opera', 'fnac-st-lazare', 'bhv-marais'].every((id) => E.shop(id)));
  for (const s of E.SHOPS) { assert.ok(E.valid(s.week), s.name); assert.ok(E.inParis(s.lat, s.lon), s.name); assert.equal(s.usual, true); assert.ok(s.addr && s.area, s.name); }
  assert.equal(E.USUAL, 'usual hours, check before going');
});

test('suggestions follow what you typed: AirPods → Apple Opéra first, pills → pharmacies, books → bookshops', () => {
  const air = E.suggest('AirPods');
  assert.equal(air[0].id, 'apple-opera'); assert.ok(air.every((s) => s.match > 0)); assert.ok(air.some((s) => s.id.startsWith('apple-')));
  assert.ok(E.suggest('écouteurs').some((s) => s.id === 'apple-opera'));
  assert.deepEqual(E.suggest('doliprane').map((s) => s.id).sort(), ['pharmacie-champs', 'pharmacie-clichy']);
  assert.ok(E.suggest('used books').slice(0, 1).every((s) => s.id === 'gibert-st-michel'));
  assert.ok(E.suggest('screws').some((s) => s.id === 'bhv-marais'));
  assert.equal(E.suggest('').length, 4); // nothing typed: a few shops anyway
  const near = { lat: 48.8527, lon: 2.3352 }; // at Saint-Germain: the nearest Apple first
  assert.equal(E.suggest('iPhone', { near })[0].id, 'apple-st-germain');
});

// a real QuestCore journal, upgraded as the Studio does
const journal = () => C.upgrade(C.validate(C.upgrade(C.initial())));
const opera = E.shop('apple-opera');
const input = { what: 'AirPods', place: { name: opera.name, addr: opera.addr, lat: opera.lat, lon: opera.lon, shop: opera.id }, hours: E.format(opera.week) };

test('an errand is a real quest in the journal (it validates), and doesn’t take over the main quest', () => {
  const s = journal(), active = s.active;
  const c = E.add(s, input, { now: at(MON, 9).getTime(), id: 'c-errand-test1' });
  C.validate(s); // throws if the journal would be refused
  assert.equal(s.active, active);
  assert.equal(c.title, 'Get AirPods'); assert.equal(c.path, 'life'); assert.equal(c.quests.length, 1);
  assert.equal(c.quests[0].id, 'q-errand-test1-1'); assert.equal(c.quests[0].xp, E.XP);
  assert.equal(c.errand.usual, true); assert.equal(c.errand.place.shop, 'apple-opera');
  assert.equal(E.isErrand(c), true); assert.equal(E.isErrand(s.campaigns[0]), false);
  const l = E.list(s, { now: at(MON, 12) });
  assert.equal(l.length, 1); assert.equal(l[0].badge.text, 'Open now · closes at 20:00'); assert.equal(l[0].qid, 'q-errand-test1-1');
  assert.match(E.newId(), /^c-errand-[a-z0-9]+$/);
});

test('Done ✓ completes its quest (XP, no proof review even with the studio rules on); twice is a no-op', () => {
  const s = journal(); assert.ok(s.studio, 'studio rules on');
  E.add(s, input, { id: 'c-errand-test2' });
  const before = C.clone(s);
  assert.throws(() => C.complete(s, 'q-errand-test2-1')); // Codex's own finish line would want proof + a review
  const xp = E.complete(s, 'c-errand-test2', at(MON, 15).toISOString());
  assert.equal(xp, E.XP); C.validate(s);
  assert.equal(C.done(s, 'q-errand-test2-1'), true);
  assert.equal(C.gains(before, s).xp, E.XP);
  assert.match(s.records['q-errand-test2-1'].note, /Self-reported/);
  assert.equal(E.complete(s, 'c-errand-test2'), 0);
  assert.equal(E.list(s).length, 0); assert.equal(E.list(s, { done: true }).length, 1);
  assert.throws(() => E.complete(s, 'c-material'), /no longer in your journal/);
});

test('editing changes what / where / hours and keeps the quest id; a spot of your own has no "usual" mark', () => {
  const s = journal(); E.add(s, input, { id: 'c-errand-test3' });
  E.edit(s, 'c-errand-test3', { what: 'AirPods Pro', place: { name: 'Corner shop', lat: 48.86, lon: 2.35 }, hours: 'Mon-Fri 9-19' });
  C.validate(s);
  const c = s.campaigns.find((x) => x.id === 'c-errand-test3');
  assert.equal(c.title, 'Get AirPods Pro'); assert.equal(c.quests[0].id, 'q-errand-test3-1'); assert.match(c.quests[0].title, /Corner shop/);
  assert.equal(c.errand.usual, false); assert.equal(c.errand.place.shop, null);
  assert.equal(E.status(c.errand.week, at(SAT, 12)).state, 'today');
});

test('what a new errand needs: a name and a spot in Paris; hours are optional (badge: Hours unknown)', () => {
  const s = journal();
  assert.throws(() => E.add(s, { ...input, what: '  ' }), /Type what the errand is for/);
  assert.throws(() => E.add(s, { ...input, place: {} }), /Choose where/);
  assert.throws(() => E.add(s, { ...input, place: { lat: 51.5, lon: -0.12 } }), /Choose where/); // London
  assert.throws(() => E.add(s, { ...input, hours: 'whenever' }), /Write them like/);
  const c = E.add(s, { what: 'Keys cut', place: { lat: 48.85, lon: 2.34 }, hours: '' });
  assert.equal(c.errand.week, null); assert.equal(c.errand.place.name, 'A spot on the map');
  assert.equal(E.list(s)[0].badge.text, 'Hours unknown');
  C.validate(s);
});

test('the list: open now first (closing soonest first), then opening later, closed, unknown', () => {
  const s = journal(), mk = (id, what, hours) => E.add(s, { what, place: { lat: 48.86, lon: 2.35 }, hours }, { id });
  mk('c-errand-a', 'Closed', 'Sun 10-12'); mk('c-errand-b', 'Late', 'Daily 10-23'); mk('c-errand-c', 'Soon', 'Daily 10-12:30');
  mk('c-errand-d', 'Later', 'Daily 14-18'); mk('c-errand-e', 'Unknown', '');
  assert.deepEqual(E.list(s, { now: at(MON, 12) }).map((e) => e.what), ['Late', 'Soon', 'Later', 'Closed', 'Unknown']);
  assert.deepEqual(E.list(s, { now: at(MON, 12) }).map((e) => e.badge.state), ['open', 'soon', 'later', 'today', 'unknown']);
  assert.deepEqual(E.list(s, { now: at(MON, 12) }).map((e) => E.tone(e.badge.state)), ['er-open', 'er-soon', 'er-later', 'er-closed', 'er-unknown']);
});

test('remove takes the errand and its history off the journal (it still validates)', () => {
  const s = journal(); E.add(s, input, { id: 'c-errand-test4' });
  C.startSmall(s, 'q-errand-test4-1');
  s.plan = { quest: 'q-errand-test4-1', action: 'Go after lunch', minutes: 30, at: new Date().toISOString() };
  C.validate(s);
  assert.equal(E.remove(s, 'c-errand-test4'), true);
  C.validate(s);
  assert.equal(s.campaigns.some((c) => c.id === 'c-errand-test4'), false); assert.equal(s.records['q-errand-test4-1'], undefined); assert.equal(s.plan, null);
  assert.equal(E.remove(s, 'c-material'), false); // never a campaign that isn't an errand
});

test('Close to you (herepin): an errand near the pin is listed with its badge, nearest first', () => {
  const s = journal(); E.add(s, input, { id: 'c-errand-test5' });
  const errands = E.list(s, { now: at(MON, 12) });
  const pin = { lat: 48.8712, lon: 2.3331, at: Date.now() }; // about 110 m south of Apple Opéra
  const out = H.rank(pin, H.candidates({ errands, guide: [{ id: 'pp-x', name: 'Far place', lat: 48.86, lon: 2.36, tags: [] }] }));
  assert.equal(out[0].kind, 'errand'); assert.equal(out[0].id, 'errand:c-errand-test5'); assert.equal(out[0].name, 'AirPods');
  assert.equal(out[0].venue, 'Apple Opéra'); assert.equal(out[0].badge.text, 'Open now · closes at 20:00'); assert.equal(out[0].min, 1);
  assert.equal(H.KINDS.errand, 'Errand');
});

console.log(`\nerrands67-test: ${checks} checks passed`);
