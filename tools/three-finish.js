// ⚑ Finish line (round 67, finishlines67). Ideas never get finished when "done" is never written down, so each Lab
// scene can get a finish line, from the ⚑ chip right after the scene picker in the Lab toolbar:
//   · a size: 10 s / 30 s / Full. On a scene without a song, 10 s and 30 s set its own timeline to that length (the
//     toast's Undo puts the old one back); a scene with a song keeps it, and Record it takes that many seconds from
//     the playhead.
//   · a "done when" list: a few lines to tick, starting from the size's defaults (FinishCore.DEFAULTS). Click a line's
//     words to change them, ✕ to remove it (Undo in the toast), + Add a line. When every line is ticked the card says
//     plainly that the piece is done and offers ⏺ Record it (the Lab's own recorder: N seconds, or the whole song /
//     timeline) and More ways to record… (the timeline's record menu).
//   · ✦ Polish this: the unticked lines (or, with every line ticked, a short look at the scene) become exactly three
//     small steps, shown on the card first. "Track it" adds them as a side quest to the quest journal (through
//     QuestHud.write + QuestCore.trackSide, so the journal's own rules and the three-side-quest limit apply); "Track +
//     guide me" also starts the step-by-step guide with the same three steps (window.hub.questGuide). Made here, from
//     the list and the scene's layer names: no model call, 0 tokens.
// Stored per scene in the Lab's extras (ThreeLab.scenes.setExtras, key `finish`; it follows the scene through sync and
// duplicates, and the Lab never writes over an extras file it couldn't read). Nothing runs on a timer: the chip
// repaints on a scene switch or a change. Ctrl/⌘+K: "Lab: ⚑ Finish line". Model: tools/three-finish-core.js.
const LabFinish = (() => {
  const C = FinishCore;
  const S = { chip: null, card: null, draft: null, editing: null, adding: false, note: '', guideHooked: false, seam: null }; // seam: dev/checks/finishline.js's stand-in journal + guide (never the owner's)
  const err = (e) => toast(String(e?.message || e), { type: 'error' });
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const scenes = () => Lab()?.scenes || null;
  const sceneId = () => scenes()?.currentId?.() || null;
  const sceneOf = (id) => scenes()?.get?.(id) || null;
  const stateOf = (id = sceneId()) => C.normalize(id ? scenes()?.extrasOf?.(id)?.finish : null);
  const save = (id, st) => { if (id) scenes()?.setExtras?.(id, { finish: st }); paint(); };
  const nameOf = (id) => sceneOf(id)?.name || 'this scene';
  function infoOf(id) {
    const sc = scenes(); const sk = sceneOf(id);
    let layers = [];
    try { layers = (sk ? sc.layersOf(sk) || [] : []).filter((l) => l.visible !== false).map((l) => l.name); } catch { layers = []; }
    const tl = sc?.timelineOf?.(id);
    const P = Lab()?.stageHooks?.player;
    const seconds = tl?.len || (id === sceneId() && P?.loaded && P.duration) || null;
    return { layers, seconds, song: Boolean(sc?.songOf?.(id)) };
  }

  // ---------- the chip (Lab toolbar, right after the scene picker) ----------
  function mountChip() {
    const picker = document.querySelector('.three-sketch-select');
    if (!picker) return false;
    if (!S.chip) S.chip = el('button', { type: 'button', class: 'fl-chip', dataset: { feature: 'Finish line' }, on: { click: () => toggleCard() } });
    if (S.chip.previousElementSibling !== picker) picker.after(S.chip);
    paintChip();
    return true;
  }
  function paintChip() {
    if (!S.chip) return;
    const st = stateOf(); const c = C.chip(st);
    if (S.chip.textContent !== c.text) S.chip.textContent = c.text;
    S.chip.title = c.title;
    S.chip.classList.toggle('fl-set', Boolean(st.size));
    S.chip.classList.toggle('fl-done', C.progress(st).finished);
    S.chip.setAttribute('aria-expanded', String(Boolean(S.card)));
  }
  const paint = () => { paintChip(); if (S.card) paintCard(); };

  // ---------- the card ----------
  function toggleCard() { if (S.card) closeCard(); else openCard(); }
  function closeCard() { S.card?.remove(); S.card = null; S.draft = null; S.editing = null; S.adding = false; S.note = ''; paintChip(); }
  function openCard() {
    const host = scenes()?.previewHost?.() || Lab()?.stageHooks?.host;
    if (!host || !sceneId()) { toast('Open a scene in the Lab first', { type: 'error' }); return false; }
    closeCard();
    S.card = el('div', { class: 'fl-card', attrs: { role: 'dialog', 'aria-label': 'Finish line' }, on: {
      contextmenu: (e) => e.stopPropagation(),
      keydown: (e) => { e.stopPropagation(); if (e.key === 'Escape' && !e.target.matches('input')) closeCard(); }, // keys typed here never reach the Lab's shortcuts
    } });
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(S.card);
    paintCard();
    paintChip();
    return true;
  }
  const btn = (text, title, fn, cls = '') => el('button', { type: 'button', class: `lm-btn ${cls}`.trim(), text, title, on: { click: (e) => { const b = e.currentTarget; b.disabled = true; Promise.resolve().then(fn).catch(err).finally(() => { b.disabled = false; }); } } });
  function paintCard() {
    const card = S.card; const id = sceneId();
    if (!card) return;
    if (!id) { closeCard(); return; }
    card.dataset.scene = id;
    const st = stateOf(id); const p = C.progress(st);
    const head = el('div', { class: 'lm-head' }, el('b', { text: '⚑ Finish line' }), el('span', { class: 'fl-name', text: nameOf(id), title: nameOf(id) }),
      el('button', { type: 'button', class: 'lm-btn lm-x', text: '✕', title: 'Close (everything here is kept)', on: { click: () => closeCard() } }));
    const sizes = el('div', { class: 'fl-sizes', attrs: { role: 'group', 'aria-label': 'Piece size' } },
      el('span', { class: 'fl-label', text: 'Size' }),
      ...C.SIZES.map((z) => el('button', { type: 'button', class: `lm-btn fl-size${st.size === z.id ? ' on' : ''}`, text: z.label, title: z.title, attrs: { 'aria-pressed': String(st.size === z.id) }, on: { click: () => pickSize(z.id) } })));
    const parts = [head, sizes];
    if (S.note) parts.push(el('div', { class: 'fl-note', text: S.note }));
    if (!st.size) {
      parts.push(el('p', { class: 'fl-hint', text: 'Pick a size: you get a short "done when" list for it. Tick the lines as they become true.' }));
    } else {
      parts.push(el('div', { class: 'fl-label', text: `Done when · ${p.done} of ${p.total}` }), listOf(id, st));
      if (p.finished) {
        parts.push(el('div', { class: 'fl-verdict', text: '✓ Done. This piece is finished.' }),
          el('div', { class: 'lm-acts' },
            btn('⏺ Record it', recordTitle(id, st), () => recordIt(id), 'lm-ask fl-rec'),
            btn('More ways to record…', 'The timeline\'s record menu: the loop, the whole song, from here, frame rate, quality', () => recordMenu())));
      }
    }
    parts.push(polishPart(id, st));
    card.replaceChildren(...parts);
    const input = card.querySelector('input.fl-edit');
    if (input && document.activeElement !== input) { input.focus(); input.select(); }
  }
  function listOf(id, st) {
    const ul = el('ul', { class: 'fl-list' });
    for (const it of st.items) {
      const row = el('li', { class: `fl-item${it.done ? ' done' : ''}` });
      const box = el('input', { type: 'checkbox', checked: it.done, attrs: { 'aria-label': it.text }, on: { change: () => save(id, C.toggle(stateOf(id), it.id, box.checked)) } });
      if (S.editing === it.id) {
        row.append(box, editor(it.text, (text) => { S.editing = null; save(id, C.rename(stateOf(id), it.id, text)); }));
      } else {
        row.append(box,
          el('span', { class: 'fl-text', text: it.text, title: 'Click to change the words', attrs: { role: 'button', tabindex: '0' }, on: { click: () => { S.editing = it.id; S.adding = false; paintCard(); }, keydown: (e) => { if (e.key === 'Enter') { S.editing = it.id; paintCard(); } } } }),
          el('button', { type: 'button', class: 'lm-btn lm-x fl-rm', text: '✕', title: 'Remove this line (you can Undo)', on: { click: () => removeItem(id, it) } }));
      }
      ul.append(row);
    }
    if (S.adding) ul.append(el('li', { class: 'fl-item' }, el('span', { class: 'fl-plus', text: '+' }), editor('', (text) => { S.adding = false; if (text.trim()) save(id, C.add(stateOf(id), text)); else paintCard(); })));
    const foot = el('li', { class: 'fl-foot' });
    if (!S.adding && st.items.length < C.MAX_ITEMS) foot.append(el('button', { type: 'button', class: 'lm-btn', text: '+ Add a line', on: { click: () => { S.adding = true; S.editing = null; paintCard(); } } }));
    if (st.custom) foot.append(el('button', { type: 'button', class: 'lm-btn', text: 'Back to the defaults', title: `The ${C.sizeOf(st.size)?.label} lines again (you can Undo)`, on: { click: () => resetList(id) } }));
    if (foot.childElementCount) ul.append(foot);
    return ul;
  }
  // an inline text box: Enter / leaving it keeps the words, Esc leaves them as they were
  function editor(text, done) {
    let finished = false;
    const finish = (v) => { if (finished) return; finished = true; done(v); };
    return el('input', { type: 'text', class: 'fl-edit', value: text, maxLength: 80, placeholder: 'Done when…', attrs: { 'aria-label': 'Line text' }, on: {
      keydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(e.currentTarget.value); else if (e.key === 'Escape') { finished = true; S.editing = null; S.adding = false; paintCard(); } },
      blur: (e) => finish(e.currentTarget.value),
    } });
  }
  function removeItem(id, it) {
    const before = stateOf(id);
    save(id, C.remove(before, it.id));
    toast(`Removed “${it.text}”`, { action: { label: 'Undo', fn: () => save(id, before) } });
  }
  function resetList(id) {
    const before = stateOf(id);
    save(id, C.reset(before));
    toast('The default lines are back', { action: { label: 'Undo', fn: () => save(id, before) } });
  }

  // ---------- size ----------
  function pickSize(size) {
    const id = sceneId(); const sc = scenes();
    if (!id || !sc) return;
    const before = stateOf(id);
    const z = C.sizeOf(size);
    save(id, C.setSize(before, size));
    // a scene with its own timeline (no song): 10 s / 30 s set its length
    const song = sc.songOf?.(id); const tl = sc.timelineOf?.(id);
    let undoTl = null;
    if (z.seconds && !song && sc.setTimeline && Math.round(tl?.len || 0) !== z.seconds) {
      const prev = tl ? { ...tl } : null;
      sc.setTimeline(id, { ...(tl || {}), len: z.seconds, fps: tl?.fps || 30 });
      undoTl = () => sc.setTimeline(id, prev);
      S.note = `The scene's timeline is now ${z.seconds} s.`;
    } else if (z.seconds && song) S.note = `This scene plays a song: Record it takes ${z.seconds} s from the playhead.`;
    else S.note = '';
    paint();
    if (before.size !== size) toast(`⚑ ${nameOf(id)}: ${z.label}${undoTl ? `, timeline ${z.seconds} s` : ''}`, { action: { label: 'Undo', fn: () => { undoTl?.(); S.note = ''; save(id, before); } } });
  }

  // ---------- Record it (the Lab's own recorder) ----------
  function recordTitle(id, st) {
    const z = C.sizeOf(st.size);
    if (!z?.seconds) return 'Records the whole song or timeline once, from the start';
    return scenes()?.songOf?.(id) ? `Records ${z.seconds} s from the playhead` : `Records the ${z.seconds} s timeline from the start`;
  }
  async function recordIt(id) {
    const cmd = await ThreeLab.cmd({ show: true });
    if (id !== sceneId()) scenes()?.open?.(id);
    await cmd.waitSong?.();
    const z = C.sizeOf(stateOf(id).size);
    const song = scenes()?.songOf?.(id);
    try {
      if (z?.seconds) {
        if (!song) { try { cmd.seek(0); } catch { /* no timeline yet: recordSpan says so */ } }
        const r = cmd.recordSpan({ seconds: z.seconds });
        if (!r) throw Error('The timeline is not ready yet');
        toast(`⏺ Recording ${z.seconds} s${song ? ' from the playhead' : ''}: the take lands in your recordings`);
      } else {
        try { cmd.seek(0); } catch { /* nothing to seek: it records from now */ }
        const k = cmd.record('track');
        if (k === false) throw Error('A recording is already running: stop it first');
        toast(k === 'track' ? '⏺ Recording the whole piece once' : '⏺ Recording: press Stop in the timeline when it\'s done');
      }
    } catch (e) {
      // no timeline to measure from: the timeline's own record menu
      if (!recordMenu()) throw e;
    }
  }
  function recordMenu() {
    const P = Lab()?.stageHooks?.player;
    if (!P?.recordMenu) { toast('The recorder is in the timeline under the preview (⏺)', { type: 'error' }); return false; }
    P.recordMenu(S.card?.querySelector('.fl-rec') || undefined);
    return true;
  }

  // ---------- ✦ Polish this → a side quest with three steps ----------
  function polishPart(id, st) {
    const box = el('div', { class: 'fl-polish' });
    if (!S.draft || S.draft.sceneId !== id) {
      const open = st.items.filter((x) => !x.done).length;
      box.append(el('div', { class: 'lm-acts' },
        btn('✦ Polish this', open ? 'Your unticked lines as three small steps you can do now' : 'A short look at the scene as three small steps you can do now', () => polish(id), 'lm-ask fl-polish-btn'),
        el('span', { class: 'fl-free', text: 'made here, 0 tokens' })));
      if (st.quest) box.append(el('div', { class: 'fl-note', text: `Last polish quest: ${st.quest.title}` }));
      return box;
    }
    box.append(el('div', { class: 'fl-label', text: 'Three small steps' }),
      el('ol', { class: 'fl-steps' }, ...S.draft.steps.map((s) => el('li', {}, el('b', { text: s.title }), el('span', { text: s.instruction })))),
      el('div', { class: 'lm-acts' },
        btn('✦ Track + guide me', 'Adds it to your side quests and opens the step-by-step guide beside the Lab', () => track(id, true), 'lm-ask'),
        btn('Track it', 'Adds it to your side quests (the quest tracker shows it)', () => track(id, false)),
        btn('Not now', 'Nothing is saved', () => { S.draft = null; paintCard(); })));
    if (S.draft.msg) box.append(el('div', { class: 'fl-note fl-warn', attrs: { role: 'status' } }, el('span', { text: S.draft.msg }), S.draft.full ? btn('Open the quest tracker', 'Park, skip or finish a side quest there', () => openTracker()) : false));
    return box;
  }
  function polish(id) {
    S.draft = { sceneId: id, steps: C.polishSteps(stateOf(id), infoOf(id)), msg: '' };
    paintCard();
  }
  async function hud() {
    if (S.seam?.hud) return S.seam.hud;
    if (typeof QuestHud === 'undefined' || !QuestHud?.write) await Lazy.load('questhud');
    if (typeof QuestHud === 'undefined' || !QuestHud?.write) throw Error('The quest tracker isn\'t available just now. Nothing was changed.');
    return QuestHud;
  }
  async function openTracker() { (await hud()).open?.(); }
  async function track(id, guide) {
    const d = S.draft;
    if (!d || d.sceneId !== id) return;
    const st = stateOf(id);
    const n = (Number(String(st.quest?.id || '').split('-').pop()) || 0) + 1;
    const q = C.quest({ sceneId: id, sceneName: nameOf(id), size: st.size, n }, d.steps);
    const H = await hud();
    try {
      await H.write((s) => window.QuestCore.trackSide(s, q), `Polish ${nameOf(id)}`);
    } catch (e) {
      const full = /three side quests/i.test(e?.message || '');
      d.msg = full ? 'You already have 3 side quests. Finish, park or skip one first, then press Track again.' : String(e?.message || e);
      d.full = full;
      paintCard();
      return;
    }
    S.draft = null;
    save(id, { ...st, quest: { id: q.id, title: q.title, at: Date.now() } });
    if (!guide) { toast(`✦ “${q.title}” is in your side quests`, { action: { label: 'Show', fn: () => openTracker().catch(err) } }); return; }
    const startGuide = S.seam?.guide || (typeof window.hub?.questGuide === 'function' ? window.hub.questGuide : null);
    if (!startGuide) { toast(`✦ “${q.title}” is in your side quests. The guide isn't available in this build.`); return; }
    const r = await startGuide(C.guideStart(q));
    if (!r?.ok) throw Error(r?.error || 'The guide could not start. Your quest is tracked.');
    toast(`✦ “${q.title}”: the guide is open, step 1 of 3`);
  }
  // the guide's "↗ Work" on one of these quests opens the Lab: and its scene
  function hookGuide() {
    if (S.guideHooked || !window.hub?.onQuestGuideTool) return;
    S.guideHooked = true;
    window.hub.onQuestGuideTool((d) => {
      if (!C.isOurs(d?.questId) || d.tool !== 'lab') return;
      const sc = scenes();
      const id = sc?.all?.().find((x) => stateOf(x.id).quest?.id === d.questId)?.id
        || (typeof QuestHud !== 'undefined' && QuestHud.journal?.().S?.sideQuests?.find((x) => x.id === d.questId)?.finishLine?.sceneId) || null;
      if (id && sc.get(id)) ThreeLab.cmd({ show: true }).then(() => { if (sc.currentId() !== id) sc.open(id); }).catch(err);
    });
  }

  // ---------- wiring (events only: nothing polls, nothing runs while hidden) ----------
  addEventListener('hearth:lab-ready', () => mountChip());
  addEventListener('hearth:sketch', () => { if (!mountChip()) return; if (S.card && S.card.dataset.scene !== sceneId()) { S.draft = null; S.editing = null; S.adding = false; S.note = ''; paintCard(); } });
  addEventListener('hearth:lab-scenes-arrived', () => paint()); // another computer's changes (sync)
  mountChip();
  hookGuide();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: ⚑ Finish line (piece size, "done when" list, Polish this)', async () => { try { await ThreeLab.cmd({ show: true }); mountChip(); if (!S.card) openCard(); } catch (e) { err(e); } });

  return { open: openCard, close: closeCard, toggle: toggleCard, state: (id) => stateOf(id), pickSize, polish, track, recordIt, mountChip, get card() { return S.card; }, get chip() { return S.chip; }, _seam: (x) => { S.seam = x || null; }, _S: S };
})();
