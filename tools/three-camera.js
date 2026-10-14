// 🎥 Camera moves (round 40, labcamera): one-click cinematic camera moves on the Lab timeline, 0 tokens. Push in, pull
// out, orbit (left / right, ¼ · ½ · full), dolly zoom, crane up / down, a subtle handheld shake, whip pan, slow drift,
// a punch-in on each kick / beat / bar, and "from this view to that view" (two views set by looking around the
// preview: the gestures' view, as "Keep this view" uses it). Each move is a keyframed offset on the layer's own 3D
// camera over a range of the scene's clock (its song, else its own timeline), with an easing preset and an intensity:
//   · right-click the preview › 🎥 Camera moves (the presets, your moves, from / to this view)
//   · the timeline: the moves are cyan bars under the waveform, drag an end (or the bar); right-click the waveform ›
//     🎥 Camera move from here…
//   · the card (🎥 Your moves…): each move's easing, intensity, remove; add more
//   · Lab search / Find anything ("push in", "orbit", "dolly zoom", "camera move on the beat"), /camera-moves for chats
// Moves live on the layer (`layer.camMoves`): saved with the scene, its 📐 templates and .hearthpack packs; the preview
// computes them from the time (tools/three-camera-core.js), so renders and the Lab sequence are the same every time.
// Each change is one undo step (the card's ↶, the toast's Undo, the timeline's Ctrl/⌘+Z, /camera-moves undo) and one
// 📜 recipe step. Offered only for layers that draw with an orbit-able 3D camera (the preview says which).
const LabCamera = (() => {
  const C = CamCore;
  const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
  const stats = { added: 0, drags: 0, undos: 0, commits: 0 };
  let h = null; // { send, player, layers, layerById, sel, edit, sketchId, host, ensureClock }
  const P = () => h?.player;

  // ---------- the preview's answers (cam-info) ----------
  let reqN = 0; const waits = new Map();
  function ask(cmd, extra = {}) {
    if (!h) return Promise.resolve({ ok: false, why: 'Open the Lab first' });
    const req = ++reqN;
    return new Promise((res) => {
      const t = setTimeout(() => { waits.delete(req); res({ ok: false, why: 'The preview didn’t answer (is a scene running?)' }); }, 2500);
      waits.set(req, (m) => { clearTimeout(t); res(m); });
      h.send({ type: 'cam', cmd, req, layer: h.sel()?.id || null, ...extra });
    });
  }
  function onBox(msg) { const w = waits.get(msg.req); if (w) { waits.delete(msg.req); w(msg); } return true; }

  // ---------- the scene's clock ----------
  const len = () => (P()?.duration > 0 ? P().duration : 10);
  const barLen = () => (60 / (P()?.bpm || 120)) * (P()?.beatsPerBar || 4);
  const movesOf = (L) => (Array.isArray(L?.camMoves) ? L.camMoves : []);
  // the layers with moves (top first), and the one a new move goes on
  const withMoves = () => (h ? [...h.layers()].reverse().filter((L) => movesOf(L).length) : []);

  // ---------- changes: one undo step each ----------
  const U = []; let tokN = 0;
  function liveSet(lid, next) {
    const L = h.layerById(lid); if (!L) return;
    L.camMoves = next;
    h.send({ type: 'layer-props', id: lid, props: { camMoves: next.length ? next : null } });
    P()?.redraw?.();
  }
  // next: the layer's whole list; from: what it was before a live drag (else as it is now)
  function commit(lid, next, label, { from = null, quiet = false } = {}) {
    const L = h?.layerById(lid); if (!L) return false;
    const before = clone(from ?? movesOf(L));
    const after = clone(next);
    if (JSON.stringify(before) === JSON.stringify(after)) { if (from) liveSet(lid, after); return false; }
    h.edit(lid, { camMoves: after.length ? after : null });
    const tok = ++tokN;
    U.push({ tok, sid: h.sketchId(), lid, before, after, label }); if (U.length > 80) U.shift();
    P()?.pushUndo?.({ cam: tok });
    stats.commits += 1;
    window.LabRecipesHook?.note?.('cam', { moves: recipeMoves(after) }); // (round 39, labrecipes: one step)
    P()?.redraw?.();
    card?.paint();
    if (!quiet) toast(label, { timeout: 2600, action: { label: 'Undo', fn: () => undo() } });
    return true;
  }
  // entry: the timeline's Ctrl/⌘+Z hands its own entry (only the change it was made for is undone)
  function undo(entry = null) {
    if (entry && entry.cam === undefined) return false;
    const u = U[U.length - 1];
    if (!u || (entry && entry.cam !== u.tok)) return false;
    if (u.sid !== h.sketchId()) { toast('That camera move was on another scene', { timeout: 1800 }); return false; }
    U.pop();
    h.edit(u.lid, { camMoves: u.before.length ? clone(u.before) : null });
    stats.undos += 1;
    P()?.redraw?.(); card?.paint();
    toast(`↶ ${u.label.replace(/^🎥\s*/, '')} undone`, { timeout: 1400 });
    return true;
  }
  const undoLabel = () => { const u = U[U.length - 1]; return u && u.sid === h?.sketchId() ? u.label : null; };

  // ---------- adding ----------
  // where a new one goes when nothing says: the loop if there is one; else the whole scene for the first move and
  // right after the last one for the next (moves in sequence)
  function rangeAuto(moves, when) {
    const p = P();
    const w = when || (p?.loop ? 'loop' : moves.length ? 'after' : 'whole');
    return C.rangeFor(w, { len: len(), now: p?.time || 0, loop: p?.loop || null, bar: barLen(), moves });
  }
  async function add(kind, o = {}) {
    h?.ensureClock?.();
    const info = await ask('info');
    if (!info.ok) { toast(info.why, { timeout: 2600 }); return null; }
    const L = h.layerById(info.layer); if (!L) { toast('That layer is gone', { timeout: 1600 }); return null; }
    const moves = movesOf(L);
    const [t0, t1] = o.t0 != null ? [o.t0, o.t1 ?? o.t0 + 4 * barLen()] : rangeAuto(moves, o.when);
    const m = C.make(kind, { ...o, t0, t1: Math.min(Math.max(t1, t0 + 0.1), Math.max(len(), t0 + 0.1)), d: moves[0]?.d || info.d });
    commit(L.id, [...moves, m], `🎥 ${C.name(m)} · ${C.fmtT(m.t0)}–${C.fmtT(m.t1)}`, { quiet: o.quiet });
    stats.added += 1;
    return m;
  }
  // "from this view to that view": the look-around view now (right-drag / two fingers / the wheel) is the start, then the end
  let fromView = null; // { sid, lid, view, d }
  async function setFrom() {
    const info = await ask('grab');
    if (!info.ok) { toast(info.why, { timeout: 2600 }); return null; }
    fromView = { sid: h.sketchId(), lid: info.layer, view: info.view, d: info.d };
    const moved = !C.identity({ ...C.zero(), ...info.view });
    toast(moved ? '🎥 Start view kept. Now look around to the end view (right-drag or two fingers, the wheel zooms), then 🎥 › …to this view' : '🎥 Start: the scene’s own camera. Look around to the end view (right-drag or two fingers, the wheel zooms), then 🎥 › …to this view', { timeout: 6000 });
    return fromView;
  }
  async function setTo(o = {}) {
    h?.ensureClock?.();
    const info = await ask('grab', { reset: true });
    if (!info.ok) { toast(info.why, { timeout: 2600 }); return null; }
    const L = h.layerById(info.layer); if (!L) return null;
    const f = fromView && fromView.sid === h.sketchId() && fromView.lid === info.layer ? fromView : null;
    fromView = null;
    const moves = movesOf(L);
    const [t0, t1] = o.t0 != null ? [o.t0, o.t1] : rangeAuto(moves, o.when);
    const m = C.make('views', { ...o, t0, t1, from: f?.view || null, to: info.view, d: f?.d || info.d });
    commit(L.id, [...moves, m], `🎥 ${f ? 'From your start view to this one' : 'From the scene’s camera to this view'} · ${C.fmtT(m.t0)}–${C.fmtT(m.t1)}`);
    stats.added += 1;
    return m;
  }
  // one move changed (ease, intensity, kind details, times) / removed / all removed
  function findMove(id) { for (const L of h.layers()) { const i = movesOf(L).findIndex((m) => m.id === id); if (i >= 0) return { L, i, m: movesOf(L)[i] }; } return null; }
  function patch(id, p, { from = null, label = null } = {}) {
    const f = findMove(id); if (!f) return false;
    const next = movesOf(f.L).map((m) => (m.id === id ? C.clean({ ...m, ...p }) : m));
    return commit(f.L.id, next, label || `🎥 ${C.name(next[f.i])}: ${Object.keys(p).map((k) => ({ ease: `${C.EASE[p.ease]?.name || ''}`, amt: `intensity ${Math.round(p.amt * 100)} %`, t0: 'timing', t1: 'timing' })[k] || k).filter(Boolean)[0] || 'changed'}`, { from });
  }
  function remove(id) { const f = findMove(id); if (!f) return false; return commit(f.L.id, movesOf(f.L).filter((m) => m.id !== id), `🎥 ${C.name(f.m)} removed`); }
  function clearAll() { const Ls = withMoves(); if (!Ls.length) return 0; let n = 0; for (const L of Ls) { n += movesOf(L).length; commit(L.id, [], `🎥 ${n} camera move${n === 1 ? '' : 's'} removed`); } return n; }
  // a whole list at once (a recipe, chat): rel = times as fractions of the scene's length
  async function setAll(moves, { rel = false, label = '🎥 Camera moves' } = {}) {
    h?.ensureClock?.();
    const info = await ask('info');
    if (!info.ok) return info.why;
    const n = len();
    const list = C.cleanAll((moves || []).map((m) => (rel ? { ...m, id: undefined, t0: m.t0 * n, t1: m.t1 * n } : m))).map((m) => ({ ...m, d: info.d }));
    commit(info.layer, list, label, { quiet: true });
    return null;
  }
  const recipeMoves = (list) => { const n = len(); return list.map((m) => ({ ...m, t0: Math.round((m.t0 / n) * 1e4) / 1e4, t1: Math.round((m.t1 / n) * 1e4) / 1e4 })); };

  // ---------- the menus ----------
  // the presets as rows; o: { t0 } from the timeline's right-click (4 bars from there)
  function presets(o = {}) {
    const go = (kind, x = {}) => () => add(kind, { ...o, ...x }).catch(err);
    return [
      { label: '⇥ Push in', hint: 'toward the subject', action: go('push') },
      { label: '⇤ Pull out', hint: 'away, revealing more', action: go('pull') },
      { label: '↻ Orbit', hint: 'around the subject', items: () => [
        ...[[0.25, '¼'], [0.5, '½'], [1, 'a full turn']].map(([t, n]) => ({ label: `↻ Right ${n}`, action: go('orbit', { dir: 1, turns: t }) })),
        ...[[0.25, '¼'], [0.5, '½'], [1, 'a full turn']].map(([t, n]) => ({ label: `↺ Left ${n}`, action: go('orbit', { dir: -1, turns: t }) }))] },
      { label: '⧖ Dolly zoom', hint: 'the vertigo shot', items: () => [{ label: 'Pull back, zoom in', hint: 'the world stretches away', action: go('dolly', { dir: 1 }) }, { label: 'Push in, zoom out', hint: 'the world closes in', action: go('dolly', { dir: -1 }) }] },
      { label: '⇡ Crane up', hint: 'rises over the subject', action: go('crane', { dir: 1 }) },
      { label: '⇣ Crane down', hint: 'comes down to it', action: go('crane', { dir: -1 }) },
      { label: '≋ Handheld shake', hint: 'subtle', action: go('shake') },
      { label: '⟿ Whip pan', hint: 'a fast swing away and back', items: () => [{ label: 'To the right', action: go('whip', { dir: 1 }) }, { label: 'To the left', action: go('whip', { dir: -1 }) }] },
      { label: '〜 Slow drift', hint: 'a slow float', action: go('drift') },
      { label: '✸ Punch-in on the beat', hint: 'a quick push on each hit', items: () => C.BANDS.map((b) => ({ label: `On ${b.name}`, hint: b.id === 'kick' ? 'your kick markers, else the song’s' : b.id === 'bar' ? 'the 1 of each bar' : 'the beat grid', action: go('punch', { band: b.id }) })) },
    ];
  }
  const tags = 'camera move moves cinematic push in pull out orbit dolly zoom vertigo crane up down handheld shake whip pan slow drift punch in on the beat kick bar from this view to that view keyframe camera path timeline';
  function previewItem() {
    return { label: '🎥 Camera moves', hint: 'push in, orbit, dolly zoom, punch-in on the beat…', tags, boost: 0.3, items: () => menuItems() };
  }
  function menuItems() {
    const n = withMoves().reduce((k, L) => k + movesOf(L).length, 0);
    const u = undoLabel();
    return [
      ...presets(),
      '-',
      { label: fromView && fromView.sid === h?.sketchId() ? '⇢ …to this view (the end)' : '⇢ From this view…', hint: fromView && fromView.sid === h?.sketchId() ? 'the view you looked around to now' : 'then look around to the end view', action: () => (fromView && fromView.sid === h?.sketchId() ? setTo() : setFrom()).catch(err) },
      ...(fromView ? [] : [{ label: '⇢ …to this view', hint: 'from the scene’s own camera', action: () => setTo().catch(err) }]),
      '-',
      { label: n ? `🎥 Your moves (${n})…` : '🎥 Your moves…', hint: 'easing, intensity, remove', action: () => open() },
      ...(u ? [{ label: `↶ Undo ${u.replace(/^🎥\s*/, '')}`, action: () => undo() }] : []),
      ...(n ? [{ label: 'Remove every camera move', hint: `${n} on this scene (↶ undoes)`, action: () => clearAll() }] : []),
    ];
  }
  // the timeline's own right-click (the waveform): a move from there, 4 bars long
  let lastXY = [120, 120];
  addEventListener('contextmenu', (e) => { lastXY = [e.clientX, e.clientY]; }, true);
  const toTweakRows = (items) => items.filter((x) => x !== '-').map((x) => [x.label, x.hint || '', x.items ? toTweakRows(x.items()) : x.action]);
  function waveItems(t) {
    if (!h) return [];
    const at = Math.max(0, t);
    return [['🎥 Camera move from here…', '4 bars: push in, orbit, punch-in on the kick…', () => ThreeTweaks.menu(lastXY[0], lastXY[1], [`Camera move from ${C.fmtT(at)}`, ...toTweakRows(presets({ t0: at, t1: Math.min(len(), at + 4 * barLen()) }))])],
      ...(withMoves().length ? [['🎥 Your camera moves…', 'easing, intensity, remove', () => open()]] : [])];
  }

  // ---------- the timeline: cyan bars under the waveform, ends dragged ----------
  const BAND_H = 13; let geo = null; // { LT } from the last draw
  let drag = null; // { id, lid, edge, from (the list before), m0, grab }
  const bandY = (LT) => [LT - BAND_H - 2, LT - 2];
  function drawOver(g, o) {
    geo = { LT: o.LT, w: o.w };
    const Ls = withMoves(); if (!Ls.length) return;
    const [y0, y1] = bandY(o.LT);
    g.save();
    g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
    for (const L of Ls) {
      for (const m of movesOf(L)) {
        const xa = o.X(m.t0); const xb = o.X(m.t1);
        if (xb < 0 || xa > o.w) continue;
        const on = drag?.id === m.id;
        g.fillStyle = on ? '#48ddff66' : '#48ddff33';
        g.fillRect(xa, y0, Math.max(2, xb - xa), y1 - y0);
        g.fillStyle = '#48ddff';
        g.fillRect(Math.round(xa), y0, 2, y1 - y0); g.fillRect(Math.round(xb) - 2, y0, 2, y1 - y0);
        if (!C.KIND[m.kind]?.travel) { g.fillRect(xa, y0, Math.max(2, xb - xa), 1); }
        const label = `${C.KIND[m.kind]?.icon || '🎥'} ${C.name(m)}`;
        if (xb - xa > 34) { g.save(); g.beginPath(); g.rect(xa + 3, y0, xb - xa - 6, y1 - y0); g.clip(); g.fillStyle = '#dff8ff'; g.fillText(label, Math.max(xa + 5, 4), (y0 + y1) / 2 + 0.5); g.restore(); }
      }
    }
    g.restore();
  }
  // what's under the pointer in the band: { L, m, edge: 'a' | 'b' | 'both' }
  function hitAt(e, xOf) {
    if (!geo) return null;
    const r = e.target?.getBoundingClientRect?.(); if (!r) return null;
    const y = e.clientY - r.top; const x = e.clientX - r.left;
    const [y0, y1] = bandY(geo.LT);
    if (y < y0 - 2 || y > y1 + 2) return null;
    let best = null;
    for (const L of withMoves()) {
      for (const m of movesOf(L)) {
        const xa = xOf(m.t0); const xb = xOf(m.t1);
        const da = Math.abs(x - xa); const db = Math.abs(x - xb);
        if (da <= 6 && (!best || da < best.dist)) best = { L, m, edge: 'a', dist: da };
        if (db <= 6 && (!best || db < best.dist)) best = { L, m, edge: 'b', dist: db };
        if (!best && x > xa && x < xb) best = { L, m, edge: 'both', dist: 99 };
      }
    }
    return best;
  }
  // a dragged end lands on a beat when one is within 6 px
  function snap(t, xOf) {
    const bs = P()?.beatsIn?.(t - 1, t + 1) || [];
    let best = t; let bd = 6;
    for (const b of bs) { const d = Math.abs(xOf(b) - xOf(t)); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  function pointerDown(e, t, { xOf }) {
    const hit = hitAt(e, xOf); if (!hit) return null;
    const from = clone(movesOf(hit.L));
    drag = { id: hit.m.id, lid: hit.L.id, edge: hit.edge, from, m0: { ...hit.m }, grab: t };
    stats.drags += 1;
    let cur = from;
    return {
      move: (t2) => {
        const m = hit.edge === 'both' ? C.moveEdge(drag.m0, 'both', t2 - drag.grab, { len: len(), from: drag.m0.t0 }) : C.moveEdge(drag.m0, hit.edge, snap(t2, xOf), { len: len() });
        cur = from.map((x) => (x.id === m.id ? m : x));
        liveSet(drag.lid, cur);
      },
      up: () => {
        const d = drag; drag = null;
        const m = cur.find((x) => x.id === d.id);
        commit(d.lid, cur, `🎥 ${C.name(m)} · ${C.fmtT(m.t0)}–${C.fmtT(m.t1)}`, { from, quiet: true });
        P()?.redraw?.();
      },
    };
  }
  const cursorAt = (t, hit, xOf, e) => { if (!e || (hit.zone !== 'wave' && hit.zone !== 'ruler')) return ''; const x = hitAt(e, xOf); return x ? (x.edge === 'both' ? 'grab' : 'col-resize') : ''; };
  const frameKey = () => (h ? withMoves().map((L) => movesOf(L).map((m) => `${m.id}:${m.t0}:${m.t1}:${m.kind}`).join(',')).join('|') + (drag ? `|d${drag.id}` : '') : '');

  // ---------- the card: your moves ----------
  let card = null;
  function close() { card?.close(); card = null; }
  function open() {
    close();
    if (!h) { toast('Open the Lab first', { timeout: 1400 }); return null; }
    const list = el('div', { class: 'cm-list' });
    const undoBtn = el('button', { type: 'button', class: 'ghost small', text: '↶', title: 'Undo the last camera move change', on: { click: () => undo() } });
    const addBtn = el('button', { type: 'button', class: 'small', text: '＋ Add a move ▾', on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); ThreeTweaks.menu(r.left, r.bottom + 4, ['Add a camera move', ...toTweakRows(presets())]); } } });
    const pop = el('div', { class: 'cm-pop lab-pop', role: 'dialog', attrs: { 'aria-label': 'Camera moves' } },
      el('div', { class: 'cm-head' }, el('b', { text: '🎥 Camera moves' }), el('span', { class: 'cm-sub', text: 'on the scene’s timeline' }), el('button', { type: 'button', class: 'ghost small cm-x', text: '✕', title: 'Close (Esc)', on: { click: close } })),
      list,
      el('div', { class: 'cm-note', text: 'Drag a move’s ends (or the bar) on the timeline: the cyan bars under the waveform.' }),
      el('div', { class: 'cm-foot' }, addBtn, undoBtn, el('button', { type: 'button', class: 'small primary', text: 'Done', on: { click: close } })));
    function row(L, m) {
      const ease = el('select', { class: 'cm-ease', title: 'How it moves between its ends' }, C.EASES.map((x) => el('option', { value: x.id, text: x.name, selected: x.id === m.ease })));
      ease.addEventListener('change', () => patch(m.id, { ease: ease.value }));
      const amt = el('input', { type: 'range', min: 0, max: 2, step: 0.05, value: m.amt ?? 1, class: 'cm-amt', title: 'Intensity' });
      const pct = el('span', { class: 'cm-pct', text: `${Math.round((m.amt ?? 1) * 100)} %` });
      let from = null;
      amt.addEventListener('input', () => {
        from ||= clone(movesOf(L));
        const v = Number(amt.value); pct.textContent = `${Math.round(v * 100)} %`;
        liveSet(L.id, movesOf(L).map((x) => (x.id === m.id ? { ...x, amt: v } : x)));
      });
      amt.addEventListener('change', () => { const f = from; from = null; patch(m.id, { amt: Number(amt.value) }, { from: f }); });
      return el('div', { class: 'cm-row', dataset: { id: m.id } },
        el('span', { class: 'cm-name', text: `${C.KIND[m.kind]?.icon || '🎥'} ${C.name(m)}`, title: C.KIND[m.kind]?.hint || '' }),
        el('span', { class: 'cm-time', text: `${C.fmtT(m.t0)}–${C.fmtT(m.t1)}`, title: 'Drag its ends on the timeline' }),
        ease, amt, pct,
        el('button', { type: 'button', class: 'ghost small cm-del', text: '✕', title: 'Remove this move (↶ undoes)', on: { click: () => remove(m.id) } }));
    }
    let lastKey = '';
    function paint() {
      const Ls = withMoves();
      const key = JSON.stringify(Ls.map((L) => movesOf(L))) + undoLabel();
      if (key === lastKey) return; lastKey = key; // (never rewrite what didn't change)
      undoBtn.disabled = !undoLabel();
      const rows = Ls.flatMap((L) => movesOf(L).slice().sort((a, b) => a.t0 - b.t0).map((m) => row(L, m)));
      list.replaceChildren(...(rows.length ? rows : [el('div', { class: 'cm-empty', text: 'No camera moves yet. Add one: push in, orbit, a punch-in on the kick…' })]));
    }
    const place = () => {
      const r = (h.host?.isConnected ? h.host : document.body).getBoundingClientRect();
      const w = Math.min(420, innerWidth - 16); const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + 12));
      Object.assign(pop.style, { left: `${left}px`, top: `${Math.max(8, r.top + 12)}px`, width: `${w}px` });
    };
    const away = (e) => { if (!pop.contains(e.target) && !e.target.closest?.('.mb-menu, .lab-pop, .three-timeline, canvas')) close(); };
    const keys = (e) => { if (e.key === 'Escape' && !document.querySelector('.mb-menu')) { e.stopPropagation(); close(); } };
    document.body.append(pop);
    paint(); place();
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', keys, true); }, 0);
    card = { pop, paint, close() { pop.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', keys, true); } };
    return card;
  }
  const err = (e) => toast(e?.message || String(e), { type: 'error' });

  function attach(hooks) {
    h = hooks;
    h.player?.addHooks?.({ drawOver, pointerDown, cursorAt, waveItems, undo: (entry) => undo(entry), frameKey });
  }
  addEventListener('hearth:sketch', () => { fromView = null; close(); });

  // ---------- chats: /camera-moves ----------
  try {
    if (typeof Commands !== 'undefined' && !Commands.get('camera-moves')) {
      const ready = async () => { await ThreeLab.cmd(); for (let i = 0; i < 40 && !h; i += 1) await new Promise((r) => setTimeout(r, 50)); if (!h) throw new Error('Open the Three.js Lab first'); };
      Commands.register({
        name: 'camera-moves', area: 'Three.js Lab', aliases: ['lab-camera'],
        desc: 'Cinematic camera moves on the Lab timeline (keyframes on the scene’s own camera, renders match): push in, pull out, orbit left/right ¼ ½ full, dolly zoom, crane up/down, handheld shake, whip pan, slow drift, punch-in on each kick/beat/bar, from/to this view; [whole|loop|here|after] [smooth|cine|in|out|linear|snap] [60%] [2s to 8s]; list · undo · clear',
        args: '<move words> | from | to | list | undo | clear',
        keywords: 'camera move push pull orbit dolly zoom vertigo crane shake handheld whip pan drift punch beat kick bar view keyframe',
        async run(args) {
          await ready();
          const a = String(args || '').trim();
          const all = () => withMoves().flatMap((L) => movesOf(L));
          if (!a || /^list$/i.test(a)) { const ms = all(); return ms.length ? `Camera moves:\n${ms.map((m) => C.describe(m)).join('\n')}` : 'No camera moves on this scene: /camera-moves push in (or right-click the preview › 🎥 Camera moves)'; }
          if (/^undo$/i.test(a)) return undo() ? 'Undone' : 'Nothing to undo';
          if (/^(clear|off|none|remove all)$/i.test(a)) { const n = clearAll(); return n ? `${n} camera move${n === 1 ? '' : 's'} removed (/camera-moves undo brings them back)` : 'No camera moves to remove'; }
          if (/^from\b/i.test(a)) { const r = await setFrom(); return r ? 'Start view kept: look around to the end view, then /camera-moves to' : 'No 3D camera here'; }
          if (/^to\b/i.test(a)) { const m = await setTo(); return m ? C.describe(m) : 'No 3D camera here'; }
          const o = C.parse(a);
          if (!o.kind) throw new Error(`Moves: ${C.KINDS.map((k) => k.name.toLowerCase()).join(', ')}`);
          if (o.kind === 'views') { const m = await setTo(o); return m ? C.describe(m) : 'No 3D camera here'; }
          const m = await add(o.kind, { ...o, quiet: true });
          return m ? `${C.describe(m)} · /camera-moves undo` : 'This scene has no 3D camera to move';
        },
        complete: (s) => ['push in', 'pull out', 'orbit right quarter', 'orbit left half', 'orbit full', 'dolly zoom', 'crane up', 'crane down', 'handheld shake', 'whip pan right', 'slow drift', 'punch in on each kick', 'punch in on each bar', 'from', 'to', 'list', 'undo', 'clear'].filter((x) => x.includes(String(s || '').trim().toLowerCase())).slice(0, 14).map((value) => ({ value })),
      });
    }
  } catch { /* commands optional */ }
  // ⌘/Ctrl+K (also what Find anything lists)
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: 🎥 Camera moves (push in, orbit, dolly zoom, punch-in on the beat…)', async () => { try { await ThreeLab.cmd(); for (let i = 0; i < 40 && !h; i += 1) await new Promise((r) => setTimeout(r, 50)); open(); } catch (e) { err(e); } });

  return { attach, onBox, previewItem, menuItems, presets, waveItems, add, setFrom, setTo, patch, remove, clearAll, setAll, undo, open, close, ask, stats, get card() { return card; }, moves: () => withMoves().map((L) => ({ layer: L.id, moves: clone(movesOf(L)) })), get undoDepth() { return U.length; } };
})();
