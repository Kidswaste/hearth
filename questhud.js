// (round 61, questhud61) ✦ The quest tracker: one small chip in the rail (above Usage), on every screen — chats, the
// Lab, any tool — showing the quest you're on: its path icon, where you are (2/5) and a thin progress bar. Hover: the
// quest and its next step. Click (or Ctrl/⌘+Shift+O): a small panel with the quest's two steps to check off (the first
// move; the finish line, which opens your proof in Sidequest Studio when it needs one), your other active quests,
// today's picks, "near you" when a quest has a Paris map pin and you've opted in to location, and Open Sidequest
// Studio. Chat: /quest, /quest next, /quest done, /quest track <name> (+ picks, near, open, studio, hud on|off).
//
// One store: Codex's quest journal (kv 'quest-journal'), read and changed only through Codex's QuestCore rules. When
// the Studio is open it owns the journal in memory, so changes go through QuestJournal.mutate (the Studio repaints);
// otherwise the HUD does the Studio's own steps (read → validate → change → validate → save). Both sides announce a
// change with the 'hearth:quests' event (detail: { state, source }), so the chip and the Studio follow each other live.
// Costs nothing while idle: no timers, no polling, no animation; it repaints only when a quest changes (and compares
// before writing). No journal yet → no chip, and QuestCore isn't even loaded. Not in the ▶ Play window (its own window).
const QuestHud = (() => {
  const KEY = 'quest-journal', PREFS = 'questhud.prefs', HOTKEY = 'Ctrl/⌘+Shift+O';
  const QC = QuestHudCore;
  let C = null; // Codex's QuestCore, loaded on first need
  let S = null; // the journal as last read / announced
  let status = 'unknown'; // unknown | missing | ok | unreadable
  let prefs = { hidden: false, pin: null, near: 'off', ...store.get(PREFS, {}) }; // near: 'off' | 'gps' | a map place id
  const savePrefs = () => store.set(PREFS, prefs);
  let chip = null, peek = null, panel = null, lastSig = '', peekSig = '', here = null, hereErr = '';
  let chain = Promise.resolve();
  const key = () => WinMac.keyLabel(HOTKEY);

  // ---------- reading / writing Codex's journal ----------
  async function core() { if (!C) { await Lazy.load('questcore'); C = window.QuestCore; } return C; }
  // The Studio holds the journal (mounted and loaded): its copy is the live one
  const studio = () => (window.Lazy?.isIn('questjournal') && typeof QuestJournal !== 'undefined' && QuestJournal.ready?.() ? QuestJournal : null);
  async function read() {
    const st = studio();
    if (st) { await core(); S = st.snapshot(); status = 'ok'; return; }
    let r; try { r = await window.hub.kvGet(KEY, null, { status: true }); } catch (err) { r = { state: 'unreadable', error: err.message }; }
    if (r?.state === 'missing') { status = 'missing'; S = null; return; }
    if (r?.state !== 'ok') { status = S ? 'ok' : 'unreadable'; return; } // a failed read is never "empty": keep what we had
    await core();
    try { S = C.upgrade(C.validate(r.value)); status = 'ok'; } catch { status = S ? 'ok' : 'unreadable'; }
  }
  // One change at a time. fn(draft) uses QuestCore's own functions (startSmall, complete, choose…).
  function write(fn, message) {
    const task = chain.catch(() => {}).then(async () => {
      await core();
      const st = studio();
      if (st) { const before = st.snapshot(); const result = await st.mutate(fn, message); S = st.snapshot(); status = 'ok'; paint(); return { before, result, after: S }; }
      const r = await window.hub.kvGet(KEY, null, { status: true });
      let base;
      if (r?.state === 'ok') base = C.upgrade(C.validate(r.value));
      else if (r?.state === 'missing') base = C.upgrade(C.initial()); // the Studio's own fresh journal
      else throw Error('Your quest journal could not be read just now. Nothing was changed.');
      const draft = C.clone(base), result = await fn(draft);
      draft.updatedAt = new Date().toISOString();
      const checked = C.validate(draft);
      const w = await window.hub.kvSet(KEY, checked); if (w?.error) throw Error(w.error);
      S = checked; status = 'ok';
      document.dispatchEvent(new CustomEvent('hearth:quests', { detail: { state: C.clone(checked), source: 'hud' } }));
      paint();
      return { before: base, result, after: checked };
    });
    chain = task; return task;
  }
  // Someone changed the journal (the Studio, this HUD, another stream through the same event)
  function onQuests(e) {
    const st = e.detail?.state;
    if (!st || !C) { read().then(paint); return; }
    S = st; status = 'ok'; paint();
  }

  // ---------- what the chip shows ----------
  const cur = () => (S && C ? QC.card(C, S, QC.current(C, S, prefs.pin)) : null);
  const cutText = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  function describe(cd) {
    if (!cd) return 'Quests: nothing active right now · open the tracker';
    const nx = cd.next ? ` · next: ${cd.next.label.toLowerCase()} — ${cutText(cd.next.text, 90)}` : '';
    return `Quest: ${cd.title}${cd.campaign ? ` (${cd.campaign}, ${cd.progress.text})` : ''}${nx}`;
  }
  function build() {
    chip = el('button', { type: 'button', class: 'tool-btn qh-chip', hidden: true, dataset: { feature: 'Quest chip' }, attrs: { 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Quests' } }, // (named here: a11y.js then keeps our full name)
      el('span', { class: 'qh-ico', attrs: { 'aria-hidden': 'true' }, text: '✦' }), el('b', { class: 'qh-num' }), el('span', { class: 'qh-bar', attrs: { 'aria-hidden': 'true' } }, el('i')));
    chip.addEventListener('click', () => toggle());
    chip.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, menuItems()); });
    chip.addEventListener('pointerenter', showPeek); chip.addEventListener('focus', showPeek);
    chip.addEventListener('pointerleave', hidePeek); chip.addEventListener('blur', hidePeek);
    const rail = document.getElementById('rail');
    rail?.insertBefore(chip, rail.querySelector('.meter-pill') || document.getElementById('config-btn'));
  }
  function paint() {
    if (!chip) return;
    const cd = cur(), show = status === 'ok' && !prefs.hidden;
    const sg = QC.sig(cd, `${show}`);
    if (sg !== lastSig) {
      lastSig = sg;
      chip.hidden = !show;
      chip.classList.toggle('qh-idle', !cd);
      chip.querySelector('.qh-ico').textContent = cd ? cd.icon : '✦';
      chip.style.setProperty('--qh-color', cd ? cd.color : 'var(--ui-gold, #d9b777)');
      chip.querySelector('.qh-num').textContent = cd ? cd.progress.text : '';
      chip.style.setProperty('--qh-fill', `${Math.round((cd ? cd.progress.frac : 0) * 100)}%`);
      const words = describe(cd);
      chip.removeAttribute('data-a11y-name'); chip.setAttribute('aria-label', words);
      chip.title = `${words} · ${key()}`;
    }
    if (panel) renderPanel();
  }

  // ---------- hover peek (in <body>: the rail clips what sticks out of it) ----------
  function showPeek() {
    if (panel || !chip || chip.hidden) return;
    if (!peek) { peek = el('div', { class: 'qh-peek', attrs: { role: 'tooltip', 'aria-hidden': 'true' } }); document.body.append(peek); }
    const cd = cur(), sg = QC.sig(cd);
    if (sg !== peekSig) {
      peekSig = sg;
      peek.replaceChildren(...(cd ? [
        el('div', { class: 'qh-peek-top' }, el('span', { class: 'qh-pi', text: cd.icon, style: { color: cd.color } }), el('strong', { text: cd.title })),
        cd.campaign ? el('div', { class: 'qh-sub', text: `${cd.campaign} · quest ${cd.progress.text}` }) : null,
        cd.next ? el('div', { class: 'qh-peek-next' }, el('span', { class: 'qh-k', text: cd.next.label }), el('span', { text: cutText(cd.next.text, 140) })) : null,
        el('span', { class: 'qh-bar qh-wide' }, el('i', { style: { width: `${Math.round(cd.progress.frac * 100)}%` } })),
      ] : [el('strong', { text: 'No active quest' }), el('div', { class: 'qh-sub', text: 'Click for today\'s picks' })]));
    }
    const r = chip.getBoundingClientRect();
    peek.style.left = `${Math.round(r.right + 8)}px`;
    peek.style.top = `${Math.round(Math.max(8, Math.min(innerHeight - 140, r.top - 8)))}px`;
    peek.classList.add('on');
  }
  function hidePeek() { peek?.classList.remove('on'); }

  // ---------- the panel ----------
  const isOpen = () => Boolean(panel);
  function toggle(force) { if (force === false || (force !== true && panel)) close(); else open(); }
  async function open() {
    if (panel) { panel.querySelector('button')?.focus(); return; }
    hidePeek();
    panel = el('div', { class: 'qh-panel', attrs: { role: 'dialog', 'aria-label': 'Quest tracker' } });
    document.body.append(panel);
    place();
    chip?.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onEsc, true);
    renderPanel();
    await read(); // fresh from the journal (another computer's sync, another stream)
    lastSig = ''; paint();
    if (prefs.near === 'gps') locate();
    panel?.querySelector('.qh-step button, .qh-foot button')?.focus({ preventScroll: true });
  }
  function close() {
    if (!panel) return;
    panel.remove(); panel = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onEsc, true);
    chip?.setAttribute('aria-expanded', 'false');
    if (chip && !chip.hidden && document.activeElement === document.body) chip.focus({ preventScroll: true });
  }
  function outside(e) { if (panel && !panel.contains(e.target) && !chip?.contains(e.target) && !e.target.closest?.('#menu')) close(); }
  function onEsc(e) { if (e.key === 'Escape' && panel && !document.querySelector('#menu:not([hidden])')) { e.preventDefault(); e.stopPropagation(); close(); } }
  // Next to the rail, bottom-aligned with the chip (or the rail's foot when the chip is hidden): over the chats list,
  // never over a chat's messages or the Lab preview for longer than you look at it
  function place() {
    const a = (chip && !chip.hidden ? chip : document.querySelector('#rail .meter-pill') || document.getElementById('config-btn'))?.getBoundingClientRect();
    const rail = document.getElementById('rail')?.getBoundingClientRect(), left = Math.round((rail?.right || 64) + 6);
    // over the chats list when it shows (its width, 240–320 px): the chat and the Lab preview beside it stay uncovered
    const list = document.getElementById('panel'), lr = list && list.offsetParent ? list.getBoundingClientRect() : null;
    panel.style.left = `${left}px`;
    panel.style.width = `${lr && lr.width > 120 ? Math.max(240, Math.min(320, Math.round(lr.right - left - 6))) : 300}px`;
    panel.style.bottom = `${Math.round(Math.max(8, innerHeight - (a ? a.bottom + 4 : innerHeight - 8)))}px`;
  }
  const btn = (text, run, cls = '', title = '') => el('button', { type: 'button', class: `qh-btn ${cls}`, text, title: title || null, on: { click: (e) => { e.stopPropagation(); Promise.resolve(run(e)).catch((err) => toast(calmError(err), { type: 'error' })); } } });
  function renderPanel() {
    if (!panel) return;
    const focusKey = panel.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    const cd = cur();
    const head = el('div', { class: 'qh-head' }, el('span', { class: 'qh-pi', text: '✦' }), el('strong', { text: 'Quests' }),
      C && S ? el('span', { class: 'qh-sub qh-lv', text: (() => { const t = C.stats(S); return `Level ${t.level.n} · ${t.xp} XP · ✧ ${t.sparks}`; })() }) : null,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'qh-icon', text: '⋯', title: 'Tracker options', dataset: { k: 'more' }, attrs: { 'aria-label': 'Tracker options' }, on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 220, r.bottom + 4, menuItems()); } } }),
      el('button', { type: 'button', class: 'qh-icon', text: '×', title: 'Close', dataset: { k: 'close' }, attrs: { 'aria-label': 'Close the quest tracker' }, on: { click: () => close() } }));
    const body = [];
    if (status === 'missing') body.push(el('p', { class: 'qh-empty', text: 'No quest journal yet. Sidequest Studio starts one with your first quest.' }));
    else if (status !== 'ok') body.push(el('p', { class: 'qh-empty', text: status === 'unknown' ? 'Opening your journal…' : 'Your quest journal could not be read just now. Nothing was changed.' }));
    else if (!cd) body.push(el('p', { class: 'qh-empty', text: 'Nothing active right now. Take one of today\'s picks, or track a campaign in the Studio.' }));
    if (cd) body.push(questCard(cd));
    if (status === 'ok' && C && S) {
      const others = QC.actives(C, S, prefs.pin).filter((q) => q.id !== cd?.id);
      if (others.length) body.push(el('div', { class: 'qh-sec', text: 'Also active' }), ...others.map((q) => otherRow(QC.card(C, S, q))));
      const picks = todaysPicks();
      if (picks.length) body.push(el('div', { class: 'qh-sec', text: 'Today\'s picks' }), ...picks.map(pickRow));
      if (prefs.near !== 'off') body.push(...nearRows());
    }
    const foot = el('div', { class: 'qh-foot' }, btn('Open Sidequest Studio', () => { close(); return openStudio(); }, 'qh-primary'), el('kbd', { class: 'qh-key', text: key(), title: 'Open or close the tracker from anywhere' }));
    foot.querySelector('button').dataset.k = 'studio';
    panel.replaceChildren(head, el('div', { class: 'qh-body' }, ...body), foot);
    if (focusKey) panel.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }
  function questCard(cd) {
    const card = el('section', { class: 'qh-card', style: { '--qh-color': cd.color } },
      el('div', { class: 'qh-card-top' }, el('span', { class: 'qh-pi', text: cd.icon }), el('div', {}, el('strong', { class: 'qh-title', text: cd.title }),
        el('div', { class: 'qh-sub', text: cd.campaign ? `${cd.campaign} · quest ${cd.progress.text}` : `Side quest · ${cd.minutes} min · ${cd.xp} XP` }))),
      el('span', { class: 'qh-bar qh-wide' }, el('i', { style: { width: `${Math.round(cd.progress.frac * 100)}%` } })));
    for (const st of cd.steps) card.append(stepRow(cd, st));
    if (cd.note) card.append(el('div', { class: 'qh-note' }, el('span', { class: 'qh-k', text: 'Your note' }), el('span', { text: cd.note })));
    if (cd.focus) card.append(el('div', { class: 'qh-note' }, el('span', { class: 'qh-k', text: 'Focus' }), el('span', { text: `until ${new Date(cd.focus).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` })));
    if (cd.place) {
      const d = here ? QC.km(here, cd.place) : null;
      card.append(el('button', { type: 'button', class: 'qh-place', dataset: { k: 'place' }, title: 'Show it on your Paris map', on: { click: () => { close(); openStudio(null, 'world'); } } },
        el('span', { text: '📍' }), el('span', { text: cd.place.name }), d != null ? el('span', { class: 'qh-sub', text: `${QC.say(d)} · ${QC.walk(d)} min walk` }) : null));
    }
    return card;
  }
  function stepRow(cd, st) {
    const label = st.done ? `${st.label}: done` : st.id === 'finish' && st.proof ? `${st.label}: show your proof in Sidequest Studio` : `Check off: ${st.label}`;
    const box = el('button', { type: 'button', class: `qh-check${st.done ? ' on' : ''}`, dataset: { k: `${cd.id}:${st.id}` }, title: label,
      attrs: { role: 'checkbox', 'aria-checked': String(st.done), 'aria-label': label }, on: { click: (e) => { e.stopPropagation(); if (!st.done) checkOff(cd.id, st.id).catch((err) => toast(calmError(err), { type: 'error' })); } } });
    return el('div', { class: `qh-step${st.done ? ' done' : ''}${cd.next?.id === st.id ? ' next' : ''}` }, box,
      el('div', {}, el('span', { class: 'qh-k', text: st.id === 'start' ? `${st.label} · +5 XP` : st.proof && !st.done ? `${st.label} · proof in Studio` : st.label }), el('span', { class: 'qh-step-text', text: st.text })));
  }
  function otherRow(cd) {
    const row = el('div', { class: 'qh-row', style: { '--qh-color': cd.color } },
      el('span', { class: 'qh-pi', text: cd.icon }),
      el('button', { type: 'button', class: 'qh-row-main', dataset: { k: `track:${cd.id}` }, title: 'Follow this quest in the chip', on: { click: () => pin(cd.id) } },
        el('span', { class: 'qh-row-title', text: cd.title }), cd.next ? el('span', { class: 'qh-sub', text: `${cd.next.label}: ${cutText(cd.next.text, 70)}` }) : null));
    if (cd.next && !(cd.next.id === 'finish' && cd.next.proof)) row.append(el('button', { type: 'button', class: 'qh-check', dataset: { k: `${cd.id}:${cd.next.id}` }, title: `Check off: ${cd.next.label}`, attrs: { role: 'checkbox', 'aria-checked': 'false', 'aria-label': `Check off ${cd.next.label} of ${cd.title}` }, on: { click: () => checkOff(cd.id, cd.next.id).catch((err) => toast(calmError(err), { type: 'error' })) } }));
    return row;
  }
  function todaysPicks() {
    try {
      const taken = new Set(QC.actives(C, S, prefs.pin).map((q) => q.id));
      return C.recommend(S, { minutes: 15, energy: 'steady' }).filter((p) => !taken.has(p.id)).slice(0, 3);
    } catch { return []; }
  }
  function pickRow(p) {
    const path = C.paths.find((x) => x.id === p.path) || C.paths[0];
    return el('div', { class: 'qh-row', style: { '--qh-color': path.color } }, el('span', { class: 'qh-pi', text: path.icon }),
      el('div', { class: 'qh-row-main' }, el('span', { class: 'qh-row-title', text: p.title }), el('span', { class: 'qh-sub', text: `${p.minutes} min · ${cutText(p.action || '', 70)}` })),
      btn('Take', () => take(p), 'qh-take', 'Make this your quest and follow it'));
  }
  function nearRows() {
    const rows = [el('div', { class: 'qh-sec', text: 'Near you' })];
    if (!here) { rows.push(el('p', { class: 'qh-empty', text: hereErr || (prefs.near === 'gps' ? 'Finding where you are…' : 'Choose where you are in ⋯.') })); return rows; }
    const list = QC.near(S, here);
    if (!list.length) rows.push(el('p', { class: 'qh-empty', text: 'No map pins within 3 km.' }));
    for (const p of list) rows.push(el('button', { type: 'button', class: 'qh-row qh-near', dataset: { k: `near:${p.id}` }, title: p.quest || p.name, on: { click: () => { close(); openStudio(null, 'world'); } } },
      el('span', { class: 'qh-pi', text: '📍' }), el('span', { class: 'qh-row-main' }, el('span', { class: 'qh-row-title', text: p.name }), el('span', { class: 'qh-sub', text: `${QC.say(p.km)} · ${QC.walk(p.km)} min walk${p.quest ? ` · ${cutText(p.quest, 50)}` : ''}` }))));
    return rows;
  }

  // ---------- actions ----------
  // Check off a step with the Studio's own rules: the first move = startSmall (+5 XP once); the finish line = complete
  // when a review already confirmed the proof (or the journal has no proof rule), else the quest opens in the Studio,
  // where the proof goes. Returns a plain sentence for the chat.
  async function checkOff(qid, stepId) {
    await core(); if (!S) await read();
    const q = C.find(S, qid); if (!q) throw Error('That quest is no longer in your journal.');
    const st = QC.steps(C, S, q).find((x) => x.id === stepId);
    if (!st || st.done) return `${q.title}: ${st ? `${st.label.toLowerCase()} already done` : 'nothing to check off'}.`;
    if (stepId === 'start') {
      const { result } = await write((s) => C.startSmall(s, qid), 'A start worth keeping. The full quest is still open.');
      const msg = `✓ First move: ${q.title}${result ? ' · +5 XP' : ''}`;
      toast(msg, { timeout: 2600 }); return msg;
    }
    if (S.studio && !C.canFinish(S, qid)) {
      close(); await openStudio(qid);
      return `${q.title}: the finish line needs your proof (the actual work) and a review. It's open in Sidequest Studio.`;
    }
    const item = C.latest(S, qid);
    const { before, result, after } = await write((s) => C.complete(s, qid, item ? { note: item.intent, artifact: item.proof?.path ? { path: item.proof.path, label: item.proof.title, kind: item.proof.kind } : null } : {}), 'Quest saved. Take a moment to enjoy that.');
    const g = C.gains(before, after);
    const msg = `✓ Finished: ${q.title} · +${result} XP${g.levels ? ' · level up!' : ''}${g.rewards.length ? ` · ready to claim: ${g.rewards.join(', ')}` : ''}`;
    toast(msg, { timeout: 4000 }); return msg;
  }
  async function checkNext() {
    await core(); await read();
    const cd = cur(); if (!cd) throw Error('No active quest. Take one of today\'s picks: /quest picks');
    return checkOff(cd.id, cd.next.id);
  }
  function pin(qid) { prefs.pin = qid; savePrefs(); lastSig = ''; paint(); }
  async function take(p) {
    const { result: q } = await write((s) => C.choose(s, p), 'Quest picked. You only need the next step.');
    pin(q.id);
    toast(`✦ Following: ${q.title}`, { timeout: 2200 });
    return q;
  }
  // Track a campaign (the Studio's "Track": unpause + main quest) or follow a side quest (resumed if parked)
  async function track(name) {
    await core(); await read();
    const t = QC.match(C, S, name);
    if (!t) throw Error(`No open quest or campaign called "${name}". /quest track shows the names.`);
    if (t.kind === 'campaign') {
      await write((s) => { const c = s.campaigns.find((x) => x.id === t.id); c.paused = false; s.active = t.id; }, 'Main quest tracked. You only need the next step.');
      prefs.pin = null; savePrefs();
    } else {
      if (t.paused) await write((s) => { if (C.sideCount(s) >= 3) throw Error('Free a side-quest slot before resuming.'); s.sideQuests.find((q) => q.id === t.id).parked = false; }, 'Quest back on your workbench.');
      prefs.pin = t.id; savePrefs();
    }
    lastSig = ''; paint();
    const cd = cur();
    return `✦ Tracking ${t.title}${cd?.next ? ` · next: ${cd.next.label.toLowerCase()} — ${cd.next.text}` : ''}`;
  }
  async function openStudio(qid = null, page = null) {
    await Lazy.load('questjournal');
    activate('tool:quests');
    if (!qid && !page) return;
    if (!(await studioReady())) return;
    if (qid) QuestJournal.questDetail(qid); else QuestJournal.navigate(page);
  }
  // The Studio announces its load ('hearth:quests', source 'studio-load'); wait for it once (an action, never idle)
  function studioReady() {
    if (QuestJournal.ready?.()) return Promise.resolve(true);
    return new Promise((res) => {
      let t = 0;
      const on = () => { if (!QuestJournal.ready?.()) return; document.removeEventListener('hearth:quests', on); clearTimeout(t); res(true); };
      document.addEventListener('hearth:quests', on);
      t = setTimeout(() => { document.removeEventListener('hearth:quests', on); res(false); }, 6000);
    });
  }
  function setHidden(hidden) { prefs.hidden = Boolean(hidden); savePrefs(); lastSig = ''; paint(); return prefs.hidden; }

  // ---------- near you: opt-in, read once when you look, never saved or sent ----------
  function setNear(mode) {
    prefs.near = mode; savePrefs(); here = null; hereErr = '';
    if (mode !== 'off' && mode !== 'gps') { const p = S?.atlas?.places.find((x) => x.id === mode); if (p) here = { lat: p.lat, lon: p.lon, at: Date.now(), label: p.name }; }
    if (mode === 'gps') locate();
    renderPanel();
  }
  function locate() {
    if (here && Date.now() - here.at < 600000) return;
    if (!navigator.geolocation) { hereErr = 'This computer gives no location. Choose where you are in ⋯.'; renderPanel(); return; }
    navigator.geolocation.getCurrentPosition((pos) => { here = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: Date.now() }; hereErr = ''; renderPanel(); },
      () => { here = null; hereErr = 'Couldn\'t read this computer\'s location (check its Location settings for Hearth). Or choose where you are in ⋯.'; renderPanel(); },
      { timeout: 8000, maximumAge: 600000 });
  }
  function nearOnStart() {
    if (prefs.near === 'off' || prefs.near === 'gps') return;
    const p = S?.atlas?.places.find((x) => x.id === prefs.near); if (p) here = { lat: p.lat, lon: p.lon, at: Date.now(), label: p.name };
  }

  // ---------- menus ----------
  function menuItems() {
    const places = (S?.atlas?.places || []).slice(0, 40);
    return [
      { label: 'Open Sidequest Studio', action: () => { close(); openStudio(); } },
      { label: prefs.hidden ? 'Show the quest chip in the rail' : 'Hide the quest chip (/quest hud on brings it back)', action: () => setHidden(!prefs.hidden) },
      { label: 'Near you…', items: [
        { label: `${prefs.near === 'gps' ? '✓ ' : ''}Use this computer's location`, action: () => setNear('gps') },
        ...(places.length ? [{ label: 'I\'m at…', items: places.map((p) => ({ label: `${prefs.near === p.id ? '✓ ' : ''}${p.name}`, action: () => setNear(p.id) })) }] : []),
        { label: `${prefs.near === 'off' ? '✓ ' : ''}Off (nothing about where you are is used)`, action: () => setNear('off') },
      ] },
      ...(prefs.pin ? [{ label: 'Follow the main quest again', action: () => pin(null) }] : []),
    ];
  }

  // ---------- chat: /quest ----------
  function line(cd) {
    if (!cd) return 'No active quest right now.';
    return `✦ ${cd.title}${cd.campaign ? ` (${cd.campaign} · ${cd.progress.text})` : ''}${cd.next ? `\nNext — ${cd.next.label.toLowerCase()}: ${cd.next.text}${cd.next.id === 'finish' && cd.next.proof ? ' (needs your proof in the Studio)' : ''}` : ''}${cd.note ? `\nYour note: ${cd.note}` : ''}`;
  }
  async function cmd(args, ctx) {
    const { sub, rest } = QC.parse(args);
    await core(); await read();
    const say = (text, actions) => (ctx?.note ? ctx.note(text, { actions, id: 'questhud' }) : ctx?.say ? ctx.say(text) : toast(text));
    if (status === 'missing' && !['studio', 'hud', 'open', 'paris', 'name'].includes(sub)) { say('No quest journal yet. Open Sidequest Studio to start your first quest.', [{ label: 'Open Sidequest Studio', run: () => openStudio() }]); return; }
    const cd = cur();
    if (!sub || sub === 'next') {
      if (!cd) { const p = todaysPicks(); say(`No active quest right now.${p.length ? ` Today's picks: ${p.map((x, i) => `${i + 1}. ${x.title}`).join(' · ')}` : ''}`, p.map((x, i) => ({ label: `Take ${i + 1}`, run: () => take(x) }))); return; }
      let text = line(cd);
      if (sub === 'next' && cd.campaign && cd.next?.id === 'finish') { const c = S.campaigns.find((x) => x.id === cd.campaignId); const i = c.quests.findIndex((x) => x.id === cd.id); if (c.quests[i + 1]) text += `\nThen: ${c.quests[i + 1].title}`; }
      say(text, [{ label: cd.next?.id === 'finish' && cd.next.proof ? 'Show proof in Studio' : '✓ Check it off', run: () => checkOff(cd.id, cd.next.id).then((m) => ctx?.say?.(m)) }, { label: 'Tracker', run: () => open() }]);
      return;
    }
    if (sub === 'done') return checkNext();
    // (parisquests61) one /quest: the Paris words, and a name no open quest has, go to QuestParisUI.run
    if (sub === 'paris' || (sub === 'name' && !QC.match(C, S, rest))) return paris(args, ctx);
    if (sub === 'name') return track(rest);
    if (sub === 'track') {
      if (!rest) { const names = QC.trackables(C, S).slice(0, 12).map((t) => `${t.kind === 'side' ? '◇' : '◆'} ${t.title}`); return names.length ? `Track one of: ${names.join(' · ')} — /quest track <name>` : 'Nothing to track yet.'; }
      return track(rest);
    }
    if (sub === 'picks') { const p = todaysPicks(); if (!p.length) return 'No picks right now: your side-quest slots are full. Finish, park or skip one first.'; say(`Today's picks: ${p.map((x, i) => `${i + 1}. ${x.title} (${x.minutes} min)`).join(' · ')}`, p.map((x, i) => ({ label: `Take ${i + 1}`, run: () => take(x) }))); return; }
    if (sub === 'near') {
      if (prefs.near === 'off') { say('"Near you" is off: Hearth doesn\'t use where you are. Turn it on?', [{ label: 'Use this computer\'s location', run: () => { setNear('gps'); open(); } }, { label: 'I\'ll pick a place', run: () => open() }]); return; }
      nearOnStart(); if (prefs.near === 'gps' && !here) { open(); return 'Finding where you are… the tracker shows what\'s near.'; }
      const list = here ? QC.near(S, here) : [];
      return list.length ? `Near you: ${list.map((p) => `${p.name} (${QC.say(p.km)})`).join(' · ')}` : 'No map pins within 3 km.';
    }
    if (sub === 'open') { open(); return; }
    if (sub === 'studio') { await openStudio(); return; }
    if (sub === 'hud') { const w = rest.toLowerCase(); const h = setHidden(w === 'off' || w === 'hide' ? true : w === 'on' || w === 'show' ? false : !prefs.hidden); return h ? 'Quest chip hidden. /quest hud on (or Ctrl/⌘+K › Quest) brings it back.' : 'Quest chip shown in the rail.'; }
    return 'Try /quest, /quest next, /quest done or /quest track <name>.';
  }
  async function paris(args, ctx) { await Lazy.load('questjournal'); return QuestParisUI.run(args, ctx); }
  const parisUI = () => (window.Lazy?.isIn('questjournal') && typeof QuestParisUI !== 'undefined' ? QuestParisUI : null);
  function complete(args) {
    const t = String(args || '');
    if (QC.parse(t).sub === 'paris' && /\s/.test(t)) return parisUI()?.complete(t) || [];
    if (!/\s/.test(t)) return [...QC.SUBS, ...QC.PARIS.filter((w) => !['map', 'start', 'place', 'progress'].includes(w))].filter((s) => s.startsWith(t.toLowerCase())).map((s) => ({ value: s, hint: { next: 'the next step', done: 'check it off', track: 'follow a quest or campaign', picks: 'today\'s picks', near: 'map pins near you', open: 'the tracker', studio: 'Sidequest Studio', hud: 'show / hide the chip', paris: 'the Paris guide on your map', places: 'Paris places', guide: 'the guide pins', go: 'a Paris place\'s quest', add: 'a personal quest (airpods, park…)', park: 'music at the park', list: 'your Paris quests', help: 'every /quest word' }[s] }));
    const { sub, rest } = QC.parse(t);
    if (sub === 'hud') return ['on', 'off'].map((v) => ({ value: `hud ${v}` }));
    if (sub !== 'track' || !C || !S) return [];
    const n = QC.norm(rest);
    return QC.trackables(C, S).filter((x) => !n || QC.norm(x.title).includes(n)).slice(0, 10).map((x) => ({ value: `track ${x.title}`, label: x.title, hint: x.kind === 'side' ? 'side quest' : 'campaign' }));
  }

  // ---------- start ----------
  function onKey(e) {
    if (!e.ctrlKey || !e.shiftKey || e.altKey || e.repeat) return;
    if (WinMac.layoutCode(e) !== 'KeyO') return;
    e.preventDefault(); toggle();
  }
  function start() {
    build();
    document.addEventListener('hearth:quests', onQuests);
    document.addEventListener('keydown', onKey);
    read().then(() => { nearOnStart(); paint(); });
  }
  if (!Commands.get('quest')) {
    Commands.register({ name: 'quest', args: '[next | done | track <name> | picks | near | open | hud on|off | paris | go <place> | add <quest> | park | list]', area: 'Create', keys: HOTKEY,
      desc: 'Your active quest and its next step; check it off, track another, today\'s picks; Paris places and personal quests', run: cmd, complete,
      examples: ['/quest', '/quest next', '/quest done', '/quest track Paris', '/quest paris', '/quest add airpods'], keywords: 'quest tracker hud sidequest next step check off progress paris places airpods park' });
  }
  AppUI.addAction('Quest: show my quest tracker', () => toggle(true), HOTKEY);
  AppUI.addAction('Quest: check off the next step', () => checkNext().catch((err) => toast(calmError(err), { type: 'error' })));
  AppUI.addAction('Quest: show or hide the quest chip', () => setHidden(!prefs.hidden));
  Keys.add({ area: 'Quests', keys: HOTKEY, what: 'open or close the quest tracker (from anywhere)', run: () => toggle() });
  start();
  return { open, close, toggle, isOpen, checkOff, checkNext, track, take, pin, setHidden, setNear, openStudio, refresh: () => read().then(paint), state: () => ({ status, current: cur(), prefs: { ...prefs }, chip: Boolean(chip && !chip.hidden) }) };
})();
