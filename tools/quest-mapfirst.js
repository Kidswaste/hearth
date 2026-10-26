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
  const LAYER_OF = { showsync: 'shows', 'outing-desk': 'shows', questwalk: 'walks', parisjournal: 'visited', errands: 'errands' }; // (round 67, errands67) errands: its own row in Layers
  const PJ = () => (typeof window.ParisJournal !== 'undefined' && window.ParisJournal?.toggle ? window.ParisJournal : null);
  const read = (k, d) => { try { return store.get(k, d); } catch { return d; } };
  const write = (k, v) => { try { store.set(k, v); } catch { /* a convenience: the default (all on) still works */ } };
  // (round 66, mapbuttons66) every layer id defaults ON: a profile that saved older settings (round 64 saved only these four)
  // gets each newer layer shown, and only a layer the owner switched off (a stored false) stays off
  const DEFAULTS = { places: true, shows: true, walks: true, visited: true, jams: true, quests: true, errands: true }; // (round 67, errands67) + errands
  let prefs = { ...DEFAULTS, ...(read(KEY, {}) || {}) };
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
    bar.prepend(layersButton(kit)); // (round 66, mapbuttons66) "Layers": every layer by name, a switch each
    const more=button('',()=>explore(!prefs.fullGuide),'qj-hardware qmf-chip');more.title=prefs.fullGuide?'Return to food stops and your saved places':'Show the full Paris guide';more.setAttribute('aria-label',more.title);more.append(QuestAtlas.icon('compass'),E('span',{text:prefs.fullGuide?'My spots':'More places'}));bar.append(more,plan);
    if (window.Errands?.chip) bar.append(Errands.chip(kit)); // (round 67, errands67) ＋ Errand: what you need, a shop or a spot, its opening hours (tools/errands.js)
    host.append(bar);
    const st = showStatus();
    if (st) {
      const line = button('', async () => { if (st.busy) return; showsTriedAt = 0; fetching = true; rerender(); try { await ShowSync.refresh(true); } finally { fetching = false; rerender(); } }, 'qmf-status' + (st.busy ? ' busy' : ''));
      line.append(E('span', { text: st.text }), ...(st.busy ? [] : [E('b', { text: 'Retry' })])); if (st.title) line.title = st.title;
      host.append(line);
    }
    host.querySelectorAll(':scope>.qml-panel').forEach((n) => n.remove()); if (panelOpen) host.append(layersPanel(kit));
    watchControls(host);
  }

  // ---------- (round 66, mapbuttons66) the rest of the guide: Park jams + Paris place quests, as map layers ----------
  // Codex's quiet map (paris-familiar-venues) keeps only Food & stops (QuestParis.mapPicks) as journal pins; the other
  // guide places were filtered out of sight, so the owner's map looked like it "hadn't updated". They come back as LAYER
  // pins (not journal places: the journal doesn't grow): Park jams (the parks tagged for an outdoor session) at every
  // zoom, the other place quests from zoom QUEST_ZOOM up, so the city zoom stays as quiet as Codex made it. Clicking one
  // pins it in the journal (QuestParis.ensurePin, as Start this quest does) and opens its panel with its quest.
  const QUEST_ZOOM = 14;
  function guidePins(f = {}) {
    const G = P(), s = stateOf(); if (!G || !s || f.saved) return [];
    const jams = on('jams'), quests = on('quests'); if (!jams && !quests) return [];
    const q = String(f.query || '').toLocaleLowerCase(), out = [];
    for (const g of G.guide) {
      if (G.mapPicks.has(g.id)) continue; // Food & stops: the journal's own pins (Codex)
      const jam = g.tags.includes('jam'); if (jam ? !jams : !quests) continue;
      const pin = G.pinOf(s, g.id); if (pin && (prefs.fullGuide || !untouched(s, pin) || pin.id === s.atlas.selected)) continue; // the journal draws it
      if (f.kind && f.kind !== 'all' && g.kind !== f.kind) continue;
      if (f.guide && !G.matches(g, f.guide)) continue;
      if (q && !(g.name + ' ' + G.words(g)).toLocaleLowerCase().includes(q)) continue;
      out.push({ id: 'ml-' + g.id, name: g.name, lat: g.lat, lon: g.lon, kind: g.kind, color: jam ? '#7ee0a1' : '#bd8bff', tone: 'qj-pin-guide' /* drawn like the guide's other untouched places (lighter; dots at the city zoom); data-place "ml-…" */, ...(jam ? {} : { minZoom: QUEST_ZOOM }) });
    }
    return out;
  }
  const guideLayer = { id: 'mapfirst-guide', pins: guidePins, owns: (id) => String(id).startsWith('ml-'),
    async select(id) { const gid = String(id).slice(3); await J().paris.mutate((s) => { s.atlas.selected = P().ensurePin(s, gid).id; }, ''); } };
  try { J()?.addMapLayer?.(guideLayer); } catch { /* the journal registers layers when it loads */ }
  const guideCount = (id) => { const G = P(); return G ? G.guide.filter((g) => !G.mapPicks.has(g.id) && (id === 'jams') === g.tags.includes('jam')).length : 0; };

  // ---------- (round 66, mapbuttons66) the Layers button and its panel: every layer by name, one switch each ----------
  let panelOpen = false, panelAbort = null;
  const ROWS = [
    { id: 'places', name: 'Food & stops', help: 'Food, record shops and a few outdoor stops' },
    { id: 'shows', name: 'Nights & shows', help: 'Your clubs and this week’s Shotgun / DICE shows' },
    { id: 'jams', name: 'Park jams', help: 'Parks for an outdoor music session', count: () => guideCount('jams') },
    { id: 'quests', name: 'Paris place quests', help: 'Guide places with a quest; zoom in to see them', count: () => guideCount('quests') },
    { id: 'errands', name: 'Errands', help: 'Your errands, with an open now / closes at badge', count: () => (window.Errands ? Errands.list().length : 0) }, // (round 67, errands67)
    { id: 'walks', name: 'My walks', help: 'The walk you planned, as a line' },
    { id: 'visited', name: 'Visited · My Paris', help: 'Your ✓ visits and what you did' },
    { id: 'full', name: 'Whole guide when zoomed out', help: 'Every guide place even at the city zoom (busier)' }
  ];
  const layersIcon = () => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), p = document.createElementNS(svg.namespaceURI, 'path');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.classList.add('qj-map-icon');
    for (const [k, v] of Object.entries({ d: 'm12 3 9 5-9 5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) p.setAttribute(k, v);
    svg.append(p); return svg; };
  function layersButton(kit) {
    const b = kit.button('', () => setPanel(!panelOpen), 'qj-hardware qml-open');
    b.setAttribute('aria-expanded', String(panelOpen)); b.setAttribute('aria-label', 'Layers: show or hide each kind of pin'); b.title = 'Show or hide each map layer';
    const offN = ROWS.filter((r) => r.id !== 'full' && !on(r.id)).length;
    b.append(layersIcon(), kit.E('span', { text: 'Layers' }), ...(offN ? [kit.E('i', { class: 'qml-off', text: `${offN} off` })] : []));
    return b;
  }
  function setPanel(open) { panelOpen = !!open; if (!panelOpen) { panelAbort?.abort(); panelAbort = null; } rerender(); }
  function layersPanel(kit) {
    const { E } = kit, box = E('div', { class: 'qml-panel', attrs: { role: 'group', 'aria-label': 'Map layers' } });
    // (round 67, errands67) a real mouse press on a switch's label reached the map's drag (quest-atlas.js captures the
    // pointer for anything but a button or a link), so the click went to the map and the switch never moved; and a wheel
    // over the list zoomed the map. Presses and wheels inside the panel stay in the panel.
    for (const ev of ['pointerdown', 'wheel']) box.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    box.append(E('strong', { class: 'qml-title', text: 'Map layers' }));
    for (const r of ROWS) {
      const n = r.count?.() || 0, input = E('input', { type: 'checkbox' }); input.checked = r.id === 'full' ? !!prefs.fullGuide : on(r.id); input.dataset.layer = r.id;
      input.addEventListener('change', () => { Promise.resolve(r.id === 'full' ? explore(input.checked) : on(r.id) !== input.checked && toggle(r.id)).catch((err) => kit.notice?.(typeof calmError === 'function' ? calmError(err) : err.message)); });
      box.append(E('label', { class: 'qml-row', attrs: { title: r.help } }, input, E('span', { class: 'qml-name', text: r.name + (n ? ` (${n})` : '') }), E('small', { text: r.help })));
    }
    box.append(kit.button('Done', () => setPanel(false), 'qj-quiet qml-done'));
    // closes with Done, Esc or a click outside it (listeners only while it's open; no timers)
    panelAbort?.abort(); panelAbort = new AbortController(); const signal = panelAbort.signal;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.isConnected) { e.stopPropagation(); setPanel(false); } }, { capture: true, signal });
    document.addEventListener('pointerdown', (e) => { if (!box.isConnected) { panelAbort?.abort(); return; } if (!box.contains(e.target) && !e.target.closest?.('.qml-open')) setPanel(false); }, { capture: true, signal });
    return box;
  }

  // ---------- (round 66, mapbuttons66) the map's + / − stay clear of whatever bar is over the page ----------
  // Sidequest Studio's tab bar (.qj-command-nav: Today · Map · Progress, its sub-row and the map filters) is sticky, and a
  // project / workspace tab strip can be too: scrolled, they sat over the map's top-left corner where + / − / Paris live.
  // On a scroll / resize (events only: nothing runs while the map is hidden or still) the corner is hit-tested where the
  // controls belong; when something outside the map is there, the controls (and the shows' status line) slide down to
  // just under that bar's real bottom. They stay inside the map, above its bottom strip.
  let ctlHost = null, ctlAbort = null, ctlRaf = 0;
  function coverBottom(n) { for (let x = n, i = 0; x && x !== document.body && i < 16; x = x.parentElement, i++) { const pos = getComputedStyle(x).position; if (pos === 'sticky' || pos === 'fixed') return x.getBoundingClientRect().bottom; } return n.getBoundingClientRect().bottom; }
  function clearControls() {
    ctlRaf = 0; const host = ctlHost; if (!host?.isConnected) { ctlAbort?.abort(); ctlAbort = null; ctlHost = null; return; }
    const ctr = host.querySelector(':scope>.qj-atlas-controls'); if (!ctr) return;
    const r = host.getBoundingClientRect(); if (!r.height) return; // the page is hidden
    const h = ctr.offsetHeight || 32, x = r.left + 26, natural = r.top + 10; let top = natural;
    for (let i = 0; i < 5; i++) { const y = top + h / 2; if (y < 0) { top = 0; continue; } if (y >= innerHeight) break; const hit = document.elementFromPoint(x, y); if (!hit || host.contains(hit)) break; top = Math.max(top + 1, coverBottom(hit) + 6); }
    const off = Math.round(Math.max(0, Math.min(top - natural, r.height - h - 58))), t = off ? `translateY(${off}px)` : '';
    for (const n of [ctr, host.querySelector(':scope>.qmf-status')]) if (n && n.style.transform !== t) n.style.transform = t;
    if ((host.dataset.clear || '0') !== String(off)) host.dataset.clear = off; // (for checks: how far the controls moved)
  }
  const scheduleClear = (e) => { if (e?.type === 'scroll' && ctlHost && e.target !== document && !e.target.contains?.(ctlHost)) return; if (!ctlRaf) ctlRaf = requestAnimationFrame(clearControls); };
  function watchControls(host) {
    ctlHost = host;
    if (!ctlAbort) { ctlAbort = new AbortController(); document.addEventListener('scroll', scheduleClear, { capture: true, passive: true, signal: ctlAbort.signal }); window.addEventListener('resize', scheduleClear, { passive: true, signal: ctlAbort.signal }); }
    scheduleClear();
  }
  // ---------- (round 68, dialogperf68) a Studio dialog skips the rest of the app's style (quest-mapfirst.css) ----------
  // quest-journal.js dialog() asks modalSkip() before it sets html.qj-modal-up. It answers yes once this group's CSS is
  // on (the rail's contain-intrinsic-size reads 'auto …') and one more frame has been drawn, so the rail / bars / header
  // have a remembered size to keep: a dialog opened in the very first frame after the Studio loads just skips less.
  let skipReady = 0, skipTries = 0;
  const armSkip = () => requestAnimationFrame(() => {
    if (skipReady === 1) { skipReady = 2; return; }
    const rail = document.getElementById('rail');
    if (rail && String(getComputedStyle(rail).containIntrinsicSize).startsWith('auto')) skipReady = 1;
    if (skipReady < 2 && ++skipTries < 30) armSkip();
  });
  armSkip();
  const modalSkip = () => skipReady === 2;
  return { open, keep, tone, off, ownsChip, overlay, on, toggle, planWalk, explore, showStatus, LAYERS, ROWS, QUEST_ZOOM, guidePins, setPanel, clearControls, modalSkip, get panelOpen() { return panelOpen; }, get prefs() { return { ...prefs }; } };
})();
