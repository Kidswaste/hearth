// ✥ Direct (round 46, labdirect): work on the Lab preview's picture itself. The gestures live in the preview's page
// (tools/three-sandbox.html, "Direct": the pick under the pointer, the drag, the snap guides, the outline and its
// handles); this is the Lab side: what a pick or a drag becomes.
//   · a click picks a layer: the Lab selects it (the Layers list highlights it, its code and sliders show)
//   · a drag / a corner / the turn circle / Alt+wheel / the arrows change its Move X / Move Y / Scale / Rotate, the
//     ordinary layer values (a keyframe at the playhead when the value is animated), so renders, recipes, templates,
//     the sequence and the directors follow; one undo step per drag (or per run of keys / wheel turns): Ctrl/⌘+Z
//   · a double-click opens its sliders; "✥ 3D" on a 3D layer's outline opens the scene editor's gizmo on the object
//     that was clicked (a 🧊 model's own gizmo, tools/three-models.js)
// Nothing new in any prompt (0 tokens); nothing runs until the picture is clicked.
const LabDirect = (() => {
  let h = null; // { send, pane, player, layerById, sel, select, edit, snapshot, restore, openSliders, setEdit, sketchId }
  const U = []; let tokN = 0; // undo steps: { n, sid, lid, before, label, timeline }
  const open = new Map(); // drag token → { lid, before } (the values before the drag's first change)
  const stats = { picks: 0, drags: 0, undos: 0, opens: 0 };
  const LABEL = { x: 'Moved', y: 'Moved', scale: 'Scaled', rotate: 'Turned' };
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;

  function attach(host) {
    h = host;
    // the timeline's Ctrl/⌘+Z takes our steps in their place among its own (when a song or a timeline is loaded)
    h.player?.addHooks?.({ undo: (entry) => (entry && entry.direct != null ? undo(entry) : false) });
    // otherwise Ctrl/⌘+Z in the Lab (or on the picture) undoes the last move here
    h.pane.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.defaultPrevented || e.key.toLowerCase() !== 'z' || typing(e) || e.target?.closest?.('.tw-column')) return; // (the sliders keep their own undo)
      const u = U[U.length - 1];
      if (!u || u.timeline || u.sid !== h.sketchId()) return;
      e.preventDefault(); e.stopPropagation();
      undo();
    }, true);
  }

  // ---------- the preview's messages ----------
  function onBox(msg) {
    if (!h || msg.type !== 'direct') return false;
    const L = msg.layer ? h.layerById(msg.layer) : null;
    if (msg.op === 'select' && L) { stats.picks += 1; view(); if (h.sel()?.id !== L.id) h.select(L.id); hint(); return true; }
    if (msg.op === 'open' && L) { stats.opens += 1; h.openSliders(L.id); return true; }
    if (msg.op === '3d' && L) { three(L, msg.path); return true; }
    if (msg.op === 'look' && L) { window.LabMatHook?.open({ layer: L.id, path: msg.path || null }); return true; } // (round 50, labmaterials) ◉ Look › on the outline
    if ((msg.op === 'live' || msg.op === 'end') && L && msg.patch) {
      if (!open.has(msg.tok)) { open.set(msg.tok, { lid: L.id, before: h.snapshot(L) }); if (open.size > 20) open.delete(open.keys().next().value); }
      h.edit(L.id, msg.patch, { live: msg.op === 'live' });
      if (msg.op === 'end') commit(msg.tok, L, msg.patch);
      return true;
    }
    return true;
  }
  // how big a pixel of the picture shows (an exact frame size is scaled to fit): the handles and the snap keep their size on screen
  function view() {
    const f = h.frame?.(); const w = f?.offsetWidth;
    const k = w ? Math.round((f.getBoundingClientRect().width / w) * 1000) / 1000 : 1;
    if (k > 0) h.send({ type: 'direct-view', k }); // (each pick: a new page or a new frame size starts at 1)
  }
  function commit(tok, L, patch) {
    const o = open.get(tok); open.delete(tok);
    if (!o) return;
    const before = o.before; const after = h.snapshot(L);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    stats.drags += 1;
    const what = [...new Set(Object.keys(patch).map((k) => LABEL[k]).filter(Boolean))];
    const label = `${what.length > 1 ? 'Changed' : what[0] || 'Moved'} “${L.name}”`;
    const timeline = Boolean(h.player?.loaded && h.player?.pushUndo);
    const n = ++tokN;
    U.push({ n, sid: h.sketchId(), lid: L.id, before, label, timeline }); if (U.length > 60) U.shift();
    if (timeline) h.player.pushUndo({ direct: n });
    window.LabAB?.note?.('layer', { label }); // (round 37's ◧ Before / after names the change)
  }
  // entry: the timeline's own (an older one than our last does nothing: it was undone already)
  function undo(entry = null) {
    const u = U[U.length - 1];
    if (!u || (entry && entry.direct < u.n)) return false;
    if (u.sid !== h.sketchId()) { toast('That move was in another scene', { timeout: 1800 }); return false; }
    U.pop();
    const L = h.layerById(u.lid);
    if (!L) return false;
    if (u.fn) u.fn(L); else h.restore(L, u.before);
    stats.undos += 1;
    toast(`↶ ${u.label} undone`, { timeout: 1400 });
    return true;
  }

  // ✥ 3D: the 3D gizmo on what was clicked (a 🧊 model's own; else the scene editor with the object picked)
  async function three(L, path) {
    try {
      if (typeof ThreeModels !== 'undefined' && ThreeModels.isModelCode?.(L.code)) { await ThreeModels.gizmo('translate', L.id); return; }
      if (h.sel()?.id !== L.id) h.select(L.id);
      h.setEdit(true);
      if (path) setTimeout(() => h.send({ type: 'edit', cmd: 'select', path }), 400);
    } catch (err) { toast(window.calmError ? calmError(err) : err.message, { type: 'error', timeout: 5000 }); }
  }

  // (round 50, labmaterials) another change on the picture (a ◉ look) takes its turn in the same Ctrl/⌘+Z: fn(L) puts it back
  function push(lid, label, fn) {
    if (!h) return false;
    const timeline = Boolean(h.player?.loaded && h.player?.pushUndo);
    const n = ++tokN;
    U.push({ n, sid: h.sketchId(), lid, label, timeline, fn }); if (U.length > 60) U.shift();
    if (timeline) h.player.pushUndo({ direct: n });
    window.LabAB?.note?.('layer', { label });
    return true;
  }

  // ---------- discoverable: one tip the first time, the keys sheet, the help ----------
  const HINT = 'three.directHint';
  function hint() {
    if (store.get(HINT, false)) return;
    const show = () => { if (store.get(HINT, false)) return null; store.set(HINT, true); return toast('Picked: drag to move · corners scale · ◯ turns · double-click: its sliders', { timeout: 5000, action: { label: 'How', fn: () => help() } }); };
    if (window.Hints) Hints.offer({ id: 'lab.direct', place: 'lab', rank: 15, once: false, ttl: 60000, show }); else show();
  }
  const ROWS = () => [
    ['Click', 'Pick a layer on the picture (the Layers list follows) · on nothing: let go'],
    ['Drag', 'Move it (Shift: snap to the centre, thirds, edges and the other layers)'],
    ['Corners · ◯', 'Scale it · turn it (Shift: 5 % / 15° steps)'],
    ['Alt+scroll', 'Scale it'], // (round 49: the <kbd> says ⌥-scroll on the Mac)
    ['Arrows', 'Nudge it 1 px (Shift: 10 px)'],
    ['Double-click', 'Open its sliders'],
    ['Ctrl+Z · Esc', 'Undo the last move · let go'], // (⌘Z on the Mac)
  ];
  function help() {
    const d = el('dialog', { class: 'lab-keys' }, el('h2', { text: 'Working on the picture' }),
      el('div', { class: 'lab-keys-grid' }, ROWS().flatMap(([k, v]) => [el('kbd', { text: k }), el('span', { text: v })])),
      el('p', { class: 'hint', text: 'What moves is the layer’s own Move X / Move Y / Scale / Rotate (Layers › its settings), so renders and the sequence follow. Animated values get a keyframe at the playhead. A 3D layer shows ✥ 3D on its outline: the gizmo on the object you clicked. Scenes with their own orbit or drag controls keep their drags: a click picks them, the corners and the arrows still work.' }),
      el('div', { class: 'dialog-actions' }, el('button', { class: 'primary', text: 'Got it', on: { click: () => d.close() } })));
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d); d.showModal();
    return d;
  }
  const inLab = () => H.surfaceIdFor?.(H.activeId) === 'tool:three';
  try {
    Keys.add(
      { area: 'Lab', keys: 'Click · Drag on the picture', what: 'Pick a layer and move it (Shift: snap · corners scale · ◯ turns · arrows nudge · double-click: its sliders · Esc lets go)', when: inLab, run: () => help() },
      { area: 'Lab', keys: 'Alt+scroll on the picture', what: 'Scale the picked layer', when: inLab, run: () => help() },
    );
  } catch { /* keys list optional */ }

  return { attach, onBox, undo, push, help, stats, get steps() { return U.map((u) => ({ label: u.label, timeline: u.timeline })); } };
})();
window.LabDirect = LabDirect;
