#!/usr/bin/env node
// (round 62, showprep62) The show night companion without a window: calendar files in Paris time (summer / winter time,
// a night across the October change), Google Calendar links, the nearest Métro stations, one link per artist, what can
// be followed, the day's reminder (when, quiet hours, off by default, missed, once), the "Shows I went to" log (entries,
// merge of two copies, stats), the main side's single timer (showprepmain.js), and showsync's doors / artist links.
//   node dev/showprep-test.js → { pass, checks, errors }
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../showprep-core');
const Main = require('../showprepmain');
const SC = require('../showsync-core');
const F = require('./showsync-fixtures');

const errors = []; const checks = {};
const ok = (name, cond, detail) => { checks[name] = !!cond; if (!cond) errors.push(`${name}${detail ? ': ' + JSON.stringify(detail).slice(0, 500) : ''}`); };
const U = P.paris.utc;
const show = (o = {}) => ({ key: 'a1b2c3d4e5f6', title: 'Machine Club: Ben UFO, Call Super', start: U(2026, 10, 24, 23, 30), end: U(2026, 10, 25, 6, 0), doors: U(2026, 10, 24, 23, 0),
  venue: { key: 'machine moulin rouge', name: 'La Machine du Moulin Rouge', address: '90 Boulevard de Clichy, 75018 Paris', lat: 48.8841, lon: 2.3322, url: 'https://shotgun.live/en/venues/la-machine-du-moulin-rouge' },
  lineup: ['Ben UFO', 'Call Super'], links: { 'Ben UFO': { page: 'https://shotgun.live/en/artists/ben-ufo', listen: '' }, 'Call Super': { page: '', listen: 'https://soundcloud.com/callsuper' } },
  tickets: [{ platform: 'shotgun', url: 'https://shotgun.live/en/events/machine-club-ben-ufo' }], platforms: ['shotgun'], ...o });
const line = (txt, re) => txt.split('\r\n').find((l) => re.test(l)) || '';
const unfold = (txt) => txt.replace(/\r\n /g, '');

(async () => {
  // ---------- Paris time ----------
  ok('paris: summer time is UTC+2', new Date(U(2026, 7, 14, 20, 0)).toISOString() === '2026-07-14T18:00:00.000Z');
  ok('paris: winter time is UTC+1', new Date(U(2026, 1, 10, 20, 0)).toISOString() === '2026-01-10T19:00:00.000Z');
  ok('paris: the October change (25 Oct 2026, 03:00 → 02:00)', P.paris.offset(Date.parse('2026-10-25T00:59:00Z')) === 120 && P.paris.offset(Date.parse('2026-10-25T01:00:00Z')) === 60);
  ok('paris: the March change (29 Mar 2026, 02:00 → 03:00)', P.paris.offset(Date.parse('2026-03-29T00:59:00Z')) === 60 && P.paris.offset(Date.parse('2026-03-29T01:00:00Z')) === 120 && new Date(U(2026, 3, 29, 2, 30)).toISOString() === '2026-03-29T01:30:00.000Z');
  ok('paris: parts round-trip', (() => { const t = P.paris.parts(U(2027, 3, 28, 4, 15)); return t.y === 2027 && t.m === 3 && t.d === 28 && t.h === 4 && t.mi === 15; })());
  ok('paris: a 1 am start belongs to the night before', (() => { const n = P.nightOf(U(2026, 10, 25, 1, 0)); return n.d === 24 && n.m === 10; })());

  // ---------- the calendar file ----------
  const s = show(), ics = P.ics(s, { now: Date.parse('2026-10-18T10:00:00Z') });
  ok('ics: a calendar with its Paris time zone', /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/.test(ics) && /BEGIN:VTIMEZONE\r\nTZID:Europe\/Paris/.test(ics) && /RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU/.test(ics) && /RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU/.test(ics) && ics.endsWith('END:VCALENDAR\r\n'));
  ok('ics: start / end in Paris wall time across the October change', line(ics, /^DTSTART;/) === 'DTSTART;TZID=Europe/Paris:20261024T233000' && line(ics, /^DTEND;/) === 'DTEND;TZID=Europe/Paris:20261025T060000', [line(ics, /^DTSTART;/), line(ics, /^DTEND;/)]);
  ok('ics: stable UID, UTC stamp, escaped text', line(ics, /^UID:/) === 'UID:show-a1b2c3d4e5f6@hearth' && line(ics, /^DTSTAMP:/) === 'DTSTAMP:20261018T100000Z' && line(ics, /^SUMMARY:/) === 'SUMMARY:Machine Club: Ben UFO\\, Call Super' && /^LOCATION:La Machine du Moulin Rouge\\, 90 Boulevard/.test(line(ics, /^LOCATION:/)));
  ok('ics: lines folded at 75 octets (UTF-8)', ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75) && /Métro: Blanche \(2\) 1 min walk/.test(unfold(ics)) && /Doors 23:00\\, starts 23:30/.test(unfold(ics)));
  const summer = P.ics(show({ start: U(2026, 7, 3, 20, 0), end: null, doors: null }));
  ok('ics: a summer concert without an end runs 3 h', line(summer, /^DTSTART;/) === 'DTSTART;TZID=Europe/Paris:20260703T200000' && line(summer, /^DTEND;/) === 'DTEND;TZID=Europe/Paris:20260703T230000');
  const winter = P.ics(show({ start: U(2027, 1, 15, 23, 0), end: null }));
  ok('ics: a winter club night without an end runs 6 h', line(winter, /^DTEND;/) === 'DTEND;TZID=Europe/Paris:20270116T050000');
  ok('ics: file name', P.fileName(s) === 'machine-club-ben-ufo-call-super.ics', P.fileName(s));
  let threw = false; try { P.ics({ key: 'x', title: 'x' }); } catch { threw = true; } ok('ics: no date → refused', threw);
  const g = new URL(P.googleLink(s));
  ok('google: a TEMPLATE link in UTC with the Paris zone', g.hostname === 'calendar.google.com' && g.searchParams.get('action') === 'TEMPLATE' && g.searchParams.get('dates') === '20261024T213000Z/20261025T050000Z' && g.searchParams.get('ctz') === 'Europe/Paris' && /Moulin Rouge/.test(g.searchParams.get('location')), g.href);

  // ---------- getting there ----------
  const near = P.nearest(48.8841, 2.3322);
  ok('stations: Machine du Moulin Rouge → Blanche first', near[0]?.name === 'Blanche' && near[0].lines.includes('2') && near.length === 3 && near[0].walk <= 2, near);
  const bata = P.nearest(48.8631, 2.3708, 2).map((x) => x.name);
  ok('stations: Bataclan → Oberkampf / Saint-Ambroise', bata.includes('Oberkampf') || bata.includes('Saint-Ambroise'), bata);
  ok('stations: Trabendo → Porte de Pantin', P.nearest(48.8890, 2.3933, 1)[0]?.name === 'Porte de Pantin');
  ok('stations: nothing past 1.5 km / no coordinates', P.nearest(48.95, 2.55).length === 0 && P.nearest(null, null).length === 0);
  ok('stations: every station inside the Paris map', P.STATIONS.length >= 80 && P.STATIONS.every((x) => SC.inParis(x.lat, x.lon) && x.lines.length));
  const rl = P.routeLinks(s.venue), cm = new URL(rl.citymapper);
  ok('routes: Citymapper to the venue + RATP planner', cm.hostname === 'citymapper.com' && cm.searchParams.get('endcoord') === '48.8841,2.3322' && cm.searchParams.get('endname') === 'La Machine du Moulin Rouge' && rl.ratp === 'https://www.ratp.fr/itineraires');

  // ---------- the lineup, follows ----------
  ok('listen: the listing\'s listening page first', P.listen('Call Super', s.links).url === 'https://soundcloud.com/callsuper' && P.listen('Call Super', s.links).kind === 'listen');
  ok('listen: else the artist page', P.listen('ben ufo', s.links).url === 'https://shotgun.live/en/artists/ben-ufo' && P.listen('Ben UFO', s.links).kind === 'page');
  ok('listen: else a search (no scraping)', P.listen('Nia Archives', {}).kind === 'search' && /youtube\.com\/results\?search_query=Nia%20Archives/.test(P.listen('Nia Archives', {}).url));
  const fol = P.followable(s);
  ok('follow: the venue page + an artist page', fol.length === 2 && fol[0].kind === 'venue' && fol[1].name === 'Ben UFO' && SC.sourceFromUrl(fol[0].url)?.kind === 'venue' && SC.sourceFromUrl(fol[1].url)?.kind === 'artist', fol);
  ok('follow: nothing to follow without platform pages', P.followable(show({ venue: { name: 'X' }, links: {} })).length === 0);

  // ---------- the reminder ----------
  ok('reminder: a 23:30 club night → 20:00 that day (Paris)', new Date(P.reminderAt(s)).toISOString() === new Date(U(2026, 10, 24, 20, 0)).toISOString());
  ok('reminder: a 20:00 concert → 17:00', P.reminderAt(show({ start: U(2026, 11, 5, 20, 0) })) === U(2026, 11, 5, 17, 0));
  ok('reminder: a 1 am start → 20:00 the evening before', P.reminderAt(show({ start: U(2026, 11, 7, 1, 0) })) === U(2026, 11, 6, 20, 0));
  ok('reminder: a noon matinee → 10:00, never in the quiet hours', P.reminderAt(show({ start: U(2026, 11, 8, 12, 0) })) === U(2026, 11, 8, 10, 0));
  const now0 = U(2026, 10, 20, 12, 0);
  ok('reminder: off by default → none', P.nextReminder({ prep: { [s.key]: { show: s, remind: false } } }, now0) === null && P.nextReminder(P.empty(), now0) === null);
  const nx = P.nextReminder({ prep: { [s.key]: { show: s, remind: true } } }, now0);
  ok('reminder: on → the day, with its words', nx?.at === U(2026, 10, 24, 20, 0) && /Ben UFO & Call Super/.test(nx.title) && /Doors 23:00 · starts 23:30 · La Machine du Moulin Rouge · Métro Blanche/.test(nx.body), nx);
  ok('reminder: once (fired → none)', P.nextReminder({ prep: { [s.key]: { show: s, remind: true } } }, now0, { [s.key]: '2026-10-24T18:00:00Z' }) === null);
  const missed = P.nextReminder({ prep: { [s.key]: { show: s, remind: true } } }, U(2026, 10, 24, 21, 0));
  ok('reminder: missed (Hearth was closed) → soon, if the show is still ahead', missed && missed.at - U(2026, 10, 24, 21, 0) === 30e3);
  ok('reminder: missed but in the quiet hours or too late → none', P.nextReminder({ prep: { [s.key]: { show: s, remind: true } } }, U(2026, 10, 24, 23, 0)) === null && P.nextReminder({ prep: { k: { show: show({ start: U(2026, 10, 25, 1, 30), key: 'k1k2k3k4k5k6' }), remind: true } } }, U(2026, 10, 24, 23, 10)) === null);
  ok('reminder: the earliest of several', P.nextReminder({ prep: { [s.key]: { show: s, remind: true }, bbbbbbbbbbbb: { show: show({ key: 'bbbbbbbbbbbb', start: U(2026, 10, 22, 20, 0) }), remind: true } } }, now0)?.key === 'bbbbbbbbbbbb');

  // ---------- the log ----------
  const e1 = P.entry({ show: s, rating: 5, moment: '  The last track at 5 am  ', at: '2026-10-25T06:00:00Z', updatedAt: '2026-10-25T06:00:00Z' });
  ok('log: an entry', e1.id === 'went-a1b2c3d4e5f6' && e1.moment === 'The last track at 5 am' && e1.rating === 5 && e1.show.venue.lat === 48.8841 && e1.photo === null);
  let bad = 0; for (const x of [{ show: s, moment: '' }, { show: s, moment: 'x', rating: 6 }, { show: s, moment: 'x', rating: 2.5 }, { show: { ...s, key: 'NOPE' }, moment: 'x' }]) { try { P.entry(x); } catch { bad++; } }
  ok('log: refuses an empty moment, a bad rating, a bad key', bad === 4);
  ok('log: a photo must be a local path', P.entry({ show: s, moment: 'x', photo: { path: 'https://evil/x.jpg' } }).photo === null && P.entry({ show: s, moment: 'x', photo: { path: '/tmp/a.jpg', jpg: '/tmp/b.jpg' } }).photo.jpg === '/tmp/b.jpg');
  let vbad = 0; for (const x of [null, { v: 2, went: [] }, { v: 1, went: 'x' }, { v: 1, went: [e1, e1] }]) { try { P.validate(x); } catch { vbad++; } }
  ok('log: validate refuses damaged logs', vbad === 4);
  const s2 = show({ key: 'b2b2b2b2b2b2', title: 'Arlo Parks', start: U(2026, 10, 22, 20, 0), end: null, doors: null, venue: { key: 'cigale', name: 'La Cigale', address: '120 Boulevard de Rochechouart', lat: 48.8823, lon: 2.3405 }, lineup: ['Arlo Parks'], links: {} });
  const e2 = P.entry({ show: s2, rating: 4, moment: 'Softly singing along', updatedAt: '2026-10-22T23:00:00Z' });
  const A = { v: 1, went: [e1], prep: { [s.key]: { show: s, remind: true, at: '2026-10-20T10:00:00Z' } } };
  const B = { v: 1, went: [e2, { ...e1, moment: 'An edit from the other computer', updatedAt: '2026-10-26T09:00:00Z' }], prep: { [s.key]: { show: s, remind: false, at: '2026-10-19T10:00:00Z' } } };
  const M = P.merge(A, B, U(2026, 10, 24, 12, 0));
  ok('merge: union of both copies, newest first', M.went.length === 2 && M.went[0].key === s.key && M.went[1].key === s2.key);
  ok('merge: per entry, the newer edit wins', M.went[0].moment === 'An edit from the other computer');
  ok('merge: per prepared show, the newer choice wins', M.prep[s.key].remind === true);
  ok('merge: order of the copies doesn\'t matter', JSON.stringify(P.merge(B, A, U(2026, 10, 24, 12, 0))) === JSON.stringify(M));
  ok('merge: a removal is an edit too', P.merge(M, { v: 1, went: [{ ...M.went[1], removedAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' }], prep: {} }).went.find((e) => e.key === s2.key)?.removedAt);
  ok('merge: prepared shows over two days old leave', Object.keys(P.merge(A, null, U(2026, 10, 30, 12, 0)).prep).length === 0);
  const e3 = P.entry({ show: show({ key: 'c3c3c3c3c3c3', title: 'Machine Club: Ben UFO', lineup: ['Ben UFO'], start: U(2026, 11, 14, 23, 30) }), rating: 3, moment: 'Again' });
  const st = P.stats({ v: 1, went: [e1, e2, e3], prep: {} });
  ok('stats: count, venues visited (with visits), artists seen, average', st.count === 3 && st.venues.length === 2 && st.venues[0].name === 'La Machine du Moulin Rouge' && st.venues[0].n === 2 && st.artists[0].name === 'Ben UFO' && st.artists[0].n === 2 && st.rating === 4, st);
  ok('stats: removed entries don\'t count', P.stats({ went: [{ ...e2, removedAt: 'x' }] }).count === 0);

  // ---------- showsync's listing: doors + artist links (round 62 additions) ----------
  const page = F.fillDates(fs.readFileSync(path.join(F.DIR, 'shotgun-paris.html'), 'utf8'));
  const ufo = SC.parsePage(page, SC.sourceFromUrl('https://shotgun.live/en/concerts/paris')).shows.find((x) => /Ben UFO/.test(x.title));
  ok('listing: doors + artist page + listening page', ufo && ufo.doors === ufo.start - 30 * 60e3 && ufo.links['Ben UFO']?.page === 'https://shotgun.live/en/artists/ben-ufo' && ufo.links['Call Super']?.listen === 'https://soundcloud.com/callsuper', ufo && { doors: ufo.doors, start: ufo.start, links: ufo.links });
  const merged = SC.merge([[ufo], [{ ...ufo, platform: 'dice', id: 'dice:x', url: 'https://dice.fm/event/x', links: { 'Ben UFO': { page: 'https://dice.fm/artist/ben-ufo', listen: 'https://open.spotify.com/artist/1' } } }]]);
  ok('listing: links merged across platforms', merged.length === 1 && /^https:\/\/(shotgun\.live|dice\.fm)\//.test(merged[0].links['Ben UFO'].page) && merged[0].links['Ben UFO'].listen === 'https://open.spotify.com/artist/1' && merged[0].links['Call Super'].listen === 'https://soundcloud.com/callsuper', merged[0]?.links);
  ok('listing: kept shows survive P.keep', (() => { const k = P.keep(merged[0]); return k.links['Call Super'].listen && k.doors === ufo.doors && k.venue.url === 'https://shotgun.live/en/venues/la-machine-du-moulin-rouge'; })());

  // ---------- the main side: one timer, only while a reminder is on ----------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'showprep-'));
  fs.mkdirSync(path.join(dir, 'kv'), { recursive: true });
  let clock = now0; const timers = []; const sent = [];
  const fake = { now: () => clock, setTimer: (fn, ms) => { const t = { fn, ms, on: true }; timers.push(t); return t; }, clearTimer: (t) => { t.on = false; }, emit: (ch, ev) => sent.push({ ch, ev }) };
  const m1 = Main.create({ dataDir: dir, ...fake });
  ok('main: no log → no timer', m1.arm().armed === false && timers.length === 0);
  fs.writeFileSync(path.join(dir, 'kv', 'show-nights.json'), JSON.stringify({ v: 1, went: [], prep: { [s.key]: { show: s, remind: false, at: '2026-10-20T10:00:00Z' } } }));
  ok('main: a prepared show without a reminder → no timer', m1.arm().armed === false && timers.filter((t) => t.on).length === 0);
  fs.writeFileSync(path.join(dir, 'kv', 'show-nights.json'), JSON.stringify({ v: 1, went: [], prep: { [s.key]: { show: s, remind: true, at: '2026-10-20T10:00:00Z' } } }));
  const armed = m1.arm();
  ok('main: reminder on → ONE timer, to the minute', armed.armed && armed.next.key === s.key && timers.filter((t) => t.on).length === 1 && timers.at(-1).ms === U(2026, 10, 24, 20, 0) - now0, { armed, ms: timers.at(-1)?.ms });
  clock = U(2026, 10, 24, 20, 0); timers.at(-1).on = false; timers.at(-1).fn();
  await new Promise((r) => setTimeout(r, 50));
  ok('main: it tells the window once', sent.length === 1 && sent[0].ch === 'shows:remind' && sent[0].ev.key === s.key && /tonight/.test(sent[0].ev.title), sent);
  const firedFile = path.join(dir, 'showsync', 'reminded.json');
  ok('main: what went is kept (atomic file), nothing re-armed', fs.existsSync(firedFile) && JSON.parse(fs.readFileSync(firedFile, 'utf8'))[s.key] && !fs.readdirSync(path.dirname(firedFile)).some((f) => /\.tmp/.test(f)) && timers.filter((t) => t.on).length === 0);
  const m2 = Main.create({ dataDir: dir, ...fake });
  ok('main: after a restart it doesn\'t come again', m2.arm().armed === false);
  fs.writeFileSync(path.join(dir, 'kv', 'show-nights.json'), '{"v":1,"went":[');
  const before = fs.readFileSync(path.join(dir, 'kv', 'show-nights.json'), 'utf8');
  ok('main: a damaged log → no timer, never rewritten', Main.create({ dataDir: dir, ...fake }).arm().armed === false && fs.readFileSync(path.join(dir, 'kv', 'show-nights.json'), 'utf8') === before);
  fs.rmSync(dir, { recursive: true, force: true });

  const pass = !errors.length;
  console.log(JSON.stringify({ pass, checks: Object.keys(checks).length, failed: errors.length, errors }, null, 1));
  process.exit(pass ? 0 : 1);
})().catch((err) => { console.log(JSON.stringify({ pass: false, errors: [String(err.stack || err)] })); process.exit(1); });
