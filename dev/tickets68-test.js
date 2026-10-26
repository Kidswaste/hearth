// (round 68, tickets68) 🎟 My ticket: the pure rules (tickets-core.js) and the main side's file work (ticketsmain.js) on a
// throwaway data folder. What a ticket file can be; the show's night in Paris time (concert, a 1 am club start, a
// date-only listing, both summer-time changes, a computer in another zone); the index (damaged → refused, never empty;
// duplicates; the cap; removal); a file name → a show (artist, title, venue + date, a date that says another day, two shows
// tied → nothing, an old file, a dismissed file, a show that has its ticket); then the main side: a COPY under the show
// (the owner's file unchanged, still where it was), the same file twice, a dropped picture by its bytes, list, Downloads
// (names only: nothing moved, nothing opened), dismiss, a Wallet pass's words and QR code, remove → the trash folder (tests),
// and an unreadable index never written over.
//   node dev/tickets68-test.js   (also: TZ=America/Los_Angeles node dev/tickets68-test.js)
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../tickets-core');
const P = require('../showprep-core');
let checks = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const H = 3600e3, DAY = 24 * H;
const at = (y, m, d, h = 0, mi = 0) => P.paris.utc(y, m, d, h, mi); // Paris wall clock → ms
const show = (o = {}) => ({ key: 'machine2611', title: 'Ben UFO all night', start: at(2026, 11, 14, 23, 30), venue: { name: 'La Machine du Moulin Rouge', address: '90 Bd de Clichy' }, lineup: ['Ben UFO'], ...o });

// ---------- what a ticket file can be ----------
test('kinds: PDF, images, Wallet pass; HEIC and others refused with a plain reason', () => {
  assert.equal(T.kindOf('ticket.PDF'), 'pdf'); assert.equal(T.kindOf('Screenshot 2026-11-14 at 18.02.11.png'), 'image'); assert.equal(T.kindOf('IMG_1234.JPG'), 'image');
  assert.equal(T.kindOf('event.pkpass'), 'pkpass'); assert.equal(T.kindOf('notes.txt'), null); assert.equal(T.kindOf('noext'), null);
  assert.match(T.refuse('IMG_1.HEIC', 1000), /HEIC/); assert.match(T.refuse('a.docx', 1000), /PDF, an image/);
  assert.match(T.refuse('a.pdf', 0), /empty/); assert.match(T.refuse('a.pdf', 26 * 1024 * 1024), /25 MB/); assert.equal(T.refuse('a.pdf', 2048), '');
});
test('the copy\'s name: readable, safe on the Mac and Windows, keeps the extension', () => {
  assert.equal(T.fileName('abc123', 'Billet – Ben UFO @ La Machine (1).PDF'), 'abc123-billet-ben-ufo-la-machine-1.pdf');
  assert.equal(T.fileName('abc123', '../../etc/passwd.png'), 'abc123-etc-passwd.png');
  assert.equal(T.fileName('abc123', '🎟.png'), 'abc123-ticket.png');
});

// ---------- the show's night (Paris time) ----------
test('a concert: before the day, its day (morning → end + 2 h), after', () => {
  const s = show({ start: at(2026, 11, 14, 20, 0) }); // Saturday 20:00 → a concert (ends ~23:00)
  assert.equal(T.phase(s, at(2026, 11, 13, 22)), 'before');
  assert.equal(T.phase(s, at(2026, 11, 14, 7)), 'day');
  assert.equal(T.phase(s, at(2026, 11, 14, 19, 30)), 'day');
  assert.equal(T.phase(s, at(2026, 11, 15, 0, 30)), 'day'); // still the same night, < end + 2 h
  assert.equal(T.phase(s, at(2026, 11, 15, 1, 30)), 'after'); // past 23:00 + 2 h
  assert.equal(T.phase(s, at(2026, 11, 16, 12)), 'after');
});
test('a club night starting at 1 am counts as the night before', () => {
  const s = show({ start: at(2026, 11, 15, 1, 0) }); // Sunday 01:00 = Saturday night
  assert.equal(T.phase(s, at(2026, 11, 14, 9)), 'day'); // Saturday morning: ticket ready
  assert.equal(T.phase(s, at(2026, 11, 14, 5)), 'before'); // Saturday 5 am = still Friday's night
  assert.equal(T.phase(s, at(2026, 11, 15, 4)), 'day');
  assert.equal(T.phase(s, at(2026, 11, 15, 6, 30)), 'after'); // the night is over
});
test('a club night 23:30 → its end time is honoured (6 h by default, the listing\'s end when given)', () => {
  const s = show();
  assert.equal(T.phase(s, at(2026, 11, 15, 5)), 'day');
  assert.equal(T.phase(show({ end: at(2026, 11, 15, 2) }), at(2026, 11, 15, 4, 30)), 'after'); // ended 2 am + 2 h
});
test('a date-only listing: its whole Paris day', () => {
  const s = show({ start: at(2026, 11, 14, 12), dateOnly: true });
  assert.equal(T.phase(s, at(2026, 11, 13, 23, 59)), 'before'); assert.equal(T.phase(s, at(2026, 11, 14, 0, 5)), 'day');
  assert.equal(T.phase(s, at(2026, 11, 14, 23, 50)), 'day'); assert.equal(T.phase(s, at(2026, 11, 15, 0, 10)), 'after');
});
test('across the summer-time changes (the October and March nights)', () => {
  const oct = show({ start: at(2026, 10, 24, 23, 0) }); // the night clocks go back (25 Oct 03:00 → 02:00)
  assert.equal(T.phase(oct, at(2026, 10, 25, 2, 30)), 'day'); assert.equal(T.phase(oct, at(2026, 10, 25, 7)), 'after');
  const mar = show({ start: at(2027, 3, 27, 23, 0) }); // the night clocks go forward
  assert.equal(T.phase(mar, at(2027, 3, 28, 3, 30)), 'day'); assert.equal(T.phase(mar, at(2027, 3, 27, 8)), 'day'); assert.equal(T.phase(mar, at(2027, 3, 26, 22)), 'before');
});
test('a show with no date never says "after"', () => { assert.equal(T.phase({ start: NaN }, Date.now()), 'before'); });

// ---------- the index ----------
const file = (o = {}) => ({ id: 'aaaaaa01', name: 'billet.pdf', file: 'aaaaaa01-billet.pdf', kind: 'pdf', bytes: 1000, sha: 'a'.repeat(64), addedAt: '2026-11-01T10:00:00.000Z', ...o });
test('a damaged index is refused (thrown), never read as empty', () => {
  for (const bad of [null, [], { v: 2, shows: {} }, { v: 1 }, { v: 1, shows: [] }, { v: 1, shows: { 'BAD KEY': { files: [] } } }, { v: 1, shows: { machine2611: { show: show(), files: [{ id: 'x', file: '../a.pdf' }] } } }])
    assert.throws(() => T.validate(bad), /damaged/);
  const ok = T.validate({ v: 1, shows: { machine2611: { show: show(), files: [file()] } }, dismissed: ['a|1|2'] });
  assert.equal(ok.shows.machine2611.files[0].kind, 'pdf'); assert.deepEqual(ok.dismissed, ['a|1|2']);
});
test('add: the same file twice is one ticket; up to 6 per show; remove empties the show', () => {
  const ix = T.empty();
  assert.equal(T.addFile(ix, show(), file()).dup, false);
  assert.equal(T.addFile(ix, show(), file({ id: 'aaaaaa02', file: 'aaaaaa02-billet.pdf' })).dup, true);
  for (let i = 3; i <= 7; i++) T.addFile(ix, show(), file({ id: `aaaaaa0${i}`, file: `aaaaaa0${i}-x.pdf`, sha: String(i).repeat(64) }));
  assert.equal(ix.shows.machine2611.files.length, 6);
  assert.throws(() => T.addFile(ix, show(), file({ id: 'aaaaaa09', file: 'aaaaaa09-x.pdf', sha: '9'.repeat(64) })), /up to 6/);
  for (const f of [...ix.shows.machine2611.files]) assert.ok(T.removeFile(ix, 'machine2611', f.id));
  assert.equal(ix.shows.machine2611, undefined); assert.equal(T.removeFile(ix, 'machine2611', 'aaaaaa01'), null);
  assert.throws(() => T.addFile(ix, { key: 'x', title: '', start: 1 }, file()), /can’t hold a ticket/);
});
test('summary / ready: per show, its phase; only today\'s are "ready"', () => {
  const ix = T.empty();
  T.addFile(ix, show(), file());
  T.addFile(ix, show({ key: 'cigale1508', title: 'Arlo Parks', start: at(2026, 11, 20, 20) }), file({ id: 'bbbbbb01', file: 'bbbbbb01-a.png', kind: 'image', sha: 'b'.repeat(64) }));
  const now = at(2026, 11, 14, 15);
  assert.deepEqual(T.summary(ix, now).map((t) => [t.key, t.phase]), [['machine2611', 'day'], ['cigale1508', 'before']]);
  assert.deepEqual(T.ready(ix, now).map((t) => t.key), ['machine2611']);
  assert.deepEqual(T.ready(ix, at(2026, 11, 16, 12)).map((t) => t.key), []);
});

// ---------- a file name → a show ----------
const NOW = at(2026, 11, 10, 12);
const arlo = show({ key: 'cigale1508', title: 'Arlo Parks — My Soft Machine Tour', start: at(2026, 11, 20, 20), venue: { name: 'La Cigale' }, lineup: ['Arlo Parks'] });
const ufo = show();
const petit = show({ key: 'petitbain01', title: 'Hard Feelings', start: at(2026, 11, 21, 23), venue: { name: 'Petit Bain' }, lineup: ['DJ Seinfeld', 'Roza Terenzi'] });
const shows = [arlo, ufo, petit];
const best = (name) => { const r = T.suggest([{ name, path: `/dl/${name}`, size: 50000, mtime: NOW - DAY }], shows, { now: NOW }); return r[0]?.key || null; };
test('dates in names: 2026-11-14 · 20261114 · 14-11-2026 · 14.11.26 · 14 nov · nov 14 · 14novembre', () => {
  for (const n of ['x 2026-11-14.pdf', 'x_20261114.pdf', 'x 14-11-2026.pdf', 'x 14.11.26.pdf', 'x 14 nov.pdf', 'x Nov 14.pdf', 'x 14novembre.pdf', 'x 14th-november.pdf'])
    assert.ok(T.datesIn(n).some((d) => d.m === 11 && d.d === 14), n);
  assert.deepEqual(T.datesIn('IMG_1234.png'), []); assert.deepEqual(T.datesIn('order-98765432.pdf'), []);
});
test('an artist in the name → that show', () => {
  assert.equal(best('arlo-parks-e-ticket.pdf'), 'cigale1508');
  assert.equal(best('Billet_ARLO_PARKS_La_Cigale.pdf'), 'cigale1508');
  assert.equal(best('Ben UFO - Shotgun ticket.pdf'), 'machine2611');
  assert.equal(best('DICE_ticket_dj-seinfeld.png'), 'petitbain01');
});
test('the title\'s words → that show; the venue alone needs its date', () => {
  assert.equal(best('hard-feelings-tickets.pdf'), 'petitbain01');
  assert.equal(best('shotgun-la-machine-du-moulin-rouge-2026-11-14.pdf'), 'machine2611');
  assert.equal(best('la-cigale.pdf'), null); // a venue alone: not enough
  assert.equal(best('la-cigale-20-nov.pdf'), 'cigale1508');
});
test('a date that says another day → never that show', () => {
  assert.equal(best('arlo-parks-2026-12-02.pdf'), null);
  assert.equal(best('ben-ufo-ticket-15-11-2026.pdf'), 'machine2611'); // a 23:30 club night runs into the 15th: that date is its too
  assert.equal(best('ben-ufo-ticket-16-11-2026.pdf'), null);
});
test('a show known only by its title (a show quest keeps no lineup): its named parts count', () => {
  const rinse = show({ key: 'rinse00001', title: 'Rinse Paris: Sherelle + Nia Archives', start: at(2026, 11, 13, 23), venue: { name: 'La Machine du Moulin Rouge' }, lineup: [] });
  assert.equal(T.suggest([{ name: 'Sherelle ticket.pdf', path: '/dl/s.pdf', size: 1, mtime: NOW }], [rinse], { now: NOW })[0]?.key, 'rinse00001');
  assert.equal(T.suggest([{ name: 'nia-archives-dice.pdf', path: '/dl/n.pdf', size: 1, mtime: NOW }], [rinse], { now: NOW })[0]?.key, 'rinse00001');
  assert.equal(T.suggest([{ name: 'archives 2025.pdf', path: '/dl/a.pdf', size: 1, mtime: NOW }], [rinse], { now: NOW }).length, 0);
});
test('generic names never match; two shows tied → nothing (no guess)', () => {
  for (const n of ['ticket.pdf', 'IMG_4432.PNG', 'Screenshot 2026-11-09 at 10.00.00.png', 'order-123456.pdf', 'billet.pdf', 'e-ticket (1).pdf']) assert.equal(best(n), null, n);
  const twin = [show({ key: 'twin00001', title: 'Arlo Parks', start: at(2026, 11, 20, 20) }), show({ key: 'twin00002', title: 'Arlo Parks', start: at(2026, 11, 22, 20) })];
  assert.equal(T.suggest([{ name: 'arlo parks ticket.pdf', path: '/dl/a.pdf', size: 1, mtime: NOW }], twin, { now: NOW }).length, 0);
  assert.equal(T.suggest([{ name: 'arlo parks 22 nov.pdf', path: '/dl/a.pdf', size: 1, mtime: NOW }], twin, { now: NOW })[0].key, 'twin00002'); // the date settles it
});
test('not offered: an old file, a dismissed file, a show with its ticket, a past show, a non-ticket file', () => {
  const f = (o) => [{ name: 'arlo-parks-ticket.pdf', path: '/dl/a.pdf', size: 900, mtime: NOW - DAY, ...o }];
  assert.equal(T.suggest(f(), shows, { now: NOW }).length, 1);
  assert.equal(T.suggest(f({ mtime: NOW - 200 * DAY }), shows, { now: NOW }).length, 0);
  assert.equal(T.suggest(f(), shows, { now: NOW, dismissed: [T.sigOf(f()[0])] }).length, 0);
  assert.equal(T.suggest(f(), shows, { now: NOW, has: (k) => k === 'cigale1508' }).length, 0);
  assert.equal(T.suggest(f(), shows, { now: at(2026, 11, 22, 12) }).length, 0);
  assert.equal(T.suggest(f({ name: 'arlo-parks.docx' }), shows, { now: NOW }).length, 0);
  assert.equal(T.suggest(f({ name: 'arlo-parks.heic' }), shows, { now: NOW }).length, 0);
});
test('one file per show: the best-named (then the newest) wins', () => {
  const r = T.suggest([{ name: 'arlo parks.pdf', path: '/a', size: 1, mtime: NOW - 3 * DAY }, { name: 'arlo-parks-la-cigale-20-11-2026-ticket.pdf', path: '/b', size: 1, mtime: NOW - 5 * DAY }], shows, { now: NOW });
  assert.equal(r.length, 1); assert.equal(r[0].path, '/b');
});

// ---------- the main side on a throwaway data folder ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tickets68-'));
process.env.HEARTH_TEST_SAVE_DIR = path.join(tmp, 'saves');
const M = require('../ticketsmain');
const data = path.join(tmp, 'data'), dl = path.join(tmp, 'Downloads'), own = path.join(tmp, 'owner');
for (const d of [data, dl, own]) fs.mkdirSync(d, { recursive: true });
M._test.setDataDir(data); M._test.setDownloads(dl);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const later = [];
const atest = (name, fn) => later.push([name, fn]);
const near = { ...arlo, start: Date.now() + 2 * DAY };
atest('add: a copy under the show; the owner\'s file unchanged and still where it was', async () => {
  const src = path.join(own, 'Arlo Parks billet.pdf'); fs.writeFileSync(src, PDF); const before = fs.statSync(src).mtimeMs;
  const r = await M.op({ op: 'add', show: near, path: src, from: 'pick' });
  assert.equal(r.dup, false); assert.equal(r.entry.kind, 'pdf');
  const copy = path.join(data, 'tickets', 'cigale1508', fs.readdirSync(path.join(data, 'tickets', 'cigale1508'))[0]);
  assert.deepEqual(fs.readFileSync(copy), PDF); assert.ok(fs.existsSync(src)); assert.deepEqual(fs.readFileSync(src), PDF); assert.equal(fs.statSync(src).mtimeMs, before);
  assert.ok(r.entry.url.startsWith('file://'));
  const idx = JSON.parse(fs.readFileSync(path.join(data, 'tickets', 'index.json'), 'utf8')); assert.equal(idx.shows.cigale1508.files[0].name, 'Arlo Parks billet.pdf');
});
atest('the same file again → one ticket; a picture by its bytes (dropped from a browser)', async () => {
  const src = path.join(own, 'copy of it.pdf'); fs.writeFileSync(src, PDF);
  assert.equal((await M.op({ op: 'add', show: near, path: src })).dup, true);
  const r = await M.op({ op: 'add', show: near, data: PNG.toString('base64'), name: 'screenshot.png', from: 'drop' });
  assert.equal(r.dup, false); assert.equal(r.list.find((t) => t.key === 'cigale1508').files.length, 2);
  await assert.rejects(M.op({ op: 'add', show: near, data: PNG.toString('base64'), name: 'x.heic' }), /HEIC/);
  await assert.rejects(M.op({ op: 'add', show: near, path: path.join(own, 'gone.pdf') }), /can’t be found/);
});
atest('list: per show, its phase and files (with file:// URLs that exist)', async () => {
  const { list, problem } = await M.op({ op: 'list' });
  assert.equal(problem, ''); assert.equal(list[0].key, 'cigale1508'); assert.equal(list[0].phase, 'before'); assert.ok(list[0].files.every((f) => f.here));
});
atest('Downloads: a file named like the show is suggested; names only, nothing moved or changed', async () => {
  const f = path.join(dl, 'ben-ufo-shotgun-ticket.pdf'); fs.writeFileSync(f, PDF); fs.writeFileSync(path.join(dl, 'holiday.png'), PNG);
  const s = { ...ufo, start: Date.now() + DAY };
  const { suggest } = await M.op({ op: 'suggest', shows: [s] });
  assert.equal(suggest.length, 1); assert.equal(suggest[0].name, 'ben-ufo-shotgun-ticket.pdf'); assert.equal(suggest[0].key, 'machine2611');
  assert.deepEqual(fs.readdirSync(dl).sort(), ['ben-ufo-shotgun-ticket.pdf', 'holiday.png']);
  const hud = await M.op({ op: 'hud', shows: [s] });
  assert.deepEqual(hud.keys, ['cigale1508']); assert.equal(hud.suggest[0].key, 'machine2611'); assert.deepEqual(hud.ready, []);
  await M.op({ op: 'dismiss', sig: suggest[0].sig });
  M._test.setDownloads(dl); // (the 20 s listing cache)
  assert.equal((await M.op({ op: 'suggest', shows: [s] })).suggest.length, 0);
});
atest('on the show\'s day: "ready"', async () => {
  const today = { ...ufo, key: 'todayshow1', title: 'Tonight', start: Date.now() + 2 * H };
  if (T.phase(today) !== 'day') return; // (a run in the small hours: tonight's show is "tomorrow's night")
  await M.op({ op: 'add', show: today, data: PNG.toString('base64'), name: 'tonight.png' });
  assert.ok((await M.op({ op: 'hud', shows: [] })).ready.some((t) => t.key === 'todayshow1'));
  const { list } = await M.op({ op: 'list' }); await M.op({ op: 'remove', key: 'todayshow1', id: list.find((t) => t.key === 'todayshow1').files[0].id });
});
atest('a Wallet pass: its words and its QR code', async () => {
  const pd = path.join(tmp, 'pass'); fs.mkdirSync(pd);
  fs.writeFileSync(path.join(pd, 'pass.json'), JSON.stringify({ formatVersion: 1, description: 'Arlo Parks', organizationName: 'DICE', eventTicket: { primaryFields: [{ key: 'e', label: 'EVENT', value: 'Arlo Parks' }], secondaryFields: [{ key: 'd', label: 'DOORS', value: '19:00' }] }, barcodes: [{ format: 'PKBarcodeFormatQR', message: 'DICE-1234-5678', messageEncoding: 'iso-8859-1' }] }));
  const zip = path.join(own, 'arlo.pkpass'); await require('../zipkit').writeZip(pd, zip);
  const r = await M.op({ op: 'add', show: near, path: zip });
  const p = await M.op({ op: 'pass', key: 'cigale1508', id: r.entry.id });
  assert.equal(p.title, 'Arlo Parks'); assert.equal(p.org, 'DICE'); assert.deepEqual(p.fields.map((f) => f.value), ['Arlo Parks', '19:00']);
  assert.equal(p.code.format, 'QR'); assert.match(p.svg, /^<svg/);
});
atest('remove: to the trash folder (tests; the Trash / Recycle Bin for real), the list follows', async () => {
  const { list } = await M.op({ op: 'list' }); const t = list.find((x) => x.key === 'cigale1508'); const n = t.files.length;
  const r = await M.op({ op: 'remove', key: 'cigale1508', id: t.files[0].id });
  assert.ok(r.where && fs.existsSync(r.where)); assert.equal(r.list.find((x) => x.key === 'cigale1508').files.length, n - 1);
  await assert.rejects(M.op({ op: 'remove', key: 'cigale1508', id: t.files[0].id }), /isn’t in Hearth/);
});
atest('an unreadable index is never written over (add / remove / dismiss refused, the files kept)', async () => {
  const ix = path.join(data, 'tickets', 'index.json'); fs.writeFileSync(ix, '{"v":1,"shows":{"cigale1508":'); try { fs.rmSync(ix + '.prev'); } catch { /* none */ }
  for (const f of fs.readdirSync(path.dirname(ix))) if (/^index\.json\.(prev|bak|tmp)/.test(f)) fs.rmSync(path.join(path.dirname(ix), f));
  const r = await M.op({ op: 'list' }); assert.match(r.problem, /could not be read/);
  await assert.rejects(M.op({ op: 'add', show: near, data: PNG.toString('base64'), name: 'x.png' }), /could not be read/);
  await assert.rejects(M.op({ op: 'dismiss', sig: 'a|1|2' }), /could not be read/);
  assert.equal(fs.readFileSync(ix, 'utf8'), '{"v":1,"shows":{"cigale1508":');
  assert.ok(fs.readdirSync(path.join(data, 'tickets', 'cigale1508')).length >= 1);
});

(async () => {
  for (const [name, fn] of tests) { fn(); checks++; console.log('✓ ' + name); }
  for (const [name, fn] of later) { await fn(); checks++; console.log('✓ ' + name); }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`tickets68: ${checks} checks passed`);
})().catch((err) => { console.error(err); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
