// ◉ Activity (activity.js, round 27): the rail indicator (only while something runs or waits for you), the panel
// (Waiting for you · Now running · Last 24 h), a stuck reply read from chat-live.js's liveness with Wait / Stop & retry,
// helper agents under a running reply, Plan first's ▶ Go ahead, a permission ask answered from the panel, history
// entries from hooks / missions, desktop notifications only while "in the background" and only when the one switch is
// on, and nothing ticking while idle.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/activity.js --shot /tmp/activity.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
try {
  await Lazy.load('activity');
  ok(typeof Activity !== 'undefined', 'Activity loaded');
  const T = Activity._test;
  T.away(true); // as if Hearth were in the background (notifications are only for then)
  ChatLive._tune({ stallMs: 3000, quietMs: 1000 }); // the 2 min of real use, shortened
  const C = H.claudeAgent(); activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const badge = () => document.getElementById('act-badge');
  const pop = () => document.querySelector('.ac-pop');
  const sec = (cls) => pop()?.querySelector(`.${cls}`);
  const rows = (cls) => [...(sec(cls)?.querySelectorAll('.ac-list > .ac-row') || [])];
  const idle = () => until(() => !Native.isAgentBusy(C.id), 30000);

  // ---------- idle: nothing on the rail, nothing ticking ----------
  await wait(400);
  out.idle = { badge: badge() ? !badge().hidden : false, armed: T.armed() };
  ok(!out.idle.badge, 'no indicator while nothing runs');
  ok(!out.idle.armed, 'no timer while idle');

  // ---------- a reply that hangs: running, then "looks stuck" ----------
  Native.send(C.id, 'hang');
  ok(await until(() => badge() && !badge().hidden && badge().dataset.state === 'run'), 'the indicator shows while a reply runs');
  out.count = badge()?.textContent;
  ok(T.armed(), 'the stuck reading runs while a reply runs');
  badge().click();
  ok(await until(() => rows('ac-run').some((r) => /Claude/.test(r.textContent))), 'Now running lists the reply');
  out.runRow = rows('ac-run')[0]?.textContent;
  ok(rows('ac-run')[0]?.querySelector('button[title^="Stop this reply"]'), 'a Stop button on the running reply');
  T.gap(0);
  ok(await until(() => rows('ac-wait').some((r) => /looks stuck/.test(r.textContent)), 9000), 'a quiet reply "looks stuck" under Waiting for you');
  out.stuck = rows('ac-wait').map((r) => r.textContent);
  ok(badge().dataset.state === 'need', 'the indicator turns ember when something waits');
  ok(await until(() => T.sent.some((n) => /looks stuck/.test(n.title)), 3000), 'a desktop notification: looks stuck');
  const stuckRow = rows('ac-wait').find((r) => /looks stuck/.test(r.textContent));
  ok(stuckRow && [...stuckRow.querySelectorAll('button')].some((b) => b.textContent === 'Stop & retry from here'), 'Stop & retry from here is offered');
  [...stuckRow.querySelectorAll('button')].find((b) => b.textContent === 'Wait').click();
  ok(await until(() => !rows('ac-wait').some((r) => /looks stuck/.test(r.textContent)), 3000), 'Wait: the stuck row goes away for now');
  if (typeof smoke === 'function') await smoke({ shot: '/tmp/activity-run.png' });
  rows('ac-run')[0].querySelector('button[title^="Stop this reply"]').click();
  ok(await idle(), 'Stop ends the reply');
  ok(await until(() => !rows('ac-run').length), 'Now running empties');

  // ---------- helper agents under a running reply, then the history ----------
  Native.send(C.id, 'subagents');
  ok(await until(() => pop()?.querySelector('.ac-helpers > li'), 20000), 'helper agents listed under the running reply');
  out.helpers = [...(pop()?.querySelectorAll('.ac-helpers > li') || [])].map((li) => li.textContent);
  ok(await idle(), 'the subagents reply ends');
  ok(await until(() => rows('ac-day').some((r) => /finished/.test(r.textContent) && /helper/.test(r.textContent))), 'the history keeps a reply that deployed helpers');

  // ---------- Plan first: ▶ Go ahead from the panel ----------
  Missions.set(C.id, 'plan');
  T.gap(0);
  ok(Missions.submit(C.id, 'plan a small scene'), 'plan first sent');
  ok(await idle(), 'the plan reply ends');
  ok(await until(() => rows('ac-wait').some((r) => /plan is ready/.test(r.textContent))), 'Waiting for you: the plan is ready');
  ok(T.sent.some((n) => /plan is ready/.test(n.title)), 'a desktop notification: the plan is ready');
  const planRow = rows('ac-wait').find((r) => /plan is ready/.test(r.textContent));
  [...planRow.querySelectorAll('button')].find((b) => /Go ahead/.test(b.textContent)).click();
  ok(await until(() => [...Native.current(C.id).messages].reverse().find((m) => m.role === 'user')?.text === 'Looks good: go ahead with the plan.'), '▶ Go ahead sends the go-ahead');
  ok(await until(() => !rows('ac-wait').some((r) => /plan is ready/.test(r.textContent))), 'the plan row leaves');
  await idle();

  // ---------- a permission ask, answered from the panel ----------
  const asked = Access.ask({ agentId: C.id, action: 'publish', target: 'test-site', risk: 'high', what: 'Publish test-site' });
  ok(await until(() => rows('ac-wait').some((r) => /Publish test-site/.test(r.textContent))), 'a permission ask waits for you in the panel');
  [...rows('ac-wait').find((r) => /Publish test-site/.test(r.textContent)).querySelectorAll('button')].find((b) => b.textContent === 'Allow once').click();
  ok(await asked === true, 'Allow once from the panel allows it');
  ok(await until(() => !rows('ac-wait').some((r) => /Publish test-site/.test(r.textContent))), 'the ask leaves once answered');

  // ---------- history from hooks / missions; other work with a bar ----------
  document.dispatchEvent(new CustomEvent('hearth:hook-fired', { detail: { agentId: C.id, hookId: 'x', when: 'When a render finishes', fact: 'A render finished: test' } }));
  document.dispatchEvent(new CustomEvent('hearth:mission', { detail: { phase: 'done', kind: 'other', agentId: C.id, chatId: H.activeChat[C.id], task: 'second look', ms: 4000, ok: true } }));
  ok(await until(() => rows('ac-day').some((r) => /When a render finishes/.test(r.textContent)) && rows('ac-day').some((r) => /Second opinion only done/.test(r.textContent))), 'hooks fired and missions done show in the last 24 h');
  Progress.set('test:activity', { title: 'Test job', icon: '◔', pct: 30, kind: 'flow' });
  ok(await until(() => rows('ac-run').some((r) => /Test job/.test(r.textContent))), 'other work with a bar shows under Now running');
  Progress.drop('test:activity');
  ok(await until(() => !rows('ac-run').some((r) => /Test job/.test(r.textContent))), '…and leaves when it ends');
  if (typeof smoke === 'function') await smoke({ shot: '/tmp/activity-panel.png' });

  // ---------- notifications: the one switch ----------
  const before = T.sent.length;
  const was = H.settings().notify;
  H.config.settings = { ...H.settings(), notify: false };
  T.gap(0); await Activity.notify('should not show', 'off');
  ok(T.sent.length === before, 'no desktop notification when the switch is off');
  H.config.settings = { ...H.settings(), notify: was };
  T.away(false);
  T.gap(0); await Activity.notify('in front', 'focused');
  ok(!T.sent.some((n) => n.title === 'in front'), 'no desktop notification while Hearth is in front');

  // ---------- the words, the command, back to idle ----------
  out.summary = Activity.summary().slice(0, 300);
  ok(/Last 24 h/.test(out.summary), 'the summary has the last 24 h');
  ok(Commands.get('whats-running'), '/whats-running exists');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(await until(() => !pop()), 'Esc closes the panel');
  ok(await until(() => !badge() || badge().hidden, 3000), 'the indicator hides when nothing runs or waits');
  ok(await until(() => !T.armed(), 7000), 'no timer once idle again');
  out.sent = T.sent.map((n) => n.title);
} catch (err) { fail.push(`threw: ${err.stack || err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, out }, null, 1);
