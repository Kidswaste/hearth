// Node tests for context-core.js (round 24, context): @ references (the exact text and its cost), the compact scene,
// the free summary, memory only when relevant, the per-message breakdown and the cheapest fix; plus mcp/cost.js exactOf.
//   node dev/context-test.js
const assert = require('assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'context-core.js'));
const cost = require(path.join(__dirname, '..', 'mcp', 'cost.js'));
let n = 0; let failed = 0;
const ok = (name, fn) => { n += 1; try { fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${err.stack.split('\n').slice(0, 3).join('\n  ')}`); } };

ok('a reference: its name, kind, and its cost measured on the exact text the chat box sends', () => {
  const r = C.ref('scene', 'Neon "orb"', 'Lab scene x');
  assert.strictEqual(r.name, '@scene · Neon orb');
  assert.strictEqual(r.kind, 'text');
  assert.strictEqual(r.ref, 'scene');
  // native.js packAttachments: `\n\n<file name="${a.name}">\n${a.content}\n</file>`
  assert.strictEqual(r.tokens, Math.ceil(`\n\n<file name="${r.name}">\n${r.content}\n</file>`.length / 4));
});
ok('@scene: layers, order, blend, timing, keyframes and sliders, never the code', () => {
  const sk = { name: 'Orb', layers: [
    { name: 'Tunnel', code: "const P = tweak({ speed: { value: 0.6, min: 0, max: 3, label: 'Speed' }, hue: '#ff3cac' });\nrenderer.render(scene, camera);", blend: 'add', opacity: 0.5, in: 4 },
    { name: 'Grain', code: "filter('grain', { amount: 0.2 });", visible: false, keys: { 's:amount': [] } },
  ] };
  const t = C.sceneCompact(sk);
  assert.match(t, /Lab scene "Orb" · 2 layers/);
  assert.match(t, /1\. Tunnel · add · 50% · plays 4–end s · 2 lines\n {3}sliders: speed=0\.6, hue=#ff3cac/);
  assert.match(t, /2\. Grain · filter · hidden · keyframes: amount/);
  assert.ok(!/renderer\.render|tweak\(/.test(t), 'no code');
  assert.ok(C.tok(t) < C.tok(C.sceneFull(sk)));
});
ok('the free summary keeps the goal, decisions, what was done, open tasks, files and names, within its words', () => {
  const chat = { title: 'Orb', messages: [
    { role: 'user', text: 'Make a neon orb for my song.', at: 1 },
    { role: 'assistant', text: 'I created a layer "Orb" and added sliders in `orb.js`. Next we could add particles.', at: 2 },
    { role: 'user', text: 'Let\'s use pink and cyan. /tmp/refs/cover.png is the cover.', at: 3 },
    { role: 'assistant', text: 'I changed the palette to pink and cyan.', at: 4, suggest: ['Add a tunnel', '/render'] },
  ] };
  const s = C.localSummary(chat);
  assert.match(s.text, /^Goal: Make a neon orb/);
  assert.deepStrictEqual(s.decisions, ['Let\'s use pink and cyan.']);
  assert.ok(s.done.some((x) => /created a layer/.test(x)));
  assert.ok(s.open.includes('Add a tunnel') && !s.open.includes('/render'));
  assert.ok(s.files.includes('/tmp/refs/cover.png') && s.files.includes('orb.js'));
  assert.ok(s.names.includes('Orb'));
  assert.match(s.text, /Last: the user asked "Let's use pink/);
  const long = { title: 'x', messages: Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? `I added layer number ${i} with a long description of everything it does and why.` : `Let's keep idea ${i} and always use the color ${i}.`, at: i })) };
  assert.ok((C.localSummary(long, { maxWords: 120 }).text.match(/\S+/g) || []).length <= 120);
});
ok('@chat: the compact summary when the chat has one, never the history', () => {
  const chat = { title: 'Intro', updatedAt: Date.UTC(2026, 9, 1), compact: { summary: 'We made the intro.' }, messages: [{ role: 'user', text: 'SECRET HISTORY LINE' }, { role: 'assistant', text: 'ok' }] };
  const t = C.chatDigest(chat, { agentName: 'Claude' });
  assert.match(t, /^Chat "Intro" with Claude · 2 messages · last 2026-10-01\nWe made the intro\./);
  assert.ok(!/SECRET HISTORY/.test(t));
});
ok('memory goes only when a message is about it (words, the project\'s name, "always"), capped', () => {
  const facts = [{ t: 'Kick drives the orb scale', scope: 'chat' }, { t: 'Exports go to the Renders folder', scope: 'project' }, { t: 'Reply in short sentences', scope: 'chat', always: true }, { t: 'Neon palette is pink and cyan', scope: 'agent' }];
  assert.deepStrictEqual(C.relevant(facts.slice(0, 2), 'hello there'), []);
  assert.deepStrictEqual(C.relevant(facts, 'make the kick hit harder').map((f) => f.t), ['Kick drives the orb scale', 'Reply in short sentences']);
  assert.deepStrictEqual(C.relevant(facts.slice(0, 2), 'Stoop Ronin: what is next?', { project: 'Stoop Ronin' }).map((f) => f.t), ['Exports go to the Renders folder']);
  const many = Array.from({ length: 20 }, (_, i) => ({ t: `orb fact ${i}`, scope: 'chat' }));
  assert.strictEqual(C.relevant(many, 'the orb').length, 5);
  assert.strictEqual(C.memoryLine([{ t: 'a' }, { t: 'b' }]), '[Memory, approved by the user: a; b]');
});
ok('the breakdown: history is what remains; parts scale down when the engine counted less', () => {
  const b = C.breakdown({ input: 10000, base: 700, system: 900, tools: [['threeTools', 1800], ['chatTools', 600]], message: 20, refs: 100, memory: 30 });
  assert.strictEqual(b.history, 10000 - 700 - 900 - 2400 - 20 - 100 - 30);
  assert.strictEqual(b.toolsTotal, 2400);
  const s = C.breakdown({ input: 1000, base: 700, system: 900, tools: [] });
  assert.strictEqual(s.history, 0);
  assert.ok(s.base + s.system <= 1001);
});
ok('the cheapest fix: unused tool sets, a long history, always-on memory; biggest saving first', () => {
  const f = C.fixes({ bd: { history: 40000 }, sets: [['boardTools', 1000], ['captureTools', 550], ['threeTools', 1800]], used: ['capture_shot'], memAlways: 300, summaryTokens: 300, replies: 12 });
  assert.deepStrictEqual(f.map((x) => x.cmd), ['/fresh', '/board-tools off', '/memory relevant on']);
  assert.strictEqual(f[0].saves, 39700);
  assert.match(f[1].text, /1\.0k tokens of Board tools with every message and hasn't used them in 12 replies/);
  assert.deepStrictEqual(C.fixes({ bd: { history: 3000 }, sets: [['threeTools', 1800]] }), []);
});
ok('mcp/cost.js exactOf: the agent\'s whole system prompt and the tool sets it really gets', () => {
  const plain = cost.exactOf({ id: 'c', name: 'Claude', engine: 'claude' });
  const board = cost.exactOf({ id: 'c', name: 'Claude', engine: 'claude', boardTools: true });
  assert.deepStrictEqual(plain.tools.map((t) => t[0]), ['chatTools']);
  assert.deepStrictEqual(board.tools.map((t) => t[0]).sort(), ['boardTools', 'chatTools']);
  assert.ok(board.total > plain.total + 500);
  const astra = cost.exactOf({ id: 'a', name: 'Astra', engine: 'codex' });
  assert.ok(!astra.tools.some((t) => t[0] === 'chatTools'), 'Astra gets no chat tools by default');
  assert.ok(plain.system > 50 && plain.memory === 0);
});

console.log(failed ? `\n${failed} of ${n} failed` : `\nall ${n} passed`);
process.exit(failed ? 1 : 0);
