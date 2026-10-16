// (round 53, directorgame) The Three Director play-tests a game in the ▶ Play window, end to end with a director chat's
// REAL MCP calls (fake Claude `mcp:` keyword → mcp/three-mcp.js → gamebridge → HubBridge → the lazy group directorgame →
// ▶ Play (its own window) → directorgamemain.js plays the input there):
//   - ONE call starts the test game (dev/fixtures/game-html: Coin Run, three.js), plays "click, hold W, jump, look left,
//     hold D" into its window, and answers with fps, where the player went, each step, state, errors, one picture
//   - the input reached the game (its keys, the player moved) and never Hearth (no key event in the hub window)
//   - the play-test ends with the reply (the game window closes); Esc in a script is refused before anything is sent
//   - a game the owner started is read-only: state yes, input no, never closed by the director
//   - steps and tokens of the play-test (dev/directorgame-test.js has the budgets on the fake game)
//   node dev/smoke.js --fake-engines --script dev/checks/directorgame.js --wait 6000 --check-timeout 300000
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const out = { steps: [], problems: [], measure: {} };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const GAME = '/tmp/hearth-gamemode/html/index.html';
const playing = async () => Boolean((await window.hub.game.state())?.playing);

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
Native.newChat(agent.id);
await wait(600);

// every play result, whole (the fake engine's reply line shows only its start)
const results = [];
HubBridge.onResult((c) => { if (c.tool === 'three_play') results.push(c); });
let hubKeys = 0;
addEventListener('keydown', () => { hubKeys += 1; }, true);
async function turn(calls) {
  const chatId0 = H.activeChat[agent.id];
  const n0 = HubBridge.log().length;
  await Native.send(agent.id, `mcp: ${JSON.stringify(calls)}`);
  await wait(50);
  await until(() => !Native.isBusy(H.activeChat[agent.id] || chatId0), 240000);
  await until(() => !HubBridge.log().some((e) => e.running), 5000);
  return { lines: (Native.current(agent.id).messages.at(-1)?.text || '').match(/^- three_\w+: .*$/gm) || [], log: HubBridge.log().slice(n0) };
}

// 1. one call: start, play, numbers, one picture
const t1 = await turn([['three_do', { cmd: 'play', game: GAME, script: 'click, hold W 1.5 s, jump, look left, hold D 1 s', shot: true }]]);
const r1 = results.at(-1);
const text = String(r1?.result?.value || r1?.result?.error || '');
out.result = text;
step(r1?.result?.ok && /^▶ .* started \(HTML build/.test(text), 'one call starts the HTML game in ▶ Play', text.split('\n')[0]);
step(/fps \d+ \(\d+ Hz\) · worst \d+ ms · \d+ stutters?/.test(text), 'fps vs the screen, the worst frame, stutters', text.match(/fps.*$/m)?.[0]);
const moved = Number(text.match(/\(moved ([\d.]+)\)/)?.[1] || 0);
step(/player [-\d.,]+ → [-\d.,]+/.test(text) && moved > 0.5, 'the player moved (W reached the game, read from window.__game)', text.match(/player.*$/m)?.[0]);
step(/keys seen [1-9]/.test(text) && /steps ✓ [1-9]/.test(text), 'the game saw the keys; steps judged', text.match(/steps.*$/m)?.[0]);
// (Xvfb has no window manager: the game's own pointer lock request is refused here, a real screen grants it)
const errs = text.match(/^errors: (\d+)/m)?.[1];
step((/errors: none/.test(text) || (errs === '1' && /pointer lock/.test(text))) && /picture \d+×\d+/.test(text) && (r1?.result?.images || []).length === 1, 'no errors (but Xvfb\'s pointer lock refusal); ONE small picture (asked)', text.match(/picture.*$/m)?.[0]);
step(hubKeys === 0, 'no key reached Hearth\'s own window', { hubKeys });
const entries = t1.log.filter((e) => e.tool !== 'three_seen');
out.measure.calls = entries.length;
out.measure.steps = entries.length + 1;
out.measure.resultTokens = entries.reduce((n, e) => n + (e.tokens || 0), 0);
step(entries.length === 1, `the whole play-test is ONE tool call (${entries.length + 1} steps), ≈ ${out.measure.resultTokens} result tokens`, entries.map((e) => e.tool));
step(await until(async () => !(await playing()), 10000), 'the reply ended → the play-test ended (the game window closed)');

// 2. Esc in a script: refused, nothing started or sent
const t2 = await turn([['three_do', { cmd: 'play', game: GAME, script: 'hold W 1 s, press escape' }]]);
step(/owner's key/.test(t2.lines[0] || '') && !(await playing()), 'Esc in a script: refused, no game started', t2.lines[0]?.slice(0, 160));

// 3. the owner's own game: read-only for the director
await GameMode.play(GameMode.resolve ? await GameMode.resolve(GAME) : { kind: 'html', path: GAME });
await until(playing, 30000);
await wait(2500);
const t3 = await turn([['three_do', { cmd: 'play', op: 'state' }], ['three_do', { cmd: 'play', script: 'hold W 1 s' }]]);
step(/three_do: .*▶ /.test(t3.lines[0] || '') && /owner is playing/.test(t3.lines[1] || ''), 'the owner\'s game: state read, no input sent', t3.lines.map((l) => l.slice(0, 120)));
step(await playing(), 'the owner\'s game is still playing after the director\'s reply');
await window.hub.game.leave();
await until(async () => !(await playing()), 8000);

out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
