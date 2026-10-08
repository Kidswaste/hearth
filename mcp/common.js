// Shared plumbing for the hub's MCP servers (stdio JSON-RPC 2.0). Each server declares its tools;
// calls are forwarded to the running hub through gamebridge.js (127.0.0.1 + token).
const fs = require('fs');
const http = require('http');
const path = require('path');

const INFO_PATH = path.join(__dirname, '..', 'data', 'game-bridge.json');

function callHub(tool, args) {
  return new Promise((resolve) => {
    let info;
    try { info = JSON.parse(fs.readFileSync(INFO_PATH, 'utf8')); } catch { resolve({ ok: false, error: 'Hearth (the hub) is not running.' }); return; }
    const body = JSON.stringify({ tool, args });
    const req = http.request({ host: '127.0.0.1', port: info.port, path: '/call', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-token': info.token, 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, error: `Bad reply from the hub (${res.statusCode})` }); } });
    });
    req.on('error', (err) => resolve({ ok: false, error: `Couldn't reach Hearth (the hub): ${err.message}` }));
    // Renders can take a while; the bridge itself enforces per-tool limits.
    req.setTimeout(30 * 60 * 1000, () => { req.destroy(); resolve({ ok: false, error: 'Timed out waiting for the hub.' }); });
    req.end(body);
  });
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
    } else if (method === 'tools/call') {
      // local[name](args) can answer without the hub (help text); null means "ask the hub".
      // hubChatId: which chat's run made the call (engines.js HUB_CHAT_ID); the hub routes by it and strips it
      const args = { ...(params.arguments || {}), ...extraArgs, ...(process.env.HUB_CHAT_ID ? { hubChatId: process.env.HUB_CHAT_ID } : {}) };
      const r = (local[params.name] && await local[params.name](args)) || await callHub(params.name, args);
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

module.exports = { serve, callHub, fmtValue };
