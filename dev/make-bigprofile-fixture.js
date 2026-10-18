#!/usr/bin/env node
// (round 65, uilag65) A big, made-up owner profile for the "hiccup every few seconds" checks: the chats-list fixture
// (dev/make-chatlist-fixture.js, 3,000 chats) plus long histories (40 chats of 600 long messages), a busy usage log
// (ui-usage.json with 4,000 tracked items and a year of days), 60 Lab sketches with real-sized code, chat bookmarks /
// snippets. Never real data: everything is made up here, written into a throwaway folder for `dev/smoke.js --data`.
//   node dev/make-bigprofile-fixture.js [dir]      (default /tmp/hearth-bigprofile-fixture)
const fs = require('fs');
const path = require('path');
const { make } = require('./make-chatlist-fixture.js');

function bigProfile(dir = '/tmp/hearth-bigprofile-fixture') {
  const base = make(dir, 3000, 65);
  const now = Date.now();
  const para = (i, k) => `Reply ${k} in chat ${i}: here is **some** text with \`code\`.\n\n- one point about the scene\n- two: the beat, the colors\n\n${'A longer paragraph of plain words for a realistic height. '.repeat(8)}${k % 7 === 1 ? `\n\n\`\`\`js\nconst x = ${k};\nfor (let j = 0; j < 4; j++) console.log(x * j);\n\`\`\`` : ''}`;
  for (let i = 0; i < 40; i++) {
    const id = `claude-long${i}`; const at = now - i * 3600e3;
    const messages = Array.from({ length: 600 }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', text: k % 2 ? para(i, k) : `Question ${k}: what about this part?`, at: at - (600 - k) * 60e3, ...(k % 2 ? { usage: { input: 900 + k, output: 400 + k, cacheRead: 3000 } } : {}) }));
    fs.writeFileSync(path.join(dir, 'chats', `${id}.json`), JSON.stringify({ id, agentId: 'claude', title: `Long chat ${i}: the intro reel`, createdAt: at - 600 * 60e3, updatedAt: at, messages }));
  }
  const items = {}; for (let i = 0; i < 4000; i++) items[`Area ${i % 40} › Button ${i}`] = { n: 1 + (i % 50), first: now - 300 * 864e5, last: now - (i % 90) * 864e5 };
  const days = {}; for (let d = 0; d < 365; d++) { const k = new Date(now - d * 864e5).toISOString().slice(0, 10); days[k] = Object.fromEntries(Array.from({ length: 60 }, (_, j) => [`Area ${j % 40} › Button ${(d * 7 + j) % 4000}`, 1 + (j % 5)])); }
  fs.writeFileSync(path.join(dir, 'kv', 'ui-usage.json'), JSON.stringify({ since: now - 365 * 864e5, items, days, hidden: [] }));
  const code = (i) => `import * as THREE from 'three';\n// sketch ${i}\n${Array.from({ length: 300 }, (_, k) => `const v${k} = ${k * 0.5}; // knob ${k}`).join('\n')}\nconst scene = new THREE.Scene();\n`;
  const sketches = Array.from({ length: 60 }, (_, i) => ({ id: `sk${i}`, name: `Scene ${i}`, code: code(i), updatedAt: now - i * 864e5, layers: [{ id: 'main', name: 'Main', code: code(i), slot: 0, visible: true, opacity: 1 }] }));
  fs.writeFileSync(path.join(dir, 'kv', 'three-sketches.json'), JSON.stringify(sketches));
  fs.writeFileSync(path.join(dir, 'kv', 'chat-bookmarks.json'), JSON.stringify(Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`claude-long${i % 40}:${i}`, { at: now - i * 1e6, note: `mark ${i}` }]))));
  return { ...base, long: 40, usageItems: 4000, sketches: 60 };
}

if (require.main === module) console.log(JSON.stringify(bigProfile(process.argv[2] || undefined)));
module.exports = { bigProfile };
