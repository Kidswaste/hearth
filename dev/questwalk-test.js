// (round 63, questwalk63) Quest walks' thinking (tools/quest-walk-core.js) on Codex's own QuestCore, parisquests61's
// guide and showprep62's Métro list: the order (nearest neighbour + 2-opt) against brute force for ≤ 6 stops, the time
// budget, Métro ends, a show venue as the end, 3–5 stops, the places used (unvisited, filters, "from"), the words of
// /quest walk, the links, the campaign (QuestCore.validate, one step per stop, proof rules, stable id) and the week
// plan's walk on a free afternoon.
const assert = require('node:assert/strict');
const C = require('../tools/quest-core');
const P = require('../tools/quest-paris');
const SP = require('../showprep-core');
const QW = require('../tools/quest-walk-core');
const W = require('../weekquest-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => C.upgrade(C.validate(C.initial()));
const ST = SP.STATIONS;
const stepMinutes = (g) => P.placeSteps(g)[1][3];
const pool = (s = fresh(), filter = '') => QW.poolFrom({ C, s, guide: P.guide, matches: P.matches, filter, stepMinutes });
// a seeded random (mulberry32), so the order fixtures are the same every run
const rnd = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
const brute = (start, pts, end, stations) => Math.min(...perms(pts).map((p) => QW.cost(start, p, end, stations)));

test('order: nearest neighbour + 2-opt matches brute force for ≤ 6 stops (fixtures, free and fixed ends)', () => {
  const r = rnd(63); let worst = 1, sum = 0, n = 0, exact = 0;
  for (let t = 0; t < 300; t++) {
    const k = 2 + (t % 5), pts = Array.from({ length: k }, (_, i) => ({ id: 'p' + i, name: 'P' + i, lat: 48.83 + r() * 0.07, lon: 2.29 + r() * 0.12, minutes: 20 }));
    const start = QW.station({ lat: 48.83 + r() * 0.07, lon: 2.29 + r() * 0.12 }, ST), end = t % 3 === 0 ? { name: 'Venue', lat: 48.86 + r() * 0.03, lon: 2.33 + r() * 0.05, kind: 'show' } : null;
    const got = QW.cost(start, QW.order(start, pts, end, ST), end, ST), best = brute(start, pts, end, ST);
    const ratio = got / best; worst = Math.max(worst, ratio); sum += ratio; n++; if (ratio < 1.0001) exact++;
  }
  assert.ok(worst <= 1.05, `worst ${worst.toFixed(3)}× brute force`);
  assert.ok(sum / n <= 1.005, `mean ${(sum / n).toFixed(4)}×`);
  assert.ok(exact / n >= 0.9, `${exact}/${n} exactly optimal`);
  // the real guide: six places around the canal and Belleville, compared to brute force
  const six = ['place-canal', 'pp-point-ephemere', 'pp-denoyez', 'pp-belleville-view', 'pp-new-morning', 'pp-superfly'].map((id) => ({ ...P.byId(id), minutes: 20 }));
  const start = QW.station(six[0], ST);
  assert.equal(Math.round(QW.cost(start, QW.order(start, six, null, ST), null, ST)), Math.round(brute(start, six, null, ST)));
  console.log(`   ${exact}/${n} exactly optimal · mean ${(sum / n).toFixed(4)}× · worst ${worst.toFixed(3)}×`);
});

test('the time budget is respected (2 h, 3 h, 90 min) with 3–5 stops, Métro at both ends', () => {
  const p = pool();
  for (const budget of [90, 120, 180]) for (let v = 0; v < 4; v++) {
    const at = QW.anchor(p, { variant: v }); if (!at) continue;
    const rt = QW.plan({ pool: p, at, budget, stations: ST });
    assert.ok(!rt.error, rt.error);
    assert.ok(rt.total <= budget, `${rt.total} > ${budget}`);
    assert.ok(rt.stops.length >= 2 && rt.stops.length <= 5, `${rt.stops.length} stops`);
    if (budget >= 120) assert.ok(rt.stops.length >= 3, `only ${rt.stops.length} stops in ${budget} min near ${at.name}`);
    assert.equal(rt.start.kind, 'metro'); assert.equal(rt.end.kind, 'metro');
    assert.ok(ST.some((s) => s.name === rt.start.name) && ST.some((s) => s.name === rt.end.name));
    // the end is the station nearest the last stop; the start is the station nearest where it begins
    assert.equal(rt.end.name, QW.station(rt.stops.at(-1), ST).name);
    assert.equal(rt.start.name, QW.station(at, ST).name);
    // the total is the legs walked + the time at each stop (each from its place quest)
    const walk = rt.legs.reduce((n, l) => n + l.min, 0); assert.ok(Math.abs(walk - rt.walk) < 1e-6);
    assert.ok(Math.abs(rt.total - walk - rt.stops.reduce((n, s) => n + s.minutes, 0)) < 1e-6);
    assert.equal(rt.legs.length, rt.stops.length + 1);
  }
  // more time, more (or the same) stops
  const at = QW.anchor(p);
  assert.ok(QW.plan({ pool: p, at, budget: 180, stations: ST }).stops.length >= QW.plan({ pool: p, at, budget: 120, stations: ST }).stops.length);
  // a budget nothing fits in says so plainly
  assert.match(QW.plan({ pool: p.map((x) => ({ ...x, minutes: 60 })), at, budget: 60, stations: ST }).error || '', /doesn’t fit/);
  assert.match(QW.plan({ pool: p.slice(0, 1), stations: ST }).error, /fewer than two/);
});

test('ends at tonight\'s show venue when asked, still inside the time', () => {
  const p = pool(fresh(), 'pigalle'), venue = { name: 'La Cigale', lat: 48.8823, lon: 2.3404, kind: 'show', what: 'Check Band at 20:00' };
  const all = pool(), rt = QW.plan({ pool: all, at: venue, budget: 120, stations: ST, end: venue });
  assert.equal(rt.end.kind, 'show'); assert.equal(rt.end.name, 'La Cigale'); assert.ok(rt.total <= 120);
  assert.ok(QW.lines(rt).at(-1).includes('La Cigale for Check Band'));
  assert.notEqual(rt.id, QW.plan({ pool: all, at: venue, budget: 120, stations: ST }).id, 'a walk to the show is its own quest');
  assert.ok(p.length >= 0);
});

test('the places: unvisited only, finished place quests left out, filters, Codex\'s own pins, "from"', () => {
  const s = fresh();
  const n0 = pool(s).length;
  assert.ok(n0 >= 36, `${n0} places`); // the guide + Codex's default pins not already in the guide (République), never Montparnasse (a station)
  assert.ok(!pool(s).some((p) => p.id === 'place-montparnasse'));
  assert.ok(pool(s).some((p) => p.id === 'place-republique' && !p.guide));
  s.atlas.places.find((p) => p.id === 'place-canal').visitedAt = new Date().toISOString();
  assert.ok(!pool(s).some((p) => p.id === 'place-canal'), 'a visited place is not a stop');
  P.startPlace(s, 'pp-bataclan'); for (const q of s.campaigns.find((c) => c.id === 'c-pp-bataclan').quests) s.records[q.id] = { completedAt: new Date().toISOString() };
  assert.ok(!pool(s).some((p) => p.id === 'pp-bataclan'), 'a finished place quest is not a stop');
  assert.ok(pool(s, 'records').every((p) => P.byId(p.id)?.tags.includes('records')) && pool(s, 'records').length === 4);
  assert.ok(pool(s, '11e').every((p) => P.byId(p.id).arr === 11));
  assert.equal(pool(s)[0].minutes, stepMinutes(P.guide[0]), 'a stop takes the time its place quest asks for');
  const from = P.findPlace('superfly'), rt = QW.plan({ pool: pool(s), at: from, first: from.id, budget: 120, stations: ST });
  assert.equal(rt.stops.some((p) => p.id === 'pp-superfly'), true);
  assert.equal(rt.start.name, QW.station(from, ST).name);
});

test('/quest walk words: area, tag, from <place>, 2h / 3h / 90m, show / noshow, save / open', () => {
  assert.deepEqual(QW.parse(''), { budget: 120, from: null, filter: '', show: null, sub: '' });
  assert.equal(QW.parse('3h').budget, 180); assert.equal(QW.parse('2h30').budget, 150); assert.equal(QW.parse('90min').budget, 90);
  assert.equal(QW.parse('records 3h').filter, 'records');
  assert.equal(QW.parse('11e').filter, '11e');
  assert.deepEqual(QW.parse('from canal saint martin 3h'), { budget: 180, from: 'canal saint martin', filter: '', show: null, sub: '' });
  assert.equal(QW.parse('show').show, true); assert.equal(QW.parse('noshow 2h').show, false);
  assert.equal(QW.parse('save').sub, 'save'); assert.equal(QW.parse('open').sub, 'open'); assert.equal(QW.parse('another').sub, 'another');
});

test('links: Google Maps walking with waypoints, Citymapper to the first stop (no key)', () => {
  const rt = QW.plan({ pool: pool(), budget: 120, stations: ST }), l = QW.links(rt), g = new URL(l.google);
  assert.equal(g.hostname, 'www.google.com'); assert.equal(g.searchParams.get('travelmode'), 'walking'); assert.equal(g.searchParams.get('api'), '1');
  assert.equal(g.searchParams.get('waypoints').split('|').length, rt.stops.length);
  assert.equal(g.searchParams.get('origin'), `${rt.start.lat.toFixed(5)},${rt.start.lon.toFixed(5)}`);
  assert.ok(!/key=/.test(l.google + l.citymapper));
  assert.equal(new URL(l.citymapper).searchParams.get('endname'), rt.stops[0].name);
});

test('saving: a walk campaign Codex\'s rules accept, one step per stop, proof hints, pins, stable id, tracked', () => {
  const s = fresh(), rt = QW.plan({ pool: pool(s), budget: 120, stations: ST });
  const c = QW.save(s, rt, { ensurePin: P.ensurePin });
  C.validate(s);
  assert.match(c.id, /^c-walk-/); assert.equal(c.path, 'life'); assert.equal(s.active, c.id);
  assert.equal(c.quests.length, rt.stops.length);
  c.quests.forEach((q, i) => { assert.equal(q.place, rt.stops[i].id); assert.ok(q.proofHint.length > 20); assert.ok(q.minutes >= rt.stops[i].minutes); assert.ok(s.atlas.places.some((p) => p.id === q.place)); });
  assert.ok(c.quests.at(-1).done.includes(rt.end.name), 'the last step says where the walk ends');
  assert.equal(c.walk.stops.length, rt.stops.length); assert.ok(QW.stored(c).link.startsWith('https://www.google.com/maps/dir/'));
  // saving twice reopens the same walk
  s.campaigns.find((x) => x.id === c.id).paused = true; s.active = 'c-material';
  assert.equal(QW.save(s, rt, { ensurePin: P.ensurePin }).id, c.id); assert.equal(s.campaigns.filter((x) => x.id === c.id).length, 1); assert.equal(s.active, c.id);
  // the tracker follows it step by step (QuestCore.next), and XP still needs proof + review (Codex's studio rule)
  assert.equal(C.next(s, c).id, c.quests[0].id);
  assert.throws(() => C.complete(s, c.quests[0].id), /proof/);
  assert.equal(QW.activeWalk(C, s).id, c.id);
  for (const q of c.quests) s.records[q.id] = { completedAt: new Date().toISOString() };
  assert.equal(QW.activeWalk(C, s), null);
  // a real-life quest for the week plan's streak
  assert.ok(W.lifeCampaign(c));
});

test('the week plan proposes a walk on a free afternoon (weekend first, not a busy or wet day) and accepts it', () => {
  const NOW = new Date(2026, 9, 21, 10).getTime(), wk = W.planWeek(NOW), p = pool();
  const cand = QW.weekCandidate({ pool: p, stations: ST, week: wk, busy: ['2026-10-24'] });
  assert.equal(cand.kind, 'walk'); assert.equal(cand.day, '2026-10-25', 'Sunday: Saturday has a show'); assert.match(cand.why, /^Sun afternoon is free/);
  const wet = QW.weekCandidate({ pool: p, stations: ST, week: wk, busy: [], weather: [{ date: '2026-10-24', rain: 80, tmax: 12 }, { date: '2026-10-25', rain: 70, tmax: 12 }] });
  assert.equal(wet.day, '2026-10-21', 'a wet weekend: the first free day');
  assert.equal(QW.weekCandidate({ pool: p, stations: ST, week: wk, busy: wk.days }), null);
  const props = W.propose([cand], wk, []);
  assert.equal(props.length, 1);
  const s = fresh(), it = W.accept(C, s, wk.week, props[0], props[0].day, { walk: (st, sug) => QW.save(st, sug.walk, { ensurePin: P.ensurePin }) });
  C.validate(s); W.checkWeekly(s.weekly);
  assert.equal(it.campaign, cand.campaign); assert.ok(s.campaigns.some((c) => c.id === cand.campaign), 'the walk is a real campaign'); assert.equal(s.active, 'c-material', 'planning keeps the main quest');
  assert.equal(W.propose([cand], wk, W.planOf(s, wk.week).items).length, 0, 'not proposed again once planned');
});

console.log(`questwalk-test: ${checks} checks passed`);
