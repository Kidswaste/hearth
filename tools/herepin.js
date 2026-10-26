// (round 66, herepin66) "📍 I'm here" on Sidequest Studio's Paris map. One clearly labelled button on the map (top
// right): click it, then click the spot where you are right now. No GPS, no network: the spot is where you clicked, kept
// in this computer's localStorage only (store key herepin.pin, tools/herepin-core.js) and forgotten after 3 hours (the
// pin gets lighter each hour, then it's gone). Then a small "Close to you" panel on the map lists the nearest place
// quests, tonight's shows and park-jam spots, by walking minutes ("about 6 min walk": straight line at ~4.5 km/h), each
// with "Start this quest" and "Show on map". The ✦ quest tracker shows a "📍 Near me" row while a pin is set (questhud.js).
// It plugs into the map as a layer (QuestJournal.addMapLayer: its pin, its select, below() → the button + panel inside
// the map) and reads the map's click point through the one hook tools/quest-atlas.js gives its host (host.qjHere).
// Writes only through the journal's own mutate (QuestJournal.paris) or ShowSync.makeQuest, like the map's own buttons.
// No timers, no polling: everything is worked out when the map draws. Lazy group 'questjournal'.
const HerePin = window.HerePin = (() => {
  const K = HerePinCore;
  const J = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null);
  const P = () => window.QuestParis;
  const SS = () => (typeof ShowSync !== 'undefined' ? ShowSync : null);
  let picking = false, panelOpen = true, look = null, down = null, swallowUntil = 0;

  // ---------- the pin (this computer only) ----------
  function read(now = Date.now()) {
    const raw = store.get(K.KEY, null);
    const p = K.fresh(raw, now);
    if (raw && !p) store.set(K.KEY, null); // faded (or not a pin): forgotten
    return p;
  }
  function set(lat, lon) {
    const p = K.make(lat, lon); store.set(K.KEY, p);
    picking = false; panelOpen = true; look = null; unlisten();
    redraw(); hud();
    toast('📍 Got it. Close to you is on the map. The pin stays on this computer and fades in 3 hours.', { timeout: 4500 });
    return p;
  }
  function clear() { store.set(K.KEY, null); look = null; picking = false; unlisten(); redraw(); hud(); }
  const hud = () => { try { if (window.Lazy?.isIn('questhud') && QuestHud.isOpen()) QuestHud.repaint(); } catch { /* no tracker */ } };
  const redraw = () => { try { if (J()?.page === 'world') J().addMapLayer(layer); } catch { /* the map isn't open */ } };

  // ---------- what's close ----------
  function venueSpots() {
    const m = new Map(); const S = SS(); if (!S || typeof ShowSyncCore === 'undefined') return m;
    try { for (const p of S.layer.pins({})) if (Number.isFinite(p.lat)) m.set(ShowSyncCore.venueKey(p.name), p); } catch { /* no venues yet */ }
    return m;
  }
  function items(pin = read()) {
    if (!pin) return [];
    const venues = venueSpots();
    let errands = []; try { if (window.ErrandsCore) errands = ErrandsCore.list(J()?.paris?.ui().state(), { now: new Date() }); } catch { /* no journal yet */ } // (round 67, errands67) your errands, with their hours badge
    const list = K.candidates({ guide: P()?.guide || [], shows: SS()?.upcoming() || [], errands, venueAt: (s) => (typeof ShowSyncCore !== 'undefined' ? venues.get(ShowSyncCore.venueKey(s.venue?.name || '')) : null) || null });
    return K.rank(pin, list);
  }
  const count = () => items().length;
  const timeOf = (t) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  function sub(it) {
    if (it.kind === 'show') return `${timeOf(it.start)}${it.venue ? ` · ${it.venue}` : ''}`;
    if (it.kind === 'errand') return it.venue; // (round 67, errands67) its badge has its own line
    const G = P(), arr = G && it.arr ? G.arrLabel(it.arr) : '', tag = it.tags.find((t) => t !== 'jam' && t !== 'free');
    return [arr, it.kind === 'jam' ? 'make music outside' : G?.TAGS[tag] || ''].filter(Boolean).join(' · ');
  }
  // the quest each row starts, and whether it's started already
  function questState(it) {
    if (it.kind === 'errand') return it.badge?.text || null; // (round 67, errands67) the badge (it changes with the time): the dock's signature sees it
    const s = J()?.paris?.ui().state(); if (!s) return null;
    const id = it.kind === 'show' ? `c-show-${it.ref.key}` : it.kind === 'jam' ? 'c-pq-park' : P().campaignId(it.id);
    const c = s.campaigns.find((x) => x.id === id); if (!c) return null;
    return QuestCore.campaignDone(s, c) ? 'done' : (it.kind !== 'jam' || c.parisPlace === it.id) ? 'started' : null; // the park quest pinned elsewhere: start it here
  }
  async function start(it) {
    const j = J(); if (!j?.paris?.ready()) throw Error('Your quest journal is still opening. Try again in a moment.');
    const { questDetail } = j.paris.ui();
    let c;
    if (it.kind === 'show') c = await SS().makeQuest(it.ref);
    else if (it.kind === 'jam') c = await j.paris.mutate((st) => P().startPersonal(st, 'park', { park: it.id }), `Park session at ${it.name}: go, make two minutes of music, bring it home.`);
    else c = await j.paris.mutate((st) => P().startPlace(st, it.id), 'Quest started: go → do → proof. The ✦ tracker follows it.');
    const s = j.paris.ui().state(), q = QuestCore.next(s, s.campaigns.find((x) => x.id === c.id) || c) || c.quests[0];
    questDetail(q.id);
  }
  function showOnMap(it) {
    const j = J(), s = j?.paris?.ui().state();
    const pin = s && it.kind !== 'show' ? P().pinOf(s, it.id) : null;
    if (pin) { look = null; j.paris.ui().mapPick(pin.id, true).catch(() => {}); return; } // one of the map's own pins: select it (its panel opens beside the map)
    look = { id: it.id, name: it.name, lat: it.lat, lon: it.lon, kind: it.kind }; // otherwise a marked spot, centred
    mapHost()?.qjHere?.go(look, 16); redraw();
  }

  // ---------- picking a spot ----------
  const mapHost = () => document.querySelector('.qj .qj-world-layout .qj-atlas') || document.querySelector('.qj-atlas');
  const OURS = '.qj-atlas-controls,.hp-dock,.qmf-strip,.qmf-status,.qj-atlas-credit,a';
  function onDown(e) { if (picking && e.target.closest?.('.qj-atlas')) down = { x: e.clientX, y: e.clientY }; }
  function onClick(e) {
    const host = e.target.closest?.('.qj-atlas');
    if (!picking || !host || e.target.closest(OURS)) return;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; // that was a drag (panning the map)
    e.preventDefault(); e.stopPropagation(); // a pin under the click doesn't open: the spot is the point
    const at = host.qjHere?.at(e.clientX, e.clientY);
    if (!at) { toast('This map can’t take a pin. Update Hearth and try again.', { type: 'error' }); return; }
    swallowUntil = Date.now() + 700; // the second click of a double-click doesn't add a place
    try { set(at.lat, at.lon); } catch (err) { toast(err.message, { type: 'error' }); }
  }
  function onDbl(e) { if (Date.now() < swallowUntil && e.target.closest?.('.qj-atlas')) { e.preventDefault(); e.stopPropagation(); } }
  function onKey(e) { if (picking && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } }
  let listening = false;
  function listen() { if (listening) return; listening = true; document.addEventListener('pointerdown', onDown, true); document.addEventListener('click', onClick, true); document.addEventListener('dblclick', onDbl, true); document.addEventListener('keydown', onKey, true); }
  function unlisten() { if (!listening) return; listening = false; document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); setTimeout(() => { if (!listening) document.removeEventListener('dblclick', onDbl, true); }, 800); }
  function startPick() { picking = true; look = null; listen(); redraw(); }
  function stopPick() { picking = false; unlisten(); redraw(); }
  function useCentre() {
    const host = mapHost(); if (!host?.qjHere) throw Error('Open the Paris map first.');
    const r = host.getBoundingClientRect(), at = host.qjHere.at(r.left + r.width / 2, r.top + r.height / 2);
    set(at.lat, at.lon);
  }
  // Opens Sidequest Studio's map (from the ✦ tracker or chat) and waits for it
  async function toMap() {
    await QuestParisUI.journal();
    if (J().page !== 'world') J().navigate('world');
    for (let i = 0; i < 60 && !mapHost(); i++) await new Promise((r) => setTimeout(r, 50));
  }
  async function pick() { await toMap(); startPick(); }
  async function open() { await toMap(); if (!read()) { startPick(); return; } panelOpen = true; redraw(); }

  // ---------- on the map: the button, the hint while picking, the panel ----------
  const b = (text, run, cls = '', title = '') => el('button', { type: 'button', class: `qj-button ${cls}`, text, title: title || null, on: { click: (e) => { e.stopPropagation(); Promise.resolve().then(run).catch((err) => toast(calmError(err), { type: 'error' })); } } });
  // The dock is kept across the map's re-renders and rebuilt only when what it shows changed (a re-render between a
  // press and its release must not swap the button under the pointer; and no needless DOM work)
  let lastSig = '';
  function dock() {
    const host = mapHost(); if (!host) return;
    host.classList.toggle('hp-picking', picking);
    const pin = read(), s = J()?.paris?.ui().state(), old = host.querySelector(':scope>.hp-dock');
    const sig = JSON.stringify([picking, panelOpen, pin?.at, pin && K.ageText(pin), pin && K.leftText(pin), look?.id, pin ? items(pin).map((it) => [it.id, it.min, s && questState(it)]) : 0]);
    if (old && sig === lastSig) return;
    lastSig = sig; old?.remove();
    const d = el('div', { class: 'hp-dock' });
    const main = b(picking ? 'Cancel' : '📍 I’m here', () => (picking ? stopPick() : startPick()), `qj-hardware hp-btn${picking ? ' on' : ''}`,
      picking ? 'Stop picking a spot (Esc)' : pin ? 'Move your pin: click, then click where you are now' : 'Say where you are: click, then click your spot on the map. No GPS, nothing sent; it stays on this computer for 3 hours.');
    main.setAttribute('aria-pressed', String(picking));
    d.append(main);
    if (picking) {
      d.append(el('div', { class: 'hp-hint', attrs: { role: 'status' } }, el('span', { text: 'Click the map where you are now' }), b('Use the map’s centre', useCentre, 'qj-quiet hp-centre')));
    } else if (pin && !panelOpen) {
      d.append(b(`Close to you · ${items(pin).length}`, () => { panelOpen = true; redraw(); }, 'qj-hardware hp-reopen', 'Show what’s close to your pin'));
    } else if (pin) d.append(panel(pin));
    host.append(d);
  }
  function panel(pin) {
    const list = items(pin), s = J()?.paris?.ui().state();
    const sec = el('section', { class: 'hp-near', attrs: { role: 'region', 'aria-label': 'Close to you' } },
      el('header', {}, el('strong', { text: 'Close to you' }), el('span', { class: 'hp-age', text: `pin set ${K.ageText(pin)} · ${K.leftText(pin)}` }),
        b('×', () => { panelOpen = false; look = null; redraw(); }, 'hp-x', 'Hide this list (the pin stays)')));
    const ol = el('ol', { class: 'hp-list' });
    for (const it of list) {
      if (it.kind === 'errand') { ol.append(errandRow(it)); continue; } // (round 67, errands67)
      const st = s ? questState(it) : null;
      const label = st === 'done' ? 'Done ✓' : st === 'started' ? 'Continue quest' : 'Start this quest';
      const startBtn = b(label, () => start(it), `qj-primary hp-start${st ? ' started' : ''}`, st === 'done' ? 'You finished this one' : '');
      if (st === 'done') startBtn.disabled = true;
      ol.append(el('li', { class: `hp-item${look?.id === it.id ? ' looking' : ''}`, dataset: { kind: it.kind, id: it.id } },
        el('div', { class: 'hp-top' }, el('span', { class: 'hp-kind', text: K.KINDS[it.kind] }), el('span', { class: 'hp-walk', text: it.walk })),
        el('strong', { class: 'hp-name', text: it.name }),
        sub(it) ? el('span', { class: 'hp-sub', text: sub(it) }) : null,
        el('div', { class: 'hp-acts' }, startBtn, b('Show on map', () => showOnMap(it), 'qj-quiet hp-show'))));
    }
    if (!list.length) ol.append(el('li', { class: 'hp-empty', text: `Nothing within ${K.MAX_MIN} minutes on foot. Move your pin, or try another part of Paris.` }));
    sec.append(ol, el('footer', {}, b('Move my pin', startPick, 'qj-quiet hp-move'), b('Clear pin', clear, 'qj-quiet hp-clear', 'Forget where you are now (it fades by itself after 3 hours)')));
    return sec;
  }

  // (round 67, errands67) an errand close to you: its opening-hours badge, Done ✓ (completes it) and Show on map
  function errandRow(it) {
    const tone = window.ErrandsCore ? ErrandsCore.tone(it.badge?.state) : '';
    return el('li', { class: `hp-item${look?.id === it.id ? ' looking' : ''}`, dataset: { kind: it.kind, id: it.id } },
      el('div', { class: 'hp-top' }, el('span', { class: 'hp-kind', text: K.KINDS.errand }), el('span', { class: 'hp-walk', text: it.walk })),
      el('strong', { class: 'hp-name', text: it.name }),
      el('span', { class: 'hp-sub', text: it.venue }),
      it.badge ? el('span', { class: `er-badge er-mini ${tone}`, text: it.badge.text }) : null,
      el('div', { class: 'hp-acts' }, b('Done ✓', () => window.Errands.done(it.ref.id), 'qj-primary hp-start hp-errand-done', 'I have it: complete this errand as a quest'), b('Show on map', () => showOnMap(it), 'qj-quiet hp-show')));
  }

  // ---------- the map layer ----------
  const layer = {
    id: 'herepin',
    pins: () => {
      const pin = read(), out = [];
      if (pin) out.push({ id: 'herepin-me', name: `You are here (pin set ${K.ageText(pin)})`, lat: pin.lat, lon: pin.lon, kind: 'target', color: '#5fd4ff', tone: `hp-me-${K.age(pin)}`, quest: '', visitedAt: null, minZoom: 11 });
      if (look) out.push({ id: 'herepin-look', name: look.name, lat: look.lat, lon: look.lon, kind: look.kind === 'show' ? 'music' : 'star', color: '#ffd75e', tone: 'hp-look', quest: '', visitedAt: null, minZoom: 11 });
      return out;
    },
    owns: (id) => id === 'herepin-me' || id === 'herepin-look',
    select: (id) => { panelOpen = true; if (id === 'herepin-me') look = null; redraw(); },
    below: () => { dock(); return null; }, // the map is mounted by now: the button and the panel go inside it
  };
  try { J()?.addMapLayer(layer); } catch { /* the journal registers layers when it loads */ }

  // ---------- chat (secondary: everything above is clickable) — /quest here [pick | clear] ----------
  async function run(rest = '', ctx) {
    const w = String(rest || '').trim().toLowerCase();
    if (/^(clear|off|forget)$/.test(w)) { clear(); return 'Pin cleared. Nothing about where you are is kept.'; }
    if (/^(pick|set|move)$/.test(w) || !read()) { await pick(); return 'The Paris map is open: click the map where you are now (or Use the map’s centre).'; }
    await open();
    const list = items();
    return list.length ? `Close to you:\n${list.map((it, i) => `${i + 1}. ${it.name} — ${it.walk} (${K.KINDS[it.kind].toLowerCase()})`).join('\n')}` : `Nothing within ${K.MAX_MIN} minutes on foot of your pin.`;
  }

  return { open, pick, set, clear, read, items, count, run, layer, get picking() { return picking; } };
})();
