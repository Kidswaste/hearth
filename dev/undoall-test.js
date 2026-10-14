#!/usr/bin/env node
// Unit test for the app's change log (undoall-core.js, round 41): adding, merging a quick second change, back to the
// start = no entry, the next to undo / redo (a new change closes redo), pruning; config diffs of settings / AIs / the
// look, putting old / new values back, "changed again since", adding an AI left alone; the plain words; switches;
// chat meta patches.
//   node dev/undoall-test.js
const C = require('../undoall-core.js');
let fails = 0; let n = 0;
const check = (ok, label, extra) => { n += 1; if (!ok) { fails += 1; console.log(`✖ ${label}${extra !== undefined ? ` · ${JSON.stringify(extra)}` : ''}`); } else console.log(`✓ ${label}`); };
const T0 = 1_800_000_000_000;

// ---------- same ----------
check(C.same({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }) && !C.same({ a: 1 }, { a: 2 }), 'same: data equality, key order ignored');
check(C.same({ a: 1, b: undefined }, { a: 1 }) && C.same(undefined, null) && !C.same(false, undefined) && !C.same([], {}), 'same: a missing key = undefined; false is a value');

// ---------- the log ----------
let L = C.makeLog();
const mergeSame = (top, e) => (C.same(top.u.was, e.u.now) ? null : { u: { ...top.u, now: e.u.now }, label: e.label });
const a = C.add(L, { kind: 'switch', key: 'switch:chime', label: 'A', u: { was: false, now: true } }, T0);
const b = C.add(L, { kind: 'chat-delete', key: 'chat:1', label: 'B', u: { id: '1' } }, T0 + 5000);
check(L.list.length === 2 && a.id !== b.id && b.n > a.n, 'add: ids and a running order');
check(C.nextUndo(L) === b, 'next to undo: the newest');
C.markUndone(L, b, T0 + 6000);
check(C.nextUndo(L) === a && C.nextRedo(L) === b && C.canRedo(L, b), 'after an undo: the one before is next, the undone one can be redone');
C.markRedone(L, b);
check(!b.undone && C.nextUndo(L) === b && !C.nextRedo(L), 'redo: back on top, nothing more to redo');
C.markUndone(L, b, T0 + 7000);
C.add(L, { kind: 'config', key: 'settings.notify', label: 'C', u: {} }, T0 + 8000);
check(!C.nextRedo(L) && !C.canRedo(L, b) && b.undone, 'a new change closes redo (the undone one stays listed)');
const cant = C.add(L, { kind: 'config', key: 'agents.x', label: 'D', u: {}, cant: 'no' }, T0 + 9000);
check(C.nextUndo(L)?.label === 'C' && cant.cant, 'what can\'t be undone is skipped by "undo last"');
check(C.nextUndo(L, (e) => e.label === 'C') === a, 'skip(e): leave some aside (a failed one)');

// merging: a quick second change to the same thing
L = C.makeLog();
C.add(L, { kind: 'switch', key: 'switch:chime', label: 'On', u: { was: false, now: true } }, T0, mergeSame);
C.add(L, { kind: 'switch', key: 'switch:chime', label: 'Off', u: { was: true, now: false } }, T0 + 800, mergeSame);
check(L.list.length === 0, 'on then off within a moment: back to the start, no entry');
C.add(L, { kind: 'switch', key: 'switch:mm', label: 'auto→on', u: { was: 'auto', now: 'on' } }, T0, mergeSame);
C.add(L, { kind: 'switch', key: 'switch:mm', label: 'on→off', u: { was: 'on', now: 'off' } }, T0 + 1000, mergeSame);
check(L.list.length === 1 && L.list[0].u.was === 'auto' && L.list[0].u.now === 'off' && L.list[0].label === 'on→off', 'quick second change: one entry, the first "before", the last "after"', L.list[0]);
C.add(L, { kind: 'switch', key: 'switch:mm', label: 'later', u: { was: 'off', now: 'on' } }, T0 + 1000 + C.MERGE_MS + 10, mergeSame);
check(L.list.length === 2, 'later change: its own entry');
C.markUndone(L, L.list[1], T0 + 9000);
C.add(L, { kind: 'switch', key: 'switch:mm', label: 'again', u: { was: 'off', now: 'auto' } }, T0 + 9100, mergeSame);
check(L.list.length === 3, 'never merges into an undone entry');

// pruning
L = C.makeLog();
for (let i = 0; i < C.CAP + 15; i += 1) C.add(L, { kind: 'switch', key: `k${i}`, label: `${i}`, u: {} }, T0 + i);
check(L.list.length === C.CAP && L.list[0].label === '15', 'keeps the newest entries (cap)');
C.add(L, { kind: 'switch', key: 'late', label: 'late', u: {} }, T0 + C.MAX_AGE + 1000);
check(L.list.length === 1 && L.list[0].label === 'late', 'a week old: gone');
const back = C.makeLog(JSON.parse(JSON.stringify(C.toJSON(L))));
check(back.list.length === 1 && back.seq === L.list[0].n, 'saved and loaded again (the running order goes on)');

// ---------- config ----------
const cfg = {
  settings: { notify: true, autoBackupDays: 7, lastCheckAt: 1 },
  theme: { preset: 'forgeheart' },
  agents: [
    { id: 'claude', name: 'Claude', engine: 'claude', boardTools: true, instructions: [{ text: 'Be brief', on: true }] },
    { id: 'astra', name: 'Astra', engine: 'codex' },
    { id: 'dir', name: 'Three Director', engine: 'claude', dock: 'three' },
  ],
  layout: { gridColumns: 2 },
};
const s0 = C.snapshot(cfg);
const live = JSON.parse(JSON.stringify(cfg));
live.agents[0].boardTools = undefined; delete live.agents[0].boardTools;
live.settings.lastCheckAt = 99; // bookkeeping: never a change
live.layout.gridColumns = 3; // the layout: not watched
let ch = C.diffConfig(s0, C.snapshot(live));
const names = { agent: (id) => live.agents.find((x) => x.id === id) };
check(ch.length === 1 && ch[0].path.join('.') === 'agents.claude.boardTools' && ch[0].old === true && ch[0].now === undefined, 'diff: one AI row turned off (bookkeeping and layout left out)', ch);
check(C.configWords(ch, names) === 'Turned off Mood board for Claude', 'words: "Turned off Mood board for Claude"', C.configWords(ch, names));
const liveAgent = live.agents[0];
C.applyConfig(live, ch, 'old');
check(live.agents[0] === liveAgent && live.agents[0].boardTools === true, 'undo: the old value back, in the same agent object');
check(!C.movedSince(live, ch, 'old').length && C.movedSince(live, ch, 'now').length === 1, 'changed-since checks both ways');
C.applyConfig(live, ch, 'now');
check(!('boardTools' in live.agents[0]), 'redo: unset again (the key goes)');

// settings + the look + instructions + several at once
const l2 = JSON.parse(JSON.stringify(cfg));
l2.settings.notify = false; l2.theme.preset = 'midnight'; l2.agents[0].instructions = [{ text: 'Be brief', on: true }, { text: 'Always give me 9:16 versions', on: true }];
ch = C.diffConfig(s0, C.snapshot(l2));
check(ch.length === 3, 'three changes found', ch.map((c) => c.path.join('.')));
const w = ch.map((c) => C.changeWords(c, names));
check(w.includes('Turned off reply notifications') && w.includes('Changed the look to midnight') && w.includes('Added an instruction for Claude: “Always give me 9:16 versions”'), 'words: a setting, the look, an instruction added', w);
check(/\(\+2 more\)$/.test(C.configWords(ch, names)), 'several at once: the first + "(+2 more)"');
check(C.instructionWords('Claude', [{ text: 'A', on: true }], [{ text: 'A', on: false }]) === 'Paused an instruction for Claude: “A”', 'words: an instruction paused');
check(C.instructionWords('Claude', [{ text: 'A' }, { text: 'B' }], [{ text: 'A' }]) === 'Removed an instruction from Claude: “B”', 'words: an instruction removed');
check(C.changeWords({ path: ['agents', 'claude', 'systemPrompt'], old: '', now: 'Blunt' }, names) === 'Changed Claude\'s personality', 'words: personality');
check(C.changeWords({ path: ['agents', 'claude', 'fileAccess'], old: undefined, now: { level: 'read' } }, names) === 'Changed what Claude can reach on this computer', 'words: files access');
check(C.changeWords({ path: ['agents', 'claude', 'effort'], old: undefined, now: 'high' }, names) === 'Claude thinks: Deep', 'words: how hard it thinks');
check(C.changeWords({ path: ['agents', 'astra', 'chatTools'], old: undefined, now: true }, names) === 'Turned on Your chats and Hearth for Astra'
  && C.changeWords({ path: ['agents', 'claude', 'chatTools'], old: undefined, now: false }, names) === 'Turned off Your chats and Hearth for Claude', 'words: "on" follows each engine\'s default');
check(C.changeWords({ path: ['agents', 'claude', 'autoMemory'], old: false, now: undefined }, names) === 'Turned on memory for Claude', 'words: unset = on for rows that are on by default');

// an AI removed / added
const l3 = JSON.parse(JSON.stringify(cfg));
const gone = l3.agents.splice(1, 1)[0];
ch = C.diffConfig(s0, C.snapshot(l3));
check(ch.length === 1 && ch[0].path.length === 2 && ch[0].idx === 1 && C.configWords(ch, names) === 'Removed the AI “Astra”' && !C.configCant(ch), 'an AI removed: one change, can be undone', ch);
C.applyConfig(l3, ch, 'old');
check(l3.agents[1].id === 'astra' && l3.agents[1].name === gone.name, 'undo: it\'s back at its place');
const l4 = JSON.parse(JSON.stringify(cfg));
l4.agents.push({ id: 'new', name: 'Helper' });
ch = C.diffConfig(s0, C.snapshot(l4));
check(C.configWords(ch, names) === 'Added the AI “Helper”' && /isn't taken back/.test(C.configCant(ch) || ''), 'an AI added: said plainly, not undone');

// merging config changes
const m1 = [{ path: ['settings', 'notify'], old: true, now: false }];
const m2 = [{ path: ['settings', 'notify'], old: false, now: true }];
check(C.mergeConfig(m1, m2) === null, 'config merge: back to the start = nothing');
const m3 = C.mergeConfig([{ path: ['agents', 'claude', 'systemPrompt'], old: '', now: 'Bl' }], [{ path: ['agents', 'claude', 'systemPrompt'], old: 'Bl', now: 'Blunt' }]);
check(m3.length === 1 && m3[0].old === '' && m3[0].now === 'Blunt', 'config merge: typed in two goes = one change');
check(C.keyOf([{ path: ['b', 'x'] }, { path: ['a', 'y'] }]) === 'a.y|b.x', 'key: the paths, sorted');

// ---------- switches, chat meta ----------
check(C.switchArg({ on: 'auto on', off: 'auto off' }, true) === 'auto on' && C.switchArg({}, false) === 'off' && C.switchArg({ choices: ['auto', 'on', 'off'] }, 'off') === 'off', 'switch: the command argument that puts a state back');
check(C.switchWords('A chime when a reply ends', false) === 'Turned off “A chime when a reply ends”' && C.switchWords('Minimap', 'auto', ['auto', 'on']) === 'Minimap: auto', 'switch words');
const p = C.metaPatch({ tags: ['x'] }, { tags: ['x'], folder: 'Work', archived: true });
check(p.folder === '' && p.archived === false && !('tags' in p), 'meta patch: what makes "now" into "before"', p);
check(C.metaWords('Logo ideas', {}, { folder: 'Work' }) === 'Moved chat “Logo ideas” to “Work”' && C.metaWords('Logo ideas', {}, { archived: true }) === 'Archived chat “Logo ideas”', 'meta words: moved, archived');

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
