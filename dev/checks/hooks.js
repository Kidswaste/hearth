// ⚡ Hooks (hooks.js, round 26): ⋯ AI setup → "Hooks: when… then…": add one in plain words, it fires on the real
// signals (a file landing in a watched folder through the main process, the Lab's error event, a render finishing,
// another AI's reply), the message carries Hearth's line visibly above your words with "⚡ hook", once a minute at
// most, never while the AI answers (it waits its turn), no ping-pong between AIs, pause all, a mission as the action.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/hooks.js --shot /tmp/hooks.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const lines = [];
const realTry = Commands.tryRun;
Commands.tryRun = async (text, ...rest) => { if (/^\/(council|debate|duo|jam|pair|all|crew|opinion)\b/.test(text)) { lines.push(text); return true; } return realTry(text, ...rest); };
try {
  await Lazy.load('hooks');
  const C = H.claudeAgent(); activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const A0 = H.agents().find((a) => a.mode === 'native' && a.id !== C.id);
  let A = A0;
  const v = Native.view(C.id);
  const lastUser = () => [...(Native.current(C.id)?.messages || [])].reverse().find((m) => m.role === 'user');
  const idle = () => until(() => !Native.isAgentBusy(C.id), 30000);

  // ---------- ⋯ AI setup: the section, add a hook in plain words ----------
  v.root.querySelector('.native-head button[title="Chat options"]').click();
  ok(await until(() => document.querySelector('aside.opt-sheet .hk-sec')), 'the ⋯ panel has "Hooks: when… then…"');
  const sec = () => document.querySelector('aside.opt-sheet .hk-sec');
  ok(/None yet/.test(sec().textContent), 'none yet');
  [...sec().querySelectorAll('button')].find((b) => /Add a hook/.test(b.textContent)).click(); await wait(100);
  const form = sec().querySelector('.hk-form');
  out.events = [...form.querySelectorAll('select[aria-label="When"] option')].map((o) => o.textContent);
  ok(out.events.length === 8, `8 events (${out.events})`);
  out.thens = form.querySelectorAll('select[aria-label="Then"] option').length;
  ok(out.thens >= 8, 'then: a message, or a mission');
  ok(!document.body.innerText.includes('/hooks'), 'no command shown');
  const whenSel = form.querySelector('select[aria-label="When"]');
  whenSel.value = 'render'; whenSel.dispatchEvent(new Event('change'));
  form.querySelector('textarea').value = 'Look at the render and tell me one thing to fix';
  [...form.querySelectorAll('button')].find((b) => b.textContent === 'Add').click();
  ok(await until(() => (H.agent(C.id).hooks || []).length === 1), 'saved on the AI (agent.hooks)');
  ok(await until(() => /When a render finishes/.test(sec()?.textContent || '')), 'listed in plain words');
  document.querySelector('aside.opt-sheet .opt-head button[title^="Close"]')?.click();

  // ---------- a render finishes: the message, the mark, the note ----------
  ok(Hooks.emit('render', { title: 'Loop', output: '/tmp/r/loop.mp4' }) === 1, 'a render reaches the hook');
  ok(await until(() => lastUser()?.hook), 'it sent a message');
  const m = lastUser();
  out.sent = m.text;
  ok(m.text.startsWith('> ⚡ From Hearth (hook): A render finished: Loop → /tmp/r/loop.mp4') && m.text.endsWith('Look at the render and tell me one thing to fix'), 'Hearth\'s line on top, your words as written');
  ok(await until(() => v.list.querySelector('.msg.hook-msg .hook-chip')), '"⚡ hook" on the message');
  ok([...v.list.querySelectorAll('.msg.note')].some((n) => /⚡ hook · When a render finishes/.test(n.textContent)), 'a ⚡ hook note');
  await idle();
  // once a minute: the next render waits (the newest news goes)
  Hooks.emit('render', { title: 'Second', output: '/tmp/r/2.mp4' });
  ok(Hooks.waiting().length === 1, 'once a minute: the next one waits');
  const n0 = Native.current(C.id).messages.length; await wait(1500);
  ok(Native.current(C.id).messages.length === n0, 'not sent within the minute');

  // ---------- the Lab's error event, while the AI answers: it waits its turn ----------
  const a2 = H.agent(C.id);
  a2.hooks = [...a2.hooks, { id: 'hkerr', on: true, when: { kind: 'labError' }, then: { kind: 'message', text: 'Fix it please' } }];
  Native.sendText(C.id, 'slow reply please'); await until(() => Native.isAgentBusy(C.id), 4000);
  dispatchEvent(new CustomEvent('hearth:lab-error', { detail: { message: 'boom is not defined', line: 7 } }));
  ok(Hooks.waiting().includes('hkerr'), 'busy: the hook waits');
  ok(!lastUser().hook || lastUser().text === 'slow reply please', 'not sent while it answers');
  await idle();
  ok(await until(() => lastUser()?.hook?.id === 'hkerr', 6000), 'sent once the reply ended');
  ok(/The Lab scene shows an error: boom is not defined \(line 7\)/.test(lastUser().text), 'with the error line');
  await idle();

  // ---------- a file lands in a watched folder (main process) ----------
  const dir = `/tmp/hearth-hooks-check-${Date.now().toString(36)}`;
  await window.hub.fs.write(`${dir}/.keep`, '').catch(() => {}); // (a hidden file: never counts)
  const made = await window.hub.fs.stat(dir).catch(() => null);
  A = A0 && H.agent(A0.id); // (a config save hands out fresh agent objects)
  if (made && A) {
    A.hooks = [{ id: 'hkfile', on: true, when: { kind: 'file', dir }, then: { kind: 'message', text: 'Tell me what this file is' } }];
    Hooks.syncWatch(); await wait(400);
    await window.hub.fs.write(`${dir}/brief.txt`, 'hello');
    const astraUser = () => [...(Native.current(A.id)?.messages || [])].reverse().find((x) => x.role === 'user');
    ok(await until(() => astraUser()?.hook?.id === 'hkfile', 8000), 'a new file in the folder: the other AI got it');
    ok(/A new file appeared in .*: .*brief\.txt/.test(astraUser()?.text || ''), 'with the file\'s path');
    await until(() => !Native.isAgentBusy(A.id), 30000);
  } else fail.push('could not make the test folder');

  // ---------- another AI replies; a reply to a hook sets nothing off ----------
  A = A0 && H.agent(A0.id);
  if (A) {
    A.hooks = [{ id: 'hkreply', on: true, when: { kind: 'reply', from: C.id }, then: { kind: 'message', text: 'Add one idea to that' } }];
    const before = (Native.current(A.id)?.messages || []).length;
    // the last Claude reply answered a hook: nothing
    Native.hooks.finish.forEach((fn) => { try { fn({ type: 'done', text: 'x' }, Native.current(C.id)); } catch { /* others */ } });
    await wait(400);
    ok((Native.current(A.id)?.messages || []).length === before && !Hooks.waiting().includes('hkreply'), 'a reply to a hook sets off no other hook');
    Native.sendText(C.id, 'a plain question'); await wait(300); await idle();
    const lastA = () => [...(Native.current(A.id)?.messages || [])].reverse().find((x) => x.role === 'user');
    ok(await until(() => lastA()?.hook?.id === 'hkreply' || Hooks.waiting().includes('hkreply'), 8000), 'Claude replied: Astra\'s hook fired');
    out.replyFact = lastA()?.text?.split('\n')[0];
    await until(() => !Native.isAgentBusy(A.id), 30000);
    A.hooks = undefined;
  }

  // ---------- a mission as the action ----------
  const a3 = H.agent(C.id);
  a3.hooks = [{ id: 'hkmis', on: true, when: { kind: 'board' }, then: { kind: 'mission', mission: 'debate', text: 'Which of these fits the intro?' } }];
  Missions.set(C.id, 'jam'); // your own pick for the next message stays yours
  Hooks.emit('board', { n: 2, board: 'Intro' });
  ok(await until(() => lines.some((l) => l.startsWith('/debate > ⚡ From Hearth (hook): 2 new things on the mood board “Intro”'))), `the mission ran with the message (${lines.at(-1)})`);
  ok(Missions.current(C.id).id === 'jam', 'your next-message mission is kept');
  Missions.set(C.id, 'normal');

  // ---------- pause all, /hooks ----------
  Hooks.setPaused(true);
  ok(Hooks.emit('board', { n: 1, board: 'x' }) === 0, 'paused: nothing fires');
  const said = []; await Commands.tryRun('/hooks', C.id, undefined, { say: (t) => said.push(t) });
  out.cmd = said.join(' ');
  ok(/all paused/.test(out.cmd), '/hooks lists them (paused)');
  Hooks.setPaused(false);
  a3.hooks = undefined; await saveConfig();
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
Commands.tryRun = realTry;
return JSON.stringify({ ok: !fail.length, fail, ...out, lines }, null, 1);
