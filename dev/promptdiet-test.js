#!/usr/bin/env node
// (round 46, promptdiet) The fixed cost of every message, locked in: per case (dev/promptdiet-measure.js) a budget just
// above what round 46 left; the prompts byte-stable; nothing lost (the help that took the moved words answers; the two
// tools that left the Director's lean list are three_do commands; Forge's globals come back with help); a runaway
// tool result is cut with the rest one {more: true} away; and only the owner's own words wake a sleeping tool set.
// engines.js + store + mcp/ are copied to a temp folder (no real data).   node dev/promptdiet-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const F = require('./fake-common');
const M = require('./promptdiet-measure');

const ROOT = path.join(__dirname, '..');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
const tok = (s) => Math.round(String(s || '').length / 4);

// Per-message ceilings (prompt + tool definitions as the engines name them + Hearth's own text in the message).
// Before round 46: claude 333, astra 177, director 2476, directorFull 9785, directorAstra 2476, forge 1530, swarm 53,
// keepGoing 2506. Raise one only on purpose (an opt-in the owner asked for), never to make a growth pass.
const BUDGET = { claude: 305, astra: 165, director: 2170, directorFull: 9150, directorAstra: 2170, forge: 1195, swarmClaude: 50, swarmAstra: 50, keepGoing: 2200 };

(async () => {
  // ---------- 1. budgets, byte-stable ----------
  const rows = M.measure();
  for (const r of rows) check(r.total <= BUDGET[r.key], `${r.label}: ${r.total} ≤ ${BUDGET[r.key]} tokens a message (prompt ${r.prompt}, tools ${r.tools}, message ${r.message})`);
  const again = M.measure();
  check(rows.every((r, i) => r.text === again[i].text && r.tools === again[i].tools), 'the same prompts and tool lists, byte for byte, measured twice (the prompt cache holds)');
  check(!/\b\d{4}-\d\d-\d\d\b|\b\d\d:\d\d\b/.test(rows.map((r) => r.text).join('\n').replace(/\d\d:\d\d:\d\d:\d\d/g, '')), 'no dates or times in any prompt (the guide\'s timecode example aside)');
  const row = (k) => rows.find((r) => r.key === k);
  // ---------- 2. nothing said twice, nothing lost ----------
  const lean = row('director').text; const full = row('directorFull').text;
  check((lean.match(/You are /g) || []).length === 1 && (full.match(/You are /g) || []).length === 1, 'one "You are…" line in lean and full');
  check(/ONE LAYER PER EFFECT/.test(lean) && /SLIDERS \(always\)/.test(lean) && /TIME FIRST/.test(lean) && /WORK LOOP/.test(lean) && /NODES \(the owner/.test(lean) && /HEARTH \(the owner's app/.test(lean), 'lean Director: every rule of the core guide is there');
  check(!/You turn the user's descriptions into three\.js scenes/.test(full) && /ONE LAYER PER EFFECT/.test(full) && /MUSIC \(when the owner wants it/.test(full) && /three_<cmd>/.test(full) && /three_help/.test(full), 'full Director: the whole guide once, no second how-to that repeated it; three_do names map to its tools');
  check(/forge_eval \{help: "globals"\}/.test(row('forge').text) && !/kes_drone/.test(row('forge').text) && tok(row('forge').text) < 420, `Forge: the short rules in the prompt (${tok(row('forge').text)} tokens), the globals on demand`);
  check(/<remember>/.test(row('claude').text) && /<suggest>/.test(row('claude').text) && /<remember>/.test(row('astra').text), 'the habit lines are still there (shorter)');
  check(!/<remember>|<suggest>/.test(row('swarmClaude').text) && /no tools/.test(row('swarmClaude').text), 'a mission helper: its role and "no tools" only');

  const noHub = { HUB_BRIDGE_INFO: path.join(os.tmpdir(), 'promptdiet-no-hub.json') };
  const three = await F.mcpClient({ command: process.execPath, args: [path.join(ROOT, 'mcp', 'three-mcp.js')], env: { ...noHub, HUB_TOOL_MODE: '', HUB_NODES_TOOL: '1' } });
  const names = three.tools.map((t) => t.name);
  const doT = three.tools.find((t) => t.name === 'three_do');
  check(!names.includes('three_input') && !names.includes('three_contact_sheet') && /contact_sheet/.test(doT.description) && /input \{actions\}/.test(doT.description), 'three_input / three_contact_sheet: three_do commands in the lean list');
  for (const [topic, re] of [['input', /three_input \(lean: three_do input\).*\nargs: actions, screenshot/s], ['contact_sheet', /three_contact_sheet \(lean: three_do contact_sheet\).*args: times, count/s], ['eval', /args: code, max, samples, every/], ['screenshot', /args: size, region, at, compare, frames, gap, force/], ['media_control', /args: action, time, end, frame, n, see/]]) {
    const r = await three.call('three_do', { cmd: 'help', topic });
    check(re.test(r.content[0].text), `help ${topic}: every arg the lean schema leaves to the words`);
  }
  check(three.tools.find((t) => t.name === 'three_read_code').inputSchema.properties.force && three.tools.find((t) => t.name === 'three_edit_code').inputSchema.properties.shot, 'the args a typical call uses stay in the schema (read_code force, edit_code shot)');
  three.close();
  const forge = await F.mcpClient({ command: process.execPath, args: [path.join(ROOT, 'mcp', 'forge-game-mcp.js')], env: noHub });
  const g = await forge.call('forge_eval', { help: 'globals' });
  check(!g.isError && /spawnFoe/.test(g.content[0].text) && /__fhDbg/.test(g.content[0].text) && /kes_drone/.test(g.content[0].text), `forge_eval {help: "globals"}: the whole reference, locally (${g.content[0].text.length} chars)`);
  check(/size: "large"/.test(forge.tools.find((t) => t.name === 'forge_screenshot').description), 'forge_screenshot: small by default, large on request');
  forge.close();

  // ---------- 3. a runaway result is cut, the rest one {more: true} away ----------
  const BIG = Array.from({ length: 900 }, (_, i) => `line ${i} ${'x'.repeat(40)}`).join('\n'); // ≈ 44k chars
  const seen = [];
  const hub = await new Promise((res) => { const sv = http.createServer((q, r) => { let b = ''; q.on('data', (x) => { b += x; }); q.on('end', () => { const c = JSON.parse(b); seen.push(c.tool); r.end(JSON.stringify({ ok: true, value: c.args.code === 'small' ? 'ok' : BIG })); }); }); sv.listen(0, '127.0.0.1', () => res(sv)); });
  const info = path.join(os.tmpdir(), `promptdiet-hub-${process.pid}.json`);
  fs.writeFileSync(info, JSON.stringify({ port: hub.address().port, token: 't' }));
  const fc = await F.mcpClient({ command: process.execPath, args: [path.join(ROOT, 'mcp', 'forge-game-mcp.js')], env: { HUB_BRIDGE_INFO: info } });
  const a1 = (await fc.call('forge_eval', { code: 'S' })).content[0].text;
  check(a1.length < 6200 && /more characters cut \(forge_eval \{more: true\}/.test(a1) && /^line 0 /.test(a1), `forge_eval's 44k-char answer: ${a1.length} chars sent, the rest waits`);
  let got = a1.replace(/\n… \d+ more characters cut.*$/, ''); let parts = 1; let calls = seen.length;
  for (let i = 0; i < 20; i += 1) {
    const t = (await fc.call('forge_eval', { more: true })).content[0].text;
    parts += 1;
    got += `\n${t.replace(/\n… \d+ more characters cut.*$/, '')}`;
    if (!/more characters cut/.test(t)) break;
  }
  check(got === BIG && seen.length === calls, `{more: true} sends the rest in ${parts} parts, nothing runs again in the game (${seen.length} hub calls)`);
  await fc.call('forge_eval', { code: 'small' });
  calls = seen.length;
  const m2 = (await fc.call('forge_eval', { more: true })).content[0].text;
  check(/Nothing more/.test(m2) && seen.length === calls, 'after a whole answer, {more: true} says there is nothing more');
  fc.close();
  const tc = await F.mcpClient({ command: process.execPath, args: [path.join(ROOT, 'mcp', 'three-mcp.js')], env: { HUB_BRIDGE_INFO: info, HUB_TOOL_MODE: '' } });
  const t1 = (await tc.call('three_eval', { code: 'big' })).content[0].text;
  check(t1.length > 15000 && t1.length < 16200, `other servers cut at ≈ 16k chars (≈ 4k tokens): ${t1.length}`);
  tc.close(); hub.close(); fs.rmSync(info, { force: true });

  // ---------- 4. only the owner's own words wake a sleeping tool set ----------
  const W = require(path.join(ROOT, 'toolwake.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptdiet-wake-'));
  W.setFile(path.join(dir, 'tool-wake.json'));
  const DAY = 86400000; const now = Date.UTC(2026, 9, 15, 12);
  fs.writeFileSync(path.join(dir, 'tool-wake.json'), JSON.stringify({ c1: { boardTools: now - 10 * DAY, captureTools: now - 10 * DAY } }));
  W._test.reset();
  const ag = { id: 'c1', engine: 'claude', boardTools: true, captureTools: true };
  const asleep = (text) => W.plan(ag, { text, now }).sleep.sort().join();
  const both = 'boardTools,captureTools';
  check(asleep('make it pinker\n\n[Memory, approved by the user: I use the Lab sequence as my video timeline; I keep my refs on the board]') === both, 'saved facts that ride along (video, board) wake nothing');
  check(asleep('render it again\n\n[Hearth context: Lab sequence "Intro"; last video /Users/me/Hearth/Captures/take.mp4]') === both, 'a [Hearth context: …] line wakes nothing');
  check(asleep('Here is our earlier conversation. Continue it naturally.\n\n<earlier_conversation>\nUser: take a screenshot of my board\n</earlier_conversation>\n\nthanks!') === both, 'the earlier conversation of a resumed chat wakes nothing');
  check(asleep('look at this\n\n[Attached files, open them with your Read tool]\n/Users/me/Recordings/clip.mov\n\n<file name="notes.txt">\nfootage, frames, board references\n</file>') === both, 'attached files\' text and paths wake nothing');
  check(asleep('[Make “Intro” · this room: video (2 of 3: scene → video → post)]\nmake the glow softer') === both, 'a make\'s room line wakes nothing');
  check(asleep(M.KEEP_GOING) === both && asleep('[Mission: plan first. Don\'t do it yet.]\n\nnew intro') === both, 'a 🔁 Keep going round and a mission note wake nothing');
  check(asleep('take a screenshot of the Lab') === 'boardTools' && asleep('use my mood board for this\n\n[Memory, approved by the user: hi]') === 'captureTools', 'the owner\'s own words still wake their set at once');
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
