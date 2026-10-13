// ◎ Missions (missions.js): the chat box's ◎ lists them; a mission changes how the next message goes, once (or 📌
// from now on); your words go out as written. Commands behind them are recorded here, not run (their own checks).
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/missions.js --shot /tmp/missions.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const lines = [];
const realTry = Commands.tryRun;
Commands.tryRun = async (text, ...rest) => { if (/^\/(council|debate|duo|jam|pair|all|crew|opinion)\b/.test(text)) { lines.push(text); return true; } return realTry(text, ...rest); };
try {
  const C = H.claudeAgent(); activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const v = Native.view(C.id);
  const btn = v.root.querySelector('.ms-btn');
  ok(btn && btn.textContent === '◎', 'the ◎ button is in the chat box');
  const type = async (t) => { const i = v.root.querySelector('textarea'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); v.root.querySelector('form.composer').requestSubmit(); await wait(300); };

  // the picker
  btn.click(); await wait(200);
  out.cards = [...document.querySelectorAll('.ms-pop .ms-pick b')].map((b) => b.textContent);
  ok(out.cards.length >= 8, `the missions (${out.cards})`);
  [...document.querySelectorAll('.ms-pop .ms-pick')].find((b) => /Debate/.test(b.textContent)).click(); await wait(100);
  ok(!document.querySelector('.ms-pop') && /Debate/.test(btn.textContent) && btn.classList.contains('on'), 'picked: the button says Debate');
  await type('Is a 9:16 loop better at 120 or 128 bpm?');
  ok(lines.at(-1) === '/debate Is a 9:16 loop better at 120 or 128 bpm?', `sent as a debate (${lines.at(-1)})`);
  ok(btn.textContent === '◎', 'next message only: back to normal');

  // 📌 from now on
  Missions.set(C.id, 'duo', { keep: true }); await wait(50);
  await type('one'); await type('two');
  ok(lines.filter((l) => l.startsWith('/duo')).length === 2 && /📌/.test(btn.textContent), 'from now on: every message');
  btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(50);
  ok(Missions.current(C.id).id === 'normal' && btn.textContent === '◎', 'right-click ◎: back to a normal reply');

  // split it up: agents on for this message only
  Missions.set(C.id, 'split');
  await type('Build me a tiny site with three pages');
  const chat = Native.current(C.id);
  ok(chat?.subagents === true, 'Split it up: this message may deploy agents');
  await until(() => !Native.isBusy(chat), 30000); await wait(800);
  ok(!chat.subagents, 'and it is off again after the reply');

  // answer, then review
  Missions.set(C.id, 'review');
  await type('Write a haiku about kick drums');
  await until(() => !Native.isBusy(chat), 30000);
  ok(await until(() => lines.includes('/opinion'), 4000), 'after the reply, the other AI reviews it');

  // in the ⋯ panel too
  v.root.querySelector('.native-head button[aria-label="Chat options"]').click();
  ok(await until(() => document.querySelector('aside.opt-sheet .ms-grid')), 'the ⋯ panel lists them');
  document.querySelector('aside.opt-sheet .opt-head button[title^="Close"]')?.click();
} catch (err) { fail.push(`threw: ${err.message}`); }
Commands.tryRun = realTry;
return JSON.stringify({ ok: !fail.length, fail, ...out, lines }, null, 1);
