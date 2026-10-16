const QuestJournal = (() => {
  const C = QuestCore, KEY = 'quest-journal';
  const E = (tag, props = {}, ...children) => { const node = el(tag, props, ...children); for (const [key, value] of Object.entries(props.style || {})) if (key.startsWith('--')) node.style.setProperty(key, value); return node; };
  let root, content, status, state, writable = false, page = 'adventure', saving = Promise.resolve(), ticker, legacy;
  let daySeen = C.day(), lastCelebration = null;
  const pathOf = id => C.paths.find(p => p.id === id) || C.paths[0];
  const p = (text, cls = '') => E('p', { class: `qj-copy ${cls}`, text });
  const label = text => E('span', { class: 'qj-label', text });
  const row = (...nodes) => E('div', { class: 'qj-actions' }, ...nodes);
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
    const d = E('dialog', { class: 'qj-dialog', attrs: { 'aria-label': title } });
    const body = E('div', { class: 'qj-dialog-body' });
    d.append(E('header', { class: 'qj-dialog-head' }, E('div', {}, label(subtitle || 'QUEST JOURNAL'), E('h2', { text: title })), button('×', () => d.close(), 'qj-close')), body);
    root.append(d); d.addEventListener('close', () => { d.remove(); root.querySelector('[data-focus="current"]')?.focus(); });
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
      writable = true; render(); notice('Saved on this computer. Every small step counts.');
    } catch (err) { content.replaceChildren(E('section', { class: 'qj-empty' }, label('YOUR PROGRESS IS PRESERVED'), E('h2', { text: 'Let’s reconnect your journal' }), p(`${err.message} Nothing has been overwritten.`), button('Try loading again', load))); notice('Saving is disabled while the journal is unavailable.'); }
  }
  function celebrate(title, text) {
    lastCelebration = { title, text };
    const card = E('div', { class: 'qj-celebrate', attrs: { role: 'status' } }, E('span', { class: 'qj-celebrate-mark', text: '✦' }), E('div', {}, E('strong', { text: title }), p(text)), button('Dismiss', () => card.remove(), 'qj-quiet'));
    root.querySelector('.qj-celebrate')?.remove(); root.append(card);
    setTimeout(() => card.remove(), 6500);
  }
  function render() {
    if (!state || !content) return;
    const focused = root.contains(document.activeElement) ? document.activeElement?.dataset.focus : null;
    const totals = C.stats(state), lv = totals.level;
    root.querySelector('.qj-profile')?.remove();
    const profile = E('div', { class: 'qj-profile' }, E('div', { class: 'qj-level', attrs: { 'aria-label': `Level ${lv.n}` }, text: String(lv.n) }), E('div', { class: 'qj-level-info' }, label(`LEVEL ${lv.n} · ${lv.n < 3 ? 'THE BEGINNING' : lv.n < 6 ? 'FINDING YOUR WAY' : 'MAKING YOUR MARK'}`), E('div', { class: 'qj-xp-line' }, E('strong', { text: `${totals.xp.toLocaleString()} XP` }), E('span', { text: `${lv.left} to level ${lv.n + 1}` })), meter(totals.xp - lv.base, lv.end - lv.base, 'Level progress')), E('div', { class: 'qj-wallet', attrs: { title: 'Earn one spark for every five XP. Redeeming rewards never spends XP.' } }, E('b', { text: `✧ ${totals.sparks}` }), label('SPARKS')));
    root.querySelector('.qj-top').append(profile);
    root.querySelectorAll('[data-page]').forEach(b => b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'));
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
    const grid = E('div', { class: 'qj-adventure-grid' });
    const hero = E('section', { class: 'qj-hero' });
    if (quest) {
      const q = C.find(state, quest.id), path = pathOf(q.path), index = campaign.quests.findIndex(x => x.id === q.id), completed = index;
      hero.style.setProperty('--path', path.color);
      hero.append(E('div', { class: 'qj-hero-copy' }, label(`MAIN QUEST · ${path.name.toUpperCase()}`), E('h2', { text: q.title }), p(campaign.why), E('div', { class: 'qj-pills' }, E('span', { text: `◷ ${q.minutes} min` }), E('span', { text: `✦ ${q.xp} XP` }), E('span', { text: `✧ ${q.xp / 5} sparks` })),
        row(button(C.record(state, q.id).startedAt ? 'Continue quest →' : 'Begin quest →', () => questDetail(q.id), 'qj-primary', 'current'), button('Make this smaller', () => questDetail(q.id, 'tiny'), 'qj-quiet')),
        E('div', { class: 'qj-chapter-progress' }, E('span', { text: campaign.title }), E('b', { text: `${completed} / ${campaign.quests.length}` })), meter(completed, campaign.quests.length, 'Campaign progress')),
      E('div', { class: 'qj-portal', attrs: { 'aria-hidden': 'true' } }, E('i'), E('i'), E('span', { text: path.icon }), E('b', { text: 'A SMALL STEP\nCHANGES THE MAP' })));
    } else {
      hero.append(E('div', { class: 'qj-hero-copy' }, label(campaign ? 'CAMPAIGN COMPLETE' : 'YOUR ADVENTURE, YOUR PACE'), E('h2', { text: campaign ? 'You made it to the finish line.' : 'What would you like to make real?' }), p(campaign ? `${campaign.title} is yours to keep. Rest here, or choose your next adventure.` : 'Choose one campaign. We’ll keep the next step small enough to start.'), row(button('Choose a campaign →', () => navigate('campaigns'), 'qj-primary', 'current'), button('Create my own', newCampaign))), E('div', { class: 'qj-portal', attrs: { 'aria-hidden': 'true' } }, E('i'), E('i'), E('span', { text: '✦' })));
    }
    const card = E('aside', { class: 'qj-card qj-traveller' }, label('YOUR STORY SO FAR'), E('h3', { text: totals.finished ? 'Look how far you’ve come.' : 'Every maker starts here.' }), p('No broken streaks. No lost levels. Coming back is part of the adventure.'),
      E('div', { class: 'qj-stat-pair' }, E('div', {}, E('b', { text: String(totals.finished) }), label('QUESTS FINISHED')), E('div', {}, E('b', { text: String(totals.campaigns) }), label('CAMPAIGNS COMPLETE'))));
    for (const path of C.paths) card.append(E('div', { class: 'qj-mini-path', style: { '--path': path.color } }, E('span', { text: `${path.icon} ${path.name}` }), E('b', { text: `${C.xp(state, path.id)} XP` }), meter(Math.min(C.xp(state, path.id), 300), 300, `${path.name} mastery`)));
    card.append(button('Explore your skill tree ↗', () => navigate('skills'), 'qj-quiet'));
    grid.append(hero, card); content.append(grid);
    const activeSides = state.sideQuests.filter(q => !q.parked && !C.done(state, q.id));
    const today = C.daily(); const candidates = today.filter(q => !state.sideQuests.some(x => x.id === q.id));
    content.append(sectionHeading('SIDE QUESTS', 'A little progress counts.', 'Keep up to three. Suggestions rotate each day; accepted quests stay until you finish or park them.'));
    const sides = E('div', { class: 'qj-side-grid' });
    for (const q of [...activeSides, ...candidates].slice(0, Math.max(3, activeSides.length))) {
      const accepted = activeSides.includes(q), path = pathOf(q.path);
      sides.append(E('article', { class: 'qj-card qj-side', style: { '--path': path.color } }, E('div', { class: 'qj-card-top' }, E('span', { class: 'qj-path-icon', text: path.icon }), label(accepted ? 'ACCEPTED' : 'TODAY’S INVITATION')), E('h3', { text: q.title }), p(q.done), E('div', { class: 'qj-card-bottom' }, label(`5 MIN · ${q.xp} XP`), button(accepted ? 'Open quest →' : 'Accept quest +', async () => { if (!accepted) await mutate(s => C.trackSide(s, q), 'Side quest accepted.'); questDetail(q.id); }, 'qj-quiet'))));
    }
    content.append(sides);
    if (state.sideQuests.some(q => q.parked && !C.done(state, q.id))) {
      const parked = E('details', { class: 'qj-fold' }, E('summary', { text: 'Parked side quests · ready when you are' }));
      for (const q of state.sideQuests.filter(q => q.parked && !C.done(state, q.id))) parked.append(row(p(q.title), button('Resume', () => mutate(s => { if (s.sideQuests.filter(x => !x.parked && !C.done(s, x.id)).length >= 3) throw Error('Park or finish a side quest first.'); s.sideQuests.find(x => x.id === q.id).parked = false; }))));
      content.append(parked);
    }
  }
  function campaigns() {
    content.append(sectionHeading('CAMPAIGNS', 'Finish something worth keeping.', 'One tracked campaign. A clear finish line. Everything else can wait.', button('+ Your own campaign', newCampaign, 'qj-primary')));
    const grid = E('div', { class: 'qj-campaign-grid' });
    for (const c of state.campaigns) {
      const path = pathOf(c.path), count = c.quests.filter(q => C.done(state, q.id)).length, finished = count === c.quests.length;
      const card = E('article', { class: 'qj-card qj-campaign', style: { '--path': path.color } }, E('div', { class: 'qj-campaign-banner', attrs: { 'aria-hidden': 'true' } }, E('span', { text: finished ? '✦' : path.icon })), label(c.subtitle || path.name), E('h3', { text: c.title }), p(c.why), E('div', { class: 'qj-chapter-progress' }, label(c.paused ? 'RESTING' : finished ? 'COMPLETE' : c.id === state.active ? 'TRACKED' : path.name.toUpperCase()), E('span', { text: `${count} / ${c.quests.length}` })), meter(count, c.quests.length, c.title));
      const details = E('details', { class: 'qj-milestones' }, E('summary', { text: 'The path to done' }));
      c.quests.forEach((q, i) => { const isDone = C.done(state, q.id), isNext = C.next(state, c)?.id === q.id; details.append(E('div', { class: `qj-milestone ${isDone ? 'done' : ''}` }, E('span', { text: isDone ? '✓' : String(i + 1) }), isDone || (isNext && !c.paused) ? button(q.title, () => questDetail(q.id), 'qj-quiet') : E('span', { text: q.title }))); });
      card.append(details, row(finished ? button('View your collection', () => navigate('collection'), 'qj-quiet') : button(c.paused ? 'Resume campaign' : c.id === state.active ? 'Continue →' : 'Track campaign →', async () => { await track(c); navigate('adventure'); }, 'qj-primary'), !finished && !c.paused ? button('Pause', () => mutate(s => { s.campaigns.find(x => x.id === c.id).paused = true; if (s.active === c.id) s.active = null; }, 'Campaign resting. All your progress is kept.'), 'qj-quiet') : null));
      grid.append(card);
    }
    content.append(grid);
  }
  function tree() {
    content.append(sectionHeading('SKILL TREE', 'Become the kind of maker you want to be.', 'Quests earn mastery in their path. Skills celebrate progress and suggest what to try next; your tools are always available.'));
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
    content.append(sectionHeading('REWARD CHEST', 'Make the reward worth the journey.', 'Earn one spark for every five XP. Rewards are promises to yourself, redeemed manually. Nothing is purchased or booked.', button('+ Add a reward', () => rewardForm(), 'qj-primary')));
    content.append(E('div', { class: 'qj-balance' }, E('b', { text: `✧ ${C.balance(state)}` }), p('sparks available · your XP and level stay with you')));
    const grid = E('div', { class: 'qj-reward-grid' });
    for (const r of state.rewards) {
      const can = C.balance(state) >= r.cost;
      grid.append(E('article', { class: 'qj-card qj-reward' }, E('div', { class: 'qj-reward-glyph', attrs: { 'aria-hidden': 'true' }, text: '✧' }), E('h3', { text: r.name }), label(`${r.cost} SPARKS`), meter(Math.min(C.balance(state), r.cost), r.cost, `Progress toward ${r.name}`), row(button(can ? 'Redeem reward' : `${r.cost - C.balance(state)} sparks to go`, () => redeemDialog(r), can ? 'qj-primary' : 'qj-quiet'), button('Edit', () => rewardForm(r), 'qj-quiet'))));
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
    const badges = state.campaigns.filter(c => !C.next(state, c));
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
        const before = C.stats(state), points = await mutate(s => { if (edit) { s.records[qid] = { ...s.records[qid], note: C.text(note.input.value, 2000), artifact }; return 0; } return C.complete(s, qid, { note: note.input.value, artifact }); }, 'Quest saved. Take a moment to enjoy that.');
        d.close(); if (!edit) { const after = C.stats(state); celebrate(after.level.n > before.level.n ? `Level ${after.level.n}. A little further.` : after.campaigns > before.campaigns ? 'Campaign complete. You finished it.' : 'Quest complete.', `+${points} XP · ${q.title}`); }
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
      input.addEventListener('change', async () => { imported = null; try { const file = input.files?.[0]; if (!file) return; if (file.size > 8e6) throw Error('Choose a journal smaller than 8 MB.'); imported = C.validate(JSON.parse(await file.text())); const n = C.stats(imported); info.textContent = `${n.finished} quests · ${n.xp} XP · ${imported.campaigns.length} campaigns. A recovery copy of the current journal will be saved before replacement.`; } catch (err) { info.textContent = err.message; } });
      body.append(input, info, button('Replace with this journal', async () => { if (!imported) throw Error('Choose a valid journal first.'); const chosen = C.clone(imported); await mutate(async s => { const backup = await window.hub.kvSet('quest-journal-before-restore', C.clone(s)); if (backup?.error) throw Error(backup.error); Object.keys(s).forEach(k => delete s[k]); Object.assign(s, chosen); }, 'Journal restored.'); d.close(); }, 'qj-primary'));
    }, 'YOUR PROGRESS, PORTABLE');
  }
  async function mount(body) {
    root = E('div', { class: 'qj', attrs: { 'aria-label': 'Quest journal' } }); body.append(root);
    const top = E('header', { class: 'qj-top' }, E('div', { class: 'qj-title' }, E('span', { class: 'qj-sigil', text: '✦', attrs: { 'aria-hidden': 'true' } }), E('div', {}, label('HEARTH · YOUR NEXT CHAPTER'), E('h1', { text: 'Quest journal' }))));
    const nav = E('nav', { class: 'qj-nav', attrs: { 'aria-label': 'Quest journal sections' } });
    for (const [id, title] of [['adventure', 'Your adventure'], ['campaigns', 'Campaigns'], ['skills', 'Skill tree'], ['rewards', 'Rewards'], ['collection', 'Collection']]) { const b = button(title, () => navigate(id)); b.dataset.page = id; nav.append(b); }
    const menu = button('Journal options', () => dialog('Your journal', b => b.append(p('Everything here works locally. There are no model calls, deadlines, punishments for missed days or automatic reward purchases.'), row(button('Export backup', exportJournal), button('Restore backup', e => { e.currentTarget.closest('dialog').close(); importJournal(); }), button('Export pre-restore recovery copy', async () => { const previous = await window.hub.kvGet('quest-journal-before-restore'); if (!previous) throw Error('No restore has been made yet.'); C.validate(previous); const r = await window.hub.saveFile({ defaultPath: 'hearth-quest-recovery.json', filters: [{ name: 'Quest journal', extensions: ['json'] }], content: JSON.stringify(previous, null, 2) }); notice(r ? 'Recovery copy exported. Use Restore backup to recover it.' : 'Export cancelled.'); })), p('One small start awards 5 XP once; completion awards the remainder. One spark is earned per five XP. Levels never drop from inactivity. Undoing a completion deliberately reverses its award.'))), 'qj-quiet'); nav.append(menu);
    status = E('p', { class: 'qj-status', attrs: { role: 'status', 'aria-live': 'polite' }, text: 'Opening your journal…' }); content = E('main', { class: 'qj-content' });
    const focusBar = E('div', { class: 'qj-focus', hidden: true }, E('span', { class: 'qj-focus-clock' }), E('span', { class: 'qj-focus-name' }), button('Pause', async () => { if (!left()) return questDetail(state.focus.quest); const remaining = left(); await mutate(s => { if (s.focus.end) { s.focus.remaining = remaining; s.focus.end = 0; } else s.focus.end = Date.now() + s.focus.remaining; }); }, 'qj-quiet', 'pause-timer'), button('End focus', () => mutate(s => { s.focus = null; }, 'Focus ended. Your quest is waiting whenever you are.'), 'qj-quiet'));
    root.append(top, nav, content, status, focusBar); await load();
    try { legacy = await window.hub.kvGet('creative-playground'); } catch { /* Old notebook is never modified. */ }
    clearInterval(ticker); ticker = setInterval(() => { if (H.activeId === 'tool:quests') tick(); }, 1000);
    const surface = body.closest('.surface'); if (surface) new MutationObserver(() => { if (H.activeId !== 'tool:quests') root.querySelectorAll('audio,video').forEach(v => v.pause()); }).observe(surface, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    document.addEventListener('visibilitychange', () => { if (document.hidden) root.querySelectorAll('audio,video').forEach(v => v.pause()); });
  }
  Tools.define({ id: 'quests', offRail: true, name: 'Quest journal', icon: '✦', color: '#d9b777', description: 'Creative campaigns, small steps and a life worth playing', mount: body => mount(body).catch(err => { body.textContent = `Journal could not open: ${err.message}`; }), onShow: () => { if (state) render(); } });
  Commands.register({ name: 'quests', area: 'Create', desc: 'Open your quest journal, campaigns, XP, skill tree and rewards', run: () => activate('tool:quests') });
  return { snapshot: () => C.clone(state), flush: () => saving, navigate, questDetail, get celebration() { return lastCelebration; } };
})();
