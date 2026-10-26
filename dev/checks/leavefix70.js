// (round 70, leavefix70) leave reminders at awkward times of day + 🎒 Before I go, by CLICKING (no chat command; it fails if
// one is used), on the smoke run's throwaway profile, offline (no map tiles, saved show responses, nothing sent), with a
// FAKE CLOCK shared by both processes (LeaveSoon._test.clock) and the notification recorder (Hearth "away" or in front):
//   1. an errand (Daily 10–20) turned on 3 minutes before today's leave time: it stays TODAY (it used to roll to tomorrow)
//      and rings at once; Dismiss in the ✦ tracker; then the old notification's "Snooze 10 min" doesn't bring it back, and
//      11 minutes later nothing rings
//   2. an errand turned on at 19:30 (too late today): the note and the toggle say "tomorrow"
//   3. a show's card: "🎒 Before I go" (its code loads on that click): 🎟 Ticket with "🎟 Add my ticket", Phone charged,
//      Earplugs, ID, Card / cash, 🧥 Jacket from the cached forecast (a fixture: nothing fetched); ticks stay with the show
//      (closed and opened again), "Edit my list…" changes it for every show; a ticket added → "🎟 Open my ticket" opens
//      the bright view; another show starts with nothing ticked
//   4. the show's ⏰ reminder rings (Hearth away): "🎒 Before I go" · Snooze 10 min · Dismiss; a click on it opens the list
//      with the reminder's words and buttons (ticks kept); Snooze there; with Hearth in front the list opens by itself
//      when it rings again; Dismiss there ends it
//   5. a show at 00:05, Hearth "closed" past its reminder: the tracker's missed row says "leave at yesterday 23:…"
//   node dev/smoke.js --script dev/checks/leavefix70.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info.slice(0, 400) : JSON.stringify(info).slice(0, 400)}`}`); if (!ok) fails.push(name); };
const hud = () => document.querySelector('.qh-panel');
const card = () => document.querySelector('.bg-card');
const top = () => [...document.querySelectorAll('dialog.qj-dialog[open]')].at(-1) || null;
const label = (b) => (b.querySelector('.qj-action-text')?.textContent ?? b.textContent).trim();
const btn = (scope, re) => [...(scope?.querySelectorAll('button') || [])].find((b) => (typeof re === 'string' ? label(b) === re : re.test(label(b))));
const N = window.hub.notify;
const shown = async () => (await N.test({})).log.filter((l) => l.shown).map((l) => l.shown);
const list = async () => (await window.hub.leave.op({ op: 'list' })).value.items;
const item = async (key) => (await list()).find((x) => x.key === key);
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
const shot = (n) => smoke({ shot: `${window.SMOKE_TMP || window.SMOKE_SAVES}/leavefix70-${n}.png` });
const MIN = 60e3;
const floor5 = (ms) => Math.floor(ms / 3e5) * 3e5;
const rowTexts = () => [...(card()?.querySelectorAll('.bg-row') || [])].map((r) => r.textContent.trim());
const tickRow = async (re) => { const r = [...card().querySelectorAll('.bg-row')].find((x) => re.test(x.textContent)); await clickEl(r.querySelector('input')); await until(() => [...card().querySelectorAll('.bg-row')].find((x) => re.test(x.textContent))?.classList.contains('done'), `ticked ${re}`); };

try {
  await N.test({ stub: true, away: true, clear: true });
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable');
  await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');
  store.set('herepin.pin', null); store.set('beforego.list', null); store.set('beforego.ticks', null);
  const HOME = { lat: 48.8606, lon: 2.3780, at: Date.now() }; store.set('leavesoon.home', HOME); // (setup: round 68's check clicks it on the map)
  step('🎒 isn’t loaded at start (its own lazy group: on the first click / ring)', !window.BeforeGo && !Lazy.isIn('beforego'));
  await Lazy.load('notify'); await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => QuestJournal.ready(), 'journal');
  await until(() => window.LeaveSoon && window.LeaveSoonCore, 'leavesoon rides in with the map code');
  const K = LeaveSoonCore;
  const shop = ErrandsCore.shop('apple-opera'), tr = K.travel(HOME, shop);

  // ---------- 1. 3 minutes before today's leave time: today, rings at once; Dismiss; the old Snooze; nothing after ----------
  const day = new Date(Date.now() + 86400e3); day.setHours(19, 40, 0, 0); const goal = day.getTime(), leaveToday = floor5(goal - tr.min * MIN);
  await LeaveSoon._test.clock(leaveToday - 3 * MIN);
  const { result: e1 } = await QuestHud.write((d) => ErrandsCore.add(d, { what: 'AirPods', place: { name: shop.name, addr: shop.addr, lat: shop.lat, lon: shop.lon, shop: shop.id }, hours: 'Daily 10:00–20:00' }), 'Errand added.');
  await openHud();
  await clickUntil(() => hud()?.querySelector(`[data-k="errand:${e1.id}"]`), () => document.querySelector('dialog.er-card[open] .ls-toggle'), 'errand card');
  await clickEl(document.querySelector('dialog.er-card[open] .ls-toggle'));
  const k1 = `errand:${e1.id}`;
  const r1 = await until(() => item(k1), 'on');
  step('3 min before today’s leave time: TODAY’s closing (it used to roll to tomorrow), ringing at once', r1.targetAt === goal && r1.leaveAt === leaveToday && r1.notifyAt - (leaveToday - 3 * MIN) < 5000, { target: K.when(r1.targetAt, K.now()), leave: K.hm(r1.leaveAt) });
  await until(async () => (await shown()).some((s) => /AirPods/.test(s.title)), 'it rings', 120);
  const n1 = (await shown()).filter((s) => /AirPods/.test(s.title));
  step('ONE notification “Leave in 3 min for AirPods …” (an errand keeps Show on map · Snooze 10 min · Dismiss)', n1.length === 1 && /^Leave in 3 min for AirPods/.test(n1[0].title) && JSON.stringify(n1[0].actions) === JSON.stringify(['Show on map', 'Snooze 10 min', 'Dismiss']), n1);
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await openHud();
  const dm = await until(() => btn(hud().querySelector(`.ls-hud[data-leave="${k1}"]`), 'Dismiss'), 'Dismiss in the tracker');
  await clickEl(dm);
  await until(async () => (await item(k1)).state === 'dismissed', 'dismissed');
  QuestHud.close();
  await N.test({ click: { group: `leave:${k1}`, action: 1 } }); await wait(500); // the old notification's Snooze 10 min, clicked late
  step('the old notification’s “Snooze 10 min” after Dismiss: still dismissed (it used to come back and ring)', (await item(k1)).state === 'dismissed', (await item(k1)).state);
  await N.test({ clear: true });
  await LeaveSoon._test.clock(K.now() + 11 * MIN); await wait(1500);
  step('11 minutes later: nothing rings, no timer for it', !(await shown()).some((s) => /AirPods/.test(s.title)) && (await window.hub.leave.op({ op: 'test' })).value.next?.key !== k1);

  // ---------- 2. at 19:30 (too late today): "tomorrow" in the note and on the toggle ----------
  const at1930 = new Date(goal); at1930.setHours(19, 30, 0, 0);
  await LeaveSoon._test.clock(at1930.getTime());
  const { result: e2 } = await QuestHud.write((d) => ErrandsCore.add(d, { what: 'Strings', place: { name: shop.name, addr: shop.addr, lat: shop.lat, lon: shop.lon, shop: shop.id }, hours: 'Daily 10:00–20:00' }), 'Errand added.');
  const k2 = `errand:${e2.id}`;
  await openHud();
  await clickUntil(() => hud()?.querySelector(`[data-k="${k2}"]`), () => document.querySelector('dialog.er-card[open] .ls-toggle'), 'errand card 2');
  await clickEl(document.querySelector('dialog.er-card[open] .ls-toggle'));
  const r2 = await until(() => item(k2), 'on 2');
  const tg2 = await until(() => { const b = document.querySelector('dialog.er-card[open] .ls-toggle'); return b?.classList.contains('on') && b; }, 'toggle on');
  step('too late today: tomorrow’s closing, and the note says “I’ll remind you tomorrow at … it closes at 20:00”', r2.targetAt === new Date(goal).setDate(new Date(goal).getDate() + 1) && /I’ll remind you tomorrow at \d\d:\d\d to leave at \d\d:\d\d \(.*it closes at 20:00\)/.test(toasts()), toasts().slice(-260));
  step('the toggle reads “⏰ Leave at tomorrow HH:MM ✓”', /^⏰ Leave at tomorrow \d\d:\d\d ✓$/.test(tg2.textContent), tg2.textContent);
  await clickEl(tg2); await until(async () => !(await item(k2)), 'turned off');
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());

  // ---------- 3. a show's card: 🎒 Before I go ----------
  QuestJournal.navigate('world'); await ShowSync.ensure();
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  const load = await until(() => btn(top(), 'Load this week’s shows') || top()?.querySelector('.ss-row'), 'the shows dialog');
  if (load.tagName === 'BUTTON') load.click(); // (the saved sample pages: shows:test, no network)
  const listed = (await until(() => { const r = [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')]; return r.length && r; }, 'the week’s shows', 340).catch((e) => { throw Error(`${e.message}: ${top()?.textContent.slice(0, 400)} · ${ShowSync.upcoming().length} upcoming`); })).map((r) => r.textContent);
  const shows = ShowSync.upcoming().filter((s) => !s.dateOnly && Number.isFinite(s.start) && !s.cancelled && listed.some((t) => t.includes(s.title)));
  const show = shows.find((s) => LeaveSoon.showSpec(s).can), other = shows.find((s) => s !== show);
  if (!show) throw Error(`no listed show with a map spot: ${JSON.stringify(listed.slice(0, 5))}`);
  await LeaveSoon._test.clock(show.start - 3 * 3600e3);
  const openShow = async (s) => { document.querySelectorAll('dialog.qj-dialog[open]').forEach((d) => d.close()); (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click(); (await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => r.textContent.includes(s.title)), `row ${s.title}`)).click(); return until(() => btn(top(), '🎒 Before I go'), 'the 🎒 button on the card'); };
  const bb = await openShow(show);
  step('the show card has a labelled “🎒 Before I go” beside ⏰ Remind me to leave', !!bb.title && !!btn(top(), /Remind me to leave|Leave at/), [...top().querySelectorAll('.qj-actions button')].map(label));
  await Lazy.load('beforego'); BeforeGo._test.days = [{ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(show.start)), rain: 70, tmax: 9 }]; // (fixture: the forecast weekquest62 would have cached)
  await clickEl(bb);
  await until(() => card(), 'the list');
  step('🎒 Before I go: 🎟 Ticket (Add my ticket) · Phone charged · Earplugs · ID · Card / cash · 🧥 Jacket (rain + cold, from the cached forecast)', JSON.stringify(rowTexts()) === JSON.stringify(['🎟 Ticket🎟 Add my ticket', 'Phone charged', 'Earplugs', 'ID', 'Card / cash', '🧥 Jacket: rain likely (70 %), cold (9° at most)']) && card().querySelector('.bg-what strong').textContent === show.title && /0 of 6 ready/.test(card().textContent), rowTexts());
  await tickRow(/^Phone charged$/); await tickRow(/^Earplugs$/);
  step('ticking: “2 of 6 ready”', /2 of 6 ready/.test(card().querySelector('.bg-progress').textContent));
  await shot('list');
  await clickEl(card().querySelector('.bg-close')); await until(() => !card(), 'closed');
  await clickEl(await openShow(show)); await until(() => card(), 'the list again');
  step('closed and opened again: the ticks stay with this show', /2 of 6 ready/.test(card().textContent) && card().querySelectorAll('.bg-row.done').length === 2);
  // Edit my list…
  await clickEl(btn(card(), 'Edit my list…'));
  const ta = await until(() => [...document.querySelectorAll('dialog[open] textarea')].at(-1), 'the edit box');
  step('Edit my list… shows the list, one per line', ta.value === 'Phone charged\nEarplugs\nID\nCard / cash', ta.value);
  ta.value = 'Phone charged\nEarplugs\nKeys\nTicket'; ta.dispatchEvent(new Event('input', { bubbles: true }));
  await clickEl(btn(ta.closest('dialog'), 'Save'));
  await until(() => rowTexts().includes('Keys'), 'the new list');
  step('saved: Phone charged · Earplugs · Keys (the typed “Ticket” isn’t doubled), ticks kept → “2 of 5 ready”; kept on this computer', JSON.stringify(rowTexts().slice(1, 4)) === '["Phone charged","Earplugs","Keys"]' && rowTexts().length === 5 && /2 of 5 ready/.test(card().textContent) && JSON.stringify(store.get('beforego.list', null)) === '["Phone charged","Earplugs","Keys"]', rowTexts());
  // a ticket added (as round 68's card would) → Open my ticket → the bright view
  const png = (() => { const cv = document.createElement('canvas'); cv.width = 200; cv.height = 300; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 300); g.fillStyle = '#000'; g.fillRect(40, 80, 120, 120); return cv.toDataURL('image/png').split(',')[1]; })();
  await window.hub.tickets.op({ op: 'add', show: { key: show.key, title: show.title, start: show.start, dateOnly: false, venue: { name: show.venue.name, address: '' }, lineup: [] }, data: png, name: 'ticket.png', from: 'drop' });
  await Lazy.load('tickets'); await Tickets.refresh();
  const ob = await until(() => btn(card(), '🎟 Open my ticket'), 'the ticket row follows');
  await clickEl(ob);
  await until(() => document.querySelector('dialog.tk-view[open]'), 'the bright view');
  step('a ticket in Hearth: the row says “🎟 Open my ticket” and opens the bright view', true);
  document.querySelector('dialog.tk-view[open]')?.close(); await wait(200);
  if (other) {
    await clickEl(await openShow(other)); await until(() => card()?.querySelector('.bg-what strong')?.textContent === other.title, 'the other show’s list');
    step('another show starts with nothing ticked', card().querySelectorAll('.bg-row.done').length === 0 && /0 of \d ready/.test(card().textContent), card().querySelector('.bg-progress').textContent);
    await clickEl(card().querySelector('.bg-close'));
  }

  // ---------- 4. the show's reminder rings ----------
  await openShow(show); const tog = await until(() => btn(top(), /Remind me to leave/), 'the ⏰ toggle');
  await clickEl(tog);
  const ks = `show:${show.key}`, rs = await until(() => item(ks), 'the show reminder');
  document.querySelectorAll('dialog[open]').forEach((d) => d.close()); card() && card().querySelector('.bg-close').click();
  await N.test({ clear: true, away: true });
  await LeaveSoon._test.clock(rs.notifyAt - 1500);
  await until(async () => (await shown()).some((s) => /^Leave in/.test(s.title)), 'the show rings', 120);
  const ns = (await shown()).filter((s) => /^Leave in/.test(s.title));
  step('the show’s ring (Hearth away): “🎒 Before I go” (the click) · Snooze 10 min · Dismiss', ns.length === 1 && JSON.stringify(ns[0].actions) === JSON.stringify(['🎒 Before I go', 'Snooze 10 min', 'Dismiss']), ns);
  await N.test({ click: { group: `leave:${ks}` } });
  await until(() => card()?.querySelector('.bg-ring'), 'the list from the notification');
  step('a click on it opens the list with the reminder’s words, Show on map · Snooze 10 min · Dismiss, ticks kept', /^⏰ Leave in 10 min for /.test(card().querySelector('.bg-ring').textContent) && !!btn(card(), 'Show on map') && !!btn(card(), 'Snooze 10 min') && !!btn(card(), 'Dismiss') && /2 of 5 ready/.test(card().textContent), card().textContent);
  await shot('ring');
  await clickEl(btn(card(), 'Snooze 10 min'));
  const sz = await until(async () => { const x = await item(ks); return x.state === 'snoozed' && x; }, 'snoozed');
  card().querySelector('.bg-close').click();
  await N.test({ clear: true, away: false }); // Hearth in front
  await LeaveSoon._test.clock(sz.snoozeUntil - 1500);
  await until(() => card()?.querySelector('.bg-ring'), 'the list opens by itself', 120);
  step('with Hearth in front, when it rings again the list opens by itself (no desktop notification)', !(await shown()).length && card().querySelector('.bg-what strong').textContent === show.title);
  await clickEl(btn(card(), 'Dismiss'));
  await until(async () => (await item(ks)).state === 'dismissed', 'dismissed from the list');
  step('Dismiss in the list ends the reminder and closes the list', await until(() => !card(), 'closed', 40).catch(() => false));

  // ---------- 5. a show at 00:05, Hearth closed past its reminder: "yesterday" ----------
  const base = ShowSync.snap.shows[0], night = new Date(show.start + 2 * 86400e3); night.setHours(0, 5, 0, 0);
  const late = { ...structuredClone(base), id: 'lf70', key: 'lf70', title: 'Late Set', lineup: ['Late Test'], start: night.getTime(), end: 0, dateOnly: false, cancelled: false, venue: { ...base.venue, name: 'Café de la Danse', key: 'cafedeladanse', lat: 48.8535, lon: 2.3722 } };
  ShowSync.snap.shows.push(late);
  await LeaveSoon._test.clock(late.start - 6 * 3600e3);
  await LeaveSoon.turnOn(LeaveSoon.showSpec(late)); // (setup; round 68's check clicks this toggle)
  const rl = await item('show:lf70');
  await N.test({ clear: true, away: true });
  await LeaveSoon._test.clock(late.start + 7 * MIN);
  await window.hub.leave.op({ op: 'test', reload: true }); await wait(800);
  await openHud();
  const mrow = await until(() => hud().querySelector('.ls-hud[data-leave="show:lf70"]'), 'the missed row');
  step('missed, seen after midnight: “Missed · leave at yesterday 23:…” (it said a weekday)', new Date(rl.leaveAt).getDate() !== night.getDate() ? /Missed · leave at yesterday \d\d:\d\d/.test(mrow.textContent) : /Missed · leave at \d\d:\d\d/.test(mrow.textContent), mrow.textContent);
  step('…and nothing rang late', !(await shown()).some((s) => /Late/.test(s.title)));
  QuestHud.close();

  step('real clicks landed (a miss is a re-render under the pointer, noted)', misses.length <= 2, misses);
  step('no chat command was used', commands.length === 0, commands);
  step('nothing sent on the network (no forecast fetched for the jacket), nothing opened in the browser', sent.length === 0 && opened.length === 0, { sent, opened });
} catch (err) { fails.push('crashed: ' + err.message); out.steps.push('✖ ' + err.stack); }
try { await N.test({ stub: false, away: null }); await LeaveSoon?._test?.clock(null); } catch { /* fine */ }
out.fails = fails;
if (fails.length) throw Error(JSON.stringify(out, null, 1));
return JSON.stringify(out, null, 1);
