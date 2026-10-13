// ⬆ Update (updater.js) in the window, with the git side stubbed (dev/updater-test.js tests it on real repos):
// hidden while up to date, the rail button with the count when main has news, the dialog listing them, Update &
// reload → pull then reload (or restart), a busy chat asks first, /update, /update check, /update auto off.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/updater.js --shot /tmp/updater.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const calls = [];
let behind = 0;
let notesNow = [];
const commits = [{ hash: 'a1', subject: 'Chats show pictures big', at: Date.now() - 3e5 }, { hash: 'b2', subject: 'Update button', at: Date.now() - 6e4 }];
Updater._setApi(() => ({
  status: async () => { calls.push('status'); return { ok: true, head: 'aaaaaaa', remote: 'bbbbbbb', branch: 'main', behind, ahead: 0, commits: commits.slice(0, behind), dirty: 1, notes: notesNow }; },
  apply: async () => { calls.push('apply'); return { ok: true, changed: 3, restart: false, from: 'aaaaaaa', to: 'bbbbbbb', files: ['ui.js'] }; },
  reload: async () => { calls.push('reload'); return true; },
  restart: async () => { calls.push('restart'); return true; },
}));
const btn = () => document.getElementById('up-btn');
try {
  await Updater.check();
  ok(!btn() || btn().hidden, 'no button while up to date');
  behind = 2;
  await Updater.check();
  ok(btn() && !btn().hidden && btn().textContent.includes('2'), `the ⬆ button shows the count (${btn()?.textContent})`);
  ok(btn()?.closest('#rail'), 'at the bottom of the rail');
  // (round 29) patch notes of the rounds not here yet come first; the commit list folds under Details
  notesNow = [{ file: 'docs/patch-notes/round-99.md', round: 99, text: '# Round 99: brighter things\n## 🎛 A new knob\n**Find it:** the Lab.\n- It turns.' }];
  await Updater.check();
  btn().click(); await wait(200);
  const nd = document.querySelector('dialog.up-dlg[open]');
  ok(nd && /What's new: round 99/.test(nd.querySelector('h3')?.textContent || '') && nd.querySelector('.up-notes h3, .up-notes h4') && /A new knob/.test(nd.textContent) && nd.querySelector('details.up-details'), `the dialog leads with the patch notes (${nd?.querySelector('h3')?.textContent})`);
  nd?.close(); await wait(100); notesNow = [];
  await Updater.check();
  btn().click(); await wait(200);
  const dlg = document.querySelector('dialog.up-dlg[open]');
  out.dialog = dlg?.textContent.replace(/\s+/g, ' ').slice(0, 300);
  ok(dlg && /2 new changes/.test(dlg.textContent) && /Chats show pictures big/.test(dlg.textContent) && /Update button/.test(dlg.textContent), 'the dialog lists what\'s new');
  ok(dlg && /changed by hand: kept/.test(dlg.textContent), 'and says hand edits are kept');
  [...dlg.querySelectorAll('button')].find((b) => /Update & reload/.test(b.textContent)).click();
  ok(await until(() => calls.includes('reload'), 4000), `Update & reload pulls then reloads (${calls})`);
  ok(calls.indexOf('apply') < calls.indexOf('reload') && !calls.includes('restart'), 'apply before reload, no restart for window files');
  ok(store.get('update.just', null)?.to === 'bbbbbbb', 'remembers what it updated to (shown after the reload)');
  store.set('update.just', null);

  // a busy chat asks first
  const C = H.claudeAgent(); activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id);
  Native.send(C.id, 'slow a long answer'); await until(() => Native.isBusy(H.activeChat[C.id]), 4000);
  calls.length = 0;
  const pr = Updater.run();
  await until(() => document.querySelector('dialog[open]'), 3000);
  const ask = [...document.querySelectorAll('dialog[open]')].at(-1);
  out.ask = ask?.textContent.replace(/\s+/g, ' ').slice(0, 160);
  ok(ask && /still answering/.test(ask.textContent), 'a running reply asks before updating');
  [...ask.querySelectorAll('button')].find((b) => /Cancel/.test(b.textContent))?.click();
  await pr; ok(!calls.includes('apply'), 'Cancel: nothing pulled');
  await until(() => !Native.isBusy(H.activeChat[C.id]), 30000);

  // commands
  let r = await Commands.tryRun('/update check', C.id); await wait(300);
  out.check = document.querySelector('.msg.note:last-of-type, .chat-note:last-of-type')?.textContent?.slice(0, 120);
  ok(Commands.get('update'), '/update exists');
  await Commands.tryRun('/update auto off', C.id); await wait(100);
  ok(store.get('update.auto', true) === false, '/update auto off');
  await Commands.tryRun('/update auto on', C.id);
  behind = 0; await Updater.check();
  ok(btn().hidden, 'hidden again once up to date');
  // the reader: Settings › Updates › Patch notes… (the rounds in this copy, newest first)
  await Updater.patchNotes();
  await until(() => document.querySelector('dialog.pn-dialog[open] .pn-body h3'), 6000);
  const pd = document.querySelector('dialog.pn-dialog[open]');
  out.rounds = [...(pd?.querySelectorAll('.pn-pick option') || [])].map((o) => o.textContent);
  ok(pd && /Round/.test(pd.querySelector('.pn-body h3')?.textContent || '') && out.rounds.length >= 3, `the patch-notes reader opens on the newest round (${out.rounds})`);
  pd?.close();
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
