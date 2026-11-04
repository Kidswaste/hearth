#!/usr/bin/env node
// (round 122, sendpath122) Sending, lighter on the main process. Plain Node, no app, no real data (engines.js and what it
// needs are copied to a temp folder).   node dev/sendpath122-test.js
//   1. The prompt cache: the cached build gives the SAME BYTES as the whole build (promptParts0, the code as it was),
//      parts and session side effects, across many setups and edits (personality, standing instructions, memory —
//      added / edited / relevant-only —, file access and folders appearing / going, a Hearth source folder (hearthCode,
//      datalock), connections and apps, the engine switched (a twin run), director lean / full / crew, the permission
//      tool dropped, lean / persona / helper runs) and a seeded random mix; the arguments a send gives (Claude's whole
//      command line, Astra's exec line and app-server thread) the same with the cache on and off; one build per send.
//   2. The MCP config file: reused while identical (no write), held per run, rewritten when it vanished.
//   3. The process helper (spawnhelper.js): the same env, cwd, stdin, streamed bytes (UTF-8 split across pieces, big
//      output), stderr, exit code and event order as a direct start; kill; a start refused (spawn threw); fallback to a
//      direct start when off, when the helper goes before confirming a start (the program runs once), the helper gone
//      after a start (ends as killed), two failures (direct from then on); and a whole engines.send turn through it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const { mkdtemp } = require('./tmp-own');
const dir = mkdtemp('sendpath122-');
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'macpolish.js', 'access-rules.js', 'datalock.js', 'connectionsmain.js', 'context-core.js', 'toolwake.js', 'twocomputers-core.js', 'codex-capabilities.js', 'codex-server.js', 'spawnhelper.js', 'spawnhelper-child.js', 'offline-core.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data', 'kv'), { recursive: true });
const MEM = path.join(dir, 'data', 'memory.json');
fs.writeFileSync(MEM, '{}');
const E = require(path.join(dir, 'engines.js'));
const T = E._test;
const Conn = require(path.join(dir, 'connectionsmain.js'));
let connections = [];
Conn.setReader(() => ({ connections: JSON.parse(JSON.stringify(connections)) }));

let passed = 0;
const fails = [];
const check = (ok, what) => { if (ok) passed += 1; else { fails.push(what); console.log(`✖ ${what}`); } };
const group = (what) => console.log(`✓ ${what}`);

// ---------- 1. the prompt cache: the same bytes ----------
const work = path.join(dir, 'work');
const folderA = path.join(work, 'projA'); const folderB = path.join(work, 'projB'); const later = path.join(work, 'later');
const src = path.join(work, 'hearth-src'); // a Hearth source folder (hearthCode, its data/ locked)
for (const d of [folderA, folderB, path.join(src, 'mcp')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(src, 'engines.js'), '//'); fs.writeFileSync(path.join(src, 'mcp', 'hearth-map.js'), '//');
const dataInside = path.join(dir, 'data', 'workspace', '..'); // the running copy's own data folder (datalock)

const sameRun = (agent, session) => {
  const s1 = JSON.parse(JSON.stringify(session || {})); const s2 = JSON.parse(JSON.stringify(session || {}));
  const cached = E.promptParts(agent, session ? s1 : null);
  const whole = T.promptParts0(agent, session ? s2 : null);
  return { ok: JSON.stringify(cached) === JSON.stringify(whole) && JSON.stringify(s1) === JSON.stringify(s2), cached, whole, s1 };
};
let steps = 0; let bad = 0;
const step = (label, agent, session = { id: 'sess-1' }) => {
  steps += 1;
  for (const sess of [session, null]) {
    const r = sameRun(agent, sess);
    if (!r.ok) { bad += 1; if (bad < 6) console.log(`  differs: ${label}\n   cached ${JSON.stringify(r.cached).slice(0, 400)}\n   whole  ${JSON.stringify(r.whole).slice(0, 400)}`); }
  }
};
const writeMem = (m) => fs.writeFileSync(MEM, JSON.stringify(m));
const rules = (n, on = true) => Array.from({ length: n }, (_, i) => ({ text: `Rule ${i}: always cite the file`, on }));
const CLAUDE = { id: 'claude', name: 'Claude', mode: 'native', engine: 'claude' };
const ASTRA = { id: 'astra', name: 'Astra', mode: 'native', engine: 'codex' };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', mode: 'native', engine: 'claude', dock: 'three', threeTools: true };
const runOf = (agent, options = {}, chatId = 'chat-1', text = 'hello') => T.runAgent(agent, { chatId, session: {}, text, options }).agent;

const editSeq = [];
const at = (label, fn) => editSeq.push([label, fn]);
// the same agents, edited one thing at a time (each step: cached vs whole, with and without a session)
at('plain Claude', () => step('plain', CLAUDE));
at('personality', () => step('personality', { ...CLAUDE, systemPrompt: 'You are terse.' }));
at('personality edited', () => step('personality 2', { ...CLAUDE, systemPrompt: 'You are warm.' }));
at('standing instructions', () => step('instructions', { ...CLAUDE, instructions: rules(3) }));
at('an instruction off', () => step('instructions off', { ...CLAUDE, instructions: [...rules(3), { text: 'off one', on: false }] }));
at('memory added', () => { writeMem({ shared: '- likes tea', agents: { claude: '- uses vim' } }); step('memory', CLAUDE); });
at('memory grew (frozen per session)', () => { writeMem({ shared: '- likes tea\n- lives in Paris', agents: { claude: '- uses vim' } }); step('memory grew', CLAUDE, { id: 'sess-1', mem: '- likes tea\n- uses vim' }); });
at('memory edited', () => { writeMem({ shared: '- likes coffee', agents: { claude: '- uses vim' } }); step('memory edited', CLAUDE, { id: 'sess-1', mem: '- likes tea\n- uses vim' }); });
at('memory big (relevant only)', () => { writeMem({ shared: Array.from({ length: 200 }, (_, i) => `- fact ${i} about the owner's projects`).join('\n') }); step('memory big', CLAUDE, { id: 'sess-1', mem: '- old' }); });
at('memory forced in', () => step('memory forced', { ...CLAUDE, memoryWhenRelevant: false }));
at('memory off (helper)', () => step('memory off', runOf(CLAUDE, { lean: true, helper: true })));
at('memory cleared', () => { writeMem({}); step('memory cleared', CLAUDE, { id: 'sess-1', mem: '- likes tea' }); });
at('folder (workspace)', () => step('workspace', { ...CLAUDE, workspace: folderA }));
at('folder gone', () => step('workspace gone', { ...CLAUDE, workspace: later }));
at('folder appears', () => { fs.mkdirSync(later, { recursive: true }); step('workspace appears', { ...CLAUDE, workspace: later }); });
at('folder gone again', () => { fs.rmSync(later, { recursive: true, force: true }); step('workspace gone again', { ...CLAUDE, workspace: later }); });
for (const level of ['read', 'write', 'full']) at(`access ${level}`, () => step(`access ${level}`, runOf(CLAUDE, { access: { level, folders: [folderA, folderB] } })));
at('access: a folder appears', () => { fs.mkdirSync(later, { recursive: true }); step('access appears', runOf(CLAUDE, { access: { level: 'write', folders: [folderA, later] } })); });
at('access: Hearth source (hearthCode + datalock)', () => step('hearth src', runOf(CLAUDE, { access: { level: 'full', folders: [src] } })));
at('access: the data folder itself', () => step('data folder', runOf(CLAUDE, { access: { level: 'write', folders: [path.resolve(dataInside)] } })));
at('access: the source folder stops being one', () => { fs.rmSync(path.join(src, 'engines.js')); step('src gone', runOf(CLAUDE, { access: { level: 'full', folders: [src] } })); fs.writeFileSync(path.join(src, 'engines.js'), '//'); });
at('permission tool dropped', () => { T.claudeDropped.add('--permission-prompt-tool'); step('dropped', runOf(CLAUDE, { access: { level: 'full', folders: [folderA] } })); T.claudeDropped.delete('--permission-prompt-tool'); step('back', runOf(CLAUDE, { access: { level: 'full', folders: [folderA] } })); });
at('Astra plain', () => step('astra', ASTRA));
at('Astra web + folder edit', () => step('astra web', { ...ASTRA, webSearch: 'live', workspace: folderA, codexFiles: 'edit' }));
at('Astra access (sandbox / no sandbox)', () => { step('astra acc', runOf(ASTRA, { access: { level: 'write', folders: [folderB] } })); step('astra open', runOf({ ...ASTRA, astraNoSandbox: true }, { access: { level: 'full', folders: [folderB] } })); });
at('Astra on Hearth source', () => step('astra src', runOf(ASTRA, { access: { level: 'write', folders: [src] } })));
at('engine switch (a twin run)', () => { step('twin claude→astra', runOf(DIRECTOR, { engine: 'codex' })); step('twin astra→claude', runOf({ ...ASTRA, threeTools: true }, { engine: 'claude' })); });
at('director lean / full / crew / nodes off', () => { step('lean', runOf(DIRECTOR)); step('full', runOf({ ...DIRECTOR, toolMode: 'full' })); step('crew', runOf(DIRECTOR, { crew: true })); step('nodes off', runOf({ ...DIRECTOR, nodesTool: false, crewOn: true }, { crewOn: true })); });
at('director undocked on Astra', () => step('astra director', runOf({ ...ASTRA, threeTools: true, hubTools: true })));
at('tool sets (board, apps, capture, game)', () => step('sets', runOf({ ...CLAUDE, boardTools: true, appsTools: true, captureTools: true, gameTools: true, progressTag: true, dock: 'board' })));
at('apps (connectors) and Astra apps', () => { step('connectors', { ...CLAUDE, connectors: { gmail: 'read' } }); step('chatgpt apps', { ...ASTRA, chatgptApps: true }); });
at('connections on / off', () => { connections = [{ id: 'k1', name: 'Notes', command: 'node', args: ['x.js'], env: { TOKEN: 'secret' } }]; step('conn none for agent', { ...CLAUDE, chatTools: false }); step('conn on', { ...CLAUDE, chatTools: false, connections: { k1: 'read' } }); connections = []; step('conn removed', { ...CLAUDE, chatTools: false, connections: { k1: 'read' } }); });
at('lean / persona / answer length', () => { step('lean', runOf(DIRECTOR, { lean: true })); step('persona', runOf(CLAUDE, { persona: 'You are a critic.' })); step('short', { ...CLAUDE, verbosity: 'low' }); step('detailed', { ...CLAUDE, verbosity: 'high' }); });
at('visual review', () => step('visual review', runOf({ ...CLAUDE, workspace: folderA }, { visualReview: true })));
for (const [label, fn] of editSeq) { try { fn(); } catch (e) { bad += 1; console.log(`  ${label}: threw ${e.message}`); } }
// a seeded random mix: each agent asked twice (a miss, then a hit), with memory changing under it
let seed = 122;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
for (let i = 0; i < 300; i++) {
  if (i % 25 === 0) writeMem(pick([{}, { shared: `- fact ${i}` }, { shared: '- a', agents: { a1: '- b' }, places: { lab: '- c' } }]));
  const base = { id: pick(['a1', 'a2']), name: pick(['Ada', 'Three Director']), mode: 'native', engine: pick(['claude', 'codex']) };
  const agent = { ...base };
  for (const k of ['threeTools', 'boardTools', 'gameTools', 'chatTools', 'suggestNext', 'autoMemory', 'selfReview', 'progressTag', 'nodesTool', 'chatgptApps', 'hubTools', 'openTool', 'memoryWhenRelevant']) if (rnd() < 0.3) agent[k] = rnd() < 0.6;
  if (rnd() < 0.3) agent.dock = pick(['three', 'board']);
  if (rnd() < 0.3) agent.toolMode = pick(['full', 'crew', 'lean']);
  if (rnd() < 0.3) agent.systemPrompt = pick(['Be brief.', 'Be kind.']);
  if (rnd() < 0.3) agent.instructions = rules(Math.floor(rnd() * 4));
  if (rnd() < 0.2) agent.workspace = pick([folderA, later, src]);
  if (rnd() < 0.2) agent.webSearch = pick(['live', 'cached', 'disabled']);
  if (rnd() < 0.2) agent.verbosity = pick(['low', 'high', 'medium']);
  const options = rnd() < 0.4 ? { access: { level: pick(['off', 'read', 'write', 'full']), folders: [pick([folderA, src, later])] } } : {};
  if (rnd() < 0.15) options.engine = pick(['claude', 'codex']);
  const run = runOf(agent, options, pick(['c1', 'c2']));
  step(`random ${i}`, run, pick([{ id: 's' }, {}, { id: 's', mem: '- fact 0' }]));
  step(`random ${i} again`, run, { id: 's' });
}
const st = T.promptStats;
check(bad === 0, `cached prompt = the whole build, byte for byte (${steps} steps × with / without a session: ${bad} differ)`);
check(st.hits > 300 && st.misses > 50, `the cache was used (hits ${st.hits}, misses ${st.misses}, kept ${st.size} ≤ 32)` );
check(st.size <= 32, 'the cache stays small');
// the arguments a send gives, cache on vs off (the session id / MCP file names aside)
const norm = (args) => args.map((x, i) => (args[i - 1] === '--session-id' ? '<id>' : args[i - 1] === '--mcp-config' ? `<mcp ${fs.readFileSync(x, 'utf8')}>` : x));
const argCases = [runOf(DIRECTOR, {}, 'c9'), runOf(CLAUDE, { access: { level: 'full', folders: [src] } }, 'c9'), { ...CLAUDE, systemPrompt: 'Hi', instructions: rules(2) }];
writeMem({ shared: '- likes tea' });
let argsSame = true;
for (const a of argCases) {
  const on1 = norm(T.claudeArgs(a, { id: 'x' }, {})); const on2 = norm(T.claudeArgs(a, { id: 'x' }, {}));
  T.promptCache(false); const off = norm(T.claudeArgs(a, { id: 'x' }, {})); T.promptCache(true);
  if (JSON.stringify(on1) !== JSON.stringify(off) || JSON.stringify(on2) !== JSON.stringify(off)) argsSame = false;
}
for (const a of [runOf({ ...ASTRA, threeTools: true, hubTools: true }, {}, 'c9'), runOf(ASTRA, { access: { level: 'write', folders: [src] } }, 'c9')]) {
  const on = [JSON.stringify(T.codexArgs(a, {}, {})), JSON.stringify(T.codexServerPlan(a, { id: 'x' }, {}).thread)];
  T.promptCache(false); const off = [JSON.stringify(T.codexArgs(a, {}, {})), JSON.stringify(T.codexServerPlan(a, { id: 'x' }, {}).thread)]; T.promptCache(true);
  if (on[0] !== off[0] || on[1] !== off[1]) argsSame = false;
}
check(argsSame, 'the command lines and Astra\'s thread are the same with the cache on and off');
// one build per send: Astra's server plan asked for the prompt three times, built once
{ const before = T.promptStats; T.codexServerPlan(runOf(ASTRA, { access: { level: 'write', folders: [folderA] } }, 'c10'), { id: 'y' }, {}); const after = T.promptStats; check(after.hits + after.misses - before.hits - before.misses === 1, 'Astra\'s app-server plan builds its prompt once (it asked three times)'); }
group('1. prompt cache: the same bytes across setups and edits');

// ---------- 2. the MCP config file ----------
{
  const mf = (a) => a[a.indexOf('--mcp-config') + 1];
  const a = { ...DIRECTOR, hubChatId: 'cm' };
  const f1 = mf(T.claudeArgs(a, {}, {}));
  const m1 = fs.statSync(f1).mtimeMs; const ino = fs.statSync(f1).ino;
  const f2 = mf(T.claudeArgs(a, {}, {}));
  check(f1 === f2 && fs.statSync(f2).ino === ino && fs.statSync(f2).mtimeMs === m1 && T.mcpRuns.get(f1).n === 2, 'an identical MCP config is reused (not written again) and held by both runs');
  T.releaseMcpFile(f1); T.releaseMcpFile(f2);
  check(fs.existsSync(f1) && T.mcpRuns.get(f1).n === 0, 'let go by both: kept a while for the chat\'s next message');
  fs.rmSync(f1);
  const f3 = mf(T.claudeArgs(a, {}, {}));
  check(f3 === f1 && fs.existsSync(f3), 'a file that vanished is written again');
  const f4 = mf(T.claudeArgs({ ...a, boardTools: true }, {}, {}));
  check(f4 !== f1, 'a different setup: its own file');
  check(!/secret/.test(E.buildPrompt({ ...CLAUDE, connections: { k1: 'read' } })), 'no connection secret in a prompt');
  group('2. the MCP config file: reused while identical');
}

// ---------- 3. the process helper ----------
const S = require(path.join(dir, 'spawnhelper.js'));
const H = S._test;
const PROBE = `
const fs = require('fs');
if (process.env.SP_MARK) fs.appendFileSync(process.env.SP_MARK, 'ran\\n');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', async () => {
  process.stdout.write(JSON.stringify({ env: process.env.SP_VAL, cwd: process.cwd(), input, helperEnv: process.env.ELECTRON_RUN_AS_NODE || null }) + '\\n');
  const euro = Buffer.from('€', 'utf8');
  process.stdout.write(euro.subarray(0, 1)); await new Promise((r) => setTimeout(r, 30)); process.stdout.write(Buffer.concat([euro.subarray(1), Buffer.from('\\n')]));
  process.stdout.write('x'.repeat(+process.env.SP_BIG || 0) + '\\n');
  process.stderr.write('warn: something\\n');
  if (process.env.SP_HANG) { setInterval(() => {}, 1000); return; }
  process.exitCode = +process.env.SP_CODE || 0;
});`;
const probe = path.join(dir, 'probe.js');
fs.writeFileSync(probe, PROBE);
function run(spawnFn, { env = {}, input = 'héllo wörld\n', killAfter = 0, cwd = folderA, preKill = false } = {}) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, SP_VAL: 'v-122', ...env };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    const child = spawnFn(process.execPath, [probe], { cwd, windowsHide: true, env: childEnv });
    const order = []; let out = ''; let err = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; if (!order.includes('data')) order.push('data'); });
    child.stderr.on('data', (d) => { err += d; });
    child.stdin.on('error', () => order.push('stdin-error'));
    child.on('error', (e) => { order.push(`error:${e.code || e.message}`); if (e.hearthThrown) resolve({ order, out, err, child, threw: e }); });
    child.on('exit', (code, signal) => order.push(`exit:${code}:${signal}`));
    child.on('close', (code, signal) => { order.push(`close:${code}:${signal}`); resolve({ order, out, err, child }); });
    child.stdin.end(input);
    if (preKill) child.kill();
    if (killAfter) setTimeout(() => child.kill(), killAfter);
  });
}
const strip = (r) => ({ order: r.order, out: r.out, err: r.err });
(async () => {
  // parity: env, cwd, stdin, bytes (a character split across pieces), big output, stderr, exit code, event order
  for (const env of [{ SP_CODE: '7' }, { SP_BIG: String(3 << 20) }, {}]) {
    const direct = await run(cp.spawn, { env });
    const viaHelper = await run(S.spawn, { env });
    check(viaHelper.child.hearthHelper === true, 'started through the helper');
    check(JSON.stringify(strip(direct)) === JSON.stringify(strip(viaHelper)), `the same as a direct start: env, cwd, input, every byte, stderr, exit, order (${JSON.stringify(env)})`);
  }
  const r0 = await run(S.spawn);
  const seen = JSON.parse(r0.out.split('\n')[0]);
  check(seen.env === 'v-122' && seen.cwd === folderA && seen.input === 'héllo wörld\n' && seen.helperEnv === null && r0.out.includes('€\n'), 'the program got its env (not the helper\'s ELECTRON_RUN_AS_NODE), cwd and input; € split in two pieces arrives whole');
  // kill: a running program, and a kill before the start was confirmed
  const k1 = await run(cp.spawn, { env: { SP_HANG: '1' }, killAfter: 300 });
  const k2 = await run(S.spawn, { env: { SP_HANG: '1' }, killAfter: 300 });
  check(k2.child.hearthHelper && JSON.stringify(k1.order) === JSON.stringify(k2.order) && k2.child.signalCode === 'SIGTERM' && k2.child.exitCode === null && k2.child.killed, `kill(): ended by SIGTERM, as a direct start (${k2.order.join(' ')})`);
  const k3 = await run(S.spawn, { env: { SP_HANG: '1' }, preKill: true });
  check(k3.child.signalCode === 'SIGTERM' && !k3.out, 'a kill before the start was confirmed: the program never got its input and was stopped');
  // a start refused (spawn threw): said through 'error' (hearthThrown), no exit / close
  const bad = await new Promise((resolve) => { const c = S.spawn(process.execPath, [probe], { cwd: folderA, env: { ...process.env, BAD: 'a\u0000b' } }); c.on('error', (e) => resolve(e)); c.on('close', () => resolve(null)); c.stdin.end(''); });
  check(bad && bad.hearthThrown && /null bytes|ERR_INVALID_ARG_VALUE/i.test(`${bad.message} ${bad.code}`), `a start the system refuses comes as an error, as a direct start's throw (${bad?.code || bad?.message})`);
  // fallback: switched off
  S.configure({ on: false });
  const off = await run(S.spawn);
  check(!off.child.hearthHelper && JSON.stringify(strip(off)) === JSON.stringify(strip(r0)), 'switched off: a direct start, the same result');
  S.configure({ on: true });
  // fallback: the helper gone before it confirmed a start → started directly, run ONCE
  const mark = path.join(dir, 'mark.txt');
  H.reset(); S.warm();
  await new Promise((r) => setTimeout(r, 300));
  const p = run(S.spawn, { env: { SP_MARK: mark } });
  H.failed('test: gone before the confirmation');
  const fb = await p;
  await new Promise((r) => setTimeout(r, 300));
  check(fb.out.includes('"v-122"') && fb.order.at(-1) === 'close:0:null' && fs.readFileSync(mark, 'utf8') === 'ran\n', `the helper gone before confirming: started directly, ran once (${JSON.stringify(fs.readFileSync(mark, 'utf8'))})`);
  check(S.stats().fallbacks >= 1, 'counted as a fallback');
  // the helper gone after a start: the program is stopped, the run ends as killed
  const pa = run(S.spawn, { env: { SP_HANG: '1' } });
  await new Promise((r) => setTimeout(r, 400));
  const pid = [...H.live.values()][0]?.pid;
  H.helper?.kill('SIGKILL');
  const gone = await pa;
  await new Promise((r) => setTimeout(r, 200));
  let alive = false; try { process.kill(pid, 0); alive = !/\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { /* gone (or no /proc: signalled) */ } // (a zombie, reparented where nothing reaps it, is gone)
  check(gone.order.at(-1) === 'close:null:SIGKILL' && pid && !alive, `pid ${pid} alive ${alive} ` + `the helper gone after a start: ends as killed, the program stopped (${gone.order.join(' ')})`);
  // two failures: direct from then on
  check(!S.usable() && !(await run(S.spawn)).child.hearthHelper, 'two helper failures: direct starts from then on');
  H.reset();
  // a whole engines.send turn (the fake Claude) through the helper
  E.setEnginePaths({ claude: path.join(__dirname, 'fake-claude-astra.js') });
  const before = E.spawnHelper();
  const turn = await new Promise((resolve) => {
    const evs = [];
    E.send({ agent: { ...CLAUDE, chatTools: true }, chatId: 'sp-1', session: {}, text: 'hello', options: {} }, (e) => { evs.push(e); if (!['delta', 'tool', 'thinking', 'progress'].includes(e.type)) resolve({ end: e, text: evs.filter((x) => x.type === 'delta').map((x) => x.text).join('') }); });
  });
  const after = E.spawnHelper();
  check(turn.end.type === 'done' && turn.text.length > 0 && after.helper > before.helper, `engines.send: a whole Claude turn through the helper (${turn.end.type}, helper starts ${before.helper} → ${after.helper})`);
  // stop through the helper
  const stopped = await new Promise((resolve) => {
    process.env.FAKE_CLAUDE_SLOW = '1';
    E.send({ agent: { ...CLAUDE }, chatId: 'sp-2', session: {}, text: 'SLOW please', options: {} }, (e) => { if (!['delta', 'tool', 'thinking', 'progress'].includes(e.type)) resolve(e); });
    setTimeout(() => E.stop('sp-2'), 400);
  });
  delete process.env.FAKE_CLAUDE_SLOW;
  check(['stopped', 'done'].includes(stopped.type), `Stop through the helper ends the reply (${stopped.type})`);
  group('3. the process helper: the same as a direct start; fallbacks');
  S.stop();
  if (fails.length) { console.log(`\n${fails.length} failed, ${passed} passed`); process.exit(1); }
  console.log(`\nsendpath122-test: all passed (${passed} checks)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
