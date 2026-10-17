// A chat never moves to another AI and never disappears, whatever happens to its AI (round 55, chatsafe55). Round 54:
// the Three Director went missing from config.json; its Lab chats then showed under Claude and opening one there moved
// it to Claude for good. On a throwaway copy with the fake engines:
//   two Three Director chats + a Claude chat → the director removed from the (throwaway) config →
//   the chats list: "Three Director — not set up" with both chats and one "Bring back Three Director" button, the Claude
//   chat under Claude, no director chat under Claude · the Lab: a read-only chat panel of the director's chats (not
//   none) · a director chat opened from the list: read-only in the Lab's panel · the old way in (Native.open under
//   Claude) shows nothing there and moves nothing · sending into it from Claude is refused · Continue with Claude…
//   (asked first) makes a copy with Claude, the original stays · Bring back → the director again with the same id, its
//   chats its own, docked in the Lab. After every step: each chat's agent id on disk unchanged, every chat in the list.
//   node dev/smoke.js --fake-engines --wait 6000 --check-timeout 240000 --script dev/checks/chatsafe55.js --shot /tmp/chatsafe55.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
let def = null; let dirId = null;
try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  const dir = await until(() => H.agents().find((a) => a.dock === 'three' && a.mode === 'native'));
  dirId = dir.id; def = JSON.parse(JSON.stringify(dir));
  activate('tool:three');
  await until(() => Native.hasView(dir.id), 30000);
  await wait(1500);
  const ids = [];
  for (const t of ['first lab chat about rings', 'second lab chat about a tunnel']) {
    Native.newChat(dir.id); await wait(600);
    await Native.send(dir.id, t);
    const id = H.activeChat[dir.id]; ids.push(id);
    await until(() => !Native.isBusy(id), 40000);
  }
  const claude = H.claudeAgent();
  Native.newChat(claude.id); await wait(300);
  await Native.send(claude.id, 'a plain claude chat');
  const cid = H.activeChat[claude.id];
  await until(() => !Native.isBusy(cid), 40000);
  const all = [...ids, cid];
  const want = { [ids[0]]: dir.id, [ids[1]]: dir.id, [cid]: claude.id };
  const owners = async () => Object.fromEntries(await Promise.all(all.map(async (id) => [id, (await window.hub.getChat(id))?.agentId || null])));
  const sameOwners = async (label) => { const o = await owners(); step(all.every((id) => o[id] === want[id]), `${label}: every chat's agent id unchanged on disk`, o); };
  const listed = (label) => { Panel.flush?.(); const miss = all.filter((id) => !document.querySelector(`#chat-groups .item[data-key="${CSS.escape(id)}"]`)); step(!miss.length, `${label}: every chat visible in the chats list`, miss); };
  const groupOf = (id) => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(id)}"]`)?.closest('.group');
  await sameOwners('before');

  // ---------- the director removed from the (throwaway) config ----------
  H.config.agents = H.config.agents.filter((a) => a.id !== dir.id);
  await saveConfig();
  await until(() => !H.agent(dir.id), 8000);
  await wait(1200);
  Panel.render();
  const grp = await until(() => document.querySelector(`#chat-groups .group[data-id="${CSS.escape(dir.id)}"]`), 8000);
  const gname = grp?.querySelector('.group-name')?.textContent || '';
  step(gname === 'Three Director — not set up', 'the chats list: the director\'s chats under its own name', gname);
  step(ids.every((id) => groupOf(id) === grp), 'both director chats in that group (none under Claude)', ids.map((id) => groupOf(id)?.dataset.id));
  step(groupOf(cid)?.dataset.id === claude.id, 'the Claude chat stays under Claude');
  const bring = grp?.querySelector('.chatsafe-bring');
  step(bring?.textContent === 'Bring back Three Director', 'one plain button: Bring back Three Director', bring?.textContent);
  listed('director removed');
  await sameOwners('director removed');

  // ---------- the Lab: a read-only chat panel of its chats, not none ----------
  activate('tool:three');
  const s = H.surfaces.get('tool:three');
  const panel = await until(() => s.dock.querySelector('.chatsafe-dock'), 15000);
  step(Boolean(panel) && !s.dock.hidden, 'the Lab still shows its chat panel', { hidden: s.dock.hidden });
  await until(() => s.dock.querySelectorAll('.chatsafe-item').length === 2, 6000);
  step(s.dock.querySelectorAll('.chatsafe-item').length === 2, 'the panel lists both director chats', s.dock.querySelectorAll('.chatsafe-item').length);
  step(Boolean(s.dock.querySelector('.chatsafe-bring')) && !s.dock.querySelector('textarea'), 'read-only (no chat box) with Bring back', s.dock.querySelector('.chatsafe-bring')?.textContent);
  step(/Three Director — not set up/.test(s.dockBtn?.textContent || ''), 'the dock button names it', s.dockBtn?.textContent);

  // ---------- a director chat opened from the chats list ----------
  activate(claude.id);
  await wait(400);
  document.querySelector(`#chat-groups .item[data-key="${CSS.escape(ids[0])}"]`)?.click();
  const shown = await until(() => H.activeId === 'tool:three' && s.dock.querySelector('.chatsafe-item.active')?.dataset.chat === ids[0] && /first lab chat about rings/.test(s.dock.querySelector('.chatsafe-body')?.textContent || ''), 10000);
  step(Boolean(shown), 'opened from the list: shown read-only in the Lab\'s panel', { active: H.activeId, sel: s.dock.querySelector('.chatsafe-item.active')?.dataset.chat });
  await sameOwners('opened from the list');
  listed('opened from the list');

  // ---------- the old way in: opened under Claude (round 52 moved it there for good) ----------
  Native.open(claude.id, ids[1]);
  await wait(2000);
  step(H.activeChat[claude.id] !== ids[1], 'opened under Claude: not shown as a Claude chat', H.activeChat[claude.id]);
  await sameOwners('opened under Claude');
  let refused = ''; try { await Native.send(claude.id, 'go on', { chatId: ids[1] }); } catch (err) { refused = err.message; }
  step(/waits for Three Director/.test(refused), 'sending into it from Claude is refused', refused);
  step((await window.hub.getChat(ids[1]))?.messages?.length === 2, 'nothing was added to it');
  await sameOwners('a send refused');

  // ---------- Continue with Claude… (asked first): a copy, the original stays ----------
  const confirm0 = Modal.confirm; let asked = '';
  Modal.confirm = async (title, text) => { asked = `${title} ${text}`; return true; };
  try { await ChatSafe.continueElsewhere(ids[1]); } finally { Modal.confirm = confirm0; }
  const copy = await until(() => (H.chats || []).find((c) => c.agentId === claude.id && c.id !== cid && /second lab chat/.test(c.title)), 8000);
  step(/stays with Three Director/.test(asked) && Boolean(copy), 'Continue with Claude… asks first, then a copy goes on with Claude', asked.slice(0, 120));
  await sameOwners('continued with Claude');
  listed('continued with Claude');

  // ---------- restore: Bring back Three Director ----------
  Panel.render();
  document.querySelector(`#chat-groups .group[data-id="${CSS.escape(dir.id)}"] .chatsafe-bring`)?.click();
  const back = await until(() => H.agents().find((a) => a.id === dir.id && a.mode === 'native' && a.dock === 'three'), 30000);
  step(Boolean(back), 'Bring back: the Three Director is back with the same id', back?.id);
  await wait(1500);
  activate('tool:three');
  const docked = await until(() => !s.dock.querySelector('.chatsafe-dock') && Native.hasView(dir.id) && s.dockedId === dir.id, 10000);
  step(Boolean(docked), 'docked in the Lab again (its real chat panel)', s.dockedId);
  Panel.render();
  await wait(300);
  const g2 = document.querySelector(`#chat-groups .group[data-id="${CSS.escape(dir.id)}"]`);
  step(g2?.querySelector('.group-name')?.textContent === back?.name && ids.every((id) => groupOf(id) === g2), 'its chats under it again', g2?.querySelector('.group-name')?.textContent);
  Native.open(dir.id, ids[0]);
  await wait(1200);
  step(H.activeChat[dir.id] === ids[0], 'a director chat opens as its own chat again');
  await sameOwners('brought back');
  listed('brought back');
  if (copy) step(Boolean(document.querySelector(`#chat-groups .item[data-key="${CSS.escape(copy.id)}"]`)), 'the copy with Claude is listed too');
} catch (err) { out.problems.push(`error: ${err.message}`); }
// the throwaway config as it was, whatever happened above
try { if (def && !H.agent(dirId)) { H.config.agents.push(def); await saveConfig(); } } catch { /* the copy is thrown away anyway */ }
return JSON.stringify({ pass: !out.problems.length, ...out }, null, 1);
