// ✦ Try what's new (round 64, newtour64). The owner hasn't tried rounds 61–63 yet: 13 short hands-on paths, one per
// new thing (trynew-core.js has them), each run on Hearth's own guided spotlight (tour.js: a ring on the real control,
// one small card; no new framework). A path opens the right place, rings the one control, suggests the exact command
// (Try it puts it in the chat box: Enter does it for real) and lets you Skip or do it Later.
//   · opening a place only shows it: nothing is saved unless you act (the commands are yours to send)
//   · progress on this computer (store trynew.progress): "7 of 13 tried" in What's new (Since you were away, the patch
//     notes of rounds 61–63) and in /try; a round's Try it runs its paths in order, skipping what you tried
//   · never nags: ONE Hints offer, ever (updater.js asks for it a minute after the start; Not now = forever)
//   · ways in: What's new (a Try it per round), Settings › What's new… › Try what's new, Ctrl/⌘+K, /try
// (round 71, whatsnew71) + five 1-minute themed tours of rounds 66–70 (trynew71-core.js: Paris nights · Sidequest · Music ·
// Help when it breaks · In the Lab), each step one sentence + Show me on the real button, and the one card after an update.
// Lazy group "trynew" (tier "use"), after "discover" (Tour).
const TryNew = (() => {
  const C = TryNewCore;
  const KEY = 'trynew.progress'; const OFFER = 'trynew.offer';
  const get = (k, d) => { try { return store.get(k, d); } catch { return d; } };
  const set = (k, v) => { try { store.set(k, v); } catch { /* storage is a convenience */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 6000) => { const end = Date.now() + ms; for (;;) { let v = null; try { v = fn(); } catch { /* not yet */ } if (v) return v; if (Date.now() > end) return null; await sleep(120); } };
  const prog = () => C.clean(get(KEY, {}));
  const emit = () => { try { dispatchEvent(new CustomEvent('hearth:trynew', { detail: { progress: prog() } })); } catch { /* nobody listens */ } };
  function mark(id, state) { const before = prog()[id]?.state; set(KEY, C.mark(prog(), id, state)); if (before !== prog()[id]?.state) emit(); }
  let chain = null; // { round, ids } while a round's paths run one after another

  // ---------- the places (each one only shows something) ----------
  const vis = (n) => Boolean(n && n.isConnected && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  const surfaceIs = (id) => H.surfaceIdFor?.(H.activeId) === id;
  async function studio(page) {
    await Lazy.load('questhud');
    await QuestHud.openStudio(null, page); // the Studio reads the journal; a missing one shows its first page, nothing is written
  }
  async function desk() {
    await Lazy.load('creative');
    if (!surfaceIs('tool:creative')) activate('tool:creative');
    const there = () => document.querySelector('.surface.active .wb-park-toggle, .surface.active .ph-win, .surface.active select[aria-label="Audio output"]');
    // the desk is there with its ✦ Preset window (the window leaves when the desk does: entering the station again brings it)
    if (await until(() => there() && document.querySelector('.surface.active .ph-win, .surface.active .ph-pill'), 1500)) return;
    // (round 71, whatsnew71) the Playground's own way to the Sound desk (its "Serum 2 & Vital" station button was renamed)
    if (typeof CreativePlayground !== 'undefined' && await until(() => document.querySelector('.surface.active .wb-stations'), 5000)) await CreativePlayground.openFeature('vst', { reuse: true });
    else (await until(() => [...document.querySelectorAll('.surface.active button')].find((b) => vis(b) && /^Serum 2 (&|and) Vital/.test(b.textContent.trim())), 5000))?.click();
    await until(there, 5000);
  }
  function chat() {
    if (document.querySelector('.surface.active .composer textarea') && vis(document.querySelector('.surface.active .composer textarea'))) return;
    activate(H.agent?.(H.activeId)?.mode === 'native' ? H.activeId : H.claudeAgent().id);
  }
  const OPEN = {
    chat: async () => { chat(); await until(() => vis(document.querySelector('.surface.active .composer textarea')), 3000); },
    // the Studio's own first page (not the map: opening the map puts the Paris guide into the journal — mapfirst64 —
    // so the map is always opened by the owner's click on Paris after hours)
    'studio:home': () => studio('adventure'),
    'studio:rewards': () => studio('rewards'),
    week: async () => { await Lazy.load('weekquest'); await WeekQuest.open('week'); },
    review: async () => { await Lazy.load('weekquest'); await WeekQuest.open('review'); },
    desk,
    lab: async () => { if (!surfaceIs('tool:three')) activate('tool:three'); await until(() => vis(document.querySelector('.surface.active [data-feature="Play"]')), 9000); },
    sounds: async () => { await Lazy.load('creative'); if (!document.querySelector('.sb-win:not([hidden])')) await SoundBank.open(); },
  };
  // a path's floating helpers from an earlier path (the week card, the Sound bank) go when another place opens: they'd
  // cover the control it rings (the ✦ Preset window folds away from the Sound bank)
  function clear(keep) {
    try { if (keep !== 'week' && keep !== 'review' && typeof WeekQuest !== 'undefined' && WeekQuest.isOpen()) WeekQuest.close(); } catch { /* fine */ }
    try { if (keep !== 'sounds' && typeof SoundBank !== 'undefined' && document.querySelector('.sb-win:not([hidden])')) SoundBank.close(); } catch { /* fine */ }
  }
  // a target: in an open dialog, the window on screen, then anywhere; scrolled into view (a control below the fold counts)
  const scopes = () => [...document.querySelectorAll('dialog[open]'), document.querySelector('.surface.active'), document].filter(Boolean);
  const shown = (n) => { if (!vis(n)) return null; n.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); return n; };
  // 'text:<label>': a visible button whose words start so
  const byText = (label) => () => { for (const sc of scopes()) { const b = [...sc.querySelectorAll('button')].find((x) => vis(x) && x.textContent.trim().startsWith(label)); if (b) return shown(b); } return null; };
  const bySel = (sel) => () => { for (const sc of scopes()) { const n = [...sc.querySelectorAll(sel)].find(vis); if (n) return shown(n); } return null; };
  const target = (list) => list.map((s) => (s.startsWith('text:') ? byText(s.slice(5)) : bySel(s)));
  const has = () => {
    const a = typeof Commands !== 'undefined' ? Commands.get('audio') : null;
    // (audiodoctor64: its 🎚 Check my audio setup button on the Sound desk)
    return { audiodoctor: typeof AudioDoctorDesk !== 'undefined' || Boolean(a && /doctor/i.test(`${a.args || ''} ${(a.examples || []).join(' ')} ${a.desc || ''}`)) };
  };

  // ---------- a path = a guided spotlight ----------
  function tourOf(p) {
    const steps = C.stepsFor(p, has()).map((s) => ({ title: s.title, text: s.text, clickNext: Boolean(s.clickNext), open: s.open ? async () => { clear(s.open); await OPEN[s.open](); } : null, target: target(s.target) }));
    return {
      id: `try-${p.id}`, name: p.name, icon: p.icon, why: p.why, steps, skippable: true,
      doneText: `${p.name}: tried ✓ · ${C.label(C.mark(prog(), p.id, 'tried'))}`,
      onTargetClick: () => mark(p.id, 'tried'), // clicking the ringed control = doing it
      onEnd: ({ done, how }) => {
        if (done) mark(p.id, 'tried'); else if (how === 'skip') mark(p.id, 'skipped'); else mark(p.id, 'later');
        if (typeof Usage !== 'undefined') Usage.track?.(`Try › ${p.name}`, { area: 'Tours', label: done ? 'done' : how || 'later' });
        // a round's Try it: the next path follows (Later stops the run)
        if (chain && (done || how === 'skip')) {
          chain.ids = chain.ids.filter((x) => x !== p.id);
          const nx = chain.ids.map(C.byId).find((x) => x && !C.isTried(prog(), x.id));
          if (nx) { setTimeout(() => run(nx), 450); return; }
          const r = chain.round; chain = null;
          toast(`Round ${r}: ${C.label(prog(), r)}. /try has the others.`, { timeout: 2600 });
        } else if (!done) chain = null;
      },
    };
  }
  function run(p) { if (!p) return null; return Tour.start(tourOf(p), { restart: C.isTried(prog(), p.id) || prog()[p.id]?.state === 'skipped' }); }
  // start(id | name) · startRound(61) (its untried paths in order; all tried → from the first again)
  function start(q) { const p = typeof q === 'object' ? q : C.find(q); Tour.stop(); chain = null; return p ? run(p) : null; }
  function startRound(r) {
    const n = Number(r); const list = C.PATHS.filter((x) => x.round === n);
    if (!list.length) return null;
    Tour.stop(); // (a path still running ends as paused first, so it can't end this run)
    const todo = C.queue(prog(), n);
    const ids = (todo.length ? todo : list).map((x) => x.id);
    chain = { round: n, ids };
    return run(C.byId(ids[0]));
  }
  function startNext() { Tour.stop(); const p = C.next(prog()); if (!p) { toast(`All ${C.PATHS.length} tried ✓`, { timeout: 2200 }); return null; } chain = { round: p.round, ids: C.queue(prog(), p.round).map((x) => x.id) }; return run(p); }

  // ---------- the menu (/try, Settings, Ctrl/⌘+K) ----------
  function menuItems() {
    const pr = prog();
    const mark1 = (x) => (pr[x.id]?.state === 'tried' ? '✓ tried' : pr[x.id]?.state === 'skipped' ? 'skipped' : pr[x.id]?.state === 'later' ? 'paused' : x.why);
    return [
      menuItems7(), // (round 71, whatsnew71) the tours of rounds 66–70 first
      { label: `✦ Try what's new · ${C.label(pr)}`, hint: 'the next one', action: () => startNext() },
      ...C.ROUNDS.map((r) => ({ label: `Round ${r}`, hint: C.label(pr, r), items: [
        { label: 'Try them in order', hint: C.label(pr, r), action: () => startRound(r) },
        ...C.PATHS.filter((x) => x.round === r).map((x) => ({ label: `${x.icon} ${x.name}`, hint: mark1(x), action: () => start(x) })),
      ] })),
    ];
  }
  function menu(at) {
    const r = (at || document.getElementById('keys-btn'))?.getBoundingClientRect();
    showMenu((r?.right || 80) + 6, Math.max(8, (r?.top || innerHeight) - 200), menuItems());
  }

  // ---------- What's new: a Try it per round + "7 of 13 tried" ----------
  // whatsNewRow(rounds) → a small row for the rounds of 61–63 in that list (null when none)
  function whatsNewRow(rounds) {
    const rs = C.ROUNDS.filter((r) => (rounds || []).map(Number).includes(r));
    if (!rs.length) return null;
    const row = el('div', { class: 'tn-row', attrs: { 'data-no-usage': '' } });
    const paint = () => {
      const pr = prog();
      row.replaceChildren(el('span', { class: 'tn-lead', text: '✦ Try it, hands-on:' }),
        ...rs.map((r) => el('button', { type: 'button', class: 'ghost small tn-round', dataset: { round: r }, text: `Round ${r} · ${C.count(pr, r).tried}/${C.count(pr, r).total}`, title: `A short guided path through each new thing of round ${r} (30–60 s each; nothing changes unless you do it)`, on: { click: () => { document.querySelector('dialog.wn-dialog[open], dialog.pn-dialog[open]')?.close(); window.WhatsNew?.closeCard?.(); startRound(r); } } })),
        el('span', { class: 'spacer' }),
        el('span', { class: 'tn-count hint', text: C.label(pr) }));
    };
    paint();
    addEventListener('hearth:trynew', () => { if (row.isConnected) paint(); });
    return row;
  }
  // patchNotesButton(round) → "✦ Try it · 2 of 5 tried" for a round with paths (null otherwise)
  function patchNotesButton(round) {
    const r = Number(round);
    if (!C.ROUNDS.includes(r)) return null;
    const c = C.count(prog(), r);
    return el('button', { type: 'button', class: 'ghost small tn-pn', dataset: { round: r }, text: `✦ Try it · ${c.tried} of ${c.total} tried`, title: `Hands-on: a short guided path through each new thing of round ${r} (${C.label(prog())} in all)`, on: { click: () => { document.querySelector('dialog.pn-dialog[open]')?.close(); startRound(r); } } });
  }

  // ---------- the one offer (Hints; updater.js asks a minute after the start) ----------
  let cardEl = null;
  function closeCard() { if (!cardEl) return; const c = cardEl; cardEl = null; c.classList.add('out'); setTimeout(() => c.remove(), 160); }
  function card() {
    closeCard();
    const never = () => { set(OFFER, 'off'); closeCard(); };
    cardEl = el('div', { class: 'speed-card tn-card', role: 'dialog', attrs: { 'aria-label': 'Try what\'s new', 'data-no-usage': '' } },
      el('div', { class: 'sr-head' }, el('b', { text: '✦ Try what\'s new' }), el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'sr-x', text: '×', title: 'Not now (it won\'t come back by itself)', attrs: { 'aria-label': 'Close' }, on: { click: never } })),
      el('p', { class: 'tn-text', text: `${C.PATHS.length} things from the last rounds you haven't tried yet: quests in Paris, live Serum 2 / Vital, park jams, shows, playtest notes… A short hands-on path each (30–60 s). Nothing changes unless you do it.` }),
      el('div', { class: 'tn-foot' },
        el('button', { type: 'button', class: 'small primary tn-go', text: 'Show me', on: { click: () => { set(OFFER, 'started'); closeCard(); startNext(); } } }),
        el('button', { type: 'button', class: 'ghost small tn-no', text: 'Not now', title: 'It won\'t come back by itself: What\'s new and /try have it any time', on: { click: never } }),
        el('span', { class: 'spacer' }),
        el('span', { class: 'hint', text: C.label(prog()) })));
    document.body.append(cardEl);
    return cardEl;
  }
  // offer() → Promise<boolean>: once ever (dismissed, started, all tried or already offered → nothing)
  function offer() {
    if (get(OFFER, null) || C.allTried(prog()) || !window.Hints || Hints.seen('trynew:offer')) return Promise.resolve(false);
    return Hints.offer({ id: 'trynew:offer', rank: 20, ttl: 15 * 60000, still: () => !get(OFFER, null), show: () => { set(OFFER, 'shown'); return card(); } });
  }

  // ---------- chat: /try ----------
  if (typeof Commands !== 'undefined' && !Commands.get('try')) {
    Commands.register({
      name: 'try', area: 'App', args: '[name | round <61–70> | tours | next | list | reset]',
      desc: 'Try what\'s new: short hands-on tours of rounds 61–70 (opens the place, rings the real button)',
      keywords: 'whats new tour tours try hands on guided quests paris nights serum vital park shows playtest hitch rewards sound bank preset walk week weekend ticket follow errand sessions reference controller daw slow broke direction finish credits moodboard',
      examples: ['/try', '/try tours', '/try nights', '/try round 62', '/try walk', '/try list'],
      complete: (args) => { const q = String(args || '').toLowerCase(); return [{ value: 'next' }, { value: 'list' }, { value: 'tours' }, ...TryNew71Core.TOURS.map((t) => ({ value: t.id, hint: t.name })), ...C.ROUNDS.map((r) => ({ value: `round ${r}` })), ...C.PATHS.map((p) => ({ value: p.id, hint: p.name })), { value: 'reset' }].filter((o) => o.value.startsWith(q)); },
      run: (args) => {
        const a = String(args || '').trim(); const w = a.toLowerCase().split(/\s+/);
        if (!a) { menu(); return ''; }
        if (w[0] === 'list') return `**✦ Try what's new** · ${C.label(prog())}\n${C.listText(prog())}`;
        if (w[0] === 'next') { startNext(); return ''; }
        if (w[0] === 'reset') { set(KEY, {}); set(KEY7, {}); emit(); return 'Try what\'s new: every path and tour is untried again.'; }
        if (w[0] === 'tours') { if (w[1] === 'list') return `**✦ The tours of rounds 66–70** · ${T7.label(prog7())}\n${T7.listText(prog7())}`; sinceCard({ manual: true }); return ''; } // (round 71, whatsnew71)
        if (T7.find(a) && !C.byId(C.norm(a))) { startTour(a); return ''; }
        if ((w[0] === 'round' || /^[67]\d$/.test(w[0])) && T7.forRound(w[0] === 'round' ? w[1] : w[0]).length) { startTours(T7.forRound(w[0] === 'round' ? w[1] : w[0]).map((t) => t.id)); return ''; } // (round 71) rounds 66–70: their tours
        if (w[0] === 'round' || /^6\d$/.test(w[0])) { const r = Number(w[0] === 'round' ? w[1] : w[0]); return startRound(r) ? '' : `No paths for round ${w[1] || w[0]}: ${C.ROUNDS.join(', ')}.`; }
        return start(a) ? '' : `No path called “${a}”. ${C.PATHS.map((p) => p.id).join(' · ')}`;
      },
    });
  }
  try { AppUI.addAction?.('Try what\'s new: hands-on paths through rounds 61–70', () => menu()); } catch { /* no palette */ }

  // ======================= (round 71, whatsnew71) the tours of rounds 66–70 =======================
  // Five short themed tours (trynew71-core.js): each step is one sentence and a "Show me" click that opens the place and
  // rings the real button (tour.js step.showMe). Ways in, all clicks: the one card after an update ("Since you were
  // last here: N updates — take the 1-minute tours?" · Later), the ✦ tracker's "✦ New tours", What's new and the patch
  // notes of rounds 66–70, Settings › What's new… › Try what's new (this menu), Ctrl/⌘+K.
  const T7 = TryNew71Core;
  const KEY7 = 'trynew.tours71'; const SINCE = 'trynew.since71';
  const prog7 = () => T7.clean(get(KEY7, {}));
  function mark7(id, state) { const before = prog7()[id]?.state; set(KEY7, T7.mark(prog7(), id, state)); if (before !== prog7()[id]?.state) emit(); }
  let chain7 = null; // the tour ids still to run after this one (Take the tours)

  // ---------- the places Show me opens (each one only shows something; nothing is saved by opening it) ----------
  const qjOpen = () => [...document.querySelectorAll('dialog.qj-dialog[open]')];
  const isShowCard = (d) => Boolean(d?.querySelector('.ls-toggle, .tk-btn, .iv-bring, .fw-row, .bg-open'));
  async function studioKit() {
    await Lazy.load('questhud');
    await QuestHud.openStudio(); // the Studio's first page (the map stays the owner's click)
    if (!(await until(() => typeof QuestJournal !== 'undefined' && QuestJournal.ready?.(), 6000))) return null;
    const ui = QuestJournal.paris?.ui?.(); return ui ? { ...ui, mutate: QuestJournal.mutate } : null;
  }
  // a show's card: the next show of the week with a time (its ⏰ / 🎒 need one), else any coming one; none cached → the list
  async function showCard() {
    if (isShowCard(qjOpen().at(-1))) return;
    qjOpen().forEach((d) => d.close());
    await Lazy.load('leavesoon').catch(() => {}); // the card's ⏰ Remind me to leave and 🎒 Before I go come with it
    try { LeaveSoon.attach?.(); } catch { /* it attaches itself */ }
    const kit = await studioKit();
    if (!kit || typeof ShowSync === 'undefined') return;
    await ShowSync.ensure?.().catch(() => {});
    const soon = (s) => s && !s.cancelled && !s.dateOnly && Number.isFinite(s.start) && s.start > Date.now();
    const s = ShowSync.week().find(soon) || ShowSync.upcoming().find(soon) || ShowSync.upcoming()[0];
    if (s) ShowSync.showDetail(kit, s); else ShowSync.listDialog(kit);
    await until(() => isShowCard(qjOpen().at(-1)), 3000);
  }
  async function map() {
    if (vis(document.querySelector('.surface.active .qml-open'))) return;
    await Lazy.load('questhud');
    await QuestHud.openStudio(null, 'world'); // the Paris map (Show me is the owner's click: as if he had clicked Map)
    await until(() => vis(document.querySelector('.surface.active .qml-open')) && document.querySelector('.surface.active .hp-btn'), 6000);
  }
  async function hud() {
    await Lazy.load('questhud'); if (!QuestHud.isOpen?.()) await QuestHud.open();
    const p = await until(() => vis(document.querySelector('.qh-panel')) && document.querySelector('.qh-panel'), 3000);
    await Promise.all((p?.getAnimations?.({ subtree: true }) || []).map((a) => a.finished.catch(() => {}))); // the ring goes on once it has slid in
  }
  async function sessions() {
    await desk();
    if (vis(document.querySelector('.bl-panel'))) return;
    document.querySelector('.surface.active .bl-open')?.click(); // Sessions only opens its list
    await until(() => vis(document.querySelector('.bl-panel')) && (document.querySelector('.bl-panel .sp-pad-btn') || !document.querySelector('.bl-panel .bl-sketch')), 5000);
  }
  async function settings() {
    if (!document.querySelector('dialog.settings-dialog[open]')) await AppUI.openSettings();
    const sd = await until(() => document.querySelector('dialog.settings-dialog[open]'), 4000);
    // Advanced › Housekeeping (and any fold around it)
    for (let d = sd?.querySelector('details[data-fold="hearth"]'); d && d !== sd; d = d.parentElement) if (d.tagName === 'DETAILS' && !d.open) d.open = true;
    // once the folds have opened (they animate), the key's button in the middle of the list, so the ring lands on it still
    await Promise.all((sd?.getAnimations?.({ subtree: true }) || []).map((a) => a.finished.catch(() => {})));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    [...(sd?.querySelectorAll('button') || [])].find((b) => b.textContent.trim().startsWith('Paris Métro status key'))?.scrollIntoView({ block: 'center' });
  }
  async function railMore() {
    try { hideMenu(); } catch { /* no menu */ }
    document.getElementById('rail-more')?.click(); // the ⋯ only opens its menu
    await until(() => vis(document.querySelector('#menu:not([hidden]) button')), 2000);
  }
  async function lab() {
    if (!surfaceIs('tool:three')) activate('tool:three');
    await Promise.all(['labdirection', 'labfinish', 'credits'].map((g) => Lazy.load(g).catch(() => {}))); // their chips (already there after the first quiet moment)
    await until(() => vis(document.querySelector('.surface.active .dir-chip')) && vis(document.querySelector('.surface.active .cr-open')), 9000);
  }
  async function drawer() {
    if (typeof BoardDrawer === 'undefined') await Lazy.load('board').catch(() => {});
    if (typeof BoardDrawer !== 'undefined' && !BoardDrawer.isOpen()) BoardDrawer.toggle(true);
    await until(() => vis(document.querySelector('.bdd .bdd-dist')) || vis(document.querySelector('.bdd')), 4000);
  }
  const OPEN7 = { hud, show: showCard, settings, map, desk, sessions, railmore: railMore, lab, drawer };
  // what an earlier step left open goes when another place opens (a show's card over the map, the ⋯ menu, the ✦ panel…)
  function clear7(keep) {
    try { hideMenu(); } catch { /* no menu */ }
    try { if (keep !== 'hud' && typeof QuestHud !== 'undefined' && QuestHud.isOpen?.()) QuestHud.close(); } catch { /* fine */ }
    if (keep !== 'show') qjOpen().forEach((d) => d.close());
    try { if (keep !== 'sessions' && typeof BounceLog !== 'undefined') BounceLog.closePanel(); } catch { /* fine */ } // its list sits over the desk's top row
    if (keep !== 'settings') document.querySelector('dialog.settings-dialog[open]')?.close();
    try { if (keep !== 'drawer' && typeof BoardDrawer !== 'undefined' && BoardDrawer.isOpen()) BoardDrawer.toggle(false); } catch { /* fine */ }
    clear(keep);
  }
  // 'menu:<label>': a row of the open ⋯ menu whose words start so
  const byMenu = (label) => () => [...document.querySelectorAll('#menu:not([hidden]) button')].find((b) => vis(b) && b.textContent.trim().startsWith(label)) || null;
  const target7 = (list = []) => list.map((s) => (s.startsWith('menu:') ? byMenu(s.slice(5)) : s.startsWith('text:') ? byText(s.slice(5)) : bySel(s)));
  // the step's own button, else (only when it can't show now) its fallback
  const targetOf = (s) => [...target7(s.target), ...target7(s.fallback)];

  function tour7(t) {
    const steps = t.steps.map((s) => ({ title: s.title, text: s.text, showMe: true, feature: s.id, open: async () => { clear7(s.open); await OPEN7[s.open](); }, target: targetOf(s) }));
    return {
      id: `try71-${t.id}`, name: t.name, icon: t.icon, why: t.why, steps, skippable: true,
      doneText: `${t.name}: seen ✓ · ${T7.label(T7.mark(prog7(), t.id, 'done'))}`,
      onEnd: ({ done, how }) => {
        try { hideMenu(); } catch { /* no menu */ }
        if (done) mark7(t.id, 'done'); else if (how === 'skip') mark7(t.id, 'skipped'); else mark7(t.id, 'later');
        if (typeof Usage !== 'undefined') Usage.track?.(`Try › ${t.name}`, { area: 'Tours', label: done ? 'done' : how || 'later' });
        if (chain7 && (done || how === 'skip')) {
          const nx = chain7.map(T7.byId).find((x) => x && x.id !== t.id && !['done', 'skipped'].includes(prog7()[x.id]?.state));
          chain7 = chain7.filter((x) => x !== t.id);
          if (nx) { setTimeout(() => run7(nx), 450); return; }
          chain7 = null;
          toast(`That's all of them: ${T7.label(prog7())}.`, { timeout: 2600 });
        } else if (!done) chain7 = null;
      },
    };
  }
  function run7(t) { if (!t) return null; return Tour.start(tour7(t), { restart: ['done', 'skipped'].includes(prog7()[t.id]?.state) }); }
  // startTour('nights') · startTours(['nights', 'music']) (the untaken ones in order; all taken → all again)
  function startTour(q) { const t = typeof q === 'object' ? q : T7.find(q); Tour.stop(); chain7 = null; return t ? run7(t) : null; }
  function startTours(ids = null) {
    Tour.stop();
    const todo = T7.queue(prog7(), ids);
    const list = (todo.length ? todo : T7.TOURS.filter((t) => !ids || ids.includes(t.id))).map((t) => t.id);
    if (!list.length) return null;
    chain7 = list;
    return run7(T7.byId(list[0]));
  }

  // ---------- the tour chips (the card, What's new, the patch notes) ----------
  const stateWord = (id) => ({ done: '✓', skipped: 'skipped', later: 'paused' })[prog7()[id]?.state] || '';
  function chips7(after = () => {}) {
    const row = el('div', { class: 'tn7-chips', attrs: { role: 'group', 'aria-label': 'The tours' } });
    const paint = () => row.replaceChildren(...T7.TOURS.map((t) => el('button', { type: 'button', class: `ghost small tn7-chip${prog7()[t.id]?.state === 'done' ? ' done' : ''}`, dataset: { tour: t.id }, text: `${t.icon} ${t.name}${stateWord(t.id) ? ` · ${stateWord(t.id)}` : ''}`, title: `${t.steps.length} steps, about a minute: ${t.why}`, on: { click: () => { after(); startTour(t); } } })));
    paint();
    addEventListener('hearth:trynew', () => { if (row.isConnected) paint(); });
    return row;
  }

  // ---------- the card: once after an update (Later = not by itself again), or from the ✦ tracker / a menu ----------
  let card7 = null;
  function closeCard7() { if (!card7) return; const c = card7; card7 = null; c.classList.add('out'); setTimeout(() => c.remove(), 160); }
  // sinceCard({ updates, j?, goBack?, manual? }): manual = asked for (no "since" wording, no one-time flag)
  function sinceCard({ updates = 0, from = 0, manual = false, goBack = null, j = null } = {}) {
    closeCard7(); closeCard();
    const later = () => { if (!manual) set(SINCE, 'later'); closeCard7(); };
    const lead = manual || !updates ? `Five short tours of what came in rounds 66–70 · ${T7.label(prog7())}` : T7.sinceText(updates);
    card7 = el('div', { class: 'speed-card tn-card tn7-card', role: 'dialog', attrs: { 'aria-label': 'Take the tours', 'data-no-usage': '' } },
      el('div', { class: 'sr-head' }, el('b', { text: manual ? '✦ The new tours' : '✦ Welcome back' }), el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'sr-x', text: '×', title: 'Later', attrs: { 'aria-label': 'Later' }, on: { click: later } })),
      el('p', { class: 'tn7-lead', text: lead }),
      el('p', { class: 'tn-text', text: 'Each step points at the real button, in one sentence; Show me takes you there. Nothing changes unless you click it.' }),
      chips7(() => { if (!manual) set(SINCE, 'started'); closeCard7(); }),
      el('div', { class: 'tn-foot' },
        el('button', { type: 'button', class: 'small primary tn7-go', text: 'Take the tours', on: { click: () => { if (!manual) set(SINCE, 'started'); closeCard7(); startTours(); } } }),
        el('button', { type: 'button', class: 'ghost small tn7-later', text: 'Later', title: 'It won\'t come back by itself: the ✦ chip\'s ✦ New tours has them any time', on: { click: later } }),
        el('span', { class: 'spacer' }),
        window.WhatsNew || typeof Lazy !== 'undefined' ? el('button', { type: 'button', class: 'ghost small tn7-what', text: 'What changed', title: 'Every change of these rounds, one line each', on: { click: () => { closeCard7(); Lazy.load('whatsnew').then(() => WhatsNew.open(from ? { since: from - 1 } : {})).catch(() => {}); } } }) : null,
        goBack && j ? el('button', { type: 'button', class: 'ghost small up-back', text: '↶ Go back', title: `Go back to the version before this update (${j.from}): your chats and data stay`, on: { click: () => { closeCard7(); goBack(); } } }) : null));
    document.body.append(card7);
    return card7;
  }
  // after an update / at the start: the card when sinceDue says so (→ the node, through the caller's Hints offer), else null
  //   seen: whatsnew.seen as Hearth started · rounds: the patch notes this copy has
  function since({ seen, rounds, j = null, goBack = null } = {}) {
    const due = T7.sinceDue({ seen, rounds, offered: get(SINCE, null), prog: prog7() });
    if (!due) return null;
    set(SINCE, 'shown');
    if (!get(OFFER, null)) set(OFFER, 'since71'); // the older offer (rounds 61–63) stays away: one card, not two
    try { store.set('whatsnew.seen', Math.max(Number(get('whatsnew.seen', 0)) || 0, due.to)); } catch { /* fine */ } // the digest is one click away on the card
    return sinceCard({ updates: due.updates, from: due.from, j, goBack });
  }
  // the start-up path (updater.js): through Hints as a notice (after the update note, one at a time)
  function offerSince({ seen, rounds } = {}) {
    if (!T7.sinceDue({ seen, rounds, offered: get(SINCE, null), prog: prog7() })) return false;
    const show = () => since({ seen, rounds });
    if (window.Hints) Hints.offer({ id: 'trynew:since71', kind: 'notice', rank: 1, ttl: 20 * 60000, show });
    else show();
    return true;
  }
  // the What's new row and the patch notes' button for rounds 66–70
  function whatsNewRow7(rounds) {
    if (!(rounds || []).map(Number).some((r) => T7.ROUNDS.includes(r))) return null;
    return el('div', { class: 'tn-row tn7-row', attrs: { 'data-no-usage': '' } }, el('span', { class: 'tn-lead', text: '✦ The 1-minute tours:' }),
      chips7(() => { document.querySelector('dialog.wn-dialog[open], dialog.pn-dialog[open]')?.close(); window.WhatsNew?.closeCard?.(); }));
  }
  function patchNotesButton7(round) {
    const ts = T7.forRound(round);
    if (!ts.length) return null;
    return el('button', { type: 'button', class: 'ghost small tn-pn', dataset: { round }, text: `✦ Show me · ${ts.map((t) => t.icon).join(' ')}`, title: `Short tours of this round's new things: ${ts.map((t) => t.name).join(', ')} (a minute each)`, on: { click: () => { document.querySelector('dialog.pn-dialog[open]')?.close(); startTours(ts.map((t) => t.id)); } } });
  }
  function menuItems7() {
    const pr = prog7();
    return { label: 'Rounds 66–70: the tours', hint: T7.label(pr), items: [
      { label: 'Take them in order', hint: T7.label(pr), action: () => startTours() },
      ...T7.TOURS.map((t) => ({ label: `${t.icon} ${t.name}`, hint: stateWord(t.id) || t.why, action: () => startTour(t) })),
    ] };
  }

  return { start, startRound, startNext, menu, menuItems, whatsNewRow, patchNotesButton, offer, card, closeCard, mark, progress: prog, get cardEl() { return cardEl; }, get chain() { return chain ? { ...chain } : null; },
    // (round 71, whatsnew71)
    startTour, startTours, since, offerSince, sinceCard, closeCard7, whatsNewRow7, patchNotesButton7, menuItems7, progress7: prog7, tour7, OPEN7, targetOf, get card7() { return card7; }, get chain7() { return chain7 ? [...chain7] : null; } };
})();
window.TryNew = TryNew;
