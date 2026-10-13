#!/usr/bin/env node
// (round 31, tokensaver) The fixed tokens every message carries, per kind of AI, with a budget each: the system prompt
// (engines.js buildPrompt), the hub tool sets' definitions (mcp/*.js, measured by mcp/cost.js), saved memory and the
// owner's connections. Fails when one of them grows past its budget, like dev/director-mcp-test.js does for the
// director's lean list. Engines + store + mcp/ are copied to a temp folder (a sample memory there, no real data).
//   node dev/tokens-test.js            # checks + the table
//   node dev/tokens-test.js --table    # the table only (no checks)
//   node dev/tokens-test.js --json
// Tokens ≈ characters / 4 (mcp/cost.js tok). The engines' own base prompts (Claude Code's, Codex's) aren't Hearth's
// and aren't counted.
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('./fake-common');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokens-test-'));
for (const f of ['engines.js', 'store.js', 'installs.js', 'winpolish.js', 'access-rules.js', 'connectionsmain.js', 'recall-core.js', 'context-core.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
// a typical saved memory: 12 short facts shared + 3 of Claude's own (≈ 150 tokens)
const FACTS = ['I post 9:16 visuals on YouTube Shorts and TikTok', 'My songs are mostly 120–128 bpm house', 'I prefer pink, cyan and dusk palettes', 'Keep bloom subtle, never blown out', 'I hate camera shake',
  'Exports go to the Renders folder on the Mac', 'I use the Lab sequence as my video timeline', 'Sliders grouped Look / Motion / Music', 'My channel is called Hearthbeat', 'Fonts: Space Grotesk for titles',
  'Never use stock footage literally, only as a vibe', 'Freeze frames are my thumbnails'];
const MEMORY = { shared: FACTS.map((f) => `- ${f}`).join('\n'), agents: { claude: '- Answer short, I read on my phone\n- I run Hearth on a Mac and a PC\n- Call me Sam' } };
const writeMemory = (m) => fs.writeFileSync(path.join(dir, 'data', 'memory.json'), JSON.stringify(m));
writeMemory(MEMORY);
const engines = require(path.join(dir, 'engines.js'));
const cost = require(path.join(dir, 'mcp', 'cost.js'));
const Conn = require(path.join(dir, 'connectionsmain.js'));
const tok = cost.tok;
const CC = require(path.join(dir, 'context-core.js'));

const CONN = { id: 'k1', name: 'Notes', command: process.execPath, args: [path.join(__dirname, 'fake-mcp-server.js')] };
Conn.setReader(() => ({ connections: [CONN] }));

// The kinds of AI the owner talks to (config.json defaults + the director as makes.js / tools.js create it)
const CLAUDE = { id: 'claude', name: 'Claude', engine: 'claude', mode: 'native', effort: 'high' };
const ASTRA = { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native', effort: 'high' };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', engine: 'claude', mode: 'native', dock: 'three', threeTools: true };
const KINDS = [
  ['claude', 'Plain Claude chat', CLAUDE],
  ['astra', 'Plain Astra chat', ASTRA],
  ['director', 'Three Director (lean)', DIRECTOR],
  ['directorAstra', 'Three Director on Astra', { ...DIRECTOR, id: 'threedirector-x', engine: 'codex', hubTools: true }],
  ['board', 'Claude + board tools', { ...CLAUDE, boardTools: true }],
  ['capture', 'Claude + capture tools', { ...CLAUDE, captureTools: true }],
  ['apps', 'Claude + apps tools', { ...CLAUDE, appsTools: true }],
  ['astraBoard', 'Astra + board tools', { ...ASTRA, boardTools: true }],
  ['conn', 'Claude + a connection', { ...CLAUDE, connections: { k1: 'read' } }],
];
// Per-message ceilings (system prompt with the sample memory as each kind really gets it + tool definitions).
// Raise one only on purpose (an opt-in the owner asked for), never to make a growth pass.
// Before round 31: claude 869, astra 332, director 2930, board 1977, capture 1419, apps 1501, astra + board 1440, conn 1010.
const BUDGET = { claude: 600, astra: 340, director: 2900, directorAstra: 2900, board: 1500, capture: 1100, apps: 1120, astraBoard: 1240, conn: 750 };
// each opt-in tool set's own list (mcp/cost.js measure; the chat list as a plain chat gets it)
const SET_BUDGET = { chatLean: 310, chatTools: 560, boardTools: 800, captureTools: 500, appsTools: 470 };

async function connTokens() {
  const c = await F.mcpClient({ command: CONN.command, args: CONN.args });
  const n = Conn._test.tokensOf(c.tools);
  c.close();
  return n;
}

// typical messages, for the memory that goes along with a message (relevant mode: context-core.js relevant())
const ASKS = ['Make a neon orb visual for my song, 9:16 for Shorts', 'Use pink and cyan, keep the bloom subtle', 'Render it again for TikTok', 'What fps is the preview at?',
  'Write a caption for the post', 'Fix the error in the tunnel layer', 'Summarise this article for me', 'Make the particles react to the snare harder'];
function memoryInMessage(agent) {
  if (!CC.memoryRelevant(agent, MEMORY)) return 0;
  const facts = CC.memoryNotes(MEMORY, agent.id).flatMap((n) => n.split('\n')).map((l) => l.trim().replace(/^[-*•]\s+/, '')).filter(Boolean)
    .map((t) => ({ t, scope: 'agent', ...(CC.standing(t) ? { always: true } : {}) }));
  const each = ASKS.map((m) => { const r = CC.relevant(facts, m); return r.length ? CC.tok(`\n\n${CC.memoryLine(r)}`) : 0; });
  return Math.round(each.reduce((a, b) => a + b, 0) / each.length);
}

async function measureAll() {
  const connTok = await connTokens();
  const rows = [];
  for (const [key, label, agent] of KINDS) {
    const r = cost.exactOf({ ...agent, exact: true });
    const tools = r.tools.reduce((n, t) => n + t[1], 0) + (Conn.enabledFor(agent).length ? connTok : 0);
    const prompt = engines.buildPrompt(agent);
    writeMemory({});
    const bare = tok(engines.buildPrompt(agent));
    writeMemory(MEMORY);
    const inMsg = memoryInMessage(agent);
    const memory = r.system - bare + inMsg;
    rows.push({ key, label, system: r.system - (r.system - bare), memory, inMsg, tools, sets: r.tools.map(([k, t]) => `${k} ${t}`).concat(Conn.enabledFor(agent).length ? [`connection ${connTok}`] : []), total: bare + memory + tools, prompt });
  }
  return rows;
}

function printTable(rows) {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (n) => String(n).padStart(7);
  console.log(`${pad('per message', 28)}${num('prompt')}${num('memory')}${num('tools')}${num('total')}${num('budget')}   tool sets`);
  for (const r of rows) console.log(`${pad(r.label, 28)}${num(r.system)}${num(r.memory)}${num(r.tools)}${num(r.total)}${num(BUDGET[r.key])}   ${r.sets.join(', ') || '–'}`);
}

(async () => {
  const rows = await measureAll();
  if (args.includes('--json')) { console.log(JSON.stringify(rows.map(({ prompt, ...r }) => r), null, 2)); return finish(0); }
  printTable(rows);
  if (args.includes('--table')) return finish(0);
  const fails = [];
  const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
  console.log('');
  for (const r of rows) check(r.total <= BUDGET[r.key], `${r.label}: ${r.total} ≤ ${BUDGET[r.key]} tokens per message`);
  for (const [k, b] of Object.entries(SET_BUDGET)) { const n = cost.measure(k === 'chatLean' ? 'chatTools' : k, { chatLean: k === 'chatLean' }).total; check(n <= b, `${k} tool list: ${n} ≤ ${b}`); }
  const T = engines._test;
  const row = (k) => rows.find((r) => r.key === k);
  // only the guides of tool sets an AI has
  check(!/MOOD BOARD|APPS \(|CHAT TOOLS|Three Director|forge_/.test(row('claude').prompt), 'plain chat: no guide for tool sets it doesn\'t have');
  check(/MOOD BOARD/.test(row('board').prompt) && !/CHAT TOOLS/.test(row('board').prompt) && /APPS \(/.test(row('apps').prompt), 'board / apps: their one line only');
  check(/CHAT TOOLS/.test(row('director').prompt) && (row('director').prompt.match(/You are /g) || []).length === 1, 'director: the chat guide, one "You are…" line');
  // the lean chat list for plain chats, the whole list for directors
  check(T.hubToolEnv(CLAUDE, 'chatTools').HUB_CHAT_LEAN === '1' && !T.hubToolEnv(DIRECTOR, 'chatTools').HUB_CHAT_LEAN && !T.hubToolEnv({ ...CLAUDE, gameTools: true }, 'chatTools').HUB_CHAT_LEAN, 'plain chats get chat_do, directors the whole chat list');
  // a stable prefix: the same prompt every message, nothing that changes by itself (dates, times, counters)
  check(engines.buildPrompt(DIRECTOR) === engines.buildPrompt(DIRECTOR) && !/\b\d{4}-\d\d-\d\d\b|\b\d\d:\d\d\b/.test(rows.map((r) => r.prompt).join('\n')), 'prompts are stable (no dates / times)');
  // memory: a small one stays in the (cached) prompt; a big one goes only with the messages it's about
  const big = { shared: Array.from({ length: 40 }, (_, i) => `- fact number ${i} about the owner's work and taste in visuals`).join('\n'), agents: {} };
  check(!CC.memoryRelevant(CLAUDE, MEMORY) && CC.memoryRelevant(CLAUDE, big) && !CC.memoryRelevant({ ...CLAUDE, memoryWhenRelevant: false }, big) && CC.memoryRelevant({ ...CLAUDE, memoryWhenRelevant: true }, MEMORY), 'memory: in the prompt while small, relevant once big; on / off force it');
  writeMemory(big);
  const pBig = engines.buildPrompt(CLAUDE);
  writeMemory({ ...big, shared: `${big.shared}\n- one more fact` });
  check(!/fact number/.test(pBig) && pBig === engines.buildPrompt(CLAUDE), 'a big memory leaves the prompt, and a new fact doesn\'t change it (the cache holds)');
  writeMemory(MEMORY);
  check(CC.standing('Never use stock footage') && CC.standing('Call me Sam') && !CC.standing('My channel is called Hearthbeat'), 'standing preferences are told apart');
  // help on demand: what left the descriptions comes back, answered without the hub
  for (const [script, tool, topic, re, env] of [['board-mcp.js', 'board_do', 'board_vibe', /never place reference media/], ['board-mcp.js', 'board_do', 'pins', /pins \{query\?\}|Pinterest/], ['capture-mcp.js', 'capture_list', 'capture_frames', /barcode/], ['apps-mcp.js', 'apps_open', 'apps_open', /YouTube Studio/], ['chat-mcp.js', 'chat_do', 'progress', /checklist/, { HUB_CHAT_LEAN: '1' }]]) {
    const c = await F.mcpClient({ command: process.execPath, args: [path.join(ROOT, 'mcp', script)], env: { HUB_BRIDGE_INFO: path.join(dir, 'no-hub.json'), ...(env || {}) } });
    const r = await c.call(tool, { help: topic });
    check(!r.isError && re.test(r.content[0].text), `${tool} help ${topic}: the details, locally (${r.content[0].text.length} chars)`);
    c.close();
  }
  // chat_do reaches the hub under the tool's own name (native.js handlers unchanged)
  const http = require('http');
  const seen = [];
  const hub = await new Promise((res) => { const sv = http.createServer((q, r) => { let b = ''; q.on('data', (x) => { b += x; }); q.on('end', () => { seen.push(JSON.parse(b)); r.end(JSON.stringify({ ok: true, value: 'Shown.' })); }); }); sv.listen(0, '127.0.0.1', () => res(sv)); });
  const info = path.join(dir, 'hub.json');
  fs.writeFileSync(info, JSON.stringify({ port: hub.address().port, token: 't' }));
  const lc = await F.mcpClient({ command: process.execPath, args: [path.join(ROOT, 'mcp', 'chat-mcp.js')], env: { HUB_CHAT_LEAN: '1', HUB_BRIDGE_INFO: info, HUB_AGENT_ID: 'claude' } });
  const names = lc.tools.map((t) => t.name).join(',');
  const r1 = await lc.call('chat_do', { op: 'progress', steps: [{ text: 'a', status: 'doing' }] });
  const r2 = await lc.call('chat_progress', { steps: [] }); // an old name still works (not listed, still served)
  check(names === 'chat_ask,chat_open,chat_do' && !r1.isError && seen[0]?.tool === 'chat_progress' && seen[0]?.args.steps?.[0]?.text === 'a' && !('op' in seen[0].args) && seen[0].args.agentId === 'claude' && !r2.isError && seen[1]?.tool === 'chat_progress', `lean chat list (${names}); chat_do progress → the hub's chat_progress`);
  lc.close(); hub.close();
  return finish(fails.length ? 1 : 0, fails);
})().catch((e) => { console.error(e); finish(1); });

function finish(code, fails = []) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  if (fails.length) console.log(`\n${fails.length} failed`); else if (!args.includes('--table') && !args.includes('--json')) console.log('\nall passed');
  process.exit(code);
}
