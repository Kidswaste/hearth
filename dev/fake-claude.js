#!/usr/bin/env node
// Fake Claude Code CLI for development: speaks the same `-p --output-format stream-json --verbose
// --include-partial-messages` JSONL that engines.js parses (init, thinking / text deltas, tool_use, result with
// usage). Point Settings → Engines at it: settings.enginePaths.claude = "<hearth>/dev/fake-claude.js"
// (on Windows use dev/fake-claude.cmd). Keywords in the message pick the behavior: see dev/fake-common.js.
const F = require('./fake-common');

(async () => {
  const argv = process.argv.slice(2);
  // failure switches (fake-common.js): an old copy, signed out, too old for the model, network, MCP config
  const sw = F.switches();
  const version = sw.claudeVersion || '2.1.300';
  if (argv[0] === '--version') { console.log(`${version} (Claude Code) fake`); return; }
  // claudeNoAuth: an older Claude Code whose --help has no `auth` command
  if (argv[0] === '--help') { console.log(['Usage: claude [options] [command] [prompt]', '', 'Commands:', sw.claudeNoAuth ? null : '  auth              Manage authentication', '  mcp               Configure MCP servers', '  update            Check for updates and install'].filter((l) => l !== null).join('\n')); return; }
  if (argv[0] === 'auth' && sw.claudeNoAuth) { console.log('(fake) "auth" taken as a prompt: an old Claude Code'); process.exit(2); }
  if (argv[0] === 'auth' && argv[1] === 'status') {
    if (sw.claudeLoggedOut) { console.log('Not logged in. Run claude auth login'); process.exit(1); }
    console.log('Logged in (fake Claude Max account)'); return;
  }
  if (argv[0] === 'auth' || argv[0] === '/login') { F.setSwitch({ claudeLoggedOut: null, claudeExpired: null }); console.log('(fake) signed in'); return; }
  if (argv[0] === 'update') { const to = sw.updateTo || '2.1.400'; F.setSwitch({ claudeVersion: to }); console.log(`Successfully updated from ${version} to version ${to}`); return; }
  // FAKE_CLAUDE_REJECT=--flag,--other acts like a Claude Code version that doesn't know those options
  const reject = (process.env.FAKE_CLAUDE_REJECT || '').split(',').find((f) => f && argv.includes(f));
  if (reject) { process.stderr.write(`error: unknown option '${reject}'\n`); process.exit(1); }
  // like the real CLI: a --mcp-config file that isn't there stops it before anything else
  const mcpAt = argv.indexOf('--mcp-config');
  if (mcpAt >= 0 && F.trip('claude-mcp', sw.claudeMcpMissing)) require('fs').rmSync(argv[mcpAt + 1], { force: true });
  if (mcpAt >= 0 && !require('fs').existsSync(argv[mcpAt + 1])) { process.stderr.write(`Error: Invalid MCP configuration:\nMCP config file not found: ${argv[mcpAt + 1]}\n`); process.exit(1); }
  // (round 48, usagelimits) `claude -p /usage`: Claude Code's local command (no model turn): the plan's usage as text
  if (argv.includes('-p') && argv.includes('/usage')) {
    const text = sw.claudeUsageText || 'Total cost:            $0.0000\nUsage:                 0 input, 0 output, 0 cache read, 0 cache write';
    F.out({ type: 'result', subtype: 'success', is_error: false, num_turns: 0, duration_api_ms: 0, result: text, local_command: 'usage', session_id: F.uuid() });
    return;
  }
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const sessionId = arg('--resume') || arg('--session-id') || F.uuid();
  const model = arg('--model') || 'fake-opus';
  const prompt = await F.readStdin();
  if (F.trip('claude-network', sw.claudeNetwork)) { process.stderr.write('Error: getaddrinfo ENOTFOUND api.anthropic.com\n'); process.exit(1); }
  const tools = (arg('--allowedTools') || '').split(',').filter(Boolean);
  F.out({ type: 'system', subtype: 'init', session_id: sessionId, model, tools: ['Read', ...tools], mcp_servers: [], cwd: process.cwd() });
  // (round 48) the plan's usage per window, as the real CLI reports it (rate_limit_info; utilization 0–1, resetsAt in s)
  if (sw.claudeRateEvent) F.out({ type: 'rate_limit_event', rate_limit_info: typeof sw.claudeRateEvent === 'object' ? sw.claudeRateEvent : { status: 'allowed', rateLimitType: 'five_hour', resetsAt: Math.floor(Date.now() / 1000) + 7800, utilization: 0.42 }, session_id: sessionId });
  // (round 21) long-task scenarios: subagents, marathons, huge results, silences, a dead process (dev/fake-liveness.js)
  if (await require('./fake-liveness').claude(prompt, sessionId)) return;
  const { p, thinking } = F.plan(prompt, 'claude');
  let { text } = F.plan(prompt, 'claude');
  const state = F.loadState(`claude-${sessionId}`);
  const wait = F.delayMs(p);

  if (sw.claudeLoggedOut) { F.out({ type: 'result', subtype: 'error', is_error: true, result: 'Invalid API key · Please run /login', session_id: sessionId }); return; }
  if (sw.claudeNeeds && F.older(version, sw.claudeNeeds)) { F.out({ type: 'result', subtype: 'error', is_error: true, result: `API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Claude Code version ${sw.claudeNeeds} or newer is required to use this model."}}`, session_id: sessionId }); return; }
  if (p.login) { F.out({ type: 'result', subtype: 'error', is_error: true, result: 'Invalid API key · Please run /login', session_id: sessionId }); return; }
  if (p.crash) { process.stderr.write('fake-claude: simulated crash\n'); process.exit(3); }
  // (round 34, offline) the service's own failures, worded like the real CLI's result line (fake-common.js switches)
  const fail = (result) => F.out({ type: 'result', subtype: 'success', is_error: true, result, session_id: sessionId, duration_ms: 400 });
  if (sw.claudeExpired) { fail('OAuth token has expired. Please obtain a new token or refresh your existing token. · Please run /login'); return; }
  if (F.trip('claude-limit', sw.claudeLimit)) { fail(F.limitText('claude', sw)); return; }
  if (F.trip('claude-busy', sw.claudeBusy)) { fail('API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'); return; }
  if (F.trip('claude-rate', sw.claudeRate)) { fail('API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed the rate limit for your organization. Please try again later."}}'); return; }
  if (F.trip('claude-proxy', sw.claudeProxy)) { fail('API Error: Connection error. (self signed certificate in certificate chain)'); return; }
  // claudeCut: halfway through, the connection drops; asked to continue (on the same session), it writes the rest,
  // starting with its last few words again (as models do), which Hearth's stitch removes
  const cutState = `cut-claude-${sessionId}`;
  if (/Your last reply was cut off \(the connection dropped\)/.test(prompt)) {
    const st = F.loadState(cutState);
    if (st.rest != null) { text = `${st.overlap}${st.rest}`; F.saveState(cutState, {}); }
  }
  const cutting = F.trip('claude-cut', sw.claudeCut);

  F.out({ type: 'stream_event', event: { type: 'message_start', message: { id: `msg_${F.uuid()}`, model } }, session_id: sessionId });
  let index = 0;
  if (thinking) {
    F.out({ type: 'stream_event', event: { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } } });
    for (const t of F.pieces(thinking)) { F.out({ type: 'stream_event', event: { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: t } } }); await F.sleep(wait); }
    F.out({ type: 'stream_event', event: { type: 'content_block_stop', index } });
    index += 1;
  }
  // `mcp`: real calls to the hub MCP servers from --mcp-config, with their results in the reply
  let mcpReport = '';
  if (p.mcp) {
    let servers = {};
    try { servers = JSON.parse(require('fs').readFileSync(arg('--mcp-config'), 'utf8')).mcpServers || {}; } catch { /* none given */ }
    const calls = p.mcpCalls || [['three_console', {}]];
    const lines = [];
    const clients = {};
    for (const [tool0, a0, fallback] of calls) {
      if (tool0 === 'sleep') { await F.sleep(Number(a0) || 0); continue; } // ["sleep", ms]: a pause between calls (a part that takes a while)
      let [tool, a] = [tool0, a0];
      const spec = F.serverFor(servers, tool);
      if (!spec) { lines.push(`${tool}: no server`); continue; }
      const key = JSON.stringify(spec);
      clients[key] ||= await F.mcpClient(spec);
      const c = clients[key];
      // [tool, args, [fallbackTool, args]]: what a director does when that tool isn't in its list (node tool off)
      if (fallback && !c.tools.some((t) => t.name === tool)) [tool, a] = fallback;
      if (!c.reported && (c.reported = true)) lines.push(`server ${spec.args?.[0]?.split(/[\\/]/).pop()}: ${c.tools.length} tools, list ${JSON.stringify(c.tools).length} chars, instructions ${c.instructions.length} chars`);
      const server = Object.keys(servers).find((k) => JSON.stringify(servers[k]) === key);
      const id = `toolu_${F.uuid().slice(0, 8)}`;
      F.out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__${server}__${tool}`, input: a } ] }, session_id: sessionId });
      const r = await c.call(tool, a);
      const text = (r.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n');
      const imgs = (r.content || []).filter((x) => x.type === 'image').length;
      F.out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: Boolean(r.isError) }] }, session_id: sessionId });
      lines.push(`${tool}: ${r.isError ? 'ERROR ' : ''}${text.length} chars${imgs ? ` + ${imgs} image` : ''} · ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    for (const c of Object.values(clients)) c.close();
    mcpReport = `\n\nMCP calls:\n${lines.map((l) => `- ${l}`).join('\n')}`;
  }
  // `access`: built-in tools, permitted the way Claude Code does it (round 14, chat file access)
  if (p.accessCalls) {
    const fs = require('fs');
    const list = (name) => { const i = argv.indexOf(name); if (i < 0) return []; const out = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]); return out; };
    const given = (arg('--tools') || '').split(',').filter(Boolean);
    const dirs = [process.cwd(), ...list('--add-dir')];
    const mode = arg('--permission-mode') || 'default';
    const ppt = arg('--permission-prompt-tool');
    let servers = {};
    try { servers = JSON.parse(fs.readFileSync(arg('--mcp-config'), 'utf8')).mcpServers || {}; } catch { /* none */ }
    let pc = null;
    const pm = ppt && /^mcp__(.+?)__(.+)$/.exec(ppt);
    if (pm && servers[pm[1]]) pc = await F.mcpClient(servers[pm[1]]);
    const lines = [`permission tool: ${ppt ? (pc ? 'yes' : 'missing server') : 'none'}; tools: ${given.join(',') || 'none'}`];
    for (const [tool0, input0] of p.accessCalls) {
      // (winshell) on "Windows" Claude Code runs its commands with the PowerShell tool
      const tool = sw.windows && tool0 === 'Bash' ? 'PowerShell' : tool0;
      const id = `toolu_${F.uuid().slice(0, 8)}`;
      F.out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: tool, input: input0 }] }, session_id: sessionId });
      let input = input0; let ok = false; let why = '';
      const file = input0.file_path || input0.path;
      // like the real CLI: a tool left out of --tools doesn't exist for this run (Claude Code 2.1: "<tool_use_error>Error:
      // No such tool available: PowerShell</tool_use_error>"; the model tends to retell it as "blocked by policy")
      if (!given.includes(tool)) why = sw.windows ? `<tool_use_error>Error: No such tool available: ${tool}</tool_use_error>` : `No such tool available: ${tool}`;
      else if (tools.includes(tool) || (['Read', 'Glob', 'Grep'].includes(tool) && (!file || F.within(file, dirs))) || (mode === 'acceptEdits' && ['Edit', 'Write'].includes(tool) && F.within(file, dirs))) ok = true;
      else if (pc) {
        const r = await pc.call(pm[2], { tool_name: tool, input: input0, tool_use_id: id });
        const text = (r.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
        let d = {}; try { d = JSON.parse(text); } catch { why = `bad permission answer: ${text.slice(0, 120)}`; }
        if (d.behavior === 'allow') { ok = true; input = d.updatedInput || input0; } else if (d.behavior === 'deny') why = d.message || 'denied';
      } else why = `Claude requested permissions to use ${tool}, but you haven't granted it yet.`;
      const res = ok ? F.runTool(tool, input) : { ok: false, text: why };
      F.out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: res.text, is_error: !res.ok }] }, session_id: sessionId });
      lines.push(`${tool}: ${ok ? (res.ok ? 'ran' : 'failed') : 'denied'} · ${res.text.replace(/\s+/g, ' ').slice(0, 200)}`);
    }
    pc?.close();
    mcpReport += `\n\nAccess calls:\n${lines.map((l) => `- ${l}`).join('\n')}`;
  }
  const toolCalls = p.tools3 ? ['mcp__three__three_screenshot', 'mcp__three__three_eval', 'mcp__three__three_edit_code'] : p.tool ? ['mcp__claude_ai_Gmail__search_threads'] : [];
  for (const name of toolCalls) {
    const id = `toolu_${F.uuid().slice(0, 8)}`;
    F.out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input: { query: 'fake' } }] }, session_id: sessionId });
    await F.sleep(wait * 6);
    F.out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, session_id: sessionId });
  }
  if (p.error) { F.out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Fake engine error: something went wrong' /* (round 34) not a busy service: offline.js would retry it; claudeBusy is that */, session_id: sessionId }); return; }
  text += mcpReport;
  // (round 28, router) "runinfo": the reply ends with the model + effort this run really got (dev/checks/router.js)
  if (/\bruninfo\b/i.test(prompt)) text += `\n\nrun: model=${arg('--model') || 'default'} effort=${arg('--effort') || 'none'}`;
  // (round 35, concise) "promptinfo": the reply ends with the system prompt this run really got (dev/checks/concise.js)
  if (/\bpromptinfo\b/i.test(prompt)) text += `\n\nsystem<<<${arg('--system-prompt') || ''}>>>`;
  // (round 40, attachlean) "attachinfo": what the attachments really cost this run: the message's size, the tools and
  // folders it got (the Read tool on the attachments folder for a trimmed file), the pictures it was told to open
  if (/\battachinfo\b/i.test(prompt)) {
    const dirs = []; const at = argv.indexOf('--add-dir'); if (at >= 0) for (let j = at + 1; j < argv.length && !argv[j].startsWith('--'); j++) dirs.push(argv[j]);
    const imgs = (prompt.split('[Attached image')[1] || '').split('\n').slice(1).filter((l) => /^[\\/]|^[A-Za-z]:/.test(l.trim()));
    text += `\n\nattach<<<${JSON.stringify({ chars: prompt.length, tools: arg('--tools'), dirs, images: imgs })}>>>`;
  }
  // (round 36, tokenaudit) "toolsinfo": the tool definitions this run really got from Hearth's MCP servers in --mcp-config,
  // each server's list measured the way mcp/cost.js does (instructions + tools JSON, ≈ chars / 4), with its own env
  if (/\btoolsinfo\b/i.test(prompt)) {
    const sizes = {};
    let servers = {};
    try { servers = JSON.parse(require('fs').readFileSync(arg('--mcp-config'), 'utf8')).mcpServers || {}; } catch { /* none */ }
    for (const [name, spec] of Object.entries(servers)) {
      const file = (spec.args || [])[0];
      if (!/[\\/]mcp[\\/][\w-]+\.js$/.test(String(file || ''))) { sizes[name] = 'external'; continue; }
      const keep = { ...process.env };
      try {
        for (const k of ['HUB_NODES_TOOL', 'HUB_TOOL_MODE', 'HUB_CHAT_LEAN', 'HUB_CHAT_ONLY']) delete process.env[k];
        Object.assign(process.env, spec.env || {});
        delete require.cache[require.resolve(file)];
        const def = require(file);
        sizes[name] = Math.round(String(def.instructions || '').length / 4) + Math.round(JSON.stringify(def.tools).length / 4);
      } catch (err) { sizes[name] = `error ${err.message}`; } finally { for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k]; Object.assign(process.env, keep); }
    }
    text += `\n\ntools<<<${JSON.stringify(sizes)}>>>`;
  }
  F.out({ type: 'stream_event', event: { type: 'content_block_start', index, content_block: { type: 'text', text: '' } } });
  if (cutting) {
    const half = Math.max(text.indexOf(' ', Math.floor(text.length / 2)), 1);
    const first = text.slice(0, half);
    const from = first.lastIndexOf(' ', first.length - 12);
    F.saveState(cutState, { rest: text.slice(half), overlap: first.slice(from + 1), full: text });
    for (const t of F.pieces(first)) { F.out({ type: 'stream_event', event: { type: 'content_block_delta', index, delta: { type: 'text_delta', text: t } } }); await F.sleep(wait); }
    await F.sleep(200);
    fail('API Error: Connection error.');
    return;
  }
  for (const t of F.pieces(text, p)) { F.out({ type: 'stream_event', event: { type: 'content_block_delta', index, delta: { type: 'text_delta', text: t } } }); await F.sleep(wait); }
  F.out({ type: 'stream_event', event: { type: 'content_block_stop', index } });
  F.out({ type: 'assistant', message: { content: [{ type: 'text', text }] }, session_id: sessionId });
  // Input grows with the conversation; most of it comes from the cache after the first turn.
  F.logRun('claude', { system: arg('--system-prompt') || '', prompt, prior: state.chars, text, thinking, model: arg('--model'), effort: arg('--effort'), session: sessionId });
  state.turns += 1;
  state.chars += prompt.length + text.length;
  const input = p.big ? 125000 : 700 + Math.ceil(state.chars / 4);
  const output = Math.ceil((text.length + thinking.length) / 4);
  F.saveState(`claude-${sessionId}`, state);
  F.out({
    type: 'result', subtype: 'success', is_error: false, result: text, session_id: sessionId, num_turns: state.turns, duration_ms: 1234,
    usage: { input_tokens: 12, cache_creation_input_tokens: state.turns === 1 ? input - 12 : 40, cache_read_input_tokens: state.turns === 1 ? 0 : input - 52, output_tokens: output },
  });
})();
