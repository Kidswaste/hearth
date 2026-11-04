#!/usr/bin/env node
// (round 116, astraparity116) Claude and Astra asked for the same thing get the same Hearth: one static check of both
// engines' launch plans (engines.js _test: claudeArgs, codexArgs, codexServerPlan, buildPrompt, hubToolsets) for the
// same agent setups (a plain chat, the Three Director, a chat working on Hearth's own code), no engine is started.
//   1. Codex keeps its own base instructions (its tools, apply_patch, the plan) and gets Hearth's prompt as developer
//      instructions, on both transports; the old way only as a fallback (an older Codex, a too-long command line).
//   2. Both get the same Hearth tools, prompt parts and guides, except the named deliberate differences (DELIBERATE).
//   3. The chat-engine cases (a chat the AI switcher made for the other AI) decide from the chat's own engine.
//   node dev/astraparity116-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const dir = require('./tmp-own').mkdtemp('astraparity116-');
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'codex-capabilities.js', 'codex-server.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
const plainFolder = fs.mkdtempSync(path.join(dir, 'project-')); // an owner's project folder (not Hearth)
const E = require(path.join(dir, 'engines.js'));
const T = E._test;
let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };

// The same setups on both engines. An Astra director carries hubTools (astra.js switchDirector, engines.js runAgent).
const SETUPS = {
  plain: { id: 'p116', name: 'Helper', mode: 'native' },
  director: { id: 'threedirector', name: 'Three Director', mode: 'native', dock: 'three', threeTools: true, selfReview: true, hubChatId: 'c116' },
  selfEdit: { id: 's116', name: 'Helper', mode: 'native', access: { level: 'write', folders: [dir] } }, // the folder holds Hearth's source
};
const on = (a, engine) => ({ ...a, engine, ...(engine === 'codex' && a.dock ? { hubTools: true } : {}) });

// What differs on purpose, and why (docs/upgrades/astraparity116.md has the table). Anything else is a failure.
const DELIBERATE = {
  // tool sets: the chat tools are opt-in on a plain Astra (they add definitions to every Codex request); it gets chat_open alone
  'set:chatTools': 'plain Astra: chat tools opt-in (/astra-tools, ⋯ AI setup), chat_open alone instead',
  'set:openTool': 'plain Astra: chat_open alone (Claude has it inside its chat tools)',
  // the <suggest> buttons come with the chat tools: opt-in on a plain Astra (/astra-suggest)
  'part:suggest': 'next-step buttons: on with the chat tools; opt-in on a plain Astra',
  // Claude asks Hearth before risky edits through its permission tool; Codex can't ask, its sandbox decides
  'server:access': 'Claude\'s permission tool (Codex: its sandbox)',
};
// parts whose words name each engine's own tools / habits (same meaning, engine wording)
const WORDED = new Set(['role', 'access', 'folder', 'selfReview']);

function claudeServers(agent) {
  const args = T.claudeArgs(agent, {}, {});
  const i = args.indexOf('--mcp-config');
  if (i < 0) return [];
  const file = args[i + 1]; const cfg = JSON.parse(fs.readFileSync(file, 'utf8')); fs.rmSync(file, { force: true });
  return Object.keys(cfg.mcpServers).sort();
}
const codexServers = (args) => [...new Set(args.filter((x) => /^mcp_servers\.[^.=]+\./.test(x)).map((x) => x.split('.')[1]))].sort();
const keysOf = (agent) => E.promptParts(agent).map((p) => p[0]);
const conf = (args, key) => args.find((x, i) => args[i - 1] === '-c' && x.startsWith(`${key}=`)) || null;

// ---- 1. Codex keeps its base instructions; Hearth's prompt = developer instructions ----
for (const [name, a] of Object.entries(SETUPS)) {
  const x = on(a, 'codex');
  const prompt = T.buildPrompt(x);
  const exec = T.codexArgs(x, {}, {});
  assert.strictEqual(conf(exec, 'model_instructions_file'), null, `${name}: exec no longer replaces Codex's base instructions`);
  assert.strictEqual(JSON.parse(conf(exec, 'developer_instructions').slice('developer_instructions='.length)), prompt, `${name}: exec sends the whole prompt as developer_instructions`);
  const plan = T.codexServerPlan(x, {}, {});
  assert(!('baseInstructions' in plan.thread), `${name}: app-server keeps the model's own base instructions`);
  assert.strictEqual(plan.thread.developerInstructions, prompt, `${name}: app-server developerInstructions = Hearth's prompt`);
  assert(!plan.args.some((v) => /^(developer_instructions|model_instructions_file)=/.test(v)), `${name}: the prompt is not on the app-server command line`);
  assert.strictEqual(plan.threadLegacy.baseInstructions, prompt, `${name}: the old way is kept for a server that refuses the field`);
  // Claude: --system-prompt carries the same Hearth prompt (its tool descriptions ride in the tool list)
  const c = on(a, 'claude'); const cargs = T.claudeArgs(c, {}, {});
  assert.strictEqual(cargs[cargs.indexOf('--system-prompt') + 1], T.buildPrompt(c));
}
ok('Codex keeps its base instructions; Hearth\'s prompt rides as developer instructions (exec and app-server)');

{ // the fallbacks: an older Codex copy, a prompt too long for one command-line value, the owner's escape hatch
  const x = on(SETUPS.plain, 'codex');
  const bin = path.join(dir, 'engines.js'); // any real file: its size / time make the version's key
  T.Installs.data().versions[T.Installs.binKey(bin)] = { text: 'codex-cli 0.50.0', semver: '0.50.0' };
  T.usedBin.codex = bin;
  assert(conf(T.codexArgs(x, {}, {}), 'model_instructions_file') && !conf(T.codexArgs(x, {}, {}), 'developer_instructions'), 'an older Codex: the instructions file');
  assert('baseInstructions' in T.codexServerPlan(x, {}, {}).thread, 'an older Codex: baseInstructions');
  T.Installs.data().versions[T.Installs.binKey(bin)] = { text: 'codex-cli 0.163.0', semver: '0.163.0' };
  assert(conf(T.codexArgs(x, {}, {}), 'developer_instructions'), 'a current Codex: developer instructions');
  delete T.usedBin.codex;
  const long = T.codexArgs({ ...x, systemPrompt: 'x'.repeat(25000) }, {}, {});
  assert(conf(long, 'model_instructions_file') && !conf(long, 'developer_instructions'), 'exec: a prompt too long for the command line goes in the file');
  assert(T.codexServerPlan({ ...x, systemPrompt: 'x'.repeat(25000) }, {}, {}).thread.developerInstructions.length > 25000, 'app-server: no length limit');
  process.env.HEARTH_CODEX_PROMPT = 'base';
  assert(conf(T.codexArgs(x, {}, {}), 'model_instructions_file') && 'baseInstructions' in T.codexServerPlan(x, {}, {}).thread, 'HEARTH_CODEX_PROMPT=base: the old way');
  delete process.env.HEARTH_CODEX_PROMPT;
}
ok('falls back to the old way only for an older Codex, a too-long exec line, or HEARTH_CODEX_PROMPT=base');

// ---- 2. the same Hearth tools, parts and guides, except DELIBERATE ----
const seen = new Set();
for (const [name, a] of Object.entries(SETUPS)) {
  const c = on(a, 'claude'); const x = on(a, 'codex');
  const diff = (p, q) => p.filter((k) => !q.includes(k));
  const sc = T.hubToolsets(c); const sx = T.hubToolsets(x);
  const sv = claudeServers(c); const sxv = codexServers(T.codexArgs(x, {}, {}));
  const pc = keysOf(c); const px = keysOf(x);
  const found = [...diff(sc, sx), ...diff(sx, sc)].map((k) => `set:${k}`)
    .concat([...diff(sv, sxv), ...diff(sxv, sv)].map((k) => `server:${k}`))
    .concat([...diff(pc, px), ...diff(px, pc)].map((k) => `part:${k}`))
    .filter((k) => !(k.startsWith('part:guide:') && found0(sc, sx, k))); // a tool set's guide follows its set
  for (const k of found) { assert(DELIBERATE[k], `${name}: undeclared difference ${k}`); seen.add(k); }
  // parts both get say the same thing (word for word, except the engine-worded ones)
  const tc = Object.fromEntries(E.promptParts(c)); const tx = Object.fromEntries(E.promptParts(x));
  for (const k of Object.keys(tc).filter((k) => k in tx && !WORDED.has(k))) assert.strictEqual(tx[k], tc[k], `${name}: part ${k} differs`);
  if ('role' in tx) assert(/desktop app \(Hearth\)/.test(tx.role) && /Markdown/.test(tx.role), `${name}: Astra's role line says where it is`);
  // no hub server sends instructions of its own (they could be dropped): every guide is in the prompt, for both
  for (const k of sc) { const def = require(path.join(dir, 'mcp', scriptOf(k))); assert(!def.instructions, `${k}: server instructions`); }
}
function found0(sc, sx, k) { const set = k.slice('part:guide:'.length); return sc.includes(set) !== sx.includes(set); }
function scriptOf(k) { return E.HUB_TOOLSETS[k].script; }
// the director: nothing differs at all
const dc = on(SETUPS.director, 'claude'); const dx = on(SETUPS.director, 'codex');
assert.deepStrictEqual(T.hubToolsets(dx), T.hubToolsets(dc));
assert.strictEqual(T.buildPrompt(dx), T.buildPrompt(dc), 'the Three Director: the same prompt on both engines');
assert.deepStrictEqual(codexServers(T.codexArgs(dx, {}, {})), claudeServers(dc), 'the Three Director: the same tool servers');
ok(`the same tools, servers, prompt parts and guides on both engines; deliberate differences only: ${[...seen].sort().join(', ')}`);

{ // Hearth's own code: the short map, for both engines, only there
  for (const engine of ['claude', 'codex']) {
    assert(keysOf(on(SETUPS.selfEdit, engine)).includes('hearthCode'), `${engine}: working on Hearth's code gets its map`);
    assert(!keysOf(on(SETUPS.plain, engine)).includes('hearthCode'));
    assert(!keysOf({ ...on(SETUPS.selfEdit, engine), access: { level: 'write', folders: [plainFolder] } }).includes('hearthCode'), `${engine}: an owner's project folder keeps its own docs only`);
  }
  assert(T.HEARTH_CODE_GUIDE.length < 1200 && !/token|password|api[_ ]?key\s*[:=]/i.test(T.HEARTH_CODE_GUIDE.replace(/never put secrets/, '')), 'the map is short and fixed text');
  assert(T.codexArgs(on(SETUPS.selfEdit, 'codex'), {}, {}).includes('project_doc_max_bytes=0'), 'no AGENTS.md read (Claude reads no CLAUDE.md either)');
}
ok('a chat on Hearth\'s own code gets a short map of it on both engines; other folders get nothing extra');

// ---- 3. the chat's own engine decides ----
{ // engines.js: a Claude director's chat on Astra (options.engine) = the same director on Astra, with the same tools
  const r = T.runAgent(dc, { options: { engine: 'codex' } }).agent;
  assert.strictEqual(r.engine, 'codex');
  assert.deepStrictEqual(T.hubToolsets(r), T.hubToolsets(dc), 'the switcher\'s Astra chat gets the director\'s tools');
}
// the renderer's decisions, run from their own source with stubbed globals
function source(file, start) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8'); const i = s.indexOf(start);
  assert(i >= 0, `${file}: ${start}`);
  if (start.startsWith('const ')) return s.slice(i, s.indexOf('\n', i));
  let depth = 0; let j = s.indexOf('{', i);
  for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break; }
  return s.slice(i, j + 1);
}
{ // astra.js switchDirector: "/director-engine claude" in the switcher's Astra chat of a Claude director
  const chat = { id: 'c1', engine: 'codex' }; const saved = [];
  const d = { id: 'threedirector', engine: 'claude', dock: 'three', model: 'm' };
  const ctx = vm.createContext({ Native: { chatOf: () => chat, save: (c) => saved.push(c), refresh: () => {} }, setAgent: (a, p) => Object.assign(a, p), astra: () => null, claude: () => null, EFFORTS: { claude: [], codex: [] } });
  vm.runInContext(`${source('astra.js', 'const chatEngine =')}\n${source('astra.js', 'function switchDirector(')}\nthis.sw = switchDirector; this.ce = chatEngine;`, ctx);
  assert.strictEqual(ctx.ce(d), 'codex', 'the chat\'s engine, not the director\'s');
  assert.strictEqual(ctx.sw(d, 'claude'), true, 'switching to Claude is not "already on Claude"');
  assert(!chat.engine && d.engine === 'claude' && chat.handoffNext && saved.length === 1, 'the chat goes back to the director\'s engine, with the task state');
  assert.strictEqual(ctx.sw(d, 'claude'), false, 'now it is on Claude');
  const plainChat = {}; ctx.Native.chatOf = () => plainChat;
  assert.strictEqual(ctx.sw(d, 'codex'), true); assert.strictEqual(d.engine, 'codex', 'a chat without its own engine switches the director as before');
}
{ // offline.js "Ask … instead": the other AI of the chat's own engine
  const claudeA = { id: 'claude', engine: 'claude' }; const astraA = { id: 'astra', engine: 'codex' };
  const ctx = vm.createContext({ Native: { partnerOf: (a) => (a.engine === 'codex' ? claudeA : astraA) } });
  vm.runInContext(`${source('offline.js', 'const engineOf =')}\n${source('offline.js', 'const otherOf =')}\nthis.o = otherOf;`, ctx);
  const d = { id: 'threedirector', engine: 'claude', dock: 'three' };
  assert.strictEqual(ctx.o(d, { engine: 'codex' }).engine, 'claude', 'Astra busy in the switcher\'s chat: ask Claude');
  assert.strictEqual(ctx.o(d, {}).engine, 'codex', 'Claude busy in the director\'s own chat: ask Astra');
}
{ // the other places that read the engine for a chat: the chat's own first (static: the same one-line pattern)
  const has = (file, re) => assert(re.test(fs.readFileSync(path.join(ROOT, file), 'utf8')), `${file}: ${re}`);
  has('native.js', /\(chatOf\(agentId\)\?\.engine \|\| H\.agent\(agentId\)\?\.engine\) === 'codex' \? 'read-only commands'/);
  has('director-cmds.js', /Astra\.chatEngine \? Astra\.chatEngine\(a\)/);
  has('attachlean.js', /Native\.chatOf\?\.\(id\)\?\.engine\) \|\| agentOf\(id\)\.engine/);
  has('concise.js', /\(chat\.engine \|\| a\.engine\) === 'codex'/);
  has('tools/three-history.js', /\(c\?\.engine \|\| H\.agent\?\.\(c\?\.agentId\)\?\.engine\) === 'codex'/);
  has('tools/three-txn.js', /\(c\?\.engine \|\| ag\?\.engine\) === 'codex' \? 'Astra'/);
}
ok('the chat-engine cases pick the chat\'s own engine (switchDirector, "Ask … instead", attachments, labels)');

console.log(`\n${passed} passed`);
