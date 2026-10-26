// (round 66, weekendplan66) 🗓 Plan my weekend: the card (lazy group 'weekendplan', loaded on first click).
// From Thursday 17:00 to Sunday the ✦ tracker's panel shows a "🗓 Plan my weekend" button (and ⋯ More › Plan my
// weekend…). The card proposes a balanced weekend from what Hearth already has, one slot per line:
//   ♫ Night out (a saved Shotgun / DICE show) · ☀ Afternoon outside (music at the park on the better afternoon)
//   📍 Nearby, after (an unvisited Paris place close to it) · 🎛 Studio session (an open music project, else park loops)
// Each slot: Swap (the next best option) and Keep (on by default; click to leave a slot out). Accept plan turns the kept
// slots into real quests on the week plan (weekquest62's s.weekly), each with its time; the ✦ chip follows each day's.
// Nothing is fetched for shows: the card reads showsync61's saved list and says so (and when it's offline). The only
// network ask is weekquest62's forecast (main side, cached 3 h), skipped when the computer is offline. Nothing uploads.
// The thinking is weekendplan-core.js (in the 'questhud' group); writes go through QuestHud.write (Codex's own steps).
const WeekendPlan = (() => {
  const WP = () => WeekendPlanCore, W = () => WeekQuestCore;
  let panel = null, built = null, swaps = {}, left = new Set(), status = '', busy = false, now = 0, lastAccepted = 0;
  const _test = { shows: null, weather: undefined, projects: null, takes: null }; // (checks) fixtures instead of the saved lists (the clock: WeekendPlanCore.setClock)
  const clock = () => WP().now();
  const J = () => QuestHud.journal();
  const btn = (text, run, cls = '', title = '') => el('button', { type: 'button', class: `qh-btn ${cls}`, text, title: title || null, on: { click: (e) => { e.stopPropagation(); Promise.resolve(run(e)).catch((err) => toast(calmError(err), { type: 'error' })); } } });

  // ---------- reading what Hearth already has (a failed read is never "empty": it says so) ----------
  async function sources() {
    const notes = [], offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    let shows = _test.shows, refreshedAt = null;
    if (!shows) {
      try { const r = await window.hub?.shows?.get(); if (r?.ok && r.value?.enabled !== false) { shows = r.value.shows || []; refreshedAt = r.value.refreshedAt || null; } else { shows = []; notes.push(r?.ok ? 'Shows are turned off in the map’s Shows layer.' : 'Your saved shows could not be read just now.'); } } catch { shows = []; notes.push('Your saved shows could not be read just now.'); }
    }
    const when = refreshedAt ? ` (updated ${new Date(refreshedAt).toLocaleString('en', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})` : '';
    notes.unshift(offline ? `Offline: using the shows Hearth saved${when}. Nothing new is fetched.` : `Shows from Hearth’s saved Shotgun / DICE list${when}.`);
    let weather = null;
    if (_test.weather !== undefined) weather = _test.weather;
    else if (!offline) { try { const r = await window.hub?.weekquest?.weather(); weather = r?.ok ? r.days : null; } catch { weather = null; } }
    if (!weather) notes.push('No forecast reached Hearth: check the sky before the park.');
    let projects = _test.projects;
    if (!projects) {
      try { const r = await window.hub.kvGet('projects', null, { status: true }); projects = r?.state === 'ok' ? r.value?.list || [] : []; if (r?.state !== 'ok' && r?.state !== 'missing') notes.push('Your projects could not be read just now, so the studio slot suggests a small idea.'); } catch { projects = []; notes.push('Your projects could not be read just now.'); }
      const openId = window.ProjectWorkspace?.current?.()?.id || null;
      projects = projects.map((p) => ({ id: p.id, name: p.name, status: p.status, updated: p.updated, notes: p.notes, persona: p.workspace?.persona, open: p.id === openId }));
    }
    let takes = _test.takes;
    if (!takes) { try { const r = await window.hub?.parkSong?.list?.(); takes = Array.isArray(r?.takes) ? r.takes : []; } catch { takes = []; } }
    return { shows, weather, projects, takes, notes };
  }
  async function load() {
    await QuestHud.refresh(); const { C, S, status: st } = J();
    if (st !== 'ok' || !C || !S) throw Error(st === 'missing' ? 'No quest journal yet. Click Open Sidequest Studio in the ✦ tracker: it starts one.' : 'Your quest journal could not be read just now. Nothing was changed.');
    await Lazy.load('questjournal'); // QuestParis's places / park quest and ShowSyncCore's show quests (the Studio isn't opened)
    const src = await sources(); now = clock();
    const pin = QuestParis.byId('place-buttes'), parkAt = pin ? { lat: pin.lat, lon: pin.lon, name: QuestParis.parkName('place-buttes') } : null;
    built = WP().build({ C, s: S, now, shows: src.shows, guide: QuestParis.guide, personal: QuestParis.personal, weather: src.weather, parkAt, projects: src.projects, takes: src.takes });
    status = src.notes.join(' ');
    return built;
  }
  const plan = () => (built ? WP().choose(built, swaps, now) : []);

  // ---------- actions ----------
  function swap(id) { swaps[id] = (swaps[id] || 0) + 1; left.delete(id); render(); }
  function keep(id) { if (left.has(id)) left.delete(id); else left.add(id); render(); }
  async function acceptPlan() {
    if (busy) return 0;
    const kept = plan().filter((sl) => sl.option && !left.has(sl.id));
    if (!kept.length) { toast('Keep at least one slot first.'); return 0; }
    busy = true; render();
    try {
      const { C } = J();
      const makers = { show: (sh) => ShowSyncCore.showCampaign(sh), place: (s, pid, guide) => (guide ? QuestParis.startPlace(s, pid) : QuestCore.placeQuest(s, pid)), personal: (s, k) => QuestParis.startPersonal(s, k) };
      const { result } = await QuestHud.write((s) => WP().accept(C, s, built.weekend.week, kept.map((sl) => sl.option), makers), 'Weekend planned.');
      lastAccepted = result.length;
      toast(`🗓 Weekend planned: ${result.length} quest${result.length === 1 ? '' : 's'}. The ✦ chip follows each day’s quest.`, { timeout: 3500 });
      return result.length;
    } finally { busy = false; render(); }
  }

  // ---------- the card (the tracker's panel look, beside the rail) ----------
  async function open() {
    if (!panel) {
      panel = el('div', { class: 'qh-panel wq-panel wp-panel', attrs: { role: 'dialog', 'aria-label': 'Plan my weekend' } });
      document.body.append(panel);
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', onEsc, true);
    }
    swaps = {}; left = new Set(); lastAccepted = 0;
    place(); panel.replaceChildren(el('div', { class: 'qh-body' }, el('p', { class: 'qh-empty', text: 'Looking at your weekend…' })));
    try { await load(); } catch (err) { panel?.replaceChildren(head(), el('div', { class: 'qh-body' }, el('p', { class: 'qh-empty', text: calmError(err) }))); return; }
    render();
    panel?.querySelector('.wp-accept')?.focus({ preventScroll: true });
  }
  function close() {
    if (!panel) return;
    panel.remove(); panel = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onEsc, true);
  }
  function outside(e) { if (panel && !panel.contains(e.target) && !e.target.closest?.('#menu, .qh-chip, #toasts')) close(); }
  function onEsc(e) { if (e.key === 'Escape' && panel && !document.querySelector('#menu:not([hidden])')) { e.preventDefault(); e.stopPropagation(); close(); } }
  function place() {
    const rail = document.getElementById('rail')?.getBoundingClientRect(), l = Math.round((rail?.right || 64) + 6);
    const list = document.getElementById('panel'), lr = list && list.offsetParent ? list.getBoundingClientRect() : null;
    panel.style.left = `${l}px`;
    panel.style.width = `${lr && lr.width > 120 ? Math.max(300, Math.min(340, Math.round(lr.right - l - 6))) : 320}px`;
    panel.style.bottom = '12px';
  }
  function head() {
    return el('div', { class: 'qh-head' }, el('span', { class: 'qh-pi', text: '🗓' }), el('strong', { text: 'Your weekend' }), built ? el('span', { class: 'qh-sub qh-lv', text: built.weekend.label }) : null, el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'qh-icon', text: '×', title: 'Close', attrs: { 'aria-label': 'Close' }, on: { click: () => close() } }));
  }
  const dayName = (d) => `${W().weekday(d)} ${W().parse(d).getDate()}`;
  function render() {
    if (!panel || !built) return;
    const { S } = J(), slots = plan(), done = S ? WP().planned(S, built) : new Set();
    const body = [];
    if (status) body.push(el('p', { class: 'qh-sub wp-status', text: status }));
    for (const sl of slots) body.push(slotRow(sl, done));
    const kept = slots.filter((sl) => sl.option && !left.has(sl.id)).length;
    if (!slots.some((sl) => sl.option)) body.push(el('p', { class: 'qh-empty', text: 'Nothing to plan from yet. Open the Paris map’s Shows layer once to save this week’s shows, or start the park quest in Sidequest Studio.' }));
    if (lastAccepted) body.push(el('p', { class: 'qh-sub wp-done', text: `✓ ${lastAccepted} on your week plan, with times. Click See my week to move one.` }));
    const foot = el('div', { class: 'qh-foot' },
      btn('See my week', () => { close(); return Lazy.load('weekquest').then(() => WeekQuest.open('week')); }, 'wp-week', 'The week card: your planned days, drag to move'),
      btn(busy ? 'Planning…' : `Accept plan${kept ? ` (${kept})` : ''}`, acceptPlan, 'qh-primary wp-accept', 'Turn the kept slots into quests on their days and times'));
    if (!kept || busy) foot.querySelector('.wp-accept').disabled = true;
    const focusKey = panel.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    panel.replaceChildren(head(), el('div', { class: 'qh-body' }, ...body), foot);
    if (focusKey) panel.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }
  function slotRow(sl, done) {
    const o = sl.option, off = left.has(sl.id), isIn = o && done.has(WP().itemId(o));
    if (!o) return el('div', { class: 'qh-row wp-slot empty', dataset: { slot: sl.id } }, el('span', { class: 'qh-pi', text: sl.icon }),
      el('div', { class: 'qh-row-main' }, el('span', { class: 'qh-k', text: sl.label }), el('span', { class: 'qh-sub', text: emptyWhy(sl.id) })));
    const swapB = el('button', { type: 'button', class: 'qh-btn wp-swap', text: 'Swap', dataset: { k: `swap:${sl.id}` }, title: sl.count > 1 ? `Next best option (${sl.index + 1} of ${sl.count})` : 'No other option for this slot', on: { click: (e) => { e.stopPropagation(); swap(sl.id); } } });
    if (sl.count < 2) swapB.disabled = true;
    const keepB = el('button', { type: 'button', class: `qh-btn wp-keep${off ? '' : ' on'}`, text: off ? 'Keep' : '✓ Keep', dataset: { k: `keep:${sl.id}` }, title: off ? 'Put this slot back in the plan' : 'Kept: click to leave it out of the plan', attrs: { 'aria-pressed': String(!off) }, on: { click: (e) => { e.stopPropagation(); keep(sl.id); } } });
    return el('div', { class: `qh-row wp-slot${off ? ' off' : ''}`, dataset: { slot: sl.id }, attrs: { 'aria-label': `${sl.label}: ${o.title}, ${dayName(o.day)} ${o.time}${off ? ', left out' : ''}` } },
      el('span', { class: 'qh-pi', text: sl.icon }),
      el('div', { class: 'qh-row-main' },
        el('span', { class: 'qh-k wp-when', text: `${dayName(o.day)} · ${o.time} · ${sl.label}` }, isIn ? el('span', { class: 'wp-in', text: '✓ planned', title: 'Already on your week plan' }) : null),
        el('span', { class: 'qh-row-title', text: o.title }), el('span', { class: 'qh-sub', text: o.why || '' })),
      el('div', { class: 'wp-acts' }, swapB, keepB));
  }
  function emptyWhy(id) {
    return { night: 'No show saved for this weekend. Shows come from the Paris map’s Shows layer (Shotgun / DICE).', outside: 'No free afternoon left this weekend.', nearby: 'Nothing unvisited close by.', studio: 'No free time left for a session.' }[id] || 'Nothing to propose.';
  }

  // ---------- chat (secondary): /quest weekend [accept] ----------
  async function run(rest, ctx) {
    const say = (text, actions) => (ctx?.note ? ctx.note(text, { actions, id: 'weekendplan' }) : ctx?.say ? ctx.say(text) : toast(text));
    await open(); if (!built) return;
    if (/^accept\b/i.test(String(rest || '').trim())) { const n = await acceptPlan(); return n ? `Weekend planned: ${n} quest${n === 1 ? '' : 's'} with times.` : 'Nothing to accept.'; }
    say(`Your weekend (${built.weekend.label})\n${plan().map((sl) => WP().line(sl)).join('\n')}`, [{ label: 'Accept plan', run: () => acceptPlan() }]);
  }

  return { open, close, run, swap, keep, acceptPlan, isOpen: () => Boolean(panel), state: () => ({ built, slots: plan(), swaps: { ...swaps }, left: [...left], status, lastAccepted }), _test };
})();
