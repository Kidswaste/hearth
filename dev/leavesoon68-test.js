// (round 68, leavesoon68) ⏰ Remind me to leave: unit tests for leavesoon-core.js (the Paris travel estimate, when you
// must be there, the leave / notify times, the reminders' life: on → rung → snoozed → dismissed, missed when Hearth was
// closed, never rung late) and leavesoonmain.js (ONE timer, the file, a restart after the time went by, a file that
// can't be read), plus notify-core's reminder buttons. Runs in Paris time (TZ=Europe/Paris, like the owner's computer):
// the summer → winter change of Sun 25 Oct 2026 and the skipped hour of Sun 28 Mar 2027 are checked.
//   node dev/leavesoon68-test.js
'use strict';
process.env.TZ = 'Europe/Paris';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const K = require('../leavesoon-core');
const M = require('../leavesoonmain');
const N = require('../notify-core');
const E = require('../tools/errands-core');
let checks = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const MIN = 60e3;
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime(); // Paris wall time (TZ above)
const OPERA = { name: 'Apple Opéra', lat: 48.8722, lon: 2.3331 };
const GALERIES = { lat: 48.8736, lon: 2.3320 };
const BASTILLE = { name: 'Café de la Danse', lat: 48.8535, lon: 2.3722 };
const REPUBLIQUE = { lat: 48.8675, lon: 2.3635 };
const MENIL = { name: 'La Maroquinerie', lat: 48.8687, lon: 2.3907 };
const item = (o = {}) => ({ key: 'show:abc123', kind: 'show', title: 'Arlo Parks', place: BASTILLE, targetAt: at(2026, 10, 30, 20), words: 'starts at 20:00', travel: { mode: 'metro', min: 24, text: 'about 25 min by Métro', how: 'Opéra → Bastille (line 8)' }, from: 'Home', origin: 'home:1', ...o });

test('the clock really is Paris time (summer +2 before 25 Oct 2026, winter +1 after)', () => {
  assert.equal(new Date(at(2026, 10, 24, 20)).getTimezoneOffset(), -120);
  assert.equal(new Date(at(2026, 10, 26, 20)).getTimezoneOffset(), -60);
});

test('walking: up to 20 min it walks, "about N min walk", streets ×1.2 at 4.5 km/h', () => {
  const t = K.travel(OPERA, GALERIES);
  assert.equal(t.mode, 'walk'); assert.match(t.text, /^about \d+ min walk$/);
  const m = K.metres(OPERA, GALERIES); assert.equal(t.min, Math.max(1, Math.ceil(m * 1.2 / 75)));
  assert.ok(t.min <= 5);
  // the edge: a trip of exactly 20 min still walks
  const far = { lat: OPERA.lat + (20 * 75 / 1.2 - 5) / 111195, lon: OPERA.lon };
  assert.equal(K.travel(OPERA, far).mode, 'walk'); assert.ok(K.travel(OPERA, far).min <= 20);
});

test('the Métro: walk to the nearest station + wait + ~2 min a stop + a change when no line is shared + walk', () => {
  const t = K.travel(OPERA, BASTILLE);
  assert.equal(t.mode, 'metro'); assert.match(t.text, /^about \d+ min by Métro$/);
  assert.equal(t.from, 'Opéra'); assert.equal(t.to, 'Bastille'); assert.equal(t.line, '8'); assert.match(t.how, /Opéra → Bastille \(line 8\)/);
  const S = K.stations(), a = S.find((s) => s.name === 'Opéra'), b = S.find((s) => s.name === 'Bastille');
  const want = K.walkMin(K.metres(OPERA, a)) + 3 + Math.max(1, Math.round(K.metres(a, b) / 600)) * 2 + K.walkMin(K.metres(b, BASTILLE));
  assert.equal(t.min, want); assert.ok(t.min < K.travel(OPERA, BASTILLE).m * 1.2 / 75, 'quicker than walking');
  assert.equal(t.shown % 5, 0); // "about 25", never "about 23"
  const c = K.travel(REPUBLIQUE, MENIL); // République (3 5 8 9 11) → Ménilmontant (2): one change
  if (c.mode === 'metro') { assert.equal(c.line, null); assert.match(c.how, /one change/); }
  // and it's never slower than walking: then it walks
  for (const [p, q] of [[OPERA, BASTILLE], [REPUBLIQUE, MENIL], [OPERA, MENIL]]) { const x = K.travel(p, q); assert.ok(x.min <= K.walkMin(K.metres(p, q))); }
});

test('no station close to either end: it walks (and says so); outside Paris: a plain refusal', () => {
  const edge = { lat: 48.72, lon: 2.18 }, edge2 = { lat: 48.74, lon: 2.20 };
  const t = K.travel(edge, edge2); assert.equal(t.mode, 'walk'); assert.match(t.how, /no Métro station/);
  assert.throws(() => K.travel({ lat: 45.76, lon: 4.83 }, OPERA), /no spot on the Paris map/);
  assert.equal(K.travel(OPERA, BASTILLE, []).mode, 'walk'); // no station list at all
});

test('when you must be there: a show\'s start, a weekend slot on this computer\'s clock, a date-only show refused', () => {
  assert.deepEqual(K.showTarget({ start: at(2026, 10, 30, 20) }).at, at(2026, 10, 30, 20));
  assert.match(K.showTarget({ start: at(2026, 10, 30, 20), dateOnly: true }).error, /no start time/);
  assert.equal(K.slotTarget('2026-10-31', '15:00').at, at(2026, 10, 31, 15));
  assert.match(K.slotTarget('2026-10-31', '').error, /no time/);
});

test('DST (summer → winter, Sun 25 Oct 2026): a Sunday-evening slot planned on Saturday is 25 real hours later', () => {
  const sat = at(2026, 10, 24, 20), sun = K.localAt('2026-10-25', '20:00');
  assert.equal(sun - sat, 25 * 3600e3);
  const it = item({ targetAt: sun });
  const p = K.plan(it, sat);
  assert.equal(new Date(p.leaveAt).getHours(), 19); assert.equal(new Date(p.leaveAt).getMinutes(), 35); // 20:00 − 24 min → 19:36 → rounded down to 19:35
  assert.equal(p.notifyAt, p.leaveAt - 10 * MIN);
  assert.equal(K.hm(p.notifyAt), '19:25');
  // the one timer's wait from Saturday 20:00: 24 h 25 min of wall clock + the extra hour
  assert.equal(p.notifyAt - sat, (25 * 60 - 35) * MIN);
  // the night of the change: a 02:30 show (the hour that happens twice) — leave / notify stay in real minutes
  const night = K.localAt('2026-10-25', '02:30'), q = K.plan(item({ targetAt: night, travel: { ...item().travel, min: 50 } }), at(2026, 10, 24, 22));
  assert.equal(night - q.leaveAt, 50 * MIN + (night - 50 * MIN) % (5 * MIN));
});

test('DST (winter → summer, Sun 28 Mar 2027): a skipped 02:30 reads as 03:30, and nothing breaks', () => {
  const t = K.localAt('2027-03-28', '02:30');
  assert.equal(K.hm(t), '03:30');
  const p = K.plan(item({ targetAt: K.localAt('2027-03-28', '20:00') }), at(2027, 3, 27, 20));
  assert.equal(K.hm(p.leaveAt), '19:35'); assert.equal(p.notifyAt - at(2027, 3, 27, 20), (24 * 60 - 35 - 60) * MIN); // a 23-hour day
});

test('past times: already started, already time to go, and less than 10 min left (rings in a moment)', () => {
  const t = at(2026, 10, 30, 20);
  assert.throws(() => K.plan(item({ targetAt: t }), t + MIN), /already past/);
  assert.throws(() => K.plan(item({ targetAt: t }), t - 20 * MIN), /already time to go: about 25 min by Métro, and it starts at 20:00/);
  const p = K.plan(item({ targetAt: t }), t - 30 * MIN); // leave at 19:35, now 19:30: notify in a moment (not in the past)
  assert.equal(K.hm(p.leaveAt), '19:35'); assert.equal(p.notifyAt, t - 30 * MIN + 2000);
  assert.equal(K.plan(item({ targetAt: t }), t - 40 * MIN).notifyAt, t - 35 * MIN); // now 19:20: the usual 19:25
});

test('an errand: be there 20 min before it closes, the next closing you can still make', () => {
  const week = E.parse('Mon–Sat 10:00–20:00 · Sun closed');
  const fri9 = at(2026, 10, 30, 9);
  let x = K.errandTarget(week, fri9, 15);
  assert.equal(x.at, at(2026, 10, 30, 19, 40)); assert.equal(x.closeAt, at(2026, 10, 30, 20)); assert.equal(x.words, 'closes at 20:00');
  x = K.errandTarget(week, at(2026, 10, 30, 19, 30), 15); // too late tonight → Saturday
  assert.equal(x.at, at(2026, 10, 31, 19, 40));
  x = K.errandTarget(week, at(2026, 10, 31, 19, 30), 15); // Saturday too late, Sunday closed → Monday
  assert.equal(x.at, at(2026, 11, 2, 19, 40));
  x = K.errandTarget(week, at(2026, 10, 24, 12), 15); // Saturday 24 Oct (the night before the change) → closes 20:00 that day
  assert.equal(K.hm(x.at), '19:40');
  const late = E.parse('Tue-Sat 22:00-02:00'); // a late night: the real close is 02:00 the next day
  x = K.errandTarget(late, at(2026, 10, 30, 23), 10);
  assert.equal(x.at, at(2026, 10, 31, 1, 40));
  assert.match(K.errandTarget(E.parse('24/7'), fri9, 10).error, /24 h/);
  assert.match(K.errandTarget(null, fri9, 10).error, /no opening hours/);
  assert.match(K.errandTarget(E.parse('Mon 10:00-10:15'), fri9, 10).error, /next week/); // too short to shop in
  const lunch = E.parse('Mon-Fri 9-12, 14-18');
  assert.equal(K.errandTarget(lunch, at(2026, 10, 30, 9), 10).at, at(2026, 10, 30, 11, 40)); // the morning's close first
});

test('the reminders\' life: put → next → fire → snooze 10 min → dismiss; one at a time, soonest first', () => {
  const s = K.empty(), now = at(2026, 10, 30, 12);
  const a = K.put(s, { ...item(), ...K.plan(item(), now) }, now);
  const b2 = item({ key: 'errand:c-errand-x', kind: 'errand', title: 'AirPods', place: OPERA, targetAt: at(2026, 10, 30, 19, 40), words: 'closes at 20:00', travel: { mode: 'walk', min: 12, text: 'about 10 min walk', how: 'on foot' } });
  const b = K.put(s, { ...b2, ...K.plan(b2, now) }, now);
  assert.equal(a.state, 'on'); assert.equal(s.items[0].key, b.key, 'soonest first');
  assert.deepEqual(K.next(s, now), { key: b.key, due: b.notifyAt });
  K.fire(s, b.key, b.notifyAt);
  assert.deepEqual(K.next(s, b.notifyAt), { key: a.key, due: a.notifyAt }, 'a rung one never rings again');
  const z = K.snooze(s, b.key, b.notifyAt + MIN); assert.equal(z.state, 'snoozed'); assert.equal(z.snoozeUntil, b.notifyAt + 11 * MIN);
  assert.equal(K.dueOf(z), z.snoozeUntil); assert.equal(K.next(s, b.notifyAt + MIN).key, a.key, 'a (19:25) comes before the snoozed one (19:26)');
  K.fire(s, a.key, a.notifyAt); assert.deepEqual(K.next(s, a.notifyAt), { key: b.key, due: z.snoozeUntil }, 'then the snoozed one');
  K.dismiss(s, b.key, a.notifyAt); assert.equal(K.next(s, a.notifyAt), null, 'dismissed: no more');
  assert.ok(K.remove(s, a.key)); assert.equal(K.next(s, now), null);
  assert.throws(() => K.put(s, { ...item(), leaveAt: now - 3600e3, notifyAt: now - 3600e3 }, now), /already gone by/);
  assert.throws(() => K.check({ ...item(), key: 'bad key!' }), /can’t be kept/);
});

test('missed: Hearth closed (or asleep) past its time → missed, never rung late, said once; within 2 min it still rings', () => {
  const s = K.empty(), now = at(2026, 10, 30, 12);
  const it = K.put(s, { ...item(), ...K.plan(item(), now) }, now);
  assert.equal(K.settle(s, it.notifyAt + 90e3), false); assert.equal(K.next(s, it.notifyAt + 90e3).key, it.key, 'a 90 s late wake still rings');
  assert.equal(K.settle(s, it.notifyAt + 5 * MIN), true);
  assert.equal(s.items[0].state, 'missed'); assert.equal(K.next(s, it.notifyAt + 5 * MIN), null);
  assert.equal(K.missed(s).length, 1); s.items[0].missedSeen = true; assert.equal(K.missed(s).length, 0);
  assert.match(K.hud(s.items[0], it.notifyAt + 5 * MIN).text, /Missed · leave at 19:35/);
  K.settle(s, it.targetAt + 3 * 86400e3); assert.equal(s.items.length, 0, 'gone two days after its time');
});

test('the words: "Leave in 10 min for Arlo Parks — about 25 min by Métro", the tracker row, the confirm', () => {
  const now = at(2026, 10, 30, 12), it = { ...item(), ...K.plan(item(), now), state: 'on' };
  const n = K.notice(it, it.notifyAt);
  assert.equal(n.title, 'Leave in 10 min for Arlo Parks — about 25 min by Métro');
  assert.match(n.body, /^Leave at 19:35 from Home · starts at 20:00 · Café de la Danse · Opéra → Bastille/);
  assert.equal(K.notice(it, it.leaveAt + MIN).title, 'Time to leave for Arlo Parks — about 25 min by Métro');
  const h = K.hud(it, now); assert.equal(h.text, '⏰ Leave at 19:35'); assert.match(h.sub, /Arlo Parks · about 25 min by Métro from Home/); assert.equal(h.ring, 'reminder at 19:25');
  assert.equal(K.hud(it, at(2026, 10, 29, 12)).text, '⏰ Leave at tomorrow 19:35');
  assert.equal(K.hud({ ...it, state: 'fired' }, it.leaveAt + MIN).text, '⏰ Time to leave');
  assert.equal(K.hud({ ...it, state: 'dismissed' }, now), null); assert.equal(K.hud(it, it.targetAt + MIN), null);
  assert.equal(K.confirmText(it), '⏰ I’ll remind you at 19:25 to leave at 19:35 (about 25 min by Métro from Home).');
});

test('notify-core: a reminder carries Show on map (the click) · Snooze 10 min · Dismiss (quiet), only the master switch stops it', () => {
  const acts = [{ text: 'Show on map', go: { leave: { key: 'show:abc123', op: 'map' } } }, { text: 'Snooze 10 min', go: { leave: { key: 'show:abc123', op: 'snooze' }, quiet: 1 } }, { text: 'Dismiss', go: { leave: { key: 'show:abc123', op: 'dismiss' }, quiet: 1 } }];
  const c = N.compose({ type: 'reminder', title: 'Leave in 10 min for Arlo Parks — about 25 min by Métro', body: 'Leave at 19:35', group: 'leave:show:abc123', actions: acts });
  assert.deepEqual(c.actions.map((a) => a.text), ['Show on map', 'Snooze 10 min', 'Dismiss']); assert.equal(c.actions[1].go.quiet, 1); assert.equal(c.group, 'leave:show:abc123');
  assert.ok(!JSON.stringify(c).includes('approve'));
  assert.equal(N.decide({ type: 'reminder' }, { settings: { notifyWhen: { replies: false, renders: false, keepgoing: false, needs: false, updates: false } } }).show, true);
  assert.equal(N.decide({ type: 'reminder' }, { settings: { notify: false } }).show, false);
  assert.equal(N.compose({ type: 'reminder', title: 'x' }).actions[0].text, 'Open Hearth'); // a show reminder (showprep62) keeps its old button
});

test('the main side: ONE timer to the next reminder, rings once with the words, re-arms; none when nothing is on', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leavesoon-'));
  let clock = at(2026, 10, 30, 12); const timers = []; const events = [];
  const fake = { now: () => clock, emit: (ch, ev) => events.push([ch, ev]), setTimer: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; }, clearTimer: (t) => { t.live = false; } };
  const live = () => timers.filter((t) => t.live);
  const api = M.create({ dataDir: dir, ...fake });
  assert.equal(api.arm().armed, false); assert.equal(live().length, 0, 'nothing on: no timer at all');
  const it = { ...item(), ...K.plan(item(), clock) };
  await api.op({ op: 'put', item: it });
  assert.equal(live().length, 1); assert.equal(live()[0].ms, it.notifyAt - clock);
  const it2 = item({ key: 'plan:wk-wp-place-x', kind: 'plan', title: 'Visit Square du Temple', targetAt: at(2026, 10, 31, 17) });
  await api.op({ op: 'put', item: { ...it2, ...K.plan(it2, clock) } });
  assert.equal(live().length, 1, 'still one timer'); assert.equal(live()[0].ms, it.notifyAt - clock, 'to the soonest');
  clock = it.notifyAt; const t = live()[0]; t.live = false; t.fn();
  const due = events.filter(([ch]) => ch === 'leave:due');
  assert.equal(due.length, 1); assert.equal(due[0][1].title, 'Leave in 10 min for Arlo Parks — about 25 min by Métro'); assert.equal(due[0][1].key, it.key);
  assert.equal(live().length, 1); assert.equal(live()[0].ms, K.plan(it2, at(2026, 10, 30, 12)).notifyAt - clock, 're-armed to the next');
  await new Promise((r) => setTimeout(r, 50)); // the save after a ring is atomic and in the background
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'leavesoon', 'reminders.json'), 'utf8'));
  assert.equal(onDisk.items.find((x) => x.key === it.key).state, 'fired');
  // Snooze 10 min from the notification → the timer goes to then
  await api.op({ op: 'snooze', key: it.key }); assert.equal(live()[0].ms, 10 * MIN);
  await api.op({ op: 'dismiss', key: it.key }); assert.notEqual(live()[0].ms, 10 * MIN);
  // a restart after Hearth was closed past the Saturday one: missed, not rung, said once
  clock = at(2026, 10, 31, 18); events.length = 0;
  const again = M.create({ dataDir: dir, ...fake }); again.arm();
  assert.equal(events.filter(([ch]) => ch === 'leave:due').length, 0, 'never rung late');
  const missed = (await again.op({ op: 'missed' })); assert.equal(missed.length, 1); assert.equal(missed[0].key, it2.key);
  assert.equal(await again.op({ op: 'seen', keys: [it2.key] }), 1); assert.equal((await again.op({ op: 'missed' })).length, 0);
  await new Promise((r) => setTimeout(r, 50));
  const third = M.create({ dataDir: dir, ...fake }); third.arm(); assert.equal((await third.op({ op: 'missed' })).length, 0, 'seen stays seen after a restart');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the main side: a file that can\'t be read rings nothing and is never saved over', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leavesoon-'));
  fs.mkdirSync(path.join(dir, 'leavesoon')); const f = path.join(dir, 'leavesoon', 'reminders.json');
  fs.writeFileSync(f, '{"v":1,"items":[ broken');
  const timers = []; const api = M.create({ dataDir: dir, now: () => at(2026, 10, 30, 12), setTimer: (fn, ms) => { timers.push(ms); return {}; }, clearTimer: () => {} });
  api.arm(); assert.equal(timers.length, 0);
  const r = await api.op({ op: 'put', item: { ...item(), ...K.plan(item(), at(2026, 10, 30, 12)) } }).then(() => 'saved', (e) => e.message);
  assert.match(r, /couldn’t be read/); assert.equal(fs.readFileSync(f, 'utf8'), '{"v":1,"items":[ broken');
  fs.rmSync(dir, { recursive: true, force: true });
});

(async () => {
  for (const [name, fn] of tests) { await fn(); checks++; console.log('✓ ' + name); }
  console.log(`\n${checks} checks passed (leavesoon68)`);
})().catch((err) => { console.error(err); process.exit(1); });
