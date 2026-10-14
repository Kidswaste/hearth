// Shared plumbing for the hub's MCP servers (stdio JSON-RPC 2.0). Each server declares its tools;
// calls are forwarded to the running hub through gamebridge.js (127.0.0.1 + token).
// (round 21) Each engine run starts its own servers, so boot is kept light: http loads after the tool list is
// answered (it alone was ≈ 14 ms of a ≈ 66 ms start), the hub's address is read once (again only when the hub
// restarted), and calls reuse one kept-alive connection. Node's compile cache keeps the parsed files between runs.
try { require('module').enableCompileCache?.(require('path').join(require('os').tmpdir(), 'hearth-mcp-cache')); } catch { /* older Node */ }
const fs = require('fs');
const path = require('path');
let http = null;
let agent = null;
const net = () => { if (!http) { http = require('http'); agent = new http.Agent({ keepAlive: true, maxSockets: 4 }); } return http; };

// HUB_BRIDGE_INFO: a stand-in hub's bridge file (dev/director-speed.js); never set by the app
const INFO_PATH = process.env.HUB_BRIDGE_INFO || path.join(__dirname, '..', 'data', 'game-bridge.json');

let info = null; // { port, token } of the running hub, read once
function readInfo() { try { info = JSON.parse(fs.readFileSync(INFO_PATH, 'utf8')); } catch { info = null; } return info; }
function post(tool, args) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ tool, args });
    const req = net().request({ host: '127.0.0.1', port: info.port, path: '/call', method: 'POST', agent, headers: { 'Content-Type': 'application/json', 'x-hub-token': info.token, 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { if (res.statusCode === 403) { resolve({ stale: true }); return; } try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, error: `Bad reply from the hub (${res.statusCode})` }); } });
    });
    req.on('error', (err) => resolve({ stale: true, ok: false, error: `Couldn't reach Hearth (the hub): ${err.message}` }));
    // Renders can take a while; the bridge itself enforces per-tool limits.
    req.setTimeout(30 * 60 * 1000, () => { req.destroy(); resolve({ ok: false, error: 'Timed out waiting for the hub.' }); });
    req.end(body);
  });
}
async function callHub(tool, args) {
  if (!info && !readInfo()) return { ok: false, error: 'Hearth (the hub) is not running.' };
  let r = await post(tool, args);
  // the hub restarted (new port / token) since the address was read: read it again, once
  if (r.stale) { const was = JSON.stringify(info); if (readInfo() && JSON.stringify(info) !== was) r = await post(tool, args); }
  if (r.stale) { const { stale, ...rest } = r; return rest.ok === false ? rest : { ok: false, error: 'Hearth (the hub) refused the call (it restarted?): try again.' }; }
  return r;
}

// Tool results as the model reads them, kept cheap: an object becomes "key: value" lines (values as compact JSON,
// multi-line text and lists of lines as text), instead of 2-space-indented JSON where indentation and escaped
// newlines cost tokens on every call. Strings pass through.
function fmtValue(v) {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'done';
  if (!v || typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v);
  return Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => {
    if (typeof x === 'string') return x.includes('\n') ? `${k}:\n${x}` : `${k}: ${x}`;
    if (Array.isArray(x) && x.length && x.every((e) => typeof e === 'string')) return `${k}:\n${x.map((e) => `  ${e}`).join('\n')}`;
    return `${k}: ${JSON.stringify(x)}`;
  }).join('\n');
}

// (round 31, tokensaver) help on demand for any server: def.help = { topic: text } (a tool's name → its whole how-to).
// A call with { help: '<topic>' } (on the tool whose schema names it) is answered here, without the hub, so the tool
// list that rides along with every message keeps only short descriptions (the pattern of three_do help).
function helpOf(help, topic) {
  const t = String(topic || '').trim().toLowerCase().replace(/^help\s+/, '');
  const word = t && new RegExp(`(^|[^\\w-])${t.replace(/[^\w-]/g, '')}([^\\w-]|$)`, 'i');
  // a tool by name (board_vibe or vibe), else the tool whose help names it (an op: pins → board_do)
  const hit = help[t] || help[Object.keys(help).find((k) => k.endsWith(`_${t}`) || k.replace(/^\w+?_/, '') === t)] || (word && Object.values(help).find((v) => word.test(v)));
  return { ok: true, value: hit || `Topics: ${Object.keys(help).join(', ')}.` };
}

// The tool list as it's sent (short words) and its help (the whole descriptions + args, enums included) from one
// full definition: short = { tool: 'its short description' }; helpOn = the tool whose schema takes { help }.
// Long enums leave the schema (they're in help); short ones stay, they steer the model for a few tokens.
// (round 41, toolslim) short[tool] can also be [words, ['arg', …]]: only those args stay in the schema (the rest are
// named in the words or in help; the servers pass every arg on, listed or not). `merge` = { dispatcher: [tool, …] }:
// those tools leave the list and are reached as dispatcher { op: '<tool without its prefix>' } (see dispatch()).
function leanTools(tools, short, helpOn, merge = {}) {
  const argsOf = (t) => Object.entries(t.inputSchema?.properties || {}).map(([k, v]) => (v.enum ? `${k} (${v.enum.join('|')})` : k)).join(', ');
  const via = Object.fromEntries(Object.entries(merge).flatMap(([d, names]) => names.map((n) => [n, d])));
  const help = Object.fromEntries(tools.map((t) => [t.name, `${t.name}${via[t.name] ? ` (${via[t.name]} op "${opName(t.name)}")` : ''}: ${t.description}\nargs: ${argsOf(t) || 'none'}`]));
  const slim = (props) => Object.fromEntries(Object.entries(props || {}).map(([k, v]) => [k, v.enum && JSON.stringify(v.enum).length > 60 ? { type: v.type } : v]));
  const pick = (props, keep) => (keep ? Object.fromEntries(keep.filter((k) => props?.[k]).map((k) => [k, props[k]])) : props);
  const list = tools.filter((t) => !via[t.name]).map((t) => {
    const [words, keep] = Array.isArray(short[t.name]) ? short[t.name] : [short[t.name], null];
    const required = (t.inputSchema?.required || []).filter((k) => !keep || keep.includes(k));
    return { ...t, description: words ?? t.description,
      inputSchema: { type: 'object', properties: { ...slim(pick(t.inputSchema?.properties, keep)), ...(t.name === helpOn ? { help: { type: 'string' } } : {}) }, ...(required.length ? { required } : {}) } };
  });
  return { list, help };
}
// a merged tool's op: board_watch → watch, meshy_generate → meshy_generate's own short op (named by the server)
const opName = (name) => name.replace(/^[a-z]+_/, '');
// The local handler of a dispatcher: { op: 'watch', ...args } → the hub's board_watch(args), as if called by name, so
// the hub's handlers (and its usage counts) see the same tool names as before. ops = { op: 'real_tool_name' } (an
// entry may give the op's fixed args: { op: ['capture_record', { action: 'start' }] }). Any other op returns null:
// the dispatcher itself goes to the hub.
function dispatch(ops) {
  return (a) => {
    const { op, ...rest } = a;
    const hit = ops[String(op || '').trim().toLowerCase().replace(/-/g, '_')];
    if (!hit) return null;
    const [tool, fixed] = Array.isArray(hit) ? hit : [hit, {}];
    return callHub(tool, { ...rest, ...fixed });
  };
}

// Each server file ends with `module.exports = serve({ name, instructions, tools }, module)`: run as a program it
// serves stdio; required (by the hub's cost report / tests) it only hands back its definitions.
function serve(def, mod) {
  if (mod && require.main !== mod) return def;
  const { name, instructions, tools, extraArgs = {}, local = {} } = def;
  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  async function handle(msg) {
    const { id, method, params } = msg;
    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name, version: '1.0.0' }, ...(instructions ? { instructions } : {}) } });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools } });
      setTimeout(net, 0); // warm the network module while the model thinks, off the start path
    } else if (method === 'tools/call') {
      // local[name](args) can answer without the hub (help text); null means "ask the hub".
      // hubChatId: which chat's run made the call (engines.js HUB_CHAT_ID); the hub routes by it and strips it
      const args = { ...(params.arguments || {}), ...extraArgs, ...(process.env.HUB_CHAT_ID ? { hubChatId: process.env.HUB_CHAT_ID } : {}) };
      const r = (def.help && typeof args.help === 'string' && helpOf(def.help, args.help)) || (local[params.name] && await local[params.name](args)) || await callHub(params.name, args);
      const content = [];
      for (const img of [].concat(r.images || (r.image ? [{ data: r.image, mime: r.mime }] : []))) {
        content.push({ type: 'image', data: img.data, mimeType: img.mime || 'image/png' });
      }
      content.push({ type: 'text', text: r.ok ? fmtValue(r.value) : `Error: ${r.error}` });
      send({ jsonrpc: '2.0', id, result: { content, isError: !r.ok } });
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
    } else if (id !== undefined) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  }
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      handle(msg).catch((err) => { if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: err.message } }); });
    }
  });
  process.stdin.on('end', () => process.exit(0));
  return def;
}

module.exports = { serve, callHub, fmtValue, helpOf, leanTools, dispatch };
