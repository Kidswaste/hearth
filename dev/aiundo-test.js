#!/usr/bin/env node
// Unit test for the AIs' undo timeline (aiundo-core.js, round 28): what gets undone and in which order (the asked
// change plus later changes to the same thing, newest first; one step back for a Lab scene / a file, each change for
// the board / settings), since… / a reply / a chat, entries that can't be undone, board item diffs and their inverse
// (with the owner's later touches), settings diffs, pruning.
//   node dev/aiundo-test.js
const C = require('../aiundo-core.js');
let fails = 0; let n = 0;
const check = (ok, label, extra) => { n += 1; if (!ok) { fails += 1; console.log(`✖ ${label}${extra !== undefined ? ` · ${JSON.stringify(extra)}` : ''}`); } else console.log(`✓ ${label}`); };
const ids = (xs) => xs.map((e) => e.what);

// ---------- a timeline ----------
const T0 = 1_700_000_000_000;
const list = [];
const at = (i) => T0 + i * 1000;
const mk = (i, e) => C.add(list, e, at(i));
mk(1, { by: 'claude', who: 'Claude', chat: 'c1', turn: 't1', area: 'lab', what: 'L1', tk: 'scene:a' });
mk(2, { by: 'claude', who: 'Claude', chat: 'c1', turn: 't1', area: 'board', what: 'B1', tk: 'board:x' });
mk(3, { by: 'claude', who: 'Claude', chat: 'c1', turn: 't1', area: 'lab', what: 'L2', tk: 'scene:a' });
mk(4, { by: 'astra', who: 'Astra', chat: 'c2', turn: 't2', area: 'lab', what: 'L3', tk: 'scene:a' });
mk(5, { by: 'astra', who: 'Astra', chat: 'c2', turn: 't2', area: 'file', what: 'F1', tk: 'file:/p/a.txt' });
mk(6, { by: 'claude', who: 'Claude', chat: 'c1', turn: 't3', area: 'board', what: 'B2', tk: 'board:x' });
mk(7, { by: 'claude', who: 'Claude', chat: 'c1', turn: 't3', area: 'file', what: 'F2', tk: 'file:/p/a.txt', cant: 'no copy' });
mk(8, { by: 'claude', who: 'Claude', chat: 'c1', turn: 't3', area: 'setting', what: 'S1', tk: ['setting:settings.notify', 'setting:agents.d.nodesTool'] });
mk(9, { by: 'claude', who: 'Claude', chat: 'c1', turn: 't4', area: 'board', what: 'B3', tk: 'board:y' });
check(list.length === 9 && list.every((e, i) => e.n > (list[i - 1]?.n || 0)), 'entries get ids and a running order');

// undo this: the newest alone
let p = C.plan(list, C.pickThis(list, list[8].id));
check(JSON.stringify(ids(p.entries)) === '["B3"]' && p.steps.length === 1 && !p.extra.length, 'undo the newest change: just it', ids(p.entries));
// undo an old Lab change: every later change to that scene comes along, newest first; ONE step (back before the oldest)
p = C.plan(list, C.pickThis(list, list[0].id));
check(JSON.stringify(ids(p.entries)) === '["L3","L2","L1"]', 'an older Lab change brings the later ones to the same scene (any AI), newest first', ids(p.entries));
check(p.steps.length === 1 && p.steps[0].e.what === 'L1' && p.steps[0].covers.length === 3, 'a scene goes back in one step: to the state before the oldest', p.steps.map((s) => [s.e.what, s.covers.length]));
check(ids(p.extra).join() === 'L3,L2', 'the later ones are listed as coming along');
check(p.newest.length === 1 && p.newest[0].what === 'L3', 'the owner\'s later changes are looked for after the newest one');
// board: each change undone in turn, newest first
p = C.plan(list, C.pickThis(list, list[1].id));
check(ids(p.entries).join() === 'B2,B1' && p.steps.map((s) => s.e.what).join() === 'B2,B1', 'board changes are undone one by one, newest first', p.steps.map((s) => s.e.what));
// a file: the newer change kept no copy, the older one did: one step back with the older copy covers both
p = C.plan(list, C.pickThis(list, list[4].id));
check(p.steps.length === 1 && p.steps[0].e.what === 'F1' && p.steps[0].covers.length === 2 && !p.skipped.length, 'a file with a copyless later change: the older copy puts it back (both covered)', p.steps.map((s) => [s.e.what, s.covers]));
// only the copyless one: skipped
p = C.plan(list, C.pickThis(list, list[6].id));
check(!p.steps.length && p.skipped.length === 1, 'a change with nothing to undo it with is skipped, not faked');
// since: everything Claude did from L2 on (+ Astra's later change to the same scene)
p = C.plan(list, C.pickSince(list, list[2].id));
check(ids(p.entries).join() === 'B3,S1,F2,B2,L3,L2' && p.steps[0].e.what === 'B3', 'since: everything that AI did from then on, plus later changes to the same things, newest first', ids(p.entries));
check(p.steps.find((s) => s.e.area === 'lab').covers.length === 2 && p.steps.some((s) => s.e.what === 'F2' || s.covers.includes(list[6].id)) === false, 'since: the scene goes back to before L2 (L1 stays); F2 alone can\'t be undone', p.steps.map((s) => [s.e.what, s.covers.length]));
check(p.skipped.map((e) => e.what).join() === 'F2', 'since: the copyless file change is reported as skipped');
// a reply
p = C.plan(list, C.pickReply(list, 't1'));
check(ids(p.entries).join() === 'B2,L3,L2,B1,L1', 'a reply: its changes and the later ones to the same things', ids(p.entries));
// settings: several targets, any overlap pulls it in
const s2 = C.add(list, { by: 'astra', who: 'Astra', chat: 'c2', turn: 't5', area: 'setting', what: 'S2', tk: 'setting:settings.notify' }, at(10));
p = C.plan(list, C.pickThis(list, list[7].id));
check(ids(p.entries).join() === 'S2,S1', 'a setting changed again later by another AI comes along (any shared target)', ids(p.entries));
// undone entries are left out
s2.undone = at(11);
p = C.plan(list, C.pickThis(list, list[7].id));
check(ids(p.entries).join() === 'S1', 'what was already undone is left out');
check(!C.plan(list, [s2]).entries.length, 'nothing left: an empty plan');
check(C.pickChat(list, 'c2').length === 3, 'a chat\'s changes');
check(C.describe(C.plan(list, C.pickSince(list, list[0].id)))[0].startsWith('▦ Claude: B3'), 'plain words for the confirm list', C.describe(C.plan(list, C.pickSince(list, list[0].id)))[0]);

// ---------- board items ----------
const before = [
  { id: 'i1', type: 'note', x: 0, y: 0, w: 200, h: 120, text: 'warm grain' },
  { id: 'i2', type: 'image', x: 300, y: 0, w: 320, h: 200, src: 'a.jpg', vibe: { moods: ['calm'] } },
  { id: 'i3', type: 'note', x: 0, y: 300, w: 200, h: 120, text: 'cut on the snare' },
];
const after = JSON.parse(JSON.stringify(before));
after[0].x = 50; after[0].y = 80; // moved (arrange)
after[1].vibe = { moods: ['calm', 'night'] }; // the board's own analysis: not the AI's change
after.splice(2, 1); // removed i3
after.push({ id: 'i4', type: 'note', x: 900, y: 0, w: 200, h: 120, text: 'neon' }); // added
after[0].title = 'Grain'; // a new field
const d = C.diffItems(before, after);
check(d && d.add.length === 1 && d.del.length === 1 && d.chg.length === 1 && d.chg[0].id === 'i1', 'board diff: added, removed, changed (thumbnails / vibes the board makes later are not the AI\'s)', d);
check(JSON.stringify(d.chg[0].before) === '{"x":0,"y":0}' && d.chg[0].gone.join() === 'title', 'only the changed fields are kept (and the ones it added)', d.chg[0]);
check(C.boardWords(d) === 'Added 1, changed 1, removed 1 items', 'plain words', C.boardWords(d));
const now = JSON.parse(JSON.stringify(after));
check(C.touchedItems(now, d) === 0, 'nobody touched them since');
now.find((i) => i.id === 'i4').text = 'neon pink'; // the owner edits the added note
check(C.touchedItems(now, d) === 1, 'the owner changed one of them after: noticed');
const back = C.revertItems(JSON.parse(JSON.stringify(after)), d);
check(JSON.stringify(back.map((i) => C.own(i))) === JSON.stringify(before.map((i) => C.own(i))), 'the inverse puts the items back (place, fields, the removed one where it was)', back.map((i) => i.id));
check(back[1].vibe.moods.length === 2, 'what the board computed meanwhile stays');
check(C.diffItems(before, JSON.parse(JSON.stringify(before))) === null, 'no change: no entry');
const moved = JSON.parse(JSON.stringify(before)); moved.forEach((i, k) => { i.x += 10 * k + 5; });
check(C.boardWords(C.diffItems(before, moved)) === 'Moved 3 items', 'an arrange reads as moved', C.boardWords(C.diffItems(before, moved)));

// ---------- settings ----------
const cfgA = { settings: { notify: true, theme: 'forge' }, agents: [{ id: 'd', name: 'Director', nodesTool: undefined, model: 'opus' }] };
const cfgB = JSON.parse(JSON.stringify(cfgA)); cfgB.settings.notify = false; cfgB.agents[0].nodesTool = false; cfgB.agents.push({ id: 'new' });
const ch = C.diffConfig(cfgA, cfgB);
check(ch.length === 2 && ch.some((c) => c.path.join('.') === 'settings.notify' && c.old === true && c.now === false) && ch.some((c) => c.path.join('.') === 'agents.d.nodesTool' && c.old === undefined && c.now === false), 'settings diff: a setting and an agent\'s option, a new agent is not a setting', ch);
for (const c of ch) C.setPath(cfgB, c.path, c.old);
check(cfgB.settings.notify === true && !('nodesTool' in cfgB.agents[0]), 'the old values go back (unset ones are removed)');
check(C.getPath(cfgB, ['agents', 'd', 'model']) === 'opus' && C.valWords(false) === 'off' && C.valWords(undefined) === 'unset', 'reading a path, plain values');

// ---------- pruning ----------
const big = [];
for (let i = 0; i < C.MAX + 30; i += 1) { const e = C.add(big, { by: 'a', area: 'board', what: `x${i}`, tk: `board:${i}` }, T0 + i); if (i < 20) e.undone = T0 + i + 1; }
check(big.length === C.MAX, `at most ${C.MAX} entries`, big.length);
check(!big.some((e) => e.undone) && big[0].what === 'x30', 'when it\'s full the undone ones go first, then the oldest', big[0].what);
const old = [{ id: 'o', at: T0 - 15 * 864e5, n: 1 }, { id: 'k', at: T0, n: 2 }];
C.prune(old, T0);
check(old.length === 1 && old[0].id === 'k', 'two weeks old: gone');

console.log(`\n${n - fails}/${n} passed`);
if (fails) process.exit(1);
