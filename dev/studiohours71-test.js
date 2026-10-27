// (round 71, studiohours71) 🎛 Studio hours, the adding-up (tools/studiohours-core.js), with no app:
//   1. Paris time on any computer clock: days, Monday-to-Sunday weeks, midnights on both DST Sundays (25 h / 23 h days)
//   2. a session across midnight (and across Sunday → Monday) split by the clock time on each side; the DST night
//   3. the summary: this week by day, the last 8 weeks, sessions by the week they started in, longest, Serum 2 vs Vital,
//      sketches / loops by the week they were saved, park sessions, the live session over its stored copy, damaged rows
//   4. the goal's words (off by default, never a word about a missed week) and the tracker row's words
//   5. the Sunday note: from 18:00 Paris, "once / twice / 3 times", never with none, never on another day
// The whole test runs again under TZ=America/Los_Angeles and TZ=Asia/Tokyo: the answers must not change.
//   node dev/studiohours71-test.js
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const K = require('../tools/studiohours-core.js');
const out = { checks: 0, tz: process.env.TZ || '(computer)' }, ok = (v, msg) => { assert.ok(v, msg); out.checks++; }, eq = (a, b, msg) => { assert.deepEqual(a, b, msg); out.checks++; };
const Z = (s) => Date.parse(s); // an exact moment (always written in UTC here)
const MIN = 60000, near = (a, b, msg) => ok(Math.abs(a - b) < 1e-6, `${msg} (${a} vs ${b})`);
const row = (id, start, end, minutes, more = {}) => ({ id, start: new Date(start).toISOString(), end: new Date(end).toISOString(), minutes, used: { park: false, liveset: false, arrange: false }, instruments: [], place: '', sketches: [], logged: null, ...more });

try {
  // ---------- 1. Paris time ----------
  eq(K.offset(Z('2026-01-15T12:00:00Z')), 60, 'winter: Paris is UTC+1');
  eq(K.offset(Z('2026-07-15T12:00:00Z')), 120, 'summer: Paris is UTC+2');
  eq(K.dayKey(Z('2026-10-25T23:30:00Z')), '2026-10-26', 'Sunday 23:30 UTC is already Monday 00:30 in Paris');
  eq(K.dayKey(Z('2026-07-05T22:30:00Z')), '2026-07-06', 'summer: 22:30 UTC is Monday 00:30 in Paris');
  eq(K.weekday('2026-10-26'), 0, 'Monday is day 0'); eq(K.weekday('2026-10-25'), 6, 'Sunday is day 6');
  eq(K.weekKey(Z('2026-10-25T23:30:00Z')), '2026-10-26', 'Monday 00:30 Paris belongs to the week of Monday 26 Oct');
  eq(K.weekKey(Z('2026-10-25T22:30:00Z')), '2026-10-19', 'Sunday 23:30 Paris still belongs to the week of 19 Oct');
  eq(K.weekKey(Z('2026-10-27T11:00:00Z')), '2026-10-26', 'Tuesday → its Monday');
  eq(K.weekKey(Z('2026-01-01T12:00:00Z')), '2025-12-29', 'a week across New Year starts on Monday 29 Dec');
  eq(K.midnight('2026-10-25'), Z('2026-10-24T22:00:00Z'), 'Sunday 25 Oct (summer time ends) starts at 22:00 UTC');
  eq(K.midnight('2026-10-26'), Z('2026-10-25T23:00:00Z'), 'Monday 26 Oct starts at 23:00 UTC (winter time)');
  eq(K.midnight('2026-10-26') - K.midnight('2026-10-25'), 25 * 3600e3, 'the day summer time ends is 25 hours long');
  eq(K.midnight('2026-03-30') - K.midnight('2026-03-29'), 23 * 3600e3, 'the day summer time starts is 23 hours long');
  eq(K.addDays('2026-03-29', 1), '2026-03-30', 'adding a day over the DST Sunday'); eq(K.addDays('2026-03-02', -7 * 8), '2026-01-05', '8 weeks back');
  eq(K.sundayEvening(Z('2026-10-25T17:00:00Z')), '2026-10-25', 'Sunday 18:00 Paris (winter time, 17:00 UTC): the evening');
  eq(K.sundayEvening(Z('2026-10-25T16:59:00Z')), '', 'Sunday 17:59 Paris: not yet');
  eq(K.sundayEvening(Z('2026-07-05T16:00:00Z')), '2026-07-05', 'summer Sunday 18:00 Paris (16:00 UTC)');
  eq(K.sundayEvening(Z('2026-10-25T23:30:00Z')), '', 'Monday 00:30 Paris is not Sunday evening any more');

  // ---------- 2. splitting a session between its days ----------
  const SUN23 = Z('2026-10-25T22:00:00Z'), MON01 = Z('2026-10-26T00:00:00Z'); // Sun 23:00 → Mon 01:00 Paris
  let parts = K.split(row('a', SUN23, MON01, 120));
  eq(parts.map((p) => p.day), ['2026-10-25', '2026-10-26'], 'across midnight: two days');
  near(parts[0].ms / MIN, 60, 'an hour on Sunday'); near(parts[1].ms / MIN, 60, 'an hour on Monday');
  parts = K.split(row('b', SUN23, MON01, 60));
  near(parts[0].ms / MIN, 30, 'active time shared by the clock time each side (30 min Sunday)'); near(parts[1].ms / MIN, 30, '30 min Monday');
  parts = K.split(row('c', Z('2026-10-24T21:00:00Z'), Z('2026-10-25T03:00:00Z'), 360)); // Sat 23:00 CEST → Sun 04:00 CET = 6 h of clock
  near(parts[0].ms / MIN, 60, 'the DST night: Saturday gets its 1 h'); near(parts[1].ms / MIN, 300, 'Sunday gets the 5 h (one of them twice on the wall clock)');
  near(parts.reduce((a, p) => a + p.ms, 0) / MIN, 360, 'nothing lost or made up');
  eq(K.split(row('d', SUN23, SUN23, 25)).map((p) => [p.day, p.ms / MIN]), [['2026-10-25', 25]], 'no clock span: all on its start day');
  eq(K.split(row('e', SUN23, MON01, 0)), [], 'zero minutes: nothing');
  parts = K.split(row('f', Z('2026-10-23T20:00:00Z'), Z('2026-10-26T04:00:00Z'), 60)); // Fri 22:00 → Mon 05:00 Paris
  eq(parts.map((p) => p.day), ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'], 'a session left running over a weekend: every day in it');

  // ---------- 3. the summary ----------
  const NOW = Z('2026-10-27T11:00:00Z'); // Tuesday 27 Oct 2026, 12:00 Paris
  const rows = K.rowsOf({ v: 1, sessions: [
    row('mon', Z('2026-10-26T18:00:00Z'), Z('2026-10-26T19:30:00Z'), 80, { instruments: ['Vital'], sketches: [{ path: '/s/1.wav', at: '2026-10-26T19:20:00Z', seconds: 30 }] }),
    row('cross', SUN23, MON01, 120, { instruments: ['Serum 2'], used: { park: false, liveset: true, arrange: false } }), // starts Sunday (last week), 60 min into this Monday
    row('park', Z('2026-10-21T13:00:00Z'), Z('2026-10-21T13:45:00Z'), 40, { instruments: ['Vital'], used: { park: true, liveset: false, arrange: false }, place: 'Buttes-Chaumont', sketches: [{ path: '/s/2.wav', at: '2026-10-21T13:40:00Z', seconds: 30 }, { path: '/s/3.wav', at: '2026-10-21T13:44:00Z', seconds: 30 }] }),
    row('both', Z('2026-10-14T18:00:00Z'), Z('2026-10-14T20:00:00Z'), 100, { instruments: ['Serum 2', 'Vital'] }),
    row('old', Z('2026-09-08T18:00:00Z'), Z('2026-09-08T19:00:00Z'), 50, { instruments: ['Serum 2'] }), // week of 7 Sep: the 8th week back
    row('too-old', Z('2026-09-01T18:00:00Z'), Z('2026-09-01T23:00:00Z'), 300, { instruments: ['Serum 2'] }), // before the 8 weeks
    { id: 'broken', start: 'yesterday', end: 'x', minutes: 'lots' }, null,
  ] }, row('mon', Z('2026-10-26T18:00:00Z'), Z('2026-10-26T20:00:00Z'), 95, { instruments: ['Vital'], sketches: [{ path: '/s/1.wav', at: '2026-10-26T19:20:00Z', seconds: 30 }] })); // the live session (the desk still open) over its stored copy
  eq(rows.length, 6, 'damaged rows are left out, the live session replaces its stored copy (no double count)');
  const loops = [{ kind: 'sketch-loop', at: '2026-10-26T20:10:00Z' }, { kind: 'sketch-loop', at: '2026-10-22T10:00:00Z' }, { v: 1, at: '2026-10-26T10:00:00Z' /* a park take, not a trimmed loop */ }, { kind: 'sketch-loop', at: '2026-08-01T10:00:00Z' }];
  const s = K.summary(rows, NOW, { goal: 0, loops });
  eq(s.week.key, '2026-10-26', 'this week starts Monday 26 Oct'); eq(s.week.label, '26 Oct', 'its label');
  eq(s.week.days.map((d) => d.name), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'seven days, Monday first');
  near(s.week.days[0].minutes, 95 + 60, 'Monday: the live session (95) + the hour after midnight of Sunday’s session (60)');
  eq(s.week.days.slice(1).map((d) => d.minutes), [0, 0, 0, 0, 0, 0], 'nothing yet the rest of the week');
  ok(s.week.days[1].today && !s.week.days[1].later && s.week.days[2].later && !s.week.days[0].later, 'Tuesday is today, Wednesday on are later');
  eq(s.weeks.map((w) => w.key), ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'], 'the last 8 weeks, oldest first, Mondays');
  near(s.weeks[7].minutes, 155, 'this week: 2 h 35'); near(s.weeks[6].minutes, 60 + 40, 'last week: Sunday’s first hour + the park'); near(s.weeks[5].minutes, 100, 'two weeks ago'); near(s.weeks[0].minutes, 50, 'the 8th week back');
  ok(s.weeks[7].current && !s.weeks[6].current, 'the current week is marked');
  eq([s.week.sessions, s.week.park, s.week.sketches, s.week.loops], [1, 0, 1, 1], 'this week: 1 session started (Sunday’s belongs to last week), 1 sketch, 1 loop trimmed');
  eq([s.all.sessions, s.all.park, s.all.sketches, s.all.loops], [5, 1, 3, 2], '8 weeks: 5 sessions (not the one before), 1 park, 3 sketches, 2 loops (a park take isn’t one)');
  near(s.all.minutes, 155 + 100 + 100 + 50, '8 weeks: the time adds up');
  eq(s.longest, { minutes: 120, day: '2026-10-25', name: 'Sun 25 Oct' }, 'longest session: 2 h on Sun 25 Oct (the 5-hour one is older than 8 weeks)');
  eq(s.instruments.map((x) => [x.name, x.minutes]), [['Serum 2', 220], ['Vital', 185]], 'Serum 2 vs Vital: a session with both gives each half');
  eq(s.top.name, 'Serum 2', 'most used: Serum 2');
  eq(K.instrument('Serum2.vst3'), 'Serum 2', 'Serum’s file name → Serum 2'); eq(K.instrument('vital'), 'Vital', 'vital → Vital');
  eq(s.goal, null, 'no goal by default');
  // DST week: the week of 19 Oct holds its 25-hour Sunday whole
  const dst = K.summary([row('late', Z('2026-10-25T21:30:00Z'), Z('2026-10-25T22:30:00Z'), 60)], Z('2026-10-25T22:45:00Z'));
  eq(dst.week.key, '2026-10-19', 'Sunday 23:45 Paris after the clocks went back: still the week of 19 Oct'); near(dst.week.days[6].minutes, 60, 'the hour lands on Sunday');
  const spring = K.summary([row('spr', Z('2026-03-29T00:30:00Z'), Z('2026-03-29T01:30:00Z'), 60)], Z('2026-03-29T12:00:00Z')); // 01:30 CET → 03:30 CEST
  eq(spring.week.key, '2026-03-23', 'the spring-forward Sunday is in the week of 23 Mar'); near(spring.week.days[6].minutes, 60, 'a session through the missing hour: on Sunday, whole');
  const nothing = K.summary(K.rowsOf(null), NOW);
  ok(!nothing.any && nothing.week.minutes === 0 && nothing.longest === null && nothing.top === null, 'no sessions at all: an empty summary, no errors');

  // ---------- 4. the goal and the row's words ----------
  eq([K.clock(0), K.clock(45), K.clock(60), K.clock(200), K.clock(185), K.clock(59.6)], ['0 min', '45 min', '1 h', '3 h 20', '3 h 05', '1 h'], 'times in plain words');
  const g1 = K.summary(rows, NOW, { goal: 240 }).goal;
  eq(g1.line, 'New week, fresh start', 'last week had less than the goal: only "New week, fresh start"'); near(g1.frac, 155 / 240, 'the ring shows this week’s share'); ok(!g1.reached, 'not reached yet');
  const g2 = K.summary(rows, NOW, { goal: 90 }).goal;
  ok(g2.reached && g2.frac === 1 && g2.line === 'Goal reached ✓ · 1 h 30 this week', 'reached: a full ring and a ✓');
  const g3 = K.goalOf(240, 80, 300);
  eq(g3.line, '1 h 20 of 4 h', 'after a week that reached it: "1 h 20 of 4 h"');
  for (const g of [g1, g2, g3, K.goalOf(240, 0, 0), K.goalOf(240, 239, 10)]) ok(!/miss|fail|behind|only|should|late/i.test(g.line), `never a guilt word: "${g.line}"`);
  eq(K.goalOf(0, 100, 0), null, 'goal 0 = off'); eq(K.goalOf('nope', 1, 1), null, 'a bad value = off');
  eq(K.rowText(s), 'This week: 2 h 35 making music', 'the tracker row');
  eq(K.rowText(K.summary(rows, Z('2026-11-02T09:00:00Z'))), 'This week: new week, fresh start', 'a new week with nothing yet: kind words');
  eq(K.rowText(nothing), 'Studio hours: your music time shows here', 'never played: what it will show');
  eq(K.GOALS[0], 0, 'the goal chips start with Off');

  // ---------- 5. the Sunday note ----------
  const week = [row('w1', Z('2026-10-19T18:00:00Z'), Z('2026-10-19T19:00:00Z'), 50), row('w2', Z('2026-10-22T18:00:00Z'), Z('2026-10-22T19:00:00Z'), 30), row('w3', Z('2026-10-25T10:00:00Z'), Z('2026-10-25T11:00:00Z'), 40), row('prev', Z('2026-10-18T10:00:00Z'), Z('2026-10-18T11:00:00Z'), 40)];
  eq(K.sundayNote(week, Z('2026-10-25T17:00:00Z')), { week: '2026-10-19', count: 3, text: 'You made music 3 times this week 🎛' }, 'Sunday 18:00 Paris: "You made music 3 times this week 🎛"');
  eq(K.sundayNote(week, Z('2026-10-25T16:30:00Z')), null, 'Sunday 17:30: not yet');
  eq(K.sundayNote(week, Z('2026-10-24T19:00:00Z')), null, 'Saturday evening: no note');
  eq(K.sundayNote(week.slice(3), Z('2026-10-25T17:00:00Z')), null, 'none this week (only last week’s): never a note');
  eq(K.sundayNote([], Z('2026-10-25T19:00:00Z')), null, 'no sessions at all: never a note');
  eq(K.sundayNote(week.slice(0, 1), Z('2026-10-25T17:00:00Z')).text, 'You made music once this week 🎛', 'one: "once"');
  eq(K.sundayNote(week.slice(0, 2), Z('2026-10-25T17:00:00Z')).text, 'You made music twice this week 🎛', 'two: "twice"');
  eq(K.sundayNote([row('z', Z('2026-10-20T18:00:00Z'), Z('2026-10-20T18:00:00Z'), 0)], Z('2026-10-25T17:00:00Z')), null, 'a 0-minute row isn’t music');
  eq(K.sundayNote(week, Z('2026-10-25T23:30:00Z')), null, 'Monday 00:30 Paris (still Sunday in UTC): the week is over, no note');
} catch (err) { console.error(err); process.exitCode = 1; out.error = err.message; }

// the same answers on a computer set to another time zone
if (!process.env.SH71_CHILD && !process.exitCode) {
  for (const tz of ['America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
    const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, TZ: tz, SH71_CHILD: '1' }, encoding: 'utf8' });
    let o = null; try { o = JSON.parse(r.stdout); } catch { /* shown below */ }
    if (r.status !== 0 || !o || o.checks !== out.checks) { process.exitCode = 1; out.error = `TZ=${tz}: ${o?.error || r.stderr || r.stdout}`.slice(0, 600); break; }
    (out.otherClocks = out.otherClocks || []).push(`${tz}: ${o.checks} ✓`);
  }
}
console.log(JSON.stringify(out, null, 1));
