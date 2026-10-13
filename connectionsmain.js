// Connections, main side (round 26, connections stream; connections.js is the renderer side). Required from main.js
// with one line; engines.js asks it for the servers an agent may use. The owner's own MCP servers (a command + args,
// or a URL), each switched on per AI in ⋯ AI setup → What it can use:
//   config.connections = [{ id, name, kind: 'stdio' | 'http', command, args: [], url, env: {}, headers: {},
//                           tools: [{ n, ro }], tokens, testedAt, catalog }]
//   agent.connections  = { [id]: 'read' | 'full' }   (absent = off)
// Claude gets them in the same --mcp-config file as the hub tool sets, Codex as "-c mcp_servers.<name>…" overrides.
// Env values / headers the owner types stay in config.json like every other setting: they go to the server process
// only, never into a prompt, and the shown command line (/astra-flags) masks them.
// Test: starts the server (or calls the URL), runs initialize + tools/list, stops it, and says why when it can't.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
// Tool names that only look things up (the same rule as engines.js) when a server doesn't say so itself.
const READ_ONLY_TOOL = /(^|[_-])(get|list|search|read|fetch|query|find|view|preview|download|export|who_am_i|guide|describe|show|status|current|lookup)([_-]|$)/i;
// Hearth's own server names (engines.js HUB_TOOLSETS + access): a connection never takes one of them
const RESERVED = new Set(['forgeheart', 'three', 'chat', 'board', 'capture', 'adobe', 'deploy', 'apps', 'access']);
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME = /^[A-Za-z0-9-]+$/;
const TEST_MS = 90000; // a first npx / uvx run downloads the package

let readConfig = () => ({});
const list = () => { try { const c = readConfig().connections; return Array.isArray(c) ? c : []; } catch { return []; } };

// ---------- names and commands ----------
const slug = (s) => String(s || 'server').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'server';
// The MCP server name each connection gets (what tools are called by: mcp__<name>__tool), unique in the list.
function serverNames(all = list()) {
  const names = new Map();
  const used = new Set(RESERVED);
  for (const c of all) {
    let base = slug(c.name);
    if (RESERVED.has(base)) base = `my_${base}`;
    let n = base;
    for (let i = 2; used.has(n); i++) n = `${base}_${i}`;
    used.add(n);
    names.set(c.id, n);
  }
  return names;
}
// Where programs get installed (an app started from the Mac Dock or Finder doesn't get the shell's PATH)
function extraDirs() {
  const home = os.homedir();
  if (IS_WIN) return [path.join(process.env.APPDATA || '', 'npm'), path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), 'C:\\Program Files\\nodejs'];
  return [...(IS_MAC ? ['/opt/homebrew/bin'] : []), '/usr/local/bin', '/usr/bin', path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), path.join(home, '.npm-global', 'bin'), path.join(home, '.volta', 'bin'), path.join(home, '.bun', 'bin')];
}
const pathDirs = () => [...new Set([...(process.env.PATH || '').split(path.delimiter), ...extraDirs()].filter(Boolean))];
const exts = () => (IS_WIN ? ['', '.cmd', '.exe', '.bat'] : ['']);
// The full path of a program (an absolute path is kept when it's there), or null.
function which(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return null;
  if (path.isAbsolute(c) || /[\\/]/.test(c)) return fs.existsSync(c) ? c : null;
  for (const dir of pathDirs()) for (const e of exts()) { const f = path.join(dir, c + e); try { if (fs.statSync(f).isFile()) return f; } catch { /* not here */ } }
  return null;
}
// What to actually run: the program's full path (a Windows .cmd goes through cmd.exe) and a PATH that finds Node /
// Python next to it (npx runs node, uvx runs python).
function launch(conn) {
  const found = which(conn.command);
  const file = found || String(conn.command || '');
  const args = (Array.isArray(conn.args) ? conn.args : []).map(String);
  const dirs = [...new Set([found ? path.dirname(found) : null, ...pathDirs()].filter(Boolean))];
  const PATH = dirs.join(path.delimiter);
  if (IS_WIN && /\.(cmd|bat)$/i.test(file)) return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/c', file, ...args], PATH, found };
  return { command: file, args, PATH, found };
}
const cleanEnv = (env) => Object.fromEntries(Object.entries(env && typeof env === 'object' ? env : {}).filter(([k, v]) => ENV_NAME.test(k) && v != null).map(([k, v]) => [k, String(v)]));
const cleanHeaders = (h) => Object.fromEntries(Object.entries(h && typeof h === 'object' ? h : {}).filter(([k, v]) => HEADER_NAME.test(k) && v != null).map(([k, v]) => [k, String(v)]));
const isHttp = (c) => c.kind === 'http' || (!c.command && /^https?:\/\//i.test(c.url || ''));

// ---------- what an agent gets ----------
// [{ conn, mode, name }] for the connections this agent has on (one-off calls, like second opinions, get none).
function enabledFor(agent, all = list()) {
  if (!agent || agent.noHubTools) return [];
  const modes = agent.connections && typeof agent.connections === 'object' ? agent.connections : {};
  const names = serverNames(all);
  return all.filter((c) => c && c.id && (modes[c.id] === 'read' || modes[c.id] === 'full') && c.off !== true && (isHttp(c) ? /^https?:\/\//i.test(c.url || '') : String(c.command || '').trim()))
    .map((c) => ({ conn: c, mode: modes[c.id], name: names.get(c.id) }));
}
// The server entries for Claude's --mcp-config file.
function claudeServers(agent, all = list()) {
  const out = {};
  for (const { conn, name } of enabledFor(agent, all)) {
    if (isHttp(conn)) {
      const headers = cleanHeaders(conn.headers);
      out[name] = { type: /\/sse\/?$/i.test(conn.url) ? 'sse' : 'http', url: conn.url, ...(Object.keys(headers).length ? { headers } : {}) };
    } else {
      const l = launch(conn);
      out[name] = { command: l.command, args: l.args, env: { PATH: l.PATH, ...cleanEnv(conn.env) } };
    }
  }
  return out;
}
// The tool rules for Claude: Full = the whole server, like a hub tool set; Read only = the tools that only look
// (known from the last Test), the rest blocked. A read-only connection never tested gets nothing pre-approved.
function claudeRules(agent, all = list()) {
  const allowed = [];
  const denied = [];
  for (const { conn, mode, name } of enabledFor(agent, all)) {
    if (mode === 'full') { allowed.push(`mcp__${name}`); continue; }
    for (const t of Array.isArray(conn.tools) ? conn.tools : []) (t.ro ? allowed : denied).push(`mcp__${name}__${t.n}`);
  }
  return { allowed, denied };
}
// Codex: "-c mcp_servers.<name>.…" overrides (nothing written to the owner's ~/.codex/config.toml).
function codexArgs(agent, tomlStr = (s) => JSON.stringify(String(s)), all = list()) {
  const args = [];
  const table = (o) => `{ ${Object.entries(o).map(([k, v]) => `${/^[A-Za-z0-9_-]+$/.test(k) ? k : tomlStr(k)}=${tomlStr(v)}`).join(', ')} }`;
  for (const { conn, mode, name } of enabledFor(agent, all)) {
    const p = `mcp_servers.${name}`;
    if (isHttp(conn)) {
      args.push('-c', `${p}.url=${tomlStr(conn.url)}`);
      const h = cleanHeaders(conn.headers);
      if (Object.keys(h).length) args.push('-c', `${p}.http_headers=${table(h)}`);
    } else {
      const l = launch(conn);
      args.push('-c', `${p}.command=${tomlStr(l.command)}`, '-c', `${p}.args=[${l.args.map(tomlStr).join(', ')}]`, '-c', `${p}.env=${table({ PATH: l.PATH, ...cleanEnv(conn.env) })}`);
    }
    // a first npx / uvx start downloads the package
    args.push('-c', `${p}.startup_timeout_sec=60`, '-c', `${p}.tool_timeout_sec=300`);
    if (mode === 'read') {
      const ro = (Array.isArray(conn.tools) ? conn.tools : []).filter((t) => t.ro).map((t) => t.n);
      args.push('-c', `${p}.enabled_tools=[${ro.map(tomlStr).join(', ')}]`);
    }
    // `codex exec` can't show an approval prompt and cancels a tool call it would ask about: the owner's On (Full /
    // Read only) is the approval, the same as Hearth's own tool sets
    args.push('-c', `${p}.default_tools_approval_mode="approve"`);
  }
  return args;
}
// The command line as shown (/astra-flags): the owner's env values and headers become ••••.
function maskArgs(args, all = list()) {
  const secrets = [];
  for (const c of all) for (const v of [...Object.values(cleanEnv(c.env)), ...Object.values(cleanHeaders(c.headers))]) if (v.length >= 3) secrets.push(v);
  if (!secrets.length) return args;
  return args.map((a) => secrets.reduce((s, v) => s.split(v).join('••••'), String(a)));
}

// ---------- Test ----------
const toolInfo = (t) => {
  const hint = t?.annotations?.readOnlyHint;
  return { n: String(t.name), ro: hint === true || (hint !== false && READ_ONLY_TOOL.test(String(t.name))), d: String(t.description || '').slice(0, 160) };
};
// ≈ tokens the tool list adds to every message (definitions are sent with each request): JSON chars / 4
const tokensOf = (tools) => Math.round(JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description || '', input_schema: t.inputSchema || {} }))).length / 4);
const HINT = { npx: 'It needs Node.js: install it from nodejs.org, then Test again.', uvx: 'It needs Python\'s uv: install it from docs.astral.sh/uv, then Test again.', node: 'It needs Node.js (nodejs.org).', python: 'It needs Python (python.org).', python3: 'It needs Python (python.org).', docker: 'It needs Docker Desktop running.' };
const tail = (s, n = 300) => String(s || '').trim().split('\n').filter(Boolean).slice(-3).join(' · ').slice(-n);

function testStdio(conn, ms) {
  return new Promise((resolve) => {
    const l = launch(conn);
    const base = path.basename(String(conn.command || '')).replace(/\.(cmd|exe|bat)$/i, '');
    if (!l.found) { resolve({ ok: false, error: `“${conn.command || '(no command)'}” isn't on this computer.`, hint: HINT[base] || 'Check the command, or give its full path.' }); return; }
    let child;
    try { child = spawn(l.command, l.args, { env: { ...process.env, PATH: l.PATH, ...cleanEnv(conn.env) }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); } catch (err) { resolve({ ok: false, error: `It didn't start: ${err.message}`, hint: HINT[base] }); return; }
    let buf = ''; let err = ''; let next = 1; let done = false;
    const waiting = new Map();
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); for (const w of waiting.values()) w({ error: { message: 'stopped' } }); try { child.stdin.end(); child.kill(); } catch { /* gone */ } resolve(r); };
    const timer = setTimeout(() => finish({ ok: false, error: `No answer in ${Math.round(ms / 1000)} s.`, hint: tail(err) || 'A first start downloads the package: try once more. Otherwise check the command and its arguments.' }), ms);
    child.on('error', (e) => finish({ ok: false, error: e.code === 'ENOENT' ? `“${conn.command}” isn't on this computer.` : `It didn't start: ${e.message}`, hint: HINT[base] }));
    child.on('exit', (code) => setTimeout(() => finish({ ok: false, error: `It stopped before answering (exit ${code ?? '?'}).`, hint: tail(err) || 'Check the arguments (a folder or file it needs?).' }), 50));
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        try { const msg = JSON.parse(line); if (msg.id != null && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } } catch { /* a log line on stdout */ }
      }
    });
    const rpc = (method, params) => new Promise((res) => { const id = next++; waiting.set(id, res); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
    const note = (method) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
    (async () => {
      const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Hearth', version: '1' } });
      if (done) return;
      if (init.error) { finish({ ok: false, error: `It answered with an error: ${init.error.message}`, hint: tail(err) }); return; }
      note('notifications/initialized');
      const tools = [];
      let cursor;
      for (let page = 0; page < 10; page++) {
        const r = await rpc('tools/list', cursor ? { cursor } : {});
        if (done) return;
        if (r.error) { if (!tools.length) { finish({ ok: false, error: `Its tool list failed: ${r.error.message}` }); return; } break; }
        tools.push(...(r.result?.tools || []));
        cursor = r.result?.nextCursor;
        if (!cursor) break;
      }
      finish({ ok: true, server: init.result?.serverInfo?.name || '', tools: tools.map(toolInfo), tokens: tokensOf(tools) });
    })().catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function testHttp(conn, ms) {
  const url = String(conn.url || '');
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'The address must start with http:// or https://.' };
  if (/\/sse\/?$/i.test(url)) return { ok: true, tools: [], tokens: 0, note: 'An older SSE server: Claude can use it; Test can\'t list its tools (and Codex can\'t use it).' };
  const t0 = Date.now();
  let session = '';
  let id = 0;
  const post = async (method, params, notify = false) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(1000, ms - (Date.now() - t0)));
    try {
      const res = await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...(session ? { 'mcp-session-id': session } : {}), ...cleanHeaders(conn.headers) }, body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(notify ? {} : { id: ++id }) }) });
      session = res.headers.get('mcp-session-id') || session;
      if (notify) return null;
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`It needs a sign-in (HTTP ${res.status}).`), { hint: 'Add the key it asks for as a header (Authorization: Bearer …) in the connection, or use a server that signs in by itself.' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      const msgs = /event-stream/.test(res.headers.get('content-type') || '') ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => { try { return JSON.parse(l.slice(5)); } catch { return null; } }) : [JSON.parse(text)];
      const msg = msgs.find((m) => m && m.id === id);
      if (!msg) throw new Error('No answer in what it sent back.');
      if (msg.error) throw new Error(msg.error.message);
      return msg.result;
    } finally { clearTimeout(timer); }
  };
  try {
    const init = await post('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Hearth', version: '1' } });
    await post('notifications/initialized', undefined, true);
    const tools = [];
    let cursor;
    for (let page = 0; page < 10; page++) {
      const r = await post('tools/list', cursor ? { cursor } : {});
      tools.push(...(r?.tools || []));
      cursor = r?.nextCursor;
      if (!cursor) break;
    }
    return { ok: true, server: init?.serverInfo?.name || '', tools: tools.map(toolInfo), tokens: tokensOf(tools) };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? `No answer in ${Math.round(ms / 1000)} s.` : /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(e.message + (e.cause?.code || '')) ? 'Nothing answers at that address.' : e.message, hint: e.hint || (e.cause?.code ? String(e.cause.code) : undefined) };
  }
}
function test(conn, { ms = TEST_MS } = {}) {
  if (!conn || typeof conn !== 'object') return Promise.resolve({ ok: false, error: 'Nothing to test.' });
  return isHttp(conn) ? testHttp(conn, ms) : testStdio(conn, ms);
}

function register(ipcMain, opts = {}) {
  if (typeof opts.readConfig === 'function') readConfig = opts.readConfig;
  ipcMain.handle('connections:test', (_e, conn) => test(conn));
  // which helper programs are on this computer (the catalog marks "needs Node / Python")
  ipcMain.handle('connections:which', (_e, names) => Object.fromEntries((Array.isArray(names) ? names : [names]).slice(0, 20).map((n) => [String(n), Boolean(which(String(n)))])));
}

module.exports = { register, enabledFor, claudeServers, claudeRules, codexArgs, maskArgs, test, which, serverNames, list, setReader: (fn) => { readConfig = fn; }, _test: { launch, toolInfo, tokensOf, cleanEnv, READ_ONLY_TOOL } };
