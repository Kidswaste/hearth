// (round 143, lab143) The Lab regrouped, and its Forgeheart look (docs/upgrades/lab143.md).
// Fewer always-visible small buttons: related controls fold behind one labelled button each. A fold holds the REAL
// controls (moved, not copied: same element, classes, data-feature, listeners and keys), so every action works as before
// and checks / the tour still find them; click the fold to show them in a small floating tray, Esc or a click outside
// folds it again. Folds made here (the Lab calls LabRegroup.apply once its toolbar and timeline are built):
//   Lab bar   ⚙ Inspect ▾   ›_ Console · ✥ Edit
//   Timeline  ♩ Beat ▾      Tap · K Kick · S Snare · H Hit, then the whole grid row (BPM, Set 1 here, ◂ ▸, RGB, and with
//                           ⋯ on the grid tools); the BPM readout stays beside it, flashing on the beat
//             ⚡ Sync ▾      🎧 Live ▾ · ⚡ Triggers · the trigger preset · Auto bars (lit while live sound is on)
//             View ▾ and Sections ▾ move from the grid row up into the transport row, as they were
// "Lab look": Forgeheart (scanlines on the panel chrome, a slow glint, the ember playhead; tools/three-regroup.css) or
// Plain, in the Lab's ⋯ › View & help. The look is CSS only and stops while the scene plays (html.lab-playing).
// Everything here is presentation: nothing in a scene or its files changes.
const LabRegroup = (() => {
  const LOOK_KEY = 'three.labLook';
  const folds = [];
  let wired = false;
  const look = () => (store.get(LOOK_KEY, 'forge') === 'plain' ? 'plain' : 'forge');
  function setLook(v) {
    v = v === 'plain' ? 'plain' : 'forge';
    store.set(LOOK_KEY, v);
    document.documentElement.dataset.lablook = v;
    return v;
  }
  document.documentElement.dataset.lablook = look();

  // ---------- one fold: a labelled button and a tray holding real controls ----------
  function fold({ label, title, feature, cls = '', nodes = [], lit }) {
    const tray = el('div', { class: `rg-tray ${cls}`, hidden: true, attrs: { role: 'group', 'aria-label': label.replace(/[▾\s]+$/, '') } });
    const button = el('button', { class: `ghost small rg-fold ${cls}-btn`, title, dataset: { feature }, attrs: { 'aria-expanded': 'false', 'aria-haspopup': 'true' } },
      el('span', { class: 'rg-fold-tx', text: label }));
    tray.append(...nodes.filter(Boolean));
    const F = { button, tray, label, lit, open: false };
    button.addEventListener('click', (e) => { e.stopPropagation(); setOpen(F, !F.open, { kb: e.detail === 0 }); }); // (a key press: focus goes into the tray)
    // (the tray's own right-clicks stay its controls'; the fold button's right-click lists the same actions)
    button.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, trayItems(F)); });
    tray.addEventListener('click', () => { if (F.lit) queueMicrotask(() => paintLit(F)); });
    folds.push(F);
    paintLit(F);
    return F;
  }
  function paintLit(F) { if (F.lit) F.button.classList.toggle('on', Boolean(F.lit())); }
  function place(F) {
    const r = F.button.getBoundingClientRect();
    const t = F.tray;
    t.style.left = '0px'; t.style.top = '0px';
    const o = t.getBoundingClientRect(); // (a transformed ancestor would move "fixed": measured, then corrected)
    const w = t.offsetWidth; const h = t.offsetHeight;
    let x = Math.max(6, Math.min(innerWidth - w - 6, r.left));
    let y = r.bottom + 6;
    if (y + h > innerHeight - 6) y = Math.max(6, r.top - h - 6);
    t.style.left = `${Math.round(x - o.left)}px`; t.style.top = `${Math.round(y - o.top)}px`;
    t.classList.toggle('rg-up', y < r.top);
  }
  function setOpen(F, on, { kb = false } = {}) {
    if (on) for (const G of folds) if (G !== F && G.open) setOpen(G, false);
    F.open = Boolean(on);
    F.tray.hidden = !F.open;
    // its panel rises above the preview's overlays while the tray is out
    F.button.closest('.three-toolbar, .media-bar')?.classList.toggle('rg-raised', F.open);
    F.button.classList.toggle('rg-open', F.open);
    F.button.setAttribute('aria-expanded', String(F.open));
    if (F.open) { place(F); if (kb) (F.tray.querySelector('button:not([hidden]), input') || F.button).focus?.({ preventScroll: true }); }
    paintLit(F);
    return F.open;
  }
  const closeAll = () => { for (const F of folds) if (F.open) setOpen(F, false); };
  // a fold's actions as a menu (its button's right-click, Ctrl/⌘+K's "Lab: …" rows): each row clicks the real control
  function trayItems(F) {
    const vis = (n) => n && !n.hidden && !n.closest('[hidden]:not(.rg-tray)') && getComputedStyle(n).display !== 'none';
    const rows = [...F.tray.querySelectorAll('button, select')].filter((b) => vis(b) && !b.disabled);
    return [F.label.replace(/\s*▾$/, ''), ...rows.map((b) => ({ label: (b.getAttribute('aria-label') || b.textContent || b.title || '').trim().replace(/\s+/g, ' ').slice(0, 40) || '•', hint: (b.title || '').split(/[·(]/)[0].trim().slice(0, 60), action: () => { if (b.tagName === 'SELECT') { setOpen(F, true); b.focus(); } else b.click(); } })),
      '-', { label: 'Show them here', hint: 'the tray', action: () => setOpen(F, true) }];
  }
  function wire() {
    if (wired) return;
    wired = true;
    // a click outside the open tray folds it (not one in a menu the tray opened: Live ▾, View ▾, a preset list)
    addEventListener('pointerdown', (e) => {
      const t = e.target;
      for (const F of folds) {
        if (!F.open || F.tray.contains(t) || F.button.contains(t)) continue;
        if (t.closest?.('#menu, #menu-fly, #menu-fly2, .mb-menu, .lab-pop, dialog, .modal')) continue;
        setOpen(F, false);
      }
    }, true);
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const F = folds.find((x) => x.open);
      if (!F || document.querySelector('#menu:not([hidden])')) return;
      e.preventDefault(); e.stopPropagation(); setOpen(F, false); F.button.focus?.({ preventScroll: true });
    }, true);
    addEventListener('resize', () => { for (const F of folds) if (F.open) place(F); });
    // (round 142) play starts: nothing floats over the timeline while it plays unless you opened it then
    addEventListener('hearth:lab-playing', () => { for (const F of folds) paintLit(F); });
  }

  // ---------- the Lab's folds ----------
  // apply({ toolbar, bar }): the toolbar (.three-toolbar) and the timeline (.media-bar) once built
  function apply({ toolbar, bar } = {}) {
    if (!toolbar || !bar || bar.dataset.rg) return null;
    bar.dataset.rg = '1';
    wire();
    const made = {};
    // Lab bar: ›_ Console and ✥ Edit behind ⚙ Inspect ▾ (Sliders, Code, Present and Play stay one click away)
    const view = toolbar.querySelector('.tb-group[data-cat="View"]');
    const consoleBtn = view?.querySelector('[data-feature="Console"]');
    const editBtn = view?.querySelector('[data-feature="Edit scene"]');
    if (view && consoleBtn && editBtn) {
      const F = fold({ label: '⚙ Inspect ▾', title: 'The scene\'s console (errors and messages) and ✥ Edit (move things in the picture)', feature: 'Inspect', cls: 'rg-inspect', nodes: [consoleBtn, editBtn], lit: () => consoleBtn.classList.contains('on') || editBtn.classList.contains('on') });
      const present = view.querySelector('[data-feature="Present"]');
      view.insertBefore(F.button, present || null);
      view.append(F.tray);
      made.inspect = F;
    }
    // Timeline: ♩ Beat ▾ (Tap, K S H and the grid row), the BPM readout beside it
    const main = bar.querySelector('.mb-main');
    const beat = main?.querySelector('.tb-group[data-cat="Beat"]');
    const grid = bar.querySelector('.mb-grid');
    if (beat && grid) {
      const tap = beat.querySelector('.mb-tap');
      const read = beat.querySelector('.mb-bpmread');
      const lanes = [...beat.querySelectorAll('.mb-lane')];
      // View ▾ and Sections ▾ go up into the transport row, in their own small group
      const viewB = grid.querySelector('[data-feature="Timeline view"]');
      const secB = grid.querySelector('[data-feature="Sections"]');
      const tl = el('span', { class: 'tb-group mb-g-tl', dataset: { cat: 'Timeline' } }, secB, viewB);
      const hits = el('div', { class: 'rg-row rg-hits' }, el('span', { class: 'rg-k', text: 'Hits' }), tap, ...lanes);
      const F = fold({ label: '♩ Beat ▾', title: 'Tap the tempo, tap kicks / snares / hits in, and the beat grid (BPM, Set 1 here, nudge ◂ ▸, waveform colours) · T K S H still work from the keyboard', feature: 'Beat', cls: 'rg-beat', nodes: [hits, grid] });
      beat.replaceChildren(F.button, ...(read ? [read] : []), F.tray);
      (main.querySelector('.mb-g-sound') || beat).after(tl);
      made.beat = F;
    }
    // Timeline: ⚡ Sync ▾ (Live sound, Triggers, the preset, Auto bars)
    const sound = main?.querySelector('.mb-g-sound');
    if (sound) {
      const kids = [...sound.childNodes];
      const live = sound.querySelector('[data-feature="Live sound"]');
      const F = fold({ label: '⚡ Sync ▾', title: 'What the scene reacts to: 🎧 live sound from your computer or a mic, ⚡ Triggers (kick, snare, hats…), a preset for the style, Auto bars', feature: 'Sync', cls: 'rg-sync', nodes: [el('div', { class: 'rg-row' }, ...kids)], lit: () => live?.classList.contains('live-on') });
      sound.replaceChildren(F.button, F.tray);
      // (Live ▾ turns on / off from its own menu: the fold lights when the menu's pick lands)
      if (live) new MutationObserver(() => paintLit(F)).observe(live, { attributes: true, attributeFilter: ['class'] });
      made.sync = F;
    }
    return made;
  }

  // the Lab's ⋯ › View & help row (tools/three.js labMoreItems)
  function lookRow() {
    const on = look() === 'forge';
    return [`Lab look: ${on ? 'Forgeheart' : 'Plain'}`, on ? 'Scanlines, a slow glint, the ember playhead (still while it plays) · click: Plain' : 'Flat panels, no motion · click: Forgeheart', () => { const v = setLook(on ? 'plain' : 'forge'); toast(`Lab look: ${v === 'forge' ? 'Forgeheart' : 'Plain'}`, { timeout: 1400 }); }, on, 'Lab look'];
  }
  return { apply, fold, setOpen, closeAll, trayItems, lookRow, look, setLook, get folds() { return folds.slice(); } };
})();
window.LabRegroup = LabRegroup;
