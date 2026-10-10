// A chat made with ＋ shows in the chats list at once ("New chat", highlighted), before its first message; it becomes
// the real chat (its title) when that message is sent, and goes away if another chat is opened before. Also for a
// docked director chat (its scene is the new orb).
//   node dev/smoke.js --fake-engines --script dev/checks/chat-new-row.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); };
const group = (id) => document.querySelector(`#chat-groups .group[data-id="${id}"]`);
const draftRow = (id) => group(id)?.querySelector('.item[data-key="__draft"]');
const c = H.claudeAgent();
activate(c.id); await wait(800);
group(c.id).querySelector('.group-add').click(); await wait(400);
ok(draftRow(c.id) && draftRow(c.id).classList.contains('active') && /New chat/.test(draftRow(c.id).textContent), 'Claude: ＋ shows a highlighted "New chat" row at once');
ok(!group(c.id).querySelector('.none'), 'no "No chats yet" under the new row');
await Native.send(c.id, 'first words here'); await until(() => !Native.isBusy(H.activeChat[c.id]), 20000); await wait(400);
ok(!draftRow(c.id), 'the first message turns it into the real chat');
ok([...group(c.id).querySelectorAll('.item.active')].some((r) => /first words/.test(r.textContent)), 'the real chat is the highlighted row');
group(c.id).querySelector('.group-add').click(); await wait(300);
ok(draftRow(c.id), 'a second ＋ shows a new row again');
Native.open(c.id, H.chats.find((x) => x.agentId === c.id).id); await wait(300);
ok(!draftRow(c.id), 'opening another chat drops the unsent one (nothing empty is saved)');
ok(H.chats.filter((x) => x.agentId === c.id).length === 1, 'no empty chat was saved');
// a docked Three Director chat
await Commands.tryRun('/director-setup', c.id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const D = H.agents().find((a) => a.dock === 'three');
activate('tool:three'); await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes, 20000); await wait(800);
Native.newChat(D.id); await wait(500);
ok(draftRow(D.id), 'a new director chat shows in the list at once too');
return JSON.stringify({ problems }, null, 1);
