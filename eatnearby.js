// (round 71, eatnearby71) "🍜 Eat nearby": somewhere to eat before a show (lazy group 'eatnearby', loaded on the first
// click). Where it shows, by clicking only:
//   · a show's card (Paris map › a venue / ✦ Shows this week › a show): "🍜 Eat nearby", next to 🎒 Before I go
//   · the show slot of 🗓 Plan my weekend (✦ tracker), and the 🎒 Before I go list of a show
// The list: the Paris guide's food stops (the map's "Food & stops") within ~10 min walk of the venue that are open in the
// 2 hours before doors, ★ starred / ✓ stamped places first, then the closest. Hours come from what you typed here ("Add
// hours…", kept on this computer) or the guide, read by the errands hours parser; none → "Hours unknown" (still listed).
// Each row: Show on map · Go here first (the show's ⏰ leave reminder takes the stop: the trip goes there, the leave time
// moves earlier by the eat time (45 min, editable in the list) + the walk on to the venue). Nothing is fetched or sent,
// no AI. (eatnearby-core.js: the list; leavesoon-core.js: the stop in the reminder)
const EatNearby = window.EatNearby = (() => {
  const C = EatNearbyCore;
  const EAT = 'eatnearby.eat', HOURS = 'eatnearby.hours';
  let card = null, cur = null; // cur: { show, spec, rows }
  const get = (k, d) => { try { return store.get(k, d); } catch { return d; } };
  const put = (k, v) => { try { store.set(k, v); } catch { /* storage blocked: it just isn't remembered */ } };
  const eatMin = () => C.eatOf(get(EAT, C.EAT));
  const hoursMap = () => { const h = get(HOURS, null); return h && typeof h === 'object' && !Array.isArray(h) ? h : {}; };
  const J = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null);
  // the journal as it is now (★ stars, ✓ visit stamps): the Studio's live copy, else the ✦ tracker's last read
  function journal() {
    try { const st = J()?.paris?.ui().state(); if (st) return st; } catch { /* the Studio isn't open */ }
    try { return window.QuestHud?.journal().S || null; } catch { return null; }
  }
  const doorsOf = (s) => (Number.isFinite(s.doors) ? s.doors : Number(s.start));
  const L = () => LeaveSoonCore;

  // ---------- the list ----------
  function rowsFor() {
    const s = cur.show, venue = cur.spec?.place;
    const places = C.foodPlaces({ guide: window.QuestParis?.guide || [], places: journal()?.atlas?.places || [], hours: hoursMap(), parse: window.ErrandsCore?.parse });
    return venue ? C.nearby({ venue, doors: doorsOf(s), eatMin: eatMin(), places }) : [];
  }
  const reminder = () => { const k = cur?.spec?.key; return k && LeaveSoon.isOn(k) ? LeaveSoon.get(k) : null; };
  /** what the leave time would be with this stop (for the button's hover text), when Hearth knows where you leave from */
  function preview(row) {
    try {
      const o = LeaveSoon.origin(); if (!o) return '';
      const t = cur.spec.target(0); if (!Number.isFinite(t.at)) return '';
      const tr = L().travel(o, row), stop = C.stopOf(row, eatMin());
      const at = Math.floor((t.at - (tr.min + L().stopMin(stop)) * 60e3) / 3e5) * 3e5;
      return ` You’d leave at ${L().hm(at)} (${tr.text} from ${o.from}, ${stop.eatMin} min to eat, then ${stop.walkMin} min walk to the venue).`;
    } catch { return ''; }
  }

  async function open(show, { spec = null, slot = null } = {}) {
    await Lazy.load('leavesoon');
    if (!window.QuestParis || !window.ErrandsCore) await Lazy.load('questjournal').catch(() => {}); // the guide's places + the hours parser
    if (window.LeaveSoon && !LeaveSoon.items().length) await LeaveSoon.refresh().catch(() => {});
    const sp = spec || (slot ? LeaveSoon.slotSpec(slot.o, slot.itemId) : LeaveSoon.showSpec(show));
    cur = { show, spec: sp, rows: [] };
    render();
    card?.querySelector('button:not(.en-close),select')?.focus({ preventScroll: true });
    return state();
  }
  function close() { const c = card; card = null; cur = null; try { if (c?.open) c.close(); } catch { /* gone */ } c?.remove(); }
  const p2 = (n) => String(n).padStart(2, '0');
  const hm = (ms) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const btn = (text, fn, cls = '', title = '') => el('button', { type: 'button', class: `en-btn ${cls}`, text, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve().then(fn).catch((err) => { if (err?.message !== 'cancelled') toast(calmError(err), { type: 'error', timeout: 6000 }); }); } } });

  function render() {
    if (!cur) return;
    const s = cur.show, venue = cur.spec?.place, rows = rowsFor(), it = reminder(), first = it?.stop?.id || null;
    cur.rows = rows;
    const doors = doorsOf(s), doorsWord = Number.isFinite(s.doors) ? 'Doors' : 'Starts';
    const eatSel = el('select', { class: 'en-eat', attrs: { 'aria-label': 'Eat time' }, on: { change: () => setEat(+eatSel.value).catch((err) => toast(calmError(err), { type: 'error' })) } },
      ...[...new Set([...C.EAT_CHOICES, eatMin()])].sort((a, b) => a - b).map((m) => el('option', { value: String(m), text: `${m} min`, selected: m === eatMin() })));
    const row = (r) => {
      const mineFirst = first === r.id;
      const go = mineFirst
        ? btn('✓ First stop', () => setStop(null), 'en-first on', 'This is your stop before the show. Click to go straight to the venue instead.')
        : btn('Go here first', () => setStop(r), 'en-first', `${cur.spec.can ? 'Adds this stop to the show’s ⏰ leave reminder (it turns on if it was off): the leave time moves earlier by the eat time and the walk to the venue.' : cur.spec.why ? `${cur.spec.why}: no leave reminder.` : ''}${cur.spec.can ? preview(r) : ''}`);
      if (!cur.spec.can) go.disabled = true;
      const badges = [r.starred ? '★' : '', r.stamped ? '✓ been' : ''].filter(Boolean).join(' ');
      return el('li', { class: `en-row${mineFirst ? ' first' : ''} en-${r.hours.state}`, dataset: { id: r.id } },
        el('div', { class: 'en-main' },
          el('strong', { text: r.name }), badges ? el('span', { class: 'en-badge', text: badges, title: [r.starred ? 'Starred on your map' : '', r.stamped ? 'You stamped a visit here' : ''].filter(Boolean).join(' · ') }) : null,
          el('span', { class: 'en-sub' }, el('span', { class: 'en-walk', text: r.walkText }), el('span', { text: ' · ' }), el('span', { class: 'en-hours', text: r.hours.text, title: r.hours.title || '' }))),
        el('div', { class: 'en-acts' },
          btn('Show on map', () => showOnMap(r), 'en-map', 'See it on the Paris map'),
          go,
          r.hours.state === 'unknown' || r.mine ? btn(r.mine ? 'Hours…' : 'Add hours…', () => editHours(r), 'en-hours-edit', 'Type its opening hours (kept on this computer), e.g. Tue–Sat 12:00–14:30, 19:00–23:00 · Sun, Mon closed') : null));
    };
    const empty = !venue
      ? el('p', { class: 'en-empty', text: `${s.venue?.name || 'This venue'} has no spot on the Paris map yet, so Hearth can’t tell what’s close.` })
      : !rows.length ? el('p', { class: 'en-empty', text: `No food stop from the Paris guide is within about ${C.MAX_WALK} min walk of ${venue.name || 'the venue'} and open before doors. The map’s Food & stops layer shows them all.` }) : null;
    const parts = [
      el('header', { class: 'en-head' },
        el('div', { class: 'en-what' }, el('span', { class: 'en-k', text: '🍜 EAT BEFORE' }), el('strong', { text: s.title || 'Show' }),
          el('span', { class: 'en-when', text: [Number.isFinite(doors) ? `${doorsWord} ${hm(doors)}` : '', venue?.name || s.venue?.name || ''].filter(Boolean).join(' · ') })),
        el('button', { type: 'button', class: 'en-close', text: '×', title: 'Close', attrs: { 'aria-label': 'Close' }, on: { click: close } })),
      el('div', { class: 'en-bar' }, el('label', { class: 'en-eat-l' }, el('span', { text: 'Eat time' }), eatSel),
        el('span', { class: 'en-hint', text: `Within ~${C.MAX_WALK} min walk · open in the 2 h before ${doorsWord.toLowerCase()}` })),
      it?.stop ? el('p', { class: 'en-plan', text: `⏰ Leave at ${L().when(it.leaveAt)} · ${it.travel.text} to ${it.stop.name} from ${it.from}, ${it.stop.eatMin} min to eat, then ${it.stop.walkMin} min walk to the venue` }) : null,
      empty || el('ul', { class: 'en-list' }, rows.map(row))];
    if (!card) {
      card = el('dialog', { class: 'en-card' });
      const me = card; me.addEventListener('close', () => { if (card === me) { card = null; cur = null; } me.remove(); });
      document.body.append(me);
      if (document.querySelector('dialog:modal')) me.showModal(); else me.show(); // over a show's card (modal) it's modal too
    }
    card.setAttribute('aria-label', `Eat nearby: ${s.title || 'show'}`);
    const fid = card.contains(document.activeElement) ? document.activeElement.closest?.('.en-row')?.dataset.id : null;
    const fcls = fid ? [...document.activeElement.classList].find((c) => c.startsWith('en-') && c !== 'en-btn') : null;
    card.replaceChildren(...parts.filter(Boolean));
    if (fid) (card.querySelector(`.en-row[data-id="${CSS.escape(fid)}"] .${fcls || 'en-first'}`) || card.querySelector(`.en-row[data-id="${CSS.escape(fid)}"] button`))?.focus({ preventScroll: true });
  }

  // ---------- Go here first / eat time ----------
  async function setStop(row, eat = eatMin()) {
    const spec = cur.spec;
    if (!spec.can) throw Error(`${spec.why || 'This can’t have a leave reminder'}.`);
    const stop = row ? C.stopOf(row, eat) : null;
    await LeaveSoon.turnOn(stop ? { ...spec, stop } : spec, () => { close(); document.querySelectorAll('dialog.qj-dialog[open]').forEach((d) => d.close()); }); // no Home yet: the map opens to click it
    if (!stop) toast('🍜 No stop first: straight to the venue.', { timeout: 2500 });
    render();
    return reminder();
  }
  async function setEat(m) {
    put(EAT, C.eatOf(m));
    const it = reminder();
    if (it?.stop && it.stop.eatMin !== C.eatOf(m)) {
      const row = cur.rows.find((r) => r.id === it.stop.id) || { ...it.stop, walk: it.stop.walkMin };
      await setStop(row, C.eatOf(m));
    } else render();
  }

  // ---------- hours typed by the owner (this computer only) ----------
  async function editHours(r) {
    const v = await Modal.form(`🍜 ${r.name}: opening hours`, [
      { name: 'hours', label: 'Its opening hours, in plain words (kept on this computer). Leave empty to forget them.', type: 'text', value: r.mine ? r.hoursText : '', placeholder: 'Tue–Sat 12:00–14:30, 19:00–23:00 · Sun, Mon closed' },
    ], { ok: 'Save' });
    if (!v) return false;
    const text = String(v.hours || '').trim(), h = { ...hoursMap() };
    if (text) { ErrandsCore.parse(text); h[r.id] = text.slice(0, 200); } else delete h[r.id]; // unreadable: the parser says how to write them
    put(HOURS, h);
    toast(text ? `🍜 Hours saved for ${r.name}.` : `🍜 Hours forgotten for ${r.name}.`, { timeout: 2500 });
    render();
    return true;
  }

  // ---------- Show on map ----------
  const mapHost = () => document.querySelector('.qj .qj-world-layout .qj-atlas') || document.querySelector('.qj-atlas');
  async function showOnMap(r) {
    close(); document.querySelectorAll('dialog.qj-dialog[open],dialog.bg-card[open]').forEach((d) => d.close());
    await Lazy.load('questjournal');
    await QuestParisUI.journal();
    if (J().page !== 'world') J().navigate('world');
    for (let i = 0; i < 60 && !mapHost(); i++) await new Promise((res) => setTimeout(res, 50));
    if (!mapHost()) throw Error('The Paris map didn’t open. Open Sidequest Studio › Map and try again.');
    if (window.QuestMapFirst && !QuestMapFirst.on('places')) await QuestMapFirst.toggle('places'); // Food & stops back on
    const pin = (() => { try { return QuestParis.pinOf(J().paris.ui().state(), r.id); } catch { return null; } })();
    if (pin) { try { await J().paris.mutate((s) => { s.atlas.selected = pin.id; }, ''); } catch { /* the pin moved: the map still goes there */ } }
    mapHost()?.qjHere?.go({ lat: r.lat, lon: r.lon }, 16);
    return pin?.id || null;
  }

  const state = () => ({ open: !!card, show: cur?.show?.key || null, key: cur?.spec?.key || null, rows: (cur?.rows || []).map((r) => ({ id: r.id, walk: r.walk, hours: r.hours.state, starred: r.starred, stamped: r.stamped })), eat: eatMin() });
  return { open, close, state, setStop, setEat, editHours, showOnMap };
})();
