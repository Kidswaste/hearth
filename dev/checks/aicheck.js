// Check this AI (round 32, aicheck.js): ⋯ AI setup → What it can use → Check this AI runs one tiny real run through the
// fake engines and shows a checklist with a fix on each failing line; the fixes work and a second check passes.
//   1. Claude at Read: found / version / signed in / answers / reads ✓, writes ✗ (Allow edits), runs ✗ (Allow commands);
//      both fixes → Full; Check again → all ✓, and the test files are gone from its folder (to the Trash).
//   2. A simulated Windows PC (fake-switches `windows`): Astra at Read & write: its sandbox blocks commands → read and
//      run ✗ with "Run without its sandbox…" → the warning → saved → Check again → all ✓.
//   3. Claude signed out: "Not signed in" with Sign in (runs the fake's own sign-in) → ✓ after.
//   4. A chat's refusal note offers "Check this AI": it opens AI setup on that AI with the check running.
//   5. The last result and its time stay on the row (reopened later); the run is lean (no Hearth tools, cheapest model).
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/aicheck.js
const { step, wait, until, click } = J;
const fsx = window.hub.fs;
const claude = H.claudeAgent();
const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const dirC = `/tmp/hearth-aicheck-c-${Date.now().toString(36)}`;
const dirA = `/tmp/hearth-aicheck-a-${Date.now().toString(36)}`;
await fsx.write(`${dirC}/seed.txt`, 'seed');
await fsx.write(`${dirA}/seed.txt`, 'seed');
const setFiles = async (a, level, dir) => { H.agent(a.id).fileAccess = { level, folders: [dir] }; delete H.agent(a.id).astraNoSandbox; await saveConfig(); await wait(300); };
const S = () => document.querySelector('aside.opt-sheet');
const line = (k) => S()?.querySelector(`.aicheck-line[data-k="${k}"]`);
const marks = () => [...(S()?.querySelectorAll('.aicheck-line') || [])].map((l) => `${l.querySelector('.aicheck-mark').textContent} ${l.dataset.k}`).join(' · ');
const fixBtn = (k) => line(k)?.querySelector('.aicheck-fix');
const runCheck = async () => {
  const go = S().querySelector('.aicheck-go');
  go.scrollIntoView({ block: 'center' }); await wait(150);
  await click(go);
  await until(() => !S()?.querySelector('.aicheck-go')?.disabled && S()?.querySelector('.aicheck-line[data-k="run"]'), 60000);
  await wait(200);
};
const okAll = () => [...S().querySelectorAll('.aicheck-line')].every((l) => l.classList.contains('aicheck-ok'));

await Lazy.load('options'); // ⋯ AI setup loads on first use (aicheck.js with it)
activate(claude.id);
Native.newChat(claude.id);
await wait(300);

// 1. Claude at Read
await setFiles(claude, 'read', dirC);
Options.open({ agentId: claude.id });
await until(() => S()?.querySelector('.aicheck .aicheck-go'), 8000);
const go0 = S().querySelector('.aicheck-go');
step('AI setup has one "Check this AI" row, its tooltip says it uses a few tokens', S().querySelectorAll('.aicheck').length === 1 && /few tokens/.test(go0?.title || ''), go0?.title);
await runCheck();
step('Claude at Read: found, version, signed in, answers, reads its folder', ['found', 'version', 'signin', 'answers', 'read'].every((k) => line(k)?.classList.contains('aicheck-ok')), marks());
step('…writes ✗ with Allow edits, runs ✗ with Allow commands', line('write')?.classList.contains('aicheck-bad') && fixBtn('write')?.textContent === 'Allow edits' && line('run')?.classList.contains('aicheck-bad') && fixBtn('run')?.textContent === 'Allow commands', `${line('write')?.textContent} | ${line('run')?.textContent}`);
step('the test files went to the Trash (nothing left in its folder)', !(await fsx.list(dirC)).some((f) => /\.hearth-check-/.test(f.name || f.path)));
S().querySelector('.aicheck').scrollIntoView({ block: 'center' }); await wait(200);
await smoke({ shot: '/tmp/aicheck-claude-read.png' });
const body = S().querySelector('.opt-body');
step('the list fits the panel (nothing of it sticks out sideways)', ![...S().querySelectorAll('.aicheck *')].some((n) => n.getBoundingClientRect().right > body.getBoundingClientRect().right + 1));
await click(fixBtn('write'));
await until(() => H.agent(claude.id).fileAccess?.level === 'write', 4000);
step('Allow edits → Files: Read & write (on the AI), the line says to check again', H.agent(claude.id).fileAccess?.level === 'write' && /check again/.test(line('write')?.textContent || ''));
await until(() => fixBtn('run'), 3000);
await click(fixBtn('run'));
await until(() => H.agent(claude.id).fileAccess?.level === 'full', 4000);
step('Allow commands → Full', H.agent(claude.id).fileAccess?.level === 'full');
await runCheck();
step('Check again: every line ✓ (reads, writes, runs a command)', okAll(), marks());
step('…and the test files are gone again', !(await fsx.list(dirC)).some((f) => /\.hearth-check-/.test(f.name || f.path)));
const last1 = AiCheck.last(claude.id);
step('the result is kept with its time', last1?.lines?.length === 7 && last1.done > Date.now() - 120000);
Options.hide();
await wait(200);
Options.open({ agentId: claude.id });
await until(() => S()?.querySelector('.aicheck-last'), 5000);
step('reopened later, the row shows the last result and its time', /7 of 7 ok · \d/.test(S().querySelector('.aicheck-last')?.textContent || ''), S().querySelector('.aicheck-last')?.textContent);
Options.hide();

// 2. a simulated Windows PC: Astra's sandbox blocks commands
if (astra) {
  await window.hub.kvSet('fake-switches', { windows: true });
  Access._setWindows(true);
  await setFiles(astra, 'write', dirA);
  Options.open({ agentId: astra.id });
  await until(() => S()?.querySelector('.aicheck .aicheck-go'), 8000);
  await runCheck();
  step('Windows, Astra: found / signed in / answers ✓, writes ✓', ['found', 'signin', 'answers', 'write'].every((k) => line(k)?.classList.contains('aicheck-ok')), marks());
  step('…reads ✗ and runs ✗: its sandbox blocks commands, with "Run without its sandbox…"', line('read')?.classList.contains('aicheck-bad') && line('run')?.classList.contains('aicheck-bad') && /sandbox blocks commands on Windows/.test(line('run')?.textContent || '') && fixBtn('read')?.textContent === 'Run without its sandbox…' && !fixBtn('run'), `${line('read')?.textContent} | ${line('run')?.textContent}`);
  line('run').scrollIntoView({ block: 'center' }); await wait(200);
  await smoke({ shot: '/tmp/aicheck-astra-windows.png' });
  await click(fixBtn('read'));
  await until(() => document.querySelector('dialog.ui-modal button.primary'), 3000);
  step('the fix asks first (deletes can\'t go to the Trash)', /can't go to the Trash/.test(document.querySelector('dialog.ui-modal')?.textContent || ''));
  document.querySelector('dialog.ui-modal button.primary')?.click();
  await until(() => H.agent(astra.id).astraNoSandbox === true, 3000);
  step('…then it is saved on Astra', H.agent(astra.id).astraNoSandbox === true);
  await until(() => S()?.querySelector('.aicheck-go'), 3000);
  await runCheck();
  step('Check again: every line ✓ (no sandbox, in its folder)', okAll(), marks());

  // 4. a chat's refusal note offers Check this AI
  delete H.agent(astra.id).astraNoSandbox; await saveConfig(); await wait(300);
  Options.hide();
  activate(astra.id);
  Native.newChat(astra.id);
  await wait(300);
  Native.send(astra.id, `access: ${JSON.stringify([['Bash', { command: 'ls' }]])}`);
  await until(() => Native.view(astra.id).list.querySelector('.msg.note[data-note-id="access-refused"]'), 20000);
  const note = Native.view(astra.id).list.querySelector('.msg.note[data-note-id="access-refused"]');
  const chk = [...(note?.querySelectorAll('.note-acts button') || [])].find((b) => b.textContent === 'Check this AI');
  step('the refusal note offers "Check this AI"', Boolean(chk), note?.textContent);
  if (chk) await click(chk);
  await until(() => S() && S().querySelector('.opt-chip.on')?.textContent.includes(astra.name) && S().querySelector('.aicheck-go')?.disabled, 5000);
  step('…it opens AI setup on Astra with the check running', Boolean(S()?.querySelector('.aicheck-go')?.disabled) && S().querySelector('.opt-chip.on')?.textContent.includes(astra.name));
  await until(() => !S()?.querySelector('.aicheck-go')?.disabled, 60000);
  step('…and shows its lines with the fix', fixBtn('read')?.textContent === 'Run without its sandbox…', { marks: marks(), sheet: Boolean(S()), agent: S()?.querySelector('.opt-chip.on')?.textContent, last: AiCheck.last(astra.id)?.lines?.map((l) => `${l.k}:${l.ok}:${l.fix}`) });
  Options.hide();
  await window.hub.kvSet('fake-switches', {});
  Access._setWindows(false);
  delete H.agent(astra.id).fileAccess;
  await saveConfig();
}

// 3. Claude signed out → Sign in
activate(claude.id);
await window.hub.kvSet('fake-switches', { claudeLoggedOut: true });
Options.open({ agentId: claude.id });
await until(() => S()?.querySelector('.aicheck .aicheck-go'), 8000);
await runCheck().catch(() => {});
await until(() => line('signin'), 30000);
step('signed out: "Not signed in" with Sign in, the rest not checked (no tokens spent)', line('signin')?.classList.contains('aicheck-bad') && /Sign in/.test(fixBtn('signin')?.textContent || '') && line('read')?.classList.contains('aicheck-wait'), marks());
await click(fixBtn('signin'));
await until(async () => !(await window.hub.kvGet('fake-switches', {}))?.claudeLoggedOut, 20000);
step('Sign in runs the engine\'s own sign-in (the fake signs in)', !(await window.hub.kvGet('fake-switches', {}))?.claudeLoggedOut);
await wait(500);
await runCheck();
step('Check again: signed in ✓ and all ✓', okAll(), marks());
Options.hide();

await window.hub.kvSet('fake-switches', {});
delete H.agent(claude.id).fileAccess;
await saveConfig();
step('/check-ai is a command (one name)', Boolean(Commands.get('check-ai')) && !Commands.duplicates?.().length);
step('no errors in the window', !J.out.errors.length, J.out.errors.slice(0, 3));
return J.done();
