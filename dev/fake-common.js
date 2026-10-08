// Shared bits of the fake engines (dev/fake-claude.js, dev/fake-codex.js): read the prompt from stdin, pick a
// scripted reply from keywords in it, and stream it out at a readable pace. Development only; never used by the app.
//
// Keywords in your message (combine them freely):
//   think     streams a thinking block first          tool     calls a (fake) tool before answering
//   tools3    three tool calls in a row                code     a reply with a JS / three.js code block
//   table     a Markdown table + task list + callout   long     a very long reply (folds in the chat)
//   remember  ends with <remember>…</remember>          suggest  ends with three <suggest> chips, one is a /command
//   slow      streams slowly (~6 s, to test Stop)       error    the engine fails (is_error / turn.failed)
//   login     fails with "not logged in"                crash    exits with code 3 and a stderr line
//   big       reports a huge input usage (auto-compact) echo     replies with the exact prompt it got
//   mcp       really calls the hub MCP servers it was given (--mcp-config / -c mcp_servers.*): the tools in a line
//             `mcp: [["three_console", {}], ["three_do", {"cmd": "layers"}]]` (default: tools/list + three_console)
// Env: FAKE_DELAY (ms between pieces, default 15), FAKE_STATE (folder for per-session turn counts).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const STATE_DIR = process.env.FAKE_STATE || path.join(os.tmpdir(), 'hearth-fake-engines');
fs.mkdirSync(STATE_DIR, { recursive: true });

function readStdin() {
  return new Promise((resolve) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { text += c; });
    process.stdin.on('end', () => resolve(text));
    if (process.stdin.isTTY) resolve('');
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
const uuid = () => crypto.randomUUID();

// Per-session state (turns so far, running token totals) so resumed chats grow like real ones.
function loadState(id) {
  try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, `${id}.json`), 'utf8')); } catch { return { turns: 0, input: 0, output: 0, chars: 0 }; }
}
function saveState(id, s) { try { fs.writeFileSync(path.join(STATE_DIR, `${id}.json`), JSON.stringify(s)); } catch { /* best effort */ } }

// The user's own words: what follows any context the hub wrapped around it.
function userPart(prompt) {
  const cut = prompt.split(/<\/(?:earlier_conversation|summary|since_then)>/).pop();
  return cut.replace(/<file name="[^"]*">[\s\S]*?<\/file>/g, '').trim();
}

function plan(prompt) {
  const msg = userPart(prompt);
  const has = (w) => new RegExp(`\\b${w}\\b`, 'i').test(msg);
  const p = {
    think: has('think'), tool: has('tool'), tools3: has('tools3'), code: has('code'), table: has('table'), long: has('long'),
    remember: has('remember'), suggest: has('suggest'), slow: has('slow'), error: has('error'), login: has('login'),
    crash: has('crash'), big: has('big'), echo: has('echo'), mcp: has('mcp'),
    mcpCalls: (() => { const m = msg.match(/^mcp:\s*(\[[\s\S]*\])\s*$/m); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } })(),
    compact: /Compact our context|moving to a fresh chat/i.test(msg),
    summarize: /^Summari[sz]e\b/i.test(msg),
    title: /short title for this chat/i.test(msg),
    // "Let Astra decide" (decide.js): answers with the second option, like a real pick
    decide: /^Options: (.+)$/m.test(msg) && /Reply with one option name only/.test(msg) ? msg.match(/^Options: (.+)$/m)[1].split(' | ') : null,
  };
  const parts = [];
  const short = msg.replace(/\s+/g, ' ').slice(0, 80);
  if (p.decide) return { p, text: p.decide[1] || p.decide[0], thinking: '' };
  if (p.title) parts.push('Fake chat about testing');
  else if (p.compact) parts.push('**Summary.** The user is testing Hearth with a fake engine. Decisions: keep it compact. Exists: one test chat. Left to do: nothing.');
  else if (p.echo) parts.push(prompt);
  else if (p.summarize) parts.push('- Point one of the summary\n- Point two\n- Point three');
  else parts.push(`Fake reply to: “${short}”.`);
  if (p.code) parts.push('Here is a sketch:\n\n```js\nimport * as THREE from \'three\';\nconst scene = new THREE.Scene();\nconst cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());\nscene.add(cube);\n```\n\nAnd a shell line:\n\n```bash\necho hello\n```');
  if (p.table) parts.push('| Name | Value |\n| --- | ---: |\n| alpha | 1 |\n| beta | 22 |\n\n- [x] done task\n- [ ] open task\n\n> [!NOTE]\n> A callout note.\n\nInline math: $E = mc^2$.');
  if (p.long) for (let i = 1; i <= 60; i++) parts.push(`Paragraph ${i}: ${'lorem ipsum dolor sit amet '.repeat(6).trim()}.`);
  if (p.remember) parts.push('<remember>The user tests Hearth with fake engines</remember>');
  if (p.suggest) parts.push('<suggest>Make it bigger</suggest><suggest>/stats</suggest><suggest>Try another color</suggest>');
  return { p, text: parts.join('\n\n'), thinking: p.think ? 'Let me think about this.\n\nFirst, consider the request. Then decide on a compact answer.' : '' };
}

// Splits text into small pieces like a model streams tokens.
function pieces(text) { return text.match(/[\s\S]{1,12}/g) || []; }
const delayMs = (p) => (p.slow ? 120 : Number(process.env.FAKE_DELAY || 15));

// A real MCP client for the `mcp` keyword: starts a server the way the CLI would ({ command, args, env }), speaks
// JSON-RPC over stdio, and returns { tools, call(name, args), close() }.
function mcpClient({ command, args = [], env = {} }) {
  const { spawn } = require('child_process');
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = ''; let next = 1; const waiting = new Map();
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      try { const msg = JSON.parse(line); waiting.get(msg.id)?.(msg); waiting.delete(msg.id); } catch { /* not JSON */ }
    }
  });
  const rpc = (method, params) => new Promise((resolve) => { const id = next++; waiting.set(id, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); setTimeout(() => { if (waiting.delete(id)) resolve({ error: { message: 'timeout' } }); }, 120000); });
  return (async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake', version: '0' } });
    const list = await rpc('tools/list', {});
    return {
      instructions: init.result?.instructions || '', tools: list.result?.tools || [],
      call: async (name, a) => (await rpc('tools/call', { name, arguments: a || {} })).result || { isError: true, content: [{ type: 'text', text: 'no result' }] },
      close: () => { try { child.stdin.end(); child.kill(); } catch { /* gone */ } },
    };
  })();
}
// Which server a tool belongs to (by prefix), from the servers the CLI was given.
const serverFor = (servers, tool) => servers[{ three: 'three', video: 'video', ae: 'video', forge: 'forgeheart', chat: 'chat' }[tool.split('_')[0]]] || null;

module.exports = { readStdin, sleep, out, uuid, loadState, saveState, plan, pieces, delayMs, mcpClient, serverFor };
