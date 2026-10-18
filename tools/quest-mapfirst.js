// (round 64, mapfirst64) The Paris map shows what rounds 61–63 added, by default, with no command. The owner: "I really
// don't use commands at all, also it feels like the map features haven't updated at all." Before this, the guide's
// places needed /quest paris (or the footer's Paris guide button), the shows needed /shows (or the ✦ list's "Load"),
// and walks needed /quest walk (or a button inside the guide dialog), so the map looked the same as before.
// Now, when Sidequest Studio's map opens:
//   · the Paris guide's places are on it (added once to the journal, as /quest paris does; your own pins untouched),
//     drawn lighter than your own pins and shrunk to dots at the city zoom, so they don't crowd it;
//   · this week's shows (venue logos) come in: the once-a-day Shotgun / DICE read starts when the map opens, and one
//     small line on the map says so when it fails ("Couldn't load Shotgun/DICE — last list from …");
//   · places you stamped as visited wear a ✓.
// One strip on the map itself (the map's own button chrome, one row): Places · Shows · My walks · Visited (layer
// toggles, remembered on this computer) and "Plan a walk". A guide place's panel shows its quest with "Start this
// quest" (tools/quest-paris-ui.js); a show pin opens its venue with the next show's "Make it a quest" / "Get ready"
// (showsync.js). Hooks in Codex's quest-journal.js / quest-atlas.js are optional one-liners: without this file the
// map is exactly as before. No timers, no polling; the only network is showsync's own once-a-day read.
const QuestMapFirst = window.QuestMapFirst = (() => {
  const KEY = 'questmap.layers', SEEDED = 'questmap.guideSeeded', SHOW_RETRY = 6 * 3600e3;
  const P = () => window.QuestParis, J = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null);
  const LAYERS = [
    { id: 'places', name: 'Places', icon: 'compass', color: '#bd8bff', help: 'The Paris guide’s places worth the trip' },
    { id: 'shows', name: 'Shows', icon: 'spark', color: '#ff6b9d', help: 'This week’s shows from Shotgun and DICE' },
    { id: 'walks', name: 'My walks', icon: 'arrow', color: '#ffd75e', help: 'Your walk on the map' },
    { id: 'visited', name: 'Visited', icon: 'check', color: '#f6ca71', help: 'Places you stamped as visited (✓) and My Paris: what you actually did' }
  ];
  // map layers (QuestJournal.addMapLayer) per chip. parisjournal64's My Paris layer IS the Visited chip: its own chip(kit)
  // isn't added to the filter row (ownsChip), and Visited reads / sets My Paris's own on / off, so the two never disagree
  const LAYER_OF = { showsync: 'shows', questwalk: 'walks', parisjournal: 'visited' };
  const PJ = () => (typeof window.ParisJournal !== 'undefined' && window.ParisJournal?.toggle ? window.ParisJournal : null);
  const read = (k, d) => { try { return store.get(k, d); } catch { return d; } };
  const write = (k, v) => { try { store.set(k, v); } catch { /* a convenience: the default (all on) still works */ } };
  let prefs = { places: true, shows: true, walks: true, visited: true, ...(read(KEY, {}) || {}) };
  let showsTriedAt = 0, fetching = false, seeding = false;
  const on = (id) => (id === 'visited' && PJ() ? PJ().prefs.on !== false : prefs[id] !== false);
  const ownsChip = (layerId) => layerId === 'parisjournal'; // (quest-journal.js's chip row skips it: it's Visited here)
  const self = { id: 'mapfirst64' }; // a layer with nothing to draw: re-adding it re-renders the open map
  const rerender = () => { try { if (J()?.page === 'world') J().addMapLayer(self); } catch { /* the map isn't open */ } };
  const stateOf = () => { try { return J()?.paris?.ui().state() || null; } catch { return null; } };

  // ---------- which pins ----------
  // a guide place you haven't touched yet (no visit, no star, no quest): drawn light, hidden when Places is off
  function untouched(s, p) {
    const G = P(); if (!G || !s || !String(p.id).startsWith('pp-') || !G.guide.some((g) => g.id === p.id)) return false;
    if (p.visitedAt || p.favorite) return false;
    return !s.campaigns.some((c) => c.id === G.campaignId(p.id) || c.parisPlace === p.id || c.mapPlace === p.id);
  }
  // mapPlaces() filter (quest-journal.js): the selected pin always stays
  function keep(p, s = stateOf()) {
    if (!s || p.id === s.atlas?.selected) return true;
    if (!on('places') && untouched(s, p)) return false;
    if (!on('visited') && p.visitedAt) return false;
    return true;
  }
  const tone = (p, s = stateOf()) => (untouched(s, p) ? 'qj-pin-guide' : ''); // an extra pin class (quest-atlas.js)
  const off = (layerId) => (LAYER_OF[layerId] ? !on(LAYER_OF[layerId]) : false); // a map layer's pins / lines skipped

  // ---------- when the map opens (quest-journal.js worldMap, first line) ----------
  function open() {
    const j = J(), s = stateOf(); if (!j?.ready?.() || !s) return;
    // the guide's places, once per profile (the same rule as /quest paris: missing guide pins only, yours untouched)
    if (on('places') && !seeding && !read(SEEDED, false) && P() && !P().hasGuide(s)) {
      seeding = true; write(SEEDED, true);
      setTimeout(() => { addGuide('The Paris guide’s places are on your map. Pick one for its quest.').finally(() => { seeding = false; }); }, 0);
    } else if (!read(SEEDED, false) && P()?.hasGuide(s)) write(SEEDED, true);
    if (on('shows')) shows();
  }
  function addGuide(message) {
    return J().paris.mutate((st) => P().addGuide(st), message).catch((err) => console.warn('[mapfirst] guide', err));
  }
  // this week's shows: showsync's own once-a-day read (the main process skips pages read in the last 20 h)
  function shows() {
    if (typeof ShowSync === 'undefined' || fetching || Date.now() - showsTriedAt < SHOW_RETRY) return;
    showsTriedAt = Date.now();
    (ShowSync.snap ? ShowSync.load() : ShowSync.ensure()).then((snap) => { // load(): a fresh look at the saved list (no network), so 'stale' is today's answer
      if (!snap || snap.busy || (snap.enabled && !snap.stale)) return;
      fetching = true; rerender();
      return ShowSync.refresh().catch((err) => console.warn('[mapfirst] shows', err.message)).finally(() => { fetching = false; rerender(); });
    }).catch(() => { /* no hub (outside the app) */ });
  }
  const day = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  // one plain line when the read failed: "Couldn't load Shotgun/DICE — last list from Tue 14 Oct"
  function showStatus() {
    if (!on('shows') || typeof ShowSync === 'undefined') return null;
    if (fetching) return { text: 'Loading this week’s shows…', busy: true };
    const snap = ShowSync.snap, srcs = snap?.sources || [];
    const bad = srcs.filter((x) => x.problem && x.problem !== 'empty'); if (!bad.length) return null;
    const names = [...new Set(bad.map((x) => ShowSyncCore.PLATFORMS[x.platform]?.name || x.platform))].join('/');
    const last = Math.max(0, ...bad.map((x) => x.lastOk || 0)); // the failing pages' own last good list
    return { text: `Couldn’t load ${names} — ${last ? 'last list from ' + day(last) : 'no list yet'}`, title: snap.status || '' };
  }

  // ---------- the strip on the map ----------
  function count(id, s) {
    if (id === 'places') return P() ? s.atlas.places.filter((p) => P().guide.some((g) => g.id === p.id)).length : 0;
    if (id === 'shows') return typeof ShowSync !== 'undefined' && ShowSync.snap ? ShowSync.week().length : 0;
    if (id === 'walks') return window.QuestWalk?.shown?.() ? 1 : 0;
    return PJ() ? PJ().moments().length : s.atlas.places.filter((p) => p.visitedAt).length; // My Paris's moments when it's in
  }
  async function toggle(id) {
    const next = !on(id); prefs = { ...prefs, [id]: next }; write(KEY, prefs);
    if (id === 'visited' && PJ()) { PJ().toggle(next); return; } // My Paris redraws the map itself
    const s = stateOf();
    if (id === 'places' && on('places') && s && P() && !P().hasGuide(s)) { await addGuide('The Paris guide’s places are back on your map.'); return; }
    if (id === 'shows' && on('shows')) { showsTriedAt = 0; shows(); }
    rerender();
  }
  async function planWalk() {
    if (!window.QuestWalk?.plan) throw Error('Walks are still loading. Try again in a moment.');
    if (!on('walks')) { prefs = { ...prefs, walks: true }; write(KEY, prefs); }
    await QuestWalk.plan();
  }
  // (quest-journal.js worldMap, after QuestAtlas.mount) host = the map's element; kit = the journal's layer kit
  function overlay(host, kit) {
    const s = stateOf(); if (!s || !host) return;
    const { E, button } = kit;
    const bar = E('div', { class: 'qmf-strip', attrs: { role: 'toolbar', 'aria-label': 'Map layers' } });
    for (const L of LAYERS) {
      const n = count(L.id, s), b = button('', () => toggle(L.id), 'qj-hardware qmf-chip');
      b.dataset.layer = L.id; if (L.id === 'visited') b.dataset.chip = 'visited'; /* (parisjournal64's chip: My Paris) */ b.style.setProperty('--chip', L.color); b.setAttribute('aria-pressed', String(on(L.id)));
      b.setAttribute('aria-label', `${L.name}${n ? ` (${n})` : ''}: ${on(L.id) ? 'shown' : 'hidden'}`); b.title = `${L.help} · click to ${on(L.id) ? 'hide' : 'show'}`;
      b.append(QuestAtlas.icon(L.icon), E('span', { text: L.name }), ...(n ? [E('i', { class: 'qmf-n', text: String(n) })] : []));
      bar.append(b);
    }
    const plan = button('', planWalk, 'qj-hardware qmf-plan');
    plan.setAttribute('aria-label', 'Plan a walk'); plan.title = '3–5 places you haven’t visited, in walking order, Métro to Métro';
    plan.append(QuestAtlas.icon('arrow'), E('span', { text: 'Plan a walk' }));
    bar.append(plan);
    host.append(bar);
    const st = showStatus();
    if (st) {
      const line = button('', async () => { if (st.busy) return; showsTriedAt = 0; fetching = true; rerender(); try { await ShowSync.refresh(true); } finally { fetching = false; rerender(); } }, 'qmf-status' + (st.busy ? ' busy' : ''));
      line.append(E('span', { text: st.text }), ...(st.busy ? [] : [E('b', { text: 'Retry' })])); if (st.title) line.title = st.title;
      host.append(line);
    }
  }
  return { open, keep, tone, off, ownsChip, overlay, on, toggle, planWalk, showStatus, LAYERS, get prefs() { return { ...prefs }; } };
})();
