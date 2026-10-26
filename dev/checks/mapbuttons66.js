// (round 66, mapbuttons66) The Paris map's + / − are never under a toolbar, and every map layer is on by default with a
// visible Layers button. CLICKS ONLY (no chat command). Fresh, isolated profile; offline tiles; saved Shotgun / DICE.
//  1. Controls: at 1280×720 and 2560×1440 the page is scrolled so Sidequest Studio's sticky tab bar (Today · Map ·
//     Progress + its rows) lies over the map's top-left corner, then a fixed project-style tab strip is added on top:
//     each time document.elementFromPoint at the centre of + and − must return that button, and a REAL mouse click
//     (CDP Input) at that point must change the zoom. Screenshots per size.
//  2. Layers: one "Layers" button in the map's strip opens a panel with a labelled switch per layer, all on; Park jams
//     are on the map at the city zoom, Paris place quests appear when zoomed in (the city zoom stays quiet), clicking
//     one opens its quest; switches hide / show and are remembered; Esc / Done close the panel.
//  3. An existing journal from round 64 (the whole guide stored, untouched): its places are drawn once each, not twice.
// The "older saved layer settings" case is dev/checks/mapbuttons66-old.js (settings must be stored before the map loads).
//   node dev/smoke.js --script dev/checks/mapbuttons66.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const root = () => document.querySelector('.qj');
const atlas = () => root().querySelector('.qj-atlas');
const S = () => QuestJournal.snapshot();
const pinIds = (sel = '') => [...root().querySelectorAll('.qj-atlas .qj-atlas-pin' + sel)].map((b) => b.dataset.place);
const JAMS = ['ml-pp-montsouris', 'ml-pp-belleville-view'], questPins = () => pinIds('[data-place^="ml-"]').filter((id) => !JAMS.includes(id));
const ctl = (label) => [...atlas().querySelectorAll('.qj-atlas-controls button')].find((b) => b.getAttribute('aria-label') === label || b.textContent.trim() === label);
const panel = () => atlas().querySelector('.qml-panel');
const sw = (id) => panel()?.querySelector(`input[data-layer="${id}"]`);
const shots = window.SMOKE_TMP || window.SMOKE_SAVES;
const commands = []; const realTry = Commands.tryRun; Commands.tryRun = function (...a) { commands.push(a[0]); return realTry.apply(this, a); };
const centre = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
const hits = (el) => { const c = centre(el), e = document.elementFromPoint(c.x, c.y); return { ok: !!e && (e === el || el.contains(e)), at: e ? `${e.tagName}.${String(e.className?.baseVal ?? e.className).slice(0, 40)}` : null, ...c }; };
const realClick = async (el) => { const { x, y } = centre(el); for (const type of ['mousePressed', 'mouseReleased']) await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1 } }); await frames(2); };
const scroller = (n) => { for (let x = n.parentElement; x; x = x.parentElement) { const o = getComputedStyle(x).overflowY; if ((o === 'auto' || o === 'scroll') && x.scrollHeight > x.clientHeight) return x; } return document.scrollingElement; };

try {
  await window.hub.shows.test({ dev: window.SMOKE_DEV });
  await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => root() && QuestJournal.ready(), 'journal');
  QuestJournal.navigate('world');
  await until(() => atlas(), 'map');
  await until(() => pinIds('.qj-pin-guide').length >= 6, 'food stops seeded');
  await wait(400);

  // ---------- 1. the + / − buttons, whatever bar is over the map ----------
  const sizes = [[1280, 720], [2560, 1440]];
  for (const [w, h] of sizes) {
    await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: w, height: h, deviceScaleFactor: 1, mobile: false } });
    await until(() => innerWidth === w, `${w}px viewport`); await frames(3);
    // a longer page (as with My Paris / a long footer) so the map can be scrolled under the tab bar at both sizes
    const spacer = document.createElement('div'); spacer.style.height = h + 'px'; spacer.className = 'mb66-spacer'; root().querySelector('.qj-content').append(spacer);
    const nav = root().querySelector('.qj-command-nav'), sc = scroller(atlas());
    step(`${w}×${h}: the tab bar is sticky (the thing that covered + / −)`, !!nav && getComputedStyle(nav).position === 'sticky', nav && getComputedStyle(nav).position);
    // unscrolled: the controls sit where they always did
    sc.scrollTop = 0; await frames(3);
    step(`${w}×${h}: nothing over the map → the controls stay at their own place`, (atlas().dataset.clear || '0') === '0' || atlas().getBoundingClientRect().top < nav.getBoundingClientRect().bottom, atlas().dataset.clear);
    // scrolled so the sticky bar's bottom is 80 px into the map
    for (let i = 0; i < 4; i++) { sc.scrollTop += atlas().getBoundingClientRect().top - (nav.getBoundingClientRect().bottom - 80); await frames(2); } // (the bar sticks as it scrolls: settle)
    await frames(3);
    const mapTop = atlas().getBoundingClientRect().top, navNow = nav.getBoundingClientRect().bottom;
    const natural = document.elementFromPoint(atlas().getBoundingClientRect().left + 26, mapTop + 26);
    step(`${w}×${h}: scrolled, the tab bar really lies over the controls' own corner (the bug's setup)`, navNow > mapTop + 40 && !!natural && !atlas().contains(natural), { mapTop: Math.round(mapTop), navBottom: Math.round(navNow) });
    const box = ctl('Zoom in').parentElement, moved = box.style.transform; box.style.transform = ''; const before = hits(ctl('Zoom in')); box.style.transform = moved;
    step(`${w}×${h}: without this fix, + would be covered (elementFromPoint finds the tab bar)`, !before.ok, before);
    for (const label of ['Zoom in', 'Zoom out']) { const r = hits(ctl(label)); step(`${w}×${h}: ${label} is the element at its centre (under the tab bar)`, r.ok && r.y > navNow, { ...r, navBottom: Math.round(navNow) }); }
    let z0 = Number(atlas().dataset.zoom); await realClick(ctl('Zoom in')); const z1 = Number(atlas().dataset.zoom); await realClick(ctl('Zoom out'));
    step(`${w}×${h}: a real mouse click on + zooms in, on − zooms out`, z1 === z0 + 1 && Number(atlas().dataset.zoom) === z0, { z0, z1, after: atlas().dataset.zoom });
    document.querySelectorAll('.toast').forEach((n) => n.remove());
    await smoke({ shot: `${shots}/mapbuttons66-${w}x${h}-tabbar.png` });
    // a project / workspace tab strip on top of everything (fixed, 150 px): the controls go under it too
    const strip = document.createElement('div'); strip.className = 'mb66-tabstrip'; strip.textContent = 'Project tabs (test)';
    const ar = atlas().getBoundingClientRect(); strip.style.cssText = `position:fixed;left:0;right:0;top:${Math.max(0, Math.round(ar.top) - 20)}px;height:150px;z-index:40;background:#3a2a55;color:#fff;font:14px system-ui;padding:8px`;
    document.body.append(strip); window.dispatchEvent(new Event('resize')); await frames(4);
    for (const label of ['Zoom in', 'Zoom out']) { const r = hits(ctl(label)); step(`${w}×${h}: ${label} clear of a fixed project tab strip too`, r.ok && r.y > strip.getBoundingClientRect().bottom, r); }
    z0 = Number(atlas().dataset.zoom); await realClick(ctl('Zoom in')); step(`${w}×${h}: + still clicks under the project tab strip`, Number(atlas().dataset.zoom) === z0 + 1, atlas().dataset.zoom); await realClick(ctl('Zoom out'));
    await smoke({ shot: `${shots}/mapbuttons66-${w}x${h}-projectstrip.png` });
    strip.remove(); sc.scrollTop = 0; spacer.remove(); window.dispatchEvent(new Event('resize')); await frames(4);
    step(`${w}×${h}: back at the top, the controls return to their place`, (atlas().dataset.clear || '0') === '0', atlas().dataset.clear);
  }
  await smoke({ cdp: 'Emulation.clearDeviceMetricsOverride', params: {} }); await frames(3);

  // ---------- 2. Layers: one button, a labelled switch per layer, all on ----------
  const lb = atlas().querySelector('.qmf-strip .qml-open');
  step('a "Layers" button in the map strip, labelled', !!lb && lb.textContent.trim() === 'Layers' && lb.getBoundingClientRect().width > 40, lb?.textContent);
  lb.click(); await until(() => panel(), 'layers panel');
  const names = [...panel().querySelectorAll('.qml-name')].map((n) => n.textContent.replace(/\s*\(\d+\)$/, ''));
  step('the panel names every layer', ['Food & stops', 'Nights & shows', 'Park jams', 'Paris place quests', 'My walks', 'Visited · My Paris', 'Whole guide when zoomed out'].every((n) => names.includes(n)), names);
  step('fresh profile: every layer is on by default', ['places', 'shows', 'jams', 'quests', 'walks', 'visited'].every((id) => sw(id)?.checked) && !sw('full').checked, ['places', 'shows', 'jams', 'quests', 'walks', 'visited', 'full'].map((id) => `${id}:${sw(id)?.checked}`));
  { const a = hits(ctl('Zoom in')), b = hits(ctl('Zoom out')); step('with the Layers panel open, + and − are still clear', a.ok && b.ok, { a, b }); }
  step('the strip chips still say the same', ['places', 'shows', 'walks', 'visited'].every((id) => atlas().querySelector(`.qmf-chip[data-layer="${id}"]`)?.getAttribute('aria-pressed') === 'true'));
  await smoke({ shot: `${shots}/mapbuttons66-layers.png` });
  // Park jams at the city zoom; place quests only from QUEST_ZOOM (Codex's quiet city zoom kept)
  ctl('Paris').click(); await frames(3);
  const jams = pinIds('[data-place^="ml-"]');
  step('city zoom: Park jams are on the map (outdoor music parks), quiet otherwise', jams.includes('ml-pp-montsouris') && jams.includes('ml-pp-belleville-view') && jams.every((id) => /montsouris|belleville/.test(id)) && !pinIds('[data-place="pp-sainte-chapelle"]').length, jams);
  sw('jams').click(); await until(() => !pinIds('[data-place^="ml-pp-montsouris"]').length, 'jams off');
  step('Park jams switch off → gone, remembered on this computer', store.get('questmap.layers', {}).jams === false && !panel()?.querySelector('input[data-layer="jams"]')?.checked);
  sw('jams').click(); await until(() => pinIds('[data-place="ml-pp-montsouris"]').length, 'jams on');
  step('Park jams switch on → back', store.get('questmap.layers', {}).jams === true);
  for (let i = 0; i < QuestMapFirst.QUEST_ZOOM - 12; i++) { ctl('Zoom in').click(); await frames(1); }
  await until(() => questPins().length >= 3, 'place quests when zoomed in');
  step('zoomed in: Paris place quests appear (labelled, on by default)', questPins().length >= 3, questPins().length);
  const dupes = (ids) => ids.filter((id, i) => ids.indexOf(id) !== i);
  step('no place drawn twice (journal pin + layer pin)', !dupes(pinIds().map((id) => id.replace(/^ml-/, ''))).length, dupes(pinIds().map((id) => id.replace(/^ml-/, ''))));
  await smoke({ shot: `${shots}/mapbuttons66-quests-zoomed.png` });
  sw('quests').click(); await until(() => !questPins().length, 'quests off');
  step('Paris place quests switch off → gone', store.get('questmap.layers', {}).quests === false);
  sw('quests').click(); await until(() => questPins().length, 'quests on');
  // Esc closes; the Done button closes; the Layers button reopens
  document.activeElement?.blur?.(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await until(() => !panel(), 'Esc closes');
  step('Esc closes the panel', !panel() && !QuestMapFirst.panelOpen);
  atlas().querySelector('.qml-open').click(); await until(() => panel(), 'reopen');
  [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Done').click(); await until(() => !panel(), 'Done closes');
  step('Done closes it; the Layers button opens it again', !panel());
  // a place quest pin → its quest in the panel (pinned in the journal like Start this quest)
  const qpin = root().querySelector(`.qj-atlas-pin[data-place="${questPins()[0]}"]`), gid = qpin.dataset.place.slice(3);
  qpin.click();
  await until(() => S().atlas.selected === gid || QuestParis.pinOf(S(), gid)?.id === S().atlas.selected, 'quest pin selected');
  await until(() => root().querySelector('.qj-paris-quest'), 'its quest card');
  step('clicking a place quest opens its quest (Start this quest)', !!root().querySelector('.qj-paris-quest') && /Start this quest|Continue/.test(root().querySelector('.qj-paris-quest').textContent), gid);
  step('…drawn once (the journal pin, no layer twin)', pinIds().filter((id) => id.replace(/^ml-/, '') === gid).length === 1, pinIds().filter((id) => id.replace(/^ml-/, '') === gid));

  // ---------- 3. a round-64 journal: the whole guide stored untouched → each place drawn once ----------
  await QuestJournal.mutate((s) => { QuestParis.addGuide(s); }, '');
  await frames(3);
  const ids = pinIds(), plain = ids.map((id) => id.replace(/^ml-/, ''));
  step('round-64 journal (whole guide stored): no place drawn twice', !dupes(plain).length, dupes(plain));
  step('…its untouched places are on the map as place quests when zoomed in', questPins().length >= 3, questPins().length);
  ctl('Paris').click(); await frames(3);
  step('…and the city zoom stays quiet (Codex’s generic landmarks hidden)', !pinIds('[data-place$="pp-sainte-chapelle"]').length && !pinIds('[data-place$="pp-bourse-commerce"]').length);

  step('no chat command was used', commands.length === 0, commands);
} catch (err) { step('ran to the end', false, err.message); }
out.ok = !fails.length; out.fails = fails;
return JSON.stringify(out, null, 1);
