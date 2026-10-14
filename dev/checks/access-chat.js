// Access (round 14): a Claude chat with file access, end to end through the fake CLI, mcp/access-mcp.js and the real
// window: ⋯ → Access and /access set the level and folders; a read and a write inside the folder pass silently (the
// write keeps a copy); `rm` asks with a card → Allow once → Hearth moves it to the Trash instead; `git push` → Deny with a
// note; `sudo` is refused with the password card; `curl` waits until the card times out (denied); the activity log
// lists everything with Undo (an edit comes back, a new file goes to the Trash); Access.ask (other features) uses the
// same card and remembers "Allow for this chat"; the badge shows the level.
// (round 32) The AI's own setting: AI setup → Full makes a NEW chat write in the AI's folder; a write outside its
// folders gets one line saying why (Allow this folder / Open AI setup); a chat may still set its own; Astra with Full writes.
// (winshell) A simulated Windows PC (fake-switches `windows`): Astra's sandbox refuses commands by policy → the note and
// the warned opt-in → the command runs; Claude at Full runs a PowerShell command through Hearth's check.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/access-chat.js
const { step, wait, until, click } = J;
// (round 33) a card in a running reply is answered the way a person does: with the reply scrolled to its end first. A
// card that arrives below the fold was clicked where it was, then the reply's follow-scroll moved it ~50 px up between
// the measure and the press: the click landed on the message list, the card waited ("cards2: 2" under load)
const answer = async (card, label) => {
  const list = card.closest('.messages');
  if (list) { list.scrollTop = list.scrollHeight; await wait(250); }
  return click([...card.querySelectorAll('button')].find((b) => b.textContent === label));
};
const claude = H.claudeAgent();
const fsx = window.hub.fs;
const dir = `/tmp/hearth-access-${Date.now().toString(36)}`;
await fsx.write(`${dir}/a.txt`, 'alpha');
await fsx.write(`${dir}/c.txt`, 'charlie');
Access._setTimeout(5000);
activate(claude.id);
Native.newChat(claude.id);
await wait(300);

// 1. the level: ⋯ → Access → Full (a real click through the menu), then /access add <folder>
// (round 26) ⋯ opens Options; right-click ⋯ is the quick menu
Native.view(claude.id).root.querySelector('.native-head button[aria-label="Chat options"]')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 60 })); await wait(200);
const accessRow = [...document.querySelectorAll('#menu button, #menu .menu-item')].find((b) => /^Files it can use/.test(b.textContent.trim()));
step('the chat ⋯ menu has one Access entry', Boolean(accessRow), accessRow?.textContent);
if (accessRow) await click(accessRow);
await wait(250);
const fullRow = [...document.querySelectorAll('#menu button, #menu-fly button, #menu .menu-item')].find((b) => /^Full/.test(b.textContent.trim()));
step('its submenu offers Off · Read · Read & write · Full', Boolean(fullRow) && ['Off', 'Read', 'Read & write'].every((l) => [...document.querySelectorAll('#menu button, #menu-fly button')].some((b) => b.textContent.trim().startsWith(l))));
if (fullRow) await click(fullRow);
await until(() => Native.chatOf(claude.id)?.access?.level === 'full', 5000);
let chat = Native.chatOf(claude.id);
step('Full is set, with the chat\'s own project folder', chat?.access?.level === 'full' && /projects/.test(chat.access.folders[0] || ''), chat?.access);
const r1 = await Commands.tryRun(`/access add ${dir}`, claude.id);
await wait(300);
chat = Native.chatOf(claude.id);
step('/access add puts a folder in', chat.access.folders.includes(dir), chat.access.folders);
step('the badge shows the level', /Full/.test(Native.view(claude.id).meta.querySelector('.access-badge')?.textContent || ''));

// 2. one reply with every kind of request; the cards are answered like the owner would
const calls = [
  ['Read', { file_path: `${dir}/a.txt` }],
  ['Edit', { file_path: `${dir}/a.txt`, old_string: 'alpha', new_string: 'ALPHA' }],
  ['Write', { file_path: `${dir}/b.txt`, content: 'bravo' }],
  ['Bash', { command: `cd "${dir}" && rm c.txt` }],
  ['Bash', { command: 'git push origin main' }],
  ['Bash', { command: 'sudo ls /root' }],
  ['Bash', { command: 'curl https://example.com' }],
  ['Bash', { command: `cd "${dir}" && ls` }],
];
const seen = [];
Native.send(claude.id, `access: ${JSON.stringify(calls)}`);
await wait(400);
const chatId = H.activeChat[claude.id];
const t0 = Date.now();
let shotDone = false;
let pwCard = false;
while (Native.isBusy(chatId) && Date.now() - t0 < 120000) {
  pwCard ||= Boolean(document.querySelector('.access-pw'));
  const card = [...document.querySelectorAll('.access-card:not(.answered)')].pop();
  if (card && !card.dataset.handled) {
    const text = card.textContent;
    seen.push(text.slice(0, 90));
    if (!shotDone) { shotDone = true; await smoke({ shot: '/tmp/access-card.png' }); }
    if (/rm c\.txt/.test(text)) { card.dataset.handled = '1'; await answer(card, 'Allow once'); }
    else if (/git push/.test(text)) { card.dataset.handled = '1'; card.querySelector('.access-note').value = 'not yet, review first'; await answer(card, 'Deny'); }
    else card.dataset.handled = 'wait'; // curl: let it time out
  }
  await wait(150);
}
await wait(400);
const reply = Native.chatOf(claude.id).messages.at(-1)?.text || '';
step('the run went through the permission tool', /permission tool: yes/.test(reply), reply.slice(0, 200));
step('read and edit inside the folder: silent (no card)', /Read: ran · alpha/.test(reply) && /Edit: ran/.test(reply) && !seen.some((s) => /a\.txt/.test(s)));
step('a new file inside the folder: silent', /Write: ran/.test(reply) && await fsx.read(`${dir}/b.txt`) === 'bravo');
step('rm → card → Allow once → Hearth moved it to the Trash (the rm itself never ran)', /Bash: ran · Hearth moved 1 item to the Trash/.test(reply) && !(await fsx.stat(`${dir}/c.txt`)), reply.match(/Bash: [^\n]*/)?.[0]);
step('git push → card → Deny with a note: the model reads the note', /Bash: denied · The user denied this\. Their note: not yet, review first/.test(reply));
step('sudo is refused without a card (passwords never go through Hearth)', /Bash: denied · sudo can ask for a password/.test(reply) && !seen.some((s) => /sudo/.test(s)) && pwCard);
const sum = [...Native.view(claude.id).list.querySelectorAll('.access-sum')].pop()?.textContent || '';
step('the reply keeps one line of what it did with files (→ the log)', /file actions/.test(sum) && /to the Trash/.test(sum) && /denied/.test(sum) && /refused/.test(sum), sum);
step('curl: no answer → denied when the card times out', /Bash: denied · The user didn't answer in time/.test(reply));
step('a plain command inside the folder runs silently', /Bash: ran · (a\.txt|b\.txt)/.test(reply));
step('cards seen: rm, git push, curl only', seen.length === 3, seen);

// 3. the log, Undo
const log = await Access.entries(chatId);
const by = (re) => log.filter((e) => re.test(e.what));
step('log: the read, the edit (with a copy), the new file, the Trash, the refusal, the denial, the timeout', by(/Read a\.txt/).length >= 1 && by(/Edit a\.txt/)[0]?.backup && by(/Write b\.txt/)[0]?.created && log.some((e) => e.result === 'trashed') && log.some((e) => e.result === 'refused') && log.some((e) => e.result === 'denied' && e.note) && log.some((e) => e.result === 'timeout'), log.map((e) => `${e.result}:${e.what}`).slice(-14));
const txt = await Commands.tryRun('/access log text', claude.id, '', { source: 'code' });
await wait(300);
await Commands.tryRun('/access undo', claude.id);
await wait(600);
step('/access undo takes back the last write (the new file goes to the Trash)', !(await fsx.stat(`${dir}/b.txt`)));
const edit = (await Access.entries(chatId)).find((e) => /Edit a\.txt/.test(e.what));
await Access.undo(chatId, edit.id);
step('Undo on the edit brings the old text back', await fsx.read(`${dir}/a.txt`) === 'alpha');
await Commands.tryRun('/access log', claude.id);
await until(() => document.querySelector('.access-log-modal'), 3000);
step('/access log opens the activity list with Undo / Show buttons', document.querySelectorAll('.access-log-modal .access-entry').length >= 8);
await smoke({ shot: '/tmp/access-log.png' });
document.querySelector('.access-log-modal')?.close();

// 3b. a folder dropped on the chat joins it; "Allow for this chat" on a delete there stops the next one asking
const dir2 = `${dir}-dropped`;
await fsx.write(`${dir2}/d.txt`, 'd');
await fsx.write(`${dir2}/e.txt`, 'e');
// (round 38, dragdrop) a dropped folder is offered first ("Let … use this folder?"), never granted silently
const folderAdded = Native.addPath(claude.id, dir2);
for (let i = 0; i < 60 && !document.querySelector('dialog.ui-modal[open] button.primary'); i += 1) await new Promise((r) => setTimeout(r, 50));
step('a dropped folder is offered first', /use this folder/.test(document.querySelector('dialog.ui-modal[open]')?.textContent || ''));
document.querySelector('dialog.ui-modal[open] button.primary')?.click();
await folderAdded;
step('a folder dropped on the chat joins its folders', Native.chatOf(claude.id).access.folders.includes(dir2));
// (round 33) a card here must be answered, never time out: on a loaded machine clicking within the 5 s used for the
// timeout steps raced (the first card expired, the second asked: "cards2: 2"); the timeout steps keep 5 s
Access._setTimeout(30000);
const chat2 = H.activeChat[claude.id];
Native.send(claude.id, `access: ${JSON.stringify([['Bash', { command: `cd "${dir2}" && rm d.txt` }], ['Bash', { command: `cd "${dir2}" && rm e.txt` }]])}`);
await until(() => Native.isBusy(chat2), 5000);
let cards2 = 0;
const t2 = Date.now();
while (Native.isBusy(H.activeChat[claude.id]) && Date.now() - t2 < 60000) {
  const card = [...document.querySelectorAll('.access-card:not(.answered)')].pop();
  if (card && !card.dataset.handled) { card.dataset.handled = '1'; cards2 += 1; await answer(card, 'Allow for this chat'); }
  await wait(150);
}
await wait(300);
const reply2 = Native.chatOf(claude.id).messages.at(-1)?.text || '';
Access._setTimeout(5000);
step('Allow for this chat: the second delete in that folder passes without a card (both to the Trash)', cards2 === 1 && (reply2.match(/Hearth moved 1 item to the Trash/g) || []).length === 2 && !(await fsx.stat(`${dir2}/e.txt`)), { cards2, grants: Native.chatOf(claude.id).access.grants });

// 4. Access.ask for other features: the same card, "Allow for this chat" remembered
const p1 = Access.ask({ agentId: claude.id, action: 'publish', target: 'my-site', risk: 'high', detail: 'Deploy to production (token=abc123456789)' });
await until(() => document.querySelector('.access-card:not(.answered)'), 3000);
const extCard = [...document.querySelectorAll('.access-card:not(.answered)')].pop();
step('Access.ask shows the card (in the tray when no reply is running), secrets masked', Boolean(extCard?.closest('.access-tray')) && !/abc123456789/.test(extCard?.textContent || ''), extCard?.textContent.slice(0, 120));
if (extCard) await click([...extCard.querySelectorAll('button')].find((b) => b.textContent === 'Allow for this chat'));
const a1 = await p1;
const t1 = Date.now();
const a2 = await Access.ask({ agentId: claude.id, action: 'publish', target: 'my-site', risk: 'high' });
step('allowed, and the second ask passes at once (remembered for this chat)', a1 === true && a2 === true && Date.now() - t1 < 1000);
const p3 = Access.ask({ agentId: claude.id, action: 'install', target: 'thing', risk: 'low' });
await until(() => document.querySelector('.access-tray .access-card:not(.answered)'), 3000);
await click([...document.querySelector('.access-tray .access-card:not(.answered)').querySelectorAll('button')].find((b) => b.textContent === 'Deny'));
step('Deny resolves false', (await p3) === false);

// 5. the panel and the levels from the command
await Commands.tryRun('/access', claude.id);
await wait(400);
const noteBox = [...Native.view(claude.id).list.querySelectorAll('.msg.note')].pop();
step('/access shows the level, folders and buttons for each level', /Access: Full/.test(noteBox?.textContent || '') && ['Off', 'Read', 'Read & write', 'Full'].every((l) => [...noteBox.querySelectorAll('.note-acts button')].some((b) => b.textContent === l)));
Access.panel(claude.id);
await until(() => document.querySelector('.access-modal .access-levels'), 3000);
await wait(700);
step('the panel: four levels, folders, allowed-without-asking list', document.querySelectorAll('.access-modal .access-level').length === 4 && document.querySelectorAll('.access-modal .access-folder').length === 3 && /publish/.test(document.querySelector('.access-modal .access-grants')?.textContent || ''));
await smoke({ shot: '/tmp/access-panel.png' });
document.querySelector('.access-modal')?.close();
await Commands.tryRun('/access read', claude.id);
await wait(200);
step('/access read lowers it', Native.chatOf(claude.id).access.level === 'read');
await Commands.tryRun('/access off', claude.id);
await wait(200);
step('/access off: no badge, nothing sent', Native.chatOf(claude.id).access.level === 'off' && !Native.view(claude.id).meta.querySelector('.access-badge'));

// 6. (round 32) the AI's own setting: ⋯ AI setup → Files on this computer → Full, then a NEW chat writes in its folder
// without a card; a write outside its folders gets one plain line in the chat with "Allow this folder" / "Open AI setup"
const dirAI = `${dir}-ai`;
const outside = `${dir}-outside`;
await fsx.write(`${dirAI}/seed.txt`, 'seed');
await fsx.write(`${outside}/seed.txt`, 'seed');
await Lazy.load('options'); Options.open({ agentId: claude.id });
await until(() => document.querySelector('aside.opt-sheet .access-ai select'), 5000);
const aiSel = document.querySelector('aside.opt-sheet .access-ai select');
step('AI setup has the AI\'s own Files row (a level for every chat)', Boolean(aiSel) && /Files on this computer/.test(aiSel.closest('.opt-row')?.textContent || ''));
aiSel.value = 'full'; aiSel.dispatchEvent(new Event('change'));
await until(() => H.agent(claude.id).fileAccess?.level === 'full', 5000);
step('Full is saved on the AI, with its own folder', H.agent(claude.id).fileAccess?.level === 'full' && H.agent(claude.id).fileAccess.folders.length === 1, H.agent(claude.id).fileAccess);
await Access.addAiFolder(claude.id, dirAI);
await wait(300);
step('AI setup lists its folders, ＋ Add a folder… and My home folder', document.querySelectorAll('aside.opt-sheet .access-ai .access-folder').length === 2 && [...document.querySelectorAll('aside.opt-sheet .access-ai button')].some((b) => /Add a folder/.test(b.textContent)) && [...document.querySelectorAll('aside.opt-sheet .access-ai button')].some((b) => b.textContent === 'My home folder'));
document.querySelector('aside.opt-sheet .access-ai')?.scrollIntoView({ block: 'center' }); await wait(200);
await smoke({ shot: '/tmp/access-ai-setup.png' });
Options.hide();
Native.newChat(claude.id);
await wait(300);
const runIn = async (agentId, calls, onCard) => {
  const before = Native.chatOf(agentId)?.messages?.length || 0;
  Native.send(agentId, `access: ${JSON.stringify(calls)}`);
  // (round 33) a NEW chat is made after an await (its id isn't known yet): wait until the reply is really running, or
  // a loaded machine ended this loop before it started ("ENOENT … new.txt")
  await until(() => Native.isBusy(H.activeChat[agentId]) || (Native.chatOf(agentId)?.messages?.length || 0) > before + 1, 10000);
  const t = Date.now();
  while (Native.isBusy(H.activeChat[agentId]) && Date.now() - t < 60000) { const c = [...document.querySelectorAll('.access-card:not(.answered)')].pop(); if (c && !c.dataset.handled) { c.dataset.handled = '1'; onCard?.(c); } await wait(150); }
  await wait(900);
  return Native.chatOf(agentId).messages.at(-1)?.text || '';
};
let cardsAI = 0;
const r6 = await runIn(claude.id, [['Write', { file_path: `${dirAI}/new.txt`, content: 'from a new chat' }], ['Write', { file_path: `${outside}/nope.txt`, content: 'no' }]], () => { cardsAI += 1; });
step('a NEW chat (no setting of its own) follows the AI: Full, the permission tool, the badge', !Native.chatOf(claude.id).access?.level && Access.effective(Native.chatOf(claude.id)).level === 'full' && /permission tool: yes/.test(r6) && /Full/.test(Native.view(claude.id).meta.querySelector('.access-badge')?.textContent || ''), r6.slice(0, 160));
step('it writes a file in the AI\'s folder without asking', await fsx.read(`${dirAI}/new.txt`) === 'from a new chat');
step('a write outside its folders asks (one card) and, unanswered, doesn\'t happen', cardsAI === 1 && !(await fsx.stat(`${outside}/nope.txt`)));
await until(() => Native.view(claude.id).list.querySelector('.msg.note[data-note-id="access-refused"]'), 4000);
const why = Native.view(claude.id).list.querySelector('.msg.note[data-note-id="access-refused"]');
step('the chat says in one line why (outside its folders) with Allow this folder / Open AI setup', /outside the folders/.test(why?.textContent || '') && ['Allow this folder', 'Open AI setup'].every((l) => [...(why?.querySelectorAll('.note-acts button') || [])].some((b) => b.textContent === l)), why?.textContent);
if (why) await click([...why.querySelectorAll('.note-acts button')].find((b) => b.textContent === 'Allow this folder'));
await until(() => H.agent(claude.id).fileAccess.folders.includes(outside), 3000);
step('Allow this folder adds it to the AI\'s folders', H.agent(claude.id).fileAccess.folders.includes(outside), H.agent(claude.id).fileAccess.folders);
// a chat can still set its own (right-click ⋯ → Access), and go back to the AI's
await Access.setLevel(claude.id, 'read');
step('a chat may still set its own level', Access.effective(Native.chatOf(claude.id)).from === 'chat' && Access.effective(Native.chatOf(claude.id)).level === 'read');
const r6b = await runIn(claude.id, [['Write', { file_path: `${dirAI}/ro.txt`, content: 'x' }]]);
step('…and then it can\'t write (no edit tool at Read)', !(await fsx.stat(`${dirAI}/ro.txt`)) && /Write: denied/.test(r6b));
Access.useAi(claude.id);
step('"As in AI setup" brings the chat back to the AI\'s Full', Access.effective(Native.chatOf(claude.id)).from === 'ai' && Access.effective(Native.chatOf(claude.id)).level === 'full');

// 7. Astra with Full (AI setup): Codex's sandbox writes in its folders; outside them the note says why
const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
if (astra) {
  const dirA = `${dir}-astra`;
  await fsx.write(`${dirA}/seed.txt`, 'seed');
  await Access.setAiLevel(astra.id, 'full');
  await Access.removeAiFolder(astra.id, 1);
  await Access.addAiFolder(astra.id, dirA);
  activate(astra.id);
  Native.newChat(astra.id);
  await wait(300);
  const ra = await runIn(astra.id, [['Write', { file_path: `${dirA}/astra.txt`, content: 'astra wrote' }], ['Write', { file_path: `${outside}/astra-no.txt`, content: 'no' }]]);
  step('Astra with Full (from AI setup): workspace-write on its folder, the write lands', /sandbox: workspace-write; roots: /.test(ra) && ra.includes(dirA) && await fsx.read(`${dirA}/astra.txt`) === 'astra wrote', ra.match(/sandbox:[^\n]*/)?.[0]);
  await until(() => Native.view(astra.id).list.querySelector('.msg.note[data-note-id="access-refused"]'), 4000);
  const whyA = Native.view(astra.id).list.querySelector('.msg.note[data-note-id="access-refused"]');
  step('Astra\'s blocked write outside: not written, and the note says why', !(await fsx.stat(`${outside}/astra-no.txt`)) && /outside the folders/.test(whyA?.textContent || ''), whyA?.textContent);

  // 8. (winshell) a simulated Windows PC: Codex's sandbox refuses every command "by policy" → the note says so and offers
  // the warned opt-in; after it, the command runs (in its folder, no sandbox). AI setup shows the switch on Windows only.
  await window.hub.kvSet('fake-switches', { windows: true });
  Access._setWindows(true);
  whyA?.remove();
  const rw = await runIn(astra.id, [['Bash', { command: 'ls' }]]);
  step('Windows: Astra\'s command is refused by policy (its sandbox)', /Bash: failed · exec command rejected: blocked by policy/.test(rw), rw.match(/Bash:[^\n]*/)?.[0]);
  await until(() => Native.view(astra.id).list.querySelector('.msg.note[data-note-id="access-refused"]'), 4000);
  const whyW = Native.view(astra.id).list.querySelector('.msg.note[data-note-id="access-refused"]');
  const optBtn = [...(whyW?.querySelectorAll('.note-acts button') || [])].find((b) => /Run without its sandbox/.test(b.textContent));
  step('the note says its sandbox blocks commands on Windows, with "Run without its sandbox…" and Open AI setup', /sandbox blocks commands on Windows/.test(whyW?.textContent || '') && Boolean(optBtn) && [...whyW.querySelectorAll('.note-acts button')].some((b) => b.textContent === 'Open AI setup'), whyW?.textContent);
  step('the log lists it as refused by its sandbox (policy)', (await Access.entries(H.activeChat[astra.id])).some((e) => e.result === 'refused' && /blocked by policy/.test(e.why || '')));
  if (optBtn) await click(optBtn);
  await until(() => document.querySelector('dialog.ui-modal button.primary'), 3000);
  step('turning the sandbox off asks first, and says deletes can\'t go to the Trash', /can't go to the Trash/.test(document.querySelector('dialog.ui-modal')?.textContent || ''));
  await smoke({ shot: '/tmp/access-winsandbox.png' });
  document.querySelector('dialog.ui-modal button.primary')?.click();
  await until(() => H.agent(astra.id).astraNoSandbox === true, 3000);
  step('…and then it is saved on Astra', H.agent(astra.id).astraNoSandbox === true);
  Native.newChat(astra.id); // a new Codex session starts in its first folder (-C)
  await wait(300);
  const rw2 = await runIn(astra.id, [['Bash', { command: 'ls' }]]);
  step('after the opt-in the command runs (no sandbox, in its folder)', /sandbox: danger-full-access/.test(rw2) && /Bash: ran · [^\n]*seed\.txt/.test(rw2), rw2.match(/(sandbox|Bash):[^\n]*/g));
  Options.open({ agentId: astra.id });
  await until(() => document.querySelector('aside.opt-sheet .access-ai-nosandbox'), 5000);
  const swRow = document.querySelector('aside.opt-sheet .access-ai-nosandbox');
  step('AI setup (Windows) shows "Run commands without its sandbox", on', /without its sandbox/.test(swRow?.textContent || '') && swRow?.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true');
  swRow?.scrollIntoView({ block: 'center' }); await wait(200);
  await smoke({ shot: '/tmp/access-winsandbox-setup.png' });
  swRow?.querySelector('[role="switch"]')?.click();
  await until(() => H.agent(astra.id).astraNoSandbox !== true, 3000);
  step('switching it off needs no question', H.agent(astra.id).astraNoSandbox !== true);
  Options.hide();
  // Claude on Windows: commands come as PowerShell; at Full they go through Hearth's check; below, the note says why
  activate(claude.id);
  Native.newChat(claude.id);
  await wait(300);
  const rc = await runIn(claude.id, [['Bash', { command: `cd "${dirAI}"; ls` }]]);
  step('Windows: Claude at Full runs a PowerShell command through Hearth\'s check', /tools: [^;\n]*PowerShell/.test(rc) && /PowerShell: ran · [^\n]*seed\.txt/.test(rc) && (await Access.entries(H.activeChat[claude.id])).some((e) => e.tool === 'PowerShell' && /allowed|approved|done/.test(e.result)), rc.match(/(permission tool|PowerShell):[^\n]*/g));
  await Access.setLevel(claude.id, 'write');
  const rc2 = await runIn(claude.id, [['Bash', { command: 'ls' }]]);
  await until(() => Native.view(claude.id).list.querySelector('.msg.note[data-note-id="access-refused"]'), 4000);
  const whyC = Native.view(claude.id).list.querySelector('.msg.note[data-note-id="access-refused"]');
  step('below Full the CLI refuses PowerShell, and the chat says why with Allow commands (never silent)', /No such tool available: PowerShell/.test(rc2) && /couldn't run a command/.test(whyC?.textContent || '') && [...(whyC?.querySelectorAll('.note-acts button') || [])].some((b) => b.textContent === 'Allow commands'), whyC?.textContent);
  Access.useAi(claude.id);
  await window.hub.kvSet('fake-switches', {});
  Access._setWindows(false);
  delete H.agent(astra.id).fileAccess;
  activate(claude.id);
}
delete H.agent(claude.id).fileAccess;
await saveConfig();
step('no duplicate command names', !Commands.duplicates?.().length, Commands.duplicates?.());
step('no errors in the window', !J.out.errors.length, J.out.errors.slice(0, 3));
return J.done();
