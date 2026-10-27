// (round 70, follow70) ★ Follow artists and venues: the pure parts (no DOM, no network, no fs), shared by the window
// (follow.js: the store, the Following dialog; follow-hook.js: the show cards, the ★ badges) and dev/follow70-test.js.
// Built on showsync61's show shape (showsync-core.js) and showprep62's "Shows I went to" log (kv 'show-nights').
//   norm(name)                   an artist's name, tolerant: case, accents, "DJ", "(live)", "(DJ set)", "&" = "and"
//   parts(entry)                 one lineup line → its artists ("A b2b B", "A feat. B", "A x B", "A, B & C", "A + B")
//   venueKey(name)               a venue's name without "Le / La / Les / L'", "Paris", "Club", accents, punctuation
//   artistsOf(show)              the show's artists, one per name, as written (the lineup, else the title's named parts)
//   hits(store, show)            the followed artists / venues this show has → [{ id, kind, name, as }]
//   follow(store, kind, name, shows, now)   adds (or brings back) a follow; the shows already listed with it are
//                                marked known, so only shows the sync brings in LATER are "★ New"
//   detect(store, shows, now)    after a sync: the shows with a followed artist / venue not seen before → news
//   pending(store, now)          the ★ New rows still to show (not dismissed, not made a quest, not over)
//   suggest(went, store)         from "Shows I went to": artists / venues seen on two nights or more, not yet followed
//   empty() / validate(s) / merge(a, b, now)   the store (kv 'show-follows'): a damaged one throws, never reads as empty
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.FollowCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const H = 3600e3, DAY = 24 * H;
  const MAX_FOLLOWS = 200, MAX_NEWS = 60, MAX_KNOWN = 3000;
  const str = (v, max = 200) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const fold = (s) => str(s, 400).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[øœæß]/g, (c) => ({ 'ø': 'o', 'œ': 'oe', 'æ': 'ae', 'ß': 'ss' }[c]));
  const iso = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

  // ---------- names ----------
  // what a listing adds around a name: "DJ Koze", "The Blaze", "Floating Points (DJ set)", "Bon Entendeur – Live"
  const TAIL = /\s+(?:dj set|live set|hybrid set|a v set|av set|all night long|extended set|club set|dj|live)$/;
  function norm(name) {
    let t = fold(name).replace(/[’'`´]/g, '').replace(/&|\+/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    const bare = t;
    for (let i = 0; i < 3; i++) t = t.replace(/^(?:the|dj)\s+(?=\S)/, '').replace(TAIL, '');
    return t.length >= 2 ? t : bare; // "DJ" alone stays "dj" (never matches a "DJ Koze")
  }
  // one lineup line → the artists in it. Loose (for matching): "&" splits too, and the whole line is matched as well, so
  // "Simon & Garfunkel" still matches. Strict (the card's ★ Follow buttons): b2b, feat., x, vs, with, commas, "+", "/"
  const STRONG = /\s+(?:b2b|b3b|b4b|back to back|feat\.?|ft\.?|featuring|with|w\/|vs\.?|versus|x|×|meets)\s+|\s*(?:,|;|\/|\||\+)\s*/i;
  const LOOSE = /\s+(?:b2b|b3b|b4b|back to back|feat\.?|ft\.?|featuring|with|w\/|vs\.?|versus|x|×|meets|and)\s+|\s*(?:,|;|\/|\||\+|&)\s*/i;
  function parts(entry, strict = false) {
    const raw = str(entry, 200).replace(/\((?:dj set|live|live set|dj|set|hybrid set|a\/v|av|all night long)\)/gi, ' ').replace(/\s+/g, ' ').trim();
    const out = raw.split(strict ? STRONG : LOOSE).map((x) => (x || '').replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim()).filter((x) => norm(x).length >= 2 && !/^(dj|live|set|guests?|more|tba|and more|special guests?)$/i.test(x));
    return [...new Set(out)];
  }
  const VSTOP = new Set(['le', 'la', 'les', 'l', 'the', 'de', 'du', 'des', 'd', 'paris', 'club']);
  const vtokens = (name) => fold(name).replace(/[’'`´]/g, ' ').split(/[^a-z0-9]+/).filter((t) => t && !VSTOP.has(t));
  const venueKey = (name) => vtokens(name).join(' ') || fold(name).replace(/[^a-z0-9]/g, '');
  // "Ben UFO, Call Super" in a title with no lineup; a "Machine Club:" prefix is the night's name, not an artist
  function titleParts(title) { const t = str(title, 200).replace(/^[^:]{2,40}:\s*/, ''); const p = parts(t, true); return p.length > 1 ? p : []; }
  function artistsOf(show) {
    const seen = new Set(), out = [];
    for (const line of [...(show?.lineup || [])].slice(0, 20)) for (const a of [line, ...parts(line)]) { const k = norm(a); if (k.length >= 2 && !seen.has(k)) { seen.add(k); out.push(str(a, 80)); } }
    if (!out.length) for (const a of titleParts(show?.title)) { const k = norm(a); if (!seen.has(k)) { seen.add(k); out.push(a); } }
    return out;
  }
  // the separate artists the card offers to follow (a "A b2b B" line → A and B; the whole line only when it doesn't split)
  function cardArtists(show) {
    const seen = new Set(), out = [];
    const lines = (show?.lineup || []).length ? show.lineup : titleParts(show?.title);
    for (const line of lines.slice(0, 20)) { const p = parts(line, true); for (const a of p.length ? p : [line]) { const k = norm(a), name = str(a, 80).replace(/\s+[-–—]\s*(?:live|dj set|live set)$/i, ''); if (k.length >= 2 && !seen.has(k)) { seen.add(k); out.push(name); } } }
    return out;
  }
  const words = (k) => ` ${k} `;
  function artistIn(fk, show) {
    if (!fk || fk.length < 2) return null;
    for (const line of show?.lineup || []) for (const a of [line, ...parts(line)]) if (norm(a) === fk) return str(a, 80);
    for (const a of titleParts(show?.title)) if (norm(a) === fk) return a;
    // the title says it ("Floating Points all night long", "Bon Entendeur Live"): whole words, a long enough name
    // the title says it ("Floating Points all night long", "Bon Entendeur Live"): the title starts with the name, or a
    // name of two words or more is in it as whole words (one word in the middle of a title is too loose)
    const t = norm(str(show?.title, 200).replace(/^[^:]{2,40}:\s*/, ''));
    if (fk.length >= 4 && (t === fk || t.startsWith(fk + ' ') || (fk.includes(' ') && words(t).includes(words(fk))))) return ''; // matched: shown with the followed name
    return null;
  }
  function venueMatch(fk, name) {
    const a = fk.split(' ').filter(Boolean), b = venueKey(name).split(' ').filter(Boolean);
    if (!a.length || !b.length) return false;
    if (a.join(' ') === b.join(' ')) return true;
    const inside = (x, y) => x.every((t) => y.includes(t));
    return (inside(a, b) && a.join(' ').length >= 4) || (inside(b, a) && b.join(' ').length >= 5);
  }
  const fid = (kind, name) => `${kind === 'venue' ? 'v' : 'a'}:${(kind === 'venue' ? venueKey(name) : norm(name)).slice(0, 120)}`;
  const active = (s) => (s?.follows || []).filter((f) => !f.removedAt);
  function hits(store, show) {
    const out = [];
    for (const f of active(store)) {
      const k = f.id.slice(2);
      if (f.kind === 'venue') { if (venueMatch(k, show?.venue?.name || '')) out.push({ id: f.id, kind: 'venue', name: f.name, as: str(show.venue.name, 120) }); continue; }
      const a = artistIn(k, show);
      if (a !== null) out.push({ id: f.id, kind: 'artist', name: f.name, as: a || f.name });
    }
    return out;
  }
  const isFollowing = (store, kind, name) => active(store).some((f) => f.id === fid(kind, name));

  // ---------- Paris words: "Fri 14 Nov" ----------
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const lastSunday = (y, month) => { const d = Date.UTC(y, month + 1, 0); return d - new Date(d).getUTCDay() * DAY; };
  const offset = (ms) => { const y = new Date(ms).getUTCFullYear(); return ms >= lastSunday(y, 2) + H && ms < lastSunday(y, 9) + H ? 120 : 60; };
  // the show's date in Paris time, as the listing gives it (whatever the computer's own time zone)
  function dateWords(ms) { const d = new Date(ms + offset(ms) * 60e3); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
  function newsText(show, h) {
    const artists = [...new Set(h.filter((x) => x.kind === 'artist').map((x) => x.name))]; // as the owner followed them ("Call Super", not the listing's "DJ CALL SUPER")
    const who = artists.length ? artists.slice(0, 2).join(' & ') : str(show.title, 80);
    return `${who} at ${str(show.venue?.name, 80) || 'a venue'}, ${dateWords(show.start)}`;
  }

  // ---------- the store ----------
  const empty = () => ({ v: 1, follows: [], known: {}, news: [] });
  // the show as the ★ New row needs it later (make it a quest, bring someone), when the list may have moved on
  function keep(s) {
    const v = s?.venue || {};
    return { key: str(s?.key, 80), title: str(s?.title, 160), start: Number(s?.start), end: Number.isFinite(s?.end) ? s.end : null, dateOnly: !!s?.dateOnly,
      venue: { name: str(v.name, 120), address: str(v.address, 200), key: str(v.key, 120), lat: Number.isFinite(v.lat) ? v.lat : null, lon: Number.isFinite(v.lon) ? v.lon : null },
      lineup: (Array.isArray(s?.lineup) ? s.lineup : []).map((x) => str(x, 80)).filter(Boolean).slice(0, 20),
      tickets: (Array.isArray(s?.tickets) ? s.tickets : []).filter((t) => t && typeof t.url === 'string' && /^https:\/\//.test(t.url)).map((t) => ({ platform: str(t.platform, 20), url: t.url.slice(0, 1000) })).slice(0, 4),
      platforms: (Array.isArray(s?.platforms) ? s.platforms : []).map((p) => str(p, 20)).filter(Boolean).slice(0, 4), links: {} };
  }
  function validate(s) {
    if (!s || typeof s !== 'object' || s.v !== 1 || !Array.isArray(s.follows) || !Array.isArray(s.news) || (s.known != null && (typeof s.known !== 'object' || Array.isArray(s.known)))
      || s.follows.length > MAX_FOLLOWS * 2 || s.news.length > MAX_NEWS * 2) throw Error('Your followed artists and venues could not be read safely.');
    const out = empty(), ids = new Set();
    for (const f of s.follows) {
      if (!f || typeof f !== 'object' || !['artist', 'venue'].includes(f.kind)) throw Error('Your followed artists and venues could not be read safely.');
      const name = str(f.name, 120); if (!name) continue;
      const id = fid(f.kind, name); if (ids.has(id)) continue; ids.add(id);
      out.follows.push({ id, kind: f.kind, name, at: iso(f.at) || new Date(0).toISOString(), ...(f.removedAt ? { removedAt: iso(f.removedAt) || new Date(0).toISOString() } : {}), ...(f.from === 'went' ? { from: 'went' } : {}) });
    }
    for (const [k, v] of Object.entries(s.known || {}).slice(0, MAX_KNOWN)) if (str(k, 80) && Number.isFinite(v)) out.known[str(k, 80)] = v;
    const keys = new Set();
    for (const n of s.news) {
      if (!n || typeof n !== 'object' || !n.show || keys.has(n.key)) continue;
      const show = keep(n.show); if (!show.key || show.key !== n.key || !Number.isFinite(show.start)) continue; keys.add(show.key);
      out.news.push({ key: show.key, show, text: str(n.text, 200), ids: (Array.isArray(n.ids) ? n.ids : []).map((x) => str(x, 124)).slice(0, 6), at: iso(n.at) || new Date(0).toISOString(), updatedAt: iso(n.updatedAt) || iso(n.at) || new Date(0).toISOString(),
        ...(n.dismissedAt ? { dismissedAt: iso(n.dismissedAt) } : {}), ...(n.questAt ? { questAt: iso(n.questAt) } : {}) });
    }
    return out;
  }
  // two copies (this window's and what is on disk now) → one: per follow / per news row the newer change wins
  function merge(a, b, now = Date.now()) {
    const A = a ? validate(a) : empty(), B = b ? validate(b) : empty(), fs = new Map(), ns = new Map(), known = {};
    const stamp = (f) => f.removedAt && f.removedAt > f.at ? f.removedAt : f.at;
    for (const f of [...A.follows, ...B.follows]) { const o = fs.get(f.id); if (!o || stamp(f) > stamp(o)) fs.set(f.id, f); }
    for (const n of [...A.news, ...B.news]) { const o = ns.get(n.key); if (!o || n.updatedAt > o.updatedAt) ns.set(n.key, n); }
    for (const [k, v] of [...Object.entries(A.known), ...Object.entries(B.known)]) if (v > now - 3 * DAY) known[k] = Math.max(known[k] || 0, v);
    const news = [...ns.values()].filter((n) => (Number.isFinite(n.show.end) ? n.show.end : n.show.start + 8 * H) > now - DAY).sort((x, y) => x.show.start - y.show.start).slice(-MAX_NEWS);
    const keepKnown = Object.entries(known).sort((x, y) => y[1] - x[1]).slice(0, MAX_KNOWN);
    // a follow removed long ago is forgotten (the newer change already won everywhere)
    const follows = [...fs.values()].filter((f) => !f.removedAt || Date.parse(f.removedAt) > now - 60 * DAY).slice(-MAX_FOLLOWS);
    return { v: 1, follows, known: Object.fromEntries(keepKnown), news };
  }
  const upcoming = (s, now) => s && !s.cancelled && s.key && Number.isFinite(s.start) && (Number.isFinite(s.end) ? s.end : s.start + 6 * H) > now;
  function follow(store, kind, name, shows = [], now = Date.now()) {
    if (!['artist', 'venue'].includes(kind)) throw Error('Follow an artist or a venue.');
    const clean = str(name, 120); if (norm(clean).length < 2) throw Error('Type the artist’s or the venue’s name.');
    const id = fid(kind, clean), at = new Date(now).toISOString();
    const ex = store.follows.find((f) => f.id === id);
    if (ex && !ex.removedAt) return { follow: ex, listed: [], already: true };
    if (active(store).length >= MAX_FOLLOWS) throw Error(`Hearth follows up to ${MAX_FOLLOWS} artists and venues. Unfollow one first.`);
    const f = { id, kind, name: clean, at };
    store.follows = [...store.follows.filter((x) => x.id !== id), f];
    // the shows already in the list: their ★ badge shows now, but they aren't "new" (only what the sync brings later is)
    const listed = shows.filter((s) => upcoming(s, now) && hits({ follows: [f] }, s).length);
    for (const s of listed) store.known[s.key] = Math.max(store.known[s.key] || 0, s.start);
    return { follow: f, listed, already: false };
  }
  function unfollow(store, id, now = Date.now()) {
    const f = active(store).find((x) => x.id === id); if (!f) return null;
    f.removedAt = new Date(now).toISOString(); return f;
  }
  function detect(store, shows = [], now = Date.now()) {
    const fresh = [];
    if (!active(store).length) return fresh;
    for (const s of shows) {
      if (!upcoming(s, now) || store.known[s.key]) continue;
      const h = hits(store, s); if (!h.length) continue;
      store.known[s.key] = s.start;
      if (store.news.some((n) => n.key === s.key)) continue;
      const at = new Date(now).toISOString(), n = { key: s.key, show: keep(s), text: newsText(s, h), ids: h.map((x) => x.id).slice(0, 6), at, updatedAt: at };
      store.news.push(n); fresh.push(n);
    }
    if (store.news.length > MAX_NEWS) store.news = store.news.slice(-MAX_NEWS);
    return fresh;
  }
  function pending(store, now = Date.now()) {
    return (store?.news || []).filter((n) => !n.dismissedAt && !n.questAt && (Number.isFinite(n.show.end) ? n.show.end : n.show.start + 6 * H) > now)
      .sort((a, b) => a.show.start - b.show.start);
  }
  function mark(store, key, what, now = Date.now()) {
    const n = store.news.find((x) => x.key === key); if (!n) return null;
    const at = new Date(now).toISOString(); n[what === 'quest' ? 'questAt' : 'dismissedAt'] = at; n.updatedAt = at; return n;
  }
  // "Shows I went to" (showprep62's log) → the artists and venues of two nights or more, not followed yet
  function suggest(went, store, min = 2) {
    const list = (went?.went || []).filter((e) => e && !e.removedAt && e.show), artists = new Map(), venues = new Map();
    for (const e of list) {
      const night = new Set();
      for (const a of artistsOf(e.show)) { const k = norm(a); if (night.has(k)) continue; night.add(k); const x = artists.get(k) || { kind: 'artist', name: a, n: 0 }; x.n++; artists.set(k, x); }
      const vk = venueKey(e.show.venue?.name || ''); if (vk) { const x = venues.get(vk) || { kind: 'venue', name: str(e.show.venue.name, 120), n: 0 }; x.n++; venues.set(vk, x); }
    }
    return [...artists.values(), ...venues.values()].filter((x) => x.n >= min && !isFollowing(store, x.kind, x.name)).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 8);
  }

  return { fold, norm, parts, venueKey, artistsOf, cardArtists, hits, isFollowing, fid, active, dateWords, newsText, keep, empty, validate, merge, follow, unfollow, detect, pending, mark, suggest };
});
