#!/usr/bin/env node
// Unit test for "Hearth never loses work" (round 29, safetynet): the session marker (a clean quit vs a killed
// process, the last run's journal kept aside), the journal written safely, a crash loop, and the plans that decide
// what comes back: Lab work as a version only when it isn't on the disk (never over a newer save), drafts never over
// newer text (queued messages back in the box, not the ones already sent), board edits newer than the save (no
// deletes replayed, items without their picture left out), text boxes as notes, the card's order.
//   node dev/safetynet-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../safetynet-core.js');
const M = require('../safetynetmain.js');

let fails = 0;
const check = (ok, label, extra) => { if (!ok) { fails += 1; console.log(`✖ ${label}${extra !== undefined ? ` · ${JSON.stringify(extra)}` : ''}`); } else console.log(`✓ ${label}`); };

(async () => {
  // ---------- the session marker ----------
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-safetynet-'));
  const sdir = path.join(data, 'safetynet');
  let r = M.openSession(data, 1000);
  check(!r.unclean, 'a first start is not an unexpected exit');
  check(JSON.parse(fs.readFileSync(path.join(sdir, 'session.json'), 'utf8')).clean === false, 'the marker says "running" while Hearth runs');
  M.markClean();
  r = M.openSession(data, 2000);
  check(!r.unclean, 'after a clean quit the next start is calm');
  // this run keeps a journal, then the process is killed (no markClean)
  const j1 = { v: 1, at: 2100, entries: { 'draft:a': { k: 'draft', agentId: 'a', chatId: 'c', text: 'hello there', queue: [], at: 2100 } } };
  check(M.keep(j1) === true, 'the journal is accepted');
  check(M.keep({ nope: 1 }) === false, 'a malformed journal is refused');
  await M._flush();
  check(JSON.parse(fs.readFileSync(path.join(sdir, 'journal.json'), 'utf8')).entries['draft:a'].text === 'hello there', 'the journal is on the disk (temp file, flushed, renamed)');
  check(!fs.existsSync(path.join(sdir, 'journal.json.tmp')), 'no temp file is left behind');
  r = M.openSession(data, 3000);
  check(r.unclean?.kind === 'process', 'a killed process is noticed at the next start', r.unclean);
  check(r.journal?.entries?.['draft:a']?.text === 'hello there', 'the killed run\'s journal is handed to the window');
  check(fs.existsSync(path.join(sdir, 'journal-prev.json')) && !fs.existsSync(path.join(sdir, 'journal.json')), 'the killed run\'s journal is kept aside (the new run writes its own)');
  // killed again before the window said done: the kept journal still comes back
  r = M.openSession(data, 4000);
  check(r.unclean && r.journal?.entries?.['draft:a'], 'killed again before restoring: the kept journal still comes back');
  M.markClean();
  r = M.openSession(data, 5000);
  check(!r.unclean && !fs.existsSync(path.join(sdir, 'journal-prev.json')), 'a clean quit after that: nothing is restored twice');
  // the page crashing (main process alive): the page's journal at that moment is what the next page restores
  M.keep({ v: 1, at: 5100, entries: { x: { k: 'field', where: 'AI setup', text: 'abc def', at: 5100 } } });
  M.pageGone('crashed', null);
  const st = M._state();
  check(st.unclean?.kind === 'page' && st.atCrash?.entries?.x && !Object.keys(st.journal.entries).length, 'a page crash: noted, its journal kept for the next page', st.unclean);
  await M._flush();
  fs.rmSync(data, { recursive: true, force: true });

  // crash loop
  check(C.shouldReload([1000, 2000], 3000) && !C.shouldReload([1000, 2000, 2500], 3000) && C.shouldReload([1000, 2000, 2500], 200000), 'the page reloads after a crash, not in a crash loop (3 in 2 minutes)');

  // ---------- the Lab ----------
  const saved = { id: 's1', name: 'Orb', updatedAt: 1000, code: 'a', layers: [{ id: 'main', code: 'let x = 1;', opacity: 1 }, { id: 'L2', code: 'b', visible: true }] };
  const st0 = { layers: [{ id: 'main', code: 'let x = 1;', opacity: 1 }, { id: 'L2', code: 'b', visible: true }], vals: {}, sel: 'main', palette: null };
  check(C.labPlan({ k: 'lab', id: 's1', at: 2000, state: st0 }, saved).action === 'none', 'the Lab as saved: nothing to restore');
  let p = C.labPlan({ k: 'lab', id: 's1', at: 2000, state: { ...st0, layers: [{ id: 'main', code: 'let x = 2;', opacity: 1 }, st0.layers[1]] } }, saved);
  check(p.action === 'version' && p.what.join() === 'code', 'unsaved code: a version', p);
  p = C.labPlan({ k: 'lab', id: 's1', at: 2000, state: { ...st0, vals: { main: { 'tweak.size': 3 } } } }, saved);
  check(p.action === 'version' && p.what.join() === 'sliders', 'slider moves not saved: a version', p);
  p = C.labPlan({ k: 'lab', id: 's1', at: 2000, state: { ...st0, layers: [{ ...st0.layers[0], keys: { opacity: [{ t: 0, v: 1 }] } }, { ...st0.layers[1], visible: false }] } }, saved);
  check(p.action === 'version' && p.what.includes('keyframes') && p.what.includes('layers'), 'keyframes and layer changes: a version', p);
  p = C.labPlan({ k: 'lab', id: 's1', at: 2000, state: { ...st0, layers: [st0.layers[0]] } }, saved);
  check(p.what.includes('layers'), 'a layer removed counts as a layer change', p);
  check(C.labPlan({ k: 'lab', id: 's1', at: 300, state: { ...st0, vals: { main: { a: 1 } } } }, saved).action === 'none', 'saved later than the journal: newer data wins');
  check(C.labPlan({ k: 'lab', id: 's1', at: 2000, state: st0 }, null).action === 'gone', 'a deleted scene isn\'t brought back');
  check(C.labPlan({ k: 'lab', id: 'old', at: 2000, state: { layers: [{ id: 'main', code: 'z' }], vals: {} } }, { id: 'old', code: 'z', updatedAt: 1 }).action === 'none', 'an old sketch without layers compares as one layer');
  check(C.labWords(['code', 'sliders']) === 'code and slider moves', 'plain words for what came back');

  // ---------- drafts ----------
  let d = C.draftPlan({ text: 'Make the orb pulse on the kick', queue: [] }, 'Make the orb pul', []);
  check(d.text === 'Make the orb pulse on the kick' && d.came === 'restored', 'a draft cut short comes back whole', d);
  d = C.draftPlan({ text: 'hello', queue: [] }, 'hello', []);
  check(d.text === null && d.came === 'kept', 'a draft already in the box: listed as still there, not written again', d);
  d = C.draftPlan({ text: 'old words', queue: [] }, 'something newer', []);
  check(d.text === null && d.came === 'none', 'a box holding other, newer text keeps it', d);
  d = C.draftPlan({ text: 'sent already', queue: [] }, '', ['sent already']);
  check(d.came === 'none', 'a draft that was sent doesn\'t come back');
  d = C.draftPlan({ text: '', queue: ['one', 'two', 'sent one'] }, '', ['sent one']);
  check(d.text === 'one\n\ntwo' && d.queued === 2, 'queued messages come back in the box (not the one sent)', d);
  d = C.draftPlan({ text: 'draft', queue: ['q'] }, 'draft', []);
  check(d.text === 'draft\n\nq' && d.came === 'restored', 'queued messages join the draft', d);

  // ---------- the board ----------
  const big = `data:image/jpeg;base64,${'A'.repeat(C.BIG + 10)}`;
  const s1 = C.stripItem({ id: 'i1', type: 'image', src: '/p.png', tiny: big });
  check(!s1.tiny && s1._cut?.[0] === 'tiny' && s1.src === '/p.png', 'big inline pictures stay out of the journal');
  const board = { id: 'b', updated: 100, items: [{ id: 'i1', type: 'image', src: '/p.png', tiny: big, x: 0 }, { id: 'n1', type: 'note', text: 'old' }, { id: 'gone', type: 'note', text: 'x' }] };
  const ent = { k: 'board', id: 'b', updated: 200, items: [{ ...s1, x: 50 }, { id: 'n1', type: 'note', text: 'new words' }, { id: 'n2', type: 'note', text: 'added' }, C.stripItem({ id: 'pic', type: 'image', src: big })] };
  let b = C.boardPlan(ent, board);
  check(b.action === 'merge' && b.changed === 2 && b.added === 1, 'board edits newer than the save come back', b);
  check(b.items.find((x) => x.id === 'i1').tiny === big && b.items.find((x) => x.id === 'i1').x === 50, 'a moved picture keeps its picture from the disk');
  check(b.items.some((x) => x.id === 'gone') && !b.items.some((x) => x.id === 'pic'), 'deletes aren\'t replayed; an item without its picture isn\'t added');
  check(C.boardPlan(ent, { ...board, updated: 300 }).action === 'none', 'a board saved after the journal: newer data wins');
  check(C.boardPlan(ent, null).action === 'gone', 'a deleted board isn\'t brought back');
  check(C.boardPlan({ ...ent, items: board.items.map(C.stripItem) }, board).action === 'none', 'the same items: nothing to put back');

  // ---------- text boxes ----------
  const f = C.fieldPlan({ where: 'Personality', text: 'A blunt art director' });
  check(f && f.title === 'Recovered: Personality' && f.text.includes('A blunt art director'), 'a text box becomes a note', f);
  check(C.fieldPlan({ where: 'x', text: 'A blunt art director' }, [{ text: f.text }]) === null, 'already a note (a reload during the restore): not twice');
  check(C.fieldPlan({ where: 'x', text: ' a ' }) === null, 'two letters aren\'t work');

  // ---------- the journal ----------
  const order = C.entries({ entries: { f: { k: 'field', at: 9 }, b: { k: 'board', updated: 5 }, d1: { k: 'draft', at: 1 }, d2: { k: 'draft', at: 3 }, l: { k: 'lab', at: 2 }, z: { k: 'junk' } } }).map((e) => e.key);
  check(order.join() === 'l,d2,d1,b,f', 'the card lists Lab, drafts (newest first), boards, text boxes; unknown entries are left out', order);
  check(C.entries(null).length === 0 && !C.valid({}) && C.valid(C.empty()), 'an empty or broken journal restores nothing');
  check(C.start({ clean: false, started: 5, beat: 7 }, 10).unclean.at === 7 && C.start(null, 10).marker.clean === false, 'the marker: when the last run was last seen, a new "running" one');

  console.log(fails ? `FAIL ${fails}` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
