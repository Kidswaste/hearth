// (round 66, mapbuttons66) An existing profile that saved OLDER map layer settings (round 64 stored only Places · Shows ·
// My walks · Visited, here with Shows switched off by the owner): the layers added since (Park jams, Paris place quests)
// come up ON, the owner's own "off" stays off, and the Layers button says so ("1 off"). Clicks only; isolated profile.
//   node dev/smoke.js --script dev/checks/mapbuttons66-old.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const root = () => document.querySelector('.qj');
const atlas = () => root().querySelector('.qj-atlas');
const pinIds = (sel = '') => [...root().querySelectorAll('.qj-atlas .qj-atlas-pin' + sel)].map((b) => b.dataset.place);
try {
  step('the map code isn’t loaded yet (settings are read when it loads)', !Lazy.isIn('questjournal'));
  store.set('questmap.layers', { places: true, shows: false, walks: true, visited: true }); // round 64's shape, Shows off by the owner
  await window.hub.shows.test({ dev: window.SMOKE_DEV });
  await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => root() && QuestJournal.ready(), 'journal');
  QuestJournal.navigate('world');
  await until(() => atlas(), 'map');
  await until(() => pinIds('.qj-pin-guide').length >= 6, 'food stops');
  await wait(300);
  const P = QuestMapFirst.prefs;
  step('older settings: the newer layers (Park jams, Paris place quests) are on', P.jams === true && P.quests === true && QuestMapFirst.on('jams') && QuestMapFirst.on('quests'), P);
  step('older settings: the owner’s own "Shows off" is kept', QuestMapFirst.on('shows') === false && !pinIds('[data-place^="show-venue-"]').length);
  step('…and the other layers they left on stay on', ['places', 'walks', 'visited'].every((id) => QuestMapFirst.on(id)));
  step('Park jams on the map at the city zoom', pinIds('[data-place="ml-pp-montsouris"]').length === 1, pinIds('[data-place^="ml-"]'));
  const lb = atlas().querySelector('.qml-open');
  step('the Layers button says one layer is off', /Layers\s*1 off/.test(lb?.textContent || ''), lb?.textContent);
  lb.click(); await until(() => atlas().querySelector('.qml-panel'), 'panel');
  const box = atlas().querySelector('.qml-panel'), sw = (id) => box.querySelector(`input[data-layer="${id}"]`);
  step('the panel shows the same: Nights & shows off, the rest on', !sw('shows').checked && ['places', 'jams', 'quests', 'walks', 'visited'].every((id) => sw(id).checked));
  sw('shows').click(); await until(() => QuestMapFirst.on('shows'), 'shows back on');
  step('one click turns Shows back on (remembered)', store.get('questmap.layers', {}).shows === true);
  await smoke({ shot: (window.SMOKE_TMP || window.SMOKE_SAVES) + '/mapbuttons66-old.png' });
} catch (err) { step('ran to the end', false, err.message); }
out.ok = !fails.length; out.fails = fails;
return JSON.stringify(out, null, 1);
