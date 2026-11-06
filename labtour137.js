// ◈ What's new in the Lab (round 137, tour137): rounds 128–136 brought the Lab many new things in a short time. This
// is one short tour of them and one list of all of them. docs/upgrades/tour137.md.
//   · the note: offered ONCE, through Hints (one at a time, a Lab tip, silenced by Don't show tips), the first time the
//     Lab opens after this update: "◈ New in the Lab: 12 things · Show me (2 min) · Later · ✕". Shown = remembered
//     (store labtour137.note); Later or ✕ only say how it ended. It never comes back by itself
//   · the tour: the guided spotlight of tour.js (a ring on the real control, one small card): 12 steps, each with
//     Show me, Next and Skip tour. A control in a folded menu: the step opens that menu first, and scrolls a panel
//     to it at any window size. Show me opens the feature: on the owner's scene when it only shows something and costs
//     nothing (a card that shows its cost first, a list, a measurement), else on a demo copy of the scene, made for the
//     tour and removed when it ends (the owner's scene is opened again, never changed). The tour sends nothing to an AI
//   · Lab features…: every Lab feature since round 128 (labtour137-data.js), searchable, one line each, with Open. Open
//     goes through Hearth's own Ctrl/⌘+K actions and chat commands (or the tour step's place), so it stays in sync
//   · ways in: Ctrl/⌘+K "Lab: what's new" and "Lab features…", the ✦ Since you were away card and dialog
//     (whatsnew.js), Settings › Updates & what's new › What's new…
// Lazy group "labtour137" (follows the Lab: it loads once the Lab is in, after the calm start).
const LabTour = (() => {
  const D = LabTourData;
  const NOTE = 'labtour137.note'; // { v, how: 'shown' | 'tour' | 'later' | 'closed', at }
  const get = (k, d) => { try { return store.get(k, d); } catch { return d; } };
  const set = (k, v) => { try { store.set(k, v); } catch { /* storage is a convenience */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const until = async (fn, ms = 3000) => { const end = Date.now() + ms; for (;;) { let v = null; try { v = await fn(); } catch { /* not yet */ } if (v) return v; if (Date.now() > end) return null; await sleep(80); } };
  const stats = { notes: 0, tours: 0, shows: [], opens: [], demo: 0, ended: '' };
  // a lazy group's module, only when it is in (touching its name before would load it)
  const mod = (g, get1) => { try { return !window.Lazy || Lazy.isIn(g) ? get1() : null; } catch { return null; } };
  const need = async (g) => { if (window.Lazy && !Lazy.isIn(g)) await Lazy.load(g); };

  // ---------- the Lab's controls ----------
  const labEl = () => { try { return H.surfaces?.get?.('tool:three')?.el || null; } catch { return null; } };
  const inLab = () => { try { return H.surfaceIdFor?.(H.activeId) === 'tool:three'; } catch { return false; } };
  const drawn = (n) => Boolean(n?.isConnected && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  const q = (sel) => [...(labEl()?.querySelectorAll(sel) || [])];
  const pick = (sel, re) => q(sel).find((b) => drawn(b) && (!re || re.test(b.textContent.trim()) || re.test(b.title || ''))) || null;
  const into = (n) => { try { n?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch { /* fine */ } return n || null; };
  const rowIn = (re) => [...document.querySelectorAll('.mb-menu.lab-pop > .menu-item, #menu > button, #menu-fly > button')].find((b) => drawn(b) && re.test(b.textContent)) || null;
  function closeMenus() { try { hideMenu(); } catch { /* no menu */ } document.querySelector('.mb-menu.lab-pop')?.remove(); }
  async function openLab() {
    if (!inLab()) activate('tool:three');
    await need('lab');
    await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.currentId?.(), 20000);
    try { await ThreeLab.cmd?.({ show: true }); } catch { /* the Lab shows as it is */ }
    await until(() => q('.ly-row[data-id]').length, 4000);
  }
  // the Sliders panel (layers + sliders) open: the ⋯ menus of the layer list and the sliders live there
  async function sliders() {
    if (pick('.tw-more') && pick('.ly-more')) return;
    const b = pick('.tb-iconic', /Sliders/);
    if (b && !b.classList.contains('on')) b.click();
    await until(() => pick('.tw-more'), 2000);
  }
  // a menu opened from a control (a click, or a right-click), then a row in it, through its submenus (path); a row that
  // isn't at the top is looked for one submenu down (the menus fold their rarer rows)
  async function viaMenu(opener, path, { ctx = false } = {}) {
    closeMenus();
    const b = into(opener());
    if (!b) return null;
    await frame();
    const r = b.getBoundingClientRect();
    const fire = (bubbles) => b.dispatchEvent(new MouseEvent('contextmenu', { bubbles, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 2 }));
    if (ctx) fire(false); else b.click();
    if (ctx && !(await until(() => document.querySelector('.mb-menu.lab-pop, #menu:not([hidden])'), 600))) fire(true);
    let row = null;
    for (let k = 0; k < path.length; k += 1) {
      row = await until(() => rowIn(path[k]), 2000);
      if (!row && k === path.length - 1) row = await deep(path[k]);
      if (!row) return null;
      if (k < path.length - 1) { row.click(); await frame(); }
    }
    if (ctx && row?.closest('.mb-menu.lab-pop')) { try { hideMenu(); } catch { /* only the Lab's menu */ } }
    return row;
  }
  async function deep(re) {
    const subs = [...document.querySelectorAll('.mb-menu.lab-pop > .menu-item.has-sub, #menu > button.has-sub')].filter((b) => drawn(b) && !/Customise/.test(b.textContent));
    for (const s of subs) {
      const label = s.querySelector('b')?.textContent || s.textContent;
      const again = () => [...document.querySelectorAll('.mb-menu.lab-pop > .menu-item.has-sub, #menu > button.has-sub')].find((b) => drawn(b) && (b.querySelector('b')?.textContent || b.textContent) === label);
      const sub = again(); if (!sub) continue;
      sub.click(); await frame(); await sleep(60);
      const hit = rowIn(re);
      if (hit) return hit;
      (document.querySelector('.mb-menu.lab-pop > .menu-back') || [...document.querySelectorAll('#menu > button')].find((b) => /‹ back/.test(b.textContent)))?.click();
      await frame();
    }
    return null;
  }
  const labMore = () => pick('button', /^More: variations/) || q('button').find((b) => drawn(b) && /^More:/.test(b.title || '') && b.textContent.trim() === '⋯');
  const present = () => pick('.tb-iconic', /Present/);
  const preview = () => q('.three-preview').find(drawn) || null;
  const sketchBtn = () => q('button').find((b) => drawn(b) && /^Sketch\s*▾/.test(b.textContent.trim())) || null;
  const tw = () => pick('.tw-more');
  // each step's control: opens what hides it, scrolls it into view, returns it
  const AT = {
    async critique() {
      let b = pick('.dd-crit');
      if (!b) { const t = pick('.dock-toggle'); if (t && !t.classList.contains('on')) { t.click(); b = await until(() => pick('.dd-crit'), 2500); } }
      return into(b || pick('.dock-toggle'));
    },
    async explain() { await sliders(); return viaMenu(tw, [/Explain this layer/]); },
    async layers() { await sliders(); return into(pick('.ly-more')); },
    versions: () => viaMenu(sketchBtn, [/^History/, /Scene versions/]),
    speed: () => viaMenu(labMore, [/Speed check/]),
    render: () => into(pick('.sq-render-tab')),
    perform: () => viaMenu(present, [/◉ Perform/], { ctx: true }),
    mywork: () => into(preview()),
    async dials() { await sliders(); return viaMenu(tw, [/Dials/]); },
    async follow() { await sliders(); return viaMenu(tw, [/Follow the music/]); },
    blocks: () => viaMenu(labMore, [/Blocks/]),
    campath: () => into(preview()),
  };
  const at = {}; // the step's control, found by its open()

  // ---------- the demo copy (Show me where a change could happen) ----------
  const demoState = { id: null, own: null };
  const scenes = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  async function toDemo() {
    const S = scenes();
    if (!S) throw new Error('The Lab is not open yet.');
    if (demoState.id && S.get(demoState.id)) {
      if (S.currentId() !== demoState.id) { S.open(demoState.id); await until(() => S.currentId() === demoState.id, 6000); await until(() => q('.ly-row[data-id]').length, 4000); }
      return true;
    }
    const own = S.currentId();
    const src = S.get(own);
    if (!src) throw new Error('Open a scene in the Lab first.');
    const layers = JSON.parse(JSON.stringify(S.layersOf(src) || null));
    demoState.own = own;
    const x = S.create({ name: '◈ Tour demo (a copy, removed after the tour)', code: src.code ?? layers?.[0]?.code ?? '', layers, frame: S.frameOf?.(own) || null });
    S.open(x.id); // (not create's open: that saves the scene left even when nothing changed, a new date on it)
    demoState.id = x.id;
    stats.demo += 1;
    await until(() => S.currentId() === x.id, 6000);
    await until(() => q('.ly-row[data-id]').length, 4000);
    toast('A demo copy of your scene: try anything here. Yours stays as it is.', { timeout: 3200 });
    return true;
  }
  async function endDemo() {
    const S = scenes();
    if (!S || !demoState.id) return;
    const { id, own } = demoState;
    demoState.id = null;
    if (own && S.get(own) && S.currentId() !== own) { S.open(own); await until(() => S.currentId() === own, 6000); }
    if (S.get(id)) S.remove(id);
  }

  // ---------- Show me ----------
  // close what an earlier Show me opened (only modules already in: touching one would load it)
  async function tidy() {
    closeMenus();
    for (const d of document.querySelectorAll('dialog.mw[open], dialog.lx-panel[open]')) d.close(); // My work, the Render card (a Show me opened them)
    const C = [['critique', () => LabCritique], ['explain', () => LabExplain], ['scenevers', () => LabVersions], ['speedcheck', () => LabSpeed], ['dials', () => LabDials], ['blocks', () => LabBlocks], ['audiomap', () => FollowMusic]];
    for (const [g, m] of C) { try { mod(g, m)?.close?.(); } catch { /* it closes itself */ } }
    try { const cp = mod('campath', () => CamPath); if (cp?.on) cp.leave(); } catch { /* not drawing */ }
    await frame();
  }
  const ring = (n, label) => { try { if (n && mod('discover', () => Tour)) Tour.pulse(n, { label, ms: 3600 }); } catch { /* the ring is a nicety */ } return n; };
  const SHOW = {
    async critique() { await need('critique'); await LabCritique.open(); },
    async explain() { closeMenus(); await need('explain'); await LabExplain.open(); },
    async layers() { ring(await viaMenu(() => pick('.ly-more'), [/Name these for me/]), 'free, on your computer'); },
    async versions() { closeMenus(); await need('scenevers'); await LabVersions.open(); },
    async speed() { closeMenus(); await need('speedcheck'); await LabSpeed.open(); },
    // the Render card itself (LabExport.panel: only shows; not the ⇪ Render tab's click, which puts the scene in its sequence first)
    async render() { await need('renderpre'); await LabExport.panel(); await until(() => [...document.querySelectorAll('dialog.lx-panel[open] .rp-row')].find(drawn), 4000); },
    async perform() { const r = (await viaMenu(present, [/Live on my phone/], { ctx: true })) || (await viaMenu(present, [/Live on my phone/], { ctx: true })); if (!r) (stats.errors ||= []).push('perform: no menu'); ring(r, 'on your Wi-Fi'); },
    async mywork() { await need('mywork'); await MyWork.open({ mode: 'lab', kind: 'layer' }); },
    async dials() { await toDemo(); await need('dials'); await LabDials.open({ anchor: tw() }); },
    async follow() {
      await toDemo(); await sliders();
      const r = await viaMenu(tw, [/Follow the music/]);
      if (!r) return 'This layer has no number slider to follow the music.';
      r.click();
      // then the layer's number sliders: the first one opens the card (a live preview; Keep or not)
      const first = await until(() => [...document.querySelectorAll('.mb-menu.lab-pop > .menu-item:not(.menu-back):not(.has-sub)')].find(drawn), 2000);
      first?.click();
      return '';
    },
    async blocks() { await toDemo(); await need('blocks'); await LabBlocks.open(); },
    async campath() { await toDemo(); await need('campath'); await CamPath.start(); return 'Click points on the picture. Esc or Done to finish (it is the demo copy).'; },
  };
  async function showMe(id) {
    stats.shows.push(id);
    await tidy();
    try { const r = await SHOW[id]?.(); return typeof r === 'string' ? r : ''; } catch (err) { (stats.errors ||= []).push(`${id}: ${err?.message || err}`); throw err; }
  }

  // ---------- the tour ----------
  function tour() {
    return {
      id: 'lab137', name: 'What\'s new in the Lab', icon: '◈', why: `the Lab's new things since round ${D.FROM}`,
      skippable: true, noLater: true, escSoft: true, skipText: 'Skip tour', skipTip: 'End the tour (Ctrl/⌘+K › Lab: what\'s new brings it back)',
      doneText: 'That\'s the tour. Ctrl/⌘+K › Lab features… lists everything new, with Open.',
      steps: D.STEPS.map((s) => ({
        id: s.id, title: s.title, text: s.text,
        open: async () => { await tidy(); at[s.id] = await AT[s.id](); },
        target: () => (drawn(at[s.id]) ? at[s.id] : null),
        demo: () => showMe(s.id),
        demoTip: s.show === 'demo' ? 'Opens it on a demo copy of your scene: yours stays as it is' : 'Opens it on your scene: it only shows, it changes nothing and costs nothing',
      })),
      onEnd: ({ done, how }) => { stats.ended = how || (done ? 'done' : 'paused'); tidy().then(endDemo).catch((err) => console.warn('lab tour end', err)); },
    };
  }
  async function start({ restart = false } = {}) {
    closeNote();
    await need('discover');
    await openLab();
    // what Show me opens, loaded while the first steps are read (small groups: Show me then opens at once)
    for (const g of ['critique', 'explain', 'scenevers', 'speedcheck', 'renderpre', 'mywork', 'dials', 'blocks', 'campath']) need(g).catch(() => {});
    stats.tours += 1;
    return Tour.start(tour(), { restart });
  }

  // ---------- the note (once) ----------
  const decided = () => Number(get(NOTE, null)?.v || 0) >= D.VERSION;
  const decide = (how) => set(NOTE, { v: D.VERSION, how, at: Date.now() });
  let noteEl = null;
  function closeNote() { if (!noteEl) return; const n = noteEl; noteEl = null; n.classList.add('out'); setTimeout(() => n.remove(), 160); }
  function note() {
    if (decided()) return null;
    decide('shown'); // shown once: it never comes back by itself, whatever is clicked
    closeNote();
    const b = (text, cls, title, fn) => el('button', { type: 'button', class: cls, text, title, on: { click: (e) => { e.stopPropagation(); fn(); } } });
    noteEl = el('div', { class: 'speed-card lt-note', role: 'dialog', attrs: { 'aria-label': 'New in the Lab', 'data-no-usage': '' } },
      el('b', { class: 'lt-nt', text: `◈ New in the Lab: ${D.STEPS.length} things` }),
      el('span', { class: 'spacer' }),
      b('Show me (2 min)', 'small primary lt-go', 'A short tour: a ring on each new control, one line each. Nothing is sent, your scene stays as it is', () => { decide('tour'); start({ restart: true }).catch((err) => toast(err.message, { type: 'error' })); }),
      b('Later', 'ghost small lt-later', 'Not now. It won\'t pop up again: Ctrl/⌘+K › Lab: what\'s new any time', () => { decide('later'); closeNote(); toast('Any time: Ctrl/⌘+K › Lab: what\'s new', { timeout: 3000 }); }),
      b('✕', 'sr-x lt-x', 'Close (it won\'t pop up again)', () => { decide('closed'); closeNote(); }));
    document.body.append(noteEl);
    stats.notes += 1;
    return noteEl;
  }
  // offered once, through Hints (a Lab tip); a test copy only when a check asks (labtour137.auto)
  function offer() {
    if (decided() || !window.Hints) return false;
    if (window.SMOKE_SAVES && !get('labtour137.auto', false)) return false;
    Hints.offer({ id: `labtour:${D.VERSION}`, place: 'lab', rank: 15, ttl: 12 * 3600e3, still: () => !decided() && !mod('discover', () => Tour)?.current, show: note });
    return true;
  }

  // ---------- Lab features… ----------
  const actionFor = (prefix) => { try { return AppUI.actions().find((a) => String(a.label || '').startsWith(prefix)) || null; } catch { return null; } };
  const has = { action: (p) => Boolean(actionFor(p)), cmd: (n) => { try { return Boolean(Commands.get(n)); } catch { return false; } } };
  const PLACE = {
    async projlook() { await openLab(); const b = q('.pl-toggle').find(drawn); if (b) { into(b); ring(b, 'project look'); return; } toast('The ◆ shows in the Lab toolbar when the scene belongs to a project with a palette.', { timeout: 3800 }); },
    async nextstep() { AppUI.palette?.('suggest next steps'); },
    async takes() { await openLab(); const b = [...document.querySelectorAll('.tk-btn')].find(drawn); if (b) { into(b); ring(b, 'type an idea first'); return; } toast('In a director chat, type an idea: ✦ 3 takes is beside Send.', { timeout: 3800 }); },
    async mywork() { await need('mywork'); await MyWork.open({ mode: 'lab', kind: 'layer' }); },
  };
  async function go(f) {
    const o = D.openOf(f, has);
    stats.opens.push({ id: f.id, type: o?.type || null });
    if (!o) { toast(`${f.name}: not in this copy of Hearth yet`, { timeout: 2600 }); return false; }
    if (o.type === 'action') { await actionFor(o.label).run(); return true; }
    if (o.type === 'cmd') {
      await openLab();
      const agent = H.agent?.(H.activeId)?.id || H.claudeAgent?.()?.id;
      const said = []; const cut = (t) => said.push(String(t || ''));
      await Commands.tryRun(o.line, agent, null, { source: 'code', say: cut, note: cut });
      const t = said.join(' ').replace(/[*`_]/g, '').trim();
      if (t) toast(t.length > 160 ? `${t.slice(0, 157)}…` : t, { timeout: 3600 });
      return true;
    }
    if (o.type === 'step') {
      await need('discover'); await openLab(); await tidy();
      const s = D.STEPS.find((x) => x.id === o.step);
      const n = await AT[o.step]();
      ring(n, s?.title || '');
      if (s?.show === 'safe' && o.step === 'render') await SHOW.render();
      return Boolean(n);
    }
    await PLACE[o.place]?.();
    return true;
  }
  let idx = null;
  function index({ query = '' } = {}) {
    idx?.close();
    const qIn = el('input', { type: 'search', class: 'lt-q', placeholder: 'Search: glow, slow, lyrics, phone…', value: query, spellcheck: false, attrs: { 'aria-label': 'Search the Lab features' } });
    const list = el('ul', { class: 'lt-list', attrs: { role: 'list' } });
    const count = el('span', { class: 'hint lt-count' });
    const row = (f) => el('li', { class: 'lt-row', dataset: { id: f.id } },
      el('span', { class: 'lt-ic', text: f.icon, attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'lt-text' }, el('b', { text: f.name }), el('span', { class: 'lt-line', text: f.line })),
      el('span', { class: 'lt-round', text: `r${f.round}`, title: `New in round ${f.round}` }),
      el('button', { type: 'button', class: 'ghost small lt-open', text: 'Open', title: `Opens ${f.name}`, on: { click: () => { dlg.close(); go(f).catch((err) => toast(typeof calmError === 'function' ? calmError(err) : err.message, { type: 'error', timeout: 4000 })); } } }));
    const paint = () => {
      const hits = D.search(qIn.value);
      list.replaceChildren(...(hits.length ? hits.map(row) : [el('li', { class: 'lt-none hint', text: 'Nothing matches. Try another word.' })]));
      count.textContent = qIn.value.trim() ? `${hits.length} of ${D.FEATURES.length}` : `${D.FEATURES.length} since round ${D.FROM}`;
    };
    qIn.addEventListener('input', paint);
    qIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = list.querySelector('.lt-open'); if (b) { e.preventDefault(); b.click(); } } });
    const dlg = el('dialog', { class: 'ui-modal lt-index', attrs: { 'aria-label': 'Lab features' } },
      el('div', { class: 'lt-head' }, el('h2', { text: '◈ Lab features' }), el('span', { class: 'spacer' }), count),
      qIn, el('div', { class: 'lt-scroll' }, list),
      el('div', { class: 'modal-buttons' },
        el('button', { type: 'button', class: 'ghost lt-tour', text: '◈ The 2-minute tour', title: 'A ring on each new control, one line each', on: { click: () => { dlg.close(); start({ restart: true }).catch((err) => toast(err.message, { type: 'error' })); } } }),
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'primary', text: 'Done', on: { click: () => dlg.close() } })));
    dlg.addEventListener('close', () => { dlg.remove(); if (idx === dlg) idx = null; });
    document.body.append(dlg);
    paint();
    dlg.showModal();
    qIn.focus();
    idx = dlg;
    return dlg;
  }

  // ---------- ways in ----------
  try {
    AppUI.addAction('Lab: what\'s new (a 2-minute tour of the new things)', () => start().catch((err) => toast(err.message, { type: 'error' })));
    AppUI.addAction('Lab features… (every new Lab feature, with Open)', () => index());
  } catch { /* no palette */ }
  // the note: once the Lab is in (this group follows it), offered to the queue, which waits for the Lab to be on screen
  setTimeout(() => { try { offer(); } catch (err) { console.warn('lab tour note', err); } }, 0);

  return { start, index, go, showMe, offer, note, closeNote, tidy, endDemo, toDemo, decided, places: AT, stats, get demo() { return { ...demoState }; }, get noteEl() { return noteEl; }, get indexEl() { return idx; }, _test: { at, viaMenu, closeMenus, has } };
})();
window.LabTour = LabTour;
