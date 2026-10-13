// Connections (round 26, connections.js): ⋯ AI setup → What it can use → ＋ Add a connection, like the owner would:
// the ready-made list (8, marked needs Node / Python), the secrets note, your own server (dev/fake-mcp-server.js with a
// token setting) added through the form → tested → on for this AI as Read only; a server that doesn't start says why;
// the fake Claude and fake Codex then call its tools for real (the token reaches the server, never the chat);
// /connections; Remove.
//   node dev/smoke.js --fake-engines --check-timeout 150000 --script dev/checks/connections.js --shot /tmp/connections.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const SECRET = 'sk-smoke-0123456789';
const dev = (H.settings().enginePaths?.claude || '').replace(/[\\/][^\\/]+$/, '');
const server = `${dev}/fake-mcp-server.js`;
const realConfirm = Modal.confirm;
async function reply(agentId, text) {
  Native.send(agentId, text);
  await wait(400);
  const chatId = H.activeChat[agentId];
  await until(() => !Native.isBusy(chatId), 60000);
  await wait(300);
  return Native.chatOf(agentId).messages.at(-1)?.text || '';
}
try {
  const C = H.claudeAgent();
  const A = H.agents().find((a) => a.engine === 'codex');
  activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);

  // 1. the panel: a row under What it can use
  await Lazy.load('options'); Options.open({ agentId: C.id });
  ok(await until(() => document.querySelector('aside.opt-sheet .cn-box button')), 'AI setup shows Your connections');
  const addBtn = [...document.querySelectorAll('.cn-box button')].find((b) => /Add a connection/.test(b.textContent));
  ok(addBtn, 'the ＋ Add a connection button');
  addBtn.click();
  ok(await until(() => document.querySelectorAll('.cn-dialog .cn-card').length === 8), 'the ready-made list (8)');
  out.cards = [...document.querySelectorAll('.cn-dialog .cn-card')].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
  ok(out.cards.every((t) => /needs (Node|Python)/.test(t) && /tok/.test(t)), 'each card says what it needs and its cost');
  ok(/never to the AI/.test(document.querySelector('.cn-dialog .cn-secret')?.textContent || ''), 'the dialog says secrets never go to the AI');

  // 2. your own, through the form
  const [name, line] = document.querySelectorAll('.cn-dialog .cn-own input');
  const sets = document.querySelector('.cn-dialog .cn-own textarea');
  name.value = 'Notes';
  line.value = `node "${server}"`;
  sets.value = `FAKE_MCP_TOKEN=${SECRET}`;
  await smoke({ shot: '/tmp/connections-add.png' });
  [...document.querySelectorAll('.cn-dialog .cn-own button')].find((b) => /^Add$/.test(b.textContent)).click();
  ok(await until(() => (H.config.connections || []).some((c) => c.name === 'Notes' && c.tools?.length === 4), 20000), 'added and tested (4 tools saved)');
  const notes = H.config.connections.find((c) => c.name === 'Notes');
  out.saved = { command: notes.command, args: notes.args, env: Object.keys(notes.env || {}), tokens: notes.tokens };
  ok(notes.command === 'node' && notes.args[0] === server && notes.env.FAKE_MCP_TOKEN === SECRET, 'the command line and setting are stored');
  ok(H.agent(C.id).connections?.[notes.id] === 'read', `on for Claude as Read only (${JSON.stringify(H.agent(C.id).connections)})`);
  ok(await until(() => /✓ fake-notes: 4 tools/.test(document.querySelector('.cn-box .cn-result')?.textContent || '')), 'the row shows the Test result');
  const sel = document.querySelector('.cn-box .cn-row select');
  out.options = [...(sel?.options || [])].map((o) => o.textContent);
  ok(sel?.value === 'read' && out.options.join() === 'Off,Read only,Full', `Off / Read only / Full (${out.options})`);
  ok(/≈ \d+ tokens a message/.test(document.querySelector('.cn-box .cn-row .cn-tok')?.textContent || ''), 'its token cost');
  document.querySelector('.cn-box').scrollIntoView({ block: 'center' }); await wait(100);
  await smoke({ shot: '/tmp/connections-panel.png' });

  // 3. one that doesn't start
  await Connections.add({ id: 'cn-broken', name: 'Broken', kind: 'stdio', command: 'node', args: [server, '--crash'] }, null);
  ok(await until(() => /stopped before answering.*missing folder/.test([...document.querySelectorAll('.cn-box .cn-result.bad')].map((p) => p.textContent).join(' '))), 'a server that stops says why');
  ok(!H.agent(C.id).connections?.['cn-broken'], 'and is not switched on');

  // 4. the engines use it: Full for Claude (fake Claude calls the tools for real)
  sel.value = 'full'; sel.dispatchEvent(new Event('change'));
  await until(() => H.agent(C.id).connections?.[notes.id] === 'full');
  document.querySelector('aside.opt-sheet .opt-head button[title^="Close"]')?.click();
  const rc = await reply(C.id, 'mcp: [["notes_read", {"name": "hello"}], ["notes_env", {}]]');
  out.claude = rc.slice(-300);
  ok(/notes_read: .*Hello from the fake server/.test(rc) && /notes_env: .*token set \(19 chars\)/.test(rc), 'Claude used the connection (and the token reached the server)');
  ok(!JSON.stringify(Native.chatOf(C.id)).includes(SECRET), 'the token is nowhere in the chat');
  if (A) {
    await Connections.setMode(A.id, notes.id, 'read');
    activate(A.id); await until(() => Native.hasView(A.id)); Native.newChat(A.id); await wait(200);
    const rx = await reply(A.id, 'mcp: [["notes_list", {}]]');
    out.codex = rx.slice(-200);
    ok(/servers: .*notes/.test(rx) && /notes_list: .*hello/.test(rx), 'Astra (Codex) used it too');
  }

  // 5. the command, and Remove
  const t = await Commands.get('connections').run('test notes', { agentId: C.id });
  ok(/Notes works: 4 tools/.test(t || ''), `/connections test (${t})`);
  const off = await Commands.get('connections').run('off notes', { agentId: C.id });
  ok(!H.agent(C.id).connections?.[notes.id] && /off/.test(off), '/connections off');
  Modal.confirm = async () => true;
  await Connections.remove(notes.id);
  await Connections.remove('cn-broken');
  ok(!(H.config.connections || []).length && !H.agent(A?.id || C.id)?.connections, 'Remove takes it away for every AI');
} catch (err) { fail.push(`threw: ${err.message}`); }
Modal.confirm = realConfirm;
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
