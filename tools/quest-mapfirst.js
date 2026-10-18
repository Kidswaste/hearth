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
  const KEY = 'questmap.layers', SEEDED = 'questmap.foodSeeded', SHOW_RETRY = 6 * 3600e3;
  const P = () => window.QuestParis, J = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null);
  const LAYERS = [
    { id: 'places', name: 'Food & stops', icon: 'food', color: '#ffb759', help: 'Food, record shops and a few outdoor stops; your saved places stay' },
    { id: 'shows', name: 'Nights', icon: 'music', color: '#ff6b9d', help: 'Your clubs; zoom in for more Shotgun/DICE venues. Click a club for its nights' },
    { id: 'walks', name: 'My walks', icon: 'arrow', color: '#ffd75e', help: 'Your walk on the map' },
    { id: 'visited', name: 'Visited', icon: 'check', color: '#f6ca71', help: 'Places you stamped as visited (✓) and My Paris: what you actually did' }
  ];
  // map layers (QuestJournal.addMapLayer) per chip. parisjournal64's My Paris layer IS the Visited chip: its own chip(kit)
  // isn't added to the filter row (ownsChip), and Visited reads / sets My Paris's own on / off, so the two never disagree
  // (parisdedupe64) Codex's Outing desk venue pins (tools/outing-desk.js, layer 'outing-desk') ride the Shows chip: one row, four chips
  const LAYER_OF = { showsync: 'shows', 'outing-desk': 'shows', questwalk: 'walks', parisjournal: 'visited' };
  const PJ = () => (typeof window.ParisJournal !== 'undefined' && window.ParisJournal?.toggle ? window.ParisJournal : null);
  const read = (k, d) => { try { return store.get(k, d); } catch { return d; } };
  const write = (k, v) => { try { store.set(k, v); } catch { /* a convenience: the default (all on) still works */ } };
  let prefs = { places: true, shows: true, walks: true, visited: true, ...(read(KEY, {}) || {}) };
  let showsTriedAt = 0, fetching = false, seeding = false, merging = false;
  const on = (id) => (id === 'visited' && PJ() ? PJ().prefs.on !== false : prefs[id] !== false);
  const ownsChip = (layerId) => layerId === 'parisjournal'; // (quest-journal.js's chip row skips it: it's Visited here)
  const self = { id: 'mapfirst64' }; // a layer with nothing to draw: re-adding it re-renders the open map
  const rerender = () => { try { if (J()?.page === 'world') J().addMapLayer(self); } catch { /* the map isn't open */ } };
  const stateOf = () => { try { return J()?.paris?.ui().state() || null; } catch { return null; } };

  // ---------- which pins ----------
  // a guide place you haven't touched yet (no visit, no star, no quest): drawn light, hidden when Places is off
  // (round 65, questperf65) the journal's quest references (campaign ids, their places, walk stops), once per journal version:
  // untouched() runs for every place on every map render (keep + tone), it scanned every campaign each time
  const refsSeen = new WeakMap();
  function refsOf(s) { const v = `${s.updatedAt}|${s.campaigns.length}`, m = refsSeen.get(s); if (m?.v === v) return m; const r = { v, cids: new Set(), places: new Set() };
    for (const c of s.campaigns) { r.cids.add(c.id); if (c.parisPlace) r.places.add(c.parisPlace); if (c.mapPlace) r.places.add(c.mapPlace); for (const x of c.walk?.stops || []) r.places.add(typeof x === 'string' ? x : x?.id); }
    refsSeen.set(s, r); return r; }
  let guideIds = null;
  function untouched(s, p) {
    const G = P(); if (!G || !s || !String(p.id).startsWith('pp-') || !(guideIds ||= new Set(G.guide.map((g) => g.id))).has(p.id)) return false;
    if (p.visitedAt || p.favorite) return false;
    const g=G.byId(p.id);if(p.name!==g.name || p.lat!==g.lat || p.lon!==g.lon || p.kind!==g.kind || p.quest!==g.why.slice(0,500))return false;
    const r = refsOf(s); return !r.cids.has(G.campaignId(p.id)) && !r.places.has(p.id);
  }
  // mapPlaces() filter (quest-journal.js): the selected pin always stays
  function keep(p, s = stateOf(), filters={}) {
    if (!s || p.id === s.atlas?.selected) return true;
    if (untouched(s,p) && (!on('places') || (!prefs.fullGuide && !filters.guide && !filters.query && !P().mapPicks.has(p.id)))) return false;
    if (!on('visited') && p.visitedAt) return false;
    return true;
  }
  const tone = (p, s = stateOf()) => (untouched(s, p) ? 'qj-pin-guide' : ''); // an extra pin class (quest-atlas.js)
  const off = (layerId) => (LAYER_OF[layerId] ? !on(LAYER_OF[layerId]) : false); // a map layer's pins / lines skipped

  // ---------- when the map opens (quest-journal.js worldMap, first line) ----------
  function open() {
    const j = J(), s = stateOf(); if (!j?.ready?.() || !s) return;
    // (parisdedupe64) a journal with a guide pin AND your own pin of the same real place: merged once (yours stays, keeps
    // visits / stars / quests from both; QuestParis.dedupe). Checked on each open; a no-op when there's nothing to merge.
    if (!merging && P()?.needsDedupe?.(s)) { merging = true; setTimeout(() => { j.paris.mutate((st) => P().dedupe(st), 'One pin per place: your pins now carry the guide’s notes.').catch((err) => console.warn('[mapfirst] dedupe', err)).finally(() => { merging = false; }); }, 0); }
    // the guide's places, once per profile (the same rule as /quest paris: missing guide pins only, yours untouched)
    if (on('places') && !seeding && !read(SEEDED, false) && P()) {
      seeding = true;
      setTimeout(() => { addGuide('Food stops ready. Click a pin to explore.').then(()=>write(SEEDED,true)).catch(err=>console.warn('[mapfirst] food stops',err.message)).finally(() => { seeding = false; }); }, 0);
    }
    if (on('shows')) shows();
  }
  function addGuide(message) {
    return J().paris.mutate((st) => P().addGuide(st,P().guide.filter(g=>prefs.fullGuide || P().mapPicks.has(g.id))), message);
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
    if(ShowSync.week().length)return {text:'Some listings unavailable',title:snap.status || 'Last good nights are kept. Open the shows list for source details.'};
    const names = [...new Set(bad.map((x) => ShowSyncCore.PLATFORMS[x.platform]?.name || x.platform))].join('/');
    const last = Math.max(0, ...bad.map((x) => x.lastOk || 0)); // the failing pages' own last good list
    return { text: `Couldn’t load ${names} — ${last ? 'last list from ' + day(last) : 'no list yet'}`, title: snap.status || '' };
  }

  // ---------- the strip on the map ----------
  function count(id, s) {
    if (id === 'places') return 0;
    if (id === 'shows') return 0;
    if (id === 'walks') return window.QuestWalk?.shown?.() ? 1 : 0;
    return (PJ() ? PJ().moments().length : 0) || s.atlas.places.filter((p) => p.visitedAt).length; // My Paris's moments when it's in, else your visit stamps
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
  async function explore(full=true){prefs={...prefs,fullGuide:full,places:true};write(KEY,prefs);if(full)await addGuide('Full guide shown. Switch back to My spots for a quieter map.');rerender();}
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
    const more=button('',()=>explore(!prefs.fullGuide),'qj-hardware qmf-chip');more.title=prefs.fullGuide?'Return to food stops and your saved places':'Show the full Paris guide';more.setAttribute('aria-label',more.title);more.append(QuestAtlas.icon('compass'),E('span',{text:prefs.fullGuide?'My spots':'More places'}));bar.append(more,plan);
    host.append(bar);
    const st = showStatus();
    if (st) {
      const line = button('', async () => { if (st.busy) return; showsTriedAt = 0; fetching = true; rerender(); try { await ShowSync.refresh(true); } finally { fetching = false; rerender(); } }, 'qmf-status' + (st.busy ? ' busy' : ''));
      line.append(E('span', { text: st.text }), ...(st.busy ? [] : [E('b', { text: 'Retry' })])); if (st.title) line.title = st.title;
      host.append(line);
    }
  }
  return { open, keep, tone, off, ownsChip, overlay, on, toggle, planWalk, explore, showStatus, LAYERS, get prefs() { return { ...prefs }; } };
})();
