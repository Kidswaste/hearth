// (round 69, photos69) Photos in My Paris: unit tests for tools/parisphotos-core.js and parisphotosmain.js on photos made
// here the way phones write them (JPEG APP1 EXIF, HEIC's Exif item, PNG eXIf): EXIF date / offset / GPS / orientation,
// the wall clock → a real moment (the photo's own offset, its GPS clock, else the time zone: Paris summer / winter, the
// hour that happens twice, the hour that doesn't exist), suggestions by time window and distance (with the time zone
// deciding a borderline photo), the copies' sizes and names, GPS stripped from a copy unless kept, the kept list, the
// card's photos, and the main side (writes only its own names, scans a folder read-only, Trash only for its copies).
//   node dev/photos69-test.js
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const K = require('../tools/parisphotos-core');
let checks = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// a tiny JPEG: SOI, (APP1), a SOF0 that says w × h, SOS, EOI (enough for EXIF and the size; not a picture)
function jpeg({ w = 4032, h = 3024, exif = null } = {}) {
  const sof = [0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...(exif ? K.makeExif(exif) : []), 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, ...sof, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 1, 2, 3, 0xff, 0xd9]);
}
// a HEIC's first bytes: ftyp heic, a meta box, then (as iPhones do) the Exif item: 4-byte offset, "Exif\0\0", TIFF
function heic(exif) {
  const app1 = K.makeExif(exif), tiffAndHeader = app1.subarray(4); // "Exif\0\0" + TIFF
  const ftyp = [0, 0, 0, 24, ...Buffer.from('ftypheic'), 0, 0, 0, 0, ...Buffer.from('mif1heic')];
  return new Uint8Array([...ftyp, 0, 0, 0, 40, ...Buffer.from('meta'), ...new Array(32).fill(7), 0, 0, 0, 6, ...tiffAndHeader, ...new Array(64).fill(1)]);
}
function png(exif) {
  const tiffOnly = K.makeExif(exif).subarray(10), u32 = (n) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), ...Buffer.from('IHDR'), ...u32(1200), ...u32(800), 8, 6, 0, 0, 0, 0, 0, 0, 0,
    ...u32(tiffOnly.length), ...Buffer.from('eXIf'), ...tiffOnly, 0, 0, 0, 0, ...u32(0), ...Buffer.from('IDAT'), 0, 0, 0, 0]);
}
const Z = 'Europe/Paris';
const iso = (t) => new Date(t).toISOString();

test('EXIF from a JPEG: date, its own offset, GPS (N/E and S/W), orientation, the size', () => {
  const x = K.readExif(jpeg({ exif: { date: '2026:10:24 21:40:05', offset: '+02:00', gps: { lat: 48.882222, lon: 2.340444 }, gpsTime: '2026-10-24T19:40:05Z', orientation: 6, make: 'Apple' } }));
  assert.equal(x.kind, 'jpeg'); assert.equal(x.date, '2026:10:24 21:40:05'); assert.equal(x.offset, '+02:00'); assert.equal(x.orientation, 6); assert.equal(x.make, 'Apple');
  assert.ok(Math.abs(x.gps.lat - 48.882222) < 1e-5 && Math.abs(x.gps.lon - 2.340444) < 1e-5, JSON.stringify(x.gps));
  assert.equal(x.gpsTime, '2026-10-24T19:40:05Z'); assert.equal(x.w, 4032); assert.equal(x.h, 3024);
  const sw = K.readExif(jpeg({ exif: { date: '2026:01:02 10:00:00', gps: { lat: -33.8568, lon: -151.2153 } } }));
  assert.ok(sw.gps.lat < -33.85 && sw.gps.lon < -151.2, 'south / west are negative');
  const none = K.readExif(jpeg());
  assert.equal(none.date, ''); assert.equal(none.gps, null); assert.equal(none.orientation, 1);
  assert.equal(K.readExif(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])), null, 'not a photo');
  assert.equal(K.readExif(jpeg({ exif: { date: 'x', gps: { lat: 0, lon: 0 } } })).gps, null, 'a 0,0 GPS fix is no fix');
  // cut short / damaged: no throw
  const full = jpeg({ exif: { date: '2026:10:24 21:40:05', gps: { lat: 48.88, lon: 2.34 } } });
  for (const n of [3, 20, 40, 80]) assert.doesNotThrow(() => K.readExif(full.subarray(0, n)));
});

test('EXIF from a HEIC (iPhone) and a PNG; kinds by their bytes, not their names', () => {
  const h = K.readExif(heic({ date: '2026:07:14 23:05:00', offset: '+02:00', gps: { lat: 48.8583, lon: 2.2945 }, orientation: 6 }));
  assert.equal(h.kind, 'heic'); assert.equal(h.date, '2026:07:14 23:05:00'); assert.equal(h.orientation, 6); assert.ok(Math.abs(h.gps.lat - 48.8583) < 1e-5);
  const p = K.readExif(png({ date: '2026:03:01 12:00:00' }));
  assert.equal(p.kind, 'png'); assert.equal(p.date, '2026:03:01 12:00:00'); assert.equal(p.w, 1200); assert.equal(p.h, 800);
  assert.ok(K.isPhotoName('IMG_0001.HEIC') && K.isPhotoName('a.jpeg') && K.isPhotoName('b.png') && !K.isPhotoName('c.mov') && !K.isPhotoName('d.txt'));
});

test('when it was taken: the photo\'s offset, else its GPS clock, else the time zone (Paris summer / winter, DST edges)', () => {
  // its own offset wins, wherever the computer is
  assert.equal(iso(K.takenAt({ date: '2026:10:24 21:40:00', offset: '+09:00' }, { zone: Z }).at), '2026-10-24T12:40:00.000Z');
  assert.equal(K.takenAt({ date: '2026:10:24 21:40:00', offset: '+09:00' }, { zone: Z }).from, 'offset');
  // the GPS clock (UTC): taken in New York at 18:00 local (no offset written), the computer in Paris
  const g = K.takenAt({ date: '2026:06:10 18:00:00', gpsTime: '2026-06-10T22:00:00Z' }, { zone: Z });
  assert.equal(g.from, 'gps'); assert.equal(iso(g.at), '2026-06-10T22:00:00.000Z');
  // a GPS clock that disagrees by more than 14 h is a stale fix: the zone is used
  assert.equal(K.takenAt({ date: '2026:06:10 18:00:00', gpsTime: '2026-06-09T01:00:00Z' }, { zone: Z }).from, 'zone');
  // the zone: Paris is UTC+2 in summer, UTC+1 in winter
  assert.equal(iso(K.takenAt({ date: '2026:07:14 23:05:00' }, { zone: Z }).at), '2026-07-14T21:05:00.000Z');
  assert.equal(iso(K.takenAt({ date: '2026:12:31 23:30:00' }, { zone: Z }).at), '2026-12-31T22:30:00.000Z');
  assert.equal(iso(K.takenAt({ date: '2026:12:31 23:30:00' }, { zone: 'UTC' }).at), '2026-12-31T23:30:00.000Z');
  assert.equal(iso(K.takenAt({ date: '2026:12:31 23:30:00' }, { zone: 'America/New_York' }).at), '2027-01-01T04:30:00.000Z');
  // 25 Oct 2026, 02:30 happens twice in Paris (03:00 CEST → 02:00 CET): the first one (summer time)
  assert.equal(iso(K.takenAt({ date: '2026:10:25 02:30:00' }, { zone: Z }).at), '2026-10-25T00:30:00.000Z');
  assert.equal(iso(K.takenAt({ date: '2026:10:25 03:30:00' }, { zone: Z }).at), '2026-10-25T02:30:00.000Z');
  // 29 Mar 2026, 02:30 doesn't exist in Paris (02:00 → 03:00): moved forward, like a clock (= 03:30 CEST)
  assert.equal(iso(K.takenAt({ date: '2026:03:29 02:30:00' }, { zone: Z }).at), '2026-03-29T01:30:00.000Z');
  assert.equal(K.zoneOffset(Z, Date.parse('2026-07-01T12:00:00Z')), 120); assert.equal(K.zoneOffset(Z, Date.parse('2026-01-01T12:00:00Z')), 60);
  // no date / nonsense: none
  for (const d of ['', '0000:00:00 00:00:00', '    :  :     :  :  ', '2026:13:01 10:00:00']) assert.equal(K.takenAt({ date: d }, { zone: Z }), null, d);
  // the local words and the day in the zone
  assert.equal(K.takenAt({ date: '2026:10:24 21:40:00' }, { zone: Z }).local, '2026-10-24 21:40');
  assert.equal(K.dayIn(Date.parse('2026-10-24T22:30:00Z'), Z), '2026-10-25', 'half past midnight in Paris is the next day');
  // a copy's own EXIF date / offset in the zone
  assert.equal(K.exifDate(Date.parse('2026-07-14T21:05:00Z'), Z), '2026:07:14 23:05:00'); assert.equal(K.offsetWords(120), '+02:00'); assert.equal(K.offsetWords(-300), '-05:00');
});

// ---------- matching ----------
const cigale = { id: 'v-cigale', name: 'La Cigale', lat: 48.8822, lon: 2.3404 };
const moments = [
  { id: 'show-1', kind: 'show', at: '2026-10-24T18:00:00.000Z', title: 'Fixture Band at La Cigale', place: cigale }, // 20:00 in Paris
  { id: 'place-c-pp-bataclan', kind: 'place', at: '2026-10-22T16:00:00.000Z', title: 'Le Bataclan', place: { id: 'pp-bataclan', name: 'Le Bataclan', lat: 48.8631, lon: 2.3708 } },
  { id: 'walk-c-walk-1', kind: 'walk', from: '2026-10-18T12:00:00.000Z', at: '2026-10-18T15:00:00.000Z', title: 'Walk: canal', place: { id: 'a', name: 'Betino’s', lat: 48.8652, lon: 2.3741 }, spots: [{ id: 'a', name: 'Betino’s', lat: 48.8652, lon: 2.3741 }, { id: 'c', name: 'Canal Saint-Martin', lat: 48.8718, lon: 2.3655 }], parts: ['stop-q-walk-1-1'] },
  { id: 'park-belleville', kind: 'park', at: '2026-10-11T12:00:00.000Z', until: '2026-10-11T13:30:00.000Z', title: 'Park session · Belleville', place: { id: 'park-belleville', name: 'Parc de Belleville', lat: 48.8716, lon: 2.3847 } },
  { id: 'music-1', kind: 'music', at: '2026-10-05T19:00:00.000Z', until: '2026-10-05T20:00:00.000Z', title: 'Music session · 60 min', place: { id: null, name: 'Sound desk', lat: null, lon: null } },
];
const photo = (path, exif, { zone = Z, mtime } = {}) => { const t = K.takenAt(exif, { zone }) || (mtime ? { at: mtime, from: 'file' } : null); return { path, name: path, at: t?.at, from: t?.from, gps: exif.gps || null }; };

test('suggestions: inside a moment\'s time window, near its place; far GPS never; no date set aside', () => {
  const ph = [
    photo('/p/show-near.jpg', { date: '2026:10:24 21:40:00', gps: { lat: 48.8829, lon: 2.3406 } }), // during the show, ~80 m from La Cigale
    photo('/p/show-nogps.jpg', { date: '2026:10:24 23:10:00' }), // during the show, no GPS: time alone (weaker)
    photo('/p/show-far.jpg', { date: '2026:10:24 22:00:00', gps: { lat: 48.8462, lon: 2.3371 } }), // show time but 4 km away (Luxembourg): never the show
    photo('/p/bataclan.jpg', { date: '2026:10:22 15:30:00', gps: { lat: 48.8632, lon: 2.3711 } }), // the 4 h before ticking it done (18:00 Paris)
    photo('/p/bataclan-morning.jpg', { date: '2026:10:22 09:00:00', gps: { lat: 48.8630, lon: 2.3705 } }), // same day, right there, outside the window: weaker
    photo('/p/walk.jpg', { date: '2026:10:18 15:10:00', gps: { lat: 48.8716, lon: 2.3652 } }), // during the walk, at its last stop
    photo('/p/park.jpg', { date: '2026:10:11 15:20:00' }), // during the park session (13:20 UTC)
    photo('/p/music.jpg', { date: '2026:10:05 21:30:00' }), // during the music session
    photo('/p/nothing.jpg', { date: '2026:09:01 10:00:00' }), // matches nothing
    photo('/p/nodate.png', {}), // no date, no file date
  ];
  const r = K.suggest(ph, moments, { zone: Z });
  const where = Object.fromEntries(r.groups.flatMap((g) => g.photos.map((p) => [p.path, g.moment])));
  assert.equal(where['/p/show-near.jpg'], 'show-1'); assert.equal(where['/p/show-nogps.jpg'], 'show-1');
  assert.equal(where['/p/show-far.jpg'], undefined, 'GPS 4 km from the venue: not the show');
  assert.equal(where['/p/bataclan.jpg'], 'place-c-pp-bataclan'); assert.equal(where['/p/bataclan-morning.jpg'], 'place-c-pp-bataclan');
  assert.equal(where['/p/walk.jpg'], 'walk-c-walk-1'); assert.equal(where['/p/park.jpg'], 'park-belleville'); assert.equal(where['/p/music.jpg'], 'music-1');
  assert.deepEqual(r.unmatched.sort(), ['/p/nothing.jpg', '/p/show-far.jpg']); assert.equal(r.noDate, 1); assert.equal(r.total, 10);
  const show = r.groups.find((g) => g.moment === 'show-1');
  const near = show.photos.find((p) => p.path === '/p/show-near.jpg'), nog = show.photos.find((p) => p.path === '/p/show-nogps.jpg');
  assert.ok(near.score > nog.score, 'close by beats no GPS'); assert.match(near.why, /taken 24 Oct · 21:40 · \d+ m from La Cigale/); assert.match(nog.why, /during the show/);
  const bat = r.groups.find((g) => g.moment === 'place-c-pp-bataclan').photos;
  assert.ok(bat.find((p) => p.path === '/p/bataclan.jpg').score > bat.find((p) => p.path === '/p/bataclan-morning.jpg').score);
  assert.ok(show.photos[0].at <= show.photos[1].at, 'in the order they were taken');
  assert.deepEqual(r.groups.map((g) => g.moment), ['show-1', 'place-c-pp-bataclan', 'walk-c-walk-1', 'park-belleville', 'music-1'], 'newest moments first');
});

test('the time zone decides a borderline photo: 18:30 on the camera is before doors in Paris, during the show in UTC', () => {
  const ex = { date: '2026:10:24 18:30:00' }; // the show starts 20:00 Paris = 18:00 UTC; its window opens 17:00 UTC
  assert.equal(K.suggest([photo('/p/a.jpg', ex, { zone: Z })], moments, { zone: Z }).groups.length, 0, 'Paris: 16:30 UTC, before the window');
  assert.equal(K.suggest([photo('/p/a.jpg', ex, { zone: 'UTC' })], moments, { zone: 'UTC' }).groups[0]?.moment, 'show-1', 'UTC: 18:30 UTC, in the window');
  // the same photo with its own offset is the same moment whatever the computer's zone
  const own = { date: '2026:10:24 21:30:00', offset: '+02:00' };
  for (const z of [Z, 'UTC', 'Asia/Tokyo']) assert.equal(K.suggest([photo('/p/b.jpg', own, { zone: z })], moments, { zone: z }).groups[0]?.moment, 'show-1', z);
  // a file date (no EXIF) counts, weaker
  const f = K.suggest([photo('/p/f.jpg', {}, { mtime: Date.parse('2026-10-24T20:00:00Z') })], moments, { zone: Z });
  assert.equal(f.groups[0].moment, 'show-1'); assert.match(f.groups[0].photos[0].why, /file date/); assert.ok(f.groups[0].photos[0].score < 0.7);
});

test('already added (same original) is left out; windows of each kind', () => {
  const kept = { v: 1, photos: [{ id: 'ph-20261024-aaaa', moment: 'show-1', file: 'paris-photos/2026-10/ph-20261024-aaaa.jpg', thumb: 'paris-photos/2026-10/ph-20261024-aaaa.thumb.jpg', source: '/p/show-near.jpg', hash: '' }] };
  const r = K.suggest([photo('/p/show-near.jpg', { date: '2026:10:24 21:40:00' })], moments, { zone: Z, kept });
  assert.equal(r.groups.length, 0); assert.equal(r.already, 1);
  const H = 3600e3, w = (m) => K.windowOf(m).map((t) => (t - Date.parse(m.at)) / H);
  assert.deepEqual(w(moments[0]), [-1, 7]); assert.deepEqual(w(moments[1]), [-4, 1]); assert.deepEqual(w(moments[2]), [-4, 1]); assert.deepEqual(w(moments[3]), [-1, 2.5]); assert.deepEqual(w(moments[4]), [-0.5, 1.5]);
  assert.equal(K.windowOf({ kind: 'show', at: 'nope' }), null);
});

test('the copies: sizes (long edge 2048, thumb 400, never bigger), names in data/paris-photos/<month>/', () => {
  assert.deepEqual(K.fit(4032, 3024, K.BIG), { w: 2048, h: 1536 }); assert.deepEqual(K.fit(3024, 4032, K.BIG), { w: 1536, h: 2048 });
  assert.deepEqual(K.fit(4032, 3024, K.THUMB), { w: 400, h: 300 }); assert.deepEqual(K.fit(800, 600, K.BIG), { w: 800, h: 600 }, 'small photos are not blown up');
  assert.deepEqual(K.fit(12000, 300, K.BIG), { w: 2048, h: 51 }); assert.deepEqual(K.fit(0, 0, K.BIG), { w: 1, h: 1 });
  assert.ok(K.turned(6) && K.turned(8) && !K.turned(1) && !K.turned(3), 'orientations 5–8 swap width and height');
  const id = K.newId(Date.parse('2026-10-24T19:40:00Z'), 'Ab3x9Q'), n = K.names(id, '2026-10');
  assert.equal(id, 'ph-20261024-ab3x9q'); assert.deepEqual(n, { file: 'paris-photos/2026-10/ph-20261024-ab3x9q.jpg', thumb: 'paris-photos/2026-10/ph-20261024-ab3x9q.thumb.jpg' });
  assert.ok(K.REL.test(n.file) && K.REL.test(n.thumb));
  for (const bad of ['../x', 'ph-..', 'PH-1234']) assert.throws(() => K.names(bad, '2026-10'));
  for (const bad of ['paris-photos/2026-10/../../config.json', '/etc/passwd', 'paris-photos/2026-10/ph-abcd.png', 'kv/paris-photos.json']) assert.ok(!K.REL.test(bad), bad);
});

test('GPS is taken out of the stored copy unless kept; the date stays', () => {
  const orig = jpeg({ exif: { date: '2026:10:24 21:40:05', offset: '+02:00', gps: { lat: 48.88, lon: 2.34 }, orientation: 6 } });
  const bare = K.withExif(orig);
  assert.equal(K.readExif(bare).gps, null); assert.equal(K.readExif(bare).date, ''); assert.equal(K.readExif(bare).w, 4032, 'the picture itself stays');
  const dated = K.withExif(orig, K.makeExif({ date: '2026:10:24 21:40:05', offset: '+02:00' }));
  assert.equal(K.readExif(dated).gps, null); assert.equal(K.readExif(dated).date, '2026:10:24 21:40:05'); assert.equal(K.readExif(dated).orientation, 1, 'the copy is already the right way up');
  const kept = K.withExif(orig, K.makeExif({ date: '2026:10:24 21:40:05', gps: { lat: 48.88, lon: 2.34 } }));
  assert.ok(Math.abs(K.readExif(kept).gps.lat - 48.88) < 1e-5, 'kept when the owner keeps it');
  assert.deepEqual(K.withExif(new Uint8Array([1, 2, 3])), new Uint8Array([1, 2, 3]), 'not a JPEG: left alone');
});

test('the kept list: validate, add (no double), remove, a walk\'s photos from its stops, the card\'s 4', () => {
  const rec = (id, moment, taken, hash = '') => ({ id, moment, file: `paris-photos/2026-10/${id}.jpg`, thumb: `paris-photos/2026-10/${id}.thumb.jpg`, w: 2048, h: 1536, taken, takenFrom: 'zone', name: 'x.jpg', source: '/p/x.jpg', hash, addedAt: '2026-10-25T10:00:00Z' });
  const h = (c) => c.repeat(64);
  let s = K.validate({ v: 1, photos: [rec('ph-aaaa', 'show-1', '2026-10-24T20:00:00Z', h('a')), { id: 'evil', moment: 'x', file: '../../etc', thumb: 'x' }, null] });
  assert.equal(s.photos.length, 1, 'bad rows dropped');
  let r = K.add(s, [rec('ph-bbbb', 'show-1', '2026-10-24T19:00:00Z', h('b')), rec('ph-cccc', 'show-1', null, h('a')), rec('ph-dddd', 'stop-q-walk-1-1', '2026-10-18T12:30:00Z', h('d'))]);
  assert.deepEqual(r.added.map((x) => x.id), ['ph-bbbb', 'ph-dddd'], 'the same photo twice on a moment is added once'); s = r.store;
  assert.deepEqual(K.keptFor(s, moments[0]).map((p) => p.id), ['ph-bbbb', 'ph-aaaa'], 'in the order they were taken');
  assert.deepEqual(K.keptFor(s, moments[2]).map((p) => p.id), ['ph-dddd'], 'a photo added to a stop shows on the finished walk');
  r = K.remove(s, ['ph-aaaa']); assert.deepEqual(r.gone.map((p) => p.id), ['ph-aaaa']); assert.equal(r.store.photos.length, 2);
  assert.deepEqual(K.validate(null), { v: 1, photos: [] });
  const ms = [{ photos: [{ thumb: '/a1' }, { thumb: '/a2' }, { thumb: '/a3' }], photo: '/own-a' }, { photos: [{ thumb: '/b1' }] }, { photo: '/own-c' }, { photos: [{ thumb: '/d1' }, { thumb: '/d2' }] }];
  assert.deepEqual(K.cardPhotos(ms), ['/a1', '/b1', '/own-c', '/d1'], 'one per moment first');
  assert.deepEqual(K.cardPhotos(ms.slice(0, 1)), ['/a1', '/a2', '/a3', '/own-a']); assert.deepEqual(K.cardPhotos([]), []);
});

test('main side: writes only its own JPEG copies; scans a folder read-only (nested, skips non-photos); Trash only its copies; HEIC says why', async () => {
  const M = require('../parisphotosmain');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'photos69-')), data = path.join(tmp, 'data'), shots = path.join(tmp, 'DCIM');
  try {
    const api = M.create({ dataDir: data, nativeImage: null, platform: 'linux' });
    const file = await api.put('paris-photos/2026-10/ph-20261024-abcd.jpg', jpeg());
    assert.equal(file, path.join(data, 'paris-photos', '2026-10', 'ph-20261024-abcd.jpg')); assert.ok(fs.existsSync(file));
    await assert.rejects(api.put('../evil.jpg', jpeg())); await assert.rejects(api.put('paris-photos/2026-10/ph-20261024-abce.jpg', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), /JPEG/);
    fs.mkdirSync(path.join(shots, '100APPLE'), { recursive: true });
    const a = jpeg({ exif: { date: '2026:10:24 21:40:00', offset: '+02:00', gps: { lat: 48.8829, lon: 2.3406 } } });
    fs.writeFileSync(path.join(shots, '100APPLE', 'IMG_0001.JPG'), a);
    fs.writeFileSync(path.join(shots, 'IMG_0002.HEIC'), heic({ date: '2026:10:24 22:10:00', offset: '+02:00' }));
    fs.writeFileSync(path.join(shots, 'notes.txt'), 'not a photo'); fs.writeFileSync(path.join(shots, '._IMG_0001.JPG'), 'mac fork');
    const before = fs.readFileSync(path.join(shots, '100APPLE', 'IMG_0001.JPG'));
    const r = await api.scan(shots);
    assert.deepEqual(r.photos.map((p) => p.name).sort(), ['IMG_0001.JPG', 'IMG_0002.HEIC']);
    const j = r.photos.find((p) => p.name === 'IMG_0001.JPG'); assert.equal(j.exif.date, '2026:10:24 21:40:00'); assert.equal(j.exif.offset, '+02:00'); assert.ok(j.exif.gps);
    assert.equal(r.photos.find((p) => p.kind === 'heic').exif.date, '2026:10:24 22:10:00');
    assert.deepEqual(fs.readFileSync(path.join(shots, '100APPLE', 'IMG_0001.JPG')), before, 'the original is only read');
    await assert.rejects(api.scan('relative/dir')); await assert.rejects(api.scan(path.join(tmp, 'nope')));
    const trashed = []; const t = await api.trash(['paris-photos/2026-10/ph-20261024-abcd.jpg', path.join(shots, '100APPLE', 'IMG_0001.JPG'), '../data/kv/x.json'], async (f) => trashed.push(f));
    assert.deepEqual(trashed, [file], 'only Hearth\'s own copy goes to the Trash'); assert.equal(t.failed.length, 2);
    const hz = await api.heic(heic({ date: '2026:10:24 22:10:00' }));
    assert.equal(hz.ok, false); assert.match(hz.why, /HEIC/); assert.match(hz.why, /JPEG/);
    assert.equal((await api.heic(jpeg())).ok, false);
    const win = M.create({ dataDir: data, nativeImage: null, platform: 'win32' }); assert.equal(typeof win.heic, 'function');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); checks++; console.log('✓ ' + name); } catch (err) { console.log('✖ ' + name + '\n' + (err.stack || err)); process.exitCode = 1; } }
  console.log(`\nphotos69-test: ${checks}/${tests.length} checks passed`);
})();
