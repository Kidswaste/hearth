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
    check(mode === 'lean' ? names.includes('three_do') && names.length === 14 : !names.includes('three_do') && names.length === 38, `${mode}: ${names.length} tools`);
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
  check(engines.hubToolEnv(dir).HUB_NODES_TOOL === '1' && !engines.hubToolEnv({ ...dir, nodesTool: false }).HUB_NODES_TOOL && !engines.hubToolEnv({ id: 'v', engine: 'claude', gameTools: true }).HUB_NODES_TOOL, 'nodes tool on by default for Three directors only; /nodes-director off drops it');
  const pc = engines.buildPrompt(dir); const px = engines.buildPrompt({ ...dir, engine: 'codex', hubTools: true });
  check(/ONE LAYER PER EFFECT/.test(pc) && /TIME FIRST/.test(pc) && /NODES \(the owner/.test(pc) && /HEARTH \(the owner's app/.test(pc), 'Three Director prompt: layers, time first, nodes, app map line');
  check(px.includes('ONE LAYER PER EFFECT') && px.includes('NODES (the owner') && px.includes('three_do help app'), 'Astra as director gets the same guide');
  const cx = engines.codexArgs({ ...dir, engine: 'codex', hubTools: true, hubChatId: 'td-abc' }, {}, {}).join(' ');
  check(/mcp_servers\.three\.env=\{[^}]*HUB_CHAT_ID="td-abc"[^}]*HUB_NODES_TOOL="1"/.test(cx) && /mcp_servers\.chat\./.test(cx), 'Astra director: -c mcp_servers with the chat id, the node tool and the chat tools');
  check(!/react to the loaded music through the audio globals/.test(engines.buildPrompt({ ...dir, toolMode: 'full' })), 'full mode: no "always react to the music" rule');
  // (round 22, labcrew) a crew helper: six tools, no guide, a short prompt; the chat's /crew on adds one line, only then
  const cr = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'three-mcp.js')], env: { HUB_TOOL_MODE: 'crew' } });
  const crTok = Math.round(JSON.stringify(cr.tools).length / 4);
  check(cr.tools.length === 6 && !cr.tools.some((t) => t.name === 'three_do') && !cr.instructions && crTok < 800, `crew helper: ${cr.tools.length} tools, ${crTok} tokens, no guide`);
  cr.close();
  const crewAgent = { ...dir, toolMode: 'crew', nodesTool: false };
  const cp = engines.buildPrompt(crewAgent);
  check(engines.hubToolEnv(crewAgent).HUB_TOOL_MODE === 'crew' && !engines.hubToolEnv(crewAgent).HUB_NODES_TOOL && /SKETCH = layers/.test(cp) && !/HEARTH \(the owner's app/.test(cp), 'crew helper prompt: the sketch rules, no app map, HUB_TOOL_MODE=crew');
  check(!/three_do crew/.test(pc) && /three_do crew/.test(engines.buildPrompt({ ...dir, crewOn: true })), 'the crew line only with /crew on');
  const f = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'forge-game-mcp.js')] });
  check(f.tools.some((t) => t.name === 'forge_patch') && !f.tools.some((t) => /saved game state/.test(t.description)), `forge: ${f.tools.length} tools, guide not repeated in descriptions`);
  f.close();
  for (const s of ['chat-mcp.js']) {
    const c = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', s)] });
    check(c.tools.length > 0 && !c.instructions, `${s}: ${c.tools.length} tools, no instructions`);
    c.close();
  }
  // (round 41, toolslim) a director's chat list: chat_ask + chat_progress + chat_do (show, second opinion, open, report)
  const dc = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'chat-mcp.js')], env: { HUB_CHAT_LEAN: '' } });
  const dTok = Math.round(JSON.stringify(dc.tools).length / 4);
  check(dc.tools.map((t) => t.name).join(',') === 'chat_ask,chat_progress,chat_do' && dTok <= 265 && /show .*second_opinion .*open /.test(dc.tools[2].description) && /chat_do show/.test(pc) && !/chat_show/.test(pc), `director chat list: ${dc.tools.map((t) => t.name).join(', ')}, ${dTok} tokens (532 before round 41); the guide names chat_do show`);
  dc.close();
  const { fmtValue } = require(path.join(root, 'mcp', 'common.js'));
  check(fmtValue({ a: 1, b: 'x\ny', c: ['p', 'q'] }) === 'a: 1\nb:\nx\ny\nc:\n  p\n  q', 'result text format');
  // (round 21, labdirector) a light boot, the new three_do commands, the lean list's size, hub errors and a restarted hub
  const boot = require('child_process').execFileSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(root, 'mcp', 'three-mcp.js'))}); console.log(JSON.stringify(Object.keys(require.cache).map((k) => require('path').basename(k)).concat(process.moduleLoadList.filter((m) => /NativeModule http$/.test(m)))))`], { encoding: 'utf8' });
  check(!/three-guide|hearth-map|NativeModule http/.test(boot), `three-mcp boots without the guide, the app map or http (${boot.trim()})`);
  const lean = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'three-mcp.js')], env: { HUB_TOOL_MODE: '', HUB_BRIDGE_INFO: path.join(require('os').tmpdir(), 'no-such-hub.json') } });
  const doT = lean.tools.find((t) => t.name === 'three_do');
  check(/batch \{ops/.test(doT.description) && /undo \{force\}/.test(doT.description) && !doT.inputSchema.properties.cmd.enum, 'three_do: batch and undo listed, no repeated enum of commands');
  const listTok = Math.round(JSON.stringify(lean.tools).length / 4);
  // (round 25, diet) the ceiling came down from 1,700: new director ops go behind three_do + help <cmd>, not in descriptions
  // (round 37, directorlean) and to 1,220 (1,186 now): the per-turn savings are in the results, the list stays put
  check(listTok <= 1220, `lean tool list ≤ 1220 tokens (${listTok}; 1300 before round 37, 1687 before round 25, 1878 before round 21)`);
  check(lean.tools.find((t) => t.name === 'three_read_code').inputSchema.properties.force, 'three_read_code takes force (code it already has is one line)');
  check(JSON.stringify(doT).length / 4 <= 200 && lean.tools.every((t) => JSON.stringify(t).length / 4 <= 130 || t.name === 'three_do'), `three_do ≤ 200 tokens (${Math.round(JSON.stringify(doT).length / 4)}), every other tool ≤ 130`);
  for (const [topic, re] of [['edit_code', /three_edit_code: .*find.*\nargs: layer, edits/s], ['update_layer', /three_do update_layer.*fadeIn/], ['particles', /particles \{op: .*GPU PARTICLES/s], ['batch', /batch \{ops/], ['screenshot', /three_screenshot: .*compare/], ['nodes', /three_nodes: .*NODES|three_nodes: /]]) {
    const r = await lean.call('three_do', { cmd: 'help', topic });
    check(re.test(r.content[0].text), `help ${topic}: the details the lean list leaves out (${r.content[0].text.length} chars)`);
  }
  const dcmds = lean.tools.find((t) => t.name === 'three_do').description;
  check(['layers', 'update_layer', 'keyframes', 'timeline_edit', 'footage', 'sequence', 'model', 'motion', 'particles', 'shader', 'asset', 'comp', 'crew', 'make', 'run'].every((c) => new RegExp(`\\b${c}\\b`).test(dcmds)), 'three_do still names every command');
  const off = await lean.call('three_console', {});
  check(off.isError && /not running/.test(off.content[0].text), `no hub: a clean one-line error (${off.content[0].text})`);
  lean.close();
  // a hub that restarted (new port + token) between two calls: the server reads its address again by itself
  const http = require('http'); const os = require('os'); const fs = require('fs');
  const info = path.join(os.tmpdir(), `hearth-mcp-test-${process.pid}.json`);
  const hub = (token) => new Promise((res) => { const sv = http.createServer((q, r) => { let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => { const ok = q.headers['x-hub-token'] === token; r.writeHead(ok ? 200 : 403); r.end(JSON.stringify(ok ? { ok: true, value: `hub ${token}` } : { ok: false, error: 'forbidden' })); }); }); sv.listen(0, '127.0.0.1', () => { fs.writeFileSync(info, JSON.stringify({ port: sv.address().port, token })); res(sv); }); });
  const h1 = await hub('one');
  const rc = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'three-mcp.js')], env: { HUB_TOOL_MODE: '', HUB_BRIDGE_INFO: info } });
  const a1 = await rc.call('three_console', {});
  h1.close(); await new Promise((r) => setTimeout(r, 50));
  const h2 = await hub('two');
  const a2 = await rc.call('three_console', {});
  check(a1.content[0].text === 'hub one' && a2.content[0].text === 'hub two', `a restarted hub is found again (${a1.content[0].text} → ${a2.content[0].text})`);
  rc.close(); h2.close(); fs.rmSync(info, { force: true });
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
