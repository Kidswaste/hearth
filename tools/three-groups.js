// 📁 Layer groups (round 44, layergroups): folders in the Lab's Layers list for scenes with many layers, 0 tokens.
// The data and its rules are tools/three-groups-core.js (LayerGroups); this is the Lab side:
//   · the Layers list (tools/three-layers.js draws the rows): Ctrl/⌘ or Shift+click picks layers, Ctrl/⌘+G groups them,
//     Ctrl/⌘+Shift+G ungroups, Ctrl/⌘+Z takes back the last group / solo change (those keys only while you work in the
//     Layers list: Ctrl+G elsewhere is still "agents side by side"); a group's ▾ folds it, its eye hides / shows it all,
//     S or Alt+click an eye shows only that layer / group (solo, saved with the scene: renders show the same); drag a
//     layer onto a group (or out), drag a group's header to move it all
//   · right-click a group's header: show / hide, solo, rename, fold, ungroup, ◫ make it a precomp; a layer's right-click
//     has 📁 Group layers › (tools/three-easy.js asks layerItems); a precomp layer: 📁 Back to a group
//   · precomps (tools/three-comp.js) are the Lab's "layer made of layers": a group can become one (its layers move to a
//     scene of their own, shown here as one ◫ layer) and a precomp of a scene can come back as a group of its layers
//   · /group (the internal command), Find anything (Ctrl/⌘+K) and 🔎 Lab search rows, the keys sheet, 📜 recipes record
//     group / ungroup / hide / show / solo as steps and replay them by name
const LabGroups = (() => {
  const C = () => LayerGroups;
  const host = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.groupsHost : null);
  const stack = []; // undo: { label, sketch, before, after } (fields) | { label, sketch, full: layers, made: sketch id } (precomps)
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const norm = (s) => String(s ?? '').toLowerCase().replace(/^[◫📁]\s*/u, '').replace(/\s+/g, ' ').trim();
  const err = (m) => toast(m, { type: 'error', timeout: 4000 });
  const H0 = () => { const h = host(); if (!h?.sketchId()) { err('Open a scene in the Lab first'); return null; } return h; };
  const layerOf = (id) => host()?.layers().find((L) => L.id === id) || null;
  const groupName = (id) => C().find(host()?.layers() || [], id)?.name || 'the group';

  // one change to the layers: fn(layers) → a new order, true (changed in place) or null / false (nothing). Shown in
  // place, saved, one undo step (the toast's Undo, Ctrl/⌘+Z in the Layers list, /group undo); rec: a 📜 recipe step
  function op(label, fn, { rec = null, say = undefined } = {}) {
    const h = H0();
    if (!h) return false;
    const Ls = h.layers();
    const before = C().state(Ls);
    const r = fn(Ls);
    if (!r) return false;
    const next = Array.isArray(r) ? r : Ls;
    const after = C().state(next);
    if (same(before, after)) return false;
    h.commit(next);
    stack.push({ label, sketch: h.sketchId(), before, after });
    if (stack.length > 40) stack.shift();
    if (rec) window.LabRecipesHook?.note?.('groups', rec);
    if (say !== false) toast(say || label, { timeout: 2600, action: { label: 'Undo', fn: () => undo() } });
    return true;
  }
  function undo() {
    const h = H0();
    const u = stack[stack.length - 1];
    if (!h || !u) { if (h) toast('No group change to undo', { timeout: 1500 }); return false; }
    if (u.sketch !== h.sketchId()) { toast('The last group change was on another scene', { timeout: 2200 }); return false; }
    stack.pop();
    if (u.full) {
      const S = ThreeLab.scenes; const sk = S.get(u.sketch);
      if (!sk) return false;
      sk.layers = JSON.parse(JSON.stringify(u.full));
      S.changed(u.sketch);
      if (u.made && S.get(u.made)) S.remove(u.made); // the scene the precomp showed (to History's deleted sketches)
    } else h.commit(C().undo(h.layers(), u.before, u.after));
    toast(`Undid: ${u.label}`, { timeout: 1800 });
    return true;
  }

  // ---------- the operations ----------
  const pickedIds = () => { const h = host(); const p = h?.picked() || []; return p.length ? p : h?.selected() ? [h.selected()] : []; };
  function groupPicked({ name = null, ids = null } = {}) {
    const want = ids || pickedIds();
    const h = H0();
    if (!h) return false;
    const names = h.layers().filter((L) => want.includes(L.id)).map((L) => L.name);
    let made = null;
    const done = op(`📁 Grouped ${names.length === 1 ? `"${names[0]}"` : `${names.length} layers`}`, (Ls) => { const r = C().group(Ls, want, { name }); made = r?.id; return r?.layers; },
      { rec: { op: 'group', name: name || null, layers: names } });
    if (done) host()?.clearPicks?.();
    if (!done && want.length) toast('Those layers are a group already', { timeout: 1600 });
    return done ? made : null;
  }
  const groupOfSel = () => { const h = host(); const p = h?.picked() || []; const L = layerOf(h?.selected()); const fromPick = p.map(layerOf).find((x) => x?.group); return (fromPick || L)?.group?.id || null; };
  function ungroup(id = groupOfSel()) {
    if (!id) { toast('The selected layer isn\'t in a group', { timeout: 1600 }); return false; }
    const n = groupName(id);
    return op(`Ungrouped "${n}"`, (Ls) => C().ungroup(Ls, id), { rec: { op: 'ungroup', name: n } });
  }
  function toggle(id) {
    const off = C().vis(host()?.layers() || [], id) !== 'off';
    const n = groupName(id);
    return op(off ? `◌ "${n}" hidden` : `👁 "${n}" shows`, (Ls) => C().setVisible(Ls, id, !off), { rec: { op: off ? 'hide' : 'show', name: n }, say: false });
  }
  function setVisible(id, on) { const n = groupName(id); return op(on ? `👁 "${n}" shows` : `◌ "${n}" hidden`, (Ls) => C().setVisible(Ls, id, on), { rec: { op: on ? 'show' : 'hide', name: n }, say: false }); }
  function fold(id, closed) { return op('Folded', (Ls) => (C().members(Ls, id).length ? (C().fold(Ls, id, closed), true) : null), { say: false }); }
  async function rename(id, to = null) {
    const was = groupName(id);
    const v = to ?? await Modal.prompt('Rename group', { value: was });
    if (!v?.trim()) return false;
    return op(`Renamed "${was}" to "${v.trim()}"`, (Ls) => C().rename(Ls, id, v), { rec: { op: 'rename', name: was, to: C().cleanName(v) }, say: false });
  }
  // a layer or a group alone (again / null: every layer)
  function solo(target) {
    const h = H0();
    if (!h) return false;
    const Ls = h.layers();
    const was = C().soloId(Ls);
    const off = !target || target === was;
    const isG = !off && C().members(Ls, target).length > 0;
    const name = off ? '' : isG ? groupName(target) : layerOf(target)?.name || '';
    if (!off && !name) return false;
    return op(off ? 'Every layer shows again' : `Only "${name}" shows`, (Ls2) => { C().solo(Ls2, off ? null : target); return true; },
      { rec: off ? { op: 'unsolo' } : { op: 'solo', target: name, kind: isG ? 'group' : 'layer' },
        say: off ? 'Every layer shows again' : `Only ${isG ? `the group "${name}"` : `"${name}"`} shows (renders too) · S, Alt+click its eye or the same again shows every layer` });
  }
  // drag and drop in the Layers list (tools/three-layers.js): always handled here once this is loaded
  function drop(drag, target) {
    const before = host()?.layers().map((L) => `${L.id}:${L.group?.id || ''}`).join();
    op(drag.group ? `Moved "${groupName(drag.group)}"` : 'Moved', (Ls) => C().move(Ls, drag, target), { say: false });
    return before != null;
  }
  function takeOut(id) { const L = layerOf(id); if (!L?.group) return false; return op(`"${L.name}" out of "${L.group.name}"`, (Ls) => C().takeOut(Ls, id)); }
  function moveInto(id, gid) { return op(`Into "${groupName(gid)}"`, (Ls) => C().move(Ls, { layer: id }, { group: gid })); }
  function gather(id) { return op(`"${groupName(id)}" in one piece`, (Ls) => C().gather(Ls, id)); }

  // ---------- precomps (tools/three-comp.js): a group becomes one, and back ----------
  async function toPrecomp(id) {
    const h = H0();
    if (!h || typeof ThreeComp === 'undefined') return false;
    const S = ThreeLab.scenes; const sid = h.sketchId();
    h.persist?.(); // the code in the editor is in its layer
    const Ls = h.layers();
    const m = C().members(Ls, id);
    if (!m.length) return false;
    const name = m[0].group.name;
    const loose = m.filter((L) => { try { return (ThreeLab.stageHooks?.ctlOf?.(L.id)?.unsaved?.() || []).length; } catch { return false; } });
    if (loose.length && !(await Modal.confirm('Sliders not saved yet', `${loose.map((L) => `"${L.name}"`).join(', ')} ${loose.length === 1 ? 'has' : 'have'} sliders moved but not saved into the code; a precomp shows the saved values. Save them first (💾 or Ctrl/⌘+S on the layer), or go on anyway.`, { ok: 'Go on' }))) return false;
    const full = JSON.parse(JSON.stringify(Ls));
    // inside, each layer as its own eye has it (what the group's eye or a solo did stays on the ◫ layer here)
    const copies = JSON.parse(JSON.stringify(m)).map((L) => { const own = (L.visible === false && !L.hid) || L.soloShown === true; L.visible = !own; delete L.group; delete L.hid; delete L.solo; delete L.soloShown; return L; });
    const sk = S.create({ name: `${name} (from ${h.sketchName() || 'a scene'})`, code: copies[0].code, layers: copies, frame: S.frameOf(sid) });
    const pc = ThreeComp.makeLayer({ sketch: sk.id }, { name });
    pc.slot = Math.max(-1, ...Ls.map((L) => L.slot ?? 0)) + 1;
    pc.fromGroup = true;
    if (m.every((L) => L.visible === false)) { pc.visible = false; if (m.every((L) => L.hid === 'solo')) pc.hid = 'solo'; }
    if (m.some((L) => L.solo)) pc.solo = pc.id;
    const top = Ls.indexOf(m[m.length - 1]);
    const rest = Ls.filter((L) => !m.includes(L));
    const below = Ls.slice(0, top).filter((L) => !m.includes(L)).length;
    S.get(sid).layers = [...rest.slice(0, below), pc, ...rest.slice(below)];
    S.changed(sid);
    h.select?.(pc.id);
    stack.push({ label: `"${name}" made a precomp`, sketch: sid, full, made: sk.id });
    toast(`◫ "${name}" is a precomp now: its ${m.length} layer${m.length === 1 ? '' : 's'} live in the scene "${sk.name}"`, { timeout: 5000, action: { label: 'Undo', fn: () => undo() } });
    return pc;
  }
  async function fromPrecomp(layerId) {
    const h = H0();
    if (!h || typeof ThreeComp === 'undefined') return false;
    const S = ThreeLab.scenes; const sid = h.sketchId();
    const Ls = h.layers();
    const P = Ls.find((L) => L.id === layerId);
    if (!P || !ThreeComp.isComp(P)) return false;
    const src = ThreeComp.source(P.precomp.src);
    const sk = src.sketchId && S.get(src.sketchId);
    if (!sk) { err(src.kind === 'seq' ? 'A sequence can\'t become a group (only a scene can)' : 'Its scene is gone'); return false; }
    const c = P.precomp;
    const changed = [c.start, c.offset].some(Boolean) || (c.speed ?? 1) !== 1 || c.crop || (c.mask && c.mask !== 'none') || c.feather || Object.keys(c.fx || {}).length || Object.keys(P.keys || {}).length || (P.opacity ?? 1) !== 1 || P.x || P.y || (P.scale ?? 1) !== 1 || P.rotate;
    if (changed && !(await Modal.confirm('Back to a group?', `Its layers come into this scene as a group. What only a precomp has (its own time, crop, mask, effects, place, opacity, keys) doesn't come with them.`, { ok: 'Make it a group' }))) return false;
    h.persist?.();
    const full = JSON.parse(JSON.stringify(Ls));
    const gid = C().gid();
    let slot = Math.max(-1, ...Ls.map((L) => L.slot ?? 0));
    const gname = C().cleanName(P.name.replace(/^◫\s*/, ''));
    const copies = JSON.parse(JSON.stringify(S.layersOf(sk))).map((L) => {
      slot += 1;
      const x = { ...L, id: ThreeLayers.newId(), slot, group: { id: gid, name: gname } };
      delete x.solo; delete x.soloShown; delete x.hid;
      if (P.visible === false && x.visible !== false) { x.visible = false; x.hid = 'group'; }
      if (P.in != null && x.in == null) x.in = P.in;
      if (P.out != null && x.out == null) x.out = P.out;
      return x;
    });
    const at = Ls.indexOf(P);
    S.get(sid).layers = [...Ls.slice(0, at), ...copies, ...Ls.slice(at + 1)];
    S.changed(sid);
    stack.push({ label: `"${gname}" back to a group`, sketch: sid, full });
    toast(`📁 "${gname}": its ${copies.length} layer${copies.length === 1 ? '' : 's'} are a group here now (the scene "${sk.name}" stays as it is)`, { timeout: 5000, action: { label: 'Undo', fn: () => undo() } });
    return gid;
  }

  // ---------- menus ----------
  // a group's header right-click (showMenu items)
  function groupItems(id) {
    const Ls = host()?.layers() || [];
    const g = C().find(Ls, id);
    if (!g) return [];
    const v = C().vis(Ls, id);
    const soloOn = C().soloId(Ls) === id;
    const split = C().rows(Ls).filter((r) => r.kind === 'group' && r.g.id === id).length > 1;
    return [
      `📁 ${g.name}`,
      { label: v === 'off' ? '👁 Show the group' : '◌ Hide the group', hint: `${g.ids.length} layer${g.ids.length === 1 ? '' : 's'}`, action: () => toggle(id) },
      { label: soloOn ? 'Show every layer' : 'Only this group (solo)', hint: 'Alt+click its eye · S', action: () => solo(id) },
      { label: 'Rename…', hint: 'or double-click its name', action: () => rename(id) },
      { label: g.closed ? '▾ Unfold' : '▸ Fold', action: () => fold(id) },
      split ? { label: 'Bring its layers together', hint: 'a layer sits between them', action: () => gather(id) } : null,
      '-',
      { label: 'Ungroup', hint: 'Ctrl/⌘+Shift+G · the layers stay', action: () => ungroup(id) },
      typeof ThreeComp !== 'undefined' ? { label: '◫ Make it a precomp', hint: 'one layer here, its layers in a scene of their own', action: () => toPrecomp(id).catch((e) => err(e.message)) } : null,
    ].filter(Boolean);
  }
  function groupMenu(x, y, id) { showMenu(x, y, groupItems(id)); }
  // rows for a layer's right-click (LabEasy.layerItems), as object items
  function layerItems(L) {
    const h = host();
    if (!h || !L) return [];
    const Ls = h.layers();
    const out = [];
    if (typeof ThreeComp !== 'undefined' && ThreeComp.isComp(L)) {
      const src = ThreeComp.source(L.precomp?.src);
      if (src.sketchId) out.push({ label: '📁 Back to a group', hint: 'its layers here, as a group', action: () => fromPrecomp(L.id).catch((e) => err(e.message)) });
    }
    const picked = h.picked().filter((id) => id !== L.id);
    const gs = C().groups(Ls).filter((g) => g.id !== L.group?.id).slice(-8).reverse();
    const items = [
      { label: picked.length ? `Group the ${picked.length + 1} picked layers` : 'Group layers (a new group with this one)', hint: 'Ctrl/⌘+G · Ctrl/⌘+click picks more', action: () => groupPicked({ ids: [L.id, ...picked] }) },
      ...gs.map((g) => ({ label: `Into "${g.name}"`, hint: 'or drag it onto the group', action: () => moveInto(L.id, g.id) })),
      L.group ? { label: `Take it out of "${L.group.name}"`, action: () => takeOut(L.id) } : null,
      L.group ? { label: `Ungroup "${L.group.name}"`, hint: 'Ctrl/⌘+Shift+G', action: () => ungroup(L.group.id) } : null,
      L.group ? { label: C().soloId(Ls) === L.group.id ? 'Show every layer' : `Only "${L.group.name}" (solo the group)`, action: () => solo(L.group.id) } : null,
      L.group && typeof ThreeComp !== 'undefined' ? { label: `◫ Make "${L.group.name}" a precomp`, action: () => toPrecomp(L.group.id).catch((e) => err(e.message)) } : null,
    ].filter(Boolean);
    out.push({ label: '📁 Group layers', hint: L.group ? `in "${L.group.name}"` : 'folders for many layers', items });
    if (C().soloId(Ls) && C().soloId(Ls) !== L.id) out.push({ label: 'Show every layer', hint: 'solo off', action: () => solo(null) });
    return out;
  }

  // ---------- 📜 recipes: a recorded step replayed by name on the scene on screen → null (done) or why it didn't fit ----------
  function replay(s) {
    const h = host();
    if (!h?.sketchId()) return 'no scene';
    const Ls = h.layers();
    const byName = (n) => Ls.find((L) => norm(L.name) === norm(n)) || null;
    const grp = (n) => C().byName(Ls, n);
    const quiet = { say: false };
    switch (s.op) {
      case 'group': {
        const ids = (s.layers || []).map(byName).filter(Boolean).map((L) => L.id);
        if (!ids.length) return `no layer like ${(s.layers || []).map((n) => `"${n}"`).join(', ')} here`;
        return op('📁 Grouped (recipe)', (L2) => C().group(L2, ids, { name: s.name || null })?.layers, quiet) ? null : 'those layers are a group already';
      }
      case 'ungroup': { const g = grp(s.name); return g ? (op('Ungrouped (recipe)', (L2) => C().ungroup(L2, g.id), quiet), null) : `no group "${s.name}" here`; }
      case 'hide': case 'show': { const g = grp(s.name); return g ? (op('Group shown / hidden (recipe)', (L2) => C().setVisible(L2, g.id, s.op === 'show'), quiet), null) : `no group "${s.name}" here`; }
      case 'rename': { const g = grp(s.name); return g ? (op('Group renamed (recipe)', (L2) => C().rename(L2, g.id, s.to), quiet), null) : `no group "${s.name}" here`; }
      case 'solo': {
        const t = (s.kind !== 'layer' && grp(s.target)?.id) || byName(s.target)?.id || grp(s.target)?.id;
        if (!t) return `no layer or group "${s.target}" here`;
        op('Solo (recipe)', (L2) => { C().unsolo(L2); C().solo(L2, t); return true; }, quiet);
        return null;
      }
      case 'unsolo': op('Solo off (recipe)', (L2) => C().unsolo(L2), quiet); return null;
      default: return 'an unknown group step';
    }
  }

  // ---------- keys: only while you work in the Layers list ----------
  let armed = false;
  const inPanel = (n) => { const p = host()?.panel; return Boolean(p && n && p.contains(n)); };
  addEventListener('pointerdown', (e) => { armed = inPanel(e.target); }, true);
  addEventListener('keydown', (e) => {
    if (!armed || !(e.ctrlKey || e.metaKey) || e.altKey || e.defaultPrevented) return;
    const k = e.key.toLowerCase();
    if (k !== 'g' && k !== 'z') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return;
    const h = host();
    if (!h?.panel?.checkVisibility?.({ visibilityProperty: true })) { armed = false; return; }
    if (k === 'z' && (e.shiftKey || !stack.length || stack[stack.length - 1].sketch !== h.sketchId())) return; // the Lab's / the app's own undo
    e.preventDefault(); e.stopPropagation();
    if (k === 'z') undo(); else if (e.shiftKey) ungroup(); else groupPicked();
    window.Usage?.key?.(`Ctrl+${e.shiftKey ? 'Shift+' : ''}${k.toUpperCase()}`, 'Lab layers');
  }, true);

  // ---------- the ways in: commands, Find anything, the keys sheet, a tip ----------
  async function lab() { await ThreeLab.cmd({ show: true }); return H0(); }
  const findGroup = (q) => { const Ls = host()?.layers() || []; return C().byName(Ls, q) || C().groups(Ls).find((g) => norm(g.name).startsWith(norm(q))) || null; };
  const findLayer = (q) => { const Ls = host()?.layers() || []; return Ls.find((L) => norm(L.name) === norm(q)) || Ls.find((L) => norm(L.name).startsWith(norm(q))) || null; };
  const VERBS = ['list', 'ungroup', 'hide', 'show', 'solo', 'all', 'rename', 'fold', 'unfold', 'precomp', 'unpack', 'undo'];
  async function command(args) {
    const a = String(args || '').trim();
    const [v0, ...more] = a.split(/\s+/);
    const v = (v0 || 'list').toLowerCase();
    const rest = more.join(' ').trim();
    if (!(await lab())) return 'Open a scene in the Lab first.';
    const needG = () => { const g = rest ? findGroup(rest) : C().find(host().layers(), groupOfSel()); if (!g) throw new Error(rest ? `No group called "${rest}" (/group list)` : 'Name a group (/group list)'); return g; };
    if (v === 'list') return C().describe(host().layers());
    if (v === 'undo') return undo() ? 'Undone.' : 'Nothing to undo.';
    if (v === 'all') { if (!C().soloId(host().layers())) return 'Every layer shows already.'; solo(null); return 'Every layer shows again.'; }
    if (v === 'solo') { const g = rest ? findGroup(rest) : null; const L = !g && rest ? findLayer(rest) : null; const t = g?.id || L?.id || (!rest && groupOfSel()); if (!t) return `No layer or group "${rest}"`; solo(t); return C().soloId(host().layers()) ? `Only "${g?.name || L?.name || groupName(t)}" shows.` : 'Every layer shows again.'; }
    if (v === 'ungroup') { const g = needG(); ungroup(g.id); return `Ungrouped "${g.name}".`; }
    if (v === 'hide' || v === 'show') { const g = needG(); setVisible(g.id, v === 'show'); return `"${g.name}" ${v === 'show' ? 'shows' : 'hidden'}.`; }
    if (v === 'fold' || v === 'unfold') { const g = needG(); fold(g.id, v === 'fold'); return `"${g.name}" ${v}ed.`; }
    if (v === 'rename') { const m = /^(.+?)\s+to\s+(.+)$/i.exec(rest); if (!m) return 'Try: /group rename <group> to <new name>'; const g = findGroup(m[1]); if (!g) return `No group "${m[1]}"`; await rename(g.id, m[2]); return `Renamed to "${C().cleanName(m[2])}".`; }
    if (v === 'precomp') { const g = needG(); const pc = await toPrecomp(g.id); return pc ? `"${g.name}" is a precomp now.` : 'Not changed.'; }
    if (v === 'unpack') { const P = rest ? findLayer(rest) : layerOf(host().selected()); if (!P || typeof ThreeComp === 'undefined' || !ThreeComp.isComp(P)) return 'Name a precomp layer (◫ …)'; const id = await fromPrecomp(P.id); return id ? 'Its layers are a group here now.' : 'Not changed.'; }
    // /group <layer>, <layer>… [as <name>]  (no names: the picked / selected layers)
    const m = /^(.*?)(?:\s+as\s+(.+))?$/i.exec(a);
    const names = (m[1] || '').split(/\s*,\s*/).filter(Boolean);
    const ids = names.length ? names.map(findLayer).filter(Boolean).map((L) => L.id) : pickedIds();
    if (names.length && ids.length < names.length) return `No layer called ${names.filter((n) => !findLayer(n)).map((n) => `"${n}"`).join(', ')}`;
    const gid = groupPicked({ ids, name: m[2] || null });
    return gid ? `📁 Grouped as "${groupName(gid)}".` : 'Nothing grouped.';
  }
  function register() {
    try {
      const inLab = () => H.activeId === 'tool:three';
      Keys.add(
        { area: 'Lab sliders & layers', keys: 'Ctrl+click / Shift+click (a layer)', what: 'Pick several layers (then Ctrl/⌘+G groups them)', when: inLab, sel: '.ly-row' },
        { area: 'Lab sliders & layers', keys: 'Ctrl+G (in the Layers list)', what: 'Group the picked layers (right-click a layer › 📁 Group layers does it too)', when: inLab },
        { area: 'Lab sliders & layers', keys: 'Ctrl+Shift+G (in the Layers list)', what: 'Ungroup the selected layer\'s group', when: inLab },
        { area: 'Lab sliders & layers', keys: 'Ctrl+Z (in the Layers list)', what: 'Undo the last group / solo change', when: inLab },
      );
    } catch { /* keys list optional */ }
    if (typeof AppUI !== 'undefined' && AppUI.addAction) {
      const go = (fn) => async () => { if (await lab()) fn(); };
      AppUI.addAction('Lab: Group layers (the picked ones · Ctrl/⌘+G in the Layers list)', go(() => groupPicked()));
      AppUI.addAction('Lab: Ungroup layers (Ctrl/⌘+Shift+G in the Layers list)', go(() => ungroup()));
      AppUI.addAction('Lab: Solo: show only the selected layer (again: all)', go(() => { const h = host(); solo(h.selected()); }));
      AppUI.addAction('Lab: Show every layer (solo off)', go(() => solo(null)));
      AppUI.addAction('Lab: Hide / show the selected layer\'s group', go(() => { const g = groupOfSel(); if (g) toggle(g); else toast('The selected layer isn\'t in a group', { timeout: 1600 }); }));
    }
    if (typeof Commands === 'undefined' || Commands.get?.('group')) return;
    Commands.register({
      name: 'group', area: 'Three.js Lab', args: '[<layer>, <layer>… [as <name>] | list | ungroup | hide | show | solo | all | rename <g> to <name> | fold | precomp | unpack | undo] [group]',
      desc: 'Layer groups in the Lab (no tokens): group layers into a folder, hide / show a group, solo a layer or a group (renders too), ungroup, make a group a precomp and back',
      keywords: 'group groups folder folders ungroup solo only hide show layers many precomp',
      examples: ['/group Stars, Glow as Background', '/group hide Background', '/group solo Background', '/group all', '/group list'],
      complete: (x) => { const t = String(x || '').trim().toLowerCase(); const gs = C().groups(host()?.layers() || []).map((g) => g.name); return [...VERBS, ...gs].filter((w) => w.toLowerCase().startsWith(t.split(/\s+/).pop() || '')).slice(0, 20).map((value) => ({ value })); },
      run: (args) => command(args).catch((e) => `${e.message}`),
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();
  // a discovery tip, once: a scene with many layers and no group yet
  addEventListener('hearth:sketch', () => setTimeout(() => {
    const Ls = host()?.layers() || [];
    if (Ls.length < 6 || C().groups(Ls).length || typeof Hints === 'undefined') return;
    Hints.offer({ id: 'layergroups-discover', place: 'lab', rank: 3, show: () => toast('📁 Many layers? Ctrl/⌘+click a few in the Layers list, then Ctrl/⌘+G puts them in a group with its own eye (S shows only it).', { timeout: 9000 }) });
  }, 3000));

  return { op, undo, groupPicked, ungroup, toggle, setVisible, fold, rename, solo, drop, takeOut, moveInto, gather, toPrecomp, fromPrecomp, groupItems, groupMenu, layerItems, replay, command, stack: () => stack.map((u) => u.label) };
})();
