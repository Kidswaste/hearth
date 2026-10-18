// (round 64, mapfirst64) The Paris map shows rounds 61–63 by default, with CLICKS ONLY (no chat command anywhere here):
// a fresh profile and an existing journal (Codex's own pins + the owner's, visited, no guide) both get the Paris guide's
// places on the map when it opens (drawn lighter: .qj-pin-guide), this week's shows with venue logos (the once-a-day
// read starts as the map opens; saved Shotgun / DICE responses, no network) and visited ✓. One strip on the map:
// Places · Shows · My walks · Visited (+ Plan a walk), one row; chips toggle and are remembered; a failed read shows one
// line ("Couldn't load … — last list from …"); a guide place's panel → Start this quest; a show pin → Make it a quest /
// Get ready; the footer's Paris guide, the ✦ list and the walk dialog work by clicking. Offline map tiles.
//   node dev/smoke.js --script dev/checks/mapfirst64.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const root = () => document.querySelector('.qj');
const S = () => QuestJournal.snapshot();
const pinIds = (sel = '') => [...root().querySelectorAll('.qj-atlas .qj-atlas-pin' + sel)].map((b) => b.dataset.place);
const chip = (id) => root().querySelector(`.qmf-chip[data-layer="${id}"]`);
const dlg = () => document.querySelector('dialog.qj-dialog[open]');
const btn = (txt, scope = dlg() || root()) => [...scope.querySelectorAll('button')].find((b) => (typeof txt === 'string' ? b.textContent.trim() === txt || b.getAttribute('aria-label') === txt : txt.test(b.textContent)));
const closeAll = async () => { document.querySelectorAll('dialog.qj-dialog[open]').forEach((d) => d.close()); await wait(120); };
const shots = window.SMOKE_TMP || window.SMOKE_SAVES;
const commands = []; const realTry = Commands.tryRun; Commands.tryRun = function (...a) { commands.push(a[0]); return realTry.apply(this, a); };
const opened = []; window.hub.openExternal = (u) => { opened.push(u); };

try {
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable');
  await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');

  // ---------- 1. a fresh profile: open Sidequest Studio › the map, nothing else ----------
  await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => root() && QuestJournal.ready(), 'journal');
  QuestJournal.navigate('world'); // (the map's own entry: the Studio's world page)
  await until(() => root().querySelector('.qj-atlas'), 'map');
  await until(() => pinIds('.qj-pin-guide').length >= 30, 'guide pins by default');
  const P = QuestParis, guideNew = P.guide.filter((g) => g.id.startsWith('pp-')).length;
  step('fresh: the guide’s places are on the map with no command', pinIds('.qj-pin-guide').length === guideNew && S().atlas.places.length === 6 + guideNew, { guide: pinIds('.qj-pin-guide').length, stored: S().atlas.places.length });
  step('fresh: Codex’s own six pins keep their own style', pinIds(':not(.qj-pin-guide)').filter((id) => id.startsWith('place-')).length === 6);
  step('guide pins are dots at the city zoom (not cluttering)', root().querySelector('.qj-atlas').dataset.zoom === '12' && root().querySelector('.qj-pin-guide>span').getBoundingClientRect().width <= 16, root().querySelector('.qj-pin-guide>span').getBoundingClientRect().width);
  await until(() => pinIds('[data-place^="show-venue-"]').length >= 3, 'show pins by default (the read starts when the map opens)');
  await until(() => root().querySelectorAll('.qj-atlas-pin.has-logo img.qj-atlas-logo').length >= 3, 'venue logos');
  step('fresh: this week’s shows are on the map with venue logos, no command', pinIds('[data-place^="show-venue-"]').length >= 3 && ShowSync.snap.enabled, pinIds('[data-place^="show-venue-"]').length);
  const strip = root().querySelector('.qmf-strip');
  const kids = [...strip.children], tops = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top)));
  step('one strip on the map, one row: Places · Shows · My walks · Visited · Plan a walk', strip.closest('.qj-atlas') && tops.size === 1 && kids.map((k) => k.textContent.replace(/\d+/g, '').trim()).join('|') === 'Places|Shows|My walks|Visited|Plan a walk', kids.map((k) => k.textContent));
  step('every chip starts on', ['places', 'shows', 'walks', 'visited'].every((id) => chip(id).getAttribute('aria-pressed') === 'true'));
  step('no failure line while the read worked', !root().querySelector('.qmf-status'));
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  await smoke({ shot: shots + '/mapfirst64-fresh.png' });

  // ---------- 2. a guide place → its quest → Start this quest ----------
  root().querySelector('.qj-atlas-pin[data-place="pp-superfly"]').click();
  await until(() => /Superfly/.test(root().querySelector('.qj-field-place-head')?.textContent || ''), 'superfly selected');
  const card = root().querySelector('.qj-paris-quest');
  step('a guide place’s panel shows its quest (3 steps) and Start this quest', card && card.querySelectorAll('li').length === 3 && btn('Start this quest', card), card?.textContent.slice(0, 120));
  btn('Start this quest', card).click();
  await until(() => S().campaigns.some((c) => c.id === 'c-pp-superfly'), 'place quest saved');
  step('Start this quest saves it, tracks it and opens its first step', S().active === 'c-pp-superfly' && !!(await until(() => dlg(), 'step opens', 40)));
  await closeAll();
  step('a started guide place is drawn as one of yours', !pinIds('.qj-pin-guide').includes('pp-superfly'));

  // ---------- 3. a show pin → Make it a quest / Get ready ----------
  root().querySelector('.qj-atlas-pin[data-place^="show-venue-"]').click();
  await until(() => dlg()?.querySelector('.ss-next'), 'venue dialog with the next show');
  step('a show pin’s dialog has Make it a quest and Get ready', !!btn('Make it a quest') && !!btn('Get ready'));
  await smoke({ shot: shots + '/mapfirst64-show.png' });
  btn('Make it a quest').click();
  await until(() => S().campaigns.some((c) => c.id.startsWith('c-show-')), 'show quest saved');
  step('Make it a quest saves a show quest', S().campaigns.filter((c) => c.id.startsWith('c-show-')).length === 1);
  await closeAll();
  root().querySelector('.qj-atlas-pin[data-place^="show-venue-"]').click(); await until(() => btn('Get ready'), 'venue again');
  btn('Get ready').click(); await until(() => /Get ready/.test(dlg()?.textContent || ''), 'get ready card');
  step('Get ready opens the show night card', /Get ready/.test(dlg().querySelector('h2,h3,.qj-dialog-title')?.textContent || dlg().textContent));
  await closeAll();

  // ---------- 4. chips toggle, and are remembered ----------
  const guideBefore = pinIds('.qj-pin-guide').length;
  chip('places').click(); await until(() => chip('places')?.getAttribute('aria-pressed') === 'false', 'places off');
  step('Places off: untouched guide pins leave, yours and started ones stay', pinIds('.qj-pin-guide').length === 0 && pinIds().includes('pp-superfly') && pinIds().includes('place-canal') && S().atlas.places.length === 6 + guideNew, { before: guideBefore, stored: S().atlas.places.length });
  chip('shows').click(); await until(() => chip('shows')?.getAttribute('aria-pressed') === 'false', 'shows off');
  step('Shows off: no show pins', pinIds('[data-place^="show-venue-"]').length === 0);
  const saved = JSON.parse(localStorage.getItem('hub.questmap.layers') || '{}');
  step('the choice is remembered on this computer', saved.places === false && saved.shows === false, saved);
  QuestJournal.navigate('adventure'); await wait(200); QuestJournal.navigate('world'); await until(() => chip('places'), 'map again');
  step('…and still off when the map opens again', chip('places').getAttribute('aria-pressed') === 'false' && pinIds('.qj-pin-guide').length === 0 && pinIds('[data-place^="show-venue-"]').length === 0);
  chip('places').click(); await until(() => pinIds('.qj-pin-guide').length === guideBefore, 'places back');
  chip('shows').click(); await until(() => pinIds('[data-place^="show-venue-"]').length >= 3, 'shows back');
  step('back on: guide pins and shows return', true);
  // Visited: stamp one by clicking, it gets a ✓; Visited off hides it
  root().querySelector('.qj-atlas-pin[data-place="place-canal"]').click(); await until(() => /Canal/.test(root().querySelector('.qj-field-place-head')?.textContent || ''), 'canal');
  btn('Stamp my visit', root()).click(); await until(() => S().atlas.places.find((p) => p.id === 'place-canal').visitedAt, 'visit stamp');
  await until(() => root().querySelector('.qj-atlas-pin.visited[data-place="place-canal"]'), 'visited pin');
  step('a visited place wears a ✓', getComputedStyle(root().querySelector('.qj-atlas-pin.visited[data-place="place-canal"]'), '::after').content.includes('✓') && /1$/.test(chip('visited').textContent.trim()), chip('visited').textContent);
  root().querySelector('.qj-atlas-pin[data-place="pp-bataclan"]').click(); await wait(250); // select another pin (the selected one always stays)
  chip('visited').click(); await until(() => chip('visited')?.getAttribute('aria-pressed') === 'false', 'visited off');
  step('Visited off hides visited places', !pinIds().includes('place-canal'));
  chip('visited').click(); await until(() => pinIds().includes('place-canal'), 'visited back');

  // ---------- 5. Plan a walk, My walks ----------
  QuestWalk._test.open = (u) => { opened.push(u); };
  btn('Plan a walk', root().querySelector('.qmf-strip')).click();
  await until(() => /walk/i.test(dlg()?.textContent || '') && root().querySelector('.qj-atlas-route polyline'), 'walk dialog + line');
  step('Plan a walk: the walk dialog and its line on the map', !!QuestWalk.preview && QuestWalk.preview.stops.length >= 2);
  await smoke({ shot: shots + '/mapfirst64-walk.png' });
  btn('Save as a walk quest').click(); await until(() => S().campaigns.some((c) => c.id.startsWith('c-walk-')), 'walk saved');
  step('Save as a walk quest (clicked)', S().active.startsWith('c-walk-'));
  await closeAll();
  await until(() => root().querySelector('.qj-atlas-route polyline'), 'saved walk line');
  chip('walks').click(); await until(() => !root().querySelector('.qj-atlas-route polyline'), 'walks off');
  step('My walks off hides the line', !root().querySelector('.qj-atlas-route'));
  chip('walks').click(); await until(() => root().querySelector('.qj-atlas-route polyline'), 'walks on');

  // ---------- 6. the round 61–63 buttons, by clicking ----------
  btn('Paris guide', root().querySelector('.qj-field-footer')).click(); await until(() => dlg()?.querySelector('[data-personal]'), 'guide dialog');
  step('footer Paris guide → personal quests + Make a walk', dlg().querySelectorAll('[data-personal]').length === P.personal.length && !!btn('Make a walk'));
  dlg().querySelector('[data-personal="records"]').click(); await until(() => S().campaigns.some((c) => c.id === 'c-pq-records'), 'personal quest');
  step('a personal quest card starts it', true); await closeAll();
  root().querySelector('[data-focus="map-shows"]').click(); await until(() => dlg()?.querySelectorAll('.ss-row').length, 'shows list');
  step('✦ Shows this week lists the week', dlg().querySelectorAll('.ss-row').length === 4); await closeAll();

  // ---------- 7. a failed read: one plain line on the map, Retry ----------
  await window.hub.shows.test({ dev: window.SMOKE_DEV, overrides: { 'https://dice.fm/browse/paris-5b23e8a0e63cc224a4c36a2d': null } });
  await window.hub.shows.test({ advance: 21 * 3600e3 });
  const retry = root().querySelector('.qmf-status');
  if (retry) retry.click(); else { chip('shows').click(); await until(() => chip('shows')?.getAttribute('aria-pressed') === 'false', 'shows off'); chip('shows').click(); } // the line only shows on failure; otherwise Shows off → on asks again (a day later on the sync's clock)
  const line = await until(() => root().querySelector('.qmf-status:not(.busy)'), 'failure line');
  step('a failed read says so on the map, keeping the last list', /^Couldn’t load DICE — last list from /.test(line.textContent) && ShowSync.snap.shows.length >= 1, { line: line.textContent, kept: ShowSync.snap.shows.length });
  await smoke({ shot: shots + '/mapfirst64-status.png' });

  // ---------- 8. an existing journal (Codex's pins + the owner's, visited, no guide) migrates on open ----------
  const C = QuestCore, old = C.upgrade(C.initial());
  old.atlas.places.push({ id: 'my-cafe', name: 'Café Charbon', lat: 48.8656, lon: 2.3779, quest: 'Sketch the room', visitedAt: new Date().toISOString(), kind: 'social', favorite: true });
  old.atlas.selected = 'my-cafe';
  localStorage.removeItem('hub.questmap.guideSeeded'); // a profile that never opened this map since round 64
  QuestJournal.navigate('adventure'); await wait(150);
  document.dispatchEvent(new CustomEvent('hearth:quests', { detail: { state: old, source: 'mapfirst64-existing' } }));
  await until(() => S().atlas.places.length === 7, 'existing journal adopted');
  QuestJournal.navigate('world');
  await until(() => S().atlas.places.length === 7 + guideNew, 'guide migrated in');
  const st = S();
  step('existing journal: the guide joins once, the owner’s pins and selection unchanged', st.atlas.selected === 'my-cafe' && st.atlas.places.find((p) => p.id === 'my-cafe').favorite && st.atlas.places.filter((p) => p.id === 'my-cafe').length === 1, st.atlas.places.length);
  btn('Paris', root().querySelector('.qj-atlas-controls')).click(); // the whole city again (the walk had framed the map closer; the map draws the pins in view)
  await until(() => pinIds('.qj-pin-guide').length >= 20, 'guide pins drawn');
  step('existing journal: guide pins + the owner’s visited ✓ pin on the map', !!root().querySelector('.qj-atlas-pin.visited[data-place="my-cafe"]') && pinIds('.qj-pin-guide').length >= 20, pinIds('.qj-pin-guide').length);
  QuestJournal.navigate('adventure'); await wait(150); QuestJournal.navigate('world'); await wait(300);
  step('opening again adds nothing', S().atlas.places.length === 7 + guideNew);
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  await smoke({ shot: shots + '/mapfirst64-existing.png' });

  // ---------- 9. narrow window: still one row, no sideways scroll ----------
  const host = root().closest('.surface') || root().parentElement; const w0 = host.style.width; host.style.width = '480px'; await wait(300);
  const tops2 = new Set([...root().querySelector('.qmf-strip').children].map((k) => Math.round(k.getBoundingClientRect().top)));
  step('narrow: the strip stays one row, the page doesn’t scroll sideways', tops2.size === 1 && root().scrollWidth <= root().clientWidth + 2);
  host.style.width = w0;

  step('no chat command was used', commands.length === 0, commands);
  step('nothing opened in the browser on its own', opened.length === 0, opened);
} catch (err) { fails.push('crashed: ' + err.message); out.steps.push('✖ ' + err.stack); }
out.fails = fails;
if (fails.length) throw Error(JSON.stringify(out, null, 1));
return JSON.stringify(out, null, 1);
