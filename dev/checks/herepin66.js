// (round 66, herepin66) "📍 I'm here" on the Paris map, by CLICKING only (no chat command here; it fails if one is used),
// on the smoke run's throwaway profile with saved Shotgun / DICE responses, offline tiles and one made-up show tonight:
// the labelled button is on the map; a real mouse click on the map sets the pin there (no GPS asked, no request sent);
// "Close to you" lists place quests / shows tonight / park-jam spots sorted by walking minutes ("about N min walk",
// 4.5 km/h) with Start this quest (each kind saves its quest) and Show on map; the pin is kept in this computer's
// localStorage only (not in the journal); the ✦ tracker shows "📍 Near me" while a pin is set and opens the panel;
// the pin gets lighter with age and is gone after 3 hours (the row too); Esc cancels picking; Move / Clear work.
//   node dev/smoke.js --script dev/checks/herepin66.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const root = () => document.querySelector('.qj');
const S = () => QuestJournal.snapshot();
const map = () => root().querySelector('.qj-world-layout .qj-atlas');
const dock = () => map()?.querySelector('.hp-dock');
const near = () => map()?.querySelector('.hp-near');
const rows = () => [...(near()?.querySelectorAll('.hp-item') || [])];
const dlg = () => document.querySelector('dialog.qj-dialog[open]');
const btn = (txt, scope) => [...scope.querySelectorAll('button')].find((b) => (typeof txt === 'string' ? b.textContent.trim() === txt : txt.test(b.textContent)));
const closeAll = async () => { document.querySelectorAll('dialog.qj-dialog[open]').forEach((d) => d.close()); await wait(150); };
const shots = window.SMOKE_TMP || window.SMOKE_SAVES;
const commands = []; const realTry = Commands.tryRun; Commands.tryRun = function (...a) { commands.push(a[0]); return realTry.apply(this, a); };
const opened = []; window.hub.openExternal = (u) => { opened.push(u); };
// no GPS, no network for the pin
let gps = 0; try { const g = navigator.geolocation; g.getCurrentPosition = () => { gps++; }; g.watchPosition = () => { gps++; return 0; }; } catch { /* none */ }
const sent = []; const realFetch = window.fetch; window.fetch = function (u, ...a) { const s = String(u?.url || u); if (/^https?:/.test(s)) sent.push(s); return realFetch.call(this, u, ...a); };
const xo = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...a) { if (/^https?:/.test(String(u))) sent.push(String(u)); return xo.call(this, m, u, ...a); };
const click = async (x, y) => { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x, y } }); await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } }); await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } }); };
const PIN = () => store.get('herepin.pin', null);
// a real click on what get() finds, until ok(): the Studio may re-render the map between a press and its release while
// the week's shows finish loading (a person would click again); each miss is noted with what was under the pointer
const misses = [];
let churn = 0; new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n.nodeType === 1 && (n.matches('.hp-dock,.qj-atlas') || n.querySelector('.hp-dock'))) churn++; }).observe(document.body, { childList: true, subtree: true });
const settled = async () => { let c = -1; for (let i = 0; i < 20 && c !== churn; i++) { c = churn; await wait(700); } };
const clickUntil = async (get, ok, what) => {
  for (let i = 0; i < 4; i++) {
    const n = get(), r = n.getBoundingClientRect(), x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    await click(x, y);
    for (let k = 0; k < 25; k++) { if (ok()) return true; await wait(60); }
    misses.push(`${what}: under the pointer ${hit?.className || hit?.tagName}${hit === n || n.contains(hit) ? ' (the button)' : ''}, in view ${y < innerHeight}`);
  }
  throw Error(`timed out: ${what}`);
};

try {
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable');
  await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');
  store.set('herepin.pin', null);

  // ---------- 1. Sidequest Studio › the map: the button is there, labelled ----------
  await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => root() && QuestJournal.ready(), 'journal');
  QuestJournal.navigate('world');
  await until(() => map() && dock(), 'map with the I’m here button');
  await until(() => ShowSync.snap?.shows?.length, 'saved shows');
  // one made-up show tonight, 350 m east of where we'll stand (a copy of a saved one, so it has every field)
  const SPOT = { lat: 48.8700, lon: 2.3800 }; // Belleville / Oberkampf: guide places and park-jam spots around
  const eastOf = (a, d) => ({ lat: a.lat, lon: a.lon + d / (111320 * Math.cos(a.lat * Math.PI / 180)) });
  const base = ShowSync.snap.shows[0], v = eastOf(SPOT, 350);
  ShowSync.snap.shows.push({ ...structuredClone(base), id: 'hp66', key: 'hp66', title: 'Herepin Test Night', lineup: ['Herepin Test'], start: Date.now() + 3600e3, end: 0, dateOnly: false, cancelled: false, venue: { ...base.venue, name: 'Herepin Club', key: 'herepinclub', lat: v.lat, lon: v.lon } });
  const b0 = dock().querySelector('.hp-btn'), mr = map().getBoundingClientRect(), br = b0.getBoundingClientRect();
  step('a clearly labelled “📍 I’m here” button sits on the map', b0.textContent.trim() === '📍 I’m here' && br.width > 40 && br.left >= mr.left && br.right <= mr.right && br.top >= mr.top && br.bottom <= mr.bottom && !!b0.title, { text: b0.textContent, title: b0.title });
  step('no pin, no panel, no pin marker before a click', !PIN() && !near() && !map().querySelector('[data-place="herepin-me"]'));

  // ---------- 2. click the button, then the map ----------
  map().qjHere.go(SPOT, 15);
  await settled(); out.settle = churn; // (the week's shows finish loading and the Studio re-renders the map a few times right after it opens)
  await clickUntil(() => dock().querySelector('.hp-btn'), () => map().classList.contains('hp-picking') && dock().querySelector('.hp-hint'), 'picking');
  step('the button turns into Cancel with a hint: click the map where you are now', /Click the map where you are now/.test(dock().textContent) && dock().querySelector('.hp-btn').textContent.trim() === 'Cancel');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => !map().classList.contains('hp-picking'), 'Esc cancels');
  step('Esc cancels picking (nothing saved)', !PIN() && dock().querySelector('.hp-btn').textContent.trim() === '📍 I’m here');
  await clickUntil(() => dock().querySelector('.hp-btn'), () => map().classList.contains('hp-picking'), 'picking again');
  const before = { places: S().atlas.places.length, sel: S().atlas.selected, json: JSON.stringify(S()) };
  sent.length = 0;
  // a spot left of the middle (clear of the panel), not on a pin
  const m2 = map().getBoundingClientRect(); let x = Math.round(m2.left + m2.width * 0.35), y = Math.round(m2.top + m2.height * 0.55);
  for (let i = 0; i < 12 && document.elementFromPoint(x, y)?.closest('button'); i++) y += 9;
  const expect = map().qjHere.at(x, y);
  await click(x, y);
  await until(() => PIN() && near(), 'pin set + Close to you');
  const pin = PIN();
  step('a real click on the map sets the pin exactly there', Math.abs(pin.lat - expect.lat) < 1e-5 && Math.abs(pin.lon - expect.lon) < 1e-5 && Date.now() - pin.at < 30000, { pin, expect });
  await until(() => map().querySelector('[data-place="herepin-me"]'), 'pin marker');
  const me = map().querySelector('[data-place="herepin-me"]').getBoundingClientRect();
  step('the pin marker is drawn where you clicked', Math.abs(me.left + me.width / 2 - x) < 24 && Math.abs(me.top + me.height / 2 - y) < 40, { x, y, me: [Math.round(me.left + me.width / 2), Math.round(me.top + me.height / 2)] });
  step('no GPS asked, nothing sent on the network', gps === 0 && sent.length === 0, { gps, sent });
  step('the click didn’t add a place or open a dialog', S().atlas.places.length === before.places && !dlg(), { places: S().atlas.places.length });
  step('the pin stays on this computer only: localStorage, not the quest journal', !!localStorage.getItem('hub.herepin.pin') && !JSON.stringify(S()).includes(String(pin.lat)));

  // ---------- 3. Close to you ----------
  const list = rows(), mins = list.map((r) => +(r.querySelector('.hp-walk').textContent.match(/about (\d+) min walk/) || [])[1]);
  const kinds = new Set(list.map((r) => r.dataset.kind));
  step('“Close to you” lists place quests, tonight’s show and park-jam spots', /Close to you/.test(near().querySelector('header').textContent) && kinds.has('place') && kinds.has('show') && kinds.has('jam'), [...kinds]);
  step('each row reads “about N min walk”, sorted by walking minutes, all ≤ 45', list.length >= 3 && mins.every((n, i) => Number.isFinite(n) && n <= 45 && (!i || n >= mins[i - 1])), mins);
  // worked out here on its own: haversine metres from the pin to each row's place / venue, 4.5 km/h
  const hav = (a, b) => { const r = Math.PI / 180, h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
  const spotOf = (id) => (id === 'show:hp66' ? v : id.startsWith('show:') ? HerePin.items().find((x) => x.id === id) : QuestParis.byId(id));
  const mine = list.map((r) => Math.max(1, Math.round(hav(pin, spotOf(r.dataset.id)) / 4500 * 60)));
  step('the minutes are straight-line distance at 4.5 km/h', mine.join() === mins.join(), { mine, mins });
  step('every row has Start this quest and Show on map', list.every((r) => btn('Start this quest', r) && btn('Show on map', r)));
  step('the show row says when and where', /Herepin Club/.test(list.find((r) => r.dataset.id === 'show:hp66')?.textContent || ''));
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  await smoke({ shot: shots + '/herepin66-near.png' });

  // ---------- 4. Start this quest, each kind ----------
  const placeRow = () => rows().find((r) => r.dataset.kind === 'place'), pid = placeRow().dataset.id;
  await clickUntil(() => btn('Start this quest', placeRow()), () => S().campaigns.some((c) => c.parisPlace === pid) && dlg(), 'place quest saved + opened');
  step('a place quest: saved, tracked, its first step opens', S().active === QuestParis.campaignId(pid), { active: S().active, pid });
  await closeAll();
  await until(() => btn('Continue quest', rows().find((r) => r.dataset.id === pid)), 'row says Continue');
  step('its row now says Continue quest', true);
  const showRow = () => rows().find((r) => r.dataset.id === 'show:hp66');
  btn('Start this quest', showRow()).click();
  await until(() => S().campaigns.some((c) => c.id === 'c-show-hp66'), 'show quest saved');
  step('tonight’s show: Start this quest saves the show quest', S().active === 'c-show-hp66');
  await closeAll();
  const jamRow = () => rows().find((r) => r.dataset.kind === 'jam'), jid = jamRow().dataset.id;
  btn('Start this quest', jamRow()).click();
  await until(() => S().campaigns.some((c) => c.id === 'c-pq-park'), 'park quest saved');
  step('a park-jam spot: the park session quest, pinned to that spot', S().campaigns.find((c) => c.id === 'c-pq-park').parisPlace === jid && S().active === 'c-pq-park', { jid, at: S().campaigns.find((c) => c.id === 'c-pq-park').parisPlace });
  await closeAll();

  // ---------- 5. Show on map ----------
  btn('Show on map', placeRow()).click();
  await until(() => S().atlas.selected === QuestParis.pinOf(S(), pid)?.id, 'place selected on the map');
  step('Show on map (a place): its pin is selected and its panel opens beside the map', /qj-field-place-head/.test(root().querySelector('.qj-field-panel')?.innerHTML || ''));
  btn('Show on map', showRow()).click();
  await until(() => map().querySelector('[data-place="herepin-look"]'), 'look marker');
  const lk = map().querySelector('[data-place="herepin-look"]').getBoundingClientRect(), m3 = map().getBoundingClientRect();
  step('Show on map (a show): the spot is marked and centred', Math.abs(lk.left + lk.width / 2 - (m3.left + m3.width / 2)) < 30 && Math.abs(lk.top + lk.height / 2 - (m3.top + m3.height / 2)) < 40 && showRow().classList.contains('looking'));

  // ---------- 6. hide / reopen the panel ----------
  btn('×', near()).click(); await until(() => !near() && dock().querySelector('.hp-reopen'), 'hidden');
  step('× hides the list (the pin stays), “Close to you · N” brings it back', !!PIN() && /Close to you · \d+/.test(dock().querySelector('.hp-reopen').textContent));
  dock().querySelector('.hp-reopen').click(); await until(() => near(), 'reopened');

  // ---------- 7. the ✦ tracker: Near me ----------
  const chip = document.querySelector('.qh-chip'); await until(() => chip && !chip.hidden, 'quest chip');
  chip.click(); await until(() => document.querySelector('.qh-panel [data-k="herepin"]'), 'Near me row');
  const row = document.querySelector('.qh-panel [data-k="herepin"]');
  step('the ✦ tracker shows “📍 Near me · N close” while a pin is set', /^📍 Near me · \d+ close$/.test(row.textContent.trim()), row.textContent);
  await smoke({ shot: shots + '/herepin66-hud.png' });
  btn('×', near()).click(); await until(() => !near(), 'panel hidden for the HUD test');
  row.click();
  await until(() => !document.querySelector('.qh-panel') && near(), 'Near me → the map’s Close to you');
  step('clicking Near me closes the tracker and opens Close to you on the map', true);

  // ---------- 8. the pin fades ----------
  store.set('herepin.pin', { ...PIN(), at: Date.now() - 2.5 * 3600e3 }); QuestJournal.navigate('world');
  await until(() => map().querySelector('[data-place="herepin-me"].hp-me-2'), 'lighter pin');
  step('after 2½ hours the pin is lighter and the panel says when it fades', getComputedStyle(map().querySelector('[data-place="herepin-me"]')).opacity < 0.7 && /fades in 30 min/.test(near()?.textContent || ''), near()?.querySelector('.hp-age')?.textContent);
  store.set('herepin.pin', { ...PIN(), at: Date.now() - 3 * 3600e3 - 60e3 }); QuestJournal.navigate('world');
  await until(() => !map().querySelector('[data-place="herepin-me"]'), 'faded');
  step('after 3 hours: no pin, no panel, the button stays, the stored pin is forgotten', !near() && dock().querySelector('.hp-btn') && PIN() === null);
  chip.click(); await until(() => document.querySelector('.qh-panel'), 'tracker');
  step('… and the tracker has no Near me row', !document.querySelector('.qh-panel [data-k="herepin"]'));
  document.querySelector('.qh-panel [data-k="close"]')?.click(); await wait(150);

  // ---------- 9. Use the map's centre, Move, Clear ----------
  await clickUntil(() => dock().querySelector('.hp-btn'), () => dock().querySelector('.hp-centre'), 'hint');
  const c = map().getBoundingClientRect(), ce = map().qjHere.at(c.left + c.width / 2, c.top + c.height / 2);
  dock().querySelector('.hp-centre').click(); await until(() => PIN() && near(), 'centre pin');
  step('“Use the map’s centre” sets the pin without a map click', Math.abs(PIN().lat - ce.lat) < 1e-5 && Math.abs(PIN().lon - ce.lon) < 1e-5);
  btn('Move my pin', near()).click(); await until(() => map().classList.contains('hp-picking'), 'move → picking');
  step('Move my pin starts picking again', true);
  dock().querySelector('.hp-btn').click(); await until(() => !map().classList.contains('hp-picking') && near(), 'cancel move');
  btn('Clear pin', near()).click(); await until(() => !near() && PIN() === null && !map().querySelector('[data-place="herepin-me"]'), 'cleared');
  step('Clear pin forgets it', true);

  step('real clicks landed (a miss is a re-render under the pointer, noted)', misses.length <= 1, misses);
  step('no chat command was used', commands.length === 0, commands);
  step('nothing opened in the browser on its own', opened.length === 0, opened);
} catch (err) { fails.push('crashed: ' + err.message); out.steps.push('✖ ' + err.stack); }
out.fails = fails;
if (fails.length) throw Error(JSON.stringify(out, null, 1));
return JSON.stringify(out, null, 1);
