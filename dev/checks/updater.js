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
let backNow = null; // (round 37) { from, to } when Go back is offered
const stub = {
  status: async () => { calls.push('status'); return { ok: true, head: 'aaaaaaa', remote: 'bbbbbbb', branch: 'main', behind, ahead: 0, commits: commits.slice(0, behind), dirty: 1, notes: notesNow, back: backNow }; },
  apply: async () => { calls.push('apply'); return { ok: true, changed: 3, restart: false, from: 'aaaaaaa', to: 'bbbbbbb', files: ['ui.js'] }; },
  reload: async () => { calls.push('reload'); return true; },
  restart: async () => { calls.push('restart'); return true; },
  back: async () => { calls.push('back'); return { ok: true, back: true, changed: 3, restart: false, from: 'bbbbbbb', to: 'aaaaaaa', files: ['ui.js'] }; },
  fix: async (id) => { calls.push(`fix:${id}`); return { ok: true, retry: true, message: '' }; },
};
Updater._setApi(() => stub);
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
  // (round 37, updatesafe) a failed update: one plain dialog, the command it runs shown, ONE fix; nothing runs before the click
  const realApply = stub.apply;
  stub.apply = async () => { calls.push('apply'); return { ok: false, reason: 'perm', message: 'This computer didn\'t let Hearth change its own files.', fix: { id: 'own-folder', label: 'Fix the folder\'s owner', password: true, command: 'sudo chown -R "$USER" "/Users/q/Hearth"' } }; };
  stub.fix = async (id) => { calls.push(`fix:${id}`); return { ok: true, waiting: true, window: 'Terminal', message: 'A Terminal window opened running: sudo chown… When it says it\'s done, press Try again.' }; };
  behind = 2; await Updater.check(); calls.length = 0;
  await Updater.run({ ask: false });
  let td = await until(() => document.querySelector('dialog.up-trouble[open]'), 3000) && document.querySelector('dialog.up-trouble[open]');
  out.trouble = td?.textContent.replace(/\s+/g, ' ').slice(0, 260);
  ok(td && /didn't let Hearth/.test(td.textContent) && td.querySelector('.up-cmd[open] pre')?.textContent.includes('sudo chown') && /password/.test(td.querySelector('.up-cmd summary')?.textContent || ''), 'a failed update: plain words, the password command shown (open) before the click');
  ok([...td.querySelectorAll('.modal-buttons button.primary')].length === 1 && !calls.some((c) => c.startsWith('fix:')), 'one fix button; nothing ran yet');
  td.querySelector('button.primary').click();
  ok(await until(() => /Terminal window opened/.test(td.querySelector('.up-status')?.textContent || '')), 'after the click: it runs in a visible window, said in the dialog');
  ok(calls.includes('fix:own-folder') && td.querySelector('button.primary').textContent === 'Try again', `then the button tries again (${td.querySelector('button.primary')?.textContent})`);
  td.close(); await wait(100);
  // Windows files held open: staged, Restart and finish the update keeps the view and restarts
  stub.apply = async () => { calls.push('apply'); return { ok: false, reason: 'locked', staged: true, message: 'Windows is holding some of Hearth\'s files open while it runs.', fix: { id: 'restart-swap', label: 'Restart and finish the update' } }; };
  stub.fix = async (id) => { calls.push(`fix:${id}`); return { ok: true, restart: true, message: 'Restarting to finish the update…' }; };
  calls.length = 0;
  await Updater.run({ ask: false });
  td = await until(() => document.querySelector('dialog.up-trouble[open]'), 3000) && document.querySelector('dialog.up-trouble[open]');
  ok(td && /finishes when Hearth restarts/.test(td.querySelector('h3')?.textContent || ''), 'held open: "finishes when Hearth restarts"');
  td.querySelector('button.primary').click();
  ok(await until(() => calls.includes('restart'), 3000) && store.get('update.swapWait', 0) && store.get('update.view', null)?.id === H.activeId, `restart, the view kept (${calls})`);
  store.set('update.swapWait', 0); td.close(); await wait(100);
  // half-finished: the button shows "!", Finish / Go back to how it was
  stub.status = async () => ({ ok: false, reason: 'half', message: 'The last update stopped half-way (3 min ago). Your edits are safe.', fix: { id: 'resume', label: 'Finish the update' }, alt: { id: 'rollback', label: 'Go back to how it was' } });
  stub.fix = async (id) => { calls.push(`fix:${id}`); return { ok: true, retry: false, rolledBack: true, message: 'Back to how it was before the update (aaaaaaa).' }; };
  await Updater.check();
  ok(btn() && !btn().hidden && btn().textContent.includes('!') && btn().classList.contains('up-attn'), `half-finished: ⬆ ! (${btn()?.textContent})`);
  btn().click(); await wait(200);
  td = document.querySelector('dialog.up-trouble[open]');
  ok(td && /stopped half-way/.test(td.textContent) && /Finish the update/.test(td.textContent) && /Go back to how it was/.test(td.textContent), 'Finish / Go back to how it was');
  [...td.querySelectorAll('button')].find((b) => /Go back to how it was/.test(b.textContent)).click();
  ok(await until(() => calls.includes('fix:rollback') && !document.querySelector('dialog.up-trouble[open]')), 'rolled back from the dialog');
  stub.status = async () => { calls.push('status'); return { ok: true, head: 'aaaaaaa', remote: 'bbbbbbb', branch: 'main', behind, ahead: 0, commits: commits.slice(0, behind), dirty: 1, notes: notesNow, back: backNow }; };
  stub.apply = realApply;
  // ↶ Go back after an update: in the after-update note, ⌘K, /update back, Settings › Updates
  store.set('update.view', { at: Date.now(), id: H.activeId, chats: { ...H.activeChat } });
  Updater.restoreView();
  ok(!store.get('update.view', null), 'the kept view is used once');
  backNow = { from: 'aaaaaaa', to: 'bbbbbbb', at: Date.now() }; behind = 0;
  await Updater.check();
  calls.length = 0;
  const gb = Updater.goBack();
  const conf = await until(() => [...document.querySelectorAll('dialog[open]')].some((d) => /Go back to the previous version/.test(d.textContent)), 3000) && [...document.querySelectorAll('dialog[open]')].at(-1);
  ok(conf && /chats, scenes, settings and data stay/.test(conf.textContent), 'Go back asks once, in plain words');
  [...conf.querySelectorAll('button')].find((b) => /Go back/.test(b.textContent))?.click();
  await gb;
  ok(await until(() => calls.includes('back') && calls.includes('reload'), 3000) && store.get('update.just', null)?.back === true, `went back, then reloads (${calls})`);
  store.set('update.just', null);
  ok((Commands.get('update')?.complete?.() || []).some((c) => c.value === 'back'), '/update back');
  backNow = null;
  // the reader: Settings › Updates › Patch notes… (the rounds in this copy, newest first)
  await Updater.patchNotes();
  await until(() => document.querySelector('dialog.pn-dialog[open] .pn-body h3'), 6000);
  const pd = document.querySelector('dialog.pn-dialog[open]');
  out.rounds = [...(pd?.querySelectorAll('.pn-pick option') || [])].map((o) => o.textContent);
  ok(pd && /Round/.test(pd.querySelector('.pn-body h3')?.textContent || '') && out.rounds.length >= 3, `the patch-notes reader opens on the newest round (${out.rounds})`);
  pd?.close();
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
