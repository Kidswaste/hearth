// (round 63, questwalk63) Quest walks: the thinking with no DOM. Turns the Paris places on the Sidequest map
// (parisquests61's guide + Codex's own pins) into an afternoon out: 3–5 nearby places not visited yet, in a good
// walking order (nearest neighbour, then 2-opt on straight-line distance × a walking factor), each with the time its
// own quest asks for, starting and ending at the nearest Métro (showprep62's bundled station list) or ending at
// tonight's show venue (showsync61's cached list). Total minutes stay inside the time asked (2 h or 3 h).
// Saving makes an ordinary campaign in Codex's journal (`c-walk-*`, one quest per stop, Codex's proof + review rules,
// `q.place` so the ✦ tracker shows each stop's pin), and the week plan can propose one on a free afternoon.
// Pure and node-testable: dev/questwalk-test.js. Nothing is fetched, no AI, no timers.
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.QuestWalkCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const FACTOR = 1.3, SPEED = 80; // streets aren't straight: ×1.3; 80 m a minute (showprep62's own walking rule)
  const MIN_STOPS = 3, MAX_STOPS = 5, NEAR = 12; // stops per walk; candidates looked at (nearest to the start)
  const r = Math.PI / 180;
  // metres between two points (equirectangular: exact enough inside Paris, and cheap)
  function meters(a, b) { const x = (b.lon - a.lon) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371e3; }
  const walkMin = (m) => m * FACTOR / SPEED; // minutes on foot (a float; rounded only when shown)
  const ok = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const fmt = (min) => { const m = Math.round(min); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`; };
  const km = (m) => (m / 1000 * FACTOR).toFixed(1); // walking km (the straight line × the factor)
  const hash = (t) => { let h = 2166136261; for (const ch of String(t)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').trim();

  // ---------- Métro ----------
  // The nearest station of a list ([{ name, lat, lon, lines }], ShowPrepCore.STATIONS) to a point
  function station(p, stations = []) {
    let best = null, bm = Infinity;
    for (const s of stations) { const m = meters(p, s); if (m < bm) { bm = m; best = s; } }
    return best ? { name: best.name, lat: best.lat, lon: best.lon, lines: best.lines || [], kind: 'metro', m: Math.round(bm) } : null;
  }

  // ---------- order: nearest neighbour + 2-opt on an open path ----------
  // The cost of an order: start → stops → end (a fixed end such as a show venue), or, with no fixed end, the walk on to
  // the Métro nearest the last stop. Same function the tests' brute force uses.
  function cost(start, pts, end, stations) {
    let m = 0, prev = start;
    for (const p of pts) { m += meters(prev, p); prev = p; }
    if (end) m += meters(prev, end); else if (stations?.length && pts.length) m += station(prev, stations).m;
    return m;
  }
  // nearest neighbour from the start (optionally with a given first stop)
  function nearest(start, pts, first = null) {
    const left = [...pts], seq = [];
    if (first) { seq.push(first); left.splice(left.indexOf(first), 1); }
    let at = seq[0] || start;
    while (left.length) { let bi = 0, bm = Infinity; left.forEach((p, i) => { const m = meters(at, p); if (m < bm) { bm = m; bi = i; } }); at = left[bi]; seq.push(at); left.splice(bi, 1); }
    return seq;
  }
  // 2-opt: reverse any run of stops while that makes the whole walk shorter (the start stays; a fixed end stays), and
  // move one stop elsewhere (or-opt: on an open path 2-opt alone can leave one stop stranded)
  function improve(start, seq, end, stations) {
    let best = cost(start, seq, end, stations), better = true;
    while (better) {
      better = false;
      for (let i = 0; i < seq.length - 1; i++) for (let k = i + 1; k < seq.length; k++) {
        const t = [...seq.slice(0, i), ...seq.slice(i, k + 1).reverse(), ...seq.slice(k + 1)], c = cost(start, t, end, stations);
        if (c < best - 0.01) { best = c; seq = t; better = true; }
      }
      for (let i = 0; i < seq.length; i++) for (let k = 0; k < seq.length; k++) {
        if (k === i) continue;
        const t = [...seq]; t.splice(k, 0, ...t.splice(i, 1)); const c = cost(start, t, end, stations);
        if (c < best - 0.01) { best = c; seq = t; better = true; }
      }
    }
    return { seq, c: best };
  }
  // The walking order: nearest neighbour + 2-opt, tried once from the start and once from each possible first stop
  // (≤ 5 stops: a handful of tiny runs), keeping the shortest
  function order(start, pts, end = null, stations = []) {
    let best = improve(start, nearest(start, pts), end, stations);
    for (const f of pts) { const r = improve(start, nearest(start, pts, f), end, stations); if (r.c < best.c - 0.01) best = r; }
    return best.seq;
  }

  // ---------- one route ----------
  // start: a Métro station; stops: [{ id, name, lat, lon, minutes }]; end: a fixed end ({ name, lat, lon, kind: 'show' })
  // or null (then the Métro nearest the last stop). Legs, walking km and minutes, time at the stops, the total.
  function route(start, stops, { end = null, stations = [], budget = 120 } = {}) {
    const seq = order(start, stops, end, stations);
    const fin = end || station(seq[seq.length - 1] || start, stations) || start;
    const pts = [start, ...seq, fin], legs = [];
    let m = 0;
    for (let i = 1; i < pts.length; i++) { const d = meters(pts[i - 1], pts[i]); m += d; legs.push({ from: pts[i - 1].name, to: pts[i].name, m: Math.round(d), min: walkMin(d) }); }
    const walk = walkMin(m), at = seq.reduce((n, p) => n + p.minutes, 0);
    return { start, stops: seq, end: fin, legs, m: Math.round(m), km: km(m), walk, at, total: walk + at, budget, fits: walk + at <= budget };
  }

  // ---------- where the walk happens ----------
  // The densest corner of the pool (most candidates within `radius` m); `variant` skips that many earlier corners
  // (each at least 1.5 km from the ones before), so "another area" really is another area.
  function anchor(pool, { radius = 1200, variant = 0 } = {}) {
    const scored = pool.filter(ok).map((p) => ({ p, n: pool.filter((q) => ok(q) && meters(p, q) <= radius).length })).sort((a, b) => b.n - a.n || a.p.id.localeCompare(b.p.id));
    const picks = [];
    for (const x of scored) { if (picks.every((y) => meters(x.p, y.p) > 1500)) picks.push(x); if (picks.length > variant) break; }
    const pick = picks[Math.min(variant, picks.length - 1)];
    return pick ? { lat: pick.p.lat, lon: pick.p.lon, name: pick.p.name, id: pick.p.id, areas: picks.length } : null;
  }

  // ---------- the walk: 3–5 stops within the time ----------
  // pool: places ({ id, name, lat, lon, minutes, … }); at: where it starts (a place, or a point); end: a fixed end or null.
  // Stops are taken nearest-first from the start, each only if the whole walk (reordered) still fits the budget.
  function plan({ pool = [], at = null, budget = 120, stations = [], end = null, max = MAX_STOPS, min = MIN_STOPS, first = null } = {}) {
    const usable = pool.filter((p) => ok(p) && Number.isFinite(p.minutes));
    if (usable.length < 2) return { error: 'Not enough places left to walk between: fewer than two unvisited places match.' };
    const here = ok(at) ? at : anchor(usable);
    const start = station(here, stations) || { name: here.name || 'Start', lat: here.lat, lon: here.lon, lines: [], kind: 'point', m: 0 };
    const near = [...usable].sort((a, b) => meters(here, a) - meters(here, b) || a.id.localeCompare(b.id)).slice(0, NEAR);
    if (first) { const f = usable.find((p) => p.id === first); if (f) { const i = near.indexOf(f); if (i >= 0) near.splice(i, 1); near.unshift(f); } } // "from <place>": that place is the first stop
    let chosen = [], best = null;
    for (const p of near) {
      if (chosen.length >= max) break;
      const r = route(start, [...chosen, p], { end, stations, budget });
      if (r.fits) { chosen = [...chosen, p]; best = r; }
    }
    if (!best) return { error: `Even one stop doesn’t fit in ${fmt(budget)} from ${start.name}. Try 3h.` };
    return { ...best, short: chosen.length < min, here: { lat: here.lat, lon: here.lon, name: here.name || start.name }, id: campaignId(best) };
  }

  // ---------- the places a walk can use ----------
  // Guide places (parisquests61) and the owner's own map pins (Codex's atlas) not visited yet, whose place quest isn't
  // finished; never a station (Codex's 'travel' pins). filter: a guide word (shows, records, park, 11e… through
  // QuestParis.matches) or words of a pin's name / mission. stepMinutes(g): the time the place's own quest asks for there.
  function poolFrom({ C, s, guide = [], matches = null, filter = '', stepMinutes = () => 20 }) {
    const places = s?.atlas?.places || [], visited = new Set(places.filter((p) => p.visitedAt).map((p) => p.id));
    const doneCamp = (pred) => (s?.campaigns || []).some((c) => pred(c) && C.campaignDone(s, c));
    const q = fold(filter), out = [];
    const clampMin = (m) => Math.max(10, Math.min(60, Number(m) || 20));
    for (const g of guide) {
      if (!ok(g) || visited.has(g.id) || g.kind === 'travel' || doneCamp((c) => c.parisPlace === g.id && /^c-pp-/.test(c.id))) continue;
      if (q && !(matches ? matches(g, filter) : fold(g.name).includes(q))) continue;
      out.push({ id: g.id, name: g.name, short: g.name.replace(/\s*\(.*\)$/, '').replace(/^(Parc|Jardin|Square|Musée) (des |du |de la |de l’|de )?/, ''), lat: g.lat, lon: g.lon, minutes: clampMin(stepMinutes(g)), todo: g.todo || '', proof: g.proof || '', guide: true });
    }
    for (const p of places) {
      if (!ok(p) || visited.has(p.id) || out.some((x) => x.id === p.id) || guide.some((g) => g.id === p.id)) continue;
      const kind = C.placeKind ? C.placeKind(p) : p.kind;
      if (kind === 'travel' || doneCamp((c) => c.mapPlace === p.id)) continue;
      if (q && !fold(`${p.name} ${p.quest || ''} ${kind}`).includes(q)) continue;
      const mission = (C.mapMissions || []).find((m) => m.kind === kind);
      out.push({ id: p.id, name: p.name, short: p.name, lat: p.lat, lon: p.lon, minutes: clampMin(mission?.minutes || 15), todo: p.quest ? `Your mission here: ${p.quest}` : '', proof: '', guide: false });
    }
    return out;
  }

  // ---------- what's asked:"/quest walk [area|tag|from <place>] [2h|3h] [show|noshow]" ----------
  function parse(text) {
    const out = { budget: 120, from: null, filter: '', show: null, sub: '' };
    const words = String(text || '').trim().split(/\s+/).filter(Boolean), rest = [];
    for (let i = 0; i < words.length; i++) {
      const w = fold(words[i]), t = w.match(/^(\d)(?:h|h(\d\d)|hours?)?$/), m = w.match(/^(\d{2,3})(?:m|min)$/);
      if (i === 0 && ['save', 'open', 'show-map', 'map', 'help', 'again', 'other', 'another'].includes(w)) { out.sub = w === 'map' ? 'show-map' : w === 'other' || w === 'again' ? 'another' : w; continue; }
      if (t && w.includes('h')) { out.budget = Math.min(240, Math.max(60, (+t[1]) * 60 + (+(t[2] || 0)))); continue; }
      if (m) { out.budget = Math.min(240, Math.max(60, +m[1])); continue; }
      if (w === 'show' || w === 'gig' || w === 'tonight') { out.show = true; continue; }
      if (w === 'noshow' || w === 'no-show') { out.show = false; continue; }
      if (w === 'from') { const tail = []; while (words[i + 1] && !/^\d(h|h\d\d)?$/i.test(words[i + 1]) && !/^(show|noshow)$/i.test(words[i + 1])) tail.push(words[++i]); out.from = tail.join(' ') || null; continue; }
      if (w === 'near' || w === 'around' || w === 'in') continue;
      rest.push(words[i]);
    }
    out.filter = rest.join(' ');
    return out;
  }

  // ---------- links (no API key: plain public URLs) ----------
  const ll = (p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  function links(rt) {
    const google = `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: ll(rt.start), destination: ll(rt.end), waypoints: rt.stops.map(ll).join('|'), travelmode: 'walking' })}`;
    const citymapper = `https://citymapper.com/directions?${new URLSearchParams({ startcoord: ll(rt.start), startname: rt.start.name, endcoord: ll(rt.stops[0] || rt.end), endname: (rt.stops[0] || rt.end).name })}`; // Citymapper takes no waypoints: to the first stop
    return { google, citymapper };
  }
  const metroWords = (p) => (p.kind === 'metro' ? `Métro ${p.name}${p.lines?.length ? ` (${p.lines.length > 1 ? 'lines' : 'line'} ${p.lines.join(', ')})` : ''}` : p.name);
  // One line per stop for the chat / the dialog
  function lines(rt) {
    const out = [`Start: ${metroWords(rt.start)}`];
    const walkWords = (min) => (min < 1 ? 'right there' : `walk ${fmt(min)}`);
    rt.stops.forEach((p, i) => out.push(`${i + 1}. ${p.name} · ${fmt(p.minutes)} there (${walkWords(rt.legs[i].min)})`));
    out.push(`End: ${rt.end.kind === 'show' ? `${rt.end.name} for ${rt.end.what || 'tonight’s show'}` : metroWords(rt.end)} (${walkWords(rt.legs.at(-1).min)})`);
    return out;
  }
  const summary = (rt) => `${rt.stops.length} stop${rt.stops.length === 1 ? '' : 's'} · ${rt.km} km · about ${fmt(rt.total)} of your ${fmt(rt.budget)} (${fmt(rt.walk)} walking)`;
  const title = (rt) => `Walk: ${rt.stops.map((p) => p.short || p.name.replace(/\s*\(.*\)$/, '')).join(' → ')}`.slice(0, 100);

  // ---------- the walk as a quest in Codex's journal ----------
  const campaignId = (rt) => 'c-walk-' + hash(rt.stops.map((p) => p.id).join('|') + '>' + (rt.end?.kind === 'show' ? rt.end.name : ''));
  const PROOF = 'A photo, a 10-second recording or one specific line from this stop. A visit stamp or a plan alone does not finish this step.';
  function campaign(rt) {
    const cid = campaignId(rt), base = cid.slice(2);
    const quests = rt.stops.map((p, i) => {
      const leg = rt.legs[i], last = i === rt.stops.length - 1, onward = last ? rt.legs[i + 1] : null;
      const then = last ? ` Then walk ${fmt(onward.min)} to ${rt.end.kind === 'show' ? rt.end.name + ' for the show' : metroWords(rt.end)}.` : '';
      return {
        id: `q-${base}-${i + 1}`, title: `${i + 1}. ${p.name}`.slice(0, 250),
        done: `Walk ${fmt(leg.min)} from ${i ? leg.from : metroWords(rt.start)} to ${p.name}. ${p.todo || `Spend about ${fmt(p.minutes)} there and notice one thing you’d bring home.`}${then}`.slice(0, 1000),
        tiny: (i ? `Head on toward ${p.name}: about ${fmt(leg.min)} on foot.` : `Get to ${metroWords(rt.start)} and open the walking route.`).slice(0, 500),
        minutes: Math.max(1, Math.min(120, Math.round(p.minutes + leg.min))), xp: last ? 35 : 25, tool: null,
        deep: 'One stop at a time. Skip a stop that’s closed; the walk still counts from the next one.', proofHint: (p.proof || PROOF).slice(0, 500), place: p.id,
      };
    });
    return {
      id: cid, title: title(rt), subtitle: `PARIS / WALK / ${fmt(rt.budget).toUpperCase()}`, path: 'life', badge: 'Paris walker',
      why: `${summary(rt)}. From ${metroWords(rt.start)} to ${rt.end.kind === 'show' ? rt.end.name : metroWords(rt.end)}; check opening times before you leave.`.slice(0, 600),
      walk: { v: 1, budget: rt.budget, m: rt.m, km: rt.km, total: Math.round(rt.total), start: pick(rt.start), end: pick(rt.end), stops: rt.stops.map(pick), link: links(rt).google },
      quests,
    };
  }
  const pick = (p) => ({ id: p.id || null, name: p.name, lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), kind: p.kind || 'place', lines: p.lines || [], minutes: p.minutes || 0 });
  // Saves (or reopens) the walk in a journal draft and follows it in the tracker. ensurePin(s, id) puts a guide stop on
  // the map (QuestParis.ensurePin) so each step shows its pin.
  function save(s, rt, { ensurePin = null } = {}) {
    const c = campaign(rt), old = s.campaigns.find((x) => x.id === c.id);
    if (old) { old.paused = false; s.active = old.id; return old; }
    if (s.campaigns.length >= 100) throw Error('The journal holds up to 100 campaigns. Finish or remove one first.');
    for (const p of rt.stops) if (ensurePin && !s.atlas?.places.some((x) => x.id === p.id)) ensurePin(s, p.id);
    s.campaigns.push(c); s.active = c.id; return c;
  }
  // The route of a saved walk (for the map line), or null
  function stored(c) {
    const w = c?.walk; if (!w || w.v !== 1 || !ok(w.start) || !ok(w.end) || !Array.isArray(w.stops)) return null;
    return { start: w.start, end: w.end, stops: w.stops.filter(ok), km: w.km, total: w.total, budget: w.budget, link: w.link };
  }
  // The walk the tracker follows: the active campaign when it's an unfinished walk
  function activeWalk(C, s) { const c = s?.campaigns?.find((x) => x.id === s.active); return c && /^c-walk-/.test(c.id) && !C.campaignDone(s, c) ? c : null; }

  // ---------- the week plan (weekquest62): a walk on a free afternoon ----------
  // week: WeekQuestCore.planWeek(); busy: days that already hold a show / plan item; weather: [{ date, rain, tmax }] or null
  function weekCandidate({ pool = [], stations = [], week, busy = [], weather = null, at = null, budget = 120 }) {
    if (!week) return null;
    const WD = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
    const taken = new Set(busy), wet = new Set((weather || []).filter((w) => !(w.rain < 50)).map((w) => w.date));
    const free = week.days.filter((d) => d >= week.from && !taken.has(d) && !wet.has(d));
    const day = free.find((d) => [6, 0].includes(WD(d))) || free[0];
    if (!day) return null;
    const rt = plan({ pool, at, budget, stations });
    if (rt.error || rt.stops.length < 2) return null;
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { id: 'walk-' + week.week, kind: 'walk', title: title(rt).slice(0, 160), why: `${names[WD(day)]} afternoon is free · ${summary(rt)}`.slice(0, 300), day, campaign: rt.id, walk: rt, rank: 5.5 };
  }

  return { FACTOR, SPEED, MIN_STOPS, MAX_STOPS, meters, walkMin, fmt, km, station, cost, order, route, anchor, plan, poolFrom, parse, links, lines, summary, title, campaignId, campaign, save, stored, activeWalk, weekCandidate, fold, metroWords };
});
