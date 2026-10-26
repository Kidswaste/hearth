#!/usr/bin/env node
// Unit test for the credit log (credits-core.js, round 67): time machine versions sorted into hand / AI work (each
// version once, prompts once), slider moves, the Sound desk's sources, recordings, the plain credits (never more than
// the data says: "not recorded" when it's missing), what came before the log, a damaged log made whole, and the
// "How it was made" plan (chapters, cards, 10–20 s).
//   node dev/credits-test.js
const C = require('../credits-core.js');
let fails = 0; let n = 0;
const check = (ok, label, extra) => { n += 1; if (!ok) { fails += 1; console.log(`✖ ${label}${extra !== undefined ? ` · ${JSON.stringify(extra)}` : ''}`); } else console.log(`✓ ${label}`); };

const T0 = 1_700_000_000_000;
let seq = 0;
const v = (by, kind, extra = {}) => ({ id: `v${seq += 1}`, at: T0 + seq * 1000, by, kind, label: `${kind} ${seq}`, ...extra });

// ---------- versions ----------
const log = C.blank(T0);
const vs = [
  v('you', 'start'),
  v('claude', 'director'), v('claude', 'director'), v('codex', 'director'),
  v('you', 'run'), v('you', 'run'), v('you', 'sliders'), v('you', 'layers'), v('you', 'shuffle'),
  v('you', 'restore'), v('crew', 'director'), v('you', 'branch'),
];
for (const x of vs) C.noteVersion(log, 's1', 'Neon orb', x, x.at);
const p = log.pieces.s1;
check(p && p.name === 'Neon orb', 'a piece per scene, with its name');
check(p.ai.claude === 2 && p.ai.codex === 1 && p.ai.crew === 1, 'AI edits counted per AI', p.ai);
check(p.you.code === 2 && p.you.sliders === 1 && p.you.layers === 1 && p.you.shuffle === 1, 'hand edits counted by kind', p.you);
check(p.you.restores === 1, 'a restore is not an edit');
check(p.first === 'ai', 'the first recorded change was the AI\'s (the start version is no one\'s)');
C.noteVersion(log, 's1', 'Neon orb', vs[4], vs[4].at);
check(p.you.code === 2, 'the same version twice counts once');
// a turn bookmark that lands on an existing version: the prompt counts, the version doesn't again
const mark = { by: 'claude', at: T0 + 99_000, text: 'make it glow on the snare' };
C.noteVersion(log, 's1', 'Neon orb', { ...vs[4], mark }, T0 + 99_000);
C.noteVersion(log, 's1', 'Neon orb', { ...vs[4], mark }, T0 + 99_500);
check(p.prompts.claude === 1 && p.you.code === 2, 'a prompt counts once, the version it sits on not again', { prompts: p.prompts, code: p.you.code });
check(p.notes.length <= 10 && p.notes.some((x) => /Asked Claude/.test(x.text)), 'short notes, at most 10', p.notes.length);
for (let i = 0; i < 400; i += 1) C.noteVersion(log, 's1', 'Neon orb', v('you', 'run'), T0);
check(p.seenV.length === 300 && p.notes.length === 10, 'what it remembers stays small (300 ids, 10 notes)', { seen: p.seenV.length, notes: p.notes.length });
check(JSON.stringify(log).length < 20000, 'the whole log stays small', JSON.stringify(log).length);
check(C.noteVersion(log, 's1', 'x', null) === false && C.noteVersion(log, 's1', 'x', {}) === false, 'no version: nothing');

// ---------- sliders, sound, recordings ----------
const L2 = C.blank(T0);
C.noteMoves(L2, 's2', 'Rain', 3);
C.noteMoves(L2, 's2', 'Rain', 0);
check(L2.pieces.s2.moves === 3 && L2.pieces.s2.first === 'you', 'slider moves counted (saved or not)');
C.noteSound(L2, 's2', 'Rain', { source: 'desk', instrument: 'Serum 2', changed: 4 });
C.noteSound(L2, 's2', 'Rain', { source: 'editor', instrument: 'Serum 2' });
C.noteSound(L2, null, null, { source: 'desk', instrument: 'Vital', changed: 2 });
C.noteSound(L2, 's2', 'Rain', { source: 'preset-hover', instrument: 'Serum 2', changed: 12 });
check(!C.noteSound(L2, 's2', 'Rain', { source: 'preset-hover-hover', instrument: 'Serum 2' }), 'an unknown source is not counted');
const s = L2.pieces.s2.sound['Serum 2'];
check(s.hand === 4 && s.editor === 1 && s.ai.hover === 1 && s.ai.chat === 0, 'the desk: knob moves, the plugin window, AI patches apart', s);
check(L2.desk.Vital.hand === 2 && !L2.pieces.s2.sound.Vital, 'no scene open: only in the desk\'s totals');
C.noteRecording(L2, 's2', 'Rain', { kind: 'park-jam', title: 'Parc: 8-bar loop' });
check(!C.noteRecording(L2, 's2', 'Rain', { kind: 'other' }), 'only the three recording kinds');
check(L2.pieces.s2.rec['park-jam'] === 1 && L2.rec['park-jam'] === 1, 'recordings counted');

// ---------- the credits ----------
const cr = C.credits(p, { owner: 'Quentin' });
check(/^Visual code: AI-drafted \(Claude: 2 edits, Codex: 1 edit and an AI crew helper: 1 edit\), then edited and tuned by hand by Quentin/.test(cr.text), 'AI first: "AI-drafted, then edited by hand"', cr.text);
check(/Starting code: not recorded/.test(cr.text), 'the starting code: not recorded until Quentin says');
check(/Direction: Quentin \(1 prompt to Claude\)/.test(cr.text), 'direction with the prompts');
check(/Sound: not recorded/.test(cr.text), 'no sound: "not recorded"');
const c2 = C.credits(L2.pieces.s2, { owner: 'Quentin' });
check(/Visual code: by hand, Quentin: 3 slider moves; no AI edits recorded/.test(c2.text), 'only the owner: by hand, no AI', c2.text);
check(/tuned by hand by Quentin in Serum 2 \(4 knob moves, 1 session in the plugin's own window\); 1 AI patch change in Serum 2 \(✦ Preset\)/.test(c2.text), 'sound: hand and AI both said', c2.text);
check(/Recorded: 1 park loop \(played by Quentin\)/.test(c2.text), 'recordings');
check(!/Direction/.test(c2.text), 'no AI on the visuals: no direction line');
const onlyAi = C.blankPiece('x', T0); onlyAi.ai.claude = 5;
check(/written by AI \(Claude: 5 edits\); no hand edits recorded/.test(C.credits(onlyAi).text) && /Direction: not recorded/.test(C.credits(onlyAi).text), 'only AI: says so, and no direction claimed', C.credits(onlyAi).text);
const empty = C.credits(C.blankPiece('x', T0));
check(/Visual code: not recorded/.test(empty.text) && /Sound: not recorded/.test(empty.text), 'nothing: not recorded');
check(/not recorded/.test(C.credits(null).text), 'no piece: not recorded');
const said = C.blankPiece('x', T0); said.start = 'ai'; said.you.code = 1;
check(/Starting code: AI-written \(as Quentin noted it\)/.test(C.credits(said).text), 'the owner\'s note on the start is shown as theirs');
const youFirst = C.blankPiece('x', T0); youFirst.first = 'you'; youFirst.you.code = 3; youFirst.ai.codex = 1;
check(/started and edited by hand by Quentin: 3 edits \(3 to the code\), with AI edits \(Codex: 1 edit\)/.test(C.credits(youFirst).text), 'owner first: "started by hand, with AI edits"', C.credits(youFirst).text);
// before the log
const old = [v('you', 'run', { at: T0 - 5000 }), v('claude', 'director', { at: T0 - 4000 }), v('you', 'run', { at: T0 + 1 })];
const withOld = C.credits({ ...C.blankPiece('x', T0), since: T0 }, { versions: old });
check(/Before the log: the time machine kept 2 older versions \(Quentin 1, Claude 1\)/.test(withOld.text), 'what came before the log, as lower counts', withOld.text);
check(/Sound desk: tuned by hand by Quentin in Serum 2.*Vital \(2 knob moves\)/.test(C.deskCredits(L2)), 'the desk\'s own totals', C.deskCredits(L2));
check(C.deskCredits(C.blank()) === 'Sound desk: not recorded', 'the desk: not recorded');

// ---------- heal ----------
const bad = { v: 1, owner: '', pieces: { a: { name: 'A', you: { code: 'x' }, ai: null, first: 'you', moves: -3 }, b: 5 }, desk: null };
const h = C.heal(bad);
check(h.owner === 'Quentin' && !h.pieces.b && h.pieces.a.you.code === 0 && h.pieces.a.ai.claude === 0 && h.pieces.a.moves === 0 && h.pieces.a.first === 'you' && h.desk && h.rec, 'a damaged log is made whole (kept, not emptied)', h.pieces.a);
check(C.heal(null).v === 1 && C.heal({ v: 9 }).pieces, 'no log / another version: a blank one');

// ---------- the reel ----------
seq = 0;
const story = [v('you', 'start'), v('claude', 'director'), v('claude', 'director'), v('you', 'sliders'), v('you', 'shuffle'), v('you', 'restore'), v('you', 'run'), v('codex', 'director')];
const plan = C.reelPlan(story, { owner: 'Quentin' });
check(plan.length === 5, 'start + 4 chapters', plan.map((x) => x.card));
check(plan[0].card === 'Start: the scene as first recorded' && plan[0].vid === story[0].id, 'the start is neutral when nothing was said about it');
check(plan[1].card === 'Claude edited the scene (2 edits)' && plan[1].vid === story[2].id && plan[1].by === 'claude', 'an AI chapter shows its last version');
check(plan[2].card === 'Quentin re-tuned the sliders (2 edits)' && plan[2].by === 'you', 'slider saves and shuffles are one tuning chapter');
check(plan[3].card === 'Quentin edited the code by hand' && plan[4].card === 'Codex edited the scene', 'a restore makes no chapter; one edit: no count');
check(C.reelPlan(story, { start: 'ai' })[0].card === 'Start: AI draft', 'start said by the owner: "Start: AI draft"');
const many = [v('you', 'start')];
for (let i = 0; i < 30; i += 1) many.push(v(i % 2 ? 'claude' : 'you', i % 2 ? 'director' : 'run'));
const pm = C.reelPlan(many, { max: 8 });
check(pm.length <= 8 && pm.at(-1).vid === many.at(-1).id, 'at most 8 stills, the last is the piece now', pm.length);
check(C.reelPlan([]).length === 0, 'no versions: no reel');
const solo = C.reelPlan([v('claude', 'director')]);
check(solo.length === 1 && /^Start: Claude edited/.test(solo[0].card), 'a single kept version that is a change: its own start card', solo);
for (const k of [1, 2, 5, 8, 12]) { const t = C.reelTimes(k); check(t.total >= 10 && t.total <= 20.01, `${k} stills: 10–20 s`, t); }
const ed = C.reelEdit(['/a.png', '/b.png'], '/end.png', C.reelTimes(2));
check(ed.clips.length === 3 && ed.clips.every((c) => c.kind === 'title' && c.img && c.dur > 0), 'the cut: one picture clip per still + the credits card');
check(C.SIZES['9:16'].h === 1920 && C.SIZES['16:9'].w === 1920, 'both frame sizes');
check(C.safeName('a/b:c') === 'a_b_c', 'a safe file name');

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
