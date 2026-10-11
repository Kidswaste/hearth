// Reach (round 19): a path from the other computer resolves here; a reply's page shows as a card (▶ Open · Preview ·
// Reveal) and its path in the text is clickable; a page made on the other computer waits ("Made on your other
// computer") and opens up when it arrives (hearth:synced); chat_open through the fake Claude CLI and its real MCP
// server (inside Hearth's data: no question; elsewhere: Access.ask → Allow once); /open-file; the sync conflicts view
// names both computers and applies a choice with a summary.
//   node dev/smoke.js --fake-engines --check-timeout 200000 --lib dev/checks/journey-lib.js --script dev/checks/reach-open.js --shot /tmp/reach.png
const { step, wait, until, click } = J;
const C = H.claudeAgent();
const fsx = window.hub.fs;
const inf = await window.hub.reach.info();
const sep = inf.dataDir.includes('\\') ? '\\' : '/';
const local = (rel) => [inf.dataDir, ...rel.split('/')].join(sep);
const MAC = (rel) => `/Users/someone/Library/Application Support/Hearth/data/${rel}`;
const WIN = (rel) => `C:\\Users\\someone\\AppData\\Roaming\\Hearth\\data\\${rel.split('/').join('\\')}`;
Access._setTimeout(20000);
await fsx.write(local('workspace/stoop-ronin/index.html'), '<!doctype html><title>Stoop Ronin</title><h1>Stoop Ronin</h1>');
activate(C.id);
await until(() => Native.hasView(C.id));
Native.newChat(C.id);
await wait(300);

// 1. path translation (main side), both forms
const [r1, r2, r3] = await window.hub.reach.resolve([MAC('workspace/stoop-ronin/index.html'), WIN('workspace/stoop-ronin/index.html'), MAC('workspace/stoop-ronin/later.html')]);
step('a Mac path resolves to this computer\'s data folder', r1.exists && r1.foreign && r1.path === local('workspace/stoop-ronin/index.html'), r1);
step('a Windows path too', r2.exists && r2.path === local('workspace/stoop-ronin/index.html'), r2);
step('a file not here yet: not found, and sync is off (says so)', !r3.exists && r3.syncOff && r3.rel === 'workspace/stoop-ronin/later.html', r3);

// 2. a reply that names the Mac path: a page card + a clickable path; the one made on the other computer waits
await Native.send(C.id, `echo The characters are saved: \`${MAC('workspace/stoop-ronin/index.html')}\` and \`${MAC('workspace/stoop-ronin/later.html')}\``);
await until(() => Native.current(C.id).messages.at(-1)?.role === 'assistant', 30000);
await until(() => (Native.current(C.id).messages.at(-1)?.opens || []).length >= 2, 8000);
const m = Native.current(C.id).messages.at(-1);
step('the reply\'s pages are saved with it, at this computer\'s path', m.opens?.[0]?.path === local('workspace/stoop-ronin/index.html') && m.opens?.[1]?.elsewhere, m.opens);
await until(() => document.querySelector('.msg.assistant .reach-card'), 5000);
const last = () => [...Native.view(C.id).list.querySelectorAll('.msg.assistant')].at(-1);
const cards = [...last().querySelectorAll('.reach-card')];
step('two cards: ▶ Open · Preview · Reveal, and one waiting', cards.length === 2 && /▶ Open/.test(cards[0].textContent) && /Preview/.test(cards[0].textContent) && cards[1].classList.contains('waiting') && /other computer/.test(cards[1].textContent), cards.map((c) => c.textContent));
const code = last().querySelector('code.reach-path');
step('the path in the text is clickable', Boolean(code));
if (code) {
  code.click(); // (a long path wraps: a real click at its box's centre lands on the text between its lines)
  await until(() => !document.getElementById('menu')?.hidden && /Open/.test(document.getElementById('menu')?.textContent || ''), 3000);
  const t = document.getElementById('menu')?.textContent || '';
  step('its menu: open, browser, preview, reveal, copy (this computer\'s copy)', /Open/.test(t) && /browser/.test(t) && /Preview/.test(t) && /This computer's copy/.test(t), t.slice(0, 200));
  hideMenu();
}
await smoke({ shot: '/tmp/reach-cards.png' });
const prev = await window.hub.reach.open({ path: m.opens[0].path, how: 'preview' });
step('Preview opens a Hearth window (sandboxed)', prev.ok && prev.how === 'preview', prev);
// arrival: the file comes (as sync would bring it) → the waiting card opens up
await fsx.write(local('workspace/stoop-ronin/later.html'), '<h1>later</h1>');
window.dispatchEvent(new CustomEvent('hearth:synced', { detail: { files: [{ rel: 'workspace/stoop-ronin/later.html', kind: 'file' }] } }));
await until(() => !last().querySelector('.reach-card.waiting'), 5000);
step('when it arrives the card opens up (and says so)', !last().querySelector('.reach-card.waiting') && recentToasts().some((t) => /later\.html arrived/.test(t.message)), recentToasts().slice(-2).map((t) => t.message));

// 3. chat_open through the fake CLI's real MCP calls: inside Hearth's data (no question), then outside (asks once)
await fsx.write('/tmp/reach-outside/page.html', '<h1>outside</h1>');
await Native.send(C.id, `mcp\nmcp: [["chat_open", {"path": "${MAC('workspace/stoop-ronin/index.html')}", "how": "preview"}], ["chat_open", {"path": "/tmp/reach-outside/page.html", "how": "preview"}]]`);
const card = await until(() => document.querySelector('.access-card button.primary, .msg .access-row button.primary'), 20000);
step('a file outside the chat\'s folders asks first (low risk)', Boolean(card));
const allow = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Allow once' && b.offsetParent);
if (allow) await click(allow);
await until(() => Native.current(C.id).messages.at(-1)?.role === 'assistant' && /MCP calls/.test(Native.current(C.id).messages.at(-1).text), 30000);
const rep = Native.current(C.id).messages.at(-1);
const lines = rep.text.split('\n').filter((l) => /^- chat_open/.test(l));
step('chat_open with a Mac path opens this computer\'s copy (no question)', /Opened .*index\.html in a Hearth preview window \(this computer's copy/.test(lines[0] || ''), lines[0]);
step('chat_open outside: allowed once, opened', /Opened \/tmp\/reach-outside\/page\.html/.test(lines[1] || ''), lines[1]);
step('what it opened shows as cards in the reply', (rep.opens || []).length === 2, rep.opens);

// 4. Astra gets chat_open alone (engines: openTool), and /open-file
const astra = H.agents().find((a) => a.engine === 'codex');
const runCmd = (name, args, agentId) => Commands.get(name).run(args, { agentId, chat: Native.chatOf(agentId), say: () => {}, note: () => {} });
if (astra) { const r = await runCmd('open-tool', '', astra.id); step('/open-tool says Astra can open things', /can open/.test(String(r || '')), r); }
if (astra) {
  activate(astra.id);
  await until(() => Native.hasView(astra.id));
  Native.newChat(astra.id);
  await wait(300);
  await Native.send(astra.id, `echo mcp\nmcp: [["chat_open", {"path": ${JSON.stringify(WIN('workspace/stoop-ronin/index.html'))}, "how": "preview"}]]`);
  await until(() => /chat_open/.test(Native.current(astra.id).messages.at(-1)?.text || '') && Native.current(astra.id).messages.at(-1).role === 'assistant', 30000);
  const t = Native.current(astra.id).messages.at(-1).text;
  step('Astra (fake Codex) opens it with chat_open too', /chat_open: .*Opened .*index\.html in a Hearth preview window/.test(t), t.slice(-400));
  activate(C.id);
}
const ofr = await runCmd('open-file', `${WIN('workspace/stoop-ronin/index.html')} preview`, C.id);
step('/open-file opens a path from the other computer here', /this computer's copy/.test(String(ofr || '')), ofr);


step('no duplicate command names', !Commands.duplicates?.().length, Commands.duplicates?.());
step('no errors in the window', !J.out.errors.length, J.out.errors.slice(0, 3));
return J.done();
