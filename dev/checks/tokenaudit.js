// (round 36, tokenaudit) ⋯ AI setup → Spending → "Where its tokens go": the fold shows the breakdown of the fixed part
// (its instructions, its tools, hooks, the total); an unused tool costing > 500 tokens gets one line in the Spending
// summary, once; "Turn off — not used in 30 days" switches the tool off and the NEXT prompt the engine really gets
// shrinks by the amount shown (the fake Claude's "promptinfo" / "toolsinfo" end a reply with its system prompt and the
// size of each Hearth tool list it was given); /token-audit says the same in the chat.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/tokenaudit.js --shot /tmp/tokenaudit.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const S = () => document.querySelector('aside.opt-sheet');
const sysOf = (m) => (/system<<<([\s\S]*?)>>>/.exec(m?.text || '') || [])[1] ?? null;
const toolsOf = (m) => { try { return JSON.parse((/tools<<<([\s\S]*?)>>>/.exec(m?.text || '') || [])[1]); } catch { return null; } };
const tok = (s) => Math.round(String(s || '').length / 4);
const DAY = 864e5;
try {
  if (window.Lazy?.load) await Lazy.load('budget').catch(() => {});
  ok(await until(() => typeof TokenAudit !== 'undefined' && typeof TokenAuditCore !== 'undefined'), 'tokenaudit.js loads (budget group)');
  ok(Commands.get('token-audit') && !Commands.duplicates().some((d) => d.name === 'token-audit'), '/token-audit exists, no duplicate');
  const C = H.claudeAgent();
  const A = () => H.agent(C.id);
  const keep = { boardTools: A().boardTools, autoMemory: A().autoMemory };
  A().boardTools = true;
  A().autoMemory = false; // a fact the fake engine <remember>s would change the next prompt
  await saveConfig(); await wait(400);
  // tool use tracked for 40 days, the board never used
  await window.hub.kvSet('tool-use', { since: Date.now() - 40 * DAY, days: {} });
  TokenAudit._test.setLog({ since: Date.now() - 40 * DAY, days: {} });
  TokenAudit._test.reset();
  try { store.set('options.open', (store.get('options.open', []) || []).filter((k) => k !== 'spending')); store.set('tokenaudit.open', true); } catch { /* storage */ }

  activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const reply = async (text) => { await Native.send(C.id, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[C.id]), 60000); await wait(250); return Native.current(C.id).messages.at(-1); };
  let m = await reply('hello promptinfo toolsinfo');
  const s0 = sysOf(m); const t0 = toolsOf(m);
  out.before = { prompt: tok(s0), tools: t0 };
  ok(s0 && /MOOD BOARD/.test(s0) && t0?.board > 0, `the engine got the board tools (${JSON.stringify(t0)})`);

  // ⋯ AI setup: the Spending fold, closed, says it once
  Native.view(C.id).root.querySelector('.native-head button[aria-label="Chat options"]').click();
  const fold = await until(() => S()?.querySelector('details[data-fold="spending"]'));
  ok(fold && !fold.open, 'AI setup shows Spending, folded');
  const sum = await until(() => { const t = fold.querySelector(':scope > summary .opt-sum')?.textContent || ''; return /Mood board: ≈ [\d.,k]+ tokens a message, not used in 30 days/.test(t) ? t : null; });
  out.summary = sum;
  ok(sum, `the fold's summary: one nudge line (“${sum || fold.querySelector('summary')?.textContent}”)`);
  ok(!document.querySelector('.toast, .ui-toast')?.textContent?.includes('not used in 30 days'), 'the nudge is not a toast');

  // the breakdown inside it
  fold.querySelector(':scope > summary').click();
  await wait(200);
  const ta = await until(() => fold.querySelector('details.ta[open] .ta-group .ta-line') && fold.querySelector('details.ta'));
  ok(ta, 'Where its tokens go: inside the Spending fold, with lines');
  const lines = [...(ta?.querySelectorAll('.ta-line') || [])].map((l) => ({ l: l.querySelector('.ta-l > span')?.textContent, n: Number((l.querySelector('b')?.textContent || '').replace(/[^\d]/g, '')), meta: l.querySelector('small')?.textContent || '', btn: l.querySelector('button')?.textContent || '' }));
  out.lines = lines.map((x) => `${x.l} ${x.n}${x.meta ? ` (${x.meta})` : ''}${x.btn ? ` [${x.btn}]` : ''}`);
  const labels = lines.map((x) => x.l);
  ok(['Who it is', 'Your chats and Hearth', 'Mood board', 'Hooks', 'Mood board line'].every((k) => labels.includes(k)), `instructions, tools and hooks each on a line (${labels.join(', ')})`);
  const b = await TokenAudit.breakdownOf(A());
  // the parts measured are the prompt the engine got, byte for byte (a reply shows it with its <suggest> tag taken out)
  const joined = (await window.hub.tokenAudit(JSON.parse(JSON.stringify(A())))).parts.map((p) => p[1]).join('\n\n');
  ok(joined.replace(/<suggest>[\s\S]*?<\/suggest>/g, '') === s0, 'the parts measured are the system prompt the engine really got');
  ok(Math.abs(b.promptTotal - tok(joined)) <= 1, `the instructions add up to that prompt (${b.promptTotal} vs ${tok(joined)})`);
  const hubTools = b.tools.filter((t) => t.kind === 'set').reduce((n, t) => n + t.tokens, 0);
  const engTools = Object.values(t0 || {}).filter((v) => typeof v === 'number').reduce((n, v) => n + v, 0);
  ok(hubTools === engTools, `the tool lines add up to the tool lists the engine got (${hubTools} vs ${engTools})`);
  const boardLine = lines.find((x) => x.l === 'Mood board');
  ok(boardLine?.btn === 'Turn off — not used in 30 days' && /used 0 times this week/.test(boardLine.meta), `the unused board: "used 0 times this week" + Turn off (${boardLine?.meta} [${boardLine?.btn}])`);
  ok(/≈ [\d,]+ tokens before your words/.test(ta.querySelector('.ta-body > .opt-hint')?.textContent || '') && /Trimming what's suggested: ≈ [\d,]+ fewer tokens a message/.test(ta.querySelector('.ta-save')?.textContent || ''), 'the total, and what trimming saves per message');
  out.save = ta.querySelector('.ta-save')?.textContent;
  const shown = b.tools.find((t) => t.id === 'boardTools').trim.saves;
  out.shown = shown;
  const boardBtn = [...ta.querySelectorAll('.ta-line')].find((l) => l.querySelector('.ta-l > span')?.textContent === 'Mood board')?.querySelector('button');
  ok(new RegExp(`≈ ${shown.toLocaleString()} tokens with each message`).test(boardBtn?.title || ''), `its button says what it saves (${boardBtn?.title})`);

  // one click: off, a toast with Undo, the next prompt is smaller by exactly that
  boardBtn.click();
  ok(await until(() => A().boardTools === undefined), 'Turn off: the board tools are off for this AI');
  const t = await until(() => [...document.querySelectorAll('.toast, .ui-toast, [class*="toast"]')].find((x) => /Mood board off for/.test(x.textContent)));
  ok(t && /Undo/.test(t.textContent), `a toast says so, with Undo (“${t?.textContent?.slice(0, 120)}”)`);
  const saved = await window.hub.getConfig();
  ok(!(saved?.config || saved)?.agents?.find((a) => a.id === C.id)?.boardTools, 'and config.json has it off');
  m = await reply('again promptinfo toolsinfo');
  const s1 = sysOf(m); const t1 = toolsOf(m);
  const sum1 = Object.values(t1 || {}).filter((v) => typeof v === 'number').reduce((n, v) => n + v, 0);
  const shrink = tok(s0) - tok(s1) + engTools - sum1;
  out.after = { prompt: tok(s1), tools: t1, shrink };
  ok(s1 && !/MOOD BOARD/.test(s1) && t1 && !('board' in t1), 'the next run: no board line, no board server');
  ok(Math.abs(shrink - shown) <= 1, `the next prompt shrank by the amount shown (${shrink} vs ${shown})`);
  // seen once: the nudge doesn't come back
  S()?.querySelector('.opt-head button[title^="Close"]')?.click();
  await wait(200);
  A().boardTools = true; await saveConfig(); await wait(300);
  TokenAudit._test.setLog({ since: Date.now() - 40 * DAY, days: {} });
  Options.open({ agentId: C.id });
  const f2 = await until(() => S()?.querySelector('details[data-fold="spending"]'));
  await until(() => f2?.querySelector('details.ta .ta-line'));
  await wait(300);
  ok(!/not used in 30 days/.test(f2?.querySelector(':scope > summary .opt-sum')?.textContent || ''), `the nudge shows once (now: “${f2?.querySelector(':scope > summary .opt-sum')?.textContent}”)`);
  S()?.querySelector('.opt-head button[title^="Close"]')?.click();

  // in the chat
  const txt = await Commands.tryRun('/token-audit', C.id);
  await wait(400);
  const said = [...Native.view(C.id).list.querySelectorAll('.msg')].map((x) => x.textContent).join('\n');
  out.cmd = typeof txt === 'string' ? txt.slice(0, 200) : said.slice(-300);
  ok(/tokens with each message before your words/.test(said) || /tokens with each message before your words/.test(String(txt || '')), '/token-audit says it in the chat');

  for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete A()[k]; else A()[k] = v; }
  await saveConfig();
  // the palette's way in: AI setup at Spending, the breakdown open (left on screen for the screenshot)
  await wait(400);
  TokenAudit.open(C.id);
  ok(await until(() => S()?.querySelector('details[data-fold="spending"][open] details.ta[open] .ta-line')), 'Spending: where its tokens go opens AI setup right there');
  S()?.querySelector('details[data-fold="spending"]')?.scrollIntoView({ block: 'start' });
  await wait(500);
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
