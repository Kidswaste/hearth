#!/usr/bin/env node
// Long-task liveness of the engine plumbing (round 21), plain Node against the fake engines' long scenarios
// (dev/fake-liveness.js): subagents parsed into a tree and kept out of the reply, every tool call counted, a huge
// tool result that doesn't block the main process, streamed pieces batched (fewer IPC messages), pulses while a tool
// is silent, a killed engine and an engine whose helper keeps stdout open both end the reply with an error.
//   node dev/liveness-test.js                 # asserts (exit 1 on failure)
//   node dev/liveness-test.js --engines <file> --measure   # numbers only, for an older engines.js (before → after)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { monitorEventLoopDelay } = require('perf_hooks');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const measureOnly = argv.includes('--measure');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liveness-'));
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
if (opt('--engines')) fs.copyFileSync(path.resolve(opt('--engines')), path.join(dir, 'engines.js'));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
process.env.HEARTH_QUIET_MS = '2000'; process.env.HEARTH_PULSE_MS = '1000'; // pulses within seconds, not 15 s
const engines = require(path.join(dir, 'engines.js'));
engines.setEnginePaths({ claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') });
const claude = { id: 'claude', name: 'Claude', mode: 'native', engine: 'claude', noHubTools: true };
const codex = { id: 'astra', name: 'Astra', mode: 'native', engine: 'codex', noHubTools: true };
const END = new Set(['done', 'error', 'stopped']);

// one turn: its events, the end, the reply text, how many emits, the main thread's worst block while it ran
function turn(agent, text, { timeout = 60000, onEvent } = {}) {
  return new Promise((resolve) => {
    const events = [];
    const chatId = `lv-${Math.random().toString(36).slice(2)}`;
    const lag = monitorEventLoopDelay({ resolution: 5 }); lag.enable();
    const t0 = Date.now();
    const timer = setTimeout(() => { lag.disable(); engines.stop(chatId); resolve({ events, end: { type: 'timeout' }, ms: Date.now() - t0, chatId }); }, timeout);
    let emits = 0;
    engines.send({ agent, chatId, session: {}, text, options: {} }, (e) => {
      events.push(e); emits += 1;
      onEvent?.(e, chatId);
      if (!END.has(e.type)) return;
      clearTimeout(timer); lag.disable();
      resolve({ events, end: e, ms: Date.now() - t0, chatId, text: events.filter((x) => x.type === 'delta').map((x) => x.text).join(''), maxBlockMs: Math.round(lag.max / 1e6), emits });
    }, (e) => { events.push(e); onEvent?.(e, chatId); }); // live: steps, agents, pulses
  });
}

(async () => {
  const out = {};
  let passed = 0;
  const ok = (name) => { passed += 1; if (!measureOnly) console.log(`✓ ${name}`); };
  const check = (cond, msg) => { if (!measureOnly) assert(cond, msg); };

  // ---- subagents (Claude stream-json): a tree, kept out of the reply
  const sub = await turn(claude, 'subagents');
  const agents = sub.events.filter((e) => e.type === 'agent');
  const tools = sub.events.filter((e) => e.type === 'tool');
  out.subagents = { end: sub.end.type, leakedIntoReply: /Subagent A thinking/.test(sub.text || ''), toolEvents: tools.length, mainTools: tools.filter((t) => !t.parent).length, agentEvents: agents.length };
  check(sub.end.type === 'done', 'subagents turn ends');
  check(!out.subagents.leakedIntoReply, "a subagent's own text never streams into the main reply");
  const started = agents.filter((a) => a.status === 'running');
  check(started.length === 3 && started.map((a) => a.description).join('|') === 'Shader glow pass|Particle field|Audio map', 'three agents start with their descriptions (two in one message)');
  const endOf = (d) => { const id = started.find((a) => a.description === d)?.id; return agents.find((a) => a.id === id && a.status !== 'running'); };
  check(endOf('Shader glow pass')?.status === 'done' && /Bloom pass/.test(endOf('Shader glow pass').summary), 'a finished agent carries its result summary');
  check(endOf('Particle field')?.status === 'failed', 'a failed agent is marked failed');
  check(tools.filter((t) => t.parent).length === 5 && tools.filter((t) => t.parent).every((t) => started.some((a) => a.id === t.parent)), "each subagent's tool calls carry their agent");
  check(sub.events.some((e) => e.type === 'step' && e.ok === false), 'tool results come back as steps (failed ones marked)');
  ok('Claude subagents: tree, statuses, summaries, nothing leaked into the reply');

  // ---- Codex collab agents
  const csub = await turn(codex, 'subagents');
  const cag = csub.events.filter((e) => e.type === 'agent');
  out.codexAgents = cag.map((a) => `${a.description || a.id}:${a.status}`);
  check(csub.end.type === 'done', 'codex subagents turn ends');
  check(cag.some((a) => a.status === 'running') && cag.some((a) => a.status === 'done') && cag.some((a) => a.status === 'failed'), 'codex spawn / wait states become running / done / failed agents');
  ok('Codex collab agents: running → done / failed');

  // ---- a marathon: every tool counted, pieces batched
  const mar = await turn(claude, 'marathon:150 longthink:120', { timeout: 120000 });
  const pieces = mar.events.filter((e) => e.type === 'delta' || e.type === 'thinking').length;
  out.marathon = { end: mar.end.type, secs: mar.ms / 1000, emits: mar.emits, streamPieces: pieces, tools: mar.events.filter((e) => e.type === 'tool').length, maxBlockMs: mar.maxBlockMs };
  check(mar.end.type === 'done', 'marathon ends');
  check(out.marathon.tools === 150, 'every tool call shows up');
  check(pieces < 1200, `streamed pieces are batched (${pieces})`);
  ok(`marathon: 150 tools, ${out.marathon.emits} emits, worst block ${mar.maxBlockMs} ms`);

  // ---- a huge tool result on one line
  const huge = await turn(claude, 'hugeout:24', { timeout: 120000 });
  out.hugeout = { end: huge.end.type, secs: huge.ms / 1000, maxBlockMs: huge.maxBlockMs };
  check(huge.end.type === 'done', 'a 24 MB line does not stop the reply');
  check(huge.maxBlockMs < 250, `a 24 MB line does not block the main process (${huge.maxBlockMs} ms)`);
  ok(`24 MB tool result: worst block ${huge.maxBlockMs} ms`);

  // ---- silence while a tool runs: pulses say the process is alive, and which tool
  const q = await turn(claude, 'busyquiet:7', { timeout: 60000 });
  const pulses = q.events.filter((e) => e.type === 'pulse');
  out.quiet = { end: q.end.type, pulses: pulses.length, last: pulses.at(-1) || null };
  check(q.end.type === 'done', 'quiet turn ends');
  check(pulses.length >= 1 && pulses.every((p) => p.alive) && /three_screenshot/.test(pulses.at(-1).tool || ''), 'pulses during the silence: alive, on its tool');
  ok('silent tool: pulses carry alive + the running tool');

  // ---- a killed engine: an error with the partial text kept by the chat
  const die = await turn(claude, 'die', { timeout: 20000 });
  out.die = { end: die.end.type, message: die.end.message, partial: die.text };
  check(die.end.type === 'error' && /stopped unexpectedly|killed|SIGKILL/i.test(die.end.message || ''), 'a killed engine ends with a clear error');
  ok('killed engine: clear error');

  // ---- the engine exits while a helper it started keeps stdout open
  const orph = await turn(claude, 'orphan', { timeout: 30000 });
  out.orphan = { end: orph.end.type, secs: orph.ms / 1000, message: orph.end.message };
  check(orph.end.type === 'error' && orph.ms < 10000, `an exited engine ends the reply even when a helper holds its output (${orph.ms} ms)`);
  ok('exited engine with a helper holding stdout: ends in seconds');

  // ---- a hung engine: Stop ends it as stopped
  let hungId = null;
  const hang = turn(claude, 'hang', { timeout: 30000, onEvent: (e, id) => { hungId = id; } });
  await new Promise((r) => setTimeout(r, 1500));
  engines.stop(hungId);
  const h = await hang;
  out.hang = { end: h.end.type };
  check(h.end.type === 'stopped', 'a hung engine stops on Stop');
  ok('hung engine: Stop works');

  console.log(JSON.stringify(out, null, 1));
  if (!measureOnly) console.log(`\n${passed} liveness checks passed`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
