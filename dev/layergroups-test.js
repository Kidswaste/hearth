// Node tests for the Lab's layer groups (tools/three-groups-core.js): grouping gathers at the topmost pick and keeps
// order, the list's rows (headers, folded members, split runs), a group's eye (hide / show exactly what it hid), solo of
// a layer and of a group (and back, own eyes kept), drag and drop in and out of groups (draw order), take out, undo
// that leaves later changes alone, saved data cleaned.
//   node dev/layergroups-test.js
const assert = require('assert');
const G = require('../tools/three-groups-core.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.stack.split('\n').slice(0, 2).join(' ')}`); process.exitCode = 1; } };
const mk = (...ids) => ids.map((id) => ({ id, name: id.toUpperCase(), code: '', visible: true }));
const ids = (Ls) => Ls.map((L) => L.id).join('');
const shown = (Ls) => G.drawn(Ls).join('');

ok('group: picks gather where the topmost was, in their order; the rest keep theirs', () => {
  const Ls = mk('a', 'b', 'c', 'd', 'e'); // bottom first
  const r = G.group(Ls, ['d', 'b'], { name: 'Back' });
  assert.strictEqual(ids(r.layers), 'acbde');
  assert.deepStrictEqual(G.members(r.layers, r.id).map((L) => L.id), ['b', 'd']);
  assert.strictEqual(G.find(r.layers, r.id).name, 'Back');
  assert.strictEqual(G.group(r.layers, ['b', 'd']), null, 'already exactly that group');
  assert.strictEqual(G.nextName(r.layers), 'Group 1');
  const r2 = G.group(r.layers, ['a']);
  assert.strictEqual(G.find(r2.layers, r2.id).name, 'Group 1');
});
ok('rows: a header above each run, members under it, folded members marked', () => {
  const Ls = mk('a', 'b', 'c', 'd');
  const { layers, id } = G.group(Ls, ['b', 'c'], { name: 'Mid' });
  let rows = G.rows(layers);
  assert.deepStrictEqual(rows.map((r) => (r.kind === 'group' ? `[${r.g.name}:${r.n}]` : r.L.id)), ['d', '[Mid:2]', 'c', 'b', 'a']);
  assert.ok(rows.find((r) => r.L?.id === 'b').last && !rows.find((r) => r.L?.id === 'c').last);
  G.fold(layers, id, true);
  rows = G.rows(layers);
  assert.ok(rows.filter((r) => r.folded).map((r) => r.L.id).join() === 'c,b');
  assert.strictEqual(G.fold(layers, id), false, 'fold again: open');
  // a layer added between two members splits the run (nothing moves in the picture)
  layers.splice(2, 0, { id: 'x', name: 'X', visible: true });
  assert.strictEqual(G.rows(layers).filter((r) => r.kind === 'group').length, 2);
  const tidy = G.gather(layers, id);
  assert.strictEqual(ids(tidy), 'axbcd');
  assert.strictEqual(G.rows(tidy).filter((r) => r.kind === 'group').length, 1);
});
ok('a group\'s eye hides its members (not drawn) and shows back exactly what it hid', () => {
  const Ls = mk('a', 'b', 'c', 'd');
  const { layers, id } = G.group(Ls, ['a', 'b', 'c']);
  layers[1].visible = false; // b hidden by its own eye
  assert.strictEqual(G.vis(layers, id), 'some');
  G.setVisible(layers, id, false);
  assert.strictEqual(shown(layers), 'd');
  assert.strictEqual(G.vis(layers, id), 'off');
  G.toggle(layers, id);
  assert.strictEqual(shown(layers), 'acd', 'b stays hidden: its own choice');
  G.setVisible(layers, id, false); G.manual(layers[0]); layers[0].visible = true; // a's own eye during the hide
  G.setVisible(layers, id, true);
  assert.strictEqual(shown(layers), 'acd');
  // every member hidden by its own eye: the group's eye shows them all
  for (const L of layers.slice(0, 3)) { L.visible = false; delete L.hid; }
  G.toggle(layers, id);
  assert.strictEqual(shown(layers), 'abcd');
});
ok('solo a layer: only it is drawn; again: everything back (a hidden one too)', () => {
  const Ls = mk('a', 'b', 'c');
  Ls[2].visible = false;
  assert.strictEqual(G.solo(Ls, 'b'), 'b');
  assert.strictEqual(shown(Ls), 'b');
  assert.strictEqual(G.soloId(Ls), 'b');
  assert.strictEqual(G.solo(Ls, 'b'), null);
  assert.strictEqual(shown(Ls), 'ab');
  assert.strictEqual(G.soloId(Ls), null);
  // solo of a hidden layer shows it, and hides it again after
  G.solo(Ls, 'c');
  assert.strictEqual(shown(Ls), 'c');
  G.solo(Ls, 'a'); // another target: straight from one solo to the other
  assert.strictEqual(shown(Ls), 'a');
  G.unsolo(Ls);
  assert.strictEqual(shown(Ls), 'ab');
  assert.ok(Ls.every((L) => L.solo == null && L.hid == null && L.soloShown == null));
});
ok('solo a group: its members (own eyes kept), even a hidden group; ends as it was', () => {
  const Ls = mk('a', 'b', 'c', 'd');
  const { layers, id } = G.group(Ls, ['b', 'c']);
  layers[1].visible = false; // b: own eye
  G.solo(layers, id);
  assert.strictEqual(shown(layers), 'c');
  G.unsolo(layers);
  assert.strictEqual(shown(layers), 'acd');
  G.setVisible(layers, id, false);
  assert.strictEqual(shown(layers), 'ad');
  G.solo(layers, id);
  assert.strictEqual(shown(layers), 'c', 'the hidden group shows for its solo (b keeps its own eye)');
  G.solo(layers, id);
  assert.strictEqual(shown(layers), 'ad', 'and is hidden again by its eye after');
  G.setVisible(layers, id, true);
  assert.strictEqual(shown(layers), 'acd');
});
ok('drag: a layer onto a member joins that group at its place; onto an ungrouped one leaves; onto a header: top of the group', () => {
  const Ls = mk('a', 'b', 'c', 'd', 'e');
  let { layers, id } = G.group(Ls, ['b', 'c'], { name: 'G' });
  // e (top) dropped on b (moving down): takes b's place
  layers = G.move(layers, { layer: 'e' }, { layer: 'b' });
  assert.strictEqual(ids(layers), 'aebcd');
  assert.strictEqual(G.gOf(layers[1]), id);
  // c dropped on d (ungrouped, moving up): out of the group, above d
  layers = G.move(layers, { layer: 'c' }, { layer: 'd' });
  assert.strictEqual(ids(layers), 'aebdc');
  assert.strictEqual(G.gOf(layers[4]), null);
  // a dropped on the header: joins at the group's top
  layers = G.move(layers, { layer: 'a' }, { group: id });
  assert.strictEqual(ids(layers), 'ebadc');
  assert.deepStrictEqual(G.members(layers, id).map((L) => L.id), ['e', 'b', 'a']);
  // to the end of the list: the very bottom, out of any group
  layers = G.move(layers, { layer: 'a' }, { end: true });
  assert.strictEqual(ids(layers), 'aebdc');
  assert.strictEqual(G.gOf(layers[0]), null);
});
ok('drag a group: the whole block moves, never into another group', () => {
  const Ls = mk('a', 'b', 'c', 'd', 'e', 'f');
  let { layers, id: g1 } = G.group(Ls, ['a', 'b']);
  const r = G.group(layers, ['d', 'e']); layers = r.layers; const g2 = r.id;
  assert.strictEqual(ids(layers), 'abcdef');
  // g1 dropped on e (a member of g2, moving up): above all of g2
  layers = G.move(layers, { group: g1 }, { layer: 'e' });
  assert.strictEqual(ids(layers), 'cdeabf');
  // g1 dropped on g2's header (moving down): below g2
  layers = G.move(layers, { group: g1 }, { group: g2 });
  assert.strictEqual(ids(layers), 'cabdef');
  // on a plain layer: its place
  layers = G.move(layers, { group: g1 }, { layer: 'f' });
  assert.strictEqual(ids(layers), 'cdefab');
  assert.strictEqual(G.move(layers, { group: g1 }, { group: g1 }), null);
});
ok('take out: just above its group; ungroup: layers stay, own eyes kept, a group-hidden one shows', () => {
  const Ls = mk('a', 'b', 'c', 'd');
  let { layers, id } = G.group(Ls, ['a', 'b', 'c']);
  layers = G.takeOut(layers, 'a');
  assert.strictEqual(ids(layers), 'bcad');
  assert.strictEqual(G.gOf(layers[2]), null);
  G.setVisible(layers, id, false);
  layers[0].hid = undefined; delete layers[0].hid; // b now hidden as by its own eye
  G.ungroup(layers, id);
  assert.ok(layers.every((L) => !L.group));
  assert.strictEqual(shown(layers), 'ad', 'ungroup keeps what shows');
  assert.ok(G.rename(mk('z').map((L) => ({ ...L, group: { id: 'q', name: 'Old' } })), 'q', '  New  '));
});
ok('undo: what one change did goes back; later changes to other fields stay; order back unless reordered since', () => {
  const Ls = mk('a', 'b', 'c', 'd');
  const before = G.state(Ls);
  let { layers, id } = G.group(Ls, ['a', 'c']);
  G.setVisible(layers, id, false);
  const after = G.state(layers);
  layers[3].visible = false; // d hidden afterwards by hand
  layers = G.undo(layers, before, after);
  assert.strictEqual(ids(layers), 'abcd');
  assert.ok(layers.every((L) => !L.group && !L.hid));
  assert.strictEqual(shown(layers), 'abc', 'd stays as it was made later');
  // a solo, undone
  const b2 = G.state(layers);
  G.solo(layers, 'a');
  const a2 = G.state(layers);
  layers = G.undo(layers, b2, a2);
  assert.strictEqual(shown(layers), 'abc');
  assert.strictEqual(G.soloId(layers), null);
});
ok('saved data cleaned: bad groups, stale markers, names agree per group', () => {
  const Ls = [{ id: 'a', visible: true, group: 'oops' }, { id: 'b', visible: true, hid: 'group', group: { id: 'g', name: 'One' } }, { id: 'c', visible: false, hid: 'what', group: { id: 'g', name: 'Two' } }, { id: 'd', solo: 4 }];
  assert.strictEqual(G.clean(Ls), 5);
  assert.ok(!Ls[0].group && !Ls[1].hid && !Ls[2].hid && Ls[3].solo == null);
  assert.strictEqual(Ls[2].group.name, 'One');
  assert.strictEqual(G.clean(Ls), 0);
});
ok('words: groups top first with their layers, hidden and solo said', () => {
  const Ls = mk('a', 'b', 'c');
  const { layers, id } = G.group(Ls, ['a', 'b'], { name: 'Back' });
  G.solo(layers, id);
  const t = G.describe(layers);
  assert.ok(/📁 Back · solo: B, A/.test(t), t);
  assert.strictEqual(G.byName(layers, 'back').id, id);
  assert.strictEqual(G.describe(mk('x')), 'No groups yet.');
});
console.log(`${n} tests${process.exitCode ? ' (some failed)' : ', all pass'}`);
