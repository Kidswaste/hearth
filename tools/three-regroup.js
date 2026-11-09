// (round 143, lab143) The Lab regrouped, and its Forgeheart look (docs/upgrades/lab143.md).
// Fewer always-visible small buttons: related controls fold behind one labelled button each. A fold holds the REAL
// controls (moved, not copied: same element, classes, data-feature, listeners and keys), so every action works as before
// and checks / the tour still find them; click the fold to show them in a small floating tray, Esc or a click outside
// folds it again. Folds made here (the Lab calls LabRegroup.apply once its toolbar and timeline are built):
//   Lab bar   ⚙ Inspect ▾   </> Code · ›_ Console · ✥ Edit · Credits (round 144, calm144: Code and Credits joined)
//   Timeline  ♩ Beat ▾      Tap · K Kick · S Snare · H Hit, then the whole grid row (BPM, Set 1 here, ◂ ▸, RGB, and with
//                           ⋯ on the grid tools); the BPM readout stays beside it, flashing on the beat
//             ⚡ Sync ▾      🎧 Live ▾ · ⚡ Triggers · the trigger preset · Auto bars (lit while live sound is on)
//             View ▾ and Sections ▾ move from the grid row up into the transport row, as they were
// "Lab look": Forgeheart (round 151's Hearth Redux: tools/three-regroup.css) or Plain, in the Lab's ⋯ › View & help.
// The look is CSS only and nothing in it loops.
// Everything here is presentation: nothing in a scene or its files changes.
const LabRegroup = (() => {
  const LOOK_KEY = 'three.labLook';
  const folds = [];
  let wired = false;
  // (round 161, fix161) Hearth's Lab let go entirely (ThreeLab.drop): its folds go with it (a new Lab makes its own)
  addEventListener('hearth:lab-drop', (e) => { if (!e.detail?.dropped) return; folds.length = 0; try { hud.obs?.disconnect(); } catch { /* gone */ } clearTimeout(hud.tlT); Object.assign(hud, { pv: null, tl: null, media: null, fpsN: [], obs: null, tlT: 0 }); });
  // (round 151, redux151) two looks: Forgeheart ("Hearth Redux": gold / ember on graphite, mono, few controls in sight,
  // the rest where you point) and Plain (flat, every control in sight, no motion, no headers). Round 148's Plate (light
  // lavender plates) is gone: a "plate" kept in the store opens as Forgeheart.
  const LOOKS = ['forge', 'plain'];
  const NAMES = { forge: 'Forgeheart', plain: 'Plain' };
  const HINTS = { forge: 'Gold and ember on graphite, few controls in sight: the rest comes in where you point (I shows them all)', plain: 'Flat panels, every control in sight, no motion' };
  const look = () => { const v = store.get(LOOK_KEY, 'forge'); return LOOKS.includes(v) ? v : 'forge'; };
  function setLook(v) {
    v = LOOKS.includes(v) ? v : 'forge';
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
  function apply({ toolbar, bar, preview, media } = {}) {
    if (!toolbar || !bar || bar.dataset.rg) return null;
    bar.dataset.rg = '1';
    wire();
    hudApply({ preview, bar, media }); // (round 148, look148)
    const made = {};
    // Lab bar: </> Code, ›_ Console and ✥ Edit behind ⚙ Inspect ▾ (Sliders, Present and Play stay one click away);
    // (round 144, calm144) Code and Credits joined it, so the bar keeps one row with the director docked
    const view = toolbar.querySelector('.tb-group[data-cat="View"]');
    const codeBtn = view?.querySelector('.tb-code');
    const consoleBtn = view?.querySelector('[data-feature="Console"]');
    const editBtn = view?.querySelector('[data-feature="Edit scene"]');
    if (view && consoleBtn && editBtn) {
      const F = fold({ label: '⚙ Inspect ▾', title: 'The scene\'s code, its console (errors and messages), ✥ Edit (move things in the picture) and Credits (who made what)', feature: 'Inspect', cls: 'rg-inspect', nodes: [codeBtn, consoleBtn, editBtn], lit: () => consoleBtn.classList.contains('on') || editBtn.classList.contains('on') });
      const present = view.querySelector('[data-feature="Present"]');
      view.insertBefore(F.button, present || null);
      view.append(F.tray);
      made.inspect = F;
      // Credits (credits.js) puts its button in the bar itself, whenever it loads: it moves into the tray, last
      const adopt = () => { for (const b of toolbar.querySelectorAll('.cr-open')) if (!F.tray.contains(b)) F.tray.append(b); };
      adopt();
      new MutationObserver(adopt).observe(toolbar, { childList: true });
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

  // ---------- (round 148, look148) instrument headers (docs/upgrades/look148.md) ----------
  // Each Lab panel reads like an instrument on the owner's moodboard: a tiny numbered mono header with live meta on
  // the right. 01 PREVIEW (fps, a sparkline of the last readings, quality) sits above the picture, never on it;
  // 02 TIMELINE (tempo, meter, a beat meter, bar, time) in the timeline's handle row; 03 LAYERS & KNOBS is CSS only.
  // Cost: the preview's meta is written from paintStats (only when the stats line itself changed, ≤ 2 a second); the
  // timeline's when it is stopped and something moved (a seek, a new tempo), coalesced to ≤ 10 a second, never while
  // it plays (its observer is off then). Text nodes are changed in place.
  const hud = { pv: null, tl: null, media: null, fpsN: [], obs: null, tlT: 0 };
  const tx = (cls) => { const n = el('span', { class: cls }); n.append(document.createTextNode('')); return n; };
  const put = (n, v) => { if (n && n.firstChild.data !== v) n.firstChild.data = v; };
  function header(no, name, cls) {
    return el('div', { class: `ih ${cls}`, attrs: { 'aria-hidden': 'true' }, dataset: { no } },
      el('i', { class: 'ih-no', text: no }), el('b', { class: 'ih-name', text: name }), el('i', { class: 'ih-live' }), el('span', { class: 'ih-sweep' }));
  }
  function hudPreview(preview) {
    if (!preview?.parentElement || hud.pv) return;
    const h = header('01', 'Preview', 'ih-pv');
    const spark = el('span', { class: 'ih-spark' }, Array.from({ length: 16 }, () => el('i')));
    const fps = tx('ih-v'); const q = tx('ih-q');
    h.append(el('span', { class: 'ih-meta' }, el('span', { class: 'ih-k', text: 'fps' }), spark, fps, el('span', { class: 'ih-sep', text: '·' }), el('span', { class: 'ih-k', text: 'quality' }), q));
    preview.before(h);
    hud.pv = { h, spark: [...spark.children], fps, q };
    put(fps, '—'); put(q, 'auto');
  }
  function stats(msg, quality) {
    const P = hud.pv;
    if (!P || !msg) return;
    const f = Math.round(msg.fps || 0);
    put(P.fps, String(f));
    const c = `ih-v ${f < 30 ? 'bad' : f < 55 ? 'warn' : 'ok'}`;
    if (P.fps.className !== c) P.fps.className = c;
    put(P.q, String(quality || '').replace(/^Quality:\s*/i, '').trim() || 'auto');
    hud.fpsN.push(f); if (hud.fpsN.length > P.spark.length) hud.fpsN.shift();
    const top = Math.max(60, ...hud.fpsN);
    const off = P.spark.length - hud.fpsN.length;
    P.spark.forEach((b, i) => { const v = hud.fpsN[i - off]; const k = (v == null ? 0.08 : Math.max(0.08, v / top)).toFixed(2); if (b.dataset.s !== k) { b.dataset.s = k; b.style.transform = `scaleY(${k})`; } });
  }
  function hudTimeline(bar, media) {
    const handle = bar?.querySelector(':scope > .mb-handle');
    if (!handle || hud.tl) return;
    const h = header('02', 'Timeline', 'ih-tl');
    const bpm = tx('ih-v'); const sig = tx('ih-q'); const barN = tx('ih-v ih-bar'); const time = tx('ih-q ih-time');
    const beats = el('span', { class: 'ih-beats' }, Array.from({ length: 4 }, () => el('i')));
    h.append(el('span', { class: 'ih-meta' }, bpm, el('span', { class: 'ih-k', text: 'bpm' }), el('span', { class: 'ih-sep', text: '·' }), sig, beats, el('span', { class: 'ih-k', text: 'bar' }), barN, el('span', { class: 'ih-sep', text: '·' }), time));
    handle.prepend(h);
    hud.tl = { h, bpm, sig, barN, time, beats: [...beats.children] };
    hud.media = media;
    paintTimeline();
    // stopped: a seek / scrub / new tempo changes the time or tempo texts → the header follows (coalesced)
    const soon = () => { if (window.LabPlay?.playing || hud.tlT) return; hud.tlT = setTimeout(() => { hud.tlT = 0; paintTimeline(); }, 100); };
    hud.obs = new MutationObserver(soon);
    const watch = () => { for (const n of bar.querySelectorAll('.mb-time, .mb-bpmread')) hud.obs.observe(n, { childList: true, characterData: true, subtree: true }); };
    watch();
    addEventListener('hearth:lab-playing', (e) => { if (e.detail?.playing) hud.obs.disconnect(); else { watch(); paintTimeline(); } });
  }
  function paintTimeline() {
    const T = hud.tl; let m = null;
    try { m = hud.media?.meta; } catch { /* the timeline is not ready */ }
    if (!T || !m) return;
    const fmt = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
    T.h.classList.toggle('ih-empty', !m.song);
    put(T.bpm, m.bpm ? String(Math.round(m.bpm * 10) / 10) : '—');
    put(T.sig, `${m.bpb}/4`);
    put(T.barN, m.bpm ? String(Math.max(1, m.bar)).padStart(3, '0') : '—');
    put(T.time, m.song ? `${fmt(m.t)} / ${fmt(m.dur)}` : '0:00');
    const bpb = Math.min(8, Math.max(2, m.bpb || 4));
    while (T.beats.length < bpb) { const i = el('i'); T.beats[0].parentElement.append(i); T.beats.push(i); }
    T.beats.forEach((b, i) => { b.hidden = i >= bpb; b.classList.toggle('on', i < (m.beat || 0)); b.classList.toggle('one', i === 0); });
  }
  function hudApply({ preview, bar, media }) {
    try { hudPreview(preview); hudTimeline(bar, media); } catch (err) { console.error(err); }
  }

  // the Lab's ⋯ › View & help row (tools/three.js labMoreItems): Forgeheart → Plain → Forgeheart
  function lookRow() {
    const v = look();
    const next = LOOKS[(LOOKS.indexOf(v) + 1) % LOOKS.length];
    return [`Lab look: ${NAMES[v]}`, `${HINTS[v]} · click: ${NAMES[next]}`, () => { const w = setLook(next); toast(`Lab look: ${NAMES[w]}`, { timeout: 1400 }); }, v !== 'plain', 'Lab look'];
  }
  return { apply, fold, setOpen, closeAll, trayItems, lookRow, look, setLook, stats, paintTimeline, get hud() { return hud; }, get folds() { return folds.slice(); } };
})();
window.LabRegroup = LabRegroup;
