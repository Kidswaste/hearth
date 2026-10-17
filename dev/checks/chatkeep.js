// The docked director's chat and its Lab scene never vanish (round 52, chatkeep), end to end on throwaway data with the
// fake engines. The owner's report: "a chat disappears in front of my eyes and closes the scene … it deletes the chat
// entirely" while working on a heavy three.js scene with the Three Director. Each way the window can go away is done
// for real here, and after each: the chat is in its file and in the list, it is the director's open chat again, the
// Lab is on screen with the chat's scene, and one calm line says what happened (data/devreport-crashes.json says why).
//   1. the window's page crashes (forcefullyCrashRenderer) a moment after a NEW director chat's first message, while
//      the director edits its scene (the scene not saved yet): the scene comes back under its own id, the chat finds it
//   2. a GPU reset (every WebGL context lost) and the GPU process gone: no reload, the chat stays
//   3. the Lab preview's own process killed: a new preview page, the chat stays
//   4. Ctrl/⌘+Shift+R (the window reloaded on purpose): everything back, the line names the key
//   5. Freshen and 6. an update's reload: everything back
//   7. the director's AI turned off (its chats used to vanish from the list): the chat still shows and opens, and
//      🛟 Recover… lists it ("waiting for its AI") · (round 55) under its own AI's name, never moved to another AI
//   node dev/smoke.js --fake-engines --wait 8000 --check-timeout 240000 --script dev/checks/chatkeep.js --shot /tmp/chatkeep.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const save = () => { localStorage.setItem('ck.steps', JSON.stringify(out.steps)); localStorage.setItem('ck.problems', JSON.stringify(out.problems)); };
try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd();
  await until(() => ThreeLab.scenes && ThreeLab.director);
  await wait(1500);
  const S = ThreeLab.scenes;
  // an older chat with a few messages first (its scene saved), then a NEW chat whose first message is answered by a
  // director that edits the scene: the page crashes 0.15 s later
  Native.newChat(agent.id);
  await until(() => S.get(S.currentId())?.name === 'New chat', 8000);
  await Native.send(agent.id, 'direct: add a tunnel');
  const older = H.activeChat[agent.id];
  await until(() => !Native.isBusy(older), 40000);
  await Native.send(agent.id, 'direct: add rings');
  await until(() => !Native.isBusy(older), 40000);
  step((await window.hub.getChat(older))?.messages?.length >= 4, 'a director chat with a few messages, on disk');
  Native.newChat(agent.id);
  await until(() => S.get(S.currentId())?.name === 'New chat' && !ChatScenes.ownerOf(S.currentId()), 8000);
  await wait(1500); // (the owner types the first message)
  const start = S.layersOf(S.get(S.currentId())).length;
  await Native.send(agent.id, 'Clink: direct: add a tunnel');
  const chatId = H.activeChat[agent.id];
  const sk = S.currentId();
  // the page crashes right after the director's first edit (within the ~1 s a crash may cost: the journal's pause)
  await until(() => S.layersOf(S.get(sk)).length > start, 6000);
  await wait(1100);
  const layers = S.layersOf(S.get(sk)).map((L) => L.name || L.id);
  step(ChatScenes.linkOf(chatId) === sk, 'the new chat owns its scene, the director is editing it', layers);
  localStorage.setItem('ck', JSON.stringify({ chatId, older, sk, agent: agent.id, layers }));
  save();
  await window.hub.safetynet.testCrash();
  await wait(8000);
  out.problems.push('the page did not crash');
} catch (err) { out.problems.push(`error: ${err.message}`); }
return JSON.stringify(out, null, 1);
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: JSON.parse(localStorage.getItem('ck.steps') || '[]'), problems: JSON.parse(localStorage.getItem('ck.problems') || '[]') };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const save = () => { localStorage.setItem('ck.steps', JSON.stringify(out.steps)); localStorage.setItem('ck.problems', JSON.stringify(out.problems)); };
const ck = JSON.parse(localStorage.getItem('ck') || '{}');
const dataDir = async () => String(await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '');
const crashes = async () => { try { return JSON.parse(await window.hub.fs.read(`${await dataDir()}/devreport-crashes.json`)); } catch { return []; } };
// everything back: the Lab on screen, the director's chat open, its scene on screen, the chat in its file and the list
async function back(label, sk = ck.sk) {
  const ok = await until(() => H.activeId === 'tool:three' && H.activeChat[ck.agent] === ck.chatId && typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.currentId() === sk, 30000);
  const disk = await window.hub.getChat(ck.chatId);
  step(Boolean(ok), `${label}: the Lab, the director's chat and its scene are back`, { activeId: H.activeId, chat: H.activeChat[ck.agent] === ck.chatId, scene: ThreeLab?.scenes?.currentId?.() === sk });
  step(Boolean(disk) && H.chats.some((c) => c.id === ck.chatId) && H.chats.some((c) => c.id === ck.older), `${label}: both chats in their files and in the list`, disk?.messages?.length);
  return ok;
}
try {
  // ---------- 1. after the crash ----------
  await back('crash');
  await until(() => typeof Freshen !== 'undefined' && Freshen.cameBack, 15000);
  step(/^Hearth's window crashed \(out of memory\?\) and reloaded — your chat and scene are back$/.test(Freshen.cameBack?.line || ''), 'one calm line', Freshen.cameBack?.line);
  const rep = await until(() => store.get('safetynet.last', null)?.at > Date.now() - 60000 && store.get('safetynet.last', null), 20000);
  step(rep?.title === Freshen.cameBack?.line, 'the card after the crash carries that line as its title', rep?.title);
  const S = ThreeLab.scenes;
  const now = S.get(ck.sk) ? S.layersOf(S.get(ck.sk)).map((L) => L.name || L.id) : null;
  step(Boolean(now) && ck.layers.every((n) => now.includes(n)) && ChatScenes.linkOf(ck.chatId) === ck.sk, 'the scene is back with the director\'s last edit on it (nothing rolled back)', { before: ck.layers, now });
  await until(async () => (await window.hub.kvGet('three-sketches', [])).find((x) => x.id === ck.sk)?.layers?.length >= ck.layers.length, 8000);
  step((await window.hub.kvGet('three-sketches', [])).find((x) => x.id === ck.sk)?.layers?.length >= ck.layers.length, 'and it is saved so');
  const c1 = (await crashes()).filter((c) => c.kind === 'page').at(-1);
  step(c1 && c1.reason && c1.mem && c1.page && c1.page.showing === 'tool:three', 'devreport-crashes.json: the reason, the memory, what the page showed', c1 && { reason: c1.reason, mem: Object.keys(c1.mem || {}), page: c1.page });
  step(!document.querySelector('#toasts .toast.error'), 'no red "Hearth crashed last time" toast on top of the line');
  // the reply that was running: its tool calls were answered when the page went (no minute-long wait), it lands
  await until(async () => (await window.hub.getChat(ck.chatId))?.messages?.some((m) => m.role === 'assistant'), 45000);
  step((await window.hub.getChat(ck.chatId))?.messages?.some((m) => m.role === 'assistant'), 'the reply that was running when the page crashed lands in the chat');

  // ---------- 2. a GPU reset, the GPU process gone: no reload, nothing moves ----------
  const D = ThreeLab.director;
  const lost = await D.evalInSketch('__glRecover.lose({ restore: 600 })').catch(() => null);
  await wait(2500);
  await window.hub.glr?.sim?.({ gone: 'crashed' }).catch(() => null);
  await wait(1500);
  step(H.activeChat[ck.agent] === ck.chatId && S.currentId() === ck.sk && H.chats.some((c) => c.id === ck.chatId), 'GPU reset and the GPU process gone: the chat and the scene stay (no reload)', lost?.ok);
  await window.hub.glr?.sim?.({ status: null }).catch(() => null);

  // ---------- 3. the Lab preview's own process killed ----------
  const killed = await window.hub.crashsafe.test('kill-frame', 'mode=sketch').catch(() => false);
  await wait(6000);
  step(H.activeChat[ck.agent] === ck.chatId && S.currentId() === ck.sk && H.chats.some((c) => c.id === ck.chatId), 'the preview page killed: the chat and the scene stay', killed);

  // ---------- 4. Ctrl/⌘+Shift+R ----------
  save();
  await window.hub.reloadWindow('Ctrl+Shift+R pressed (test)');
  await wait(8000);
  out.problems.push('the window did not reload');
} catch (err) { out.problems.push(`error: ${err.message}`); }
return JSON.stringify(out, null, 1);
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: JSON.parse(localStorage.getItem('ck.steps') || '[]'), problems: JSON.parse(localStorage.getItem('ck.problems') || '[]') };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const save = () => { localStorage.setItem('ck.steps', JSON.stringify(out.steps)); localStorage.setItem('ck.problems', JSON.stringify(out.problems)); };
const ck = JSON.parse(localStorage.getItem('ck') || '{}');
const dataDir = async () => String(await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '');
const crashes = async () => { try { return JSON.parse(await window.hub.fs.read(`${await dataDir()}/devreport-crashes.json`)); } catch { return []; } };
async function back(label) {
  const ok = await until(() => H.activeId === 'tool:three' && H.activeChat[ck.agent] === ck.chatId && typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.currentId() === ck.sk, 30000);
  const disk = await window.hub.getChat(ck.chatId);
  step(Boolean(ok), `${label}: the Lab, the director's chat and its scene are back`, { activeId: H.activeId, chat: H.activeChat[ck.agent] === ck.chatId });
  step(Boolean(disk) && H.chats.some((c) => c.id === ck.chatId), `${label}: the chat in its file and in the list`);
}
try {
  await back('Ctrl+Shift+R');
  await until(() => typeof Freshen !== 'undefined' && Freshen.cameBack, 15000);
  step(/^The window reloaded \(Ctrl\+Shift\+R pressed \(test\)\) — your chat and scene are back$/.test(Freshen.cameBack?.line || ''), 'the line says it was a reload and why', Freshen.cameBack?.line);
  step((await crashes()).some((c) => c.kind === 'reload' && /Ctrl\+Shift\+R/.test(c.what)), 'devreport-crashes.json keeps the reload and who asked');
  const S = ThreeLab.scenes;
  // ---------- 7. the director's AI turned off: its chats used to vanish from the list (and Recover found nothing) ----------
  const a = H.agent(ck.agent);
  a.enabled = false; await saveConfig(); await wait(1200);
  const row = await until(() => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(ck.chatId)}"]`), 8000);
  step(Boolean(row) && row.closest('.group')?.dataset.id === ck.agent && /turned off/.test(row.closest('.group')?.querySelector('.group-name')?.textContent || ''), 'its AI turned off: the chat still shows in the list (under its own AI\'s name, "— turned off")', row?.closest('.group')?.querySelector('.group-name')?.textContent);
  const scan = await window.hub.datasafe.scan({ quick: true });
  const hid = (scan.chats || []).find((c) => c.id === ck.chatId);
  step(hid?.state === 'hidden' && /waiting for its AI/.test(hid.from) && hid.agentId === ck.agent, '🛟 Recover… lists it as a chat waiting for its AI (still its own)', hid?.from);
  H.agent(ck.agent).enabled = true; await saveConfig(); await wait(1200); // (H.config was read again from the file meanwhile)
  activate('tool:three');
  const again = await until(() => H.activeChat[ck.agent] === ck.chatId && ThreeLab.scenes.currentId() === ck.sk, 8000);
  const ch = await window.hub.getChat(ck.chatId);
  step(Boolean(again) && ch?.agentId === ck.agent, 'its AI on again: the chat is its open chat again, still its own, with its scene', { open: H.activeChat[ck.agent] || null, agentId: ch?.agentId, scene: ThreeLab.scenes.currentId(), want: ck.sk });
  // ---------- 5. Freshen ----------
  save();
  setTimeout(() => Freshen.now({ reason: 'test' }), 300); // (a reload from the page itself waits for this check's answer)
} catch (err) { out.problems.push(`error: ${err.message}`); }
return JSON.stringify(out, null, 1);
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: JSON.parse(localStorage.getItem('ck.steps') || '[]'), problems: JSON.parse(localStorage.getItem('ck.problems') || '[]') };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const save = () => { localStorage.setItem('ck.steps', JSON.stringify(out.steps)); localStorage.setItem('ck.problems', JSON.stringify(out.problems)); };
const ck = JSON.parse(localStorage.getItem('ck') || '{}');
try {
  const ok = await until(() => H.activeId === 'tool:three' && H.activeChat[ck.agent] === ck.chatId && ThreeLab.scenes?.currentId() === ck.sk, 30000);
  step(Boolean(ok) && H.chats.some((c) => c.id === ck.chatId), 'Freshen (then the test harness reload): the Lab, the chat and its scene are back', { activeId: H.activeId, open: H.activeChat, scene: ThreeLab.scenes?.currentId?.(), want: ck.sk, cb: Freshen.cameBack, agents: H.agents().map((a) => `${a.id}:${a.enabled}`) });
  // ---------- 6. an update's reload ----------
  save();
  await window.hub.update.reload();
  await wait(8000);
  out.problems.push('the update reload did not happen');
} catch (err) { out.problems.push(`error: ${err.message}`); }
return JSON.stringify(out, null, 1);
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: JSON.parse(localStorage.getItem('ck.steps') || '[]'), problems: JSON.parse(localStorage.getItem('ck.problems') || '[]') };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const ck = JSON.parse(localStorage.getItem('ck') || '{}');
try {
  const ok = await until(() => H.activeId === 'tool:three' && H.activeChat[ck.agent] === ck.chatId && ThreeLab.scenes?.currentId() === ck.sk, 30000);
  step(Boolean(ok) && H.chats.some((c) => c.id === ck.chatId) && H.chats.some((c) => c.id === ck.older), 'an update\'s reload: the Lab, the chat and its scene are back; both chats listed');
  await until(() => typeof Freshen !== 'undefined' && Freshen.cameBack, 15000);
  step(/an update/.test(Freshen.cameBack?.line || ''), 'the line says an update reloaded it', Freshen.cameBack?.line);
  // never deleted: nothing went to Recently deleted along the way
  const trash = await window.hub.listChatTrash();
  step(!trash.some((c) => c.id === ck.chatId || c.id === ck.older), 'no chat went to Recently deleted');
  await smoke({ shot: '/tmp/chatkeep-end.png' });
} catch (err) { out.problems.push(`error: ${err.message}`); }
out.pass = !out.problems.length;
return JSON.stringify(out, null, 1);
