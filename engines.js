// Native chat engines: the official Claude Code and Codex command-line tools, signed in with
// your Claude / ChatGPT accounts. Every run is stripped down to plain chat — no coding tools,
// no project files, no plugins — plus only the connected apps you switched on for that agent.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR, ATTACH_DIR, getMemory, addUsage } = require('./store');
const Installs = require('./installs');
// (round 32) Windows: npm's claude.cmd / codex.cmd found and started, plain errors (a test copy without the file: as before)
const WinPolish = (() => { try { return require('./winpolish'); } catch { return { spawn, candidates: () => [], cleanPath: (p) => p, plainError: () => null, dropStack: (t) => String(t || '') }; } })();
// (round 33) the Mac: nvm / fnm / asdf / mise / Volta / pnpm / Bun / app copies found, Gatekeeper and macOS errors in plain words
const MacPolish = (() => { try { return require('./macpolish'); } catch { return { candidates: () => [], cleanPath: (p) => p, plainError: () => null, lookedIn: () => '' }; } })();
// (round 26, connections) the owner's own MCP servers, switched on per AI in ⋯ AI setup (connectionsmain.js)
const Conn = (() => { try { return require('./connectionsmain'); } catch { return null; } })();
// (round 31, tokensaver) where saved memory goes (system prompt or only relevant messages), shared with chat-memory.js
const CtxCore = (() => { try { return require('./context-core'); } catch { return null; } })();
const conns = (agent) => (Conn ? Conn.enabledFor(agent) : []);

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

// (round 20, soak) the log keeps the last ≈ 2 MB: past that it moves to engine.prev.log (checked every 200 lines)
let logLines = 0;
function log(line) {
  try {
    if (logLines++ % 200 === 0 && fs.statSync(LOG_PATH, { throwIfNoEntry: false })?.size > 2 * 1048576) fs.renameSync(LOG_PATH, path.join(DATA_DIR, 'engine.prev.log'));
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch { /* logging is best-effort */ }
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
// (round 32, winpolish) a pasted Windows path is cleaned first: quotes from "Copy as path", %APPDATA%, npm's extensionless
// script (…\npm\claude → claude.cmd), a folder (→ the program in it)
const given = (name) => {
  if (!enginePaths[name]) return null;
  const p = IS_WIN ? WinPolish.cleanPath(enginePaths[name], { engine: name }) : IS_MAC ? MacPolish.cleanPath(enginePaths[name], { engine: name }) : enginePaths[name];
  return p && fs.existsSync(p) ? p : null;
};

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

// The newest working copy the last install check found (installs.js; Settings → Engines still wins), else the usual
// places in order. The check runs at startup, off the window's thread, and after an update.
const preferred = (name) => { const p = Installs.data().chosen[name]; return p && fs.existsSync(p) ? p : null; };
const LOCATE = {
  claude: () => given('claude') || preferred('claude') || (IS_WIN ? WinPolish.candidates('claude')[0] : IS_MAC ? MacPolish.candidates('claude', { shellPath: MacPolish.shellDirs })[0] || findOnPath('claude') : findOnPath('claude'))
    || (IS_WIN ? newestIn(path.join(process.env.APPDATA || '', 'Claude', 'claude-code'), 'claude.exe') : null)
    || (IS_MAC ? newestIn(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code'), 'claude') : null)
    || [path.join(os.homedir(), '.local', 'bin', exe('claude')), path.join(os.homedir(), '.claude', 'local', exe('claude'))].find((f) => fs.existsSync(f))
    || null,
  codex: () => given('codex') || preferred('codex') || (IS_WIN ? WinPolish.candidates('codex')[0] : IS_MAC ? MacPolish.candidates('codex', { shellPath: MacPolish.shellDirs })[0] || findOnPath('codex') : findOnPath('codex'))
    || (IS_WIN ? newestIn(path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin'), 'codex.exe') : null)
    || (IS_MAC ? newestIn('/Applications/Codex.app/Contents', 'codex', 4) || newestIn('/Applications/ChatGPT.app/Contents', 'codex', 4) || newestIn(path.join(os.homedir(), 'Library', 'Application Support', 'Codex'), 'codex', 4) : null)
    || null,
};

// (round 16) where each engine was found, remembered: a message no longer walks PATH (and, on a Mac without the CLI on
// PATH, the desktop app's versioned folders) before it spawns. One stat proves the copy is still there; a change in
// Settings → Engines or in the install check's choice, or 5 minutes, looks again. A miss is never remembered.
const located = {};
for (const name of Object.keys(LOCATE)) {
  const find = LOCATE[name];
  LOCATE[name] = () => {
    const key = `${enginePaths[name] || ''}|${Installs.data().chosen?.[name] || ''}`;
    const c = located[name];
    if (c && c.key === key && Date.now() - c.at < 5 * 60000 && fs.existsSync(c.bin)) return c.bin;
    const bin = find();
    if (bin) located[name] = { key, bin, at: Date.now() }; else delete located[name];
    return bin;
  };
}

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
  threeTools: { server: 'three', script: 'three-mcp.js' },
  // Ask the user questions in the chat, get a second opinion from the other engine. On for every Claude agent
  // unless switched off; opt-in for Astra (it adds tool definitions to every Codex request).
  chatTools: { server: 'chat', script: 'chat-mcp.js' },
  // The owner's mood board (board.js): read vibes, add, arrange. Opt-in per agent (/board-tools on | directors).
  boardTools: { server: 'board', script: 'board-mcp.js' },
  // Screenshots / recordings of Hearth and the exact frame reader (capture.js): opt-in per chat (/capture-tools on,
  // options.captureTools) or per agent (agent.captureTools), never on by default (≈ 550 tokens per message, /director-cost).
  captureTools: { server: 'capture', script: 'capture-mcp.js' },
  // The owner's Adobe apps (adobe.js) and publishing on the web (deploy.js): opt-in per agent (/adobe-tools on,
  // /deploy-tools on), one tool each. Publishing and the agent's own scripts ask the owner first.
  adobeTools: { server: 'adobe', script: 'adobe-mcp.js' },
  deployTools: { server: 'deploy', script: 'deploy-mcp.js' },
  // The owner's app windows and Meshy 3D models (apps.js): opt-in per agent (/apps-tools on | directors).
  appsTools: { server: 'apps', script: 'apps-mcp.js' },
  // (round 19, reach) Astra without the chat tools still gets chat_open (one tool, ~60 tokens): it opens a page / file /
  // folder for the owner instead of saying "I can't launch a browser". `/astra-open off` (agent.openTool = false) drops it.
  openTool: { server: 'chat', script: 'chat-mcp.js' },
};
// Claude agents get their tool sets (chat tools unless switched off). Codex agents (Astra) get the tool sets their
// agent has (a director switched to Astra) and chat tools only as an opt-in (talk-back, or agent.hubTools).
// One-off calls (second opinions) never get hub tools (agent.noHubTools).
const chatToolsOn = (agent) => (agent.engine === 'claude' ? agent.chatTools !== false : agent.chatTools === true || (agent.hubTools === true && agent.chatTools !== false));
const hubToolsets = (agent) => (agent.noHubTools ? [] : Object.keys(HUB_TOOLSETS).filter((k) => {
  if (k === 'chatTools') return chatToolsOn(agent);
  if (k === 'openTool') return agent.engine === 'codex' && !chatToolsOn(agent) && agent.openTool !== false;
  return Boolean(agent[k]);
}));
const gameTools = (agent) => hubToolsets(agent).includes('gameTools');
// The node tool (three_nodes) is on for Three directors: the owner wants a node view of the visual work they make
// (an explicit opt-in to its ≈ 75 tokens per message). `/nodes-director off` sets agent.nodesTool = false.
const nodesOn = (agent) => Boolean(agent.threeTools) && agent.nodesTool !== false;
// (round 31, tokensaver) who gets the chat tools' when-to-use guide and their whole list: directors (docked, or with a
// working tool set besides the chat). A plain chat gets the lean chat list (chat_ask, chat_open, chat_do + help).
const leanDirector = (agent) => Boolean(agent.threeTools) && !agent.noHubTools && agent.toolMode !== 'full' && agent.toolMode !== 'crew';
const OPT_IN_SETS = ['boardTools', 'captureTools', 'adobeTools', 'deployTools', 'appsTools'];
const chatGuideOn = (agent) => Boolean(agent.dock) || hubToolsets(agent).filter((k) => !OPT_IN_SETS.includes(k)).length > 1;
// What every hub MCP server gets: Node mode, the agent (for chat_ tools), opt-ins that change the tool list.
// HUB_CHAT_ID: the chat this run answers, so a director's tool calls reach that chat's own scene (chat-scenes.js).
const hubToolEnv = (agent, key) => ({ ...(key === 'openTool' ? { HUB_CHAT_ONLY: 'chat_open' } : {}), ELECTRON_RUN_AS_NODE: '1', HUB_AGENT_ID: agent.id, ...(agent.hubChatId ? { HUB_CHAT_ID: agent.hubChatId } : {}), ...(agent.engine === 'codex' ? { HUB_PARTNER: 'Claude' } : {}), ...(nodesOn(agent) ? { HUB_NODES_TOOL: '1' } : {}), ...(agent.toolMode === 'full' || agent.toolMode === 'crew' ? { HUB_TOOL_MODE: agent.toolMode } : {}), ...(agent.reportTool === false ? { HUB_NO_REPORT: '1' } : {}), ...(key === 'chatTools' && !chatGuideOn(agent) ? { HUB_CHAT_LEAN: '1' } : {}) });
// One file per run, removed when that run ends: a retry of the same chat (a lost session, an option the CLI doesn't
// know) starts while the previous run is still closing, and a shared file was deleted under the new run
// ("Invalid MCP configuration: … not found").
const mcpConfigFile = (agent) => path.join(DATA_DIR, 'mcp-runs', `${agent.id}-${String(agent.hubChatId || 'once').replace(/[^\w-]/g, '_')}-${crypto.randomUUID().slice(0, 8)}.json`);
function hubMcpConfig(agent) {
  const mcpServers = {};
  for (const key of hubToolsets(agent)) {
    const { server, script } = HUB_TOOLSETS[key];
    mcpServers[server] = { command: process.execPath, args: [path.join(__dirname, 'mcp', script)], env: hubToolEnv(agent, key) };
  }
  // (round 14) the permission check behind --permission-prompt-tool, for a chat with file access
  if (accessAsks(agent)) mcpServers.access = { command: process.execPath, args: [path.join(__dirname, 'mcp', 'access-mcp.js')], env: accessEnv(agent) };
  if (Conn) Object.assign(mcpServers, Conn.claudeServers(agent)); // (round 26) the owner's connections
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
      '-c', `${p}.env={ ${Object.entries(hubToolEnv(agent, key)).map(([k, v]) => `${k}=${tomlStr(String(v))}`).join(', ')} }`,
      // a question to the user (chat_ask) or a render can take a long time
      '-c', `${p}.tool_timeout_sec=${key === 'chatTools' || key === 'captureTools' || key === 'adobeTools' || key === 'deployTools' || key === 'appsTools' ? 2700 : 300}`,
      '-c', `${p}.startup_timeout_sec=30`,
      // Hearth's own tools are pre-approved: `codex exec` can't show an approval prompt, so newer Codex versions
      // cancelled every Lab / chat tool call ("Lab access was blocked"). Older versions ignore the key.
      '-c', `${p}.default_tools_approval_mode="approve"`,
    );
  }
  if (Conn) args.push(...Conn.codexArgs(agent, tomlStr)); // (round 26) the owner's connections
  return args;
}

// The opt-in project folder (both engines). Claude edits it with its file tools; Astra looks with read-only
// shell commands inside Codex's sandbox, and edits only when its file mode is "edit".
// A chat with its own access setting (round 14, below) replaces the agent's folder for its runs.
function fileFolder(agent) {
  if (agent.access) return null;
  return agent.workspace && fs.existsSync(agent.workspace) ? agent.workspace : null;
}

// ---------- per-chat file access (round 14, access.js) ----------
// A chat's ⋯ → Access (or /access) picks one level and its folders; they arrive as options.access = { level, folders }.
//   read   Claude: Read / Glob / Grep in the folders.  Codex: shell in a read-only sandbox.
//   write  + Edit / Write.  Codex: workspace-write sandbox, writable roots = the folders, no network.
//   full   + Bash and PowerShell (Claude; on Windows Claude Code runs commands through its PowerShell tool, and a
//          tool left out of --tools is refused by the CLI before Hearth's check sees it. A Claude Code without that
//          tool ignores the name). Codex: the same sandbox (it can't ask, so the risky parts stay off), or, when the
//          owner opted in on Windows (agent.astraNoSandbox, ⋯ AI setup), no sandbox, the folders as its working place.
// Claude's permission requests (edits, commands, anything outside the folders) go to mcp/access-mcp.js through
// --permission-prompt-tool: Hearth decides silently for safe things and shows an approval card for risky ones. A
// Claude Code that doesn't know that flag drops it (CLAUDE_OPTIONAL) and gets what a project folder always had: file
// tools with acceptEdits, no commands. Nothing is added to the prompt unless access is on (then one line).
const ACCESS_LEVELS = ['off', 'read', 'write', 'full'];
const PERMISSION_TOOL = 'mcp__access__access_permission';
function accessOf(agent) {
  const a = agent.access;
  if (!a || !ACCESS_LEVELS.includes(a.level) || a.level === 'off') return null;
  // (round 19) a folder stored on the other computer (a Mac path on Windows…) is this computer's same folder
  const here = (f) => { if (typeof f !== 'string' || (path.isAbsolute(f) && fs.existsSync(f))) return f; try { return require('./reachmain').localize(f)?.path || f; } catch { return f; } };
  // (round 35, twocomputers) a path still written the other computer's way after that is never used: on Windows
  // "/Volumes/Work" would quietly be C:\Volumes\Work, a folder the owner never chose
  const foreign = (f) => { try { return require('./twocomputers-core').foreign(f, process.platform); } catch { return false; } };
  const folders = [...new Set((Array.isArray(a.folders) ? a.folders : []).map(here).filter((f) => typeof f === 'string' && !foreign(f) && path.isAbsolute(f) && fs.existsSync(f)))].slice(0, 12);
  return { level: a.level, folders };
}
// Claude asks Hearth (the permission tool) unless this Claude Code rejected the flag before.
// (winshell) Astra without its sandbox: only at Read & write / Full, only when the owner switched it on (⋯ AI setup on
// Windows, where Codex's sandbox blocks every command). Read never loses its sandbox.
const codexOpen = (agent, acc = accessOf(agent)) => agent.engine === 'codex' && agent.astraNoSandbox === true && Boolean(acc) && acc.level !== 'read';
const accessAsks = (agent) => agent.engine !== 'codex' && Boolean(accessOf(agent)) && !claudeDropped.has('--permission-prompt-tool');
function accessLine(agent, acc) {
  return `${accessLine0(agent, acc)} ${OTHER_PC}`;
}
// (round 19, reach) one short clause while access is on: paths from the owner's other computer mean this one's files
const OTHER_PC = `Paths from the user's other computer (…/Hearth/data/…) are the same files in ${DATA_DIR} here.`;
function accessLine0(agent, acc) {
  const where = acc.folders.length ? acc.folders.join(', ') : 'no folder yet (ask the user to add one in ⋯ AI setup)';
  const label = { read: 'read only', write: 'read & write', full: 'full: files and commands' }[acc.level];
  if (agent.engine === 'codex') {
    // (winshell) no sandbox (the owner's Windows opt-in): the same line, with the rule the sandbox used to enforce
    if (codexOpen(agent, acc)) return `File access (${label}, no sandbox): ${where}. Edit with apply_patch; commands run unsandboxed, so stay inside these folders, no installs or downloads unless asked; to delete, move files into .hearth-trash/ at the top of that folder (Hearth sends them to the Trash).`;
    return acc.level === 'read' ? `File access (${label}): ${where}. Look with short read-only commands (ls, cat, rg, sed -n); you can't change files (the user can allow edits in ⋯ AI setup).`
      : `File access (${label}): ${where}. Edit with apply_patch; commands run sandboxed (writes only there, no network); to delete, move files into .hearth-trash/ at the top of that folder (Hearth sends them to the Trash).`;
  }
  if (acc.level === 'read') return `File access (${label}): ${where}. Use Read, Glob and Grep there; you can't change files (the user can allow edits in ⋯ AI setup).`;
  if (!accessAsks(agent)) return `File access (read & write): ${where}. Edit with your file tools; you can't run commands, so tell the user what to run.`;
  return acc.level === 'write' ? `File access (${label}): ${where}. Edit with your file tools; Hearth asks the user before risky changes.`
    : `File access (${label}): ${where}. Start commands with cd into it; deletes go to the Trash; a denied call means the user said no; never run commands that ask for a password (sudo, ssh): ask the user to run those in a terminal.`;
}
// What the access server needs: the chat to show its cards in, and where relative paths start.
const accessEnv = (agent) => ({ ELECTRON_RUN_AS_NODE: '1', HUB_AGENT_ID: agent.id, HUB_ACCESS_CHAT: agent.accessChatId || '', HUB_ACCESS_CWD: WORKSPACE });
// Which file / command a tool call touches, for the chat's activity log (access.js), from the engines' own events.
// (winshell) A command refused before it ran, by the engine's own policy: Claude Code's "No such tool available" (a tool
// left out of --tools, e.g. PowerShell on Windows) or a policy setting; Codex's sandbox / approval policy (on Windows its
// sandbox can block every command). access.js turns it into the one-line note with the fix.
const POLICY_BLOCKED = /no such tool available|blocked by (managed |enterprise |the )?polic|(disabled|denied|rejected|forbidden|not allowed) by (the )?(sandbox |exec ?)?polic|sandbox (is )?(not available|unavailable|not supported)|windows sandbox/i;
// What Codex's sandbox says when it refuses a write (Linux landlock / macOS seatbelt / Windows), as seen in a command's output.
const SANDBOX_DENIED = /read-only file system|operation not permitted|permission denied|access is denied|sandbox(: | denied| blocked)/i;
function toolAccess(name, input = {}) {
  const target = input.file_path || input.notebook_path || input.path || input.pattern || '';
  if (/^(Read|Glob|Grep|LS|NotebookRead)$/.test(name)) return { action: 'read', target, tool: name };
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(name)) return { action: 'write', target, tool: name };
  if (name === 'Bash' || name === 'PowerShell') return { action: 'run', target: String(input.command || '').slice(0, 400), tool: name };
  return null;
}
// Tool guides go into the system prompt, which the hub controls (the CLI may drop MCP server instructions when
// --system-prompt replaces its own), once, instead of being repeated in tool descriptions.
const threeGuide = () => require('./mcp/three-guide');
const hearthMap = () => require('./mcp/hearth-map');
function toolGuide(key) {
  try { return require(path.join(__dirname, 'mcp', HUB_TOOLSETS[key].script)).guide || ''; } catch { return ''; }
}

// (round 31, tokensaver) the two habit lines most chats carry, in fewer words (same asks, same tags)
const SUGGEST_LINE = 'When it helps, end with up to 3 short next steps as <suggest>…</suggest> (they become buttons; under 8 words each).';
// (round 35, concise) ⋯ AI setup → How long its answers are (agent.verbosity, the same field Astra's verbosity uses):
// Short / Detailed add ONE fixed line at the very end of a Claude prompt (Normal: nothing, zero tokens). Astra gets
// Codex's own model_verbosity flag instead (codexArgs), so no line. Byte-stable: constants only.
const ANSWER_LINES = {
  low: 'Answer length: short. Answer first; no preamble, restating the ask, narration between tool calls or closing recap; show only the code lines that change.',
  high: 'Answer length: detailed. Explain your reasoning, cover edge cases and give examples where they help.',
};
const answerLine = (agent) => (agent.engine === 'codex' ? '' : ANSWER_LINES[agent.verbosity] || '');
const REMEMBER_LINE = 'Rarely, when the user shares a lasting fact or preference worth keeping for future chats (not one-off details), add <remember>short fact</remember> on its own line at the very end of your reply; never mention these tags.';

// (round 32, cachewise) The prompt is built in two parts so the engines' prompt caches keep hitting:
//   head: what only changes with an app update or a tool set (the role line, tool guides, habits, the director part);
//   tail: what the owner changes mid-chat (personality, standing instructions, files / apps, saved memory), the least
//         likely to change first. Codex (Astra) caches by prefix, so a changed instruction leaves the whole head cached;
//         Claude re-reads its system prompt after any change, and a same-chat prompt is byte-identical message after message.
// Nothing here depends on the time, a counter, a random id or a Set / Map's order. session (optional: the chat's engine
// session, saved with the chat): saved memory is frozen per session while it only grows (memoryFor below).
// (round 36, tokenaudit) the prompt as named parts, in order ([key, text]): ⋯ AI setup → Spending → "Where its tokens go"
// reads the same parts the engine gets (tokenauditmain.js); buildPrompt joins them, byte for byte as before.
function promptParts(agent, session = null) {
  const usesApps = agent.engine === 'claude' ? enabledConnectors(agent).length > 0 : Boolean(agent.chatgptApps);
  const folder = fileFolder(agent);
  const web = agent.engine === 'codex' && WEB_SEARCH.includes(agent.webSearch) && agent.webSearch !== 'disabled';
  const parts = [];
  const add = (key, text) => { parts.push([key, text]); };
  // ---- head ----
  // (round 31, tokensaver) a lean Three Director's role is set by its own part below: no second "You are…" line
  if (!agent.systemPrompt && !leanDirector(agent)) {
    add('role', `You are ${agent.name}, chatting with the user in their personal desktop app. Answer directly, no preamble or recap; use Markdown when it helps.`);
  }
  if (gameTools(agent)) {
    add('game', 'A live debug instance of the user\'s game Forgeheart runs right next to this chat, and you control it with the forge_* tools. '
      + 'When the user asks for something in the game ("spawn me enemies", "make me invincible", "go to stage 80", "make drones faster"), do it right away with the tools '
      + 'instead of explaining how; check forge_status or forge_screenshot when you need to see the result. Reply briefly with what you changed.');
    add('guide:gameTools', toolGuide('gameTools'));
  }
  const sets = hubToolsets(agent);
  if (sets.includes('chatTools')) {
    // directors get the chat tools' when-to-use guide; plain chats only the <suggest> convention
    if (chatGuideOn(agent)) add('guide:chatTools', toolGuide('chatTools'));
    if (agent.suggestNext !== false) add('suggest', SUGGEST_LINE);
  } else if (agent.suggestNext) {
    add('suggest', SUGGEST_LINE);
  }
  // the board's one-line guide (references give a vibe, never footage) only for agents that have its tools
  if (sets.includes('boardTools')) add('guide:boardTools', toolGuide('boardTools'));
  if (sets.includes('appsTools')) add('guide:appsTools', toolGuide('appsTools')); // Meshy costs credits: one line
  // Directors (agents docked in a tool) check their own work unless switched off.
  if (agent.selfReview ?? Boolean(agent.dock)) add('selfReview', 'Before you finish, check the result against what was asked (visual work: one fresh small picture), fix real problems, then say in one line what you checked.');
  // (round 11) opt-in (`/progress tags on`, directors only): the agent says how far it is; Hearth draws the bar and hides the tag
  if (agent.dock && agent.progressTag) add('progress', 'During long work, now and then write <progress pct="40" note="what\'s next"/> (hidden; it drives the user\'s progress bar).');
  // (round 22, labcrew) a crew helper: the sketch rules in five lines, no app map (its brief says what to explore)
  if (sets.includes('threeTools') && agent.toolMode === 'crew') {
    add('director', 'SKETCH = layers (bottom first), each a complete ES module: import * as THREE from \'three\'; its own WebGLRenderer (alpha: true above the bottom layer) appended to document.body, sized to innerWidth/innerHeight, renderer.setAnimationLoop((now) => …).\n'
      + 'Sliders: const P = tweak({ key: { value, min, max, label, group } | \'#rrggbb\' }) near the top, read every frame. Music globals: audio.bass, audio.kick, audio.level (0..1).\n'
      + 'Change code with three_edit_code (small finds), a new element with three_add_layer, rewrite with three_set_code only when your angle needs it. Fix errors the results report. Stay within your call budget; end with one small three_screenshot, then one line: what you changed.');
  } else
  // Lean (default): the three-lab tool guide carries the how-to, so the prompt only sets the role. 'full' keeps the long version.
  // (round 32) the same role line with a personality too (it sits in the tail): changing one keeps this part cached
  if (sets.includes('threeTools') && agent.toolMode !== 'full') {
    add('director', `You are ${agent.name === 'Three Director' ? 'the Three Director' : `${agent.name}, the Three Director`}, chatting with the user in their desktop app. Prefer good-looking defaults (tone mapping, environment light, smooth motion, sensible performance) and small edits over rewrites.\n`
      + threeGuide().CORE
      + (nodesOn(agent) ? `\n${threeGuide().NODES_LINE}` : '')
      + `\n${hearthMap().LINE('three_do help')}`);
  } else if (sets.includes('threeTools')) {
    add('director', 'You turn the user\'s descriptions into three.js scenes in the Three.js Lab shown next to this chat. They prompt; you write the code. '
      + 'Build with three_set_code (complete sketches) and change existing code with three_edit_code (read / search big layers with three_read_code and three_search_code), read the errors it returns, look with three_screenshot, and iterate until it matches what they asked for. '
      + 'Don\'t paste the code into the chat unless they ask for it: describe what you made and what they can ask for next (camera, mood, motion, materials…). '
      + 'Prefer good-looking defaults: tone mapping, environment lighting, soft shadows, smooth animation, sensible performance. '
      + 'The user mostly makes music visualizers (often 9:16 for Shorts) and does not write code: every sketch must have clearly named sliders made with tweak() (labels, groups, hints, sensible ranges, options for styles; see the tool guide), read live every frame. Animate on the timeline first, like After Effects (time, easing, keyframes, the song\'s cues and sections); add music reactivity only when they ask. '
      + 'When they do, check the track with three_media_info: if the user placed kick / snare / hit markers or set a beat grid, build the hits on those (audio.kick, audio.snare, audio.hit, audio.beatInBar) instead of guessing from the audio, or link sliders with /make-it-react (three_run). Look at a hit or drop (three_media_control) when you check your work. '
      + 'Every new element or effect goes in a new layer (three_add_layer); rewrite an existing layer only when asked. '
      + (nodesOn(agent) ? `${threeGuide().NODES_LINE} ` : '')
      + 'Sketches can have layers (like Photoshop / After Effects): when the user asks to add, remove, time, fade, move or blend a layer, use the layer tools (three_add_layer, three_update_layer, three_remove_layer, three_layers); upper layers must be transparent. For changes over time ("fade in on the drop", "zoom during the build") use three_keyframes or three_animate presets. You can read and edit the timeline (three_timeline, three_timeline_edit) and the notes the user pins on moments (three_notes: they come with screenshots; mark them done when handled). Looks like ASCII, datamosh, found footage/VHS, glitch, CRT, pixelate, halftone, film, kaleidoscope, edge glow, thermal, duotone or glow are filter layers (three_add_layer with that template) placed above what they should affect. The user can give you reference files (pictures, logos, clips, models, sounds): three_references lists them and adds pictures they attach here; use them in code with refTexture(name) or refs.name. '
      + 'If three_get_code reports unsavedSliders, the user tuned those by hand: keep their values.');
    add('director', threeGuide().FULL);
    add('director', hearthMap().LINE('three_help'));
  }
  if (agent.crewOn && sets.includes('threeTools') && agent.toolMode !== 'crew') add('crew', 'Crew (on for this chat): for an open look question, three_do crew {op: "start", n: 2–6, brief, angles: [one per helper]} explores variations in parallel on copies of this scene (the owner approves the cost first; it answers when they finish). Then crew {op: "pick", n, reason} when asked to choose, or {op: "copy", from: n, layer} / {op: "code", n, layer} to merge parts.');
  if (web) add('web', 'You can search the web when the answer depends on recent or specific facts; say briefly where facts come from.');
  if (agent.autoMemory !== false) add('remember', REMEMBER_LINE);
  // ---- tail: what the owner changes mid-chat ----
  if (agent.systemPrompt) add('personality', agent.systemPrompt); // the personality (⋯ AI setup) or a run's persona
  // (round 26) ⋯ AI setup: the user's standing instructions, each one on / off
  const rules = (Array.isArray(agent.instructions) ? agent.instructions : []).filter((r) => r && r.on !== false && String(r.text || '').trim()).slice(0, 40).map((r) => `- ${String(r.text).trim().slice(0, 600)}`);
  if (rules.length) add('instructions', `The user's standing instructions (always follow them):\n${rules.join('\n')}`);
  const acc = accessOf(agent);
  if (acc) add('access', accessLine(agent, acc));
  if (folder && agent.engine === 'codex') {
    add('folder', agent.codexFiles === 'edit'
      ? `You can read and edit files in the project folder ${folder}: look with short read-only commands (ls, cat, rg, sed -n) and edit with apply_patch. `
        + 'Commands run in a sandbox with no network; never run builds, installs, deletes or anything outside that folder. Read before you edit, make focused changes, and list the files you changed at the end.'
      : `You can read files in the project folder ${folder} with short read-only commands (ls, cat, rg, sed -n). Stay inside that folder. `
        + 'You cannot change files: describe the edits instead, and tell the user what to run or test themselves.');
  } else if (folder) {
    add('folder', `You can read and edit files in the project folder ${folder} with your file tools `
      + '(Read, Edit, Write, Glob, Grep). Read before you edit, make focused changes, and list the files you changed '
      + 'at the end. You cannot run commands, so tell the user what to run or test themselves.');
  }
  if (usesApps) {
    add('apps', 'You can use the connected apps in your tools (for example email, documents or calendars) when the user asks about them or when it clearly helps.');
  }
  if (!folder && !acc && !usesApps && !sets.length && !conns(agent).length) add('notools', web ? 'Apart from web search you have no tools: never try to run commands or read files.' : 'You have no tools: never try to run commands, read files or browse the web.');
  // saved memory last: it is what changes most often
  const notes = memoryFor(agent, session);
  if (notes) add('memory', `What you remember about the user (saved notes, keep them in mind):\n${notes}`);
  // (round 35, concise) the answer length, last: switching it leaves everything before it cached
  add('answers', answerLine(agent));
  return parts.filter((p) => p[1]);
}
function buildPrompt(agent, session = null) {
  return promptParts(agent, session).map((p) => p[1]).join('\n\n');
}

// (round 24, context) /memory relevant on: the notes leave the system prompt; chat-memory.js sends only the facts a
// message is about; (round 31, tokensaver) by default too once they are big (≈ 300 tokens, context-core.js memoryRelevant).
// (round 32, cachewise) Within one engine session the notes are frozen while they only grow: a fact saved mid-chat (the
// AI's own <remember>, or another chat's) no longer changes the prompt, which made the next message re-read the whole
// chat without the cache. The AI that saved it already has it in this chat's history; every new chat gets it. An edited
// or deleted fact applies at once. session.mem: the notes this session's prompt carries (saved with the chat).
function memoryFor(agent, session) {
  if (agent.memoryOff) return ''; // (round 33) a mission's helper (send: options.helper)
  const memory = getMemory();
  // (round 38, memorytidy) + the place scopes this AI works in (Lab facts only for the Three Directors), fixed order
  const notes = CtxCore ? CtxCore.memoryNotes(memory, agent) : [memory.shared, memory.agents?.[agent.id]].map((m) => (m || '').trim()).filter(Boolean);
  if (!notes.length || (CtxCore ? CtxCore.memoryRelevant(agent, memory) : agent.memoryWhenRelevant)) { if (session) delete session.mem; return ''; }
  const now = notes.join('\n');
  if (!session) return now;
  const was = typeof session.mem === 'string' ? session.mem : null;
  if (was !== null && session.id && onlyGrew(was, now, memory.replaced)) return was;
  session.mem = now;
  return now;
}
// every line of the older notes is still there (anywhere): only facts were added.
// (round 38, memorytidy) replaced: [{ from, to }] facts the AI itself updated with <remember> (a newer fact replaced a
// duplicate or contradicted one, memorytidy-core.js saveFacts): the old line may be gone when its newer one is there,
// so a fact updated mid-chat keeps this chat's prompt as it was, like a fact added (the AI that saved it has it).
function onlyGrew(was, now, replaced = []) {
  if (was === now) return true;
  const have = new Map();
  for (const l of now.split('\n')) have.set(l, (have.get(l) || 0) + 1);
  const swapped = new Map((Array.isArray(replaced) ? replaced : []).filter((r) => r && r.from && r.to).map((r) => [String(r.from).trim(), String(r.to).trim()]));
  for (const l of was.split('\n')) {
    const n = have.get(l) || 0;
    if (n) { have.set(l, n - 1); continue; }
    const to = swapped.get(l.trim());
    if (!to || !now.split('\n').some((x) => x.trim() === to)) return false;
  }
  return true;
}

function readConnectorCache() {
  try { return JSON.parse(fs.readFileSync(CONNECTORS_CACHE, 'utf8')); } catch { return {}; }
}

// Claude's connected apps come from your Claude account. Each one is off, read-only or full.
function claudeToolArgs(agent, options = {}, session = {}) {
  const enabled = new Map(enabledConnectors(agent));
  const folder = fileFolder(agent);
  // Attached images are read with the Read tool from the hub's attachments folder.
  // (round 32, cachewise) …and the Read tool stays for the rest of that engine session: switching the tool list on for
  // the picture's message and off again for the next one made both re-read the whole chat without the cache (one cached
  // tool definition costs far less than one uncached re-read)
  const images = Boolean(options.images?.length) || session?.readTool === true;
  if (options.images?.length && session) session.readTool = true;
  // (round 14) a chat's own access level: reads in its folders are free, edits / commands go through Hearth's check
  const acc = accessOf(agent);
  const asks = accessAsks(agent);
  let args;
  let accessAllowed = [];
  if (acc) {
    const tools = acc.level === 'read' ? ['Read', 'Glob', 'Grep'] : acc.level === 'full' && asks ? [...FILE_TOOLS, 'Bash', 'PowerShell'] : [...FILE_TOOLS];
    args = ['--tools', tools.join(','), ...(acc.level === 'full' && asks ? [] : ['--restricted']), '--add-dir', ...acc.folders, ATTACH_DIR];
    // an older Claude Code without the permission tool: what a project folder always had (edits accepted, no commands)
    if (!asks) { accessAllowed = tools; if (acc.level !== 'read') args.push('--permission-mode', 'acceptEdits'); }
  } else if (folder) args = ['--tools', FILE_TOOLS.join(','), '--restricted', '--add-dir', folder, ATTACH_DIR, '--permission-mode', 'acceptEdits'];
  else if (images) args = ['--tools', 'Read', '--restricted', '--add-dir', ATTACH_DIR];
  else args = ['--tools', ''];
  const sets = hubToolsets(agent);
  const own = conns(agent).length > 0; // (round 26) the owner's connections ride in the same --mcp-config file
  if (!enabled.size && !folder && !acc && !images && !sets.length && !own) return [...args, '--strict-mcp-config'];
  // --strict-mcp-config limits MCP servers to the ones passed with --mcp-config (or none).
  if (sets.length || asks || own) args.push('--mcp-config', hubMcpConfig(agent));
  if (!enabled.size) args.push('--strict-mcp-config');
  if (asks) args.push('--permission-prompt-tool', PERMISSION_TOOL);
  else args.push('--permission-prompts', 'none');
  const { claude } = readConnectorCache();
  const allowed = acc ? accessAllowed : folder ? [...FILE_TOOLS] : images ? ['Read'] : [];
  for (const key of sets) allowed.push(`mcp__${HUB_TOOLSETS[key].server}`);
  const denied = [];
  if (own) { const r = Conn.claudeRules(agent); allowed.push(...r.allowed); denied.push(...r.denied); }
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
  // (round 14) chat file access asks Hearth through it; without it, no commands (see accessOf)
  '--permission-prompt-tool': 1,
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

// The command line a new chat would run, for /astra-flags (prompt text shortened; its tool-server file removed again).
function shownArgs(a) {
  let args = a.engine === 'codex' ? codexArgs(a, {}, {}) : claudeArgs(a, {}, {});
  if (args.includes('--mcp-config')) fs.rm(args[args.indexOf('--mcp-config') + 1], { force: true }, () => {});
  if (Conn) args = Conn.maskArgs(args); // the owner's env values / headers never show
  return args.map((x) => (x.length > 160 ? `${x.slice(0, 157)}…` : x));
}
// Run files left by a crash or a force quit go at startup (a day old: a long chat run never loses its own).
try {
  const dirRuns = path.join(DATA_DIR, 'mcp-runs');
  for (const f of fs.readdirSync(dirRuns)) { const p = path.join(dirRuns, f); if (Date.now() - fs.statSync(p).mtimeMs > 864e5) fs.rmSync(p, { force: true }); }
} catch { /* no runs yet */ }

// (round 21) /agents on (a chat's own opt-in): Claude may deploy subagents with its Task tool (Agent in newer versions;
// Task is still accepted). Off by default: the tool's definition rides along with every message of that chat.
function withSubagents(args, options) {
  if (!options.subagents) return args;
  const out = [...args];
  const t = out.indexOf('--tools');
  if (t >= 0) out[t + 1] = [...String(out[t + 1] || '').split(',').filter(Boolean), 'Task'].join(',');
  const a = out.indexOf('--allowedTools');
  if (a >= 0) out[a + 1] = `${out[a + 1]},Task`; else out.push('--allowedTools', 'Task');
  return out;
}
function claudeArgs(agent, session, options = {}) {
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--setting-sources', 'project', '--disable-slash-commands',
    ...withSubagents(claudeToolArgs(agent, options, session), options),
    '--system-prompt', buildPrompt(agent, session),
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
function promptFile(agent, session = null) {
  const text = buildPrompt(agent, session);
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
  const file = promptFile(agent, session);
  const folder = fileFolder(agent);
  const acc = accessOf(agent);
  const edit = (Boolean(folder) && agent.codexFiles === 'edit') || Boolean(acc && acc.level !== 'read');
  const args = ['exec'];
  if (session.id) args.push('resume', session.id);
  args.push('--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules');
  let disabled = agent.chatgptApps ? CODEX_DISABLED_FEATURES.filter((f) => f !== 'apps') : CODEX_DISABLED_FEATURES;
  // File access (opt-in): Codex looks at files with its shell tool, which runs inside its OS sandbox.
  if (folder || acc) disabled = disabled.filter((f) => f !== 'shell_tool');
  // Features switched back on for this agent (/astra-feature): each adds its tool definitions to every message.
  if (Array.isArray(agent.codexFeatures)) disabled = disabled.filter((f) => !agent.codexFeatures.includes(f));
  // (round 21) /agents on: this chat may spawn agents (multi-agent Codex)
  if (options.subagents) disabled = disabled.filter((f) => f !== 'multi_agent');
  for (const feature of disabled) args.push('--disable', feature);
  const web = pick(options.webSearch, WEB_SEARCH) || pick(agent.webSearch, WEB_SEARCH) || 'disabled';
  args.push(
    '-c', `model_instructions_file=${tomlStr(file)}`,
    '-c', 'project_doc_max_bytes=0',
    '-c', `web_search="${web}"`,
  );
  if (folder || acc) {
    // resumed runs get the sandbox again (-s only applies to new sessions); writes only inside the folder(s), no network.
    // `codex exec` can't show an approval prompt, so approvals stay off and the sandbox is the safety (round 14: each
    // access level maps here: read → read-only, read & write / full → workspace-write on the chat's folders).
    const roots = acc ? acc.folders : [folder];
    // (winshell) the owner's Windows opt-in: no sandbox (Codex's blocks every command there); approvals stay off
    if (codexOpen(agent, acc)) args.push('-c', 'sandbox_mode="danger-full-access"', '-c', 'approval_policy="never"');
    else args.push('-c', `sandbox_mode="${edit ? 'workspace-write' : 'read-only'}"`, '-c', 'approval_policy="never"');
    if (edit && !codexOpen(agent, acc)) args.push('-c', `sandbox_workspace_write.writable_roots=[${roots.map(tomlStr).join(', ')}]`, '-c', 'sandbox_workspace_write.network_access=false');
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
  // the second try after Codex cancelled a Hearth tool call: no approvals at all (exec can't show one anyway; the
  // sandbox stays as it was)
  if (options._approvalRetry) args.push('-c', 'approval_policy="never"');
  const model = options.model || agent.model;
  if (model) args.push('-m', model);
  // (winshell) unsandboxed, its commands start in the chat's first folder
  if (!session.id) args.push('-s', codexOpen(agent, acc) ? 'danger-full-access' : edit ? 'workspace-write' : 'read-only', '-C', codexOpen(agent, acc) && acc.folders[0] ? acc.folders[0] : WORKSPACE);
  for (const image of options.images || []) args.push('-i', image);
  args.push('-');
  return args;
}

// Each parser turns one JSON line into events: { delta }, { done }, { error } (or a list of them).
// (round 21, liveness) plus what a long task is doing, for the live status line and activity panel (native.js):
//   tool   { name, id, args, parent }  a tool call starts (parent: the subagent it belongs to, if any)
//   step   { id, ok, summary, parent } its result came back
//   agent  { id, status: running | done | failed, description, kind, summary, parent }: a subagent (Claude's Task /
//          Agent tool, Codex's spawned agents)
//   status { text }                    the engine's own notes (API retries…)
// Nothing here is sent to the engines: it is read from what they already print.
const SUBAGENT_TOOL = /^(Task|Agent)$/;
const oneLine = (s, n = 80) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// The short "what" of a tool call: a file name, a pattern, a command, a layer…
function toolArgs(input = {}) {
  if (!input || typeof input !== 'object') return '';
  const file = input.file_path || input.notebook_path || input.path;
  if (typeof file === 'string' && file) return path.basename(file);
  for (const k of ['description', 'command', 'pattern', 'query', 'url', 'layer', 'name', 'op', 'cmd', 'what', 'code', 'prompt']) if (input[k] != null && typeof input[k] !== 'object') return oneLine(input[k], 60);
  const first = Object.entries(input).find(([, v]) => v != null && typeof v !== 'object');
  return first ? oneLine(`${first[0]}: ${first[1]}`, 60) : '';
}
// The text of a tool result (a string, or a list of text / image blocks)
function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (c?.type === 'text' ? c.text : c?.type === 'image' ? '[image]' : '')).filter(Boolean).join(' ');
  return '';
}
function claudeParser(session) {
  const agents = new Set(); // tool_use ids of the subagents still running
  const cmds = new Map(); // (winshell) command tool calls (Bash / PowerShell) waiting for their result: id -> access
  return (msg) => {
    if (msg.type === 'system' && msg.subtype === 'init') session.id = msg.session_id;
    // a subagent's own streamed text / thinking belongs to it, never to the reply (its stream_event lines carry a parent)
    const parent = msg.parent_tool_use_id || null;
    if (msg.type === 'stream_event' && parent) return null;
    if (msg.type === 'system' && msg.subtype === 'api_retry') return { type: 'status', text: `API retry${msg.attempt ? ` ${msg.attempt}${msg.max_retries ? `/${msg.max_retries}` : ''}` : ''}${msg.error_status ? ` (${msg.error_status})` : ''}` };
    // newer versions also report subagent / background tasks as system lines (task_started, task_notification…)
    if (msg.type === 'system' && /^task_/.test(msg.subtype || '') && msg.tool_use_id) {
      const st = `${msg.status || ''} ${msg.subtype}`;
      const status = /fail|error|kill|stop/i.test(st) ? 'failed' : /complet|done|success/i.test(st) ? 'done' : 'running';
      if (status !== 'running') agents.delete(msg.tool_use_id);
      return { type: 'agent', id: msg.tool_use_id, status, ...(msg.description ? { description: oneLine(msg.description, 80) } : {}), ...(msg.summary ? { summary: oneLine(msg.summary, 160) } : {}) };
    }
    const out = [];
    if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
      for (const toolUse of msg.message.content) { // every tool call of the message (parallel calls come together)
        if (toolUse?.type !== 'tool_use') continue;
        const input = toolUse.input || {};
        if (SUBAGENT_TOOL.test(toolUse.name) && (input.prompt || input.description)) {
          agents.add(toolUse.id);
          out.push({ type: 'agent', id: toolUse.id, status: 'running', description: oneLine(input.description || input.prompt, 80), kind: String(input.subagent_type || ''), ...(parent ? { parent } : {}) });
          continue;
        }
        const target = input.file_path || input.pattern;
        // (round 14) what it touches, for the chat's activity log (access.js)
        const access = toolAccess(toolUse.name, input);
        if (access?.action === 'run' && toolUse.id) { cmds.set(toolUse.id, access); if (cmds.size > 200) cmds.delete(cmds.keys().next().value); }
        out.push({ type: 'tool', name: target ? `${toolUse.name} · ${path.basename(String(target))}` : toolUse.name, id: toolUse.id, args: toolArgs(input), ...(parent ? { parent } : {}), ...(access ? { access: { ...access, id: toolUse.id } } : {}) });
      }
    }
    if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
      for (const r of msg.message.content) {
        if (r?.type !== 'tool_result' || !r.tool_use_id) continue;
        const text = r.big || oneLine(resultText(r.content), 160);
        if (agents.has(r.tool_use_id)) { agents.delete(r.tool_use_id); out.push({ type: 'agent', id: r.tool_use_id, status: r.is_error ? 'failed' : 'done', summary: text }); continue; }
        // (winshell) a command Claude Code itself refused before Hearth's check (its tool not enabled, a policy)
        const cmd = cmds.get(r.tool_use_id); cmds.delete(r.tool_use_id);
        const policy = cmd && r.is_error && POLICY_BLOCKED.test(resultText(r.content)) ? { access: { ...cmd, id: r.tool_use_id, failed: true, policy: true, why: oneLine(resultText(r.content), 200) } } : {};
        out.push({ type: 'step', id: r.tool_use_id, ok: !r.is_error, summary: text, ...(parent ? { parent } : {}), ...policy });
      }
    }
    if (out.length) return out.length === 1 ? out[0] : out;
    if (msg.type === 'stream_event' && msg.event?.delta?.type === 'text_delta') {
      return { type: 'delta', text: msg.event.delta.text };
    }
    if (msg.type === 'stream_event' && msg.event?.delta?.type === 'thinking_delta' && msg.event.delta.thinking) {
      return { type: 'thinking', text: msg.event.delta.thinking };
    }
    if (msg.type === 'stream_event' && msg.event?.type === 'content_block_start' && msg.event.content_block?.type === 'thinking') {
      return { type: 'thinking', text: '\n\n' };
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

// (round 21) A huge line (a tool result of megabytes: a whole file, a long log) isn't parsed whole: the few fields
// that matter are read from its two ends. Lines that carry reply text (assistant, result, agent_message) parse as usual.
const BIG_LINE = 512 * 1024;
function lightParse(line) {
  const head = line.slice(0, 4096); const tail = line.slice(-4096);
  const get = (re) => (head.match(re) || tail.match(re) || [])[1];
  const type = (head.match(/^\{\s*"type"\s*:\s*"([\w.]+)"/) || [])[1];
  const big = `(${(line.length / 1048576).toFixed(1)} MB of output)`;
  if (type === 'user') {
    const id = get(/"tool_use_id"\s*:\s*"([^"]+)"/);
    if (!id) return {};
    const parent = (tail.match(/"parent_tool_use_id"\s*:\s*"([^"]+)"/) || [])[1] || null;
    return { type: 'user', parent_tool_use_id: parent, message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: /"is_error"\s*:\s*true/.test(head + tail), big }] } };
  }
  if (/^item\.(started|updated|completed)$/.test(type || '')) {
    const itemType = (head.match(/"type"\s*:\s*"(command_execution|mcp_tool_call|web_search|agent_message|reasoning|todo_list|file_change|collab_tool_call)"/) || [])[1];
    if (!/^(command_execution|mcp_tool_call|web_search)$/.test(itemType || '')) return null; // text-carrying items: parse whole
    const status = (tail.match(/"status"\s*:\s*"(\w+)"(?![\s\S]*"status")/) || head.match(/"status"\s*:\s*"(\w+)"/) || [])[1];
    return { type, item: { id: get(/"id"\s*:\s*"([^"]+)"/), type: itemType, server: get(/"server"\s*:\s*"([^"]+)"/), tool: get(/"tool"\s*:\s*"([^"]+)"/), command: get(/"command"\s*:\s*"((?:[^"\\]|\\.){0,300})/), status, big } };
  }
  return null;
}

const CANCELLED = /cancel|approval|not approved|declined|denied by (the )?user|rejected by (the )?user/i;
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
  const kids = new Map(); // spawned agent thread id -> { description, status }
  const STATE = { pending_init: 'running', running: 'running', completed: 'done', shutdown: 'done', errored: 'failed', not_found: 'failed' };
  const collab = (msg, item) => {
    const out = [];
    const ids = [...new Set([...(item.receiver_thread_ids || []), ...Object.keys(item.agents_states || {})])];
    for (const id of ids) {
      const st = item.agents_states?.[id];
      const was = kids.get(id);
      const status = st ? STATE[st.status] || 'running' : item.tool === 'spawn_agent' ? (item.status === 'failed' ? 'failed' : 'running') : was?.status;
      if (!status) continue;
      const description = was?.description || oneLine(item.prompt || '', 80) || 'Agent';
      const summary = st?.message ? oneLine(st.message, 160) : undefined;
      if (was && was.status === status && !summary) continue; // nothing new
      kids.set(id, { description, status });
      out.push({ type: 'agent', id, status, description, ...(summary ? { summary } : {}) });
    }
    if (!out.length) return null;
    return out.length === 1 ? out[0] : out;
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
    // (round 21) spawned agents (multi-agent Codex): spawn_agent / wait / close_agent with each agent's state
    if (item.type === 'collab_tool_call') return collab(msg, item);
    if (msg.type === 'item.started' && /tool_call/.test(item.type || '')) {
      return { type: 'tool', name: [item.server, item.tool].filter(Boolean).join(' · ') || item.type, id: item.id, args: toolArgs(item.arguments) };
    }
    // a tool call Codex cancelled itself (an approval `codex exec` can't ask for): send() retries / explains (no reply text yet)
    if (msg.type === 'item.completed' && /tool_call/.test(item.type || '') && (item.status === 'failed' || item.error) && CANCELLED.test(JSON.stringify(item.error || item.result || ''))) {
      return { type: 'blocked', name: [item.server, item.tool].filter(Boolean).join(' · ') || item.type, message: String(item.error?.message || 'cancelled').slice(0, 200) };
    }
    // (round 21) what a tool call returned, for the activity panel
    if (msg.type === 'item.completed' && /tool_call/.test(item.type || '') && item.id) {
      return { type: 'step', id: item.id, ok: item.status !== 'failed' && !item.error, summary: item.big || oneLine(item.error?.message || resultText(item.result?.content) || item.status, 160) };
    }
    if (msg.type === 'item.started' && item.type === 'command_execution') return { type: 'tool', name: `Shell · ${short(item.command)}`, id: item.id, args: short(item.command), access: { action: 'run', target: String(item.command || '').slice(0, 400), tool: 'Shell', id: item.id } };
    if (msg.type === 'item.completed' && item.type === 'command_execution' && item.id) {
      const failed = item.status === 'failed' || item.status === 'declined' || Boolean(item.exit_code);
      // (round 32) the sandbox said no (a write outside its folders, or a read-only level): access.js tells the owner why
      const said = String(item.aggregated_output || item.error?.message || '').slice(-2000);
      // (winshell) refused before it ran (Codex's sandbox / approval policy: on Windows every command can be)
      const policy = failed && POLICY_BLOCKED.test(said);
      const blocked = failed && (policy || SANDBOX_DENIED.test(said));
      return { type: 'step', id: item.id, ok: !failed, summary: item.big || oneLine(`${item.exit_code ? `exit ${item.exit_code} · ` : ''}${said.slice(-400)}`, 160), ...(blocked ? { access: { action: 'run', failed: true, target: String(item.command || '').slice(0, 400), tool: 'Shell', id: item.id, ...(policy ? { policy: true, why: oneLine(said, 200) } : {}) } } : {}) };
    }
    if (msg.type === 'item.started' && item.type === 'web_search') return { type: 'tool', name: `Web search · ${short(item.query, 50)}`, id: item.id, args: short(item.query, 50) };
    if (msg.type === 'item.completed' && item.type === 'file_change') {
      const files = (item.changes || []).map((c) => path.basename(c.path || '')).filter(Boolean);
      const changes = (item.changes || []).filter((c) => c.path).slice(0, 20).map((c) => ({ path: c.path, kind: c.kind || 'update' }));
      // (round 32) a failed edit too: access.js says in the chat why (outside its folders, read-only) and offers the fix
      return { type: 'tool', name: `${item.status === 'failed' ? 'Edit failed' : 'Edited'} · ${short(files.join(', ') || 'files')}`, ...(changes.length ? { access: { action: 'write', changes, tool: 'apply_patch', id: item.id, ...(item.status === 'failed' ? { failed: true } : {}) } } : {}) };
    }
    // Its own plan (todo list) becomes the chat's live checklist.
    if ((msg.type === 'item.started' || msg.type === 'item.updated' || msg.type === 'item.completed') && item.type === 'todo_list' && Array.isArray(item.items)) {
      return { type: 'progress', steps: item.items.slice(0, 12).map((s) => ({ text: short(s.text, 160), status: s.completed ? 'done' : 'todo' })) };
    }
    // Non-fatal warnings (an item of type error) go into the thinking fold, not the reply.
    if (msg.type === 'item.completed' && item.type === 'error' && item.message) {
      // (winshell) a command refused by policy can come as a warning item too: the note says why
      if (POLICY_BLOCKED.test(item.message)) return [{ type: 'thinking', text: `⚠ ${item.message}\n\n` }, { type: 'step', id: item.id || `policy-${Date.now()}`, ok: false, summary: oneLine(item.message, 160), access: { action: 'run', failed: true, policy: true, target: '', tool: 'Shell', why: oneLine(item.message, 200) } }];
      return { type: 'thinking', text: `⚠ ${item.message}\n\n` };
    }
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
// What the copy in use is, for a fix that names it (send() sets it before a run; friendlyError reads it).
const usedBin = {};
const TOO_OLD = /version_too_old|version [\d.]+ or newer is required|does not support this model|requires? a newer version of (claude|codex)|(please )?(update|upgrade) (claude code|codex) to (the latest|a newer)/i;
const NETWORK = /ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo|socket hang up|fetch failed|network (error|is unreachable)|stream disconnected|connection (closed|reset|error|refused)/i;
const MCP_CONFIG = /Invalid MCP configuration|MCP config file not found/i;
// The update command for the copy in use, as the fix line (and the Update button runs it in a window).
function updateFix(e) {
  const bin = usedBin[e] || LOCATE[e]?.();
  const plan = Installs.updatePlan(e, bin);
  const pinned = given(e) ? ' Settings → Engines points at this copy; /doctor shows every copy Hearth found.' : '';
  return `This ${ENGINES[e].label} is too old for the model. Press Update (it runs \`${plan.command}\` in a ${Installs.IS_WIN ? 'PowerShell' : 'Terminal'} window and Hearth checks again when it's done), then Retry.${pinned}`;
}
const FIXES = [
  [/model\b.*\b(not supported|does not exist|not found|unavailable|unknown)|unsupported model|invalid model|model_not_found/i,
    (e) => `That model isn't available on your ${ENGINES[e].account} account. Pick another one in the chat header's Model menu${e === 'codex' ? ' or with /astra-model' : ''}.`],
  [/usage limit|rate.?limit|too many requests|\b429\b|quota/i,
    (e) => `Your plan's usage limit was reached for now. Wait for it to reset, or use a lighter model / lower effort${e === 'codex' ? ' (/astra-model, /astra-effort low)' : ''}.`],
  [/Invalid MCP configuration/i,
    () => "Claude Code couldn't read Hearth's tool settings for this chat (the reason is above; Hearth already tried once with a fresh file). Press Retry; if it comes back, run /doctor."],
  [TOO_OLD, updateFix, 'update'],
  [/unexpected argument|unrecognized (option|argument)|unknown (option|flag|argument)|invalid value for|found argument .* which wasn't expected/i,
    (e) => `This ${ENGINES[e].label} version doesn't know one of Hearth's options. Press Update (or run /doctor), then Retry.`, 'update'],
  [/cancelled Hearth's tool call/i,
    () => 'This Codex cancels tools it would have to ask about, and doesn\'t know the setting that pre-approves Hearth\'s own. Press Update, then Retry.', 'update'],
  [/ENOENT|EACCES|EPERM|spawn /i,
    (e) => `Hearth couldn't start ${ENGINES[e].label}. Check its path in Settings → Engines, or run /doctor.`, 'doctor'],
  [/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network|stream disconnected|connection (closed|reset)|getaddrinfo/i,
    () => 'Network problem (Hearth already tried again once): check the internet connection (or VPN / proxy), then press Retry.'],
  [/context (window|length)|maximum context|too many tokens|prompt is too long|input too long/i,
    () => 'The conversation is too long for the model: compact it (🗜 in the chat menu) or start a new chat from a summary.'],
  // (winshell) commands refused before they ran: Claude Code's tool list / a policy, or Codex's sandbox on Windows
  [POLICY_BLOCKED,
    (e) => (e === 'codex' ? `Astra's sandbox blocked its commands${IS_WIN ? ' (on Windows it can block every command)' : ''}. ${IS_WIN ? 'In ⋯ AI setup → Files on this computer (Read & write or Full) you can let Astra run commands without its sandbox.' : 'Check ⋯ AI setup → Files on this computer.'}`
      : 'Claude Code refused its command tool before Hearth could check it. Set Full in ⋯ AI setup → Files on this computer (it switches on Bash and PowerShell); if it still happens, press Update.')],
  [/sandbox|landlock|seatbelt|seccomp/i,
    () => 'Codex\'s sandbox refused something: Astra may only change files in its own folders, at Read & write or Full. Change it in ⋯ AI setup → Files on this computer.'],
];

function friendlyError(engine, message, { win = IS_WIN, mac = IS_MAC, bin = usedBin[engine], signal = '' } = {}) {
  // (round 32, winpolish) what Windows says (npm's Node missing, a half-removed npm install, a .cmd Windows wouldn't
  // start, the antivirus…) in plain words with the button that fixes it; the raw line stays underneath for /doctor
  const w = win && !/not logged in|unauthori[sz]ed|\b401\b/i.test(message) && !POLICY_BLOCKED.test(message) && !/sandbox/i.test(message) ? WinPolish.plainError(message) : null;
  if (w) return { message: `${w.text}\n\nFix: ${w.fix}\n\n(${String(message).split('\n')[0].slice(0, 200)})`, fix: w.fix, fixAction: w.action, fixEngine: engine };
  // (round 33, macpolish) what macOS says (Gatekeeper's quarantine, a copy for another kind of Mac, npm's Node missing, a
  // folder its privacy protection guards…): one plain sentence, the button that fixes it, the raw line underneath
  const m = mac && !/not logged in|unauthori[sz]ed|\b401\b/i.test(message) && !POLICY_BLOCKED.test(message) && !/sandbox|seatbelt/i.test(message) ? MacPolish.plainError(message, { bin, signal }) : null;
  if (m) return { message: `${m.text}\n\nFix: ${m.fix}\n\n(${String(message).split('\n')[0].slice(0, 200)})`, fix: m.fix, fixAction: m.action, fixEngine: engine };
  if (/not logged in|please run \/login|codex login|unauthori[sz]ed|\b401\b|sign in again|token (expired|is invalid)|refresh token/i.test(message)) {
    return { message: `${ENGINES[engine].label} isn't signed in to your ${ENGINES[engine].account} account.`, needsLogin: true, fix: 'Press the sign-in button below (or run /astra-login), finish in the window that opens, then Retry.' };
  }
  const hit = FIXES.find(([re]) => re.test(message));
  if (!hit) return { message };
  const fix = hit[1](engine);
  return { message: `${message}\n\nFix: ${fix}`, fix, ...(hit[2] ? { fixAction: hit[2], fixEngine: engine } : {}) };
}

// The engine has no saved session under that id anymore (cleared, other machine, other version).
const LOST_SESSION = /no (saved |matching )?(conversation|session|thread|rollout)s? (was )?found|(thread|session|conversation|rollout) (not found|does not exist)|could not (find|resume) (the )?(session|thread|rollout|conversation)|failed to (resume|load) (the )?(session|thread|rollout|conversation)/i;

// (round 21) Streamed pieces are sent on in batches: Claude prints one line per few characters, and each piece was one
// IPC message + one renderer handler call (≈ 3,500 for a long task); the chat paints every 60 ms anyway.
const BATCH_MS = 40;
function batched(emit) {
  if (emit.batched) return emit;
  let held = null;
  let timer = null;
  const flush = () => { clearTimeout(timer); timer = null; if (held) { const h = held; held = null; emit(h); } };
  const fn = (e) => {
    if (e.type === 'delta' || e.type === 'thinking') {
      if (held && held.type === e.type) { held.text += e.text; return; }
      flush();
      held = { type: e.type, text: e.text };
      timer = setTimeout(flush, BATCH_MS);
      return;
    }
    flush();
    emit(e);
  };
  fn.batched = true;
  return fn;
}
// What a run is doing when it is quiet (round 21): after QUIET_MS without a line, a pulse every PULSE_MS says whether the
// process is still there, how busy it and what it started are (CPU %, Mac / Linux), and which tool it is in.
const QUIET_MS = Number(process.env.HEARTH_QUIET_MS) || 15000;
const PULSE_MS = Number(process.env.HEARTH_PULSE_MS) || 10000;
// An engine that exited while a program it started still holds its output open: ended after this long anyway.
const EXIT_GRACE_MS = 2000;
// CPU milliseconds used so far by a process and everything under it (null where it can't be read cheaply: Windows).
async function treeCpuMs(pid) {
  if (IS_WIN || !pid) return null;
  try {
    let rows;
    if (process.platform === 'linux') {
      const ids = (await fs.promises.readdir('/proc')).filter((d) => /^\d+$/.test(d));
      rows = (await Promise.all(ids.map((id) => fs.promises.readFile(`/proc/${id}/stat`, 'utf8').catch(() => null)))).filter(Boolean).map((s) => {
        const f = s.slice(s.lastIndexOf(')') + 2).split(' '); // fields after the command name: state ppid … utime(12) stime(13)
        return { pid: Number(s.slice(0, s.indexOf(' '))), ppid: Number(f[1]), ms: (Number(f[11]) + Number(f[12])) * 10 };
      });
    } else {
      const outp = await new Promise((resolve) => require('child_process').execFile('ps', ['-A', '-o', 'pid=,ppid=,time='], { timeout: 3000 }, (err, so) => resolve(err ? '' : so)));
      rows = outp.trim().split('\n').map((l) => {
        const [p, pp, t] = l.trim().split(/\s+/);
        const parts = String(t || '').replace(/^(\d+)-/, (m, d) => `${d * 24}:`).split(':').map(Number);
        const secs = parts.reduce((a, v) => a * 60 + v, 0);
        return { pid: Number(p), ppid: Number(pp), ms: secs * 1000 };
      });
    }
    const kids = new Map();
    for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
    let ms = 0; let found = false;
    const walk = (id, depth) => { for (const r of kids.get(id) || []) { ms += r.ms || 0; if (depth < 6) walk(r.pid, depth + 1); } };
    const self = rows.find((r) => r.pid === pid);
    if (self) { found = true; ms += self.ms || 0; walk(pid, 0); }
    return found ? ms : null;
  } catch { return null; }
}
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// live(event): what a run is doing (step / agent / pulse / status), on its own channel so the turns that only want
// the reply (jams, collaborations, once()) never see it.
function send({ agent, chatId, session, text, options = {} }, emit, live = null) {
  emit = batched(emit);
  // a chat with its own engine (a comp part on Astra while its director runs on Claude, or the reverse): the same
  // agent on that engine, with its tools (Astra directors get the hub servers through -c), the twin's model / effort
  if (options.engine && options.engine !== agent.engine && ENGINES[options.engine]) agent = { ...agent, engine: options.engine, model: undefined, effort: undefined, ...(options.engine === 'codex' ? { hubTools: true } : {}) };
  const engine = agent.engine;
  // A per-run persona replaces the agent's own instructions; "lean" runs (collaborations, quick asks) drop
  // the hub tool sets and file tools so they cost no more than a plain chat turn.
  if (options.persona) agent = { ...agent, systemPrompt: String(options.persona).slice(0, 4000) };
  // (round 33, swarmlean) a mission's helper / reviewer (swarmlean.js): the task is all it needs, so no saved memory and
  // no <remember> / <suggest> habits either (fixed text, so helpers on one engine share a cached prefix)
  if (options.helper && options.lean) agent = { ...agent, autoMemory: false, suggestNext: false, memoryOff: true };
  if (options.lean) agent = { ...agent, openTool: false, chatTools: false, threeTools: false, gameTools: false, boardTools: false, captureTools: false, adobeTools: false, deployTools: false, appsTools: false, workspace: undefined, selfReview: false, connectors: undefined, chatgptApps: false };
  // (round 14) the chat's own file access (access.js); lean / hub-only runs never get it, except "Check this AI"
  // (round 32, aicheck.js: options.accessCheck): a lean run that keeps the AI's file access, to test it for a few tokens
  if (options.access && typeof options.access === 'object' && !options.hubOnly && (!options.lean || options.accessCheck)) agent = { ...agent, access: { level: String(options.access.level || 'off'), folders: options.access.folders }, accessChatId: chatId };
  // "hubOnly" runs (a jam's build turns, jam.js) keep the agent's tool sets (Lab, board…) and drop the rest.
  if (options.hubOnly) agent = { ...agent, chatTools: false, workspace: undefined, selfReview: false, connectors: undefined, chatgptApps: false };
  // (round 22, labcrew) a crew helper (tools/three-crew.js): one variation of a scene, on its own backstage stage. Only
  // the Lab's crew tools (HUB_TOOL_MODE=crew: six of them), a short role line instead of the agent's own prompt, no
  // chat tools / nodes / memory / self-review: the brief it gets is all it needs.
  if (options.crew) agent = { ...agent, systemPrompt: 'You are one helper in a crew that explores variations of a three.js scene in Hearth\'s Lab, in parallel. You work alone on your own copy; nobody reads your text but the director, so keep the final answer to one line.', toolMode: 'crew', nodesTool: false, threeTools: true, openTool: false, chatTools: false, gameTools: false, boardTools: false, captureTools: false, adobeTools: false, deployTools: false, appsTools: false, workspace: undefined, selfReview: false, connectors: undefined, chatgptApps: false, autoMemory: false, progressTag: false };
  // (round 22) /crew on (a chat's own opt-in): the director may deploy a crew itself (one prompt line, only then)
  if (options.crewOn && !options.crew && !options.lean) agent = { ...agent, crewOn: true };
  // asDirector: 'three' (a jam's build turn on an agent that isn't a Lab director, e.g. your Astra): this one turn gets
  // the Lab's tools, Codex through its MCP overrides
  if (options.asDirector === 'three') agent = { ...agent, threeTools: true, hubTools: agent.engine === 'codex' ? true : agent.hubTools, dock: agent.dock || 'three' };
  // a chat that turned on /capture-tools gets the capture tool set for its runs (not lean ones)
  if (options.captureTools && !options.lean) agent = { ...agent, captureTools: true };
  if (chatId && !String(chatId).startsWith('once-') && hubToolsets(agent).some((k) => k !== 'chatTools')) agent = { ...agent, hubChatId: chatId };
  const original = text;
  if (engine === 'claude' && options.images?.length) {
    text += `\n\n[Attached image${options.images.length > 1 ? 's' : ''}: open with your Read tool before answering]\n${options.images.join('\n')}`;
  }
  const bin = options._bin || LOCATE[engine]?.();
  if (!bin) {
    emit({ type: 'error', message: `Couldn't find ${ENGINES[engine]?.label || engine} on this ${IS_MAC ? 'Mac' : 'PC'}.\n\nFix: press Install (it runs \`${Installs.updatePlan(engine, null).command}\` in a ${IS_WIN ? 'PowerShell' : 'Terminal'} window), install the ${engine === 'codex' ? 'Codex (ChatGPT)' : 'Claude'} desktop app, or set its path in Settings → Engines. /doctor shows what Hearth looked for${IS_WIN ? ' (PATH, npm\'s %APPDATA%\\npm, nvm, Volta, scoop, winget, pnpm and the desktop apps)' : IS_MAC ? ` (${MacPolish.lookedIn()})` : ''}.`, fixAction: 'install', fixEngine: engine });
    return;
  }
  usedBin[engine] = bin;
  if (agent.workspace && !agent.access && !fileFolder(agent)) {
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
  // (round 32) WinPolish.spawn: on Windows npm's claude.cmd / codex.cmd run through their Node script (Node refuses a
  // .cmd without a shell); elsewhere the plain spawn
  let child;
  try { child = WinPolish.spawn(bin, args, { cwd: WORKSPACE, windowsHide: true, env: { ...process.env, MCP_TOOL_TIMEOUT: String(45 * 60000) } }); } catch (err) {
    log(`${engine} ${chatId} couldn't start ${bin}: ${err.message}`);
    emit({ type: 'error', ...friendlyError(engine, `Couldn't start ${ENGINES[engine].label} (${err.code || err.message}).`, { bin }) });
    return;
  }
  if (child.hearthVia && child.hearthVia !== 'direct') log(`${engine} ${chatId} started ${path.basename(bin)} via ${child.hearthVia}`);
  running.set(chatId, child);
  child.stdin.on('error', () => { /* the engine quit before reading its input; close reports why */ });
  child.stdin.end(text);

  let finished = false;
  let streamed = false;
  let parts = []; // (round 21) the line still arriving, in pieces (joined once, when its newline comes)
  let partLen = 0;
  let skipping = false; // inside an oversized line: dropped up to its newline
  const startedAt = Date.now();
  let toolCount = 0; // tool calls in this reply (token meter)
  let stderr = '';
  let idle = null;
  let lastAt = Date.now(); // the last line / output from the engine
  const open = new Map(); // tool calls without a result yet: id -> { name, args, at }
  let cpu0 = null; // { ms, at }: the last CPU sample while quiet
  const pulse = async () => {
    if (finished) return;
    const quiet = Date.now() - lastAt;
    if (quiet < QUIET_MS) { cpu0 = null; return; }
    const alive = child.exitCode === null && child.signalCode === null && pidAlive(child.pid);
    const ms = alive ? await treeCpuMs(child.pid) : null;
    const now = Date.now();
    const cpu = ms != null && cpu0 ? Math.max(0, Math.round(((ms - cpu0.ms) / Math.max(1, now - cpu0.at)) * 100)) : null;
    cpu0 = ms != null ? { ms, at: now } : null;
    if (finished) return;
    const t = [...open.values()].at(-1);
    live?.({ type: 'pulse', quietMs: now - lastAt, alive, cpu, ...(t ? { tool: t.name, args: t.args, toolMs: now - t.at } : {}) });
  };
  const pulses = setInterval(() => { pulse().catch(() => {}); }, PULSE_MS);
  const touch = () => {
    lastAt = Date.now();
    clearTimeout(idle);
    idle = setTimeout(() => { child.hubIdle = true; log(`${engine} ${chatId} idle for ${IDLE_MS / 60000} min, stopping`); kill(child); }, IDLE_MS);
  };
  touch();
  const finish = (event) => {
    if (finished) return;
    finished = true;
    clearTimeout(idle);
    clearInterval(pulses);
    // A chat whose engine session is gone continues in a fresh one, with the conversation sent as context.
    if (event.type === 'error' && session.id && !streamed && options.fallbackText && LOST_SESSION.test(`${event.message}\n${stderr}`)) {
      log(`${engine} ${chatId} session ${session.id} lost, starting fresh with context`);
      if (running.get(chatId) === child) running.delete(chatId);
      try { child.kill(); } catch { /* already gone */ }
      emit({ type: 'thinking', text: `⚠ The earlier ${ENGINES[engine].label} session couldn't be resumed, so this continues in a new one with the conversation as context.\n\n` });
      send({ agent, chatId, session: {}, text: options.fallbackText, options: { ...options, fallbackText: undefined, persona: undefined, lean: undefined } }, emit, live);
      return;
    }
    // An older / newer Claude Code that doesn't know an optional flag: run again without it.
    const flag = event.type === 'error' && engine === 'claude' && !streamed ? unsupportedFlag(`${event.message}\n${stderr}`) : null;
    if (flag) {
      log(`claude doesn't know ${flag}, retrying without it`);
      rememberDropped(flag);
      if (running.get(chatId) === child) running.delete(chatId);
      send({ agent, chatId, session, text: original, options }, emit, live);
      return;
    }
    if (heal(event)) return;
    if (event.type === 'error') Object.assign(event, friendlyError(engine, event.message, { bin }));
    if (event.type === 'done') { try { addUsage(agent.id, event.usage, { chatId, model: options.model || agent.model || '', dock: agent.dock || '', ms: Date.now() - startedAt, tools: toolCount }); } catch { /* usage stats are best-effort */ } }
    emit({ ...event, session: state });
  };
  // Self-healing (round 9): each known failure that a second try can fix gets one, before anything was streamed.
  const again = (extra, note) => {
    if (running.get(chatId) === child) running.delete(chatId);
    if (child.exitCode === null && child.signalCode === null) { child.hubStopped = true; try { kill(child); } catch { /* gone */ } }
    if (note) emit({ type: 'thinking', text: `⚠ ${note}\n\n` });
    send({ agent, chatId, session, text: original, options: { ...options, ...extra } }, emit, live);
  };
  const heal = (event) => {
    const why = `${event.message || ''}\n${stderr}`;
    // Codex cancelled one of Hearth's tool calls: once more with approvals off, then the precise fix
    if (event.type === 'blocked') {
      if (!streamed && !options._approvalRetry) { log(`${engine} ${chatId} cancelled ${event.name}, retrying with approvals off`); again({ _approvalRetry: true }, `${ENGINES[engine].label} cancelled a Hearth tool call (${event.name}); trying again with Hearth's tools approved.`); return true; }
      try { kill(child); } catch { /* gone */ }
      Object.assign(event, { type: 'error', message: `${ENGINES[engine].label} cancelled Hearth's tool call ${event.name} (${event.message}).` });
      return false;
    }
    if (event.type !== 'error' || streamed) return false;
    // the tool-settings file went missing under the run: a fresh run writes a fresh one
    if (engine === 'claude' && !options._mcpRetry && MCP_CONFIG.test(why)) { log(`claude ${chatId} MCP config problem, retrying with a fresh file`); again({ _mcpRetry: true }); return true; }
    // a dropped connection: one more try after a short pause (Stop still works while it waits)
    if (!options._netRetry && NETWORK.test(why) && !TOO_OLD.test(why)) {
      log(`${engine} ${chatId} network problem, retrying in 3 s`);
      if (running.get(chatId) === child) running.delete(chatId);
      emit({ type: 'thinking', text: '⚠ The connection dropped; trying again in 3 s…\n\n' });
      const wait = { retryTimer: setTimeout(() => { if (running.get(chatId) !== wait) return; running.delete(chatId); send({ agent, chatId, session, text: original, options: { ...options, _netRetry: true } }, emit, live); }, 3000), onStop: () => emit({ type: 'stopped', session: state }) };
      running.set(chatId, wait);
      return true;
    }
    // too old for the model: remember the minimum it named, and continue with a newer copy on this computer if there is one
    if (TOO_OLD.test(why)) {
      learnTooOld(engine, bin, why);
      if (options._newerRetry || given(engine)) return false;
      checkEngine(engine).then((r) => {
        if (r.chosen && r.chosen !== bin && Installs.meetsMin(engine, r.semver) !== false) {
          log(`${engine} ${chatId} ${bin} too old, continuing with ${r.chosen} (${r.version})`);
          emit({ type: 'thinking', text: `⚠ This ${ENGINES[engine].label} is too old for the model; continuing with the newer copy Hearth found (${r.version}).\n\n` });
          send({ agent, chatId, session, text: original, options: { ...options, _newerRetry: true, _bin: r.chosen } }, emit, live);
        } else {
          Object.assign(event, friendlyError(engine, event.message));
          emit({ ...event, session: state });
        }
      }).catch(() => { Object.assign(event, friendlyError(engine, event.message)); emit({ ...event, session: state }); });
      return true;
    }
    return false;
  };
  const handleOne = (event) => {
    if (!event) return;
    if (event.type === 'tool' || (event.type === 'agent' && event.status === 'running')) toolCount += 1;
    if (event.type === 'tool' && event.id) open.set(event.id, { name: event.name, args: event.args || '', at: Date.now() });
    if (event.type === 'agent' && event.status === 'running' && !open.has(event.id)) open.set(event.id, { name: `agent · ${event.description || 'subagent'}`, args: '', at: Date.now() });
    if ((event.type === 'step' || event.type === 'agent') && event.status !== 'running') open.delete(event.id);
    if (LIVE_EVENTS.has(event.type)) { if (!finished) live?.(event); return; }
    if (STREAM_EVENTS.has(event.type)) { if (event.type === 'delta') streamed = true; if (!finished) emit(event); } else finish(event);
  };
  const handleLine = (raw) => {
    const line = raw.trim();
    if (!line.startsWith('{')) return;
    let event;
    try { event = parse(line.length > BIG_LINE ? (lightParse(line) || JSON.parse(line)) : JSON.parse(line)); } catch { return; }
    if (Array.isArray(event)) event.forEach(handleOne); else handleOne(event);
  };

  // (round 21) lines are found by looking for the newline in each new piece only (a 24 MB line arriving in 64 KB pieces
  // was searched from its start every time, and copied: ≈ 0.7 s of blocked main process), and bytes are decoded as
  // UTF-8 across pieces (a character split between two pieces came out garbled)
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    touch();
    let from = 0;
    let nl;
    while ((nl = chunk.indexOf('\n', from)) >= 0) {
      const piece = chunk.slice(from, nl);
      from = nl + 1;
      if (skipping) { skipping = false; continue; }
      const line = parts.length ? parts.join('') + piece : piece;
      parts = []; partLen = 0;
      handleLine(line);
    }
    if (from < chunk.length && !skipping) {
      parts.push(from ? chunk.slice(from) : chunk);
      partLen += chunk.length - from;
      if (partLen > MAX_LINE) { log(`${engine} ${chatId} dropped an oversized line (${partLen} bytes)`); parts = []; partLen = 0; skipping = true; }
    }
  });
  child.stderr.on('data', (chunk) => { touch(); stderr = (stderr + chunk).slice(-4000); });
  child.on('error', (err) => finish({ type: 'error', message: err.message }));
  let ended = false;
  const end = (code, signal) => {
    if (ended) return;
    ended = true;
    clearInterval(pulses);
    if (running.get(chatId) === child) running.delete(chatId);
    const mcpFile = engine === 'claude' && args[args.indexOf('--mcp-config') + 1];
    if (args.includes('--mcp-config') && mcpFile) fs.rm(mcpFile, { force: true }, () => {});
    if (parts.length && !skipping) { const last = parts.join(''); parts = []; handleLine(last); } // the last line may come without a newline
    log(`${engine} ${chatId} exit=${code} signal=${signal} finished=${finished} stderr=${JSON.stringify(stderr.slice(-400))}`);
    if (child.hubIdle) finish({ type: 'error', message: `${ENGINES[engine].label} printed nothing for ${IDLE_MS / 60000} minutes, so Hearth stopped it. Press Retry.` });
    else if (child.hubStopped) finish({ type: 'stopped' });
    // (round 21) killed from outside (out of memory, a force quit…): it was shown as "stopped", as if you had pressed Stop
    // (round 33, macpolish) killed by macOS before it printed anything: Gatekeeper / a bad signature, said as such
    else if (code === null && IS_MAC && signal === 'SIGKILL' && !streamed && !stderr.trim() && Date.now() - startedAt < 10000) finish({ type: 'error', message: `${ENGINES[engine].label} was stopped by macOS as it started (killed: 9).` });
    else if (code === null) finish({ type: 'error', message: `${ENGINES[engine].label} stopped unexpectedly (${signal || 'killed'}): out of memory, or something closed it. What it wrote so far is kept. Press Retry, or ask it to continue.` });
    else finish({ type: 'error', message: lastErrorLine(stderr) || `${ENGINES[engine].label} exited (${code})` });
  };
  child.on('close', end);
  // (round 21) a program the engine started (a tool, a server) can keep its output open after the engine itself exited:
  // 'close' then never came and the reply waited forever. The exit ends it after a short grace for the last lines.
  child.on('exit', (code, signal) => {
    setTimeout(() => {
      if (ended) return;
      log(`${engine} ${chatId} exited but its output stayed open (a child process holds it): ending the reply`);
      try { child.stdout.destroy(); child.stderr.destroy(); } catch { /* gone */ }
      end(code, signal);
    }, EXIT_GRACE_MS).unref?.();
  });
}
// Events that stream into the live reply (everything else ends it).
const STREAM_EVENTS = new Set(['delta', 'tool', 'thinking', 'progress']);
// (round 21) What a run is doing, sent to live() (main.js: the engine:live channel), never to the reply's emit.
const LIVE_EVENTS = new Set(['step', 'agent', 'pulse', 'status']);
// The most telling stderr line: an "Error:" line when there is one, else the last line.
// A line ending in ":" ("Error: Invalid MCP configuration:") keeps the lines after it, where the reason is.
function lastErrorLine(stderr) {
  // (round 32) a crashed Node script's stack frames ("    at Module._compile (node:internal…)") are never the reason
  const lines = WinPolish.dropStack(stderr).split('\n').map((l) => l.trim()).filter(Boolean);
  const i = lines.map((l) => /error/i.test(l)).lastIndexOf(true);
  if (i < 0) return lines.pop() || '';
  return /:$/.test(lines[i]) ? lines.slice(i, i + 4).join('\n') : lines[i];
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
  // a retry waiting out a dropped connection: it doesn't start
  if (child.retryTimer) { clearTimeout(child.retryTimer); running.delete(chatId); child.onStop?.(); return true; }
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

// Opens a Terminal / PowerShell / terminal window where you sign in yourself; the hub never sees your password. On a
// Mac a program started from the app has no window to show, hence the window (a .command file); a Claude Code without
// `auth login` falls back to its interactive /login. Hearth checks the engine again when the window's work ends.
let installsListener = () => {};
function onInstalls(fn) { installsListener = typeof fn === 'function' ? fn : () => {}; }
function login(engine) {
  if (!LOCATE[engine]?.()) return false;
  return fix(engine, 'login', (rep, info) => installsListener(rep, info)).ok;
}

// Runs a short command of an engine (version, login status) and returns its output; never throws.
function quick(bin, args, ms = 10000) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try { child = WinPolish.spawn(bin, args, { cwd: WORKSPACE, windowsHide: true }); } catch (err) { resolve({ code: -1, out: err.message }); return; }
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
    const from = !bin ? null : given(engine) ? 'Settings → Engines' : Installs.KIND_LABEL[Installs.kindOf(engine, bin)];
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
      args: shownArgs(a) };
  });
  return report;
}

// ---------- installs (round 9): which copy, how old, signed in, and the one-click fix ----------
// "version 2.1.280 or newer is required" → that minimum is remembered; a too-old error without a number marks the copy
// in use (and anything older) as too old.
function learnTooOld(engine, bin, text) {
  const d = Installs.data();
  const named = Installs.semverOf((/version ([\d.]+) or newer/i.exec(text) || [])[1]);
  const cur = d.versions[Installs.binKey(bin)]?.semver;
  const min = named || (cur ? cur.replace(/\d+$/, (n) => String(Number(n) + 1)) : null);
  if (!min || (d.learnedMin[engine] && Installs.cmp(d.learnedMin[engine], min) >= 0)) return;
  d.learnedMin[engine] = min;
  Installs.persist();
  log(`${engine} needs ${min} or newer (learned from: ${text.split('\n')[0].slice(0, 160)})`);
}
// Every copy of one engine, the newest working one chosen (Settings → Engines wins), its sign-in state.
// fresh: read the versions again (after an update). login: false skips the sign-in check.
async function checkEngine(engine, { fresh = false, login = true } = {}) {
  const pinned = given(engine);
  const files = Installs.candidates(engine);
  if (pinned && !files.includes(pinned)) files.unshift(pinned);
  const copies = [];
  for (const file of files.slice(0, 12)) {
    const v = await Installs.version(file, { cwd: WORKSPACE, fresh });
    copies.push({ path: file, kind: file === pinned ? 'settings' : Installs.kindOf(engine, file), via: IS_MAC ? MacPolish.whereOf?.(file) || '' : '', version: v.text, semver: v.semver });
  }
  const working = copies.filter((c) => c.version);
  const newest = working.reduce((best, c) => (!best || Installs.cmp(c.semver, best.semver) > 0 ? c : best), null);
  const pick = pinned ? copies.find((c) => c.path === pinned) : newest || copies[0] || null;
  const d = Installs.data();
  if (!pinned && pick && d.chosen[engine] !== pick.path) { d.chosen[engine] = pick.path; Installs.persist(); }
  if (!pinned && !pick && d.chosen[engine]) { delete d.chosen[engine]; Installs.persist(); }
  for (const c of copies) { c.chosen = c === pick; c.ok = Installs.meetsMin(engine, c.semver); }
  const r = { engine, label: ENGINES[engine].label, found: Boolean(pick), chosen: pick?.path || null, from: pick ? (pinned ? 'settings' : pick.kind) : null, via: pick?.via || '',
    version: pick?.version || null, semver: pick?.semver || null, min: Installs.minFor(engine), copies };
  r.tooOld = pick ? Installs.meetsMin(engine, pick.semver) === false : false;
  r.broken = Boolean(pick && !pick.version);
  // Settings → Engines names an older copy than one Hearth found
  if (pinned && newest && newest.path !== pinned && Installs.cmp(newest.semver, pick?.semver) > 0) r.newer = { path: newest.path, version: newest.version };
  r.plan = Installs.updatePlan(engine, pick?.path || null);
  if (pick && login && !r.broken) { const s = await Installs.signedIn(engine, pick.path, WORKSPACE); r.signedIn = s.ok; r.signText = s.text; }
  return r;
}
async function checkInstalls(opts = {}) {
  // test: a dev/smoke.js copy (its startup notice leaves out engines that simply aren't there)
  const out = { platform: process.platform, at: Date.now(), test: Boolean(process.env.HEARTH_TEST_SAVE_DIR) };
  for (const engine of opts.engines || Object.keys(ENGINES)) out[engine] = await checkEngine(engine, opts);
  return out;
}
// Runs the update / install / sign-in for one engine in a visible window; when the window's work ends, the engine is
// checked again (fresh versions) and onDone(report) is called (main.js sends it to the window).
const fixWatch = {};
function fix(engine, action = 'update', onDone = (rep, info) => installsListener(rep, info)) {
  if (!ENGINES[engine]) return { ok: false, error: `No engine ${engine}` };
  const bin = LOCATE[engine]();
  const label = ENGINES[engine].label;
  let title; let lines;
  if (action === 'login') {
    if (!bin) return { ok: false, error: `${label} wasn't found` };
    title = `Sign in to ${label} for Hearth`; lines = [Installs.loginPlan(engine, bin)];
  } else {
    const plan = Installs.updatePlan(engine, action === 'install' ? null : bin);
    title = `${plan.how === 'install' ? 'Install' : 'Update'} ${label} for Hearth`; lines = [plan.command];
  }
  const marker = path.join(os.tmpdir(), `hearth-fix-${engine}-${crypto.randomUUID().slice(0, 8)}.done`);
  const r = Installs.runInTerminal({ title, lines, marker, cwd: WORKSPACE, bin });
  log(`${engine} ${action}: ${lines.join(' ; ')} → ${r.ok ? r.window : r.error}`);
  if (!r.ok) return { ...r, command: lines.join('\n') };
  clearInterval(fixWatch[engine]);
  const started = Date.now();
  fixWatch[engine] = setInterval(() => {
    const done = fs.existsSync(marker);
    if (!done && Date.now() - started < 20 * 60000) return;
    clearInterval(fixWatch[engine]);
    fs.rm(marker, { force: true }, () => {});
    if (engine === 'claude') claudeBinKey = ''; // a new binary: its options are learned again
    checkInstalls({ engines: [engine], fresh: true }).then((rep) => onDone(rep, { engine, action, finished: done })).catch(() => {});
  }, 1500);
  fixWatch[engine].unref?.();
  return { ok: true, window: r.window, command: lines.join('\n') };
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
    const child = WinPolish.spawn(bin, dropUnsupported([
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
  send, stop, stopAll, login, status, checkInstalls, checkEngine, fix, locate: (e) => LOCATE[e]?.() || null, onInstalls, discoverConnectors, readConnectorCache, isReadOnlyTool: (name) => READ_ONLY_TOOL.test(name), once, setEnginePaths,
  doctor, EFFORTS, CODEX_DISABLED_FEATURES,
  // for tests (dev/astra-engine-test.js)
  _test: { lightParse, batched, withSubagents, treeCpuMs, lastErrorLine, codexArgs, claudeArgs, unsupportedFlag, get claudeDropped() { return claudeDropped; }, accessOf, accessLine, toolAccess, PERMISSION_TOOL, POLICY_BLOCKED, codexOpen, loadDropped, rememberDropped, codexParser, claudeParser, friendlyError, buildPrompt, hubToolsets, chatGuideOn, learnTooOld, Installs, TOO_OLD, NETWORK, hubToolEnv, nodesOn, LOST_SESSION, memoryFor, onlyGrew, ANSWER_LINES },
  buildPrompt, promptParts, HUB_TOOLSETS, // the director cost report (mcp/cost.js); (round 36) the prompt's parts (tokenauditmain.js)
  busy: () => running.size, // (round 16) replies running now: background work (sync) waits a little longer meanwhile
};
