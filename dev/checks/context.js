// Context (round 24): @ references in the chat box (the menu, the cost on the chip, the exact payload the engine gets),
// memory sent only when a message is about it (🧠 and its running count), what each message sent (the bar under a
// reply, /context and its cheapest fix), and the fresh start from a free, editable summary (what it really saved).
// The fake engine's "echo" replies with the exact prompt it got.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/context.js --shot /tmp/context.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const A = H.claudeAgent();
const v = () => Native.view(A.id);
const reply = async (text) => { await Native.send(A.id, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[A.id]), 60000); await wait(250); return Native.current(A.id).messages.at(-1); };
let said = '';
const run = async (line) => { said = ''; await Commands.tryRun(line, A.id, null, { say: (t) => { said = String(t); }, note: (t) => { said = String(t); } }); return said; };
const type = (text) => { const ta = v().input; ta.focus(); ta.value = text; ta.setSelectionRange(text.length, text.length); ta.dispatchEvent(new Event('input')); };
const key = (k) => v().input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

await wait(1000);
activate(A.id);
await until(() => Native.hasView(A.id));
await Lazy.load('context');
ok(typeof ContextCore !== 'undefined' && typeof ChatRefs !== 'undefined' && typeof ChatMemory !== 'undefined' && typeof ChatCost !== 'undefined' && typeof ChatFresh !== 'undefined', 'the context group loads');
ok(['ref', 'memory', 'fresh', 'context'].every((n) => Commands.get(n)), 'commands /ref /memory /fresh /context');
out.dups = Commands.duplicates();
ok(!out.dups.some((d) => ['ref', 'refs', 'fresh', 'memory', 'context'].includes(d.name)), 'no duplicate names');

// ---------- a first chat to point at ----------
Native.newChat(A.id);
await reply('echo We are making a neon orb visual. Let\'s use pink and cyan for the orb.');
await reply('echo I created a layer "Orb" in orb.js and the kick drives its scale.');
const first = Native.current(A.id);
out.firstInput = first.messages.at(-1).usage?.input;
ok(!/\[Memory|<file name="@/.test(first.messages.at(-1).text), 'a plain message carries nothing extra');

// ---------- what each message sent: the bar, /context ----------
const last = await until(() => Native.current(A.id).messages.at(-1).ctx && Native.current(A.id).messages.at(-1), 4000);
ok(last?.ctx && last.ctx.s > 0 && Array.isArray(last.ctx.t), `a reply knows what its message sent (${JSON.stringify(last?.ctx)})`);
ok(await until(() => v().list.querySelector('.msg.assistant .ctx-bd')), 'the bar under the reply');
out.ctxTitle = v().list.querySelector('.msg.assistant .ctx-bd')?.title;
ok(/Tools: .*System prompt: /s.test(out.ctxTitle || ''), 'its tooltip names the tools and the system prompt');
out.context = await run('/context');
ok(/The last message was made of/.test(out.context) && /System prompt/.test(out.context), '/context shows the breakdown');
// a chat with Board tools it never uses: the cheapest fix names them
A.boardTools = true;
const fx = ChatCost.fixesFor({ messages: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'x' })) }, { ...last.ctx, t: [['boardTools', 1002], ...last.ctx.t] });
delete A.boardTools;
ok(fx[0]?.cmd === '/board-tools off' && /Board tools/.test(fx[0].text), `the cheapest fix names unused tools (${fx[0]?.text})`);

// ---------- @ references: the menu, the cost on the chip, the exact payload ----------
Native.newChat(A.id);
await wait(200);
type('@');
const menu = await until(() => v().form.querySelector('.at-menu'));
out.kinds = [...(menu?.querySelectorAll('.slash-item b') || [])].map((b) => b.textContent);
ok(['@chat', '@scene', '@board', '@file', '@render', '@project'].every((k) => out.kinds.includes(k)), `@ lists the kinds (${out.kinds})`);
type('@ch'); await wait(150);
key('Enter');
ok(await until(() => v().input.value === '@chat:'), `Enter on a kind opens its choices (${v().input.value})`);
const row = await until(() => [...v().form.querySelectorAll('.at-menu .slash-item')].find((r) => /neon orb/i.test(r.textContent) && /tokens/.test(r.textContent)), 6000);
out.chatRow = row?.textContent;
ok(row, `the other chat is offered with its cost (${out.chatRow})`);
key('Enter');
const att = await until(() => v().attachments.find((a) => a.ref === 'chat'));
ok(att && att.tokens === ContextCore.tok(ContextCore.block(att.name, att.content)), 'the chip\'s cost is the exact text\'s');
ok(v().input.value === '', 'the @ text left the box');
ok(/tok/.test(v().chips.textContent), `the chip shows the cost (${v().chips.textContent})`);
ok(!/We are making a neon orb visual\. Let's use pink and cyan for the orb\.\n\nAssistant/.test(att?.content || '') && /Goal: /.test(att?.content || ''), 'a summary, not the history');
const sentRef = await reply('echo use that chat');
const user = Native.current(A.id).messages.at(-2);
ok(sentRef.text.includes(`<file name="${att?.name}">\n${att?.content}\n</file>`), 'the engine got exactly the attached text');
ok(user.attachments?.[0]?.tokens === att?.tokens, 'the message keeps the reference\'s cost');
ok(!/\[Memory/.test(sentRef.text), 'and nothing else');
out.refTokens = att?.tokens;
// /ref by command
out.refCmd = await run('/ref');
ok(/@scene/.test(out.refCmd) && /cost/.test(out.refCmd), '/ref explains the kinds');

// ---------- memory only when relevant ----------
out.pin = await run('/memory pin Kick drives the orb scale');
ok(/Pinned for this chat/.test(out.pin), `/memory pin (${out.pin})`);
const plain2 = await reply('echo hello there');
ok(!/\[Memory/.test(plain2.text), 'a message about something else carries no memory');
const about = await reply('echo make the kick hit harder');
ok(about.text.includes('[Memory, approved by the user: Kick drives the orb scale]'), 'a message about it carries the fact');
const mu = Native.current(A.id).messages.at(-2);
ok(mu.memTokens > 0 && mu.memSent?.length === 1, 'the message keeps what memory it carried');
// (round 31, tokensaver) it's in the chat's history now: never sent twice
const again = await reply('echo the kick once more');
ok(!/\[Memory/.test(again.text), 'a fact already sent in this chat is not sent again');
ok(await until(() => [...v().list.querySelectorAll('.msg.user .mem-sent')].length === 1), 'one 🧠 mark, on that message');
out.here = await run('/memory here');
ok(/Kick drives the orb scale/.test(out.here) && /1 message carried memory/.test(out.here), `/memory here: the facts and the running count (${out.here.slice(0, 200)})`);
await run('/memory forget kick');
const after = await reply('echo the kick again');
ok(!/\[Memory/.test(after.text), '/memory forget: gone');
// <remember>: "This chat only" moves it out of the always-on memory
const rem = await reply('remember this please');
await wait(300);
const scopeBtn = [...v().list.querySelectorAll('.memory-chip .mem-scope')].find((b) => /This chat only/.test(b.textContent));
ok(rem.remembered?.length && scopeBtn, 'a <remember> chip offers "This chat only"');
if (scopeBtn) { scopeBtn.click(); await wait(600); }
const mem = await window.hub.getMemory();
ok(rem.remembered?.length && !String(mem.agents?.[A.id] || '').includes(rem.remembered[0]) && ChatMemory.factsOf('chat', H.activeChat[A.id]).some((f) => f.t === rem.remembered[0]), 'moved from the agent\'s memory to this chat\'s');

// ---------- fresh start from a free, editable summary ----------
const old = Native.current(A.id);
const before = old.messages.filter((m) => m.usage).at(-1).usage.input;
const p = ChatFresh.start(A.id);
const dlg = await until(() => [...document.querySelectorAll('dialog[open]')].find((d) => /Fresh start/.test(d.textContent)));
const ta = dlg?.querySelector('textarea');
out.freshLabel = dlg?.querySelector('label')?.textContent.slice(0, 200);
ok(ta && /Goal: /.test(ta.value), 'the summary is shown first');
ok(/Next message ≈ .* tokens instead of /.test(out.freshLabel || ''), `with what the next message will cost (${out.freshLabel})`);
if (ta) { ta.value = `${ta.value}\nOpen:\n- EDITED BY THE OWNER`; ta.dispatchEvent(new Event('input')); }
[...(dlg?.querySelectorAll('button') || [])].find((b) => /Start fresh/.test(b.textContent))?.click();
const fresh = await p;
ok(fresh && H.activeChat[A.id] === fresh.id && fresh.messages[0].freshSummary, 'a new chat opens with the summary');
ok(/EDITED BY THE OWNER/.test(fresh?.messages[0].text || ''), 'the edit is what it carries');
ok(await until(() => v().list.querySelector('.msg.fresh-summary .msg-act')), 'the summary has ✎ Edit');
ok(ChatMemory.factsOf('chat', fresh?.id).length === ChatMemory.factsOf('chat', old.id).length, 'the chat\'s pinned facts come along');
const next = await reply('echo carry on');
ok(next.text.includes('EDITED BY THE OWNER') && !next.text.includes('echo hello there'), 'the engine gets the summary, not the history');
const fr = Native.current(A.id).fresh;
out.fresh = { before, after: fr?.after, carried: fr?.carried };
ok(fr?.after && fr.after < before, `measured: ${fr?.after} tokens instead of ${before}`);
ok(Native.current(A.id).messages.at(-1).ctx?.h != null, 'and its breakdown');

await wait(300);
return JSON.stringify({ ok: !problems.length, problems, ...out }, null, 1);
