// 💡 Answered by Hearth (round 45, localanswers): a question about Hearth typed in a chat gets Hearth's own answer in a
// card above the chat box instead of an AI turn; the fake engine must see nothing. Steps: "how do I make a 9:16
// version?" → card with Show me, nothing sent · "where's the spending limit?" → Show me opens ⋯ AI setup on Weekly limit
// · "Ask the AI anyway" sends it as usual (the fake engine answers) and that question stops triggering · a work question
// goes straight through · "what changed today?" → the newest patch notes · the AI setup › Habits switch off → nothing
// intercepted · /hearth-answer.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/localanswers.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const steps = [];
const errors = [];
const step = (name, pass, info) => { steps.push(`${pass ? '✓' : '✖'} ${name}${info ? `: ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`); if (!pass) errors.push(name); };

const claude = H.claudeAgent();
activate(claude.id); await wait(600);
document.querySelectorAll('.qs-card').forEach((c) => c.querySelector('.qs-x, button[title^="Close"]')?.click());
await Lazy.load('localanswers');
Native.newChat(claude.id); await wait(400);
const v = Native.view(claude.id);
let sends = 0;
Native.hooks.send.push(() => { sends += 1; });
const idle = () => until(() => !Native.isAgentBusy(claude.id), 30000);
const ask = async (text) => {
  v.input.value = text; v.input.dispatchEvent(new Event('input', { bubbles: true }));
  v.form.requestSubmit();
  await wait(150);
  await until(() => document.querySelector('.la-card') || sends > before || LocalAnswers.stats.last?.q === text, 6000);
  await wait(250);
};
let before = 0;
const cardNow = () => document.querySelector('.surface.active .la-card');

// 1. the owner's example: a card, Show me, nothing sent
before = sends;
const t0 = performance.now();
await ask('how do I make a 9:16 version?');
let c = cardNow();
step('"how do I make a 9:16 version?" → a card above the chat box', Boolean(c) && c.nextElementSibling === v.form, c?.textContent.slice(0, 160));
step('it says where: All formats, and has Show me + Ask the AI anyway', /All formats/.test(c?.textContent || '') && Boolean(c?.querySelector('.la-show')) && Boolean(c?.querySelector('.la-ask')));
step('the fake engine saw nothing (no send, no user message)', sends === before && !Native.chatOf?.(claude.id)?.messages?.length, { sends: sends - before });
step('the words stay in the box', v.input.value === 'how do I make a 9:16 version?');
step('answered in a blink', LocalAnswers.stats.ms < 1500, `${LocalAnswers.stats.ms} ms (catalogs loaded on the first question; ${Math.round(performance.now() - t0)} ms in all)`);
await smoke({ shot: '/tmp/localanswers-card.png' }).catch(() => {});

// 2. "Ask the AI anyway": sent as usual, and that question stops triggering
c.querySelector('.la-ask').click();
await until(() => sends > before, 4000);
step('"Ask the AI anyway" sends it as usual', sends === before + 1 && !cardNow(), { sends: sends - before });
await idle();
const chat = () => Native.chatOf?.(claude.id) || null;
step('the fake engine answered it', (chat()?.messages || []).some((m) => m.role === 'assistant'));
const learned = await until(() => LocalAnswers.misses.length, 4000);
step('learned: that question is on the misses list', Boolean(learned), LocalAnswers.misses);
before = sends;
await ask('How do I make a 9:16 version');
await until(() => sends > before, 4000);
step('the same question again goes straight to the AI', sends === before + 1 && !cardNow());
await idle();

// 3. a work question goes straight through
before = sends;
await ask('how do I make the logo explode into particles on the drop?');
await until(() => sends > before, 4000);
step('a question about the owner\'s work goes straight to the AI', sends === before + 1 && !cardNow());
await idle();

// 4. Show me: the spending limit → ⋯ AI setup, Spending opened, Weekly limit lit
before = sends;
await ask('where\'s the spending limit?');
c = cardNow();
step('"where\'s the spending limit?" → a card', Boolean(c) && /Weekly limit/.test(c.textContent) && sends === before, c?.textContent.slice(0, 120));
c?.querySelector('.la-show')?.click();
const jumped = await until(() => (AppSearch?.last?.jumped?.id === 'ai:limit' ? AppSearch.last.jumped : null), 8000);
step('Show me opens ⋯ AI setup on Weekly limit', Boolean(jumped?.found), jumped);
step('Show me empties the box (answered) and closes the card', !cardNow() && v.input.value === '' && sends === before);
await smoke({ shot: '/tmp/localanswers-showme.png' }).catch(() => {});
try { Options.hide(); } catch { /* closed */ }
activate(claude.id); await wait(300);

// 5. what changed today → the newest patch notes
before = sends;
await ask('what changed today?');
c = cardNow();
step('"what changed today?" → the newest round from the patch notes', Boolean(c) && /Round \d+/.test(c.textContent) && sends === before, c?.textContent.slice(0, 140));
c?.querySelector('.la-x')?.click();
step('× closes it, the words stay', !cardNow() && v.input.value === 'what changed today?');
v.input.value = ''; v.input.dispatchEvent(new Event('input', { bubbles: true }));

// 6. the setting: AI setup › Habits off → nothing intercepted
if (window.Lazy && !Lazy.isIn('options')) await Lazy.load('options');
Options.open({ agentId: claude.id, show: 'habits' });
const sw = await until(() => Options.sheet?.body.querySelector('[aria-label="Answer questions about Hearth itself, for free"]'), 5000);
step('AI setup › Habits has the switch, on by default', sw?.getAttribute('aria-checked') === 'true' && Boolean(sw.closest('[data-fold="habits"]')));
sw?.click();
await until(() => H.agent(claude.id).localAnswers === false, 3000);
Options.hide(); activate(claude.id); await wait(300);
before = sends;
await ask('where is the weekly limit?');
await until(() => sends > before, 4000);
step('switched off: a Hearth question is sent as usual', sends === before + 1 && !cardNow(), { localAnswers: H.agent(claude.id).localAnswers });
await idle();
Options.open({ agentId: claude.id, show: 'habits' });
const sw2 = await until(() => Options.sheet?.body.querySelector('[aria-label="Answer questions about Hearth itself, for free"]'), 5000);
sw2?.click();
await until(() => H.agent(claude.id).localAnswers !== false, 3000);
Options.hide(); activate(claude.id);
step('switched back on', H.agent(claude.id).localAnswers !== false);

// 7. the chat command, and forgetting the misses
const heard = [];
const said = `${await Commands.tryRun('/hearth-answer where is the spending limit', claude.id, undefined, { source: 'code', say: (t) => heard.push(t), note: (t) => heard.push(t) }) || ''} ${heard.join(' ')}`;
step('/hearth-answer says what Hearth would answer', /Weekly limit/.test(String(said || '')), String(said || '').slice(0, 100));
const n = await LocalAnswers.forget();
step('forget: the misses are gone', n >= 1 && LocalAnswers.misses.length === 0, { forgot: n });

return JSON.stringify({ pass: !errors.length, errors, steps, stats: LocalAnswers.stats }, null, 1);
