// ★ Favourite controls (round 138, favs138): the few knobs the owner really uses, from any layer, in one small panel.
// docs/upgrades/favs138.md. Nothing is always on screen: the panel is folded to one ★ button (the Sliders panel's head,
// ◉ Perform's strip) and opens as a compact column. Built on what the Lab has:
//   · pins: a slider's right-click › ★ Pin to favourites (tools/three-tweaks.js), a dial's ⋯ (tools/three-dials.js);
//     saved with the scene (stageHooks.favs / setFavs → sketch.favs: FavsCore.norm); the layer's own ★ Favorites
//     group follows (its fav() set)
//   · a pinned slider IS the slider: each move goes through its layer's controller (setByKey, like MIDI and the phone
//     remote), so its range, 🔒 lock, keys (◆, a key at the playhead when animated) and ♪ / 〰 Follow the music are its
//     own; a release is that slider's one undo step, also in the Lab's Ctrl/⌘+Z (LabDirect.push), like the dials
//   · a pinned dial is LabDials.turn (live, one undo on release) and its ◆ (LabDials.keyHere)
//   · ✦ Suggest favourites: local, no AI. The time machine's versions (yours and the directors') say which sliders
//     changed most (FavsCore.counts / suggest); the dials over them come along. Keep or ✕ each.
//   · ◉ Perform: the strip's ★ opens it there; moves are live only and put back when Perform ends (like the dials)
//   LabFavs.toggle(item | null, { anchor }) · open · close · pin · unpin · reorder · suggest · keep · state
const LabFavs = (() => {
  const C = () => FavsCore;
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks : null);
  const sceneNow = () => hk()?.sketchId?.() || null;
  const calm = (e) => (window.calmError ? calmError(e) : String(e?.message || e));
  const perfOn = () => Boolean(window.ThreePerform?.state?.on);
  const S = { pop: null, inline: null, anchor: null, sid: null, timer: 0, sig: '', sug: null, sugNote: '', perf: null, dragFrom: -1, busy: null };
  const stats = { opens: 0, moves: 0, releases: 0, steps: 0, pins: 0, unpins: 0, reorders: 0, suggests: 0 };

  // ---------- the scene's pins ----------
  const dataNow = () => C().norm(hk()?.favs?.() || null);
  const saveData = (d) => hk()?.setFavs?.(C().norm(d));
  const ctlOf = (lid) => { try { return hk()?.ctlOf(lid) || null; } catch { return null; } };
  const dialsNow = () => (hk()?.dials?.()?.list || []);
  // the layer's own ★ Favorites group follows the pins (added → on, removed → off)
  function syncLayerFavs(before, after) {
    const ids = (d) => new Set(d.list.filter((x) => x.t === 's').map(C().idOf));
    const a = ids(before); const b = ids(after);
    for (const x of after.list) if (x.t === 's' && !a.has(C().idOf(x))) ctlOf(x.layer)?.fav?.(x.key, true);
    for (const x of before.list) if (x.t === 's' && !b.has(C().idOf(x))) ctlOf(x.layer)?.fav?.(x.key, false);
  }
  // one undo step for each pin, unpin and reorder (the Lab's Ctrl/⌘+Z)
  function edit(label, fn) {
    const before = dataNow(); const after = C().norm(fn(C().clone(before)));
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    saveData(after); syncLayerFavs(before, after);
    const sid = sceneNow();
    window.LabDirect?.push?.(null, label, () => { if (sceneNow() !== sid) return false; const now = dataNow(); saveData(before); syncLayerFavs(now, before); paint(true); return true; });
    paint(true);
    return true;
  }
  // what a pin shows now: { id, t, layer, key, dial, label, layerName, kind, value, min, max, step, options, follows, locked, keyState, gone }
  function resolve(x) {
    const id = C().idOf(x);
    if (x.t === 'd') {
      const d = dialsNow().find((y) => y.id === x.dial);
      if (!d) return { id, t: 'd', dial: x.dial, label: 'A dial', layerName: '🎛 Dial', gone: true };
      const st = window.LabDials?.state?.().dials.find((y) => y.id === x.dial);
      return { id, t: 'd', dial: x.dial, label: d.name, layerName: '🎛 Dial', kind: 'dial', value: st ? st.value : d.value ?? 0.5, min: 0, max: 1, step: 0.005, follows: Boolean(d.follow), keyed: (d.keys || []).length > 0 };
    }
    const L = (hk()?.layers?.() || []).find((y) => y.id === x.layer);
    const c = L ? ctlOf(x.layer)?.controls?.().find((y) => y.key === x.key) : null;
    if (!L || !c) return { id, t: 's', layer: x.layer, key: x.key, label: x.key, layerName: L?.name || 'A layer that is gone', gone: true };
    const kind = c.options ? 'choice' : typeof c.value === 'boolean' ? 'bool' : typeof c.value === 'number' ? 'number' : /^#[0-9a-f]{6}$/i.test(String(c.value)) ? 'color' : 'other';
    return { id, t: 's', layer: x.layer, key: x.key, label: c.label || x.key, layerName: L.name, kind, value: c.value, min: c.min, max: c.max, step: c.step, options: c.options,
      follows: c.followsMusic || null, locked: Boolean(ctlOf(x.layer)?.locked?.(x.key)), keyState: hk()?.keyState?.(x.layer, `s:${x.key}`) || 'none' };
  }

  // ---------- moving a pinned control ----------
  // live: the slider moves (no undo step); release: that slider's own undo step, also one step of the Lab's Ctrl/⌘+Z
  function move(x, v, { release = false } = {}) {
    if (x.t === 'd') return turnDial(x.dial, v, { release });
    const c = ctlOf(x.layer); if (!c) return false;
    if (c.locked?.(x.key)) { toast('Locked: 🔒 unlocks it', { timeout: 1200 }); return false; }
    if (perfOn()) return perfMove(x, c, v);
    stats.moves += 1;
    if (!release) return c.setByKey(x.key, v, { release: false });
    const d0 = c.undoDepth;
    const ok = c.setByKey(x.key, v, { release: true });
    stats.releases += 1;
    if (ok && c.undoDepth > d0) {
      const sid = sceneNow(); const after = c.controls().find((y) => y.key === x.key)?.value; const label = resolve(x).label;
      window.LabDirect?.push?.(null, `★ ${label}`, () => {
        if (sceneNow() !== sid) return false;
        const cc = ctlOf(x.layer); if (!cc || cc.controls().find((y) => y.key === x.key)?.value !== after) return false; // (its own ↶ took it back already)
        cc.undo(); paint(); return true;
      });
      stats.steps += 1;
    }
    return ok;
  }
  function turnDial(id, v, { release = false } = {}) {
    if (!window.LabDials) return false;
    if (perfOn()) {
      const d = dialsNow().find((y) => y.id === id); if (!d || !window.DialsCore) return false;
      if ((d.keys || []).length) { toast(`${d.name} follows its keys`, { timeout: 900 }); return false; }
      remember(d.maps); put(DialsCore.setOf(DialsCore.norm({ list: [d] }).list[0], v));
      return true;
    }
    stats.moves += 1; if (release) stats.releases += 1;
    return Boolean(LabDials.turn(id, v, { release }));
  }
  // ◉ Perform: live only, every slider put back when it ends
  function remember(maps) {
    if (!S.perf || S.perf.sid !== sceneNow()) S.perf = { sid: sceneNow(), vals: {} };
    for (const m of maps) {
      const v = ctlOf(m.layer)?.controls?.().find((y) => y.key === m.key)?.value;
      if (v !== undefined && !(S.perf.vals[m.layer] && m.key in S.perf.vals[m.layer])) (S.perf.vals[m.layer] ||= {})[m.key] = v;
    }
  }
  const put = (byLayer) => { for (const [lid, set] of Object.entries(byLayer || {})) ctlOf(lid)?.setMany?.(set, { remember: false }); };
  function perfMove(x, c, v) {
    if ((hk()?.keyState?.(x.layer, `s:${x.key}`) || 'none') !== 'none') { toast('It follows its keys', { timeout: 900 }); return false; }
    remember([x]); c.setMany({ [x.key]: v }, { remember: false });
    return true;
  }
  function performEnd() { const p = S.perf; S.perf = null; if (p && p.sid === sceneNow()) put(p.vals); return Boolean(p); }

  // ---------- pins ----------
  function nameOf(x) { const r = resolve(x); return r.gone ? 'it' : `"${r.label}"`; }
  function pin(x) { if (!x) return false; const ok = edit(`★ Pinned ${nameOf(x)}`, (d) => C().add(d, x)); if (ok) { stats.pins += 1; if (!S.pop) toast(`★ Pinned ${nameOf(x)}: the ★ in the Sliders panel shows your favourites`, { timeout: 2200 }); } return ok; }
  function unpin(id) { const x = dataNow().list.find((y) => C().idOf(y) === id); if (!x) return false; const ok = edit(`★ Unpinned ${nameOf(x)}`, (d) => C().remove(d, id)); if (ok) stats.unpins += 1; return ok; }
  function reorder(from, to) { if (from === to) return false; const ok = edit('★ Favourites reordered', (d) => C().move(d, from, to)); if (ok) stats.reorders += 1; return ok; }
  // toggle(item): pin or unpin it · toggle(null): open or fold the panel
  async function toggle(x, o = {}) {
    if (!x) { if (S.pop) { close(); return false; } await open(o); return true; }
    const id = C().idOf(x);
    return dataNow().list.some((y) => C().idOf(y) === id) ? unpin(id) : pin(x);
  }

  // ---------- ✦ Suggest favourites (local, no AI) ----------
  async function suggest() {
    const sid = sceneNow(); if (!sid) return [];
    stats.suggests += 1;
    const steps = [];
    try {
      const H2 = window.ThreeHistory; const T = typeof TMCore !== 'undefined' ? TMCore : null;
      const vs = H2 && T ? (await H2.list(sid)).slice(-200) : [];
      let prev = null;
      for (const v of vs) {
        const st = await H2.stateOf(v.id, sid);
        if (prev && st) steps.push(T.changes(prev, st).vals.map((c) => ({ layer: c.id, key: c.key })));
        if (st) prev = st;
      }
    } catch (err) { console.warn('favs: history', err); }
    const controls = (hk()?.layers?.() || []).flatMap((L) => (ctlOf(L.id)?.controls?.() || []).filter((c) => !c.options || c.options.length).map((c) => ({ layer: L.id, layerName: L.name, key: c.key, label: c.label || c.key })));
    S.sug = C().suggest({ counts: C().counts(steps), controls, dials: dialsNow(), pinned: dataNow(), max: 5 });
    S.sugNote = S.sug.length ? '' : 'Nothing stands out yet: the time machine needs a few saved slider changes first.';
    paint(true);
    return S.sug;
  }
  function keep(i) { const s = S.sug?.[i]; if (!s) return false; const x = s.t === 'd' ? { t: 'd', dial: s.dial } : { t: 's', layer: s.layer, key: s.key }; S.sug.splice(i, 1); return pin(x); }
  function keepAll() { const list = (S.sug || []).map((s) => (s.t === 'd' ? { t: 'd', dial: s.dial } : { t: 's', layer: s.layer, key: s.key })); S.sug = []; return edit(`★ Pinned ${list.length} favourites`, (d) => list.reduce((acc, x) => C().add(acc, x), d)); }

  // ---------- the panel ----------
  async function lab() {
    if (typeof ThreeLab === 'undefined' && window.Lazy) await Lazy.load('lab');
    if (!hk()?.ctlOf) await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 100 && !hk()?.ctlOf; i += 1) await new Promise((r) => setTimeout(r, 50));
    if (!hk()?.ctlOf) throw new Error('The Lab is not ready yet.');
  }
  // (round 142, panel142) inline: a box of the Lab's Layers & knobs panel (its ★ Favourites section) the card sits in
  const host = () => (document.fullscreenElement && document.fullscreenElement.contains(hk()?.host || null) ? document.fullscreenElement : (perfOn() && hk()?.host) || (S.inline?.isConnected && S.inline) || document.body);
  async function open({ anchor = null, inline = null } = {}) {
    await lab();
    if (!sceneNow()) throw new Error('Open a scene in the Lab first.');
    if (dataNow().list.some((x) => x.t === 'd') && typeof LabDials === 'undefined' && window.Lazy) await Lazy.load('dials').catch(() => {});
    S.anchor = anchor || null;
    if (!inline && !perfOn() && hk()?.lkOpen) inline = hk().lkOpen('favs'); // (round 142, panel142) Ctrl/⌘+K and the ★: the panel's section
    if (S.pop && Boolean(inline) !== Boolean(S.inline)) close(); // (from a card to the section, or back)
    S.inline = inline || null;
    if (!S.pop) {
      S.pop = el('div', { class: `fv-pop${S.inline ? ' lk-inline' : ''}`, role: 'dialog', attrs: { 'aria-label': 'Favourite controls' } });
      S.pop.addEventListener('keydown', onKey);
      addEventListener('keydown', esc, true);
      S.timer = setInterval(tick, 300);
      stats.opens += 1;
    }
    const h = host(); if (S.pop.parentElement !== h) h.append(S.pop);
    S.sid = sceneNow();
    paint(true);
    return state();
  }
  function close() { const sec = S.pop?.closest('details.lk-sec'); clearInterval(S.timer); S.timer = 0; S.pop?.remove(); S.pop = null; S.sug = null; S.sig = ''; removeEventListener('keydown', esc, true); if (sec?.open) sec.open = false; } // (round 142, panel142) its section folds with it
  const esc = (e) => { if (e.key === 'Escape' && S.pop && !perfOn() && !document.querySelector('.mb-menu') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) { e.stopPropagation(); close(); } };
  // Ctrl/⌘+Z in the panel: the Lab's own undo (a pinned slider's move, a pin, a reorder)
  function onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z' || /^(INPUT|TEXTAREA)$/.test(e.target?.tagName) && !/^(range|color|checkbox)$/.test(e.target.type)) return;
    e.preventDefault(); e.stopPropagation();
    window.LabDirect?.undo?.();
  }
  function place() {
    if (!S.pop || (S.inline && S.pop.parentElement === S.inline)) return; // (round 142, panel142) in its section: no placing
    const a = S.anchor?.isConnected ? S.anchor : null; const w = 250;
    const r = (a || hk()?.host || document.body).getBoundingClientRect();
    const hgt = S.pop.offsetHeight || 200;
    let left = a ? r.right - w : r.right - w - 8; left = Math.max(8, Math.min(innerWidth - w - 8, left));
    let top = a ? r.bottom + 6 : r.top + 8;
    if (top + hgt > innerHeight - 8) top = a ? Math.max(8, r.top - hgt - 6) : Math.max(8, innerHeight - hgt - 8);
    Object.assign(S.pop.style, { left: `${left}px`, top: `${top}px`, width: `${w}px` });
  }
  const fmt = (r, v) => (r.kind === 'dial' ? `${Math.round(Number(v) * 100)}%` : r.kind === 'number' ? String(Math.round(Number(v) * 1000) / 1000) : r.kind === 'bool' ? (v ? 'on' : 'off') : String(v));
  function inputOf(r, x) {
    const live = (v) => move(x, v); const done = (v) => { move(x, v, { release: true }); paintRow(x); };
    let inp;
    if (r.kind === 'number' || r.kind === 'dial') {
      const span = (r.max - r.min) || 1;
      inp = el('input', { type: 'range', class: 'fv-in', min: r.min, max: r.max, step: r.step || (r.kind === 'dial' ? 0.005 : Number((span / 200).toPrecision(3))) });
      inp.value = r.value;
      inp.addEventListener('input', () => { live(Number(inp.value)); inp.closest('.fv-row').querySelector('.fv-val').textContent = fmt(r, inp.value); });
      inp.addEventListener('change', () => done(Number(inp.value)));
    } else if (r.kind === 'color') {
      inp = el('input', { type: 'color', class: 'fv-in fv-color' }); inp.value = String(r.value).toLowerCase();
      inp.addEventListener('input', () => live(inp.value)); inp.addEventListener('change', () => done(inp.value));
    } else if (r.kind === 'bool') {
      inp = el('input', { type: 'checkbox', class: 'fv-in fv-bool' }); inp.checked = Boolean(r.value);
      inp.addEventListener('change', () => done(inp.checked));
    } else if (r.kind === 'choice') {
      inp = el('select', { class: 'fv-in fv-sel' }, (r.options || []).map((o) => el('option', { value: String(o), text: String(o) }))); inp.value = String(r.value);
      inp.addEventListener('change', () => { const o = (r.options || []).find((y) => String(y) === inp.value); done(o === undefined ? inp.value : o); });
    } else inp = el('span', { class: 'fv-sub', text: String(r.value) });
    if (r.locked) inp.disabled = true;
    return inp;
  }
  function rowOf(x, i) {
    const r = resolve(x);
    const kfOn = r.t === 'd' ? r.keyed : r.keyState !== 'none';
    const marks = r.gone ? [] : [
      r.follows ? el('span', { class: 'fv-music', text: r.t === 'd' ? '〰' : '♪', title: r.t === 'd' ? 'This dial follows the music' : `Follows the music${r.follows?.band ? ` (${r.follows.band})` : ''}` }) : null,
      r.t === 's' ? el('button', { type: 'button', class: `ghost small fv-lock${r.locked ? ' on' : ''}`, text: r.locked ? '🔒' : '🔓', title: r.locked ? 'Locked at this value: click to unlock' : 'Lock at this value', on: { click: () => { ctlOf(x.layer)?.lock?.(x.key, !r.locked); paint(true); } } }) : null,
      (r.t === 'd' || r.kind === 'number' || r.kind === 'color') ? el('button', { type: 'button', class: `ghost small fv-kf${kfOn ? ' on' : ''}`, text: '◆', title: r.t === 'd' ? 'A key on the dial at the playhead' : r.keyState === 'on' ? 'On a key: click removes it' : r.keyState === 'animated' ? 'Animated: a move sets a key here · click adds one' : 'Keyframe at the playhead', on: { click: () => { if (r.t === 'd') LabDials?.keyHere?.(x.dial); else hk()?.toggleKey?.(x.layer, `s:${x.key}`, r.value); paint(true); } } }) : null,
    ];
    const grip = el('span', { class: 'fv-grip', text: '⋮⋮', title: 'Drag to reorder', attrs: { draggable: 'true' } });
    grip.addEventListener('dragstart', (e) => { S.dragFrom = i; try { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; } catch { /* a synthetic drag */ } });
    grip.addEventListener('dragend', () => { S.dragFrom = -1; S.pop?.querySelectorAll('.fv-row.over').forEach((n) => n.classList.remove('over')); });
    const row = el('div', { class: `fv-row${r.gone ? ' gone' : ''}`, dataset: { id: r.id, i: String(i) } },
      el('div', { class: 'fv-top' }, grip, el('span', { class: 'fv-layer', text: r.layerName, title: r.layerName }), ...marks,
        el('button', { type: 'button', class: 'ghost small fv-x', text: '✕', title: 'Unpin it (one undo step)', on: { click: () => unpin(r.id) } })),
      el('div', { class: 'fv-line' }, el('span', { class: 'fv-name', text: r.label, title: r.gone ? 'Not in the scene now (its layer or slider is gone)' : r.label }),
        r.gone ? el('span', { class: 'fv-sub', text: 'gone' }) : inputOf(r, x), r.gone ? null : el('span', { class: 'fv-val', text: fmt(r, r.value) })));
    row.addEventListener('dragover', (e) => { if (S.dragFrom < 0) return; e.preventDefault(); row.classList.add('over'); });
    row.addEventListener('dragleave', () => row.classList.remove('over'));
    row.addEventListener('drop', (e) => { if (S.dragFrom < 0) return; e.preventDefault(); const from = S.dragFrom; S.dragFrom = -1; reorder(from, i); });
    return row;
  }
  function paintRow(x) { const row = S.pop?.querySelector(`.fv-row[data-id="${CSS.escape(C().idOf(x))}"]`); if (!row) return; const r = resolve(x); const v = row.querySelector('.fv-val'); if (v) v.textContent = fmt(r, r.value); }
  function sigOf(list) { return JSON.stringify([sceneNow(), list.map((x) => { const r = resolve(x); return [r.id, r.gone, r.kind, r.label, r.layerName, r.locked, r.keyState, r.keyed, Boolean(r.follows), r.min, r.max]; }), (S.sug || []).length, S.sugNote]); }
  function paint(full = false) {
    if (!S.pop) return;
    const list = dataNow().list;
    const sig = sigOf(list);
    if (!full && sig === S.sig) return;
    S.sig = sig;
    const sug = S.sug ? el('div', { class: 'fv-sugs' },
      S.sug.length ? el('div', { class: 'fv-k' }, el('span', { text: '✦ From this scene\'s history' }), el('button', { type: 'button', class: 'ghost small fv-keepall', text: 'Pin all', on: { click: () => keepAll() } }),
        el('button', { type: 'button', class: 'ghost small', text: '✕', title: 'Hide the suggestions', on: { click: () => { S.sug = null; paint(true); } } })) : el('div', { class: 'fv-sub', text: S.sugNote }),
      ...S.sug.map((s, i) => el('div', { class: 'fv-sug', title: s.why },
        el('span', { class: 'fv-layer', text: s.layerName }), el('b', { text: s.label }), el('span', { class: 'fv-sub', text: s.why }),
        el('button', { type: 'button', class: 'small primary fv-keep', text: '★', title: 'Pin it', on: { click: () => keep(i) } })))) : null;
    S.pop.replaceChildren(
      el('div', { class: 'fv-head' }, el('b', { text: '★ Favourites' }), el('span', { class: 'fv-sub', text: list.length ? String(list.length) : '' }),
        el('button', { type: 'button', class: 'ghost small fv-suggest', text: '✦ Suggest', title: 'Suggest favourites from this scene\'s history: the sliders changed most, and the dials over them (on this computer, no AI)', on: { click: () => suggest() } }),
        el('button', { type: 'button', class: 'ghost small fv-close', text: '✕', title: 'Fold it (Esc)', on: { click: () => close() } })),
      list.length ? null : el('div', { class: 'fv-sub fv-empty', text: 'Right-click a slider (or a dial\'s ⋯) › ★ Pin to favourites, or ✦ Suggest.' }),
      ...list.map((x, i) => rowOf(x, i)), sug);
    place();
  }
  function tick() {
    if (!S.pop?.isConnected) return close();
    if (sceneNow() !== S.sid) { S.sid = sceneNow(); S.sug = null; paint(true); return; }
    const h = host(); if (S.pop.parentElement !== h) { h.append(S.pop); place(); }
    if (S.pop.querySelector('.fv-in:active')) return; // (a drag in progress: nothing redrawn under the pointer)
    paint();
    for (const x of dataNow().list) {
      const row = S.pop.querySelector(`.fv-row[data-id="${CSS.escape(C().idOf(x))}"]`); if (!row) continue;
      const inp = row.querySelector('.fv-in'); if (!inp || document.activeElement === inp || inp.matches(':active')) continue;
      const r = resolve(x); if (r.gone) continue;
      if (inp.type === 'checkbox') inp.checked = Boolean(r.value); else if (String(inp.value) !== String(r.value)) inp.value = r.kind === 'color' ? String(r.value).toLowerCase() : r.value;
      const v = row.querySelector('.fv-val'); if (v && v.textContent !== fmt(r, r.value)) v.textContent = fmt(r, r.value);
    }
  }

  function state() {
    return { open: Boolean(S.pop), sid: sceneNow(), list: dataNow().list.map((x) => resolve(x)), suggestions: (S.sug || []).map((s) => ({ ...s })), perf: Boolean(S.perf), stats: { ...stats } };
  }
  try { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: ★ Favourite controls (your pinned sliders and dials)', () => toggle(null).catch((e) => toast(calm(e), { type: 'error' }))); } catch { /* optional */ }
  return { toggle, open, close, pin, unpin, reorder, move, suggest, keep, keepAll, performEnd, state, stats };
})();
window.LabFavs = LabFavs;
