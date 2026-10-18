// (round 62, showprep62) Show night companion: the pure parts (no fs, no network, no DOM), shared by the window
// (showprep.js: the Get ready card, How was it?, the log, /shows prep|went|log) and the main process (showprepmain.js:
// the one reminder timer). Built around showsync61's show shape (showsync-core.js).
//   paris.offset(ms) / paris.parts(ms) / paris.utc(y, m, d, h, mi)   Europe/Paris time without the computer's zone
//                                (EU rule: summer time from the last Sunday of March to the last Sunday of October, 01:00 UTC)
//   ics(show, { now })           a calendar file (.ics) in Paris time with its VTIMEZONE (Apple / Outlook / Google import)
//   googleLink(show)             "add to Google Calendar" (a plain link; nothing is signed in to)
//   nearest(lat, lon, n)         the closest Métro stations from a small bundled list, with lines and walking minutes
//   routeLinks(venue)            Citymapper (to the venue) and RATP's planner, for live routes
//   listen(name, links)          one public link per artist: the listing's listening page, else its artist page, else a search
//   reminderAt(show) / nextReminder(store, now, fired)   when the day's reminder goes (never in the quiet hours)
//   entry(raw) / validate(store) / merge(a, b) / stats(store)   the "Shows I went to" log
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.ShowPrepCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const H = 3600e3, DAY = 24 * H;
  const str = (v, max = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const fold = (s) => str(s, 400).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const p2 = (n) => String(n).padStart(2, '0');

  // ---------- Paris time ----------
  const lastSunday = (y, month) => { const d = Date.UTC(y, month + 1, 0); return d - new Date(d).getUTCDay() * DAY; };
  function offset(ms) { // minutes east of UTC: 120 in summer time, 60 otherwise
    const y = new Date(ms).getUTCFullYear(), on = lastSunday(y, 2) + H, off = lastSunday(y, 9) + H;
    return ms >= on && ms < off ? 120 : 60;
  }
  function parts(ms) { const d = new Date(ms + offset(ms) * 60e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay() }; }
  function utc(y, m, d, h = 0, mi = 0) { // Paris wall time → ms (a time skipped in March reads as summer time)
    const wall = Date.UTC(y, m - 1, d, h, mi);
    let t = wall - offset(wall - 60 * 60e3) * 60e3;
    if (offset(t) * 60e3 !== wall - t) t = wall - offset(t) * 60e3;
    return t;
  }
  const paris = { offset, parts, utc };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hm = (ms) => { const t = parts(ms); return `${p2(t.h)}:${p2(t.mi)}`; };
  const dateWords = (ms) => { const t = parts(ms); return `${DAYS[t.dow].slice(0, 3)} ${t.d} ${MONTHS[t.m - 1]}`; };
  // the Paris day a show belongs to: a start before 6 am is the night before
  function nightOf(ms) { const t = parts(ms); const base = utc(t.y, t.m, t.d, 12); const n = parts(t.h < 6 ? base - DAY : base); return { y: n.y, m: n.m, d: n.d }; }
  function dayWord(ms, now = Date.now()) {
    const a = nightOf(now), b = nightOf(ms), diff = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY);
    if (diff === 0) return 'tonight'; if (diff === 1) return 'tomorrow'; if (diff === -1) return 'last night';
    if (diff > 1 && diff < 7) return `on ${DAYS[parts(utc(b.y, b.m, b.d, 12)).dow]}`;
    return `on ${dateWords(ms)}`;
  }
  // a show without an end: a club night (starts ≥ 22:00 or before 6:00) runs 6 h, a concert 3 h
  const endOf = (show) => { const s = show.start, e = Number(show.end); if (Number.isFinite(e) && e > s && e - s <= 18 * H) return e; const h = parts(s).h; return s + (h >= 22 || h < 6 ? 6 : 3) * H; };

  // ---------- calendar ----------
  const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const local = (ms) => { const t = parts(ms); return `${t.y}${p2(t.m)}${p2(t.d)}T${p2(t.h)}${p2(t.mi)}00`; };
  const zulu = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  function foldLine(line) { // RFC 5545: lines of at most 75 octets, continued with one space
    let out = '', part = '', size = 0;
    for (const ch of line) { const n = new TextEncoder().encode(ch).length; if (size + n > 75) { out += part + '\r\n'; part = ' '; size = 1; } part += ch; size += n; }
    return out + part;
  }
  const VTIMEZONE = ['BEGIN:VTIMEZONE', 'TZID:Europe/Paris', 'X-LIC-LOCATION:Europe/Paris',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  const where = (show) => [show.venue?.name, show.venue?.address].filter(Boolean).join(', ');
  const ticketUrl = (show) => (show.tickets || []).find((t) => t.url)?.url || show.url || '';
  function details(show) {
    const lines = [];
    if (show.doors) lines.push(`Doors ${hm(show.doors)}, starts ${hm(show.start)} (Paris time)`);
    if (show.lineup?.length) lines.push(`Lineup: ${show.lineup.join(', ')}`);
    const st = nearest(show.venue?.lat, show.venue?.lon, 2);
    if (st.length) lines.push(`Métro: ${st.map((x) => `${x.name} (${x.lines.join(', ')}) ${x.walk} min walk`).join(' · ')}`);
    if (ticketUrl(show)) lines.push(`Tickets: ${ticketUrl(show)}`);
    lines.push('Added from Hearth (Shotgun / DICE listing): check the ticket page for changes.');
    return lines.join('\n');
  }
  function ics(show, { now = Date.now() } = {}) {
    if (!show || !Number.isFinite(show.start)) throw Error('This show has no date.');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hearth//Show night//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...VTIMEZONE,
      'BEGIN:VEVENT', `UID:show-${show.key}@hearth`, `DTSTAMP:${zulu(now)}`,
      `DTSTART;TZID=Europe/Paris:${local(show.start)}`, `DTEND;TZID=Europe/Paris:${local(endOf(show))}`,
      `SUMMARY:${esc(show.title)}`, ...(where(show) ? [`LOCATION:${esc(where(show))}`] : []),
      ...(Number.isFinite(show.venue?.lat) && Number.isFinite(show.venue?.lon) ? [`GEO:${show.venue.lat.toFixed(6)};${show.venue.lon.toFixed(6)}`] : []),
      `DESCRIPTION:${esc(details(show))}`, ...(ticketUrl(show) ? [`URL:${ticketUrl(show)}`] : []), 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR'];
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }
  const fileName = (show) => `${fold(show.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'show'}.ics`;
  function googleLink(show) {
    const q = new URLSearchParams({ action: 'TEMPLATE', text: show.title, dates: `${zulu(show.start)}/${zulu(endOf(show))}`, details: details(show), location: where(show), ctz: 'Europe/Paris' });
    return `https://calendar.google.com/calendar/render?${q}`;
  }

  // ---------- getting there: Métro stations (a small bundled list; live routes are Citymapper's / RATP's) ----------
  // [name, lat, lon, lines] — central Paris and the venues showsync61 sees most (Pigalle, République, Oberkampf,
  // Bastille, Bercy, La Villette, Belleville…). Not every station: the nearest few within 1.5 km are enough for a hint.
  const STATIONS = [
    ['Blanche', 48.8838, 2.3324, ['2']], ['Pigalle', 48.8822, 2.3374, ['2', '12']], ['Anvers', 48.8828, 2.3441, ['2']], ['Place de Clichy', 48.8836, 2.3274, ['2', '13']],
    ['Abbesses', 48.8844, 2.3384, ['12']], ['Barbès–Rochechouart', 48.8837, 2.3497, ['2', '4']], ['La Chapelle', 48.8844, 2.3604, ['2']], ['Stalingrad', 48.8843, 2.3678, ['2', '5', '7']],
    ['Jaurès', 48.8826, 2.3704, ['2', '5', '7bis']], ['Colonel Fabien', 48.8778, 2.3704, ['2']], ['Belleville', 48.8722, 2.3767, ['2', '11']], ['Ménilmontant', 48.8664, 2.3834, ['2']],
    ['Père Lachaise', 48.8625, 2.3874, ['2', '3']], ['Laumière', 48.8851, 2.3795, ['5']], ['Ourcq', 48.8869, 2.3864, ['5']], ['Porte de Pantin', 48.8885, 2.3920, ['5']],
    ['Porte de la Villette', 48.8975, 2.3858, ['7']], ['Corentin Cariou', 48.8946, 2.3820, ['7']], ['Crimée', 48.8909, 2.3770, ['7']], ['Riquet', 48.8882, 2.3734, ['7']],
    ['Buttes Chaumont', 48.8785, 2.3816, ['7bis']], ['Botzaris', 48.8796, 2.3889, ['7bis']], ['Pyrénées', 48.8738, 2.3852, ['11']], ['Jourdain', 48.8752, 2.3895, ['11']],
    ['Goncourt', 48.8700, 2.3707, ['11']], ['République', 48.8673, 2.3636, ['3', '5', '8', '9', '11']], ['Oberkampf', 48.8648, 2.3681, ['5', '9']], ['Parmentier', 48.8652, 2.3747, ['3']],
    ['Saint-Ambroise', 48.8613, 2.3740, ['9']], ['Voltaire', 48.8576, 2.3799, ['9']], ['Charonne', 48.8550, 2.3849, ['9']], ['Filles du Calvaire', 48.8631, 2.3667, ['8']],
    ['Saint-Sébastien–Froissart', 48.8610, 2.3673, ['8']], ['Richard-Lenoir', 48.8600, 2.3718, ['5']], ['Bréguet-Sabin', 48.8562, 2.3703, ['5']], ['Bastille', 48.8531, 2.3691, ['1', '5', '8']],
    ['Ledru-Rollin', 48.8513, 2.3762, ['8']], ['Gare de Lyon', 48.8443, 2.3739, ['1', '14']], ['Bercy', 48.8402, 2.3794, ['6', '14']], ['Cour Saint-Émilion', 48.8333, 2.3866, ['14']],
    ['Quai de la Gare', 48.8371, 2.3727, ['6']], ['Bibliothèque François Mitterrand', 48.8299, 2.3762, ['14']], ['Gare d’Austerlitz', 48.8435, 2.3644, ['5', '10']], ['Place d’Italie', 48.8311, 2.3557, ['5', '6', '7']],
    ['Nation', 48.8482, 2.3958, ['1', '2', '6', '9']], ['Alexandre Dumas', 48.8562, 2.3945, ['2']], ['Porte de Montreuil', 48.8535, 2.4109, ['9']], ['Porte Dorée', 48.8350, 2.4059, ['8']],
    ['Saint-Paul', 48.8552, 2.3610, ['1']], ['Hôtel de Ville', 48.8573, 2.3519, ['1', '11']], ['Châtelet', 48.8586, 2.3474, ['1', '4', '7', '11', '14']], ['Les Halles', 48.8625, 2.3461, ['4']],
    ['Arts et Métiers', 48.8653, 2.3561, ['3', '11']], ['Temple', 48.8668, 2.3614, ['3']], ['Strasbourg–Saint-Denis', 48.8696, 2.3543, ['4', '8', '9']], ['Château d’Eau', 48.8724, 2.3561, ['4']],
    ['Bonne Nouvelle', 48.8706, 2.3486, ['8', '9']], ['Grands Boulevards', 48.8716, 2.3434, ['8', '9']], ['Gare de l’Est', 48.8763, 2.3582, ['4', '5', '7']], ['Gare du Nord', 48.8797, 2.3550, ['4', '5']],
    ['Marx Dormoy', 48.8905, 2.3598, ['12']], ['Porte de la Chapelle', 48.8977, 2.3594, ['12']], ['Jules Joffrin', 48.8925, 2.3445, ['12']], ['Lamarck–Caulaincourt', 48.8897, 2.3386, ['12']],
    ['Porte de Clichy', 48.8945, 2.3133, ['13', '14']], ['Saint-Lazare', 48.8754, 2.3254, ['3', '12', '13', '14']], ['Opéra', 48.8710, 2.3316, ['3', '7', '8']], ['Madeleine', 48.8700, 2.3247, ['8', '12', '14']],
    ['Concorde', 48.8656, 2.3212, ['1', '8', '12']], ['Champs-Élysées–Clemenceau', 48.8676, 2.3143, ['1', '13']], ['Charles de Gaulle–Étoile', 48.8738, 2.2950, ['1', '2', '6']], ['Alma–Marceau', 48.8645, 2.3010, ['9']],
    ['Trocadéro', 48.8631, 2.2873, ['6', '9']], ['Bir-Hakeim', 48.8539, 2.2895, ['6']], ['La Motte-Picquet–Grenelle', 48.8496, 2.2984, ['6', '8', '10']], ['Invalides', 48.8610, 2.3146, ['8', '13']],
    ['Saint-Germain-des-Prés', 48.8539, 2.3335, ['4']], ['Odéon', 48.8520, 2.3388, ['4', '10']], ['Saint-Michel', 48.8535, 2.3440, ['4']], ['Sèvres–Babylone', 48.8516, 2.3266, ['10', '12']],
    ['Montparnasse–Bienvenüe', 48.8429, 2.3211, ['4', '6', '12', '13']], ['Edgar Quinet', 48.8410, 2.3254, ['6']], ['Gaîté', 48.8384, 2.3224, ['13']], ['Denfert-Rochereau', 48.8338, 2.3326, ['4', '6']],
    ['Porte de Versailles', 48.8325, 2.2878, ['12']], ['Balard', 48.8366, 2.2784, ['8']], ['Mairie de Montreuil', 48.8622, 2.4413, ['9']], ['Saint-Ouen', 48.9047, 2.3221, ['13', '14']]
  ].map(([name, lat, lon, lines]) => ({ name, lat, lon, lines }));
  function meters(a, b, c, d) { const R = 6371e3, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * R; }
  function nearest(lat, lon, n = 3, max = 1500) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return STATIONS.map((s) => ({ ...s, m: Math.round(meters(lat, lon, s.lat, s.lon)) })).filter((s) => s.m <= max).sort((a, b) => a.m - b.m).slice(0, n)
      .map((s) => ({ name: s.name, lines: s.lines, m: s.m, walk: Math.max(1, Math.round(s.m * 1.3 / 80)) })); // streets aren't straight: ×1.3, 80 m a minute
  }
  function routeLinks(venue = {}) {
    const name = venue.name || venue.address || 'the venue', has = Number.isFinite(venue.lat) && Number.isFinite(venue.lon);
    const q = new URLSearchParams({ ...(has ? { endcoord: `${venue.lat},${venue.lon}` } : {}), endname: name, ...(venue.address ? { endaddress: venue.address } : {}) });
    return { citymapper: `https://citymapper.com/directions?${q}`, ratp: 'https://www.ratp.fr/itineraires' };
  }
  const metroLine = (st) => st.map((x) => `${x.name} (${x.lines.length > 1 ? 'lines ' : 'line '}${x.lines.join(', ')}) ${x.walk} min`).join(' · ');

  // ---------- the lineup: one public link per artist ----------
  function listen(name, links = {}) {
    const l = links?.[name] || Object.entries(links || {}).find(([k]) => fold(k) === fold(name))?.[1];
    if (l?.listen) return { url: l.listen, kind: 'listen', label: (() => { try { return new URL(l.listen).hostname.replace(/^www\.|^open\.|^music\./, ''); } catch { return 'listen'; } })() };
    if (l?.page) return { url: l.page, kind: 'page', label: /dice\.fm/.test(l.page) ? 'DICE' : 'Shotgun' };
    return { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`, kind: 'search', label: 'search' };
  }
  // pages Hearth can follow in showsync61 (an artist's or a venue's Shotgun / DICE page)
  function followable(show) {
    const out = [], ok = (u, kind) => { try { const p = new URL(u); return /(^|\.)shotgun\.live$|(^|\.)dice\.fm$/i.test(p.hostname) && (kind === 'venue' ? /\/venues?\//i.test(p.pathname) : /\/artists?\//i.test(p.pathname)); } catch { return false; } };
    if (show.venue?.url && ok(show.venue.url, 'venue')) out.push({ kind: 'venue', name: show.venue.name || 'the venue', url: show.venue.url });
    for (const [name, l] of Object.entries(show.links || {})) if (l.page && ok(l.page, 'artist')) out.push({ kind: 'artist', name, url: l.page });
    return out.slice(0, 5);
  }

  // ---------- the reminder on the day ----------
  // about 3 h before the start, between 10:00 and 20:00 on the show's day (Paris time): never in the quiet hours
  function reminderAt(show) {
    if (!Number.isFinite(show?.start)) return null;
    const n = nightOf(show.start), lo = utc(n.y, n.m, n.d, 10), hi = utc(n.y, n.m, n.d, 20);
    const at = Math.min(Math.max(show.start - 3 * H, lo), hi);
    return Math.min(at, show.start - H);
  }
  const QUIET = (ms) => { const h = parts(ms).h; return h >= 22 || h < 9; };
  // the next reminder to arm: { at, key, title, body } or null. Missed (Hearth was closed)? Still worth it up to 45 min
  // before the start, and never in the quiet hours.
  function nextReminder(store, now = Date.now(), fired = {}) {
    let best = null;
    for (const [key, p] of Object.entries(store?.prep || {})) {
      if (!p?.remind || fired[key] || !p.show || !Number.isFinite(p.show.start) || p.show.start <= now) continue;
      let at = reminderAt(p.show);
      if (at < now) { if (now > p.show.start - 45 * 60e3 || QUIET(now)) continue; at = now + 30e3; }
      if (!best || at < best.at) best = { at, key, title: `${who(p.show)} ${dayWord(p.show.start, at)}`, body: reminderBody(p.show) };
    }
    return best;
  }
  const who = (show) => (show.lineup?.length ? show.lineup.slice(0, 2).join(' & ') : show.title);
  function reminderBody(show) {
    const st = nearest(show.venue?.lat, show.venue?.lon, 1)[0];
    return [`${show.doors ? `Doors ${hm(show.doors)} · ` : ''}starts ${hm(show.start)}`, show.venue?.name, st ? `Métro ${st.name}, ${st.walk} min walk` : ''].filter(Boolean).join(' · ');
  }

  // ---------- a show as it is kept (prep / log), whatever page it came from ----------
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
  const httpsUrl = (v) => { try { const u = new URL(String(v || '')); return u.protocol === 'https:' && !u.username && !u.password ? u.href.slice(0, 1000) : ''; } catch { return ''; } };
  function keep(show) {
    if (!show || !/^[a-z0-9]{6,40}$/.test(String(show.key || '')) || !str(show.title) || !Number.isFinite(Number(show.start))) throw Error('That show can’t be kept (no name or date).');
    const links = {};
    for (const [k, v] of Object.entries(show.links || {}).slice(0, 20)) { const name = str(k, 80); if (name && v && typeof v === 'object') links[name] = { page: httpsUrl(v.page), listen: httpsUrl(v.listen) }; }
    const v = show.venue || {};
    return { key: show.key, title: str(show.title, 160), start: Number(show.start), end: num(show.end), doors: num(show.doors),
      venue: { key: str(v.key, 120), name: str(v.name, 120), address: str(v.address, 200), lat: num(v.lat), lon: num(v.lon), url: httpsUrl(v.url) },
      lineup: (show.lineup || []).map((x) => str(x, 80)).filter(Boolean).slice(0, 20), links,
      tickets: (show.tickets || []).filter((t) => httpsUrl(t?.url)).slice(0, 4).map((t) => ({ platform: str(t.platform, 20), url: httpsUrl(t.url) })),
      platforms: (show.platforms || []).map((x) => str(x, 20)).filter(Boolean).slice(0, 3) };
  }

  // ---------- the "Shows I went to" log ----------
  const iso = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : '');
  const localPath = (x) => typeof x === 'string' && x.length <= 2000 && /^(?:[a-z]:[\\/]|\/)/i.test(x) && !/^[\\/]{2}|[\x00-\x1f]/.test(x);
  const empty = () => ({ v: 1, went: [], prep: {} });
  function entry(raw, now = new Date().toISOString()) {
    const show = keep(raw.show || raw);
    const rating = raw.rating == null || raw.rating === '' ? null : Number(raw.rating);
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw Error('Rate it from 1 to 5 stars (or leave it).');
    const moment = str(raw.moment, 300); if (!moment) throw Error('Write one moment from the night (one line is enough).');
    const photo = raw.photo && localPath(raw.photo.path) ? { path: raw.photo.path, jpg: localPath(raw.photo.jpg) ? raw.photo.jpg : '' } : null;
    return { id: `went-${show.key}`, key: show.key, show, rating, moment, photo, note: localPath(raw.note) ? raw.note : '', questId: str(raw.questId, 100),
      at: iso(raw.at) || now, updatedAt: iso(raw.updatedAt) || now };
  }
  function validate(s) {
    if (!s || typeof s !== 'object' || s.v !== 1 || !Array.isArray(s.went) || s.went.length > 1000 || (s.prep != null && (typeof s.prep !== 'object' || Array.isArray(s.prep)))) throw Error('The show log could not be read safely.');
    const out = empty(), ids = new Set();
    for (const e of s.went) { const x = entry(e, e.updatedAt); if (ids.has(x.id)) throw Error('The show log has a duplicate entry.'); ids.add(x.id); if (e.removedAt) x.removedAt = iso(e.removedAt); out.went.push(x); }
    for (const [key, p] of Object.entries(s.prep || {}).slice(0, 200)) { if (!p || typeof p !== 'object') continue; const show = keep(p.show); if (show.key !== key) continue; out.prep[key] = { show, remind: p.remind === true, at: iso(p.at) || new Date(0).toISOString() }; }
    return out;
  }
  // two copies (this window's and the file another window / computer just wrote) → one: per entry the newer edit wins,
  // a removal is an edit too; per prepared show the newer choice wins; shows over two days old leave the prep list
  function merge(a, b, now = Date.now()) {
    const A = a ? validate(a) : empty(), B = b ? validate(b) : empty(), went = new Map();
    for (const e of [...A.went, ...B.went]) { const o = went.get(e.id); if (!o || e.updatedAt > o.updatedAt) went.set(e.id, e); }
    const prep = {};
    for (const [k, p] of [...Object.entries(A.prep), ...Object.entries(B.prep)]) if (endOf(p.show) > now - 2 * DAY && (!prep[k] || p.at > prep[k].at)) prep[k] = p;
    return { v: 1, went: [...went.values()].sort((x, y) => y.show.start - x.show.start).slice(0, 1000), prep };
  }
  function stats(s) {
    const list = (s?.went || []).filter((e) => !e.removedAt), venues = new Map(), artists = new Map();
    for (const e of list) {
      const k = e.show.venue.key || fold(e.show.venue.name), v = venues.get(k) || { key: k, name: e.show.venue.name, lat: e.show.venue.lat, lon: e.show.venue.lon, n: 0, last: 0 };
      v.n++; v.last = Math.max(v.last, e.show.start); if (!Number.isFinite(v.lat) && Number.isFinite(e.show.venue.lat)) { v.lat = e.show.venue.lat; v.lon = e.show.venue.lon; } venues.set(k, v);
      for (const a of e.show.lineup) { const ak = fold(a); const x = artists.get(ak) || { name: a, n: 0 }; x.n++; artists.set(ak, x); }
    }
    const rated = list.filter((e) => e.rating);
    return { count: list.length, venues: [...venues.values()].sort((a, b) => b.n - a.n || b.last - a.last), artists: [...artists.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
      rating: rated.length ? Math.round(rated.reduce((n, e) => n + e.rating, 0) / rated.length * 10) / 10 : null, last: list[0] || null };
  }
  const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

  return { paris, hm, dateWords, nightOf, dayWord, endOf, ics, fileName, googleLink, foldLine, STATIONS, nearest, routeLinks, metroLine, listen, followable,
    reminderAt, nextReminder, reminderBody, who, keep, empty, entry, validate, merge, stats, stars, fold };
});
