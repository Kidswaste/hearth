// Paris guide in Sidequest Studio (round 61, parisquests61). The data and rules live in tools/quest-paris.js; this
// file adds them to Codex's map (a few notes + one button in the place panel, one "Paris guide" button in the map's
// footer, a removable filter chip) and drives everything from chat with `/quest`. Every write goes through the
// journal's own transactional mutate (QuestJournal.paris), so the open journal never overwrites it.
const QuestParisUI = window.QuestParisUI = (() => { // also on window: quest-journal.js reaches it as window.QuestParisUI (optional hook)
  const P = QuestParis, C = QuestCore;
  const J = () => QuestJournal.paris, ui = () => J().ui();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const guideCount = P.guide.length;
  // Opens the journal (mounting it the first time) and waits until it has loaded safely.
  async function journal() {
    if (H.activeId !== 'tool:quests') activate('tool:quests');
    for (let i = 0; i < 200 && !J().ready(); i++) await wait(50);
    if (!J().ready()) throw Error('The quest journal is not ready (it may be in recovery mode). Open it with /quests first.');
  }
  const state = () => ui().state();
  // Map hooks (called from quest-journal.js's worldMap / mapPlaces).
  function keep(place, word) { const g = P.byId(place.id); return word === 'mine' ? !g : g ? P.matches(g, word) : false; }
  function words(place) { const g = P.byId(place.id); return g ? P.words(g) : ''; }
  function filterName(word) { const arr = String(word).match(/^(\d{1,2})(?:e|er|eme)?$/); return arr ? P.arrLabel(+arr[1]) : P.TAGS[word] || C.mapKinds.find(k => k.id === word)?.name || (word === 'mine' ? 'My own places' : word); }
  function chip(word, clear) { const b = ui().button('Paris guide: ' + filterName(word) + ' ×', clear, 'qj-quiet qj-paris-chip'); b.setAttribute('aria-label', 'Clear the Paris guide filter (' + filterName(word) + ')'); return b; }
  const placeCampaign = (s, pid) => s.campaigns.find(c => c.id === P.campaignId(pid));
  function panel(selected, host) {
    const g = P.byId(selected.id); if (!g) return;
    const { E, button, p, questDetail, mutate } = { ...ui(), mutate: J().mutate };
    host.append(E('div', { class: 'qj-paris-note' }, p(`${P.arrLabel(g.arr)} · ${g.why}`), p('Best: ' + g.best, 'qj-paris-best')));
    if(g.url)host.append(button('Programme & access',()=>window.hub.openExternal(g.url),'qj-quiet'));
    if (!P.guide.some(x => x.id === g.id)) return;
    const s = state(), c = placeCampaign(s, g.id), next = c && C.next(s, c);
    if (c && C.campaignDone(s, c)) host.append(E('p', { class: 'qj-copy qj-paris-best', text: 'Place quest finished ✓' }));
    else host.append(button(c ? 'Place quest: ' + (next?.title || 'continue') : 'Place quest: go → do → proof', async () => {
      const camp = c || await mutate(st => P.startPlace(st, g.id), 'Place quest saved: go → do → proof.');
      const q = C.next(state(), camp) || camp.quests[0]; questDetail(q.id);
    }, 'qj-quiet qj-paris-start'));
  }
  function footer() { if (typeof QuestJournal === 'undefined' || !J()?.ready()) return null; const b = ui().button('Paris guide', guideDialog, 'qj-quiet qj-paris-guide'); b.dataset.help = guideCount + ' places to see and personal quests · /quest paris'; return b; }
  function guideDialog() {
    const { E, button, label, p, dialog, questDetail } = ui(), mutate = J().mutate;
    dialog('Paris guide', (body, d) => {
      const s = state(), on = P.hasGuide(s);
      body.append(p(`${guideCount} places worth the trip, famous and lesser-known, each with a small quest: go, do one specific thing, bring proof home. Check opening times before you go.`));
      const toggle = button(on ? 'Take untouched guide pins off' : 'Put the guide on my map', async () => { const n = await mutate(st => on ? P.removeGuide(st) : P.addGuide(st).added, on ? 'Untouched guide pins removed. Visited, starred and quest pins stay.' : 'Paris guide added to your map.'); d.close(); if (!on) J().mapFilter({}); return n; }, on ? 'qj-quiet' : 'qj-primary');
      body.append(window.QuestWalk ? E('div', { class: 'qj-actions' }, toggle, QuestWalk.guideButton(d)) : toggle); // (round 63, questwalk63) "Make a walk" beside it, in the same line
      body.append(label('SHOW ON THE MAP'));
      const tags = E('div', { class: 'qj-actions qj-paris-tags' });
      for (const [id, name] of Object.entries(P.TAGS)) tags.append(button(name, async () => { if (!P.hasGuide(state())) await mutate(st => P.addGuide(st), 'Paris guide added to your map.'); d.close(); J().mapFilter({ guide: id }); }, 'qj-quiet'));
      body.append(tags, label('PERSONAL QUESTS'));
      const grid = E('div', { class: 'qj-field-rack' });
      for (const t of P.personal) {
        const c = s.campaigns.find(c => c.id === t.id), done = c && C.campaignDone(s, c);
        const b = button('', async () => { const camp = await mutate(st => P.startPersonal(st, t.key), t.title + ' is in your notebook.'); d.close(); questDetail((C.next(state(), camp) || camp.quests[0]).id); }, 'qj-field-card');
        b.dataset.personal = t.key; b.append(QuestAtlas.icon(t.path === 'music' ? 'music' : t.key === 'airpods' ? 'target' : 'social'), E('strong', { text: t.title }), E('span', { text: done ? 'Finished ✓' : c ? 'In notebook · ' + c.quests.filter(q => C.done(s, q.id)).length + '/' + c.quests.length : t.steps.length + ' steps · ' + t.steps.reduce((n, x) => n + x[4], 0) + ' XP' }));
        grid.append(b);
      }
      body.append(grid, p('In chat: /quest paris [shows · records · 11e…], /quest walk [11e · records…] [3h], /quest go <place>, /quest add <airpods · park · drink · gig · openmic · records · sunrise · solo>, /quest list.', 'qj-paris-best'));
    }, 'SIDEQUEST STUDIO / PARIS');
  }
  // ---------- chat: /quest ----------
  const SUBS = [['paris', 'Show the Paris guide on the map (optionally filtered: shows, records, park, 11e…)'], ['places', 'List the guide’s places here in the chat'], ['go', 'Start a place’s go → do → proof quest'], ['add', 'Add a personal quest: ' + P.personal.map(t => t.key).join(', ')], ['park', 'Make music at the park: start a workbench sketch named after it'], ['list', 'Your Paris quests and their steps'], ['guide', 'guide off: take untouched guide pins off the map · guide on: put them back']];
  function help() { return 'Paris quests:\n' + SUBS.map(([k, d]) => `/quest ${k} · ${d}`).join('\n'); }
  function placeLine(g) { return `• ${g.name} (${P.arrLabel(g.arr)}) · ${g.why}`; }
  async function startPlace(g) {
    await journal();
    const c = await J().mutate(s => P.startPlace(s, g.id), 'Place quest saved: go → do → proof.');
    J().mapFilter({}); const next = C.next(state(), c) || c.quests[0];
    ui().questDetail(next.id);
    return `${g.name} (${P.arrLabel(g.arr)}): ${c.quests.map((q, i) => (i + 1) + '. ' + q.title + (C.done(state(), q.id) ? ' ✓' : '')).join(' → ')}. Each step finishes with proof + review in the journal. Best: ${g.best}`;
  }
  async function startPersonal(t, extra, ctx) {
    await journal();
    const c = await J().mutate(s => P.startPersonal(s, t.key, { park: extra }), t.title + ' is in your notebook.');
    const next = C.next(state(), c) || c.quests[0]; ui().questDetail(next.id);
    const steps = c.quests.map((q, i) => (i + 1) + '. ' + q.title + (C.done(state(), q.id) ? ' ✓' : '')).join(' → ');
    if (t.url && ctx?.note) { ctx.note(`${t.title}: ${steps}`, { id: 'quest-' + t.key, actions: [{ label: 'Open apple.com/fr', run: () => window.hub.openExternal(t.url) }] }); return; }
    return `${t.title}: ${steps}`;
  }
  async function parkSketch(word) {
    const pid = P.parks[fold(word).replace(/\s+/g, '-')] || (word && P.findPlace(word)?.id) || 'place-buttes';
    await journal();
    await J().mutate(s => P.startPersonal(s, 'park', { park: pid }), 'Make music at the park is in your notebook.');
    const title = P.sketchTitle(pid);
    await Lazy.load('creative');
    const before = await WorkbenchUI.startSketch(title);
    activate('tool:creative'); CreativePlayground.openFeature('vst');
    return `Workbench sketch “${title}” started on the Serum 2 & Vital desk${before && before !== title ? ` (the worktable was “${before}”; rename it under ◈ if you like)` : ''}. Make two minutes outside, then bounce it as your proof.`;
  }
  async function run(args, ctx) {
    const [sub = '', ...rest] = String(args || '').trim().split(/\s+/), arg = rest.join(' '), key = fold(sub);
    if (!key || key === 'help') return help();
    if (key === 'paris' || key === 'map') {
      await journal();
      const s = state(); if (!P.hasGuide(s)) { const r = await J().mutate(st => P.addGuide(st), 'Paris guide added to your map.'); if (r.full) ctx?.say?.(`${r.full} guide places did not fit (the map holds 100 places).`); }
      J().mapFilter(arg ? { guide: fold(arg) } : {});
      const shown = arg ? P.guide.filter(g => P.matches(g, arg)).length : guideCount;
      return `Paris guide on your map: ${shown} place${shown === 1 ? '' : 's'}${arg ? ` for “${arg}”` : ''}. Pick a pin for its quest, or /quest go <place>.`;
    }
    if (key === 'places' || key === 'guide' && !arg) { const list = P.guide.filter(g => P.matches(g, arg)); return list.length ? list.map(placeLine).join('\n') : `No guide place matches “${arg}”. Try shows, records, night, park, view, art, free or an arrondissement (11e).`; }
    if (key === 'guide') {
      await journal();
      if (/^(off|remove|hide)$/.test(fold(arg))) { const n = await J().mutate(s => P.removeGuide(s), 'Untouched guide pins removed.'); return `${n} untouched guide pins taken off. Visited, starred and quest pins stay.`; }
      const r = await J().mutate(s => P.addGuide(s), 'Paris guide added to your map.'); J().mapFilter({}); return `${r.added} guide places added${r.full ? `, ${r.full} did not fit` : ''}.`;
    }
    if (key === 'go' || key === 'start' || key === 'place') { const g = P.findPlace(arg); if (!g || !P.guide.includes(g)) return `No guide place called “${arg}”. /quest places lists them.`; return startPlace(g); }
    if (key === 'add') { const t = P.findPersonal(rest[0] || ''); if (!t) return 'Add one of: ' + P.personal.map(t => `${t.key} (${t.title})`).join(', ') + '.'; return startPersonal(t, rest.slice(1).join(' '), ctx); }
    if (key === 'park') return parkSketch(arg);
    if (key === 'list' || key === 'progress') {
      await journal(); const list = P.progress(state());
      return list.length ? list.map(x => `• ${x.title}: ${x.done}/${x.total}${x.done === x.total ? ' ✓' : x.next ? ' · next: ' + x.next.title : ''}${x.paused ? ' (resting)' : ''}`).join('\n') : 'No Paris quests yet. /quest paris shows the map; /quest add airpods starts your errand.';
    }
    // "/quest airpods", "/quest bataclan": a personal quest or a place by name.
    const t = P.findPersonal(args); if (t && fold(args).length > 2) return startPersonal(t, '', ctx);
    const g = P.findPlace(args); if (g && P.guide.includes(g)) return startPlace(g);
    return help();
  }
  function complete(args) {
    const parts = String(args || '').split(/\s+/), sub = fold(parts[0]);
    if (parts.length <= 1) return SUBS.map(([value, hint]) => ({ value, hint })).filter(x => x.value.startsWith(sub));
    const rest = fold(parts.slice(1).join(' '));
    const pool = sub === 'add' ? P.personal.map(t => ({ value: 'add ' + t.key, label: t.title })) : sub === 'go' ? P.guide.map(g => ({ value: 'go ' + g.id.replace(/^(pp|place)-/, ''), label: g.name, hint: P.arrLabel(g.arr) })) : sub === 'park' ? ['buttes', 'belleville', 'luxembourg', 'villette'].map(k => ({ value: 'park ' + k })) : ['paris', 'places'].includes(sub) ? Object.keys(P.TAGS).map(k => ({ value: sub + ' ' + k, hint: P.TAGS[k] })) : sub === 'guide' ? ['on', 'off'].map(k => ({ value: 'guide ' + k })) : [];
    return pool.filter(x => fold(x.value.slice(sub.length + 1)).startsWith(rest) || fold(x.label || '').includes(rest)).slice(0, 40);
  }
  // (round 61, questhud61) one /quest command: the rail's quest tracker (questhud.js) registers it and passes these
  // words (paris, places, guide, go, add, park, list, help, a place / personal quest by name) to run() / complete() here
  return { keep, words, chip, panel, footer, guideDialog, run, complete, journal };
})();
