#!/usr/bin/env node
// (round 36, tokenaudit) "Where its tokens go": the breakdown of the fixed part each message carries must add up to
// what the engine really gets, and its trims must say exactly what they save. Engines + store + mcp/ are copied to a
// temp folder (a sample memory, a connection, a claude.ai connector cache there; no real data), like dev/tokens-test.js.
//   node dev/tokenaudit-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenaudit-test-'));
for (const f of ['engines.js', 'store.js', 'installs.js', 'winpolish.js', 'macpolish.js', 'access-rules.js', 'connectionsmain.js', 'recall-core.js', 'context-core.js', 'tokenauditmain.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data', 'chats'), { recursive: true });
const MEMORY = { shared: '- I post 9:16 visuals on Shorts\n- Keep bloom subtle\n- I hate camera shake', agents: { claude: '- Call me Sam' } };
const writeMemory = (m) => fs.writeFileSync(path.join(dir, 'data', 'memory.json'), JSON.stringify(m));
writeMemory(MEMORY);
// Claude's connected apps as its startup report lists them (engines.js discoverConnectors → connectors.json)
fs.writeFileSync(path.join(dir, 'data', 'connectors.json'), JSON.stringify({ claude: { servers: [{ name: 'claude.ai Gmail', status: 'connected' }], tools: ['mcp__claude_ai_Gmail__search_threads', 'mcp__claude_ai_Gmail__get_thread', 'mcp__claude_ai_Gmail__create_draft', 'mcp__claude_ai_Gmail__list_labels'], checkedAt: 1 } }));
const engines = require(path.join(dir, 'engines.js'));
const cost = require(path.join(dir, 'mcp', 'cost.js'));
const Conn = require(path.join(dir, 'connectionsmain.js'));
const TA = require(path.join(dir, 'tokenauditmain.js'));
const C = require(path.join(ROOT, 'tokenaudit-core.js'));
const CONN = { id: 'k1', name: 'Notes', command: process.execPath, args: [path.join(__dirname, 'fake-mcp-server.js')], tools: [{ n: 'notes_list', ro: true }, { n: 'notes_read', ro: true }, { n: 'notes_write', ro: false }, { n: 'notes_env', ro: true }], tokens: 160 };
Conn.setReader(() => ({ connections: [CONN] }));
const tok = cost.tok;

const fails = [];
const check = (ok, what, info) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) { fails.push(what); if (info !== undefined) console.log('   ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 600)); } };
const DAY = 864e5;
const NOW = Date.now();
const OLD_LOG = { since: NOW - 40 * DAY, days: {} }; // tracked long enough, nothing used
const CLAUDE = { id: 'claude', name: 'Claude', engine: 'claude', mode: 'native', effort: 'high' };
const ASTRA = { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native', effort: 'high' };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', engine: 'claude', mode: 'native', dock: 'three', threeTools: true };
const KINDS = [
  ['plain Claude', CLAUDE], ['plain Astra', ASTRA], ['Three Director', DIRECTOR], ['Three Director on Astra', { ...DIRECTOR, id: 'tdx', engine: 'codex', hubTools: true }],
  ['Claude + board tools', { ...CLAUDE, boardTools: true }], ['Claude + capture + apps', { ...CLAUDE, captureTools: true, appsTools: true }],
  ['Claude + a connection + Gmail', { ...CLAUDE, connections: { k1: 'read' }, connectors: { 'claude.ai Gmail': 'read' } }],
  ['Claude, personality + instructions + no chat tools', { ...CLAUDE, chatTools: false, systemPrompt: 'You are a blunt art director.', instructions: [{ text: 'Always 9:16' }, { text: 'Off one', on: false }], verbosity: 'low' }],
];

// 1. the lines add up to what the engine really gets
for (const [label, agent] of KINDS) {
  const before = engines.buildPrompt(agent);
  const m = TA.measure(agent);
  const b = C.breakdown(m, { agent, log: OLD_LOG, now: NOW });
  const real = tok(before);
  const sets = cost.exactOf({ ...agent, exact: true }).tools.reduce((n, t) => n + t[1], 0);
  const lineSum = b.prompt.reduce((n, p) => n + p.tokens, 0);
  check(m.parts.map((p) => p[1]).join('\n\n') === before && engines.buildPrompt(agent) === before, `${label}: the parts are the prompt the engine gets, byte for byte (${before.length} chars), and measuring changes nothing`);
  check(Math.abs(lineSum - real) <= 1 && b.promptTotal === lineSum, `${label}: prompt lines add up to the real prompt (${lineSum} vs ${real} tokens)`);
  const toolSets = b.tools.filter((t) => t.kind === 'set').reduce((n, t) => n + t.tokens, 0);
  check(toolSets === sets, `${label}: Hearth tool lines = the tool definitions sent (${toolSets} vs ${sets})`);
  check(Math.abs(b.total - m.total) <= 1, `${label}: total ${b.total} ≈ the fixed part measured as one (${m.total})`);
}

// 2. connectors and connections
{
  const a = KINDS[6][1];
  const b = C.breakdown(TA.measure(a), { agent: a, log: OLD_LOG, now: NOW });
  const gm = b.tools.find((t) => t.kind === 'connector');
  const cn = b.tools.find((t) => t.kind === 'conn');
  check(gm && gm.estimate && gm.tokens === 3 * TA.CONNECTOR_TOOL && gm.label === 'Gmail', `a read-only claude.ai connector: its 3 read tools, an estimate (${gm?.tokens})`);
  check(cn && cn.tokens === 120 && cn.label === 'Notes', `a read-only connection: its measured list × the read tools' share (${cn?.tokens})`);
  check(/connected apps/.test(engines.buildPrompt(a)) && b.prompt.some((p) => p.key === 'apps'), 'the "connected apps" line is its own prompt line');
  const off = b.trims.find((t) => t.key === 'connector:claude.ai Gmail');
  check(off && off.saves === tok(engines.buildPrompt(a)) + 0 - tok(engines.buildPrompt(TA.without(a, { kind: 'connector', id: 'claude.ai Gmail' }))) + gm.tokens, `turning Gmail off saves its tools + its prompt line (${off?.saves})`);
}

// 3. trims: an unused opt-in tool set says exactly what the next prompt loses
{
  const a = { ...CLAUDE, boardTools: true };
  const m = TA.measure(a);
  const b = C.breakdown(m, { agent: a, log: OLD_LOG, now: NOW, weekReplies: 70 });
  const board = b.tools.find((t) => t.id === 'boardTools');
  const after = TA.measure(TA.without(a, board));
  check(board.trim && board.trim.kind === 'off' && board.trim.saves === m.total - after.total, `board tools unused in 30 days: "Turn off" saves ${board.trim?.saves} = ${m.total} − ${after.total}, the next prompt's real change`);
  check(board.trim.saves === board.tokens + board.guide, `…its definitions (${board.tokens}) + its one prompt line (${board.guide})`);
  check(!TA.measure(TA.without(a, board)).tools.some((t) => t.id === 'boardTools') && !/MOOD BOARD/.test(engines.buildPrompt(TA.without(a, board))), 'with it off, the set and its line are gone');
  check(b.savePerMsg === b.trims.reduce((n, t) => n + t.saves, 0) && b.perWeek === b.savePerMsg * 70, `per message ${b.savePerMsg}, per week at 70 replies ${b.perWeek}`);
  check(b.nudge && /^Mood board: ≈ [\d.]+k? tokens a message, not used in 30 days$/.test(b.nudge.text), `one nudge for the unused set over 500 tokens: “${b.nudge?.text}”`);
  // used this week: no trim, the count shows
  const log = { since: NOW - 40 * DAY, days: {} };
  C.addUse(log, 'claude', ['mcp__board__board_vibe', 'mcp__board__board_look · x', 'mcp__chat__chat_ask', 'Read · a.png'], NOW);
  const b2 = C.breakdown(m, { agent: a, log, now: NOW });
  check(b2.tools.find((t) => t.id === 'boardTools').used === 2 && !b2.tools.find((t) => t.id === 'boardTools').trim && b2.tools.find((t) => t.id === 'chatTools').used === 1 && !b2.nudge, 'used this week: "used 2 times", no trim, no nudge');
  // not tracked for 30 days yet: no "not used in 30 days" claim
  const b3 = C.breakdown(m, { agent: a, log: { since: NOW - 5 * DAY, days: {} }, now: NOW });
  check(!b3.trims.length && !b3.nudge && !b3.tracked, 'tracked for 5 days only: no trim offered');
  // another AI used the board in the last 30 days (usage.js counts every AI): not "unused"
  const day = C.dayKey(NOW - 3 * DAY);
  const b4 = C.breakdown(m, { agent: a, log: OLD_LOG, now: NOW, dayItems: { [day]: { 'Agent tool › board_vibe': 2 } } });
  check(!b4.tools.find((t) => t.id === 'boardTools').trim, 'a board tool call by any AI in 30 days (usage log): no trim');
  // a director's own tools are never offered off
  const bd = C.breakdown(TA.measure(DIRECTOR), { agent: DIRECTOR, log: OLD_LOG, now: NOW });
  check(!bd.trims.some((t) => t.id === 'threeTools' || t.id === 'chatTools'), 'the Three Director: Lab and chat tools never offered off');
  // a plain chat's chat tools are (and switching them off is measured with whatever line comes instead)
  const bc = C.breakdown(TA.measure(CLAUDE), { agent: CLAUDE, log: OLD_LOG, now: NOW });
  const ct = bc.trims.find((t) => t.id === 'chatTools');
  const offC = TA.without(CLAUDE, { kind: 'set', id: 'chatTools' });
  check(ct && offC.chatTools === false && ct.saves === TA.measure(CLAUDE).total - TA.measure(offC).total, `a plain Claude chat's unused chat tools: saves ${ct?.saves} (the "no tools" line that comes instead counted)`);
}

// 4. Shorten: an over-long instruction, personality or memory (opens it; saves what is over a short one)
{
  const long = 'When you write captions, always include three hashtags about music visuals, the song name, the bpm, a call to action to follow the channel, and never use the word "vibes" or any emoji except fire, and keep it under two lines on a phone screen.';
  const a = { ...CLAUDE, instructions: [{ text: 'Always 9:16' }, { text: long }], systemPrompt: 'x'.repeat(800) };
  const b = C.breakdown(TA.measure(a), { agent: a, log: OLD_LOG, now: NOW });
  const ins = b.prompt.find((p) => p.key === 'instructions');
  const r1 = ins.rules.find((r) => r.index === 1);
  check(ins.rules.length === 2 && !ins.rules[0].trim && r1.trim && r1.tokens === tok(`- ${long}`) && r1.trim.saves === r1.tokens - C.SHORT.instruction, `the long instruction: Shorten (${r1.tokens} tokens, saves ${r1.trim?.saves})`);
  const per = b.prompt.find((p) => p.key === 'personality');
  check(per.trim && per.trim.saves === per.tokens - C.SHORT.personality && b.trims.length === 2 + b.tools.filter((t) => t.trim).length, `the long personality: Shorten (saves ${per.trim?.saves})`);
  writeMemory({ shared: Array.from({ length: 60 }, (_, i) => `- fact number ${i} about the owner's work and taste in visuals`).join('\n'), agents: {} });
  const bm = C.breakdown(TA.measure(CLAUDE), { agent: CLAUDE, log: OLD_LOG, now: NOW });
  check(bm.prompt.find((p) => p.key === 'memory')?.tokens === 0 && /messages it's about/.test(bm.prompt.find((p) => p.key === 'memory')?.note || ''), 'a big memory: 0 in the prompt, "only with the messages it\'s about"');
  writeMemory(MEMORY);
  const ms = C.breakdown(TA.measure(CLAUDE), { agent: CLAUDE, log: OLD_LOG, now: NOW });
  check(ms.prompt.find((p) => p.key === 'memory')?.tokens > 0 && !ms.prompt.find((p) => p.key === 'memory').trim, 'a small memory: in the prompt, nothing to shorten');
}

// 5. plain bits: tool names → servers, the log keeps 35 days, rounding adds up, the cache share
check(C.serverOf('mcp__three__three_eval') === 'three' && C.serverOf('mcp__claude_ai_Gmail__search_threads · x') === 'claude_ai_Gmail' && C.serverOf('board · board_look') === 'board' && C.serverOf('Read · a.png') === null && C.serverOf('Shell · ls -la') === null, 'tool names → their server (Claude and Codex spellings; built-ins none)');
const lg = { since: 0, days: { '2000-01-01': { claude: { three: 9 } } } };
C.addUse(lg, 'claude', ['mcp__three__three_eval'], NOW);
check(!lg.days['2000-01-01'] && lg.days[C.dayKey(NOW)].claude.three === 1, 'the log forgets days past 35');
const ap = C.apportion([10, 7, 3, 1, 22]);
check(ap.reduce((a, b) => a + b, 0) === Math.round(43 / 4), `rounding adds up exactly (${ap})`);
check(C.breakdown({ parts: [], tools: [] }, { cache: { input: 1000, cached: 900 } }).cacheShare === 0.9, 'the cache usually covers: cached / input of its replies');

// 6. the history seed: tool calls from the last 35 days of chats
(async () => {
  const chats = path.join(dir, 'data', 'chats');
  fs.writeFileSync(path.join(chats, 'c1.json'), JSON.stringify({ id: 'c1', agentId: 'claude', messages: [{ role: 'user', text: 'hi', at: NOW - 50 * DAY }, { role: 'assistant', text: 'ok', at: NOW - 2 * DAY, tools: ['mcp__board__board_vibe', 'mcp__claude_ai_Gmail__get_thread', 'Read · x.png'] }, { role: 'assistant', text: 'ok', at: NOW - 40 * DAY, tools: ['mcp__board__board_look'] }] }));
  fs.writeFileSync(path.join(chats, 'c2.json'), JSON.stringify({ id: 'c2', agentId: 'astra', messages: [{ role: 'assistant', text: 'ok', at: NOW - DAY, tools: ['board · board_vibe', 'Shell · ls'] }] }));
  const s = await TA.seed(chats, 35, NOW);
  const all = (id, srv) => Object.values(s.days).reduce((n, d) => n + (d[id]?.[srv] || 0), 0);
  check(all('claude', 'board') === 1 && all('claude', 'claude_ai_Gmail') === 1 && all('astra', 'board') === 1 && !all('astra', 'Shell') && s.since === NOW - 35 * DAY, 'the seed counts the last 35 days\' tool calls per AI and server (older history: tracked from 35 days back)');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
