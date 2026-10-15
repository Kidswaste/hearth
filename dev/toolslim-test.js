#!/usr/bin/env node
// (round 41, toolslim) Slimmer tool definitions, same abilities:
//   - the merged tools (chat_do, board_do, capture_do, apps_do) reach the hub under the old names, with the old args;
//   - help answers the details that left the lists, locally;
//   - opt-in tool sets sleep until needed (toolwake.js): first sighting, a week of use, words in the message, sticky per
//     engine session, a chat's own opt-in; end to end through engines.send + the fake Claude (its real --mcp-config).
// engines.js + store.js + mcp/ are copied to a temp folder (no real data).   node dev/toolslim-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const F = require('./fake-common');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolslim-test-'));
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'access-rules.js', 'context-core.js', 'toolwake.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data', 'kv'), { recursive: true });
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
const DAY = 86400000;

(async () => {
  // ---------- 1. the merged tools reach the hub under their own names ----------
  const seen = [];
  const hub = await new Promise((res) => { const sv = http.createServer((q, r) => { let b = ''; q.on('data', (x) => { b += x; }); q.on('end', () => { seen.push(JSON.parse(b)); r.end(JSON.stringify({ ok: true, value: 'ok' })); }); }); sv.listen(0, '127.0.0.1', () => res(sv)); });
  const info = path.join(dir, 'hub.json');
  fs.writeFileSync(info, JSON.stringify({ port: hub.address().port, token: 't' }));
  const client = (script, env = {}) => F.mcpClient({ command: process.execPath, args: [path.join(ROOT, 'mcp', script)], env: { HUB_BRIDGE_INFO: info, HUB_AGENT_ID: 'claude', ...env } });
  const last = () => seen.at(-1) || {};
  const CASES = [
    ['chat-mcp.js', { HUB_CHAT_LEAN: '1' }, 'chat_do', { op: 'open', path: '/tmp/x.html', how: 'preview' }, 'chat_open', { path: '/tmp/x.html', how: 'preview' }],
    ['chat-mcp.js', { HUB_CHAT_LEAN: '' }, 'chat_do', { op: 'show', caption: 'Variant A' }, 'chat_show', { caption: 'Variant A' }],
    ['chat-mcp.js', { HUB_CHAT_LEAN: '' }, 'chat_do', { op: 'second_opinion', question: 'ok?' }, 'chat_second_opinion', { question: 'ok?' }],
    ['board-mcp.js', {}, 'board_do', { op: 'list' }, 'board_list', {}],
    ['board-mcp.js', {}, 'board_do', { op: 'arrange', layout: 'grid' }, 'board_arrange', { layout: 'grid' }],
    ['board-mcp.js', {}, 'board_do', { op: 'watch', item: 'i2', mode: 'scenes' }, 'board_watch', { item: 'i2', mode: 'scenes' }],
    ['board-mcp.js', {}, 'board_do', { op: 'pins', query: 'dusk' }, 'board_do', { op: 'pins', query: 'dusk' }],
    ['capture-mcp.js', {}, 'capture_do', { op: 'start', size: '9:16', seconds: 5 }, 'capture_record', { action: 'start', size: '9:16', seconds: 5 }],
    ['capture-mcp.js', {}, 'capture_do', { op: 'tour', name: 'intro', dry: true }, 'capture_record', { action: 'tour', name: 'intro', dry: true }],
    ['capture-mcp.js', {}, 'capture_do', { op: 'list', kind: 'video' }, 'capture_list', { kind: 'video' }],
    ['apps-mcp.js', {}, 'apps_do', { op: 'page', app: 'suno', do: 'shot' }, 'apps_page', { app: 'suno', do: 'shot' }],
    ['apps-mcp.js', {}, 'apps_do', { op: 'meshy', prompt: 'a fox', draft: true }, 'meshy_generate', { prompt: 'a fox', draft: true }],
    ['apps-mcp.js', {}, 'apps_do', { op: 'meshy_status' }, 'meshy_status', {}],
  ];
  for (const [script, env, tool, args, real, want] of CASES) {
    const c = await client(script, env);
    const r = await c.call(tool, args);
    const got = last();
    const a = { ...got.args }; delete a.agentId; delete a.hubChatId;
    const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    check(!r.isError && got.tool === real && sorted(a) === sorted(want), `${tool} ${args.op} → the hub's ${real} ${JSON.stringify(a)}`);
    c.close();
  }
  // an unknown op of a dispatcher that has no hub side says which ops exist
  const cl = await client('chat-mcp.js', { HUB_CHAT_LEAN: '1' });
  const bad = await cl.call('chat_do', { op: 'nope' });
  check(bad.isError && /open/.test(bad.content[0].text), `chat_do unknown op: ${bad.content[0].text}`);
  check(cl.tools.map((t) => t.name).join(',') === 'chat_ask,chat_do', 'a plain chat lists chat_ask + chat_do');
  cl.close();
  const astra = await client('chat-mcp.js', { HUB_CHAT_ONLY: 'chat_open' });
  check(astra.tools.map((t) => t.name).join(',') === 'chat_open', 'Astra\'s lone chat_open stays its own tool');
  astra.close();
  hub.close();

  // ---------- 2. help: the details that left the lists come back, locally ----------
  for (const [script, tool, topic, re] of [['chat-mcp.js', 'chat_do', 'open', /Finder|reveal/], ['board-mcp.js', 'board_do', 'arrange', /masonry/], ['board-mcp.js', 'board_do', 'board_add', /credit/], ['capture-mcp.js', 'capture_do', 'capture_record', /tour/],
    ['capture-mcp.js', 'capture_do', 'list', /shot \| video/], ['apps-mcp.js', 'apps_do', 'page', /selector/], ['adobe-mcp.js', 'adobe_do', 'premiere', /FCP XML/], ['adobe-mcp.js', 'adobe_do', 'adobe_do', /mediaencoder: queue/], ['deploy-mcp.js', 'deploy_do', 'publish', /provider/]]) {
    const c = await F.mcpClient({ command: process.execPath, args: [path.join(ROOT, 'mcp', script)], env: { HUB_BRIDGE_INFO: path.join(dir, 'no-hub.json') } });
    const r = await c.call(tool, { help: topic, op: 'x', action: 'status' });
    check(!r.isError && re.test(r.content[0].text), `${tool} help ${topic} (${r.content[0].text.length} chars)`);
    c.close();
  }

  // ---------- 3. the lists are byte-stable (the same definitions every run) ----------
  const twice = [];
  for (let i = 0; i < 2; i += 1) { const c = await F.mcpClient({ command: process.execPath, args: [path.join(ROOT, 'mcp', 'board-mcp.js')] }); twice.push(JSON.stringify(c.tools)); c.close(); }
  check(twice[0] === twice[1], 'board list: the same bytes run after run');

  // ---------- 4. toolwake.js: who sleeps ----------
  const W = require(path.join(dir, 'toolwake.js'));
  const wf = path.join(dir, 'data', 'tool-wake-unit.json');
  W.setFile(wf);
  const now = Date.UTC(2026, 9, 14, 12);
  const ag = { id: 'c1', engine: 'claude', boardTools: true, adobeTools: true };
  let p = W.plan(ag, { text: 'hello', now });
  check(!p.sleep.length && p.sticky.join() === 'adobeTools,boardTools' && JSON.parse(fs.readFileSync(wf, 'utf8')).c1.boardTools === now, 'switched on just now (first sighting): awake for a week, noted');
  p = W.plan(ag, { text: 'hello', now: now + 8 * DAY });
  check(p.sleep.join() === 'boardTools,adobeTools' && !p.sticky.length, 'not used for 8 days: both sleep');
  p = W.plan(ag, { text: 'Use my mood board refs for this', now: now + 8 * DAY });
  check(p.sleep.join() === 'adobeTools' && p.sticky.join() === 'boardTools', 'the message names the board: it wakes, Adobe sleeps');
  p = W.plan(ag, { text: 'thanks!', session: { sets: p.sticky }, now: now + 8 * DAY });
  check(p.sleep.join() === 'adobeTools' && p.sticky.join() === 'boardTools', 'sticky: the same engine session keeps the board');
  W.noteTool('c1', 'mcp__adobe__adobe_do', now + 8 * DAY);
  p = W.plan(ag, { text: 'hello', now: now + 9 * DAY });
  check(p.sleep.join() === 'boardTools', 'a used set (Claude\'s mcp__adobe__…) stays awake for the week');
  W.noteTool('c1', 'board · board_vibe', now + 9 * DAY);
  check(!W.plan(ag, { text: 'hi', now: now + 10 * DAY }).sleep.length, 'Codex\'s "board · board_vibe" counts too');
  check(!W.plan({ id: 'c1', captureTools: true }, { text: 'hi', keep: ['captureTools'], now: now + 30 * DAY }).sleep.length, 'a chat\'s own /capture-tools on never sleeps');
  W.plan({ id: 'c1', boardTools: true }, { text: 'hi', base: { id: 'c1', boardTools: true }, now: now + 40 * DAY }); // Adobe switched off by the owner
  check(!W._test.log.c1.adobeTools && W.plan(ag, { text: 'hi', base: ag, now: now + 41 * DAY }).sleep.join() === 'boardTools', 'switched off, then on again later: a fresh week (the old date is forgotten)');
  check(W.setOfTool('mcp__apps__apps_do') === 'appsTools' && W.setOfTool('meshy_generate') === 'appsTools' && W.setOfTool('mcp__three__three_eval') === null && W.setOfTool('mcp__chat__chat_do') === null, 'tool names → sets (Lab / chat tools never)');
  for (const [k, yes, no] of [['boardTools', 'like my Pinterest references', 'make the vibe dreamier'], ['captureTools', 'take a screenshot of the Lab', 'make it 9:16 for TikTok'], ['adobeTools', 'send it to Photoshop', 'make it pop'], ['deployTools', 'publish this scene on Vercel', 'make it brighter'], ['appsTools', 'make a 3D model with Meshy', 'use the song']]) {
    check(W.WORDS[k].test(yes) && !W.WORDS[k].test(no), `${k}: "${yes}" wakes it, "${no}" doesn't`);
  }

  // ---------- 5. end to end: engines.send → the fake Claude's real --mcp-config ----------
  const engines = require(path.join(dir, 'engines.js'));
  engines.setEnginePaths({ claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') });
  // the board and Adobe were switched on long ago and not used for 10 days
  fs.writeFileSync(path.join(dir, 'data', 'tool-wake.json'), JSON.stringify({ claude: { boardTools: Date.now() - 10 * DAY, adobeTools: Date.now() - 10 * DAY } }));
  const agent = { id: 'claude', name: 'Claude', mode: 'native', engine: 'claude', boardTools: true, adobeTools: true };
  const turn = (text, session = {}) => new Promise((resolve) => {
    let out = '';
    engines.send({ agent, chatId: 'ts-1', session, text, options: {} }, (e) => {
      if (e.type === 'delta') out += e.text || '';
      if (e.type === 'done' || e.type === 'error') resolve({ end: e, servers: Object.keys(JSON.parse((out.match(/tools<<<(.*?)>>>/) || [])[1] || '{}')), session: e.session || {} });
    });
  });
  const t1 = await turn('toolsinfo hi there');
  check(t1.end.type === 'done' && t1.servers.join() === 'chat' && !t1.session.sets, `a message that needs neither: only the chat tools (${t1.servers.join(', ')})`);
  const t2 = await turn('toolsinfo pick colors from my board', t1.session);
  check(t2.servers.join() === 'chat,board' && (t2.session.sets || []).join() === 'boardTools', `"…my board": the board wakes (${t2.servers.join(', ')}), noted in the session`);
  const t3 = await turn('toolsinfo thanks, more pink', t2.session);
  check(t3.servers.join() === t2.servers.join(), `next message, same session: the same tool list (${t3.servers.join(', ')}; the cache holds)`);
  const t4 = await turn('toolsinfo export a PSD for Photoshop', t3.session);
  check(t4.servers.join() === 'chat,board,adobe' && (t4.session.sets || []).join() === 'adobeTools,boardTools', `Photoshop wakes Adobe too (${t4.servers.join(', ')})`);
  const t5 = await turn('toolsinfo new chat, hello');
  check(t5.servers.join() === 'chat', 'a new session starts asleep again');
  const plain = engines.buildPrompt(agent);
  check(/MOOD BOARD/.test(plain), 'the switches are unchanged (buildPrompt of the agent still has the board line)');

  return finish();
})().catch((e) => { console.error(e); fails.push(String(e)); finish(); });

function finish() {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
}
