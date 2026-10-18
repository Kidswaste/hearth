// (round 62, weekquest62) ✦ The week card and the week in review (lazy group 'weekquest': loads on first use — /quest week,
// /quest review, the ✦ chip's right-click menu, the Sunday-evening offer).
//   · Plan my week: a small card beside the rail (the tracker's own panel look) proposing 3–5 quests for the week from
//     what already exists: this week's shows (showsync61's cached list, nothing fetched), Paris places not yet visited
//     near where you'll be (a planned show's venue, or your "near you" spot), personal quests still open, music at the
//     park on a dry day (Open-Meteo's forecast when it answers, else a weekend afternoon). Accept one (it lands on its
//     day) or drag it onto another day; drag a planned one between days; right-click it to move or remove it. The ✦ chip
//     then follows today's planned quest. The nudge line turns on the one gentle notification (off by default).
//   · Week in review: what got done, XP, the streak of weeks with a real-life quest, the moments / proofs collected,
//     one reflection line; "Save to journal" keeps it as a week page (Sidequest Studio › Collection › Week pages).
//   · "Suggest more" is the only AI call, and only when asked: one tiny prompt to the lightest setting of your Claude.
// All reads and writes go through the tracker (QuestHud.write: QuestJournal.mutate when the Studio is open, else the
// Studio's own validated, atomic save) into Codex's journal (s.weekly); 'hearth:quests' keeps everything in step.
const WeekQuest = (() => {
  const W = WeekQuestCore, QC = QuestHudCore;
  let panel = null, mode = 'week', week = null, props = [], weather = null, weatherWhy = '', weatherAt = 0, ideas = [], busy = '', review = null, aiNote = '';
  const _test = { shows: null, weather: undefined, ask: null }; // (checks) fixtures instead of the cached list / forecast / AI
  const J = () => QuestHud.journal();
  const ICON = { show: '♫', place: '📍', park: '☀', personal: '◇', quest: '◆', idea: '✧' };
  const btn = (text, run, cls = '', title = '') => el('button', { type: 'button', class: `qh-btn ${cls}`, text, title: title || null, on: { click: (e) => { e.stopPropagation(); Promise.resolve(run(e)).catch((err) => toast(calmError(err), { type: 'error' })); } } });
  const dayName = (d) => `${W.weekday(d)} ${W.parse(d).getDate()}`;
  async function ready() { await QuestHud.refresh(); const { C, S, status } = J(); if (status !== 'ok' || !C || !S) throw Error(status === 'missing' ? 'No quest journal yet. Open Sidequest Studio to start your first quest.' : 'Your quest journal could not be read just now. Nothing was changed.'); return { C, S }; }
  // A change through the tracker, checked against s.weekly's own shape before it saves
  const save = (fn, message) => QuestHud.write((s) => { const r = fn(s); W.checkWeekly(s.weekly); return r; }, message);

  // ---------- what the week card proposes ----------
  async function sources() {
    let shows = _test.shows;
    if (!shows) { try { const r = await window.hub?.shows?.get(); shows = r?.ok && r.value?.enabled !== false ? r.value.shows || [] : []; } catch { shows = []; } }
    if (_test.weather !== undefined) { weather = _test.weather; weatherWhy = weather ? '' : 'no forecast'; }
    else if (weather === null && Date.now() - weatherAt > 30 * 60000) { weatherAt = Date.now(); try { const r = await window.hub?.weekquest?.weather(); weather = r?.ok ? r.days : null; weatherWhy = r?.ok ? '' : r?.why || 'no forecast'; } catch { weather = null; weatherWhy = 'no forecast'; } }
    return shows;
  }
  function anchor(S) {
    const near = QuestHud.state().prefs.near;
    const p = near && near !== 'off' && near !== 'gps' ? S.atlas?.places.find((x) => x.id === near) : null;
    return p ? { lat: p.lat, lon: p.lon, name: p.name } : null;
  }
  async function propose() {
    const { C, S } = await ready();
    await Lazy.load('questjournal'); // QuestParis's places / personal quests and ShowSyncCore's show quests (the Studio isn't opened)
    const wk = W.planWeek(Date.now()); week = wk;
    const shows = await sources();
    const list = W.candidates({ C, s: S, shows, guide: QuestParis.guide, personal: QuestParis.personal, weather, anchor: anchor(S), week: wk });
    props = W.propose([...list, ...ideas], wk, W.planOf(S, wk.week)?.items || []);
    return props;
  }
  const makers = () => ({
    show: (sh) => ShowSyncCore.showCampaign(sh),
    place: (s, pid, guide) => (guide ? QuestParis.startPlace(s, pid) : QuestCore.placeQuest(s, pid)),
    personal: (s, k) => QuestParis.startPersonal(s, k),
  });
  async function accept(sug, day = sug.day) {
    if (!week) await propose();
    const { C } = J();
    const { result } = await save((s) => W.accept(C, s, week.week, sug, day, makers()), `Planned for ${W.weekday(day)}.`);
    props = props.filter((x) => x.id !== sug.id); ideas = ideas.filter((x) => x.id !== sug.id);
    render();
    return result;
  }
  async function acceptAll() { const list = [...props]; for (const x of list) await accept(x); return list.length; }
  const move = (id, day) => save((s) => W.move(s, week.week, id, day), `Moved to ${W.weekday(day)}.`).then(render);
  const remove = (id) => save((s) => W.drop(s, week.week, id), 'Taken off the week plan. The quest itself stays in your journal.').then(() => propose()).then(render);
  async function setNudge(o) { const { result } = await save((s) => W.setNudge(s, o), o.on === false ? 'Nudges off.' : 'Nudge saved.'); WeekNudge.arm(); render(); return result; }

  // ---------- "suggest more": the only AI call, only when asked ----------
  async function suggestMore() {
    if (busy) return; busy = 'ai'; aiNote = 'Asking your AI for three more…'; render();
    try {
      const { S } = J(), have = [...(W.planOf(S, week.week)?.items || []), ...props];
      const prompt = W.askPrompt(week.week, have, (S.atlas?.places || []).filter((p) => !p.visitedAt).map((p) => p.name));
      let r;
      if (_test.ask) r = await _test.ask(prompt);
      else {
        const agent = typeof H !== 'undefined' ? H.claudeAgent?.() || (H.agents || []).find((a) => a.native) : null;
        if (!agent || !window.hub?.askOnce) throw Error('No AI to ask here.');
        r = await window.hub.askOnce({ agentId: agent.id, text: prompt, options: { lean: true, helper: true, effort: 'low' } });
      }
      if (!r?.ok) throw Error(`The AI couldn't answer: ${String(r?.error || 'no answer').slice(0, 120)}`);
      const more = W.parseAsk(r.text).filter((x) => !props.some((p) => p.id === x.id));
      ideas.push(...more);
      const used = r.usage ? (r.usage.input || 0) + (r.usage.output || 0) : 0;
      aiNote = `${more.length ? `✧ ${more.length} more idea${more.length === 1 ? '' : 's'}` : 'No new ideas'}${used ? ` · ${used.toLocaleString()} tokens` : ''}`;
      await propose();
    } catch (err) { aiNote = calmError(err); } finally { busy = ''; render(); }
  }

  // ---------- the week in review ----------
  async function computeReview(last = false) { const { C, S } = await ready(); review = W.review(C, S, W.reviewWeek(Date.now(), last)); return review; }
  async function saveReview(reflection) {
    if (!review) await computeReview();
    const { result } = await save((s) => W.saveReview(s, review, reflection), 'Week page saved in your journal.');
    review = { ...review, saved: result };
    render(); return result;
  }

  // ---------- the panel (the tracker's panel look, beside the rail over the chats list) ----------
  async function open(m = 'week', o = {}) {
    mode = m;
    if (!panel) {
      panel = el('div', { class: 'qh-panel wq-panel', attrs: { role: 'dialog', 'aria-label': m === 'review' ? 'Week in review' : 'Plan my week' } });
      document.body.append(panel);
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', onEsc, true);
    }
    panel.setAttribute('aria-label', m === 'review' ? 'Week in review' : 'Plan my week');
    place(); panel.replaceChildren(el('div', { class: 'qh-body' }, el('p', { class: 'qh-empty', text: 'Opening your week…' })));
    try { if (m === 'review') await computeReview(o.last); else await propose(); } catch (err) { panel?.replaceChildren(head(m === 'review' ? 'Week in review' : 'Your week'), el('div', { class: 'qh-body' }, el('p', { class: 'qh-empty', text: calmError(err) }))); return; }
    render();
    panel?.querySelector('.wq-accept, .wq-reflect input, .qh-btn')?.focus({ preventScroll: true });
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
    const rail = document.getElementById('rail')?.getBoundingClientRect(), left = Math.round((rail?.right || 64) + 6);
    const list = document.getElementById('panel'), lr = list && list.offsetParent ? list.getBoundingClientRect() : null;
    panel.style.left = `${left}px`;
    panel.style.width = `${lr && lr.width > 120 ? Math.max(300, Math.min(340, Math.round(lr.right - left - 6))) : 320}px`;
    panel.style.bottom = '12px';
  }
  function head(title, sub = '') {
    return el('div', { class: 'qh-head' }, el('span', { class: 'qh-pi', text: '✦' }), el('strong', { text: title }), sub ? el('span', { class: 'qh-sub qh-lv', text: sub }) : null, el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'qh-icon', text: '⋯', title: 'More', attrs: { 'aria-label': 'More week options' }, on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 220, r.bottom + 4, menuItems()); } } }),
      el('button', { type: 'button', class: 'qh-icon', text: '×', title: 'Close', attrs: { 'aria-label': 'Close' }, on: { click: () => close() } }));
  }
  function menuItems() {
    return mode === 'review'
      ? [{ label: 'Plan my week…', action: () => open('week') }, { label: 'Last week instead', action: () => open('review', { last: true }) }]
      : [{ label: 'Suggest more (asks your AI once)', action: () => suggestMore() }, { label: 'Week in review…', action: () => open('review') }, { label: 'Open Sidequest Studio', action: () => { close(); QuestHud.openStudio(); } }];
  }
  function render() {
    if (!panel) return;
    if (mode === 'review') return renderReview();
    const { C, S } = J(); if (!S || !week) return;
    const planned = W.planOf(S, week.week)?.items || [];
    const grid = el('div', { class: 'wq-days', attrs: { role: 'list', 'aria-label': 'Days of the week' } }, ...week.days.map((d) => dayCell(C, S, d, planned.filter((x) => x.day === d))));
    const body = [grid];
    if (props.length) {
      body.push(el('div', { class: 'qh-sec wq-sec' }, el('span', { text: 'Proposed for you' }), props.length > 1 ? btn('Accept all', acceptAll, 'wq-all', 'Put every proposed quest on its day') : null));
      body.push(...props.map(propRow));
    } else body.push(el('p', { class: 'qh-empty', text: planned.length ? 'Your week is planned. Drag a quest to another day, or right-click it.' : 'Nothing to propose right now: no shows cached, places visited, personal quests done. Try “Suggest more” in ⋯.' }));
    if (aiNote) body.push(el('p', { class: 'qh-sub wq-ai', text: aiNote }));
    body.push(nudgeRow(S));
    const foot = el('div', { class: 'qh-foot' }, btn(busy === 'ai' ? 'Asking…' : 'Suggest more', suggestMore, 'wq-more', 'Three more ideas from your AI (one small question, only now)'), btn('Done', () => close(), 'qh-primary'));
    const focusKey = panel.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    panel.replaceChildren(head('Your week', W.label(week.week)), el('div', { class: 'qh-body' }, ...body), foot);
    if (focusKey) panel.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }
  function dayCell(C, S, d, items) {
    const past = d < week.from, today = d === week.today;
    const cell = el('div', { class: `wq-day${past ? ' past' : ''}${today ? ' today' : ''}`, dataset: { day: d }, attrs: { role: 'listitem', 'aria-label': `${dayName(d)}${today ? ' (today)' : ''}: ${items.length ? items.map((x) => x.title).join(', ') : 'free'}` } },
      el('span', { class: 'wq-dname', text: W.weekday(d) }), el('span', { class: 'wq-dnum', text: String(W.parse(d).getDate()) }), ...items.map((it) => chipFor(C, S, it)));
    if (!past) {
      cell.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/x-weekquest')) { e.preventDefault(); cell.classList.add('over'); } });
      cell.addEventListener('dragleave', () => cell.classList.remove('over'));
      cell.addEventListener('drop', (e) => { cell.classList.remove('over'); const raw = e.dataTransfer?.getData('text/x-weekquest'); if (!raw) return; e.preventDefault(); dropOn(raw, d).catch((err) => toast(calmError(err), { type: 'error' })); });
    }
    return cell;
  }
  async function dropOn(raw, day) {
    const [kind, id] = raw.split('\n');
    if (kind === 'prop') { const sug = props.find((x) => x.id === id); if (sug) return accept(sug, day); }
    if (kind === 'item') return move(id, day);
  }
  function chipFor(C, S, it) {
    const q = W.questOf(C, S, it), done = !q;
    const chip = el('button', { type: 'button', class: `wq-chip${done ? ' done' : ''}`, draggable: true, dataset: { k: `item:${it.id}`, item: it.id }, title: `${it.title}${q ? ` · next: ${q.title}` : ' · done'} — drag to another day, right-click for more`,
      attrs: { 'aria-label': `${it.title} on ${dayName(it.day)}${done ? ', done' : ''}` }, on: { click: () => { if (q) { QuestHud.pin(q.id); toast(`✦ Following: ${q.title}`, { timeout: 2000 }); } } } },
    el('span', { class: 'wq-ci', text: done ? '✓' : ICON[it.kind] || '◆' }), el('span', { class: 'wq-ct', text: it.title }));
    chip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-weekquest', `item\n${it.id}`); e.dataTransfer.effectAllowed = 'move'; });
    chip.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [
      { label: 'Move to…', items: week.days.filter((d) => d >= week.from && d !== it.day).map((d) => ({ label: dayName(d), action: () => move(it.id, d) })) },
      ...(q ? [{ label: 'Follow it in the ✦ chip now', action: () => QuestHud.pin(q.id) }] : []),
      { label: 'Take it off the week', action: () => remove(it.id) },
    ]); });
    return chip;
  }
  function propRow(x) {
    const row = el('div', { class: 'qh-row wq-prop', draggable: true, dataset: { prop: x.id } },
      el('span', { class: 'qh-pi', text: ICON[x.kind] || '◆' }),
      el('div', { class: 'qh-row-main' }, el('span', { class: 'qh-row-title', text: x.title }), el('span', { class: 'qh-sub', text: x.why || '' })),
      el('span', { class: 'wq-when', text: W.weekday(x.day) }),
      el('button', { type: 'button', class: 'qh-btn wq-accept', text: 'Accept', dataset: { k: `accept:${x.id}` }, title: `Put it on ${dayName(x.day)} (or drag it onto another day)`, on: { click: (e) => { e.stopPropagation(); accept(x).catch((err) => toast(calmError(err), { type: 'error' })); } } }));
    row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-weekquest', `prop\n${x.id}`); e.dataTransfer.effectAllowed = 'copyMove'; });
    return row;
  }
  function nudgeRow(S) {
    const n = W.read(S).nudge;
    const sel = el('select', { class: 'wq-time', attrs: { 'aria-label': 'Nudge time' }, on: { change: () => setNudge({ time: sel.value, on: true }).catch((err) => toast(calmError(err), { type: 'error' })) } });
    for (let h = 7; h <= 22; h++) for (const m of ['00', '30']) { const t = `${String(h).padStart(2, '0')}:${m}`; if (t > '22:00') continue; sel.append(el('option', { value: t, text: t })); }
    sel.value = n.time;
    const box = el('input', { type: 'checkbox', class: 'wq-nudge', checked: n.on, attrs: { 'aria-label': 'Nudge me on planned days' }, on: { change: () => setNudge({ on: box.checked }).catch((err) => toast(calmError(err), { type: 'error' })) } });
    return el('label', { class: 'wq-nudge-row', title: 'One notification on a planned day, never more than once a day; your computer’s Focus / Do Not Disturb holds it' }, box, el('span', { text: 'Nudge me on planned days at' }), sel);
  }
  function renderReview() {
    const rv = review; if (!rv) return;
    const stats = el('div', { class: 'wq-stats' },
      stat(String(rv.done.length), rv.done.length === 1 ? 'quest done' : 'quests done'), stat(`+${rv.xp}`, 'XP'),
      stat(String(rv.streak), rv.streak === 1 ? 'week streak' : 'week streak', rv.streak ? '' : rv.before ? `Your ${rv.before}-week streak needs one real-life quest this week` : 'Weeks in a row with at least one real-life quest'));
    const body = [stats];
    if (rv.done.length) body.push(el('div', { class: 'qh-sec', text: 'Done' }), ...rv.done.map((d) => el('div', { class: 'qh-row' }, el('span', { class: 'qh-pi', text: d.life ? '☀' : '✓' }), el('div', { class: 'qh-row-main' }, el('span', { class: 'qh-row-title', text: d.title }), el('span', { class: 'qh-sub', text: `${W.weekday(W.key(new Date(d.at)))} · ${d.xp} XP${d.life ? ' · out in the world' : ''}` })))));
    else body.push(el('p', { class: 'qh-empty', text: 'No quest finished this week yet. One small step still counts.' }));
    if (rv.planned.length) body.push(el('p', { class: 'qh-sub', text: `Planned: ${rv.planned.filter((p) => p.done).length} of ${rv.planned.length} done` }));
    if (rv.moments.length) body.push(el('div', { class: 'qh-sec', text: 'Moments you kept' }), el('div', { class: 'wq-moments' }, ...rv.moments.map(moment)));
    const input = el('input', { type: 'text', placeholder: 'One line…', value: rv.saved?.reflection || '', attrs: { 'aria-label': rv.prompt, maxlength: '300' } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveReview(input.value).catch((err) => toast(calmError(err), { type: 'error' })); } });
    body.push(el('label', { class: 'wq-reflect' }, el('span', { class: 'qh-k', text: rv.prompt }), input));
    if (rv.saved) body.push(el('p', { class: 'qh-sub wq-saved', text: 'Saved in your journal: Sidequest Studio › Collection › Week pages.' }));
    const foot = el('div', { class: 'qh-foot' }, btn('Plan next week', () => open('week'), '', 'The week card'), btn(rv.saved ? 'Save again' : 'Save to journal', () => saveReview(input.value), 'qh-primary wq-save'));
    panel.replaceChildren(head('Week in review', rv.label), el('div', { class: 'qh-body' }, ...body), foot);
  }
  const stat = (n, what, title = '') => el('div', { class: 'wq-stat', title: title || null }, el('b', { text: n }), el('span', { class: 'qh-sub', text: what }));
  function moment(m) {
    const img = m.images?.[0];
    return el('div', { class: 'wq-moment', title: `${m.title} · ${m.what}` },
      img ? el('img', { attrs: { src: WinMac.fileUrl(img), alt: '', loading: 'lazy', draggable: 'false' } }) : el('span', { class: 'wq-mi', text: m.type === 'chat' ? '💬' : '✎' }),
      el('div', {}, el('strong', { text: m.what }), el('span', { class: 'qh-sub', text: m.note || m.title })));
  }

  // ---------- chat: /quest week | /quest review (through the tracker's one /quest) ----------
  async function run(sub, rest, ctx) {
    const say = (text, actions) => (ctx?.note ? ctx.note(text, { actions, id: 'weekquest' }) : ctx?.say ? ctx.say(text) : toast(text));
    const [w0, ...more] = String(rest || '').trim().split(/\s+/); const word = (w0 || '').toLowerCase(), arg = more.join(' ');
    if (sub === 'review') {
      if (word === 'save') { await computeReview(); await saveReview(arg); return `Week page saved: ${W.reviewLine(review)}`; }
      await open('review', { last: word === 'last' });
      if (!review) return;
      say(W.reviewLine(review), [{ label: 'Save to journal', run: () => saveReview() }]);
      return;
    }
    if (word === 'nudge') {
      const a = arg.toLowerCase(); await ready(); if (!week) await propose();
      if (a === 'off') { await setNudge({ on: false }); return 'Week nudges off.'; }
      const t = /^\d{1,2}:\d{2}$/.test(a) ? a.padStart(5, '0') : null;
      const n = await setNudge(t ? { on: true, time: t } : { on: true });
      return `Nudge on: one notification on planned days at ${n.time} (never twice a day; your computer's Focus holds it).`;
    }
    if (word === 'clear') { await propose(); const ids = (W.planOf(J().S, week.week)?.items || []).map((x) => x.id); for (const id of ids) await save((s) => W.drop(s, week.week, id), 'Week plan cleared.'); return 'This week\'s plan is cleared (the quests stay in your journal).'; }
    if (word === 'suggest' || word === 'more') { if (!panel) await open('week'); await suggestMore(); return aiNote; }
    if (word === 'accept') {
      await propose();
      const n = Number(arg); const list = arg && arg !== 'all' && Number.isInteger(n) ? [props[n - 1]].filter(Boolean) : [...props];
      if (!list.length) return 'Nothing to accept.';
      for (const x of list) await accept(x);
      return `Planned: ${list.map((x) => `${x.title} (${W.weekday(x.day)})`).join(' · ')}`;
    }
    await open('week');
    if (!week) return;
    const planned = W.planOf(J().S, week.week)?.items || [];
    const lines = [...planned.map((x) => `✓ ${W.weekday(x.day)} · ${x.title}`), ...props.map((x, i) => `${i + 1}. ${W.weekday(x.day)} · ${x.title}${x.why ? ` — ${x.why}` : ''}`)];
    say(`Week of ${W.label(week.week)}${lines.length ? `\n${lines.join('\n')}` : ': nothing to propose yet.'}`, props.length ? [{ label: 'Accept all', run: () => acceptAll() }] : []);
  }

  return { open, close, run, propose, accept, acceptAll, move, remove, setNudge, suggestMore, computeReview, saveReview, isOpen: () => Boolean(panel), state: () => ({ mode, week, props: props.slice(), review, weather, aiNote }), _test };
})();
