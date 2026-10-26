// (round 64, parisjournal64) My Paris: the thinking behind the personal map journal, with no DOM (node-tested by
// dev/parisjournal64-test.js). It reads only records that already exist and never writes any of them:
//   · Codex's quest journal (kv quest-journal): finished place quests (parisquests61 `c-pp-*`, Codex's field quests
//     `mapPlace`, personal quests with a pin), finished walks (questwalk63 `c-walk-*`, each stop), visit stamps
//   · showprep62's "Shows I went to" log (kv show-nights): every night kept, with its rating, moment and photo
//   · parkjam62's park takes (<data>/creative-park/<sketch>/*.json, listed by creative-vstmain.js parkList)
//   · (round 66, bouncelog66) logged music sessions (kv music-sessions): a dot on the timeline, a pin at the park when
//     Park mode was on there, the sketch playing in the moment
// and turns them into moments ({ id, kind, at, month, title, place, arrs, places, photo, note, rating, loop… }), months,
// pins (one per spot), a monthly recap (counts, the 20 arrondissements, what's new, "Paris explored" % of the guide's
// places) and the lines of the image card. Nothing here fetches, uploads or calls an AI.
(function (root, make) { if (typeof module === 'object') module.exports = make(); else root.ParisJournalCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const KINDS = {
    place: { name: 'Place', many: 'places', icon: 'check', color: '#ff6b9d' },
    show: { name: 'Show', many: 'shows', icon: 'music', color: '#ffb14a' },
    walk: { name: 'Walk', many: 'walks', icon: 'arrow', color: '#ffd75e' },
    park: { name: 'Park session', many: 'park sessions', icon: 'play', color: '#7ee0a8' },
    music: { name: 'Music session', many: 'music sessions', icon: 'music', color: '#b78aff' }, // (round 66, bouncelog66) logged Sound desk sessions (not a tile on the card)
  };
  // Rough centre of each arrondissement (the same table as dev/quest-paris-test.js; 12e without the Bois de Vincennes,
  // 16e without the Bois de Boulogne). Used only when a place has no arrondissement of its own and no postcode.
  const ARR = { 1: [48.8625, 2.3364], 2: [48.8683, 2.3428], 3: [48.8630, 2.3601], 4: [48.8543, 2.3576], 5: [48.8445, 2.3507], 6: [48.8491, 2.3328], 7: [48.8562, 2.3122], 8: [48.8727, 2.3125], 9: [48.8771, 2.3375], 10: [48.8761, 2.3607], 11: [48.8591, 2.3800], 12: [48.8396, 2.3876], 13: [48.8283, 2.3623], 14: [48.8292, 2.3266], 15: [48.8401, 2.2929], 16: [48.8604, 2.2700], 17: [48.8873, 2.3067], 18: [48.8925, 2.3484], 19: [48.8871, 2.3848], 20: [48.8634, 2.4012] };
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
  const num = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const has = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 73.2);
  const arrLabel = (n) => (n === 1 ? '1er' : `${n}e`);
  const pad = (n) => String(n).padStart(2, '0');
  // the owner's own month for a moment (their computer's calendar: a night out on the 31st belongs to that month)
  const monthOf = (t) => { const d = new Date(t); return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : ''; };
  const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const monthName = (key, short = false) => { const [y, m] = String(key).split('-').map(Number); if (!y || !m) return 'All time'; const n = MONTHS[m - 1]; return `${n[0].toUpperCase()}${short ? n.slice(1, 3) : n.slice(1)} ${y}`; };
  const shiftMonth = (key, by) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + by, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

  /** The arrondissement (1–20) of a spot: its own (the guide's), a Paris postcode in its address (750NN, 75116), or the
   * nearest arrondissement centre when it's inside Paris and close to one; else null (outside Paris, or unknown). */
  function arrOf({ arr, address, lat, lon } = {}) {
    if (Number.isInteger(arr) && arr >= 1 && arr <= 20) return arr;
    const pc = /\b75(?:0(\d\d)|116)\b/.exec(String(address || ''));
    if (pc) { const n = pc[1] ? Number(pc[1]) : 16; if (n >= 1 && n <= 20) return n; }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 48.815 || lat > 48.903 || lon < 2.224 || lon > 2.47) return null;
    let best = null, d = Infinity; for (const [n, c] of Object.entries(ARR)) { const x = km([lat, lon], c); if (x < d) { d = x; best = Number(n); } }
    return d <= 3 ? best : null;
  }

  // ---------- reading what already exists ----------
  // a place by id: the journal's own atlas pin first (the owner may have moved it), then the guide's
  function placeById(s, P, id) {
    const a = (s?.atlas?.places || []).find((p) => p.id === id) || (s?.atlas?.places || []).find((p) => p.guide === id), g = P?.byId?.(id) || null; // (parisdedupe64) or your twin of it
    if (!a && !g) return null;
    const lat = num(a?.lat ?? g?.lat), lon = num(a?.lon ?? g?.lon);
    return { id, name: a?.name || g?.name || id, lat, lon, kind: a?.kind || g?.kind || 'reset', arr: arrOf({ arr: g?.arr, lat, lon }), guide: Boolean(g && P.guide?.some((x) => x.id === id)) };
  }
  // a spot by name (a show's venue, a park take's place): the guide's words (parks too), then the owner's own pins
  function placeByName(s, P, name) {
    const f = fold(name); if (!f) return null;
    const g = P?.findPlace?.(name); if (g && (fold(g.name).includes(f) || f.includes(fold(g.name).split(' (')[0]) || P.parks?.[f.replace(/\s+/g, '-')])) return placeById(s, P, g.id);
    const a = (s?.atlas?.places || []).find((p) => fold(p.name) === f) || (s?.atlas?.places || []).find((p) => f.length > 3 && (fold(p.name).includes(f) || f.includes(fold(p.name))));
    return a ? placeById(s, P, a.id) : null;
  }
  const doneAt = (s, qs) => { const t = qs.map((q) => s.records?.[q.id]?.completedAt).filter(Boolean); return t.length === qs.length && t.length ? t.sort().at(-1) : null; };
  // the newest proof of a list of quests: its photo and a line of its text (the owner's own words)
  function proofOf(s, qs) {
    let photo = '', note = '';
    for (const q of qs) {
      const r = s.records?.[q.id]; if (r?.note && !note) note = r.note;
      for (const x of [...(s.submissions?.[q.id] || [])].reverse()) { if (!photo && x.proof?.images?.[0]) photo = x.proof.images[0]; if (!note && x.proof?.excerpt) note = x.proof.excerpt; }
    }
    return { photo, note: String(note || '').replace(/^#.*\n/, '').replace(/\s+/g, ' ').trim().slice(0, 280) };
  }

  /** Every moment the owner actually lived, newest first. `takes` = parkList's takes; `shows` = the show log. */
  function collect({ C, s, P, shows = null, takes = [], sessions: logged = [] } = {}) {
    const out = [];
    for (const c of s?.campaigns || []) {
      if (!Array.isArray(c.quests) || !c.quests.length) continue;
      const walk = /^c-walk-/.test(c.id) && c.walk?.v === 1;
      const pid = walk ? null : c.parisPlace || c.mapPlace || null;
      if (!walk && !pid) continue;
      const at = doneAt(s, c.quests);
      if (walk) {
        // each stop done counts as a place explored (even when the walk isn't finished); the walk itself once finished
        const stops = (c.walk.stops || []).map((p, i) => ({ ...p, q: c.quests[i] })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
        const done = stops.filter((p) => p.q && s.records?.[p.q.id]?.completedAt);
        const spots = stops.map((p) => (p.id && placeById(s, P, p.id)) || { id: p.id, name: p.name, lat: p.lat, lon: p.lon, kind: p.kind, arr: arrOf(p) });
        if (at) {
          const first = spots[0] || null, pr = proofOf(s, c.quests);
          out.push({ id: `walk-${c.id}`, kind: 'walk', at, title: c.title, place: first, spots, arrs: [...new Set(spots.map((p) => p.arr).filter(Boolean))], places: spots.map((p) => p.id).filter(Boolean), km: c.walk.km, ...pr, campaign: c.id });
        } else for (const p of done) {
          const sp = spots[stops.indexOf(p)], t = s.records[p.q.id].completedAt, pr = proofOf(s, [p.q]);
          out.push({ id: `stop-${p.q.id}`, kind: 'place', at: t, title: sp.name, place: sp, arrs: sp.arr ? [sp.arr] : [], places: sp.id ? [sp.id] : [], ...pr, campaign: c.id, quest: p.q.id, via: c.title });
        }
        continue;
      }
      if (!at) continue;
      const place = placeById(s, P, pid); if (!place || !has(place)) continue;
      out.push({ id: `place-${c.id}`, kind: 'place', at, title: c.parisPersonal ? `${c.title} · ${place.name}` : c.title, place, arrs: place.arr ? [place.arr] : [], places: [place.id], ...proofOf(s, c.quests), campaign: c.id });
    }
    for (const e of shows?.went || []) {
      if (e.removedAt || !Number.isFinite(e.show?.start)) continue;
      const v = e.show.venue || {}, named = has(v) ? null : placeByName(s, P, v.name);
      const lat = num(v.lat) ?? named?.lat ?? null, lon = num(v.lon) ?? named?.lon ?? null;
      const g = placeByName(s, P, v.name), arr = arrOf({ arr: g?.guide ? g.arr : null, address: v.address, lat, lon });
      out.push({ id: `show-${e.key}`, kind: 'show', at: new Date(e.show.start).toISOString(), title: e.show.title, place: { id: g?.id || null, name: v.name || 'Venue', lat, lon, kind: 'music', arr }, arrs: arr ? [arr] : [], places: g?.guide ? [g.id] : [],
        photo: e.photo?.jpg || e.photo?.path || '', note: e.moment || '', rating: e.rating || null, lineup: e.show.lineup || [], key: e.key, campaign: e.questId || '' });
    }
    // park takes → sessions (one per sketch per day), newest take's loop to play
    const sessions = new Map();
    for (const t of takes || []) {
      if (!t || typeof t.at !== 'string' || !Number.isFinite(Date.parse(t.at))) continue;
      const key = `${t.folder || t.sketch || t.place}|${dayOf(t.at)}`, x = sessions.get(key) || { takes: [] };
      x.takes.push(t); sessions.set(key, x);
    }
    for (const [key, x] of sessions) {
      const list = x.takes.sort((a, b) => String(a.at).localeCompare(String(b.at))), last = list.at(-1), name = last.place || 'Outside';
      const spot = placeByName(s, P, name), arr = spot?.arr || null;
      out.push({ id: `park-${fold(key).replace(/[^a-z0-9]+/g, '-').slice(0, 80)}`, kind: 'park', at: list[0].at, title: `Park session · ${name}`, place: spot && has(spot) ? spot : { id: null, name, lat: null, lon: null, kind: 'music', arr: null },
        arrs: arr ? [arr] : [], places: spot?.guide ? [spot.id] : [], loop: last.layered || last.loop || '', loops: list.map((t) => ({ at: t.at, path: t.layered || t.loop, bars: t.bars, bpm: t.bpm })).filter((t) => t.path),
        note: `${list.length} loop${list.length === 1 ? '' : 's'} · ${last.bars} bars at ${Math.round(last.bpm)} BPM${last.notes ? ` · ${last.notes} notes` : ''}${last.instrument ? ` · ${last.instrument}` : ''}`, sketch: last.sketch || '', photo: '' });
    }
    // (round 66, bouncelog66) logged Sound desk sessions: at the park when Park mode named one, else on the timeline only
    for (const r of logged || []) {
      if (!r?.logged || typeof r.start !== 'string' || !Number.isFinite(Date.parse(r.start))) continue;
      const spot = r.place ? placeByName(s, P, r.place) : null, arr = spot?.arr || null, sk = (r.sketches || [])[0];
      out.push({ id: `music-${String(r.id).replace(/[^\w-]+/g, '-').slice(0, 80)}`, kind: 'music', at: r.start, title: `Music session · ${r.minutes} min`, place: spot && has(spot) ? spot : { id: null, name: r.place || 'Sound desk', lat: null, lon: null, kind: 'music', arr: null },
        arrs: arr ? [arr] : [], places: [], loop: sk?.path || '', note: [(r.instruments || []).join(' + ') || 'Sound desk', r.used?.park ? 'Park mode' : '', r.used?.liveset ? 'Live set' : '', r.used?.arrange ? 'Arrange' : ''].filter(Boolean).join(' · '),
        photo: '', campaign: r.logged.quests?.[0]?.campaign || '', quest: r.logged.quests?.[0]?.quest || undefined });
    }
    for (const m of out) { m.month = monthOf(m.at); if (!m.place || !has(m.place)) m.pinless = true; }
    return out.filter((m) => m.month).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  // the owner's own visit stamps (Codex's "Stamp my visit"): they count toward "Paris explored", not as moments
  const stamps = (s) => (s?.atlas?.places || []).filter((p) => p.visitedAt && Number.isFinite(Date.parse(p.visitedAt))).map((p) => ({ id: p.guide || p.id, at: p.visitedAt })); // (parisdedupe64) a twin's stamp counts for its guide place

  /** The months that have moments, newest first: [{ key, label, n }] */
  function months(list) {
    const m = new Map(); for (const x of list) m.set(x.month, (m.get(x.month) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, n]) => ({ key, label: monthName(key), short: monthName(key, true), n }));
  }
  /** "/paris month [october | oct 2025 | octobre | 2026-10 | last | this]" → 'YYYY-MM' (a month name without a year is the
   * latest one not after now), or null when the word isn't a month. */
  function parseMonth(word, now = new Date()) {
    const w = fold(word), cur = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    if (!w || w === 'this' || w === 'this month' || w === 'now') return cur;
    if (w === 'last' || w === 'last month' || w === 'previous') return shiftMonth(cur, -1);
    let m = /^(\d{4})-(\d{1,2})$/.exec(w); if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${pad(+m[2])}`;
    m = /^(\d{1,2})\/(\d{4})$/.exec(w); if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${pad(+m[1])}`;
    m = /^([a-z]+)\.?(?:\s+(\d{4}))?$/.exec(w); if (!m || m[1].length < 3) return null;
    let i = MONTHS.findIndex((n) => n.startsWith(m[1])); if (i < 0) i = MOIS.findIndex((n) => n.startsWith(m[1])); if (i < 0) return null;
    if (m[2]) return `${m[2]}-${pad(i + 1)}`;
    const y = i > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
    return `${y}-${pad(i + 1)}`;
  }

  /** Map pins: one per spot (moments at the same place share a pin), only the month asked ('' = all time). */
  function pins(list, month = '') {
    const by = new Map();
    for (const m of list) {
      if (month && m.month !== month) continue;
      if (m.pinless) continue;
      const k = m.place.id || `${m.place.lat.toFixed(4)},${m.place.lon.toFixed(4)}`, x = by.get(k) || { key: k, place: m.place, moments: [] };
      x.moments.push(m); by.set(k, x);
    }
    return [...by.values()].map((x) => {
      const top = x.moments[0], photo = x.moments.find((m) => m.photo)?.photo || '';
      return { id: `mp-${fold(x.key).replace(/[^a-z0-9.,]+/g, '-').slice(0, 90)}`, name: x.moments.length > 1 ? `${x.place.name} · ${x.moments.length}` : top.title, lat: x.place.lat, lon: x.place.lon,
        kind: KINDS[top.kind].icon, color: KINDS[top.kind].color, photo, moments: x.moments.map((m) => m.id) };
    });
  }

  /** The monthly recap: counts, the 20 arrondissements (n per cell), what's new this month, Paris explored. */
  function recap(list, month, { guide = [], stamps: st = [] } = {}) {
    const mine = list.filter((m) => m.month === month), before = list.filter((m) => m.month < month);
    const counts = { place: 0, show: 0, walk: 0, park: 0 }; for (const m of mine) counts[m.kind] = (counts[m.kind] || 0) + 1; // (round 66) + music, only when there are some
    const arrs = Array.from({ length: 20 }, () => 0); for (const m of mine) for (const a of m.arrs) arrs[a - 1]++;
    const seenArr = new Set(before.flatMap((m) => m.arrs));
    const newArrs = arrs.map((n, i) => (n && !seenArr.has(i + 1) ? i + 1 : 0)).filter(Boolean);
    const spotKey = (m) => m.place?.id || fold(m.place?.name);
    const seenSpot = new Set(before.flatMap((m) => [spotKey(m), ...(m.spots || []).map((p) => p.id || fold(p.name))]));
    const newSpots = []; for (const m of [...mine].reverse()) for (const p of m.kind === 'walk' ? m.spots : m.kind === 'music' && !has(m.place) ? [] : [m.place]) { const k = p?.id || fold(p?.name); if (k && !seenSpot.has(k)) { seenSpot.add(k); newSpots.push(p.name); } }
    const ids = new Set(guide.map((g) => g.id)), end = shiftMonth(month, 1);
    const upto = (lim) => { const x = new Set(); for (const m of list) if (m.month < lim) for (const id of m.places) if (ids.has(id)) x.add(id); for (const p of st) if (ids.has(p.id) && monthOf(p.at) < lim) x.add(p.id); return x; };
    const now = upto(end), was = upto(month), total = ids.size;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    return { month, label: monthName(month), counts, total: mine.length, arrs, arrCount: arrs.filter(Boolean).length, newArrs, newSpots, moments: mine,
      explored: { n: now.size, total, pct: pct(now.size), before: pct(was.size), gained: now.size - was.size, ids: [...now] },
      best: mine.filter((m) => m.rating).sort((a, b) => b.rating - a.rating)[0] || null };
  }
  const plural = (n, k) => `${n} ${n === 1 ? KINDS[k].name.toLowerCase() : KINDS[k].many}`;
  /** The recap in words (the chat's answer and the card's lines). */
  function recapText(r) {
    if (!r.total) return `${r.label}: nothing on your Paris map yet. Finish a place quest, keep a show night (/shows went), walk a walk or record a park loop, and it shows up here.`;
    const c = r.counts, bits = ['place', 'show', 'walk', 'park', 'music'].filter((k) => c[k]).map((k) => plural(c[k], k));
    const lines = [`${r.label} in Paris: ${bits.join(' · ')}.`, `${r.arrCount} of 20 arrondissements${r.arrCount ? `: ${r.arrs.map((n, i) => (n ? arrLabel(i + 1) : '')).filter(Boolean).join(', ')}` : ''}${r.newArrs.length ? ` (new: ${r.newArrs.map(arrLabel).join(', ')})` : ''}.`];
    if (r.newSpots.length) lines.push(`New this month: ${r.newSpots.slice(0, 6).join(', ')}${r.newSpots.length > 6 ? ` +${r.newSpots.length - 6}` : ''}.`);
    lines.push(`Paris explored: ${r.explored.pct}% of the guide's ${r.explored.total} places${r.explored.gained ? ` (+${r.explored.gained} this month)` : ''}.`);
    if (r.best) lines.push(`Best night: ${r.best.title} ${'★'.repeat(r.best.rating)}${r.best.note ? ` — ${r.best.note}` : ''}`);
    return lines.join('\n');
  }
  /** What goes on the image card (no paths, no names of people beyond the owner's own words). */
  function card(r) {
    return { title: 'My Paris', month: r.label, tiles: ['place', 'show', 'walk', 'park'].map((k) => ({ n: r.counts[k], label: r.counts[k] === 1 ? KINDS[k].name : KINDS[k].many[0].toUpperCase() + KINDS[k].many.slice(1), color: KINDS[k].color })),
      arrs: r.arrs, newArrs: r.newArrs, explored: r.explored, fresh: r.newSpots.slice(0, 5), best: r.best ? { title: r.best.title, rating: r.best.rating, note: String(r.best.note || '').slice(0, 90) } : null,
      photos: r.moments.filter((m) => m.photo).slice(0, 3).map((m) => m.photo) };
  }
  // where the image card goes: the owner's Pictures folder › Hearth › My Paris (never uploaded)
  const fileName = (month) => `My Paris ${month}.png`;

  return { KINDS, ARR, arrOf, arrLabel, fold, collect, stamps, months, monthOf, monthName, shiftMonth, parseMonth, pins, recap, recapText, card, fileName, placeByName, placeById };
});
