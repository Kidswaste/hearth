#!/usr/bin/env node
// Starts the hub MCP servers the way the CLIs do (stdio JSON-RPC, no hub needed) and checks their tool lists in lean and
// full mode, that three_do help is answered locally, that hub calls fail cleanly without a hub, and that no server
// sends instructions (the guides live in the system prompt).   node dev/director-mcp-test.js
const path = require('path');
const F = require('./fake-common');

const root = path.join(__dirname, '..');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  for (const mode of ['lean', 'full']) {
    const c = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'three-mcp.js')], env: mode === 'full' ? { HUB_TOOL_MODE: 'full' } : { HUB_TOOL_MODE: '' } });
    const names = c.tools.map((t) => t.name);
    check(mode === 'lean' ? names.includes('three_do') && names.length === 14 : !names.includes('three_do') && names.length === 34, `${mode}: ${names.length} tools`);
    check(names.includes('three_add_layer') && names.filter((n) => n === 'three_add_layer').length === 1, `${mode}: three_add_layer is an everyday tool (layers always)`);
    check(!c.instructions, `${mode}: no MCP instructions`);
    const h = await c.call('three_do', { cmd: 'help', topic: 'cues' });
    check(/CUE LOOKS/.test(h.content[0].text), `${mode}: help answered locally (${h.content[0].text.length} chars)`);
    const u = await c.call('three_do', { cmd: 'help', topic: 'nope' });
    check(/Topics:/.test(u.content[0].text) && /\bapp\b/.test(u.content[0].text), `${mode}: unknown topic lists the topics (with the app map)`);
    for (const t of ['app', 'lab', 'nodes', 'react', 'commands', 'handoff', 'habits']) {
      const r = await c.call('three_do', { cmd: 'help', topic: t });
      check(r.content[0].text.length > 200 && !r.isError, `${mode}: app map "${t}" answered locally (${r.content[0].text.length} chars)`);
    }
    c.close();
  }
  // the node tool: on for Three directors (engines.js sets HUB_NODES_TOOL=1 unless agent.nodesTool === false), lean
  const n = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'three-mcp.js')], env: { HUB_NODES_TOOL: '1', HUB_TOOL_MODE: '' } });
  const nt = n.tools.find((t) => t.name === 'three_nodes');
  check(n.tools.length === 15 && nt && JSON.stringify(nt).length < 520, `nodes on: ${n.tools.length} tools, three_nodes ${nt ? JSON.stringify(nt).length : 0} chars`);
  n.close();
  const engines = require(path.join(root, 'engines.js'))._test;
  const dir = { id: 'td', name: 'Three Director', engine: 'claude', dock: 'three', threeTools: true };
  check(engines.hubToolEnv(dir).HUB_NODES_TOOL === '1' && !engines.hubToolEnv({ ...dir, nodesTool: false }).HUB_NODES_TOOL && !engines.hubToolEnv({ id: 'v', engine: 'claude', videoTools: true }).HUB_NODES_TOOL, 'nodes tool on by default for Three directors only; /nodes-director off drops it');
  const pc = engines.buildPrompt(dir); const px = engines.buildPrompt({ ...dir, engine: 'codex', hubTools: true });
  check(/ONE LAYER PER EFFECT/.test(pc) && /TIME FIRST/.test(pc) && /NODES \(the owner/.test(pc) && /HEARTH \(the owner's app/.test(pc), 'Three Director prompt: layers, time first, nodes, app map line');
  check(px.includes('ONE LAYER PER EFFECT') && px.includes('NODES (the owner') && px.includes('three_do help app'), 'Astra as director gets the same guide');
  const cx = engines.codexArgs({ ...dir, engine: 'codex', hubTools: true, hubChatId: 'td-abc' }, {}, {}).join(' ');
  check(/mcp_servers\.three\.env=\{[^}]*HUB_CHAT_ID="td-abc"[^}]*HUB_NODES_TOOL="1"/.test(cx) && /mcp_servers\.chat\./.test(cx), 'Astra director: -c mcp_servers with the chat id, the node tool and the chat tools');
  check(!/react to the loaded music through the audio globals/.test(engines.buildPrompt({ ...dir, toolMode: 'full' })), 'full mode: no "always react to the music" rule');
  const f = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'forge-game-mcp.js')] });
  check(f.tools.some((t) => t.name === 'forge_patch') && !f.tools.some((t) => /saved game state/.test(t.description)), `forge: ${f.tools.length} tools, guide not repeated in descriptions`);
  f.close();
  for (const s of ['video-mcp.js', 'chat-mcp.js']) {
    const c = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', s)] });
    check(c.tools.length > 0 && !c.instructions, `${s}: ${c.tools.length} tools, no instructions`);
    if (s === 'video-mcp.js') {
      const h = await c.call('hearth_help', { topic: 'video' });
      check(/VIDEO REVIEW/.test(h.content[0].text) && !h.isError, 'video: hearth_help answered locally');
    }
    c.close();
  }
  const { fmtValue } = require(path.join(root, 'mcp', 'common.js'));
  check(fmtValue({ a: 1, b: 'x\ny', c: ['p', 'q'] }) === 'a: 1\nb:\nx\ny\nc:\n  p\n  q', 'result text format');
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
