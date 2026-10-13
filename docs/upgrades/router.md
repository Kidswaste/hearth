# router (round 28): Smart picks the model and effort per message

Before, **Smart** in ⋯ AI setup → *How hard it thinks* meant one fixed setting: every message went to the chat's
strong model at medium effort, a "thanks!" included. Now Smart decides per message, from local rules (no extra
model call): a lighter model with little thinking for chit-chat and short questions, the chat's own model with more
thinking for code, builds and analyses. It is for that one message only: the chat's saved model never changes.
**Quick** and **Deep** stay fixed, as before.

Files: `router.js` (the rules + the hooks), `router.css`, `dev/router-test.js` (the rules, and the cost estimate
below), `dev/checks/router.js` (fake engines: what each run REALLY got). Small hooks elsewhere: an `options` hook in
`native.js` send() (3 lines), the Smart hint in `options.js`, one `<script>` + one `<link>` in `index.html`, a
`runinfo` keyword in `dev/fake-claude.js` / `dev/fake-codex.js`, the `router` group in `dev/run-checks.js`.

## What you see
1. **Smart routes each message**: ⋯ AI setup → How hard it thinks → Smart (the default). Works for Claude and Astra chats, docked director chats included.
2. **The pick, small on the reply**: "Haiku · low", "Sonnet · low", "Opus · high"… next to the token bar.
3. **Hover it: why** ("chit-chat", "a short question", "code to write, fix or explain", "a build in the Lab", "an analysis or a plan", "big files attached"…).
4. **One click: ask again, thinking harder**: the last reply again with the chat's own (strong) model and high effort.
5. **Harder again**: clicking the pick on a reply that was already on high asks again with xhigh.
6. A reply asked again harder is marked in the accent colour.
7. **AI setup explains Smart** in one line under the Quick / Smart / Deep buttons (only while Smart is on); Smart's tooltip says it picks per message.
8. `/route`: what the last reply got and why · `/route harder`: ask again, thinking harder · `/route test <words>`: what Smart would pick for these words in this chat (power users; everything is reachable without it).

## The rules (local, instant, no tokens)
9. **Chit-chat** (hi, thanks, ok cool, nice…, up to 6 words, no question) → Claude: Haiku · low; Astra: Luna · minimal.
10. **A short question** (what / how / is… or ending with "?", up to 25 words) → Claude: Sonnet · low; Astra: Sol · low.
11. **A small ask** (up to 12 words, nothing to build) → Sonnet · low / Sol · low.
12. **"quick", "briefly", "tl;dr", "one line"** lowers a make or a question to the light tier (not when there is code).
13. **Something to make, some code, files, a picture, a longer message** → the chat's own model · medium (Smart as before).
14. **Code to write, fix or explain** (a code block, a stack trace, file names, "function / shader / GLSL / bug…" with a build verb) → own model · high.
15. **A build in the Lab** (a director chat with a build verb: "add a tunnel of rings") → own model · high.
16. **An analysis or a plan** (compare, trade-offs, review, plan, design, why does…, 8+ words) → own model · high.
17. **"think carefully", "thoroughly", "take your time", "ultrathink"** → own model · high.
18. **Very long messages** (3,000+ characters) and **big attachments** (8k+ tokens of files) → own model · high.
19. **Pictures** never go to the lightest model (at least Sonnet · low; Sonnet · medium with a longer ask).
20. **Lab director chats** never go to the lightest model (their tools need a steady model): at least Sonnet · low.
21. **A go-ahead follows the conversation**: "yes do it", "go ahead", "continue" after a plan get the same tier as the reply before (it is about to build what it planned).
22. **A big context never steps down**: models and efforts each keep their own prompt cache, so once a chat's context passes 20k tokens a lighter pick would re-read it all uncached and cost more than it saves; the pick stays where it was (the why says so). It can still step up.
23. **Never routed away from your pick**: a model you chose for the chat (header model menu, Retry with another model) stays; Smart then only picks the effort. An effort you set for the chat (Astra's effort, a mission's one-off model / effort) stays too; with both set, nothing is routed and no pick is shown.
24. **Never "upgrades" a cheaper chat**: routing only ever picks a model cheaper than the chat's own (an agent on Sonnet is never sent to Opus); unknown models count as the strongest.
25. **Compacting and summaries are never routed** (a summary's quality decides every later message).
26. **The meter prices the model that answered**: a routed reply records its model, so cost and the per-model usage tables are right.

## Estimate: tokens and cost on a typical mix
`node dev/router-test.js` prices a typical mix of the owner's chat messages (20% chit-chat, 25% short questions, 15%
small asks, 20% everyday makes, 12% code fixes, 8% analyses; 6–12k tokens of context each) at Anthropic's list prices
(Haiku $0.10/$0.50, Sonnet $2/$10, Opus $4/$20 per million tokens in/out), with a rough thinking multiplier per effort
(low ×0.5, medium ×1, high ×1.7: an assumption, not measured):

| per 1,000 messages | cost | vs |
|---|---|---|
| Smart before (strong model, medium, every message) | $44.71 | |
| Deep (strong model, high, every message; the owner's directors) | $54.17 | |
| **Smart routed** | **$37.08** | **−17%** vs Smart before, **−32%** vs Deep |

Where it comes from: the 60% of messages that are chit-chat, short questions and small asks cost 60–98% less (their
context is read by a model 2–40× cheaper). Output + thinking tokens go UP about 21% on that mix, because code,
builds and analyses now think on high: that is the quality half of the deal, and "Ask again, thinking harder" is a
click away instead of a re-typed message. With most context coming from the prompt cache (real chats), the saving on
the light tiers is smaller in dollars, and rule 22 keeps long chats from losing their cache.

## Tested
- `node dev/router-test.js`: 39 checks of the rules (kinds of messages, attachments, the Lab, go-aheads, the cache rule, your picks, Astra) + the estimate.
- `node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/router.js` (`sh dev/run-checks.sh router`): the fake engines report the model and effort each run really got: thanks → haiku low, a short question → sonnet low, code → claude-opus-5-5 high, the click → claude-opus-5-5 xhigh (same message count: the reply is replaced), a chat on Sonnet stays sonnet (effort routed), Deep / Quick not routed, Astra thanks → gpt-6-luna minimal, Astra code → gpt-6-astra high, AI setup's line, `/route test`.
