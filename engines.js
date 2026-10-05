// Native chat engines: the official Claude Code and Codex command-line tools, signed in with
// your Claude / ChatGPT accounts. Every run is stripped down to plain chat — no coding tools,
// no project files, no plugins — plus only the connected apps you switched on for that agent.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR, ATTACH_DIR, getMemory, addUsage } = require('./store');

const WORKSPACE = path.join(DATA_DIR, 'workspace');
const PROMPTS_DIR = path.join(DATA_DIR, 'prompts');
fs.mkdirSync(WORKSPACE, { recursive: true });
fs.mkdirSync(PROMPTS_DIR, { recursive: true });

// Codex features that add tool definitions to every request. Chat doesn't need them.
const CODEX_DISABLED_FEATURES = [
  'shell_tool', 'unified_exec', 'apps', 'browser_use', 'browser_use_external', 'computer_use',
  'multi_agent', 'plugins', 'skill_search', 'tool_suggest', 'view_image', 'sleep_tool', 'goals',
  'hooks', 'image_generation', 'shell_snapshot', 'in_app_browser', 'workspace_dependencies', 'remote_plugin',
];

const ENGINES = {
  claude: { label: 'Claude Code', account: 'Claude Pro', loginArgs: ['auth', 'login'] },
  codex: { label: 'Codex', account: 'ChatGPT Plus', loginArgs: ['login'] },
};

const running = new Map(); // chatId -> child process
const LOG_PATH = path.join(DATA_DIR, 'engine.log');

function log(line) {
  try { fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`); } catch { /* logging is best-effort */ }
}

function findOnPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(dir, `${name}.exe`);
    if (dir && fs.existsSync(file)) return file;
  }
  return null;
}

// The desktop apps keep their engine in versioned folders; pick the most recently updated one.
function newestIn(root, exeName, depth = 3) {
  let best = null;
  const walk = (dir, level) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && level < depth) walk(full, level + 1);
      else if (entry.isFile() && entry.name.toLowerCase() === exeName) {
        const mtime = fs.statSync(full).mtimeMs;
        if (!best || mtime > best.mtime) best = { full, mtime };
      }
    }
  };
  walk(root, 0);
  return best?.full ?? null;
}

const LOCATE = {
  claude: () => findOnPath('claude')
    || newestIn(path.join(process.env.APPDATA || '', 'Claude', 'claude-code'), 'claude.exe')
    || [path.join(os.homedir(), '.local', 'bin', 'claude.exe')].find((f) => fs.existsSync(f))
    || null,
  codex: () => findOnPath('codex')
    || newestIn(path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin'), 'codex.exe'),
};

// Tool names that only look things up. In "read-only" mode everything else is blocked.
const READ_ONLY_TOOL = /(^|[_-])(get|list|search|read|fetch|query|find|view|preview|download|export|who_am_i|guide)([_-]|$)/i;
const CONNECTORS_CACHE = path.join(DATA_DIR, 'connectors.json');

const serverPrefix = (name) => `mcp__${name.replace(/[^A-Za-z0-9_-]/g, '_')}__`;

function enabledConnectors(agent) {
  return Object.entries(agent.connectors || {}).filter(([, mode]) => mode === 'read' || mode === 'full');
}

// File tools for Claude agents with a project folder. No command running, and Claude Code's
// restricted mode keeps the file tools inside that folder.
const FILE_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep'];

// Forgeheart live-game tools: a stdio MCP server (run with the hub's own Electron as Node) that
// forwards to the debug game through gamebridge.js.
// Hub tool sets an agent can be given (each one a stdio MCP server talking to the hub).
const HUB_TOOLSETS = {
  gameTools: { server: 'forgeheart', script: 'forge-game-mcp.js' },
  videoTools: { server: 'video', script: 'video-mcp.js' },
  threeTools: { server: 'three', script: 'three-mcp.js' },
};
const hubToolsets = (agent) => (agent.engine === 'claude' ? Object.keys(HUB_TOOLSETS).filter((k) => agent[k]) : []);
const gameTools = (agent) => hubToolsets(agent).includes('gameTools');
function hubMcpConfig(agent) {
  const mcpServers = {};
  for (const key of hubToolsets(agent)) {
    const { server, script } = HUB_TOOLSETS[key];
    mcpServers[server] = { command: process.execPath, args: [path.join(__dirname, 'mcp', script)], env: { ELECTRON_RUN_AS_NODE: '1' } };
  }
  const file = path.join(DATA_DIR, `mcp-${agent.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ mcpServers }, null, 2));
  return file;
}

function fileFolder(agent) {
  return agent.engine === 'claude' && agent.workspace && fs.existsSync(agent.workspace) ? agent.workspace : null;
}

function buildPrompt(agent) {
  const usesApps = agent.engine === 'claude' ? enabledConnectors(agent).length > 0 : Boolean(agent.chatgptApps);
  const folder = fileFolder(agent);
  const parts = [
    agent.systemPrompt
      || `You are ${agent.name}, chatting with the user in their personal desktop app. `
        + 'Answer conversationally and directly, using Markdown when it helps.',
  ];
  if (folder) {
    parts.push(`You can read and edit files in the project folder ${folder} with your file tools `
      + '(Read, Edit, Write, Glob, Grep). Read before you edit, make focused changes, and list the files you changed '
      + 'at the end. You cannot run commands, so tell the user what to run or test themselves.');
  }
  if (usesApps) {
    parts.push('You can use the connected apps in your tools (for example email, documents or calendars) when the user asks about them or when it clearly helps.');
  }
  if (gameTools(agent)) {
    parts.push('A live debug instance of the user\'s game Forgeheart runs right next to this chat, and you control it with the forge_* tools. '
      + 'When the user asks for something in the game ("spawn me enemies", "make me invincible", "go to stage 80", "make drones faster"), do it right away with the tools '
      + '(forge_spawn, forge_debug, forge_eval…) instead of explaining how. Check forge_status or take a forge_screenshot when you need to see the result. '
      + 'Changes made with forge_eval last until the game reloads; when the user wants a change to stick, save it with forge_patch_save. '
      + 'Reply briefly with what you changed. The forge_eval tool description lists the game\'s globals (S, C, FOES, spawnFoe, startStage, stats…).');
  }
  const sets = hubToolsets(agent);
  if (sets.includes('videoTools')) {
    parts.push('You are the user\'s video director. The user does not edit in After Effects themselves: scripts build and render the videos, and the user steers the look. '
      + 'Video Review is open right next to this chat. Look at renders yourself with video_contact_sheet (overview) and video_frame (exact moments) before giving opinions, and speak visually '
      + '(timing, composition, color, motion, readability) with timecodes. Turn the user\'s feedback and their timeline notes (video_status) into concrete changes. '
      + (folder ? 'You can read and edit files: find the script or project that produced a render (look in and around the render\'s folder for .jsx, .py, .js, .aep, render logs), change it, then re-render with ae_render or run AE scripts with ae_run_script, and check the new render. '
        : 'You can re-render with ae_render and run AE scripts with ae_run_script; to edit script files the user can give you File access in your settings. ')
      + 'Keep replies short and concrete.');
  }
  if (sets.includes('threeTools')) {
    parts.push('You turn the user\'s descriptions into three.js scenes in the Three.js Lab shown next to this chat. They prompt; you write the code. '
      + 'Build with three_set_code (complete sketches), read the errors it returns, look with three_screenshot, and iterate until it matches what they asked for. '
      + 'Don\'t paste the code into the chat unless they ask for it: describe what you made and what they can ask for next (camera, mood, motion, materials…). '
      + 'Prefer good-looking defaults: tone mapping, environment lighting, soft shadows, smooth animation, sensible performance. '
      + 'The Lab has a Sliders panel: always expose the 4–8 settings the user would most want to play with through tweak() (see the tool guide), read live every frame, so they can fine-tune without asking you. '
      + 'If three_get_code reports unsavedSliders, the user tuned those by hand: keep their values.');
  }
  if (!folder && !usesApps && !sets.length) parts.push('You have no tools: never try to run commands, read files or browse the web.');
  const memory = getMemory();
  const notes = [memory.shared, memory.agents?.[agent.id]].map((m) => (m || '').trim()).filter(Boolean);
  if (notes.length) {
    parts.push(`What you remember about the user (saved notes, keep them in mind):\n${notes.join('\n')}`);
  }
  if (agent.autoMemory !== false) {
    parts.push('When the user shares a lasting fact or preference worth remembering in future chats '
      + '(not one-off details), add it on its own line at the very end of your reply as '
      + '<remember>short fact</remember>. Do this rarely, and never mention these tags.');
  }
  return parts.join('\n\n');
}

function readConnectorCache() {
  try { return JSON.parse(fs.readFileSync(CONNECTORS_CACHE, 'utf8')); } catch { return {}; }
}

// Claude's connected apps come from your Claude account. Each one is off, read-only or full.
function claudeToolArgs(agent, options = {}) {
  const enabled = new Map(enabledConnectors(agent));
  const folder = fileFolder(agent);
  // Attached images are read with the Read tool from the hub's attachments folder.
  const images = Boolean(options.images?.length);
  let args;
  if (folder) args = ['--tools', FILE_TOOLS.join(','), '--restricted', '--add-dir', folder, ATTACH_DIR, '--permission-mode', 'acceptEdits'];
  else if (images) args = ['--tools', 'Read', '--restricted', '--add-dir', ATTACH_DIR];
  else args = ['--tools', ''];
  const sets = hubToolsets(agent);
  if (!enabled.size && !folder && !images && !sets.length) return [...args, '--strict-mcp-config'];
  // --strict-mcp-config limits MCP servers to the ones passed with --mcp-config (or none).
  if (sets.length) args.push('--mcp-config', hubMcpConfig(agent));
  if (!enabled.size) args.push('--strict-mcp-config');
  args.push('--permission-prompts', 'none');
  const { claude } = readConnectorCache();
  const allowed = folder ? [...FILE_TOOLS] : images ? ['Read'] : [];
  for (const key of sets) allowed.push(`mcp__${HUB_TOOLSETS[key].server}`);
  const denied = [];
  for (const server of enabled.size ? claude?.servers || [] : []) {
    const prefix = serverPrefix(server.name);
    const mode = enabled.get(server.name);
    if (!mode) { denied.push(prefix.slice(0, -2)); continue; }
    for (const tool of claude.tools.filter((t) => t.startsWith(prefix))) {
      if (mode === 'full' || READ_ONLY_TOOL.test(tool.slice(prefix.length))) allowed.push(tool);
      else denied.push(tool);
    }
  }
  if (allowed.length) args.push('--allowedTools', allowed.join(','));
  if (denied.length) args.push('--disallowedTools', denied.join(','));
  return args;
}

function claudeArgs(agent, session, options = {}) {
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--setting-sources', 'project', '--disable-slash-commands', '--system-prompt-snapshot', 'off',
    ...claudeToolArgs(agent, options),
    '--system-prompt', buildPrompt(agent),
  ];
  const model = options.model || agent.model;
  if (model) args.push('--model', model);
  if (agent.effort) args.push('--effort', agent.effort);
  if (session.id) args.push('--resume', session.id);
  else args.push('--session-id', crypto.randomUUID());
  return args;
}

function codexArgs(agent, session, options = {}) {
  const promptFile = path.join(PROMPTS_DIR, `${agent.id}.md`);
  fs.writeFileSync(promptFile, buildPrompt(agent));
  const args = ['exec'];
  if (session.id) args.push('resume', session.id);
  args.push('--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules');
  const disabled = agent.chatgptApps ? CODEX_DISABLED_FEATURES.filter((f) => f !== 'apps') : CODEX_DISABLED_FEATURES;
  for (const feature of disabled) args.push('--disable', feature);
  args.push(
    '-c', `model_instructions_file='${promptFile}'`,
    '-c', 'project_doc_max_bytes=0',
    '-c', 'web_search="disabled"',
  );
  if (agent.effort) args.push('-c', `model_reasoning_effort="${agent.effort}"`);
  const model = options.model || agent.model;
  if (model) args.push('-m', model);
  if (!session.id) args.push('-s', 'read-only', '-C', WORKSPACE);
  for (const image of options.images || []) args.push('-i', image);
  args.push('-');
  return args;
}

// Each parser turns one JSON line into events: { delta }, { done }, { error }.
function claudeParser(session) {
  return (msg) => {
    if (msg.type === 'system' && msg.subtype === 'init') session.id = msg.session_id;
    if (msg.type === 'stream_event' && msg.event?.delta?.type === 'text_delta') {
      return { type: 'delta', text: msg.event.delta.text };
    }
    const toolUse = msg.type === 'assistant' && msg.message?.content?.find((c) => c.type === 'tool_use');
    if (toolUse) {
      const target = toolUse.input?.file_path || toolUse.input?.pattern;
      return { type: 'tool', name: target ? `${toolUse.name} · ${path.basename(target)}` : toolUse.name };
    }
    if (msg.type === 'result') {
      if (msg.is_error) return { type: 'error', message: msg.result || 'Claude returned an error' };
      const u = msg.usage || {};
      return {
        type: 'done',
        text: msg.result,
        usage: {
          input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
          output: u.output_tokens || 0,
        },
      };
    }
    return null;
  };
}

function codexParser(session) {
  let text = '';
  return (msg) => {
    if (msg.type === 'thread.started') session.id = msg.thread_id;
    if (msg.type === 'item.completed' && msg.item?.type === 'agent_message') {
      const part = (text ? '\n\n' : '') + msg.item.text;
      text += part;
      return { type: 'delta', text: part };
    }
    if (msg.type === 'item.started' && /tool_call/.test(msg.item?.type || '')) {
      return { type: 'tool', name: [msg.item.server, msg.item.tool].filter(Boolean).join(' · ') || msg.item.type };
    }
    if (msg.type === 'turn.completed') {
      // Codex reports running totals for the whole thread; show what this turn added.
      const u = msg.usage || {};
      const totals = { input: u.input_tokens || 0, output: u.output_tokens || 0 };
      const prev = session.totals || { input: 0, output: 0 };
      session.totals = totals;
      return {
        type: 'done',
        text,
        usage: { input: Math.max(totals.input - prev.input, 0), output: Math.max(totals.output - prev.output, 0) },
      };
    }
    if (msg.type === 'turn.failed') return { type: 'error', message: msg.error?.message || 'Codex turn failed' };
    if (msg.type === 'error') return { type: 'error', message: msg.message || 'Codex error' };
    return null;
  };
}

function friendlyError(engine, message) {
  if (/not logged in|please run \/login|codex login|unauthori[sz]ed|\b401\b/i.test(message)) {
    return { message: `${ENGINES[engine].label} isn't signed in to your ${ENGINES[engine].account} account.`, needsLogin: true };
  }
  return { message };
}

function send({ agent, chatId, session, text, options = {} }, emit) {
  const engine = agent.engine;
  if (engine === 'claude' && options.images?.length) {
    text += `\n\n[Attached image${options.images.length > 1 ? 's' : ''}: open with your Read tool before answering]\n${options.images.join('\n')}`;
  }
  const bin = LOCATE[engine]?.();
  if (!bin) {
    emit({ type: 'error', message: `Couldn't find ${ENGINES[engine]?.label || engine} on this PC.` });
    return;
  }
  if (engine === 'claude' && agent.workspace && !fileFolder(agent)) {
    emit({ type: 'error', message: `The file access folder ${agent.workspace} doesn't exist anymore. Change it in the agent's settings.` });
    return;
  }
  // Sessions always live in the hub's own workspace so chats resume even after the folder changes;
  // the project folder is reached through --add-dir.
  const state = { ...session };
  const args = engine === 'claude' ? claudeArgs(agent, state, options) : codexArgs(agent, state, options);
  const parse = engine === 'claude' ? claudeParser(state) : codexParser(state);

  const child = spawn(bin, args, { cwd: WORKSPACE, windowsHide: true });
  running.set(chatId, child);
  child.stdin.end(text);

  let finished = false;
  let buffer = '';
  let stderr = '';
  const finish = (event) => {
    if (finished) return;
    finished = true;
    if (event.type === 'error') Object.assign(event, friendlyError(engine, event.message));
    if (event.type === 'done') { try { addUsage(agent.id, event.usage); } catch { /* usage stats are best-effort */ } }
    emit({ ...event, session: state });
  };

  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('{')) continue;
      let event;
      try { event = parse(JSON.parse(line)); } catch { continue; }
      if (!event) continue;
      if (event.type === 'delta' || event.type === 'tool') emit(event);
      else finish(event);
    }
  });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  child.on('error', (err) => finish({ type: 'error', message: err.message }));
  child.on('close', (code, signal) => {
    running.delete(chatId);
    log(`${engine} ${chatId} exit=${code} signal=${signal} finished=${finished} stderr=${JSON.stringify(stderr.slice(-400))}`);
    if (code === null) finish({ type: 'stopped' });
    else finish({ type: 'error', message: stderr.trim().split('\n').pop() || `${ENGINES[engine].label} exited (${code})` });
  });
}

function stop(chatId) {
  log(`stop requested ${chatId}`);
  running.get(chatId)?.kill();
}

function stopAll() {
  const count = running.size;
  for (const id of [...running.keys()]) stop(id);
  return count;
}

// Opens a console window where you sign in yourself; the hub never sees your password.
function login(engine) {
  const bin = LOCATE[engine]?.();
  if (!bin) return false;
  // On Windows a detached console program gets its own visible console window.
  spawn(bin, ENGINES[engine].loginArgs, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  return true;
}

function status() {
  return Object.fromEntries(Object.keys(ENGINES).map((e) => [e, Boolean(LOCATE[e]())]));
}

// Lists Claude's connected apps by reading its startup report, then stops it before it
// answers, so this costs next to nothing.
function discoverConnectors() {
  const bin = LOCATE.claude();
  if (!bin) return Promise.resolve(readConnectorCache());
  return new Promise((resolve) => {
    const child = spawn(bin, [
      '-p', '--output-format', 'stream-json', '--verbose', '--setting-sources', 'project',
      '--tools', '', '--disable-slash-commands', '--permission-prompts', 'none',
    ], { cwd: WORKSPACE, windowsHide: true });
    let buffer = '';
    const done = (result) => {
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const timer = setTimeout(() => done(readConnectorCache()), 60000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const line = buffer.split('\n').find((l) => l.includes('"subtype":"init"'));
      if (!line) return;
      const init = JSON.parse(line);
      const cache = {
        ...readConnectorCache(),
        claude: {
          servers: (init.mcp_servers || []).map(({ name, status: state }) => ({ name, status: state })),
          tools: (init.tools || []).filter((t) => t.startsWith('mcp__')),
          checkedAt: Date.now(),
        },
      };
      fs.writeFileSync(CONNECTORS_CACHE, JSON.stringify(cache, null, 2));
      done(cache);
    });
    child.on('error', () => done(readConnectorCache()));
    child.stdin.end('hi');
  });
}

module.exports = {
  send, stop, stopAll, login, status, discoverConnectors, readConnectorCache, isReadOnlyTool: (name) => READ_ONLY_TOOL.test(name),
};
