// (round 158, split158) The Lab's scene editor (✥ Edit): move, turn and resize things in the preview, placements baked into the code.
// Moved out of tools/three.js, unchanged: loaded on first use (lazy group `labpartedit`, tools/three.js labPart). K is
// what it reaches inside the Lab (the sketch tab: its state, helpers and the other parts' stand-ins).
(window.LabParts ||= {}).edit = (K) => {
  function setEdit(on) {
    const L = K.sel();
    if (on && !L) return;
    K.editOn = on;
    K.editBtn.classList.toggle('on', on);
    K.editPanel.hidden = !on;
    K.previewHost.classList.toggle('editing', on);
    K.box.send({ type: 'edit', cmd: on ? 'on' : 'off', layer: L?.id });
    if (on) { K.paintMode('translate'); K.editSel = null; paintEditSel(); toast(`Editing "${L.name}": drag to orbit, right-drag to pan, wheel to zoom, click an object to move it`, { timeout: 3500 }); }
  }
  function paintEditSel() {
    const info = K.editSel;
    if (!info) {
      K.selBox.replaceChildren(el('div', { class: 'ed-hint', text: 'Click an object to select it · drag to orbit · right-drag to pan · wheel to zoom · W / E / R move / rotate / scale · F focus · Alt+click picks its group · Esc deselects' }));
    } else {
      const num = (prop, axis, val) => {
        const name = ['X', 'Y', 'Z'][axis];
        const step = prop === 'r' ? 1 : 0.05;
        const inp = el('input', { type: 'number', class: 'ed-num', value: val, step, title: `${name}: type an exact value or use the arrows`, attrs: { 'aria-label': `${prop === 'p' ? 'Position' : prop === 'r' ? 'Rotation' : 'Scale'} ${name}` } });
        const set = (value) => { if (!Number.isFinite(value)) return; K.pushEditUndo(); K.box.send({ type: 'edit', cmd: 'set', prop, axis, value }); };
        inp.addEventListener('change', () => { if (inp.value.trim()) set(Number(inp.value)); });
        const nudge = (sign) => K.btn(sign < 0 ? '−' : '+', `${name}: ${sign < 0 ? 'decrease' : 'increase'} · Shift: ×10 · Alt: fine`, e => set(Number(inp.value) + sign * step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1)));
        return el('label', { class: `ed-axis ed-axis-${name.toLowerCase()}` }, el('span', { text: name }), nudge(-1), inp, nudge(1));
      };
      const trio = (label, prop, arr) => el('div', { class: 'ed-trio' }, el('span', { class: 'ed-lab', text: label }), ...arr.map((v, k) => num(prop, k, v)));
      const placed = Boolean(K.sel()?.overrides?.[info.path]);
      K.selBox.replaceChildren(
        el('div', { class: 'ed-row' }, el('b', { text: info.name || info.type }), el('span', { class: 'ed-type', text: `${info.type}${info.children ? ` · ${info.children} inside` : ''}${placed ? ' · placed' : ''}` }), el('span', { class: 'spacer' }),
          info.hasParent ? K.btn('Parent', 'Select the group it belongs to', () => K.box.send({ type: 'edit', cmd: 'parent' })) : null,
          K.btn('Focus', 'Fly the view to it (F)', () => K.box.send({ type: 'edit', cmd: 'focus' })),
          window.LabMatHook ? K.btn('◉ Look ›', 'Its look: chrome, glass, gold, plastic, velvet, neon… (the material)', (e) => LabMatHook.open({ layer: K.sel()?.id, path: info.path, anchor: e?.currentTarget })) : null, // (round 50, labmaterials)
          K.btn(info.v ? '👁 Hide' : '👁 Show', 'Hide or show it', () => { K.pushEditUndo(); K.box.send({ type: 'edit', cmd: 'visible' }); }),
          placed ? K.btn('↺ Reset', 'Back to where the code puts it', () => resetPlacement(info.path)) : null),
        (() => {
          // the arrows are the main tool; exact numbers fold away (remembered)
          const d = el('details', { class: 'ed-nums', on: { toggle: (e) => store.set('three.edNums', e.currentTarget.open) } },
            el('summary', { text: 'Exact values' }), trio('Position', 'p', info.p), trio('Rotation°', 'r', info.r), trio('Scale', 's', info.s));
          d.open = store.get('three.edNums', false);
          return d;
        })());
    }
    const n = K.placements().length; const cam = Boolean(K.sel()?.overrides?.['@camera']);
    K.footBox.replaceChildren(el('span', { text: n || cam ? `${n} object${n === 1 ? '' : 's'} placed${cam ? ' · camera set' : ''} in "${K.sel()?.name}"` : 'Nothing placed yet' }), el('span', { class: 'spacer' }),
      K.editUndo.length ? K.btn('↶', 'Undo the last placement', () => undoEdit()) : null,
      n || cam ? K.btn('Bake into code…', 'Ask the Three Director to write these placements into the code', () => bakePlacements()) : null,
      cam ? K.btn('Reset camera', 'The sketch\'s own camera again', () => resetPlacement('@camera')) : null,
      n || cam ? K.btn('Clear all', 'Remove every placement in this layer', () => { K.pushEditUndo(); const lk = K.sel()?.overrides?.['@look']; setOverrides(K.sel(), lk ? { '@look': lk } : null); }) : null);
  }
  function setOverrides(L, ov) {
    L.overrides = ov && Object.keys(ov).length ? ov : undefined;
    K.box.send({ type: 'layer-props', id: L.id, props: { overrides: L.overrides || null } });
    K.touch();
    K.run({ hot: true, layer: L.id }); // objects the code doesn't move every frame go back to where it puts them
    paintEditSel();
  }
  function resetPlacement(path) { const L = K.sel(); if (!L?.overrides) return; K.pushEditUndo(); const ov = { ...L.overrides }; delete ov[path]; setOverrides(L, ov); }
  function undoEdit() { const u = K.editUndo.pop(); const L = u && K.layerById(u.id); if (L) setOverrides(L, JSON.parse(u.ov)); }
  function bakePlacements() {
    const L = K.sel();
    const lines = Object.entries(L.overrides || {}).map(([path, o]) => (path === '@camera'
      ? `- the camera: position [${o.p.join(', ')}], quaternion [${o.q.join(', ')}], fov ${Math.round(o.fov)}`
      : `- ${o.name || path} (${path.startsWith('#') ? `named "${path.slice(1)}"` : `scene child path ${path}`}): ${o.p ? `position [${o.p.join(', ')}], ` : ''}${o.rd ? `rotation [${o.rd.join(', ')}] degrees, ` : ''}${o.s ? `scale [${o.s.join(', ')}]` : ''}${o.v === false ? ', hidden' : ''}`));
    K.askDirector(`In the layer "${L.name}" I placed things with the scene editor. Write these placements into the code so they start there (use three_edit_code, keep everything else as it is):\n${lines.join('\n')}\nWhen it's done, tell me, and I'll clear the placements in the editor.`, { send: false });
  }
  function onEditMessage(msg) {
    if (msg.type === 'edit-select') { K.editSel = msg.info; paintEditSel(); }
    if (msg.type === 'edit-change') {
      const L = K.layerById(msg.layer);
      if (!L) return;
      if (msg.final && JSON.stringify(L.overrides || null) !== JSON.stringify(msg.overrides)) { K.editUndo.push({ id: L.id, ov: JSON.stringify(L.overrides || null) }); }
      L.overrides = msg.overrides;
      K.editSel = msg.info || K.editSel;
      if (msg.final) K.touch();
      paintEditSel();
    }
    if (msg.type === 'edit-mode') { if (msg.mode) K.paintMode(msg.mode); if (msg.space) K.spaceBtn.textContent = msg.space === 'world' ? 'World' : 'Local'; }
    if (msg.type === 'edit-tree') {
      const r = K.outlinerBtn.getBoundingClientRect();
      const ov = K.sel()?.overrides || {};
      K.popup(r.left, r.bottom + 4, ['Objects in the scene', ...msg.tree.slice(0, 200).map((n) => [`${'  '.repeat(n.depth)}${n.name || n.type}${ov[n.path] ? ' ●' : ''}${n.v ? '' : ' (hidden)'}`, n.name ? n.type : '', () => K.box.send({ type: 'edit', cmd: 'select', path: n.path }), K.editSel?.path === n.path])]);
    }
  }
  return { setEdit, paintEditSel, onEditMessage };
};
