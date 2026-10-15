// Node tests for 💡 Answered by Hearth (round 45, localanswers): detection precision on 40 questions about Hearth vs 40
// about the owner's own work (≥ 90 % of the first answered, 0 of the second intercepted), the right answer for the
// owner's own examples, the Lab director chat rule, learned misses, "what changed" from the real patch notes, and
// every answer's Show me target existing.
//   node dev/localanswers-test.js [--list]   (--list prints what each question got)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../tools/three-search-core.js');
const D = require('../appsearch-data.js');
const W = require('../whatsnew-core.js');
const L = require('../localanswers-core.js');
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const built = L.build({ C, D });
const LIST = process.argv.includes('--list');

const HEARTH = [
  'how do I make a 9:16 version?', 'where\'s the spending limit?', 'how do I make it move with the beat?', 'how do I switch to dark mode?',
  'how do I export a video?', 'how do I make answers shorter?', 'how can I let claude read my files?', 'how do I connect gmail?',
  'how do I back up my chats?', 'how do I start a new chat?', 'where do I set the personality?', 'how do I add rules it always follows?',
  'how do I change the frame size?', 'how do I tap the tempo?', 'how do I freeze the frame?', 'how do I present full screen?',
  'how do I sync my mac and pc?', 'which keyboard shortcuts are there?', 'how do I make the AI think harder?', 'where is the weekly limit?',
  'where do my tokens go?', 'how do I make hearth bigger on my screen?', 'how do I make a slider react to the music?', 'how do I add a glow effect?',
  'how do I make it loop seamlessly?', 'how do I share a scene?', 'how do I save my sliders?', 'how do I add a camera move?',
  'where is the mood board?', 'how do I check claude works on this computer?', 'how do I make it remember things?', 'how do I get a second opinion?',
  'how do I undo a change?', 'how do I pin a chat?', 'how do I rename a chat?', 'how do I make many videos at once?',
  'how do I update hearth?', 'how do I export a chat as markdown?', 'how do i make a vertical video for tiktok', 'where are hooks?',
];
const WORK = [
  'how do I center a div in css?', 'why does my shader flicker?', 'can you make the particles spiral around the logo?', 'how do I write a cover letter?',
  'what\'s the capital of France?', 'how do I fix this error: TypeError undefined?', 'what\'s a good color palette for a moody night scene?', 'how do I make the camera orbit the torus faster?',
  'write a poem about autumn', 'how do I reverse a string in python?', 'what rhymes with orange?', 'how should the hero\'s arc end in chapter 3?',
  'can you add bloom to the background layer?', 'how do I make the text in my intro bigger?', 'how many tokens does a 4k texture use?', 'is the sun bigger than jupiter?',
  'how do I make the logo explode into particles on the drop?', 'what does this function return?', 'how do I loop through an array in javascript?', 'what\'s the best way to light a product shot?',
  'should the scene be darker at the chorus?', 'can you review my essay?', 'how do I make my character more likeable?', 'how do I convert celsius to fahrenheit?',
  'where should the title sit in the frame?', 'why is the render so slow?', 'how do I make the waves calmer?', 'how do I add a second verse to the song lyrics?',
  'what\'s the difference between let and const?', 'how do I make the orb pulse red on the snare?', 'explain quantum entanglement simply', 'how do I set up a git repository?',
  'how do I make the transition smoother between scene 2 and 3?', 'what\'s a good name for my project?', 'how do I tighten the pacing of the edit?', 'is my story\'s ending too abrupt?',
  'how do I fix it?', 'how do I bake sourdough bread?', 'how do I make the glitch stronger at 1:20?', 'what font would suit a retro poster?',
];

ok('40 questions about Hearth: at least 90 % answered here', () => {
  const got = HEARTH.map((q) => [q, L.answer(built, q)]);
  if (LIST) for (const [q, a] of got) console.log(a ? '✓' : '✗', q, '→', a ? `${a.title} (${a.score})` : '—');
  const n = got.filter(([, a]) => a).length;
  assert.ok(n >= 36, `${n}/40 answered: missed ${got.filter(([, a]) => !a).map(([q]) => q).join(' | ')}`);
  return `${n}/40`;
});
ok('40 questions about the owner\'s work: none intercepted', () => {
  const got = WORK.map((q) => [q, L.answer(built, q)]);
  const bad = got.filter(([, a]) => a);
  if (LIST) for (const [q, a] of bad) console.log('✖ intercepted', q, '→', a.title, a.score);
  assert.strictEqual(bad.length, 0, bad.map(([q, a]) => `${q} → ${a.title}`).join(' | '));
  return '0/40';
});
ok('the owner\'s own examples get the right answer', () => {
  const a = L.answer(built, 'how do I make a 9:16 version?');
  assert.ok(/All formats/.test(a.text) && a.go?.type === 'lab' && a.go.label === '▦ All formats', JSON.stringify(a));
  const b = L.answer(built, 'where\'s the spending limit?');
  assert.ok(/Weekly limit/.test(b.text) && b.go?.type === 'ai' && b.go.id === 'ai:limit', JSON.stringify(b));
  const c = L.answer(built, 'how do I make it move with the beat?');
  assert.ok(/Move with the music/.test(c.text), JSON.stringify(c));
  const d = L.answer(built, 'how do I switch to dark mode?');
  assert.ok(/Match my computer/.test(d.text), JSON.stringify(d));
});
ok('answers are one or two plain lines', () => {
  for (const q of HEARTH) { const a = L.answer(built, q); if (a) assert.ok(a.text.length <= 232 && !/\*\*|`/.test(a.text), `${q}: ${a.text}`); }
});
ok('the gate: code, files, links, requests to the AI, long messages and statements go straight through', () => {
  for (const t of ['how do I use `three.js`?', 'where is config.json?', 'how do I open https://x.com?', 'can you tell me where the limit is?', 'please make it 9:16',
    'thanks!', 'make it 9:16', 'add a tunnel of rings', `how do I ${'really '.repeat(20)}export?`, 'how do I export?\nalso this', '/size 9:16', 'how do I export "my intro"?']) {
    assert.strictEqual(L.answer(built, t), null, t);
  }
});
ok('in the Lab director chat: only questions about the Lab\'s UI, only Lab answers', () => {
  assert.strictEqual(L.answer(built, 'how do I make it move with the beat?', { director: true }), null);
  assert.strictEqual(L.answer(built, 'how do I make a 9:16 version?', { director: true }), null);
  const a = L.answer(built, 'how do I make a slider move with the beat?', { director: true });
  assert.ok(a && a.lab && /Move with the music/.test(a.text), JSON.stringify(a));
  assert.ok(L.answer(built, 'which button freezes the frame?', { director: true })?.lab);
  assert.strictEqual(L.answer(built, 'where is the spending limit?', { director: true }), null); // not the Lab's UI
});
ok('a phrase "Ask the AI anyway" was pressed on stops answering (and only that phrase)', () => {
  const q = 'how do I tap the tempo?';
  const misses = new Set([L.keyOf(q, C)]);
  assert.strictEqual(L.answer(built, q, { misses }), null);
  assert.strictEqual(L.answer(built, 'How do I tap the tempo', { misses }), null); // the same words, said again
  assert.ok(L.answer(built, 'how do I freeze the frame?', { misses }));
});
ok('typos still land', () => {
  assert.ok(/Weekly limit/.test(L.answer(built, 'where is the spending limt?')?.text || ''));
  assert.ok(L.answer(built, 'how do I chnage the personality?'));
});
const notes = fs.readFileSync(path.join(__dirname, '../docs/patch-notes/index.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => /^round-\d+\.md$/.test(l)).slice(0, 3)
  .map((f) => ({ round: Number(/\d+/.exec(f)[0]), text: fs.readFileSync(path.join(__dirname, '../docs/patch-notes', f), 'utf8') }));
ok('"what changed today?" → the newest round\'s parts, from the patch notes', () => {
  for (const q of ['what changed today?', 'what\'s new?', 'what changed', 'any patch notes?']) {
    const a = L.news(notes, q, { W });
    assert.ok(a && a.go.type === 'news' && a.text.includes(`Round ${notes[0].round}`), `${q}: ${JSON.stringify(a)}`);
  }
  const lab = L.news(notes, 'what\'s new in the lab?', { W });
  assert.ok(lab && /Lately in the Lab/.test(lab.text), JSON.stringify(lab));
  assert.strictEqual(L.news(notes, 'what changed in my code?', { W }), null);
  assert.strictEqual(L.answer(built, 'what changed today?'), null); // news is its own path
  assert.strictEqual(L.news(notes, 'what changed today?', { W, misses: new Set([`news ${L.fold('what changed today?').replace(/[^a-z0-9 ]+/g, '')}`]) }), null);
});
ok('every Show me target exists', () => {
  const ids = new Set([...D.SETTINGS, ...D.AI_SETUP].map((r) => r.id));
  for (const it of built.items) {
    const g = it.go;
    if (!g) continue;
    if (g.type === 'set' || g.type === 'ai') assert.ok(ids.has(g.id), `${it.label}: ${g.id}`);
    if (g.type === 'lab') assert.ok(g.label || g.q, it.label);
  }
});
ok('fast: < 3 ms a question on average', () => {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 5; i += 1) for (const q of [...HEARTH, ...WORK]) L.answer(built, q);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 400;
  assert.ok(ms < 3, `${ms.toFixed(2)} ms`);
  return `${ms.toFixed(2)} ms a question`;
});

let fail = 0;
for (const [name, fn] of tests) {
  try { const r = fn(); console.log(`✔ ${name}${r ? ` (${r})` : ''}`); } catch (e) { fail += 1; console.log(`✖ ${name}\n   ${e.message}`); }
}
console.log(JSON.stringify({ ok: fail === 0, tests: tests.length, failed: fail }));
process.exit(fail ? 1 : 0);
