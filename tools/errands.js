// (round 67, errands67) Errands: practical quests with opening hours ("AirPods" at Apple Opéra). By clicking only:
//   · "＋ Errand" in the ✦ quest tracker and on the Paris map (the map's chip row) opens one small card: type what, then
//     pick a suggested shop (a short built-in list of well-known Paris shops with their usual hours, marked "usual
//     hours, check before going") or click a spot on the map; the hours can be edited in plain words.
//   · The errand shows on the map (layer "Errands" in the Layers panel, on by default) with an "Open now · closes at
//     20:00" / "Opens at 10:00" / "Closed today" badge, in the ✦ tracker with the same badge, and in round 66's
//     "Close to you" list when the 📍 pin is near.
//   · "Done ✓" completes it as a quest (its one quest, XP and all; self-reported, no proof review: tools/errands-core.js).
// Store: Codex's quest journal only (one small campaign per errand, c.errand), written through QuestHud.write (which uses
// QuestJournal.mutate when the Studio holds the journal). Nothing is looked up or sent on the network; no timers, no
// polling: the badges are worked out when the map, the tracker or a card draws. Lazy group 'questjournal'.
const Errands = window.Errands = (() => {
  const K = ErrandsCore;
  const J = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null);
  const studio = () => (J()?.ready?.() ? J() : null);
  // the journal as it is now: the Studio's live copy when it holds it, else the tracker's last read
  function state() {
    try { const st = studio()?.paris?.ui().state(); if (st) return st; } catch { /* the Studio isn't open */ }
    try { return window.QuestHud?.journal().S || null; } catch { return null; }
  }
  async function write(fn, message) {
    if (typeof QuestHud === 'undefined') await Lazy.load('questhud');
    const { result } = await QuestHud.write(fn, message);
    redraw(); return result;
  }
  async function fresh() { // the tracker's copy, read again (when the Studio isn't the one holding the journal)
    if (!studio() && typeof QuestHud !== 'undefined') await QuestHud.refresh().catch(() => {});
    return state();
  }
  const list = (s = state()) => K.list(s, { now: new Date() });
  const redraw = () => { try { if (J()?.page === 'world') J().addMapLayer(layer); } catch { /* the map isn't open */ } try { if (window.QuestHud?.isOpen()) QuestHud.repaint(); } catch { /* no tracker */ } };

  // ---------- Done ✓ / remove ----------
  async function done(id) {
    const s = await fresh(), e = s && K.list(s, { now: new Date() }).find((x) => x.id === id);
    if (!e) throw Error('That errand is no longer open.');
    const xp = await write((d) => K.complete(d, id), `Errand done: ${e.what}.`);
    toast(`✓ Errand done: ${e.what}${xp ? ` · +${xp} XP` : ''}`, { timeout: 3500 });
    return `✓ Errand done: ${e.what}${xp ? ` · +${xp} XP` : ''}`;
  }
  async function remove(id) {
    const s = state(), c = s?.campaigns.find((x) => x.id === id); if (!c) return;
    if (!(await Modal.confirm('Remove this errand?', `“${c.errand.what}” comes off your map and your quests.`, { ok: 'Remove', danger: true }))) return;
    await write((d) => K.remove(d, id), 'Errand removed.');
    toast(`Errand removed: ${c.errand.what}`, { timeout: 2500 });
  }

  // ---------- picking a spot on the map ----------
  const mapHost = () => document.querySelector('.qj .qj-world-layout .qj-atlas') || document.querySelector('.qj-atlas');
  const OURS = '.qj-atlas-controls,.hp-dock,.qmf-strip,.qmf-status,.qml-panel,.qj-atlas-credit,.er-hint,a';
  let picking = null, down = null, swallowUntil = 0; // picking: the card's draft, waiting for a spot
  function onDown(e) { if (picking && e.target.closest?.('.qj-atlas')) down = { x: e.clientX, y: e.clientY }; }
  function onClick(e) {
    const host = e.target.closest?.('.qj-atlas');
    if (!picking || !host || e.target.closest(OURS)) return;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; // a drag pans the map
    e.preventDefault(); e.stopPropagation(); // a pin under the click doesn't open: the spot is the point
    const at = host.qjHere?.at(e.clientX, e.clientY); if (!at) return;
    swallowUntil = Date.now() + 700;
    gotSpot(at);
  }
  function onDbl(e) { if (Date.now() < swallowUntil && e.target.closest?.('.qj-atlas')) { e.preventDefault(); e.stopPropagation(); } }
  function onKey(e) { if (picking && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const d = picking; stopPick(); card(d); } }
  let listening = false;
  function listen() { if (listening) return; listening = true; document.addEventListener('pointerdown', onDown, true); document.addEventListener('click', onClick, true); document.addEventListener('dblclick', onDbl, true); document.addEventListener('keydown', onKey, true); }
  function unlisten() { if (!listening) return; listening = false; document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); setTimeout(() => { if (!listening) document.removeEventListener('dblclick', onDbl, true); }, 800); }
  function stopPick() { picking = null; unlisten(); hint(); }
  function gotSpot(at) {
    const d = picking; stopPick();
    if (!K.inParis(at.lat, at.lon)) { toast('That spot is outside the Paris map. Click somewhere in Paris.', { type: 'error' }); return card(d); }
    card({ ...d, place: { name: d.spotName || 'A spot on the map', addr: '', lat: at.lat, lon: at.lon, shop: null }, hoursText: d.place?.shop ? '' : d.hoursText, picked: true });
  }
  // "Click the map where it is" (top centre of the map) with Cancel, while picking
  function hint() {
    const host = mapHost(); if (!host) return;
    host.classList.toggle('er-picking', !!picking);
    host.querySelector(':scope>.er-hint')?.remove();
    if (!picking) return;
    const cancel = el('button', { type: 'button', class: 'qj-button qj-quiet', text: 'Cancel', on: { click: (e) => { e.stopPropagation(); const d = picking; stopPick(); card(d); } } });
    host.append(el('div', { class: 'er-hint', attrs: { role: 'status' } }, el('span', { text: `Click the map where ${picking.what ? `you’ll get ${picking.what}` : 'the errand is'}` }), cancel));
  }
  async function toMap() {
    await QuestParisUI.journal();
    if (J().page !== 'world') J().navigate('world');
    for (let i = 0; i < 60 && !mapHost(); i++) await new Promise((r) => setTimeout(r, 50));
  }
  async function pickSpot(draft) { picking = draft; listen(); await toMap(); hint(); }

  // ---------- the card: add, or see / edit / finish one errand ----------
  let open = null; // the card on screen (one at a time)
  function badge(st, extra = '') { return el('span', { class: `er-badge ${K.tone(st.state)}${extra}`, text: st.text }); }
  /** draft: { id? (an existing errand), what, place?, hoursText?, spotName? } */
  function card(draft = {}) {
    open?.close();
    const s = state(), cur = draft.id ? s?.campaigns.find((c) => c.id === draft.id) : null;
    if (draft.id && !K.isErrand(cur)) { toast('That errand is no longer in your journal.', { type: 'error' }); return null; }
    const e = cur?.errand, isDone = cur ? Boolean(s.records?.[cur.quests[0].id]?.completedAt) : false;
    let place = draft.place || e?.place || null;
    const near = window.HerePin?.read?.() || null;
    const dlg = el('dialog', { class: 'ui-modal er-card', attrs: { 'aria-label': cur ? 'Errand' : 'New errand' } });
    const what = el('input', { type: 'text', class: 'er-what', value: draft.what ?? e?.what ?? '', placeholder: 'AirPods', attrs: { maxlength: '80', 'aria-label': 'What do you need?' } });
    const hours = el('input', { type: 'text', class: 'er-hours', value: draft.hoursText ?? (e ? K.format(e.week) : place?.shop ? K.format(K.shop(place.shop)?.week) : ''), placeholder: 'Mon–Sat 10:00–20:00 · Sun closed', attrs: { 'aria-label': 'Opening hours' } });
    const spotName = el('input', { type: 'text', class: 'er-spot-name', value: place && !place.shop && place.name !== 'A spot on the map' ? place.name : '', placeholder: 'Name this spot (optional)', attrs: { maxlength: '80', 'aria-label': 'Name this spot' } });
    const shops = el('div', { class: 'er-shops', attrs: { role: 'radiogroup', 'aria-label': 'Suggested shops' } });
    const spotRow = el('div', { class: 'er-spot' });
    const now = el('div', { class: 'er-now', attrs: { 'aria-live': 'polite' } });
    const usual = el('small', { class: 'er-usual' });
    const err = el('p', { class: 'er-err', attrs: { role: 'alert' } });
    let hoursTouched = Boolean(draft.hoursText) || Boolean(e);
    const draftNow = () => ({ id: draft.id, what: what.value.trim(), place, hoursText: hours.value, spotName: spotName.value.trim() });
    function paintShops() {
      const sug = K.suggest(what.value, { near, limit: 4 });
      if (place?.shop && !sug.some((x) => x.id === place.shop)) sug.unshift(K.shop(place.shop)); // the chosen one stays in view
      shops.replaceChildren(...sug.slice(0, 5).map((sh) => {
        const on = place?.shop === sh.id, st = K.status(sh.week);
        const b = el('button', { type: 'button', class: `er-shop${on ? ' on' : ''}`, dataset: { shop: sh.id }, attrs: { role: 'radio', 'aria-checked': String(on) }, title: `${sh.addr} · ${K.format(sh.week)} (${K.USUAL})`,
          on: { click: () => { place = { name: sh.name, addr: sh.addr, lat: sh.lat, lon: sh.lon, shop: sh.id }; if (!hoursTouched || !hours.value.trim()) { hours.value = K.format(sh.week); hoursTouched = false; } paintShops(); paintSpot(); paintNow(); } } },
          el('span', { class: 'er-shop-name', text: sh.name }), el('span', { class: 'er-shop-area', text: sh.area }), badge(st, ' er-mini'));
        return b;
      }));
    }
    function paintSpot() {
      const custom = place && !place.shop;
      spotRow.replaceChildren(
        el('button', { type: 'button', class: `er-pick${custom ? ' on' : ''}`, text: custom ? '📍 Spot chosen · click to move it' : '📍 Click a spot on the map…', title: 'Close this card, click the map where it is, and come back here', on: { click: () => { const d = draftNow(); dlg.close(); pickSpot(d).catch((x) => toast(calmError(x), { type: 'error' })); } } }),
        ...(custom ? [spotName] : []));
    }
    function paintNow() {
      err.textContent = '';
      let wk; try { wk = K.parse(hours.value); } catch (x) { now.replaceChildren(el('span', { class: 'er-bad', text: x.message })); usual.textContent = ''; return; }
      now.replaceChildren(el('span', { class: 'er-k', text: 'Right now' }), badge(K.status(wk)));
      const sh = place?.shop ? K.shop(place.shop) : null;
      usual.textContent = wk && sh && K.format(wk) === K.format(sh.week) ? `Usual hours, check before going` : wk ? 'Your hours' : 'No hours: the badge says “Hours unknown”';
    }
    what.addEventListener('input', paintShops);
    hours.addEventListener('input', () => { hoursTouched = true; paintNow(); });
    paintShops(); paintSpot(); paintNow();
    const st = e ? K.status(e.week) : null;
    const head = el('div', { class: 'er-head' }, el('h2', { text: cur ? `Errand: ${e.what}` : '＋ New errand' }), st && !isDone ? badge(st) : null, isDone ? el('span', { class: 'er-badge er-done', text: 'Done ✓' }) : null);
    const save = el('button', { type: 'submit', class: 'primary er-save', text: cur ? 'Save' : 'Add errand' });
    const acts = el('div', { class: 'dialog-actions' },
      ...(cur ? [el('button', { type: 'button', class: 'er-remove', text: 'Remove', on: { click: () => { dlg.close(); remove(cur.id).catch((x) => toast(calmError(x), { type: 'error' })); } } })] : []),
      ...(cur && !isDone ? [el('button', { type: 'button', class: 'er-done-btn', text: 'Done ✓', title: 'I have it: complete this errand as a quest', on: { click: () => { dlg.close(); done(cur.id).catch((x) => toast(calmError(x), { type: 'error' })); } } })] : []),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', text: cur ? 'Close' : 'Cancel', on: { click: () => dlg.close() } }), save);
    const form = el('form', { method: 'dialog' }, head,
      el('label', { class: 'er-field' }, el('span', { text: 'What do you need?' }), what),
      el('div', { class: 'er-field' }, el('span', { text: 'Where' }), shops, spotRow),
      el('label', { class: 'er-field' }, el('span', { text: 'Opening hours' }), hours, usual), now,
      ...(cur ? [el('div', { class: 'er-map-row' }, el('button', { type: 'button', class: 'er-show', text: 'Show on map', on: { click: () => { dlg.close(); showOnMap(cur.id).catch((x) => toast(calmError(x), { type: 'error' })); } } }))] : []),
      err, acts);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (place && !place.shop) place = { ...place, name: spotName.value.trim() || 'A spot on the map' };
      try {
        const input = { what: what.value, place: place || {}, hours: hours.value };
        K.checkInput(input); // a plain sentence under the form when something's missing; nothing is saved
        save.disabled = true;
        if (cur) { await write((d) => K.edit(d, cur.id, input), 'Errand saved.'); toast(`Errand saved: ${input.what.trim()}`, { timeout: 2200 }); }
        else { const c = await write((d) => K.add(d, input), `Errand added: ${input.what.trim()}. It's on your map.`); toast(`＋ Errand: ${c.errand.what} · ${K.status(c.errand.week).text}`, { timeout: 3500 }); }
        dlg.close();
      } catch (x) { save.disabled = false; err.textContent = calmError(x); }
    });
    dlg.append(form);
    dlg.addEventListener('close', () => { if (open === dlg) open = null; setTimeout(() => dlg.remove(), 0); });
    document.body.append(dlg); open = dlg;
    dlg.showModal();
    (what.value ? (place ? save : shops.querySelector('button') || what) : what).focus();
    return dlg;
  }
  async function add(draft = {}) { await fresh(); return card(draft); }
  async function show(id) { await fresh(); return card({ id }); }
  async function showOnMap(id) {
    const e = list().find((x) => x.id === id) || K.list(state(), { done: true }).find((x) => x.id === id);
    if (!e) throw Error('That errand is no longer in your journal.');
    if (!on()) await window.QuestMapFirst?.toggle('errands'); // shown again if the layer was off
    await toMap(); mapHost()?.qjHere?.go(e.place, 16); redraw();
  }

  // ---------- the map layer ----------
  const on = () => (window.QuestMapFirst ? QuestMapFirst.on('errands') : true);
  const layer = {
    id: 'errands',
    pins: () => list().map((e) => ({ id: `er-${e.id}`, name: `${e.what} · ${e.badge.short}`, lat: e.place.lat, lon: e.place.lon, kind: 'gift', color: { open: '#7ee0a1', soon: '#ffb759', later: '#ffd75e' }[e.badge.state] || '#a9a2b6', tone: K.tone(e.badge.state), quest: '', visitedAt: null })),
    owns: (id) => String(id).startsWith('er-c-errand-'),
    select: (id) => { show(String(id).slice(3)).catch((x) => toast(calmError(x), { type: 'error' })); },
    below: () => { if (picking) hint(); return null; }, // the map re-rendered while picking: the hint goes back on
  };
  try { J()?.addMapLayer(layer); } catch { /* the journal registers layers when it loads */ }
  /** "＋ Errand" in the map's chip row (tools/quest-mapfirst.js overlay) */
  function chip(kit) {
    const b = kit.button('', () => add(), 'qj-hardware qmf-chip er-add');
    b.setAttribute('aria-label', 'Add an errand: what you need, where, its opening hours'); b.title = 'Add an errand: what you need (AirPods…), a shop or a spot on the map, its opening hours';
    b.append(QuestAtlas.icon('plus'), kit.E('span', { text: 'Errand' }));
    return b;
  }

  // ---------- Sidequest Studio: an errand's quest detail gets its badge, Done ✓ and Edit ----------
  try {
    J()?.addDetailHook(({ campaign, close }) => {
      if (!K.isErrand(campaign)) return null;
      const s = state(), finished = Boolean(s?.records?.[campaign.quests[0].id]?.completedAt), st = K.status(campaign.errand.week);
      return el('div', { class: 'er-detail' }, el('span', { class: 'er-k', text: `Errand · ${campaign.errand.place.name}` }), finished ? el('span', { class: 'er-badge er-done', text: 'Done ✓' }) : badge(st),
        el('small', { text: `${K.format(campaign.errand.week) || 'Hours unknown'}${campaign.errand.usual ? ` (${K.USUAL})` : ''}` }),
        el('div', { class: 'er-detail-acts' },
          ...(finished ? [] : [el('button', { type: 'button', class: 'qj-button qj-primary', text: 'Done ✓', title: 'I have it: complete this errand', on: { click: () => { close(); done(campaign.id).catch((x) => toast(calmError(x), { type: 'error' })); } } })]),
          el('button', { type: 'button', class: 'qj-button qj-quiet', text: 'Edit errand…', on: { click: () => { close(); show(campaign.id); } } })));
    });
  } catch { /* an older Studio without detail hooks */ }

  // ---------- chat (secondary: everything above is clickable) — /quest errand [<what> [at <shop>] | done <what>] ----------
  async function run(rest = '') {
    const t = String(rest || '').trim(), s = await fresh();
    const todo = K.list(s, { now: new Date() });
    const m = t.match(/^(done|finish|got)\s+(.+)$/i);
    if (m) { const n = m[2].toLowerCase(), e = todo.find((x) => x.what.toLowerCase().includes(n)); if (!e) return `No open errand called "${m[2]}".`; return done(e.id); }
    if (!t || /^(list|all)$/i.test(t)) return todo.length ? `Errands:\n${todo.map((e, i) => `${i + 1}. ${e.what} — ${e.place.name} · ${e.badge.text}${e.usual ? ` (${K.USUAL})` : ''}`).join('\n')}` : 'No errands. Click ＋ Errand in the ✦ tracker or on the map to add one.';
    const at = t.match(/^(.+?)\s+(?:at|from|@|chez)\s+(.+)$/i), what = at ? at[1] : t;
    const sh = at ? K.suggest(at[2], { limit: 1 })[0] : K.suggest(what, { limit: 1 }).find((x) => x.match);
    await add({ what, ...(sh ? { place: { name: sh.name, addr: sh.addr, lat: sh.lat, lon: sh.lon, shop: sh.id }, hoursText: K.format(sh.week) } : {}) });
    return `The errand card is open: check the shop and the hours, then Add errand.`;
  }

  return { add, show, done, remove, showOnMap, run, list, chip, layer, card, get picking() { return !!picking; } };
})();
