// 🔁 Keep going, leaner (round 51, routinelean), with the fake engines. "toolbytes:N" makes the fake keep N characters of
// tool results in its session per reply (so a round grows the session like real work), "varied" gives each reply new
// words, "edits:N:tag" edits a file in the first N rounds only (dev/fake-common.js roundlean).
//   1. Tokens per round over 10 rounds, before (lighter off: every round resumes, as round 50) and after (routinelean
//      goes on lighter between rounds once the chat re-reads a lot): Claude, Astra and the Lab director chat. Budgets.
//   2. Every round sends the same bytes (the engine's own log), except a lighter start's history.
//   3. It stops by itself: rounds that stop changing files (after 3 edits: 2 more rounds, then it stops, saying why);
//      the same answer twice.
//   4. Usage limits: 93 % of the session reported → "paused until … (limit)" before the next round, no round sent;
//      after the reset it goes on by itself.
//   5. Notifications carry the round's one-line summary, never the answer; the Usage window shows what Keep going spent
//      and did today / this week.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/routinelean.js --shot /tmp/routinelean.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); return ok; };
const BUDGET = { claude: 0.6, codex: 0.75, director: 0.7 }; // after ≤ this share of before (tokens per round, avg of 10)
try {
  await window.hub.kvSet('fake-switches', { seenLog: 'on' });
  await window.hub.kvSet('fake-seen', []);
  await Lazy.load('routines');
  await Lazy.load('historylean').catch(() => {});
  await Lazy.load('usagelimits').catch(() => {});
  const R = Routines; const C = RoutinesCore;
  R._test.scale(0.02);
  const notes = [];
  const realNotify = window.Notify?.send;
  if (window.Notify) Notify.send = (ev) => { notes.push(ev); return realNotify ? realNotify.call(Notify, ev) : Promise.resolve(); };
  else window.Notify = { send: (ev) => { notes.push(ev); return Promise.resolve(); } };

  const claude = H.claudeAgent();
  const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex' && !a.dock);
  const idle = (id) => until(() => !Native.isAgentBusy(id), 60000);
  const ended = (id, ms = 180000) => until(() => !['running', 'paused'].includes(R.get(id)?.status), ms);
  const spec = (o) => ({ how: { kind: 'rounds', rounds: 10 }, pause: 'none', cap: 0, ...o });
  async function fresh(agent, first) {
    activate(agent.dock ? 'tool:three' : agent.id); await wait(300);
    Native.newChat(agent.id); await wait(300);
    await Native.send(agent.id, first); await wait(200); await idle(agent.id); await wait(200);
    return Native.chatOf(agent.id);
  }
  async function tenRounds(agent, words, lighter) {
    const chat = await fresh(agent, `Start: ${lighter ? 'after' : 'before'} hello`);
    const r = await R.start(agent.id, spec({ prompt: words, lighter }), { chatId: chat.id });
    await ended(r.id);
    const x = R.get(r.id);
    const per = x.rounds.filter((y) => y.ok).map((y) => y.tokens);
    return { done: x.done, why: x.why, per, avg: Math.round(per.reduce((a, b) => a + b, 0) / Math.max(1, per.length)), leans: x.leanStarts, chatId: chat.id };
  }

  // ---------- 1. tokens per round over 10 rounds: before → after ----------
  const table = {};
  const cases = [['claude', claude, 'Keep improving: do the next 5 improvements. varied toolbytes:80000'],
    ['codex', astra, 'Keep improving: do the next 5 improvements. varied toolbytes:80000']];
  await Commands.tryRun('/director-setup', claude.id);
  await until(() => H.agents().some((a) => a.dock === 'three'), 10000);
  const director = H.agents().find((a) => a.dock === 'three');
  if (director) {
    activate('tool:three');
    if (typeof ThreeLab !== 'undefined') { await ThreeLab.cmd?.(); await until(() => ThreeLab.scenes && ThreeLab.director, 15000); }
    await wait(500);
    cases.push(['director', director, 'Keep improving the scene: do the next 5 improvements. varied toolbytes:80000']); // (no tools3: the fake reports a reply's input once, so tool steps would divide the context historylean reads)
  }
  for (const [key, agent, words] of cases) {
    if (!agent) { step(false, `${key}: the agent exists`); continue; }
    const b = await tenRounds(agent, words, false);
    const a = await tenRounds(agent, words, true);
    table[key] = { before: b.avg, after: a.avg, share: Math.round((a.avg / Math.max(1, b.avg)) * 100) / 100, perBefore: b.per, perAfter: a.per, leans: a.leans, rounds: [b.done, a.done] };
    step(b.done === 10 && a.done === 10, `${key}: 10 rounds each way`, { before: b.done, after: a.done, why: [b.why, a.why] });
    step(a.avg <= b.avg * BUDGET[key], `${key}: tokens per round ${b.avg} → ${a.avg} (budget ≤ ${BUDGET[key] * 100} %)`, { leans: a.leans });
    step(a.leans >= 1 && b.leans === 0, `${key}: lighter starts between rounds only after the change`, { before: b.leans, after: a.leans });
    if (key === 'claude') {
      const ch = await Native.load(a.chatId);
      const leaned = ch.messages.filter((m) => m.role === 'user' && m.routine && m.histLean);
      step(leaned.length === a.leans && ch.messages.filter((m) => m.role === 'user' && m.routine).every((m) => m.text === words), 'claude: the round\'s message is the routine\'s words; the lighter start is historylean\'s (marked on the message)');
    }
  }
  out.table = table;
  // ---------- 2. byte-stable: every round sent the same bytes (a lighter start adds the history before them) ----------
  const seen = ((await window.hub.kvGet('fake-seen', [])) || []).filter((x) => /do the next 5 improvements\. varied/.test(x.prompt));
  const sent = new Set(cases.map((x) => x[2]));
  const tails = seen.map((x) => x.prompt.split('</earlier_conversation>').pop().trim()).filter((t) => /toolbytes:80000/.test(t));
  // (a docked director chat adds its scene's one context line after the words: the same line every round of that chat)
  const odd = tails.filter((t) => ![...sent].some((w) => t === w || t.startsWith(`${w}\n\n[Hearth context: `)));
  step(tails.length >= 10 && !odd.length && new Set(tails).size <= cases.length * 2, 'every round reached the engine as the routine\'s exact words (a lighter start only adds the history before them)', { runs: tails.length, distinct: new Set(tails).size, odd: odd.slice(0, 2) });

  // ---------- 3. it stops by itself ----------
  const c1 = await fresh(claude, 'Start: edits');
  const e1 = await R.start(claude.id, spec({ prompt: 'Keep improving: do the next 5 improvements. varied edits:3:rl${Date.now().toString(36)}' }), { chatId: c1.id });
  await ended(e1.id);
  const x1 = R.get(e1.id);
  out.stale = { done: x1.done, files: x1.files, why: x1.why };
  step(x1.status === 'done' && x1.done === 5 && /last 2 rounds changed no file and nothing in the scene/.test(x1.why), 'after 3 rounds with edits, 2 without: it stops (round 5 of 10), saying why', out.stale);
  step(x1.files === 3 && x1.changedRounds === 3, '…and counts what it changed (3 files)', { files: x1.files, changed: x1.changedRounds });
  step([...Native.view(claude.id).list.querySelectorAll('.msg.note')].some((n) => /Keep going finished: the last 2 rounds changed no file.*3 files changed/.test(n.textContent)), 'the note says why, and what it did');
  await idle(claude.id);
  const c2 = await fresh(claude, 'Start: repeats');
  const e2 = await R.start(claude.id, spec({ prompt: 'Keep improving: do the next improvement.' }), { chatId: c2.id });
  await ended(e2.id);
  const x2 = R.get(e2.id);
  step(x2.status === 'done' && x2.done === 3 && /repeated the one before/.test(x2.why), 'the same answer: it stops after round 3', { done: x2.done, why: x2.why });
  await idle(claude.id);

  // ---------- 4. usage limits ----------
  const reset = Math.floor(Date.now() / 1000) + 3 * 3600;
  await window.hub.kvSet('fake-switches', { seenLog: 'on', claudeRateEvent: { status: 'allowed_warning', rateLimitType: 'five_hour', resetsAt: reset, utilization: 0.93 } });
  const c3 = await fresh(claude, 'Start: limits');
  step(await until(() => UsageLimits.state?.engines?.claude?.windows?.five_hour?.used >= 93, 8000), 'the reply reported 93 % of the session (usagelimits)');
  const l1 = await R.start(claude.id, spec({ prompt: 'Keep improving: do the next 5 improvements. varied' }), { chatId: c3.id });
  await until(() => R.get(l1.id).limitWait, 5000);
  const xl = R.get(l1.id);
  const chip = Native.view(claude.id).rtChip?.querySelector('.rt-chip-label')?.textContent || '';
  out.limit = { why: xl.why, chip, round: xl.round };
  step(xl.limitWait && xl.round === 0 && /^paused until .+ \(limit\)$/.test(xl.why), 'before 90 %: no round, "paused until … (limit)"', out.limit);
  step(/paused until .+ \(limit\)/.test(chip), 'the chip says it', chip);
  step(notes.some((n) => n.type === 'keepgoing' && n.phase === 'pause' && /\(limit\)/.test(n.why || '')), 'a notification says it');
  // the reset: the window's new numbers, the hold's time has come
  await window.hub.kvSet('fake-switches', { seenLog: 'on' });
  await UsageLimits.note('claude', [{ key: 'five_hour', used: 3, resetsAt: Date.now() + 5 * 3600e3, at: Date.now(), source: 'event' }]);
  R.get(l1.id).resetAt = Date.now() - 1; // (the minute after the reset)
  await R._test.check(l1.id);
  step(await until(() => R.get(l1.id).done >= 1, 20000), 'after the reset it goes on by itself');
  R.stop(l1.id); await idle(claude.id);

  // ---------- 5. notifications and the Usage window ----------
  const rounds = notes.filter((n) => n.type === 'keepgoing' && n.phase === 'round');
  step(rounds.length >= 10 && rounds.every((n) => n.summary && n.summary.length <= 140), 'each round\'s notification carries its one-line summary', { n: rounds.length, sample: rounds[0]?.summary });
  if (typeof NotifyCore !== 'undefined') { const c = NotifyCore.compose({ ...rounds[0], agent: 'Claude' }); step(c.body.startsWith(rounds[0].summary.slice(0, 20)) && c.body.length <= 160, 'the notification\'s text is that line, not the answer', c.body); }
  if (typeof Meter !== 'undefined') {
    await Meter.dashboard();
    step(await until(() => document.querySelector('.rt-usage'), 8000), 'the Usage window shows Keep going');
    const t = document.querySelector('.rt-usage')?.textContent || '';
    out.usage = t;
    step(/Today: ≈ [\d.]+[kM]? tokens · \d+ rounds · \d+ files? changed/.test(t) && /7 days: ≈/.test(t), 'what it spent and did, today and this week', t.slice(0, 200));
  }
  step(!document.body.innerText.includes('/keepgoing'), 'no command on screen');
} catch (err) { out.problems.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
return JSON.stringify({ pass: !out.problems.length, ...out }, null, 1);
