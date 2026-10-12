#!/usr/bin/env node
// What the context stream (round 24) saves, measured the way the fake engines count (dev/fake-claude.js: input =
// 700 + every character of the session / 4) plus each agent's exact system prompt and tool sets (mcp/cost.js exactOf,
// like dev/director-cost.js). Development helper; prints before → after for:
//   1. a 60-message chat continuing (the next message) vs a fresh start from the free summary
//   2. a director chat given the scene: the full state (every layer's code) vs @scene
//   3. the fresh-start summary itself (size, what it keeps, break-even)
//   4. memory: 20 saved facts always in the system prompt vs only the relevant ones (/memory relevant on)
//   5. tools a chat never uses (Board tools on a plain chat) vs off (/context fix)
//   node dev/context-cost.js            # the table
//   node dev/context-cost.js --json
const path = require('path');
const vm = require('vm');
const fs = require('fs');
const C = require(path.join(__dirname, '..', 'context-core.js'));
const cost = require(path.join(__dirname, '..', 'mcp', 'cost.js'));

const BASE = 700; // the fake engines' own base (dev/fake-claude.js)
const fixedOf = (agent) => { const r = cost.exactOf({ ...agent, exact: true }); return { system: r.system, tools: r.tools.reduce((n, t) => n + t[1], 0), parts: r.tools }; };
const CLAUDE = { id: 'claude', name: 'Claude', engine: 'claude' };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', engine: 'claude', dock: 'three', threeTools: true };

// ---------- a 60-message director chat (30 asks, 30 replies), the owner's habits ----------
const asks = ['Make a neon orb visual for my song, 9:16 for Shorts.', 'Let\'s use pink and cyan, keep the bloom subtle.', 'I want it to pulse on the kick.', 'Add a tunnel layer behind it.', 'Make the tunnel slower on the intro.',
  'Use the grain filter from the board vibe.', 'Keep the orb centered, never let it leave the frame.', 'Change the palette to dusk for the bridge.', 'Add particles that burst on the snare.', 'Fade the tunnel in on the drop at 0:42.'];
const replies = ['I created a layer "Orb" with a bloom pass and added sliders glow, speed and hue in `orb.js`.', 'I changed the palette to pink and cyan; the bloom strength is now 0.35.', 'Now the orb pulses on audio.kick with an eased envelope (attack 40 ms).',
  'I added a layer "Tunnel" below the orb (bottom first), additive blend at 70%.', 'I set keyframes on the tunnel speed: 0.2 until 0:16, then 1.0.', 'I added a filter layer "Grain" above everything.', 'I clamped the orb position so it stays inside the 1080×1920 frame.',
  'I made a "Dusk" look and linked it to the bridge section (1:05–1:30).', 'I added a layer "Sparks" with 4k points that burst on audio.snare.', 'The tunnel now fades in over 0.5 s at 0:42. Next we could tune the sparks colors.'];
const filler = ' I checked the result with a small screenshot: the frame reads well at 9:16, motion is smooth at 60 fps, and the sliders keep your hand-tuned values. You can ask for camera moves, materials, or a different mood next.';
const chat = { title: 'Neon orb · Shorts', messages: [] };
for (let i = 0; i < 30; i += 1) {
  chat.messages.push({ role: 'user', text: asks[i % asks.length] + (i >= 10 ? ` (pass ${Math.floor(i / 10) + 1})` : ''), at: i * 2 });
  chat.messages.push({ role: 'assistant', text: replies[i % replies.length] + filler.repeat(3), at: i * 2 + 1 });
}
const next = 'Make the sparks a bit warmer on the last chorus.';
const history = C.historyTokens(chat.messages);
const chars = chat.messages.reduce((n, m) => n + m.text.length, 0);

// 1 + 3. continuing vs fresh start
const d = fixedOf(DIRECTOR);
const before1 = BASE + Math.ceil(chars / 4) + d.system + d.tools + C.tok(next);
const sum = C.localSummary(chat);
const wrapped = `Here is our earlier conversation (from a summary of the earlier chat chat). Continue it naturally.\n\n<earlier_conversation>\nAssistant: **Where we are** (summary of "${chat.title}")\n\n${sum.text}\n</earlier_conversation>\n\n`;
const after1 = BASE + C.tok(wrapped) + d.system + d.tools + C.tok(next);
const askCost = before1 + 350; // /fresh ask: one more message at today's size + a ~350-token summary written

// 2. @scene vs the full state, on a 4-layer scene made of the Lab's own templates
const sandbox = { window: {} };
vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, '..', 'tools', 'three-data.js'), 'utf8')}; this.T = ThreeData.TEMPLATES;`, sandbox);
const T = sandbox.T;
const pickT = (re) => T.find((t) => re.test(t.name)) || T[0];
const tweakBlock = "\nconst P = tweak({ glow: { value: 0.35, min: 0, max: 2, label: 'Glow', group: 'Look' }, speed: { value: 0.6, min: 0, max: 3, label: 'Speed', group: 'Motion' }, hue: '#ff3cac' });\n";
const scene = { name: 'Neon orb', layers: [
  { name: 'Tunnel', code: pickT(/Fog/).code + tweakBlock, blend: 'add', opacity: 0.7, in: 42 },
  { name: 'Orb', code: pickT(/Bloom/).code + tweakBlock, keys: { 's:glow': [{ t: 0, v: 0.2 }, { t: 42, v: 1 }] } },
  { name: 'Sparks', code: pickT(/Particles/).code + tweakBlock },
  { name: 'Grain', code: "filter('grain', { amount: 0.18 });\n" + pickT(/ShaderMaterial/).code },
] };
const full = C.sceneFull(scene);
const compact = C.sceneCompact(scene);
const refFull = C.tok(C.block('scene · Neon orb.json', full));
const refAt = C.ref('scene', scene.name, compact).tokens;
const dirFixed = BASE + d.system + d.tools + C.tok(next);

// 4. memory: 20 facts in the system prompt on every message vs the relevant ones per message
const facts = ['I post 9:16 visuals on YouTube Shorts and TikTok', 'My songs are mostly 120–128 bpm house', 'I prefer pink, cyan and dusk palettes', 'Keep bloom subtle, never blown out', 'I hate camera shake',
  'Exports go to the Renders folder on the Mac', 'I use the Lab sequence as my video timeline', 'Sliders should be grouped Look / Motion / Music', 'I tap the beat grid by hand before reacting to music', 'My channel is called Hearthbeat',
  'Fonts: Space Grotesk for titles', 'Never use stock footage literally, only as a vibe', 'Freeze frames are my thumbnails', 'I work at night, keep replies short', 'Astra decides when I can\'t choose',
  'Particles max 50k for smooth previews', 'Intro video for the app is the current goal', 'I like After Effects style keyframes', 'Use the orb starter for new chats', 'Kick drives scale, snare drives particles'];
const memAlways = C.tok(`What you remember about the user (saved notes, keep them in mind):\n${facts.map((f) => `- ${f}`).join('\n')}`);
const msgs = [...asks, next, 'Render it again for TikTok', 'What fps is the preview at?', 'Make the particles react to the snare harder'];
const relTok = msgs.map((m) => { const r = C.relevant(facts.map((t) => ({ t, scope: 'agent' })), m); return r.length ? C.tok(`\n\n${C.memoryLine(r)}`) : 0; });
const memRel = Math.round(relTok.reduce((a, b) => a + b, 0) / relTok.length);

// 5. a plain chat with Board tools on that never calls them
const withBoard = fixedOf({ ...CLAUDE, boardTools: true });
const plain = fixedOf(CLAUDE);

const rows = [
  ['60-message chat, next message', before1, after1, 'fresh start from the free summary (/fresh)'],
  ['Writing that summary', askCost, 0, 'made here for free (the old way: one more full message, /fresh ask)'],
  ['The scene, attached', refFull, refAt, '@scene instead of every layer\'s code'],
  ['Director message with the scene', dirFixed + refFull, dirFixed + refAt, 'the same, on the whole message (prompt + tools)'],
  ['Memory (20 facts), per message', memAlways, memRel, '/memory relevant on: only the facts a message is about'],
  ['Plain chat with unused Board tools', BASE + withBoard.system + withBoard.tools, BASE + plain.system + plain.tools, '/context fix (switches them off)'],
];
const out = {
  chat: { messages: chat.messages.length, historyTokens: history, fakeInput: before1 },
  summary: { tokens: sum.tokens, words: (sum.text.match(/\S+/g) || []).length, decisions: sum.decisions.length, done: sum.done.length, open: sum.open.length, files: sum.files, names: sum.names, breakEven: 'the first message' },
  scene: { fullTokens: refFull, atSceneTokens: refAt, layers: scene.layers.length, codeChars: scene.layers.reduce((n, l) => n + l.code.length, 0) },
  memory: { always: memAlways, relevantAvg: memRel, perMessage: relTok },
  rows: rows.map(([what, b, a, how]) => ({ what, before: b, after: a, saved: b - a, pct: b ? Math.round(((b - a) / b) * 100) : 0, how })),
};
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
const pad = (s, n) => String(s).padEnd(n);
const num = (n) => String(n).padStart(7);
console.log(`${pad('scenario', 40)}${num('before')}${num('after')}${num('saved')}   how`);
for (const r of out.rows) console.log(`${pad(r.what, 40)}${num(r.before)}${num(r.after)}${num(r.saved)}   ${r.pct}% · ${r.how}`);
console.log(`\nThe 60-message chat re-reads ≈ ${history} tokens of history; its free summary is ${out.summary.tokens} tokens (${out.summary.words} words: ${out.summary.decisions} decisions, ${out.summary.done} done, ${out.summary.open} open, files ${out.summary.files.join(', ') || '–'}).`);
console.log(`@scene: ${refAt} tokens vs ${refFull} for the full state (${out.scene.layers} layers, ${out.scene.codeChars} characters of code).`);
console.log(`Memory per message with /memory relevant on: ${relTok.join(' ')} (avg ${memRel}) vs ${memAlways} always.`);
