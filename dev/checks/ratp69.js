// (round 69, ratp69) Leave reminders honest about the Métro, by CLICKING (no chat command; it fails if one is used), on
// the smoke run's throwaway profile with a FAKE status server (dev/fake-ratp.js via --fake-ratp: PRIM + the community
// API; no real network) and a FAKE CLOCK shared by both processes (LeaveSoon._test.clock). Hearth is "away" (the
// notification recorder instead of the OS). Home is set near Pigalle (not under test: leavesoon68 clicks it).
//   1. NIGHT: a show at 01:30 on a Monday night near Nation (the Métro closed since about 00:40): its ⏰ toggle says the
//      trip is "Noctilien / taxi — check (about N min)", the leave time is worked out from that (not the Métro), the
//      tracker row says "Métro closed then (last about 00:40)", and the notification at its time says so too
//   2. DAY: a show at 20:00 the next day: a Métro trip on line 2 (its route's lines kept); no fetch on turning it on
//   3. opening the ✦ tracker asks for the line status ONCE: no key and the no-key source down → "Line status unknown"
//      with "Add key…"; a click there opens the key box, a typed key saved (encrypted store, never in localStorage) →
//      the status comes from PRIM: "Line 2: OK"; Settings › Housekeeping has "Paris Métro status key…" too
//   4. line 2 disrupted, the clock ~30 min before the reminder: the ONE scheduled check → ONE notification "⚠ Line 2:
//      disrupted — leave 10 min earlier?" with Leave earlier · Show on map; the tracker row says it, with Leave earlier;
//      a click there moves the leave time 10 min earlier (once), the notification's button doesn't move it twice
//   5. it rings at the new time with "⚠ line 2: leaving 10 min earlier"; everything down → "Line status unknown", the
//      reminder unharmed
//   6. what went out: GETs of the whole feeds only (no query, no place, no route), the key only in PRIM's header (never
//      in a log), nothing from the window, nothing opened in the browser
//   node dev/smoke.js --fake-ratp --script dev/checks/ratp69.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const root = () => document.querySelector('.qj');
const hud = () => document.querySelector('.qh-panel');
const btn = (txt, scope) => [...(scope || document).querySelectorAll('button')].find((b) => (typeof txt === 'string' ? b.textContent.trim() === txt : txt.test(b.textContent)));
const N = window.hub.notify;
const L = window.hub.leave;
const shown = async () => (await N.test({})).log.filter((l) => l.shown).map((l) => l.shown);
const ran = async () => (await N.test({})).log.filter((l) => l.ran).map((l) => l.ran);
const list = async () => (await L.op({ op: 'list' })).value.items;
const item = async (key) => (await list()).find((x) => x.key === key);
const commands = []; const realTry = Commands.tryRun; Commands.tryRun = function (...a) { commands.push(a[0]); return realTry.apply(this, a); };
const opened = []; window.hub.openExternal = (u) => { opened.push(u); };
const sent = []; const realFetch = window.fetch; window.fetch = function (u, ...a) { const s = String(u?.url || u); if (/^https?:/.test(s)) sent.push(s); return realFetch.call(this, u, ...a); };
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
const openHud = async () => { if (hud()) QuestHud.close(); await clickUntil(() => document.querySelector('.qh-chip'), () => hud() && QuestHud.journal().status === 'ok', 'tracker'); await until(() => window.LeaveSoon, 'leavesoon loads with the tracker'); await LeaveSoon.refresh(); await wait(150); };
const rowOf = (key) => hud()?.querySelector(`.ls-hud[data-leave="${key}"]`);
const fake = (mode) => L.op({ op: 'test', ratp: mode }); // the fake status server's next answer (and the main side's cache dropped)
const MIN = 60e3;
const typeIn = async (input, text) => { input.focus(); input.value = ''; await smoke({ cdp: 'Input.insertText', params: { text } }); input.dispatchEvent(new Event('input', { bubbles: true })); };

try {
  await N.test({ stub: true, away: true, clear: true });
  try { await window.hub.shows.test({ dev: window.SMOKE_DEV }); } catch { /* the show part needs them */ }
  await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');
  step('nothing of it is loaded at start (the leavesoon lazy group carries ratp-core.js)', !window.RatpCore && !Lazy.isIn('leavesoon'));
  await Lazy.load('notify');
  await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => root() && QuestJournal.ready(), 'journal');
  await until(() => window.LeaveSoon && window.RatpCore, 'leavesoon + ratp-core ride in with the map code');
  const K = LeaveSoonCore, R = RatpCore;
  await fake({ prim: 'normal', community: 'down', clear: 1 });
  // setup (not under test): Home near Pigalle; next Monday 21:00 Paris on the fake clock; two shows near Nation
  store.set('herepin.pin', null);
  const PIG = R.stations().find((s) => s.name === 'Pigalle'), NAT = R.stations().find((s) => s.name === 'Nation');
  store.set('leavesoon.home', { lat: +(PIG.lat + 0.0006).toFixed(5), lon: PIG.lon, at: Date.now() });
  let day = Date.now() + 86400e3; while (R.parts(day).wd !== 1) day += 86400e3;
  const t0 = R.wallAt(day, 21 * 60);
  await LeaveSoon._test.clock(t0);
  QuestJournal.navigate('world'); await until(() => root()?.querySelector('.qj-world-layout .qj-atlas'), 'the map');
  await until(() => ShowSync.snap?.shows?.length, 'saved shows');
  const base = ShowSync.snap.shows[0];
  const mk = (id, who, start) => ({ ...structuredClone(base), id, key: id, title: `${who} night`, lineup: [who], start, end: 0, dateOnly: false, cancelled: false, venue: { ...base.venue, name: 'Le Nation Club', key: 'nationclub', lat: NAT.lat + 0.0006, lon: NAT.lon } });
  const late = mk('r69late', 'Late Test', R.wallAt(day, 1440 + 90)); // Tue 01:30 (a Monday night)
  const evening = mk('r69eve', 'Eve Test', R.wallAt(day, 1440 + 20 * 60)); // Tue 20:00
  ShowSync.snap.shows.push(late, evening);
  const turnOn = async (show) => {
    const sc = await ShowSync.makeQuest(show);
    QuestJournal.questDetail(sc.quests[0].id);
    const tg = await until(() => document.querySelector('.ls-detail .ls-toggle'), 'the toggle in the show quest');
    await clickEl(tg);
    await until(async () => (await item(`show:${show.key}`))?.state === 'on', `${show.key} on`);
    await until(() => document.querySelector('.ls-detail .ls-toggle')?.classList.contains('on'), 'the toggle says on');
    const t = document.querySelector('.ls-detail .ls-toggle');
    const r = { text: t.textContent, title: t.title, it: await item(`show:${show.key}`) };
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    return r;
  };

  // ---------- 1. the night ----------
  const n1 = await turnOn(late);
  const tr = K.travel(store.get('leavesoon.home'), late.venue);
  const nightMin = Math.min(Math.ceil(tr.m * 1.2 / 75), Math.ceil(tr.m * 1.4 / 300) + 15);
  step('a show at 01:30 on a Monday night: the Métro would be closed (about 00:40), so the trip says “Noctilien / taxi — check”', tr.mode === 'metro' && n1.it.travel.mode === 'night' && /^Noctilien \/ taxi — check \(about \d+ min\)$/.test(n1.it.travel.text) && n1.it.travel.min === nightMin, { metro: tr.text, now: n1.it.travel.text });
  step('…and the leave time is worked out from that (earlier than by Métro), the reminder 10 min before', n1.it.leaveAt === Math.floor((late.start - nightMin * MIN) / 3e5) * 3e5 && n1.it.leaveAt < Math.floor((late.start - tr.min * MIN) / 3e5) * 3e5 && n1.it.notifyAt === n1.it.leaveAt - 10 * MIN, { leave: K.hm(n1.it.leaveAt), metroWouldBe: K.hm(Math.floor((late.start - tr.min * MIN) / 3e5) * 3e5) });
  step('the toggle’s hover says why (Métro closed, last about 00:40, back about 05:30)', /Métro is closed then \(last about 00:40, back about 05:30\)/.test(n1.title), n1.title);
  await openHud();
  const nrow = await until(() => rowOf('show:r69late'), 'the night row');
  step('the ✦ tracker row: “Noctilien / taxi — check” and “Métro closed then (last about 00:40)”', /Noctilien \/ taxi — check/.test(nrow.textContent) && /Métro closed then \(last about 00:40\)/.test(nrow.textContent), nrow.textContent);
  QuestHud.close();
  await N.test({ clear: true });
  await LeaveSoon._test.clock(n1.it.notifyAt - 1500);
  await until(async () => (await shown()).some((s) => /Late Test/.test(s.title)), 'the night notification', 120);
  const ns = (await shown()).find((s) => /Late Test/.test(s.title));
  step('its notification: “Leave in 10 min for Late Test — Noctilien / taxi — check (about N min)”, saying the Métro is closed', ns.title === `Leave in 10 min for Late Test — ${n1.it.travel.text}` && /Métro is closed then/.test(ns.body), ns);
  await N.test({ click: { group: 'leave:show:r69late', action: 2 } }); // Dismiss
  await until(async () => (await item('show:r69late')).state === 'dismissed', 'night one dismissed');

  // ---------- 2. the evening: a Métro trip with its lines ----------
  await LeaveSoon._test.clock(R.wallAt(day, 1440 + 15 * 60)); // Tue 15:00 (within 6 h: opening the tracker checks it)
  const asked0 = (await L.op({ op: 'test', ratpLog: true })).value.ratpLog.length;
  const e1 = await turnOn(evening);
  const ek = 'show:r69eve';
  step('a show at 20:00: a Métro trip on line 2 (Pigalle → Nation), its route’s lines kept', e1.it.travel.mode === 'metro' && JSON.stringify(e1.it.travel.lines) === JSON.stringify([{ lines: ['2'], via: null }]) && /Pigalle → Nation \(line 2\)/.test(e1.it.travel.how), e1.it.travel);
  step('turning it on fetched nothing (the check waits for ~30 min before it rings)', (await L.op({ op: 'test', ratpLog: true })).value.ratpLog.length === asked0);
  const st0 = (await L.op({ op: 'test' })).value;
  step('one timer: the status check, 30 min before the reminder', st0.armed && st0.check?.key === ek && st0.check.at === e1.it.notifyAt - 30 * MIN, st0.check);

  // ---------- 3. opening the tracker: status unknown → Add key… → PRIM ----------
  await openHud();
  await until(async () => (await item(ek)).status, 'a status after opening the tracker');
  await openHud(); // (the panel is rebuilt when opened; a background window may skip the frame-timed repaint)
  let row = await until(() => /Line status/.test(rowOf(ek)?.textContent || '') && rowOf(ek), 'the evening row with its status', 60).catch(() => rowOf(ek));
  const log1 = (await L.op({ op: 'test', ratpLog: true })).value.ratpLog.slice(asked0);
  step('opening the tracker asked once: no key, the no-key source down → “Line status unknown”', log1.length === 1 && log1[0].provider === 'community' && /Line status unknown/.test(row.textContent) && (await item(ek)).status.why === 'nokey', { log1, row: row?.textContent, st: LeaveSoon.get(ek)?.status, html: row?.innerHTML.slice(0, 600) });
  const addKey = btn('Add key…', row);
  step('the row offers “Add key…” (hover: add your free PRIM key in Settings)', !!addKey && /free PRIM key in Settings/.test(addKey.title), addKey?.title);
  await clickUntil(() => btn('Add key…', rowOf(ek) || document), () => document.querySelector('dialog[open] input[type=password]'), 'the key box');
  const pw = document.querySelector('dialog[open] input[type=password]');
  await typeIn(pw, 'good-prim-key-69xyz');
  await clickUntil(() => btn('Save', document.querySelector('dialog[open]')), async () => (await window.hub.apps.key('prim', 'has'))?.has, 'Save');
  await until(async () => (await item(ek)).status?.state === 'ok', 'the status from PRIM');
  const ls = JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  step('the key is kept by Hearth’s key store (not in the window’s storage, never shown back)', !ls.includes('good-prim-key') && !document.body.innerHTML.includes('good-prim-key'));
  await openHud();
  row = await until(() => /Line 2: OK/.test(rowOf(ek)?.textContent || '') && rowOf(ek), 'the row again', 60).catch(() => rowOf(ek));
  step('with the key: “Line 2: OK” (from PRIM)', /Line 2: OK/.test(row.textContent) && (await L.op({ op: 'test', ratpLog: true })).value.ratpLog.at(-1).provider === 'prim', row.textContent);
  QuestHud.close();
  await AppUI.openSettings();
  const sd = await until(() => document.querySelector('dialog.settings-dialog[open]'), 'Settings');
  const fold = sd.querySelector('details[data-fold="hearth"]'); if (fold && !fold.open) await clickEl(fold.querySelector('summary'));
  const sb = await until(() => btn('Paris Métro status key…', sd), 'the Settings button');
  step('Settings › Housekeeping has “Paris Métro status key…”', !!sb && /PRIM/.test(sb.title), sb?.title);
  sd.close();

  // ---------- 4. line 2 disrupted: the ONE scheduled check ~30 min before → the warning ----------
  await fake({ prim: 'disrupted', line: '2' });
  await N.test({ clear: true });
  const before = await item(ek);
  await LeaveSoon._test.clock(before.notifyAt - 30 * MIN - 1500);
  await until(async () => (await shown()).some((s) => /^⚠ Line 2/.test(s.title)), 'the warning', 160);
  const w = (await shown()).filter((s) => /^⚠/.test(s.title));
  step('ONE notification “⚠ Line 2: disrupted — leave 10 min earlier?” with Leave earlier · Show on map', w.length === 1 && w[0].title === '⚠ Line 2: disrupted — leave 10 min earlier?' && JSON.stringify(w[0].actions) === JSON.stringify(['Leave earlier', 'Show on map']) && w[0].body.startsWith(`For Eve Test: leave at ${K.hm(before.leaveAt - 10 * MIN)} instead of ${K.hm(before.leaveAt)}`), w);
  const afterCheck = await item(ek);
  step('the check is marked done (no retry, no polling): the timer goes back to the ring', afterCheck.checkedAt && (await L.op({ op: 'test' })).value.check === null && (await L.op({ op: 'test' })).value.next?.key === ek);
  await openHud();
  row = await until(() => /⚠ Line 2/.test(rowOf(ek)?.textContent || '') && rowOf(ek), 'the row', 60).catch(() => rowOf(ek));
  const le = btn('Leave earlier', row);
  step('the tracker row says it too, with “Leave earlier”', /⚠ Line 2: disrupted — leave 10 min earlier\?/.test(row.textContent) && !!le, row.textContent);
  await clickUntil(() => btn('Leave earlier', rowOf(ek) || document.createElement('i')), async () => (await item(ek)).earlierBy === 10, 'Leave earlier');
  const moved = await item(ek);
  step('one click: leave 10 min earlier, the reminder too', moved.leaveAt === before.leaveAt - 10 * MIN && moved.notifyAt === before.notifyAt - 10 * MIN, { was: K.hm(before.leaveAt), now: K.hm(moved.leaveAt) });
  await N.test({ click: { group: `leave:${ek}`, action: 0 } }); // the notification's Leave earlier, after the row's
  await wait(400);
  const r0 = (await ran()).at(-1);
  step('the notification’s Leave earlier runs without bringing Hearth up, and never moves it twice', r0?.action === 'Leave earlier' && r0.go?.quiet === 1 && (await item(ek)).leaveAt === moved.leaveAt, r0);
  await openHud();
  row = await until(() => /leaving 10 min earlier/.test(rowOf(ek)?.textContent || '') && rowOf(ek), 'the row moved', 60).catch(() => rowOf(ek));
  step('the row now says “leaving 10 min earlier” (no second button)', /leaving 10 min earlier/.test(row.textContent) && !btn('Leave earlier', row), row.textContent);
  QuestHud.close();

  // ---------- 5. it rings at the new time; everything down → unknown, the reminder unharmed ----------
  await N.test({ clear: true });
  await LeaveSoon._test.clock(moved.notifyAt - 1500);
  await until(async () => (await shown()).some((s) => /^Leave in .*Eve Test/.test(s.title)), 'the reminder', 120);
  const rs = (await shown()).find((s) => /Eve Test/.test(s.title));
  step('it rings at the new time, its words saying why', rs.title === `Leave in 10 min for Eve Test — ${moved.travel.text}` && /^⚠ line 2: leaving 10 min earlier · Leave at /.test(rs.body), rs);
  await fake({ prim: 'down', community: 'down' });
  await L.op({ op: 'status', fresh: true });
  await LeaveSoon.refresh(); await openHud();
  row = await until(() => /Line status unknown/.test(rowOf(ek)?.textContent || '') && rowOf(ek), 'the row offline', 60).catch(() => rowOf(ek));
  step('everything down: “Line status unknown”, the reminder still there as it was', /Line status unknown/.test(row.textContent) && (await item(ek)).state === 'fired' && (await item(ek)).leaveAt === moved.leaveAt, row.textContent);
  QuestHud.close();

  // ---------- 6. what went out ----------
  const all = (await L.op({ op: 'test', ratpLog: true })).value;
  const fl = all.fakeLog || [];
  step('only whole feeds were fetched: GET, no query, no place / route / line in the request', fl.length >= 3 && fl.every((l) => l.method === 'GET' && l.query === '' && /^\/(prim\/marketplace\/disruptions_bulk\/disruptions\/v2|community\/v4\/traffic\/metros)$/.test(l.path)), fl.map((l) => `${l.method} ${l.path}${l.query}`));
  step('the key went only to PRIM, in its header; never logged', fl.filter((l) => l.keyed).every((l) => l.provider === 'prim') && fl.some((l) => l.keyed) && !JSON.stringify(all).includes('good-prim-key'));
  // (counted on Hearth's own log: Chromium's network stack retries a GET once when the fake drops the connection)
  step('few fetches (no polling): at most 5 asks in this whole run', all.ratpLog.length <= 5, all.ratpLog.map((l) => `${l.provider}:${l.state}:${l.why || ''}`));
  step('real clicks landed (a miss is a re-render under the pointer, noted)', misses.length <= 2, misses);
  step('no chat command was used', commands.length === 0, commands);
  step('nothing sent from the window, nothing opened in the browser', sent.length === 0 && opened.length === 0, { sent, opened });
} catch (err) { fails.push('crashed: ' + err.message); out.steps.push('✖ ' + err.stack); }
try { await N.test({ stub: false, away: null }); await LeaveSoon?._test?.clock(null); await window.hub.apps.key('prim', 'forget'); } catch { /* fine */ }
out.fails = fails;
if (fails.length) throw Error(JSON.stringify(out, null, 1));
return JSON.stringify(out, null, 1);
