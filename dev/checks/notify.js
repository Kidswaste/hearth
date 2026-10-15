// Tell me when… (round 44, notify) with the fake engines and a recorder in place of Electron's Notification
// (notifymain.js test mode; Hearth played "in the background"): a long fake reply while away → ONE notification with
// Open the chat, whose click brings that chat back; a short reply → none; a render done → Show the file; a permission
// card → "Allow…" opens the card focused ON THE CARD and never approves it (answering it closes the notification); a
// burst becomes one summary; each switch (and the master) silences its own events; Settings › Advanced › Tell me when…
// has the five switches with a line saying where they stand; Find anything knows them; /notify-when.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/notify.js --shot /tmp/notify.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const N = window.hub.notify;
const shown = async () => (await N.test({})).log.filter((l) => l.shown).map((l) => l.shown);
const openNow = async () => (await N.test({})).open;
const ranLog = async () => (await N.test({})).log.filter((l) => l.ran).map((l) => l.ran);
try {
  await Lazy.load('notify');
  await Lazy.load('activity');
  ok(typeof Notify !== 'undefined' && typeof NotifyCore !== 'undefined', 'notify group loads');
  await N.test({ stub: true, away: true, clear: true });
  Activity._test.away(true); Activity._test.gap(0);
  const C = H.claudeAgent(); activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const v = Native.view(C.id);
  const say = (text) => { const ta = v.root.querySelector('textarea'); ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); v.root.querySelector('form.composer').requestSubmit(); };
  const idle = () => until(() => !Native.isAgentBusy(C.id), 60000);

  // ---------- a short reply while away: no notification (the Dock / taskbar number is enough) ----------
  say('hello there'); await wait(300); await idle(); await wait(400);
  const firstChat = Native.chatOf(C.id).id;
  out.short = Notify._test.sent.at(-1);
  ok((await shown()).length === 0 && out.short?.why === 'short', `a short reply notifies nothing (${JSON.stringify(out.short)})`);

  // ---------- a long fake reply while away: ONE notification, with Open the chat ----------
  say('Make the long intro now\nmcp: [["sleep", 21000]]'); await wait(300);
  ok(await idle(), 'the long fake reply ended');
  ok(await until(async () => (await shown()).length >= 1, 4000), 'a long reply while away notified');
  let s = await shown();
  out.long = s;
  ok(s.length === 1 && /replied/.test(s[0].title) && s[0].actions[0] === 'Open the chat', `one notification with Open the chat (${JSON.stringify(s)})`);
  ok(!s.some((x) => x.urgency), 'never marked urgent (Focus / Do Not Disturb hold it)');
  ok((await openNow()).includes(`chat:${firstChat}`), 'grouped under its chat');
  // its click brings the chat back (from another chat)
  Native.newChat(C.id); await wait(300);
  ok(H.activeChat[C.id] !== firstChat, 'moved to another chat');
  await N.test({ click: { group: `chat:${firstChat}` } });
  ok(await until(() => H.activeChat[C.id] === firstChat, 3000), 'Open the chat: the click opened that chat');
  ok((await ranLog()).at(-1)?.action === 'Open the chat', 'the click ran Open the chat');

  // ---------- render done → Show the file ----------
  await N.test({ stub: true, clear: true });
  await Lazy.load('renders');
  const t = Renders.track({ kind: 'seq', title: 'Intro 9:16', pk: 'nt-check' });
  t.job.started = Date.now() - 30000;
  t.done('/tmp/hearth-notify-out/intro 9x16.mp4');
  ok(await until(async () => (await shown()).some((x) => /Render done/.test(x.title)), 5000), 'render done notified');
  const rd = (await shown()).find((x) => /Render done/.test(x.title));
  out.render = rd;
  ok(rd && /intro 9x16\.mp4/.test(rd.body) && /^Show/.test(rd.actions[0]), `render done → Show the file first (${JSON.stringify(rd)})`);
  await N.test({ click: { group: 'renders', action: 0 } });
  const ran = (await ranLog()).at(-1);
  ok(ran?.go?.file === '/tmp/hearth-notify-out/intro 9x16.mp4', `Show the file reveals that file (${JSON.stringify(ran)})`);
  const quick = Renders.track({ kind: 'seq', title: 'Quick one', pk: 'nt-check2' }); quick.done('/tmp/hearth-notify-out/q.mp4'); await wait(600);
  ok(!(await shown()).some((x) => /q\.mp4/.test(x.body)), 'a 1-second render: no notification');

  // ---------- a permission card → "Allow…" opens the card, never approves ----------
  await N.test({ stub: true, clear: true });
  v.root.querySelector('textarea').focus();
  let answered = null;
  const asked = Access.ask({ agentId: C.id, chatId: firstChat, action: 'delete', target: 'old-renders/', risk: 'high' }).then((r) => { answered = r; });
  ok(await until(async () => (await shown()).some((x) => /needs you/.test(x.title)), 5000), 'a permission card while away notified');
  const pm = (await shown()).find((x) => /needs you/.test(x.title));
  out.permission = pm;
  ok(pm?.actions.length === 1 && pm.actions[0] === 'Allow…', `its one action is Allow… (${JSON.stringify(pm)})`);
  const card = [...document.querySelectorAll('.access-card')].find((c) => !c.classList.contains('answered') && /old-renders/.test(c.textContent));
  ok(card, 'the card is there');
  await N.test({ click: { group: `chat:${firstChat}`, action: 0 } });
  ok(await until(() => document.activeElement === card, 3000), 'Allow… focused the card itself');
  await wait(800);
  ok(!card.classList.contains('answered') && answered === null, 'Allow… did not approve anything (the card still waits)');
  ok(!document.activeElement?.matches?.('button'), 'not its Allow button (Enter would allow)');
  // answering the card closes its notification
  card.querySelector('button.danger')?.click();
  await asked;
  ok(answered === false, 'Deny on the card denied');
  ok(await until(async () => !(await openNow()).includes(`chat:${firstChat}`), 3000), 'answering the card closed its notification');

  // ---------- a burst becomes one summary ----------
  await N.test({ stub: true, clear: true });
  for (const k of ['a', 'b', 'c', 'd']) await Notify.send({ type: 'reply', agentId: C.id, chatId: `burst-${k}`, ms: 30000, text: `reply ${k}` });
  out.burst = await openNow();
  ok(out.burst.length === 1 && out.burst[0] === 'summary' && /Hearth: 4 things/.test((await shown()).at(-1).title), `a burst of 4 → one summary (${out.burst})`);

  // ---------- each switch silences its own events ----------
  await N.test({ stub: true, clear: true });
  const saved = H.config.settings;
  const EV = { replies: { type: 'reply', agentId: C.id, chatId: 'sw-r', ms: 30000 }, renders: { type: 'render', file: '/tmp/x.mp4', ms: 30000 }, keepgoing: { type: 'keepgoing', phase: 'stop', agentId: C.id, chatId: 'sw-k', why: 'done' }, needs: { type: 'plan', agentId: C.id, chatId: 'sw-n' }, updates: { type: 'update', n: 2 } };
  const silenced = {};
  for (const sw of Object.keys(EV)) {
    H.config.settings = { ...saved, notifyWhen: { [sw]: false } };
    const r = await Notify.send(EV[sw]);
    const other = Object.keys(EV).find((x) => x !== sw);
    const r2 = await Notify.send({ ...EV[other], chatId: EV[other].chatId ? `${EV[other].chatId}-${sw}` : undefined });
    silenced[sw] = { off: r.why, other: r2.shown };
    ok(r.why === 'switch' && r2.shown, `${sw} off silences only its own events (${JSON.stringify(silenced[sw])})`);
    await N.test({ stub: true, clear: true });
  }
  H.config.settings = { ...saved, notify: false };
  ok((await Notify.send(EV.renders)).why === 'off', 'the master switch silences everything');
  H.config.settings = saved;
  out.silenced = silenced;

  // ---------- Settings › Advanced › Tell me when… ----------
  await AppUI.openSettings();
  const dlg = await until(() => document.querySelector('dialog.settings-dialog[open]'), 3000) && document.querySelector('dialog.settings-dialog[open]');
  const fold = dlg.querySelector('details[data-fold="notify"]');
  ok(fold && fold.closest('details.sc-adv'), 'Tell me when… is a fold under Advanced');
  const boxes = fold ? [...fold.querySelectorAll('label.check')] : [];
  out.settings = boxes.map((b) => `${b.querySelector('input').checked ? '☑' : '☐'} ${b.textContent.trim()}`);
  ok(boxes.length === 6 && /Desktop notifications/.test(boxes[0].textContent) && boxes.slice(1).map((b) => b.textContent.trim()).join('|') === 'Replies|Renders|Keep going|When an AI needs me|Updates', `the master + five switches (${out.settings})`);
  ok(boxes.every((b) => b.querySelector('input').checked), 'all on by default');
  ok(boxes.every((b) => b.title), 'each says what it does on hover');
  const line = () => fold.querySelector('.sc-state').textContent;
  out.lineBefore = line();
  boxes[2].querySelector('input').click(); await wait(400);
  out.lineAfter = line();
  ok(/^All on/.test(out.lineBefore) && !/renders/i.test(out.lineAfter) && out.lineAfter !== out.lineBefore, `the fold line follows a switch (${out.lineBefore} → ${out.lineAfter})`);
  boxes[0].querySelector('input').click(); await wait(50);
  ok(boxes.slice(1).every((b) => b.querySelector('input').disabled), 'master off: the five wait (dimmed)');
  dlg.close(); await wait(200);
  // Find anything knows them
  await Lazy.load('appsearch');
  const rows = AppSearchData.SETTINGS.filter((r) => /^set:notify/.test(r.id));
  out.find = rows.map((r) => `${r.label} → ${r.path}`);
  ok(rows.length === 6 && rows.every((r) => r.path === 'Settings › Advanced › Tell me when…'), `Find anything: 6 rows in Settings › Advanced › Tell me when… (${out.find})`);
  // /notify-when (saves)
  const st0 = await Commands.tryRun('/notify-when', C.id);
  await Commands.tryRun('/notify-when renders off', C.id); await wait(300);
  ok(NotifyCore.prefs(H.settings()).renders === false, '/notify-when renders off');
  await Commands.tryRun('/notify-when renders on', C.id); await wait(300);
  ok(NotifyCore.prefs(H.settings()).renders === true, '/notify-when renders on');
  out.cmd = String(st0 || '');
  ok(await Notify.openSettings(), 'Notify.openSettings opens the fold (Ctrl/⌘+K row)');
  ok(document.querySelector('dialog.settings-dialog[open] details[data-fold="notify"]')?.open, 'the fold is open');
  document.querySelector('dialog.settings-dialog[open]')?.close();
} catch (err) { fail.push(`threw: ${err.message}\n${err.stack}`); }
await window.hub.notify.test({ stub: false, away: null });
try { Activity._test.away(false); } catch { /* fine */ }
return JSON.stringify({ pass: fail.length === 0, fail, out }, null, 1);
