#!/usr/bin/env node
// (round 61, showsync61) The weekly show sync without a window or a network: parsing the saved sample pages
// (dev/fixtures/showsync), links, robots.txt, both platforms merged, the geocode / logo caches, a breaking source
// keeping its last good list, and a show turned into a Sidequest campaign that QuestCore accepts.
//   node dev/showsync-test.js → { pass, checks, errors }
const fs = require('fs');
const os = require('os');
const path = require('path');
const Core = require('../showsync-core');
const Main = require('../showsyncmain');
const F = require('./showsync-fixtures');
const QuestCore = require('../tools/quest-core');

const errors = []; const checks = {};
const ok = (name, cond, detail) => { checks[name] = !!cond; if (!cond) errors.push(`${name}${detail ? ': ' + JSON.stringify(detail).slice(0, 400) : ''}`); };
const NOW = Date.now();
const page = (file) => F.fillDates(fs.readFileSync(path.join(F.DIR, file), 'utf8'), NOW);
const SG = Core.sourceFromUrl('https://shotgun.live/en/concerts/paris'), DC = Core.sourceFromUrl('https://dice.fm/browse/paris-5b23e8a0e63cc224a4c36a2d');

(async () => {
  // ---------- links ----------
  ok('link: shotgun city', SG && SG.platform === 'shotgun' && SG.kind === 'city', SG);
  ok('link: dice city', DC && DC.platform === 'dice' && DC.kind === 'city', DC);
  const v = Core.sourceFromUrl('https://shotgun.live/fr/venues/la-machine-du-moulin-rouge?utm=x');
  ok('link: shotgun venue, query dropped', v?.kind === 'venue' && v.url === 'https://shotgun.live/fr/venues/la-machine-du-moulin-rouge' && v.label === 'La Machine Du Moulin Rouge', v);
  ok('link: dice venue / artist / event', Core.sourceFromUrl('https://dice.fm/venue/petit-bain-2b5e')?.kind === 'venue' && Core.sourceFromUrl('https://dice.fm/artist/arlo-parks')?.kind === 'artist' && Core.sourceFromUrl('https://dice.fm/event/9qe1-arlo-parks')?.kind === 'event');
  ok('link: refuses others', !Core.sourceFromUrl('http://dice.fm/venue/x') && !Core.sourceFromUrl('https://evil.example/venue/x') && !Core.sourceFromUrl('https://dice.fm/login') && !Core.sourceFromUrl('https://user:pw@dice.fm/venue/x') && !Core.sourceFromUrl('nope'));

  // ---------- parsing ----------
  const sg = Core.parsePage(page('shotgun-paris.html'), SG);
  ok('parse: shotgun JSON-LD (online event skipped)', sg.via === 'jsonld' && sg.shows.length === 4, sg.shows.map((s) => s.title));
  const ufo = sg.shows.find((s) => /Ben UFO/.test(s.title));
  ok('parse: venue, address, coords, logo url, lineup, ticket, price', ufo && ufo.venue.name === 'La Machine du Moulin Rouge' && ufo.venue.address === '90 Boulevard de Clichy, 75018 Paris' && ufo.venue.lat === 48.8841 && ufo.venue.image === 'https://images.shotgun.live/venues/machine.png' && ufo.lineup.join() === 'Ben UFO,Call Super' && ufo.url === 'https://shotgun.live/en/events/machine-club-ben-ufo' && ufo.price.from === 18, ufo);
  const rinse = sg.shows.find((s) => /Rinse/.test(s.title));
  ok('parse: entities decoded, lineup from the title, no coords', rinse.venue.address === '211 Avenue Jean Jaurès, 75019 Paris' && rinse.lineup.join() === 'Sherelle,Nia Archives' && !Number.isFinite(rinse.venue.lat), rinse);
  const dc = Core.parsePage(page('dice-paris.html'), DC);
  ok('parse: dice JSON-LD + sold out', dc.via === 'jsonld' && dc.shows.length === 2 && dc.shows.find((s) => s.title === 'Arlo Parks').soldOut === true, dc.shows);
  const PB = Core.sourceFromUrl('https://dice.fm/venue/petit-bain-2b5e');
  const nx = Core.parsePage(page('dice-venue-petitbain.html'), PB);
  ok('parse: Next.js fallback + og:image as the venue logo', nx.via === 'next' && nx.shows.length === 2 && nx.shows[0].venue.lat === 48.8355 && nx.shows[0].url === 'https://dice.fm/event/r2d2-nala-sinephro' && nx.shows.every((s) => s.venue.image === 'https://dice-media.imgix.net/venues/petitbain.png'), nx.shows);
  ok('parse: protection page reported, not parsed', Core.parsePage(page('blocked.html'), SG).blocked === true);
  ok('parse: changed page → nothing', Core.parsePage(page('changed.html'), SG).shows.length === 0);
  ok('parse: garbage never throws', Core.parsePage('<script type="application/ld+json">{oops</script>', SG).shows.length === 0 && Core.parsePage(null, SG).shows.length === 0);

  // ---------- merge / dedupe across platforms ----------
  const merged = Core.merge([sg.shows, dc.shows, nx.shows]);
  const bon = merged.filter((s) => /Bon Entendeur/.test(s.title));
  ok('merge: same night + venue + title across platforms = one show', bon.length === 1 && bon[0].platforms.slice().sort().join() === 'dice,shotgun' && bon[0].tickets.length === 2 && bon[0].venue.image === 'https://dice-media.imgix.net/venues/bataclan.png' && bon[0].venue.lat === 48.8631 && bon[0].price.from === 30.5, bon);
  ok('merge: the rest stay apart', merged.length === 7, merged.map((s) => s.title));
  ok('merge: stable keys', Core.merge([dc.shows, sg.shows, nx.shows]).map((s) => s.key).sort().join() === merged.map((s) => s.key).sort().join());
  const week = Core.thisWeek(merged, NOW);
  ok('week: only the next 7 days, in order', week.length === 5 && week.every((s, i) => !i || week[i - 1].start <= s.start), week.map((s) => s.title));
  const nightA = new Date(NOW); nightA.setHours(23, 0, 0, 0); const after = new Date(nightA.getTime() + 3 * 3600e3);
  ok('merge: a 2 am start belongs to the night before', Core.nightOf(after.getTime()) === Core.nightOf(nightA.getTime()));
  ok('find: by artist / venue words', Core.find(merged, 'arlo')?.title === 'Arlo Parks' && Core.find(merged, 'trabendo')?.title.startsWith('Rinse') && !Core.find(merged, 'zzzz'));
  const pins = Core.pins(Core.venues(week));
  ok('pins: only venues with coordinates inside Paris', pins.length === 4 && pins.every((p) => p.show && p.kind === 'music'), pins.map((p) => p.name));

  // ---------- robots.txt ----------
  const rd = fs.readFileSync(path.join(F.DIR, 'robots-dice.txt'), 'utf8');
  ok('robots: allowed, disallowed, wildcard, other bots ignored', Core.robotsAllows(rd, '/browse/paris-1') && !Core.robotsAllows(rd, '/search/x') && !Core.robotsAllows(rd, '/events?q=1') && Core.robotsAllows('', '/x') && !Core.robotsAllows('User-agent: *\nDisallow: /', '/x') && Core.robotsAllows('User-agent: *\nDisallow: /\nAllow: /venue/', '/venue/a') && Core.robotsAllows('User-agent: *\nDisallow:', '/a') && !Core.robotsAllows('User-agent: hearth\nDisallow: /a\n\nUser-agent: *\nAllow: /', '/a/b'));

  // ---------- the sync: fetch → cache → geocode / logos → snapshot ----------
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'showsync-test-'));
  let clock = NOW, hits = [], overrides = {};
  const fetch = (u, o) => F.fakeFetch({ now: NOW, overrides, hits })(u, o);
  let shrunk = 0;
  const mk = () => Main.create({ dataDir, fetch, shrink: async (buf) => { shrunk++; return buf; }, wait: async () => {}, now: () => clock });
  let S = mk();
  await S.follow('https://dice.fm/venue/petit-bain-2b5e');
  let snap = await S.refresh();
  const has = (u) => hits.filter((h) => h.url === u).length;
  ok('sync: robots read once per site, pages fetched with Hearth\'s user agent', has('https://shotgun.live/robots.txt') === 1 && has('https://dice.fm/robots.txt') === 1 && hits.every((h) => h.headers['User-Agent'] === Core.UA), hits.map((h) => h.url));
  ok('sync: merged list', snap.shows.length === 7 && !snap.status && snap.enabled, { n: snap.shows.length, status: snap.status });
  ok('geocode: the venue without coordinates looked up once', has(F.NOMINATIM_TRABENDO) === 1 && snap.shows.find((s) => /Rinse/.test(s.title)).venue.lat === 48.8824, snap.shows.find((s) => /Rinse/.test(s.title))?.venue);
  ok('logos: fetched once each, shrunk, saved, served as file URLs', shrunk === 5 && fs.readdirSync(path.join(dataDir, 'showsync', 'logos')).length === 5 && snap.shows.find((s) => /Ben UFO/.test(s.title)).venue.logo.startsWith('file:'), { shrunk });
  ok('files: written atomically (no temp left)', fs.readdirSync(path.join(dataDir, 'showsync')).every((f) => !/tmp/.test(f)), fs.readdirSync(path.join(dataDir, 'showsync')));
  hits = []; snap = await S.refresh();
  ok('polite: nothing fetched again the same day', hits.length === 0, hits);
  hits = []; snap = await S.refresh({ force: true });
  ok('polite: even when asked, a page waits 10 minutes', hits.length === 0, hits);

  // next day: conditional requests, cached geocode / logos reused (a new instance reads the files back)
  clock += 21 * 3600e3; hits = []; shrunk = 0; S = mk();
  overrides = { 'https://shotgun.live/en/concerts/paris': { status: 304, headers: { etag: '"sg-1"' } } };
  snap = await S.refresh();
  const sgHit = hits.find((h) => h.url === 'https://shotgun.live/en/concerts/paris');
  const dcHit = hits.find((h) => h.url === DC.url);
  ok('conditional: If-None-Match / If-Modified-Since sent; 304 keeps the list', sgHit?.headers['If-None-Match'] === '"sg-1"' && dcHit?.headers['If-Modified-Since'] === 'Sat, 17 Oct 2026 08:00:00 GMT' && snap.shows.length === 7, { sgHit, dcHit });
  ok('caches: no new geocode or logo request', has(F.NOMINATIM_TRABENDO) === 0 && shrunk === 0 && hits.every((h) => !/png$/.test(h.url)), hits.map((h) => h.url));

  // a breaking source: the page changes → last good kept, one plain line
  clock += 21 * 3600e3; hits = [];
  overrides = { 'https://shotgun.live/en/concerts/paris': { file: 'changed.html' } };
  snap = await S.refresh();
  ok('breaking: changed page keeps the last good list + one plain line', snap.shows.length === 7 && /Shotgun's page changed/.test(snap.status || '') && /Showing the list from/.test(snap.status), snap.status);
  // a protection page: stop, keep, don't come back today
  clock += 21 * 3600e3; hits = [];
  overrides = { 'https://dice.fm/browse/paris-5b23e8a0e63cc224a4c36a2d': { file: 'blocked.html', status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' } }, 'https://shotgun.live/en/concerts/paris': { file: 'changed.html' } };
  snap = await S.refresh();
  ok('breaking: a browser check stops that site, keeps its shows', snap.shows.some((s) => s.title === 'Arlo Parks') && /couldn't update/.test(snap.status || ''), snap.status);
  clock += 2 * 3600e3; hits = [];
  snap = await S.refresh({ force: true });
  ok('breaking: the blocked site is left alone for a day', !hits.some((h) => h.url.startsWith('https://dice.fm/')), hits.map((h) => h.url));
  // offline: everything kept
  clock += 25 * 3600e3; hits = []; overrides = { 'https://shotgun.live/en/concerts/paris': null, 'https://shotgun.live/robots.txt': null, 'https://dice.fm/robots.txt': null };
  snap = await S.refresh();
  ok('breaking: offline keeps every last good list', snap.shows.some((x) => x.title === 'Possession') && snap.shows.some((x) => /Floating Points/.test(x.title)) && snap.shows.every((x) => (x.end || x.start + 4 * 3600e3) >= clock) && /couldn't update|Couldn't reach/.test(snap.status || ''), snap.status);
  // robots says no: the page isn't fetched at all
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'showsync-test-')); hits = [];
  overrides = { 'https://dice.fm/robots.txt': { file: 'robots-dice-deny.txt', headers: { 'content-type': 'text/plain' } } };
  const S2 = Main.create({ dataDir: dir2, fetch, shrink: async (b) => b, wait: async () => {}, now: () => NOW });
  snap = await S2.refresh();
  ok('robots: a disallowed page is never fetched, plain line', !hits.some((h) => h.url === DC.url) && snap.sources.find((s) => s.platform === 'dice').problem === 'robots', snap.sources);
  // a cache file that can't be read is never saved over
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'showsync-test-')); fs.mkdirSync(path.join(dir3, 'showsync'));
  fs.writeFileSync(path.join(dir3, 'showsync', 'cache.json'), '{"v":1,"sources":{'); overrides = {};
  const S3 = Main.create({ dataDir: dir3, fetch, shrink: async (b) => b, wait: async () => {}, now: () => NOW });
  await S3.refresh();
  ok('datasafe: a damaged cache is left as it was', fs.readFileSync(path.join(dir3, 'showsync', 'cache.json'), 'utf8') === '{"v":1,"sources":{');
  // follow / unfollow / from
  ok('follow: refuses a non-platform link', await S2.follow('https://example.com/venue/x').then(() => false, () => true));
  await S2.setSettings({ from: 'followed' }); ok('from followed: no city pages', S2.sources().length === 0);
  await S2.follow('https://shotgun.live/en/venues/la-machine-du-moulin-rouge'); ok('follow: venue added', S2.sources().length === 1);
  await S2.unfollow('machine'); ok('unfollow: by name', S2.sources().length === 0);

  // ---------- a show → a quest in Codex's store ----------
  const show = merged.find((s) => /Ben UFO/.test(s.title));
  const c = Core.showCampaign(show, NOW);
  ok('quest: "Go see X at Y on <day>", ticket → go → proof', /^Go see Ben UFO & Call Super at La Machine du Moulin Rouge (tomorrow|tonight|on \w+)/.test(c.title) && c.quests.map((q) => q.id.split('-').pop()).join() === 'ticket,go,proof' && c.show.url === show.url, c.title);
  const s0 = QuestCore.upgrade(QuestCore.initial()); s0.campaigns.push(c); s0.active = c.id;
  let valid = true; try { QuestCore.validate(s0); } catch (err) { valid = err.message; }
  ok('quest: QuestCore.validate accepts it (the tracker sees it)', valid === true, valid);
  ok('quest: next step is the ticket', QuestCore.next(s0, s0.campaigns.find((x) => x.id === c.id))?.id === `q-show-${show.key}-ticket`);

  for (const d of [dataDir, dir2, dir3]) fs.rmSync(d, { recursive: true, force: true });
  const pass = !errors.length;
  console.log(JSON.stringify({ pass, checks: Object.keys(checks).length, failed: errors.length, errors }, null, 1));
  process.exit(pass ? 0 : 1);
})().catch((err) => { console.log(JSON.stringify({ pass: false, errors: [String(err.stack || err)] })); process.exit(1); });
