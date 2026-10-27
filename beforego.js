// (round 70, leavefix70) "🎒 Before I go": a short tickable list for a show night (lazy group 'beforego', loaded on the
// first click of "🎒 Before I go" or when a show's ⏰ leave reminder rings). Where it shows, by clicking only:
//   · a show's card (Paris map › a venue / ✦ Shows this week › a show): "🎒 Before I go"
//   · a show's ⏰ "Leave in 10 min…" reminder: with Hearth in front the card opens by itself; from the desktop
//     notification (Hearth in the tray) a click on it opens Hearth on the card; the ✦ tracker's ringing row has it too
// The rows: 🎟 Ticket (with "🎟 Open my ticket" when it's in Hearth, else "🎟 Add my ticket"), the owner's list (Hearth's:
// Phone charged · Earplugs · ID · Card / cash; "Edit my list…" changes it once for every show, kept in this computer's
// localStorage), and 🧥 Jacket when the forecast Hearth ALREADY has (weekquest62's cache) says rain or cold. Ticks are
// kept per show (a new show starts clear). Nothing is fetched for it, nothing is sent, no AI. (beforego-core.js: the rows)
const BeforeGo = window.BeforeGo = (() => {
  const C = BeforeGoCore;
  const LIST = 'beforego.list', TICKS = 'beforego.ticks';
  let card = null, cur = null; // cur: { show, ring, rows, ticket, days }
  const _test = { days: undefined }; // (checks) a cached forecast fixture instead of asking the main side's cache
  const get = (k, d) => { try { return store.get(k, d); } catch { return d; } };
  const put = (k, v) => { try { store.set(k, v); } catch { /* storage full or blocked: the ticks just don't stay */ } };
  const myList = () => C.list(get(LIST, null));
  const ticks = () => C.ticksOf(get(TICKS, null));

  // the ticket: the tickets list (main side, one small read); the forecast: only what's cached (never fetched here)
  async function ticketFor(key) {
    try { const r = await window.hub?.tickets?.op({ op: 'list' }); return !!(r?.ok && r.value.list.some((t) => t.key === key && t.files?.length)); } catch { return false; }
  }
  async function cachedDays() {
    if (_test.days !== undefined) return _test.days;
    try { const r = await window.hub?.weekquest?.weather?.({ cached: true }); return r?.ok ? r.days : null; } catch { return null; }
  }

  // a show as the cards know it; a show's leave reminder → its show
  const plain = (s) => ({ key: String(s.key), title: s.title || 'Show', start: Number(s.start), doors: Number.isFinite(s.doors) ? s.doors : null, dateOnly: !!s.dateOnly, venue: { name: s.venue?.name || '', address: s.venue?.address || '', ...(Number.isFinite(s.venue?.lat) ? { lat: s.venue.lat, lon: s.venue.lon } : {}) }, lineup: (s.lineup || []).slice(0, 12) });
  function showOf(it) {
    const key = it.ref?.show || String(it.key).replace(/^show:/, '');
    try { const s = (typeof ShowSync !== 'undefined' ? ShowSync.upcoming() : []).find((x) => x.key === key); if (s) return plain(s); } catch { /* the cards aren't loaded */ }
    return { key, title: it.title, start: it.targetAt, dateOnly: false, venue: { name: it.place?.name || '' }, lineup: [] };
  }
  const p2 = (n) => String(n).padStart(2, '0');
  const hm = (ms) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  function whenText(s) {
    if (!Number.isFinite(s.start)) return s.venue.name;
    // in Paris time, like the show cards (whatever this computer's zone)
    const d = new Date(s.start), day = C.parisDay(s.start) === C.parisDay(Date.now()) ? 'Tonight' : d.toLocaleDateString(undefined, { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString([], { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
    return [s.dateOnly ? day : `${day} ${time}`, s.venue.name].filter(Boolean).join(' · ');
  }

  // ---------- the card ----------
  /** open the list for a show; ring: { key (the reminder), title (its words), made } when a reminder rang */
  async function open(show, { ring = null } = {}) {
    const s = plain(show);
    const [ticket, days] = await Promise.all([ticketFor(s.key), cachedDays()]);
    cur = { show: s, ring, ticket, days };
    render();
    card.querySelector('input,button')?.focus({ preventScroll: true });
    return state();
  }
  /** a show's leave reminder rang (or its notification was clicked): its show's list, with the reminder's buttons */
  async function openFor(key, { ring = null } = {}) {
    let it = ring?.item || null;
    if (!it) { const r = await window.hub?.leave?.op({ op: 'list' }); it = r?.ok ? r.value.items.find((x) => x.key === key) : null; }
    if (!it) throw Error('That reminder is gone.');
    if (!ring?.title) await Lazy.load('leavesoon').catch(() => {}); // the reminder's own words (leavesoon-core), as the notification said them
    const words = ring?.title || (window.LeaveSoonCore ? LeaveSoonCore.notice(it).title : `Leave at ${hm(it.leaveAt)} — ${it.travel?.text || ''}`);
    return open(showOf(it), { ring: { key: it.key, title: words, made: it.createdAt, state: it.state } });
  }
  function close() { const c = card; card = null; cur = null; try { if (c?.open) c.close(); } catch { /* gone */ } c?.remove(); }
  const leave = (op) => window.hub?.leave?.op({ op, key: cur.ring.key, made: cur.ring.made });
  function render() {
    if (!cur) return;
    const s = cur.show, rows = C.rows({ list: get(LIST, null), ticket: cur.ticket, days: cur.days, start: s.start }), set = C.ticked(get(TICKS, null), s.key);
    cur.rows = rows;
    const pr = C.progress(rows, set);
    const btn = (text, fn, cls = '', title = '') => el('button', { type: 'button', class: `bg-btn ${cls}`, text, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve().then(fn).catch((err) => toast(calmError(err), { type: 'error' })); } } });
    const row = (r) => {
      const box = el('input', { type: 'checkbox', checked: set.has(r.id), attrs: { 'aria-label': r.text }, on: { change: () => { put(TICKS, C.tick(get(TICKS, null), s.key, r.id, box.checked)); render(); } } });
      const extra = r.kind === 'ticket'
        ? btn(r.has ? '🎟 Open my ticket' : '🎟 Add my ticket', async () => {
          await Lazy.load('tickets');
          if (r.has) { close(); await Tickets.view(s.key); } else { await Tickets.pick(s, { from: 'pick' }); cur && (cur.ticket = await ticketFor(s.key)); render(); }
        }, r.has ? 'bg-ticket-open' : 'bg-ticket-add', r.has ? 'Your ticket, big and bright for the door' : 'Pick your ticket (PDF, image, screenshot, Wallet pass). Hearth keeps a copy.')
        : null;
      const icon = r.kind === 'ticket' ? '🎟' : r.kind === 'jacket' ? '🧥' : '';
      return el('li', { class: `bg-row bg-${r.kind}${set.has(r.id) ? ' done' : ''}`, dataset: { id: r.id }, title: r.title || '' },
        el('label', {}, box, el('span', { text: icon ? `${icon} ${r.text}` : r.text })), extra);
    };
    const parts = [
      el('header', { class: 'bg-head' },
        el('div', { class: 'bg-what' }, el('span', { class: 'bg-k', text: '🎒 BEFORE I GO' }), el('strong', { text: s.title }), el('span', { class: 'bg-when', text: whenText(s) })),
        el('button', { type: 'button', class: 'bg-close', text: '×', title: 'Close (your ticks stay)', attrs: { 'aria-label': 'Close' }, on: { click: close } })),
      cur.ring ? el('p', { class: 'bg-ring', text: `⏰ ${cur.ring.title}` }) : null,
      el('ul', { class: 'bg-list' }, rows.map(row)),
      el('footer', { class: 'bg-foot' },
        el('span', { class: 'bg-progress', text: pr.text }),
        btn('Edit my list…', editList, 'bg-edit', 'Change the list for every show (kept on this computer). The ticket and the jacket are Hearth’s own rows.'),
        // (round 71, eatnearby71) 🍜 Eat nearby: food stops close to the venue, open before doors (its own lazy group)
        s.dateOnly || !Number.isFinite(s.start) ? null : btn('🍜 Eat nearby', () => { const show = s; close(); return Lazy.load('eatnearby').then(() => EatNearby.open(show)); }, 'bg-eat', 'Food stops within about 10 minutes’ walk of the venue, open in the 2 hours before doors; “Go here first” moves your leave time earlier')),
      cur.ring ? el('div', { class: 'bg-acts' },
        btn('Show on map', () => Lazy.load('leavesoon').then(() => LeaveSoon.showOnMap(cur.ring.key)), 'bg-map', 'See the venue on the Paris map'),
        cur.ring.state === 'on' ? null : btn('Snooze 10 min', async () => { const r = await leave('snooze'); toast(r?.ok && r.value.state === 'snoozed' ? `⏰ Snoozed: I’ll remind you again at ${hm(r.value.snoozeUntil)}.` : '⏰ That reminder is over: nothing to snooze.', { timeout: 2500 }); }, 'bg-snooze', 'Remind me again in 10 minutes'),
        btn('Dismiss', async () => { await leave('dismiss'); close(); }, 'bg-dismiss', 'I’m on my way (or not going): no more reminders for this')) : null];
    // a <dialog>: over a show's card (a modal dialog: everything else is inert) it opens modal too, else it sits at the
    // bottom right without blocking the app. Esc closes it (the browser's own cancel).
    if (!card) {
      card = el('dialog', { class: 'bg-card', attrs: { 'aria-label': `Before I go: ${s.title}` } });
      const me = card; me.addEventListener('close', () => { if (card === me) { card = null; cur = null; } me.remove(); });
      document.body.append(me);
      if (document.querySelector('dialog:modal')) me.showModal(); else me.show();
    }
    card.setAttribute('aria-label', `Before I go: ${s.title}`); card.classList.toggle('all', pr.all);
    const fid = card.contains(document.activeElement) ? document.activeElement.closest?.('.bg-row')?.dataset.id : null; // a tick keeps the keyboard where it was
    card.replaceChildren(...parts.filter(Boolean));
    if (fid) card.querySelector(`.bg-row[data-id="${CSS.escape(fid)}"] input`)?.focus({ preventScroll: true });
  }
  async function editList() {
    const now = myList(), custom = !C.isDefault(get(LIST, null));
    const v = await Modal.form('🎒 Before I go: my list', [
      { name: 'list', label: 'One thing per line, for every show. Hearth adds the 🎟 ticket itself, and a 🧥 jacket when the forecast it already has says rain or cold.', type: 'textarea', rows: 7, value: now.join('\n') },
      ...(custom ? [{ name: 'reset', label: 'Back to Hearth’s list (Phone charged, Earplugs, ID, Card / cash)', type: 'checkbox', value: false }] : []),
    ], { ok: 'Save' });
    if (!v) return false;
    const p = v.reset ? { list: C.DEFAULTS.slice(), reset: true } : C.parseEdit(v.list);
    put(LIST, p.reset ? null : p.list);
    toast(p.reset ? '🎒 Back to Hearth’s list.' : `🎒 Saved: ${p.list.length} thing${p.list.length === 1 ? '' : 's'} on your list (this computer only).`, { timeout: 2500 });
    render();
    return true;
  }
  // a ticket added elsewhere (a drop on the card…): the ticket row follows
  document.addEventListener('hearth:tickets', (e) => { if (!cur) return; cur.ticket = !!e.detail?.list?.some((t) => t.key === cur.show.key && t.files?.length); render(); });

  const state = () => ({ open: !!card, key: cur?.show.key || null, ring: cur?.ring?.key || null, rows: (cur?.rows || []).map((r) => r.id) });
  return { open, openFor, close, editList, state, list: myList, _test };
})();
