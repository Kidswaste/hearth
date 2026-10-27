// (round 68, leavesoon68) "⏰ Remind me to leave", the window's side (lazy group 'leavesoon': loaded with the Paris map's
// code and when the ✦ quest tracker opens). By clicking only:
//   · a "⏰ Remind me to leave" toggle on everything with a time and a place: a show's card and its show quest, an
//     errand's card (beat its closing time) and its quest, and each slot of 🗓 Plan my weekend
//   · Hearth works out the travel time from your 📍 I'm here pin when one is set, else from your 🏠 Home (clicked once on
//     the Paris map, kept on this computer only): walking up to 20 min, else a Métro estimate, always "about"
//     (leavesoon-core.js), and rings 10 min before it's time to leave: "Leave in 10 min for X — about 25 min by Métro"
//     (leavesoonmain.js keeps the time; notify.js shows Windows' / the Mac's own notification: Show on map · Snooze 10
//     min · Dismiss). It rings with Hearth in the tray; one missed while Hearth was closed is shown once, never late.
//   · the ✦ tracker lists them ("⏰ Leave at 20:15") with Snooze / Dismiss / turn off; the map shows a ⏰ pin per
//     reminder and your 🏠 Home (Layers › Leave reminders, on by default)
// No GPS, nothing sent, no AI, no polling (one timer, main side). Home: localStorage 'leavesoon.home' only.
// (round 69, ratp69) honest about the Métro (ratp-core.js, same lazy group): after the last trains (about 00:40, Fri / Sat
// nights about 01:40) and before about 05:30 a trip says "walk (Métro closed)" or "Noctilien / taxi — check" and the
// leave time moves with it; a Métro trip knows its route's lines, and its line status is checked ~30 min before it rings
// (main side, one fetch) and when you open the ✦ tracker: "⚠ Line 9: disrupted — leave 10 min earlier?" with a one-click
// Leave earlier, or "Line status unknown" (offline / no key: Settings › Housekeeping › Paris Métro status key…).
const LeaveSoon = window.LeaveSoon = (() => {
  const K = LeaveSoonCore;
  const HOME = 'leavesoon.home';
  const api = () => window.hub?.leave || null;
  let items = new Map(); // key → reminder (as the main side keeps it)
  let loaded = false, picking = null, look = null;

  // ---------- where you leave from: the 📍 pin (fresh), else 🏠 Home ----------
  function home() { try { const h = store.get(HOME, null); return h && K.inParis(h) ? h : null; } catch { return null; } }
  function origin() {
    const pin = window.HerePinCore ? HerePinCore.fresh(store.get(HerePinCore.KEY, null)) : null;
    if (pin) return { lat: pin.lat, lon: pin.lon, from: 'your 📍 pin', sig: `pin:${pin.at}` };
    const h = home();
    return h ? { lat: h.lat, lon: h.lon, from: 'Home', sig: `home:${h.at}` } : null;
  }

  // ---------- the reminders (kept by the main side) ----------
  async function refresh() {
    if (!api()) return items;
    const r = await api().op({ op: 'list' });
    if (r?.ok) { items = new Map(r.value.items.map((it) => [it.key, it])); loaded = true; }
    await recompute();
    paint();
    return items;
  }
  const get = (key) => items.get(key) || null;
  const isOn = (key) => { const it = get(key); return !!it && it.state !== 'dismissed' && it.targetAt > K.now() && it.state !== 'missed'; };
  async function call(op, a = {}) {
    const r = await api()?.op({ op, ...a });
    if (!r) throw Error('Leave reminders need the Hearth app.');
    if (!r.ok) throw Error(r.error || 'That didn’t work.');
    return r.value;
  }

  // (round 69, ratp69) the trip, honest: a Métro trip gets its route's lines, and the night check for when you'd board
  function honest(travel, targetAt) {
    const R = window.RatpCore; if (!R) return travel;
    let t = travel;
    if (t.mode === 'metro') { const lines = R.routeLines(t.from, t.to, t.line); t = { ...t, lines, how: lines.length ? R.routeWords(t.from, t.to, lines) : t.how }; }
    return R.night(t, targetAt);
  }

  // ---------- one reminder from a show, an errand, a weekend slot ----------
  // spec: { key, kind, title, place: { name, lat, lon }, target(travelMin) → { at, words } | { error }, ref }
  async function build(spec) {
    if (typeof ShowPrepCore === 'undefined') await Lazy.load('questjournal').catch(() => {}); // the Métro stations' list
    const o = origin(); if (!o) return { needHome: true };
    if (!spec.place || !K.inParis(spec.place)) throw Error('This has no spot on the Paris map, so Hearth can’t tell how long it takes to get there.');
    const dest = spec.stop || spec.place; // (round 71, eatnearby71) "🍜 Go here first": the trip goes to the food stop, then on foot to the venue
    const t = spec.target(K.travel(o, dest).min + K.stopMin(spec.stop));
    if (t.error) throw Error(t.error);
    const travel = honest(K.travel(o, dest), t.at); // (round 69, ratp69) the Métro closes at night
    const item = { key: spec.key, kind: spec.kind, title: spec.title, place: { name: spec.place.name || '', lat: spec.place.lat, lon: spec.place.lon }, targetAt: t.at, words: t.words, travel, from: o.from, origin: o.sig, ref: spec.ref || {}, ...(spec.stop ? { stop: spec.stop } : {}) };
    return { item: { ...item, ...K.plan(item, K.now()) } };
  }
  async function turnOn(spec, beforeMap = () => {}) {
    let b = await build(spec);
    if (b.needHome) {
      beforeMap(); // a card in the way of the map steps aside
      toast('First, click your 🏠 Home on the Paris map. Leave reminders count the way from there (or from your 📍 I’m here pin when it’s set). It stays on this computer.', { timeout: 6000 });
      await pickHome(); // resolves once Home is clicked (rejects on Cancel)
      b = await build(spec);
      if (b.needHome) throw Error('No Home spot yet.');
    }
    const it = await call('put', { item: b.item });
    items.set(it.key, it); paint();
    toast(K.confirmText(it), { timeout: 5000 });
    return it;
  }
  async function turnOff(key) { await call('remove', { key }); items.delete(key); paint(); toast('⏰ Reminder off.', { timeout: 1800 }); }
  async function snooze(key) { const it = await call('snooze', { key }); items.set(key, it); paint(); toast(it.state === 'snoozed' ? `⏰ Snoozed: I’ll remind you again at ${K.hm(it.snoozeUntil)}.` : '⏰ That reminder is over: nothing to snooze.', { timeout: 2500 }); return it; } // (round 70, leavefix70) a dismissed / past one isn't brought back
  async function dismiss(key) { const it = await call('dismiss', { key }); items.set(key, it); paint(); return it; }
  // Home or the 📍 pin moved: the reminders still waiting are worked out again from there (rung / snoozed ones stay)
  let recomputing = false;
  async function recompute() {
    const o = origin(); if (!o || recomputing) return 0;
    const stale = [...items.values()].filter((it) => it.state === 'on' && it.origin !== o.sig && it.targetAt > K.now());
    if (!stale.length) return 0;
    recomputing = true; let n = 0;
    try {
      if (typeof ShowPrepCore === 'undefined') await Lazy.load('questjournal').catch(() => {});
      for (const it of stale) {
        try {
          const travel = honest(K.travel(o, it.stop || it.place), it.targetAt), next = { ...it, travel, from: o.from, origin: o.sig }; // (round 71, eatnearby71) via its food stop
          const r = await api().op({ op: 'put', item: { ...next, ...K.plan(next, K.now()) } });
          if (r?.ok) { items.set(it.key, r.value); n++; }
        } catch { /* too late from there now: it keeps its time */ }
      }
    } finally { recomputing = false; }
    return n;
  }

  // the specs
  function venueSpot(show) {
    const v = show?.venue || {};
    if (K.inParis(v)) return { name: v.name || show.title, lat: v.lat, lon: v.lon };
    try { // the map's venue pins (showsync), as 📍 I'm here does
      const key = ShowSyncCore.venueKey(v.name || ''); for (const p of ShowSync.layer.pins({})) if (K.inParis(p) && ShowSyncCore.venueKey(p.name) === key) return { name: v.name || p.name, lat: p.lat, lon: p.lon };
    } catch { /* no venues yet */ }
    return null;
  }
  const who = (show) => (show.lineup?.length ? show.lineup.slice(0, 2).join(' & ') : show.title);
  function showSpec(show) {
    return { key: `show:${show.key}`, kind: 'show', title: who(show), place: venueSpot(show), target: () => K.showTarget(show), ref: { show: show.key },
      can: !show.dateOnly && Number.isFinite(show.start) && !!venueSpot(show), why: show.dateOnly ? 'No start time yet' : 'No map spot for this venue' };
  }
  function errandSpec(e) {
    return { key: `errand:${e.id}`, kind: 'errand', title: e.what, place: e.place, target: (min) => K.errandTarget(e.week, K.now(), min), ref: { errand: e.id }, can: K.inParis(e.place) && K.errandTarget(e.week, K.now(), 0).at != null, why: K.errandTarget(e.week, K.now(), 0).error || '' };
  }
  function slotSpec(o, itemId) {
    return { key: `plan:${itemId}`, kind: 'plan', title: o.title, place: o.at ? { name: o.at.name || o.title, lat: o.at.lat, lon: o.at.lon } : null, target: () => K.slotTarget(o.day, o.time), ref: { plan: itemId, show: o.show?.key || null }, can: !!o.at && K.inParis(o.at), why: 'No map spot for this one' };
  }

  // ---------- the toggle (a show card, a show quest, an errand card / quest, a weekend slot) ----------
  const toggles = new Set(); // WeakRefs of the toggles on screen (they repaint when a reminder changes)
  function label(b) {
    const it = get(b.dataset.leaveKey), on = isOn(b.dataset.leaveKey);
    const text = on ? `⏰ Leave at ${K.when(it.leaveAt)} ✓` : '⏰ Remind me to leave';
    const title = on ? `Reminder on: ${K.confirmText(it).replace(/^⏰ /, '')}${it.travel.how ? ` ${it.travel.how}.` : ''}${it.status?.words ? ` ${it.status.words}.` : ''} Click to turn it off.` : b.dataset.why || 'Hearth works out the trip (from your 📍 pin, else your 🏠 Home) and tells you 10 minutes before it’s time to leave, even with Hearth in the tray.';
    if (b.textContent !== text) b.textContent = text;
    b.title = title; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on);
  }
  function toggle(spec, cls = '') {
    const b = el('button', { type: 'button', class: `ls-toggle ${cls}`, dataset: { leaveKey: spec.key }, on: { click: async (e) => {
      e.stopPropagation(); if (b.disabled) return;
      b.disabled = true;
      try { if (isOn(spec.key)) await turnOff(spec.key); else await turnOn(spec, () => b.closest('dialog')?.close?.()); } catch (err) { if (err?.message !== 'cancelled') toast(calmError(err), { type: 'error', timeout: 6000 }); } finally { b.disabled = !spec.can; if (b.isConnected) label(b); }
    } } });
    if (!spec.can) { b.disabled = true; b.dataset.why = `${spec.why}: no leave reminder.`; }
    label(b); toggles.add(new WeakRef(b));
    return b;
  }
  const showToggle = (show, cls) => toggle(showSpec(show), cls);
  const errandToggle = (id, cls) => { const e = window.ErrandsCore && window.Errands ? Errands.list().find((x) => x.id === id) : null; return e ? toggle(errandSpec(e), cls) : null; };
  const slotToggle = (o, itemId, cls) => (o?.day && o.time ? toggle(slotSpec(o, itemId), cls) : null);

  // ---------- paint what shows them ----------
  let painting = false;
  function paint() {
    if (painting) return; painting = true;
    requestAnimationFrame(() => {
      painting = false;
      for (const w of [...toggles]) { const b = w.deref(); if (!b || !b.isConnected) toggles.delete(w); else label(b); }
      try { if (window.QuestHud?.isOpen()) QuestHud.repaint(); } catch { /* no tracker */ }
      redraw();
    });
  }
  const J = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null);
  const redraw = () => { try { if (J()?.page === 'world') J().addMapLayer(layer); } catch { /* the map isn't open */ } };

  // ---------- the ✦ tracker rows ----------
  const sawMissed = new Set(), missedIn = new Map(); // a missed one shows in one opening of the tracker (all its repaints), then never again
  function hudRows(btn) {
    if (!loaded) return [];
    const rows = [], seen = [], panel = document.querySelector('.qh-panel');
    for (const it of [...items.values()].sort((a, b) => a.leaveAt - b.leaveAt)) {
      const h = K.hud(it); if (!h) continue;
      if (h.state === 'missed') {
        if (!(panel && missedIn.get(it.key) === panel) && (it.missedSeen || sawMissed.has(it.key))) continue;
        if (!missedIn.has(it.key)) { missedIn.set(it.key, panel); seen.push(it.key); }
      }
      const acts = [], st = it.status, bad = st && (st.state === 'disrupted' || st.state === 'blocked') && h.state !== 'missed';
      if (st?.state === 'unknown' && (st.why === 'nokey' || st.why === 'badkey') && h.state !== 'missed') acts.push(btn('Add key…', () => { QuestHud.close(); keyDialog().catch((err) => toast(calmError(err), { type: 'error' })); }, 'qh-take ls-addkey', 'Line status unknown: add your free PRIM key in Settings (IDFM’s open data; stored encrypted on this computer)'));
      if (bad && !it.earlierBy) acts.push(btn('Leave earlier', () => leaveEarlier(it.key), 'qh-take ls-earlier', `${st.title || st.words}. Moves the leave time ${st.earlier || 10} min earlier (the reminder rings 10 min before that).`)); // (round 69, ratp69)
      const ringing = h.state === 'fired' || h.state === 'now' || h.state === 'snoozed';
      if (ringing && it.kind === 'show') acts.push(btn('🎒 Before I go', () => { QuestHud.close(); before((B) => B.openFor(it.key)); }, 'qh-take bg-hud', 'Your show-night list: ticket, phone charged, earplugs, ID, card / cash')); // (round 70, leavefix70)
      if (ringing) acts.push(btn('Snooze 10 min', () => snooze(it.key), 'qh-take ls-snooze', 'Remind me again in 10 minutes'), btn('Dismiss', () => dismiss(it.key), 'qh-take ls-dismiss', 'I’m on my way (or not going): no more reminders for this'));
      else if (h.state === 'missed') acts.push(btn('OK', () => { missedIn.set(it.key, null); paint(); }, 'qh-take ls-ok', 'Got it'));
      else acts.push(btn('×', () => turnOff(it.key), 'qh-take ls-off', 'Turn this reminder off'));
      const row = el('div', { class: `qh-row ls-hud ls-${h.state}${ringing && it.kind === 'show' ? ' ls-showring' : ''}`, dataset: { leave: it.key } }, el('span', { class: 'qh-pi', text: '⏰' }),
        el('button', { type: 'button', class: 'qh-row-main', dataset: { k: `leave:${it.key}` }, title: `${h.title} Click to see it on the map.`, on: { click: (e) => { e.stopPropagation(); QuestHud.close(); showOnMap(it.key).catch((err) => toast(calmError(err), { type: 'error' })); } } },
          el('span', { class: 'qh-row-title', text: h.text.replace(/^⏰ /, '') }), el('span', { class: 'qh-sub', text: h.ring ? `${h.sub} · ${h.ring}` : h.sub }), h.state === 'missed' ? null : statusLine(it)),
        ...acts);
      rows.push(row);
      if (rows.length >= 4) break;
    }
    if (seen.length) { for (const k of seen) sawMissed.add(k); call('seen', { keys: seen }).catch(() => {}); } // a missed one is shown once
    statusSoon(); // (round 69, ratp69) you opened the tracker: the line status of trips coming up (cached main-side)
    return rows.length ? [el('div', { class: 'qh-sec', text: 'Leaving soon' }), ...rows] : [];
  }
  // ---------- (round 69, ratp69) the route's line status ----------
  let hasKey = null, statusAsked = 0;
  // "⚠ Line 9: disrupted — leave 10 min earlier?" · "Line 8: OK" · "Line status unknown" (no key: a click opens the key box)
  function statusLine(it) {
    const st = it.status;
    if (!st || it.travel?.mode !== 'metro') return it.travel?.night?.closed ? el('span', { class: 'ls-status ls-st-night', text: `Métro closed then (last ${it.travel.night.last})` }) : null;
    const words = st.state === 'unknown' ? 'Line status unknown' : it.earlierBy && st.state !== 'ok' ? `⚠ Line ${st.line}: ${st.state === 'blocked' ? 'interrupted' : 'disrupted'} — leaving ${it.earlierBy} min earlier` : st.words;
    const title = st.state === 'unknown' ? (window.RatpCore ? RatpCore.whyText(st.why) : '') : `${st.title || st.words}${st.at ? ` (checked at ${K.hm(st.at)})` : ''}`;
    return el('span', { class: `ls-status ls-st-${st.state}`, text: words, title });
  }
  // asked when you open the tracker or a reminder: only for Métro trips in the next 6 h whose status is old (main caches 10 min)
  function statusSoon(force = false) {
    const R = window.RatpCore; if (!R || !api()) return;
    const at = K.now(), stale = [...items.values()].some((it) => R.routed(it) && ['on', 'fired', 'snoozed'].includes(it.state) && it.leaveAt - at <= R.SOON && it.leaveAt > at - 15 * 60e3 && (!it.status || at - (it.status.at || 0) > R.FRESH));
    if (!stale || (!force && Date.now() - statusAsked < 60e3)) return;
    statusAsked = Date.now();
    call('status').then((r) => { hasKey = r.hasKey; }).catch(() => {});
  }
  async function leaveEarlier(key) {
    const it = await call('earlier', { key }); items.set(key, it); paint();
    toast(`⏰ Leave at ${K.hm(it.leaveAt)} now (${it.earlierBy} min earlier); I’ll remind you at ${K.hm(it.notifyAt)}.`, { timeout: 4000 });
    return it;
  }
  // Settings › Housekeeping › Paris Métro status key…: IDFM's free PRIM key, stored like Hearth's other keys (encrypted,
  // this computer only, never shown to a page or a chat, sent only to PRIM)
  async function keyDialog() {
    const keys = window.hub?.apps?.key; if (!keys) throw Error('This needs the Hearth app.');
    const info = (await keys('prim', 'has')) || {};
    toast('Line status for leave reminders: a free key from IDFM’s PRIM site (create an account, then My account › API key).', { timeout: 9000, action: { label: 'Open PRIM', fn: () => window.hub?.openExternal?.('https://prim.iledefrance-mobilites.fr/') } });
    const v = await Modal.form('Paris Métro status key (PRIM)', [
      { name: 'key', label: info.has ? 'A key is saved. Paste a new one to replace it:' : 'Your free PRIM API key (prim.iledefrance-mobilites.fr › My account › API key):', type: 'password', placeholder: info.has ? '•••••••• saved' : 'paste it here' },
      ...(info.has ? [{ name: 'forget', label: 'Forget the saved key', type: 'checkbox', value: false }] : []),
    ], { ok: 'Save' });
    if (!v) return false;
    if (v.forget) { await keys('prim', 'forget'); toast('Key forgotten. Line status uses the no-key source (it may be unknown).', { timeout: 3500 }); }
    else if (String(v.key || '').trim()) {
      const r = await keys('prim', 'set', String(v.key).trim());
      if (!r?.ok) throw Error(r?.error || 'That key wasn’t saved.');
      toast(r.stored === 'session' ? 'Key kept until Hearth quits (this computer can’t encrypt it).' : 'Key saved, encrypted on this computer. It goes only to PRIM, to ask for line status.', { timeout: 4000 });
    } else return false;
    await call('status', { fresh: true }).then((r) => { hasKey = r.hasKey; }).catch(() => {});
    return true;
  }

  /** at start (notify.js): the reminders missed while Hearth was closed, said once, never rung late */
  function sayMissed(list) {
    const fresh = (list || []).filter((it) => !sawMissed.has(it.key));
    if (!fresh.length) return;
    for (const it of fresh) sawMissed.add(it.key);
    const first = fresh[0];
    toast(fresh.length === 1 ? `⏰ Missed while Hearth was closed: leave at ${K.when(first.leaveAt)} for ${first.title}.` : `⏰ ${fresh.length} leave reminders were missed while Hearth was closed (the first: ${first.title}).`, { timeout: 9000, action: first.targetAt > K.now() ? { label: 'Show on map', fn: () => showOnMap(first.key).catch(() => {}) } : undefined });
    call('seen', { keys: fresh.map((it) => it.key) }).catch(() => {});
  }

  // ---------- on the Paris map: ⏰ pins, 🏠 Home, picking Home ----------
  const mapHost = () => document.querySelector('.qj .qj-world-layout .qj-atlas') || document.querySelector('.qj-atlas');
  async function toMap() {
    await Lazy.load('questjournal'); attach();
    await QuestParisUI.journal();
    if (J().page !== 'world') J().navigate('world');
    for (let i = 0; i < 60 && !mapHost(); i++) await new Promise((r) => setTimeout(r, 50));
    if (!mapHost()) throw Error('The Paris map didn’t open. Open Sidequest Studio › Map and try again.');
  }
  async function showOnMap(key) {
    if (!get(key)) await refresh();
    const it = get(key); if (!it) throw Error('That reminder is gone.');
    await toMap();
    if (window.QuestMapFirst && !QuestMapFirst.on('leave')) await QuestMapFirst.toggle('leave'); // shown again if the layer was off
    look = key; redraw();
    mapHost()?.qjHere?.go(it.place, 16);
    statusSoon(); // (round 69, ratp69) you opened this reminder: its line status, when it's coming up
    return it;
  }
  // picking Home: the map opens with a hint at the top; one click there is Home (Esc / Cancel stop)
  const OURS = '.qj-atlas-controls,.hp-dock,.qmf-strip,.qmf-status,.qml-panel,.qj-atlas-credit,.er-hint,.ls-hint,a';
  let down = null, swallowUntil = 0;
  function onDown(e) { if (picking && e.target.closest?.('.qj-atlas')) down = { x: e.clientX, y: e.clientY }; }
  function onClick(e) {
    const host = e.target.closest?.('.qj-atlas');
    if (!picking || !host || e.target.closest(OURS)) return;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; // a drag (panning)
    e.preventDefault(); e.stopPropagation();
    const at = host.qjHere?.at(e.clientX, e.clientY);
    swallowUntil = Date.now() + 700;
    if (!at || !K.inParis(at)) { toast('That spot is outside the Paris map. Click somewhere in Paris.', { type: 'error' }); return; }
    setHome(at.lat, at.lon);
  }
  function onDbl(e) { if (Date.now() < swallowUntil && e.target.closest?.('.qj-atlas')) { e.preventDefault(); e.stopPropagation(); } }
  function onKey(e) { if (picking && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(true); } }
  function listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    document[f]('pointerdown', onDown, true); document[f]('click', onClick, true); document[f]('keydown', onKey, true);
    if (on) document.addEventListener('dblclick', onDbl, true); else setTimeout(() => { if (!picking) document.removeEventListener('dblclick', onDbl, true); }, 800);
  }
  function hint() {
    const host = mapHost(); if (!host) return;
    host.classList.toggle('ls-picking', !!picking);
    const old = host.querySelector(':scope>.ls-hint');
    if (!picking) { old?.remove(); return; }
    if (old) return;
    const cancel = el('button', { type: 'button', class: 'qj-button qj-quiet', text: 'Cancel', on: { click: (e) => { e.stopPropagation(); stopPick(true); } } });
    host.append(el('div', { class: 'ls-hint', attrs: { role: 'status' } }, el('span', { text: '🏠 Click the map where Home is (kept on this computer only)' }), cancel));
  }
  function stopPick(cancelled) {
    const p = picking; picking = null; listen(false); hint();
    if (p && cancelled) p.reject(Error('cancelled'));
  }
  function setHome(lat, lon) {
    const h = { lat: +(+lat).toFixed(5), lon: +(+lon).toFixed(5), at: Date.now() };
    if (!K.inParis(h)) throw Error('That spot is outside the Paris map.');
    store.set(HOME, h);
    const p = picking; picking = null; listen(false); hint(); redraw();
    toast('🏠 Home saved on this computer. Leave reminders count the way from here when no 📍 pin is set.', { timeout: 4500 });
    p?.resolve(h);
    recompute().then((n) => { if (n) paint(); }).catch(() => {});
    return h;
  }
  async function pickHome() {
    if (picking) stopPick(true);
    await toMap();
    return new Promise((resolve, reject) => { picking = { resolve, reject }; listen(true); hint(); });
  }
  function clearHome() { store.set(HOME, null); redraw(); toast('🏠 Home forgotten. Leave reminders will ask for it again.', { timeout: 2500 }); }

  // the layer: ⏰ a pin per reminder still to come, and 🏠 Home
  const pinId = (key) => `ls-${key}`;
  const layer = {
    id: 'leave',
    pins: () => {
      const out = [], h = home(), at = K.now();
      if (h) out.push({ id: 'ls-home', name: '🏠 Home (leave reminders count from here)', lat: h.lat, lon: h.lon, kind: 'bookmark', color: '#9ad0ff', tone: 'ls-home', quest: '', visitedAt: null, minZoom: 11 });
      for (const it of items.values()) {
        if (it.targetAt <= at || it.state === 'dismissed') continue;
        out.push({ id: pinId(it.key), name: `⏰ Leave ${K.when(it.leaveAt, at)} · ${it.title}`, lat: it.place.lat, lon: it.place.lon, kind: 'clock', color: '#ffb759', tone: look === it.key ? 'ls-look' : 'ls-pin', quest: '', visitedAt: null, minZoom: 11 });
      }
      return out;
    },
    owns: (id) => String(id).startsWith('ls-'),
    select: (id) => {
      if (id === 'ls-home') { toast('🏠 Your Home spot: leave reminders count the way from here when no 📍 pin is set.', { timeout: 6000, action: { label: 'Move Home', fn: () => pickHome().catch(() => {}) } }); return; }
      const it = get(String(id).slice(3)); if (!it) return;
      look = it.key; redraw();
      const h = K.hud(it) || { text: `⏰ Leave at ${K.hm(it.leaveAt)}`, sub: it.title };
      toast(`${h.text} · ${h.sub}`, { timeout: 7000, action: isOn(it.key) ? { label: 'Turn off', fn: () => turnOff(it.key).catch(() => {}) } : undefined });
    },
    below: () => { if (picking) hint(); return null; }, // the map re-rendered while picking: the hint goes back on
  };

  // ---------- plugging into the Studio: show cards, quest details, the map ----------
  let attached = { journal: false, shows: false };
  function attach() {
    try { if (!attached.journal && J()) { J().addMapLayer(layer); J().addDetailHook(detail); attached.journal = true; } } catch { /* not yet */ }
    try { if (!attached.shows && typeof ShowSync !== 'undefined' && ShowSync.extend) { ShowSync.extend({ card: (kit, s, acts) => { if (!s.dateOnly) acts.append(showToggle(s, 'qj-button qj-quiet')); if (soonShow(s)) acts.append(beforeButton(s)); if (soonShow(s) && !s.dateOnly) acts.append(eatButton(s)); } }); attached.shows = true; } } catch { /* not yet */ }
  }
  // (round 70, leavefix70) 🎒 Before I go on a show's card (a show still to come, or tonight's): the tickable list
  // (beforego.js, its own lazy group, loaded on this click)
  const soonShow = (s) => s && !s.cancelled && Number.isFinite(s.start) && s.start > K.now() - 6 * 3600e3;
  const before = (open) => Lazy.load('beforego').then(() => open(window.BeforeGo)).catch((err) => toast(calmError(err), { type: 'error' }));
  function beforeButton(s) {
    return el('button', { type: 'button', class: 'qj-button qj-quiet bg-open', text: '🎒 Before I go', title: 'A short list to tick before you head out: your ticket, phone charged, earplugs, ID, card / cash (and a jacket when the forecast says so)', on: { click: (e) => { e.stopPropagation(); before((B) => B.open(s)); } } });
  }
  // (round 71, eatnearby71) 🍜 Eat nearby on a show's card: food stops within ~10 min walk of the venue, open before doors
  // (eatnearby.js, its own lazy group, loaded on this click); "Go here first" adds the stop to this show's ⏰ reminder
  function eatButton(s, spec) {
    return el('button', { type: 'button', class: 'qj-button qj-quiet en-open', text: '🍜 Eat nearby', title: 'Food stops within about 10 minutes’ walk of the venue, open in the 2 hours before doors. “Go here first” moves your leave time earlier.', on: { click: (e) => { e.stopPropagation(); Lazy.load('eatnearby').then(() => EatNearby.open(s, { spec })).catch((err) => toast(calmError(err), { type: 'error' })); } } });
  }
  // a quest's detail in the Studio: a show quest (its show still to come) or an errand still open
  function detail({ campaign }) {
    if (!campaign) return null;
    let b = null;
    if (String(campaign.id).startsWith('c-show-') && campaign.show?.key) { const s = (typeof ShowSync !== 'undefined' ? ShowSync.upcoming() : []).find((x) => x.key === campaign.show.key); if (s) b = showToggle(s, 'qj-button qj-quiet'); }
    else if (campaign.errand && window.Errands) b = errandToggle(campaign.id, 'qj-button qj-quiet');
    return b ? el('div', { class: 'ls-detail' }, el('span', { class: 'ls-detail-k', text: 'GETTING THERE' }), b) : null;
  }

  // the main side tells us when something changed (a reminder rang, was snoozed from the notification…)
  api()?.onChanged?.(() => { refresh().catch(() => {}); });
  attach();
  refresh().catch(() => {});

  return { refresh, items: () => [...items.values()], get, isOn, origin, home, setHome, clearHome, pickHome, turnOn, turnOff, snooze, dismiss, recompute, showOnMap, hudRows, sayMissed, honest, statusSoon, leaveEarlier, keyDialog,
    toggle, showToggle, errandToggle, slotToggle, showSpec, errandSpec, slotSpec, attach, layer, beforeButton, eatButton, get picking() { return !!picking; },
    _test: { clock: async (ms) => { K.setClock(ms); const r = await api().op({ op: 'test', now: ms == null ? Date.now() : ms }); return r?.value; } } }; // (checks) one fake clock for both sides
})();
