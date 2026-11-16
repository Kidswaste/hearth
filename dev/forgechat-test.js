#!/usr/bin/env node
// (round 183, forgechat183) What the Forge chat is told and what it can call, in Node:
//   1. an agent with the game's tools gets the `gamebrief` prompt part (what Forgeheart is) right after the game guide;
//      capped; byte-stable; never a plain chat, a lean run or a crew helper
//   2. the game's tool server offers forge_docs, and its guide says to read the notes first
//   node dev/forgechat-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgechat-'));
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'macpolish.js', 'access-rules.js', 'datalock.js', 'context-core.js', 'toolwake.js', 'spawnhelper.js', 'spawnhelper-child.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const engines = require(path.join(dir, 'engines.js'));
const T = engines._test;
let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };

const FORGE = { id: 'forgedebug', name: 'Forge Debug', engine: 'claude', mode: 'native', gameTools: true, companion: 'forge-game', dock: 'forgeheart' };
const partsOf = (agent, options) => T.promptParts0(T.runAgent(agent, { chatId: 'c1', session: {}, text: 'make the drones faster', options }).agent, null);
const brief = 'FORGEHEART: the owner\'s own game. A fullscreen survivor with loot forging.\nDesign notes (2): drones, rifts';
const without = partsOf(FORGE, {});
const withB = partsOf(FORGE, { gameBrief: brief });
const i = withB.findIndex((p) => p[0] === 'gamebrief');
assert.ok(i > 0 && withB[i][1] === brief && withB[i - 1][0] === 'guide:gameTools', 'the game brief sits right after the game\'s guide');
assert.equal(JSON.stringify(withB.filter((p) => p[0] !== 'gamebrief')), JSON.stringify(without), 'nothing else changes');
assert.equal(JSON.stringify(partsOf(FORGE, { gameBrief: brief })), JSON.stringify(withB), 'the same brief → the same bytes');
assert.ok(!partsOf({ id: 'claude', name: 'Claude', engine: 'claude', mode: 'native' }, { gameBrief: brief }).some((p) => p[0] === 'gamebrief'), 'a chat without the game\'s tools never gets it');
assert.ok(!partsOf(FORGE, { gameBrief: brief, lean: true }).some((p) => p[0] === 'gamebrief'), 'never a lean run');
assert.ok(!partsOf(FORGE, { gameBrief: brief, crew: true }).some((p) => p[0] === 'gamebrief'), 'never a crew helper');
assert.ok(partsOf({ ...FORGE, id: 'astra', engine: 'codex', hubTools: true }, { gameBrief: brief }).some((p) => p[0] === 'gamebrief' && p[1] === brief), 'Astra with the game\'s tools gets it too');
const long = partsOf(FORGE, { gameBrief: 'x'.repeat(9000) }).find((p) => p[0] === 'gamebrief')[1];
assert.ok(long.length <= 4300, `capped (${long.length})`);
ok('an agent with the game\'s tools is told what Forgeheart is: its own prompt part, capped, byte-stable, only for it');

const mcp = require(path.join(dir, 'mcp', 'forge-game-mcp.js'));
const guide = mcp.guide || '';
assert.ok(/forge_docs/.test(guide) && /read the notes first/.test(guide), 'the guide says to read the notes first');
const src = fs.readFileSync(path.join(ROOT, 'mcp', 'forge-game-mcp.js'), 'utf8');
assert.ok(/name: 'forge_docs'/.test(src) && /find: \{ type: 'string' \}/.test(src) && /forge_docs: 14000/.test(src), 'forge_docs is offered, with name / find / offset, and its answers are capped');
const g = withB.find((p) => p[0] === 'guide:gameTools')[1];
assert.ok(/forge_docs/.test(g), 'the guide that rides along names forge_docs');
ok('the game\'s tool server offers forge_docs, and says when to use it');

console.log(`\nall passed (${passed})`);
fs.rmSync(dir, { recursive: true, force: true });
