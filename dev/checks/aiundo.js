// One undo for what the AIs did (aiundo.js, round 28), end to end through the fake Claude engine's REAL tool calls:
// a director reply edits its Lab scene (three_edit_code → the time machine) and adds two notes to the board
// (board_add), a second reply writes a new file and edits another (chat access, copies kept), a third runs a command
// that changes a setting (three_do run /nodes-director off). Each lands in the timeline with who / chat / reply / plain
// words; the replies get "↶ Undo what it did"; then each is undone: the new file goes and the edited one comes back
// (with a warning first, because the owner touched it after), the Lab scene and the board go back through the reply's
// button (a confirm that lists the changes and warns about the note the owner edited), the setting gets its old value;
// the Activity panel's "Changes by AIs" part shows it all, /ai-undo lists it.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/aiundo.js --shot /tmp/aiundo.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
try {
  const fsx = window.hub.fs;
  const dir = `/tmp/hearth-aiundo-${Date.now().toString(36)}`;
  await fsx.write(`${dir}/a.txt`, 'alpha');
  await Lazy.load('aiundo');
  await Lazy.load('activity');
  step(typeof AiUndo !== 'undefined' && typeof AiUndoCore !== 'undefined', 'the aiundo group loads');
  await AiUndo.ready();

  // a director with the board tools on
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  H.config.agents.find((a) => a.id === agent.id).boardTools = true;
  await saveConfig();
  activate('tool:three');
  await ThreeLab.cmd();
  await until(() => ThreeLab.scenes && ThreeLab.director && window.ThreeHistory);
  await wait(600);
  const D = ThreeLab.director;
  const CODE = `import * as THREE from 'three';
const P = tweak({ spin: { value: 0.3, min: -2, max: 2, label: 'Spin' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#7a5cff', wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.y = now / 1000 * P.spin; renderer.render(scene, camera); });
// rev base`;
  Native.newChat(agent.id);
  await wait(500);
  const turn = async (text) => { await Native.send(agent.id, text); await wait(300); await until(() => !Native.isBusy(H.activeChat[agent.id]), 90000); await wait(1200); };
  // the scene, set up by a first director turn (that is an AI change too)
  await turn(`mcp: ${JSON.stringify([['three_set_code', { code: CODE, wait: 1 }]])}`);
  const chatId = H.activeChat[agent.id];
  const sid = ChatScenes.linkOf(chatId) || ThreeLab.scenes.currentId();
  const main = () => D.codeOf().name;
  await ThreeHistory.flush(sid);
  await Access.setLevel(agent.id, 'full');
  await Access.addFolder(agent.id, dir);
  await Board.ready();
  const boardN0 = Board.current().items.length;

  // ---------- reply B: a Lab edit + two board notes ----------
  await turn(`mcp: ${JSON.stringify([['three_edit_code', { layer: main(), edits: [{ find: 'rev base', replace: 'rev by-claude' }], wait: 0.3 }], ['board_add', { kind: 'note', text: 'neon grain, slow push-ins' }], ['board_add', { kind: 'note', text: 'cut on the snare' }]])}`);
  const msgsB = Native.chatOf(agent.id).messages;
  const replyB = msgsB.at(-1);
  const idxB = msgsB.length - 1;
  step(/MCP calls/.test(replyB?.text || '') && !/ERROR/.test(replyB?.text || ''), 'reply B ran its tool calls', (replyB?.text || '').slice(-300));
  step(/rev by-claude/.test(D.codeOf(main()).code), 'the director\'s edit is on the scene');
  step(Board.current().items.length === boardN0 + 2, 'two notes are on the board', Board.current().items.length - boardN0);
  await until(() => AiUndo.list().some((e) => e.area === 'lab' && e.turn === replyB.aiChanges?.turn), 6000);
  const L = () => AiUndo.list();
  const turnB = replyB?.aiChanges?.turn;
  const inB = L().filter((e) => e.turn === turnB);
  step(Boolean(turnB), 'the reply knows it changed something (aiChanges)', replyB?.aiChanges);
  step(inB.some((e) => e.area === 'lab' && e.tk === `scene:${sid}`) && inB.filter((e) => e.area === 'board').length === 2, 'the timeline has the Lab change and both board changes, under that reply', inB.map((e) => `${e.area}: ${e.what}`));
  const e0 = inB[0];
  step(e0 && e0.by === agent.id && e0.who === agent.name && e0.chat === chatId && e0.chatTitle && e0.at > 0, 'who (the AI), which chat, when', e0 && { who: e0.who, chat: e0.chatTitle });
  step(inB.some((e) => /^Added a note/.test(e.what) && /board “/.test(e.target)), 'plain words for a board change', inB.filter((e) => e.area === 'board').map((e) => `${e.what} · ${e.target}`));
  step(L().some((e) => e.area === 'lab' && e.turn && e.turn !== turnB), 'the first turn\'s scene setup is in the timeline too');
  await wait(300);
  const btnB = () => [...Native.view(agent.id).list.querySelectorAll('.msg.assistant')].find((n) => Number(n.dataset.index) === idxB)?.querySelector('.au-reply');
  step(btnB()?.tagName === 'BUTTON' && /Undo what it did/.test(btnB().textContent), 'the reply has "↶ Undo what it did" in its actions', btnB()?.outerHTML?.slice(0, 120));

  // ---------- reply C: a new file + an edit (chat access keeps a copy) ----------
  await turn(`access: ${JSON.stringify([['Write', { file_path: `${dir}/new.txt`, content: 'made by claude' }], ['Edit', { file_path: `${dir}/a.txt`, old_string: 'alpha', new_string: 'ALPHA' }]])}`);
  const replyC = Native.chatOf(agent.id).messages.at(-1);
  step(/Write: ran/.test(replyC?.text || '') && /Edit: ran/.test(replyC?.text || ''), 'reply C wrote and edited', (replyC?.text || '').slice(-200));
  await until(() => L().filter((e) => e.area === 'file').length >= 2, 6000);
  const fNew = L().find((e) => e.area === 'file' && /Created new\.txt/.test(e.what));
  const fEdit = L().find((e) => e.area === 'file' && /Edited a\.txt/.test(e.what));
  step(fNew && fEdit && fNew.turn === replyC.aiChanges?.turn && !fNew.cant && !fEdit.cant, 'the new file and the edit are in the timeline, undoable, under reply C', L().filter((e) => e.area === 'file').map((e) => `${e.what}${e.cant ? ` (${e.cant})` : ''}`));
  await until(() => fEdit?.after, 4000);
  step(Boolean(fEdit?.after?.mtime), 'right after the reply the file\'s state is noted (to notice later changes)', fEdit?.after);

  // ---------- reply D: a command that changes a setting ----------
  const nodesBefore = H.agent(agent.id).nodesTool;
  await turn(`mcp: ${JSON.stringify([['three_do', { cmd: 'run', command: '/nodes-director off' }]])}`);
  const sEntry = await until(() => L().find((e) => e.area === 'setting'), 6000);
  step(H.agent(agent.id).nodesTool === false && sEntry && /nodes-director off/.test(sEntry.what) && /nodesTool/.test(sEntry.what), 'a setting the AI changed by a command is recorded with its old value', sEntry?.what);

  // ---------- undo this: the new file ----------
  let r = await AiUndo.undoThis(fNew.id, { confirm: false });
  step(r.ok && r.done === 1 && !(await fsx.stat(`${dir}/new.txt`)), 'undo this: the new file goes (to the Trash)', r.error || r);
  step(L().find((e) => e.id === fNew.id)?.undone > 0 && !L().find((e) => e.id === fEdit.id)?.undone, 'only that one is marked undone');

  // ---------- the owner touches a.txt, then undo the AI's edit: a warning first ----------
  await wait(1700);
  await fsx.write(`${dir}/a.txt`, 'ALPHA and my own line');
  r = await AiUndo.undoThis(fEdit.id, { confirm: false });
  step(!r.ok && r.warnings.some((w) => /a\.txt changed after/.test(w)) && await fsx.read(`${dir}/a.txt`) === 'ALPHA and my own line', 'the owner changed the file after: a warning, nothing done yet', r.warnings);
  r = await AiUndo.undoThis(fEdit.id, { force: true });
  step(r.ok && await fsx.read(`${dir}/a.txt`) === 'alpha', 'undo anyway: the file is as before the AI (a copy of the newer one is kept)', await fsx.read(`${dir}/a.txt`));
  const accessLog = await Access.entries(chatId);
  step(accessLog.some((e) => e.action === 'undo'), 'the undo goes through chat access (its log has it)');

  // ---------- the owner edits one of the AI's notes, then "↶ Undo what it did" on reply B ----------
  const note = Board.current().items.find((i) => i.text === 'cut on the snare');
  Board.patch([note.id], { text: 'cut on the snare (mine)' }, 'text');
  await wait(200);
  Native.refresh(agent.id, { keepScroll: true });
  await wait(300);
  btnB()?.click();
  const dlg = await until(() => document.querySelector('dialog.au-ask[open]'), 8000);
  const dtext = dlg?.textContent || '';
  step(Boolean(dlg) && /Undo what this reply did/.test(dtext) && /rev by-claude|Lab|·/.test(dtext) && /Added a note/.test(dtext), 'the reply\'s button asks first, listing what it changed', dtext.slice(0, 260));
  step(/⚠/.test(dtext) && /You changed 1 of the items/.test(dtext), 'it warns that the owner changed one of those notes after', dtext.match(/⚠[^⚠]*/)?.[0]);
  await smoke({ shot: '/tmp/aiundo-confirm.png' });
  dlg?.querySelector('button[type="submit"]')?.click();
  await until(() => L().filter((e) => e.turn === turnB).every((e) => e.undone), 20000);
  await wait(800);
  step(L().filter((e) => e.turn === turnB).every((e) => e.undone), 'every change of that reply is undone', L().filter((e) => e.turn === turnB).map((e) => `${e.what}: ${e.undone ? 'undone' : 'not'}`));
  step(/rev base/.test(D.codeOf(main()).code) && !/rev by-claude/.test(D.codeOf(main()).code), 'the Lab scene is back (through the time machine)', D.codeOf(main()).code.slice(-40));
  const vs = await ThreeHistory.list(sid);
  step(/^Undid /.test(vs.at(-1)?.label || '') && vs.at(-1).by === 'you', 'the time machine has the undo as a version of its own (so it can be undone too)', vs.at(-1)?.label);
  step(Board.current().items.length === boardN0 && !Board.current().items.some((i) => /snare|neon/.test(i.text || '')), 'the board is back (both notes gone)', Board.current().items.length - boardN0);
  step(!L().some((e) => e.area === 'lab' && e.by === agent.id && e.at > Date.now() - 4000 && !e.undone && /Undid/.test(e.what)), 'the undo itself is not recorded as an AI change');
  await wait(300);
  step(btnB()?.classList.contains('au-done') && /undone/.test(btnB()?.textContent || ''), 'the reply now says "↶ undone"', btnB()?.textContent);

  // ---------- the setting, from the Activity panel's part ----------
  await AiUndo.openPart();
  await wait(400);
  const part = document.querySelector('.ac-pop .au-part');
  const rows = [...(part?.querySelectorAll('.au-row') || [])];
  step(part && !part.hidden && rows.length >= 4, 'Activity has "Changes by AIs" with the newest changes', rows.length);
  step(rows.some((n) => n.classList.contains('au-undone')) && /Ran \/nodes-director off/.test(rows[0]?.textContent || ''), 'newest first; undone ones are marked', rows.slice(0, 3).map((n) => n.textContent.slice(0, 70)));
  const sRow = rows.find((n) => /nodes-director/.test(n.textContent));
  sRow?.querySelector('.ac-b')?.click(); // the ↶ of that row: asks first
  const dlg2 = await until(() => document.querySelector('dialog.au-ask[open]'), 6000);
  step(Boolean(dlg2) && /Undo 1 change/.test(dlg2?.textContent || ''), 'a row\'s ↶ asks first too', dlg2?.textContent.slice(0, 100));
  dlg2?.querySelector('button[type="submit"]')?.click();
  await until(() => L().find((e) => e.id === sEntry.id)?.undone, 8000);
  step(H.agent(agent.id).nodesTool === nodesBefore, 'the setting has its old value again', { now: H.agent(agent.id).nodesTool, before: nodesBefore });
  sRow && sRow.isConnected && sRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
  const anyRow = document.querySelector('.ac-pop .au-row:not(.au-undone)') || document.querySelector('.ac-pop .au-row');
  anyRow?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
  await wait(200);
  const menuText = [...document.querySelectorAll('#menu button, #menu .menu-item')].map((b) => b.textContent.trim());
  step(menuText.some((t) => /Show it|Open the chat/.test(t)), 'right-click a row: its menu (undo since, the reply, show it, open the chat)', menuText);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await smoke({ shot: '/tmp/aiundo.png' });

  // ---------- since: everything from the first change on (what's left) ----------
  const first = L().filter((e) => e.by === agent.id).sort((a, b) => a.at - b.at)[0];
  const p = AiUndoCore.plan(L(), AiUndoCore.pickSince(L(), first.id));
  step(p.entries.every((e) => !e.undone) && p.entries.length >= 1, 'undo since: the plan holds only what is not undone yet', p.entries.map((e) => e.what));
  r = await AiUndo.undoSince(first.id, { force: true });
  step(r.ok && L().filter((e) => e.by === agent.id).every((e) => e.undone || e.cant), 'undo everything it did since its first change', r.error || r.done);
  r = await AiUndo.undoReply(turnB, { confirm: false });
  step(!r.ok && /Nothing left/.test(r.error), 'nothing left to undo: said plainly', r.error);

  // ---------- chat ----------
  let said = '';
  await Commands.tryRun('/ai-undo text', agent.id, null, { say: (t) => { said = t; }, note: (t) => { said = t; } });
  step(/Changes by AIs/.test(said) && /undone/.test(said), '/ai-undo text lists the timeline', said.slice(0, 160));
  await wait(700);
  const kv = await window.hub.kvGet('aiundo', null);
  step(Array.isArray(kv?.list) && kv.list.length >= 5, 'the timeline is saved (kv aiundo)', kv?.list?.length);
} catch (err) { step(false, `threw: ${err.message}`, err.stack?.split('\n').slice(0, 3).join(' | ')); }
return JSON.stringify({ ok: !out.problems.length, ...out }, null, 1);
