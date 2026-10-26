/* (round 68, leavesoon68) "⏰ Remind me to leave": the thinking, with no DOM, no fs, no Electron, shared by the window
   (leavesoon.js: the toggles, the ✦ tracker rows, Home on the map), the main process (leavesoonmain.js: ONE timer to the
   next reminder) and the Node tests (dev/leavesoon68-test.js).
     travel(from, to)          how long it takes, Paris-simple: walking when it's ≤ 20 min, else a Métro estimate (walk to
                               the nearest station + a wait + ~2 min a station + a change when no line is shared + walk
                               from the station), always "about": { mode, min, text, how }
     showTarget / errandTarget / slotTarget   when you must BE there: a show's start, an errand's closing time minus 20
                               min (time to shop), a weekend-plan slot's day and time
     plan(item, now)           leaveAt (rounded down to 5 min), notifyAt (10 min before) — or a plain-words refusal when
                               it's too late
     settle / next / fire / snooze / dismiss   the reminders' life (on → fired → snoozed…; missed when Hearth was closed:
                               never rung late, shown once), pure so the main side and the tests share them
     notice(item, now) / hud(item, now)        the words of the notification and of the tracker row
   Times: a show's start is an instant; a weekend slot is a day + "HH:MM" on this computer's clock (like the week plan),
   so a summer→winter change in between is handled by the clock itself (new Date(y, m, d, h, mi)). Nothing is looked up
   or sent anywhere. */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.LeaveSoonCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const MIN = 60e3;
  const WALK_MAX = 20; // minutes: up to this, walk
  const KMH = 4.5; // an easy city pace (the same as "📍 I'm here")
  const DETOUR = 1.2; // streets aren't straight lines
  const STOP_M = 600; // ~the distance between two Paris Métro stops
  const PER_STOP = 2; // minutes a stop, doors included
  const WAIT = 3; // minutes on the platform
  const CHANGE = 5; // minutes for one change when the two stations share no line
  const STATION_MAX = 1500; // a station further than this from either end: no Métro hint (walk it)
  const LEAD = 10; // minutes: the notification comes this long before it's time to leave
  const SNOOZE = 10; // minutes
  const ERRAND_MARGIN = 20; // minutes: be at the shop this long before it closes
  const GRACE = 2 * MIN; // a reminder whose time passed less than this ago (sleep, a busy machine) still rings; older: missed
  const KEEP = 2 * 86400e3; // a reminder leaves the list two days after its time
  const MAX = 60;
  const BOUNDS = { s: 48.7, n: 49, w: 2.15, e: 2.6 }; // the Paris map's limits (tools/quest-atlas.js)
  const fin = Number.isFinite;
  const inParis = (p) => !!p && fin(p.lat) && fin(p.lon) && p.lat >= BOUNDS.s && p.lat <= BOUNDS.n && p.lon >= BOUNDS.w && p.lon <= BOUNDS.e;
  const p2 = (n) => String(n).padStart(2, '0');
  let clockOffset = 0; // (checks) a fake clock: now() = Date.now() + offset
  const now = () => Date.now() + clockOffset;
  const setClock = (ms) => { clockOffset = ms == null ? 0 : ms - Date.now(); };

  // ---------- distance ----------
  function metres(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const walkMin = (m) => Math.max(1, Math.ceil((m * DETOUR) / (KMH * 1000 / 60)));
  // the Métro stations: showprep62's bundled list (~90 central stations with their lines), never fetched
  function stations() {
    if (typeof ShowPrepCore !== 'undefined' && ShowPrepCore?.STATIONS) return ShowPrepCore.STATIONS;
    try { if (typeof require === 'function') return require('./showprep-core').STATIONS; } catch { /* the window without it: no Métro hint */ }
    return [];
  }
  function nearestStation(p, list = stations()) {
    let best = null;
    for (const s of list) { const m = metres(p, s); if (m <= STATION_MAX && (!best || m < best.m)) best = { ...s, m }; }
    return best;
  }
  const about = (min) => (min <= 10 ? min : Math.max(10, Math.round(min / 5) * 5));

  /** from, to: { lat, lon } → { mode: 'walk' | 'metro', min (what the leave time uses), shown (rounded), text, how } */
  function travel(from, to, list) {
    if (!inParis(from) || !inParis(to)) throw Error('That place has no spot on the Paris map, so Hearth can’t tell how far it is.');
    const m = metres(from, to), walk = walkMin(m);
    const walking = { mode: 'walk', min: walk, shown: about(walk), m: Math.round(m), text: `about ${about(walk)} min walk`, how: walk <= 2 ? 'it’s right there' : 'on foot' };
    if (walk <= WALK_MAX) return walking;
    const a = nearestStation(from, list), b = nearestStation(to, list);
    if (!a || !b || a.name === b.name) return { ...walking, how: 'on foot (no Métro station close enough for a hint)' };
    const shared = a.lines.find((l) => b.lines.includes(l)) || null;
    const stops = Math.max(1, Math.round(metres(a, b) / STOP_M));
    const total = walkMin(a.m) + WAIT + stops * PER_STOP + (shared ? 0 : CHANGE) + walkMin(b.m);
    if (total >= walk) return walking; // the Métro wouldn't be quicker
    return { mode: 'metro', min: total, shown: about(total), m: Math.round(m), text: `about ${about(total)} min by Métro`, how: `${a.name} → ${b.name}${shared ? ` (line ${shared})` : ' (one change)'}`, from: a.name, to: b.name, line: shared, stops };
  }

  // ---------- when you must be there ----------
  const hm = (ms) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  /** "20:15", "tomorrow 20:15" or "Sat 20:15" (this computer's clock) */
  function when(ms, ref = now()) {
    const a = new Date(dayKey(ref) + 'T12:00'), b = new Date(dayKey(ms) + 'T12:00'), diff = Math.round((b - a) / 86400e3);
    return diff === 0 ? hm(ms) : diff === 1 ? `tomorrow ${hm(ms)}` : `${DAYS[new Date(ms).getDay()]} ${hm(ms)}`;
  }
  /** a day ("2026-10-31") and a time ("20:00") on this computer's clock → ms (a time skipped in March reads an hour on) */
  function localAt(day, time) {
    const d = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(day || '')), t = /^(\d{1,2}):(\d\d)$/.exec(String(time || ''));
    if (!d || !t) return NaN;
    return new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], 0, 0).getTime();
  }
  function showTarget(show) {
    if (!show || show.dateOnly || !fin(Number(show.start))) return { error: 'This show has no start time yet. Check the ticket page.' };
    return { at: Number(show.start), why: 'starts', words: `starts at ${hm(Number(show.start))}` };
  }
  function slotTarget(day, time) {
    const at = localAt(day, time);
    return fin(at) ? { at, why: 'planned', words: `planned for ${time}` } : { error: 'This plan has no time.' };
  }
  /** week: errands67's 7 lists of [open, close] minutes (0 = Sunday; a close above 1440 is after midnight). The next
   *  closing you can still make: be there ERRAND_MARGIN min before it, after it opens, and leave after now. */
  function errandTarget(week, at = now(), travelMin = 0) {
    if (!Array.isArray(week) || week.length !== 7) return { error: 'This errand has no opening hours, so there’s no closing time to beat. Add its hours on the errand card.' };
    const base = new Date(at); base.setHours(0, 0, 0, 0);
    const day0 = base.getDay(), y = base.getFullYear(), mo = base.getMonth(), d = base.getDate();
    const minutes = (ahead, mins) => new Date(y, mo, d + ahead, 0, mins, 0, 0).getTime(); // the clock handles 25-hour days
    if (week.every((d) => Array.isArray(d) && d.length === 1 && d[0][0] === 0 && d[0][1] >= 1440)) return { error: 'It’s open 24 h: no closing time to beat.' };
    for (let ahead = -1; ahead <= 7; ahead++) {
      const wd = (((day0 + ahead) % 7) + 7) % 7;
      for (const [o, c0] of week[wd] || []) {
        let c = c0;
        for (let k = 0; k < 8 && c % 1440 === 0; k++) { const carry = (week[(wd + c / 1440) % 7] || []).find((x) => x[0] === 0); if (!carry) break; c += carry[1]; } // open past midnight (a long weekend): the real close
        const open = minutes(ahead, o), close = minutes(ahead, c), goal = close - ERRAND_MARGIN * MIN;
        if (goal <= open) continue; // a stretch too short to shop in
        if (goal - travelMin * MIN - LEAD * MIN > at) return { at: goal, why: 'closes', closeAt: close, words: `closes at ${hm(close)}` };
      }
    }
    return { error: 'It doesn’t close again in the next week while there’s still time to get there.' };
  }

  // ---------- one reminder ----------
  const floor5 = (ms) => Math.floor(ms / (5 * MIN)) * 5 * MIN;
  /** item: { key, title, place: { name, lat, lon }, targetAt, words, travel } → { leaveAt, notifyAt } or throws in plain words */
  function plan(item, at = now()) {
    if (!fin(item?.targetAt)) throw Error('There’s no time to plan from.');
    if (item.targetAt <= at) throw Error(`That's already past (${item.words || hm(item.targetAt)}).`);
    const leaveAt = floor5(item.targetAt - item.travel.min * MIN);
    if (leaveAt <= at) throw Error(`It’s already time to go: ${item.travel.text}, and it ${item.words || `is at ${hm(item.targetAt)}`}.`);
    const notifyAt = Math.max(leaveAt - LEAD * MIN, at + 2000); // less than 10 min to go: it rings in a moment
    return { leaveAt, notifyAt };
  }
  const KINDS = new Set(['show', 'errand', 'plan']);
  const STATES = new Set(['on', 'fired', 'snoozed', 'dismissed', 'missed']);
  const clean = (v, n = 160) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  /** one reminder as kept (main side and window); throws on anything odd */
  function check(it) {
    if (!it || typeof it !== 'object' || !/^(show|errand|plan):[\w:.-]{1,100}$/.test(String(it.key)) || !KINDS.has(it.kind) || !clean(it.title)) throw Error('That reminder can’t be kept.');
    if (!inParis(it.place) || ![it.targetAt, it.leaveAt, it.notifyAt].every(fin) || !it.travel || !fin(it.travel.min) || !STATES.has(it.state || 'on')) throw Error('That reminder can’t be kept.');
    const out = { key: it.key, kind: it.kind, title: clean(it.title), place: { name: clean(it.place.name, 120), lat: +it.place.lat, lon: +it.place.lon }, targetAt: +it.targetAt, words: clean(it.words, 80),
      travel: { mode: it.travel.mode === 'metro' ? 'metro' : 'walk', min: +it.travel.min, text: clean(it.travel.text, 60), how: clean(it.travel.how, 120) }, from: clean(it.from, 40) || 'Home', origin: clean(it.origin, 60),
      leaveAt: +it.leaveAt, notifyAt: +it.notifyAt, state: it.state || 'on', ref: it.ref && typeof it.ref === 'object' ? JSON.parse(JSON.stringify(it.ref, (k, v) => (typeof v === 'string' ? v.slice(0, 200) : v))) : {}, createdAt: fin(it.createdAt) ? +it.createdAt : 0 };
    for (const k of ['firedAt', 'snoozeUntil', 'missedAt', 'dismissedAt']) if (fin(it[k])) out[k] = +it[k];
    if (it.missedSeen) out.missedSeen = true;
    return out;
  }
  const empty = () => ({ v: 1, items: [] });
  /** the file as read → a clean store (a store that can't be read throws: the caller never saves over it) */
  function validate(s) {
    if (!s || typeof s !== 'object' || s.v !== 1 || !Array.isArray(s.items) || s.items.length > 500) throw Error('The leave reminders could not be read safely.');
    const out = empty(), keys = new Set();
    for (const it of s.items) { let x; try { x = check(it); } catch { continue; } if (keys.has(x.key)) continue; keys.add(x.key); out.items.push(x); }
    return out;
  }

  // ---------- the reminders' life (pure: returns what changed) ----------
  const dueOf = (it) => (it.state === 'on' ? it.notifyAt : it.state === 'snoozed' ? it.snoozeUntil : null);
  /** missed (its time went by more than GRACE ago: Hearth was closed or asleep) and old ones leave. Mutates; → true if changed */
  function settle(s, at = now()) {
    let changed = false;
    s.items = s.items.filter((it) => { const keep = it.targetAt > at - KEEP; if (!keep) changed = true; return keep; });
    for (const it of s.items) {
      const due = dueOf(it);
      if (due != null && due < at - GRACE) { it.state = 'missed'; it.missedAt = at; changed = true; }
    }
    return changed;
  }
  /** the next reminder to ring: the soonest one on or snoozed (never one already rung or missed) */
  function next(s, at = now()) {
    let best = null;
    for (const it of s.items) { const due = dueOf(it); if (due != null && due >= at - GRACE && (!best || due < best.due)) best = { key: it.key, due }; }
    return best;
  }
  function find(s, key) { const it = s.items.find((x) => x.key === key); if (!it) throw Error('That reminder is gone.'); return it; }
  function put(s, item, at = now()) {
    const it = check({ ...item, state: 'on', createdAt: item.createdAt || at });
    delete it.firedAt; delete it.snoozeUntil; delete it.missedAt; delete it.missedSeen;
    if (it.notifyAt < at - GRACE) throw Error('That reminder’s time has already gone by.');
    s.items = s.items.filter((x) => x.key !== it.key);
    if (s.items.length >= MAX) throw Error(`Hearth keeps up to ${MAX} leave reminders. Turn one off first.`);
    s.items.push(it); s.items.sort((a, b) => a.leaveAt - b.leaveAt);
    return it;
  }
  function fire(s, key, at = now()) { const it = find(s, key); it.state = 'fired'; it.firedAt = at; delete it.snoozeUntil; return it; }
  function snooze(s, key, at = now()) { const it = find(s, key); it.state = 'snoozed'; it.snoozeUntil = at + SNOOZE * MIN; return it; }
  function dismiss(s, key, at = now()) { const it = find(s, key); it.state = 'dismissed'; it.dismissedAt = at; delete it.snoozeUntil; return it; }
  function remove(s, key) { const n = s.items.length; s.items = s.items.filter((x) => x.key !== key); return n !== s.items.length; }
  const missed = (s) => s.items.filter((it) => it.state === 'missed' && !it.missedSeen);

  // ---------- words ----------
  const minsTo = (ms, at) => Math.round((ms - at) / MIN);
  /** the notification: "Leave in 10 min for Arlo Parks — about 25 min by Métro" */
  function notice(it, at = now()) {
    const m = minsTo(it.leaveAt, at);
    const lead = m >= 1 ? `Leave in ${m} min for ${it.title}` : `Time to leave for ${it.title}`;
    return { title: `${lead} — ${it.travel.text}`, body: [`Leave at ${hm(it.leaveAt)} from ${it.from}`, it.words, it.place.name, it.travel.mode === 'metro' ? it.travel.how : ''].filter(Boolean).join(' · ') };
  }
  /** the ✦ tracker row: { text, sub, state, title } */
  function hud(it, at = now()) {
    const lw = `Leave at ${when(it.leaveAt, at)}`;
    const sub = `${it.title} · ${it.travel.text} from ${it.from}`;
    if (it.state === 'missed') return { text: `⏰ Missed · ${lw.toLowerCase()}`, sub, state: 'missed', title: 'Hearth was closed (or asleep) when this reminder was due, so it didn’t ring late.' };
    if (it.state === 'dismissed') return null;
    if (it.leaveAt <= at && it.targetAt > at) return { text: '⏰ Time to leave', sub, state: 'now', title: `${it.words || ''}` };
    if (it.targetAt <= at) return null;
    const ring = it.state === 'snoozed' ? `snoozed till ${hm(it.snoozeUntil)}` : it.state === 'fired' ? `in ${minsTo(it.leaveAt, at)} min` : `reminder at ${hm(it.notifyAt)}`;
    return { text: `⏰ ${lw}`, sub, state: it.state, ring, title: `${it.place.name}: ${it.words}. ${it.travel.how ? `${it.travel.how}. ` : ''}Hearth reminds you ${LEAD} min before (${hm(it.notifyAt)}), by a Windows / Mac notification, even with Hearth in the tray.` };
  }
  /** the toast after turning one on */
  function confirmText(it) { return `⏰ I’ll remind you at ${hm(it.notifyAt)} to leave at ${hm(it.leaveAt)} (${it.travel.text} from ${it.from}).`; }

  return { WALK_MAX, KMH, LEAD, SNOOZE, ERRAND_MARGIN, GRACE, KEEP, MAX, now, setClock, inParis, metres, walkMin, stations, nearestStation, travel, about, hm, when, dayKey, localAt,
    showTarget, slotTarget, errandTarget, plan, check, empty, validate, dueOf, settle, next, put, fire, snooze, dismiss, remove, missed, notice, hud, confirmText };
});
