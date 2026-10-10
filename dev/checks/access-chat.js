// Access (round 14): a Claude chat with file access, end to end through the fake CLI, mcp/access-mcp.js and the real
// window: ⋯ → Access and /access set the level and folders; a read and a write inside the folder pass silently (the
// write keeps a copy); `rm` asks with a card → Allow once → Hearth moves it to the Trash instead; `git push` → Deny with a
// note; `sudo` is refused with the password card; `curl` waits until the card times out (denied); the activity log
// lists everything with Undo (an edit comes back, a new file goes to the Trash); Access.ask (other features) uses the
// same card and remembers "Allow for this chat"; the badge shows the level.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/access-chat.js
const { step, wait, until, click } = J;
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
await click(Native.view(claude.id).root.querySelector('.native-head button[title="Chat options"]'));
const accessRow = [...document.querySelectorAll('#menu button, #menu .menu-item')].find((b) => /^Access/.test(b.textContent.trim()));
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
    if (/rm c\.txt/.test(text)) { card.dataset.handled = '1'; await click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Allow once')); }
    else if (/git push/.test(text)) { card.dataset.handled = '1'; card.querySelector('.access-note').value = 'not yet, review first'; await click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Deny')); }
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
await Native.addPath(claude.id, dir2);
step('a folder dropped on the chat joins its folders', Native.chatOf(claude.id).access.folders.includes(dir2));
Native.send(claude.id, `access: ${JSON.stringify([['Bash', { command: `cd "${dir2}" && rm d.txt` }], ['Bash', { command: `cd "${dir2}" && rm e.txt` }]])}`);
await wait(400);
let cards2 = 0;
const t2 = Date.now();
while (Native.isBusy(H.activeChat[claude.id]) && Date.now() - t2 < 60000) {
  const card = [...document.querySelectorAll('.access-card:not(.answered)')].pop();
  if (card && !card.dataset.handled) { card.dataset.handled = '1'; cards2 += 1; await click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Allow for this chat')); }
  await wait(150);
}
await wait(300);
const reply2 = Native.chatOf(claude.id).messages.at(-1)?.text || '';
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
step('no duplicate command names', !Commands.duplicates?.().length, Commands.duplicates?.());
step('no errors in the window', !J.out.errors.length, J.out.errors.slice(0, 3));
return J.done();
