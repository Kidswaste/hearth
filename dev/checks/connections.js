// Connections (round 26, connections.js): ⋯ AI setup → What it can use → ＋ Add a connection, like the owner would:
// the ready-made list (8, marked needs Node / Python), the secrets note, your own server (dev/fake-mcp-server.js with a
// token setting) added through the form → tested → on for this AI as Read only; a server that doesn't start says why;
// the fake Claude and fake Codex then call its tools for real (the token reaches the server, never the chat);
// /connections; Remove.
// (round 80, checkfix80) driven through today's screen with real input (CDP mouse / typing, as the owner's clicks): the
// chat header's ⋯ opens AI setup under it, "Connections" is a fold under What it can use (opened by a click on its
// line, its one-line state read when it opens), the form typed into, the row's Test button, the row's
// right-click menu → Remove and its confirm. Each click is checked to land on what it means to press (on screen, not
// covered): a click that only works from a script fails here. The dev folder comes from the harness (SMOKE_DEV), so
// Windows paths need no parsing; pictures go to the run's own scratch folder.
//   node dev/smoke.js --fake-engines --check-timeout 150000 --script dev/checks/connections.js --shot /tmp/connections.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const frames = (n = 2) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const SECRET = 'sk-smoke-0123456789';
const T = window.SMOKE_TMP || '/tmp';
const dev = window.SMOKE_DEV || (H.settings().enginePaths?.claude || '').replace(/[\\/][^\\/]+$/, '');
const server = `${dev}/fake-mcp-server.js`;
// ---------- real input ----------
const cdp = (method, params) => smoke({ cdp: method, params });
const desc = (n) => (n ? `${n.tagName.toLowerCase()}${n.className && typeof n.className === 'string' ? `.${n.className.trim().split(/\s+/).join('.')}` : ''}${n.textContent ? ` "${n.textContent.trim().slice(0, 30)}"` : ''}` : 'nothing');
const shown = (n) => { if (!n?.isConnected) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
// a click where the owner's mouse would land: the element on screen, the topmost thing at its middle (it or inside it)
async function click(n, what, button = 'left') {
  if (!ok(n, `${what}: there`)) return false;
  n.scrollIntoView({ block: 'nearest' }); await frames(2);
  const r = n.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  if (!ok(shown(n) && hit && (hit === n || n.contains(hit)), `${what}: on screen and not covered (${desc(hit)} is at its middle)`)) return false;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: button === 'right' ? 2 : 1, clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 });
  await frames(2);
  return true;
}
// typed into a field: a click on it, then the text as the keyboard sends it
async function type(n, text, what) {
  if (!(await click(n, what))) return false;
  n.select?.();
  await cdp('Input.insertText', { text });
  return ok(n.value === text, `${what}: typed (${JSON.stringify(n.value)})`);
}
const button = (root, re) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()));
const sheet = () => document.querySelector('aside.opt-sheet');
// ⋯ in the chat's header → AI setup, the Connections fold open; returns its box
async function openConnections(agentId, what) {
  const view = Native.viewOf?.(agentId)?.root || document.querySelector('.surface.active');
  const dots = [...(view || document).querySelectorAll('.chat-menu-btn')].find(shown) || [...document.querySelectorAll('.chat-menu-btn')].find(shown);
  if (!(await click(dots, `${what}: the chat's ⋯ (AI setup)`))) return null;
  if (!ok(await until(() => sheet(), 8000), `${what}: ⋯ opens AI setup`)) return null;
  const fold = await until(() => sheet()?.querySelector('details[data-fold="connections"]'), 8000);
  if (!ok(fold, `${what}: AI setup has a Connections part under What it can use`)) return null;
  if (!fold.open) await click(fold.querySelector(':scope > summary'), `${what}: the Connections line`);
  ok(fold.open, `${what}: a click on its line opens Connections`);
  const box = await until(() => { const b = fold.querySelector('.cn-box'); return b && b.querySelector('button') ? b : null; }, 10000);
  ok(box && shown(box), `${what}: AI setup shows Your connections`);
  return box;
}
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
  activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(300);

  // 1. the panel: ⋯ → AI setup → Connections → ＋ Add a connection
  let box = await openConnections(C.id, 'open');
  out.foldLine = sheet()?.querySelector('details[data-fold="connections"] .opt-sum')?.textContent;
  ok(out.foldLine === 'None on', `the Connections line says none are on yet (${out.foldLine})`);
  const addBtn = button(box, /Add a connection/);
  ok(addBtn, 'the ＋ Add a connection button');
  await click(addBtn, '＋ Add a connection');
  ok(await until(() => document.querySelectorAll('dialog.cn-dialog[open] .cn-card').length === 8), 'the ready-made list (8)');
  const dlg = document.querySelector('dialog.cn-dialog[open]');
  out.cards = [...(dlg?.querySelectorAll('.cn-card') || [])].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
  ok(out.cards.length && out.cards.every((t) => /needs (Node|Python)/.test(t) && /tok/.test(t)), 'each card says what it needs and its cost');
  ok(/never to the AI/.test(dlg?.querySelector('.cn-secret')?.textContent || ''), 'the dialog says secrets never go to the AI');

  // 2. your own, through the form (typed)
  const [name, line] = dlg?.querySelectorAll('.cn-own input') || [];
  const sets = dlg?.querySelector('.cn-own textarea');
  await type(name, 'Notes', 'the name field');
  await type(line, `node "${server}"`, 'the command line field');
  await type(sets, `FAKE_MCP_TOKEN=${SECRET}`, 'the settings field');
  await smoke({ shot: `${T}/connections-add.png` });
  await click(button(dlg?.querySelector('.cn-own'), /^Add$/), 'the form\'s Add');
  ok(!document.querySelector('dialog.cn-dialog[open]'), 'Add closes the dialog');
  ok(await until(() => (H.config.connections || []).some((c) => c.name === 'Notes' && c.tools?.length === 4), 20000), 'added and tested (4 tools saved)');
  const notes = (H.config.connections || []).find((c) => c.name === 'Notes') || {};
  out.saved = { command: notes.command, args: notes.args, env: Object.keys(notes.env || {}), tokens: notes.tokens };
  ok(notes.command === 'node' && notes.args?.[0] === server && notes.env?.FAKE_MCP_TOKEN === SECRET, 'the command line and setting are stored');
  ok(await until(() => H.agent(C.id).connections?.[notes.id] === 'read', 5000), `on for Claude as Read only (${JSON.stringify(H.agent(C.id).connections)})`);
  box = sheet()?.querySelector('.cn-box') || box;
  ok(await until(() => /✓ fake-notes: 4 tools/.test(sheet()?.querySelector('.cn-box .cn-result')?.textContent || '')), 'the row shows the Test result');
  // (round 81, playchurn81) the fold's one line follows the add while AI setup stays open (it said "None on" until reopened)
  const foldLine = () => sheet()?.querySelector('details[data-fold="connections"] .opt-sum')?.textContent;
  out.foldLineAfterAdd = await until(() => (/1 of yours/.test(foldLine() || '') ? foldLine() : null), 5000) || foldLine();
  ok(/1 of yours/.test(out.foldLineAfterAdd || ''), `the open AI setup's Connections line follows the add (${out.foldLineAfterAdd})`);
  const rowOf = (n) => [...(sheet()?.querySelectorAll('.cn-box .cn-row') || [])].find((r) => r.querySelector('.opt-label span')?.textContent === n);
  // (the row is drawn again once the switch is saved: read after that, a read right away raced it on a busy machine)
  const sel = await until(() => { const x = rowOf('Notes')?.querySelector('select'); return x?.value === 'read' ? x : null; }, 5000) || rowOf('Notes')?.querySelector('select');
  out.options = [...(sel?.options || [])].map((o) => o.textContent);
  ok(sel?.value === 'read' && out.options.join() === 'Off,Read only,Full', `Off / Read only / Full (${out.options})`);
  ok(/≈ \d+ tokens a message/.test(rowOf('Notes')?.querySelector('.cn-tok')?.textContent || ''), 'its token cost');
  // the row's own Test button: "Starting it…", then the result again
  await click(button(rowOf('Notes'), /^Test$/), 'the row\'s Test');
  ok(await until(() => /✓ fake-notes: 4 tools/.test(rowOf('Notes')?.nextElementSibling?.textContent || ''), 15000), 'the row\'s Test button tests it again');
  rowOf('Notes')?.scrollIntoView({ block: 'center' }); await wait(100);
  await smoke({ shot: `${T}/connections-panel.png` });

  // 3. one that doesn't start (added through the same form)
  await click(button(sheet()?.querySelector('.cn-box'), /Add a connection/), '＋ Add a connection (again)');
  const dlg2 = await until(() => document.querySelector('dialog.cn-dialog[open]'), 5000);
  const [n2, l2] = dlg2?.querySelectorAll('.cn-own input') || [];
  await type(n2, 'Broken', 'the name field (broken)');
  await type(l2, `node "${server}" --crash`, 'the command line field (broken)');
  await click(button(dlg2?.querySelector('.cn-own'), /^Add$/), 'the form\'s Add (broken)');
  const broken = await until(() => (H.config.connections || []).find((c) => c.name === 'Broken'), 5000);
  ok(await until(() => /stopped before answering.*missing folder/.test([...(sheet()?.querySelectorAll('.cn-box .cn-result.bad') || [])].map((p) => p.textContent).join(' ')), 15000), 'a server that stops says why');
  ok(broken && !H.agent(C.id).connections?.[broken.id], 'and is not switched on');

  // 4. the engines use it: Full for Claude (fake Claude calls the tools for real)
  const sel2 = rowOf('Notes')?.querySelector('select');
  if (sel2) { sel2.value = 'full'; sel2.dispatchEvent(new Event('change')); } // (a <select>'s list is the system's own popup: picked as its change)
  ok(await until(() => H.agent(C.id).connections?.[notes.id] === 'full'), 'Full for Claude');
  ok(/1 of yours/.test(foldLine() || ''), `the line still counts it after Read only → Full (${foldLine()})`);
  await click(sheet()?.querySelector('.opt-head button[title^="Close"]'), 'AI setup\'s ✕');
  ok(await until(() => !sheet(), 3000), '✕ closes AI setup');
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

  // 5. the command, and Remove (right-click on its row → Remove → the confirm's Remove)
  const t = await Commands.get('connections').run('test notes', { agentId: C.id });
  ok(/Notes works: 4 tools/.test(t || ''), `/connections test (${t})`);
  const off = await Commands.get('connections').run('off notes', { agentId: C.id });
  ok(!H.agent(C.id).connections?.[notes.id] && /off/.test(off), '/connections off');
  activate(C.id); await until(() => Native.hasView(C.id)); await wait(300);
  if (sheet()) Options.hide();
  await openConnections(C.id, 'reopen');
  out.foldLineReopened = sheet()?.querySelector('details[data-fold="connections"] .opt-sum')?.textContent;
  ok(/None on/.test(out.foldLineReopened || ''), `after /connections off the Connections line says none are on (${out.foldLineReopened})`);
  for (const n of ['Notes', 'Broken']) {
    if (!(await click(rowOf(n)?.querySelector('.opt-label'), `${n}'s row (right-click)`, 'right'))) continue;
    const rm = await until(() => { const m = document.getElementById('menu'); return m && !m.hidden ? button(m, /^Remove$/) : null; }, 3000);
    if (!(await click(rm, `${n}: the menu's Remove`))) continue;
    const yes = await until(() => { const d = [...document.querySelectorAll('dialog.ui-modal[open]')].at(-1); return d && /Remove this connection/.test(d.textContent) ? button(d, /^Remove$/) : null; }, 3000);
    await click(yes, `${n}: the confirm's Remove`);
    ok(await until(() => !(H.config.connections || []).some((c) => c.name === n), 5000), `${n} removed`);
  }
  ok(!(H.config.connections || []).length && !H.agent(A?.id || C.id)?.connections && !H.agent(C.id)?.connections, 'Remove takes it away for every AI');
  ok(await until(() => !sheet()?.querySelector('.cn-box .cn-row'), 3000), 'no rows left in AI setup');
  if (sheet()) Options.hide();
} catch (err) { fail.push(`threw: ${err.stack || err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
