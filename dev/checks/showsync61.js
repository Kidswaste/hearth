// (round 61, showsync61) This week's Shotgun / DICE shows in the real app, from the saved sample responses in
// dev/fixtures/showsync (shows:test swaps the main process's fetch for them: no network). Checks /shows (summary,
// week, venue, quest), venue pins WITH their logos on Sidequest Studio's Paris map, the compact list behind the map's
// ✦ icon, a show → a quest in one click (in Codex's quest store, so the journal and its tracker show it), and a
// breaking page keeping the last good list with one plain line.
// OSM tiles stay offline here, as in the quest-map checks.
const atlasImageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...atlasImageSource, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.tileFixture = String(value); queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } atlasImageSource.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { const v = await fn(); if (v) return v; await wait(60); } throw Error(`timed out: ${what}`); };
const out = { errors: [] }; const fail = (m) => out.errors.push(m);
const said = []; const notes = [];
const run = async (line) => { said.length = 0; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => said.push(String(t)), note: (t, o) => notes.push({ t: String(t), o }), error: (t) => said.push('ERROR ' + t) }); await until(() => said.some((t) => !/^Reading/.test(t)), line, 250); return said.filter((t) => !/^Reading/.test(t)).join('\n'); };

const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable: ' + JSON.stringify(t));
const before = await window.hub.kvGet('quest-journal', null, { status: true });
out.lazyBefore = Lazy.state?.().showsync || (window.ShowSync ? 'loaded' : 'stub');

// ---------- (round 64, mapfirst64) no command: opening the Studio's Paris map starts the once-a-day read ----------
await Lazy.load('questjournal'); activate('tool:quests');
await until(() => document.querySelector('.qj') && QuestJournal.ready(), 'journal (map first)'); QuestJournal.navigate('world');
await until(() => document.querySelectorAll('.qj-atlas .qj-atlas-pin[data-place^="show-venue-"]').length >= 3, 'venue pins with no command', 250);
out.mapFirst = document.querySelectorAll('.qj-atlas .qj-atlas-pin[data-place^="show-venue-"]').length;
if (!document.querySelector('.qmf-strip [data-layer="shows"][aria-pressed="true"]')) fail('Shows chip on by default');
if (document.querySelector('.qmf-status')) fail('a failure line while the read worked: ' + document.querySelector('.qmf-status').textContent);

// ---------- chat ----------
const summary = await run('/shows');
out.summary = summary.split('\n').slice(0, 4);
if (!/^4 shows this week at 4 venues \(Shotgun \+ DICE\)/.test(summary)) fail('summary: ' + summary.slice(0, 200));
if (!/Bon Entendeur/.test(summary) || (summary.match(/Bon Entendeur/g) || []).length !== 1) fail('dedupe in the summary');
const hits = (await window.hub.shows.test({ report: true })).value.hits;
out.fetched = hits.length;
if (!hits.includes('https://shotgun.live/robots.txt') || !hits.includes('https://dice.fm/browse/paris-5b23e8a0e63cc224a4c36a2d')) fail('fetch plan: ' + hits.join(' '));
const weekText = await run('/shows week'); out.week = weekText.split('\n').length;
if (!/Ben UFO/.test(weekText) || !/Arlo Parks/.test(weekText) || /Possession/.test(weekText)) fail('week: ' + weekText.slice(0, 300));
const venueText = await run('/shows venue cigale');
if (!/^La Cigale · 120 Boulevard de Rochechouart/.test(venueText) || !/sold out/.test(venueText)) fail('venue: ' + venueText);
const snap = (await window.hub.shows.get()).value;
const logos = snap.shows.filter((s) => s.venue.logo).length; out.logos = logos;
if (logos < 4) fail('logos cached: ' + logos);
const trab = snap.shows.find((s) => /Rinse/.test(s.title)); if (trab?.venue.lat !== 48.8824) fail('geocode: ' + JSON.stringify(trab?.venue));

// ---------- the Paris map: venue pins with logos ----------
await Lazy.load('questjournal'); activate('tool:quests');
await until(() => document.querySelector('.qj-hero, .qj-content'), 'journal');
QuestJournal.navigate('world');
const pins = await until(() => { const p = [...document.querySelectorAll('.qj-atlas .qj-atlas-pin[data-place^="show-venue-"]')]; return p.length >= 3 ? p : null; }, 'show pins');
// (questfix65) Codex's quieter map (65b428c): at the city zoom the familiar clubs carry the Nights layer (a club with nights this
// week shows its logo); every other Shotgun / DICE venue appears from zoom 15. So: ≥ 1 logo pin in the Studio at the city
// zoom, and the same atlas (QuestAtlas, with questperf65's pin diffing) draws ≥ 3 logo pins once zoomed in on the venues.
await until(() => document.querySelectorAll('.qj-atlas-pin.has-logo img.qj-atlas-logo').length >= 1, 'logo pins');
const logoImgs = [...document.querySelectorAll('.qj-atlas-pin.has-logo img.qj-atlas-logo')];
await until(() => logoImgs.every((i) => !i.isConnected || i.complete), 'logos decoded');
const shown = [...document.querySelectorAll('.qj-atlas-pin.has-logo img.qj-atlas-logo')];
out.pins = document.querySelectorAll('.qj-atlas .qj-atlas-pin[data-place^="show-venue-"]').length;
out.cityLogoPins = shown.filter((i) => i.naturalWidth > 0 && i.src.startsWith('file:')).length;
if (out.cityLogoPins < 1) fail('a familiar club with its logo at the city zoom: ' + out.cityLogoPins);
{ // zoomed in: a second atlas on this week's venue pins (the Studio's own map keeps its view: it is put back before destroy)
  const venuePins = ShowSync.layer.pins({}); out.layerLogos = venuePins.filter((p) => p.logo?.startsWith('file:')).length;
  const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:2400px;height:1600px;z-index:-1'; document.body.append(box);
  const a = QuestAtlas.mount(box, { places: venuePins, lines: [] }); const home = a.center(), z = box.dataset.zoom;
  const key = (k) => box.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  for (let i = 0; i < 6 && Number(box.dataset.zoom) < 15; i++) key('+'); // zoom 15: where every venue's pin appears (a large box holds the city's venues at that zoom)
  const c = venuePins.filter((p) => p.logo); a.focus({ lat: c.reduce((t, p) => t + p.lat, 0) / c.length, lon: c.reduce((t, p) => t + p.lon, 0) / c.length });
  const imgs = [...box.querySelectorAll('.qj-atlas-pin.has-logo img.qj-atlas-logo')];
  await until(() => imgs.every((i) => i.complete), 'zoomed logos decoded');
  out.zoom = box.dataset.zoom; out.logoPins = imgs.filter((i) => i.naturalWidth > 0 && i.src.startsWith('file:')).length;
  while (Number(box.dataset.zoom) > Number(z)) key('-'); a.focus(home); a.destroy(); box.remove();
}
if (out.logoPins < 3) fail('pins with logos (zoomed in): ' + out.logoPins + ' at zoom ' + out.zoom);
const placesStill = document.querySelectorAll('.qj-atlas .qj-atlas-pin:not([data-place^="show-venue-"])').length; out.ownPins = placesStill;
if (!placesStill) fail('the owner\'s own places vanished from the map');
document.querySelectorAll('.toast').forEach((n) => n.remove());
await smoke({ shot: (window.JOURNEY_SHOTS || window.SMOKE_SAVES) + '/showsync61-map.png' });

// a venue pin → its nights
document.querySelector('.qj-atlas-pin.has-logo[data-place^="show-venue-"]').click(); // (questfix65) a club with nights this week (a familiar club with none opens its programme links)
const vd = await until(() => document.querySelector('dialog.qj-dialog[open] .ss-row'), 'venue dialog');
if (!vd) fail('venue dialog'); document.querySelector('dialog.qj-dialog[open]').close(); await wait(100);

// ---------- the compact list behind the map's ✦ icon ----------
const icon = await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon');
const iconsInRow = icon.closest('.qj-actions, .qj-command-map-extras').querySelectorAll('button').length; // (questfix65) the icon lives in Codex's Map row now out.headIcons = iconsInRow;
icon.click();
const rows = await until(() => { const r = document.querySelectorAll('dialog.qj-dialog[open] .ss-row'); return r.length ? r : null; }, 'list rows');
out.listRows = rows.length; out.dayLabels = document.querySelectorAll('dialog.qj-dialog[open] .ss-list > .qj-label').length;
if (rows.length !== 4) fail('list rows: ' + rows.length);
await smoke({ shot: (window.JOURNEY_SHOTS || window.SMOKE_SAVES) + '/showsync61-list.png' });
// a show → a quest, one click
[...rows].find((r) => /Arlo Parks/.test(r.textContent)).click();
const make = await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] button')].find((b) => /Make it a quest/.test(b.textContent)), 'make quest');
const ticketBtn = [...document.querySelectorAll('dialog.qj-dialog[open] button')].some((b) => /Tickets on DICE/.test(b.textContent)); if (!ticketBtn) fail('ticket link');
if (!document.querySelector('dialog.qj-dialog[open]') || ![...document.querySelectorAll('dialog.qj-dialog[open] button')].some((b) => /Keep in my lineup/.test(b.textContent))) fail('keep in my lineup (Codex outing desk)');
make.click();
await until(() => QuestJournal.snapshot()?.campaigns.some((c) => c.id.startsWith('c-show-') && /Arlo Parks/.test(c.title)), 'quest saved');
const st = QuestJournal.snapshot(); const camp = st.campaigns.find((c) => c.id.startsWith('c-show-') && /Arlo Parks/.test(c.title));
out.quest = { title: camp.title, steps: camp.quests.map((q) => q.title), active: st.active === camp.id };
if (!/^Go see Arlo Parks at La Cigale /.test(camp.title) || camp.quests.length !== 3 || !out.quest.active) fail('quest: ' + JSON.stringify(out.quest));
// questhud61's chip follows (it listens to 'hearth:quests')
if (typeof QuestHud !== 'undefined') { await until(() => /Arlo Parks/.test(JSON.stringify(QuestHud.state().current || '')), 'quest tracker chip', 80).catch(() => fail('tracker chip: ' + JSON.stringify(QuestHud.state().current))); out.hud = QuestHud.state().current?.campaign || QuestHud.state().current?.title || null; } else out.hud = 'no tracker on this branch';
await until(() => document.querySelector('dialog.qj-dialog[open]'), 'quest detail opens', 40).catch(() => fail('quest detail did not open'));
await smoke({ shot: (window.JOURNEY_SHOTS || window.SMOKE_SAVES) + '/showsync61-quest.png' });
document.querySelectorAll('dialog.qj-dialog[open]').forEach((d) => d.close());

// /shows quest from chat (journal open: through its own save)
const qText = await run('/shows quest ben ufo');
if (!/^Quest saved: Go see Ben UFO & Call Super at La Machine du Moulin Rouge/.test(qText)) fail('chat quest: ' + qText);
await QuestJournal.flush();
const disk = await window.hub.kvGet('quest-journal', null, { status: true });
const onDisk = disk.value.campaigns.filter((c) => c.id.startsWith('c-show-')).length; out.questsOnDisk = onDisk;
if (onDisk !== 2) fail('quests in the store: ' + onDisk);
const again = await run('/shows quest ben ufo'); await QuestJournal.flush();
if ((await window.hub.kvGet('quest-journal', null, { status: true })).value.campaigns.filter((c) => c.id.startsWith('c-show-')).length !== 2) fail('same show twice made two quests');

// ---------- a breaking page: last good kept, one plain line ----------
await window.hub.shows.test({ dev: window.SMOKE_DEV, overrides: { 'https://shotgun.live/en/cities/paris': { file: 'changed.html' } } });
await window.hub.shows.test({ advance: 21 * 3600e3 });
const broke = await run('/shows refresh');
out.broken = broke.split('\n').filter((l) => /changed|Showing/.test(l));
if (!/Shotgun's page changed/.test(broke) || !/Ben UFO|Rinse|Bon Entendeur/.test(broke)) fail('breaking: ' + broke.slice(0, 300));

// ---------- idle: no timers of ours, nothing fetched without a reason ----------
await window.hub.shows.test({ dev: window.SMOKE_DEV });
await wait(1500);
const idleHits = (await window.hub.shows.test({ report: true })).value.hits.length; out.idleHits = idleHits;
if (idleHits) fail('fetched while idle: ' + idleHits);
out.complete = (Commands.get('shows')?.complete?.('quest ') || []).length;
if (!out.complete) fail('quest completions');
out.commandDups = Commands.duplicates().map((d) => d.name).filter((n) => n === 'shows');
if (out.commandDups.length) fail('duplicate /shows');
out.pass = !out.errors.length;
return JSON.stringify(out);
