// (round 71, studiohours71) 🎛 Studio hours, in the ✦ quest tracker (docs/upgrades/studiohours71.md).
//   · One small row in the tracker's panel: "This week: 3 h 20 making music" with a 7-day mini bar (Mon → Sun) and,
//     when a weekly goal is set, a soft ring instead of the 🎛. Click → the card.
//   · The card (the tracker's panel look, beside the rail): this week by day, the last 8 weeks, longest session,
//     Serum 2 vs Vital, sketches saved, loops trimmed, park sessions; "Weekly goal" (off by default) set by clicking a
//     chip; "Sessions in the Sound desk ›".
//   · Sunday from 18:00 (Paris), at most one gentle note through Hints: "You made music 3 times this week 🎛", never
//     when there were none. No timer: weekquest-nudge.js asks on Hearth opening / coming to the front (Sunday evening only).
// Reads only: kv 'music-sessions' (bouncelog66; a failed read keeps what we had, nothing is ever written there), the
// live session when the Sound desk is loaded (BounceLog.session()), the trimmed loops' cards (hub.parkSong.list, only
// when the card opens). The goal is a per-computer preference (store 'studiohours.prefs').
// Costs nothing while idle: this group loads when the tracker's panel opens (or Sunday evening's check), no timers.
const StudioHours = (() => {
  const K = StudioHoursCore, KV = 'music-sessions', PREFS = 'studiohours.prefs', NOTED = 'studiohours.sunday';
  let rows = null; // the counted rows as last read (null: never read)
  let readErr = '', loops = [], panel = null, picking = false, now = () => Date.now(); // now: (checks) a clock that can be set
  const prefs = () => ({ goal: 0, ...(store.get(PREFS, {}) || {}) });
  const hud = () => (window.Lazy?.isIn('questhud') && typeof QuestHud !== 'undefined' ? QuestHud : null); // never loads the tracker by itself
  const goal = () => { const g = Math.round(Number(prefs().goal) || 0); return g > 0 ? g : 0; };
  // the live session (the desk's own clock), only when its group is already in: never loads the Sound desk
  function live() {
    try { if (!window.Lazy?.isIn('creative') || typeof BounceLog === 'undefined' || typeof BounceLogCore === 'undefined') return null; const st = BounceLog.session(); return st && st.active > 0 ? BounceLogCore.entry(st, now()) : null; } catch { return null; }
  }
  async function read() {
    let r; try { r = await window.hub.kvGet(KV, null, { status: true }); } catch (err) { r = { state: 'unreadable', error: err.message }; }
    if (r?.state === 'ok' || r?.state === 'missing') { rows = K.rowsOf(r.state === 'ok' ? r.value : null); readErr = ''; }
    else readErr = 'Your sessions could not be read just now. Nothing was changed.'; // a failed read is never "no music": keep what we had
    return rows;
  }
  const counted = () => (rows ? K.rowsOf(rows, live()) : null);
  const sum = () => { const c = counted(); return c ? K.summary(c, now(), { goal: goal(), loops }) : null; };

  // ---------- the tracker row ----------
  // the ring: an SVG circle whose stroke shows the week's share of the goal (soft colours, no animation)
  function ring(frac, size = 18) {
    const ns = 'http://www.w3.org/2000/svg', r = size / 2 - 2, c = 2 * Math.PI * r, svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('class', 'sh-ring'); svg.setAttribute('aria-hidden', 'true');
    const a = document.createElementNS(ns, 'circle'), b = document.createElementNS(ns, 'circle');
    for (const x of [a, b]) { x.setAttribute('cx', size / 2); x.setAttribute('cy', size / 2); x.setAttribute('r', r); }
    a.setAttribute('class', 'sh-ring-bg'); b.setAttribute('class', 'sh-ring-fg');
    b.setAttribute('stroke-dasharray', `${(c * frac).toFixed(2)} ${c.toFixed(2)}`); b.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
    svg.append(a, b); return svg;
  }
  function mini(days) {
    const top = Math.max(60, ...days.map((d) => d.minutes));
    return el('span', { class: 'sh-mini', attrs: { 'aria-hidden': 'true' } }, ...days.map((d) => el('i', { class: `${d.today ? 'today' : ''}${d.later ? ' later' : ''}${d.minutes > 0 ? '' : ' zero'}`, style: { height: `${d.minutes > 0 ? Math.max(12, Math.round(d.minutes / top * 100)) : 0}%` } })));
  }
  /** the tracker's row (QuestHud renders it right after "This week"); nothing until the first read */
  function hudRows() {
    const s = sum(); if (!s) return [];
    const words = K.rowText(s), g = s.goal;
    const b = el('button', { type: 'button', class: 'qh-row sh-hud', dataset: { k: 'studiohours' }, title: 'Studio hours: your music time by day and by week, longest session, Serum 2 vs Vital, sketches, loops, a weekly goal if you want one',
      attrs: { 'aria-label': `${words}${g ? ` · weekly goal ${K.clock(g.minutes)}${g.reached ? ', reached' : ''}` : ''} · open Studio hours` }, on: { click: (e) => { e.stopPropagation(); open().catch((err) => toast(calmError(err), { type: 'error' })); } } },
      g ? el('span', { class: 'qh-pi sh-pi' }, ring(g.frac)) : el('span', { class: 'qh-pi', text: '🎛' }),
      el('span', { class: 'qh-row-main' }, el('span', { class: 'qh-row-title', text: words }), el('span', { class: 'qh-sub', text: g ? `Studio hours › · ${g.line}` : 'Studio hours ›' })),
      s.any ? mini(s.week.days) : null);
    return [b];
  }
  // the tracker's panel opened: read fresh, then let it repaint with the row
  async function refresh() { const sig = JSON.stringify(sum()); await read(); if (JSON.stringify(sum()) !== sig) hud()?.repaint(); if (panel) render(); }

  // ---------- the card ----------
  async function open() {
    hud()?.close();
    if (!panel) {
      panel = el('div', { class: 'qh-panel sh-panel', attrs: { role: 'dialog', 'aria-label': 'Studio hours' } });
      document.body.append(panel);
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', onEsc, true);
    }
    picking = false; place();
    if (!rows) panel.replaceChildren(head(), el('div', { class: 'qh-body' }, el('p', { class: 'qh-empty', text: 'Adding up your sessions…' })));
    await read();
    try { const r = await window.hub?.parkSong?.list?.(); loops = (r?.takes || []).filter((t) => t?.kind === 'sketch-loop'); } catch { /* the loops count is a convenience: 0 when the folder can't be listed */ }
    render();
    panel?.querySelector('.sh-sessions, .qh-icon')?.focus({ preventScroll: true });
    return panel ? `Studio hours: ${K.rowText(sum() || K.summary([], now()))}.` : '';
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
  const btn = (text, run, cls = '', title = '', k = '') => el('button', { type: 'button', class: `qh-btn ${cls}`, text, title: title || null, dataset: k ? { k } : {}, on: { click: (e) => { e.stopPropagation(); Promise.resolve(run(e)).catch((err) => toast(calmError(err), { type: 'error' })); } } });
  function head(s) {
    return el('div', { class: 'qh-head' }, el('span', { class: 'qh-pi', text: '🎛' }), el('strong', { text: 'Studio hours' }), s ? el('span', { class: 'qh-sub qh-lv', text: `Week of ${s.week.label}` }) : null, el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'qh-icon', text: '×', title: 'Close', dataset: { k: 'close' }, attrs: { 'aria-label': 'Close Studio hours' }, on: { click: () => close() } }));
  }
  function bars(items, cls, label) {
    const top = Math.max(60, ...items.map((x) => x.minutes));
    return el('div', { class: `sh-bars ${cls}`, attrs: { role: 'img', 'aria-label': label } }, ...items.map((x) => el('div', { class: `sh-col${x.current || x.today ? ' now' : ''}${x.later ? ' later' : ''}`, title: `${x.title}: ${x.minutes >= 1 ? K.clock(x.minutes) : 'no music'}` },
      el('span', { class: 'sh-track' }, el('i', { style: { height: `${x.minutes > 0 ? Math.max(4, Math.round(x.minutes / top * 100)) : 0}%` } })), el('span', { class: 'sh-lab', text: x.lab }))));
  }
  function render() {
    if (!panel) return;
    const s = sum(), focusKey = panel.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    const body = [];
    if (readErr) body.push(el('p', { class: 'qh-sub sh-err', text: readErr }));
    if (!s) { panel.replaceChildren(head(), el('div', { class: 'qh-body' }, ...body)); return; }
    const g = s.goal;
    // this week: the total, the ring when there's a goal, then the 7 days
    body.push(el('div', { class: 'sh-top' }, g ? el('span', { class: 'sh-big-ring' }, ring(g.frac, 40)) : null,
      el('div', {}, el('strong', { class: 'sh-total', text: s.week.minutes >= 1 ? K.clock(s.week.minutes) : 'New week, fresh start' }),
        el('div', { class: 'qh-sub', text: s.week.minutes >= 1 ? `making music this week · ${s.week.sessions} session${s.week.sessions === 1 ? '' : 's'}` : s.any ? 'Your music time this week shows here' : 'Play in the Sound desk for 10 minutes and your time shows here' }),
        g ? el('div', { class: `qh-sub sh-goal-line${g.reached ? ' on' : ''}`, text: g.line }) : null)));
    body.push(bars(s.week.days.map((d) => ({ ...d, lab: d.name[0], title: K.dayName(d.day) })), 'sh-days', `This week by day: ${s.week.days.map((d) => `${d.name} ${K.clock(d.minutes)}`).join(', ')}`));
    body.push(el('div', { class: 'qh-sec', text: 'Last 8 weeks' }));
    body.push(bars(s.weeks.map((w) => ({ ...w, lab: w.label, title: `Week of ${w.label}` })), 'sh-weeks', `Last 8 weeks: ${s.weeks.map((w) => `week of ${w.label} ${K.clock(w.minutes)}`).join(', ')}`));
    // the numbers: this week and the 8 weeks side by side
    const stat = (name, a, b) => [el('span', { class: 'sh-k', text: name }), el('b', { text: String(a) }), el('b', { text: String(b) })];
    body.push(el('div', { class: 'sh-stats', attrs: { role: 'table', 'aria-label': 'This week and the last 8 weeks' } },
      el('span'), el('span', { class: 'sh-h', text: 'This week' }), el('span', { class: 'sh-h', text: '8 weeks' }),
      ...stat('Time', K.clock(s.week.minutes), K.clock(s.all.minutes)), ...stat('Sessions', s.week.sessions, s.all.sessions),
      ...stat('Sketches saved', s.week.sketches, s.all.sketches), ...stat('Loops trimmed', s.week.loops, s.all.loops), ...stat('Park sessions', s.week.park, s.all.park)));
    const inst = s.instruments.filter((x) => x.minutes >= 1).slice(0, 2);
    body.push(el('div', { class: 'sh-facts' },
      el('div', {}, el('span', { class: 'sh-k', text: 'Longest session' }), el('span', { text: s.longest ? `${K.clock(s.longest.minutes)} · ${s.longest.name}` : '—' })),
      el('div', {}, el('span', { class: 'sh-k', text: 'Most used' }), el('span', { class: 'sh-inst', text: inst.length ? inst.map((x) => `${x.name} ${K.clock(x.minutes)}`).join(' · ') : '—' }))));
    // the weekly goal: off by default, set by clicking a chip
    const goalRow = el('div', { class: 'sh-goal' }, el('span', { class: 'sh-k', text: 'Weekly goal' }),
      btn(g ? `${K.clock(g.minutes)} · Change` : 'Off · Set one', () => { picking = !picking; render(); }, 'sh-goal-btn', 'A soft ring in the tracker. A missed week is never pointed out: the next one just starts fresh.', 'goal'));
    body.push(goalRow);
    if (picking) body.push(el('div', { class: 'sh-chips', attrs: { role: 'group', 'aria-label': 'Weekly goal' } }, ...K.GOALS.map((m) => {
      const on = m === (g?.minutes || 0), b = btn(m ? K.clock(m) : 'Off', () => setGoal(m), `sh-chip${on ? ' on' : ''}`, m ? `A ${K.clock(m)} weekly goal` : 'No goal', `goal:${m}`);
      b.setAttribute('aria-pressed', String(on)); return b;
    })));
    const foot = el('div', { class: 'qh-foot' }, btn('Sessions in the Sound desk ›', sessions, 'qh-primary sh-sessions', 'Your sessions with their sketches (Creative Playground › Serum 2 / Vital › Sessions)', 'sessions'));
    panel.replaceChildren(head(s), el('div', { class: 'qh-body' }, ...body), foot);
    if (focusKey) panel.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }
  function setGoal(m) {
    const p = prefs(); p.goal = Math.max(0, Math.round(Number(m) || 0)); store.set(PREFS, p); picking = false; render();
    hud()?.repaint();
    return p.goal ? `Weekly goal: ${K.clock(p.goal)}.` : 'Weekly goal off.';
  }
  async function sessions() { close(); await Lazy.load('creative'); return BounceLog.run(''); }

  // ---------- Sunday evening: one kind note, never about zero ----------
  async function sunday() {
    const day = K.sundayEvening(now()); if (!day || store.get(NOTED, '') === day) return null;
    const list = await read(); if (!list) return null;
    const note = K.sundayNote(K.rowsOf(list, live()), now()); if (!note) return null;
    const show = () => { store.set(NOTED, day); return toast(note.text, { timeout: 12000, action: { label: 'Studio hours', fn: () => open() } }); };
    if (window.Hints) Hints.offer({ id: `studiohours:sunday:${note.week}`, rank: 30, ttl: 3 * 3600e3, show }); else show();
    return note.text;
  }

  // ---------- secondary: chat and Ctrl/⌘+K (the click is the way in) ----------
  async function run(args = '') {
    const w = String(args).trim().toLowerCase();
    const m = w.match(/^goal\s*(off|\d+(?:[.,]\d+)?)\s*h?$/);
    if (m) return setGoal(m[1] === 'off' ? 0 : Math.round(Number(m[1].replace(',', '.')) * 60));
    return open();
  }
  if (typeof Commands !== 'undefined' && !Commands.get('hours')) {
    Commands.register({ name: 'hours', args: '[goal 4 | goal off]', area: 'Create', desc: 'Studio hours: your music time this week and the last 8 weeks (the ✦ tracker › This week), an optional weekly goal', run: (a, ctx) => run(a).then((t) => t && ctx?.say?.(t)),
      complete: (a) => [['goal 4', 'a 4-hour weekly goal'], ['goal off', 'no weekly goal']].filter(([v]) => v.startsWith(String(a || '').trim().toLowerCase())).map(([value, hint]) => ({ value, hint })),
      examples: ['/hours', '/hours goal 4', '/hours goal off'], keywords: 'studio hours music time week serum vital sketches loops park sessions goal ring' });
  }
  try { AppUI.addAction?.('Quest: my studio hours', () => open().catch((err) => toast(calmError(err), { type: 'error' }))); } catch { /* no palette */ }

  return { hudRows, refresh, open, close, isOpen: () => !!panel, setGoal, sunday, run, summary: sum, _test: { clock(fn) { now = fn || (() => Date.now()); }, read, panel: () => panel } };
})();
