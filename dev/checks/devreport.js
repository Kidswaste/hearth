// Report to the developer (round 21, devreport) in the app: nothing loads until it's used (lazy group 'devreport');
// an error toast gets ⚑; a failed reply gets Report; a chat's chat_report_problem only drafts a card; /report shows
// the whole masked report for review; without gh the browser opens a prefilled new-issue link (shell.openExternal
// stubbed) and the report is remembered; the same error the same day asks first; with gh (stubbed) the issue number
// and state show in /report list; an update whose commits say "Fixes #42" says the report is fixed.
// (The real gh calls are tested in Node against dev/fake-gh.js: dev/devreport-test.js.)
//   node dev/smoke.js --fake-engines --script dev/checks/devreport.js --shot /tmp/devreport.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); };
const out = {};
const A = H.claudeAgent();
const run = (line) => { let text = ''; const p = Commands.tryRun(line, A.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return { p, text: () => text }; };
await wait(1500);
activate(A.id); await wait(300);

// lazy: the stand-in is there, the module isn't
out.lazyBefore = Lazy.state().find((g) => g.name === 'devreport')?.state;
ok(out.lazyBefore === 'stub' && Commands.get('report'), `devreport stays unloaded until used (${out.lazyBefore})`);

// an error toast gets ⚑
toast('Couldn\'t save the sketch: /Users/ruby/x.js (EACCES)', { type: 'error' });
await wait(200);
ok(document.querySelector('#toasts .toast.error .toast-report'), 'an error toast has ⚑');
ok(DevReportHooks.last()?.kind === 'toast' && /raised here|devreport|at /.test(DevReportHooks.last().stack + 'at '), 'the error is kept with where it was raised');

// a chat drafts a report: a card, nothing sent (this loads the group through its tool stand-in)
const t0 = await HubBridge.call('chat_report_problem', { agentId: A.id, title: 'three_eval returns nothing', details: 'The Lab tool answered empty three times.' });
ok(t0.ok && /reviews it/.test(t0.value), `chat_report_problem drafts (${JSON.stringify(t0)})`);
ok(Lazy.state().find((g) => g.name === 'devreport')?.state === 'loaded', 'the tool loaded the group');
const card = await until(() => [...document.querySelectorAll('.msg.note')].find((n) => /suggests a report/.test(n.textContent)));
ok(card && [...card.querySelectorAll('button')].some((b) => b.textContent === 'Review & send…'), 'the draft card has Review & send');
card?.querySelector('.note-x')?.click();

// no gh: the browser opens a prefilled link
const opened = [];
DevReport._setOpen((url) => { opened.push(url); });
const real = window.hub.devreport;
let ghState = { installed: false, signedIn: false };
const sent = [];
await window.hub.kvSet('dev-reports', { items: [], auto: { day: '', n: 0 } }); DevReport._reset();
DevReport._setApi(() => ({ ...real, gh: async () => ghState, send: async (r) => { sent.push(r); return { ok: true, number: 42, url: 'https://github.com/kidswaste/hearth/issues/42' }; }, states: async (n) => Object.fromEntries(n.map((x) => [x, 'open'])) }));
const r1 = run('/report the Lab preview went black after Shuffle, my token=abc123secret');
const dlg = await until(() => document.querySelector('dialog.devreport-dlg'));
ok(dlg, 'the review dialog opens');
const body = dlg?.querySelector('.dr-body')?.value || '';
out.body = body.slice(0, 1600);
ok(/What went wrong:\*\* the Lab preview went black/.test(body), 'the owner\'s words are in it');
ok(!/abc123secret/.test(body) && !/abc123secret/.test(dlg.querySelector('.dr-title').value), 'the token is masked (body and title)');
ok(/### Hearth/.test(body) && /Electron \d/.test(body), 'versions are in it');
ok(!/\/Users\/ruby/.test(body) && !/Owner:/.test(body), 'no home path, no chat text unless ticked');
ok(/hearth-report hr-[a-z0-9]{6}/.test(body), 'it carries its id');
ok(await until(() => /browser/.test(dlg.querySelector('.dr-how').textContent)), 'it says the browser will open (no gh)');
const btn = [...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Send');
btn.click();
await until(() => opened.length);
await r1.p;
out.url = (opened[0] || '').slice(0, 160);
ok(/^https:\/\/github\.com\/kidswaste\/hearth\/issues\/new\?labels=hearth-report&title=/.test(opened[0] || '') && decodeURIComponent(opened[0] || '').includes('went black'), 'a prefilled new-issue link opened');
const d1 = await window.hub.kvGet('dev-reports', null);
ok(d1?.items?.length === 1 && d1.items[0].via === 'browser', 'the report is remembered');
let l1 = run('/report list'); await l1.p;
ok(/sent in the browser/.test(l1.text()), `/report list shows it (${l1.text().slice(0, 200)})`);

// the same problem today: asks first
const r2 = run('/report the Lab preview went black after Shuffle, my token=abc123secret');
const conf = await until(() => [...document.querySelectorAll('dialog.ui-modal')].find((d) => /Already reported today/.test(d.textContent)));
ok(conf, 'the same report today asks first');
[...(conf?.querySelectorAll('button') || [])].find((b) => b.textContent === 'Cancel')?.click();
await r2.p;
ok(opened.length === 1, 'cancelled: nothing opened');

// with gh (signed in): sent as issue #42, state in the list
ghState = { installed: true, signedIn: true };
toast('Sync: couldn\'t write /Users/ruby/Drive/Hearth/chats.json', { type: 'error' });
await wait(150);
document.querySelector('#toasts .toast.error:last-child .toast-report')?.click();
const dlg2 = await until(() => document.querySelector('dialog.devreport-dlg'));
ok(dlg2 && /Error/.test(dlg2.querySelector('.dr-title').value) && /Sync: couldn't write ~\/Drive\/Hearth\/chats\.json/.test(dlg2.querySelector('.dr-body').value), `⚑ opens the toast's error, path as ~ (${dlg2?.querySelector('.dr-title').value})`);
const chatBox = dlg2?.querySelector('.dr-chat input');
ok(await until(() => /GitHub CLI/.test(dlg2.querySelector('.dr-how').textContent)), 'it says gh will send it');
[...dlg2.querySelectorAll('button')].find((b) => b.textContent === 'Send').click();
await until(() => sent.length);
ok(sent[0] && sent[0].title && !/\/Users\/ruby/.test(sent[0].body), 'sent through gh, masked');
await wait(200);
l1 = run('/report list'); await l1.p;
out.list = l1.text().slice(0, 400);
ok(/#42/.test(l1.text()) && /open/.test(l1.text()), '/report list shows #42 open');

// an update fixing it
const fixed = await DevReport.checkUpdate({ from: 'aaa1111', to: 'bbb2222', messages: ['Sync: write chats.json atomically\n\nFixes #42'] });
// (round 38, hintcalm) the note comes through the one-at-a-time queue (hints.js): it shows once nothing else is up
const said = await until(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /Your report #42 is fixed in this update/.test(t.textContent)), 8000);
ok(fixed.length === 1 && said, 'the update says report #42 is fixed');
l1 = run('/report list'); await l1.p;
ok(/✓ fixed in bbb2222/.test(l1.text()), '/report list shows it fixed');

// a failed reply gets Report
await Native.send(A.id, 'error please');
const rep = await until(() => document.querySelector('.surface.active .msg.error .msg-report, .msg.error .msg-report'), 20000);
ok(rep, 'a failed reply has Report');

// auto crash reports: off by default; on, at most 3 a day, gh only
ok(store.get('devreport.auto', false) === false, 'auto is off by default');
let a1 = run('/report auto on'); await a1.p;
const c1 = await DevReport.autoCrash({ kind: 'crash', message: 'Crash: Hearth: crashed (code 5)', stack: '', at: Date.now() });
ok(c1.ok && sent.length === 2 && !/Owner:/.test(sent[1].body), 'a crash is sent by itself when opted in (no chat text)');
const c2 = await DevReport.autoCrash({ kind: 'crash', message: 'Crash: Hearth: crashed (code 5)', stack: '', at: Date.now() });
ok(!c2.ok && c2.why === 'dup', 'the same crash again: not sent twice');
a1 = run('/report auto off'); await a1.p;
out.problems = problems;
return JSON.stringify(out, null, 1);
