// (round 66, weekendplan66) 🗓 Plan my weekend's thinking (weekendplan-core.js) on Codex's own QuestCore, QuestParis and
// ShowSyncCore with weekquest62's fixtures (dev/fixtures/weekquest: shows in the week of Mon 19 Oct 2026, a forecast):
// when the button shows, the balanced plan (Fri show, Sat park + a place near it, Sun studio), Swap, no forecast,
// no shows, the studio sources, past slots, accepting (real quests with times, the main quest kept, s.weekly valid,
// twice = no duplicates) and determinism (same inputs → same plan).
const assert = require('node:assert/strict');
const path = require('node:path');
const C = require('../tools/quest-core');
const P = require('../tools/quest-paris');
const SS = require('../showsync-core');
const W = require('../weekquest-core');
const WP = require('../weekendplan-core');
const FX = path.join(__dirname, 'fixtures', 'weekquest');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => C.upgrade(C.validate(C.initial()));
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const THU = at(2026, 10, 22, 18); // Thursday 22 October 2026, 18:00
const MON = W.parse('2026-10-19').getTime();
const shows = require(path.join(FX, 'shows.json')).map(({ h, ...s }) => ({ ...s, start: MON + h * 3600e3, venue: { ...s.venue }, cancelled: Boolean(s.cancelled) }));
const weather = require(path.join(FX, 'weather.json')).map(({ d, ...w }) => ({ ...w, date: W.addDays('2026-10-19', d) }));
const buttes = P.byId('place-buttes'), parkAt = { lat: buttes.lat, lon: buttes.lon, name: 'Buttes-Chaumont' };
const projects = [
  { id: 'p-clink', name: 'Clink', status: 'active', updated: THU - 3600e3, notes: 'three.js game' },
  { id: 'p-ep', name: 'Night bus EP', status: 'active', updated: THU - 2 * 86400e3, notes: '' },
  { id: 'p-old', name: 'Old song', status: 'archived', updated: THU },
];
const takes = [{ sketch: 'Park sketch · Buttes-Chaumont · 18 Oct', loop: 'a.wav' }, { sketch: 'Park sketch · Buttes-Chaumont · 18 Oct', loop: 'b.wav' }];
const makers = { show: (x) => SS.showCampaign(x, THU), place: (s, pid, guide) => (guide ? P.startPlace(s, pid) : C.placeQuest(s, pid)), personal: (s, k) => P.startPersonal(s, k) };
const input = (o = {}) => ({ C, s: fresh(), now: THU, shows, guide: P.guide, personal: P.personal, weather, parkAt, projects, takes, ...o });
const plan = (o = {}, swaps = {}) => { const i = input(o); return WP.choose(WP.build(i), swaps, i.now); };
const by = (list, id) => list.find((x) => x.id === id);

test('the button shows from Thursday 17:00 through Sunday, not Monday to Thursday afternoon', () => {
  assert.equal(WP.inWindow(at(2026, 10, 22, 16, 59)), false);
  assert.equal(WP.inWindow(at(2026, 10, 22, 17)), true);
  for (const d of [23, 24, 25]) assert.equal(WP.inWindow(at(2026, 10, d, 9)), true);
  for (const d of [19, 20, 21]) assert.equal(WP.inWindow(at(2026, 10, d, 20)), false);
  const wk = WP.weekend(THU);
  assert.deepEqual(wk.days, ['2026-10-23', '2026-10-24', '2026-10-25']); assert.equal(wk.week, '2026-10-19'); assert.equal(wk.label, 'Fri 23 – Sun 25 Oct');
  assert.deepEqual(WP.weekend(at(2026, 10, 25, 10)).days, ['2026-10-25'], 'on Sunday only Sunday is ahead');
});

test('a balanced plan: Friday night show, a park afternoon + a place near it, a studio session on another day', () => {
  const p = plan();
  const night = by(p, 'night').option, out = by(p, 'outside').option, near = by(p, 'nearby').option, studio = by(p, 'studio').option;
  assert.equal(night.kind, 'show'); assert.equal(night.day, '2026-10-23'); assert.match(night.title, /Arlo Parks at La Cigale/); assert.equal(night.time, '20:00');
  assert.equal(out.kind, 'park'); assert.ok(['2026-10-24', '2026-10-25'].includes(out.day)); assert.equal(out.time, '15:00');
  const best = weather.filter((w) => ['2026-10-24', '2026-10-25'].includes(w.date) && W.goodDay(w)).sort((a, b) => a.rain - b.rain)[0];
  if (best) assert.equal(out.day, best.date, 'the drier good afternoon');
  assert.equal(near.kind, 'place'); assert.equal(near.day, out.day); assert.equal(near.time, '17:00'); assert.match(near.why, /from Buttes-Chaumont · right after/);
  const g = P.byId(near.place); assert.ok(W.km(parkAt, g) <= 3, 'near the park');
  assert.equal(studio.kind, 'studio'); assert.notEqual(studio.day, out.day, 'the studio is on the other day'); assert.equal(studio.time, '14:00');
  assert.match(studio.title, /Night bus EP/, 'a music project, not the game project');
  for (const a of p) for (const b of p) if (a !== b && a.option && b.option) assert.ok(!WP.clash(a.option, b.option), `${a.id} and ${b.id} overlap`);
});

test('deterministic: the same inputs give the same plan, every time', () => {
  const a = JSON.stringify(plan()), b = JSON.stringify(plan());
  assert.equal(a, b);
  assert.equal(JSON.stringify(plan({}, { night: 1, studio: 2 })), JSON.stringify(plan({}, { night: 1, studio: 2 })));
});

test('Swap gives the next best option and comes back round; slots never share a place or a time', () => {
  const p0 = plan(), p1 = plan({}, { night: 1 });
  assert.equal(by(p0, 'night').count, 2); assert.notEqual(by(p1, 'night').option.id, by(p0, 'night').option.id);
  assert.match(by(p1, 'night').option.title, /Rex Club/);
  assert.equal(plan({}, { night: 2 }).find((x) => x.id === 'night').option.id, by(p0, 'night').option.id, 'wraps around');
  const s1 = plan({}, { studio: 1 }); assert.match(by(s1, 'studio').option.title, /park loops/); assert.match(by(s1, 'studio').option.why, /2 loops/);
  const s2 = plan({}, { studio: 2 }); assert.match(by(s2, 'studio').option.title, /8-bar idea/);
  const o1 = plan({}, { outside: 1 }); assert.notEqual(by(o1, 'outside').option.day, by(p0, 'outside').option.day, 'the park on the other afternoon');
  assert.equal(by(o1, 'nearby').option.day, by(o1, 'outside').option.day, 'the nearby place follows the park');
  const n1 = plan({}, { nearby: 1 }); assert.notEqual(by(n1, 'nearby').option.place, by(p0, 'nearby').option.place);
});

test('no forecast (offline): the park goes to Saturday and says to check the sky', () => {
  const p = plan({ weather: null }), out = by(p, 'outside').option;
  assert.equal(out.day, '2026-10-24'); assert.match(out.why, /no forecast/);
});

test('no shows saved: the night falls back to an open personal quest, or stays empty with a reason', () => {
  const s = fresh(); P.startPersonal(s, 'airpods'); s.active = 'c-material';
  const p = plan({ s, shows: [] }); assert.equal(by(p, 'night').option.kind, 'personal'); assert.equal(by(p, 'night').option.time, '19:00');
  const e = plan({ shows: [] }); assert.equal(by(e, 'night').option, null); assert.equal(by(e, 'night').count, 0);
  assert.equal(by(e, 'nearby').option.day, by(e, 'outside').option.day, 'the rest still works');
  assert.match(WP.line(by(e, 'night')), /nothing to propose/);
});

test('studio sources: an open project first, archived and non-music projects never; nothing else → one 8-bar idea', () => {
  const open = plan({ projects: [...projects, { id: 'p-x', name: 'Synth sketches', status: 'active', updated: 1, open: true }] });
  assert.match(by(open, 'studio').option.title, /Synth sketches/); assert.match(by(open, 'studio').option.why, /you have open/);
  const none = plan({ projects: [], takes: [] }); assert.match(by(none, 'studio').option.title, /8-bar idea/); assert.equal(by(none, 'studio').count, 1);
  const producer = plan({ projects: [{ id: 'p-y', name: 'Untitled', status: 'active', persona: 'producer', updated: 5 }] }); assert.match(by(producer, 'studio').option.title, /Untitled/);
});

test('on Saturday evening the past is left out: the park and the studio move to Sunday, no clash', () => {
  const now = at(2026, 10, 24, 19);
  const p = plan({ now });
  assert.equal(by(p, 'night').option?.day ?? null, null, 'Friday\'s and Saturday\'s shows are over (Rex starts Sat 01:00 = Friday night)');
  assert.equal(by(p, 'outside').option.day, '2026-10-25');
  const st = by(p, 'studio').option; assert.equal(st.day, '2026-10-25'); assert.ok(!WP.clash(st, by(p, 'outside').option)); assert.ok(!WP.clash(st, by(p, 'nearby').option));
});

test('a finished park quest still gives a park jam (its own small music quest)', () => {
  const s = fresh(); P.startPersonal(s, 'park'); delete s.studio; for (const q of s.campaigns.find((c) => c.id === 'c-pq-park').quests) C.complete(s, q.id); s.studio = { v: 1 };
  const o = by(plan({ s }), 'outside').option; assert.equal(o.kind, 'jam'); assert.match(o.title, /Another park jam at Buttes-Chaumont/);
});

test('Accept plan: kept slots become real quests on the week plan with their times; the main quest stays; twice = no duplicates', () => {
  const s = fresh(); s.active = 'c-material';
  const i = input({ s }), built = WP.build(i), p = WP.choose(built, {}, i.now);
  const kept = p.filter((x) => x.id !== 'nearby').map((x) => x.option);
  const items = WP.accept(C, s, built.weekend.week, kept, makers);
  assert.equal(items.length, 3); assert.equal(s.active, 'c-material', 'the main quest is kept');
  C.validate(s); W.checkWeekly(s.weekly);
  const pl = W.planOf(s, '2026-10-19').items;
  assert.deepEqual(pl.map((x) => [x.day, x.time, x.kind]), [['2026-10-23', '20:00', 'show'], ...[['park', by(p, 'outside').option], ['studio', by(p, 'studio').option]].map(([k, o]) => [o.day, o.time, k]).sort((a, b) => a[0].localeCompare(b[0]))]);
  assert.ok(pl.every((x) => x.weekend && /^\d\d:\d\d · /.test(x.why)));
  const show = s.campaigns.find((c) => c.id === 'c-show-cigale-fri'); assert.ok(show && !show.paused);
  assert.ok(s.campaigns.some((c) => c.id === 'c-pq-park'));
  const studio = s.campaigns.find((c) => c.id === pl.find((x) => x.kind === 'studio').campaign); assert.equal(studio.path, 'music'); assert.equal(studio.projectId, 'p-ep'); assert.equal(studio.quests.length, 3); assert.match(studio.quests[0].title, /Night bus EP/);
  const n = s.campaigns.length;
  WP.accept(C, s, built.weekend.week, kept, makers);
  assert.equal(s.campaigns.length, n, 'no second studio campaign'); assert.equal(W.planOf(s, '2026-10-19').items.length, 3);
  assert.deepEqual([...WP.planned(s, built)].sort(), kept.map(WP.itemId).sort(), 'the card knows what is already planned');
  // the planned day's quest is what the ✦ chip follows that day
  assert.equal(W.todays(C, s, '2026-10-23')[0].item.kind, 'show');
});

console.log(JSON.stringify({ pass: true, checks }));
