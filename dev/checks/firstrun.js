// Check this computer (round 28, firstrun*.js), driven like the owner on a new computer: the group waits for its first
// use; Settings › This computer & sync has "Check this computer…" (round 39: moved up from Advanced); the list shows every line (Claude, Codex for Astra, ffmpeg, sync,
// folders, updates) with its state; Codex missing (Settings › Engines points nowhere) is "To do" with the exact install
// command shown BEFORE the click; Claude signed out (fake switch) shows the sign-in command, its button runs it in the
// (test) window and the line turns Ready by itself; a chat's folder from the other computer is "To do", matched by hand
// (settings.reachFolders) it turns Ready and a chat resolves it; the first-launch decision (fresh → shown once,
// "Skip for now"; in use → only marked); Codex back → re-check live; /check-computer and the Ctrl/⌘+K action.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/firstrun.js --shot /tmp/firstrun.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const shot = async (name) => { try { await smoke({ shot: `/tmp/hearth-checks/firstrun-${name}.png` }); } catch { /* optional */ } };
const C = H.claudeAgent();
const sw = (o) => window.hub.kvSet('fake-switches', o);
const rowOf = (id) => document.querySelector(`dialog.fr-dialog[open] .fr-row[data-id="${id}"]`);
const stateOf = (id) => rowOf(id)?.dataset.state;
const savedPaths = { ...(H.settings().enginePaths || {}) };
const MISSING_FOLDER = '/Users/someone-else/Projects/forge-site';
try {
  activate(C.id); await wait(300);
  ok(!window.Lazy?.loaded?.('firstrun'), 'the checklist waits for its first use (lazy group)');
  ok(Commands.get('check-computer'), '/check-computer is there before the group loads (stand-in)');
  ok(AppUI.actions().some((a) => a.label === 'Check this computer…'), 'the Ctrl/⌘+K action is there');

  // ---- a new computer: Codex isn't installed, Claude isn't signed in, a chat's folder is from the other computer ----
  H.config.settings = { ...H.settings(), enginePaths: { ...savedPaths, codex: '/nowhere/codex-not-installed' } };
  await saveConfig(); await wait(300);
  await sw({ claudeLoggedOut: '1' });
  await window.hub.saveChat({ id: 'frtest-chat', agentId: C.id, title: 'Forge site', access: { level: 'read', folders: [MISSING_FOLDER] }, messages: [], updatedAt: Date.now() });

  // ---- Settings › This computer & sync › Check this computer… (round 39, settingscalm: in sight, not in Advanced) ----
  AppUI.openSettings(); await wait(700);
  const sdlg = document.querySelector('dialog.settings-dialog[open]');
  const btn = sdlg && [...sdlg.querySelectorAll('button')].find((b) => b.textContent === 'Check this computer…');
  ok(btn && btn.checkVisibility() && btn.closest('.settings-section')?.querySelector(':scope > h3')?.textContent === 'This computer & sync', 'Settings › This computer & sync has "Check this computer…", in sight');
  btn?.click();
  ok(await until(() => document.querySelector('dialog.fr-dialog[open]'), 8000), 'the list opens (group loaded on that click)');
  ok(!document.querySelector('dialog.settings-dialog[open]'), 'Settings closed behind it');
  ok(await until(() => FirstRun.rows().every((r) => r.state !== 'checking'), 40000), 'every line checked');
  await wait(300);
  const ids = [...document.querySelectorAll('dialog.fr-dialog[open] .fr-row')].map((r) => r.dataset.id);
  out.ids = ids;
  ok(['claude', 'codex', 'ffmpeg', 'sync', 'folders', 'update'].every((id) => ids.includes(id)), 'Claude, Codex, ffmpeg, sync, folders, updates: one line each');
  ok(!ids.some((id) => /^(perm|win)-/.test(id)), 'no Mac / Windows lines on Linux');
  out.summary = document.querySelector('.fr-sum')?.textContent;
  ok(/to set up/.test(out.summary || ''), `the summary counts what to set up (${out.summary})`);

  // Codex missing: To do, the install command shown first, the official page
  const cx = rowOf('codex');
  ok(stateOf('codex') === 'fix' && /isn't installed/.test(cx?.textContent || ''), 'Codex (for Astra): "isn\'t installed", To do');
  ok(/npm i -g @openai\/codex/.test(cx?.querySelector('.fr-cmd')?.textContent || ''), 'the exact install command is on the line before any click');
  ok(cx?.querySelector('.fr-link'), '… and the official page');
  ok(/Install Codex/.test(cx?.querySelector('.fr-b')?.textContent || ''), '… one button: Install Codex');

  // Claude signed out: the sign-in command, the button runs it in the (test) window, the line turns Ready by itself
  const cl = rowOf('claude');
  out.claudeText = cl?.querySelector('.fr-x')?.textContent;
  ok(stateOf('claude') === 'fix' && /signed in/.test(out.claudeText || ''), 'Claude: "isn\'t signed in", To do');
  ok(/auth login/.test(cl?.querySelector('.fr-cmd')?.textContent || ''), 'the sign-in command is shown before the click');
  await shot('list');
  cl?.querySelector('.fr-b')?.click();
  ok(await until(() => stateOf('claude') === 'ok', 40000), 'after the click (window ran, fake signed in) the Claude line turns Ready by itself (live re-check)');

  // the chat's folder from the other computer: To do → matched by hand → Ready, and a chat resolves it
  ok(stateOf('folders') === 'fix' && /forge-site/.test(rowOf('folders')?.textContent || ''), 'the chat\'s folder from the other computer is "To do", named');
  const here = `${window.SMOKE_SAVES}/forge-site-here`;
  await window.hub.fs.write(`${here}/index.html`, '<p>hi</p>');
  await FirstRun.act(FirstRun.rows().find((r) => r.id === 'folders'), null, { folder: here }); // what the folder dialog would give
  ok(await until(() => stateOf('folders') === 'ok', 15000), 'matched by hand: the folders line turns Ready');
  ok(H.settings().reachFolders?.[MISSING_FOLDER] === here, 'kept as this computer\'s match (settings.reachFolders)');
  const res = await window.hub.reach.resolve([`${MISSING_FOLDER}/index.html`]);
  out.resolved = res[0];
  ok(res[0]?.exists && res[0].path.startsWith(here), 'a chat\'s path inside it now resolves to this computer');

  // Codex comes back (installed by the owner): the list re-checks when Hearth gets the focus back
  H.config.settings = { ...H.settings(), enginePaths: savedPaths };
  await saveConfig(); await wait(300);
  await FirstRun.recheck('engines');
  ok(await until(() => stateOf('codex') === 'ok', 20000), 'Codex installed → its line turns Ready on the re-check');
  await shot('ready');
  out.after = document.querySelector('.fr-sum')?.textContent;
  ok(!FirstRun.rows().some((r) => ['claude', 'codex', 'folders'].includes(r.id) && r.state !== 'ok'), 'Claude, Codex and the folders are all Ready');
  FirstRun.close(); await wait(200);

  // ---- the first launch ----
  store.set('firstrun.seen', false);
  ok(FirstRun.auto({ test: true }) === false && !document.querySelector('dialog.fr-dialog[open]'), 'a test copy is never shown it by itself');
  ok(FirstRun.auto({}, { test: false, chats: 5 }) === false && store.get('firstrun.seen') === 'in use', 'a computer already in use: only marked, never shown');
  store.set('firstrun.seen', false);
  ok(FirstRun.auto({}, { test: false, chats: 0 }) === true && document.querySelector('dialog.fr-dialog[open] h2')?.textContent === 'Set up this computer', 'a fresh computer: "Set up this computer" opens once');
  const skip = [...document.querySelectorAll('dialog.fr-dialog[open] button')].find((b) => b.textContent === 'Skip for now');
  ok(skip && /Settings › This computer & sync/.test(document.querySelector('.fr-later')?.textContent || ''), 'skippable, says where it comes back from');
  skip?.click(); await wait(200);
  ok(!document.querySelector('dialog.fr-dialog[open]') && FirstRun.auto({}, { test: false, chats: 0 }) === false, 'skipped: it doesn\'t come back by itself');

  // ---- the command and the action ----
  const said = await Commands.tryRun('/check-computer', C.id, null, { say: () => {}, note: () => {} });
  ok(await until(() => document.querySelector('dialog.fr-dialog[open]'), 5000), '/check-computer opens it');
  FirstRun.close(); await wait(150);
  AppUI.actions().find((a) => a.label === 'Check this computer…')?.run();
  ok(await until(() => document.querySelector('dialog.fr-dialog[open]'), 5000), 'the Ctrl/⌘+K action opens it');
  out.said = typeof said;
  FirstRun.close();
} catch (err) { fail.push(`threw: ${err.message}`); }
finally {
  await sw({});
  H.config.settings = { ...H.settings(), enginePaths: savedPaths };
  delete H.config.settings.reachFolders;
  await saveConfig();
  await window.hub.deleteChat?.('frtest-chat');
}
return JSON.stringify({ ok: !fail.length, fail, ...out });
