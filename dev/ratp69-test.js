// (round 69, ratp69) Leave reminders honest about the Métro: unit tests for ratp-core.js (the night: last trains about
// 00:40 Sun–Thu / 01:40 Fri–Sat, back about 05:30, in Paris time whatever the computer's zone; walk / Noctilien / taxi /
// the last one; the route's lines; the status feeds' shapes; the verdict; when the one check is due), ratpmain.js (the
// fetch against dev/fake-ratp.js: providers, the key only in PRIM's header, the cache, offline, nothing personal sent)
// and leavesoonmain.js's status check on its ONE timer (warn once, Leave earlier, offline never holds the reminder).
//   node dev/ratp69-test.js
'use strict';
process.env.TZ = 'Europe/Paris';
delete process.env.HEARTH_TEST_SAVE_DIR; delete process.env.HEARTH_RATP_BASE;
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('../ratp-core');
const K = require('../leavesoon-core');
const RM = require('../ratpmain');
const M = require('../leavesoonmain');
const FAKE = require('./fake-ratp');
let checks = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const MIN = 60e3;
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime(); // Paris wall time (TZ above)
const hm = (ms) => new Date(ms).toTimeString().slice(0, 5);
const ST = R.stations();
const station = (n) => ST.find((s) => s.name === n);
// a Métro trip as leavesoon-core makes it (from a spot near one station to near another)
const near = (name, dLat = 0.0006) => ({ lat: station(name).lat + dLat, lon: station(name).lon });
const trip = (a, b) => { const t = K.travel(near(a), near(b)); const lines = R.routeLines(t.from, t.to, t.line); return { ...t, lines }; };

test('the Métro\'s hours: last about 00:40 on Sun–Thu nights, about 01:40 on Fri / Sat nights, back about 05:30', () => {
  // Mon 26 Oct 2026 → Tue 27: a weeknight
  assert.equal(R.metroAt(at(2026, 10, 27, 0, 35)).open, true);
  const c = R.metroAt(at(2026, 10, 27, 0, 45));
  assert.equal(c.open, false); assert.equal(c.lastText, 'about 00:40'); assert.equal(c.last, at(2026, 10, 27, 0, 40)); assert.equal(c.reopen, at(2026, 10, 27, 5, 30));
  assert.equal(R.metroAt(at(2026, 10, 27, 5, 29)).open, false); assert.equal(R.metroAt(at(2026, 10, 27, 5, 30)).open, true);
  assert.equal(R.metroAt(at(2026, 10, 27, 23, 0)).last, at(2026, 10, 28, 0, 40), 'in the evening: tonight\'s last train');
  // Fri 30 Oct → Sat 31: a weekend night (01:40); Sat → Sun too; Sun → Mon back to 00:40; Thu → Fri is a weeknight
  assert.equal(R.metroAt(at(2026, 10, 31, 1, 30)).open, true); assert.equal(R.metroAt(at(2026, 10, 31, 1, 45)).open, false);
  assert.equal(R.metroAt(at(2026, 10, 30, 22, 0)).last, at(2026, 10, 31, 1, 40)); assert.equal(R.metroAt(at(2026, 10, 30, 22, 0)).lastText, 'about 01:40');
  assert.equal(R.metroAt(at(2026, 11, 1, 1, 30)).open, true, 'Saturday night');
  assert.equal(R.metroAt(at(2026, 11, 2, 1, 30)).open, false, 'Sunday night: 00:40');
  assert.equal(R.metroAt(at(2026, 10, 30, 1, 0)).open, false, 'Thursday night: 00:40');
  // the night the clocks went back (Sat 24 → Sun 25 Oct 2026, 03:00 → 02:00): last 01:40, back at 05:30 local
  const dst = R.metroAt(at(2026, 10, 25, 2, 30));
  assert.equal(dst.open, false); assert.equal(dst.last, at(2026, 10, 25, 1, 40)); assert.equal(dst.reopen, at(2026, 10, 25, 5, 30));
  assert.equal((dst.reopen - dst.last) / MIN, 230 + 60, 'that night is an hour longer');
  // the spring night (Sat 27 → Sun 28 Mar 2027, 02:00 → 03:00): back at 05:30 local, an hour shorter
  const spring = R.metroAt(at(2027, 3, 28, 1, 50));
  assert.equal(spring.open, false); assert.equal((spring.reopen - spring.last) / MIN, 230 - 60);
});

test('Paris time, whatever this computer\'s clock says (a laptop still set to Tokyo or New York)', () => {
  const ms = at(2026, 10, 27, 0, 45); // 00:45 in Paris on a weeknight: closed
  for (const tz of ['Asia/Tokyo', 'America/New_York', 'UTC']) {
    const out = execFileSync(process.execPath, ['-e', `const R=require(${JSON.stringify(path.join(__dirname, '..', 'ratp-core.js'))});const m=R.metroAt(${ms});console.log(JSON.stringify([m.open,m.last,m.reopen]))`], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out), [false, at(2026, 10, 27, 0, 40), at(2026, 10, 27, 5, 30)], tz);
  }
});

test('route lines: a shared line (the chosen one first), else one change at a station both lines serve', () => {
  assert.deepEqual(R.routeLines('Opéra', 'Bastille', '8'), [{ lines: ['8'], via: null }]);
  const rb = R.routeLines('République', 'Bastille', '5');
  assert.deepEqual(rb.map((o) => o.lines), [['5'], ['8']], 'both shared lines, chosen first');
  assert.deepEqual(R.routeLines('République', 'Bastille', '8').map((o) => o.lines), [['8'], ['5']]);
  // Pigalle (2, 12) → Bastille (1, 5, 8): no shared line; every option is X then Y at a station serving both, cheapest first
  const pb = R.routeLines('Pigalle', 'Bastille', null);
  const a = station('Pigalle'), b = station('Bastille');
  assert.ok(pb.length >= 1 && pb.length <= 3);
  for (const o of pb) { const v = station(o.via); assert.ok(a.lines.includes(o.lines[0]) && b.lines.includes(o.lines[1]) && v.lines.includes(o.lines[0]) && v.lines.includes(o.lines[1]), JSON.stringify(o)); }
  // an independent brute force of the cheapest change
  let best = null;
  for (const t of ST) { if (t === a || t === b) continue; for (const la of a.lines) for (const lb of b.lines) if (la !== lb && t.lines.includes(la) && t.lines.includes(lb)) { const c = K.metres(a, t) + K.metres(t, b); if (!best || c < best.c) best = { c, via: t.name, lines: [la, lb] }; } }
  assert.equal(pb[0].via, best.via); assert.deepEqual(pb[0].lines, best.lines);
  assert.match(R.routeWords('Pigalle', 'Bastille', pb), new RegExp(`^Pigalle → Bastille \\(line ${pb[0].lines[0]}, then ${pb[0].lines[1]} at ${pb[0].via}\\)$`));
  assert.equal(R.routeWords('Opéra', 'Bastille', [{ lines: ['8'] }]), 'Opéra → Bastille (line 8)');
  // nothing in common anywhere (two changes): the lines at both ends; unknown names: none
  const list = [{ name: 'A', lat: 48.85, lon: 2.3, lines: ['1'] }, { name: 'B', lat: 48.86, lon: 2.31, lines: ['2'] }, { name: 'C', lat: 48.87, lon: 2.32, lines: ['3'] }];
  assert.deepEqual(R.routeLines('A', 'C', null, list), [{ lines: ['1', '3'], via: null }]);
  assert.deepEqual(R.routeLines('Nowhere', 'Bastille'), []); assert.deepEqual(R.routeLines('Bastille', 'Bastille'), []);
  // a whole trip: leavesoon-core's stations → the lines on it
  const t = trip('Opéra', 'Bastille');
  assert.equal(t.mode, 'metro'); assert.deepEqual(t.lines, [{ lines: ['8'], via: null }]); assert.ok(t.walkIn >= 1 && t.walkOut >= 1);
});

test('the night: a Métro trip that would board after the last train becomes a walk, Noctilien / taxi, or the last one', () => {
  const far = trip('Pigalle', 'Nation'), close = trip('République', 'Bastille');
  assert.equal(far.mode, 'metro'); assert.equal(close.mode, 'metro');
  // daytime: unchanged
  assert.deepEqual(R.night(far, at(2026, 10, 27, 20, 0)), far);
  // Tue 27 Oct 01:30 (a Monday night: closed since about 00:40) — far: Noctilien / taxi — check, leaving earlier than by Métro
  const n = R.night(far, at(2026, 10, 27, 1, 30));
  assert.equal(n.mode, 'night'); assert.match(n.text, /^Noctilien \/ taxi — check \(about \d+ min\)$/); assert.match(n.how, /Métro is closed then \(last about 00:40, back about 05:30\)/);
  assert.ok(n.min > far.min, 'the night bus takes longer'); assert.equal(n.min, Math.min(Math.ceil(far.m * 1.2 / 75), Math.ceil(far.m * 1.4 / 300) + 15));
  assert.deepEqual(n.lines, [], 'no Métro lines to check then'); assert.equal(n.night.closed, true);
  const metroPlan = K.plan({ targetAt: at(2026, 10, 27, 1, 30), travel: far }, at(2026, 10, 26, 20)), nightPlan = K.plan({ targetAt: at(2026, 10, 27, 1, 30), travel: n }, at(2026, 10, 26, 20));
  assert.ok(nightPlan.leaveAt < metroPlan.leaveAt, 'the reminder time adjusts'); assert.equal(nightPlan.notifyAt, nightPlan.leaveAt - 10 * MIN);
  // close (≤ 40 min on foot): walk, and it says why
  const w = R.night(close, at(2026, 10, 27, 2, 0));
  assert.equal(w.mode, 'walk'); assert.match(w.text, /^about \d+ min walk \(Métro closed\)$/); assert.match(w.how, /^on foot: the Métro is closed then/);
  // before 05:30: still closed (a 05:40 arrival would board at ~05:20)
  assert.equal(R.night(far, at(2026, 10, 27, 5, 40)).mode, 'night');
  assert.equal(R.night(far, at(2026, 10, 27, 6, 30)).mode, 'metro', 'boards after 05:30: the Métro');
  // just after the last train: leaving a bit earlier still catches it ("the last one"), when that's later than the night bus
  const target = at(2026, 10, 27, 1, 10), plain = K.plan({ targetAt: target, travel: far }, at(2026, 10, 26, 20));
  assert.ok(R.metroAt(plain.leaveAt + far.walkIn * MIN).open === false, 'the plain plan boards too late');
  const l = R.night(far, target);
  assert.equal(l.mode, 'metro'); assert.match(l.text, /, the last one \(about 00:40\)$/); assert.match(l.how, /catch the last Métro \(about 00:40\)/);
  const lp = K.plan({ targetAt: target, travel: l }, at(2026, 10, 26, 20));
  assert.ok(lp.leaveAt + (far.walkIn + 2) * MIN <= at(2026, 10, 27, 0, 40), `boards before 00:40 (leaves ${hm(lp.leaveAt)})`);
  // a Friday night: the same 00:55 is fine (last about 01:40), and close to the last train it says so
  assert.equal(R.night(far, at(2026, 10, 31, 1, 10)).text, far.text);
  const fri = R.night(far, at(2026, 10, 31, 1, 50));
  assert.equal(fri.mode, 'metro'); assert.match(fri.how, /last Métro about 01:40/);
  // walking trips aren't touched
  const walk = K.travel(near('Opéra'), near('Madeleine')); assert.equal(walk.mode, 'walk'); assert.deepEqual(R.night(walk, at(2026, 10, 27, 2, 0)), walk);
});

test('line names and the feeds\' shapes (PRIM "Perturbations", the community API) → one status', () => {
  for (const [v, want] of [['9', '9'], ['M9', '9'], ['Métro 14', '14'], ['3B', '3bis'], ['3 bis', '3bis'], ['7b', '7bis'], ['line:IDFM:C01379', '9'], ['RER A', null], ['15', null], ['', null]]) assert.equal(R.lineName(v), want, v);
  assert.equal(R.primTime('20261026T053000'), at(2026, 10, 26, 5, 30)); assert.equal(R.primTime('20260715T120000'), at(2026, 7, 15, 12, 0)); assert.ok(Number.isNaN(R.primTime('soon')));
  const p = R.parsePrim(FAKE.prim('disrupted', 9), 1);
  assert.equal(p.state, 'ok'); assert.equal(p.provider, 'prim'); assert.equal(p.lines['9'][0].level, 'disrupted'); assert.equal(p.lines['9'][0].title, 'Métro 9 : trafic perturbé');
  assert.equal(p.lines['2'][0].level, 'info', 'planned works are information'); assert.ok(!p.lines['8']); assert.ok(p.known.includes('8'));
  assert.equal(R.parsePrim(FAKE.prim('blocked', 4)).lines['4'][0].level, 'blocked');
  assert.throws(() => R.parsePrim({ error: 'x' })); assert.throws(() => R.parseCommunity({ result: {} }));
  const c = R.parseCommunity(FAKE.community('disrupted', 9));
  assert.equal(c.lines['9'][0].level, 'disrupted'); assert.ok(c.known.includes('3bis') && c.known.includes('14')); assert.ok(!c.lines['1']);
  assert.equal(R.plain('<p>Ligne 9 : <b>colis</b>&nbsp;suspect</p>'), 'Ligne 9 : colis suspect');
});

test('the verdict: "Line 8: OK", "⚠ Line 9: disrupted — leave 10 min earlier?", another line, unknown', () => {
  const ok = R.parsePrim(FAKE.prim('normal'));
  const one = [{ lines: ['9'] }], from = at(2026, 10, 27, 19), to = at(2026, 10, 27, 19, 30);
  assert.equal(R.verdict(one, ok, from, to).words, 'Line 9: OK');
  const bad = R.parsePrim(FAKE.prim('disrupted', 9));
  const v = R.verdict(one, bad, Date.now(), Date.now() + 30 * MIN);
  assert.deepEqual([v.state, v.line, v.earlier, v.words], ['disrupted', '9', 10, '⚠ Line 9: disrupted — leave 10 min earlier?']);
  const b = R.verdict([{ lines: ['8', '9'] }], R.parsePrim(FAKE.prim('blocked', 9)), Date.now(), Date.now() + 30 * MIN);
  assert.deepEqual([b.state, b.earlier, b.words], ['blocked', 15, '⚠ Line 9: interrupted — leave 15 min earlier?']);
  // a disruption that's over (or not yet) by the time of the trip doesn't count
  const later = { state: 'ok', known: R.METRO, lines: { 9: [{ level: 'disrupted', title: 'x', from: at(2026, 10, 28, 6), to: at(2026, 10, 28, 9) }] } };
  assert.equal(R.verdict(one, later, from, to).state, 'ok'); assert.equal(R.verdict(one, later, at(2026, 10, 28, 8), at(2026, 10, 28, 8, 30)).state, 'disrupted');
  // two shared lines, the first disrupted: take the other
  const alt = R.verdict([{ lines: ['9'] }, { lines: ['8'] }], bad, Date.now(), Date.now() + 30 * MIN);
  assert.equal(alt.state, 'ok'); assert.equal(alt.words, 'Line 9: disrupted — take line 8 instead');
  // works (information) don't warn
  assert.equal(R.verdict([{ lines: ['2'] }], bad, Date.now(), Date.now() + MIN).state, 'ok');
  // unknown: offline / no key / a line the feed doesn't list; a walk: nothing to say
  assert.deepEqual(R.verdict(one, { state: 'unknown', why: 'nokey' }), { state: 'unknown', why: 'nokey', words: 'Line status unknown' });
  assert.equal(R.verdict(one, { state: 'ok', known: ['1'], lines: {} }).state, 'unknown');
  assert.equal(R.verdict([], ok), null);
  assert.match(R.whyText('nokey'), /Add your free PRIM key in Settings/);
});

test('when the one check is due: ~30 min before the soonest Métro reminder rings; once; never for a walk', () => {
  const now = at(2026, 10, 27, 12);
  const it = (o) => ({ key: 'show:a', state: 'on', notifyAt: at(2026, 10, 27, 19, 50), leaveAt: at(2026, 10, 27, 20), travel: { mode: 'metro', lines: [{ lines: ['9'] }] }, ...o });
  assert.deepEqual(R.nextCheck([it()], now), { key: 'show:a', at: at(2026, 10, 27, 19, 20) });
  assert.deepEqual(R.nextCheck([it(), it({ key: 'show:b', notifyAt: at(2026, 10, 27, 15) })], now), { key: 'show:b', at: at(2026, 10, 27, 14, 30) });
  assert.equal(R.nextCheck([it({ checkedAt: at(2026, 10, 27, 19, 20) })], now), null, 'checked: not again');
  assert.equal(R.nextCheck([it({ travel: { mode: 'walk' } })], now), null); assert.equal(R.nextCheck([it({ travel: { mode: 'night', lines: [] } })], now), null);
  assert.equal(R.nextCheck([it({ state: 'fired' })], now), null);
  assert.deepEqual(R.nextCheck([it()], at(2026, 10, 27, 19, 30)), { key: 'show:a', at: at(2026, 10, 27, 19, 30) }, 'set inside the window: now');
});

test('a reminder keeps its night trip, its lines and its status; Leave earlier moves it once; the words', () => {
  const travel = R.night(trip('Pigalle', 'Nation'), at(2026, 10, 27, 1, 30));
  const base = { key: 'show:n1', kind: 'show', title: 'Late Set', place: { name: 'Le Trabendo', lat: 48.893, lon: 2.39 }, targetAt: at(2026, 10, 27, 1, 30), words: 'starts at 01:30', travel, from: 'Home', origin: 'home:1' };
  const it = K.check({ ...base, ...K.plan(base, at(2026, 10, 26, 20)) });
  assert.equal(it.travel.mode, 'night'); assert.equal(it.travel.night.closed, true); assert.equal(it.travel.text, travel.text);
  assert.equal(K.notice(it, it.notifyAt).title, `Leave in 10 min for Late Set — ${travel.text}`);
  assert.match(K.notice(it, it.notifyAt).body, /Métro is closed then/);
  const m = trip('Opéra', 'Bastille');
  const mb = { ...base, key: 'show:m1', targetAt: at(2026, 10, 27, 20), words: 'starts at 20:00', travel: m };
  const s = K.empty(); const put = K.put(s, { ...mb, ...K.plan(mb, at(2026, 10, 27, 12)) }, at(2026, 10, 27, 12));
  assert.deepEqual(put.travel.lines, [{ lines: ['8'], via: null }]);
  put.status = K.check({ ...put, status: { state: 'disrupted', line: '8', earlier: 10, words: '⚠ Line 8: disrupted — leave 10 min earlier?', at: 5, title: 'Métro 8 : trafic perturbé' } }).status;
  assert.equal(K.validate(JSON.parse(JSON.stringify(s))).items[0].status.words, '⚠ Line 8: disrupted — leave 10 min earlier?', 'kept on disk');
  assert.match(K.notice(put, put.notifyAt).body, /^⚠ Line 8: disrupted · Leave at/);
  const before = { leave: put.leaveAt, notify: put.notifyAt };
  K.earlier(s, put.key, at(2026, 10, 27, 12));
  assert.equal(put.leaveAt, before.leave - 10 * MIN); assert.equal(put.notifyAt, before.notify - 10 * MIN); assert.equal(put.earlierBy, 10);
  K.earlier(s, put.key, at(2026, 10, 27, 12)); assert.equal(put.leaveAt, before.leave - 10 * MIN, 'once');
  assert.match(K.notice(put, put.notifyAt).body, /^⚠ line 8: leaving 10 min earlier/);
  // inside the last 10 minutes: rings at once
  const s2 = K.empty(); const p2 = K.put(s2, { ...mb, ...K.plan(mb, at(2026, 10, 27, 12)) }, at(2026, 10, 27, 12)); p2.status = { state: 'blocked', earlier: 15, line: '8', words: 'x', at: 1 };
  const nowLate = p2.notifyAt - 3 * MIN; K.earlier(s2, p2.key, nowLate);
  assert.equal(p2.earlierBy, 15); assert.equal(p2.notifyAt, nowLate + 2000);
  // a new plan (turned on again, Home moved) clears the old status
  assert.equal(K.put(s, { ...mb, ...K.plan(mb, at(2026, 10, 27, 12)), status: put.status, earlierBy: 10 }, at(2026, 10, 27, 12)).status, undefined);
});

test('the fetch (dev/fake-ratp.js): no key → the community API; a key → PRIM, only in its header; cached; offline → unknown', async () => {
  const fake = await FAKE.start();
  try {
    let clock = 1e12, key = null;
    const f = RM.create({ base: fake.base, fetch, getKey: () => key, now: () => clock, offline: false });
    let r = await f.status();
    assert.equal(r.state, 'ok'); assert.equal(r.provider, 'community'); assert.equal(fake.log.length, 1);
    await f.status(); assert.equal(fake.log.length, 1, 'cached (one fetch serves every reminder)');
    clock += 11 * MIN; await f.status(); assert.equal(fake.log.length, 2, 'after 10 min: fetched again');
    key = 'good-test-key-123456'; f.forget();
    r = await f.status(); assert.equal(r.provider, 'prim'); const last = fake.log[fake.log.length - 1]; assert.equal(last.provider, 'prim'); assert.equal(last.keyed, true);
    await fetch(`${fake.base}/__mode?prim=disrupted&line=9`);
    r = await f.status({ fresh: true }); assert.equal(r.lines['9'][0].level, 'disrupted');
    // a refused key: the community API still answers
    key = 'bad-key-1234567890'; f.forget(); r = await f.status(); assert.equal(r.provider, 'community');
    // everything down: unknown, and why
    await fetch(`${fake.base}/__mode?community=down&prim=down`);
    key = null; f.forget(); r = await f.status(); assert.deepEqual([r.state, r.why], ['unknown', 'nokey']);
    key = 'good-test-key-123456'; f.forget(); r = await f.status(); assert.deepEqual([r.state, r.why], ['unknown', 'offline']);
    key = 'bad-key-1234567890'; f.forget(); r = await f.status(); assert.deepEqual([r.state, r.why], ['unknown', 'badkey']);
    const n = fake.log.length; await f.status(); assert.equal(fake.log.length, n, 'unknown is cached too (2 min): no hammering');
    // nothing personal: no query string, no body, only GETs with the usual headers; the key never appears in the log
    for (const l of fake.log) { assert.equal(l.query, ''); assert.equal(l.method, 'GET'); assert.ok(l.headers.every((h) => ['accept', 'accept-encoding', 'accept-language', 'sec-fetch-mode', 'user-agent'].includes(h)), JSON.stringify(l.headers)); }
    assert.ok(!JSON.stringify(fake.log).includes('good-test') && !JSON.stringify(f._log).includes('good-test'));
    // a smoke run with no fake source fetches nothing at all
    const before = fake.log.length;
    const t = RM.create({ base: null, fetch: () => { throw Error('no network in checks'); }, getKey: () => null, offline: true });
    assert.deepEqual([(await t.status()).state, (await t.status()).why], ['unknown', 'test']); assert.equal(fake.log.length, before);
    // a real network error (unreachable): unknown, quickly
    const dead = RM.create({ base: 'http://127.0.0.1:9', fetch, getKey: () => null, offline: false, timeout: 2000 });
    assert.equal((await dead.status()).state, 'unknown');
  } finally { await fake.close(); }
});

test('the main side: the check rides the ONE timer ~30 min before; warns once; Leave earlier; offline never holds the reminder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratp69-'));
  let clock = at(2026, 10, 27, 12); const timers = []; const events = []; let answer = { state: 'ok', known: R.METRO, lines: {}, at: clock }; let asked = 0;
  const fake = { now: () => clock, emit: (ch, ev) => events.push([ch, ev]), setTimer: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; }, clearTimer: (t) => { t.live = false; }, ratp: { status: async () => { asked++; return answer; }, hasKey: () => false } };
  const live = () => timers.filter((t) => t.live);
  const api = M.create({ dataDir: dir, ...fake });
  const tr = trip('Opéra', 'Bastille');
  const base = { key: 'show:r69', kind: 'show', title: 'Arlo Parks', place: { name: 'Café de la Danse', lat: 48.8535, lon: 2.3722 }, targetAt: at(2026, 10, 27, 20), words: 'starts at 20:00', travel: tr, from: 'Home', origin: 'home:1' };
  const it = { ...(await api.op({ op: 'put', item: { ...base, ...K.plan(base, clock) } })) }; // a copy: the store's object moves on
  assert.equal(live().length, 1, 'one timer'); assert.equal(live()[0].ms, it.notifyAt - 30 * MIN - clock, 'first: the status check, 30 min before it rings');
  assert.equal(asked, 0, 'nothing fetched on turning it on');
  // the check: a disruption on line 8 → status on the reminder, ONE warning, the timer back to the ring
  answer = { state: 'ok', known: R.METRO, lines: { 8: [{ level: 'disrupted', title: 'Métro 8 : trafic perturbé', from: -Infinity, to: Infinity }] }, at: clock };
  clock = it.notifyAt - 30 * MIN; let t = live()[0]; t.live = false; t.fn();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(asked, 1);
  let cur = (await api.op({ op: 'list' })).items[0];
  assert.equal(cur.status.words, '⚠ Line 8: disrupted — leave 10 min earlier?'); assert.equal(cur.checkedAt, clock);
  const warns = events.filter(([ch]) => ch === 'leave:warn');
  assert.equal(warns.length, 1); assert.equal(warns[0][1].title, '⚠ Line 8: disrupted — leave 10 min earlier?'); assert.match(warns[0][1].body, new RegExp(`^For Arlo Parks: leave at ${K.hm(it.leaveAt - 10 * MIN)} instead of ${K.hm(it.leaveAt)}`));
  assert.equal(live().length, 1); assert.equal(live()[0].ms, it.notifyAt - clock, 'then: the ring');
  // opening the tracker: the status again (cached by the feed), no second warning
  await api.op({ op: 'status' }); assert.equal(events.filter(([ch]) => ch === 'leave:warn').length, 1);
  // Leave earlier (the notification's / the row's button): 10 min earlier, the timer follows
  cur = await api.op({ op: 'earlier', key: it.key });
  assert.equal(cur.leaveAt, it.leaveAt - 10 * MIN); assert.equal(cur.notifyAt, it.notifyAt - 10 * MIN); assert.equal(live().length, 1); assert.equal(live()[0].ms, cur.notifyAt - clock);
  // it rings with the status in its words
  clock = cur.notifyAt; t = live()[0]; t.live = false; t.fn();
  const due = events.filter(([ch]) => ch === 'leave:due'); assert.equal(due.length, 1); assert.match(due[0][1].body, /^⚠ line 8: leaving 10 min earlier · Leave at /);
  assert.equal(asked, 2, 'no polling: two asks in all (the check, the tracker)');
  // offline: the check says "unknown", no warning, and the reminder still rings on time
  events.length = 0; answer = { state: 'unknown', why: 'offline', at: clock };
  const b2 = { ...base, key: 'show:r69b', targetAt: at(2026, 10, 27, 23) };
  const i2 = await api.op({ op: 'put', item: { ...b2, ...K.plan(b2, clock) } });
  clock = i2.notifyAt - 30 * MIN; t = live()[0]; assert.equal(t.ms, i2.notifyAt - 30 * MIN - cur.notifyAt); t.live = false; t.fn();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await api.op({ op: 'list' })).items.find((x) => x.key === i2.key).status.state, 'unknown'); assert.equal(events.filter(([ch]) => ch === 'leave:warn').length, 0);
  assert.equal(live().length, 1); assert.equal(live()[0].ms, i2.notifyAt - clock, 'no retry loop: next is the ring');
  clock = i2.notifyAt; t = live()[0]; t.live = false; t.fn();
  assert.equal(events.filter(([ch]) => ch === 'leave:due').length, 1, 'rang anyway');
  // a walking / night trip: no check at all
  const b3 = { ...base, key: 'show:r69c', targetAt: at(2026, 10, 28, 1, 30), travel: R.night(trip('Pigalle', 'Nation'), at(2026, 10, 28, 1, 30)) };
  const n0 = asked; const i3 = await api.op({ op: 'put', item: { ...b3, ...K.plan(b3, clock) } });
  assert.equal(live()[0].ms, i3.notifyAt - clock, 'the night bus: straight to the ring'); assert.equal(asked, n0);
  await new Promise((r) => setTimeout(r, 50));
  fs.rmSync(dir, { recursive: true, force: true });
});

(async () => {
  for (const [name, fn] of tests) { await fn(); checks++; console.log('✓ ' + name); }
  console.log(`\n${checks} checks passed (ratp69)`);
})().catch((err) => { console.error(err); process.exit(1); });
