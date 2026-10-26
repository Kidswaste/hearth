// (round 68, tickets68) 🎟 My ticket: the pure parts (no fs, no DOM, no network), shared by the main process
// (ticketsmain.js: the copies in data/tickets, the index, the Downloads look) and the unit test. Built on showsync61's show
// shape and showprep62's Paris time (ShowPrepCore: nightOf / endOf, Europe/Paris without the computer's zone).
//   kindOf(name)                 'pdf' | 'image' | 'pkpass' | null  (what a ticket file can be)
//   phase(show, now)             'before' | 'day' | 'after'  (the show's night in Paris time: a 1 am start is the night
//                                before; 'after' once the night is over, so the ticket folds into the night's memory)
//   empty() / validate(index) / entry(…) / addFile(index, show, file) / removeFile(index, key, id) / summary(index, now)
//   score(fileName, show) → { score, artist, title, venue, date, conflict }   how much a file's name looks like this show's ticket
//   suggest(files, shows, { now, dismissed, has }) → [{ key, name, path, score, sig }]   files in Downloads named like a show
//                                (a suggestion only: nothing is ever moved, renamed or read from the file itself)
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make(require('./showprep-core'));
  else root.TicketsCore = make(root.ShowPrepCore);
})(typeof self !== 'undefined' ? self : this, (P) => {
  const H = 3600e3, DAY = 24 * H, V = 1;
  const MAX_BYTES = 25 * 1024 * 1024, MAX_FILES = 6, MAX_SHOWS = 300, MAX_DISMISSED = 200;
  const str = (v, max = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const fold = (s) => str(s, 400).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const KEY = /^[a-z0-9]{6,40}$/;

  // ---------- what a ticket file can be ----------
  const EXT = { pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image', pkpass: 'pkpass' };
  const extOf = (name) => (/\.([a-z0-9]{2,7})$/i.exec(String(name || '')) || [])[1]?.toLowerCase() || '';
  const kindOf = (name) => EXT[extOf(name)] || null;
  const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.pkpass,application/pdf,image/*,application/vnd.apple.pkpass';
  function refuse(name, bytes) { // a plain reason, or '' when the file can be kept
    const ext = extOf(name);
    if (/^(heic|heif)$/.test(ext)) return 'That photo is in HEIC. Export it as JPEG or PNG (or take a screenshot of it) and add that.';
    if (!kindOf(name)) return 'A ticket can be a PDF, an image (PNG, JPEG, a screenshot) or an Apple Wallet pass (.pkpass).';
    if (!(bytes > 0)) return 'That file is empty.';
    if (bytes > MAX_BYTES) return 'That file is over 25 MB. A ticket is usually far smaller: is it the right file?';
    return '';
  }
  // the copy's name in data/tickets/<show>/: readable, safe on the Mac and Windows, unique by its id
  function fileName(id, name) {
    const ext = extOf(name) || 'bin';
    const stem = fold(String(name || '').replace(/\.[^.]*$/, '')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'ticket';
    return `${id}-${stem}.${ext}`;
  }

  // ---------- the show's night (Paris time) ----------
  const nightNum = (ms) => { const n = P.nightOf(ms); return Date.UTC(n.y, n.m - 1, n.d) / DAY; };
  const dayNum = (ms) => { const t = P.paris.parts(ms); return Date.UTC(t.y, t.m - 1, t.d) / DAY; };
  // 'day' from the morning of the show's night until it's over (its end, or 3 h / 6 h after the start for a concert / a
  // club night, plus 2 h to get home); a date-only listing: its whole Paris day. Then 'after'.
  function phase(show, now = Date.now()) {
    const start = Number(show?.start);
    if (!Number.isFinite(start)) return 'before';
    if (show.dateOnly) { const a = dayNum(start), b = dayNum(now); return b < a ? 'before' : b === a ? 'day' : 'after'; }
    const a = nightNum(start), b = nightNum(now);
    if (b < a) return 'before';
    if (b > a || now > P.endOf(show) + 2 * H) return 'after';
    return 'day';
  }

  // ---------- the index (data/tickets/index.json) ----------
  const empty = () => ({ v: V, shows: {}, dismissed: [] });
  // a show as kept with its ticket (what the tracker and the viewer need, even once it's off the weekly list)
  function show(s) {
    if (!s || !KEY.test(String(s.key || '')) || !str(s.title) || !Number.isFinite(Number(s.start))) throw Error('That show can’t hold a ticket (no name or date).');
    const v = s.venue || {};
    return { key: s.key, title: str(s.title, 160), start: Number(s.start), ...(Number.isFinite(Number(s.end)) && s.end ? { end: Number(s.end) } : {}), dateOnly: !!s.dateOnly,
      venue: { name: str(v.name, 120), address: str(v.address, 200) }, lineup: (Array.isArray(s.lineup) ? s.lineup : []).map((x) => str(x, 80)).filter(Boolean).slice(0, 12) };
  }
  function entry(f) {
    const id = str(f?.id, 24), file = str(f?.file, 120);
    if (!/^[a-z0-9]{6,24}$/.test(id) || !/^[a-z0-9][a-z0-9.-]*$/.test(file) || file.includes('..')) throw Error('A ticket entry is damaged.');
    const kind = ['pdf', 'image', 'pkpass'].includes(f.kind) ? f.kind : kindOf(file);
    if (!kind) throw Error('A ticket entry is damaged.');
    return { id, name: str(f.name, 160) || file, file, kind, bytes: Math.max(0, Number(f.bytes) || 0), sha: /^[a-f0-9]{64}$/.test(f.sha || '') ? f.sha : '',
      addedAt: str(f.addedAt, 40) || new Date(0).toISOString(), from: ['drop', 'pick', 'downloads', 'chat'].includes(f.from) ? f.from : 'pick' };
  }
  // a damaged index throws (the caller never treats it as empty, never saves over it)
  function validate(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || x.v !== V || !x.shows || typeof x.shows !== 'object' || Array.isArray(x.shows)) throw Error('The ticket list is damaged.');
    const out = empty();
    for (const [k, t] of Object.entries(x.shows).slice(0, MAX_SHOWS)) {
      if (!KEY.test(k) || !t || !Array.isArray(t.files)) throw Error('The ticket list is damaged.');
      const files = t.files.slice(0, MAX_FILES).map(entry);
      if (files.length) out.shows[k] = { show: show({ ...t.show, key: k }), files };
    }
    out.dismissed = (Array.isArray(x.dismissed) ? x.dismissed : []).map((s) => str(s, 400)).filter(Boolean).slice(-MAX_DISMISSED);
    return out;
  }
  function addFile(index, s, f) {
    const sh = show(s), e = entry(f), t = index.shows[sh.key] || { show: sh, files: [] };
    if (e.sha && t.files.some((x) => x.sha === e.sha)) return { entry: t.files.find((x) => x.sha === e.sha), dup: true };
    if (t.files.length >= MAX_FILES) throw Error(`A show holds up to ${MAX_FILES} tickets. Remove one first.`);
    t.show = { ...t.show, ...sh }; t.files.push(e); index.shows[sh.key] = t;
    return { entry: e, dup: false };
  }
  function removeFile(index, key, id) {
    const t = index.shows[key]; const f = t?.files.find((x) => x.id === id);
    if (!f) return null;
    t.files = t.files.filter((x) => x !== f);
    if (!t.files.length) delete index.shows[key];
    return f;
  }
  // per show: its files and where its night is (what the window and the ✦ tracker show)
  function summary(index, now = Date.now()) {
    return Object.values(index.shows).map((t) => ({ key: t.show.key, show: t.show, phase: phase(t.show, now), files: t.files.map((f) => ({ ...f })) }))
      .sort((a, b) => a.show.start - b.show.start);
  }
  const ready = (index, now = Date.now()) => summary(index, now).filter((t) => t.phase === 'day');

  // ---------- a file in Downloads named like a show ----------
  // words that say "a ticket" but not which show (left out of the name match; one of them is a small hint)
  const TICKET = new Set(['ticket', 'tickets', 'billet', 'billets', 'eticket', 'etickets', 'ebillet', 'entree', 'entrees', 'entry', 'admission', 'pass', 'wallet', 'order', 'orders', 'commande', 'confirmation', 'booking', 'receipt', 'recu', 'qr', 'qrcode', 'code', 'mobile', 'print', 'printable']);
  const PLATFORM = new Set(['shotgun', 'dice', 'fm', 'fnac', 'ticketmaster', 'seetickets', 'eventbrite', 'billetweb', 'weezevent', 'digitick']);
  const NOISE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'img', 'image', 'screenshot', 'screen', 'shot', 'capture', 'ecran', 'copy', 'copie', 'final', 'download', 'file', 'doc', 'document', 'scan', 'at', 'pm', 'am', 'le', 'la', 'les', 'l', 'the', 'de', 'du', 'des', 'd', 'a', 'au', 'et', 'and', 'x', 'w', 'with', 'b2b', 'live', 'dj', 'set', 'paris', 'club', 'presents', 'presente', 'for', 'pour', 'your', 'votre', 'ton', 'my', 'mon', 'on', 'en', 'in', 'of', 'un', 'une', 'feat', 'ft', 'vs', 'night', 'soiree', 'concert', 'show', 'event']);
  const words = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
  const meaningful = (s) => words(s).filter((w) => w.length > 1 && !/^\d+$/.test(w) && !NOISE.has(w) && !TICKET.has(w) && !PLATFORM.has(w));
  const MONTHS = { jan: 1, janv: 1, janvier: 1, january: 1, feb: 2, fev: 2, fevr: 2, fevrier: 2, february: 2, mar: 3, mars: 3, march: 3, apr: 4, avr: 4, avril: 4, april: 4, may: 5, mai: 5, jun: 6, juin: 6, june: 6, jul: 7, juil: 7, juillet: 7, july: 7, aug: 8, aou: 8, aout: 8, august: 8, sep: 9, sept: 9, septembre: 9, september: 9, oct: 10, octobre: 10, october: 10, nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12 };
  // dates written in a file name → [{ m, d, y? }] (2026-11-14 · 20261114 · 14-11-2026 · 14.11.26 · 14 nov · nov 14)
  function datesIn(name) {
    const s = fold(name).replace(/\.[a-z0-9]{2,7}$/, ''), out = [];
    const ok = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && (!y || (y >= 2000 && y <= 2099));
    const push = (y, m, d) => { if (ok(y, m, d)) out.push({ y: y || 0, m, d }); };
    for (const r of s.matchAll(/(?<!\d)(20\d\d)[-_. ]?(\d\d)[-_. ]?(\d\d)(?!\d)/g)) push(+r[1], +r[2], +r[3]);
    for (const r of s.matchAll(/(?<!\d)(\d{1,2})[-_.](\d{1,2})[-_.](20\d\d|\d\d)(?!\d)/g)) push(r[3].length === 2 ? 2000 + +r[3] : +r[3], +r[2], +r[1]);
    const mon = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
    for (const r of s.matchAll(new RegExp(`(?<![a-z0-9])(\\d{1,2})(?:er|st|nd|rd|th)?[-_. ]?(${mon})(?![a-z])`, 'g'))) push(0, MONTHS[r[2]], +r[1]);
    for (const r of s.matchAll(new RegExp(`(?<![a-z])(${mon})[-_. ]?(\\d{1,2})(?!\\d)`, 'g'))) push(0, MONTHS[r[1]], +r[2]);
    return out;
  }
  const hasPhrase = (hay, phrase) => phrase && (` ${hay} `).includes(` ${phrase} `);
  // how much a file's name looks like this show's ticket (the name only: the file is never opened for this)
  function score(fileName, s) {
    const base = String(fileName || '').replace(/\.[a-z0-9]{2,7}$/i, '');
    const hay = words(base).join(' '), mine = new Set(meaningful(base));
    const r = { score: 0, artist: false, title: 0, venue: false, date: false, conflict: false, ticket: false };
    // a lineup name, as a phrase ("arlo parks"), or a one-word name of 4+ letters; the title's own parts count as names
    // too ("Rinse Paris: Sherelle + Nia Archives"), for a show known only by its title (a show quest keeps no lineup)
    let artists = 0;
    const parts = String(s.title || '').split(/\s*(?::|\+|,|&|\||—|–|\/|\bb2b\b|\bx\b|\bw\/|\bfeat\.?|\bft\.?|\bvs\.?)\s*/i);
    for (const a of [...new Set([...(s.lineup || []).slice(0, 12), ...parts.slice(0, 8)])]) { const p = meaningful(a).join(' '); if (p && (p.includes(' ') || p.length >= 4) && hasPhrase(hay, p)) artists++; }
    if (artists) { r.artist = true; r.score += 4 + Math.min(1, artists - 1); }
    // the title's own words (minus the lineup's already counted)
    const tw = [...new Set(meaningful(s.title))];
    const hit = tw.filter((w) => mine.has(w) && (w.length >= 4 || tw.length <= 2));
    if (hit.length && (hit.length >= 2 || hit[0].length >= 5 || tw.length === 1)) { r.title = hit.length / tw.length; r.score += r.artist ? 1 : 1 + 3 * r.title; }
    // the venue (all of its words)
    const vw = [...new Set(meaningful(s.venue?.name))];
    if (vw.length && vw.every((w) => mine.has(w))) { r.venue = true; r.score += 2; }
    // a date in the name: the show's day (or its night's day) is a strong yes; another day is a no
    const ds = datesIn(base);
    if (ds.length && Number.isFinite(Number(s.start))) {
      // its start's day, its night's day (a 1 am start), and the day it ends on (a club night past midnight)
      const days = [P.paris.parts(Number(s.start)), P.nightOf(Number(s.start)), ...(s.dateOnly ? [] : [P.paris.parts(P.endOf({ ...s, start: Number(s.start) }))])];
      const same = (d) => days.some((t) => d.m === t.m && d.d === t.d && (!d.y || d.y === t.y));
      if (ds.some(same)) { r.date = true; r.score += 3; } else { r.conflict = true; r.score -= 5; }
    }
    if (words(base).some((w) => TICKET.has(w) || PLATFORM.has(w))) { r.ticket = true; r.score += 1; }
    return r;
  }
  // a file is offered for a show when it names it (an artist, the title) or names its venue on its date; never when its
  // date says another day; when two shows tie, nothing (no guess). One file → one show, one show → its best file.
  const MIN = 4, MAX_AGE = 120 * DAY;
  const sigOf = (f) => `${str(f.name, 200)}|${Number(f.size) || 0}|${Math.round(Number(f.mtime) || 0)}`;
  function suggest(files, shows, { now = Date.now(), dismissed = [], has = () => false } = {}) {
    const gone = new Set(dismissed), byShow = new Map();
    const open = (shows || []).filter((s) => s && KEY.test(String(s.key || '')) && !has(s.key) && phase(s, now) !== 'after');
    for (const f of (files || []).slice(0, 400)) {
      if (!kindOf(f.name) || refuse(f.name, f.size) || gone.has(sigOf(f)) || (Number(f.mtime) && now - f.mtime > MAX_AGE)) continue;
      const scored = open.map((s) => ({ s, r: score(f.name, s) })).filter(({ r }) => !r.conflict && r.score >= MIN && (r.artist || r.title > 0 || (r.venue && r.date)))
        .sort((a, b) => b.r.score - a.r.score);
      if (!scored.length || (scored[1] && scored[1].r.score === scored[0].r.score)) continue;
      const { s, r } = scored[0], best = byShow.get(s.key);
      if (!best || r.score > best.score || (r.score === best.score && (f.mtime || 0) > (best.mtime || 0))) byShow.set(s.key, { key: s.key, title: s.title, name: f.name, path: f.path, size: f.size, mtime: f.mtime, score: r.score, sig: sigOf(f) });
    }
    return [...byShow.values()].sort((a, b) => b.score - a.score);
  }

  return { V, MAX_BYTES, MAX_FILES, ACCEPT, kindOf, extOf, refuse, fileName, phase, empty, show, entry, validate, addFile, removeFile, summary, ready, datesIn, score, suggest, sigOf, fold };
});
