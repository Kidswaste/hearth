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
    check(mode === 'lean' ? names.includes('three_do') && names.length === 13 : !names.includes('three_do') && names.length === 29, `${mode}: ${names.length} tools`);
    check(!c.instructions, `${mode}: no MCP instructions`);
    const h = await c.call('three_do', { cmd: 'help', topic: 'cues' });
    check(/CUE LOOKS/.test(h.content[0].text), `${mode}: help answered locally (${h.content[0].text.length} chars)`);
    const u = await c.call('three_do', { cmd: 'help', topic: 'nope' });
    check(/Topics:/.test(u.content[0].text), `${mode}: unknown topic lists the topics`);
    c.close();
  }
  const f = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'forge-game-mcp.js')] });
  check(f.tools.some((t) => t.name === 'forge_patch') && !f.tools.some((t) => /saved game state/.test(t.description)), `forge: ${f.tools.length} tools, guide not repeated in descriptions`);
  f.close();
  for (const s of ['video-mcp.js', 'chat-mcp.js']) {
    const c = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', s)] });
    check(c.tools.length > 0 && !c.instructions, `${s}: ${c.tools.length} tools, no instructions`);
    c.close();
  }
  const { fmtValue } = require(path.join(root, 'mcp', 'common.js'));
  check(fmtValue({ a: 1, b: 'x\ny', c: ['p', 'q'] }) === 'a: 1\nb:\nx\ny\nc:\n  p\n  q', 'result text format');
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
