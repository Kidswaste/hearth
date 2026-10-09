#!/usr/bin/env node
// The video editor's MCP tools as the CLIs see them (stdio JSON-RPC, no hub): the three video_edit tools are listed
// with lean descriptions, hearth_help knows the editor, and calls without a hub fail cleanly.
//   node dev/editor-mcp-test.js
const path = require('path');
const F = require('./fake-common');

const root = path.join(__dirname, '..');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const c = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'video-mcp.js')] });
  const names = c.tools.map((t) => t.name);
  for (const n of ['video_edit_read', 'video_edit_frame', 'video_edit']) check(names.includes(n), `${n} is listed`);
  const edit = c.tools.filter((t) => t.name.startsWith('video_edit'));
  const size = JSON.stringify(edit).length;
  check(size < 2200, `the editor tools stay lean: ${size} chars for 3 tools (≈${Math.round(size / 4)} tokens)`);
  check(/never footage/i.test(c.tools.find((t) => t.name === 'video_edit').description), 'video_edit says references are a vibe, never footage');
  check(!c.instructions, 'no MCP instructions');
  const h = await c.call('hearth_help', { topic: 'editor' });
  check(/THE VIDEO EDITOR/.test(h.content[0].text) && /video_edit_frame/.test(h.content[0].text), `hearth_help editor answered locally (${h.content[0].text.length} chars)`);
  const h2 = await c.call('hearth_help', { topic: 'timeline' });
  check(!/THE VIDEO EDITOR/.test(h2.content[0].text), 'the Lab keeps its own "timeline" topic');
  const r = await c.call('video_edit', { op: 'help' });
  check(r.isError && /hub|Hearth|connect/i.test(r.content[0].text), `without a hub a call fails cleanly: ${r.content[0].text.slice(0, 80)}`);
  c.close();
  const MAP = require(path.join(root, 'mcp', 'hearth-map.js'));
  check(MAP.topic('edit') === MAP.TOPICS.editor && MAP.topic('nle') === MAP.TOPICS.editor, 'aliases edit / nle reach the editor topic');
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
