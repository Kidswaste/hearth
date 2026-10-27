// (round 71, whatsnew71) the tours of rounds 66–70 (trynew71-core.js): every click-first feature of those rounds (and
// the creative session's round-67 Lab tools) has a step; each step is one plain sentence, opens a known place and names
// a real button; no step asks to type a command; finding a tour; progress (done / skipped / later, done stays done); and
// when the one "Since you were last here" card is due.
const assert = require('node:assert/strict');
const C = require('../trynew71-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const OPENS = ['hud', 'show', 'settings', 'map', 'desk', 'sessions', 'railmore', 'lab', 'drawer'];
// the brief's list (rounds 66–70) + the creative session's round 67 (Direction card, moodboard, credits, finish lines)
const FEATURES = ['weekend', 'herepin', 'sessions', 'layers', 'slow', 'errand', 'invite', 'pads', 'ticket', 'leave', 'reference', 'broke', 'photos', 'controller', 'daw', 'metro', 'beforego', 'follow',
  'direction', 'moodboard', 'credits', 'finish'];

test('five themed tours (Paris nights · Sidequest · Music · Help when it breaks · In the Lab), 2–7 steps each', () => {
  assert.deepEqual(C.TOURS.map((t) => t.name), ['Paris nights', 'Sidequest', 'Music', 'Help when it breaks', 'In the Lab']);
  for (const t of C.TOURS) assert.ok(t.steps.length >= 2 && t.steps.length <= 7 && t.icon && t.why, t.id);
  assert.deepEqual(C.ROUNDS, [66, 67, 68, 69, 70]);
});
test('every feature of the list has exactly one step, and every step is one of them', () => {
  const ids = C.STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), [...FEATURES].sort());
  for (const r of C.ROUNDS) assert.ok(C.STEPS.some((s) => s.round === r), `round ${r} has a step`);
});
test('each step: one plain sentence, a place Show me opens, a real button (no command to type)', () => {
  for (const s of C.STEPS) {
    assert.ok(OPENS.includes(s.open), `${s.id}: opens a known place`);
    assert.ok(s.text.length <= 160 && (s.text.match(/[.?!](\s|$)/g) || []).length <= 1, `${s.id}: one short sentence (${s.text.length})`);
    assert.ok(!/(^|\s)\/[a-z]/.test(s.text), `${s.id}: no command in the words`);
    assert.ok(Array.isArray(s.target) && s.target.length && s.target.every((x) => typeof x === 'string' && x.trim()), `${s.id}: a target`);
    assert.ok(!s.fallback || (Array.isArray(s.fallback) && s.fallback.length), `${s.id}: fallback is a list`);
  }
});
test('find: by id, by name, by a feature', () => {
  assert.equal(C.find('nights').id, 'nights');
  assert.equal(C.find('Paris nights').id, 'nights');
  assert.equal(C.find('help').id, 'help');
  assert.equal(C.find('ticket').id, 'nights');
  assert.equal(C.find('controller').id, 'music');
  assert.equal(C.find('credits').id, 'lab');
  assert.equal(C.find(''), null);
  assert.equal(C.find('nothing like it'), null);
  assert.deepEqual(C.forRound(69).map((t) => t.id), ['nights', 'sidequest', 'music']);
  assert.deepEqual(C.forRound(65), []);
});
test('progress: done / skipped / later, done is never taken back by later, other stores cleaned', () => {
  let p = {};
  p = C.mark(p, 'nights', 'later', 1);
  assert.deepEqual(C.queue(p).map((t) => t.id), ['nights', 'sidequest', 'music', 'help', 'lab']);
  p = C.mark(p, 'sidequest', 'later', 2);
  assert.deepEqual(C.queue(p).map((t) => t.id).slice(0, 2), ['nights', 'sidequest']);
  p = C.mark(p, 'nights', 'done', 3);
  p = C.mark(p, 'nights', 'later', 4);
  assert.equal(p.nights.state, 'done');
  p = C.mark(p, 'help', 'skipped', 5);
  assert.deepEqual(C.queue(p).map((t) => t.id), ['sidequest', 'music', 'lab']);
  assert.equal(C.label(p), '1 of 5 tours seen');
  assert.deepEqual(C.queue(p, ['help', 'music']).map((t) => t.id), ['music']);
  assert.deepEqual(C.clean({ nights: { state: 'weird' }, zzz: { state: 'done' }, lab: { state: 'done', at: 'x' } }), { lab: { state: 'done', at: 0 } });
  assert.deepEqual(C.clean(null), {}); assert.deepEqual(C.clean([1]), {});
  assert.ok(!C.allDone(p));
  assert.ok(C.allDone(Object.fromEntries(C.TOURS.map((t) => [t.id, { state: 'done' }]))));
});
test('the one card: due after an update that brought rounds 66–70, once, with the honest count', () => {
  const rounds = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70];
  assert.deepEqual(C.sinceDue({ seen: 65, rounds }), { updates: 5, from: 66, to: 70 });
  assert.equal(C.sinceText(5), 'Since you were last here: 5 updates — take the 1-minute tours?');
  assert.equal(C.sinceText(1), 'Since you were last here: 1 update — take the 1-minute tours?');
  assert.equal(C.sinceDue({ seen: 63, rounds }).updates, 7); // every round he missed counts
  assert.equal(C.sinceDue({ seen: 68, rounds }).updates, 2);
  assert.equal(C.sinceDue({ seen: 70, rounds }), null); // nothing new
  assert.equal(C.sinceDue({ seen: null, rounds }), null); // a first start: nothing to catch up on
  assert.equal(C.sinceDue({ seen: 65, rounds, offered: 'later' }), null); // once
  assert.equal(C.sinceDue({ seen: 65, rounds: [...rounds, 71] }).updates, 6);
  assert.equal(C.sinceDue({ seen: 70, rounds: [...rounds, 71] }), null); // round 71 alone has no tours
  assert.equal(C.sinceDue({ seen: 65, rounds, prog: Object.fromEntries(C.TOURS.map((t) => [t.id, { state: 'done' }])) }), null); // all seen already
});
console.log(`trynew71-test: ${checks} checks passed`);
