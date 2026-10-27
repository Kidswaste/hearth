// (round 68, leavesoon68) ⏰ Remind me to leave, by CLICKING (no chat command; it fails if one is used), on the smoke
// run's throwaway profile, offline (no map tiles, saved show responses, nothing sent), with a FAKE CLOCK (the main side's
// one timer and the window's clock jump together: LeaveSoon._test.clock) and Hearth played "in the background" (the
// notification recorder instead of the OS):
//   1. an errand's card has "⏰ Remind me to leave"; with no 📍 pin and no Home, a click asks for Home: the map opens
//      with "Click the map where Home is", a real click there saves Home (this computer only), the reminder is on and
//      the toggle says "⏰ Leave at HH:MM ✓"; its trip / times match leavesoon-core from that Home
//   2. the ✦ tracker lists it under "Leaving soon" ("Leave at …"); the map shows a ⏰ pin and the 🏠 Home pin;
//      Layers has "Leave reminders"
//   3. a show quest's detail has the same toggle; a click turns it on (no Home asked again)
//   4. the clock jumps to just before the errand's reminder: ONE notification "Leave in 10 min for AirPods — about N
//      min …" with Show on map · Snooze 10 min · Dismiss; clicking it opens the item on the map (its pin marked)
//   5. the tracker row now offers Snooze 10 min: a click snoozes it 10 min; at that time it rings again; Dismiss (the
//      notification's button) ends it without bringing Hearth up
//   6. Hearth "closed" past the show's reminder (the clock jumps, the main side reads its file again as at a start):
//      no notification (never late), the tracker shows "Missed" once, then not again
//   7. the weekend card's slots with a place carry the toggle
//   node dev/smoke.js --script dev/checks/leavesoon68.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const root = () => document.querySelector('.qj');
const map = () => root()?.querySelector('.qj-world-layout .qj-atlas');
const hud = () => document.querySelector('.qh-panel');
const btn = (txt, scope) => [...(scope || document).querySelectorAll('button')].find((b) => (typeof txt === 'string' ? b.textContent.trim() === txt : txt.test(b.textContent)));
const N = window.hub.notify;
const shown = async () => (await N.test({})).log.filter((l) => l.shown).map((l) => l.shown);
const ran = async () => (await N.test({})).log.filter((l) => l.ran).map((l) => l.ran);
const list = async () => (await window.hub.leave.op({ op: 'list' })).value.items;
const commands = []; const realTry = Commands.tryRun; Commands.tryRun = function (...a) { commands.push(a[0]); return realTry.apply(this, a); };
const opened = []; window.hub.openExternal = (u) => { opened.push(u); };
const sent = []; const realFetch = window.fetch; window.fetch = function (u, ...a) { const s = String(u?.url || u); if (/^https?:/.test(s)) sent.push(s); return realFetch.call(this, u, ...a); };
const geo = []; try { navigator.geolocation.getCurrentPosition = () => geo.push(1); } catch { /* fine */ }
const click = async (x, y) => { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x, y } }); await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } }); await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } }); };
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
const openHud = async () => { if (hud()) QuestHud.close(); await clickUntil(() => document.querySelector('.qh-chip'), () => hud() && QuestHud.journal().status === 'ok', 'tracker'); await until(() => window.LeaveSoon, 'leavesoon loads with the tracker'); await LeaveSoon.refresh(); await wait(120); };
const MIN = 60e3;

try {
  await N.test({ stub: true, away: true, clear: true });
  try { await window.hub.shows.test({ dev: window.SMOKE_DEV }); } catch { /* the show part needs them */ }
  await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');
  store.set('herepin.pin', null); store.set('leavesoon.home', null);
  step('nothing of it is loaded at start (lazy group: comes with the map code / the tracker)', !window.LeaveSoon && !Lazy.isIn('leavesoon'));
  await Lazy.load('notify');
  await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => root() && QuestJournal.ready(), 'journal');
  await until(() => window.LeaveSoon && window.LeaveSoonCore, 'leavesoon rides in with the map code');
  const K = LeaveSoonCore;
  // (round 69, ratp69) a fixed time of day on the fake clock (tomorrow 15:30): from ~19:15 Paris on, the errand's closing
  // time was tomorrow while the show (+5 h) came first, and steps 5–6 failed by the hour the check ran
  const day0 = new Date(Date.now() + 86400e3); day0.setHours(15, 30, 0, 0);
  const t0 = day0.getTime(); await LeaveSoon._test.clock(t0);
  step('no reminder on: the main side holds no timer', (await window.hub.leave.op({ op: 'test', now: t0 })).value.armed === false);

  // setup (not under test): an errand at Apple Opéra (daily 10–20) and a show 5 h from now
  const shop = ErrandsCore.shop('apple-opera');
  const { result: ec } = await QuestHud.write((d) => ErrandsCore.add(d, { what: 'AirPods', place: { name: shop.name, addr: shop.addr, lat: shop.lat, lon: shop.lon, shop: shop.id }, hours: 'Daily 10:00–20:00' }), 'Errand added.');
  QuestJournal.navigate('world'); await until(() => map(), 'the map');
  await until(() => ShowSync.snap?.shows?.length, 'saved shows');
  const base = ShowSync.snap.shows[0];
  const show = { ...structuredClone(base), id: 'ls68', key: 'ls68', title: 'Leave Test Night', lineup: ['Arlo Test'], start: t0 + 5 * 3600e3, end: 0, dateOnly: false, cancelled: false, venue: { ...base.venue, name: 'Café de la Danse', key: 'cafedeladanse', lat: 48.8535, lon: 2.3722 } };
  ShowSync.snap.shows.push(show);

  // ---------- 1. the errand card: ⏰ Remind me to leave → Home on the map → on ----------
  await openHud();
  await clickUntil(() => hud()?.querySelector(`[data-k="errand:${ec.id}"]`), () => document.querySelector('dialog.er-card[open]'), 'errand card');
  const toggle = await until(() => document.querySelector('dialog.er-card[open] .ls-toggle'), 'the toggle on the errand card');
  step('the errand card has a labelled “⏰ Remind me to leave” toggle, off', toggle.textContent === '⏰ Remind me to leave' && toggle.getAttribute('aria-pressed') === 'false' && !!toggle.title, toggle.title);
  await clickEl(toggle);
  await until(() => map() && map().querySelector('.ls-hint'), 'the map asks for Home');
  step('no pin, no Home: the map opens with “Click the map where Home is” and Cancel', /Click the map where Home is/.test(map().querySelector('.ls-hint').textContent) && !!btn('Cancel', map().querySelector('.ls-hint')) && !document.querySelector('dialog.er-card[open]'));
  map().qjHere.go({ lat: 48.8606, lon: 2.3780 }, 15); await wait(400); // around Oberkampf / Saint-Ambroise
  const mr = map().getBoundingClientRect(), hx = Math.round(mr.left + mr.width * 0.42), hy = Math.round(mr.top + mr.height * 0.58);
  const want = map().qjHere.at(hx, hy);
  await click(hx, hy);
  await until(async () => (await list()).some((it) => it.key === `errand:${ec.id}`), 'the errand reminder is on');
  const home = store.get('leavesoon.home', null);
  step('one real click saved Home exactly there, on this computer only (no GPS, not in the journal)', home && Math.abs(home.lat - want.lat) < 1e-4 && Math.abs(home.lon - want.lon) < 1e-4 && !JSON.stringify(QuestJournal.snapshot()).includes(String(home.lat)) && geo.length === 0, { home, want });
  let it = (await list()).find((x) => x.key === `errand:${ec.id}`);
  const tr = K.travel(home, shop), tg = K.errandTarget(ErrandsCore.parse('Daily 10:00–20:00'), K.now(), tr.min);
  step('its trip and times are worked out from Home (leavesoon-core): be there 20 min before 20:00, leave by …, ring 10 min before', it.travel.text === tr.text && it.from === 'Home' && it.targetAt === tg.at && it.leaveAt === Math.floor((tg.at - tr.min * MIN) / 3e5) * 3e5 && it.notifyAt === Math.max(it.leaveAt - 10 * MIN, it.notifyAt) && it.state === 'on', { travel: it.travel, leave: K.hm(it.leaveAt), notify: K.hm(it.notifyAt) });
  step('the main side holds exactly ONE timer, to that reminder', await (async () => { const st = (await window.hub.leave.op({ op: 'test' })).value; return st.armed && st.next.key === it.key && st.next.due === it.notifyAt; })());

  // ---------- 2. the tracker, the map, Layers ----------
  await openHud();
  const row = await until(() => hud().querySelector(`.ls-hud[data-leave="errand:${ec.id}"]`), 'Leaving soon row');
  step('the ✦ tracker lists it under “Leaving soon”: “Leave at HH:MM” · AirPods · about N min … from Home', /Leaving soon/.test(hud().textContent) && row.textContent.includes(`Leave at ${K.when(it.leaveAt)}`) && row.textContent.includes('AirPods') && row.textContent.includes(it.travel.text), row.textContent);
  QuestHud.close();
  QuestJournal.navigate('world'); await until(() => map(), 'map');
  map().qjHere.go({ lat: (home.lat + shop.lat) / 2, lon: (home.lon + shop.lon) / 2 }, 13); await wait(400);
  await until(() => map()?.querySelector(`[data-place="ls-errand:${ec.id}"]`) && map().querySelector('[data-place="ls-home"]'), 'the ⏰ and 🏠 pins').catch((e) => { throw Error(`${e.message}: layer ${JSON.stringify(LeaveSoon.layer.pins().map((p) => p.id))} · drawn ${JSON.stringify([...map().querySelectorAll('.qj-atlas-pin')].map((b) => b.dataset.place).filter((x) => /^ls|^er/.test(x)))} · on ${QuestMapFirst.on('leave')} · page ${QuestJournal.page}`); });
  step('the map shows a ⏰ pin at the shop and the 🏠 Home pin', /Leave/.test(map().querySelector(`[data-place="ls-errand:${ec.id}"]`).title) && /Home/.test(map().querySelector('[data-place="ls-home"]').title));
  const lb = btn(/Layers/, map());
  await clickUntil(() => btn(/Layers/, map()), () => map().querySelector('.qml-panel'), 'Layers panel');
  step('Layers has “Leave reminders”, on by default', QuestMapFirst.on('leave') && /Leave reminders/.test(map().querySelector('.qml-panel').textContent), map().querySelector('.qml-panel').textContent.slice(0, 300));
  await clickUntil(() => btn(/Layers/, map()), () => !map().querySelector('.qml-panel'), 'Layers panel closes');

  // ---------- 3. a show quest's detail has the toggle too ----------
  const sc = await ShowSync.makeQuest(show);
  QuestJournal.questDetail(sc.quests[0].id);
  const st = await until(() => document.querySelector('.ls-detail .ls-toggle'), 'the toggle in the show quest');
  step('a show quest has “GETTING THERE · ⏰ Remind me to leave”', /GETTING THERE/.test(st.closest('.ls-detail').textContent) && st.textContent === '⏰ Remind me to leave');
  await clickEl(st);
  await until(async () => (await list()).some((x) => x.key === 'show:ls68'), 'the show reminder is on');
  const si = (await list()).find((x) => x.key === 'show:ls68');
  await until(() => document.querySelector('.ls-detail .ls-toggle')?.classList.contains('on'), 'the toggle says on');
  step('one click turns it on (Home isn’t asked again); it counts to the show’s start', si.targetAt === show.start && si.words.startsWith('starts at') && document.querySelector('.ls-detail .ls-toggle').textContent === `⏰ Leave at ${K.when(si.leaveAt)} ✓` && !map()?.querySelector('.ls-hint'), document.querySelector('.ls-detail .ls-toggle').textContent);
  document.querySelector('dialog[open] .qj-dialog-close, dialog[open] button[aria-label="Close"]')?.click(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());

  // ---------- 4. the fake clock: just before the errand's reminder → one notification ----------
  await N.test({ clear: true });
  const due = it.notifyAt; await LeaveSoon._test.clock(due - 1500);
  await until(async () => (await shown()).some((s) => /^Leave in/.test(s.title)), 'the notification', 120);
  let sh = (await shown()).filter((s) => /^Leave in|^Time to leave/.test(s.title));
  step('ONE notification “Leave in 10 min for AirPods — about N min …”, with Show on map · Snooze 10 min · Dismiss', sh.length === 1 && sh[0].title === `Leave in ${Math.round((it.leaveAt - due) / MIN)} min for AirPods — ${it.travel.text}` && JSON.stringify(sh[0].actions) === JSON.stringify(['Show on map', 'Snooze 10 min', 'Dismiss']) && !sh[0].urgency, sh);
  QuestJournal.navigate('adventure'); await wait(200);
  await N.test({ click: { group: `leave:errand:${ec.id}` } });
  await until(() => QuestJournal.page === 'world' && map()?.querySelector(`[data-place="ls-errand:${ec.id}"].ls-look`), 'the item on the map');
  step('clicking the notification opens the item on the map (its ⏰ pin marked)', true);

  // ---------- 5. Snooze 10 min (tracker), rings again, Dismiss (the notification's button) ----------
  await openHud();
  const sn = await until(() => btn('Snooze 10 min', hud().querySelector(`.ls-hud[data-leave="errand:${ec.id}"]`)), 'Snooze in the tracker');
  const tSnooze = K.now();
  await clickEl(sn);
  await until(async () => (await list()).find((x) => x.key === `errand:${ec.id}`).state === 'snoozed', 'snoozed');
  it = (await list()).find((x) => x.key === `errand:${ec.id}`);
  step('the tracker’s Snooze 10 min: snoozed for 10 minutes', Math.abs(it.snoozeUntil - (tSnooze + 10 * MIN)) < 5000, K.hm(it.snoozeUntil));
  QuestHud.close();
  await N.test({ clear: true });
  await LeaveSoon._test.clock(it.snoozeUntil - 1500);
  await until(async () => (await shown()).some((s) => /AirPods/.test(s.title)), 'it rings again', 120);
  step('10 minutes later it rings again', (await shown()).filter((s) => /AirPods/.test(s.title)).length === 1);
  await N.test({ click: { group: `leave:errand:${ec.id}`, action: 2 } });
  await until(async () => (await list()).find((x) => x.key === `errand:${ec.id}`).state === 'dismissed', 'dismissed');
  const r = (await ran()).at(-1);
  step('Dismiss (the notification’s button) ends it, without bringing Hearth up', r?.action === 'Dismiss' && r.go?.quiet === 1);
  const gone = await until(() => QuestJournal.page === 'world' && map() && !map().querySelector(`[data-place="ls-errand:${ec.id}"]`), 'pin gone', 60).catch(() => false);
  step('a dismissed one leaves the map', !!gone, { page: QuestJournal.page, layer: LeaveSoon.layer.pins().map((p) => p.id), items: LeaveSoon.items().map((x) => [x.key, x.state]) });
  step('a dismissed one rings no more: the timer goes to the show', (await window.hub.leave.op({ op: 'test' })).value.next?.key === 'show:ls68');

  // ---------- 6. Hearth closed past the show's reminder → missed, never rung late, shown once ----------
  await N.test({ clear: true });
  await LeaveSoon._test.clock(si.notifyAt + 6 * MIN);
  await window.hub.leave.op({ op: 'test', reload: true }); // read the file again, as a start would
  await wait(1500);
  step('missed while closed: no notification (never rung late)', !(await shown()).some((s) => /Leave Test|Arlo Test/.test(s.title)), await shown());
  await openHud();
  const mrow = await until(() => hud().querySelector('.ls-hud[data-leave="show:ls68"]'), 'the missed row');
  step('the tracker says “Missed · leave at …” once', /Missed · leave at/.test(mrow.textContent), mrow.textContent);
  await openHud();
  step('…and not again', !hud().querySelector('.ls-hud[data-leave="show:ls68"]'));
  QuestHud.close();

  // ---------- 7. the weekend card's slots carry the toggle ----------
  await LeaveSoon._test.clock(null);
  const d0 = new Date(); d0.setHours(18, 0, 0, 0); while (d0.getDay() !== 4) d0.setDate(d0.getDate() + 1);
  WeekendPlanCore.setClock(() => d0.getTime());
  await openHud();
  const wpb = await until(() => [...hud().querySelectorAll('.wp-hud')].find((b) => b.offsetParent), 'Plan my weekend');
  await clickUntil(() => wpb.isConnected ? wpb : [...document.querySelectorAll('.qh-panel .wp-hud')][0], () => document.querySelector('.wp-panel .wp-slot'), 'weekend card');
  const wt = await until(() => document.querySelector('.wp-panel .wp-slot .ls-toggle'), 'a toggle on a slot', 80).catch(() => null);
  step('🗓 Plan my weekend: a slot with a place has “⏰ Remind me to leave”', !!wt && /Remind me to leave|Leave at/.test(wt.textContent), wt?.textContent || [...document.querySelectorAll('.wp-panel .wp-slot')].map((s) => s.textContent).join(' | '));
  WeekendPlan.close(); WeekendPlanCore.setClock(null);

  step('real clicks landed (a miss is a re-render under the pointer, noted)', misses.length <= 2, misses);
  step('no chat command was used', commands.length === 0, commands);
  step('nothing sent on the network, nothing opened in the browser', sent.length === 0 && opened.length === 0, { sent, opened });
} catch (err) { fails.push('crashed: ' + err.message); out.steps.push('✖ ' + err.stack); }
try { await N.test({ stub: false, away: null }); await LeaveSoon?._test?.clock(null); } catch { /* fine */ }
out.fails = fails;
if (fails.length) throw Error(JSON.stringify(out, null, 1));
return JSON.stringify(out, null, 1);
