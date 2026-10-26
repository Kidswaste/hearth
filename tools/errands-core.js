/* (round 67, errands67) Errands: practical quests with opening hours ("get AirPods at Apple Opéra"). The thinking, with no
   DOM (Node tests require it: dev/errands67-test.js):
     · opening hours: read what the owner types ("Mon–Sat 10:00–20:00 · Sun closed", "lun-sam 10h-20h", "22:00–02:00",
       "24/7"), write them back the same way, and say where a shop stands right now: "Open now · closes at 20:00",
       "Closes soon · at 20:00", "Opens at 10:00", "Closed now · opens tomorrow at 10:00", "Closed today · opens Mon at
       10:00". Late nights (a close after midnight) count on the next morning too; Sundays / closing days are days with
       no hours. Times are this computer's clock (the owner's Paris time).
     · a small built-in list of well-known Paris shops with their USUAL hours (always shown as "usual hours, check before
       going": Hearth never looks anything up on the network), suggested from what you typed ("AirPods" → Apple first);
     · the errand itself, stored as one small campaign in Codex's quest journal (c.errand: what, where, hours), so it is a
       real quest: "Done ✓" completes its one quest (XP, the week review, My Paris see it) without a proof review — an
       errand is self-reported, like the map's visit stamp.
   Loaded with Codex's quest rules (lazy group 'questcore') so the ✦ tracker can show errand badges cheaply; the UI is
   tools/errands.js (lazy group 'questjournal'). */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.ErrandsCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const DAY = 1440; // minutes in a day
  const LATE = 12 * 60; // a closing time may run up to 12 hours past midnight (late nights)
  const SOON = 60; // "closes soon": within the hour
  const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ORDER = [1, 2, 3, 4, 5, 6, 0]; // how a week is written: Monday first (France)
  const XP = 15, MINUTES = 30;
  const USUAL = 'usual hours, check before going';
  const fin = Number.isFinite;
  const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (m) => { const x = ((m % DAY) + DAY) % DAY; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };

  // ---------- reading hours ----------
  // day words: English, French and the OSM two-letter style; the first match wins (longest first)
  const DAYWORDS = [['monday', 1], ['tuesday', 2], ['wednesday', 3], ['thursday', 4], ['friday', 5], ['saturday', 6], ['sunday', 0],
    ['lundi', 1], ['mardi', 2], ['mercredi', 3], ['jeudi', 4], ['vendredi', 5], ['samedi', 6], ['dimanche', 0],
    ['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6], ['sun', 0], ['lun', 1], ['mar', 2], ['mer', 3], ['jeu', 4], ['ven', 5], ['sam', 6], ['dim', 0],
    ['mo', 1], ['tu', 2], ['we', 3], ['th', 4], ['fr', 5], ['sa', 6], ['su', 0]];
  const ALL = [0, 1, 2, 3, 4, 5, 6];
  const dayOf = (w) => { for (const [k, d] of DAYWORDS) if (w === k || (k.length >= 3 && w.startsWith(k) && w.length <= k.length + 6)) return d; return null; };
  function daysOf(text) {
    let t = fold(text).replace(/[–—]/g, '-').replace(/\./g, '').replace(/\s+(to|a|au|through|thru)\s+/g, '-').replace(/\s*-\s*/g, '-').trim().replace(/[:,]+$/, '').trim();
    if (!t) return ALL.slice();
    if (/^(daily|every ?day|all week|tous les jours|7\/7|7j\/7|mo-su|mon-sun|lun-dim)$/.test(t)) return ALL.slice();
    const out = new Set();
    for (const part of t.split(/\s*(?:,|&|\+|\/|\band\b|\bet\b)\s*|\s+/).filter(Boolean)) {
      if (/^(weekdays?|semaine|en semaine)$/.test(part)) { [1, 2, 3, 4, 5].forEach((d) => out.add(d)); continue; }
      if (/^(weekends?|week-ends?)$/.test(part)) { [6, 0].forEach((d) => out.add(d)); continue; }
      const r = part.split('-').filter(Boolean);
      if (r.length === 2) {
        const a = dayOf(r[0]), b = dayOf(r[1]); if (a == null || b == null) return null;
        for (let d = a, i = 0; i < 7; d = (d + 1) % 7, i++) { out.add(d); if (d === b) break; } // Mon-Sat, Fri-Mon (wraps)
      } else if (r.length === 1) { const d = dayOf(r[0]); if (d == null) return null; out.add(d); } else return null;
    }
    return out.size ? [...out] : null;
  }
  // one time: "10", "10:00", "10h", "10h30", "10.30", "7pm", "noon", "midnight"
  function minuteOf(t) {
    const w = fold(t).trim();
    if (/^(noon|midi)$/.test(w)) return 720;
    if (/^(midnight|minuit)$/.test(w)) return 0;
    const m = w.match(/^(\d{1,2})(?:\s*[:h.]\s*(\d{2}))?\s*h?\s*(am|pm)?$/); if (!m) return null;
    let h = +m[1]; const mi = m[2] ? +m[2] : 0;
    if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3] === 'pm' ? 12 : 0); }
    if (h > 24 || mi > 59 || (h === 24 && mi)) return null;
    return h * 60 + mi;
  }
  const TIME = String.raw`(?:noon|midi|midnight|minuit|\d{1,2}(?:\s*[:h.]\s*\d{2})?\s*h?\s*(?:am|pm)?)`;
  const RANGE = new RegExp(`(${TIME})\\s*(?:-|–|—|to|a|à|until|jusqu'?a)\\s*(${TIME})`, 'g');
  // intervals for one segment's time part: [[open, close]] in minutes; close > 1440 = after midnight (late night)
  function timesOf(text) {
    const t = fold(text).replace(/[–—]/g, '-').trim();
    if (/\b(closed|ferme|fermee|ferm)\b|^-$/.test(t)) return [];
    if (/24\s*\/\s*7|24\s*h(ours|eures)?\b|open 24|^24$/.test(t)) return [[0, DAY]];
    const out = []; let m; RANGE.lastIndex = 0;
    while ((m = RANGE.exec(t))) {
      const a = minuteOf(m[1]); let b = minuteOf(m[2]);
      if (a == null || b == null || a >= DAY) return null;
      if (b <= a) b += DAY; // 22:00–02:00 runs past midnight; 10:00–10:00 is the whole day
      if (b - a > DAY || b > DAY + LATE) return null;
      out.push([a, b]);
    }
    if (!out.length) return null;
    out.sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < out.length; i++) if (out[i][0] < out[i - 1][1]) return null; // overlapping ranges: unclear
    return out;
  }
  /** A week of hours: 7 lists (index = weekday, 0 = Sunday) of [open, close] minutes. Days left out are closed.
   *  Segments are split on ";", "·", "|" or new lines; a later segment overrides an earlier one for the same days.
   *  "" → null (no hours known). Throws a plain sentence when it can't be read. */
  function parse(text) {
    const src = String(text || '').trim(); if (!src) return null;
    const week = [[], [], [], [], [], [], []];
    let carry = []; // "Sat, Sun closed" split as "Sat" + "Sun closed": days with no times join the next segment's
    for (const seg of src.split(/\s*(?:;|·|\||\n|,(?=\s*[A-Za-zÀ-ÿ]))\s*/).filter(Boolean)) {
      const f = fold(seg).replace(/[–—]/g, '-');
      // where the times start: the first digit, or a word like closed / 24/7 / noon (not the 7 of a leading "7/7")
      const at = f.replace(/^7j?\s*\/\s*7/, (x) => ' '.repeat(x.length)).search(/\d|\bclosed\b|\bferme|\bnoon\b|\bmidi\b|\bmidnight\b|\bminuit\b/);
      const dayPart = (at < 0 ? f : f.slice(0, at)).replace(/\b(open|ouvert)\b/g, ''), timePart = at < 0 ? '' : f.slice(at);
      const days = daysOf(dayPart);
      if (at < 0 && days && dayPart.trim()) { carry.push(...days); continue; }
      const times = at < 0 ? null : timesOf(timePart);
      if (!days || !times) throw Error(`Couldn't read the hours "${seg}". Write them like: Mon–Sat 10:00–20:00 · Sun closed`);
      for (const d of new Set([...carry, ...days])) week[d] = times.map((x) => x.slice());
      carry = [];
    }
    if (carry.length) throw Error(`Couldn't read the hours "${src}": some days have no times. Write them like: Mon–Sat 10:00–20:00 · Sun closed`);
    return week;
  }
  const valid = (week) => Array.isArray(week) && week.length === 7 && week.every((d) => Array.isArray(d) && d.length <= 4 && d.every((x) => Array.isArray(x) && x.length === 2 && fin(x[0]) && fin(x[1]) && x[0] >= 0 && x[0] < DAY && x[1] > x[0] && x[1] <= DAY + LATE));

  // ---------- writing hours back ----------
  const span = (iv) => (iv[0] === 0 && iv[1] === DAY ? '24 h' : `${hhmm(iv[0])}–${hhmm(iv[1])}`);
  const dayText = (list) => (list.length ? list.map(span).join(', ') : 'closed');
  /** "Mon–Sat 10:00–20:00 · Sun 11:00–19:00", "Daily 10:00–21:00", "Open 24 h", "Mon–Fri 09:00–19:00 · Sat, Sun closed" */
  function format(week) {
    if (!valid(week)) return '';
    const key = (d) => dayText(week[d]);
    if (ORDER.every((d) => key(d) === key(1))) return key(1) === '24 h' ? 'Open 24 h' : key(1) === 'closed' ? 'Closed all week' : `Daily ${key(1)}`;
    const runs = [];
    for (const d of ORDER) { const last = runs[runs.length - 1]; if (last && last.k === key(d)) last.days.push(d); else runs.push({ k: key(d), days: [d] }); }
    // runs with the same hours that aren't next to each other are written together: "Sat, Sun closed"
    const merged = [];
    for (const r of runs) { const m = merged.find((x) => x.k === r.k); if (m) m.parts.push(r.days); else merged.push({ k: r.k, parts: [r.days] }); }
    const daysTxt = (parts) => parts.map((p) => (p.length > 2 ? `${NAMES[p[0]]}–${NAMES[p[p.length - 1]]}` : p.map((d) => NAMES[d]).join(', '))).join(', ');
    return merged.map((m) => `${daysTxt(m.parts)} ${m.k}`).join(' · ');
  }

  // ---------- where a shop stands right now ----------
  const minuteOfDay = (d) => d.getHours() * 60 + d.getMinutes();
  // the next opening after `now` (up to a week ahead): { ahead: days from today, day, at: minutes } or null (never opens)
  function nextOpen(week, now) {
    const today = now.getDay(), m = minuteOfDay(now);
    for (let ahead = 0; ahead <= 7; ahead++) {
      for (const [o] of week[(today + ahead) % 7]) if (ahead > 0 || o > m) return { ahead, day: (today + ahead) % 7, at: o };
    }
    return null;
  }
  const when = (ahead, day) => (ahead === 1 ? 'tomorrow' : NAMES[day]);
  /** { state, open, text, short, closesAt?, opensAt?, minutesLeft?, late?, always? }. state: 'open' | 'soon' (closes
   *  within the hour) | 'later' (opens later today) | 'closed' (after today's hours) | 'today' (closed all day today) |
   *  'never' (no open day) | 'unknown' (no hours). Times are this computer's clock. */
  function status(week, now = new Date()) {
    if (!valid(week)) return { state: 'unknown', open: false, text: 'Hours unknown', short: 'hours?' };
    const d = now.getDay(), m = minuteOfDay(now), y = (d + 6) % 7;
    // the end of the stretch we're in, in minutes from today's midnight (null: closed now)
    let end = null;
    for (const [, c] of week[y]) if (c > DAY && m < c - DAY) end = c - DAY; // last night's late hours, after midnight
    for (const [o, c] of week[d]) if (o <= m && m < c) end = c;
    if (end != null) {
      // a stretch that ends at midnight and picks up at 00:00 the next day carries on (24 h places, long weekends)
      for (let i = 0; end % DAY === 0; i++) {
        if (i >= 7) return { state: 'open', open: true, text: 'Open 24 h', short: 'open 24 h', always: true };
        const k = end / DAY, carry = week[(d + k) % 7].find((x) => x[0] === 0);
        if (!carry) break;
        end = k * DAY + carry[1];
      }
      const left = end - m, at = hhmm(end), ahead = Math.ceil(end / DAY) - 1; // ahead: 0 = closes today (or at midnight)
      const late = ahead === 1 && end - DAY <= LATE;
      const tail = ahead >= 1 && !late ? ` ${when(ahead, (d + ahead) % 7)}` : late ? ' (late)' : '';
      if (left <= SOON) return { state: 'soon', open: true, text: `Closes soon · at ${at}`, short: `closes ${at}`, closesAt: at, minutesLeft: left, late };
      return { state: 'open', open: true, text: `Open now · closes at ${at}${tail}`, short: `open till ${at}`, closesAt: at, minutesLeft: left, late };
    }
    const n = nextOpen(week, now);
    if (!n) return { state: 'never', open: false, text: 'Closed all week', short: 'closed' };
    const at = hhmm(n.at);
    if (n.ahead === 0) return { state: 'later', open: false, text: `Opens at ${at}`, short: `opens ${at}`, opensAt: at };
    if (week[d].length) return { state: 'closed', open: false, text: `Closed now · opens ${when(n.ahead, n.day)} at ${at}`, short: 'closed now', opensAt: at };
    return { state: 'today', open: false, text: `Closed today · opens ${when(n.ahead, n.day)} at ${at}`, short: 'closed today', opensAt: at };
  }

  // ---------- well-known Paris shops (usual hours; check before going) ----------
  const SHOPS = [
    { id: 'apple-opera', name: 'Apple Opéra', area: '9e · Opéra', addr: '12 rue Halévy', lat: 48.8722, lon: 2.3331, hours: 'Mon–Sat 10:00–20:00 · Sun 11:00–19:00', tags: ['apple', 'airpods', 'iphone', 'ipad', 'mac', 'macbook', 'watch', 'charger', 'cable', 'earbuds', 'ecouteurs', 'headphones', 'repair', 'genius'] },
    { id: 'apple-champs', name: 'Apple Champs-Élysées', area: '8e · Champs-Élysées', addr: '114 av. des Champs-Élysées', lat: 48.8724, lon: 2.3005, hours: 'Daily 10:00–21:00', tags: ['apple', 'airpods', 'iphone', 'ipad', 'mac', 'macbook', 'watch', 'charger', 'cable', 'earbuds', 'ecouteurs', 'headphones', 'repair', 'genius'] },
    { id: 'apple-st-germain', name: 'Apple Marché Saint-Germain', area: '6e · Saint-Germain', addr: '14 rue Lobineau', lat: 48.8527, lon: 2.3352, hours: 'Mon–Sat 10:00–20:00 · Sun 11:00–19:00', tags: ['apple', 'airpods', 'iphone', 'ipad', 'mac', 'macbook', 'watch', 'charger', 'cable', 'earbuds', 'ecouteurs', 'headphones', 'repair', 'genius'] },
    { id: 'fnac-st-lazare', name: 'Fnac Saint-Lazare', area: '9e · Saint-Lazare', addr: '109 rue Saint-Lazare', lat: 48.8758, lon: 2.3270, hours: 'Mon–Sat 10:00–20:00 · Sun 11:00–19:00', tags: ['fnac', 'airpods', 'headphones', 'casque', 'ecouteurs', 'earbuds', 'book', 'livre', 'vinyl', 'vinyle', 'record', 'cd', 'camera', 'game', 'jeu', 'console', 'cable', 'charger', 'chargeur', 'speaker', 'enceinte', 'sd card', 'hard drive', 'disque', 'ticket', 'billet'] },
    { id: 'fnac-halles', name: 'Fnac Forum des Halles', area: '1er · Les Halles', addr: 'Forum des Halles, Porte Lescot', lat: 48.8619, lon: 2.3470, hours: 'Mon–Sat 10:00–20:30 · Sun 11:00–19:00', tags: ['fnac', 'airpods', 'headphones', 'casque', 'ecouteurs', 'earbuds', 'book', 'livre', 'vinyl', 'vinyle', 'record', 'cd', 'camera', 'game', 'jeu', 'console', 'cable', 'charger', 'chargeur', 'speaker', 'enceinte', 'sd card', 'hard drive', 'disque', 'ticket', 'billet'] },
    { id: 'fnac-montparnasse', name: 'Fnac Montparnasse', area: '6e · Montparnasse', addr: '136 rue de Rennes', lat: 48.8460, lon: 2.3262, hours: 'Mon–Sat 10:00–20:00 · Sun closed', tags: ['fnac', 'airpods', 'headphones', 'casque', 'ecouteurs', 'earbuds', 'book', 'livre', 'vinyl', 'vinyle', 'record', 'cd', 'camera', 'game', 'jeu', 'console', 'cable', 'charger', 'chargeur', 'speaker', 'enceinte', 'ticket', 'billet'] },
    { id: 'bhv-marais', name: 'BHV Marais', area: '4e · Hôtel de Ville', addr: '52 rue de Rivoli', lat: 48.8575, lon: 2.3533, hours: 'Mon–Sat 10:00–20:00 · Sun 11:00–19:00', tags: ['bhv', 'hardware', 'bricolage', 'tools', 'outils', 'screw', 'vis', 'paint', 'peinture', 'home', 'maison', 'light bulb', 'ampoule', 'adapter', 'adaptateur', 'cable', 'kitchen', 'cuisine', 'storage', 'rangement', 'frame', 'cadre'] },
    { id: 'galeries-lafayette', name: 'Galeries Lafayette Haussmann', area: '9e · Opéra', addr: '40 bd Haussmann', lat: 48.8736, lon: 2.3320, hours: 'Mon–Sat 10:00–20:30 · Sun 11:00–20:00', tags: ['galeries', 'lafayette', 'clothes', 'vetement', 'gift', 'cadeau', 'perfume', 'parfum', 'shoes', 'chaussures', 'beauty', 'bag', 'sac', 'jacket', 'veste'] },
    { id: 'printemps', name: 'Printemps Haussmann', area: '9e · Opéra', addr: '64 bd Haussmann', lat: 48.8738, lon: 2.3275, hours: 'Mon–Sat 10:00–20:00 · Sun 11:00–20:00', tags: ['printemps', 'clothes', 'vetement', 'gift', 'cadeau', 'perfume', 'parfum', 'shoes', 'chaussures', 'beauty', 'bag', 'sac', 'jacket', 'veste'] },
    { id: 'gibert-st-michel', name: 'Gibert Joseph Saint-Michel', area: '6e · Saint-Michel', addr: '26 bd Saint-Michel', lat: 48.8521, lon: 2.3436, hours: 'Mon–Sat 10:00–20:00 · Sun closed', tags: ['gibert', 'book', 'livre', 'textbook', 'used book', 'occasion', 'stationery', 'papeterie', 'notebook', 'carnet', 'cd', 'vinyl', 'dvd'] },
    { id: 'monoprix-republique', name: 'Monoprix République', area: '3e · République', addr: '171 rue du Temple', lat: 48.8669, lon: 2.3622, hours: 'Mon–Sat 08:00–22:00 · Sun 09:30–13:00', tags: ['monoprix', 'groceries', 'courses', 'food', 'snack', 'battery', 'piles', 'toiletries', 'shampoo', 'socks', 'chaussettes', 'tape', 'scotch', 'charger', 'chargeur', 'umbrella', 'parapluie'] },
    { id: 'pharmacie-champs', name: 'Pharmacie des Champs-Élysées', area: '8e · Champs-Élysées', addr: '84 av. des Champs-Élysées', lat: 48.8711, lon: 2.3030, hours: 'Open 24 h', tags: ['pharmacy', 'pharmacie', 'medicine', 'medicament', 'plaster', 'pansement', 'paracetamol', 'doliprane', 'sunscreen', 'creme', 'earplug', 'bouchons', 'night', 'late'] },
    { id: 'pharmacie-clichy', name: 'Pharmacie Européenne (place de Clichy)', area: '9e · Clichy', addr: '6 place de Clichy', lat: 48.8836, lon: 2.3275, hours: 'Open 24 h', tags: ['pharmacy', 'pharmacie', 'medicine', 'medicament', 'plaster', 'pansement', 'paracetamol', 'doliprane', 'earplug', 'bouchons', 'night', 'late'] },
  ].map((s) => ({ ...s, week: parse(s.hours), usual: true }));
  const shop = (id) => SHOPS.find((s) => s.id === id) || null;
  const words = (t) => fold(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 2).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
  function metres(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  /** Shops for what you typed: the ones whose words match first (most matches), then nearest to `near` (a pin), then
   *  in the list's order. With nothing typed (or nothing matching) every shop comes, nearest / by name. Each gets `match` (0..n). */
  function suggest(what, { near = null, limit = 4 } = {}) {
    const ws = words(what);
    const scored = SHOPS.map((s, i) => {
      const hay = [fold(s.name), ...s.tags];
      const match = ws.reduce((n, w) => n + (hay.some((t) => t === w || (w.length >= 3 && (t.startsWith(w) || t.includes(` ${w}`) || (w.length >= 4 && t.includes(w))))) ? 1 : 0), 0);
      return { ...s, match, i, m: near && fin(near.lat) ? metres(near, s) : null };
    });
    const any = scored.some((s) => s.match);
    // ties: the list's own order (the usual pick first: Apple Opéra for anything Apple)
    return scored.filter((s) => !any || s.match).sort((a, b) => b.match - a.match || (a.m ?? 0) - (b.m ?? 0) || a.i - b.i).slice(0, limit);
  }

  // ---------- the errand in Codex's journal ----------
  const isErrand = (c) => !!(c && c.errand && typeof c.errand === 'object' && String(c.id).startsWith('c-errand-'));
  const qidOf = (c) => c.quests[0].id;
  const doneOf = (s, c) => Boolean(s.records?.[qidOf(c)]?.completedAt);
  const BOUNDS = { s: 48.7, n: 49, w: 2.15, e: 2.6 }; // the Paris map's own limits (quest-atlas.js)
  const inParis = (lat, lon) => fin(lat) && fin(lon) && lat >= BOUNDS.s && lat <= BOUNDS.n && lon >= BOUNDS.w && lon <= BOUNDS.e;
  const clean = (t, n) => String(t ?? '').replace(/[\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  /** The fields a new / edited errand needs, checked: { what, place: { name, addr, lat, lon, shop }, week, usual }. */
  function checkInput({ what, place = {}, hours, week, usual } = {}) {
    const w = clean(what, 80); if (!w) throw Error('Type what the errand is for, like AirPods.');
    const lat = Number(place.lat), lon = Number(place.lon);
    if (!inParis(lat, lon)) throw Error('Choose where: a suggested shop, or click a spot on the Paris map.');
    const name = clean(place.name, 80) || 'A spot on the map';
    const wk = week !== undefined ? week : parse(hours); // throws a plain sentence when the hours can't be read
    if (wk !== null && !valid(wk)) throw Error('Those opening hours don’t look right.');
    const sh = place.shop && shop(place.shop) ? place.shop : null;
    return { what: w, place: { name, addr: clean(place.addr, 120), lat: +lat.toFixed(6), lon: +lon.toFixed(6), shop: sh }, week: wk, usual: Boolean(usual ?? (sh && wk && format(wk) === format(shop(sh).week))) };
  }
  const titleOf = (e) => `Get ${e.what}`.slice(0, 100);
  function questOf(cid, e) {
    return { id: `q-${cid.slice(2)}-1`, title: `${titleOf(e)} at ${e.place.name}`.slice(0, 250), done: `Go to ${e.place.name}${e.place.addr ? ` (${e.place.addr})` : ''} and get ${e.what}. Click Done ✓ when you have it.`.slice(0, 1000),
      tiny: e.week ? 'Look at the hours badge, then leave while it says open.' : 'Check when it’s open, then go.', deep: 'An errand: done when you have it. No proof needed.', minutes: MINUTES, xp: XP, tool: null };
  }
  const newId = (now = Date.now(), rnd = Math.random) => `c-errand-${now.toString(36)}${Math.floor(rnd() * 1296).toString(36).padStart(2, '0')}`;
  /** Adds an errand campaign to the journal draft s. Doesn't take over the main quest (s.active stays). */
  function add(s, input, { now = Date.now(), id = newId(now) } = {}) {
    const e = checkInput(input);
    if (s.campaigns.length >= 100) throw Error('Your journal holds up to 100 campaigns. Finish or remove one first.');
    if (s.campaigns.some((c) => c.id === id)) throw Error('Try again in a moment.');
    const errand = { v: 1, what: e.what, place: e.place, week: e.week, usual: e.usual, createdAt: new Date(now).toISOString(), doneAt: null };
    const c = { id, title: titleOf(e), subtitle: 'PARIS / ERRAND', path: 'life', why: `${e.what} from ${e.place.name}${e.place.addr ? `, ${e.place.addr}` : ''}.`.slice(0, 600), badge: 'Errand runner', errand, quests: [questOf(id, e)] };
    s.campaigns.push(c); return c;
  }
  /** Changes an open errand (what, where, hours). Its quest keeps its id (and anything already recorded). */
  function edit(s, id, input) {
    const c = s.campaigns.find((x) => x.id === id); if (!isErrand(c)) throw Error('That errand is no longer in your journal.');
    const e = checkInput({ what: c.errand.what, place: c.errand.place, ...('hours' in input || 'week' in input ? {} : { week: c.errand.week }), ...input }); // typed hours win over the old ones
    c.errand = { ...c.errand, what: e.what, place: e.place, week: e.week, usual: e.usual };
    const q = questOf(id, e); Object.assign(c.quests[0], { title: q.title, done: q.done, tiny: q.tiny });
    c.title = titleOf(e); c.why = `${e.what} from ${e.place.name}${e.place.addr ? `, ${e.place.addr}` : ''}.`.slice(0, 600);
    return c;
  }
  /** "Done ✓": completes the errand's one quest (self-reported: an errand needs no proof review). Returns the XP won. */
  function complete(s, id, at = new Date().toISOString()) {
    const c = s.campaigns.find((x) => x.id === id); if (!isErrand(c)) throw Error('That errand is no longer in your journal.');
    const qid = qidOf(c), r = s.records[qid] || {};
    if (r.completedAt) return 0;
    s.records[qid] = { ...r, completedAt: at, note: `Errand done: ${c.errand.what} (${c.errand.place.name}). Self-reported.`.slice(0, 2000), artifact: null };
    c.errand = { ...c.errand, doneAt: at };
    if (s.focus?.quest === qid) s.focus = null;
    if (s.plan?.quest === qid) s.plan = null;
    return c.quests[0].xp - (r.startedAt ? 5 : 0);
  }
  /** Takes an errand off the journal (its campaign and its quest's history). */
  function remove(s, id) {
    const i = s.campaigns.findIndex((x) => x.id === id); if (i < 0 || !isErrand(s.campaigns[i])) return false;
    const qids = s.campaigns[i].quests.map((q) => q.id);
    s.campaigns.splice(i, 1);
    for (const q of qids) { delete s.records[q]; if (s.submissions) delete s.submissions[q]; if (s.tiny) delete s.tiny[q]; if (s.contracts) delete s.contracts[q]; if (s.plan?.quest === q) s.plan = null; if (s.focus?.quest === q) s.focus = null; }
    if (s.active === id) s.active = null;
    for (const p of s.weekly?.plans || []) if (Array.isArray(p.items)) p.items = p.items.filter((it) => it.campaign !== id && !qids.includes(it.quest)); // (weekquest62's plan)
    return true;
  }
  const RANK = { open: 0, soon: 1, later: 2, closed: 3, today: 4, unknown: 5, never: 6 };
  /** The errands still to do, each { id, qid, what, place, week, usual, badge }: open ones first (closing soonest first
   *  among them), then the ones opening later, then closed; newest first otherwise. done: true lists finished ones. */
  function list(s, { now = new Date(), done = false } = {}) {
    if (!s?.campaigns) return [];
    return s.campaigns.filter((c) => isErrand(c) && doneOf(s, c) === done).map((c) => ({ id: c.id, qid: qidOf(c), what: c.errand.what, place: c.errand.place, week: c.errand.week, usual: !!c.errand.usual, createdAt: c.errand.createdAt, doneAt: c.errand.doneAt || s.records?.[qidOf(c)]?.completedAt || null, badge: status(c.errand.week, now) }))
      .sort((a, b) => (RANK[a.badge.state] - RANK[b.badge.state]) || ((a.badge.minutesLeft ?? 1e9) - (b.badge.minutesLeft ?? 1e9)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  const byId = (s, id) => list(s, { now: new Date() }).find((e) => e.id === id) || null;
  const tone = (st) => ({ open: 'er-open', soon: 'er-soon', later: 'er-later', closed: 'er-closed', today: 'er-closed', never: 'er-closed' }[st] || 'er-unknown');

  return { DAY, XP, USUAL, NAMES, SHOPS, shop, parse, format, valid, status, suggest, metres, inParis, checkInput, add, edit, complete, remove, list, byId, isErrand, tone, newId, hhmm };
});
