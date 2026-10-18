// ✦ Try what's new (round 64, newtour64). The owner hasn't tried rounds 61–63 yet: 13 short hands-on paths, one per
// new thing (trynew-core.js has them), each run on Hearth's own guided spotlight (tour.js: a ring on the real control,
// one small card; no new framework). A path opens the right place, rings the one control, suggests the exact command
// (Try it puts it in the chat box: Enter does it for real) and lets you Skip or do it Later.
//   · opening a place only shows it: nothing is saved unless you act (the commands are yours to send)
//   · progress on this computer (store trynew.progress): "7 of 13 tried" in What's new (Since you were away, the patch
//     notes of rounds 61–63) and in /try; a round's Try it runs its paths in order, skipping what you tried
//   · never nags: ONE Hints offer, ever (updater.js asks for it a minute after the start; Not now = forever)
//   · ways in: What's new (a Try it per round), Settings › What's new… › Try what's new, Ctrl/⌘+K, /try
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
    const btn = await until(() => [...document.querySelectorAll('.surface.active button')].find((b) => vis(b) && /^Serum 2 (&|and) Vital/.test(b.textContent.trim())), 5000);
    btn?.click();
    await until(there, 5000);
  }
  function chat() {
    if (document.querySelector('.surface.active .composer textarea') && vis(document.querySelector('.surface.active .composer textarea'))) return;
    activate(H.agent?.(H.activeId)?.mode === 'native' ? H.activeId : H.claudeAgent().id);
  }
  const OPEN = {
    chat: async () => { chat(); await until(() => vis(document.querySelector('.surface.active .composer textarea')), 3000); },
    'studio:world': () => studio('world'),
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
      name: 'try', area: 'App', args: '[name | round <61–63> | next | list | reset]',
      desc: 'Try what\'s new: a short hands-on path through each new thing of rounds 61–63 (opens the place, rings the control, suggests the command)',
      keywords: 'whats new tour try hands on guided quests paris serum vital park shows playtest hitch rewards sound bank preset walk week',
      examples: ['/try', '/try round 62', '/try walk', '/try next', '/try list'],
      complete: (args) => { const q = String(args || '').toLowerCase(); return [{ value: 'next' }, { value: 'list' }, ...C.ROUNDS.map((r) => ({ value: `round ${r}` })), ...C.PATHS.map((p) => ({ value: p.id, hint: p.name })), { value: 'reset' }].filter((o) => o.value.startsWith(q)); },
      run: (args) => {
        const a = String(args || '').trim(); const w = a.toLowerCase().split(/\s+/);
        if (!a) { menu(); return ''; }
        if (w[0] === 'list') return `**✦ Try what's new** · ${C.label(prog())}\n${C.listText(prog())}`;
        if (w[0] === 'next') { startNext(); return ''; }
        if (w[0] === 'reset') { set(KEY, {}); emit(); return 'Try what\'s new: every path is untried again.'; }
        if (w[0] === 'round' || /^6\d$/.test(w[0])) { const r = Number(w[0] === 'round' ? w[1] : w[0]); return startRound(r) ? '' : `No paths for round ${w[1] || w[0]}: ${C.ROUNDS.join(', ')}.`; }
        return start(a) ? '' : `No path called “${a}”. ${C.PATHS.map((p) => p.id).join(' · ')}`;
      },
    });
  }
  try { AppUI.addAction?.('Try what\'s new: hands-on paths through rounds 61–63', () => menu()); } catch { /* no palette */ }

  return { start, startRound, startNext, menu, menuItems, whatsNewRow, patchNotesButton, offer, card, closeCard, mark, progress: prog, get cardEl() { return cardEl; }, get chain() { return chain ? { ...chain } : null; } };
})();
window.TryNew = TryNew;
