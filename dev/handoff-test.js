#!/usr/bin/env node
// (round 42, handoff) Lean handoffs, the pure part (handoff-core.js): the brief a receiving AI gets instead of the whole
// chat (goal, decisions, files, where we are, the open question, the last exchange word for word), its size against the
// whole chat and against the old paths, the whole chat for "Send the whole chat instead", when the cheapest model is
// worth asking, the owner's line, and chat_do earlier. Run: node dev/handoff-test.js
const path = require('path');
const HC = require(path.join(__dirname, '..', 'handoff-core.js'));

const fails = [];
const check = (ok, what, info) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) { fails.push(what); if (info !== undefined) console.log('   ', typeof info === 'string' ? info.slice(0, 600) : JSON.stringify(info).slice(0, 600)); } };
const tok = (s) => Math.ceil(String(s || '').length / 4);

// the 15-exchange chat of dev/checks/handoff.js (≈ 38k tokens)
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
const LAST = 'On the drop is stronger (amber-closing-mark): the logo lands with the kick at 0:16 and the glow peaks one beat later. Do you want the tagline to arrive on the same beat, or one bar later?';
const reply = (i) => `${i === 0 ? 'Here is the plan, shot by shot (violet-anchor-one).' : i === USERS.length - 1 ? LAST : `Done for step ${i + 1}: I changed the plan as you asked.`}\n\n${FILLER.repeat(66)}`;
const chat = () => USERS.flatMap((u, i) => [{ role: 'user', text: u }, { role: 'assistant', text: reply(i) }]);

// ---------- the brief ----------
const ms = chat();
const b = HC.build(ms, { from: 'Claude' });
console.log(`brief ${b.tokens} tokens · whole chat ${b.whole} tokens`);
check(b.whole > 30000 && b.whole < 45000, 'the test chat is ≈ 38k tokens', b.whole);
check(b.tokens < 2500, 'the brief is about 2k tokens', b.tokens);
check(b.tokens < b.whole * 0.08, '… under 8 % of the whole chat', { brief: b.tokens, whole: b.whole });
check(/^\[You're taking over this conversation from Claude\./.test(b.text) && /<handoff_brief>[\s\S]*<\/handoff_brief>$/.test(b.text), 'a one-line head, then the brief in its own tags (the new message goes after it)');
check(/^Goal: I am making a 30 second motion-design intro/m.test(b.text), 'goal: the first message');
check(/Decisions:\n- /.test(b.text) && /- Switch to a slow push-in for shot five/.test(b.text) && /- Keep the outro at four seconds/.test(b.text), 'decisions (the newest), as autocompact\'s shape ("Decisions:" + "- " lines)');
for (const f of ['src/intro/title-card.js', 'assets/beats/house-124.json', 'scenes/chat-montage.json', 'renders/intro-draft-v3.mp4']) check(b.text.includes(f), `file listed: ${f}`);
check(b.files.length === 4, 'files touched: the four paths, once each', b.files);
check(/Open question \(Claude asked\): Do you want the tagline to arrive on the same beat, or one bar later\?/.test(b.text), 'the open question: the last question the reply asked');
check(b.text.includes(`User: ${USERS.at(-1)}`), 'the last exchange: the user\'s message word for word');
check(b.text.includes(`Claude: ${reply(USERS.length - 1).slice(0, 2000)}`), '… and the reply word for word (its first 2,000 characters at least)');
check(!b.text.includes('violet-anchor-one') && !b.text.includes('Done for step 7'), 'nothing else of the older replies');
check(/chat_do \{op: "earlier"/.test(HC.build(ms, { from: 'Claude', chatTools: true }).text) && /Ask the user: Hearth can send the whole chat/.test(b.text), 'ask for more: chat_do earlier with the chat tools, else ask the user');
const b2 = HC.build(ms, { from: 'Claude' });
check(b2.text === b.text, 'byte-stable: the same chat gives the same brief (no time, no ids)');
check(!/\d{4}-\d\d-\d\d|\d\d:\d\d:\d\d/.test(b.text), '… no dates or clock times in it');

// ---------- the last exchange ----------
const huge = [...ms.slice(0, -2), { role: 'user', text: `Look at this paste: ${'x'.repeat(20000)} end-of-paste` }, { role: 'assistant', text: `${'y'.repeat(30000)} end-of-reply?` }];
const bh = HC.build(huge, { from: 'Claude' });
check(bh.tokens < 3200 && /end-of-paste/.test(bh.text) && /end-of-reply/.test(bh.text) && /\[…\]/.test(bh.text), 'a huge paste in the last exchange is clipped in the middle (start and end kept)', bh.tokens);
const tailUser = [...ms, { role: 'user', text: 'and the outro?' }];
const lx = HC.lastExchange(tailUser);
check(lx.user.text === 'and the outro?' && !lx.reply, 'last exchange: a user message still unanswered (no reply yet)');
check(HC.lastExchange([{ role: 'error', text: 'x' }, ...ms.slice(0, 2), { role: 'opinion', from: 'Astra', text: 'meh' }]).reply.text === reply(0), 'errors are skipped; the reply is the one after the user\'s message');
const one = HC.build(ms.slice(0, 2), { from: 'Claude' });
check(!/Goal:/.test(one.text) && /Last exchange, word for word/.test(one.text), 'a one-exchange chat: no summary, the exchange only');

// ---------- size against the old paths (characters / 4, like the fakes) ----------
const old = {
  continueWith: tok(ms.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n\n').slice(-24000)),
  askInstead: tok(ms.slice(-6).map((m) => `**${m.role === 'user' ? 'User' : 'Claude'}:** ${m.text.slice(0, 600)}`).join('\n\n')),
};
console.log(`old: Continue with ≈ ${old.continueWith} (the newest 24k characters: no goal) · Ask Astra instead ≈ ${old.askInstead} (6 lines of 600 characters)`);
check(b.tokens < old.continueWith * 0.4, 'smaller than what Continue with sent (the newest 24k characters)', { brief: b.tokens, old: old.continueWith });
check(!old.continueWith || !ms.map((m) => m.text).join('\n\n').slice(-24000).includes(USERS[0]), '(the old path had lost the goal; the brief keeps it)');

// ---------- the whole chat ----------
const w = HC.wholeText(ms, { name: 'Claude' });
check(w.includes('violet-anchor-one') && w.includes(USERS[0]) && w.includes(LAST) && w.startsWith('User: I am making'), 'the whole chat: every message, in order');
const big = Array.from({ length: 120 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `${i === 0 ? 'GOAL-LINE ' : ''}${FILLER.repeat(12)}` }));
const wb = HC.wholeText(big);
check(wb.length <= HC.WHOLE_CHARS + 20 && wb.startsWith('User: GOAL-LINE') && /\[…\]/.test(wb), 'a chat over ≈ 50k tokens: the goal + the newest part', wb.length);
check(HC.wholeTokens(ms) === b.whole, 'the line\'s "instead of" is the whole chat\'s size');

// ---------- the cheapest model: only when the brief is weak and the chat is big ----------
const vague = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? `${FILLER.repeat(30)}` : 'hmm ok go on with it' }));
const bv = HC.build(vague, { from: 'Claude' });
check(bv.weak && bv.big && HC.wantsModel(bv), 'weak (nothing but a goal) on a big chat: worth the cheapest model', { weak: bv.weak, big: bv.big, older: bv.older });
check(!HC.wantsModel(b), 'a good local brief: no model run');
check(!HC.wantsModel(HC.build(vague.slice(0, 4), { from: 'Claude' })), 'a weak brief on a small chat: no model run');
check(/^Summarize this conversation so it can continue without its history/.test(HC.modelPrompt(vague)) && !HC.modelPrompt(ms).includes(LAST), 'the model reads autocompact\'s prompt with the older part only (the last exchange goes word for word anyway)');
const shaped = 'Goal: an intro video\nDecisions:\n- pink palette\nWhere we stopped: shot 9';
const bs = HC.build(vague, { from: 'Claude', summary: shaped });
check(bs.text.includes(shaped) && !bs.weak, 'a model summary replaces the local one in the brief');

// ---------- the line, the opinion head ----------
check(HC.line('Astra', { tokens: 1840, whole: 38200 }) === 'Handed to Astra with a short brief (≈ 1.8k tokens instead of ≈ 38k)', 'the line', HC.line('Astra', { tokens: 1840, whole: 38200 }));
check(/summary by the lightest model, ≈ 9\.2k tokens$/.test(HC.line('Astra', { tokens: 1840, whole: 38200 }, { by: 9200 })), 'the line says what a model summary cost');
check(HC.line('Astra', { tokens: 1840, whole: 38200, wholeSent: true }) === 'Handed to Astra with the whole chat (≈ 38k tokens)', 'after "Send the whole chat instead"');
const op = HC.build(ms, { from: 'Claude', kind: 'opinion' });
check(/^\[A short brief made by Hearth stands in for the user's chat with Claude/.test(op.text) && !/taking over|Need an earlier/.test(op.text), 'a second opinion\'s brief: no taking over, no ask-for-more line');

// ---------- chat_do earlier ----------
const e1 = HC.earlier(ms, { query: 'whoosh shot nine' });
check(/Add a whoosh on the cut into shot nine/.test(e1) && e1.length <= 6200, 'earlier: the messages that match the words', e1.slice(0, 200));
check(/violet-anchor-one/.test(HC.earlier(ms, { last: 30 }).slice(0, 0) + HC.earlier(ms.slice(0, 2), { last: 2 })), 'earlier: the newest N');
check(/^Nothing earlier mentions/.test(HC.earlier(ms, { query: 'zebra xylophone' })) && /^Give query/.test(HC.earlier(ms, {})), 'earlier: nothing found / nothing asked');

console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
