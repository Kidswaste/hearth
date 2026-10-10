// Makes (round 11): plan "a three.js animation that cuts into a video" → a Lab room (Three Director) and a Video room
// (Video Director) appear at once with the same name, mark and color, grouped under the make in the chats list, before
// any message; both open and say what they will hold ("waiting for Lab"); the Lab room has its own scene named after
// it; running it (a fake director turn) moves its status and its first message carries the one-line make context; a
// screenshot made in the room carries the make's name and becomes its output; hand off opens the Video room with the
// work; rename cascades to both rooms and the scene; the progress API stores and tells; a /dispatch and an /intro
// become makes too; dismiss sends the rooms to the trash and restore brings them back; the Makes list on the Commands
// page; then a reload: everything is read back (names, marks, statuses, grouping).
//   node dev/smoke.js --fake-engines --script dev/checks/makes.js --wait 6000 --check-timeout 900000 --shot /tmp/hearth-makes/end.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const say = async (text, id = H.claudeAgent().id, source) => { let msg = ''; await Commands.tryRun(text, id, null, { source, say: (t) => { msg = String(t); }, note: (t) => { msg = String(t); }, error: (t) => { msg = `Error: ${t}`; } }); return msg; };
const SHOTS = '/tmp/hearth-makes';
const errs = []; addEventListener('error', (e) => errs.push(e.message));
const summary = (id) => H.chats.find((c) => c.id === id);
const group = (makeId) => document.querySelector(`#chat-groups .mk-group[data-make="${makeId}"]`);

// ---- 1. plan: two rooms at once, grouped, same name / mark / color, nothing sent ----
const heard = [];
Makes.onChange((d) => heard.push(d.why));
const before = H.chats.length;
const msg = await say('/makes plan a three.js animation that cuts into a video');
const make = Makes.live()[0];
step(make && make.parts.length === 2 && make.parts[0].kind === 'lab' && make.parts[1].kind === 'video', 'plan → a Lab part then a Video part', make && make.parts.map((p) => p.kind));
const [lab, vid] = make.parts;
step(lab.chatId && vid.chatId && H.chats.length === before + 2, 'both rooms are real chats right away', [summary(lab.chatId)?.title, summary(vid.chatId)?.title]);
step(summary(lab.chatId)?.title === `${make.name} · Lab` && summary(vid.chatId)?.title === `${make.name} · Video`, 'named "<Name> · Lab" / "<Name> · Video"', msg.slice(0, 160));
const la = H.agent(summary(lab.chatId).agentId); const va = H.agent(summary(vid.chatId).agentId);
step(la?.dock === 'three' && va?.dock === 'ae', 'the Lab room is a Three Director chat, the Video room a Video Director chat', [la?.name, va?.name]);
const idL = ChatScenes.identity(lab.chatId); const idV = ChatScenes.identity(vid.chatId);
step(idL.color === make.ident.color && idV.color === make.ident.color && idL.glyph === make.ident.glyph && idV.glyph === make.ident.glyph, 'same mark and color on both rooms (the make\'s)', [make.ident.glyph, make.ident.color]);
const lc = await Native.load(lab.chatId); const vc = await Native.load(vid.chatId);
step(lc.messages.length === 0 && vc.messages.length === 0, 'nothing was sent in them');
await until(() => group(make.id)?.querySelectorAll('.item.mk-room').length === 2, 5000);
const g = group(make.id);
step(g && g.querySelectorAll('.item.mk-room').length === 2 && g.querySelector('.mk-mark')?.textContent === make.ident.glyph && g.querySelector('.group-name')?.textContent === make.name, 'one group in the chats list, with the make\'s mark and name, holding both rooms');
step(![...document.querySelectorAll(`#chat-groups .group:not(.mk-group) .item`)].some((r) => r.dataset.key === lab.chatId || r.dataset.key === vid.chatId), 'the rooms aren\'t repeated under their agents');
step([...g.querySelectorAll('.mk-tag')].every((t) => /planned/.test(t.textContent)), 'both rows say "planned"');
step(heard.includes('plan'), 'Makes.onChange heard the plan');
await smoke({ shot: `${SHOTS}/1-planned.png` });

// ---- 2. navigate ahead of time: the Video room, then the Lab room ----
g.querySelector(`.item[data-key="${vid.chatId}"]`).click();
await until(() => H.activeChat[va.id] === vid.chatId && Native.view(va.id)?.list.querySelector('.mk-room-card'), 15000);
const vcard = Native.view(va.id)?.list.querySelector('.mk-room-card');
step(vcard && /waiting for Lab/.test(vcard.textContent) && /will hold/.test(vcard.textContent), 'the Video room opens before anything is made: "planned · waiting for Lab", what it will hold', vcard?.textContent.slice(0, 160));
await wait(600);
await smoke({ shot: `${SHOTS}/2-video-room.png` });
group(make.id).querySelector(`.item[data-key="${lab.chatId}"]`).click();
await until(() => H.activeChat[la.id] === lab.chatId && ThreeLab.scenes && ChatScenes.linkOf(lab.chatId), 30000);
await until(() => ThreeLab.scenes.currentId() === ChatScenes.linkOf(lab.chatId), 15000);
const sk = ThreeLab.scenes.get(ChatScenes.linkOf(lab.chatId));
step(sk && sk.name === `${make.name} · Lab`, 'the Lab room has its own scene, named after the room', sk?.name);
step(ThreeLab.scenes.currentId() === sk?.id, 'opening the Lab room shows its scene');
await until(() => /ready to start/.test(Native.view(la.id)?.list.querySelector('.mk-room-card')?.textContent || ''), 8000);
const lcard = Native.view(la.id)?.list.querySelector('.mk-room-card');
step(lcard && /ready to start/.test(lcard.textContent), 'the Lab room says it can start', lcard?.textContent.slice(0, 120));
await wait(1500);
await smoke({ shot: `${SHOTS}/3-lab-room.png` });

// ---- 3. run it: the Lab room's first message carries the make (one line), the status moves ----
await Native.send(la.id, 'direct: add a tunnel', { chatId: lab.chatId });
step(Makes.get(make.id).parts[0].status === 'working', 'sending in the room: working');
await until(() => !Native.isBusy(lab.chatId), 120000);
const sent = (await Native.load(lab.chatId)).messages.find((m) => m.role === 'user');
step(/^\[Make “/.test(sent?.sent || '') && (sent.sent.split('\n')[0].length / 4) < 60, 'its first message carried one short make line', (sent?.sent || '').split('\n')[0]);
step(Makes.get(make.id).parts[0].status === 'ready', 'after the reply: ready', Makes.get(make.id).parts[0].status);
await Native.send(la.id, 'thanks, now brighter', { chatId: lab.chatId }); await until(() => !Native.isBusy(lab.chatId), 60000);
const sent2 = (await Native.load(lab.chatId)).messages.filter((m) => m.role === 'user')[1];
step(!/\[Make/.test(sent2?.sent || ''), 'later messages carry nothing (token frugality)');

// ---- 4. outputs carry the name ----
const shot = await Capture.shot({ target: 'window', quiet: true });
const fileName = String(shot?.path || '').split(/[\\/]/).pop();
step(fileName.startsWith(`${make.name} · Lab`), 'a screenshot made in the room carries the make\'s name', fileName);
await until(() => Makes.get(make.id).outputs.some((o) => o.path === shot.path), 5000);
step(Makes.get(make.id).outputs.some((o) => o.path === shot.path), 'and is the make\'s output');

// ---- 5. hand off: the Video room opens with the work ----
await Makes.handoff(Makes.get(make.id), Makes.get(make.id).parts[0]);
await until(() => H.activeChat[va.id] === vid.chatId && /From “/.test(Native.view(va.id)?.input.value || ''), 10000);
step(/From “.* · Lab”/.test(Native.view(va.id)?.input.value || ''), 'hand off opens the Video room with what the Lab room made (in the box, not sent)', (Native.view(va.id)?.input.value || '').slice(0, 100));
step(Makes.get(make.id).parts[0].status === 'done', 'the Lab part is done');
Native.view(va.id).input.value = '';

// ---- 6. rename: every room follows, and the scene ----
Makes.rename(Makes.get(make.id), 'Neon Check');
await until(() => summary(lab.chatId)?.title === 'Neon Check · Lab' && summary(vid.chatId)?.title === 'Neon Check · Video', 5000);
step(summary(lab.chatId)?.title === 'Neon Check · Lab' && summary(vid.chatId)?.title === 'Neon Check · Video', 'renaming the make renames every room');
await until(() => ThreeLab.scenes.get(sk.id)?.name === 'Neon Check · Lab', 5000);
step(ThreeLab.scenes.get(sk.id)?.name === 'Neon Check · Lab', 'and the Lab room\'s scene', ThreeLab.scenes.get(sk.id)?.name);

// ---- 7. the progress API ----
const got = [];
const off = Makes.onChange((d) => { if (d.why === 'progress') got.push(d); });
Makes.progress(make.id, vid.id, { pct: 40, label: 'cutting', eta: 12 });
off();
const vp = Makes.get(make.id).parts[1].progress;
step(vp?.pct === 40 && vp.label === 'cutting' && vp.eta === 12 && got[0]?.partId === vid.id && got[0].progress.pct === 40, 'Makes.progress stores { pct, label, eta } and tells onChange', got[0]?.progress);
await wait(100);
if (typeof Progress !== 'undefined') {
  await until(() => document.querySelector(`#chat-groups [data-make-part="${vid.id}"] .pg-bar, #chat-groups [data-make="${make.id}"] .pg-bar`), 5000);
  step(Progress.get(`make:${make.id}:${vid.id}`)?.pct === 40 && Boolean(document.querySelector(`[data-make="${make.id}"] .pg-bar, [data-make="${make.id}"] [data-make-part="${vid.id}"] .pg-bar`)), 'it is a Progress item (make:<id>:<part>) with a bar on the make in the chats list');
}
step(/\d+ %/.test(group(make.id)?.querySelector('.mk-st')?.textContent || ''), 'the group shows the make\'s progress', group(make.id)?.querySelector('.mk-st')?.textContent);

// ---- 8. /dispatch becomes a make ----
const D = H.agents().find((a) => a.dock === 'three');
Native.newChat(D.id); await wait(300);
const host = Native.ensureChat(D.id, 'Ocean comp'); Native.save(host);
await Commands.tryRun('/dispatch red pulse | astra: blue rings', D.id);
await until(() => Makes.live().some((m) => m.cat === 'comp'), 30000);
const cm = Makes.live().find((m) => m.cat === 'comp');
const parts = cm?.parts || [];
step(cm && cm.name === 'Ocean comp' && parts.length === 2 && parts.every((p) => p.chatId), 'a /dispatch is a make named after its main chat, its parts are rooms', cm && [cm.name, parts.map((p) => summary(p.chatId)?.title)]);
step(parts.every((p) => summary(p.chatId)?.title.startsWith('Ocean comp · Lab ')) && parts.every((p) => ChatScenes.identity(p.chatId).glyph === cm.ident.glyph), 'its parts share its name and mark', parts.map((p) => summary(p.chatId)?.title));
await until(() => group(cm.id), 5000);
step(Boolean(group(cm.id)), 'grouped in the chats list too');
await until(() => Makes.get(cm.id).parts.every((p) => ['done', 'ready'].includes(p.status)), 240000);
step(Makes.get(cm.id).parts.every((p) => ['done', 'ready'].includes(p.status)), 'its parts\' states follow the comp card', Makes.get(cm.id).parts.map((p) => p.status));

// ---- 9. /intro becomes a make; renaming the make renames the project ----
await say('/intro a 15 s teaser for the board', H.claudeAgent().id);
await until(() => Makes.live().some((m) => m.cat === 'intro'), 15000);
const im = Makes.live().find((m) => m.cat === 'intro');
const proj = im && Intro.get(im.src.id);
step(im && proj && im.name === proj.name && im.parts.length >= 6 && im.by?.cmd === '/intro', 'an /intro video project is a make (its steps are the parts, made by /intro)', im && [im.name, im.parts.map((p) => p.label).join(' → '), im.by]);
Makes.rename(im, 'Board Teaser');
step(Intro.get(im.src.id)?.name === 'Board Teaser', 'renaming that make renames the project');

// ---- 9b. a director plans a make through its tool (three_do make, the real MCP server) ----
const nBefore = Makes.live().length;
const hostId = H.activeChat[D.id];
await Native.send(D.id, 'make: plan a shader loop then a reel', { chatId: host.id });
await until(() => !Native.isBusy(host.id), 120000);
const am = Makes.live().find((m) => m.by?.agent);
step(Makes.live().length === nBefore + 1 && am && am.parts.map((p) => p.kind).join() === 'lab,video' && am.parts.every((p) => summary(p.chatId)), 'the director planned a make with three_do make: both rooms made', am && am.parts.map((p) => summary(p.chatId)?.title));
step(am && am.from === host.id, 'it knows the chat it came from (and didn\'t open over it)', [am?.from === host.id, H.activeChat[D.id] === hostId]);

// ---- 10. the creators audit: every command Makes routes exists; what made a make is on it ----
const missing = Object.keys(Makes.core.CREATORS).filter((n) => !Commands.get(n));
step(!missing.length, 'every creator command in the audit exists in the registry', missing);
step(Makes.get(make.id).by?.cmd === '/makes', 'a make knows the command that made it', Makes.get(make.id).by);

// ---- 11. dismiss and restore ----
const pm = Makes.get(make.id);
await Makes.dismiss(pm, { quiet: true });
step(!summary(lab.chatId) && !summary(vid.chatId) && !group(make.id), 'dismissing the make sends its rooms to the trash, the group goes');
await Makes.restore(pm);
await until(() => summary(lab.chatId) && summary(vid.chatId), 5000);
await until(() => group(make.id), 3000);
step(summary(lab.chatId) && summary(vid.chatId) && group(make.id), 'restore brings both rooms and the group back');

// ---- 12. one place: the Makes list on the Commands page, right-click ----
await Makes.show(make.id);
await until(() => document.querySelector('.cp-right .mk-detail'), 5000);
const det = document.querySelector('.cp-right .mk-detail');
step(det && det.querySelectorAll('.mk-part').length === 2 && det.textContent.includes('Neon Check'), 'the Makes list shows the make: its rooms, outputs, status');
const rows = document.querySelectorAll('.cp-list .mk-row');
step(rows.length >= 3, 'the Commands page lists every make', rows.length);
await wait(400);
await smoke({ shot: `${SHOTS}/4-makes-page.png` });
[...rows].find((r) => r.dataset.ext === `make:${make.id}`).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 200 }));
await wait(200);
const menuText = document.getElementById('menu')?.textContent || '';
step(/Rename the make/.test(menuText) && /Dismiss/.test(menuText) && /Rooms|Open/.test(menuText), 'right-click a make: rooms, rename, dismiss…', menuText.slice(0, 120));
hideMenu();
const cmd = await say('/makes', H.claudeAgent().id, 'code');
step(/Neon Check/.test(cmd) && /Ocean comp/.test(cmd), '/makes lists them', cmd.split('\n').slice(0, 3));
step(Commands.duplicates().length === 0, 'no duplicate command names', Commands.duplicates());
step(!errs.length, 'no page errors', errs.slice(0, 3));
localStorage.setItem('makes.check', JSON.stringify({ id: make.id, lab: lab.chatId, vid: vid.chatId, glyph: make.ident.glyph, color: make.ident.color, comp: cm?.id, intro: im?.id }));
return JSON.stringify(out, null, 1);
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const was = JSON.parse(localStorage.getItem('makes.check') || '{}');
await until(() => Makes.get(was.id), 10000);
const m = Makes.get(was.id);
step(m && m.name === 'Neon Check' && m.ident.glyph === was.glyph && m.ident.color === was.color, 'after a reload: the make, its name, mark and color', m && [m.name, m.ident.glyph]);
step(m && m.parts[0].status === 'done' && m.parts[1].progress?.pct === 40, 'its parts\' states and progress', m && m.parts.map((p) => [p.status, p.progress?.pct]));
step(m && m.outputs.length >= 1, 'its outputs');
step(Makes.get(was.comp) && Makes.get(was.intro), 'the comp and the video project are still makes');
await until(() => document.querySelector(`#chat-groups .mk-group[data-make="${was.id}"] .item.mk-room`), 10000);
const g = document.querySelector(`#chat-groups .mk-group[data-make="${was.id}"]`);
step(g && g.querySelectorAll('.item.mk-room').length === 2, 'the rooms are grouped again under the make');
step(ChatScenes.identity(was.vid).glyph === was.glyph, 'the rooms keep the make\'s mark');
g.querySelector(`.item[data-key="${was.vid}"]`).click();
const va = H.agent(H.chats.find((c) => c.id === was.vid).agentId);
await until(() => H.activeChat[va.id] === was.vid && Native.view(va.id)?.list.querySelector('.mk-room-card'), 15000);
step(Boolean(Native.view(va.id)?.list.querySelector('.mk-room-card')), 'and still open on the room card');
await wait(800);
await smoke({ shot: '/tmp/hearth-makes/5-after-reload.png' });
return JSON.stringify(out, null, 1);
