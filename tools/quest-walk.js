// (round 63, questwalk63) Quest walks in Sidequest Studio: "/quest walk [area|tag|from <place>] [2h|3h]" and the
// "Make a walk" button in the Paris map footer's guide dialog chain 3–5 nearby places you haven't visited (the Paris
// guide + your own pins) into an afternoon out: ordered for walking, from the nearest Métro to the Métro at the end (or
// tonight's show venue when you have its quest), time at each stop from that place's quest, total time and km, a line
// on the Paris map, and "Open walking route" (Google Maps walking with the stops as waypoints; no key). "Save as a walk
// quest" makes an ordinary campaign in Codex's journal (one step per stop, proof + review as always) that the ✦ tracker
// follows step by step. The thinking is in tools/quest-walk-core.js; this file is the map layer, the dialog and the
// chat words. Writes go through the journal's own mutate (atomic, announced). No timers, no network, no AI.
const QuestWalk = window.QuestWalk = (() => {
  const W = QuestWalkCore, P = QuestParis, C = QuestCore;
  const J = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null);
  const ui = () => J().paris.ui();
  const stations = () => ShowPrepCore.STATIONS;
  let preview = null; // the walk last made (not saved yet): { rt, opts }
  let variant = 0, seq = 0; // seq: each walk shown is framed once on the map
  const COLOR = '#ffd75e';

  // ---------- making a walk ----------
  const placeMinutes = (s) => (g) => s.campaigns.find((c) => c.id === P.campaignId(g.id))?.quests[1]?.minutes || P.placeSteps(g)[1][3];
  const night = (t) => { const d = new Date(new Date(t).getHours() < 6 ? t - 6 * 3600e3 : t); return d.toDateString(); };
  const hm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  // Tonight's show (showsync61's cached list, nothing fetched): the one you made a quest for, or (asked: "show") the first
  function tonight(s, want) {
    if (want === false || typeof ShowSync === 'undefined') return null;
    const now = Date.now(), list = (ShowSync.snap?.shows || []).filter((x) => !x.cancelled && Number.isFinite(x.start) && x.start > now && night(x.start) === night(now) && Number.isFinite(x.venue?.lat) && Number.isFinite(x.venue?.lon)).sort((a, b) => a.start - b.start);
    const mine = list.find((x) => s.campaigns.some((c) => c.id === `c-show-${x.key}` && !C.campaignDone(s, c)));
    const x = mine || (want ? list[0] : null); if (!x) return null;
    const who = x.lineup?.length ? x.lineup.slice(0, 2).join(' & ') : x.title;
    return { name: x.venue.name, lat: x.venue.lat, lon: x.venue.lon, kind: 'show', what: `${who} at ${hm(x.start)}`, start: x.start };
  }
  function findFrom(s, word) {
    const g = P.findPlace(word); if (g) return g;
    const f = W.fold(word); return (s.atlas?.places || []).find((p) => W.fold(p.name).includes(f)) || null;
  }
  // Where the walk starts when nothing is said: your "near you" place (the ✦ tracker's), else the densest corner
  function home(s, pool) {
    const near = typeof QuestHud !== 'undefined' ? QuestHud.state().prefs.near : 'off';
    const p = near && near !== 'off' && near !== 'gps' ? s.atlas?.places.find((x) => x.id === near) : null;
    return p && !variant ? { lat: p.lat, lon: p.lon, name: p.name } : W.anchor(pool, { variant });
  }
  function make(s, opts) {
    const end = tonight(s, opts.show);
    const pool = W.poolFrom({ C, s, guide: P.guide, matches: P.matches, filter: opts.filter, stepMinutes: placeMinutes(s) }).filter((p) => !end || W.meters(p, end) > 150); // the venue itself is the night's own quest
    if (!pool.length && opts.filter) return { error: `No unvisited place matches “${opts.filter}”. Try shows, records, park, view, art, free or an arrondissement (11e).` };
    let at = null, first = null;
    if (opts.from) { const f = findFrom(s, opts.from); if (!f) return { error: `No place called “${opts.from}” on the guide or your map.` }; at = f; first = pool.some((p) => p.id === f.id) ? f.id : null; }
    else if (end && !opts.filter) at = W.anchor(pool.filter((p) => W.meters(p, end) < 2500), { variant }) || end; // a walk toward the show: start near it
    else at = home(s, pool);
    const rt = W.plan({ pool, at, first, budget: opts.budget, stations: stations(), end });
    return rt.error ? rt : { ...rt, links: W.links(rt) };
  }
  const leave = (rt) => (rt.end.kind === 'show' && rt.end.start ? ` Leave ${W.metroWords(rt.start)} by ${hm(rt.end.start - (rt.total + 10) * 60e3)} to be there for ${hm(rt.end.start)}.` : '');
  const text = (rt) => `${W.summary(rt)}.${rt.short ? ` Only ${rt.stops.length} stops fit here in ${W.fmt(rt.budget)}: try 3h.` : ''}${leave(rt)}\n${W.lines(rt).join('\n')}`;

  // ---------- the map layer: the line, the two Métro ends, stops not on your map yet ----------
  function shown() {
    if (preview) return { rt: preview.rt, saved: false };
    const st = J()?.ready?.() ? ui().state() : null, c = st && W.activeWalk(C, st);
    const rt = c && W.stored(c); return rt ? { rt, saved: true, campaign: c } : null;
  }
  const layer = {
    id: 'questwalk',
    icon: (kit) => { const w = shown(); return w ? kit.mapIcon('arrow', `${w.saved ? 'Your walk' : 'Walk preview'} · ${w.rt.stops.length} stops · ${w.rt.km} km`, () => dialog(), COLOR, true) : null; },
    lines: () => { const w = shown(); return w ? [{ id: w.saved ? w.campaign.id : `preview-${preview.seq}`, color: COLOR, fit: true, points: [{ id: 'walk-start', lat: w.rt.start.lat, lon: w.rt.start.lon }, ...w.rt.stops.map((p, i) => ({ id: p.id, lat: p.lat, lon: p.lon, label: i + 1 })), { id: 'walk-end', lat: w.rt.end.lat, lon: w.rt.end.lon }] }] : []; },
    pins: () => {
      const w = shown(); if (!w) return [];
      const on = new Set((ui().state()?.atlas?.places || []).map((p) => p.id));
      const out = [{ id: 'walk-start', name: W.metroWords(w.rt.start), lat: w.rt.start.lat, lon: w.rt.start.lon, kind: 'travel', color: COLOR }];
      if (w.rt.end.kind !== 'show') out.push({ id: 'walk-end', name: W.metroWords(w.rt.end), lat: w.rt.end.lat, lon: w.rt.end.lon, kind: 'travel', color: COLOR });
      for (const p of w.rt.stops) if (!on.has(p.id)) out.push({ id: p.id, ref: 'walk-stop', name: p.name, lat: p.lat, lon: p.lon, kind: P.byId(p.id)?.kind || 'reset', color: COLOR });
      return out;
    },
    owns: (id) => String(id).startsWith('walk-') || Boolean(shown()?.rt.stops.some((p) => p.id === id) && !ui().state()?.atlas?.places.some((x) => x.id === id)), // the Métro ends, and stops not on your map
    select: () => dialog(),
  };
  const redraw = () => { try { J()?.addMapLayer?.(layer); } catch { /* the map isn't open */ } };

  // ---------- saving: an ordinary campaign, followed by the ✦ tracker ----------
  async function save(rt = preview?.rt) {
    if (!rt) throw Error('Make a walk first: /quest walk');
    const c = await J().mutate((s) => W.save(s, rt, { ensurePin: P.ensurePin }), 'Walk saved: one step per stop. The ✦ tracker follows it.');
    preview = null; redraw();
    return c;
  }
  const _test = { open: null }; // (checks) record the link instead of opening the browser (window.hub is frozen)
  const open = (rt) => { const url = (rt.links || W.links(rt)).google; return _test.open ? _test.open(url) : window.hub.openExternal(url); };

  // ---------- the dialog (from the guide's "Make a walk", the map's walk icon, a Métro pin) ----------
  function dialog() {
    const w = shown(); if (!w) return;
    const { E, button, label, p, dialog: dlg, questDetail } = ui();
    dlg(w.saved ? w.campaign.title : 'A walk for this afternoon', (body, d) => {
      const rt = w.rt;
      body.append(label(w.saved ? `${rt.stops.length} STOPS · ${rt.km} KM · ABOUT ${W.fmt(rt.total).toUpperCase()}` : W.summary(rt).toUpperCase()));
      const list = E('ol', { class: 'qw-stops' });
      const all = w.saved ? [`Start: ${W.metroWords(rt.start)}`, ...rt.stops.map((x, i) => `${i + 1}. ${x.name}`), `End: ${W.metroWords(rt.end)}`] : W.lines(rt);
      for (const line of all) list.append(E('li', { text: line }));
      body.append(list);
      if (!w.saved && rt.short) body.append(p(`Only ${rt.stops.length} stops fit here in ${W.fmt(rt.budget)}. 3 h gives the walk more room.`, 'qj-paris-best'));
      if (!w.saved && leave(rt)) body.append(p(leave(rt).trim(), 'qj-paris-best'));
      body.append(p('Straight-line distances × 1.3 for the streets; check opening times before you go.', 'qj-paris-best'));
      const row = E('div', { class: 'qj-actions qw-actions' });
      row.append(button('Open walking route', () => open(rt), 'qj-primary'));
      if (w.saved) row.append(button('Open the next stop', () => { d.close(); const q = C.next(ui().state(), w.campaign) || w.campaign.quests[0]; questDetail(q.id); }, 'qj-quiet'));
      else {
        row.append(button('Save as a walk quest', async () => { await save(rt); d.close(); }, 'qj-quiet'));
        row.append(button(rt.budget >= 180 ? '2 h instead' : '3 h instead', async () => { d.close(); await remake({ ...preview.opts, budget: rt.budget >= 180 ? 120 : 180 }); dialog(); }, 'qj-quiet'));
        row.append(button('Another area', async () => { d.close(); variant++; await remake(preview.opts); dialog(); }, 'qj-quiet'));
      }
      row.append(button('See it on the map', () => d.close(), 'qj-quiet'));
      body.append(row);
    }, 'SIDEQUEST STUDIO / PARIS WALK');
  }
  // the guide dialog's one button (quest-paris-ui.js guideDialog): makes the default walk and shows it
  function guideButton(guide) {
    const b = ui().button('Make a walk', async () => { guide?.close(); await remake({ budget: 120, filter: '', from: null, show: null }); if (preview) dialog(); }, 'qj-quiet qw-make');
    b.dataset.help = '3–5 places you haven’t visited, in walking order, Métro to Métro · /quest walk';
    return b;
  }
  // (round 64, clickfirst64) one click from the ✦ tracker's "Make a walk" or the Studio's "My week ▾": the default walk
  // (2 h, from where you are) and its dialog, exactly like the guide's button (no typing)
  async function start() { await QuestParisUI.journal(); variant = 0; await remake({ budget: 120, filter: '', from: null, show: null }); if (preview) dialog(); return preview?.rt || null; }
  // (round 64, mapfirst64) the map's own "Plan a walk" button: the same default walk
  const plan = start;
  async function remake(opts) {
    const rt = make(ui().state(), opts);
    if (rt.error) { ui().notice(rt.error); throw Error(rt.error); }
    await show(rt, opts);
    return rt;
  }
  // the map page with the walk on it (the map frames the new line once, then it's yours to pan)
  // (mapFilter re-centres on the selected pin; the new walk is set after it, so the next draw frames the walk)
  async function show(rt, opts) { J().paris.mapFilter({}); preview = { rt, opts, seq: ++seq }; redraw(); }

  // ---------- chat: /quest walk … (through the tracker's one /quest) ----------
  const HELP = 'Quest walks: /quest walk [area or tag: 11e, records, park, view…] [from <place>] [2h|3h] [show|noshow] — 3–5 places you haven’t visited, Métro to Métro (or to tonight’s show). Then: /quest walk save · /quest walk open · /quest walk another.';
  async function run(args, ctx) {
    const opts = W.parse(args), say = (t, actions) => (ctx?.note ? ctx.note(t, { actions, id: 'questwalk' }) : ctx?.say ? ctx.say(t) : toast(t));
    if (opts.sub === 'help') return HELP;
    await QuestParisUI.journal();
    if (opts.sub === 'open') { const w = shown(); if (!w) return 'No walk yet: /quest walk makes one.'; open(w.rt); return 'Opening the walking route in your browser.'; }
    if (opts.sub === 'save') { if (!preview) await remake(opts); const c = await save(); return `Saved “${c.title}”: ${c.quests.length} steps, one per stop. The ✦ tracker follows it; each stop finishes with proof + review in the Studio.`; }
    if (opts.sub === 'show-map') { J().paris.mapFilter({}); redraw(); return shown() ? 'Your walk is on the Paris map.' : 'No walk yet: /quest walk makes one.'; }
    if (opts.sub === 'another') variant++; else variant = 0;
    const base = opts.sub === 'another' && preview ? preview.opts : opts;
    const rt = make(ui().state(), base);
    if (rt.error) return rt.error;
    await show(rt, base);
    say(text(rt), [{ label: 'Open walking route', run: () => open(rt) }, { label: 'Save as a walk quest', run: () => save(rt).then((c) => ctx?.say?.(`Saved “${c.title}”. The ✦ tracker follows it.`)) }, { label: rt.budget >= 180 ? '2 h instead' : '3 h instead', run: () => run(`${base.filter} ${base.from ? 'from ' + base.from : ''} ${rt.budget >= 180 ? '2h' : '3h'}`, ctx) }, { label: 'Another area', run: () => run('another', ctx) }]);
  }
  function complete(rest) {
    const t = W.fold(rest), words = t.split(/\s+/);
    if (words[0] === 'from') { const q = words.slice(1).join(' '); return P.guide.filter((g) => !q || W.fold(g.name).includes(q)).slice(0, 20).map((g) => ({ value: 'walk from ' + g.id.replace(/^(pp|place)-/, '').replace(/-/g, ' '), label: g.name })); }
    const pool = [['2h', 'two hours (the default)'], ['3h', 'three hours'], ['from', 'start at a place'], ['show', 'end at tonight’s show'], ['save', 'save the last walk as a quest'], ['open', 'open the walking route'], ['another', 'another area'], ...Object.entries(P.TAGS).map(([k, v]) => [k, v])];
    return pool.filter(([v]) => v.startsWith(words.at(-1) || '')).map(([v, hint]) => ({ value: `walk ${words.length > 1 ? words.slice(0, -1).join(' ') + ' ' : ''}${v}`, hint }));
  }

  // ---------- the week plan (weekquest62): one walk on a free afternoon ----------
  function weekCandidate(S, week, list = [], weather = null) {
    try {
      const planned = (S.weekly?.plans || []).find((p) => p.week === week.week)?.items || [];
      const busy = [...list.filter((x) => x.fixed || x.kind === 'show').map((x) => x.day), ...planned.map((x) => x.day)].filter(Boolean);
      const pool = W.poolFrom({ C, s: S, guide: P.guide, matches: P.matches, stepMinutes: placeMinutes(S) });
      return W.weekCandidate({ pool, stations: stations(), week, busy, weather, at: home(S, pool), budget: 120 });
    } catch (err) { console.warn('[questwalk] week', err); return null; }
  }

  redraw();
  return { run, complete, dialog, guideButton, start, plan, save, weekCandidate, layer, _test, get preview() { return preview?.rt || null; }, shown };
})();
