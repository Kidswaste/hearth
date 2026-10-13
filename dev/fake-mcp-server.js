#!/usr/bin/env node
// A tiny stdio MCP server for the connections Test button and checks (round 26): newline-delimited JSON-RPC,
// initialize / tools/list / tools/call. Tools: notes_list, notes_read (read only), notes_write (changes things),
// notes_env (says whether FAKE_MCP_TOKEN reached it, never its value).
//   node dev/fake-mcp-server.js            # a working server
//   node dev/fake-mcp-server.js --crash    # stops at once with an error on stderr (the "doesn't start" path)
//   node dev/fake-mcp-server.js --mute     # never answers (the timeout path)
const argv = process.argv.slice(2);
if (argv.includes('--crash')) { process.stderr.write('fake-mcp: missing folder argument\n'); process.exit(2); }
const notes = { hello: 'Hello from the fake server.' };
const TOOLS = [
  { name: 'notes_list', description: 'List the note names.', inputSchema: { type: 'object', properties: {} } },
  { name: 'notes_read', description: 'Read one note.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, annotations: { readOnlyHint: true } },
  { name: 'notes_write', description: 'Write a note.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string' } }, required: ['name', 'text'] } },
  { name: 'notes_env', description: 'Whether the token setting reached the server.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
];
const send = (m) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
const text = (t) => ({ content: [{ type: 'text', text: t }] });
function call(name, a = {}) {
  if (name === 'notes_list') return text(Object.keys(notes).join(', '));
  if (name === 'notes_read') return notes[a.name] != null ? text(notes[a.name]) : { isError: true, ...text(`No note ${a.name}`) };
  if (name === 'notes_write') { notes[a.name] = String(a.text ?? ''); return text(`Saved ${a.name}`); }
  if (name === 'notes_env') return text(process.env.FAKE_MCP_TOKEN ? `token set (${process.env.FAKE_MCP_TOKEN.length} chars)` : 'no token');
  return { isError: true, ...text(`Unknown tool ${name}`) };
}
let buf = '';
process.stdin.on('data', (d) => {
  if (argv.includes('--mute')) return;
  buf += d;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id == null) continue; // notifications
    if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-notes', version: '1.0.0' } } });
    else if (m.method === 'tools/list') send({ id: m.id, result: { tools: TOOLS } });
    else if (m.method === 'tools/call') send({ id: m.id, result: call(m.params?.name, m.params?.arguments) });
    else send({ id: m.id, error: { code: -32601, message: `Unknown method ${m.method}` } });
  }
});
process.stdin.on('end', () => process.exit(0));
