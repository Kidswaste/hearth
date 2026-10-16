// Lighter history (round 50, historylean): after a break, a long chat goes on in a fresh session with a lighter history
// instead of re-reading its whole old session at full price. Fake engines; their `seenLog` switch writes what each run
// was really sent (data/kv/fake-seen.json), and "toolbytes:N" in a message makes the fake keep N characters of tool
// results in its session (so the session grows like a real director / coding chat).
//   1. Claude: 6 messages with tool results (≈ 120k tokens re-read), a warm message resumes the session, then a break
//      past the cache's life (the fake reports a 5-minute cache, as on an API key): the next message starts a fresh
//      session with the lighter history (budget: ≤ 2,500 tokens sent, ≤ 30 % of the last re-read); the line; the reply
//      after it resumes the new session; /history-lean; "Keep the full history here"; chat_do earlier.
//   2. Astra: the same after a 20-minute break.
//   3. The cost coach (and so the Usage window's How to save) counts the fresh starts.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/historylean.js
const { step, wait, until, click, out } = J;
const sw = (o) => window.hub.kvSet('fake-switches', o);
const claude = H.claudeAgent();
const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const tok = (s) => Math.ceil(String(s || '').length / 4);
const chatOf = (id) => Native.chatOf(id);
const idle = (id) => until(() => H.activeChat[id] && !Native.isBusy(H.activeChat[id]), 60000);
const seenAll = async () => (await window.hub.kvGet('fake-seen', [])) || [];
const seen = async (re, engine = null) => (await seenAll()).filter((r) => re.test(r.prompt) && (!engine || r.engine === engine)).at(-1) || null;
const noteOf = (id) => [...(Native.view(id)?.list.querySelectorAll('.msg.note[data-note-id="historylean"]') || [])].at(-1) || null;
const lastReply = (id) => [...(chatOf(id)?.messages || [])].reverse().find((m) => m.role === 'assistant' && m.usage) || null;
const back = (id, ms) => { for (const m of chatOf(id).messages) m.at = (m.at || Date.now()) - ms; };
const sizes = {};
out.sizes = sizes;
const BUDGET = { sent: 2500, share: 0.3 };

await sw({ seenLog: 'on' });
await window.hub.kvSet('fake-seen', []);
await Lazy.load('historylean');
step('the lighter history is loaded (after the first screen), and the two AIs', typeof HistoryLean !== 'undefined' && Boolean(claude && astra));

async function grow(agent, n, tag) {
  activate(agent.id); await wait(300);
  Native.newChat(agent.id); await wait(300);
  for (let i = 0; i < n; i++) { await Native.send(agent.id, `tool toolbytes:80000 ${tag} step ${i}: warm the glow a little and look again`); await wait(200); await idle(agent.id); await wait(150); }
}

// ---------- 1. Claude ----------
await grow(claude, 6, 'claude-grow');
const c = chatOf(claude.id);
const before = lastReply(claude.id)?.usage?.input || 0;
sizes.claudeBefore = before;
step('a long Claude chat: its last reply re-read ≈ 120k tokens (6 messages with tool results)', before > 100000, { before });
step('… Claude Code\'s cache life is read from the reply (5 min on an API key)', lastReply(claude.id)?.usage?.ttl === '5m', lastReply(claude.id)?.usage);
const sess1 = c.session?.id;
await Native.send(claude.id, 'a quick warm question: is the glow fine?'); await wait(200); await idle(claude.id); await wait(200);
const warm = await seen(/a quick warm question/, 'claude');
step('a message while the cache is warm resumes the session (nothing re-sent)', Boolean(warm) && !/<earlier_conversation>/.test(warm.prompt) && chatOf(claude.id).session?.id === sess1 && !chatOf(claude.id).messages.at(-2).histLean);
// the break: 10 minutes, past the 5-minute cache
back(claude.id, 10 * 60000);
const plan = HistoryLean.plan(chatOf(claude.id));
step('/history-lean\'s plan: a fresh start with the lighter history', plan?.rebase === true, { why: plan?.why, before: plan?.before, after: plan?.after });
const said = [];
await Commands.tryRun('/history-lean', claude.id, null, { say: (t) => said.push(String(t)), note: (t) => said.push(String(t)) });
step('/history-lean says what the next message would do', /Next message: a fresh start with the lighter history/.test(said.join('\n')), said.join(' | ').slice(0, 300));
const reread = lastReply(claude.id).usage.input;
await Native.send(claude.id, 'after the break: one more change, make the tunnel slower'); await wait(200); await idle(claude.id); await wait(300);
const r1 = await seen(/after the break: one more change/, 'claude');
const asked = chatOf(claude.id).messages.filter((m) => m.role === 'user').at(-1);
sizes.claudeSent = r1 ? tok(r1.prompt) : null;
sizes.claudeAfter = lastReply(claude.id)?.usage?.input || 0;
step('after the break: the message carries the lighter history in a fresh session', Boolean(r1) && /^We continue this chat in a fresh session to save tokens/.test(r1.prompt) && /<earlier_conversation>/.test(r1.prompt) && chatOf(claude.id).session?.id && chatOf(claude.id).session.id !== sess1, { sent: sizes.claudeSent });
step('… tool results as stubs, every message\'s words kept', /\[used [^\]]*; results not sent again\]/.test(r1?.prompt || '') && /claude-grow step 0/.test(r1?.prompt || '') && /a quick warm question/.test(r1?.prompt || ''));
step(`… budget: ≤ ${BUDGET.sent} tokens sent, the reply re-read ≤ ${BUDGET.share * 100} % of before`, sizes.claudeSent <= BUDGET.sent && sizes.claudeAfter <= reread * BUDGET.share, { sent: sizes.claudeSent, after: sizes.claudeAfter, before: reread });
step('… the message is marked (from → to) for the token line and the cost coach', asked?.histLean?.from > 0 && asked.histLean.to < asked.histLean.from, asked?.histLean);
step('… one quiet line: "Fresh start after the break" with "Keep the full history here"', /Fresh start after the break/.test(noteOf(claude.id)?.textContent || '') && /Keep the full history here/.test(noteOf(claude.id)?.textContent || ''), (noteOf(claude.id)?.textContent || '').slice(0, 200));
step('… nothing in the chat changed (every message still there)', chatOf(claude.id).messages.filter((m) => m.role === 'user').length === 8);
await smoke({ shot: '/tmp/historylean-1-claude.png' });
const sess2 = chatOf(claude.id).session.id;
await Native.send(claude.id, 'and the next one, right after'); await wait(200); await idle(claude.id); await wait(200);
const r2 = await seen(/and the next one, right after/, 'claude');
step('the message after it resumes the new session (nothing re-sent)', Boolean(r2) && !/<earlier_conversation>/.test(r2.prompt) && chatOf(claude.id).session.id === sess2);
const early = await Handoff.earlierTool({ agentId: claude.id, query: 'claude-grow step 3 glow' });
step('chat_do earlier finds an earlier message word for word', early?.ok && /claude-grow step 3/.test(early.value), early);
// "Keep the full history here": the next break resumes the whole session
const keep = [...(noteOf(claude.id)?.querySelectorAll('.note-acts button') || [])].find((b) => /Keep the full history/.test(b.textContent));
if (keep) await click(keep);
await wait(300);
step('"Keep the full history here" turns it off for this chat', chatOf(claude.id).leanOff === true);
back(claude.id, 10 * 60000);
await Native.send(claude.id, 'another break, but keep it whole'); await wait(200); await idle(claude.id); await wait(200);
const r3 = await seen(/another break, but keep it whole/, 'claude');
step('… the next break resumes the session', Boolean(r3) && !/<earlier_conversation>/.test(r3.prompt) && chatOf(claude.id).session.id === sess2);

// ---------- 2. Astra ----------
await grow(astra, 5, 'astra-grow');
const a0 = chatOf(astra.id).session?.id;
const aBefore = lastReply(astra.id)?.usage?.input || 0;
back(astra.id, 20 * 60000);
await Native.send(astra.id, 'astra after the break: tighten the timing'); await wait(200); await idle(astra.id); await wait(300);
const ra = await seen(/astra after the break: tighten the timing/, 'codex');
sizes.astraBefore = aBefore; sizes.astraSent = ra ? tok(ra.prompt) : null; sizes.astraAfter = lastReply(astra.id)?.usage?.input || 0;
step('Astra after a 20-minute break: a fresh thread with the lighter history', Boolean(ra) && /^We continue this chat in a fresh session/.test(ra.prompt) && chatOf(astra.id).session?.id !== a0, { sent: sizes.astraSent });
step(`… budget: ≤ ${BUDGET.sent} tokens sent, ≤ ${BUDGET.share * 100} % of before`, sizes.astraSent <= BUDGET.sent && sizes.astraAfter <= aBefore * BUDGET.share, { before: aBefore, after: sizes.astraAfter });
step('… without the chat tools, it says to ask (no chat_do)', /ask me if you need an earlier detail/.test(ra?.prompt || '') || /chat_do/.test(ra?.prompt || ''));

// ---------- 3. the cost coach / How to save ----------
let res = null;
try { await Lazy.load('costcoach'); res = await CostCoach.compute({ fresh: true }); } catch (err) { res = { error: err.message }; }
const line = (res?.lean || []).find((l) => /^histlean:/.test(l.id));
step('the cost coach counts the fresh starts (the Usage window\'s How to save shows it)', Boolean(line) && /lighter history after breaks \(\d+ fresh start/.test(line.text), line || res?.error || (res?.lean || []).map((l) => l.id));

await sw({});
await window.hub.kvSet('fake-seen', []);
return J.done();
