// Layer groups (round 44, layergroups): folders in the Lab's Layers list, a group's eye, solo, all as data on the
// layers themselves, so every place that copies or draws a scene's layers (the preview, stills, renders / exports, the
// sequence, variations, before / after, templates, recipes, packs, the time machine, backstage scenes) follows without
// knowing about groups. Pure, no DOM; Node-tested (dev/layergroups-test.js).
//   L.group = { id, name, closed? }      the folder a layer is in (one level, like Photoshop's groups without nesting)
//   L.visible === false                  not drawn (what every renderer already reads: groups never add a second rule)
//   L.hid = 'group' | 'solo'             why it is hidden when it wasn't its own eye (a group's eye / a solo hid it), so
//                                        showing the group / ending the solo brings back exactly those
//   L.solo = target id                   the layer (or every member of the group) shown alone; L.soloShown: it was
//                                        hidden before the solo showed it (hidden again when the solo ends)
// Draw order is the array order (bottom first). Nothing here reorders on its own: a layer added between two members
// splits the group into two runs (two headers with one name) rather than moving anything in the picture.
const LayerGroups = (() => {
  const MAX_NAME = 60;
  let seq = 0;
  const gid = () => `g${Date.now().toString(36)}${(seq++ % 1296).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const gOf = (L) => (L?.group && typeof L.group.id === 'string' ? L.group.id : null);
  const shown = (L) => L.visible !== false;
  const cleanName = (s, fb = 'Group') => String(s ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || fb;

  // ---------- reading ----------
  // every group once, bottom first (by its lowest member): { id, name, closed, ids (bottom first), at, top }
  function groups(layers) {
    const out = new Map();
    (layers || []).forEach((L, i) => {
      const id = gOf(L);
      if (!id) return;
      let g = out.get(id);
      if (!g) { g = { id, name: cleanName(L.group.name), closed: Boolean(L.group.closed), ids: [], at: i, top: i }; out.set(id, g); }
      g.ids.push(L.id);
      g.top = i;
    });
    return [...out.values()];
  }
  const find = (layers, id) => groups(layers).find((g) => g.id === id) || null;
  const members = (layers, id) => (layers || []).filter((L) => gOf(L) === id);
  const byName = (layers, name) => { const n = cleanName(name, '').toLowerCase(); return groups(layers).find((g) => g.name.toLowerCase() === n) || null; };
  // a group's eye: 'on' (all members show), 'off' (none), 'some'
  function vis(layers, id) {
    const m = members(layers, id);
    const n = m.filter(shown).length;
    return !m.length || n === m.length ? 'on' : n ? 'some' : 'off';
  }
  // the Layers list, top first: a header row above each run of a group's members, then the members (folded: hidden)
  // → [{ kind: 'group', g, n, vis, solo } | { kind: 'layer', L, gid, folded, last }]
  function rows(layers) {
    const Ls = [...(layers || [])].reverse();
    const all = new Map(groups(layers).map((g) => [g.id, g]));
    const sid = soloId(layers);
    const out = [];
    let run = null;
    Ls.forEach((L, i) => {
      const id = gOf(L);
      if (id && id !== run) {
        const g = all.get(id);
        out.push({ kind: 'group', g, n: g.ids.length, vis: vis(layers, id), solo: sid === id });
      }
      run = id;
      out.push({ kind: 'layer', L, gid: id, folded: Boolean(id && all.get(id)?.closed), last: Boolean(id && gOf(Ls[i + 1]) !== id) });
    });
    return out;
  }
  // what is drawn, in draw order (bottom first): the ids every renderer ends up with
  const drawn = (layers) => (layers || []).filter(shown).map((L) => L.id);
  const nextName = (layers) => { const names = new Set(groups(layers).map((g) => g.name.toLowerCase())); let i = 1; while (names.has(`group ${i}`)) i += 1; return `Group ${i}`; };

  // ---------- grouping ----------
  // ids: the layers to put in one new group (any order). They gather where the topmost of them was (Photoshop's way:
  // the others move up to it), keeping their order. Taken out of the groups they were in. → { layers, id } | null
  function group(layers, ids, { name = null, id = null } = {}) {
    const want = new Set(ids || []);
    const picks = layers.filter((L) => want.has(L.id));
    if (!picks.length) return null;
    const g0 = gOf(picks[0]);
    if (g0 && picks.every((L) => gOf(L) === g0) && members(layers, g0).length === picks.length && !name) return null; // already exactly a group
    const top = Math.max(...picks.map((L) => layers.indexOf(L)));
    const rest = layers.filter((L) => !want.has(L.id));
    const below = layers.slice(0, top).filter((L) => !want.has(L.id)).length;
    const g = { id: id || gid(), name: cleanName(name || nextName(layers)) };
    for (const L of picks) {
      if (L.hid === 'group') { L.visible = true; delete L.hid; } // a hidden group's member joins a shown one: it shows
      L.group = { ...g };
    }
    return { layers: [...rest.slice(0, below), ...picks, ...rest.slice(below)], id: g.id };
  }
  // the group's layers stay where they are, out of any group (a member its eye hid stays hidden, as its own choice)
  function ungroup(layers, id) {
    const m = members(layers, id);
    if (!m.length) return false;
    for (const L of m) { delete L.group; if (L.hid === 'group') delete L.hid; }
    return true;
  }
  function rename(layers, id, name) {
    const m = members(layers, id);
    const n = cleanName(name, '');
    if (!m.length || !n) return false;
    for (const L of m) L.group = { ...L.group, name: n };
    return true;
  }
  function fold(layers, id, closed) {
    const m = members(layers, id);
    if (!m.length) return false;
    const c = closed ?? !m[0].group.closed;
    for (const L of m) { L.group = { ...L.group }; if (c) L.group.closed = true; else delete L.group.closed; }
    return c;
  }

  // ---------- visibility ----------
  // a group's eye: hide hides the members that show (marked, so show brings back exactly those); show brings them back
  // (none marked: every member shows)
  function setVisible(layers, id, on) {
    const m = members(layers, id);
    if (!m.length) return false;
    if (!on) { for (const L of m) if (shown(L)) { L.visible = false; L.hid = 'group'; } return true; }
    const marked = m.filter((L) => !shown(L) && L.hid === 'group');
    for (const L of marked.length ? marked : m) { L.visible = true; delete L.hid; }
    return true;
  }
  const toggle = (layers, id) => setVisible(layers, id, vis(layers, id) === 'off');
  // the layer's own eye was used: whatever a group / solo did to it is its own choice now
  function manual(L) { if (!L) return; delete L.hid; delete L.soloShown; }

  // ---------- solo ----------
  const soloId = (layers) => (layers || []).find((L) => typeof L.solo === 'string')?.solo || null;
  // only `target` (a layer id or a group id) shows; the same target again (or null) ends the solo. → the target or null
  function solo(layers, target) {
    const was = soloId(layers);
    unsolo(layers);
    if (!target || target === was) return null;
    const isGroup = members(layers, target).length > 0;
    const pick = isGroup ? members(layers, target) : layers.filter((L) => L.id === target);
    if (!pick.length) return null;
    const ids = new Set(pick.map((L) => L.id));
    for (const L of layers) if (!ids.has(L.id) && shown(L)) { L.visible = false; L.hid = 'solo'; }
    // the target shows: a layer even when its eye was off; a group's members its own eye hid stay hidden unless all are
    const own = pick.filter((L) => !shown(L) && L.hid !== 'group');
    const showAll = !isGroup || own.length === pick.length;
    for (const L of pick) {
      L.solo = target;
      if (!shown(L) && (showAll || L.hid === 'group')) { L.visible = true; L.soloShown = L.hid || true; delete L.hid; }
    }
    return target;
  }
  function unsolo(layers) {
    let any = false;
    for (const L of layers || []) {
      if (L.hid === 'solo' && !shown(L)) { L.visible = true; delete L.hid; any = true; }
      if (L.solo != null) {
        if (L.soloShown) { L.visible = false; if (L.soloShown === 'group') L.hid = 'group'; }
        delete L.solo; delete L.soloShown; any = true;
      }
    }
    return any;
  }

  // ---------- moving (drag and drop in the list) ----------
  // a block: a group's members (when dragging its header) or one layer
  const blockOf = (layers, drag) => (drag.group ? members(layers, drag.group) : layers.filter((L) => L.id === drag.layer));
  // drag { layer | group } dropped on { layer | group | end } → the new order (bottom first) or null. Old rule kept: a
  // block dropped on a layer takes its place (above it when moving up the list). A layer joins the group of the layer it
  // lands on (or leaves its group on an ungrouped one); on a group's header it joins that group at its top; a group
  // never lands inside another group (it goes above / below that group's run). end: the very bottom, out of any group.
  function move(layers, drag, target) {
    const block = blockOf(layers, drag);
    if (!block.length) return null;
    const bset = new Set(block.map((L) => L.id));
    const rest = layers.filter((L) => !bset.has(L.id));
    const from = layers.indexOf(block[block.length - 1]);
    let at; let join = null;
    if (target.end) at = 0;
    else if (target.group) {
      if (drag.group === target.group) return null;
      const m = members(rest, target.group);
      if (!m.length) return null;
      at = rest.indexOf(m[m.length - 1]) + 1; // just above its top member (the header sits there)
      if (drag.layer) join = target.group;
      else { const b = rest.indexOf(m[0]); at = from < layers.indexOf(m[0]) ? at : b; } // a group on a group: above it when moving up
    } else {
      const T = rest.find((L) => L.id === target.layer);
      if (!T) return null;
      const to = layers.indexOf(T);
      at = rest.indexOf(T) + (from < to ? 1 : 0);
      if (drag.layer) join = gOf(T);
      else if (gOf(T)) { const m = members(rest, gOf(T)); at = from < to ? rest.indexOf(m[m.length - 1]) + 1 : rest.indexOf(m[0]); }
    }
    if (drag.layer) {
      const L = block[0];
      if (join) { if (gOf(L) !== join) L.group = { ...members(rest, join)[0].group }; }
      else if (gOf(L)) { delete L.group; if (L.hid === 'group') { L.visible = true; delete L.hid; } }
    }
    const next = [...rest.slice(0, at), ...block, ...rest.slice(at)];
    return next.map((L) => L.id).join() === layers.map((L) => L.id).join() && !drag.layer ? null : next;
  }
  // a layer out of its group: placed just above the group's run (nothing else moves)
  function takeOut(layers, id) {
    const L = layers.find((x) => x.id === id);
    const g = gOf(L);
    if (!g) return null;
    const m = members(layers, g);
    const rest = layers.filter((x) => x !== L);
    const top = m.filter((x) => x !== L).pop();
    delete L.group;
    if (L.hid === 'group') { L.visible = true; delete L.hid; }
    if (!top) return layers;
    const at = rest.indexOf(top) + 1;
    return [...rest.slice(0, at), L, ...rest.slice(at)];
  }
  // a group's members brought together where its topmost member is (after a split): the explicit "tidy" of a group
  const gather = (layers, id) => group(layers, members(layers, id).map((L) => L.id), { name: find(layers, id)?.name || null, id })?.layers || null;

  // ---------- undo: what a change did, taken back without undoing what came after ----------
  const FIELDS = ['group', 'visible', 'hid', 'solo', 'soloShown'];
  const val = (L, f) => (f === 'visible' ? L.visible !== false : L[f] ?? null);
  // the structural state of the layers: [{ id, group, visible, hid, solo, soloShown }] in draw order
  const state = (layers) => (layers || []).map((L) => Object.fromEntries([['id', L.id], ...FIELDS.map((f) => [f, val(L, f) && typeof val(L, f) === 'object' ? { ...val(L, f) } : val(L, f)])]));
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  // before / after: the states around one change; layers: as they are now (changed since, maybe). Each field still as the
  // change left it goes back; the order goes back when nothing reordered since. → the layers in their order
  function undo(layers, before, after) {
    const B = new Map((before || []).map((s) => [s.id, s]));
    const A = new Map((after || []).map((s) => [s.id, s]));
    for (const L of layers) {
      const b = B.get(L.id); const a = A.get(L.id);
      if (!b || !a) continue;
      for (const f of FIELDS) {
        if (!same(val(L, f), a[f])) continue;
        const v = b[f];
        if (f === 'visible') { L.visible = Boolean(v); continue; }
        if (v == null) delete L[f]; else L[f] = typeof v === 'object' ? { ...v } : v;
      }
    }
    const now = layers.map((L) => L.id).join();
    if (now !== (after || []).map((s) => s.id).join()) return layers;
    const at = new Map((before || []).map((s, i) => [s.id, i]));
    return [...layers].sort((x, y) => (at.get(x.id) ?? 1e9) - (at.get(y.id) ?? 1e9));
  }

  // ---------- saved data, checked (a scene from another computer, a pack, an older Hearth) ----------
  // → the number of fixes (a group without an id, a marker on a layer that shows, a solo left pointing nowhere…)
  function clean(layers) {
    let n = 0;
    const names = new Map();
    for (const L of layers || []) {
      if (L.group != null && (typeof L.group !== 'object' || typeof L.group.id !== 'string' || !L.group.id)) { delete L.group; n += 1; }
      if (L.group) {
        const nm = names.get(L.group.id) ?? cleanName(L.group.name);
        names.set(L.group.id, nm);
        if (L.group.name !== nm) { L.group = { ...L.group, name: nm }; n += 1; }
      }
      if (L.hid != null && (!['group', 'solo'].includes(L.hid) || shown(L))) { delete L.hid; n += 1; }
      if (L.solo != null && typeof L.solo !== 'string') { delete L.solo; delete L.soloShown; n += 1; }
    }
    return n;
  }

  // ---------- words (the commands, the director's summary) ----------
  function describe(layers) {
    const gs = groups(layers);
    const sid = soloId(layers);
    if (!gs.length) return sid ? `No groups. Solo: ${layers.find((L) => L.id === sid)?.name || sid}.` : 'No groups yet.';
    return gs.slice().reverse().map((g) => {
      const m = members(layers, g.id);
      const v = vis(layers, g.id);
      return `📁 ${g.name}${v === 'off' ? ' (hidden)' : v === 'some' ? ' (partly hidden)' : ''}${sid === g.id ? ' · solo' : ''}${g.closed ? ' · folded' : ''}: ${m.slice().reverse().map((L) => `${L.name}${shown(L) ? '' : ' (hidden)'}`).join(', ')}`;
    }).join('\n') + (sid && !gs.some((g) => g.id === sid) ? `\nSolo: ${layers.find((L) => L.id === sid)?.name || sid}` : '');
  }

  return { gid, gOf, groups, find, members, byName, vis, rows, drawn, nextName, group, ungroup, rename, fold, setVisible, toggle, manual, soloId, solo, unsolo, move, takeOut, gather, state, undo, clean, describe, cleanName, FIELDS };
})();
if (typeof module !== 'undefined') module.exports = LayerGroups;
