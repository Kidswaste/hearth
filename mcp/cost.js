// What each hub tool set costs on every message: its MCP server's instructions + tool list (sent with each request
// as part of the tool definitions) and the lines it adds to the system prompt. Tokens ≈ characters / 4.
// Used by the hub (gamebridge.js → /director-cost) and dev/director-cost.js. Requires the servers' definitions only.
const path = require('path');

const tok = (s) => Math.round(String(s || '').length / 4);
const SETS = {
  threeTools: 'three-mcp.js', videoTools: 'video-mcp.js', gameTools: 'forge-game-mcp.js', chatTools: 'chat-mcp.js', captureTools: 'capture-mcp.js',
};
// The directors as they're usually set up (a real agent's flags are passed in by the hub).
const DIRECTORS = [
  { id: 'threedirector', name: 'Three Director', engine: 'claude', dock: 'three', threeTools: true },
  { id: 'videodirector', name: 'Video Director', engine: 'claude', dock: 'ae', videoTools: true },
  { id: 'forge', name: 'Forge Debug', engine: 'claude', gameTools: true },
];

function defOf(key, opts = {}) {
  const file = path.join(__dirname, SETS[key]);
  const before = process.env.HUB_NODES_TOOL;
  if (opts.nodesTool) process.env.HUB_NODES_TOOL = '1'; else delete process.env.HUB_NODES_TOOL;
  if (opts.toolMode) process.env.HUB_TOOL_MODE = opts.toolMode; else delete process.env.HUB_TOOL_MODE;
  delete require.cache[require.resolve(file)];
  try { return require(file); } finally { if (before == null) delete process.env.HUB_NODES_TOOL; else process.env.HUB_NODES_TOOL = before; delete process.env.HUB_TOOL_MODE; }
}

function measure(key, opts = {}) {
  const def = defOf(key, opts);
  const list = JSON.stringify(def.tools);
  return {
    key, server: def.name, tools: def.tools.length, guide: tok(def.instructions), list: tok(list), total: tok(def.instructions) + tok(list),
    each: def.tools.map((t) => ({ name: t.name, tokens: tok(JSON.stringify(t)) })),
  };
}

// System-prompt lines a director gets for its tool sets (and self-review): the prompt with them minus without them.
function promptPart(agent) {
  let engines;
  try { engines = require(path.join(__dirname, '..', 'engines.js')); } catch { return 0; }
  if (!engines.buildPrompt) return 0;
  const bare = { ...agent, threeTools: false, videoTools: false, gameTools: false, chatTools: false, dock: undefined, selfReview: false };
  return tok(engines.buildPrompt(agent)) - tok(engines.buildPrompt(bare));
}

function report(agents = DIRECTORS) {
  const sets = Object.keys(SETS).map((k) => measure(k));
  const directors = agents.map((a) => {
    const parts = [];
    for (const k of Object.keys(SETS)) {
      const on = k === 'chatTools' ? a.chatTools !== false : a[k];
      if (!on) continue;
      // Three directors get the node tool unless switched off (engines.js nodesOn)
      const nodes = k === 'threeTools' && a.nodesTool !== false;
      const m = k === 'threeTools' && (nodes || a.toolMode) ? measure(k, { nodesTool: nodes, toolMode: a.toolMode }) : sets.find((s) => s.key === k);
      parts.push({ what: m.server, tokens: m.total });
    }
    parts.push({ what: 'system prompt', tokens: promptPart(a) });
    return { id: a.id, name: a.name, engine: a.engine, total: parts.reduce((n, p) => n + p.tokens, 0), parts };
  });
  return { sets, directors, note: 'tokens ≈ characters / 4; sent with every message (mostly read from the prompt cache after the first)' };
}

module.exports = { report, measure, tok, DIRECTORS };
