// 🔁 Keep going (routines.js, round 41) with the fake engines: started from ◎ Missions (the card), the rounds go by
// themselves marked 🔁 (never as the owner's), N rounds then it stops; a time limit; forever with a cap stops at the
// cap; the owner writing pauses it (▶ goes on); the same error twice stops it; a permission card during a round pauses
// it; a restart pauses it with a resume prompt; the header chip counts rounds and tokens, each round's message says
// what it cost; ⋯ Reply › Keep going from here…, ⋯ AI setup lists it with ■ Stop, ◉ Activity lists the rounds;
// Astra (Codex) works the same.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/routines.js --shot /tmp/routines.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
try {
  await Lazy.load('routines');
  const R = Routines;
  R._test.scale(0.02); // waits × 0.02 (the 2.5 s settle is 50 ms here)
  const C = H.claudeAgent(); activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const v = Native.view(C.id);
  const chat = () => Native.chatOf(C.id);
  const idle = (id = C.id) => until(() => !Native.isAgentBusy(id), 30000);
  const routineMsgs = () => (chat()?.messages || []).filter((m) => m.role === 'user' && m.routine);
  const chipText = () => (v.rtChip && !v.rtChip.hidden ? v.rtChip.querySelector('.rt-chip-label').textContent : '');
  const live = () => R.forChat(chat()?.id);
  const ended = (id) => until(() => !['running', 'paused'].includes(R.get(id)?.status), 30000);
  const notes = () => [...v.list.querySelectorAll('.msg.note')].map((n) => n.textContent);

  // ---------- ◎ Missions › More › 🔁 Keep going…: the card, your message first, then 2 rounds by themselves ----------
  v.root.querySelector('.ms-btn').click(); await wait(200);
  const pick = [...document.querySelectorAll('.ms-pop .ms-pick')].find((b) => /Keep going/.test(b.textContent));
  ok(pick && pick.closest('.ms-more'), '◎ Missions › More has 🔁 Keep going…');
  pick?.click(); await wait(100);
  const input = v.root.querySelector('textarea');
  input.value = 'Make the intro punchier'; input.dispatchEvent(new Event('input', { bubbles: true }));
  v.root.querySelector('form.composer').requestSubmit();
  ok(await until(() => document.querySelector('dialog.rt-dlg[open]'), 4000), 'sending opens the Keep going card');
  const dlg = document.querySelector('dialog.rt-dlg');
  out.card = { words: dlg.querySelector('.rt-words').value, how: [...dlg.querySelectorAll('.rt-opt')].map((b) => b.textContent), pause: [...dlg.querySelectorAll('select[aria-label="Pause between rounds"] option')].map((o) => o.textContent) };
  ok(/next 5 improvements/.test(out.card.words), 'prefilled with sensible words');
  ok(out.card.how.join('|') === '30 min|1 h|3 h|Until…|Extra rounds|Until I stop it', `how long: ${out.card.how}`);
  ok(out.card.pause.length === 4 && /idle 10 min/.test(out.card.pause[2]) && /written for an hour/.test(out.card.pause[3]), 'pause between rounds: none · 1 min · idle 10 min · not written for an hour');
  [...dlg.querySelectorAll('.rt-opt')].find((b) => b.textContent === 'Until I stop it').click(); await wait(50);
  ok(![...dlg.querySelectorAll('select[aria-label="Spending cap"] option')].some((o) => o.textContent === 'No cap'), 'forever: a cap is required (no "No cap")');
  [...dlg.querySelectorAll('.rt-opt')].find((b) => b.textContent === 'Extra rounds').click(); await wait(50);
  ok([...dlg.querySelectorAll('select[aria-label="Spending cap"] option')].some((o) => o.textContent === 'No cap'), 'a short routine may go without one');
  dlg.querySelector('.rt-num').value = '2';
  dlg.querySelector('.rt-words').value = 'Keep improving: do the next 2 improvements, then summarise.';
  dlg.querySelector('button[type=submit]').click();
  ok(await until(() => chat()?.messages.some((m) => m.role === 'user' && m.text === 'Make the intro punchier' && !m.routine)), 'your message went first, as yours');
  const r1 = await until(() => live(), 5000) && live();
  ok(r1 && r1.how.rounds === 2, 'the routine runs on this chat');
  ok(await until(() => /^🔁 \d of 2 · ≈ /.test(chipText())), `the header chip (${chipText()})`);
  ok(await ended(r1.id), 'it ends by itself');
  const rr = R.get(r1.id);
  out.r1 = { status: rr.status, why: rr.why, done: rr.done, tokens: rr.tokens, msgs: routineMsgs().length };
  ok(rr.status === 'done' && rr.done === 2 && routineMsgs().length === 2, `N rounds then stops (${JSON.stringify(out.r1)})`);
  ok(routineMsgs().every((m) => m.text === 'Keep improving: do the next 2 improvements, then summarise.' && m.routine.n >= 1), 'each round: the routine\'s words, marked as the routine\'s');
  await wait(300);
  const chips = [...v.list.querySelectorAll('.msg.routine-msg .rt-msg-chip')].map((c) => c.textContent);
  out.msgChips = chips;
  ok(chips.length === 2 && /round 1 of 2 · ≈ \d+k? tokens/.test(chips[0]), `🔁 on each round's message with its cost (${chips})`);
  ok(rr.tokens > 0 && rr.rounds.every((x) => x.tokens > 0) && rr.tokens === rr.rounds.reduce((n, x) => n + x.tokens, 0), 'the tokens add up per round');
  ok(notes().some((t) => /Keep going finished: all 2 rounds done/.test(t)), 'a calm note when it finishes');
  ok(v.rtChip?.hidden !== false, 'the chip goes when it ends');
  const perRound = Math.round(rr.tokens / rr.done);
  out.perRound = perRound;
  ok((Activity?.history?.() || []).some((e) => /Keep going: round 2 of 2 done/.test(e.text)), '◉ Activity lists each round');

  // ---------- ⋯ › Reply › 🔁 Keep going from here… ----------
  const ix = chat().messages.length - 1;
  const items = Native.hooks.msgMenu.flatMap((fn) => fn(C.id, ix, chat().messages[ix], chat()));
  ok(items.some((x) => x.label === '🔁 Keep going from here…'), 'a reply\'s ⋯ › Reply has "Keep going from here…"');
  const node = v.list.querySelector(`.msg[data-index="${ix}"] .msg-more`);
  if (node) {
    node.click(); await wait(150);
    const reply = [...document.querySelectorAll('#menu button')].find((b) => /^Reply/.test(b.textContent));
    reply?.click(); await wait(150);
    const kg = [...document.querySelectorAll('#menu button, #menu-fly button')].find((b) => /Keep going from here/.test(b.textContent));
    ok(kg, 'shown in the menu');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelector('#menu')?.classList.remove('open');
  }

  // ---------- the owner writes: paused; ▶ goes on ----------
  const spec = (o) => ({ prompt: 'Do the next improvement.', how: { kind: 'rounds', rounds: 5 }, pause: 'none', cap: 0, ...o });
  const r2 = await R.start(C.id, spec(), { chatId: chat().id });
  ok(await until(() => R.get(r2.id).done >= 1), 'round 1 went');
  await idle();
  await Native.send(C.id, 'Hold on, use the ember palette');
  ok(await until(() => R.get(r2.id).status === 'paused'), 'you wrote: paused');
  ok(/you wrote/.test(R.get(r2.id).why) && notes().some((t) => /paused: you wrote/.test(t)), 'it says why, in the chat');
  await idle(); await wait(400);
  const n2 = R.get(r2.id).round;
  ok(R.get(r2.id).round === n2 && chat().messages.at(-1).role === 'assistant', 'no round after your message\'s reply');
  ok(/^❚❚/.test(chipText()), `the chip shows it paused (${chipText()})`);
  // ⋯ AI setup lists it with ■ Stop
  v.root.querySelector('.native-head button[aria-label="Chat options"]').click();
  ok(await until(() => document.querySelector('aside.opt-sheet [data-fold="routines"]')), '⋯ AI setup has 🔁 Keep going');
  const setup = document.querySelector('aside.opt-sheet [data-fold="routines"]');
  ok(setup && [...setup.querySelectorAll('button')].some((b) => /Stop/.test(b.textContent)), '…with ■ Stop');
  document.querySelector('aside.opt-sheet .opt-head button[title^="Close"]')?.click();
  v.rtChip.querySelector('.rt-toggle').click(); // ▶
  ok(await until(() => R.get(r2.id).round > n2), '▶ Resume: the next round goes');
  await idle();
  v.rtChip.querySelector('.rt-stop').click();
  ok(R.get(r2.id).status === 'stopped', '■ in the chip stops it');
  await idle(); await wait(300);

  // ---------- a time limit ----------
  const r3 = await R.start(C.id, spec({ how: { kind: 'time', ms: 60000 } }), { chatId: chat().id });
  ok(await until(() => R.get(r3.id).done >= 1), 'a timed routine runs');
  R.get(r3.id).endAt = Date.now() - 1; // the time is up
  ok(await ended(r3.id), 'it ends at its time');
  ok(R.get(r3.id).status === 'done' && /time is up/.test(R.get(r3.id).why), `time limit (${R.get(r3.id).why})`);
  await idle(); await wait(300);

  // ---------- forever with a cap: stops at the cap ----------
  const capN = Math.round(perRound * 2.5);
  const r4 = await R.start(C.id, spec({ how: { kind: 'forever' }, cap: capN }), { chatId: chat().id });
  ok(await ended(r4.id), 'forever with a cap ends');
  const x4 = R.get(r4.id);
  out.cap = { cap: capN, done: x4.done, tokens: x4.tokens, why: x4.why };
  ok(x4.status === 'stopped' && /token budget/.test(x4.why) && x4.tokens <= capN * 1.3 && x4.done >= 1, `stops at the cap (${JSON.stringify(out.cap)})`);
  await idle(); await wait(300);

  // ---------- an error without usage pauses, rather than assuming a free retry ----------
  const r5 = await R.start(C.id, spec({ prompt: 'error please' }), { chatId: chat().id });
  ok(await until(()=>R.get(r5.id).status==='paused'), 'missing usage pauses the loop');
  const x5 = R.get(r5.id);
  ok(x5.status === 'paused' && x5.usageUnknown && x5.round === 1, `unknown usage → pause (${x5.why}, ${x5.round})`);
  R.stop(r5.id);
  await idle(); await wait(300);

  // ---------- a permission card during a round: paused (never answered by the routine) ----------
  const r6 = await R.start(C.id, spec({ prompt: 'slow reply please' }), { chatId: chat().id });
  ok(await until(() => R.get(r6.id).inFlight && Native.isBusy(chat().id)), 'a slow round runs');
  document.dispatchEvent(new CustomEvent('hearth:needs-you', { detail: { kind: 'permission', agentId: C.id, chatId: chat().id, who: C.name, text: 'wants to delete: a.txt' } }));
  ok(await until(() => R.get(r6.id).status === 'paused', 30000), 'paused after the round');
  ok(/asked for your OK/.test(R.get(r6.id).why) && R.get(r6.id).round === 1, `it waits for you (${R.get(r6.id).why})`);
  await wait(400);
  ok(R.get(r6.id).round === 1, 'no next round on its own');

  // ---------- a restart: paused with a resume prompt ----------
  R.resume(r6.id);
  await until(() => R.get(r6.id).inFlight, 5000);
  await idle();
  store.set('routines.list', R.list()); // what pagehide writes
  R._test.reload(); R._test.afterStart();
  const x6 = R.get(r6.id);
  ok(x6.status === 'paused' && /restarted/.test(x6.why), `after a restart: paused (${x6.why})`);
  ok(await until(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /when Hearth closed\. Resume\?/.test(t.textContent))), 'the resume prompt');
  R.stop(r6.id);
  await idle(); await wait(300);

  // ---------- Astra (Codex) works the same ----------
  const A = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex' && !a.dock);
  if (A) {
    activate(A.id); await until(() => Native.hasView(A.id)); Native.newChat(A.id); await wait(200);
    await Native.send(A.id, 'Hello Astra'); await idle(A.id);
    const r7 = await R.start(A.id, spec({ how: { kind: 'rounds', rounds: 1 } }), { chatId: Native.chatOf(A.id).id });
    ok(await ended(r7.id), 'Astra: ends');
    ok(R.get(r7.id).status === 'done' && R.get(r7.id).done === 1 && R.get(r7.id).tokens > 0, `Astra: 1 round, costed (${R.get(r7.id).tokens})`);
    activate(C.id); await wait(200);
  }
  out.activity = (Activity?.history?.() || []).filter((e) => /Keep going/.test(e.text)).length;
  ok(!document.body.innerText.includes('/keepgoing'), 'no command shown');
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
