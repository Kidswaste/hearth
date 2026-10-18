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
await until(() => document.querySelectorAll('.qj-atlas-pin.has-logo img.qj-atlas-logo').length >= 3, 'logo pins');
const logoImgs = [...document.querySelectorAll('.qj-atlas-pin.has-logo img.qj-atlas-logo')];
await until(() => logoImgs.every((i) => !i.isConnected || i.complete), 'logos decoded');
const shown = [...document.querySelectorAll('.qj-atlas-pin.has-logo img.qj-atlas-logo')];
out.pins = document.querySelectorAll('.qj-atlas .qj-atlas-pin[data-place^="show-venue-"]').length;
out.logoPins = shown.filter((i) => i.naturalWidth > 0 && i.src.startsWith('file:')).length;
if (out.logoPins < 3) fail('pins with logos: ' + out.logoPins);
const placesStill = document.querySelectorAll('.qj-atlas .qj-atlas-pin:not([data-place^="show-venue-"])').length; out.ownPins = placesStill;
if (!placesStill) fail('the owner\'s own places vanished from the map');
document.querySelectorAll('.toast').forEach((n) => n.remove());
await smoke({ shot: (window.JOURNEY_SHOTS || window.SMOKE_SAVES) + '/showsync61-map.png' });

// a venue pin → its nights
document.querySelector('.qj-atlas-pin[data-place^="show-venue-"]').click();
const vd = await until(() => document.querySelector('dialog.qj-dialog[open] .ss-row'), 'venue dialog');
if (!vd) fail('venue dialog'); document.querySelector('dialog.qj-dialog[open]').close(); await wait(100);

// ---------- the compact list behind the map's ✦ icon ----------
const icon = await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon');
const iconsInRow = icon.closest('.qj-actions').querySelectorAll('button').length; out.headIcons = iconsInRow;
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
