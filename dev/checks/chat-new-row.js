// A chat made with ＋ shows in the chats list at once ("New chat", highlighted), before its first message; it becomes
// the real chat (its title) when that message is sent, and goes away if another chat is opened before. Also for a
// docked director chat (its scene is the new orb).
//   node dev/smoke.js --fake-engines --script dev/checks/chat-new-row.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out123 = {}; const problems = []; const ok = (c, what) => { if (!c) problems.push(what); };
const group = (id) => document.querySelector(`#chat-groups .group[data-id="${id}"]`);
const draftRow = (id) => group(id)?.querySelector('.item[data-key="__draft"]');
// (round 123, checksweep123) since round 116 every chat belongs to one project and the chats list shows the open
// project's chats only (a new chat's row shows in it): the owner works in an open project, so does this check
if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
await Projects.ready(); { const t0 = Date.now(); while (!ProjChats._ok() && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100)); }
const P123 = Projects.create({ name: 'New row check' }); ProjChats.setScope(P123.id);
const c = H.claudeAgent();
activate(c.id); await wait(800);
group(c.id).querySelector('.group-add').click(); await wait(400);
ok(draftRow(c.id) && draftRow(c.id).classList.contains('active') && /New chat/.test(draftRow(c.id).textContent), 'Claude: ＋ shows a highlighted "New chat" row at once');
ok(!group(c.id).querySelector('.none'), 'no "No chats yet" under the new row');
await Native.send(c.id, 'first words here'); await until(() => !Native.isBusy(H.activeChat[c.id]), 20000); await wait(400);
ok(!draftRow(c.id), 'the first message turns it into the real chat');
// (round 123, checksweep123) the real chat joins the open project a moment after it is saved (projchats.js place(),
// 1.2 s after it shows in the list): its row comes then, highlighted
const realAt = performance.now();
await until(() => [...group(c.id).querySelectorAll('.item.active')].some((r) => /first words/.test(r.textContent)), 5000);
out123.realRowMs = Math.round(performance.now() - realAt);
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
return JSON.stringify({ problems, ...out123 }, null, 1);
