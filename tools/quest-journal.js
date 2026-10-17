const QuestJournal = (() => {
  const C = QuestCore, KEY = 'quest-journal';
  const E = (tag, props = {}, ...children) => { const node = el(tag, props, ...children); for (const [key, value] of Object.entries(props.style || {})) if (key.startsWith('--')) node.style.setProperty(key, value); return node; };
  let root, content, status, state, writable = false, page = 'adventure', saving = Promise.resolve(), ticker, legacy;
  let daySeen = C.day(), lastCelebration = null;
  const pathOf = id => C.paths.find(p => p.id === id) || C.paths[0];
  const p = (text, cls = '') => E('p', { class: `qj-copy ${cls}`, text });
  const label = text => E('span', { class: 'qj-label', text });
  const row = (...nodes) => E('div', { class: 'qj-actions' }, ...nodes);
  // Original studio illustrations. Only these authored constants enter the SVG parser;
  // quest names, notes and imported data always go through textContent.
  function art(kind) {
    const drawings = {
      room: `<path d="M16 16h128v100H16Z" fill="#112b3c" stroke="#658d91" stroke-width="5"/><path d="M20 91 43 63 64 83 93 48 140 88v24H20Z" fill="#244e58" stroke="none"/><path d="M20 104 56 84 80 94 116 76 140 99v13H20Z" fill="#3f6a69" stroke="none"/><circle cx="112" cy="40" r="13" fill="#e9d9ab" stroke="none"/><g class="qj-night-stars" fill="#d6dcb3" stroke="none"><circle cx="35" cy="37" r="2"/><circle cx="72" cy="30" r="1.5"/><circle cx="53" cy="52" r="1.5"/><circle cx="132" cy="67" r="2"/></g><path d="M80 18v94M18 70h124" stroke="#769b94" stroke-width="4"/><path d="M11 119h139" stroke="#bd9c70" stroke-width="7"/>`,
      adventure: `<path d="M35 110 29 27Q29 20 38 19L113 12 125 105Z" fill="#204c50"/><g class="qj-art-lift"><path d="m33 22 77-8 8 87-78 10Z" fill="#eedfbc"/><path d="m43 22 8 87M49 42l49-5M51 49l35-3"/><path d="m59 64 15-2 2 15-15 2Z" fill="#e98e6b"/><path d="m83 63 7 5 10-15M60 91l39-4"/><path d="m88 13 2 23 7-6 7 4-2-23" fill="#d96951"/></g><path d="m117 46 8-2 10 49-7 7-5-5Z" fill="#dfb953"/><path d="m128 100 5 7 2-14" fill="#eedfbc"/>`,
      campaigns: `<path d="m20 48 21-10 94 1 7 70-111 4Z" fill="#c38257"/><path d="m28 56 108-6M31 99l105-4M45 56l3 42M119 52l2 43"/><g class="qj-art-lift"><path d="m42 42-3-22 54-5 8 28" fill="#e5dbba"/><path d="m52 29 30-3M55 36l20-2"/><path d="m78 47 4-18 47 7-2 12" fill="#8eac9c"/><path d="m92 38 21 3"/></g><path d="m62 65 47-2 1 21-47 2Z" fill="#eedfbc"/><path d="m74 76 25-1"/><circle cx="37" cy="65" r="2" fill="#253b3a"/><circle cx="130" cy="61" r="2" fill="#253b3a"/>`,
      skills: `<path d="m23 26 108-5 7 87-108 5Z" fill="#657d79"/><path d="m31 33 91-4 3 57-90 4Z" fill="#253f42"/><path d="m62 32 3 56M94 30l3 56" stroke="#88aaa0"/><g fill="#e4c56a"><circle cx="47" cy="47" r="7"/><circle cx="78" cy="45" r="7"/><circle cx="109" cy="44" r="7"/></g><path d="M47 42v5M78 40v5M109 39v5"/><g fill="#98b8ad"><circle cx="47" cy="72" r="4"/><circle cx="79" cy="70" r="4"/><circle cx="110" cy="69" r="4"/></g><path class="qj-art-cable" d="M47 72C22 120 102 131 79 70" fill="none" stroke="#e78e70" stroke-width="5"/><path d="m102 97 22-1" stroke="#eadcb9"/><circle class="qj-art-led" cx="118" cy="101" r="2" fill="#dce39b"/>`,
      rewards: `<path d="M39 17h82l5 95H34Z" fill="#be6f57"/><path d="M47 26h65v55H44Z" fill="#243f42"/><g class="qj-art-lift"><path d="m51 34 18-2 2 16-19 1Z" fill="#ebce79"/><path d="m82 34 21 2-2 16-21-3Z" fill="#91b8a5"/><path d="m52 60 19-3 1 16-19 2Z" fill="#e78f71"/><path d="m82 60 20 1-1 15-20-1Z" fill="#b9adcb"/></g><path d="M43 54h69M48 91h47v13H47Z" fill="#273f3f"/><circle class="qj-art-led" cx="109" cy="96" r="6" fill="#ecd98f"/><path d="m30 112 101 1M44 116v6M117 116v6"/><path d="M64 10h31" stroke="#e9cc87" stroke-width="5"/>`,
      collection: `<path d="m24 27 111-5 3 91-113 3Z" fill="#52726b"/><path d="m34 36 90-4 1 68-89 3Z" fill="#1d383b"/><path d="m34 70 91-3" stroke="#bb9270" stroke-width="6"/><path d="m43 61 6-16 19 1 4 16Z" fill="#b5accb"/><path d="m48 47 16 14M66 47 48 61"/><path d="m86 43 16-3 5 18-16 4Z" fill="#e8c666"/><path d="m47 83 25-2 2 15-26 1Z" fill="#d98a6d"/><path d="m85 94 4-16 18 1 2 13Z" fill="#86b5a1"/><path class="qj-art-door" d="m80 33 44-1 1 68-43 2Z" fill="#bad3c8" fill-opacity=".12"/><circle cx="88" cy="68" r="2" fill="#e6ce8e"/><path d="M31 116v5M129 115v5"/>`,
      visual: `<path d="m25 39 74-18 39 28-75 23Z" fill="#b7a4ce"/><path d="m25 39 38 33v40L25 78Z" fill="#779d91"/><path d="m63 72 75-23-2 40-73 23Z" fill="#dbc778"/><path d="m44 35 39 31M63 30l38 30M83 25l37 29M45 56l73-23M63 72v40M83 66v40M103 60v40M122 54v39M26 59l37 33 73-23" fill="none" stroke="#304547"/><path d="m30 15 4-8 4 8 8 3-8 3-4 8-4-8-8-3Z" fill="#e5d9b7"/>`,
      music: `<path d="m21 38 113-6 7 67-114 7Z" fill="#c99065"/><path d="m31 45 93-4 2 32-93 5Z" fill="#294548"/><g class="qj-art-reel"><circle cx="53" cy="60" r="11" fill="#e5d6ae"/><path d="m53 50 0 20M43 60h20"/></g><g class="qj-art-reel"><circle cx="103" cy="57" r="11" fill="#e5d6ae"/><path d="M103 47v20M93 57h20"/></g><path d="m61 91 9-12 23-2 11 12Z" fill="#e5d6ae"/><path d="m40 91 9-1M116 87l9-1" stroke="#294548" stroke-width="5"/>`,
      game: `<path d="M40 43Q17 46 20 90T53 93l11-8 37-2 15 15q27 14 25-18l-8-31q-6-18-30-10l-39 2Z" fill="#8dad9e"/><path d="m40 56 11-1 1 11 11-1 1 11-12 1 1 12-11 1-1-12-11 1-1-11 12-1Z" fill="#2d4848"/><circle cx="112" cy="60" r="7" fill="#df8c6d"/><circle cx="126" cy="75" r="7" fill="#e4c56a"/><path d="M75 71h13M76 41Q70 14 98 14" fill="none"/>`,
      life: `<path d="m42 54 56-3-4 54-41 2Z" fill="#e6cf94"/><path d="M98 60c35-10 29 33-3 26" fill="none" stroke="#e6cf94" stroke-width="8"/><path d="M60 42c-15-13 13-19 0-32M78 40c-10-11 10-14 2-24" fill="none" stroke="#92b4a9"/><path d="m29 111 88-3"/><path d="m58 69 9 8 17-15" fill="none" stroke="#527e77" stroke-width="4"/>`
    };
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130" fill="none" stroke="#263c3d" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="80" cy="117" rx="61" ry="6" fill="#081d22" opacity=".23" stroke="none"/>${drawings[kind] || drawings.adventure}</svg>`;
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
    svg.classList.add('qj-art'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    return document.importNode(svg, true);
  }
  const destinations = [
    ['adventure', 'The notebook', 'Your next quest', 'One page. One next step.'],
    ['campaigns', 'Project crate', 'Campaigns', 'Loops, little worlds & unfinished business.'],
    ['skills', 'Patch bay', 'Skill tree', 'Connect the things you’re getting good at.'],
    ['rewards', 'Treat machine', 'Rewards', 'Something good on the other side of done.'],
    ['collection', 'The shelf', 'Collection', 'You made these. Keep the evidence.']
  ];
  function menuNote(id) {
    const destination = destinations.find(d => d[0] === id) || destinations[0];
    const note = root?.querySelector('.qj-bench-caption');
    if (note) note.textContent = `${destination[1]} / ${destination[3]}`;
  }
  function syncMotion() {
    if (root) root.dataset.motion = state?.motion !== false && !document.hidden && H.activeId === 'tool:quests' ? 'on' : 'off';
  }
  const notice = text => { if (status) status.textContent = text; const local = root?.querySelector('dialog[open] .qj-dialog-status'); if (local) local.textContent = text; };
  function button(text, fn, cls = '', key) {
    return E('button', { type: 'button', class: `qj-button ${cls}`, text, ...(key ? { dataset: { focus: key } } : {}), on: { click: async e => { const b = e.currentTarget; b.disabled = true; try { await fn(e); } catch (err) { notice(err.message || 'That action could not be saved.'); } finally { b.disabled = false; } } } });
  }
  function field(title, opts = {}) {
    const input = E(opts.multiline ? 'textarea' : 'input', { ...(opts.multiline ? {} : { type: opts.type || 'text' }), value: opts.value || '', attrs: { 'aria-label': title, maxlength: opts.max || 500, ...(opts.multiline ? { rows: opts.rows || 3 } : {}), ...(opts.placeholder ? { placeholder: opts.placeholder } : {}), ...(opts.type === 'number' ? { min: 1, max: 10000 } : {}) } });
    return { input, node: E('label', { class: 'qj-field' }, label(title), input) };
  }
  function meter(value, max, title, cls = '') {
    return E('div', { class: `qj-meter ${cls}`, attrs: { role: 'progressbar', 'aria-label': title, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value } }, E('i', { style: { width: `${Math.min(100, Math.max(0, value / Math.max(1, max) * 100))}%` } }));
  }
  function dialog(title, build, subtitle = '') {
    const opener = document.activeElement;
    const d = E('dialog', { class: 'qj-dialog', attrs: { 'aria-label': title } });
    const body = E('div', { class: 'qj-dialog-body' });
    d.append(E('header', { class: 'qj-dialog-head' }, E('div', {}, label(subtitle || 'QUEST JOURNAL'), E('h2', { text: title })), button('×', () => d.close(), 'qj-close')), body);
    root.append(d); d.addEventListener('close', () => { d.remove(); if (opener?.isConnected) opener.focus(); else root.querySelector('[data-focus="current"]')?.focus(); });
    build(body, d); body.append(E('p', { class: 'qj-dialog-status', attrs: { role: 'status', 'aria-live': 'polite' } })); d.showModal(); return d;
  }
  function mutate(fn, message = 'Progress saved.') {
    const task = saving.catch(() => {}).then(async () => {
      if (!writable) throw Error('The journal is read-only until it can be loaded safely.');
      const draft = C.clone(state), result = await fn(draft); draft.updatedAt = new Date().toISOString();
      const checked = C.validate(draft);
      const r = await window.hub.kvSet(KEY, checked); if (r?.error) throw Error(r.error);
      state = checked; render(); notice(message); return result;
    });
    saving = task; return task;
  }
  async function load() {
    writable = false;
    try {
      const result = await window.hub.kvGet(KEY, null, { status: true });
      if (result?.state === 'missing') state = C.initial();
      else if (result?.state === 'ok') state = C.validate(result.value);
      else throw Error(result?.error || 'The journal could not be read.');
      writable = true; render(); notice('Journal saved on this computer.');
    } catch (err) { content.replaceChildren(E('section', { class: 'qj-empty' }, label('YOUR PROGRESS IS PRESERVED'), E('h2', { text: 'Let’s reconnect your journal' }), p(`${calmError(err)} Nothing has been overwritten.`), button('Try loading again', load))); notice('Saving is disabled while the journal is unavailable.'); }
  }
  function celebrate(title, text, gains = []) {
    lastCelebration = { title, text, gains };
    const card = E('div', { class: 'qj-celebrate', attrs: { role: 'status' } }, E('span', { class: 'qj-celebrate-mark', text: '✦' }), E('div', {}, E('strong', { text: title }), p(text), gains.length ? E('div', { class: 'qj-gains' }, ...gains.map(text => E('span', { text }))) : null), button('Dismiss', () => card.remove(), 'qj-quiet'));
    root.querySelector('.qj-celebrate')?.remove(); root.append(card);
    setTimeout(() => card.remove(), gains.length ? 12000 : 6500);
  }
  function render() {
    if (!state || !content) return;
    const focused = root.contains(document.activeElement) ? document.activeElement?.dataset.focus : null;
    const totals = C.stats(state), lv = totals.level;
    root.querySelector('.qj-profile')?.remove();
    const profile = E('div', { class: 'qj-profile' }, E('div', { class: 'qj-level', attrs: { 'aria-label': `Level ${lv.n}` }, text: String(lv.n) }), E('div', { class: 'qj-level-info' }, label(`LEVEL ${lv.n} · ${lv.n < 3 ? 'THE BEGINNING' : lv.n < 6 ? 'FINDING YOUR WAY' : 'MAKING YOUR MARK'}`), E('div', { class: 'qj-xp-line' }, E('strong', { text: `${totals.xp.toLocaleString()} XP` }), E('span', { text: `${lv.left} to level ${lv.n + 1}` })), meter(totals.xp - lv.base, lv.end - lv.base, 'Level progress')), E('div', { class: 'qj-wallet', attrs: { title: 'Earn one spark for every five XP. Redeeming rewards never spends XP.' } }, E('b', { text: `✧ ${totals.sparks}` }), label('SPARKS')));
    root.querySelector('.qj-top').append(profile);
    root.querySelectorAll('[data-page]').forEach(b => b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'));
    menuNote(page);
    const rewardCount = root.querySelector('[data-page="rewards"] .qj-object-count');
    if (rewardCount) rewardCount.textContent = `${totals.sparks} sparks`;
    const motion = root.querySelector('.qj-motion');
    if (motion) { motion.textContent = state.motion === false ? 'Motion off' : 'Motion on'; motion.setAttribute('aria-pressed', String(state.motion !== false)); }
    syncMotion();
    content.replaceChildren();
    if (page === 'adventure') adventure(); else if (page === 'campaigns') campaigns(); else if (page === 'skills') tree(); else if (page === 'rewards') rewards(); else collection();
    if (focused && !root.querySelector('dialog[open]')) [...root.querySelectorAll('[data-focus]')].find(b => b.dataset.focus === focused)?.focus({ preventScroll: true });
    tick();
  }
  function sectionHeading(eyebrow, title, description, action) {
    return E('header', { class: 'qj-section-head' }, E('div', {}, label(eyebrow), E('h2', { text: title }), description ? p(description) : null), action || null);
  }
  function track(c) { return mutate(s => { const found = s.campaigns.find(x => x.id === c.id); found.paused = false; s.active = c.id; }, 'Main quest tracked. You only need the next step.'); }
  function adventure() {
    const campaign = state.campaigns.find(c => c.id === state.active && !c.paused), quest = C.next(state, campaign), totals = C.stats(state);
    sessionDesk();
    const grid = E('div', { class: 'qj-adventure-grid' });
    const hero = E('section', { class: 'qj-hero' });
    if (quest) {
      const q = C.find(state, quest.id), path = pathOf(q.path), index = campaign.quests.findIndex(x => x.id === q.id), completed = campaign.quests.filter(x => C.done(state, x.id)).length, skipped = campaign.quests.filter(x => C.skipped(state, x.id)).length;
      hero.style.setProperty('--path', path.color);
      hero.append(E('div', { class: 'qj-hero-copy' }, label(`MAIN QUEST · ${path.name.toUpperCase()}`), E('h2', { text: q.title }), p(campaign.why), E('div', { class: 'qj-pills' }, E('span', { text: `◷ ${q.minutes} min` }), E('span', { text: `✦ ${q.xp} XP` }), E('span', { text: `✧ ${q.xp / 5} sparks` })),
        row(button(C.record(state, q.id).startedAt ? 'Continue quest →' : 'Begin quest →', () => questDetail(q.id), 'qj-primary', 'current'), button('Make this smaller', () => questDetail(q.id, 'tiny'), 'qj-quiet'), button('Skip for now →', () => skipQuest(q.id), 'qj-quiet')),
        E('div', { class: 'qj-chapter-progress' }, E('span', { text: campaign.title }), E('b', { text: `${completed} / ${campaign.quests.length} done${skipped ? ` · ${skipped} set aside` : ''}` })), meter(completed, campaign.quests.length, 'Campaign progress')),
      E('div', { class: 'qj-quest-object', attrs: { 'aria-hidden': 'true' } }, art(q.path), E('span', { text: `FIELD KIT / ${String(index + 1).padStart(2, '0')}` })));
    } else {
      const finished = campaign && C.campaignDone(state, campaign);
      hero.append(E('div', { class: 'qj-hero-copy' }, label(finished ? 'CAMPAIGN COMPLETE' : 'A FRESH PAGE'), E('h2', { text: finished ? 'Finished. That one is yours.' : campaign ? 'A different route is fine.' : 'What’s going on the workbench?' }), p(finished ? `${campaign.title} is yours to keep. Rest here, or choose your next adventure.` : campaign ? 'Your skipped quests are in Set aside below. Revisit one whenever it fits, or choose another campaign.' : 'Pick one project from the crate, or bring your own.'), row(button('Choose a campaign →', () => navigate('campaigns'), 'qj-primary', 'current'), button('Create my own', newCampaign))), E('div', { class: 'qj-quest-object', attrs: { 'aria-hidden': 'true' } }, art('adventure')));
    }
    const card = E('aside', { class: 'qj-card qj-traveller' }, label('STUDIO MEMBERSHIP / NO EXPIRY'), E('h3', { text: 'A little of everything.' }), p('Sound, texture, little worlds. It all goes on the same record.'),
      E('div', { class: 'qj-stat-pair' }, E('div', {}, E('b', { text: String(totals.finished) }), label('QUESTS FINISHED')), E('div', {}, E('b', { text: String(totals.campaigns) }), label('CAMPAIGNS COMPLETE'))));
    for (const path of C.paths) card.append(E('div', { class: 'qj-mini-path', style: { '--path': path.color } }, E('span', { text: `${path.icon} ${path.name}` }), E('b', { text: `${C.xp(state, path.id)} XP` }), meter(Math.min(C.xp(state, path.id), 300), 300, `${path.name} mastery`)));
    card.append(button('Explore your skill tree ↗', () => navigate('skills'), 'qj-quiet'));
    grid.append(hero, card); content.append(grid);
    ideaBox();
    const activeSides = state.sideQuests.filter(q => !q.parked && !C.done(state, q.id) && !C.skipped(state, q.id));
    const today = C.daily(); const candidates = today.filter(q => !state.sideQuests.some(x => x.id === q.id));
    content.append(sectionHeading('THE NOTICEBOARD', 'While you’re here…', 'Three small detours. Take one, or stick with your main quest. Accepted quests stay until you finish or park them.'));
    const sides = E('div', { class: 'qj-side-grid' });
    for (const q of [...activeSides, ...candidates].slice(0, Math.max(3, activeSides.length))) {
      const accepted = activeSides.includes(q), path = pathOf(q.path);
      sides.append(E('article', { class: 'qj-card qj-side', style: { '--path': path.color } }, E('div', { class: 'qj-card-top' }, E('span', { class: 'qj-path-icon', text: path.icon }), label(accepted ? 'ACCEPTED' : 'TODAY’S INVITATION')), E('h3', { text: q.title }), p(q.done), E('div', { class: 'qj-card-bottom' }, label(`${q.minutes} MIN · ${q.xp} XP`), button(accepted ? 'Open quest →' : 'Accept quest +', async () => { if (!accepted) await mutate(s => C.trackSide(s, q), 'Side quest accepted.'); questDetail(q.id); }, 'qj-quiet'), button(accepted ? 'Skip quest' : 'Not today', () => accepted ? skipQuest(q.id) : mutate(s => C.dismiss(s, q), 'Suggestion set aside. No XP added.'), 'qj-quiet'))));
    }
    content.append(sides);
    const setAside = C.allQuests(state).filter(q => C.skipped(state, q.id));
    if (setAside.length) {
      const fold = E('details', { class: 'qj-fold qj-skipped' }, E('summary', { text: `Set aside · ${setAside.length} ${setAside.length === 1 ? 'quest' : 'quests'} you can revisit` }));
      for (const q of setAside) fold.append(E('div', { class: 'qj-idea-row' }, E('div', {}, E('strong', { text: q.title }), p('Skipped · no completion XP')), button('Revisit quest', async () => { await mutate(s => C.revisit(s, q.id), 'Quest restored. Your earlier progress is kept.'); navigate('adventure'); }, 'qj-quiet')));
      content.append(fold);
    }
    if (state.sideQuests.some(q => q.parked && !C.done(state, q.id) && !C.skipped(state, q.id))) {
      const parked = E('details', { class: 'qj-fold' }, E('summary', { text: 'Parked side quests · ready when you are' }));
      for (const q of state.sideQuests.filter(q => q.parked && !C.done(state, q.id) && !C.skipped(state, q.id))) parked.append(row(p(q.title), button('Resume', () => mutate(s => { if (C.sideCount(s) >= 3) throw Error('Park, skip or finish a side quest first.'); s.sideQuests.find(x => x.id === q.id).parked = false; }))));
      content.append(parked);
    }
  }
  function sessionDesk() {
    const plan = state.plan, q = plan && C.find(state, plan.quest), ready = q && C.available(state, q.id) && !C.done(state, q.id);
    const desk = E('section', { class: `qj-session-desk ${plan ? 'has-plan' : ''}` }, E('div', { class: 'qj-session-mark', attrs: { 'aria-hidden': 'true' } }, art('music')), E('div', { class: 'qj-session-copy' }, label(plan ? 'YOUR NEXT SESSION / BOOKMARKED' : 'TUNE IN / FIND YOUR NEXT MOVE'), E('h3', { text: plan ? q.title : 'How much room have you got today?' }), p(plan ? plan.action : 'Two quiet minutes or a proper session. Pick something that fits.'), plan ? label(`${plan.minutes} MIN${ready ? ' · READY WHEN YOU ARE' : ' · QUEST PAUSED OR WAITING FOR AN EARLIER STEP'}`) : null));
    desk.append(row(ready ? button('Pick up here →', () => questDetail(q.id, plan.minutes === 2 ? 'tiny' : 'normal'), 'qj-primary') : null, button('Find my next move', sessionPicker, ready ? 'qj-quiet' : 'qj-primary'), plan ? button('Clear bookmark', () => mutate(s => { s.plan = null; }, 'Bookmark cleared. Quest progress is unchanged.'), 'qj-quiet') : null));
    content.append(desk);
  }
  function sessionPicker() {
    dialog('Find your next move', (body, d) => {
      const minutes = E('select', { attrs: { 'aria-label': 'Time available' } }, ...[2, 5, 15, 30].map(n => E('option', { value: String(n), text: `${n} minutes` }))); minutes.value = '5';
      const energy = E('select', { attrs: { 'aria-label': 'Energy today' } }, E('option', { value: 'steady', text: 'Ready to make something' }), E('option', { value: 'low', text: 'Just help me start' }));
      const path = E('select', { attrs: { 'aria-label': 'What sounds good' } }, E('option', { value: 'any', text: 'Any path' }), ...C.paths.map(p => E('option', { value: p.id, text: p.name })));
      const results = E('div', { class: 'qj-picks', attrs: { 'aria-label': 'Suggested next moves', 'aria-live': 'polite' } });
      const paint = () => {
        const picks = C.recommend(state, { minutes: Number(minutes.value), energy: energy.value, path: path.value });
        results.replaceChildren();
        for (const pick of picks) {
          const open = async planned => {
            const q = await mutate(s => { const chosen = C.choose(s, pick); if (planned) C.planQuest(s, chosen.id, pick.action, pick.minutes); return chosen; }, planned ? 'Next session bookmarked. No XP added.' : 'Quest ready. No XP added.');
            d.close(); if (planned) navigate('adventure'); else questDetail(q.id, pick.mode);
          };
          results.append(E('article', { class: 'qj-pick', style: { '--path': pathOf(pick.path).color } }, label(`${pathOf(pick.path).name} · ${pick.minutes} MIN${pick.mode === 'tiny' ? ' START' : ''}`), E('h3', { text: pick.title }), p(pick.action, 'qj-pick-action'), p(pick.reason), row(button('Try this now', () => open(false), 'qj-primary'), button('Plan this next', () => open(true), 'qj-quiet'))));
        }
        if (!picks.length) results.append(p('No available quest on this path right now. Free a side-quest slot, resume a campaign, or try another path.'), button('Browse campaigns', () => { d.close(); navigate('campaigns'); }, 'qj-quiet'));
      };
      for (const select of [minutes, energy, path]) select.addEventListener('change', paint);
      body.append(E('div', { class: 'qj-picker-controls' }, E('label', { class: 'qj-field' }, label('TIME'), minutes), E('label', { class: 'qj-field' }, label('ENERGY'), energy), E('label', { class: 'qj-field' }, label('PATH'), path)), p('Picks come from your available quests, saved ideas and today’s suggestions. Choosing an idea or daily suggestion accepts it onto your side-quest board; no XP is earned just for choosing.'), results); paint();
    }, 'ONE GOOD NEXT STEP');
  }
  function planNote(qid) {
    const q = C.find(state, qid), old = state.plan?.quest === qid ? state.plan : null;
    dialog('Leave yourself a starting note', (body, d) => {
      const action = field('When I come back, start by…', { value: old?.action || state.tiny[qid] || q.tiny, max: 500, multiline: true });
      const minutes = E('select', { attrs: { 'aria-label': 'Next session length' } }, ...[...new Set([2, 5, 15, 30, old?.minutes || 5])].sort((a, b) => a - b).map(n => E('option', { value: String(n), text: `${n} minutes` }))); minutes.value = String(old?.minutes || 5);
      body.append(action.node, E('label', { class: 'qj-field' }, label('SESSION LENGTH'), minutes), p('One bookmark at a time. It replaces the previous starting note, keeps your quest progress, and waits here without a deadline.'), button('Save starting note', async () => { await mutate(s => C.planQuest(s, qid, action.input.value, Number(minutes.value)), 'Starting note saved for your next session.'); d.close(); navigate('adventure'); }, 'qj-primary'));
    }, 'MAKE COMING BACK EASIER');
  }
  async function skipQuest(qid) { await mutate(s => C.skip(s, qid), 'Quest set aside. No completion XP added. You can revisit it below.'); if (!root.querySelector('dialog[open]')) root.querySelector('[data-focus="current"]')?.focus({ preventScroll: true }); }
  function ideaBox() {
    const ideas = (state.ideas || []).filter(i => !i.questId);
    const box = E('section', { class: 'qj-idea-box' }, E('header', {}, E('div', {}, label('NEXT TIME / YOUR IDEA BOX'), E('h3', { text: ideas.length ? `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} waiting for you` : 'Leave yourself a good next quest.' }), p('A sample to chop, a scene to try, something outside the studio. Save it here for when you feel like it.')), button('+ Suggest a quest', () => ideaForm(), 'qj-primary')));
    const extra = E('details', { class: 'qj-fold' }, E('summary', { text: `See ${Math.max(0, ideas.length - 3)} more ideas` }));
    ideas.forEach((i, n) => {
      const item = E('article', { class: 'qj-idea-row', style: { '--path': pathOf(i.path).color } }, E('span', { class: 'qj-path-icon', text: pathOf(i.path).icon }), E('div', {}, E('strong', { text: i.title }), p(`${i.minutes} min · ${i.goal}`)), row(button('Make this my quest', async () => { const q = await mutate(s => C.startIdea(s, i.id), 'Your idea is now a side quest.'); questDetail(q.id); }), button('Edit idea', () => ideaForm(i), 'qj-quiet')));
      (n < 3 ? box : extra).append(item);
    });
    if (ideas.length > 3) box.append(extra); content.append(box);
  }
  function ideaForm(idea) {
    dialog(idea ? 'Edit your next quest' : 'What would you like to try next?', (body, d) => {
      const title = field('Quest idea', { value: idea?.title, max: 150, placeholder: 'Make a drum loop from sounds in my kitchen' }), goal = field('A small finish line', { value: idea?.goal, max: 500, multiline: true, placeholder: 'Save one eight-bar loop. Rough is fine.' });
      const path = E('select', { attrs: { 'aria-label': 'Idea skill path' } }, ...C.paths.map(p => E('option', { value: p.id, text: p.name }))); path.value = idea?.path || 'music';
      const minutes = E('select', { attrs: { 'aria-label': 'Idea quest size' } }, ...[5, 15, 30].map(n => E('option', { value: String(n), text: `${n} minutes · ${n === 5 ? 20 : n === 15 ? 35 : 50} XP when finished` }))); minutes.value = String(idea?.minutes || 15);
      body.append(title.node, goal.node, E('label', { class: 'qj-field' }, label('PATH'), path), E('label', { class: 'qj-field' }, label('SIZE'), minutes), p('This stays in Next time until you choose it. Saving or accepting an idea earns no XP.'), button('Save for next time', async () => { await mutate(s => C.saveIdea(s, { id: idea?.id, title: title.input.value, goal: goal.input.value, path: path.value, minutes: Number(minutes.value) }), 'Idea tucked away for next time.'); d.close(); }, 'qj-primary'));
      if (idea) body.append(button('Remove idea', async () => { await mutate(s => { s.ideas = s.ideas.filter(i => i.id !== idea.id); }, 'Unused idea removed.'); d.close(); }, 'qj-quiet'));
    }, 'NO DEADLINE. JUST A POSSIBILITY.');
  }
  function campaigns() {
    content.append(sectionHeading('CAMPAIGNS', 'Finish something worth keeping.', 'One tracked campaign. A clear finish line. Everything else can wait.', button('+ Your own campaign', newCampaign, 'qj-primary')));
    const grid = E('div', { class: 'qj-campaign-grid' });
    for (const c of state.campaigns) {
      const path = pathOf(c.path), count = c.quests.filter(q => C.done(state, q.id)).length, finished = C.campaignDone(state, c);
      const card = E('article', { class: 'qj-card qj-campaign', style: { '--path': path.color } }, E('div', { class: 'qj-campaign-banner', attrs: { 'aria-hidden': 'true' } }, art(c.path)), label(c.subtitle || path.name), E('h3', { text: c.title }), p(c.why), E('div', { class: 'qj-chapter-progress' }, label(c.paused ? 'RESTING' : finished ? 'COMPLETE' : c.id === state.active ? 'TRACKED' : path.name.toUpperCase()), E('span', { text: `${count} / ${c.quests.length}` })), meter(count, c.quests.length, c.title));
      const details = E('details', { class: 'qj-milestones' }, E('summary', { text: 'The path to done' }));
      c.quests.forEach((q, i) => { const isDone = C.done(state, q.id), isSkipped = C.skipped(state, q.id), isNext = C.next(state, c)?.id === q.id; details.append(E('div', { class: `qj-milestone ${isDone ? 'done' : ''}` }, E('span', { text: isDone ? '✓' : isSkipped ? '↷' : String(i + 1) }), isDone || isSkipped || (isNext && !c.paused) ? button(`${q.title}${isSkipped ? ' · skipped' : ''}`, () => questDetail(q.id), 'qj-quiet') : E('span', { text: q.title }))); });
      card.append(details, row(finished ? button('View your collection', () => navigate('collection'), 'qj-quiet') : button(c.paused ? 'Resume campaign' : c.id === state.active ? 'Continue →' : 'Track campaign →', async () => { await track(c); navigate('adventure'); }, 'qj-primary'), !finished && !c.paused ? button('Pause', () => mutate(s => { s.campaigns.find(x => x.id === c.id).paused = true; if (s.active === c.id) s.active = null; }, 'Campaign resting. All your progress is kept.'), 'qj-quiet') : null));
      grid.append(card);
    }
    content.append(grid);
  }
  function tree() {
    content.append(sectionHeading('THE PATCH BAY / SKILL TREE', 'See what connects.', 'Each finished quest adds signal to a path. Follow the cable to your next milestone. Your tools are always available.'));
    const grid = E('div', { class: 'qj-tree' });
    for (const path of C.paths) {
      const branch = E('section', { class: 'qj-branch', style: { '--path': path.color } }, E('header', {}, E('span', { class: 'qj-path-icon', text: path.icon }), E('h3', { text: path.name }), p(path.description), label(`${C.xp(state, path.id)} PATH XP`)));
      for (const [i, skill] of C.skills(state, path.id).entries()) {
        const node = button('', () => dialog(skill.name, body => { body.append(p(skill.unlocked ? `You have reached this milestone in ${path.name}.` : `${Math.max(0, skill.threshold - C.xp(state, path.id))} more ${path.name} XP to reach this milestone.`), p(i === 0 ? 'Choose a small campaign and begin with curiosity.' : ['Keep a first artifact you can return to.', 'Try a variation and decide what to keep.', 'Finish a sequence of connected experiments.', 'Bring your own idea from first step to finished work.'][i - 1]), button('Find a campaign', e => { e.currentTarget.closest('dialog').close(); navigate('campaigns'); }, 'qj-primary')); }, path.name), `qj-skill ${skill.unlocked ? 'earned' : 'ahead'}`);
        node.setAttribute('aria-label', `${skill.name}, ${skill.unlocked ? 'earned' : 'ahead'}, ${skill.threshold} path XP`);
        node.append(E('span', { class: 'qj-skill-gem', text: skill.unlocked ? (i ? '✦' : path.icon) : '◇' }), E('strong', { text: skill.name }), label(skill.unlocked ? 'EARNED' : `${skill.threshold} XP`)); branch.append(node);
      }
      grid.append(branch);
    }
    content.append(grid, E('section', { class: 'qj-finish-banner' }, E('span', { text: '✦' }), E('div', {}, label('THE SKILL THAT CONNECTS THEM ALL'), E('h3', { text: 'Finishing is a practice.' }), p(`${C.stats(state).campaigns} campaigns completed. Every finished campaign adds its badge to your collection.`)), button('See your collection →', () => navigate('collection'), 'qj-quiet')));
  }
  function rewards() {
    content.append(sectionHeading('THE TREAT MACHINE', 'Work in. Good things out.', 'Stock it with things you actually want. One spark per five XP. Claiming a treat records your choice; nothing is purchased or booked.', button('+ Add a reward', () => rewardForm(), 'qj-primary')));
    content.append(E('div', { class: 'qj-balance' }, E('b', { text: `✧ ${C.balance(state)}` }), p('sparks available · your XP and level stay with you')));
    const grid = E('div', { class: 'qj-reward-grid' });
    for (const r of state.rewards) {
      const can = C.balance(state) >= r.cost;
      grid.append(E('article', { class: 'qj-card qj-reward' }, E('div', { class: 'qj-reward-glyph', attrs: { 'aria-hidden': 'true' } }, art('rewards')), E('h3', { text: r.name }), label(`${r.cost} SPARKS`), meter(Math.min(C.balance(state), r.cost), r.cost, `Progress toward ${r.name}`), row(button(can ? 'Redeem reward' : `${r.cost - C.balance(state)} sparks to go`, () => redeemDialog(r), can ? 'qj-primary' : 'qj-quiet'), button('Edit', () => rewardForm(r), 'qj-quiet'))));
    }
    content.append(grid);
    if (state.redemptions.length) {
      content.append(sectionHeading('YOUR REWARDS', 'Enjoy what you’ve earned.'));
      for (const r of [...state.redemptions].reverse().slice(0, 50)) content.append(E('div', { class: 'qj-receipt' }, E('span', { text: r.returnedAt ? '↶' : '✧' }), E('div', {}, E('strong', { text: r.name }), p(`${new Date(r.at).toLocaleDateString()} · ${r.cost} sparks${r.returnedAt ? ' · returned' : ''}`)), !r.returnedAt ? button('Return reward', () => mutate(s => { s.redemptions.find(x => x.id === r.id).returnedAt = new Date().toISOString(); }, 'Reward returned. Your sparks are back.'), 'qj-quiet') : null));
    }
  }
  function rewardForm(reward) {
    dialog(reward ? 'Edit your reward' : 'Something to look forward to', (body, d) => {
      const name = field('Reward', { value: reward?.name, max: 160, placeholder: 'A night at the cinema' }), cost = field('Sparks', { value: String(reward?.cost || 20), type: 'number' });
      body.append(name.node, cost.node, p('A typical quest earns 5–14 sparks. Choose a reward that feels fair and kind to yourself.'), button('Save reward', async () => { if (!name.input.value.trim()) throw Error('Name your reward first.'); await mutate(s => { const r = { id: reward?.id || C.id('r'), name: C.text(name.input.value, 160), cost: Number(cost.input.value) }; if (reward) s.rewards[s.rewards.findIndex(x => x.id === reward.id)] = r; else s.rewards.push(r); }); d.close(); }, 'qj-primary'));
    }, 'YOUR REWARD CHEST');
  }
  function redeemDialog(r) {
    dialog('Claim this moment', (body, d) => body.append(E('h3', { text: r.name }), p(`${r.cost} sparks · you have ${C.balance(state)}. This records your reward; you choose when to enjoy it.`), button('Confirm redemption', async () => { await mutate(s => C.redeem(s, r.id), 'Reward claimed. Enjoy it.'); d.close(); celebrate('Reward unlocked', r.name); }, 'qj-primary')), 'YOU EARNED THIS');
  }
  const safePath = path => typeof path === 'string' && /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path) && !/[\x00-\x1f]/.test(path);
  function artifactPreview(artifact) {
    if (!artifact || !safePath(artifact.path) || /^[\\/]{2}/.test(artifact.path)) return null;
    const url = WinMac.fileUrl(artifact.path);
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(artifact.path)) { const img = E('img', { attrs: { src: url, alt: artifact.label || 'Completed quest artifact', loading: 'lazy' } }); img.addEventListener('error', () => img.replaceWith(p('Preview unavailable. The file may have moved.'))); return img; }
    if (/\.(wav|mp3|ogg|flac|m4a)$/i.test(artifact.path)) return E('audio', { attrs: { src: url, controls: '', preload: 'none', 'aria-label': artifact.label || 'Quest audio' } });
    if (/\.(mp4|webm|mov)$/i.test(artifact.path)) return E('video', { attrs: { src: url, controls: '', preload: 'none', 'aria-label': artifact.label || 'Quest video' } });
    return null;
  }
  function collection() {
    content.append(sectionHeading('COLLECTION', 'Proof that you made something.', 'Your finished campaigns, small wins and the things you kept. Files stay in their original location.'));
    const badges = state.campaigns.filter(c => C.campaignDone(state, c));
    if (badges.length) content.append(E('div', { class: 'qj-badges' }, ...badges.map(c => E('div', { class: 'qj-badge', style: { '--path': pathOf(c.path).color } }, E('span', { text: '✦' }), E('strong', { text: c.badge || c.title }), label('CAMPAIGN COMPLETE')))));
    const finished = C.allQuests(state).filter(q => C.done(state, q.id)).sort((a, b) => C.record(state, b.id).completedAt.localeCompare(C.record(state, a.id).completedAt));
    if (!finished.length) content.append(E('section', { class: 'qj-empty' }, E('span', { class: 'qj-empty-star', text: '✧' }), E('h3', { text: 'Your first keepsake belongs here.' }), p('Finish a quest and add a note, image, sound or video. Small things count.'), button('Back to your adventure →', () => navigate('adventure'), 'qj-primary')));
    const grid = E('div', { class: 'qj-collection-grid' });
    for (const q of finished) { const r = C.record(state, q.id), path = pathOf(q.path); const art = artifactPreview(r.artifact);
      grid.append(E('article', { class: 'qj-card qj-keepsake', style: { '--path': path.color } }, art ? E('div', { class: 'qj-artifact' }, art) : E('div', { class: 'qj-keepsake-mark', text: path.icon, attrs: { 'aria-hidden': 'true' } }), label(`${path.name} · ${new Date(r.completedAt).toLocaleDateString()}`), E('h3', { text: q.title }), p(r.note || q.done), row(button('View quest', () => questDetail(q.id), 'qj-quiet'), r.artifact && safePath(r.artifact.path) ? button('Show file', () => window.hub.fs.reveal(r.artifact.path), 'qj-quiet') : null)));
    }
    content.append(grid);
    if (legacy && (Object.keys(legacy.done || {}).length || Object.keys(legacy.journal || {}).length)) {
      const archive = E('details', { class: 'qj-fold' }, E('summary', { text: 'Earlier Playground journal · preserved' }));
      const dates = [...new Set([...Object.keys(legacy.done || {}), ...Object.keys(legacy.journal || {})])].sort().reverse();
      for (const date of dates) archive.append(E('div', { class: 'qj-legacy' }, label(date), p(`${Array.isArray(legacy.done?.[date]) ? legacy.done[date].length : 0} earlier quests completed`), p(String(legacy.journal?.[date] || ''))));
      content.append(archive);
    }
  }
  function newCampaign() {
    dialog('What do you want to make real?', (body, d) => {
      const title = field('Campaign name', { max: 100, placeholder: 'Finish my next track' }), why = field('Why this matters to me', { max: 600, multiline: true, rows: 2, placeholder: 'I want something finished that sounds like me.' });
      const select = E('select', { attrs: { 'aria-label': 'Skill path' } }, ...C.paths.map(p => E('option', { value: p.id, text: p.name }))); select.value = 'life';
      const steps = field('Milestones · one finishable step per line', { multiline: true, rows: 5, max: 3000, placeholder: 'Choose the version I want to finish\nFinish one rough arrangement\nExport a version I can listen to' });
      body.append(title.node, why.node, E('label', { class: 'qj-field' }, label('SKILL PATH'), select), steps.node, p('Keep it to 1–12 milestones. Each should leave something you can point to. You can make the next action smaller after creating it.'), button('Create campaign →', async () => { await mutate(s => C.addCampaign(s, { title: title.input.value, why: why.input.value, path: select.value, milestones: steps.input.value.split('\n') }), 'Your campaign is ready. Start with just the first step.'); d.close(); navigate('adventure'); }, 'qj-primary'));
    }, 'A FINISH LINE YOU CHOOSE');
  }
  async function openTool(tool) {
    if (tool === 'lab') { activate('tool:three'); return; }
    if (!tool || tool === 'files') { notice('Use your own folders or favorite tools, then return here to keep your progress.'); return; }
    await Lazy.load('creative'); activate('tool:creative');
    for (let i = 0; i < 100 && !document.querySelector('.cp-stage'); i++) await new Promise(r => setTimeout(r, 50));
    CreativePlayground.openFeature(({ tiles: 'pattern', sounds: 'sfx' })[tool] || tool);
  }
  function draftQuest(q) {
    const agent = H.agents().find(a => a.mode === 'native' && a.engine === 'codex' && !a.dock);
    if (!agent) throw Error('Add an Astra native chat to prepare a draft.');
    const previous = Native.view(agent.id)?.input?.value || '';
    Native.setDraft(agent.id, `${previous ? previous + '\n\n' : ''}I’m working on this Hearth quest: ${q.title}.\nDone means: ${q.done}\nMy smallest next action: ${state.tiny[q.id] || q.tiny}\nHelp me take one manageable next step. Keep the scope small and preserve existing work. Don’t mark the quest complete for me.`);
    activate(agent.id); notice('Draft prepared in Astra. Nothing was sent.');
  }
  function questDetail(qid, initial = 'normal') {
    const q = C.find(state, qid); if (!q) return;
    const path = pathOf(q.path), r = C.record(state, qid), completed = C.done(state, qid);
    let mode = initial;
    dialog(q.title, (body, d) => {
      if (completed) {
        body.append(label(`✓ COMPLETED · ${q.xp} XP`), p(q.done), p(r.note || 'You kept your promise to this quest.'), artifactPreview(r.artifact), row(button('Add or edit keepsake', () => { d.close(); completionForm(qid, true); }), button('Undo completion', async () => { await mutate(s => C.undo(s, qid), 'Completion undone. Your earlier small start is kept.'); d.close(); }, 'qj-quiet'))); return;
      }
      if (C.skipped(state, qid)) { body.append(label('SET ASIDE · NO COMPLETION XP'), p(q.done), p('Your earlier small-start XP is kept. Bring this back whenever it fits.'), button('Revisit quest', async () => { await mutate(s => C.revisit(s, qid), 'Quest restored.'); d.close(); navigate('adventure'); }, 'qj-primary')); return; }
      if (state.plan?.quest === qid) body.append(E('aside', { class: 'qj-starting-note' }, label('YOUR STARTING NOTE'), p(state.plan.action)));
      const options = E('div', { class: 'qj-mode', attrs: { role: 'group', 'aria-label': 'Quest size' } }), detail = E('div', { class: 'qj-quest-detail' });
      const paint = () => {
        options.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
        detail.replaceChildren(label(mode === 'tiny' ? 'JUST OPEN THE DOOR' : mode === 'deep' ? 'ONLY IF YOU FEEL THE SPARK' : 'A CLEAR FINISH LINE'), p(mode === 'tiny' ? state.tiny[qid] || q.tiny : mode === 'deep' ? q.deep : q.done, 'qj-objective'));
        if (mode === 'tiny') {
          const tiny = field('Make the first action your own', { value: state.tiny[qid] || q.tiny, max: 500 });
          detail.append(p('A small start earns 5 XP once. The full quest stays open, and finishing earns the rest.'), tiny.node, row(button('Save smaller step', () => mutate(s => { const value = C.text(tiny.input.value); if (!value) throw Error('Write a small action first.'); s.tiny[qid] = value; }, 'Small step saved.')), button(C.record(state, qid).startedAt ? 'Small start already earned ✓' : 'I took the first step · +5 XP', async () => { const n = await mutate(s => C.startSmall(s, qid), 'A start worth keeping. The full quest is still open.'); d.close(); if (n) celebrate('You opened the door.', '+5 XP · the next step can wait.'); }, 'qj-primary')));
        } else detail.append(p(mode === 'deep' ? 'This is optional exploration. There is no extra XP for overworking. The original finish line still counts.' : `About ${q.minutes} minutes · ${q.xp - C.earned(state, q)} XP left to earn.`), button('I reached the finish line →', () => { d.close(); completionForm(qid); }, 'qj-primary'));
      };
      for (const [value, name] of [['tiny', '2-minute start'], ['normal', 'Focused quest'], ['deep', 'Deep dive']]) { const b = button(name, () => { mode = value; paint(); }); b.dataset.mode = value; options.append(b); }
      body.append(options, detail, E('div', { class: 'qj-quest-tools' }, label('MAKE IT EASIER TO START'), row(q.tool && q.tool !== 'files' ? button(q.tool === 'lab' ? 'Open Three.js Lab ↗' : 'Open creative tool ↗', async () => { d.close(); await openTool(q.tool); }) : null, button('Focus for 5 minutes', async () => { await focus(qid, 5); d.close(); }), button('Prepare Astra draft', () => { d.close(); draftQuest(q); }, 'qj-quiet'))));
      body.append(row(button('Leave a starting note', () => { d.close(); planNote(qid); }, 'qj-quiet'), button('Skip for now →', async () => { await skipQuest(qid); d.close(); }, 'qj-quiet'), button('Suggest a different quest', () => { d.close(); ideaForm(); }, 'qj-quiet')));
      if (!q.campaign) body.append(button('Park this side quest', async () => { await mutate(s => { s.sideQuests.find(x => x.id === qid).parked = true; if (s.focus?.quest === qid) s.focus = null; }, 'Parked, with your progress kept.'); d.close(); }, 'qj-quiet'));
      paint();
    }, path.name);
  }
  function completionForm(qid, edit = false) {
    const q = C.find(state, qid), previous = C.record(state, qid); let artifact = previous.artifact || null;
    dialog(edit ? 'Keep the story of this quest' : 'A finished thing, however small.', (body, d) => {
      const note = field('What did you make or discover? (optional)', { multiline: true, value: previous.note, max: 2000, placeholder: 'Keep one sentence for future you.' });
      const attach = E('input', { type: 'file', attrs: { 'aria-label': 'Attach a keepsake', accept: 'image/*,audio/*,video/*,.json,.mid,.midi,.html,.txt,.zip' } });
      const fileName = p(artifact?.label || 'An image, sound, video or project file. It stays where it is.');
      attach.addEventListener('change', () => { const file = attach.files?.[0]; if (!file) return; const path = window.hub.pathForFile(file); if (!safePath(path)) { fileName.textContent = 'Choose a saved file from this computer.'; return; } artifact = { path, label: file.name, kind: file.type || 'file' }; if (artifact.kind.length > 30) artifact.kind = 'file'; fileName.textContent = file.name; });
      const confirm = E('input', { type: 'checkbox', attrs: { 'aria-label': 'I reached this finish line' } }); confirm.checked = edit;
      body.append(label('DONE MEANS'), p(q.done, 'qj-objective'), note.node, E('label', { class: 'qj-field' }, label('KEEP A SOUVENIR (OPTIONAL)'), attach), fileName, button('Remove attachment', () => { artifact = null; attach.value = ''; fileName.textContent = 'No file attached.'; }, 'qj-quiet'), E('label', { class: 'qj-confirm' }, confirm, E('span', { text: 'I reached this finish line.' })), button(edit ? 'Save keepsake' : `Complete quest · +${q.xp - C.earned(state, q)} XP`, async () => {
        if (!confirm.checked) throw Error('Confirm the finish line, or return to the smaller step.');
        const beforeState = C.clone(state), before = C.stats(beforeState), points = await mutate(s => { if (edit) { s.records[qid] = { ...s.records[qid], note: C.text(note.input.value, 2000), artifact }; return 0; } return C.complete(s, qid, { note: note.input.value, artifact }); }, 'Quest saved. Take a moment to enjoy that.');
        d.close(); if (!edit) { const after = C.stats(state), gains = C.gains(beforeState, state); celebrate(after.level.n > before.level.n ? `Level ${after.level.n}. A little further.` : after.campaigns > before.campaigns ? 'Campaign complete. You finished it.' : 'Quest complete.', `+${points} XP · ${q.title}`, [...gains.skills.map(s => `Skill reached: ${s.name}`), ...gains.rewards.map(r => `Ready to claim: ${r}`)]); }
      }, 'qj-primary'));
    }, pathOf(q.path).name);
  }
  async function focus(qid, minutes) {
    if (state.focus && state.focus.quest !== qid && (state.focus.end > Date.now() || (!state.focus.end && state.focus.remaining))) throw Error('Finish or end your current focus session first.');
    await mutate(s => { s.focus = { quest: qid, end: Date.now() + minutes * 60000, remaining: minutes * 60000 }; }, 'Five minutes for this one thing. The timer never completes a quest for you.');
  }
  const left = () => state?.focus ? state.focus.end ? Math.max(0, state.focus.end - Date.now()) : state.focus.remaining : 0;
  function tick() {
    if (!root || !state) return;
    if (C.day() !== daySeen) { daySeen = C.day(); if (page === 'adventure') render(); }
    const f = state.focus, bar = root.querySelector('.qj-focus'); if (!bar) return;
    bar.hidden = !f; if (!f) return;
    const remaining = Math.ceil(left() / 1000);
    bar.querySelector('.qj-focus-clock').textContent = remaining ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Take a breath';
    bar.querySelector('.qj-focus-name').textContent = C.find(state, f.quest)?.title || 'Your focus session';
    bar.querySelector('[data-focus="pause-timer"]').textContent = !remaining ? 'Review quest' : f.end ? 'Pause' : 'Resume';
  }
  function navigate(to) { root?.querySelectorAll('audio,video').forEach(v => v.pause()); page = to; render(); root?.scrollTo({ top: 0, behavior: 'instant' }); }
  async function exportJournal() { await saving.catch(() => {}); const r = await window.hub.saveFile({ defaultPath: `hearth-quest-journal-${C.day()}.json`, filters: [{ name: 'Quest journal', extensions: ['json'] }], content: JSON.stringify(state, null, 2) }); notice(r ? 'Journal exported, including progress and reward history. Attached files are referenced, not copied.' : 'Export cancelled.'); }
  function importJournal() {
    dialog('Restore a quest journal', (body, d) => {
      const input = E('input', { type: 'file', attrs: { accept: '.json', 'aria-label': 'Quest journal backup' } }), info = p('Choose an exported journal. Review it before replacing this journal. Attached files must still exist at their saved locations.');
      let imported = null;
      input.addEventListener('change', async () => { imported = null; try { const file = input.files?.[0]; if (!file) return; if (file.size > 8e6) throw Error('Choose a journal smaller than 8 MB.'); imported = C.validate(JSON.parse(await file.text())); const n = C.stats(imported); info.textContent = `${n.finished} quests · ${n.xp} XP · ${imported.campaigns.length} campaigns. A recovery copy of the current journal will be saved before replacement.`; } catch (err) { info.textContent = calmError(err); } });
      body.append(input, info, button('Replace with this journal', async () => { if (!imported) throw Error('Choose a valid journal first.'); const chosen = C.clone(imported); await mutate(async s => { const backup = await window.hub.kvSet('quest-journal-before-restore', C.clone(s)); if (backup?.error) throw Error(backup.error); Object.keys(s).forEach(k => delete s[k]); Object.assign(s, chosen); }, 'Journal restored.'); d.close(); }, 'qj-primary'));
    }, 'YOUR PROGRESS, PORTABLE');
  }
  async function mount(body) {
    root = E('div', { class: 'qj', attrs: { 'aria-label': 'Quest journal' } }); body.append(root);
    const top = E('header', { class: 'qj-top' }, E('div', { class: 'qj-title' }, E('span', { class: 'qj-sigil', text: 'HQ', attrs: { 'aria-hidden': 'true' } }), E('div', {}, label('HEARTH / AFTER HOURS'), E('h1', { text: 'The sidequest studio' }))));
    const nav = E('nav', { class: 'qj-nav', attrs: { 'aria-label': 'Quest journal sections' } });
    for (const [id, title, subtitle, hint] of destinations) {
      const b = E('button', { type: 'button', class: 'qj-button qj-object', dataset: { page: id, focus: `nav-${id}` }, on: { click: () => navigate(id) } });
      b.setAttribute('aria-label', `${title}: ${subtitle}`); b.title = hint;
      b.append(art(id), E('strong', { text: title }), E('span', { class: 'qj-object-count', text: subtitle }));
      b.addEventListener('pointerenter', () => menuNote(id)); b.addEventListener('pointerleave', () => menuNote(page));
      b.addEventListener('focus', () => menuNote(id)); b.addEventListener('blur', () => menuNote(page)); nav.append(b);
    }
    const menu = button('Journal options', () => dialog('Your journal', b => b.append(p('Everything here works locally. There are no model calls, deadlines, punishments for missed days or automatic reward purchases.'), row(button('Export backup', exportJournal), button('Restore backup', e => { e.currentTarget.closest('dialog').close(); importJournal(); }), button('Export pre-restore recovery copy', async () => { const previous = await window.hub.kvGet('quest-journal-before-restore'); if (!previous) throw Error('No restore has been made yet.'); C.validate(previous); const r = await window.hub.saveFile({ defaultPath: 'hearth-quest-recovery.json', filters: [{ name: 'Quest journal', extensions: ['json'] }], content: JSON.stringify(previous, null, 2) }); notice(r ? 'Recovery copy exported. Use Restore backup to recover it.' : 'Export cancelled.'); })), p('One small start awards 5 XP once; completion awards the remainder. One spark is earned per five XP. Levels never drop from inactivity. Undoing a completion deliberately reverses its award.'))), 'qj-quiet'); nav.append(menu);
    status = E('p', { class: 'qj-status', attrs: { role: 'status', 'aria-live': 'polite' }, text: 'Opening your journal…' }); content = E('main', { class: 'qj-content' });
    const focusBar = E('div', { class: 'qj-focus', hidden: true }, E('span', { class: 'qj-focus-clock' }), E('span', { class: 'qj-focus-name' }), button('Pause', async () => { if (!left()) return questDetail(state.focus.quest); const remaining = left(); await mutate(s => { if (s.focus.end) { s.focus.remaining = remaining; s.focus.end = 0; } else s.focus.end = Date.now() + s.focus.remaining; }); }, 'qj-quiet', 'pause-timer'), button('End focus', () => mutate(s => { s.focus = null; }, 'Focus ended. Your quest is waiting whenever you are.'), 'qj-quiet'));
    top.append(button('Motion on', () => mutate(s => { s.motion = s.motion === false; }, 'Studio motion preference saved.'), 'qj-quiet qj-motion'), menu);
    const scenery = E('div', { class: 'qj-room', attrs: { 'aria-hidden': 'true' } }, E('div', { class: 'qj-night-window' }, art('room')), E('div', { class: 'qj-desk-lamp' }), E('div', { class: 'qj-motes' }, ...[0, 1, 2, 3, 4].map(i => E('i', { style: { '--i': String(i) } }))));
    const bench = E('section', { class: 'qj-bench', attrs: { 'aria-label': 'The studio workbench' } }, scenery, E('div', { class: 'qj-bench-sign' }, label('PICK SOMETHING UP'), E('span', { text: 'small projects · good company' })), nav, E('p', { class: 'qj-bench-caption', text: 'One page. One next step.' }));
    root.append(top, bench, content, status, focusBar); await load();
    try { legacy = await window.hub.kvGet('creative-playground'); } catch { /* Old notebook is never modified. */ }
    clearInterval(ticker); ticker = setInterval(() => { if (H.activeId === 'tool:quests') tick(); }, 1000);
    const surface = body.closest('.surface'); if (surface) new MutationObserver(() => { syncMotion(); if (H.activeId !== 'tool:quests') root.querySelectorAll('audio,video').forEach(v => v.pause()); }).observe(surface, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    document.addEventListener('visibilitychange', () => { syncMotion(); if (document.hidden) root.querySelectorAll('audio,video').forEach(v => v.pause()); });
  }
  Tools.define({ id: 'quests', name: 'Sidequest Studio', icon: '✦', color: '#d9b777', description: 'Your quests, next ideas and small victories', mount: body => mount(body).catch(err => { body.textContent = `Journal could not open: ${calmError(err)}`; }), onShow: () => { if (state) render(); } });
  Commands.register({ name: 'quests', area: 'Create', desc: 'Open your quest journal, campaigns, XP, skill tree and rewards', run: () => activate('tool:quests') });
  return { snapshot: () => C.clone(state), flush: () => saving, navigate, questDetail, get celebration() { return lastCelebration; } };
})();
