// ◧ Before / after (round 37, abcompare): after any change that alters the Lab scene's look (a director edit, a 🎲
// variation, a 🩺 fix, ✨ polish, 🎨 look match, a look, a shuffle, a slider drag session, an undo…), compare it with
// how it was, 0 tokens:
//   · hold B: "before" on the preview while held (let go: now) · tap B: a split view (left = before, right = now)
//     with a line to drag; double-click the line swaps the sides; Esc closes it
//   · a small chip for a few seconds after the change: "Before: Director edit · 2 min ago" · ⟲ Keep before (= undo to
//     it, undoable the same way) · ✓ Keep now. Press and hold the chip = hold B; click it = the split view.
//   · right-click the preview › View › ◧ Before / after (Lab search finds it), the keys sheet, ⌘/Ctrl+K.
// One renderer (the 240 Hz rule, no second WebGL context): when only slider values / the palette changed, "before" is
// the preview itself with the earlier values set for a moment (live, animated, no undo step); when code / layers
// changed, it's a picture of the scene as it was (taken by the preview, small JPEG, when that state settled). The split
// view's "before" side is a picture made by the preview at the current time (values) or that picture (code), made
// again after you move around the scene (labgestures). A still scene doesn't draw for any of it (labpace): the
// divider only moves a clip on a picture.
// Changes come in as notes from small hooks: the time machine's changed() / director() (tools/three-history.js), the
// sliders' undo steps (tools/three-tweaks.js), Variations / Fix my scene / Make it look finished / Look match.
// The logic (what a change is called, live or picture, tap or hold) is in three-abcompare-core.js.
//   LabAB.note(kind, extra) · hold(kind, extra) → done() · show(on) · split(on) · keepBefore() · keepNow() · close()
//   · state() · stats() · viewItems()
const LabAB = (() => {
  const C = () => ABCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => toast(e?.message || String(e), { type: 'error' });
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const hooks = () => Lab()?.stageHooks || {};
  const CHIP_MS = 6000;
  const S = {
    base: null, // the scene as it last settled (a snap)
    pend: null, pendT: 0, // the change being made: its notes, and the snap it started from
    holds: 0, muteUntil: 0,
    pair: null, // { before: snap, kind, label, at, mode: 'live' | 'still' }
    peek: null, // "before" on screen: { mode, back, pal, el }
    press: null, // B (or the chip) down: { src, at, t, held }
    split: null, // { el, img, bar, x, swapped, url, gen }
    cover: null, rendering: false, renders: 0,
    chip: null, chipT: 0, chipTick: 0,
    stillT: 0, stills: 0, freed: 0, pairs: 0,
  };

  // ---------- where we are ----------
  const visible = () => Boolean(hooks().host?.checkVisibility?.({ visibilityProperty: true }));
  const seqOn = () => typeof ThreeSeq !== 'undefined' && Boolean(ThreeSeq.active);
  function usable(say = true) {
    const why = !Lab()?.tm || !hooks().sketchId?.() ? 'Open a scene in the Lab first.'
      : hooks().onStage ? 'Before / after works in the Lab preview, not while it plays on the Stage window.'
        : seqOn() ? 'Before / after is for scenes: the sequence owns the preview now.' : null;
    if (why && say) toast(why, { timeout: 2200 });
    return !why;
  }
  // nothing to settle while something is mid-way (a variation set being made, a peek, a version shown, a hold)
  const busy = () => S.holds > 0 || Boolean(S.peek) || S.rendering || Boolean(window.LabVariations?.busy) || Boolean(document.querySelector('.lv-tile.lv-peek'))
    || Boolean(window.ThreeHistory?.scrubbing) || Boolean(Lab()?.tm?.quiet);

  // ---------- the scene as it is: its state (code, layers, palette) and every slider value ----------
  function snap() {
    const id = hooks().sketchId?.(); const tm = Lab()?.tm;
    if (!id || !tm) return null;
    const st = tm.state(id);
    if (!st) return null;
    const full = {};
    for (const L of st.layers || []) {
      let list = [];
      try { list = hooks().ctlOf?.(L.id)?.controls() || []; } catch { continue; }
      full[L.id] = Object.fromEntries(list.filter((c) => c.key != null).map((c) => [c.key, c.value]));
    }
    return { sketch: id, st, full, at: Date.now(), still: null };
  }

  // ---------- notes: a change is being made ----------
  function note(kind = 'run', extra = {}) {
    if (Date.now() < S.muteUntil) return;
    const tm = Lab()?.tm; const id = hooks().sketchId?.();
    if (!tm || tm.quiet || !id || (extra.id && extra.id !== id) || window.ThreeHistory?.scrubbing || seqOn()) return;
    const from = S.pend ? S.pend.from : (S.base?.sketch === id ? S.base : null);
    S.pend = { ...C().merge(S.pend, kind, extra), from, at: S.pend?.at || Date.now() };
    schedule(C().delayOf(kind));
  }
  // a change made in several steps (✨ polish measures, applies, measures again): one change until done() is called
  function hold(kind, extra = {}) {
    note(kind, extra);
    S.holds += 1;
    let done = false;
    return () => { if (done) return; done = true; S.holds = Math.max(0, S.holds - 1); if (S.pend) schedule(500); };
  }
  function schedule(ms) { clearTimeout(S.pendT); S.pendT = setTimeout(settle, ms); }
  function settle() {
    const p = S.pend;
    if (!p) return;
    if (busy()) { schedule(500); return; }
    // a director turn is one change: it settles when the turn ends (the finish hook below), at most 10 min on
    if (p.chat && window.Native?.isBusy?.(p.chat) && Date.now() - p.at < 600000) { schedule(3000); return; }
    S.pend = null;
    const now = snap();
    if (!now) return;
    const c = p.from && p.from.sketch === now.sketch ? C().compare(p.from, now) : null;
    if (c && !c.same) setPair({ before: p.from, kind: p.kind, label: C().labelOf(p), at: Date.now(), mode: c.mode });
    const old = S.base;
    if (c?.same && old === p.from) now.still = old.still; // nothing changed after all: its picture still holds
    S.base = now;
    if (old && old !== S.pair?.before && old.still !== now.still) drop(old);
    // a picture only after a real change (the preview was just drawing it anyway); a scene's first state uses its thumbnail
    if (!p.from) now.thumb = Lab()?.scenes?.thumbOf?.(now.sketch) || null;
    else if (!now.still) stillSoon();
  }
  // a picture of the settled scene (the "before" of the next change when that one changes code): small, made by the
  // preview off its next frame, when the app is idle
  function stillSoon(ms = 350) {
    clearTimeout(S.stillT);
    S.stillT = setTimeout(() => {
      const go = async () => {
        const b = S.base;
        if (!b || b.still || busy() || S.pend) return;
        // (round 54, labsmooth54) asked right after a frame (fresh style), not from the idle callback mid-stream
        if (document.hidden || !(await new Promise((r) => requestAnimationFrame(() => setTimeout(() => r(visible()), 0)))) || S.base !== b || S.pend) return;
        const fr = hooks().frameRect;
        const url = await Lab()?.director?.shotSmall?.(C().shotSize(fr?.width, fr?.height, devicePixelRatio)).catch(() => null);
        if (url && S.base === b && !S.pend) { b.still = url; S.stills += 1; }
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => go().catch(() => {}), { timeout: 1500 }); else go().catch(() => {});
    }, ms);
  }
  // the picture of a snap: its own, else (the scene's first state) the Lab's thumbnail of the scene
  const stillOf = (sn) => sn?.still || sn?.thumb || null;
  function drop(s) { if (s?.still) { s.still = null; S.freed += 1; } }
  function setPair(pair) {
    if (S.peek) show(false);
    if (S.pair && S.pair.before !== S.base && S.pair.before !== pair.before) drop(S.pair.before);
    S.pair = pair; S.pairs += 1;
    if (S.split) renderSplit().catch(() => {});
    // (round 38, hintcalm) by itself: one at a time with the other hints, never while you type, drag or a reply
    // streams (hints.js; the newest change replaces a waiting one); B, the menu and the keys work meanwhile
    // (a chip already on screen just takes the newer change)
    if (visible()) { if (window.Hints && !S.chip) Hints.offer({ id: 'abcompare', kind: 'chip', place: 'lab', ttl: 5 * 60000, still: () => S.pair === pair, show: () => { chipShow(CHIP_MS); return S.chip; } }); else chipShow(CHIP_MS); }
  }

  // ---------- "before" on the preview (hold B) ----------
  function setVals(byLayer, { remember = false } = {}) {
    for (const [layer, set] of Object.entries(byLayer || {})) {
      try { hooks().ctlOf?.(layer)?.setMany(set, remember ? undefined : { remember: false }); } catch { /* the layer went away */ }
    }
  }
  const palOf = (s) => s?.st?.palette || [];
  const stepIfFrozen = () => { if (hooks().frozen) hooks().box?.send({ type: 'step' }); };
  function show(on = true) {
    if (!on) {
      const pk = S.peek;
      if (!pk) return false;
      S.peek = null;
      if (pk.mode === 'live') { setVals(pk.back); if (pk.pal) hooks().peekPalette?.(null); stepIfFrozen(); }
      pk.el?.remove();
      badge(false);
      chipPaint();
      return true;
    }
    if (S.peek) return true;
    const p = S.pair;
    if (!p) { toast('Nothing to compare yet: Before / after appears after a change to the look', { timeout: 2000 }); return false; }
    if (!usable()) return false;
    if (p.mode === 'live') {
      const now = snap();
      if (!now) return false;
      const { go, back } = C().swapValues(now, p.before);
      const pal = JSON.stringify(palOf(now)) !== JSON.stringify(palOf(p.before));
      S.peek = { mode: 'live', back, pal };
      setVals(go);
      if (pal) hooks().peekPalette?.(palOf(p.before));
      stepIfFrozen();
    } else {
      const url = stillOf(p.before);
      if (!url) { toast('No picture of before (it changed too quickly) · ⟲ Keep before still goes back to it', { timeout: 2600 }); return false; }
      const el = picture(url, 'ab-peek');
      if (!el) return false;
      S.peek = { mode: 'still', el };
    }
    badge(true);
    chipShow(0);
    return true;
  }
  // a picture laid exactly over the preview's frame
  function picture(url, cls) {
    const host = hooks().host;
    if (!host) return null;
    const img = el('img', { class: cls, src: url, alt: '' });
    place(img);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(img);
    return img;
  }
  function place(node) {
    const host = hooks().host; if (!host || !node) return;
    const hr = host.getBoundingClientRect(); const fr = hooks().frameRect || hr;
    const want = { left: `${Math.round(fr.left - hr.left)}px`, top: `${Math.round(fr.top - hr.top)}px`, width: `${Math.round(fr.width)}px`, height: `${Math.round(fr.height)}px` };
    for (const [k, v] of Object.entries(want)) if (node.style[k] !== v) node.style[k] = v;
  }
  let badgeEl = null;
  function badge(on) {
    if (!on) { badgeEl?.remove(); badgeEl = null; return; }
    if (badgeEl) return;
    badgeEl = el('div', { class: 'ab-badge', text: S.pair?.mode === 'still' ? 'Before · picture' : 'Before' });
    hooks().host?.append(badgeEl);
    placeBadge();
  }
  function placeBadge() {
    if (!badgeEl) return;
    const host = hooks().host; const hr = host.getBoundingClientRect(); const fr = hooks().frameRect || hr;
    badgeEl.style.left = `${Math.round(fr.left - hr.left + 10)}px`; badgeEl.style.top = `${Math.round(fr.top - hr.top + 46)}px`;
  }
  // a moment of "before" from a menu (you can't hold a menu row)
  async function flash(ms = 1600) { if (!show(true)) return false; await sleep(ms); show(false); return true; }

  // ---------- B: hold = before while held, tap = the split view ----------
  function press(src) {
    if (S.press) return;
    const t = setTimeout(() => { if (S.press && !S.press.held) { S.press.held = true; if (!show(true)) S.press.failed = true; } }, C().TAP_MS);
    S.press = { src, at: performance.now(), t, held: false };
  }
  function release(src) {
    const p = S.press;
    if (!p || (src && p.src !== src)) return;
    clearTimeout(p.t); S.press = null;
    if (p.held) { show(false); return; }
    if (C().isTap(p.at, performance.now())) split(!S.split);
  }
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  const inLab = () => H.surfaceIdFor?.(H.activeId) === 'tool:three';
  function onKeyDown(e) {
    const pane = hooks().pane;
    if (!pane || !(e.target instanceof Node && pane.contains(e.target) || e.target === document.body) || !inLab() || typing(e) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Escape' && S.split) { e.preventDefault(); split(false); return; }
    if (e.shiftKey || e.code !== 'KeyB' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (e.repeat) return;
    if (!S.pair) { toast('Nothing to compare yet: Before / after appears after a change to the look', { timeout: 1800 }); return; }
    press('key');
    window.Usage?.key?.('B', 'Lab');
  }
  function onKeyUp(e) { if (e.code === 'KeyB' || e.key === 'b' || e.key === 'B') release('key'); }
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  // the window losing the keys (another app in front) ends a hold: nothing stays on "before"
  addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) { release(null); if (S.peek) show(false); } }, 0));

  // ---------- the split view: left = before, right = now ----------
  function split(on = !S.split) {
    if (!on) {
      const s = S.split;
      if (!s) return false;
      S.split = null; s.gen = -1;
      s.el.remove(); if (s.url) S.freed += 1;
      coverDown();
      chipPaint(); chipShow(2500);
      return false;
    }
    if (S.split) return true;
    if (!S.pair) { toast('Nothing to compare yet: Before / after appears after a change to the look', { timeout: 2000 }); return false; }
    if (!usable()) return false;
    const host = hooks().host;
    const img = el('img', { class: 'ab-img', alt: '' });
    const bar = el('div', { class: 'ab-bar', title: 'Drag to move the line · double-click: swap the sides', attrs: { role: 'separator', 'aria-label': 'Before / now divider' } }, el('span', { class: 'ab-knob' }));
    const tl = el('span', { class: 'ab-tag ab-tl' }); const tr = el('span', { class: 'ab-tag ab-tr' });
    const box = el('div', { class: 'ab-split', dataset: { feature: 'Before / after' } }, img, tl, tr, bar);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(box);
    S.split = { el: box, img, bar, tl, tr, x: 0.5, swapped: false, url: null, gen: 0, w: 0 };
    place(box);
    paintSplit();
    wireBar(bar);
    chipShow(0);
    renderSplit().catch(err);
    return true;
  }
  function paintSplit() {
    const s = S.split; if (!s) return;
    const clip = C().clipFor(s.x, s.swapped);
    if (s.img.style.clipPath !== clip) s.img.style.clipPath = clip;
    const w = s.el.clientWidth || s.w;
    s.bar.style.transform = `translateX(${Math.round(s.x * w)}px)`;
    const l = s.swapped ? 'Now' : 'Before'; const r = s.swapped ? 'Before' : 'Now';
    if (s.tl.textContent !== l) s.tl.textContent = l;
    if (s.tr.textContent !== r) s.tr.textContent = r;
  }
  function wireBar(bar) {
    bar.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const s = S.split; if (!s) return;
      // while dragging, the split view itself takes the pointer (over the preview's own page the moves would go there)
      try { bar.setPointerCapture(e.pointerId); } catch { /* the shield below does it */ }
      s.el.classList.add('ab-drag');
      const r0 = s.el.getBoundingClientRect(); s.w = r0.width;
      const move = (ev) => { if (!S.split) return; S.split.x = C().clampSplit((ev.clientX - r0.left) / r0.width); paintSplit(); };
      const up = () => { s.el.classList.remove('ab-drag'); for (const t of [bar, s.el]) { t.removeEventListener('pointermove', move); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', up); } };
      for (const t of [bar, s.el]) { t.addEventListener('pointermove', move); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up); }
    });
    bar.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); swap(); });
    bar.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, menuRows()); });
  }
  function swap() { if (!S.split) return false; S.split.swapped = !S.split.swapped; paintSplit(); return S.split.swapped; }
  function setX(x) { if (!S.split) return null; S.split.x = C().clampSplit(x); paintSplit(); return S.split.x; }
  // the "before" side's picture: the earlier picture (code changed) or one made now with the earlier values (values only)
  async function renderSplit() {
    const s = S.split; const p = S.pair;
    if (!s || !p) return;
    const gen = ++s.gen;
    if (p.mode === 'still') {
      const url = stillOf(p.before);
      if (!url) { s.el.classList.add('ab-none'); s.tl.title = 'No picture of before (it changed too quickly)'; return; }
      s.el.classList.remove('ab-none');
      if (s.url !== url) { s.url = url; s.img.src = s.url; }
      s.el.dataset.mode = 'still';
      return;
    }
    const d = Lab()?.director;
    if (!d || !visible()) return;
    S.rendering = true; s.el.classList.add('ab-busy');
    const wasFrozen = Boolean(hooks().frozen);
    let back = null; let pal = false;
    try {
      // a still of now over the preview while the earlier values are on for one frame (nothing flickers)
      const now = snap();
      if (!now) return;
      await coverUp(d);
      if (gen !== s.gen || S.split !== s) return;
      if (wasFrozen) hooks().setFreeze?.(false);
      const sw = C().swapValues(now, p.before); back = sw.back;
      pal = JSON.stringify(palOf(now)) !== JSON.stringify(palOf(p.before));
      setVals(sw.go);
      if (pal) hooks().peekPalette?.(palOf(p.before));
      await sleep(160);
      const fr = hooks().frameRect;
      const url = await d.shotSmall(C().shotSize(fr?.width, fr?.height, devicePixelRatio)).catch(() => null);
      setVals(back); back = null;
      if (pal) { hooks().peekPalette?.(null); pal = false; }
      if (gen !== s.gen || S.split !== s || !url) return;
      if (s.url) S.freed += 1;
      s.url = url; s.img.src = url; s.el.dataset.mode = 'live'; s.el.classList.remove('ab-none');
      S.renders += 1;
    } finally {
      if (back) setVals(back);
      if (pal) hooks().peekPalette?.(null);
      if (wasFrozen) { await sleep(100); hooks().setFreeze?.(true); }
      await sleep(60);
      coverDown();
      S.rendering = false; s.el?.classList.remove('ab-busy');
    }
  }
  async function coverUp(d) {
    const url = await d.coverShot?.(500).catch(() => null);
    coverDown();
    if (!url || !S.split) return;
    S.cover = picture(url, 'ab-cover');
    if (S.cover && S.split) S.split.el.before(S.cover); // under the split view
  }
  function coverDown() { S.cover?.remove(); S.cover = null; }
  // moving around the scene (labgestures) moved the picture: the "before" side is made again from the same view
  let viewT = 0;
  addEventListener('hearth:lab-view', () => { clearTimeout(viewT); if (S.split && S.pair?.mode === 'live') viewT = setTimeout(() => renderSplit().catch(() => {}), 250); });

  // ---------- keep before / keep now ----------
  async function keepBefore() {
    const p = S.pair;
    if (!p) { toast('Nothing to go back to.', { timeout: 1500 }); return false; }
    if (!usable()) return false;
    if (S.peek) show(false);
    clearTimeout(S.pendT); S.pend = null;
    const now = snap();
    if (!now) return false;
    if (p.mode === 'still') now.still = await Lab().director?.coverShot?.(600).catch(() => null); // so ⟲ can come back here
    S.muteUntil = Date.now() + 1800;
    try {
      if (p.mode === 'live') {
        setVals(C().valueDiff(p.before, now), { remember: true }); // one slider undo step per layer, like any change
        if (JSON.stringify(palOf(p.before)) !== JSON.stringify(palOf(now))) Lab().director?.refs?.setPalette?.(palOf(p.before));
      } else Lab().tm.show(p.before.st, { keep: true });
    } catch (e) { S.muteUntil = 0; throw e; }
    window.ThreeHistory?.capture?.(now.sketch, { kind: 'restore', label: `Kept before: ${p.label}`, force: true }).catch?.(() => {});
    S.base = p.before;
    S.pair = { before: now, kind: 'keep', label: C().KINDS.keep.label, at: Date.now(), mode: p.mode };
    if (S.split) renderSplit().catch(() => {});
    chipShow(CHIP_MS);
    toast(`⟲ Back to before: ${p.label}`, { timeout: 3500, action: { label: 'Undo', fn: () => keepBefore().catch(err) } });
    return true;
  }
  function keepNow() {
    if (!S.pair) return false;
    if (S.peek) show(false);
    if (S.split) split(false);
    if (S.pair.before !== S.base) drop(S.pair.before);
    S.pair = null;
    chipHide();
    return true;
  }
  // everything off and freed (a scene switch drops what it compared too)
  function close({ forget = false } = {}) {
    release(null);
    if (S.peek) show(false);
    if (S.split) split(false);
    coverDown(); badge(false);
    chipHide();
    if (forget) {
      clearTimeout(S.pendT); clearTimeout(S.stillT);
      if (S.pair && S.pair.before !== S.base) drop(S.pair.before);
      drop(S.base);
      S.pend = null; S.pair = null; S.base = null;
    }
    return true;
  }

  // ---------- the chip ----------
  function chipBuild() {
    const what = el('button', { type: 'button', class: 'ab-what', title: 'Press and hold: see before · click: split view (before | now) · or hold B' });
    what.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button !== 0) return; what.setPointerCapture?.(e.pointerId); press('chip'); });
    what.addEventListener('pointerup', () => release('chip'));
    what.addEventListener('pointercancel', () => release('chip'));
    what.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); split(!S.split); } });
    const chip = el('div', { class: 'ab-chip', role: 'group', attrs: { 'aria-label': 'Before / after' }, dataset: { feature: 'Before / after' },
      on: { pointerenter: () => clearTimeout(S.chipT), pointerleave: () => chipShow(CHIP_MS / 2), contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, menuRows()); } } },
    what,
    el('button', { type: 'button', class: 'ab-keep-before', text: '⟲', title: 'Keep before: back to how it was (undoable the same way)', on: { click: () => keepBefore().catch(err) } }),
    el('button', { type: 'button', class: 'ab-keep-now', text: '✓', title: 'Keep now (closes the comparison)', on: { click: () => keepNow() } }));
    return chip;
  }
  function chipPaint() {
    if (!S.chip) return;
    placeChip(); // (round 38, inputlatency) measured before its own writes: after them, each repaint laid the page out
    const t = S.pair ? `${S.split ? '◧' : '◐'} ${C().chipText(S.pair)}` : '';
    const what = S.chip.firstChild;
    if (what.textContent !== t) what.textContent = t;
    S.chip.classList.toggle('on', Boolean(S.split || S.peek));
  }
  function placeChip() {
    const c = S.chip; const host = hooks().host; if (!c || !host) return;
    const hr = host.getBoundingClientRect(); const fr = hooks().frameRect || hr;
    // (top centre, under the frame's own bar: the bottom is where the scene's notes and the chat chip sit)
    const left = `${Math.round(fr.left - hr.left + fr.width / 2)}px`; const top = `${Math.round(fr.top - hr.top + 46)}px`;
    if (c.style.left !== left) c.style.left = left;
    if (c.style.top !== top) c.style.top = top;
  }
  // ms: how long it stays (0: until the split / peek ends)
  function chipShow(ms = CHIP_MS) {
    if (!S.pair || !hooks().host) return;
    if (!S.chip) { S.chip = chipBuild(); chipPaint(); hooks().host.append(S.chip); } else chipPaint(); // (placed before it's in the page)
    clearTimeout(S.chipT);
    if (ms > 0) S.chipT = setTimeout(() => { if (!S.split && !S.peek && !S.chip?.matches(':hover')) chipHide(); }, ms);
    if (!S.chipTick) S.chipTick = setInterval(() => { if (S.chip) chipPaint(); }, 15000); // "· 2 min ago"
  }
  function chipHide() {
    clearTimeout(S.chipT); clearInterval(S.chipTick); S.chipTick = 0;
    S.chip?.remove(); S.chip = null;
  }
  // the overlays follow the preview's frame (a resize, a frame size switch)
  let ro = null;
  function follow() {
    const host = hooks().host;
    if (ro || !host || typeof ResizeObserver === 'undefined') return;
    ro = new ResizeObserver(() => { if (S.split) { place(S.split.el); paintSplit(); } if (S.peek?.el) place(S.peek.el); if (S.cover) place(S.cover); placeBadge(); placeChip(); });
    ro.observe(host);
  }

  // ---------- ways in: right-click › View, the keys sheet, ⌘/Ctrl+K, the app's command ----------
  function menuRows() {
    const p = S.pair;
    if (!p) return [{ label: 'Nothing changed yet', hint: 'it appears after a change to the look', action: () => show(true) }];
    return [
      { label: S.split ? 'Close the split view' : 'Split view: before | now', key: 'B', hint: 'drag the line · double-click swaps', checked: Boolean(S.split), action: () => split(!S.split) },
      { label: 'Show before for a moment', hint: 'or hold B', action: () => flash().catch(err) },
      ...(S.split ? [{ label: 'Swap the sides', action: () => swap() }] : []),
      '-',
      { label: '⟲ Keep before', hint: p.label, action: () => keepBefore().catch(err) },
      { label: '✓ Keep now', action: () => keepNow() },
    ];
  }
  function viewItems() {
    return ['-', { label: '◧ Before / after', hint: S.pair ? C().chipText(S.pair).replace(/^Before: /, '') : 'after a change', items: () => { follow(); return menuRows(); } }];
  }
  function state() {
    return { pair: S.pair ? { kind: S.pair.kind, label: S.pair.label, mode: S.pair.mode, at: S.pair.at, picture: Boolean(stillOf(S.pair.before)), text: C().chipText(S.pair) } : null,
      split: S.split ? { x: S.split.x, swapped: S.split.swapped, picture: Boolean(S.split.url), mode: S.split.el.dataset.mode || null } : null,
      peek: S.peek ? S.peek.mode : null, chip: Boolean(S.chip), pending: S.pend ? { kind: S.pend.kind, label: C().labelOf(S.pend), n: S.pend.n } : null, base: Boolean(S.base), baseStill: Boolean(stillOf(S.base)) };
  }
  // what's held (dev/checks/abcompare.js): our elements and pictures; no canvas, no WebGL context of our own
  function stats() {
    const mine = [...document.querySelectorAll('.ab-split, .ab-chip, .ab-peek, .ab-cover, .ab-badge')];
    return { elements: mine.length, images: mine.reduce((n, x) => n + (x.tagName === 'IMG' ? 1 : x.querySelectorAll('img[src]').length), 0), canvases: mine.reduce((n, x) => n + x.querySelectorAll('canvas').length, 0), webgl: 0,
      stills: S.stills, renders: S.renders, freed: S.freed, pairs: S.pairs, holding: Boolean(S.press), timers: Boolean(S.chipTick) };
  }

  function register() {
    try {
      Keys.add({ area: 'Lab', keys: 'B', what: 'Before / after: hold to see the scene before the last change (let go: now) · tap for a split view (drag the line, double-click swaps, Esc closes)', when: inLab, run: () => split(!S.split) });
    } catch { /* keys list optional */ }
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: Before / after (split view of the last change)', () => split(!S.split));
    if (typeof Commands === 'undefined' || Commands.get?.('before-after')) return;
    const VERBS = ['split', 'close', 'before', 'swap', 'keep-before', 'keep-now', 'status'];
    Commands.register({
      name: 'before-after', area: 'Three.js Lab', args: '[split | close | before | swap | keep-before | keep-now | status]',
      desc: 'Compare the Lab scene with how it was before the last change to its look (no tokens): a split view, a moment of before, keep before (undo to it) or keep now',
      keywords: 'before after compare split wipe undo previous last change ab diff',
      examples: ['/before-after', '/before-after keep-before', '/before-after status'],
      complete: (a) => VERBS.filter((v) => v.startsWith(String(a || '').trim().toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const v = String(args || '').trim().toLowerCase() || 'split';
        await Lab()?.cmd?.({ show: true });
        if (v === 'status') { const s = state(); return s.pair ? `${s.pair.text} (${s.pair.mode === 'live' ? 'values: shown live' : 'code: a picture'})${s.split ? ' · split view open' : ''}` : 'Nothing to compare yet.'; }
        if (!S.pair) return 'Nothing to compare yet: change the look first.';
        if (v === 'split') return split(true) ? 'Split view: before on the left, now on the right (drag the line).' : '';
        if (v === 'close') { split(false); return 'Closed.'; }
        if (v === 'swap') return S.split ? (swap() ? 'Now on the left.' : 'Before on the left.') : 'Open the split view first.';
        if (v === 'before') { await flash(); return 'That was before.'; }
        if (v === 'keep-before') return (await keepBefore()) ? 'Back to before.' : '';
        if (v === 'keep-now') { keepNow(); return 'Kept as it is.'; }
        return `Try: ${VERBS.join(', ')}`;
      },
    });
  }

  // a scene switch: what was compared belongs to the other scene; the new one's state is taken once it's idle
  addEventListener('hearth:sketch', (ev) => {
    close({ forget: true });
    const id = ev.detail?.id;
    // (no picture here: a message to the preview now would wake a still scene for nothing (labpace); the scene's own
    // thumbnail stands in until the first change settles and its picture is made)
    const go = () => { if (hooks().sketchId?.() === id && !S.base && !S.pend) { S.base = snap(); if (S.base) S.base.thumb = Lab()?.scenes?.thumbOf?.(id) || null; follow(); } };
    setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(go, { timeout: 4000 }) : go()), 2500);
  });
  // the Lab went off screen: the split view and any peek close (the chip comes back with the next change)
  // (round 38, inputlatency) asked only when something of it is showing: "is the preview on screen?" laid the page out
  // right after every chat switch and window change
  const showing = () => Boolean(S.press || S.peek || S.split || S.cover || badgeEl || S.chip);
  for (const ev of ['hearth:activate', 'hearth:view']) addEventListener(ev, () => setTimeout(() => { if (showing() && !visible()) close(); }, 0));
  // a director turn ends: its change settles now
  if (typeof Native !== 'undefined' && Native.hooks?.finish) Native.hooks.finish.push((event, chat) => { if (S.pend?.chat && S.pend.chat === chat?.id) schedule(400); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();

  return { note, hold, show, flash, split, swap, setX, keepBefore, keepNow, close, state, stats, viewItems, menuRows, press, release, settleNow: () => { clearTimeout(S.pendT); settle(); }, renderSplit };
})();
window.LabAB = LabAB; // the hooks in other Lab files call it as window.LabAB?.… (it may load after them)
