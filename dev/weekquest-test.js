// (round 62, weekquest62) The week plan's thinking (weekquest-core.js) on Codex's own QuestCore, QuestParis and
// ShowSyncCore, with fixtures (dev/fixtures/weekquest: this week's shows, a forecast): which week, what's proposed (shows
// ahead, a place near the show's venue, open personal quests, the park on a dry day), accepting onto days (real campaigns,
// the main quest kept, s.weekly valid), the ✦ chip following today's plan, the one nudge, and the week in review.
const assert = require('node:assert/strict');
const path = require('node:path');
const C = require('../tools/quest-core');
const P = require('../tools/quest-paris');
const SS = require('../showsync-core');
const QH = require('../questhud-core');
const W = require('../weekquest-core');
const FX = path.join(__dirname, 'fixtures', 'weekquest');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => C.upgrade(C.validate(C.initial()));
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 21, 10); // Wednesday 21 October 2026, 10:00
const MON = W.parse('2026-10-19').getTime();
const shows = require(path.join(FX, 'shows.json')).map(({ h, ...s }) => ({ ...s, start: MON + h * 3600e3, venue: { ...s.venue }, cancelled: Boolean(s.cancelled) }));
// (hours after Monday 00:00 in local time: no DST change in this week)
const weather = require(path.join(FX, 'weather.json')).map(({ d, ...w }) => ({ ...w, date: W.addDays('2026-10-19', d) }));
const makers = { show: (x) => SS.showCampaign(x, NOW), place: (s, pid, guide) => (guide ? P.startPlace(s, pid) : C.placeQuest(s, pid)), personal: (s, k) => P.startPersonal(s, k) };
const valid = (s) => { C.validate(s); W.checkWeekly(s.weekly); return true; };

test('which week: mid-week plans the rest of this week; Sunday plans the coming week', () => {
  const w = W.planWeek(NOW);
  assert.equal(w.week, '2026-10-19'); assert.equal(w.from, '2026-10-21'); assert.equal(w.days.length, 7); assert.equal(w.days[6], '2026-10-25');
  const sun = W.planWeek(at(2026, 10, 25, 18));
  assert.equal(sun.week, '2026-10-26'); assert.equal(sun.from, '2026-10-26');
  assert.equal(W.reviewWeek(at(2026, 10, 25, 18)), '2026-10-19'); assert.equal(W.reviewWeek(NOW, true), '2026-10-12');
  assert.equal(W.label('2026-10-26'), '26 Oct – 1 Nov');
});

test('proposals: this week\'s shows ahead only (a 1 am start is the night before; past, cancelled, next week left out)', () => {
  const s = fresh(), list = W.candidates({ C, s, shows, guide: P.guide, personal: P.personal, weather, week: W.planWeek(NOW) });
  const sh = list.filter((x) => x.kind === 'show');
  assert.deepEqual(sh.map((x) => x.show.key), ['cigale-fri', 'rex-late']);
  assert.ok(sh.every((x) => x.day === '2026-10-23'), 'both on Friday night'); assert.match(sh[0].title, /Arlo Parks at La Cigale/);
});

test('a Paris place not yet visited, near the show\'s venue, lands on the show\'s day', () => {
  const s = fresh(), list = W.candidates({ C, s, shows, guide: P.guide, personal: P.personal, weather, week: W.planWeek(NOW) });
  const pl = list.filter((x) => x.kind === 'place');
  assert.ok(pl.length >= 1); assert.equal(pl[0].day, '2026-10-23'); assert.match(pl[0].why, /before the show/);
  const g = P.byId(pl[0].place), dv = W.km({ lat: 48.8823, lon: 2.3404 }, g); assert.ok(dv <= 3 && dv >= 0.15, 'near the venue, not the venue itself');
  // visited places are never proposed
  s.atlas.places.push({ id: g.id, name: g.name, lat: g.lat, lon: g.lon, quest: 'x', visitedAt: new Date(NOW).toISOString(), kind: g.kind, favorite: false });
  const again = W.candidates({ C, s, shows, guide: P.guide, personal: P.personal, weather, week: W.planWeek(NOW) });
  assert.ok(!again.some((x) => x.place === g.id));
  // no show and no spot: still one unvisited place, picked the same way for the same week
  const lone = W.candidates({ C, s: fresh(), shows: [], guide: P.guide, personal: [], weather: [], week: W.planWeek(NOW) }).filter((x) => x.kind === 'place');
  assert.equal(lone.length, 1); assert.deepEqual(lone, W.candidates({ C, s: fresh(), shows: [], guide: P.guide, personal: [], weather: [], week: W.planWeek(NOW) }).filter((x) => x.kind === 'place'));
});

test('personal quests still open are proposed; finished ones are not', () => {
  const s = fresh(); P.startPersonal(s, 'airpods'); s.active = 'c-material';
  let list = W.candidates({ C, s, shows: [], guide: [], personal: P.personal, weather: null, week: W.planWeek(NOW) });
  assert.ok(list.some((x) => x.kind === 'personal' && x.campaign === 'c-pq-airpods'));
  delete s.studio; for (const q of s.campaigns.find((c) => c.id === 'c-pq-airpods').quests) C.complete(s, q.id); s.studio = { v: 1 };
  list = W.candidates({ C, s, shows: [], guide: [], personal: P.personal, weather: null, week: W.planWeek(NOW) });
  assert.ok(!list.some((x) => x.campaign === 'c-pq-airpods'));
});

test('music at the park: the forecast\'s best dry day (weekend first), none in a wet week, the weekend when no forecast', () => {
  const s = fresh(), wk = W.planWeek(NOW);
  const park = (w) => W.candidates({ C, s, shows: [], guide: [], personal: P.personal, weather: w, week: wk }).find((x) => x.kind === 'park');
  const p1 = park(weather); assert.equal(p1.day, '2026-10-24'); assert.match(p1.why, /Sat looks good: 18°, 15% rain/);
  assert.equal(park(weather.map((w) => ({ ...w, rain: 90 }))), undefined, 'a wet week: no park session');
  const p3 = park(null); assert.equal(p3.day, '2026-10-24'); assert.match(p3.why, /No forecast/);
});

test('propose: 3–5 picks, at most two of a kind, each on a day still ahead, nothing already planned', () => {
  const s = fresh(); P.startPersonal(s, 'airpods'); s.active = 'c-material';
  const wk = W.planWeek(NOW), list = W.candidates({ C, s, shows, guide: P.guide, personal: P.personal, weather, week: wk });
  const pr = W.propose(list, wk);
  assert.ok(pr.length >= 3 && pr.length <= 5, `${pr.length}`);
  const kinds = pr.reduce((m, x) => ({ ...m, [x.kind]: (m[x.kind] || 0) + 1 }), {}); assert.ok(Object.values(kinds).every((n) => n <= 2), JSON.stringify(kinds));
  assert.ok(pr.every((x) => x.day >= wk.from && wk.days.includes(x.day)));
  assert.deepEqual(pr.map((x) => x.day), [...pr.map((x) => x.day)].sort());
  const planned = [{ id: 'wk-x', campaign: 'c-pq-airpods', day: '2026-10-22' }];
  assert.ok(!W.propose(list, wk, planned).some((x) => x.campaign === 'c-pq-airpods'));
});

test('accept: a show, a place, the park and a personal quest become real campaigns on their days; the main quest stays', () => {
  const s = fresh(); P.startPersonal(s, 'airpods'); s.active = 'c-material';
  const wk = W.planWeek(NOW), pr = W.propose(W.candidates({ C, s, shows, guide: P.guide, personal: P.personal, weather, week: wk }), wk);
  for (const x of pr) W.accept(C, s, wk.week, x, x.day, makers);
  assert.equal(s.active, 'c-material', 'the tracked main quest is kept');
  assert.ok(valid(s));
  const items = W.planOf(s, wk.week).items;
  assert.equal(items.length, pr.length);
  assert.ok(s.campaigns.some((c) => c.id === 'c-show-cigale-fri' && c.show?.venue === 'La Cigale'));
  assert.ok(s.campaigns.some((c) => c.id === 'c-pq-park')); assert.ok(s.campaigns.some((c) => /^c-pp-/.test(c.id)));
  // accepting the same again moves it, never duplicates; move / drop
  const first = pr[0]; W.accept(C, s, wk.week, first, '2026-10-25', makers);
  assert.equal(W.planOf(s, wk.week).items.length, pr.length); assert.equal(W.planOf(s, wk.week).items.find((x) => x.id === `wk-${first.id}`).day, '2026-10-25');
  W.move(s, wk.week, `wk-${first.id}`, '2026-10-22'); assert.equal(W.planOf(s, wk.week).items[0].day, '2026-10-22');
  assert.ok(W.drop(s, wk.week, `wk-${first.id}`)); assert.equal(W.planOf(s, wk.week).items.length, pr.length - 1);
  assert.throws(() => W.move(s, wk.week, W.planOf(s, wk.week).items[0].id, '2026-11-02'), /day of that week/);
  assert.ok(valid(s));
  // an AI idea becomes a one-step campaign of the owner's own (path: life)
  const it = W.accept(C, s, wk.week, { id: 'ai-x', kind: 'idea', title: 'Sketch at the Seine', why: 'calm' }, '2026-10-22', makers);
  assert.equal(s.campaigns.find((c) => c.id === it.campaign).path, 'life'); assert.equal(s.active, 'c-material');
  assert.ok(valid(s));
});

test('the ✦ chip follows today\'s planned quest (its campaign\'s next step); another day\'s plan leaves it alone', () => {
  const s = fresh(), today = C.day(), wk = W.monday(today);
  P.startPersonal(s, 'drink'); s.active = 'c-material';
  W.accept(C, s, wk, { id: 'pq-drink', kind: 'personal', title: 'Offer someone a drink', campaign: 'c-pq-drink' }, today, makers);
  const q = QH.current(C, s);
  assert.equal(q.campaign, 'c-pq-drink'); assert.ok(QH.card(C, s, q).today);
  assert.notEqual(QH.current(C, s, null).id, QH.main(C, s).id);
  const pinned = C.daily(today)[0]; C.trackSide(s, pinned); assert.equal(QH.current(C, s, pinned.id).id, pinned.id, 'a pinned quest still wins');
  // another day's plan doesn't change today's chip
  const s2 = fresh(); P.startPersonal(s2, 'drink'); s2.active = 'c-material';
  W.accept(C, s2, wk, { id: 'pq-drink', kind: 'personal', title: 'x', campaign: 'c-pq-drink' }, W.addDays(wk, W.days(wk).indexOf(today) === 6 ? 0 : 6), makers);
  assert.equal(QH.current(C, s2).id, QH.main(C, s2).id);
});

test('the nudge: off by default; on → the planned day at its time, once a day, a late opening within 2 h, quiet hours refused', () => {
  const s = fresh(), wk = W.planWeek(NOW);
  P.startPersonal(s, 'airpods'); s.active = 'c-material';
  W.accept(C, s, wk.week, { id: 'pq-airpods', kind: 'personal', title: 'Get my AirPods', campaign: 'c-pq-airpods' }, '2026-10-22', makers);
  W.accept(C, s, wk.week, { id: 'park', kind: 'park', title: 'Park', campaign: 'c-pq-park', personal: 'park' }, '2026-10-24', makers);
  assert.equal(W.read(s).nudge.on, false); assert.equal(W.nextNudge(C, s, NOW), null);
  W.setNudge(s, { on: true, time: '18:30' }); assert.ok(valid(s));
  let n = W.nextNudge(C, s, NOW); assert.equal(n.day, '2026-10-22'); assert.equal(n.at, at(2026, 10, 22, 18, 30)); assert.match(n.item, /AirPods/);
  W.setNudge(s, { last: '2026-10-22' }); n = W.nextNudge(C, s, at(2026, 10, 22, 18, 31)); assert.equal(n.day, '2026-10-24', 'never twice the same day');
  W.setNudge(s, { last: '' }); n = W.nextNudge(C, s, at(2026, 10, 22, 19, 45)); assert.ok(n.late); assert.equal(n.day, '2026-10-22');
  n = W.nextNudge(C, s, at(2026, 10, 22, 21, 0)); assert.equal(n.day, '2026-10-24', 'too late that day: the next planned one');
  assert.throws(() => W.setNudge(s, { time: '03:00' }), /between 07:00 and 22:00/);
  s.weekly.nudge.time = '23:30'; assert.throws(() => W.checkWeekly(s.weekly), /nudge/);
});

test('the week in review: done, XP, real-life streak across weeks, moments from proofs, a prompt; saved as one page', () => {
  const s = fresh(); delete s.studio;
  P.startPersonal(s, 'airpods'); P.startPersonal(s, 'park'); s.active = 'c-material';
  const iso = (t) => new Date(t).toISOString(), pq = s.campaigns.find((c) => c.id === 'c-pq-airpods').quests, pk = s.campaigns.find((c) => c.id === 'c-pq-park').quests;
  C.complete(s, pq[0].id, {}, iso(at(2026, 10, 7, 12))); // two weeks before
  C.complete(s, pq[1].id, {}, iso(at(2026, 10, 14, 12))); // last week
  C.complete(s, pk[0].id, { artifact: { path: '/tmp/park-bench.jpg', label: 'Bench photo', kind: 'image' } }, iso(at(2026, 10, 21, 9))); // this week
  C.startSmall(s, pq[2].id, iso(at(2026, 10, 20, 9)));
  s.studio = { v: 1 }; s.submissions = {};
  const proof = { type: 'file', title: 'Pairing note', excerpt: 'Noise cancelling works on the metro.', analysis: '', coverage: '', fingerprint: 'a'.repeat(64), images: ['/tmp/airpods.jpg'], path: '/tmp/airpods.txt', kind: 'text', bytes: 40 };
  const sub = C.submit(s, pq[2].id, proof, 'pair them'); sub.at = iso(at(2026, 10, 21, 9, 30));
  const rv = W.review(C, s, '2026-10-19');
  assert.equal(rv.done.length, 1); assert.equal(rv.done[0].id, pk[0].id); assert.ok(rv.done[0].life, 'the park counts as out in the world');
  assert.equal(rv.xp, pk[0].xp + 5, 'completion XP + this week\'s small start');
  assert.equal(rv.streak, 1 + 2, 'three weeks in a row with a real-life quest'); // c-pq-park counts as real-life (out in the world)
  assert.deepEqual(rv.moments.map((m) => m.what).sort(), ['Bench photo', 'Pairing note']);
  assert.ok(rv.moments.find((m) => m.what === 'Pairing note').images[0] === '/tmp/airpods.jpg');
  assert.ok(W.PROMPTS.includes(rv.prompt)); assert.match(W.reviewLine(rv), /1 quest done · \+\d+ XP · 3-week streak/);
  const empty = W.review(C, s, '2026-10-26'); assert.equal(empty.streak, 0); assert.equal(empty.before, 3); assert.match(W.reviewLine(empty), /3-week streak waits/);
  W.saveReview(s, rv, 'The bench by the lake was perfect.'); W.saveReview(s, rv);
  assert.equal(s.weekly.reviews.length, 1); assert.equal(s.weekly.reviews[0].reflection, 'The bench by the lake was perfect.', 'saving again keeps the line');
  assert.ok(valid(s)); assert.equal(W.review(C, s, '2026-10-19').saved.week, '2026-10-19');
});

test('"suggest more": a tiny prompt and a forgiving reader', () => {
  const p = W.askPrompt('2026-10-19', [{ title: 'Go see Arlo Parks' }], ['Canal Saint-Martin']);
  assert.ok(p.length < 420, `${p.length} chars`); assert.match(p, /exactly 3 lines/);
  const ideas = W.parseAsk('1. **Sketch at the canal** — ten minutes of sounds\n- Visit a record shop - ask for one tip\nThird idea – a sunrise walk\nextra line');
  assert.equal(ideas.length, 3); assert.equal(ideas[0].title, 'Sketch at the canal'); assert.equal(ideas[1].why, 'ask for one tip'); assert.ok(ideas.every((x) => x.kind === 'idea' && /^ai-/.test(x.id)));
});

test('a damaged week plan is refused before any save', () => {
  assert.throws(() => W.checkWeekly({ v: 2, plans: [], reviews: [], nudge: { on: false, time: '18:00', last: '' } }), /Invalid week plan/);
  assert.throws(() => W.checkWeekly({ v: 1, plans: [{ week: '2026-10-19', items: [{ id: 'a', day: '2026-10-20', title: 't', kind: 'x' }] }], reviews: [], nudge: { on: false, time: '18:00', last: '' } }), /planned quest/);
  assert.equal(W.checkWeekly(undefined), undefined);
});

console.log(`weekquest-test: ${checks} checks passed`);
