/* (round 71, eatnearby71) "🍜 Eat nearby": the thinking, with no DOM, no fs, no Electron, shared by the window
   (eatnearby.js: the list on a show's card, the weekend plan's show slot and 🎒 Before I go) and the Node tests
   (dev/eatnearby71-test.js).
     foodPlaces({ guide, places, hours, parse })   the guide's food stops (QuestParis.guide, tagged "food"), each with
                               its journal pin's ★ star / ✓ visit stamp, and its opening hours when known: what the owner
                               typed in this list (kept on this computer) or a guide entry's own `hours`, read by the
                               errands hours parser (ErrandsCore.parse); none → "Hours unknown"
     openBefore(week, doors, eatMin)   open during the 2 hours before doors for long enough to eat? → { state: 'open' |
                               'closed' | 'unknown', text } (this computer's clock, like errands: a late night counts)
     nearby({ venue, doors, eatMin, places })   the stops within ~10 min walk of the venue, closed ones left out,
                               ★ starred / ✓ stamped first, then by walk time
     stopOf(row, eatMin)       the stop a leave reminder carries ("Go here first"): the leave time moves earlier by the
                               eat time + the walk from there to the venue (LeaveSoonCore.plan)
   Nothing is looked up or sent anywhere: the walk is the leave reminders' own (straight line + 20 %, 4.5 km/h). */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(require('./leavesoon-core.js')); else root.EatNearbyCore = make(null); })(typeof self !== 'undefined' ? self : globalThis, (LS) => {
  const K = () => LS || (typeof LeaveSoonCore !== 'undefined' ? LeaveSoonCore : null); // the leavesoon group loads first
  const MIN = 60e3;
  const MAX_WALK = 10; // minutes from the venue
  const BEFORE = 120; // minutes: the window before doors
  const EAT = 45, EAT_MIN = 15, EAT_MAX = 120; // eat time (minutes), editable in the list
  const EAT_CHOICES = [30, 45, 60, 75, 90];
  const LIMIT = 8;
  const fin = Number.isFinite;
  const p2 = (n) => String(n).padStart(2, '0');
  const hm = (ms) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const eatOf = (v) => { const n = v == null || v === '' ? NaN : Math.round(Number(v)); return fin(n) ? Math.min(EAT_MAX, Math.max(EAT_MIN, n)) : EAT; };
  const ok = (p) => !!p && fin(p.lat) && fin(p.lon);

  // ---------- the food stops ----------
  /** guide: [{ id, name, lat, lon, tags, why, hours? }] · places: the journal's s.atlas.places · hours: { id: text } typed
   *  by the owner · parse: ErrandsCore.parse (text → week, null when empty, throws when unreadable) */
  function foodPlaces({ guide = [], places = [], hours = {}, parse = null } = {}) {
    const out = [];
    for (const g of guide) {
      if (!g || !Array.isArray(g.tags) || !g.tags.includes('food') || !ok(g)) continue;
      const pin = places.find((p) => p && (p.id === g.id || p.guide === g.id)) || null;
      const text = String((hours && Object.hasOwn(hours, g.id) ? hours[g.id] : g.hours) || '').trim();
      let week = null;
      if (text && parse) { try { week = parse(text); } catch { week = null; } }
      out.push({ id: g.id, name: g.name, lat: g.lat, lon: g.lon, addr: String(g.why || '').split('. ')[0].slice(0, 80), pin: pin?.id || null,
        starred: !!pin?.favorite, stamped: !!pin?.visitedAt, hoursText: text, week, mine: !!(hours && Object.hasOwn(hours, g.id)) });
    }
    return out;
  }

  // ---------- open before doors? ----------
  /** week: errands67's 7 lists of [open, close] minutes (0 = Sunday; a close above 1440 runs past midnight) */
  function openBefore(week, doors, eatMin = EAT) {
    const valid = Array.isArray(week) && week.length === 7 && week.every(Array.isArray);
    if (!valid || !fin(doors)) return { state: 'unknown', text: 'Hours unknown', title: 'Hearth doesn’t know its hours: check before going (or add them with “Add hours…”).' };
    const from = doors - BEFORE * MIN, need = Math.min(eatOf(eatMin), BEFORE) * MIN;
    const base = new Date(doors); base.setHours(0, 0, 0, 0);
    const y = base.getFullYear(), mo = base.getMonth(), d = base.getDate(), wd = base.getDay();
    let best = null;
    for (const ahead of [-1, 0]) { // yesterday's late night can still be open in today's window
      for (const [o, c] of week[(wd + ahead + 7) % 7] || []) {
        const open = new Date(y, mo, d + ahead, 0, o, 0, 0).getTime(), close = new Date(y, mo, d + ahead, 0, c, 0, 0).getTime(); // the clock handles 25-hour days
        const a = Math.max(open, from), b = Math.min(close, doors);
        if (b - a > 0 && (!best || b - a > best.b - best.a)) best = { a, b, open, close };
      }
    }
    if (!best || best.b - best.a < need) return { state: 'closed', text: 'Closed before doors', title: `Not open for ${Math.round(need / MIN)} min in the 2 hours before doors (${hm(from)}–${hm(doors)}).` };
    const text = best.open <= from && best.close >= doors ? 'Open before doors' : best.open > from ? `Opens at ${hm(best.open)}` : `Closes at ${hm(best.close)}`;
    return { state: 'open', text, title: `Open ${hm(best.a)}–${hm(best.b)} before doors at ${hm(doors)}.` };
  }

  // ---------- the list ----------
  /** venue: { lat, lon } · doors: ms (the show's doors, else its start) · places: foodPlaces() → rows, best first */
  function nearby({ venue, doors, eatMin = EAT, places = [], limit = LIMIT } = {}) {
    const L = K(); if (!L || !ok(venue)) return [];
    const rows = [];
    for (const p of places) {
      if (!ok(p)) continue;
      const m = L.metres(venue, p), walk = L.walkMin(m);
      if (walk > MAX_WALK) continue;
      const hours = openBefore(p.week, doors, eatMin);
      if (hours.state === 'closed') continue;
      rows.push({ ...p, m: Math.round(m), walk, walkText: walk <= 2 ? 'right there' : `${walk} min walk`, hours });
    }
    const rank = (r) => (r.starred ? 0 : r.stamped ? 1 : 2); // ★ starred, then ✓ stamped, then the rest
    rows.sort((a, b) => rank(a) - rank(b) || a.walk - b.walk || a.m - b.m || String(a.name).localeCompare(String(b.name)));
    return rows.slice(0, limit);
  }

  // ---------- "Go here first" ----------
  /** the stop a leave reminder keeps: where, how long you eat, and the walk from there to the venue */
  function stopOf(row, eatMin = EAT) {
    if (!ok(row)) throw Error('That place has no spot on the map.');
    return { id: String(row.id || '').slice(0, 100), name: String(row.name || 'the food stop').slice(0, 120), lat: +row.lat, lon: +row.lon, eatMin: eatOf(eatMin), walkMin: Math.max(1, Math.round(row.walk || 1)) };
  }
  /** minutes a stop adds before the venue (the leave time moves this much earlier, before the trip changes) */
  const stopMinutes = (stop) => (stop ? eatOf(stop.eatMin) + Math.max(0, Math.round(Number(stop.walkMin) || 0)) : 0);
  /** "Eat at Mokonuts first (45 min, then 6 min walk)" */
  const stopWords = (stop) => (stop ? `eat at ${stop.name} first (${eatOf(stop.eatMin)} min, then ${stop.walkMin} min walk)` : '');

  return { MAX_WALK, BEFORE, EAT, EAT_MIN, EAT_MAX, EAT_CHOICES, LIMIT, eatOf, foodPlaces, openBefore, nearby, stopOf, stopMinutes, stopWords, hm };
});
