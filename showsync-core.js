// (round 61, showsync61) This week's shows in Paris from Shotgun and DICE: the pure parts (no fs, no network), shared by
// the main process (showsyncmain.js: polite fetches, caches) and the window (showsync.js: map pins, list, /shows).
// Neither platform has a public API a fan can use (Shotgun's Events API and DICE's partner widget both need an
// organizer / partner key), so Hearth reads what their public pages publish for search engines: schema.org Event data
// (<script type="application/ld+json">). A Next.js page's own JSON (__NEXT_DATA__) is a fallback, read generically.
// When a page stops yielding shows, the last good list is kept and ONE plain line says so (statusLine).
//   sourceFromUrl(url)            a Shotgun / DICE link → { id, platform, kind: city|venue|artist|event, url, label } or null
//   parsePage(html, src)          → { shows, via: 'jsonld' | 'next' | 'none', blocked }
//   merge(lists)                  both platforms → one list (same venue + same night + similar title = one show)
//   venues(shows) / pins(venues)  map pins with their logos (inside the Paris map area only)
//   applyResult(cache, src, r)    a fetch result into the cache: last good kept on any failure
//   robotsAllows(txt, path)       robots.txt for Hearth's user agent (or *), longest rule wins
//   showCampaign(show)            "Go see X at Y on Friday": a Sidequest campaign (ticket → go → proof)
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.ShowSyncCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const UA = 'Hearth/61 (personal weekly show list; at most once a day per page)';
  const PLATFORMS = {
    shotgun: { id: 'shotgun', name: 'Shotgun', host: /(^|\.)shotgun\.live$/i, city: 'https://shotgun.live/en/cities/paris',
      kinds: [['venue', /^\/(?:[a-z]{2}\/)?venues\/[\w.-]+\/?$/i], ['artist', /^\/(?:[a-z]{2}\/)?artists\/[\w.-]+\/?$/i], ['event', /^\/(?:[a-z]{2}\/)?(?:events|festivals)\/[\w.-]+\/?$/i], ['city', /^\/(?:[a-z]{2}\/)?(?:concerts|cities)\/paris(?:\/[\w./-]*)?$/i]] },
    dice: { id: 'dice', name: 'DICE', host: /(^|\.)dice\.fm$/i, city: 'https://dice.fm/browse/paris-5b23e8a0e63cc224a4c36a2d',
      kinds: [['venue', /^\/venue\/[\w.-]+\/?$/i], ['artist', /^\/artist\/[\w.-]+\/?$/i], ['event', /^\/event\/[\w.-]+\/?$/i], ['city', /^\/browse\/paris-[\w-]+(?:\/[\w/-]*)?$/i]] }
  };
  const BOX = { s: 48.7, n: 49, w: 2.15, e: 2.6 }; // the quest atlas's Paris area (tools/quest-atlas.js clamps to it)
  const inParis = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= BOX.s && lat <= BOX.n && lon >= BOX.w && lon <= BOX.e;
  const str = (v, max = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, max);
  const num = (v) => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : NaN; };
  const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', euro: '€', oelig: 'œ', szlig: 'ß' };
  const ACC = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', cedil: '\u0327', tilde: '\u0303', ring: '\u030a' };
  // HTML entities (numeric, the usual named ones, and accented letters: &eacute; &Egrave; &ccedil; …)
  const decode = (s) => String(s).replace(/&(#x?[\da-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    if (NAMED[e.toLowerCase()]) return NAMED[e.toLowerCase()];
    const a = /^([a-z])(acute|grave|circ|uml|cedil|tilde|ring)$/i.exec(e); return a ? (a[1] + ACC[a[2].toLowerCase()]).normalize('NFC') : m;
  });
  // FNV-1a, two rounds → 12 hex: stable ids for shows / venues / logos (lowercase, fits the journal's id pattern)
  function hash(s) { let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995; for (const ch of String(s)) { const c = ch.codePointAt(0); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x5bd1e995) >>> 0; } return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).slice(0, 12); }
  const fold = (s) => str(s, 400).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const STOP = new Set(['le', 'la', 'les', 'l', 'the', 'de', 'du', 'des', 'paris', 'club', 'a', 'au', 'et', 'and', 'x', 'presents', 'presente', 'w', 'with', 'b2b', 'live', 'dj', 'set']);
  const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
  const venueKey = (name) => tokens(name).join(' ') || fold(name).replace(/[^a-z0-9]/g, '');

  // ---------- links the owner can follow ----------
  function sourceFromUrl(input) {
    let u; try { u = new URL(String(input || '').trim()); } catch { return null; }
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const p = Object.values(PLATFORMS).find((x) => x.host.test(u.hostname)); if (!p) return null;
    const pathname = u.pathname.replace(/\/+$/, '') || '/';
    const kind = (p.kinds.find(([, re]) => re.test(pathname)) || [])[0]; if (!kind) return null;
    const slug = pathname.split('/').filter(Boolean).pop() || 'paris';
    const label = kind === 'city' ? `${p.name} · Paris` : slug.replace(/-[0-9a-f]{6,}$/i, '').replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
    const url = `https://${u.hostname.toLowerCase()}${pathname}`;
    return { id: `${p.id}-${kind}-${hash(url)}`, platform: p.id, kind, url, label };
  }
  const defaultSources = () => [sourceFromUrl(PLATFORMS.shotgun.city), sourceFromUrl(PLATFORMS.dice.city)];

  // ---------- reading a page ----------
  function jsonLd(html) {
    const out = [];
    for (const m of String(html || '').matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
      const text = m[1].trim().replace(/^<!--|-->$/g, '');
      try { out.push(JSON.parse(text)); } catch { try { out.push(JSON.parse(decode(text))); } catch { /* one bad block never hides the others */ } }
    }
    return out;
  }
  const isEventType = (t) => arr(t).some((x) => /(^|:|\/)(\w*Event|Festival)$/.test(String(x)));
  // every Event inside @graph / ItemList / arrays / subEvent, at most 400
  function eventsIn(data, found = [], depth = 0) {
    if (!data || typeof data !== 'object' || depth > 8 || found.length >= 400) return found;
    if (Array.isArray(data)) { for (const x of data) eventsIn(x, found, depth + 1); return found; }
    if (isEventType(data['@type'])) found.push(data);
    for (const k of ['@graph', 'itemListElement', 'item', 'subEvent', 'event', 'events', 'mainEntity']) if (data[k]) eventsIn(data[k], found, depth + 1);
    return found;
  }
  const imageUrl = (v) => { for (const x of arr(v)) { const s = typeof x === 'string' ? x : x?.url || x?.contentUrl || ''; if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s.slice(0, 1000); } return ''; };
  function addressText(a) {
    if (!a) return '';
    if (typeof a === 'string') return str(decode(a), 200);
    const parts = [a.streetAddress, [a.postalCode, a.addressLocality].filter(Boolean).join(' ')].map((x) => str(decode(x || ''), 120)).filter(Boolean);
    return parts.join(', ').slice(0, 200);
  }
  const platformLink = (v, platform) => { try { const u = new URL(v); return u.protocol === 'https:' && PLATFORMS[platform].host.test(u.hostname) ? u.href.slice(0, 1000) : ''; } catch { return ''; } };
  function lineupFrom(names, title) {
    const list = names.map((n) => str(decode(n), 80)).filter(Boolean);
    if (list.length) return [...new Set(list)].slice(0, 20);
    // no performers listed: "A + B + C" / "A, B & C" in the title is the lineup
    const t = str(title, 200).replace(/^[^:]{2,40}:\s*/, '');
    const bits = t.split(/\s+(?:\+|&|b2b|w\/|x)\s+|,\s*/i).map((x) => x.trim()).filter((x) => x.length > 1 && x.length <= 60);
    return bits.length > 1 ? bits.slice(0, 12) : [];
  }
  // one Event object → Hearth's show shape (or null: no name, no date, online-only)
  function fromEvent(ev, src) {
    const title = str(decode(ev.name || ev.title || ''), 160); const start = Date.parse(ev.startDate || ev.start || '');
    if (!title || !Number.isFinite(start)) return null;
    const loc = arr(ev.location).find((l) => l && typeof l === 'object' && !/VirtualLocation/.test(String(l['@type']))) || (typeof ev.location === 'string' ? { name: ev.location } : null);
    if (!loc && arr(ev.location).length) return null;
    const geo = loc?.geo || {};
    const venue = { name: str(decode(loc?.name || ''), 120), address: addressText(loc?.address), lat: num(geo.latitude ?? loc?.latitude), lon: num(geo.longitude ?? loc?.longitude), image: imageUrl(loc?.logo || loc?.image), url: platformLink(loc?.url || loc?.sameAs || '', src.platform) };
    if (!venue.name && src.kind === 'venue') venue.name = src.label;
    const offers = arr(ev.offers);
    const prices = offers.flatMap((o) => [num(o.lowPrice), num(o.price)]).filter((n) => Number.isFinite(n) && n >= 0);
    const end = Date.parse(ev.endDate || '');
    const url = platformLink(ev.url || '', src.platform) || offers.map((o) => platformLink(o.url || '', src.platform)).find(Boolean) || (src.kind === 'event' ? src.url : '');
    const doors = Date.parse(ev.doorTime || ''); // (round 62, showprep62) doors, when the listing says
    return mk({
      platform: src.platform, title, start, end: Number.isFinite(end) ? end : null, url, venue,
      doors: Number.isFinite(doors) && doors <= start && start - doors < 12 * 3600e3 ? doors : null, links: artistLinks(arr(ev.performer), src.platform),
      lineup: lineupFrom(arr(ev.performer).map((p) => (typeof p === 'string' ? p : p?.name || '')), title),
      image: imageUrl(ev.image), price: prices.length ? { from: Math.min(...prices), currency: str(offers.find((o) => o.priceCurrency)?.priceCurrency || 'EUR', 3) } : null,
      soldOut: offers.length > 0 && offers.every((o) => /SoldOut/i.test(String(o.availability || ''))),
      cancelled: /Cancelled/i.test(String(ev.eventStatus || ''))
    });
  }
  // (round 62, showprep62) the artist links a listing already carries: its own artist page (Shotgun / DICE) and one
  // public listening page (sameAs on a known music site). Nothing is fetched from those sites.
  const LISTEN = /(^|\.)(open\.spotify\.com|soundcloud\.com|bandcamp\.com|music\.apple\.com|deezer\.com|youtube\.com|youtu\.be|mixcloud\.com|tidal\.com|residentadvisor\.net|ra\.co)$/i;
  const listenLink = (v) => { for (const x of arr(v)) { try { const u = new URL(typeof x === 'string' ? x : x?.url || ''); if (u.protocol === 'https:' && !u.username && LISTEN.test(u.hostname)) return u.href.slice(0, 500); } catch { /* not a link */ } } return ''; };
  function artistLinks(performers, platform) {
    const out = {};
    for (const p of performers.slice(0, 20)) {
      if (!p || typeof p !== 'object') continue;
      const name = str(decode(p.name || ''), 80); if (!name) continue;
      const page = [p.url, ...arr(p.sameAs)].map((u) => (typeof u === 'string' ? platformLink(u, platform) : '')).find(Boolean) || '';
      const listen = listenLink([p.url, ...arr(p.sameAs)]);
      if (page || listen) out[name] = { page, listen };
    }
    return out;
  }
  function mk(s) {
    s.links ||= {}; s.doors ??= null;
    s.venue.key = venueKey(s.venue.name || s.venue.address || 'venue');
    s.id = `${s.platform}:${s.url ? hash(s.url) : hash(`${s.title}|${s.start}|${s.venue.key}`)}`;
    return s;
  }
  // Fallback: a Next.js page's own data (__NEXT_DATA__), walked for event-shaped objects. Generic on purpose: the
  // platform's internal names change; anything with a title, a start date and a venue counts.
  const START_KEYS = ['startDate', 'startTime', 'startsAt', 'start_at', 'startAt', 'date', 'dateStart', 'beginsAt'];
  function nextData(html) {
    const m = /<script\b[^>]*id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(String(html || '')); if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  }
  function walkEvents(data, src) {
    const out = []; let seen = 0;
    const pickImg = (v) => (typeof v === 'string' ? (/^https:/.test(v) ? v : '') : v && typeof v === 'object' ? imageUrl(v.url || v.src || v.original || '') : '');
    (function walk(x, depth) {
      if (!x || typeof x !== 'object' || depth > 14 || ++seen > 30000 || out.length >= 400) return;
      if (Array.isArray(x)) { for (const y of x) walk(y, depth + 1); return; }
      // DICE's current public browse page: nested dates, plural venues, integer minor-unit prices.
      const diceCard=src.platform==='dice'&&typeof x.dates?.event_start_date==='string'&&Array.isArray(x.venues);
      if(diceCard)x={...x,startDate:x.dates.event_start_date,endDate:x.dates.event_end_date,venue:x.venues[0],url:typeof x.id==='string'&&/^[a-f0-9]{24}$/i.test(x.id)?'https://dice.fm/event/'+x.id:x.url};
      const title = typeof x.name === 'string' ? x.name : typeof x.title === 'string' ? x.title : '';
      const sk = START_KEYS.find((k) => typeof x[k] === 'string' || (typeof x[k] === 'number' && x[k] > 1e9));
      const v = x.venue || x.place || (x.location && typeof x.location === 'object' ? x.location : null);
      if (title && sk && v) {
        const raw = x[sk], start = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(raw);
        const vv = Array.isArray(v) ? v[0] : v;
        if (Number.isFinite(start) && vv) {
          const vo = typeof vv === 'string' ? { name: vv } : vv;
          const addr = typeof vo.address === 'string' ? vo.address : vo.address && typeof vo.address === 'object' ? [vo.address.street || vo.address.streetAddress, [vo.address.zip || vo.address.postalCode, vo.address.city || vo.address.addressLocality].filter(Boolean).join(' ')].filter(Boolean).join(', ') : [vo.street, vo.city].filter(Boolean).join(', ');
          const lat = num(vo.lat ?? vo.latitude ?? vo.geo?.latitude ?? vo.location?.lat), lon = num(vo.lng ?? vo.lon ?? vo.longitude ?? vo.geo?.longitude ?? vo.location?.lng);
          const link = typeof x.url === 'string' ? platformLink(x.url, src.platform) : typeof x.slug === 'string' && src.platform === 'shotgun' ? `https://shotgun.live/en/events/${encodeURIComponent(x.slug)}` : typeof x.perm_name === 'string' && src.platform === 'dice' ? `https://dice.fm/event/${encodeURIComponent(x.perm_name)}` : '';
          const names = arr(x.artists || x.lineup || x.performers).map((a) => (typeof a === 'string' ? a : a?.name || ''));
          const links = artistLinks(arr(x.artists || x.lineup || x.performers).filter((a) => a && typeof a === 'object').map((a) => ({ name: a.name, url: typeof a.url === 'string' ? a.url : '', sameAs: a.sameAs })), src.platform);
          const minor=diceCard?(x.price?.amount_from??x.price?.amount):null,end=Date.parse(x.endDate||'');
          out.push(mk({ platform: src.platform, title: str(title, 160), start, end: diceCard&&Number.isFinite(end)&&end>=start?end:null, url: link, venue: { name: str(vo.name || vo.title || '', 120), address: str(addr, 200), lat, lon, image: pickImg(vo.logo || vo.image || vo.avatar || vo.coverUrl || vo.cover), url: '' }, lineup: lineupFrom(names, title), links, image: pickImg(x.image || x.cover || x.coverUrl || (diceCard&&x.images?.square)), price:typeof minor==='number'&&Number.isFinite(minor)&&minor>=0?{from:minor/100,currency:str(x.price.currency||'EUR',3)}:null, soldOut: diceCard&&/^(sold[-_ ]?out)$/i.test(x.status||''), cancelled: diceCard&&/^cancelled$/i.test(x.status||'') }));
          return;
        }
      }
      for (const k of Object.keys(x)) walk(x[k], depth + 1);
    })(data, 0);
    return out;
  }
  // A protection page (Cloudflare's "Just a moment…", a captcha) is reported, never worked around.
  const looksBlocked = (html) => /<title>\s*(Just a moment|Attention Required|Access denied|Un instant|Vercel Security Checkpoint)/i.test(html) || /cf-browser-verification|challenge-platform|cf_chl_|captcha-delivery|px-captcha/i.test(String(html).slice(0, 20000));
  function parsePage(html, src) {
    if (looksBlocked(html)) return { shows: [], via: 'none', blocked: true };
    const blocks = jsonLd(html);
    const ld = blocks.flatMap((d) => eventsIn(d)).map((e) => fromEvent(e, src)).filter(Boolean);
    const nd = ld.length ? null : nextData(html); const nx = nd ? walkEvents(nd, src) : [];
    const shows = uniq(ld.length ? ld : nx);
    // a venue page's own picture (its Place / Organization data, else its og:image) is the venue's logo
    if (src.kind === 'venue') { const img = placeImage(blocks) || ogImage(html); if (img) for (const s of shows) s.venue.image ||= img; }
    return { shows, via: ld.length ? 'jsonld' : nx.length ? 'next' : 'none', blocked: false };
  }
  function placeImage(blocks) {
    let found = '';
    (function walk(x, d) { if (found || !x || typeof x !== 'object' || d > 6) return; if (Array.isArray(x)) return x.forEach((y) => walk(y, d + 1));
      if (!isEventType(x['@type']) && /Place|Venue|NightClub|LocalBusiness|Organization|BarOrPub|Club/i.test(String(arr(x['@type']).join(' ')))) found = imageUrl(x.logo || x.image);
      for (const k of ['@graph', 'itemListElement', 'mainEntity']) if (x[k]) walk(x[k], d + 1); })(blocks, 0);
    return found;
  }
  const ogImage = (html) => { const m = /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(String(html)) || /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i.exec(String(html)); return m ? imageUrl(decode(m[1])) : ''; };
  const uniq = (list) => { const m = new Map(); for (const s of list) if (!m.has(s.id)) m.set(s.id, s); return [...m.values()]; };

  // ---------- both platforms → one list ----------
  const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // a club night that starts after midnight belongs to the evening before (00:00–05:59 → yesterday)
  const nightOf = (t) => dayOf(new Date(t).getHours() < 6 ? t - 6 * 3600e3 : t);
  function similar(a, b) {
    const ta = new Set(tokens(a.title)), tb = new Set(tokens(b.title));
    const inter = [...ta].filter((t) => tb.has(t)).length, jac = inter / Math.max(1, new Set([...ta, ...tb]).size);
    const la = new Set(a.lineup.map(fold)), lap = b.lineup.some((x) => la.has(fold(x)));
    const fa = fold(a.title), fb = fold(b.title);
    return jac >= 0.5 || lap || (fa.length > 3 && fb.includes(fa)) || (fb.length > 3 && fa.includes(fb));
  }
  function combine(a, b) {
    if(a.dateOnly && !b.dateOnly)return combine(b,a);
    // A venue programme doesn't report live ticket stock. Prefer the ticket platform when both are present.
    if (a.programme && !b.programme && !b.dateOnly) return combine(b, a);
    const pick = (x, y) => (x || y);
    const venue = { ...a.venue, name: pick(a.venue.name, b.venue.name), address: a.venue.address.length >= b.venue.address.length ? a.venue.address : b.venue.address,
      lat: Number.isFinite(a.venue.lat) ? a.venue.lat : b.venue.lat, lon: Number.isFinite(a.venue.lon) ? a.venue.lon : b.venue.lon, image: pick(a.venue.image, b.venue.image), url: pick(a.venue.url, b.venue.url) };
    return { ...a, dateOnly:!!a.dateOnly, title: a.title.length >= b.title.length ? a.title : b.title, start: b.dateOnly ? a.start : Math.min(a.start, b.start), venue, lineup: [...new Set([...a.lineup, ...b.lineup])].slice(0, 20), image: pick(a.image, b.image),
      tickets: [...a.tickets, ...b.tickets.filter((t) => !a.tickets.some((x) => x.url === t.url && x.platform === t.platform))], platforms: [...new Set([...a.platforms, ...b.platforms])],
      price: a.price && b.price ? (a.price.from <= b.price.from ? a.price : b.price) : a.price || b.price, soldOut: !a.programme && b.programme ? a.soldOut : a.soldOut && b.soldOut, cancelled: !a.programme && b.programme ? a.cancelled : a.cancelled && b.cancelled,
      links: mergeLinks(a.links, b.links), doors: a.doors && b.doors ? Math.min(a.doors, b.doors) : a.doors || b.doors || null };
  }
  function mergeLinks(a = {}, b = {}) { // (round 62, showprep62) per artist: the first page / listening link wins
    const out = { ...a };
    for (const [k, v] of Object.entries(b || {})) out[k] = { page: out[k]?.page || v.page || '', listen: out[k]?.listen || v.listen || '' };
    return out;
  }
  function merge(lists) {
    const all = lists.flat().filter(Boolean).map((s) => ({ ...s, venue: { ...s.venue }, lineup: [...(s.lineup || [])], links: { ...(s.links || {}) }, doors: s.doors ?? null, tickets: s.tickets || [{ platform: s.platform, url: s.url, price: s.price, soldOut: s.soldOut }], platforms: s.platforms || [s.platform] }));
    all.sort((a, b) => a.start - b.start || a.platform.localeCompare(b.platform) || a.id.localeCompare(b.id));
    const out = [];
    // (round 70, bigprofile70) the same first match as `out.find(o => same id || same night, venue and title)`, without
    // comparing each show with every one before it: only the shows with its id or on its night can match, so only those
    // are looked at, in list order. 600 cached shows made each shows:get (the Sidequest map, the ✦ tracker) hold the
    // main process ≈ 130–240 ms; now a few ms.
    const nightMemo = new Map(), night = (t) => { let n = nightMemo.get(t); if (n === undefined) { n = nightOf(t); nightMemo.set(t, n); } return n; };
    const byId = new Map(), byNight = new Map(), pos = new Map();
    const put = (m, k, o) => { const a = m.get(k); if (a) a.push(o); else m.set(k, [o]); };
    const drop = (m, k, o) => { const a = m.get(k), i = a ? a.indexOf(o) : -1; if (i >= 0) a.splice(i, 1); };
    const venueMatch = (o, s) => o.venue.key === s.venue.key || (o.venue.key.length > 3 && s.venue.key.length > 3 && (o.venue.key.includes(s.venue.key) || s.venue.key.includes(o.venue.key)));
    for (const s of all) {
      const ns = night(s.start); let same = null, at = Infinity;
      for (const o of byId.get(s.id) || []) if (pos.get(o) < at) { same = o; at = pos.get(o); }
      for (const o of byNight.get(ns) || []) if (pos.get(o) < at && venueMatch(o, s) && similar(o, s)) { same = o; at = pos.get(o); }
      if (same) {
        const id0 = same.id, n0 = night(same.start);
        Object.assign(same, combine(same, s));
        if (same.id !== id0) { drop(byId, id0, same); put(byId, same.id, same); }
        const n1 = night(same.start); if (n1 !== n0) { drop(byNight, n0, same); put(byNight, n1, same); }
      } else { pos.set(s, out.length); out.push(s); put(byId, s.id, s); put(byNight, ns, s); }
    }
    for (const s of out) s.key = hash(`${night(s.start)}|${s.venue.key}|${tokens(s.title).slice(0, 3).sort().join(' ') || s.title}`);
    // two different shows can't share a key: the later one gets its time added
    const seen = new Set(); for (const s of out) { if (seen.has(s.key)) s.key = hash(`${s.key}|${s.start}`); seen.add(s.key); }
    return out;
  }
  function weekRange(now = Date.now(), days = 7) { const d = new Date(now); d.setHours(0, 0, 0, 0); return { from: d.getTime(), to: d.getTime() + days * 86400e3 }; }
  const expires = s => s.end || s.start + (s.dateOnly ? 18 : 4)*3600e3;
  const thisWeek = (shows, now = Date.now()) => { const r = weekRange(now); return shows.filter((s) => expires(s) >= now && s.start < r.to && !s.cancelled).sort((a, b) => a.start - b.start); };
  function venues(shows) {
    const m = new Map();
    for (const s of shows) {
      const k = s.venue.key; const v = m.get(k) || { id: `show-venue-${hash(k)}`, key: k, name: s.venue.name, address: s.venue.address, lat: NaN, lon: NaN, image: '', logo: '', shows: [] };
      if (!v.name) v.name = s.venue.name; if (!v.address) v.address = s.venue.address;
      if (!Number.isFinite(v.lat) && Number.isFinite(s.venue.lat)) { v.lat = s.venue.lat; v.lon = s.venue.lon; }
      v.image ||= s.venue.image; v.logo ||= s.venue.logo || ''; v.shows.push(s); m.set(k, v);
    }
    return [...m.values()];
  }
  const PIN = '#ff6b9d'; // the atlas's music colour
  const pins = (vs) => vs.filter((v) => inParis(v.lat, v.lon)).map((v) => ({ id: v.id, name: v.name || v.address || 'Venue', lat: v.lat, lon: v.lon, kind: 'music', color: PIN, logo: v.logo || (v.shows.some(s=>s.programme) ? 'assets/shotgun-programme.svg' : ''), quest: '', visitedAt: null, show: true, count: v.shows.length }));

  // ---------- the cache: last good list per source ----------
  const emptyCache = () => ({ v: 1, sources: {}, refreshedAt: null });
  // r: { ok, status, shows, via, blocked, robots, error, notModified, etag, lastModified }
  function applyResult(cache, src, r, now = Date.now()) {
    const old = cache.sources[src.id] || { id: src.id, platform: src.platform, url: src.url, label: src.label, shows: [], lastOk: null };
    const s = { ...old, platform: src.platform, url: src.url, label: src.label, kind: src.kind, lastTry: now };
    if (r.robots) s.problem = 'robots';
    else if (r.blocked || [401, 403, 429, 503].includes(r.status)) s.problem = 'blocked';
    else if (r.notModified) { s.problem = null; s.lastOk = now; }
    else if (!r.ok) s.problem = r.status ? 'http' : 'offline';
    else if (!r.shows.length && old.shows.length && src.kind !== 'event' && !r.authoritativeEmpty) s.problem = 'changed'; // HTML can change shape; a validated complete API response can really be empty
    else { s.problem = r.partial ? 'partial' : r.shows.length || src.kind === 'event' ? null : 'empty'; s.shows = r.shows; s.via = r.via; s.lastOk = now; }
    if (r.etag !== undefined) s.etag = r.etag || null; if (r.lastModified !== undefined) s.lastModified = r.lastModified || null;
    if (s.problem) s.status = r.status || 0;
    cache.sources[src.id] = s; return s;
  }
  const allShows = (cache, sources) => merge((sources || Object.values(cache.sources)).map((src) => cache.sources[src.id]?.shows || []));
  const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'never');
  function problemText(s) {
    const P = ['programme','syndication'].includes(s.kind) ? s.label : PLATFORMS[s.platform]?.name || 'The site', since = s.shows.length ? ` Showing the list from ${when(s.lastOk)}.` : '';
    return { robots: `${P} asks apps not to read that page, so Hearth doesn't. Follow a venue instead, or open it in your browser.`,
      blocked: `${P} asked for a browser check, so Hearth stopped there (no workaround).${since}`,
      changed: `${P}'s page changed and Hearth couldn't read shows from it.${since}`,
      http: `${P} didn't answer properly (error ${s.status}).${since}`,
      offline: `Couldn't reach ${P}.${since}`,
      partial: `Some ${P} details couldn't update. Their last good listings are kept.`,
      empty: `${P} lists no shows on ${s.label} right now.` }[s.problem] || '';
  }
  // one plain line for the whole list (null when everything is fine)
  function statusLine(cache, sources, now = Date.now()) {
    const bad = (sources || Object.values(cache.sources)).map((x) => cache.sources[x.id]).filter((s) => s?.problem && s.problem !== 'empty');
    if (!bad.length) return null;
    if (bad.length === 1 && bad[0].platform === 'shotgun' && bad[0].kind === 'city') {
      const recovered = allShows(cache,sources).filter(s=>s.programme && !s.cancelled && (s.end || s.start+4*3600e3)>=now && s.start<now+21*86400e3).length;
      if (recovered) return `Shotgun’s main catalogue couldn't update. ${recovered} nights are available from venue programmes; coverage is partial.`;
    }
    if (bad.length === 1) return problemText(bad[0]);
    const kept = bad.some((s) => s.shows.length);
    return `${bad.length} pages couldn't update (${[...new Set(bad.map((s) => PLATFORMS[s.platform]?.name))].join(', ')}).${kept ? ' Showing the last good list.' : ''}`;
  }

  // ---------- robots.txt ----------
  function robotsAllows(txt, pathname, agent = 'hearth') {
    const groups = []; let cur = null, lastWasUa = false;
    for (const raw of String(txt || '').split(/\r?\n/)) {
      const line = raw.replace(/#.*/, '').trim(); const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line); if (!m) continue;
      const k = m[1].toLowerCase(), v = m[2].trim();
      if (k === 'user-agent') { if (!lastWasUa) groups.push(cur = { agents: [], rules: [] }); cur.agents.push(v.toLowerCase()); lastWasUa = true; continue; }
      lastWasUa = false; if (!cur) continue;
      if (k === 'allow' || k === 'disallow') cur.rules.push({ allow: k === 'allow', path: v });
    }
    const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)));
    const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules).filter((r) => r.path || !r.allow);
    let best = null;
    for (const r of rules) {
      if (!r.path) continue; // "Disallow:" (empty) allows everything
      const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
      if (re.test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
    }
    return !best || best.allow;
  }

  // ---------- geocoding (once per address, cached; Nominatim's policy: ≤ 1 request / s, a real user agent, cache) ----------
  const geoKey = (address) => fold(address).replace(/[^a-z0-9]+/g, ' ').trim();
  const GEO_MISS_TTL = 30 * 86400e3;
  function geoNeeded(vs, geo, now = Date.now()) {
    return vs.filter((v) => !Number.isFinite(v.lat) && (v.address || v.name)).map((v) => ({ v, key: geoKey(v.address || `${v.name} Paris`) }))
      .filter(({ key }) => key && (!geo[key] || (geo[key].miss && now - geo[key].at > GEO_MISS_TTL)));
  }
  function applyGeo(vs, geo) { for (const v of vs) { if (Number.isFinite(v.lat)) continue; const g = geo[geoKey(v.address || `${v.name} Paris`)]; if (g && !g.miss) { v.lat = g.lat; v.lon = g.lon; } } return vs; }
  const nominatimUrl = (address) => `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&bounded=1&viewbox=${BOX.w},${BOX.n},${BOX.e},${BOX.s}&q=${encodeURIComponent(/paris|\b75\d{3}\b|\b9[234]\d{3}\b/i.test(address) ? address : `${address}, Paris`)}`;
  function parseGeo(json) { const r = Array.isArray(json) ? json[0] : null; const lat = num(r?.lat), lon = num(r?.lon); return inParis(lat, lon) ? { lat: +lat.toFixed(6), lon: +lon.toFixed(6) } : null; }

  // ---------- words ----------
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function dayWord(t, now = Date.now()) {
    const a = weekRange(now).from, diff = Math.floor((weekRange(t).from - a) / 86400e3);
    if (diff === 0) return 'tonight'; if (diff === 1) return 'tomorrow';
    if (diff > 1 && diff < 7) return `on ${DAYS[new Date(t).getDay()]}`;
    return `on ${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }
  const short = (t) => `${DAYS[new Date(t).getDay()].slice(0, 3)} ${hm(t)}`;
  const showWhen = s => new Date(s.start).toLocaleDateString(undefined,{timeZone:'Europe/Paris',weekday:'short',day:'numeric',month:'short',...(new Date(s.start).getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})})+' · '+(s.dateOnly ? 'time to confirm' : new Date(s.start).toLocaleTimeString(undefined,{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false}));
  const platformsText = (s) => s.platforms.map((p) => PLATFORMS[p]?.name || p).join(' + ');
  const line = (s) => `${showWhen(s)} · ${s.title}${s.venue.name && !fold(s.title).includes(fold(s.venue.name)) ? ` — ${s.venue.name}` : ''} · ${platformsText(s)}${s.soldOut ? ' · sold out' : ''}`;
  function find(shows, q) {
    const f = fold(q).trim(); if (!f) return null;
    const scored = shows.map((s) => { const hay = fold([s.title, s.venue.name, ...s.lineup].join(' ')); const ts = tokens(q); const hit = ts.filter((t) => hay.includes(t)).length; return { s, n: s.key === q ? 99 : hay.includes(f) ? 50 + f.length : hit ? hit / Math.max(1, ts.length) * 10 : 0 }; });
    const best = scored.filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.s.start - b.s.start)[0];
    return best ? best.s : null;
  }

  // ---------- a show → a Sidequest campaign (shape of QuestCore.planCampaign; validated by QuestCore.validate) ----------
  function showCampaign(show, now = Date.now()) {
    const who = show.lineup.length ? show.lineup.slice(0, 2).join(' & ') : show.title;
    const where = show.venue.name || 'the venue', day = dayWord(show.start, now);
    const title = `Go see ${who} at ${where} ${day}`.slice(0, 100);
    const ticket = show.tickets.find((t) => t.url)?.url || '';
    const cid = `c-show-${show.key}`;
    const brief = `${show.title} / ${where} / ${show.dateOnly ? showWhen(show) : new Date(show.start).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    const q = (suffix, t, done, tiny, minutes, xp) => ({ id: `q-show-${show.key}-${suffix}`, title: t.slice(0, 250), done: done.slice(0, 1000), tiny: tiny.slice(0, 500), minutes, xp, tool: null,
      deep: 'One good night is enough. Another show is optional.', proofHint: 'Your own ticket confirmation (with the barcode hidden), a photo, a sound or a short field note. No one else’s private messages.' });
    return { id: cid, title, subtitle: 'PARIS / SHOW NIGHT', path: 'life', why: `A real night out from ${platformsText(show)}: ${brief}`.slice(0, 600), badge: `${where} / ${show.title}`.slice(0, 100),
      show: { key: show.key, dateOnly:!!show.dateOnly, title: show.title.slice(0, 160), venue: where.slice(0, 120), address: show.venue.address.slice(0, 200), start: new Date(show.start).toISOString(), url: ticket.slice(0, 1000), platforms: show.platforms.slice(0, 2) },
      quests: [
        q('ticket', 'Get your ticket', `Book a ticket for ${brief}${ticket ? ` (${PLATFORMS[show.tickets.find((t) => t.url).platform]?.name || 'ticket link'})` : ''}, or decide on the door. Save the confirmation; hide the barcode in any proof.`, 'Open the ticket page and check the price.', 5, 20),
        q('go', `Go: ${show.title}`.slice(0, 250), `Be at ${where}${show.venue.address ? ` (${show.venue.address})` : ''} ${day}${show.dateOnly ? '; confirm the start time on your ticket first' : ' at '+hm(show.start)}. Plan the way there and back; going solo or with a friend both count.`, 'Pick the time you leave home.', 120, 35),
        q('proof', 'Bring back one moment', `After ${show.title}, save one real thing from the night: a photo, a short sound, or a field note with one detail you noticed and one track or artist you want to remember. If plans changed, skip this checkpoint.`, 'Write one line while it is fresh.', 5, 20)
      ] };
  }

  return { UA, PLATFORMS, BOX, inParis, hash, fold, tokens, venueKey, sourceFromUrl, defaultSources, jsonLd, eventsIn, fromEvent, nextData, walkEvents, looksBlocked, parsePage,
    nightOf, similar, merge, weekRange, thisWeek, venues, pins, emptyCache, applyResult, allShows, problemText, statusLine, robotsAllows, geoKey, geoNeeded, applyGeo, nominatimUrl, parseGeo,
    dayWord, short, hm, showWhen, expires, line, find, platformsText, showCampaign };
});
