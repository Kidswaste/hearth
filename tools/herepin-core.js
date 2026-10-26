/* (round 66, herepin66) "I'm here" on the Paris map: the thinking, with no DOM (Node tests require it:
   dev/herepin66-test.js). The owner clicks a spot on the map (no GPS, no network) to say where they are right now; this
   file checks that pin (inside Paris, not older than 3 hours), turns straight-line distance into walking minutes
   (~4.5 km/h, "about N min walk"), picks tonight's shows, and ranks the nearest place quests / shows tonight / park-jam
   spots. The pin lives in this computer's localStorage only (store key herepin.pin); nothing is sent anywhere.
   Loaded with Codex's quest rules (lazy group 'questcore') so the ✦ tracker can show its "Near me" row cheaply; the map
   part is tools/herepin.js. */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.HerePinCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const KEY = 'herepin.pin';
  const FADE_MS = 3 * 3600e3; // the pin fades (is forgotten) 3 hours after it was set
  const KMH = 4.5; // an easy city walking pace
  const MAX_MIN = 45; // "close to you": at most 45 minutes on foot
  const LIMIT = 8;
  const BOUNDS = { s: 48.7, n: 49, w: 2.15, e: 2.6 }; // the map's own limits (tools/quest-atlas.js clamps to these)
  const KINDS = { place: 'Place quest', show: 'Tonight', jam: 'Park jam', errand: 'Errand' }; // (round 67, errands67) + your errands
  const ORDER = { show: 0, errand: 1, jam: 2, place: 3 }; // same distance: tonight's show first (it won't wait), then an errand (shops close)
  const fin = Number.isFinite;
  const inParis = (lat, lon) => fin(lat) && fin(lon) && lat >= BOUNDS.s && lat <= BOUNDS.n && lon >= BOUNDS.w && lon <= BOUNDS.e;

  // great-circle distance in metres (haversine; at city scale it's the straight line on the map)
  function metres(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const minutes = (m) => Math.max(1, Math.round((m / 1000 / KMH) * 60)); // never "0 min": you still have to walk there
  const walkText = (min) => `about ${min} min walk`;

  // ---------- the pin ----------
  /** A pin as stored ({ lat, lon, at }) or null: anything else (old shape, outside Paris, a bad time) is no pin. */
  function valid(pin) {
    if (!pin || typeof pin !== 'object') return null;
    const lat = Number(pin.lat), lon = Number(pin.lon), at = Number(pin.at);
    return inParis(lat, lon) && fin(at) && at > 0 ? { lat, lon, at } : null;
  }
  /** The pin while it counts: set less than 3 hours ago (and not "in the future" by more than a minute: a clock change). */
  function fresh(pin, now = Date.now()) { const p = valid(pin); return p && now - p.at < FADE_MS && p.at <= now + 60000 ? p : null; }
  function make(lat, lon, now = Date.now()) {
    const p = valid({ lat: +(+lat).toFixed(6), lon: +(+lon).toFixed(6), at: now });
    if (!p) throw Error('That spot is outside the Paris map. Click somewhere in Paris.');
    return p;
  }
  /** 0, 1 or 2: the hours since it was set (the pin on the map gets lighter each hour). */
  const age = (pin, now = Date.now()) => Math.max(0, Math.min(2, Math.floor((now - pin.at) / 3600e3)));
  const span = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`; };
  const ageText = (pin, now = Date.now()) => (now - pin.at < 60000 ? 'just now' : `${span(now - pin.at)} ago`);
  const leftText = (pin, now = Date.now()) => `fades in ${span(FADE_MS - (now - pin.at))}`;

  // ---------- tonight's shows ----------
  // "tonight" runs until 6 am: a club night at 23:30 or 2 am is still tonight's; a show that has ended is not
  function tonightEnd(now = Date.now()) {
    const d = new Date(now), end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6, 0, 0, 0);
    if (d.getHours() >= 6) end.setDate(end.getDate() + 1);
    return end.getTime();
  }
  const ends = (s) => s.end || s.start + (s.dateOnly ? 18 : 4) * 3600e3; // the same rule as showsync-core's expires()
  const isTonight = (s, now = Date.now()) => !!s && !s.cancelled && fin(s.start) && s.start < tonightEnd(now) && ends(s) >= now;

  // ---------- what's close ----------
  /** The candidates: every Paris guide place (a 'jam' tag → a park-jam spot) and tonight's shows with a known spot.
   *  venueAt(show) → { lat, lon } | null, for a show whose own venue has no coordinates (the map's venue pins).
   *  errands: (round 67, errands67) ErrandsCore.list(journal): your open errands, with their opening-hours badge. */
  function candidates({ guide = [], shows = [], errands = [], venueAt = () => null, now = Date.now() } = {}) {
    const out = [];
    for (const g of guide) {
      if (!g || !inParis(g.lat, g.lon)) continue;
      const jam = (g.tags || []).includes('jam');
      out.push({ kind: jam ? 'jam' : 'place', id: g.id, name: g.name, lat: g.lat, lon: g.lon, arr: g.arr, tags: g.tags || [], ref: g });
    }
    for (const s of shows) {
      if (!isTonight(s, now)) continue;
      const v = s.venue || {}, at = inParis(v.lat, v.lon) ? v : venueAt(s);
      if (!at || !inParis(at.lat, at.lon)) continue;
      out.push({ kind: 'show', id: `show:${s.key || s.id}`, name: s.title, venue: v.name || '', start: s.start, lat: at.lat, lon: at.lon, ref: s });
    }
    for (const e of errands) if (e?.place && inParis(e.place.lat, e.place.lon)) out.push({ kind: 'errand', id: `errand:${e.id}`, name: e.what, venue: e.place.name || '', badge: e.badge || null, lat: e.place.lat, lon: e.place.lon, ref: e });
    return out;
  }
  /** Nearest first: within maxMin minutes on foot, by distance (= walking minutes), then tonight's shows before park
   *  spots before place quests, then by name. Each item gets m (metres), min and walk ("about N min walk"). */
  function rank(here, items, { limit = LIMIT, maxMin = MAX_MIN } = {}) {
    const p = valid({ ...here, at: here?.at || 1 }); if (!p) return [];
    const seen = new Set(), out = [];
    for (const it of items || []) {
      if (!it || seen.has(it.id) || !inParis(it.lat, it.lon)) continue; seen.add(it.id);
      const m = metres(p, it), min = minutes(m);
      if (min <= maxMin) out.push({ ...it, m: Math.round(m), min, walk: walkText(min) });
    }
    out.sort((a, b) => a.m - b.m || (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9) || String(a.name).localeCompare(String(b.name)));
    return out.slice(0, limit);
  }

  // ---------- the ✦ tracker's "Near me" row ----------
  /** { text, title } for a fresh pin, else null. count: how many are close (null when the map part isn't loaded yet). */
  function hud(pin, now = Date.now(), count = null) {
    const p = fresh(pin, now); if (!p) return null;
    const n = fin(count) ? (count ? ` · ${count} close` : ' · nothing close') : '';
    return { text: `📍 Near me${n}`, title: `Your "I'm here" pin, set ${ageText(p, now)} (${leftText(p, now)}). Click for what's close: place quests, shows tonight, park-jam spots, with walking minutes.` };
  }

  return { KEY, FADE_MS, KMH, MAX_MIN, LIMIT, BOUNDS, KINDS, inParis, metres, minutes, walkText, valid, fresh, make, age, ageText, leftText, tonightEnd, isTonight, candidates, rank, hud };
});
