// (round 70, leavefix70) unit tests: the leave reminders at every time of day (a fake clock every few minutes across
// 00:00–23:59 on ordinary days and both DST change days, the main side's ONE timer run continuously: each reminder rings
// once, a snoozed one once more, a dismissed one never again, nothing is "missed" while Hearth runs), the bugs fixed
// (an errand rolling to tomorrow while today's leave time was still ahead, a next-day reminder's words with no day, a
// missed row after midnight with a weekday instead of "yesterday", an old notification's Snooze bringing a dismissed
// reminder back), and 🎒 Before I go's rows (beforego-core.js: the list, the edit, the jacket from a cached forecast
// only, ticks per show). Paris time (TZ=Europe/Paris), like the owner's computer.
//   node dev/leavefix70-test.js
'use strict';
process.env.TZ = 'Europe/Paris';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const K = require('../leavesoon-core');
const M = require('../leavesoonmain');
const E = require('../tools/errands-core');
const B = require('../beforego-core');
const W = require('../weekquestmain');
const N = require('../notify-core');
let checks = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const MIN = 60e3;
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const HOME = { lat: 48.8606, lon: 2.3780 }; // Oberkampf / Saint-Ambroise
const SHOP = { name: 'Apple Opéra', lat: 48.8722, lon: 2.3331 };
const VENUE = { name: 'Café de la Danse', lat: 48.8535, lon: 2.3722 };
const DAYS = [[2026, 10, 24], [2026, 10, 25], [2026, 10, 26], [2026, 10, 30], [2026, 12, 31], [2027, 3, 27], [2027, 3, 28]]; // Sat, the October change (25 h), Mon, Fri, New Year's Eve, Sat, the March change (23 h)
const mk = (key, kind, title, place, targetAt, words, now) => { const travel = K.travel(HOME, place); const it = { key, kind, title, place, targetAt, words, travel, from: 'Home', origin: 'home:1' }; return { ...it, ...K.plan(it, now) }; };
const stamp = (ms) => new Date(ms).toString().slice(0, 21);
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leavefix70-'));

test('the clock is Paris time, and both DST days really are 25 h / 23 h long', () => {
  assert.equal((at(2026, 10, 26, 0) - at(2026, 10, 25, 0)) / 3600e3, 25);
  assert.equal((at(2027, 3, 29, 0) - at(2027, 3, 28, 0)) / 3600e3, 23);
});

test('errands: today’s closing counts while its leave time is still ahead (no early roll to tomorrow), at every minute of the day', () => {
  const week = E.parse('Daily 10:00–20:00'), tr = K.travel(HOME, SHOP);
  let rolledEarly = 0, rolledLate = 0, n = 0;
  for (const [y, mo, d] of DAYS) for (let m = 0; m < 1440; m++) {
    const now = new Date(y, mo - 1, d, 0, m).getTime(); if (new Date(now).getDate() !== d) continue; n++;
    const goal = at(y, mo, d, 19, 40), leaveToday = Math.floor((goal - tr.min * MIN) / 3e5) * 3e5;
    const t = K.errandTarget(week, now, tr.min), today = new Date(t.at).getDate() === d;
    if (leaveToday > now && !today) rolledEarly++;
    if (leaveToday <= now && today) rolledLate++;
    // whatever it picked can be planned at once (never "already time to go")
    assert.doesNotThrow(() => K.plan({ targetAt: t.at, travel: tr, words: t.words }, now), stamp(now));
  }
  assert.ok(n > 7 * 1380);
  assert.equal(rolledEarly, 0, 'rolled to tomorrow while today was still makeable');
  assert.equal(rolledLate, 0, 'kept today when it was too late');
  // the window that used to roll: leave at 19:15 → at 19:08 it's still today, and it rings at once
  const tr2 = K.travel(HOME, SHOP), t = K.errandTarget(week, at(2026, 10, 26, 19, 8), tr2.min);
  assert.equal(t.at, at(2026, 10, 26, 19, 40)); const p = K.plan({ targetAt: t.at, travel: tr2 }, at(2026, 10, 26, 19, 8));
  assert.ok(p.notifyAt - at(2026, 10, 26, 19, 8) <= 2000, 'less than 10 min to go: it rings in a moment');
  // lunch breaks, a late night, Sunday closed: still the next closing you can make
  const lunch = E.parse('Mon-Sat 10:00-12:00, 14:00-19:00');
  assert.equal(K.errandTarget(lunch, at(2026, 10, 26, 11, 20), 15).at, at(2026, 10, 26, 11, 40), 'before lunch: the 12:00 closing while you can still leave');
  assert.equal(K.errandTarget(lunch, at(2026, 10, 26, 11, 30), 15).at, at(2026, 10, 26, 18, 40), 'too late for 12:00: the 19:00 one');
  assert.equal(K.errandTarget(lunch, at(2026, 10, 31, 18, 30), 15).at, at(2026, 11, 2, 11, 40), 'Saturday too late, Sunday closed: Monday morning');
  const late = E.parse('Fri 18:00–02:00');
  assert.equal(K.errandTarget(late, at(2026, 10, 31, 0, 30), 15).at, at(2026, 10, 31, 1, 40), 'after midnight: Friday’s late closing, tonight');
});

test('the words carry the day: “tomorrow”, “yesterday” (a missed row after midnight), the confirm of a next-day errand', () => {
  const ref = at(2026, 10, 27, 0, 10);
  assert.equal(K.when(at(2026, 10, 26, 23, 50), ref), 'yesterday 23:50');
  assert.equal(K.when(at(2026, 10, 27, 23, 50), ref), '23:50');
  assert.equal(K.when(at(2026, 10, 28, 9, 0), ref), 'tomorrow 09:00');
  assert.equal(K.when(at(2026, 10, 30, 9, 0), ref), 'Fri 09:00');
  // a reminder missed at 23:50 and seen at 00:10: "Missed · leave at yesterday 23:50"
  const now = at(2026, 10, 26, 18), it = mk('show:late', 'show', 'Late Set', VENUE, at(2026, 10, 27, 0, 5), 'starts at 00:05', now); assert.equal(new Date(it.leaveAt).getDate(), 26);
  const s = K.empty(); K.put(s, it, now); K.settle(s, ref);
  assert.equal(s.items[0].state, 'missed'); assert.match(K.hud(s.items[0], ref).text, /^⏰ Missed · leave at yesterday \d\d:\d\d$/);
  // the errand turned on at 19:30 (too late today) → tomorrow, and the note says so
  const week = E.parse('Daily 10:00–20:00'), now2 = at(2026, 10, 26, 19, 30), t = K.errandTarget(week, now2, K.travel(HOME, SHOP).min);
  const e = { ...mk('errand:e1', 'errand', 'AirPods', SHOP, t.at, t.words, now2), state: 'on' };
  assert.match(K.confirmText(e, now2), /^⏰ I’ll remind you tomorrow at \d\d:\d\d to leave at \d\d:\d\d \(about .+ from Home; it closes at 20:00\)\.$/);
  assert.match(K.hud(e, now2).ring, /^reminder at tomorrow \d\d:\d\d$/);
  // today: no day word (the round-68 words)
  const e2 = { ...mk('errand:e2', 'errand', 'AirPods', SHOP, at(2026, 10, 26, 19, 40), 'closes at 20:00', at(2026, 10, 26, 12)), state: 'on' };
  assert.match(K.confirmText(e2, at(2026, 10, 26, 12)), /^⏰ I’ll remind you at \d\d:\d\d to leave at \d\d:\d\d \(/);
  // a reminder at 23:55 to leave at 00:05: the leave time says tomorrow
  const x = { key: 'show:x', kind: 'show', notifyAt: at(2026, 10, 26, 23, 55), leaveAt: at(2026, 10, 27, 0, 5), travel: { text: 'about 15 min walk' }, from: 'Home' };
  assert.equal(K.confirmText(x, at(2026, 10, 26, 20)), '⏰ I’ll remind you at 23:55 to leave at tomorrow 00:05 (about 15 min walk from Home).');
});

test('a dismissed reminder can’t be snoozed back (an old notification’s Snooze), nor one whose show started; an old notification never acts on a newer reminder', () => {
  const now = at(2026, 10, 30, 12), s = K.empty();
  const it = K.put(s, mk('show:a', 'show', 'Arlo', VENUE, at(2026, 10, 30, 20), 'starts at 20:00', now), now);
  assert.equal(K.snooze(s, it.key, now).state, 'on', 'not rung yet: nothing to snooze');
  K.fire(s, it.key, it.notifyAt); K.dismiss(s, it.key, it.notifyAt + MIN);
  assert.equal(K.snooze(s, it.key, it.notifyAt + 2 * MIN).state, 'dismissed'); assert.equal(K.next(s, it.notifyAt + 2 * MIN), null, 'it rings no more');
  const s2 = K.empty(), b = K.put(s2, mk('show:b', 'show', 'Bea', VENUE, at(2026, 10, 30, 20), 'starts at 20:00', now), now);
  K.fire(s2, b.key, b.notifyAt);
  assert.equal(K.snooze(s2, b.key, b.targetAt + MIN).state, 'fired', 'its show started: no snooze');
  assert.equal(K.snooze(s2, b.key, b.notifyAt + MIN).state, 'snoozed'); assert.equal(K.snooze(s2, b.key, b.notifyAt + 2 * MIN).state, 'snoozed', 'snoozed again: fine');
  // turned off and on again: yesterday's notification's buttons (made = the old createdAt) leave the new one alone
  const s3 = K.empty(), c1 = K.put(s3, { ...mk('errand:c', 'errand', 'AirPods', SHOP, at(2026, 10, 30, 19, 40), 'closes at 20:00', now), createdAt: now - 86400e3 }, now);
  K.remove(s3, c1.key); const c2 = K.put(s3, mk('errand:c', 'errand', 'AirPods', SHOP, at(2026, 10, 30, 19, 40), 'closes at 20:00', now), now); K.fire(s3, c2.key, c2.notifyAt);
  assert.equal(K.dismiss(s3, c2.key, c2.notifyAt, now - 86400e3).state, 'fired'); assert.equal(K.snooze(s3, c2.key, c2.notifyAt, now - 86400e3).state, 'fired');
  assert.equal(K.dismiss(s3, c2.key, c2.notifyAt, c2.createdAt).state, 'dismissed', 'its own notification: dismissed');
});

// the main side with a fake clock that RUNS (each timeout fires at its time): an errand (Daily 10–20) and a show 5 h
// later, turned on at a time of day; the errand's ring is snoozed, its second ring dismissed, then an old Snooze
async function day(t0, dirN) {
  let now = t0; const timers = [], due = [];
  const dir = path.join(tmpRoot, String(dirN)); fs.mkdirSync(dir);
  const api = M.create({ dataDir: dir, now: () => now, emit: (ch, ev) => { if (ch === 'leave:due') due.push(ev); }, setTimer: (fn, ms) => { const t = { fn, at: now + ms }; timers.push(t); return t; }, clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }, ratp: { status: async () => ({ state: 'unknown', why: 'offline' }), hasKey: () => false, forget() {} } });
  const week = E.parse('Daily 10:00–20:00'), tg = K.errandTarget(week, now, K.travel(HOME, SHOP).min);
  const e = mk('errand:e1', 'errand', 'AirPods', SHOP, tg.at, tg.words, now); await api.op({ op: 'put', item: e });
  const sh = mk('show:s1', 'show', 'Arlo', VENUE, t0 + 5 * 3600e3, 'starts', now); await api.op({ op: 'put', item: sh });
  let rings = 0, dismissedAt = null;
  for (let i = 0; i < 40 && timers.length; i++) {
    timers.sort((a, b) => a.at - b.at); const t = timers.shift(); now = Math.max(now, t.at);
    const before = due.length; t.fn();
    for (const ev of due.slice(before)) {
      if (ev.key !== 'errand:e1') continue;
      assert.ok(Math.abs(now - (++rings === 1 ? e.notifyAt : ev.item.firedAt)) < 2000);
      if (rings === 1) await api.op({ op: 'snooze', key: ev.key, made: ev.item.createdAt });
      else { await api.op({ op: 'dismiss', key: ev.key, made: ev.item.createdAt }); dismissedAt = now; await api.op({ op: 'snooze', key: ev.key, made: ev.item.createdAt }); } // then the first notification's Snooze, clicked late
    }
  }
  const items = (await api.op({ op: 'list' })).items, count = (k) => due.filter((x) => x.key === k).length;
  return { e, sh, items, rings: count('errand:e1'), showRings: count('show:s1'), dismissedAt, armed: api.state().armed };
}

test('the ONE timer, run continuously from every time of day (every 13 min, 7 days incl. both DST days): rings once, snooze once more, dismissed never again, nothing missed', async () => {
  let n = 0;
  for (const [y, mo, d] of DAYS) for (let m = 0; m < 1440; m += 13) {
    const t0 = new Date(y, mo - 1, d, 0, m).getTime(); if (new Date(t0).getDate() !== d) continue;
    const r = await day(t0, n++);
    const where = stamp(t0);
    assert.equal(r.rings, 2, `${where}: the errand rang ${r.rings} times (ring + its snooze)`);
    assert.equal(r.showRings, 1, `${where}: the show rang ${r.showRings} times`);
    assert.ok(!r.items.some((x) => x.state === 'missed'), `${where}: missed while running`);
    assert.equal(r.items.find((x) => x.key === 'errand:e1').state, 'dismissed', `${where}: the late Snooze brought it back`);
    assert.equal(r.armed, false, `${where}: a timer left with nothing to ring`);
  }
  assert.ok(n >= 7 * 110, `${n} times of day`);
});

test('the main side: after a dismiss the timer goes to the next reminder, even when the clock JUMPED past it (the check’s fake clock): that one is missed, never rung late', async () => {
  const t0 = at(2026, 10, 26, 19, 20); let now = t0; const timers = [], due = [];
  const dir = path.join(tmpRoot, 'jump'); fs.mkdirSync(dir);
  const api = M.create({ dataDir: dir, now: () => now, emit: (ch, ev) => { if (ch === 'leave:due') due.push(ev); }, setTimer: (fn, ms) => { const t = { fn, at: now + ms }; timers.push(t); return t; }, clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }, ratp: { status: async () => ({ state: 'unknown' }), hasKey: () => false, forget() {} } });
  const tg = K.errandTarget(E.parse('Daily 10:00–20:00'), now, K.travel(HOME, SHOP).min); // 19:20: tomorrow 19:40
  assert.equal(new Date(tg.at).getDate(), 27);
  const e = mk('errand:e1', 'errand', 'AirPods', SHOP, tg.at, tg.words, now), sh = mk('show:s1', 'show', 'Arlo', VENUE, t0 + 5 * 3600e3, 'starts', now);
  await api.op({ op: 'put', item: e }); await api.op({ op: 'put', item: sh });
  assert.equal(api.state().next.key, 'show:s1', 'the show (tonight) comes first');
  now = e.notifyAt - 1500; await api.op({ op: 'test' }).catch(() => {}); // what the round-68 check did at ~19:15+ (the fake clock jumps over the show)
  api.arm();
  assert.equal((await api.op({ op: 'list' })).items.find((x) => x.key === 'show:s1').state, 'missed', 'jumped over: missed, as when the computer slept');
  assert.equal(due.length, 0, 'never rung late');
  await new Promise((r) => setTimeout(r, 60)); // its save, in the background
});

test('🎒 Before I go: the list (Hearth’s or the owner’s, edited once), the edit box, the rows', () => {
  assert.deepEqual(B.list(null), ['Phone charged', 'Earplugs', 'ID', 'Card / cash']);
  assert.deepEqual(B.list('junk'), B.DEFAULTS); assert.deepEqual(B.list([]), B.DEFAULTS, 'an empty saved list: Hearth’s');
  const p = B.parseEdit('- Phone charged\n[x] Earplugs\n\n• Keys\n2) Lip balm\nKeys\nTicket\njacket\n' + 'x'.repeat(80));
  assert.deepEqual(p.list, ['Phone charged', 'Earplugs', 'Keys', 'Lip balm', 'x'.repeat(40)], 'bullets / ticks / blanks / doubles / Hearth’s own rows out, long lines cut');
  assert.equal(p.reset, false);
  assert.deepEqual(B.parseEdit('  \n \n'), { list: B.DEFAULTS, reset: true }, 'an empty box: back to Hearth’s list');
  assert.equal(B.parseEdit(Array.from({ length: 30 }, (_, i) => `Thing ${i}`).join('\n')).list.length, 12);
  assert.ok(B.isDefault(null) && !B.isDefault(['Keys']));
  const rs = B.rows({ list: ['Keys', 'Phone charged'], ticket: true });
  assert.deepEqual(rs.map((r) => r.kind), ['ticket', 'item', 'item']); assert.equal(rs[0].has, true); assert.equal(rs[0].text, 'Ticket (in Hearth)');
  assert.equal(B.rows({}).length, 5, 'ticket + Hearth’s four, no forecast: no jacket');
  assert.equal(B.idOf('Card / cash'), B.idOf('  card /  CASH '), 'an edit that keeps a row keeps its tick');
  assert.equal(B.idOf('Téléphone'), 'i:telephone');
});

test('🎒 the jacket: only from a cached forecast for the show’s day in Paris (rain ≥ 40 % or a high ≤ 12°); none without one', async () => {
  const start = at(2026, 10, 31, 20), days = [{ date: '2026-10-30', rain: 90, tmax: 5 }, { date: '2026-10-31', rain: 60, tmax: 15 }];
  assert.equal(B.jacket(days, start).why, 'rain'); assert.equal(B.jacket(days, start).text, 'Jacket: rain likely (60 %)');
  assert.equal(B.jacket([{ date: '2026-10-31', rain: 10, tmax: 9 }], start).text, 'Jacket: cold (9° at most)');
  assert.equal(B.jacket([{ date: '2026-10-31', rain: 70, tmax: 8.4 }], start).why, 'both');
  assert.equal(B.jacket([{ date: '2026-10-31', rain: 39, tmax: 12.5 }], start), null, 'dry and mild: no jacket');
  assert.equal(B.jacket([{ date: '2026-10-31', rain: 40, tmax: 20 }], start).why, 'rain', '40 % is enough');
  assert.equal(B.jacket(null, start), null); assert.equal(B.jacket([], start), null); assert.equal(B.jacket(days, NaN), null);
  // a 00:30 show is that day's (Paris), whatever this computer's zone: the forecast of the 31st for Sat 00:30 → the 31st
  assert.equal(B.parisDay(at(2026, 10, 31, 0, 30)), '2026-10-31'); assert.equal(B.parisDay(Date.UTC(2026, 9, 30, 23, 30)), '2026-10-31');
  assert.equal(B.rows({ days, start }).at(-1).kind, 'jacket');
  // the cache only: no forecast cached → no fetch at all
  W._reset(); let fetched = 0;
  const f = async () => { fetched++; return { ok: true, json: async () => ({ daily: { time: ['2026-10-31'], temperature_2m_max: [9], precipitation_probability_max: [80] } }) }; };
  assert.deepEqual(await W.weather({ fetch: f, cachedOnly: true }), { ok: false, why: 'not cached' }); assert.equal(fetched, 0);
  assert.equal((await W.weather({ fetch: f })).ok, true); assert.equal(fetched, 1, 'the week card asks (its own click)');
  const c = await W.weather({ fetch: f, cachedOnly: true }); assert.equal(c.ok, true); assert.equal(c.cached, true); assert.equal(fetched, 1, 'then the list reads the cache');
  assert.equal((await W.weather({ fetch: f, cachedOnly: true, now: Date.now() + 4 * 3600e3 })).ok, false, 'an old cache: nothing');
  W._reset();
});

test('🎒 ticks per show: a new show starts clear, untick works, old shows go', () => {
  const t0 = at(2026, 10, 26, 18);
  let t = B.tick(null, 'show-a', 'ticket', true, t0); t = B.tick(t, 'show-a', B.idOf('Earplugs'), true, t0);
  assert.deepEqual([...B.ticked(t, 'show-a')].sort(), ['i:earplugs', 'ticket']);
  assert.equal(B.ticked(t, 'show-b').size, 0, 'another show: nothing ticked');
  t = B.tick(t, 'show-a', 'ticket', false, t0); assert.deepEqual([...B.ticked(t, 'show-a')], ['i:earplugs']);
  t = B.tick(t, 'show-b', 'ticket', true, t0 + 15 * 86400e3); assert.ok(!t.shows['show-a'], 'two weeks later the old show’s ticks are gone');
  let many = null; for (let i = 0; i < 50; i++) many = B.tick(many, `s${i}`, 'ticket', true, t0 + i * 1000); assert.equal(Object.keys(many.shows).length, 40);
  assert.ok(many.shows.s49 && !many.shows.s0, 'the newest kept');
  assert.deepEqual(B.ticksOf({ v: 2 }), { v: 1, shows: {} }); assert.deepEqual(B.ticksOf({ v: 1, shows: { 'bad key!': { ids: ['x'] }, ok: { ids: ['a', 'a', 5] } } }).shows, { ok: { ids: ['a'], at: 0 } });
  const rs = B.rows({ list: ['Keys'] });
  assert.equal(B.progress(rs, new Set(['ticket'])).text, '1 of 2 ready'); assert.equal(B.progress(rs, new Set(['ticket', 'i:keys'])).text, 'All set ✓');
});

test('notify-core: a show’s ring carries 🎒 Before I go (the click) · Snooze 10 min · Dismiss with its createdAt', () => {
  const acts = [{ text: '🎒 Before I go', go: { leave: { key: 'show:abc', op: 'before' } } }, { text: 'Snooze 10 min', go: { leave: { key: 'show:abc', op: 'snooze', made: 5 }, quiet: 1 } }, { text: 'Dismiss', go: { leave: { key: 'show:abc', op: 'dismiss', made: 5 }, quiet: 1 } }];
  const c = N.compose({ type: 'reminder', title: 'Leave in 10 min for Arlo — about 25 min by Métro', group: 'leave:show:abc', actions: acts });
  assert.deepEqual(c.actions.map((a) => a.text), ['🎒 Before I go', 'Snooze 10 min', 'Dismiss']); assert.equal(c.actions[1].go.leave.made, 5);
});

test('the files: 🎒 rides its own lazy group (nothing on the first screen), notify.js routes it, the show card has it', () => {
  const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const LazyData = new Function(`${read('lazy-data.js')}; return LazyData;`)(); // eslint-disable-line no-new-func
  const g = LazyData.GROUPS.find((x) => x.name === 'beforego');
  assert.ok(g && g.tier === 'use' && g.files.includes('beforego.js') && g.css.includes('beforego.css'));
  assert.ok(!/<script[^>]+src="beforego/.test(read('index.html')), 'not a first-screen script');
  assert.match(read('index.html'), /lazy-at\.js#[^"]*\bbeforego\b/);
  assert.match(read('notify.js'), /o === 'before'/); assert.match(read('leavesoon.js'), /🎒 Before I go/);
  assert.ok(!/setInterval/.test(read('beforego.js') + read('beforego-core.js')), 'no polling');
  assert.ok(!/fetch\(|net\.|https?:\/\//.test(read('beforego.js') + read('beforego-core.js')), 'nothing fetched');
});

(async () => {
  try { for (const [name, fn] of tests) { await fn(); checks++; console.log('✓ ' + name); } } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
  console.log(`\n${checks} checks passed (leavefix70)`);
})().catch((err) => { console.error(err); process.exit(1); });
