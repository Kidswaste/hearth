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

// Reasoning efforts each engine accepts (anything else is dropped rather than failing the run).
const EFFORTS = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['minimal', 'low', 'medium', 'high', 'xhigh'],
};
const WEB_SEARCH = ['disabled', 'cached', 'live'];
const SUMMARIES = ['auto', 'concise', 'detailed', 'none'];
const VERBOSITY = ['low', 'medium', 'high'];
// A value for Codex's "-c key=value" (TOML): a JSON string is a valid TOML basic string, and unlike
// '…' literals it survives paths with apostrophes.
const tomlStr = (s) => JSON.stringify(String(s));
const pick = (value, allowed) => (allowed.includes(value) ? value : null);
// A run that prints nothing for this long is considered hung (a question to the user may wait 45 min).
const IDLE_MS = 50 * 60000;
// A single JSONL line bigger than this is dropped instead of growing memory without end.
const MAX_LINE = 64 * 1024 * 1024;

const ENGINES = {
  claude: { label: 'Claude Code', account: 'Claude Pro', loginArgs: ['auth', 'login'] },
  codex: { label: 'Codex', account: 'ChatGPT Plus', loginArgs: ['login'] },
};

const running = new Map(); // chatId -> child process
const LOG_PATH = path.join(DATA_DIR, 'engine.log');

function log(line) {
  try { fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`); } catch { /* logging is best-effort */ }
}

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const exe = (name) => (IS_WIN ? `${name}.exe` : name);
function findOnPath(name) {
  // apps started from the Mac Dock don't get the shell's PATH, so the usual install places are added
  const extra = IS_MAC ? ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin')] : [];
  for (const dir of [...(process.env.PATH || '').split(path.delimiter), ...extra]) {
    const file = path.join(dir, exe(name));
    if (dir && fs.existsSync(file)) return file;
  }
  return null;
}
// Settings → Engines can point at the programs directly (settings.enginePaths = { claude, codex }).
let enginePaths = {};
function setEnginePaths(p) { enginePaths = p && typeof p === 'object' ? p : {}; }
const given = (name) => (enginePaths[name] && fs.existsSync(enginePaths[name]) ? enginePaths[name] : null);

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
  claude: () => given('claude') || findOnPath('claude')
    || (IS_WIN ? newestIn(path.join(process.env.APPDATA || '', 'Claude', 'claude-code'), 'claude.exe') : null)
    || (IS_MAC ? newestIn(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code'), 'claude') : null)
    || [path.join(os.homedir(), '.local', 'bin', exe('claude')), path.join(os.homedir(), '.claude', 'local', exe('claude'))].find((f) => fs.existsSync(f))
    || null,
  codex: () => given('codex') || findOnPath('codex')
    || (IS_WIN ? newestIn(path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin'), 'codex.exe') : null)
    || (IS_MAC ? newestIn('/Applications/Codex.app/Contents', 'codex', 4) || newestIn('/Applications/ChatGPT.app/Contents', 'codex', 4) || newestIn(path.join(os.homedir(), 'Library', 'Application Support', 'Codex'), 'codex', 4) : null)
    || null,
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
// Hub tool sets an agent can be given (each one a stdio MCP server talking to the hub). Claude gets them
// with --mcp-config, Codex (Astra) through "-c mcp_servers.<name>…", so a director can run on either engine.
const HUB_TOOLSETS = {
  gameTools: { server: 'forgeheart', script: 'forge-game-mcp.js' },
  videoTools: { server: 'video', script: 'video-mcp.js' },
  threeTools: { server: 'three', script: 'three-mcp.js' },
  // Ask the user questions in the chat, get a second opinion from the other engine. On for every Claude agent
  // unless switched off; opt-in for Astra (it adds tool definitions to every Codex request).
  chatTools: { server: 'chat', script: 'chat-mcp.js' },
};
// Claude agents get their tool sets (chat tools unless switched off). Codex agents (Astra) get the tool sets their
// agent has (a director switched to Astra) and chat tools only as an opt-in (talk-back, or agent.hubTools).
// One-off calls (second opinions) never get hub tools (agent.noHubTools).
const hubToolsets = (agent) => (agent.noHubTools ? [] : Object.keys(HUB_TOOLSETS).filter((k) => {
  if (k === 'chatTools') return agent.engine === 'claude' ? agent.chatTools !== false : agent.chatTools === true || (agent.hubTools === true && agent.chatTools !== false);
  return Boolean(agent[k]);
}));
const gameTools = (agent) => hubToolsets(agent).includes('gameTools');
// The node tool (three_nodes) is on for Three directors: the owner wants a node view of the visual work they make
// (an explicit opt-in to its ≈ 75 tokens per message). `/nodes-director off` sets agent.nodesTool = false.
const nodesOn = (agent) => Boolean(agent.threeTools) && agent.nodesTool !== false;
// What every hub MCP server gets: Node mode, the agent (for chat_ tools), opt-ins that change the tool list.
// HUB_CHAT_ID: the chat this run answers, so a director's tool calls reach that chat's own scene (chat-scenes.js).
const hubToolEnv = (agent) => ({ ELECTRON_RUN_AS_NODE: '1', HUB_AGENT_ID: agent.id, ...(agent.hubChatId ? { HUB_CHAT_ID: agent.hubChatId } : {}), ...(agent.engine === 'codex' ? { HUB_PARTNER: 'Claude' } : {}), ...(nodesOn(agent) ? { HUB_NODES_TOOL: '1' } : {}), ...(agent.toolMode === 'full' ? { HUB_TOOL_MODE: 'full' } : {}) });
// One file per chat run (two chats of the same director can start at once), removed when the run ends.
const mcpConfigFile = (agent) => (agent.hubChatId
  ? path.join(DATA_DIR, 'mcp-runs', `${agent.id}-${String(agent.hubChatId).replace(/[^\w-]/g, '_')}.json`)
  : path.join(DATA_DIR, `mcp-${agent.id}.json`));
function hubMcpConfig(agent) {
  const mcpServers = {};
  for (const key of hubToolsets(agent)) {
    const { server, script } = HUB_TOOLSETS[key];
    mcpServers[server] = { command: process.execPath, args: [path.join(__dirname, 'mcp', script)], env: hubToolEnv(agent) };
  }
  const file = mcpConfigFile(agent);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mcpServers }, null, 2));
  return file;
}

// Codex MCP servers for the hub tool sets, as config overrides (nothing is written to the user's config).
function codexMcpArgs(agent) {
  const args = [];
  for (const key of hubToolsets(agent)) {
    const { server, script } = HUB_TOOLSETS[key];
    const p = `mcp_servers.${server}`;
    args.push(
      '-c', `${p}.command=${tomlStr(process.execPath)}`,
      '-c', `${p}.args=[${tomlStr(path.join(__dirname, 'mcp', script))}]`,
      '-c', `${p}.env={ ${Object.entries(hubToolEnv(agent)).map(([k, v]) => `${k}=${tomlStr(String(v))}`).join(', ')} }`,
      // a question to the user (chat_ask) or a render can take a long time
      '-c', `${p}.tool_timeout_sec=${key === 'videoTools' || key === 'chatTools' ? 2700 : 300}`,
      '-c', `${p}.startup_timeout_sec=30`,
    );
  }
  return args;
}

// The opt-in project folder (both engines). Claude edits it with its file tools; Astra looks with read-only
// shell commands inside Codex's sandbox, and edits only when its file mode is "edit".
function fileFolder(agent) {
  return agent.workspace && fs.existsSync(agent.workspace) ? agent.workspace : null;
}
const partnerName = (agent) => (agent.engine === 'codex' ? 'Claude' : 'Astra');
// Tool guides go into the system prompt, which the hub controls (the CLI may drop MCP server instructions when
// --system-prompt replaces its own), once, instead of being repeated in tool descriptions.
const threeGuide = () => require('./mcp/three-guide');
const hearthMap = () => require('./mcp/hearth-map');
function toolGuide(key) {
  try { return require(path.join(__dirname, 'mcp', HUB_TOOLSETS[key].script)).guide || ''; } catch { return ''; }
}

function buildPrompt(agent) {
  const usesApps = agent.engine === 'claude' ? enabledConnectors(agent).length > 0 : Boolean(agent.chatgptApps);
  const folder = fileFolder(agent);
  const web = agent.engine === 'codex' && WEB_SEARCH.includes(agent.webSearch) && agent.webSearch !== 'disabled';
  const parts = [
    agent.systemPrompt
      || `You are ${agent.name}, chatting with the user in their personal desktop app. `
        + 'Answer conversationally and directly, using Markdown when it helps.',
  ];
  if (folder && agent.engine === 'codex') {
    parts.push(agent.codexFiles === 'edit'
      ? `You can read and edit files in the project folder ${folder}: look with short read-only commands (ls, cat, rg, sed -n) and edit with apply_patch. `
        + 'Commands run in a sandbox with no network; never run builds, installs, deletes or anything outside that folder. Read before you edit, make focused changes, and list the files you changed at the end.'
      : `You can read files in the project folder ${folder} with short read-only commands (ls, cat, rg, sed -n). Stay inside that folder. `
        + 'You cannot change files: describe the edits instead, and tell the user what to run or test themselves.');
  } else if (folder) {
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
      + 'instead of explaining how; check forge_status or forge_screenshot when you need to see the result. Reply briefly with what you changed.');
    parts.push(toolGuide('gameTools'));
  }
  const sets = hubToolsets(agent);
  if (sets.includes('videoTools')) {
    parts.push('You are the user\'s video director. The user does not edit in After Effects themselves: scripts build and render the videos, and the user steers the look. '
      + 'Video Review is open right next to this chat. Look at renders yourself with video_contact_sheet (overview) and video_frame (exact moments) before giving opinions, and speak visually '
      + '(timing, composition, color, motion, readability) with timecodes. Turn the user\'s feedback and their timeline notes (video_status) into concrete changes. '
      + (folder ? 'You can read and edit files: find the script or project that produced a render (look in and around the render\'s folder for .jsx, .py, .js, .aep, render logs), change it, then re-render with ae_render or run AE scripts with ae_run_script, and check the new render. '
        : 'You can re-render with ae_render and run AE scripts with ae_run_script; to edit script files the user can give you File access in your settings. ')
      + 'Keep replies short and concrete.');
    // the app map: its hearth_help tool says what it is (the Three Director gets the map line with its guide below)
  }
  if (sets.includes('chatTools')) {
    // directors get the chat tools' when-to-use guide; plain chats only the <suggest> convention
    if (agent.dock || sets.length > 1) parts.push(toolGuide('chatTools'));
    parts.push('At the end of a reply, when it helps, offer up to 3 short next steps the user might want, each as <suggest>…</suggest> (they become buttons; keep each under 8 words).');
  } else if (agent.suggestNext) {
    parts.push('At the end of a reply, when it helps, offer up to 3 short next steps the user might want, each as <suggest>…</suggest> (they become buttons; keep each under 8 words).');
  }
  // Directors (agents docked in a tool) check their own work unless switched off.
  if (agent.selfReview ?? Boolean(agent.dock)) parts.push('Before you finish, check your result against what was asked (for visual work, look at a fresh screenshot). Fix real problems you find, then mention in one line what you checked.');
  // Lean (default): the three-lab tool guide carries the how-to, so the prompt only sets the role. 'full' keeps the long version.
  if (sets.includes('threeTools') && agent.toolMode !== 'full') {
    parts.push('You are the Three Director. Prefer good-looking defaults (tone mapping, environment light, smooth motion, sensible performance) and small edits over rewrites.\n'
      + threeGuide().CORE
      + (nodesOn(agent) ? `\n${threeGuide().NODES_LINE}` : '')
      + `\n${hearthMap().LINE('three_do help')}`);
  } else if (sets.includes('threeTools')) {
    parts.push('You turn the user\'s descriptions into three.js scenes in the Three.js Lab shown next to this chat. They prompt; you write the code. '
      + 'Build with three_set_code (complete sketches) and change existing code with three_edit_code (read / search big layers with three_read_code and three_search_code), read the errors it returns, look with three_screenshot, and iterate until it matches what they asked for. '
      + 'Don\'t paste the code into the chat unless they ask for it: describe what you made and what they can ask for next (camera, mood, motion, materials…). '
      + 'Prefer good-looking defaults: tone mapping, environment lighting, soft shadows, smooth animation, sensible performance. '
      + 'The user mostly makes music visualizers (often 9:16 for Shorts) and does not write code: every sketch must have clearly named sliders made with tweak() (labels, groups, hints, sensible ranges, options for styles; see the tool guide), read live every frame. Animate on the timeline first, like After Effects (time, easing, keyframes, the song\'s cues and sections); add music reactivity only when they ask. '
      + 'When they do, check the track with three_media_info: if the user placed kick / snare / hit markers or set a beat grid, build the hits on those (audio.kick, audio.snare, audio.hit, audio.beatInBar) instead of guessing from the audio, or link sliders with /make-it-react (three_run). Look at a hit or drop (three_media_control) when you check your work. '
      + 'Every new element or effect goes in a new layer (three_add_layer); rewrite an existing layer only when asked. '
      + (nodesOn(agent) ? `${threeGuide().NODES_LINE} ` : '')
      + 'Sketches can have layers (like Photoshop / After Effects): when the user asks to add, remove, time, fade, move or blend a layer, use the layer tools (three_add_layer, three_update_layer, three_remove_layer, three_layers); upper layers must be transparent. For changes over time ("fade in on the drop", "zoom during the build") use three_keyframes or three_animate presets. You can read and edit the timeline (three_timeline, three_timeline_edit) and the notes the user pins on moments (three_notes: they come with screenshots; mark them done when handled). Looks like ASCII, datamosh, found footage/VHS, glitch, CRT, pixelate, halftone, film, kaleidoscope, edge glow, thermal, duotone or glow are filter layers (three_add_layer with that template) placed above what they should affect. The user can give you reference files (pictures, logos, clips, models, sounds): three_references lists them and adds pictures they attach here; use them in code with refTexture(name) or refs.name. '
      + 'If three_get_code reports unsavedSliders, the user tuned those by hand: keep their values.');
    parts.push(threeGuide().FULL);
    parts.push(hearthMap().LINE('three_help'));
  }
  if (web) parts.push('You can search the web when the answer depends on recent or specific facts; say briefly where facts come from.');
  if (!folder && !usesApps && !sets.length) parts.push(web ? 'Apart from web search you have no tools: never try to run commands or read files.' : 'You have no tools: never try to run commands, read files or browse the web.');
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
  return parts.filter(Boolean).join('\n\n');
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

// Claude flags Hearth can do without (name -> how many values follow it). Claude Code versions differ in which of
// these they know, so when the CLI says "unknown option" for one, send() drops it and retries at once. What a
// given Claude binary rejected is remembered (data/claude-flags.json) until that binary changes (an update).
const CLAUDE_OPTIONAL = {
  '--system-prompt-snapshot': 1, '--disable-slash-commands': 0, '--setting-sources': 1, '--include-partial-messages': 0,
  '--thinking-display': 1, '--effort': 1, '--permission-prompts': 1, '--restricted': 0, '--strict-mcp-config': 0,
  '--permission-mode': 1, '--session-id': 1, '--tools': 1,
};
const CLAUDE_FLAGS_FILE = path.join(DATA_DIR, 'claude-flags.json');
let claudeDropped = new Set();
let claudeBinKey = '';
function binKey(bin) { try { const st = fs.statSync(bin); return `${bin}|${st.size}|${st.mtimeMs}`; } catch { return bin || ''; } }
// Loads what this Claude binary rejected before (a different or updated binary starts clean).
function loadDropped(bin) {
  const key = binKey(bin);
  if (key === claudeBinKey) return;
  claudeBinKey = key;
  claudeDropped = new Set();
  try {
    const saved = JSON.parse(fs.readFileSync(CLAUDE_FLAGS_FILE, 'utf8'));
    if (saved.bin === key) claudeDropped = new Set((saved.dropped || []).filter((f) => f in CLAUDE_OPTIONAL));
  } catch { /* nothing saved yet */ }
}
function rememberDropped(flag) {
  claudeDropped.add(flag);
  try { fs.writeFileSync(CLAUDE_FLAGS_FILE, JSON.stringify({ bin: claudeBinKey, dropped: [...claudeDropped] })); } catch { /* only saves a retry next time */ }
}
function dropUnsupported(args) {
  if (!claudeDropped.size) return args;
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (claudeDropped.has(args[i])) { i += CLAUDE_OPTIONAL[args[i]]; continue; }
    out.push(args[i]);
  }
  return out;
}
// The optional flag an "unknown option" error names, if it's one Hearth can do without (and hasn't dropped yet).
function unsupportedFlag(text) {
  const m = /(?:unknown|unrecognized|unexpected) (?:option|argument|flag):? ['"`]?(--[\w-]+)/i.exec(text || '');
  return m && m[1] in CLAUDE_OPTIONAL && !claudeDropped.has(m[1]) ? m[1] : null;
}

function claudeArgs(agent, session, options = {}) {
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--setting-sources', 'project', '--disable-slash-commands',
    ...claudeToolArgs(agent, options),
    '--system-prompt', buildPrompt(agent),
  ];
  const model = options.model || agent.model;
  if (model) args.push('--model', model);
  // a chat can pick its own effort (Astra's /astra-effort works for Claude chats too)
  const effort = pick(options.effort, EFFORTS.claude) || agent.effort;
  if (effort) args.push('--effort', effort);
  // Readable summaries of its thinking, streamed while it works (shown folded in the chat).
  if (agent.showThinking !== false) args.push('--thinking-display', 'summarized');
  if (session.id) args.push('--resume', session.id);
  else args.push('--session-id', crypto.randomUUID());
  return dropUnsupported(args);
}

// The instructions file is named after its content, so two runs of the same agent with different personas
// (a council, a debate) never overwrite each other's prompt.
function promptFile(agent) {
  const text = buildPrompt(agent);
  const file = path.join(PROMPTS_DIR, `${agent.id}-${crypto.createHash('sha1').update(text).digest('hex').slice(0, 10)}.md`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, text);
  else { try { const now = new Date(); fs.utimesSync(file, now, now); } catch { /* only keeps it from being pruned */ } }
  return file;
}
// Prompt files nobody used for a week (old personas, old memory) are cleared at start.
function prunePrompts() {
  try {
    const cutoff = Date.now() - 7 * 86400000;
    for (const name of fs.readdirSync(PROMPTS_DIR)) {
      const file = path.join(PROMPTS_DIR, name);
      if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
    }
  } catch { /* best-effort */ }
}
prunePrompts();

function codexArgs(agent, session, options = {}) {
  const file = promptFile(agent);
  const folder = fileFolder(agent);
  const edit = Boolean(folder) && agent.codexFiles === 'edit';
  const args = ['exec'];
  if (session.id) args.push('resume', session.id);
  args.push('--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules');
  let disabled = agent.chatgptApps ? CODEX_DISABLED_FEATURES.filter((f) => f !== 'apps') : CODEX_DISABLED_FEATURES;
  // File access (opt-in): Codex looks at files with its shell tool, which runs inside its OS sandbox.
  if (folder) disabled = disabled.filter((f) => f !== 'shell_tool');
  // Features switched back on for this agent (/astra-feature): each adds its tool definitions to every message.
  if (Array.isArray(agent.codexFeatures)) disabled = disabled.filter((f) => !agent.codexFeatures.includes(f));
  for (const feature of disabled) args.push('--disable', feature);
  const web = pick(options.webSearch, WEB_SEARCH) || pick(agent.webSearch, WEB_SEARCH) || 'disabled';
  args.push(
    '-c', `model_instructions_file=${tomlStr(file)}`,
    '-c', 'project_doc_max_bytes=0',
    '-c', `web_search="${web}"`,
  );
  if (folder) {
    // resumed runs get the sandbox again (-s only applies to new sessions); writes only inside the folder, no network
    args.push('-c', `sandbox_mode="${edit ? 'workspace-write' : 'read-only'}"`, '-c', 'approval_policy="never"');
    if (edit) args.push('-c', `sandbox_workspace_write.writable_roots=[${tomlStr(folder)}]`, '-c', 'sandbox_workspace_write.network_access=false');
  }
  let effort = pick(options.effort, EFFORTS.codex) || pick(agent.effort, EFFORTS.codex);
  // minimal reasoning can't use the web search tool: with web on it becomes low instead of failing
  if (effort === 'minimal' && web !== 'disabled') effort = 'low';
  if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  // Thinking summaries: switching them off saves output tokens; a chosen style is opt-in.
  const summary = agent.showThinking === false ? 'none' : pick(agent.reasoningSummary, SUMMARIES);
  if (summary) args.push('-c', `model_reasoning_summary="${summary}"`);
  const verbosity = pick(options.verbosity, VERBOSITY) || pick(agent.verbosity, VERBOSITY);
  if (verbosity) args.push('-c', `model_verbosity="${verbosity}"`);
  args.push(...codexMcpArgs(agent));
  const model = options.model || agent.model;
  if (model) args.push('-m', model);
  if (!session.id) args.push('-s', edit ? 'workspace-write' : 'read-only', '-C', WORKSPACE);
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
    if (msg.type === 'stream_event' && msg.event?.delta?.type === 'thinking_delta' && msg.event.delta.thinking) {
      return { type: 'thinking', text: msg.event.delta.thinking };
    }
    if (msg.type === 'stream_event' && msg.event?.type === 'content_block_start' && msg.event.content_block?.type === 'thinking') {
      return { type: 'thinking', text: '\n\n' };
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
          // for the meter (meter.js): cache reads / writes and Claude's own API-price estimate
          cached: u.cache_read_input_tokens || 0,
          cacheWrite: u.cache_creation_input_tokens || 0,
          cost: msg.total_cost_usd || 0,
        },
      };
    }
    return null;
  };
}

// Codex `exec --json` events: thread.started, turn.started, item.started / item.updated / item.completed
// (agent_message, reasoning, command_execution, file_change, mcp_tool_call, web_search, todo_list, error),
// turn.completed (usage), turn.failed, error.
function codexParser(session, agent = {}) {
  let text = '';
  const seen = new Map(); // agent_message item id -> text already streamed (item.updated sends the text so far)
  const short = (s, n = 60) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const messageText = (item) => {
    const shown = seen.get(item.id) || '';
    const full = String(item.text || '');
    if (!full.startsWith(shown)) return null; // rewritten mid-way: wait for the completed item
    const add = full.slice(shown.length);
    if (!add) return null;
    const lead = !shown && text ? '\n\n' : '';
    seen.set(item.id, full);
    text += lead + add;
    return { type: 'delta', text: lead + add };
  };
  return (msg) => {
    const item = msg.item || {};
    if (msg.type === 'thread.started') session.id = msg.thread_id;
    if (item.type === 'agent_message' && (msg.type === 'item.updated' || msg.type === 'item.completed')) {
      if (!item.id) { // older Codex: only completed messages, no ids
        const part = (text ? '\n\n' : '') + (item.text || '');
        text += part;
        return { type: 'delta', text: part };
      }
      return messageText(item);
    }
    if (msg.type === 'item.completed' && item.type === 'reasoning' && item.text) {
      return agent.showThinking === false ? null : { type: 'thinking', text: `${item.text}\n\n` };
    }
    if (msg.type === 'item.started' && /tool_call/.test(item.type || '')) {
      return { type: 'tool', name: [item.server, item.tool].filter(Boolean).join(' · ') || item.type };
    }
    if (msg.type === 'item.started' && item.type === 'command_execution') return { type: 'tool', name: `Shell · ${short(item.command)}` };
    if (msg.type === 'item.started' && item.type === 'web_search') return { type: 'tool', name: `Web search · ${short(item.query, 50)}` };
    if (msg.type === 'item.completed' && item.type === 'file_change') {
      const files = (item.changes || []).map((c) => path.basename(c.path || '')).filter(Boolean);
      return { type: 'tool', name: `${item.status === 'failed' ? 'Edit failed' : 'Edited'} · ${short(files.join(', ') || 'files')}` };
    }
    // Its own plan (todo list) becomes the chat's live checklist.
    if ((msg.type === 'item.started' || msg.type === 'item.updated' || msg.type === 'item.completed') && item.type === 'todo_list' && Array.isArray(item.items)) {
      return { type: 'progress', steps: item.items.slice(0, 12).map((s) => ({ text: short(s.text, 160), status: s.completed ? 'done' : 'todo' })) };
    }
    // Non-fatal warnings (an item of type error) go into the thinking fold, not the reply.
    if (msg.type === 'item.completed' && item.type === 'error' && item.message) return { type: 'thinking', text: `⚠ ${item.message}\n\n` };
    if (msg.type === 'turn.completed') {
      // Codex has reported running totals for the whole thread (shown here as what this turn added); a
      // smaller number than last time means this version reports per turn, so it is used as is.
      const u = msg.usage || {};
      const totals = { input: u.input_tokens || 0, output: u.output_tokens || 0, cached: u.cached_input_tokens || 0, reasoning: u.reasoning_output_tokens || 0 };
      const prev = session.totals || { input: 0, output: 0, cached: 0, reasoning: 0 };
      const perTurn = totals.input < prev.input || totals.output < prev.output;
      const delta = (k) => (perTurn ? totals[k] : Math.max(totals[k] - (prev[k] || 0), 0));
      session.totals = perTurn ? Object.fromEntries(Object.keys(totals).map((k) => [k, (prev[k] || 0) + totals[k]])) : totals;
      const usage = { input: delta('input'), output: delta('output') };
      if (delta('cached')) usage.cached = delta('cached');
      if (delta('reasoning')) usage.reasoning = delta('reasoning');
      return { type: 'done', text, usage };
    }
    if (msg.type === 'turn.failed') return { type: 'error', message: msg.error?.message || 'Codex turn failed' };
    if (msg.type === 'error') {
      // "Reconnecting… 2/5" and similar retries are progress, not the end of the turn
      if (/reconnect|retrying|retry \d/i.test(msg.message || '')) return { type: 'thinking', text: `⚠ ${msg.message}\n\n` };
      return { type: 'error', message: msg.message || 'Codex error' };
    }
    return null;
  };
}

// Known failures with what to do about them (shown under the error in the chat).
const FIXES = [
  [/model\b.*\b(not supported|does not exist|not found|unavailable|unknown)|unsupported model|invalid model|model_not_found/i,
    (e) => `That model isn't available on your ${ENGINES[e].account} account. Pick another one in the chat header's Model menu${e === 'codex' ? ' or with /astra-model' : ''}.`],
  [/usage limit|rate.?limit|too many requests|\b429\b|quota/i,
    (e) => `Your plan's usage limit was reached for now. Wait for it to reset, or use a lighter model / lower effort${e === 'codex' ? ' (/astra-model, /astra-effort low)' : ''}.`],
  [/unexpected argument|unrecognized (option|argument)|unknown (option|flag|argument)|invalid value for|found argument .* which wasn't expected/i,
    (e) => `This ${ENGINES[e].label} version doesn't know one of Hearth's options. Update the ${e === 'codex' ? 'Codex' : 'Claude'} app, then run /astra-doctor.`],
  [/ENOENT|EACCES|EPERM|spawn /i,
    (e) => `Hearth couldn't start ${ENGINES[e].label}. Check its path in Settings → Engines, or run /astra-doctor.`],
  [/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network|stream disconnected|connection (closed|reset)|getaddrinfo/i,
    () => 'Network problem: check the internet connection (or VPN / proxy), then press Retry.'],
  [/context (window|length)|maximum context|too many tokens|prompt is too long|input too long/i,
    () => 'The conversation is too long for the model: compact it (🗜 in the chat menu) or start a new chat from a summary.'],
  [/sandbox|landlock|seatbelt|seccomp/i,
    () => 'Codex\'s sandbox refused something. File access in Astra\'s settings decides what it may read or change (/astra-files).'],
];

function friendlyError(engine, message) {
  if (/not logged in|please run \/login|codex login|unauthori[sz]ed|\b401\b|sign in again|token (expired|is invalid)|refresh token/i.test(message)) {
    return { message: `${ENGINES[engine].label} isn't signed in to your ${ENGINES[engine].account} account.`, needsLogin: true, fix: 'Press the sign-in button below (or run /astra-login), finish in the window that opens, then Retry.' };
  }
  const hit = FIXES.find(([re]) => re.test(message));
  if (!hit) return { message };
  const fix = hit[1](engine);
  return { message: `${message}\n\nFix: ${fix}`, fix };
}

// The engine has no saved session under that id anymore (cleared, other machine, other version).
const LOST_SESSION = /no (saved |matching )?(conversation|session|thread|rollout)s? (was )?found|(thread|session|conversation|rollout) (not found|does not exist)|could not (find|resume) (the )?(session|thread|rollout|conversation)|failed to (resume|load) (the )?(session|thread|rollout|conversation)/i;

function send({ agent, chatId, session, text, options = {} }, emit) {
  const engine = agent.engine;
  // A per-run persona replaces the agent's own instructions; "lean" runs (collaborations, quick asks) drop
  // the hub tool sets and file tools so they cost no more than a plain chat turn.
  if (options.persona) agent = { ...agent, systemPrompt: String(options.persona).slice(0, 4000) };
  if (options.lean) agent = { ...agent, chatTools: false, threeTools: false, videoTools: false, gameTools: false, workspace: undefined, selfReview: false, connectors: undefined, chatgptApps: false };
  // "hubOnly" runs (a jam's build turns, jam.js) keep the agent's tool sets (Lab, video…) and drop the rest.
  if (options.hubOnly) agent = { ...agent, chatTools: false, workspace: undefined, selfReview: false, connectors: undefined, chatgptApps: false };
  // asDirector: 'three' (a jam's build turn on an agent that isn't a Lab director, e.g. your Astra): this one turn gets
  // the Lab's tools, Codex through its MCP overrides
  if (options.asDirector === 'three') agent = { ...agent, threeTools: true, hubTools: agent.engine === 'codex' ? true : agent.hubTools, dock: agent.dock || 'three' };
  if (chatId && !String(chatId).startsWith('once-') && hubToolsets(agent).some((k) => k !== 'chatTools')) agent = { ...agent, hubChatId: chatId };
  const original = text;
  if (engine === 'claude' && options.images?.length) {
    text += `\n\n[Attached image${options.images.length > 1 ? 's' : ''}: open with your Read tool before answering]\n${options.images.join('\n')}`;
  }
  const bin = LOCATE[engine]?.();
  if (!bin) {
    emit({ type: 'error', message: `Couldn't find ${ENGINES[engine]?.label || engine} on this ${IS_MAC ? 'Mac' : 'PC'}.\n\nFix: install the ${engine === 'codex' ? 'Codex (ChatGPT)' : 'Claude'} desktop app, or set its path in Settings → Engines. /astra-doctor shows what Hearth looked for.` });
    return;
  }
  if (agent.workspace && !fileFolder(agent)) {
    emit({ type: 'error', message: `The file access folder ${agent.workspace} doesn't exist anymore. Change it in the agent's settings.` });
    return;
  }
  // Sessions always live in the hub's own workspace so chats resume even after the folder changes;
  // the project folder is reached through --add-dir (Claude) or the sandbox's writable roots (Codex).
  const state = { ...session };
  if (engine === 'claude') loadDropped(bin);
  const args = engine === 'claude' ? claudeArgs(agent, state, options) : codexArgs(agent, state, options);
  const parse = engine === 'claude' ? claudeParser(state) : codexParser(state, agent);

  // MCP_TOOL_TIMEOUT: a question to the user (chat_ask) can wait a long time for the answer.
  const child = spawn(bin, args, { cwd: WORKSPACE, windowsHide: true, env: { ...process.env, MCP_TOOL_TIMEOUT: String(45 * 60000) } });
  running.set(chatId, child);
  child.stdin.on('error', () => { /* the engine quit before reading its input; close reports why */ });
  child.stdin.end(text);

  let finished = false;
  let streamed = false;
  let buffer = '';
  const startedAt = Date.now();
  let toolCount = 0; // tool calls in this reply (token meter)
  let stderr = '';
  let idle = null;
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => { child.hubIdle = true; log(`${engine} ${chatId} idle for ${IDLE_MS / 60000} min, stopping`); kill(child); }, IDLE_MS);
  };
  touch();
  const finish = (event) => {
    if (finished) return;
    finished = true;
    clearTimeout(idle);
    // A chat whose engine session is gone continues in a fresh one, with the conversation sent as context.
    if (event.type === 'error' && session.id && !streamed && options.fallbackText && LOST_SESSION.test(`${event.message}\n${stderr}`)) {
      log(`${engine} ${chatId} session ${session.id} lost, starting fresh with context`);
      if (running.get(chatId) === child) running.delete(chatId);
      try { child.kill(); } catch { /* already gone */ }
      emit({ type: 'thinking', text: `⚠ The earlier ${ENGINES[engine].label} session couldn't be resumed, so this continues in a new one with the conversation as context.\n\n` });
      send({ agent, chatId, session: {}, text: options.fallbackText, options: { ...options, fallbackText: undefined, persona: undefined, lean: undefined } }, emit);
      return;
    }
    // An older / newer Claude Code that doesn't know an optional flag: run again without it.
    const flag = event.type === 'error' && engine === 'claude' && !streamed ? unsupportedFlag(`${event.message}\n${stderr}`) : null;
    if (flag) {
      log(`claude doesn't know ${flag}, retrying without it`);
      rememberDropped(flag);
      if (running.get(chatId) === child) running.delete(chatId);
      send({ agent, chatId, session, text: original, options }, emit);
      return;
    }
    if (event.type === 'error') Object.assign(event, friendlyError(engine, event.message));
    if (event.type === 'done') { try { addUsage(agent.id, event.usage, { chatId, model: options.model || agent.model || '', dock: agent.dock || '', ms: Date.now() - startedAt, tools: toolCount }); } catch { /* usage stats are best-effort */ } }
    emit({ ...event, session: state });
  };
  const handleLine = (raw) => {
    const line = raw.trim();
    if (!line.startsWith('{')) return;
    let event;
    try { event = parse(JSON.parse(line)); } catch { return; }
    if (!event) return;
    if (event.type === 'tool') toolCount += 1;
    if (STREAM_EVENTS.has(event.type)) { if (event.type === 'delta') streamed = true; if (!finished) emit(event); } else finish(event);
  };

  child.stdout.on('data', (chunk) => {
    touch();
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      handleLine(line);
    }
    if (buffer.length > MAX_LINE) { log(`${engine} ${chatId} dropped an oversized line (${buffer.length} bytes)`); buffer = ''; }
  });
  child.stderr.on('data', (chunk) => { touch(); stderr = (stderr + chunk).slice(-4000); });
  child.on('error', (err) => finish({ type: 'error', message: err.message }));
  child.on('close', (code, signal) => {
    if (running.get(chatId) === child) running.delete(chatId);
    if (agent.hubChatId && engine === 'claude') fs.rm(mcpConfigFile(agent), { force: true }, () => {});
    if (buffer.trim()) { handleLine(buffer); buffer = ''; } // the last line may come without a newline
    log(`${engine} ${chatId} exit=${code} signal=${signal} finished=${finished} stderr=${JSON.stringify(stderr.slice(-400))}`);
    if (child.hubIdle) finish({ type: 'error', message: `${ENGINES[engine].label} printed nothing for ${IDLE_MS / 60000} minutes, so Hearth stopped it. Press Retry.` });
    else if (code === null || child.hubStopped) finish({ type: 'stopped' });
    else finish({ type: 'error', message: lastErrorLine(stderr) || `${ENGINES[engine].label} exited (${code})` });
  });
}
// Events that stream into the live reply (everything else ends it).
const STREAM_EVENTS = new Set(['delta', 'tool', 'thinking', 'progress']);
// The most telling stderr line: an "Error:" line when there is one, else the last line.
function lastErrorLine(stderr) {
  const lines = stderr.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  return [...lines].reverse().find((l) => /error/i.test(l)) || lines.pop() || '';
}

// One question, one answer, no saved chat: second opinions, quick asks and collaborations that don't stream.
// options: { model, effort, persona, lean, webSearch } as for send(); timeoutMs stops a run that hangs.
function once({ agent, text, images = [], options = {}, timeoutMs = 8 * 60000 }) {
  return new Promise((resolve) => {
    const chatId = `once-${crypto.randomUUID()}`;
    let out = '';
    const timer = setTimeout(() => { stop(chatId); resolve({ ok: false, error: `No answer after ${Math.round(timeoutMs / 60000)} minutes.` }); }, timeoutMs);
    send({ agent: { ...agent, chatTools: false, noHubTools: true }, chatId, session: {}, text, options: { ...options, images } }, (event) => {
      if (event.type === 'delta') out += event.text;
      if (event.type === 'done') { clearTimeout(timer); resolve({ ok: true, text: event.text || out, usage: event.usage }); }
      if (event.type === 'error' || event.type === 'stopped') { clearTimeout(timer); resolve({ ok: false, error: event.message || 'stopped' }); }
    });
  });
}

function stop(chatId) {
  log(`stop requested ${chatId}`);
  const child = running.get(chatId);
  if (!child) return false;
  child.hubStopped = true; // an engine that exits cleanly on SIGTERM still counts as stopped, not failed
  kill(child);
  return true;
}
// Stops an engine and what it started (MCP tool servers): on Windows the whole process tree, elsewhere
// SIGTERM, then SIGKILL if it is still there after 5 s.
function kill(child) {
  if (IS_WIN && child.pid) {
    try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill()); return; } catch { /* fall back */ }
  }
  child.kill();
  const force = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch { /* gone */ } } }, 5000);
  child.once('close', () => clearTimeout(force));
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

// Runs a short command of an engine (version, login status) and returns its output; never throws.
function quick(bin, args, ms = 10000) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try { child = spawn(bin, args, { cwd: WORKSPACE, windowsHide: true }); } catch (err) { resolve({ code: -1, out: err.message }); return; }
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, out: `${out}\n(timed out)`.trim() }); }, ms);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, out: err.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out: out.trim().slice(0, 2000) }); });
  });
}

// Diagnostics for /astra-doctor: where each engine was found, its version and (Codex) whether it's signed in.
// agents (optional): native agents whose prompt size per message is estimated (instructions + memory).
async function doctor(agents = []) {
  const report = {};
  for (const engine of Object.keys(ENGINES)) {
    const bin = LOCATE[engine]();
    const from = !bin ? null : given(engine) ? 'Settings → Engines' : findOnPath(engine) === bin ? 'PATH' : 'desktop app';
    const r = { label: ENGINES[engine].label, found: Boolean(bin), path: bin, from };
    if (bin) {
      const v = await quick(bin, ['--version']);
      r.version = v.code === 0 ? (v.out.split('\n').find(Boolean) || '').trim() : null;
      if (engine === 'codex') {
        const s = await quick(bin, ['login', 'status']);
        r.loggedIn = s.code === 0 && !/not logged in/i.test(s.out);
        r.loginText = s.out.split('\n').filter(Boolean).pop() || '';
      }
    }
    report[engine] = r;
  }
  report.platform = process.platform;
  // options this Claude Code doesn't know, which Hearth leaves out
  if (LOCATE.claude()) { loadDropped(LOCATE.claude()); report.claudeSkipped = [...claudeDropped]; }
  report.workspace = WORKSPACE;
  try { fs.accessSync(WORKSPACE, fs.constants.W_OK); report.workspaceOk = true; } catch { report.workspaceOk = false; }
  // the hub's MCP tool servers (talk-back, directors) and the bridge they call
  report.mcp = Object.fromEntries(Object.values(HUB_TOOLSETS).map(({ server, script }) => [server, fs.existsSync(path.join(__dirname, 'mcp', script))]));
  report.bridge = fs.existsSync(path.join(DATA_DIR, 'game-bridge.json'));
  report.prompts = agents.filter((a) => a.mode === 'native').map((a) => {
    const text = buildPrompt(a);
    return { id: a.id, name: a.name, engine: a.engine, chars: text.length, tokens: Math.ceil(text.length / 4), tools: hubToolsets(a), text,
      // the command line a new chat would run (prompt text shortened), for /astra-flags
      args: (a.engine === 'codex' ? codexArgs(a, {}, {}) : claudeArgs(a, {}, {})).map((x) => (x.length > 160 ? `${x.slice(0, 157)}…` : x)) };
  });
  return report;
}

function status() {
  return Object.fromEntries(Object.keys(ENGINES).map((e) => [e, Boolean(LOCATE[e]())]));
}

// Lists Claude's connected apps by reading its startup report, then stops it before it
// answers, so this costs next to nothing.
function discoverConnectors() {
  const bin = LOCATE.claude();
  if (!bin) return Promise.resolve(readConnectorCache());
  loadDropped(bin);
  return new Promise((resolve) => {
    const child = spawn(bin, dropUnsupported([
      '-p', '--output-format', 'stream-json', '--verbose', '--setting-sources', 'project',
      '--tools', '', '--disable-slash-commands', '--permission-prompts', 'none',
    ]), { cwd: WORKSPACE, windowsHide: true });
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
  send, stop, stopAll, login, status, discoverConnectors, readConnectorCache, isReadOnlyTool: (name) => READ_ONLY_TOOL.test(name), once, setEnginePaths,
  doctor, EFFORTS, CODEX_DISABLED_FEATURES,
  // for tests (dev/astra-engine-test.js)
  _test: { codexArgs, claudeArgs, unsupportedFlag, get claudeDropped() { return claudeDropped; }, codexParser, claudeParser, friendlyError, buildPrompt, hubToolsets, hubToolEnv, nodesOn, LOST_SESSION },
  buildPrompt, HUB_TOOLSETS, // the director cost report (mcp/cost.js)
};
