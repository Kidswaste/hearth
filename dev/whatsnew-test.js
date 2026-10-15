#!/usr/bin/env node
// (round 42, whatsnew) Unit tests for whatsnew-core.js on the real docs/patch-notes files: parsing a round (headlines,
// "Find it" places, bold-named details, 🐞 fixes, "Good to know" left out, no /commands or Markdown in a line),
// grouping by what the owner does, de-duplication across rounds (later words win, a rename drops the old name, a fix
// of something new in the same digest folds into it, a fix of something older stays), the ≈ 12 cap with "and N more",
// fixes kept to a line or two, a one-round digest with its details, and Show me's places (Find anything's rows).
//   node dev/whatsnew-test.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'whatsnew-core.js'));
const D = require(path.join(ROOT, 'appsearch-data.js'));
let pass = 0; let fail = 0;
const ok = (cond, what, info) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}${info === undefined ? '' : ` · ${JSON.stringify(info).slice(0, 400)}`}`); } };

const DIR = path.join(ROOT, 'docs', 'patch-notes');
const index = fs.readFileSync(path.join(DIR, 'index.txt'), 'utf8').split('\n').map((l) => (/^round-(\d+)\.md$/.exec(l.trim()) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
const real = index.map((round) => ({ round, text: fs.readFileSync(path.join(DIR, `round-${round}.md`), 'utf8') }));
const R = (n) => real.find((r) => r.round === n);
ok(index.includes(33) && index.includes(41), 'the real notes have rounds 33–41', index);
// (round 44, capturefix2) the digest numbers below were written against rounds 33–41: they read those, so a new round's
// notes don't break them (the newest round is read from index.txt, as dev/checks/whatsnew.js does, and checked below)
const upTo41 = real.filter((r) => r.round <= 41);
const newest = index.at(-1);

// ---------- parse ----------
const p37 = C.parse(R(37).text, 37);
const names37 = p37.items.filter((x) => x.kind === 'feature').map((x) => x.name);
ok(names37.includes('Before / after') && names37.includes('A leaner Three Director') && names37.some((n) => /^Find anything/.test(n)), 'round 37: one headline per part', names37);
ok(!p37.items.some((x) => /good to know/i.test(x.part)), '"Good to know" stays in the full notes');
ok(p37.items.some((x) => x.kind === 'fix' && /Start from something like/.test(x.line)), 'the 🐞 Fixed bullets are fixes');
ok(p37.items.some((x) => x.kind === 'detail' && x.name === 'Hold B'), 'a bullet with a bold name is a detail', p37.items.filter((x) => x.kind === 'detail').map((x) => x.name));
const ba = p37.items.find((x) => x.name === 'Before / after');
ok(ba.group === 'lab' && /After any change to the look/.test(ba.line), '"Before / after (Lab)": Lab, its first plain line', ba);
const p36 = C.parse(R(36).text, 36);
const tg = p36.items.find((x) => x.name === 'Where its tokens go');
ok(tg && /AI setup › Spending › Where its tokens go/.test(tg.where) && /every message/.test(tg.line), '"Find it:" is kept as the place; the line is what it does', tg);
const native = p36.items.filter((x) => x.part === 'Native on Mac and Windows');
ok(native.every((x) => !/\/titlebar|`/.test(x.line)), 'no /commands or code marks in a line', native.map((x) => x.line));
const p40 = C.parse(R(40).text, 40);
const cam = p40.items.find((x) => x.name === 'Camera moves');
ok(cam && /Right-click the preview › 🎥 Camera moves/.test(cam.where) && /Push in/.test(cam.line), 'a "Right-click …" intro is the place; the first bullet is the line', cam);
ok(C.plain('Press **/** in the Lab (`/lab-search`) and **type** it.') === 'Press / in the Lab and type it.', 'plain(): no ** and no (/command)', C.plain('Press **/** in the Lab (`/lab-search`) and **type** it.'));
ok(C.oneLine('a'.repeat(30) + ' word '.repeat(40)).length <= 101, 'a line is cut at a word when long');

// ---------- groups ----------
const G = (raw) => C.groupOf(raw, raw.replace(/^[^\p{L}\p{N}]+/u, '').trim());
ok(G('🎥 Camera moves (Lab)') === 'lab' && G('📜 Recipes (Lab)') === 'lab', 'Lab parts → Lab');
ok(G('📎 Lighter attachments') === 'tokens' && G('🪙 A leaner Three Director') === 'tokens' && G('✂️ Shorter answers') === 'tokens', 'token savings → Saving tokens');
ok(G('📂 Drag & drop (Mac and Windows)') === 'macwin' && G('🍎🪟 Native on Mac and Windows') === 'macwin' && G('💻 Your Mac and your PC') === 'macwin', 'Mac / Windows parts → Mac & Windows');
ok(G('🔁 Keep going') === 'chats' && G('🧠 Smart learns from you') === 'chats' && G('💬 A calmer chat') === 'chats', 'chat / AI parts → Chats & AIs');
ok(G('🐞 Fixed') === 'fixes' && G('↶ One Undo everywhere') === 'all' && G('🤫 Calmer tips') === 'all', 'fixes → Fixes; app-wide → Everywhere');

// ---------- the digest of rounds 33–41 (seen = 32) ----------
const d = C.digest(upTo41, { seen: 32 });
const lines = d.groups.flatMap((g) => g.items);
ok(d.from === 33 && d.to === 41 && d.rounds.length === 9, 'seen 32 → rounds 33–41', { from: d.from, to: d.to, rounds: d.rounds });
ok(lines.length === 12 && d.shown === 12, 'about 12 lines', lines.length);
ok(d.more === d.total - lines.filter((x) => x.kind !== 'detail').length && d.more > 20, '"and N more" counts the rest', { more: d.more, total: d.total });
ok(d.rest.flatMap((g) => g.items).length === d.more, 'the rest is there to open in place');
const order = C.GROUPS.map((g) => g.id);
ok(d.groups.map((g) => order.indexOf(g.id)).every((v, i, a) => !i || a[i - 1] < v), 'groups in their order: Lab · Chats & AIs · Saving tokens · Mac & Windows · Everywhere · Fixes', d.groups.map((g) => g.id));
ok(['lab', 'chats', 'tokens', 'macwin', 'fixes'].every((g) => d.groups.some((x) => x.id === g)), 'every kind of change has its group here', d.groups.map((g) => g.id));
ok((d.groups.find((g) => g.id === 'fixes')?.items.length || 0) <= 2, 'fixes: a line or two');
ok(d.groups.every((g) => g.items.length <= 3), 'no group takes over', d.groups.map((g) => [g.id, g.items.length]));
ok(lines.every((x) => C.text(x) && !/\*\*|`|(^|\s)\/[a-z][\w-]{2,}/.test(C.text(x))), 'each line is plain: no Markdown, no /command', lines.map(C.text).filter((t) => /\*\*|`|(^|\s)\/[a-z]/.test(t)));
ok(lines.every((x) => C.text(x).length <= 150), 'each line is one line', lines.map((x) => C.text(x).length));
ok(lines.some((x) => x.name === 'Camera moves') && lines.some((x) => x.name === 'Recipes') && lines.some((x) => x.name === 'Keep going'), 'the headlines lead (Camera moves, Recipes, Keep going)', lines.map((x) => x.name));
ok(!lines.some((x) => /^(Smoother|One smooth rhythm|A faster start|Lighter)$/.test(x.name)), 'plain speed parts wait in "and N more"', lines.map((x) => x.name));
const allItems = [...lines, ...d.rest.flatMap((g) => g.items)];
const names = allItems.map((x) => x.name).filter(Boolean);
ok(new Set(names.map(C.norm)).size === names.length, 'no name twice', names);
// a fix of something new in this digest folds into it
const find = allItems.find((x) => /^Find anything/.test(x.name));
ok(find?.fixedIn?.includes(39) && !allItems.some((x) => /"cheaper" in Find anything/.test(x.line)), 'round 39\'s Find anything fix folds into round 37\'s Find anything', find);
const doctor = allItems.find((x) => x.name === 'Fix my scene');
ok(doctor?.fixedIn?.includes(35) && !allItems.some((x) => /^Fix my scene works with looking around/.test(x.line)), 'round 35\'s Fix my scene fix folds into round 34\'s Fix my scene', doctor);
ok(d.folded >= 3, 'some fixes folded', d.folded);
// …but a fix of something older than the digest stays
const d38 = C.digest(upTo41, { seen: 38 });
const all38 = [...d38.groups, ...d38.rest].flatMap((g) => g.items);
ok(all38.some((x) => x.kind === 'fix' && /"cheaper" in Find anything/.test(x.line)), 'seen 38: the Find anything fix (its feature is older) stays a fix');
// one round: its details too, nothing more
const d1 = C.digest(upTo41, { seen: 40 });
ok(d1.from === 41 && d1.to === 41 && d1.groups.flatMap((g) => g.items).some((x) => x.kind === 'detail'), 'one round: its bold-named details fill in', d1.groups.flatMap((g) => g.items).map((x) => x.name));
ok(C.digest(real, { seen: newest }).shown === 0, 'nothing missed → empty');
const dn = C.digest(real, { seen: newest - 1 });
ok(dn.from === newest && dn.to === newest && dn.shown > 0, `the newest round (${newest}, from index.txt) is in the digest`, { from: dn.from, to: dn.to, shown: dn.shown });
const d5 = C.digest(upTo41, { seen: 32, cap: 5 });
ok(d5.shown === 5 && d5.more === d5.total - 5, 'the cap holds', { shown: d5.shown, more: d5.more, total: d5.total });

// ---------- dedupe (made-up rounds) ----------
const fake = [
  { round: 50, text: '# Round 50\n## ✨ Glow (Lab)\nThe first words about glow.\n\n## 🌈 Tint (Lab)\nTint things.\n' },
  { round: 51, text: '# Round 51\n## ✨ Glow (Lab)\nBetter words about glow.\n\n## 🐞 Fixed\n- Tint no longer flickers.\n- Old thing no longer crashes.\n' },
  { round: 52, text: '# Round 52\n## 💫 Shine (Lab)\nShine (was Glow) lights everything.\n' },
];
const df = C.digest(fake, { seen: 49 });
const fl = [...df.groups, ...df.rest].flatMap((g) => g.items);
ok(fl.filter((x) => /glow|shine/i.test(x.name)).length === 1 && fl.find((x) => x.name === 'Shine')?.was === 'Glow', 'a rename: only the new name, and it knows the old one', fl.map((x) => [x.name, x.line]));
const df2 = C.digest(fake.slice(0, 2), { seen: 49 });
const glow = [...df2.groups, ...df2.rest].flatMap((g) => g.items).filter((x) => x.name === 'Glow');
ok(glow.length === 1 && /Better words/.test(glow[0].line) && glow[0].rounds.join() === '50,51', 'the same part again: the later round\'s words win', glow);
ok(fl.find((x) => x.name === 'Tint')?.fixedIn?.includes(51) && fl.some((x) => x.kind === 'fix' && /Old thing/.test(x.line)), 'a fix of a new part folds; a fix of anything else stays', fl);

// ---------- Show me: Find anything's places ----------
const go = (pred) => { const it = allItems.find(pred); return it ? C.goFor(it, D) : undefined; };
ok(go((x) => x.name === 'Where its tokens go')?.rec?.id === 'ai:tokens-go', 'Where its tokens go → ⋯ AI setup › Spending › Where its tokens go');
ok(go((x) => x.name === 'Tidy memory')?.rec?.id === 'ai:memory-tidy', 'Tidy memory → its AI setup row');
ok(go((x) => x.name === 'Shorter answers')?.rec?.id === 'ai:length', 'Shorter answers → How long its answers are');
ok(go((x) => x.name === 'Big screen')?.rec?.id === 'set:ui-size', 'Big screen → Settings › Size of everything');
ok(go((x) => x.name === 'Calmer tips')?.rec?.find === 'Don\'t show tips', 'Calmer tips → Settings › Don\'t show tips');
ok(go((x) => /^Find anything/.test(x.name))?.type === 'palette', 'Find anything → Find anything');
const rec = go((x) => x.name === 'Recipes');
ok(rec?.type === 'lab' && rec.q === 'Recipes', 'a Lab feature → the Lab\'s own search on its name', rec);
ok(go((x) => x.kind === 'fix') === null, 'a fix has no Show me');
const ids = new Set([...D.SETTINGS, ...D.AI_SETUP].map((r) => r.id));
const gos = allItems.map((x) => C.goFor(x, D)).filter((g) => g && g.rec && !g.rec.id.startsWith('set:sw:'));
ok(gos.length >= 5 && gos.every((g) => ids.has(g.rec.id)), 'every Settings / AI setup place is a real Find anything row', gos.map((g) => g.rec.id));

console.log(`whatsnew-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
