#!/usr/bin/env node
// The capture MCP server the way the CLIs start it (stdio JSON-RPC): its tool list and cost, no instructions, frame
// reading straight from a file when Hearth isn't running (with pictures both engines can see), clean errors, and the
// opt-in wiring in engines.js (per chat / per agent, Claude and Codex).   node dev/capture-mcp-test.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('./fake-common');

const root = path.join(__dirname, '..');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-capmcp-'));
  const video = path.join(dir, 'ref clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  // no data/game-bridge.json for this server: it behaves as if Hearth were closed
  const c = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'capture-mcp.js')], env: { HUB_CHAT_ID: 'test-chat' } });
  const names = c.tools.map((t) => t.name);
  check(names.join(',') === 'capture_shot,capture_record,capture_frames,capture_list', `tools: ${names.join(', ')}`);
  check(!c.instructions, 'no MCP instructions (guides live in the prompt / the app map)');
  const cost = require(path.join(root, 'mcp', 'cost.js')).measure('captureTools');
  check(cost.total < 560, `tool list ≈ ${cost.total} tokens`);
  const shot = await c.call('capture_shot', { target: 'tool' });
  check(shot.isError && /not running|Couldn't reach/i.test(shot.content[0].text), `shot without Hearth: clean error (${shot.content[0].text.slice(0, 60)})`);
  const info = await c.call('capture_frames', { path: video, mode: 'info' });
  check(!info.isError && /fps: 25/.test(info.content[0].text) && /frames: 100/.test(info.content[0].text), 'frames info from the file (no hub)');
  const at = await c.call('capture_frames', { path: video, mode: 'at', times: [1, '00:00:02:10'], frames: [7] });
  const imgs = at.content.filter((x) => x.type === 'image');
  const text = at.content.find((x) => x.type === 'text')?.text || '';
  check(!at.isError && imgs.length === 3 && imgs.every((i) => i.mimeType === 'image/jpeg' && i.data.length > 1000), `at: 3 pictures inline (${imgs.map((i) => i.data.length).join(', ')} b64 chars)`);
  check(/f7 /.test(text) && /f25 /.test(text) && /f60 /.test(text) && /00:00:02:10/.test(text), `at: exact frames 7, 25 (1 s) and 60 (2 s + 10 frames): ${text.split('\n').map((l) => l.split('→')[0].trim()).join(' | ')}`);
  const sheet = await c.call('capture_frames', { path: video, mode: 'sheet' });
  check(!sheet.isError && sheet.content.filter((x) => x.type === 'image').length === 1, 'sheet: one picture');
  const every = await c.call('capture_frames', { path: video, mode: 'every', every: 10 });
  check(!every.isError && every.content.filter((x) => x.type === 'image').length === 1 && (every.content.find((x) => x.type === 'text').text.match(/→/g) || []).length === 10, 'every 10 frames: 10 frames listed, one sheet shown');
  const quiet = await c.call('capture_frames', { path: video, mode: 'at', times: [0.5], see: false });
  check(!quiet.isError && !quiet.content.some((x) => x.type === 'image'), 'see: false sends no picture');
  const motion = await c.call('capture_frames', { path: video, mode: 'motion' });
  check(!motion.isError && /average/.test(motion.content[0].text), 'motion without the hub');
  const last = await c.call('capture_frames', { path: 'last', mode: 'sheet' });
  check(last.isError && /full path/.test(last.content[0].text), '"last" needs Hearth: clear message');
  const missing = await c.call('capture_frames', { path: path.join(dir, 'nope.mp4'), mode: 'info' });
  check(missing.isError, 'missing file: error');
  c.close();

  // engines: opt-in only
  const E = require(path.join(root, 'engines.js'))._test;
  const claude = { id: 'claude', name: 'Claude', engine: 'claude', mode: 'native' };
  check(!E.hubToolsets(claude).includes('captureTools'), 'off by default for a plain Claude agent');
  check(!E.hubToolsets({ id: 'td', engine: 'claude', dock: 'three', threeTools: true }).includes('captureTools'), 'off by default for the Three Director (token frugality)');
  check(E.hubToolsets({ ...claude, captureTools: true }).includes('captureTools'), 'on with agent.captureTools');
  const cx = E.codexArgs({ id: 'astra', name: 'Astra', engine: 'codex', mode: 'native', captureTools: true, hubChatId: 'c1' }, {}, {}).join(' ');
  check(/mcp_servers\.capture\.command=/.test(cx) && /mcp_servers\.capture\.tool_timeout_sec=2700/.test(cx) && /capture-mcp\.js/.test(cx), 'Astra (Codex) gets the capture server with a long tool timeout');
  const src = fs.readFileSync(path.join(root, 'engines.js'), 'utf8');
  check(/options\.captureTools && !options\.lean/.test(src), 'per-chat opt-in (options.captureTools) wired in send(), never for lean runs');
  const nat = fs.readFileSync(path.join(root, 'native.js'), 'utf8');
  check(/chat\.captureTools \? \{ captureTools: true \}/.test(nat), 'native.js passes the chat\'s opt-in');
  const map = require(path.join(root, 'mcp', 'hearth-map.js'));
  check(/CAPTURE/.test(map.topic('capture')) && map.topic('frames') === map.topic('capture'), 'app map: capture topic (+ aliases)');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
