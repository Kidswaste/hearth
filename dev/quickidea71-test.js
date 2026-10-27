// (round 71, quickidea71) 💡 Quick idea, Node only: the routing (where an idea goes, the last-used place Enter saves to,
// Move to… / Delete / Restore / Empty the Trash, what is "pending" for the main window to put in place), the store (a
// damaged file throws and is never read as empty, damaged rows are dropped, the caps), Sidequest's saved idea through
// Codex's REAL QuestCore.saveIdea, a project's notes line (added, taken out exactly, the 4,000-character limit), the
// recent projects, the WAV encoder / checker, the key comparison, /idea's words, and the main process's side
// (quickideamain.js) on a throwaway folder with a fake store: saves with and without a voice memo, a store that can't be
// read refuses and leaves no file behind, a project that's gone, the Trash and its voice memos.
//   node dev/quickidea71-test.js
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const C = require('../quickidea-core');
const QC = require('../tools/quest-core');
let checks = 0;
const pending = [];
const test = (name, fn) => { const r = fn(); if (r && typeof r.then === 'function') { pending.push(r.then(() => { checks++; console.log('✓ ' + name); })); return; } checks++; console.log('✓ ' + name); };
const NOW = Date.parse('2026-10-27T09:30:00Z');

// ---------- routing ----------
test('a new idea: Music and Later are in place at once; Quest and Project wait for the main window', () => {
  const s = C.empty();
  const a = C.add(s, C.make({ text: 'a 7/8 groove with field recordings', to: { dest: 'music' } }, NOW));
  const b = C.add(s, C.make({ text: 'call the venue about the open mic', to: { dest: 'later' } }, NOW + 1));
  const q = C.add(s, C.make({ text: 'sunrise walk', to: { dest: 'quest' } }, NOW + 2));
  const p = C.add(s, C.make({ text: 'boss intro', to: { dest: 'project', projectId: 'pj-clink', projectName: 'Clink' } }, NOW + 3));
  assert.ok(C.placedOk(a) && C.placedOk(b));
  assert.deepEqual(C.pending(s).map((i) => i.id).sort(), [q.id, p.id].sort());
  assert.equal(s.ideas[0].id, p.id, 'newest first');
  assert.deepEqual(s.last, { dest: 'project', projectId: 'pj-clink', projectName: 'Clink' }, 'Enter saves to the last place used');
  assert.equal(C.counts(s).music, 1); assert.equal(C.counts(s).pending, 2);
});
test('targets: an unknown place or a project without an id is Later; nothing without words or a memo', () => {
  assert.deepEqual(C.target({ dest: 'nowhere' }), { dest: 'later' });
  assert.deepEqual(C.target({ dest: 'project' }), { dest: 'later' });
  assert.deepEqual(C.target(null), { dest: 'later' });
  assert.throws(() => C.make({ text: '   ', to: { dest: 'music' } }), /Type an idea/);
  const memoOnly = C.make({ text: '', to: { dest: 'music' }, memo: { file: '/x/Idea.wav', seconds: 4.2 } }, NOW);
  assert.match(C.title(memoOnly), /^Voice memo · \d\d:\d\d$/);
  assert.equal(C.whereWords({ dest: 'quest' }), 'Sidequest › Saved ideas');
  assert.equal(C.whereWords({ dest: 'project', projectId: 'x', projectName: 'Clink' }), 'Clink’s notes');
  assert.equal(C.label({ dest: 'music' }), '🎵 Music');
});
test('Move to…: Later → Music is in place at once; → Quest waits; Quest → Later keeps the old place until taken out', () => {
  const s = C.empty(); const i = C.add(s, C.make({ text: 'idea', to: { dest: 'later' } }, NOW));
  C.move(s, i.id, { dest: 'music' }); assert.ok(C.placedOk(i)); assert.equal(i.placed.dest, 'music');
  C.move(s, i.id, { dest: 'quest' }); assert.ok(!C.placedOk(i)); assert.equal(i.placed.dest, 'music');
  C.setPlaced(s, i.id, { dest: 'quest', questIdea: 'idea-1' }); assert.ok(C.placedOk(i));
  C.move(s, i.id, { dest: 'later' }); assert.equal(i.placed.dest, 'quest', 'the journal copy is taken out first by the main window'); assert.ok(!C.placedOk(i));
  C.setPlaced(s, i.id, null); C.move(s, i.id, { dest: 'later' }); assert.ok(C.placedOk(i));
  C.move(s, i.id, { dest: 'project', projectId: 'a', projectName: 'A' }); C.setPlaced(s, i.id, { dest: 'project', projectId: 'a', line: 'x' }); assert.ok(C.placedOk(i));
  C.move(s, i.id, { dest: 'project', projectId: 'b', projectName: 'B' }); assert.ok(!C.placedOk(i), 'another project is another place');
  assert.throws(() => C.move(s, 'qi-nope', { dest: 'music' }), /isn’t in the inbox/);
});
test('Delete → the inbox’s Trash; Restore puts it back (and back where it went); 30 days, then out', () => {
  const s = C.empty(); const i = C.add(s, C.make({ text: 'idea', to: { dest: 'quest' } }, NOW)); C.setPlaced(s, i.id, { dest: 'quest', questIdea: 'q1' });
  C.trash(s, i.id, NOW + 10); assert.equal(s.ideas.length, 0); assert.equal(s.trash[0].deletedAt, NOW + 10);
  const back = C.restore(s, i.id); assert.equal(back.placed, null, 'a restored quest idea is put in the journal again'); assert.equal(s.ideas.length, 1); assert.equal(s.trash.length, 0);
  const j = C.add(s, C.make({ text: 'later one', to: { dest: 'later' } }, NOW)); C.trash(s, j.id, NOW); assert.ok(C.placedOk(C.restore(s, j.id)));
  C.trash(s, i.id, NOW); C.trash(s, j.id, NOW + 29 * 864e5);
  assert.deepEqual(C.purge(s, NOW + 31 * 864e5).map((x) => x.id), [i.id]); assert.equal(s.trash.length, 1);
  assert.equal(C.purge(s, NOW, true).length, 1); assert.equal(s.trash.length, 0);
  assert.throws(() => C.restore(s, 'qi-x'), /Trash/);
});
test('caps: 500 ideas (a clear message, nothing dropped), 100 in the Trash (the oldest leave)', () => {
  const s = C.empty(); for (let n = 0; n < C.MAX_IDEAS; n++) C.add(s, C.make({ text: `i${n}`, to: { dest: 'later' } }, NOW + n));
  assert.throws(() => C.add(s, C.make({ text: 'one more', to: { dest: 'later' } }, NOW)), /holds 500/);
  let gone = []; for (let n = 0; n < 101; n++) gone = gone.concat(C.trash(s, s.ideas[0].id, NOW + n).gone);
  assert.equal(s.trash.length, C.MAX_TRASH); assert.equal(gone.length, 1);
});

// ---------- the store ----------
test('validate: a damaged FILE throws (never "empty"); a damaged ROW is dropped, never the list', () => {
  assert.deepEqual(C.validate(null), C.empty());
  for (const bad of [[], 'x', { v: 2, ideas: [] }, { v: 1 }, { v: 1, ideas: {} }]) assert.throws(() => C.validate(bad), /damaged/);
  const s = C.empty(); const a = C.add(s, C.make({ text: 'keep me', to: { dest: 'music' }, memo: { file: '/d/Idea.wav', seconds: 3 } }, NOW));
  const raw = JSON.parse(JSON.stringify(s)); raw.ideas.push({ id: 'bad id!', text: 'x', at: NOW }, { id: 'qi-ok2', at: -1, text: 'x' }, { id: 'qi-empty', at: NOW, text: '  ' }, { ...raw.ideas[0] }, null, 42);
  raw.ideas[0].memo.file = '/d/not-audio.exe'; raw.ideas.push({ id: 'qi-memo', at: NOW, text: 'memo kept', memo: { file: '/d/x.wav', seconds: 9999 } });
  const v = C.validate(raw);
  assert.deepEqual(v.ideas.map((i) => i.id), [a.id, 'qi-memo'], 'bad ids, times, empties and duplicates dropped');
  assert.equal(v.ideas[0].memo, undefined, 'only a .wav is a memo'); assert.ok(v.ideas[1].memo.seconds <= C.MAX_MEMO_S + 5);
  assert.deepEqual(v.last, { dest: 'music' });
});
test('text is cleaned: control characters, Windows line ends, 2,000 characters', () => {
  assert.equal(C.clean('a\r\nb\u0007\n\n\n\nc'), 'a\nb\n\nc');
  assert.equal(C.clean('x'.repeat(5000)).length, 2000);
  assert.equal(C.title({ text: '\n\n  first line here  \nsecond', at: NOW }), 'first line here');
  assert.ok(C.title({ text: 'word '.repeat(60), at: NOW }, 40).endsWith('…'));
});

// ---------- Sidequest (Codex's real QuestCore) ----------
test('✦ Quest: a saved idea QuestCore.saveIdea accepts, with a path from the words; the journal still validates', () => {
  const s = QC.validate(QC.initial());
  const cases = [['make a loop from kitchen sounds\nsave eight bars', 'music'], ['a shader with the cover palette', 'visual'], ['Clink: a boss that copies the player', 'game'], ['sunrise walk to Buttes-Chaumont', 'life']];
  for (const [text, path] of cases) {
    const q = C.questIdea(C.make({ text, to: { dest: 'quest' } }, NOW)); assert.equal(q.path, path, text);
    const idea = QC.saveIdea(s, q); assert.equal(idea.title, q.title); assert.ok([5, 15, 30].includes(idea.minutes));
  }
  assert.equal(s.ideas[0].goal, 'save eight bars', 'the second line is the finish line');
  const memo = C.questIdea(C.make({ text: '', to: { dest: 'quest' }, memo: { file: '/d/Idea.wav', seconds: 6 } }, NOW));
  QC.saveIdea(s, memo); assert.equal(memo.path, 'music'); assert.match(memo.goal, /voice memo/);
  const long = C.questIdea(C.make({ text: 'x'.repeat(1900), to: { dest: 'quest' } }, NOW)); assert.ok(long.title.length <= 150 && long.goal.length <= 500); QC.saveIdea(s, long);
  QC.validate(s);
  // taken out again on a Move to… (only while it's still an unused idea)
  const k = s.ideas[0]; s.ideas = s.ideas.filter((x) => x !== k); QC.validate(s);
});

// ---------- a project's notes ----------
test('📁 Project: one line added under the notes, taken out exactly on a Move to…, 4,000 characters', () => {
  const i = C.make({ text: 'boss intro\nwith the drums from Tuesday', to: { dest: 'project', projectId: 'p', projectName: 'Clink' } }, NOW);
  const line = C.noteLine(i); assert.match(line, /^💡 boss intro · with the drums from Tuesday · \d+ Oct$/);
  const notes = C.addNote('My game.\n\n', line); assert.equal(notes, `My game.\n${line}`);
  assert.equal(C.addNote('', line), line);
  const twice = C.addNote(notes, 'other'); const r = C.removeNote(twice, line); assert.ok(r.removed); assert.equal(r.notes, 'My game.\nother');
  assert.equal(C.removeNote('edited by hand', line).removed, false, 'a line the owner changed stays');
  assert.throws(() => C.addNote('x'.repeat(3990), line), /notes are full/);
  assert.match(C.noteLine(C.make({ text: '', to: { dest: 'project', projectId: 'p' }, memo: { file: '/a.wav', seconds: 2 } }, NOW)), /voice memo in 💡 Ideas/);
});
test('recent projects: the ones touched last, not archived, six at most', () => {
  const list = [{ id: 'a', name: 'Old', updated: 1 }, { id: 'b', name: 'Clink', updated: 50, opened: 90 }, { id: 'c', name: 'Gone', status: 'archived', updated: 99 }, { id: 'd', name: 'Intro video', updated: 80 }, null, { name: 'no id' }];
  for (let n = 0; n < 10; n++) list.push({ id: `x${n}`, name: `P${n}`, updated: 10 + n });
  const r = C.recentProjects({ v: 1, list }); assert.equal(r.length, 6); assert.deepEqual(r.slice(0, 2).map((p) => p.name), ['Clink', 'Intro video']); assert.ok(!r.some((p) => p.id === 'c'));
  assert.deepEqual(C.recentProjects(null), []);
});

// ---------- the voice memo ----------
test('WAV: 16-bit mono PCM made from Web Audio samples, read back; anything else is refused', () => {
  const rate = 48000, chunks = [new Float32Array(4096).map((_, k) => Math.sin(k / 10)), new Float32Array(4096).fill(2), new Float32Array(100).fill(-2)];
  const w = C.encodeWav(chunks, rate); assert.equal(w.length, 44 + (4096 * 2 + 100) * 2);
  const v = new DataView(w.buffer); assert.equal(v.getInt16(44 + 4096 * 2, true), 0x7fff, 'clipped high'); assert.equal(v.getInt16(w.length - 2, true), -0x8000, 'clipped low');
  const info = C.checkWav(w); assert.equal(info.rate, rate); assert.equal(info.channels, 1); assert.ok(Math.abs(info.seconds - 0.2) < 0.05);
  assert.throws(() => C.checkWav(new Uint8Array(10)), /empty/);
  const bad = w.slice(); bad[8] = 0x58; assert.throws(() => C.checkWav(bad), /isn’t a WAV/);
  assert.throws(() => C.checkWav('RIFF'), /empty/);
  const long = C.encodeWav([new Float32Array(8000 * 306)], 8000); assert.throws(() => C.checkWav(long), /5 minutes/);
  assert.equal(C.memoName(new Date(2026, 9, 27, 14, 5, 3)), 'Idea 2026-10-27 14.05.03.wav'); assert.equal(C.memoName(new Date(2026, 9, 27, 14, 5, 3), 2), 'Idea 2026-10-27 14.05.03 2.wav');
});
test('the key: Control+Alt+I = ctrl+alt+i = Alt+Ctrl+I; it can’t be the show / hide key', () => {
  assert.ok(C.sameKey('Control+Alt+I', 'alt+ctrl+i')); assert.ok(C.sameKey('CmdOrCtrl+Alt+I', 'Control+Option+I'));
  assert.ok(!C.sameKey('Control+Alt+I', 'Control+Alt+H')); assert.ok(!C.sameKey('', '')); assert.equal(C.DEFAULT_KEY, 'Control+Alt+I');
});
test('/idea words: "quest: …", "music › …", plain words go to Later', () => {
  assert.deepEqual(C.parseWords('quest: a sunrise walk'), { dest: 'quest', text: 'a sunrise walk' });
  assert.deepEqual(C.parseWords('Music › bass idea'), { dest: 'music', text: 'bass idea' });
  assert.deepEqual(C.parseWords('just words: with a colon'), { dest: null, text: 'just words: with a colon' });
});

// ---------- the main process's side (quickideamain.js) on a throwaway folder ----------
test('main side: save (words, a voice memo, a project), the store it writes, refusals, Move / Delete / Restore / Empty the Trash', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qi71-'));
  process.env.HEARTH_TEST_SAVE_DIR = path.join(tmp, 'saves');
  const sent = [];
  const realLoad = Module._load;
  Module._load = function (req, ...rest) { if (req === 'electron') return { BrowserWindow: function () { throw Error('no windows here'); }, screen: {}, app: { on() {} }, shell: { trashItem: async () => {} }, nativeTheme: {} }; return realLoad.call(this, req, ...rest); };
  const M = require('../quickideamain');
  Module._load = realLoad;
  const kv = new Map(); let unreadable = false;
  kv.set('projects', { v: 1, list: [{ id: 'pj-clink', name: 'Clink', updated: 5 }] });
  const store = { getKVStatus: async (name) => (unreadable && name === C.KEY ? { state: 'unreadable' } : kv.has(name) ? { state: 'ok', value: JSON.parse(JSON.stringify(kv.get(name))) } : { state: 'missing' }), setKV: async (name, v) => { kv.set(name, JSON.parse(JSON.stringify(v))); } };
  M.init({ store, dataDir: tmp, getWin: () => null, send: (ch, d) => sent.push([ch, d]), keyInfo: () => ({ key: 'Control+Alt+I', ok: true }) });
  const ok = async (a) => { const r = await M.op(a); assert.ok(r.ok, `${a.op}: ${r.error}`); return r.value; };
  const info = await ok({ op: 'info' }); assert.deepEqual(info.last, { dest: 'later' }); assert.deepEqual(info.projects, [{ id: 'pj-clink', name: 'Clink' }]);
  const s1 = await ok({ op: 'save', text: 'later idea', to: { dest: 'later' } }); assert.equal(s1.where, '💡 Ideas');
  assert.ok(!sent.some(([ch]) => ch === 'tray:ideas'), 'nothing to put in place: the main window isn’t asked');
  const wav = C.encodeWav([new Float32Array(48000).fill(0.1)], 48000);
  const s2 = await ok({ op: 'save', text: '', to: { dest: 'music' }, wav }); const memo = s2.idea.memo;
  assert.ok(memo && fs.existsSync(memo.file) && memo.file.startsWith(path.join(tmp, 'quick-ideas')) && /Idea .*\.wav$/.test(memo.file)); assert.equal(memo.seconds, 1);
  assert.ok(!fs.readdirSync(path.join(tmp, 'quick-ideas')).some((f) => f.endsWith('.part')));
  const s3 = await ok({ op: 'save', text: 'boss intro', to: { dest: 'project', projectId: 'pj-clink' } }); assert.equal(s3.idea.to.projectName, 'Clink');
  assert.ok(sent.some(([ch]) => ch === 'tray:ideas'), 'a project idea: the main window is asked to put it in place');
  assert.equal((await M.op({ op: 'save', text: 'x', to: { dest: 'project', projectId: 'pj-gone' } })).ok, false);
  assert.equal((await M.op({ op: 'save', text: '  ', to: { dest: 'later' } })).ok, false);
  assert.equal((await M.op({ op: 'save', text: 'x', to: { dest: 'later' }, wav: new Uint8Array(60) })).ok, false, 'not a WAV');
  let st = await ok({ op: 'list' }); assert.equal(st.ideas.length, 3); assert.deepEqual(st.last, { dest: 'project', projectId: 'pj-clink', projectName: 'Clink' }); assert.equal(st.counts.pending, 1);
  // a store that can't be read: nothing saved, no memo file left behind
  unreadable = true; const before = fs.readdirSync(path.join(tmp, 'quick-ideas')).length;
  const r = await M.op({ op: 'save', text: 'x', to: { dest: 'music' }, wav }); assert.equal(r.ok, false); assert.match(r.error, /couldn’t be read/);
  assert.equal(fs.readdirSync(path.join(tmp, 'quick-ideas')).length, before); assert.equal((await M.op({ op: 'list' })).ok, false);
  unreadable = false; assert.equal(JSON.parse(JSON.stringify(kv.get(C.KEY))).ideas.length, 3, 'the store untouched');
  // placed / move / trash / restore / empty
  await ok({ op: 'placed', id: s3.idea.id, placed: { dest: 'project', projectId: 'pj-clink', line: '💡 boss intro' } });
  st = await ok({ op: 'list' }); assert.equal(st.counts.pending, 0);
  await ok({ op: 'move', id: s1.idea.id, to: { dest: 'quest' } }); st = await ok({ op: 'list' }); assert.equal(st.counts.pending, 1);
  await ok({ op: 'trash', id: s2.idea.id }); await ok({ op: 'restore', id: s2.idea.id }); await ok({ op: 'trash', id: s2.idea.id });
  assert.ok(fs.existsSync(memo.file), 'a deleted idea keeps its memo while it is in the inbox’s Trash');
  const e = await ok({ op: 'empty-trash' }); assert.equal(e.n, 1); assert.equal(e.memos, 1);
  assert.ok(!fs.existsSync(memo.file)); assert.equal(fs.readdirSync(path.join(process.env.HEARTH_TEST_SAVE_DIR, 'quickidea-trash')).length, 1, 'the memo went to the Trash (a check run: its own folder), not deleted');
  assert.ok(!M._isOurs('/etc/passwd') && !M._isOurs(path.join(tmp, 'quick-ideas', '..', 'x.wav')) && M._isOurs(path.join(tmp, 'quick-ideas', 'a.wav')));
  assert.equal((await M.op({ op: 'nope' })).ok, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

Promise.all(pending).then(() => console.log(`quickidea71-test: ${checks} checks passed`)).catch((err) => { console.error('✖', err); process.exit(1); });
