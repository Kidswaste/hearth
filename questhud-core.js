// (round 61, questhud61) The quest tracker's thinking, with no DOM: which quest the HUD follows, its steps and progress,
// the other active quests, names typed after /quest track, and how far a quest's map pin is. Everything here READS
// Codex's quest journal through Codex's own QuestCore (passed in as C): no second store, no copied rules. Writes
// happen in questhud.js, through QuestJournal.mutate when the Studio holds the journal, else by the Studio's own steps
// (validate → change → validate → save). Node-testable: dev/questhud-test.js.
(function (root, make) { if (typeof module === 'object') module.exports = make(); else root.QuestHudCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const open = (C, s, q) => q && !C.done(s, q.id) && !C.skipped(s, q.id);
  const campaignOf = (s, q) => (q?.campaign ? s.campaigns.find((c) => c.id === q.campaign) || null : null);
  // A side quest the owner can work on now (not parked, not finished or set aside)
  const sideOpen = (C, s) => s.sideQuests.filter((q) => !q.parked && open(C, s, q)).map((q) => C.find(s, q.id)).filter(Boolean);
  // The tracked campaign's next quest (the Studio's "main quest")
  function main(C, s) {
    const c = s.campaigns.find((x) => x.id === s.active && !x.paused);
    return c ? C.next(s, c) : null;
  }
  // (round 62, weekquest62) Today's planned quest (s.weekly, weekquest-core.js): a campaign item follows its next step,
  // a quest item is that quest; only one still open and available counts. Read-only, no WeekQuestCore needed.
  function planned(C, s, date = C.day()) {
    for (const p of s.weekly?.plans || []) for (const it of p.items || []) {
      if (it.day !== date) continue;
      const c = it.campaign ? s.campaigns.find((x) => x.id === it.campaign) : null;
      const q = it.campaign ? (c && !c.paused ? C.next(s, c) : null) : C.find(s, it.quest);
      if (open(C, s, q) && C.available(s, q.id)) return q;
    }
    return null;
  }
  // The quest the chip follows: the one pinned from the tracker (if still open), else the main quest, else the quest
  // with a starting note (Studio's bookmark), else the first open side quest. null: nothing active.
  function current(C, s, pin = null) {
    if (!s) return null;
    if (pin) { const q = C.find(s, pin); if (open(C, s, q) && (q.campaign ? C.available(s, q.id) : !q.parked)) return q; }
    const t = planned(C, s); if (t) return t; // (round 62, weekquest62) today's quest from the week plan
    const m = main(C, s); if (m) return m;
    if (s.plan?.quest) { const q = C.find(s, s.plan.quest); if (open(C, s, q) && C.available(s, q.id)) return q; }
    return sideOpen(C, s)[0] || null;
  }
  // Two steps per quest, the Studio's own: the first move (a small start, +5 XP once) and the finish line. With the
  // studio rules on (s.studio), the finish line needs proof + a review that confirms it: `proof` says so.
  function steps(C, s, q) {
    const r = C.record(s, q.id);
    return [
      { id: 'start', label: 'First move', text: s.tiny[q.id] || q.tiny, done: Boolean(r.startedAt || r.completedAt) },
      { id: 'finish', label: 'Finish line', text: q.done, done: Boolean(r.completedAt), proof: Boolean(s.studio) && !C.canFinish(s, q.id) },
    ];
  }
  const nextStep = (C, s, q) => steps(C, s, q).find((x) => !x.done) || null;
  // Progress: a campaign counts its quests (half a quest for a first move made); a side quest its two steps
  function progress(C, s, q) {
    const st = steps(C, s, q), c = campaignOf(s, q);
    if (!c) { const n = st.filter((x) => x.done).length; return { done: n, total: 2, frac: n / 2, text: `${n}/2`, of: 'steps' }; }
    const i = c.quests.findIndex((x) => x.id === q.id), finished = c.quests.filter((x) => C.done(s, x.id)).length;
    const frac = Math.min(1, (finished + (st[0].done && !st[1].done ? 0.5 : 0)) / c.quests.length);
    return { done: finished, total: c.quests.length, frac, text: `${Math.max(1, i + 1)}/${c.quests.length}`, of: 'quests' };
  }
  const pathOf = (C, id) => C.paths.find((p) => p.id === id) || C.paths[0];
  // Everything the chip and the panel show for one quest
  function card(C, s, q) {
    if (!q) return null;
    const c = campaignOf(s, q), st = steps(C, s, q), nx = st.find((x) => !x.done) || null, path = pathOf(C, q.path);
    const note = s.plan?.quest === q.id ? s.plan.action : '';
    const focus = s.focus?.quest === q.id && s.focus.end > 0 ? s.focus.end : 0;
    const today = planned(C, s)?.id === q.id; // (weekquest62) on today's week plan
    return { today, id: q.id, title: q.title, campaign: c ? c.title : '', campaignId: c ? c.id : null, side: !c, path: q.path, icon: path.icon, color: path.color,
      steps: st, next: nx, note, focus, minutes: q.minutes, xp: q.xp, progress: progress(C, s, q), place: placeOf(s, q) };
  }
  // The other quests in play: the main quest, the open side quests, the bookmarked one (no duplicates, the followed first)
  function actives(C, s, pin = null) {
    if (!s) return [];
    const out = [], seen = new Set();
    const add = (q) => { if (q && !seen.has(q.id) && open(C, s, q)) { seen.add(q.id); out.push(q); } };
    add(current(C, s, pin)); add(main(C, s));
    if (s.plan?.quest) { const q = C.find(s, s.plan.quest); if (q && C.available(s, q.id)) add(q); }
    sideOpen(C, s).forEach(add);
    return out.slice(0, 5);
  }
  // A one-line digest the chip can compare before it writes the page (nothing repaints when nothing changed)
  function sig(cd, extra = '') {
    if (!cd) return `none|${extra}`;
    return [cd.id, cd.today ? 'today' : '', cd.title, cd.next?.id, cd.next?.text, cd.progress.text, cd.progress.frac, cd.note, cd.focus, cd.icon, extra].join('|');
  }

  // ---------- /quest track <name> ----------
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  // What a name can mean: a campaign (tracked as the main quest, like the Studio's "Track") or an open side quest
  function trackables(C, s) {
    if (!s) return [];
    const camps = s.campaigns.filter((c) => !C.campaignDone(s, c)).map((c) => ({ kind: 'campaign', id: c.id, title: c.title, also: c.badge || '', path: c.path, paused: Boolean(c.paused) }));
    const sides = s.sideQuests.filter((q) => open(C, s, q)).map((q) => ({ kind: 'side', id: q.id, title: q.title, also: '', path: q.path, paused: Boolean(q.parked) }));
    return [...sides, ...camps];
  }
  function match(C, s, name) {
    const n = norm(name); if (!n) return null;
    let best = null, score = 0;
    for (const t of trackables(C, s)) {
      const a = norm(t.title), b = norm(t.also);
      const sc = a === n ? 4 : a.startsWith(n) ? 3 : a.includes(n) ? 2 : b.includes(n) ? 1 : 0;
      if (sc > score) { score = sc; best = t; }
    }
    return best;
  }

  // ---------- near you (map pins; only with the owner's opt-in, in questhud.js) ----------
  // The Paris map place a quest belongs to: a field quest (c.mapPlace), an outing made from a pin (campaign
  // c-world-outing-<place>), a Paris guide / personal quest (c.parisPlace, parisquests61), or q.place / c.place
  function placeOf(s, q) {
    const places = s?.atlas?.places || []; if (!q || !places.length) return null;
    const c = campaignOf(s, q);
    const id = q.place || c?.mapPlace || c?.parisPlace || c?.place || (c?.id.match(/^c-world-outing-(.+)$/) || [])[1] || null; // parisPlace: parisquests61's place / personal quests
    return (id && places.find((p) => p.id === id)) || null;
  }
  function km(a, b) {
    const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const say = (k) => (k < 1 ? `${Math.max(10, Math.round(k * 100) * 10)} m` : `${k < 10 ? k.toFixed(1) : Math.round(k)} km`);
  const walk = (k) => Math.max(1, Math.round(k / 4.8 * 60)); // minutes on foot
  // Map pins nearest first (within maxKm), each with the quest it carries
  function near(s, here, maxKm = 3, limit = 4) {
    if (!here || !Number.isFinite(here.lat) || !Number.isFinite(here.lon)) return [];
    return (s?.atlas?.places || []).map((p) => ({ id: p.id, name: p.name, quest: p.quest, kind: p.kind || null, km: km(here, p) }))
      .filter((p) => p.km <= maxKm).sort((a, b) => a.km - b.km).slice(0, limit);
  }

  // ---------- chat words ----------
  const SUBS = ['next', 'done', 'track', 'picks', 'near', 'open', 'studio', 'hud', 'week', 'review', 'walk', 'here']; // week / review: weekquest62's week plan and week in review; walk: questwalk63's afternoon walks; here: herepin66's I'm here pin
  // parisquests61's /quest words (tools/quest-paris-ui.js: QuestParisUI.run): one /quest command, these pass through
  const PARIS = ['paris', 'map', 'places', 'guide', 'go', 'start', 'place', 'add', 'park', 'list', 'progress', 'help'];
  function parse(args) {
    const t = String(args || '').trim(), m = t.match(/^(\S+)\s*([\s\S]*)$/);
    if (!m) return { sub: '', rest: '' };
    const w = m[1].toLowerCase();
    if (SUBS.includes(w)) return { sub: w, rest: m[2].trim() };
    if (['check', 'tick', 'finish'].includes(w)) return { sub: 'done', rest: m[2].trim() };
    if (['show', 'tracker', 'panel'].includes(w)) return { sub: 'open', rest: m[2].trim() };
    if (PARIS.includes(w)) return { sub: 'paris', rest: t };
    return { sub: 'name', rest: t }; // "/quest canal": track an open quest by that name, else a Paris place / personal quest
  }

  return { PARIS, planned, current, main, steps, nextStep, progress, card, actives, sig, trackables, match, placeOf, km, say, walk, near, parse, SUBS, norm };
});
