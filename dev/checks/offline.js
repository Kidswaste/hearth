// Offline (round 34): calm when things go wrong outside Hearth, end to end with the fake engines' switches
// (dev/fake-common.js) and a simulated internet (Offline._test.net: what the internet check answers, + the window's
// online / offline events). Each case shows one plain line with its one action:
//   no internet after a send → "No internet — will send when you're back", sent again once the internet is back (once)
//   busy (529) → "Claude is busy right now — retrying in N s", retried by itself; bounded (3 tries); Cancel stops it;
//     "Ask Astra instead" sends the message to Astra
//   usage limit → "Usage limit reached until <local time> — switch to Astra?" (Claude's epoch form and "resets 6pm
//     (Europe/Paris)"), Switch works, no extra toast
//   signed out → "Signed out — Sign in" (the existing sign-in button), Retry after it answers
//   VPN / proxy → its line + Retry
//   a reply cut off → Continue (online again) or resumes by itself once back online (offline; "while the computer
//     slept" after a wake); the continuation is stitched in: one reply, word for word the uncut one, same session
//   typed while offline → waits in the box as a chip (cancellable), the draft and the chat's own queue too; after a
//     restart (page reload) they're all still there, then go out once the internet is back, each exactly once
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/offline.js
const { step, wait, until, click } = J;
// hub.kvSet returns before the store thread has written the file: the fake engine reads the file, so wait until it
// holds these switches (a fake started right after could read the previous step's switches under load)
const kvDir = `${String(await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '')}/kv`;
const sw = async (o) => {
  await window.hub.kvSet('fake-switches', o);
  const want = JSON.stringify(o);
  // (listed first: reading a file that isn't there yet would log an error in the main process)
  const there = async () => ((await window.hub.fs.list(kvDir).catch(() => [])) || []).some((f) => (f.name || f) === 'fake-switches.json');
  const ok = await until(async () => { if (!(await there())) return false; try { return JSON.stringify(JSON.parse(await window.hub.fs.read(`${kvDir}/fake-switches.json`))) === want; } catch { return false; } }, 5000);
  if (!ok) await wait(800);
};
const claude = H.claudeAgent();
const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const chatOf = (id) => Native.chatOf(id);
const list = (id) => Native.view(id)?.list;
const errNode = (id) => [...(list(id)?.querySelectorAll('.msg.error') || [])].at(-1) || null;
const lineOf = (id) => (errNode(id)?.querySelector('.net-line')?.textContent || '').replace(/ /g, ' ').trim();
const btn = (id, re) => [...(errNode(id)?.querySelectorAll('.net-act') || [])].find((b) => re.test(b.textContent));
const idle = (id) => until(() => H.activeChat[id] && !Native.isBusy(H.activeChat[id]), 60000);
const users = (id, text) => (chatOf(id)?.messages || []).filter((m) => m.role === 'user' && m.text === text).length;
const fresh = async (id) => { activate(id); await wait(250); Native.newChat(id); await wait(150); };
const ask = async (id, text) => { await Native.send(id, text); await wait(300); await idle(id); await wait(400); return chatOf(id).messages.at(-1); };
const lastRole = (id) => chatOf(id)?.messages.at(-1)?.role;
const toastsNow = () => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent);

await Offline.ready;
Offline._test.scale(0.05); // waits × 0.05: the 20 s busy retry takes 1 s here
Offline._test.net(true);
await sw({});
step('the offline module is in (queue empty, online)', Offline.isOnline() && !Offline.items().length);

// ---------- 1. no internet after a send: the message waits, then goes out once ----------
await fresh(claude.id);
Offline._test.net(false);
await sw({ claudeNetwork: 'always' });
await Native.send(claude.id, 'hello over flaky wifi');
await until(() => lastRole(claude.id) === 'error', 20000); await wait(400);
step('no internet: one plain line "No internet — will send when you\'re back"', lineOf(claude.id) === 'No internet — will send when you\'re back', lineOf(claude.id));
step('… with Cancel, and the message waits in the queue', Boolean(btn(claude.id, /^Cancel$/)) && Offline.items().some((x) => x.kind === 'retry' && x.reason === 'offline'), Offline.items());
step('… Hearth knows it is offline', !Offline.isOnline());
await smoke({ shot: '/tmp/offline-1-no-internet.png' });
await sw({});
Offline._test.net(true);
dispatchEvent(new Event('online'));
await until(() => lastRole(claude.id) === 'assistant', 30000); await idle(claude.id); await wait(500);
dispatchEvent(new Event('online')); await Offline.pump(); await wait(1500);
step('back online: it sent itself, exactly once (one question, one answer, the line gone)', users(claude.id, 'hello over flaky wifi') === 1 && lastRole(claude.id) === 'assistant' && !chatOf(claude.id).messages.some((m) => m.role === 'error') && !Offline.items().length, chatOf(claude.id).messages.map((m) => m.role));

// ---------- 2. busy: bounded automatic retries, Cancel, Ask Astra instead ----------
await fresh(claude.id);
await sw({ claudeBusy: '1' });
await Native.send(claude.id, 'are you there');
await until(() => lastRole(claude.id) === 'error', 20000);
const busyLine = lineOf(claude.id);
step('busy (529 overloaded): "Claude is busy right now — retrying in N s"', /^Claude is busy right now — retrying in \d+ s$/.test(busyLine), busyLine);
step('… with Cancel and "Ask Astra instead"', Boolean(btn(claude.id, /^Cancel$/)) && Boolean(btn(claude.id, new RegExp(`Ask ${astra.name} instead`))));
await smoke({ shot: '/tmp/offline-2-busy.png' });
await until(() => lastRole(claude.id) === 'assistant', 20000); await idle(claude.id); await wait(300);
step('it retried by itself and the answer came (the question once)', lastRole(claude.id) === 'assistant' && users(claude.id, 'are you there') === 1 && !chatOf(claude.id).messages.some((m) => m.role === 'error'));

await fresh(claude.id);
await sw({ claudeBusy: 'always' });
await Native.send(claude.id, 'still busy?');
await until(() => chatOf(claude.id)?.messages.at(-1)?.net?.gaveUp, 30000); await idle(claude.id); await wait(1500);
const tries = Offline._test.attempts.get(H.activeChat[claude.id]);
step('bounded: three automatic retries, then it stops ("try again in a moment, or ask Astra")', tries === 4 && /^Claude is busy right now — try again in a moment, or ask /.test(lineOf(claude.id)) && !Offline.items().length && users(claude.id, 'still busy?') === 1, { tries, line: lineOf(claude.id) });
step('… Retry and Ask Astra instead are its actions', Boolean(btn(claude.id, /^Retry$/)) && Boolean(btn(claude.id, /instead/)));

await fresh(claude.id);
await Native.send(claude.id, 'cancel me');
await until(() => lastRole(claude.id) === 'error', 20000); await wait(300);
await click(btn(claude.id, /^Cancel$/));
await wait(2500);
step('Cancel: no more retries (still the one line, nothing waits)', lastRole(claude.id) === 'error' && !Offline.items().length && Offline._test.attempts.get(H.activeChat[claude.id]) === undefined && /try again in a moment/.test(lineOf(claude.id)), lineOf(claude.id));
const fromChat = H.activeChat[claude.id];
await click(btn(claude.id, /instead/));
await until(() => H.activeChat[astra.id] && Native.isBusy(H.activeChat[astra.id]), 10000);
await idle(astra.id); await wait(400);
const ac = chatOf(astra.id);
step('"Ask Astra instead": Astra got the message in a new chat and answered', ac?.handoffFrom === fromChat && users(astra.id, 'cancel me') === 1 && ac.messages.at(-1)?.role === 'assistant', ac?.messages.map((m) => m.role));

// ---------- 3. usage limit: the reset time in local time, Switch to Astra ----------
const d = new Date(); d.setHours(18, 0, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
await fresh(claude.id);
await sw({ claudeLimit: 'always', limitAt: d.getTime() });
const toastsBefore = toastsNow().length;
await ask(claude.id, 'one more question');
const want = `Usage limit reached until ${OfflineCore.clock(d.getTime())} — switch to ${astra.name}?`.replace(/ /g, ' ');
step('usage limit: "Usage limit reached until <reset, local time> — switch to Astra?"', lineOf(claude.id) === want, { got: lineOf(claude.id), want });
step('… no second toast about it', !toastsNow().slice(toastsBefore).some((t) => /usage limit/i.test(t)), toastsNow());
await smoke({ shot: '/tmp/offline-3-limit.png' });
await click(btn(claude.id, /^Switch to /));
await until(() => users(astra.id, 'one more question') === 1, 10000); await idle(astra.id); await wait(300);
step('Switch: Astra answers it', chatOf(astra.id)?.messages.at(-1)?.role === 'assistant' && users(astra.id, 'one more question') === 1);
await fresh(claude.id);
await sw({ claudeLimit: 'always', limitForm: 'zone' });
await ask(claude.id, 'and now?');
const paris = OfflineCore.clock(OfflineCore.parseReset('resets 6pm (Europe/Paris)'));
step('"resets 6pm (Europe/Paris)" is shown in this computer\'s time', lineOf(claude.id).startsWith(`Usage limit reached until ${paris}`.replace(/ /g, ' ')), { got: lineOf(claude.id), paris });

// ---------- 4. signed out / proxy ----------
await fresh(claude.id);
await sw({ claudeExpired: true });
await ask(claude.id, 'signed in?');
const lb = errNode(claude.id)?.querySelector('.net-line .login-btn');
step('sign-in expired: "Signed out — Sign in" (the existing sign-in button)', /^Signed out —\s*Sign in$/.test(lineOf(claude.id)) && Boolean(lb) && !errNode(claude.id)?.querySelector(':scope > .login-btn'), lineOf(claude.id));
await sw({});
errNode(claude.id)?.querySelector('[data-msg-act="retry"]')?.click(); // (after signing in in its window)
await until(() => lastRole(claude.id) === 'assistant', 20000); await idle(claude.id);
step('Retry after signing in answers (the question once)', lastRole(claude.id) === 'assistant' && users(claude.id, 'signed in?') === 1);
await fresh(claude.id);
await sw({ claudeProxy: 'always' });
await ask(claude.id, 'through the vpn');
step('a VPN / proxy in the way: its line + Retry', /VPN or proxy/.test(lineOf(claude.id)) && Boolean(btn(claude.id, /^Retry$/)), lineOf(claude.id));
await sw({});

// ---------- 5. a reply cut off: Continue, stitched in ----------
await fresh(claude.id);
const whole = (await ask(claude.id, 'tell me the long plan')).text;
await fresh(claude.id);
await sw({ claudeCut: '1' });
await ask(claude.id, 'tell me the long plan');
step('cut off mid-reply: "Reply cut off — the connection dropped" + Continue (the part written stays)', lineOf(claude.id) === 'Reply cut off — the connection dropped' && Boolean(btn(claude.id, /^Continue$/)) && chatOf(claude.id).messages.at(-2)?.stopped, lineOf(claude.id));
const sid = chatOf(claude.id).session?.id;
await click(btn(claude.id, /^Continue$/));
await until(() => lastRole(claude.id) === 'assistant' && !Native.isBusy(H.activeChat[claude.id]), 20000); await wait(600);
let ms = chatOf(claude.id).messages;
step('Continue: one reply, word for word the uncut one (the repeated words dropped), no "continue" line left', ms.length === 2 && ms[1].text.trim() === whole.trim() && !ms[1].stopped && ms[1].resumed === 1, { roles: ms.map((m) => m.role), got: ms[1]?.text.slice(-80), want: whole.slice(-80) });
step('… on the same engine session (only a short line was sent, not the conversation)', Boolean(sid) && chatOf(claude.id).session?.id === sid);

await fresh(claude.id);
await sw({ claudeCut: '2' });
Offline._test.power('resume');
Offline._test.net(false);
await ask(claude.id, 'tell me the long plan');
await until(() => /will continue when you're back/.test(lineOf(claude.id)), 8000);
step('cut off while offline after a wake: "Reply cut off (while the computer slept) — will continue when you\'re back" + Cancel', lineOf(claude.id) === 'Reply cut off (while the computer slept) — will continue when you\'re back' && Boolean(btn(claude.id, /^Cancel$/)), lineOf(claude.id));
Offline._test.net(true);
dispatchEvent(new Event('online'));
await until(() => lastRole(claude.id) === 'assistant' && chatOf(claude.id).messages.length === 2, 30000); await idle(claude.id); await wait(600);
ms = chatOf(claude.id).messages;
step('back online it resumed by itself: the same single reply', ms.length === 2 && ms[1].text.trim() === whole.trim() && !Offline.items().length, ms.map((m) => m.role));
await sw({});

// ---------- 6. typed while offline, a draft, the chat's own queue: then a restart ----------
await fresh(astra.id);
await Native.send(astra.id, 'quiet:12 story please'); // 12 s of silence: still running at the restart
const quietEnd = Date.now() + 14000;
await wait(400);
await click(Native.view(astra.id).input); await J.type('queued behind a running reply'); await J.key('Enter'); await wait(200);
step('the chat\'s own queue holds a message typed while the reply runs', (Native.view(astra.id).queue || []).includes('queued behind a running reply'));
const astraChat = H.activeChat[astra.id];
await fresh(claude.id);
Offline._test.net(false);
dispatchEvent(new Event('offline'));
await wait(100);
await click(Native.view(claude.id).input); await J.type('sent while offline'); await J.key('Enter'); await wait(300);
const chip = Native.view(claude.id).root.querySelector('.offline-chips .offline-chip');
step('typed while offline: it waits as a chip in the box (cancellable), the box is empty', Boolean(chip?.querySelector('button')) && /sent while offline/.test(chip?.textContent || '') && !Native.view(claude.id).input.value, chip?.textContent);
step('… one line says so: "No internet — will send when you\'re back"', [...list(claude.id).querySelectorAll('.msg.note')].some((n) => /No internet — will send when you're back/.test(n.textContent)));
step('… nothing went to the engine', !chatOf(claude.id)?.messages?.length);
await click(Native.view(claude.id).input); await J.type('a draft kept across a restart'); await wait(900);
await smoke({ shot: '/tmp/offline-6-queued.png' });
localStorage.setItem('offline.check', JSON.stringify({ astraChat, quietEnd }));
return J.done();
//@@ reload
const { step, wait, until } = J;
const claude = H.claudeAgent();
const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const T = JSON.parse(localStorage.getItem('offline.check') || '{}');
await Offline.ready;
const items = Offline.items();
step('after a restart the queue is still there: the offline message and the chat\'s own queued one', items.some((x) => x.text === 'sent while offline') && items.some((x) => x.text === 'queued behind a running reply' && x.chatId === T.astraChat), items.map((x) => `${x.kind}:${x.reason}:${x.text}`));
activate(claude.id); await wait(500);
step('… shown as a chip again in its box', /sent while offline/.test(Native.view(claude.id).root.querySelector('.offline-chips')?.textContent || ''));
step('… and the draft is back in the box', /a draft kept across a restart/.test(Native.view(claude.id).input.value), Native.view(claude.id).input.value);
await Commands.tryRun('/offline', claude.id); await wait(300);
step('/offline lists what waits', /No internet · 2 waiting/.test(J.lastNote(claude.id)) || /2 waiting/.test([...Native.view(claude.id).list.querySelectorAll('.msg.note')].map((n) => n.textContent).join(' ')));
Native.view(claude.id).input.value = ''; Native.view(claude.id).input.dispatchEvent(new Event('input', { bubbles: true }));
await wait(Math.max(0, (T.quietEnd || 0) - Date.now())); // the reply that ran at the restart has ended (the engine kept it)
Offline._test.net(true);
dispatchEvent(new Event('online'));
const sentTo = async (agentId, text) => { for (const c of H.chats.filter((x) => x.agentId === agentId)) { const chat = await Native.load(c.id); const n = chat?.messages.filter((m) => m.role === 'user' && m.text === text).length || 0; if (n) return { n, chat }; } return { n: 0 }; };
await until(async () => (await sentTo(claude.id, 'sent while offline')).n && (await sentTo(astra.id, 'queued behind a running reply')).n, 40000);
await until(() => !Offline.items().length && !H.agents().some((a) => Native.isAgentBusy(a.id)), 60000); await wait(800);
dispatchEvent(new Event('online')); await Offline.pump(); await wait(2500);
const a1 = await sentTo(claude.id, 'sent while offline');
const a2 = await sentTo(astra.id, 'queued behind a running reply');
step('back online: both went out, each exactly once, and were answered', a1.n === 1 && a2.n === 1 && a1.chat.messages.at(-1).role === 'assistant' && a2.chat.messages.at(-1).role === 'assistant', { claude: a1.n, astra: a2.n });
step('the queue on disk is empty', ((await window.hub.kvGet('offline-queue', [])) || []).length === 0);
step('the chip and its line are gone', !Native.view(claude.id).root.querySelector('.offline-chips .offline-chip'));
Offline._test.net(null);
await window.hub.kvSet('fake-switches', {});
return J.done();
