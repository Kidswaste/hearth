// (round 71, eatnearby71) 🍜 Eat nearby, by CLICKING (no chat command; it fails if one is used), on the smoke run's
// throwaway profile, offline (no map tiles, saved show responses, nothing sent), with a FAKE CLOCK shared by both
// processes (LeaveSoon._test.clock) and the notification recorder (Hearth "away"):
//   1. a show at La Cigale (the saved listings): its card has "🍜 Eat nearby" (its code loads on that click); the list
//      shows Bouillon Pigalle (a few minutes' walk, ★ starred on the map), "Hours unknown"
//   2. Add hours…: typed hours open before doors → "Open before doors"; lunch-only hours → it leaves the list (the empty
//      state says why); back to evening hours
//   3. Go here first: the show's ⏰ reminder turns on with the stop, leave time = start − (trip to the stop + 45 min + the
//      walk to the venue), "✓ First stop", the plan line, the card's toggle; Eat time 60 → 15 min earlier (before rounding)
//   4. the ✦ tracker row says "🍜 Bouillon Pigalle first"; the ring says "🍜 Eat at Bouillon Pigalle first"
//   5. 🎒 Before I go has "🍜 Eat nearby" (the same list, the stop marked); ✓ First stop again → straight to the venue
//   6. Show on map: the Paris map, Food & stops on, the place's pin selected
//   7. 🗓 Plan my weekend's show slot has "🍜 Eat nearby"
//   node dev/smoke.js --script dev/checks/eatnearby71.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info.slice(0, 400) : JSON.stringify(info).slice(0, 400)}`}`); if (!ok) fails.push(name); };
const hud = () => document.querySelector('.qh-panel');
const card = () => document.querySelector('.en-card[open]');
const top = () => [...document.querySelectorAll('dialog.qj-dialog[open]')].at(-1) || null;
const label = (b) => (b.querySelector('.qj-action-text')?.textContent ?? b.textContent).trim();
const btn = (scope, re) => [...(scope?.querySelectorAll('button') || [])].find((b) => (typeof re === 'string' ? label(b) === re : re.test(label(b))));
const N = window.hub.notify;
const shown = async () => (await N.test({})).log.filter((l) => l.shown).map((l) => l.shown);
const item = async (key) => (await window.hub.leave.op({ op: 'list' })).value.items.find((x) => x.key === key);
const toasts = () => document.getElementById('toasts')?.textContent || '';
const commands = []; const realTry = Commands.tryRun; Commands.tryRun = function (...a) { commands.push(a[0]); return realTry.apply(this, a); };
const opened = []; window.hub.openExternal = (u) => { opened.push(u); };
const sent = []; const realFetch = window.fetch; window.fetch = function (u, ...a) { const s = String(u?.url || u); if (/^https?:/.test(s)) sent.push(s); return realFetch.call(this, u, ...a); };
const click = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1 } }); };
const clickEl = async (n) => { n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); await click(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)); };
const misses = [];
const clickUntil = async (get, ok, what) => {
  for (let i = 0; i < 4; i++) {
    const n = get(); if (!n) { await wait(300); continue; }
    await clickEl(n);
    for (let k = 0; k < 30; k++) { if (await ok()) return true; await wait(60); }
    misses.push(what);
  }
  throw Error(`timed out: ${what}`);
};
const openHud = async () => { if (hud()) QuestHud.close(); await clickUntil(() => document.querySelector('.qh-chip'), () => hud() && QuestHud.journal().status === 'ok', 'tracker'); await until(() => window.LeaveSoon, 'leavesoon'); await LeaveSoon.refresh(); await wait(150); };
const shot = (n) => smoke({ shot: `${window.SMOKE_TMP || window.SMOKE_SAVES}/eatnearby71-${n}.png` });
const MIN = 60e3;
const floor5 = (ms) => Math.floor(ms / 3e5) * 3e5;
const row = (id) => card()?.querySelector(`.en-row[data-id="${id}"]`);
const BP = 'pp-bouillon-pigalle';
const typeHours = async (r, text) => {
  await clickEl(btn(r, /^(Add hours…|Hours…)$/));
  const inp = await until(() => [...document.querySelectorAll('dialog[open] .modal-fields input')].at(-1), 'the hours box');
  inp.value = text; inp.dispatchEvent(new Event('input', { bubbles: true }));
  await clickEl(btn(inp.closest('dialog'), 'Save'));
  await until(() => !inp.isConnected || !inp.closest('dialog[open]'), 'the hours box closes');
};

try {
  await N.test({ stub: true, away: true, clear: true });
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable');
  await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');
  store.set('herepin.pin', null); store.set('eatnearby.hours', null); store.set('eatnearby.eat', null);
  const HOME = { lat: 48.8606, lon: 2.3780, at: Date.now() }; store.set('leavesoon.home', HOME); // (setup: round 68's check clicks it on the map)
  step('🍜 isn’t loaded at start (its own lazy group: on the first click)', !window.EatNearby && !Lazy.isIn('eatnearby'));
  await Lazy.load('notify'); await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => QuestJournal.ready(), 'journal');
  await until(() => window.LeaveSoon && window.LeaveSoonCore, 'leavesoon rides in with the map code');
  const K = LeaveSoonCore;
  // ★ Bouillon Pigalle on the map (the owner's star; setup through the journal, as the place panel's star does)
  await QuestJournal.paris.mutate((s) => { const p = QuestParis.ensurePin(s, BP); p.favorite = true; }, '');

  // ---------- 1. the show's card ----------
  QuestJournal.navigate('world'); await ShowSync.ensure();
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  const load = await until(() => btn(top(), 'Load this week’s shows') || top()?.querySelector('.ss-row'), 'the shows dialog');
  if (load.tagName === 'BUTTON') load.click(); // (the saved sample pages: shows:test, no network)
  const listed = (await until(() => { const r = [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')]; return r.length && r; }, 'the week’s shows', 340)).map((r) => r.textContent);
  const bpG = QuestParis.byId(BP);
  const shows = ShowSync.upcoming().filter((s) => !s.dateOnly && Number.isFinite(s.start) && !s.cancelled && listed.some((x) => x.includes(s.title)));
  const show = shows.find((s) => { const sp = LeaveSoon.showSpec(s); return sp.can && K.walkMin(K.metres(sp.place, bpG)) <= 10; });
  if (!show) throw Error(`no listed show near Bouillon Pigalle: ${JSON.stringify(shows.map((s) => s.venue.name).slice(0, 8))}`);
  const venue = LeaveSoon.showSpec(show).place, walk = K.walkMin(K.metres(venue, bpG)), key = `show:${show.key}`;
  await LeaveSoon._test.clock(show.start - 4 * 3600e3);
  const openShow = async () => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click(); (await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => r.textContent.includes(show.title)), `row ${show.title}`)).click(); return until(() => btn(top(), '🍜 Eat nearby'), 'the 🍜 button on the card'); };
  const eb = await openShow();
  step('the show card has a labelled “🍜 Eat nearby” beside 🎒 Before I go and ⏰', !!eb.title && !!btn(top(), '🎒 Before I go') && !!btn(top(), /Remind me to leave|Leave at/), [...top().querySelectorAll('.qj-actions button')].map(label));
  await clickEl(eb);
  await until(() => row(BP), 'the list with Bouillon Pigalle');
  const r1 = row(BP);
  step(`Bouillon Pigalle: ★, ${walk} min walk, “Hours unknown” (the guide has none), Show on map · Go here first · Add hours…`, /★/.test(r1.textContent) && r1.textContent.includes(`${walk} min walk`) && /Hours unknown/.test(r1.textContent) && !!btn(r1, 'Show on map') && !!btn(r1, 'Go here first') && !!btn(r1, 'Add hours…'), r1.textContent);
  step('every row is within ~10 min walk; the header says the venue and the time', EatNearby.state().rows.every((r) => r.walk <= 10) && card().querySelector('.en-when').textContent.includes(venue.name), EatNearby.state());
  await shot('list');

  // ---------- 2. Add hours… ----------
  await typeHours(row(BP), 'Daily 11:30–23:00');
  await until(() => /Open before doors/.test(row(BP)?.textContent || ''), 'open before doors');
  step('typed hours (Daily 11:30–23:00) → “Open before doors”, kept on this computer', /Open before doors/.test(row(BP).textContent) && store.get('eatnearby.hours', {})[BP] === 'Daily 11:30–23:00');
  await typeHours(row(BP), 'Daily 12:00–14:30');
  await until(() => !row(BP), 'it leaves the list');
  step('lunch-only hours → it leaves the list; the empty state says why', !row(BP) && (EatNearby.state().rows.length > 0 || /No food stop .* open before doors/.test(card().textContent)), card().textContent.slice(0, 200));
  store.set('eatnearby.hours', { [BP]: 'Daily 18:00–23:30' }); EatNearby.close(); await clickEl(await openShow());
  await until(() => row(BP), 'back in the list');

  // ---------- 3. Go here first ----------
  step('the reminder is off before', !(await item(key)));
  await clickEl(btn(row(BP), 'Go here first'));
  const it1 = await until(async () => { const x = await item(key); return x?.stop && x; }, 'the reminder with its stop');
  const tr = K.travel(HOME, bpG);
  step('Go here first: ⏰ on, the trip goes to the stop, leave = start − (trip + 45 min + walk to the venue)', it1.stop.id === BP && it1.stop.eatMin === 45 && it1.stop.walkMin === walk && it1.leaveAt === floor5(show.start - (it1.travel.min + 45 + walk) * MIN) && Math.abs(it1.travel.min - tr.min) <= 15, { leave: K.hm(it1.leaveAt), travel: it1.travel.text, stop: it1.stop });
  await until(() => /eat at Bouillon Pigalle first/.test(toasts()), 'the note', 60).catch(() => null);
  step('the note says it: “… eat at Bouillon Pigalle first (45 min, then N min walk)”', /eat at Bouillon Pigalle first \(45 min, then \d+ min walk\)/.test(toasts()), toasts().slice(-260));
  await until(() => btn(row(BP), '✓ First stop'), 'marked');
  step('the row says “✓ First stop”, and the plan line “⏰ Leave at …”', !!btn(row(BP), '✓ First stop') && new RegExp(`Leave at ${K.hm(it1.leaveAt)}`).test(card().querySelector('.en-plan')?.textContent || ''), card().querySelector('.en-plan')?.textContent);
  const tg = top() && btn(top(), /Leave at/);
  step('the card’s ⏰ toggle shows the earlier time', !!tg && tg.textContent.includes(K.hm(it1.leaveAt)), tg?.textContent || [...(top()?.querySelectorAll('button') || [])].map(label));
  const sel = card().querySelector('select.en-eat'); sel.value = '60'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  const it2 = await until(async () => { const x = await item(key); return x?.stop?.eatMin === 60 && x; }, 'eat time 60');
  step('Eat time 60 min: the reminder follows (leave = start − (trip + 60 + walk)), remembered', it2.leaveAt === floor5(show.start - (it2.travel.min + 60 + walk) * MIN) && it2.leaveAt < it1.leaveAt && store.get('eatnearby.eat', 0) === 60, { before: K.hm(it1.leaveAt), after: K.hm(it2.leaveAt) });
  await shot('first');

  // ---------- 4. the tracker and the ring ----------
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await openHud();
  const hr = await until(() => hud().querySelector(`.ls-hud[data-leave="${key}"]`), 'the tracker row');
  step('✦ tracker: “Leave at … · 🍜 Bouillon Pigalle first”', /🍜 Bouillon Pigalle first/.test(hr.textContent), hr.textContent);
  QuestHud.close();
  await LeaveSoon._test.clock(it2.notifyAt - 1000);
  await until(async () => (await shown()).some((s) => /Bouillon Pigalle/.test(s.body || '')), 'it rings', 160);
  const n = (await shown()).find((s) => /Bouillon Pigalle/.test(s.body || ''));
  step('the ring: “Leave in 10 min for …” with “🍜 Eat at Bouillon Pigalle first (60 min, …)”', /^Leave in 10 min for /.test(n.title) && /🍜 Eat at Bouillon Pigalle first \(60 min/.test(n.body), n);
  await N.test({ clear: true });
  await LeaveSoon._test.clock(show.start - 4 * 3600e3);
  // (it rang: put it back to waiting, as a re-plan from the list does)

  // ---------- 5. 🎒 Before I go → 🍜 Eat nearby; ✓ First stop again → straight there ----------
  await clickEl(btn(await (async () => { await openShow(); return top(); })(), '🎒 Before I go'));
  const bgc = await until(() => document.querySelector('.bg-card[open]'), 'the 🎒 list');
  const be = await until(() => btn(bgc, '🍜 Eat nearby'), 'its 🍜 button');
  await clickEl(be);
  await until(() => row(BP) && btn(row(BP), '✓ First stop'), 'the list from 🎒, the stop marked');
  step('🎒 Before I go → “🍜 Eat nearby”: the same list, the stop marked “✓ First stop”', !document.querySelector('.bg-card[open]') && !!btn(row(BP), '✓ First stop'));
  await clickEl(btn(row(BP), '✓ First stop'));
  const it3 = await until(async () => { const x = await item(key); return x && !x.stop && x; }, 'stop removed');
  await until(() => btn(row(BP), 'Go here first'), 'unmarked').catch(() => null);
  step('✓ First stop again: straight to the venue (no stop, the plain leave time)', it3.leaveAt === floor5(show.start - it3.travel.min * MIN) && it3.leaveAt > it2.leaveAt && !!btn(row(BP), 'Go here first'), { leave: K.hm(it3.leaveAt), before: K.hm(it2.leaveAt), travel: it3.travel.min, row: row(BP)?.textContent });

  // ---------- 6. Show on map ----------
  if (window.QuestMapFirst?.on('places')) await QuestMapFirst.toggle('places'); // off: Show on map turns it back on
  await clickEl(btn(row(BP), 'Show on map'));
  await until(() => !card() && QuestJournal.page === 'world' && QuestJournal.paris.ui().state()?.atlas.selected === QuestParis.pinOf(QuestJournal.paris.ui().state(), BP)?.id, 'the map on the place');
  step('Show on map: the list closes, the Paris map, Food & stops on, its pin selected', !card() && QuestMapFirst.on('places') && !document.querySelector('dialog.qj-dialog[open]'));
  await shot('map');

  // ---------- 7. the weekend's show slot ----------
  await LeaveSoon._test.clock(null);
  // a Thursday 18:00 whose weekend (Fri–Sun) has one of the saved shows
  const wk = ShowSync.upcoming().find((s) => !s.dateOnly && !s.cancelled && Number.isFinite(s.start) && [5, 6, 0].includes(new Date(s.start).getDay()) && s.start > Date.now());
  const d0 = new Date(wk ? wk.start : Date.now()); d0.setHours(18, 0, 0, 0); while (d0.getDay() !== 4) d0.setDate(d0.getDate() - 1);
  WeekendPlanCore.setClock(() => d0.getTime());
  await openHud();
  const wpb = await until(() => [...hud().querySelectorAll('.wp-hud')].find((b) => b.offsetParent), 'Plan my weekend', 80).catch(() => null);
  if (wpb && wk) {
    await clickUntil(() => wpb.isConnected ? wpb : [...document.querySelectorAll('.qh-panel .wp-hud')][0], () => document.querySelector('.wp-panel .wp-slot'), 'weekend card');
    const we = await until(() => document.querySelector('.wp-panel .wp-slot .wp-eat'), 'a 🍜 on the show slot', 60).catch(() => null);
    step('🗓 Plan my weekend: the show slot has “🍜 Eat nearby”, which opens the list', !!we && await (async () => { await clickEl(we); return !!(await until(() => card(), 'the list from the weekend', 80).catch(() => null)); })(), we ? we.textContent : [...document.querySelectorAll('.wp-panel .wp-slot')].map((s) => s.textContent).join(' | '));
    EatNearby.close(); WeekendPlan.close();
  } else step('🗓 Plan my weekend (skipped: the saved shows aren’t on a weekend from this test’s date)', true);
  WeekendPlanCore.setClock(null);

  step('real clicks landed (a miss is a re-render under the pointer, noted)', misses.length <= 2, misses);
  step('no chat command was used', commands.length === 0, commands);
  step('nothing sent, nothing opened', sent.length === 0 && opened.length === 0, { sent, opened });
} catch (err) {
  step(`crashed: ${err.message}`, false, err.stack?.split('\n').slice(0, 3).join(' | '));
} finally {
  try { await LeaveSoon?._test.clock(null); } catch { /* gone */ }
  try { await N.test({ stub: false, away: false, clear: true }); } catch { /* gone */ }
}
out.pass = fails.length === 0; out.fails = fails;
return JSON.stringify(out, null, 1);
