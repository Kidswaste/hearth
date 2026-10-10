// Progress bars (round 11, progress*.js), driven like a user with the fake engines: a slow reply that calls a tool,
// thinks and says how far it is with hidden <progress> tags → a bar on the reply (with "about N %"), on its chat row
// and on the rail icon, the indicator at the bottom of the rail (its list, a click jumps to the chat), the bar only
// moves forward, the tags never show in the reply, it finishes and fades, the kind is learned (a second reply has an
// expectation); /progress and /progress learned; a Video Review export with ffmpeg (measured: its own -progress, on
// the Video Review rail icon, done); a Commands-page chain (/wait 2s, then /wait 2s: steps done / total on the run's
// head, forward only, done); a flow waiting for you (waiting, not hung) and a hung step offering ↻ Pick up here;
// /progress tags on|off for directors; nothing left on screen at the end.
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/progress.js --shot /tmp/progress.png
const SHOTS = window.PROGRESS_SHOTS || '/tmp/hearth-checks/progress';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const shot = async (name) => { try { await smoke({ shot: `${SHOTS}-${name}.png` }); } catch { /* pictures are optional */ } };
const C = H.claudeAgent();
// every value each bar took (the model's events), to check it only ever moved forward
const seen = {};
Progress.on((it, what) => { (seen[it.key] ||= []).push({ t: Date.now(), v: Math.round(it.shown * 10) / 10, st: it.state, what, est: it.estimated }); });
const forward = (key) => { const s = (seen[key] || []).map((x) => x.v); return s.length > 1 && s.every((v, i) => !i || v >= s[i - 1]); };
const rose = (key) => { const s = (seen[key] || []).filter((x) => x.st !== 'done').map((x) => x.v); return s.length ? s.at(-1) - s[0] : 0; };
const dot = () => document.getElementById('pg-dot');
try {
  activate(C.id);
  await until(() => Native.hasView(C.id));
  // ---- 1. a slow reply ----
  Native.newChat(C.id); await wait(200);
  Native.send(C.id, 'slow table code progress tool think');
  await until(() => H.activeChat[C.id] && Native.isBusy(H.activeChat[C.id]), 5000);
  const chatId = H.activeChat[C.id];
  const key = `chat:${chatId}`;
  ok(await until(() => Progress.get(key), 3000), 'a reply in progress gets a progress item');
  ok(await until(() => document.querySelector('.msg.streaming > .pg-bar'), 5000), 'a bar on the reply being written');
  ok(await until(() => document.querySelector(`#chat-groups .item[data-key="${chatId}"] > .pg-bar`), 5000), 'a bar on its chat row');
  ok(await until(() => document.querySelector(`#agent-buttons .agent-btn[data-id="${H.surfaceIdFor(C.id)}"] > .pg-bar`), 5000), 'a bar on the agent\'s rail icon');
  ok(await until(() => dot() && !dot().hidden, 3000), 'the indicator shows at the bottom of the rail');
  await until(() => /about \d+ %/.test(document.querySelector('.msg.streaming .pg-note')?.textContent || ''), 4000);
  out.replyWords = document.querySelector('.msg.streaming .pg-note')?.textContent;
  ok(/^about \d+ %/.test(out.replyWords || ''), `the reply's words say it is an estimate (${out.replyWords})`);
  ok(document.querySelector('.msg.streaming > .pg-bar.pg-est'), 'an estimate looks like one (soft style)');
  ok(/scaleX\(/.test(document.querySelector('.msg.streaming > .pg-bar > i')?.style.transform || ''), 'the fill moves with transform: scaleX');
  // the list next to the indicator, while it runs
  dot().click(); await wait(400);
  out.popRows = [...document.querySelectorAll('.pg-pop .pg-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  ok(out.popRows.some((t) => /Claude/.test(t) && /%/.test(t)), `the list shows the reply with its percent (${out.popRows})`);
  await shot('reply');
  // jump: from another chat, a click on the row brings the reply back
  Native.newChat(C.id); await wait(300);
  document.querySelector(`.pg-pop .pg-row[data-pg="${key}"]`)?.click() ?? (dot().click(), await wait(300), document.querySelector(`.pg-pop .pg-row[data-pg="${key}"]`)?.click());
  await wait(400);
  ok(H.activeChat[C.id] === chatId, 'a click in the list jumps back to the chat being written');
  ok(!document.querySelector('.pg-pop'), 'the list closes after the jump');
  await until(() => Progress.get(key)?.signals?.agentPct >= 35, 15000);
  out.agentPct = Progress.get(key)?.signals?.agentPct;
  ok(out.agentPct >= 35, `the agent's <progress> tag was read (${out.agentPct})`);
  ok(!/<progress/.test(document.querySelector('.msg.streaming .body')?.textContent || ''), 'the tag never shows in the reply being written');
  await until(() => !Native.isBusy(chatId), 40000);
  await wait(200);
  out.replyEnd = Progress.get(key)?.state || 'gone';
  ok(['done', 'gone'].includes(out.replyEnd) || !Progress.get(key), `the reply's bar finishes (${out.replyEnd})`);
  ok(forward(key), `the reply's bar only moved forward (${(seen[key] || []).map((x) => x.v).join(' ')})`);
  ok(rose(key) > 10, `it moved while the reply was written (+${rose(key)})`);
  ok(seen[key]?.some((x) => x.st === 'done' && x.v === 100), 'it filled to 100 % when the reply ended');
  ok(!/<progress/.test(Native.current(C.id).messages.at(-1).text), 'the saved reply has no tag');
  await until(() => !Progress.get(key), 4000);
  ok(!document.querySelector(`[data-pg="${key}"]`), 'its bars are gone once it faded');
  ok(await until(() => dot().hidden, 3000), 'the indicator hides when nothing is in progress');
  const learned = Progress._test.hist();
  out.learned = Object.keys(learned).filter((k) => k.startsWith('reply'));
  ok(learned['reply:claude']?.n >= 1, `the reply taught its kind (${out.learned})`);
  // a second reply of the same kind starts from what was learned
  Native.send(C.id, 'slow tool');
  await until(() => Progress.get(`chat:${H.activeChat[C.id]}`), 4000);
  const k2 = `chat:${H.activeChat[C.id]}`;
  out.secondKind = Progress.get(k2)?.kind;
  ok(Progress._test.expect(out.secondKind).learned, `the next reply's estimate uses the learned history (${out.secondKind})`);
  await until(() => !Native.isBusy(H.activeChat[C.id]), 30000);

  // ---- 2. /progress ----
  const say = [];
  const r1 = await Commands.tryRun('/progress learned', C.id, { say: (t) => say.push(t) });
  await wait(300);
  out.learnedNote = [...document.querySelectorAll('.msg.note')].map((n) => n.textContent).find((t) => /usually take/.test(t))?.slice(0, 160) || say.join(' ').slice(0, 160) || String(r1).slice(0, 160);
  ok(/usually take|a reply/.test(out.learnedNote || ''), `/progress learned says how long things take (${out.learnedNote})`);
  await Commands.tryRun('/progress', C.id); await wait(300);
  ok(document.querySelector('.pg-pop'), '/progress opens the list');
  document.querySelector('.pg-pop') && ProgressUI.close();

  // ---- 3. an ffmpeg export in Video Review (measured) ----
  const VIDS = `${window.SMOKE_SAVES}/renders`;
  await window.hub.fs.write(`${VIDS}/.keep`, '');
  for (const f of (await window.hub.fs.list('/tmp/hearth-test-videos')).filter((x) => !x.isDir && /neon_tunnel_v2/.test(x.name))) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
  activate('tool:ae'); await Review.ensureMounted();
  H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
  await Review.load(true);
  await until(() => Review.videos.length >= 1, 10000);
  const A = Review.videos[0].path;
  await Review.open(A); await Review.waitReady?.().catch(() => null);
  activate(C.id); await wait(300); // the export runs while you are elsewhere: the rail icon of Video Review shows it
  const job = await Review.runExport('reels', { path: A });
  ok(job?.id, `the export started (${job?.id})`);
  const jk = `job:${job?.id}`;
  ok(await until(() => Progress.get(jk) || seen[jk], 8000), 'the export has a progress item');
  out.renderTitle = Progress.get(jk)?.title;
  out.renderRail = Boolean(await until(() => document.querySelector('#agent-buttons .agent-btn[data-id="tool:ae"] > .pg-bar') || Progress.get(jk)?.state === 'done', 8000));
  await job?.done;
  await wait(300);
  const js = seen[jk] || [];
  out.render = js.map((x) => `${x.v}${x.est ? '~' : ''}${x.st === 'done' ? '✓' : ''}`).join(' ');
  ok(js.some((x) => x.st === 'done' && x.v === 100), `the export's bar finished (${out.render})`);
  ok(js.filter((x) => x.st !== 'done').every((x) => !x.est), 'an ffmpeg export is measured, not estimated');
  ok(forward(jk), 'the export only moved forward');
  ok(/Export/.test(out.renderTitle || ''), `the export's bar is named (${out.renderTitle})`);

  // ---- 4. a Commands-page chain: /wait 2s, then /wait 2s ----
  const right = () => document.querySelector('.cp-right');
  const qTitle = () => right()?.querySelector('.cp-q h3')?.textContent || '';
  const optBtn = (label) => [...right().querySelectorAll('.cp-q .cp-opt')].find((b) => b.textContent.replace(/^\d/, '').trim().startsWith(label));
  const waitQ = async (re, ms = 8000) => { const good = await until(() => re.test(qTitle()), ms); if (!good) fail.push(`question ${re} (on screen: “${qTitle()}”)`); return good; };
  const type = async (text) => { const inp = right().querySelector('.cp-q .cp-input'); inp.value = text; inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(250); };
  CmdPage.open('wait'); await wait(400);
  document.querySelector('.cp-use').click();
  await waitQ(/needs|time/i);
  await type('2s');
  await waitQ(/^Then/); optBtn('Then another command').click();
  await waitQ(/Which command next/); await type('wait');
  await waitQ(/needs|time/i); await type('2s');
  await waitQ(/^Then/); optBtn('That\'s all').click();
  await waitQ(/Ready/);
  const run = Flows.run(CmdPage.state.runId);
  const fk = `flow:${run.id}`;
  ok(Progress.get(fk)?.state === 'wait', `a run waiting for your answer is "waiting for you", not hung (${Progress.get(fk)?.state})`);
  optBtn('▶ Run').click();
  await until(() => Progress.get(fk)?.label?.startsWith('▶'), 5000);
  CmdPage.openRun(run.id); await wait(500);
  ok(await until(() => document.querySelector('.cp-run-head > .pg-bar'), 4000), 'a bar on the Commands page run');
  await shot('chain');
  await until(() => run.status === 'done' || run.status === 'hung', 20000);
  await wait(300);
  const fs = seen[fk] || [];
  out.chain = fs.map((x) => `${Math.round(x.v)}${x.st === 'wait' ? 'w' : ''}${x.st === 'done' ? '✓' : ''}`).join(' ');
  ok(run.status === 'done', `the chain ran (${Flows.line(run)})`);
  ok(forward(fk), `the chain's bar only moved forward (${out.chain})`);
  ok(new Set(fs.filter((x) => x.st === 'run').map((x) => Math.round(x.v))).size >= 2, `it moved step by step while running (${out.chain})`);
  ok(fs.some((x) => x.st === 'done'), 'the chain\'s bar finished');

  // ---- 5. a flow step that hangs: ↻ Pick up here from the list ----
  Flows.define({ id: 'pg-hang', name: 'Progress hang test', start: 'a', nodes: [{ id: 'a', kind: 'action', title: 'A slow step', cmd: '/wait 1s', next: 'r' }, { id: 'r', kind: 'result', text: 'ok' }] });
  const hr = await Flows.start('pg-hang', { agentId: C.id });
  await until(() => hr.status === 'done', 8000);
  // made to look hung (as after a restart in the middle of a step), then picked up from the indicator's list
  const h2 = await Flows.start('pg-hang', { agentId: C.id });
  await until(() => h2.status === 'done', 8000);
  h2.status = 'hung'; h2.why = 'Hearth closed during this step'; h2.steps.at(-1).status = 'hung'; h2.at = 'a'; h2.steps = h2.steps.filter((e) => e.node !== 'r');
  ProgressHooks.flowRun(h2);
  const hk = `flow:${h2.id}`;
  ok(Progress.get(hk)?.state === 'hung', `a hung run shows as hung (${Progress.get(hk)?.state})`);
  ProgressUI.open(); await wait(400);
  const pick = [...document.querySelectorAll(`.pg-pop .pg-row[data-pg="${hk}"] button`)].find((b) => /Pick up/.test(b.textContent));
  ok(pick, 'the list offers ↻ Pick up here for a hung run');
  pick?.click();
  await until(() => h2.status === 'done', 8000);
  ok(h2.status === 'done', `picked up from the list, it finished (${Flows.line(h2)})`);
  ProgressUI.close();

  // ---- 6. directors' opt-in line ----
  const dirs = H.config.agents.filter((a) => a.dock && a.mode === 'native');
  if (dirs.length) {
    await Commands.tryRun('/progress tags on', C.id); await wait(300);
    ok(H.config.agents.filter((a) => a.dock && a.mode === 'native').every((a) => a.progressTag === true), '/progress tags on opts the directors in');
    await Commands.tryRun('/progress tags off', C.id); await wait(300);
    ok(H.config.agents.filter((a) => a.dock && a.mode === 'native').every((a) => !a.progressTag), '/progress tags off takes it back');
  } else out.directors = 'none in this copy';
  ok(!H.config.agents.some((a) => !a.dock && a.progressTag), 'chats that are not directors never get the line');

  // ---- the end: nothing left ----
  await until(() => !Progress.list().length, 8000);
  ok(!Progress.list().length, `nothing in progress at the end (${Progress.list().map((x) => x.key)})`);
  ok(await until(() => dot().hidden, 3000), 'the indicator is hidden at the end');
  ok(!document.querySelector('.pg-bar:not(.pg-pop .pg-bar)'), 'no bar left on screen');
} catch (err) { fail.push(`threw: ${err.message}\n${err.stack?.split('\n').slice(0, 3).join(' | ')}`); }
return JSON.stringify({ ok: !fail.length, problems: fail, ...out }, null, 1);
