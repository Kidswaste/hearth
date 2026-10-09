// Robust (round 9): Hearth against the owner's real installs, with the fake CLIs' failure switches (dev/fake-common.js,
// flipped through data/kv/fake-switches.json): the one calm notice for an old Claude Code with its Update button (run in
// a window, then checked again), sign-in from a failed reply, "too old for the model" → Update under the error →
// Retry works, a dropped connection healed by one more try, Codex cancelling a tool call healed with approvals off,
// /doctor (one card for both engines, fixes as buttons), /astra-doctor = the same card, /engines lists copies.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/robust.js
const { step, wait, until, click } = J;
const sw = (o) => window.hub.kvSet('fake-switches', o);
let since = 0; // toasts from the current step only
const mark = () => { since = Date.now(); };
const toasts = () => recentToasts().filter((t) => t.at >= since).map((t) => t.message);
const toastBtn = (re) => [...document.querySelectorAll('#toasts .toast button')].find((b) => re.test(b.textContent));
const claude = H.claudeAgent();
const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const lastMsg = (id) => Native.chatOf(id)?.messages.at(-1);
const view = (id) => Native.view(id)?.list;
const ask = async (id, text) => { await Native.send(id, text); await wait(300); await until(() => !Native.isBusy(H.activeChat[id]), 60000); await wait(300); return lastMsg(id); };

// 0. a normal start: the check ran by itself, found both fakes, no notice
await until(() => EngineHealth.report()?.claude && EngineHealth.report()?.codex, 15000);
const r0 = EngineHealth.report();
step('the startup check read both engines (version, signed in) without a notice', r0.claude.semver === '2.1.300' && r0.codex.semver === '0.50.0' && r0.claude.signedIn && r0.codex.signedIn && !EngineHealth.problems().length && !toasts().some((t) => /too old|signed in|installed/.test(t)), { claude: r0.claude.version, codex: r0.codex.version });

// 1. an old Claude Code (2.1.1, the owner's): one calm notice, Update in a window, checked again
await sw({ claudeVersion: '2.1.1' });
const r1 = await EngineHealth.check({ fresh: true });
mark();
store.set('engineHealth.seen', {});
EngineHealth.notice(r1);
await wait(200);
step('one calm notice: "Claude Code 2.1.1 is too old (the model needs 2.1.280 or newer)"', toasts().some((t) => /Claude Code 2\.1\.1 is too old.*2\.1\.280/.test(t)), toasts()[0]);
const up = toastBtn(/Update Claude Code/);
step('… with an "Update Claude Code" button', Boolean(up));
mark();
if (up) await click(up);
await until(() => toasts().some((t) => /is ready/.test(t)), 20000);
step('Update ran `claude update` in a window, then "Claude Code 2.1.400 is ready ✓"', toasts().some((t) => /Claude Code 2\.1\.400 is ready/.test(t)) && EngineHealth.report().claude.semver === '2.1.400', toasts().slice(0, 3));
EngineHealth.notice(EngineHealth.report());
step('no notice once it is fixed', !EngineHealth.problems().length);

// 2. signed out: the failed reply has the sign-in button; it signs in in a window, then Retry answers
activate(claude.id); await wait(300);
Native.newChat(claude.id);
await sw({ claudeVersion: '2.1.400', claudeLoggedOut: '1' });
let m = await ask(claude.id, 'hello');
step('a signed-out Claude: "isn\'t signed in" with a sign-in button', m.role === 'error' && m.needsLogin && Boolean(view(claude.id).querySelector('.login-btn')), m.text.slice(0, 80));
mark();
await click(view(claude.id).querySelector('.login-btn'));
await until(() => toasts().some((t) => /is ready and signed in/.test(t)), 20000);
step('the sign-in window ran; Hearth checked again: "ready and signed in"', toasts().some((t) => /ready and signed in/.test(t)), toasts()[0]);
await click(view(claude.id).querySelector('[data-msg-act="retry"]'));
await wait(300); await until(() => !Native.isBusy(H.activeChat[claude.id]), 30000); await wait(300);
step('Retry answers', lastMsg(claude.id).role === 'assistant', lastMsg(claude.id).text.slice(0, 60));

// 3. too old for the model: Update under the error, Retry works
await sw({ claudeVersion: '2.1.400', claudeNeeds: '2.1.500', updateTo: '2.1.600' });
m = await ask(claude.id, 'hello again');
const fixBtn = view(claude.id).querySelector('.engine-fix');
step('"version 2.1.500 or newer is required": the error has "Update Claude Code" under it', m.role === 'error' && m.fixAction === 'update' && /Update Claude Code/.test(fixBtn?.textContent || ''), m.text.slice(0, 120));
await wait(1000);
const fixNow = view(claude.id).querySelector('.engine-fix');
mark();
if (fixNow) await click(fixNow);
await until(() => toasts().some((t) => /2\.1\.600 is ready/.test(t)), 20000);
step('… it updates in a window (2.1.400 → 2.1.600) and says so', toasts().some((t) => /2\.1\.600 is ready/.test(t)));
await click(view(claude.id).querySelector('[data-msg-act="retry"]'));
await wait(300); await until(() => !Native.isBusy(H.activeChat[claude.id]), 30000); await wait(300);
step('Retry answers on the updated copy', lastMsg(claude.id).role === 'assistant');

// 4. a dropped connection: healed by one more try
await sw({ claudeVersion: '2.1.600', claudeNetwork: 'once' });
m = await ask(claude.id, 'think about it');
step('a dropped connection: one more try, the reply arrives (the note is in its thinking)', m.role === 'assistant' && /connection dropped/.test(m.thinking || ''), (m.thinking || '').slice(0, 80));

// 5. Astra: an older Codex cancelling Hearth's tool calls is healed (approvals off), no "Lab access was blocked"
await sw({ codexMcpCancel: 'old' });
activate(astra.id); await wait(300);
Native.newChat(astra.id);
m = await ask(astra.id, 'tools3 please');
step('Codex cancelled a tool call: stopped before it answered, run again with approvals → a real reply', m.role === 'assistant' && !/blocked/.test(m.text) && /approved/.test(m.thinking || ''), (m.thinking || '').slice(0, 100));

// 6. /doctor: one card for both engines, with the fixes as buttons
await sw({ claudeVersion: '2.1.600', codexLoggedOut: '1' });
activate(claude.id); await wait(300);
await Commands.tryRun('/doctor', claude.id);
await until(() => /Doctor/.test(J.lastNote(claude.id)), 20000);
const card = [...view(claude.id).querySelectorAll('.msg.note')].pop();
const ctext = card?.textContent || '';
step('/doctor: both engines, versions, where from, Codex not signed in', /Claude Code/.test(ctext) && /2\.1\.600/.test(ctext) && /Codex/.test(ctext) && /not signed in/.test(ctext) && /Astra and tools/.test(ctext), ctext.slice(0, 200));
const signBtn = [...(card?.querySelectorAll('.note-acts button') || [])].find((b) => /Sign in to Codex/.test(b.textContent));
step('… with "Sign in to Codex" and "Check again" buttons', Boolean(signBtn) && [...card.querySelectorAll('.note-acts button')].some((b) => /Check again/.test(b.textContent)));
mark();
if (signBtn) await click(signBtn);
await until(() => toasts().some((t) => /Codex 0\.50\.0 is ready and signed in/.test(t)), 20000);
step('the card\'s sign-in works (Codex ready and signed in)', toasts().some((t) => /Codex 0\.50\.0 is ready and signed in/.test(t)));
activate(astra.id); await wait(300);
await Commands.tryRun('/astra-doctor', astra.id);
await until(() => /Doctor/.test(J.lastNote(astra.id)), 20000);
step('/astra-doctor is the same card (old name kept)', /Doctor/.test(J.lastNote(astra.id)));
activate(claude.id); await wait(300);
await Commands.tryRun('/engines', claude.id);
await wait(1500);
step('/engines lists each copy with its version', /Engines/.test(J.lastNote(claude.id)) && /2\.1\.600/.test([...view(claude.id).querySelectorAll('.msg.note')].pop()?.textContent || ''));
step('no duplicate command names', !Commands.duplicates?.().length, Commands.duplicates?.());
await sw({});
await smoke({ shot: '/tmp/robust-doctor.png' });
return J.done();
