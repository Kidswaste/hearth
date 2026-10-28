#!/usr/bin/env node
// (round 77, storeack77) Every store the window (or the main process) holds in memory, when the other computer's version
// arrives, through the two-computer simulator (dev/sync-sim.js, the worlds of dev/sync72-test.js, the real sync engine and
// its write guard, as store.js applies it) and the real coordinator (storeack-core.js, as sync.js / syncmain.js run it):
//   core          the coordinator on its own: written first, read again, acked; typed while reading → written and read
//                 again; a read that fails / a holder that can't apply → no ack; nobody declared → no ack; two holders,
//                 one writes late → no ack; a second arrival while reading → the engine ignores that ack (since)
//   stores        per store type, on the PC's window: the Mac adds a thing, it arrives, the PC's window (with a change of
//                 its own not written yet) writes first, reads again and acks; the PC takes the arrived thing out right
//                 away → it stays out on both computers, and the PC's own change is there. Lab scenes, Lab scene settings
//                 (keyed by scene), Lab time machine, boards (list + one board's items), chat ↔ scene links, the
//                 worktable's shelf (a list without ids), notes, saved prompts' favorites, music sessions, follows,
//                 show nights' reminders, My Paris photos, projects, quick ideas (main process, read at each change)
//   without-ack   the bug itself, for a list with ids and the worktable shelf: without the ack the thing comes back
//   typing        a note typed in on the PC while the Mac's edit of the same note arrives: both kept (line merge), the
//                 PC's text never lost; the caret's helper (into / keepCaret logic) keeps objects the screen holds
//   counts        feature usage (ui-usage, saved by what changed): an op merge made from the disk as it is now must not go
//                 through the guard again (the arrived clicks were counted twice on every save)
//   soundbank     the sound bank's index (main process, its own writes, no guard): a favorite set on the Mac arrives
//                 while the PC has a change waiting → both stay (before: the PC's save put the old index back)
// Never touches real data or a real cloud drive: a temp folder.
//   node dev/storeack77-test.js [--only name,name] [--verbose]
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
const SA = require('../storeack-core');
const S = require('../sync-merge');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`); } };
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });
const clone = (v) => JSON.parse(JSON.stringify(v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- a window on a computer: a store in memory, saved the way store.js saves (through sync's guard) ----------
// win.held: what the window holds · win.change(fn): a change in memory, not written yet · win.save(): written now
function windowOf(m, rel, o = {}) {
  const w = { held: null, dirty: false, writes: 0 };
  w.load = () => { w.held = m.json(rel); return w.held; };
  w.save = () => { const v = m.e.guardWrite(m.p(rel), clone(w.held)); m.write(rel, v); w.dirty = false; w.writes += 1; return v; };
  w.change = (fn) => { const r = fn(w.held); if (r !== undefined) w.held = r; w.dirty = true; };
  w.sa = o.sa || SA.create({ ack: (rels, since) => m.e.ackPulled(rels, since) });
  w.handle = w.sa.hold(rel, {
    name: rel, pending: () => w.dirty, flush: () => w.save(),
    read: async () => { await wait(1); return m.json(rel); },
    apply: (v) => { if (o.apply) return o.apply(w, v); w.held = v; return undefined; },
  });
  return w;
}
// what arrived on a computer since last asked (the engine's sync:pulled lists)
const take = (m) => { const l = m.pulled.slice(); m.pulled.length = 0; return l; };
async function pair(name) {
  const w = T.world(`sa-${name}`);
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  return { w, pc, mac };
}

// ---------- 0. the coordinator on its own ----------
scenario('core', async () => {
  const acks = []; let t = 1000;
  const C = SA.create({ ack: (rels, since) => { acks.push({ rels, since }); }, now: () => t++ });
  let held = { a: 1 }; let dirty = true; const order = [];
  C.hold('notes', { pending: () => dirty, flush: async () => { order.push('flush'); dirty = false; }, read: async () => { order.push('read'); return { a: 2 }; }, apply: (v) => { order.push('apply'); held = v; } });
  let r = await C.arrived([{ rel: 'kv/notes.json', kind: 'kv' }, { rel: 'kv/nobody.json', kind: 'kv' }, { rel: 'chats/x.json', kind: 'chat' }, { rel: 'captures/a.png', kind: 'file' }]);
  ok(order.join(',') === 'flush,read,apply' && held.a === 2, 'core: the change written first, then read again and applied', order);
  ok(r.acked.join() === 'kv/notes.json' && acks.length === 1 && acks[0].rels.join() === 'kv/notes.json', 'core: acked once, only the declared store', { r, acks });
  ok(r.unknown.join() === 'kv/nobody.json', 'core: a store nobody declared is never acked (an older copy may be held somewhere)', r);
  // typed while it was being read: written and read again
  let typed = false; let reads = 0; let saves = 0;
  const C2 = SA.create({ ack: (rels) => acks.push({ rels }) });
  C2.hold('board-x', { pending: () => typed, flush: () => { saves += 1; typed = false; }, read: async () => { reads += 1; if (reads === 1) typed = true; return reads; }, apply: (v) => { held = v; } });
  r = await C2.arrived([{ rel: 'kv/board-x.json' }]);
  ok(reads === 2 && saves === 1 && held === 2 && r.acked.length === 1, 'core: something typed while it was read is written, then read again', { reads, saves, held, r });
  // a read that fails / an apply that can't / a flush that fails → no ack, nothing replaced
  const C3 = SA.create({ ack: (rels) => acks.push({ rels, c3: true }) });
  C3.hold('a', { read: async () => { throw Error('EBUSY'); }, apply: () => { held = 'over'; } });
  C3.hold('b', { read: async () => 1, apply: () => false });
  let bad = 0; C3.hold('c', { pending: () => true, flush: async () => { throw Error('held'); }, read: async () => { bad += 1; return 1; }, apply: () => {} });
  r = await C3.arrived([{ rel: 'kv/a.json' }, { rel: 'kv/b.json' }, { rel: 'kv/c.json' }]);
  ok(!acks.some((x) => x.c3) && r.kept.length === 3 && held !== 'over' && bad === 0, 'core: a failed read / apply / write: no ack, nothing read over a change not written', { r, held, bad });
  // two holders of one store: one writes after the other read → no ack (the other one could be older than the disk)
  const C4 = SA.create({ ack: (rels) => acks.push({ rels, c4: true }) });
  let late = false; let n4 = 0;
  C4.hold('shared', { read: async () => { late = true; return 1; }, apply: () => {} });
  C4.hold('shared', { pending: () => late, flush: () => { late = false; n4 += 1; } });
  r = await C4.arrived([{ rel: 'kv/shared.json' }]);
  ok(n4 === 1 && !acks.some((x) => x.c4), 'core: a late write by one holder while another holds a copy → no ack', { n4, r });
  // regex stores, drop holders, again()
  const dropped = []; const C5 = SA.create({ ack: (rels) => acks.push({ rels, c5: true }) });
  const h5 = C5.hold(/^showsync\/[^/]+\.json$/, { drop: (rel) => dropped.push(rel) });
  r = await C5.arrived([{ rel: 'showsync/settings.json' }, { rel: 'showsync/logos/a.png' }]);
  ok(dropped.join() === 'showsync/settings.json' && r.acked.join() === 'showsync/settings.json', 'core: a path pattern; the copy let go', { dropped, r });
  r = await h5.again('showsync/cache.json');
  ok(r.acked.join() === 'showsync/cache.json', 'core: again() handles an arrival that was put off', r);
  // into(): the same objects, the new values
  const st = { vst: { plugins: ['a'] }, shelf: [{ name: 'x' }, { name: 'y' }], title: 'old', gone: 1 };
  const vst = st.vst; const s0 = st.shelf[0];
  SA.into(st, { vst: { plugins: ['a', 'b'] }, shelf: [{ name: 'x2' }], title: 'new' });
  ok(st.vst === vst && vst.plugins.join() === 'a,b' && st.shelf[0] === s0 && s0.name === 'x2' && st.shelf.length === 1 && st.title === 'new' && !('gone' in st), 'core: into() keeps the objects a screen holds and gives them the new values', st);
  // the engine: an ack for a read that began before the last arrival is ignored
  const { w, pc, mac } = await pair('since');
  pc.write('kv/notes.json', [{ id: 'n1', text: 'a' }]);
  ok(await T.converge(w) > 0, 'core: first sync', T.why(w));
  mac.edit('kv/notes.json', (l) => [...l, { id: 'n2', text: 'b' }]);
  ok(await T.converge(w) > 0 && pc.e.hasPulled('kv/notes.json'), 'core: the Mac\'s note arrives (the guard holds its base)', T.why(w));
  const before = Date.now() - 1000;
  pc.e.ackPulled(['kv/notes.json'], before);
  ok(pc.e.hasPulled('kv/notes.json'), 'core: an ack for a read begun before the arrival is ignored (the window holds the older one)');
  pc.e.ackPulled(['kv/notes.json'], Date.now() + 1);
  ok(!pc.e.hasPulled('kv/notes.json'), 'core: an ack for a read begun after it is taken');
});

// ---------- 1. per store: removed on the PC right after the Mac's version arrived → stays removed ----------
// a store type: its file, a first value, add / remove / has (by a key), and a change the PC makes meanwhile
const TYPES = [
  { name: 'Lab scenes', rel: 'kv/three-sketches.json', init: () => [{ id: 's1', name: 'Clink', code: 'a', updatedAt: 1 }],
    add: (v, k) => [...v, { id: k, name: k, code: '// mac', updatedAt: 2 }], remove: (v, k) => v.filter((x) => x.id !== k), has: (v, k) => (v || []).some((x) => x.id === k),
    mine: (v) => { v[0].code = 'a\n// pc'; v[0].updatedAt = 3; }, mineHas: (v) => v.find((x) => x.id === 's1')?.code.includes('// pc') },
  { name: 'Lab scene settings', rel: 'kv/three-lab-extras.json', init: () => ({ s1: { media: { path: '/a.wav', time: 0 } } }),
    add: (v, k) => ({ ...v, [k]: { frame: '9:16' } }), remove: (v, k) => { delete v[k]; return v; }, has: (v, k) => Boolean(v && v[k]),
    mine: (v) => { v.s1.frame = '1:1'; }, mineHas: (v) => v.s1?.frame === '1:1' },
  { name: 'Lab time machine', rel: 'kv/three-tm-s1.json', init: () => ({ v: 1, keys: { k1: 'x' }, versions: [{ id: 'v1', at: 1, key: 'k1' }] }),
    add: (v, k) => ({ ...v, versions: [...v.versions, { id: k, at: 2, key: 'k1' }] }), remove: (v, k) => ({ ...v, versions: v.versions.filter((x) => x.id !== k) }), has: (v, k) => (v?.versions || []).some((x) => x.id === k),
    mine: (v) => { v.versions.push({ id: 'vpc', at: 3, key: 'k1' }); }, mineHas: (v) => v.versions.some((x) => x.id === 'vpc') },
  { name: 'Boards (list)', rel: 'kv/boards.json', init: () => ({ list: [{ id: 'b1', name: 'Mood', updated: 1 }], current: 'b1', links: {}, prefs: {} }),
    add: (v, k) => ({ ...v, list: [{ id: k, name: k, updated: 2 }, ...v.list] }), remove: (v, k) => ({ ...v, list: v.list.filter((x) => x.id !== k) }), has: (v, k) => (v?.list || []).some((x) => x.id === k),
    mine: (v) => { v.prefs.snap = true; }, mineHas: (v) => v.prefs?.snap === true },
  { name: 'A board\'s items', rel: 'kv/board-b1.json', init: () => ({ id: 'b1', name: 'Mood', seq: 1, items: [{ id: 'i1', type: 'note', text: 'mood' }], view: { x: 0, y: 0, z: 1 }, chats: [] }),
    add: (v, k) => ({ ...v, items: [...v.items, { id: k, type: 'image', src: '/m.png' }] }), remove: (v, k) => ({ ...v, items: v.items.filter((x) => x.id !== k) }), has: (v, k) => (v?.items || []).some((x) => x.id === k),
    mine: (v) => { v.items[0].text = 'mood, warmer'; }, mineHas: (v) => v.items.find((x) => x.id === 'i1')?.text === 'mood, warmer' },
  { name: 'Chat ↔ scene links', rel: 'kv/chat-scenes.json', init: () => ({ links: { c1: { sketch: 's1', at: 1 } }, videos: {}, idents: {} }),
    add: (v, k) => ({ ...v, links: { ...v.links, [k]: { sketch: 's2', at: 2 } } }), remove: (v, k) => { delete v.links[k]; return v; }, has: (v, k) => Boolean(v?.links?.[k]),
    mine: (v) => { v.idents.c1 = { glyph: '◆' }; }, mineHas: (v) => v.idents?.c1?.glyph === '◆' },
  { name: 'Worktable shelf (no ids)', rel: 'kv/workbench-pj1.json', init: () => ({ v: 1, title: 'Clink', shelf: [{ name: 'Old', image: 'data:a' }], storyboard: { panels: [{ title: 'One', notes: '' }] } }),
    add: (v, k) => ({ ...v, shelf: [{ name: k, image: 'data:b' }, ...v.shelf] }), remove: (v, k) => ({ ...v, shelf: v.shelf.filter((x) => x.name !== k) }), has: (v, k) => (v?.shelf || []).some((x) => x.name === k),
    mine: (v) => { v.storyboard.panels[0].notes = 'Wide shot.'; }, mineHas: (v) => v.storyboard.panels[0].notes === 'Wide shot.' },
  { name: 'Notes', rel: 'kv/notes.json', init: () => [{ id: 'n1', title: 'Scratchpad', text: 'hello', updatedAt: 1 }],
    add: (v, k) => [{ id: k, title: k, text: `# ${k}`, updatedAt: 2 }, ...v], remove: (v, k) => v.filter((x) => x.id !== k), has: (v, k) => (v || []).some((x) => x.id === k),
    mine: (v) => { v.find((x) => x.id === 'n1').text = 'hello\ntyped on the PC'; }, mineHas: (v) => v.find((x) => x.id === 'n1')?.text.includes('typed on the PC') },
  { name: 'Saved prompts\' favorites', rel: 'kv/prompts-meta.json', init: () => ({ hidden: [], favs: ['p1'], uses: { p1: 1 } }),
    add: (v, k) => ({ ...v, favs: [...v.favs, k] }), remove: (v, k) => ({ ...v, favs: v.favs.filter((x) => x !== k) }), has: (v, k) => (v?.favs || []).includes(k),
    mine: (v) => { v.hidden.push('b9'); }, mineHas: (v) => v.hidden.includes('b9') },
  { name: 'Music sessions', rel: 'kv/music-sessions.json', init: () => ({ v: 1, sessions: [{ id: 'm1', start: 1, minutes: 20 }] }),
    add: (v, k) => ({ ...v, sessions: [{ id: k, start: 2, minutes: 30 }, ...v.sessions] }), remove: (v, k) => ({ ...v, sessions: v.sessions.filter((x) => x.id !== k) }), has: (v, k) => (v?.sessions || []).some((x) => x.id === k),
    mine: (v) => { v.sessions.find((x) => x.id === 'm1').logged = true; }, mineHas: (v) => v.sessions.find((x) => x.id === 'm1')?.logged === true },
  { name: 'Show nights & reminders', rel: 'kv/show-nights.json', init: () => ({ v: 1, prep: {}, went: [], reminders: [{ id: 'r1', key: 'show-a', at: 1 }] }),
    add: (v, k) => ({ ...v, reminders: [...v.reminders, { id: k, key: 'show-b', at: 2 }] }), remove: (v, k) => ({ ...v, reminders: v.reminders.filter((x) => x.id !== k) }), has: (v, k) => (v?.reminders || []).some((x) => x.id === k),
    mine: (v) => { v.prep['show-a'] = { earplugs: true }; }, mineHas: (v) => v.prep['show-a']?.earplugs === true },
  { name: 'My Paris photos', rel: 'kv/paris-photos.json', init: () => ({ v: 1, photos: [{ id: 'ph1', file: 'photos/a.jpg' }] }),
    add: (v, k) => ({ ...v, photos: [...v.photos, { id: k, file: `photos/${k}.jpg` }] }), remove: (v, k) => ({ ...v, photos: v.photos.filter((x) => x.id !== k) }), has: (v, k) => (v?.photos || []).some((x) => x.id === k),
    mine: (v) => { v.photos[0].caption = 'Canal'; }, mineHas: (v) => v.photos.find((x) => x.id === 'ph1')?.caption === 'Canal' },
  { name: 'Projects', rel: 'kv/projects.json', init: () => ({ v: 1, list: [{ id: 'pj1', name: 'Clink', items: [{ id: 'chat:c1', type: 'chat', ref: 'c1' }], notes: '', updated: 1 }], dismissed: [] }),
    add: (v, k) => { v.list[0].items.push({ id: `render:${k}`, type: 'render', ref: k }); return v; }, remove: (v, k) => { v.list[0].items = v.list[0].items.filter((x) => x.ref !== k); return v; }, has: (v, k) => (v?.list?.[0]?.items || []).some((x) => x.ref === k),
    mine: (v) => { v.list[0].notes = 'Goal: 30 s'; }, mineHas: (v) => v.list[0].notes === 'Goal: 30 s' },
];
for (const ty of TYPES) {
  scenario(`stores:${ty.name}`, async () => {
    const { w, pc, mac } = await pair(ty.rel.replace(/\W+/g, '-'));
    pc.write(ty.rel, ty.init());
    ok(await T.converge(w) > 0, `${ty.name}: first sync`, T.why(w));
    const win = windowOf(pc, ty.rel); win.load(); pc.e.ackPulled([ty.rel]); take(pc); // (the window's first read)
    // the Mac adds one; the PC's window changes something of its own, not written yet when the Mac's version lands
    mac.edit(ty.rel, (v) => ty.add(v, 'mac1'));
    win.change((v) => { ty.mine(v); });
    ok(await T.converge(w) > 0, `${ty.name}: the Mac's version reaches the PC`, T.why(w));
    const got = await win.sa.arrived(take(pc));
    ok(got.acked.includes(ty.rel), `${ty.name}: the PC's window wrote first, read again and acked`, got);
    ok(ty.has(win.held, 'mac1') && ty.mineHas(win.held), `${ty.name}: the window holds the Mac's thing and its own change`, win.held);
    // the owner takes the Mac's thing out on the PC right away: it stays out on both, the PC's change stays
    win.change((v) => ty.remove(v, 'mac1')); win.save();
    ok(await T.converge(w) > 0, `${ty.name}: converges after taking it out`, T.why(w));
    for (const m of [pc, mac]) {
      const v = m.json(ty.rel);
      ok(!ty.has(v, 'mac1'), `${ty.name}: taken out on the PC stays out, on the ${m.name}`, v);
      ok(ty.mineHas(v), `${ty.name}: the PC's change made while it arrived is there, on the ${m.name}`, v);
    }
    ok((await pc.e.conflicts()).length === 0 && (await mac.e.conflicts()).length === 0, `${ty.name}: no conflict`);
  });
}

// quick ideas: the main process reads the file at each change (quickideamain.js change()): nothing older is held, its
// change is read → change → write through the guard; StoreAck (main) acks at once
scenario('stores:Quick ideas (main)', async () => {
  const QI = require('../quickidea-core');
  const { w, pc, mac } = await pair('quick-ideas');
  const rel = 'kv/quick-ideas.json';
  pc.write(rel, { ...QI.empty(), ideas: [{ id: 'q1', text: 'a loop idea', at: 1 }] });
  ok(await T.converge(w) > 0, 'quick ideas: first sync', T.why(w));
  const C = SA.create({ ack: (rels, since) => pc.e.ackPulled(rels, since) });
  let inFlight = 0;
  C.hold('quick-ideas', { name: 'Quick ideas', pending: () => inFlight > 0, flush: () => {} });
  const change = (fn) => { const s = pc.json(rel); fn(s); pc.write(rel, pc.e.guardWrite(pc.p(rel), s)); }; // read → change → write (through the guard)
  mac.edit(rel, (v) => ({ ...v, ideas: [{ id: 'qmac', text: 'from the Mac', at: 2 }, ...v.ideas] }));
  ok(await T.converge(w) > 0, 'quick ideas: the Mac\'s idea arrives', T.why(w));
  const got = await C.arrived(take(pc));
  ok(got.acked.includes(rel), 'quick ideas: acked (nothing older held)', got);
  change((s) => { s.ideas = s.ideas.filter((x) => x.id !== 'qmac'); });
  ok(await T.converge(w) > 0, 'quick ideas: converges', T.why(w));
  for (const m of [pc, mac]) ok(!m.json(rel).ideas.some((x) => x.id === 'qmac') && m.json(rel).ideas.some((x) => x.id === 'q1'), `quick ideas: deleted on the PC right after it arrived stays deleted, on the ${m.name}`, m.json(rel));
});

// ---------- 2. the bug itself: without the ack, the thing taken out comes back ----------
scenario('without-ack', async () => {
  for (const ty of [TYPES.find((x) => x.name === 'Notes'), TYPES.find((x) => x.name.startsWith('Worktable'))]) {
    const { w, pc, mac } = await pair(`noack-${ty.rel.replace(/\W+/g, '-')}`);
    pc.write(ty.rel, ty.init());
    ok(await T.converge(w) > 0, `without ack (${ty.name}): first sync`, T.why(w));
    pc.e.ackPulled(); take(pc);
    mac.edit(ty.rel, (v) => ty.add(v, 'mac1'));
    ok(await T.converge(w) > 0, `without ack (${ty.name}): arrives`, T.why(w));
    const held = pc.json(ty.rel); // the window reloaded … and never told sync
    const v = pc.e.guardWrite(pc.p(ty.rel), ty.remove(clone(held), 'mac1'));
    ok(ty.has(v, 'mac1'), `without ack (${ty.name}): the thing taken out right after it arrived is merged back in (round 76 bug 7's class)`, v);
  }
});

// ---------- 3. typing in a note while the Mac's edit of the same note arrives ----------
scenario('typing', async () => {
  const { w, pc, mac } = await pair('typing');
  const rel = 'kv/notes.json';
  pc.write(rel, [{ id: 'n1', title: 'Shot list', text: '# Shot list\n- one\n- two\n- three\n- four\n- five\n- six', updatedAt: 1 }]);
  ok(await T.converge(w) > 0, 'typing: first sync', T.why(w));
  const win = windowOf(pc, rel); win.load(); take(pc); pc.e.ackPulled();
  mac.edit(rel, (v) => { v[0].text = v[0].text.replace('- six', '- six (Mac)'); return v; });
  win.change((v) => { v[0].text = v[0].text.replace('- one', '- one, typed on the PC'); });
  ok(await T.converge(w) > 0, 'typing: the Mac\'s edit arrives', T.why(w));
  // the owner keeps typing while the window reads it again: written first, read again (core: run's re-read)
  let typedMore = false;
  const read0 = win.handle; win.handle.off();
  const sa = SA.create({ ack: (rels, since) => pc.e.ackPulled(rels, since) });
  sa.hold(rel, { pending: () => win.dirty, flush: () => win.save(), read: async () => { const v = pc.json(rel); if (!typedMore) { typedMore = true; win.change((h) => { h[0].text = h[0].text.replace('- three', '- three (typed while it was read)'); }); } return v; }, apply: (v) => { win.held = v; } });
  const got = await sa.arrived(take(pc));
  const t = win.held[0].text;
  ok(got.acked.includes(rel) && t.includes('typed on the PC') && t.includes('(Mac)') && t.includes('three (typed while it was read)'), 'typing: the PC\'s typing (before and during the read) and the Mac\'s line are all in the note', { got, t });
  ok(await T.converge(w) > 0 && mac.json(rel)[0].text === pc.json(rel)[0].text, 'typing: both computers end with the same note', [mac.json(rel)[0].text, pc.json(rel)[0].text]);
  ok(Boolean(read0), 'typing: (handle kept)');
});

// ---------- 4. counts saved by what changed (feature usage) ----------
scenario('counts', async () => {
  const { w, pc, mac } = await pair('counts');
  const rel = 'kv/ui-usage.json';
  pc.write(rel, { since: 1, items: { lab: { n: 5 } }, days: {}, hidden: [] });
  ok(await T.converge(w) > 0, 'counts: first sync', T.why(w));
  pc.e.ackPulled();
  mac.edit(rel, (v) => { v.items.lab.n += 3; return v; });
  ok(await T.converge(w) > 0 && pc.json(rel).items.lab.n === 8, 'counts: the Mac\'s 3 clicks arrive', pc.json(rel));
  // store.js mergeKV: the PC's 1 click applied to the file as it is now
  const ops = (v) => { v.items.lab.n += 1; return v; };
  const guarded = pc.e.guardWrite(pc.p(rel), ops(pc.json(rel)));
  ok(guarded.items.lab.n === 12, 'counts: (the bug) through the guard again, the Mac\'s clicks were counted twice', guarded.items.lab.n);
  pc.write(rel, ops(pc.json(rel))); // fresh: written as made (store.js writeJson o.fresh)
  ok(await T.converge(w) > 0, 'counts: converges', T.why(w));
  for (const m of [pc, mac]) ok(m.json(rel).items.lab.n === 9, `counts: 5 + 3 on the Mac + 1 on the PC = 9, on the ${m.name}`, m.json(rel).items.lab.n);
  const src = fs.readFileSync(path.join(__dirname, '..', 'store.js'), 'utf8');
  ok(/if \(beforeWrite && !o\?\.fresh\)/.test(src) && /prev: file\.replace\(\/\\\.json\$\/, '\.prev\.json'\), fresh: true \}/.test(src), 'counts: store.js writes a merge made from the disk without the guard (o.fresh)');
});

// ---------- 5. the sound bank (main process, its own writes) ----------
scenario('soundbank', async () => {
  const Bank = require('../soundbankmain');
  const { w, pc, mac } = await pair('soundbank');
  const rel = 'creative-vst/soundbank/index.json';
  const entry = (id) => ({ id, source: 'plugin', instrument: 'Vital', name: id, favorite: false, usedIn: [], at: '2026-10-01T00:00:00.000Z', tags: [], file: '' });
  pc.write(rel, { v: 1, settings: { pluginFolders: false, folders: [] }, entries: { a: entry('a'), b: entry('b') }, files: {} });
  ok(await T.converge(w) > 0, 'soundbank: first sync', T.why(w));
  const bank = Bank.create({ dataDir: pc.data, hostFactory: () => null });
  ok(bank.list({}).ok !== false, 'soundbank: the PC\'s bank is read');
  mac.edit(rel, (v) => { v.entries.a.favorite = true; return v; }); // ★ on the Mac
  ok(await T.converge(w) > 0 && pc.json(rel).entries.a.favorite === true, 'soundbank: the Mac\'s ★ arrives on disk', T.why(w));
  bank.update('b', { favorite: true }); // ★ on the PC, its save waiting (250 ms)
  bank.arrived(); // StoreAck (main) on sync:pulled
  bank.flush(); bank.stop?.();
  ok(await T.converge(w) > 0, 'soundbank: converges', T.why(w));
  for (const m of [pc, mac]) { const e = m.json(rel).entries; ok(e.a.favorite === true && e.b.favorite === true, `soundbank: both ★ stay (the Mac's and the PC's), on the ${m.name}`, e); }
  // before: the PC's save of what it held put the old index back over the Mac's ★
  const bank2 = Bank.create({ dataDir: mac.data, hostFactory: () => null });
  bank2.list({});
  pc.edit(rel, (v) => { v.entries.a.favorite = false; return v; });
  ok(await T.converge(w) > 0, 'soundbank: the PC\'s un-★ reaches the Mac', T.why(w));
  bank2.update('b', { favorite: false }); bank2.flush(); bank2.stop?.(); // no arrived(): the old way
  ok(mac.json(rel).entries.a.favorite === true, 'soundbank: (the bug) without arrived(), the Mac\'s save put the old ★ back over the PC\'s change', mac.json(rel).entries.a);
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.some((o) => s.name === o || s.name.startsWith(`${o}:`))) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  console.log(`\nstoreack77: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
