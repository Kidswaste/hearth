// (round 114, directorswitch) The Three Director's AI switcher ("◆ Claude ▾" at the left of the dock's strip), by real
// clicks and keys, with the fake engines (fake Claude and fake Codex = Astra) and their `seenLog` (exactly what reached
// each engine, data/kv/fake-seen.json). On the scene the Lab opens with, in the check's own data folder; no owner data.
//   1. Claude → Astra, Fresh chat: a new Astra chat of the director, linked to the same scene, its Lab calls routed
//      there; nothing is sent by the switch; its first message carries no brief
//   2. back to Claude: the Claude chat as it was (every message), the Astra chat kept
//   3. marks: an Astra reply running while the Claude chat is open → the pill's dot "working", then "new reply" (the
//      menu row says it too); opening it clears it
//   4. Continue this conversation: a new Astra chat with the hand-over brief (handoff.js); nothing sent on the click; the
//      brief rides in the first message only (not the second)
//   5. Alt+Shift+A cycles the AI; the keys sheet line and Ctrl/⌘+K "Director: switch AI"
//   6. the target AI signed out / not installed: EngineHealth.signIn (round 111) is called (stubbed here: no terminal),
//      its outcome is said in the chat, the director stays where it was
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/directorswitch.js
const { step, wait, until, click, key, out } = J;
const sw = (o) => window.hub.kvSet('fake-switches', o);
const seenAll = async () => (await window.hub.kvGet('fake-seen', [])) || [];
const seen = async (re) => (await seenAll()).filter((r) => re.test(r.prompt)).at(-1) || null;
const info = {};
out.info = info;

await Commands.tryRun('/director-setup', H.claudeAgent().id, null, { say: () => {}, note: () => {} });
await until(() => H.agents().some((a) => a.dock === 'three'));
const a = H.agents().find((x) => x.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await Lazy.load('directordock'); await Lazy.load('enginehealth').catch(() => {});
await until(() => document.querySelector('.tool-dock .dd-ai'), 20000);
await ChatScenes.ready();
const pill = () => document.querySelector('.tool-dock .dd-ai');
const pillName = () => pill()?.querySelector('.dd-ai-name')?.textContent || '';
const dot = () => pill()?.querySelector('.dd-ai-dot')?.className || '';
const menuRows = () => [...document.querySelectorAll('#menu button')];
const row = (re) => menuRows().find((b) => re.test(b.firstChild?.textContent || b.textContent));
async function menuPick(re) {
  await click(pill()); await until(() => row(re), 4000);
  const r = row(re);
  if (!r) { step(`menu row ${re}`, false, menuRows().map((b) => b.textContent)); document.body.click(); return null; }
  const text = r.textContent;
  await click(r); await wait(300);
  return text;
}
const idle = (id) => until(() => !Native.isBusy(id), 60000);
const links = () => ChatScenes.data().links;
step('the switcher is in the dock: "◆ Claude ▾"', /Claude/.test(pill()?.textContent || '') && J.hitOk(pill()), pill()?.textContent);
// (what this computer's engine check says, for the record: the flows below stub it to "signed in")
info.health = { claude: await DirectorSwitch.health('claude'), codex: await DirectorSwitch.health('codex') };
const realReport = EngineHealth.report; const realSignIn = EngineHealth.signIn;
let healthNow = { claude: { found: true, signedIn: true }, codex: { found: true, signedIn: true } };
EngineHealth.report = () => healthNow;

await sw({ seenLog: 'on' });
await window.hub.kvSet('fake-seen', []);

// ---------- a Claude chat about the scene ----------
await Native.send(a.id, 'switch-claude-one: make the ring glow');
const claudeId = H.activeChat[a.id];
await idle(claudeId); await wait(300);
const scene = ChatScenes.linkOf(claudeId);
step('a Claude director chat linked to the scene on screen', Boolean(scene) && scene === ThreeLab.scenes.currentId(), { scene });
const claudeMsgs = Native.current(a.id).messages.length;

// ---------- 1. Claude → Astra, Fresh chat ----------
const before1 = (await seenAll()).length;
const picked1 = await menuPick(/Fresh chat with Astra/);
await until(() => H.activeChat[a.id] !== claudeId, 8000);
const astraId = H.activeChat[a.id];
const astra = Native.current(a.id);
step('Fresh chat with Astra: a new chat of the director, on Astra', astraId !== claudeId && astra?.engine === 'codex' && astra.agentId === a.id, { picked1, engine: astra?.engine });
step('… linked to the same scene (a guest: the Claude chat keeps its scene)', links()[astraId]?.sketch === scene && ChatScenes.ownerOf(scene) === claudeId, links()[astraId]);
step('… its draft starts with the scene\'s line, nothing is sent by the switch', /^\[Lab scene "/.test(Native.view(a.id).input.value) && (await seenAll()).length === before1, Native.view(a.id).input.value.slice(0, 80));
step('… the pill says Astra', pillName() === 'Astra', pill()?.textContent);
Native.view(a.id).input.value = '';
await Native.send(a.id, `switch-astra-one\nmcp: ${JSON.stringify([['three_do', { cmd: 'layers' }]])}`);
await idle(astraId); await wait(400);
const r1 = await seen(/switch-astra-one/);
step('… its first message goes to Astra (Codex), with no brief', r1?.engine === 'codex' && !/<handoff_brief>/.test(r1.prompt), { engine: r1?.engine, chars: r1?.prompt.length });
const route = ChatScenes.routeThree('three_layers', astraId);
const astraReply = Native.current(a.id).messages.at(-1);
step('… its Lab calls reach this scene', route?.sketchId === scene && (astraReply?.tools || []).length > 0, { route, tools: astraReply?.tools });

// ---------- 2. back to Claude ----------
const picked2 = await menuPick(/^✳ Claude/);
await until(() => H.activeChat[a.id] === claudeId, 8000);
step('one click on Claude: back in its chat, as it was', H.activeChat[a.id] === claudeId && Native.current(a.id).messages.length === claudeMsgs && pillName() === 'Claude', { picked2, n: Native.current(a.id).messages.length });
step('… the Astra chat is kept, on Astra', (await Native.load(astraId))?.engine === 'codex' && (await Native.load(astraId)).messages.length >= 2);
step('… the scene on screen is still this one', ThreeLab.scenes.currentId() === scene);

// ---------- 3. busy and unread marks ----------
Native.send(a.id, 'switch-astra-two slow: a longer answer', { chatId: astraId }).catch((err) => step('background send', false, err.message));
await until(() => Native.isBusy(astraId), 5000); await wait(200);
step('Astra working in the background: the pill\'s dot says so', /busy/.test(dot()) && /working/.test(pill().title), { dot: dot(), title: pill().title });
await idle(astraId); await wait(500);
step('… its reply finished: a "new reply" dot', /unread/.test(dot()) && H.unreadChats.has(astraId), { dot: dot() });
await click(pill()); await until(() => row(/^✧ Astra/), 4000);
step('… the menu row says "new reply"', /new reply/.test(row(/^✧ Astra/)?.textContent || ''), row(/^✧ Astra/)?.textContent);
await click(row(/^✧ Astra/)); await wait(500);
step('… one click opens that chat; the dot clears', H.activeChat[a.id] === astraId && !/unread/.test(dot()), { dot: dot() });
await menuPick(/^✳ Claude/);
await until(() => H.activeChat[a.id] === claudeId, 8000);

// ---------- 4. Continue this conversation ----------
const before4 = (await seenAll()).length;
await menuPick(/Continue this conversation with Astra/);
await until(() => H.activeChat[a.id] !== claudeId && Native.current(a.id)?.handoff, 15000); await wait(400);
const contId = H.activeChat[a.id];
const cont = Native.current(a.id);
step('Continue this conversation: a new Astra chat with the hand-over brief (handoff.js)', contId !== astraId && cont.engine === 'codex' && Boolean(cont.handoff?.brief) && cont.messages[0]?.handoffBrief === true, { title: cont.title });
step('… same scene, nothing sent on the click', links()[contId]?.sketch === scene && (await seenAll()).length === before4);
step('… the line "Handed to Astra with a short brief"', [...Native.view(a.id).list.querySelectorAll('.msg.note[data-note-id="handoff"]')].some((n) => /Handed to Astra/.test(n.textContent)));
Native.view(a.id).input.value = '';
await Native.send(a.id, 'switch-continue-one: carry on');
await idle(contId); await wait(400);
const c1 = await seen(/switch-continue-one/);
step('… the brief goes with the first message (the Claude chat\'s words in it)', c1?.engine === 'codex' && /<handoff_brief>/.test(c1.prompt) && /switch-claude-one/.test(c1.prompt), { chars: c1?.prompt.length });
await Native.send(a.id, 'switch-continue-two: and then');
await idle(contId); await wait(400);
const c2 = await seen(/switch-continue-two/);
const briefs = (await seenAll()).filter((r) => /<handoff_brief>/.test(r.prompt)).length;
step('… and only once (not with the second message)', Boolean(c2) && !/<handoff_brief>/.test(c2.prompt) && briefs === 1, { briefs });

// ---------- 5. the key, the keys sheet, Ctrl/⌘+K ----------
await key('a', { alt: true, shift: true });
await until(() => engineNow() === 'claude', 6000);
function engineNow() { return DirectorSwitch.engineOf(a, H.activeChat[a.id]); }
step('Alt+Shift+A: to Claude (its latest chat about this scene)', H.activeChat[a.id] === claudeId, { at: H.activeChat[a.id] });
await key('a', { alt: true, shift: true });
await until(() => engineNow() === 'codex', 6000);
step('Alt+Shift+A again: to Astra\'s latest chat', engineNow() === 'codex' && [astraId, contId].includes(H.activeChat[a.id]));
step('the keys sheet: Director dock · Alt+Shift+A · "Director: switch AI"', Keys.all().some((k) => k.keys === 'Alt+Shift+A' && /Director: switch AI/.test(k.what)));
const act = AppUI.actions().find((x) => x.label === 'Director: switch AI');
act?.run(); await until(() => row(/^✳ Claude/) && row(/^✧ Astra/), 4000);
step('Ctrl/⌘+K: "Director: switch AI" opens the switcher', Boolean(act) && Boolean(row(/^✳ Claude/)), menuRows().map((b) => b.textContent).slice(0, 6));
await key('Escape'); await wait(200);
step('the ✦ menu: Switch AI…', (DirectorDock.menu('three') || []).some((x) => x?.label === 'Switch AI…'));
await menuPick(/^✳ Claude/);
await until(() => H.activeChat[a.id] === claudeId, 8000);

// ---------- 6. signed out / not installed ----------
const calls = [];
EngineHealth.signIn = async (engine, opts) => { calls.push({ engine, agentId: opts?.agentId }); return { ok: true, how: 'window', window: 'test', text: 'A test window opened to sign in to Codex (it may be behind Hearth). Finish there: Hearth notices by itself.' }; };
healthNow = { claude: { found: true, signedIn: true }, codex: { found: true, signedIn: false } };
const nChats = H.chats.length;
await click(pill()); await until(() => row(/^✧ Astra/), 4000);
step('signed out: the Astra row says so', /signed out/.test(row(/^✧ Astra/)?.textContent || ''), row(/^✧ Astra/)?.textContent);
await click(row(/^✧ Astra/)); await wait(600);
const note = () => [...Native.view(a.id).list.querySelectorAll('.msg.note[data-note-id="directorswitch"]')].at(-1)?.textContent || '';
step('… round 111\'s sign-in is called for Codex, its outcome said in the chat', calls.length === 1 && calls[0].engine === 'codex' && /isn't signed in/.test(note()) && /test window opened/.test(note()), { calls, note: note().slice(0, 200) });
step('… the director stays with Claude, no chat made', H.activeChat[a.id] === claudeId && H.chats.length === nChats && pillName() === 'Claude');
EngineHealth.signIn = async (engine) => { calls.push({ engine }); return { ok: false, how: 'notFound', text: 'Hearth couldn\'t find Codex on this computer. Install it first (the Install button, or Ctrl+K → doctor), then sign in.' }; };
healthNow = { claude: { found: true, signedIn: true }, codex: { found: false } };
await key('a', { alt: true, shift: true }); await wait(600);
step('not installed (by the key): the sign-in path\'s "Install it first", said in the chat', calls.length === 2 && /isn't installed/.test(note()) && /Install it first/.test(note()) && H.activeChat[a.id] === claudeId, note().slice(0, 200));
EngineHealth.report = realReport; EngineHealth.signIn = realSignIn;
info.stats = DirectorSwitch.stats;
await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/directorswitch.png` });
await sw({});
await window.hub.kvSet('fake-seen', []);
return J.done();
