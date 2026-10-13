// 🎲 Variations (round 32, labvariations): from the scene on screen, a grid of 6 takes made here with no tokens. Each
// one nudges the scene's own values (every layer's sliders, the ◐ Grade / ◐ Film & lens sliders, the palette) and
// leans on one group: new colors, livelier / calmer, another angle, a new look, a bit of everything
// (three-variations-core.js). Click one: it applies as one step (↶ Undo / the toast's Undo put it all back). Hover
// one: the preview shows it live until you leave. "More like this" makes a new set close to the picked one. A lock
// per group (colors · motion · camera · look) keeps those values as they are.
// Light by design (the 240 Hz rule): no extra WebGL context. The pictures come from the preview's own renderer, one
// after another (values set without an undo step, a small JPEG of the next frame), behind a still of the scene so
// nothing flickers; a set of 6 takes about a second. Closing drops the pictures, listeners and the cover.
// Ways in (no command needed): ✦ More › ✨ Look & motion › 🎲 Variations; the toolbar's ⋯ › 🎲 Variations; the
// ◎ mission "Quick variations (free)" (your words steer it: "warmer", "calmer", "another angle"); ⌘/Ctrl+K.
// The app's internal command: /variations.
//   LabVariations.open({ steer, n }) · more(i) · apply(i) · undo() · lock(group, on) · close() · state() · stats()
const LabVariations = (() => {
  const C = () => VarCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => { toast(e?.message || String(e), { type: 'error' }); };
  const LOCKS = 'three.varLocks';
  const N = 6;
  const S = {
    card: null, grid: null, params: [], cur: null, tiles: [], gen: 0, busy: false, applied: null, last: null,
    locks: new Set((() => { try { return store.get(LOCKS, []); } catch { return []; } })()), steer: null, peek: -1, cover: null, sketch: null,
    made: 0, freed: 0,
  };

  async function lab() {
    const cmd = await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100);
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return { d: ThreeLab.director, cmd };
  }
  const hooks = () => ThreeLab.stageHooks || {};
  // every layer's sliders (the grade's too), with the layer they belong to; keyframed ones are marked
  function readSliders(d) {
    const out = [];
    for (const L of d.layers().layers || []) {
      let list = [];
      try { list = d.sliders(L.id)?.sliders || []; } catch { continue; }
      const keys = hooks().layerById?.(L.id)?.keys || {};
      for (const s of list) out.push({ ...s, layer: L.id, layerName: L.name, keyed: Boolean(keys[`s:${s.key}`]?.length) });
    }
    return out;
  }
  const valuesOf = (params) => Object.fromEntries(params.map((p) => [p.id, p.value]));
  // values onto the sliders, by layer; quiet = a passing preview (no undo step), else one step per layer that changes
  function setValues(values, { quiet = true, from = null } = {}) {
    const by = C().byLayer(S.params, values, from);
    for (const [layer, set] of Object.entries(by)) {
      try { hooks().ctlOf?.(layer)?.setMany(set, quiet ? { remember: false } : undefined); } catch { /* the layer went away */ }
    }
  }

  // what the sliders hold now (you may have moved one, or used the sliders' own ↶, while the card was open)
  function syncCur() {
    if (!S.params.length || S.peek >= 0) return;
    const now = {};
    for (const layer of new Set(S.params.map((p) => p.layer))) {
      let list = [];
      try { list = hooks().ctlOf?.(layer)?.controls() || []; } catch { continue; }
      for (const c of list) now[`${layer}|${c.key}`] = c.value;
    }
    for (const p of S.params) if (p.id in now) S.cur[p.id] = now[p.id];
  }

  // ---------- the cover: a still of the scene over the preview while the pictures are made ----------
  async function coverUp(d, gen) {
    const host = hooks().host; if (!host) return;
    const url = await d.coverShot?.(500).catch(() => null);
    if (!url || gen !== S.gen || !S.card) return; // a newer set (or closing) took over meanwhile
    coverDown();
    const hr = host.getBoundingClientRect(); const fr = hooks().frameRect || hr;
    S.cover = el('img', { class: 'lv-cover', src: url, alt: '' });
    Object.assign(S.cover.style, { left: `${fr.left - hr.left}px`, top: `${fr.top - hr.top}px`, width: `${fr.width}px`, height: `${fr.height}px` });
    host.append(S.cover);
  }
  function coverDown() { S.cover?.remove(); S.cover = null; hooks().host?.querySelectorAll('.lv-cover').forEach((x) => x.remove()); }

  // ---------- making a set ----------
  async function make({ base = null, closer = false, from = null } = {}) {
    const { d } = await lab();
    if (S.sketch && S.sketch !== hooks().sketchId?.()) { close(); throw new Error('The scene changed: open Variations again.'); }
    if (S.peek >= 0) { setValues(S.cur); S.peek = -1; }
    syncCur();
    const vars = C().make(S.params, { n: N, seed: (Date.now() ^ (S.made * 2654435761)) >>> 0, locks: [...S.locks], base: base || S.cur, closer, steer: S.steer });
    if (!vars.length) { S.tiles = []; paint(); toast(S.locks.size ? 'Everything here is locked: unlock a group to get variations' : 'Nothing to vary', { timeout: 2600 }); return []; }
    S.made += 1;
    const gen = ++S.gen;
    S.tiles = vars.map((v) => ({ ...v, url: null, from }));
    S.peek = -1;
    paint();
    S.busy = true; S.card?.classList.add('lv-busy');
    const wasFrozen = Boolean(hooks().frozen);
    try {
      if (wasFrozen) hooks().setFreeze?.(false);
      await coverUp(d, gen);
      // one renderer, one after another: set the values (no undo step), wait for a frame, a small picture
      for (const t of S.tiles) {
        if (gen !== S.gen) return [];
        setValues(t.values);
        await sleep(140);
        const url = await d.shotSmall(220).catch(() => null);
        if (gen !== S.gen) return [];
        t.url = url;
        paintTile(S.tiles.indexOf(t));
      }
    } finally {
      if (gen === S.gen && S.card) setValues(S.cur); // back to the scene as it is (close() did it already when closed)
      if (gen === S.gen || !S.card) coverDown();
      if (wasFrozen) { await sleep(120); hooks().setFreeze?.(true); }
      if (gen === S.gen) { S.busy = false; S.card?.classList.remove('lv-busy'); }
    }
    return S.tiles;
  }

  // ---------- open / apply / undo / more / locks / close ----------
  async function open({ steer = '' } = {}) {
    const { d } = await lab();
    const params = C().params(readSliders(d));
    if (!params.length) throw new Error('This scene has no sliders to vary yet: ask the director to "add sliders for the main knobs".');
    S.params = params; S.cur = valuesOf(params); S.steer = C().steer(steer); S.sketch = hooks().sketchId?.() || null;
    S.applied = null;
    showCard();
    await make();
    return state();
  }
  // one click: these values (and the palette turned the same way) as one step; ↶ Undo puts all of it back
  async function apply(i) {
    const t = S.tiles[i];
    if (!t) throw new Error('No such variation.');
    if (S.busy) { S.gen += 1; S.busy = false; coverDown(); S.card?.classList.remove('lv-busy'); }
    const { d } = await lab();
    if (S.peek >= 0) { setValues(S.cur); S.peek = -1; } // a hover peek ends here
    syncCur();
    const before = { values: { ...S.cur }, palette: (d.refs?.palette?.() || []).slice(), applied: S.applied };
    setValues(t.values, { quiet: false, from: S.cur });
    if (t.hue && before.palette.length) d.refs?.setPalette?.(C().shiftPalette(before.palette, t.hue));
    S.cur = { ...t.values };
    S.applied = { n: t.n, label: t.label };
    S.last = { before, tile: t.n };
    window.ThreeHistory?.changed?.('variations'); // a version in the time machine (tools/three-history.js)
    paint();
    toast(`🎲 ${t.label} · Save keeps it in the code`, { timeout: 4200, action: { label: 'Undo', fn: () => undo().catch(err) } });
    return state();
  }
  async function undo() {
    const l = S.last;
    if (!l) { toast('Nothing to undo.', { timeout: 1500 }); return false; }
    const { d } = await lab();
    if (S.peek >= 0) { setValues(S.cur); S.peek = -1; }
    syncCur();
    setValues(l.before.values, { quiet: false, from: S.cur });
    if (JSON.stringify(l.before.palette) !== JSON.stringify(d.refs?.palette?.() || [])) d.refs?.setPalette?.(l.before.palette);
    S.cur = { ...l.before.values };
    S.applied = l.before.applied;
    S.last = null;
    window.ThreeHistory?.changed?.('variations');
    paint();
    toast('↶ Back to before that variation', { timeout: 1600 });
    return true;
  }
  // a new set close to the picked one (or to what's on screen)
  function more(i = null) {
    const t = i == null ? null : S.tiles[i];
    return make({ base: t ? t.values : null, closer: true, from: t ? t.n : null });
  }
  const again = () => make();
  function lock(group, on = !S.locks.has(group)) {
    if (!C().GROUPS.some((g) => g.id === group)) throw new Error(`No group "${group}" (colors, motion, camera, look).`);
    if (on) S.locks.add(group); else S.locks.delete(group);
    try { store.set(LOCKS, [...S.locks]); } catch { /* storage off */ }
    paintLocks();
    if (S.card) again().catch(err);
    return [...S.locks];
  }
  function peek(i) {
    if (S.busy || i === S.peek) return;
    if (S.peek < 0) syncCur(); // the values to come back to
    S.peek = i;
    setValues(i >= 0 && S.tiles[i] ? S.tiles[i].values : S.cur);
    S.grid?.querySelectorAll('.lv-tile').forEach((b, k) => b.classList.toggle('lv-peek', k === i));
  }
  function close() {
    if (!S.card) return false;
    S.gen += 1;
    if (S.peek >= 0) setValues(S.cur);
    coverDown();
    document.removeEventListener('keydown', onKey, true);
    S.card.remove();
    S.freed += S.tiles.length;
    S.card = null; S.grid = null; S.tiles = []; S.params = []; S.cur = null; S.peek = -1; S.busy = false; S.sketch = null;
    return true;
  }

  // ---------- the card over the preview ----------
  const lockBtns = [];
  function paintLocks() {
    for (const b of lockBtns) {
      const on = S.locks.has(b.dataset.group);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      const g = C().GROUPS.find((x) => x.id === b.dataset.group);
      b.title = on ? `${g.label} stay as they are (click to let them vary)` : `Keep the ${g.label.toLowerCase()} as they are: ${g.hint}`;
      b.querySelector('.lv-lk').textContent = on ? '🔒' : '';
    }
  }
  function paintTile(i) {
    const b = S.grid?.children[i]; const t = S.tiles[i];
    if (!b || !t) return;
    const img = b.querySelector('img');
    if (t.url && img.getAttribute('src') !== t.url) img.src = t.url;
    b.classList.toggle('lv-wait', !t.url);
  }
  function paint() {
    if (!S.card) return;
    const fr = hooks().frameRect; const ratio = fr && fr.width && fr.height ? Math.max(0.5, Math.min(1.9, fr.width / fr.height)) : 1;
    S.grid.style.setProperty('--lv-ratio', String(Math.round(ratio * 1000) / 1000));
    S.grid.replaceChildren(...S.tiles.map((t, i) => el('button', {
      type: 'button', class: `lv-tile${t.url ? '' : ' lv-wait'}${S.applied?.n === t.n && S.cur && JSON.stringify(S.cur) === JSON.stringify(t.values) ? ' lv-on' : ''}`,
      title: `${t.label}: click to use it (one step, ↶ undoes) · hover to see it live · right-click: more like this`,
      on: { click: () => apply(i).catch(err), pointerenter: () => peek(i), pointerleave: () => peek(-1), contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, [t.label, { label: 'Use this one', action: () => apply(i).catch(err) }, { label: 'More like this', hint: 'a new set close to it', action: () => more(i).catch(err) }]); } },
    }, el('img', { alt: '', ...(t.url ? { src: t.url } : {}) }), el('span', { class: 'lv-n', text: String(i + 1) }), el('span', { class: 'lv-l', text: t.label }))));
    const sub = S.card.querySelector('.lm-src');
    if (sub) sub.textContent = S.applied ? `using ${S.applied.label.toLowerCase()} · no tokens` : 'made here, no tokens';
    const u = S.card.querySelector('.lv-undo'); if (u) u.hidden = !S.last;
  }
  function onKey(e) {
    if (!S.card || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') close();
    else if (/^[1-9]$/.test(e.key) && Number(e.key) <= S.tiles.length) apply(Number(e.key) - 1).catch(err);
    else return;
    e.preventDefault(); e.stopPropagation();
  }
  function showCard() {
    const host = ThreeLab.scenes?.previewHost?.() || hooks().host;
    if (!host) throw new Error('The Lab preview is not on screen.');
    if (S.card) { S.card.remove(); document.removeEventListener('keydown', onKey, true); }
    lockBtns.length = 0;
    for (const g of C().GROUPS) {
      const b = el('button', { type: 'button', class: 'lv-lock', dataset: { group: g.id }, on: { click: () => lock(g.id) } }, el('span', { text: `${g.icon} ${g.label}` }), el('span', { class: 'lv-lk' }));
      b.hidden = !S.params.some((p) => p.group === g.id);
      lockBtns.push(b);
    }
    S.grid = el('div', { class: 'lv-grid' });
    S.card = el('div', { class: 'lv-card', role: 'dialog', attrs: { 'aria-label': 'Variations' }, dataset: { feature: 'Variations' }, on: { contextmenu: (e) => e.stopPropagation() } },
      el('div', { class: 'lm-head' }, el('b', { text: '🎲 Variations' }), el('span', { class: 'lm-src', text: 'made here, no tokens' }),
        el('button', { type: 'button', class: 'lm-btn lm-x', text: '✕', title: 'Close (what you picked stays) · Esc', on: { click: () => close() } })),
      el('div', { class: 'lv-locks', title: 'Keep these as they are' }, el('span', { class: 'lv-keep', text: 'Keep' }), ...lockBtns),
      S.grid,
      el('div', { class: 'lm-acts' },
        el('button', { type: 'button', class: 'lm-btn', text: '↻ New ones', title: 'Another set around what you have now', on: { click: () => again().catch(err) } }),
        el('button', { type: 'button', class: 'lm-btn lm-ask lv-more', text: 'More like this', title: 'A new set close to what you have now, the one you used (or right-click any picture for one of these)', on: { click: () => more().catch(err) } }),
        el('button', { type: 'button', class: 'lm-btn lv-undo', text: '↶ Undo', hidden: true, title: 'Back to before the variation you used', on: { click: () => undo().catch(err) } })));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(S.card);
    document.addEventListener('keydown', onKey, true);
    paintLocks();
  }

  // ---------- state, ways in, command ----------
  function state() {
    return { open: Boolean(S.card), busy: S.busy, locks: [...S.locks], applied: S.applied, canUndo: Boolean(S.last),
      groups: C().GROUPS.map((g) => ({ id: g.id, n: S.params.filter((p) => p.group === g.id).length })).filter((g) => g.n),
      tiles: S.tiles.map((t) => ({ n: t.n, label: t.label, lean: t.lean, picture: Boolean(t.url), changed: t.changed.length, values: t.values, hue: t.hue })) };
  }
  // what's held while open and what closing freed (dev/checks/labvariations.js)
  function stats() {
    return { open: Boolean(S.card), tiles: S.tiles.length, pictures: S.tiles.filter((t) => t.url).length, cover: Boolean(S.cover), canvases: S.card ? S.card.querySelectorAll('canvas').length : 0, webgl: 0, freed: S.freed, sets: S.made };
  }
  const item = () => ({ label: '🎲 Variations', hint: '6 takes on this scene to click: colors, motion, camera, look (no tokens)', cmd: 'variations', action: () => open().catch(err) });
  function register() {
    if (typeof Commands === 'undefined' || Commands.get?.('variations')) return;
    const G = ['colors', 'motion', 'camera', 'look'];
    Commands.register({
      name: 'variations', area: 'Three.js Lab',
      args: '[words] | use <1–6> | more [1–6] | again | undo | lock <group> | unlock <group> | close | status',
      desc: 'Variations of the Lab scene, made locally (no tokens): 6 takes nudging its colors, motion, camera and look (sliders, grade, palette); use one as one undo step, more like one, lock a group',
      keywords: 'variations variants alternatives options shuffle nudge takes ideas grid pick colors motion camera look lock',
      examples: ['/variations', '/variations warmer and calmer', '/variations use 2', '/variations more 2', '/variations lock colors', '/variations undo'],
      complete: (a) => ['use', 'more', 'again', 'undo', 'lock', 'unlock', 'close', 'status', ...G.map((g) => `lock ${g}`)].filter((x) => x.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const a = String(args || '').trim(); const [w, x] = a.toLowerCase().split(/\s+/);
        const list = (s) => s.tiles.map((t) => `${t.n} ${t.label}`).join(' · ');
        if (w === 'use' || w === 'apply') { const s = await apply(Number(x) - 1); return `Using ${s.applied.label} (one step: /variations undo).`; }
        if (w === 'more') { await more(x ? Number(x) - 1 : null); return `More like it: ${list(state())}`; }
        if (w === 'again') { await again(); return `New ones: ${list(state())}`; }
        if (w === 'undo') return (await undo()) ? 'Back to before that variation.' : 'Nothing to undo.';
        if (w === 'lock' || w === 'unlock') { const l = lock(x, w === 'lock'); return l.length ? `Kept as they are: ${l.join(', ')}` : 'Nothing locked.'; }
        if (w === 'close') return close() ? 'Closed.' : 'Not open.';
        if (w === 'status') { const s = state(); return s.open ? `${s.tiles.length} variations: ${list(s)}${s.locks.length ? ` · kept: ${s.locks.join(', ')}` : ''}${s.applied ? ` · using ${s.applied.label}` : ''}` : 'Variations are closed.'; }
        const s = await open({ steer: a });
        return `${s.tiles.length} variations: ${list(s)}${s.locks.length ? ` · kept: ${s.locks.join(', ')}` : ''}. Click one to use it.`;
      },
    });
  }
  function init() {
    register();
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: Variations of this scene (6 to click, no tokens)', () => open().catch(err));
    if (typeof Keys !== 'undefined') Keys.add({ area: 'Lab', keys: '1–6 (Variations open)', what: 'use that variation' }, { area: 'Lab', keys: 'Esc (Variations open)', what: 'close Variations (what you picked stays)' });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { open, apply, undo, more, again, lock, peek, close, state, stats, item, get card() { return S.card; }, get busy() { return S.busy; } };
})();
