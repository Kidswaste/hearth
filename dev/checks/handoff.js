// Lean handoffs (round 42, handoff): when work moves to the other AI, what reaches it is a short brief (goal,
// decisions, files, where we are, the open question, the last exchange word for word), not the whole chat; the owner
// sees one line ("Handed to Astra with a short brief (≈ 2k tokens instead of ≈ 38k) · Send the whole chat instead")
// and that button really sends the whole chat. The fake engines log exactly what they were sent (the `seenLog` switch,
// data/kv/fake-seen.json), on a ≈ 38k-token chat of 15 exchanges:
//   1. switch AI mid-chat: "Continue with Astra" (chat menu / chats list), then /handoff
//   2. offline: Claude busy → "Ask Astra instead"
//   3. second opinion (👁 / Ctrl+Alt+O)
//   4. "Send the whole chat instead" overrides (the next message / the opinion asked again carries everything)
// The sizes measured are returned in `sizes` (tokens ≈ characters / 4), so the check also measures an older app.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/handoff.js
const { step, wait, until, click, out } = J;
const sw = (o) => window.hub.kvSet('fake-switches', o);
const claude = H.claudeAgent();
const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const tok = (s) => Math.ceil(String(s || '').length / 4);
const chatOf = (id) => Native.chatOf(id);
const idle = (id) => until(() => H.activeChat[id] && !Native.isBusy(H.activeChat[id]), 60000);
const seenAll = async () => (await window.hub.kvGet('fake-seen', [])) || [];
const seen = async (re, engine = null) => (await seenAll()).filter((r) => re.test(r.prompt) && (!engine || r.engine === engine)).at(-1) || null;
const noteOf = (id) => [...(Native.view(id)?.list.querySelectorAll('.msg.note[data-note-id="handoff"]') || [])].at(-1) || null;
const noteText = (id) => (noteOf(id)?.querySelector('.body')?.textContent || '').replace(/\s+/g, ' ').trim();
const wholeBtn = (id) => [...(noteOf(id)?.querySelectorAll('.note-acts button') || [])].find((b) => /whole chat/i.test(b.textContent)) || null;
const sizes = {};
out.sizes = sizes;

// ---------- a long chat: 15 exchanges, ≈ 38k tokens, a goal, decisions, files, an open question ----------
const FIRST_MARK = 'violet-anchor-one';
const LAST_MARK = 'amber-closing-mark';
const FILLER = 'The shot holds for two beats, the camera eases in on the second one, and the glow follows the kick so the motion reads as one gesture on a phone screen. ';
const USERS = [
  'I am making a 30 second motion-design intro for my app Hearth, 9:16 for Shorts. Plan it with me shot by shot.',
  'Let\'s use a pink, cyan and dusk palette for every shot.',
  'Keep the title card in src/intro/title-card.js and the beat map in assets/beats/house-124.json.',
  'The music is a 124 bpm house track; go with a hard cut on every bar for the first eight bars.',
  'Make the logo glow warmer, closer to amber than gold.',
  'Use the font Oxanium for every title.',
  'Put the chat montage in scenes/chat-montage.json, four chats side by side.',
  'Never show real chat names on screen.',
  'Switch to a slow push-in for shot five instead of the whip pan.',
  'The board shot should show three references and a palette swatch row.',
  'I prefer the captions bottom-left, with a safe margin for the Shorts buttons.',
  'Keep the outro at four seconds with the tagline "One window for every AI".',
  'Render a draft to renders/intro-draft-v3.mp4 when the timing is set.',
  'Add a whoosh on the cut into shot nine, quiet, under the kick.',
  'Should the logo land on the drop at 0:16 or on the downbeat after it?',
];
function reply(i) {
  const head = i === 0 ? `Here is the plan, shot by shot (${FIRST_MARK}).` : i === USERS.length - 1 ? `On the drop is stronger (${LAST_MARK}): the logo lands with the kick at 0:16 and the glow peaks one beat later. Do you want the tagline to arrive on the same beat, or one bar later?` : `Done for step ${i + 1}: I changed the plan as you asked.`;
  return `${head}\n\n${FILLER.repeat(66)}`;
}
function longChat(agentId, tag) {
  const now = Date.now();
  const messages = [];
  USERS.forEach((u, i) => { messages.push({ role: 'user', text: u, at: now - (40 - i * 2) * 60000 }); messages.push({ role: 'assistant', text: reply(i), at: now - (39 - i * 2) * 60000 }); });
  return { id: `${agentId}-handoff-${tag}-${now.toString(36)}`, agentId, title: `Hearth intro (${tag})`, createdAt: now - 3600000, updatedAt: now, session: {}, messages };
}
const WHOLE = tok(longChat(claude.id, 'x').messages.map((m) => m.text).join('\n\n'));
sizes.chat = WHOLE;
const briefOk = (p) => ({
  brief: /<handoff_brief>/.test(p),
  goal: /30 second motion-design intro/.test(p),
  files: /src\/intro\/title-card\.js/.test(p) && /assets\/beats\/house-124\.json/.test(p),
  lastExchange: p.includes(USERS.at(-1)) && p.includes(reply(USERS.length - 1).slice(0, 400)),
  noFirstReply: !p.includes(FIRST_MARK),
});
const allOk = (o) => Object.values(o).every(Boolean);
const lineRe = (who) => new RegExp(`^Handed to ${who} with a short brief \\(≈ [\\d.]+k? tokens instead of ≈ [\\d.]+k?\\)`);

await sw({ seenLog: 'on' });
await window.hub.kvSet('fake-seen', []);
step('two AIs to hand between', Boolean(claude && astra));

// ---------- 1. switch AI mid-chat: Continue with Astra ----------
activate(claude.id); await wait(300);
const c1 = longChat(claude.id, 'continue');
Native.adopt(c1); await wait(300);
await Native.continueWith(c1.id, astra.id);
await until(() => chatOf(astra.id)?.continuedFrom, 8000); await wait(800);
const Q1 = 'Pick it up from here: what is the next shot after the title card?';
await Native.send(astra.id, Q1); await wait(300); await idle(astra.id); await wait(400);
const r1 = await seen(/what is the next shot after the title card/, 'codex');
sizes.continueWith = r1 ? tok(r1.prompt) : null;
const ok1 = briefOk(r1?.prompt || '');
step('Continue with Astra: Astra gets the brief, not the chat (goal, files, last exchange word for word)', allOk(ok1), { ok1, tokens: sizes.continueWith });
step('… about a tenth of the whole chat', sizes.continueWith && sizes.continueWith < WHOLE * 0.12, { tokens: sizes.continueWith, whole: WHOLE });
step('… the owner sees one line: "Handed to Astra with a short brief (≈ … instead of ≈ …)"', lineRe(astra.name).test(noteText(astra.id)) && Boolean(wholeBtn(astra.id)), noteText(astra.id));
step('… the original chat stays readable (every message kept)', chatOf(astra.id).messages.filter((m) => m.role !== 'error').length >= c1.messages.length && (await Native.loadChat(c1.id))?.messages.length === c1.messages.length);
await smoke({ shot: '/tmp/handoff-1-continue.png' });

// "Send the whole chat instead": the next message carries every earlier message
if (wholeBtn(astra.id)) await click(wholeBtn(astra.id));
await wait(500);
const Q2 = 'And the shot after that one?';
await Native.send(astra.id, Q2); await wait(300); await idle(astra.id); await wait(400);
const r2 = await seen(/And the shot after that one\?/, 'codex');
sizes.continueWithWhole = r2 ? tok(r2.prompt) : null;
step('Send the whole chat instead: the next message carries the whole chat (its first reply too)', Boolean(r2) && r2.prompt.includes(FIRST_MARK) && /<earlier_conversation>/.test(r2.prompt) && !/<handoff_brief>/.test(r2.prompt), { tokens: sizes.continueWithWhole });

// ---------- 1b. /handoff (the ⚇ menu's handoff) ----------
activate(claude.id); await wait(300);
const c1b = longChat(claude.id, 'slash');
Native.adopt(c1b); await wait(300);
const beforeHand = (await seenAll()).length;
await Commands.tryRun(`/handoff ${astra.name.toLowerCase()}`, claude.id);
await until(() => chatOf(astra.id)?.handoffFrom === c1b.id, 15000); await wait(600);
step('/handoff asks no AI for a summary when the brief made here is good enough (no extra run)', (await seenAll()).length === beforeHand, (await seenAll()).slice(beforeHand).map((r) => r.prompt.slice(0, 80)));
const Q3 = 'Carry on: which transition goes into the outro?';
await Native.send(astra.id, Q3); await wait(300); await idle(astra.id); await wait(400);
const r3 = await seen(/which transition goes into the outro/, 'codex');
sizes.handoffCommand = r3 ? tok(r3.prompt) : null;
const ok3 = briefOk(r3?.prompt || '');
step('/handoff: Astra gets the brief', allOk(ok3), { ok3, tokens: sizes.handoffCommand });

// ---------- 2. offline: Claude busy → Ask Astra instead ----------
await Offline.ready;
Offline._test.scale(0.05);
Offline._test.net(true);
activate(claude.id); await wait(300);
const c2 = longChat(claude.id, 'busy');
Native.adopt(c2); await wait(300);
await sw({ seenLog: 'on', claudeBusy: 'always' });
const Q4 = 'Which shot carries the board references?';
await Native.send(claude.id, Q4);
const errNode = () => [...(Native.view(claude.id)?.list.querySelectorAll('.msg.error') || [])].at(-1) || null;
const netBtn = (re) => [...(errNode()?.querySelectorAll('.net-act') || [])].find((b) => re.test(b.textContent));
await until(() => chatOf(claude.id)?.messages.at(-1)?.role === 'error', 20000); await wait(300);
if (netBtn(/^Cancel$/)) await click(netBtn(/^Cancel$/));
await wait(1200);
await sw({ seenLog: 'on' });
await click(netBtn(/instead/));
await until(() => chatOf(astra.id)?.handoffFrom === c2.id, 10000);
await idle(astra.id); await wait(500);
const r4 = await seen(/Which shot carries the board references\?/, 'codex');
sizes.askInstead = r4 ? tok(r4.prompt) : null;
const ok4 = briefOk(r4?.prompt || '');
step('"Ask Astra instead": Astra gets the brief + the question (goal, files, last exchange)', allOk(ok4) && (r4?.prompt || '').trim().endsWith(Q4), { ok4, tokens: sizes.askInstead });
step('… and the line', lineRe(astra.name).test(noteText(astra.id)), noteText(astra.id));
await smoke({ shot: '/tmp/handoff-2-ask-instead.png' });
Offline._test.net(null);

// ---------- 3. second opinion ----------
activate(claude.id); await wait(300);
const c3 = longChat(claude.id, 'opinion');
Native.adopt(c3); await wait(300);
await Native.secondOpinion(claude.id);
await until(() => chatOf(claude.id)?.messages.at(-1)?.role === 'opinion', 20000); await wait(400);
const r5 = await seen(/second opinion/, 'codex');
sizes.secondOpinion = r5 ? tok(r5.prompt) : null;
const ok5 = briefOk(r5?.prompt || '');
step('Second opinion: Astra judges from the brief (the goal and files, the last exchange word for word)', allOk(ok5), { ok5, tokens: sizes.secondOpinion });
step('… and the line in the chat', lineRe(astra.name).test(noteText(claude.id)) && Boolean(wholeBtn(claude.id)), noteText(claude.id));
const opinions = () => chatOf(claude.id).messages.filter((m) => m.role === 'opinion').length;
if (wholeBtn(claude.id)) await click(wholeBtn(claude.id));
await until(() => Native.isBusy?.(H.activeChat[claude.id]) === false && opinions() === 1 && chatOf(claude.id).messages.at(-1)?.wholeAsked, 20000); await wait(800);
const r6 = (await seenAll()).filter((r) => r.engine === 'codex').at(-1);
sizes.secondOpinionWhole = r6 ? tok(r6.prompt) : null;
step('Send the whole chat instead: the opinion is asked again with the whole chat (and replaces the first)', Boolean(r6) && r6.prompt.includes(FIRST_MARK) && opinions() === 1, { tokens: sizes.secondOpinionWhole, opinions: opinions() });

await sw({});
await window.hub.kvSet('fake-seen', []);
return J.done();
