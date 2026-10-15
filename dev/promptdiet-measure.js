#!/usr/bin/env node
// (round 46, promptdiet) The fixed tokens of one message, per case the owner meets, as the engines really get them:
// the system prompt (engines.js buildPrompt of the agent send() builds for that run: engines._test.runAgent), the tool
// definitions as the engines name them (mcp/cost.js wire: mcp__server__tool + input_schema) and the text Hearth itself
// puts in the message (a 🔁 Keep going round's ask). No saved memory (the owner's own, counted by dev/tokens-test.js);
// the engines' own base prompts aren't Hearth's and aren't counted. Tokens ≈ characters / 4 (mcp/cost.js tok).
//   node dev/promptdiet-measure.js                         # the table
//   node dev/promptdiet-measure.js --json                  # the rows
//   node dev/promptdiet-measure.js --save before.json      # keep the numbers
//   node dev/promptdiet-measure.js --compare before.json   # before → after, % saved per case
//   ROOT=/path/to/other/tree node dev/promptdiet-measure.js # measure another copy of the app (an older commit)
// engines.js + store + mcp/ are copied to a temp folder with an empty data folder (no real data is read).
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : path.join(__dirname, '..');
const KEEP_GOING = 'Keep improving: do the next 5 improvements, then summarise what changed. If nothing is left worth doing, say so plainly.'; // routines-core.js DEFAULT_PROMPT

const CLAUDE = { id: 'claude', name: 'Claude', engine: 'claude', mode: 'native', effort: 'high' };
const ASTRA = { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native', effort: 'high' };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', engine: 'claude', mode: 'native', dock: 'three', threeTools: true };
const FORGE = { id: 'forgedebug', name: 'Forge Debug', engine: 'claude', mode: 'native', gameTools: true, companion: 'forge-game' };
// [key, label, agent, run options, Hearth's own text in the message]
const CASES = [
  ['claude', 'Plain Claude chat', CLAUDE, {}, ''],
  ['astra', 'Plain Astra (Codex) chat', ASTRA, {}, ''],
  ['director', 'Three Director (lean)', DIRECTOR, {}, ''],
  ['directorFull', 'Three Director (full)', { ...DIRECTOR, toolMode: 'full' }, {}, ''],
  ['directorAstra', 'Three Director on Astra', { ...DIRECTOR, engine: 'codex', hubTools: true }, {}, ''],
  ['forge', 'Forge director (Forge Debug)', FORGE, {}, ''],
  ['swarmClaude', 'Mission / swarm member (Claude)', CLAUDE, { lean: true, helper: true }, ''],
  ['swarmAstra', 'Mission / swarm member (Astra)', ASTRA, { lean: true, helper: true }, ''],
  ['keepGoing', '🔁 Keep going round (Director)', DIRECTOR, {}, KEEP_GOING],
];

function measure(root = ROOT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptdiet-'));
  try {
    for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'macpolish.js', 'access-rules.js', 'connectionsmain.js', 'recall-core.js', 'context-core.js', 'toolwake.js']) { try { fs.copyFileSync(path.join(root, f), path.join(dir, f)); } catch { /* optional */ } }
    fs.cpSync(path.join(root, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'data', 'kv'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data', 'memory.json'), '{}');
    const engines = require(path.join(dir, 'engines.js'));
    const cost = require(path.join(dir, 'mcp', 'cost.js'));
    const T = engines._test || {};
    const tok = cost.tok;
    return CASES.map(([key, label, agent0, options, text]) => {
      const agent = T.runAgent ? T.runAgent(agent0, { chatId: `pd-${key}`, session: {}, text: text || 'hello', options }).agent : agent0;
      const prompt = engines.buildPrompt(agent);
      const r = cost.exactOf({ ...agent, exact: true });
      const p = tok(prompt);
      const tools = r.wire;
      const msg = tok(text);
      return { key, label, prompt: p, tools, message: msg, total: p + tools + msg, sets: r.tools.map(([k]) => k), text: prompt };
    });
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}

function table(rows, before = null) {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (n, w = 7) => String(n).padStart(w);
  const lines = [];
  if (before) {
    const b = Object.fromEntries(before.map((r) => [r.key, r]));
    lines.push(`${pad('per message', 34)}${num('before', 8)}${num('after', 8)}${num('saved', 8)}${num('%', 6)}   prompt b→a · tools b→a`);
    for (const r of rows) {
      const o = b[r.key]; if (!o) continue;
      const pct = o.total ? Math.round(((o.total - r.total) / o.total) * 100) : 0;
      lines.push(`${pad(r.label, 34)}${num(o.total, 8)}${num(r.total, 8)}${num(o.total - r.total, 8)}${num(`${pct}%`, 6)}   ${o.prompt}→${r.prompt} · ${o.tools}→${r.tools}`);
    }
  } else {
    lines.push(`${pad('per message', 34)}${num('prompt')}${num('tools')}${num('msg', 5)}${num('total')}   tool sets`);
    for (const r of rows) lines.push(`${pad(r.label, 34)}${num(r.prompt)}${num(r.tools)}${num(r.message, 5)}${num(r.total)}   ${r.sets.join(', ') || '–'}`);
  }
  lines.push('tokens ≈ characters / 4; tools = definitions as the engines name them; msg = text Hearth adds to the message; no saved memory');
  return lines.join('\n');
}

module.exports = { measure, table, CASES, KEEP_GOING };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const rows = measure();
  const lean = rows.map(({ text, ...r }) => r);
  if (opt('--save')) fs.writeFileSync(opt('--save'), JSON.stringify(lean, null, 1));
  if (args.includes('--json')) console.log(JSON.stringify(lean, null, 1));
  else if (opt('--compare')) console.log(table(rows, JSON.parse(fs.readFileSync(opt('--compare'), 'utf8'))));
  else console.log(table(rows));
}
