#!/usr/bin/env node
// Fake Codex CLI for development: speaks the `codex exec --json` JSONL that engines.js parses (thread.started,
// reasoning / agent_message items, mcp tool calls, turn.completed with the thread's RUNNING usage totals, like the
// real one). Point Settings → Engines at it: settings.enginePaths.codex = "<hearth>/dev/fake-codex.js"
// (on Windows dev/fake-codex.cmd). Keywords in the message pick the behavior: see dev/fake-common.js.
const F = require('./fake-common');

(async () => {
  const argv = process.argv.slice(2);
  if (argv[0] === 'login' || argv[0] === '--version') { console.log('fake-codex 0.0.0'); return; }
  const resume = argv.indexOf('resume');
  const threadId = resume >= 0 ? argv[resume + 1] : F.uuid();
  const prompt = await F.readStdin();
  const { p, thinking } = F.plan(prompt, 'codex');
  let { text } = F.plan(prompt, 'codex');
  // -c mcp_servers.<name>.<key>=<TOML value> (engines.js codexArgs) → { name: { command, args, env } }
  const servers = {};
  argv.forEach((a, i) => {
    const m = argv[i - 1] === '-c' && a.match(/^mcp_servers\.([\w-]+)\.(\w+)=([\s\S]*)$/);
    if (!m) return;
    const v = m[3].trim();
    let val;
    try { val = JSON.parse(v.startsWith('{') ? v.replace(/([{,]\s*)([A-Za-z_][\w]*)\s*=/g, '$1"$2":') : v); } catch { val = v; }
    (servers[m[1]] ||= {})[m[2]] = val;
  });
  const state = F.loadState(`codex-${threadId}`);
  const wait = F.delayMs(p);
  if (resume < 0) F.out({ type: 'thread.started', thread_id: threadId });
  F.out({ type: 'turn.started' });
  if (p.login) { F.out({ type: 'turn.failed', error: { message: 'Not logged in. Please run codex login' } }); return; }
  if (p.crash) { process.stderr.write('fake-codex: simulated crash\n'); process.exit(3); }
  let n = 0;
  if (thinking) {
    await F.sleep(wait * 8);
    F.out({ type: 'item.completed', item: { id: `item_${n++}`, type: 'reasoning', text: thinking } });
  }
  const toolCalls = p.tools3 ? [['three', 'three_screenshot'], ['three', 'three_eval'], ['three', 'three_edit_code']] : p.tool ? [['docs', 'search']] : [];
  for (const [server, tool] of toolCalls) {
    const id = `item_${n++}`;
    F.out({ type: 'item.started', item: { id, type: 'mcp_tool_call', server, tool, status: 'in_progress' } });
    await F.sleep(wait * 6);
    F.out({ type: 'item.completed', item: { id, type: 'mcp_tool_call', server, tool, status: 'completed' } });
  }
  if (p.mcp) {
    const lines = [`servers: ${Object.keys(servers).join(', ') || 'none'}`];
    const clients = {};
    for (const [tool0, a0, fallback] of p.mcpCalls || [['three_console', {}]]) {
      let [tool, a] = [tool0, a0];
      const spec = F.serverFor(servers, tool);
      if (!spec) { lines.push(`${tool}: no server`); continue; }
      const name = Object.keys(servers).find((k) => servers[k] === spec);
      clients[name] ||= await F.mcpClient(spec);
      if (fallback && !clients[name].tools.some((t) => t.name === tool)) [tool, a] = fallback;
      const id = `item_${n++}`;
      F.out({ type: 'item.started', item: { id, type: 'mcp_tool_call', server: name, tool, arguments: a, status: 'in_progress' } });
      const r = await clients[name].call(tool, a);
      const t = (r.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n');
      F.out({ type: 'item.completed', item: { id, type: 'mcp_tool_call', server: name, tool, status: r.isError ? 'failed' : 'completed' } });
      lines.push(`${tool}: ${r.isError ? 'ERROR ' : ''}${t.length} chars · ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    for (const c of Object.values(clients)) c.close();
    text += `\n\nMCP calls:\n${lines.map((l) => `- ${l}`).join('\n')}`;
  }
  if (p.error) { F.out({ type: 'turn.failed', error: { message: 'Fake Codex error: stream disconnected' } }); return; }
  // Codex sends whole messages, not deltas: wait about as long as a stream would take, then send it.
  await F.sleep(Math.min(6000, F.pieces(text).length * wait));
  F.out({ type: 'item.completed', item: { id: `item_${n++}`, type: 'agent_message', text } });
  state.turns += 1;
  state.chars += prompt.length + text.length;
  // running totals for the whole thread (the hub shows the per-turn difference)
  state.input += p.big ? 125000 : 4200 + Math.ceil(state.chars / 4);
  state.output += Math.ceil((text.length + thinking.length) / 4);
  F.saveState(`codex-${threadId}`, state);
  F.out({ type: 'turn.completed', usage: { input_tokens: state.input, cached_input_tokens: Math.round(state.input * 0.8), output_tokens: state.output } });
})();
